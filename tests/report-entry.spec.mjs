// FB-01 回報入口（Phase 7，07-04）：工具列的 🚩 回報鈕與回報視窗
// 所有標題都以「回報入口：」開頭；/feedback 的請求內容由 page.route 攔下來比對
import { test, expect } from '@playwright/test';
import { bootPage, settle } from './helpers.mjs';
import { DEVICES, setScale, waitStill, expectFullyInViewport, rectsOverlap, auditTouchTargets, auditVisibleControls, emulateKeyboard, readKeyboard, insideVisible, meetsInputFloor } from './layout-lib.mjs';

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

// ===== Task 3：各種裝置、縮放、主題 =====
const LAYOUT_DEVICES = [['手機 390×844', DEVICES.phone], ['平板 820×1180', DEVICES.tablet], ['桌機 1440×900', DEVICES.desktop], ['觸控平板橫放 1180×820', DEVICES.tabletLandscape]];
const visibleReportBtn = page => page.locator('.btn-report:visible');
// 這個畫面是否算「觸控」：觸控指標，或寬度 ≤ 900（UI-SPEC §10.2：兩者之一就要 44×44）
const needsHit = (page, device) => page.evaluate(() => matchMedia('(pointer: coarse), (max-width: 900px)').matches);

for (const [name, device] of LAYOUT_DEVICES) {
    for (const pct of [100, 150]) {
        test(`回報入口：版面（${name}，${pct}%）`, async ({ browser }) => {
            const { context, page } = await bootPage(browser, { wordlist: 'stub', device, beforeGoto: capture([]) });
            try {
                await search(page);
                await pick(page, 0);
                if (pct !== 100) await setScale(page, pct);
                await waitStill(page);
                const hit = await needsHit(page, device);
                // 工具列上的 🚩：整個框在視窗內，和同一排的兄弟按鈕不重疊
                const btn = visibleReportBtn(page);
                await expect(btn).toHaveCount(1);
                await expectFullyInViewport(page, btn);
                const mine = await btn.boundingBox();
                const sibs = await btn.evaluate(b => [...b.parentElement.children].filter(x => x !== b && x.getClientRects().length).map(x => x.getBoundingClientRect().toJSON()));
                expect(sibs.length, '同一排還有其他批次鈕').toBeGreaterThanOrEqual(3);
                for (const r of sibs) expect(rectsOverlap(mine, r), '回報鈕不能壓到旁邊的按鈕').toBe(false);
                const bar = await auditTouchTargets(page, { mustSee: ['.btn-report'] });
                expect(bar.missing).toEqual([]);
                // 同一時刻量畫面上所有可互動元素的框，回報鈕不能壓到任何一個
                // （auditTouchTargets 的 overlaps 在頁面會捲動的 150% 下會因逐個捲動而誤報，連原本就有的按鈕也中，所以改用同一刻的實際框）
                const all = await auditVisibleControls(page, '.options, #mobileBatchArea');
                const me = all.filter(c => /btn-report/.test(c.name));
                expect(me.length).toBe(1);
                for (const c of all) if (!/btn-report/.test(c.name)) expect(rectsOverlap(me[0], c), `回報鈕壓到 ${c.name}`).toBe(false);
                if (hit) expect(bar.failures.filter(f => /btn-report/.test(f.selector)), '回報鈕點擊範圍要 ≥ 44×44').toEqual([]);
                // 視窗開著：原因、先不回報、送出回報
                await btn.click();
                await expect(page.locator('#reportModalOverlay')).toHaveClass(/show/);
                await page.locator('.report-reason[data-reason="太冷僻"]').click();   // 選了才有「✓」，量到的是最寬的狀態
                await waitStill(page);
                const dlg = await auditTouchTargets(page, { mustSee: ['.report-reason', '#reportCancelBtn', '#reportSendBtn'] });
                expect(dlg.missing).toEqual([]);
                expect(dlg.overlaps.filter(o => /report/.test(o.a + o.b)), '視窗裡的控制項彼此不重疊').toEqual([]);
                if (hit) expect(dlg.failures.filter(f => /report/.test(f.selector)), '視窗控制項點擊範圍要 ≥ 44×44').toEqual([]);
                const sw = await page.evaluate(() => ({ sw: document.scrollingElement.scrollWidth, cw: document.scrollingElement.clientWidth }));
                expect(sw.sw, '整頁不能橫向捲動').toBeLessThanOrEqual(sw.cw + 1);
            } finally { await context.close(); }
        });
    }
}

