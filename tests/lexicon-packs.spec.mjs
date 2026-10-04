// Phase 6 詞庫包：載入、切換、快取
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage, settle, stubManifest, stubPack, packEntry } from './helpers.mjs';

const clickGenerate = page => page.evaluate(() => document.getElementById('generateBtn').click());
// 只認「HTTP 500 資源」以外的錯誤（Chromium 會把非 2xx 資源記成 console.error）
const realErrors = errors => errors.filter(e => !/status of 500/.test(e));

const readJson = rel => JSON.parse(readFileSync(new URL('../' + rel, import.meta.url), 'utf8'));
const readWords = (dir, pattern, n) => {
    const out = new Set();
    for (let i = 0; i < n; i++) {
        const file = pattern.replace('{NN}', String(i).padStart(2, '0'));
        for (const line of readFileSync(new URL('../' + file, import.meta.url), 'utf8').split('\n')) {
            if (line) out.add(JSON.parse(line).w);
        }
    }
    return out;
};

// 讀 wl：回傳所有鍵（字串鍵與數字鍵分開看）與指定鍵的值
const dumpKeys = page => page.evaluate(async () => {
    const db = await lhIdbOpen();
    return new Promise(res => {
        const st = db.transaction('wl', 'readonly').objectStore('wl');
        const req = st.getAllKeys();
        req.onsuccess = () => {
            const keys = req.result;
            const ver = {};
            let pending = 0;
            const done = () => { if (--pending === 0) res({ keys, ver }); };
            for (const k of ['ver', 'p:chewing:ver']) {
                pending++;
                st.get(k).onsuccess = e => { ver[k] = e.target.result?.v ?? null; done(); };
            }
        };
    });
});

test('詞庫包：沒選過的人照舊用 v0.96（網址、快取鍵、詞數不變）', async ({ browser }) => {
    test.setTimeout(90_000);
    const meta = readJson('data/wordlist-meta.json');
    const chunkReqs = [];
    const { context, page, errors } = await bootPage(browser, {
        beforeGoto: async ({ page }) => {
            page.on('request', r => { if (/\/data\/(packs\/[^/]+\/)?[^/]*c\d\d\.json/.test(new URL(r.url()).pathname)) chunkReqs.push(r.url()); });
        },
    });
    try {
        expect(await page.evaluate(() => activeLexiconPack.id)).toBe('v096');
        expect(chunkReqs).toHaveLength(10);
        for (let i = 0; i < 10; i++) {
            expect(chunkReqs.some(u => u.endsWith(`/data/wordlist-c0${i}.json?v=${encodeURIComponent(meta.version)}`)), `分段 ${i} 網址`).toBe(true);
        }
        expect(chunkReqs.some(u => u.includes('/data/packs/'))).toBe(false);
        const d = await dumpKeys(page);
        for (let i = 0; i < 10; i++) expect(d.keys).toContain(i);
        expect(d.keys).toContain('ver');
        expect(d.ver.ver).toBe(meta.version);
        expect(d.keys.some(k => typeof k === 'string' && k.startsWith('p:v096'))).toBe(false);
        expect(realErrors(errors)).toEqual([]);

        // 同一個瀏覽器環境再開一頁：快取命中，零分段請求
        const page2 = await context.newPage();
        const again = [];
        page2.on('request', r => { if (/\/data\/wordlist-c\d\d\.json/.test(new URL(r.url()).pathname)) again.push(r.url()); });
        await page2.goto('/index.html');
        await page2.evaluate(() => Promise.all([window.__hoyunReady, window.__hoyunWordlistReady]));
        expect(again).toHaveLength(0);
        expect(await page2.evaluate(() => wordlistData.length)).toBeGreaterThan(200000);
    } finally { await context.close(); }
});

