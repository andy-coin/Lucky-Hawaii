// 修正層：Worker 套用 → 公開 view → 網站詞庫（瀏覽器，Worker 程式碼真的在測試程序裡跑）
import { test, expect } from '@playwright/test';
import worker from '../worker/src/index.js';
import { bootPage } from './helpers.mjs';
import { FakeKV, makeEnv, bridgeWorker } from './worker-helpers.mjs';

const report = JSON.stringify({ type: 'word-report', word: '二心', ts: '2026-01-01T00:00:00.000Z', status: 'agreed', action: { type: 'remove_word', word: '二心' } });
const probe = page => page.evaluate(() => ({
    data: (wordlistData || []).map(e => e.w),
    phon: ['一心', '二心'].map(w => wordPhoneticMap.has(w)),
    prio: ['一心', '二心'].map(w => wordPriorityMap.has(w)),
}));

async function boot(browser, doApply) {
    const env = makeEnv({ ALLOW_LOCAL_ORIGIN: '1', USER_FEEDBACK_KV: new FakeKV({ k1: report }) });
    if (doApply) {
        const res = await worker.fetch(new Request('https://w/corrections/apply', {
            method: 'POST', headers: { 'X-Admin-Key': 'admin-test', 'Content-Type': 'application/json' },
            body: JSON.stringify({ kvKeys: ['k1'], baseRev: 0 }),
        }), env, { waitUntil() {} });
        expect(res.status).toBe(200);
    }
    const requests = [];
    const booted = await bootPage(browser, {
        wordlist: 'stub',
        beforeGoto: async ({ context, page }) => {
            page.on('request', r => { if (r.url().endsWith('/corrections.json')) requests.push(r.url()); });
            await bridgeWorker(context, env);
        },
    });
    return { ...booted, requests };
}

test('修正層：套用「移除詞」後重新整理，網站詞庫就沒有那個詞（只抓一次修正層）', async ({ browser }) => {
    const { context, page, errors, requests } = await boot(browser, true);
    const p = await probe(page);
    expect(p.data).not.toContain('二心');
    expect(p.data).toContain('一心');
    expect(p.phon).toEqual([true, false]);
    expect(p.prio).toEqual([true, false]);
    expect(requests).toHaveLength(1);
    expect(errors).toEqual([]);
    await context.close();
});

test('修正層：沒有套用任何修正時，詞庫完整保留', async ({ browser }) => {
    const { context, page, errors, requests } = await boot(browser, false);
    const p = await probe(page);
    expect(p.data).toEqual(expect.arrayContaining(['一心', '二心']));
    expect(p.phon).toEqual([true, true]);
    expect(requests).toHaveLength(1);
    expect(errors).toEqual([]);
    await context.close();
});

test('修正層：抓不到、慢過 3 秒、形狀不對 → 只留一則警告，詞庫照常載入', async ({ browser }) => {
    test.setTimeout(30_000);
    for (const mode of ['down', 'bad', 'hang']) {
        const { context, page, warnings } = await bootPage(browser, { wordlist: 'stub', corrections: mode });
        try {
            const p = await probe(page);
            expect(p.data, mode).toEqual(expect.arrayContaining(['一心', '二心']));
            expect(warnings.filter(m => m.includes('[好韻器] 修正層載入失敗')), mode).toHaveLength(1);
        } finally { await context.close(); }
    }
});
