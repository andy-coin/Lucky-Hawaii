// 回報與後台路徑的特徵測試（不開瀏覽器）：新 Worker 要和舊的後台 Worker 回應完全一樣，admin/index.html 才不會壞
import { test, expect } from '@playwright/test';
import worker from '../worker/src/index.js';
import { FakeKV, makeEnv } from './worker-helpers.mjs';

const ORIGIN = 'https://andy-coin.github.io';
const call = (path, { method = 'GET', body, origin, env } = {}) => worker.fetch(
    new Request('https://w' + path, {
        method,
        headers: { ...(origin ? { Origin: origin } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
    }), env, { waitUntil() {} });
const post = (path, body, env) => call(path, { method: 'POST', body, env });
const record = (extra = {}) => JSON.stringify({ type: 'fix', char: '心', ts: '2026-01-01T00:00:00.000Z', ...extra });
const seeded = init => makeEnv({ USER_FEEDBACK_KV: new FakeKV(init) });

test('admin：/feedback 正確來源 → 200 {ok:true}，存入欄位加 ISO ts，key 格式不變', async () => {
    const env = makeEnv();
    const res = await call('/feedback', { method: 'POST', origin: ORIGIN, body: { type: 'fix', char: '心', note: '請改' }, env });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get('Content-Type')).toBe('application/json');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    const keys = [...env.USER_FEEDBACK_KV.m.keys()];
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^\d+_[a-z0-9]{1,4}$/);
    const stored = JSON.parse(env.USER_FEEDBACK_KV.m.get(keys[0]));
    expect(stored).toMatchObject({ type: 'fix', char: '心', note: '請改' });
    expect(new Date(stored.ts).toISOString()).toBe(stored.ts);
});

test('admin：/feedback 其他來源 → 403 Forbidden 且不寫入；缺 Origin 也一樣', async () => {
    const env = makeEnv();
    for (const origin of ['https://evil.example', undefined]) {
        const res = await call('/feedback', { method: 'POST', origin, body: { a: 1 }, env });
        expect(res.status).toBe(403);
        expect(await res.text()).toBe('Forbidden');
    }
    expect(env.USER_FEEDBACK_KV.puts).toBe(0);
});

test('admin：/feedback 非 POST → 405 Method Not Allowed（先判斷方法，再判斷來源）', async () => {
    const env = makeEnv();
    for (const origin of [ORIGIN, 'https://evil.example', undefined]) {
        const res = await call('/feedback', { method: 'GET', origin, env });
        expect(res.status).toBe(405);
        expect(await res.text()).toBe('Method Not Allowed');
    }
});

test('admin：/feedback 內容不是 JSON → 500 {error}（沿用舊格式）', async () => {
    const env = makeEnv();
    const res = await call('/feedback', { method: 'POST', origin: ORIGIN, body: 'not json', env });
    expect(res.status).toBe(500);
    expect(typeof (await res.json()).error).toBe('string');
    expect(env.USER_FEEDBACK_KV.puts).toBe(0);
});

test('WR-03：/feedback 超過 8 KB 回 413 {error}，不寫 KV；剛好 8192 位元組放行', async () => {
    const env = makeEnv();
    const withBytes = n => { const pad = 'a'.repeat(n - new TextEncoder().encode(JSON.stringify({ n: '' })).length); return JSON.stringify({ n: pad }); };
    const ok = await call('/feedback', { method: 'POST', origin: ORIGIN, body: withBytes(8192), env });
    expect(ok.status).toBe(200);
    expect(env.USER_FEEDBACK_KV.puts).toBe(1);
    const big = await call('/feedback', { method: 'POST', origin: ORIGIN, body: withBytes(8193), env });
    expect(big.status).toBe(413);
    expect(typeof (await big.json()).error).toBe('string');
    // 謊報很小的 Content-Length、實際很大的串流也要擋
    const lie = await worker.fetch(new Request('https://w/feedback', { method: 'POST', headers: { Origin: ORIGIN, 'Content-Length': '10' }, body: withBytes(20000) }), env, { waitUntil() {} });
    expect(lie.status).toBe(413);
    expect(env.USER_FEEDBACK_KV.puts).toBe(1);
});

