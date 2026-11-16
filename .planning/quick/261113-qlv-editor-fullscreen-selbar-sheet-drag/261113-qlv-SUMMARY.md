---
phase: quick-261113-qlv
plan: 01
subsystem: ui
tags: [lyrics-editor, floating-bar, bottom-sheet, pointer-events, playwright]
requires: []
provides:
  - 完整歌詞編輯器幾乎全螢幕（留白沿用 --pad-t／--page-pad）
  - 桌機選字浮動列直接有「移到段落 ▸」
  - 底部 sheet 把手拖曳改高度，存 lh:sheetH
  - 版號 0.96.29
affects: [css/panels.css, css/responsive.css, js/panels.js, js/rhyme-map.js, js/safety.js, index.html]
tech-stack:
  added: []
  patterns: [Pointer Events + setPointerCapture 拖曳, 比例存檔 + CSS 自訂屬性]
key-files:
  created: [tests/workflow-polish.spec.mjs]
  modified:
    - css/panels.css
    - css/responsive.css
    - js/panels.js
    - js/rhyme-map.js
    - js/safety.js
    - index.html
    - tests/move-selection.spec.mjs
    - tests/line-analysis-ui.spec.mjs
    - tests/line-journey.spec.mjs
    - tests/rhyme-map-ui.spec.mjs
    - tests/scan.spec.mjs
key-decisions:
  - 編輯器留白用遮罩 padding + 變數，不寫死數字；下緣不加 --body-extra
  - 「移到段落 ▸」排在最後（查韻、AI、分析、指定讀音、移到段落）
  - sheet 高度存可見高度比例（0.3–0.95），兩個 sheet 共用 lh:sheetH
requirements-completed: [QUICK-261113-qlv]
duration: ~35min
completed: 2026-11-13
status: complete
commits: 3
plan_head_before: 1391af2fd0baaa0cf1c4791651ec976156e82242
plan_head_after: f2b1120510142707c91fe624a2888b8dca87051b
actuals:
  tokens: 14000
  tasks: 3
  commits: 3
---

# Phase quick-261113-qlv Plan 01: 編輯器全螢幕、桌機選字列移到段落、sheet 拖曳高度 Summary

完整編輯器改成四邊留白等於頁面外框的全螢幕、桌機浮動列直接有「移到段落 ▸」、手機／平板底部 sheet 把手可拖曳改高度並記住（lh:sheetH），版號 0.96.29，已 push 到 gsd/v0.96-stabilize。

## Commits
- fdb2302 完整編輯器幾乎全螢幕；版號 0.96.29
- c5484b2 桌機選字浮動列直接顯示「移到段落 ▸」；同步測試
- f2b1120 底部 sheet 把手可拖曳調整高度，存 lh:sheetH（已 push，最終 commit）

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 測試同步] tests/rhyme-map-ui.spec.mjs 的可見按鈕清單**
- **Found during:** Task 2
- **Issue:** 「浮動列：這些情況不出現，或只剩「分析」」斷言桌機只顯示 `['an']`／`['look','ai','an']`，新按鈕讓它失敗（計畫只列了另外三個檔案）
- **Fix:** 期望改為 `['an','move']`、`['look','ai','an','move']`，按計畫原則「不再藏按鈕」
- **Commit:** c5484b2

**2. [測試參數] 觸控拖曳測試往上拖 100px 而非 150px**
- **Issue:** 手機 844 高，78% = 658，加 150 = 808 超過 95% 上限（802），會被卡住而非 +150
- **Fix:** 改拖 100px（758 < 802）；上限卡 95% 已由滑鼠測試覆蓋
- **Commit:** f2b1120

## Verification
- tests/workflow-polish.spec.mjs 11 個全過（編輯器非 dock／dock／kb-open、滑鼠與觸控拖曳、存檔、壞值、拉低收起、點一下收起、touch-action）。
- 全套 `npx playwright test --reporter=dot`：1102 passed、33 failed，全是 base 既有：golden.spec 31 個（rhyme 資料比對）、scan「catch: 程式碼裡沒有吞錯的 catch」、sections-audit「檢查：沒有新增動畫」。rhyme-map-ui:280 這次通過。
- 版號：index.html 40 個 `?v=0.96.29`、無 0.96.28 殘留、資訊面板與 en-rhyme fetch 皆 0.96.29。

## Known Stubs
None.

## Threat Flags
None. lh:sheetH 以 lhGetJSON 驗證（數字 0.3–0.95），壞值回預設；只有夾限後的數字寫入 `--sheet-r`。

## Notes
- handoff.md 已覆寫（未 commit）；STATE.md／ROADMAP.md／.planning 文件依指示未 commit。
- 工作樹原有的未追蹤／未提交檔案未動。

## Self-Check: PASSED
- tests/workflow-polish.spec.mjs 存在；commits fdb2302、c5484b2、f2b1120 皆存在於 git log 並已在 origin/gsd/v0.96-stabilize。
