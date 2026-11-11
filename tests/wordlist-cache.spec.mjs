// Phase 4 詞庫載入：慢速載入與 AI 建議的競態、版本更新整套換新、非 200 留記錄
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage, settle, CONTEXT_OPTS, routeExternal, collectErrors, stubManifest, stubPack, packEntry, stubSlangEmpty } from './helpers.mjs';

const clickGenerate = page => page.evaluate(() => document.getElementById('generateBtn').click());

// 閘門：詞庫分段請求卡在閘門後面，測試決定何時放行；同時收集分段網址與 /ai 的 prompt
function makeGate() {
    let release;
    const gate = new Promise(r => { release = r; });
    const chunkUrls = [];
    const aiPrompts = [];
    const beforeGoto = async ({ context, page }) => {
        page.on('request', r => {
            const u = new URL(r.url());
            if (/\/data\/wordlist-c0\d\.json$/.test(u.pathname)) chunkUrls.push(r.url());
            if (u.pathname === '/ai') aiPrompts.push(JSON.parse(r.postData()).prompt);
        });
        await context.route(/\/data\/wordlist-c0\d\.json/, async r => { await gate; await r.continue(); });
    };
    return { release, chunkUrls, aiPrompts, beforeGoto };
}

test('慢速：詞庫還沒載完就按 AI 建議，會等詞庫、不誤觸造詞', async ({ browser }) => {
    test.setTimeout(60_000);
    const g = makeGate();
    const { context, page, errors, offOrigin } = await bootPage(browser, { waitWordlist: false, aiReply: '', beforeGoto: g.beforeGoto });
    try {
        await page.fill('#searchInput', '安');
        await settle(page);
        await clickGenerate(page);
        await expect(page.locator('#aiLoading')).toContainText('詞庫載入中');
        expect(g.aiPrompts, '等詞庫期間沒有任何 /ai 請求').toHaveLength(0);
        g.release();
        await expect(page.locator('#aiWordsContainer .ai-word-card')).toHaveCount(24);
        expect(g.aiPrompts, '只有挑詞一次').toHaveLength(1);
        expect(g.aiPrompts[0]).not.toContain('直接生成');
        expect(g.chunkUrls, '按鈕與頁面共用同一次載入').toHaveLength(10);
        await expect(page.locator('#generateBtn')).toBeEnabled();
        expect(errors).toEqual([]);
        expect(offOrigin).toEqual([]);
    } finally { await context.close(); }
});

test('慢速：等詞庫期間換了搜尋，那次按鈕動作作廢', async ({ browser }) => {
    test.setTimeout(60_000);
    const g = makeGate();
    const { context, page, errors } = await bootPage(browser, { waitWordlist: false, aiReply: '', beforeGoto: g.beforeGoto });
    try {
        await page.fill('#searchInput', '安');
        await settle(page);
        await clickGenerate(page);
        await expect(page.locator('#aiLoading')).toContainText('詞庫載入中');
        await page.fill('#searchInput', '心');
        await settle(page);
        g.release();
        await expect(page.locator('#generateBtn')).toBeEnabled();
        await page.evaluate(() => window.__hoyunWordlistReady);
        await settle(page);
        await expect(page.locator('#aiWordsContainer .ai-word-card')).toHaveCount(0);
        expect(g.aiPrompts).toHaveLength(0);
        await expect(page.locator('#aiLoading')).toBeHidden();
        expect(errors).toEqual([]);
    } finally { await context.close(); }
});

// 只認「HTTP 500 資源」以外的錯誤（Chromium 會把非 2xx 資源記成 console.error；不用 abort，Pitfall 8）
const realErrors = errors => errors.filter(e => !/status of 500/.test(e));

