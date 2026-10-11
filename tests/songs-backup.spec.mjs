// 備份與還原（EDIT-09）：備份全部、匯入備份、只加入歌曲、全部還原、壞檔
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage } from './helpers.mjs';

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/v096-localStorage.json', import.meta.url), 'utf8'));
const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const HEADER_BACKUP = '.save-load-controls .save-load-btn >> nth=0';

const SETTING_KEYS = ['haoYunQi_inputMode', 'selectedModel', 'hoyun_theme_mode', 'bgColor1', 'containerBg', 'textColor', 'highlightColor', 'lh:lexiconPack'];
const BACKUP_TOP_KEYS = ['activeSong', 'exportedAt', 'format', 'savedWords', 'settings', 'songs', 'version'];

// 讀整個 localStorage（只讀，給斷言用）
const dumpLS = page => page.evaluate(() => {
    const o = {};
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); }
    return o;
});

// 備份全部 → 存到測試輸出資料夾，回傳檔案路徑與下載物件
async function backupTo(page, name) {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator(HEADER_BACKUP).click()]);
    const file = test.info().outputPath(name);
    await dl.saveAs(file);
    return { dl, file };
}

// 來源瀏覽器 A：v0.96 資料升級成第一首歌，再多建一首打過字的歌；深色主題、詞庫包、後台金鑰都放進去，驗證會不會外流
const A_STORAGE = () => ({
    ...FIXTURE,
    hoyun_theme_mode: 'dark',
    'lh:lexiconPack': 'test-pack',
    haoYunQi_admin_key: 'admin-secret-not-real',
});

async function bootSourceWithTwoSongs(browser) {
    const A = await bootPage(browser, { storage: A_STORAGE(), device: DESKTOP, wordlist: 'stub' });
    await A.page.evaluate(() => createSong());
    await A.page.locator('.section-textarea').first().fill('新歌的第一句\n新歌的第二句');
    await A.page.keyboard.press('Escape');
    await A.page.evaluate(() => flushSongs());
    return A;
}

test('備份：乾淨瀏覽器完整還原', async ({ browser }) => {
    const A = await bootSourceWithTwoSongs(browser);
    const { file } = await backupTo(A.page, 'backup.json');
    const srcLS = await dumpLS(A.page);
    await expect(A.page.locator('#copyToast')).toHaveText('已匯出備份檔（2 首歌）');
    await A.context.close();

    const B = await bootPage(browser, { storage: {}, device: DESKTOP, wordlist: 'stub' });
    await B.page.setInputFiles('#importFileInput', file);
    await expect(B.page.locator('#importOverlay')).toBeVisible();
    await B.page.getByRole('button', { name: '全部還原（取代目前資料）' }).click();
    await expect(B.page.locator('#copyToast')).toHaveText('已還原 2 首歌與設定（還原前的資料已自動備份）');
    await B.page.evaluate(() => Promise.all([window.__hoyunSafetyReady, window.__hoyunSongsReady]));

    const dst = await dumpLS(B.page);
    expect(JSON.parse(dst['lh:songs'])).toEqual(JSON.parse(srcLS['lh:songs']));
    expect(dst['lh:activeSong']).toBe(srcLS['lh:activeSong']);
    expect(dst.haiku_savedwords).toBe(srcLS.haiku_savedwords);
    for (const k of [...SETTING_KEYS, 'dictOverrides_v076']) {
        if (srcLS[k] !== undefined) expect(dst[k], k).toBe(srcLS[k]);
    }
    expect(dst['lh:lexiconPack']).toBe('test-pack');
    expect(dst.hoyun_theme_mode).toBe('dark');
    expect(Object.keys(dst).filter(k => k.startsWith('apiKey_') || k.startsWith('haoYunQi_admin_')), 'B 不該有任何金鑰').toEqual([]);
    const ids = await B.page.evaluate(async () => (await lhListBackups()).map(r => r.id));
    expect(ids.some(id => id.startsWith('import-replace-')), '還原前的自動備份：' + ids.join(',')).toBe(true);
    // 畫面上也是 A 的資料
    await expect(B.page.locator('#songCurrent')).not.toHaveText('');
    await expect(B.page.locator('.section-textarea').first()).toHaveValue('新歌的第一句\n新歌的第二句');
    expect(B.errors).toEqual([]);
    await B.context.close();
});

