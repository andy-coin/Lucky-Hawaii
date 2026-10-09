// FB-01 回報入口（Phase 7，07-04）：工具列的 🚩 回報鈕與回報視窗
// 所有標題都以「回報入口：」開頭；/feedback 的請求內容由 page.route 攔下來比對
import { test, expect } from '@playwright/test';
import { bootPage, settle } from './helpers.mjs';
import { DEVICES } from './layout-lib.mjs';

const WORKER_HOST = 'lucky-hawaii.is3000dollar.workers.dev';

// 攔下 /feedback：bodies 收請求內容；respond(第幾筆, body) 回 { status }，不給就一律 200
const capture = (bodies, respond = () => ({ status: 200 })) => async ({ page }) => {
    await page.route(u => u.hostname === WORKER_HOST && u.pathname === '/feedback', route => {
        const body = JSON.parse(route.request().postData());
        bodies.push(body);
        const { status } = respond(bodies.length, body);
        return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ ok: status < 400 }) });
    });
};

const toast = page => page.locator('#copyToast').textContent();

// 搜尋後選第 n 張字卡（0 起算）
async function search(page, term = 'ㄔㄤ') {
    await page.fill('#searchInput', term);
    await page.keyboard.press('Enter');
    await expect(page.locator('.results-count')).toContainText('找到');
    await settle(page);
}
async function pick(page, ...idx) {
    for (const i of idx) await page.locator('.char-card .char-main').nth(i).click();
}

test('回報入口：工具列', async ({ browser }) => {
    const bodies = [];
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', beforeGoto: capture(bodies) });
    for (const sel of ['#batchPanel .btn-report', '#m-batchPanel .btn-report']) {
        const b = page.locator(sel);
        await expect(b).toHaveCount(1);
        await expect(b).toHaveAttribute('aria-label', '回報選取的字或詞');
        await expect(b).toHaveAttribute('title', '回報選取的字或詞');
        await expect(b).toHaveAttribute('aria-disabled', 'true');
    }
    await search(page);
    // 0 張：只跳提示，沒有視窗、沒有請求（aria-disabled 鈕 Playwright 會當成不可按，所以用 force；真人是點得到的）
    await page.locator('#batchPanel .btn-report').click({ force: true });
    expect(await toast(page)).toBe('先點一下要回報的字，再按回報');
    await expect(page.locator('#reportModalOverlay')).not.toHaveClass(/show/);
    expect(bodies).toEqual([]);
    // 選 1 張：按鈕恢復、視窗只列這一個
    await pick(page, 0);
    await expect(page.locator('#batchPanel .btn-report')).toHaveAttribute('aria-disabled', 'false');
    await page.locator('#batchPanel .btn-report').click();
    await expect(page.locator('#reportModalOverlay')).toHaveClass(/show/);
    await expect(page.locator('#reportWords .report-chip')).toHaveCount(1);
    expect(errors.filter(e => !e.includes('Failed to load resource'))).toEqual([]);
    await context.close();
});

test('回報入口：步驟數', async ({ browser }) => {
    const bodies = [];
    const { context, page } = await bootPage(browser, { wordlist: 'stub', beforeGoto: capture(bodies) });
    await search(page);
    await pick(page, 0);                                          // 1 點字卡
    const card = await page.locator('.char-card.selected').first().evaluate(c => ({ char: c.dataset.char, key: c.dataset.key }));
    await page.locator('#batchPanel .btn-report').click();       // 2 按回報
    await page.locator('.report-reason[data-reason="太冷僻"]').click();   // 3 選原因
    await page.locator('#reportSendBtn').click();                // 4 送出
    await expect(page.locator('#reportModalOverlay')).not.toHaveClass(/show/);
    expect(bodies).toHaveLength(1);
    const tone = parseInt(card.key.slice(-1), 10);
    expect(bodies[0]).toEqual({
        type: 'char-reading-report', char: card.char,
        reading: card.key.slice(0, -1) + ['', '', 'ˊ', 'ˇ', 'ˋ', '˙'][tone], reportType: '極度冷僻',
    });
    expect(bodies[0].reading).toMatch(/^[ㄅ-ㄩ]+[ˊˇˋ˙]?$/);
    await context.close();
});

test('回報入口：手機工具列', async ({ browser }) => {
    const bodies = [];
    const { context, page } = await bootPage(browser, { wordlist: 'stub', device: DEVICES.phone, beforeGoto: capture(bodies) });
    await search(page);
    await pick(page, 0);
    await page.locator('#mobileBatchArea .m-batch-btn.btn-report').click();
    await page.locator('.report-reason[data-reason="不該出現"]').click();
    await page.locator('#reportSendBtn').click();
    await expect(page.locator('#reportModalOverlay')).not.toHaveClass(/show/);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({ type: 'char-reading-report', reportType: '不該出現' });
    await context.close();
});

