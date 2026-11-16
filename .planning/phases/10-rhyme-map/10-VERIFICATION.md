---
phase: 10-rhyme-map
verified: 2026-10-28T12:00:00Z
status: human_needed
score: 5/5 must-haves verified
covered_files:
  - css/panels.css
  - css/responsive.css
  - index.html
  - js/candidates.js
  - js/lyrics.js
  - js/rhyme-core.js
  - js/rhyme-map.js
  - js/safety.js
  - js/sections.js
  - js/wordlist.js
covered_digest: "v2:sha256:3d11ac30a02a4cfdc5296e5b21bf5c52e38493a590fedae7eab16ccd0b24685d"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "iPad / iPhone Safari 與 Android Chrome 各看一次句尾色塊（晝夜主題各一次），並開啟句中押韻、結構字母"
    expected: "色塊可讀、17 色好分辨（含色盲友善度）、底線不刺眼、不眼花"
    why_human: "ROADMAP Human check：實機可讀性與美觀屬主觀判斷，Chromium 截圖無法代表"
  - test: "實機（iOS 注音／Android 注音鍵盤）在長篇歌詞句尾直接用注音組字，並在組字中捲動"
    expected: "組字不被打斷、預選字不閃、色塊不亂跳；Safari 慣性捲動時鏡像層不抖，與文字對得齊"
    why_human: "ROADMAP Human check：真實輸入法行為；CDP 的 composition 模擬只能驗證事件序列，不能代表 iOS／Android 輸入法"
  - test: "手機長按選字，確認浮動列「查韻／AI 建議」出現，且不被 iOS 原生選單擋住"
    expected: "浮動列可見、可點，查韻會切到查韻分頁"
    why_human: "CONTEXT A1／A2 實機行為（原生選單位置因系統而異）"
  - test: "Andy 決定 SC4「點歌詞中的任一字」要不要改成單擊就查"
    expected: "目前實作（CONTEXT D1，Claude 自主決定）：單擊仍是放游標，要「選取（反白、雙擊、手機長按）→ 浮動列 → 查韻／AI 建議」才查；另可點段落標題列字母串開統計，點一行查該行句尾字。Andy 認可或改判"
    why_human: "ROADMAP 字面是「點」，實作是「選取後點浮動列」，是已記載的自主設計偏離（10-CONTEXT D1、UAT 待確認清單），核准權不在驗證者"
  - test: "Andy 核准各計畫自主做的決定：B1 背景色塊而非改字色、B2 嚴格模式顏色仍按家族、B3 孤句較淡、C3 字母與統計預設關、E1 了／的／嗎 也算語助詞、A3 手動讀音綁定句尾 4 字，以及 D-10 標題字母改為點開統計小視窗"
    expected: "Andy 認可或改判"
    why_human: "10-CONTEXT 與 10-VALIDATION 已列為 UAT 待確認；使用者授權自主，但核准不由驗證者代行"
  - test: "tests/visual.spec.mjs-snapshots 的 -linux 基準圖在 Linux／CI 環境重拍並目視確認"
    expected: "-linux 圖含第 10 階段新增的韻腳選單按鈕、標題列字母條、鏡像層（無歌詞時為空）"
    why_human: "本機 Mac 只比對 -darwin 圖；-linux 圖需 Linux 環境重拍，這裡做不到"
---

# Phase 10: Rhyme Map 韻腳地圖 Verification Report

