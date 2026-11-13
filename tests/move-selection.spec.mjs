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

test('移到段落：＋ 新段落建在原段落後面，類型用猜的', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: two() });
    await pick(page, 0, 2);
    await rightClick(page);
    await page.locator(ROOT + ' button').click();
    await expect(page.locator(SUB + ' button')).toHaveText(['Verse（目前）', 'Chorus', '＋ 新段落']);
    await page.locator(SUB + ' .move-sel-new').click();
    const secs = await page.evaluate(() => curSong().sections.map(s => ({ type: s.type, text: s.text })));
    expect(secs).toEqual([
        { type: 'verse', text: '\n三四' }, { type: 'prechorus', text: '一二' }, { type: 'chorus', text: '五' },
    ]);
    await expect(page.locator('.section-textarea').nth(1)).toBeFocused();
    await page.keyboard.press('ControlOrMeta+z');
    expect(await texts(page)).toEqual(['一二\n三四', '五']);
    expect(errors).toEqual([]);
    await context.close();
});

test('移到段落：整段被移走，原段落保留為空', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: two() });
    await pick(page, 0, 5);
    await rightClick(page);
    await page.locator(ROOT + ' button').click();
    await page.locator(SUB + ' .move-sel-to').nth(1).click();
    expect(await texts(page)).toEqual(['', '五\n一二\n三四']);
    expect(errors).toEqual([]);
    await context.close();
});

test('移到段落：沒選取、只選到空白換行，維持原生右鍵選單', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: two() });
    await pick(page, 3, 3);
    expect(await rightClick(page)).toBe(false);
    await pick(page, 2, 3);   // 只選到換行
    expect(await rightClick(page)).toBe(false);
    await expect(page.locator(ROOT)).toBeHidden();
    expect(errors).toEqual([]);
    await context.close();
});

test('移到段落：快照過期不動任何字、不多記歷史', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: two() });
    await pick(page, 3, 5);
    await rightClick(page);
    await page.locator(ROOT + ' button').click();
    const before = await page.evaluate(() => _hists.get(curSong().id).past.length);
    await page.evaluate(() => { curSong().sections[0].text = 'XX\nYY'; });   // 模擬內容在選單開著時變了
    await page.locator(SUB + ' .move-sel-to').nth(1).click();
    expect(await texts(page)).toEqual(['XX\nYY', '五']);
    expect(await page.evaluate(() => _hists.get(curSong().id).past.length)).toBe(before);
    expect(errors).toEqual([]);
    await context.close();
});

test('移到段落：Esc 收起選單、焦點回文字框；方向鍵在項目間移動', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: two() });
    await pick(page, 3, 5);
    await rightClick(page);
    await page.locator(ROOT + ' button').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator(SUB)).toBeVisible();
    await expect(page.locator(SUB + ' .move-sel-to').nth(1)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator(SUB + ' .move-sel-new')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator(SUB + ' .move-sel-to').first()).toBeFocused();   // 頭尾相接；灰掉的可聚焦
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator(SUB)).toBeHidden();
    await expect(page.locator(ROOT + ' button')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator(ROOT)).toBeHidden();
    await expect(page.locator('.section-textarea').first()).toBeFocused();
    expect(errors).toEqual([]);
    await context.close();
});

// 鍵盤選取（Shift+←×2）走 400ms 計時：選到第一段索引 3–5
const kbSelect = async page => {
    await pick(page, 5, 5);
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');
};
const BAR = '#rhymeSelBar';

test('觸控：選字浮動列的「移到段落 ▸」直接開子選單，移完可復原', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        wordlist: 'stub', storage: two(), device: { hasTouch: true, isMobile: false },
    });
    await kbSelect(page);
    await expect(page.locator(BAR)).toBeVisible();
    await expect(page.locator(BAR + ' .rm-bar-move')).toBeVisible();
    await expect(page.locator(BAR + ' .rm-bar-move')).toHaveText('移到段落 ▸');
    await page.locator(BAR + ' .rm-bar-move').tap();
    await expect(page.locator(BAR)).toBeHidden();
    await expect(page.locator(SUB)).toBeVisible();
    await expect(page.locator(ROOT)).toBeHidden();
    await page.locator(SUB + ' .move-sel-to').nth(1).tap();
    expect(await texts(page)).toEqual(['一二\n', '五\n三四']);
    await page.locator('#undoBtn').tap();
    expect(await texts(page)).toEqual(['一二\n三四', '五']);
    expect(errors).toEqual([]);
    await context.close();
});

test('桌機：浮動列的「移到段落 ▸」是隱藏的', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: two() });
    await kbSelect(page);
    await expect(page.locator(BAR)).toBeVisible();
    await expect(page.locator(BAR + ' .rm-bar-move')).toBeHidden();
    expect(errors).toEqual([]);
    await context.close();
});

test('桌機：右鍵選單開著時，浮動列不會跳出來', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: two() });
    await pick(page, 3, 5);
    await rightClick(page);
    await expect(page.locator(ROOT)).toBeVisible();
    await page.evaluate(() => document.querySelector('.section-textarea').dispatchEvent(new MouseEvent('mouseup', { bubbles: true })));
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => !!document.querySelector('#rhymeSelBar.show'))).toBe(false);
    expect(errors).toEqual([]);
    await context.close();
});
