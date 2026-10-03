// ==================== AI 轉接 ====================
// 瀏覽器只送任務內容，由這裡決定用哪個模型、帶哪把金鑰（D-06）。
// 換手鏈：逾時、429、5xx 換下一個；失效（404）與額度用完的模型先冷卻起來不再打；400 類請求錯誤直接回報不重試。
import { MODELS, findModel } from './models.js';

// 下面的數字都可以調（研究值，上線後看實際狀況再改）
const ATTEMPT_TIMEOUT_MS = 12000;      // 單次嘗試上限；env.ATTEMPT_TIMEOUT_MS 可覆寫（測試用）
const MAX_ATTEMPTS = 4;                // 一個請求最多打幾次上游，免得把免費額度燒光
const CHAIN_BUDGET_MS = 28000;         // 整條鏈的總時間；超過就不開新的嘗試（瀏覽器那邊 35 秒放棄）；env.CHAIN_BUDGET_MS 可覆寫
const TRANSIENT_COOLDOWN_MS = 30000;   // 逾時、5xx、空回覆：這個模型先休息 30 秒
const DEAD_MS = 3600000;               // 404（模型不存在）：先當它失效 1 小時，每日健康檢查會做長期判斷
const PROVIDER_COOLDOWN_MS = 600000;   // 401/402/403：金鑰或帳號有問題，整家供應商休息 10 分鐘
const RETRY_MIN_MS = 10000;            // 429 的 Retry-After 下限
const RETRY_MAX_MS = 900000;           // 429 的 Retry-After 上限（15 分鐘）
const RETRY_DEFAULT_MS = 60000;        // 429 沒給等待時間時的預設值

// 冷卻狀態只放在這個 isolate 的記憶體裡：KV 太慢又有寫入次數限制，不適合每個請求都讀寫；
// 長期的失效名單由每日健康檢查負責（plan 02-05）。isolate 重啟就歸零，最壞情況是多打一次失效的模型。
const cooldown = new Map();            // 模型 id → 可再用的時間點（ms）
const dead = new Map();                // 模型 id → 失效到何時（ms）
const providerCooldown = new Map();    // 供應商 → 可再用的時間點（ms）

// 測試每題開頭呼叫，避免上一題的冷卻影響下一題
export function _resetState() {
    cooldown.clear();
    dead.clear();
    providerCooldown.clear();
}

// 上游狀態碼 → 處理方式：'ok' 成功 | 'transient' 暫時性（換下一個）| 'dead' 模型不存在 | 'auth' 金鑰問題
//                         | 'big' 這個模型吃不下（換下一個，不冷卻）| 'fatal' 其餘 4xx（直接回報不重試）
export function classify(status) {
    if (status >= 200 && status < 300) return 'ok';
    if (status === 429 || status === 408 || status >= 500) return 'transient';
    if (status === 404) return 'dead';
    if (status === 401 || status === 402 || status === 403) return 'auth';
    if (status === 413) return 'big';
    return 'fatal';
}

// 金鑰只放 header，不放網址（網址會進紀錄）；思考程度用 thinkingLevel，不送舊式 budget 欄位（兩者並存 Google 會拒絕）
// noThinking：Google 若嫌 thinkingLevel 不支援，同一個模型去掉它再試一次
export function geminiRequest(m, req, env, signal, noThinking = false) {
    const generationConfig = { temperature: req.temperature, maxOutputTokens: Math.min(req.maxTokens, m.maxOut) };
    if (m.thinking && !noThinking) generationConfig.thinkingConfig = { thinkingLevel: m.thinking };
    const base = env.GEMINI_BASE || 'https://generativelanguage.googleapis.com';
    return fetch(`${base}/v1beta/models/${encodeURIComponent(m.id)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        body: JSON.stringify({
            contents: req.messages.map(x => ({ role: x.role === 'assistant' ? 'model' : 'user', parts: [{ text: x.content }] })),
            generationConfig,
        }),
        signal,
    });
}

// Groq 走 OpenAI 相容格式；max_tokens 已被標為棄用，改用 max_completion_tokens；gpt-oss 系列要壓低思考量
export function groqRequest(m, req, env, signal) {
    const body = {
        model: m.id,
        messages: req.messages,
        temperature: req.temperature,
        max_completion_tokens: Math.min(req.maxTokens, m.maxOut),
    };
    if (m.effort) body.reasoning_effort = m.effort;
    const base = env.GROQ_BASE || 'https://api.groq.com/openai/v1';
    return fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.GROQ_API_KEY}` },
        body: JSON.stringify(body),
        signal,
    });
}