**Phase Goal:** 寫詞時一眼看出押韻結構：句尾依韻部自動上色、段落韻式統計、可選的句中押韻偵測、點字即查韻——判定一律沿用 Andy 既有的核心押韻演算法。
**Verified:** 2026-10-28
**Status:** human_needed
**Re-verification:** No, initial verification
**Mode note:** Phase goal 不是 "As a ... I want ... so that ..." 格式，驗證依既有 goal-backward 方法進行，未套用 User Flow Coverage 表。

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | 句尾字依韻部自動上色，判定與查韻共用同一套核心演算法（同一組測試資料兩邊一致）；破音字手動指定讀音後上色跟著改變 | VERIFIED | `lhRhymeMatch`（js/rhyme-core.js）是單一判定原語，查韻篩選已改為呼叫它：candidates.js:79、:280、:290，wordlist.js:434、:440；地圖用的 `lhRhymeKey` 與它是同一個等價關係（嚴格＝韻母全等，寬韻＝`RHYME_TO_FAMILY` 相同），韻母來源同為 `getZhuyinRhyme`。tests/rhyme-parity.spec.mjs 以 9,800 組字對比對三邊（地圖／`validateWordRhyme`／`filterWordsByRhymeSingle`），本次重跑通過。上色：js/rhyme-map.js `lhMapPaint` 對每行的句尾字產生 `span.rm-hl[data-f=家族 id]`，rhyme-map-ui「上色：句尾字依韻部上色」通過。手動讀音：`lhRhymeReading` 優先序「手動（須為該字合法讀音）→ 詞庫詞末音節 → 字典第一讀音」，`lhMapSetReading` 改完整首歌重畫（WR-01 已修）；rhyme-map-ui「讀音：破音字句尾可以指定讀音」「自動改回字典讀音」「改了句尾就自動失效」通過。 |
| 2 | 每個段落顯示韻腳統計與押韻結構字母（AABB、ABAB），固定歌詞範例斷言 | VERIFIED | `lhRhymeAnalyze`／`lhRhymeSummary`（rhyme-core.js）；`_lhMapStrip` 寫入段落標題列字母條，點開統計小視窗。tests/rhyme-core.spec.mjs 固定範例 F-AABB（AABB）、F-ABAB（寬 ABAB／嚴 ABCD）、F-FAM1/2、F-PART、F-KONG、F-POLY 全部斷言通過；rhyme-map-ui「標題字母：打開後顯示 AABB」及零／一／多句、各尺寸、觸控大小通過。注意：字母條預設關（C3），需在「韻腳 ▾」選單打開。 |
| 3 | 嚴格／寬韻切換、忽略句尾語助詞、句中多押偵測（預設關）都能開關並立即反映 | VERIFIED | `lhMapSetSetting`（rhyme-map.js:366）改設定即 `lhMapRenderAll`，快取簽名含五個開關所以立即重算；預設 `{end:true, letters:false, inner:false, strict:false, skipParticles:true}`（rhyme-core.js `LH_RHYME_DEFAULTS`）。rhyme-map-ui「開關：預設只開句尾上色」「開關：嚴格與寬韻」「開關：忽略句尾語助詞」「句中：預設關、打開後最多三個底線」通過；設定寫入 `lh:map`，重新整理後保留、壞值回預設、別的分頁同步、備份帶走，皆有測試。 |
| 4 | 點歌詞中的任一字，就能查它的同韻字與 AI 建議 | VERIFIED（設計偏離，需 Andy 決定） | js/rhyme-map.js `_lhMapSelCheck`／`lhMapShowBar`：選取歌詞文字後約 400ms 出現浮動列「查韻／AI 建議（破音字另有指定讀音）」，「查韻」把最後一個漢字送進 `#searchInput` 並執行查韻，手機自動切查韻頁；「AI 建議」先查韻再出 AI 詞卡。rhyme-map-ui「浮動列：反白後出現、按查韻就查」「AI 建議：先查韻再出 AI 詞卡」「浮動列：手機查韻與 AI 建議切分頁」「浮動列：這些情況收起來」通過。**偏離：單擊仍只放游標**（CONTEXT D1，Claude 自主決定，避免每點一下就換查詢）；要反白、雙擊或手機長按才會出現浮動列。功能存在且通過測試，但與 ROADMAP 字面「點」不完全相同，列入 human_verification 由 Andy 判定。 |
| 5 | 注音組字過程中不執行分析；100 行以上長篇歌詞編輯不卡頓 | VERIFIED | 組字守衛：`lhMapSchedule`（:168）與 `_lhMapFlush` 的 `run`（:179）、`_lhMapStatsFill`（:485）、捲動處理（:203，只切 class 不增減節點）皆檢查 `_lhComposing`。rhyme-map-ui「組字：組字中鏡像零變動，確認後才重畫」「組字：句尾打字時色塊留著，換行或句中修改時先藏起來」，songs-ime 6 個組字測試通過。效能：我自己跑 `LH_PERF=1 npx playwright test tests/rhyme-map-perf.spec.mjs --workers=1`，150 行＋4× CPU 降速連續打字，最長任務 0ms、0 個長任務（門檻 50ms，測試先斷言 150 行真的上了色、打完確實重畫）；`lhRhymeAnalyze` 200 行中位數 0.40ms（門檻 20ms）。另有超大段落（`LH_WD_BIG`／`LH_MAP_MAX_LINES`）跳過分析的保險，與 200ms 去抖／1 秒上限排程、`requestIdleCallback`。 |