test('詞庫包：存了 chewing 就載入新酷音詞庫，AI 建議只出這包的詞', async ({ browser }) => {
    test.setTimeout(90_000);
    const chewMeta = readJson('data/packs/chewing/meta.json');
    const chewSet = readWords('chewing', 'data/packs/chewing/c{NN}.json', chewMeta.chunks);
    const v096Set = readWords('v096', 'data/wordlist-c{NN}.json', 10);
    const onlyOld = [...v096Set].find(w => !chewSet.has(w));
    expect(onlyOld, '要有一個只在 v0.96 的詞').toBeTruthy();

    const chunkReqs = [];
    const { context, page, errors } = await bootPage(browser, {
        storage: { 'lh:lexiconPack': 'chewing' },
        aiReply: '',
        beforeGoto: async ({ page }) => {
            page.on('request', r => { if (/\/data\/.*c\d\d\.json/.test(new URL(r.url()).pathname)) chunkReqs.push(r.url()); });
        },
    });
    try {
        expect(await page.evaluate(() => activeLexiconPack.id)).toBe('chewing');
        expect(chunkReqs).toHaveLength(chewMeta.chunks);
        expect(chunkReqs.some(u => u.endsWith(`/data/packs/chewing/c00.json?v=${encodeURIComponent(chewMeta.version)}`))).toBe(true);
        expect(chunkReqs.some(u => /\/data\/wordlist-c/.test(u)), '沒有碰 v0.96 的分段').toBe(false);
        const d = await dumpKeys(page);
        expect(d.ver['p:chewing:ver']).toBe(chewMeta.version);
        for (let i = 0; i < chewMeta.chunks; i++) expect(d.keys).toContain('p:chewing:' + i);
        expect(d.keys.some(k => typeof k === 'number'), 'v0.96 的數字鍵不會被寫入').toBe(false);

        expect(await page.evaluate(w => wordPhoneticMap.has(w), onlyOld)).toBe(false);
        await page.fill('#searchInput', '安');
        await settle(page);
        await clickGenerate(page);
        await expect(page.locator('#aiWordsContainer .ai-word-card')).toHaveCount(24);
        const words = await page.locator('#aiWordsContainer .ai-word-card').evaluateAll(els => els.map(e => e.dataset.word));
        for (const w of words) expect(chewSet.has(w), `AI 建議詞「${w}」要在新酷音詞庫裡`).toBe(true);
        expect(realErrors(errors)).toEqual([]);
    } finally { await context.close(); }
});

