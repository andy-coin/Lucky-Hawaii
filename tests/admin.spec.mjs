// 後台（admin/index.html）瀏覽器測試：Worker 程式碼真的在測試程序內跑（bridgeWorker＋FakeKV），只假上游
import { test, expect } from '@playwright/test';
import { CONTEXT_OPTS, BASE, routeExternal, collectErrors } from './helpers.mjs';
import { FakeKV, makeEnv, bridgeWorker } from './worker-helpers.mjs';

const WORKER_HOST = 'lucky-hawaii.is3000dollar.workers.dev';
const KEY = 'admin-test';

// ── 種子資料 ──
// 每筆回報一個 KV 鍵；鍵名開頭是毫秒時間，Worker 靠它排新到舊
const seedKV = list => Object.fromEntries(list.map((r, i) => [`${1760000000000 + i}_t${String(i).padStart(2, '0')}`, JSON.stringify(r)]));
const word = (w, reportType, ts, extra = {}) => ({ type: 'word-report', word: w, reportType, ts, ...extra });
const char = (c, reading, reportType, ts, extra = {}) => ({ type: 'char-reading-report', char: c, reading, reportType, ts, ...extra });
const feedback = (subject, body, ts, extra = {}) => ({ type: 'feedback', subject, body, ts, ...extra });
// 台北時間的 10/1 14:22、10/5 09:00、10/8 09:10
const T1 = '2026-10-01T06:22:00.000Z', T2 = '2026-10-05T01:00:00.000Z', T3 = '2026-10-08T01:10:00.000Z';

// 開後台：金鑰預先放進 localStorage、時區固定台北；記錄每一個打到 Worker 的請求（含標頭）
async function bootAdmin(browser, { reports = [], env: envOver = {}, device = {}, key = KEY, hook = null, wait = true } = {}) {
    const kv = new FakeKV(seedKV(reports));
    const env = makeEnv({ ALLOW_LOCAL_ORIGIN: '1', USER_FEEDBACK_KV: kv, ...envOver });
    const context = await browser.newContext({
        ...CONTEXT_OPTS, timezoneId: 'Asia/Taipei', ...device,
        storageState: { cookies: [], origins: key == null ? [] : [{ origin: BASE, localStorage: [{ name: 'haoYunQi_admin_key', value: key }] }] },
    });
    const offOrigin = await routeExternal(context);
    await bridgeWorker(context, env, { reflectOrigin: true });
    const calls = [];
    context.on('request', r => {
        const u = new URL(r.url());
        if (u.hostname === WORKER_HOST) calls.push({ method: r.method(), path: u.pathname, url: r.url(), headers: r.headers(), body: r.postData() });
    });
    if (hook) await hook({ context, kv, env });
    const page = await context.newPage();
    const { errors } = collectErrors(page);
    page.on('dialog', d => d.accept());
    await page.goto('/admin/index.html');
    if (wait) await page.waitForSelector('#main[data-state="ok"], #main[data-state="error"]');
    return { context, page, kv, env, calls, errors, offOrigin };
}

// 以回報類型與詞找到那一列
const rowOf = (page, subject, reason) => page.locator('.card.group', { has: page.locator('.card-reason', { hasText: reason }) }).filter({ hasText: subject });
const kvValues = kv => [...kv.m.values()].map(v => JSON.parse(v));
const decisions = calls => calls.filter(c => c.path === '/reports/decision');

