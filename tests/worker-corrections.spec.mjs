// 修正層 Worker：套用、公開讀取（不開瀏覽器）
import { test, expect } from '@playwright/test';
import worker from '../worker/src/index.js';
import { readFileSync } from 'node:fs';
import { FakeKV, makeEnv } from './worker-helpers.mjs';
import { actionToEntry, replayEntries, validateEntryValue } from '../worker/src/corrections.js';

const ORIGIN = 'https://andy-coin.github.io';
const KEY = { 'X-Admin-Key': 'admin-test' };
const call = (path, { method = 'GET', body, origin, env, headers = {} } = {}) => worker.fetch(
    new Request('https://w' + path, {
        method,
        headers: { ...(origin ? { Origin: origin } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
        body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
    }), env, { waitUntil() {} });
const apply = (env, kvKeys, baseRev = 0, headers = KEY) => call('/corrections/apply', { method: 'POST', body: { kvKeys, baseRev }, env, headers, origin: ORIGIN });
const report = (extra = {}) => JSON.stringify({ type: 'word-report', word: '二心', reportType: 'remove', ts: '2026-01-01T00:00:00.000Z', status: 'agreed', decided_by: 'admin', decided_at: '2026-01-02T00:00:00.000Z', action: { type: 'remove_word', word: '二心', reason: '怪' }, ...extra });
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
    // 新的 /corrections/* 不收網址上的 ?key=（WR-04）；只有舊後台還在用的 /reports* 才保留
    const legacy = await call('/corrections/apply?key=admin-test', { method: 'POST', body: { kvKeys: ['k1'], baseRev: 0 }, env, origin: ORIGIN });
    expect(legacy.status).toBe(403);
    expect(await legacy.json()).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(env.AI_STATE_KV.puts).toBe(0);
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

test('修正層 Worker：預檢允許 X-Admin-Key', async () => {
    const res = await call('/corrections/apply', { method: 'OPTIONS', origin: ORIGIN, env: makeEnv() });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type, X-Admin-Key');
    expect(res.headers.get('Access-Control-Max-Age')).toBe('7200');
});

test('修正層 Worker：空金鑰一律拒絕', async () => {
    const env = makeEnv({ USER_REPORT_KEY: '', USER_FEEDBACK_KV: new FakeKV({ k1: report() }) });
    for (const headers of [{ 'X-Admin-Key': '' }, {}]) {
        const res = await apply(env, ['k1'], 0, headers);
        expect(res.status).toBe(403);
    }
    expect(env.AI_STATE_KV.puts).toBe(0);
});

test('修正層 Worker：FakeKV failPut 讓下一次 put 丟錯一次，然後復原', async () => {
    const kv = new FakeKV();
    kv.failPut = true;
    await expect(kv.put('a', '1')).rejects.toThrow('1 write per second');
    expect(kv.failPut).toBe(false);
    await kv.put('a', '1');
    expect(await kv.get('a')).toBe('1');
});

test('修正層 Worker：FakeKV staleOnce 讓下一次 get 讀到舊值，之後讀到新值', async () => {
    const kv = new FakeKV({ a: 'new' });
    kv.staleOnce('a', 'old');
    expect(await kv.get('a')).toBe('old');
    expect(await kv.get('a')).toBe('new');
});

test('修正層 Worker：FakeKV list 分頁（cursor、limit、pageSize、list_complete）', async () => {
    const kv = new FakeKV({ c: '3', a: '1', b: '2' });
    const first = await kv.list({ limit: 2 });
    expect(first.keys.map(k => k.name)).toEqual(['a', 'b']);
    expect(first.list_complete).toBe(false);
    const second = await kv.list({ limit: 2, cursor: first.cursor });
    expect(second.keys.map(k => k.name)).toEqual(['c']);
    expect(second.list_complete).toBe(true);
    kv.pageSize = 1;
    expect((await kv.list()).keys).toHaveLength(1);
    const all = new FakeKV({ x: '1', y: '2' });
    expect(await all.list()).toMatchObject({ list_complete: true, keys: [{ name: 'x' }, { name: 'y' }] });
});

// ---------- 07-02 Task 1：動作對照與共用向量 ----------
const VECTORS = JSON.parse(readFileSync(new URL('./fixtures/corrections-vectors.json', import.meta.url), 'utf8'));

test('修正層 Worker：共用向量——每個 case 重播結果完全相等，再重播一次不變', () => {
    expect(VECTORS.cases.length).toBeGreaterThanOrEqual(14);
    for (const c of VECTORS.cases) {
        for (const e of c.entries) expect(validateEntryValue(e.target, e.bucket, e.value), `${c.name} 的 entry 要能通過驗證`).toBe(true);
        const once = replayEntries(c.base, c.entries);
        expect(once, c.name).toEqual(c.expected);
        // 順序也是契約的一部分：陣列用 toEqual 比對順序，fixed 物件另外比對鍵順序
        expect(Object.keys(once.wordlist.fixed), c.name + '（fixed 鍵順序）').toEqual(Object.keys(c.expected.wordlist.fixed));
        expect(replayEntries(once, c.entries), c.name + '（再重播一次）').toEqual(once);
    }
});

test('修正層 Worker：共用向量——base 不被改動', () => {
    const base = { wordlist: { removed: ['甲'], fixed: { 丁: 'ㄉㄧㄥ' } }, rhymeDict: { removed: [{ char: '長', dict_key: 'ㄔㄤ2' }] } };
    const snapshot = JSON.stringify(base);
    replayEntries(base, [{ target: 'wordlist', bucket: 'hidden', value: '甲' }, { target: 'rhymeDict', bucket: 'added', value: { char: '長', reading: 'ㄔㄤˊ', dict_key: 'ㄔㄤ2', tier: 'normal' } }]);
    expect(JSON.stringify(base)).toBe(snapshot);
});

test('修正層 Worker：共用向量——不合格的值一律被驗證擋下', () => {
    expect(VECTORS.invalid.length).toBeGreaterThanOrEqual(8);
    for (const v of VECTORS.invalid) expect(validateEntryValue(v.target, v.bucket, v.value), v.name).toBe(false);
});

const act = (type, extra) => report({ action: { type, ...extra } });
const ACTION_REPORTS = {
    a1: act('hide_word', { word: '二心' }),
    a2: act('remove_word', { word: '三心' }),
    a3: act('fix_word_reading', { word: '好運', new_z: 'ㄏㄠˇ ㄩㄣˋ' }),
    a4: act('manual_add_word', { word: '花火', z: 'ㄏㄨㄚ ㄏㄨㄛˇ', tier: 'common' }),
    a5: act('accept_ai_word', { word: '星河', z: 'ㄒㄧㄥ ㄏㄜˊ' }),
    a6: act('modify_ai_word', { original: '星海', modified: '星辰', z: 'ㄒㄧㄥ ㄔㄣˊ' }),
    a7: act('hide_char_reading', { char: '和', dict_key: 'ㄏㄜ4', reading: 'ㄏㄜˋ' }),
    a8: act('remove_char_reading', { char: '長', dict_key: 'ㄔㄤ2', reading: 'ㄔㄤˊ' }),
    a9: act('fix_char_reading', { char: '行', old_reading: 'ㄒㄧㄥˊ', old_dict_key: 'ㄒㄧㄥ2', new_reading: 'ㄏㄤˊ', new_dict_key: 'ㄏㄤ2' }),
    a10: act('manual_add_reading', { char: '樂', new_reading: 'ㄩㄝˋ', new_dict_key: 'ㄩㄝ4', to_tier: 'common' }),
    a11: act('note', { text: '只是備註' }),
};

test('修正層 Worker：動作對照——11 種核准動作一次套用，10 筆進修正層、備註略過，公開 view 是資料檔的形狀', async () => {
    const env = seeded(ACTION_REPORTS);
    const res = await apply(env, Object.keys(ACTION_REPORTS));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(10);
    expect(body.skipped).toEqual([{ kvKey: 'a11', reason: 'no_effect' }]);
    expect(env.AI_STATE_KV.puts).toBe(1);
    const view = await (await call('/corrections.json', { origin: ORIGIN, env })).json();
    expect(view).toEqual({
        version: 1, rev: 1,
        wordlist: {
            removed: ['三心'], hidden: ['二心'], fixed: { 好運: 'ㄏㄠˇ ㄩㄣˋ' },
            added: [
                { w: '花火', z: 'ㄏㄨㄚ ㄏㄨㄛˇ', tier: 'common', source: 'manual' },
                { w: '星河', z: 'ㄒㄧㄥ ㄏㄜˊ', tier: 'normal', source: 'ai_accept' },
                { w: '星辰', z: 'ㄒㄧㄥ ㄔㄣˊ', tier: 'normal', source: 'ai_modify', original: '星海' },
            ],
        },
        rhymeDict: {
            removed: [{ char: '長', dict_key: 'ㄔㄤ2', reading: 'ㄔㄤˊ' }],
            hidden: [{ char: '和', dict_key: 'ㄏㄜ4', reading: 'ㄏㄜˋ' }],
            fixed: [{ char: '行', from: 'ㄒㄧㄥ2', to: 'ㄏㄤ2' }],
            added: [{ char: '樂', reading: 'ㄩㄝˋ', dict_key: 'ㄩㄝ4', tier: 'common' }],
        },
    });
});

test('修正層 Worker：動作對照——沒有原讀音的修正變成新增；手動新增詞可沒有注音；不合格的值被略過', () => {
    expect(actionToEntry({ action: { type: 'fix_char_reading', char: '行', old_reading: '', old_dict_key: '', new_reading: 'ㄏㄤˊ', new_dict_key: 'ㄏㄤ2' } }))
        .toEqual({ target: 'rhymeDict', bucket: 'added', value: { char: '行', reading: 'ㄏㄤˊ', dict_key: 'ㄏㄤ2', tier: 'normal' } });
    expect(actionToEntry({ action: { type: 'manual_add_word', word: '花火', z: '', tier: 'normal' } }))
        .toEqual({ target: 'wordlist', bucket: 'added', value: { w: '花火', z: '', tier: 'normal', source: 'manual' } });
    expect(actionToEntry({ action: { type: 'manual_add_word', word: '花火' } }).value.tier).toBe('normal');
    const bad = [
        { type: 'accept_ai_word', word: '星河', z: '' },
        { type: 'accept_ai_word', word: '星河', z: 'ㄒㄧㄥ ?' },
        { type: 'fix_word_reading', word: '好運', new_z: 'ㄏㄠˇ' },
        { type: 'remove_word', word: '<img>' },
        { type: 'hide_char_reading', char: '長', dict_key: 'ㄔㄤ9', reading: 'ㄔㄤˊ' },
        { type: 'hide_char_reading', char: '長', dict_key: 'ㄔㄤ3', reading: 'ㄔㄤˊ' },
        { type: 'manual_add_reading', char: '樂', new_reading: 'ㄩㄝˋ', new_dict_key: 'ㄩㄝ4', to_tier: 'vip' },
        { type: 'fix_char_reading', char: '行', old_reading: 'ㄒㄧㄥˊ', old_dict_key: 'ㄒㄧㄥ2', new_reading: 'ㄏㄤˊ', new_dict_key: 'ㄏㄤ3' },
        { type: 'teleport', word: '好運' },
    ];
    for (const action of bad) expect(actionToEntry({ action }), action.type).toEqual({ skip: 'invalid' });
    expect(actionToEntry({ action: { type: 'note', text: 'x' } })).toEqual({ skip: 'no_effect' });
});

test('修正層 Worker：動作對照——只認 action，不看回報上的 word 欄位', async () => {
    const env = seeded({ k1: report({ word: '<b>x', action: { type: 'remove_word', word: '二心' } }) });
    const body = await (await apply(env, ['k1'])).json();
    expect(body.count).toBe(1);
    expect(JSON.parse(env.AI_STATE_KV.m.get('corrections:v1')).entries[0].value).toBe('二心');
});

// ---------- 07-02 Task 2：撤回、清空、後台讀取、版本號、KV 太忙 ----------
const post = (env, path, body, headers = KEY) => call(path, { method: 'POST', body, env, headers, origin: ORIGIN });
const revoke = (env, ids, baseRev) => post(env, '/corrections/revoke', { ids, baseRev });
const clear = (env, ids, baseRev) => post(env, '/corrections/clear', { ids, baseRev });
const stored = env => env.AI_STATE_KV.m.get('corrections:v1');
const doc = env => JSON.parse(stored(env));
const view = async env => (await call('/corrections.json', { origin: ORIGIN, env })).json();
const entry = (i, over = {}) => ({ id: 'c_e' + i, target: 'wordlist', bucket: 'removed', value: '詞' + i, source_kvKeys: ['k' + i], applied_at: '2026-01-01T00:00:00.000Z', ...over });
const withDoc = (d, init = {}) => makeEnv({ USER_FEEDBACK_KV: new FakeKV(init), AI_STATE_KV: new FakeKV({ 'corrections:v1': JSON.stringify({ version: 1, rev: 3, updated_at: null, entries: [], written: [], ...d }) }) });

test('修正層 Worker：重按——同一份核准回報套用兩次只留一筆，第二次不寫入', async () => {
    const env = seeded({ k1: report() });
    expect((await apply(env, ['k1'], 0)).status).toBe(200);
    const again = await apply(env, ['k1'], 1);
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ skipped: [{ kvKey: 'k1', reason: 'already_applied' }], applied: [], rev: 1 });
    expect(env.AI_STATE_KV.puts).toBe(1);
    expect(doc(env).entries).toHaveLength(1);
});

