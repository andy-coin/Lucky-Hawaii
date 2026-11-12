// R2 完整歌詞編輯器（浮動面板）、新增段落位置、收合高度、拉高度不跳
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

test('編輯器：展開鈕打開、Esc 關閉，歌詞區搬進去再搬回原位', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: storage() });
    await openLeft(page);
    await expect(page.locator(ED)).toBeHidden();
    await page.locator('#editorOpenBtn').click();
    await expect(page.locator(ED)).toBeVisible();
    expect(await inEditor(page)).toBe(true);
    // 搬的是同一批節點（不是複製）：整頁只有一個 #lyricsSections、一個「新增段落」
    expect(await page.locator('#lyricsSections').count()).toBe(1);
    expect(await page.locator('.section-add-btn').count()).toBe(1);
    const box = await page.locator(`${ED} .lyrics-editor`).boundingBox();
    expect(box.width).toBeGreaterThan(1440 * 0.8);
    expect(box.height).toBeGreaterThan(900 * 0.8);
    await page.keyboard.press('Escape');
    await expect(page.locator(ED)).toBeHidden();
    expect(await inEditor(page)).toBe(false);
    expect(await page.evaluate(() => !!document.querySelector('#leftPanel .lyrics-layout #lyricsSections') && !!document.querySelector('#leftPanel .lyrics-head #exportToggle'))).toBe(true);
    // 焦點回到展開鈕
    expect(await page.evaluate(() => document.activeElement.id)).toBe('editorOpenBtn');
    // 關閉鈕、點遮罩也能關
    await page.locator('#editorOpenBtn').click();
    await page.locator(`${ED} .editor-close`).click();
    await expect(page.locator(ED)).toBeHidden();
    await page.locator('#editorOpenBtn').click();
    await page.mouse.click(5, 5);
    await expect(page.locator(ED)).toBeHidden();
    expect(errors).toEqual([]);
    await context.close();
});

test('編輯器：電腦單擊歌詞不開、雙擊開，游標留在同一段', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: storage() });
    await openLeft(page);
    const ta = page.locator('#lyricsSections .lyrics-section[data-id="sb"] .section-textarea');
    await ta.click();
    await page.waitForTimeout(100);
    await expect(page.locator(ED)).toBeHidden();
    await ta.dblclick();
    await expect(page.locator(ED)).toBeVisible();
    const st = await page.evaluate(() => ({ sec: document.activeElement.closest('.lyrics-section')?.dataset.id, inEd: !!document.activeElement.closest('#lyricsEditor') }));
    expect(st).toEqual({ sec: 'sb', inEd: true });
    // 打字、復原照常（模型與復原堆疊不受搬家影響）
    await page.keyboard.press('End');
    await page.keyboard.type('X');
    await expect.poll(async () => (await activeSongRaw(page)).sections[1].text).toBe('七八九X');
    await page.locator('#undoBtn').click();
    await expect(ta).toHaveValue('七八九');
    expect(errors).toEqual([]);
    await context.close();
});

test('編輯器：裡面新增段落、拖曳排序、切歌分頁、新增歌曲', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: storage() });
    await openLeft(page);
    await page.locator('#editorOpenBtn').click();
    // 新增段落：按鈕在「標籤 ＆ 情境」與段落列表之間
    const order = await page.evaluate(() => {
        const ctx = document.getElementById('contextSection'), add = document.querySelector('.section-add-btn'), list = document.getElementById('lyricsSections');
        return ctx.nextElementSibling === add && add.nextElementSibling === list;
    });
    expect(order).toBe(true);
    await page.locator(`${ED} .section-add-btn`).click();
    await expect(page.locator(`${ED} .lyrics-section`)).toHaveCount(4);
    // 拖第 3 段（bridge）到最上面
    const handle = page.locator('#lyricsSections .lyrics-section').nth(2).locator('.section-handle');
    const first = await page.locator('#lyricsSections .lyrics-section').nth(0).boundingBox();
    await mouseDrag(page, await centerOf(handle), [first.x + first.width / 2, first.y + 4]);
    expect((await ids(page)).slice(0, 3)).toEqual(['sc', 'sa', 'sb']);
    expect(await page.locator('.section-drag-ghost, .section-drop-line').count()).toBe(0);
    // 分頁：舊的在左；點第二首換歌
    await expect(page.locator(`${ED} .editor-tab:not(.editor-tab-add)`)).toHaveText(['第一首', '第二首']);
    await page.locator(`${ED} .editor-tab`, { hasText: '第二首' }).click();
    expect(await page.evaluate(() => activeSongId)).toBe('s2');
    await expect(page.locator(`${ED} .editor-tab[aria-current="true"]`)).toHaveText('第二首');
    expect(await ids(page)).toEqual(['sd']);
    // ＋：新增一首，分頁上直接改名
    await page.locator(`${ED} .editor-tab-add`).click();
    const name = page.locator(`${ED} .editor-tabs .song-name-input`);
    await expect(name).toBeFocused();
    await name.fill('新歌');
    await page.keyboard.press('Enter');
    await expect(page.locator(`${ED} .editor-tab:not(.editor-tab-add)`)).toHaveText(['第一首', '第二首', '新歌']);
    await expect(page.locator(`${ED} .editor-tab[aria-current="true"]`)).toBeFocused();
    expect((await activeSongRaw(page)).title).toBe('新歌');
    await page.keyboard.press('Escape');
    await expect(page.locator(ED)).toBeHidden();
    expect(errors).toEqual([]);
    await context.close();
});

test('編輯器：Tab 在面板裡循環', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: storage() });
    await openLeft(page);
    await page.locator('#editorOpenBtn').click();
    for (let i = 0; i < 40; i++) {
        await page.keyboard.press('Tab');
        expect(await page.evaluate(() => !!document.activeElement.closest('#lyricsEditor'))).toBe(true);
    }
    expect(errors).toEqual([]);
    await context.close();
});

for (const [name, device] of [['iPad 橫放 1180×820', IPAD], ['手機 390×844', DEVICES.phone]]) {
    test(`編輯器：觸控點歌詞自動打開，游標在點的位置（${name}）`, async ({ browser }) => {
        const { context, page, errors } = await bootPage(browser, { device, storage: storage() });
        await openLeft(page);
        await waitStill(page);
        const ta = page.locator('#lyricsSections .lyrics-section[data-id="sa"] .section-textarea');
        const b = await ta.boundingBox();
        await ta.tap({ position: { x: 14, y: 12 } });   // 第一行開頭附近
        await expect(page.locator(ED)).toBeVisible();
        const st = await page.evaluate(() => ({ sec: document.activeElement.closest('.lyrics-section')?.dataset.id, inEd: !!document.activeElement.closest('#lyricsEditor'), caret: document.activeElement.selectionStart }));
        expect(st.sec).toBe('sa');
        expect(st.inEd).toBe(true);
        expect(st.caret).toBeLessThanOrEqual(1);
        expect(b.height).toBeGreaterThan(0);
        // 關閉後不會因為焦點又自動打開
        await page.locator(`${ED} .editor-close`).tap();
        await expect(page.locator(ED)).toBeHidden();
        await page.waitForTimeout(150);
        await expect(page.locator(ED)).toBeHidden();
        expect(await inEditor(page)).toBe(false);
        expect(errors).toEqual([]);
        await context.close();
    });
}

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

