// Worker 每日健康檢查與模型淘汰規則測試（Node 內直接跑，不開瀏覽器）
// 淘汰規則是純函式，用合成的「家族」直接測邊界；健康檢查與排程用替身 fetch 與假 KV。
import { test, expect } from '@playwright/test';
import worker from '../worker/src/index.js';
import { MODELS, computeActive, STALE_DAYS, MIN_ACTIVE } from '../worker/src/models.js';
import { _resetState } from '../worker/src/ai.js';
import { runHealthCheck, readHealth, activeModels, _resetHealthCache } from '../worker/src/health.js';
import { makeEnv, installFetch, geminiOk, groqOk, byProvider, makeCtx, FakeKV } from './worker-helpers.mjs';

test.beforeEach(() => { _resetState(); _resetHealthCache(); });

const DAY = 86400000;
const NOW = Date.parse('2026-10-03T00:00:00Z');
const ALL_IDS = MODELS.map(m => m.id);
const [G1, G2, G3, Q1, Q2, Q3] = ALL_IDS;
const okFor = ids => Object.fromEntries(ids.map(id => [id, { ok: true }]));
const daysAgo = (n, from = NOW) => new Date(from - n * DAY).toISOString().slice(0, 10);
const mk = (id, family, released) => ({ id, family, released, provider: 'gemini' });
const allOk = () => installFetch(byProvider(() => geminiOk('OK'), () => groqOk('OK')));
const status = (code, text = '') => new Response(text, { status: code });
const stripMs = results => Object.fromEntries(Object.entries(results).map(([k, { ms, ...rest }]) => [k, rest]));

// ==================== 淘汰（computeActive 純函式） ====================

test('淘汰：常數是 183 天與至少 2 個', () => {
    expect(STALE_DAYS).toBe(183);
    expect(MIN_ACTIVE).toBe(2);
});

test('淘汰：今天的真實名單、全部健康，六個都留著（gpt-oss 雖舊但沒有更新的同家族）', () => {
    expect(computeActive(okFor(ALL_IDS), NOW)).toEqual(ALL_IDS);
});

test('淘汰：探測失敗的模型被拿掉', () => {
    const results = okFor(ALL_IDS);
    results[G2] = { ok: false, status: 404 };
    expect(computeActive(results, NOW)).toEqual(ALL_IDS.filter(id => id !== G2));
});

test('淘汰：太舊且同家族有更新又健康的，被拿掉', () => {
    const models = [mk('old', 'a', daysAgo(300)), mk('new', 'a', daysAgo(10)), mk('other', 'b', daysAgo(10))];
    expect(computeActive(okFor(['old', 'new', 'other']), NOW, models)).toEqual(['new', 'other']);
});

test('淘汰：太舊但同家族沒有更新的，留著（gpt-oss 這一對）', () => {
    const models = [mk('p1', 'g', daysAgo(300)), mk('p2', 'g', daysAgo(300))];
    expect(computeActive(okFor(['p1', 'p2']), NOW, models)).toEqual(['p1', 'p2']);
});

test('淘汰：更新的健康模型在別的家族，不會擠掉舊的', () => {
    const models = [mk('stale', 'a', daysAgo(300)), mk('fresh', 'b', daysAgo(10)), mk('fresh2', 'c', daysAgo(10))];
    expect(computeActive(okFor(['stale', 'fresh', 'fresh2']), NOW, models)).toEqual(['stale', 'fresh', 'fresh2']);
});

test('淘汰：邊界——剛好 183 天還算新，多 1 毫秒就算舊（以 UTC 毫秒計）', () => {
    const models = [mk('edge', 'a', daysAgo(183)), mk('fresh', 'a', daysAgo(10)), mk('other', 'b', daysAgo(10))];
    const results = okFor(['edge', 'fresh', 'other']);
    expect(Date.parse(models[0].released)).toBe(NOW - STALE_DAYS * DAY);
    expect(computeActive(results, NOW, models)).toEqual(['edge', 'fresh', 'other']);
    expect(computeActive(results, NOW + 1, models)).toEqual(['fresh', 'other']);
});

