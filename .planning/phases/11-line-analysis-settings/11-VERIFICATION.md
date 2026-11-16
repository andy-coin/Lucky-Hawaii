---
phase: 11-line-analysis-settings
verified: 2026-10-28T23:00:00Z
status: human_needed
score: 3/3 must-haves verified
covered_files:
  - css/panels.css
  - index.html
  - js/line-core.js
  - js/rhyme-core.js
  - js/rhyme-map.js
  - js/safety.js
  - js/search-ui.js
  - js/sections.js
  - js/songs.js
covered_digest: "v2:sha256:f879cf653a55935e831ab2e5b8df5678d39c9f1ac23b5eeb4efb55088975cc7f"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "用幾首真實歌詞（含 Verse I／II 結構不同的）逐行看斷句，在詞庫載好的狀態下比對 Andy 自己的語感"
    expected: "明確斷點（空白、標點）一律照 Andy 打的切；5 字以上沒斷點的片段才由詞庫猜，且只有猜的那段帶 ≈ 與斜體；猜的結果大致符合語感，不合的地方可接受（只是參考）"
    why_human: "ROADMAP Human check：斷句是否符合語感是主觀判斷；自動測試只能斷言固定範例（用假詞庫），無法代表真實詞庫對真實歌詞的切法"
  - test: "全部標記打開（逐行標記＋字數＋斷句＋韻腳字母＋對照差異＋句中押韻），在電腦、iPad、iPhone 各看一次，晝夜主題各一次，並試『右欄』與『句尾』兩種位置、小中大字級、淡中濃三段濃淡"
    expected: "版面不擠、不眼花；標記不壓到歌詞；長結構被裁切時仍可讀；韻族顏色自訂後對比提醒合理"
    why_human: "ROADMAP Human check：標記版面是否美觀屬主觀判斷，Chromium 截圖無法代表實機"
  - test: "WebKit（Safari／iOS）與 Gecko（Firefox）實機看標記與色塊在自動換行時是否仍貼著各自的字"
    expected: "文字框與鏡像層在同一個字換行；標記不漂到別的視覺列"
    why_human: "自動測試僅在 Mac Chromium 執行；換行斷點的演算法在不同引擎可能有差"
  - test: "iOS Safari 開『韻族顏色』的原生色票選擇器，改一色後看歌詞色塊與預覽是否即時變、放開才存"
    expected: "色票可開、可選；色塊即時變；重新整理後保留"
    why_human: "iOS 原生 input[type=color] 行為無法在 Chromium 模擬"
  - test: "iPad 外接觸控板／滑鼠：開啟『反白停留自動分析』，用滑鼠反白一段字後不動 1.5 秒"
    expected: "句構面板自動出現且不搶焦點；改用手指或鍵盤選取則不會自動出現（應以『📏 分析』按鈕觸發）"
    why_human: "指標類型（mouse vs touch）判斷在 iPadOS 觸控板上的實機行為無法在桌面 Chromium 驗證"
  - test: "Andy 核准各計畫自主做的決定：(1) ≈ 只標在『猜的那一段』而非整串（偏離 UI-SPEC D-04）；(2) 對照差異以逐行標記上的 ≠ 呈現，而非獨立並排列（偏離 CONTEXT C3）；(3) 韻族顏色以 16 色格自訂（偏離 CONTEXT D3 的做法）；(4) 分析面板與浮動列共用同一個浮層（偏離 CONTEXT C5 的分開層）"
    expected: "Andy 認可或改判"
    why_human: "已記載的自主設計偏離，核准權不在驗證者；功能存在且有測試，但是否符合 Andy 的想法需本人決定"
  - test: "tests/visual.spec.mjs-snapshots 的 -linux 基準圖在 Linux／CI 重拍（沿用 Phase 10 待辦）"
    expected: "-linux 圖含新增的逐行標記欄、設定頁新區塊"
    why_human: "本機只比對 -darwin 圖，這裡無法產生 -linux 圖"
---

# Phase 11: Line Analysis & Settings 句構分析與設定頁 Verification Report