test('WR-03：/feedback 被限流回 429 {error}，不寫 KV；key 帶 fb: 前綴；沒有限流器或限流器壞掉就放行', async () => {
    const keys = [];
    const limited = makeEnv({ AI_LIMITER: { limit: async ({ key }) => { keys.push(key); return { success: false }; } } });
    const res = await call('/feedback', { method: 'POST', origin: ORIGIN, body: { a: 1 }, env: limited });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: '操作太頻繁，請稍後再試' });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(keys).toEqual(['fb:unknown']);
    expect(limited.USER_FEEDBACK_KV.puts).toBe(0);
    const realErr = console.error; console.error = () => {};
    try {
        const boom = makeEnv({ AI_LIMITER: { limit: async () => { throw new Error('down'); } } });
        expect((await call('/feedback', { method: 'POST', origin: ORIGIN, body: { a: 1 }, env: boom })).status).toBe(200);
    } finally { console.error = realErr; }
    expect((await call('/feedback', { method: 'POST', origin: ORIGIN, body: { a: 1 }, env: makeEnv() })).status).toBe(200);
    // 其他來源／錯誤方法仍先被擋，不會消耗限流額度
    const spy = []; const env2 = makeEnv({ AI_LIMITER: { limit: async ({ key }) => { spy.push(key); return { success: true }; } } });
    await call('/feedback', { method: 'POST', origin: 'https://evil.example', body: { a: 1 }, env: env2 });
    expect(spy).toEqual([]);
});

test('admin：/reports.json 依 ts 新到舊，附 kvKey，壞掉的值丟掉，CORS 標頭照舊', async () => {
    const env = seeded({
        old: record({ ts: '2026-01-01T00:00:00.000Z', n: 'old' }),
        broken: '{not json',
        newest: record({ ts: '2026-03-01T00:00:00.000Z', n: 'newest' }),
        mid: record({ ts: '2026-02-01T00:00:00.000Z', n: 'mid' }),
    });
    const res = await call('/reports.json?key=admin-test', { env });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/json');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    const items = await res.json();
    expect(items.map(i => i.n)).toEqual(['newest', 'mid', 'old']);
    expect(items.map(i => i.kvKey)).toEqual(['newest', 'mid', 'old']);
});

test('admin：/reports.json 鍵很多時用 cursor 一頁一頁列完，全部回傳，不加截斷標頭', async () => {
    const init = {};
    for (let i = 0; i < 5; i++) init[`${1700000000000 + i}_ab${i}`] = record({ ts: `2026-01-0${i + 1}T00:00:00.000Z`, n: i });
    const env = seeded(init);
    env.USER_FEEDBACK_KV.pageSize = 2;
    let lists = 0;
    const realList = env.USER_FEEDBACK_KV.list.bind(env.USER_FEEDBACK_KV);
    env.USER_FEEDBACK_KV.list = async o => { lists++; return realList(o); };
    const res = await call('/reports.json?key=admin-test', { env });
    expect(res.status).toBe(200);
    const items = await res.json();
    expect(lists).toBe(3);
    expect(items.map(i => i.n)).toEqual([4, 3, 2, 1, 0]);
    expect(items.every(i => typeof i.kvKey === 'string')).toBe(true);
    expect(res.headers.get('X-Reports-Truncated')).toBeNull();
});

test('admin：/reports.json 超過 800 筆 → 只讀最新 800 筆（依鍵名的時間前綴），回 X-Reports-Truncated', async () => {
    const init = {};
    for (let i = 0; i < 805; i++) init[`${1700000000000 + i}_abcd`] = record({ ts: new Date(1700000000000 + i).toISOString(), n: i });
    const env = seeded(init);
    const res = await call('/reports.json?key=admin-test', { env });
    expect(res.status).toBe(200);
    const items = await res.json();
    expect(items).toHaveLength(800);
    expect(items[0].n).toBe(804);
    expect(items[799].n).toBe(5);
    expect(env.USER_FEEDBACK_KV.gets).toBe(800);
    expect(res.headers.get('X-Reports-Truncated')).toBe('1');
    expect(res.headers.get('Access-Control-Expose-Headers')).toContain('X-Reports-Truncated');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    // 剛好 800 筆不算截斷
    const ok = seeded(Object.fromEntries(Object.entries(init).slice(5)));
    const res2 = await call('/reports.json?key=admin-test', { env: ok });
    expect((await res2.json())).toHaveLength(800);
    expect(res2.headers.get('X-Reports-Truncated')).toBeNull();
});

test('admin：/reports.json 金鑰錯或沒給 → 403 Forbidden', async () => {
    const env = seeded({ a: record() });
    for (const q of ['', '?key=wrong', '?key=']) {
        const res = await call('/reports.json' + q, { env });
        expect(res.status).toBe(403);
        expect(await res.text()).toBe('Forbidden');
    }
});

