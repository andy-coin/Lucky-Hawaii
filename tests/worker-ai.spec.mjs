// Worker 換手鏈測試（Node 內直接跑 worker.fetch，不開瀏覽器）：上游 fetch 用 installFetch 換成替身，
// 用呼叫紀錄斷言「打了誰、帶了什麼、第二次有沒有再打失效的模型」
import { test, expect } from '@playwright/test';
import worker from '../worker/src/index.js';
import { _resetState, classify } from '../worker/src/ai.js';
import { makeEnv, installFetch, geminiOk } from './worker-helpers.mjs';

test.beforeEach(() => _resetState());

const ORIGIN = 'https://andy-coin.github.io';
const post = (env, body) => worker.fetch(new Request('https://w/ai', {
    method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}), env, { waitUntil() {} });
const ask = async (env, body = { prompt: '心', model: 'auto' }) => {
    const res = await post(env, body);
    return { status: res.status, j: await res.json() };
};
// Gemini 的模型 id 在網址裡，Groq 的在 body.model
const idOf = c => c.body?.model || decodeURIComponent(c.url.match(/models\/([^:]+):/)[1]);
const ids = calls => calls.map(idOf);
const status = (code, headers = {}, text = '') => new Response(text, { status: code, headers });
const groqOk = text => new Response(JSON.stringify({ choices: [{ message: { content: text } }], usage: { total_tokens: 9 } }),
    { status: 200, headers: { 'Content-Type': 'application/json' } });
// 依網址分流：Gemini 一律用 gen，Groq 一律用 groq
const byProvider = (gen, groq) => (url, init, n) => url.includes('generativelanguage') ? gen(url, init, n) : groq(url, init, n);
const G1 = 'gemini-3.5-flash-lite', G2 = 'gemini-3.8-flash', G3 = 'gemini-3.7-flash';
const Q1 = 'openai/gpt-oss-120b', Q2 = 'qwen/qwen3.8-27b', Q3 = 'openai/gpt-oss-20b';

test('逾時：第一個模型卡住，換下一個回答並回報 timeout', async () => {
    const f = installFetch((url, _i, n) => n === 1 ? 'hang' : geminiOk('心動、微光'));
    try {
        const { status: st, j } = await ask(makeEnv());
        expect(st).toBe(200);
        expect(j.ok && j.text).toBe('心動、微光');
        expect(j.tried[0]).toMatchObject({ id: G1, error: 'timeout' });
        expect(j.model.id).toBe(G2);
    } finally { f.restore(); }
});

test('429：換下一個，帶 retry-after 的模型下一次請求不再被打', async () => {
    const f = installFetch((url, _i, n) => n === 1 ? status(429, { 'retry-after': '30' }, 'quota') : geminiOk('甲、乙'));
    try {
        const a = await ask(makeEnv());
        expect(a.status).toBe(200);
        expect(a.j.tried[0]).toMatchObject({ id: G1, status: 429 });
        const b = await ask(makeEnv());
        expect(b.status).toBe(200);
        expect(ids(f.calls)).toEqual([G1, G2, G2]);       // 第二次請求直接從沒被冷卻的 G2 開始
    } finally { f.restore(); }
});

test('429：Gemini 在錯誤內容裡寫的 retryDelay 也當冷卻時間（不在回應裡出現）', async () => {
    const body = JSON.stringify({ error: { details: [{ retryDelay: '12s' }] } });
    const f = installFetch((url, _i, n) => n === 1 ? status(429, {}, body) : geminiOk('甲'));
    try {
        await ask(makeEnv());
        const b = await ask(makeEnv());
        expect(b.status).toBe(200);
        expect(ids(f.calls)).toEqual([G1, G2, G2]);
    } finally { f.restore(); }
});

test('分類：404 換下一個，並把該模型當失效、下一次請求跳過', async () => {
    const f = installFetch((url, _i, n) => n === 1 ? status(404) : geminiOk('甲'));
    try {
        const a = await ask(makeEnv());
        expect(a.j.tried[0]).toMatchObject({ id: G1, status: 404 });
        await ask(makeEnv());
        expect(ids(f.calls)).toEqual([G1, G2, G2]);
    } finally { f.restore(); }
});

test('分類：500 與 408 都換下一個', async () => {
    for (const code of [500, 408]) {
        _resetState();
        const f = installFetch((url, _i, n) => n === 1 ? status(code) : geminiOk('甲'));
        try {
            const { status: st, j } = await ask(makeEnv());
            expect(st, String(code)).toBe(200);
            expect(j.tried[0], String(code)).toMatchObject({ id: G1, status: code });
        } finally { f.restore(); }
    }
});

test('分類：413 換下一個，但不冷卻、下一次請求還會再試它', async () => {
    const f = installFetch((url, _i, n) => n === 1 ? status(413) : geminiOk('甲'));
    try {
        await ask(makeEnv());
        await ask(makeEnv());
        expect(ids(f.calls)).toEqual([G1, G2, G1]);
    } finally { f.restore(); }
});