test('後台：合併 — 同一個詞＋同一原因合成一列，原因不同分開，feedback 不合併；展開看三筆原文（新到舊）', async ({ browser }) => {
    const { context, page, errors } = await bootAdmin(browser, {
        reports: [
            word('二心', '極度冷僻', T1, { note: '很少見' }),
            word('二心', '極度冷僻', T2),
            word('二心', '極度冷僻', T3, { note: '不會用', suggested: 'ㄦˋ ㄒㄧㄣ' }),
            word('二心', '不該出現', T2),
            feedback('希望加字', '可以加一個字嗎', T3),
        ],
    });
    await expect(page.locator('.card.group')).toHaveCount(3);

    const row = rowOf(page, '二心', '極度冷僻');
    await expect(row).toHaveCount(1);
    await expect(row.locator('.count-pill')).toHaveText('×3');
    await expect(row.locator('.card-header .card-time')).toHaveText('2026-10-01 14:22 → 2026-10-08 09:10');

    // 原因不同 → 另一列；feedback 不合併、沒有次數
    const other = rowOf(page, '二心', '不該出現');
    await expect(other.locator('.count-pill')).toHaveText('×1');
    const fb = page.locator('.card.group', { hasText: '希望加字' });
    await expect(fb).toHaveCount(1);
    await expect(fb.locator('.count-pill')).toHaveCount(0);

    // 展開前看不到原文，展開後三筆、最新的在前
    const toggle = row.locator('.row-toggle');
    await expect(toggle).toHaveText('▸ 展開 3 筆原文');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(row.locator('.row-originals')).toBeHidden();
    await toggle.click();
    await expect(toggle).toHaveText('▾ 收合');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const origs = row.locator('.orig');
    await expect(origs).toHaveCount(3);
    expect(await origs.locator('.card-time').allTextContents()).toEqual(['2026-10-08 09:10', '2026-10-05 09:00', '2026-10-01 14:22']);
    await expect(origs.nth(0)).toContainText('不會用');
    await expect(origs.nth(0)).toContainText('建議：ㄦˋ ㄒㄧㄣ');   // note 與 suggested 兩個欄位都顯示
    await expect(origs.nth(1)).toContainText('（沒有說明）');
    await expect(origs.nth(2)).toContainText('很少見');

    // 所有時間都是本機時間到分鐘
    for (const t of await page.locator('.card-time').allTextContents()) expect(t).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
    expect(errors).toEqual([]);
    await context.close();
});

test('後台：金鑰標頭 — 每個打到 Worker 的請求都帶 X-Admin-Key，網址上沒有 key=', async ({ browser }) => {
    const { context, page, calls } = await bootAdmin(browser, {
        reports: [word('二心', '極度冷僻', T1), word('三心', '不該出現', T2, { status: 'archived' })],
    });
    // 再走 decision（駁回）與 delete（永久刪除已封存）兩條寫入路徑
    await rowOf(page, '二心', '極度冷僻').getByRole('button', { name: /^駁回「/ }).click();
    await expect.poll(() => decisions(calls).length).toBe(1);
    await page.locator('#showArchived').check();
    await rowOf(page, '三心', '不該出現').getByRole('button', { name: /永久刪除/ }).click();
    await expect.poll(() => calls.filter(c => c.path === '/reports/delete').length).toBe(1);

    const paths = new Set(calls.map(c => c.path));
    expect([...paths].sort()).toEqual(['/reports.json', '/reports/decision', '/reports/delete']);
    for (const c of calls) {
        expect(c.headers['x-admin-key'], `${c.method} ${c.path}`).toBe(KEY);
        expect(c.url, `${c.method} ${c.path} 網址不該帶金鑰`).not.toContain('key=');
    }
    await context.close();
});

test('後台：整列核准 — 按一下核准，列內三筆都寫入同一個決定（hide_word）', async ({ browser }) => {
    const { context, page, kv, calls, errors } = await bootAdmin(browser, {
        reports: [word('二心', '極度冷僻', T1), word('二心', '極度冷僻', T2), word('二心', '極度冷僻', T3)],
    });
    const row = rowOf(page, '二心', '極度冷僻');
    await row.getByRole('button', { name: /^核准「/ }).click();
    await expect(row.locator('.action-preview')).toContainText('等待套用');

    expect(decisions(calls)).toHaveLength(3);
    const stored = kvValues(kv);
    expect(stored).toHaveLength(3);
    for (const v of stored) {
        expect(v.status).toBe('agreed');
        expect(v.action).toMatchObject({ type: 'hide_word', word: '二心' });
        expect(v.decided_at).toBeTruthy();
    }
    await expect(row.getByRole('button', { name: '改回待審' })).toBeVisible();
    expect(errors).toEqual([]);
    await context.close();
});

test('後台：駁回 — 列內每一筆都記為 dismissed，可以還原', async ({ browser }) => {
    const { context, page, kv, calls } = await bootAdmin(browser, {
        reports: [word('二心', '極度冷僻', T1), word('二心', '極度冷僻', T2), word('二心', '極度冷僻', T3)],
    });
    const row = rowOf(page, '二心', '極度冷僻');
    await row.getByRole('button', { name: /^駁回「/ }).click();
    await expect(row.locator('.action-preview')).toHaveText('× 駁回');
    expect(decisions(calls)).toHaveLength(3);
    for (const v of kvValues(kv)) { expect(v.status).toBe('dismissed'); expect(v.action).toBeUndefined(); }

    // 還原 → 三筆都回到待審
    await row.getByRole('button', { name: /還原/ }).click();
    await expect(row.locator('.action-preview')).toHaveText('待審');
    for (const v of kvValues(kv)) expect(v.status).toBeUndefined();
    await context.close();
});

