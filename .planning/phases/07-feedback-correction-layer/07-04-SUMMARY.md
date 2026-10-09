---
phase: 07-feedback-correction-layer
plan: 04
subsystem: ui
tags: [feedback, report-dialog, batch-toolbar, a11y, playwright, css-tokens]
status: complete

requires:
  - phase: 07-feedback-correction-layer
    provides: "07-01 的 Worker /feedback 與 adminKeyOk；回報本身不變，只換前端入口"
provides:
  - "桌機與手機批次工具列第 4 顆 🚩 回報（.btn-report），不改標記、不清選取"
  - "一頁式回報視窗 #reportModalOverlay：字詞晶片、4 個原因（單選）、選填說明、狀態行"
  - "postFeedbackRaw（回 { ok, status }）；postFeedback 維持 true/false＋提示"
  - "本頁已回報過的記憶體集合 _reportedSet（不新增任何儲存鍵）"
  - "--action-bg／--action-bg-hover／--action-text 固定行動色（亮暗各一份）"
affects: [07-05, 07-06, 07-09, 07-10]

actuals:
  tokens: 16100
  tasks: 3
  commits: 4
plan_head_before: 3f00473a677b3a99561447f39d12d78ee86002fe
plan_head_after: d4fab10a36187ab4a67c9434446ed79b832e6249

tech-stack:
  added: []
  patterns:
    - "視窗狀態集中在 _report 物件，由 _renderReportState() 一次重畫（標題、晶片、原因、狀態行、送出鈕）"
    - "送出前快照項目；送出中關閉視窗用 epoch 計數讓背景迴圈自行停下"
    - "回報字詞一律 textContent／createElement，不經 innerHTML（T-07-15）"

key-files:
  created:
    - tests/report-entry.spec.mjs
  modified:
    - index.html
    - js/report.js
    - js/cards.js
    - css/base.css
    - css/panels.css
    - css/responsive.css
    - tests/style.spec.mjs
    - "tests/visual.spec.mjs-snapshots/*-darwin.png（15 張）"

key-decisions:
  - "?v= 維持 0.96.10（計畫與整個 Phase 7 都規定不動；split-tags 測試 27 個標籤全綠）"
  - "手機 m-batchPanel 左右內距 0.9375rem 改 0.5rem：實際內容寬只有 306px，原樣 4 欄 × 72px + 3 × 8px 會排不下，變成 3 欄；改後 4 欄各 74px，150% 自動 2×2"
  - "900px 以下桌機版批次列收緊內距／圖示間距／左邊條，820 平板與橫拿手機 844 才不會因第 4 顆而換行（換行會讓齒輪掉到下一排並擠掉結果區）"
  - "「一次最多回報 10 個，已先取前 10 個」寫成固定字串而非用 REPORT_MAX 組字，才能被計畫的 grep 驗收"
  - "style 測試的行動色檢查保留 panels.css 既有 .feedback-send-btn:hover 的 #5a67d8 為唯一例外（Phase 7 之前就有）"

patterns-established:
  - "aria-disabled 的按鈕仍可按（按了跳提示），Playwright 會當成不可按，測試要用 click({ force: true })"
  - "auditTouchTargets 的 overlaps 在頁面會捲動的 150% 縮放下會誤報（連原本的模式鈕與齒輪也中）；版面相鄰檢查改用同一刻的 auditVisibleControls 框"

requirements-completed: [FB-01]