// 去掉思考標籤（沿用舊前端的行為）
const stripThink = s => String(s || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();

// 把所有 parts 的文字串起來
function geminiText(data) {
    const parts = data?.candidates?.[0]?.content?.parts;
    return stripThink(Array.isArray(parts) ? parts.map(p => p?.text || '').join('') : '');
}

// 429 的等待時間：先看 retry-after（秒），再看 Gemini 錯誤內容的 retryDelay（例如 "12s"）；都沒有回 0
function parseRetryAfterMs(res, errorText) {
    const h = Number(res.headers.get('retry-after'));
    if (Number.isFinite(h) && h > 0) return h * 1000;
    try {
        const d = JSON.parse(errorText)?.error?.details;
        const delay = Array.isArray(d) ? d.map(x => x?.retryDelay).find(Boolean) : null;
        const m = /^(\d+(?:\.\d+)?)s$/.exec(delay || '');
        if (m) return Number(m[1]) * 1000;
    } catch (e) {
        // 錯誤內容不是 JSON 就沒有 retryDelay 可讀，照預設等待時間
    }
    return 0;
}

// 打一次指定模型 → { status, text, usage, retryAfterMs, blocked, stage, retirementTime, errorText }
// 逾時或網路錯誤會直接丟出例外，由 runChain 分類；errorText 只給紀錄和重試判斷用，不會回給瀏覽器
export async function callModel(m, req, env, signal, { noThinking } = {}) {
    const res = m.provider === 'gemini'
        ? await geminiRequest(m, req, env, signal, noThinking)
        : await groqRequest(m, req, env, signal);
    const out = { status: res.status, text: '', usage: undefined, retryAfterMs: 0, blocked: false, stage: undefined, retirementTime: undefined, errorText: '' };
    if (res.ok) {
        const data = await res.json().catch(() => null);   // 回應不是 JSON 當成空回覆，由呼叫端換下一個
        if (m.provider === 'gemini') {
            out.text = geminiText(data);
            out.blocked = !!data?.promptFeedback?.blockReason;
            const total = data?.usageMetadata?.totalTokenCount;
            if (total) out.usage = { total_tokens: total };
            out.stage = data?.modelStatus?.modelStage;
            out.retirementTime = data?.modelStatus?.retirementTime;
        } else {
            out.text = stripThink(data?.choices?.[0]?.message?.content);
            const total = data?.usage?.total_tokens;
            if (total) out.usage = { total_tokens: total };
        }
        return out;
    }
    out.errorText = await res.text().catch(() => '');      // 讀不到內文就當空字串，狀態碼已經夠判斷
    out.retryAfterMs = parseRetryAfterMs(res, out.errorText);
    return out;
}

// 紀錄用：截 200 字並把金鑰值蓋掉（先蓋再截，免得金鑰被截一半就蓋不掉）；絕不記 header 或請求內容
function logFailure(m, status, errorText, env) {
    let s = String(errorText || '');
    for (const k of [env.GEMINI_API_KEY, env.GROQ_API_KEY, env.USER_REPORT_KEY]) {
        if (k) s = s.split(String(k)).join('***');
    }
    console.error('[好韻器] 模型 ' + m.id + ' 回 ' + status, s.slice(0, 200));
}

const unavailableUntil = m => Math.max(cooldown.get(m.id) || 0, dead.get(m.id) || 0, providerCooldown.get(m.provider) || 0);
const isAvailable = m => unavailableUntil(m) <= Date.now();
const clampRetry = ms => ms > 0 ? Math.min(RETRY_MAX_MS, Math.max(RETRY_MIN_MS, ms)) : RETRY_DEFAULT_MS;

// req = { messages, model: 'auto'|id, temperature, maxTokens } → { status, payload }
// 回給瀏覽器的內容只有 ok/text/model/tried(/usage) 或 code/message/tried，絕不帶上游原文、網址或金鑰
export async function runChain(req, env) {
    const t0 = Date.now();
    const budget = Number(env.CHAIN_BUDGET_MS) || CHAIN_BUDGET_MS;
    const timeoutMs = Number(env.ATTEMPT_TIMEOUT_MS) || ATTEMPT_TIMEOUT_MS;

    // 候選順序：名單內的偏好模型先，再依登記順序；Groq 的額度算「提示＋預留輸出」，提示太長的先跳過
    const promptChars = req.messages.reduce((n, x) => n + String(x.content || '').length, 0);
    const preferred = req.model !== 'auto' ? findModel(req.model) : undefined;
    const order = preferred ? [preferred, ...MODELS.filter(m => m !== preferred)] : MODELS;
    const fits = order.filter(m => !m.maxPromptChars || promptChars <= m.maxPromptChars);   // Gemini 沒有上限，所以不會空
    let queue = fits.filter(isAvailable).map(m => ({ m, noThinking: false }));
    // 全部都在冷卻時不能不打：挑冷卻最早結束的那個硬試一次（冷卻只是估計，不是事實）
    const forced = queue.length === 0;
    if (forced) queue = [{ m: fits.reduce((a, b) => unavailableUntil(b) < unavailableUntil(a) ? b : a), noThinking: false }];

    const tried = [];
    const thinkingRetried = new Set();
    let attempts = 0;
    for (let i = 0; i < queue.length && attempts < MAX_ATTEMPTS; i++) {
        if (Date.now() - t0 >= budget) break;
        const { m, noThinking } = queue[i];
        // 鏈走到一半時，前面的 401 可能剛讓整家供應商進入冷卻，這裡再看一次
        if (!forced && !isAvailable(m)) continue;
        attempts++;
        const t1 = Date.now();
        let r;
        try {
            r = await callModel(m, req, env, AbortSignal.timeout(timeoutMs), { noThinking });
        } catch (e) {
            const error = e?.name === 'TimeoutError' ? 'timeout' : 'network';
            tried.push({ id: m.id, error, ms: Date.now() - t1 });
            cooldown.set(m.id, Date.now() + TRANSIENT_COOLDOWN_MS);
            continue;
        }
        const ms = Date.now() - t1;
        const kind = classify(r.status);

        if (kind === 'ok') {
            if (r.text && !r.blocked) {
                const payload = { ok: true, text: r.text, model: { id: m.id, label: m.label }, tried: [...tried, { id: m.id, status: r.status, ms }] };
                if (r.usage) payload.usage = r.usage;
                return { status: 200, payload };
            }
            tried.push({ id: m.id, error: 'empty', ms });          // 空回覆或被安全過濾擋掉：換下一個
            cooldown.set(m.id, Date.now() + TRANSIENT_COOLDOWN_MS);
            continue;
        }

        tried.push({ id: m.id, status: r.status, ms });
        logFailure(m, r.status, r.errorText, env);
        if (kind === 'transient') {
            cooldown.set(m.id, Date.now() + (r.status === 429 ? clampRetry(r.retryAfterMs) : TRANSIENT_COOLDOWN_MS));
        } else if (kind === 'dead') {
            dead.set(m.id, Date.now() + DEAD_MS);
        } else if (kind === 'auth') {
            providerCooldown.set(m.provider, Date.now() + PROVIDER_COOLDOWN_MS);
        } else if (kind === 'fatal') {
            // Google 偶爾對 thinkingLevel 回 400：同一個模型去掉思考設定再試一次（只此一次）
            if (m.provider === 'gemini' && m.thinking && !noThinking && !thinkingRetried.has(m.id) && /thinking/i.test(r.errorText)) {
                thinkingRetried.add(m.id);
                queue.splice(i + 1, 0, { m, noThinking: true });
                continue;
            }
            return { status: 400, payload: { ok: false, code: 'BAD_REQUEST', message: 'AI 請求格式有問題，已記錄，請稍後再試', tried } };
        }
        // 'big'：這個模型吃不下，換下一個，不冷卻
    }

    if (tried.length && tried.every(t => t.error === 'empty')) {
        return { status: 503, payload: { ok: false, code: 'EMPTY', message: 'AI 這次沒有回覆內容，請再試一次', tried } };
    }
    const n = new Set(tried.map(t => t.id)).size;
    return { status: 503, payload: { ok: false, code: 'ALL_BUSY', message: `AI 暫時都忙不過來，請稍後再試（已嘗試 ${n} 個模型）`, tried } };
}

// 舊版快取頁面（打根路徑）期待的回覆格式：_provider 只決定回覆長相，不決定用哪個模型。
// gemini 解析 candidates；其餘（groq、已下架的 github 等）解析 choices，並順手顯示 usage。狀態碼由呼叫端原樣帶過去
export function toLegacy(provider, status, payload) {
    if (!payload.ok) return { error: { message: payload.message } };
    if (provider === 'gemini') return { candidates: [{ content: { parts: [{ text: payload.text }] } }] };
    const out = { choices: [{ message: { content: payload.text } }] };
    if (payload.usage) out.usage = payload.usage;
    return out;
}
