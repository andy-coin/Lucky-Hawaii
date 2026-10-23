// 詞卡／字卡拖進歌詞（第 9 階段 09-09，AI-06）：滑鼠、長按、取消、手機分頁、折疊段落、游標索引
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage, activeSongRaw, settle, compose } from './helpers.mjs';
import { DEVICES } from './layout-lib.mjs';
import { centerOf, mouseDrag, touchSession, caretOracle } from './drag-lib.mjs';

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/v096-localStorage.json', import.meta.url), 'utf8'));
const v2Storage = (songs, extra = {}) => ({ ...FIXTURE, 'lh:schema': '2', 'lh:songs': JSON.stringify(songs), 'lh:activeSong': songs[0].id, leftPanelCollapsed: 'false', rightPanelCollapsed: 'false', ...extra });
const typed = (id, type, text, extra = {}) => ({ id, type, custom: '', color: '', height: null, label: '', text, collapsed: false, ...extra });
const song = (sections, extra = {}) => ({ id: 's1', title: '測試歌', sections, hashtags: [], context: '', createdAt: 1, updatedAt: 1, ...extra });
const ONE = (text = '春天來了', extra = {}) => v2Storage([song([typed('sa', 'verse', text)])], extra);
const ta = (page, n = 0) => page.locator('#lyricsSections .section-textarea').nth(n);
// 直接把詞卡塞進 AI 面板（layout.spec 的做法）
const putCards = (page, words) => page.evaluate(ws => { document.getElementById('aiWordsContainer').innerHTML = ws.map(w => aiWordCardHtml(w, false)).join(''); }, words);
const card = (page, n = 0) => page.locator('#aiWordsContainer .ai-word-card').nth(n);
// 殘影、插入線、提示、外框、來源 class 都清乾淨
const noTrace = page => page.evaluate(() => ({
    ghost: document.querySelectorAll('.word-drag-ghost').length,
    caret: document.querySelectorAll('.drop-caret').length,
    hint: document.querySelectorAll('.drag-hint').length,
    target: document.querySelectorAll('.drop-target').length,
    source: document.querySelectorAll('.word-drag-source').length,
    dwell: document.querySelectorAll('.lyrics-section.dwell').length,
}));
const CLEAN = { ghost: 0, caret: 0, hint: 0, target: 0, source: 0, dwell: 0 };

// 找一個點，真的點下去 selectionStart 等於 idx（取符合範圍的中間）；掃第一行
async function pointForIndex(page, textarea, idx) {
    const b = await textarea.boundingBox();
    const y = b.y + 22;
    const hits = [];
    for (let x = b.x + 8; x < b.x + b.width - 8; x += 2) {
        if (await caretOracle(page, textarea, x, y) === idx) hits.push(x);
        else if (hits.length) break;
    }
    expect(hits.length, '要掃得到索引 ' + idx).toBeGreaterThan(0);
    await textarea.evaluate(el => el.blur());
    return [hits[Math.floor(hits.length / 2)], y];
}

test('拖詞：滑鼠拖進指定位置', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: ONE() });
    await putCards(page, ['花開']);
    const to = await pointForIndex(page, ta(page), 2);
    await mouseDrag(page, await centerOf(card(page)), to);
    await expect(ta(page)).toHaveValue('春天花開來了');
    expect((await activeSongRaw(page)).sections[0].text).toBe('春天花開來了');   // 不 flush：插入本身要存檔
    expect(await page.evaluate(() => [document.activeElement.className, document.activeElement.selectionStart, document.activeElement.selectionEnd])).toEqual(['section-textarea', 4, 4]);
    await expect(page.locator('#lhLive')).toHaveText('已插入「花開」到Verse');
    expect(await noTrace(page)).toEqual(CLEAN);
    await page.locator('#undoBtn').click();
    await expect(ta(page)).toHaveValue('春天來了');
    expect(errors).toEqual([]);
    await context.close();
});