coverage:
  - id: D1
    description: "兩個批次工具列都有 🚩 回報；沒選字時 aria-disabled＋提示且不送請求，選 1 張時視窗列出該字"
    requirement: FB-01
    verification:
      - kind: e2e
        ref: "tests/report-entry.spec.mjs#回報入口：工具列"
        status: pass
    human_judgment: false
  - id: D2
    description: "冷啟動搜尋後 點字卡→回報→點原因→送出，恰好一筆 char-reading-report（桌機與手機各一）"
    requirement: FB-01
    verification:
      - kind: e2e
        ref: "tests/report-entry.spec.mjs#回報入口：步驟數"
        status: pass
      - kind: e2e
        ref: "tests/report-entry.spec.mjs#回報入口：手機工具列"
        status: pass
    human_judgment: false
  - id: D3
    description: "多選上限 10、晶片 8＋「+k」、單一項目標題、防重複（無新儲存鍵、重新整理可再送）"
    requirement: FB-01
    verification:
      - kind: e2e
        ref: "tests/report-entry.spec.mjs#回報入口：多選上限／單一項目／防重複"
        status: pass
    human_judgment: false
  - id: D4
    description: "失敗、第 3 筆失敗的部分成功、429 都留著視窗與說明，狀態行與提示文字照 UI-SPEC"
    requirement: FB-01
    verification:
      - kind: e2e
        ref: "tests/report-entry.spec.mjs#回報入口：失敗／部分失敗／限流"
        status: pass
    human_judgment: false
  - id: D5
    description: "說明欄 500 字元（含 astral 截斷）、讀音錯誤進 suggested、其他進 note；只送必要欄位；字詞當文字顯示"
    requirement: FB-01
    verification:
      - kind: e2e
        ref: "tests/report-entry.spec.mjs#回報入口：說明欄字數／只送必要欄位／字詞當文字顯示"
        status: pass
    human_judgment: false
  - id: D6
    description: "鍵盤與報讀：焦點在標題、Tab 圈、Esc 與焦點返回、方向鍵單選、✓ 與 aria-checked、遮罩只在說明欄空時關"
    requirement: FB-01
    verification:
      - kind: e2e
        ref: "tests/report-entry.spec.mjs#回報入口：鍵盤／遮罩"
        status: pass
    human_judgment: false
  - id: D7
    description: "手機、平板、桌機、觸控平板橫放在 100% 與 150%：🚩 在視窗內不壓鄰居、觸控 ≥44×44、不橫向捲動；手機 4 欄／2×2；說明欄 ≥16px；長文字不裁切；三種主題行動色一致；跨斷點置中可捲"
    requirement: FB-01
    verification:
      - kind: e2e
        ref: "tests/report-entry.spec.mjs#回報入口：版面（8 組）／手機四欄／輸入框字級（2 組）／鍵盤（後盾）／長文字（後盾）／主題／切換斷點"
        status: pass
    human_judgment: false
  - id: D8
    description: "頁首「意見」、設定「✉️ 意見回饋」；行動色只在變數定義；本階段無新 @keyframes"
    requirement: FB-01
    verification:
      - kind: e2e
        ref: "tests/report-entry.spec.mjs#回報入口：改名意見"
        status: pass
      - kind: unit
        ref: "tests/style.spec.mjs#視覺：行動色只在變數定義裡／Phase 7 沒有新的動畫"
        status: pass
    human_judgment: false
  - id: D9
    description: "真機 iOS 鍵盤出現時說明欄與送出鈕可見、整體手感"
    requirement: FB-01
    human_judgment: true
    rationale: "Playwright 只能用縮小視窗模擬鍵盤；真 iOS 鍵盤行為留給 07-10 的人工驗收清單"

duration: ~25 min
completed: 2026-10-10
---

# Phase 7 Plan 04: 回報入口與回報視窗 Summary

**批次工具列新增第 4 顆「🚩 回報」，選字卡後按它、點原因、送出，四下就 POST 一筆 `/feedback`；一頁式視窗涵蓋多選上限 10、本頁防重複、失敗／429／部分失敗、500 字元說明、鍵盤與報讀，並在手機、平板、桌機、150%、觸控橫放與三種主題下量過版面。**

## Accomplishments

