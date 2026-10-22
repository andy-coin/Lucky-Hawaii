// 整合：一個舊版使用者的一整天——升級、寫第二首歌、匯出、備份、換一台乾淨的瀏覽器還原、刪掉再救回
// 只走真實畫面（點按鈕、打字、組字），不直接改資料；ROADMAP 成功條件 1～4 一次跑完
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage, compose, STORAGE_SPY } from './helpers.mjs';

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/v096-localStorage.json', import.meta.url), 'utf8'));
const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const HEADER_BACKUP = '.save-load-controls .save-load-btn >> nth=0';
const FIXTURE_TEXTS = JSON.parse(FIXTURE.haiku_lyrics).map(s => s.text);

const readSongs = page => page.evaluate(() => JSON.parse(localStorage.getItem('lh:songs')));
const ls = (page, k) => page.evaluate(key => localStorage.getItem(key), k);
const ready = page => page.evaluate(() => Promise.all([window.__hoyunReady, window.__hoyunSafetyReady, window.__hoyunSongsReady]));
async function readDownload(dl) {
    const chunks = [];
    for await (const c of await dl.createReadStream()) chunks.push(c);
    return Buffer.concat(chunks).toString('utf8');
}
const openMenu = async page => { await page.locator('#exportToggle').click(); await expect(page.locator('#exportMenu')).toBeVisible(); };
const pickItem = (page, label) => page.locator('#exportMenu .export-item').filter({ has: page.locator('.export-label', { hasText: label }) });

