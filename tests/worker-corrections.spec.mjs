// 修正層 Worker：套用、公開讀取（不開瀏覽器）
import { test, expect } from '@playwright/test';
import worker from '../worker/src/index.js';
import { FakeKV, makeEnv } from './worker-helpers.mjs';

const ORIGIN = 'https://andy-coin.github.io';
const KEY = { 'X-Admin-Key': 'admin-test' };
const call = (path, { method = 'GET', body, origin, env, headers = {} } = {}) => worker.fetch(
    new Request('https://w' + path, {
        method,
        headers: { ...(origin ? { Origin: origin } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
        body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
    }), env, { waitUntil() {} });
const apply = (env, kvKeys, baseRev = 0, headers = KEY) => call('/corrections/apply', { method: 'POST', body: { kvKeys, baseRev }, env, headers, origin: ORIGIN });
const report = (extra = {}) => JSON.stringify({ type: 'word-report', word: '二心', reportType: 'remove', ts: '2026-01-01T00:00:00.000Z', status: 'agreed', decided_at: '2026-01-02T00:00:00.000Z', action: { type: 'remove_word', word: '二心', reason: '怪' }, ...extra });
const seeded = init => makeEnv({ USER_FEEDBACK_KV: new FakeKV(init) });

test('修正層 Worker：套用「移除詞」→ 200，AI_STATE_KV 恰好寫一次，報告 KV 不動', async () => {
    const env = seeded({ k1: report() });
    const res = await apply(env, ['k1']);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, rev: 1, skipped: [], count: 1 });
    expect(body.applied).toHaveLength(1);
    expect(body.applied[0].kvKeys).toEqual(['k1']);
    expect(env.AI_STATE_KV.puts).toBe(1);
    expect(env.USER_FEEDBACK_KV.puts).toBe(0);
    const doc = JSON.parse(env.AI_STATE_KV.m.get('corrections:v1'));
    expect(doc).toMatchObject({ version: 1, rev: 1, written: [] });
    expect(new Date(doc.updated_at).toISOString()).toBe(doc.updated_at);
    expect(doc.entries).toHaveLength(1);
    expect(doc.entries[0]).toMatchObject({ id: body.applied[0].id, target: 'wordlist', bucket: 'removed', value: '二心', source_kvKeys: ['k1'] });
    expect(doc.entries[0].id).toMatch(/^c_/);
    expect(new Date(doc.entries[0].applied_at).toISOString()).toBe(doc.entries[0].applied_at);
});

test('修正層 Worker：公開讀取只回修正內容，帶 Cache-Control／Vary，KV 讀取走 cacheTtl 30', async () => {
    const env = seeded({ k1: report() });
    const done = await (await apply(env, ['k1'])).json();
    const res = await call('/corrections.json', { origin: ORIGIN, env });
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=60');
    expect(res.headers.get('Vary')).toBe('Origin');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({
        version: 1, rev: 1,
        wordlist: { removed: ['二心'], hidden: [], fixed: {}, added: [] },
        rhymeDict: { removed: [], hidden: [], fixed: [], added: [] },
    });
    for (const secret of ['k1', 'source_kvKeys', 'applied_at', 'written', done.applied[0].id, '怪', 'kvKey']) expect(text).not.toContain(secret);
    expect(env.AI_STATE_KV.lastGetOpts).toEqual({ cacheTtl: 30 });
});

test('修正層 Worker：還沒套用過 → 公開讀取回空 view；其他來源 403；非 GET 405', async () => {
    const env = makeEnv();
    const res = await call('/corrections.json', { origin: ORIGIN, env });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
        version: 1, rev: 0,
        wordlist: { removed: [], hidden: [], fixed: {}, added: [] },
        rhymeDict: { removed: [], hidden: [], fixed: [], added: [] },
    });
    const evil = await call('/corrections.json', { origin: 'https://evil.example', env });
    expect(evil.status).toBe(403);
    expect((await evil.json()).code).toBe('FORBIDDEN');
    expect((await call('/corrections.json', { origin: ORIGIN, env })).status).toBe(200);
    const post = await call('/corrections.json', { method: 'POST', body: {}, origin: ORIGIN, env });
    expect(post.status).toBe(405);
});

