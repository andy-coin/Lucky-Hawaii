// 段落模組（第 9 階段）的瀏覽器測試：名稱、類型、編號。後續計畫會在這個檔加顏色、拖曳、高度、復原。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage, activeSongRaw } from './helpers.mjs';

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/v096-localStorage.json', import.meta.url), 'utf8'));
const labels = page => page.locator('#lyricsSections .section-label').evaluateAll(els => els.map(e => e.value));
// 已經是資料版本 2 的設定檔：直接放一份 lh:songs
const v2Storage = (songs, active = songs[0]?.id) => ({
    ...FIXTURE, 'lh:schema': '2', 'lh:songs': JSON.stringify(songs), ...(active ? { 'lh:activeSong': active } : {}),
});
const song = (id, sections, extra = {}) => ({
    id, title: '測試歌', sections, hashtags: [], context: '', createdAt: 1, updatedAt: 1, ...extra,
});
const sec = (id, text, label = '', collapsed = false) => ({ id, label, text, collapsed });

test('名稱：舊歌顯示結構化名稱', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: FIXTURE });
    await expect(page.locator('#lyricsSections .lyrics-section')).toHaveCount(3);
    expect(await labels(page)).toEqual(['Verse', 'Chorus', 'Bridge']);
    // 記憶體裡的模型：每段都有完整的新欄位，label 等於畫面上的名稱
    const model = await page.evaluate(() => curSong().sections.map(s => ({ type: s.type, custom: s.custom, color: s.color, height: s.height, label: s.label })));
    expect(model).toEqual([
        { type: 'verse', custom: '', color: '', height: null, label: 'Verse' },
        { type: 'chorus', custom: '', color: '', height: null, label: 'Chorus' },
        { type: 'bridge', custom: '', color: '', height: null, label: 'Bridge' },
    ]);
    expect(errors).toEqual([]);
    await context.close();
});

test('名稱：新歌第一段是 Verse', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: FIXTURE });
    await page.evaluate(() => createSong());
    await expect(page.locator('#lyricsSections .lyrics-section')).toHaveCount(1);
    expect(await labels(page)).toEqual(['Verse']);
    expect(await page.evaluate(() => curSong().sections[0].type)).toBe('verse');
    expect(errors).toEqual([]);
    await context.close();
});