test('淘汰：至少留兩個，不夠就依登記順序補回健康但太舊的', () => {
    const models = [mk('old1', 'a', daysAgo(300)), mk('old2', 'a', daysAgo(300)), mk('fresh', 'a', daysAgo(10))];
    expect(computeActive(okFor(['old1', 'old2', 'fresh']), NOW, models)).toEqual(['old1', 'fresh']);
});

test('淘汰：全部探測失敗，回完整名單（依登記順序）', () => {
    const failed = Object.fromEntries(ALL_IDS.map(id => [id, { ok: false, status: 500 }]));
    expect(computeActive(failed, NOW)).toEqual(ALL_IDS);
    expect(computeActive({}, NOW)).toEqual(ALL_IDS);
});

test('淘汰：只有一個健康時湊到兩個，優先補沒被標成失效（404）的', () => {
    const results = {
        [G1]: { ok: false, status: 404 }, [G2]: { ok: true }, [G3]: { ok: false, status: 404 },
        [Q1]: { ok: false, status: 500 }, [Q2]: { ok: false, status: 404 }, [Q3]: { ok: false, status: 404 },
    };
    expect(computeActive(results, NOW)).toEqual([G2, Q1]);
});

test('淘汰：結果的到達順序不影響輸出，永遠是登記順序', () => {
    const results = {};
    for (const id of [...ALL_IDS].reverse()) results[id] = { ok: true };
    expect(computeActive(results, NOW)).toEqual(ALL_IDS);
});

test('淘汰：Gemini 回報 LEGACY／DEPRECATED／RETIRED 當作太舊', () => {
    for (const stage of ['LEGACY', 'DEPRECATED', 'RETIRED']) {
        const models = [mk('old', 'a', daysAgo(20)), mk('newer', 'a', daysAgo(5)), mk('other', 'b', daysAgo(5))];
        const results = { ...okFor(['old', 'newer', 'other']), old: { ok: true, stage } };
        expect(computeActive(results, NOW, models)).toEqual(['newer', 'other']);
    }
    // 沒有更新的同家族時，LEGACY 也不會被拿掉
    const lone = [mk('old', 'a', daysAgo(20)), mk('other', 'b', daysAgo(5))];
    expect(computeActive({ ...okFor(['old', 'other']), old: { ok: true, stage: 'LEGACY' } }, NOW, lone)).toEqual(['old', 'other']);
});

// ==================== 健康（runHealthCheck / readHealth / activeModels） ====================

test('健康：一次檢查只寫一次 KV，內容是 { v, checkedAt, results, active }', async () => {
    const f = allOk();
    try {
        const env = makeEnv();
        const doc = await runHealthCheck(env);
        expect(f.calls.length).toBe(6);
        expect(env.AI_STATE_KV.puts).toBe(1);
        const stored = JSON.parse(env.AI_STATE_KV.m.get('health'));
        expect(stored).toEqual(doc);
        expect(stored.v).toBe(1);
        expect(new Date(stored.checkedAt).toISOString()).toBe(stored.checkedAt);
        expect(Object.keys(stored.results).sort()).toEqual([...ALL_IDS].sort());
        expect(stored.active).toEqual(ALL_IDS);
        expect(stored.results[G1]).toMatchObject({ ok: true, status: 200 });
        expect(JSON.stringify(stored)).not.toContain('OK"');          // 不存上游文字
    } finally { f.restore(); }
});

