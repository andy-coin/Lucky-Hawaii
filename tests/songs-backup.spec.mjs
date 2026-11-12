// 備份與還原（EDIT-09）：備份全部、匯入備份、只加入歌曲、全部還原、壞檔
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage, clickBackup, openDataTab, SETTINGS_IMPORT } from './helpers.mjs';
import { DEVICES, hitMin } from './layout-lib.mjs';

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/v096-localStorage.json', import.meta.url), 'utf8'));
const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };

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
    const dl = await clickBackup(page);
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
    // 備份從記憶體組檔：沒被編輯過的舊歌，儲存裡還是舊 label，記憶體裡已是推斷出的名稱與新欄位（第 9 階段 A2），所以拿記憶體對照
    const srcSongs = await A.page.evaluate(() => JSON.parse(JSON.stringify(songs)));
    await expect(A.page.locator('#copyToast')).toHaveText('已匯出備份檔（2 首歌）');
    await A.context.close();

    const B = await bootPage(browser, { storage: {}, device: DESKTOP, wordlist: 'stub' });
    await B.page.setInputFiles('#importFileInput', file);
    await expect(B.page.locator('#importOverlay')).toBeVisible();
    await B.page.getByRole('button', { name: '全部還原（取代目前資料）' }).click();
    await expect(B.page.locator('#copyToast')).toHaveText('已還原 2 首歌與設定（還原前的資料已自動備份）');
    await B.page.evaluate(() => Promise.all([window.__hoyunSafetyReady, window.__hoyunSongsReady]));

    const dst = await dumpLS(B.page);
    expect(JSON.parse(dst['lh:songs']), '歌曲連同類型、顏色、高度原樣還原').toEqual(srcSongs);
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
// 不替程式 flush：匯入完成後儲存裡就該是新的（WR-11）
const storedSongs = page => page.evaluate(() => JSON.parse(localStorage.getItem('lh:songs')));

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
    // 標題列不再有備份／匯入鈕，只在偏好設定「資料與備份」分頁
    await expect(page.locator('.save-load-controls')).toHaveCount(0);
    await expect(page.locator('.header .save-load-btn')).toHaveCount(0);
    await openDataTab(page);
    const inSettings = page.locator('.settings-saveload .save-load-btn');
    await expect(inSettings.nth(0)).toHaveText('備份全部');
    await expect(inSettings.nth(1)).toHaveText('匯入備份');
    for (const [i, name] of [[0, '把所有歌曲與設定存成一個備份檔'], [1, '從備份檔還原歌曲與設定']]) {
        await expect(inSettings.nth(i)).toHaveAttribute('title', name);
        await expect(inSettings.nth(i)).toHaveAttribute('aria-label', name);
    }
    await context.close();
});

// ==================== 壞檔、被動過手腳的檔案、寫到一半失敗 ====================
const UNCHANGED = '目前的歌詞與設定都沒有被改動。';
const ERR_TITLE = '這個檔案無法匯入';
const BAD_FILES = [
    ['不是 JSON', 'not json', '這個檔案不是有效的備份檔（內容讀不出來）。請選擇用「備份全部」存出來的 .json 檔。'],
    ['空檔案', '', '這個檔案不是有效的備份檔（內容讀不出來）。請選擇用「備份全部」存出來的 .json 檔。'],
    ['格式不對', '{"a":1}', '這不是好韻器的備份檔。請選擇用「備份全部」存出來的 .json 檔。'],
    ['版本太新', { ...mkBackup([mkSong('z', 'Z')]), version: 3 }, '這份備份是比較新的版本做的（版本 3），目前的好韻器還讀不了。請先重新整理頁面更新，再試一次。'],
    ['沒有任何歌曲', mkBackup([]), '這份備份裡沒有任何歌曲，沒有東西可以匯入。'],
    ['檔案太大', 'x'.repeat(6 * 1024 * 1024), '檔案太大了（超過 5 MB），不像是備份檔。請確認選對檔案。'],
];
const MINE = () => [mkSong('a', '甲', { createdAt: 3000 }), mkSong('b', '乙', { createdAt: 1000 })];
const MINE_STORAGE = () => seed(MINE(), { haiku_savedwords: JSON.stringify(['微光']), selectedModel: 'mine-model', hoyun_theme_mode: 'light', apiKey_gemini: 'mine-key' });

for (const [name, content, sentence] of BAD_FILES) {
    test(`備份：壞檔：${name}`, async ({ browser }) => {
        const { context, page, errors } = await bootPage(browser, { storage: MINE_STORAGE(), device: DESKTOP, wordlist: 'stub' });
        const before = await dumpLS(page);
        await importBuf(page, content);
        await expect(page.locator('#importOverlay')).toBeVisible();
        await expect(page.locator('#importTitle')).toHaveText(ERR_TITLE);
        await expect(page.locator('#importError')).toHaveText(sentence + UNCHANGED);
        const close = page.locator('#importCancelBtn');
        await expect(close).toHaveText('關閉錯誤訊息');
        await expect(close).toHaveAttribute('aria-label', '關閉錯誤訊息，回到頁面');
        await expect(close).toBeFocused();
        for (const id of ['#importAddBtn', '#importReplaceBtn', '#importSummary', '#importChips']) await expect(page.locator(id)).toBeHidden();
        expect(await dumpLS(page), '壞檔不動任何儲存的資料').toEqual(before);
        await expect(page.locator('#importFileInput')).toHaveValue('');
        await close.click();
        await expect(page.locator('#importOverlay')).toBeHidden();
        expect(await dumpLS(page)).toEqual(before);
        expect(errors).toEqual([]);
        await context.close();
    });
}