test('詞庫包：存的值不認得或格式不對時用預設，存的值不改', async ({ browser }) => {
    test.setTimeout(90_000);
    for (const bad of ['nope', '../x', 'A B', 'CHEWING']) {
        const chunkReqs = [];
        const { context, page, errors } = await bootPage(browser, {
            wordlist: 'stub',
            storage: { 'lh:lexiconPack': bad },
            beforeGoto: async ({ page }) => { page.on('request', r => { if (/\/data\//.test(r.url())) chunkReqs.push(new URL(r.url()).pathname); }); },
        });
        try {
            expect(await page.evaluate(() => activeLexiconPack.id), bad).toBe('v096');
            expect(await page.evaluate(() => lhGet('lh:lexiconPack')), bad).toBe(bad);
            expect(chunkReqs.some(p => p.includes('..') || p.includes('/data/packs/') && !p.endsWith('index.json')), '不會用存的字串組網址').toBe(false);
            expect(realErrors(errors)).toEqual([]);
        } finally { await context.close(); }
    }
});

test('詞庫包：清單讀不到時照舊用 v0.96', async ({ browser }) => {
    const { context, page, errors, warnings } = await bootPage(browser, {
        wordlist: 'stub',
        storage: { 'lh:lexiconPack': 'chewing' },
        beforeGoto: async ({ context }) => {
            await context.route(/\/data\/packs\/index\.json(\?.*)?$/, r => r.fulfill({ status: 500, body: 'x' }));
        },
    });
    try {
        expect(await page.evaluate(() => wordlistData.length)).toBeGreaterThan(0);
        expect(await page.evaluate(() => activeLexiconPack.id)).toBe('v096');
        expect(warnings.some(w => w.includes('詞庫包清單讀取失敗'))).toBe(true);
        expect(realErrors(errors)).toEqual([]);
    } finally { await context.close(); }
});

test('詞庫包：選的包會進備份', async ({ browser }) => {
    const { context, page } = await bootPage(browser, { wordlist: 'stub', storage: { 'lh:lexiconPack': 'chewing' } });
    try {
        const data = await page.evaluate(async () => {
            const list = await lhListBackups();
            const base = list.find(b => b.id === 'baseline') || list[0];
            return base ? base.data : null;
        });
        expect(data).not.toBeNull();
        expect(data['lh:lexiconPack']).toBe('chewing');
    } finally { await context.close(); }
});

// ===== 偏好設定的詞庫包清單與切換 =====
// 測試用的兩個小詞庫包：alpha 的詞都以「甲」開頭、beta 的都以「乙」開頭，一看就知道詞出自哪一包
// 每個詞第二個音節是 ㄢ，所以搜「安」時都是押韻候選
const stubWords = (head, n = 30) => Array.from({ length: n }, (_, i) =>
    JSON.stringify({ w: head + String.fromCharCode(0x4e00 + i * 3), z: 'ㄅㄚ ㄢ', p: 1 })).join('\n') + '\n';
const makeState = (head, version) => ({ version, chunks: [stubWords(head)], fail: null, gate: null, requests: [] });
const realV096 = () => readJson('data/packs/index.json').packs.find(p => p.id === 'v096');

// 開一個有 v096 + alpha + beta 的頁面；v0.96 用小 stub 詞庫（不需要 13 MB）
async function bootWithStubPacks(browser, { alpha, beta, ...opts } = {}) {
    const alphaState = alpha ?? makeState('甲', 'A1');
    const betaState = beta ?? makeState('乙', 'B1');
    const booted = await bootPage(browser, {
        wordlist: 'stub', aiReply: '', ...opts,
        beforeGoto: async ({ context }) => {
            await stubManifest(context, {
                schema: 1, default: 'v096',
                packs: [realV096(), packEntry('alpha', 'Alpha', { entries: 1234, description: '甲開頭的測試詞' }), packEntry('beta', 'Beta', { entries: 30, description: '乙開頭的測試詞' })],
            });
            await stubPack(context, 'alpha', alphaState);
            await stubPack(context, 'beta', betaState);
        },
    });
    return { ...booted, alphaState, betaState };
}
const openSettings = page => page.locator('#settingsTrigger').click();
const radio = (page, id) => page.locator(`#lexiconPackList input[name="lexiconPack"][value="${id}"]`);
const gateOf = state => { let release; state.gate = new Promise(r => { release = r; }); return release; };

test('詞庫包：偏好設定列出每個包的名稱、詞數與說明，目前用的已勾選', async ({ browser }) => {
    const { context, page, errors } = await bootWithStubPacks(browser);
    try {
        await openSettings(page);
        const rows = page.locator('#lexiconPackList .pack-option');
        await expect(rows).toHaveCount(3);
        await expect(rows.locator('.pack-option-name')).toHaveText(['v0.96 現行詞庫', 'Alpha', 'Beta']);
        const metas = await rows.locator('.pack-option-meta').allTextContents();
        expect(metas[0]).toContain('233,713 詞');
        expect(metas[0]).toContain(realV096().description);
        expect(metas[1]).toBe('1,234 詞・甲開頭的測試詞');
        expect(metas[2]).toBe('30 詞・乙開頭的測試詞');
        await expect(radio(page, 'v096')).toBeChecked();
        await expect(radio(page, 'alpha')).not.toBeChecked();
        expect(realErrors(errors)).toEqual([]);
    } finally { await context.close(); }
});

test('詞庫包：真正的清單有 v0.96（233,713 詞、預設勾選）與新酷音詞庫', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub' });
    try {
        await openSettings(page);
        const rows = page.locator('#lexiconPackList .pack-option');
        await expect(rows).toHaveCount(2);
        await expect(rows.nth(0)).toContainText('233,713 詞');
        await expect(radio(page, 'v096')).toBeChecked();
        await expect(rows.nth(1).locator('.pack-option-name')).toHaveText('新酷音詞庫');
        await expect(rows.nth(1)).toContainText('128,973 詞');
        expect(realErrors(errors)).toEqual([]);
    } finally { await context.close(); }
});

test('詞庫包：點選別的包會載入、清掉舊 AI 建議、重跑目前搜尋，下一次 AI 建議只用新包的詞', async ({ browser }) => {
    test.setTimeout(60_000);
    const { context, page, errors, alphaState } = await bootWithStubPacks(browser);
    try {
        await page.fill('#searchInput', '安');
        await settle(page);
        // 放一張假的舊字卡與舊池子，確認換包時被清掉
        await page.evaluate(() => {
            suggestedPool.add('舊詞'); sentCandidatesSet.add('舊詞'); cumulativeCandidates = ['舊詞'];
            document.getElementById('aiWordsContainer').innerHTML = '<div class="ai-word-card" data-word="舊詞">舊詞</div>';
            window.__searches = 0;
            const orig = window._handleSearch;
            window._handleSearch = function (v) { window.__searches++; return orig(v); };
        });
        const release = gateOf(alphaState);
        await openSettings(page);
        await radio(page, 'alpha').check();
        await expect(page.locator('#lexiconPackStatus')).toHaveText('詞庫載入中…');
        expect(await page.evaluate(() => lhGet('lh:lexiconPack'))).toBe('alpha');
        await expect(page.locator('#aiWordsContainer .ai-word-card')).toHaveCount(0);
        expect(await page.evaluate(() => [suggestedPool.size, sentCandidatesSet.size, cumulativeCandidates.length])).toEqual([0, 0, 0]);
        release();
        await expect(page.locator('#lexiconPackStatus')).toHaveText('已改用：Alpha');
        expect(await page.evaluate(() => activeLexiconPack.id)).toBe('alpha');
        expect(await page.evaluate(() => window.__searches), '目前的搜尋重跑了').toBeGreaterThanOrEqual(1);
        expect(await page.evaluate(() => document.getElementById('searchInput').value)).toBe('安');
        expect(alphaState.requests[0]).toContain('/data/packs/alpha/c00.json?v=A1');

        await clickGenerate(page);
        await expect(page.locator('#aiWordsContainer .ai-word-card')).toHaveCount(24);
        const words = await page.locator('#aiWordsContainer .ai-word-card').evaluateAll(els => els.map(e => e.dataset.word));
        for (const w of words) expect(w.startsWith('甲'), `「${w}」要是 alpha 的詞`).toBe(true);
        expect(realErrors(errors)).toEqual([]);
    } finally { await context.close(); }
});

test('詞庫包：還在下載時又換包，只留最後選的', async ({ browser }) => {
    test.setTimeout(60_000);
    const { context, page, errors, alphaState } = await bootWithStubPacks(browser);
    try {
        const release = gateOf(alphaState);
        await openSettings(page);
        await radio(page, 'alpha').check();
        await expect.poll(() => alphaState.requests.length, { message: 'alpha 的分段請求已送出（卡在閘門）' }).toBeGreaterThan(0);
        await radio(page, 'beta').check();
        await expect(page.locator('#lexiconPackStatus')).toHaveText('已改用：Beta');
        release();                       // alpha 這時才下載完：不可以蓋掉 beta
        await page.evaluate(() => new Promise(r => setTimeout(r, 400)));
        expect(await page.evaluate(() => activeLexiconPack.id)).toBe('beta');
        const heads = await page.evaluate(() => ({
            alpha: wordlistData.filter(e => e.w[0] === '甲').length,
            beta: wordlistData.filter(e => e.w[0] === '乙').length,
            mapAlpha: [...wordPhoneticMap.keys()].filter(w => w[0] === '甲').length,
        }));
        expect(heads).toEqual({ alpha: 0, beta: 30, mapAlpha: 0 });
        await expect(radio(page, 'beta')).toBeChecked();
        await expect(page.locator('#lexiconPackStatus')).toHaveText('已改用：Beta');
        expect(await page.evaluate(() => lhGet('lh:lexiconPack'))).toBe('beta');
        expect(realErrors(errors)).toEqual([]);
    } finally { await context.close(); }
});

test('詞庫包：新包載入失敗時提示、退回原本的包並維持勾選', async ({ browser }) => {
    test.setTimeout(60_000);
    const alpha = makeState('甲', 'A1');
    alpha.fail = 0;
    const { context, page, errors } = await bootWithStubPacks(browser, { alpha });
    try {
        await openSettings(page);
        await radio(page, 'alpha').check();
        await expect(page.locator('#lexiconPackStatus')).toHaveText('詞庫載入失敗，請稍後再試');
        await expect(radio(page, 'v096')).toBeChecked();
        await expect(radio(page, 'alpha')).not.toBeChecked();
        expect(await page.evaluate(() => lhGet('lh:lexiconPack')), '設定值退回原樣').toBeNull();
        await page.evaluate(() => window.__hoyunWordlistReady);
        expect(await page.evaluate(() => activeLexiconPack.id)).toBe('v096');
        expect(await page.evaluate(() => wordlistData.length), '退回後仍有詞庫可用').toBeGreaterThan(0);
        expect(realErrors(errors)).toEqual([]);
    } finally { await context.close(); }
});