test('拖詞：點擊不插入', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: ONE() });
    await putCards(page, ['花開']);
    await card(page).click();
    await expect.poll(() => page.evaluate(() => JSON.stringify(savedWords))).toContain('花開');
    await expect(ta(page)).toHaveValue('春天來了');
    expect(await activeSongRaw(page).then(s => s.sections[0].text)).toBe('春天來了');
    expect(errors).toEqual([]);
    await context.close();
});

// ===== 第二批：觸控、取消、字卡、排除、打斷 =====
const undoDisabled = page => page.locator('#undoBtn').getAttribute('aria-disabled');
// AI 面板往上第一個真的會捲的祖先（含 #aiWordsContainer 自己）
const aiScroller = page => page.evaluate(() => {
    for (let el = document.getElementById('aiWordsContainer'); el && el !== document.body; el = el.parentElement) {
        const oy = getComputedStyle(el).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) { el.dataset.wdScroller = '1'; return true; }
    }
    return false;
});
const aiScrollTop = page => page.evaluate(() => { const el = document.querySelector('[data-wd-scroller]'); return el ? el.scrollTop : -1; });
const MANY_WORDS = Array.from({ length: 80 }, (_, i) => '詞' + String.fromCharCode(0x4e00 + i * 7));
const TABLET_LS = { ...DEVICES.tabletLandscape };

test('拖詞：手指長按後拖', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: TABLET_LS, storage: ONE() });
    await putCards(page, MANY_WORDS);
    expect(await aiScroller(page), 'AI 詞卡區要能捲動').toBe(true);
    const to = await pointForIndex(page, ta(page), 2);
    const before = await aiScrollTop(page);
    const touch = await touchSession(page);
    await touch.longPressDrag(await centerOf(card(page)), to, 450);
    await expect(ta(page)).toHaveValue('春天' + MANY_WORDS[0] + '來了');
    expect(await aiScrollTop(page), '拖的時候詞卡區不能被捲動').toBe(before);
    expect(await page.evaluate(() => document.activeElement === document.body || !document.activeElement.classList.contains('section-textarea'))).toBe(true);   // 觸控不聚焦
    expect(await noTrace(page)).toEqual(CLEAN);
    expect(errors).toEqual([]);
    await context.close();
});

test('拖詞：先滑動就是捲動', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: TABLET_LS, storage: ONE() });
    await putCards(page, MANY_WORDS);
    expect(await aiScroller(page)).toBe(true);
    const [x, y] = await centerOf(card(page, 4));
    const touch = await touchSession(page);
    await touch.down(x, y);
    for (let i = 1; i <= 6; i++) { await touch.move(x, y - 8 * i); await page.waitForTimeout(20); }   // 48px 內滑完，遠超過 10px
    await page.waitForTimeout(550);
    expect(await noTrace(page)).toEqual(CLEAN);   // 沒有殘影
    await touch.up();
    expect(await aiScrollTop(page), '列表被捲動了').toBeGreaterThan(0);
    await expect(ta(page)).toHaveValue('春天來了');
    expect(await undoDisabled(page)).toBe('true');
    expect(errors).toEqual([]);
    await context.close();
});

test('拖詞：長按不跳回報選單', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: TABLET_LS, storage: ONE() });
    await putCards(page, ['花開']);
    const fire = () => page.evaluate(() => {
        const c = document.querySelector('#aiWordsContainer .ai-word-card');
        const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 60, clientY: 60 });
        c.dispatchEvent(ev);
        return ev.defaultPrevented;
    });
    const menuShown = () => page.locator('#wordCtxMenu').evaluate(el => el.classList.contains('show'));
    const to = await pointForIndex(page, ta(page), 2);
    const touch = await touchSession(page);
    const [cx, cy] = await centerOf(card(page));
    await touch.down(cx, cy);
    await page.waitForTimeout(450);
    expect(await fire(), '長按進行中 contextmenu 被取消').toBe(true);
    await touch.move(...to);
    expect(await fire()).toBe(true);
    await touch.up();
    expect(await fire(), '放開後 600ms 內仍被取消').toBe(true);
    expect(await menuShown()).toBe(false);
    await page.waitForTimeout(700);
    await page.mouse.click(cx, cy, { button: 'right' });   // 滑鼠右鍵照舊開 Phase 7 的選單
    expect(await menuShown()).toBe(true);
    expect(errors).toEqual([]);
    await context.close();
});

