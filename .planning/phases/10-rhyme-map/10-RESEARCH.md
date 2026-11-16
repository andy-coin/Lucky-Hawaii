# Phase 10: Rhyme Map 韻腳地圖 - Research

**Researched:** 2026-10-23
**Domain:** 無建置 vanilla JS（classic script）＋ Playwright；textarea 背景鏡像層、押韻判定共用純函式、選取浮動列、每段增量分析
**Confidence:** HIGH（判定規則、儲存、測試衝擊、鏡像對齊都在本專案實跑驗證過）；MEDIUM（Safari／Firefox／iOS 行為只能列入實機檢查）

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

（以下逐字複製自 10-CONTEXT.md `## Implementation Decisions`。CONTEXT 註明全部是 Claude 在 Andy 授權下自主選的，列為 Claude's Discretion、事後 UAT 確認；planner 仍須照做。）

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

### Deferred Ideas (OUT OF SCOPE)
- 押韻顏色自訂、標記位置與大小（Phase 11 MAP-11）。
- 跨段落押韻統計（整首歌的韻腳表）。
- 雙押／多字韻（句尾兩字都押）偵測。
- 台語／粵語讀音。
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MAP-01 | 韻腳判定沿用核心押韻演算法，不另寫新判定 | §Finding 1：三套既有判定的差異與抽出方式（`lhRhymeMatch`）；9,800 組字對在瀏覽器實測與 `validateWordRhyme` 零差異；§Code Examples 1 |
| MAP-02 | 句尾依韻部自動上色 | §Finding 3 背景鏡像層（像素比對實證）；§Palette 色票與對比數字；§Pattern 2 |
| MAP-03 | 句中多押偵測（預設關） | §Pattern 3 `lhMapAnalyze` 的 inner 偵測；底線在 `color:transparent` 的鏡像文字上實測可畫 |
| MAP-04 | 段落韻腳統計＋結構字母 | §Verified Fixtures（AABB／ABAB 在嚴格／寬韻的實測字母）；§Pattern 3 |
| MAP-05 | 點歌詞中的字即可查同韻字／AI 建議 | §Finding 5 選取浮動列：事件、定位、接 `searchInputEl`＋`_handleSearch`＋`mobileTab`＋`generateAISuggestions` |
| MAP-06 | 嚴格／寬韻 toggle | §Finding 1：`lhRhymeMatch(a, b, strict)`＝既有兩條判定的唯一實作 |
| MAP-07 | 可忽略句尾語助詞 | §Pattern 3 `lhMapTarget`；§Verified Fixtures F-PART |
| MAP-08 | 破音字手動指定讀音 | §Finding 2 讀音來源與破音字；§Finding 7 `readings` 儲存與驗證；實測手動讀音改變字母 |
| MAP-12 | 組字中不分析、長篇不卡 | §Finding 6 增量分析與量測數字；§Finding 8 既有「零 childList 突變」測試需放行 `.rmap-backdrop` |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

來源：`/Users/Shared/Coding Projects/Lucky Hawaii/.claude/CLAUDE.md`（專案）＋ `~/.claude/CLAUDE.md`（全域）。與 CONTEXT 同權威，research 建議不得牴觸。

- **無建置、純前端、GitHub Pages**：新檔只能是 `js/*.js`／`css/*.css` 以 classic `<script src>` 載入；不得引入 bundler、npm 依賴（`package.json`／`package-lock.json` 本 phase 不動）。
- **Data safety**：更新不得弄丟已存的歌詞／覆寫／設定；新欄位（`readings`、`lh:map`）必須向下相容，舊版忽略多出的欄位。
- **Devices**：電腦、平板、手機都要好用（觸控 ≥ 44px：`--hit`）；介面與詞庫繁體中文，**嚴禁簡體**。
- **程式風格**：4 空格縮排、單引號、註解用繁體中文講「為什麼」、全域函式 camelCase、內部函式底線開頭；section header 用 `// ==================== X ====================`。
- **專案慣例（Phase 5–9 建立、有靜態掃描守著）**：色碼不進 CSS（`style.spec`）；`catch` 必須呼叫 `lhWarn`／重丟（`scan.spec` 吞錯掃描）；不直接用 `localStorage`、鍵必須登記於 `LH_KEYS`（`scan.spec` 註冊檢查）；**不新增 `@keyframes`／`transition`**（`sections-audit`「沒有新增動畫」只准 ≤ 起點數量）；新 JS 不得拼 HTML（`sections-audit`「新程式沒有拼 HTML」acorn 掃描，一律 `createElement`／`textContent`）。
- **GSD**：先經 GSD 指令再改檔；GSD 專案以 GSD 狀態文件為準，handoff.md 只補即時想法（每輪 coding 後更新）。`commit_docs: false`（本研究檔不 commit）。
- **使用者溝通**：UAT 驗收以「數字＋是非題」格式；討論用白話設計思路，不講變數名。

## Summary

本 phase 沒有任何新套件需求：全部用瀏覽器原生功能（textarea、`ResizeObserver`、`requestIdleCallback`、`select`／`selectionchange`、CSS 變數）加上專案既有函式（`getZhuyinRhyme`、`RHYME_TO_FAMILY`、`getCharAllReadings`、`lhMirror`／`lhCaretRect`、`lhPlaceMenu`、`showToast`、`mobileTab`、`_handleSearch`、`generateAISuggestions`、`lhSecCountOne`／`lhSecCountAll`）。最重要的幾個發現：

1. **「同一套核心演算法」其實有兩套既有語意。** 字卡查詢（`searchRhyme`）用單向的 `BORROW_MAP`；AI 詞彙篩選與驗證（`filterWordsByRhymeSingle`／`filterWordsByRhyme`／`validateWordRhyme`）用對稱的 `RHYME_TO_FAMILY` 家族＋「不延伸韻」的字串全等。CONTEXT A1 鎖定的是後者。實測兩者只在 `ㄣ↔ㄥ` 一個方向上，字卡比家族「多」；其餘差異都是字卡比家族「少」（BORROW_MAP 單向、缺鍵）。所以 SC1 的「兩邊一致」必須以「家族／嚴格」這個原語為準：我在實際頁面對 9,800 組（寬／嚴各 4,900）字對比較 `validateWordRhyme` 與 `lhRhymeMatch`，**零差異**。字卡側改用「結果 ⊆ 家族 ∪ {ㄣㄥ}」這條不變式測。
2. **鏡像層做法已實證可行。** 結論：Custom Highlight API 在 Chromium 153 實測**畫不進 textarea**（預設文字節點與改過 value 後都不改變畫面）；背景鏡像 div 只要「複製字型／行高／padding／換行規則，右 padding 加上 `ta.offsetWidth - ta.clientWidth`（捲軸寬），`scrollTop` 同步」，與 textarea 的畫面**逐像素相同**（三種捲動位置；不補捲軸寬的負向對照會 DIFF）。`ResizeObserver` 在捲軸出現／消失時會觸發（content-box 變了、border-box 沒變）。
3. **桌機（> 900px）textarea 本來就不撐滿 `.section-body`**（實測 316×72 對 body 403px；Phase 9 研究已記載「別當新 bug」）。所以鏡像層不能用 `inset:0` 貼 body，**必須由 textarea 的 offset 框決定位置與大小**。
4. **分析本身幾乎免費**（Node vm、真字典＋23 萬詞 Map：100 行 0.44ms、1000 行 2.8ms）。真正的成本是 DOM：重建 150 行鏡像＋版面＋一幀，6× 降速仍 ≤ 16ms；1000 行 6× 約 42ms。F3 的「無 > 50ms 長任務」輕鬆達成；重點是**組字中不碰 DOM**與**只重算被改的那段**。
5. **會被這個設計打破的既有測試**（必須在計畫裡明列、小幅放行，不是削弱）：`songs-ime`「組字：不重畫也不跳游標」與 `sections-ui`「字數：組字中不變、確認後才變」會觀察 `#leftPanel` 的 childList 突變為 0；鏡像層重畫是 childList 突變，要在兩處過濾掉 `.rmap-backdrop` 子樹，並新增「組字期間鏡像層零突變」的專屬測試。另外 `scan.spec` 的「21 個鍵」→ 22、`split-tags` 的 `JS_ORDER`、`node-core.mjs` 的 `CORE`（否則 `core-node` 的詞庫篩選測試會因 `lhRhymeMatch` 不存在而 ReferenceError）、-darwin 的 lyrics 截圖（工具列多一顆按鈕）。

**Primary recommendation:** 新增 `js/rhyme-core.js`（純函式，Node 可測，`CORE` 同步加入）＝唯一的押韻原語 `lhRhymeMatch` ＋ 讀音／句尾字／字母統計；`candidates.js`／`wordlist.js` 的三處家族／嚴格比較改呼叫它（等價改寫，用 9,800 組對照測鎖住）；鏡像層用「textarea 同位置、同 CSS 規則、`ResizeObserver` 同步框」的 `.rmap-backdrop`，句尾字包 `<span>`、顏色由 JS 算出 `rgba()` 寫成 CSS 變數；掛鉤只動兩行（`lhSecCountOne`／`lhSecCountAll`），組字閘門沿用 `_lhComposing`。

## Architectural Responsibility Map

純前端專案；「Tier」以瀏覽器內的層次表示。

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 押韻判定原語（家族／嚴格比較） | 純函式層（`js/rhyme-core.js`） | 查韻篩選（`candidates.js`、`wordlist.js`） | 一處定義、兩邊呼叫，才能保證 SC1 一致 |
| 句尾字抽取、語助詞跳過、讀音來源、字母／統計 | 純函式層（`rhyme-core.js`） | — | 不碰 DOM／儲存，Node vm 可單獨測 |
| 每段分析快取與排程 | 編輯器層（`js/rhyme-map.js`） | 模型（`curSong()`） | 以段落 id 為鍵；讀模型文字，不讀畫面 |
| 句尾上色鏡像層 | DOM／CSS（`.rmap-backdrop`） | `ResizeObserver`、scroll 同步 | 不能用 Custom Highlight API（畫不進 textarea），不換 contenteditable |
| 手動讀音 `readings` | 模型（song 欄位） | safety.js 白名單驗證 | 存進 `lh:songs`；import 路徑是白名單重建 |
| 開關設定 `lh:map` | 儲存安全層（`safety.js` 登記） | 備份 `_lhBackupSettingKeys`（group:'setting' 自動收） | 沿用既有設定備份通道 |
| 選取浮動列／韻腳選單 | 編輯器層（`rhyme-map.js`） | `lhPlaceMenu`、`mobileTab` | 與 Phase 9 `#sectionMenu` 同模式 |
| 查韻／AI 建議 | 既有搜尋 UI（`search-ui.js`、`ai-generate.js`） | — | 浮動列只「填搜尋框＋派 `input` 事件」，不複製查詢邏輯 |

