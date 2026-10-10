// 多個分頁同時開著：別頁存了歌詞，這頁在沒打字時重新載入並提示；打字中絕不重畫
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openTwoTabs } from './helpers.mjs';

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/v096-localStorage.json', import.meta.url), 'utf8'));
const toastShown = page => page.evaluate(() => {
    const t = document.getElementById('copyToast');
    return t && t.classList.contains('show') ? t.textContent : null;
});

test('多分頁：另一頁改了歌詞，這頁重新載入並提示', async ({ browser }) => {
    const { context, pages: [a, b], errs } = await openTwoTabs(browser, FIXTURE);
    const taB = b.locator('#lyricsSections .section-textarea').first();
    const before = await taB.inputValue();
    await taB.focus();
    const caret = await taB.evaluate(t => t.selectionStart);
    await a.locator('#lyricsSections .section-textarea').first().fill('A頁新寫的歌詞');
    await a.locator('#lyricsSections .section-textarea').first().blur();
    await b.waitForTimeout(500);
    expect(await taB.inputValue(), 'B 正在編輯，不重畫').toBe(before);
    expect(await taB.evaluate(t => t.selectionStart)).toBe(caret);
    expect(await toastShown(b), 'B 還沒有提示').toBeNull();
    await b.locator('#searchInput').focus();
    await expect(taB).toHaveValue('A頁新寫的歌詞');
    expect(await toastShown(b)).toBe('其他分頁更新了歌詞，已重新載入');
    expect(await toastShown(a), '寫的那頁不提示').toBeNull();
    expect(errs.flatMap(e => e.errors)).toEqual([]);
    await context.close();
});

const ta0 = page => page.locator('#lyricsSections .section-textarea').first();
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('lh:songs')));
// 在 page 裡新增一首歌並存進 lh:songs，回傳 id
const addSong = (page, title, createdAt) => page.evaluate(([t, c]) => {
    const s = makeEmptySong(t);
    s.createdAt = c;
    songs.push(s);
    markDirty(s.id);
    flushSongs();
    return s.id;
}, [title, createdAt]);
const showSong = (page, id) => page.evaluate(i => { activeSongId = i; renderActiveSong(); }, id);

test('多分頁：各改不同的歌都留著', async ({ browser }) => {
    const { context, pages: [a, b], errs } = await openTwoTabs(browser, FIXTURE);
    const s2 = await addSong(a, '第二首', Date.now());
    await expect.poll(() => b.evaluate(() => songs.length)).toBe(2);
    await showSong(b, s2);
    await ta0(b).focus();
    // B 還在編輯時 A 改第一首：B 只標記待套用
    await ta0(a).fill('A改第一首');
    await ta0(a).blur();
    await b.waitForTimeout(400);
    await ta0(b).pressSequentially('xyz');
    await ta0(b).blur();
    await expect.poll(async () => {
        const list = await stored(b);
        return [list.find(s => s.id === 'song-migrated').sections[0].text, list.find(s => s.id === s2).sections[0].text];
    }).toEqual(['A改第一首', 'xyz']);
    await expect(ta0(b)).toHaveValue('xyz');
    await expect(ta0(a)).toHaveValue('A改第一首');
    expect(errs.flatMap(e => e.errors)).toEqual([]);
    await context.close();
});

test('多分頁：同一首以最後存的為準', async ({ browser }) => {
    const { context, pages: [a, b], errs } = await openTwoTabs(browser, FIXTURE);
    await ta0(b).focus();
    await ta0(a).fill('AAA');
    await ta0(a).blur();
    await b.waitForTimeout(400);
    await ta0(b).fill('BBB');
    await ta0(b).blur();
    await expect.poll(async () => (await stored(a)).find(s => s.id === 'song-migrated').sections[0].text).toBe('BBB');
    await expect(ta0(a)).toHaveValue('BBB');
    await expect(ta0(b)).toHaveValue('BBB');
    expect(errs.flatMap(e => e.errors)).toEqual([]);
    await context.close();
});

