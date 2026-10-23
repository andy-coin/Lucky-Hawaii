// 段落排序（第 9 階段 09-06，EDIT-02）：⋮⋮ 把手、滑鼠／手指／鍵盤、取消、自動捲動
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage, activeSongRaw, STORAGE_SPY } from './helpers.mjs';
import { DEVICES, waitStill } from './layout-lib.mjs';
import { centerOf, mouseDrag, touchSession } from './drag-lib.mjs';

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/v096-localStorage.json', import.meta.url), 'utf8'));
const v2Storage = songs => ({ ...FIXTURE, 'lh:schema': '2', 'lh:songs': JSON.stringify(songs), 'lh:activeSong': songs[0].id });
const typed = (id, type, text, extra = {}) => ({ id, type, custom: '', color: '', height: null, label: '', text, collapsed: false, ...extra });
const song = (sections, extra = {}) => ({ id: 's1', title: '測試歌', sections, hashtags: [], context: '', createdAt: 1, updatedAt: 1, ...extra });
const ABC = () => v2Storage([song([typed('sa', 'verse', 'A'), typed('sb', 'chorus', 'B'), typed('sc', 'verse', 'C')])]);
const ids = page => page.locator('#lyricsSections .lyrics-section').evaluateAll(els => els.map(e => e.dataset.id));
const labels = page => page.locator('#lyricsSections .section-type').evaluateAll(els => els.map(e => e.textContent));
const handle = (page, n) => page.locator('#lyricsSections .lyrics-section').nth(n).locator('.section-handle');
const undoDisabled = page => page.locator('#undoBtn').getAttribute('aria-disabled');
const noTrace = page => page.evaluate(() => ({
    ghost: document.querySelectorAll('.section-drag-ghost').length,
    line: document.querySelectorAll('.section-drop-line').length,
    dragging: document.querySelectorAll('.lyrics-section.dragging').length,
    body: document.body.classList.contains('is-section-dragging'),
}));
const CLEAN = { ghost: 0, line: 0, dragging: 0, body: false };

// 第 n 段上緣略往上（落在前一段的下半或最上面之外）
async function aboveSection(page, n, dy = 0.25) {
    const b = await page.locator('#lyricsSections .lyrics-section').nth(n).boundingBox();
    return [b.x + b.width / 2, b.y + b.height * dy];
}

test('排序：滑鼠拖把手', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: ABC() });
    expect(await ids(page)).toEqual(['sa', 'sb', 'sc']);
    await mouseDrag(page, await centerOf(handle(page, 2)), await aboveSection(page, 0));
    expect(await ids(page)).toEqual(['sc', 'sa', 'sb']);
    expect(await labels(page)).toEqual(['Verse I', 'Verse II', 'Chorus']);
    const raw = await activeSongRaw(page);   // 不 flush：移動本身要存檔
    expect(raw.sections.map(s => s.id)).toEqual(['sc', 'sa', 'sb']);
    expect(raw.sections.map(s => s.label)).toEqual(['Verse I', 'Verse II', 'Chorus']);
    await expect(page.locator('#lhLive')).toHaveText('Verse I 已移到第 1 段，共 3 段');
    expect(await noTrace(page)).toEqual(CLEAN);
    await page.locator('#undoBtn').click();
    expect(await ids(page)).toEqual(['sa', 'sb', 'sc']);
    expect(errors).toEqual([]);
    await context.close();
});

// ===== 第二批：手指、取消、自動捲動、被打斷 =====
const MANY = n => v2Storage([song(Array.from({ length: n }, (_, i) => typed('s' + i, i % 3 === 1 ? 'chorus' : 'verse', '第' + i + '段')))]);
// 已經開著就不再按（再按同一個分頁會收起）
const openSheet = async page => { await page.evaluate(() => { if (document.getElementById('leftPanel').classList.contains('collapsed')) mobileTab('lyrics'); }); await waitStill(page); };
const area = page => page.locator('#lyricsSections');

test('排序：手指拖把手', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.phone, storage: ABC() });
    await openSheet(page);
    await handle(page, 2).scrollIntoViewIfNeeded();
    const touch = await touchSession(page);
    await touch.drag(await centerOf(handle(page, 2)), await aboveSection(page, 0));
    expect(await ids(page)).toEqual(['sc', 'sa', 'sb']);
    expect((await activeSongRaw(page)).sections.map(s => s.id)).toEqual(['sc', 'sa', 'sb']);
    expect(await noTrace(page)).toEqual(CLEAN);
    await page.locator('#undoBtn').click();
    expect(await ids(page)).toEqual(['sa', 'sb', 'sc']);
    expect(await undoDisabled(page)).toBe('true');   // 只有一步
    expect(errors).toEqual([]);
    await context.close();
});

