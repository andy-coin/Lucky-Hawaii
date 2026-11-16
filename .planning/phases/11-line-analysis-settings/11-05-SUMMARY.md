---
phase: 11-line-analysis-settings
plan: 05
subsystem: ui
tags: [vanilla-js, selection-bar, analysis-panel, line-analysis, a11y, playwright]

requires:
  - phase: 11-line-analysis-settings
    provides: 11-01 的 lhLineRows／lhLineRefIndex／lhLineStructParts；11-02 的詞庫載入說明；11-04 的預覽（測試選擇器要限定 #lyricsSections）
  - phase: 10-rhyme-map
    provides: 選字浮動列、lhPlaceMenu、韻腳統計彈窗、_lhMapBarRestore
provides:
  - 浮動列第三顆按鈕「📏 分析」，D-07 新規則（碰到的行有可數的字就出現；超過 20 字或沒有中文字只剩「分析」）
  - 非互動式面板 #rhymeAnalysis：句構標題、選到幾行共幾字、對照說明、真表格（行／文字／字數／結構）、每行下面的對照整列與 ✓／≠
  - 面板放置（下方、翻到上方、上下都放不下就留給大的那邊並在面板內捲動）
  - 一個浮層：統計、韻腳選單、匯出選單、指定讀音列與面板互斥；Esc 先收面板
  - 韻腳統計補畫只建一次、縮放只重新夾進可見範圍（IN-03）
affects: [11-06, 11-07, 11-08]

actuals:
  tokens: 31000
  tasks: 3
  commits: 4

plan_head_before: b775bcfbd58151e95ba94df33f640c541a4af394
plan_head_after: 68a51ebb4f2020273dcb3e16e4b0fef2725dee19
commits: 4
status: complete

tech-stack:
  added: []
  patterns:
    - "結構文字的畫法抽成 _lhMapStructInto(el, r)：逐行標記與面板共用，猜的那一段永遠是 span.lm-guess（斜體）"
    - "面板內容全從模型文字算（lhLineRows），不看常駐標記的設定；每個字串都走 textContent，沒有任何 HTML 解析"
    - "對照放在每行下面的整列（colspan=4），不多一欄，390px 手機放得下"
    - "補畫過期段落時用 _lhMapStatsBusy 擋掉回頭的 _lhMapStatsRefresh，一次重畫只建一次清單"

key-files:
  created: []
  modified:
    - js/rhyme-map.js
    - css/panels.css
    - tests/line-analysis-ui.spec.mjs
    - tests/rhyme-map-ui.spec.mjs

key-decisions:
  - "D-07 的判斷放在 _lhMapSelCheck：從選取起點那行到最後一個非空白字那行，lhCountWords 為 0 就不出現；查韻與 AI 只在 20 字內且有中文字時才有"
  - "表格第一欄寬 4rem（計畫寫 2.5rem）：欄裡是「第 12 行」，2.5rem 放不下會折成三行"
  - "對照的 ✓／≠ 用 role=img 加 aria-label，讀屏才會念「字數相同／字數不同」"
  - "Tab 在面板裡一律攔截自己算下一個（捲動區有溢出才算一站，加上「關閉句構」），不靠瀏覽器預設順序"

requirements-completed: [MAP-09, MAP-10]

