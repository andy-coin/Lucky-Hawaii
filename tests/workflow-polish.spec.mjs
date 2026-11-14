// 寫詞體驗修整（quick 261113-qlv）：完整編輯器全螢幕、桌機浮動列移到段落、底部 sheet 拖曳高度
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage } from './helpers.mjs';
import { DEVICES, waitStill } from './layout-lib.mjs';
import { centerOf, mouseDrag, touchSession } from './drag-lib.mjs';

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/v096-localStorage.json', import.meta.url), 'utf8'));
const typed = (id, type, text, extra = {}) => ({ id, type, custom: '', color: '', height: null, label: '', text, collapsed: false, ...extra });
const song = (id, title, sections, createdAt) => ({ id, title, sections, hashtags: [], context: '', createdAt, updatedAt: createdAt });
const SONGS = [
    song('s1', '第一首', [typed('sa', 'verse', '一二三\n四五六'), typed('sb', 'chorus', '七八九')], 1),
];
const storage = (extra = {}) => ({ ...FIXTURE, 'lh:schema': '2', 'lh:songs': JSON.stringify(SONGS), 'lh:activeSong': 's1', 'lh:tourSeen': '1', ...extra });
const openLeft = page => page.evaluate(() => { const lp = document.getElementById('leftPanel'); if (lp.classList.contains('collapsed')) { if (lhIsSheetMode()) mobileTab('lyrics'); else toggleLeftPanel(); } });
const near = (a, b, tol = 1) => expect(Math.abs(a - b), `${a} 應約等於 ${b}`).toBeLessThanOrEqual(tol);

const WIDE = { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 };
const BASE_SEEDS = { 'lh:tourSeen': '1', leftPanelCollapsed: 'false', rightPanelCollapsed: 'false' };

// ===== 完整編輯器幾乎全螢幕（0.98.03 起平板、電腦是歌詞面板拉寬：#leftPanel；手機仍是浮動面板） =====

test('編輯器：非 dock 桌機，四邊留白 = --page-pad，上下與左側面板對齊', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: storage() });
    await openLeft(page);
    await waitStill(page);
    const panel = await page.locator('#leftPanel').boundingBox();
    const pad = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--page-pad')));
    expect(pad).toBe(20);
    await page.locator('#editorOpenBtn').click(); await page.waitForFunction(() => !document.body.classList.contains('lp-anim'));
    const box = await page.locator('#leftPanel').boundingBox();
    near(box.x, pad);
    near(1440 - (box.x + box.width), pad);
    near(box.y, panel.y);
    near(900 - (box.y + box.height), 900 - (panel.y + panel.height));
    expect(errors).toEqual([]);
    await context.close();
});

test('編輯器：dock 寬螢幕，四邊與三塊合起來的外框對齊', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', device: WIDE, storage: storage(BASE_SEEDS) });
    await waitStill(page);
    expect(await page.evaluate(() => document.body.classList.contains('dock'))).toBe(true);
    const bs = [];
    for (const s of ['#leftPanel', '#mainContainer', '#rightPanel']) bs.push(await page.locator(s).boundingBox());
    const left = Math.min(...bs.map(b => b.x));
    const top = Math.min(...bs.map(b => b.y));
    const right = Math.max(...bs.map(b => b.x + b.width));
    const bottom = Math.max(...bs.map(b => b.y + b.height));
    await page.locator('#editorOpenBtn').click(); await page.waitForFunction(() => !document.body.classList.contains('lp-anim'));
    const box = await page.locator('#leftPanel').boundingBox();
    near(box.x, left);
    near(box.y, top);
    near(box.x + box.width, right);
    near(box.y + box.height, bottom);
    expect(errors).toEqual([]);
    await context.close();
});

test('編輯器（手機浮動面板）：鍵盤開啟時貼滿可見範圍，收起後恢復留白', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.phone, storage: storage() });
    await openLeft(page);
    await page.evaluate(() => lhEditorOpen());
    const before = await page.locator('#lyricsEditor .lyrics-editor').boundingBox();
    await page.evaluate(() => document.documentElement.classList.add('kb-open'));
    const kb = await page.locator('#lyricsEditor .lyrics-editor').boundingBox();
    near(kb.x, 0);
    near(kb.width, page.viewportSize().width);
    await page.evaluate(() => document.documentElement.classList.remove('kb-open'));
    const after = await page.locator('#lyricsEditor .lyrics-editor').boundingBox();
    near(after.x, before.x);
    near(after.width, before.width);
    expect(errors).toEqual([]);
    await context.close();
});

// ===== 底部 sheet：把手拖曳調整高度 =====

