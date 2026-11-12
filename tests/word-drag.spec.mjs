// 詞卡／字卡拖進歌詞（第 9 階段 09-09，AI-06）：滑鼠、長按、取消、手機分頁、折疊段落、游標索引
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage, activeSongRaw, settle, compose } from './helpers.mjs';
import { DEVICES, waitStill } from './layout-lib.mjs';
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

// ===== 第三批：手機分頁、折疊段落展開、游標索引、超長段落、自動捲 =====
const panelState = page => page.evaluate(() => ({
    left: document.getElementById('leftPanel').classList.contains('collapsed'),
    right: document.getElementById('rightPanel').classList.contains('collapsed'),
}));
const settled = page => page.waitForFunction(() => document.getAnimations().every(a => a.playState !== 'running'));
// 手機：先開 AI 分頁，長按詞卡再往上移一點，讓拖曳開始
async function phoneHold(page, touch, n = 0) {
    await page.evaluate(() => { if (document.getElementById('rightPanel').classList.contains('collapsed')) mobileTab('ai'); });
    await waitStill(page);
    const [x, y] = await centerOf(card(page, n));
    await touch.down(x, y);
    await page.waitForTimeout(450);
    await touch.move(x, y - 20);
    return [x, y];
}

test('拖詞：手機自動切到歌詞', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.phone, storage: ONE('', { leftPanelCollapsed: 'true', rightPanelCollapsed: 'true' }) });
    await putCards(page, ['花開', '月光']);
    const touch = await touchSession(page);
    const [x, y] = await phoneHold(page, touch);
    await expect.poll(async () => (await panelState(page)).left, { message: '手指還按著，歌詞已經打開' }).toBe(false);
    expect((await panelState(page)).right).toBe(true);
    await settled(page);
    const to = await centerOf(ta(page));
    await touch.move(...to);
    await touch.up();
    await expect(ta(page)).toHaveValue('花開');
    expect(await panelState(page)).toEqual({ left: false, right: true });   // 成功就留在歌詞
    expect(await noTrace(page)).toEqual(CLEAN);
    // 再來一次，這次放在歌詞外面 → 回到 AI 分頁
    await page.evaluate(() => mobileTab('ai'));
    await waitStill(page);
    await phoneHold(page, touch, 1);
    await expect.poll(async () => (await panelState(page)).left).toBe(false);
    await settled(page);
    const head = await centerOf(page.locator('.lyrics-head'));
    await touch.move(...head);
    await touch.up();
    await expect(ta(page)).toHaveValue('花開');
    expect(await panelState(page)).toEqual({ left: true, right: false });
    expect(await noTrace(page)).toEqual(CLEAN);
    expect(errors).toEqual([]);
    await context.close();
});

test('拖詞：手機中斷會回到原分頁', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.phone, storage: ONE('', { leftPanelCollapsed: 'true', rightPanelCollapsed: 'true' }) });
    await putCards(page, ['花開']);
    const touch = await touchSession(page);
    await phoneHold(page, touch);
    await expect.poll(async () => (await panelState(page)).left).toBe(false);
    await page.evaluate(() => renderLyricsSections());   // 被打斷
    await touch.up();
    await expect.poll(() => panelState(page)).toEqual({ left: true, right: false });
    expect(await noTrace(page)).toEqual(CLEAN);
    await expect(ta(page)).toHaveValue('');
    expect(errors).toEqual([]);
    await context.close();
});

test('拖詞：大螢幕不切分頁', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: ONE() });
    await putCards(page, ['花開']);
    const before = await panelState(page);
    expect(before).toEqual({ left: false, right: false });
    const to = await pointForIndex(page, ta(page), 2);
    await page.mouse.move(...await centerOf(card(page)));
    await page.mouse.down();
    await page.mouse.move(...to, { steps: 6 });
    expect(await panelState(page)).toEqual(before);
    await page.mouse.up();
    expect(await panelState(page)).toEqual(before);
    await expect(ta(page)).toHaveValue('春天花開來了');
    // 取消也不動
    await mouseDrag(page, await centerOf(card(page)), [720, 880]);
    expect(await panelState(page)).toEqual(before);
    expect(errors).toEqual([]);
    await context.close();
});