test('拖詞：字卡也能拖', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: ONE(), wordlist: 'stub' });
    await page.fill('#searchInput', '心');
    await settle(page);
    const cc = page.locator('#resultsContainer .char-card').first();
    await cc.waitFor();
    const ch = await cc.getAttribute('data-char');
    const to = await pointForIndex(page, ta(page), 2);
    await mouseDrag(page, await centerOf(cc), to);
    await expect(ta(page)).toHaveValue('春天' + ch + '來了');
    expect(await page.locator('#resultsContainer .char-card.selected').count(), '拖完不算點選').toBe(0);
    await cc.click();   // 單純點還是選取
    await expect(cc).toHaveClass(/selected/);
    await expect(ta(page)).toHaveValue('春天' + ch + '來了');
    expect(errors).toEqual([]);
    await context.close();
});

test('拖詞：不從徽章或回報模式開始', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: ONE(), wordlist: 'stub' });
    await page.fill('#searchInput', '心');
    await settle(page);
    const to = await pointForIndex(page, ta(page), 2);
    const badge = page.locator('#resultsContainer .char-card .mark-badge').first();
    await badge.waitFor();
    await mouseDrag(page, await centerOf(badge), to);
    await expect(ta(page)).toHaveValue('春天來了');
    expect(await noTrace(page)).toEqual(CLEAN);
    // 回報模式：點詞是選取，不拖
    await putCards(page, ['花開']);
    await page.evaluate(() => document.getElementById('aiWordsContainer').classList.add('report-mode'));
    await mouseDrag(page, await centerOf(card(page)), to);
    await expect(ta(page)).toHaveValue('春天來了');
    await expect(card(page)).not.toHaveClass(/report-picked/);
    await card(page).click();
    await expect(card(page)).toHaveClass(/report-picked/);   // Phase 7 的選取照常
    expect(await noTrace(page)).toEqual(CLEAN);
    expect(errors).toEqual([]);
    await context.close();
});

test('拖詞：放在歌詞外就取消', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: ONE() });
    await putCards(page, ['花開']);
    const from = await centerOf(card(page));
    const spots = [
        await centerOf(page.locator('#lyricsSections .section-chevron')),
        await centerOf(page.locator('.lyrics-head')),
        [720, 880],
    ];
    for (const spot of spots) {
        await mouseDrag(page, from, spot);
        await expect(ta(page)).toHaveValue('春天來了');
        expect(await noTrace(page)).toEqual(CLEAN);
        expect(await undoDisabled(page)).toBe('true');
    }
    expect((await activeSongRaw(page)).sections[0].text).toBe('春天來了');
    await expect(card(page)).toBeVisible();   // 原卡還在，也沒被存進保留池
    expect(await page.evaluate(() => JSON.stringify(savedWords))).not.toContain('花開');
    expect(errors).toEqual([]);
    await context.close();
});

test('拖詞：Esc 取消', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: ONE() });
    await putCards(page, ['花開']);
    const to = await pointForIndex(page, ta(page), 2);
    await page.mouse.move(...await centerOf(card(page)));
    await page.mouse.down();
    await page.mouse.move(...to, { steps: 6 });
    await expect(page.locator('.word-drag-ghost')).toHaveCount(1);
    await expect(page.locator('.drop-caret')).toHaveCount(1);
    await page.keyboard.press('Escape');
    expect(await noTrace(page)).toEqual(CLEAN);
    await page.mouse.up();   // 放開在輸入框上也不插入
    await expect(ta(page)).toHaveValue('春天來了');
    expect(await undoDisabled(page)).toBe('true');
    expect(await page.evaluate(() => JSON.stringify(savedWords))).not.toContain('花開');   // 放開後的 click 被吞掉
    expect(errors).toEqual([]);
    await context.close();
});

