---
phase: 11-line-analysis-settings
plan: 02
subsystem: ui
tags: [vanilla-js, settings, lh:map, line-analysis, comparison, playwright, perf]

requires:
  - phase: 11-line-analysis-settings
    provides: 11-01 的逐行標記、lh:map 擴充、lhLineGroupKey／lhLineRefIndex、_lhMapBuildFrag
provides:
  - 偏好設定的「韻腳地圖與句構分析」段落（lhMapPrefsBuild／lhMapOpenPrefs），選單的「更多設定…」
  - 兩處開關的雙向同步（lhMapMenuSync 同時更新選單與偏好設定）
  - 對照差異（span.lm-t-d）、行尾韻腳字母（span.lm-t-r[data-f]）
  - 詞庫沒載好前先畫字數與明確斷點、載好後自動補 ≈（_lhMapOk／_lhMapWl 兩段閘門）
  - Esc 關偏好設定；一次一段的重畫排程
affects: [11-03, 11-04, 11-05, 11-06, 11-07, 11-08]

actuals:
  tokens: 21000
  tasks: 3
  commits: 3

plan_head_before: 1e6dba0a325fb4ed590c207b86c920e037a54e5c
plan_head_after: 4cc578b
commits: 3
status: complete

tech-stack:
  added: []
  patterns:
    - "一個設定、兩處介面：lhMapMenuSync 用 querySelectorAll 同時更新 #rhymeMenu 與 #mapSettingsSection"
    - "對照段落文字進快取鍵（hit.ref === refText），對照段落一改，同類型段落的快取自動失效"
    - "重畫排程一次只畫一段，剩下的再排一次，避免同類型段落擠成長任務"

key-files:
  created: []
  modified:
    - index.html
    - js/rhyme-map.js
    - js/search-ui.js
    - css/panels.css
    - tests/line-analysis-ui.spec.mjs
    - tests/rhyme-map-perf.spec.mjs

key-decisions:
  - "閘門拆兩段：_lhMapOk（字典＋歌曲結束）可畫字數與明確斷點，_lhMapWl（詞庫也結束）才做韻腳分析與猜斷句；__lhMapReady 語意不變（全部結束）"
  - "對照差異 hint 照 RESEARCH X4 改成「跟同類型第一段的同一行字數不同時，標出 ≠ 和對方的字數」，不用 UI-SPEC 的「同類型前一段」"
  - "overlay 只加 Esc，不還焦點（⚙️ 觸發鈕是不可聚焦的 div）"

requirements-completed: [MAP-09, MAP-11]

coverage:
  - id: D1
    description: "「韻腳 ▾」→「更多設定…」關選單、打開偏好設定、展開並聚焦「韻腳地圖與句構分析」；已開著時不會被關掉"
    requirement: MAP-11
    verification:
      - kind: e2e
        ref: "tests/line-analysis-ui.spec.mjs#對照：打開對照差異，同類型第一段的同一行字數不同就標 ≠"
        status: pass
  - id: D2
    description: "對照差異：Verse II、III 都對 Verse I，字數不同標「≠對方字數」，改 Verse I 後 Verse II 的 ≠ 跟著更新且不動其文字，標題列沒有新按鈕"
    requirement: MAP-09
    verification:
      - kind: e2e
        ref: "tests/line-analysis-ui.spec.mjs#對照：打開對照差異，同類型第一段的同一行字數不同就標 ≠"
        status: pass
  - id: D3
    description: "偏好設定內容、順序、文案逐字；細項從不禁用；逐行標記關著時細項值保留；四個細項都關的提醒"
    requirement: MAP-11
    verification:
      - kind: e2e
        ref: "tests/line-analysis-ui.spec.mjs#偏好設定：內容與順序 / 偏好設定：四個細項都關"
        status: pass
  - id: D4
    description: "選單與偏好設定同步（含寬韻／嚴格、重新整理、別的分頁），每次從 ⚙️ 打開都收著，Esc 關閉，方向鍵只移焦點"
    requirement: MAP-11
    verification:
      - kind: e2e
        ref: "tests/line-analysis-ui.spec.mjs#偏好設定：兩邊同步 / 別的分頁改了設定 / 每次從齒輪打開都收著，Esc 關掉"
        status: pass
  - id: D5
    description: "行尾韻腳字母跟著寬韻／嚴格，有韻腳才有家族色底線"
    requirement: MAP-09
    verification:
      - kind: e2e
        ref: "tests/line-analysis-ui.spec.mjs#常駐：行尾韻腳字母跟著寬韻嚴格"
        status: pass
  - id: D6
    description: "詞庫載入前先有字數與明確斷點，載好後自動補 ≈、提醒收起來"
    requirement: MAP-09
    verification:
      - kind: e2e
        ref: "tests/line-analysis-ui.spec.mjs#詞庫載入：先只有字數與明確斷點，載好後補上 ≈"
        status: pass
  - id: D7
    description: "150 行＋同類型兩段、全部標記與對照開著，4× 降速連續打字沒有超過 50ms 的長任務"
    requirement: MAP-09
    verification:
      - kind: perf
        ref: "tests/rhyme-map-perf.spec.mjs#效能：一百五十行全部標記開著連續打字沒有超過 50ms 的長任務"
        status: pass
