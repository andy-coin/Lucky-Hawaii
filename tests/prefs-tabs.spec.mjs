// R2：偏好設定分頁式（tablist／tab／tabpanel）、「更多設定…」直達「韻腳與句構」、背景動畫開關
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage } from './helpers.mjs';
import { DEVICES, waitStill, hitMin } from './layout-lib.mjs';

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/v096-localStorage.json', import.meta.url), 'utf8'));
const v2Storage = songs => ({ ...FIXTURE, 'lh:schema': '2', 'lh:songs': JSON.stringify(songs), 'lh:activeSong': songs[0].id, leftPanelCollapsed: 'false', rightPanelCollapsed: 'false' });
const song = { id: 's1', title: '測試歌', sections: [{ id: 'sa', type: 'verse', custom: '', color: '', height: null, label: '', text: '我望著遠方的光\n獨自站在窗', collapsed: false }], hashtags: [], context: '', createdAt: 1, updatedAt: 1 };
const TABS = ['外觀', '查詢與詞庫', '韻腳與句構', 'AI', '資料與備份', '說明與回饋'];
const tab = (page, name) => page.getByRole('tab', { name });
const selected = page => page.locator('#prefsTabs [aria-selected="true"]').textContent();

test('分頁：結構、無障礙屬性、每個設定都在某個分頁裡', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub' });
    await page.locator('#settingsTrigger').click();
    await expect(page.getByRole('tablist', { name: '設定分類' })).toBeVisible();
    expect(await page.getByRole('tab').allTextContents()).toEqual(TABS);
    expect(await selected(page), '第一次打開＝第一個分頁').toBe('外觀');
    await expect(tab(page, '外觀')).toBeFocused();
    // 每個 tab 指向一個 tabpanel，panel 也指回來；只有選到的那個看得到；只有選到的 tab 在 Tab 順序裡
    const rel = await page.evaluate(() => [...document.querySelectorAll('#prefsTabs [role=tab]')].map(t => {
        const p = document.getElementById(t.getAttribute('aria-controls'));
        return [p.getAttribute('role'), p.getAttribute('aria-labelledby') === t.id, t.getAttribute('aria-selected'), p.hidden, t.tabIndex];
    }));
    expect(rel).toEqual([['tabpanel', true, 'true', false, 0], ...Array(5).fill(['tabpanel', true, 'false', true, -1])]);
    // 原本的設定都還在（id 不變），各在自己的分頁
    const where = await page.evaluate(() => Object.fromEntries(['sBgColor1', 'sContainerBg', 'sTextColor', 'sHighlightColor', 'showPinyin', 'highlightSearch', 'hideRare', 'filterDuplicate', 'lexiconPackList', 'byokKey-gemini', 'byokKey-groq', 'autoBackupSection', 'mapSettingsSection', 'importFileInput']
        .map(id => [id, document.getElementById(id)?.closest('[role=tabpanel]')?.id ?? null])));
    expect(where).toEqual({
        sBgColor1: 'prefsPanel-look', sContainerBg: 'prefsPanel-look', sTextColor: 'prefsPanel-look', sHighlightColor: 'prefsPanel-look',
        showPinyin: 'prefsPanel-search', highlightSearch: 'prefsPanel-search', hideRare: 'prefsPanel-search', filterDuplicate: 'prefsPanel-search', lexiconPackList: 'prefsPanel-search', 'byokKey-gemini': 'prefsPanel-ai', 'byokKey-groq': 'prefsPanel-ai',
        autoBackupSection: 'prefsPanel-data', mapSettingsSection: 'mapSettingsSection', importFileInput: null,
    });
    const btnTab = async text => page.locator('.settings-dropdown button', { hasText: text }).first().evaluate(b => b.closest('[role=tabpanel]').id);
    expect(await btnTab('重設顏色!')).toBe('prefsPanel-look');
    expect(await btnTab('備份全部')).toBe('prefsPanel-data');
    expect(await btnTab('匯入備份')).toBe('prefsPanel-data');
    expect(await btnTab('清除字庫 local 覆寫')).toBe('prefsPanel-data');
    expect(await btnTab('重看功能導覽')).toBe('prefsPanel-help');
    expect(await btnTab('意見回饋')).toBe('prefsPanel-help');
    // 點分頁切換
    await tab(page, '資料與備份').click();
    await expect(page.locator('#prefsPanel-data')).toBeVisible();
    await expect(page.locator('#prefsPanel-look')).toBeHidden();
    await expect(tab(page, '資料與備份')).toHaveAttribute('aria-selected', 'true');
    // 「關於好韻器」關掉設定、打開關於
    await tab(page, '說明與回饋').click();
    await page.getByRole('button', { name: '關於好韻器' }).click();
    await expect(page.locator('#settingsOverlay')).not.toHaveClass(/show/);
    await expect(page.locator('#aboutOverlay')).toHaveClass(/show/);
    expect(errors).toEqual([]);
    await context.close();
});