test('健康：探測失敗的原因記成 timeout／network／http／empty', async () => {
    const f = installFetch((url) => {
        if (url.includes(G1)) return 'hang';
        if (url.includes(G2)) return new Error('boom');
        if (url.includes(G3)) return status(404, 'no such model');
        if (url.includes('generativelanguage')) return geminiOk('');
        return groqOk('OK');
    });
    try {
        const doc = await runHealthCheck(makeEnv());
        expect(doc.results[G1]).toMatchObject({ ok: false, reason: 'timeout' });
        expect(doc.results[G2]).toMatchObject({ ok: false, reason: 'network' });
        expect(doc.results[G3]).toMatchObject({ ok: false, reason: 'http', status: 404 });
        expect(doc.results[Q1].ok).toBe(true);
        expect(doc.results[G1].transient).toBe(true);                 // 重試後仍逾時：標暫時性，第一次沒有昨天的紀錄就先沿用
        expect(doc.active).toContain(G1);
        expect(doc.active).not.toContain(G3);                         // 404 是明確失效，立刻拿掉
        expect(JSON.stringify(doc)).not.toContain('no such model');   // 上游錯誤文字不存
    } finally { f.restore(); }
});

test('WR-04：暫時性失敗（429/5xx/逾時/網路/空回覆）先重試一次；重試成功就算健康', async () => {
    const seen = {};
    const f = installFetch((url, init) => {
        const id = url.includes('generativelanguage') ? url.match(/models\/([^:]+):/)[1] : JSON.parse(init.body).model;
        seen[id] = (seen[id] || 0) + 1;
        if (seen[id] > 1) return id.startsWith('gemini') ? geminiOk('OK') : groqOk('OK');   // 第二次都好
        if (id === G1) return status(429);
        if (id === G2) return status(503);
        if (id === G3) return 'hang';
        if (id === Q1) return new Error('boom');
        if (id === Q2) return groqOk('');
        return groqOk('OK');
    });
    try {
        const doc = await runHealthCheck(makeEnv());
        for (const id of ALL_IDS) expect(doc.results[id], id).toMatchObject({ ok: true });
        expect(doc.results[G1].transient).toBeUndefined();
        expect(doc.active).toEqual(ALL_IDS);
        expect(f.calls.length).toBe(11);                               // 六個 + 五個重試（Q3 一次就好）
    } finally { f.restore(); }
});

test('WR-04：重試後仍是暫時性失敗——昨天啟用的今天沿用；昨天就是暫時性失敗的才掉出名單；404 不重試也不沿用', async () => {
    const f = installFetch((url, init) => {
        const id = url.includes('generativelanguage') ? url.match(/models\/([^:]+):/)[1] : JSON.parse(init.body).model;
        if (id === G1) return status(503);
        if (id === G2) return status(404);
        return id.startsWith('gemini') ? geminiOk('OK') : groqOk('OK');
    });
    try {
        const env = makeEnv();
        const day1 = await runHealthCheck(env, NOW);
        expect(day1.results[G1]).toMatchObject({ ok: false, status: 503, transient: true });
        expect(day1.results[G2].transient).toBeUndefined();
        expect(f.calls.filter(c => c.url.includes(G2))).toHaveLength(1);        // 404 不重試
        expect(day1.active).toContain(G1);                                     // 沒有昨天的紀錄＝全部啟用，所以沿用
        expect(day1.active).not.toContain(G2);
        // 第二天：昨天紀錄是啟用 → 沿用；先把昨天的紀錄換成「G1 啟用且不是暫時性」
        env.AI_STATE_KV.m.set('health', JSON.stringify({ ...day1, results: { ...day1.results, [G1]: { ok: true, status: 200 } }, active: ALL_IDS }));
        const day2 = await runHealthCheck(env, NOW + DAY);
        expect(day2.active).toContain(G1);
        expect(day2.results[G1].ok).toBe(false);                               // 紀錄照實寫失敗
        // 第三天：昨天就是暫時性失敗 → 不再沿用，掉出名單
        const day3 = await runHealthCheck(env, NOW + 2 * DAY);
        expect(day3.active).not.toContain(G1);
        expect(day3.active.length).toBeGreaterThanOrEqual(MIN_ACTIVE);
    } finally { f.restore(); }
});

