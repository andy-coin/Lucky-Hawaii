# Phase 1: Safety Net 安全網 - Context

**Gathered:** 2026-10-03
**Status:** Ready for planning
**Mode:** Smart discuss — Andy 指示「你自己決定、不要再問」，全部採用推薦答案（Claude's Discretion）

<domain>
## Phase Boundary

在動任何大手術（Phase 2 AI 搶修、Phase 3 拆檔）之前建立安全網：
- 一個指令跑完的回歸測試（golden：查韻結果與 v0.96 一致）＋冒煙測試（headless 瀏覽器點過所有 inline 按鈕、零 JS 錯誤）
- 所有吞錯的空 `catch` 改為可見提示或記錄，並有掃描防止復發
- localStorage 爆量／IndexedDB 寫入失敗時使用者看得到「存檔失敗」
- 所有儲存鍵值有清單；資料格式變更前自動備份；遷移可重複執行、不丟資料

不在本 phase：拆檔（Phase 3）、AI fallback 重寫（Phase 2）、手動還原／匯出匯入介面（Phase 8 EDIT-09）、任何既有功能行為改變。

</domain>

<decisions>
## Implementation Decisions

### 測試工具與執行方式
- 使用 Playwright（npm devDependency）＋其自帶 Chromium 跑 headless 測試；只裝在開發環境，不隨網站上線
- 在 Mac 主機直接執行：repo 根目錄 `package.json`，`npm test` 一個指令跑完全部（golden＋冒煙＋程式碼掃描）；`node_modules/` 加進 .gitignore
- Golden 測試比對「畫面上實際呈現的結果」：固定一組注音／拼音／漢字輸入 × 三種篩選模式（常用字 common／同聲韻 initial／同聲調 tone），擷取字卡順序與分組 → 與快照比對。理由：Phase 3 拆檔時內部函式改名不影響測試
- Golden 基準使用網站現有真實資料檔（v0.96 現況）拍快照；刻意改資料時用獨立更新指令（如 `npm run golden:update`）重拍，一般 `npm test` 只比對不覆寫
- 測試透過本機 http server 開頁面（不用 `file://`，為 Phase 3 拆檔後鋪路）
- 冒煙測試的外部網路（AI Worker、Google Fonts 等）一律攔截／mock，不燒額度、結果可重現；`confirm`／`prompt` 對話框自動處理；每次用乾淨的瀏覽器 profile，不碰真實資料

### 錯誤可見性
- 背景、非關鍵錯誤（例：破音字排序檔載入失敗、IndexedDB 快取讀取失敗後改走網路）→ 只在主控台留記錄，訊息前綴「[好韻器]」，不打擾使用者
- 使用者主動操作失敗（匯入、AI 建議、複製等）→ 用既有提示機制顯示白話原因
- 「存檔失敗」→ 醒目橫幅，需按關閉才消失，附建議（先匯出備份或清掉舊資料）；同一種錯誤短時間內只提示一次（節流），避免狂跳
- 防復發：`npm test` 內含程式碼掃描，發現空 catch（含只有註解、或只有 `return` 的吞錯 catch）就失敗；確實需要忽略的地方必須至少留下記錄

### 儲存備份與遷移
- 備份存進 IndexedDB（獨立 object store，不與詞庫快取 `wl` 混用），保留最近 3 份；IndexedDB 不可用時退而存 localStorage 單份備份並記錄警告
- 備份時機：每次資料格式升級（遷移）前自動備份；新版第一次開啟時先存一份「基準備份」
- 程式內維護一份「已知儲存鍵值清單」（目前約 17 個固定鍵＋`apiKey_${provider}` 前綴＋`hoyun_theme_mode`），備份與測試共用；測試掃描程式碼，出現清單外的新鍵就失敗。不備份整個網域（andy-coin.github.io 與其他專案共用 origin）
- 遷移機制：schema 版本號＋依序執行、可重複執行（idempotent）的遷移步驟；本 phase 先上「基準版本」與機制本身，並用舊版資料快照測試
- 遷移中途失敗 → 自動用剛才的備份還原並提示使用者；手動還原介面留到 Phase 8

### Claude's Discretion
- 測試檔位置（建議 `tests/`，進 git）、測試框架細節（Playwright Test runner 或 Node 內建 `node:test`）
- 存檔失敗橫幅的視覺細節（需沿用既有 CSS 變數，晝夜模式皆正常）
- 舊鍵值保留策略：遷移後舊鍵至少保留一個版本，不立即刪除
- 新增的儲存鍵命名（研究建議新鍵使用 `lh:*` 前綴）
- 所有 Andy 回答「你自己決定」的項目皆依上表推薦答案執行

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `showToast(msg, duration)`（index.html ≈ 5386）：既有提示元件 `#copyToast`／`.copy-toast`，可延伸出「不自動消失」的橫幅版本
- `_idbOpen()／_idbGet()／_idbPut()`（≈ 3948–3966）：IndexedDB `haoYunQi` v1，store `wl`（詞庫快取）；新增備份 store 需升 DB 版本並處理 `onupgradeneeded`
- `searchRhyme(input)`（≈ 2999）＋ `displayResults(results)`（≈ 5454）：查韻核心與渲染；篩選模式由 `.mode-button[data-mode]` 切換 `currentMode`（≈ 5823）
- `handleColorChange()`（≈ 5969）以動態 key 寫 localStorage；`THEME_KEY = 'hoyun_theme_mode'`（≈ 5830）

### Established Patterns
- 單一 `index.html`，全域函式與變數，無模組系統；79 個 inline `onclick` ＋少量 onchange／oninput／ondrop 等
- localStorage 寫入共 24 處 `setItem`，多數直接呼叫、無 try/catch
- 已知鍵值：haiku_lyrics、haiku_hashtags、haiku_savedwords、dictOverrides_v076、bgColor1、textColor、highlightColor、containerBg、selectedModel、savedPoolCollapsed、rightPanelCollapsed、recentPanelCollapsed、leftPanelCollapsed、contextSectionCollapsed、haoYunQi_inputMode、hoyun_theme_mode、`apiKey_${provider}`
- 吞錯 catch 共 10 處：2742、2799、3986、3993、4019、4041、5024、5256、5312、6220（行號為 v0.96 現況）
- 註解使用中文、4 空白縮排、單引號、section header `// ==================== X ====================`

### Integration Points
- 錯誤可見：每個吞錯 catch 原地改寫；localStorage 寫入集中到一個安全寫入 helper，失敗即觸發存檔失敗橫幅
- 備份／遷移：在初始化讀取 localStorage 之前（≈ 3291 全域宣告附近）執行遷移流程
- 測試：Playwright 透過 `page.evaluate` 或 DOM 操作驅動搜尋輸入框 `#searchInput` 與模式按鈕

</code_context>

<specifics>
## Specific Ideas

- Andy 是音樂人、非程式背景：錯誤訊息一律白話繁體中文，避免技術名詞
- Andy 偏好一口氣自動完成，最後集中測試；本 phase ROADMAP 標示「Human check：無」，全部要能自動驗證
- 「搬移程式碼」與「修 bug」不可混在同一個 commit（為 Phase 3 鋪路的習慣，本 phase 起即遵守）

</specifics>

<deferred>
## Deferred Ideas

- 手動還原備份的使用者介面 → Phase 8（EDIT-09 JSON 備份與還原）
- AI fallback 鏈重寫（5024、5256、5312 的 catch 只先補記錄，邏輯不改）→ Phase 2
- 詞庫快取版本競態修正 → Phase 4（PERF-03）

</deferred>
