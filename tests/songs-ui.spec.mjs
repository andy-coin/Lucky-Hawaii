// 歌曲清單（EDIT-04）：標題列、☰ 歌曲清單、新增、切換、改名、版面
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage, activeSong } from './helpers.mjs';

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/v096-localStorage.json', import.meta.url), 'utf8'));
const MIGRATION_TOAST = '你原本的歌詞已整理成第一首歌「我的第一首歌」，一字不少';
const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };

test('歌曲清單：打開、新增、切換', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: FIXTURE, device: DESKTOP });
    const toggle = page.locator('#songListToggle');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#songList')).toBeHidden();
    await expect(page.locator('#songCurrent')).toHaveText('我的第一首歌');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#songList')).toBeVisible();
    await expect(page.locator('.song-item')).toHaveCount(1);
    await expect(page.locator('.song-item[aria-current="true"] .song-pick')).toHaveText('我的第一首歌');
    await expect(page.locator('#songListCaption')).toHaveText('歌曲（1）');
    await expect(page.locator('#songListHint')).toBeVisible();

    await page.getByRole('button', { name: '新增一首歌曲' }).click();
    await expect(page.locator('.song-item')).toHaveCount(2);
    await expect(page.locator('.song-item').first().locator('.song-pick')).toHaveText('未命名歌曲 1');
    await expect(page.locator('.song-item').first()).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('#songCurrent')).toHaveText('未命名歌曲 1');
    await expect(page.locator('#songListHint')).toBeHidden();
    await expect(page.locator('.section-textarea')).toHaveCount(1);
    await expect(page.locator('.section-textarea')).toHaveAttribute('placeholder', '在這裡輸入或貼上歌詞…');
    await expect(page.locator('.section-textarea')).toHaveValue('');
    await page.locator('.section-textarea').fill('新歌的第一行');

    await page.locator('.song-pick', { hasText: '我的第一首歌' }).click();
    await expect(page.locator('#songCurrent')).toHaveText('我的第一首歌');
    await expect(page.locator('.section-textarea').first()).toHaveValue(/夜色 & 微光<b>粗體<\/b>/);

    await page.reload();
    await page.evaluate(() => window.__hoyunSongsReady);
    const titles = await page.evaluate(() => JSON.parse(localStorage.getItem('lh:songs')).map(s => s.title));
    expect(titles.sort()).toEqual(['我的第一首歌', '未命名歌曲 1']);
    expect(errors).toEqual([]);
    await context.close();
});

test('歌曲清單：升級提示只出現一次', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: FIXTURE, device: DESKTOP });
    await expect(page.locator('#copyToast')).toHaveText(MIGRATION_TOAST);
    await expect(page.locator('#copyToast')).toHaveClass(/show/);
    await page.reload();
    await page.evaluate(() => window.__hoyunSongsReady);
    await page.waitForTimeout(300);
    expect(await page.locator('#copyToast').count()).toBe(0);
    expect(errors).toEqual([]);
    await context.close();
});
