// 刪除歌曲（EDIT-04 刪除）與自動備份清單（F1）：先備份再刪、不會剩 0 首、從設定裡救回
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage } from './helpers.mjs';

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/v096-localStorage.json', import.meta.url), 'utf8'));
const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };

const song = (id, title, createdAt, o = {}) => ({
    id, title, createdAt, updatedAt: createdAt,
    sections: [{ id: 'sec-' + id, label: '主歌', text: o.text ?? '', collapsed: false }],
    hashtags: o.hashtags ?? [], context: o.context ?? '',
});
// 已經是第 2 版資料的使用者：直接帶 lh:songs，左邊面板預設展開
const seed = (songs, active = songs[0].id) => ({
    'lh:schema': '2', 'lh:songs': JSON.stringify(songs), 'lh:activeSong': active,
    leftPanelCollapsed: 'false', rightPanelCollapsed: 'true',
});
// 清單由新到舊：丙、乙、甲
const THREE = [song('song-a', '甲', 1000, { text: '甲的歌詞' }), song('song-b', '乙', 2000, { text: '乙的歌詞' }), song('song-c', '丙', 3000, { text: '丙的歌詞' })];

const readSongs = page => page.evaluate(() => JSON.parse(localStorage.getItem('lh:songs')));
const del = (page, id) => page.locator('.song-act.delete[data-song-id="' + id + '"]');
const BODY = '這首歌的歌詞會一起刪除（刪除前會自動備份，可從備份還原）。';

test('刪除歌曲：先備份再刪', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: seed(THREE, 'song-b'), device: DESKTOP, wordlist: 'stub' });
    await page.locator('#songListToggle').click();
    await del(page, 'song-b').click();
    await expect(page.locator('#songDeleteOverlay')).toBeVisible();
    await expect(page.locator('#songDeleteOverlay [role="alertdialog"]')).toHaveCount(1);
    await expect(page.locator('#songDeleteTitle')).toHaveText('刪除「乙」？');
    await expect(page.locator('#songDeleteBody')).toHaveText(BODY);
    await expect(page.locator('#songDeleteCancel')).toBeFocused();

    await page.locator('#songDeleteConfirm').click();
    await expect(page.locator('#songDeleteOverlay')).toBeHidden();

    const backups = await page.evaluate(() => lhListBackups());
    const b = backups.find(r => r.id.startsWith('song-delete-'));
    expect(b, '刪除前要有自動備份').toBeTruthy();
    expect(b.label).toBe('刪除「乙」前的自動備份');
    expect(JSON.parse(b.data['lh:songs']).map(s => s.id)).toContain('song-b');

    const after = await readSongs(page);
    expect(after.map(s => s.id).sort()).toEqual(['song-a', 'song-c']);
    expect(await page.evaluate(() => localStorage.getItem('lh:activeSong'))).toBe('song-a');   // 清單由新到舊，乙下面是甲
    await expect(page.locator('#copyToast')).toHaveText('已刪除「乙」');
    await expect(page.locator('#songCurrent')).toHaveText('甲');
    await expect(page.locator('.song-item')).toHaveCount(2);
    expect(errors).toEqual([]);
    await context.close();
});

// ==================== 自動備份清單與還原（F1） ====================
const noIdb = () => { Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true }); };
const schemaOf = page => page.evaluate(() => localStorage.getItem('lh:schema'));
const RESTORE_ARMED = '再按一次確定還原（會先備份目前資料）';
const RESTORED_TOAST = '已還原自動備份（還原前的資料已自動備份）';
const openBackupList = async page => {
    await page.locator('#settingsTrigger').click();
    await page.locator('#autoBackupSection summary').click();
};

