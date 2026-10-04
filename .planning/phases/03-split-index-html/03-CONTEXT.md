# Phase 3: Split index.html 拆檔 - Context

**Gathered:** 2026-10-04
**Status:** Ready for planning
**Mode:** 基礎建設 phase（純重構、使用者感受不到差異）— Andy 指示自主決定，以下為 Claude 決定

<domain>
## Phase Boundary

把單一 `index.html`（6253 行：CSS 14–2176、主程式 inline script 2491–6251）拆成多個 CSS／JS 檔，行為完全不變；GitHub Pages 直接部署、不需建置；核心查韻／篩選邏輯可直接在 Node 載入測試。

不在本 phase：任何功能或行為修改（bug 修正只能在獨立 commit，且僅限拆檔必要時）、AI 挑詞邏輯（Phase 4）、版面（Phase 5）。

</domain>

<decisions>
## Implementation Decisions

### 拆檔機制
- 採「classic script（非 ES module）＋依序載入」：79 個 inline `onclick` 等 handler 依賴全域函式，classic script 保留全域語意、`file://` 也能開、零建置；不改成 ES modules（研究 STACK vs ARCHITECTURE 分歧，此處決定 classic）
- 載入順序完全保留原本 inline script 由上到下的執行順序（同一個全域作用域語意）；注意 `let`/`const` 在多個 classic script 間共用全域詞法環境，仍可互相存取
- 核心純邏輯檔（注音／拼音轉換、韻母／借韻、查韻、篩選）做成可在 Node 載入：檔尾以 `typeof module !== 'undefined'` 守衛匯出，或 Node 測試以 `vm` 載入；由研究決定最小侵入的方式
- CSS 拆到 `css/` 下（依區塊切成數個檔或單一檔由研究決定，維持原本規則順序）

### Commit 紀律
- 「搬移程式碼」與「修 bug」絕不混在同一個 commit；搬移 commit 必須可機械驗證（拆出的內容與原段落逐字相同，只差位置）
- 每一步搬移後 Phase 1 golden＋smoke＋全套 `npm test` 必須全綠

### 快取與部署
- 新增的 `<link>`/`<script src>` 一律帶版本參數（沿用 `?v=` 慣例），避免 GitHub Pages 快取新舊混用
- 使用者存的歌詞／覆寫／設定在拆分後完整讀得到（storage 測試＋v0.96 fixture 驗證）

### Claude's Discretion
- 檔案切分粒度、檔名（建議 `js/` 下依職責命名，如 phonetics、rhyme、search、render、lyrics、ai-client、theme、init）
- Node 測試採 Playwright Node-only spec（與 Phase 2 worker 測試相同模式）或 node:test

</decisions>

<code_context>
## Existing Code Insights

- `index.html`：`<style>` 14–2176；`data/rhyme-dict.js`、`data/polyphonic-order.js`、`js/safety.js?v=0.96.3` 在 2177–2179；主 inline script 2491–6251
- Phase 1：`tests/golden.spec.mjs`（41 案例 × 3 模式）、`tests/smoke.spec.mjs`（91 handler）、`tests/scan.spec.mjs`（掃描 root *.html inline script＋`js/**/*.js` 的吞錯與儲存鍵——拆檔後掃描範圍自動涵蓋 js/）
- Phase 2：AI client 在 index.html（AUTO_MODEL、loadModels、callLLM→/ai、aiError）；Worker 在 `worker/`
- 已知死碼：`saveApiKey()`（≈4469，無呼叫者）— 若要刪除必須獨立 commit
- 程式碼慣例：4 空白縮排、中文註解、section header `// ==================== X ====================`

</code_context>

<specifics>
## Specific Ideas

- 研究 PITFALLS：拆檔前已有安全網（Phase 1 完成），務必一次搬一塊、每塊後跑 golden
- 拆完的 index.html 只剩頁面骨架（HTML 結構＋`<link>`＋`<script src>`）

</specifics>

<deferred>
## Deferred Ideas

- 改為 ES modules／模組化全域狀態 → 視 Phase 8 編輯器資料模型需要再議
- 死碼清理（saveApiKey 等）若非必要不在本 phase

</deferred>
