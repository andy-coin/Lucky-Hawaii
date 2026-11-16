---
phase: 11-line-analysis-settings
plan: 08
subsystem: testing
tags: [line-analysis, export-audit, xss-scan, static-scan, old-data, non-color-cues, acceptance-checklist, playwright]
status: complete

requires:
  - phase: 11-line-analysis-settings
    provides: "11-01..11-07：逐行標記、對照差異、偏好設定、顯示方式、韻族顏色、預覽、分析面板、反白停留、整合與跨裝置檢查"
provides:
  - "tests/line-audit.spec.mjs 後半：6 支內容檢查（列印與匯出、惡意文字、不拼 HTML、setProperty 位置與無動畫、舊資料、顏色以外的線索）"
  - ".planning/TEST-CHECKLIST.md Phase 11 一節；.planning/驗收清單-精簡版.md 第 11 階段（2-41～2-44、4-30～4-35、5-131～5-154）；handoff.md Phase 11 完成狀態"
affects: [/gsd-code-review 11, /gsd-verify-work 11]

actuals:
  tokens: 30000
  tasks: 3
  commits: 3

plan_head_before: 476497aef82432f1d10f0dd9cfd04a81c8ac1976
plan_head_after: 2cc4b8ba1f2ba36bca2d4ca170f0b36bd4102d68
commits: 3

tech-stack:
  added: []
  patterns:
    - "靜態掃描：acorn 語法樹找 HTML sink（照 Phase 10 的 htmlSinks，含自檢）；setProperty 掃描記下最近的外層具名函式，名單必須與允許名單完全相等（少一個也算失敗）"
    - "CSS 掃描：去掉註解後逐條規則比對選擇器，第 11 階段的規則不得含 transition／animation，且 panels.css／responsive.css 沒有 @keyframes"

key-files:
  created: []
  modified:
    - tests/line-audit.spec.mjs
    - js/rhyme-map.js
    - handoff.md
    - .planning/TEST-CHECKLIST.md
    - ".planning/驗收清單-精簡版.md"

key-decisions:
  - "色票拖曳的 input 監聽原本是匿名函式，改成具名 _lhMapColorInput（行為不變），讓 setProperty 掃描的允許名單能精準寫成 lhMapApplyPalette／lhMapApplyLook／_lhMapSync／_lhMapColorInput 四個"
  - "備份檢查的 lh:map 種子用「已整理」的序列化形式：備份原樣帶出 localStorage 裡的字串（和 Phase 10 一致），所以測試用 lhRhymeSerialize 的正規形式當種子，同時斷言備份等於 lhRhymeSerialize 輸出與種子"

requirements-completed: [MAP-09, MAP-10, MAP-11]

coverage:
  - id: D1
    description: "標記全開、自訂顏色、分析面板開著：TXT／Markdown／PDF 列印頁／備份都沒有 lm-、rm-、rhyme-mirror、零寬字元、≈、≠、✓；列印時 .lm-mk、.lm-preview、#rhymeAnalysis、.rhyme-mirror 都看不見；備份的 lh:map 與 lhRhymeSerialize 輸出一字不差"
    requirement: MAP-09
    verification:
      - kind: e2e
        ref: "tests/line-audit.spec.mjs#檢查：列印與匯出沒有句構標記"
        status: pass
    human_judgment: false
  - id: D2
    description: "歌詞行 <img src=x onerror=alert(1)>你 與自訂段落名 <b>x</b>：標記、分析面板標題與對照說明、偏好設定、整頁都沒有 img／b 元素，沒有 dialog，標記字數等於頁面自己的 lhCountWords；js/line-core.js 與 js/rhyme-map.js 沒有 HTML sink（掃描器自檢通過）"
    requirement: MAP-10
    verification:
      - kind: e2e
        ref: "tests/line-audit.spec.mjs#檢查：惡意文字只當文字（句構分析）"
        status: pass
      - kind: unit
        ref: "tests/line-audit.spec.mjs#檢查：句構分析新程式沒有拼 HTML"
        status: pass
    human_judgment: false
  - id: D3
    description: "style.setProperty 只出現在 lhMapApplyPalette、lhMapApplyLook、_lhMapSync、_lhMapColorInput 四處（名單相等）；panels.css／responsive.css 中第 11 階段的規則（47 條）沒有 transition／animation，兩檔都沒有 @keyframes"
    requirement: MAP-11
    verification:
      - kind: unit
        ref: "tests/line-audit.spec.mjs#檢查：setProperty 只在固定的地方、新樣式沒有動畫"
        status: pass
    human_judgment: false
  - id: D4
    description: "第 10 階段的使用者（五鍵 lh:map、讀音）開機、開關韻腳選單、打開偏好設定、重新整理後 lh:map 與 lh:songs 一字不動、沒有標記沒有 data-lm；第 9 階段的使用者不會被寫入 lh:map；第 10 階段備份經 lhParseBackup 後 lh:map 與讀音不變"
    requirement: MAP-11
    verification:
      - kind: e2e
        ref: "tests/line-audit.spec.mjs#檢查：舊歌與舊資料（句構分析）"
        status: pass
    human_judgment: false
  - id: D5
    description: "不靠顏色：猜的那一段 ≈ 開頭且斜體、同一行自己標的「2+2+2+」維持正體；≠ 加粗 700；面板 ✓／≠ 帶 aria-label 字數相同／字數不同；開關文字結尾 開／關且與 aria-checked 一致；濃淡是名為 淡／標準／濃 的 radio；鏡像層與預覽 aria-hidden；面板 role=dialog、th scope=col"
    requirement: MAP-10
    verification:
      - kind: e2e
        ref: "tests/line-audit.spec.mjs#檢查：顏色以外的線索（句構分析）"
        status: pass
    human_judgment: false
  - id: D6
    description: "真手機／真眼睛／Andy 的口味才能判斷的項目（≈ 語感、靠右欄寬度、字級與淡色、濃淡、浮動列與系統選單、停留手感、原生色票、偏好設定長度、Safari／Firefox 對齊、iPad 觸控板誤觸）已列入精簡版 2-41～2-44、4-30～4-35；自主決定與覆寫列入 5-131～5-154"
    requirement: MAP-09
    verification:
      - kind: manual
        ref: ".planning/驗收清單-精簡版.md 2-41～2-44、4-30～4-35、5-131～5-154"
        status: pending
    human_judgment: true
