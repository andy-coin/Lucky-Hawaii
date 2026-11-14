// 完整歌詞編輯器（平板、電腦＝歌詞面板拉寬；手機＝浮動面板）、新增段落位置、收合高度、拉高度不跳
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage, activeSongRaw } from './helpers.mjs';
import { DEVICES, waitStill } from './layout-lib.mjs';
import { centerOf, mouseDrag, touchSession } from './drag-lib.mjs';

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/v096-localStorage.json', import.meta.url), 'utf8'));
const typed = (id, type, text, extra = {}) => ({ id, type, custom: '', color: '', height: null, label: '', text, collapsed: false, ...extra });
const song = (id, title, sections, createdAt) => ({ id, title, sections, hashtags: [], context: '', createdAt, updatedAt: createdAt });
const SONGS = [
    song('s1', '第一首', [typed('sa', 'verse', '一二三\n四五六'), typed('sb', 'chorus', '七八九'), typed('sc', 'bridge', '十')], 1),
    song('s2', '第二首', [typed('sd', 'verse', '另一首')], 2),
];
const storage = (extra = {}) => ({ ...FIXTURE, 'lh:schema': '2', 'lh:songs': JSON.stringify(SONGS), 'lh:activeSong': 's1', 'lh:tourSeen': '1', ...extra });
const ED = '#lyricsEditor';
const inEditor = page => page.evaluate(() => !!document.querySelector('#lyricsEditor #lyricsSections'));
const ids = page => page.locator('#lyricsSections .lyrics-section').evaluateAll(els => els.map(e => e.dataset.id));
const openLeft = page => page.evaluate(() => { const lp = document.getElementById('leftPanel'); if (lp.classList.contains('collapsed')) { if (lhIsSheetMode()) mobileTab('lyrics'); else toggleLeftPanel(); } });
const IPAD = DEVICES.tabletLandscape;
const near = (a, b, d = 2) => expect(Math.abs(a - b)).toBeLessThanOrEqual(d);

// 0.98.03：平板、電腦的「展開」＝歌詞面板貼著原本的邊拉寬（body.lp-full），段落不搬家；夠寬（body.lp-wide）才有分頁、自由／吸附。手機照舊浮動面板
const FULL = page => page.evaluate(() => document.body.classList.contains('lp-full'));
const still = page => page.waitForFunction(() => !document.body.classList.contains('lp-anim'));

test('編輯器：展開鈕把歌詞面板拉寬、再按或 Esc 收回，段落留在原處', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: storage() });
    await openLeft(page);
    await still(page);
    const w0 = (await page.locator('#leftPanel').boundingBox()).width;
    await expect(page.locator('#canvasTools')).toBeHidden();
    await expect(page.locator('#lpTabs')).toBeHidden();
    await page.locator('#editorOpenBtn').click(); await still(page);
    expect(await FULL(page)).toBe(true);
    await expect(page.locator(ED)).toBeHidden();   // 不開浮動面板
    expect(await page.locator('#leftPanel #lyricsSections').count()).toBe(1);
    expect((await page.locator('#leftPanel').boundingBox()).width).toBeGreaterThan(1440 * 0.9);
    await expect(page.locator('#canvasTools')).toBeVisible();
    await expect(page.locator('#lpTabs .editor-tab:not(.editor-tab-add)')).toHaveText(['第一首', '第二首']);
    await expect(page.locator('#editorOpenBtn')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape'); await still(page);
    expect(await FULL(page)).toBe(false);
    near((await page.locator('#leftPanel').boundingBox()).width, w0);
    await expect(page.locator('#canvasTools')).toBeHidden();
    await page.locator('#editorOpenBtn').click(); await still(page);
    await page.locator('#editorOpenBtn').click(); await still(page);
    expect(await FULL(page)).toBe(false);
    expect(errors).toEqual([]);
    await context.close();
});