**Score:** 5/5 truths verified (0 present, behavior-unverified)

沒有 behavior-dependent truth 只靠符號存在就過關：組字不分析（鏡像零突變）、快取命中不重畫、手動讀音失效、長任務量測、浮動列收起條件，皆有對應行為測試，且本次重跑全綠。

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `js/rhyme-core.js` | 純函式：判定原語、句尾抽取、字母、統計、設定與讀音清洗 | VERIFIED | 188 行，無 DOM；被 candidates.js、wordlist.js、rhyme-map.js、safety.js 引用；`tests/node-core.mjs` 載入進 vm 測試 |
| `js/rhyme-map.js` | 鏡像層上色、排程、選單、統計、浮動列、指定讀音 | VERIFIED | 891 行，非 stub；index.html 載入；tests 覆蓋 |
| `js/candidates.js`、`js/wordlist.js` | 查韻改用 `lhRhymeMatch` | VERIFIED | 5 處呼叫，parity 測試守住 |
| `js/safety.js` | `lh:map` 與 `readings` 進備份／匯入並清洗 | VERIFIED | `lhRhymeNormalizeSettings`／`lhRhymeCleanReadings` 接進 `lhParseBackup`；備份測試通過 |
| `js/lyrics.js`、`js/sections.js` | 鏡像層插入點、input 排程、標題列字母條 | VERIFIED | git diff 12／6 行；ui 測試通過 |
| `css/panels.css`、`css/responsive.css` | 17 色×晝夜色票、鏡像層樣式、浮動列、44px 觸控 | VERIFIED | 對比、樣式一致、觸控稽核測試通過 |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| 查韻篩選（candidates.js、wordlist.js） | `lhRhymeMatch` | 直接呼叫 | WIRED | 5 處；parity 9,800 組零差異 |
| lyrics.js input | `lhMapSchedule` | 經 `lhSecCountOne`，組字結束再排程 | WIRED | 組字中 `_lhComposing` 擋住 |
| `lhMapPaint` | `lhRhymeAnalyze` + 鏡像層 | 從模型讀文字，`replaceChildren` | WIRED | 不碰 textarea |
| 浮動列「查韻」／「AI 建議」 | `#searchInput` 與既有 `_handleSearch`／AI 入口 | 填入後觸發 | WIRED | 測試涵蓋桌機＋手機 |
| `lhMapSetReading` | `song.readings` → `lhRhymeReading` → 重畫整首歌 | 模型寫入＋`lhMapRenderAll` | WIRED | 備份與跨分頁同步有測試 |
| 詞庫載入完成 | `lhMapOnLexiconChange` | wordlist.js `_loadWordlistOnce`（WR-02 已修） | WIRED | 詞庫換包後重讀句尾 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `.rm-hl` 色塊 | `r.f`／`r.t.i` | `lhRhymeAnalyze(sec.text, …, song.readings)`，由 `charInfo`／`getCharAllReadings`／`wordPhoneticMap` 真實字典資料算出 | 是 | FLOWING |
| 字母條／統計 | `res.letters`、`lhRhymeSummary` | 同一份 `res`（快取） | 是 | FLOWING |
| 浮動列 | `snap.char` | `ta.selectionStart/End` 與 `ta.value` | 是 | FLOWING |

字典載不到時不上色也不報錯（測試「字典載不到時不上色也不報錯」），不是靜態假資料。

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| 核心／parity／UI／旅程／稽核／組字 | `npx playwright test tests/rhyme-core.spec.mjs tests/rhyme-parity.spec.mjs tests/rhyme-map-ui.spec.mjs tests/rhyme-journey.spec.mjs tests/rhyme-audit.spec.mjs tests/songs-ime.spec.mjs` | 122 passed | PASS |
| 長歌打字無長任務、分析耗時 | `LH_PERF=1 npx playwright test tests/rhyme-map-perf.spec.mjs --workers=1` | 2 passed；最長任務 0ms（0 個長任務）；分析 200 行 0.40ms | PASS |
| 全套件（呼叫者提供，未重跑） | `npm test` | 964 passed / 28 skipped / 0 failed | 採信呼叫者回報 |