test('修正層 Worker：409——版本號不對就不改；讀到過期的舊文件也擋得住', async () => {
    const env = seeded({ k1: report(), k2: report({ action: { type: 'remove_word', word: '三心' } }) });
    await apply(env, ['k1'], 0);
    const before = stored(env);
    const wrong = await apply(env, ['k2'], 0);
    expect(wrong.status).toBe(409);
    expect(await wrong.json()).toMatchObject({ ok: false, code: 'REV_MISMATCH', rev: 1 });
    expect(env.AI_STATE_KV.puts).toBe(1);
    // client 已拿到 rev 1，但 KV 這次回的是 rev 0 的舊文件
    env.AI_STATE_KV.staleOnce('corrections:v1', JSON.stringify({ version: 1, rev: 0, updated_at: null, entries: [], written: [] }));
    const stale = await apply(env, ['k2'], 1);
    expect(stale.status).toBe(409);
    expect(stored(env)).toBe(before);
    expect(env.AI_STATE_KV.puts).toBe(1);
});

test('修正層 Worker：503——KV 太忙時回白話訊息，儲存的文件原封不動（套用、撤回、清空都一樣）', async () => {
    const env = seeded({ k1: report(), k2: report({ action: { type: 'remove_word', word: '三心' } }) });
    await apply(env, ['k1'], 0);
    const before = stored(env);
    const id = doc(env).entries[0].id;
    const realErr = console.error; console.error = () => {};
    try {
        for (const run of [() => apply(env, ['k2'], 1), () => revoke(env, [id], 1), () => clear(env, [id], 1)]) {
            env.AI_STATE_KV.failPut = true;
            const res = await run();
            expect(res.status).toBe(503);
            expect(await res.json()).toMatchObject({ ok: false, code: 'KV_BUSY', message: '儲存太快了，請等一秒再試' });
            expect(stored(env)).toBe(before);
        }
    } finally { console.error = realErr; }
});