test('排序：手指不會讓列表在指頭下捲動', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.tablet, storage: MANY(12) });
    await openSheet(page);
    // 讓第 5 個把手落在可視區上緣下 230px（段落高度會隨拉桿等版面改變，不能寫死捲動量）
    const scrolled = await area(page).evaluate(el => {
        const h = el.querySelectorAll('.section-handle')[4].getBoundingClientRect();
        el.scrollTop += h.top + h.height / 2 - el.getBoundingClientRect().top - 230;
        return el.scrollTop;
    });
    // 找一個離上下緣夠遠、往上拖 100px 還在捲動區外的把手
    const pick = await page.evaluate(() => {
        const r = document.getElementById('lyricsSections').getBoundingClientRect();
        const hs = [...document.querySelectorAll('.section-handle')];
        const i = hs.findIndex(h => { const b = h.getBoundingClientRect(); return b.top + b.height / 2 > r.top + 180 && b.top + b.height / 2 < r.bottom - 100; });
        return i;
    });
    expect(pick).toBeGreaterThan(0);
    const before = await ids(page);
    const [x, y] = await centerOf(handle(page, pick));
    const touch = await touchSession(page);
    await touch.drag([x, y], [x, (await aboveSection(page, pick - 1, 0.45))[1]]);   // 拖進前一段的上半（段落高度會變，不寫死距離；留在自動捲動區之外）
    expect(await area(page).evaluate(el => el.scrollTop)).toBe(scrolled);
    const after = await ids(page);
    expect(after[pick - 1]).toBe(before[pick]);   // 往上跨過前一段
    expect(after[pick]).toBe(before[pick - 1]);
    expect(errors).toEqual([]);
    await context.close();
});

test('排序：Esc 取消', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: ABC() });
    const rawBefore = JSON.stringify(await activeSongRaw(page));
    const from = await centerOf(handle(page, 2));
    await page.mouse.move(...from);
    await page.mouse.down();
    await page.mouse.move(...(await aboveSection(page, 0)), { steps: 8 });
    await expect(page.locator('.section-drag-ghost')).toHaveCount(1);
    await expect(page.locator('.section-drop-line')).toHaveCount(1);
    await page.keyboard.press('Escape');
    expect(await noTrace(page)).toEqual(CLEAN);
    await page.mouse.up();
    expect(await ids(page)).toEqual(['sa', 'sb', 'sc']);
    await page.waitForTimeout(400);
    expect(JSON.stringify(await activeSongRaw(page))).toBe(rawBefore);
    expect(await undoDisabled(page)).toBe('true');
    expect(await page.locator('.sec-flash').count()).toBe(0);
    expect(errors).toEqual([]);
    await context.close();
});

test('排序：Esc 只取消拖曳，不收起底部 sheet', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.phone, storage: ABC() });
    await openSheet(page);
    await handle(page, 2).scrollIntoViewIfNeeded();
    await page.mouse.move(...(await centerOf(handle(page, 2))));
    await page.mouse.down();
    await page.mouse.move(...(await aboveSection(page, 0)), { steps: 8 });
    await expect(page.locator('.section-drag-ghost')).toHaveCount(1);
    await page.keyboard.press('Escape');
    expect(await noTrace(page)).toEqual(CLEAN);
    await page.mouse.up();
    expect(await page.locator('#leftPanel').evaluate(el => el.classList.contains('collapsed'))).toBe(false);
    expect(await ids(page)).toEqual(['sa', 'sb', 'sc']);
    // 沒有拖曳時 Esc 還是收起 sheet（沒被我們吃掉）
    await page.keyboard.press('Escape');
    await expect(page.locator('#leftPanel')).toHaveClass(/collapsed/);
    expect(errors).toEqual([]);
    await context.close();
});