### Probe Execution

Step 7c: SKIPPED（本階段計畫未宣告 `probe-*.sh`；`scripts/*/tests/probe-*.sh` 不存在於此專案的驗證方式）。

### Requirements Coverage

PLAN frontmatter 宣告的 ID：10-01 [MAP-02, MAP-01, MAP-12]、10-02 [MAP-01]、10-03 [MAP-12, MAP-02]、10-04 [MAP-06, MAP-07, MAP-03, MAP-01]、10-05 [MAP-05]、10-06 [MAP-08]、10-07 [MAP-04, MAP-05]、10-08 [MAP-01…08, MAP-12]。聯集 9 個，與 REQUIREMENTS.md 追蹤表對應 Phase 10 的 9 個 ID 完全相同，沒有孤兒需求（MAP-09/10/11 屬 Phase 11，不在本階段範圍）。

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| MAP-01 | 10-01, 10-02, 10-04, 10-08 | 沿用核心押韻演算法，不另寫判定 | SATISFIED | `lhRhymeMatch` 共用；parity 9,800 組零差異 |
| MAP-02 | 10-01, 10-03, 10-08 | 句尾依韻部上色 | SATISFIED | `.rm-hl[data-f]`；上色／對比／鏡像對齊測試 |
| MAP-03 | 10-04, 10-08 | 句中押韻偵測（預設關） | SATISFIED | `lhRhymeInner`；「句中」測試 |
| MAP-04 | 10-07, 10-08 | 段落統計與 AABB／ABAB 字母 | SATISFIED | 固定範例斷言＋標題字母測試 |
| MAP-05 | 10-05, 10-07, 10-08 | 點字查同韻字／AI 建議 | SATISFIED（觸發方式見 SC4 偏離） | 浮動列＋統計視窗點一行查韻 |
| MAP-06 | 10-04, 10-08 | 嚴格／寬韻 toggle | SATISFIED | 「開關：嚴格與寬韻」 |
| MAP-07 | 10-04, 10-08 | 忽略句尾語助詞可開關 | SATISFIED | 「開關：忽略句尾語助詞」 |
| MAP-08 | 10-06, 10-08 | 破音字手動指定讀音 | SATISFIED | 讀音相關 9 個測試＋備份 3 個 |
| MAP-12 | 10-01, 10-03, 10-08 | 組字中不分析、長歌不卡 | SATISFIED | 組字測試＋perf 實測 |

### Anti-Patterns Found

在本階段改動的 10 個檔案掃描 `TBD|FIXME|XXX|TODO|HACK`：無任何符合。審查（10-REVIEW.md）0 critical／3 warning／6 info；WR-01～03、IN-01 已於 55b0404 修正，我確認 `lhMapSetReading` 與 `_loadWordlistOnce` 的修正在程式碼中。

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| 10-REVIEW.md IN-02～06 | – | 開放中的 info 級項目（含 IN-04 讀入時清洗 readings 留待 Phase 11） | Info | 不影響正確性，已記錄留待後續 |

### Human Verification Required

見 frontmatter `human_verification`，共 6 項：

1. **實機色塊可讀性與美觀**（ROADMAP Human check）。
2. **實機注音組字不受影響、Safari 慣性捲動不抖**（ROADMAP Human check）。
3. **手機長按選字後浮動列出現、不被原生選單擋住**。
4. **SC4 觸發方式決定**：單擊只放游標，要反白才查；Andy 決定是否改成單擊就查。
5. **Andy 核准各計畫自主做的設計決定**（B1、B2、B3、C3、E1、A3、D-10）。
6. **-linux 視覺基準圖需在 Linux／CI 重拍**。

### Gaps Summary

沒有阻擋目標達成的缺口。五項 ROADMAP 成功條件在程式碼與測試中都成立：核心演算法共用且有 9,800 組零差異的比對測試；組字守衛與長歌效能我親手重跑量測通過；沒有 debt marker。狀態是 `human_needed` 而不是 `passed`，原因是 ROADMAP 明列的實機人工檢查、SC4「點」與實作「選取後浮動列」之間的已記載偏離，以及 Andy 尚未核准的自主設計決定。

---

_Verified: 2026-10-28_
_Verifier: Claude (gsd-verifier)_
