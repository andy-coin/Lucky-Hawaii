---
phase: 09-section-modules
verified: 2026-10-23T12:00:00Z
status: human_needed
score: 5/5 must-haves verified
covered_files:
  - js/lyrics.js
  - js/safety.js
  - js/sections-core.js
  - js/sections.js
  - js/songs.js
  - js/undo.js
  - js/word-drag.js
covered_digest: "v2:sha256:6ff79c5b3f8c8bcd5985a255fa7c28839adf4f3cad79a3d0d0e0adeb8e61e06c"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "iPad / iPhone Safari 與 Android Chrome 各拖一次段落把手與一張詞卡（長按約 0.4 秒後拖）"
    expected: "段落順利排序、列表仍能正常捲動、詞卡長按後可拖進歌詞、不跳出回報選單或系統選單"
    why_human: "實機觸控手感（ROADMAP Human check）；Chromium 的 CDP 觸控模擬無法代表 iOS Safari 行為"
  - test: "iPhone 上打字後按 ↶ ↷；用 iOS 搖一搖復原"
    expected: "鍵盤不收起，文字正確復原／重做"
    why_human: "實機鍵盤行為（09-VALIDATION Manual-Only）"
  - test: "晝夜主題各看一次 8 個段落顏色"
    expected: "顏色可讀、好看"
    why_human: "主觀美觀"
  - test: "復原刪除、取代後游標的位置是否合手感（WR-03 邏輯修正）"
    expected: "游標落在被還原那一塊的尾端"
    why_human: "REVIEW-FIX 已標明需人工確認手感"
  - test: "tests/visual.spec.mjs-snapshots 的 -linux 基準圖在 Linux／CI 環境重拍並目視確認"
    expected: "-linux 圖含第 9 階段新增的 .lyrics-tools 列、段落標題列、把手"
    why_human: "-darwin 圖最後更新於 d89498a（2026-10-23），-linux 圖最後更新於 565afe8（2026-10-04），第 9 階段的畫面變動尚未反映；需要 Linux 環境重拍，這裡做不到"
  - test: "Andy 核准各計畫自主做的決定（09-10 handoff 的「decisions to approve」清單）"
    expected: "Andy 認可或改判"
    why_human: "使用者睡覺中，核准權不在驗證者"
---

# Phase 9: Section Modules 段落模組 Verification Report

**Phase Goal:** 段落變成可拖曳排序、可調整高度的模組，搭配結構化標籤、段落顏色、字數統計與 Undo/Redo；AI 候選詞可以直接拖進歌詞裡。
**Verified:** 2026-10-23
**Status:** human_needed
**Re-verification:** No, initial verification
**Mode note:** ROADMAP 標示 `mode: mvp`，但 Phase goal 不是 "As a ... I want ... so that ..." 格式（驗證依既有 goal-backward 方法進行，未套用 User Flow Coverage 表）。

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | 段落可用滑鼠或手指縱向拖曳排序、拖拉調整高度，舊拖曳 bug 不再出現 | VERIFIED | 舊 HTML5 `draggable`／`ondragstart`／`dragover` 在 js/lyrics.js、js/sections.js、index.html、css 中 grep 無殘留。新實作為 Pointer Events：`lhSecDragBegin/Tick/End/Move/Up/Cancel`、`lhSecMoveTo`（sections.js:115-304）、Alt+上下鍵 `lhSecMoveBy`、底邊拉桿 `lhSecSetHeight`（sections.js:319+，雙擊還原、方向鍵微調）。`.section-handle` 在 css/panels.css:1347、1363 設 `touch-action: none`。高度存進模型（`lhSecFields` 驗 4-60 rem，safety.js `lhNormalizeSong` 備份匯入也走 `lhSecFinalize`）。tests/sections-drag.spec.mjs（24 個 test）本次重跑通過。 |
| 2 | 左鍵點標籤循環 Intro/Verse/Pre-Chorus/Chorus/Inter/Bridge/Outro/Custom，同類型依排序自動羅馬數字；右鍵開 color picker 改色 | VERIFIED | `LH_SEC_TYPES` 八種順序與 ROADMAP 完全一致（sections-core.js:8）。點擊 handler 以 `LH_SEC_TYPES[(indexOf+1) % length]` 循環並走 `lhSecApply`（sections.js:572-577）。`lhSecNames`＋`lhToRoman` 單一不編號、兩個以上編號、Custom 不編號（sections-core.js:66-77）。`contextmenu` 事件開 `#sectionMenu`（sections.js:846-852），內含 8 色、自訂色、無顏色，色值以 `/^#[0-9a-f]{6}$/` 檢查後才寫入（`lhSecMenuColor`）。tests/sections-core.spec.mjs＋sections-ui.spec.mjs（顏色：右鍵選色／自訂色／三種主題對比）通過。 |
| 3 | 文字編輯與段落新增、刪除、排序、改標籤都能 Undo/Redo | VERIFIED | js/undo.js：每首歌一條歷史（最多 100 步），打字連續合併（1 秒）、組字確認算一步。所有結構動作經 `lhSecApply` 內的 `lhHistCommit`：add（lyrics.js:120）、remove（sections.js:100）、move（:123）、type（:576）、顏色／名稱（`_lhMenuSet`）、insert（word-drag.js:369）。↶ ↷ 按鈕、Cmd/Ctrl+Z、Shift+Z／Ctrl+Y、`beforeinput historyUndo` 都接上。組字中拒絕（CR-01 已修）。tests/undo.spec.mjs（21 個）通過。 |
| 4 | 每個段落顯示字數，編輯時即時更新 | VERIFIED | `lhCountWords`（sections-core.js:96，漢字／假名／韓文／注音各算 1，英數串算 1）。`lhSecCountOne`／`lhSecCountAll` 寫入 Text node；輸入事件（lyrics.js:259、267）、拖詞插入（word-drag.js:376）、復原（undo.js:124）都呼叫。含「共 N 字」總計與組字中不跳動測試（sections-ui.spec.mjs「字數：…」5 個 test）。 |
| 5 | AI 候選詞卡拖到歌詞指定位置就插入（手機長按啟動），單純點擊不插入 | VERIFIED | js/word-drag.js：`pointerdown` 只進入 `pending`，移動超過門檻才算拖；觸控以計時器長按（`LH_WD_HOLD_MS`）啟動，`_lhWdUp` 在 `state !== 'dragging'` 時視為普通點擊不插入；放開時用 `lhCaretIndexAt` 算出游標索引，經 `lhSecApply('insert')` 寫入模型（一步可復原）並更新字數。tests/word-drag.spec.mjs 24 個，含「點擊不插入」「手指長按後拖」「先滑動就是捲動」「長按不跳回報選單」「組字中放開不插入」「手機自動切到歌詞」。字卡也能拖（超出需求，無害）。 |