test('回報入口：手機四欄', async ({ browser }) => {
    const { context, page } = await bootPage(browser, { wordlist: 'stub', device: DEVICES.phone });
    try {
        const rows = () => page.evaluate(() => {
            const p = document.getElementById('m-batchPanel');
            const rs = [...p.children].map(b => b.getBoundingClientRect());
            return { cols: getComputedStyle(p).gridTemplateColumns.split(' ').length, tops: [...new Set(rs.map(r => Math.round(r.top)))], right: Math.max(...rs.map(r => r.right)), left: Math.min(...rs.map(r => r.left)), iw: innerWidth };
        });
        const r100 = await rows();
        expect(r100.cols, '390px／100% 一排四個').toBe(4);
        expect(r100.tops).toHaveLength(1);
        await setScale(page, 150);
        await waitStill(page);
        const r150 = await rows();
        expect(r150.cols, '放大到 150% 變 2×2').toBe(2);
        expect(r150.tops).toHaveLength(2);
        for (const r of [r100, r150]) { expect(r.left).toBeGreaterThanOrEqual(0); expect(r.right).toBeLessThanOrEqual(r.iw + 0.5); }
    } finally { await context.close(); }
});

for (const [name, device] of [['手機', DEVICES.phone], ['觸控平板橫放', DEVICES.tabletLandscape]]) {
    test(`回報入口：輸入框字級（${name}）`, async ({ browser }) => {
        test.setTimeout(180_000);   // 縮放要用真按鈕一下一下點到 50%／150%
        const { context, page } = await bootPage(browser, { wordlist: 'stub', device });
        try {
            await search(page);
            await pick(page, 0);
            for (const pct of [100, 150, 50]) {
                await setScale(page, pct);        // 視窗開著會蓋住縮放鈕，所以每個比例先縮放、再開視窗量、再關
                await waitStill(page);
                await page.evaluate(() => openReportDialog());
                const px = await page.locator('#reportNote').evaluate(el => parseFloat(getComputedStyle(el).fontSize));
                expect(meetsInputFloor(px), `${name} ${pct}%：說明欄 ${px}px 要 ≥ 16px`).toBe(true);
                await page.evaluate(() => closeReportDialog());
            }
        } finally { await context.close(); }
    });
}

test('回報入口：鍵盤（後盾）', async ({ browser }) => {
    const { context, page } = await bootPage(browser, { wordlist: 'stub', device: DEVICES.phone });
    try {
        await search(page);
        await pick(page, 0);
        await page.evaluate(() => openReportDialog());
        await page.locator('.report-reason[data-reason="讀音錯誤"]').click();
        await page.locator('#reportNote').focus();
        await emulateKeyboard(page, 336);
        await expect.poll(async () => (await readKeyboard(page)).open).toBe(true);
        await waitStill(page);
        const kb = await readKeyboard(page);
        expect(insideVisible(await page.locator('#reportNote').boundingBox(), kb), '說明欄在可見範圍內').toBe(true);
        expect(insideVisible(await page.locator('#reportSendBtn').boundingBox(), kb), '送出回報在可見範圍內').toBe(true);
    } finally { await context.close(); }
});