test('版本：改版時整套換新、缺一段就保留舊的整套、網址帶 v=', async ({ browser }) => {
    test.setTimeout(60_000);
    const state = { ver: 'V1', metaDown: false, failChunk: null, delay0: false };
    const context = await browser.newContext(CONTEXT_OPTS);
    await routeExternal(context, { aiReply: '' });
    await stubSlangEmpty(context);
    await context.route(/\/data\/wordlist-meta\.json$/, r => state.metaDown
        ? r.fulfill({ status: 500, body: 'x' })
        : r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: state.ver, chunks: 10, total: 10 }) }));
    await context.route(/\/data\/wordlist-c0(\d)\.json(\?.*)?$/, async r => {
        const i = Number(/c0(\d)\.json/.exec(r.request().url())[1]);
        if (state.failChunk === i) return r.fulfill({ status: 500, body: 'x' });
        if (state.delay0 && i === 0) await new Promise(res => setTimeout(res, 200));
        const old = state.ver === 'V1';
        return r.fulfill({ status: 200, contentType: 'application/json', body: `{"w":"${old ? '舊' : '新'}${i}","z":"${old ? 'ㄐㄧㄡˋ' : 'ㄒㄧㄣ'} ㄌㄧㄥˊ","p":1}\n` });
    });
    await context.route(/\/data\/wordlist-overrides\.json$/, r => r.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ version: 2, removed: [], hidden: [], fixed: { '新0': 'ㄒㄧㄣ ㄌㄧㄥˋ' }, added: [] }),
    }));

    const open = async () => {
        const page = await context.newPage();
        const { errors, warnings } = collectErrors(page);
        const chunkUrls = [], aiPrompts = [];
        page.on('request', r => {
            const u = new URL(r.url());
            if (/\/data\/wordlist-c0\d\.json$/.test(u.pathname)) chunkUrls.push(r.url());
            if (u.pathname === '/ai') aiPrompts.push(1);
        });
        await page.goto('/index.html');
        await page.evaluate(() => Promise.all([window.__hoyunReady, window.__hoyunWordlistReady, window.__hoyunSafetyReady, window.__hoyunModelsReady]));
        return { page, errors, warnings, chunkUrls, aiPrompts };
    };
    // 讀 wl：ver、十段各自的第一筆 w/z、sentinel
    const dump = page => page.evaluate(async () => {
        const db = await lhIdbOpen();
        return new Promise(res => {
            const st = db.transaction('wl', 'readonly').objectStore('wl');
            const out = { ver: null, chunks: [], sentinel: null };
            st.get('ver').onsuccess = e => { out.ver = e.target.result?.v ?? null; };
            st.get('sentinel').onsuccess = e => { out.sentinel = e.target.result?.v ?? null; };
            for (let i = 0; i < 10; i++) st.get(i).onsuccess = e => { const c = e.target.result?.v; out.chunks[i] = c ? { w: c[0].w, z: c[0].z } : null; };
            st.transaction.oncomplete = () => res(out);
        });
    });
    const words = page => page.evaluate(() => wordlistData && wordlistData.map(e => e.w));
    const seq = ch => Array.from({ length: 10 }, (_, i) => ch + i);
    try {
        // ⓪ meta 讀不到：照樣載入、網址沒有 v=、不寫快取
        state.metaDown = true;
        let t = await open();
        expect((await words(t.page)).length).toBe(10);
        expect(t.chunkUrls).toHaveLength(10);
        expect(t.chunkUrls.some(u => u.includes('v='))).toBe(false);
        let d = await dump(t.page);
        expect(d.ver).toBeNull();
        expect(d.chunks.every(c => c === null)).toBe(true);
        expect(realErrors(t.errors)).toEqual([]);
        await t.page.close();

        // ① V1：整套存進快取；放一個 sentinel 並記下備份清單
        state.metaDown = false;
        t = await open();
        d = await dump(t.page);
        expect(d.ver).toBe('V1');
        expect(d.chunks.map(c => c.w)).toEqual(seq('舊'));
        expect(await words(t.page)).toEqual(seq('舊'));
        expect(t.chunkUrls.every(u => u.includes('v=V1'))).toBe(true);
        await t.page.evaluate(async () => {
            const db = await lhIdbOpen();
            await new Promise((res, rej) => {
                const tx = db.transaction('wl', 'readwrite');
                tx.objectStore('wl').put({ k: 'sentinel', v: 'keep-me' });
                tx.oncomplete = res; tx.onerror = () => rej(tx.error);
            });
        });
        const backupIds = await t.page.evaluate(async () => (await lhListBackups()).map(r => r.id));
        expect(realErrors(t.errors)).toEqual([]);
        await t.page.close();

        // ② V2 但第 3 段壞掉：不用、舊的整套原封不動、按 AI 建議只提示失敗
        state.ver = 'V2'; state.failChunk = 3;
        t = await open();
        expect(await words(t.page)).toBeNull();
        expect(t.warnings.some(w => w.includes('[好韻器] 詞庫分段 3 載入失敗'))).toBe(true);
        d = await dump(t.page);
        expect(d.ver).toBe('V1');
        expect(d.chunks.map(c => c.w)).toEqual(seq('舊'));
        expect(t.chunkUrls.length).toBeGreaterThanOrEqual(10);
        expect(t.chunkUrls.every(u => u.includes('v=V2'))).toBe(true);
        await t.page.fill('#searchInput', '安');
        await settle(t.page);
        await clickGenerate(t.page);
        await expect(t.page.locator('#copyToast')).toContainText('詞庫載入失敗，請重新整理頁面');
        await expect(t.page.locator('#generateBtn')).toBeEnabled();
        expect(t.aiPrompts).toHaveLength(0);
        expect(realErrors(t.errors)).toEqual([]);

        // ③ 修好後同頁重試：整套換成 V2（chunk 0 最慢到，順序仍依編號），快取是原始內容，sentinel 與備份不動
        state.failChunk = null; state.delay0 = true;
        await t.page.evaluate(() => loadWordlist());
        expect(await words(t.page)).toEqual(seq('新'));
        d = await dump(t.page);
        expect(d.ver).toBe('V2');
        expect(d.chunks.map(c => c.w)).toEqual(seq('新'));
        expect(d.chunks[0].z, '快取存的是原始讀音，不含 overrides').toBe('ㄒㄧㄣ ㄌㄧㄥˊ');
        expect(await t.page.evaluate(() => wordPhoneticMap.get('新0')), '記憶體套了 overrides').toBe('ㄒㄧㄣ ㄌㄧㄥˋ');
        expect(d.sentinel).toBe('keep-me');
        expect(await t.page.evaluate(async () => (await lhListBackups()).map(r => r.id))).toEqual(backupIds);
        expect(realErrors(t.errors)).toEqual([]);
        await t.page.close();

        // ④ 同版本再開：0 次分段請求，直接用快取
        state.delay0 = false;
        t = await open();
        expect(t.chunkUrls).toHaveLength(0);
        expect(await words(t.page)).toEqual(seq('新'));
        expect(realErrors(t.errors)).toEqual([]);
        await t.page.close();
    } finally { await context.close(); }
});

