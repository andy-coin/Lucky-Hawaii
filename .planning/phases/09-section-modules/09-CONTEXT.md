# Phase 9: Section Modules 段落模組 - Context

**Gathered:** 2026-10-23
**Status:** Ready for planning
**Mode:** Autonomous smart discuss — Andy 睡覺中、授權不逐一詢問；以下全部是 Claude 依專案慣例與既有決定選的推薦方案（Claude's Discretion），事後由 Andy 在 UAT 一併確認

<domain>
## Phase Boundary

把 Phase 8 的段落區塊升級成「段落模組」：拖把手縱向排序（滑鼠＋手指）、拉底邊調整高度、結構化段落標籤（左鍵循環、同類型自動羅馬數字、右鍵／長按改顏色）、每段字數、整個編輯器的 Undo／Redo，以及把 AI 詞卡（與字卡）拖進歌詞指定位置插入。

不在本 phase：韻腳上色與任何押韻分析（Phase 10）、句構分析與設定頁（Phase 11）、自由座標白板式排版、歌曲清單拖曳排序。
</domain>

<decisions>
## Implementation Decisions

### A. 資料模型（向下相容、不升 schema）
- **A1** 段落物件加欄位：`type`（`intro|verse|prechorus|chorus|inter|bridge|outro|custom`）、`custom`（自訂名稱字串，只在 type=custom 時使用）、`color`（`#rrggbb` 或空字串＝預設）、`height`（rem 數字或 null＝自動）。既有 `id／label／text／collapsed` 保留。
- **A2** 不做 schema 3 遷移：讀到沒有 `type` 的段落時「延遲正規化」——依 `label` 推斷類型（英文名不分大小寫、去掉尾端數字／羅馬數字；中文：前奏→Intro、主歌→Verse、導歌／預副歌→Pre-Chorus、副歌→Chorus、間奏→Inter、橋段→Bridge、尾奏／結尾→Outro；預設名「歌詞」「新段落」→ Verse；其他一律 Custom 並把原名放進 `custom`）。原 `label` 文字不丟。
- **A3** `label` 繼續存「目前顯示名稱」（例如 `Verse II`、自訂名稱），每次結構變動後重算寫回——舊版程式、匯出 TXT／Markdown／PDF、備份檔都不必改就正確。
- **A4** 備份匯入（Phase 8 的白名單驗證）要接受新欄位並驗證：type 限清單、color 限 `#rrggbb`、height 限合理範圍（例如 4–60 rem）、custom 長度上限 40 字；不合格的欄位丟掉、段落照收。

### B. 段落標籤（EDIT-05、EDIT-06）
- **B1** 循環順序：Intro → Verse → Pre-Chorus → Chorus → Inter → Bridge → Outro → Custom → Intro。標籤用英文（與需求一致、作詞圈通用）。
- **B2** 編號：同類型「出現 2 次以上」才依目前排序加羅馬數字（Verse I、Verse II…）；只出現一次就只顯示類型名（Chorus）。Custom 不編號。拖曳排序、新增、刪除、改類型後立即重算。
- **B3** 左鍵（單擊／點一下）標籤按鈕＝切到下一個類型。標籤從「輸入框」改成「按鈕」，所以單擊不再有雙擊改名的衝突。
- **B4** 右鍵（桌機）／長按標籤（觸控，約 500ms）開「段落設定」小視窗：一排預設色票（8 色，晝夜兩套主題都清楚）＋原生 `<input type="color">` 自訂色＋「無顏色」；直接選類型的清單；Custom 的名稱輸入框（Enter／失焦存、Esc 取消、組字中 Enter 不送出）。視窗用既有 `lhPlaceMenu` 放置、Esc／點外面關閉。
- **B5** 顏色呈現：段落左側色條＋標籤按鈕淡色底（用 color-mix 調淡，文字對比仍達標）；無顏色＝現在的樣子。
- **B6** 新段落（＋）預設類型：依前一段推一個常見下一段（Verse→Pre-Chorus→Chorus→Verse…；不確定就 Verse）。新歌的第一段 Verse。

