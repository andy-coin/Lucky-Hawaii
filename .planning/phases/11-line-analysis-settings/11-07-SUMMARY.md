---
phase: 11-line-analysis-settings
plan: 07
subsystem: testing
tags: [line-analysis, integration-journey, cross-surface-audit, touch-targets, small-screens, multi-tab, playwright]
status: complete

requires:
  - phase: 11-line-analysis-settings
    provides: "11-01..11-06：逐行標記、對照差異、偏好設定、顯示方式、韻族顏色、預覽、分析面板、反白停留"
provides:
  - "tests/line-journey.spec.mjs：整合：句構分析一次走完（ROADMAP 成功條件 1～3 在同一個連續的 1440×900 寫詞過程）"
  - "tests/line-audit.spec.mjs：5 支跨裝置檢查（三種裝置觸控、小螢幕、鍵盤、切版型、另一個分頁）"
affects: [11-08, /gsd-verify-work 11, /gsd-code-review 11]

actuals:
  tokens: 14000
  tasks: 2
  commits: 2

plan_head_before: 251dd545b18fee86848acebd28603f076e306cf5
plan_head_after: 476497aef82432f1d10f0dd9cfd04a81c8ac1976
commits: 2

tech-stack:
  added: []
  patterns:
    - "Journey 用同一頁走完所有 Phase 11 介面；期望的字母從頁面自己的 lhRhymeAnalyze 算，不寫死；請求清單只准靜態檔案加 App 開機本來就有的 /css2、/models"
    - "Audit 沿用 Phase 10 的結構：auditTouchTargets 每個介面各跑一輪並帶 mustSee，偏好設定一個區塊一個區塊捲進來量，另外直接量 summary 的框（summary 沒有 class，MINE 篩不到）"

key-files:
  created:
    - tests/line-journey.spec.mjs
    - tests/line-audit.spec.mjs
  modified: []

key-decisions:
  - "沒有任何一項檢查需要修 js/ 或 css/：整合測試與五項檢查對 11-01～11-06 的程式原樣通過，所以這個計畫沒有碰 js/rhyme-map.js、css/panels.css、css/responsive.css"
  - "鍵盤那項（備援）改量『色票在可見範圍內、而且中心最上層就是色票』，不要求分頁列被收起：layout.js 的 _lhTextFieldFocused 刻意排除 color 輸入，色票聚焦不算叫出鍵盤（iOS 也是叫色票選擇器），分頁列留在設定視窗後面，不蓋住色票"
  - "切版型那項比對設定時只看 Phase 10 前五個鍵以外的鍵：偏好設定情境會按兩次開關，lh:map 因此被正規化重寫成完整形式，這是正常的"

requirements-completed: [MAP-09, MAP-10, MAP-11]