test('備份：讀取失敗', async ({ browser }) => {
    const { context, page } = await bootPage(browser, {
        storage: MINE_STORAGE(), device: DESKTOP, wordlist: 'stub',
        init: () => { FileReader.prototype.readAsText = function () { setTimeout(() => this.onerror && this.onerror(new ProgressEvent('error')), 0); }; },
    });
    const before = await dumpLS(page);
    await importBuf(page, mkBackup([mkSong('z', 'Z')]));
    await expect(page.locator('#importTitle')).toHaveText(ERR_TITLE);
    await expect(page.locator('#importError')).toHaveText('讀取失敗：這個檔案打不開，請再試一次。' + UNCHANGED);
    await expect(page.locator('#importCancelBtn')).toBeFocused();
    expect(await dumpLS(page)).toEqual(before);
    await context.close();
});

// 檔案是被動過手腳的：JSON.parse 會把 "__proto__" 當成自己的屬性，所以用文字拼，不用物件字面值
function hostileFile() {
    const longSections = Array.from({ length: 2100 }, (_, i) => ({ id: 'sec' + i, label: 'L' + i, text: 't' + i, collapsed: false }));
    const base = mkBackup([
        { id: '<img src=x>', title: 'S1', createdAt: 9000, updatedAt: 9000,
          sections: [{ id: 's', label: 'L', text: '</textarea><script>window.__pwn=1</script>', collapsed: false }], hashtags: [], context: '' },
        { id: '__proto__', title: '長'.repeat(100), createdAt: 800, sections: [], hashtags: [], context: '' },
        { id: 'dup', title: 'S3', createdAt: 700, sections: longSections, hashtags: ['短標籤', '標'.repeat(150)], context: '情'.repeat(120000) },
        { id: 'dup', title: 'S4', createdAt: 600, sections: [{ id: 'x', label: '', text: '四', collapsed: false }], hashtags: [], context: '' },
        'not a song', null, 42,
    ], { savedWords: ['好詞', '字'.repeat(120), '好詞', 5, null] });
    const settings = '{"__proto__":{"polluted":"yes"},"apiKey_gemini":"stolen","haoYunQi_admin_key":"x","selectedModel":"m-imported",'
        + '"bgColor1":"red;background:url(http://evil.example/x)","hoyun_theme_mode":"dark","unknownKey":"z"}';
    return JSON.stringify({ ...base, settings: '@@' }).replace('"@@"', settings);
}

test('備份：被動過手腳的檔案', async ({ browser }) => {
    const { context, page, errors, offOrigin } = await bootPage(browser, {
        storage: seed(MINE(), { apiKey_gemini: 'mine-key', haoYunQi_admin_key: 'admin-mine', bgColor1: '#112233' }), device: DESKTOP, wordlist: 'stub',
    });
    await importBuf(page, hostileFile());
    await expect(page.locator('#importSummary')).toHaveText('這份備份有 4 首歌與你的設定。注意：有內容超過上限，匯入時會被截短');
    // 整理在顯示之前就做完：這時候原型沒被污染、script 沒跑
    expect(await page.evaluate(() => ({ polluted: ({}).polluted, pwn: window.__pwn }))).toEqual({});
    await page.locator('#importReplaceBtn').click();
    await expect(page.locator('#copyToast')).toHaveText('已還原 4 首歌與設定（還原前的資料已自動備份）');
    const ls = await dumpLS(page);
    const stored = JSON.parse(ls['lh:songs']);
    expect(stored).toHaveLength(4);
    const ids = stored.map(x => x.id);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]{1,40}$/);
    expect(new Set(ids).size).toBe(4);
    expect(ids).not.toContain('<img src=x>');
    const byTitle = t => stored.find(x => x.title === t);
    expect(Array.from(stored.find(x => x.title.startsWith('長')).title)).toHaveLength(60);
    expect(byTitle('S3').sections).toHaveLength(2000);
    expect(byTitle('S3').hashtags).toEqual(['短標籤', '標'.repeat(100)]);
    expect(Array.from(byTitle('S3').context)).toHaveLength(100000);
    expect(stored.find(x => x.title.startsWith('長')).sections, '沒有段落的歌補一個空段落').toHaveLength(1);
    for (const sg of stored) for (const sec of sg.sections) expect(Object.keys(sec).sort()).toEqual(['collapsed', 'color', 'custom', 'height', 'id', 'label', 'text', 'type']);   // 第 9 階段起多四個欄位
    expect(JSON.parse(ls.haiku_savedwords)).toEqual(['好詞']);
    expect(ls.apiKey_gemini, '檔案裡的金鑰被忽略').toBe('mine-key');
    expect(ls.haoYunQi_admin_key, '後台金鑰不動').toBe('admin-mine');
    expect(ls.selectedModel).toBe('m-imported');
    expect(ls.hoyun_theme_mode).toBe('dark');
    expect(ls.bgColor1, '形狀不對的顏色被丟掉，備份檔沒有的設定被清掉').toBeUndefined();
    expect(ls.unknownKey).toBeUndefined();
    // 畫面：目前是最新的 S1，惡意字串當成文字顯示
    await expect(page.locator('#songCurrent')).toHaveText('S1');
    await expect(page.locator('.section-textarea').first()).toHaveValue('</textarea><script>window.__pwn=1</script>');
    expect(await page.evaluate(() => ({ polluted: ({}).polluted, pwn: window.__pwn }))).toEqual({});
    expect(errors).toEqual([]);
    expect(offOrigin).toEqual([]);
    await context.close();
});

