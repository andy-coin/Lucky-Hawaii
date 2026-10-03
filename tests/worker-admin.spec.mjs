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
