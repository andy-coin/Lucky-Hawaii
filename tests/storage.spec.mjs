// 儲存相關測試：損毀資料開機（之後的 plan 會再加備份與遷移測試）
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage, settle } from './helpers.mjs';

const CORRUPT = JSON.parse(readFileSync(new URL('./fixtures/v096-corrupt.json', import.meta.url), 'utf8'));

test('corrupt: 存檔內容損毀時照常開啟、查韻正常、原始內容不動', async ({ browser }) => {
    const { context, page, errors, warnings } = await bootPage(browser, { storage: CORRUPT });
    expect(errors).toEqual([]);
    // 主控台有 [好韻器] 記錄，點名損毀的鍵，但不印出儲存的內容
    expect(warnings.some(w => w.includes('[好韻器]') && w.includes('haiku_lyrics'))).toBe(true);
    await page.fill('#searchInput', 'ㄢ');
    await settle(page);
    await expect(page.locator('.results-count').first()).toHaveText(/[1-9]/);
    // 原始內容原封不動；標籤沒有被「歌詞全空」的自動清除誤刪
    const stored = await page.evaluate(() => ({
        lyrics: localStorage.getItem('haiku_lyrics'),
        savedwords: localStorage.getItem('haiku_savedwords'),
        hashtags: localStorage.getItem('haiku_hashtags'),
    }));
    expect(stored.lyrics).toBe(CORRUPT.haiku_lyrics);
    expect(stored.savedwords).toBe(CORRUPT.haiku_savedwords);
    expect(stored.hashtags).toBe(CORRUPT.haiku_hashtags);
    expect(errors).toEqual([]);
    await context.close();
});