// 在指定的鍵寫入第一次時丟 QuotaExceededError（之後恢復正常，退回才寫得回去）
const failOnce = () => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
        if (window.__failKey === k) { window.__failKey = null; throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); }
        return orig.call(this, k, v);
    };
};

test('備份：寫到一半失敗會退回', async ({ browser }) => {
    const WRITE_FAILED = '還原沒有完成：瀏覽器的儲存空間可能已滿，已經回到匯入前的狀態。' + UNCHANGED;
    for (const failKey of ['lh:songs', 'selectedModel']) {   // 第一項就失敗、做到一半才失敗
        const { context, page, errors } = await bootPage(browser, { storage: MINE_STORAGE(), device: DESKTOP, wordlist: 'stub', init: failOnce });
        const before = await dumpLS(page);
        await importBuf(page, mkBackup([mkSong('c', '丙', { createdAt: 5000 })], { savedWords: ['新詞'], settings: { selectedModel: 'file-model', hoyun_theme_mode: 'dark' } }));
        await page.evaluate(k => { window.__failKey = k; }, failKey);
        await page.locator('#importReplaceBtn').click();
        await expect(page.locator('#importTitle')).toHaveText(ERR_TITLE);
        await expect(page.locator('#importError'), failKey).toHaveText(WRITE_FAILED);
        await expect(page.locator('#lhSaveBanner')).toBeVisible();
        await expect(page.locator('#lhSaveBanner')).toContainText('存檔失敗');
        expect(await dumpLS(page), `${failKey} 寫入失敗後儲存的資料回到匯入前`).toEqual(before);
        await expect(page.locator('#importCancelBtn')).toBeFocused();
        await page.locator('#importCancelBtn').click();
        // 沒有重新載入：頁面上還是原本的歌
        await expect(page.locator('#songCurrent')).toHaveText('甲');
        expect(errors.filter(e => !/QuotaExceeded|quota/i.test(e))).toEqual([]);
        await context.close();
    }
});

test('備份：備份存不下就不動', async ({ browser }) => {
    const { context, page } = await bootPage(browser, {
        storage: MINE_STORAGE(), device: DESKTOP, wordlist: 'stub',
        init: () => {   // IndexedDB 不能用，localStorage 的備援也寫不進去：自動備份一定失敗
            Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true });
            const orig = Storage.prototype.setItem;
            Storage.prototype.setItem = function (k, v) {
                if (k === 'lh:backup:ls' || k === 'lh:backup:ls2') throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
                return orig.call(this, k, v);
            };
        },
    });
    const before = await dumpLS(page);
    await importBuf(page, mkBackup([mkSong('c', '丙')], { savedWords: ['新詞'], settings: { selectedModel: 'file-model' } }));
    await page.locator('#importReplaceBtn').click();
    await expect(page.locator('#importTitle')).toHaveText(ERR_TITLE);
    await expect(page.locator('#importError')).toHaveText('還原沒有開始：自動備份存不下來（瀏覽器的儲存空間可能已滿）。' + UNCHANGED);
    expect(await dumpLS(page), '備份存不下來就一個字都不寫').toEqual(before);
    await context.close();
});

test('備份：還原中按鈕停用', async ({ browser }) => {
    const { context, page } = await bootPage(browser, { storage: MINE_STORAGE(), device: DESKTOP, wordlist: 'stub' });
    await importBuf(page, mkBackup([mkSong('c', '丙')]));
    await page.evaluate(() => {   // 把自動備份卡住，直到測試放行
        const real = window.lhBackup;
        window.__gate = new Promise(r => { window.__release = r; });
        window.lhBackup = async (...a) => { await window.__gate; return real(...a); };
    });
    await page.locator('#importReplaceBtn').click();
    for (const id of ['#importAddBtn', '#importReplaceBtn', '#importCancelBtn']) await expect(page.locator(id)).toBeDisabled();
    const status = page.locator('#importStatus');
    await expect(status).toHaveText('還原中…');
    await expect(status).toHaveAttribute('role', 'status');
    // 還原中 Esc、點遮罩都關不掉
    await page.keyboard.press('Escape');
    await page.mouse.click(5, 5);
    await expect(page.locator('#importOverlay')).toBeVisible();
    await page.evaluate(() => window.__release());
    await expect(page.locator('#copyToast')).toHaveText('已還原 1 首歌與設定（還原前的資料已自動備份）');
    await context.close();
});