test('拖詞：同一個詞拖兩次', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: ONE() });
    await putCards(page, ['花開']);
    const to = await pointForIndex(page, ta(page), 2);
    await mouseDrag(page, await centerOf(card(page)), to);
    await expect(ta(page)).toHaveValue('春天花開來了');
    const to2 = await pointForIndex(page, ta(page), 2);
    await mouseDrag(page, await centerOf(card(page)), to2);
    await expect(ta(page)).toHaveValue('春天花開花開來了');
    await page.locator('#undoBtn').click();
    await expect(ta(page)).toHaveValue('春天花開來了');
    await page.locator('#undoBtn').click();
    await expect(ta(page)).toHaveValue('春天來了');
    expect(await undoDisabled(page)).toBe('true');
    expect(errors).toEqual([]);
    await context.close();
});

test('拖詞：組字中放開不插入', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: v2Storage([song([typed('sa', 'verse', '春天來了'), typed('sb', 'chorus', '')])]) });
    await putCards(page, ['花開']);
    const to = await pointForIndex(page, ta(page, 0), 2);
    await page.mouse.move(...await centerOf(card(page)));
    await page.mouse.down();
    await page.mouse.move(to[0], to[1] - 40, { steps: 5 });   // 拖起來之後才在另一段開始組字
    await ta(page, 1).focus();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.imeSetComposition', { text: 'ㄏㄨ', selectionStart: 2, selectionEnd: 2 });
    expect(await page.evaluate(() => _lhComposing)).toBe(true);
    await page.mouse.move(...to, { steps: 5 });
    await page.mouse.up();
    await expect(ta(page, 0)).toHaveValue('春天來了');
    expect(await noTrace(page)).toEqual(CLEAN);
    await cdp.detach();
    expect(errors).toEqual([]);
    await context.close();
});

test('拖詞：中斷就收', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: ONE() });
    await putCards(page, ['花開']);
    const to = await pointForIndex(page, ta(page), 2);
    await page.mouse.move(...await centerOf(card(page)));
    await page.mouse.down();
    await page.mouse.move(...to, { steps: 6 });
    await expect(page.locator('.word-drag-ghost')).toHaveCount(1);
    await page.evaluate(() => renderLyricsSections());
    expect(await noTrace(page)).toEqual(CLEAN);
    await page.mouse.up();
    await expect(ta(page)).toHaveValue('春天來了');
    expect(await undoDisabled(page)).toBe('true');
    expect(errors).toEqual([]);
    await context.close();
});

test('拖詞：歌詞面板收著', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: ONE('春天來了', { leftPanelCollapsed: 'true' }) });
    await putCards(page, ['花開']);
    const from = await centerOf(card(page));
    await page.mouse.move(...from);
    await page.mouse.down();
    await page.mouse.move(from[0] - 200, from[1] + 100, { steps: 6 });
    expect(await noTrace(page)).toEqual(CLEAN);
    await expect(page.locator('#copyToast')).toHaveText('先打開歌詞面板，再把詞拖進去');
    await page.mouse.up();
    expect(await page.evaluate(() => JSON.stringify(savedWords))).not.toContain('花開');
    expect(errors).toEqual([]);
    await context.close();
});

test('拖詞：特殊字元原樣插入', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: ONE() });
    const W = `<b>&"'`;
    await putCards(page, [W]);
    const to = await pointForIndex(page, ta(page), 2);
    await page.mouse.move(...await centerOf(card(page)));
    await page.mouse.down();
    await page.mouse.move(...to, { steps: 6 });
    await expect(page.locator('.word-drag-ghost')).toHaveText(W);
    expect(await page.locator('.word-drag-ghost *').count()).toBe(0);
    await page.mouse.up();
    await expect(ta(page)).toHaveValue('春天' + W + '來了');
    await expect(page.locator('#lhLive')).toHaveText('已插入「' + W + '」到Verse');
    expect(await page.locator('#lyricsSections b, #lhLive b, .word-drag-ghost').count()).toBe(0);
    expect(errors).toEqual([]);
    await context.close();
});
