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

// ==================== 分隔線縮放、存檔、重設 ====================
const storedDock = page => page.evaluate(() => localStorage.getItem('lh:dock'));
const seedDock = t => ({ 'lh:dock': JSON.stringify({ v: 1, t }) });
const reloadReady = async page => {
    await page.reload();
    await page.evaluate(() => Promise.all([window.__hoyunReady, window.__hoyunWordlistReady, window.__hoyunSafetyReady, window.__hoyunSongsReady, window.__hoyunModelsReady, window.__lhMapReady]));
};
// 兩塊之間的分隔線：框落在 left 區塊右緣與 right 區塊左緣之間的直立那條
const vDivider = async (page, leftSel, rightSel) => {
    const l = await page.locator(leftSel).boundingBox();
    const r = await page.locator(rightSel).boundingBox();
    const all = page.locator('.dock-divider[aria-orientation="vertical"]');
    for (let i = 0; i < await all.count(); i++) {
        const b = await all.nth(i).boundingBox();
        if (b.x >= l.x + l.width - 1 && b.x + b.width <= r.x + 1) return all.nth(i);
    }
    throw new Error('找不到分隔線');
};
const dragDivider = async (page, dx, leftSel = '#leftPanel', rightSel = '#mainContainer') => {
    const [cx, cy] = await centerOf(await vDivider(page, leftSel, rightSel));
    await mouseDrag(page, [cx, cy], [cx + dx, cy], 10);
    await waitStill(page);
};

test('分隔線：拖 +120，兩側一起變、第三塊不動', async ({ browser }) => {
    const { context, page, errors } = await boot(browser);
    const before = await boxes(page);
    await dragDivider(page, 120);
    const after = await boxes(page);
    near(after.lyrics.width, before.lyrics.width + 120, 2);
    near(after.results.width, before.results.width - 120, 2);
    near(after.ai.width, before.ai.width);
    near(after.ai.x, before.ai.x);
    expect(errors).toEqual([]);
    await context.close();
});

test('分隔線：往左拖很遠，歌詞停在最小寬度 20rem', async ({ browser }) => {
    const { context, page, errors } = await boot(browser);
    const before = await boxes(page);
    await dragDivider(page, -2000);
    const after = await boxes(page);
    near(after.lyrics.width, 320, 2);
    near(after.ai.width, before.ai.width);
    expect(after.results.width).toBeGreaterThan(before.results.width);
    expect(errors).toEqual([]);
    await context.close();
});

test('存檔：縮放後重新整理還在，lh:dock 是 v1 物件', async ({ browser }) => {
    const { context, page, errors } = await boot(browser);
    await dragDivider(page, 120);
    const mid = await boxes(page);
    await reloadReady(page);
    const after = await boxes(page);
    for (const k of ['lyrics', 'results', 'ai']) sameBox(after[k], mid[k]);
    expect(JSON.parse(await storedDock(page)).v).toBe(1);
    expect(errors).toEqual([]);
    await context.close();
});

const BAD = {
    '無法解析': '{oops',
    '同方向巢狀（不在白名單）': JSON.stringify({ v: 1, t: { d: 'col', k: ['lyrics', { d: 'col', k: ['results', 'ai'], s: [1, 1] }], s: [1, 1] } }),
    '葉子重複': JSON.stringify({ v: 1, t: { d: 'row', k: ['lyrics', 'lyrics', 'results'], s: [1, 1, 1] } }),
    '權重壞掉': JSON.stringify({ v: 1, t: { d: 'row', k: ['lyrics', 'results', 'ai'], s: [1, -5, 'x'] } }),
    '少了查詢區': JSON.stringify({ v: 1, t: { d: 'row', k: ['lyrics', 'ai'], s: [1, 1] } }),
};
for (const [name, raw] of Object.entries(BAD)) {
    test(`壞值回預設：${name}`, async ({ browser }) => {
        const { context, page, errors } = await boot(browser, { ...BASE_SEEDS, 'lh:dock': raw });
        const b = await boxes(page);
        near(b.lyrics.width / b.results.width, 28 / 44, 0.02);
        expect(rectsOverlap(b.lyrics, b.results)).toBe(false);
        expect(errors).toEqual([]);
        await context.close();
    });
}

