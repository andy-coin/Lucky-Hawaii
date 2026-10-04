// Phase 6 詞庫包：載入、切換、快取
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage, settle } from './helpers.mjs';

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
