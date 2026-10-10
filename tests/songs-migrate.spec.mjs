// 歌曲資料遷移（資料版本 1 → 2）：v0.96 的單首歌詞原封不動變成 lh:songs 的第一首「我的第一首歌」
// 只讀儲存內容，不假設編輯器的行為（編輯器在 08-02 才改讀 lh:songs）
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage, BASE, CONTEXT_OPTS, routeExternal, stubWordlist, collectErrors } from './helpers.mjs';

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/v096-localStorage.json', import.meta.url), 'utf8'));
const CORRUPT = JSON.parse(readFileSync(new URL('./fixtures/v096-corrupt.json', import.meta.url), 'utf8'));
const dumpLS = page => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])));
const ready = page => page.evaluate(() => Promise.all([window.__hoyunReady, window.__hoyunWordlistReady, window.__hoyunSafetyReady]));
const songsOf = ls => JSON.parse(ls['lh:songs']);
const noIdb = () => { Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true }); };

test('遷移：一字不少', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: FIXTURE });
    const ls = await dumpLS(page);
    const songs = songsOf(ls);
    expect(songs).toHaveLength(1);
    const song = songs[0];
    expect(song.id).toBe('song-migrated');
    expect(song.title).toBe('我的第一首歌');
    const legacy = JSON.parse(FIXTURE.haiku_lyrics);
    expect(song.sections).toHaveLength(legacy.length);
    song.sections.forEach((s, i) => {
        expect(s.id).toBe('sec-m' + i);
        expect(s.label).toBe(legacy[i].label);
        expect(s.text).toBe(legacy[i].text);   // 含 & 與 <b>粗體</b>，逐字相同
        expect(s.collapsed).toBe(legacy[i].collapsed);
    });
    expect(song.sections[0].text).toContain('夜色 & 微光<b>粗體</b>');
    expect(song.hashtags).toEqual(['浪漫', '夏天']);
    expect(song.context).toBe('');
    expect(ls['lh:activeSong']).toBe('song-migrated');
    expect(ls['lh:schema']).toBe('2');
    // 舊鍵原封不動（降級與還原還要讀）
    expect(ls.haiku_lyrics).toBe(FIXTURE.haiku_lyrics);
    expect(ls.haiku_hashtags).toBe(FIXTURE.haiku_hashtags);
    const list = await page.evaluate(() => lhListBackups());
    expect(list.map(r => r.id)).toEqual(['baseline', 'pre-schema-2']);
    expect(list[0].data).toEqual(FIXTURE);
    expect(list[1].data).toEqual(FIXTURE);   // 兩份都是升級前的樣子
    expect(errors).toEqual([]);
    await context.close();
});

test('遷移：重開三次只有一首', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: FIXTURE });
    const first = await dumpLS(page);
    for (let i = 0; i < 2; i++) {
        await page.reload();
        await ready(page);
        const ls = await dumpLS(page);
        expect(ls['lh:songs']).toBe(first['lh:songs']);
        expect(songsOf(ls)).toHaveLength(1);
        expect(ls.haiku_lyrics).toBe(FIXTURE.haiku_lyrics);
        expect(ls.haiku_hashtags).toBe(FIXTURE.haiku_hashtags);
        expect(ls['lh:schema']).toBe('2');
    }
    expect(errors).toEqual([]);
    await context.close();
});

test('遷移：中斷後重開', async ({ browser }) => {
    // 先前寫完 lh:songs 就當機：lh:schema 還是 1
    const seed = JSON.stringify([{ id: 'song-migrated', title: '我的第一首歌', sections: [{ id: 'sec-m0', label: '主歌', text: 'x', collapsed: false }], hashtags: [], context: '', createdAt: 1, updatedAt: 1 }]);
    const { context, page, errors } = await bootPage(browser, { storage: { ...FIXTURE, 'lh:songs': seed, 'lh:schema': '1' } });
    const ls = await dumpLS(page);
    expect(songsOf(ls)).toHaveLength(1);
    expect(songsOf(ls)[0].id).toBe('song-migrated');
    expect(ls['lh:songs']).toBe(seed);   // 已有合法的歌就不重做
    expect(ls['lh:activeSong']).toBe('song-migrated');
    expect(ls['lh:schema']).toBe('2');
    expect(errors).toEqual([]);
    await context.close();
});

