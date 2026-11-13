// 自由畫布（完整編輯器的「吸附／自由」排版）：資料、切換、移動、拉大小、推開、復原、只捲畫布
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage, activeSongRaw } from './helpers.mjs';
import { DEVICES, emulateKeyboard, restoreViewport } from './layout-lib.mjs';
import { touchSession } from './drag-lib.mjs';

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/v096-localStorage.json', import.meta.url), 'utf8'));
const typed = (id, type, text, extra = {}) => ({ id, type, custom: '', color: '', height: null, label: '', text, collapsed: false, ...extra });
const song = (id, title, sections, createdAt, extra = {}) => ({ id, title, sections, hashtags: [], context: '', createdAt, updatedAt: createdAt, ...extra });
const storage = (songs, extra = {}) => ({ ...FIXTURE, 'lh:schema': '2', 'lh:songs': JSON.stringify(songs), 'lh:activeSong': songs[0].id, 'lh:tourSeen': '1', ...extra });
const plain = () => [song('s1', '第一首', [typed('sa', 'verse', '一二三'), typed('sb', 'chorus', '七八九')], 1)];
const storedSongs = page => page.evaluate(() => JSON.parse(localStorage.getItem('lh:songs')));

// ===== 資料：不用畫布就不留痕跡、壞值回預設、備份往返、位置進復原 =====

test('資料：沒用過畫布的歌，存檔沒有 canvas／pos', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: storage(plain()) });
    const ta = page.locator('#lyricsSections [data-id="sa"] .section-textarea');
    await ta.click();
    await page.keyboard.press('End');
    await page.keyboard.type('X');
    await page.evaluate(() => flushSongs());
    const raw = await page.evaluate(() => localStorage.getItem('lh:songs'));
    const songs = JSON.parse(raw);
    expect(songs.some(s => 'canvas' in s)).toBe(false);
    expect(songs.some(s => s.sections.some(x => 'pos' in x))).toBe(false);
    expect(raw).not.toContain('"canvas":');
    expect(raw).not.toContain('"pos":');
    expect(Object.keys(songs[0]).sort()).toEqual(Object.keys(plain()[0]).sort());
    expect(errors).toEqual([]);
    await context.close();
});

test('資料：壞值讀進來回預設', async ({ browser }) => {
    const s1 = song('s1', '第一首', [
        typed('sa', 'verse', 'a', { pos: { x: -5, y: 10.6, w: 50, h: 1e7 } }),
        typed('sb', 'verse', 'b', { pos: 'bad' }),
        typed('sc', 'verse', 'c', { pos: { x: 1 } }),
    ], 1, { canvas: { mode: 'weird', zoom: 99, panX: 'x', panY: 1e9 } });
    const s2 = song('s2', '第二首', [typed('sd', 'verse', 'd')], 2, { canvas: 'str' });
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: storage([s1, s2]) });
    const st = await page.evaluate(() => {
        const a = songs.find(s => s.id === 's1'), b = songs.find(s => s.id === 's2');
        return { canvas: a.canvas, pos: a.sections.map(x => x.pos ?? null), has1: a.sections.map(x => 'pos' in x), hasCanvas2: 'canvas' in b };
    });
    expect(st.canvas).toEqual({ mode: 'snap' });
    expect(st.pos[0]).toEqual({ x: 0, y: 11, w: 160, h: 2400 });
    expect(st.has1).toEqual([true, false, false]);
    expect(st.hasCanvas2).toBe(false);
    expect(errors).toEqual([]);
    await context.close();
});

test('資料：備份匯出再匯入保留畫布欄位，壞值丟掉', async ({ browser }) => {
    const s1 = song('s1', '第一首', [typed('sa', 'verse', 'a', { pos: { x: 30, y: 40, w: 300, h: 200 } }), typed('sb', 'verse', 'b')], 1, { canvas: { mode: 'free' } });
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: storage([s1]) });
    const r = await page.evaluate(() => {
        const res = lhParseBackup(JSON.stringify(lhBuildBackup(songs, activeSongId, [])));
        const a = res.songs[0];
        return { ok: res.ok, canvas: a.canvas, pos: a.sections.map(x => x.pos ?? null), mem: songs[0].sections.map(x => x.pos ?? null) };
    });
    expect(r.ok).toBe(true);
    expect(r.canvas).toEqual({ mode: 'free' });
    expect(r.pos).toEqual(r.mem);
    expect(r.pos[0]).toEqual({ x: 30, y: 40, w: 300, h: 200 });
    const bk = { format: 'lucky-hawaii-backup', version: 2, exportedAt: '2026-10-11T07:30:00.000Z', activeSong: null, savedWords: [], settings: {},
        songs: [{ id: 'sx', title: 'x', createdAt: 1, updatedAt: 1, hashtags: [], context: '', canvas: { mode: 'free', zoom: 'x' },
            sections: [{ id: 'secx', label: '', text: 't', collapsed: false, type: 'verse', custom: '', color: '', height: null, pos: { x: 'a' } }] }] };
    const r2 = await page.evaluate(b => { const a = lhParseBackup(JSON.stringify(b)).songs[0]; return { canvas: a.canvas, has: 'pos' in a.sections[0] }; }, bk);
    expect(r2).toEqual({ canvas: { mode: 'free' }, has: false });
    expect(errors).toEqual([]);
    await context.close();
});