## Verified In-Repo Values（逐字引用，供 planner 與 executor 直接對照）

> 以下值都在本 session 開檔讀過。引述為原文。

- `js/search.js:26-34` `getZhuyinRhyme`：
  ```js
  function getZhuyinRhyme(zhuyin) {
      if (!zhuyin || zhuyin.length === 0) return '';
      const base = stripTone(zhuyin);
      if (!base) return '';
      if (zhuyinInitialSet.has(base[0])) {
          const rhyme = base.substring(1);
          return rhyme || base; // 純聲母（如 ㄓ=知）時回傳整個
      }
      return base; // 整個都是韻母
  }
  ```
  `js/search.js:14` `const TONE_MARK_RE = /[ˊˇˋ˙ˉ]/g;`（`stripTone` 全域去除，不只尾端）。
- `js/phonetic-tables.js:136-137`：`const RHYME_TO_FAMILY = {};` ／ `RHYME_FAMILIES.forEach(f => f.rhymes.forEach(r => RHYME_TO_FAMILY[r] = f.id));`。16 個家族 id 0–15（label：`'ㄧ' 'ㄨ' 'ㄩ' 'ㄚ' 'ㄛ' 'ㄜ' 'ㄝ' 'ㄞ' 'ㄠ' 'ㄢ' 'ㄧㄢ' 'ㄣ' 'ㄥ' 'ㄧㄣ' 'ㄤ' 'ㄨㄥ'`，`js/phonetic-tables.js:117-133`）。
- `js/candidates.js:79-81`（`filterWordsByRhymeSingle`）：
  ```js
  const rhymeMatch = filterNoExtRhyme
      ? lastRhyme === searchRhyme
      : RHYME_TO_FAMILY[lastRhyme] === searchFamilyId;
  ```
- `js/candidates.js:281,284,294`（`validateWordRhyme`）：`if (fam === undefined) return false;` ／ `return rhymeMode === 'rhyme' && filterNoExtRhyme ? r === req.rhyme : RHYME_TO_FAMILY[r] === fam;` ／ `? infos.some(x => RHYME_TO_FAMILY[getZhuyinRhyme(x.zhuyin)] === RHYME_TO_FAMILY[req.rhyme])`。
- `js/wordlist.js:427,432`（`filterWordsByRhyme`）：`if (RHYME_TO_FAMILY[lastRhyme] !== RHYME_TO_FAMILY[rhymes[0].rhyme]) match = false;` ／ `if (RHYME_TO_FAMILY[getZhuyinRhyme(syllables[i])] !== RHYME_TO_FAMILY[rhymes[i].rhyme]) {`。
- `js/polyphonic.js:5`：`const _TONE_MARKS = ['', 'ˊ', 'ˇ', 'ˋ', '˙'];`；`getCharAllReadings(char)` 回傳 `[{reading, tier}, ...]`，reading ＝ `zhuyin + _TONE_MARKS[tone - 1]`（一聲無符號、輕聲 `˙` 在尾端）。
- 詞庫一筆：`{"w":"一丁點","z":"ㄧˋ ㄉㄧㄥ ㄉㄧㄢˇ","p":790}`；`wordPhoneticMap.set(e.w, e.z)`（`js/wordlist.js:281`）；`z` 以空白分音節、音節數＝字數（全庫 233,713 筆 0 筆不符，輕聲 `˙` 只出現在尾端 7,306 次、開頭 0 次）。
- `js/safety.js:26-31`（`LH_KEYS` 尾端）：
  ```js
  { key: 'lh:uiScale', group: 'ui' },
  { key: 'lh:lexiconPack', group: 'setting' },
  { key: 'lh:songs', group: 'data' },
  { key: 'lh:activeSong', group: 'data' },
  { key: 'lh:songListOpen', group: 'ui' }
  ];
  ```
  `js/safety.js:534-536` `_lhBackupSettingKeys`：`return LH_KEYS.filter(k => k.group === 'setting' || k.key === 'dictOverrides_v076').map(k => k.key);`；`js/safety.js:511` `LH_IMPORT_CAPS = { songs: 5000, title: 60, sections: 2000, label: 200, text: 1000000, tags: 200, tag: 100, context: 100000, words: 20000, word: 100, setting: 1000000 }`。
- `lhNormalizeSong`（`js/safety.js:587-625`）回傳物件**逐欄白名單重建**：`return { id, title, sections, hashtags, context: ..., createdAt, updatedAt: ... }`——不在白名單的欄位（含未來的 `readings`）在匯入時會被丟掉。
- `js/sections.js:553-563` `lhSecCountOne(secEl)`；呼叫者：`js/lyrics.js:259`（compositionend）、`js/lyrics.js:267`（非組字 input）經 `lhSecCountFrom`、`js/undo.js:124`、`js/word-drag.js:376`；`js/lyrics.js:227` `lhSecCountAll();`（每次 `renderLyricsSections`）。
- `js/lyrics.js:257,259,267,271`：`compositionstart` 設 `_lhComposing = true`；`compositionend` 設 false 後呼叫 `lhSecCountFrom`；`input` 僅在 `!_lhComposing && !e.isComposing` 時呼叫；`focusout` 也歸零。
- `js/layout.js:153` `function lhPlaceMenu(el, x, y)`（量真實大小、夾進 visualViewport，四邊 4px）；`js/word-drag.js:23` `lhMirror(ta)`、`:92` `lhCaretRect(ta, mirror, i)`（回 `{left, top, height}` 螢幕座標）；`js/ui-common.js:51` `showToast(msg, duration = 1800)`；`js/panels.js:86` `mobileTab(tab)`（'search' 收起所有 sheet）；`js/ai-generate.js:74` `generateAISuggestions()`；`js/ai-generate.js:189-191` `document` 的 `mouseup` 會把選取文字寫進 `lastLyricsSelection`（並被 `generateAISuggestions` 當「歌詞風格參考」）。
- `js/init.js:8` `window.__hoyunReady = Promise.all([ applyRhymeDictOverrides()...then(applied => { if (applied) buildIndex(); }), loadPolyphonicsOrder() ]);`；`js/init.js:33` `window.__hoyunWordlistReady = loadWordlist();`；`js/wordlist.js:320,333` 換詞庫包時會重指派 `window.__hoyunWordlistReady`。
- CSS：`css/panels.css:1440-1452` `.section-textarea { width: 100%; padding: 0.625rem 0.75rem; border: none; font-size: 0.95rem; font-family: 'Noto Sans TC', sans-serif; background: var(--card-bg); color: var(--text-primary); resize: none; flex: 1; outline: none; line-height: 1.7; }`；`css/responsive.css:737-739` `.search-input, .section-textarea, ... { font-size: max(16px, 1rem); }`、`:751` `.section-textarea { overflow-wrap: anywhere; }`（兩者在 `@media (max-width: 900px), (pointer: coarse)`）；`css/panels.css:1331` `.section-body { flex: 1; min-height: 0; }`；`css/responsive.css:67-68` ≤ 900 `.section-body` 變 `display:flex; flex-direction:column`、textarea `flex: 1 1 auto; min-height: 7rem`。
- HTML：`index.html:357` 工具列 `<div class="lyrics-tools"><div class="undo-group" ...>...</div><span id="songTotal" class="lyrics-total">共 0 字</span></div>`；段落 DOM（`js/lyrics.js` 的 `renderLyricsSections`，約 156–228 行）：`.lyrics-section[data-id] > .lyrics-section-header(.section-handle, .section-chevron, .section-type, .section-count(Text node), .section-remove) + .section-body > textarea.section-textarea + .section-resize`。
- 測試：`tests/scan.spec.mjs:69-70` `expect(keys).toHaveLength(21); expect(new Set(keys).size).toBe(21);`；`tests/split-tags.spec.mjs:8-12` `JS_ORDER`（26 檔，結尾 `'ai-word-events', 'word-drag'`）；`tests/node-core.mjs:6` `export const CORE = ['js/phonetic-tables.js', 'js/dict.js', 'js/search.js', 'js/state.js', 'js/polyphonic.js', 'js/wordlist.js', 'js/candidates.js'];`。

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| （無新套件）瀏覽器原生 API | — | `ResizeObserver`、`requestIdleCallback`、`select`／`selectionchange`、`visualViewport`、CSS 變數 | 專案硬限制：無建置、無 runtime 依賴；已安裝的 `@playwright/test@1.63.0`（Chromium 1243）足以驗證 |
| 既有專案函式 | — | `getZhuyinRhyme`、`RHYME_TO_FAMILY`、`getCharAllReadings`、`wordPhoneticMap`、`lhMirror`／`lhCaretRect`、`lhPlaceMenu`、`showToast`、`mobileTab` | 「沿用既有演算法」是 MAP-01 本身；重寫就違反需求 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@playwright/test` | 1.63.0（已安裝） | 瀏覽器端測試、CDP 組字／觸控 | 所有 UI 測試 |
| `acorn` | 8.18.0（已安裝） | 靜態掃描（HTML sink、吞錯 catch） | 把新檔加進 `sections-audit` 的 `FILES` |
| `node:vm` | Node v26.8.1（本機） | 純函式 Node 測試 | `rhyme-core.js` 單元測試 |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| 鏡像 div＋`<span>` 包句尾字 | 鏡像 div 單一 Text node＋`CSS.highlights`（`::highlight()`） | 可免掉重建 span（打字時只有 `characterData` 變動，連既有的「零 childList」測試都不必放行）。但 MDN 標示 Baseline 2025「newly available」（2025-06 起），舊 iPad／iPhone 的 Safari 可能整個沒顏色；且 Range 在 `.data` 改寫後會失效仍須重建。Andy 的平板是必須支援的裝置 → 選 `<span>`（全瀏覽器可用）。**這是 Claude 的建議，不是鎖定決定。** |
| 鏡像層放 textarea 後面（B1，textarea 背景透明） | 鏡像層疊在 textarea 上方（`pointer-events:none`、半透明） | 上疊不必改 textarea 背景，但色塊會蓋住文字與選取色；B1 已鎖定「後面」。後面的作法需要 textarea 背景 `transparent`——實測 textarea 後面所有祖先都是透明、最底的 `.side-panel` 就是 `--card-bg`（淺 `rgb(247,250,252)`／深 `rgb(45,55,72)`），所以透明後畫面不變。 |
| 色塊 `color-mix(in srgb, X 26%, transparent)` | JS 由 hex 算 `rgba()` 寫成 CSS 變數 | 後者不需 `@supports`、舊瀏覽器也有色、CSS 完全不含色碼 → **選後者** |

**Installation:** 無（`package.json`、`package-lock.json` 不變）。

**Version verification:** 不適用（無新套件）。`npm ls` 既有：`@playwright/test` 1.63.0、`acorn` 8.18.0（`package.json:devDependencies`，已讀）。

## Package Legitimacy Audit

本 phase **不安裝任何外部套件**，故不需 `package-legitimacy check`。

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| （無） | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none
驗收：`git diff -- package.json package-lock.json` 必須為空。

## Architecture Patterns

### System Architecture Diagram

```
 使用者打字/組字/貼上/拖字/復原
          │
          ▼
 #lyricsSections 事件委派（lyrics.js:255-271）
   compositionstart → _lhComposing=true ─────────────┐ 組字中：rhyme-map 不分析、不碰 DOM
   input / compositionend / undo / word-drag drop    │
          │  （已經都會呼叫 lhSecCountOne）           │
          ▼                                           │
 lhSecCountOne(secEl)  ──► lhMapSchedule(secEl)       │
 lhSecCountAll()       ──► lhMapRenderAll()           │
                              │ 閘門：_lhComposing / 字典詞庫就緒(A5) / 設定總開關
                              ▼
               debounce 200ms → requestIdleCallback(fallback setTimeout)
                              │
              ┌───────────────┴────────────────┐
              ▼                                ▼
   每段快取命中？(text+設定+epoch+readings)   curSong().sections[id].text（讀模型）
         命中→略過                              │
              │ 未命中                          ▼
              ▼                    js/rhyme-core.js（純函式）
     lhMapAnalyze(text, opts, readings)  ◄──  lhMapTarget(行→句尾字，跳語助詞)
        │                                      lhMapReading(手動→詞庫4→2→字典[0])
        │                                      lhRhymeMatch/lhRhymeKey（家族 or 嚴格）
        ▼
   rows[行] = {target, reading, rhyme, key, letter, solo, inner[]}
   letters「AABB」、stats「ㄤ ×3、ㄧ ×2」
        │
        ├──► .rmap-backdrop（textarea 前一個兄弟；replaceChildren：純文字＋<span data-f>）
        │        └ 位置/大小：ResizeObserver(ta) → left/top/width/height + 右 padding += 捲軸寬
        │        └ ta 'scroll' → backdrop.scrollTop 同步
        ├──► 標題列 .section-rhyme（Text node .data＝字母；預設隱藏）→ 點擊開統計＋逐行選單
        └──► 設定：lh:map（lhGetJSON→lhMapNormalizeSettings；變更→全部重算）

 選取文字（select / pointerup / keyup）──► 浮動列 .rmap-bar（定位：lhMirror+lhCaretRect，放在選取下方）
        │ 查韻   → searchInputEl.value = 字；dispatchEvent(new Event('input')) ；手機 mobileTab('search')
        │ AI 建議 → 同上 → await _handleSearch → generateAISuggestions()（先清 lastLyricsSelection）
        └ 讀音   → song.readings[tail] = reading；markDirty/flushSongs；lhMapSchedule(該段)

 判定共用點：lhRhymeMatch(a,b,strict)  ◄── candidates.js(2處)、wordlist.js(2處)、rhyme-core.js