test('分類：Gemini 回 401 整家冷卻，改打 Groq，下一次請求完全不打 Gemini', async () => {
    const f = installFetch(byProvider(() => status(401), () => groqOk('丙、丁')));
    try {
        const a = await ask(makeEnv());
        expect(a.status).toBe(200);
        expect(a.j.model.id).toBe(Q1);
        expect(ids(f.calls)).toEqual([G1, Q1]);           // 同一請求內，401 之後其他 Gemini 也被跳過
        await ask(makeEnv());
        expect(ids(f.calls)).toEqual([G1, Q1, Q1]);
    } finally { f.restore(); }
});

test('分類：400、430、499、405 直接回 400 BAD_REQUEST，只打一次上游', async () => {
    for (const code of [400, 430, 499, 405]) {
        _resetState();
        const f = installFetch(() => status(code, {}, 'UPSTREAM-SECRET-TEXT'));
        try {
            const { status: st, j } = await ask(makeEnv());
            expect(st, String(code)).toBe(400);
            expect(j, String(code)).toMatchObject({ ok: false, code: 'BAD_REQUEST' });
            expect(JSON.stringify(j)).not.toContain('UPSTREAM-SECRET-TEXT');
            expect(f.calls.length, String(code)).toBe(1);
        } finally { f.restore(); }
    }
});

test('分類：相鄰狀態碼 429/408 重試而 430 不重試、499 不重試而 500 重試、404 失效而 405 停止', () => {
    expect(classify(429)).toBe('transient');
    expect(classify(408)).toBe('transient');
    expect(classify(430)).toBe('fatal');
    expect(classify(499)).toBe('fatal');
    expect(classify(500)).toBe('transient');
    expect(classify(404)).toBe('dead');
    expect(classify(405)).toBe('fatal');
    expect(classify(403)).toBe('auth');
    expect(classify(413)).toBe('big');
    expect(classify(200)).toBe('ok');
    expect(classify(204)).toBe('ok');
});

test('全部失敗：回 503 ALL_BUSY、白話訊息、最多 4 次嘗試，不帶上游原文與金鑰', async () => {
    const f = installFetch(() => status(503, {}, 'UPSTREAM-SECRET-TEXT g-test'));
    try {
        const { status: st, j } = await ask(makeEnv());
        expect(st).toBe(503);
        expect(j).toMatchObject({ ok: false, code: 'ALL_BUSY' });
        expect(j.message).toBe('AI 暫時都忙不過來，請稍後再試（已嘗試 4 個模型）');
        expect(j.tried).toHaveLength(4);
        expect(f.calls).toHaveLength(4);
        expect(j.tried.every(t => t.status === 503)).toBe(true);
        const raw = JSON.stringify(j);
        expect(raw).not.toContain('UPSTREAM-SECRET-TEXT');
        expect(raw).not.toContain('g-test');
    } finally { f.restore(); }
});

test('全部失敗：每個都回空字串時代碼是 EMPTY', async () => {
    const f = installFetch(() => geminiOk('   '));
    try {
        const { status: st, j } = await ask(makeEnv());
        expect(st).toBe(503);
        expect(j).toMatchObject({ ok: false, code: 'EMPTY', message: 'AI 這次沒有回覆內容，請再試一次' });
        expect(j.tried.every(t => t.error === 'empty')).toBe(true);
    } finally { f.restore(); }
});

test('全部失敗：所有模型都在冷卻時，仍然打冷卻最早結束的那一個', async () => {
    const f = installFetch(() => status(503));
    try {
        await ask(makeEnv());                                  // G1 G2 G3 Q1 被冷卻
        await ask(makeEnv());                                  // 剩下的 Q2 Q3 也被冷卻
        const before = f.calls.length;
        expect(before).toBe(6);
        const { status: st, j } = await ask(makeEnv());
        expect(st).toBe(503);
        expect(f.calls.length - before).toBe(1);
        expect(idOf(f.calls[before])).toBe(G1);                // 最早被冷卻的 = 最早結束
        expect(j.tried).toHaveLength(1);
    } finally { f.restore(); }
});

test('預算：每次都卡住時，超過總預算就不再開新的嘗試', async () => {
    const f = installFetch(() => 'hang');
    try {
        const { status: st, j } = await ask(makeEnv({ CHAIN_BUDGET_MS: '100' }));
        expect(st).toBe(503);
        expect(j.code).toBe('ALL_BUSY');
        expect(f.calls.length).toBeLessThanOrEqual(3);
        expect(f.calls.length).toBeGreaterThanOrEqual(1);
        expect(j.tried.every(t => t.error === 'timeout')).toBe(true);
    } finally { f.restore(); }
});