---

# Phase 11 Plan 08: 內容檢查與 Andy 驗收清單 Summary

**列印、匯出與備份在所有標記全開時仍然乾淨；惡意文字只當文字、新程式沒有 HTML sink、setProperty 只在四個固定位置、第 11 階段的 CSS 沒有動畫、舊資料不被改寫、不靠顏色也看得出差別，6 項檢查全部通過；全套 1037 過，Andy 拿到一份完整、誠實的驗收清單。**

## Performance

- **Tasks:** 3（Task 1 tracer、Task 2、Task 3）
- **Commits:** 3（`bbce0f7`、`dcbc09c`、`2cc4b8b`）
- **全套測試：** `npm test` **1037 passed / 29 skipped / 0 failed**（11-07 基準 1031 / 29 / 0，這個計畫新增 6 支檢查）
- **效能：** `LH_PERF=1 npx playwright test tests/rhyme-map-perf.spec.mjs --workers=1` 3 passed——150 行連打最長任務 0ms（0 個長任務）、150 行全部標記＋對照連打 0ms（0 個）、`lhRhymeAnalyze` 200 行中位數 0.40ms（門檻 20ms）
- **截圖：** `npx playwright test tests/visual.spec.mjs` 19 passed；沒有刷新任何基準（-darwin、-linux 都沒動），預設設定沒有新增任何可見元素
- **package.json／package-lock.json：** 無變動（T-11-SC）

## Accomplishments

- **Task 1（tracer）**：標記全開（字數＋斷句＋行尾字母＋對照差異＋句尾＋字母條＋句中底線）、自訂顏色、分析面板開著、偏好設定的預覽建好；TXT、Markdown、PDF 列印頁（`#printSheet` 內零個 lm-／rm- 元素、HTML 與文字都沒有 ≈／≠／✓／零寬字元）、備份全部都乾淨；列印時 `.lm-mk`、`.lm-preview`、`#rhymeAnalysis`、`.rhyme-mirror` 全都看不見（前置先證明它們存在，避免空轉）。
- **Task 2**：惡意文字、HTML sink 掃描（含自檢）、setProperty 位置與 CSS 動畫掃描、舊資料（Phase 10 / Phase 9 / Phase 10 備份）、顏色以外的線索——5 支檢查（惡意文字、不拼 HTML、setProperty＋CSS 動畫、舊資料、顏色以外的線索）全數一次通過，沒有需要放寬的斷言。
- **Task 3**：三份文件（見下）。

## 驗收清單編號

