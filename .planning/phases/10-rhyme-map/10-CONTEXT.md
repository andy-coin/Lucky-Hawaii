# Phase 10: Rhyme Map 韻腳地圖 - Context

**Gathered:** 2026-10-23
**Status:** Ready for planning
**Mode:** Autonomous smart discuss — Andy 睡覺中、授權不逐一詢問；以下全部是 Claude 依專案慣例與既有決定選的推薦方案（Claude's Discretion），事後由 Andy 在 UAT 一併確認

<domain>
## Phase Boundary

寫詞時一眼看出押韻結構：句尾字依韻部自動上色、段落韻腳統計與押韻結構字母（AABB）、嚴格／寬韻切換、忽略句尾語助詞、可選的句中押韻偵測、破音字手動指定讀音、選取歌詞中的字即可查韻／AI 建議。判定一律沿用既有核心押韻規則（MAP-01），組字中不分析、長篇不卡（MAP-12）。

不在本 phase：逐行字數與斷句結構、段落比對（Phase 11 MAP-09/10）；完整「設定頁」（Phase 11 MAP-11）——本 phase 只做最小的開關選單，Phase 11 再搬進設定頁並加上位置／大小／顏色自訂。
</domain>

<decisions>
## Implementation Decisions

### A. 判定規則（MAP-01、MAP-06、MAP-08）
- **A1** 不寫新判定：一個字的「韻」＝ `getZhuyinRhyme(zhuyin)`（js/search.js）；**寬韻**（預設）＝同 `RHYME_TO_FAMILY` 家族即押韻；**嚴格**＝韻母完全相同才押韻——兩者正是 `validateWordRhyme` 既有的家族判定與「不延伸韻」(`filterNoExtRhyme`) 判定，抽成共用的純函式給查韻與韻腳地圖兩邊用（同一組測試資料兩邊結果一致，SC1）。
- **A2** 讀音來源順序：(1) 使用者手動指定的讀音 → (2) 句尾若是詞庫裡的詞（由長到短 4→2 字比對），用該詞的讀音 → (3) 字典 `getCharAllReadings(char)[0]`（已按破音字常用順序排）。
- **A3** 手動指定讀音（MAP-08）：沿用既有破音字 chips（`renderPolyphonicChips`／`getCharAllReadings`）；在選字浮動列（見 D）裡，破音字多一顆「讀音」按鈕，選了就存。存法：每首歌 `readings` 物件，key＝「該行句尾最後最多 4 個字」字串＋字的位置，value＝讀音；行內容改變到 key 對不上就自動失效（不會套錯字）。存進 lh:songs 該首歌（向下相容：舊版本忽略多出的欄位），備份白名單同步接受並驗證（讀音必須是該字在字典裡的合法讀音）。
- **A4** 字典查不到的字（英文、數字、符號、罕字）不上色、不算進統計；行尾的全形／半形標點與空白先去掉再找句尾字。
- **A5** 字典與詞庫還沒載好時不上色（不顯示錯誤），載好後自動補畫。

### B. 句尾上色與呈現（MAP-02）
- **B1** 不把 textarea 換成 contenteditable（會破壞 Phase 8/9 的組字與資料流）。改用「背景鏡像層」：每個段落的 textarea 後面疊一層字距行高完全一致的 div（沿用 Phase 9 `word-drag.js` 量游標的鏡像技巧），只把句尾字畫成「螢光筆底色」，textarea 背景透明、文字照常可編輯；捲動同步。
- **B2** 顏色依韻部家族：16 個家族各一色，晝夜兩套（色票放 JS 常數，比照 Phase 9 段落顏色，CSS 不新增色碼），淡底不影響文字對比 ≥ 4.5。嚴格模式下同家族不同韻母用同色系但另加細底線區分？——不做，嚴格模式只影響「誰跟誰算押韻」（字母與統計），顏色仍按家族（避免 16 色變 30+ 色）。
- **B3** 只出現一次、段落內沒有任何其他句押到的句尾：仍上色（顏色＝它的韻），但較淡，一眼看出「孤句」。
- **B4** 預設開啟句尾上色（MAP-11：全新使用者預設只開這一項）。

