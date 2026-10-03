// ==================== 模型候選清單 ====================
// 順序 = 自動鏈順序（Gemini 排前面：上下文大，能吃下候選詞很多的提示）。
// 發布日期來自 Google 官方 deprecations 表的 Release date 欄
//   https://ai.google.dev/gemini-api/docs/deprecations
// 兩家的模型列表 API 都不提供發布日期，所以日期只能寫在這裡。
// 要新增模型：在這份清單加一筆（附官方發布日期）再重新部署。
// Groq 沒有官方發布日期，下面標 ASSUMED 的是憑記憶估的；released: null 代表日期未知（永遠不算「太舊」）。
export const MODELS = [
    { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', provider: 'gemini', family: 'gemini-flash-lite',
      released: '2026-07-21', maxOut: 2048 },                                   // 預設思考 minimal，不送 thinkingConfig
    { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', provider: 'gemini', family: 'gemini-flash',
      released: '2026-09-02', maxOut: 2048, thinking: 'LOW' },                  // 3.7／3.8 不支援 minimal
    { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash', provider: 'gemini', family: 'gemini-flash',
      released: '2026-08-13', maxOut: 2048, thinking: 'LOW' },
    { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B', provider: 'groq', family: 'gpt-oss',
      released: '2025-08-05', maxOut: 1024, maxPromptChars: 4500, effort: 'low' },   // released = ASSUMED
    { id: 'qwen/qwen3.8-27b', label: 'Qwen3.8 27B', provider: 'groq', family: 'qwen',
      released: null, maxOut: 1024, maxPromptChars: 4500 },                      // Groq 標為 Preview；日期未知
    { id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B', provider: 'groq', family: 'gpt-oss',
      released: '2025-08-05', maxOut: 1024, maxPromptChars: 4500, effort: 'low' },   // released = ASSUMED
];

// 只認完全相同的 id（不去空白、不轉大小寫）：能進到上游網址的 id 只能是清單裡的
export function findModel(id) {
    return MODELS.find(m => m.id === id);
}

// ==================== 每日淘汰規則（D-13） ====================
// 規則：
//   1. 探測失敗（ok 不是 true）的模型一律不啟用。
//   2. 「太舊」= 發布超過 183 天（嚴格大於，以 UTC 毫秒計，不做本地時區的日曆運算），
//      或 Gemini 回報 modelStage 是 LEGACY／DEPRECATED／RETIRED。
//   3. 太舊的模型只有在「同家族有更新、健康、不算太舊」的模型時才移除（日期未知視為可被取代）；
//      所以今天兩個 gpt-oss 雖然超過半年，因為沒有更新的同家族，會留著。
//   4. 至少留 2 個：不夠時先補回健康但太舊的（登記順序）；健康的不到 2 個時，再補沒被標成失效（404）的，最後才補 404 的。
//   5. 全部失敗也不能清空：回完整登記名單。輸出永遠依登記順序，只會縮小、不會自己加新模型。
// 發布日期只能寫在這個檔案裡：Google 與 Groq 的模型 API 都不提供發布日期（見上方註解）。
export const STALE_DAYS = 183;
export const MIN_ACTIVE = 2;
const STALE_STAGES = ['LEGACY', 'DEPRECATED', 'RETIRED'];

// results: { [id]: { ok, status?, stage? } }；nowMs 是 UTC 毫秒。純函式，回傳啟用的 id 陣列
export function computeActive(results, nowMs, models = MODELS) {
    const r = m => results?.[m.id];
    const healthy = models.filter(m => r(m)?.ok === true);
    if (!healthy.length) return models.map(m => m.id);              // 全掛：不清空，照登記順序硬試
    const released = m => m.released ? Date.parse(m.released) : NaN;
    const stale = m => released(m) < nowMs - STALE_DAYS * 86400000 || STALE_STAGES.includes(r(m)?.stage);
    // 有沒有更新、健康、不算太舊的同家族模型可以取代 m（任一邊日期未知就當作可以取代）
    const replaced = m => healthy.some(o => o !== m && o.family === m.family && !stale(o)
        && (Number.isNaN(released(m)) || Number.isNaN(released(o)) || released(o) > released(m)));
    const keep = new Set(healthy.filter(m => !(stale(m) && replaced(m))));
    // 保底湊到 MIN_ACTIVE：先健康的，再沒失效的，最後 404 的，都依登記順序
    const isDead = m => r(m)?.status === 404;
    const refill = [...healthy, ...models.filter(m => !healthy.includes(m) && !isDead(m)), ...models.filter(m => isDead(m) && !healthy.includes(m))];
    for (const m of refill) if (keep.size < MIN_ACTIVE) keep.add(m);
    return models.filter(m => keep.has(m)).map(m => m.id);
}
