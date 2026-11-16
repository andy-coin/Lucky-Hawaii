---
phase: 11-line-analysis-settings
plan: 01
subsystem: ui
tags: [vanilla-js, mirror-layer, lh:map, settings, line-analysis, playwright]

requires:
  - phase: 10-rhyme-map
    provides: 鏡像層 div.rhyme-mirror、lh:map 五布林設定、lhRhymeAnalyze、_lhMapSync、備份匯入路徑
provides:
  - js/line-core.js（lhLineAnalyze 逐組 guess 旗標、lhLineStructParts／Text、lhLineRows、lhLineGroupKey、lhLineRefIndex）
  - lh:map 擴充（LH_MAP_DEFAULTS／ENUM／COLOR_RE／COLOR_KEYS、逐鍵驗證的 lhRhymeNormalizeSettings、最小序列化 lhRhymeSerialize）
  - 逐行標記（靠右欄／句尾後的 data-lm、--lm-fs／--lm-cols／--lm-bar、span.lm-mk 字數與斷句）
  - 「韻腳 ▾」選單的逐行標記開關；讀入時清洗壞掉的 readings；?v=0.96.15
affects: [11-02, 11-03, 11-04, 11-05, 11-06, 11-07, 11-08]

actuals:
  tokens: 17400
  tasks: 3
  commits: 3

plan_head_before: f1a2f16d25d80659aea8692c97f1411d79153186
plan_head_after: 1e6dba0a325fb4ed590c207b86c920e037a54e5c
commits: 3
status: complete

tech-stack:
  added: []
  patterns:
    - "設定只改 CSS 的鍵（pos／size／depth）不重畫，其餘才 lhMapRenderAll"
    - "gutter 有無只看設定（html data-lm），不看文字內容"
    - "標記插在最後非空白字元之後、行尾空白之前"
    - "純函式用 Map 查表，不用物件字面量（__proto__ 安全）"

key-files:
  created:
    - js/line-core.js
    - tests/line-core.spec.mjs
    - tests/line-analysis-ui.spec.mjs
  modified:
    - index.html
    - js/rhyme-core.js
    - js/rhyme-map.js
    - js/safety.js
    - js/songs.js
    - css/panels.css
    - tests/node-core.mjs
    - tests/split-tags.spec.mjs
    - tests/rhyme-core.spec.mjs
    - tests/rhyme-map-ui.spec.mjs
    - tests/rhyme-audit.spec.mjs

key-decisions:
  - "只有機器猜的那一段加 ≈ 與斜體（覆蓋 UI-SPEC D-04「整串加 ≈」）；lhLineAnalyze 回傳逐組 guess 陣列"
  - "lnCount／lnSplit 預設 true，依 CONTEXT D4 括號說法；總開關 line 預設 false，所以新使用者什麼都看不到"
  - "lh:map 最小序列化：五個舊鍵永遠照原順序寫，新鍵與預設不同才寫，colors 非空才寫"
  - "對照＝同類型第一段（CONTEXT B1，RESEARCH X4）；lhLineGroupKey 給 11-02 排程共用"

requirements-completed: [MAP-09, MAP-10, MAP-11]

coverage:
  - id: D1
    description: "打開逐行標記後，每行右欄顯示字數與斷句（月光 灑在 窗前 → 6／2+2+2；夢裡想起你的臉 → 7／≈2+2+3），重新整理後還在"
    requirement: MAP-09
    verification:
      - kind: e2e
        ref: "tests/line-analysis-ui.spec.mjs#常駐：打開逐行標記，每行右邊出現字數與斷句"
        status: pass
  - id: D2
    description: "字數與斷句規則由固定歌詞範例釘住（SC1）：加總等於字數、四字內不猜、詞庫未載不猜、只有猜的那段加 ≈"
    requirement: MAP-09
    verification:
      - kind: unit
        ref: "tests/line-core.spec.mjs#斷句：*"
        status: pass
  - id: D3
    description: "lh:map 新舊相容：舊五鍵字串逐字不變、壞值逐鍵退回預設、顏色只收 16 鍵小寫色碼、備份匯入走同一支整理程式"
    requirement: MAP-11
    verification:
      - kind: unit
        ref: "tests/rhyme-core.spec.mjs#設定：*"
        status: pass
      - kind: integration
        ref: "tests/rhyme-map-ui.spec.mjs#備份：句構設定跟著備份走 / 備份：壞掉的句構設定 / 開關：舊版設定開機不改寫"
        status: pass
  - id: D4
    description: "「韻腳 ▾」選單的逐行標記開關，預設關、開關都即時套用"
    requirement: MAP-10
    verification:
      - kind: e2e
        ref: "tests/rhyme-map-ui.spec.mjs#開關：從選單打開逐行標記"
        status: pass
  - id: D5
    description: "儲存裡壞掉的 readings 在讀入時清掉（不寫回），指定讀音照常運作"
    verification:
      - kind: e2e
        ref: "tests/rhyme-map-ui.spec.mjs#讀音：儲存裡壞掉的讀音"
        status: pass