// 升級前的版本：多一首歌再還原 pre-schema-2，重新載入後要重跑遷移、看到原本的歌詞（不是空白）
async function expectReMigrated(page, errors) {
    expect(await schemaOf(page)).toBe('1');
    await page.reload();
    await page.evaluate(() => Promise.all([window.__hoyunSafetyReady, window.__hoyunSongsReady]));
    expect(await schemaOf(page)).toBe('2');
    const list = await readSongs(page);
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe('我的第一首歌');
    expect(list[0].sections.map(s => s.text)).toEqual(JSON.parse(FIXTURE.haiku_lyrics).map(s => s.text));
    await expect(page.locator('.section-textarea').first()).toHaveValue(/夜色 & 微光<b>粗體<\/b>/);
    expect(errors).toEqual([]);
}
// 清單開著，從「＋ 新增歌曲」建第二首、打幾個字（清單收著時改名輸入框聚焦不了，所以一定先開清單）
const addSecondSong = async page => {
    if (!(await page.locator('#songList').isVisible())) await page.locator('#songListToggle').click();
    await page.getByRole('button', { name: '新增一首歌曲' }).click();
    await page.locator('.song-name-input').press('Enter');
    await page.locator('.section-textarea').first().fill('新歌的歌詞');
    await page.evaluate(() => flushSongs());
};

test('刪除歌曲：還原會一起還原資料版本', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: FIXTURE, device: DESKTOP, wordlist: 'stub' });
    await addSecondSong(page);
    expect(await readSongs(page)).toHaveLength(2);
    expect(await page.evaluate(() => lhRestoreFromBackup('pre-schema-2'))).toBe(true);
    await expectReMigrated(page, errors);
    await context.close();
});

test('刪除歌曲：備援還原也還原資料版本', async ({ browser }) => {
    // 沒有 IndexedDB：備份只剩 localStorage 那一份（pre-schema-2 取代 baseline）
    const { context, page, errors } = await bootPage(browser, { storage: FIXTURE, device: DESKTOP, wordlist: 'stub', init: noIdb });
    expect(JSON.parse(await page.evaluate(() => localStorage.getItem('lh:backup:ls'))).id).toBe('pre-schema-2');
    await addSecondSong(page);
    expect(await page.evaluate(() => lhRestoreFromBackup('pre-schema-2'))).toBe(true);
    await expectReMigrated(page, errors);
    await context.close();
});

test('刪除歌曲：自動備份清單', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: FIXTURE, device: DESKTOP, wordlist: 'stub' });
    await addSecondSong(page);
    await del(page, await page.evaluate(() => activeSongId)).click();
    await page.locator('#songDeleteConfirm').click();
    await expect(page.locator('#songDeleteOverlay')).toBeHidden();

    await openBackupList(page);
    const rows = page.locator('#autoBackupList li');
    await expect(rows).toHaveCount(3);
    await expect(rows.locator('.backup-label')).toHaveText(['刪除「未命名歌曲 1」前的自動備份', '升級資料格式前的備份（目標版本 2）', '基準備份（這個版本第一次開啟時）']);
    for (const t of await rows.locator('.backup-time').allTextContents()) expect(t).toMatch(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/);
    await expect(rows.first().locator('.backup-restore-btn')).toHaveText('還原這份');
    await expect(rows.first().locator('.backup-restore-btn')).toHaveAttribute('aria-label', '還原這份自動備份：刪除「未命名歌曲 1」前的自動備份');
    expect(errors).toEqual([]);
    await context.close();
});

test('刪除歌曲：沒有備份時的清單', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: FIXTURE, device: DESKTOP, wordlist: 'stub', init: noIdb });
    await page.evaluate(() => localStorage.removeItem('lh:backup:ls'));   // IndexedDB 不可用、備援也是空的
    await openBackupList(page);
    await expect(page.locator('#autoBackupList li')).toHaveText(['目前沒有自動備份']);
    await expect(page.locator('.backup-restore-btn')).toHaveCount(0);
    expect(errors).toEqual([]);
    await context.close();
});