test('復原：位置算內容，改位置是一步', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: storage(plain()) });
    const sigs = await page.evaluate(() => {
        const a = _snap(curSong()), b = _snap(curSong());
        b[0].pos = { x: 1, y: 2, w: 300, h: 200 };
        return [_sig(a), _sig(b)];
    });
    expect(sigs[0]).not.toBe(sigs[1]);
    await page.evaluate(() => { lhSecApply('canvas-move', s => { s.sections[0].pos = { x: 40, y: 40, w: 300, h: 200 }; }); });
    await expect.poll(async () => (await activeSongRaw(page)).sections[0].pos).toEqual({ x: 40, y: 40, w: 300, h: 200 });
    await page.evaluate(() => lhHistUndo());
    await expect.poll(async () => 'pos' in (await activeSongRaw(page)).sections[0]).toBe(false);
    await page.evaluate(() => lhHistRedo());
    await expect.poll(async () => (await activeSongRaw(page)).sections[0].pos).toEqual({ x: 40, y: 40, w: 300, h: 200 });
    expect(errors).toEqual([]);
    await context.close();
});

// ===== 切換、移動、拉大小、推開、復原 =====
const ED = '#lyricsEditor';
const openLeft = page => page.evaluate(() => { const lp = document.getElementById('leftPanel'); if (lp.classList.contains('collapsed')) { if (lhIsSheetMode()) mobileTab('lyrics'); else toggleLeftPanel(); } });
const POS = { sa: { x: 24, y: 24, w: 360, h: 200 }, sb: { x: 408, y: 24, w: 360, h: 200 }, sc: { x: 24, y: 248, w: 360, h: 200 } };
// 標準種子：三張卡片，自由模式
const seeded = (poses = POS, canvas = { mode: 'free' }, texts = {}) => [song('s1', '第一首', ['sa', 'sb', 'sc'].map((id, i) =>
    typed(id, ['verse', 'chorus', 'bridge'][i], texts[id] ?? ['一二三', '七八九', '十'][i], poses && poses[id] ? { pos: poses[id] } : {})), 1, canvas ? { canvas } : {})];
