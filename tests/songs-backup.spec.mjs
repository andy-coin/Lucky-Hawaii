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