test('拖詞：停在收合段落會展開', async ({ browser }) => {
    const store = () => v2Storage([song([typed('sa', 'verse', '春天來了'), typed('sb', 'chorus', '夏天', { collapsed: true })])]);
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: store(), beforeGoto: ({ page }) => page.clock.install() });
    await putCards(page, ['花開']);
    const sec = n => page.locator('#lyricsSections .lyrics-section').nth(n);
    const hdr = await centerOf(sec(1).locator('.lyrics-section-header'));
    await page.mouse.move(...await centerOf(card(page)));
    await page.mouse.down();
    await page.mouse.move(hdr[0] + 40, hdr[1], { steps: 6 });
    await page.clock.runFor(100);
    await expect(sec(1)).toHaveClass(/dwell/);
    await expect(sec(1)).toHaveClass(/collapsed/);
    await page.clock.runFor(600);
    await expect(sec(1)).not.toHaveClass(/collapsed/);
    // 放到歌詞外面：自己展開的要收回去
    await page.mouse.move(720, 880, { steps: 4 });
    await page.mouse.up();
    await expect(sec(1)).toHaveClass(/collapsed/);
    expect((await activeSongRaw(page)).sections[1].collapsed).toBe(true);
    expect(await noTrace(page)).toEqual(CLEAN);
    // 再來一次，這次把詞放進展開的那段：留在展開
    await page.waitForTimeout(400);   // 收合的版面動畫跑完再量（假時鐘下不能用 waitStill）
    const hdr2 = await centerOf(sec(1).locator('.lyrics-section-header'));
    await page.mouse.move(...await centerOf(card(page)));
    await page.mouse.down();
    await page.mouse.move(hdr2[0] + 40, hdr2[1], { steps: 6 });
    await page.clock.runFor(700);
    await expect(sec(1)).not.toHaveClass(/collapsed/);
    await page.waitForTimeout(400);
    await page.mouse.move(...await centerOf(ta(page, 1)), { steps: 4 });
    await page.mouse.up();
    await expect(ta(page, 1)).toHaveValue(/花開/);
    await expect(sec(1)).not.toHaveClass(/collapsed/);
    expect((await activeSongRaw(page)).sections[1].collapsed).toBe(false);
    expect(errors).toEqual([]);
    await context.close();
});

// 在一個 textarea 上取一格點，比對 lhCaretIndexAt 與真的點下去的 selectionStart
async function gridCompare(page, textarea, label) {
    const info = await textarea.evaluate(el => {
        const cs = getComputedStyle(el), b = el.getBoundingClientRect();
        return { left: b.left, top: b.top, width: b.width, height: b.height, pt: parseFloat(cs.paddingTop), pl: parseFloat(cs.paddingLeft), lh: parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5, clientW: el.clientWidth };
    });
    const bad = [];
    let n = 0;
    for (let y = info.top + info.pt + info.lh * 0.5; y < info.top + info.height - 24; y += info.lh) {
        for (const fx of [0.03, 0.2, 0.37, 0.55, 0.71, 0.9]) {
            const x = info.left + info.pl + (info.clientW - info.pl * 2) * fx + 2;
            const want = await caretOracle(page, textarea, x, y);
            const got = await textarea.evaluate((el, [px, py]) => lhCaretIndexAt(el, px, py), [x, y]);
            n++;
            if (want !== got) bad.push({ x: Math.round(x), y: Math.round(y), want, got });
        }
    }
    expect(n, label + ' 取樣點數').toBeGreaterThan(12);
    expect(bad, label + ' 與真實點擊不一致').toEqual([]);
}

test('拖詞：游標索引對得上', async ({ browser }) => {
    const text = '春天來了 hello world\n\n花開滿山 Lucky Hawaii 好韻器\n歌詞 lyrics 一二三四五六七八九十 and more words to wrap around the line\n\n結尾';
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: ONE(text) });
    const t = ta(page);
    await t.evaluate(el => { el.style.width = '220px'; el.style.height = '260px'; });
    await gridCompare(page, t, '未捲動');
    // 捲動中的 textarea
    const long = Array.from({ length: 40 }, (_, i) => '第' + i + '行 line ' + i + ' 歌詞').join('\n');
    await t.evaluate((el, v) => { el.value = v; el.scrollTop = 150; }, long);
    expect(await t.evaluate(el => el.scrollTop)).toBeGreaterThan(100);
    await gridCompare(page, t, '捲動後');
    expect(errors).toEqual([]);
    await context.close();
});

test('拖詞：長句換行游標', async ({ browser }) => {
    const line = Array.from({ length: 20 }, (_, i) => '春天' + i + 'abc來了').join('');   // 約 200 字、沒有換行字元
    expect(line.length).toBeGreaterThan(150);
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: ONE(line) });
    const t = ta(page);
    await t.evaluate(() => {   // 段落會自動長高（lhSecFit 寫行內高度），所以用 !important 樣式固定尺寸
        const st = document.createElement('style');
        st.textContent = '.section-textarea { width: 150px !important; height: 420px !important; overflow-y: auto !important; }';
        document.head.appendChild(st);
    });
    expect(await t.evaluate(el => el.scrollHeight)).toBeGreaterThan(200);
    await gridCompare(page, t, '長句換行');
    expect(errors).toEqual([]);
    await context.close();
});

