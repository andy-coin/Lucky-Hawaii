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
async function bootWithStubPacks(browser, { alpha, beta, gamma, afterStubs, ...opts } = {}) {
    const alphaState = alpha ?? makeState('甲', 'A1');
    const betaState = beta ?? makeState('乙', 'B1');
    const gammaState = gamma ?? null;   // 第三個包只有需要時才加（換包快取測試用）
    const booted = await bootPage(browser, {
        wordlist: 'stub', aiReply: '', ...opts,
        beforeGoto: async ({ context }) => {
            await stubManifest(context, {
                schema: 1, default: 'v096',
                packs: [realV096(), packEntry('alpha', 'Alpha', { entries: 1234, description: '甲開頭的測試詞' }), packEntry('beta', 'Beta', { entries: 30, description: '乙開頭的測試詞' }),
                    ...(gammaState ? [packEntry('gamma', 'Gamma', { entries: 30, description: '丙開頭的測試詞' })] : [])],
            });
            await stubPack(context, 'alpha', alphaState);
            await stubPack(context, 'beta', betaState);
            if (gammaState) await stubPack(context, 'gamma', gammaState);
            if (afterStubs) await afterStubs({ context });
        },
    });
    return { ...booted, alphaState, betaState, gammaState };
}
const openSettings = async page => { await page.locator('#settingsTrigger').click(); await page.locator('#prefsTab-search').click(); };   // 詞庫包在「查詢與詞庫」分頁（R2）
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

test('詞庫包：偏好設定列出四個詞庫包（真正的清單），v0.96 預設勾選', async ({ browser }) => {
    const manifest = readJson('data/packs/index.json');
    expect(manifest.packs.map(p => p.id)).toEqual(['v096', 'chewing', 'mcbopomofo', 'vanguard-tw']);
    expect(manifest.default).toBe('v096');
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub' });
    try {
        await openSettings(page);
        const rows = page.locator('#lexiconPackList .pack-option');
        await expect(rows).toHaveCount(4);
        await expect(rows.locator('.pack-option-name')).toHaveText(
            ['v0.96 現行詞庫', '新酷音詞庫', '小麥注音詞庫', '唯音台灣詞庫（精簡版）']);
        const metas = await rows.locator('.pack-option-meta').allTextContents();
        manifest.packs.forEach((p, i) => {
            expect(p.description.length, p.id + ' 要有說明').toBeGreaterThan(0);
            expect(metas[i], p.id).toBe(`${p.entries.toLocaleString('zh-TW')} 詞・${p.description}`);
        });
        expect(metas[0]).toContain('233,713 詞');
        expect(manifest.packs[1].entries, '新酷音詞數落在合理範圍').toBeGreaterThan(100_000);
        expect(manifest.packs[1].entries).toBeLessThan(140_000);
        await expect(radio(page, 'v096')).toBeChecked();
        for (const id of ['chewing', 'mcbopomofo', 'vanguard-tw']) await expect(radio(page, id)).not.toBeChecked();
        expect(realErrors(errors)).toEqual([]);
    } finally { await context.close(); }
});

test('詞庫包：選唯音台灣詞庫（精簡版）就載入它的詞', async ({ browser }) => {
    test.setTimeout(90_000);
    const entry = readJson('data/packs/index.json').packs.find(p => p.id === 'vanguard-tw');
    expect(entry, '清單裡要有 vanguard-tw').toBeTruthy();
    const meta = readJson('data/packs/vanguard-tw/meta.json');
    expect(entry.entries).toBe(meta.entries);
    const probe = readFileSync(new URL('../data/packs/vanguard-tw/c00.json', import.meta.url), 'utf8')
        .split('\n').filter(Boolean).map(l => JSON.parse(l)).find(e => e.w.length >= 3);
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub' });
    try {
        await openSettings(page);
        expect(await page.evaluate(w => wordPhoneticMap.has(w), probe.w), '換包前還是 v0.96 的詞庫').toBe(false);
        await radio(page, 'vanguard-tw').check();
        await expect(page.locator('#lexiconPackStatus')).toHaveText('已改用：唯音台灣詞庫（精簡版）', { timeout: 60_000 });
        await page.evaluate(() => window.__hoyunWordlistReady);
        expect(await page.evaluate(() => activeLexiconPack.id)).toBe('vanguard-tw');
        expect(await page.evaluate(() => lhGet('lh:lexiconPack'))).toBe('vanguard-tw');
        expect(await page.evaluate(w => wordPhoneticMap.get(w), probe.w)).toBe(probe.z);
        expect(realErrors(errors)).toEqual([]);
    } finally { await context.close(); }
});