---

# Phase 11 Plan 01: 逐行標記（Tracer）Summary

**在「韻腳 ▾」打開「逐行標記」，每行右欄就顯示字數與斷句（`6`／`2+2+2`、`7`／`≈2+2+3`），只有機器猜的那一段帶 ≈ 並斜體；lh:map 擴成 15 鍵但舊字串逐字不變。**

## Performance

- **Duration:** 約 11 分鐘
- **Completed:** 2026-10-28
- **Tasks:** 3（1 tracer、1 TDD、1 auto）
- **Files modified:** 14（新增 3）

## Accomplishments

- `js/line-core.js`：單位切分與 `lhCountWords` 共用 `_LH_WC_RE`，所以「各組加總＝字數」由構造保證；≥5 單位且無明確斷點的片段才用 `wordPhoneticMap` 前向最長詞猜，單字併前（開頭的併後）。
- 設定契約：`lhRhymeNormalizeSettings` 逐鍵驗證（開關 typeof boolean、列舉在清單內、colors 只讀固定 16 把鍵），`lhRhymeSerialize` 最小序列化；`lhMapSetSetting`、storage 事件、備份匯入全部走這兩支。
- 標記畫在鏡像層：`span.lm-mk` 絕對定位、不佔 inline 空間，插在最後非空白字元與行尾空白之間（X1）；靠右欄的內距是純 CSS `calc(0.75rem + min(var(--lm-cols), 36%) + var(--sp-2))`，輸入框與鏡像層（`_lhMapSync` 複製 + `--lm-bar`）解析成同一個像素值。
- 版號全部 `?v=0.96.15`，`line-core.js` 載入在 `rhyme-core.js` 之後。
- 順手修 RESEARCH IN-04／IN-05：`_normalizeSong` 讀入時清 readings（不寫回）、`safety.js` 兩處 `typeof` 守門。

## Task Commits

1. **Task 1（tracer）：逐行標記** - `48911b0` (feat)
2. **Task 2：固定歌詞範例、對照索引、設定清洗測試** - `4e13ea1` (test + `lhLineGroupKey`／`lhLineRefIndex`)
3. **Task 3：選單開關、讀音清洗、備份／舊設定測試** - `1e6dba0` (feat)

## 規劃要求記錄的項目

- **最終 `LH_MAP_DEFAULTS` 順序：** `end:true, letters:false, inner:false, strict:false, skipParticles:true, line:false, lnRhyme:false, lnCount:true, lnSplit:true, lnDiff:false, autoHover:false, pos:'right', size:'m', depth:'std'`（另 `colors:{}` 不在這張表，由正規化器另處理）。
- **CONTEXT D4 的讀法：** D4 標題把四個內容項都列為「關」，括號說「打開逐行標記時字數＋斷句開」。預設值採括號說法（`lnCount`／`lnSplit` 為 true），因為總開關 `line` 預設 false，沒打開前畫面什麼都沒有，新使用者仍然只開句尾上色（html 沒有 `data-lm`、沒有標記、`lh:map` 不寫）。
- **gutter 基線對齊：** 不給 inline-block 設 `overflow: hidden`（會讓基線掉到底邊）。標記本身（`.lm-mk`）在靠右欄時 `overflow: hidden` 裁切，內層 `.lm-t` 繼承鏡像層字級與行高、只縮小字，結構欄用 `overflow: clip`（不是捲動容器，基線不變）加 `text-overflow: ellipsis`。測試用 Range 量該行最後一個字與字數欄的垂直中心，差小於 4px。
- **猜的那一段（覆蓋 UI-SPEC D-04）：** `lhLineStructParts(r)` 回傳 `[{ text, guess }]`。連續同旗標的組合成一段；猜的段落一律以 `≈` 開頭，連接兩段的 `+` 歸給自己標的那段（`月光 灑在 窗前 夢裡想起你的臉` → `[{ '2+2+2+', false }, { '≈2+2+3', true }]`；`夢裡想起你的臉 月光` → `[{ '≈2+2+3', true }, { '+2', false }]`）。鏡像層裡猜的段落是 `span.lm-guess`（斜體），自己標的是純文字節點。`lhLineAnalyze` 回傳 `{ n, groups, guess, guessed }`，`guess` 與 `groups` 一一對應。需列入 11-08 UAT 的覆蓋聲明。
- **200 行耗時：** 用真詞庫第一塊（`data/wordlist-c00.json`，23,372 詞），中位數約 1.26 ms，門檻 20 ms × `LH_PERF_SCALE`。
- **動到的 Phase 10 測試：** 三處，都是預期的 —— `tests/rhyme-core.spec.mjs` 「設定：整理成五個真布林」→「設定：整理成固定的鍵」；`tests/rhyme-map-ui.spec.mjs:1467`（選單開關清單加 `line`）；`tests/rhyme-audit.spec.mjs:492-493`（加 `['line','false','關']`）。其餘 Phase 10 的整串字串相等斷言（`MAP_DEFAULT`、五鍵字串）全部原封通過。另外在「開關：預設只開句尾上色」補了三行斷言（不改既有斷言）。