test('健康：Gemini 回 LEGACY 與 retirementTime 會記在結果裡', async () => {
    const legacy = new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'OK' }] } }],
        modelStatus: { modelStage: 'LEGACY', retirementTime: '2026-12-01T00:00:00Z' },
    }), { status: 200 });
    const f = installFetch(byProvider(url => url.includes(G3) ? legacy : geminiOk('OK'), () => groqOk('OK')));
    try {
        const doc = await runHealthCheck(makeEnv());
        expect(doc.results[G3]).toMatchObject({ ok: true, stage: 'LEGACY', retirementTime: '2026-12-01T00:00:00Z' });
    } finally { f.restore(); }
});

test('健康：thinkingLevel 被 400 退回時，探測去掉思考設定再試一次，不誤判為失效', async () => {
    const f = installFetch(byProvider((url, init) => {
        const cfg = JSON.parse(init.body).generationConfig;
        return cfg.thinkingConfig ? status(400, 'Unknown name "thinkingLevel": thinking not supported') : geminiOk('OK');
    }, () => groqOk('OK')));
    try {
        const doc = await runHealthCheck(makeEnv());
        expect(doc.results[G2].ok).toBe(true);
        expect(doc.results[G3].ok).toBe(true);
        expect(doc.active).toEqual(ALL_IDS);
        expect(f.calls.length).toBe(8);                               // 六個 + 兩個重試
    } finally { f.restore(); }
});

test('健康：寫入 KV 失敗只記錄，不丟例外，仍回結果', async () => {
    const f = allOk();
    const errors = [], realErr = console.error;
    console.error = (...a) => errors.push(a.join(' '));
    try {
        const env = makeEnv();
        env.AI_STATE_KV.put = async () => { throw new Error('KV quota'); };
        const doc = await runHealthCheck(env);
        expect(doc.active).toEqual(ALL_IDS);
        expect(errors.some(e => e.includes('健康檢查結果寫入 KV 失敗') && e.includes('KV quota'))).toBe(true);
    } finally { console.error = realErr; f.restore(); }
});

test('健康：同樣的上游回答跑兩次，結果與名單相同，各寫一次 KV', async () => {
    const f = allOk();
    try {
        const env = makeEnv();
        const a = await runHealthCheck(env, NOW);
        const b = await runHealthCheck(env, NOW);
        expect(stripMs(b.results)).toEqual(stripMs(a.results));
        expect(b.active).toEqual(a.active);
        expect(env.AI_STATE_KV.puts).toBe(2);
    } finally { f.restore(); }
});

test('健康：讀取——超過 72 小時、壞掉、缺 active 的紀錄一律忽略並用完整名單，五分鐘內不重讀 KV', async () => {
    const hoursAgo = h => new Date(Date.now() - h * 3600000).toISOString();
    const withDoc = doc => makeEnv({ AI_STATE_KV: new FakeKV(doc === undefined ? {} : { health: typeof doc === 'string' ? doc : JSON.stringify(doc) }) });

    let env = withDoc({ v: 1, checkedAt: hoursAgo(73), results: {}, active: [G1, G2] });
    expect(await readHealth(env)).toBeNull();
    expect((await activeModels(env)).map(m => m.id)).toEqual(ALL_IDS);

    _resetHealthCache();
    env = withDoc({ v: 1, checkedAt: hoursAgo(71), results: {}, active: [G1, G2] });
    expect((await readHealth(env)).active).toEqual([G1, G2]);
    expect((await activeModels(env)).map(m => m.id)).toEqual([G1, G2]);
    expect(env.AI_STATE_KV.gets).toBe(1);                             // 第二次讀在五分鐘內，沒有再碰 KV

    for (const bad of ['{not json', { v: 1, checkedAt: hoursAgo(1) }, { v: 1, checkedAt: 'yesterday', active: [G1] }, undefined]) {
        _resetHealthCache();
        env = withDoc(bad);
        expect(await readHealth(env)).toBeNull();
        expect((await activeModels(env)).map(m => m.id)).toEqual(ALL_IDS);
    }

    _resetHealthCache();                                              // active 是空陣列：過濾結果為空，退回完整名單
    env = withDoc({ v: 1, checkedAt: hoursAgo(1), results: {}, active: [] });
    expect((await activeModels(env)).map(m => m.id)).toEqual(ALL_IDS);

    _resetHealthCache();                                              // 完全沒有 KV 綁定也不能壞
    expect((await activeModels({})).map(m => m.id)).toEqual(ALL_IDS);
});

