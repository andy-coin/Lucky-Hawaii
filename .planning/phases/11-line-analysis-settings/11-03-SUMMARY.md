---
phase: 11-line-analysis-settings
plan: 03
subsystem: ui
tags: [vanilla-js, settings, lh:map, line-analysis, wrap-identity, playwright, contrast]

requires:
  - phase: 11-line-analysis-settings
    provides: 11-01 的逐行標記與 data-lm／LH_MAP_LOOK_KEYS；11-02 的偏好設定段落、lhMapMenuSync 兩處同步、_lhMapRadioKeys
provides:
  - 偏好設定「顯示方式」：標記位置（靠右欄／句尾後）、標記文字大小（小／中／大）、句尾上色濃淡（淡／標準／濃），皆只改 html 屬性與 CSS 變數，不重畫
  - LH_MAP_DEPTH 常數表與 --rm-end／--rm-orph（色塊與色票對照讀變數）
  - 句尾後的版面規則（0.5em、「· 」分隔、對照差異接在字數後面、空欄位隱藏）與 lm-typing（只藏標記）
  - 「標記不改變任何一個字的位置」的保證測試（3 縮放 × 2 位置 × 有無捲軸 × 13 個寬度）
affects: [11-04, 11-05, 11-06, 11-07, 11-08]

actuals:
  tokens: 36000
  tasks: 3
  commits: 3

plan_head_before: 4cc578b3645811f5df25593519b41f7e6e1ffe00
plan_head_after: 1a7004d72d70c8885ca84eb9df7a10e316ea12bd
commits: 3
status: complete

tech-stack:
  added: []
  patterns:
    - "顯示方式的單選組 _lhMapLookRadios：.type-row[data-k][data-v]，點擊走 lhMapSetSetting（整理後必須原值，壞值進不來）"
    - "只改 CSS 的鍵（pos／size／depth）：lhMapApplyLook 設 html data-lm 與 --lm-fs／--lm-cols／--rm-end／--rm-orph，值全來自常數表"
    - "換行不變測試：用 display:none 暫時把標記從版面拿掉，前後比每個字的位置（不改 DOM、不用重畫）"

key-files:
  created: []
  modified:
    - js/rhyme-core.js
    - js/rhyme-map.js
    - css/panels.css
    - tests/rhyme-core.spec.mjs
    - tests/line-analysis-ui.spec.mjs

key-decisions:
  - "句尾後的間距：標記離最後一個字 0.5em；欄位之間靠 margin 0.5em＋「· 」，對照差異直接接在字數後（content: none），不用單一空白——標記是 white-space: nowrap，開頭的空白會被吃掉，margin 才可靠"
  - "lm-typing 的 CSS 加 html[data-lm=\"tail\"] 前綴：從句尾後切到靠右欄時殘留的 lm-typing 不會把靠右欄的標記藏起來"
  - "輸入框與鏡像層逐字比對時只比左緣（1px）與視覺列序號，不比上下絕對座標（見 Deviations 1）"

requirements-completed: [MAP-09, MAP-11]