- **Task 1（tracer，`5f1cd80`）**：`index.html` 兩個工具列加 `.btn-report`、新增 `#reportModalOverlay`；`js/report.js` 的 `postFeedbackRaw` 回 `{ ok, status }`、`postFeedback` 改成包它（既有五個呼叫端行為不變）；`js/cards.js` 的 `updateBatchCount` 同步 `aria-disabled`；`css/base.css` 加 `--action-*` 三個變數（亮暗各一份）。
- **Task 2（RED `aa218a0`、GREEN `b34e7c0`）**：先寫 13 筆規格（9 筆紅），再實作 `_renderReportState`、`_reportedSet`、依序送出遇失敗或 429 即停、說明欄 `Array.from(...).slice(0, 500)`、焦點圈與方向鍵、Esc；頁首「回報」改「意見」。
- **Task 3（`d4fab10`）**：8 組版面（4 裝置 × 100／150%）、手機四欄／2×2、輸入框字級（2 組）、鍵盤、長文字、主題、切換斷點；`style.spec` 加 `#4c51bf` 白名單、「行動色只在變數定義」與「沒有新動畫」；更新 15 張 `-darwin.png` 截圖基準。
- 測試：`tests/report-entry.spec.mjs` 共 30 筆（要求 ≥ 20）；`npm test` **505 passed / 27 skipped / 0 failed**（基準 473 / 27 / 0）。

## Task Commits

1. Task 1 tracer: `5f1cd80` feat(07-04) 工具列 🚩 回報鈕與一頁式回報視窗
2. Task 2 RED: `aa218a0` test(07-04) 回報視窗各狀態的規格（9 筆失敗）
3. Task 2 GREEN: `b34e7c0` feat(07-04) 回報視窗全部狀態、頁首改名「意見」
4. Task 3: `d4fab10` test(07-04) 版面與主題規格、Mac 截圖基準

## Verification

- Tracer 閘：`report-entry／split-tags／smoke／error-visibility` 全綠後才進 Task 2（`⚡ Tracer verified end-to-end — expanding`）。
- Task 2 verify（`report-entry／error-visibility／scan／smoke`）：39 passed。
- Task 3 verify：`report-entry／style／layout／visual` 全綠，`npm test` 505 passed / 27 skipped / 0 failed。
- 三個 Task 的 acceptance_criteria grep 全數執行並通過（含 `git diff 952d24f -- '*-linux.png'` 為空）。
- `?v=` 27 個本機標籤全為 `0.96.10`。

## Screenshots

- 重新看過 diff／實際圖後，只有預期差異：工具列多了 🚩 回報（沒選字時淡一點）、手機 390 一排四顆（原本「常 用」文字被擠成直排，現在一行）、手機 150% 變 2×2、頁首「意見」。更新的是全部 15 張 `-darwin.png`（`--update-snapshots=all`；其中 14 張在 1% 容許內本來就會過，仍重拍讓基準帶新工具列）。
- **`-linux.png` 基準沒有動**（本機無法產生）。**07-10 的清單：需在雲端容器跑 `npm run visual:update`，重拍 15 張 `-linux.png`。**

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 手機工具列 4 欄排不下，實際變 3 欄**
- **Found during:** Task 2 驗證（`layout.spec` 「觸控：手機搜尋後結果區至少 420px」失敗，結果區 373px）
- **Issue:** UI-SPEC 算出 390px 可用 336px，但 336px 是 `.m-batch-panel` 連 `padding: 0.9375rem` 一起的寬度，內容只有 306px；4 × 72 + 3 × 8 = 312 > 306，`auto-fit` 只排 3 欄，第 4 顆掉到第二排。
- **Fix:** 左右內距改 `var(--sp-2)`（0.5rem），內容 320px，4 欄各 74px；150% 仍自動 2×2。
- **Files modified:** css/responsive.css
- **Commit:** b34e7c0