test('備份：檔案格式', async ({ browser }) => {
    const A = await bootSourceWithTwoSongs(browser);
    const { dl, file } = await backupTo(A.page, 'format.json');
    expect(dl.suggestedFilename()).toMatch(/^LuckyHawaii-備份-\d{8}-\d{4}\.json$/);
    const raw = readFileSync(file, 'utf8');
    const data = JSON.parse(raw);
    expect(Object.keys(data).sort()).toEqual(BACKUP_TOP_KEYS);
    expect(data.format).toBe('lucky-hawaii-backup');
    expect(data.version).toBe(2);
    expect(Number.isNaN(Date.parse(data.exportedAt))).toBe(false);
    expect(data.songs).toHaveLength(2);
    expect(data.songs.map(s => s.id)).toContain(data.activeSong);
    expect(data.savedWords).toEqual(['微光', '天亮']);
    const allowed = new Set([...SETTING_KEYS, 'dictOverrides_v076']);
    for (const k of Object.keys(data.settings)) expect(allowed.has(k), '多出來的設定鍵 ' + k).toBe(true);
    expect(data.settings.hoyun_theme_mode).toBe('dark');
    expect(data.settings['lh:lexiconPack']).toBe('test-pack');
    expect(data.settings.dictOverrides_v076).toBe(FIXTURE.dictOverrides_v076);
    // 不外流：金鑰、後台金鑰、介面狀態、舊鍵、中介資料
    for (const bad of ['apiKey_', 'test-key-not-real', 'haoYunQi_admin', 'admin-secret-not-real', 'lh:songListOpen', 'lh:uiScale', 'recentPanelCollapsed',
        'leftPanelCollapsed', 'rightPanelCollapsed', 'contextSectionCollapsed', 'savedPoolCollapsed', 'haiku_lyrics', 'haiku_hashtags', 'lh:schema', 'lh:backup:ls']) {
        expect(raw.includes(bad), '備份檔不該含有 ' + bad).toBe(false);
    }
    await A.context.close();
});

// ==================== 只加入歌曲、舊版存檔、按鈕名稱 ====================
const mkSong = (id, title, o = {}) => ({
    id, title, createdAt: o.createdAt ?? 1000, updatedAt: o.updatedAt ?? 1000,
    sections: (o.sections ?? [['主歌', title + '的歌詞']]).map((s, i) => ({ id: `sec-${id}-${i}`, label: s[0], text: s[1], collapsed: false })),
    hashtags: o.hashtags ?? [], context: o.context ?? '',
});
// 已經是第 2 版資料的使用者：直接帶 lh:songs
const seed = (songArr, extra = {}) => ({
    'lh:schema': '2', 'lh:songs': JSON.stringify(songArr), 'lh:activeSong': songArr[0].id,
    leftPanelCollapsed: 'false', rightPanelCollapsed: 'true', ...extra,
});
const mkBackup = (songArr, o = {}) => ({
    format: 'lucky-hawaii-backup', version: 2, exportedAt: o.exportedAt ?? '2026-10-11T07:30:00.000Z',
    songs: songArr, activeSong: o.activeSong ?? null, savedWords: o.savedWords ?? [], settings: o.settings ?? {},
});
const importBuf = (page, obj, name = 'backup.json') => page.setInputFiles('#importFileInput', {
    name, mimeType: 'application/json', buffer: Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj)),
});
const songListTitles = page => page.locator('#songItems .song-pick').allTextContents();
const storedSongs = page => page.evaluate(() => { flushSongs(); return JSON.parse(localStorage.getItem('lh:songs')); });

