// ==================== 好韻器 Worker：路由 ====================
// 瀏覽器不再指定供應商、金鑰或模型清單（D-06）：只送 { prompt, model, temperature }，由 Worker 決定怎麼呼叫。
// plan 02-02／02-03 會再補回報後台與舊版相容路由。
import { runChain } from './ai.js';

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

const BAD_REQUEST = { ok: false, code: 'BAD_REQUEST', message: '請求格式不正確' };

async function handleAi(request, env, origin) {
    let body;
    try { body = await request.json(); } catch (e) { return json(400, BAD_REQUEST, origin, env); }
    if (!body || typeof body.prompt !== 'string' || !body.prompt) return json(400, BAD_REQUEST, origin, env);
    const t = Number(body.temperature);
    const req = {
        messages: [{ role: 'user', content: body.prompt }],
        model: typeof body.model === 'string' ? body.model : 'auto',
        temperature: Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0.95,
        maxTokens: 2048,
    };
    const { status, payload } = await runChain(req, env);
    return json(status, payload, origin, env);
}

export default {
    async fetch(request, env, ctx) {
        const origin = request.headers.get('Origin') || '';
        const { pathname } = new URL(request.url);
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin, env) });
        if (pathname === '/ai') {
            if (!originAllowed(origin, env)) return json(403, { ok: false, code: 'FORBIDDEN', message: '來源不被允許' }, origin, env);
            if (request.method !== 'POST') return json(405, { ok: false, code: 'METHOD', message: '不支援這個操作' }, origin, env);
            return handleAi(request, env, origin);
        }
        return json(404, { ok: false, code: 'NOT_FOUND', message: '找不到這個路徑' }, origin, env);
    },
};