test('整合：舊版使用者的一整天', async ({ browser }) => {
    test.setTimeout(120_000);

    // ===== (a) 舊版資料升級成「我的第一首歌」，原本的字一個都不少 =====
    const A = await bootPage(browser, { storage: FIXTURE, device: DESKTOP, wordlist: 'stub', init: STORAGE_SPY });
    const pa = A.page;
    await expect(pa.locator('#copyToast')).toHaveText('你原本的歌詞已整理成第一首歌「我的第一首歌」，一字不少');
    await pa.locator('#songListToggle').click();
    await expect(pa.locator('.song-item')).toHaveCount(1);
    await expect(pa.locator('.song-pick')).toHaveText('我的第一首歌');
    const migrated = await readSongs(pa);
    expect(migrated).toHaveLength(1);
    expect(migrated[0].sections.map(s => s.text), '三段歌詞一字不少').toEqual(FIXTURE_TEXTS);
    expect(migrated[0].sections).toHaveLength(3);

    // ===== (b) ＋ 新增歌曲 → 改名「新歌」 =====
    await pa.getByRole('button', { name: '新增一首歌曲' }).click();
    const nameInput = pa.locator('.song-name-input');
    await expect(nameInput).toBeFocused();
    await nameInput.fill('新歌');
    await nameInput.press('Enter');
    await expect(pa.locator('#songCurrent')).toHaveText('新歌');
    await expect(pa.locator('.song-item')).toHaveCount(2);
    const newId = await pa.evaluate(() => activeSongId);

    // ===== (c) 新歌裡打字，再用注音組字打「你」：組字中完全不存檔，確認後 400 毫秒內存進去 =====
    const ta = pa.locator('.section-textarea').first();
    await ta.click();
    await pa.keyboard.type('第一句');
    // 先等一般打字的那次存檔落地，再開始數組字中的存檔次數
    await pa.waitForFunction(id => JSON.parse(localStorage.getItem('lh:songs')).find(x => x.id === id).sections[0].text === '第一句', newId);
    await pa.evaluate(() => { window.__lsWrites.length = 0; });
    let during = -1;
    await compose(pa, ['ㄋ', 'ㄋㄧ', 'ㄋㄧˇ'], '你', async () => {
        await pa.waitForTimeout(500);   // 比 300 毫秒的存檔等待更久，「沒存」才不是因為還沒到時間
        during = await pa.evaluate(() => window.__lsWrites.filter(w => w.k === 'lh:songs').length);
    });
    expect(during, '組字中沒有任何 lh:songs 存檔').toBe(0);
    await pa.waitForFunction(id => {
        const s = JSON.parse(localStorage.getItem('lh:songs')).find(x => x.id === id);
        return s && s.sections[0].text === '第一句你';
    }, newId, { timeout: 400 });
    await expect(ta).toHaveValue('第一句你');

    // ===== (d) 重新整理：兩首歌都在，新歌還是目前這首，文字沒掉，舊鍵原封不動 =====
    await pa.reload();
    await ready(pa);
    const afterReload = await readSongs(pa);
    expect(afterReload).toHaveLength(2);
    expect(await ls(pa, 'lh:activeSong')).toBe(newId);
    await expect(pa.locator('#songCurrent')).toHaveText('新歌');
    await expect(pa.locator('.section-textarea').first()).toHaveValue('第一句你');
    expect(afterReload.find(s => s.id === 'song-migrated').sections.map(s => s.text)).toEqual(FIXTURE_TEXTS);
    expect(await ls(pa, 'haiku_lyrics'), '舊鍵 haiku_lyrics 沒被動過').toBe(FIXTURE.haiku_lyrics);

    // ===== (e) 匯出 TXT 與 複製整首：照規格，而且和畫面上的模型一字不差 =====
    const TXT = '新歌\n\n[Verse]\n第一句你\n';   // 新歌的第一段是 Verse，匯出直接用模型的段落名（第 9 階段 A3）
    await openMenu(pa);
    const [dl] = await Promise.all([pa.waitForEvent('download'), pickItem(pa, 'TXT').click()]);
    expect(dl.suggestedFilename()).toBe('新歌.txt');
    const fileText = await readDownload(dl);
    expect(fileText).toBe(TXT);
    expect(fileText, '和模型組出來的 TXT 一樣').toBe(await pa.evaluate(() => songToTxt(curSong())));
    await pa.evaluate(() => navigator.clipboard.writeText('舊內容'));
    await openMenu(pa);
    await pickItem(pa, '複製整首').click();
    await expect(pa.locator('#copyToast')).toHaveText('已複製整首');
    expect(await pa.evaluate(() => navigator.clipboard.readText())).toBe(TXT);

    // ===== (f) 備份全部 =====
    const [bk] = await Promise.all([pa.waitForEvent('download'), pa.locator(HEADER_BACKUP).click()]);
    expect(bk.suggestedFilename()).toMatch(/^LuckyHawaii-備份-\d{8}-\d{4}\.json$/);
    const backupFile = test.info().outputPath('journey-backup.json');
    await bk.saveAs(backupFile);
    await expect(pa.locator('#copyToast')).toHaveText('已匯出備份檔（2 首歌）');
    // 備份從記憶體組檔（舊歌沒被編輯過，儲存裡還是舊 label），所以拿記憶體當對照，不拿儲存的原文（第 9 階段 A2／A3）
    const srcSongs = await pa.evaluate(() => JSON.parse(JSON.stringify(songs)));
    const srcActive = await ls(pa, 'lh:activeSong');
    const srcWords = await ls(pa, 'haiku_savedwords');
    const srcModel = await ls(pa, 'selectedModel');
    expect(srcModel).toBe('gpt-4.1');

    // ===== (g) 另一台乾淨的瀏覽器：匯入 → 全部還原，兩首歌與設定都在 =====
    const B = await bootPage(browser, { storage: {}, device: DESKTOP, wordlist: 'stub' });
    const pb = B.page;
    expect(await ls(pb, 'haiku_savedwords'), 'B 一開始沒有任何保留詞').toBeNull();
    await pb.setInputFiles('#importFileInput', backupFile);
    await expect(pb.locator('#importOverlay')).toBeVisible();
    await pb.getByRole('button', { name: '全部還原（取代目前資料）' }).click();
    await expect(pb.locator('#copyToast')).toHaveText('已還原 2 首歌與設定（還原前的資料已自動備份）');
    await ready(pb);
    const bSongs = await readSongs(pb);
    expect(bSongs).toHaveLength(2);
    expect(bSongs, '還原後的歌（含類型、顏色、高度）與來源記憶體裡的一模一樣').toEqual(srcSongs);
    expect(await ls(pb, 'lh:activeSong')).toBe(srcActive);
    expect(await ls(pb, 'haiku_savedwords')).toBe(srcWords);
    expect(await ls(pb, 'selectedModel')).toBe(srcModel);
    expect(await ls(pb, 'hoyun_theme_mode')).toBe('light');
    expect(await ls(pb, 'apiKey_gemini'), '金鑰不會跟著備份檔走').toBeNull();
    await expect(pb.locator('#songCurrent')).toHaveText('新歌');
    await expect(pb.locator('.section-textarea').first()).toHaveValue('第一句你');

    // ===== (h) 在 B 刪掉「我的第一首歌」→ 自動備份有一份 → 設定裡「還原這份」按兩下救回來 =====
    await pb.locator('#leftPanel .side-panel-tab').click();   // 乾淨的瀏覽器，左邊的歌詞面板一開始是收起來的（面板開關不屬於備份內容）
    await pb.locator('#songListToggle').click();
    await pb.locator('.song-pick', { hasText: '我的第一首歌' }).click();
    await expect(pb.locator('#songCurrent')).toHaveText('我的第一首歌');
    await pb.locator('.song-act.delete[data-song-id="song-migrated"]').click();
    await expect(pb.locator('#songDeleteTitle')).toHaveText('刪除「我的第一首歌」？');
    await pb.locator('#songDeleteConfirm').click();
    await expect(pb.locator('#songDeleteOverlay')).toBeHidden();
    expect((await readSongs(pb)).map(s => s.id)).toEqual([newId]);
    const backups = await pb.evaluate(() => lhListBackups());
    expect(backups.some(r => r.id.startsWith('song-delete-')), '刪除前有自動備份').toBe(true);

    await pb.locator('#settingsTrigger').click();
    await pb.locator('#autoBackupSection summary').click();
    const restoreBtn = pb.locator('#autoBackupList li', { hasText: '刪除「我的第一首歌」前的自動備份' }).locator('.backup-restore-btn');
    await restoreBtn.click();
    await expect(restoreBtn).toHaveText('再按一次確定還原（會先備份目前資料）');
    await restoreBtn.click();
    await expect(pb.locator('#copyToast')).toHaveText('已還原自動備份（還原前的資料已自動備份）');
    await ready(pb);
    const restored = await readSongs(pb);
    expect(restored.map(s => s.title).sort()).toEqual(['我的第一首歌', '新歌'].sort());
    expect(restored.find(s => s.id === 'song-migrated').sections.map(s => s.text), '救回來的歌詞和升級時一樣').toEqual(FIXTURE_TEXTS);
    expect(restored.find(s => s.id === newId).sections[0].text).toBe('第一句你');

    // ===== (i) 全程沒有頁面錯誤，也沒有連到不認得的網站 =====
    expect(A.errors, 'A 頁面錯誤').toEqual([]);
    expect(B.errors, 'B 頁面錯誤').toEqual([]);
    expect(A.offOrigin, 'A 連到不認得的網站').toEqual([]);
    expect(B.offOrigin, 'B 連到不認得的網站').toEqual([]);
    await A.context.close();
    await B.context.close();
});
