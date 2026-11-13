// 整合：第 9 階段一次走完（ROADMAP 成功條件 1～5）——舊版使用者升級後，用真實畫面做完所有段落操作，重新整理後全部還在
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage, activeSongRaw } from './helpers.mjs';
import { DEVICES, waitStill } from './layout-lib.mjs';
import { centerOf, mouseDrag } from './drag-lib.mjs';

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/v096-localStorage.json', import.meta.url), 'utf8'));
const OPEN_PANELS = { leftPanelCollapsed: 'false', rightPanelCollapsed: 'false' };
const secs = page => page.locator('#lyricsSections .lyrics-section');
const ids = page => secs(page).evaluateAll(els => els.map(e => e.dataset.id));
const names = page => page.locator('#lyricsSections .section-type').evaluateAll(els => els.map(e => e.textContent));
const texts = page => page.locator('#lyricsSections .section-textarea').evaluateAll(els => els.map(e => e.value));
const ta = (page, n) => secs(page).nth(n).locator('.section-textarea');
const taPx = async (page, n) => (await ta(page, n).boundingBox()).height;
const disabled = (page, id) => page.locator(id).getAttribute('aria-disabled');
async function readDownload(dl) {
    const chunks = [];
    for await (const c of await dl.createReadStream()) chunks.push(c);
    return Buffer.concat(chunks).toString('utf8');
}

test('整合：段落模組一次走完', async ({ browser }) => {
    test.setTimeout(120_000);
    const { context, page, errors, offOrigin } = await bootPage(browser, { storage: { ...FIXTURE, ...OPEN_PANELS }, device: DEVICES.desktop, wordlist: 'stub' });
    await waitStill(page);

    // ===== 1. 舊版資料升級，名稱依類型顯示（單一類型不編號）=====
    expect(await names(page)).toEqual(['Verse', 'Chorus', 'Bridge']);
    const origIds = await ids(page);
    expect(origIds).toHaveLength(3);
    const [idVerse, idChorus, idBridge] = origIds;

    // ===== 2. 點名稱開下拉選單，換成 Inter =====
    await page.locator('#lyricsSections .section-type').nth(1).click();   // 下拉選單
    await page.locator('#sectionMenu .type-row[data-type="inter"]').click();
    expect(await names(page)).toEqual(['Verse', 'Inter', 'Bridge']);

    // ===== 3. 右鍵開段落設定，選紅色，Esc 收起 =====
    await page.locator('#lyricsSections .section-type').nth(1).click({ button: 'right' });
    const menu = page.locator('#sectionMenu');
    await expect(menu).toBeVisible();
    await menu.locator('.swatch[aria-label="顏色：紅"]').click();
    await expect(secs(page).nth(1)).toHaveAttribute('data-color', '#e05d5d');
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();

    // ===== 4. 用把手把 Bridge 拖到 Inter 上面 =====
    const b = await secs(page).nth(1).boundingBox();
    await mouseDrag(page, await centerOf(secs(page).nth(2).locator('.section-handle')), [b.x + b.width / 2, b.y + b.height * 0.25]);
    expect(await ids(page)).toEqual([idVerse, idBridge, idChorus]);
    expect(await names(page)).toEqual(['Verse', 'Bridge', 'Inter']);

    // ===== 6. 打字、↶、↷ =====
    const original = (await texts(page))[0];
    await ta(page, 0).click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type('abc');
    await expect(ta(page, 0)).toHaveValue(original + 'abc');
    await page.locator('#undoBtn').click();
    await expect(ta(page, 0)).toHaveValue(original);
    await page.locator('#redoBtn').click();
    await expect(ta(page, 0)).toHaveValue(original + 'abc');

    // ===== 7. 刪掉最後一段，按提示的「復原」救回（顏色、類型都在）=====
    await secs(page).nth(2).locator('.section-remove').click();
    await page.locator('#lhAskActions .song-danger-btn').click();
    await expect(secs(page)).toHaveCount(2);
    await page.locator('#copyToast .toast-action').click();
    await expect(secs(page)).toHaveCount(3);
    expect(await ids(page)).toEqual([idVerse, idBridge, idChorus]);
    expect(await names(page)).toEqual(['Verse', 'Bridge', 'Inter']);
    await expect(secs(page).nth(2)).toHaveAttribute('data-color', '#e05d5d');

    // ===== 8. 把 AI 詞卡拖到第一段最前面 =====
    await page.evaluate(() => { document.getElementById('aiWordsContainer').innerHTML = aiWordCardHtml('花開', false); });
    const tb = await ta(page, 0).boundingBox();
    await mouseDrag(page, await centerOf(page.locator('#aiWordsContainer .ai-word-card').first()), [tb.x + 3, tb.y + 10]);
    await expect(ta(page, 0)).toHaveValue('花開' + original + 'abc');

    // ===== 9. 存檔不靠 flush：直接讀儲存 =====
    const finalTexts = await texts(page);
    expect(finalTexts[0]).toBe('花開' + original + 'abc');
    await expect.poll(async () => (await activeSongRaw(page)).sections.map(s => s.text)).toEqual(finalTexts);
    const stored = await activeSongRaw(page);
    expect(stored.sections.map(s => s.id)).toEqual([idVerse, idBridge, idChorus]);
    expect(stored.sections.map(s => s.label)).toEqual(['Verse', 'Bridge', 'Inter']);
    expect(stored.sections[2].color).toBe('#e05d5d');

    // ===== 10. 重新整理：順序、名稱、顏色、高度、文字都在，↶ ↷ 回到停用 =====
    await page.reload();
    await page.evaluate(() => Promise.all([window.__hoyunReady, window.__hoyunSongsReady]));
    await waitStill(page);
    expect(await ids(page)).toEqual([idVerse, idBridge, idChorus]);
    expect(await names(page)).toEqual(['Verse', 'Bridge', 'Inter']);
    await expect(secs(page).nth(2)).toHaveAttribute('data-color', '#e05d5d');
    expect(await texts(page)).toEqual(finalTexts);
    const afterReload = await activeSongRaw(page);
    expect(await disabled(page, '#undoBtn')).toBe('true');
    expect(await disabled(page, '#redoBtn')).toBe('true');

    // ===== 11. 匯出 TXT：標題 = 畫面上的名稱，照順序 =====
    await page.locator('#exportToggle').click();
    const [dl] = await Promise.all([
        page.waitForEvent('download'),
        page.locator('#exportMenu .export-item').filter({ has: page.locator('.export-label', { hasText: 'TXT' }) }).click(),
    ]);
    const fileText = await readDownload(dl);
    const headings = fileText.split('\n').filter(l => /^\[.+\]$/.test(l)).map(l => l.slice(1, -1));
    expect(headings).toEqual(await names(page));
    expect(fileText).toContain('花開' + original.split('\n')[0]);

    expect(errors).toEqual([]);
    expect(offOrigin).toEqual([]);
    await context.close();
});
