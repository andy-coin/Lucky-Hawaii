# Phase 8: Songs & Editor Model 歌曲管理與資料模型 - Context

**Gathered:** 2026-10-10
**Status:** Ready for planning
**Mode:** Smart discuss（autonomous；Andy 事先授權「灰色地帶不要問、用推薦方案決定」，所有決定標為 Claude's Discretion，並列入 `.planning/驗收清單-精簡版.md` 的「自主決定」讓 Andy 事後否決）

<domain>
## Phase Boundary

歌詞改以資料模型為準（不再從畫面讀回），打字與注音組字不被重新渲染打斷；用類似 Google Docs 的側邊歌曲清單管理多首歌（顯示／隱藏、新增、切換、刪除、重新命名）；一首歌可匯出 TXT（預設）、PDF、Markdown 或一鍵複製；JSON 備份（全部歌曲＋設定）可在另一台裝置完整還原。舊版只有一首歌的使用者升級後，原歌詞自動成為第一首、一字不少。

涵蓋：EDIT-01、EDIT-04、EDIT-08、EDIT-09。主要檔案：`js/state.js`、`js/lyrics.js`、`js/safety.js`（第一個真遷移 1→2）、`js/ai-generate.js`／`js/ui-common.js`（讀目前這首歌的歌詞、標籤、情境）、`index.html`、`css/`。

不在本 phase（Phase 9）：段落拖曳排序與調整高度、Undo／Redo、結構化段落標籤與羅馬數字編號、標籤顏色、段落字數統計。本 phase 的段落外觀維持現狀，只換掉底層資料流。也不做雲端同步、歌曲資料夾、歌曲拖曳排序、版本歷史。
</domain>

<decisions>
## Implementation Decisions

### A. 資料模型與遷移（資料安全最優先）
- **A1 新格式：** 新鍵 `lh:songs`（陣列，每首 `{ id, title, sections:[{ id, label, text, collapsed }], hashtags:[], context:'', createdAt, updatedAt }`）與 `lh:activeSong`（目前這首的 id）；兩個鍵都登記在 `js/safety.js` 的鍵清單（group: data／setting），讀寫一律走 `lhGet／lhSet`。
- **A2 遷移 1→2：** 用既有的 `LH_MIGRATIONS` 機制（`LH_SCHEMA_TARGET` 改 2）。把舊 `haiku_lyrics`（段落）、`haiku_hashtags`、目前畫面上的情境文字（舊版沒存，遷移時為空字串）組成第一首歌，標題「我的第一首歌」。遷移前一定先有備份（既有 `lhBootSafety` 流程）；遷移要 idempotent：`lh:songs` 已存在就不再做。**舊鍵 `haiku_lyrics`／`haiku_hashtags` 本 phase 不刪**（保留給降版與備份還原），但升級後不再寫入。
- **A3 開機順序：** 主程式第一次讀歌詞前 `await window.__hoyunSafetyReady`（STATE 待辦 WR-03 剩餘）；遷移失敗時照既有機制自動還原並維持舊版行為，不讓使用者看到空白歌詞。
- **A4 每首歌各自的：** 段落、#標籤、情境描述（情境改為會存檔，修掉舊版重新整理就消失的問題）。**全域共用的：** 保留池（saved words）、偏好設定、詞庫包。
- **A5 多分頁：** 監聽 `storage` 事件；別的分頁改了歌曲清單或某首歌時，若本分頁的編輯框沒有焦點就重新載入畫面，有焦點則等失焦後再更新，並 toast「其他分頁更新了歌詞，已重新載入」。同一首歌兩邊同時打字時，以最後存的為準（單人工具，接受）。

### B. 編輯器資料流（EDIT-01）
- **B1 資料為準：** 打字時只更新記憶體裡那一段的 `text`（用段落 id 對應，不靠畫面順序），不重新渲染任何 textarea；只有結構變動（新增／刪除／收合段落、切換歌曲）才重畫。
- **B2 存檔時機：** 輸入後延遲 300 毫秒存；`compositionend`、失焦、切換歌曲、`pagehide`／`visibilitychange` 時立刻存，確保關分頁不掉字。組字中（`compositionstart`～`compositionend`）不做任何會動到 DOM 的事。
- **B3 跳脫：** 段落文字、標籤、歌名一律用 DOM 屬性（`.value`／`textContent`）放入，不再用字串拼進 HTML（修掉舊版 `${s.text}` 直接塞進 textarea 的注入問題）；`renderSavedWords` 也一併改成跳脫（STATE 待辦）。
- **B4 外觀不變：** 段落的樣子、收合、標籤雙擊改名、刪除前確認都維持現狀；Phase 9 才重做段落模組。

