---
phase: 11-line-analysis-settings
plan: 04
subsystem: ui
tags: [vanilla-js, settings, lh:map, colors, contrast-advisory, preview, playwright]

requires:
  - phase: 11-line-analysis-settings
    provides: 11-01 的 lh:map.colors 整理與序列化、_lhMapBuildFrag；11-02 的偏好設定段落與 lhMapMenuSync；11-03 的顯示方式與 LH_MAP_DEPTH
provides:
  - 偏好設定「韻族顏色」：16 個原生色票（日夜共用）＋不能點的空韻格，拖曳只改 CSS 變數、放開才存進 lh:map.colors
  - 有效色票（自訂優先、其次目前主題預設）：lhMapApplyPalette／_lhMapEffColor
  - 恢復預設顏色（按兩次、4 秒或離開按鈕解除、無自訂色時 aria-disabled）
  - 對比提醒：隱形探針讀目前主題真實的文字色與卡片底色，列最多三個韻族再寫「等 n 個」
  - lhRhymeMixRgb／lhRhymeContrast 純函式（rhyme-core.js）
  - 偏好設定最上面的即時預覽（div.rhyme-mirror.lm-preview，同一個 _lhMapBuildFrag 渲染器），高螢幕 sticky
affects: [11-05, 11-06, 11-07, 11-08]

actuals:
  tokens: 28000
  tasks: 3
  commits: 3

plan_head_before: 1a7004d72d70c8885ca84eb9df7a10e316ea12bd
plan_head_after: b775bcfbd58151e95ba94df33f640c541a4af394
commits: 3
status: complete

tech-stack:
  added: []
  patterns:
    - "拖曳不存：input 事件只 setProperty('--rm-cN')，change 事件才 lhMapSetColor；變數名稱只用固定的家族編號串接，值先過 LH_MAP_COLOR_RE"
    - "預覽與歌詞共用渲染器：_lhMapPreviewPaint 只呼叫 _lhMapBuildFrag(LH_MAP_PREVIEW_TEXT, null, null)，掛在 lhMapMenuSync 尾端（所有設定變動都會走到）"
    - "主題色探針：CSS 的 .rm-probe（display:none，color/background 讀 --text-primary／--card-bg），JS 只讀 getComputedStyle 的 rgb 整數，不解析 color-mix"

key-files:
  created: []
  modified:
    - js/rhyme-core.js
    - js/rhyme-map.js
    - css/panels.css
    - tests/rhyme-core.spec.mjs
    - tests/line-analysis-ui.spec.mjs

key-decisions:
  - "對比提醒與預覽重畫都放在 lhMapMenuSync，不另外在 lhMapApplyLook／主題觀察者各掛一次：設定變動、顏色提交、濃淡、別的分頁、詞庫載好、恢復預設、主題切換都已經走這個單一出口"
  - "主題 MutationObserver 現在除了換色票也呼叫 lhMapMenuSync，偏好設定的色票才會顯示新主題的預設色"
  - "sticky 的 top 用 -1.5rem：設定視窗上內距 1.5rem，top: 0 會讓預覽停在內距下面，捲動的內容從上方那條縫露出來"
  - "提醒文案的 n 是低於 4.5:1 的總數（5 個就寫「等 5 個」），不是扣掉前三個後的剩餘數"

requirements-completed: [MAP-11]