coverage:
  - id: D1
    description: "選取碰到至少一個有字的行就出現浮動列；20 字內有中文字給 查韻／AI／分析（依序），否則只有分析；只碰空白行不出現；防抖、焦點、組字規則照舊"
    requirement: MAP-09
    verification:
      - kind: e2e
        ref: "tests/rhyme-map-ui.spec.mjs#浮動列：這些情況不出現，或只剩「分析」"
        status: pass
      - kind: e2e
        ref: "tests/line-analysis-ui.spec.mjs#分析面板：選幾行按分析，逐行列出字數、結構與對照"
        status: pass
  - id: D2
    description: "面板逐行列出第 i 行／文字前 12 字／字數／結構（≈ 只有猜的段落斜體），有對照段落時每行下面一列「對照 {名} 第 {i} 行：{n} 字　{結構}」與 ✓／≠，對照段落沒有該行就寫沒有；摘要、對照說明、#lhLive 念一次"
    requirement: MAP-10
    verification:
      - kind: e2e
        ref: "tests/line-analysis-ui.spec.mjs#分析面板：選幾行按分析，逐行列出字數、結構與對照"
        status: pass
  - id: D3
    description: "零一多：空範圍只說沒有可分析的行；一行一列；100 行只畫 80 行、footer 只顯示前 80 行、摘要仍算 100 行與全部字數；超過上限的段落只有標題與說明且不量版面；40 字名稱截在 16 字、12 組結構完整顯示；詞庫載入中說明；惡意文字不長出元素"
    requirement: MAP-10
    verification:
      - kind: e2e
        ref: "tests/line-analysis-ui.spec.mjs#分析面板：零、一、多、超過八十行 / 段落太長 / 名稱與結構很長，文字只當文字 / 詞庫載入中"
        status: pass
  - id: D4
    description: "收起：Esc 先收面板（焦點與選取回輸入框）、第二次才收浮動列，另有關閉句構、點外面、選取改變、捲動、組字、storage 事件、換歌、收左面板，aria-expanded 一律回 false"
    requirement: MAP-10
    verification:
      - kind: e2e
        ref: "tests/line-analysis-ui.spec.mjs#分析面板：收起來的各種情況"
        status: pass
  - id: D5
    description: "鍵盤：Alt+↓ 到第一顆看得到的按鈕、→ 到分析、Enter 打開並把焦點放進面板、Tab／Shift+Tab 不跑出面板（溢出時捲動區也是一站）；滑鼠不搶焦點"
    requirement: MAP-10
    verification:
      - kind: e2e
        ref: "tests/line-analysis-ui.spec.mjs#分析面板：鍵盤與焦點"
        status: pass
  - id: D6
    description: "一個浮層：開面板收統計、讀音列；開讀音列收面板；開統計收浮動列與面板"
    requirement: MAP-10
    verification:
      - kind: e2e
        ref: "tests/line-analysis-ui.spec.mjs#分析面板：只算一個浮層"
        status: pass
  - id: D7
    description: "觸控：點面板標題不動輸入框的選取與焦點；捲動區能用手指拖（CDP 觸控捲動手勢）"
    requirement: MAP-10
    verification:
      - kind: e2e
        ref: "tests/line-analysis-ui.spec.mjs#分析面板：觸控保留選取"
        status: pass
      - kind: manual
        ref: "真的 iOS 手指在面板上拖與點（列入 11-07 UAT）"
        status: backstop
  - id: D8
    description: "390×844 縮小 336px 的鍵盤：面板整個在可見範圍、底邊不過鍵盤頂、放不下的部分在面板內捲、「關閉句構」看得到；300 字長選取只出現一次、只有分析、點了面板在可見範圍內"
    requirement: MAP-10
    verification:
      - kind: e2e
        ref: "tests/line-analysis-ui.spec.mjs#分析面板：貼底與鍵盤打開時看得到 / 手機上長選取只出現一次，只有分析"
        status: pass
      - kind: manual
        ref: "真的 iOS 螢幕鍵盤、原生選取把手與放大鏡（列入 11-07 UAT）"
        status: backstop
  - id: D9
    description: "韻腳統計：視窗縮放與視覺視窗縮放只重新放置、不重建（同一個列節點、捲動位置不變）；開在過期段落上只建一次清單（舊程式碼兩個測試都紅）"
    verification:
      - kind: e2e
        ref: "tests/rhyme-map-ui.spec.mjs#統計：縮放時不重建清單 / 統計：重畫時只建一次"
        status: pass
---

# Phase 11 Plan 05: 分析面板 Summary

**浮動列多了「📏 分析」，按下去一個非互動式面板逐行列出字數與斷句結構，並在每行下面對照同類型第一段的同一行（✓／≠）；任何歌詞選取（整段、英文）都有這顆按鈕，面板與其他浮層算同一層，不搶輸入框的選取與手機鍵盤。**

## Performance

- **Duration:** 約 40 分鐘
- **Completed:** 2026-10-28
- **Tasks:** 3（1 tracer、2 auto；實作集中在第一個 commit，後兩個 commit 是測試）
- **Files modified:** 4（無新增）

## Accomplishments