**Phase Goal:** 逐行看出字數與斷句結構、對照同類段落，並在設定頁自訂所有標記；預設只開句尾上色，不讓畫面眼花撩亂。
**Verified:** 2026-10-28
**Status:** human_needed
**Re-verification:** No, initial verification
**Mode note:** Phase goal 不是 "As a ... I want ... so that ..." 格式，依既有 goal-backward 方法驗證，未套用 User Flow Coverage 表。

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | 每行顯示字數與斷句結構（如 3+4、2+2+3），並可把 Verse I 與 Verse II 逐行對照〔自動：固定範例斷言〕 | VERIFIED | `js/line-core.js`（111 行，純函式）：`lhLineAnalyze` 用和段落標題同一個 `_LH_WC_RE` 切單位，所以「各組字數加總 = 字數」由構造保證；兩單位之間隔著任何非計數字元（空白、標點、emoji）即為明確斷點；無斷點且 >=5 單位才用 `wordPhoneticMap` 前向最長詞猜。`lhLineRefIndex` 用 Map 回傳「同類型第一段」（Verse II、III 都對 Verse I，自訂段落以 `custom:` 前綴區隔）。tests/line-core.spec.mjs 固定範例表斷言 `夢裡想起你的臉 → 7、[2,2,3]、≈2+2+3`、`我望著遠方的光 → 7、[3,4]、≈3+4`、混合行 `月光 灑在 窗前 夢裡想起你的臉 → 2+2+2+≈2+2+3`（只有猜的那段帶 ≈），另有加總恆等式、四字以內不猜、詞庫未載好、逐行行號、對照索引、200 行 20ms 各一項；本次重跑通過。UI：`js/rhyme-map.js` `_lhMapBuildFrag` 每行呼叫 `lhLineAnalyze` 並寫入標記，對照差異開啟時在同一行標 `≠`；line-analysis-ui「常駐：打開逐行標記，每行右邊出現字數與斷句」「對照：同類型第一段的同一行字數不同就標 ≠」通過。審查 WR-01（改類型／名稱／順序後 ≠ 過時）已修：`lhMapOnSectionsChanged`（rhyme-map.js:288）由 `lhSecRefreshMeta`（sections.js:90）呼叫，測試「對照：改了段落類型，對照段落換人，≠ 跟著更新」通過。 |
| 2 | 句構分析可在設定頁常駐開啟，也可反白後按「分析」，或反白後停留數秒自動出現；觸控裝置以按鈕代替 hover〔自動〕 | VERIFIED | 常駐：設定鍵 `line`（逐行標記總開關）寫入 `lh:map`，選單與偏好設定兩邊同步（「偏好設定：兩邊同步」「別的分頁改了設定」通過）。按「分析」：浮動列有「📏 分析」按鈕（rhyme-map.js:1034），開啟逐行列字數、結構與對照的分析面板（「分析面板：選幾行按分析，逐行列出字數、結構與對照」、零／一／多／八十行、段落太長、名稱與結構很長、詞庫載入中、鍵盤焦點、單一浮層、觸控保留選取、貼底與鍵盤全部通過）。停留自動出現：設定 `autoHover`（預設關），`_lhDwellArm`／`_lhDwellOk`／`_lhDwellCancel`（rhyme-map.js:1018-1230）只在滑鼠選取後起算 1.5 秒，且開關、選取一致才打開面板；「hover：滑鼠反白停 1.5 秒自動打開句構面板，不搶焦點」「會取消的動作」「觸控、鍵盤選取或沒打開都不會自動出現」「不在移動時量版面」通過。觸控以「📏 分析」按鈕替代 hover：「分析面板：手機上長選取只出現一次，只有分析」與 44px 觸控稽核（line-audit）通過。 |
| 3 | 設定頁可逐項開關韻腳地圖與句構分析，並調整標記位置、文字大小、顏色；全新使用者預設只開句尾上色〔自動〕 | VERIFIED | `LH_MAP_DEFAULTS`（rhyme-core.js:15）= Phase 10 五鍵（只有 `end:true`）+ `line:false, lnRhyme:false, lnCount:true, lnSplit:true, lnDiff:false, autoHover:false, pos:'right', size:'m', depth:'std'`；`lhRhymeNormalizeSettings` 每鍵獨立驗證（只收 typeof boolean、列舉清單內字串、固定 16 把色鍵 + `/^#[0-9a-f]{6}$/`，不迭代輸入的鍵，擋 `__proto__`）；`lhRhymeSerialize` 寫回 Phase 10 的五鍵原順序，只多寫與預設不同的新鍵。偏好設定有逐項開關、顯示方式（位置 right／tail）、文字大小 s／m／l、濃淡三段、16 個韻族顏色（恢復預設按兩次、對比提醒、壞色碼丟棄、別的分頁同步、iOS 原生色票測試）、即時預覽（用和歌詞同一個渲染器）。全新使用者：line-analysis-ui 斷言 `data-lm` 屬性為 null、無標記、無欄位、`lh:map` 在使用者變更前不寫入（「開機不改寫」「壞值回預設」「備份：句構設定跟著備份走」通過）。 |

**Score:** 3/3 roadmap truths verified (0 present, behavior-unverified)