test('修正層 Worker：撤回——依 id 移除那一筆，written 不動，view 不再有它', async () => {
    const env = seeded({ k1: report(), k2: report({ action: { type: 'hide_word', word: '三心' } }) });
    await apply(env, ['k1', 'k2'], 0);
    const [e1, e2] = doc(env).entries;
    const res = await revoke(env, [e1.id], 1);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, rev: 2, revoked: [e1.id], missing: [], reset: ['k1'], resetFailed: [] });
    expect(doc(env).entries.map(e => e.id)).toEqual([e2.id]);
    expect(doc(env).written).toEqual([]);
    expect(env.AI_STATE_KV.puts).toBe(2);
    expect((await view(env)).wordlist).toEqual({ removed: [], hidden: ['三心'], fixed: {}, added: [] });
});

test('修正層 Worker：撤回——同一個詞後來的修正撤掉後，先前的修正重新生效', async () => {
    const env = seeded({ k1: report(), k2: report({ action: { type: 'manual_add_word', word: '二心', z: 'ㄦˋ ㄒㄧㄣ', tier: 'normal' } }) });
    await apply(env, ['k1'], 0);
    await apply(env, ['k2'], 1);
    expect((await view(env)).wordlist).toMatchObject({ removed: [], added: [{ w: '二心' }] });
    const later = doc(env).entries[1];
    expect((await revoke(env, [later.id], 2)).status).toBe(200);
    expect((await view(env)).wordlist).toEqual({ removed: ['二心'], hidden: [], fixed: {}, added: [] });
});

