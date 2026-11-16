---
phase: quick-261113-s3k
verified: 2026-11-13T00:00:00Z
status: passed
score: 8/8 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification: false
---

# Quick 261113-s3k: 角色標記 Part B 驗證報告

**Goal:** 角色管理面板（新增／改名／改色／兩段式刪除並清掉所有標記，最多 8 個）、停用段落選單「並排角色欄」入口但保留舊資料、TXT／MD／複製／列印帶「[角色名]」、版本 0.96.31、已 push 到 gsd/v0.96-stabilize。
**Status:** passed（沒有 gap，沒有必須人工的項目）

## 獨立執行的證據

| 檢查 | 指令／做法 | 結果 |
|---|---|---|
| 目標 spec | `npx playwright test tests/roles-core.spec.mjs tests/roles.spec.mjs tests/sections-cols.spec.mjs --reporter=line` | 77 passed |
| 全套 | `rtk proxy npx playwright test --reporter=list` 跑一次 | 1176 passed, 29 skipped, 34 failed |
| 失敗標題 vs 允許清單 | 抽 `✘` 行、去掉 line:col 與時間、`sort -u`，與 34 行允許清單 `comm` | 多出 0、缺少 0；分組 golden 31、rhyme-map-ui「鏡像對齊：與文字框逐像素相同」1、scan「catch: 程式碼裡沒有吞錯的 catch」1、sections-audit「檢查：沒有新增動畫」1 |
| 基準對照 | 拋棄式 worktree 於 6c79039（LH_TEST_PORT=4311，已移除），只跑上述四個 spec | 失敗 34 個，標題與 HEAD 完全相同，所以全是既有失敗，不是這次造成 |
| 版本字串 | grep | index.html 有 41 個 `?v=0.96.31`；0.96.30 在 index.html 與 js/rhyme-map.js 都是 0；資訊面板「版本 v0.96.31 beta」；rhyme-map.js:156 en-rhyme `?v=0.96.31`；兩個 YouTube `?v=` 沒動（218、231 行） |
| push | `git rev-parse HEAD origin/gsd/v0.96-stabilize` | 兩者都是 5d64a21 |
| 每個 commit 的檔案 | `git show --name-only` | 24159aa 5 個檔、6eefbf0 6 個檔、5d64a21 4 個檔，與計畫一致，沒夾帶 handoff.md |
| 取代用的守門 | 自 6c79039 起新增行 | 無 `@keyframes`／`transition`／`animation`；js 新增行無 `catch`；panels.css 新增行無 `:hover` |

## Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | 工具列「韻腳 ▾」後有「角色 ▾」#roleMenuBtn，面板列出角色（色點、名稱、刪除、8 色票＋自訂色）；滿 8 個「＋ 新角色」aria-disabled 並提示「最多 8 個角色」 | VERIFIED | index.html:402 按鈕在 #rhymeMenuBtn 後；roles.js:263-301 `_lhRolePanelFill`；roles.js:205-207 滿 8 個 toast，另有 `lhRoleAdd` 在 8 個回 null 的第二道防線；測試「面板：滿 8 個」通過 |
| 2 | 改名即時存檔、清空變回「角色 n」；改色立刻生效；兩段式刪除會清掉所有段落的該角色標記，其他標記與歌詞不變，重做／再復原帶不回來 | VERIFIED | roles.js:178-196 改名與 commit、`_lhRoleSetColor` 先驗 `LH_SEC_COLOR_RE`；roles.js:304-327 `lhRoleDelete` 換新 roles 陣列→`lhSongRolesFix`→flush→`h.present=_snap`、`h.future.length=0`→lhRolesRefresh→lhMapRenderAll。測試「刪除要按兩下…復原不會帶回」「刪除重做堆疊被清掉」通過，斷言標記 [3,6,r-f]／無 marks／[1,3,r-f]、歌詞不變 |
| 3 | 手機可用：按鈕觸控下限、不溢出（含 150%）、8 個角色面板在可見範圍內可捲動；Esc／點外面／再按收起；同時只開一個浮層 | VERIFIED | 手機測試與 Esc／點外面／互斥測試通過。按鈕與「韻腳 ▾」同 class `rhyme-menu-btn`，高度規則一致（--hit，這是計畫刻意選擇，不當缺陷）。`lhMapCloseAll` 已加 `lhRolePanelClose` |
| 4 | 段落選單不再有「＋ 並排角色欄」；舊 cols／role 照樣讀取、顯示、存檔、匯出為【男】…【女】…；欄內 ＋／× 與刪欄復原照常 | VERIFIED | sections.js 入口、lhSecMenuSync 三行、lhSecOpenMenu 一行都是註解（附說明），沒刪；lhSecAddCol 仍被欄內 ＋ 使用（sections.js:651）；樣式與建欄程式碼沒動。sections-cols 兩個測試通過（種舊資料、選單 `.section-col-menu`／`.section-col-block` 數量 0、匯出【男】【女】、刪欄、復原、重載） |
| 5 | TXT／MD／複製在角色轉換處加「[角色名]」，空白同角色不重複標，前導空白留在標籤前，無標記歌逐字不變，並排欄段落照舊 | VERIFIED | sections-core.js:202-234 `lhMarksParts`／`lhMarksTagText`；song-io.js `songExportSections` 只在有 marks 且沒有 cols 時分段；roles-core 單元測試與 roles.spec 匯出測試（withRoles、plain、舊欄＋標記）通過 |
| 6 | 列印：`span.print-role`／粗體 `span.print-role-tag`，顏色與黑色 60%／40% 混合，8 預設色在白紙上對比 ≥ 4.5；文字內容同 TXT；無標記照舊 | VERIFIED | song-io.js `printRoleText`（textContent／createTextNode）；print.css 特異度 (1,2,1) 蓋過黑字規則。我獨立以 sRGB 60% 混黑算 WCAG 對比：#e05d5d 7.96、#4a7fd4 8.55、#48a868 6.94、#e98a3c 6.23、#8d6bd0 8.69、#2c9fa0 7.33、#d2649a 7.81、#d69e2e 5.88，全部 ≥ 4.5；roles.spec 的列印對比測試通過 |
| 7 | 版本 0.96.31 | VERIFIED | 見上表（41／0／資訊面板／en-rhyme／YouTube 不動） |
| 8 | 全套失敗是 34 個允許清單子集；三個 commit 已 push | VERIFIED | 見上表，集合完全相等，基準 worktree 也印證；HEAD 等於 origin/gsd/v0.96-stabilize |

**Score:** 8/8（0 個 behavior-unverified：刪除、重做、對比、列印等狀態行為都有實際跑過的測試）

## Anti-Patterns

無。新增行沒有 TBD／FIXME／XXX；只有一則刻意的 `ponytail:` 註解說明已知限制。沒有 innerHTML，使用者文字只走 textContent、createTextNode、`.value`。

## 已知限制（計畫已接受，非缺陷）

- 角色的新增／改名／改色／刪除不進復原歷史（Part A 既有限制）。刪除前記下的舊復原步驟，仍可能還原出已刪角色的標記，但畫面與匯出都不認，下次載入時 `lhSongRolesFix` 會丟掉。
- 舊並排欄段落匯出為【角色】行，不加 [角色名]。
- `-linux` 視覺基準仍是 Andy 的待辦。

## 非阻擋的備註

- 實體紙張的列印預覽沒人眼看過；顏色與對比是用計算值驗證，不影響通過。
- 驗證報告未產生 `covered_digest` 指紋（沒有執行 `verification.fingerprint`），僅作快速任務驗證。

_Verified: 2026-11-13_
_Verifier: Claude (gsd-verifier)_
