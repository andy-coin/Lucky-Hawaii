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
