// 注音組字：組字中不存檔、組字確認後 400 毫秒內存進 lh:songs；一般打字 300 毫秒後才存一次（研究測試 R1）
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage, compose, STORAGE_SPY } from './helpers.mjs';

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/v096-localStorage.json', import.meta.url), 'utf8'));
const LYRIC_KEYS = ['lh:songs', 'haiku_lyrics', 'haiku_hashtags'];
// 不經過 flushSongs，直接看儲存裡現在是什麼
const rawFirstText = page => page.evaluate(() => {
    const songs = JSON.parse(localStorage.getItem('lh:songs'));
    return songs.find(s => s.id === localStorage.getItem('lh:activeSong')).sections[0].text;
});
const focusEnd = page => page.evaluate(() => {
    const ta = document.querySelector('.section-textarea');
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
});

test('組字：組字中不存檔，確認後 400 毫秒內存進 lh:songs', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: FIXTURE, init: STORAGE_SPY });
    await focusEnd(page);
    await page.evaluate(() => { window.__lsWrites.length = 0; });
    let during = -1;
    await compose(page, ['ㄋ', 'ㄋㄧ', 'ㄋㄧˇ'], '你', async () => {
        // 比 300 毫秒的存檔等待更久，確定「沒有存」不是因為還沒到時間
        await page.waitForTimeout(500);
        during = await page.evaluate(keys => window.__lsWrites.filter(w => keys.includes(w.k)).length, LYRIC_KEYS);
    });
    expect(during, '組字中沒有任何歌詞存檔').toBe(0);
    await page.waitForFunction(() => {
        const songs = JSON.parse(localStorage.getItem('lh:songs'));
        return songs.find(s => s.id === localStorage.getItem('lh:activeSong')).sections[0].text.endsWith('你');
    }, null, { timeout: 400 });
    expect((await rawFirstText(page)).endsWith('你')).toBe(true);
    expect(await page.locator('.section-textarea').first().inputValue()).toMatch(/你$/);
    expect(errors).toEqual([]);
    await context.close();
});

test('組字：一般打字 300 毫秒後才存一次', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: FIXTURE, init: STORAGE_SPY });
    await focusEnd(page);
    await page.evaluate(() => {
        window.__lsWrites.length = 0;
        document.addEventListener('input', () => { window.__lastInput = performance.now(); }, true);
    });
    await page.keyboard.type('abcde');
    await page.waitForTimeout(800);
    const got = await page.evaluate(() => ({ writes: window.__lsWrites.filter(w => w.k === 'lh:songs'), last: window.__lastInput }));
    expect(got.writes, '五個字只存一次').toHaveLength(1);
    expect(got.writes[0].t - got.last, '最後一個字之後至少等了 250 毫秒').toBeGreaterThanOrEqual(250);
    expect((await rawFirstText(page)).endsWith('abcde')).toBe(true);
    expect(errors).toEqual([]);
    await context.close();
});