test('備份：歌名標籤太多與太長', async ({ browser }) => {
    const many = Array.from({ length: 12 }, (_, i) => mkSong('m' + i, i === 0 ? '長'.repeat(60) : '歌' + i, { createdAt: 1000 + i }));
    const { context, page } = await bootPage(browser, { storage: MINE_STORAGE(), device: DEVICES.phone, wordlist: 'stub' });
    await importBuf(page, mkBackup(many));
    await expect(page.locator('#importSummary')).toHaveText('這份備份有 12 首歌與你的設定');
    const chips = page.locator('#importChips .report-chip');
    await expect(chips).toHaveCount(6);
    await expect(chips.last()).toHaveText('+7');
    await expect(chips.first()).toHaveText('長'.repeat(60));
    const r = await page.evaluate(() => {
        const dlg = document.querySelector('.import-dialog').getBoundingClientRect();
        const rects = [...document.querySelectorAll('#importChips .report-chip')].map(c => c.getBoundingClientRect());
        return {
            inside: rects.every(c => c.left >= dlg.left - 0.5 && c.right <= dlg.right + 0.5),
            pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            dialogMaxH: getComputedStyle(document.querySelector('.import-dialog')).maxHeight,
            dialogBottom: dlg.bottom, vh: window.innerHeight,
            longChipLines: rects[0].height > rects[1].height * 1.5,
        };
    });
    expect(r.inside, '標籤都在視窗裡面').toBe(true);
    expect(r.pageOverflow, '頁面沒有橫向捲動').toBe(false);
    expect(r.longChipLines, '60 字的歌名在視窗裡換行').toBe(true);
    expect(r.dialogBottom).toBeLessThanOrEqual(r.vh);
    expect(r.dialogMaxH).not.toBe('none');
    // 手機觸控：兩個選項與取消鈕的點擊範圍都 ≥ 觸控下限
    for (const id of ['#importAddBtn', '#importReplaceBtn', '#importCancelBtn']) {
        const b = await page.locator(id).boundingBox();
        expect(b.height, id + ' 高度').toBeGreaterThanOrEqual(await hitMin(page) - 0.5);
        expect(b.width, id + ' 寬度').toBeGreaterThanOrEqual(await hitMin(page) - 0.5);
    }
    await context.close();
});

test('備份：一首歌的摘要', async ({ browser }) => {
    const { context, page } = await bootPage(browser, { storage: MINE_STORAGE(), device: DESKTOP, wordlist: 'stub' });
    await importBuf(page, mkBackup([mkSong('only', '唯一的歌')], { exportedAt: '2026-10-11T07:30:00.000Z' }));
    await expect(page.locator('#importTitle')).toHaveText('匯入備份');
    await expect(page.locator('#importSummary')).toHaveText('這份備份有 1 首歌與你的設定');
    const t = new Date('2026-10-11T07:30:00.000Z');
    const p2 = n => String(n).padStart(2, '0');
    await expect(page.locator('#importMeta')).toHaveText(`備份時間：${t.getFullYear()}/${p2(t.getMonth() + 1)}/${p2(t.getDate())} ${p2(t.getHours())}:${p2(t.getMinutes())}`);
    await expect(page.locator('#importChips .report-chip')).toHaveText(['唯一的歌']);
    await expect(page.locator('#importAddBtn')).toContainText('只加入歌曲');
    await expect(page.locator('#importAddBtn')).toContainText('保留你現在的歌曲與設定，備份裡的歌曲會加進來');
    await expect(page.locator('#importReplaceBtn')).toContainText('目前的 2 首歌與設定會被換成備份檔的內容；換之前會先自動備份目前資料');
    await expect(page.locator('#importReplaceBtn')).toHaveAccessibleName('全部還原（取代目前資料）');
    await context.close();
});

test('備份：視窗焦點與鍵盤', async ({ browser }) => {
    const { context, page } = await bootPage(browser, { storage: MINE_STORAGE(), device: DESKTOP, wordlist: 'stub' });
    // 匯入鈕在設定「資料與備份」裡；點了設定會關掉，所以關視窗後焦點還給齒輪鈕
    const opener = page.locator('#settingsTrigger');
    const file = mkBackup([mkSong('c', '丙')]);
    const open = async () => {
        await openDataTab(page);
        const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.locator(SETTINGS_IMPORT).click()]);
        await fc.setFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
        await expect(page.locator('#importOverlay')).toBeVisible();
    };
    await open();
    await expect(page.locator('#importFileInput')).toHaveValue('');
    const title = page.locator('#importTitle');
    await expect(title).toBeFocused();
    await expect(title).toHaveAttribute('tabindex', '-1');
    await expect(page.locator('.import-dialog')).toHaveAttribute('role', 'dialog');
    await expect(page.locator('.import-dialog')).toHaveAttribute('aria-modal', 'true');
    // Tab 順序：只加入歌曲 → 全部還原 → 先不匯入，之後回到第一個（焦點出不去）
    const seq = [];
    for (let i = 0; i < 4; i++) { await page.keyboard.press('Tab'); seq.push(await page.evaluate(() => document.activeElement.id)); }
    expect(seq).toEqual(['importAddBtn', 'importReplaceBtn', 'importCancelBtn', 'importAddBtn']);
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('#importCancelBtn')).toBeFocused();
    // Esc、點遮罩、先不匯入：都關掉並把焦點還給開啟前的按鈕
    await page.keyboard.press('Escape');
    await expect(page.locator('#importOverlay')).toBeHidden();
    await expect(opener).toBeFocused();
    await open();
    await page.mouse.click(5, 5);
    await expect(page.locator('#importOverlay')).toBeHidden();
    await expect(opener).toBeFocused();
    await open();
    await page.locator('#importCancelBtn').click();
    await expect(page.locator('#importOverlay')).toBeHidden();
    await expect(opener).toBeFocused();
    // 點視窗裡面不會關
    await open();
    await page.locator('#importSummary').click();
    await expect(page.locator('#importOverlay')).toBeVisible();
    // 目前的資料都沒動
    expect(JSON.parse((await dumpLS(page))['lh:songs']).map(x => x.id)).toEqual(['a', 'b']);
    await context.close();
});