```

### Recommended Project Structure
```
js/
├── rhyme-core.js     # 純函式：lhRhymeFamilyId/lhRhymeMatch/lhRhymeKey、lhMapTarget/lhMapReading/lhMapAnalyze、lhMapNormalizeSettings、lhMapCleanReadings、LH_MAP_PARTICLES；不碰 DOM／儲存；放在 polyphonic.js 之後、wordlist.js 之前
└── rhyme-map.js      # 最後載入（用到 lhMirror/lhCaretRect 在 word-drag.js）：鏡像層、排程快取、韻腳選單、標題字母、選取浮動列、讀音、查韻／AI
css/panels.css        # 新增 .rmap-* 規則（只引用 CSS 變數，不含色碼）；.section-textarea 背景改 transparent；.section-body position:relative
css/responsive.css    # .rmap-backdrop 併入 ≤900/coarse 的字級與 overflow-wrap 規則；觸控 ≥ var(--hit)
tests/
├── rhyme-core.spec.mjs      # Node vm：原語、句尾字、讀音、字母、設定與 readings 清洗（CORE 加入 rhyme-core.js）
├── rhyme-parity.spec.mjs    # 瀏覽器：9,800 組對 validateWordRhyme、字卡不變式、golden 不變
├── rhyme-map-ui.spec.mjs    # 鏡像對齊（像素）、上色、開關即時、字母、浮動列、讀音、組字零突變、觸控
└── rhyme-map-perf.spec.mjs  # 長任務量測（LH_PERF 才跑計時）＋永遠跑的結構性斷言
```

### Pattern 1: 判定原語抽取（等價改寫，不改查韻結果）
**What:** 只抽「兩個韻母字串怎麼比」這一件事。`getZhuyinRhyme` 不動（它本來就是兩邊共用）。
**When to use:** `candidates.js:79-81`、`candidates.js:294`、`wordlist.js:427,432`，以及 `validateWordRhyme` 單字分支（保留 `fam === undefined → false` 守衛，那是 AI 造詞專屬的既有規則）。
**Why safe:** `searchRhyme`（golden 的來源）完全不經過這幾處——它用 `BORROW_MAP`；所以 `tests/golden.spec.mjs` 的 hash 不可能因這個改寫改變，仍要跑來證明。
**Edge:** `filterWordsByRhymeSingle` 的 `searchFamilyId` 在「`searchRhyme` 與 `searchInitial` 都是空字串」時是 `null`，舊式比較永遠 false，新式 `RHYME_TO_FAMILY['']`＝`undefined` 會對空韻字回 true。該情況在實際流程不可達（呼叫者 `getWordlistCandidatesSingle` 已排除萬用字，全 notFound 時 `currentRhymes` 被清空），但**改寫後要加單元測試**把它鎖死，或在該分支前加 `if (!searchRhyme) continue`（不改任何可達行為）。

### Pattern 2: 背景鏡像層（實證過的配方）
**What:** `.section-body`（`position: relative`）內，在 `textarea` **前面**插入 `div.rmap-backdrop`（`aria-hidden="true"`、`pointer-events:none`、`user-select:none`、`color: transparent`、`overflow: hidden`、`position:absolute`）。textarea 設 `position: relative; background: transparent`（同為定位元素時，DOM 順序在後者畫在上面，不必 z-index）。
**How it stays aligned（逐像素相同的條件，實測）：**
1. 字型、字級、行高、字距、`white-space: pre-wrap`、`overflow-wrap`、`word-break`、`tab-size`、padding 與 textarea 相同。**建議用 CSS 共用選擇器**：把 `.rmap-backdrop` 加進 `.section-textarea` 的基本規則（`panels.css:1440`）與 ≤900/coarse 的兩條規則（`responsive.css:737`、`:751`），而不是 JS 複製計算樣式（`lhMirror` 的 JS 複製是給一次性量測用的）；再加一個「三裝置×兩縮放 computed style 相等」的測試防漂移。
2. **右 padding ＝ textarea 右 padding ＋ `ta.offsetWidth - ta.clientWidth`**（捲軸寬）。實測有 15px 經典捲軸時不補會整個 DIFF，補了三個捲動位置都 IDENTICAL。
3. 位置／大小：`left/top/width/height` ＝ textarea 的 `offsetLeft/offsetTop/offsetWidth/offsetHeight`，由 `ResizeObserver(ta)` 更新（桌機 textarea 比 body 矮；Phase 9 的 `--sec-h` 拖拉、`--ui-scale` 縮放、收合再展開都會改 textarea 大小，RO 全部涵蓋）。RO 回呼同時重設 `backdrop.scrollTop = ta.scrollTop`（收合／展開、`lhSecMoveDom` 搬節點會讓 scrollTop 歸零；Phase 9 的搬移程式會還原 textarea 的 scrollTop，這會觸發 scroll 事件，也由此補同步）。
4. 內容＝模型文字（`\r\n?` 正規化成 `\n`）＋結尾零寬字元 `\u200b`（textarea 在文字以換行結尾時會多出一個空行，div 不會；`lhMirror` 用同一招）。
5. `ta.addEventListener('scroll', () => { bd.scrollTop = ta.scrollTop })`（`overflow:hidden` 的元素也能設 `scrollTop`；實測有效）。
**Highlight 畫法：** 句尾字包 `<span class="rmap-hl" data-f="N">`（孤句加 `solo`）；句中押韻字包 `<span class="rmap-in" data-f="N">`。`background` 與 `text-decoration-color` 在 `color: transparent` 的文字上照常畫出（實測）。
**顏色：** JS 常數 17 色（16 家族＋空韻／其他灰），算成 `rgba()` 後 `documentElement.style.setProperty('--rmap-bgN', ...)`；CSS 只寫 `.rmap-hl[data-f="3"] { background: var(--rmap-bg3); }`（17 條）、`.rmap-hl.solo { background: var(--rmap-bg3-solo) }` 或用單一 `--rmap-solo-a`。主題切換用 `MutationObserver(documentElement, {attributes:true, attributeFilter:['data-theme']})` 重算兩組變數。
**Example:** 見 §Code Examples 3。

### Pattern 3: 句尾分析（純函式）
`lhMapAnalyze(text, opts, readings)` 回傳每個**實體行**一列（空行 `null` 目標、不佔字母），`letters`（字串）、`count`（Map）、`solo`。步驟：`\r\n?`→`\n` → 每行 `lhMapTarget` → `lhMapReading` → `lhRhymeKey`。已用真字典＋真 `getCharAllReadings`／`polyphonic-order.json` 在 Node vm 實跑原型（見 §Verified Fixtures）。完整可抄的原型見 §Code Examples 2。

### Anti-Patterns to Avoid
- **在 textarea 上用 Custom Highlight API：** 實測畫不出來，別試。
- **鏡像層用 `inset:0` 貼 `.section-body`：** 桌機 textarea 只有 72px 而 body 403px，會錯位。
- **打字或組字中重建鏡像層：** 組字中連 `lhSecCountOne` 都不會被呼叫（`lyrics.js:259,267` 的守門），不要另開入口繞過；`lhMapSchedule`／flush 再各自檢查 `_lhComposing`。
- **用 `ta.value` 當鏡像文字來源的存檔依據／回寫 textarea：** G2 規定絕不回寫畫面；鏡像文字讀模型，絕不寫 `ta.value`。
- **替選取浮動列另寫一套查韻：** 只填 `searchInputEl.value` 並派 `new Event('input', { bubbles: true })`（`perf.spec.mjs` 也是這樣觸發），既有 `selectedChars.clear()`／`_handleSearch` 自然跑。
- **新增 `transition`／`@keyframes`：** `sections-audit` 會失敗。

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 取韻母 | 另寫注音拆解 | `getZhuyinRhyme(reading)` | 空韻（`ㄓ`→整個）等邊角已被既有規則定義 |
| 破音字讀音清單與順序 | 另排讀音 | `getCharAllReadings(char)`（已按 `polyphonicsOrderMap`） | 實測對全部 13,157 字，其 `[0]` 的注音與 `updateAIRhymeDisplay` 的預設選法（`js/rhyme-display.js` 的 `polyphonicsOrderMap.get(char)[0]` 分支，否則 `zhuyins[0]`）**零差異** |
| 選單定位／夾進可見範圍 | 自己算 | `lhPlaceMenu(el, x, y)` | 已處理 visualViewport、極端縮放 |
| 量字位置 | 自己建鏡像量測 | `lhMirror(ta)` + `lhCaretRect(ta, m, i)`（`word-drag.js`） | 已用真實點擊驗證過；用完 `m.remove()` |
| 提示訊息 | 新 toast | `showToast(msg, ms)` | 統計文字用它即可（C4：純文字） |
| 組字模擬測試 | 自寫 IME | `tests/helpers.mjs` 的 `compose(page, steps, commit, beforeCommit)` | CDP `Input.imeSetComposition` |
| 觸控模擬 | 合成 PointerEvent | `tests/drag-lib.mjs` 的 `touchSession` | 合成事件不能 `setPointerCapture` |
| 設定儲存／備份 | 直接 `localStorage` | `lhGetJSON('lh:map', …)`／`lhSet`，登記進 `LH_KEYS`（group `'setting'`） | `scan.spec` 會擋；group `'setting'` 自動進備份（`_lhBackupSettingKeys`） |

**Key insight:** 這個 phase 的價值在「接線與驗證」，不在新演算法。所有判定都來自既有檔案，新碼只剩句尾字抽取、字母編號與畫面。

## Runtime State Inventory

不是改名／重構／遷移 phase：省略。（新增欄位 `readings`、設定鍵 `lh:map` 是新增，不是更名；向下相容見 Finding 7。）

## Common Pitfalls

### Pitfall 1: 「同一套演算法」其實有兩套語意，測錯對象會誤報
**What goes wrong:** 以為字卡查詢＝AI 詞篩選＝家族，寫出「字卡結果必須等於家族」的測試，在 `ㄧㄚ`、`ㄨㄞ`、`ㄩㄣ`… 等會紅。
**Why it happens:** 字卡用單向 `BORROW_MAP`：實測 `ㄧㄝ ㄧㄠ ㄧㄤ ㄧㄚ ㄧㄡ ㄨㄣ ㄨㄢ ㄨㄛ ㄨㄟ ㄨㄤ ㄩㄝ ㄨㄚ ㄩㄣ ㄧㄛ ㄧㄞ ㄨㄞ` 查詢時字卡**比家族少**（沒有對應鍵）；只有 `ㄣ↔ㄥ` 字卡**比家族多**（`BORROW_MAP['ㄣ']` 含 `ㄥ`、`['ㄥ']` 含 `ㄣ`，但 `RHYME_FAMILIES` 的 `ㄣ={ㄣ,ㄨㄣ}`、`ㄥ={ㄥ}`）。
**How to avoid:** SC1 測「判定原語 ≡ `validateWordRhyme`／`filterWordsByRhymeSingle`」（9,800 組實測零差異）；字卡側只測不變式「`searchRhyme(c)` 的每個結果的韻母 ∈ 家族(c 的韻) ∪ {`ㄣ`↔`ㄥ`}」。
**Warning signs:** 測試裡出現「字卡集合 === 家族集合」。

### Pitfall 2: 空韻（`ㄓㄔㄕㄖㄗㄘㄙ`）的行為是既有怪癖，忠實沿用
**What goes wrong:** 想當然覺得「詩、知、字、思」應該同韻，嚴格模式卻各自一色。
**Why it happens:** `getZhuyinRhyme('ㄓ')` 回傳整個音節 `'ㄓ'`，不在任何家族（實測：字典中無家族的韻只有 `ㄓ ㄔ ㄕ ㄖ ㄗ ㄘ ㄙ` 與 1 字的 `ㄧㄜ`）；詞庫約 7.2%（16.8k／233k）的詞以空韻收尾。寬韻下 `RHYME_TO_FAMILY[x]` 全是 `undefined` → `undefined === undefined` 為 true，空韻全部互押（`filterWordsByRhyme` 既有行為）；嚴格下是字串全等，`ㄕ≠ㄓ`。
**How to avoid:** `lhRhymeKey(rhyme, strict)`：嚴格＝韻母字串；寬韻＝`'f'+id`，無家族一律歸 `'x'`（第 17 色，灰）。**這與 `validateWordRhyme` 對空韻回 false 的既有守衛不同**——守衛是 AI 造詞專屬，保留；SC1 的對照測試排除空韻。把「嚴格模式空韻不互押」列為 UAT 項（已在 Open Questions 1）。
**Warning signs:** 把空韻也塞進 9,800 組對照而紅燈。

### Pitfall 3: 既有「零 childList 突變」測試會被鏡像層重畫打紅
**What goes wrong:** `songs-ime`「組字：不重畫也不跳游標」（`tests/songs-ime.spec.mjs:80-85` 的 `watchLeftPanel`）與 `sections-ui`「字數：組字中不變、確認後才變」（`tests/sections-ui.spec.mjs:263-269` 的 `watchLeft`）觀察 `#leftPanel` 的 childList 突變並要求 0；打字停 200ms 後鏡像層 `replaceChildren` 就是突變。
**How to avoid:** 兩處觀察器的過濾改成 `m.type === 'childList' && !(m.target.closest && m.target.closest('.rmap-backdrop'))`（`closest` 含自己，涵蓋子節點增減與容器本身）。這**不是削弱**：這兩個測試要守的是「textarea 與面板結構沒被換掉」。再新增一個專屬測試：組字期間 `.rmap-backdrop` 子樹突變為 0、確認後才有。`songs-crosstab.spec.mjs:118` 觀察 `#lyricsSections` 但不打字，不受影響（但要確認 `lhMapRenderAll` 不會因無關 storage 事件被觸發）。
**Warning signs:** 這兩個 spec 在加了鏡像層之後紅。

