// 後台（admin/index.html）瀏覽器測試：Worker 程式碼真的在測試程序內跑（bridgeWorker＋FakeKV），只假上游
import { test, expect } from '@playwright/test';
import { CONTEXT_OPTS, BASE, routeExternal, collectErrors } from './helpers.mjs';
import { FakeKV, makeEnv, bridgeWorker } from './worker-helpers.mjs';
import { DEVICES, auditTouchTargets, auditVisibleControls, rectsOverlap } from './layout-lib.mjs';
import { readFileSync } from 'node:fs';
import worker from '../worker/src/index.js';

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
    const dialogs = [];   // 所有跳出過的對話框訊息（XSS 測試用來確認 alert 沒有被觸發）
    page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
    await page.goto('/admin/index.html');
    if (wait) await page.waitForSelector('#main[data-state="ok"], #main[data-state="error"]');
    return { context, page, kv, env, calls, errors, offOrigin, dialogs };
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
    expect([...paths].sort()).toEqual(['/corrections/admin.json', '/reports.json', '/reports/decision', '/reports/delete']);
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
const agreed = (r, action) => ({ ...r, status: 'agreed', decided_at: '2026-10-09T00:00:00.000Z', decided_by: 'admin', action });
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

// ===== Task 3：防注入、靜態掃描、手機版面、新顏色 =====
const ADMIN_SRC = readFileSync(new URL('../admin/index.html', import.meta.url), 'utf8');
const XSS_WORD = '<img src=x onerror=alert(1)>';
const XSS_CHAR = '"><svg onload=alert(2)>';

test('後台：XSS — 使用者字串一律當文字，沒有 img／svg 元素、沒有對話框', async ({ browser }) => {
    const { context, page, dialogs, errors, calls } = await bootAdmin(browser, {
        reports: [
            word(XSS_WORD, '極度冷僻', T1, { note: XSS_WORD, suggested: XSS_CHAR }),
            word(XSS_WORD, '極度冷僻', T2, { note: XSS_CHAR }),
            char(XSS_CHAR, 'ㄇㄚ', '不該出現', T3, { note: XSS_WORD }),
            feedback(XSS_WORD, XSS_CHAR, T3),
            { type: 'ai-word-suggest', word: XSS_WORD, action: 'accept', ts: T2 },
        ],
    });
    const w = rowOf(page, XSS_WORD, '極度冷僻');
    await expect(w.locator('.card-word')).toHaveText(XSS_WORD);
    await w.locator('.row-toggle').click();
    await expect(w.locator('.row-originals')).toContainText(XSS_WORD);
    await expect(w.locator('.row-originals')).toContainText(XSS_CHAR);
    await expect(page.locator('.card.group', { hasText: '不該出現' }).locator('.card-char')).toHaveText(XSS_CHAR);
    await expect(page.locator('.card.group', { hasText: '一般回饋' }).locator('.card-subject')).toHaveText(XSS_WORD);

    // 核准後預覽文字、aria-label 也都是文字
    await w.getByRole('button', { name: /^核准「/ }).click();
    await expect(w.locator('.action-preview')).toContainText(`隱藏「${XSS_WORD}」`);
    expect(decisions(calls)).toHaveLength(2);
    await page.locator('#showArchived').check();
    await page.waitForTimeout(200);

    await expect(page.locator('#main img, #main svg')).toHaveCount(0);
    await expect(page.locator('[onerror], [onload]')).toHaveCount(0);
    expect(dialogs).toEqual([]);
    expect(errors).toEqual([]);
    await context.close();
});

