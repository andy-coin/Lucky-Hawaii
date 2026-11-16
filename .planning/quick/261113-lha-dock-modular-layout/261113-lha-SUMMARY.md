---
phase: quick-261113-lha
plan: 01
subsystem: ui-layout
tags: [dock, layout, drag-drop, localStorage, playwright]
requires: []
provides:
  - "寬螢幕（>=1600 且滑鼠）三塊吸附分割版面：lhIsDockMode / lhDockRender / lhDockReset"
  - "lh:dock 存檔（v1 版面樹，壞值回預設）"
affects: [js/panels.js, js/layout.js, js/safety.js, css/panels.css, index.html]
tech-stack:
  added: []
  patterns: ["小版面樹（葉子＝區塊 id，節點 {d,k,s}）", "矩形寫 --dk-* CSS 變數、不搬 DOM"]
key-files:
  created: [js/dock.js, tests/dock.spec.mjs]
  modified: [js/layout.js, js/panels.js, js/safety.js, js/rhyme-map.js, css/panels.css, index.html, tests/scan.spec.mjs, tests/split-tags.spec.mjs]
decisions:
  - "啟用門檻 1600px＋hover:hover＋pointer:fine，單一常數在 js/layout.js LH_MQ_DOCK"
  - "三塊不搬 DOM，只寫 --dk-x/y/w/h；#mainContainer 用 absolute（fixed 會讓設定浮層被面板蓋住）"
  - "分隔線縮放把比例寫回存的樹（_dkTree）而非修剪副本，收起的區塊不丟位置"
  - "分隔線最小值只擋「再縮小」：起點本來就小於 20rem/12rem 時不硬跳"
metrics:
  duration: "約 1 小時"
  completed: 2026-11-13
status: complete
commits: 4
plan_head_before: ddcfbad50567b23867ca990ff5d45d6d4d548c99
plan_head_after: b7ec2c0b9233d24d8350ac3021627dd99f9d7c3b
actuals:
  tokens: 40000
  tasks: 3
  commits: 4
---

# Phase quick-261113-lha Plan 01: 寬螢幕吸附版面 Summary

桌機 >=1600px 加滑鼠時，歌詞、查詢、AI 三塊用「小版面樹」分割整個畫面：拖標題列分割／互換（含預覽框與五種版型白名單）、拖分隔線兩側同時縮放、版面存 `lh:dock`、設定→外觀「重設版面」；其他寬度與觸控裝置維持原本抽屜版面。

## Tasks

| Task | 內容 | Commit |
|------|------|--------|
| 1 | 斷點 helper、dock.js 版面樹／排版、panels.js 與 CSS 接線、?v=0.96.28、dock.spec (a)-(h) | 66a14c9 |
| 2 | 分隔線縮放、lh:dock 存檔／驗證、重設鈕、safety.js 登記（25 鍵） | d28e3ce |
| 3 | `_dkDrop`、標題列拖曳、預覽框、拒絕落點、Esc | 093e630 |
| 3（補） | 分隔線 hover 限滑鼠、split-tags 測試加入 dock.js | b7ec2c0 |

handoff.md 已覆寫（未 commit，依指示）。

## 驗證

- `tests/dock.spec.mjs`：24 個全過（三欄、收合重排、模式切換、編輯器、段落選單、移到段落、韻腳地圖、分隔線含收起時縮放與鏡像層、存檔、五種壞值、重設、`_dkDrop` 對照表、真滑鼠拖放／互換／拒絕落點／Esc）。
- `lyrics-editor.spec`、`move-selection.spec`、`scan.spec`（25 鍵）通過。
- 全套 `--reporter=dot`：見下方「全套結果」。
- `index.html` 有 40 個 `?v=0.96.28`，無舊版號；`en-rhyme.json?v=0.96.28`。

## 全套結果

全套未全綠，但剩下的失敗在動工前的 BASE（ddcfbad，throwaway worktree、port 4311）就已經失敗，不是本次造成：

- `tests/golden.spec.mjs` 30–31 個（卡片 HTML 雜湊與快照不符；BASE 同樣 30 個失敗，兩次全套各 30／31，差的一個是不穩定的）
- `tests/scan.spec.mjs` 「catch: 程式碼裡沒有吞錯的 catch」（js/rhyme-map.js:1638、1644）
- `tests/sections-audit.spec.mjs` 「檢查：沒有新增動畫」（transition 宣告數超過第 9 階段起點；本次 CSS 另加 2 個宣告，BASE 已超標）
- `tests/rhyme-map-ui.spec.mjs:280` 「鏡像對齊：與文字框逐像素相同」（第一次全套通過、第二次起單跑穩定失敗；BASE 單跑 2/2 也失敗，跟環境的捲軸截圖有關，跑在 1440 寬、dock 不啟用）

最後一次全套：1090 passed、34 failed（上列）、29 skipped。dock.spec 24 個全過。

BASE worktree 比較完已 `git worktree remove --force`，主工作樹從未 stash／checkout／reset／clean。

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 預覽框第一次出現會從左上角滑過來**
- 發現於：Task 3 測試（預覽位置量到動畫中途）
- 修正：從隱藏變顯示的那一刻先關 transition 直接放到位，之後換落點才有 0.12 秒位移動畫。測試改成等預覽到位再量
- Commit：093e630

**2. [Rule 1 - Bug] 分隔線 hover 規則違反「hover 只給滑鼠」測試**
- 修正：`@media (hover: hover) and (pointer: fine)`
- Commit：b7ec2c0

**3. [Rule 3 - 阻擋] tests/split-tags.spec.mjs 的 JS 順序清單沒有 dock.js**
- 修正：JS_ORDER 在 panels 後加 `dock`，訊息改 31 個
- Commit：b7ec2c0

**4. [測試調整] 「收起時縮放」重開後歌詞寬度改比權重比例斷言**
- 計畫寫「歌詞保持縮放後寬度 (±2)」，但 AI 展開時外框比收起時窄 24px（body 左右 padding 不同），像素寬度必然差幾 px。改斷言歌詞佔歌詞＋查詢區的比例不變（±0.005），並確認比縮放前寬 80px 以上。行為與計畫的意圖（保留位置與縮放比例）一致

**5. [Checker 備註 a] 分隔線 pointermove 每次從最新的 `_dkDivs` 取來源節點**，不握著舊參考（lhDockRender 可能在拖到一半重建）。

## Known Stubs

None.

## Threat Flags

None（新增面都在計畫的 threat_model 內：lh:dock 讀取經 `_dkValid` 白名單；CSS 只寫計算出的數字加 px）。

## Deferred / 已知限制

- 背景動畫被三塊蓋住（D-05，計畫已列為不處理）。
- 收起期間做拖放重排，收起那塊重開時回老家邊（ponytail 註解在 `lhDockRender`）。
- 需 Andy 實機驗收項目見 handoff.md（10 題是非題）。

## Self-Check: PASSED

- js/dock.js、tests/dock.spec.mjs 存在；commits 66a14c9、d28e3ce、093e630、b7ec2c0 皆在 `git log`。