test('分頁：方向鍵、Home、End 切換（頭尾相接），Tab 進到分頁內容', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub' });
    await page.evaluate(() => toggleSettings());
    await expect(tab(page, '外觀')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(tab(page, '查詢與詞庫')).toBeFocused();
    expect(await selected(page)).toBe('查詢與詞庫');
    await expect(page.locator('#prefsPanel-search')).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    expect(await selected(page), '左到頭繞到最後').toBe('說明與回饋');
    await page.keyboard.press('Home');
    expect(await selected(page)).toBe('外觀');
    await page.keyboard.press('End');
    expect(await selected(page)).toBe('說明與回饋');
    await page.keyboard.press('ArrowDown');
    expect(await selected(page), '下＝下一個').toBe('外觀');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    expect(await selected(page)).toBe('韻腳與句構');
    await expect(page.locator('#mapSettingsSection .lm-preview')).toBeAttached();   // 鍵盤切到也會建內容
    // Tab 從分頁鈕離開，下一站在分頁內容裡（不是別的分頁鈕）
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement.closest('#mapSettingsSection'))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('#settingsOverlay')).not.toHaveClass(/show/);
    expect(errors).toEqual([]);
    await context.close();
});

test('分頁：「更多設定…」直接到「韻腳與句構」，齒輪回到上次的分頁', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: v2Storage([song]) });
    await page.locator('#rhymeMenuBtn').click();
    await page.locator('#rhymeMenu .rm-more').click();
    await expect(page.locator('#rhymeMenu')).toBeHidden();
    await expect(page.locator('#settingsOverlay')).toHaveClass(/show/);
    expect(await selected(page)).toBe('韻腳與句構');
    await expect(tab(page, '韻腳與句構')).toBeFocused();
    await expect(page.locator('#mapSettingsSection .lm-preview')).toBeVisible();
    expect(await page.locator('#mapSettingsSection').evaluate(e => e.scrollTop), '從最上面開始').toBe(0);
    // 換到別的分頁再關，齒輪打開回到那一頁；「更多設定…」不管上次在哪都到韻腳
    await tab(page, '查詢與詞庫').click();
    await page.keyboard.press('Escape');
    await page.locator('#settingsTrigger').click();
    expect(await selected(page)).toBe('查詢與詞庫');
    await page.keyboard.press('Escape');
    await page.locator('#rhymeMenuBtn').click();
    await page.locator('#rhymeMenu .rm-more').click();
    expect(await selected(page)).toBe('韻腳與句構');
    // 已經開著時再叫一次：還是開著、還是韻腳
    await tab(page, '外觀').click();
    await page.evaluate(() => lhMapOpenPrefs());
    await expect(page.locator('#settingsOverlay')).toHaveClass(/show/);
    expect(await selected(page)).toBe('韻腳與句構');
    expect(errors).toEqual([]);
    await context.close();
});

test('分頁：手機上分頁列橫向捲動、每個分頁夠高、選到的看得到、整頁不左右捲', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.phone, wordlist: 'stub' });
    await page.evaluate(() => toggleSettings());
    await waitStill(page);
    const tabs = page.locator('#prefsTabs [role=tab]');
    for (let i = 0; i < TABS.length; i++) {
        const b = await tabs.nth(i).boundingBox();
        expect(b.height, TABS[i] + ' 高度').toBeGreaterThanOrEqual(await hitMin(page) - 0.5);
    }
    const list = await page.locator('#prefsTabs').evaluate(n => ({ sw: n.scrollWidth, cw: n.clientWidth, ox: getComputedStyle(n).overflowX }));
    if (list.sw > list.cw + 1) expect(list.ox).toBe('auto');
    await tabs.nth(TABS.length - 1).tap();
    const inView = await page.evaluate(() => { const t = document.getElementById('prefsTab-help').getBoundingClientRect(), l = document.getElementById('prefsTabs').getBoundingClientRect(); return t.left >= l.left - 1 && t.right <= l.right + 1; });
    expect(inView, '選到的最後一個分頁整個看得到').toBe(true);
    await expect(page.locator('#prefsPanel-help')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
    await context.close();
});

test('外觀：背景動畫開關接上 js/bgfx.js（狀態讀 lhBgFxIsOn，按了呼叫 lhBgFxSet）', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub' });
    await page.evaluate(() => toggleSettings());
    const sw = page.getByRole('switch', { name: /背景動畫/ });
    await expect(sw).toBeVisible();
    const on0 = await page.evaluate(() => lhBgFxIsOn());
    await expect(sw).toHaveAttribute('aria-checked', String(on0));
    await sw.click();
    await expect(sw).toHaveAttribute('aria-checked', String(!on0));
    expect(await page.evaluate(() => lhBgFxIsOn())).toBe(!on0);
    await sw.click();
    expect(await page.evaluate(() => lhBgFxIsOn())).toBe(on0);
    expect(errors).toEqual([]);
    await context.close();
});