### C. 段落統計與結構字母（MAP-04）
- **C1** 每行（以換行分，空行略過）一個字母：段落內第一次出現的韻＝A、下一個新韻＝B…；押韻判定依目前的嚴格／寬韻；查不到韻的行標「-」。
- **C2** 段落標題列（Phase 9 的字數旁）顯示結構字母串，例如「AABB」，超過 12 行時縮成前 12 個＋「…」；滑鼠移上／點一下顯示統計：每個韻的次數（例「ㄤ ×3、ㄧ ×2」）與押韻句比例。
- **C3** 字母與統計預設**關閉**（MAP-11 只開句尾上色），在韻腳選單裡開；字母也可畫在每行右側（鏡像層行尾後方淡色小字）——預設只放標題列，不畫行內，避免擠。
- **C4** 統計純文字，不另開面板。

### D. 選字查韻（MAP-05）
- **D1** 一般點擊 textarea 仍是放游標（不能每點一下就換查詢）。觸發方式：在歌詞裡**選取文字**（滑鼠反白、雙擊、手機長按選字）後，選取範圍旁出現小浮動列「🔍 查韻　✨ AI 建議」（破音字再加「讀音」）；按「查韻」＝把選取的最後一個字（或整段詞）送進既有搜尋框並執行查詢，手機版自動切到「查韻」分頁；按「AI 建議」＝查詢後直接觸發 AI 建議。
- **D2** 另外，點標題列結構字母的某個字母 → 查該行的句尾字。
- **D3** 浮動列在組字中不出現；Esc、捲動、點別處就收起；Phase 11 的「分析」按鈕之後會加進同一個浮動列。

### E. 語助詞與句中押韻（MAP-07、MAP-03）
- **E1** 忽略句尾語助詞，預設**開**。清單：啊、呀、哪、呢、喔、哦、噢、吧、啦、嘛、耶、欸、囉、唷、了、的、嗎（了／的／嗎也列入，因為在歌詞句尾多半是虛字；可關）。行尾連續多個語助詞都跳過；整行都是語助詞就用最後一個字。被跳過的語助詞不上色。
- **E2** 句中押韻偵測預設**關**。開啟時：行內（不含句尾）跟本段落任一句尾押同韻的字，畫同色的細底線（不是螢光底），每行最多標 3 個以免滿版。
- **E3** 這三個開關（嚴格／寬韻、忽略語助詞、句中押韻）＋句尾上色總開關＋結構字母開關，放在歌詞面板 `.lyrics-tools` 列新增的「韻腳」選單按鈕裡；存成登記在 safety.js 的 setting 鍵（`lh:map`，一個 JSON 物件），會跟著備份；Phase 11 搬進設定頁。

### F. 效能與組字（MAP-12）
- **F1** 組字中（`_lhComposing`）完全不分析、不重畫鏡像層；`compositionend` 後才排程。
- **F2** 打字後 debounce 約 200ms、用 `requestIdleCallback`（沒有就 setTimeout）只重算**被改的那一段**；每段分析結果快取（key＝段落文字＋設定＋讀音覆寫）；一次只改那段的鏡像層。
- **F3** 量測：100 行以上歌詞連續打字，主執行緒沒有 > 50ms 的長任務（沿用 Phase 5 perf 測法）。

### G. 外觀與相容
- **G1** 沿用 Phase 5／9 規則：rem、觸控 ≥ 44px、晝夜／客製主題、hover 只給滑鼠、減少動態不做動畫；視覺細節由 UI-SPEC 定。
- **G2** 不動 Phase 8/9 資料流：打字只寫模型、組字中不碰 DOM（鏡像層也不碰）、用 data-id 找段落、一律 textContent。
- **G3** 版號 `?v=` 升到 0.96.14；新程式可另開 `js/rhyme-core.js`（純函式：取讀音、判押韻、算字母與統計，Node 可測）與 `js/rhyme-map.js`（鏡像層、選單、浮動列）——切分由 planner 定。