// ===== Task 2：篩選、全選、批次核准／駁回、各種空白／載入／錯誤畫面 =====
const kvKeyOf = i => `${1760000000000 + i}_t${String(i).padStart(2, '0')}`;
const agreed = (r, action) => ({ ...r, status: 'agreed', decided_at: '2026-10-09T00:00:00.000Z', action });
const hideWord = w => ({ type: 'hide_word', word: w });
// 攔截 Worker 路徑：handler(route, request) 回 true 表示自己處理了，否則放行給 Worker
const intercept = (pathname, handler) => async ({ context }) => {
    await context.route(u => new URL(u).hostname === WORKER_HOST && new URL(u).pathname === pathname, async route => {
        if (!(await handler(route, route.request()))) await route.fallback();
    });
};
const chip = (page, label) => page.locator('.filter-row .chip', { hasText: label });
const visibleWords = page => page.locator('.card.group .card-word').allTextContents();
const batchBtn = (page, verb) => page.locator('#batchBar').getByRole('button', { name: new RegExp(`^${verb}選取的`) });

test('後台：篩選 — 全部／待審／已核准未套用／已上線／已駁回五顆，帶數量；顯示已封存疊在上面', async ({ browser }) => {
    const { context, page } = await bootAdmin(browser, {
        reports: [
            word('甲', '極度冷僻', T3),
            word('乙', '不該出現', T2),
            agreed(word('丙', '極度冷僻', T1), hideWord('丙')),
            { ...word('丁', '不該出現', T1), status: 'dismissed' },
            { ...word('戊', '極度冷僻', T1), status: 'archived' },
        ],
    });
    expect(await page.locator('.filter-row .chip').allTextContents()).toEqual(['全部 (4)', '待審 (2)', '已核准未套用 (1)', '已上線 (0)', '已駁回 (1)']);
    await expect(chip(page, '全部')).toHaveAttribute('aria-pressed', 'true');

    await chip(page, '待審').click();
    expect(await visibleWords(page)).toEqual(['甲', '乙']);
    await expect(chip(page, '待審')).toHaveAttribute('aria-pressed', 'true');
    await chip(page, '已核准未套用').click();
    expect(await visibleWords(page)).toEqual(['丙']);
    await chip(page, '已駁回').click();
    expect(await visibleWords(page)).toEqual(['丁']);

    // 顯示已封存：全部多出一列；待審篩選下封存的不會冒出來
    await page.locator('#showArchived').check();
    await expect(chip(page, '全部')).toHaveText('全部 (5)');
    await chip(page, '待審').click();
    expect((await visibleWords(page)).sort()).toEqual(['乙', '甲']);
    await chip(page, '全部').click();
    expect(await page.locator('.card.group').count()).toBe(5);
    await context.close();
});

test('後台：全選 — 只選目前篩選結果；取消一列變半選；空篩選選到 0 列、批次列不出現', async ({ browser }) => {
    const { context, page } = await bootAdmin(browser, {
        reports: [
            ...['甲', '乙', '丙', '丁', '戊'].map((w, i) => word(w, '極度冷僻', `2026-10-0${i + 1}T00:00:00.000Z`)),
            { ...word('己', '不該出現', T1), status: 'dismissed' },
            { ...word('庚', '不該出現', T1), status: 'dismissed' },
        ],
    });
    const all = page.locator('#selectAll');
    await chip(page, '待審').click();
    await expect(page.locator('label.select-all')).toHaveText('全選目前篩選結果（5 列）');
    await all.check();
    await expect(page.locator('.card.group.selected')).toHaveCount(5);
    await expect(page.locator('#batchCount')).toHaveText('5');
    await expect(page.locator('#batchBar')).toHaveClass(/show/);
    await expect(page.locator('#batchBar')).toContainText('已選 5 列');

    // 取消一列 → 全選框半選、不勾
    await page.locator('.card.group').first().locator('.row-check').uncheck();
    await expect(page.locator('#batchCount')).toHaveText('4');
    expect(await all.evaluate(el => ({ checked: el.checked, ind: el.indeterminate }))).toEqual({ checked: false, ind: true });

    // 回到「全部」：被駁回的兩列沒有被選到
    await chip(page, '全部').click();
    await expect(page.locator('.card.group')).toHaveCount(7);
    await expect(page.locator('.card.group.selected')).toHaveCount(4);
    await expect(page.locator('label.select-all')).toHaveText('全選目前篩選結果（7 列）');

    // 空篩選：全選選到 0 列，批次列不顯示
    await chip(page, '已上線').click();
    await expect(page.locator('label.select-all')).toHaveText('全選目前篩選結果（0 列）');
    await expect(page.locator('#batchBar')).not.toHaveClass(/show/);
    await all.click();   // 0 列時勾不起來（check() 會抱怨狀態沒變），用 click 直接按
    await expect(page.locator('#batchCount')).toHaveText('0');
    await expect(page.locator('#batchBar')).not.toHaveClass(/show/);
    await context.close();
});