PLAN 層級額外 must-have 抽查（11-01 frontmatter）：Phase 10 五鍵 `lh:map` 字串逐字不變、開機不改寫、`index.html` 所有本機 js／css／data 標籤皆 `?v=0.96.15`、`js/line-core.js` 緊接 `js/rhyme-core.js` 之後（index.html:456-457）、惡意文字一律 `textContent`／`append(string)`、列印與匯出沒有標記（`bbce0f7` 測試）、組字中鏡像零變動、換行不變（標記開關前後每個字位置相同）。皆有對應行為測試且重跑綠燈。

沒有 behavior-dependent truth 只靠符號存在就過關：組字不重畫、換行不變、對照 ≠ 隨段落改動更新、停留計時的取消條件、單一浮層、不在移動時量版面、長任務量測，均有行為測試。

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `js/line-core.js` | 純函式：逐行分析、結構字串、對照索引 | VERIFIED | 111 行，無 DOM；被 rhyme-map.js 呼叫；tests/node-core.mjs 以 vm 載入 |
| `js/rhyme-core.js` | 預設、列舉、色碼驗證、normalize／serialize | VERIFIED | 237 行；被 safety.js、rhyme-map.js 引用（safety.js 用 typeof guard） |
| `js/rhyme-map.js` | 標記、設定器、顏色、預覽、分析面板、停留 | VERIFIED | 1526 行；index.html 載入；tests 覆蓋 |
| `css/panels.css` | 欄位 padding 規則、標記樣式、36% 上限 | VERIFIED | +98 行；樣式一致、最後視覺列、手機 150% 測試通過 |
| `js/safety.js`、`js/songs.js`、`js/search-ui.js`、`js/sections.js` | 備份清洗、讀音讀入清洗、浮動列整合、對照重畫觸發 | VERIFIED | 小幅差異（8／7／16／1 行）；備份與舊資料測試通過 |
| `tests/line-core.spec.mjs`、`line-analysis-ui.spec.mjs`、`line-audit.spec.mjs`、`line-journey.spec.mjs` | 固定範例、e2e、稽核、旅程 | VERIFIED | 本次與 rhyme-map-ui、rhyme-core 一起重跑 174 passed |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `_lhMapBuildFrag` | `lhLineAnalyze` | 建鏡像片段時逐行分析 | WIRED | 標記由真實文字算出 |
| `lhMapSetSetting` | `lhRhymeSerialize` | `lhSet('lh:map', …)` | WIRED | 只經序列化器寫入 |
| `safety.js _lhSettingFrom` | `lhRhymeSerialize`／`lhRhymeNormalizeSettings` | 備份匯入 | WIRED | 有 typeof guard，清洗器沒載入也不拋錯 |
| `index.html` | `js/line-core.js?v=0.96.15` | 經典 script 標籤 | WIRED | 緊接 rhyme-core.js（:456-457） |
| `lhSecRefreshMeta` | `lhMapOnSectionsChanged` | 改類型／名稱／順序後重排 | WIRED | 審查 WR-01 修正已在碼中（sections.js:90） |
| 浮動列「📏 分析」／停留計時 | 分析面板 | 同一個浮層 | WIRED | 單一浮層測試通過 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| 逐行標記 | `r.n`／`r.groups`／`r.guess` | `lhLineAnalyze(行文字)` + 即時 `wordPhoneticMap` | 是 | FLOWING |
| 對照 ≠ | `lhLineRefIndex(sections)` + 參考段逐行字數 | 真實段落模型 | 是 | FLOWING |
| 分析面板 | 選取範圍的行 + 同類型第一段 | `ta.value` 與段落模型 | 是 | FLOWING |
| 韻族顏色 | `set.colors` | 儲存的 `lh:map`（經 normalize） | 是 | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| 句構／設定／分析／停留／稽核／旅程／韻腳地圖回歸 | `npx playwright test tests/line-core.spec.mjs tests/line-analysis-ui.spec.mjs tests/line-audit.spec.mjs tests/line-journey.spec.mjs tests/rhyme-map-ui.spec.mjs tests/rhyme-core.spec.mjs` | 174 passed | PASS |
| 長歌打字無長任務（含全部標記開著＋對照） | `LH_PERF=1 npx playwright test tests/rhyme-map-perf.spec.mjs --workers=1` | 3 passed；150 行 4× 最長任務 0ms（0 個長任務）；全部標記 150 行同為 0ms；`lhRhymeAnalyze` 200 行中位數 0.40ms | PASS |
| 全套件（呼叫者提供，未重跑） | `npm test` | 1038 passed / 29 skipped / 0 failed（僅 Mac Chromium） | 採信呼叫者回報 |