test('回報入口：長文字（後盾）', async ({ browser }) => {
    const { context, page } = await bootPage(browser, { wordlist: 'stub', device: DEVICES.phone });
    try {
        await search(page, 'ㄢ');
        await pick(page, ...Array.from({ length: 10 }, (_, i) => i));
        await setScale(page, 150);
        await waitStill(page);
        const els = [visibleReportBtn(page)];
        await visibleReportBtn(page).click();
        await page.locator('.report-reason[data-reason="不該出現"]').click();
        await waitStill(page);
        await expect(page.locator('#reportSendBtn')).toHaveText('送出回報（10 個）');
        const sel = ['.report-reason-label', '#reportSendBtn', '#reportCancelBtn'];
        const boxes = await page.evaluate(sel => sel.flatMap(s => [...document.querySelectorAll(s)]).map(el => ({ name: el.id || el.className + ':' + el.textContent, clip: el.scrollWidth - el.clientWidth, r: el.getBoundingClientRect().toJSON() })), sel);
        expect(boxes.length).toBeGreaterThanOrEqual(6);
        for (const b of boxes) expect(b.clip, `${b.name} 文字被裁切`).toBeLessThanOrEqual(1);
        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(rectsOverlap(boxes[i].r, boxes[j].r), `${boxes[i].name} 和 ${boxes[j].name} 重疊`).toBe(false);
        // 🚩 回報鈕（視窗關閉時量）
        await page.locator('#reportCancelBtn').click();
        await waitStill(page);
        const bb = await els[0].evaluate(b => ({ clip: b.scrollWidth - b.clientWidth, spans: [...b.querySelectorAll('span')].map(s => s.scrollWidth - s.clientWidth) }));
        expect(bb.clip).toBeLessThanOrEqual(1);
        bb.spans.forEach(c => expect(c).toBeLessThanOrEqual(1));
    } finally { await context.close(); }
});

test('回報入口：主題', async ({ browser }) => {
    const custom = { containerBg: '#fff7e6', textColor: '#1a202c', highlightColor: '#2b6cb0' };
    const cases = [['淺色', {}], ['深色', { colorScheme: 'dark' }], ['自訂配色', { storage: custom }]];
    const seen = [];
    for (const [name, opts] of cases) {
        const { context, page } = await bootPage(browser, { wordlist: 'stub', beforeGoto: capture([]), ...opts });
        try {
            await search(page);
            await pick(page, 0);
            await page.evaluate(() => openReportDialog());
            await page.locator('.report-reason[data-reason="其他"]').click();
            const r = await page.evaluate(() => {
                const probe = document.createElement('i');
                probe.style.background = 'var(--action-bg)';
                document.body.appendChild(probe);
                const token = getComputedStyle(probe).backgroundColor;
                probe.remove();
                const send = getComputedStyle(document.getElementById('reportSendBtn'));
                const dlg = getComputedStyle(document.querySelector('.report-modal'));
                return { token, bg: send.backgroundColor, color: send.color, dlg: dlg.backgroundColor, title: getComputedStyle(document.getElementById('reportTitle')).color };
            });
            expect(r.bg, `${name}：送出鈕底色就是 --action-bg`).toBe(r.token);
            expect(r.color).toBe('rgb(255, 255, 255)');
            expect(r.dlg, `${name}：視窗有自己的底色`).not.toBe('rgba(0, 0, 0, 0)');
            seen.push(r.token);
        } finally { await context.close(); }
    }
    expect(new Set(seen).size, '三種主題的行動色一樣（自訂配色改不到它）').toBe(1);
});