test('非 200：詞庫分段回 500 會留下記錄、AI 不會用殘缺詞庫', async ({ browser }) => {
    test.setTimeout(60_000);
    const aiPrompts = [];
    const { context, page, errors, warnings } = await bootPage(browser, {
        aiReply: '',
        beforeGoto: async ({ context, page }) => {
            page.on('request', r => { if (new URL(r.url()).pathname === '/ai') aiPrompts.push(1); });
            await context.route(/\/data\/wordlist-c05\.json/, r => r.fulfill({ status: 500, body: 'x' }));
        },
    });
    try {
        expect(warnings.some(w => w.includes('[好韻器] 詞庫分段 5 載入失敗'))).toBe(true);
        expect(await page.evaluate(() => wordlistData)).toBeNull();
        await expect(page.locator('#lhSaveBanner')).toHaveCount(0);
        await page.fill('#searchInput', '安');
        await settle(page);
        await clickGenerate(page);
        await expect(page.locator('#copyToast')).toContainText('詞庫載入失敗，請重新整理頁面');
        expect(aiPrompts).toHaveLength(0);
        expect(realErrors(errors)).toEqual([]);
    } finally { await context.close(); }
});

// ==================== 修正檔壞掉：詞庫照樣可用（WR-02）====================
test('修正檔格式壞掉：詞庫照樣載入（原樣、不套修正），只留記錄', async ({ browser }) => {
    test.setTimeout(60_000);
    const firstWord = JSON.parse(readFileSync('data/wordlist-c00.json', 'utf8').split('\n').find(Boolean)).w;
    const bodies = {
        'null': 'null',
        'removed 不是陣列': JSON.stringify({ removed: 5 }),
        // 刪除要在「added 才爆」之前就算過一輪：失敗後被刪的詞必須還在詞庫與對照表裡
        '算到一半才爆': JSON.stringify({ removed: [firstWord], added: 5 }),
    };
    for (const [name, body] of Object.entries(bodies)) {
        const { context, page, errors, warnings } = await bootPage(browser, {
            beforeGoto: ({ context }) => context.route(/\/data\/wordlist-overrides\.json$/, r => r.fulfill({ status: 200, contentType: 'application/json', body })),
        });
        try {
            const st = await page.evaluate(w => ({
                loaded: wordlistData !== null && wordlistData.length > 1000,
                hasWord: wordlistData !== null && wordlistData.some(e => e.w === w),
                inMaps: wordPriorityMap.has(w) && wordPhoneticMap.has(w),
            }), firstWord);
            expect(st, name).toEqual({ loaded: true, hasWord: true, inMaps: true });
            expect(warnings.some(m => m.includes('詞庫修正檔套用失敗')), `${name}：要留 [好韻器] 記錄`).toBe(true);
            expect(errors, name).toEqual([]);
        } finally { await context.close(); }
    }
});