---

# Phase 11 Plan 02: 偏好設定的句構分析與對照差異 Summary

**「韻腳 ▾」選單按「更多設定…」直達偏好設定裡的「韻腳地圖與句構分析」，一處改、兩處同步；對照差異讓 Verse II、III 標出和 Verse I 字數不同的行（`≠5`），行尾韻腳字母可選，詞庫載好後 ≈ 自己補上。**

## Performance

- **Duration:** 約 30 分鐘
- **Completed:** 2026-10-28
- **Tasks:** 3（1 tracer、2 auto）
- **Files modified:** 6（無新增）

## Accomplishments

- `index.html` 加 `<details id="mapSettingsSection">` 外殼（在自動備份之後、意見回饋之前）；內容由 `lhMapPrefsBuild()` 第一次打開時用 `_lhMk`／`_lhMkBlock` 建（沒有 HTML 字串）。
- `lhMapOpenPrefs()`：`lhMapCloseAll()` → 沒開才加 `show` 並叫 `renderLexiconPackList()`（不走 `toggleSettings`，不會把已開的面板關掉）→ 展開、`scrollIntoView({ block: 'start' })`、焦點放標題。
- `lhMapMenuSync()` 用兩個 selector 同時更新選單與偏好設定的開關、寬韻／嚴格、說明文字；storage 事件原本就走 `lhRhymeNormalizeSettings` 再 sync，現在兩邊都跟著（T-11-08）。
- 對照差異：`lhMapPaint` 用 `lhLineRefIndex` 找同類型第一段的文字，進快取（`hit.ref === refText`）；`_lhMapMarker` 照「可分析行的順序」對字數，不同才寫 `≠N`，空 span 留著對齊；`lhMapSchedule` 在 `line && lnDiff` 時把同 `lhLineGroupKey` 的段落一起排。
- 行尾韻腳字母：`span.lm-t.lm-t-r`，字母取 `res.rows`，沒韻腳是 `-`，有韻腳才有 `data-f` 與家族色底線（同標題列字母條的 color-mix）。
- 詞庫閘門拆兩段（見 key-decisions）；`lhMapOnLexiconChange` 與兩段閘門都呼叫 `lhMapMenuSync`，載入提醒自己收起來。
- `search-ui.js`：`toggleSettings()` 打開時收掉韻腳浮層並把 `#mapSettingsSection` 收著；一個 document keydown 監聽處理 Esc（排除組字中、`defaultPrevented`）。panels.js 的 sheet Esc 在 overlay 開著時本來就讓位，載入順序上它先跑，所以不會同時被收。

## Task Commits

1. **Task 1（tracer）：「更多設定…」＋對照差異** - `f3d4d49` (feat)
2. **Task 2：偏好設定內容、同步、行尾韻腳字母、詞庫載入提醒、Esc** - `d3f397f` (feat)
3. **Task 3：長歌全部標記效能量測＋排程一次一段** - `4cc578b` (perf)

## 規劃要求記錄的項目

### 效能數字（LH_PERF=1 --workers=1，CDP 4× 降速，真詞庫，門檻 50 × LH_PERF_SCALE(1) = 50ms）

| 情境 | 修正前 | 修正後 |
| --- | --- | --- |
| 150 行 verse + 50 行 chorus + 150 行 verse，全部標記＋對照開著，連續打 40 鍵、3 個 Enter | **最長任務 52–53ms（3 個長任務，連跑 3 次都超標）** | **0 個長任務（連跑 3 次＋最後一次完整跑）** |
| Phase 10 既有：150 行句尾上色 | 0 | 0 |
| 200 行 `lhRhymeAnalyze` 中位數 | 0.4ms | 0.4–0.5ms |

### 排程優化（Task 3 步驟 2）

對照差異開著時 `lhMapSchedule` 會把 Verse I 與同類型的 Verse III（各 150 行）一起排，`_lhMapFlush` 原本在同一個 idle callback 裡連畫兩段，4× 降速下合計略超 50ms。改成 `run` 一次只畫 pending 的第一段，畫完還有就再排一次（`_lhMapFlush()` 自己再呼叫；若期間有新的排程計時器就交給它）。行為不變：組字中不動、待算清單照舊、快取比對（文字、設定簽名、對照文字）不變。沒有調門檻。

### 實際用到的說明文字 id