test('編輯器：拖交界把歌詞面板拉寬，夠寬就出現分頁與自由／吸附（不用按展開）', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: { viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1 }, storage: storage({ leftPanelCollapsed: 'false', rightPanelCollapsed: 'true' }) });
    await expect(page.locator('#canvasTools')).toBeHidden();
    await page.evaluate(() => _lhPaneSet('l', 50));
    await expect(page.locator('#canvasTools')).toBeVisible();
    await expect(page.locator('#lpTabs')).toBeVisible();
    expect(await FULL(page)).toBe(false);
    await page.evaluate(() => _lhPaneSet('l', 22));
    await expect(page.locator('#canvasTools')).toBeHidden();
    await expect(page.locator('#lpTabs')).toBeHidden();
    expect(errors).toEqual([]);
    await context.close();
});

test('編輯器：電腦單擊歌詞不展開、雙擊展開，游標留在同一段', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: storage() });
    await openLeft(page);
    const ta = page.locator('#lyricsSections .lyrics-section[data-id="sb"] .section-textarea');
    await ta.click();
    await page.waitForTimeout(100);
    expect(await FULL(page)).toBe(false);
    await ta.dblclick();
    await still(page);
    expect(await FULL(page)).toBe(true);
    const st = await page.evaluate(() => document.activeElement.closest('.lyrics-section')?.dataset.id);
    expect(st).toBe('sb');
    await page.keyboard.press('End');
    await page.keyboard.type('X');
    await expect.poll(async () => (await activeSongRaw(page)).sections[1].text).toBe('七八九X');
    await page.locator('#undoBtn').click();
    await expect(ta).toHaveValue('七八九');
    expect(errors).toEqual([]);
    await context.close();
});

test('編輯器：拉寬後新增段落、拖曳排序、切歌分頁、新增歌曲', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: storage() });
    await openLeft(page);
    await page.locator('#editorOpenBtn').click(); await still(page);
    const order = await page.evaluate(() => {
        const ctx = document.getElementById('contextSection'), add = document.querySelector('.section-add-btn'), list = document.getElementById('lyricsSections');
        return ctx.nextElementSibling === add && add.nextElementSibling === list;
    });
    expect(order).toBe(true);
    await page.locator('#leftPanel .section-add-btn').click();
    await expect(page.locator('#leftPanel .lyrics-section')).toHaveCount(4);
    const handle = page.locator('#lyricsSections .lyrics-section').nth(2).locator('.section-handle');
    const first = await page.locator('#lyricsSections .lyrics-section').nth(0).boundingBox();
    await mouseDrag(page, await centerOf(handle), [first.x + first.width / 2, first.y + 4]);
    expect((await ids(page)).slice(0, 3)).toEqual(['sc', 'sa', 'sb']);
    expect(await page.locator('.section-drag-ghost, .section-drop-line').count()).toBe(0);
    await page.locator('#lpTabs .editor-tab', { hasText: '第二首' }).click();
    expect(await page.evaluate(() => activeSongId)).toBe('s2');
    await expect(page.locator('#lpTabs .editor-tab[aria-current="true"]')).toHaveText('第二首');
    expect(await ids(page)).toEqual(['sd']);
    await page.locator('#lpTabs .editor-tab-add').click();
    const name = page.locator('#lpTabs .song-name-input');
    await expect(name).toBeFocused();
    await name.fill('新歌');
    await page.keyboard.press('Enter');
    await expect(page.locator('#lpTabs .editor-tab:not(.editor-tab-add)')).toHaveText(['第一首', '第二首', '新歌']);
    await expect(page.locator('#lpTabs .editor-tab[aria-current="true"]')).toBeFocused();
    expect((await activeSongRaw(page)).title).toBe('新歌');
    await page.keyboard.press('Escape'); await still(page);
    expect(await FULL(page)).toBe(false);
    expect(errors).toEqual([]);
    await context.close();
});