// ==================== 快取寫入失敗：換版不能留下半套（WR-04 / IN-01）====================
// 在第 5 段（k=4）的 put 注入失敗，驗證舊版整套（ver 與十段）原封不動，且下次載入會自己補好
// throw：put 同步丟 DataCloneError（走 catch → 必須 abort，否則 delete 與前 4 段 put 會被提交）
// abort：put 當下中止交易（走 onabort）
for (const mode of ['throw', 'abort']) {
    test(`快取寫入失敗（${mode}）：舊版整套完好、記憶體照用新詞庫、下次載入補好`, async ({ browser }) => {
        test.setTimeout(60_000);
        const state = { ver: 'V1' };
        const context = await browser.newContext(CONTEXT_OPTS);
        await routeExternal(context, { aiReply: '' });
        await stubSlangEmpty(context);
        await context.route(/\/data\/wordlist-meta\.json$/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: state.ver, chunks: 10, total: 10 }) }));
        await context.route(/\/data\/wordlist-c0(\d)\.json(\?.*)?$/, r => {
            const i = Number(/c0(\d)\.json/.exec(r.request().url())[1]);
            const old = state.ver === 'V1';
            return r.fulfill({ status: 200, contentType: 'application/json', body: `{"w":"${old ? '舊' : '新'}${i}","z":"ㄒㄧㄣ ㄌㄧㄥˊ","p":1}\n` });
        });
        await context.route(/\/data\/wordlist-overrides\.json$/, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
        // 只有網址帶 ?failput=模式 的頁面才注入；其他頁面行為不變
        await context.addInitScript(() => {
            const m = new URLSearchParams(location.search).get('failput');
            if (!m) return;
            const orig = IDBObjectStore.prototype.put;
            IDBObjectStore.prototype.put = function (v, k) {
                if (this.name === 'wl' && v && v.k === 4) {
                    if (m === 'throw') throw new DOMException('注入的寫入失敗', 'DataCloneError');
                    this.transaction.abort();
                    return;
                }
                return orig.call(this, v, k);
            };
        });
        const open = async query => {
            const page = await context.newPage();
            const { errors, warnings } = collectErrors(page);
            await page.goto('/index.html' + query);
            await page.evaluate(() => Promise.all([window.__hoyunReady, window.__hoyunWordlistReady, window.__hoyunSafetyReady, window.__hoyunModelsReady]));
            return { page, errors, warnings };
        };
        const dump = page => page.evaluate(async () => {
            const db = await lhIdbOpen();
            return new Promise(res => {
                const st = db.transaction('wl', 'readonly').objectStore('wl');
                const out = { ver: null, chunks: [] };
                st.get('ver').onsuccess = e => { out.ver = e.target.result?.v ?? null; };
                for (let i = 0; i < 10; i++) st.get(i).onsuccess = e => { out.chunks[i] = e.target.result?.v?.[0]?.w ?? null; };
                st.transaction.oncomplete = () => res(out);
            });
        });
        const seq = ch => Array.from({ length: 10 }, (_, i) => ch + i);
        try {
            // V1 正常寫入
            let t = await open('');
            expect(await dump(t.page)).toEqual({ ver: 'V1', chunks: seq('舊') });
            await t.page.close();

            // V2 在第 5 段寫入失敗：快取整套仍是 V1（交易整筆還原）
            state.ver = 'V2';
            t = await open('?failput=' + mode);
            expect(await dump(t.page), '舊版整套（ver 與十段）原封不動').toEqual({ ver: 'V1', chunks: seq('舊') });
            expect(await t.page.evaluate(() => wordlistData.map(e => e.w)), '這次的詞庫仍用剛抓到的新版').toEqual(seq('新'));
            expect(t.warnings.some(w => w.includes('[好韻器] 詞庫快取寫入失敗')), '要留記錄').toBe(true);
            await expect(t.page.locator('#copyToast')).toContainText('詞庫快取沒存成功');
            expect(realErrors(t.errors)).toEqual([]);
            await t.page.close();

            // 下次正常開：V1 版號與 V2 不符 → 重抓整套 → 快取換成 V2
            t = await open('');
            expect(await dump(t.page)).toEqual({ ver: 'V2', chunks: seq('新') });
            expect(await t.page.evaluate(() => wordlistData.map(e => e.w))).toEqual(seq('新'));
            await t.page.close();
        } finally { await context.close(); }
    });
}

