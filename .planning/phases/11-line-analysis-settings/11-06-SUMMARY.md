---
phase: 11-line-analysis-settings
plan: 06
subsystem: ui
tags: [vanilla-js, hover-dwell, analysis-panel, page-clock, playwright]

requires:
  - phase: 11-line-analysis-settings
    provides: 11-05 的浮動列「📏 分析」、lhMapOpenAnalysis、_lhMapBarPlace；11-02 的偏好設定區塊與 _lhMapPrefRow
provides:
  - 偏好設定「句構分析」區塊最後一項開關「反白停留自動分析」（autoHover，預設關）與說明
  - 停留偵測：LH_MAP_DWELL_MS／LH_MAP_DWELL_PX、_lhPtr、_lhDwellArm／_lhDwellCancel／_lhDwellOk、snap.zone
  - hover： 測試 5 支（假時鐘暫停，1499／1500ms）
affects: [11-07, 11-08]

actuals:
  tokens: 27000
  tasks: 2
  commits: 2

plan_head_before: 68a51ebb4f2020273dcb3e16e4b0fef2725dee19
plan_head_after: 251dd545b18fee86848acebd28603f076e306cf5
commits: 2
status: complete

tech-stack:
  added: []
  patterns:
    - "停留區域 snap.zone 在 _lhMapBarPlace 用它已經建好的那一個 lhMirror 多量一個 lhCaretRect(a)，之後 pointermove 只比座標、不碰版面"
    - "計時用『選取範圍』認同一個選取（ta、a、b），不比快照物件：放開滑鼠後的 400ms 路徑會重建快照"
    - "指標事件 pointermove 與 pointerdown 共用一個 capture 監聽，pointerdown 也更新 mouse 旗標，觸控的相容 mouseup 前最後一個指標是手指"

key-files:
  created: []
  modified:
    - js/rhyme-map.js
    - tests/line-analysis-ui.spec.mjs

key-decisions:
  - "動 3px（離起算點）以上或進到浮動列／面板就取消，而且永遠不重新起算；只有新的滑鼠反白（mouseup 路徑）才重新等 1.5 秒（照 CONTEXT C4／UI-SPEC D-10，不採 RESEARCH Pattern 6 草稿的『動了就重新起算』）"
  - "autoHover 放進 LH_MAP_LOOK_KEYS：切換它不重畫鏡像層"
  - "計時到點時比對選取範圍並重新檢查所有條件才開，開的是當下的快照"

requirements-completed: [MAP-10, MAP-11]

coverage:
  - id: D1
    description: "偏好設定『句構分析』最後一項開關『反白停留自動分析』（不縮排、預設關）與逐字說明，aria-describedby 接起來，切換存進 lh:map"
    requirement: MAP-11
    verification:
      - kind: e2e
        ref: "tests/line-analysis-ui.spec.mjs#hover：偏好設定有「反白停留自動分析」開關與說明，預設關"
        status: pass
      - kind: e2e
        ref: "tests/line-analysis-ui.spec.mjs#偏好設定：內容與順序"
        status: pass
  - id: D2
    description: "滑鼠反白後指標停在選取區域內不動：1499ms 未開、1500ms 開同一個句構面板，不搶焦點，開了之後指標離開區域不關"
    requirement: MAP-10
    verification:
      - kind: e2e
        ref: "tests/line-analysis-ui.spec.mjs#hover：滑鼠反白停 1.5 秒自動打開句構面板，不搶焦點"
        status: pass
  - id: D3
    description: "八種取消動作（移出區域、滾輪、按鍵、選取改變、組字、開韻腳選單、進到浮動列、區域內動 5px）；2px 不取消；取消後不重新起算，重新反白才再等 1.5 秒"
    requirement: MAP-10
    verification:
      - kind: e2e
        ref: "tests/line-analysis-ui.spec.mjs#hover：會取消的動作"
        status: pass
  - id: D4
    description: "開關關著、全新 profile、鍵盤選取、手機（觸控、粗略指標）都不會自動出現；手機的『📏 分析』照樣能點開"
    requirement: MAP-10
    verification:
      - kind: e2e
        ref: "tests/line-analysis-ui.spec.mjs#hover：觸控、鍵盤選取或沒打開都不會自動出現"
        status: pass
      - kind: manual
        ref: "真的 iPad 觸控板／外接滑鼠是否回報 (hover: hover) and (pointer: fine)（RESEARCH A2，列入 11-07 UAT）"
        status: backstop
  - id: D5
    description: "計時中 pointermove 不量版面（lhMirror 呼叫次數為 0），小動作不取消、照開"
    requirement: MAP-10
    verification:
      - kind: e2e
        ref: "tests/line-analysis-ui.spec.mjs#hover：不在移動時量版面"
        status: pass
---

# Phase 11 Plan 06: 反白停留自動分析 Summary

**打開偏好設定的「反白停留自動分析」後，用滑鼠反白、指標在選取範圍內停 1.5 秒，句構面板自己打開（同一個面板、不搶焦點）；觸控與鍵盤選取永遠不會自動出現，預設關。**

## Performance

- **Tasks:** 2（Task 1 tracer、Task 2 auto）
- **Files modified:** 2（js/rhyme-map.js、tests/line-analysis-ui.spec.mjs）
- **全套測試：** `npm test` 1025 passed / 29 skipped / 0 failed（11-05 基準 1020 / 29 / 0，新增 5 支 hover： 測試）