test('刪除歌曲：從自動備份救回刪掉的歌', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: seed(THREE, 'song-b'), device: DESKTOP, wordlist: 'stub' });
    await page.locator('#songListToggle').click();
    await del(page, 'song-b').click();
    await page.locator('#songDeleteConfirm').click();
    await expect(page.locator('#songDeleteOverlay')).toBeHidden();
    expect((await readSongs(page)).map(s => s.id).sort()).toEqual(['song-a', 'song-c']);

    await openBackupList(page);
    const btn = page.locator('#autoBackupList li', { hasText: '刪除「乙」前的自動備份' }).locator('.backup-restore-btn');
    await btn.click();
    await expect(btn).toHaveText(RESTORE_ARMED);
    expect((await readSongs(page)).map(s => s.id).sort(), '第一下只是確認，資料不動').toEqual(['song-a', 'song-c']);
    await page.waitForTimeout(4500);
    await expect(btn).toHaveText('還原這份');   // 4 秒內沒再按就解除

    await btn.click();
    await expect(btn).toHaveText(RESTORE_ARMED);
    await btn.click();
    await expect(page.locator('#copyToast')).toHaveText(RESTORED_TOAST);   // 重新載入後才會出現
    await page.evaluate(() => Promise.all([window.__hoyunSafetyReady, window.__hoyunSongsReady]));
    expect((await readSongs(page)).map(s => s.id).sort()).toEqual(['song-a', 'song-b', 'song-c']);
    expect(await page.evaluate(() => location.hash)).toBe('');
    const pre = (await page.evaluate(() => lhListBackups())).find(r => r.id.startsWith('pre-restore-'));
    expect(pre, '還原前先備份目前資料').toBeTruthy();
    expect(JSON.parse(pre.data['lh:songs']).map(s => s.id).sort()).toEqual(['song-a', 'song-c']);
    expect(errors).toEqual([]);
    await context.close();
});

test('刪除歌曲：備份名稱原樣顯示', async ({ browser }) => {
    const markup = '<b>x</b>';
    const { context, page, errors } = await bootPage(browser, {
        storage: seed([song('song-a', '甲', 1000), song('song-m', markup, 2000)], 'song-m'), device: DESKTOP, wordlist: 'stub',
    });
    await page.locator('#songListToggle').click();
    await del(page, 'song-m').click();
    await expect(page.locator('#songDeleteTitle')).toHaveText('刪除「' + markup + '」？');
    await page.locator('#songDeleteConfirm').click();
    await expect(page.locator('#songDeleteOverlay')).toBeHidden();
    await openBackupList(page);
    await expect(page.locator('#autoBackupList .backup-label').first()).toHaveText('刪除「' + markup + '」前的自動備份');
    await expect(page.locator('#autoBackupList b')).toHaveCount(0);
    expect(errors).toEqual([]);
    await context.close();
});

// ==================== 各種情況：最後一首、備份失敗、刪除中、鍵盤、手機、放大、觸控 ====================
import { DEVICES, setScale, waitStill, rectsOverlap, auditTouchTargets, emulateKeyboard, restoreViewport, readKeyboard, insideVisible } from './layout-lib.mjs';

const TWO = [song('song-b', '第二首', 2000, { text: 'B歌詞' }), song('song-a', '第一首', 1000, { text: 'A歌詞' })];
const box = (page, sel) => page.locator(sel).boundingBox();
const mkBackup = songArr => ({
    format: 'lucky-hawaii-backup', version: 2, exportedAt: '2026-10-11T07:30:00.000Z',
    songs: songArr, activeSong: null, savedWords: [], settings: {},
});
const importBuf = (page, obj) => page.setInputFiles('#importFileInput', { name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(obj)) });
// 讓 lhBackup 先等測試放行（window.__release()）才真的存
const holdBackup = page => page.evaluate(() => {
    const real = window.lhBackup;
    window.__gate = new Promise(r => { window.__release = r; });
    window.lhBackup = async (...a) => { await window.__gate; return real(...a); };
});

test('刪除歌曲：最後一首', async ({ browser }) => {
    // 一首：提示出現、視窗多一句、刪完自動建一首空白的
    const one = await bootPage(browser, { storage: seed([song('song-only', '唯一的歌', 1000, { text: '舊歌詞' })]), device: DESKTOP, wordlist: 'stub' });
    await one.page.locator('#songListToggle').click();
    await expect(one.page.locator('#songListHint')).toBeVisible();
    await del(one.page, 'song-only').click();
    await expect(one.page.locator('#songDeleteLast')).toBeVisible();
    await expect(one.page.locator('#songDeleteLast')).toHaveText('這是最後一首，刪除後會自動建立一首空白的新歌。');
    await one.page.locator('#songDeleteConfirm').click();
    await expect(one.page.locator('#songDeleteOverlay')).toBeHidden();
    await expect(one.page.locator('#copyToast')).toHaveText('已刪除「唯一的歌」，並建立一首空白的新歌');
    const left = await readSongs(one.page);
    expect(left).toHaveLength(1);
    expect(left[0].id).not.toBe('song-only');
    expect(left[0].title).toBe('未命名歌曲 1');
    expect(left[0].sections).toHaveLength(1);
    expect(left[0].sections[0].text).toBe('');
    expect(await one.page.evaluate(() => localStorage.getItem('lh:activeSong'))).toBe(left[0].id);
    await expect(one.page.locator('#songCurrent')).toHaveText('未命名歌曲 1');
    await expect(one.page.locator('.song-item')).toHaveCount(1);
    await expect(one.page.locator('#songListHint')).toBeVisible();
    expect(one.errors).toEqual([]);
    await one.context.close();

    // 兩首：沒有提示、視窗沒有那一句
    const two = await bootPage(browser, { storage: seed(TWO), device: DESKTOP, wordlist: 'stub' });
    await two.page.locator('#songListToggle').click();
    await expect(two.page.locator('#songListHint')).toBeHidden();
    await del(two.page, 'song-b').click();
    await expect(two.page.locator('#songDeleteOverlay')).toBeVisible();
    await expect(two.page.locator('#songDeleteLast')).toBeHidden();
    expect(two.errors).toEqual([]);
    await two.context.close();
});

