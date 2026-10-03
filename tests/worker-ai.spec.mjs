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

test('分類：400、430、499、405 每個模型都這樣回才算 BAD_REQUEST（試滿 4 個，不洩漏上游內文）', async () => {
    for (const code of [400, 430, 499, 405]) {
        _resetState();
        const f = installFetch(() => status(code, {}, 'UPSTREAM-SECRET-TEXT'));
        try {
            const { status: st, j } = await ask(makeEnv());
            expect(st, String(code)).toBe(400);
            expect(j, String(code)).toMatchObject({ ok: false, code: 'BAD_REQUEST' });
            expect(JSON.stringify(j)).not.toContain('UPSTREAM-SECRET-TEXT');
            expect(f.calls.length, String(code)).toBe(4);
        } finally { f.restore(); }
    }
});

test('CR-02：一個模型回 400 只讓它休息，鏈繼續走；下一次請求跳過它、其他模型照常', async () => {
    const f = installFetch((url, _i, n) => n === 1 ? status(400, {}, 'model decommissioned') : geminiOk('甲、乙'));
    try {
        const a = await ask(makeEnv());
        expect(a.status).toBe(200);
        expect(ids(f.calls)).toEqual([G1, G2]);
        expect(a.j.model.id).toBe(G2);
        await ask(makeEnv());
        expect(ids(f.calls)).toEqual([G1, G2, G2]);        // G1 冷卻中；G2 沒被牽連
    } finally { f.restore(); }
});

test('CR-02：Gemini 回 400 說金鑰無效，整家 Gemini 休息，改打 Groq，下一次請求完全不打 Gemini', async () => {
    const keyBad = () => status(400, {}, JSON.stringify({ error: { status: 'INVALID_ARGUMENT', message: 'API key not valid. Please pass a valid API key.' } }));
    const f = installFetch(byProvider(keyBad, () => groqOk('丙、丁')));
    try {
        const a = await ask(makeEnv());
        expect(a.status).toBe(200);
        expect(a.j.model.id).toBe(Q1);
        expect(ids(f.calls)).toEqual([G1, Q1]);
        await ask(makeEnv());
        expect(ids(f.calls)).toEqual([G1, Q1, Q1]);
    } finally { f.restore(); }
});