test('修正層 Worker：撤回——一部分已不在、或全部不在（404，不寫入）、格式不對（400）、版本不符（409）', async () => {
    const env = seeded({ k1: report() });
    await apply(env, ['k1'], 0);
    const id = doc(env).entries[0].id;
    const none = await revoke(env, ['c_nope'], 1);
    expect(none.status).toBe(404);
    expect(await none.json()).toMatchObject({ ok: false, code: 'NOT_FOUND', missing: ['c_nope'], rev: 1, message: '這筆修正已不在線上（可能已撤回或已寫入資料檔），請重新載入' });
    expect(env.AI_STATE_KV.puts).toBe(1);
    for (const b of [{ baseRev: 1 }, { ids: [], baseRev: 1 }, { ids: ['nope'], baseRev: 1 }, { ids: [id], baseRev: -1 }, { ids: Array(101).fill(id), baseRev: 1 }]) {
        expect((await post(env, '/corrections/revoke', b)).status, JSON.stringify(b).slice(0, 40)).toBe(400);
    }
    expect((await revoke(env, [id], 0)).status).toBe(409);
    expect((await post(env, '/corrections/revoke', { ids: [id], baseRev: 1 }, {})).status).toBe(403);
    expect((await call('/corrections/revoke', { env, headers: KEY, origin: ORIGIN })).status).toBe(405);
    const part = await revoke(env, [id, 'c_gone'], 1);
    expect(await part.json()).toEqual({ ok: true, rev: 2, revoked: [id], missing: ['c_gone'], reset: ['k1'], resetFailed: [] });
});