const SEC = id => `#lyricsSections [data-id="${id}"]`;
const GRIP = id => page => page.locator(`${SEC(id)} .section-handle`);
async function boot(browser, songs, { device = DEVICES.desktop, extra = {}, open = true } = {}) {
    const r = await bootPage(browser, { device, storage: storage(songs, extra), wordlist: 'stub' });
    await openLeft(r.page);
    if (open) await r.page.locator('#editorOpenBtn').click();
    return r;
}
const posOf = (page, id) => page.evaluate(id => curSong().sections.find(s => s.id === id).pos ?? null, id);
const boxOf = (page, id) => page.locator(SEC(id)).boundingBox();
const idsOf = page => page.locator('#lyricsSections .lyrics-section').evaluateAll(els => els.map(e => e.dataset.id));
const cen = async loc => { const b = await loc.boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
async function drag(page, from, dx, dy, steps = 8) {
    const vp = page.viewportSize();
    expect(from[0] + dx).toBeLessThan(vp.width);
    expect(from[1] + dy).toBeLessThan(vp.height);
    await page.mouse.move(...from);
    await page.mouse.down();
    await page.mouse.move(from[0] + dx, from[1] + dy, { steps });
    await page.mouse.up();
}
const near = (a, b, d = 1) => expect(Math.abs(a - b)).toBeLessThanOrEqual(d);
const overlap = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test('切換：吸附／自由只在編輯器，吸附不寫資料，自由寫 {mode}，關編輯器回直列', async ({ browser }) => {
    const { context, page, errors } = await boot(browser, plain(), { open: false });
    await expect(page.locator('#canvasTools')).toBeHidden();
    await page.locator('#editorOpenBtn').click();
    await expect(page.locator('#canvasTools')).toBeVisible();
    await expect(page.locator('#canvasSnapBtn')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#canvasSnapBtn')).toHaveText('吸附');
    await expect(page.locator('#canvasFreeBtn')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#canvasFreeBtn')).toHaveText('自由');
    await page.locator('#canvasSnapBtn').click();
    await page.evaluate(() => flushSongs());
    expect('canvas' in (await storedSongs(page))[0]).toBe(false);
    await page.locator('#canvasFreeBtn').click();
    await expect(page.locator('#lyricsSections')).toHaveAttribute('data-canvas', 'free');
    await expect(page.locator('#canvasFreeBtn')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#canvasSnapBtn')).toHaveAttribute('aria-pressed', 'false');
    expect(await page.locator('#lyricsSections .lyrics-section').evaluateAll(els => els.map(e => getComputedStyle(e).position))).toEqual(['absolute', 'absolute']);
    const stored = (await storedSongs(page))[0].canvas;
    expect(stored).toEqual({ mode: 'free' });
    expect(await page.evaluate(c => lhCanvasClean(c), stored)).toEqual(stored);
    await page.keyboard.press('Escape');
    await expect(page.locator(ED)).toBeHidden();
    expect(await page.evaluate(() => document.getElementById('lyricsSections').dataset.canvas)).toBeUndefined();
    expect(await page.locator('#lyricsSections .lyrics-section').evaluateAll(els => els.map(e => getComputedStyle(e).position))).toEqual(['relative', 'relative']);
    await page.locator('#editorOpenBtn').click();
    await expect(page.locator('#lyricsSections')).toHaveAttribute('data-canvas', 'free');
    await page.locator('#canvasSnapBtn').click();
    await expect(page.locator('#lyricsSections')).not.toHaveAttribute('data-canvas', 'free');
    expect((await storedSongs(page))[0].canvas).toEqual({ mode: 'snap' });
    expect(errors).toEqual([]);
    await context.close();
});

test('移動：拖 ⋮⋮ 一整段、不誤收合不誤排序、一步復原、重新整理還在', async ({ browser }) => {
    const { context, page, errors } = await boot(browser, seeded());
    const b0 = await boxOf(page, 'sa');
    await drag(page, await cen(GRIP('sa')(page)), 800, 40);
    const b1 = await boxOf(page, 'sa');
    near(b1.x - b0.x, 800); near(b1.y - b0.y, 40);
    expect(await posOf(page, 'sa')).toEqual({ x: 824, y: 64, w: 360, h: 200 });
    expect(await posOf(page, 'sb')).toEqual(POS.sb);
    expect(await posOf(page, 'sc')).toEqual(POS.sc);
    expect(await page.locator(SEC('sa')).evaluate(e => e.classList.contains('collapsed'))).toBe(false);
    expect(await idsOf(page)).toEqual(['sa', 'sb', 'sc']);
    await expect.poll(async () => (await activeSongRaw(page)).sections[0].pos).toEqual({ x: 824, y: 64, w: 360, h: 200 });
    await page.locator('#undoBtn').click();
    expect(await posOf(page, 'sa')).toEqual(POS.sa);
    const b2 = await boxOf(page, 'sa');
    near(b2.x, b0.x); near(b2.y, b0.y);
    await page.locator('#redoBtn').click();
    expect(await posOf(page, 'sa')).toEqual({ x: 824, y: 64, w: 360, h: 200 });
    await page.reload();
    await openLeft(page);
    await page.locator('#editorOpenBtn').click();
    await expect(page.locator('#lyricsSections')).toHaveAttribute('data-canvas', 'free');
    expect(await posOf(page, 'sa')).toEqual({ x: 824, y: 64, w: 360, h: 200 });
    const b3 = await boxOf(page, 'sa');
    near(b3.x - b0.x, 800);
    expect(errors).toEqual([]);
    await context.close();
});

test('移動：標題列空白處也能拖；點 ▾ 照樣收合', async ({ browser }) => {
    const { context, page, errors } = await boot(browser, seeded());
    const t = await page.locator(`${SEC('sa')} .section-type`).boundingBox();
    const pt = [t.x + t.width + 8, t.y + t.height / 2];
    expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y).classList.contains('lyrics-section-header'), pt)).toBe(true);
    await drag(page, pt, 60, 300);
    const p = await posOf(page, 'sa');
    expect(p.x).toBe(84); expect(p.y).toBe(324);
    await page.locator(`${SEC('sa')} .section-chevron`).click();
    expect(await page.locator(SEC('sa')).evaluate(e => e.classList.contains('collapsed'))).toBe(true);
    const bb = await page.locator(SEC('sa')).boundingBox(), hh = await page.locator(`${SEC('sa')} .lyrics-section-header`).boundingBox();
    near(bb.height, hh.height, 2);
    expect(errors).toEqual([]);
    await context.close();
});

test('移動：名稱鈕、字母條不會拖動卡片，點了照樣開選單', async ({ browser }) => {
    const F_ABAB = ['我望著遠方的光', '走過熟悉的街道', '你笑著說天亮', '不怕前方的路遙'].join('\n');
    const { context, page, errors } = await boot(browser, seeded(POS, { mode: 'free' }, { sa: F_ABAB }), { extra: { 'lh:map': JSON.stringify({ end: true, letters: true }) } });
    await expect(page.locator(`${SEC('sa')} .section-rhyme`)).toBeVisible();
    const b0 = await boxOf(page, 'sa');
    for (const sel of ['.section-type', '.section-rhyme']) {
        const from = await cen(page.locator(`${SEC('sa')} ${sel}`));
        await page.mouse.move(...from);
        await page.mouse.down();
        let moving = false;
        for (let i = 1; i <= 6; i++) {
            await page.mouse.move(from[0] + i * 10, from[1] + i * 7);
            moving = moving || await page.locator(SEC('sa')).evaluate(e => e.classList.contains('cv-moving'));
        }
        await page.mouse.up();
        expect(moving).toBe(false);
        expect(await posOf(page, 'sa')).toEqual(POS.sa);
        const b = await boxOf(page, 'sa');
        near(b.x, b0.x); near(b.y, b0.y);
        await page.keyboard.press('Escape');   // 拖完若有選單先關（編輯器的 Esc 在選單開著時只關選單）
        if (!(await page.locator(ED).isVisible())) await page.locator('#editorOpenBtn').click();
    }
    await page.locator(`${SEC('sa')} .section-type`).click();
    await expect(page.locator('#sectionMenu')).toBeVisible();
    expect(await posOf(page, 'sa')).toEqual(POS.sa);
    await page.keyboard.press('Escape');
    await page.locator(`${SEC('sa')} .section-rhyme`).click();
    await expect(page.locator('#rhymeStats')).toBeVisible();
    expect(await posOf(page, 'sa')).toEqual(POS.sa);
    expect(errors).toEqual([]);
    await context.close();
});

test('推開：放到別張上面，被壓到的推開、不重疊，一步復原連被推開的', async ({ browser }) => {
    const { context, page, errors } = await boot(browser, seeded());
    await drag(page, await cen(GRIP('sa')(page)), 300, 0);
    expect(await posOf(page, 'sa')).toEqual({ x: 324, y: 24, w: 360, h: 200 });
    expect(await posOf(page, 'sb')).toEqual({ x: 408, y: 248, w: 360, h: 200 });
    expect(await posOf(page, 'sc')).toEqual(POS.sc);
    const boxes = await Promise.all(['sa', 'sb', 'sc'].map(id => boxOf(page, id)));
    expect(overlap(boxes[0], boxes[1]) || overlap(boxes[0], boxes[2]) || overlap(boxes[1], boxes[2])).toBe(false);
    await page.locator('#undoBtn').click();
    expect(await posOf(page, 'sa')).toEqual(POS.sa);
    expect(await posOf(page, 'sb')).toEqual(POS.sb);
    expect(errors).toEqual([]);
    await context.close();
});

test('拉大小：右下角改寬高、文字框撐滿、鏡像層同大小', async ({ browser }) => {
    const { context, page, errors } = await boot(browser, seeded());
    await drag(page, await cen(page.locator(`${SEC('sc')} .cv-corner`)), 80, 60);
    expect(await posOf(page, 'sc')).toEqual({ x: 24, y: 248, w: 440, h: 260 });
    expect(await posOf(page, 'sa')).toEqual(POS.sa);
    expect(await posOf(page, 'sb')).toEqual(POS.sb);
    const g = await page.locator(SEC('sc')).evaluate(c => {
        const ta = c.querySelector('.section-textarea'), m = c.querySelector('.rhyme-mirror');
        return { taBottom: ta.getBoundingClientRect().bottom, inner: c.getBoundingClientRect().bottom - c.clientTop - (c.offsetHeight - c.clientHeight - c.clientTop), tw: ta.offsetWidth, th: ta.offsetHeight, mw: m.offsetWidth, mh: m.offsetHeight };
    });
    near(g.taBottom, g.inner, 3);
    expect([g.mw, g.mh]).toEqual([g.tw, g.th]);
    expect(errors).toEqual([]);
    await context.close();
});

test('第一次移動：沒有位置的卡片全部寫進去，沒動的不跳', async ({ browser }) => {
    const { context, page, errors } = await boot(browser, seeded(null));
    const before = await Promise.all(['sa', 'sb', 'sc'].map(id => boxOf(page, id)));
    await drag(page, await cen(GRIP('sc')(page)), 50, 0);
    const secs = await page.evaluate(() => curSong().sections.map(s => s.pos));
    expect(secs.every(Boolean)).toBe(true);
    expect(secs[2].x).toBe(842); expect(secs[2].y).toBe(24);
    const after = await Promise.all(['sa', 'sb'].map(id => boxOf(page, id)));
    for (let i = 0; i < 2; i++) { near(after[i].x, before[i].x); near(after[i].y, before[i].y); near(after[i].width, before[i].width); near(after[i].height, before[i].height); }
    expect(errors).toEqual([]);
    await context.close();
});

test('吸附保留位置，每首歌各自記模式', async ({ browser }) => {
    const songs = [...seeded(), song('s2', '第二首', [typed('sd', 'verse', '另一首')], 2)];
    const { context, page, errors } = await boot(browser, songs);
    await drag(page, await cen(GRIP('sa')(page)), 800, 40);
    const moved = { x: 824, y: 64, w: 360, h: 200 };
    await page.locator('#canvasSnapBtn').click();
    expect(await posOf(page, 'sa')).toEqual(moved);
    expect(await page.locator('#lyricsSections .lyrics-section').evaluateAll(els => els.map(e => getComputedStyle(e).position))).toEqual(['relative', 'relative', 'relative']);
    await page.locator('#canvasFreeBtn').click();
    near((await boxOf(page, 'sa')).x - (await page.locator('#lyricsSections').boundingBox()).x, 824 + 1, 3);
    expect(await posOf(page, 'sa')).toEqual(moved);
    await page.locator('#editorTabs .editor-tab', { hasText: '第二首' }).click();
    await expect(page.locator('#canvasSnapBtn')).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => document.getElementById('lyricsSections').dataset.canvas)).toBeUndefined();
    await page.locator('#editorTabs .editor-tab', { hasText: '第一首' }).click();
    await expect(page.locator('#lyricsSections')).toHaveAttribute('data-canvas', 'free');
    expect(await posOf(page, 'sa')).toEqual(moved);
    expect(errors).toEqual([]);
    await context.close();
});