test('請求內容：Gemini 金鑰在 header、thinkingLevel LOW 只給 3.8/3.7、不送 thinkingBudget、輸出上限 2048', async () => {
    const f = installFetch(() => status(503));
    try {
        await ask(makeEnv());
        const [c1, c2, c3] = f.calls;
        for (const c of [c1, c2, c3]) {
            expect(c.url).not.toContain('key=');
            expect(c.init.headers['x-goog-api-key']).toBe('g-test');
            expect(JSON.stringify(c.body)).not.toContain('thinkingBudget');
            expect(c.body.generationConfig.maxOutputTokens).toBeLessThanOrEqual(2048);
        }
        expect(idOf(c1)).toBe(G1);
        expect(c1.body.generationConfig.thinkingConfig).toBeUndefined();
        expect(idOf(c2)).toBe(G2);
        expect(c2.body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'LOW' });
        expect(idOf(c3)).toBe(G3);
        expect(c3.body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'LOW' });
    } finally { f.restore(); }
});

test('請求內容：Groq 用 Bearer、max_completion_tokens ≤ 1024、gpt-oss 帶 reasoning_effort low、沒有 max_tokens', async () => {
    const f = installFetch(byProvider(() => status(503), () => status(503)));
    try {
        await ask(makeEnv({ GEMINI_API_KEY: 'g-test' }), { prompt: '心', model: Q3 });
        await ask(makeEnv(), { prompt: '心', model: Q2 });
        const q3 = f.calls.find(c => idOf(c) === Q3);
        const q2 = f.calls.find(c => idOf(c) === Q2);
        for (const c of [q3, q2]) {
            expect(c.url).toBe('https://api.groq.com/openai/v1/chat/completions');
            expect(c.init.headers.Authorization).toBe('Bearer q-test');
            expect(c.body.max_completion_tokens).toBeLessThanOrEqual(1024);
            expect('max_tokens' in c.body).toBe(false);
        }
        expect(q3.body.reasoning_effort).toBe('low');
        expect('reasoning_effort' in q2.body).toBe(false);
    } finally { f.restore(); }
});

test('請求內容：Gemini 回 400 提到 thinking 時，同一個模型去掉 thinkingConfig 重試一次', async () => {
    const f = installFetch((url, init, n) => n === 1
        ? status(400, {}, JSON.stringify({ error: { message: 'Thinking level not supported' } })) : geminiOk('甲、乙'));
    try {
        const { status: st, j } = await ask(makeEnv(), { prompt: '心', model: G2 });
        expect(st).toBe(200);
        expect(ids(f.calls)).toEqual([G2, G2]);
        expect(f.calls[0].body.generationConfig.thinkingConfig).toBeDefined();
        expect(f.calls[1].body.generationConfig.thinkingConfig).toBeUndefined();
        expect(j.text).toBe('甲、乙');
    } finally { f.restore(); }
});

test('請求內容：thinking 重試只做一次，第二次仍 400 就停', async () => {
    const f = installFetch(() => status(400, {}, 'thinking again'));
    try {
        const { status: st, j } = await ask(makeEnv(), { prompt: '心', model: G2 });
        expect(st).toBe(400);
        expect(j.code).toBe('BAD_REQUEST');
        expect(f.calls).toHaveLength(2);
    } finally { f.restore(); }
});

test('順序：auto 依登記順序，Gemini 三個之後才是 Groq', async () => {
    const f = installFetch(() => status(503));
    try {
        await ask(makeEnv());
        expect(ids(f.calls)).toEqual([G1, G2, G3, Q1]);
    } finally { f.restore(); }
});

test('順序：名單內的偏好模型排第一，其餘照登記順序', async () => {
    const f = installFetch(() => status(503));
    try {
        await ask(makeEnv(), { prompt: '心', model: Q3 });
        expect(ids(f.calls)).toEqual([Q3, G1, G2, G3]);
    } finally { f.restore(); }
});

test('順序：提示太長時預先跳過 Groq，只剩 Gemini 三個', async () => {
    const f = installFetch(() => status(503));
    try {
        const { j } = await ask(makeEnv(), { prompt: '長'.repeat(4600), model: 'auto' });
        expect(ids(f.calls)).toEqual([G1, G2, G3]);
        expect(j.message).toContain('已嘗試 3 個模型');
    } finally { f.restore(); }
});

test('並行：兩個請求同時進來而第一個模型卡住，兩個都由第二個模型回答並回報逾時', async () => {
    const f = installFetch(url => url.includes(G1) ? 'hang' : geminiOk('同時、成功'));
    try {
        const env = makeEnv();
        const [a, b] = await Promise.all([ask(env), ask(env)]);
        for (const r of [a, b]) {
            expect(r.status).toBe(200);
            expect(r.j.model.id).toBe(G2);
            expect(r.j.tried[0]).toMatchObject({ id: G1, error: 'timeout' });
        }
    } finally { f.restore(); }
});