// ===== Task 2：視窗的所有狀態 =====
const dialog = page => ({
    title: page.locator('#reportTitle'),
    chips: page.locator('#reportWords .report-chip'),
    status: page.locator('#reportStatus'),
    send: page.locator('#reportSendBtn'),
    note: page.locator('#reportNote'),
    overlay: page.locator('#reportModalOverlay'),
    reason: name => page.locator(`.report-reason[data-reason="${name}"]`),
});
const openDialog = page => page.locator('#batchPanel .btn-report').click();
const selectedCards = page => page.evaluate(() => [...document.querySelectorAll('.char-card.selected')].map(c => ({ char: c.dataset.char, key: c.dataset.key })));
const tones = ['', '', 'ˊ', 'ˇ', 'ˋ', '˙'];
const readingOf = k => k.slice(0, -1) + tones[parseInt(k.slice(-1), 10)];

test('回報入口：多選上限', async ({ browser }) => {
    const bodies = [];
    const { context, page } = await bootPage(browser, { wordlist: 'stub', beforeGoto: capture(bodies) });
    await search(page, 'ㄢ');
    await pick(page, ...Array.from({ length: 12 }, (_, i) => i));
    const cards = await selectedCards(page);
    expect(cards.length).toBeGreaterThanOrEqual(12);
    await openDialog(page);
    const d = dialog(page);
    await expect(d.title).toHaveText('回報 10 個字詞');
    await expect(d.chips).toHaveCount(9);                       // 8 個晶片 + 「+2」
    await expect(d.chips.last()).toHaveText('+2');
    await expect(d.status).toHaveText('一次最多回報 10 個，已先取前 10 個');
    await d.reason('不該出現').click();
    await expect(d.send).toHaveText('送出回報（10 個）');
    await d.send.click();
    await expect(d.overlay).not.toHaveClass(/show/);
    expect(bodies.map(b => b.char + '|' + b.reading)).toEqual(cards.slice(0, 10).map(c => c.char + '|' + readingOf(c.key)));
    expect(await toast(page)).toBe('已回報 10 個字詞，謝謝你');
    await context.close();
});

test('回報入口：單一項目', async ({ browser }) => {
    const bodies = [];
    const { context, page } = await bootPage(browser, { wordlist: 'stub', beforeGoto: capture(bodies) });
    await search(page);
    await pick(page, 0);
    const [c] = await selectedCards(page);
    await openDialog(page);
    const d = dialog(page);
    await expect(d.title).toHaveText(`回報「${c.char}」`);
    await expect(d.send).toHaveText('送出回報');
    await expect(d.send).toBeDisabled();                         // 還沒選原因
    await expect(d.note).toHaveAttribute('placeholder', '補充說明（選填）');
    await d.reason('太冷僻').click();
    await expect(d.reason('太冷僻')).toHaveAttribute('aria-checked', 'true');
    await expect(d.reason('太冷僻')).toContainText('✓ 太冷僻');
    await d.send.click();
    await expect(d.overlay).not.toHaveClass(/show/);
    expect(await toast(page)).toBe(`已回報「${c.char}」— 太冷僻`);
    await context.close();
});

test('回報入口：防重複', async ({ browser }) => {
    const bodies = [];
    const { context, page } = await bootPage(browser, { wordlist: 'stub', beforeGoto: capture(bodies) });
    await search(page);
    await pick(page, 0);
    const keysBefore = await page.evaluate(() => Object.keys(localStorage).sort());
    await openDialog(page);
    const d = dialog(page);
    await d.reason('太冷僻').click();
    await d.send.click();
    await expect(d.overlay).not.toHaveClass(/show/);
    expect(bodies).toHaveLength(1);
    // 同一頁面再開一次、同一個原因：標成已回報過，不能再送
    await openDialog(page);
    await d.reason('太冷僻').click();
    await expect(d.chips.first()).toContainText('已回報過');
    await expect(d.status).toHaveText('這些字詞已經用這個原因回報過了');
    await expect(d.send).toBeDisabled();
    // 換一個原因就可以送
    await d.reason('不該出現').click();
    await expect(d.chips.first()).not.toContainText('已回報過');
    await expect(d.send).toBeEnabled();
    await page.locator('#reportCancelBtn').click();
    expect(bodies).toHaveLength(1);
    // 只存在這一頁的記憶體裡：沒有新增任何儲存鍵
    expect(await page.evaluate(() => Object.keys(localStorage).sort())).toEqual(keysBefore);
    // 重新整理後可以再送一次
    await page.reload();
    await page.evaluate(() => Promise.all([window.__hoyunReady, window.__hoyunWordlistReady]));
    await search(page);
    await pick(page, 0);
    await openDialog(page);
    await d.reason('太冷僻').click();
    await expect(d.send).toBeEnabled();
    await d.send.click();
    await expect(d.overlay).not.toHaveClass(/show/);
    expect(bodies).toHaveLength(2);
    await context.close();
});