test('⋮⋮：自由模式標籤是移動、Alt+↓ 仍排序、吸附標籤不變', async ({ browser }) => {
    const { context, page, errors } = await boot(browser, seeded());
    const grip = GRIP('sa')(page);
    expect(await grip.getAttribute('aria-label')).toMatch(/^拖曳移動「/);
    await grip.focus();
    await page.keyboard.press('Alt+ArrowDown');
    expect(await idsOf(page)).toEqual(['sb', 'sa', 'sc']);
    expect(await posOf(page, 'sa')).toEqual(POS.sa);
    expect(await posOf(page, 'sb')).toEqual(POS.sb);
    await page.locator('#canvasSnapBtn').click();
    expect(await GRIP('sa')(page).getAttribute('aria-label')).toMatch(/^拖曳排序「.*」，或按 Alt\+上下鍵移動$/);
    expect(errors).toEqual([]);
    await context.close();
});

test('Esc：拖到一半放棄，卡片回原位、編輯器不關、沒有復原步驟', async ({ browser }) => {
    const { context, page, errors } = await boot(browser, seeded());
    const undo0 = await page.locator('#undoBtn').getAttribute('aria-disabled');
    const b0 = await boxOf(page, 'sa');
    const from = await cen(GRIP('sa')(page));
    await page.mouse.move(...from);
    await page.mouse.down();
    await page.mouse.move(from[0] + 40, from[1], { steps: 4 });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect(page.locator(ED)).toBeVisible();
    const b1 = await boxOf(page, 'sa');
    near(b1.x, b0.x); near(b1.y, b0.y);
    expect(await posOf(page, 'sa')).toEqual(POS.sa);
    expect(await page.locator('#undoBtn').getAttribute('aria-disabled')).toBe(undo0);
    expect(errors).toEqual([]);
    await context.close();
});

test('手機：觸控拖標題列能移動卡片', async ({ browser }) => {
    const small = { sa: { x: 24, y: 24, w: 300, h: 200 }, sb: { x: 24, y: 300, w: 300, h: 200 } };
    const s = [song('s1', '第一首', [typed('sa', 'verse', '一二三', { pos: small.sa }), typed('sb', 'chorus', '七八九', { pos: small.sb })], 1, { canvas: { mode: 'free' } })];
    const { context, page, errors } = await boot(browser, s, { device: DEVICES.phone, open: false });
    await page.evaluate(() => lhEditorOpen());
    await expect(page.locator('#lyricsSections')).toHaveAttribute('data-canvas', 'free');
    const from = await cen(GRIP('sa')(page));
    await touchSession(page).then(t => t.drag(from, [from[0], from[1] + 60]));
    expect(await posOf(page, 'sa')).toEqual({ ...small.sa, y: 84 });
    expect(await posOf(page, 'sb')).toEqual(small.sb);
    expect(errors).toEqual([]);
    await context.close();
});