### C. 拖曳排序與調整高度（EDIT-02）
- **C1** 改用 Pointer Events＋明確的「⋮⋮ 拖把手」（在段落標題列左側），桌機與觸控同一套程式；拿掉現在標題列上的 HTML5 `draggable`（觸控不支援、會跟標籤輸入框與文字選取打架＝現有拖曳 bug 的根源）。
- **C2** 拖曳中：被拖的段落半透明、跟著指標走的位置顯示插入線；靠近捲動區上下緣自動捲動；Esc 取消；放開才寫進模型（一次 undo 步驟）。拖把手 `touch-action:none`、命中區 ≥ 44px，手指按住把手直接拖（不需長按）。
- **C3** 鍵盤／保底：拖把手可聚焦，Alt+↑／Alt+↓ 上下移；段落設定視窗另有「上移／下移」按鈕（無障礙與觸控保底）。
- **C4** 調整高度：段落底邊一條拉桿（觸控命中區 ≥ 44px），拖動改 textarea 高度；放開時存進 `height`（重新整理後保留）；雙擊拉桿＝回到自動高度。高度變更不進 undo（不是內容）。收合中的段落不顯示拉桿。
- **C5** 刪除段落：拿掉 Phase 5 的 confirm（Phase 8 註解已預告），改成刪除後 toast「已刪除「Verse II」」附「復原」按鈕（5 秒）；同時 Ctrl/Cmd+Z 也能救回。只剩一段時不能刪（刪除鈕隱藏），任何一段都可刪（不再特別保護第一段）。

### D. Undo／Redo（EDIT-03）
- **D1** 應用層快照堆疊（不用瀏覽器原生 undo，因為程式改寫 textarea、拖曳、插詞都會讓原生 undo 斷鏈）。每首歌各自一條歷史、只在記憶體（重新整理後清空，不寫 localStorage），上限 100 步。
- **D2** 涵蓋：文字編輯、新增／刪除／排序段落、改類型／自訂名稱／顏色、AI 詞插入。不涵蓋：高度、收合、歌曲清單操作、#標籤、情境描述。
- **D3** 連打合併：同一段落連續打字，停頓 > 1 秒或換到別段才切成新的一步；注音組字中不記錄，`compositionend` 才記一筆（一個確認的詞＝一次輸入）。
- **D4** 快捷鍵：Cmd/Ctrl+Z 復原、Cmd/Ctrl+Shift+Z 與 Ctrl+Y 重做；焦點在歌詞編輯器（段落文字、標籤、拖把手）時攔下原生行為改走我們的堆疊；組字中不攔。焦點在搜尋框、情境等其他欄位時維持原生行為。
- **D5** 按鈕：歌詞面板標題列加 ↶ ↷ 兩顆（觸控必備），沒有可復原／重做時變灰（disabled）。
- **D6** 復原後畫面：結構變動重畫；只是文字變動就只換那一格的 value，並把游標放回該步驟的位置、捲到看得見。
- **D7** 切歌：各首歌的歷史保留到重新整理；別的分頁更新這首歌（Phase 8 A5）時清空這首歌的歷史（避免復原到別人覆蓋前的狀態造成混亂）。

### E. 字數（EDIT-07）
- **E1** 每個段落標題列右側顯示「N 字」：中文字（含全形）每字算 1，英文／數字連續一串算 1 個詞，空白與標點不算。另在歌詞面板標題列顯示整首總字數。
- **E2** 打字即時更新；組字中不更新，`compositionend` 後更新（不碰 textarea 本身，不會打斷組字）。

### F. 詞卡拖曳插入（AI-06）
- **F1** 可拖的卡：AI 詞卡（`.ai-word-card`）與查韻字卡（`.char-card`）——Phase 7 已把兩者的長按保留給拖曳。保留池 chip 不在本 phase。
- **F2** 點擊行為不變（AI 詞卡點＝存進保留池、字卡點＝選取），點擊絕不插入。
- **F3** 桌機（滑鼠）：按住移動超過 5px 即開始拖曳；觸控：長按約 400ms（手指不動）開始拖曳，期間擋掉 contextmenu／文字選取；開始拖曳時輕微震動（`navigator.vibrate` 有才用）。
- **F4** 一律用 Pointer Events 自己做拖曳（不用 HTML5 DnD），桌機與觸控同一套；拖曳中顯示跟著指標的詞卡影子；放到段落 textarea 上時顯示插入游標位置（量字位置的鏡像 div 技巧），放開就把詞插在那個位置。
- **F5** 插入後：模型更新＋存檔、記一步 undo、該段落短暫高亮；桌機把焦點與游標放在插入詞後面；觸控不主動聚焦（避免跳出鍵盤）。
- **F6** 不自動加空白或標點；放在 textarea 以外的地方＝取消，什麼都不改。
- **F7** 手機底部分頁版型（歌詞與 AI 建議不同時顯示）：拖曳一開始就自動切到「歌詞」分頁讓手指直接找位置；取消時切回原本分頁。平板／桌機兩邊同時看得到時不切換。
- **F8** 收合的段落：拖到它的標題列上停留 0.6 秒自動展開。