test('刪除歌曲：備份失敗就不刪', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: seed(THREE, 'song-b'), device: DESKTOP, wordlist: 'stub' });
    await page.locator('#songListToggle').click();
    await del(page, 'song-b').click();
    const status = page.locator('#songDeleteStatus');
    for (const broken of [() => { window.lhBackup = async () => { throw new Error('備份爆了'); }; }, () => { window.lhBackup = async () => ({ ok: false, where: null, existed: false }); }]) {
        await page.evaluate(broken);
        await page.locator('#songDeleteConfirm').click();
        await expect(status).toHaveText('刪除沒有完成，這首歌還在。');
        await expect(page.locator('#songDeleteOverlay')).toBeVisible();
        await expect(page.locator('#songDeleteConfirm')).toBeEnabled();
        await expect(page.locator('#songDeleteConfirm')).toHaveText('刪除這首歌');
        await expect(page.locator('#songDeleteCancel')).toBeEnabled();
        expect((await readSongs(page)).map(s => s.id).sort(), '歌還在').toEqual(['song-a', 'song-b', 'song-c']);
    }
    await expect(page.locator('.song-item')).toHaveCount(3);
    expect(errors.filter(e => !/備份爆了/.test(e))).toEqual([]);
    await context.close();
});

test('刪除歌曲：刪除中', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: seed(THREE, 'song-b'), device: DESKTOP, wordlist: 'stub' });
    await page.locator('#songListToggle').click();
    await del(page, 'song-b').click();
    await holdBackup(page);
    await page.locator('#songDeleteConfirm').click();
    await expect(page.locator('#songDeleteConfirm')).toHaveText('刪除中…');
    await expect(page.locator('#songDeleteConfirm')).toBeDisabled();
    await expect(page.locator('#songDeleteCancel')).toBeDisabled();
    await page.keyboard.press('Escape');
    await page.mouse.click(5, 5);
    await expect(page.locator('#songDeleteOverlay')).toBeVisible();
    expect((await readSongs(page)).map(s => s.id).sort(), '備份還沒完成，歌不能動').toEqual(['song-a', 'song-b', 'song-c']);
    await page.evaluate(() => window.__release());
    await expect(page.locator('#songDeleteOverlay')).toBeHidden();
    await expect(page.locator('#copyToast')).toHaveText('已刪除「乙」');
    expect((await readSongs(page)).map(s => s.id).sort()).toEqual(['song-a', 'song-c']);
    expect(errors).toEqual([]);
    await context.close();
});