test('健康：讀快取——五分鐘後才會再讀 KV', async () => {
    const env = makeEnv({ AI_STATE_KV: new FakeKV({ health: JSON.stringify({ v: 1, checkedAt: new Date().toISOString(), results: {}, active: [G1, G2] }) }) });
    const t = Date.now();
    await readHealth(env, t);
    await readHealth(env, t + 299000);
    expect(env.AI_STATE_KV.gets).toBe(1);
    await readHealth(env, t + 301000);
    expect(env.AI_STATE_KV.gets).toBe(2);
});

// ==================== 排程 ====================

test('排程：scheduled 用 waitUntil 跑健康檢查，KV 裡出現 health 紀錄（controller.cron 為空字串也一樣）', async () => {
    const f = allOk();
    try {
        const env = makeEnv(), ctx = makeCtx();
        await worker.scheduled({ cron: '' }, env, ctx);
        expect(ctx.promises.length).toBe(1);
        await Promise.all(ctx.promises);
        const doc = JSON.parse(env.AI_STATE_KV.m.get('health'));
        expect(doc.active).toEqual(ALL_IDS);
        expect(env.AI_STATE_KV.puts).toBe(1);
    } finally { f.restore(); }
});

// ==================== 清單（AI 鏈與網站選單跟著每日結果走；後台可查看與重跑） ====================
const ORIGIN = 'https://andy-coin.github.io';
const call = (env, path, init = {}) => worker.fetch(new Request('https://w' + path, init), env, makeCtx());
const getModels = async env => (await call(env, '/models', { headers: { Origin: ORIGIN } })).json();
const postAi = async (env, body) => {
    const res = await call(env, '/ai', { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, j: await res.json() };
};
const idOf = c => c.body?.model || decodeURIComponent(c.url.match(/models\/([^:]+):/)[1]);

// 跑一次排程：gemini-3.8-flash 回 404，其餘正常；跑完清掉 isolate 快取，讓後面的請求真的從 KV 讀
async function seedWithG2Dead(env) {
    const f = installFetch(byProvider(url => url.includes(G2) ? status(404, 'gone') : geminiOk('OK'), () => groqOk('OK')));
    try {
        const ctx = makeCtx();
        await worker.scheduled({ cron: '' }, env, ctx);
        await Promise.all(ctx.promises);
    } finally { f.restore(); }
    _resetHealthCache();
}

test('清單：排程發現 gemini-3.8-flash 失效後，/models 只列其餘 5 個並有 checkedAt', async () => {
    const env = makeEnv();
    await seedWithG2Dead(env);
    const j = await getModels(env);
    expect(j.models.map(m => m.id)).toEqual(ALL_IDS.filter(id => id !== G2));
    expect(typeof j.checkedAt).toBe('string');
    expect(Number.isNaN(Date.parse(j.checkedAt))).toBe(false);
});

test('清單：排程之後 model auto 的換手鏈從不打已被淘汰的模型，即使前面的都失敗', async () => {
    const env = makeEnv();
    await seedWithG2Dead(env);
    const f = installFetch(() => status(500));
    try {
        const { status: st } = await postAi(env, { prompt: '心', model: 'auto' });
        expect(st).toBe(503);
        expect(f.calls.map(idOf)).toEqual([G1, G3, Q1, Q2]);          // 四次嘗試，沒有 G2
    } finally { f.restore(); }
});

test('清單：偏好的模型雖在白名單但已被淘汰，請求照收、由啟用的模型回答、不打它', async () => {
    const env = makeEnv();
    await seedWithG2Dead(env);
    const f = allOk();
    try {
        const { status: st, j } = await postAi(env, { prompt: '心', model: G2 });
        expect(st).toBe(200);
        expect(j.model.id).toBe(G1);
        expect(f.calls.map(idOf)).not.toContain(G2);
    } finally { f.restore(); }
});

test('清單：還沒有健康紀錄時，/models 列出全部六個，checkedAt 是 null，鏈也用完整名單', async () => {
    const env = makeEnv();
    const j = await getModels(env);
    expect(j.models.map(m => m.id)).toEqual(ALL_IDS);
    expect(j.checkedAt).toBeNull();
    const f = allOk();
    try {
        const { j: a } = await postAi(env, { prompt: '心', model: G2 });
        expect(a.model.id).toBe(G2);                                  // 沒有紀錄時偏好模型照常優先
    } finally { f.restore(); }
});

test('清單：只剩 Groq 啟用、提示又很長時，鏈改用完整名單裡吃得下的模型，不丟例外', async () => {
    const env = makeEnv({ AI_STATE_KV: new FakeKV({ health: JSON.stringify({ v: 1, checkedAt: new Date().toISOString(), results: {}, active: [Q1, Q3] }) }) });
    const f = allOk();
    try {
        const { status: st, j } = await postAi(env, { prompt: '心'.repeat(5000), model: 'auto' });
        expect(st).toBe(200);
        expect(j.model.id).toBe(G1);
    } finally { f.restore(); }
});

test('清單：後台——/health.json 與 /health/run 沒有金鑰、錯的金鑰、空金鑰都回 403 Forbidden 且不打上游', async () => {
    const f = allOk();
    try {
        const env = makeEnv();
        for (const q of ['', '?key=wrong', '?key=']) {
            for (const [path, method] of [['/health.json', 'GET'], ['/health/run', 'POST'], ['/health/run', 'GET']]) {
                const res = await call(env, path + q, { method });
                expect(res.status, path + q).toBe(403);
                expect(await res.text()).toBe('Forbidden');
            }
        }
        expect(f.calls.length).toBe(0);
        expect(env.AI_STATE_KV.puts).toBe(0);
    } finally { f.restore(); }
});

test('清單：後台——沒有 USER_REPORT_KEY 設定時，空金鑰也進不去', async () => {
    const env = makeEnv({ USER_REPORT_KEY: '' });
    expect((await call(env, '/health.json?key=')).status).toBe(403);
    expect((await call(env, '/health/run?key=', { method: 'POST' })).status).toBe(403);
});

test('清單：後台——/health.json 有金鑰回存起來的紀錄，沒有紀錄回 404', async () => {
    const env = makeEnv();
    let res = await call(env, '/health.json?key=admin-test');
    expect(res.status).toBe(404);
    expect((await res.json()).ok).toBe(false);
    await seedWithG2Dead(env);
    res = await call(env, '/health.json?key=admin-test');
    expect(res.status).toBe(200);
    const doc = await res.json();
    expect(doc.v).toBe(1);
    expect(doc.active).toEqual(ALL_IDS.filter(id => id !== G2));
    expect(doc.results[G2]).toMatchObject({ ok: false, status: 404 });
    expect(JSON.stringify(doc)).not.toContain('gone');                // 沒有上游文字
});

test('清單：後台——POST /health/run 立刻探測六個模型並回新紀錄；GET 是 405', async () => {
    const env = makeEnv();
    const f = allOk();
    try {
        expect((await call(env, '/health/run?key=admin-test')).status).toBe(405);
        expect(f.calls.length).toBe(0);
        const res = await call(env, '/health/run?key=admin-test', { method: 'POST' });
        expect(res.status).toBe(200);
        const doc = await res.json();
        expect(f.calls.length).toBe(6);
        expect(Object.keys(doc.results).length).toBe(6);
        expect(doc.active).toEqual(ALL_IDS);
        expect(JSON.parse(env.AI_STATE_KV.m.get('health')).checkedAt).toBe(doc.checkedAt);
        expect((await getModels(env)).checkedAt).toBe(doc.checkedAt);  // /models 立刻跟上
    } finally { f.restore(); }
});