- `.planning/驗收清單-精簡版.md`：新增 **2-41～2-44**（長按整段浮動列＋面板、原生色票、Safari／Firefox 不改換行、iPad 觸控板誤觸）、**4-30～4-35**（≈ 語感、靠右欄寫字寬度、字級與淡色、濃淡與孤句、停留手感、偏好設定長度）、**5-131～5-154**（24 條自主決定與覆寫）；表頭題數 222 → 256；第 11 階段摘要段落在第 10 階段段落之後。
- `.planning/TEST-CHECKLIST.md`：Phase 11 一節（自動測試對照 ROADMAP 成功條件、11-01-1～11-04-2 實機檢查、11-CTX-1～24）。
- `handoff.md`：頂部換成 Phase 11 完成狀態（保留 Phase 9／10 與更早的段落）。
- 兩份被 git 追蹤的 .planning 清單用 `git add -f` 提交（`.planning/` 在 .gitignore，但這兩個檔案本來就被追蹤）。
- 沒有任何 Human check 被標成自動化已驗證；Andy 的取捨項目 D6 狀態為 pending。

## Task Commits

1. **Task 1 (tracer):** `bbce0f7` — test(11-08): 列印與匯出沒有句構標記（TXT／Markdown／PDF／備份，標記全開）
2. **Task 2:** `dcbc09c` — test(11-08): 惡意文字、不拼 HTML、setProperty 位置與無動畫、舊資料、顏色以外的線索（句構分析）
3. **Task 3:** `2cc4b8b` — docs(11-08): 第 11 階段驗收清單與 handoff

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - 擋住測試] 色票拖曳的監聽是匿名函式，setProperty 掃描無法給它一個名字**
- **Found during:** Task 2（寫掃描前讀 `js/rhyme-map.js` 的 setProperty 位置）
- **Issue:** 計畫要求允許名單包含「色票輸入處理函式」並說明若為匿名就要幫它取名
- **Fix:** `grid.addEventListener('input', e => …)` 改為具名 `function _lhMapColorInput(e)` 後再註冊；內容與行為完全不變
- **Files modified:** js/rhyme-map.js
- **Commit:** dcbc09c

### 計畫文字與實際做法的差異（沒有程式改動）

**2. 備份檢查的 lh:map 種子改用已整理的形式**
- 第一次跑 Task 1 時，備份裡的 lh:map 是 localStorage 的原始字串（和 Phase 10 一致，備份不重寫設定），與 `lhRhymeSerialize` 輸出的欄位順序不同而失敗。產品行為正確（備份帶資料、不帶標記），所以改種子（字數與斷句預設即開，序列化後不寫），讓備份字串同時等於 `lhRhymeSerialize(_lhMapSet)` 與種子，沒有放寬斷言。

**3. 「@keyframes 數量」改為 0 的硬編碼**
- 計畫允許比對 Phase 10 tag 或寫死目前數量；專案沒有 Phase 10 tag。`grep -c "@keyframes" css/panels.css` 得 1，但那一個是註解裡的字；去掉註解後兩個檔案都是 0，所以寫死 0 並以註解說明（動畫放在 css/base.css，是第 10 階段之前就有的）。

**4. 計畫三個 Task 2 以外的檢查沒有出現需要修的接縫**
- 除第 1 點的具名化外，6 項檢查對 11-01～11-07 的程式原樣通過；沒有 Rule 1／2 的程式修正。

**Total deviations:** 4（皆無範圍擴張）。

## Known Stubs

None.

## Threat Flags

None（沒有新增網路端點、儲存或信任邊界）。T-11-18：惡意文字檢查與語法樹掃描皆通過；T-11-19：匯出與備份檢查通過；T-11-SC：套件檔案無變動。

## Self-Check: PASSED

- tests/line-audit.spec.mjs 存在，`grep -c "檢查：列印與匯出沒有句構標記"` 為 1；`grep -c "檢查："` 為 12（≥ 6）；`grep -c "js/line-core.js"` 為 1。
- 三個 commit（bbce0f7、dcbc09c、2cc4b8b）都在 `git log`；`git rev-list --count 476497a..HEAD` 為 3。
- `grep -c "Phase 11" .planning/TEST-CHECKLIST.md` 為 1；`grep -c "第 11 階段" .planning/驗收清單-精簡版.md` 為 12；`≈` 7；`2+2+2+≈2+2+3` 1；`多一欄` 1；`grep -c "Phase 11" handoff.md` 為 3。
- `git diff --name-only 476497a HEAD | grep -ci linux` 為 0；package.json／package-lock.json 無變動。
- 驗證指令：`npx playwright test tests/line-audit.spec.mjs tests/rhyme-audit.spec.mjs tests/scan.spec.mjs tests/style.spec.mjs` 42 passed；`npm test` 1037 passed／29 skipped／0 failed；perf 3 passed；visual 19 passed。
