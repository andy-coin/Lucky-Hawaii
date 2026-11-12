// 第 11 階段整合測試——像作詞人一樣用真實畫面走完句構分析與設定頁（ROADMAP 成功條件 1～3）：
// 全新使用者只有句尾上色 → 逐行標記 → 更多設定 → 顯示方式與顏色 → 分析面板 → 反白停留 → 注音組字 → 重新整理。
// 每個計畫已經各自測過自己的功能；這裡把它們串成同一個連續的寫詞過程（結構照 tests/rhyme-journey.spec.mjs）
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage, compose, activeSongRaw } from './helpers.mjs';
import { DEVICES, waitStill } from './layout-lib.mjs';

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/v096-localStorage.json', import.meta.url), 'utf8'));
const OPEN_PANELS = { leftPanelCollapsed: 'false', rightPanelCollapsed: 'false' };
const v2Storage = (songs, extra = OPEN_PANELS) => ({
    ...FIXTURE, 'lh:schema': '2', 'lh:songs': JSON.stringify(songs), 'lh:activeSong': songs[0].id, ...extra,
});
const typed = (id, type, text, extra = {}) => ({ id, type, custom: '', color: '', height: null, label: '', text, collapsed: false, ...extra });
const song = (sections, extra = {}) => ({ id: 's1', title: '測試歌', sections, hashtags: [], context: '', createdAt: 1, updatedAt: 1, ...extra });

const V1 = ['我望著遠方的光', '獨自站在窗', '走過熟悉的街道'].join('\n');
const CH = '你笑著說天亮';
const V2 = ['我望著遠方的光', '獨自站在窗前', '走過熟悉的街道', '終於我也回到'].join('\n');
const WORDS = ['走過', '熟悉', '街道', '終於', '我也', '回到'];
const BAR = '#rhymeSelBar', AN = '#rhymeAnalysis', AN_BTN = BAR + ' .rm-bar-an';

const mapOf = page => page.evaluate(() => localStorage.getItem('lh:map'));
const ready = page => page.evaluate(() => Promise.all([window.__hoyunReady, window.__hoyunWordlistReady, window.__hoyunSongsReady, window.__lhMapReady]));
// 詞放進詞庫（只為了讓斷句有詞可用），再通知韻腳地圖重畫；重新整理後要重放
const seedWords = page => page.evaluate(ws => {
    for (const w of ws) wordPhoneticMap.set(w, Array.from(w).map(c => getCharAllReadings(c)[0].reading).join(' '));
    lhMapOnLexiconChange();
}, WORDS);
const menuSw = (page, label) => page.locator('#rhymeMenu .rm-switch').filter({ hasText: label });
const prefSw = (page, label) => page.locator('#mapSettingsSection .rm-switch').filter({ hasText: label });
const lookRadio = (page, k, v) => page.locator(`#mapSettingsSection .type-row[data-k="${k}"][data-v="${v}"]`);
const secMarks = (page, n) => page.locator('#lyricsSections .lyrics-section').nth(n).locator('.rhyme-mirror .lm-mk');
// 第 n 段每個標記的 [字數, 結構, 字母, 對照差異]（沒有的欄位是 null）
const markers = (page, n) => secMarks(page, n).evaluateAll(els => els.map(e => ['.lm-t-c', '.lm-t-s', '.lm-t-r', '.lm-t-d'].map(q => e.querySelector(q)?.textContent ?? null)));
const bandBg = page => page.evaluate(() => { const e = document.querySelector('#lyricsSections .rm-hl:not(.rm-solo)'); return e ? getComputedStyle(e).backgroundColor : null; });
const pick = (page, a, b, n) => page.evaluate(([a, b, n]) => {
    const ta = document.querySelectorAll('.section-textarea')[n];
    ta.focus(); ta.setSelectionRange(a, b);
}, [a, b, n]);
const anRows = page => page.locator(AN + ' tbody tr').evaluateAll(trs => trs.map(tr => ({
    ref: tr.classList.contains('rm-an-ref'),
    cells: [...tr.children].map(c => c.textContent),
    verdict: [...tr.querySelectorAll('.rm-an-v')].map(v => v.textContent),
})));
const focusInfo = page => page.evaluate(() => {
    const ta = document.activeElement;
    return { ta: ta.classList.contains('section-textarea'), a: ta.selectionStart, b: ta.selectionEnd };
});