### Pitfall 4: 桌機 textarea 不撐滿 body（既有現象）
見 Pattern 2 第 3 點。Phase 9 研究已寫明「別把這個既有現象當成新 bug」（`09-RESEARCH.md` 第 349、565 行）。

### Pitfall 5: textarea 背景改透明的副作用
**What goes wrong:** `.section-textarea.main-textarea { background: var(--card-bg) }`（`panels.css:1049`）仍會把它塗回去。
**How to avoid:** 兩條規則都要處理；實測最底的 `.side-panel` 背景＝`--card-bg`，其間祖先全透明，所以改透明後畫面不變（淺／深兩主題都量過）。visual 截圖在無歌詞內容時不會因此改變，但 `.lyrics-tools` 多一顆按鈕，-darwin 的 `*-lyrics-darwin.png`（desktop／tablet／phone）要重拍（見 Test Impact）。

### Pitfall 6: 詞庫載入時機造成「先一色後換色」
**What goes wrong:** 讀音來源第 2 步（詞庫詞）要等 `wordPhoneticMap` 填好；之前用字典第 3 步著色，載好又變色。
**How to avoid:** A5 的閘門＝`Promise.allSettled([window.__hoyunReady, window.__hoyunWordlistReady])` 之後才開始上色（allSettled：詞庫載入失敗時仍以字典著色，不永遠空白）；之後 epoch +1 並全部重算。換詞庫包（`switchLexiconPack`，`wordlist.js` 會重指派 `__hoyunWordlistReady` 並把 `wordPhoneticMap` 換成新 Map）需在它成功後呼叫 `lhMapOnLexiconChange()`（epoch+1、全部重算）。字典 overrides 套用後 `buildIndex()` 重跑（`init.js:8`）也包含在 `__hoyunReady` 內。

### Pitfall 7: `readings` 在匯入路徑會被白名單吃掉
`lhNormalizeSong` 逐欄重建（`safety.js:587-625`），不加 `readings` 的話「備份→匯入」手動讀音必丟。**只在非空時輸出該欄位**（避免既有測試對整首歌 `toEqual` 失敗；目前測試只檢查 section 的 key 清單，`songs-backup.spec.mjs:355,788`，沒有 song 層級的 key 清單）。

### Pitfall 8: 選取浮動列被 iOS／Android 原生選取選單蓋住
原生選單出現在選取範圍**上方**；浮動列放選取範圍**下方**（行底＋6px），下方放不下才翻到上方（`lhPlaceMenu` 會夾進 visualViewport）。按鈕用 `pointerdown` 的 `preventDefault()` 保住 textarea 焦點與選取；選取文字與段落 id 在**顯示浮動列當下**快照，不在按下時才讀（點到按鈕時 iOS 可能已清掉選取）。[ASSUMED：iOS／Android 原生選單位置與焦點行為；Chromium 無法重現，列入實機檢查]