### C. 側邊歌曲清單（EDIT-04）
- **C1 位置：** 在歌詞面板（桌機左側面板、手機／平板「歌詞」分頁）頂端加一顆「☰ 歌曲」按鈕，打開歌曲清單：桌機在歌詞面板內左側滑出一欄，手機在歌詞分頁內由上方展開覆蓋；顯示／隱藏狀態存成 UI 鍵 `lh:songListOpen`（登記）。歌詞面板標題列顯示目前歌名。
- **C2 新增：** 「＋ 新歌」建立「未命名歌曲 N」（N 取下一個可用數字），內含一個空段落，並切換過去、歌名進入可編輯狀態。
- **C3 重新命名：** 清單裡每首歌有 ✎；點 ✎ 或雙擊歌名進入編輯，Enter 或失焦存檔，Esc 取消；空白歌名退回原名；歌名最長 60 字。
- **C4 刪除：** 每首歌有 🗑；確認視窗「刪除「{歌名}」？這首歌的歌詞會一起刪除（刪除前會自動備份，可從備份還原）」；確認後先 `lhBackup` 再刪。刪掉最後一首時自動建立一首空的新歌，畫面永遠有一首歌。
- **C5 排序：** 依建立時間，新的在上；本 phase 不做拖曳排序。目前這首歌在清單中高亮。
- **C6 AI：** AI 建議與情境讀「目前這首歌」的歌詞、#標籤、情境。

### D. 匯出（EDIT-08）
- **D1 入口：** 歌詞面板標題列「⬇ 匯出」按鈕，選單：TXT（預設，第一項）／Markdown／PDF（列印）／複製整首。
- **D2 TXT 格式：** 第一行歌名、空一行；每段先一行「[段落名]」再接歌詞；段落之間空一行；UTF-8；檔名 `{歌名}.txt`（不合法字元換成 `_`）。
- **D3 Markdown：** `# 歌名`、每段 `## 段落名`、歌詞每行保留換行（行尾兩個空格）；檔名 `{歌名}.md`。
- **D4 PDF：** 不加任何套件，用瀏覽器列印（列印專用樣式表：只印歌名與各段落、黑字白底、段落名粗體、不印按鈕與面板），提示「在列印視窗選『儲存為 PDF』」。
- **D5 複製整首：** 複製 TXT 格式；`navigator.clipboard.writeText` 失敗時退回選取文字的舊方法；toast「已複製整首」。

### E. 備份與還原（EDIT-09）
- **E1 格式：** JSON `{ format: 'lucky-hawaii-backup', version: 2, exportedAt, songs, activeSong, savedWords, settings }`；`settings` 包含所有登記為 setting 的鍵（輸入模式、主題與客製顏色、詞庫包、AI 模型偏好等）與 `dictOverrides_v076`；不含 UI 收合狀態。用既有 `lhSnapshot` 的登記鍵清單產生，不另寫一份鍵名清單。
- **E2 入口：** 標題列既有的 SAVE／LOAD 改為「備份全部」「匯入備份」（文字維持短，aria-label／title 寫清楚）；檔名 `LuckyHawaii-備份-{日期時間}.json`。
- **E3 匯入：** 先檢查格式；顯示摘要「這份備份有 N 首歌與你的設定」，兩個選擇：「全部還原（取代目前資料）」與「只加入歌曲」；取代前自動 `lhBackup` 目前資料；只加入時 id 重複就換新 id、歌名重複加「（匯入）」。
- **E4 舊存檔相容：** 舊版 SAVE 產生的 v1 檔（`lyricsSections`＋`hashtags`＋`savedWords`＋`contextDescription`）仍可匯入，變成一首新歌（保留池合併去重）。
- **E5 壞檔：** 格式不對、版本太新、JSON 壞掉都只顯示白話錯誤，不改動任何資料。