coverage:
  - id: D1
    description: "韻族顏色格：16 個原生色票顯示有效色、aria-label 「「{韻}」韻族顏色」、第 17 格空韻不能點；拖曳（input）只改變數、色塊、色票，不存、不重畫；放開（change）存進 lh:map.colors 並念「已更新「{韻}」韻族顏色」"
    requirement: MAP-11
    verification:
      - kind: e2e
        ref: "tests/line-analysis-ui.spec.mjs#韻族顏色：改一個韻族的顏色，色塊馬上變、存起來、日夜共用"
        status: pass
  - id: D2
    description: "自訂色日夜共用、重新整理還在、備份帶著且匯入整理後逐字相同；別的分頁寫入後這個分頁的變數與色票跟著變、清掉後回預設"
    requirement: MAP-11
    verification:
      - kind: e2e
        ref: "tests/line-analysis-ui.spec.mjs#韻族顏色：改一個韻族的顏色，色塊馬上變、存起來、日夜共用 / 韻族顏色：別的分頁改了顏色"
        status: pass
  - id: D3
    description: "恢復預設顏色：無自訂色禁用且按了沒反應；按兩次才清；4 秒與離開按鈕解除；「重設顏色!」不碰韻族顏色；lh:map 的 colors 鍵消失"
    requirement: MAP-11
    verification:
      - kind: e2e
        ref: "tests/line-analysis-ui.spec.mjs#韻族顏色：恢復預設要按兩次"
        status: pass
  - id: D4
    description: "對比提醒：深色純白點名該韻族；深色「濃」預設色低於 4.5 的 5 個韻族寫「…等 5 個」；標準或清掉就收起；不擋存檔"
    requirement: MAP-11
    verification:
      - kind: unit
        ref: "tests/rhyme-core.spec.mjs#對比：提醒用的混色與對比"
        status: pass
      - kind: e2e
        ref: "tests/line-analysis-ui.spec.mjs#韻族顏色：對比提醒"
        status: pass
  - id: D5
    description: "壞色碼（大寫、三位、顏色名稱、非法字元、url()、鍵 16、__proto__、constructor）一律不進頁面，輸入框與變數都是預設，沒有頁面錯誤；直接呼叫 lhMapSetColor 的壞值也進不來"
    requirement: MAP-11
    verification:
      - kind: e2e
        ref: "tests/line-analysis-ui.spec.mjs#韻族顏色：壞色碼被丟掉"
        status: pass
  - id: D6
    description: "手機 390×844：每個色票 input 連發兩次不寫入、change 恰好寫一次，色票框 ≥ 44px"
    requirement: MAP-11
    verification:
      - kind: e2e
        ref: "tests/line-analysis-ui.spec.mjs#韻族顏色：手機上的原生色票"
        status: pass
      - kind: manual
        ref: "真的 iOS／Android 原生色票面板（列入 11-07 UAT）"
        status: backstop
  - id: D7
    description: "預覽與真的鏡像層逐 span 相同（class、文字、data-f；預設、嚴格、字數關）；每個開關（字數、對照差異說明、位置、大小、顏色拖曳、深色）預覽都馬上看得到；高螢幕 sticky 貼齊視窗上緣、矮螢幕 static；預覽不在 Tab 順序"
    requirement: MAP-11
    verification:
      - kind: e2e
        ref: "tests/line-analysis-ui.spec.mjs#預覽：和真的歌詞畫出來一模一樣 / 預覽：每個開關都看得到 / 預覽：高的螢幕上固定在上面"
        status: pass
---

# Phase 11 Plan 04: 韻族顏色、對比提醒與即時預覽 Summary

**偏好設定新增「韻族顏色」（16 個原生色票，拖曳即時、放開才存、日夜共用、備份與分頁同步、兩下確認的恢復預設、看不清楚時的提醒），並在最上面放一塊用和歌詞同一個渲染器畫的即時預覽。**

## Performance

- **Duration:** 約 35 分鐘
- **Completed:** 2026-10-28
- **Tasks:** 3（1 tracer、1 TDD、1 auto）
- **Files modified:** 5（無新增）

## Accomplishments

- `lhMapApplyPalette` 改用 `_lhMapEffColor(n)`：自訂色（lh:map.colors，已整理成小寫 #rrggbb）優先，沒有就用目前主題的預設色；主題 MutationObserver 現在除了換色票也呼叫 `lhMapMenuSync`，所以深色主題下沒改的色票顯示深色預設色、改過的一直顯示自訂色。
- 「韻族顏色」區塊：helper 說明、`div.rm-colors` 格線（16 個 `input[type=color].section-color-input[data-n]` ＋ 空韻格 `span.rm-sw[data-f=16]`）、提醒 `span.rm-color-advice`、恢復預設按鈕 `button.backup-restore-btn.rm-color-reset`、隱形探針 `span.rm-probe`。事件掛在格線上：`input` 驗過 `LH_MAP_COLOR_KEYS` 與 `LH_MAP_COLOR_RE` 才 `setProperty('--rm-c' + n)`；`change` 走 `lhMapSetColor`（驗證、複製 colors、整理、存、套用、同步、念 #lhLive）。拖曳中不存、不重畫（測試確認 lh:map 不變、鏡像層與色塊節點仍連著）。
- 恢復預設：兩下確認，4 秒或 blur 解除（沿用自動備份還原的 `data-armed`），沒有自訂色時 `aria-disabled="true"` 且按了沒反應，清空時（含別的分頁清掉）自動解除武裝。「重設顏色!」不碰韻族顏色。
- 對比提醒：`_lhMapColorAdvice()` 讀探針算出的 `color`／`background-color` rgb，對 0–15 每個有效色用 `lhRhymeMixRgb(色, 卡片, LH_MAP_DEPTH[depth][0])` 混出底色，`lhRhymeContrast` 低於 4.5 的列名字。
- `lhRhymeMixRgb`／`lhRhymeContrast`（rhyme-core.js）：先寫測試看到 `lhRhymeMixRgb is not defined` 紅燈，再補實作轉綠；與測試用的 `mixHex`／`contrastOf` 逐值相同，純函式、不改傳入陣列。
- 預覽：`LH_MAP_PREVIEW_TEXT`（月光 灑在 窗前／夢裡想起你的臉／我想把時間留在這一天）＋ `_lhMapPreviewPaint()`，掛在 `lhMapMenuSync` 尾端。CSS `.rhyme-mirror.lm-preview` 覆寫鏡像層基底（relative、block、主題文字色、框線、圓角），靠右欄時右內距用同一條 calc，`@media (min-height: 37.5rem)` 才 sticky。