test('詞庫包：真的清單裡有小麥注音詞庫，選了就載入', async ({ browser }) => {
    test.setTimeout(90_000);
    const manifest = readJson('data/packs/index.json');
    const entry = manifest.packs.find(p => p.id === 'mcbopomofo');
    expect(entry, '清單裡要有 mcbopomofo').toBeTruthy();
    const meta = readJson('data/packs/mcbopomofo/meta.json');
    expect(entry.entries).toBe(meta.entries);
    // 取 c00 裡一個三字以上的詞，換包後它要在注音對照表裡
    const probe = readFileSync(new URL('../data/packs/mcbopomofo/c00.json', import.meta.url), 'utf8')
        .split('\n').filter(Boolean).map(l => JSON.parse(l)).find(e => e.w.length >= 3);
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub' });
    try {
        await openSettings(page);
        const row = page.locator('#lexiconPackList .pack-option', { has: page.locator('input[value="mcbopomofo"]') });
        await expect(row.locator('.pack-option-name')).toHaveText('小麥注音詞庫');
        await expect(row.locator('.pack-option-meta')).toHaveText(
            `${entry.entries.toLocaleString('zh-TW')} 詞・${entry.description}`);
        expect(await page.evaluate(w => wordPhoneticMap.has(w), probe.w), '換包前還是 v0.96 的詞庫').toBe(false);
        await radio(page, 'mcbopomofo').check();
        await expect(page.locator('#lexiconPackStatus')).toHaveText('已改用：小麥注音詞庫', { timeout: 60_000 });
        await page.evaluate(() => window.__hoyunWordlistReady);
        expect(await page.evaluate(() => activeLexiconPack.id)).toBe('mcbopomofo');
        expect(await page.evaluate(() => lhGet('lh:lexiconPack'))).toBe('mcbopomofo');
        expect(await page.evaluate(w => wordPhoneticMap.get(w), probe.w)).toBe(probe.z);
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

// 韻腳地圖（第 10 階段）：句尾字的讀音有一層來自詞庫（以該字結尾的詞），換包後要重讀
const mapSong = text => ({ id: 's1', title: '測試歌', sections: [{ id: 'sa', type: 'verse', custom: '', color: '', height: null, label: '', text, collapsed: false }],
    hashtags: [], context: '', createdAt: 1, updatedAt: 1 });
const mapStorage = text => ({
    ...JSON.parse(readFileSync(new URL('./fixtures/v096-localStorage.json', import.meta.url), 'utf8')),
    'lh:schema': '2', 'lh:songs': JSON.stringify([mapSong(text)]), 'lh:activeSong': 's1', leftPanelCollapsed: 'false', rightPanelCollapsed: 'false',
});
const tailBand = page => page.locator('#lyricsSections .lyrics-section').first().locator('.rhyme-mirror .rm-hl').evaluateAll(els => els.map(e => [e.textContent, e.dataset.f]));

test('詞庫包：換包後韻腳地圖用新包的詞讀音', async ({ browser }) => {
    test.setTimeout(60_000);
    // alpha 的第一個詞是「甲一」，讀音 ㄅㄚ ㄢ：句尾「一」換包前走字典讀音（家族 0），換包後走詞讀音 ㄢ（家族 9）
    const { context, page, errors } = await bootWithStubPacks(browser, { storage: mapStorage('我在甲一') });
    try {
        expect(await tailBand(page)).toEqual([['一', '0']]);
        expect(await page.evaluate(() => switchLexiconPack('alpha'))).toBe(true);
        await expect.poll(() => tailBand(page)).toEqual([['一', '9']]);
        expect(realErrors(errors)).toEqual([]);
    } finally { await context.close(); }
});

test('詞庫包：換包失敗退回原包時，韻腳地圖也重畫一次', async ({ browser }) => {
    test.setTimeout(60_000);
    const alpha = makeState('甲', 'A1');
    alpha.fail = 0;
    const { context, page, errors } = await bootWithStubPacks(browser, { alpha, storage: mapStorage('我在甲一') });
    try {
        await page.evaluate(() => {
            window.__mapCalls = 0;
            const orig = window.lhMapOnLexiconChange;
            window.lhMapOnLexiconChange = function () { window.__mapCalls++; return orig.apply(this, arguments); };
        });
        expect(await page.evaluate(() => switchLexiconPack('alpha'))).toBe(false);
        await page.evaluate(() => window.__hoyunWordlistReady);
        await expect.poll(() => page.evaluate(() => window.__mapCalls)).toBeGreaterThanOrEqual(1);
        expect(await tailBand(page), '退回原包：仍是字典讀音').toEqual([['一', '0']]);
        expect(realErrors(errors)).toEqual([]);
    } finally { await context.close(); }
});

test('詞庫包：連點換包、最後那包載入失敗時，退回真正載好的原包（不是載到一半的中間包）', async ({ browser }) => {
    test.setTimeout(60_000);
    const gamma = makeState('丙', 'G1');
    gamma.fail = 0;
    const { context, page, errors, alphaState } = await bootWithStubPacks(browser, { gamma });
    try {
        const release = gateOf(alphaState);
        await openSettings(page);
        await radio(page, 'alpha').check();
        await expect.poll(() => alphaState.requests.length, { message: 'alpha 卡在閘門' }).toBeGreaterThan(0);
        await radio(page, 'gamma').check();
        await expect(page.locator('#lexiconPackStatus')).toHaveText('詞庫載入失敗，請稍後再試');
        release();
        await page.evaluate(() => window.__hoyunWordlistReady);
        await expect(radio(page, 'v096')).toBeChecked();
        expect(await page.evaluate(() => lhGet('lh:lexiconPack')), '設定值退回原樣，不是 alpha').toBeNull();
        expect(await page.evaluate(() => activeLexiconPack.id)).toBe('v096');
        expect(await page.evaluate(() => wordlistData.filter(e => e.w[0] === '甲').length), 'alpha 不可以蓋進來').toBe(0);
        expect(realErrors(errors)).toEqual([]);
    } finally { await context.close(); }
});

// ===== 快取登記簿與清理（06-03）=====
// 讀 IndexedDB：'wl' 全部的鍵、非分段內容的記錄（ver、sentinel、p:index…）、備份筆數
const wlState = page => page.evaluate(async () => {
    const db = await lhIdbOpen();
    const all = await new Promise(res => { const r = db.transaction('wl', 'readonly').objectStore('wl').getAll(); r.onsuccess = () => res(r.result); });
    const backups = await new Promise(res => { const r = db.transaction('backups', 'readonly').objectStore('backups').count(); r.onsuccess = () => res(r.result); });
    const small = {};
    for (const rec of all) if (!Array.isArray(rec.v)) small[rec.k] = rec.v;
    const index = all.find(rec => rec.k === 'p:index');
    return { keys: all.map(r => r.k), small, index: index ? index.v.map(e => e.id) : null, backups };
});
const numericKeys = keys => keys.filter(k => typeof k === 'number');
const packKeys = (keys, id) => keys.filter(k => typeof k === 'string' && k.startsWith('p:' + id + ':'));
const putSentinel = page => page.evaluate(async () => {
    const db = await lhIdbOpen();
    await new Promise(res => { const tx = db.transaction('wl', 'readwrite'); tx.objectStore('wl').put({ k: 'sentinel', v: 1 }); tx.oncomplete = res; });
});

test('詞庫包：快取最多留目前的包加上一個', async ({ browser }) => {
    test.setTimeout(90_000);
    const { context, page, errors, alphaState, gammaState } = await bootWithStubPacks(browser, { gamma: makeState('丙', 'G1') });
    try {
        const sw = async id => {
            expect(await page.evaluate(i => switchLexiconPack(i), id), `換到 ${id}`).toBe(true);
            return wlState(page);
        };

        const boot = await wlState(page);
        expect(numericKeys(boot.keys)).toHaveLength(10);
        expect(boot.keys).toContain('ver');
        expect(boot.index, '預設包開機後就登記').toEqual(['v096']);
        await putSentinel(page);
        const backupsBefore = (await wlState(page)).backups;

        const a = await sw('alpha');
        expect(numericKeys(a.keys), 'v0.96 是「上一個」，還留著').toHaveLength(10);
        expect(packKeys(a.keys, 'alpha')).toHaveLength(2);      // 1 段 + ver
        expect(a.index).toEqual(['alpha', 'v096']);

        const b = await sw('beta');
        expect(numericKeys(b.keys), 'v0.96 被擠出：數字鍵全沒了').toHaveLength(0);
        expect(b.keys).not.toContain('ver');
        expect(packKeys(b.keys, 'alpha')).toHaveLength(2);
        expect(packKeys(b.keys, 'beta')).toHaveLength(2);
        expect(b.index).toEqual(['beta', 'alpha']);

        const g = await sw('gamma');
        expect(packKeys(g.keys, 'alpha'), 'alpha 被擠出').toHaveLength(0);
        expect(packKeys(g.keys, 'beta')).toHaveLength(2);
        expect(packKeys(g.keys, 'gamma')).toHaveLength(2);
        expect(g.index).toEqual(['gamma', 'beta']);

        // 換回被清掉的 alpha：要重新下載
        const before = alphaState.requests.length;
        const a2 = await sw('alpha');
        expect(alphaState.requests.length, 'alpha 重新下載').toBeGreaterThan(before);
        expect(packKeys(a2.keys, 'gamma'), 'gamma 是最近用過的另一包，留著').toHaveLength(2);
        expect(packKeys(a2.keys, 'beta'), 'beta 比較久沒用，被擠出').toHaveLength(0);
        expect(a2.index).toEqual(['alpha', 'gamma']);

        // 換回還在快取裡的 gamma：不再下載，而且它變成「目前的」、alpha 變成「上一個」
        const gammaReqs = gammaState.requests.length;
        const g2 = await sw('gamma');
        expect(gammaState.requests.length, 'gamma 還在快取裡，不用再下載').toBe(gammaReqs);
        expect(g2.index).toEqual(['gamma', 'alpha']);
        for (const st of [b, g, a2, g2]) {
            expect(st.small.sentinel, '別的鍵一直都在').toBe(1);
            expect(st.backups, '備份筆數沒變').toBe(backupsBefore);
        }
        expect(realErrors(errors)).toEqual([]);
    } finally { await context.close(); }
});

test('詞庫包：v0.96 換版只刪數字鍵，別的包留著', async ({ browser }) => {
    test.setTimeout(90_000);
    let v096Version = 'V1';
    const chunkReqs = [];
    const { context, page, errors } = await bootWithStubPacks(browser, {
        afterStubs: async ({ context }) => {
            await context.route(/\/data\/wordlist-meta\.json(\?.*)?$/, route => route.fulfill({
                status: 200, contentType: 'application/json', body: JSON.stringify({ version: v096Version, chunks: 10, entries: 12 }),
            }));
        },
    });
    try {
        page.on('request', r => { if (/\/data\/wordlist-c0\d\.json/.test(r.url())) chunkReqs.push(r.url()); });
        const first = await wlState(page);
        expect(first.small.ver).toBe('V1');
        expect(numericKeys(first.keys)).toHaveLength(10);
        await putSentinel(page);
        expect(await page.evaluate(() => switchLexiconPack('alpha'))).toBe(true);
        const mid = await wlState(page);
        expect(mid.small['p:alpha:ver']).toBe('A1');
        const backupsBefore = mid.backups;

        v096Version = 'V2';                                    // v0.96 發了新版
        chunkReqs.length = 0;
        expect(await page.evaluate(() => switchLexiconPack('v096'))).toBe(true);
        expect(chunkReqs, '10 段都用新版號重新下載').toHaveLength(10);
        for (const u of chunkReqs) expect(u).toContain('?v=V2');
        const after = await wlState(page);
        expect(after.small.ver).toBe('V2');
        expect(numericKeys(after.keys)).toHaveLength(10);
        expect(packKeys(after.keys, 'alpha'), 'alpha 的快取沒被碰').toHaveLength(2);
        expect(after.small['p:alpha:ver']).toBe('A1');
        expect(after.keys).toContain('p:index');
        expect(after.index).toEqual(['v096', 'alpha']);
        expect(after.small.sentinel).toBe(1);
        expect(after.backups).toBe(backupsBefore);
        expect(realErrors(errors)).toEqual([]);
    } finally { await context.close(); }
});

test('詞庫包：還沒有登記簿的舊快取（v0.96 升級前就存好的）算最舊的一包，會被正常清掉', async ({ browser }) => {
    test.setTimeout(60_000);
    const { context, page, errors } = await bootWithStubPacks(browser);
    try {
        // 模擬升級前的使用者：數字鍵與 ver 都在，但沒有 p:index
        await page.evaluate(async () => {
            const db = await lhIdbOpen();
            await new Promise(res => { const tx = db.transaction('wl', 'readwrite'); tx.objectStore('wl').delete('p:index'); tx.oncomplete = res; });
        });
        expect((await wlState(page)).index).toBeNull();
        expect(await page.evaluate(() => switchLexiconPack('alpha'))).toBe(true);
        const a = await wlState(page);
        expect(a.index).toEqual(['alpha', 'v096']);
        expect(numericKeys(a.keys)).toHaveLength(10);
        expect(await page.evaluate(() => switchLexiconPack('beta'))).toBe(true);
        const b = await wlState(page);
        expect(b.index).toEqual(['beta', 'alpha']);
        expect(numericKeys(b.keys)).toHaveLength(0);
        expect(b.keys).not.toContain('ver');
        expect(realErrors(errors)).toEqual([]);
    } finally { await context.close(); }
});

// ===== 修正檔（wordlist-overrides.json）在每個包都照樣生效，加回的詞不重複（B5）=====
test('詞庫包：修正檔加回的詞不重複、刪除與改音在別的包也生效', async ({ browser }) => {
    test.setTimeout(60_000);
    const w = i => '甲' + String.fromCharCode(0x4e00 + i * 3);      // alpha 的第 i 個詞（見 stubWords）
    const [A, B, C, D] = [w(0), w(1), w(2), '新增詞'];
    const overrides = {
        version: 2, removed: [A], hidden: [], fixed: { [B]: 'ㄅㄚˇ ㄢˋ' },
        // C 本來就在 alpha 裡；D 是新詞（還重複寫了一次）；缺注音的那筆要被跳過
        added: [{ w: C, z: 'ㄅㄚ ㄢ', p: 1 }, { w: D, z: 'ㄅㄚ ㄢ', p: 1 }, { w: D, z: 'ㄅㄚ ㄢ', p: 1 }, { w: '無音', z: '', p: 1 }],
    };
    const { context, page, errors, warnings } = await bootWithStubPacks(browser, {
        storage: { 'lh:lexiconPack': 'alpha' },
        afterStubs: ({ context }) => context.route(/\/data\/wordlist-overrides\.json$/, r => r.fulfill({
            status: 200, contentType: 'application/json', body: JSON.stringify(overrides),
        })),
    });
    try {
        const probe = ws => page.evaluate(ws => {
            const count = x => wordlistData.filter(e => e.w === x).length;
            return {
                id: activeLexiconPack.id, total: wordlistData.length,
                counts: Object.fromEntries(ws.map(x => [x, count(x)])),
                z: Object.fromEntries(ws.map(x => [x, wordPhoneticMap.get(x) ?? null])),
                entryZ: wordlistData.find(e => e.w === ws[1])?.z ?? null,
                alphaOthers: wordlistData.filter(e => e.w[0] === '甲' && e.w !== ws[2]).length,
                noAudio: count('無音'),
            };
        }, [A, B, C, D]);

        const a = await probe();
        expect(a.id).toBe('alpha');
        expect(a.counts, 'A 被刪、C 只有一筆（沒重複）、D 只有一筆').toEqual({ [A]: 0, [B]: 1, [C]: 1, [D]: 1 });
        expect(a.z[A], '被刪的詞連對照表也沒有').toBeNull();
        expect(a.z[B]).toBe('ㄅㄚˇ ㄢˋ');
        expect(a.entryZ).toBe('ㄅㄚˇ ㄢˋ');
        expect(a.noAudio, '缺注音的加回項目被跳過').toBe(0);
        expect(a.total, '30 詞 - 1 刪除 + 1 新增').toBe(30);

        // 換到 beta：修正檔照樣套用（加回的詞出現在 beta），而且 alpha 的詞一個都不會混進來
        expect(await page.evaluate(() => switchLexiconPack('beta'))).toBe(true);
        const b = await probe();
        expect(b.id).toBe('beta');
        expect(b.counts[C], '加回的詞在 beta 也只有一筆').toBe(1);
        expect(b.counts[D]).toBe(1);
        expect(b.alphaOthers, '沒有混進 alpha 的詞').toBe(0);
        expect(b.total, 'beta 30 詞 + 加回 2 個').toBe(32);
        expect(realErrors(errors)).toEqual([]);
        expect(warnings.filter(m => m.includes('詞庫修正檔'))).toEqual([]);
    } finally { await context.close(); }
});

// ===== 救回誤刪的詞（LEX-05、D2）：刪除清單的一列貼進修正檔，詞就回到包裡，而且只出現一次 =====
test('詞庫包：刪除清單的詞放進修正檔就會回來', async ({ browser }) => {
    test.setTimeout(90_000);
    // 刪除清單（給人看的報告旁邊那份）第一列：{w, z, p, rule, reason, …}；救回時只需要 {w, z, p}
    const removed = readFileSync(new URL('../tools/lexicon/reports/chewing/removed.ndjson', import.meta.url), 'utf8')
        .split('\n').filter(Boolean).map(l => JSON.parse(l));
    const row = removed[0];
    expect(row.w.length, '刪除清單第一列要是個詞').toBeGreaterThanOrEqual(2);
    const chewMeta = readJson('data/packs/chewing/meta.json');
    expect(readWords('chewing', 'data/packs/chewing/c{NN}.json', chewMeta.chunks).has(row.w),
        '詞庫包本身沒有這個被刪的詞').toBe(false);
    const overrides = { version: 2, removed: [], hidden: [], fixed: {}, added: [{ w: row.w, z: row.z, p: row.p }] };
    const { context, page, errors, warnings } = await bootPage(browser, {
        storage: { 'lh:lexiconPack': 'chewing' },
        beforeGoto: ({ context }) => context.route(/\/data\/wordlist-overrides\.json$/, r => r.fulfill({
            status: 200, contentType: 'application/json', body: JSON.stringify(overrides),
        })),
    });
    try {
        const got = await page.evaluate(w => ({
            id: activeLexiconPack.id,
            count: wordlistData.filter(e => e.w === w).length,
            z: wordPhoneticMap.get(w) ?? null,
        }), row.w);
        expect(got.id).toBe('chewing');
        expect(got.count, '救回的詞只出現一次').toBe(1);
        expect(got.z).toBe(row.z);
        expect(realErrors(errors)).toEqual([]);
        expect(warnings.filter(m => m.includes('詞庫修正檔'))).toEqual([]);
    } finally { await context.close(); }
});

// ===== 「關於」視窗顯示目前詞庫包的來源（A2）=====
test('詞庫包：關於視窗顯示目前詞庫的來源', async ({ browser }) => {
    test.setTimeout(60_000);
    const { context, page, errors, warnings } = await bootPage(browser, { wordlist: 'stub' });
    try {
        const openAbout = async () => { await page.evaluate(() => toggleAbout()); await expect(page.locator('#aboutOverlay')).toHaveClass(/show/); };
        const closeAbout = () => page.evaluate(() => toggleAbout());
        // v0.96：照實說明（含教育部衍生成分的授權限制）
        await openAbout();
        await expect(page.locator('#aboutPackName')).toHaveText('v0.96 現行詞庫');
        await expect(page.locator('#aboutPackNotice')).toContainText('重編國語辭典修訂本');
        await expect(page.locator('.about-pack-title')).toHaveText('目前使用的詞庫：v0.96 現行詞庫');
        // 內容太長時區塊自己捲動，不撐破視窗
        const box = await page.locator('#aboutPackNotice').evaluate(el => ({ over: getComputedStyle(el).overflowY, max: getComputedStyle(el).maxHeight, size: parseFloat(getComputedStyle(el).fontSize) }));
        expect(box.over).toBe('auto');
        expect(box.size).toBeGreaterThanOrEqual(12);
        await closeAbout();

        // 換成新酷音：重開「關於」看到新包的說明（含上游 commit）
        expect(await page.evaluate(() => switchLexiconPack('chewing'))).toBe(true);
        await openAbout();
        await expect(page.locator('#aboutPackName')).toHaveText('新酷音詞庫');
        await expect(page.locator('#aboutPackNotice')).toContainText('c44e81aef24b06f1509f19e1be54c99812d0c43f');
        await expect(page.locator('#aboutPackNotice')).not.toContainText('重編國語辭典修訂本》 https://dict.revised.moe.edu.tw');
        await closeAbout();

        // 說明檔讀不到（500）：照實顯示，不留空白也不丟錯
        await context.route(/\/data\/packs\/chewing\/NOTICE\.txt(\?.*)?$/, route => route.fulfill({ status: 500, body: 'x' }));
        await openAbout();
        await expect(page.locator('#aboutPackNotice')).toHaveText('詞庫來源說明暫時讀不到');
        await expect(page.locator('#aboutPackName')).toHaveText('新酷音詞庫');
        expect(warnings.some(m => m.includes('詞庫來源說明讀取失敗'))).toBe(true);
        expect(realErrors(errors)).toEqual([]);
    } finally { await context.close(); }
});
