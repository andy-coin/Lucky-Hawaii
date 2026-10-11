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
