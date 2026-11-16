---
phase: quick-261113-lha
verified: 2026-11-13T00:00:00Z
status: passed
score: 8/8 must-have truths verified
behavior_unverified: 0
gaps: []
---

# Quick 261113-lha: 桌機寬螢幕吸附版面 Verification Report

**Goal:** 寬螢幕（>=1600 且滑鼠）歌詞／查詢／AI 三塊 VS Code 式吸附分割；其餘裝置不變，既有功能不壞。
**Commits checked:** 66a14c9, d28e3ce, 093e630, b7ec2c0 on base ddcfbad
**Re-verification:** No

## 實跑證據

| 項目 | 指令 | 結果 |
|---|---|---|
| dock 專屬測試 | `npx playwright test tests/dock.spec.mjs --reporter=line` | 24 passed (5.0s) |
| HEAD 全套件 | `npx playwright test`（port 4310） | 1090 passed / 34 failed |
| Base ddcfbad 全套件（throwaway `git worktree add --detach`，port 4311，已移除） | 同上 | 1067 passed / 33 failed |

## 34 個失敗是否為既有問題

- 失敗清單比對：base 的 33 項是 HEAD 34 項的子集，其中 golden.spec x30、scan.spec「沒有吞錯的 catch」、sections-audit「沒有新增動畫」完全相同。
- scan.spec 的吞錯位置在 base 與 HEAD 都是 `js/rhyme-map.js:1638`、`js/rhyme-map.js:1644`，沒有任何 `js/dock.js` 位置，所以 dock.js 沒有帶進新的吞錯 catch。
- 第 34 項 `rhyme-map-ui.spec.mjs:280 鏡像對齊` 在 base 的整套件那次剛好通過，但單獨重跑 base 3 次都失敗、HEAD 3 次也都失敗，屬於不穩定的既有問題（與負載／環境有關），不是這次變更造成。
- 結論：executor 的 34 項既有失敗說法成立。dock 變更沒有新增失敗。

## Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | >=1600 且滑鼠：三塊並排填滿、不重疊、在畫面內 | VERIFIED | `LH_MQ_DOCK` 在 js/layout.js；dock.js `lhDockRender` 算矩形；測試「三欄」通過 |
| 2 | 窄螢幕／觸控／sheet 無 dock class，版面不變 | VERIFIED | CSS 全部掛在 `body.dock` 之下；panels.js 只多一個 `!lhIsDockMode()` 守衛；「不啟用與切換」測 1440、縮放來回、1920 觸控皆無 dock；其餘既有測試無新增失敗 |
| 3 | 拖標題列：預覽框、邊緣分割、中間互換、Esc 取消 | VERIFIED | dock.js `_dkDrop`／`_dkZone`／`_dkPreviewRect`、pointerdown 流程；四個拖放測試通過 |
| 4 | 只允許五種版型，其他落點不預覽、不變 | VERIFIED | `LH_DOCK_SHAPES` 白名單 7 個簽名；`_dkDrop` 單元測與「不支援落點」測通過 |
| 5 | 拖分隔線兩側同時縮放、第三塊不動、最小 20rem／12rem | VERIFIED | `_dkResizeStart`；「+120」與「最小寬度 20rem」測通過 |
| 6 | lh:dock 存檔、壞值回預設、「重設版面」只在 dock 顯示 | VERIFIED | `_dkValid` 驗形狀／id／重複／權重／白名單；`lhGetJSON(..., _dkValid)`；safety.js 登記 `lh:dock`；5 種壞值測、存檔測、重設測通過；`body:not(.dock) #dockResetBtn {display:none}` |
| 7 | 收合分頁照用，收起時縮放保留位置 | VERIFIED | `_dkPrune`＋`_dkFrom` 把比例寫回 `_dkTree`；收 AI／兩邊收／收起時縮放測通過 |
| 8 | 歌詞大編輯器、段落選單、移到段落、韻腳地圖在 dock 下正常；標題列按鈕仍是點擊 | VERIFIED | `LH_DOCK_NODRAG` 排除按鈕；編輯器、段落選單、移到段落、韻腳地圖（含縮放後鏡像同框）、「標題列按鈕仍是點擊」測通過；每個測試都 `expect(errors).toEqual([])`，dock 模式下無 console 錯誤 |

**Score:** 8/8

## Artifacts / Wiring

| Artifact | Status | Details |
|---|---|---|
| js/dock.js（344 行） | VERIFIED | 實作完整、無 stub、無 TODO／FIXME |
| js/layout.js `lhIsDockMode` / `LH_MQ_DOCK` | VERIFIED | 並且 `setUiScale` 之後重畫 dock（有 typeof 守衛） |
| js/panels.js → `lhDockRender` | WIRED | `syncCenterPanel` 結尾呼叫；`LH_MQ_DOCK` change 監聽也進 `syncCenterPanel` |
| css/panels.css `body.dock` 區段 | VERIFIED | 吃 `--dk-*`；`absolute` 避免堆疊層問題 |
| js/safety.js `lh:dock` | VERIFIED | LH_KEYS 25 個，scan.spec 數量斷言已同步更新 |
| index.html | VERIFIED | `js/dock.js?v=0.96.28` 在 panels.js 之後、rhyme-display 之前；`#dockResetBtn` 接 `lhDockReset()`；版號全為 0.96.28 |
| tests/dock.spec.mjs | VERIFIED | 24 個測試實跑通過 |
| tests/scan.spec.mjs、split-tags.spec.mjs | VERIFIED | 只改鍵數 24->25 與腳本順序加 dock，合理 |

## Anti-Patterns

dock.js 中沒有 TBD／FIXME／XXX；唯一的 `ponytail:` 註解是已知限制說明（收起期間做拖放重排會讓收起那塊回老家邊），與 plan 描述一致，非阻擋項。

## 備註（非阻擋）

- 背景動畫在被填滿時看不到是 D-05 已知限制，不在驗收範圍。
- 拖曳手感（預覽框動畫、游標）已用 Playwright 真實滑鼠事件驗過邏輯；視覺好不好看仍建議 Andy 在 1920 螢幕上實際拖一次，但這不影響通過判定。
- 主工作樹未被動過（未 stash／checkout／reset）；驗證用的 base worktree 已移除。

---
_Verified: 2026-11-13_
_Verifier: Claude (gsd-verifier)_