### Pitfall 9: `lastLyricsSelection` 會污染 AI 建議的「歌詞風格參考」
`ai-generate.js:189-191` 的 `mouseup` 會把選取字寫進 `lastLyricsSelection`，`generateAISuggestions` 用它當 `lyricsText`（`:83`）。浮動列觸發 AI 建議前先 `lastLyricsSelection = ''`，AI 才會拿整首歌當風格參考而不是被選的那一個字。

### Pitfall 10: 全域 `selectionchange` 與文字框
MDN：文字框的 `selectionchange` 在 `<input>`／`<textarea>` 本身觸發並冒泡；document 層級的那個不冒泡。Chromium 153 實測 document 與 textarea 都會收到、`select` 事件也會。跨瀏覽器保險作法：在 `#lyricsSections`（祖先）監聽冒泡的 `select`、`selectionchange`，再加 `pointerup`、`keyup`；用 `requestAnimationFrame` 合併。

## Code Examples

### 1. 共用原語與三處等價改寫（`js/rhyme-core.js` ＋ 兩檔）
```js
// ==================== 押韻判定原語（MAP-01）====================
// 查韻篩選（candidates.js／wordlist.js）與韻腳地圖共用；不碰 DOM／儲存，Node 可直接載入
function lhRhymeFamilyId(rhyme) { return RHYME_TO_FAMILY[rhyme]; }   // 無家族（空韻等）回 undefined
// 寬韻＝同家族（無家族者彼此 undefined===undefined 也算同，與既有詞庫篩選一致）；嚴格＝韻母字串全等
function lhRhymeMatch(a, b, strict) { return strict ? a === b : RHYME_TO_FAMILY[a] === RHYME_TO_FAMILY[b]; }
// 分組用鍵（字母／統計）：嚴格＝韻母本身；寬韻＝家族 id，無家族歸 'x'
function lhRhymeKey(rhyme, strict) {
    if (strict) return rhyme;
    const f = RHYME_TO_FAMILY[rhyme];
    return f === undefined ? 'x' : 'f' + f;
}
```
```js
// candidates.js:79-81 → （searchRhyme 為真值的分支，等價）
const rhymeMatch = lhRhymeMatch(lastRhyme, searchRhyme, filterNoExtRhyme);
// candidates.js validateWordRhyme 單字分支（保留 fam===undefined 守衛）
return infos.some(i => lhRhymeMatch(getZhuyinRhyme(i.zhuyin), req.rhyme, rhymeMode === 'rhyme' && filterNoExtRhyme));
// candidates.js:294 多字分支
? infos.some(x => lhRhymeMatch(getZhuyinRhyme(x.zhuyin), req.rhyme, false))
// wordlist.js:427 / 432
if (!lhRhymeMatch(lastRhyme, rhymes[0].rhyme, false)) match = false;
if (!lhRhymeMatch(getZhuyinRhyme(syllables[i]), rhymes[i].rhyme, false)) {
```
同時：`tests/node-core.mjs` 的 `CORE` 在 `'js/polyphonic.js'` 後加 `'js/rhyme-core.js'`（否則 `core-node.spec.mjs` 的詞庫篩選測試會 ReferenceError）；`index.html` 在 `polyphonic.js` 後加 `<script src="js/rhyme-core.js?v=0.96.14">`；`JS_ORDER` 同步。

### 2. 句尾字、讀音、字母（已在真字典上實跑的原型，可直接作為 `rhyme-core.js` 初稿）
```js
const LH_MAP_PARTICLES = new Set(Array.from('啊呀哪呢喔哦噢吧啦嘛耶欸囉唷了的嗎'));   // E1 清單（逐字）
const LH_MAP_TAIL_RE = /[^\p{L}\p{N}]+$/u;           // 行尾的標點、空白、符號、emoji 先去掉（A4）
const LH_MAP_HAN_RE = /^\p{Script=Han}$/u;
const LH_MAP_ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

// 句尾目標字：{ i, char, tail } 或 null。tail＝以目標字結尾、連續漢字、最多 4 個（A3 的 key）
function lhMapTarget(line, skipParticles) {
    const cs = Array.from(line.replace(LH_MAP_TAIL_RE, ''));
    let i = cs.length - 1;
    if (i < 0) return null;
    if (skipParticles) {
        // 前面還有字才跳；整行都是語助詞就用最後一個字（E1）。跳過後中間的標點空白也略過
        while (i > 0 && LH_MAP_PARTICLES.has(cs[i])) {
            let j = i - 1;
            while (j >= 0 && !/[\p{L}\p{N}]/u.test(cs[j])) j--;
            if (j < 0) break;
            i = j;
        }
    }
    const char = cs[i];
    if (!charInfo[char]) return null;   // 字典查不到不上色、不計入（A4）
    let s = i;
    while (s > 0 && i - s < 3 && LH_MAP_HAN_RE.test(cs[s - 1])) s--;
    return { i, char, tail: cs.slice(s, i + 1).join('') };
}

// 讀音：手動(且對該字合法) → 以目標字結尾的詞庫詞 4→2 字 → 字典第一讀音（A2）
function lhMapReading(t, readings) {
    const infos = getCharAllReadings(t.char);
    if (!infos.length) return null;
    const man = readings && Object.prototype.hasOwnProperty.call(readings, t.tail) ? readings[t.tail] : null;
    if (man && infos.some(r => r.reading === man)) return man;
    for (let n = Math.min(4, t.tail.length); n >= 2; n--) {
        const z = wordPhoneticMap.get(t.tail.slice(-n));
        if (z) { const syl = z.split(' '); if (syl.length === n) return syl[n - 1]; }
    }
    return infos[0].reading;
}

function lhMapAnalyze(text, opts, readings) {
    const rows = text.replace(/\r\n?/g, '\n').split('\n').map(line => {
        if (!line.trim()) return { line, blank: true, t: null, key: null };
        const t = lhMapTarget(line, opts.skipParticles);
        if (!t) return { line, t: null, key: null };
        const reading = lhMapReading(t, readings);
        const rhyme = getZhuyinRhyme(reading);
        return { line, t, reading, rhyme, key: lhRhymeKey(rhyme, opts.strict) };
    });
    const letter = new Map(), count = new Map();
    let letters = '';
    for (const r of rows) {
        if (r.blank) continue;                                  // 空行略過（C1）
        if (r.key === null) { r.letter = '-'; letters += '-'; continue; }
        if (!letter.has(r.key)) letter.set(r.key, LH_MAP_ALPHA[letter.size] || '#');
        r.letter = letter.get(r.key); letters += r.letter;
        count.set(r.key, (count.get(r.key) || 0) + 1);
    }
    for (const r of rows) if (r.key !== null) r.solo = count.get(r.key) === 1;   // B3 孤句
    return { rows, letters, count };
}
```
> 原型在 Node vm（`loadCore()`＋真 `rhyme-dict.js`＋真 `polyphonic-order.json`＋真詞庫 Map）跑過；每次分析 100 行 0.44ms、200 行 0.55ms、1000 行 2.76ms。

### 3. 鏡像層建立與同步（核心片段）
```js
// js/rhyme-map.js —— 一律 createElement／textContent／setProperty，不拼 HTML
function lhMapEnsureBackdrop(secEl) {
    const ta = secEl.querySelector('.section-textarea');
    if (!ta || ta.previousElementSibling?.classList.contains('rmap-backdrop')) return ta && ta.previousElementSibling;
    const bd = document.createElement('div');
    bd.className = 'rmap-backdrop';
    bd.setAttribute('aria-hidden', 'true');
    ta.before(bd);
    const sync = () => {                                   // 位置大小＋捲軸寬＋scrollTop（桌機 textarea 比 body 矮，所以不能 inset:0）
        bd.style.left = ta.offsetLeft + 'px';
        bd.style.top = ta.offsetTop + 'px';
        bd.style.width = ta.offsetWidth + 'px';
        bd.style.height = ta.offsetHeight + 'px';
        bd.style.setProperty('--rmap-sbw', (ta.offsetWidth - ta.clientWidth) + 'px');   // CSS：padding-right: calc(0.75rem + var(--rmap-sbw))
        bd.scrollTop = ta.scrollTop;
    };
    new ResizeObserver(sync).observe(ta);                  // 捲軸出現／消失、--sec-h、--ui-scale、收合展開都會觸發（Chromium 實測）
    ta.addEventListener('scroll', () => { bd.scrollTop = ta.scrollTop; });
    sync();
    return bd;
}
// 畫一段：rows 來自 lhMapAnalyze；只在有變時 replaceChildren（一次一段）
function lhMapPaint(bd, text, rows) {
    const frag = document.createDocumentFragment();
    rows.forEach((r, n) => {
        const cs = Array.from(r.line);
        if (r.t) {
            frag.append(cs.slice(0, r.t.i).join(''));
            const sp = document.createElement('span');
            sp.className = 'rmap-hl' + (r.solo ? ' solo' : '');
            const fam = RHYME_TO_FAMILY[r.rhyme];                    // 嚴格模式顏色仍按家族（B2）；無家族（空韻等）＝第 17 色
            sp.dataset.f = String(fam === undefined ? 16 : fam);
            sp.textContent = cs[r.t.i];
            frag.append(sp, cs.slice(r.t.i + 1).join(''));
        } else frag.append(r.line);
        if (n < rows.length - 1) frag.append('\n');
    });
    frag.append('\u200b');                                  // 結尾零寬字元：文字以換行結尾時也多一行（與 textarea 一致）
    bd.replaceChildren(frag);
}
```
```css
/* css/panels.css — 只引用變數，不寫色碼；不加 transition／keyframes */
.section-body { position: relative; }
.section-textarea { position: relative; background: transparent; }
.section-textarea.main-textarea { background: transparent; }
.rmap-backdrop {
    position: absolute; pointer-events: none; user-select: none; overflow: hidden;
    color: transparent; white-space: pre-wrap; box-sizing: border-box;
    /* 與 .section-textarea 共用同一組字型／行高／padding／換行規則：併進它們的選擇器清單，這裡只放鏡像專屬的 */
    padding-right: calc(0.75rem + var(--rmap-sbw, 0px));
}
.rmap-hl[data-f="0"] { background: var(--rmap-bg0); }  /* … 到 data-f="16"（17 條）*/
.rmap-hl.solo { opacity: 0.5; }                         /* 孤句較淡：直接減半 alpha 也可，二選一由 planner 定 */
.rmap-in { text-decoration: underline; text-decoration-color: var(--rmap-line); text-decoration-thickness: 0.125rem; text-underline-offset: 0.2em; }
```