test('CR-02：400 混著 503 不算請求錯誤，回 ALL_BUSY 而不是 BAD_REQUEST', async () => {
    const f = installFetch((url, _i, n) => n % 2 ? status(400) : status(503));
    try {
        const { status: st, j } = await ask(makeEnv());
        expect(st).toBe(503);
        expect(j.code).toBe('ALL_BUSY');
    } finally { f.restore(); }
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

test('WR-01：單次嘗試被壓在剩餘預算內，整條鏈不會超過總預算太多', async () => {
    const f = installFetch(() => 'hang');
    try {
        const t0 = Date.now();
        const { j } = await ask(makeEnv({ CHAIN_BUDGET_MS: '300', ATTEMPT_TIMEOUT_MS: '10000' }));
        expect(Date.now() - t0).toBeLessThan(1500);        // 沒有壓縮的話第一次就會卡 10 秒
        expect(j.tried[0].error).toBe('timeout');
    } finally { f.restore(); }
});

test('WR-01：讀本文時逾時算 timeout，不是空回覆（最後是 ALL_BUSY 而不是 EMPTY）', async () => {
    const stuckBody = (url, init) => new Response(new ReadableStream({
        start(c) { init.signal.addEventListener('abort', () => c.error(init.signal.reason)); },
    }), { status: 200 });
    const f = installFetch(stuckBody);
    try {
        const { status: st, j } = await ask(makeEnv());
        expect(st).toBe(503);
        expect(j.code).toBe('ALL_BUSY');
        expect(j.tried.every(t => t.error === 'timeout')).toBe(true);
    } finally { f.restore(); }
});

test('WR-05：沒收尾的 <think> 當空回覆，換下一個模型；有收尾的照舊剝掉', async () => {
    const f = installFetch(byProvider(() => geminiOk('<think>想到一半就被截斷了'), () => groqOk('<think>推理</think>甲、乙')));
    try {
        const { status: st, j } = await ask(makeEnv(), { prompt: '心', model: Q1 });
        expect(st).toBe(200);
        expect(j.text).toBe('甲、乙');                       // Q1 的完整 think 剝掉後有內容
        const g = await ask(makeEnv());                      // auto：Gemini 三個都是截斷的 → 記為 empty，落到 Groq
        expect(g.status).toBe(200);
        expect(g.j.model.id).toBe(Q1);
        expect(g.j.tried.filter(t => t.error === 'empty')).toHaveLength(3);
    } finally { f.restore(); }
});

test('WR-05：每個模型都只吐沒收尾的 <think> 時回 EMPTY', async () => {
    const f = installFetch(() => groqOk('<think>還在想'));
    try {
        const { status: st, j } = await ask(makeEnv(), { prompt: '心', model: Q2 });
        expect(st).toBe(503);
        expect(j.code).toBe('EMPTY');
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

test('請求內容：thinking 重試只做一次，第二次仍 400 就放棄這個模型（不再第三次）', async () => {
    const f = installFetch(() => status(400, {}, 'thinking again'));
    try {
        const { status: st, j } = await ask(makeEnv(), { prompt: '心', model: G2 });
        expect(st).toBe(400);
        expect(j.code).toBe('BAD_REQUEST');
        expect(ids(f.calls).filter(i => i === G2)).toHaveLength(2);
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

// ==================== 舊版快取頁面：打根路徑，收舊格式、回它看得懂的格式 ====================
const legacy = async (env, over = {}, origin = ORIGIN) => {
    const res = await worker.fetch(new Request('https://w/', {
        method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ _provider: 'gemini', model: 'gemini-2.5-flash', messages: [{ role: 'user', content: '心' }], temperature: 0.95, max_tokens: 2000, ...over }),
    }), env, { waitUntil() {} });
    return { status: res.status, j: await res.json() };
};
const geminiWithUsage = text => new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }], usageMetadata: { totalTokenCount: 42 } }),
    { status: 200, headers: { 'Content-Type': 'application/json' } });

test('舊版：_provider gemini 收到 candidates 格式', async () => {
    const f = installFetch(() => geminiOk('心動、微光'));
    try {
        const { status: st, j } = await legacy(makeEnv(), { _provider: 'gemini' });
        expect(st).toBe(200);
        expect(j).toEqual({ candidates: [{ content: { parts: [{ text: '心動、微光' }] } }] });
    } finally { f.restore(); }
});

test('舊版：_provider groq 收到 choices 與 usage', async () => {
    const f = installFetch(() => geminiWithUsage('心動、微光'));
    try {
        const { status: st, j } = await legacy(makeEnv(), { _provider: 'groq', model: 'qwen/qwen3.6-27b' });
        expect(st).toBe(200);
        expect(j).toEqual({ choices: [{ message: { content: '心動、微光' } }], usage: { total_tokens: 42 } });
    } finally { f.restore(); }
});

test('舊版：已下架的 _provider github 也由換手鏈回答，回 choices 格式（沒有 usage 就不放）', async () => {
    const f = installFetch(() => geminiOk('甲、乙'));
    try {
        const { status: st, j } = await legacy(makeEnv(), { _provider: 'github', model: 'gpt-4.1' });
        expect(st).toBe(200);
        expect(j).toEqual({ choices: [{ message: { content: '甲、乙' } }] });
    } finally { f.restore(); }
});

test('舊版：已下架的模型 id 當自動，第一個上游呼叫就是登記的第一個模型', async () => {
    for (const model of ['gpt-4.1', 'qwen/qwen3.6-27b', 'gemini-2.5-flash']) {
        _resetState();
        const f = installFetch(() => geminiOk('甲'));
        try {
            const { status: st } = await legacy(makeEnv(), { _provider: 'github', model });
            expect(st, model).toBe(200);
            expect(idOf(f.calls[0]), model).toBe(G1);
        } finally { f.restore(); }
    }
});

test('舊版：名單內的模型 id 仍當偏好，排在最前面', async () => {
    const f = installFetch(() => groqOk('丙、丁'));
    try {
        const { j } = await legacy(makeEnv(), { _provider: 'groq', model: Q3 });
        expect(idOf(f.calls[0])).toBe(Q3);
        expect(j.choices[0].message.content).toBe('丙、丁');
        expect(f.calls[0].body.max_completion_tokens).toBeLessThanOrEqual(1024);   // 舊頁面要求 2000，仍被登記的上限壓住
    } finally { f.restore(); }
});

test('舊版：全部上游失敗回 503 與 {error:{message}} 白話訊息，不帶上游原文', async () => {
    const f = installFetch(() => status(503, {}, 'UPSTREAM-SECRET-TEXT'));
    try {
        const { status: st, j } = await legacy(makeEnv());
        expect(st).toBe(503);
        expect(j).toEqual({ error: { message: 'AI 暫時都忙不過來，請稍後再試（已嘗試 4 個模型）' } });
    } finally { f.restore(); }
});

test('舊版：來源不對回 403，而且完全不打上游', async () => {
    const f = installFetch(() => geminiOk('甲'));
    try {
        const { status: st, j } = await legacy(makeEnv(), {}, 'https://evil.example');
        expect(st).toBe(403);
        expect(j.error.message).toBeTruthy();
        expect(f.calls).toHaveLength(0);
    } finally { f.restore(); }
});

test('舊版：body 壞掉或 messages 不是陣列回 400，不讓換手鏈出例外', async () => {
    const f = installFetch(() => geminiOk('甲'));
    try {
        const bad = await worker.fetch(new Request('https://w/', {
            method: 'POST', headers: { Origin: ORIGIN }, body: '不是 JSON' }), makeEnv(), { waitUntil() {} });
        expect(bad.status).toBe(400);
        for (const messages of [undefined, 'x', []]) {
            const { status: st, j } = await legacy(makeEnv(), { messages });
            expect(st).toBe(400);
            expect(j.error.message).toBeTruthy();
        }
        expect(f.calls).toHaveLength(0);
    } finally { f.restore(); }
});

// ==================== AI-07：白名單、上限、輸出 token（擋陌生人燒額度） ====================
const rawPost = (env, body, headers = {}, path = 'https://w/ai', extra = {}) => worker.fetch(new Request(path, {
    method: 'POST', headers: { Origin: ORIGIN, ...headers }, body, ...extra,
}), env, { waitUntil() {} });
// 剛好 total 位元組的 /ai body：用 ASCII 空格墊在 JSON 裡，prompt 本身保持很短
const bodyOfBytes = (total, extra = {}) => {
    const base = JSON.stringify({ prompt: '心', model: 'auto', ...extra });
    const pad = total - Buffer.byteLength(base);
    expect(pad).toBeGreaterThanOrEqual(0);
    return base.slice(0, -1) + ' '.repeat(pad) + '}';
};
// 把位元組切成多塊的串流（沒有 Content-Length，用來測「宣告不可信」）
const streamOf = (text, chunk = 8192) => {
    const bytes = new TextEncoder().encode(text);
    let i = 0;
    return new ReadableStream({
        pull(c) { if (i >= bytes.length) c.close(); else { c.enqueue(bytes.slice(i, i + chunk)); i += chunk; } },
    });
};

test('白名單：不在名單的模型回 400 MODEL_NOT_ALLOWED，完全不打上游', async () => {
    const f = installFetch(() => geminiOk('甲'));
    try {
        const { status: st, j } = await ask(makeEnv(), { prompt: '心', model: 'not-a-model' });
        expect(st).toBe(400);
        expect(j).toEqual({ ok: false, code: 'MODEL_NOT_ALLOWED', message: '這個模型不在可用清單裡' });
        expect(f.calls).toHaveLength(0);
        for (const model of [' auto', 'AUTO', 'gemini-2.5-flash', 5, null]) {
            const r = await ask(makeEnv(), { prompt: '心', model });
            expect(r.j.code, String(model)).toBe('MODEL_NOT_ALLOWED');
        }
        expect(f.calls).toHaveLength(0);
    } finally { f.restore(); }
});

test('白名單：auto、沒寫 model、名單內每個 id 都放行', async () => {
    const f = installFetch(() => geminiOk('甲'));
    try {
        const { MODELS } = await import('../worker/src/models.js');
        for (const model of ['auto', undefined, ...MODELS.map(m => m.id)]) {
            const { status: st } = await ask(makeEnv(), model === undefined ? { prompt: '心' } : { prompt: '心', model });
            expect(st, String(model)).toBe(200);
        }
    } finally { f.restore(); }
});

test('白名單：舊版根路徑的未知模型當 auto 照常回答（老頁面自己好起來）', async () => {
    const f = installFetch(() => geminiOk('甲'));
    try {
        const { status: st } = await legacy(makeEnv(), { model: 'not-a-model' });
        expect(st).toBe(200);
        expect(idOf(f.calls[0])).toBe(G1);
    } finally { f.restore(); }
});

test('上限：body 剛好 65,536 位元組放行（有無 Content-Length 都一樣），65,537 回 413', async () => {
    const f = installFetch(() => geminiOk('甲'));
    try {
        const ok = bodyOfBytes(65536), big = bodyOfBytes(65537);
        expect(Buffer.byteLength(ok)).toBe(65536);
        expect(Buffer.byteLength(big)).toBe(65537);
        const a = await rawPost(makeEnv(), ok);
        expect(a.status).toBe(200);
        const b = await rawPost(makeEnv(), ok, { 'Content-Length': '65536' });
        expect(b.status).toBe(200);
        const n = f.calls.length;
        for (const headers of [{}, { 'Content-Length': '65537' }]) {
            const r = await rawPost(makeEnv(), big, headers);
            expect(r.status).toBe(413);
            expect(await r.json()).toEqual({ ok: false, code: 'TOO_LARGE', message: '內容太長，請縮短後再試' });
        }
        expect(f.calls).toHaveLength(n);
    } finally { f.restore(); }
});

test('上限：沒寫 Content-Length 的 70 KB 串流、謊報 100 的 Content-Length、宣告 999999 都回 413，零上游呼叫', async () => {
    const f = installFetch(() => geminiOk('甲'));
    try {
        const text = bodyOfBytes(70 * 1024);
        const stream = await rawPost(makeEnv(), streamOf(text), {}, 'https://w/ai', { duplex: 'half' });
        expect(stream.status).toBe(413);
        const lying = await rawPost(makeEnv(), streamOf(text), { 'Content-Length': '100' }, 'https://w/ai', { duplex: 'half' });
        expect(lying.status).toBe(413);
        const declared = await rawPost(makeEnv(), '{}', { 'Content-Length': '999999' });
        expect(declared.status).toBe(413);
        const legacyBig = await rawPost(makeEnv(), streamOf(text), {}, 'https://w/', { duplex: 'half' });
        expect(legacyBig.status).toBe(413);
        expect((await legacyBig.json()).error.message).toBe('內容太長，請縮短後再試');
        expect(f.calls).toHaveLength(0);
    } finally { f.restore(); }
});

test('上限：超過上限就停止讀取串流（不會把 70 KB 全部讀完）', async () => {
    const f = installFetch(() => geminiOk('甲'));
    try {
        let pulled = 0, cancelled = false;
        const stream = new ReadableStream({
            pull(c) { pulled++; c.enqueue(new Uint8Array(8192).fill(32)); },
            cancel() { cancelled = true; },
        });
        const r = await rawPost(makeEnv(), stream, {}, 'https://w/ai', { duplex: 'half' });
        expect(r.status).toBe(413);
        expect(cancelled).toBe(true);
        expect(pulled).toBeLessThan(20);
    } finally { f.restore(); }
});

test('上限：位元組不是字元數，21,846 個「音」（65,538 位元組，字元數低於 24,000）回 413', async () => {
    const f = installFetch(() => geminiOk('甲'));
    try {
        const prompt = '音'.repeat(21846);
        expect(Buffer.byteLength(prompt)).toBe(65538);
        expect(prompt.length).toBeLessThan(24000);
        const { status: st, j } = await ask(makeEnv(), { prompt });
        expect(st).toBe(413);
        expect(j.code).toBe('TOO_LARGE');
        expect(f.calls).toHaveLength(0);
    } finally { f.restore(); }
});

test('上限：prompt 剛好 24,000 字放行，24,001 字回 413', async () => {
    const f = installFetch(() => geminiOk('甲'));
    try {
        const ok = await ask(makeEnv(), { prompt: 'a'.repeat(24000) });
        expect(ok.status).toBe(200);
        const n = f.calls.length;
        const big = await ask(makeEnv(), { prompt: 'a'.repeat(24001) });
        expect(big.status).toBe(413);
        expect(big.j.code).toBe('TOO_LARGE');
        expect(f.calls).toHaveLength(n);
    } finally { f.restore(); }
});

test('上限：舊版 messages 剛好 8 則放行，9 則與 0 則回 400', async () => {
    const f = installFetch(() => geminiOk('甲'));
    try {
        const msgs = n => Array.from({ length: n }, () => ({ role: 'user', content: '心' }));
        expect((await legacy(makeEnv(), { messages: msgs(8) })).status).toBe(200);
        const n = f.calls.length;
        expect((await legacy(makeEnv(), { messages: msgs(9) })).status).toBe(400);
        expect((await legacy(makeEnv(), { messages: msgs(0) })).status).toBe(400);
        expect(f.calls).toHaveLength(n);
    } finally { f.restore(); }
});

test('上限：舊版 messages 內容合計超過 24,000 字回 413；非字串內容或未知角色回 400', async () => {
    const f = installFetch(() => geminiOk('甲'));
    try {
        const half = 'a'.repeat(12000);
        const ok = await legacy(makeEnv(), { messages: [{ role: 'user', content: half }, { role: 'assistant', content: half }] });
        expect(ok.status).toBe(200);
        const n = f.calls.length;
        const big = await legacy(makeEnv(), { messages: [{ role: 'user', content: half }, { role: 'user', content: half + 'a' }] });
        expect(big.status).toBe(413);
        for (const messages of [[{ role: 'user', content: 5 }], [{ role: 'god', content: 'x' }], [null], ['x'], [{ role: 'user' }]]) {
            const r = await legacy(makeEnv(), { messages });
            expect(r.status, JSON.stringify(messages)).toBe(400);
        }
        expect(f.calls).toHaveLength(n);
    } finally { f.restore(); }
});

test('上限：不是 JSON 或 prompt 缺、空、不是字串都回 400 BAD_REQUEST', async () => {
    const f = installFetch(() => geminiOk('甲'));
    try {
        const bad = await rawPost(makeEnv(), '不是 JSON');
        expect(bad.status).toBe(400);
        expect((await bad.json()).code).toBe('BAD_REQUEST');
        for (const body of [{}, { prompt: '' }, { prompt: 5 }, { prompt: ['a'] }, [], null]) {
            const r = await ask(makeEnv(), body);
            expect(r.status, JSON.stringify(body)).toBe(400);
            expect(r.j.code, JSON.stringify(body)).toBe('BAD_REQUEST');
        }
        expect(f.calls).toHaveLength(0);
    } finally { f.restore(); }
});

test('token：maxTokens 99999 → Gemini 2048、Groq 1024；50 維持 50；沒給用 2048', async () => {
    const f = installFetch(() => status(503));
    try {
        await ask(makeEnv(), { prompt: '心', model: G1, maxTokens: 99999 });
        await ask(makeEnv(), { prompt: '心', model: Q1, maxTokens: 99999 });
        expect(f.calls[0].body.generationConfig.maxOutputTokens).toBe(2048);
        const groq = f.calls.find(c => idOf(c) === Q1);
        expect(groq.body.max_completion_tokens).toBe(1024);
        f.calls.length = 0; _resetState();
        await ask(makeEnv(), { prompt: '心', model: G1, maxTokens: 50 });
        expect(f.calls[0].body.generationConfig.maxOutputTokens).toBe(50);
        f.calls.length = 0; _resetState();
        for (const maxTokens of [undefined, 'many', -5, 0, NaN]) {
            _resetState(); f.calls.length = 0;
            await ask(makeEnv(), { prompt: '心', model: G1, maxTokens });
            expect(f.calls[0].body.generationConfig.maxOutputTokens, String(maxTokens)).toBe(2048);
        }
    } finally { f.restore(); }
});

test('token：temperature 5 → 1、-1 → 0、字串 → 0.95；舊版 max_tokens 與 temperature 同樣被夾住', async () => {
    const f = installFetch(() => status(503));
    try {
        const temps = [];
        for (const temperature of [5, -1, 'hot', 0.3]) {
            _resetState(); f.calls.length = 0;
            await ask(makeEnv(), { prompt: '心', model: G1, temperature });
            temps.push(f.calls[0].body.generationConfig.temperature);
        }
        expect(temps).toEqual([1, 0, 0.95, 0.3]);
        _resetState(); f.calls.length = 0;
        await legacy(makeEnv(), { max_tokens: 99999, temperature: 5 });
        expect(f.calls[0].body.generationConfig.maxOutputTokens).toBe(2048);
        expect(f.calls[0].body.generationConfig.temperature).toBe(1);
    } finally { f.restore(); }
});

// ==================== AI-07：來源、限流、不洩漏 ====================
// 三條 AI 路徑各用自己的請求方式；origin 傳 null 代表完全不帶 Origin 標頭
const hit = (env, route, origin) => {
    const headers = origin === null ? {} : { Origin: origin };
    const init = route === 'GET /models' ? { method: 'GET', headers }
        : { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify(route === 'POST /ai' ? { prompt: '心' } : { messages: [{ role: 'user', content: '心' }] }) };
    const url = route === 'POST /ai' ? 'https://w/ai' : route === 'GET /models' ? 'https://w/models' : 'https://w/';
    return worker.fetch(new Request(url, init), env, { waitUntil() {} });
};
const ROUTES = ['POST /ai', 'GET /models', 'POST /'];

test('來源：別的網站、沒帶 Origin、長得像的網址都回 403，三條路徑都一樣，完全不打上游', async () => {
    const f = installFetch(() => geminiOk('甲'));
    try {
        for (const origin of ['https://evil.example', null, 'https://andy-coin.github.io.evil.com', 'http://andy-coin.github.io',
            'https://andy-coin.github.io:8443', 'null']) {
            for (const route of ROUTES) {
                const res = await hit(makeEnv(), route, origin);
                expect(res.status, `${route} ${origin}`).toBe(403);
                const acao = res.headers.get('Access-Control-Allow-Origin');
                expect(acao, `${route} ${origin}`).not.toBe(origin);       // 被拒的來源絕不被回聲
                const j = await res.json();
                expect(JSON.stringify(j), `${route} ${origin}`).toMatch(/來源不被允許/);
            }
        }
        expect(f.calls).toHaveLength(0);
    } finally { f.restore(); }
});

test('來源：正式網站放行並回聲在 Access-Control-Allow-Origin', async () => {
    const f = installFetch(() => geminiOk('甲'));
    try {
        for (const route of ROUTES) {
            const res = await hit(makeEnv(), route, ORIGIN);
            expect(res.status, route).toBe(200);
            expect(res.headers.get('Access-Control-Allow-Origin'), route).toBe(ORIGIN);
        }
    } finally { f.restore(); }
});

test('來源：localhost 與 127.0.0.1 沒開開關一律 403，開了 ALLOW_LOCAL_ORIGIN 才放行並回聲', async () => {
    const f = installFetch(() => geminiOk('甲'));
    try {
        for (const origin of ['http://localhost:4310', 'http://127.0.0.1:4310', 'https://localhost']) {
            for (const route of ROUTES) {
                expect((await hit(makeEnv(), route, origin)).status, `無開關 ${route} ${origin}`).toBe(403);
                expect((await hit(makeEnv({ ALLOW_LOCAL_ORIGIN: '0' }), route, origin)).status, `開關 0 ${route} ${origin}`).toBe(403);
                const res = await hit(makeEnv({ ALLOW_LOCAL_ORIGIN: '1' }), route, origin);
                expect(res.status, `有開關 ${route} ${origin}`).toBe(200);
                expect(res.headers.get('Access-Control-Allow-Origin')).toBe(origin);
            }
        }
    } finally { f.restore(); }
});

test('來源：開關打開時，長得像 localhost 的網址與非 http(s) 協定仍回 403', async () => {
    const f = installFetch(() => geminiOk('甲'));
    try {
        const env = () => makeEnv({ ALLOW_LOCAL_ORIGIN: '1' });
        for (const origin of ['http://localhost.evil.com', 'http://evil.com/localhost', 'http://127.0.0.1.evil.com', 'http://notlocalhost:4310',
            'ftp://localhost', 'file://localhost', 'localhost', '']) {
            for (const route of ROUTES) {
                const res = await hit(env(), route, origin);
                expect(res.status, `${route} ${origin}`).toBe(403);
            }
        }
        expect(f.calls).toHaveLength(0);
    } finally { f.restore(); }
});

test('限流：AI_LIMITER 回 success:false 時 /ai 與根路徑回 429 RATE_LIMITED，零上游呼叫', async () => {
    const f = installFetch(() => geminiOk('甲'));
    try {
        const env = makeEnv({ AI_LIMITER: { limit: async () => ({ success: false }) } });
        const a = await hit(env, 'POST /ai', ORIGIN);
        expect(a.status).toBe(429);
        expect(await a.json()).toEqual({ ok: false, code: 'RATE_LIMITED', message: '操作太頻繁，請稍後再試' });
        const b = await hit(env, 'POST /', ORIGIN);
        expect(b.status).toBe(429);
        expect(await b.json()).toEqual({ error: { message: '操作太頻繁，請稍後再試' } });
        expect(f.calls).toHaveLength(0);
    } finally { f.restore(); }
});

test('限流：success:true 照常服務；key 是 CF-Connecting-IP，沒有這個標頭用 unknown；限流在讀 body 之前', async () => {
    const f = installFetch(() => geminiOk('甲'));
    try {
        const keys = [];
        const env = makeEnv({ AI_LIMITER: { limit: async ({ key }) => { keys.push(key); return { success: true }; } } });
        const withIp = await worker.fetch(new Request('https://w/ai', {
            method: 'POST', headers: { Origin: ORIGIN, 'CF-Connecting-IP': '203.0.113.7' }, body: JSON.stringify({ prompt: '心' }),
        }), env, { waitUntil() {} });
        expect(withIp.status).toBe(200);
        expect((await hit(env, 'POST /', ORIGIN)).status).toBe(200);
        expect(keys).toEqual(['203.0.113.7', 'unknown']);
        // 被限流的請求連 body 都不讀：給一個讀了就會丟錯的串流
        let read = false;
        const stream = new ReadableStream({ pull() { read = true; throw new Error('should not read'); } }, { highWaterMark: 0 });   // 0：建構 Request 時不預先拉資料
        const blocked = await worker.fetch(new Request('https://w/ai', { method: 'POST', headers: { Origin: ORIGIN }, body: stream, duplex: 'half' }),
            makeEnv({ AI_LIMITER: { limit: async () => ({ success: false }) } }), { waitUntil() {} });
        expect(blocked.status).toBe(429);
        expect(read).toBe(false);
    } finally { f.restore(); }
});

test('WR-02：限流 key——IPv6 取 /64（含 :: 縮寫與大小寫）、IPv4 完整位址、IPv4 映射還原、沒標頭是 unknown', async () => {
    const f = installFetch(() => geminiOk('甲'));
    try {
        const keys = [];
        const env = makeEnv({ AI_LIMITER: { limit: async ({ key }) => { keys.push(key); return { success: true }; } } });
        for (const ip of ['2001:db8:1:2:aaaa:bbbb:cccc:dddd', '2001:DB8:1:2::1', '2001:db8:1:2:0:0:0:9', '2001:db8::1', '::1', '::ffff:203.0.113.7', '203.0.113.7']) {
            await worker.fetch(new Request('https://w/ai', { method: 'POST', headers: { Origin: ORIGIN, 'CF-Connecting-IP': ip }, body: JSON.stringify({ prompt: '心' }) }), env, { waitUntil() {} });
        }
        expect(keys).toEqual(['2001:db8:1:2', '2001:db8:1:2', '2001:db8:1:2', '2001:db8:0:0', '0:0:0:0', '203.0.113.7', '203.0.113.7']);
    } finally { f.restore(); }
});

test('WR-06：沒預期的例外（讀 body 時串流壞掉）回 500 JSON 帶 CORS，不洩漏內部細節，新舊格式都讀得到訊息', async () => {
    const realErr = console.error, lines = [];
    console.error = (...a) => lines.push(a.join(' '));
    try {
        for (const path of ['https://w/ai', 'https://w/']) {
            const broken = new ReadableStream({ pull() { throw new Error('INTERNAL-BOOM-DETAIL'); } }, { highWaterMark: 0 });
            const res = await worker.fetch(new Request(path, { method: 'POST', headers: { Origin: ORIGIN }, body: broken, duplex: 'half' }), makeEnv(), { waitUntil() {} });
            expect(res.status, path).toBe(500);
            expect(res.headers.get('Access-Control-Allow-Origin'), path).toBe(ORIGIN);
            const j = await res.json();
            expect(j, path).toMatchObject({ ok: false, code: 'INTERNAL', message: 'AI 暫時無法使用，請稍後再試', error: { message: 'AI 暫時無法使用，請稍後再試' } });
            expect(JSON.stringify(j), path).not.toContain('BOOM');
        }
        expect(lines.filter(l => l.includes('未預期錯誤'))).toHaveLength(2);
    } finally { console.error = realErr; }
});

test('限流：沒有 AI_LIMITER 綁定照常服務；限流器丟例外也放行並記一行 console.error', async () => {
    const f = installFetch(() => geminiOk('甲'));
    const realErr = console.error, lines = [];
    console.error = (...a) => lines.push(a.join(' '));
    try {
        expect((await hit(makeEnv(), 'POST /ai', ORIGIN)).status).toBe(200);
        expect((await hit(makeEnv(), 'POST /', ORIGIN)).status).toBe(200);
        const boom = makeEnv({ AI_LIMITER: { limit: async () => { throw new Error('limiter down'); } } });
        expect((await hit(boom, 'POST /ai', ORIGIN)).status).toBe(200);
        expect((await hit(boom, 'POST /', ORIGIN)).status).toBe(200);
        expect(lines.filter(l => l.includes('限流檢查失敗'))).toHaveLength(2);
    } finally { console.error = realErr; f.restore(); }
});

test('限流：/models 與回報路徑不受限流影響', async () => {
    const f = installFetch(() => geminiOk('甲'));
    try {
        const env = makeEnv({ AI_LIMITER: { limit: async () => ({ success: false }) } });
        expect((await hit(env, 'GET /models', ORIGIN)).status).toBe(200);
    } finally { f.restore(); }
});

test('不洩漏：上游 500/400/429 的內文與金鑰不出現在 /ai 與舊版回應，也不出現在 console.error', async () => {
    const SECRET = 'SECRET-UPSTREAM-DETAIL g-test q-test admin-test https://generativelanguage.googleapis.com https://api.groq.com';
    const realErr = console.error, lines = [];
    console.error = (...a) => lines.push(a.join(' '));
    try {
        for (const code of [500, 400, 429]) {
            _resetState();
            const f = installFetch(() => status(code, {}, SECRET));
            try {
                const env = makeEnv();
                const a = await post(env, { prompt: '心' });
                const b = await legacy(env);
                const seen = [await a.text(), JSON.stringify(b.j)].join('\n');
                for (const bad of ['g-test', 'q-test', 'admin-test', 'SECRET-UPSTREAM-DETAIL', 'googleapis', 'groq.com']) {
                    expect(seen, `${code} 回應含 ${bad}`).not.toContain(bad);
                }
            } finally { f.restore(); }
        }
        const logged = lines.join('\n');
        expect(logged.length).toBeGreaterThan(0);                    // 確實有記錄失敗，下面的斷言才有意義
        for (const key of ['g-test', 'q-test', 'admin-test']) expect(logged).not.toContain(key);
    } finally { console.error = realErr; }
});

test('不洩漏：被拒絕的請求（白名單、過大、來源、限流）回應也不帶金鑰或上游資訊', async () => {
    const f = installFetch(() => geminiOk('甲'));
    try {
        const env = makeEnv({ AI_LIMITER: { limit: async ({ key }) => ({ success: key !== 'limited' }) } });
        const texts = [
            await (await post(env, { prompt: '心', model: 'nope' })).text(),
            await (await rawPost(env, bodyOfBytes(70000))).text(),
            await (await hit(env, 'POST /ai', 'https://evil.example')).text(),
            await (await worker.fetch(new Request('https://w/ai', { method: 'POST', headers: { Origin: ORIGIN, 'CF-Connecting-IP': 'limited' }, body: '{}' }), env, { waitUntil() {} })).text(),
        ];
        for (const t of texts) for (const bad of ['g-test', 'q-test', 'admin-test', 'googleapis', 'groq.com']) expect(t).not.toContain(bad);
        expect(f.calls).toHaveLength(0);
    } finally { f.restore(); }
});