### Claude's Discretion
- 以上 A～G 全部是 Claude 自主決定（Andy 授權）。最可能被 Andy 推翻、已列入 UAT 待確認：B1 用背景螢光筆而不是改字色、B2 嚴格模式顏色仍按家族、B3 孤句較淡、C3 字母與統計預設關、D1 用「反白→浮動列」而不是單擊查韻、E1 了／的／嗎 也算語助詞、A3 手動讀音綁定「句尾 4 字」。
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `js/search.js`：`getZhuyinRhyme`、`stripTone`、`getZhuyinTone`、`searchRhyme`（查韻入口）。
- `js/phonetic-tables.js`：`RHYME_FAMILIES`、`RHYME_TO_FAMILY`、`BORROW_MAP`。
- `js/candidates.js`：`validateWordRhyme`（家族 vs `filterNoExtRhyme` 嚴格判定的既有寫法）。
- `js/dict.js`：`charInfo[char] = [{zhuyin, tone, tier}]`；`js/polyphonic.js`：`getCharAllReadings`、`isPolyphonic`、`renderPolyphonicChips`。
- `js/wordlist.js`：詞庫資料（詞的讀音，用於 A2 第 2 步）。
- `js/word-drag.js`：textarea 鏡像 div 量字位置（`lhCaretIndexAt` 一帶），B1 鏡像層可共用量測設定。
- `js/sections.js`／`js/lyrics.js`：段落 DOM（data-id）、`lhSecRefreshMeta`、字數 Text node、`.lyrics-tools` 列；`js/songs.js`：`curSong`、`_lhComposing`、`markDirty`／`flushSongs`。
- `js/safety.js`：`LH_KEYS` 登記、`lhNormalizeSong` 白名單（新欄位 `readings` 要加驗證）。

### Established Patterns
- classic script＋全域函式、無建置；`?v=` 一致（`tests/split-tags`）；色碼不進 CSS（style.spec）；catch 要 `lhWarn`；不直接用 localStorage。
- 測試：Playwright＋Node vm 純函式測試；`tests/perf.spec.mjs` 長任務量測；截圖只更新 -darwin。

### Integration Points
- 段落 textarea 外層（鏡像層插入點）、段落標題列（結構字母）、`.lyrics-tools`（韻腳選單按鈕）、搜尋框與 `_handleSearch`（查韻）、AI 建議入口（`ai-generate.js`）、手機底部分頁切換（`layout.js`）。
</code_context>

<specifics>
## Specific Ideas

- 研究檔 FEATURES.md 曾提到 CSS Custom Highlight API；但它不能畫在 textarea 內部，所以用鏡像層（planner/researcher 請確認）。
- Andy 的「核心演算法」＝ BORROW_MAP／RHYME_FAMILIES 與現有篩選規則；嚴格／寬韻＝既有「不延伸韻」開關的兩種狀態。
</specifics>

<deferred>
## Deferred Ideas

- 押韻顏色自訂、標記位置與大小（Phase 11 MAP-11）。
- 跨段落押韻統計（整首歌的韻腳表）。
- 雙押／多字韻（句尾兩字都押）偵測。
- 台語／粵語讀音。
</deferred>

## Amendments after UI-SPEC / plan check (2026-10-23, Claude's Discretion, autonomous)

- **C2 / D2 修正：** 標題列字母在 390px 手機上放不下 44px 的點擊目標，所以「點字母查該行」改為：點標題列字母串 → 開統計小視窗，裡面逐行列出句尾字，點一行就查那一行（UI-SPEC D-10）；統計只用點擊／Enter／空白鍵開，滑鼠移上只顯示 title 提示（UI-SPEC D-11）。意圖不變，列入 UAT 讓 Andy 確認。
- **G2 修正：** 組字中鏡像層可以切換根節點的一個 class（`rm-stale`，把舊色塊暫時藏起來），子節點零變動（UI-SPEC D-06）。
- **計畫 10-01 檔案數 15：** 接受。這個專案的規則是「改動與被它影響的既有測試放在同一份計畫」（避免中間 commit 紅燈），所以 tracer 必須一起調整 6 個既有測試檔；Phase 9 的 09-01（14 檔）同樣做法順利執行。