### 4. 手動讀音儲存與清洗（safety.js 與模型）
```js
// readings：{ '聽著音樂': 'ㄌㄜˋ' }。key＝以目標字結尾的 1～4 個漢字；value＝注音＋聲調符號（一聲無符號）
const LH_READING_KEY_RE = /^\p{Script=Han}{1,4}$/u;
const LH_READING_VAL_RE = /^[ㄅ-ㄩ]{1,4}[ˊˇˋ˙]?$/;
const LH_READINGS_MAX = 2000;
function lhMapCleanReadings(raw) {                         // 回傳乾淨物件；沒有任何有效項目回 null（呼叫端就不輸出該欄位）
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const out = {};
    let n = 0;
    for (const k of Object.keys(raw)) {                    // 只走自己的鍵；key 規則已排除 __proto__／constructor
        const v = raw[k];
        if (LH_READING_KEY_RE.test(k) && typeof v === 'string' && LH_READING_VAL_RE.test(v)) { out[k] = v; if (++n >= LH_READINGS_MAX) break; }
    }
    return n ? out : null;
}
// lhNormalizeSong 的 return：…, ...(cleaned ? { readings: cleaned } : {})   ← 只有非空才輸出
// 「該字的合法讀音」的字典比對放在使用時（lhMapReading 的 infos.some），safety.js 不依賴字典是否已載入
```

### 5. 設定 `lh:map`
```js
// safety.js：LH_KEYS 加 { key: 'lh:map', group: 'setting' }（group:'setting' 自動進備份與還原）；標頭註解「21 個」改 22
// _lhSettingFrom：比照 dictOverrides_v076 加一個分支
if (key === 'lh:map') {
    try { return JSON.stringify(lhMapNormalizeSettings(JSON.parse(v))); }
    catch (e) { lhWarn('備份檔裡的韻腳地圖設定不是合法 JSON，略過', e); return undefined; }
}
// rhyme-core.js（純函式）：形狀 { color, strict, particles, inner, letters }，全是布林，缺的補預設
const LH_MAP_DEFAULTS = { color: true, strict: false, particles: true, inner: false, letters: false };   // B4、C3、E1、E2
function lhMapNormalizeSettings(o) {
    const out = { ...LH_MAP_DEFAULTS };
    if (o && typeof o === 'object' && !Array.isArray(o)) for (const k of Object.keys(LH_MAP_DEFAULTS)) if (typeof o[k] === 'boolean') out[k] = o[k];
    return out;
}
```