coverage:
  - id: D1
    description: "標記位置：靠右欄／句尾後單選，切換時輸入框節點、選取、捲動、標記節點都不動；句尾後標記緊貼最後一個字（同一個視覺列）"
    requirement: MAP-11
    verification:
      - kind: e2e
        ref: "tests/line-analysis-ui.spec.mjs#顯示方式：切到句尾後，標記貼在最後一個字後面，游標選取捲動都不動"
        status: pass
  - id: D2
    description: "標記文字大小 0.75／0.875／1rem、句尾上色濃淡 26／34／40，馬上生效不重畫；壞值（pos left、size xl、depth 帶 CSS 語法）退回預設且不影響頁面"
    requirement: MAP-11
    verification:
      - kind: e2e
        ref: "tests/line-analysis-ui.spec.mjs#顯示方式：字級與濃淡馬上生效、不重畫"
        status: pass
  - id: D3
    description: "淡、標準兩段文字對比 ≥ 4.5:1（含 Phase 10 極端色）；濃淺色最差 6.32、深色最差 4.14 且 5 色低於 4.5"
    requirement: MAP-11
    verification:
      - kind: unit
        ref: "tests/rhyme-core.spec.mjs#對比：濃淡三段"
        status: pass
  - id: D4
    description: "標記絕不改變換行：3 縮放 × 2 位置 × 有無 15px 捲軸 × 13 個寬度（含換行邊界前後 1px），有／無標記時鏡像層每個字位置相同、與輸入框同列；行尾半形／全形空白與 tab 不多折一列；句尾後輸入框在標記開關前後位置相同；沒有 ResizeObserver 錯誤"
    requirement: MAP-09
    verification:
      - kind: e2e
        ref: "tests/line-analysis-ui.spec.mjs#換行不變：標記開關前後每個字的位置都一樣"
        status: pass
  - id: D5
    description: "最後視覺列：200 字元行與兩列行在換行邊界 ±1px 掃描下，兩種位置標記都在最後一個視覺列；靠右欄右緣離捲軸 0.75rem；手機 150% 欄位 ≤ 36%，結構太長被裁切且字不伸進欄位"
    requirement: MAP-09
    verification:
      - kind: e2e
        ref: "tests/line-analysis-ui.spec.mjs#最後視覺列：換行的行標記在最後一個視覺列 / 最後視覺列：手機放大 150% 欄位不超過 36%，結構太長時裁切"
        status: pass
  - id: D6
    description: "組字：標記開著時組字中鏡像零節點變動、零分析、零重畫，確認後恰好重畫一次；句尾後行尾打字只藏標記，Enter 或句中修改整層藏，重畫後全部恢復；靠右欄行尾打字不藏標記"
    requirement: MAP-09
    verification:
      - kind: e2e
        ref: "tests/line-analysis-ui.spec.mjs#組字：標記開著時組字中鏡像零變動 / 組字：句尾打字標記先藏、換行或句中修改整層藏，重畫後恢復"
        status: pass
---

# Phase 11 Plan 03: 顯示方式（位置、大小、濃淡）與換行不變 Summary

**偏好設定新增「顯示方式」：標記可放靠右欄或貼在句尾後、字級小／中／大、句尾上色淡／標準／濃，切換只改 html 屬性與 CSS 變數（輸入框、游標、選取、捲動、標記節點都不動），並用 156 組寬度／縮放／捲軸組合證明標記不會讓任何一個字換位置。**

## Performance

- **Duration:** 約 35 分鐘
- **Completed:** 2026-10-28
- **Tasks:** 3（1 tracer、1 TDD、1 auto）
- **Files modified:** 5（無新增）

## Accomplishments

- `lhMapPrefsBuild()` 末尾加「顯示方式」區塊，三個 radiogroup 由 `_lhMapLookRadios(label, key, items, cols3)` 建；點擊走既有的 `lhMapSetSetting`（pos／size／depth 在 `LH_MAP_LOOK_KEYS`，只跑 `lhMapApplyLook`）；`lhMapMenuSync` 對 `.type-row[data-k]` 設 aria-checked 與 roving tabindex，並更新位置說明與「濃」的說明（只有選濃才顯示）。原本選寬韻／嚴格的選擇器改成 `.type-row[data-m]`，避免新單選被誤清。
- `LH_MAP_DEPTH`（凍結，淡 26/14、標準 34/17、濃 40/20）放在 `LH_RHYME_MIX` 旁；`lhMapApplyLook` 把 `--rm-end`／`--rm-orph` 設成 `%` 字串（只從表取）。`.rm-hl`、`.rm-hl.rm-solo`、`.rm-sw` 改讀 `var(--rm-end, 34%)`／`var(--rm-orph, 17%)`，@supports 備案不動。新增 `.type-grid-3`。
- 句尾後 CSS：`.lm-mk` 離字 0.5em、空欄位 `display: none`、前面有內容的欄位才有 margin 與「· 」、對照差異直接接在字數後面；固定欄寬、省略號、欄距只在 `html[data-lm="right"]` 下。沒有任何內距規則。
- 輸入監聽：不是動到換行／句中修改時，若 `pos === 'tail'` 且鏡像層有 `.lm-mk` 就加 `lm-typing`（只切 class，組字中合法）；`lhMapPaint` 的兩條路徑都改成 `remove('rm-stale', 'lm-typing')`。

