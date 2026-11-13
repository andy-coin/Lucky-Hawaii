// 自由畫布（完整編輯器的「吸附／自由」排版）：資料、切換、移動、拉大小、推開、復原、只捲畫布
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage, activeSongRaw } from './helpers.mjs';
import { DEVICES } from './layout-lib.mjs';
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
