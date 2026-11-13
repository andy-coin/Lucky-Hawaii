// 自由畫布（完整編輯器的「吸附／自由」排版）：資料、切換、移動、拉大小、推開、復原、只捲畫布
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage, activeSongRaw } from './helpers.mjs';
import { DEVICES } from './layout-lib.mjs';

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
