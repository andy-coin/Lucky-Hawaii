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