## Task Commits

1. **Task 1（tracer）：標記位置單選與句尾後版面** - `fefbd13` (feat)
2. **Task 2：字級與濃淡三段、對比測試** - `1dd91c9` (feat；RED 先確認 `LH_MAP_DEPTH is not defined`，再補實作轉綠)
3. **Task 3：lm-typing、換行不變／最後視覺列／組字測試** - `1a7004d` (feat)

## 規劃要求記錄的項目

### 換行不變測試的矩陣與耗時

- 3 縮放（50／100／150）× 2 位置 × 有／無 15px 捲軸 × 13 個寬度（11 個固定寬度 330、360、390、430、520、640、760、900、1000、1200、1500，加上二分搜尋找到的換行邊界 w-1 與 w）= **156 組**，測試跑約 **52 秒**（單一測試）。每組都比：有／無標記時鏡像層每個字的位置（以 `.lm-mk { display: none }` 暫時拿掉）、行尾空白行的視覺列數、鏡像層文字＝輸入框文字＋零寬字元、鏡像與輸入框每個字的左緣（≤ 1px）與視覺列序號。句尾後另外在邊界兩個寬度與 330、1500 比輸入框每個字的位置在標記開關前後是否相同。
- 資料 45 行：41 行「N 字＋行尾空白」（N=5…45，空白輪流半形、全形、tab）、純標點、英文長串、中英混排、200 字元。邊界用二分搜尋找「第一個在 330–900 範圍內會從兩列變一列」的行，確保每個組合都真的量到換行邊界（每個組合都找得到）。
- 負向對照：暫時把句尾後的 `.lm-mk` 改成 `position: static`，換行不變與最後視覺列兩個測試都立刻紅燈（50% 句尾後 330px），還原後綠燈。

### 有沒有哪個寬度標記沒對上列

沒有。156 組都在同一個視覺列（標記上緣與最後一個字所在視覺列上緣差 ≤ 1px）。沒有任何頁面錯誤（含 ResizeObserver）。

### 靠右欄右緣的實測誤差

欄位右緣與「輸入框右緣 − 捲軸寬 − 0.75rem」的差：24 組（3 縮放 × 有無捲軸 × 4 個換行邊界附近寬度）**最大 0.000px**。

### 句尾後分隔規則（照實作）

```css
html[data-lm="tail"] .lm-mk { margin-inline-start: 0.5em; }
html[data-lm="tail"] .lm-t:empty { display: none; }
html[data-lm="tail"] .lm-t + .lm-t { margin-inline-start: 0; }
html[data-lm="tail"] .lm-t:not(:empty) ~ .lm-t:not(:empty) { margin-inline-start: 0.5em; }
html[data-lm="tail"] .lm-t:not(:empty) ~ .lm-t:not(:empty)::before { content: '· '; }
html[data-lm="tail"] .lm-t-c:not(:empty) + .lm-t-d:not(:empty)::before { content: none; }
```

結果：`A · 7 ≠6 · 2+2+3`（字母、字數、對照差異、斷句）。UAT（11-07）要看：字數與 ≠ 之間只有 0.5em 空隙，沒有「·」。

## Files Created/Modified

- `js/rhyme-core.js` - `LH_MAP_DEPTH`
- `js/rhyme-map.js` - `_lhMapLookRadios`、顯示方式區塊、`lhMapMenuSync` 的 data-k 單選與說明、`--rm-end`／`--rm-orph`、`lm-typing`
- `css/panels.css` - 句尾後規則、`.type-grid-3`、色塊與色票讀變數、`lm-typing`
- `tests/rhyme-core.spec.mjs` - 對比：濃淡三段
- `tests/line-analysis-ui.spec.mjs` - 顯示方式 ×2、換行不變、最後視覺列 ×2、組字 ×2（並把「偏好設定：內容與順序」的區塊標題清單加上「顯示方式」）

## Decisions Made

