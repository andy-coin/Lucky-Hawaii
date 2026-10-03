// 儲存相關測試：損毀資料開機（之後的 plan 會再加備份與遷移測試）
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage, settle } from './helpers.mjs';

const CORRUPT = JSON.parse(readFileSync(new URL('./fixtures/v096-corrupt.json', import.meta.url), 'utf8'));
const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/v096-localStorage.json', import.meta.url), 'utf8'));

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

// ===== IndexedDB 升級（FND-03 / PERF-04）=====
// 同網域的 JSON 頁面當作「空白頁」，才能在 index.html 載入前先把資料庫弄成舊版狀態
const openV1 = () => new Promise((resolve, reject) => {
    const req = indexedDB.open('haoYunQi', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('wl', { keyPath: 'k' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
});

test('IndexedDB: v1 升級 v2 保留詞庫快取', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        storage: FIXTURE,
        beforeGoto: async ({ page }) => {
            await page.goto('/data/wordlist-meta.json');
            await page.evaluate(async openV1Src => {
                const db = await eval('(' + openV1Src + ')')();
                await new Promise((res, rej) => {
                    const tx = db.transaction('wl', 'readwrite');
                    tx.objectStore('wl').put({ k: 'sentinel', v: 'keep-me' });
                    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
                });
                db.close();
            }, openV1.toString());
        },
    });
    const info = await page.evaluate(() => new Promise((resolve, reject) => {
        const req = indexedDB.open('haoYunQi');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
            const db = req.result;
            const names = [...db.objectStoreNames];
            const get = db.transaction('wl', 'readonly').objectStore('wl').get('sentinel');
            get.onsuccess = () => { db.close(); resolve({ version: db.version, names, sentinel: get.result?.v }); };
        };
    }));
    expect(info.version).toBe(2);
    expect(info.names).toEqual(expect.arrayContaining(['wl', 'backups']));
    expect(info.sentinel).toBe('keep-me');
    expect(errors).toEqual([]);
    await context.close();
});

test('IndexedDB: 舊分頁擋住升級時仍能開啟並查韻', async ({ browser }) => {
    test.setTimeout(30_000);
    const { context, page, errors, warnings } = await bootPage(browser, {
        storage: FIXTURE,
        beforeGoto: async ({ context }) => {
            // 第二個分頁抓著 v1 連線不放、也沒有 versionchange 處理 → 新分頁的 v2 升級會被擋住
            const old = await context.newPage();
            await old.goto('/data/wordlist-meta.json');
            await old.evaluate(async openV1Src => { window.__oldDb = await eval('(' + openV1Src + ')')(); }, openV1.toString());
        },
    });
    expect(warnings.some(w => w.includes('[好韻器] IndexedDB 升級被其他分頁擋住'))).toBe(true);
    expect(await page.evaluate(() => wordlistData !== null)).toBe(true);
    await page.fill('#searchInput', 'ㄢ');
    await settle(page);
    await expect(page.locator('.results-count').first()).toHaveText(/[1-9]/);
    expect(errors).toEqual([]);
    await context.close();
});