test('後台：批次核准 — 太冷僻→隱藏、不該出現→移除、讀音錯誤略過；結果行與取消選取', async ({ browser }) => {
    const { context, page, kv, calls } = await bootAdmin(browser, {
        reports: [
            word('甲', '極度冷僻', T1), word('甲', '極度冷僻', T2),
            char('長', 'ㄔㄤˊ', '不該出現', T3),
            word('乙', '讀音錯誤', T3, { suggested: 'ㄧˇ' }),
        ],
    });
    await page.locator('#selectAll').check();
    await expect(page.locator('#batchBar')).toContainText('已選 3 列');
    await batchBtn(page, '核准').click();
    await expect(page.locator('#batchResult')).toHaveText('已核准 2 列，略過 1 列（需要輸入新讀音）');
    await expect(page.locator('#batchBar')).not.toHaveClass(/show/);   // 成功後取消選取

    expect(decisions(calls)).toHaveLength(3);   // 甲 ×2 ＋ 長 ×1；乙沒送
    const by = Object.fromEntries(kvValues(kv).map(v => [`${v.word || v.char}|${v.ts}`, v]));
    expect(by[`甲|${T1}`]).toMatchObject({ status: 'agreed', action: { type: 'hide_word', word: '甲' } });
    expect(by[`甲|${T2}`]).toMatchObject({ status: 'agreed', action: { type: 'hide_word', word: '甲' } });
    expect(by[`長|${T3}`]).toMatchObject({ status: 'agreed', action: { type: 'remove_char_reading', char: '長', reading: 'ㄔㄤˊ', dict_key: 'ㄔㄤ2' } });
    expect(by[`乙|${T3}`].status).toBeUndefined();
    await context.close();
});

test('後台：全部略過 — 選到的列都要手動輸入，一筆都不送', async ({ browser }) => {
    const { context, page, calls } = await bootAdmin(browser, {
        reports: [word('乙', '讀音錯誤', T1), char('長', 'ㄔㄤˊ', '其他', T2), word('丙', '重複出現', T3)],
    });
    await page.locator('#selectAll').check();
    await batchBtn(page, '核准').click();
    await expect(page.locator('#batchResult')).toHaveText('選到的列都需要手動輸入，沒有核准任何一列');
    expect(decisions(calls)).toHaveLength(0);
    // 什麼都沒處理 → 選取還在
    await expect(page.locator('#batchCount')).toHaveText('3');
    await context.close();
});

test('後台：批次駁回 — 每一筆都記為 dismissed，結果「已駁回 {a} 列」', async ({ browser }) => {
    const { context, page, kv, calls } = await bootAdmin(browser, {
        reports: [word('甲', '極度冷僻', T1), word('甲', '極度冷僻', T2), word('乙', '讀音錯誤', T3), char('長', 'ㄔㄤˊ', '其他', T3)],
    });
    await page.locator('#selectAll').check();
    await batchBtn(page, '駁回').click();
    await expect(page.locator('#batchResult')).toHaveText('已駁回 3 列');
    expect(decisions(calls)).toHaveLength(4);
    for (const v of kvValues(kv)) expect(v.status).toBe('dismissed');
    await expect(page.locator('#batchBar')).not.toHaveClass(/show/);
    await context.close();
});