coverage:
  - id: D1
    description: "一個連續 1440×900 過程：全新只有句尾上色 → 逐行標記（字數＋結構）→ 更多設定…（行尾韻腳字母＋對照差異，Verse II 第 2 行 ≠5，字母照頁面自己的分析，預覽同步）→ 句尾後／大／濃／自訂韻族顏色馬上生效且預覽跟著變 → 📏 分析（≠／✓／對照段落沒有第 4 行，焦點選取不動，Esc 兩次收乾淨）→ 反白停留自動分析（真滑鼠停 1.7 秒開面板、不搶焦點）→ 注音組字（組字中鏡像零變動，確認後字數 7→8 且 Verse II 第 3 行變 ≠8）→ 重新整理（lh:map 前五鍵在前、後面只有改過的鍵，每個介面狀態一致）→ 全程沒有 POST／站外／新端點"
    requirement: MAP-09
    verification:
      - kind: e2e
        ref: "tests/line-journey.spec.mjs#整合：句構分析一次走完"
        status: pass
    human_judgment: false
  - id: D2
    description: "手機 390×844、平板 820×1180、平板橫放 1180×820：更多設定…、偏好設定標題、每個開關、標記位置／文字大小／濃淡 radio、16 個色票、恢復預設顏色、📏 分析、分析面板關閉鈕的點擊範圍都 ≥ 44×44，相鄰重疊 ≤ 4px"
    requirement: MAP-11
    verification:
      - kind: e2e
        ref: "tests/line-audit.spec.mjs#檢查：三種裝置的觸控大小（句構分析）"
        status: pass
    human_judgment: false
  - id: D3
    description: "390×844（100%、150%）與 844×390：偏好設定視窗不會左右捲動、放不下就自己捲、最後一個色票與恢復預設顏色捲得到且整個看得見、預覽只在可見高度 ≥ 600px（37.5rem）時固定"
    requirement: MAP-11
    verification:
      - kind: e2e
        ref: "tests/line-audit.spec.mjs#檢查：偏好設定在小螢幕都摸得到"
        status: pass
    human_judgment: false
  - id: D4
    description: "手機聚焦色票後視窗縮 336px，色票仍在可見範圍內、沒有被分頁列蓋住"
    requirement: MAP-11
    verification:
      - kind: e2e
        ref: "tests/line-audit.spec.mjs#檢查：鍵盤打開時色票看得到"
        status: pass
      - kind: manual
        ref: "真的 iOS 鍵盤／色票選擇器是否擋住色票（列入 11-08 人工驗收）"
        status: backstop
    human_judgment: true
  - id: D5
    description: "1440×900 → 820×1180 → 390×844 → 1440×900，浮動列＋分析面板／韻腳選單／偏好設定三種起點：浮層都收起來、aria-expanded 回 false、偏好設定視窗還能捲能按開關；回到電腦版後每個標記在它那一行最後一個視覺列（1px 內）、鏡像層右內距 = 輸入框內距 + 捲軸寬"
    requirement: MAP-09
    verification:
      - kind: e2e
        ref: "tests/line-audit.spec.mjs#檢查：切版型時收起來（句構分析）"
        status: pass
    human_judgment: false
  - id: D6
    description: "另一個分頁改了 lh:map（含顏色）或歌：B 的分析面板／韻腳選單／偏好設定先收起來，設定、色票、字級、預覽、標記重畫；浮動列開著時改歌依第 8 階段規則等輸入框失焦後才套用；兩邊都沒有頁面錯誤"
    requirement: MAP-11
    verification:
      - kind: e2e
        ref: "tests/line-audit.spec.mjs#檢查：另一個分頁改了設定或歌（句構分析）"
        status: pass
    human_judgment: false
---

# Phase 11 Plan 07: 整合與跨裝置檢查 Summary

**一支整合測試把句構分析的三個成功條件串成同一個寫詞過程，五項檢查在三種裝置、小螢幕、鍵盤、切版型與另一個分頁下量過所有新介面；全部原樣通過，沒有需要修的接縫。**

## Performance

- **Tasks:** 2（Task 1 tracer、Task 2 auto）
- **Files created:** 2（tests/line-journey.spec.mjs、tests/line-audit.spec.mjs）；js/、css/ 沒有變動
- **全套測試：** `npm test` 1031 passed / 29 skipped / 0 failed（11-06 基準 1025 / 29 / 0，新增 1 支整合 + 5 支檢查）
- **長測試的時間（單獨跑）：** 整合約 5.2 秒；檢查：觸控約 6.3 秒、小螢幕約 4.7 秒、鍵盤約 1.2 秒、切版型約 7.2 秒、另一個分頁約 7.4 秒。同時跑的 `layout.spec.mjs` + `rhyme-audit.spec.mjs` + 這兩支共 95 支 52.8 秒，維持全綠

## Accomplishments

- 整合測試的 9 個步驟（a～i）全部對真實畫面斷言，沒有削弱任何早期測試的斷言。
- 觸控檢查實際量到的點擊範圍：開關 294×44／278×44、radio 145×44／95×44、16 個色票各 44×44；三種裝置結果相同。
- 色票的『被預覽蓋住所以沒量到』被擋掉：每個區塊各捲進來量一次，最後再斷言 16 個色票全部被量到。

