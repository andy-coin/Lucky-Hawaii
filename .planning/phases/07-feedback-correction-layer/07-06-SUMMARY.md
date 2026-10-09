---
phase: 07-feedback-correction-layer
plan: 06
subsystem: ui
tags: [feedback, ai-report-mode, context-menu, long-press, a11y, playwright]
status: complete

requires:
  - phase: 07-feedback-correction-layer
    provides: "07-04 的 openReportDialog(items) 與回報視窗（字詞項目 { kind: 'word', word } 已支援）"
provides:
  - "AI 詞卡「🚩 回報詞語」選取模式：點詞當選取、不存進保留區；回報（n）開同一個回報視窗"
  - "openReportDialog(items, { onSent })：全部送出成功後才呼叫（AI 模式用來離開選取）"
  - "字卡右鍵與詞卡／AI 詞卡右鍵選單第一項「🚩 回報…」（openReportFromCtx）"
  - "字卡與 AI 詞卡的長按選單移除（留給 Phase 8/9 拖曳）；破音字 chip 長按照舊"
affects: [07-09, 07-10]

actuals:
  tokens: 9500
  tasks: 2
  commits: 2
plan_head_before: 8d279d311bbfb5a37fcd3852486b9aaea22cc5d3
plan_head_after: 745cddaa6e5fafe3b4173812bd2daffd2ec09d7e

tech-stack:
  added: []
  patterns:
    - "選取模式只活在 #aiWordsContainer.report-mode class，不寫任何儲存"
    - "捕獲階段 stopPropagation 擋掉詞卡自己的 inline onclick（saveWord），不改 aiWordCardHtml 樣板"
    - "MutationObserver 看容器的 childList：沒有詞卡就藏列並離開模式，涵蓋重新生成、換搜尋與重置"
    - "選單項目的 inline handler 只帶常數 'char'／'word'，字詞從模組狀態讀（T-07-20）"

key-files:
  created: []
  modified:
    - index.html
    - js/ai-word-events.js
    - js/report.js
    - css/panels.css
    - tests/report-entry.spec.mjs
    - tests/layout.spec.mjs
    - "tests/visual.spec.mjs-snapshots/{desktop,phone,tablet}-ai-darwin.png"

key-decisions:
  - "?v= 維持 0.96.10（計畫規定不動；split-tags 測試全綠）"
  - "回報列的 CSS 全放 css/panels.css（含觸控下限併入既有 ≤900／coarse 區塊），沒有動 responsive.css：sticky 的回報列 z-index 1 低於貼底的「提供詞語建議」z-index 2，不需另外覆寫"
  - "選取模式下關掉詞卡 hover 的「+」提示（點了不是保留），放進既有 hover 保護區塊以通過「hover 只給滑鼠」測試"

patterns-established:
  - "字卡與 AI 詞卡的選單只剩 contextmenu 一條路；手機的回報走工具列「🚩 回報」或 AI 回報列"

requirements-completed: [FB-01]