// ==================== 審查修正（08-REVIEW CR-01）：字庫覆寫的壞項目 ====================
// 檔案用文字拼出來：JSON.parse 會把 "__proto__" 當成自己的屬性
const BAD_DICT = '{"ㄚ1":123,"ㄚ2":null,"ㄚ3":{},"__proto__":{"polluted":"yes"},"x y":"zz","ㄅㄧㄣ4":"殯｜鬢｜儐"}';

test('備份：字庫覆寫只收格式正確的項目', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: MINE_STORAGE(), device: DESKTOP, wordlist: 'stub' });
    const file = JSON.stringify({ ...mkBackup([mkSong('c', '丙')]), settings: '@@' }).replace('"@@"', JSON.stringify({ dictOverrides_v076: BAD_DICT }));
    await importBuf(page, file);
    await page.locator('#importReplaceBtn').click();
    await expect(page.locator('#copyToast')).toHaveText('已還原 1 首歌與設定（還原前的資料已自動備份）');
    const ls = await dumpLS(page);
    expect(JSON.parse(ls.dictOverrides_v076), '只剩格式正確的一筆').toEqual({ 'ㄅㄧㄣ4': '殯｜鬢｜儐' });
    expect(await page.evaluate(() => ({ polluted: ({}).polluted, ready: typeof window.__hoyunReady }))).toEqual({ ready: 'object' });
    expect(errors).toEqual([]);
    await context.close();
});

test('字庫覆寫：存檔裡有壞項目時照常開機', async ({ browser }) => {
    // 不經過匯入：直接把壞值放進 localStorage（手動改過、舊版殘留），開機不能中止
    const { context, page, errors, warnings } = await bootPage(browser, { storage: { ...MINE_STORAGE(), dictOverrides_v076: BAD_DICT }, device: DESKTOP, wordlist: 'stub' });
    expect(errors).toEqual([]);
    expect(warnings.some(w => w.includes('dictOverrides_v076 有 5 筆格式不合的項目'))).toBe(true);
    // 開機有跑完：歌詞畫出來、好的那筆覆寫進了字庫、原型沒被換掉
    await expect(page.locator('#songCurrent')).toHaveText('甲');
    expect(await page.evaluate(() => ({ good: rhymeDict['ㄅㄧㄣ4'], proto: Object.getPrototypeOf(rhymeDict) === Object.prototype, keys: Object.keys(dictOverrides) }))).toEqual({ good: '殯｜鬢｜儐', proto: true, keys: ['ㄅㄧㄣ4'] });
    await context.close();
});

test('字庫覆寫：字庫資料有非字串的值時索引照常建立', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: MINE_STORAGE(), device: DESKTOP, wordlist: 'stub' });
    // 壞值（非字串）只略過那一筆，其餘照常
    const r = await page.evaluate(() => { rhymeDict['ㄚ9'] = 123; buildIndex(); return Object.keys(chineseDict).length > 0; });
    expect(r).toBe(true);
    expect(errors).toEqual([]);
    await context.close();
});

// ==================== 審查修正（WR-01）：還原期間到重新載入之間不再寫歌曲 ====================
test('還原：閂上之後打字、計時器、失焦都不寫歌曲，放開才存', async ({ browser }) => {
    const { context, page } = await bootPage(browser, { storage: MINE_STORAGE(), device: DESKTOP, wordlist: 'stub' });
    const ta = page.locator('.section-textarea').first();
    const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('lh:songs')).find(s => s.id === 'a').sections[0].text);
    const before = await stored();
    await page.evaluate(() => setSavesFrozen(true));
    await ta.fill('閂上之後打的字');
    await page.evaluate(() => { document.activeElement.blur(); window.dispatchEvent(new Event('pagehide')); flushSongs(); });
    await page.waitForTimeout(600);   // 比 300 毫秒的存檔計時器長
    expect(await stored(), '閂上的期間儲存的歌曲不變').toBe(before);
    await page.evaluate(() => { setSavesFrozen(false); flushSongs(); });
    expect(await stored(), '放開後補存').toBe('閂上之後打的字');
    await context.close();
});