test('排序：放回原位不算', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: ABC(), init: STORAGE_SPY });
    await page.evaluate(() => { window.__lsWrites.length = 0; });
    const [x, y] = await centerOf(handle(page, 1));
    await mouseDrag(page, [x, y], [x, y + 12]);   // 超過 4px 但還在自己這一格
    await page.waitForTimeout(450);
    expect(await page.evaluate(() => window.__lsWrites.filter(w => w.k === 'lh:songs').length)).toBe(0);
    expect(await ids(page)).toEqual(['sa', 'sb', 'sc']);
    expect(await undoDisabled(page)).toBe('true');
    expect(await page.locator('.sec-flash').count()).toBe(0);
    expect(await page.locator('#lhLive').textContent()).toBe('');
    expect(await noTrace(page)).toEqual(CLEAN);
    expect(errors).toEqual([]);
    await context.close();
});

test('排序：內容與捲動不變', async ({ browser }) => {
    const long = Array.from({ length: 80 }, (_, i) => '第' + i + '行').join('\n');
    const { context, page, errors } = await bootPage(browser, {
        device: DEVICES.desktop,
        storage: v2Storage([song([typed('sa', 'verse', 'A'), typed('sb', 'chorus', long), typed('sc', 'verse', 'C')])]),
    });
    await page.evaluate(() => {
        const ta = document.querySelectorAll('.section-textarea')[1];
        ta.scrollTop = 120;
        ta.setSelectionRange(5, 5);
        window.__ta = ta;
    });
    await mouseDrag(page, await centerOf(handle(page, 2)), await aboveSection(page, 1));
    expect(await ids(page)).toEqual(['sa', 'sc', 'sb']);
    const m = await page.evaluate(() => {
        const ta = document.querySelectorAll('.section-textarea')[2];
        return { same: ta === window.__ta, top: ta.scrollTop, sel: ta.selectionStart, len: ta.value.length, idx: ta.closest('.lyrics-section').dataset.index };
    });
    expect(m).toEqual({ same: true, top: 120, sel: 5, len: long.length, idx: '2' });
    expect(errors).toEqual([]);
    await context.close();
});

// 12 段的手機：從第一段拖到靠近下緣，停在警戒區內一陣子，列表自己捲；放開在最底就是最後一段
async function autoScrollCase(browser, device) {
    const { context, page, errors } = await bootPage(browser, { device, storage: MANY(12) });
    await openSheet(page);
    const r = await area(page).evaluate(el => { const b = el.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, x: b.left + b.width / 2 }; });
    const [hx, hy] = await centerOf(handle(page, 0));
    await page.mouse.move(hx, hy);
    await page.mouse.down();
    await page.mouse.move(r.x, r.bottom - 16, { steps: 8 });
    const t0 = await area(page).evaluate(el => el.scrollTop);
    for (let i = 0; i < 20; i++) { await page.mouse.move(r.x, r.bottom - 16 + (i % 2), {}); await page.waitForTimeout(16); }
    const t1 = await area(page).evaluate(el => el.scrollTop);
    expect(t1).toBeGreaterThan(t0);
    // 繼續停著，捲到底
    await page.waitForFunction(() => { const a = document.getElementById('lyricsSections'); return a.scrollTop + a.clientHeight >= a.scrollHeight - 1; }, null, { timeout: 20000 });
    await page.mouse.move(r.x, r.bottom - 2);
    await page.mouse.up();
    const order = await ids(page);
    expect(order[11]).toBe('s0');
    expect(order.slice(0, 11)).toEqual(Array.from({ length: 11 }, (_, i) => 's' + (i + 1)));
    expect(await noTrace(page)).toEqual(CLEAN);
    expect(errors).toEqual([]);
    await context.close();
}

test('排序：靠邊自動捲', async ({ browser }) => {
    await autoScrollCase(browser, DEVICES.phone);
});

test('排序：減少動態仍會自動捲', async ({ browser }) => {
    await autoScrollCase(browser, { ...DEVICES.phone, reducedMotion: 'reduce' });
});