test('刪除歌曲：鍵盤與焦點', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: seed(THREE, 'song-b'), device: DESKTOP, wordlist: 'stub' });
    await page.locator('#songListToggle').click();
    await page.locator('.song-pick[data-song-id="song-b"]').focus();
    await page.keyboard.press('Delete');
    await expect(page.locator('#songDeleteOverlay')).toBeVisible();
    await expect(page.locator('#songDeleteTitle')).toHaveText('刪除「乙」？');
    await expect(page.locator('#songDeleteCancel')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#songDeleteConfirm')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#songDeleteCancel')).toBeFocused();   // 焦點關在視窗裡
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('#songDeleteConfirm')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#songDeleteOverlay')).toBeHidden();
    await expect(del(page, 'song-b')).toBeFocused();
    expect((await readSongs(page)).map(s => s.id).sort(), 'Esc 不刪').toEqual(['song-a', 'song-b', 'song-c']);

    // 點遮罩＝先不刪除
    await del(page, 'song-b').click();
    await expect(page.locator('#songDeleteOverlay')).toBeVisible();
    await page.mouse.click(5, 5);
    await expect(page.locator('#songDeleteOverlay')).toBeHidden();
    await expect(del(page, 'song-b')).toBeFocused();
    // 點在視窗裡面不會關
    await del(page, 'song-b').click();
    await page.locator('#songDeleteBody').click();
    await expect(page.locator('#songDeleteOverlay')).toBeVisible();

    // 真的刪掉：那一列不在了，焦點回 ☰ 歌曲
    await page.locator('#songDeleteConfirm').click();
    await expect(page.locator('#songDeleteOverlay')).toBeHidden();
    await expect(page.locator('#songListToggle')).toBeFocused();
    expect(errors).toEqual([]);
    await context.close();
});

test('刪除歌曲：取消不動資料', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: seed(THREE, 'song-b'), device: DESKTOP, wordlist: 'stub' });
    await page.locator('#songListToggle').click();
    const before = await page.evaluate(() => localStorage.getItem('lh:songs'));
    await del(page, 'song-b').click();
    await page.locator('#songDeleteCancel').click();
    await expect(page.locator('#songDeleteOverlay')).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem('lh:songs'))).toBe(before);
    expect((await page.evaluate(() => lhListBackups())).filter(r => r.id.startsWith('song-delete-'))).toHaveLength(0);
    await expect(page.locator('.song-item')).toHaveCount(3);
    expect(errors).toEqual([]);
    await context.close();
});

test('刪除歌曲：手機鍵盤', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: seed(TWO), device: DEVICES.phone, wordlist: 'stub' });
    await page.locator('#mtab-lyrics').click();
    await page.locator('#songListToggle').click();
    await expect(page.locator('#songList')).toBeVisible();
    await page.evaluate(() => startRenameSong(activeSongId));
    await expect(page.locator('.song-name-input')).toBeFocused();
    const size = await emulateKeyboard(page, 336);
    await expect.poll(async () => (await readKeyboard(page)).open, { message: '縮 336px 後應進入 kb-open' }).toBe(true);
    await waitStill(page);
    const kb = await readKeyboard(page);
    const input = await box(page, '.song-name-input');
    expect(insideVisible(input, kb), `改名輸入框 ${JSON.stringify(input)} 要完整在可見範圍內`).toBe(true);
    expect(await page.locator('.mobile-tab-bar').evaluate(el => getComputedStyle(el).display), '鍵盤出現時分頁列藏起來').toBe('none');
    await restoreViewport(page, size);
    await page.keyboard.press('Escape');   // 取消改名

    // 刪除視窗開著、可見高度縮到 508：兩顆按鈕仍完整可見
    await del(page, 'song-b').click();
    await expect(page.locator('#songDeleteOverlay')).toBeVisible();
    await emulateKeyboard(page, 336);
    await waitStill(page);
    const kb2 = await readKeyboard(page);
    for (const id of ['#songDeleteCancel', '#songDeleteConfirm']) {
        const b = await box(page, id);
        expect(insideVisible(b, kb2), `${id} ${JSON.stringify(b)} 要完整在可見範圍內`).toBe(true);
    }
    expect(errors).toEqual([]);
    await context.close();
});

