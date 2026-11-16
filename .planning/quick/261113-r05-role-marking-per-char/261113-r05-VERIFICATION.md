---
phase: quick-261113-r05
verified: 2026-11-13T00:00:00Z
status: passed
score: 8/8 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification: false
---

# quick-261113-r05 角色標記 Part A 驗證報告

**Goal:** 每首歌角色清單（≤8）、逐字標記並依游標位置平移、進復原歷史、鏡像層顏色與韻腳並存、浮動列「指定角色 ▸」＋選單、版本 0.96.30、已 push。
**Status:** passed
**Re-verification:** No

## 實測證據（自己跑的，不是 SUMMARY 的說法）

| 檢查 | 指令／方法 | 結果 |
| --- | --- | --- |
| 指定的兩支 spec | `npx playwright test tests/roles-core.spec.mjs tests/roles.spec.mjs --reporter=line` | 50 passed |
| 相關回歸 | sections-cols、split-tags、sections-audit、line-audit、undo、word-drag、move-selection、songs-backup、songs-model、line-analysis-ui、line-journey、rhyme-map-ui、style、layout、scan | 369 passed、3 failed；3 個失敗（rhyme-map-ui 鏡像對齊逐像素、scan catch、sections-audit 沒有新增動畫）都在計畫的 base 既有允許清單內 |
| 重複字邊界（獨立 node:vm） | 直接載入 js/sections-core.js 呼叫 lhMarksShift | 「愛愛」[1,2) 在位置 1 打愛 → [2,3)；在終點打 → [1,2) 不變；「你你」游標 4 → [4,7)、游標 5 → [3,7)；「愛愛愛」刪首字／刪第二字結果與計畫相同 |
| 模糊測試（獨立） | 20000 組隨機單次取代，逐字追蹤真值，caret＝插入文字尾端 | 存活字元的角色標記 0 筆錯位 |
| 對比 ≥ 4.5 | 用實際主題色手算 8 個預設色（淺 24%、深 36% 混入） | 淺色最低 9.15、深色最低 6.47 |
| 沒有新動畫／catch | `git diff f2b1120` 新增行搜 `@keyframes\|transition\|animation`、`catch` | 皆無 |
| 版本 | index.html `?v=0.96.30` 41 個（base 40 個 ?v=0.96.29 ＋ roles.js），另 2 個雜湊 `?v=` 不動；0.96.29 在 index.html／rhyme-map.js 為 0；資訊面板「版本 v0.96.30 beta」；en-rhyme fetch 已改 | OK |
| push | `git ls-remote origin gsd/v0.96-stabilize` | 6c79039（本地 HEAD 相同），三個 commit 都在 |
| commit 範圍 | `git show --name-only` 三個 commit | 檔案清單與計畫逐項相符；handoff.md 維持未暫存（M） |

## Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | song.roles ≤ 8、壞值清理、舊歌不多欄位 | VERIFIED | lhRolesClean／lhMarksClean／lhSongRolesFix（sections-core.js）；`_normalizeSong`（songs.js:139）與 `lhNormalizeSong`（safety.js:644–654）共用；roles.spec「匯入清理」「舊歌不多欄位」通過 |
| 2 | 逐字 marks 半開區間、排序、不重疊、合併 | VERIFIED | `_lhMarksNorm`；單元測試與模糊測試 |
| 3 | 依實際編輯位置平移（重複字） | VERIFIED | 見上方獨立 vm 與模糊測試；所有改字路徑（lyrics.js:276、word-drag.js:372、sections.js:1102–1105）都先平移再寫文字；grep 全專案 `.text =` 沒有漏網寫入點 |
| 4 | 復原／重做還原標記，指定與清除各一步 | VERIFIED | undo.js `_sig` 含 s.marks；roles.spec 復原重做、桌機／觸控指定一步復原、清除一步復原 |
| 5 | 鏡像層角色淡底與韻腳並存、字形不動、深淺對比 | VERIFIED | `_lhMapBuildFrag` 的 rl 包裝、lhMapPaint 快取看 marks、CSS `.rhyme-mirror .rl`；roles.spec 字形位置 ≤0.5px、rhyme 全關仍上色、預設模式韻腳色塊保留；對比手算通過 |
| 6 | 浮動列「指定角色 ▸」在「移到段落 ▸」前，選單內容與滿 8 個提示 | VERIFIED | rhyme-map.js:1203 `bar.append(look, ai, an, rd, role, mv, row)`；roles.js 選單；rhyme-map-ui 觸控按鈕 ≥44px 測試仍通過；桌機＋觸控、無角色、滿 8、清除、Esc／點外面皆有測試通過 |
| 7 | 版本 0.96.30 | VERIFIED | 見上表 |
| 8 | 失敗為允許清單子集、已 push | VERIFIED | 見上表（本次只跑相關子集，三個失敗皆在允許清單；全套 1151 通過之說明來自 SUMMARY，未自行重跑全套） |

舊的並排角色欄（cols／role）：此次沒有碰任何 cols 程式碼，tests/sections-cols.spec.mjs 通過，資料照常讀入與顯示。

## Anti-patterns

無 TBD／FIXME／XXX、無 innerHTML、無新增 catch。`sections.js` 的 `ponytail:` 註解標明已知限制（移到別段的字沒有標記），屬計畫內。

## 備註（非阻擋）

- 計畫 Task 3 的「≥ 42 個 ?v=」是計畫算錯（base 本來是 40 個，加 roles.js 為 41）；SUMMARY 已說明並以 41 為準，所有 script／link 標籤版本一致。
- `haiku_lyrics` 降級鏡像不含 roles／marks，是 SUMMARY 揭露的已知限制，不影響需求。
- 超過 LH_WD_BIG 的大段落不畫鏡像、角色色不顯示，為計畫明列的範圍外。

## Human verification

無必要項目。選單視覺好不好看、手機實機手感屬於一般驗收，可由 Andy 看 handoff.md 的是非題確認。
