# Phase 9: Section Modules 段落模組 - Research

**Researched:** 2026-10-23
**Domain:** 純前端 vanilla JS（classic script、無建置）的編輯器互動：Pointer Events 拖曳、textarea 游標定位、應用層 Undo、資料模型擴充與備份白名單、Playwright 觸控測試
**Confidence:** HIGH（程式碼接點、測試影響、拖曳／游標／Undo 演算法都在本機 Chromium 實測過）；MEDIUM（iOS Safari／Android 實機行為只能標 ASSUMED，已列入人工驗收）

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

> 以下逐字複製自 09-CONTEXT.md「Implementation Decisions」A～G（全部是 Andy 授權下 Claude 自主決定，視為鎖定）。

#### A. 資料模型（向下相容、不升 schema）
- **A1** 段落物件加欄位：`type`（`intro|verse|prechorus|chorus|inter|bridge|outro|custom`）、`custom`（自訂名稱字串，只在 type=custom 時使用）、`color`（`#rrggbb` 或空字串＝預設）、`height`（rem 數字或 null＝自動）。既有 `id／label／text／collapsed` 保留。
- **A2** 不做 schema 3 遷移：讀到沒有 `type` 的段落時「延遲正規化」——依 `label` 推斷類型（英文名不分大小寫、去掉尾端數字／羅馬數字；中文：前奏→Intro、主歌→Verse、導歌／預副歌→Pre-Chorus、副歌→Chorus、間奏→Inter、橋段→Bridge、尾奏／結尾→Outro；預設名「歌詞」「新段落」→ Verse；其他一律 Custom 並把原名放進 `custom`）。原 `label` 文字不丟。
- **A3** `label` 繼續存「目前顯示名稱」（例如 `Verse II`、自訂名稱），每次結構變動後重算寫回——舊版程式、匯出 TXT／Markdown／PDF、備份檔都不必改就正確。
- **A4** 備份匯入（Phase 8 的白名單驗證）要接受新欄位並驗證：type 限清單、color 限 `#rrggbb`、height 限合理範圍（例如 4–60 rem）、custom 長度上限 40 字；不合格的欄位丟掉、段落照收。

#### B. 段落標籤（EDIT-05、EDIT-06）
- **B1** 循環順序：Intro → Verse → Pre-Chorus → Chorus → Inter → Bridge → Outro → Custom → Intro。標籤用英文（與需求一致、作詞圈通用）。
- **B2** 編號：同類型「出現 2 次以上」才依目前排序加羅馬數字（Verse I、Verse II…）；只出現一次就只顯示類型名（Chorus）。Custom 不編號。拖曳排序、新增、刪除、改類型後立即重算。
- **B3** 左鍵（單擊／點一下）標籤按鈕＝切到下一個類型。標籤從「輸入框」改成「按鈕」，所以單擊不再有雙擊改名的衝突。
- **B4** 右鍵（桌機）／長按標籤（觸控，約 500ms）開「段落設定」小視窗：一排預設色票（8 色，晝夜兩套主題都清楚）＋原生 `<input type="color">` 自訂色＋「無顏色」；直接選類型的清單；Custom 的名稱輸入框（Enter／失焦存、Esc 取消、組字中 Enter 不送出）。視窗用既有 `lhPlaceMenu` 放置、Esc／點外面關閉。
- **B5** 顏色呈現：段落左側色條＋標籤按鈕淡色底（用 color-mix 調淡，文字對比仍達標）；無顏色＝現在的樣子。
- **B6** 新段落（＋）預設類型：依前一段推一個常見下一段（Verse→Pre-Chorus→Chorus→Verse…；不確定就 Verse）。新歌的第一段 Verse。

#### C. 拖曳排序與調整高度（EDIT-02）
- **C1** 改用 Pointer Events＋明確的「⋮⋮ 拖把手」（在段落標題列左側），桌機與觸控同一套程式；拿掉現在標題列上的 HTML5 `draggable`（觸控不支援、會跟標籤輸入框與文字選取打架＝現有拖曳 bug 的根源）。
- **C2** 拖曳中：被拖的段落半透明、跟著指標走的位置顯示插入線；靠近捲動區上下緣自動捲動；Esc 取消；放開才寫進模型（一次 undo 步驟）。拖把手 `touch-action:none`、命中區 ≥ 44px，手指按住把手直接拖（不需長按）。
- **C3** 鍵盤／保底：拖把手可聚焦，Alt+↑／Alt+↓ 上下移；段落設定視窗另有「上移／下移」按鈕（無障礙與觸控保底）。
- **C4** 調整高度：段落底邊一條拉桿（觸控命中區 ≥ 44px），拖動改 textarea 高度；放開時存進 `height`（重新整理後保留）；雙擊拉桿＝回到自動高度。高度變更不進 undo（不是內容）。收合中的段落不顯示拉桿。
- **C5** 刪除段落：拿掉 Phase 5 的 confirm（Phase 8 註解已預告），改成刪除後 toast「已刪除「Verse II」」附「復原」按鈕（5 秒）；同時 Ctrl/Cmd+Z 也能救回。只剩一段時不能刪（刪除鈕隱藏），任何一段都可刪（不再特別保護第一段）。

#### D. Undo／Redo（EDIT-03）
- **D1** 應用層快照堆疊（不用瀏覽器原生 undo，因為程式改寫 textarea、拖曳、插詞都會讓原生 undo 斷鏈）。每首歌各自一條歷史、只在記憶體（重新整理後清空，不寫 localStorage），上限 100 步。
- **D2** 涵蓋：文字編輯、新增／刪除／排序段落、改類型／自訂名稱／顏色、AI 詞插入。不涵蓋：高度、收合、歌曲清單操作、#標籤、情境描述。
- **D3** 連打合併：同一段落連續打字，停頓 > 1 秒或換到別段才切成新的一步；注音組字中不記錄，`compositionend` 才記一筆（一個確認的詞＝一次輸入）。
- **D4** 快捷鍵：Cmd/Ctrl+Z 復原、Cmd/Ctrl+Shift+Z 與 Ctrl+Y 重做；焦點在歌詞編輯器（段落文字、標籤、拖把手）時攔下原生行為改走我們的堆疊；組字中不攔。焦點在搜尋框、情境等其他欄位時維持原生行為。
- **D5** 按鈕：歌詞面板標題列加 ↶ ↷ 兩顆（觸控必備），沒有可復原／重做時變灰（disabled）。
- **D6** 復原後畫面：結構變動重畫；只是文字變動就只換那一格的 value，並把游標放回該步驟的位置、捲到看得見。
- **D7** 切歌：各首歌的歷史保留到重新整理；別的分頁更新這首歌（Phase 8 A5）時清空這首歌的歷史（避免復原到別人覆蓋前的狀態造成混亂）。

#### E. 字數（EDIT-07）
- **E1** 每個段落標題列右側顯示「N 字」：中文字（含全形）每字算 1，英文／數字連續一串算 1 個詞，空白與標點不算。另在歌詞面板標題列顯示整首總字數。
- **E2** 打字即時更新；組字中不更新，`compositionend` 後更新（不碰 textarea 本身，不會打斷組字）。

#### F. 詞卡拖曳插入（AI-06）
- **F1** 可拖的卡：AI 詞卡（`.ai-word-card`）與查韻字卡（`.char-card`）——Phase 7 已把兩者的長按保留給拖曳。保留池 chip 不在本 phase。
- **F2** 點擊行為不變（AI 詞卡點＝存進保留池、字卡點＝選取），點擊絕不插入。
- **F3** 桌機（滑鼠）：按住移動超過 5px 即開始拖曳；觸控：長按約 400ms（手指不動）開始拖曳，期間擋掉 contextmenu／文字選取；開始拖曳時輕微震動（`navigator.vibrate` 有才用）。
- **F4** 一律用 Pointer Events 自己做拖曳（不用 HTML5 DnD），桌機與觸控同一套；拖曳中顯示跟著指標的詞卡影子；放到段落 textarea 上時顯示插入游標位置（量字位置的鏡像 div 技巧），放開就把詞插在那個位置。
- **F5** 插入後：模型更新＋存檔、記一步 undo、該段落短暫高亮；桌機把焦點與游標放在插入詞後面；觸控不主動聚焦（避免跳出鍵盤）。
- **F6** 不自動加空白或標點；放在 textarea 以外的地方＝取消，什麼都不改。
- **F7** 手機底部分頁版型（歌詞與 AI 建議不同時顯示）：拖曳一開始就自動切到「歌詞」分頁讓手指直接找位置；取消時切回原本分頁。平板／桌機兩邊同時看得到時不切換。
- **F8** 收合的段落：拖到它的標題列上停留 0.6 秒自動展開。

#### G. 外觀與相容
- **G1** 沿用 Phase 5 規則：全部 rem、觸控命中區 ≥ 44px（`--hit`）、晝夜／客製主題、hover 只給滑鼠、減少動態時不做動畫。新視覺細節（色票、把手圖示、間距）由 UI-SPEC 決定。
- **G2** 不動 Phase 8 的資料流原則：打字只寫模型、只有結構變動才重畫、組字中不碰 DOM、用 data-id 找段落、一律 textContent／value 不拼 HTML。
- **G3** 版號 `?v=` 升一版（0.96.13），新程式可另開 `js/sections.js`（標籤／顏色／拖曳／高度）、`js/undo.js`（歷史）、`js/word-drag.js`（詞卡拖曳）——檔案切分由 planner 定。

### Claude's Discretion
- 以上 A～G 全部是 Claude 自主決定（Andy 授權）。最可能被 Andy 推翻的點已列入 UAT 待確認：B1 標籤用英文、B2 單一同類不編號、B6 新段落自動猜類型、C5 拿掉刪除確認改「復原」toast、E1 英文算詞、F1 字卡也能拖、F7 手機拖曳時自動切到歌詞分頁。

### Deferred Ideas (OUT OF SCOPE)
- 保留池 chip 拖進歌詞（同一套拖曳程式可擴充，等 Andy 想要再加）。
- 段落自由座標（白板式）排版——研究標為高風險，不做。
- 歌曲清單拖曳排序（Phase 8 C5 已決定不做）。
- Undo 歷史跨重新整理保存。
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EDIT-02 | 段落模組可縱向拖曳排序、可調整高度，桌機與觸控裝置都可操作；修正現有拖曳 bug | Pattern 3（Pointer Events 把手拖曳，已用 page.mouse 與 CDP 觸控實測 capture 可用）、Pattern 4（高度拉桿與 CSS 疊加規則）、Pitfall 1/9/17/18 |
| EDIT-03 | Undo / Redo 涵蓋文字編輯與段落操作（新增、刪除、排序、標籤） | Pattern 5（快照堆疊＋連打合併＋IME）、keydown＋beforeinput 雙攔截（已實測）、Pitfall 20/22 |
| EDIT-05 | 段落標籤結構化：Intro / Verse / Pre-Chorus / Chorus / Inter / Bridge / Outro / Custom；同類型依順序羅馬數字 | Pattern 1（sections-core.js：推斷＋羅馬數字＋命名，已在 Node 實測）、Pattern 2（欄位必須被接受的位置清單）|
| EDIT-06 | 左鍵點標籤循環；右鍵開 color picker 改顏色 | Pattern 6（標籤按鈕＋設定小視窗＋長按）、Pitfall 15（color input 的 input／change）、Pitfall 19（對比）、Pitfall 3（顏色常數掃描）|
| EDIT-07 | 段落字數統計 | Pattern 1（Unicode 屬性 regex，已實測 880k 字 18ms）、Pitfall 2（更新用 Text node.data，避免 childList 變動）|
| AI-06 | 詞卡拖曳到歌詞指定位置插入（不支援點擊；行動端長按） | Pattern 7（詞卡拖曳狀態機）、Pattern 8（鏡像 div 游標定位，已用真實點擊 selectionStart 當標準答案驗證）、Pitfall 10–14 |
</phase_requirements>

## Summary

本 phase 的所有接點都在 Phase 8 留下的「模型為準」架構上：`curSong()`＋`markDirty()`＋`flushSongs()`，事件掛在不會被重畫的 `#lyricsSections` 容器。最大的設計決定是把「重畫」切成兩種——**整片重畫**（只有新增／刪除／Undo 還原結構時才用）與**原地更新**（標籤名稱、顏色、字數、高度、↶↷ 狀態只改既有節點的屬性或 Text node）。拖曳排序建議直接用 `insertBefore` 搬 DOM 節點而不重畫，這樣 textarea 的捲動位置、游標與 IME 狀態都不會被破壞，也符合 Phase 8 的 G2 原則。