test('刪除歌曲：放大 150% 按鈕不擠', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: seed(TWO, 'song-b'), device: DEVICES.phone, wordlist: 'stub' });
    await page.locator('#mtab-lyrics').click();
    await page.evaluate(() => setUiScale(150));
    await waitStill(page);
    const audit = async (dialogSel, btnSels, label) => {
        const dlg = await box(page, dialogSel + ' .feedback-modal');
        const fits = await page.locator(dialogSel + ' .feedback-modal').evaluate(el => ({ sw: el.scrollWidth, cw: el.clientWidth }));
        expect(fits.sw, `${label} 不出現橫向捲動`).toBeLessThanOrEqual(fits.cw);
        const boxes = [];
        for (const sel of btnSels) {
            await page.locator(sel).scrollIntoViewIfNeeded();
            const b = await box(page, sel);
            expect(b.x, `${label} ${sel} 左緣`).toBeGreaterThanOrEqual(dlg.x - 0.5);
            expect(b.x + b.width, `${label} ${sel} 右緣`).toBeLessThanOrEqual(dlg.x + dlg.width + 0.5);
            boxes.push([sel, b]);
        }
        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
            expect(rectsOverlap(boxes[i][1], boxes[j][1]), `${label} ${boxes[i][0]} 與 ${boxes[j][0]} 重疊`).toBe(false);
        }
    };
    await page.locator('#songListToggle').click();
    await del(page, 'song-b').click();
    await expect(page.locator('#songDeleteOverlay')).toBeVisible();
    await audit('#songDeleteOverlay', ['#songDeleteCancel', '#songDeleteConfirm'], '刪除視窗');
    await page.locator('#songDeleteCancel').click();

    await importBuf(page, mkBackup([song('x1', '匯入一', 1000), song('x2', '匯入二', 2000)]));
    await expect(page.locator('#importOverlay')).toBeVisible();
    await audit('#importOverlay', ['#importAddBtn', '#importReplaceBtn', '#importCancelBtn'], '匯入視窗');
    expect(errors).toEqual([]);
    await context.close();
});

test('刪除歌曲：觸控目標', async ({ browser }) => {
    for (const [name, device, openSheet] of [['手機', DEVICES.phone, true], ['平板直放', DEVICES.tablet, true], ['平板橫放', DEVICES.tabletLandscape, false]]) {
        const { context, page, errors } = await bootPage(browser, { storage: seed(TWO, 'song-b'), device, wordlist: 'stub' });
        if (openSheet) await page.locator('#mtab-lyrics').click();
        await page.locator('#songListToggle').click();
        await waitStill(page);
        let r = await auditTouchTargets(page, { mustSee: ['.song-act.delete'] });
        expect(r.missing, name + ' 🗑 沒量到').toEqual([]);
        expect(r.failures, name + ' 🗑 觸控目標不到 44×44').toEqual([]);
        expect(r.overlaps, name + ' 🗑 相鄰重疊').toEqual([]);

        await del(page, 'song-b').click();
        await expect(page.locator('#songDeleteOverlay')).toBeVisible();
        r = await auditTouchTargets(page, { mustSee: ['#songDeleteCancel', '#songDeleteConfirm'] });
        expect(r.missing, name + ' 刪除視窗按鈕沒量到').toEqual([]);
        expect(r.failures, name + ' 刪除視窗按鈕不到 44×44').toEqual([]);
        expect(r.overlaps, name + ' 刪除視窗按鈕相鄰重疊').toEqual([]);
        await page.locator('#songDeleteCancel').click();

        await page.evaluate(() => toggleSettings());   // 手機上歌詞面板蓋住標題列，直接呼叫開啟函式
        await page.locator('#autoBackupSection summary').click();
        await expect(page.locator('.backup-restore-btn').first()).toBeVisible();
        r = await auditTouchTargets(page, { mustSee: ['.backup-restore-btn'] });
        expect(r.missing, name + ' 還原這份沒量到').toEqual([]);
        expect(r.failures.filter(f => /backup-restore-btn/.test(f.selector)), name + ' 還原這份不到 44×44').toEqual([]);
        expect(errors).toEqual([]);
        await context.close();
    }
});

test('刪除歌曲：還原中按鈕停用', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: seed(THREE, 'song-b'), device: DESKTOP, wordlist: 'stub' });
    await importBuf(page, mkBackup([song('x1', '匯入一', 1000)]));
    await expect(page.locator('#importOverlay')).toBeVisible();
    await holdBackup(page);
    await page.locator('#importReplaceBtn').click();
    for (const id of ['#importAddBtn', '#importReplaceBtn', '#importCancelBtn']) await expect(page.locator(id)).toBeDisabled();
    await expect(page.locator('#importStatus')).toHaveText('還原中…');
    await page.keyboard.press('Escape');
    await expect(page.locator('#importOverlay')).toBeVisible();
    await page.evaluate(() => window.__release());
    await expect(page.locator('#copyToast')).toHaveText('已還原 1 首歌與設定（還原前的資料已自動備份）');
    expect(errors).toEqual([]);
    await context.close();
});