test('修正層 Worker：套用沒帶金鑰 → 403 JSON（帶 CORS），不寫入', async () => {
    const env = seeded({ k1: report() });
    const res = await apply(env, ['k1'], 0, {});
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(env.AI_STATE_KV.puts).toBe(0);
    // 舊的 ?key= 還能用
    const legacy = await call('/corrections/apply?key=admin-test', { method: 'POST', body: { kvKeys: ['k1'], baseRev: 0 }, env, origin: ORIGIN });
    expect(legacy.status).toBe(200);
});

test('修正層 Worker：還沒核准的回報 → skipped not_agreed，不寫入', async () => {
    const env = seeded({ k1: report({ status: 'pending' }), k2: report({ status: 'agreed', action: undefined }) });
    const res = await apply(env, ['k1', 'k2', 'nope']);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rev).toBe(0);
    expect(body.applied).toEqual([]);
    expect(body.skipped).toEqual([
        { kvKey: 'k1', reason: 'not_agreed' }, { kvKey: 'k2', reason: 'not_agreed' }, { kvKey: 'nope', reason: 'not_found' },
    ]);
    expect(env.AI_STATE_KV.puts).toBe(0);
});

test('修正層 Worker：同一詞的多筆回報合併成一筆；重複套用、字串有標記、請求格式錯誤、rev 不符各有處理', async () => {
    const env = seeded({
        a: report(), b: report(), c: report({ action: { type: 'remove_word', word: '<b>x' } }),
        d: report({ action: { type: 'hide_word', word: '三心' } }), e: report({ action: { type: 'other' } }),
    });
    const res = await apply(env, ['a', 'b', 'a', 'c', 'd', 'e']);
    const body = await res.json();
    expect(body.count).toBe(2);
    expect(body.applied.map(x => x.kvKeys)).toEqual([['a', 'b'], ['d']]);
    expect(body.skipped).toEqual([{ kvKey: 'c', reason: 'invalid' }, { kvKey: 'e', reason: 'invalid' }]);
    expect(env.AI_STATE_KV.puts).toBe(1);
    // 再套一次同一批：全部 already_applied，不再寫入
    const again = await (await apply(env, ['a', 'd'], 1)).json();
    expect(again.skipped).toEqual([{ kvKey: 'a', reason: 'already_applied' }, { kvKey: 'd', reason: 'already_applied' }]);
    expect(again.rev).toBe(1);
    expect(env.AI_STATE_KV.puts).toBe(1);
    // rev 不符
    const stale = await apply(env, ['a'], 0);
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ code: 'REV_MISMATCH', rev: 1 });
    // 格式錯誤
    for (const b of [{}, { kvKeys: [], baseRev: 0 }, { kvKeys: ['a'], baseRev: -1 }, { kvKeys: ['a b'], baseRev: 0 }, { kvKeys: Array(101).fill('a'), baseRev: 0 }]) {
        const r = await call('/corrections/apply', { method: 'POST', body: b, env, headers: KEY, origin: ORIGIN });
        expect(r.status).toBe(400);
    }
    expect((await call('/corrections/apply', { method: 'POST', body: 'x'.repeat(16385), env, headers: KEY, origin: ORIGIN })).status).toBe(413);
    expect((await call('/corrections/apply', { env, headers: KEY, origin: ORIGIN })).status).toBe(405);
});

test('修正層 Worker：寫入失敗 → 503 KV_BUSY；文件損毀 → 500 且不被蓋掉', async () => {
    const env = seeded({ k1: report() });
    env.AI_STATE_KV.put = async () => { throw new Error('KV PUT failed: 1 write per second'); };
    const realErr = console.error; console.error = () => {};
    try {
        const res = await apply(env, ['k1']);
        expect(res.status).toBe(503);
        expect((await res.json()).code).toBe('KV_BUSY');
    } finally { console.error = realErr; }
    const bad = makeEnv({ USER_FEEDBACK_KV: new FakeKV({ k1: report() }), AI_STATE_KV: new FakeKV({ 'corrections:v1': '{oops' }) });
    expect((await apply(bad, ['k1'])).status).toBe(500);
    expect((await call('/corrections.json', { origin: ORIGIN, env: bad })).status).toBe(500);
    expect(bad.AI_STATE_KV.m.get('corrections:v1')).toBe('{oops');
});