三個高風險演算法都已在本機 Chromium 實測：(1) 觸控拖曳——手指在 `touch-action:manipulation` 的卡片上直接滑動會被瀏覽器接管並送 `pointercancel`，所以詞卡一定要「400ms 長按＋非 passive 的 touchmove preventDefault」；段落把手則用 `touch-action:none` 直接拖。(2) textarea 游標定位——鏡像 div＋`Range.getClientRects` 二分搜尋，用真實滑鼠點擊的 `selectionStart` 當標準答案比對 99 個格點，除了「點在上方 padding」這個無意義區域外全部吻合。(3) Undo——keydown 與 `beforeinput(historyUndo)` 都要攔（程式改過 `.value` 之後原生堆疊是空的，只有 keydown 會來）。

測試面衝擊比功能面更大：標籤從 `<input>` 變 `<button>`、雙擊改名消失、刪除 confirm 消失，會讓 `songs-model`／`songs-ime`／`layout`／`songs-export`／`songs-journey` 五個 spec 的特定斷言失效；`split-tags` 的 `JS_ORDER` 寫死 22 個檔，新增 JS 檔必須同步改；靜態掃描測試（不准新增顏色常數、hover 必須包在 fine-pointer、字重只能 400/700、空 catch 掃描）會直接約束 CSS／JS 寫法——尤其「8 個預設色票」不能寫成 CSS 色碼，必須放在 JS 常數。

**Primary recommendation:** 新增 4 支純邏輯／互動檔（`sections-core.js` 純函式可 Node 測、`undo.js`、`sections.js`、`word-drag.js`），所有段落變動走單一入口 `lhSecApply(kind, mutate)`（變更 → 重算名稱 → markDirty → 記 undo → flush → 原地更新或重畫）；詞卡與段落拖曳共用同一套 pointer session 骨架；先做 Wave 0（純函式＋Node 測試＋測試工具 `touchDrag`/`longPress`），再接 UI。

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 段落類型推斷、羅馬數字、名稱、字數 | Browser / Client（純函式） | — | 無 DOM、可 Node 單測；備份匯入驗證（safety.js）與開機正規化（songs.js）共用 |
| 資料驗證（import 白名單新欄位） | Browser / Client（`js/safety.js`） | — | 備份檔不可信；驗證必須在寫入 `lh:songs` 之前 |
| 持久化（type/color/height 隨歌存） | Database / Storage（localStorage `lh:songs`） | — | 沿用 `flushSongs()`，**不新增儲存鍵**（歷史只在記憶體） |
| Undo/Redo 堆疊 | Browser / Client（記憶體 Map<songId, hist>） | — | D1：不寫 storage、每首歌一條 |
| 段落拖曳排序／拉桿調高 | Browser / Client（Pointer Events） | — | 純 DOM 互動；寫模型只在放開時 |
| 詞卡拖曳插入 | Browser / Client（跨面板 pointer session） | — | 來源在右面板／結果區，目標在左面板；手機需切分頁 |
| 外部分頁同步（storage 事件） | Browser / Client（`songs.js`） | — | 現有 `_applyExternalSongs`；新增「清空該歌歷史、中止進行中的拖曳」 |
| 靜態資源版本（`?v=`） | CDN / Static（GitHub Pages） | — | 單一 `?v=0.96.13`，index.html 30 個標籤 |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| 瀏覽器原生 Pointer Events／`setPointerCapture`／`touch-action` | 平台內建 | 滑鼠＋觸控同一套拖曳 | 專案 FEATURES.md 已決定；已在 Chromium 實測 [VERIFIED: 本 session Chromium spike] |
| `Range.getClientRects()`＋鏡像 div | 平台內建 | textarea 游標位置 | 跨瀏覽器；`caretPositionFromPoint` 在 MDN 標為 2025-12 才 Baseline、且文件未提 textarea [CITED: developer.mozilla.org/en-US/docs/Web/API/Document/caretPositionFromPoint] |
| Unicode property escapes（`\p{Script=Han}` 等，`u` flag） | ES2018 | 字數 | 已在 Node 實測 [VERIFIED: 本 session node spike] |
| `@playwright/test` | 1.63.0 | 自動化測試（含 CDP touch） | 專案既有 [VERIFIED: package.json `"@playwright/test": "1.63.0"`] |
| `acorn` | 8.18.0 | 既有靜態掃描（空 catch、儲存鍵） | 專案既有，新 JS 檔會被它掃 [VERIFIED: package.json] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `color-mix(in srgb, …)` | CSS Color 5 | 標籤淡色底 | MDN 標為 Baseline Widely available（2023-05 起）[CITED: developer.mozilla.org/en-US/docs/Web/CSS/color_value/color-mix]；仍加 `@supports` 退回只畫左色條 |
| Playwright `context.newCDPSession` + `Input.dispatchTouchEvent` | 內建於 Chromium | 產生**真的**觸控／pointer 事件 | 所有觸控拖曳、長按測試 |
| `page.clock` | Playwright 內建 | 控制 1 秒連打合併、0.6 秒展開、400ms 長按 | 避免真的 sleep（helpers.bootPage 的 `beforeGoto` 可裝）|

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| 自寫 pointer 拖曳 | SortableJS／dnd-kit | 專案「無建置、零 production 依賴」硬限制（CLAUDE.md Constraints）；且詞卡拖曳要跨面板＋游標定位，函式庫幫不上 |
| 鏡像 div＋Range 二分 | `document.caretPositionFromPoint(x,y)` | Chromium 實測在 textarea 裡**可用**（6 點全吻合），但 Safari 舊版／Firefox 行為未驗證 → 只當「有就先用」的快速路徑，鏡像法當保底與測試標準 |
| 快照堆疊 | 指令式（command pattern）反向操作 | 反向操作要為每種操作寫 inverse，易漏；快照在字串共享下記憶體很小（見 Pattern 5） |

**Installation:** 無新套件。

**Version verification:** 本 phase **不安裝任何外部套件**。`npm ls` 不變；Playwright 1.63.0、acorn 8.18.0 已在 package.json。

## Package Legitimacy Audit

本 phase 不安裝外部套件（全部使用瀏覽器原生 API 與既有 devDependencies），故無 SLOP／SUS 項目。

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| （無新增） | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
 使用者輸入
   │
   ├─ 打字（textarea）──────────► input 事件 ─► syncFromField（只寫模型，Phase 8 規則不變）
   │                                             ├─► lhHist.typing()  （組字中跳過；compositionend 才記）
   │                                             ├─► 字數 Text node.data 原地更新（不產生 childList 變動）
   │                                             └─► scheduleSave()（300ms；組字中不存）
   │
   ├─ 點／右鍵／長按 標籤按鈕 ──► lhSecApply('type'|'custom'|'color', mutate) ──┐
   ├─ 拖把手／Alt+↑↓／設定窗上下移 ─► lhSecApply('move', mutate) ─────────────┤
   ├─ ＋ 新增／− 刪除 ──────────► lhSecApply('add'|'remove', mutate) ─────────┤
   ├─ Cmd/Ctrl+Z、↶↷ ───────────► lhHist.undo()/redo() ─► 還原快照 ───────────┤
   └─ 詞卡（AI／字卡）pointer session ─► 放開在 textarea ─► lhSecApply('insert') ┘
                                                                              │
        ┌─────────────────────────────────────────────────────────────────────┘
        ▼
  lhSecApply：mutate(song) → lhSecFinalize（補欄位、重算 label）→ markDirty
              → lhHist.commit（結構步驟）→ flushSongs() → 
              ├─ 結構變了（新增／刪除／Undo 還原）→ renderLyricsSections()（整片重畫）
              └─ 只有名稱／顏色／字數／排序 → lhSecRefreshMeta()（原地更新）／insertBefore 搬節點
                                                                              │
  外部分頁 storage 事件 ─► _applyExternalSongs ─► 清空該歌 hist、中止拖曳、關閉設定窗 ─► 重畫
```

### Recommended Project Structure

```
js/
├── sections-core.js   # 純函式（無 DOM）：類型表、推斷、羅馬數字、命名、字數、欄位整理 → Node 可測
├── undo.js            # lhHist：Map<songId,{past,present,future,run}>、undo/redo、↶↷ 狀態、鍵盤攔截、beforeinput 攔截
├── sections.js        # 標籤按鈕、設定小視窗、顏色、把手拖曳、拉桿調高、刪除＋復原 toast、lhSecApply、lhSecRefreshMeta
└── word-drag.js       # 詞卡／字卡 pointer session、鏡像 div 游標定位、手機分頁切換、插入
css/panels.css         # .sec-* 新規則（接在既有 .lyrics-section 規則附近）
css/responsive.css     # 觸控／≤900 的覆寫（--hit、拉桿高度、16px 輸入框清單補上自訂名稱輸入框）
```

**載入順序（`tests/split-tags.spec.mjs` 的 `JS_ORDER` 必須同步改，且「22 個」文字與 `length` 斷言要一起更新）：** `sections-core` 放在 `state` 之後、`songs` 之前；`undo` 放在 `songs` 之後；`sections` 放在 `lyrics` 之後；`word-drag` 放最後（`ai-word-events` 之後）。理由：`songs.js`／`safety.js` 只在**執行期**呼叫 `lhSecFinalize`，載入順序不影響；`word-drag.js` 要在 `report.js`、`ai-word-events.js` 的監聽器都註冊完之後讀 DOM。

### Pattern 1：共用純函式 `js/sections-core.js`（已在 Node 實測）

**What:** 類型清單、`label` 推斷、羅馬數字、命名、欄位整理、字數。只依賴語言內建，不碰 `document`／`localStorage`，因此可用 `tests/node-core.mjs` 的 `node:vm` 載入。
**When to use:** `lhNormalizeSong`（safety.js，匯入）、`_normalizeSong`（songs.js，開機與跨分頁）、`makeEmptySong`、所有 UI 變動都呼叫它。

```js
// 以下函式在本 session 的 Node spike 逐一驗證過（輸入輸出見測試表）；細節可微調但行為要保持
const LH_SEC_TYPES = ['intro','verse','prechorus','chorus','inter','bridge','outro','custom'];   // B1 循環順序
const LH_SEC_TYPE_SET = new Set(LH_SEC_TYPES);            // 用 Set／Map，不用物件查表：防 '__proto__'、'constructor'
const LH_SEC_NAMES = { intro:'Intro', verse:'Verse', prechorus:'Pre-Chorus', chorus:'Chorus', inter:'Inter', bridge:'Bridge', outro:'Outro', custom:'Custom' };
const LH_SEC_CUSTOM_MAX = 40, LH_SEC_H_MIN = 4, LH_SEC_H_MAX = 60;       // A4
const LH_SEC_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const LH_SEC_KEY2TYPE = new Map(Object.entries({
  intro:'intro','前奏':'intro',
  verse:'verse','主歌':'verse','歌詞':'verse','新段落':'verse','段落':'verse',
  prechorus:'prechorus','pre-chorus':'prechorus','pre chorus':'prechorus',pre:'prechorus','導歌':'prechorus','預副歌':'prechorus',
  chorus:'chorus','副歌':'chorus',
  inter:'inter',interlude:'inter','間奏':'inter',
  bridge:'bridge','橋段':'bridge',
  outro:'outro','尾奏':'outro','結尾':'outro' }));
const _cut = (s, n) => Array.from(s).slice(0, n).join('');