test('修正層 Worker：清空——只移除指定 id，來源 kvKey 進 written（不重複），找不到的列在 missing，全找不到就不寫入', async () => {
    const env = withDoc({ entries: [entry(1, { source_kvKeys: ['k1', 'k1b'] }), entry(2)], written: ['k1'] });
    const res = await clear(env, ['c_e1', 'c_gone'], 3);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, rev: 4, cleared: ['c_e1'], missing: ['c_gone'] });
    expect(doc(env).entries.map(e => e.id)).toEqual(['c_e2']);
    expect(doc(env).written).toEqual(['k1', 'k1b']);
    expect(env.AI_STATE_KV.puts).toBe(1);
    const nothing = await clear(env, ['c_gone'], 4);
    expect(nothing.status).toBe(200);
    expect(await nothing.json()).toEqual({ ok: true, rev: 4, cleared: [], missing: ['c_gone'] });
    expect(env.AI_STATE_KV.puts).toBe(1);
    expect((await clear(env, ['c_e2'], 3)).status).toBe(409);
});

test('修正層 Worker：清空——written 最多留最新 5000 筆', async () => {
    const old = Array.from({ length: 5000 }, (_, i) => 'old' + i);
    const env = withDoc({ entries: [entry(1, { source_kvKeys: ['newA', 'newB'] })], written: old });
    await clear(env, ['c_e1'], 3);
    const w = doc(env).written;
    expect(w).toHaveLength(5000);
    expect(w.slice(-2)).toEqual(['newA', 'newB']);
    expect(w[0]).toBe('old2');
});

test('修正層 Worker：清空之後，同一份回報套用會被當成已寫入', async () => {
    const env = seeded({ k1: report() });
    await apply(env, ['k1'], 0);
    await clear(env, [doc(env).entries[0].id], 1);
    const again = await (await apply(env, ['k1'], 2)).json();
    expect(again.skipped).toEqual([{ kvKey: 'k1', reason: 'already_written' }]);
});