test('admin：/reports/decision agreed 帶 action → 寫入 status、decided_at、action', async () => {
    const env = seeded({ k1: record() });
    const action = { kind: 'move', to: 'ㄒㄧㄣ' };
    const res = await post('/reports/decision?key=admin-test', { kvKey: 'k1', status: 'agreed', action }, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    const obj = JSON.parse(env.USER_FEEDBACK_KV.m.get('k1'));
    expect(obj).toMatchObject({ status: 'agreed', action, char: '心' });
    expect(new Date(obj.decided_at).toISOString()).toBe(obj.decided_at);
});

test('admin：/reports/decision agreed 沒帶 action → 舊的 action 被移除', async () => {
    const env = seeded({ k1: record({ status: 'agreed', action: { kind: 'old' }, decided_at: '2026-01-02T00:00:00.000Z' }) });
    const res = await post('/reports/decision?key=admin-test', { kvKey: 'k1', status: 'dismissed' }, env);
    expect(res.status).toBe(200);
    const obj = JSON.parse(env.USER_FEEDBACK_KV.m.get('k1'));
    expect(obj.status).toBe('dismissed');
    expect(obj).not.toHaveProperty('action');
    expect(obj).toHaveProperty('decided_at');
});

test('admin：/reports/decision pending → 清掉 status、decided_at、action', async () => {
    const env = seeded({ k1: record({ status: 'agreed', action: { kind: 'x' }, decided_at: '2026-01-02T00:00:00.000Z' }) });
    const res = await post('/reports/decision?key=admin-test', { kvKey: 'k1', status: 'pending' }, env);
    expect(res.status).toBe(200);
    const obj = JSON.parse(env.USER_FEEDBACK_KV.m.get('k1'));
    expect(obj).not.toHaveProperty('status');
    expect(obj).not.toHaveProperty('decided_at');
    expect(obj).not.toHaveProperty('action');
    expect(obj.char).toBe('心');
});

test('admin：/reports/decision 缺 kvKey 或 status → 400；找不到 kvKey → 404', async () => {
    const env = seeded({ k1: record() });
    for (const body of [{ status: 'agreed' }, { kvKey: 'k1' }, {}]) {
        const res = await post('/reports/decision?key=admin-test', body, env);
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: 'kvKey and status required' });
    }
    const miss = await post('/reports/decision?key=admin-test', { kvKey: 'nope', status: 'agreed' }, env);
    expect(miss.status).toBe(404);
    expect(await miss.json()).toEqual({ error: 'Not Found' });
    expect(env.USER_FEEDBACK_KV.puts).toBe(0);
});

test('admin：/reports/decision 金鑰先於方法檢查（錯金鑰 → 403，對金鑰但 GET → 405）', async () => {
    const env = seeded({ k1: record() });
    expect((await post('/reports/decision?key=wrong', { kvKey: 'k1', status: 'agreed' }, env)).status).toBe(403);
    expect((await call('/reports/decision?key=wrong', { env })).status).toBe(403);
    const get = await call('/reports/decision?key=admin-test', { env });
    expect(get.status).toBe(405);
    expect(await get.text()).toBe('Method Not Allowed');
    expect(JSON.parse(env.USER_FEEDBACK_KV.m.get('k1'))).not.toHaveProperty('status');
});

test('admin：/reports/delete 刪掉指定的一筆；缺 kvKey → 400；錯金鑰 → 403；GET → 405', async () => {
    const env = seeded({ k1: record(), k2: record() });
    const ok = await post('/reports/delete?key=admin-test', { kvKey: 'k1' }, env);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true });
    expect([...env.USER_FEEDBACK_KV.m.keys()]).toEqual(['k2']);
    const bad = await post('/reports/delete?key=admin-test', {}, env);
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: 'kvKey required' });
    const forbidden = await post('/reports/delete?key=wrong', { kvKey: 'k2' }, env);
    expect(forbidden.status).toBe(403);
    expect(await forbidden.text()).toBe('Forbidden');
    expect((await call('/reports/delete?key=admin-test', { env })).status).toBe(405);
    expect([...env.USER_FEEDBACK_KV.m.keys()]).toEqual(['k2']);
});

test('admin：/reports 舊的 HTML 視圖 → 410 Moved', async () => {
    const res = await call('/reports', { env: makeEnv() });
    expect(res.status).toBe(410);
    expect((await res.text()).startsWith('Moved')).toBe(true);
});

test('admin：回報路徑不影響 AI 路徑（/models 照常、未知路徑仍 404）', async () => {
    const env = makeEnv();
    expect((await call('/models', { origin: ORIGIN, env })).status).toBe(200);
    expect((await call('/nope', { origin: ORIGIN, env })).status).toBe(404);
});

