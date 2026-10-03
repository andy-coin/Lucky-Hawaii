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

// JSON 合法但形狀不對（CR-01）：跟損毀的 JSON 一樣，照常開機、原始內容不動
for (const [key, value] of [['haiku_lyrics', 'null'], ['haiku_lyrics', '{}'], ['haiku_lyrics', '[]'], ['haiku_savedwords', '5'], ['haiku_hashtags', '{}']]) {
    test(`corrupt: ${key}=${value}（形狀不對）照常開啟、查韻正常、原始內容不動`, async ({ browser }) => {
        const { context, page, errors, warnings } = await bootPage(browser, { storage: { ...FIXTURE, [key]: value } });
        expect(errors).toEqual([]);
        expect(warnings.some(w => w.includes('[好韻器]') && w.includes(key))).toBe(true);
        await page.fill('#searchInput', 'ㄢ');
        await settle(page);
        await expect(page.locator('.results-count').first()).toHaveText(/[1-9]/);
        expect(await page.locator('.char-card').count()).toBeGreaterThan(0);
        expect(await page.evaluate(k => localStorage.getItem(k), key)).toBe(value);
        expect(errors).toEqual([]);
        await context.close();
    });
}

// WR-01：損毀後使用者繼續打字，下一次存檔會蓋掉原始字串；原始內容必須另存一份救得回來
test('corrupt: 損毀後繼續編輯，原始內容仍另存可救回（歌詞與字庫覆寫）', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: CORRUPT });
    await page.locator('.section-textarea').first().fill('新寫的歌詞');   // 觸發 saveLyrics，蓋掉損毀字串
    await page.evaluate(() => { dictOverrides = { x: 'y' }; saveDictOverrides(); });
    const got = await page.evaluate(() => ({
        lyrics: localStorage.getItem('haiku_lyrics'),
        stashLyrics: JSON.parse(localStorage.getItem('lh:corrupt:haiku_lyrics')).raw,
        stashSaved: JSON.parse(localStorage.getItem('lh:corrupt:haiku_savedwords')).raw,
    }));
    expect(got.lyrics).toContain('新寫的歌詞');
    expect(got.stashLyrics).toBe(CORRUPT.haiku_lyrics);
    expect(got.stashSaved).toBe(CORRUPT.haiku_savedwords);
    expect(errors).toEqual([]);
    await context.close();

    const b = await bootPage(browser, { storage: { dictOverrides_v076: '{bad' } });
    await b.page.evaluate(() => { dictOverrides = { x: 'y' }; saveDictOverrides(); });
    expect(await b.page.evaluate(() => JSON.parse(localStorage.getItem('lh:corrupt:dictOverrides_v076')).raw)).toBe('{bad');
    await b.context.close();
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

// ===== 資料格式遷移（FND-03）=====
test('migrate: 依版本順序執行、每步最多一次', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: FIXTURE });
    const run = () => page.evaluate(() => lhMigrate([
        { to: 3, run: s => s.set('haoYunQi_inputMode', s.get('haoYunQi_inputMode') + '3') },
        { to: 2, run: s => s.set('haoYunQi_inputMode', s.get('haoYunQi_inputMode') + '2') },
    ], 3));
    expect(await run()).toMatchObject({ ran: 2 });
    let ls = await dumpLS(page);
    expect(ls.haoYunQi_inputMode).toBe('auto23');
    expect(ls['lh:schema']).toBe('3');
    expect(await run()).toEqual({ ran: 0 });
    expect(await dumpLS(page)).toEqual(ls);
    expect(errors).toEqual([]);
    await context.close();
});

test('migrate: 重跑三次結果相同、不多存備份', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: FIXTURE });
    const run = () => page.evaluate(() => lhMigrate([{ to: 2, run: s => s.set('selectedModel', 'gemini-test') }], 2));
    await run();
    const once = await dumpLS(page);
    await run();
    await run();
    expect(await dumpLS(page)).toEqual(once);
    expect(once.selectedModel).toBe('gemini-test');
    const list = await page.evaluate(() => lhListBackups());
    expect(list.filter(r => r.id === 'pre-schema-2')).toHaveLength(1);
    expect(list.length).toBeLessThanOrEqual(3);
    expect(errors).toEqual([]);
    await context.close();
});

test('migrate: 中途失敗自動還原成升級前', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: FIXTURE });
    const before = await dumpLS(page);
    // 第一步成功（lh:schema 已翻成 2），第二步改到一半才失敗：lh:schema 也必須回到升級前
    const result = await page.evaluate(() => lhMigrate([
        { to: 2, run: s => s.set('selectedModel', 'step2') },
        {
            to: 3,
            run: s => {
                s.set('haiku_lyrics', 'CORRUPT');
                s.remove('haiku_savedwords');
                s.set('apiKey_newprov', 'x');
                throw new Error('boom');
            },
        },
    ], 3));
    expect(result).toMatchObject({ ran: 0, restored: true });
    const after = await dumpLS(page);
    expect(after).toEqual(before);
    expect(after).not.toHaveProperty('apiKey_newprov');
    expect(after['lh:schema']).toBe('1');
    await expect(page.locator('#lhSaveBanner')).toContainText('已自動還原');
    expect(errors).toEqual([]);
    await context.close();
});