選單：`rhymeHintLine`（逐行標記，新增）。偏好設定：`rmPrefLetters`、`rmPrefInner`、`rmPrefSkip`、`rmPrefLine`、`rmPrefRhyme`、`rmPrefCount`、`rmPrefSplit`、`rmPrefDiff`（各接到自己的開關 `aria-describedby`；句尾上色沒有說明文字）。提醒用 class：`.rm-lex-wait`（詞庫載入中，≈ 的自動斷句稍後補上）、`.rm-none`（四個細項都關著，所以沒有東西可顯示），兩者都不是 id。

### X4 文案變更（供 11-07 UAT）

對照差異的說明文字用「**跟同類型第一段的同一行字數不同時，標出 ≠ 和對方的字數**」，不用 UI-SPEC 的「同類型前一段」，因為 RESEARCH X4 的規則是對同類型的第一段（Verse II 與 Verse III 都對 Verse I）。UAT 應照這句話驗。

### 其他

- overlay 加 Esc 但沒有焦點回還（⚙️ 觸發鈕是不可聚焦的 div）。
- 偏好設定打開時 `toggleSettings()` 也收掉韻腳浮層（RESEARCH Pitfall 10，plan 步驟 6 沒列但 Pitfall 10 要求）。

## Files Created/Modified

- `index.html` - `#mapSettingsSection` 外殼
- `js/rhyme-map.js` - 偏好設定建構與開啟、雙處同步、`_lhMapRadioKeys`／`_lhMapModeRadios`、對照與字母標記、兩段閘門、一次一段的排程
- `js/search-ui.js` - `toggleSettings` 收段落、Esc 監聽
- `css/panels.css` - `.lm-t-r`、`.lm-t-d`、`.rm-sub`、`.rm-more`、偏好設定區塊間距（無色碼、無 transition）
- `tests/line-analysis-ui.spec.mjs` - 對照、偏好設定 ×5、常駐字母、詞庫載入共 8 個
- `tests/rhyme-map-perf.spec.mjs` - 全部標記的長任務量測（LH_PERF 才跑）

## Decisions Made

見 frontmatter `key-decisions`。

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug/契約缺口] 詞庫載入前原本整個不畫，達不到「先有字數與明確斷點」**
- **Found during:** Task 2（「詞庫載入」測試的前置推演）
- **Issue:** Phase 10 的 `_lhMapOk` 等字典＋詞庫＋歌曲都結束才畫；plan 的真值與 UI-SPEC D-18 要求詞庫載入前字數與明確斷點已顯示
- **Fix:** `_lhMapOk` 改成字典＋歌曲結束，新增 `_lhMapWl`（詞庫也結束）；`_lhMapBuildFrag` 與 `lhMapPaint` 在 `_lhMapWl` 為 false 時不做韻腳分析（`.rm-hl`、`.rm-inner`、字母條都跟 Phase 10 一樣載入後才出現），選單的「詞庫載入中，載好後會自動上色」改看 `_lhMapWl`。`__lhMapReady` 仍等三件事全結束。Phase 10 的測試（含「開關：詞庫載入中的提示」）全部原封通過
- **Files modified:** js/rhyme-map.js
- **Commit:** d3f397f

**2. [Rule 3 - 排程優化] 排程一次只畫一段**
- **Found during:** Task 3（量測 52–53ms 超過 50ms）
- **Fix/Commit:** 見上方「排程優化」，`4cc578b`

**Total deviations:** 2（皆無範圍擴張）。

## Issues Encountered

無。

## Known Stubs

無。

## Threat Flags

無新增攻擊面。T-11-06（偏好設定內容全是常數字串＋textContent）、T-11-07（同類型排程走原本 debounce／idle，且現在一次一段；perf 測試量到最壞情況）、T-11-08（storage 事件仍經 `lhRhymeNormalizeSettings`）都有對應。

## Verification

- `npm test`：**989 passed / 29 skipped / 0 failed**（基準 981 / 28 / 0：新增 8 個 line-analysis-ui 測試通過；多的 1 個 skipped 是 LH_PERF 才跑的新效能測試）
- `LH_PERF=1 npx playwright test tests/rhyme-map-perf.spec.mjs --workers=1`：3 passed，0 skipped
- `package.json`、`package-lock.json` 無變動；視覺基準無變動；沒有 `git push`

## Next Phase Readiness

11-03 之後可直接用 `lhMapPrefsBuild()` 在偏好設定段落加「位置／大小／顏色」等區塊（`_lhMapPrefRow`、`_lhMapModeRadios`、`_lhMapRadioKeys` 可重用）；`_lhMapBuildFrag(text, readings, refText)` 的第三參數已接上，預覽可傳 `null`。

## Self-Check: PASSED

- FOUND: index.html（`id="mapSettingsSection"`）、js/rhyme-map.js（`function lhMapOpenPrefs`、`function _lhMapRadioKeys`）、js/search-ui.js（`Escape`、`mapSettingsSection`）
- FOUND commits: f3d4d49、d3f397f、4cc578b