test('回報入口：切換斷點', async ({ browser }) => {
    const { context, page } = await bootPage(browser, { wordlist: 'stub', device: DEVICES.tabletLandscape, beforeGoto: capture([]) });
    try {
        await search(page);
        await pick(page, 0);
        await page.evaluate(() => openReportDialog());
        await expect(page.locator('#reportModalOverlay')).toHaveClass(/show/);
        await page.setViewportSize({ width: 390, height: 844 });
        await waitStill(page);
        const r = await page.evaluate(() => {
            const o = document.getElementById('reportModalOverlay').getBoundingClientRect();
            const m = document.querySelector('.report-modal');
            const b = m.getBoundingClientRect();
            return {
                ov: o.toJSON(), vw: innerWidth, vh: innerHeight, cx: b.x + b.width / 2, cy: b.y + b.height / 2, inside: b.x >= 0 && b.right <= innerWidth && b.y >= 0 && b.bottom <= innerHeight,
                overflowY: getComputedStyle(m).overflowY, home: document.querySelector('#m-batchPanel .btn-report') ? document.getElementById('m-batchPanel').parentElement.id : null,
            };
        });
        expect(r.ov.width).toBeGreaterThanOrEqual(r.vw - 1);
        expect(r.ov.height).toBeGreaterThanOrEqual(r.vh - 1);
        expect(Math.abs(r.cx - r.vw / 2), '水平置中').toBeLessThanOrEqual(2);
        expect(Math.abs(r.cy - r.vh / 2), '垂直置中').toBeLessThanOrEqual(2);
        expect(r.inside, '整個視窗在畫面內').toBe(true);
        expect(r.overflowY, '內容太高時視窗自己捲動').toMatch(/auto|scroll/);
        expect(r.home, '🚩 回報跟著批次面板搬進手機版面').toBe('mobileBatchArea');
    } finally { await context.close(); }
});

// ===== AI 詞卡回報模式（07-06，D-03） =====
const AI_REPLY = '美音、原因、光陰';
// 搜尋 心 → 生成（詞庫 stub 只有 12 個候選，由 mock 的 Worker 補 AI 詞）。按鈕直接觸發 click，與 smoke 一樣
async function generateAi(page) {
    await page.fill('#searchInput', '心');
    await settle(page);
    await page.evaluate(() => document.getElementById('generateBtn').click());
    await page.waitForFunction(() => !document.getElementById('generateBtn').disabled && !document.getElementById('aiWordsContainer').textContent.includes('AI 生成補充詞'));
    await page.waitForSelector('.ai-word-card .ai-badge');
}
const openAiPanel = page => page.evaluate(() => { if (document.getElementById('rightPanel').classList.contains('collapsed')) toggleRightPanel(); });
const savedCount = page => page.evaluate(() => savedWords.length);

test('回報入口：AI 回報模式', async ({ browser }) => {
    const bodies = [];
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', aiReply: AI_REPLY, beforeGoto: capture(bodies) });
    await generateAi(page);
    await openAiPanel(page);
    const row = page.locator('#aiReportRow');
    await expect(row).toBeVisible();
    await expect(page.locator('#aiReportStart')).toHaveText('🚩 回報詞語');
    // 一般點擊照舊：存進保留區
    const cards = page.locator('.ai-word-card');
    const before = await savedCount(page);
    await cards.nth(0).click();
    expect(await savedCount(page)).toBe(before + 1);
    // 進入選取模式：點詞不存、只選取
    await page.locator('#aiReportStart').click();
    await expect(page.locator('#aiWordsContainer')).toHaveClass(/report-mode/);
    await expect(page.locator('#aiReportText')).toHaveText('點選要回報的詞');
    await expect(page.locator('#aiReportSend')).toBeHidden();
    await cards.nth(1).click();
    await cards.nth(2).click();
    expect(await savedCount(page), '選取模式不能存詞').toBe(before + 1);
    await expect(page.locator('#aiReportText')).toHaveText('已選 2 個詞');
    await expect(page.locator('.ai-word-card.report-picked')).toHaveCount(2);
    await expect(page.locator('#aiReportSend')).toHaveText('回報（2）');
    await expect(page.locator('#aiReportSend')).toHaveAttribute('aria-label', '回報已選的 2 個詞');
    // 再點一次取消選取
    await cards.nth(2).click();
    await expect(page.locator('#aiReportText')).toHaveText('已選 1 個詞');
    await cards.nth(2).click();
    const words = await page.locator('.ai-word-card.report-picked').evaluateAll(els => els.map(e => e.dataset.word));
    expect(words).toHaveLength(2);
    // 開同一個回報視窗、選原因、送出：每個詞一筆
    await page.locator('#aiReportSend').click();
    await expect(page.locator('#reportModalOverlay')).toHaveClass(/show/);
    await expect(page.locator('#reportTitle')).toHaveText('回報 2 個字詞');
    await page.locator('.report-reason[data-reason="不該出現"]').click();
    await page.locator('#reportSendBtn').click();
    await expect(page.locator('#reportModalOverlay')).not.toHaveClass(/show/);
    expect(bodies).toEqual(words.map(word => ({ type: 'word-report', word, reportType: '不該出現' })));
    // 成功後離開模式、清掉選取，再點詞又是存進保留區
    await expect(page.locator('#aiWordsContainer')).not.toHaveClass(/report-mode/);
    await expect(page.locator('.ai-word-card.report-picked')).toHaveCount(0);
    await expect(page.locator('#aiReportStart')).toBeVisible();
    await cards.nth(3).click();
    expect(await savedCount(page)).toBe(before + 2);
    // 結束選取：離開並清掉選取
    await page.locator('#aiReportStart').click();
    await cards.nth(4).click();
    await page.locator('#aiReportExit').click();
    await expect(page.locator('#aiWordsContainer')).not.toHaveClass(/report-mode/);
    await expect(page.locator('.ai-word-card.report-picked')).toHaveCount(0);
    expect(errors.filter(e => !e.includes('Failed to load resource'))).toEqual([]);
    await context.close();
});