test('回報入口：部分失敗', async ({ browser }) => {
    const bodies = [];
    let failThird = true;
    const { context, page } = await bootPage(browser, { wordlist: 'stub', beforeGoto: capture(bodies, n => ({ status: failThird && n === 3 ? 500 : 200 })) });
    await search(page, 'ㄢ');
    await pick(page, 0, 1, 2);
    await openDialog(page);
    const d = dialog(page);
    await d.reason('其他').click();
    await d.send.click();
    await expect(d.status).toHaveText('已送出 2 個，還有 1 個沒送出，請再按一次送出');
    await expect(d.overlay).toHaveClass(/show/);
    expect(bodies).toHaveLength(3);
    await expect(d.chips.nth(0)).toContainText('已回報過');
    await expect(d.chips.nth(1)).toContainText('已回報過');
    await expect(d.chips.nth(2)).not.toContainText('已回報過');
    await expect(d.send).toBeEnabled();
    failThird = false;
    await d.send.click();
    await expect(d.overlay).not.toHaveClass(/show/);
    expect(bodies).toHaveLength(4);                              // 只補送第 3 個
    expect(bodies[3].char).toBe(bodies[2].char);
    await context.close();
});

test('回報入口：限流', async ({ browser }) => {
    const bodies = [];
    const { context, page } = await bootPage(browser, { wordlist: 'stub', beforeGoto: capture(bodies, () => ({ status: 429 })) });
    await search(page);
    await pick(page, 0);
    await openDialog(page);
    const d = dialog(page);
    await d.reason('其他').click();
    await d.note.fill('我寫了一段說明');
    await d.send.click();
    await expect(d.status).toHaveText('回報得太快了，請過一分鐘再試');
    expect(await toast(page)).toBe('回報得太快了，請過一分鐘再試');
    await expect(d.overlay).toHaveClass(/show/);
    await expect(d.note).toHaveValue('我寫了一段說明');
    await expect(d.send).toBeEnabled();
    await context.close();
});

test('回報入口：失敗', async ({ browser }) => {
    const bodies = [];
    const { context, page } = await bootPage(browser, { wordlist: 'stub', beforeGoto: capture(bodies, () => ({ status: 500 })) });
    await search(page);
    await pick(page, 0);
    await openDialog(page);
    const d = dialog(page);
    await d.reason('讀音錯誤').click();
    await d.note.fill('ㄔㄤˊ');
    await d.send.click();
    await expect(d.status).toHaveText('回報沒有送出，請檢查網路後再試一次');
    expect(await toast(page)).toBe('回報沒有送出，請檢查網路後再試一次');
    expect(await d.status.evaluate(el => getComputedStyle(el).color)).toBe('rgb(229, 62, 62)');
    await expect(d.overlay).toHaveClass(/show/);
    await expect(d.note).toHaveValue('ㄔㄤˊ');
    await expect(d.reason('讀音錯誤')).toHaveAttribute('aria-checked', 'true');
    await expect(d.send).toBeEnabled();
    await expect(d.send).toHaveText('送出回報');
    await context.close();
});

test('回報入口：說明欄字數', async ({ browser }) => {
    const bodies = [];
    const { context, page } = await bootPage(browser, { wordlist: 'stub', beforeGoto: capture(bodies) });
    await search(page);
    await pick(page, 0);
    const d = dialog(page);
    await expect(d.note).toHaveAttribute('maxlength', '500');
    const send = async (reason, text) => {
        await openDialog(page);
        await d.reason(reason).click();
        await page.evaluate(t => { document.getElementById('reportNote').value = t; }, text);   // 程式塞值不受 maxlength 限制，用來驗送出前的截斷
        await d.send.click();
        await expect(d.overlay).not.toHaveClass(/show/);
        return bodies[bodies.length - 1];
    };
    const whole = '長'.repeat(500);
    expect((await send('不該出現', whole)).note).toBe(whole);                       // 500 個中文字整段送出
    const astral = '𠀀'.repeat(600);                                               // 每個佔 2 個 UTF-16 單位
    expect(Array.from((await send('其他', astral)).note)).toHaveLength(500);       // 截成 500 個字元
    const r = await send('讀音錯誤', '  ㄔㄤˊ  ');
    expect(r.suggested).toBe('ㄔㄤˊ');                                             // 讀音錯誤的說明進 suggested，前後空白去掉
    expect(r.note).toBeUndefined();
    const none = await send('太冷僻', '   ');
    expect(none.note).toBeUndefined();
    expect(none.suggested).toBeUndefined();
    await context.close();
});