test('後台：靜態掃描 — 沒有用範本字串拼出來的 on* 屬性、網址不帶金鑰', () => {
    expect(ADMIN_SRC.match(/on[a-z]+="[^"]*\$\{/g)).toBeNull();
    expect(ADMIN_SRC).not.toMatch(/encodeURIComponent\(key\)/);
    expect(ADMIN_SRC).not.toMatch(/[?&]key=/);
    // 範本裡剩下的行內事件都是固定字串（頂列、批次列、編輯面板、新增視窗）
    const handlers = [...ADMIN_SRC.matchAll(/\son[a-z]+="([^"]*)"/g)].map(m => m[1]);
    expect(handlers.length).toBeGreaterThan(0);
    for (const h of handlers) expect(h, h).toMatch(/^[\w.()'=!&|; ,]+$/);
});

test('後台：字級與字重 — 新規則只用 0.75／0.875／1.125／1.5rem 與 400／700，膠囊內距 4px 8px', () => {
    const css = ADMIN_SRC.slice(ADMIN_SRC.indexOf('/* ── Phase 7：合併列'), ADMIN_SRC.indexOf('</style>', ADMIN_SRC.indexOf('/* ── Phase 7：合併列')));
    expect(css.length).toBeGreaterThan(500);
    const sizes = [...css.matchAll(/font-size:\s*([^;}]+)/g)].map(m => m[1].trim());
    const weights = [...css.matchAll(/font-weight:\s*([^;}]+)/g)].map(m => m[1].trim());
    expect(sizes.length).toBeGreaterThan(10);
    for (const v of sizes) expect(['0.75rem', '0.875rem', '1.125rem', '1.5rem'], `font-size ${v}`).toContain(v);
    for (const v of weights) expect(['400', '700'], `font-weight ${v}`).toContain(v);
    for (const sel of ['.count-pill', '.mini-badge']) {
        const block = css.match(new RegExp(sel.replace('.', '\\.') + '\\s*\\{([^}]*)\\}'))[1];
        expect(block, sel).toContain('padding: 4px 8px');
    }
    expect(css).not.toMatch(/@keyframes/);
});

test('後台：手機 — 390 寬不橫向捲動，標題列換行、時間在標題下面，新控制項 ≥ 44px，批次列貼底', async ({ browser }) => {
    const { context, page } = await bootAdmin(browser, {
        device: DEVICES.phone,
        reports: [
            word('二心', '極度冷僻', T1), word('二心', '極度冷僻', T3),
            word('三心三心三心三心三心三心三心三心三心三心三心三心', '不該出現', T2),
            char('長', 'ㄔㄤˊ', '讀音錯誤', T2),
            feedback('希望加字', '可以加一個字嗎', T3),
            { type: 'ai-word-suggest', word: '晨曦', action: 'accept', ts: T1 },
        ],
    });
    const noScroll = () => page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    let m = await noScroll();
    expect(m.sw).toBeLessThanOrEqual(m.cw + 1);

    // 標題列換行：時間掉到標題下面
    const row = rowOf(page, '二心', '極度冷僻');
    const head = await row.locator('.card-word').boundingBox();
    const time = await row.locator('.card-header .card-time').boundingBox();
    expect(time.y).toBeGreaterThanOrEqual(head.y + head.height - 1);
    const top = await page.locator('.topbar').evaluate(el => ({ sw: el.scrollWidth, cw: el.clientWidth }));
    expect(top.sw).toBeLessThanOrEqual(top.cw + 1);

    // 選兩列 → 批次列出現；展開一列讓展開鈕與原文也在畫面裡
    await row.locator('.row-check').click();
    await page.locator('.card.group', { hasText: '長' }).locator('.row-check').click();
    await row.locator('.row-toggle').click();
    await expect(page.locator('#batchBar')).toHaveClass(/show/);
    m = await noScroll();
    expect(m.sw).toBeLessThanOrEqual(m.cw + 1);

    const audit = await auditTouchTargets(page, { mustSee: ['.row-check', '.row-toggle', '.filter-row button', '#batchBar .btn', '.card-actions .btn'] });
    expect(audit.missing, '沒掃到的控制項').toEqual([]);
    expect(audit.failures, '小於 44px 的控制項').toEqual([]);
    // 相鄰間距：auditTouchTargets 的 overlaps 把每個元素捲到不同位置才量、座標又不含頁面捲動量，
    // 整頁會捲動的後台會誤報；改成一段一段捲動，在「同一刻」量可見控制項的框，每個框外擴 2px 後不可互相重疊（= 間距 ≥ 4px）
    const pageH = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < pageH; y += 500) {
        await page.evaluate(v => window.scrollTo(0, v), y);
        // 貼底的批次列、黏在上面的套用列都蓋在內容上面，各是一層：頁面控制項彼此比、批次列按鈕彼此比、套用列按鈕彼此比
        for (const root of ['.topbar, #main', '#batchBar', '.apply-bar']) {
            const boxes = (await auditVisibleControls(page, root)).filter(b => (root === '.apply-bar') === /apply/.test(b.name));
            const grow = b => ({ x: b.x - 2, y: b.y - 2, width: b.width + 4, height: b.height + 4 });
            for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
                expect(rectsOverlap(grow(boxes[i]), grow(boxes[j])), `捲到 ${y}：${boxes[i].name} 與 ${boxes[j].name} 間距不到 4px`).toBe(false);
            }
        }
    }

    // 批次列貼在視窗最下面、左右撐滿
    const bar = await page.locator('#batchBar').evaluate(el => { const r = el.getBoundingClientRect(); return { bottom: r.bottom, left: r.left, right: r.right, ih: innerHeight, iw: innerWidth }; });
    expect(Math.abs(bar.bottom - bar.ih)).toBeLessThanOrEqual(0.5);
    expect(bar.left).toBeLessThanOrEqual(0.5);
    expect(Math.abs(bar.right - bar.iw)).toBeLessThanOrEqual(0.5);
    await context.close();
});