test('修正層 Worker：後台讀取——要金鑰；回整份文件加 view；POST 不行', async () => {
    const env = seeded({ k1: report() });
    await apply(env, ['k1'], 0);
    expect((await call('/corrections/admin.json', { env, origin: ORIGIN })).status).toBe(403);
    expect((await call('/corrections/admin.json?key=wrong', { env, origin: ORIGIN })).status).toBe(403);
    const res = await call('/corrections/admin.json', { env, headers: KEY, origin: ORIGIN });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, version: 1, rev: 1, written: [] });
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].source_kvKeys).toEqual(['k1']);
    expect(new Date(body.updated_at).toISOString()).toBe(body.updated_at);
    expect(body.view).toEqual({ wordlist: { removed: ['二心'], hidden: [], fixed: {}, added: [] }, rhymeDict: { removed: [], hidden: [], fixed: [], added: [] } });
    expect((await call('/corrections/admin.json', { method: 'POST', body: {}, env, headers: KEY, origin: ORIGIN })).status).toBe(405);
    // 沒套用過 → 空文件
    const empty = await (await call('/corrections/admin.json', { env: makeEnv(), headers: KEY, origin: ORIGIN })).json();
    expect(empty).toMatchObject({ ok: true, rev: 0, entries: [], written: [] });
});

test('修正層 Worker：損毀——每一條路徑都回 500 LAYER_CORRUPT，儲存的值不被蓋掉', async () => {
    const env = makeEnv({ USER_FEEDBACK_KV: new FakeKV({ k1: report() }), AI_STATE_KV: new FakeKV({ 'corrections:v1': 'not json' }) });
    const runs = [
        () => call('/corrections.json', { origin: ORIGIN, env }),
        () => call('/corrections/admin.json', { env, headers: KEY, origin: ORIGIN }),
        () => apply(env, ['k1'], 0),
        () => revoke(env, ['c_e1'], 0),
        () => clear(env, ['c_e1'], 0),
    ];
    for (const run of runs) {
        const res = await run();
        expect(res.status).toBe(500);
        expect(await res.json()).toEqual({ ok: false, code: 'LAYER_CORRUPT', message: '修正層資料損毀' });
    }
    expect(stored(env)).toBe('not json');
    expect(env.AI_STATE_KV.puts).toBe(0);
});

test('修正層 Worker：上限——修正層滿 2000 筆就不再套用新的', async () => {
    const entries = Array.from({ length: 2000 }, (_, i) => entry(i));
    const env = withDoc({ entries }, { fresh: report({ action: { type: 'remove_word', word: '新詞' } }) });
    const res = await apply(env, ['fresh'], 3);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, code: 'LAYER_FULL', message: '修正層已滿 2000 筆，請先跑寫回腳本' });
    expect(env.AI_STATE_KV.puts).toBe(0);
    // 撤回一筆之後又可以套用
    expect((await revoke(env, ['c_e0'], 3)).status).toBe(200);
    expect((await apply(env, ['fresh'], 4)).status).toBe(200);
});

test('修正層 Worker：只有已核准的回報進得了修正層（用戶端送的內容不算數）', async () => {
    const env = seeded({
        pending: report({ status: 'pending' }), dismissed: report({ status: 'dismissed' }),
        noaction: report({ action: undefined }), agreed: report({ action: { type: 'remove_word', word: '三心' } }),
    });
    const res = await post(env, '/corrections/apply', { kvKeys: ['pending', 'dismissed', 'noaction', 'agreed'], baseRev: 0, action: { type: 'remove_word', word: '惡意' } });
    const body = await res.json();
    expect(body.skipped.map(s => s.reason)).toEqual(['not_agreed', 'not_agreed', 'not_agreed']);
    expect(doc(env).entries.map(e => e.value)).toEqual(['三心']);
});


// ---------- Phase 7 審查修正：CR-01 偽造核准、WR-01 已上線鎖、WR-02 撤回後不再被套用 ----------
const feedback = (env, body) => call('/feedback', { method: 'POST', origin: ORIGIN, body, env });

test('CR-01：陌生人 POST /feedback 偽造 status:agreed＋action，不會被套用到線上', async () => {
    const env = makeEnv();
    const res = await feedback(env, { type: 'word-report', word: '愛', reportType: 'x', status: 'agreed', decided_at: '2026-01-01T00:00:00.000Z', decided_by: 'admin', kvKey: 'zzz', action: { type: 'remove_word', word: '愛' } });
    expect(res.status).toBe(200);
    const [kvKey] = [...env.USER_FEEDBACK_KV.m.keys()];
    const stored = JSON.parse(env.USER_FEEDBACK_KV.m.get(kvKey));
    for (const k of ['status', 'decided_at', 'decided_by', 'kvKey', 'action']) expect(stored, k).not.toHaveProperty(k);
    expect(stored).toMatchObject({ type: 'word-report', word: '愛', reportType: 'x' });
    const applied = await (await apply(env, [kvKey])).json();
    expect(applied.applied).toEqual([]);
    expect(applied.skipped).toEqual([{ kvKey, reason: 'not_agreed' }]);
    expect((await view(env)).wordlist.removed).toEqual([]);
    expect(env.AI_STATE_KV.puts).toBe(0);
});