const SHEET = { viewport: { width: 800, height: 900 }, deviceScaleFactor: 1 };
const H = 900;
const LP = '#leftPanel', RP = '#rightPanel', HANDLE = ' .sheet-handle';
const heightOf = (page, sel) => page.locator(sel).evaluate(el => el.getBoundingClientRect().height);
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('lh:sheetH')));
const isCollapsed = (page, sel) => page.locator(sel).evaluate(el => el.classList.contains('collapsed'));
const openSheet = async (page, tab = 'lyrics') => {
    await page.locator(`#mtab-${tab}`).click();
    await waitStill(page);
};

test('sheet 把手：滑鼠往上拖加高、拖到頂卡 95%、兩個 sheet 共用、重新整理還在', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: SHEET, storage: storage() });
    await openSheet(page);
    const h0 = await heightOf(page, LP);
    near(h0, 0.78 * H, 2);
    const handle = page.locator(LP + HANDLE);
    await mouseDrag(page, await centerOf(handle), [(await centerOf(handle))[0], (await centerOf(handle))[1] - 100]);
    await waitStill(page);
    near(await heightOf(page, LP), h0 + 100, 2);
    expect(await isCollapsed(page, LP)).toBe(false);
    near(await stored(page), (h0 + 100) / H, 0.01);
    // 再拖到畫面頂：卡在 95%
    const c = await centerOf(handle);
    await mouseDrag(page, c, [c[0], 0]);
    await waitStill(page);
    near(await heightOf(page, LP), 0.95 * H, 2);
    // 切到 AI sheet：同一個高度
    await page.locator('#mtab-ai').click();
    await waitStill(page);
    near(await heightOf(page, RP), 0.95 * H, 2);
    // 重新整理後還在
    await page.reload();
    await openSheet(page);
    near(await heightOf(page, LP), 0.95 * H, 2);
    expect(errors).toEqual([]);
    await context.close();
});

test('sheet 把手：拉到很低就收起，存的高度不變；只點一下也是收起', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: SHEET, storage: storage() });
    await openSheet(page);
    const h0 = await heightOf(page, LP);
    const c = await centerOf(page.locator(LP + HANDLE));
    await mouseDrag(page, c, [c[0], c[1] - 80]);
    await waitStill(page);
    const keep = await stored(page);
    near(await heightOf(page, LP), h0 + 80, 2);
    // 往下拖到底邊：收起，不存
    const c2 = await centerOf(page.locator(LP + HANDLE));
    await mouseDrag(page, c2, [c2[0], 890]);
    await waitStill(page);
    expect(await isCollapsed(page, LP)).toBe(true);
    expect(await stored(page)).toBe(keep);
    // 再打開：還是上次的高度
    await openSheet(page);
    near(await heightOf(page, LP), h0 + 80, 2);
    // 只點一下：收起
    await page.locator(LP + HANDLE).click();
    await waitStill(page);
    expect(await isCollapsed(page, LP)).toBe(true);
    expect(errors).toEqual([]);
    await context.close();
});

test('sheet 把手：觸控往上拖加高，點一下收起；把手 touch-action:none、內容區不是', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.phone, storage: storage() });
    await openSheet(page, 'ai');
    const h0 = await heightOf(page, RP);
    const handle = page.locator(RP + HANDLE);
    expect(await handle.evaluate(el => getComputedStyle(el).touchAction)).toBe('none');
    expect(await page.locator('#leftPanel .side-panel-body').evaluate(el => getComputedStyle(el).touchAction)).not.toBe('none');
    const c = await centerOf(handle);
    const ts = await touchSession(page);
    await ts.drag(c, [c[0], c[1] - 100]);   // 手機 844 高：78% = 658，往上 100 = 758 < 95% (802)
    await waitStill(page);
    near(await heightOf(page, RP), h0 + 100, 2);
    expect(await isCollapsed(page, RP)).toBe(false);
    await handle.tap();
    await waitStill(page);
    expect(await isCollapsed(page, RP)).toBe(true);
    expect(errors).toEqual([]);
    await context.close();
});

for (const [raw, expected] of [['abc', 0.78], ['5', 0.78], ['0.1', 0.78], ['"0.9"', 0.78], ['0.9', 0.9]]) {
    test(`sheet 高度存檔：${raw} → ${expected === 0.78 ? '回到預設 78%' : '照存的比例'}`, async ({ browser }) => {
        const { context, page, errors } = await bootPage(browser, { device: SHEET, storage: storage({ 'lh:sheetH': raw }) });
        await openSheet(page);
        near(await heightOf(page, LP), Math.min(expected * H, 52 * 16), 2);
        expect(errors).toEqual([]);
        await context.close();
    });
}