// 對比：文字色與「實際底色」（沿著祖先把半透明底色疊起來）
const contrastOf = (page, selector, tint = null) => page.evaluate(({ selector, tint }) => {
    const parse = c => { const n = (c.match(/[\d.]+/g) || []).map(Number); return { r: n[0], g: n[1], b: n[2], a: n[3] ?? 1 }; };
    const over = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
    const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
    const el = document.querySelector(selector);
    if (!el) return { missing: selector };
    const layers = [];
    for (let n = el; n; n = n.parentElement) {
        const bg = parse(getComputedStyle(n).backgroundColor);
        if (bg.a > 0) layers.push(bg);
        if (bg.a === 1) break;
    }
    let bg = layers.pop() || { r: 255, g: 255, b: 255, a: 1 };
    if (bg.a < 1) bg = over(bg, { r: 255, g: 255, b: 255, a: 1 });
    while (layers.length) bg = over(layers.pop(), bg);
    if (tint) bg = over(tint, bg);
    const fg = over(parse(getComputedStyle(el).color), bg);
    const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
    return { ratio: (a + 0.05) / (b + 0.05) };
}, { selector, tint });

test('後台：顏色 — 新變數在亮暗兩個主題都有，文字對比 ≥ 4.5', async ({ browser }) => {
    const { context, page } = await bootAdmin(browser, {
        reports: [
            ...Array.from({ length: 3 }, (_, i) => word('二心', '極度冷僻', `2026-10-0${i + 1}T00:00:00.000Z`, { note: '備註文字' })),
            word('三心', '不該出現', T2),
        ],
        hook: intercept('/reports.json', async (route, req) => false),
    });
    const props = ['--action-bg', '--action-bg-hover', '--info-text', '--ok-text', '--err-text', '--warn-text'];
    const readVars = () => page.evaluate(ps => Object.fromEntries(ps.map(p => [p, getComputedStyle(document.documentElement).getPropertyValue(p).trim()])), props);
    const row = rowOf(page, '二心', '極度冷僻');
    await row.locator('.row-toggle').click();
    // 探測用元素：失敗列的錯誤文字與提示條平常不一定在畫面上，塞進去量 CSS 就好
    await page.evaluate(() => {
        document.querySelector('.card.group').insertAdjacentHTML('beforeend', '<div class="row-error" id="probeErr">err</div>');
        document.getElementById('main').insertAdjacentHTML('afterbegin', '<div class="notice warn" id="probeWarn">warn</div>');
    });
    const targets = [
        ['.row-originals .card-text:not(.no-note)', null], ['.row-originals .card-text.no-note', null], ['.count-pill.many', null], ['.chip:not(.active)', null], ['.chip.active', null],
        ['.manual-note, .row-toggle', null], ['#probeErr', null], ['#probeWarn', { r: 217, g: 119, b: 6, a: 0.12 }],
    ];
    const expectVars = {
        light: { '--action-bg': '#5a67d8', '--action-bg-hover': '#4c51bf', '--info-text': '#4c51bf', '--ok-text': '#276749', '--err-text': '#9b2c2c', '--warn-text': '#92400e' },
        dark: { '--action-bg': '#5a67d8', '--action-bg-hover': '#4c51bf', '--info-text': '#a3bffa', '--ok-text': '#68d391', '--err-text': '#fc8181', '--warn-text': '#f6ad55' },
    };
    for (const theme of ['light', 'dark']) {
        await page.evaluate(t => { if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark'); else document.documentElement.removeAttribute('data-theme'); }, theme);
        expect(await readVars(), theme).toEqual(expectVars[theme]);
        for (const [sel, tint] of targets) {
            const r = await contrastOf(page, sel, tint);
            expect(r.missing, `${theme} 找不到 ${sel}`).toBeUndefined();
            expect(r.ratio, `${theme} ${sel}`).toBeGreaterThanOrEqual(4.5);
        }
    }
    await context.close();
});

// ===== 07-07 Task 1：套用到線上、撤回 =====
const hideChar = (c, reading) => ({ type: 'remove_char_reading', char: c, dict_key: reading.replace('ˊ', '2'), reading });
// 已核准、還沒套用的四筆：二心 ×3（隱藏詞）＋ 長 ×1（移除讀音）
const approvedFour = () => [
    agreed(word('二心', '極度冷僻', T1), hideWord('二心')), agreed(word('二心', '極度冷僻', T2), hideWord('二心')), agreed(word('二心', '極度冷僻', T3), hideWord('二心')),
    agreed(char('長', 'ㄔㄤˊ', '不該出現', T3), hideChar('長', 'ㄔㄤˊ')),
];
const layerDoc = env => JSON.parse(env.AI_STATE_KV.m.get('corrections:v1'));
const applyCalls = calls => calls.filter(c => c.path === '/corrections/apply');
const publicView = async env => (await worker.fetch(new Request('https://lucky-hawaii.is3000dollar.workers.dev/corrections.json', { headers: { Origin: BASE } }), env, { waitUntil() {} })).json();

test('後台：套用 — 一次送出全部已核准的四筆（只有 kvKey 和 rev），三筆二心合成一條，列變已上線，線上公開讀得到', async ({ browser }) => {
    const { context, page, env, calls, errors } = await bootAdmin(browser, { reports: approvedFour() });
    await expect(page.locator('.apply-summary')).toHaveText('線上修正層：0 筆 · 等待套用：4 筆');
    await expect(page.locator('.apply-note')).toHaveText('按下後約 1～2 分鐘內生效（網站重新整理就會看到）');
    await expect(page.locator('#applyBtn')).toHaveText('🚀 套用到線上（4）');
    await expect(page.locator('#applyBtn')).toBeEnabled();

    await page.locator('#applyBtn').click();
    await expect(page.locator('.apply-line.ok')).toHaveText('已套用 4 筆。約 1～2 分鐘內生效，網站重新整理就會看到。');
    // 只送一次；內容只有 kvKey 和 baseRev，沒有 action 之類的欄位（不能用 client 的內容改線上）
    expect(applyCalls(calls)).toHaveLength(1);
    const body = JSON.parse(applyCalls(calls)[0].body);
    expect(Object.keys(body).sort()).toEqual(['baseRev', 'kvKeys']);
    expect(body.baseRev).toBe(0);
    expect([...body.kvKeys].sort()).toEqual([0, 1, 2, 3].map(kvKeyOf));
    // 修正層：兩條（三筆二心合成一條）
    const doc = layerDoc(env);
    expect(doc.entries).toHaveLength(2);
    expect(doc.entries.map(e => e.source_kvKeys.length).sort()).toEqual([1, 3]);

    await expect(page.locator('.apply-summary')).toHaveText('線上修正層：2 筆 · 等待套用：0 筆');
    await expect(page.locator('#applyBtn')).toBeDisabled();
    const row = rowOf(page, '二心', '極度冷僻');
    await expect(row.locator('.action-preview')).toContainText('🚀 已上線 · 🙈 隱藏「二心」 · 套用於 ');
    await expect(row.getByRole('button', { name: /^從線上撤回「/ })).toHaveText('撤回');
    await expect(row.getByRole('button', { name: '改回待審' })).toHaveCount(0);
    // 網站讀得到
    expect((await publicView(env)).wordlist.hidden).toEqual(['二心']);
    expect(errors).toEqual([]);
    await context.close();
});

test('後台：撤回 — 一鍵撤回二心，列回到已核准未套用，等待套用變 3，線上不再隱藏', async ({ browser }) => {
    const { context, page, env, calls } = await bootAdmin(browser, { reports: approvedFour() });
    await page.locator('#applyBtn').click();
    await expect(page.locator('.apply-line.ok')).toBeVisible();
    const id = layerDoc(env).entries.find(e => e.target === 'wordlist').id;

    const row = rowOf(page, '二心', '極度冷僻');
    await row.getByRole('button', { name: /^從線上撤回「/ }).click();
    await expect(page.locator('.apply-line.neutral')).toHaveText('已撤回「二心」，約 1～2 分鐘內從線上移除');
    const revokes = calls.filter(c => c.path === '/corrections/revoke');
    expect(revokes).toHaveLength(1);
    expect(JSON.parse(revokes[0].body)).toEqual({ ids: [id], baseRev: 1 });
    await expect(row.locator('.action-preview')).toContainText('（等待套用）');
    await expect(row.getByRole('button', { name: '改回待審' })).toBeVisible();
    await expect(page.locator('.apply-summary')).toHaveText('線上修正層：1 筆 · 等待套用：3 筆');
    await expect(page.locator('#applyBtn')).toHaveText('🚀 套用到線上（3）');
    expect((await publicView(env)).wordlist.hidden).toEqual([]);
    await context.close();
});

// ===== 07-07 Task 2：失敗原因、409／503、重按、超過 500 筆、已寫入、有效讀音 =====
// 預檢請求（OPTIONS）放給 Worker 橋處理，其餘才交給 fn；fn 回 true 表示自己處理了
const except = (pathname, fn) => intercept(pathname, (route, req) => (req.method() === 'OPTIONS' ? false : fn(route, req)));
const fakeRes = (status, body = {}) => route => { route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': BASE }, body: JSON.stringify(body) }); return true; };
const hooks = (...hs) => async ctx => { for (const h of hs) await h(ctx); };
const seedLayer = (entries, extra = {}) => ({ AI_STATE_KV: new FakeKV({ 'corrections:v1': JSON.stringify({ version: 1, rev: 3, updated_at: null, entries, written: [], ...extra }) }) });
const entryFor = (i, kvKey) => ({ id: `c_${i}`, target: 'wordlist', bucket: 'hidden', value: `詞${i}`, source_kvKeys: [kvKey ?? `seed${i}`], applied_at: '2026-10-09T01:00:00.000Z' });
const manyEntries = n => Array.from({ length: n }, (_, i) => entryFor(i));
const oneApproved = () => [agreed(word('二心', '極度冷僻', T1), hideWord('二心'))];
const applyBtn = page => page.locator('#applyBtn');

test('後台：套用失敗 — 金鑰不對／網路不通／伺服器回應 503 各有白話原因，狀態不變，套用重新可按，再按就成功', async ({ browser }) => {
    let mode = '403';
    const { context, page, env } = await bootAdmin(browser, {
        reports: approvedFour(),
        hook: except('/corrections/apply', (route, req) => {
            if (mode === '403') return fakeRes(403, { ok: false })(route);
            if (mode === 'abort') { route.abort(); return true; }
            if (mode === '503') return fakeRes(503, { ok: false, code: 'KV_BUSY' })(route);
            return false;
        }),
    });
    const err = page.locator('.apply-line.err');
    for (const [m, reason] of [['403', '金鑰不對'], ['abort', '網路不通'], ['503', '伺服器回應 503']]) {
        mode = m;
        await applyBtn(page).click();
        await expect(err).toHaveText(`套用沒有成功：${reason}。已核准的內容都還在，可以直接再按一次。`);
        await expect(applyBtn(page)).toBeEnabled();
        await expect(applyBtn(page)).toHaveText('🚀 套用到線上（4）');
        await expect(page.locator('.apply-summary')).toHaveText('線上修正層：0 筆 · 等待套用：4 筆');
        await expect(rowOf(page, '二心', '極度冷僻').locator('.action-preview')).toContainText('（等待套用）');
        expect(env.AI_STATE_KV.m.has('corrections:v1')).toBe(false);
    }
    mode = 'ok';
    await applyBtn(page).click();
    await expect(page.locator('.apply-line.ok')).toBeVisible();
    await expect(err).toHaveCount(0);
    expect(layerDoc(env).entries).toHaveLength(2);
    await context.close();
});

test('後台：409 — 修正層在別處變動過，套用顯示請重新載入，不寫入；重新載入後可以套用', async ({ browser }) => {
    let stale = true;
    // 線上 rev 是 5，頁面讀到的卻是舊的 4
    const { context, page, env, calls } = await bootAdmin(browser, {
        reports: oneApproved(), env: seedLayer([], { rev: 5 }),
        hook: except('/corrections/admin.json', (route, req) => (stale && req.method() === 'GET'
            ? fakeRes(200, { ok: true, version: 1, rev: 4, updated_at: null, entries: [], written: [], view: null })(route) : false)),
    });
    await applyBtn(page).click();
    await expect(page.locator('.apply-line.err')).toHaveText('線上修正層剛剛有變動，請按「重新載入」後再套用');
    expect(JSON.parse(applyCalls(calls)[0].body).baseRev).toBe(4);
    expect(layerDoc(env).entries).toHaveLength(0);
    await expect(applyBtn(page)).toBeEnabled();
    stale = false;
    await page.locator('#reloadBtn').click();
    await expect(page.locator('.apply-line')).toHaveCount(0);   // 重新載入清掉舊訊息
    await applyBtn(page).click();
    await expect(page.locator('.apply-line.ok')).toBeVisible();
    expect(layerDoc(env).entries).toHaveLength(1);
    await context.close();
});

test('後台：重按 — 送出中只有一個請求、列顯示處理中…、選取鎖住；成功後同樣的 kvKey 再送一次不會多出條目', async ({ browser }) => {
    let release;
    const gate = new Promise(r => { release = r; });
    const { context, page, env, calls } = await bootAdmin(browser, {
        reports: approvedFour(),
        hook: except('/corrections/apply', async () => { await gate; return false; }),
    });
    await applyBtn(page).dblclick();
    await expect(applyBtn(page)).toHaveText('套用中…');
    await expect(applyBtn(page)).toBeDisabled();
    await applyBtn(page).dispatchEvent('click');   // 硬送一次也不會多送
    for (const r of await page.locator('.card.group').all()) await expect(r.locator('.action-preview')).toHaveText('處理中…');
    for (const b of await page.locator('.card-actions button').all()) await expect(b).toBeDisabled();
    for (const b of await page.locator('#batchBar button').all()) await expect(b).toBeDisabled();
    await page.locator('.card.group').first().locator('.row-check').dispatchEvent('click');
    await expect(page.locator('#batchBar')).not.toHaveClass(/show/);
    release();
    await expect(page.locator('.apply-line.ok')).toBeVisible();
    expect(applyCalls(calls)).toHaveLength(1);

    // 逾時後重按：同一批 kvKey 再送，Worker 說已套用過，修正層不變
    const again = await page.evaluate(async keys => {
        const res = await adminFetch('/corrections/apply', jsonPost({ kvKeys: keys, baseRev: layer.rev }));
        return { status: res.status, body: await res.json() };
    }, [0, 1, 2, 3].map(kvKeyOf));
    expect(again.status).toBe(200);
    expect(again.body.skipped.map(s => s.reason)).toEqual(['already_applied', 'already_applied', 'already_applied', 'already_applied']);
    expect(layerDoc(env).entries).toHaveLength(2);
    await context.close();
});

test('後台：套用部分略過 — Worker 不收的那筆仍留在等待套用，訊息說明', async ({ browser }) => {
    const { context, page } = await bootAdmin(browser, {
        reports: [agreed(word('甲', '極度冷僻', T1), hideWord('甲')), agreed(word('<x>', '極度冷僻', T2), hideWord('<x>'))],
    });
    await applyBtn(page).click();
    await expect(page.locator('.apply-line.ok')).toHaveText('已套用 1 筆。約 1～2 分鐘內生效，網站重新整理就會看到。另有 1 筆沒有套用（內容不符規則），仍留在等待套用。');
    await expect(page.locator('.apply-summary')).toHaveText('線上修正層：1 筆 · 等待套用：1 筆');
    await context.close();
});

test('後台：超過 500 筆 — 剛好 500 筆沒有提示，501 筆出現琥珀色提示且套用仍可按', async ({ browser }) => {
    let boot = await bootAdmin(browser, { reports: oneApproved(), env: seedLayer(manyEntries(500)) });
    await expect(boot.page.locator('.apply-summary')).toHaveText('線上修正層：500 筆 · 等待套用：1 筆');
    await expect(boot.page.locator('.apply-line.warn')).toHaveCount(0);
    await boot.context.close();

    boot = await bootAdmin(browser, { reports: oneApproved(), env: seedLayer(manyEntries(501)) });
    await expect(boot.page.locator('.apply-line.warn')).toHaveText('修正層已經有 501 筆（超過 500 筆）。建議先跑寫回腳本 npm run corrections:writeback，把修正寫進 data。仍然可以繼續套用。');
    await expect(applyBtn(boot.page)).toBeEnabled();
    await boot.context.close();
});

test('後台：讀取失敗 — 修正層讀不到時顯示讀取失敗與重試，套用停用；重試成功後恢復；沒有回報時套用列仍在', async ({ browser }) => {
    let down = true;
    const { context, page } = await bootAdmin(browser, {
        reports: oneApproved(),
        hook: except('/corrections/admin.json', route => (down ? fakeRes(503, { ok: false })(route) : false)),
    });
    await expect(page.locator('.apply-summary')).toContainText('線上修正層：讀取失敗');
    const retry = page.getByRole('button', { name: '重新讀取線上修正層' });
    await expect(retry).toHaveText('重試');
    await expect(applyBtn(page)).toBeDisabled();
    await expect(page.locator('.apply-line.err')).toHaveText('讀不到線上修正層，請檢查網路或金鑰後按「重試」');
    down = false;
    await retry.click();
    await expect(page.locator('.apply-summary')).toHaveText('線上修正層：0 筆 · 等待套用：1 筆');
    await expect(page.locator('.apply-line')).toHaveCount(0);
    await expect(applyBtn(page)).toBeEnabled();
    await context.close();

    // 沒有等待套用的項目、甚至沒有任何回報：套用列照樣在，按鈕停用
    const empty = await bootAdmin(browser, { reports: [] });
    await expect(empty.page.locator('.apply-note')).toHaveText('沒有等待套用的核准項目');
    await expect(applyBtn(empty.page)).toBeDisabled();
    await expect(applyBtn(empty.page)).toHaveText('🚀 套用到線上（0）');
    await empty.context.close();
});

test('後台：已寫入資料檔 — 在 written 清單裡的列顯示已寫入資料檔、歸已上線篩選、沒有撤回，也不算等待套用', async ({ browser }) => {
    const reports = [agreed(word('二心', '極度冷僻', T1), hideWord('二心')), agreed(word('三心', '極度冷僻', T2), hideWord('三心'))];
    const { context, page } = await bootAdmin(browser, { reports, env: seedLayer([], { written: [kvKeyOf(0)] }) });
    const done = rowOf(page, '二心', '極度冷僻');
    await expect(done.locator('.action-preview')).toHaveText('✓ 已寫入資料檔');
    await expect(done.getByRole('button', { name: /撤回/ })).toHaveCount(0);
    await expect(page.locator('.apply-summary')).toHaveText('線上修正層：0 筆 · 等待套用：1 筆');
    await chip(page, '已上線').click();
    expect(await visibleWords(page)).toEqual(['二心']);
    await context.close();
});

test('後台：備註 — 核准的備註是已處理，不算等待套用', async ({ browser }) => {
    const { context, page } = await bootAdmin(browser, {
        reports: [agreed(feedback('想法', '內容', T1), { type: 'note', text: '之後再看' })],
    });
    const row = page.locator('.card.group', { hasText: '想法' });
    await expect(row.locator('.action-preview')).toHaveText('✓ 📝 備註：之後再看');
    await expect(page.locator('.apply-summary')).toHaveText('線上修正層：0 筆 · 等待套用：0 筆');
    await expect(applyBtn(page)).toBeDisabled();
    await chip(page, '已核准未套用').click();
    await expect(page.locator('.card.group')).toHaveCount(0);
    await context.close();
});

test('後台：撤回已不在 — 修正已不在線上時說明原因，頁面維持原樣直到重新載入', async ({ browser }) => {
    const { context, page, env } = await bootAdmin(browser, { reports: oneApproved() });
    await applyBtn(page).click();
    await expect(page.locator('.apply-line.ok')).toBeVisible();
    // 修正在別處被拿掉了，但版本沒變（所以 Worker 回 404 而不是 409）
    const doc = layerDoc(env); doc.entries = [];
    env.AI_STATE_KV.m.set('corrections:v1', JSON.stringify(doc));
    const row = rowOf(page, '二心', '極度冷僻');
    await row.getByRole('button', { name: /^從線上撤回「/ }).click();
    await expect(page.locator('.apply-line.err')).toHaveText('這筆修正已不在線上（可能已撤回或已寫入資料檔），請重新載入');
    await expect(row.locator('.action-preview')).toContainText('已上線');
    await expect(page.locator('.apply-summary')).toHaveText('線上修正層：1 筆 · 等待套用：0 筆');
    await page.locator('#reloadBtn').click();
    await expect(row.locator('.action-preview')).toContainText('（等待套用）');
    await context.close();
});

test('後台：有效讀音 — 取代讀音的下拉選單看得到修正層：被隱藏的讀音不再出現，連鎖修正後的讀音出現', async ({ browser }) => {
    const hidden = { id: 'c_1', target: 'rhymeDict', bucket: 'hidden', value: { char: '長', dict_key: 'ㄔㄤ2', reading: 'ㄔㄤˊ' }, source_kvKeys: ['x1'], applied_at: '2026-10-09T01:00:00.000Z' };
    const fixed = { id: 'c_2', target: 'rhymeDict', bucket: 'fixed', value: { char: '長', from: 'ㄓㄤ3', to: 'ㄓㄤ4' }, source_kvKeys: ['x2'], applied_at: '2026-10-09T01:00:00.000Z' };
    const reports = [char('長', 'ㄔㄤˊ', '建議讀音', T1, { suggested: 'ㄏㄜˊ' })];
    const options = async env => {
        const { context, page } = await bootAdmin(browser, { reports, env });
        await page.getByRole('button', { name: '✏️ 取代舊讀音' }).click();
        await page.locator('#editSelect').waitFor();
        const opts = await page.locator('#editSelect option').allTextContents();
        await context.close();
        return opts;
    };
    expect(await options({})).toEqual(expect.arrayContaining(['ㄔㄤˊ', 'ㄓㄤˇ']));
    const withLayer = await options(seedLayer([hidden, fixed]));
    expect(withLayer).not.toContain('ㄔㄤˊ');
    expect(withLayer).not.toContain('ㄓㄤˇ');
    expect(withLayer).toContain('ㄓㄤˋ');
});

test('CR-02：舊的「匯出 agreed」產生 .py 腳本的功能已移除（有程式碼注入風險，路徑也不存在，由 tools/corrections/writeback.py 取代）', async ({ browser }) => {
    const boot = await bootAdmin(browser, { reports: oneApproved() });
    await expect(boot.page.locator('#exportBtn')).toHaveCount(0);
    await expect(boot.page.locator('.topbar')).not.toContainText('匯出');
    await boot.context.close();
    for (const dead of ['exportChanges', 'apply_changes', 'DEFAULT_BASE', 'text/x-python']) expect(ADMIN_SRC, dead).not.toContain(dead);
});

test('後台：手機錯誤行 — 390 寬最長的失敗行與超過 500 筆提示在套用列內換行，不蓋到套用按鈕', async ({ browser }) => {
    const { context, page } = await bootAdmin(browser, {
        device: DEVICES.phone, reports: oneApproved(), env: seedLayer(manyEntries(501)),
        hook: except('/corrections/apply', fakeRes(503, { ok: false })),
    });
    await applyBtn(page).click();
    await expect(page.locator('.apply-line.err')).toBeVisible();
    await expect(page.locator('.apply-line.warn')).toBeVisible();
    const bar = await page.locator('.apply-bar').boundingBox();
    const btn = await applyBtn(page).boundingBox();
    for (const sel of ['.apply-line.err', '.apply-line.warn', '.apply-text']) {
        const b = await page.locator(sel).boundingBox();
        expect(b.x, sel).toBeGreaterThanOrEqual(bar.x - 0.5);
        expect(b.x + b.width, sel).toBeLessThanOrEqual(bar.x + bar.width + 0.5);
        expect(rectsOverlap(b, btn), `${sel} 蓋到套用按鈕`).toBe(false);
    }
    expect(btn.height).toBeGreaterThanOrEqual(44);
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    expect(m.sw).toBeLessThanOrEqual(m.cw + 1);
    await context.close();
});

test('後台：已上線顏色 — 已上線標籤、套用成功／失敗／警告行在亮暗兩個主題對比 ≥ 4.5，且用文字標明不只靠顏色', async ({ browser }) => {
    const { context, page } = await bootAdmin(browser, { reports: oneApproved() });
    await applyBtn(page).click();
    await expect(page.locator('.apply-line.ok')).toBeVisible();
    await expect(page.locator('.live-badge')).toHaveText('已上線');
    await page.evaluate(() => {
        document.querySelector('.apply-bar').insertAdjacentHTML('beforeend',
            '<div class="apply-line err" id="probeErr">err</div><div class="apply-line warn" id="probeWarn">warn</div><div class="apply-line neutral" id="probeNeutral">n</div>');
    });
    const targets = ['.live-badge', '.action-preview.live', '.apply-line.ok', '#probeErr', '#probeWarn', '#probeNeutral', '.apply-summary', '.apply-note', '.btn-revoke'];
    for (const theme of ['light', 'dark']) {
        await page.evaluate(t => { if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark'); else document.documentElement.removeAttribute('data-theme'); }, theme);
        for (const sel of targets) {
            const r = await contrastOf(page, sel);
            expect(r.missing, `${theme} 找不到 ${sel}`).toBeUndefined();
            expect(r.ratio, `${theme} ${sel}`).toBeGreaterThanOrEqual(4.5);
        }
    }
    await context.close();
});
