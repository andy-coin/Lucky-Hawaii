// 寬螢幕吸附版面（quick 261113-lha）：≥ 1600 且滑鼠才啟用的三塊分割畫面
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage, activeSongRaw } from './helpers.mjs';
import { DEVICES, waitStill, rectsOverlap, expectFullyInViewport } from './layout-lib.mjs';
import { centerOf, mouseDrag } from './drag-lib.mjs';

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/v096-localStorage.json', import.meta.url), 'utf8'));
const WIDE = { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 };
const BASE_SEEDS = { 'lh:tourSeen': '1', leftPanelCollapsed: 'false', rightPanelCollapsed: 'false' };
const typed = (id, type, text, extra = {}) => ({ id, type, custom: '', color: '', height: null, label: '', text, collapsed: false, ...extra });
const song = (sections) => ({ id: 's1', title: '測試歌', sections, hashtags: [], context: '', createdAt: 1, updatedAt: 1 });
const withSong = (sections, extra = {}) => ({
    ...FIXTURE, 'lh:schema': '2', 'lh:songs': JSON.stringify([song(sections)]), 'lh:activeSong': 's1', ...BASE_SEEDS, ...extra,
});
const boot = (browser, storage = BASE_SEEDS, device = WIDE) => bootPage(browser, { wordlist: 'stub', device, storage });

const BLOCKS = ['#leftPanel', '#mainContainer', '#rightPanel'];
const boxes = async page => {
    await waitStill(page);
    const r = [];
    for (const s of BLOCKS) r.push(await page.locator(s).boundingBox());
    return { lyrics: r[0], results: r[1], ai: r[2] };
};
const near = (a, b, tol = 1) => expect(Math.abs(a - b), `${a} 應約等於 ${b}`).toBeLessThanOrEqual(tol);
const sameBox = (a, b, tol = 1) => { for (const k of ['x', 'y', 'width', 'height']) near(a[k], b[k], tol); };
const hasDock = page => page.evaluate(() => document.body.classList.contains('dock'));
const F_AABB = '我望著遠方的光\n獨自站在窗\n走過熟悉的街道\n終於我也回到';

test('三欄：寬螢幕並排填滿、不重疊、都在畫面內', async ({ browser }) => {
    const { context, page, errors } = await boot(browser);
    expect(await hasDock(page)).toBe(true);
    const b = await boxes(page);
    expect(b.lyrics.x).toBeLessThan(b.results.x);
    expect(b.results.x).toBeLessThan(b.ai.x);
    expect(rectsOverlap(b.lyrics, b.results)).toBe(false);
    expect(rectsOverlap(b.results, b.ai)).toBe(false);
    near(b.lyrics.y, b.results.y); near(b.results.y, b.ai.y);
    near(b.lyrics.height, b.results.height); near(b.results.height, b.ai.height);
    for (const s of BLOCKS) await expectFullyInViewport(page, page.locator(s));
    expect(b.results.width).toBeGreaterThan(b.lyrics.width);
    expect(errors).toEqual([]);
    await context.close();
});

test('收起 AI：其他補滿、分頁在邊上，再打開回到原位', async ({ browser }) => {
    const { context, page, errors } = await boot(browser);
    const before = await boxes(page);
    await page.locator('#rightPanel .side-panel-tab').click();
    const after = await boxes(page);
    expect(after.results.x + after.results.width).toBeGreaterThan(before.results.x + before.results.width + 50);
    const tab = page.locator('#rightPanel .side-panel-tab');
    await expectFullyInViewport(page, tab);
    expect(rectsOverlap(await tab.boundingBox(), after.results)).toBe(false);
    expect(rectsOverlap(after.lyrics, after.results)).toBe(false);
    expect(after.lyrics.x).toBeLessThan(after.results.x);
    await page.locator('#rightPanel .side-panel-tab').click();
    const again = await boxes(page);
    for (const k of ['lyrics', 'results', 'ai']) sameBox(again[k], before[k]);
    expect(errors).toEqual([]);
    await context.close();
});

test('兩邊都收：查詢區填滿兩個分頁之間', async ({ browser }) => {
    const { context, page, errors } = await boot(browser, { 'lh:tourSeen': '1', leftPanelCollapsed: 'true', rightPanelCollapsed: 'true' });
    const b = await boxes(page);
    const lt = await page.locator('#leftPanel .side-panel-tab').boundingBox();
    const rt = await page.locator('#rightPanel .side-panel-tab').boundingBox();
    expect(rectsOverlap(lt, b.results)).toBe(false);
    expect(rectsOverlap(rt, b.results)).toBe(false);
    expect(b.results.x).toBeGreaterThanOrEqual(lt.x + lt.width - 0.5);
    expect(b.results.x + b.results.width).toBeLessThanOrEqual(rt.x + 0.5);
    expect(b.results.width).toBeGreaterThan(1920 * 0.8);
    expect(errors).toEqual([]);
    await context.close();
});