// ==================== Phase 7：後台金鑰改走 X-Admin-Key，所有後台路徑共用同一個檢查 ====================
const H = (key = 'admin-test') => ({ 'X-Admin-Key': key });
const withHeaders = (path, { method = 'GET', body, headers, origin = ORIGIN, env } = {}) => worker.fetch(
    new Request('https://w' + path, {
        method, headers: { Origin: origin, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
    }), env, { waitUntil() {} });

test('admin：/reports.json 用 X-Admin-Key header（不帶網址金鑰）→ 200 陣列；錯的 header → 403 Forbidden', async () => {
    const env = seeded({ a: record({ n: 'a' }) });
    const ok = await withHeaders('/reports.json', { headers: H(), env });
    expect(ok.status).toBe(200);
    expect((await ok.json()).map(i => i.n)).toEqual(['a']);
    const bad = await withHeaders('/reports.json', { headers: H('wrong'), env });
    expect(bad.status).toBe(403);
    expect(await bad.text()).toBe('Forbidden');
    // header 優先：header 錯、網址金鑰對 → 仍然拒絕
    expect((await withHeaders('/reports.json?key=admin-test', { headers: H('wrong'), env })).status).toBe(403);
});

test('admin：/reports/decision 與 /reports/delete 用 header 的結果和網址金鑰相同', async () => {
    const env = seeded({ k1: record(), k2: record() });
    const dec = await withHeaders('/reports/decision', { method: 'POST', body: { kvKey: 'k1', status: 'agreed', action: { type: 'remove_word', word: '心' } }, headers: H(), env });
    expect(dec.status).toBe(200);
    expect(JSON.parse(env.USER_FEEDBACK_KV.m.get('k1')).status).toBe('agreed');
    const del = await withHeaders('/reports/delete', { method: 'POST', body: { kvKey: 'k2' }, headers: H(), env });
    expect(del.status).toBe(200);
    expect([...env.USER_FEEDBACK_KV.m.keys()]).toEqual(['k1']);
    for (const path of ['/reports/decision', '/reports/delete']) {
        const r = await withHeaders(path, { method: 'POST', body: { kvKey: 'k1', status: 'agreed' }, headers: H('wrong'), env });
        expect(r.status).toBe(403);
        expect(await r.text()).toBe('Forbidden');
    }
    expect(JSON.parse(env.USER_FEEDBACK_KV.m.get('k1')).status).toBe('agreed');
});

test('admin：/health.json 用 header → 和網址金鑰一樣（沒有紀錄 404）；錯 header → 403', async () => {
    const env = makeEnv();
    expect((await withHeaders('/health.json', { headers: H(), env })).status).toBe(404);
    expect((await withHeaders('/health.json?key=admin-test', { env })).status).toBe(404);
    const bad = await withHeaders('/health.json', { headers: H('wrong'), env });
    expect(bad.status).toBe(403);
    expect(await bad.text()).toBe('Forbidden');
    expect((await withHeaders('/health/run', { method: 'POST', headers: H('wrong'), env })).status).toBe(403);
});

test('admin：伺服器沒設金鑰（空字串）時，空 header、空網址金鑰在每個後台路徑都被拒絕', async () => {
    const env = makeEnv({ USER_REPORT_KEY: '', USER_FEEDBACK_KV: new FakeKV({ k1: record() }) });
    const hit = [];
    for (const [path, method] of [['/reports.json', 'GET'], ['/reports/decision', 'POST'], ['/reports/delete', 'POST'], ['/health.json', 'GET'], ['/health/run', 'POST'], ['/corrections/apply', 'POST']]) {
        for (const [label, q, headers] of [['空 header', '', H('')], ['空網址金鑰', '?key=', {}], ['都沒給', '', {}]]) {
            const res = await withHeaders(path + q, { method, body: method === 'POST' ? { kvKey: 'k1', status: 'agreed', kvKeys: ['k1'], baseRev: 0 } : undefined, headers, env });
            if (res.status !== 403) hit.push(`${path} ${label} → ${res.status}`);
        }
    }
    expect(hit).toEqual([]);
    expect(env.USER_FEEDBACK_KV.m.has('k1')).toBe(true);
    expect(env.USER_FEEDBACK_KV.puts).toBe(0);
});

test('admin：舊路徑的 403 仍是純文字 Forbidden，但帶 CORS 標頭（跨來源的後台才讀得到）', async () => {
    const env = seeded({ k1: record() });
    for (const [path, method] of [['/reports.json', 'GET'], ['/reports/decision', 'POST'], ['/reports/delete', 'POST'], ['/health.json', 'GET'], ['/health/run', 'POST']]) {
        const res = await withHeaders(path, { method, headers: H('wrong'), env });
        expect(res.status, path).toBe(403);
        expect(await res.text(), path).toBe('Forbidden');
        expect(res.headers.get('Access-Control-Allow-Origin'), path).toBe(ORIGIN);
        expect(res.headers.get('Vary'), path).toBe('Origin');
    }
});

test('admin：預檢 OPTIONS /corrections/apply → 204，允許 X-Admin-Key，結果快取 7200 秒', async () => {
    const res = await withHeaders('/corrections/apply', { method: 'OPTIONS', env: makeEnv() });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('X-Admin-Key');
    expect(res.headers.get('Access-Control-Max-Age')).toBe('7200');
});