test('備份：只加入歌曲', async ({ browser }) => {
    const mine = [mkSong('song-migrated', '我的第一首歌', { createdAt: 3000 }), mkSong('song-new', '新歌', { createdAt: 5000 })];
    const { context, page, errors } = await bootPage(browser, {
        storage: seed(mine, { 'lh:activeSong': 'song-new', haiku_savedwords: JSON.stringify(['微光', '天亮']), hoyun_theme_mode: 'light', selectedModel: 'mine-model' }),
        device: DESKTOP, wordlist: 'stub',
    });
    const before = await dumpLS(page);
    const file = mkBackup([mkSong('song-migrated', '我的第一首歌', { createdAt: 2000 }), mkSong('x1', '另一首', { createdAt: 4000 })], {
        savedWords: ['微光', '新詞'], settings: { hoyun_theme_mode: 'dark', selectedModel: 'file-model' }, activeSong: 'x1',
    });
    await importBuf(page, file);
    await expect(page.locator('#importAddBtn')).toBeVisible();
    await page.locator('#importAddBtn').click();
    await expect(page.locator('#importOverlay')).toBeHidden();
    await expect(page.locator('#copyToast')).toHaveText('已加入 2 首歌');
    const now = await storedSongs(page);
    expect(now).toHaveLength(4);
    const byTitle = t => now.find(s => s.title === t);
    expect(byTitle('我的第一首歌（匯入）').id).not.toBe('song-migrated');
    expect(byTitle('另一首').id).toBe('x1');
    // 原本的兩首一個位元組都沒變
    expect(now.find(s => s.id === 'song-migrated')).toEqual(JSON.parse(before['lh:songs']).find(s => s.id === 'song-migrated'));
    expect(now.find(s => s.id === 'song-new')).toEqual(JSON.parse(before['lh:songs']).find(s => s.id === 'song-new'));
    const after = await dumpLS(page);
    expect(after['lh:activeSong'], '目前這首不變').toBe('song-new');
    expect(JSON.parse(after.haiku_savedwords)).toEqual(['微光', '天亮', '新詞']);
    expect(after.hoyun_theme_mode).toBe('light');
    expect(after.selectedModel).toBe('mine-model');
    expect(Object.keys(after).filter(k => k.startsWith('apiKey_'))).toEqual([]);
    expect(errors).toEqual([]);
    await context.close();
});

test('備份：加入的歌照建立時間排', async ({ browser }) => {
    const mine = [mkSong('a', '甲', { createdAt: 3000 }), mkSong('b', '乙', { createdAt: 1000 })];
    const { context, page } = await bootPage(browser, { storage: seed(mine), device: DESKTOP, wordlist: 'stub' });
    await importBuf(page, mkBackup([mkSong('c', '丙', { createdAt: 2000 }), mkSong('d', '丁', { createdAt: 4000 }), mkSong('e', '戊', { createdAt: 500 })]));
    await page.locator('#importAddBtn').click();
    await expect(page.locator('#copyToast')).toHaveText('已加入 3 首歌');
    const now = await storedSongs(page);
    expect(Object.fromEntries(now.map(s => [s.title, s.createdAt]))).toEqual({ 甲: 3000, 乙: 1000, 丙: 2000, 丁: 4000, 戊: 500 });
    await page.locator('#songListToggle').click();
    expect(await songListTitles(page)).toEqual(['丁', '甲', '丙', '乙', '戊']);
    await context.close();
});

test('備份：全部還原時目前這首', async ({ browser }) => {
    const mine = [mkSong('a', '甲', { createdAt: 3000 })];
    const theirs = [mkSong('c', '丙', { createdAt: 2000 }), mkSong('d', '丁', { createdAt: 4000 }), mkSong('e', '戊', { createdAt: 500 })];
    for (const [activeSong, expected] of [[null, 'd'], ['e', 'e'], ['不存在的歌', 'd']]) {
        const { context, page } = await bootPage(browser, { storage: seed(mine), device: DESKTOP, wordlist: 'stub' });
        await importBuf(page, mkBackup(theirs, { activeSong }));
        await page.locator('#importReplaceBtn').click();
        await expect(page.locator('#copyToast')).toHaveText('已還原 3 首歌與設定（還原前的資料已自動備份）');
        const ls = await dumpLS(page);
        expect(ls['lh:activeSong'], `備份的目前這首 = ${activeSong}`).toBe(expected);
        expect(JSON.parse(ls['lh:songs']).map(s => s.id).sort()).toEqual(['c', 'd', 'e']);
        await context.close();
    }
});

test('備份：全部還原會清掉備份檔裡沒有的設定', async ({ browser }) => {
    const mine = [mkSong('a', '甲')];
    const { context, page } = await bootPage(browser, {
        storage: seed(mine, { selectedModel: 'mine-model', hoyun_theme_mode: 'light', apiKey_gemini: 'keep-me', recentPanelCollapsed: 'true' }),
        device: DESKTOP, wordlist: 'stub',
    });
    await importBuf(page, mkBackup([mkSong('c', '丙')], { settings: { hoyun_theme_mode: 'dark' } }));
    await page.locator('#importReplaceBtn').click();
    await expect(page.locator('#copyToast')).toHaveText('已還原 1 首歌與設定（還原前的資料已自動備份）');
    const ls = await dumpLS(page);
    expect(ls.hoyun_theme_mode).toBe('dark');
    expect(ls.selectedModel, '備份檔沒有的設定被清掉，結果和來源一樣').toBeUndefined();
    expect(ls.apiKey_gemini, '金鑰不動').toBe('keep-me');
    expect(ls.recentPanelCollapsed, '介面狀態不動').toBe('true');
    await context.close();
});

