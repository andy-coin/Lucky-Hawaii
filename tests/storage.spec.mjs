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

// ===== 備份（FND-03）=====
const dumpLS = page => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])));
const ready = page => page.evaluate(() => Promise.all([window.__hoyunReady, window.__hoyunWordlistReady, window.__hoyunSafetyReady]));
const EXTRA = { haoYunQi_admin_key: 'admin-secret-test', haoYunQi_admin_theme: 'dark', otherProject_setting: 'x' };

test('backup: 第一次開啟建立基準備份，只含清單內的鍵', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: { ...FIXTURE, ...EXTRA } });
    const list = await page.evaluate(() => lhListBackups());
    expect(list.map(r => r.id)).toEqual(['baseline']);
    expect(list[0].data).toEqual(FIXTURE);
    expect(Object.keys(list[0].data)).toHaveLength(17);
    for (const k of Object.keys(list[0].data)) expect(k.startsWith('lh:')).toBe(false);
    expect(list[0].data).not.toHaveProperty('haoYunQi_admin_key');
    expect(list[0].data).not.toHaveProperty('haoYunQi_admin_theme');
    expect(list[0].data).not.toHaveProperty('otherProject_setting');
    expect((await dumpLS(page))['lh:schema']).toBe('1');
    expect(errors).toEqual([]);
    await context.close();
});

test('backup: 舊版資料開啟後每個鍵值完全不變', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: { ...FIXTURE, ...EXTRA } });
    const ls = await dumpLS(page);
    for (const [k, v] of Object.entries({ ...FIXTURE, ...EXTRA })) expect(ls[k]).toBe(v);
    expect(errors).toEqual([]);
    await context.close();
});

test('backup: 基準備份之後不會被覆寫', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: FIXTURE });
    const first = (await page.evaluate(() => lhListBackups()))[0];
    await page.evaluate(() => lhSet('haiku_savedwords', '["新"]'));
    await page.reload();
    await ready(page);
    const list = await page.evaluate(() => lhListBackups());
    expect(list).toHaveLength(1);
    expect(list[0].createdAt).toBe(first.createdAt);
    expect(list[0].data).toEqual(first.data);
    expect((await dumpLS(page)).haiku_savedwords).toBe('["新"]');
    expect(errors).toEqual([]);
    await context.close();
});

test('backup: 同一毫秒建立的備份不互相覆蓋，只保留最新 3 份', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        storage: FIXTURE,
        beforeGoto: ({ page }) => page.clock.setFixedTime(new Date('2026-01-01T00:00:00Z')),
    });
    await page.evaluate(() => Promise.all(['t1', 't2', 't3', 't4', 't5'].map(id => lhBackup(id, 'same-ms', { id }))));
    const list = await page.evaluate(() => lhListBackups());
    expect(list.map(r => r.id)).toEqual(['t3', 't4', 't5']);      // 最新 3 份，baseline 與 t1、t2 被淘汰
    expect(new Set(list.map(r => r.id)).size).toBe(3);
    expect(list[0].seq).toBeLessThan(list[1].seq);
    expect(list[1].seq).toBeLessThan(list[2].seq);
    expect(new Set(list.map(r => r.createdAt)).size).toBe(1);
    // 同 id 再備份：不覆寫
    const again = await page.evaluate(() => lhBackup('t5', 'again', {}));
    expect(again).toMatchObject({ ok: true, existed: true });
    const after = await page.evaluate(() => lhListBackups());
    expect(after).toEqual(list);
    expect(errors).toEqual([]);
    await context.close();
});

test('backup: 全新瀏覽器開啟沒有錯誤並設定資料版本', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: {} });
    expect(errors).toEqual([]);
    const list = await page.evaluate(() => lhListBackups());
    expect(list.map(r => r.id)).toEqual(['baseline']);
    expect(list[0].data).toEqual({});
    expect((await dumpLS(page))['lh:schema']).toBe('1');
    await context.close();
});

test('backup: IndexedDB 無法使用時改存 localStorage 單份並留記錄', async ({ browser }) => {
    const { context, page, errors, warnings } = await bootPage(browser, {
        storage: FIXTURE,
        init: () => { Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true }); },
    });
    await expect(page.locator('#lhSaveBanner')).toHaveCount(0);
    const ls = await dumpLS(page);
    const rec = JSON.parse(ls['lh:backup:ls']);
    expect(rec.id).toBe('baseline');
    expect(rec.data).toEqual(FIXTURE);
    expect(ls['lh:schema']).toBe('1');
    expect(warnings.some(w => w.includes('[好韻器] IndexedDB 不可用'))).toBe(true);
    const list = await page.evaluate(() => lhListBackups());
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('baseline');
    expect(errors).toEqual([]);
    await context.close();
});
