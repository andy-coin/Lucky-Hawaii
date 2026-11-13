// 選取文字移到別的段落（quick 261113-j3a）：桌機右鍵選單；觸控走選字浮動列
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage, activeSongRaw } from './helpers.mjs';

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/v096-localStorage.json', import.meta.url), 'utf8'));
const v2Storage = (songs, active = songs[0]?.id) => ({
    ...FIXTURE, 'lh:schema': '2', 'lh:songs': JSON.stringify(songs), ...(active ? { 'lh:activeSong': active } : {}),
});
const typed = (id, type, text, extra = {}) => ({ id, type, custom: '', color: '', height: null, label: '', text, collapsed: false, ...extra });
const song = (id, sections, extra = {}) => ({ id, title: '測試歌', sections, hashtags: [], context: '', createdAt: 1, updatedAt: 1, ...extra });
const two = () => v2Storage([song('s1', [typed('sa', 'verse', '一二\n三四'), typed('sb', 'chorus', '五')])]);
const texts = page => page.evaluate(() => curSong().sections.map(s => s.text));
const storedTexts = async page => (await activeSongRaw(page)).sections.map(s => s.text);

// 第 n 段文字框：聚焦並選 [a, b)
const pick = (page, a, b, n = 0) => page.evaluate(([a, b, n]) => {
    const ta = document.querySelectorAll('.section-textarea')[n];
    ta.focus(); ta.setSelectionRange(a, b);
}, [a, b, n]);
// 對第 n 段文字框送合成的右鍵（不會動到選取），回傳是否被攔下
const rightClick = (page, n = 0) => page.evaluate(n => {
    const ta = document.querySelectorAll('.section-textarea')[n];
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 200 });
    ta.dispatchEvent(ev);
    return ev.defaultPrevented;
}, n);

const ROOT = '#moveSelMenu', SUB = '#moveSelSub';

test('移到段落：右鍵 → 子選單 → 接到 Chorus 最後 → 存檔 → Cmd+Z 復原', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: two() });
    await pick(page, 3, 5);
    expect(await rightClick(page)).toBe(true);
    await expect(page.locator(ROOT)).toBeVisible();
    await expect(page.locator(ROOT + ' button')).toHaveCount(1);
    await expect(page.locator(ROOT + ' button')).toHaveText('移到段落 ▸');
    await page.locator(ROOT + ' button').click();
    await expect(page.locator(SUB)).toBeVisible();
    await expect(page.locator(SUB + ' .move-sel-to')).toHaveText(['Verse（目前）', 'Chorus']);
    await expect(page.locator(SUB + ' .move-sel-to').first()).toHaveAttribute('aria-disabled', 'true');
    await page.locator(SUB + ' .move-sel-to').nth(1).click();
    await expect(page.locator(ROOT)).toBeHidden();
    await expect(page.locator(SUB)).toBeHidden();
    expect(await texts(page)).toEqual(['一二\n', '五\n三四']);
    await expect(page.locator('.section-textarea').nth(0)).toHaveValue('一二\n');
    await expect(page.locator('.section-textarea').nth(1)).toHaveValue('五\n三四');
    expect(await storedTexts(page)).toEqual(['一二\n', '五\n三四']);
    await expect(page.locator('.section-textarea').nth(1)).toBeFocused();
    await page.keyboard.press('ControlOrMeta+z');
    expect(await texts(page)).toEqual(['一二\n三四', '五']);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    expect(await texts(page)).toEqual(['一二\n', '五\n三四']);
    expect(errors).toEqual([]);
    await context.close();
});