test('收起時縮放：保留收起那塊的位置，再打開仍在查詢區下方', async ({ browser }) => {
    const { context, page, errors } = await boot(browser, { ...BASE_SEEDS, ...seedDock({ d: 'row', k: ['lyrics', { d: 'col', k: ['results', 'ai'], s: [1, 1] }], s: [28, 72] }) });
    await page.locator('#rightPanel .side-panel-tab').click();
    const c0 = await boxes(page);
    await dragDivider(page, 100);
    const c1 = await boxes(page);
    near(c1.lyrics.width, c0.lyrics.width + 100, 2);
    await page.locator('#rightPanel .side-panel-tab').click();
    const o = await boxes(page);
    near(o.ai.x, o.results.x); near(o.ai.width, o.results.width);
    expect(o.ai.y).toBeGreaterThan(o.results.y + o.results.height - 1);
    // 面板展開時外框比收起時寬 24px，所以像素會差一點；比例（權重）一定保留
    const ratio = b => b.lyrics.width / (b.lyrics.width + b.results.width);
    near(ratio(o), ratio(c1), 0.005);
    expect(o.lyrics.width).toBeGreaterThan(c0.lyrics.width + 80);
    expect(errors).toEqual([]);
    await context.close();
});

test('縮放後韻腳地圖的鏡像層仍與文字框同框', async ({ browser }) => {
    const { context, page, errors } = await boot(browser, withSong([typed('sa', 'verse', F_AABB), typed('sb', 'chorus', '')]));
    await dragDivider(page, 120);
    const first = page.locator('#lyricsSections .lyrics-section').first();
    await expect.poll(async () => {
        const m = await first.locator('.rhyme-mirror').boundingBox();
        const t = await first.locator('.section-textarea').boundingBox();
        return ['x', 'y', 'width', 'height'].every(k => Math.abs(m[k] - t[k]) <= 1);
    }).toBe(true);
    expect(errors).toEqual([]);
    await context.close();
});

test('重設版面：只在 dock 顯示；點了回預設並清存檔', async ({ browser }) => {
    const { context, page, errors } = await boot(browser);
    const def = await boxes(page);
    await dragDivider(page, 120);
    expect(await storedDock(page)).not.toBeNull();
    await page.locator('#settingsTrigger').click();
    const btn = page.locator('#dockResetBtn');
    await expect(btn).toBeVisible();
    await btn.click();
    const after = await boxes(page);
    for (const k of ['lyrics', 'results', 'ai']) sameBox(after[k], def[k]);
    expect(await storedDock(page)).toBeNull();
    await context.close();
    const small = await boot(browser, BASE_SEEDS, DEVICES.desktop);
    await small.page.locator('#settingsTrigger').click();
    await expect(small.page.locator('#dockResetBtn')).toBeHidden();
    expect(errors).toEqual([]);
    expect(small.errors).toEqual([]);
    await small.context.close();
});

// ==================== 拖標題列吸附 ====================
const L = 'lyrics', R = 'results', A = 'ai';
const row = (k, s = k.map(() => 1)) => ({ d: 'row', k, s });
const col = (k, s = k.map(() => 1)) => ({ d: 'col', k, s });
// 只比結構（k 的樹），權重另外測
const shape = t => typeof t === 'string' ? t : { d: t.d, k: t.k.map(shape) };

test('_dkDrop：邊緣分割、中間互換、白名單之外回 null', async ({ browser }) => {
    const { context, page, errors } = await boot(browser);
    const drop = (t, src, dst, zone) => page.evaluate(([t, src, dst, zone]) => { const r = _dkDrop(t ?? _dkDefault(), src, dst, zone); return r && JSON.parse(JSON.stringify(r)); }, [t, src, dst, zone]);
    const sh = r => r && shape(r);
    expect(sh(await drop(null, A, R, 'bottom'))).toEqual(shape(row([L, col([R, A])])));
    expect(sh(await drop(null, L, R, 'bottom'))).toEqual(shape(row([col([R, L]), A])));
    expect(sh(await drop(null, L, A, 'center'))).toEqual(shape(row([A, R, L])));
    expect(sh(await drop(null, L, A, 'right'))).toEqual(shape(row([R, A, L])));
    expect(await drop(null, A, A, 'left')).toBeNull();
    expect(sh(await drop(row([L, col([R, A])]), L, A, 'left'))).toEqual(shape(col([R, row([L, A])])));
    expect(sh(await drop(col([R, row([L, A])]), A, R, 'bottom'))).toEqual(shape(col([R, A, L])));   // 三列疊放也是合法版型
    expect(await drop(row([L, R, A]), A, R, 'bottom')).not.toBeNull();
    // 輸入沒被改動
    const t = row([L, R, A], [28, 44, 28]);
    await page.evaluate(t => { window.__t = t; _dkDrop(t, 'ai', 'results', 'bottom'); }, t);
    expect(await page.evaluate(() => window.__t)).toEqual(t);
    expect(errors).toEqual([]);
    await context.close();
});

