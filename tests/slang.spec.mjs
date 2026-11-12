// 自建潮流詞庫（data/slang/words.json）：疊加在每個詞庫包上，查韻查得到、注音正確、不重複，修正檔照樣管得到
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage, settle } from './helpers.mjs';

const SLANG = JSON.parse(readFileSync(new URL('../data/slang/words.json', import.meta.url), 'utf8'));
const Z = Object.fromEntries(SLANG.added.map(e => [e.w, e.z]));
const SAMPLES = ['芙莉蓮', '雙標', '情緒價值', '暈碳', '統神'];
const realErrors = errors => errors.filter(e => !/status of 500/.test(e));

// 搜尋一個詞後，回傳它的讀音拆解與「整份詞庫裡和它押同樣韻的詞」裡有沒有它自己
const searchSelf = (page, w) => page.evaluate(async w => {
    const n = w.length;
    return {
        z: wordPhoneticMap.get(w) ?? null,
        rhymes: currentRhymes.map(r => r.zhuyin),
        found: filterWordsByRhyme(currentRhymes, n, 1).includes(w),
        copies: wordlistData.filter(e => e.w === w).length,
    };
}, w);

test('潮流詞庫：預設詞庫包查得到範例詞，注音正確、只出現一次', async ({ browser }) => {
    test.setTimeout(90_000);
    const { context, page, errors } = await bootPage(browser);
    try {
        expect(await page.evaluate(() => activeLexiconPack.id)).toBe('v096');
        for (const w of SAMPLES) {
            await page.fill('#searchInput', w);
            await settle(page);
            const r = await searchSelf(page, w);
            expect(r.z, w + ' 注音').toBe(Z[w]);
            expect(r.rhymes, w + ' 拆音').toEqual(Z[w].split(' ').map(s => s.replace(/[ˊˇˋ˙]/g, '')));
            expect(r.found, w + ' 在押韻候選裡').toBe(true);
            expect(r.copies, w + ' 不重複').toBe(1);
        }
        expect(realErrors(errors)).toEqual([]);
    } finally { await context.close(); }
});

test('潮流詞庫：換成新酷音詞庫一樣查得到；本來就有的詞不會多一筆', async ({ browser }) => {
    test.setTimeout(120_000);
    const { context, page, errors } = await bootPage(browser);
    try {
        expect(await page.evaluate(() => switchLexiconPack('chewing'))).toBe(true);
        const r = await page.evaluate(ws => ws.map(w => [w, wordPhoneticMap.get(w), wordlistData.filter(e => e.w === w).length]), SAMPLES);
        for (const [w, z, n] of r) {
            expect(z, w).toBe(Z[w]);
            expect(n, w + ' 只有一筆').toBe(1);
        }
        // 整份詞庫沒有任何重複的詞
        const dup = await page.evaluate(() => wordlistData.length - new Set(wordlistData.map(e => e.w)).size);
        expect(dup).toBe(0);
        expect(realErrors(errors)).toEqual([]);
    } finally { await context.close(); }
});

test('潮流詞庫：後台修正檔刪掉的詞，潮流詞庫不會再加回來', async ({ browser }) => {
    test.setTimeout(90_000);
    const { context, page } = await bootPage(browser, {
        beforeGoto: ({ context }) => context.route(/\/data\/wordlist-overrides\.json(\?.*)?$/, r => r.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify({ version: 2, removed: ['雙標'], hidden: [], fixed: {}, added: [] }),
        })),
    });
    try {
        expect(await page.evaluate(() => wordPhoneticMap.has('雙標'))).toBe(false);
        expect(await page.evaluate(() => wordlistData.some(e => e.w === '雙標'))).toBe(false);
        expect(await page.evaluate(() => wordPhoneticMap.get('芙莉蓮'))).toBe(Z['芙莉蓮']);
    } finally { await context.close(); }
});