test('migrate: 遷移步驟不可寫入未登記的鍵', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: FIXTURE });
    const before = await dumpLS(page);
    const result = await page.evaluate(() => lhMigrate([{ to: 2, run: s => s.set('evilKey', 'x') }], 2));
    expect(result).toMatchObject({ restored: true });
    const after = await dumpLS(page);
    expect(after).not.toHaveProperty('evilKey');
    expect(after).toEqual(before);
    expect(errors).toEqual([]);
    await context.close();
});

test('migrate: 備份存不進去時不執行遷移', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        storage: FIXTURE,
        init: () => {
            const put = IDBObjectStore.prototype.put;
            IDBObjectStore.prototype.put = function (...a) {
                if (window.__failBackupIdb) throw new DOMException('quota', 'QuotaExceededError');
                return put.apply(this, a);
            };
            const set = Storage.prototype.setItem;
            Storage.prototype.setItem = function (k, v) {
                if (window.__failBackupLs && k === 'lh:backup:ls') throw new DOMException('quota', 'QuotaExceededError');
                return set.call(this, k, v);
            };
        },
    });
    await page.evaluate(() => { window.__failBackupIdb = true; window.__failBackupLs = true; });
    const result = await page.evaluate(() => lhMigrate([{ to: 2, run: s => s.set('selectedModel', 'SHOULD-NOT') }], 2));
    expect(result).toMatchObject({ ran: 0, blocked: true });
    const ls = await dumpLS(page);
    expect(ls.selectedModel).toBe(FIXTURE.selectedModel);
    expect(ls['lh:schema']).toBe('1');
    await expect(page.locator('#lhSaveBanner')).toContainText('資料備份沒有存成功');
    expect(errors).toEqual([]);
    await context.close();
});

test('restore: 只還原清單內的鍵與字串值', async ({ browser }) => {
    const { context, page, errors, warnings } = await bootPage(browser, { storage: { ...FIXTURE, haoYunQi_admin_key: 'orig-admin' } });
    const before = await dumpLS(page);
    const ok = await page.evaluate(() => lhRestore({
        haiku_lyrics: 123, evil_key: 'x', haoYunQi_admin_key: 'steal', 'lh:schema': '9', haiku_savedwords: '["ok"]',
    }));
    expect(ok).toBe(true);
    const ls = await dumpLS(page);
    expect(ls).not.toHaveProperty('evil_key');
    expect(ls.haoYunQi_admin_key).toBe('orig-admin');
    expect(ls['lh:schema']).toBe(before['lh:schema']);
    expect(ls.haiku_lyrics).toBe(before.haiku_lyrics);
    expect(ls.haiku_savedwords).toBe('["ok"]');
    expect(ls).not.toHaveProperty('haiku_hashtags');       // 記錄裡沒有的清單內鍵會被清掉
    for (const k of ['haiku_lyrics', 'evil_key', 'haoYunQi_admin_key', 'lh:schema']) {
        expect(warnings.some(w => w.includes('還原時略過不合法的項目：' + k))).toBe(true);
    }
    expect(warnings.some(w => w.includes('steal'))).toBe(false);
    expect(errors).toEqual([]);
    await context.close();
});

test('restore: 不是物件的備份內容不會動到任何資料', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: FIXTURE });
    const before = await dumpLS(page);
    for (const bad of [null, [], 'x', 5]) {
        expect(await page.evaluate(b => lhRestore(b), bad)).toBe(false);
    }
    expect(await dumpLS(page)).toEqual(before);
    expect(errors).toEqual([]);
    await context.close();
});

// ===== 舊版資料快照（成功條件 5）=====
test('restore: v0.96 舊資料完整備份並可完整還原', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: FIXTURE });
    expect(await dumpLS(page)).toMatchObject(FIXTURE);
    const baseline = (await page.evaluate(() => lhListBackups())).find(r => r.id === 'baseline');
    expect(baseline.data).toEqual(FIXTURE);
    // 模擬資料全部遺失
    await page.evaluate(keys => keys.forEach(k => localStorage.removeItem(k)), Object.keys(FIXTURE));
    expect(Object.keys(await dumpLS(page)).filter(k => k in FIXTURE)).toEqual([]);
    expect(await page.evaluate(() => lhRestoreFromBackup('baseline'))).toBe(true);
    const ls = await dumpLS(page);
    for (const [k, v] of Object.entries(FIXTURE)) expect(ls[k]).toBe(v);
    // 重新整理後照常查韻，還原的歌詞顯示在第一段
    await page.reload();
    await ready(page);
    await page.fill('#searchInput', 'ㄢ');
    await settle(page);
    await expect(page.locator('.results-count').first()).toHaveText(/[1-9]/);
    expect(await page.locator('.section-textarea').first().inputValue()).toContain('輕輕唱起心裡的歌');
    expect(errors).toEqual([]);
    await context.close();
});

test('corrupt: 損毀的原始內容完整保存在基準備份', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: CORRUPT });
    const baseline = (await page.evaluate(() => lhListBackups())).find(r => r.id === 'baseline');
    expect(baseline.data.haiku_lyrics).toBe(CORRUPT.haiku_lyrics);
    expect(baseline.data.haiku_savedwords).toBe(CORRUPT.haiku_savedwords);
    expect(baseline.data.haiku_hashtags).toBe(CORRUPT.haiku_hashtags);
    expect(errors).toEqual([]);
    await context.close();
});