## Files Created/Modified

- `js/line-core.js` - 句構分析純函式（新）
- `js/rhyme-core.js` - `LH_MAP_*` 常數、擴充的正規化器、`lhRhymeSerialize`
- `js/rhyme-map.js` - `_lhMapBuildFrag`、`_lhMapMarker`、`lhMapApplyLook`、setter 白名單、選單開關列
- `js/safety.js` / `js/songs.js` - 備份匯入走 `lhRhymeSerialize`、`typeof` 守門、readings 讀入清洗
- `css/panels.css` - `.lm-mk`／`.lm-t*`／`.lm-guess` 與 `html[data-lm]` 內距規則（無色碼、無 transition）
- `index.html` - `line-core.js` script 標籤、全部 `?v=0.96.15`
- `tests/line-core.spec.mjs`、`tests/line-analysis-ui.spec.mjs`（新）；其餘測試檔更新

## Decisions Made

見 frontmatter `key-decisions`。

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - 排程] Task 3 步驟 1 的 safety.js `lhRhymeCleanReadings` typeof 守門提前進了 Task 1 的 commit**
- **Found during:** Task 1（改 `_lhSettingFrom` 時同一支檔案）
- **Issue:** 同檔案兩處改動，為避免在同一檔案拆 hunk 一併提交
- **Fix:** 與 `lh:map` 分支的守門一起放進 `48911b0`；Task 3 的 commit 只剩 `songs.js`、選單與測試
- **Files modified:** js/safety.js
- **Commit:** 48911b0

**2. [微調] 結構欄的裁切用 `overflow: clip` 而不是 `overflow: hidden`**
- **Issue:** 計畫的字面是 hidden，但 inline-block 設 hidden 會讓基線掉到底邊；計畫本身也要求「看畫面確認」
- **Fix:** `.lm-t-s` 用 `overflow: clip` + `text-overflow: ellipsis`（Chromium 實測基線正常、垂直差 < 4px）。WebKit／Gecko 沒有可測的瀏覽器，列入 Human check（iPad／iPhone Safari）

**Total deviations:** 2（皆無範圍擴張）。

## Issues Encountered

無。TDD 紅燈階段（Task 2）只缺 `lhLineGroupKey`／`lhLineRefIndex` 一個函式，補上後轉綠；`讀音：儲存裡壞掉的讀音` 另外用暫時關掉 songs.js 修正的方式確認它真的會紅。

## Known Stubs

無。`lnRhyme`（行尾韻腳字母）與 `lnDiff`（對照差異）兩個設定鍵已在契約裡、`--lm-cols` 也算得到它們的欄寬，但它們的標記內容與設定頁開關由 11-02 負責（本計畫選單只放 `line` 總開關）；兩個鍵預設 false，現在不會出現空欄位。

## Threat Flags

無新增攻擊面。T-11-01／02（設定驗證、colors 原型污染）、T-11-03（標記只用 textContent）、T-11-04（readings 讀入清洗）皆有對應測試。

## Verification

- `npm test`：**981 passed / 28 skipped / 0 failed**（基準 964 / 28 / 0，新增 17 個測試）
- `package.json`、`package-lock.json` 無變動；視覺基準（`*-linux.png`）無變動

## Next Phase Readiness

11-02 可直接使用 `LH_MAP_DEFAULTS`、`lhMapSetSetting`（已含白名單與 look 鍵不重畫）、`_lhMapBuildFrag(text, readings)`（預留第三參數給對照文字）、`lhLineGroupKey`／`lhLineRefIndex`。

## Self-Check: PASSED

- FOUND: js/line-core.js、tests/line-core.spec.mjs、tests/line-analysis-ui.spec.mjs
- FOUND commits: 48911b0、4e13ea1、1e6dba0
