// 復原／重做（第 9 階段，EDIT-03）：應用層快照堆疊，每首歌一條，只在記憶體
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage, activeSongRaw } from './helpers.mjs';

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/v096-localStorage.json', import.meta.url), 'utf8'));
const v2Storage = (songs, active = songs[0]?.id) => ({
    ...FIXTURE, 'lh:schema': '2', 'lh:songs': JSON.stringify(songs), ...(active ? { 'lh:activeSong': active } : {}),
});
const typed = (id, type, text, extra = {}) => ({ id, type, custom: '', color: '', height: null, label: '', text, collapsed: false, ...extra });
const song = (id, sections, extra = {}) => ({ id, title: '測試歌', sections, hashtags: [], context: '', createdAt: 1, updatedAt: 1, ...extra });
const one = (text = '你好') => v2Storage([song('s1', [typed('sa', 'verse', text)])]);
const ta = (page, i = 0) => page.locator('#lyricsSections .section-textarea').nth(i);
const disabled = (page, id) => page.locator(id).getAttribute('aria-disabled');
const texts = page => page.evaluate(() => curSong().sections.map(s => s.text));
const storedTexts = async page => (await activeSongRaw(page)).sections.map(s => s.text);

test('復原：打字後按按鈕與快捷鍵', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: one() });
    expect(await disabled(page, '#undoBtn')).toBe('true');
    expect(await disabled(page, '#redoBtn')).toBe('true');
    await ta(page).focus();
    await page.keyboard.press('End');
    await page.keyboard.type('abc');
    expect(await disabled(page, '#undoBtn')).toBe('false');
    expect(await disabled(page, '#redoBtn')).toBe('true');
    await page.locator('#undoBtn').click();
    await expect(ta(page)).toHaveValue('你好');
    expect((await activeSongRaw(page)).sections[0].text, '復原後直接存檔').toBe('你好');
    await page.locator('#redoBtn').click();
    await expect(ta(page)).toHaveValue('你好abc');
    expect((await activeSongRaw(page)).sections[0].text).toBe('你好abc');
    await ta(page).focus();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(ta(page)).toHaveValue('你好');
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect(ta(page)).toHaveValue('你好abc');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(ta(page)).toHaveValue('你好');
    await page.keyboard.press('Control+y');
    await expect(ta(page)).toHaveValue('你好abc');
    expect(errors).toEqual([]);
    await context.close();
});
