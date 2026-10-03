// ==================== 好韻器 Worker：路由 ====================
// 瀏覽器不再指定供應商、金鑰或模型清單（D-06）：只送 { prompt, model, temperature }，由 Worker 決定怎麼呼叫。
// 回報與後台路徑已在 plan 02-02 搬進來；舊版相容路由在 plan 02-03。
import { runChain, toLegacy, parseAiBody, parseLegacyBody, BAD_REQUEST_ERROR, TOO_LARGE_ERROR } from './ai.js';
import { MODELS } from './models.js';

const ALLOWED_ORIGIN = 'https://andy-coin.github.io';

// 本機測試的來源（localhost／127.0.0.1）只在 wrangler dev 加上 --var ALLOW_LOCAL_ORIGIN:1 時才放行（D-20）；
// 這個開關不寫進 wrangler.toml，所以正式環境永遠只認 GitHub Pages
export function originAllowed(origin, env) {
    if (origin === ALLOWED_ORIGIN) return true;
    if (env.ALLOW_LOCAL_ORIGIN !== '1' || !origin) return false;
    try {
        const host = new URL(origin).hostname;
        return host === 'localhost' || host === '127.0.0.1';
    } catch (e) {
        console.warn('[好韻器] Origin 無法解析', e.message);
        return false;
    }
}

function corsHeaders(origin, env) {
    return {
        'Access-Control-Allow-Origin': originAllowed(origin, env) ? origin : ALLOWED_ORIGIN,
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Vary': 'Origin',
    };
}

export function json(status, obj, origin, env = {}) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin, env) },
    });
}

// 請求本文上限 64 KB，以位元組計（中文一字 3 bytes）。Content-Length 只是宣告、不可信，所以一律邊讀邊數，超過就停止讀取。
const MAX_BODY_BYTES = 65536;
async function readBodyCapped(request) {
    const declared = Number(request.headers.get('Content-Length'));
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return { ok: false };
    if (!request.body) return { ok: true, text: '' };
    const reader = request.body.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_BODY_BYTES) { await reader.cancel(); return { ok: false }; }
        chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let at = 0;
    for (const c of chunks) { bytes.set(c, at); at += c.byteLength; }
    return { ok: true, text: new TextDecoder('utf-8').decode(bytes) };
}

// 讀（有上限）→ 解析 JSON → 交給 parse：回 { req } 或 { error: { status, code, message } }
async function readAiRequest(request, parse) {
    const r = await readBodyCapped(request);
    if (!r.ok) return { error: TOO_LARGE_ERROR };
    let body;
    try { body = JSON.parse(r.text); } catch (e) { return { error: BAD_REQUEST_ERROR }; }
    return parse(body);
}

async function handleAi(request, env, origin) {
    const parsed = await readAiRequest(request, parseAiBody);
    if (parsed.error) {
        const { status, code, message } = parsed.error;
        return json(status, { ok: false, code, message }, origin, env);
    }
    const { status, payload } = await runChain(parsed.req, env);
    return json(status, payload, origin, env);
}

// 舊版快取頁面（GitHub Pages 快取 10 分鐘）仍打根路徑：收舊格式的 body，走同一條換手鏈，再依它的 _provider 回它看得懂的格式。
// 不在名單內的舊模型（gpt-4.1、已下架的 qwen3.6 等）一律當「自動」，讓舊頁面自己好起來（D-06）；大小與數量上限和 /ai 共用。
async function handleLegacy(request, env, origin) {
    // 先拿 _provider：它只決定回覆長相；parse 完的 req 不帶它
    let provider;
    const parsed = await readAiRequest(request, body => {
        provider = body?._provider;
        return parseLegacyBody(body);
    });
    if (parsed.error) return json(parsed.error.status, { error: { message: parsed.error.message } }, origin, env);
    const { status, payload } = await runChain(parsed.req, env);
    return json(status, toLegacy(provider, status, payload), origin, env);
}

// ==================== 回報與後台路徑（從舊的後台 Worker 原封不動搬過來） ====================
// admin/index.html 依賴這些路徑與回應格式，所以狀態碼、回應內容、檢查順序都和舊版一樣；
// 強化（金鑰改走 header、防注入）在 Phase 7。GITHUB_API_KEY 已不再使用（GitHub Models 已下架）。
const FEEDBACK_JSON = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': ALLOWED_ORIGIN };
const feedbackJson = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: FEEDBACK_JSON });