function lhInferSecType(label) {            // A2：空字串 → verse；認得的 → 該類型；其他 → custom 並保留原名
  const raw = typeof label === 'string' ? label.trim() : '';
  if (!raw) return { type: 'verse', custom: '' };
  const k = raw.toLowerCase().replace(/[_\s]+/g, ' ')
    .replace(/(?:\s*[#.\-]?\s*\d+|\s+[ivxlc]+|\s*[一二三四五六七八九十]+)$/u, '')   // 尾端 阿拉伯數字／羅馬數字（要有空白隔開）／中文數字
    .trim().replace(/\s*-\s*/g, '-');
  return LH_SEC_KEY2TYPE.has(k) ? { type: LH_SEC_KEY2TYPE.get(k), custom: '' } : { type: 'custom', custom: _cut(raw, LH_SEC_CUSTOM_MAX) };
}

function lhSecFields(s) {                   // 整理單一段落的四個新欄位；壞值丟掉、段落照收（A4）
  const hasType = typeof s.type === 'string' && LH_SEC_TYPE_SET.has(s.type);
  const inf = hasType ? null : lhInferSecType(s.label);
  let custom = typeof s.custom === 'string' ? _cut(s.custom.trim(), LH_SEC_CUSTOM_MAX) : '';
  if (inf && inf.custom) custom = inf.custom;
  return {
    type: hasType ? s.type : inf.type, custom,
    color: typeof s.color === 'string' && LH_SEC_COLOR_RE.test(s.color) ? s.color.toLowerCase() : '',
    height: Number.isFinite(s.height) && s.height >= LH_SEC_H_MIN && s.height <= LH_SEC_H_MAX ? Math.round(s.height * 10) / 10 : null,
  };
}

function lhToRoman(n) {                     // 1→I, 4→IV, 9→IX, 14→XIV, 1999→MCMXCIX（實測）
  const t = [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];
  let s = ''; for (const [v, r] of t) while (n >= v) { s += r; n -= v; } return s;
}
function lhSecNames(sections) {             // B2：同類型 ≥2 次才編號；Custom 不編號、沒名字叫 'Custom'
  const total = new Map(), seen = new Map();
  for (const s of sections) total.set(s.type, (total.get(s.type) || 0) + 1);
  return sections.map(s => {
    if (s.type === 'custom') return (s.custom || '').trim() || LH_SEC_NAMES.custom;
    const n = (seen.get(s.type) || 0) + 1; seen.set(s.type, n);
    return total.get(s.type) > 1 ? LH_SEC_NAMES[s.type] + ' ' + lhToRoman(n) : LH_SEC_NAMES[s.type];
  });
}
function lhSecFinalize(sections) {          // 冪等：補欄位 → 重算 label（A3）。已實測重跑結果完全相同
  for (const s of sections) Object.assign(s, lhSecFields(s));
  const names = lhSecNames(sections);
  sections.forEach((s, i) => { s.label = names[i]; });
  return sections;
}

// 字數（E1）：CJK 每字 1；其餘字母／數字連續一串 1（含詞內撇號 don't）；標點、空白、emoji 不算
const _CJK = String.raw`[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Bopomofo}]`;
const _WC_RE = new RegExp(`${_CJK}|(?:(?!${_CJK})[\\p{L}\\p{N}])+(?:['’](?:(?!${_CJK})[\\p{L}\\p{N}])+)*`, 'gu');
function lhCountWords(t) { let n = 0; for (const _ of t.matchAll(_WC_RE)) n++; return n; }
```

**實測結果（Node，本 session）：** `lhCountWords('Hello世界123 don\'t 你好，ＡＢＣ') === 8`、`'ㄅㄆㄇ'→3`、`'１２３４'→1`、`'🙂😀'→0`、`'abc-def'→2`、`'  \n，，。。…—'→0`；880,000 字單段 18ms、6,900 字 0.12ms/次。推斷：`''/歌詞/新段落/主歌/主歌2/主歌 二/Verse/verse 2/VERSE II/Verse iv → verse`；`副歌→chorus`；`Pre-Chorus/pre chorus 1/Prechorus/預副歌/導歌 → prechorus`；`間奏/Interlude→inter`；`尾奏/結尾→outro`；`前奏/Intro 1→intro`；`A段/副歌（重複）/Chorus x2/甲/<b>x</b>/Hook/Vi/Mix → custom（原名保留）`。命名：`[verse,verse,chorus,verse,custom(Hook),inter,inter] → Verse I, Verse II, Chorus, Verse III, Hook, Inter I, Inter II`。壞值：`color:'red;x'→''`、`height:999→null`、`type:'__proto__'→改用推斷`。

**字數更新規則（E2）：** 每個段落標題列放一個固定的 `<span class="sec-count">`，裡面**預先建好一個 Text node**，之後只改 `textNode.data`（見 Pitfall 2）。總字數用「各段字數相加」；各段字數用 `Map<secId, n>` 快取，打字時只重算該段。

### Pattern 2：新欄位必須被接受／保留的位置（逐一核對過原始碼）

| 位置 | 現況（已讀原檔） | 要做的事 |
|------|------------------|----------|
| `js/safety.js:599-609` `lhNormalizeSong` | 以 `.map(s => ({ id, label, text, collapsed }))` **只留四個欄位，其餘全丟** | 加入新欄位：用 `lhSecFields(s)` 取 type/custom/color/height，再對整個 `sections` 跑 `lhSecFinalize`。**這是新欄位會不會在匯入時被吃掉的唯一關卡**。`label` 上限 `LH_IMPORT_CAPS.label`（200）維持，`custom` 上限 40 另算 |
| `js/safety.js:609` 空 sections 的預設段落 | `{ id, label: '', text: '', collapsed: false }` | 補 `type:'verse', custom:'', color:'', height:null` 後 finalize |
| `js/safety.js:411` `lhSongFromLegacy` | 舊 haiku_lyrics 轉換，無新欄位 | **不改**；開機時由 `_normalizeSong` 補（延遲正規化） |
| `js/songs.js:96-120` `_normalizeSong` | 補 id/label/text/collapsed，回傳 `changed` | 在最後對 `s.sections` 跑 `lhSecFinalize`。**刻意不因此回傳 `changed=true`**：讀取不寫入，磁碟上的舊 label 直到使用者下次編輯該歌才被覆寫（保留退路，也讓舊版程式回退時資料仍可讀）|
| `js/songs.js:26-37` `makeEmptySong` 與 `js/songs.js:116` 空段落 | `label: ''` | 改成 `{ type:'verse', label:'Verse', custom:'', color:'', height:null }`（B6：新歌第一段 Verse）|
| `js/songs.js:61` `_flushLegacy`（舊單首模式） | 只寫 `{ label, text, collapsed }` | 不改；legacy 模式（遷移失敗退路）重新載入時由推斷補回類型，**顏色與高度在該模式不保存**（可接受，記進 SUMMARY）|
| `js/song-io.js:5-11` `songExportSections` | 讀 `s.label.trim() \|\| '段落 ' + (i + 1)` | 因 A3 label 永遠是字串且非空，**不必改**；但 `label` 以 `lhSecFinalize` 重算後的名稱為準（見 Open Question 1：匯出字樣會從「主歌」變「Verse」）|
| `js/song-io.js:331` `importAddSongs` | `songs.push(song)`，**沒有**走 `_normalizeSong` | 因 `lhNormalizeSong` 已在解析階段 finalize，這裡自然安全；若有人改動解析流程，要記得這條路徑繞過 `_normalizeSong` |
| `js/safety.js:677-693` `lhBuildBackup` | `songs: songsArr` 原樣輸出 | 不改；新欄位自然跟著出去 |

**已讀並可引用的原檔值（verbatim）：**
- `js/safety.js:386`：`const LH_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;` → 段落 id 可安全放進 `data-id`；但仍**不要用字串拼 selector 找段落**，用迴圈比對 `dataset.id`。
- `js/safety.js:511`：`const LH_IMPORT_CAPS = { songs: 5000, title: 60, sections: 2000, label: 200, text: 1000000, tags: 200, tag: 100, context: 100000, words: 20000, word: 100, setting: 1000000 };` → 單段最多 100 萬字、最多 2000 段：字數、鏡像 div 都要能承受（見 Pitfall 23）。
- `js/songs.js:5`：`const SONG_SAVE_DELAY = 300;   // 打字停下來多久才存；組字中完全不存（B2）`
- `css/base.css:23`：`--hit: max(44px, 2.75rem);`
- `js/layout.js:53-54`：`const LH_MQ_PHONE = matchMedia('(max-width: 440px)');` `const LH_MQ_SHEET = matchMedia('(max-width: 900px)');`（≤900 才是底部分頁版型；判斷一律用 `lhIsSheetMode()`）
- `js/panels.js:86-108`：`function mobileTab(tab)`，`'lyrics'`／`'ai'` 開對應 sheet、`'search'` 收起；再按同一個會收起。

### Pattern 3：渲染分兩種——整片重畫 vs 原地更新（G2 的具體做法）

**What:** `renderLyricsSections()` 仍負責「結構變動」的整片重畫（現有 `container.replaceChildren(...)`，並已在開頭把 `_lhComposing=false`）。新增 `lhSecRefreshMeta()` 只掃現有節點：改 `.section-label` 的 `textContent`、`dataset.type`、`--sec-color`、`.sec-count` 的 Text node、`data-index`、`has-h` class 與 `--sec-h`、↶↷ 的 `disabled`。
**When to use:** 左鍵循環標籤、改顏色、改自訂名稱、排序、拉桿高度——全部走原地更新；只有 add / remove / undo-redo 會改變段落集合時才整片重畫。
**Why:** (a) 循環標籤若整片重畫，鍵盤使用者連按 Enter 時按鈕被換掉、焦點丟失；(b) 重畫會重設每個 textarea 的捲動位置與游標；(c) `songs-ime.spec.mjs` 的「不重畫也不跳游標」用 MutationObserver 監看 `#leftPanel` 的 `childList`，打字路徑只要多一次 childList 變動就失敗。

**排序用 `insertBefore` 搬節點（不重畫）：**
```js
// 放開時：照新順序搬 DOM 節點，再 reindex。textarea 的捲動位置與內容不受影響。
function lhSecMoveDom(container, fromId, beforeId /* null = 放最後 */) {
  const el = [...container.children].find(c => c.dataset.id === fromId);
  const ref = beforeId && [...container.children].find(c => c.dataset.id === beforeId);
  container.insertBefore(el, ref || null);
  [...container.children].forEach((c, i) => { c.dataset.index = String(i); });   // 既有測試與 CSS 都依賴 data-index
  const h = el.querySelector('.sec-handle'); if (h) h.focus({ preventScroll: true });   // 搬節點會讓焦點丟失（Chromium），鍵盤連按 Alt+↑↓ 需要把焦點還給把手
}
```

**事件委派（取代所有 inline `onclick／ondragstart…`）：** 全部掛在 `#lyricsSections`（不會被重畫）。標題列點擊＝收合，但目標在 `.section-label, .section-remove, .sec-handle` 內時略過（取代現在的 `onSectionHeaderClick` 判斷）。好處：`tests/smoke.spec.mjs` 的「原始碼每個 handler 都被觸發」覆蓋率閘門不會因為新增 inline handler 而要求加情境；`onSectionDragStart/Over/Leave/Drop/End`、`enableSectionLabel`、`disableSectionLabel`、`onSectionHeaderClick` 整組刪除即可（smoke 的 `UNREACHABLE` 目前是空的，不需調整）。

### Pattern 4：Pointer Events 拖曳排序（把手）＋高度拉桿（已實測的事實）

**實測事實（Chromium，本 session）：**
1. `page.mouse.down/move/up` 產生真的 `pointerType:'mouse'` 事件，`setPointerCapture` 成功，事件順序 `pointerdown → gotpointercapture → pointermove… → pointerup → lostpointercapture`。
2. **合成事件不能用來測 capture：** `element.dispatchEvent(new PointerEvent('pointerdown',{pointerId:42,pointerType:'touch'}))` 之後呼叫 `setPointerCapture(42)` 會丟 `NotFoundError`（沒有這個 active pointer）。測試觸控必須用 CDP `Input.dispatchTouchEvent`（見 Validation Architecture 的 helper）。
3. CDP 觸控在 `touch-action:none` 的元素上：`pointerdown touch → capture ok → pointermove×N → pointerup`，沒有 `pointercancel`。
4. 在 `touch-action:manipulation` 的元素上垂直滑動：只有 `pointerdown`、緊接 `pointercancel`，且容器 `scrollTop` 真的動了（瀏覽器接管捲動）。→ 詞卡不能用「按下就開始拖」（Pattern 7）。

**把手 session 骨架（listener 掛在把手本身，因為有 capture；結束時全部移除）：**
```js
// Source: 本 session 實測的事件順序；寫法為建議骨架
function lhSecDragStart(e, handle, secEl) {
  if (e.button !== 0 && e.pointerType === 'mouse') return;
  const area = document.getElementById('lyricsSections');
  const sx = e.clientY;
  let dy = 0, drop = null, raf = 0, last = e.clientY;
  try { handle.setPointerCapture(e.pointerId); } catch (err) { lhWarn('setPointerCapture 失敗', err); }   // 空 catch 會被 scan.spec 抓：catch 內一定要呼叫函式
  secEl.classList.add('dragging');                         // opacity .45（既有 .dragging 規則可沿用）
  document.body.classList.add('lh-dragging');              // user-select:none; cursor:grabbing
  const onMove = ev => { last = ev.clientY; schedule(); };
  const schedule = () => { raf = raf || requestAnimationFrame(tick); };
  const tick = () => {
    raf = 0;
    dy = last - sx; secEl.style.transform = `translateY(${dy}px)`;
    // 自動捲動：離 #lyricsSections 上／下緣 < 2rem 時，每幀捲 ~10px（捲動容器就是 #lyricsSections 本身，不是 .side-panel-body——後者 overflow:hidden）
    const r = area.getBoundingClientRect(), edge = 32;
    if (last < r.top + edge) area.scrollTop -= 10; else if (last > r.bottom - edge) area.scrollTop += 10;
    drop = lhSecDropTarget(area, secEl, last);              // 用「其他段落中線」比 pointerY → { beforeId | null }；畫插入線
    if (last < r.top + edge || last > r.bottom - edge) schedule();   // 靠邊時持續下一幀
  };
  const end = (commit) => {                                 // pointerup→true；Esc／pointercancel／lostpointercapture→false
    handle.removeEventListener('pointermove', onMove); /* …移除 up/cancel/lostcapture 與 document keydown… */
    secEl.style.transform = ''; secEl.classList.remove('dragging'); document.body.classList.remove('lh-dragging');
    lhSecClearDropLine();
    if (commit && drop) lhSecApply('move', song => lhSecSplice(song, secEl.dataset.id, drop.beforeId), { dom: 'move', id: secEl.dataset.id, beforeId: drop.beforeId });
  };
  // Esc 取消：capture 階段 + preventDefault + stopPropagation，才不會同時觸發 panels.js 的「Esc 收起底部 sheet」
  // （panels.js:116 看 e.defaultPrevented 才略過）
}
```
- 把手 CSS：`touch-action:none; cursor:grab; min-width/min-height: var(--hit)`（觸控）、`user-select:none`、`-webkit-touch-callout:none`。
- **鍵盤：** 把手是 `<button>`（可聚焦），`keydown` 攔 Alt+ArrowUp／Alt+ArrowDown，呼叫同一個 `lhSecApply('move', …)`，之後用 `lhSecMoveDom` 搬節點並還焦點（已在上方函式內）。設定小視窗的「上移／下移」同一個函式。
- **拉桿（C4）：** 同一種 session，改的是 `--sec-h`；以 `px / rootFontSize` 轉 rem（rootFontSize 用 `parseFloat(getComputedStyle(document.documentElement).fontSize)`，這樣 `--ui-scale` 縮放後存的 rem 仍一致），夾在 `[LH_SEC_H_MIN, LH_SEC_H_MAX]`；放開時才寫 `sec.height`＋`markDirty`＋`flushSongs`，**不進 undo**；雙擊（`dblclick` 或兩次 pointerup 間隔 < 300ms，觸控沒有 dblclick）→ `height=null`。
- **CSS 疊加（已量過現況）：** 桌機（≥ 901）`.section-body` 是 `display:block`，textarea 不會撐滿 `flex:1` 的段落（量測：3 段、area 490px 時每段 159px，textarea 只有 72px）；≤ 900 `.section-body` 是 `display:flex`、textarea `flex:1 1 auto; min-height:7rem`。建議：`.lyrics-section.has-h { flex: 0 0 auto; }` 與 `.lyrics-section.has-h .section-textarea { height: var(--sec-h); min-height: 0; flex: 0 0 auto; }`。注意 `responsive.css:64` 的 `.lyrics-section[data-index="0"] { flex: 1 0 12rem; }` 與 `.lyrics-section.collapsed { flex: … }` 同權重（0,2,0），**後者必須寫在 has-h 之後或把 has-h 寫成 `.lyrics-area .lyrics-section.has-h`**，且收合時不應受 has-h 影響。`layout.spec.mjs:1051` 要求預設段落的 textarea ≥ 112px，所以「預設（無 height）」維持 `min-height:7rem` 不動，只有使用者明確拉過才允許低於 7rem（A4 下限 4rem）。

### Pattern 5：應用層 Undo（快照堆疊）

**What:** 每首歌一個 `{ past:[], present, future:[], run:null }`。`present` 是「目前狀態」的快照；`commit` 把舊 `present` 推進 `past`、`present` 換成新快照、清 `future`。快照 = `sections.map(s => ({...s}))`（淺拷貝：`text`/`label` 是不可變字串，跨快照共享參考，100 步幾乎不吃記憶體）。

```js
// 建議骨架（演算法細節為本 session 設計，未跑過；單元測試在 Wave 0）
const _hists = new Map();                                   // songId → hist（只在記憶體；D1）
const LH_UNDO_MAX = 100, LH_TYPING_GAP = 1000;              // D1、D3
const _snap = song => song.sections.map(s => ({ ...s }));
function _hist(song) {
  let h = _hists.get(song.id);
  if (!h || h.ref !== song) { h = { ref: song, past: [], future: [], present: _snap(song), run: null }; _hists.set(song.id, h); }   // song 物件被換掉（跨分頁重載）→ 重新起算
  return h;
}
// 結構步驟（新增／刪除／排序／類型／名稱／顏色／插詞）：mutation「之後」呼叫
function lhHistCommit(song, kind, caret) {
  const h = _hist(song);
  h.run = null;                                              // 結構操作打斷連打合併
  h.past.push({ snap: h.present, kind, caret: h.caret || null }); if (h.past.length > LH_UNDO_MAX) h.past.shift();
  h.present = _snap(song); h.future.length = 0; h.caret = caret || null; _syncButtons();
}
// 打字：syncFromField 寫完模型之後呼叫；組字中（_lhComposing 或 e.isComposing）不呼叫，compositionend 時呼叫一次
function lhHistTyping(song, secId, caret, now = Date.now()) {
  const h = _hist(song);
  if (!h.run || h.run.secId !== secId || now - h.run.t > LH_TYPING_GAP) {   // 新的一步：把「打字前」的 present 存進 past
    h.past.push({ snap: h.present, kind: 'text', caret: h.caret || null }); if (h.past.length > LH_UNDO_MAX) h.past.shift();
    h.future.length = 0; h.run = { secId, t: now };
  }
  h.run.t = now; h.present = _snap(song); h.caret = caret; _syncButtons();
}
```
- **還原：** `undo()`：`h.future.push({snap: h.present, kind, caret})`；`h.present = past.pop().snap`；把快照套回 `song.sections`（新物件），**對仍存在的 id 保留目前的 `collapsed` 與 `height`**（D2：這兩者不進 undo）；`lhSecFinalize` → `markDirty` → `flushSongs`。若「段落 id 序列與 type/custom/color 都沒變、只有一段 text 變了」→ 只寫那個 textarea 的 `.value`，`setSelectionRange(caret)`，`scrollIntoView({block:'nearest'})`（D6）；否則 `renderLyricsSections()`，並用 `scrollTop` 存回、桌機把焦點還給該段 textarea（觸控不聚焦）。
- **組字：** `compositionend` 當一個 `typing` 呼叫（現有 `compositionend` 監聽在 `lyrics.js:299`，`_lhComposing` 在 `songs.js:18`）。`input` 事件裡 `e.isComposing` 或 `_lhComposing` 時一律略過。
- **攔截（兩條都要，已實測）：** Chromium 實測：打字後按 Ctrl/Cmd+Z → 先 `keydown`，再有 `beforeinput inputType=historyUndo cancelable=true`；但**程式用 `.value=` 改過之後**按 Ctrl+Z 只有 `keydown`、沒有 `beforeinput`（原生堆疊是空的）。所以：(1) document 層 capture 階段 `keydown`，條件 `(e.metaKey||e.ctrlKey) && !e.altKey && !e.isComposing && e.keyCode !== 229 && e.target.closest('#lyricsSections, .lyrics-tools')`，`key.toLowerCase()==='z'`（有 Shift＝redo）或 `ctrlKey && key==='y'` → `preventDefault()` + 走自己的堆疊；(2) 同一範圍的 `beforeinput`，`inputType === 'historyUndo' | 'historyRedo'` → `preventDefault()` + 走自己的堆疊（涵蓋 Mac 選單「編輯 → 還原」、iOS 搖一搖、部分 Android 鍵盤；後兩者為 `[ASSUMED]`，列入人工驗收）。`#contextDescription`、搜尋框、歌名輸入框不在範圍 → 維持原生。
- **↶ ↷ 按鈕：** 放在 `.lyrics-tools`（見 Open Question 2），`mousedown` 上 `preventDefault()` 讓 textarea 不失焦、鍵盤不收（Chromium 行為；iOS 為 `[ASSUMED]`）。`disabled` 由 `_syncButtons()` 依 `past.length / future.length` 設（屬性變動，不是 childList）。
- **刪除的「復原」toast：** 記下 `commit` 後 `h.past` 頂端那一步的唯一 id；toast 按鈕被按時**只有頂端仍是那一步**才 `undo()`，否則（使用者之後又改了別的）隱藏按鈕並提示「已經有新的修改，請用 Ctrl+Z 一步一步復原」，避免按到「復原」卻復原了別的東西（Pitfall 22）。
- **清歷史時機：** `_applyExternalSongs`（songs.js:228）重新指派 `songs` 之後 → `_hists.clear()`（D7）；`confirmDeleteSong` 成功 → `_hists.delete(id)`；`importReplaceAll` 會整頁重載，不用處理。

### Pattern 6：標籤按鈕與「段落設定」小視窗

- 標籤是 `<button class="section-label" type="button">`，`aria-label` 帶目前名稱與動作（例如「段落類型：Verse I。點一下切換類型，右鍵或長按設定」），`aria-haspopup="dialog"`。**保留 `.section-label` 這個 class**（`layout-lib.mjs`／audit 選單與 `songs-model` 測試的選擇器都用它），但元素從 `input` 變 `button`，所有 `inputValue()` 斷言要改 `textContent`。
- **左鍵＝循環；右鍵＝設定：** `click` → `lhSecApply('type', …)`；`contextmenu` → `preventDefault()` + 開視窗（鍵盤 Shift+F10／選單鍵原生會觸發 `contextmenu`，順便得到鍵盤入口）。
- **觸控長按 500ms（自己計時）：** 不要只靠 `contextmenu` 事件——Android Chrome 會送、iOS Safari 長按非連結元素不一定送 `[ASSUMED]`。做法：標籤按鈕 `pointerdown`（`pointerType !== 'mouse'`）起 500ms 計時，移動 > 8px 或 `pointerup` 取消；觸發時開視窗並設 `suppressNextClick=true`（吞掉之後的 click，否則一放開又循環一次）；同時在這顆按鈕上 `contextmenu` 一律 `preventDefault()`，避免 Android 在 500ms 左右多開一次。按鈕 CSS：`-webkit-touch-callout:none; user-select:none`。
- **視窗內容與放置：** 新 class（例如 `.sec-menu`，需要自己的 `.show{display:block}`，因為 `lhPlaceMenu`（layout.js:153）只會 `el.classList.add('show')` 並寫 `left/top`）。`lhPlaceMenu(el, x, y)` 先放 (0,0) 再量尺寸、夾進 `visualViewport`。關閉：Esc（capture＋`preventDefault`，同樣要擋住 panels.js 的 sheet Esc）、點視窗外、`renderLyricsSections()`／拖曳開始時（見 Pitfall 9）。自訂名稱輸入框用 `if (e.isComposing || e.keyCode === 229) return;` 的既有寫法（songs.js:496），Enter／失焦存、Esc 取消；**輸入框要加進 `responsive.css:737` 那份「≥16px」選擇器清單**，否則 iOS 會自動放大。
- **顏色：** 8 個預設色票放在 **JS 常數** `LH_SEC_COLORS = ['#…', …]`（見 Pitfall 3：CSS 不能新增色碼），按鈕上用 `style.setProperty('--sw', hex)` 上色；段落用 `secEl.style.setProperty('--sec-color', color)`（值已過 `LH_SEC_COLOR_RE`，絕不拼進 `cssText`）。原生 `<input type="color">`：`input` 事件做即時預覽（只改畫面），`change` 事件才 `lhSecApply('color')` 記一步 undo，否則拖色盤會灌滿 100 步（Pitfall 15）。
- **B5 外觀：** 左側 4px 色條（`border-inline-start: 4px solid var(--sec-color)`）＋標籤淡底 `background: color-mix(in srgb, var(--sec-color) 16%, var(--container-bg))`，放在 `@supports (background: color-mix(in srgb, red, blue))` 內；標籤文字用 `var(--text-primary)`（不是 `--text-secondary`，見 Pitfall 19）。

### Pattern 7：詞卡／字卡拖曳（pointer session 狀態機）

```
 idle ─pointerdown(card, 主鍵, 非 mark-badge, 非 report-mode)─► pending
 pending ─(mouse) 移動 >5px ─────────────────────────────────► dragging
 pending ─(touch) 400ms 內位移 ≤8px ──────────────────────────► dragging   （震動；此刻起 touchmove 一律 preventDefault）
 pending ─(touch) 400ms 內位移 >8px ──────────────────────────► idle（交給瀏覽器捲動；不要攔）
 pending ─pointerup/cancel ───────────────────────────────────► idle（就是一次 click，不插入）
 dragging ─pointermove─► 更新影子位置、找 textarea、算游標、畫插入線、自動捲動、F8 倒數
 dragging ─pointerup 在 textarea 上─► 插入 ─► idle
 dragging ─pointerup 在別處／Esc／pointercancel／lostpointercapture─► 取消（還原分頁）─► idle
```
- **為什麼觸控要長按＋非 passive touchmove：** 見 Pattern 4 實測第 4 點；詞卡區本身要能捲動，所以不能把 `touch-action` 設成 `none`。長按 400ms 沒動時瀏覽器還沒開始捲，此時登錄一個 `document.addEventListener('touchmove', blocker, { passive: false })`，在 `dragging` 期間 `e.preventDefault()` 擋掉捲動。**要明確寫 `{passive:false}`**（Chromium 把 document 層的 touchmove 預設當 passive）。CDP 實測：長按 450ms 後再移動，`preventDefault` 生效、pointermove 照樣持續送達（見下一點）。
- **來源面板在拖曳中被 `display:none`／`inert` 也沒關係（Chromium 實測）：** 手機版 F7 會在拖曳開始時 `mobileTab('lyrics')`（把 AI 面板變 collapsed＋`inert`）。實測在 CDP 觸控長按中途把卡片 `display:none` 並對 `body` 加 `inert`，後續 `pointermove`×2、`pointerup` 仍送達（隱式 capture 在觸控上固定給 touchstart 的目標）。iOS Safari 的行為 `[ASSUMED]`（人工驗收項）。保險做法：`pointermove/up/cancel` 掛在 `document`（capture），以 `pointerId` 過濾，而不是掛在卡片上。
- **吞掉拖曳後的 click：** 桌機拖曳結束若放開時仍在原卡片上（取消的情況），瀏覽器會送 click → `saveWord`／`toggleSelection` 被誤觸。`dragging` 結束時註冊一次性 `document` capture `click` 監聽（`stopPropagation`＋`preventDefault`），`setTimeout(0)` 或下一次 `pointerdown` 時移除。capture 的 document 層比 `ai-word-events.js:74` 的容器 capture 更早，因此報告模式也不會被誤觸（但報告模式本來就不啟動拖曳）。
- **contextmenu：** `report.js:125`（字卡）與 `ai-word-events.js:10`（AI 詞卡）都會在 `contextmenu` 時開回報選單。Android 長按約 500ms 會送 `contextmenu`（`[ASSUMED]`），在 400ms 的 `dragging` 之後。處理：`window` capture `contextmenu`，`pending||dragging` 或剛結束 600ms 內且 `pointerType` 是 touch 時 `preventDefault()`＋`stopImmediatePropagation()`；**滑鼠右鍵不受影響**（桌機回報選單照舊）。
- **起點排除：** `.mark-badge`（字卡右下的標記，有自己的 `onclick="handleBadgeClick"`）、`.poly-chip`、報告模式（`#aiWordsContainer.report-mode`）、非主鍵。拖的內容：AI 詞卡取 `dataset.word`（`ai-generate.js:8` 已放）、字卡取 `dataset.char`（`cards.js:105` 已放）。
- **影子：** 一個 `position:fixed; pointer-events:none; z-index` 高於 `.mobile-backdrop` 與 sheet 的元素，`transform: translate(x,y)`；`elementFromPoint` 因為影子 `pointer-events:none` 不會被擋。
- **手機版型（F7）：** `lhIsSheetMode()` 才處理。開始時記 `orig = !lp.collapsed ? 'lyrics' : !rp.collapsed ? 'ai' : 'search'`，若 `orig !== 'lyrics'` 則 `mobileTab('lyrics')`；取消時 `mobileTab(orig)`（注意 `mobileTab(tab)` 若 tab 與目前已開的相同會變成收起，所以只在不同時才呼叫）。成功插入則停在歌詞分頁。sheet 有 0.25s 滑入動畫，座標一律即時量，不快取。
- **桌機左面板收合的情況（Open Question 4）：** 目標不存在就是「放在別處＝取消」；**不建議**自動展開左面板——`syncCenterPanel('left')` 在窄螢幕會把右面板收起（panels.js:34-47），而來源卡片就在右面板裡。建議開始拖曳時若 `#leftPanel.collapsed` 且非 sheet 模式，改顯示 toast「先打開歌詞面板，再把詞拖進去」並不啟動拖曳。
- **F8：** 指標停在收合段落的標題列上 600ms → `toggleLyricsSection(i)`（它只切 class，不重畫；`lyrics.js:91`）。離開就清計時器。
- **插入：** `lhSecApply('insert', song => { sec.text = text.slice(0,i) + word + text.slice(i) }, …)`；`ta.value` 同步更新（此時一定不在組字中；若 `_lhComposing` 為真則取消插入）；桌機 `ta.focus({preventScroll:true}); ta.setSelectionRange(i+len, i+len)`；觸控不聚焦（F5）。`commit` 的 `caret` 記插入後位置。高亮：加 `.drop-flash` class 600ms，`prefers-reduced-motion` 時不做動畫（`responsive.css:783` 已有區塊，加一行）。**不要把游標索引切在代理對（surrogate pair）中間：** `i>0 && 0xD800<=value.charCodeAt(i-1)<=0xDBFF && 0xDC00<=value.charCodeAt(i)<=0xDFFF` 時 `i--`。

### Pattern 8：鏡像 div 取得 textarea 游標索引（已實測）

`document.caretPositionFromPoint` 在這個 Chromium 對 textarea 有效（6 點全吻合），但 MDN 標示 2025-12 才 Baseline 且沒提 textarea，所以**鏡像法為主**；有 `caretPositionFromPoint` 時可當快速路徑（`pos.offsetNode === ta ? pos.offset : null`），結果不合理就退回鏡像。

```js
// 以下版本在 Chromium 實測：真實點擊 selectionStart 當標準答案，滑鼠 99 個格點中 91 個吻合，
// 另外 8 個全是「點在第一行上方的 padding」——真實點擊在那裡會回 0，本演算法回第一行最近字元（更合理，不需修）。
// 捲動中的 textarea（scrollTop=150）3 點全吻合。
const _MIRROR_COPY = ['boxSizing','paddingTop','paddingRight','paddingBottom','paddingLeft','fontFamily','fontSize','fontWeight','fontStyle','letterSpacing','lineHeight','textTransform','textIndent','wordSpacing','tabSize','overflowWrap','wordBreak','textAlign'];
function lhMirror(ta) {
  const cs = getComputedStyle(ta), m = document.createElement('div');
  for (const p of _MIRROR_COPY) m.style[p] = cs[p];
  m.style.cssText += ';position:absolute;left:-9999px;top:0;visibility:hidden;white-space:pre-wrap;overflow:hidden;height:auto;border-width:0';
  m.style.boxSizing = 'content-box';
  m.style.width = (ta.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) + 'px';   // clientWidth 不含捲軸；寬度算錯會讓換行位置全錯（spike 第一版就錯在這）
  m.append(document.createTextNode(ta.value + '\u200b'));   // 結尾加零寬字元：最後一行行尾也有 rect
  document.body.appendChild(m); return m;
}
const _charRect = (node, i) => { const r = document.createRange(); r.setStart(node, i); r.setEnd(node, i + 1); const rs = r.getClientRects(); return rs.length ? rs[rs.length - 1] : r.getBoundingClientRect(); };
function lhCaretIndexAt(ta, clientX, clientY, mirror /* 可傳入快取的鏡像 */) {
  const rect = ta.getBoundingClientRect(), cs = getComputedStyle(ta);
  const m = mirror || lhMirror(ta), node = m.firstChild, n = ta.value.length, mr = m.getBoundingClientRect();
  const px = mr.left + (clientX - rect.left - parseFloat(cs.borderLeftWidth) + ta.scrollLeft);
  const py = mr.top + (clientY - rect.top - parseFloat(cs.borderTopWidth) + ta.scrollTop);
  // 1) 行不會倒退：找第一個「字形頂端在指標下方」的索引，指標所在的行就是它的前一個字所在的行
  //    （不能用 rect.bottom：CJK 字形 rect 比 line-height 矮，行與行之間的縫會落到下一行——spike 第二版錯在這）
  let lo = 0, hi = n; while (lo < hi) { const mid = (lo + hi) >> 1; if (_charRect(node, mid).top > py) hi = mid; else lo = mid + 1; }
  const first0 = Math.max(0, lo - 1), lineTop = _charRect(node, first0).top;
  let a = 0, b = first0; while (a < b) { const mid = (a + b) >> 1; if (Math.abs(_charRect(node, mid).top - lineTop) <= 2) b = mid; else a = mid + 1; }   // 該視覺行的第一個字
  // 2) 沿該行找最近的邊界；'\n' 一定在行尾：落在它前面（spike 第三版修掉「空行回傳下一行開頭」）
  let i = a;
  for (; i < n; i++) {
    const r = _charRect(node, i);
    if (Math.abs(r.top - lineTop) > 2) break;
    if (ta.value[i] === '\n' || px < r.left + r.width / 2) break;
  }
  if (!mirror) m.remove();
  return i;
}
```
- 拖曳中**快取鏡像**：進入某個 textarea 時建一次，只要 `value`／`clientWidth` 沒變就重用（每次 pointermove 只做二分搜尋，約 20–40 次 `getClientRects`）；離開 textarea 或拖曳結束時 `remove()`。
- **插入線（游標指示）：** 用 `lhMirror` 內 `_charRect(node,i)`（i 位置的左緣；行尾用前一字右緣）換算成螢幕座標（`rect.left + borderLeft + (r.left - mr.left) - ta.scrollLeft`），畫一個 `position:fixed; width:2px; pointer-events:none` 的元素（顏色用 `var(--highlight-border)`）。textarea 本身加 `.drop-target` 外框。
- 100 萬字上限的段落：鏡像排版會很慢，`value.length > 200000` 時略過即時游標，改成「插在指標所在段落的行尾」並在放開時才算一次（或直接取消即時預覽）；寫進 SUMMARY 作為已知上限。

### Pattern 9：刪除復原 toast（不要改 `showToast`）

`showToast`（`js/ui-common.js:51`）是單一 `#copyToast`，`.copy-toast` 有 `pointer-events:none`（`css/panels.css:897-917`），**按鈕按不到**。另建 `#undoToast`（`role="status"`、`aria-live="polite"`、`pointer-events:auto`），位置沿用 `.copy-toast` 的 `bottom: 4.375rem`＋`html.kb-open` 的 `--kb-inset` 規則（`responsive.css:705`），5 秒自動消失，內容用 `textContent`（段落名可能是使用者字串，T-08-01）；顯示時先把 `#copyToast` 收掉避免疊在一起。

### Anti-Patterns to Avoid
- **整片重畫來更新標籤／顏色／字數：** 會丟焦點、重設捲動、讓 `songs-ime` 的 MutationObserver 測試失敗。用原地更新。
- **拖曳中就改模型或 DOM 順序：** 取消（Esc）時無法乾淨還原；只用 `transform` 與插入線，放開才寫模型。
- **在 `pointerdown` 就開始詞卡拖曳（觸控）：** 會吃掉詞卡區的捲動（實測 `pointercancel`）。
- **用 `Date.now()` 在測試裡真的等 1 秒：** 用 `page.clock`。
- **用字串拼 selector 找段落（`[data-id="${id}"]`）或拼 `style.cssText`：** 一律迴圈比對 `dataset.id`、`style.setProperty('--x', validated)`。
- **把 undo 歷史寫進 localStorage：** D1 明講不做；也會觸發 `scan.spec` 的「儲存鍵必須登記」規則。
- **新增 inline `onclick/ondrag…` 屬性：** 會被 smoke 覆蓋率閘門要求補情境。

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 觸控＋滑鼠統一手勢 | 分別寫 touch*／mouse*／HTML5 DnD | Pointer Events＋`setPointerCapture`＋`touch-action` | 一套程式；capture 讓指標移出元素仍收得到事件 |
| 觸控 Playwright 事件 | 手工 `dispatchEvent(new PointerEvent)` | CDP `Input.dispatchTouchEvent` | 合成事件的 `setPointerCapture` 丟 NotFoundError（已實測）|
| 字數斷詞 | 逐字掃描＋字元範圍表 | Unicode property escapes regex（Pattern 1） | 已涵蓋 Han／假名／注音／韓文與全形字母數字 |
| 羅馬數字 | 查表到 10 | 標準減法規則函式（9 行） | 段落最多 2000 段，要能到 MMCM |
| 色盤 | 自製 color picker | 原生 `<input type="color">`＋8 個預設色票 | B4 已決定；原生元件有無障礙與平台一致性 |
| 選單定位 | 重寫夾邊界邏輯 | `lhPlaceMenu`（layout.js:153） | 已處理 visualViewport、縮放、極端尺寸 |
| 組字判斷 | 自己偵測 IME | `_lhComposing`＋`e.isComposing`＋`keyCode===229`（現有三重判斷） | Firefox 在 compositionend 後還會送最後一個 input（lyrics.js:302 註解）|
| 儲存寫入 | 直接碰 localStorage | `markDirty`＋`flushSongs` | `scan.spec` 禁止 safety.js 以外直接存取 |

**Key insight:** 這個 phase 的難點不在「做出拖曳」，而在不破壞 Phase 8 已經用大量測試鎖住的資料流（組字、跨分頁、存檔失敗、備份驗證）；每個新功能都要找到「走既有入口」的做法。

## Runtime State Inventory

本 phase 是新增功能＋資料欄位擴充，**不是**改名／搬遷，因此不適用完整盤點；但「讀到舊資料」是核心風險，逐項確認如下：

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `lh:songs` 內既有歌曲的 sections 沒有 type/custom/color/height | 延遲正規化（Pattern 2）：讀取時補、不強制寫回；**不升 `lh:schema`**。已備份檔／舊自動備份仍可還原（還原後開機再正規化）|
| Live service config | 無（純前端；Worker 不碰段落） | 無 |
| OS-registered state | 無 | 無 |
| Secrets/env vars | 無新增；不新增 localStorage 鍵（歷史只在記憶體） | `scan.spec` 規則一不受影響 |
| Build artifacts | `index.html` 30 個 `?v=0.96.12` 標籤（grep 只在 `index.html` 找到 0.96.12）| 升 0.96.13，單一 `sed`；`split-tags` 驗證一致 |

## Common Pitfalls

### Pitfall 1：合成 PointerEvent 測不了 capture
**What goes wrong:** 測試用 `dispatchEvent(new PointerEvent('pointerdown', {pointerType:'touch', pointerId:42}))`，實作裡 `setPointerCapture(e.pointerId)` 丟 `NotFoundError`，整個拖曳 session 在第一步中斷。[VERIFIED: 本 session Chromium spike：`capture ERR NotFoundError`]
**How to avoid:** 實作端一律 `try { setPointerCapture } catch (e) { lhWarn(...) }`（空 catch 會被 scan 抓）；測試端用 CDP 觸控 helper。
**Warning signs:** 觸控測試只在 headed 手測過、自動測試全用合成事件。

### Pitfall 2：字數更新造成 childList 變動
**What goes wrong:** `span.textContent = n + ' 字'` 會「移除舊 Text node、插入新 Text node」＝一筆 `childList` mutation。`tests/songs-ime.spec.mjs` 的 `watchLeftPanel` 只收 `m.type === 'childList'`，並要求打字／組字過程為 0 筆（Phase 8 D-17）。
**How to avoid:** 建立段落時就放一個 Text node（`span.append(document.createTextNode('0 字'))`），之後改 `textNode.data = ...`（`characterData` 變動，不被收）。總字數、↶↷ 的 `disabled` 同理只改屬性／`data`。

### Pitfall 3：靜態掃描測試約束 CSS／JS 寫法
- `tests/style.spec.mjs:199-227`「沒有新的顏色常數」：任何 `#xxxxxx`／`rgba()` 若不在 commit `078c5d1` 舊樣式表的白名單（加 `#5a6577`、`#4c51bf`、`rgba(0,0,0,x)` 遮罩、danger 變數行）就失敗 → **8 個預設色票放 JS 常數**；CSS 只用既有變數與 `var(--sec-color)`。
- `tests/songs-audit.spec.mjs:376-389`：選擇器含 `song|export|import|backup|danger|print-` 的規則不得寫色碼 → 新 class 名避開這些子字串（`.sec-*` 沒問題）。
- `tests/style.spec.mjs:20-32`：`font-weight` 只能 `400`／`700`；寫死的 `font-size` ≥ 0.75rem。
- `tests/style.spec.mjs:119-157`：每個 `:hover` 規則必須包在 `@media (hover: hover) and (pointer: fine)` 裡。
- `tests/scan-lib.mjs`（空 catch 掃描）：`catch` 本體或 `.catch(cb)` 必須有函式呼叫或 throw（用 `lhWarn`）；`New Expression` 不算。
- `tests/scan.spec.mjs`：新 JS 不得直接用 `localStorage`。
- `tests/split-tags.spec.mjs`：新檔加進 `JS_ORDER`、「完整 22 個」與 `length` 斷言一起改；不可有 inline script/style；UTF-8 無 BOM、LF；樣式表不得有相對 `url()`。

### Pitfall 4：標題列結構測試
`tests/songs-export.spec.mjs:328` 與 `tests/songs-ui.spec.mjs:495` 要求 `.lyrics-head > *` **剛好 4 個**（`songListToggle`、`songCurrent`、`exportToggle`、`panel-add-btn`），且 100%／150% 縮放、手機／平板／桌機都不得重疊或超出面板。標題列在 390px＋150% 已經很擠 → ↶ ↷ 與總字數放進**新的一列** `.lyrics-tools`（建議，Open Question 2），4 個子元素的測試原封不動。

### Pitfall 5：`lhNormalizeSong` 會吃掉未知欄位
`safety.js:603-608` 的 `.map(s => ({ id, label, text, collapsed }))` 沒列的欄位全丟。沒改這裡，備份匯出再匯入後顏色、高度、類型全部消失（`songs-backup.spec` 往返測試會抓到）。另外 `importAddSongs` 直接 `songs.push` 不走 `_normalizeSong`，所以正規化必須在 `lhNormalizeSong` 做完。

### Pitfall 6：Esc 被 sheet 與對話框吃掉
`panels.js:111-121` 的 Esc 會收起底部 sheet（`e.defaultPrevented` 時才略過）。拖曳中的 Esc、設定視窗的 Esc 都要在 **capture 階段** `preventDefault()`＋`stopPropagation()`，且組字中（`e.isComposing||keyCode===229`）不處理。

### Pitfall 7：進行中的互動被重畫打斷
`_applyExternalSongs`（跨分頁更新）、Undo 還原、匯入加入歌曲都會 `renderLyricsSections()`。重畫會移除正在被拖的節點與設定視窗指向的段落。**在 `renderLyricsSections()` 開頭呼叫** `lhSecAbortInteractions()`：取消段落拖曳、關閉設定視窗、取消詞卡拖曳（並還原手機分頁）。同時把設定視窗的輸入框納入 `isEditingField()` 的選擇器（songs.js:214）或在重載時關閉視窗，否則編輯自訂名稱時被別分頁蓋掉。

### Pitfall 8：點擊與長按互相污染
標籤按鈕長按開視窗後放開會再送一次 click（又循環一次）；詞卡拖曳結束放回原卡會觸發 `saveWord`。兩處都要「吞掉下一個 click」（一次性 capture 監聽）。

### Pitfall 9：Android 長按觸發既有 contextmenu
`report.js:125`、`ai-word-events.js:10` 都在 `contextmenu` 開回報選單；Android 長按約 500ms 會送 `contextmenu`（`[ASSUMED]`）。拖曳啟動後 capture 層 `preventDefault()`＋`stopImmediatePropagation()`（只限觸控類型的 pointer session，滑鼠右鍵照舊）。

### Pitfall 10：觸控捲動搶走拖曳
詞卡 `touch-action: manipulation`（`panels.css:552`、`base.css:741`），在上面直接滑動＝捲動（實測 `pointercancel`）。長按 400ms 後用 `{passive:false}` 的 touchmove 擋；移動 >8px 在長按完成前就放棄拖曳。

### Pitfall 11：color input 灌爆 Undo
`<input type="color">` 的 `input` 事件在拖色盤時連續觸發。即時預覽只改畫面，`change` 才 `lhSecApply('color')`。

### Pitfall 12：標籤淡底讓對比掉到 4.5 以下
`--text-secondary` 在 `--container-bg` 上已被調到剛好過線（`style.spec.mjs:96`：`contrast('#6b778a', '#eee3ce')` 必須 < 4.5，表示 `#5a6577` 在這個底上只是剛過）。標籤加淡底後，文字改用 `--text-primary`；淡底用 `color-mix(… 16% …, var(--container-bg))`（深色主題 `--container-bg` 是 `#ffffff` 的反相結果，客製主題任意）。自動測試要把 8 個色票 × 3 種主題（淺／深／客製）的「標籤文字 vs 淡底」都量一次 ≥ 4.5（沿用 `songs-audit.spec.mjs:313-372` 的 `contrast` 寫法）。

### Pitfall 13：DOM 搬動讓焦點消失
`insertBefore` 搬動有焦點的元素（把手）後焦點歸零（Chromium）。搬完要 `handle.focus({preventScroll:true})`（已寫進 `lhSecMoveDom`），鍵盤連按 Alt+↑ 才能連續移動。

### Pitfall 14：標籤循環整片重畫
見 Pattern 3。若用 `renderLyricsSections()` 做循環，按鈕被換掉、`songs-ime` 的游標測試與 a11y 焦點都壞。

### Pitfall 15：A3「每次重算 label」與匯出字樣
`songExportSections` 讀 `s.label.trim() || '段落 n'`。重算後所有舊歌的匯出會從「[主歌]」變「[Verse I]」，空 label 從「[段落 2]」變「[Verse]」，且新歌 `songs-journey.spec.mjs:79` 的 `'新歌\n\n[段落 1]\n第一句你\n'` 要改成 `[Verse]`。這是 B1/A3 的**必然後果**，不是 bug；測試要跟著改（見「既有測試影響」表），並在 UAT 說明。

### Pitfall 16：刪除復原 toast 的按鈕可能復原到別的操作
見 Pattern 5：只在「頂端仍是該刪除步驟」時才執行復原。

### Pitfall 17：高度與 flex 規則互相打架
見 Pattern 4 的 CSS 疊加段落：`data-index="0"`、`.collapsed`、`.has-h` 同權重；`min-height:7rem` 與 A4 的 4rem 下限衝突時，只有 `has-h` 才放寬。桌機的 textarea 本來就不撐滿段落（實測 72px／段 159px），別把這個既有現象當成新 bug。

### Pitfall 18：視覺基準
`tests/visual.spec.mjs` 的「lyrics」三張（desktop／tablet／phone）一定會變（把手、按鈕式標籤、字數、↶↷ 列）。`-darwin` 可在這台 Mac `npm run visual:update` 重拍並**目視確認後**提交；`-linux` 只有 Andy 在雲端容器能更新（handoff.md 已寫這是既有待辦）。計畫要把「更新 darwin、列入 linux 待辦」寫成明確任務，不能留紅燈。

### Pitfall 19：鏡像 div 在超長文字上很貴
見 Pattern 8：快取鏡像、`value.length > 200000` 降級。

### Pitfall 20：原生堆疊被 `.value=` 清空
實測：程式 `ta.value='…'` 後 Ctrl+Z 只有 `keydown`，沒有 `beforeinput`。只攔 `beforeinput` 會漏；只攔 keydown 會漏選單與搖一搖。兩條都要。

### Pitfall 21：iOS 輸入框自動放大
任何新的文字輸入框（自訂名稱）都要加進 `responsive.css:737` 的 ≥16px 清單。

### Pitfall 22：custom 長度上限的來源不同
A4 的 custom ≤ 40 字；`LH_IMPORT_CAPS.label` 是 200。舊 label 超過 40 字被推斷成 custom 時會被截成 40（用字元不是 UTF-16 單位，沿用 `_lhCut` 的 `Array.from` 寫法）——極端情況，記進 SUMMARY。

### Pitfall 23：smoke 覆蓋率閘門
`tests/smoke.spec.mjs:236-258`：原始碼裡每個 inline handler 的函式名都要被某個情境觸發。刪掉舊的 inline handler 沒問題；**新增** inline handler 才需要補情境。本研究建議全部用委派，因此預期不需動 smoke。

## Code Examples

### CDP 觸控拖曳／長按 helper（建議放 `tests/drag-lib.mjs`）
```js
// Source: 本 session spike（Input.dispatchTouchEvent 在 hasTouch+isMobile 的 context 產生真的 pointerType:'touch' 事件）
export async function touchSession(page) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  return {
    down: (x, y) => send('touchStart', x, y),
    move: (x, y) => send('touchMove', x, y),
    up: () => send('touchEnd'),
    async drag(from, to, steps = 8) {              // 直接拖（把手：touch-action:none）
      await this.down(...from);
      for (let i = 1; i <= steps; i++) await this.move(from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps);
      await this.up();
    },
    async longPressDrag(from, to, hold = 450, steps = 8) {   // 詞卡：長按 400ms 不動再拖
      await this.down(...from); await page.waitForTimeout(hold);   // 或 page.clock.runFor(hold)
      for (let i = 1; i <= steps; i++) await this.move(from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps);
      await this.up();
    },
  };
}
// 滑鼠：page.mouse.move(x,y); page.mouse.down(); page.mouse.move(x2,y2,{steps:6}); page.mouse.up();
```

### 游標索引的標準答案比對（建議放 `tests/word-drag.spec.mjs`）
```js
// 真實點擊 → selectionStart 就是標準答案；對網格上的每個點比對 lhCaretIndexAt（只在 textarea 內側、避開上方 padding）
await page.mouse.click(x, y);
const truth = await ta.evaluate(el => el.selectionStart);
const mine = await page.evaluate(([x, y]) => lhCaretIndexAt(document.querySelector('.section-textarea'), x, y), [x, y]);
expect(mine).toBe(truth);
```

### 組字中的 Undo 粒度（沿用 `tests/helpers.mjs` 的 `compose`）
```js
await compose(page, ['ㄋ', 'ㄋㄧ', 'ㄋㄧˇ'], '你');                 // 組字中不記、確認後記一筆
await page.keyboard.press('Control+z');                              // 一次就回到組字前
expect(await ta.inputValue()).toBe('');
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| HTML5 `draggable`＋`dragstart/over/drop` | Pointer Events＋明確把手 | 本 phase | 觸控可用、不再與標籤輸入框／文字選取打架（C1）|
| 標籤 `<input>`＋雙擊改名 | `<button>`＋循環＋設定小視窗 | 本 phase | 單擊不衝突；`.section-label` 選擇器保留、元素型別改變 |
| 刪除前 `confirm()` | 刪除＋5 秒「復原」toast＋Undo | 本 phase | `layout.spec.mjs:1788-1850` 兩個測試改寫 |
| `document.caretRangeFromPoint`（WebKit 專有） | `caretPositionFromPoint`（MDN：2025-12 Baseline） | 2025-12 | 在 textarea 內仍不保證 → 鏡像法保底 |

**Deprecated/outdated:** 無需移除的依賴。`onSectionDrag*` 一組函式與 `enableSectionLabel／disableSectionLabel` 整組刪除。

## Existing Tests That Will Break / Need Updating

| 檔案：行 | 現況 | 要怎麼改 |
|---------|------|----------|
| `tests/songs-model.spec.mjs:25,43,96,105` | `page.locator('.section-label').…inputValue()`／`.value` | 改 `textContent`；`:25` 預期值從 `LEGACY[i].label` 改成「推斷後的名稱」（`主歌`→`Verse I`…，視 fixture 而定）；`:43` 的 `<b>x</b>` 仍是 custom，顯示原字串；`:96` `'新段落'` → 新增段落的預設名稱；`:105` `['歌詞','新段落']` → `['Verse I','Verse II']`（兩段都推斷成 verse）|
| `tests/songs-model.spec.mjs:59-60` | `dblclick()` 再 `blur()` 驗證「畫面被改動不會寫回」 | 標籤不再是輸入框，dblclick 會循環兩次類型；改成對 textarea 做同樣的「不送 input 事件改值」驗證，或點別處觸發 focusout |
| `tests/songs-model.spec.mjs:82,143` | 刪除有內容的段落（`bootPage` 的 dialog handler 自動按確定） | confirm 拿掉：直接 `click` 後段落就消失；`:143` 同 |
| `tests/songs-ime.spec.mjs:80-96`「段落名稱組字中按 Enter 不結束編輯」 | `dblclick` 標籤→組字→Enter | 改成「設定視窗的自訂名稱輸入框」：右鍵開窗→選 Custom→對輸入框 `compose`→組字中 Enter 不存、確認後 Enter 才存 |
| `tests/layout.spec.mjs:1639` | `['歌詞開著', [..., 'input.section-label', ...]]` | `input.section-label` → `button.section-label`；新增把手 `.sec-handle`、拉桿、↶↷ 到必掃清單，確認 44px 與相鄰不重疊 |
| `tests/layout.spec.mjs:1788-1850` | 兩個「刪除：…先確認」測試（`confirm` 文字逐字比對） | 整段改寫：不再有 dialog；斷言「刪除後出現 `#undoToast`、按『復原』段落與文字回來、存檔跟著回復」；`<b>x</b>` 純文字顯示改成斷言 toast 文字以 `textContent` 顯示 |
| `tests/songs-export.spec.mjs:22-23,255-260` | `TXT_EXPECTED`／`MD_EXPECTED` 含 `[主歌]`、`[段落 2]`；列印頁 `<b>段</b>` | `[主歌]`→`[Verse]`（該歌只有一個 verse）；空 label 的兩段都推斷 verse → `[Verse I]`/`[Verse II]`；`<b>段</b>` 仍是 custom 原樣 |
| `tests/songs-journey.spec.mjs:79` | `'新歌\n\n[段落 1]\n第一句你\n'` | `[Verse]` |
| `tests/songs-export.spec.mjs:328`、`tests/songs-ui.spec.mjs:495` | `.lyrics-head > *` 剛好 4 個 | **若**採 `.lyrics-tools` 新列則不動；若 ↶↷ 塞進 `.lyrics-head` 則要改並重驗 150% 縮放不重疊 |
| `tests/split-tags.spec.mjs:11-15,57-59` | `JS_ORDER` 22 項；「22 個」 | 加入 4 個新檔（26 項）與順序；`?v=` 全部 0.96.13 |
| `tests/visual.spec.mjs` 的 `*-lyrics-darwin.png` ×3 | 舊版面 | `npm run visual:update` 後目視確認再提交；`-linux` 列為 Andy 待辦 |
| `tests/smoke.spec.mjs` | 原始碼 handler 覆蓋率 | 預期不需動（改用委派）；若新增 inline handler 才要補 SCENARIOS |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | 測試、Node 純函式測試 | ✓ | v26.8.1 | — |
| Playwright + Chromium | 全部 e2e、CDP 觸控 | ✓ | 1.63.0；`~/Library/Caches/ms-playwright/chromium-1243`、`chromium_headless_shell-1243` | — |
| WebKit／Firefox 引擎 | 跨瀏覽器驗證 | ✗（只裝 Chromium） | — | 列入人工驗收（iOS Safari／Android Chrome 手感） |
| Docker（產生 -linux 截圖基準） | `visual:update` linux 組 | 未探測（Andy 的雲端容器流程，handoff.md 已寫） | — | 只更新 -darwin，linux 列待辦 |

**Missing dependencies with no fallback:** 無（程式面）。
**Missing dependencies with fallback:** WebKit／Firefox → 人工驗收；-linux 截圖 → Andy 待辦。

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright Test 1.63.0（含純 Node 測試經 `node:vm` 載入 `js/*.js`）|
| Config file | `playwright.config.mjs`（testDir `tests`，`webServer: node tests/serve.mjs`，port 4310，`fullyParallel`，`retries:0`）|
| Quick run command | `npx playwright test tests/sections-core.spec.mjs tests/undo.spec.mjs --workers=4`（目標 < 30s）|
| Full suite command | `npm test`（Phase 8 結束時 716 過／27 跳過／0 失敗 [CITED: handoff.md]；本 phase 完成時 `-linux` 截圖測試在 Mac 上不跑）|

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EDIT-05 | `lhInferSecType`／`lhSecNames`／`lhToRoman`／`lhSecFields`：推斷表、單一不編號、≥2 編號、Custom 不編號、壞值丟棄、冪等 | unit（Node vm） | `npx playwright test tests/sections-core.spec.mjs` | ❌ Wave 0 |
| EDIT-05 | 左鍵循環 Intro→…→Custom→Intro；拖曳／新增／刪除後羅馬數字立即重算；label 寫回模型 | e2e | `npx playwright test tests/sections-ui.spec.mjs -g "循環\|編號"` | ❌ Wave 0 |
| EDIT-06 | 右鍵（桌機）／長按 500ms（CDP 觸控）開設定窗；色票與 `<input type=color>` 改色；`--sec-color` 與 `color` 存檔；Esc／點外關閉；組字中 Enter 不送出 | e2e | `npx playwright test tests/sections-ui.spec.mjs -g "設定\|顏色"` | ❌ Wave 0 |
| EDIT-06 | 8 色票 × 淺／深／客製主題的標籤文字對比 ≥ 4.5 | e2e（量計算後顏色） | `npx playwright test tests/sections-ui.spec.mjs -g "對比"` | ❌ Wave 0 |
| EDIT-07 | `lhCountWords` 表格（中英混合、全形、標點、emoji）＋ 88 萬字 < 100ms | unit（Node） | `npx playwright test tests/sections-core.spec.mjs -g "字數"` | ❌ Wave 0 |
| EDIT-07 | 打字即時更新段落字數與總字數；組字中不變、`compositionend` 後才變；**打字期間 `#leftPanel` 零 childList 變動** | e2e | `npx playwright test tests/sections-ui.spec.mjs -g "字數"` | ❌ Wave 0 |
| EDIT-02 | 滑鼠拖把手排序（page.mouse）；CDP 觸控拖把手；Esc 取消（模型不變）；靠邊自動捲動；Alt+↑↓；設定窗上下移；拖曳後 textarea 內容／捲動位置保留 | e2e | `npx playwright test tests/sections-drag.spec.mjs` | ❌ Wave 0 |
| EDIT-02 | 拉桿改高度、重新整理保留、雙擊回自動、收合不顯示、高度不進 undo；預設段落仍 ≥ 112px | e2e | `npx playwright test tests/sections-drag.spec.mjs -g "高度"` | ❌ Wave 0 |
| EDIT-03 | `lhHist`：連打合併（`page.clock` 超過 1 秒切步）、換段切步、100 步上限、redo 清空規則、保留 collapsed／height | unit＋e2e | `npx playwright test tests/undo.spec.mjs` | ❌ Wave 0 |
| EDIT-03 | IME 組字結束記一筆；Cmd/Ctrl+Z／Shift+Z／Ctrl+Y 在歌詞區攔截、在搜尋框／情境框維持原生；`beforeinput historyUndo` 攔截；↶↷ disabled；跨分頁更新清空歷史 | e2e | `npx playwright test tests/undo.spec.mjs -g "鍵盤\|組字\|跨分頁"` | ❌ Wave 0 |
| EDIT-03 | 刪除段落＋「復原」toast＋Ctrl+Z 都能救回；toast 在頂端已變時不復原 | e2e | `npx playwright test tests/sections-ui.spec.mjs -g "刪除"` | ❌ Wave 0 |
| AI-06 | 滑鼠拖 AI 詞卡／字卡 >5px 進 textarea 指定位置插入；插入後 undo 一次還原；單純點擊（`saveWord`／選字）不插入；報告模式不啟動；`.mark-badge` 不啟動 | e2e | `npx playwright test tests/word-drag.spec.mjs -g "滑鼠"` | ❌ Wave 0 |
| AI-06 | 觸控長按 450ms 後拖（CDP）；400ms 前移動 >8px＝捲動不拖；touchmove 被擋；contextmenu 被抑制；放在 textarea 外＝取消；拖曳後不誤觸 click | e2e | `npx playwright test tests/word-drag.spec.mjs -g "觸控"` | ❌ Wave 0 |
| AI-06 | 手機版型：拖曳開始切到歌詞分頁、取消還原原分頁、成功留在歌詞；收合段落停 0.6 秒展開（`page.clock`） | e2e（`DEVICES.phone`） | `npx playwright test tests/word-drag.spec.mjs -g "手機\|收合"` | ❌ Wave 0 |
| AI-06 | `lhCaretIndexAt` 與真實點擊 `selectionStart` 在網格上一致（含捲動中、空行、換行） | e2e（Chromium） | `npx playwright test tests/word-drag.spec.mjs -g "游標索引"` | ❌ Wave 0 |
| A4（資料） | 備份匯入白名單：type 不在清單／color 非 `#rrggbb`／height 超範圍／custom 超長 → 丟欄位、段落照收；往返不遺失；`__proto__` 不污染 | e2e | `npx playwright test tests/songs-backup.spec.mjs tests/sections-ui.spec.mjs -g "匯入"` | 部分（`songs-backup` 存在，新案例加進去）|
| 回歸 | Phase 8 全部（組字、跨分頁、存檔失敗、匯出、audit）、split-tags、style、scan、smoke | 既有 | `npm test` | ✅（需依上表更新）|

### Sampling Rate
- **Per task commit:** 該任務對應的單一 spec（上表 Quick run），再加 `npx playwright test tests/split-tags.spec.mjs tests/style.spec.mjs tests/scan.spec.mjs`（三個靜態掃描幾秒內跑完，最容易被新 CSS／JS 弄壞）
- **Per wave merge:** `npx playwright test tests/songs-*.spec.mjs tests/sections-*.spec.mjs tests/undo.spec.mjs tests/word-drag.spec.mjs tests/layout.spec.mjs tests/smoke.spec.mjs`
- **Phase gate:** `npm test` 全綠（-darwin 截圖已重拍並目視確認）再進 `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/sections-core.spec.mjs` — 純函式（EDIT-05、EDIT-07）；`tests/node-core.mjs` 的 `CORE` 不必改，用自己的 `vm` 載入 `js/sections-core.js`（它不依賴其他檔）
- [ ] `tests/drag-lib.mjs` — `touchSession`（CDP）、`mouseDrag`、`longPress`、`caretOracle` helper
- [ ] `tests/sections-ui.spec.mjs`、`tests/sections-drag.spec.mjs`、`tests/undo.spec.mjs`、`tests/word-drag.spec.mjs`
- [ ] 更新既有測試（見上方「既有測試影響」表）——應與對應實作任務同一個 plan，避免中間 commit 紅燈
- [ ] `js/sections-core.js` 先於 UI 完成（其他全部依賴它）

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | 無帳號系統 |
| V3 Session Management | no | 無 |
| V4 Access Control | no | 單人本機工具 |
| V5 Input Validation | **yes** | 備份匯入白名單（`lhNormalizeSong`）：`type` 用 `Set` 比對、`color` 用 `^#[0-9a-fA-F]{6}$`、`height` 數字範圍、`custom` 字元截斷；所有顯示用 `textContent`／`.value`；CSS 變數只吃驗證過的值 |
| V6 Cryptography | no | 無 |
| V12 Files / V13 API | 部分 | 備份檔 5 MB 上限與格式檢查沿用 Phase 8；不新增網路請求 |

### Known Threat Patterns for 純前端編輯器

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| 備份檔的 `color` 夾帶 CSS（`red;background:url(x)`）注入 style | Tampering | 嚴格 regex 驗證；只用 `style.setProperty('--sec-color', v)`，不拼 `cssText`／`setAttribute('style')` |
| 備份檔 `type: "__proto__"`／`constructor` 造成原型污染或查表異常 | Tampering | `Set.has`／`Map.has`，不用物件字面量查表；`lhSecFields` 已實測 `'__proto__'` 被丟棄 |
| 段落名稱（custom／舊 label）含 HTML 被當標記執行（`<b>x</b>`、`<img onerror>`） | XSS | 一律 `textContent`；`aria-label` 用 `setAttribute`（屬性值不會被解析成 HTML）；toast 同 |
| 拼 selector 找段落（`[data-id="${id}"]`）被怪 id 打斷 | Tampering | id 已被 `LH_ID_RE` 限制，仍用迴圈比對 `dataset.id` |
| 超長文字（100 萬字、2000 段）造成拖曳／字數／鏡像卡死 | DoS | 字數 regex 線性（實測 88 萬字 18ms）；鏡像快取＋>20 萬字降級；段落字數 Map 快取；拖曳用 rAF 節流 |
| 詞卡 `data-word` 含特殊字元插入 textarea | Tampering | 插入的是 `.value` 字串，不經 HTML；`aiWordCardHtml` 已對屬性跳脫（ai-generate.js:6）|

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | iOS Safari 在觸控長按後對 document 層 `{passive:false}` 的 `touchmove` 呼叫 `preventDefault` 能擋掉捲動（Chromium 已實測） | Pattern 7 | 手機 Safari 詞卡拖曳時畫面一起捲，拖曳中斷；需實機驗收，必要時改為在 `touchstart` 即註冊並以 CSS 加上 `touch-action:none` 的暫時 class |
| A2 | iOS Safari 長按非連結元素不一定送 `contextmenu`（所以標籤長按要自己計時） | Pattern 6 | 若其實會送，雙重觸發設定窗——已用「按鈕上 contextmenu 一律 preventDefault＋吞 click」保險 |
| A3 | Android Chrome 長按約 500ms 會送 `contextmenu`（會誤開回報選單） | Pitfall 9 | 若不送則多做一層無害的抑制 |
| A4 | iOS 搖一搖復原、Android 鍵盤復原會送 `beforeinput historyUndo/historyRedo` | Pattern 5 | 這些入口走原生 undo，可能與應用層堆疊不一致；人工驗收，最差情況 ↶↷ 按鈕可用 |
| A5 | iOS 上按 ↶↷ 時 `mousedown preventDefault` 能讓 textarea 不失焦 | Pattern 5 | 鍵盤收起；可接受（按鈕仍可用），列入人工驗收 |
| A6 | iOS Safari 在拖曳中來源面板被 `inert`／`display:none` 後仍持續送 pointermove（Chromium 已實測可行） | Pattern 7 | 手機版 F7 拖曳中斷；備案：F7 不改 `inert`，只在拖曳期間用 class 把 AI sheet 滑出畫面 |
| A7 | `navigator.vibrate` 在 iOS 不存在（只有 Android 有） | F3 | 無震動回饋，功能不受影響（程式本來就先偵測） |
| A8 | Safari／Firefox 的 `caretPositionFromPoint` 在 textarea 內行為不一致（所以以鏡像法為主） | Pattern 8 | 鏡像法本身不依賴它，風險低 |
| A9 | 桌機 Safari 對 `setPointerCapture`＋滑鼠拖曳行為與 Chromium 相同 | Pattern 4 | 排序拖曳在 Safari 桌機異常；人工驗收 |
| A10 | `color-mix()` 在使用者實際裝置（含舊 iPad）可用 | Pattern 6 | 已加 `@supports` 退回只畫左色條；MDN 標為 2023-05 起 Baseline |

## Open Questions (RESOLVED)

1. **A3「label 重算」造成匯出字樣改變（主歌→Verse I、空白→Verse）。**
   - What we know: B1 標籤用英文、A3 label 存顯示名稱、`songExportSections` 讀 label；舊歌讀入時 type 從 label 推斷。5 個既有 spec 的預期字串因此要改（見上表）。
   - What's unclear: Andy 是否接受舊歌匯出從「[主歌]」變「[Verse]」。
   - RESOLVED（採用，見計畫 09-01～09-10）: 照 A3 做（label 在記憶體重算、**讀取不強制寫回磁碟**，使用者下次編輯該歌才落地）；在 UAT 清單明講「匯出標題字樣改為英文」；若 Andy 反對，回退成「匯出用原 label（custom 以外的歷史字樣）」只需改 `songExportSections` 一個函式。

2. **↶ ↷ 與總字數放哪一列。**
   - What we know: `.lyrics-head` 已有 4 個子元素，窄螢幕＋150% 縮放就很擠，兩個既有測試鎖死「剛好 4 個、不重疊」。
   - RESOLVED（採用，見計畫 09-01～09-10）: 新增 `.lyrics-tools` 一列（放在 `.lyrics-head` 與 `.lyrics-layout` 之間）：左邊 ↶ ↷（各 `--hit`），右邊「共 N 字」。D5 的「標題列」以「歌詞面板標題區」解讀。UI-SPEC 可再調整，但要保住上述兩個測試或同步改它們。

3. **拉桿的觸控高度。** C4 要求命中區 ≥ 44px，每段多 44px 在手機吃螢幕。
   - RESOLVED（採用，見計畫 09-01～09-10）: 拉桿放在段落最底（in-flow，不蓋 textarea）；`(pointer: fine)` 約 0.75rem 高、`(pointer: coarse), (max-width: 900px)` 用 `min-height: var(--hit)`，中間畫一條短灰線。由 UI-SPEC 定視覺。

4. **桌機左面板收合時拖詞卡。**
   - RESOLVED（採用，見計畫 09-01～09-10）: 不自動展開（會把來源右面板擠收，見 `syncCenterPanel`），改 toast 提示並不啟動拖曳。

5. **`-linux` 視覺基準。**
   - RESOLVED（採用，見計畫 09-01～09-10）: 計畫內只更新並目視確認 `-darwin`，在 SUMMARY／handoff 把「雲端容器 `npm run visual:update` 更新 -linux」列為 Andy 待辦（與 Phase 8 一致）。

6. **段落字數是否納入「情境」AI 的輸入。** 不影響（AI 讀 `s.text`），無需處理。RESOLVED。

## Sources

### Primary (HIGH confidence)
- 本 repo 原始碼（本 session 以 Read 逐檔讀過）：`js/lyrics.js`、`js/songs.js`、`js/safety.js:380-720`、`js/layout.js`、`js/panels.js`、`js/ai-word-events.js`、`js/report.js:1-200`、`js/ui-common.js`、`js/song-io.js:1-30,300-360`、`js/cards.js:95-111`、`js/ai-generate.js:1-30`、`index.html:200-467`、`css/panels.css`（歌詞段落、toast、選單）、`css/responsive.css`、`tests/{helpers,smoke,split-tags,style,scan,songs-audit,songs-model,songs-ime,songs-export,songs-ui,layout}.spec.mjs` 相關段落、`playwright.config.mjs`、`package.json`、`handoff.md`
- 本 session 本機實測（Chromium 1243、Playwright 1.63.0，腳本在 scratchpad spike/）：Pointer capture（滑鼠、CDP 觸控、合成事件）、`touch-action` 與 pointercancel、長按後 `display:none`＋`inert` 的事件持續性、`beforeinput historyUndo`／`keydown`／`.value=` 後原生堆疊、鏡像 div 游標演算法（標準答案＝真實點擊 selectionStart）、`caretPositionFromPoint` 在 textarea、字數 regex、推斷／羅馬數字／欄位整理
- MDN `Document.caretPositionFromPoint`（Baseline 2025-12；頁面未提 textarea）；MDN `color-mix()`（Baseline Widely available 2023-05）

### Secondary (MEDIUM confidence)
- `.planning/research/FEATURES.md`（觸控拖曳需 Pointer Events＋把手、Undo 快照堆疊、上下移保底）——該檔自己標註未逐一驗證，本研究已用實測補強關鍵項

### Tertiary (LOW confidence)
- iOS Safari／Android 行為（A1–A9）——僅 training knowledge，已列入 Assumptions Log 與人工驗收

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 全部是瀏覽器原生 API 與專案既有工具，無新依賴
- Architecture: HIGH — 接點逐一讀過原始碼，關鍵演算法本機實測
- Pitfalls: HIGH — 靜態掃描／既有測試衝擊是直接讀測試檔得到；觸控平台差異為 MEDIUM（A1–A9）

**Research date:** 2026-10-23
**Valid until:** 2026-11-22（專案內部程式碼穩定；瀏覽器平台行為以 30 天為限）