- D-07：`_lhMapSelCheck` 取「選取起點那一行到最後一個非空白字那一行」的文字，`lhCountWords` 為 0 就不出現；`b - a ≤ 40` 先擋明顯太長的選取，不展開整個選取（整段 200000 字也只做 O(選取) 的事）；`lhMapShowBar` 依 `snap.char` 顯示／隱藏查韻與 AI。
- 面板：`lhMapAnalysisBuild`（一次）、`_lhMapAnContent`（內容）、`lhMapOpenAnalysis`、`lhMapHideAnalysis`、`_lhMapAnPlace`。碰到的實體行由 `snap.a` 與 `max(a, end − 1)` 的行號決定（停在下一行開頭不算碰到、部分選到整行算）。
- 放置實測（390×844，選到最後一個可見行）：選 2 字時面板整個翻到浮動列上方（panel 465–696、bar 700–754）；選約 400 字（40 列）時上方放不下，改成留給大的那一邊並在面板內捲動（max-height 692px，scroll 區 `scrollHeight > clientHeight`）；鍵盤 336px 打開後（可見高 508）面板重新放到 4–417、max-height 412px，浮動列在 421–475，兩者不重疊也沒蓋到鍵盤。桌機放得下時在浮動列下方。
- `_lhMapStructInto(el, r)` 取代 `_lhMapMarker` 裡的內嵌迴圈，面板與常駐標記同一個斜體規則；鏡像層輸出逐字不變（既有的 11-01／11-03／11-04 測試全過）。

## Task Commits

1. **Task 1（tracer）：📏 分析、面板、D-07、一個浮層、Esc、統計修正** - `1854049`（含 Task 2 步驟 1／2 的程式與 Task 2 步驟 3 的 Phase 10 斷言改寫，見偏離）
2. **Task 2：零一多、太長、名稱與結構、詞庫載入、手機長選取測試** - `1954412` (test)
3. **Task 3：收起、鍵盤、同一個浮層、觸控、貼底測試與統計測試** - `8f2de3f` (test)
4. **小修：測試說明文字避開標題用語，讓驗收 grep 剛好 1 筆** - `68a51eb` (test)

## 規劃要求記錄的項目

### 被 D-07 推翻而改寫的第 10 階段斷言（不是退步）

- `tests/rhyme-map-ui.spec.mjs`「浮動列：這些情況不出現」→「浮動列：這些情況不出現，或只剩「分析」」：`'abc'` 與 21 字原本斷言浮動列隱藏，現在是只有 `.rm-bar-an` 可見（查韻、AI 隱藏）；20 字剛好是查韻（最後一個字）、AI、分析三顆；只選空白行（它的換行）仍隱藏；游標、組字、韻腳選單、段落選單不變。另外加了第四段 `你好\n\n再見` 當空白行測試。
- 「浮動列：觸控按鈕夠大」的訊息「兩顆按鈕」→「每顆按鈕」（mustSee 選擇器 `#rhymeSelBar button` 本來就涵蓋新按鈕）。
- 「讀音：鍵盤打開時焦點先到目前的讀音…」多按一次 ArrowRight：新按鈕插在 AI 建議與指定讀音之間，指定讀音從第三顆變第四顆。
- 其餘 Phase 10 的浮動列、讀音、統計測試原封通過。

### 統計修正（IN-03）

`_lhMapStatsData` 補畫過期段落會經 `lhMapPaint → _lhMapStrip → _lhMapStatsRefresh → _lhMapStatsFill` 回頭再建一次，所以開統計時建兩次。現在補畫期間設 `_lhMapStatsBusy`，`_lhMapStatsRefresh` 看到旗標就返回。視窗與視覺視窗的 resize 改成 `_lhMapStatsReplace`，只對可見的字母條重新放置（不重建，節點與捲動位置都留著）。兩個新測試在舊程式碼（b775bcf 的 rhyme-map.js）上都是紅燈。

### 發現的既有行為（未動）

Phase 10 的 `_lhMapBarOnChange` 對「任何輸入框的收合選取事件」都呼叫 `lhMapHideBar()`，而它會清掉等著判斷的 400ms 計時。換歌之後新建的輸入框會補送幾個 selectionchange，剛好落在使用者（或測試）選字之後時，會取消這次出現。真人操作的間隔遠大於此，所以沒有改；測試裡換歌後等 300ms 再選字。若之後要加固，可以讓 `_lhMapBarOnChange` 只處理 `document.activeElement` 的事件。

## Files Created/Modified

- `js/rhyme-map.js` - `_lhMapStructInto`、`an` 按鈕、D-07 判斷、`lhMapShowBar` 顯示規則、面板五個函式、Esc／外點擊／讀音列互斥、統計修正
- `css/panels.css` - `#rhymeAnalysis`、`.rm-an-*`（無色碼、無 transition、無 keyframes）
- `tests/line-analysis-ui.spec.mjs` - 分析面板 ×11
- `tests/rhyme-map-ui.spec.mjs` - 浮動列改寫、讀音鍵盤測試、統計 ×2

