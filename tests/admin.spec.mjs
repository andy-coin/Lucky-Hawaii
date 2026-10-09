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