test('多分頁：別頁刪掉這首就換到旁邊那首', async ({ browser }) => {
    const { context, pages: [a, b], errs } = await openTwoTabs(browser, FIXTURE);
    const LONG = '一二三四五六七八九十甲乙丙丁戊己庚辛壬癸';   // 20 個字
    const now = Date.now();
    await addSong(a, LONG, now);
    const gone = await addSong(a, '要被刪的', now + 10);
    await expect.poll(() => b.evaluate(() => songs.length)).toBe(3);
    await showSong(b, gone);
    await a.evaluate(id => {
        _deleted.add(id);
        songs = songs.filter(s => s.id !== id);
        activeSongId = 'song-migrated';
        flushSongs();
    }, gone);
    await expect.poll(() => b.evaluate(() => curSong().title)).toBe(LONG);
    expect(await toastShown(b)).toBe('其他分頁刪除了這首歌，已切換到「一二三四五六七八九十甲乙丙丁戊己…」');
    expect((await stored(b)).map(s => s.id)).not.toContain(gone);
    expect(errs.flatMap(e => e.errors)).toEqual([]);
    await context.close();
});

test('多分頁：全部被刪掉時補一首空白歌', async ({ browser }) => {
    const { context, pages: [a, b], errs } = await openTwoTabs(browser, FIXTURE);
    await a.evaluate(() => lhSet('lh:songs', '[]'));
    await expect.poll(() => b.evaluate(() => songs.map(s => s.title))).toEqual(['未命名歌曲 1']);
    await expect(b.locator('#lyricsSections .section-textarea')).toHaveCount(1);
    await expect(ta0(b)).toHaveValue('');
    expect(await toastShown(b)).toBe('其他分頁刪除了這首歌，已切換到「未命名歌曲 1」');
    expect(errs.flatMap(e => e.errors)).toEqual([]);
    await context.close();
});

test('多分頁：無關的鍵不會重新載入', async ({ browser }) => {
    const { context, pages: [a, b], errs } = await openTwoTabs(browser, FIXTURE);
    await b.evaluate(() => {
        window.__muts = 0;
        new MutationObserver(m => { window.__muts += m.length; }).observe(document.getElementById('lyricsSections'), { childList: true, subtree: true });
    });
    await a.evaluate(() => {
        localStorage.setItem('lh:activeSong', 'other-tab-song');
        localStorage.setItem('selectedModel', 'x');
    });
    await b.waitForTimeout(600);
    expect(await b.evaluate(() => window.__muts)).toBe(0);
    expect(await toastShown(b)).toBeNull();
    expect(errs.flatMap(e => e.errors)).toEqual([]);
    await context.close();
});

test('多分頁：讀不出來的資料不影響畫面', async ({ browser }) => {
    const { context, pages: [a, b], errs } = await openTwoTabs(browser, FIXTURE);
    const before = await ta0(b).inputValue();
    await a.evaluate(() => localStorage.setItem('lh:songs', 'not json'));
    await b.waitForTimeout(600);
    expect(await ta0(b).inputValue()).toBe(before);
    expect(await b.evaluate(() => songs.length)).toBe(1);
    expect(errs[1].warnings.filter(w => w.includes('[好韻器]')).length).toBe(1);
    expect(errs[1].errors).toEqual([]);
    // 整個儲存被清掉（key 為 null 的事件）也一樣維持畫面
    await a.evaluate(() => localStorage.clear());
    await b.waitForTimeout(600);
    expect(await ta0(b).inputValue()).toBe(before);
    expect(errs[1].errors).toEqual([]);
    await context.close();
});

test('多分頁：兩個分頁同時升級只有一首', async ({ browser }) => {
    const { context, pages, errs } = await openTwoTabs(browser, FIXTURE);
    await pages[0].waitForTimeout(500);
    for (const p of pages) {
        const list = await stored(p);
        expect(list.map(s => s.id)).toEqual(['song-migrated']);
        expect(await p.evaluate(() => songs.map(s => s.id))).toEqual(['song-migrated']);
    }
    expect(errs.flatMap(e => e.errors)).toEqual([]);
    await context.close();
});
