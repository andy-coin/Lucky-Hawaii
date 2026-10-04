# Phase 2: AI Service Hotfix AI 服務不斷線 - Context

**Gathered:** 2026-10-03
**Status:** Ready for planning
**Mode:** Smart discuss（自主）— Andy 指示「你自己決定、不要問我」，以下全為 Claude 依推薦方案決定

<domain>
## Phase Boundary

趕在 Gemini 2.5 下架（據報 2026-10-16，需查證）前，讓 AI 建議不再默默失敗：
- 移除已下架模型（GitHub Models／gpt-4.1、已關閉的 Groq 模型），舊使用者 localStorage 的失效 `selectedModel` 自動遷移
- 模型 fallback 鏈移到 Cloudflare Worker：逾時、429/5xx 才換下一個、失效模型自動跳過、全部失敗回白話原因
- Worker 改用 `wrangler deploy`（設定入 git、secrets 不入 git、保住既有回報 KV 綁定）
- Worker 每日排程健康檢查，自動維護模型清單（網站選單跟著更新）
- Worker 防濫用：模型白名單、請求大小上限、輸出 token 上限

不在本 phase：AI 挑詞填滿／造詞驗證邏輯（Phase 4，含 validateWordRhyme 誤判）、回報後台改版（Phase 7）、拆檔（Phase 3）。

</domain>

<decisions>
## Implementation Decisions

### Worker 原始碼與部署
- Worker 原始碼搬進受版控的 `worker/` 目錄（`worker/src/index.js`＋`worker/wrangler.toml`）；目前 `admin/woker.js` 被 .gitignore 忽略、不在 git，保留原檔不刪，新版以 `worker/` 為準
- `wrangler.toml` 的 Worker 名稱沿用線上的 `lucky-hawaii`（網址 lucky-hawaii.is3000dollar.workers.dev 不變），宣告既有 KV 綁定 `USER_FEEDBACK_KV`（namespace id 部署前由 Andy 登入後查得，計畫需提供一行查詢指令與填寫位置）
- Secrets（GEMINI_API_KEY、GROQ_API_KEY、USER_REPORT_KEY）一律 `wrangler secret put`，不進 git；本機開發用 `worker/.dev.vars`（gitignore）
- wrangler 以 devDependency 精確版本鎖在 root package.json，提供 `npm run worker:dev`、`npm run worker:deploy`
- 正式部署（含第一次 `wrangler login`）列為 Andy 的 Human check；Claude 把所有東西備好、本機 `wrangler dev` 全部測過，部署步驟寫成一頁白話清單

### 模型 fallback 鏈（Worker 端）
- 前端只送「任務內容」，Worker 決定用哪個模型；仍相容舊版前端送來的 `model/_provider/messages`（舊快取頁面不壞），但 `model` 只當偏好、必須在白名單內
- 每次嘗試有逾時（研究決定秒數，約 10–15 秒）；只有逾時、429、5xx、模型不存在（404）才換下一個；400 類請求錯誤直接回報不重試
- 失效模型自動跳過：同一 isolate 內記憶＋健康檢查結果存 KV
- 全部失敗時回結構化錯誤（代碼＋白話繁中訊息＋嘗試過的模型清單），前端顯示白話原因，不再空白或轉圈
- Gemini 3.x 思考模型需設定 thinking 預算，避免輸出被思考 token 吃光（研究查證參數）
- 模型 ID 與下架日期一律由研究查證官方文件，不憑記憶

### 每日健康檢查與模型清單
- Worker cron 每日一次（台灣深夜時段）用極短 prompt 測每個候選模型，結果寫入獨立的 KV namespace（不與回報 KV 混用，避免出現在後台回報列表）
- 「發布超過約半年就移除」：候選清單附發布日期，舊模型只在同家族有更新且健康的模型可用時才移除；清單至少保留 2 個可用模型，絕不清空
- Worker 提供 `GET /models` 回傳目前可用模型；網站模型選單改由此清單產生，並新增預設的「自動（推薦）」選項

### 前端遷移
- 舊 localStorage `selectedModel`（如 gpt-4.1 或已移除模型）開站時自動改為「自動」；沿用 Phase 1 的 lhSet／遷移機制（registry 內已有 selectedModel）
- 前端移除 GitHub Models／gpt-4.1 相關硬編碼（約 5 處）與前端 fallback 迴圈；保留可手動指定模型
- 失敗訊息走既有 showToast／錯誤可見機制（Phase 1）

### 防濫用
- 只接受白名單模型；請求 body 大小上限（研究建議值，約 32KB）；messages 數量上限；輸出 token 上限（Worker 強制覆寫，不信任前端）
- 若 Cloudflare 免費方案有 Rate Limiting binding，則加每 IP 速率限制；否則僅做大小／token 限制（研究查證）
- Origin 白名單維持 `https://andy-coin.github.io`；本機測試允許 localhost 來源只在 `wrangler dev` 環境

### 測試
- Worker 邏輯（fallback、白名單、上限、健康檢查淘汰規則）在 Node 以 mock fetch 測試，納入 `npm test`
- 本機 `wrangler dev` 整合測試：觸發 cron、打 `/`、`/models`、`/feedback`
- 前端：Phase 1 的 golden／smoke 保持全綠；新增「舊 selectedModel 自動遷移」與「全部失敗顯示白話原因」測試（mock Worker）

### Claude's Discretion
- 檔案切分、函式命名、逾時秒數與上限數值的確切值（以研究結論為準）
- 前端是否保留模型下拉選單的版面細節（維持現有 UI 風格）

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `admin/woker.js`（194 行，未入 git）：現有 Worker——CORS、/feedback（KV 寫入）、/reports.json、/reports/decision、/reports/delete（以 URL `key` 參數驗證）、LLM proxy（gemini／github／groq 三分支，無白名單、無逾時、信任前端 model/_provider/messages、maxOutputTokens 2048）
- `index.html` ≈4463 `WORKER_URL`；≈4466 `LLM_MODELS`（全部 autoFallback:false，含 gemini-2.5-flash、qwen/qwen3.6-27b）；≈4496 `renderModelSelect()` 預設 'gpt-4.1'；≈4567 `callLLM(model, prompt)`；呼叫點 ≈5026、5223、5258、5330（前端 fallback 迴圈）
- Phase 1：`js/safety.js` 的 lhGet/lhSet/lhWarn、遷移機制 `lhMigrate`、測試工具 Playwright＋`tests/helpers.mjs`（bootPage 可 mock Worker 回覆 aiReply）

### Established Patterns
- 前端 vanilla JS 全域函式、中文註解、4 空白縮排
- 測試：`npm test`（Playwright），外部網路一律 mock

### Integration Points
- 前端 AI 呼叫集中改走單一 Worker endpoint
- admin 後台 `admin/index.html` 依賴 /reports.json 等路徑——Worker 搬家後這些路徑必須維持不變

</code_context>

<specifics>
## Specific Ideas

- 目標日期：2026-10-16 前 Worker 必須實際部署上線（需 Andy 登入），本 phase 盡量把 Andy 的手動步驟壓到最少
- 錯誤訊息白話繁中，例如「AI 暫時都忙不過來，請稍後再試（已嘗試 3 個模型）」

</specifics>

<deferred>
## Deferred Ideas

- validateWordRhyme 對有聲母字尾的誤判（開心 vs 心）→ Phase 4（AI-04）
- 後台管理金鑰改走 header、防注入 → v2（FB-V2-01）／Phase 7
- 回報修正層 KV → Phase 7

</deferred>