test('遷移：兩個分頁同時升級', async ({ browser }) => {
    const context = await browser.newContext({
        ...CONTEXT_OPTS,
        storageState: { cookies: [], origins: [{ origin: BASE, localStorage: Object.entries(FIXTURE).map(([name, value]) => ({ name, value })) }] },
    });
    await routeExternal(context);
    await stubWordlist(context, readFileSync(new URL('./fixtures/wordlist-stub.ndjson', import.meta.url), 'utf8'));
    const pages = [await context.newPage(), await context.newPage()];
    const errs = pages.map(p => collectErrors(p).errors);
    await Promise.all(pages.map(p => p.goto('/index.html')));
    await Promise.all(pages.map(ready));
    for (const page of pages) {
        const ls = await dumpLS(page);
        expect(ls['lh:schema']).toBe('2');
        expect(songsOf(ls)).toHaveLength(1);
        expect(songsOf(ls)[0].id).toBe('song-migrated');
        expect(ls.haiku_lyrics).toBe(FIXTURE.haiku_lyrics);
    }
    expect(errs).toEqual([[], []]);
    await context.close();
});

test('遷移：沒有舊歌詞', async ({ browser }) => {
    for (const storage of [{}, { haiku_lyrics: '[]' }]) {
        const { context, page, errors } = await bootPage(browser, { storage });
        const ls = await dumpLS(page);
        const songs = songsOf(ls);
        expect(songs).toHaveLength(1);
        expect(songs[0].sections).toHaveLength(1);
        expect(songs[0].sections[0]).toMatchObject({ id: 'sec-m0', label: '', text: '', collapsed: false });
        expect(ls['lh:schema']).toBe('2');
        expect(errors).toEqual([]);
        await context.close();
    }
});

test('遷移：舊歌詞損毀', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: CORRUPT });
    const ls = await dumpLS(page);
    const songs = songsOf(ls);
    expect(songs).toHaveLength(1);
    expect(songs[0].sections).toHaveLength(1);
    expect(songs[0].sections[0]).toMatchObject({ label: '', text: '' });
    expect(songs[0].hashtags).toEqual(['浪漫', '夏天']);
    expect(JSON.parse(ls['lh:corrupt:haiku_lyrics']).raw).toBe(CORRUPT.haiku_lyrics);
    expect(ls.haiku_lyrics).toBe(CORRUPT.haiku_lyrics);   // 損毀的原文不動
    expect(ls['lh:schema']).toBe('2');
    expect(errors).toEqual([]);
    await context.close();
});

test('遷移：寫入失敗會退回', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        storage: FIXTURE,
        init: () => {
            const set = Storage.prototype.setItem;
            Storage.prototype.setItem = function (k, v) {
                if (k === 'lh:songs') throw new DOMException('quota', 'QuotaExceededError');
                return set.call(this, k, v);
            };
        },
    });
    const ls = await dumpLS(page);
    expect(ls).not.toHaveProperty('lh:songs');
    expect(ls).not.toHaveProperty('lh:activeSong');
    expect(ls['lh:schema']).toBe('1');   // 回到升級前的值
    expect(ls.haiku_lyrics).toBe(FIXTURE.haiku_lyrics);
    await expect(page.locator('#lhSaveBanner')).toContainText('資料升級失敗，已自動還原成升級前的內容，歌詞與設定都在。');
    expect(errors).toEqual([]);
    await context.close();
});

test('遷移：備份存不下就不升級', async ({ browser }) => {
    const big = { ...FIXTURE, haiku_lyrics: JSON.stringify([{ label: '', text: 'x'.repeat(600000) }]) };
    const { context, page, errors } = await bootPage(browser, { storage: big, init: noIdb });
    const ls = await dumpLS(page);
    expect(ls['lh:schema'] ?? null).toBeNull();
    expect(ls).not.toHaveProperty('lh:songs');
    expect(ls.haiku_lyrics).toBe(big.haiku_lyrics);
    expect(errors).toEqual([]);
    await context.close();
});

test('遷移：只有升級的那一頁知道', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: FIXTURE });
    expect(await page.evaluate(() => window.__lhMigrated)).toBe(true);
    await page.reload();
    await ready(page);
    expect(await page.evaluate(() => window.__lhMigrated)).toBe(false);
    expect(errors).toEqual([]);
    await context.close();
});
