// ==================== 好韻器 Worker：路由 ====================
// 瀏覽器不再指定供應商、金鑰或模型清單（D-06）：只送 { prompt, model, temperature }，由 Worker 決定怎麼呼叫。
// 回報與後台路徑已在 plan 02-02 搬進來；舊版相容路由在 plan 02-03。
import { runChain, toLegacy, parseAiBody, parseLegacyBody, BAD_REQUEST_ERROR, TOO_LARGE_ERROR } from './ai.js';
import { runHealthCheck, readHealth, activeModels, HEALTH_KEY } from './health.js';
import { handleCorrections } from './corrections.js';

const ALLOWED_ORIGIN = 'https://andy-coin.github.io';

// 本機測試的來源（localhost／127.0.0.1）只在 wrangler dev 加上 --var ALLOW_LOCAL_ORIGIN:1 時才放行（D-20）；
// 這個開關不寫進 wrangler.toml，所以正式環境永遠只認 GitHub Pages
export function originAllowed(origin, env) {
    if (origin === ALLOWED_ORIGIN) return true;
    if (env.ALLOW_LOCAL_ORIGIN !== '1' || !origin) return false;
    try {
        const u = new URL(origin);
        return (u.protocol === 'http:' || u.protocol === 'https:') && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
    } catch (e) {
        console.warn('[好韻器] Origin 無法解析', e.message);
        return false;
    }
}

function corsHeaders(origin, env) {
    return {
        'Access-Control-Allow-Origin': originAllowed(origin, env) ? origin : ALLOWED_ORIGIN,
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
        'Access-Control-Max-Age': '7200',   // 預檢結果讓瀏覽器記 2 小時，後台連續操作不必每次多一趟 OPTIONS
        'Vary': 'Origin',
    };
}

export function json(status, obj, origin, env = {}, extra = {}) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin, env), ...extra },
    });
}

// 後台金鑰檢查：所有後台路徑共用這一個。X-Admin-Key header 優先，舊的 ?key= 第二（B4）。
// 空金鑰一律拒絕，連 USER_REPORT_KEY 沒設定（空字串）時也一樣，不會變成「空對空」放行。
// ?key= 舊版後台還在用（Worker 會先於 main 部署），v2 移除
export function adminKeyOk(request, url, env) {
    const key = request.headers.get('X-Admin-Key') ?? url.searchParams.get('key');
    return typeof key === 'string' && key !== '' && !!env.USER_REPORT_KEY && key === env.USER_REPORT_KEY;
}

// 請求本文上限 64 KB，以位元組計（中文一字 3 bytes）。Content-Length 只是宣告、不可信，所以一律邊讀邊數，超過就停止讀取。
const MAX_BODY_BYTES = 65536;
const MAX_FEEDBACK_BYTES = 8192;   // 回報只是幾行字，8 KB 綽綽有餘；/feedback 每次都寫一筆 KV，不能讓人塞大內容
export async function readBodyCapped(request, max = MAX_BODY_BYTES) {
    const declared = Number(request.headers.get('Content-Length'));
    if (Number.isFinite(declared) && declared > max) return { ok: false };
    if (!request.body) return { ok: true, text: '' };
    const reader = request.body.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > max) { await reader.cancel(); return { ok: false }; }
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

// 每個 IP 的請求上限（D-19）。Origin 擋得住別的網站的瀏覽器，擋不住腳本；真正的防線是白名單、上限與限流。
// 沒有 AI_LIMITER 綁定就不限流（部署時若免費方案拒絕這段設定，刪掉即可）；限流器自己出錯也放行：免費個人工具，可用性比嚴格更重要。
// 計數在 Cloudflare 是每個地點各算、最終一致，所以同一個 IP 短時間內可能略多於上限才開始收到 429。
// IPv6 用戶通常整個 /64 都是自己的，一個請求換一個位址就繞得過去，所以 IPv6 以前 4 組（/64）當 key；IPv4 用完整位址。
// 先把 :: 展開再取前 4 組，免得 2001:db8::1 這種縮寫被誤判；IPv4 映射位址（::ffff:1.2.3.4）還原成 IPv4。
export function rateKey(ip) {
    if (!ip.includes(':')) return ip;
    if (ip.includes('.')) return ip.slice(ip.lastIndexOf(':') + 1);
    const [head, tail] = ip.split('::');
    const h = head ? head.split(':') : [];
    const t = tail ? tail.split(':') : [];
    const groups = tail === undefined ? h : [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t];
    return groups.slice(0, 4).map(g => g.toLowerCase().replace(/^0+(?=.)/, '')).join(':');
}
// prefix：不同路由用不同前綴，回報不會吃掉 AI 的額度
async function isRateLimited(request, env, prefix = '') {
    if (!env.AI_LIMITER) return false;
    try {
        const { success } = await env.AI_LIMITER.limit({ key: prefix + rateKey(request.headers.get('CF-Connecting-IP') || 'unknown') });
        return success === false;
    } catch (e) {
        console.error('[好韻器] 限流檢查失敗，先放行', e.message);
        return false;
    }
}
const RATE_LIMITED_MESSAGE = '操作太頻繁，請稍後再試';