### Probe Execution

Step 7c: SKIPPED（本階段計畫未宣告 `probe-*.sh`，專案無此類探針）。

### Requirements Coverage

PLAN frontmatter 宣告的 ID：11-01 [MAP-09, MAP-10, MAP-11]、11-02 [MAP-09, MAP-11]、11-03 [MAP-09, MAP-11]、11-04 [MAP-11]、11-05 [MAP-09, MAP-10]、11-06 [MAP-10, MAP-11]、11-07 [MAP-09, MAP-10, MAP-11]、11-08 [MAP-09, MAP-10, MAP-11]。聯集 = MAP-09、MAP-10、MAP-11，與 REQUIREMENTS.md 追蹤表對應 Phase 11 的 3 個 ID 完全相同，沒有孤兒需求，也沒有未被 REQUIREMENTS 收錄的 ID。

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| MAP-09 | 11-01, 02, 03, 05, 07, 08 | 逐行字數、斷句結構、與對應段落比對 | SATISFIED | line-core 固定範例＋對照索引＋UI ≠ 與分析面板 |
| MAP-10 | 11-01, 05, 06, 07, 08 | 設定頁常駐／反白按「分析」／停留自動；觸控以按鈕替代 | SATISFIED | 常駐開關、「📏 分析」、1.5 秒停留（僅滑鼠）與其取消條件測試 |
| MAP-11 | 11-01, 02, 03, 04, 06, 07, 08 | 逐項開關、位置／文字大小／顏色、預設只開句尾上色 | SATISFIED | 偏好設定各項、預覽、全新使用者預設斷言、備份／舊資料 |

REQUIREMENTS.md 內三項已勾 `[x]` 且追蹤表標 Complete，與本次驗證結果一致。

### Anti-Patterns Found

在本階段改動的原始檔（js/line-core.js、rhyme-core.js、rhyme-map.js、safety.js、search-ui.js、songs.js、sections.js、css/panels.css）掃描 `TBD|FIXME|XXX|TODO|HACK`：無任何符合，無 debt marker。審查 11-REVIEW.md：0 critical／1 warning／5 info；WR-01 與 IN-05 已修（commit 03709a9），我確認 WR-01 的修正在碼中且有先紅後綠的測試。

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| 11-REVIEW.md IN-01 | – | 鏡像層尾端零寬字在剛好換行時多一列（Phase 10 起就有，字與標記仍對齊） | Info | 不影響正確性 |
| 11-REVIEW.md IN-02 | – | 詞庫載入失敗時「載入中」提示不消失 | Info | 僅提示文字殘留，可於 UAT 留意 |
| 11-REVIEW.md IN-03／04 | – | 重複常數與條件 | Info | 維護性，無行為影響 |

### Human Verification Required

見 frontmatter `human_verification`，共 7 項：

1. **真實歌詞斷句是否符合語感**（ROADMAP Human check）。
2. **標記版面是否美觀**，三種裝置、晝夜、兩種位置、三種字級與濃淡（ROADMAP Human check）。
3. **WebKit／Gecko 實機換行對齊**（自動測試僅 Mac Chromium）。
4. **iOS 原生色票選擇器**。
5. **iPad 觸控板／滑鼠的停留自動分析**。
6. **Andy 核准 4 項自主設計偏離**：≈ 只標猜的那一段（對 UI-SPEC D-04）、對照差異以逐行 ≠ 呈現（對 CONTEXT C3）、顏色 16 格自訂（對 CONTEXT D3）、分析面板與浮動列同一浮層（對 CONTEXT C5）。
7. **-linux 視覺基準圖需 Linux／CI 重拍**。

### Gaps Summary

沒有阻擋目標達成的缺口。三項 ROADMAP 成功條件在程式碼與測試中都成立：逐行字數與斷句有固定範例斷言且加總由構造保證，同類型第一段對照（含審查發現的過時 ≠ 已修）；常駐、按「分析」、滑鼠停留三種觸發都有實作與行為測試，觸控以按鈕代替 hover；設定項目可逐項開關、可調位置／字級／濃淡／16 色，全新使用者只有句尾上色且 `lh:map` 不被改寫。我自己重跑 174 個 Phase 10／11 相關測試與 3 個效能測試全數通過，無 debt marker。狀態是 `human_needed` 而非 `passed`，原因是 ROADMAP 明列的人工檢查（語感、美觀）、實機瀏覽器與裝置行為，以及 Andy 尚未核准的已記載自主設計偏離；這些不是缺口，核准權不在驗證者。

---

_Verified: 2026-10-28_
_Verifier: Claude (gsd-verifier)_
