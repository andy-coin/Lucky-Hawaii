// 詞卡（多字直接查雙押）與詞宇宙：js/word-space.js
import { test, expect } from '@playwright/test';
import { bootPage } from './helpers.mjs';

test('查整個詞：判斷、押韻比對（同母音／同子音／同讀音、同聲調、排除借韻）、選項列切換、顯示全部開關', async ({ browser }) => {
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
            // 同讀音：誇張 → 看漲（ㄎ 同聲母＋ㄓㄤ 同音）、誇獎（ㄎㄨㄚ 同音＋ㄤ 押韻）；高興兩個都不符
            same: (() => {
                const K = [{ w: '看漲', z: 'ㄎㄢˋ ㄓㄤˇ', p: 5 }, { w: '誇獎', z: 'ㄎㄨㄚ ㄐㄧㄤˇ', p: 9 }, { w: '高興', z: 'ㄍㄠ ㄒㄧㄥˋ', p: 99 }, { w: '跨行', z: 'ㄎㄨㄚˋ ㄏㄤˊ', p: 3 }];
                const T = [{ zy: 'ㄎㄨㄚ', rhyme: 'ㄨㄚ', tone: 1 }, { zy: 'ㄓㄤ', rhyme: 'ㄤ', tone: 1 }];
                const m = o => lhWsMatch(K, T, '誇張', o).map(e => e.w).join(',');
                return { same: m({ mode: 'same' }), strict: m({ mode: 'same', strict: true }), init: m({ mode: 'initial' }), rhyme: m({}) };
            })(),
        };
    });
    expect(r.q).toEqual([true, false, false, true, false, false]);
    expect(r.all).toBe('看法,專家,辦法');   // 常用（p 大）的在前
    expect(r.tone).toBe('');                 // 第一字目標是 1 聲：辦法、看法是 4 聲，專家第二字是 1 聲
    expect(r.strict).toBe('看法,辦法');       // 專家是借韻
    expect(r.hidden).toBe('專家,辦法');
    expect(r.same).toEqual({ same: '誇獎,看漲,跨行', strict: '看漲,跨行', init: '看漲', rhyme: '誇獎,跨行' });
    // 選項列：空的收起、查詞換成詞卡選項、查單字是字卡選項；按「同讀音」會切換
    await expect(page.locator('.options')).toBeHidden();
    await page.fill('#searchInput', '安打');
    await expect(page.locator('#wsModeGroup')).toBeVisible();
    await expect(page.locator('#batchPanel')).toBeHidden();
    await page.locator('[data-ws="same"]').click();
    await expect(page.locator('[data-ws="same"]')).toHaveClass(/active/);
    await page.locator('[data-ws-f="tone"]').click();
    await page.locator('[data-ws-f="strict"]').click();
    await expect(page.locator('[data-ws-f="tone"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-ws-f="strict"]')).toHaveAttribute('aria-pressed', 'true');
    await page.fill('#searchInput', '安');
    await expect(page.locator('#batchPanel')).toBeVisible();
    await expect(page.locator('#wsModeGroup')).toBeHidden();
    // 詞宇宙：用假清單打開，三塊面板收走、Esc 收合回來
    await page.evaluate(() => { _lhWs.input = '安打'; _lhWs.list = [{ w: '辦法', z: 'ㄅㄢˋ ㄈㄚˇ', p: 50 }, { w: '看法', z: 'ㄎㄢˋ ㄈㄚˇ', p: 90 }]; lhWsOpen(); });
    await expect(page.locator('#wordSpace .ws-word')).toHaveCount(2);
    await expect(page.locator('body')).toHaveClass(/ws-open/);
    expect(await page.evaluate(() => document.getElementById('mainContainer').inert)).toBe(true);
    // 圖例：一欄、依第一個字的聲調收納，點開才看到組合；釘三個詞連成星座
    expect(await page.locator('.ws-leg-tone').count()).toBe(1);
    await expect(page.locator('.ws-sub')).toBeHidden();
    const pts = await page.evaluate(async () => {
        const ws = _lhSp.words;
        ws.push(...ws.map(w => ({ ...w })));   // 只有兩個詞：複製出第三、四個假的位置點就好
        _lhSp.pins = ws.slice(0, 3).map(w => Object.assign(w, { pinned: true }));
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        return document.querySelector('.ws-stars polyline').getAttribute('points').split(' ').length;
    });
    expect(pts).toBe(3);
    await page.keyboard.press('Escape');
    await expect(page.locator('#wordSpace')).toBeHidden();
    expect(await page.evaluate(() => document.getElementById('mainContainer').inert)).toBe(false);
    expect(errors).toEqual([]);
    await context.close();
});