test('CR-01：就算偽造的 status:agreed 已經在 KV 裡，沒有後台寫的 decided_by 也不會被套用', async () => {
    const env = seeded({ k1: report({ decided_by: undefined }), k2: report({ decided_by: 'someone' }) });
    const body = await (await apply(env, ['k1', 'k2'])).json();
    expect(body.applied).toEqual([]);
    expect(body.skipped).toEqual([{ kvKey: 'k1', reason: 'not_agreed' }, { kvKey: 'k2', reason: 'not_agreed' }]);
    expect(env.AI_STATE_KV.puts).toBe(0);
});

test('CR-01：/reports/decision 核准時才寫 decided_by；改回待審或駁回就拿掉；/feedback 仍保留字串欄位（ai-word-suggest 的 action）', async () => {
    const env = makeEnv();
    await feedback(env, { type: 'ai-word-suggest', word: '星河', action: 'accept', modified: '星辰', note: { x: 1 }, extra: 'drop' });
    const [kvKey] = [...env.USER_FEEDBACK_KV.m.keys()];
    expect(JSON.parse(env.USER_FEEDBACK_KV.m.get(kvKey))).toMatchObject({ type: 'ai-word-suggest', word: '星河', action: 'accept', modified: '星辰' });
    expect(JSON.parse(env.USER_FEEDBACK_KV.m.get(kvKey))).not.toHaveProperty('extra');
    expect(JSON.parse(env.USER_FEEDBACK_KV.m.get(kvKey))).not.toHaveProperty('note');   // 物件欄位不收
    const decide = (status, action) => post(env, '/reports/decision', { kvKey, status, action });
    await decide('agreed', { type: 'accept_ai_word', word: '星河', z: 'ㄒㄧㄥ ㄏㄜˊ' });
    expect(JSON.parse(env.USER_FEEDBACK_KV.m.get(kvKey))).toMatchObject({ status: 'agreed', decided_by: 'admin' });
    const ok = await (await apply(env, [kvKey])).json();
    expect(ok.applied).toHaveLength(1);
    await decide('dismissed');   // 已上線，不能直接駁回（WR-01）
    expect(JSON.parse(env.USER_FEEDBACK_KV.m.get(kvKey)).status).toBe('agreed');
    const env2 = seeded({ k1: report() });
    await post(env2, '/reports/decision', { kvKey: 'k1', status: 'dismissed' });
    expect(JSON.parse(env2.USER_FEEDBACK_KV.m.get('k1'))).not.toHaveProperty('decided_by');
    await post(env2, '/reports/decision', { kvKey: 'k1', status: 'pending' });
    expect(JSON.parse(env2.USER_FEEDBACK_KV.m.get('k1'))).not.toHaveProperty('decided_by');
});

test('WR-01：已上線的回報不能改成別的狀態、不能刪除（409），要先撤回；撤回之後可以', async () => {
    const env = seeded({ k1: report() });
    await apply(env, ['k1'], 0);
    for (const status of ['dismissed', 'archived', 'pending']) {
        const r = await post(env, '/reports/decision', { kvKey: 'k1', status });
        expect(r.status, status).toBe(409);
        expect(await r.json()).toMatchObject({ error: 'live' });
    }
    expect((await post(env, '/reports/delete', { kvKey: 'k1' })).status).toBe(409);
    expect(JSON.parse(env.USER_FEEDBACK_KV.m.get('k1')).status).toBe('agreed');
    // 重新核准（agreed）不受影響
    expect((await post(env, '/reports/decision', { kvKey: 'k1', status: 'agreed', action: { type: 'remove_word', word: '二心' } })).status).toBe(200);
    await revoke(env, [doc(env).entries[0].id], 1);
    expect((await post(env, '/reports/delete', { kvKey: 'k1' })).status).toBe(200);
});