### 6. 選取浮動列：觸發與查韻（骨架）
```js
// 在 #lyricsSections 監聽（祖先；冒泡的 select／selectionchange），rAF 合併；組字中不出現（D3）
function lhMapOnSelect(e) {
    const ta = e.target;
    if (!ta.classList || !ta.classList.contains('section-textarea') || _lhComposing) return lhMapHideBar();
    const a = ta.selectionStart, b = ta.selectionEnd;
    if (a === b) return lhMapHideBar();
    const text = ta.value.slice(a, b).trim();
    if (!text) return lhMapHideBar();
    const last = Array.from(text).pop();                   // 查「最後一個字」（見 Open Question 6）
    const m = lhMirror(ta);                                // word-drag.js：量字位置，用完拆掉
    const pos = lhCaretRect(ta, m, b);
    m.remove();
    lhMapShowBar({ secId: ta.closest('.lyrics-section').dataset.id, char: last, x: pos.left, y: pos.top + pos.height + 6 });   // 下方；放不下由 lhPlaceMenu 夾
}
function lhMapLookup(char, withAI) {
    lastLyricsSelection = '';                              // Pitfall 9
    searchInputEl.value = char;
    searchInputEl.dispatchEvent(new Event('input', { bubbles: true }));   // 走既有 input 處理：selectedChars.clear() → _handleSearch
    if (lhIsSheetMode()) mobileTab(withAI ? 'ai' : 'search');
    if (withAI) _handleSearch(char).then(() => generateAISuggestions());   // 查韻完成、currentRhymes 就緒後才觸發
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 以 contenteditable 做語法上色 | textarea＋背景鏡像層 | 業界通用（codeflask 類）；本專案 B1 鎖定 | 保住 Phase 8/9 的組字與資料流 |
| CSS Custom Highlight API | 只能畫在一般 DOM 文字 | Baseline 2025（MDN：2025-06 起） | **畫不進 textarea**（Chromium 153 實測）；僅可用在鏡像 div 上，但有舊裝置風險 → 不採用 |
| `selectionchange` 只在 document | 文字框的 `selectionchange` 在元素上觸發並冒泡 | MDN 現行文件 | 在祖先容器監聽即可，仍搭配 `select`／`pointerup` 保險 |

**Deprecated/outdated:** `CSS zoom` 縮放（專案已改走根字級 `--ui-scale`，`layout.js`）——鏡像層用 rem／繼承，不要用 px 寫死。

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | iOS／Android 原生選取選單出現在選取範圍上方，浮動列放下方可避開 | Pitfall 8 | 浮動列被擋或兩者重疊；改放行首／固定在 textarea 下緣 |
| A2 | Safari／Firefox 對 textarea 的 `select`／`selectionchange` 行為與 Chromium 一致（iOS 拖選取把手時也會送事件） | Pitfall 10 | 手機長按選字後浮動列不出現；需另加 `touchend`／輪詢 |
| A3 | iOS Safari 慣性捲動時 textarea 的 `scroll` 事件可能晚一幀，鏡像層會短暫錯位 | Pattern 2 | 捲動時色塊抖動；可改 `transform: translateY(-scrollTop)`＋`will-change` |
| A4 | 鏡像 div 與 textarea 在 iOS Safari／Firefox 的字距、行高、padding 與 Chromium 同樣逐像素一致（本研究只在 Chromium 153 驗證） | Pattern 2 | 換行位置在手機上錯開；需在 iOS 加 `-webkit-text-size-adjust:100%` 並實機核對 |
| A5 | `ResizeObserver` 在 Safari／Firefox 也會因捲軸出現／消失而觸發 | Pattern 2、Code 3 | 捲軸寬沒更新；於每次重畫時再算一次 `--rmap-sbw` 作保險（建議本來就這樣做） |
| A6 | 瀏覽器「頁內搜尋」會找到鏡像層的重複文字（找到兩次） | Anti-patterns | 輕微；`aria-hidden`、`user-select:none` 已避開讀屏與選取 |
| A7 | 17 色（16 家族＋灰）的辨識度／色盲友善度與好不好看 | Palette | 純視覺，由 Andy 實機判定（Human check） |
| A8 | `lhMirror` 在 > 200,000 字的段落太貴（沿用 `LH_WD_BIG` 判斷） | Security／Perf | 選取浮動列定位卡頓；超長段落放棄定位改固定位置 |
| A9 | 空韻在嚴格模式不互押、`ㄣ`／`ㄥ` 在寬韻不互押，Andy 可接受 | Open Questions 1、2 | 需要時改 `lhRhymeKey`／`lhRhymeMatch` 一處即可 |

## Open Questions (RESOLVED)

1. **空韻（詩知字思…）在嚴格模式不互押，是否接受？**
   - What we know: 既有 `filterNoExtRhyme` 是字串全等，空韻的「韻母」被 `getZhuyinRhyme` 回傳成整個聲母，`ㄕ≠ㄓ`；寬韻下全部歸同一群（既有詞庫篩選的 `undefined===undefined`）。
   - What's unclear: 語言學上它們常被視為同韻。
   - **RESOLVED：** 忠實沿用（MAP-01 禁止另寫判定）。寬韻＝一群（灰色，第 17 色）；嚴格＝逐音節字串全等。列入 UAT：「嚴格模式下，詩／知／字／思不算同韻」。日後若 Andy 要合併，只改 `lhRhymeKey`／`lhRhymeMatch`。
2. **`ㄣ`↔`ㄥ`：字卡查詢互相展開，家族卻不同組，寬韻怎麼算？**
   - What we know: `BORROW_MAP['ㄣ']` 含 `ㄥ`；`RHYME_FAMILIES` 的 `ㄣ={ㄣ,ㄨㄣ}`、`ㄥ={ㄥ}`。台灣口音常不分前後鼻音。
   - **RESOLVED：** 依 A1 用家族（對稱、可傳遞，字母編號才有定義；若再加 BORROW 單向關係會不可傳遞）。UAT 註記「寬韻下 人／風 不同色」；列入 Deferred 候選「ㄣㄥ 合併」。字卡不變式測試把 `ㄣ↔ㄥ` 列為已知例外。
3. **鏡像層重畫的掛鉤放哪？**
   - **RESOLVED：** 只改兩行：`lhSecCountOne(secEl)` 末尾 `lhMapSchedule(secEl)`、`lhSecCountAll()` 末尾 `lhMapRenderAll()`（`typeof` 守衛，因 `rhyme-map.js` 最後載入）。一次涵蓋 input、compositionend、復原／重做、詞卡拖入、整個重畫；這些入口本來就在組字守門後面。
4. **既有「零 childList 突變」測試怎麼辦？**
   - **RESOLVED：** `songs-ime.spec.mjs:83`、`sections-ui.spec.mjs:266` 的過濾加上「排除 `.rmap-backdrop` 子樹」；另新增專屬測試：組字期間鏡像層零突變、鏡像層突變僅在 `compositionend`＋≥ 200ms 後。
5. **鏡像層位置怎麼定（桌機 textarea 比 body 矮）？**
   - **RESOLVED：** 由 textarea 的 `offsetLeft/Top/Width/Height` ＋ `ResizeObserver` 決定；不用 `inset:0`。
6. **選取多個字時「查韻」查什麼？**
   - What we know: CONTEXT D1 寫「最後一個字（或整段詞）」。整段詞走既有多字查詢（`currentRhymes` 多項，AI 造詞會要求同字數），語意較重；寫歌詞通常要的是「這句收在什麼韻」。
   - **RESOLVED：** 一律查**選取範圍的最後一個字**，按鈕文字顯示該字（「查「歌」的韻」），避免誤解。UAT 註記。
7. **字典／詞庫未就緒與換詞庫包？**
   - **RESOLVED：** 閘門 `Promise.allSettled([__hoyunReady, __hoyunWordlistReady])`；之後 epoch+1 全部重算。`switchLexiconPack` 成功後多一行 `lhMapOnLexiconChange()`（`wordlist.js` 內，`typeof` 守衛）。快取比對用 `entry.text === text && entry.sig === sig`（sig＝設定位元＋epoch＋讀音版本），不拼長字串當鍵。
8. **`readings` 的 key 與驗證分工？**
   - **RESOLVED：** key＝「以句尾目標字結尾、連續漢字、最多 4 個」（略過語助詞後的目標字，不含其後的語助詞）；value＝完整讀音（含聲調符號）。`safety.js` 只做形狀＋筆數上限（2000）驗證（不依賴字典是否載好）；「必須是該字的合法讀音」在 `lhMapReading` 使用時以 `getCharAllReadings` 檢查（不合法就當沒設）。只在非空時輸出該欄位；`songs.js` 不必改（讀取容錯用 `lhMapCleanReadings`，不改模型就不標 dirty）。
9. **標題列字母怎麼同時滿足「點某個字母查該行」與觸控 ≥ 44px？**
   - **RESOLVED：** 標題列只放一顆 `button.section-rhyme`（字母字串，預設 `hidden`，文字走 Text node `.data`，與字數同一技巧）；點它開 `.word-ctx-menu` 風格的選單：頂部一行統計文字（C4），其下每行一列按鈕（字母＋句尾字＋讀音，`min-height: var(--hit)`），按列＝查該行句尾字（D2）。字母多（> 12）時按鈕顯示前 12 個＋「…」。
10. **超長文字怎麼辦（備份允許單段 100 萬字）？**
    - **RESOLVED：** 比照 `LH_WD_BIG`（200,000）：單段超過 5,000 行或 200,000 字就不分析、不畫鏡像（`rhyme-map.js` 常數），標題字母顯示「—」。
11. **-darwin／-linux 截圖基準？**
    - **RESOLVED：** 本機只重拍 -darwin（`npm run visual:update`），-linux 照 Phase 9 慣例留給 Andy 在雲端容器重拍；已在 handoff／checklist 寫明。
12. **「讀音」按鈕出現條件？**
    - **RESOLVED：** 只有「被選取範圍的最後一字剛好是該行的句尾目標字且是破音字」才顯示，點了展開讀音 chips（沿用 `.poly-chip` 的樣式／文字格式 `getCharAllReadings`，≥ 44px）；選了就寫 `readings[tail]`、`markDirty`、`flushSongs`、重算該段。非句尾的破音字不提供持久化（那不影響上色；查詢時仍可用既有查韻面板的破音字 chips）。
13. **跳語助詞時，前一個字不是漢字（例：`oh啊`）怎麼辦？**
    - **RESOLVED：** 沿用原型：只要前面還有任何「字母／數字」就跳過；跳過後落在英文字母上就視為無目標（`-`），與 A4 一致。這是邊角，不另設規則。

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Playwright、vm 測試 | ✓ | v26.8.1（本機；容器為 22） | — |
| `@playwright/test` | 所有 UI／效能測試 | ✓ | 1.63.0 | — |
| Chromium（Playwright） | 瀏覽器測試 | ✓ | chromium-1243 與 headless_shell-1243（`~/Library/Caches/ms-playwright`） | — |
| WebKit／Firefox | 跨瀏覽器對齊與選取行為 | ✗ | — | 無；列入 Human check（iPad／iPhone Safari、Android Chrome、桌機 Safari／Firefox） |
| Python 3 | 本 phase 不需要 | — | — | — |

**Missing dependencies with no fallback:** 無阻擋項。
**Missing dependencies with fallback:** WebKit／Firefox 無法在本機自動測 → 以實機檢查補（見 Validation 的 Manual-only）。
注意：Playwright 無頭模式預設帶 `--hide-scrollbars`；要測「捲軸寬補償」的測試必須 `launch({ ignoreDefaultArgs: ['--hide-scrollbars'] })` 或用 `::-webkit-scrollbar { width: 15px }`（本研究用前者量過）。專案的 `bootPage` 用 `browser.newContext`，browser 由 config 啟動，捲軸補償測試要自己 `chromium.launch` 一個帶 `ignoreDefaultArgs` 的 browser 或在頁內注入 `::-webkit-scrollbar` 規則（建議後者，不必改 config）。

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `@playwright/test` 1.63.0（瀏覽器）＋ `node:vm`（純函式，經 Playwright runner 跑） |
| Config file | `playwright.config.mjs`（`testDir: 'tests'`、webServer＝`node tests/serve.mjs` port 4310、`fullyParallel`、單次 60s、`retries: 0`） |
| Quick run command | `npx playwright test tests/rhyme-core.spec.mjs`（Node vm，秒級） |
| Full suite command | `npm test`（Phase 9 結束基準：843 passed／27 skipped／0 failed） |
| Perf（計時，單一 worker） | `LH_PERF=1 npx playwright test tests/rhyme-map-perf.spec.mjs --workers=1`（比照 `package.json` 的 `perf` script） |

### 固定歌詞範例（均已在真字典＋真 `getCharAllReadings`＋`polyphonic-order.json` 的 Node vm 原型跑出；詞庫欄為 stub）
| ID | 歌詞（每行一句） | 寬韻字母 | 嚴格字母 | 備註（句尾字：韻／家族） |
|----|------------------|----------|----------|--------------------------|
| F-AABB | `我望著遠方的光`／`獨自站在窗`／`走過熟悉的街道`／`終於我也回到` | **AABB** | **AABB** | 光ㄨㄤ、窗ㄨㄤ（同韻）；道ㄠ、到ㄠ |
| F-ABAB | `我望著遠方的光`／`走過熟悉的街道`／`你笑著說天亮`／`不怕前方的路遙` | **ABAB** | **ABCD** | 光ㄨㄤ、亮ㄧㄤ 同家族 14；道ㄠ、遙ㄧㄠ 同家族 8 |
| F-FAM1 | `夜空裡閃著星光`／`我在這裡等天亮`／`風吹過熟悉的街道`／`回頭看你還在笑` | AABB | ABCD | 4 行全為孤句時嚴格各自孤句 |
| F-FAM2 | `我的心`／`你的星`／`走過去`／`走回來` | AABC | ABCD | 心ㄧㄣ／星ㄧㄥ 同家族 13；去ㄩ；來ㄞ |
| F-PART（含空行與英文行） | `愛你到天亮啊！`／（空行）／`（Oh baby）`／`想你想到心慌了…`／`好想好想你，嗎` | 跳語助詞：**A-AB**；不跳：**A-BA** | 跳：**A-BC**；不跳：A-BA | 目標字：亮／—／慌／你（跳）；啊／—／了／嗎（不跳）；`(Oh baby)` 收在英文字母→`-` |
| F-POLY | `我們快樂`／`聽著音樂`／`我不快樂` | 無詞庫 **AAA**；詞庫含 `音樂`＝`ㄧㄣ ㄩㄝˋ` 時 **ABA**；再手動 `readings['聽著音樂']='ㄌㄜˋ'` → **AAA**；手動值 `ㄅㄚ`（不合法）→ ABA（被忽略） | — | 樂 `getCharAllReadings`＝`ㄌㄜˋ`(common)、`ㄧㄠˋ`、`ㄩㄝˋ`(common) |
| F-KONG | `這是一首詩`／`我只想要你知`／`日子一天天`／`寫給自己的字`／`慢慢地想思` | **AABAA**（空韻同群） | **ABCDE** | Pitfall 2 的鎖定測試 |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MAP-01 | `lhRhymeMatch` 與 `validateWordRhyme`、`filterWordsByRhymeSingle` 在 9,800 組字對（寬／嚴）零差異；golden 全部不變 | e2e + node | `npx playwright test tests/rhyme-parity.spec.mjs tests/golden.spec.mjs tests/core-node.spec.mjs` | ❌ Wave 0（parity 新增；golden／core-node 既有） |
| MAP-01 | 字卡不變式：`searchRhyme(c)` 結果韻母 ⊆ 家族 ∪ {ㄣ↔ㄥ} | e2e | 同上 | ❌ Wave 0 |
| MAP-02 | 句尾字依家族上色：每個 `.rmap-hl` 的 `data-f` ＝ `RHYME_TO_FAMILY[rhyme]`（空韻 16）；同家族同色、不同家族不同色 | e2e | `npx playwright test tests/rhyme-map-ui.spec.mjs -g "上色"` | ❌ Wave 0 |
| MAP-02 | 鏡像對齊：隱藏 textarea 文字與隱藏鏡像文字兩張截圖逐像素相同（捲動 0／中／底；注入 15px `::-webkit-scrollbar`；負向對照＝不補捲軸寬必須 DIFF） | e2e | `... -g "鏡像對齊"` | ❌ Wave 0 |
| MAP-02 | 晝夜主題：最差文字對比 ≥ 4.5（淺 26%＝7.46、深 20%＝4.68 的實算值）；`.rmap-backdrop` 與 `.section-textarea` 的 computed 字型／行高／padding／overflow-wrap 在 3 裝置×縮放 100／150 相等 | e2e | `... -g "對比\|樣式一致"` | ❌ Wave 0 |
| MAP-03 | 句中押韻預設關；開啟後只在非句尾字畫 `.rmap-in`，每行 ≤ 3 | node + e2e | `... -g "句中"` | ❌ Wave 0 |
| MAP-04 | F-AABB／F-ABAB／F-FAM*／F-PART／F-KONG 字母與統計文字全部符合上表 | node | `npx playwright test tests/rhyme-core.spec.mjs -g "字母"` | ❌ Wave 0 |
| MAP-04 | 標題列字母預設隱藏；開啟後顯示、> 12 行縮成前 12＋「…」；點開選單逐行可查 | e2e | `... -g "標題字母"` | ❌ Wave 0 |
| MAP-05 | 選取文字→浮動列出現（組字中不出現）；「查韻」把選取最後一字填進 `#searchInput` 並出現字卡；手機自動切查韻頁；Esc／捲動／點別處收起 | e2e（桌機＋手機 CDP 觸控） | `... -g "浮動列"` | ❌ Wave 0 |
| MAP-05 | 「AI 建議」在 `/ai` stub 下先查韻、再出現 `.ai-word-card`；`lastLyricsSelection` 被清 | e2e | `... -g "AI 建議"` | ❌ Wave 0 |
| MAP-06 | 嚴格／寬韻 toggle 立即反映（字母、`.solo`、顏色不變）；設定寫入 `lh:map` | e2e | `... -g "開關"` | ❌ Wave 0 |
| MAP-07 | 忽略語助詞開關即時改變目標字；整行都是語助詞用最後一字 | node + e2e | `rhyme-core` `-g "語助詞"` | ❌ Wave 0 |
| MAP-08 | 手動讀音後上色跟著變、重整仍在、行尾字改了自動失效；備份匯出→匯入 `readings` 與 `lh:map` 不丟；惡意 readings（`__proto__`、超長、非注音）被丟 | e2e + node | `npx playwright test tests/rhyme-map-ui.spec.mjs tests/songs-backup.spec.mjs -g "讀音\|備份"` | ❌ Wave 0 |
| MAP-12 | 組字中分析次數＝0、鏡像層子樹突變＝0；確認後 ≥ 200ms 內只重算被改的那一段（以 `window.__rmapStats` 計數或快取命中數驗證）；快取命中時不重畫 | e2e | `... -g "組字\|快取"` | ❌ Wave 0 |
| MAP-12 | 120 行歌詞連續打字，4×／6× 降速下 `PerformanceObserver('longtask')` 無 > 50ms 項目（計時測試 `LH_PERF=1`）；永遠跑的結構性斷言：`lhMapAnalyze` 200 行 < 20ms | perf | `LH_PERF=1 npx playwright test tests/rhyme-map-perf.spec.mjs --workers=1` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx playwright test tests/rhyme-core.spec.mjs tests/core-node.spec.mjs tests/split-tags.spec.mjs tests/scan.spec.mjs`（Node＋靜態，< 20s）
- **Per wave merge:** 加跑 `tests/rhyme-parity.spec.mjs tests/rhyme-map-ui.spec.mjs tests/golden.spec.mjs tests/songs-ime.spec.mjs tests/sections-ui.spec.mjs tests/sections-audit.spec.mjs`
- **Phase gate:** `npm test` 全綠、`LH_PERF=1` 計時測試綠，才進 `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/rhyme-core.spec.mjs` — 原語、`lhMapTarget`（含空行、全形標點、emoji、英文收尾、整行語助詞）、`lhMapReading` 三段優先序、字母表（>26 種韻）、`lhMapNormalizeSettings`／`lhMapCleanReadings` 形狀清洗。載入方式：`loadCore()`＋手動補 `polyphonicsOrderMap`（`loadCore` 不載 polyphonic-order；原型用 `ev("polyphonicsOrderMap = new Map(Object.entries(...))")`）；`ctx.performance = performance`（vm 內預設沒有 `performance`）。
- [ ] `tests/rhyme-parity.spec.mjs` — 在頁面內取 70 個查詢字（含破音字）×70 個單讀音有家族的字，寬／嚴各比一次（本研究以相同方法跑 9,800 組零差異）。
- [ ] `tests/rhyme-map-ui.spec.mjs`、`tests/rhyme-map-perf.spec.mjs`
- [ ] 既有檔案修改：`tests/node-core.mjs`（CORE 加 `js/rhyme-core.js`）、`tests/scan.spec.mjs:69-70`（21→22，並在「掃描器自我檢查」之外確認 `lh:map` 已登記）、`tests/split-tags.spec.mjs`（`JS_ORDER` 加 `'rhyme-core'`（`polyphonic` 之後）與 `'rhyme-map'`（`word-drag` 之後）、註解與訊息的「26」→28）、`tests/songs-ime.spec.mjs:83`、`tests/sections-ui.spec.mjs:266`（過濾 `.rmap-backdrop`）、`tests/sections-audit.spec.mjs:383` 的 `FILES` 加兩個新檔
- [ ] 視覺：`npm run visual:update` 重拍 -darwin 的 `desktop/tablet/phone-lyrics`（及任何含 `.lyrics-tools` 的截圖，例如 `phone-150-zhuang`）；`.rmap-backdrop` 在無歌詞時為空，不應造成其他差異
- [ ] 觸控稽核：`tests/layout.spec.mjs` 的「歌詞開著」`mustSee` 可加 `button#rmapMenuBtn`；新的選單列、浮動列按鈕都要 ≥ 44×44（`auditTouchTargets` 會掃到）

