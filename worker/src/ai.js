// ==================== AI 轉接 ====================
// 瀏覽器只送任務內容，由這裡決定用哪個模型、帶哪把金鑰（D-06）。
// 本版只挑一個 Gemini 候選；完整的換手鏈會在同一個函式簽名與回傳格式下接手（plan 02-03）。
import { MODELS, findModel } from './models.js';

const ATTEMPT_TIMEOUT_MS = 12000;   // 單次嘗試上限；env.ATTEMPT_TIMEOUT_MS 可覆寫（測試用）

// 金鑰只放 header，不放網址（網址會進紀錄）；思考程度用 thinkingLevel，不送舊式 budget 欄位（兩者並存 Google 會拒絕）
export function geminiRequest(m, req, env, signal) {
    const generationConfig = { temperature: req.temperature, maxOutputTokens: Math.min(req.maxTokens, m.maxOut) };
    if (m.thinking) generationConfig.thinkingConfig = { thinkingLevel: m.thinking };
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

// 把所有 parts 的文字串起來，並去掉思考標籤
function geminiText(data) {
    const parts = data?.candidates?.[0]?.content?.parts;
    const text = Array.isArray(parts) ? parts.map(p => p?.text || '').join('') : '';
    return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

// req = { messages, model: 'auto'|id, temperature, maxTokens } → { status, payload }
// 回給瀏覽器的內容只有 ok/text/model/tried 或 code/message/tried，絕不帶上游原文、網址或金鑰
export async function runChain(req, env) {
    const picked = findModel(req.model);
    const m = picked && picked.provider === 'gemini' ? picked : MODELS.find(x => x.provider === 'gemini');
    const t0 = Date.now();
    const tried = [];
    let text = '';
    try {
        const res = await geminiRequest(m, req, env, AbortSignal.timeout(Number(env.ATTEMPT_TIMEOUT_MS) || ATTEMPT_TIMEOUT_MS));
        tried.push({ id: m.id, status: res.status, ms: Date.now() - t0 });
        if (res.ok) text = geminiText(await res.json().catch(() => null));
    } catch (e) {
        tried.push({ id: m.id, error: e.name === 'TimeoutError' ? 'timeout' : 'network', ms: Date.now() - t0 });
    }
    if (text) return { status: 200, payload: { ok: true, text, model: { id: m.id, label: m.label }, tried } };
    return { status: 503, payload: { ok: false, code: 'ALL_BUSY', message: 'AI 暫時都忙不過來，請稍後再試（已嘗試 1 個模型）', tried } };
}