test('後台：部分失敗 — 只有失敗那一列留著選取並顯示這一列沒有存成功', async ({ browser }) => {
    const reports = [word('甲', '極度冷僻', T1), word('乙', '極度冷僻', T2), word('丙', '極度冷僻', T3)];
    const bad = kvKeyOf(1);   // 乙
    const { context, page, kv } = await bootAdmin(browser, {
        reports,
        hook: intercept('/reports/decision', (route, req) => {
            if (req.postDataJSON().kvKey !== bad) return false;
            route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' });
            return true;
        }),
    });
    await page.locator('#selectAll').check();
    await batchBtn(page, '核准').click();
    await expect(page.locator('#batchResult')).toHaveText('已處理 2 列，1 列失敗，失敗的仍保持選取，可以再按一次');
    const failed = page.locator('.card.group', { hasText: '乙' });
    await expect(failed).toHaveClass(/selected/);
    await expect(failed.locator('.row-error')).toHaveText('這一列沒有存成功，請再試一次');
    await expect(failed.locator('.action-preview')).toHaveText('待審');   // 樂觀更新已回滾
    await expect(page.locator('.card.group.selected')).toHaveCount(1);
    await expect(page.locator('#batchCount')).toHaveText('1');
    expect(JSON.parse(kv.m.get(bad)).status).toBeUndefined();
    expect(kvValues(kv).filter(v => v.status === 'agreed')).toHaveLength(2);
    await context.close();
});

test('後台：處理中 — 批次送出時受影響的列顯示處理中…、按鈕停用、選取鎖住', async ({ browser }) => {
    let release;
    const gate = new Promise(r => { release = r; });
    const { context, page } = await bootAdmin(browser, {
        reports: [word('甲', '極度冷僻', T1), word('乙', '極度冷僻', T2)],
        hook: intercept('/reports/decision', async () => { await gate; return false; }),
    });
    await page.locator('#selectAll').check();
    await batchBtn(page, '核准').click();
    const rows = page.locator('.card.group');
    await expect(rows.nth(0).locator('.action-preview')).toHaveText('處理中…');
    await expect(rows.nth(1).locator('.action-preview')).toHaveText('處理中…');
    for (const b of await rows.locator('.card-actions button').all()) await expect(b).toBeDisabled();
    for (const b of await page.locator('#batchBar button').all()) await expect(b).toBeDisabled();
    // 選取鎖住：硬送 click 也改不了
    await rows.nth(0).locator('.row-check').dispatchEvent('click');
    await expect(page.locator('#batchCount')).toHaveText('2');
    release();
    await expect(page.locator('#batchResult')).toHaveText('已核准 2 列');
    await expect(rows.nth(0).locator('.action-preview')).toContainText('等待套用');
    await context.close();
});

test('後台：空白與錯誤 — 沒有回報／篩選沒有／金鑰不對／讀取失敗／載入中', async ({ browser }) => {
    // 沒有任何回報
    let boot = await bootAdmin(browser, { reports: [] });
    await expect(boot.page.locator('#main .empty')).toContainText('目前沒有回報。');
    await expect(boot.page.locator('#main .empty .hint')).toHaveText('有新的回報時會顯示在這裡；也可以按「重新載入」。');
    await boot.context.close();

    // 篩選下沒有
    boot = await bootAdmin(browser, { reports: [word('甲', '極度冷僻', T1)] });
    await chip(boot.page, '已上線').click();
    await expect(boot.page.locator('#main .empty')).toHaveText('這個篩選下沒有回報（改選「全部」看看）');
    await expect(boot.page.locator('label.select-all')).toHaveText('全選目前篩選結果（0 列）');
    await boot.context.close();

    // 金鑰不對（403）與沒填金鑰
    boot = await bootAdmin(browser, { reports: [word('甲', '極度冷僻', T1)], key: 'wrong' });
    await expect(boot.page.locator('#main .empty.error')).toContainText('金鑰不對或還沒填，請確認後再按「重新載入」');
    await boot.context.close();
    boot = await bootAdmin(browser, { reports: [], key: null, wait: false });
    await boot.page.locator('#reloadBtn').click();
    await expect(boot.page.locator('#main .empty.error')).toContainText('金鑰不對或還沒填，請確認後再按「重新載入」');
    expect(boot.calls).toHaveLength(0);
    await boot.context.close();

    // 讀取失敗（5xx）：附狀態碼
    boot = await bootAdmin(browser, {
        reports: [], hook: intercept('/reports.json', route => { route.fulfill({ status: 503, body: 'down' }); return true; }),
    });
    await expect(boot.page.locator('#main .empty.error')).toContainText('讀不到回報，請檢查網路後再按「重新載入」');
    await expect(boot.page.locator('#main .empty.error .hint')).toHaveText('(503)');
    await boot.context.close();

    // 載入中：顯示載入中…、🔄 停用；回來後恢復
    let release;
    const gate = new Promise(r => { release = r; });
    boot = await bootAdmin(browser, {
        reports: [word('甲', '極度冷僻', T1)], wait: false,
        hook: intercept('/reports.json', async () => { await gate; return false; }),
    });
    await expect(boot.page.locator('#main .empty')).toHaveText('載入中…');
    await expect(boot.page.locator('#reloadBtn')).toBeDisabled();
    release();
    await expect(boot.page.locator('.card.group')).toHaveCount(1);
    await expect(boot.page.locator('#reloadBtn')).toBeEnabled();
    await boot.context.close();
});