// ==================== 兩個分頁同時換版（04-05 backstop truth）====================
// 同一個 profile 先放好 V1 快取，伺服器換成新版，兩個分頁同一瞬間載入。
// 分段回應卡在閘門，等兩邊的 20 個請求都到齊才放行，兩個分頁的整套換新就會真的重疊。
// 兩個分頁拿到的版號不同（V2 與 V3，模擬兩次部署剛好夾在兩個分頁之間）：如果寫入不是整套一個交易，
// 兩邊的分段會交錯，快取就會出現「ver 是 V2、分段混著 V3」。
test('版本：兩個分頁同時換版不會看到混合的詞庫', async ({ browser }) => {
    test.setTimeout(60_000);
    const state = { vers: ['V1'] };   // meta 依序回這份清單，用完就一直回最後一個
    const context = await browser.newContext(CONTEXT_OPTS);
    await routeExternal(context, { aiReply: '' });
    await stubSlangEmpty(context);
    await context.route(/\/data\/wordlist-meta\.json$/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: state.vers.length > 1 ? state.vers.shift() : state.vers[0], chunks: 10, total: 10 }) }));
    const MARK = { V1: '舊', V2: '新', V3: '甲' };
    let gateOn = false, arrived = 0, openGate;
    const gate = new Promise(r => { openGate = r; });
    await context.route(/\/data\/wordlist-c0(\d)\.json(\?.*)?$/, async r => {
        const i = Number(/c0(\d)\.json/.exec(r.request().url())[1]);
        if (gateOn) {
            if (++arrived === 20) openGate();
            await Promise.race([gate, new Promise(res => setTimeout(res, 3000))]);   // 保險：請求沒到齊也不會卡死
        }
        const ch = MARK[new URL(r.request().url()).searchParams.get('v')];
        return r.fulfill({ status: 200, contentType: 'application/json', body: `{"w":"${ch}${i}","z":"ㄒㄧㄣ ㄌㄧㄥˊ","p":1}\n` });
    });
    await context.route(/\/data\/wordlist-overrides\.json$/, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));

    const ready = page => page.evaluate(() => Promise.all([window.__hoyunReady, window.__hoyunWordlistReady, window.__hoyunSafetyReady, window.__hoyunModelsReady]));
    const dump = page => page.evaluate(async () => {
        const db = await lhIdbOpen();
        return new Promise(res => {
            const st = db.transaction('wl', 'readonly').objectStore('wl');
            const out = { ver: null, chunks: [] };
            st.get('ver').onsuccess = e => { out.ver = e.target.result?.v ?? null; };
            for (let i = 0; i < 10; i++) st.get(i).onsuccess = e => { const c = e.target.result?.v; out.chunks[i] = c ? c.map(x => x.w).join() : null; };
            st.transaction.oncomplete = () => res(out);
        });
    });
    const words = page => page.evaluate(() => wordlistData && wordlistData.map(e => e.w));
    const seq = ch => Array.from({ length: 10 }, (_, i) => ch + i);
    try {
        // V1 放進快取
        const seed = await context.newPage();
        await seed.goto('/index.html');
        await ready(seed);
        expect(await dump(seed)).toEqual({ ver: 'V1', chunks: seq('舊') });
        await seed.close();

        // 同一瞬間開兩個分頁，伺服器已換版
        state.vers = ['V2', 'V3']; gateOn = true;
        const [a, b] = await Promise.all([context.newPage(), context.newPage()]);
        const ea = collectErrors(a), eb = collectErrors(b);
        await Promise.all([a.goto('/index.html'), b.goto('/index.html')]);
        await Promise.all([ready(a), ready(b)]);
        expect(arrived, '兩個分頁各抓了整套新版（換版真的重疊）').toBe(20);

        // 每個分頁的記憶體：完整十段、單一版本（V2 或 V3），沒有 V1 殘留
        const mem = [await words(a), await words(b)];
        for (const w of mem) expect([seq('新'), seq('甲')]).toContainEqual(w);
        expect(mem[0], '兩邊各拿到不同版（競爭是真的）').not.toEqual(mem[1]);
        // 快取：ver 與十段屬於同一版
        const d = await dump(a);
        expect(d).toEqual(await dump(b));
        expect([{ ver: 'V2', chunks: seq('新') }, { ver: 'V3', chunks: seq('甲') }]).toContainEqual(d);
        expect(ea.errors).toEqual([]);
        expect(eb.errors).toEqual([]);
    } finally { await context.close(); }
});