test('還原失敗後放開閂：還原期間打的字會補存', async ({ browser }) => {
    const { context, page } = await bootPage(browser, { storage: MINE_STORAGE(), device: DESKTOP, wordlist: 'stub', init: failOnce });
    await importBuf(page, mkBackup([mkSong('c', '丙', { createdAt: 5000 })]));
    await page.evaluate(() => {   // 自動備份卡住，期間使用者還在打字
        const real = window.lhBackup;
        window.__gate = new Promise(r => { window.__release = r; });
        window.lhBackup = async (...a) => { await window.__gate; return real(...a); };
        window.__failKey = 'lh:songs';
    });
    await page.locator('#importReplaceBtn').click();
    await expect(page.locator('#importStatus')).toHaveText('還原中…');
    await page.evaluate(() => { const t = document.querySelector('.section-textarea'); t.value = '還原期間的字'; t.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForTimeout(500);
    await page.evaluate(() => window.__release());
    await expect(page.locator('#importTitle')).toHaveText(ERR_TITLE);
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lh:songs')).find(s => s.id === 'a').sections[0].text)).toBe('還原期間的字');
    await context.close();
});

// ==================== 審查修正（WR-02）：上限比編輯器寬，真的超過時先講 ====================
test('備份：編輯器能存的內容不會被截短，真的超過才先提醒', async ({ browser }) => {
    const { context, page } = await bootPage(browser, { storage: MINE_STORAGE(), device: DESKTOP, wordlist: 'stub' });
    // 編輯器沒有段數、情境長度的限制：這些量都要原樣還原（標籤例外：第 9 階段起自訂名稱上限 40 字元，見下面的斷言）
    const secs = Array.from({ length: 250 }, (_, i) => ({ id: 's' + i, label: '段' + '落'.repeat(80), text: 'x'.repeat(i === 0 ? 250000 : 5), collapsed: false }));
    const big = { id: 'big', title: '大歌', createdAt: 5000, updatedAt: 5000, sections: secs, hashtags: Array.from({ length: 80 }, (_, i) => '標' + '籤'.repeat(40) + i), context: '情'.repeat(9000) };
    await importBuf(page, mkBackup([big]));
    await expect(page.locator('#importSummary'), '沒超過上限就沒有提醒').toHaveText('這份備份有 1 首歌與你的設定');
    await page.locator('#importReplaceBtn').click();
    await expect(page.locator('#copyToast')).toHaveText('已還原 1 首歌與設定（還原前的資料已自動備份）');
    const got = JSON.parse((await dumpLS(page))['lh:songs'])[0];
    expect(got.sections).toHaveLength(250);
    expect(got.sections[0].text).toHaveLength(250000);
    expect(Array.from(got.sections[0].label), '認不得的長標籤成為自訂名稱，只留前 40 個字元（A4）').toHaveLength(40);
    expect(got.hashtags).toHaveLength(80);
    expect(got.context).toHaveLength(9000);
    await context.close();
});

// ==================== 審查修正（WR-03、WR-04）：退回成不成功要如實說 ====================
// window.__failKey 指定的鍵：window.__failTimes 次寫入失敗（預設一次）；-1＝一直失敗
const failKeyTimes = () => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
        if (window.__failKey === k && window.__failTimes !== 0) {
            if (window.__failTimes > 0) window.__failTimes--;
            throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
        }
        return orig.call(this, k, v);
    };
};

// 退回也失敗、閂維持上著時：編輯器不能默默吃字（IN-07）——橫幅明講、存檔回報失敗，之後打字再存也會再提醒
async function expectFrozenBanner(page) {
    const banner = page.locator('#lhSaveBanner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('資料可能沒有存下來，請先「備份全部」再重新整理');
    if (await page.locator('#importOverlay.show').count()) await page.locator('#importCancelBtn').click();
    await page.locator('#lhSaveBanner .lh-save-banner-close').click();
    await expect(banner).toBeHidden();
    expect(await page.evaluate(() => flushSongs()), '凍結中 flushSongs 回報失敗').toBe(false);
    await page.locator('.section-textarea').first().fill('凍結中繼續打的字');
    await page.waitForTimeout(400);   // 打字後的存檔計時器仍會提醒（橫幅 60 秒內同一種只顯示一次，所以這裡看 flushSongs）
    expect(await page.evaluate(() => flushSongs())).toBe(false);
    // 「備份全部」從記憶體組檔，打的字不會丟
    const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => exportSession())]);
    const file = test.info().outputPath('frozen.json');
    await dl.saveAs(file);
    expect(JSON.parse(readFileSync(file, 'utf8')).songs.some(x => x.sections.some(sec => sec.text === '凍結中繼續打的字'))).toBe(true);
}

test('備份：全部還原寫到一半失敗、連退回也失敗時，如實說資料可能是新舊混合', async ({ browser }) => {
    const { context, page } = await bootPage(browser, { storage: MINE_STORAGE(), device: DESKTOP, wordlist: 'stub', init: failKeyTimes });
    await importBuf(page, mkBackup([mkSong('c', '丙', { createdAt: 5000 })], { settings: { selectedModel: 'file-model' } }));
    await page.evaluate(() => { window.__failKey = 'selectedModel'; window.__failTimes = -1; });   // 寫入失敗、退回時要寫回的同一個鍵也失敗
    await page.locator('#importReplaceBtn').click();
    await expect(page.locator('#importTitle')).toHaveText(ERR_TITLE);
    const text = await page.locator('#importError').textContent();
    expect(text).toContain('退回匯入前的狀態也沒有成功');
    expect(text).toContain('備份全部');
    expect(text, '資料可能被動到，不能說都沒有被改動').not.toContain(UNCHANGED);
    expect(text).not.toContain('已經回到匯入前的狀態');
    await expectFrozenBanner(page);
    await context.close();
});

