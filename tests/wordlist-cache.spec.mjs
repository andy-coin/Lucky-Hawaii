// Phase 4 詞庫載入：慢速載入與 AI 建議的競態、版本更新整套換新、非 200 留記錄
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage, settle, CONTEXT_OPTS, routeExternal, collectErrors } from './helpers.mjs';

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