test('回報入口：鍵盤', async ({ browser }) => {
    const bodies = [];
    const { context, page } = await bootPage(browser, { wordlist: 'stub', beforeGoto: capture(bodies) });
    await search(page);
    await pick(page, 0);
    const d = dialog(page);
    const active = () => page.evaluate(() => document.activeElement && (document.activeElement.id || document.activeElement.dataset.reason || document.activeElement.tagName));
    await page.locator('#batchPanel .btn-report').focus();
    await page.keyboard.press('Enter');
    await expect(d.overlay).toHaveClass(/show/);
    expect(await active()).toBe('reportTitle');                                    // 焦點在標題，不在說明欄
    // 方向鍵移動選取（單選群組）
    await d.reason('讀音錯誤').focus();
    await page.keyboard.press('ArrowRight');
    await expect(d.reason('太冷僻')).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('ArrowDown');
    await expect(d.reason('不該出現')).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('ArrowLeft');
    await expect(d.reason('太冷僻')).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('ArrowUp');
    await expect(d.reason('讀音錯誤')).toHaveAttribute('aria-checked', 'true');
    await d.reason('其他').focus();
    await page.keyboard.press('Space');
    await expect(d.reason('其他')).toHaveAttribute('aria-checked', 'true');
    // Tab 不會跑出視窗：最後一個再 Tab 回到第一個，第一個 Shift+Tab 到最後一個
    await d.send.focus();
    await page.keyboard.press('Tab');
    expect(await active()).toBe('其他');                                           // 已選的那顆是群組裡唯一的 Tab 停靠點
    await page.keyboard.press('Shift+Tab');
    expect(await active()).toBe('reportSendBtn');
    // Esc 關閉，焦點回到開啟它的按鈕
    await page.keyboard.press('Escape');
    await expect(d.overlay).not.toHaveClass(/show/);
    expect(await page.evaluate(() => document.activeElement.className)).toContain('btn-report');
    await context.close();
});

test('回報入口：遮罩', async ({ browser }) => {
    const { context, page } = await bootPage(browser, { wordlist: 'stub', beforeGoto: capture([]) });
    await search(page);
    await pick(page, 0);
    const d = dialog(page);
    await openDialog(page);
    await d.overlay.click({ position: { x: 4, y: 4 } });                          // 說明欄是空的：點遮罩會關
    await expect(d.overlay).not.toHaveClass(/show/);
    await openDialog(page);
    await d.note.fill('寫到一半');
    await d.overlay.click({ position: { x: 4, y: 4 } });                          // 有字：不會關，免得打的字不見
    await expect(d.overlay).toHaveClass(/show/);
    await page.locator('#reportCancelBtn').click();                               // 先不回報一定關
    await expect(d.overlay).not.toHaveClass(/show/);
    await context.close();
});

test('回報入口：改名意見', async ({ browser }) => {
    const { context, page } = await bootPage(browser, { wordlist: 'stub' });
    await expect(page.locator('.footer .feedback-btn')).toHaveText('意見');
    await expect(page.locator('.settings-feedback-btn')).toHaveText('✉️ 意見回饋');
    await context.close();
});

test('回報入口：只送必要欄位', async ({ browser }) => {
    // 使用者自己的歌詞、存的詞、標籤都不能跟著回報送出去（T-07-13）
    const bodies = [];
    const storage = { haiku_lyrics: JSON.stringify([{ label: 'A', text: '私人歌詞內容' }]), haiku_savedwords: JSON.stringify(['私藏詞']), haiku_hashtags: JSON.stringify(['私人標籤']) };
    const { context, page } = await bootPage(browser, { wordlist: 'stub', storage, beforeGoto: capture(bodies) });
    await search(page);
    await pick(page, 0);
    await openDialog(page);
    await dialog(page).reason('讀音錯誤').click();
    await dialog(page).note.fill('ㄔㄤˊ');
    await dialog(page).send.click();
    await expect(dialog(page).overlay).not.toHaveClass(/show/);
    expect(bodies).toHaveLength(1);
    const allowed = ['type', 'word', 'char', 'reading', 'reportType', 'note', 'suggested'];
    expect(Object.keys(bodies[0]).filter(k => !allowed.includes(k))).toEqual([]);
    expect(JSON.stringify(bodies)).not.toMatch(/私人|私藏/);
    await context.close();
});

test('回報入口：字詞當文字顯示', async ({ browser }) => {
    // AI 來的詞可能帶標記：標題與晶片只能當文字（T-07-15）
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub' });
    await page.evaluate(() => openReportDialog([{ kind: 'word', word: '<img src=x onerror="window.__xss=1">' }]));
    await expect(page.locator('#reportTitle')).toHaveText('回報「<img src=x onerror="window.__xss=1">」');
    await expect(page.locator('#reportWords img')).toHaveCount(0);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
    expect(errors.filter(e => !e.includes('Failed to load resource'))).toEqual([]);
    await context.close();
});
