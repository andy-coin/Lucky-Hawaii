// ==================== 每日健康檢查（AI-05） ====================
// 每天（wrangler.toml 的 cron，台灣 03:17）對登記名單裡每個模型各打一次極短的探測，
// 結果與「啟用名單」寫進 AI_STATE_KV 的 'health' 一筆；換手鏈與網站選單都讀這份啟用名單。
// KV 免費額度有限：每次檢查只寫一次，讀取在每個 isolate 內快取 5 分鐘，AI 請求路徑上沒有 list 呼叫。
import { MODELS, computeActive } from './models.js';
import { callModel, classify } from './ai.js';

export const HEALTH_KEY = 'health';
const HEALTH_CACHE_MS = 300000;            // 同一個 isolate 5 分鐘內不重讀 KV
const HEALTH_MAX_AGE_MS = 72 * 3600000;    // 超過 3 天沒更新的紀錄不可信（cron 可能停了），忽略並用完整名單
const PROBE_PROMPT = '只回覆 OK';
const PROBE_MAX_TOKENS = 256;              // 思考型模型的思考也算在輸出額度內，太小會得到空回覆

let cache = null;                          // { at, doc }；doc 可以是 null（讀過了、沒有可用紀錄）
export function _resetHealthCache() { cache = null; }

// 打一次探測 → { ok, status, ms, reason?, stage?, retirementTime? }；絕不存上游回覆的文字
async function probe(m, env) {
    const req = { messages: [{ role: 'user', content: PROBE_PROMPT }], temperature: 0, maxTokens: PROBE_MAX_TOKENS };
    const timeoutMs = Number(env.ATTEMPT_TIMEOUT_MS) || 12000;
    const t0 = Date.now();
    try {
        let r = await callModel(m, req, env, AbortSignal.timeout(timeoutMs));
        // 和換手鏈一樣：Google 若嫌 thinkingLevel 不支援，去掉思考設定再探一次，免得把好模型誤判為失效
        if (r.status === 400 && m.provider === 'gemini' && m.thinking && /thinking/i.test(r.errorText)) {
            r = await callModel(m, req, env, AbortSignal.timeout(timeoutMs), { noThinking: true });
        }
        const out = { ok: false, status: r.status, ms: Date.now() - t0 };
        if (classify(r.status) === 'ok') {
            if (r.text && !r.blocked) out.ok = true; else out.reason = 'empty';
        } else {
            out.reason = r.status === 400 ? 'bad-request' : 'http';
        }
        if (r.stage) out.stage = r.stage;
        if (r.retirementTime) out.retirementTime = r.retirementTime;
        return out;
    } catch (e) {
        return { ok: false, status: 0, ms: Date.now() - t0, reason: e?.name === 'TimeoutError' ? 'timeout' : 'network' };
    }
}

// 探測全部模型（平行）→ 算啟用名單 → 只寫一次 KV。寫入失敗只記錄，不讓排程例外中斷
export async function runHealthCheck(env, now = Date.now()) {
    const results = {};
    await Promise.all(MODELS.map(async m => { results[m.id] = await probe(m, env); }));
    const doc = { v: 1, checkedAt: new Date(now).toISOString(), results, active: computeActive(results, now) };
    try {
        await env.AI_STATE_KV.put(HEALTH_KEY, JSON.stringify(doc));
    } catch (e) {
        console.error('[好韻器] 健康檢查結果寫入 KV 失敗', e.message);
    }
    cache = { at: now, doc };
    return doc;
}

// 讀最近一次檢查：壞掉、缺 active、太舊都當作沒有（null）
export async function readHealth(env, now = Date.now()) {
    if (cache && now - cache.at < HEALTH_CACHE_MS) return cache.doc;
    let doc = null;
    try {
        const raw = await env.AI_STATE_KV.get(HEALTH_KEY);
        doc = raw ? JSON.parse(raw) : null;
    } catch (e) {
        console.error('[好韻器] 讀取健康檢查紀錄失敗，改用完整模型名單', e.message);
    }
    if (!doc || !Array.isArray(doc.active) || !(now - Date.parse(doc.checkedAt) <= HEALTH_MAX_AGE_MS)) doc = null;
    cache = { at: now, doc };
    return doc;
}

// 目前啟用的模型（登記順序）；沒有可信的紀錄或過濾後是空的，就用完整登記名單
export async function activeModels(env, now) {
    const doc = await readHealth(env, now);
    const list = doc ? MODELS.filter(m => doc.active.includes(m.id)) : MODELS;
    return list.length ? list : MODELS;
}
