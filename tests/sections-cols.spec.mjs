// 並排角色欄（舊資料，0.96.31 起入口關閉）：種入舊 cols／role 資料來測；選單沒有入口，打字存檔、逐行對齊、韻腳上色、匯出合併、刪欄、復原照常
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage } from './helpers.mjs';

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/v096-localStorage.json', import.meta.url), 'utf8'));
const v2Storage = songs => ({ ...FIXTURE, 'lh:schema': '2', 'lh:songs': JSON.stringify(songs), 'lh:activeSong': songs[0].id });
const song = sections => ({ id: 's1', title: '對唱', sections, hashtags: [], context: '', createdAt: 1, updatedAt: 1 });
const typed = (id, text, extra = {}) => ({ id, type: 'verse', custom: '', color: '', height: null, label: '', text, collapsed: false, ...extra });

test('角色欄（舊資料）：選單沒有入口；打字、對齊、匯出、刪欄與復原照常', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: v2Storage([song([typed('sa', '我在這裡等天亮\n想你想到心慌', { role: '男', cols: [{ name: '女', text: '' }] })])]) });
    const sec = page.locator('.lyrics-section').first();
    // 右鍵開完整設定：沒有「＋ 並排角色欄」入口
    await sec.locator('.section-type').click({ button: 'right' });
    await expect(page.locator('#sectionMenu')).toBeVisible();
    await expect(page.locator('#sectionMenu .section-col-menu')).toHaveCount(0);
    await expect(page.locator('#sectionMenu .section-col-block')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('#sectionMenu')).toBeHidden();
    await expect(sec.locator('.section-col-ta')).toHaveCount(1);
    await expect(sec.locator('.sec-role-name')).toHaveCount(2);
    // 打字：存進模型（第二欄）
    const col = sec.locator('.section-col-ta');
    await col.click();
    await page.keyboard.type('你在那裡看月光\n聽我唱到天亮');
    await sec.locator('.sec-role-name').nth(0).fill('男');
    await sec.locator('.sec-role-name').nth(1).fill('女');
    await expect.poll(() => page.evaluate(() => curSong().sections[0].cols)).toEqual([{ name: '女', text: '你在那裡看月光\n聽我唱到天亮' }]);
    expect(await page.evaluate(() => curSong().sections[0].role)).toBe('男');
    // 逐行對齊：兩欄同一行的上緣一樣（不自動換行）
    const tops = await sec.evaluate(el => [el.querySelector('.section-textarea'), el.querySelector('.section-col-ta')].map(t => [t.getBoundingClientRect().top, getComputedStyle(t).whiteSpace, getComputedStyle(t).lineHeight]));
    expect(tops[0]).toEqual(tops[1]);
    expect(tops[0][1]).toBe('pre');
    // 第二欄也有韻腳上色（天亮、月光同韻）
    await expect.poll(() => sec.locator('.rhyme-mirror').nth(1).locator('.rm-hl').count()).toBeGreaterThan(0);
    // 匯出：逐行合併
    expect(await page.evaluate(() => songToTxt(curSong()))).toBe('對唱\n\n[Verse]\n【男】我在這裡等天亮\n【女】你在那裡看月光\n【男】想你想到心慌\n【女】聽我唱到天亮\n');
    // 有字的欄要按兩下才刪
    const del = sec.locator('.sec-col-del');
    await del.click();
    await expect(del).toHaveText('確定？');
    await del.click();
    await expect(sec.locator('.section-col-ta')).toHaveCount(0);
    expect(await page.evaluate(() => { const s = curSong().sections[0]; return ['cols' in s, 'role' in s]; })).toEqual([false, false]);
    // 復原：欄回來、字也在
    await page.evaluate(() => document.getElementById('undoBtn').click());
    await expect(sec.locator('.section-col-ta')).toHaveValue('你在那裡看月光\n聽我唱到天亮');
    // 存檔重載後還在
    await page.evaluate(() => flushSongs());
    await page.reload();
    await expect(page.locator('.lyrics-section').first().locator('.section-col-ta')).toHaveValue('你在那裡看月光\n聽我唱到天亮');
    expect(errors).toEqual([]);
    await context.close();
});

test('角色欄：最多四欄、＋ 鈕', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: v2Storage([song([typed('sa', '一', { cols: [{ name: 'B', text: '二' }] })])]) });
    const sec = page.locator('.lyrics-section').first();
    await sec.locator('.sec-col-add').click();
    await sec.locator('.sec-col-add').click();
    await expect(sec.locator('.section-col-ta')).toHaveCount(3);
    await expect(sec.locator('.sec-col-add')).toHaveCount(0);   // 滿四欄沒有＋
    // 空的欄一下就刪
    await sec.locator('.sec-col-del').last().click();
    await expect(sec.locator('.section-col-ta')).toHaveCount(2);
    expect(errors).toEqual([]);
    await context.close();
});