test('後台：次數 — ×1 照樣顯示、×100 不撐壞標題列、超過 20 筆原文有捲動上限、截斷時提示只載入最新 800 筆', async ({ browser }) => {
    // 801 筆 → Worker 只回最新 800 筆並帶截斷標頭；分成 8 個詞，每詞約 100 筆
    const reports = Array.from({ length: 801 }, (_, i) => word(`詞${i % 8}`, '極度冷僻', new Date(Date.UTC(2026, 9, 1) + i * 60000).toISOString()));
    reports.push(word('單', '不該出現', T1));   // 鍵最大的是最後一筆，不會被截掉
    const { context, page } = await bootAdmin(browser, { reports });
    await expect(page.locator('.notice')).toHaveText('只載入最新 800 筆');
    const big = page.locator('.card.group').filter({ hasText: '詞0' }).first();
    await expect(big.locator('.count-pill')).toHaveText('×100');
    await expect(big.locator('.count-pill')).toHaveClass(/many/);
    const header = await big.locator('.card-header').evaluate(el => ({ sw: el.scrollWidth, cw: el.clientWidth }));
    expect(header.sw).toBeLessThanOrEqual(header.cw + 1);
    await big.locator('.row-toggle').click();
    expect(await big.locator('.row-originals').evaluate(el => ({ cls: el.className, max: getComputedStyle(el).maxHeight, oy: getComputedStyle(el).overflowY }))).toMatchObject({ max: '320px', oy: 'auto' });
    await expect(page.locator('.card.group').filter({ hasText: '單' }).locator('.count-pill')).toHaveText('×1');
    await context.close();
});

test('後台：排序 — 待審在前，再依最新時間新到舊，同時間依主題字串排；混合狀態顯示各狀態筆數', async ({ browser }) => {
    const { context, page } = await bootAdmin(browser, {
        reports: [
            word('甲', '極度冷僻', T1),
            word('乙', '極度冷僻', T2),
            agreed(word('丙', '極度冷僻', T3), hideWord('丙')),
            word('丁', '不該出現', T2),
            word('戊', '極度冷僻', T1), agreed(word('戊', '極度冷僻', T1), hideWord('戊')), agreed(word('戊', '極度冷僻', T1), hideWord('戊')),
        ],
    });
    // 戊 最新時間 T1：待審的有 丁、乙(T2)、甲、戊(T1)；已核准的 丙 在最後
    expect(await visibleWords(page)).toEqual(['丁', '乙', '戊', '甲', '丙']);
    const mixed = page.locator('.card.group', { hasText: '戊' });
    await expect(mixed.locator('.action-preview')).toHaveText('待審 1 · 已核准 2');
    await expect(mixed.locator('.count-pill')).toHaveText('×3');
    await context.close();
});

test('後台：統計 — 共 N 組（M 筆）· 待審 · 已核准未套用 · 已上線 · 已封存', async ({ browser }) => {
    const { context, page } = await bootAdmin(browser, {
        reports: [
            word('甲', '極度冷僻', T1), word('甲', '極度冷僻', T2), word('乙', '不該出現', T3),
            agreed(word('丙', '極度冷僻', T1), hideWord('丙')),
            { ...word('丁', '不該出現', T1), status: 'dismissed' },
            { ...word('戊', '極度冷僻', T1), status: 'archived' },
        ],
    });
    await expect(page.locator('#statsLabel')).toHaveText('共 5 組（6 筆）· 待審 2 · 已核准未套用 1 · 已上線 0 · 已封存 1');
    await expect(page.locator('#archivedCount')).toHaveText('1');
    await context.close();
});