## Accomplishments

- 偏好設定『句構分析』區塊最後多一個開關（不縮排）加說明，所有裝置都看得到；autoHover 屬於不重畫的設定。
- 停留偵測（js/rhyme-map.js「反白停留自動分析」區段）：滑鼠放開路徑（`_lhMapSelCheck(ta, true)`）顯示浮動列後才啟動；400ms 的鍵盤／觸控路徑傳 false，永遠不啟動。
- 停留區域 `snap.zone`（輸入框寬 × 第一個選取視覺列頂到最後一個視覺列底）在 `_lhMapBarPlace` 量一次，段落超過 LH_WD_BIG 不量也就不啟動。
- 取消來源：`lhMapHideBar`／`lhMapHideAnalysis`／`lhMapCloseAll`／`lhMapOpenMenu` 都呼叫 `_lhDwellCancel()`，另有 document capture 的 wheel（passive）、keydown、compositionstart，以及 pointermove／pointerdown 的 3px 與進到浮動列／面板判斷。

## Task Commits

1. **Task 1 (tracer):** `10c6e14` — feat(11-06): 偏好設定新增「反白停留自動分析」，滑鼠反白後停 1.5 秒自動打開句構面板
2. **Task 2:** `251dd54` — test(11-06): 停留會被哪些動作取消、觸控與鍵盤選取與未開啟都不會自動出現、移動時不量版面

Task 2 沒有發現需要修改 js/rhyme-map.js 的缺口，所以只有測試。

## 測試筆記（計畫要求記錄的三件事）

- **page.clock 怎麼裝：** `bootPage(..., { beforeGoto: ({ page }) => page.clock.install() })` 在導航前裝；開機後先 `waitStill`（左面板開機時還在滑進來，CSS 動畫不受假時鐘管，沒等它停，輸入框座標是負的、page.mouse.move 會被吞掉），再 `pauseAt(Date.now() + 1000)` 暫停，之後時間只靠 `runFor` 前進。暫停時鐘沒有擋住開機，也沒有擋住 rAF 路徑（`runFor(60)` 就會跑到 mouseup 的 rAF），所以不需要改成開機後才裝。
- **3px 取消而且不重新起算：** 測試『會取消的動作』在區域內動 5px 之後 `runFor(10000)` 面板仍未開；再用新的反白（select + mouseup）才重新等，`1499ms` 未開、`+1ms` 開。2px 的正向對照照開。
- **假時鐘下的 rAF：** 假時鐘下 rAF 只在 `runFor` 前進時才觸發，所以每次 mouseup 後要 `runFor(60)` 浮動列才會出現。反白一律程式化（setSelectionRange）加送 bubbling mouseup；指標用真的 `page.mouse.move`。每次反白後先 `waitForTimeout(100)`（真實時間）讓 select／selectionchange 事件送完，再前進假時鐘，避免上一個案例收合選取的晚到事件漏進下一個案例（全套平行跑時曾有一次偶發失敗，加上之後 `--repeat-each` 與全套都穩定）。精確的『啟動後 1499ms』用測試裡包住 `window._lhDwellArm` 記下的假時間算出。

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 計時到點時用快照物件比對會永遠不開**
- **Found during:** Task 1
- **Issue:** 計畫寫『重新檢查同一個快照』。放開滑鼠後瀏覽器晚到的 selectionchange 會讓 400ms 路徑重建快照物件，物件比對失敗，面板永遠不開。
- **Fix:** 啟動時記下 ta、a、b，到點時比選取範圍並重新檢查所有條件，開的是當下的快照。
- **Files modified:** js/rhyme-map.js
- **Commit:** 10c6e14

**2. [Rule 2 - 補上遺漏] pointerdown 也更新 `_lhPtr`**
- **Found during:** Task 1（對照 T-11-16「不是滑鼠就不啟動」）
- **Issue:** 只聽 pointermove 時，有觸控螢幕的筆電上手指點選會沿用舊的 mouse=true。
- **Fix:** pointermove 與 pointerdown 共用同一個 capture 監聽。
- **Commit:** 10c6e14

**3. [Rule 3 - 擋住測試] 既有測試『偏好設定：內容與順序』要跟著新開關改**
- 開關標籤清單、說明文字清單、aria-describedby 數量 8 → 9 各補一項。Commit: 10c6e14

**4. 取消規則採 CONTEXT／UI-SPEC 而非 RESEARCH 草稿**
- RESEARCH Pattern 6 的草稿在動 ≥3px 時『重新起算』；CONTEXT C4 與計畫 Task 1 步驟 2 要求取消、永不重新起算，照後者做。

## Known Stubs

None.

## Threat Flags

None（沒有新增網路端點、儲存或信任邊界；T-11-16 的緩解全部落實：pointerType mouse、媒體查詢、autoHover 開著、只從滑鼠反白啟動、開的是唯讀且不拿焦點的面板）。package.json 與 package-lock.json 沒有變動。

## Self-Check: PASSED

- js/rhyme-map.js、tests/line-analysis-ui.spec.mjs 已修改並提交；兩個 commit（10c6e14、251dd54）都在 `git log`。
- `LH_MAP_DWELL_MS` 2 處、`function _lhDwellArm` 1 處、`function _lhDwellCancel` 1 處、`_lhDwellCancel()` 8 處、`反白停留自動分析` 出現、`hover：` 測試 5 支。
- `npm test`：1025 passed / 29 skipped / 0 failed。