### Manual-only（Human check，附理由）
- 句尾色塊在實機（iPad／iPhone Safari、Android Chrome）的可讀性與美觀、17 色辨識度與色盲友善度（A7）。
- 實機注音組字不受影響；Safari 慣性捲動時鏡像層不抖（A3）；iOS 原生選單不擋浮動列（A1）；手機長按選字後浮動列出現（A2）；鏡像對齊在 Safari／Firefox（A4）。
- UAT 待 Andy 確認的自主決定：Open Questions 1、2、6，以及 CONTEXT 列的七項。

## Security Domain

`security_enforcement: true`、`security_asvs_level: 1`、`security_block_on: high`（`.planning/config.json`）。

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | 無帳號／登入 |
| V3 Session Management | no | — |
| V4 Access Control | no | 純前端、僅本機儲存 |
| V5 Input Validation | **yes** | 備份匯入的 `readings`／`lh:map` 在 `safety.js` 做形狀白名單（regex＋筆數上限＋`Object.keys` 只走自有鍵）；歌詞文字一律 `textContent`；CSS 值只由 JS 常數產生（`setProperty` 寫驗證過的 `rgba()`／整數），不拼使用者字串 |
| V6 Cryptography | no | 無 |
| V10/V14 惡意程式與設定（DOM XSS、依賴） | **yes** | 新檔通過 acorn「無 HTML sink」掃描；不新增套件；不新增 `innerHTML`／`insertAdjacentHTML`／`on*` 屬性 |

### Known Threat Patterns for 純前端 vanilla JS（本 phase）
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| 惡意備份檔把 `readings` 塞成巨量或 `__proto__` 鍵（原型污染／DoS） | Tampering／DoS | key 限 `^\p{Script=Han}{1,4}$`（天然排除 `__proto__`／`constructor`）、value 限 `^[ㄅ-ㄩ]{1,4}[ˊˇˋ˙]?$`、最多 2000 筆；乾淨物件重建 |
| 歌詞含 `<img onerror>` 進鏡像層 | Tampering（XSS） | 鏡像文字用 `append(string)`／`textContent`（Text node），`dataset.f` 只寫整數；加入 `sections-audit`「惡意文字只當文字」情境（鏡像層與浮動列按鈕文字） |
| 超長段落（備份允許 100 萬字）讓鏡像排版或 `lhMirror` 卡死 | DoS | 單段 > 5,000 行或 > 200,000 字不分析不畫鏡像（Open Question 10）；浮動列定位在超長段落改固定位置 |
| `lh:map` 被手改成非物件／非布林 | Tampering | `lhMapNormalizeSettings` 只收 5 個已知布林鍵，其餘補預設 |
| 選取文字送進搜尋框造成注入 | Tampering | 只寫 `input.value`（既有搜尋流程本來就處理任意字串）；浮動列按鈕文字用 `textContent` |

## Sources

### Primary (HIGH confidence)
- 本專案原始碼（本 session 開檔讀過）：`js/search.js`、`js/candidates.js`、`js/wordlist.js`、`js/phonetic-tables.js`、`js/dict.js`、`js/polyphonic.js`、`js/rhyme-display.js`、`js/lyrics.js`、`js/sections.js`、`js/sections-core.js`、`js/songs.js`、`js/safety.js`、`js/word-drag.js`、`js/layout.js`、`js/ai-generate.js`、`js/search-ui.js`、`js/panels.js`、`js/init.js`、`js/state.js`、`js/theme.js`、`css/panels.css`、`css/responsive.css`、`css/base.css`、`index.html`
- 本專案測試：`tests/golden.spec.mjs`、`core-node.spec.mjs`、`node-core.mjs`、`scan.spec.mjs`、`scan-lib.mjs`、`split-tags.spec.mjs`、`style.spec.mjs`、`visual.spec.mjs`、`perf.spec.mjs`、`helpers.mjs`、`drag-lib.mjs`、`layout-lib.mjs`、`songs-ime.spec.mjs`、`sections-ui.spec.mjs`、`sections-audit.spec.mjs`、`songs-crosstab.spec.mjs`
- 本 session 的 Playwright／Node 實測（Chromium 153.0.8010.12、Playwright 1.63.0）：Custom Highlight 在 textarea 無效、鏡像逐像素對齊（含負向對照）、`ResizeObserver` 捲軸觸發、`selectionchange`／`select` 事件、`text-decoration`＋背景在 `color:transparent` 上可畫、9,800 組判定對照、全字典讀音對照、Node vm 分析耗時、鏡像重建耗時（1×／4×／6× 降速）
- `.planning/phases/09-section-modules/09-10-SUMMARY.md`、`09-RESEARCH.md`（桌機 textarea 不撐滿的既有現象）

### Secondary (MEDIUM confidence)
- [MDN — Document: selectionchange event](https://developer.mozilla.org/en-US/docs/Web/API/Document/selectionchange_event)：文字框的 `selectionchange` 在元素上觸發並冒泡；document 層級不冒泡（本頁未涵蓋各瀏覽器差異）
- [MDN — CSS Custom Highlight API](https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API)：可樣式化任意 Range；Baseline 2025「newly available」（2025-06 起）；未提 textarea（textarea 無效以本 session 實測為準）

### Tertiary (LOW confidence)
- 無（所有 `[ASSUMED]` 項目集中在 Assumptions Log，供 planner 設確認檢查點）

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 無新依賴；既有函式逐一讀過。
- Architecture: HIGH — 鏡像層、判定原語、掛鉤點都在真頁面／真字典上實跑。
- Pitfalls: HIGH（Chromium 範圍內）／MEDIUM（Safari／Firefox／iOS 行為為 `[ASSUMED]`，已列實機檢查）。

**Research date:** 2026-10-23
**Valid until:** 2026-11-22（專案內部穩定；若 Phase 9 的 `lhSecCountOne` 掛鉤點或 `.section-body` 結構被改動則需重驗）