見 frontmatter `key-decisions`。

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 測試量測誤差] 輸入框與鏡像層逐字比對不比上下絕對座標**
- **Found during:** Task 3（第一次跑換行不變就在 50% 縮放紅燈）
- **Issue:** 用 `lhMirror` 建的隱形 div 把行高複製成 px，長文字每一列差約 1/64px，一百多列累積到約 2px，超過既有的 dy ≤ 2 容許值。不是標記造成的：同一頁面「鏡像對齊：與文字框逐像素相同」（真鏡像層對真輸入框）逐像素通過
- **Fix:** 鏡像與輸入框比左緣（≤ 1px）與每個字的視覺列序號；有／無標記比位置用 0.05px 浮點容許（插入 style 重算版面會讓 278.875 在 .87／.88 之間跳）
- **Files modified:** tests/line-analysis-ui.spec.mjs
- **Commit:** 1a7004d

**2. [Rule 1 - 測試設計] 計畫寫「標記上緣與最後一個字的 client rect 上緣差 1px」，實際改成與「該字所在視覺列上緣」比**
- **Issue:** 絕對定位標記的上緣是行盒上緣，字的 client rect 上緣是字框上緣，兩者差半個行距（約 3px）
- **Fix:** 視覺列上緣 = 字 rect 上緣 − (行高 − 字框高) / 2，仍用 ≤ 1px
- **Files modified:** tests/line-analysis-ui.spec.mjs
- **Commit:** fefbd13

**3. [微調] 對照差異與字數之間不是 content 為單一空白，而是 `content: none`＋margin 0.5em**
- **Issue:** 標記是 `white-space: nowrap`，區塊開頭的空白字元會被吃掉；margin 才穩定
- **Commit:** fefbd13

**4. [微調] 「重畫排程一次一段」之外沒有動 Phase 10／11-02 的任何測試；唯一改既有斷言：** 「偏好設定：內容與順序」的區塊標題清單加上「顯示方式」。

**Total deviations:** 4（皆無範圍擴張）。

## Issues Encountered

無。

## Known Stubs

無。

## Threat Flags

無新增攻擊面。T-11-09：`data-lm` 只由整理過的列舉值設定，`--lm-fs`、`--lm-cols`、`--rm-end`、`--rm-orph` 只從常數表取（壞值測試：`pos: 'left'`、`size: 'xl'`、`depth: 'x;}body{display:none'` 都退回預設，頁面不受影響）。T-11-10：內距純 CSS，沒有 ResizeObserver 錯誤。T-11-SC：未安裝套件，`package.json`、`package-lock.json` 無變動。

## Verification

- `npm test`：**997 passed / 29 skipped / 0 failed**（基準 989 / 29 / 0；新增 8 個測試：對比 1、顯示方式 2、換行不變 1、最後視覺列 2、組字 2）
- 視覺基準無變動；沒有 `git push`；沒有顏色碼、transition、keyframes 進 CSS（style.spec 通過）

## Human check（列入 11-07 UAT）

- 句尾後在 iPad／iPhone Safari 的標記垂直位置與換行（RESEARCH A1，Chromium 以外的引擎沒有可測瀏覽器）
- 「濃」在深色主題下 5 個顏色字會比較不好讀，說明文字是否夠清楚
- 句尾後行太滿時標記被輸入框邊緣切掉的樣子是否可接受

## Next Phase Readiness

11-04 之後可在 `lhMapPrefsBuild()` 的「顯示方式」區塊後面繼續加區塊；`_lhMapLookRadios` 可重用（列舉值單選），`LH_MAP_DEPTH` 的變數已讓色票預覽可以直接讀 `--rm-end`。

## Self-Check: PASSED

- FOUND: js/rhyme-core.js（`LH_MAP_DEPTH`）、js/rhyme-map.js（`_lhMapLookRadios`、`lm-typing`）、css/panels.css（`var(--rm-end`、`lm-typing`）、tests/line-analysis-ui.spec.mjs、tests/rhyme-core.spec.mjs（`對比：濃淡三段`）
- FOUND commits: fefbd13、1dd91c9、1a7004d