// ===== 露出卡片只捲畫布、不捲外層 =====
// 畫布外每一層的 [scrollTop, scrollLeft]，最後一個是 [scrollX, scrollY]
const outerScroll = page => page.evaluate(() => {
    const out = [];
    for (let e = document.getElementById('lyricsSections').parentElement; e; e = e.parentElement) out.push([e.scrollTop, e.scrollLeft]);
    out.push([window.scrollX, window.scrollY]);
    return out;
});
// 卡片左上角在畫布可視範圍內
const revealed = (page, id) => page.evaluate(id => {
    const box = document.getElementById('lyricsSections'), r = document.querySelector('#lyricsSections [data-id="' + id + '"]').getBoundingClientRect(), b = box.getBoundingClientRect();
    const l = b.left + box.clientLeft, t = b.top + box.clientTop;
    return r.left >= l - 1 && r.left <= l + box.clientWidth && r.top >= t - 1 && r.top <= t + box.clientHeight;
}, id);
const FAR = { sa: POS.sa, sb: POS.sb, sc: { x: 24, y: 1400, w: 360, h: 200 } };
const scrollTop0 = page => page.evaluate(() => document.getElementById('lyricsSections').scrollTo(0, 0));

test('新增與刪除：新卡片在最下面且只捲畫布；刪除不動別張、復原回原位', async ({ browser }) => {
    const { context, page, errors } = await boot(browser, seeded(FAR));
    await scrollTop0(page);
    const o0 = await outerScroll(page);
    await page.locator('.section-add-btn').click();
    expect(await page.evaluate(() => curSong().sections.length)).toBe(4);
    expect(await page.evaluate(() => 'pos' in curSong().sections[3])).toBe(false);
    const id = await page.evaluate(() => curSong().sections[3].id);
    const nb = await boxOf(page, id);
    for (const o of ['sa', 'sb', 'sc']) { const b = await boxOf(page, o); expect(nb.y).toBeGreaterThanOrEqual(b.y + b.height - 1); }
    expect(await revealed(page, id)).toBe(true);
    expect(await page.evaluate(() => document.getElementById('lyricsSections').scrollTop)).toBeGreaterThan(0);
    expect(await outerScroll(page)).toEqual(o0);
    await scrollTop0(page);
    await page.locator(`${SEC('sb')} .section-remove`).click();
    expect(await posOf(page, 'sa')).toEqual(FAR.sa);
    expect(await posOf(page, 'sc')).toEqual(FAR.sc);
    await page.locator('#undoBtn').click();
    expect(await posOf(page, 'sb')).toEqual(FAR.sb);
    expect(await outerScroll(page)).toEqual(o0);
    expect(errors).toEqual([]);
    await context.close();
});

test('露出卡片：復原、重做、聚焦、Alt+↑、移到段落都只捲畫布', async ({ browser }) => {
    const { context, page, errors } = await boot(browser, seeded(FAR, { mode: 'free' }, { sa: '我愛你你愛我' }));
    const focusEnd = id => page.evaluate(id => { const t = document.querySelector('#lyricsSections [data-id="' + id + '"] .section-textarea'); t.focus({ preventScroll: true }); t.setSelectionRange(t.value.length, t.value.length); }, id);
    const settle = async fn => {   // 共同規則：先捲回 (0,0)、記外層、做一步，之後 sc 要露出、外層不動
        await scrollTop0(page);
        const o = await outerScroll(page);
        await fn();
        expect(await revealed(page, 'sc')).toBe(true);
        expect(await outerScroll(page)).toEqual(o);
    };
    // 1 復原一個字
    await focusEnd('sc');
    await page.keyboard.insertText('X');
    await expect(page.locator(`${SEC('sc')} .section-textarea`)).toHaveValue('十X');
    await settle(async () => { await page.locator('#undoBtn').click(); await expect(page.locator(`${SEC('sc')} .section-textarea`)).toHaveValue('十'); });
    // 2 重做
    await settle(async () => { await page.locator('#redoBtn').click(); await expect(page.locator(`${SEC('sc')} .section-textarea`)).toHaveValue('十X'); });
    // 3 原生聚焦
    await page.locator('#lyricsSections').evaluate(b => b.querySelector('[data-id="sa"] .section-textarea').focus({ preventScroll: true }));
    await settle(async () => { await page.focus(`${SEC('sc')} .section-textarea`); });
    // 4 Alt+↑
    await page.evaluate(() => document.querySelector('#lyricsSections [data-id="sc"] .section-handle').focus({ preventScroll: true }));
    await settle(async () => { await page.keyboard.press('Alt+ArrowUp'); });
    expect(await idsOf(page)).toEqual(['sa', 'sc', 'sb']);
    for (const id of ['sa', 'sb', 'sc']) expect(await posOf(page, id)).toEqual(FAR[id]);
    // 5 移到段落（選字 → 右鍵 → 移到段落 ▸ → 目標段落）
    await page.evaluate(() => { const t = document.querySelector('#lyricsSections [data-id="sa"] .section-textarea'); t.focus({ preventScroll: true }); t.setSelectionRange(0, 2); });
    await settle(async () => {
        await page.evaluate(() => document.querySelector('#lyricsSections [data-id="sa"] .section-textarea').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 200 })));
        await page.locator('#moveSelMenu button').click();
        await page.locator('#moveSelSub .move-sel-to', { hasText: 'Bridge' }).click();
        await expect(page.locator(`${SEC('sc')} .section-textarea`)).toHaveValue('十X\n我愛');
    });
    expect(errors).toEqual([]);
    await context.close();
});