test('備份：還原自動備份寫到一半失敗會退回原狀', async ({ browser }) => {
    const { context, page } = await bootPage(browser, { storage: MINE_STORAGE(), device: DESKTOP, wordlist: 'stub', init: failKeyTimes });
    // 把目前資料改成和基準備份不一樣，才分得出有沒有退回
    await page.evaluate(() => { localStorage.setItem('selectedModel', 'changed-after-baseline'); localStorage.setItem('hoyun_theme_mode', 'dark'); });
    const before = await dumpLS(page);
    await page.evaluate(() => { window.__failKey = 'selectedModel'; window.__failTimes = 1; });   // 還原那一下失敗，退回時恢復正常
    await page.evaluate(() => restoreAutoBackup('baseline'));
    await expect(page.locator('#copyToast')).toHaveText('還原沒有完成，已經回到還原前的狀態，目前的資料沒有被改動。');
    const after = await dumpLS(page);
    for (const k of Object.keys(before)) expect(after[k], k).toBe(before[k]);
    // 閂已放開：之後打字照常存
    await page.locator('.section-textarea').first().fill('退回之後的字');
    await page.evaluate(() => flushSongs());
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lh:songs')).find(s => s.id === 'a').sections[0].text)).toBe('退回之後的字');
    await context.close();
});

test('備份：還原自動備份連退回也失敗時，如實說', async ({ browser }) => {
    const { context, page } = await bootPage(browser, { storage: MINE_STORAGE(), device: DESKTOP, wordlist: 'stub', init: failKeyTimes });
    await page.evaluate(() => { localStorage.setItem('selectedModel', 'changed-after-baseline'); });
    await page.evaluate(() => { window.__failKey = 'selectedModel'; window.__failTimes = -1; });
    await page.evaluate(() => restoreAutoBackup('baseline'));
    const toast = page.locator('#copyToast');
    await expect(toast).toContainText('退回原狀也沒有成功');
    await expect(toast).toContainText('備份全部');
    await expectFrozenBanner(page);
    await context.close();
});

// ==================== 審查修正（IN-09）：資料版本旗標寫不進去也算還原失敗 ====================
test('備份：還原自動備份時資料版本旗標寫不進去，算失敗並退回原狀', async ({ browser }) => {
    const { context, page } = await bootPage(browser, { storage: MINE_STORAGE(), device: DESKTOP, wordlist: 'stub', init: failKeyTimes });
    await page.evaluate(() => { localStorage.setItem('selectedModel', 'changed-after-baseline'); });
    const before = await dumpLS(page);
    // 完整流程：還原時資料版本旗標那一下失敗（退回時恢復正常）→ 退回原狀，不重新載入
    await page.evaluate(() => { window.__failKey = 'lh:schema'; window.__failTimes = 1; });
    await page.evaluate(() => restoreAutoBackup('baseline'));
    await expect(page.locator('#copyToast')).toHaveText('還原沒有完成，已經回到還原前的狀態，目前的資料沒有被改動。');
    const after = await dumpLS(page);
    for (const k of Object.keys(before)) expect(after[k], k).toBe(before[k]);
    await context.close();
});

// ==================== 段落模組欄位（第 9 階段 A4）：type / custom / color / height 進出備份 ====================
const mkSec = (id, o = {}) => ({ id, label: '', text: id + '的歌詞', collapsed: false, ...o });
const secBrief = s => ({ id: s.id, text: s.text, type: s.type, custom: s.custom, color: s.color, height: s.height, label: s.label });

test('備份：段落新欄位往返', async ({ browser }) => {
    const songA = { id: 'sa', title: '甲歌', createdAt: 2000, updatedAt: 2000, hashtags: [], context: '', sections: [
        mkSec('r1', { type: 'chorus', custom: '', color: '#48a868', height: 12.5, label: 'Chorus' }),
        mkSec('r2', { type: 'custom', custom: 'Hook', color: '', height: null, label: 'Hook' }),
        mkSec('r3', { type: 'bridge', custom: '', color: '', height: null, label: 'Bridge' }),
    ] };
    const songB = { id: 'sb', title: '乙歌', createdAt: 1000, updatedAt: 1000, hashtags: [], context: '', sections: [
        mkSec('r4', { type: 'verse', custom: '', color: '#e05d5d', height: 30, label: 'Verse I' }),
        mkSec('r5', { type: 'verse', custom: '', color: '', height: null, label: 'Verse II' }),
    ] };
    const expected = [songA, songB].map(s => s.sections.map(secBrief));
    const A = await bootPage(browser, { storage: seed([songA, songB]), device: DESKTOP, wordlist: 'stub' });
    const { file } = await backupTo(A.page, 'sec-backup.json');
    await A.context.close();

    // 全部還原：乾淨瀏覽器
    const B = await bootPage(browser, { storage: {}, device: DESKTOP, wordlist: 'stub' });
    await B.page.setInputFiles('#importFileInput', file);
    await B.page.getByRole('button', { name: '全部還原（取代目前資料）' }).click();
    await expect(B.page.locator('#copyToast')).toHaveText('已還原 2 首歌與設定（還原前的資料已自動備份）');
    const restored = await storedSongs(B.page);
    expect(restored.map(s => s.sections.map(secBrief))).toEqual(expected);
    expect(B.errors).toEqual([]);
    await B.context.close();

    // 只加入歌曲：已經有別的歌的瀏覽器
    const C = await bootPage(browser, { storage: seed([mkSong('other', '別首')]), device: DESKTOP, wordlist: 'stub' });
    await C.page.setInputFiles('#importFileInput', file);
    await C.page.locator('#importAddBtn').click();
    await expect(C.page.locator('#copyToast')).toHaveText('已加入 2 首歌');
    const added = await storedSongs(C.page);
    expect(added.filter(s => s.id === 'sa' || s.id === 'sb').sort((a, b) => a.id.localeCompare(b.id)).map(s => s.sections.map(secBrief))).toEqual(expected);
    expect(C.errors).toEqual([]);
    await C.context.close();
});

