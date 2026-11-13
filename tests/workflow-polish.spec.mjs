// 寫詞體驗修整（quick 261113-qlv）：完整編輯器全螢幕、桌機浮動列移到段落、底部 sheet 拖曳高度
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage } from './helpers.mjs';
import { DEVICES, waitStill } from './layout-lib.mjs';

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

// ===== 完整編輯器幾乎全螢幕 =====

test('編輯器：非 dock 桌機，四邊留白 = --page-pad，上下與左側面板對齊', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: storage() });
    await openLeft(page);
    await waitStill(page);
    const panel = await page.locator('#leftPanel').boundingBox();
    const pad = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--page-pad')));
    expect(pad).toBe(20);
    await page.locator('#editorOpenBtn').click();
    const box = await page.locator('#lyricsEditor .lyrics-editor').boundingBox();
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
    await page.locator('#editorOpenBtn').click();
    const box = await page.locator('#lyricsEditor .lyrics-editor').boundingBox();
    near(box.x, left);
    near(box.y, top);
    near(box.x + box.width, right);
    near(box.y + box.height, bottom);
    expect(errors).toEqual([]);
    await context.close();
});

test('編輯器：鍵盤開啟時貼滿可見範圍，收起後恢復留白', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: storage() });
    await openLeft(page);
    await page.locator('#editorOpenBtn').click();
    const before = await page.locator('#lyricsEditor .lyrics-editor').boundingBox();
    await page.evaluate(() => document.documentElement.classList.add('kb-open'));
    const kb = await page.locator('#lyricsEditor .lyrics-editor').boundingBox();
    near(kb.x, 0);
    near(kb.width, 1440);
    await page.evaluate(() => document.documentElement.classList.remove('kb-open'));
    const after = await page.locator('#lyricsEditor .lyrics-editor').boundingBox();
    near(after.x, before.x);
    near(after.width, before.width);
    expect(errors).toEqual([]);
    await context.close();
});