test('帶游標打開編輯器：只捲畫布，外層與頁面不動', async ({ browser }) => {
    const { context, page, errors } = await boot(browser, seeded(FAR));
    await page.keyboard.press('Escape');
    await expect(page.locator(ED)).toBeHidden();
    const w0 = await page.evaluate(() => [window.scrollX, window.scrollY]);
    await page.evaluate(() => lhEditorOpen(document.querySelector('#lyricsSections [data-id="sc"] .section-textarea'), [0, 0]));
    expect(await revealed(page, 'sc')).toBe(true);
    const o = await outerScroll(page);
    expect(o.slice(0, -1).every(v => v[0] === 0 && v[1] === 0)).toBe(true);
    expect(o[o.length - 1]).toEqual(w0);
    expect(errors).toEqual([]);
    await context.close();
});

test('復原移動：畫布捲動位置與外層都不變', async ({ browser }) => {
    const { context, page, errors } = await boot(browser, seeded(FAR));
    await page.evaluate(() => document.getElementById('lyricsSections').scrollTo(0, 1200));
    expect(await revealed(page, 'sc')).toBe(true);
    await drag(page, await cen(GRIP('sc')(page)), 40, 0);
    expect((await posOf(page, 'sc')).x).toBe(64);
    const sc = await page.evaluate(() => { const b = document.getElementById('lyricsSections'); return [b.scrollTop, b.scrollLeft]; });
    const o = await outerScroll(page);
    await page.locator('#undoBtn').click();
    expect((await posOf(page, 'sc')).x).toBe(24);
    expect(await page.evaluate(() => { const b = document.getElementById('lyricsSections'); return [b.scrollTop, b.scrollLeft]; })).toEqual(sc);
    expect(await outerScroll(page)).toEqual(o);
    expect(errors).toEqual([]);
    await context.close();
});

// ===== 手機鍵盤：自由畫布退回直列 =====
test('手機鍵盤打開：退回整齊直列，收起來再排回自由', async ({ browser }) => {
    const small = { sa: { x: 24, y: 24, w: 300, h: 200 }, sb: { x: 24, y: 300, w: 300, h: 200 } };
    const s = [song('s1', '第一首', [typed('sa', 'verse', '一二三', { pos: small.sa }), typed('sb', 'chorus', '七八九', { pos: small.sb })], 1, { canvas: { mode: 'free' } })];
    const { context, page, errors } = await boot(browser, s, { device: DEVICES.phone, open: false });
    await page.evaluate(() => lhEditorOpen());
    await expect(page.locator('#lyricsSections')).toHaveAttribute('data-canvas', 'free');
    await page.evaluate(() => document.querySelector('#lyricsSections [data-id="sa"] .section-textarea').focus({ preventScroll: true }));
    const size = await emulateKeyboard(page, 300);
    await expect(page.locator('html')).toHaveClass(/kb-open/);
    expect(await page.locator(SEC('sa')).evaluate(e => getComputedStyle(e).position)).not.toBe('absolute');
    expect(await page.evaluate(() => document.getElementById('lyricsSections').dataset.canvas)).toBeUndefined();
    await restoreViewport(page, size);
    await expect(page.locator('html')).not.toHaveClass(/kb-open/);
    await expect(page.locator('#lyricsSections')).toHaveAttribute('data-canvas', 'free');
    expect(await page.locator(SEC('sa')).evaluate(e => getComputedStyle(e).position)).toBe('absolute');
    expect(errors).toEqual([]);
    await context.close();
});

test('鍵盤打開（直列退路）：拖 ⋮⋮ 照舊排序、標籤是排序', async ({ browser }) => {
    const { context, page, errors } = await boot(browser, seeded());
    // 模擬 kb-open 的狀態（真的鍵盤只留一段；這裡把其餘段落顯示出來，才能測排序）
    await page.addStyleTag({ content: 'html.kb-open .lyrics-editor-body .lyrics-section:not(:focus-within) { display: flex !important; }' });
    await page.evaluate(() => { document.documentElement.classList.add('kb-open'); lhCanvasApply(); });
    expect(await page.evaluate(() => document.getElementById('lyricsSections').dataset.canvas)).toBeUndefined();
    expect(await GRIP('sa')(page).getAttribute('aria-label')).toMatch(/^拖曳排序「/);
    const from = await cen(GRIP('sc')(page));
    const ab = await boxOf(page, 'sa');
    await page.mouse.move(...from);
    await page.mouse.down();
    await page.mouse.move(ab.x + ab.width / 2, ab.y + ab.height * 0.25, { steps: 12 });
    await page.mouse.up();
    expect(await idsOf(page)).toEqual(['sc', 'sa', 'sb']);
    for (const id of ['sa', 'sb', 'sc']) expect(await posOf(page, id)).toEqual(POS[id]);
    expect(errors).toEqual([]);
    await context.close();
});

// ===== 自由模式下選字浮動列、角色標記、打字、移到段落都照常 =====
const BAR = '#rhymeSelBar', MENU = '#roleSelMenu';
const ROLES = [{ id: 'r-m', name: '男', color: '#4a7fd4' }, { id: 'r-f', name: '女', color: '#e05d5d' }];
const mk = (a, b, r) => ({ a, b, r });
const freeRoles = () => [song('s1', '第一首', ['sa', 'sb', 'sc'].map((id, i) => typed(id, 'verse', i === 0 ? '我愛你你愛我' : '愛愛', { pos: POS[id], ...(i === 0 ? { marks: [mk(0, 3, 'r-m'), mk(3, 6, 'r-f')] } : {}) })), 1, { canvas: { mode: 'free' }, roles: ROLES })];
const kbSelect = async (page, a, b, n = 0) => {
    await page.evaluate(([b, n]) => { const t = document.querySelectorAll('.section-textarea')[n]; t.focus({ preventScroll: true }); t.setSelectionRange(b, b); }, [b, n]);
    for (let i = 0; i < b - a; i++) await page.keyboard.press('Shift+ArrowLeft');
};