### G. 外觀與相容
- **G1** 沿用 Phase 5 規則：全部 rem、觸控命中區 ≥ 44px（`--hit`）、晝夜／客製主題、hover 只給滑鼠、減少動態時不做動畫。新視覺細節（色票、把手圖示、間距）由 UI-SPEC 決定。
- **G2** 不動 Phase 8 的資料流原則：打字只寫模型、只有結構變動才重畫、組字中不碰 DOM、用 data-id 找段落、一律 textContent／value 不拼 HTML。
- **G3** 版號 `?v=` 升一版（0.96.13），新程式可另開 `js/sections.js`（標籤／顏色／拖曳／高度）、`js/undo.js`（歷史）、`js/word-drag.js`（詞卡拖曳）——檔案切分由 planner 定。

### Claude's Discretion
- 以上 A～G 全部是 Claude 自主決定（Andy 授權）。最可能被 Andy 推翻的點已列入 UAT 待確認：B1 標籤用英文、B2 單一同類不編號、B6 新段落自動猜類型、C5 拿掉刪除確認改「復原」toast、E1 英文算詞、F1 字卡也能拖、F7 手機拖曳時自動切到歌詞分頁。
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `js/lyrics.js`：`renderLyricsSections()`（createElement 組段落、data-index＋data-id）、`syncFromField()`、事件委派在 `#lyricsSections`（compositionstart/end、input、focusout）、舊的 HTML5 拖曳 `onSectionDrag*`（將被取代）、`removeLyricsSection()` 的 confirm（將拿掉）。
- `js/songs.js`：`curSong()`、`markDirty()`、`flushSongs()`、`scheduleSave()`、`_lhComposing`、跨分頁 storage 事件處理、`lhNewId()`。
- `js/safety.js`：備份驗證白名單（新欄位要加）、`lhGet／lhSet`、鍵清單。
- `js/layout.js`：`lhPlaceMenu()`（選單不跑出畫面）、visualViewport 鍵盤模型、底部分頁版型判斷。
- `js/ui-common.js`：`showToast()`；`js/ai-generate.js`：AI 詞卡 HTML（`data-word`、onclick=saveWord）；`js/ai-word-events.js`：AI 詞卡右鍵選單、回報模式（捕獲階段攔 click）。
- `js/cards.js`：`createCharCard()`。

### Established Patterns
- classic script＋全域函式、無建置；每支 JS／CSS 帶 `?v=` 版號，`tests/split-tags` 會檢查一致。
- 測試：Playwright（`tests/*.spec.mjs`，helpers `bootPage`）、Node 直接測純邏輯（`tests/node-core.mjs`），截圖基準 `visual.spec.mjs`（-darwin 本機、-linux 雲端）。
- CSS：`css/panels.css`（`.lyrics-section*`）、`css/responsive.css`（觸控／手機規則、`--hit`）。

### Integration Points
- 歌詞面板標題列（Phase 8 加了 ☰ 歌曲、⬇ 匯出、歌名）→ 加 ↶ ↷ 與總字數。
- 匯出／備份（`js/song-io.js`、`js/safety.js`）讀 `label` → A3 保持相容。
- AI 建議與情境讀目前這首歌的段落文字 → 不受影響。
</code_context>

<specifics>
## Specific Ideas

- 研究檔 `.planning/research/FEATURES.md` 已建議：Undo 用應用層快照堆疊、觸控拖曳用 Pointer Events＋明確把手、行動端提供上移／下移保底——本 phase 照做。
- Phase 7 已把字卡與 AI 詞卡的長按「留給之後的拖曳」（TEST-CHECKLIST 07-CTX-3），本 phase 兌現。
- Phase 5 的刪除確認註解：「第 9 階段會改成可復原，到時這個確認再拿掉」。
</specifics>

<deferred>
## Deferred Ideas

- 保留池 chip 拖進歌詞（同一套拖曳程式可擴充，等 Andy 想要再加）。
- 段落自由座標（白板式）排版——研究標為高風險，不做。
- 歌曲清單拖曳排序（Phase 8 C5 已決定不做）。
- Undo 歷史跨重新整理保存。
</deferred>