test('拖詞：超長段落', async ({ browser }) => {
    const big = '春天來了'.repeat(62500);   // 250,000 字
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: ONE(big) });
    await putCards(page, ['花開']);
    const t = ta(page);
    const b = await t.boundingBox();
    const pt = [b.x + 60, b.y + 30];
    const want = await caretOracle(page, t, ...pt);
    await t.evaluate(el => el.blur());
    await page.mouse.move(...await centerOf(card(page)));
    await page.mouse.down();
    await page.mouse.move(...pt, { steps: 6 });
    await expect(page.locator('.word-drag-ghost')).toHaveCount(1);
    expect(await page.locator('.drop-caret').count(), '超長段落不即時畫游標').toBe(0);
    await page.mouse.up();
    await expect.poll(() => t.evaluate(el => el.value.length)).toBe(250002);
    expect(await t.evaluate((el, i) => el.value.slice(i, i + 2), want)).toBe('花開');
    expect(errors).toEqual([]);
    await context.close();
});

test('拖詞：不切開罕用字', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: ONE('甲𠀀乙') });
    await putCards(page, ['花開']);
    const t = ta(page);
    // 掃第一行，找出落在 𠀀 中間的像素（其中每個點都不可切開代理對）
    const b = await t.boundingBox();
    const idx = new Set();
    for (let x = b.x + 6; x < b.x + 80; x += 2) idx.add(await t.evaluate((el, [px, py]) => lhCaretIndexAt(el, px, py), [x, b.y + 22]));
    expect([...idx].sort()).not.toContain(2);   // 索引 2 在 𠀀 的兩半中間
    expect([...idx].sort()).toEqual([0, 1, 3, 4]);
    // 實際拖到 𠀀 的正中間
    const glyph = await t.evaluate(el => {
        const m = lhMirror(el), r = document.createRange();
        r.setStart(m.firstChild, 1); r.setEnd(m.firstChild, 3);
        const g = r.getBoundingClientRect(), mr = m.getBoundingClientRect(), tb = el.getBoundingClientRect();
        m.remove();
        return [tb.left + (g.left - mr.left) + g.width / 2, tb.top + (g.top - mr.top) + g.height / 2];
    });
    await mouseDrag(page, await centerOf(card(page)), glyph);
    const v = await t.inputValue();
    expect(['甲花開𠀀乙', '甲𠀀花開乙']).toContain(v);
    expect(errors).toEqual([]);
    await context.close();
});

test('拖詞：靠邊自動捲', async ({ browser }) => {
    const many = v2Storage([song(Array.from({ length: 12 }, (_, i) => typed('s' + i, i % 3 === 1 ? 'chorus' : 'verse', '第' + i + '段')))], { leftPanelCollapsed: 'true', rightPanelCollapsed: 'true' });
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.phone, storage: many });
    await putCards(page, ['花開']);
    const touch = await touchSession(page);
    await phoneHold(page, touch);
    await expect.poll(async () => (await panelState(page)).left).toBe(false);
    await settled(page);
    const r = await page.evaluate(() => { const a = document.getElementById('lyricsSections'); for (let el = a; el && el !== document.body; el = el.parentElement) { const oy = getComputedStyle(el).overflowY; if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) { el.dataset.wdScroller = '1'; const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, bottom: b.bottom, top: b.top }; } } return null; });
    expect(r).not.toBeNull();
    const top0 = await aiScrollTop(page);
    await touch.move(r.x, r.bottom - 12);
    await page.waitForTimeout(700);
    expect(await aiScrollTop(page), '靠下緣列表往下捲').toBeGreaterThan(top0);
    await touch.up();
    expect(await noTrace(page)).toEqual(CLEAN);
    expect(errors).toEqual([]);
    await context.close();
});

test('拖詞：讀屏提示', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: ONE() });
    const long = '一二三四五六七八九十甲乙丙丁戊己庚辛壬';   // 19 字
    await putCards(page, [long]);
    const to = await pointForIndex(page, ta(page), 2);
    await mouseDrag(page, await centerOf(card(page)), to);
    await expect(page.locator('#lhLive')).toHaveText('已插入「一二三四五六七八九十甲乙丙丁戊己…」到Verse');
    expect(errors).toEqual([]);
    await context.close();
});