test('備份：段落壞欄位丟掉、段落照收', async ({ browser }) => {
    const EXT_B = '𠀀'.repeat(41);   // 41 個 CJK 擴充 B 字（每個 2 個 UTF-16 單位）
    const bad = [
        mkSec('b0', { type: '__proto__', label: '主歌' }),
        mkSec('b1', { type: 'solo', label: 'Hook' }),
        mkSec('b2', { type: 'chorus', color: 'red; background:url(x)' }),
        mkSec('b3', { type: 'chorus', color: '#fff' }),
        mkSec('b4', { type: 'verse', color: '#E05D5D' }),
        mkSec('b5', { type: 'bridge', height: 999 }),
        mkSec('b6', { type: 'bridge', height: '20' }),
        mkSec('b7', { type: 'bridge', height: 3 }),
        mkSec('b8', { type: 'custom', custom: EXT_B, label: 'x' }),
        mkSec('b9', { type: 'constructor', label: '副歌' }),
    ];
    const { context, page, errors } = await bootPage(browser, { storage: seed([mkSong('mine', '我的')]), device: DESKTOP, wordlist: 'stub' });
    const protoBefore = await page.evaluate(() => Object.getOwnPropertyNames(Object.prototype).sort());
    await importBuf(page, mkBackup([{ id: 'bad', title: '壞欄位', createdAt: 3000, updatedAt: 3000, hashtags: [], context: '', sections: bad }], { activeSong: 'bad' }));
    await page.getByRole('button', { name: '全部還原（取代目前資料）' }).click();
    await expect(page.locator('#copyToast')).toHaveText('已還原 1 首歌與設定（還原前的資料已自動備份）');
    const got = (await storedSongs(page))[0].sections;
    expect(got.map(s => s.id), '十段都在、順序不變').toEqual(bad.map(s => s.id));
    expect(got.map(s => s.text), '歌詞一字不改').toEqual(bad.map(s => s.text));
    const by = Object.fromEntries(got.map(s => [s.id, s]));
    expect(by.b0.type, '__proto__ 當作無效，改由 label 推斷').toBe('verse');
    expect(by.b9.type, 'constructor 當作無效，改由 label 推斷').toBe('chorus');
    expect(by.b1).toMatchObject({ type: 'custom', custom: 'Hook', label: 'Hook' });
    expect([by.b2.color, by.b3.color], '壞顏色變空字串').toEqual(['', '']);
    expect(by.b4.color, '大寫轉小寫').toBe('#e05d5d');
    expect([by.b5.height, by.b6.height, by.b7.height], '壞高度變 null').toEqual([null, null, null]);
    expect(Array.from(by.b8.custom), '自訂名稱切成 40 個字元').toEqual(Array.from(EXT_B).slice(0, 40));
    for (const s of got) {
        expect(s.type).toMatch(/^(intro|verse|prechorus|chorus|inter|bridge|outro|custom)$/);
        expect(Object.keys(s).sort()).toEqual(['collapsed', 'color', 'custom', 'height', 'id', 'label', 'text', 'type']);
    }
    expect(await page.evaluate(() => Object.getOwnPropertyNames(Object.prototype).sort()), 'Object.prototype 沒有多出任何鍵').toEqual(protoBefore);
    await page.evaluate(() => Promise.all([window.__hoyunSafetyReady, window.__hoyunSongsReady]));
    await expect(page.locator('#lyricsSections .lyrics-section')).toHaveCount(10);
    expect(await page.locator('#lyricsSections [style*="url("]').count(), '沒有任何段落元素帶 url( 的行內樣式').toBe(0);
    expect(errors).toEqual([]);
    await context.close();
});

test('備份：段落舊版存檔推斷類型', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: seed([mkSong('a', '甲')]), device: DESKTOP, wordlist: 'stub' });
    await importBuf(page, V1_FILE, 'session.json');
    await page.locator('#importAddBtn').click();
    await expect(page.locator('#songCurrent')).toHaveText('匯入的歌曲');
    const imported = (await storedSongs(page)).find(s => s.title === '匯入的歌曲');
    expect(imported.sections.map(s => [s.type, s.label, s.text])).toEqual([
        ['verse', 'Verse', '匯入的第一段歌詞'], ['chorus', 'Chorus', '匯入的第二段歌詞'],
    ]);
    expect(await page.locator('#lyricsSections .section-type').evaluateAll(els => els.map(e => e.textContent))).toEqual(['Verse', 'Chorus']);
    expect(errors).toEqual([]);
    await context.close();
});