const V1_FILE = {
    version: 1, exportedAt: '2026-10-03T00:00:00.000Z',
    lyricsSections: [{ label: '主歌', text: '匯入的第一段歌詞', collapsed: false }, { label: '副歌', text: '匯入的第二段歌詞', collapsed: false }],
    hashtags: ['匯入'], savedWords: ['詞彙', '微光'], contextDescription: '匯入的情境',
};

test('備份：舊版存檔加成新歌', async ({ browser }) => {
    const mine = [mkSong('a', '甲', { createdAt: 3000 })];
    const { context, page, errors } = await bootPage(browser, {
        storage: seed(mine, { haiku_savedwords: JSON.stringify(['微光', '天亮']) }), device: DESKTOP, wordlist: 'stub',
    });
    await importBuf(page, V1_FILE, 'session.json');
    await expect(page.locator('#importSummary')).toHaveText('這是舊版的存檔：有 2 段歌詞，會加進成新的一首歌');
    await expect(page.locator('#importAddBtn')).toContainText('加入成新歌曲');
    await expect(page.locator('#importAddBtn')).toContainText('保留池的詞會合併，重複的不會多出來');
    await expect(page.locator('#importReplaceBtn')).toBeHidden();
    await expect(page.locator('#importMeta')).toBeHidden();
    await page.locator('#importAddBtn').click();
    await expect(page.locator('#copyToast')).toHaveText('已把舊版存檔加成新的一首歌「匯入的歌曲」');
    await expect(page.locator('#songCurrent')).toHaveText('匯入的歌曲');
    await expect(page.locator('.section-textarea').first()).toHaveValue('匯入的第一段歌詞');
    await expect(page.locator('.section-textarea')).toHaveCount(2);
    await expect(page.locator('#contextDescription')).toHaveValue('匯入的情境');
    await expect(page.locator('#hashtagChips')).toContainText('#匯入');
    const ls = await dumpLS(page);
    expect(JSON.parse(ls.haiku_savedwords)).toEqual(['微光', '天亮', '詞彙']);
    const songsNow = JSON.parse(ls['lh:songs']);
    expect(songsNow).toHaveLength(2);
    expect(ls['lh:activeSong']).toBe(songsNow.find(s => s.title === '匯入的歌曲').id);
    // 同一個檔再匯入一次：歌名撞到就加（匯入）
    await importBuf(page, V1_FILE, 'session.json');
    await page.locator('#importAddBtn').click();
    await expect(page.locator('#songCurrent')).toHaveText('匯入的歌曲（匯入）');
    expect(JSON.parse((await dumpLS(page))['lh:songs'])).toHaveLength(3);
    expect(errors).toEqual([]);
    await context.close();
});

test('備份：按鈕名稱', async ({ browser }) => {
    const { context, page } = await bootPage(browser, { storage: seed([mkSong('a', '甲')]), device: DESKTOP, wordlist: 'stub' });
    const header = page.locator('.save-load-controls .save-load-btn');
    await expect(header.nth(0)).toContainText('備份全部');
    await expect(header.nth(1)).toContainText('匯入備份');
    for (const [i, name] of [[0, '把所有歌曲與設定存成一個備份檔'], [1, '從備份檔還原歌曲與設定']]) {
        await expect(header.nth(i)).toHaveAttribute('title', name);
        await expect(header.nth(i)).toHaveAttribute('aria-label', name);
    }
    const style = await header.nth(0).evaluate(el => { const cs = getComputedStyle(el); return { size: cs.fontSize, weight: cs.fontWeight }; });
    expect(style).toEqual({ size: '14px', weight: '700' });
    await page.locator('.settings-trigger').first().click();
    const inSettings = page.locator('.settings-saveload .save-load-btn');
    await expect(inSettings.nth(0)).toHaveText('💾 備份全部');
    await expect(inSettings.nth(1)).toHaveText('📂 匯入備份');
    await expect(inSettings.nth(0)).toHaveAttribute('aria-label', '把所有歌曲與設定存成一個備份檔');
    await expect(inSettings.nth(1)).toHaveAttribute('aria-label', '從備份檔還原歌曲與設定');
    await context.close();
});