test('自由模式：選字浮動列出現在選取那一行下方、靠近選取結尾', async ({ browser }) => {
    const { context, page, errors } = await boot(browser, freeRoles());
    await kbSelect(page, 1, 4);
    await expect(page.locator(BAR)).toBeVisible();
    const box = await page.locator(BAR).boundingBox();
    const line = await page.evaluate(() => { const ta = document.querySelectorAll('.section-textarea')[0], m = lhMirror(ta), p = lhCaretRect(ta, m, 4); m.remove(); return { bottom: p.top + p.height, left: p.left }; });
    expect(box.y).toBeGreaterThanOrEqual(line.bottom - 0.5);
    expect(Math.abs(box.x - line.left)).toBeLessThan(40);
    expect(errors).toEqual([]);
    await context.close();
});

test('自由模式：指定角色（新角色與既有角色）標記正確、可復原', async ({ browser }) => {
    const { context, page, errors } = await boot(browser, freeRoles());
    await kbSelect(page, 1, 4);
    await page.locator(BAR + ' .rm-bar-role').click();
    await expect(page.locator(MENU)).toBeVisible();
    await page.locator(MENU + ' .role-sel-item').nth(1).click();
    expect(await page.evaluate(() => curSong().sections[0].marks)).toEqual([mk(0, 1, 'r-m'), mk(1, 6, 'r-f')]);
    await kbSelect(page, 0, 2, 1);
    await page.locator(BAR + ' .rm-bar-role').click();
    await page.locator(MENU + ' .role-sel-new').click();
    const r = await page.evaluate(() => ({ roles: curSong().roles.length, marks: curSong().sections[1].marks }));
    expect(r.roles).toBe(3);
    expect(r.marks).toEqual([mk(0, 2, r.marks[0].r)]);
    await expect.poll(async () => ((await activeSongRaw(page)).sections[1].marks || []).length).toBe(1);
    await page.keyboard.press('ControlOrMeta+z');
    expect(await page.evaluate(() => curSong().sections[1].marks || null)).toBeNull();
    expect(errors).toEqual([]);
    await context.close();
});

test('自由模式：選字後打字，文字與標記一致、存檔跟著', async ({ browser }) => {
    const { context, page, errors } = await boot(browser, freeRoles());
    await page.evaluate(() => { const t = document.querySelectorAll('.section-textarea')[0]; t.focus({ preventScroll: true }); t.setSelectionRange(1, 1); });
    await page.keyboard.insertText('X');
    expect(await page.evaluate(() => curSong().sections[0].marks)).toEqual([mk(0, 4, 'r-m'), mk(4, 7, 'r-f')]);
    await page.evaluate(() => { const t = document.querySelectorAll('.section-textarea')[0]; t.setSelectionRange(5, 6); });
    await page.keyboard.insertText('Y');
    const st = await page.evaluate(() => ({ text: curSong().sections[0].text, marks: curSong().sections[0].marks }));
    expect(st.text).toBe('我X愛你你Y我');
    for (const m of st.marks) { expect(m.a).toBeGreaterThanOrEqual(0); expect(m.b).toBeLessThanOrEqual(st.text.length); expect(m.a).toBeLessThan(m.b); }
    await expect.poll(async () => { const s = await activeSongRaw(page); return JSON.stringify([s.sections[0].text, s.sections[0].marks]); }).toBe(JSON.stringify([st.text, st.marks]));
    expect(errors).toEqual([]);
    await context.close();
});

test('自由模式：右鍵 → 移到段落 ▸ 照常，字搬過去、一步復原', async ({ browser }) => {
    const { context, page, errors } = await boot(browser, freeRoles());
    await page.evaluate(() => { const t = document.querySelectorAll('.section-textarea')[0]; t.focus({ preventScroll: true }); t.setSelectionRange(0, 2); });
    expect(await page.evaluate(() => { const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 200 }); document.querySelectorAll('.section-textarea')[0].dispatchEvent(ev); return ev.defaultPrevented; })).toBe(true);
    await expect(page.locator('#moveSelMenu')).toBeVisible();
    await page.locator('#moveSelMenu button').click();
    await page.locator('#moveSelSub .move-sel-to').nth(1).click();
    expect(await page.evaluate(() => curSong().sections.map(s => s.text))).toEqual(['你你愛我', '愛愛\n我愛', '愛愛']);
    for (const id of ['sa', 'sb', 'sc']) expect(await posOf(page, id)).toEqual(POS[id]);
    await page.locator('#undoBtn').click();
    expect(await page.evaluate(() => curSong().sections.map(s => s.text))).toEqual(['我愛你你愛我', '愛愛', '愛愛']);
    expect(errors).toEqual([]);
    await context.close();
});

test('canvas.js 沒有 HTML 字串寫入', async () => {
    const src = readFileSync(new URL('../js/canvas.js', import.meta.url), 'utf8');
    expect(src).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML/);
});

// ===== Part B：縮放、平移、座標換算、鍵盤移動 =====
const zoomOf = page => page.evaluate(() => getComputedStyle(document.getElementById('lyricsSections')).getPropertyValue('--cv-z').trim());