### F. 研究後補充決定（2026-10-10，回應 08-RESEARCH.md Open Questions；同為 Claude's Discretion）
- **F1（OQ1）** 自動備份：`baseline` 與 `pre-schema-*` 兩種備份釘住、永遠不被輪替擠掉，其餘仍保留最新 3 份；`lhRestoreFromBackup` 還原時一併把 `lh:schema` 設回備份當時的版本。**做一個最小的「自動備份」清單**（放在偏好設定裡：列出每份備份的時間與原因，按「還原這份」前先確認並先備份目前資料），讓刪除歌曲視窗的「可從備份還原」是真的。
- **F2（OQ2）** 遷移被擋或還原失敗時進入「舊版單首模式」：只有一首歌、寫回舊鍵、隱藏歌曲清單，資料不受影響。
- **F3（OQ3）** 遷移出的第一首歌情境為空字串。
- **F4（OQ4）** 同一首歌兩個分頁同時改：最後存的為準；不同首歌各改各的要「寫入時合併」（存檔前重讀 `lh:songs`，只替換本分頁改過或刪除的歌）。
- **F5（OQ5）** 存檔失敗橫幅的「匯出備份」字樣改為「備份全部」。
- **F6（OQ6）** 列印樣式只在「匯出 PDF」流程中生效（加在 body 的暫時 class），平常按 Cmd/Ctrl+P 仍印出正常畫面（微調 UI-SPEC D-12）。
- **F7（OQ7）** 舊版 v1 存檔匯入的歌名「匯入的歌曲」，重名加「（匯入）」。
- **F8（OQ8）** 備份檔大小上限 5 MB。
- **F9（OQ9）** `lh:activeSong` 歸在 data 群組。
- **F10（OQ10）** 新檔：`js/songs.js`、`js/song-io.js`、`css/print.css`；備份的產生與套用（`lhBuildBackup`／`lhApplyBackup`）放在 `js/safety.js` 裡。
- **F11（安全）** 備份匯出排除所有標記為機密的鍵（如 API 金鑰）；匯入只接受登記鍵清單上的設定（白名單，不整包覆蓋），並限制 id、長度、數量；把仍用字串拼 HTML 的 `removeHashtag`、`copyWord` 等改成安全寫法（匯入的資料可能被動過手腳）。
- **F12** #標籤 視窗組字中按 Enter 不送出（研究抓到的現有錯誤）。

### Claude's Discretion
- 以上 A～E 全部為 Claude 依專案慣例與既有決定選的推薦方案（Andy 授權不逐一詢問）。
- 視覺細節（清單寬度、動畫、圖示）由 UI-SPEC 決定，須符合 Phase 5 的 rem、44×44、晝夜／客製主題規則與 Phase 7 的按鈕語彙。
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `js/safety.js`：`lhGet／lhSet／lhGetJSON／lhRemove`、登記鍵清單、`lhSnapshot`、`lhBackup`、`lhListBackups`、`lhRestore`、`lhMigrate`、`LH_MIGRATIONS`、`LH_SCHEMA_TARGET`（註解已寫明 Phase 8 多首歌是 1→2）、`window.__hoyunSafetyReady`、存檔失敗橫幅。
- `js/lyrics.js`：`saveLyrics`（目前從 DOM 讀回——要改）、`renderLyricsSections`（字串拼 HTML、`${s.text}` 未跳脫——要改）、`addLyricsSection`、`removeLyricsSection`（含刪除確認）、段落拖曳 handler（Phase 9 再動）、`exportSession`／`importSession`（v1 格式，改為 v2 備份並相容 v1）。
- `js/state.js`：`lyricsSections`、`hashtags` 全域狀態的初始讀取。
- `js/ai-generate.js:77`、`js/ui-common.js:89`：讀 `#contextDescription` 與 `hashtags`。
- `js/panels.js` `renderSavedWords`：未跳脫（本 phase 一併修）。

### Established Patterns
- 動到 `css/` 或 `js/` 時所有 `?v=` 一起加（目前 0.96.11；split-tags 測試）。
- 新儲存鍵一律登記在 `js/safety.js`；測試有檢查未登記鍵。
- 使用者看得到的錯誤用白話 `showToast`／`lhWarn`；確認用既有對話框樣式。
- Phase 5：rem、44×44 觸控、`--hit`、晝夜／客製主題變數；Phase 7：`--action-*` 按鈕色、🚩 按鈕語彙。

### Integration Points
- 開機：`js/init.js`、`js/state.js` 在 `__hoyunSafetyReady` 之後才讀歌曲。
- 版面：`#leftPanel`（桌機）與手機「歌詞」分頁共用 `#lyricsSections` 容器。
- 測試：`tests/helpers.mjs` `bootPage`、`tests/safety*.spec.mjs`（遷移／備份測試慣例）、golden 快照。
</code_context>

<specifics>
## Specific Ideas

- Andy 要「像 Google Docs 一樣」的側邊分頁：清單可收起、一眼看到所有歌名、點一下切換。
- 舊版使用者升級不能掉任何一個字（Constraints: Data safety）。
- 注音輸入法組字是 Andy 最在意的打字體驗；實機手感列入 Andy 驗收。
</specifics>

<deferred>
## Deferred Ideas

- 雲端同步、多裝置自動同步 — 不做（純前端、免費額度）
- 歌曲資料夾／標籤分類、歌曲拖曳排序、版本歷史 — v2
- 刪除舊鍵 `haiku_lyrics`／`haiku_hashtags` — 新格式穩定一個版本後再清
- 段落拖曳、Undo／Redo、段落標籤結構化、字數統計 — Phase 9
</deferred>