## Task Commits

1. **Task 1 (tracer):** `a2d09ab` — test(11-07): 整合——句構分析一次走完（常駐標記、設定、對照、分析、停留、組字、重新整理）
2. **Task 2:** `476497a` — test(11-07): 跨裝置檢查——觸控 44px、小螢幕摸得到、鍵盤打開、切版型、另一個分頁（句構分析）

## 測試筆記

- **審計裝置：** DEVICES.phone 390×844、DEVICES.tablet 820×1180、DEVICES.tabletLandscape 1180×820（觸控）；phone 100%／150%、phoneLandscape 844×390（小螢幕）；phone（鍵盤）；desktop → tablet → phone → desktop（切版型）；desktop 雙分頁（另一個分頁）。
- **summary 沒有 class：** `auditTouchTargets` 的 failures 以 `tag#id.class` 命名，偏好設定標題的 `summary` 篩不到，所以測試另外直接量它的 boundingBox（≥ 43.5）。
- **同一段範圍收起後不再出現（10-05 刻意）：** 另一個分頁那項在同一個分頁開兩次浮動列，第二次要換選取範圍（11 → 10），否則 setSelectionRange 不會觸發 select。
- **反白停留用真時間：** 整合測試不裝假時鐘，滑鼠移到第 2 個字上、程式化反白加 bubbling mouseup、等 1.7 秒。步驟 e 選到第 4 行後輸入框會往下捲，第一行就在輸入框上緣之外（停留區域的上緣大於下緣，正確地不啟動），所以步驟 f 先把輸入框捲回最上面——這是測試情境的問題，不是程式缺口：看不到的字滑鼠本來就停不到。

## Deviations from Plan

### 計畫文字與實際做法的差異（沒有程式改動）

**1. 鍵盤備援不要求分頁列被收起**
- 計畫寫『with the mobile tab bar hidden』。`js/layout.js` 的 `_lhTextFieldFocused` 刻意把 color 輸入排除在『會叫出鍵盤的欄位』之外，所以聚焦色票不會設 `kb-open`、分頁列不會被收起；它留在設定視窗後面。
- 改量真正的使用者保證：視窗縮 336px 後色票仍在可見範圍內，而且中心最上層就是色票（分頁列沒蓋住）。真的 iOS 色票選擇器是否擋住色票，仍留給人工驗收。

**2. 韻族顏色 MINE 篩選用實際的 class 名稱**
- 計畫寫 `section-color-input`、`rm-color-reset`、`mapSettingsSection`；實際色票 class 是 `section-color-input`（相符），summary 無 class，改成直接量框。

### Auto-fixed Issues

None — 沒有任何檢查失敗在 js/ 或 css/ 的接縫上，所以沒有 Rule 1/2/3 的程式修正。開發中的三次失敗都是測試寫法（反白第一行在捲動外、重複選同一範圍、lh:map 比對含正規化後的前五鍵），已在測試裡修正，沒有放寬任何斷言。

## Known Stubs

None.

## Threat Flags

None（沒有新增網路端點、儲存或信任邊界）。T-11-17：檢查另一個分頁那項證實 lh:map／歌曲變動時分析面板、浮動列、韻腳選單全部收起來，偏好設定的開關與色票重新正規化後顯示新值。T-11-SC：package.json 與 package-lock.json 沒有變動。

## Self-Check: PASSED

- tests/line-journey.spec.mjs、tests/line-audit.spec.mjs 存在；兩個 commit（a2d09ab、476497a）都在 `git log`。
- `grep -c "整合：句構分析一次走完"` 1；`rhymeAnalysis`、`mapSettingsSection` 皆出現；`檢查：` 5 次；`auditTouchTargets`、`openTwoTabs` 皆出現。
- `npx playwright test tests/line-journey.spec.mjs tests/line-audit.spec.mjs tests/layout.spec.mjs tests/rhyme-audit.spec.mjs`：95 passed。
- `npm test`：1031 passed / 29 skipped / 0 failed。