test('縮放：按鈕縮小／放大／回 100%，卡片螢幕大小與位置照倍率，模型座標不變，不進復原', async ({ browser }) => {
    const { context, page, errors } = await boot(browser, seeded());
    await expect(page.locator('.canvas-zoom')).toBeVisible();
    const b0 = await boxOf(page, 'sa');
    await page.evaluate(() => lhCanvasZoom(0.5, 0, 0));
    expect(await zoomOf(page)).toBe('0.5');
    await expect(page.locator('#canvasZoomReset')).toHaveText('50%');
    const b1 = await boxOf(page, 'sa');
    near(b1.width, b0.width / 2, 1); near(b1.height, b0.height / 2, 1);
    expect(await posOf(page, 'sa')).toEqual(POS.sa);
    await page.locator('#canvasZoomIn').click();
    await expect(page.locator('#canvasZoomReset')).toHaveText('60%');
    await page.locator('#canvasZoomOut').click(); await page.locator('#canvasZoomOut').click();
    await expect(page.locator('#canvasZoomReset')).toHaveText('40%');
    await page.locator('#canvasZoomOut').click();   // 下限 40%
    await expect(page.locator('#canvasZoomReset')).toHaveText('40%');
    await page.locator('#canvasZoomReset').click();
    await expect(page.locator('#canvasZoomReset')).toHaveText('100%');
    const b2 = await boxOf(page, 'sa');
    near(b2.width, b0.width, 1);
    expect(await page.locator('#undoBtn').getAttribute('aria-disabled')).toBe('true');   // 縮放不是一步
    expect(errors).toEqual([]);
    await context.close();
});

test('縮放：Ctrl／⌘＋滾輪以游標為中心；吸附模式沒有縮放鈕', async ({ browser }) => {
    const { context, page, errors } = await boot(browser, seeded());
    const c = await cen(GRIP('sa')(page));
    const before = await boxOf(page, 'sa');
    await page.mouse.move(c[0], c[1]);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -200);
    await page.keyboard.up('Control');
    const z = Number(await zoomOf(page));
    expect(z).toBeGreaterThan(1);
    const after = await boxOf(page, 'sa');
    near(after.width, before.width * z, 2);
    await page.locator('#canvasSnapBtn').click();
    await expect(page.locator('.canvas-zoom')).toBeHidden();
    expect(await zoomOf(page)).toBe('');
    expect(errors).toEqual([]);
    await context.close();
});

test('座標換算：50% 時拖 100 螢幕像素，卡片位置動 200 畫布像素；拉大小同理', async ({ browser }) => {
    const { context, page, errors } = await boot(browser, seeded());
    await page.evaluate(() => lhCanvasZoom(0.5, 0, 0));
    const b0 = await boxOf(page, 'sa');
    await drag(page, await cen(GRIP('sa')(page)), 100, 50);
    expect(await posOf(page, 'sa')).toEqual({ ...POS.sa, x: POS.sa.x + 200, y: POS.sa.y + 100 });
    const b1 = await boxOf(page, 'sa');
    near(b1.x - b0.x, 100, 2); near(b1.y - b0.y, 50, 2);   // 螢幕上跟手
    expect(errors).toEqual([]);
    await context.close();
});

test('平移：滑鼠拖畫布空白處捲動畫布', async ({ browser }) => {
    const { context, page, errors } = await boot(browser, seeded());
    await page.evaluate(() => lhCanvasZoom(1.5, 0, 0));
    const box = await page.locator('#lyricsSections').boundingBox();
    const sx = box.x + box.width - 12, sy = box.y + box.height - 40;
    expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y).id, [sx, sy])).toBe('lyricsSections');
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.mouse.move(sx - 60, sy - 40, { steps: 4 });
    await page.mouse.up();
    const sc = await page.evaluate(() => [document.getElementById('lyricsSections').scrollLeft, document.getElementById('lyricsSections').scrollTop]);
    expect(sc[0] + sc[1]).toBeGreaterThan(0);
    expect(await posOf(page, 'sa')).toEqual(POS.sa);   // 沒動到卡片
    expect(errors).toEqual([]);
    await context.close();
});

test('鍵盤：焦點在 ⋮⋮ 按方向鍵移卡片 8px（Shift 40px），一步一復原', async ({ browser }) => {
    const { context, page, errors } = await boot(browser, seeded());
    await page.locator(`${SEC('sb')} .section-handle`).focus();
    await page.keyboard.press('ArrowRight');
    expect(await posOf(page, 'sb')).toEqual({ ...POS.sb, x: POS.sb.x + 8 });
    await page.keyboard.press('Shift+ArrowDown');
    expect(await posOf(page, 'sb')).toEqual({ ...POS.sb, x: POS.sb.x + 8, y: POS.sb.y + 40 });
    expect(await page.evaluate(() => document.activeElement.className)).toContain('section-handle');
    await page.locator('#undoBtn').click();
    expect(await posOf(page, 'sb')).toEqual({ ...POS.sb, x: POS.sb.x + 8 });
    expect(errors).toEqual([]);
    await context.close();
});

test('縮放 60% 時：選字浮動列仍出現在選取處附近、角色標記與打字照常', async ({ browser }) => {
    const { context, page, errors } = await boot(browser, freeRoles());
    await page.evaluate(() => lhCanvasZoom(0.6, 0, 0));
    await kbSelect(page, 1, 4);
    await expect(page.locator(BAR)).toBeVisible();
    const box = await page.locator(BAR).boundingBox();
    const ta = await page.locator('.section-textarea').first().boundingBox();
    expect(box.y).toBeGreaterThan(ta.y);
    expect(box.y).toBeLessThan(ta.y + ta.height + 80);
    expect(box.x).toBeGreaterThan(ta.x - 20);
    expect(box.x).toBeLessThan(ta.x + ta.width);
    await page.keyboard.press('End');
    await page.keyboard.type('X');
    expect(await page.evaluate(() => curSong().sections[0].text.endsWith('X'))).toBe(true);
    expect(errors).toEqual([]);
    await context.close();
});
