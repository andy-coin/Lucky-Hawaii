# Phase 5: Multi-Device Layout 多裝置版面與流暢度 - Context

**Gathered:** 2026-10-04
**Status:** Ready for planning
**Mode:** Smart discuss（自主）— Andy 指示自主決定，以下為 Claude 依推薦方案決定

<domain>
## Phase Boundary

電腦、平板、手機都能完整查韻、寫詞、用 AI 建議：
- 縮放：預設 100% 不偏移；放大到最大時貼邊內容不被裁掉（PERF-01）
- 流暢：首次搜尋與大量字卡分批渲染，手機 CPU 降速不凍結（PERF-02）
- 三種版面完整可用，沒有被遮住或點不到的按鈕（UI-01）
- 視覺一致、晝夜模式與客製顏色正常（UI-02）
- 手機輸入不觸發自動放大、虛擬鍵盤不擋輸入位置（UI-03）

不在本 phase：歌詞編輯器資料模型與多首歌（Phase 8）、段落拖曳（Phase 9）、韻腳地圖（Phase 10）。版面只做「讓現有功能在三種裝置可用且美觀」，不新增功能。

</domain>

<decisions>
## Implementation Decisions

### 縮放（PERF-01）
- 現行縮放用 CSS `zoom` 套在結果區（js/search-ui.js zoomIn/zoomOut，MzoomScale 50–150%，MzoomBaseRatio）→ 改為根字級／CSS 變數 `--ui-scale` 驅動（rem 尺寸），不再用 `zoom`
- 保留現有放大／縮小按鈕與百分比顯示，範圍維持（研究確認 50–150% 是否合理），設定存既有 registry 鍵或新增 `lh:` 鍵（需登記到 safety.js registry）
- 預設 100% 必須與目前畫面視覺一致（golden 不受影響；版面截圖比對以「目前版本」為基準）

### 分批渲染（PERF-02）
- 字卡以分批（requestAnimationFrame／分段 append）渲染；首批立即出現、其餘陸續補上；不可改變最終 DOM 結果（golden 必須等全部渲染完成再比對 → 提供「渲染完成」訊號）
- 不引入虛擬清單函式庫；必要時用 `content-visibility: auto`

### 三種裝置版面（UI-01、UI-02）
- 斷點沿用現有 900px／440px，研究評估平板（768–1024）是否需要獨立調整
- 手機：側邊面板改為可收合抽屜／底部區塊，確保查韻、寫詞、AI 建議三個主流程都能點到；觸控目標至少 44px
- 晝夜模式與客製顏色走既有 CSS 變數，不新增色系

### 手機輸入（UI-03）
- 所有 input／textarea 在手機斷點字級 ≥ 16px（避免 iOS 自動放大）；viewport 加 `viewport-fit=cover`、使用 `dvh`／`visualViewport` 讓輸入框在鍵盤彈出時捲到可見
- 不使用 `maximum-scale=1`／`user-scalable=no`（保留使用者縮放，無障礙）

### 測試
- Playwright 多 viewport（手機 390×844、平板 820×1180、桌機 1440×900）跑主流程腳本＋元素不超出視窗檢查＋可點擊檢查
- 多縮放值（50%、100%、150%）檢查貼邊元素在視窗內
- 截圖比對：晝夜模式 × 三種 viewport 建立基準截圖（toHaveScreenshot），基準拍攝於本 phase 改版完成時；改版前先拍一組「現況」供 Andy 對照
- CPU 降速（CDP Emulation.setCPUThrottlingRate 4–6×）量測長任務

### Claude's Discretion
- 抽屜／底部區塊的細節互動、動畫、圖示
- 分批大小與時間切片數值

</decisions>

<code_context>
## Existing Code Insights

- 版面：css/base.css、css/panels.css、css/responsive.css（@media max-width 900px、440px）；index.html viewport `width=device-width, initial-scale=1.0`
- 縮放：js/search-ui.js zoomIn/zoomOut 以 `resultsSection.style.zoom` 實作；js/cards.js MzoomScale/MzoomBaseRatio；`.m-zoomOut-button`／`.m-zoomIn-button`／`.m-zoom-value`
- 字卡渲染：js/results.js displayResults、js/cards.js createCharCard
- 面板：js/panels.js、js/ui-common.js（面板收合狀態 IIFE）
- 主題：js/theme.js（THEME_KEY、loadColors、CSS 變數）
- 測試：tests/smoke.spec.mjs（91 handler）、golden（等全部字卡）、helpers.mjs bootPage
- 已知待辦：Phase 1 存檔失敗橫幅 #lhSaveBanner 可能擋住頂端中間按鈕 → 本 phase 一併調整

</code_context>

<specifics>
## Specific Ideas

- Andy 原話：預設 100% 實際經過 offset，使用者只想放大一點就會讓靠近邊框的內容被吃掉
- Human check：iPhone／Android 實機鍵盤遮擋與縮放手感、整體美觀 → 最後 UAT 清單
- Andy 重視 GUI 美觀、一致、客製化彈性

</specifics>

<deferred>
## Deferred Ideas

- 歌詞編輯器重做、多首歌側邊分頁 → Phase 8
- 段落拖曳模組 → Phase 9

</deferred>