test('編輯器（手機浮動面板）：Tab 在面板裡循環', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.phone, storage: storage() });
    await openLeft(page);
    await page.evaluate(() => lhEditorOpen());
    await expect(page.locator(ED)).toBeVisible();
    for (let i = 0; i < 40; i++) {
        await page.keyboard.press('Tab');
        expect(await page.evaluate(() => !!document.activeElement.closest('#lyricsEditor'))).toBe(true);
    }
    expect(errors).toEqual([]);
    await context.close();
});

test('編輯器：iPad 橫放觸控點歌詞＝歌詞面板拉寬，游標在點的位置；收回後不會又自動展開', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: IPAD, storage: storage() });
    await openLeft(page);
    await waitStill(page);
    const ta = page.locator('#lyricsSections .lyrics-section[data-id="sa"] .section-textarea');
    await ta.tap({ position: { x: 14, y: 12 } });
    await still(page);
    expect(await FULL(page)).toBe(true);
    const st = await page.evaluate(() => ({ sec: document.activeElement.closest('.lyrics-section')?.dataset.id, caret: document.activeElement.selectionStart }));
    expect(st.sec).toBe('sa');
    expect(st.caret).toBeLessThanOrEqual(1);
    await page.locator('#editorOpenBtn').tap(); await still(page);
    await page.waitForTimeout(150);
    expect(await FULL(page)).toBe(false);
    expect(errors).toEqual([]);
    await context.close();
});

test('編輯器：手機觸控點歌詞自動打開浮動面板，游標在點的位置', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.phone, storage: storage() });
    await openLeft(page);
    await waitStill(page);
    const ta = page.locator('#lyricsSections .lyrics-section[data-id="sa"] .section-textarea');
    await ta.tap({ position: { x: 14, y: 12 } });
    await expect(page.locator(ED)).toBeVisible();
    const st = await page.evaluate(() => ({ sec: document.activeElement.closest('.lyrics-section')?.dataset.id, inEd: !!document.activeElement.closest('#lyricsEditor'), caret: document.activeElement.selectionStart }));
    expect(st.sec).toBe('sa');
    expect(st.inEd).toBe(true);
    expect(st.caret).toBeLessThanOrEqual(1);
    await page.locator(`${ED} .editor-close`).tap();
    await expect(page.locator(ED)).toBeHidden();
    await page.waitForTimeout(150);
    await expect(page.locator(ED)).toBeHidden();
    expect(await inEditor(page)).toBe(false);
    expect(errors).toEqual([]);
    await context.close();
});

test('iPad 收起：「標籤＆情境」與收合段落的標題列完整、不被裁', async ({ browser }) => {
    const songs = [song('s1', '第一首', [typed('sa', 'verse', '一', { collapsed: true }), typed('sb', 'prechorus', '二')], 1)];
    const { context, page, errors } = await bootPage(browser, { device: IPAD, storage: storage({ 'lh:songs': JSON.stringify(songs), contextSectionCollapsed: 'true' }) });
    await openLeft(page);
    await waitStill(page);
    const m = await page.evaluate(() => {
        const ctx = document.getElementById('contextSection');
        const ch = ctx.querySelector('.context-section-header').getBoundingClientRect();
        const secs = [...document.querySelectorAll('#lyricsSections .lyrics-section')];
        const hdr = s => s.querySelector('.lyrics-section-header').getBoundingClientRect().height;
        const btn = s => s.querySelector('.section-type').getBoundingClientRect();
        return {
            ctxClipped: ctx.getBoundingClientRect().bottom < ch.bottom - 0.5,
            collapsedHdr: hdr(secs[0]), openHdr: hdr(secs[1]),
            collapsedFits: secs[0].getBoundingClientRect().bottom >= btn(secs[0]).bottom - 0.5,
        };
    });
    expect(m.ctxClipped).toBe(false);
    expect(Math.abs(m.collapsedHdr - m.openHdr)).toBeLessThanOrEqual(1);
    expect(m.collapsedFits).toBe(true);
    expect(errors).toEqual([]);
    await context.close();
});