// ==================== 非預設詞庫包改版（06-03，LEX-06）====================
// alpha 改版時只換 alpha 自己的快取（p:alpha:*）；缺一段就整包不用、舊版整套留著、下次載入重試；v0.96 的數字鍵不受影響
test('版本：非預設詞庫包改版時只換該包、缺段保留舊版', async ({ browser }) => {
    test.setTimeout(60_000);
    const v096Entry = JSON.parse(readFileSync(new URL('../data/packs/index.json', import.meta.url), 'utf8')).packs.find(p => p.id === 'v096');
    const mk = ver => Array.from({ length: 3 }, (_, i) => `{"w":"甲${ver}${i}","z":"ㄅㄚ ㄢ","p":1}\n`);
    const alpha = { version: 'V1', chunks: mk('V1'), fail: null, notice: 'x', requests: [] };
    const context = await browser.newContext(CONTEXT_OPTS);
    await routeExternal(context, { aiReply: '' });
    await stubSlangEmpty(context);
    await context.addInitScript(() => localStorage.setItem('lh:lexiconPack', 'alpha'));
    await stubManifest(context, { schema: 1, default: 'v096', packs: [v096Entry, packEntry('alpha', 'Alpha', { entries: 3 })] });
    await stubPack(context, 'alpha', alpha);
    await context.route(/\/data\/wordlist-overrides\.json$/, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));

    const open = async () => {
        const page = await context.newPage();
        const { errors, warnings } = collectErrors(page);
        const before = alpha.requests.length;
        await page.goto('/index.html');
        await page.evaluate(() => Promise.all([window.__hoyunReady, window.__hoyunWordlistReady, window.__hoyunSafetyReady, window.__hoyunModelsReady]));
        return { page, errors, warnings, urls: alpha.requests.slice(before) };
    };
    // 讀 wl：alpha 的 ver 與三段各自的第一筆 w、v0.96 的標記鍵（ver 與數字鍵 0）、sentinel
    const dump = page => page.evaluate(async () => {
        const db = await lhIdbOpen();
        return new Promise(res => {
            const st = db.transaction('wl', 'readonly').objectStore('wl');
            const out = { ver: null, chunks: [], v096Ver: null, v096Chunk0: null, sentinel: null, index: null };
            st.get('p:alpha:ver').onsuccess = e => { out.ver = e.target.result?.v ?? null; };
            st.get('ver').onsuccess = e => { out.v096Ver = e.target.result?.v ?? null; };
            st.get(0).onsuccess = e => { out.v096Chunk0 = e.target.result?.v ?? null; };
            st.get('sentinel').onsuccess = e => { out.sentinel = e.target.result?.v ?? null; };
            st.get('p:index').onsuccess = e => { out.index = (e.target.result?.v ?? []).map(r => r.id); };
            for (let i = 0; i < 3; i++) st.get('p:alpha:' + i).onsuccess = e => { const c = e.target.result?.v; out.chunks[i] = c ? c[0].w : null; };
            st.transaction.oncomplete = () => res(out);
        });
    });
    const words = page => page.evaluate(() => wordlistData && wordlistData.map(e => e.w));
    const seq = ver => Array.from({ length: 3 }, (_, i) => '甲' + ver + i);
    try {
        // ① V1：整包存進 alpha 自己的鍵，網址帶 ?v=V1
        let t = await open();
        expect(await words(t.page)).toEqual(seq('V1'));
        expect(t.urls).toHaveLength(3);
        for (const u of t.urls) expect(u).toContain('?v=V1');
        let d = await dump(t.page);
        expect(d.ver).toBe('V1');
        expect(d.chunks).toEqual(seq('V1'));
        // 放標記：模擬 v0.96 的快取（ver 與數字鍵 0）與一個不相干的鍵，改版後它們都必須原封不動
        await t.page.evaluate(async () => {
            const db = await lhIdbOpen();
            await new Promise(res => {
                const tx = db.transaction('wl', 'readwrite');
                const st = tx.objectStore('wl');
                st.put({ k: 'ver', v: 'V096-MARK' }); st.put({ k: 0, v: [{ w: '舊包標記', z: 'ㄐㄧㄡˋ', p: 1 }] }); st.put({ k: 'sentinel', v: 1 });
                tx.oncomplete = res;
            });
        });
        expect(realErrors(t.errors)).toEqual([]);
        await t.page.close();

        // ② 同版本再開：快取命中，不再下載
        t = await open();
        expect(t.urls).toHaveLength(0);
        expect(await words(t.page)).toEqual(seq('V1'));
        await t.page.close();

        // ③ alpha 改成 V2：三段都用 ?v=V2 重抓，只換 alpha 的鍵
        alpha.version = 'V2'; alpha.chunks = mk('V2');
        t = await open();
        expect(t.urls).toHaveLength(3);
        for (const u of t.urls) expect(u).toContain('?v=V2');
        expect(await words(t.page)).toEqual(seq('V2'));
        d = await dump(t.page);
        expect(d.ver).toBe('V2');
        expect(d.chunks).toEqual(seq('V2'));
        expect(d.v096Ver, 'v0.96 的 ver 沒被動').toBe('V096-MARK');
        expect(d.v096Chunk0, 'v0.96 的數字鍵沒被動').toEqual([{ w: '舊包標記', z: 'ㄐㄧㄡˋ', p: 1 }]);
        expect(d.sentinel).toBe(1);
        expect(d.index).toEqual(['alpha', 'v096']);
        expect(realErrors(t.errors)).toEqual([]);
        await t.page.close();

        // ④ alpha 再改成 V3 但第 1 段壞掉：詞庫不公開、舊的 V2 整套留著、留記錄
        alpha.version = 'V3'; alpha.chunks = mk('V3'); alpha.fail = 1;
        t = await open();
        expect(await words(t.page)).toBeNull();
        d = await dump(t.page);
        expect(d.ver).toBe('V2');
        expect(d.chunks).toEqual(seq('V2'));
        expect(t.warnings.some(m => m.includes('詞庫分段 1 載入失敗'))).toBe(true);
        expect(realErrors(t.errors)).toEqual([]);
        await t.page.close();

        // ⑤ 修好後下次載入重試，V3 整套公開並換掉 V2
        alpha.fail = null;
        t = await open();
        expect(await words(t.page)).toEqual(seq('V3'));
        d = await dump(t.page);
        expect(d.ver).toBe('V3');
        expect(d.chunks).toEqual(seq('V3'));
        expect(d.v096Ver).toBe('V096-MARK');
        await t.page.close();
    } finally { await context.close(); }
});
