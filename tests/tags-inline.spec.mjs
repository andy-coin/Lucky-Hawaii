// 標籤直接在板塊上輸入、一次加多個、板塊排在歌詞上面（Andy 1-d）
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage, activeSongRaw } from './helpers.mjs';

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/v096-localStorage.json', import.meta.url), 'utf8'));

test('標籤：解析分隔、去空、去重、去掉 #', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: FIXTURE, wordlist: 'stub' });
    const parse = s => page.evaluate(x => lhParseTags(x), s);
    expect(await parse('夏天、思念，城市, 夜晚 雨 　全形空白')).toEqual(['夏天', '思念', '城市', '夜晚', '雨', '全形空白']);
    expect(await parse('#夏天 ##思念 ＃城市#海')).toEqual(['夏天', '思念', '城市', '海']);
    expect(await parse('a、、a, ,b;；c')).toEqual(['a', 'b', 'c']);
    expect(await parse('   ')).toEqual([]);
    expect(errors).toEqual([]);
    await context.close();
});

test('標籤：輸入框按 Enter 一次加多個，已有的不重複', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: FIXTURE, wordlist: 'stub' });
    const before = (await activeSongRaw(page)).hashtags;   // 舊存檔裡已有 浪漫、夏天
    // 標籤輸入框直接在板塊上，不會彈出任何視窗（舊存檔的左面板是開著的）
    const input = page.locator('#hashtagInput');
    await expect(input).toBeVisible();
    await input.fill('#夏天、海邊，夜晚 夜晚');
    await input.press('Enter');
    await expect(input).toHaveValue('');
    await expect(page.locator('#hashtagChips .hashtag-chip')).toHaveText([...before, '海邊', '夜晚'].map(t => '#' + t + '×'));
    await expect.poll(async () => (await activeSongRaw(page)).hashtags).toEqual([...before, '海邊', '夜晚']);
    // 「+」：框裡有字就直接加進去
    await input.fill('城市');
    await page.locator('.hashtag-add-btn').click();
    await expect(page.locator('#hashtagChips .hashtag-chip')).toHaveCount(before.length + 3);
    // 只有分隔符號：什麼都不加
    await input.fill('、 ,');
    await input.press('Enter');
    await expect(page.locator('#hashtagChips .hashtag-chip')).toHaveCount(before.length + 3);
    expect(await page.locator('.hashtag-popup-overlay').count(), '舊的彈出視窗已移除').toBe(0);
    expect(errors).toEqual([]);
    await context.close();
});

test('標籤：板塊排在歌詞上面', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: FIXTURE, wordlist: 'stub' });
    const y = sel => page.locator(sel).first().evaluate(el => el.getBoundingClientRect().top);
    expect(await y('#contextSection')).toBeLessThan(await y('#lyricsSections'));
    // 收合時「+」會把板塊打開並把游標放進輸入框
    await page.locator('.context-section-title').click();
    await expect(page.locator('#contextSection')).toHaveClass(/collapsed/);
    await page.locator('.hashtag-add-btn').click();
    await expect(page.locator('#contextSection')).not.toHaveClass(/collapsed/);
    await expect(page.locator('#hashtagInput')).toBeFocused();
    expect(errors).toEqual([]);
    await context.close();
});
