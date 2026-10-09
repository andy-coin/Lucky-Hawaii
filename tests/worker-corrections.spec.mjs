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