async function handleAi(request, env, origin) {
    if (await isRateLimited(request, env)) return json(429, { ok: false, code: 'RATE_LIMITED', message: RATE_LIMITED_MESSAGE }, origin, env);
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
    if (await isRateLimited(request, env)) return json(429, { error: { message: RATE_LIMITED_MESSAGE } }, origin, env);
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
// admin/index.html 依賴這些路徑與回應格式，所以狀態碼、回應內容、檢查順序都和舊版一樣。
// Phase 7 強化已完成：金鑰改走 X-Admin-Key header、全部後台路徑共用 adminKeyOk；舊的 ?key= 先留著（舊後台還在用），v2 移除。
// 403 仍是純文字 Forbidden，但現在帶 CORS 標頭，跨來源的後台才讀得到。GITHUB_API_KEY 已不再使用（GitHub Models 已下架）。
const FEEDBACK_JSON = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': ALLOWED_ORIGIN };
const feedbackJson = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: FEEDBACK_JSON });

// 回傳 null 代表這個路徑不歸這裡管，交給後面的 /ai、/models
async function handleFeedbackAdmin(request, env, url, origin) {
    const path = url.pathname;
    const keyOk = () => adminKeyOk(request, url, env);
    const forbidden = () => new Response('Forbidden', { status: 403, headers: corsHeaders(origin, env) });

    // /feedback：儲存回報到 KV（先判斷方法，再判斷來源；只認正式網站，不受本機開關影響）
    if (path === '/feedback') {
        if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
        if (request.headers.get('Origin') !== ALLOWED_ORIGIN) return new Response('Forbidden', { status: 403 });
        // 每次回報都是一次 KV 寫入（免費額度一天 1000 次）：先限流、再限大小（沒有限流器綁定就只限大小）
        if (await isRateLimited(request, env, 'fb:')) return feedbackJson({ error: RATE_LIMITED_MESSAGE }, 429);
        try {
            const body = await readBodyCapped(request, MAX_FEEDBACK_BYTES);
            if (!body.ok) return feedbackJson({ error: TOO_LARGE_ERROR.message }, 413);
            const data = JSON.parse(body.text);
            const key = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            await env.USER_FEEDBACK_KV.put(key, JSON.stringify({ ...data, ts: new Date().toISOString() }));
            return feedbackJson({ ok: true });
        } catch (e) {
            return feedbackJson({ error: e.message }, 500);
        }
    }

    // /reports.json：給 admin 後台的列表（需密鑰），新到舊，壞掉的值直接丟掉
    if (path === '/reports.json') {
        if (!keyOk()) return forbidden();
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
        if (!keyOk()) return forbidden();
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
        if (!keyOk()) return forbidden();
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
    // 每日健康檢查（D-12）。本機觸發時 controller.cron 是空字串，所以不依它分支
    async scheduled(controller, env, ctx) {
        ctx.waitUntil(runHealthCheck(env));
    },
    async fetch(request, env, ctx) {
        try {
            return await route(request, env);
        } catch (e) {
            // 沒預期的例外（例如讀 body 時客戶端中斷）：回帶 CORS 的 JSON，瀏覽器才讀得到；不帶內部細節。
            // 同時給新舊兩種格式：新版讀 message，舊版快取頁面讀 error.message
            console.error('[好韻器] 未預期錯誤', e?.message);
            const message = 'AI 暫時無法使用，請稍後再試';
            return json(500, { ok: false, code: 'INTERNAL', message, error: { message } }, request.headers.get('Origin') || '', env);
        }
    },
};

// 路由本體；上面的 fetch 只負責兜底
async function route(request, env) {
    const origin = request.headers.get('Origin') || '';
    const url = new URL(request.url);
    const { pathname } = url;
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin, env) });
    const admin = await handleFeedbackAdmin(request, env, url, origin);
    if (admin) return admin;
    const corr = await handleCorrections(request, env, url, {
        json: (status, obj, extra) => json(status, obj, origin, env, extra),
        readBodyCapped,
        adminKeyOk: () => adminKeyOk(request, url, env),
        originAllowed: () => originAllowed(origin, env),
    });
    if (corr) return corr;
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
        // 網站選單的資料來源（D-14）：只列每日健康檢查後仍啟用的模型；還沒有紀錄就列完整名單、checkedAt 是 null
        const models = (await activeModels(env)).map(({ id, label, provider }) => ({ id, label, provider }));
        return json(200, { ok: true, models, checkedAt: (await readHealth(env))?.checkedAt ?? null }, origin, env);
    }
    // 給 Andy 部署後立刻確認線上模型狀態，不必等凌晨排程；/health/run 會花 6 次模型呼叫，所以要後台金鑰（金鑰不可為空）
    const isRun = pathname === '/health/run';
    if (pathname === '/health.json' || isRun) {
        if (!adminKeyOk(request, url, env)) return new Response('Forbidden', { status: 403, headers: corsHeaders(origin, env) });
        if (isRun) {
            if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
            return json(200, await runHealthCheck(env), origin, env);
        }
        // 直接讀 KV，不經快取，看到的就是目前存的那一筆
        let doc = null;
        try { doc = JSON.parse(await env.AI_STATE_KV.get(HEALTH_KEY)); } catch (e) { doc = null; }
        return doc ? json(200, doc, origin, env) : json(404, { ok: false, message: '還沒有健康檢查紀錄' }, origin, env);
    }
    return json(404, { ok: false, code: 'NOT_FOUND', message: '找不到這個路徑' }, origin, env);
}