test('不啟用與切換：1440 不啟用、縮放視窗與觸控來回', async ({ browser }) => {
    const { context, page, errors } = await boot(browser, BASE_SEEDS, DEVICES.desktop);
    expect(await hasDock(page)).toBe(false);
    expect(await page.locator('#mainContainer').evaluate(el => getComputedStyle(el).position)).toBe('static');
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect.poll(() => hasDock(page)).toBe(true);
    const b = await boxes(page);
    expect(b.lyrics.x).toBeLessThan(b.results.x);
    expect(b.results.x).toBeLessThan(b.ai.x);
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect.poll(() => hasDock(page)).toBe(false);
    await waitStill(page);
    near((await page.locator('#leftPanel').boundingBox()).x, 0);
    expect(await page.locator('#mainContainer').evaluate(el => getComputedStyle(el).position)).toBe('static');
    expect(errors).toEqual([]);
    await context.close();
    const touch = await boot(browser, BASE_SEEDS, { viewport: { width: 1920, height: 1080 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    expect(await hasDock(touch.page)).toBe(false);
    await touch.context.close();
});

test('編輯器：dock 裡展開再 Esc，歌詞區搬出去再搬回、面板不動', async ({ browser }) => {
    const { context, page, errors } = await boot(browser, withSong([typed('sa', 'verse', '一二三\n四五六')]));
    const before = await boxes(page);
    await page.locator('#editorOpenBtn').click();
    await expect(page.locator('#lyricsEditor')).toBeVisible();
    await expect(page.locator('#lyricsEditor #lyricsSections')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.locator('#lyricsEditor')).toBeHidden();
    await expect(page.locator('#leftPanel .lyrics-layout #lyricsSections')).toHaveCount(1);
    sameBox((await boxes(page)).lyrics, before.lyrics);
    expect(errors).toEqual([]);
    await context.close();
});

test('段落選單：dock 裡右鍵名稱鈕開在最上層、選色生效', async ({ browser }) => {
    const { context, page, errors } = await boot(browser, withSong([typed('sa', 'verse', 'A'), typed('sb', 'chorus', 'B')]));
    await waitStill(page);
    await page.locator('#lyricsSections .section-type').nth(1).click({ button: 'right' });
    const menu = page.locator('#sectionMenu');
    await expect(menu).toBeVisible();
    await expectFullyInViewport(page, menu);
    const [cx, cy] = await centerOf(menu);
    expect(await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y).closest('#sectionMenu'), [cx, cy])).toBe(true);
    await menu.locator('.swatch[aria-label="顏色：綠"]').click();
    expect(await page.locator('#lyricsSections .lyrics-section').nth(1).evaluate(el => el.dataset.color || '')).toBe('#48a868');
    expect(errors).toEqual([]);
    await context.close();
});

test('移到段落：dock 裡右鍵 → 子選單 → 接到別段', async ({ browser }) => {
    const { context, page, errors } = await boot(browser, withSong([typed('sa', 'verse', '一二\n三四'), typed('sb', 'chorus', '五')]));
    await waitStill(page);
    await page.evaluate(() => { const ta = document.querySelectorAll('.section-textarea')[0]; ta.focus(); ta.setSelectionRange(3, 5); });
    const prevented = await page.evaluate(() => {
        const ta = document.querySelectorAll('.section-textarea')[0], r = ta.getBoundingClientRect();
        const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 20 });
        ta.dispatchEvent(ev);
        return ev.defaultPrevented;
    });
    expect(prevented).toBe(true);
    await expect(page.locator('#moveSelMenu')).toBeVisible();
    await page.locator('#moveSelMenu button').click();
    await expect(page.locator('#moveSelSub')).toBeVisible();
    await expectFullyInViewport(page, page.locator('#moveSelSub'));
    await page.locator('#moveSelSub .move-sel-to').nth(1).click();
    expect(await page.evaluate(() => curSong().sections.map(s => s.text))).toEqual(['一二\n', '五\n三四']);
    expect(errors).toEqual([]);
    await context.close();
});

test('韻腳地圖：dock 裡上色、鏡像層與文字框同框、選字列可查韻', async ({ browser }) => {
    const { context, page, errors } = await boot(browser, withSong([typed('sa', 'verse', F_AABB), typed('sb', 'chorus', '')]));
    await waitStill(page);
    const first = page.locator('#lyricsSections .lyrics-section').first();
    expect(await first.locator('.rhyme-mirror .rm-hl').evaluateAll(els => els.map(e => [e.textContent, e.dataset.f])))
        .toEqual([['光', '14'], ['窗', '14'], ['道', '8'], ['到', '8']]);
    sameBox(await first.locator('.rhyme-mirror').boundingBox(), await first.locator('.section-textarea').boundingBox());
    await page.evaluate(() => { const ta = document.querySelector('.section-textarea'); ta.focus(); ta.setSelectionRange(7, 7); });
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');
    await expect(page.locator('#rhymeSelBar')).toBeVisible();
    await expectFullyInViewport(page, page.locator('#rhymeSelBar'));
    await page.locator('#rhymeSelBar button').first().click();
    await expect(page.locator('#searchInput')).toHaveValue('光');
    expect(errors).toEqual([]);
    await context.close();
});