test('WR-02：撤回之後，來源回報改回待審，下一次套用不會把它又放回線上', async () => {
    const env = seeded({ k1: report(), k2: report({ action: { type: 'hide_word', word: '三心' } }) });
    await apply(env, ['k1', 'k2'], 0);
    const e1 = doc(env).entries.find(e => e.source_kvKeys[0] === 'k1');
    const res = await revoke(env, [e1.id], 1);
    expect((await res.json()).reset).toEqual(['k1']);
    const k1 = JSON.parse(env.USER_FEEDBACK_KV.m.get('k1'));
    for (const k of ['status', 'decided_at', 'decided_by', 'action']) expect(k1, k).not.toHaveProperty(k);
    expect(k1).toMatchObject({ type: 'word-report', word: '二心' });
    // 全部「套用」（模擬後台把還沒套用的一併送出）：被撤回的那筆被略過
    const again = await (await apply(env, ['k1', 'k2'], 2)).json();
    expect(again.applied).toEqual([]);
    expect(again.skipped).toEqual([{ kvKey: 'k1', reason: 'not_agreed' }, { kvKey: 'k2', reason: 'already_applied' }]);
    expect((await view(env)).wordlist).toEqual({ removed: [], hidden: ['三心'], fixed: {}, added: [] });
    // 清空（寫回之後）不動回報
    const e2 = doc(env).entries[0];
    await clear(env, [e2.id], 2);
    expect(JSON.parse(env.USER_FEEDBACK_KV.m.get('k2')).status).toBe('agreed');
});

test('WR-02：撤回時改回待審失敗，撤回照樣生效，回應告訴後台哪幾筆沒改成', async () => {
    const env = seeded({ k1: report() });
    await apply(env, ['k1'], 0);
    env.USER_FEEDBACK_KV.put = async () => { throw new Error('boom'); };
    const res = await revoke(env, [doc(env).entries[0].id], 1);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, revoked: [expect.any(String)], reset: [], resetFailed: ['k1'] });
    expect(doc(env).entries).toEqual([]);
});

test('WR-04：新的 /corrections/* 與 /health* 不收網址金鑰；舊的 /reports* 還收；錯長度的金鑰也是 403', async () => {
    const env = seeded({ k1: report() });
    for (const [path, method] of [['/corrections/admin.json', 'GET'], ['/corrections/apply', 'POST'], ['/corrections/revoke', 'POST'], ['/corrections/clear', 'POST'], ['/health.json', 'GET'], ['/health/run', 'POST']]) {
        const r = await call(path + '?key=admin-test', { method, body: method === 'POST' ? {} : undefined, env, origin: ORIGIN });
        expect(r.status, path).toBe(403);
    }
    expect((await call('/reports.json?key=admin-test', { env, origin: ORIGIN })).status).toBe(200);
    for (const key of ['admin-tes', 'admin-test-', 'x', 'Admin-test']) {
        expect((await call('/corrections/admin.json', { env, origin: ORIGIN, headers: { 'X-Admin-Key': key } })).status, key).toBe(403);
    }
    expect((await call('/corrections/admin.json', { env, origin: ORIGIN, headers: KEY })).status).toBe(200);
});

test('WR-05：金鑰不對才吃 adm: 限流額度（對的金鑰不吃）；被限流回 429；沒有限流器就只回 403', async () => {
    const keys = [];
    let allow = true;
    const env = seeded({ k1: report() });
    env.AI_LIMITER = { limit: async ({ key }) => { keys.push(key); return { success: allow }; } };
    await call('/corrections/admin.json', { env, origin: ORIGIN, headers: KEY });
    await call('/reports.json', { env, origin: ORIGIN, headers: KEY });
    expect(keys).toEqual([]);
    expect((await call('/corrections/admin.json', { env, origin: ORIGIN, headers: { 'X-Admin-Key': 'bad' } })).status).toBe(403);
    expect(keys).toEqual(['adm:unknown']);
    allow = false;
    for (const [path, method] of [['/corrections/apply', 'POST'], ['/reports.json?key=bad', 'GET'], ['/health.json', 'GET']]) {
        const r = await call(path, { method, body: method === 'POST' ? {} : undefined, env, origin: ORIGIN });
        expect(r.status, path).toBe(429);
    }
    expect(env.AI_STATE_KV.puts).toBe(0);
    expect((await call('/corrections/admin.json', { env: seeded({}), origin: ORIGIN, headers: { 'X-Admin-Key': 'bad' } })).status).toBe(403);
});