**Score:** 5/5 truths verified (0 present, behavior-unverified)

沒有 behavior-dependent truth 只靠符號存在就過關：復原、組字守衛、點擊不插入、Esc／中斷取消都有對應的行為測試且本次重跑全綠。

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `js/sections-core.js` (101 行) | 類型、推斷、編號、欄位整理、字數 | VERIFIED | 實質內容，被 songs.js／safety.js／sections.js 呼叫，index.html:451 載入 |
| `js/sections.js` (942 行) | 動作入口、拖曳、高度、設定選單、字數 | VERIFIED | 實質，index.html:457 載入 |
| `js/undo.js` (184 行) | 歷史堆疊與快捷鍵 | VERIFIED | 實質，index.html:453 載入 |
| `js/word-drag.js` (412 行) | 詞卡／字卡拖曳插入 | VERIFIED | 實質，index.html:472 載入 |
| `tests/sections-core|ui|drag.spec.mjs`、`undo.spec.mjs`、`word-drag.spec.mjs`、`drag-lib.mjs` | 自動驗證 | VERIFIED | 115 個 test 本次重跑 115 passed |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| 所有結構動作 | 歷史／存檔／畫面 | `lhSecApply` → `lhHistCommit` → `markDirty`＋`flushSongs` → `lhSecRefreshMeta` | WIRED | 單一入口，sections.js:33-49 |
| 輸入事件 | 模型／歷史／字數 | lyrics.js input/compositionend → `lhHistTyping`＋`lhSecCountFrom` | WIRED | lyrics.js:259-268 |
| 讀檔／備份匯入 | 欄位整理 | `lhNormalizeSong` → `lhSecFinalize` | WIRED | safety.js:616 |
| 詞卡 pointerdown | 歌詞模型 | `_lhWdUp` → `_lhWdDrop` → `lhSecApply('insert')` | WIRED | word-drag.js:341-388 |
| 復原按鈕／快捷鍵 | `lhHistUndo/Redo` | click／keydown(capture)／beforeinput | WIRED | undo.js:147-184 |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real Data | Status |
|----------|------|--------|-----------|--------|
| 段落名稱按鈕 | `s.label` | `lhSecFinalize` 由模型 type／custom 計算 | 是 | FLOWING |
| 段落字數 | `n` | `lhCountWords(s.text)`，s.text 來自使用者輸入 | 是 | FLOWING |
| 段落顏色／高度 | `s.color`／`s.height` | 模型，經 `lhSecFields` 驗證，隨歌曲存檔 | 是 | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 五支本階段 spec | `npx playwright test tests/sections-core.spec.mjs tests/sections-ui.spec.mjs tests/sections-drag.spec.mjs tests/undo.spec.mjs tests/word-drag.spec.mjs --workers=4` | 115 passed (40.9s) | PASS |
| 全套（orchestrator 於 HEAD 4ceb60e 提供） | `npm test` | 847 passed, 27 skipped, 0 failed | PASS（未自行重跑，採用 orchestrator 的陳述） |