coverage:
  - id: D1
    description: "AI 回報模式：一般點詞存進保留區；進入模式後點詞只選取（保留區不變）、列顯示「已選 n 個詞」與回報（n）；送出每個詞一筆 word-report；成功後離開模式並清掉選取；結束選取清掉選取"
    requirement: FB-01
    verification:
      - kind: e2e
        ref: "tests/report-entry.spec.mjs#回報入口：AI 回報模式"
        status: pass
    human_judgment: false
  - id: D2
    description: "AI 列在沒有詞卡時隱藏；重新生成或清空詞卡時離開模式、清掉選取"
    requirement: FB-01
    verification:
      - kind: e2e
        ref: "tests/report-entry.spec.mjs#回報入口：AI 列隱藏"
        status: pass
    human_judgment: false
  - id: D3
    description: "手機 390 與觸控平板橫放 1180：回報詞語、回報（n）、結束選取點擊範圍 ≥ 44×44，整頁不橫向捲動"
    requirement: FB-01
    verification:
      - kind: e2e
        ref: "tests/report-entry.spec.mjs#回報入口：AI 列觸控（手機 390／觸控平板橫放 1180）"
        status: pass
    human_judgment: false
  - id: D4
    description: "手機上字卡與 AI 詞卡按住 600ms 不開選單；破音字 chip 長按照舊開 3 項選單"
    requirement: FB-01
    verification:
      - kind: e2e
        ref: "tests/report-entry.spec.mjs#回報入口：長按"
        status: pass
    human_judgment: false
  - id: D5
    description: "桌機右鍵字卡與 AI 詞卡（一般詞、AI 造詞兩種選單）第一項是「🚩 回報…」，點了開對應的回報視窗（字卡帶讀音晶片），送出的 payload 正確"
    requirement: FB-01
    verification:
      - kind: e2e
        ref: "tests/report-entry.spec.mjs#回報入口：右鍵"
        status: pass
    human_judgment: false
  - id: D6
    description: "放大 150% 時三種選單（字卡、AI 詞卡、破音字）仍在可見範圍內；兩個詞卡選單第一項是回報；工具列回報鈕在手機橫放批次列點得到"
    requirement: FB-01
    verification:
      - kind: e2e
        ref: "tests/layout.spec.mjs#選單：放大 150% 時右鍵／長按選單不跑出畫面"
        status: pass
    human_judgment: false
  - id: D7
    description: "AI 回報列與選取詞卡在亮、暗、自訂主題下的實際觀感（只用既有變數；✓ 字符標示選取）"
    requirement: FB-01
    human_judgment: true
    rationale: "只用既有顏色變數，沒有逐主題的自動斷言；真機手感與主題下觀感留給 07-10 的人工驗收"

duration: ~20 min
completed: 2026-10-10
---

# Phase 7 Plan 06: AI 詞卡回報模式與右鍵回報 Summary

**AI 詞卡新增不靠長按的「🚩 回報詞語」選取模式（捕獲階段攔下點擊，不會存進保留區），右鍵選單第一項改成「🚩 回報…」，字卡與 AI 詞卡的長按釋放出來給拖曳，破音字 chip 長按照舊。**

## Accomplishments

- **Task 1（tracer，`8cccc7c`）**：`index.html` 在 `#aiWordsContainer` 前加 `#aiReportRow`（無 inline handler）；`js/ai-word-events.js` 新增 `report-mode`、捕獲階段 click 攔截、MutationObserver（沒有詞卡就藏列並離開模式）、`exitAiReportMode`；`openReportDialog(items, { onSent })`；`css/panels.css` 加 `.ai-report-row`／`.ai-report-btn`／`.ai-word-card.report-picked`（✓ 字符＋框線＋外框，只用既有變數）與觸控下限。
- **Task 2（`745cdda`）**：`js/report.js` 加 `openReportFromCtx`、`_charCtxKey`，兩個選單（字卡、詞卡／AI 詞卡）第一個／讀音列之後加「🚩 回報…」；刪掉字卡與 AI 詞卡長按（`_charLongPressTimer`、`_longPressTimer` 為 0）；`tests/layout.spec.mjs` 選單 150% 測試的手機分支改走右鍵並檢查第一項，破音字仍用 500ms 觸控；觸控清單加「批次：回報」；刷新 3 張 ai 的 `-darwin.png`。
- 新增 6 筆規格（AI 回報模式、AI 列隱藏、AI 列觸控 ×2、長按、右鍵）。

## Task Commits

1. Task 1 tracer: `8cccc7c` feat(07-06) AI 詞卡「🚩 回報詞語」選取模式
2. Task 2: `745cdda` feat(07-06) 右鍵選單「🚩 回報…」、長按釋放、版面測試與截圖

## Verification