test('回報入口：AI 列隱藏', async ({ browser }) => {
    const { context, page } = await bootPage(browser, { wordlist: 'stub', aiReply: AI_REPLY });
    await expect(page.locator('#aiReportRow')).toHaveAttribute('hidden', '');
    await generateAi(page);
    await expect(page.locator('#aiReportRow')).not.toHaveAttribute('hidden', '');
    // 進入模式選一個，再按一次生成：模式關掉、選取清掉、新詞卡出現後列又回到一般狀態
    await openAiPanel(page);
    await page.locator('#aiReportStart').click();
    await page.locator('.ai-word-card').first().click();
    await expect(page.locator('#aiReportText')).toHaveText('已選 1 個詞');
    await page.evaluate(() => document.getElementById('generateBtn').click());
    await page.waitForFunction(() => !document.getElementById('generateBtn').disabled && !document.getElementById('aiWordsContainer').textContent.includes('AI 生成補充詞'));
    await expect(page.locator('#aiWordsContainer')).not.toHaveClass(/report-mode/);
    await expect(page.locator('.ai-word-card.report-picked')).toHaveCount(0);
    await expect(page.locator('#aiReportExit')).toBeHidden();
    // 詞卡被清空（換搜尋重置）：整列藏起來
    await page.evaluate(() => { document.getElementById('aiWordsContainer').innerHTML = ''; });
    await expect(page.locator('#aiReportRow')).toHaveAttribute('hidden', '');
    await context.close();
});

for (const [name, device] of [['手機 390', DEVICES.phone], ['觸控平板橫放 1180', DEVICES.tabletLandscape]]) {
    test(`回報入口：AI 列觸控（${name}）`, async ({ browser }) => {
        const { context, page } = await bootPage(browser, { wordlist: 'stub', aiReply: AI_REPLY, device });
        try {
            await generateAi(page);
            await openAiPanel(page);
            await waitStill(page);
            const idle = await auditTouchTargets(page, { mustSee: ['#aiReportStart'] });
            expect(idle.missing).toEqual([]);
            expect(idle.failures.filter(f => /ai-report/.test(f.selector)), '回報詞語鈕點擊範圍要 ≥ 44×44').toEqual([]);
            await page.locator('#aiReportStart').click();
            await page.locator('.ai-word-card').first().click();
            await waitStill(page);
            const on = await auditTouchTargets(page, { mustSee: ['#aiReportSend', '#aiReportExit'] });
            expect(on.missing).toEqual([]);
            expect(on.failures.filter(f => /ai-report/.test(f.selector)), '回報（n）與結束選取點擊範圍要 ≥ 44×44').toEqual([]);
            const sw = await page.evaluate(() => ({ sw: document.scrollingElement.scrollWidth, cw: document.scrollingElement.clientWidth }));
            expect(sw.sw, '整頁不能橫向捲動').toBeLessThanOrEqual(sw.cw + 1);
        } finally { await context.close(); }
    });
}