// 滑鼠拖：按下 → 分段移動；回傳放開前的 hook
const grab = async (page, handle, to, steps = 12) => {
    const [x, y] = await centerOf(page.locator(handle));
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(to[0], to[1], { steps });
};
const atFraction = (b, fx, fy) => [b.x + b.width * fx, b.y + b.height * fy];

test('拖放：AI 標題列拖到查詢區下緣 → 預覽在下半、放開變一大兩小並可重新整理保留', async ({ browser }) => {
    const { context, page, errors } = await boot(browser);
    const b0 = await boxes(page);
    await grab(page, '#rightPanel .ai-title-group', atFraction(b0.results, 0.5, 0.9));
    const pv = page.locator('#dockPreview');
    await expect(pv).toBeVisible();
    // 預覽框有 0.12 秒的位移動畫，等它到位
    await expect.poll(async () => {
        const pb = await pv.boundingBox();
        return Math.max(Math.abs(pb.x - b0.results.x), Math.abs(pb.width - b0.results.width), Math.abs(pb.y - (b0.results.y + b0.results.height / 2)));
    }).toBeLessThanOrEqual(12);
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('dockPreview')).zIndex)).toBe('850');
    await page.mouse.up();
    await expect(pv).toBeHidden();
    const b = await boxes(page);
    near(b.ai.x, b.results.x); near(b.ai.width, b.results.width);
    expect(b.ai.y).toBeGreaterThan(b.results.y + b.results.height - 1);
    near(b.lyrics.height, b.results.height + b.ai.height + 8, 2);   // gap = 0.5rem
    expect(b.lyrics.x).toBeLessThan(b.results.x);
    expect(await page.evaluate(() => window.getSelection().toString())).toBe('');
    await reloadReady(page);
    const r = await boxes(page);
    for (const k of ['lyrics', 'results', 'ai']) sameBox(r[k], b[k]);
    expect(errors).toEqual([]);
    await context.close();
});

test('拖放：歌曲名稱拖到 AI 中間 → 歌詞與 AI 互換', async ({ browser }) => {
    const { context, page, errors } = await boot(browser, withSong([typed('sa', 'verse', '一二三')]));
    const b0 = await boxes(page);
    await grab(page, '#songCurrent', atFraction(b0.ai, 0.5, 0.5));
    await expect(page.locator('#dockPreview')).toBeVisible();
    await page.mouse.up();
    const b = await boxes(page);
    near(b.ai.x, b0.lyrics.x); near(b.ai.width, b0.lyrics.width);
    near(b.lyrics.x, b0.ai.x); near(b.lyrics.width, b0.ai.width);
    near(b.results.x, b0.results.x);
    expect(errors).toEqual([]);
    await context.close();
});

test('拖放：落在自己身上不顯示預覽、放開不變；收起 AI 變上下二分', async ({ browser }) => {
    const { context, page, errors } = await boot(browser, { ...BASE_SEEDS, ...seedDock(col([R, row([L, A])])) });
    const b0 = await boxes(page);
    await grab(page, '#rightPanel .ai-title-group', atFraction(b0.ai, 0.5, 0.5));   // 拖回自己的區塊
    await expect(page.locator('#dockPreview')).toBeHidden();
    await page.mouse.up();
    const b1 = await boxes(page);
    for (const k of ['lyrics', 'results', 'ai']) sameBox(b1[k], b0[k]);
    await page.locator('#rightPanel .side-panel-tab').click();
    const b2 = await boxes(page);
    near(b2.results.x, b2.lyrics.x); near(b2.results.width, b2.lyrics.width);
    expect(b2.lyrics.y).toBeGreaterThan(b2.results.y + b2.results.height - 1);
    expect(errors).toEqual([]);
    await context.close();
});