- Tracer 閘：`report-entry／smoke／ai-fill` 62 passed 後才進 Task 2（`⚡ Tracer verified end-to-end — expanding`）。
- Task 2 verify：`report-entry／layout／smoke／visual` 全綠；`npm test` **531 passed / 27 skipped / 0 failed**（基準 525 / 27 / 0，新增 6 筆）。
- acceptance_criteria 全數執行並通過：`aiReportRow` 1、`report-mode` 5、`MutationObserver` 1、`onSent` 5（js/report.js）、`_charLongPressTimer` 0、`_longPressTimer`（ai-word-events）0、`_polyLongPressTimer` 5、`openReportFromCtx('char')` 1、`openReportFromCtx('word')` 2；`-g "AI 回報模式"` 與 `-g "長按"` 各 1 passed。
- `?v=` 維持 0.96.10。沒有新增儲存鍵。

## Screenshots

- 看過重拍後的 phone／tablet／desktop ai 三張：只多了「🚩 回報詞語」一列（靠左，位在篩選列與詞卡之間），其餘不變。這三張原本就在 1% 容許內會過，仍用 `--update-snapshots=all` 重拍讓基準帶新列。
- **`-linux.png` 基準沒有動。** 07-04 留下的清單加一項：雲端容器跑 `npm run visual:update` 時，ai 三張 `-linux.png` 也會一併重拍。

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 一般狀態「回報詞語」鈕被推到右邊**
- **Found during:** Task 2 截圖檢視
- **Issue:** `.ai-report-text` 設 `flex: 1 1 auto`，一般狀態文字是空的也會吃掉空間，把鈕擠到右邊；UI-SPEC 2.2 要左對齊。
- **Fix:** `.ai-report-text:empty { display: none }`。
- **Files modified:** css/panels.css
- **Commit:** 745cdda

**2. [Rule 3 - Blocking] 新的 `:hover` 規則沒包進 hover 保護**
- **Found during:** Task 1 驗證（`style.spec` 「hover 只給滑鼠」失敗）
- **Issue:** 選取模式關掉詞卡 hover「+」的規則寫在保護區塊外。
- **Fix:** 移進既有 `.ai-word-card:hover::after` 所在的 `(hover: hover) and (pointer: fine)` 區塊。
- **Files modified:** css/panels.css
- **Commit:** 8cccc7c

**3. [計畫字面調整] 沒動 `css/responsive.css`**
- 計畫 files_modified 列了 responsive.css；實際觸控下限併進 panels.css 既有的 `(pointer: coarse), (max-width: 900px)` 區塊就涵蓋 ≤900 與 1180×820 觸控，sticky 回報列（z-index 1）也不會蓋到貼底的生成鈕（z-index 2），所以不需要改 responsive.css。

**Total deviations:** 2 auto-fixed（1 Rule 1、1 Rule 3）＋ 1 計畫字面調整。**Impact:** 全在 css 範圍內，沒有範圍外功能；沒有任何既有測試被改弱（`layout.spec` 選單測試是依計畫改觸發方式並新增斷言）。

## Authentication Gates

None.

## Known Stubs

None.

## Threat Flags

None（沒有新增網路端點或信任邊界；T-07-19 由「AI 回報模式」測試的保留區計數斷言涵蓋，T-07-20 的選單 handler 只帶常數）。

## Notes for next plans

- 07-10 人工驗收：真機手機 AI 回報模式手感、亮／暗／自訂主題下回報列觀感（D7）；ai 三張 `-linux.png` 隨 07-04 的 15 張一起在雲端重拍。

## Self-Check: PASSED

- 檔案：`index.html`、`js/ai-word-events.js`、`js/report.js`、`css/panels.css`、`tests/report-entry.spec.mjs`、`tests/layout.spec.mjs`、三張 `*-ai-darwin.png` 皆存在且已提交。
- Commits：`8cccc7c`、`745cdda` 皆在 `git log`；`git rev-list --count 8d279d3..HEAD` = 2。
- 兩個 Task 的 acceptance_criteria 全部 PASS；`npm test` 531 passed / 27 skipped / 0 failed。