## Task Commits

1. **Task 1（tracer）：韻族顏色格、有效色票、lhMapSetColor** - `4c5175e` (feat)
2. **Task 2：恢復預設、對比提醒、純函式、分頁／壞色碼／手機測試** - `e856458` (feat)
3. **Task 3：即時預覽、sticky、平價測試** - `b775bcf` (feat)

## 規劃要求記錄的項目

### 主題色的探針技術

不解析 `color-mix` 的計算值（RESEARCH Pitfall 11）。`.rm-probe` 是 `display: none` 的 span，CSS 只寫 `color: var(--text-primary); background-color: var(--card-bg)`；JS 用 `getComputedStyle(probe)` 讀 `color`／`backgroundColor`，取前三個整數當 rgb。文字色因此包含使用者自訂的主題文字色與深色主題的反轉文字色（深色預設是 `#d2c8b7`，由 `loadColors()` 寫在行內）。

### 提醒結果（預設色、深色主題、「濃」＝混 40%）

低於 4.5:1 的 5 個韻族：ㄨ 4.14、ㄩ 4.27、ㄚ 4.15、ㄛ 4.36、ㄝ 4.46；caption 寫「ㄨ、ㄩ、ㄚ等 5 個顏色在目前主題下讓字不太好讀（對比低於 4.5:1），可以選淡一點的顏色，或調低「句尾上色濃淡」」。與 11-03 記錄的「深色濃最差 4.14、5 色低於 4.5」一致。標準與淡在預設色下沒有提醒；深色主題下把一個韻族設成純白（標準）會點名該韻族，換回淺色主題就消失（淺色卡片上純白底更淡、文字是深色）。

### sticky 實測

1280×900：`.lm-preview-block` 的 computed position 是 `sticky`，把設定視窗捲到底後，預覽上緣與設定視窗上緣差 < 2px（預覽貼齊視窗最上面）。第一版 `top: 0` 停在 1.5rem 內距之下（差 24px，捲動內容會從上方那條縫露出來），所以改成 `top: -1.5rem`。844×390（矮）：`static`。連按 70 次 Tab，焦點從不進預覽；預覽 tabIndex −1、aria-hidden、沒有可聚焦子孫。

### 296px 寬的格線欄數（供 UAT）

設定視窗內容寬 296px（22rem − 2×1.75rem）時，`.rm-colors` 實際 **6 欄**（clientWidth 294px，每欄 ≥ 44px），共 3 列：5 個 16 格 + 空韻在第三列。淺色、深色相同。

### 兩個記錄過的覆寫（供 UAT）

- CONTEXT D3 覆寫：色票對照的格子本身沒有變成原生色票，原生色票在偏好設定的獨立「韻族顏色」格線（UI-SPEC D-15）；「韻腳 ▾」選單的色票對照仍是純色塊顯示有效色（讀 `--rm-cN`，自然跟著自訂色）。
- 預覽是從 `lhMapMenuSync` 重畫（計畫選擇），所以任何設定變動、別的分頁、詞庫載好都會刷新，不會和別的介面脫節。

## Files Created/Modified

- `js/rhyme-core.js` - `lhRhymeMixRgb`、`lhRhymeContrast`
- `js/rhyme-map.js` - `_lhMapEffColor`、有效色票、韻族顏色格與事件、`lhMapSetColor`、`lhMapResetColors`、兩下確認、`_lhMapColorAdvice`、`LH_MAP_PREVIEW_TEXT`、`_lhMapPreviewPaint`、`lhMapMenuSync` 同步色票／按鈕／提醒／預覽
- `css/panels.css` - `.rm-colors`、`.rm-color-cell`、`.rm-color-reset`、`.rm-probe`、`.rhyme-mirror.lm-preview`、靠右欄內距、sticky（無色碼、無 transition）
- `tests/rhyme-core.spec.mjs` - 對比：提醒用的混色與對比
- `tests/line-analysis-ui.spec.mjs` - 韻族顏色 ×6、預覽 ×3

## Decisions Made

