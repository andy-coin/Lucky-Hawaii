// 詞卡（多字直接查雙押）與詞宇宙：js/word-space.js
import { test, expect } from '@playwright/test';
import { bootPage } from './helpers.mjs';

test('查整個詞：判斷、押韻比對（同聲調、排除借韻）、詞宇宙開關', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub' });
    const r = await page.evaluate(() => {
        const E = [
            { w: '辦法', z: 'ㄅㄢˋ ㄈㄚˇ', p: 50 },   // ㄢ·ㄚ，4·3 聲
            { w: '看法', z: 'ㄎㄢˋ ㄈㄚˇ', p: 90 },   // 4·3
            { w: '專家', z: 'ㄓㄨㄢ ㄐㄧㄚ', p: 70 },  // 借韻 ㄨㄢ·ㄧㄚ，1·1
            { w: '安靜', z: 'ㄢ ㄐㄧㄥˋ', p: 99 },    // 第二字不押
            { w: '三個字', z: 'ㄙㄢ ㄍㄜ˙ ㄗˋ', p: 1 },
        ];
        const T = [{ rhyme: 'ㄢ', tone: 1 }, { rhyme: 'ㄚ', tone: 3 }];
        const ws = o => lhWsMatch(E, T, '安打', o).map(e => e.w).join(',');
        return {
            q: ['安打', '安 打', '安', '*打', '**', 'an'].map(s => !!lhWsQuery(s)),
            all: ws({}), tone: ws({ tone: true }), strict: ws({ strict: true }), hidden: ws({ hidden: new Set(['看法']) }),
        };
    });
    expect(r.q).toEqual([true, false, false, true, false, false]);
    expect(r.all).toBe('看法,專家,辦法');   // 常用（p 大）的在前
    expect(r.tone).toBe('');                 // 第一字目標是 1 聲：辦法、看法是 4 聲，專家第二字是 1 聲
    expect(r.strict).toBe('看法,辦法');       // 專家是借韻
    expect(r.hidden).toBe('專家,辦法');
    // 詞宇宙：用假清單打開，三塊面板收走、Esc 收合回來
    await page.evaluate(() => { _lhWs.input = '安打'; _lhWs.list = [{ w: '辦法', z: 'ㄅㄢˋ ㄈㄚˇ', p: 50 }, { w: '看法', z: 'ㄎㄢˋ ㄈㄚˇ', p: 90 }]; lhWsOpen(); });
    await expect(page.locator('#wordSpace .ws-word')).toHaveCount(2);
    await expect(page.locator('body')).toHaveClass(/ws-open/);
    expect(await page.evaluate(() => document.getElementById('mainContainer').inert)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('#wordSpace')).toBeHidden();
    expect(await page.evaluate(() => document.getElementById('mainContainer').inert)).toBe(false);
    expect(errors).toEqual([]);
    await context.close();
});