### Probe Execution

此階段無宣告 probe 腳本。SKIPPED。

### Requirements Coverage

PLAN frontmatter 宣告的 ID 聯集：EDIT-05（01,02,08,10）、EDIT-06（02,08,10）、EDIT-07（03,10）、EDIT-03（04,05,06,08,09,10）、EDIT-02（06,07,10）、AI-06（09,10）。與任務指定的 6 個 ID 完全一致，無缺漏、無孤兒。REQUIREMENTS.md 追蹤表中 Phase 9 的 ID 也只有這 6 個（EDIT-04 屬 Phase 8）。

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|--------------|-------------|--------|----------|
| EDIT-02 | 06, 07, 10 | 段落可縱向拖曳排序、調高，桌機與觸控 | SATISFIED（實機手感待人工） | Truth 1 |
| EDIT-03 | 04, 05, 06, 08, 09, 10 | Undo/Redo 涵蓋文字與段落操作 | SATISFIED | Truth 3 |
| EDIT-05 | 01, 02, 08, 10 | 結構化標籤、羅馬數字編號 | SATISFIED | Truth 2 |
| EDIT-06 | 02, 08, 10 | 左鍵循環、右鍵 color picker | SATISFIED | Truth 2 |
| EDIT-07 | 03, 10 | 段落字數統計 | SATISFIED | Truth 4 |
| AI-06 | 09, 10 | 候選詞卡拖曳插入，只支援拖曳，行動端長按 | SATISFIED（實機手感待人工） | Truth 5 |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| 本階段修改的 js 檔 | - | `TBD`／`FIXME`／`XXX` grep | none | 乾淨（唯一命中是 sections-core.js:35 的註解文字 `XXXIX`，是羅馬數字，不是債務標記） |
| js/undo.js:153 | IN-01 | macOS 上 Ctrl+Y 被當重做 | Info | 09-REVIEW 已記錄，不阻擋 |
| js/sections.js:846-853 | IN-03 | 以座標 (0,0) 判斷鍵盤觸發的 contextmenu | Info | 已記錄 |
| js/undo.js:9／word-drag.js:51-89 | IN-04 | 已刪歌曲的歷史不釋放；鏡像例外時可能殘留 | Info | 已記錄 |
| js/word-drag.js:114-129 | IN-05 | pointercancel 後 swallow 旗標可能殘留到下次 pointerdown | Info | 已記錄 |
| js/undo.js:108-127 | IN-06 | 同形狀復原發生在收合段落時無回饋 | Info | 已記錄 |
| js/undo.js:76 | IN-07 | 組字中按 ↶ ↷ 無任何回饋 | Info | 已記錄 |

09-REVIEW.md（迭代 2）：Critical 0、Warning 0、Info 7，狀態 clean；09-REVIEW-FIX.md 的 6 項（CR-01、WR-01..05）皆有對應 commit 與 spec。我另外讀了 undo.js 與 sections-core.js 的現況，確認修正（組字守衛、`_LH_UNDO_SCOPE` 排除選單、`h.present` 重新快照、羅馬數字白名單正則）都在程式碼裡。

另外觀察（非本階段缺口）：高度與收合刻意不進復原歷史（設計決定，undo.js 檔頭註明），復原時保留「現在」的值。

### Human Verification Required

見 frontmatter `human_verification`。摘要：

1. **實機觸控手感**（iPad／iPhone Safari、Android Chrome）：段落把手拖曳、詞卡長按拖曳、列表仍可捲動。ROADMAP 明列的 Human check。
2. **iPhone 打字後按 ↶ ↷、搖一搖復原**：鍵盤不收。
3. **8 個段落色在晝夜主題的可讀性與美觀**。
4. **WR-03 復原游標手感**。
5. **-linux 截圖基準重拍**：-linux 圖停在 2026-10-04（565afe8），-darwin 圖在 d89498a 更新過；Linux／CI 上的視覺測試很可能因第 9 階段的新版面而失敗。這是環境限制（本機為 macOS），不是程式缺陷，但在視為完全收尾前需要處理。
6. **Andy 核准 09-10 handoff 中「自主決定」清單**。

### Gaps Summary

沒有功能缺口。五條 ROADMAP 成功條件都在程式碼中有實質實作、接線完整、有行為測試且本次抽驗全綠；六個需求 ID 全部有計畫認領，無孤兒。因為 ROADMAP 明定需要實機觸控驗證、-linux 基準圖尚未更新、且自主決定需 Andy 核准，狀態為 `human_needed`，不是 `passed`。

---

_Verified: 2026-10-23_
_Verifier: Claude (gsd-verifier)_
