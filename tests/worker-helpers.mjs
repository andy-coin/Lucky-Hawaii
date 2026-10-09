// Worker 測試共用工具：假的 KV、假的環境、可記錄呼叫的 fetch 替身，以及把瀏覽器請求接進 Worker 程式碼的橋
import worker from '../worker/src/index.js';
import { BASE } from './helpers.mjs';

// 失敗模式（給 Phase 7 的寫入測試）：failPut = true → 下一次 put 丟「一秒一次」錯誤後復原；
// staleOnce(key, 舊值) → 下一次 get 讀到舊值（模擬 KV 邊緣快取）；list 支援 cursor／limit 分頁，pageSize 可改預設頁大小
export class FakeKV {
    constructor(init = {}) { this.m = new Map(Object.entries(init)); this.gets = 0; this.puts = 0; this.stale = new Map(); this.failPut = false; }
    async get(k, opts) {
        this.gets++; this.lastGetOpts = opts;
        if (this.stale.has(k)) { const v = this.stale.get(k); this.stale.delete(k); return v; }
        return this.m.has(k) ? this.m.get(k) : null;
    }
    async put(k, v) {
        if (this.failPut) { this.failPut = false; throw new Error('KV PUT failed: 1 write per second'); }
        this.puts++; this.m.set(k, typeof v === 'string' ? v : String(v));
    }
    async delete(k) { this.m.delete(k); }
    staleOnce(k, v) { this.stale.set(k, v); }
    async list({ cursor, limit } = {}) {
        const names = [...this.m.keys()].sort();
        const size = limit ?? this.pageSize ?? 1000;
        const from = cursor ? Number(cursor) : 0;
        const keys = names.slice(from, from + size).map(name => ({ name }));
        const complete = from + size >= names.length;
        return complete ? { keys, list_complete: true } : { keys, list_complete: false, cursor: String(from + size) };
    }
}

export const makeEnv = (over = {}) => ({
    GEMINI_API_KEY: 'g-test', GROQ_API_KEY: 'q-test', USER_REPORT_KEY: 'admin-test',
    USER_FEEDBACK_KV: new FakeKV(), AI_STATE_KV: new FakeKV(), ATTEMPT_TIMEOUT_MS: '60', PROBE_RETRY_DELAY_MS: '0', ...over,
});

// handler(url, init, n) 可回 Response、字串 'hang'（一直不回，直到被 abort）或 Error（網路錯誤）；
// 每次呼叫都記在 calls 裡，測試用來斷言「打了誰、帶了什麼」
export function installFetch(handler) {
    const real = globalThis.fetch, calls = [];
    globalThis.fetch = async (url, init = {}) => {
        calls.push({ url: String(url), init, body: init.body ? JSON.parse(init.body) : null });
        const r = await handler(String(url), init, calls.length);
        if (r === 'hang') return new Promise((_, rej) => init.signal?.addEventListener('abort', () => rej(init.signal.reason)));
        if (r instanceof Error) throw r;
        return r;
    };
    return { calls, restore: () => { globalThis.fetch = real; } };
}

export const geminiOk = text => new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } });

export const groqOk = text => new Response(
    JSON.stringify({ choices: [{ message: { content: text } }], usage: { total_tokens: 9 } }),
    { status: 200, headers: { 'Content-Type': 'application/json' } });

// 依網址分流：Gemini 一律用 gen，Groq 一律用 groq
export const byProvider = (gen, groq) => (url, init, n) => url.includes('generativelanguage') ? gen(url, init, n) : groq(url, init, n);

// 假的 ExecutionContext：waitUntil 收下的 promise 放進 promises，測試自己 await
export const makeCtx = () => ({ promises: [], waitUntil(p) { this.promises.push(p); } });

// 瀏覽器測試用這個把 Worker 網址的請求交給 worker/src/index.js 在測試程序內真的跑一遍（不是 mock 回覆）
// reflectOrigin：回報／後台路徑的 ACAO 固定是正式網站，測試頁面在 127.0.0.1 會被瀏覽器的 CORS 擋掉，
// 後台測試要把 ACAO 換成請求來源才讀得到（只換測試用的回應，Worker 本身的 CORS 另有 worker-admin 測試守）
export async function bridgeWorker(context, env, { reflectOrigin = false } = {}) {
    await context.route(url => new URL(url).hostname === 'lucky-hawaii.is3000dollar.workers.dev', async route => {
        const r = route.request();
        const headers = await r.allHeaders();
        if (!headers.origin) headers.origin = BASE;
        const hasBody = !['GET', 'HEAD'].includes(r.method());
        const res = await worker.fetch(
            new Request(r.url(), { method: r.method(), headers, body: hasBody ? r.postDataBuffer() : undefined }),
            env, { waitUntil() {} });
        const out = Object.fromEntries(res.headers);
        if (reflectOrigin && out['access-control-allow-origin']) out['access-control-allow-origin'] = headers.origin;
        await route.fulfill({ status: res.status, headers: out, body: Buffer.from(await res.arrayBuffer()) });
    });
}