test('排序：拖到最上與最下', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: ABC() });
    const lineRect = () => page.locator('.section-drop-line').evaluate(el => { const b = el.getBoundingClientRect(); return { top: b.top, bottom: b.bottom }; });
    const secRect = n => page.locator('#lyricsSections .lyrics-section').nth(n).evaluate(el => { const b = el.getBoundingClientRect(); return { top: b.top, bottom: b.bottom }; });
    const panel = await page.locator('#leftPanel').boundingBox();
    const a = await area(page).boundingBox();
    // C 拖到最上：線在第一段上緣；殘影水平不超出面板（指標拉到視窗最右邊也一樣）
    await page.mouse.move(...(await centerOf(handle(page, 2))));
    await page.mouse.down();
    await page.mouse.move(a.x + a.width / 2, a.y + 1, { steps: 8 });
    await page.mouse.move(1430, a.y + 1, { steps: 4 });
    await expect(page.locator('.section-drag-ghost')).toHaveCount(1);
    const first = await secRect(0);
    const lr = await lineRect();
    expect(Math.abs(lr.top - first.top)).toBeLessThanOrEqual(8);
    const g = await page.locator('.section-drag-ghost').boundingBox();
    expect(g.x).toBeGreaterThanOrEqual(panel.x - 0.5);
    expect(g.x + g.width).toBeLessThanOrEqual(panel.x + panel.width + 0.5);
    await page.mouse.move(a.x + a.width / 2, a.y + 1, { steps: 4 });
    await page.mouse.up();
    expect(await ids(page)).toEqual(['sc', 'sa', 'sb']);
    const ph = await page.locator('.section-textarea').evaluateAll(els => els.map(e => e.placeholder));
    expect(ph).toEqual(['在這裡輸入或貼上歌詞…', '在這裡輸入歌詞…', '在這裡輸入歌詞…']);
    // 再把最上面那段拖到最下：線在最後一段下緣
    await page.mouse.move(...(await centerOf(handle(page, 0))));
    await page.mouse.down();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height - 2, { steps: 8 });
    await expect(page.locator('.section-drop-line')).toHaveCount(1);
    const last = await secRect(2);
    const lr2 = await lineRect();
    expect(Math.abs(lr2.bottom - last.bottom)).toBeLessThanOrEqual(8);
    await page.mouse.up();
    expect(await ids(page)).toEqual(['sa', 'sb', 'sc']);
    expect(await noTrace(page)).toEqual(CLEAN);
    expect(errors).toEqual([]);
    await context.close();
});

test('排序：重畫或切版型會中止', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: ABC() });
    const start = async (n = 2) => {
        await page.mouse.move(...(await centerOf(handle(page, n))));
        await page.mouse.down();
        await page.mouse.move(...(await aboveSection(page, 0)), { steps: 6 });
        await expect(page.locator('.section-drag-ghost')).toHaveCount(1);
    };
    // 1) 重畫列表
    await start();
    await page.evaluate(() => renderLyricsSections());
    expect(await noTrace(page)).toEqual(CLEAN);
    await page.mouse.up();
    expect(await ids(page)).toEqual(['sa', 'sb', 'sc']);
    // 2) 視窗縮到 900 以下
    await start();
    await page.setViewportSize({ width: 820, height: 1180 });
    await expect.poll(() => noTrace(page)).toEqual(CLEAN);
    await page.mouse.up();
    expect(await ids(page)).toEqual(['sa', 'sb', 'sc']);
    // 3) 底部 sheet 收起
    await openSheet(page);
    await start(1);   // 820 的 sheet 裡第三段在可見範圍外，用第二段
    await page.evaluate(() => mobileTab('search'));
    await expect.poll(() => noTrace(page)).toEqual(CLEAN);
    await page.mouse.up();
    expect(await ids(page)).toEqual(['sa', 'sb', 'sc']);
    expect(await undoDisabled(page)).toBe('true');
    expect(errors).toEqual([]);
    await context.close();
});

test('排序：選字與按名稱不會誤拖', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: ABC() });
    expect(await page.locator('.lyrics-section-header[draggable]').count()).toBe(0);
    // 在輸入框裡拖選文字、從名稱鈕往上拖：都不會出現殘影或換順序
    const ta = page.locator('#lyricsSections .section-textarea').nth(2);
    const tb = await ta.boundingBox();
    await page.mouse.move(tb.x + 20, tb.y + 20);
    await page.mouse.down();
    await page.mouse.move(tb.x + 20, tb.y - 200, { steps: 6 });
    expect(await noTrace(page)).toEqual(CLEAN);
    await page.mouse.up();
    const tp = await centerOf(page.locator('#lyricsSections .section-type').nth(2));
    await mouseDrag(page, tp, [tp[0], tp[1] - 300]);
    expect(await noTrace(page)).toEqual(CLEAN);
    expect(await ids(page)).toEqual(['sa', 'sb', 'sc']);
    expect(errors).toEqual([]);
    await context.close();
});