## Decisions Made

見 frontmatter `key-decisions`。

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - 排程] D-07 的選取判斷與 Task 2 的 Phase 10 斷言改寫提前進了 Task 1 的 commit**
- **Issue:** `_lhMapSelCheck` 在同一個檔案裡和面板一起改；若分開，Task 1 commit 會留下一個必然失敗的 Phase 10 測試
- **Fix:** Task 1 commit 帶著 `_lhMapSelCheck`、`lhMapShowBar` 的 D-07 改動與 `tests/rhyme-map-ui.spec.mjs` 的改寫；Task 2 commit 只剩新測試
- **Commit:** 1854049

**2. [微調] 表格第一欄寬 4rem（計畫 2.5rem）**
- **Issue:** 該欄放「第 12 行」，2.5rem 會折行
- **Fix:** `th:nth-child(1) { width: 4rem }`，其餘欄寬照計畫（2.5rem、6.5rem）
- **Commit:** 1854049

**3. [Rule 1 - 測試設計] 「只算一個浮層」的統計互斥改用鍵盤路徑**
- **Issue:** 統計開著時浮動列出現本身會收統計，點浮動列也會被統計的外點擊處理收掉，用滑鼠測不到 `lhMapOpenAnalysis` 裡的 `lhMapCloseStats`
- **Fix:** 測試手動讓統計開著、浮動列也在，再用鍵盤（Alt+↓、→、→、Enter）開面板；統計收起、字母條 aria-expanded 回 false
- **Commit:** 8f2de3f

**Total deviations:** 3（皆無範圍擴張）。

## Issues Encountered

「收起來的各種情況」第一次在換歌之後選字失敗，原因見上面「發現的既有行為」。補 300ms 等待後穩定。

## Known Stubs

無。

## Threat Flags

無新增攻擊面。T-11-14：面板每個字串（名稱、行文字、數字、結構）都用 `_lhMk`／textContent／`append(字串)`，`js/rhyme-map.js` 沒有 innerHTML／insertAdjacentHTML；測試把 `<img src=x onerror=alert(1)>你` 放進行裡，面板只有文字（0 個 img／script／b／i）；T-11-15：超過 `LH_WD_BIG`／`LH_MAP_MAX_LINES` 的段落不分析（測試確認 lhMirror 呼叫數 0）、最多畫 80 行；T-11-SC：未安裝套件，`package.json`、`package-lock.json` 無變動。

## Verification

- `npm test`：**1020 passed / 29 skipped / 0 failed**（基準 1007 / 29 / 0；新增 13 個：分析面板 11、統計 2）
- 驗收 grep：`function lhMapOpenAnalysis` 1、`rm-bar-an` 3、panels.css `#rhymeAnalysis` 2、`同類型第一段` 3、`只剩「分析」` 1、`分析面板：` 12、`只顯示前` 與 `段落太長，不做句構分析` 各 1、`lhMapHideAnalysis()` 6、rhyme-map.js `#rhymeAnalysis` 3、兩個統計測試標題各 1
- `package.json`、`package-lock.json` 無變動；`*-linux.png` 基準無變動；沒有 `git push`

## Human check（列入 11-07 UAT）

- 真的 iOS Safari／Android Chrome：選取把手拖動、放大鏡、原生選單與浮動列的互動；螢幕鍵盤開著時面板的位置與捲動
- 手指在面板上拖（Chromium 只能用 CDP 觸控手勢驗證）
- 面板與浮動列上下翻轉的觀感，以及「對照」整列在 390px 手機上的讀感

## Next Phase Readiness

11-06 可以直接用 `_lhMapStructInto` 與 `lhMapOpenAnalysis`（snap 只需 `ta, secId, a, b, end`）；面板不追蹤詞庫載好的時刻（說明文字只在打開時決定，重開才更新）。

## Self-Check: PASSED

- FOUND: js/rhyme-map.js（`function lhMapOpenAnalysis`、`_lhMapAnPlace`、`_lhMapStatsBusy`）、css/panels.css（`#rhymeAnalysis`）、tests（分析面板：×11、統計：縮放時不重建清單、統計：重畫時只建一次）
- FOUND commits: 1854049、1954412、8f2de3f、68a51eb