**2. [Rule 1 - Bug] 第 4 顆讓橫拿手機（844）與平板（820）的選項列換行**
- **Found during:** Task 2 驗證（`layout.spec` 「橫拿手機搜尋後看得到第一張字卡」失敗；Task 3 截圖 diff 又在 820 平板看到齒輪掉到下一排）
- **Issue:** 900px 以下仍顯示的桌機版批次列（模式鈕＋批次鈕＋齒輪）多一顆後總寬超過一排（844 差 36px、820 差 14px），`.options` 換行，結果區被擠下去。
- **Fix:** `@media (max-width: 900px)` 內把 `.batch-panel.inline` 間距、按鈕左右內距、圖示間距收成 0.25rem／0.125rem、左邊條 0.5→0.375rem、回報鈕隔開距離 0.25rem；844 剩 21px、820 剩 9px 餘裕。既有測試沒有改。
- **Files modified:** css/responsive.css
- **Commit:** b34e7c0（橫放）、d4fab10（820 平板收緊）

**3. [Rule 3 - Blocking] `#4c51bf` 白名單提前加入**
- **Found during:** Task 1 驗證（`style.spec` 「沒有新的顏色常數」失敗）
- **Issue:** 計畫把白名單放在 Task 3，但 Task 1 就定義了 `--action-bg-hover: #4c51bf`，Task 1 commit 會讓套件變紅。
- **Fix:** Task 1 就加入並附註解；Task 3 補其餘兩個測試。
- **Commit:** 5f1cd80

**4. [計畫與現況不符] 「`#5a67d8` 只出現在變數定義」**
- **Issue:** `css/panels.css` 既有 `.feedback-send-btn:hover { background: #5a67d8 }`（Phase 7 之前就在），照字面斷言會失敗。
- **Fix:** 新測試只對 `#4c51bf` 嚴格，`#5a67d8` 允許變數定義與這一行既有例外，並在測試內註明。
- **Commit:** d4fab10

**5. [判斷] 版面測試的相鄰檢查改用同一刻的框**
- `auditTouchTargets().overlaps` 在頁面會捲動的 150% 下對原本就有的模式鈕與齒輪也誤報（原版基準也有），所以 🚩 的「不壓鄰居」改用 `auditVisibleControls` 在同一刻量到的框；44×44 的檢查仍走 `auditTouchTargets().failures`。
- 「回報入口：版面」的 `mustSee` 拆成兩次掃描：工具列只要求 `.btn-report`，視窗開著只要求原因與兩個按鈕，因為視窗遮罩蓋住工具列，同一次掃描量不到它。

**Total deviations:** 4 auto-fixed（2 Rule 1、1 Rule 3、1 計畫字面調整）＋ 1 測試手法判斷。**Impact:** 全在 css／測試範圍內，沒有範圍外功能；沒有任何既有測試被改弱或改期望值（`layout.spec` 沒有數「剛好 3 顆」的斷言）。

## Authentication Gates

None.

## Known Stubs

None.

## Threat Flags

None（沒有新增網路端點、認證路徑或信任邊界；payload 只含 type、word／char＋reading、reportType、note／suggested，由「只送必要欄位」測試涵蓋）。

## Notes for next plans

- 07-05／07-06 可直接呼叫 `openReportDialog(items)`：項目形狀 `{ kind: 'word', word }` 或 `{ kind: 'char', char, base, tone, reading }`；視窗內的字詞標題與晶片全用 `textContent`。
- `_reportItemLabel`／`_reportKey` 以修剪後的字串當同一詞判斷，不做任何正規化。
- 07-10 人工驗收：真 iOS 鍵盤（D9）；`-linux.png` 15 張基準需在雲端重拍。

## Self-Check: PASSED

- 檔案：`js/report.js`、`tests/report-entry.spec.mjs`、`css/base.css`、`css/panels.css`、`css/responsive.css`、`index.html`、`js/cards.js`、`tests/style.spec.mjs` 皆存在。
- Commits：`5f1cd80`、`aa218a0`、`b34e7c0`、`d4fab10` 皆在 `git log`；`git rev-list --count 3f00473..HEAD` = 4。
- 三個 Task 的 acceptance_criteria 全部 PASS；`npm test` 505 passed / 27 skipped / 0 failed。