// ===== 鍵盤：Alt+↑／↓ =====
const activeIsHandleOf = (page, id) => page.evaluate(i => {
    const ae = document.activeElement;
    return !!ae && ae.classList.contains('section-handle') && ae.closest('.lyrics-section').dataset.id === i;
}, id);

test('排序：鍵盤移動', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: ABC() });
    await handle(page, 2).focus();
    await page.keyboard.press('Alt+ArrowUp');
    await page.keyboard.press('Alt+ArrowUp');
    expect(await ids(page)).toEqual(['sc', 'sa', 'sb']);
    expect(await activeIsHandleOf(page, 'sc')).toBe(true);
    expect((await activeSongRaw(page)).sections.map(s => s.id)).toEqual(['sc', 'sa', 'sb']);
    await expect(page.locator('#lhLive')).toHaveText('Verse I 已移到第 1 段，共 3 段');
    // 已在最上面：什麼都不變、不多一步歷史
    await page.keyboard.press('Alt+ArrowUp');
    expect(await ids(page)).toEqual(['sc', 'sa', 'sb']);
    await page.locator('#undoBtn').click();
    await page.locator('#undoBtn').click();
    expect(await ids(page)).toEqual(['sa', 'sb', 'sc']);
    expect(await undoDisabled(page)).toBe('true');   // 剛好兩步
    // 往下也一樣，最下面再按不動
    await handle(page, 0).focus();
    await page.keyboard.press('Alt+ArrowDown');
    await page.keyboard.press('Alt+ArrowDown');
    await page.keyboard.press('Alt+ArrowDown');
    expect(await ids(page)).toEqual(['sb', 'sc', 'sa']);
    expect(await activeIsHandleOf(page, 'sa')).toBe(true);
    expect(errors).toEqual([]);
    await context.close();
});

test('排序：鍵盤一步一個復原', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: ABC() });
    await handle(page, 0).focus();
    await page.keyboard.press('Alt+ArrowDown');
    expect(await ids(page)).toEqual(['sb', 'sa', 'sc']);
    expect(await undoDisabled(page)).toBe('false');
    await page.locator('#undoBtn').click();
    expect(await ids(page)).toEqual(['sa', 'sb', 'sc']);
    expect(await undoDisabled(page)).toBe('true');   // 只有那一步
    await page.locator('#redoBtn').click();
    expect(await ids(page)).toEqual(['sb', 'sa', 'sc']);
    // 沒有 Alt 的方向鍵不動
    await handle(page, 1).focus();
    await page.keyboard.press('ArrowUp');
    expect(await ids(page)).toEqual(['sb', 'sa', 'sc']);
    expect(errors).toEqual([]);
    await context.close();
});

// ===== 高度（第 9 階段 09-07，EDIT-02 後半）：段落底邊的拉桿 =====
const bar = (page, n) => page.locator('#lyricsSections .lyrics-section').nth(n).locator('.section-resize');
const taOf = (page, n) => page.locator('#lyricsSections .lyrics-section').nth(n).locator('.section-textarea');
const taPx = async (page, n) => (await taOf(page, n).boundingBox()).height;
const rootPx = page => page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
const rawH = async (page, n) => (await activeSongRaw(page)).sections[n].height;

test('高度：拖拉桿改高度', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: ABC() });
    await waitStill(page);
    const disabled0 = await undoDisabled(page);
    const before = await taPx(page, 0);
    const root = await rootPx(page);
    const [bx, by] = await centerOf(bar(page, 0));
    await mouseDrag(page, [bx, by], [bx, by + 80]);
    const after = await taPx(page, 0);
    expect(Math.abs(after - before - 80)).toBeLessThanOrEqual(2);
    const h = await rawH(page, 0);   // 不 flush：放開就要存
    expect(Math.abs(h - (before + 80) / root)).toBeLessThan(0.2);
    expect(Math.round(h * 10) / 10).toBe(h);
    expect(await undoDisabled(page)).toBe(disabled0);
    // 別段打字再 Cmd/Ctrl+Z：高度不動
    await taOf(page, 1).click();
    await page.keyboard.type('x');
    await page.keyboard.press('ControlOrMeta+z');
    expect(Math.abs((await taPx(page, 0)) - after)).toBeLessThanOrEqual(1);
    await page.reload();
    await waitStill(page);
    expect(Math.abs((await taPx(page, 0)) - after)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
    await context.close();
});