test('整合：句構分析一次走完', async ({ browser }) => {
    test.setTimeout(180_000);
    const { context, page, errors, offOrigin } = await bootPage(browser, {
        wordlist: 'stub', device: DEVICES.desktop,
        storage: v2Storage([song([typed('sa', 'verse', V1), typed('sb', 'chorus', CH), typed('sc', 'verse', V2)])]),
    });
    // 記下所有不是靜態檔案的請求（POST 與其他方法）；分析全部在本機算，這一輪不該有任何一個
    const nonGet = [];
    const urls = [];
    page.on('request', r => { urls.push(new URL(r.url()).pathname); if (r.method() !== 'GET') nonGet.push(r.method() + ' ' + new URL(r.url()).pathname); });
    await waitStill(page);
    await seedWords(page);

    // ===== a. 全新使用者：只有句尾上色 =====
    await expect.poll(() => page.locator('#lyricsSections .rm-hl').count()).toBeGreaterThan(0);
    await expect(page.locator('.lm-mk')).toHaveCount(0);
    await expect(page.locator('.rm-inner')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-lm'))).toBeNull();
    expect(await page.locator('.section-rhyme').evaluateAll(els => els.every(e => e.hidden || getComputedStyle(e).display === 'none')), '標題列沒有字母條').toBe(true);
    expect(await mapOf(page), '只看不寫').toBeNull();
    const f0 = await page.evaluate(() => [...document.querySelectorAll('#lyricsSections .rm-hl')].find(e => e.textContent === '光').dataset.c);   // 畫面實際用的顏色（自動配色後的編號）

    // ===== b. 韻腳 ▾ → 逐行標記：每行有字數，多段的行有結構 =====
    await page.locator('#rhymeMenuBtn').click();
    await menuSw(page, '逐行標記').click();
    await expect(menuSw(page, '逐行標記')).toHaveAttribute('aria-checked', 'true');
    await expect(secMarks(page, 0)).toHaveCount(3);
    await expect(secMarks(page, 1)).toHaveCount(1);
    await expect(secMarks(page, 2)).toHaveCount(4);
    const m1 = await markers(page, 0);
    expect(m1.map(m => m[0]), '第一段字數').toEqual(['7', '5', '7']);
    expect(m1.every(m => m[2] === null && m[3] === null), '預設沒有字母、沒有 ≠').toBe(true);
    expect(m1[2][1], '走過熟悉的街道有斷句結構').toMatch(/^\d+（\d(·\d)+）$/);
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-lm'))).toBe('right');

    // ===== c. 更多設定… → 行尾韻腳字母、對照差異 =====
    await page.locator('#rhymeMenu .rm-more').click();
    await expect(page.locator('#settingsOverlay')).toHaveClass(/show/);
    await expect(page.locator('#mapSettingsSection')).toBeVisible();
    await expect(page.locator('#prefsTab-map')).toBeFocused();
    await prefSw(page, '行尾韻腳字母').click();
    await prefSw(page, '對照差異').click();
    const diff2 = await markers(page, 2);
    expect(diff2.map(m => m[3] ?? ''), 'Verse II 第 2 行比對照段落多一個字').toEqual(['', '≠5', '', '']);
    const wantLetters = await page.evaluate(t => Array.from(lhRhymeAnalyze(t, { strict: false, skipParticles: true }, null).letters), V2);
    expect(diff2.map(m => m[2]), '字母照頁面自己的分析').toEqual(wantLetters);
    // 預覽也畫出字母與 ≠
    await expect.poll(() => page.locator('#mapSettingsSection .lm-preview .lm-t-r').count()).toBeGreaterThan(0);
    expect(await page.locator('#mapSettingsSection .lm-preview .lm-t-d').count(), '預覽有對照差異').toBeGreaterThan(0);

    // ===== d. 顯示方式與韻族顏色，馬上生效 =====
    const bg0 = await bandBg(page);
    await lookRadio(page, 'pos', 'tail').click();
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-lm'))).toBe('tail');
    const fs0 = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#lyricsSections .lm-t')).fontSize));
    await lookRadio(page, 'size', 'l').click();
    const fs1 = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#lyricsSections .lm-t')).fontSize));
    expect(fs1, '大：字級變大').toBeGreaterThan(fs0);
    await lookRadio(page, 'depth', 'heavy').click();
    const bgHeavy = await bandBg(page);
    expect(bgHeavy, '濃：底色變了').not.toBe(bg0);
    await expect(page.locator('#mapSettingsSection .rm-depth-help')).toBeVisible();
    // 光所在的韻族改成 #123456：色塊與預覽都變
    const spanBg = (sel) => page.evaluate(([sel, f]) => { const e = [...document.querySelectorAll(sel + ' .rm-hl')].find(x => (x.dataset.c ?? x.dataset.f) === f); return e ? getComputedStyle(e).backgroundColor : null; }, [sel, f0]);
    const bandBefore = await spanBg('#lyricsSections'), prevBefore = await spanBg('#mapSettingsSection .lm-preview');
    await page.evaluate(f => {
        const i = document.querySelector(`#mapSettingsSection .rm-colors input[data-n="${f}"]`);
        i.value = '#123456';
        i.dispatchEvent(new Event('input', { bubbles: true }));
        i.dispatchEvent(new Event('change', { bubbles: true }));
    }, f0);
    expect(await spanBg('#lyricsSections'), '歌詞的色塊跟著變').not.toBe(bandBefore);
    const prevAfter = await spanBg('#mapSettingsSection .lm-preview');
    if (prevBefore !== null) expect(prevAfter, '預覽跟著變').not.toBe(prevBefore);
    expect(await mapOf(page)).toContain(`"colors":{"${f0}":"#123456"}`);
    await page.keyboard.press('Escape');
    await expect(page.locator('#settingsOverlay')).not.toHaveClass(/show/);

    // ===== e. 選 Verse II 第 2～4 行 → 📏 分析 =====
    await pick(page, 11, 26, 2);
    await expect(page.locator(BAR)).toBeVisible();
    await expect(page.locator(BAR + ' button:visible')).toHaveText(['🔍 查韻：我', '✨ AI 建議', '📏 分析']);
    await page.locator(AN_BTN).click();
    await expect(page.locator(AN)).toBeVisible();
    await expect(page.locator(AN + ' .section-menu-title')).toHaveText('句構：Verse II');
    await expect(page.locator(AN + ' .rm-sum')).toHaveText('選到 3 行，共 19 字');
    const rows = await anRows(page);
    // 行號格下面多了字數
    expect(rows.map(r => r.cells[0].replace(/\d+ 字$/, ''))).toEqual(['第 2 行', '對照 Verse I 第 2 行：5 字　—≠', '第 3 行', '對照 Verse I 第 3 行：7 字　' + rows[3].cells[0].split('　')[1], '第 4 行', '對照段落沒有第 4 行']);
    expect(rows[1].verdict).toEqual(['≠']);
    expect(rows[3].verdict).toEqual(['✓']);
    expect(await focusInfo(page), '分析面板沒搶走輸入框').toEqual({ ta: true, a: 11, b: 26 });
    await page.keyboard.press('Escape');
    await expect(page.locator(AN)).toBeHidden();
    await expect(page.locator(BAR)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator(BAR)).toBeHidden();
    expect((await focusInfo(page)).ta, '選取回到輸入框').toBe(true);

    // ===== f. 反白停留自動分析：打開開關、用滑鼠停著 1.7 秒 =====
    await page.evaluate(() => lhMapOpenPrefs());
    await prefSw(page, '反白停留自動分析').click();
    await expect(prefSw(page, '反白停留自動分析')).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');
    await expect(page.locator('#settingsOverlay')).not.toHaveClass(/show/);
    // 步驟 e 選到第 4 行時輸入框可能往下捲了：先捲回最上面，第一行才看得到（看不到的字滑鼠也停不到）
    await page.evaluate(() => { const ta = document.querySelectorAll('.section-textarea')[2]; ta.focus(); ta.scrollTop = 0; });
    const pt = await page.evaluate(() => {
        const ta = document.querySelectorAll('.section-textarea')[2], m = lhMirror(ta);
        try { const p = lhCaretRect(ta, m, 1); return { x: p.left + 4, y: p.top + p.height / 2 }; } finally { m.remove(); }
    });
    await page.mouse.move(pt.x, pt.y);
    await page.evaluate(() => {
        const ta = document.querySelectorAll('.section-textarea')[2];
        ta.focus(); ta.setSelectionRange(0, 7);
        ta.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    await expect(page.locator(BAR)).toBeVisible();
    await expect(page.locator(AN)).toBeHidden();
    await page.waitForTimeout(1700);
    await expect(page.locator(AN), '停 1.5 秒之後自動打開').toBeVisible();
    expect(await focusInfo(page), '自動打開也不搶焦點').toEqual({ ta: true, a: 0, b: 7 });
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(page.locator(BAR)).toBeHidden();

    // ===== g. 注音組字：句尾打一個字，組字中鏡像零變動，確認後才長出標記 =====
    await page.evaluate(() => { const ta = document.querySelector('.section-textarea'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); });
    await page.waitForTimeout(300);
    const countBefore = (await markers(page, 0))[2][0];
    expect(countBefore).toBe('7');
    await page.evaluate(() => {
        window.__mut = 0;
        window.__mo = new MutationObserver(rs => { window.__mut += rs.filter(r => r.type === 'childList').length; });
        document.querySelectorAll('.rhyme-mirror').forEach(m => window.__mo.observe(m, { childList: true, subtree: true }));
    });
    let during = null;
    await compose(page, ['ㄌ', 'ㄌㄧ', 'ㄌㄧㄤˋ'], '亮', async () => {
        during = await page.evaluate(() => window.__mut + window.__mo.takeRecords().length);
    });
    expect(during, '組字中鏡像層零個節點變動').toBe(0);
    await expect.poll(async () => (await markers(page, 0))[2][0], { timeout: 2500 }).toBe('8');
    await page.evaluate(() => window.__mo.disconnect());
    // Verse II 第 3 行（走過熟悉的街道）原本跟 Verse I 一樣，現在差 1 個字
    await expect.poll(async () => (await markers(page, 2)).map(m => m[3] ?? ''), { timeout: 2500 }).toEqual(['', '≠5', '≠8', '']);
    await expect.poll(async () => (await activeSongRaw(page)).sections[0].text).toBe(V1 + '亮');

    // ===== h. 重新整理：設定、顏色、標記位置全部還在，lh:map 前五個鍵照舊 =====
    await page.evaluate(() => flushSongs());
    const mapBefore = await mapOf(page);
    const keys = Object.keys(JSON.parse(mapBefore));
    expect(keys.slice(0, 5), 'Phase 10 的五個鍵在最前面').toEqual(['end', 'letters', 'inner', 'strict', 'skipParticles']);
    expect(keys.slice(5).sort(), '後面只有改過的鍵').toEqual(['autoHover', 'colors', 'depth', 'line', 'lnDiff', 'lnRhyme', 'pos', 'size']);
    const marksBefore = [await markers(page, 0), await markers(page, 1), await markers(page, 2)];
    await page.reload();
    await ready(page);
    await waitStill(page);
    await seedWords(page);
    expect(await mapOf(page)).toBe(mapBefore);
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-lm'))).toBe('tail');
    await expect.poll(async () => JSON.stringify([await markers(page, 0), await markers(page, 1), await markers(page, 2)])).toBe(JSON.stringify(marksBefore));
    expect(await page.evaluate(f => document.documentElement.style.getPropertyValue('--rm-c' + f), f0)).toBe('#123456');
    await page.evaluate(() => lhMapOpenPrefs());
    for (const [label, on] of [['逐行標記', 'true'], ['行尾韻腳字母', 'true'], ['對照差異', 'true'], ['反白停留自動分析', 'true'], ['字數', 'true']]) {
        await expect(prefSw(page, label), label).toHaveAttribute('aria-checked', on);
    }
    await expect(lookRadio(page, 'pos', 'tail')).toHaveAttribute('aria-checked', 'true');
    await expect(lookRadio(page, 'size', 'l')).toHaveAttribute('aria-checked', 'true');
    await expect(lookRadio(page, 'depth', 'heavy')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator(`#mapSettingsSection .rm-colors input[data-n="${f0}"]`)).toHaveValue('#123456');
    await page.keyboard.press('Escape');

    // ===== i. 全程沒有網路請求（分析都在本機）、沒有錯誤 =====
    expect(nonGet, '沒有任何 POST 之類的請求').toEqual([]);
    expect(offOrigin, '沒有站外請求').toEqual([]);
    expect([...new Set(urls)].filter(u => !/\.(js|css|json|html|png|svg|ico|woff2?|webmanifest|ndjson)$|^\/(css2|models)?$/.test(u)), '只有靜態檔案與 App 開機就有的 /css2（字型）、/models（模型清單），沒有新端點').toEqual([]);
    expect(errors).toEqual([]);
    await context.close();
});