// 回傳 null 代表這個路徑不歸這裡管，交給後面的 /ai、/models
async function handleFeedbackAdmin(request, env, url) {
    const path = url.pathname;
    const keyOk = () => url.searchParams.get('key') === env.USER_REPORT_KEY;

    // /feedback：儲存回報到 KV（先判斷方法，再判斷來源；只認正式網站，不受本機開關影響）
    if (path === '/feedback') {
        if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
        if (request.headers.get('Origin') !== ALLOWED_ORIGIN) return new Response('Forbidden', { status: 403 });
        try {
            const data = await request.json();
            const key = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            await env.USER_FEEDBACK_KV.put(key, JSON.stringify({ ...data, ts: new Date().toISOString() }));
            return feedbackJson({ ok: true });
        } catch (e) {
            return feedbackJson({ error: e.message }, 500);
        }
    }

    // /reports.json：給 admin 後台的列表（需密鑰），新到舊，壞掉的值直接丟掉
    if (path === '/reports.json') {
        if (!keyOk()) return new Response('Forbidden', { status: 403 });
        try {
            const list = await env.USER_FEEDBACK_KV.list();
            const items = (await Promise.all(list.keys.map(async k => {
                const val = await env.USER_FEEDBACK_KV.get(k.name);
                try {
                    const obj = val ? JSON.parse(val) : null;
                    if (obj) obj.kvKey = k.name;
                    return obj;
                } catch (e) { return null; } // 舊版就是這樣丟掉壞資料；Worker 內沒有 showToast 可用
            }))).filter(Boolean);
            items.sort((a, b) => new Date(b.ts) - new Date(a.ts));
            return feedbackJson(items);
        } catch (e) {
            return feedbackJson({ error: e.message }, 500);
        }
    }

    // /reports/decision：寫回決定狀態（需密鑰；先判斷密鑰，再判斷方法）
    // body: { kvKey, status: 'pending'|'agreed'|'dismissed'|'archived', action?: {...} }
    if (path === '/reports/decision') {
        if (!keyOk()) return new Response('Forbidden', { status: 403 });
        if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
        try {
            const { kvKey, status, action } = await request.json();
            if (!kvKey || !status) return feedbackJson({ error: 'kvKey and status required' }, 400);
            const val = await env.USER_FEEDBACK_KV.get(kvKey);
            if (!val) return feedbackJson({ error: 'Not Found' }, 404);
            const obj = JSON.parse(val);
            if (status === 'pending') {
                delete obj.status; delete obj.decided_at; delete obj.action;
            } else {
                obj.status = status;
                obj.decided_at = new Date().toISOString();
                if (action) obj.action = action; else delete obj.action;
            }
            await env.USER_FEEDBACK_KV.put(kvKey, JSON.stringify(obj));
            return feedbackJson({ ok: true });
        } catch (e) {
            return feedbackJson({ error: e.message }, 500);
        }
    }

    // /reports/delete：永久刪除一筆（需密鑰）
    if (path === '/reports/delete') {
        if (!keyOk()) return new Response('Forbidden', { status: 403 });
        if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
        try {
            const { kvKey } = await request.json();
            if (!kvKey) return feedbackJson({ error: 'kvKey required' }, 400);
            await env.USER_FEEDBACK_KV.delete(kvKey);
            return feedbackJson({ ok: true });
        } catch (e) {
            return feedbackJson({ error: e.message }, 500);
        }
    }

    // /reports：舊的 HTML 視圖已移除，改用 admin 後台（讀 /reports.json）
    if (path === '/reports') return new Response('Moved: 請使用 /admin/ 後台（資料來源 /reports.json）', { status: 410 });

    return null;
}

export default {
    async fetch(request, env, ctx) {
        const origin = request.headers.get('Origin') || '';
        const url = new URL(request.url);
        const { pathname } = url;
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin, env) });
        const admin = await handleFeedbackAdmin(request, env, url);
        if (admin) return admin;
        if (pathname === '/ai') {
            if (!originAllowed(origin, env)) return json(403, { ok: false, code: 'FORBIDDEN', message: '來源不被允許' }, origin, env);
            if (request.method !== 'POST') return json(405, { ok: false, code: 'METHOD', message: '不支援這個操作' }, origin, env);
            return handleAi(request, env, origin);
        }
        if (pathname === '/' && request.method === 'POST') {
            if (!originAllowed(origin, env)) return json(403, { error: { message: '來源不被允許' } }, origin, env);
            return handleLegacy(request, env, origin);
        }
        if (pathname === '/models') {
            if (!originAllowed(origin, env)) return json(403, { ok: false, code: 'FORBIDDEN', message: '來源不被允許' }, origin, env);
            if (request.method !== 'GET') return json(405, { ok: false, code: 'METHOD', message: '不支援這個操作' }, origin, env);
            // 網站選單的資料來源（D-14）；plan 02-05 改成讀每日健康檢查的結果並填入 checkedAt，回傳格式不變
            return json(200, { ok: true, models: MODELS.map(({ id, label, provider }) => ({ id, label, provider })), checkedAt: null }, origin, env);
        }
        return json(404, { ok: false, code: 'NOT_FOUND', message: '找不到這個路徑' }, origin, env);
    },
};