見 frontmatter `key-decisions`。

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 主題切換後偏好設定的色票沒跟著顯示新主題的預設色**
- **Found during:** Task 1（深色主題斷言失敗：ㄨㄥ 的輸入框還是淺色預設）
- **Issue:** 主題 MutationObserver 只呼叫 `lhMapApplyPalette`，沒有更新輸入框的值
- **Fix:** observer 改成同時呼叫 `lhMapMenuSync`（同一個出口也順便更新提醒與預覽）
- **Files modified:** js/rhyme-map.js
- **Commit:** 4c5175e

**2. [Rule 1 - 測試設計] 深色主題測試改按真正的主題按鈕**
- **Issue:** 直接呼叫 `applyTheme(true)` 不會跑 `loadColors()`，行內的 `--text-primary` 還是淺色主題的深色字，提醒算成 16 個全部不好讀
- **Fix:** 測試用 `#themeToggle` 的點擊（和使用者一樣會連 `loadColors` 一起跑）；產品程式碼沒有問題（觀察者在整個點擊處理完才跑）
- **Commit:** e856458

**3. [Rule 3 - 阻礙] 預覽進了 DOM 之後，既有測試的全域 `.rhyme-mirror`／`.lm-mk`／`.rm-hl` 選擇器會抓到預覽**
- **Found during:** Task 3（打開偏好設定後數 `.lm-mk` 得到 4 而不是 1 等 4 個測試紅燈）
- **Fix:** 只改測試選擇器，限定在 `#lyricsSections`（含 11-03 的 `bandBg`、`lookGeo`）；產品程式碼沒有任何全域 `.rhyme-mirror` 查詢（已 grep 確認）。「偏好設定：內容與順序」的區塊標題清單改成 預覽、韻腳地圖、句構分析、顯示方式、韻族顏色
- **Commit:** b775bcf

**4. [微調] sticky 的 top 取 −1.5rem**（見上，視覺縫隙）

**Total deviations:** 4（皆無範圍擴張）。

## Issues Encountered

無。

## Known Stubs

無。

## Threat Flags

無新增攻擊面。T-11-11：兩條寫入 style.setProperty 的路徑（拖曳 input 與 `lhMapApplyPalette`）都先過小寫 #rrggbb 正規式，屬性名稱只由固定家族編號 0–16 串成；T-11-12：`lhMapSetColor` 只收 `LH_MAP_COLOR_KEYS` 與合格色碼，壞色碼測試涵蓋大寫、三位、顏色名稱、非法字元、`url(x)`、鍵 16、`__proto__`、`constructor`；T-11-13：整理仍是 O(16)；T-11-SC：未安裝套件，`package.json`、`package-lock.json` 無變動。

## Verification

- `npm test`：**1007 passed / 29 skipped / 0 failed**（基準 997 / 29 / 0；新增 10 個：對比 1、韻族顏色 6、預覽 3）
- `npx playwright test tests/line-analysis-ui.spec.mjs tests/rhyme-core.spec.mjs tests/rhyme-map-ui.spec.mjs tests/style.spec.mjs tests/layout.spec.mjs`：228 passed
- 視覺基準無變動；沒有 `git push`；CSS 沒有色碼、transition、keyframes（style.spec 通過）

## Human check（列入 11-07 UAT）

- 真的 iOS Safari／Android Chrome 的原生色票面板：拖曳時色塊、色票、預覽是否順（Chromium 只能驗證 input／change 事件順序）
- 深色主題下用「濃」＋預設色看到的提醒文字（ㄨ、ㄩ、ㄚ等 5 個）是否清楚
- sticky 預覽在 iPad／手機直放（≥ 600px 高）時視窗上緣的觀感；以及 6 欄色票格在 296px 下的點擊手感
- 空韻格（16px 色塊）與旁邊 32px 色票在直向上的視覺對齊

## Next Phase Readiness

11-05 之後若要新增設定項，只要放在 `lhMapPrefsBuild()` 的區塊裡並讓 `lhMapMenuSync` 同步，預覽會自動跟著；預覽的查詢要用 `#mapSettingsSection .lm-preview` 限定，測試中查歌詞的鏡像層要用 `#lyricsSections` 限定。

## Self-Check: PASSED

- FOUND: js/rhyme-core.js（`function lhRhymeContrast`、`function lhRhymeMixRgb`）、js/rhyme-map.js（`function lhMapSetColor`、`再按一次確定恢復`、`rm-color-advice`、`_lhMapBuildFrag(LH_MAP_PREVIEW_TEXT`）、css/panels.css（`.rm-colors`、`.lm-preview`）、tests（韻族顏色：×6、預覽：×3）
- FOUND commits: 4c5175e、e856458、b775bcf