test('拖放：Esc 取消、標題列按鈕仍是點擊', async ({ browser }) => {
    const { context, page, errors } = await boot(browser, withSong([typed('sa', 'verse', '一二三')]));
    const b0 = await boxes(page);
    await grab(page, '#rightPanel .ai-title-group', atFraction(b0.results, 0.5, 0.9));
    await expect(page.locator('#dockPreview')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#dockPreview')).toBeHidden();
    await page.mouse.up();
    const b1 = await boxes(page);
    for (const k of ['lyrics', 'results', 'ai']) sameBox(b1[k], b0[k]);
    expect(await storedDock(page)).toBeNull();
    await page.locator('#editorOpenBtn').click();
    await expect(page.locator('#lyricsEditor')).toBeVisible();
    expect(errors).toEqual([]);
    await context.close();
});


// ===== 全部版型與順序：互相都拖得到 =====
// 6 種版型 × 各種順序（三欄 6、三列 6、左1右2 6、左2右1 6、上1下2 6、上2下1 6）＝36 個狀態；
// 從任何一個狀態出發，用 _dkDrop 的任意一次拖放，都能走到另外 35 個（強連通）
test('版型：36 種排列組合每一個都拖得到，且任兩種都能互相切換', async ({ browser }) => {
    const { context, page, errors } = await boot(browser);
    const r = await page.evaluate(() => {
        const ids = ['lyrics', 'results', 'ai'], zones = ['left', 'right', 'top', 'bottom', 'center'];
        const key = t => typeof t === 'string' ? t[0] : t.d[0] + '(' + t.k.map(key).join(',') + ')';
        const states = new Map(), edges = new Map();
        const todo = [_dkDefault()];
        states.set(key(todo[0]), todo[0]);
        while (todo.length) {
            const t = todo.pop(), out = new Set();
            for (const src of ids) for (const dst of ids) for (const z of zones) {
                const n = _dkDrop(t, src, dst, z);
                if (!n) continue;
                const k = key(n);
                out.add(k);
                if (!states.has(k)) { states.set(k, n); todo.push(n); }
            }
            edges.set(key(t), out);
        }
        // 每個狀態都能走回預設（加上從預設走得到＝強連通）
        const reach = from => { const seen = new Set([from]), q = [from]; while (q.length) for (const n of edges.get(q.pop())) if (!seen.has(n)) { seen.add(n); q.push(n); } return seen; };
        const all = [...states.keys()];
        const bad = all.filter(k => reach(k).size !== all.length);
        return { count: all.length, keys: all.sort(), bad };
    });
    expect(r.count).toBe(36);
    expect(r.bad).toEqual([]);
    expect(errors).toEqual([]);
    await context.close();
});

// ===== 真滑鼠把 36 種排列組合全部走一遍 =====
// 用模型（_dkDrop）算出「從現在這個版面，怎麼拖一次能走到下一個沒去過的版面」，再用真的滑鼠拖標題列去執行，
// 每一步檢查畫面上三塊的位置與模型一致、不重疊、都在視窗內、重新整理後還在。
test('真滑鼠拖：走遍 36 種版型與順序，每一步畫面與模型一致', async ({ browser }) => {
    test.setTimeout(240000);
    const { context, page, errors } = await boot(browser);
    const IDS = { lyrics: '#leftPanel', results: '#mainContainer', ai: '#rightPanel' };
    const key = t => typeof t === 'string' ? t[0] : t.d[0] + '(' + t.k.map(key).join(',') + ')';
    const ZONE_PT = { left: [0.1, 0.5], right: [0.9, 0.5], top: [0.5, 0.1], bottom: [0.5, 0.9], center: [0.5, 0.5] };
    const state = () => page.evaluate(() => ({ vis: JSON.parse(JSON.stringify(_dkVis)), rects: _dkRects }));
    // 模型：從 t 找到最短的一串拖放走到 target（BFS，記下 src、dst、zone）
    const plan = (t, goals) => page.evaluate(([t, goals]) => {
        const key = n => typeof n === 'string' ? n[0] : n.d[0] + '(' + n.k.map(key).join(',') + ')';
        const ids = ['lyrics', 'results', 'ai'], zones = ['left', 'right', 'top', 'bottom', 'center'];
        const seen = new Map([[key(t), null]]), q = [t];
        while (q.length) {
            const cur = q.shift();
            if (goals.includes(key(cur)) && key(cur) !== key(t)) { const path = []; let k = key(cur); while (seen.get(k)) { path.unshift(seen.get(k).mv); k = seen.get(k).from; } return path; }
            for (const src of ids) for (const dst of ids) for (const zone of zones) {
                const n = _dkDrop(cur, src, dst, zone);
                if (n && !seen.has(key(n))) { seen.set(key(n), { from: key(cur), mv: [src, dst, zone] }); q.push(n); }
            }
        }
        return null;
    }, [t, goals]);
    // 把手：查詢區的標題列中間常有按鈕，從左往右找第一個不是按鈕、輸入框的點
    const handlePt = async src => {
        const sel = { lyrics: '#leftPanel .lyrics-head', results: '#mainContainer > .header', ai: '#rightPanel .ai-title-group' }[src];
        const b = await page.locator(sel).first().boundingBox();
        for (let f = 0.05; f < 0.95; f += 0.05) {
            const x = b.x + b.width * f, y = b.y + b.height / 2;
            const ok = await page.evaluate(([x, y, sel]) => { const e = document.elementFromPoint(x, y); return !!e && !!e.closest(sel) && !e.closest('button, input, select, textarea, a, label, [onclick], [role="button"], [contenteditable="true"], .model-picker'); }, [x, y, sel]);
            if (ok) return [x, y];
        }
        throw new Error('找不到可拖的標題列位置：' + src);
    };
    const check = async (label) => {
        const { vis, rects } = await state();
        await waitStill(page);
        for (const id of Object.keys(IDS)) {
            const b = await page.locator(IDS[id]).boundingBox();
            near(b.x, rects[id].x, 2); near(b.y, rects[id].y, 2); near(b.width, rects[id].w, 2); near(b.height, rects[id].h, 2);
            expect(b.x, label).toBeGreaterThanOrEqual(-1); expect(b.y, label).toBeGreaterThanOrEqual(-1);
            expect(b.x + b.width, label).toBeLessThanOrEqual(1921); expect(b.y + b.height, label).toBeLessThanOrEqual(1081);
        }
        const ids = Object.keys(IDS);
        for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
            const a = rects[ids[i]], b = rects[ids[j]];
            expect(a.x + a.w <= b.x + 1 || b.x + b.w <= a.x + 1 || a.y + a.h <= b.y + 1 || b.y + b.h <= a.y + 1, label + '：' + ids[i] + ' 與 ' + ids[j] + ' 重疊').toBe(true);
        }
        return key(vis);
    };
    const visited = new Set([await check('預設')]);
    const ALL = await page.evaluate(() => {
        const key = n => typeof n === 'string' ? n[0] : n.d[0] + '(' + n.k.map(key).join(',') + ')';
        const ids = ['lyrics', 'results', 'ai'], zones = ['left', 'right', 'top', 'bottom', 'center'];
        const seen = new Map([[key(_dkDefault()), _dkDefault()]]), q = [_dkDefault()];
        while (q.length) { const c = q.shift(); for (const s of ids) for (const d of ids) for (const z of zones) { const n = _dkDrop(c, s, d, z); if (n && !seen.has(key(n))) { seen.set(key(n), n); q.push(n); } } }
        return [...seen.keys()];
    });
    expect(ALL).toHaveLength(36);
    let guard = 0;
    while (visited.size < 36 && guard++ < 60) {
        const { vis } = await state();
        const todo = ALL.filter(k => !visited.has(k));
        const path = await plan(vis, todo);
        expect(path, '找不到下一個版面').not.toBeNull();
        for (const [src, dst, zone] of path) {
            const { rects } = await state();
            const [hx, hy] = await handlePt(src);
            const r = rects[dst], [fx, fy] = ZONE_PT[zone];
            await page.mouse.move(hx, hy);
            await page.mouse.down();
            await page.mouse.move(r.x + r.w * fx, r.y + r.h * fy, { steps: 8 });
            await expect(page.locator('#dockPreview')).toBeVisible();
            await page.mouse.up();
            visited.add(await check(`${src}→${dst}:${zone}`));
        }
    }
    expect(visited.size).toBe(36);
    // 最後一個版面重新整理後還在
    const last = await state();
    await reloadReady(page);
    expect(await page.evaluate(() => { const key = n => typeof n === 'string' ? n[0] : n.d[0] + '(' + n.k.map(key).join(',') + ')'; return key(_dkVis); })).toBe(key(last.vis));
    expect(errors).toEqual([]);
    await context.close();
});
