# Phase 11: Line Analysis & Settings 句構分析與設定頁 - Research

**Researched:** 2026-10-28
**Domain:** 純前端（vanilla JS、classic scripts、無建置）——在 Phase 10 的鏡像層上加逐行標記、句構純函式、選字浮動列的「分析」面板、偏好設定區塊與 `lh:map` 設定擴充
**Confidence:** HIGH（Chromium 範圍內，全部以實測驗證）／MEDIUM（WebKit、Gecko 沒有安裝，只能列為待實機確認）

<user_constraints>
## User Constraints (from CONTEXT.md)

> 以下逐字複製自 `11-CONTEXT.md`（Andy 睡覺中授權、Claude 自主決定的鎖定決策；事後由 Andy 在 UAT 確認）。

### Locked Decisions

**A. 字數與斷句規則（MAP-09）**
- **A1** 字數沿用 Phase 9 的 `lhCountWords`（js/sections-core.js）：漢字／假名／韓文／注音各算 1、英文或數字連續一串算 1、空白標點 emoji 算 0。句尾語助詞照算（會唱出來）。段落標題列的字數與逐行字數必須是同一套規則。
- **A2** 斷句分兩層：
  1. **明確斷點**：行內的空白（半形、全形）與標點（，、。！？；：…—～「」『』（）等）一定斷開，這是作詞人自己標的節奏，結果不加任何「猜」的記號。
  2. **自動猜**：沒有明確斷點、而且 ≥ 5 字的片段，用詞庫 `wordPhoneticMap`（已載入的詞，最長 4 字）由左到右「最長詞優先」切成詞，再把單字詞併進前一個詞（片段開頭的單字併進後一個詞），得到像 2+2+3 的結構。≤ 4 字的片段不猜，整段算一組。猜出來的結構前面加「≈」並用較淡的字（例：≈2+2+3），讓人一眼分得出哪些是自己標的、哪些是機器猜的。
- **A3** 空行、只有標點或空白的行略過（不佔行號、不顯示標記）。行號以「非空行的第幾行」算，對照時也用這個行號。
- **A4** 詞庫還沒載好時：明確斷點照常顯示，自動猜先不顯示（只顯示字數），載好後自動補畫（比照 Phase 10 A5）。
- **A5** 純函式（字數、斷點切分、自動猜、對照）放在可用 Node 載入測試的檔案（新檔或併入 rhyme-core.js 由 planner 決定），用固定歌詞範例斷言（SC1）。

**B. 段落對照（MAP-09）**
- **B1** 對照對象自動決定：同類型（Phase 9 的 type）裡排在它前面的第一段——Verse II 對 Verse I、Verse III 對 Verse I、Chorus II 對 Chorus I；custom 類型以「名稱相同」視為同類。每個類型第一次出現的那段沒有對照對象。
- **B2** 不做手動指定對照段落（要動歌曲資料格式與備份白名單，留到之後）。
- **B3** 常駐標記開著、而且「對照差異」這一項開著時：跟對照段落同一行號的字數不同 → 字數後面加「≠」與對方字數（例：`7 ≠8`）；對方沒有這一行 → 不標。字數相同就不加東西（只標差異，不製造雜訊）。
- **B4** 逐行對照的完整檢視放在「分析」面板（見 C3）：選到的每一行旁邊列出對照段落同一行的字數與結構，並標 ✓／≠。要看整段就把整段反白後按「分析」。不在段落標題列再加新按鈕（Phase 10 已經發現手機標題列放不下）。

**C. 觸發方式與呈現（MAP-10）**
- **C1 常駐模式**（設定裡「逐行標記」總開關）：每一行旁邊顯示淡色小字標記，內容可逐項開關：行尾韻腳字母（A／B…，跟著目前寬韻／嚴格）、字數、斷句結構、對照差異。例：`A · 7 · 3+4`。
- **C2 標記位置**兩種，設定可切換：
  - **靠右欄**（預設）：輸入框右邊留一條固定寬度的欄位放標記，數字上下對齊、方便比較。輸入框和鏡像層同時加同樣的右內距，換行位置仍逐字一致。
  - **句尾後**：標記緊接在每行最後一個字後面，不佔寬度、不改變換行；行太滿時標記會被輸入框邊緣切掉（設定說明要寫清楚）。
  - 一行被自動換行折成好幾個視覺行時，標記放在該行的**最後一個視覺行**。
- **C3 「分析」按鈕**：加進 Phase 10 的選字浮動列（🔍 查韻　✨ AI 建議　📏 分析；破音字仍有「指定讀音」）。按下後在浮動列下方展開「句構」面板：選取範圍碰到的每一行（只選到一部分也算整行）一列，欄位是「行文字（截短）｜字數｜結構」；有對照段落時多一欄「對照段落同一行的字數與結構」和 ✓／≠。
- **C4 反白停留自動出現**：只對滑鼠（`(hover: hover) and (pointer: fine)`）；反白完成後滑鼠停在選取範圍上 1.5 秒不動 → 自動展開同一個「句構」面板；移動、捲動、打字、選取改變就取消計時。觸控裝置不做停留，只有按鈕。**預設關**（嚴格遵守「全新使用者只開句尾上色」，SC3），設定裡可開。
- **C5** 組字中不分析、不出現浮層；同時只開一個浮層（沿用 `lhMapCloseAll`）；Esc、點別處、捲動就收起（比照 Phase 10 浮動列）。

**D. 設定頁（MAP-11）**
- **D1** 不另開新頁面：在既有「⚙️ 偏好設定」裡加一個可展開區塊「韻腳地圖與句構分析」（比照「自動備份」的 `<details>` 寫法），放全部開關與顯示方式；Phase 10 的「韻腳 ▾」快速選單保留常用開關，底部加「更多設定…」，直接打開偏好設定並展開這個區塊。兩邊讀寫同一份設定，改一邊另一邊立刻跟著變。
- **D2 逐項開關**：
  - 韻腳地圖：句尾上色、段落結構字母（標題列）、句中押韻、寬韻／嚴格、忽略句尾語助詞（Phase 10 既有五項，搬進來一起顯示）。
  - 句構分析：逐行標記（總開關）＋四個內容項（行尾韻腳字母、字數、斷句結構、對照差異）、反白停留自動分析。
- **D3 顯示方式**：
  - 標記位置：靠右欄／句尾後。
  - 標記文字大小：小／中／大（三段，rem）。
  - 顏色：16 個韻族的上色顏色都可以自訂（色票對照的每一格改成原生 `<input type="color">`），一個「恢復預設顏色」按鈕；自訂色晝夜共用（上色是用固定比例跟背景混色，同一個色在兩種主題都看得到）；句尾上色濃淡三段（淡／標準／濃）。
- **D4 全新使用者預設**：只開句尾上色；結構字母、句中押韻、逐行標記與四個內容項、反白停留自動分析全部關；寬韻、忽略語助詞維持 Phase 10 預設；位置靠右欄、大小中、濃淡標準、顏色預設。（逐行標記總開關打開時，四個內容項預設為：字數＋斷句開、韻腳字母與對照差異關——第一次打開就有東西看、但不擠。）
- **D5 儲存**：沿用 `lh:map` 那一個 JSON 物件，加新鍵；`lhRhymeNormalizeSettings` 擴充驗證（不認得的值回預設、顏色只收 `#rrggbb`、位置與大小只收列舉值、顏色物件只收 16 個已知韻族鍵）。舊版本存的設定自動補預設；跟著備份、匯入、跨分頁同步（Phase 10 已有這條路）。

**E. 外觀、效能、相容**
- **E1** 標記絕對不能改變輸入框與鏡像層的逐字對齊（Phase 10 的根本）：「句尾後」標記不佔寬度；「靠右欄」是輸入框與鏡像層一起加右內距，量測沿用 `_lhMapSync`。
- **E2** 效能沿用 Phase 10：組字中不算不畫；200ms 排程只重算改到的段；每段分析結果快取（key 要含新設定）；自動猜斷句的結果也快取；100 行以上連續打字沒有 > 50ms 的長任務。
- **E3** 沿用 Phase 5／9／10 規則：rem、觸控 ≥ 44px、晝夜／客製主題、hover 只給滑鼠、減少動態不做動畫、一律 textContent／不用 innerHTML 塞使用者文字、色碼不進 CSS、catch 要 `lhWarn`、不直接碰 localStorage。
- **E4** 版號 `?v=` 升到 0.96.15；視覺細節（欄寬、字級、面板版面、手機上的樣子）由 UI-SPEC 定。

### Claude's Discretion
- 以上 A～E 全部是 Claude 自主決定（Andy 授權）。最可能被 Andy 推翻、已列入 UAT 待確認：A2 自動猜斷句的規則（最長詞＋單字併前）與「≈」標示、B1 對照對象自動決定、B2 不做手動指定、B3 只標差異、C2 預設「靠右欄」（手機會少一點寫字寬度）、C4 停留 1.5 秒且預設關、D1 設定放進「⚙️ 偏好設定」而不是另開一頁、D3 自訂色晝夜共用、D4 打開逐行標記時的內容項預設。

### Deferred Ideas (OUT OF SCOPE)
- 手動指定對照段落（要改歌曲資料格式）。
- 每行字數目標與超出提醒。
- 聲調／平仄、倒字（旋律與字調衝突）分析。
- 整首歌的韻腳表、雙押／多字韻偵測（Phase 10 已延後）。
- 使用者自訂斷句詞表。

> 另：`11-UI-SPEC.md`（已核准，D-01…D-24）的**機制**決定同樣有約束力。本研究對其中幾處提出「實測後的修正」，全部列在下方〈UI-SPEC 修正清單〉與〈Open Questions〉，planner 請以那份清單為準。
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MAP-09 | 逐行句構分析：每行字數、斷句結構（如 3+4、2+2+3）、與對應段落比對（如 Verse I vs Verse II） | `lhLineAnalyze`（單位＝`_LH_WC_RE`，加總恆等於 `lhCountWords`）、前向最長詞切分實測範例（Pattern 2）、`lhLineRefIndex`（Pattern 3）、marker 技術實測（Pattern 1） |
| MAP-10 | 句構分析觸發方式：設定頁常駐、反白後按「分析」、反白後 hover 數秒（觸控以按鈕替代） | 浮動列第三顆按鈕＋面板（Pattern 5）、hover dwell 偵測設計（Pattern 6）、`page.clock` 可用於測 1.5 秒（已驗證時鐘可快轉 1501ms） |
| MAP-11 | 設定頁逐項開關、調整標記位置／文字大小／顏色；預設只開句尾上色 | `lh:map` schema 擴充＋最小序列化（Pattern 4）、`<details>` 偏好區塊與預覽（Pattern 7）、`--rm-cN`／`--rm-end` 變數（Pattern 8）、對比重算（已驗證 UI-SPEC §2.2 數字） |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Hosting**：純前端 GitHub Pages＋Cloudflare Worker，免維運免費；**不得新增 npm／CDN 依賴**。
- **Data safety**：更新不得弄丟使用者歌詞、覆寫、設定——`lh:map` 必須向下相容（舊的五布林物件照常載入）。
- **Code structure**：可拆成多個 JS／CSS 檔，但要無建置可直接部署；新 JS 檔要進 `index.html` 並帶同一個 `?v=`。
- **Devices**：電腦、平板、手機都要好用（觸控 ≥ 44px）。
- **Language**：介面與詞庫以台灣繁體中文為主，**嚴禁簡體**。
- **Conventions**：4 空白縮排、單引號、camelCase、`_` 前綴內部函式、註解用繁體中文並說明「為什麼」、`// ==================== 區段名 ====================` 區段標頭；無 ESLint／Prettier。
- **GSD 流程**：不在 GSD 流程外直接改 repo；使用者全域規則：每次 coding 任務後更新 `handoff.md`、"commit" 關鍵字才 commit、重大刪除（> ~30 行）先暫存或靠 git。
- **使用者偏好（memory）**：自主決定、一口氣做完多階段再集中測；只有授權／金鑰／本人選擇才停。
- **專案技能**：`.claude/skills/` 等目錄沒有專案技能。

## Summary

Phase 11 完全是 Phase 10 鏡像層架構的延伸，不需要任何新依賴。核心風險只有一個：**逐行標記絕不能改變輸入框與鏡像層的換行位置**。這次在 Chromium 153（Playwright 1.63 內建，是這台機器唯一裝的瀏覽器）實測了 UI-SPEC D-01 的「絕對定位標記、靠靜態位置落在行尾」技術：在真實 app DOM、131 個視窗寬度（330–1500px）、含手機 sheet 版面與 15px 古典捲軸的情況下，**標記開／關的字元位置完全相同**，標記落在該行最後一個視覺列，靠右欄（gutter）與句尾後（tail）兩種模式都成立。但實測也抓到一個 UI-SPEC 會踩到的**真問題**：標記若插在「行尾空白」之後，會破壞 `pre-wrap` 行尾空白的「懸掛」行為，讓該行多折一個視覺列（`w=131px` 起可重現）。**標記必須插在最後一個非空白字元之後、行尾空白之前。**

第二個重要發現是 gutter 的實作方式：UI-SPEC D-02 用 JS 量 `clientWidth` 算 `--lm-w`，並由 `ResizeObserver` 重算——這會在 RO 回呼裡改被觀察元素自己的 padding，有「ResizeObserver loop」風險。實測證明可以**完全不用 JS 量測**：把右內距寫成 `calc(0.75rem + min(var(--lm-cols), 36%) + var(--sp-2))`，輸入框與鏡像層會解析成相同的像素值（百分比都以 `.section-body` 寬度為基準；實測 ta／mirror padding 差恰為捲軸寬），只剩 `--lm-bar`（捲軸寬）由既有 `_lhMapSync` 多寫一行。同時 gutter 的有無必須**只取決於設定、不取決於文字內容**（否則使用者打下第一行字的瞬間輸入框 padding 會變，組字中版面跳動）。

自動猜斷句（前向最長詞，單字併前）用真詞庫（v096 預設包，233,713 詞，無單字詞條目）實測：`夢裡想起你的臉 → ≈2+2+3`（正好是 CONTEXT 的範例）、`我望著遠方的光 → ≈3+4`、`走過熟悉的街道 → ≈2+3+2`；200 行約 0.6ms，所以**不需要逐行 memo**，沿用既有的「每段快取」即可。其他重點：`CONTEXT B1`（對照＝同類型**第一段**）與 `UI-SPEC D-09`（「最近的前一段」）互相矛盾，採 CONTEXT；`lh:map` 若改成永遠寫滿 15 個鍵，Phase 10 至少 8 處「整串字串相等」的測試會全紅，建議**最小序列化**（只寫與預設不同的新鍵）；D-07（浮動列對任何長度選取出現）會直接推翻 Phase 10 的 `浮動列：這些情況不出現` 測試；設定頁 overlay 目前**沒有 Esc 處理**，但 D-19 寫成「as today」。

**Primary recommendation:** 新增 `js/line-core.js`（純函式：單位切分、斷點、自動猜、對照索引）＋在 `rhyme-core.js` 擴充 `lhRhymeNormalizeSettings` 並新增 `lhRhymeSerialize`（最小序列化）；標記用「最後一個非空白字元後、行尾空白前」的絕對定位 `span.lm-mk`；gutter／位置／字級／濃淡全部走 `<html>` 屬性與 CSS 變數（`data-lm`、`--lm-cols`、`--lm-fs`、`--rm-end`、`--rm-orph`），設定改變時**不重畫、不重新分析**，只有開關哪些 token 才需要重畫；其餘照 UI-SPEC。

## UI-SPEC 修正清單（planner 請優先採用）

| # | UI-SPEC / CONTEXT 原文 | 實測發現 | 建議做法 |
|---|---|---|---|
| X1 | D-01「marker 附加在行的最後一個字元之後（`\n` 之前）」 | 行尾有空白（半形、全形、tab）時，marker 夾在字與空白之間→**不會**變形；marker 夾在**空白與 `\n` 之間**→該行多折一列（Chromium 實測，`w=131–135` 重現） | marker 插在「最後一個非空白字元後、行尾空白前」：`append(core) → append(marker) → append(trailingWs) → '\n'` |
| X2 | D-02「`--lm-w`＝min(…, 36% of textarea.clientWidth)＋JS 由 `_lhMapSync`／RO 重算；另複製 `--lm-lh`」 | 純 CSS `min(var(--lm-cols), 36%)` 已實測等效且無 RO 迴圈風險；`--lm-lh` 不必要（marker 繼承鏡像層字級與行高，內層 token 縮小字級，天然與歌詞基線對齊） | 右內距寫成 CSS `calc`；JS 只在 `_lhMapSync` 多寫 `--lm-bar`；`--lm-cols`（rem 字串）、`--lm-fs` 寫在 `<html>` |
| X3 | D-02「section 的標記開啟時才加 `lm-gut` class」 | 以內容決定 padding，使用者打下第一行字或組字中 padding 會變，輸入框跳版 | gutter 只看設定（`line` 總開關開且 ≥ 1 個 token 開）→ `<html data-lm="right"\|"tail">`，與文字內容無關 |
| X4 | D-09「最近的前一段」vs CONTEXT B1／UI-SPEC §10.1「Verse II 與 III 都對 Verse I」 | 文件自相矛盾 | 採 CONTEXT B1：**同類型第一段**（custom 以名稱相同）；已寫入 Pattern 3 與測試表 |
| X5 | D-16「備份形狀檢查擴充到同一個 normaliser」（暗示輸出全部 15 個鍵） | Phase 10 測試硬編碼五鍵字串（見 Pitfall 4） | 新增 `lhRhymeSerialize`：五個舊鍵永遠照原順序寫，新鍵只在與預設不同時才寫，`colors` 非空才寫 |
| X6 | D-07 浮動列對任何長度選取出現 | 推翻 Phase 10 測試（`abc` 不出現、21 字不出現） | 這兩條斷言要改寫成新行為（見 Wave 0 清單） |
| X7 | D-19「Esc／backdrop 關閉偏好設定（as today）」 | `#settingsOverlay` 只有 backdrop `onclick`，**沒有 Esc 處理**（`js/search-ui.js:99-104`） | 要嘛加一個 Esc 關閉（建議，3 行），要嘛把 D-19 的 Esc 字樣拿掉；不要靠測試假設它存在 |
| X8 | D-10「更多設定…走既有 `toggleSettings` 路徑」 | `toggleSettings()` 是 toggle，overlay 已開時會把它關掉（`js/search-ui.js:40-45`） | 「更多設定…」用「已開就不動、沒開才開」的明確開啟（`overlay.classList.add('show')` ＋ `renderLexiconPackList()`） |
| X9 | 「對照差異」只在該段自己重畫時更新 | `lhMapSchedule` 只排被編輯的那一段；Verse I 改了，Verse II／III 的 `≠` 會過期 | `lnDiff` 開著時，排程一段就把同類型的所有段落一起排程（Pitfall 5） |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 單位切分、斷點、自動猜、對照索引 | Browser / Client（純函式，`js/line-core.js`） | — | 無 DOM、無儲存，可用 `node:vm` 測；沒有後端參與 |
| 設定驗證、序列化、備份／匯入正規化 | Browser / Client（`rhyme-core.js` ＋ `safety.js`） | — | `lh:map` 是 localStorage 單一鍵 |
| 逐行標記繪製（gutter／tail） | Browser / Client（`rhyme-map.js` 鏡像層 ＋ `panels.css`） | — | 標記在鏡像層裡，輸入框不動 |
| 版面開關（位置、字級、濃淡、顏色） | Browser / Client（CSS 變數與 `<html>` 屬性） | — | 不改 DOM 結構，不需重新分析 |
| 「分析」面板、hover 停留 | Browser / Client（`rhyme-map.js` 浮層） | — | 掛在 `body`，沿用 `.word-ctx-menu` 外殼 |
| 偏好設定區塊、預覽 | Browser / Client（`index.html` 靜態殼 ＋ JS 建內容） | — | 沿用 `<details class="settings-backups">` |
| 設定持久化／跨分頁同步 | Browser localStorage（`lhSet`／`lhGetJSON`／`storage` 事件） | — | 已登記於 `LH_KEYS` |
| 詞表（自動猜用） | Browser memory（`wordPhoneticMap`，由 IndexedDB 快取載入） | — | 本階段只讀不寫 |

沒有 Frontend Server／API／CDN／資料庫層的新工作。

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| 無（vanilla JS／CSS） | — | 全部實作 | 專案約束：無建置、無框架、無新依賴 [VERIFIED: .claude/CLAUDE.md 與 11-UI-SPEC.md "No new dependency"] |
| `@playwright/test` | 1.63.0（已安裝） | 瀏覽器測試與 `node:vm` 純函式測試的 runner | 專案既有測試框架 [VERIFIED: package.json devDependencies `"@playwright/test": "1.63.0"`] |
| Chromium | 153.0.8010.12（headless，Playwright 1243） | 唯一已安裝的瀏覽器 | [VERIFIED: `ls ~/Library/Caches/ms-playwright` 只有 chromium-1243 與 chromium_headless_shell-1243；`browser.version()` 實測] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node `node:vm` ＋ `tests/node-core.mjs` 的 `loadCore()` | Node v26.8.1 | 純函式測試 | `line-core` 與 `lhRhymeNormalizeSettings`／`lhRhymeSerialize` 單元測試 |
| Playwright `page.clock` | 隨 1.63.0 | 測 hover 1.5 秒 | 已驗證：`beforeGoto: ({page}) => page.clock.install()` 後 `page.clock.runFor(1500)` 使 `performance.now()` 前進 1501ms，頁面無錯誤 [VERIFIED: 實測] |
| `acorn` 8.18.0 | 已安裝 | 既有程式碼掃描測試 | 靜態掃描（innerHTML、catch 必有 `lhWarn`）沿用既有 `tests/scan*` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| 新檔 `js/line-core.js` | 併入 `rhyme-core.js` | 併入可省 3 處改動（`index.html`、`JS_ORDER`、`CORE`），但 `rhyme-core.js` 會混進與押韻無關的邏輯；兩者都可，**建議新檔**（測試目標乾淨） |
| gutter 用 JS 量測 px（UI-SPEC D-02 原案） | CSS `min(var(--lm-cols), 36%)` | JS 方案在 RO 回呼內改自己 padding，有 loop 風險；CSS 方案已實測 |
| 逐行 memo（`Map<line, result>`） | 每段快取（既有 `_lhMapCache`） | 200 行約 0.6ms，不需要 memo（YAGNI） |

**Installation:** 無（沒有任何套件要安裝）。

**Version verification:** 不適用——不引入任何外部套件。

## Package Legitimacy Audit

本階段不安裝任何外部套件，故不跑 `package-legitimacy check`。

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| （無） | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                    ┌──────────────── lh:map（localStorage 一個 JSON）────────────────┐
  設定來源:         │  舊五布林物件 / 新物件（+line,lnRhyme,lnCount,lnSplit,lnDiff,    │
  - 「韻腳 ▾」選單 ─►│  autoHover,pos,size,depth,colors）/ 備份匯入 / 別的分頁 storage  │
  - 偏好設定區塊   └───────────────┬─────────────────────────────────────────────────┘
  - 備份匯入                       ▼
                     lhRhymeNormalizeSettings（每鍵獨立退回預設，colors 只收 16 個固定鍵）
                                   │
                  ┌────────────────┴──────────────────┐
                  ▼                                   ▼
        lhRhymeSerialize（最小序列化）        lhMapApplyLook()  ← 設定改了只跑這個，不重畫
        → lhSet('lh:map')                     ├ --rm-cN（自訂色 ?? 預設組，依主題）
                                              ├ --rm-end / --rm-orph（淡/標準/濃）
                                              ├ <html data-lm="right|tail|">、--lm-fs、--lm-cols
                                              └ 預覽區塊重畫（偏好設定開著時）
  歌詞文字（模型 sec.text）
        │  lhMapSchedule（200ms／最多等 1000ms；組字中不排程；lnDiff 開著→同類型全排）
        ▼
  lhMapPaint(secEl)
   ├ 韻腳分析 lhRhymeAnalyze（end/inner/letters/lnRhyme 任一開才跑）
   ├ 句構分析 lhLineAnalyze × 每個非空行（line 總開關開且 count/split/diff 任一開）
   │     └ 單位切分（_LH_WC_RE）→ 明確斷點 → ≥5 單位片段才用 wordPhoneticMap 前向最長詞猜
   ├ 對照：lhLineRefIndex(sections) → 參考段的逐行字數（只在 lnDiff 開時算）
   └ 建鏡像層 DocumentFragment：core 文字 → span.lm-mk（絕對定位）→ 行尾空白 → '\n'
        ▼
  div.rhyme-mirror（輸入框不動；marker 不佔 inline 空間，故換行不變）

  選取 ─► 浮動列 #rhymeSelBar（🔍 ✨ 📏 指定讀音）─► 📏 ─► #rhymeAnalysis 面板
              │                                        ▲
              └ 滑鼠選取＋autoHover＋停留 1.5s ───────────┘（pointermove ≥3px、wheel、keydown、
                                                          selectionchange、composition 取消）
```

### Recommended Project Structure
```
js/
├── line-core.js        # 新：純函式（lhLineUnits/lhLineAnalyze/lhLineRows/lhLineRefIndex），Node 可載入
├── rhyme-core.js       # 擴充 LH_RHYME_DEFAULTS 之外的 LH_MAP_DEFAULTS、lhRhymeNormalizeSettings、lhRhymeSerialize
├── rhyme-map.js        # 標記繪製、lhMapApplyLook、分析面板、hover 停留、偏好設定區塊與預覽
├── safety.js           # lh:map 匯入分支改用 lhRhymeSerialize
├── songs.js            # （選用 IN-04）_normalizeSong 清洗 readings
css/panels.css          # .lm-mk/.lm-t*、[data-lm]、.rm-hl 的 var(--rm-end)、#rhymeAnalysis、.lm-preview
index.html              # <details id="mapSettingsSection"> 殼、line-core.js script 標籤、?v=0.96.15
tests/
├── line-core.spec.mjs          # 新：node:vm 純函式（SC1）
├── line-analysis-ui.spec.mjs   # 新：標記／面板／設定／hover／換行不變
└── node-core.mjs / split-tags.spec.mjs   # CORE、JS_ORDER 各加一項
```

### Pattern 1: 標記＝絕對定位 `span.lm-mk`，插在最後非空白字元之後（D-01 修正版）
**What:** 每個可分析行建一個 `span.lm-mk`（`position:absolute; white-space:nowrap; pointer-events:none`，不設 `left/top`）。絕對定位元素不占 inline 空間，所以不可能移動換行點；靜態位置讓它落在「該行最後一個視覺列的行尾」。
**When to use:** 鏡像層裡每個 `lhCountWords(line) > 0` 的行。
**實測結果（Chromium 153，可重現）：**

| 實驗 | 範圍 | 結果 |
|---|---|---|
| 獨立 HTML，tail／gutter × 321 個寬度 × 12 種行（含半形／全形／tab 行尾空白、純標點、英文長串、混排） | w=100–420 | tail：0 次字元位置差異、0 次 marker 落錯視覺列。gutter：w ≥ 106 全 0（w=100–105 時內容寬度不足一個字，不會出現在實際 36% 上限內） |
| **負向對照**：marker 夾在行尾空白與 `\n` 之間 | w=131–135 等 30 個寬度 | 該行**多折一列**（第 4 行 `夢裡想起你的臉 ` 之後所有行下移 25.84px）。所以 X1 修正是必要的 |
| 真實 app DOM（用 `bootPage`）＋ UI-SPEC CSS（改成百分比內距），40 行含上述所有行型 | 視窗寬 330–1500，步距 9（131 個寬度），含手機 sheet 版面 | `wrapChanged: []`、`padMismatch: []`、`rowBad: 0`、無 pageerror |
| 同上＋15px 古典捲軸（`launchWithBars`＋`injectScrollbar`） | 視窗寬 920–1500，步距 13 | 同樣全 0；gutter 欄右緣＝`ta.right − bar − 12px`（誤差 < 1.5px） |

[VERIFIED: 2026-10-28 本機 Chromium 153.0.8010.12 實測；腳本在 `/private/tmp/claude-502/-Users-Shared-Coding-Projects-Lucky-Hawaii/0e9f2856-552b-4615-b7d0-01fb9aecaa83/scratchpad/`（wrap2.mjs、real6.mjs、real7.mjs），可改寫為 Playwright 測試]

**WebKit／Gecko：** 沒有安裝，無法在本機測。靜態位置的垂直基準在各引擎可能差幾 px，且 `pre-wrap` 行尾空白＋行外元素的懸掛規則在 CSSWG 2019 決議後各引擎實作不一（搜尋結果只確認「規範對行尾空白在強制換行前是否懸掛有討論」，沒有找到針對絕對定位元素夾在其間的資料）[CITED: CSSWG 2019 resolution via lists.w3.org/Archives/Public/public-css-archive/2019Feb/0719.html]。**一律列為 `[ASSUMED]`，納入 Human check（iPad／iPhone Safari 必看）。** 備案（不要先做，YAGNI）：量測式——一次寫完後對每個非空行用 `Range.getClientRects()` 取最後一個視覺列的 top，再把 marker 以明確 `top` 定位；成本是一次強制 layout＋N 個 rect，100 行約可忽略。

**Example:**
```javascript
// 繪製一行（在 lhMapPaint 的 rows 迴圈內）。trailing whitespace 必須留在 '\n' 旁邊（X1）
const _LH_TRAIL_WS = /[ \t　]+$/;
function _lhMapAppendLine(frag, line, mk) {
    const m = _LH_TRAIL_WS.exec(line);
    const core = m ? line.slice(0, m.index) : line, ws = m ? m[0] : '';
    // …（句尾字／句中押韻的 span 照 Phase 10 邏輯 append core）
    frag.append(core);
    if (mk) frag.append(mk);          // 沒有可分析內容的行 mk 為 null
    if (ws) frag.append(ws);
}
```
注意：句尾字／句中押韻的 `span.rm-hl`／`span.rm-inner` 是以「字元索引」切 `Array.from(r.line)`，core 之後才接 marker；tail 字落在 core 內時不受影響。core 為空（整行只有空白）的行 `lhCountWords` 為 0，本來就不建 marker。

### Pattern 2: 句構純函式（`js/line-core.js`）
**What:** 單位切分用與 `lhCountWords` **同一個**正規表示式 `_LH_WC_RE`（`js/sections-core.js:95`），因此「各組字數加總 ＝ `lhCountWords(line)`」由構造保證；相鄰兩個單位之間只要隔著任何非單位字元（空白、標點、emoji）就是明確斷點，不需要維護標點清單。
**When to use:** 標記、分析面板、預覽共用同一個函式。
**Example（參考實作；已跑過下表所有案例與加總恆等式）：**
```javascript
// ==================== 句構分析：純函式 ====================
// 依賴（執行期才用到，載入順序不影響）：_LH_WC_RE（sections-core.js）、_LH_RHYME_HAN_RE（rhyme-core.js）
const LH_LINE_GUESS_MIN = 5;   // 沒有明確斷點、單位數 ≥ 這個才猜（CONTEXT A2）
const LH_LINE_WORD_MAX = 4;    // 詞最長 4 字（CONTEXT A2）

// has：詞存在嗎。預設讀全域 wordPhoneticMap（switchLexiconPack 會整個換掉 Map，所以每次現讀，不能快取參照）
function lhLineAnalyze(line, has) {
    const hasWord = has || (w => wordPhoneticMap.has(w));
    const frags = [];
    let cur = null, prevEnd = -1;
    for (const m of line.matchAll(_LH_WC_RE)) {               // 'gu' 旗標：matchAll 會複製，不污染 lastIndex
        if (!cur || m.index !== prevEnd) { cur = []; frags.push(cur); }   // 與前一單位之間有東西 → 明確斷點
        cur.push(m[0]);
        prevEnd = m.index + m[0].length;
    }
    if (!frags.length) return { n: 0, groups: [], guessed: false };       // 空行、純標點：略過（A3）
    const groups = [];
    let guessed = false, n = 0;
    for (const f of frags) {
        n += f.length;
        if (f.length < LH_LINE_GUESS_MIN) { groups.push(f.length); continue; }
        const words = [];                                      // 前向最長詞優先；每個元素是詞長（單位數）
        for (let i = 0; i < f.length;) {
            let k = 1;
            if (_LH_RHYME_HAN_RE.test(f[i])) {
                for (let t = Math.min(LH_LINE_WORD_MAX, f.length - i); t >= 2; t--) {
                    let han = true;
                    for (let j = i; j < i + t; j++) if (!_LH_RHYME_HAN_RE.test(f[j])) { han = false; break; }
                    if (han && hasWord(f.slice(i, i + t).join(''))) { k = t; break; }
                }
            }
            words.push(k);
            i += k;
        }
        const g = [];                                          // 單字詞併進前一個詞；片段開頭的單字併進後一個詞
        let lead = 0;
        for (const w of words) {
            if (w > 1) { g.push(w + lead); lead = 0; }
            else if (g.length) g[g.length - 1]++;
            else lead++;
        }
        if (lead) g.push(lead);
        if (g.length >= 2) guessed = true;                     // 機器真的切開了才算「猜」，整段併成一組不加 ≈
        groups.push(...g);
    }
    return { n, groups, guessed };
}
// 顯示字串：groups 少於 2 組沒有結構記號（字數已經說明了）；有猜過整串前面加「≈」
function lhLineStructText(r) {
    return r.groups.length < 2 ? '' : (r.guessed ? '≈' : '') + r.groups.join('+');
}
```

**固定範例與期望值**（`line-core.spec.mjs` 用 mini 詞表 `{夢裡,想起,你的,望著,遠方,時間,留在,這一,笑著,天亮,熟悉,街道,前方,不怕,回到,身邊,我也,終於,我想,走過,心慌,想到}`；全部已實跑）：

| 輸入行 | n | groups | 顯示 | 備註 |
|---|---|---|---|---|
| `月光 灑在 窗前` | 6 | [2,2,2] | `2+2+2` | 全是明確斷點，**無 ≈** |
| `夢裡想起你的臉` | 7 | [2,2,3] | `≈2+2+3` | CONTEXT 範例。mini 詞表有「你的」：夢裡/想起/你的/臉，單字「臉」併前 → 2+2+3（真詞庫同結果，見下） |
| `我望著遠方的光` | 7 | [3,4] | `≈3+4` | |
| `我想把時間留在這一天` | 10 | [3,2,2,3] | `≈3+2+2+3` | |
| `走過熟悉的街道` | 7 | [2,3,2] | `≈2+3+2` | |
| `終於我也回到你身邊` | 9 | [2,2,3,2] | `≈2+2+3+2` | |
| `你笑著說天亮` | 6 | [4,2] | `≈4+2` | 開頭單字「你」併進「笑著」 |
| `不怕前方的路遙` | 7 | [2,5] | `≈2+5` | 已知偏長（`的路遙` 併進前方）；Human check 重點 |
| `愛你到天亮` | 5 | [5] | （無結構） | 猜出來只有一組 → 不算猜、不加 ≈、不顯示 |
| `好想好想你，嗎` | 6 | [5,1] | `5+1` | 明確斷點；5 字片段猜不出（mini 詞表沒有「好想」）→ 一組，**無 ≈** |
| `（Oh baby）` | 2 | [1,1] | `1+1` | 英文各算 1 |
| `Oh愛你到天亮` | 6 | [6] | （無結構） | 英文單位在片段開頭併進後面的詞 |
| `夢裡想起你的臉，我望著遠方的光` | 14 | [2,2,3,3,4] | `≈2+2+3+3+4` | 一個片段有猜就整串加 ≈ |
| `` / `，。 ！` | 0 | [] | 略過 | 不佔行號（A3） |

**真詞庫（v096 預設包）差異說明：** 用 `data/wordlist-c00…09.json`（233,713 詞）的前向最長詞實測，`夢裡想起你的臉 → 夢裡/想起/你的/臉`，單字「臉」併前得 `2+2+3`（「你的」是詞庫裡的 2 字詞，p=0）。**詞庫裡沒有任何單字詞條目**（詞長分布 2:123,725、3:52,189、4:51,372…），所以「單字詞」＝沒被任何 ≥2 字詞覆蓋的字。已知的真詞庫誤切：`風吹過熟悉的街道 → 風吹/過熟悉的/街道 = 2+4+2`（自然斷法是 3+3+2，因為「過熟」是詞）；`不怕前方的路遙 → 2+5`。這些都是 Human check 的素材；使用者的補救是自己加空白（CONTEXT specifics 已寫）。**不要加優先度門檻**：試過 `p ≥ 1`，反而讓 `夢裡`（p=0）切不出來，`夢裡想起你的臉` 退化成 7 組一段。[VERIFIED: 實跑 `seg2.mjs`／`ref.mjs`，詞庫來自 repo `data/wordlist-c0N.json`]

**不變量（要有一個 fuzz／固定集測試）：** 對任何字串，`groups` 加總 `= lhCountWords(line) = n`。

**效能：** 200 行（真詞庫、冷 Map）中位數 **0.60ms** [VERIFIED: 實測 `ref.mjs`，Node v26.8.1]。結論：不做逐行 memo；沿用 `_lhMapCache` 的每段快取（`sig` 含設定與 `_lhMapEpoch`），詞庫換包時 `lhMapOnLexiconChange` 會 `_lhMapEpoch++` 並整個重畫（`js/wordlist.js` 已在載入成功時呼叫，Phase 10 WR-02 修過）。

### Pattern 3: 對照段落索引與逐行數字
**What:** `lhLineRefIndex(sections)` 回傳每段的對照段索引（或 -1）。**對照＝同類型的第一段**（CONTEXT B1；X4）；`custom` 以去頭尾空白後名稱相同視為同類；第一段本身為 -1。逐行號是「第幾個 `n > 0` 的行」。
```javascript
function lhLineRefIndex(sections) {
    const first = new Map();                       // 用 Map，不用物件字面量：'__proto__' 等名稱打不到原型鍵（沿用 sections-core.js 的寫法）
    return sections.map((s, i) => {
        const k = s.type === 'custom' ? 'custom:' + (s.custom || '').trim() : s.type;
        if (!first.has(k)) { first.set(k, i); return -1; }
        return first.get(k);
    });
}
// 逐行的字數與結構（略過 n === 0 的行），回傳 [{ row: 原始行號, n, groups, guessed }]
function lhLineRows(text, has) {
    const out = [];
    text.replace(/\r\n?/g, '\n').split('\n').forEach((line, row) => {
        const r = lhLineAnalyze(line, has);
        if (r.n > 0) out.push({ row, n: r.n, groups: r.groups, guessed: r.guessed });
    });
    return out;
}
```
標記上的差異：`a = rows[k].n`、`b = refRows[k]?.n`；`b !== undefined && a !== b` → 顯示 `≠b`（CONTEXT B3）。面板的 ✓／≠ 同一定義。參考段落的字數**不是**快取在被比較段，每次畫那一段時直接 `lhLineRows(refText)`（約 0.003ms／行）。

### Pattern 4: `lh:map` 擴充、正規化、最小序列化
**What:** 把 `LH_RHYME_DEFAULTS`（五鍵）保持不動，另加一個 `LH_MAP_DEFAULTS`（十五鍵）給正規化用；新增 `lhRhymeSerialize(settings)`。
```javascript
const LH_MAP_ENUM = Object.freeze({ pos: ['right', 'tail'], size: ['s', 'm', 'l'], depth: ['light', 'std', 'heavy'] });
const LH_MAP_COLOR_RE = /^#[0-9a-f]{6}$/;
const LH_MAP_COLOR_KEYS = Array.from({ length: 16 }, (_, i) => String(i));   // 固定 16 把鍵，不迭代輸入的鍵（無原型污染、O(16)）
function lhRhymeNormalizeSettings(o) {
    const out = Object.assign({}, LH_MAP_DEFAULTS, { colors: {} });
    if (o && typeof o === 'object' && !Array.isArray(o)) {
        const own = k => Object.prototype.hasOwnProperty.call(o, k);
        for (const k of Object.keys(LH_MAP_DEFAULTS)) {
            if (typeof LH_MAP_DEFAULTS[k] === 'boolean' && own(k) && typeof o[k] === 'boolean') out[k] = o[k];
        }
        for (const k of Object.keys(LH_MAP_ENUM)) if (own(k) && LH_MAP_ENUM[k].includes(o[k])) out[k] = o[k];
        const c = own('colors') ? o.colors : null;
        if (c && typeof c === 'object' && !Array.isArray(c)) {
            for (const k of LH_MAP_COLOR_KEYS) {
                if (Object.prototype.hasOwnProperty.call(c, k) && typeof c[k] === 'string' && LH_MAP_COLOR_RE.test(c[k])) out.colors[k] = c[k];
            }
        }
    }
    return out;
}
// 最小序列化：五個舊鍵永遠照 Phase 10 順序寫；新鍵只在與預設不同時才寫；colors 非空才寫
function lhRhymeSerialize(set) {
    const s = lhRhymeNormalizeSettings(set), o = {};
    for (const k of Object.keys(LH_RHYME_DEFAULTS)) o[k] = s[k];
    for (const k of Object.keys(LH_MAP_DEFAULTS)) if (!(k in LH_RHYME_DEFAULTS) && s[k] !== LH_MAP_DEFAULTS[k]) o[k] = s[k];
    if (Object.keys(s.colors).length) o.colors = s.colors;
    return JSON.stringify(o);
}
```
- 預設值（UI-SPEC §6 與 CONTEXT D4）：`end:true`、其餘舊鍵照 Phase 10；`line:false, lnRhyme:false, lnCount:true, lnSplit:true, lnDiff:false, autoHover:false, pos:'right', size:'m', depth:'std', colors:{}`。
- `lhMapSetSetting(key, value)` 的白名單由「`hasOwnProperty(LH_RHYME_DEFAULTS)` 且布林」改為：`key in LH_MAP_DEFAULTS` 且 `lhRhymeNormalizeSettings({..._lhMapSet, [key]: value})[key]` 深度等於 `value`（正規化沒有改掉它才算合法）。`colors` 用獨立的 `lhMapSetColor(n, hex)`。
- 三個呼叫點都改用 `lhRhymeSerialize`：`lhMapSetSetting` 的 `lhSet('lh:map', …)`（`js/rhyme-map.js:369`）、`safety.js` 匯入分支（`js/safety.js:553-556`）；`storage` 事件仍用 normalise 讀。
- 舊物件相容：舊的五鍵字串經 normalise→serialize 逐字不變（Pitfall 4）；沒碰過設定就不寫 `lh:map`（Phase 10 已有測試 `沒碰過設定就不寫 lh:map`）。

### Pattern 5: 「分析」按鈕與面板（D-07、D-08）
- 浮動列顯示條件改為：選取碰到至少一個 `lhCountWords > 0` 的行（任意長度）；≤ 20 字元且含漢字 → 三顆（＋指定讀音）；否則只有「📏 分析」。`_lhMapSelCheck` 目前在 `chars.length > LH_MAP_SEL_MAX` 與 `!han.length` 直接 `lhMapHideBar()`（`js/rhyme-map.js:743-745`），改成決定「按鈕組合」而不是隱藏。
- **選取碰到哪些行**：從 `ta.value` 用 `a`、`b`（去掉結尾換行後的 end）數 `\n` 得到起訖行；半個行也算整行。結尾剛好停在下一行行首（含 `\n` 之後）不算那一行。逐行資料用 `lhLineRows` 同一套，**不依賴標記是否畫出來**（預設設定下標記全關，面板也要能用）。
- 面板用 `lhPlaceMenu`（`js/ui-common.js`）放在浮動列下方，重用 `_lhMapBarPlace` 的 `lhCaretRect`（它已經建一次 `lhMirror(ta)`；同一次建好的鏡像也用來算 D-10 的 hover 區域，不要再建第二個）。
- 全部子節點 `createElement`＋`textContent`；行文字用既有 `_lhMapCut`（`js/rhyme-map.js:467`）截短。
- 關閉規則走既有的 `lhMapCloseAll`（`js/rhyme-map.js:420-424`）擴充：加 `lhMapHideAnalysis()`；`lhMapHideBar` 同時收面板。
- **IN-03 順手修**（Phase 10 REVIEW 留下的 info）：`_lhMapStatsFill → _lhMapStatsData → lhMapPaint → _lhMapStrip → _lhMapStatsRefresh → _lhMapStatsFill` 一次重畫建兩次對話框，且 `resize` 事件直接重建整個清單。修法：`_lhMapStatsData` 用重入旗標包住 `lhMapPaint`、`_lhMapStatsRefresh` 見旗標就 return；兩個 resize handler 只呼叫 `_lhMapStatsPlace`。分析面板的重畫模式要避免同樣的巢狀。

### Pattern 6: hover 停留（D-10，僅滑鼠）
```javascript
const LH_MAP_DWELL_MS = 1500, LH_MAP_DWELL_PX = 3;
let _lhPtr = { x: 0, y: 0, mouse: false };      // 最後一次 pointermove（capture，輕量）
let _lhDwellTimer = 0, _lhDwellAt = null;       // 計時中，及計時起算的座標
document.addEventListener('pointermove', e => {
    _lhPtr = { x: e.clientX, y: e.clientY, mouse: e.pointerType === 'mouse' };
    if (_lhDwellAt && Math.hypot(e.clientX - _lhDwellAt.x, e.clientY - _lhDwellAt.y) >= LH_MAP_DWELL_PX) _lhDwellArm();   // 動了 ≥3px：重新起算（區外則取消）
}, true);
```
- **起算點**：滑鼠路徑（`mouseup` → rAF → `_lhMapSelCheck`）顯示浮動列後，用 `_lhPtr`（放開滑鼠時指標通常就停在選取範圍上，**之後不會再有 pointermove**，所以不能只靠 move 事件起算）；鍵盤／觸控選取不起算（旗標 `_lhMapMouseSel`，在 `mouseup` 設、在 `keyup`／觸控路徑清）。
- **條件**：`_lhMapSet.autoHover` ＆ `matchMedia('(hover: hover) and (pointer: fine)').matches` ＆ `_lhPtr.mouse` ＆ 指標在 `snap.zone` 內（`snap.zone` ＝ 浮動列放置時用 `lhCaretRect(ta, m, a)` 與 `(ta, m, end)` 量一次的 `{left,right,top,bottom}`，之後不再量）。
- **取消**：`pointermove` ≥3px（重新起算或離區取消）、`wheel`、`scroll`（既有的捲動收浮動列就會連帶取消）、`keydown`、`selectionchange`／`_lhMapBarOnChange`、`compositionstart`、浮動列或面板被關、任何選單打開、指標進到浮動列／面板本身。
- **開啟**：呼叫與按鈕相同的 `lhMapOpenAnalysis(snap, false)`（不搶焦點）；面板打開後指標離開區域**不關**（D-10）。
- **iPad 觸控板／外接滑鼠**：`(hover: hover) and (pointer: fine)` 在 iPadOS 的實際回報沒有查證 → `[ASSUMED]`，因此另外要求 `_lhPtr.mouse`（`pointerType === 'mouse'`），觸控筆與手指不會誤觸。
- **測試**：`beforeGoto: ({ page }) => page.clock.install()` ＋ `page.clock.runFor(1499)` 面板未出現／`runFor(1)` 出現；`page.mouse.move` 產生真實 `pointermove`（`pointerType: 'mouse'`）；選取用既有的 `pick()`（`setSelectionRange`）再 `dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))` 走滑鼠路徑。**注意：** 我試過用 `page.mouse.down/move/up` 真拖曳在 fake clock 下得到 `selectionStart === selectionEnd`（拖曳沒選到字），原因沒查清；不要依賴真拖曳，沿用 Phase 10 的程式化選取。

### Pattern 7: 偏好設定區塊與預覽
- `index.html` 在自動備份 `<details>` 之後、`✉️ 意見回饋` 之前放靜態殼 `<details class="settings-backups" id="mapSettingsSection"><summary>韻腳地圖與句構分析</summary></details>`；內容由 `rhyme-map.js` 在第一次展開（`toggle` 事件）時用 `_lhMk`／`_lhMkBtn`／`_lhMkBlock`／`_lhMapSwitchRow` 建（這些 helper 在 `js/sections.js:619-636`）。
- 同步：`lhMapMenuSync` 改成同時處理 `#rhymeMenu` 與 `#mapSettingsSection` 兩處的 `.rm-switch`／`.type-row`（選取器用 `document.querySelectorAll('#rhymeMenu .rm-switch, #mapSettingsSection .rm-switch')`），所有設定變更（含 `storage` 事件、主題切換）都經過這一個函式。
- 預覽：把 `lhMapPaint` 內「由文字＋設定建 DocumentFragment」的部分抽成 `_lhMapBuildFrag(text, readings, set, ctx)`，真實鏡像層與預覽都呼叫它（preview-parity 測試成立的前提）。預覽容器是 `div.lm-preview > div.rhyme-mirror`，需覆寫 `.rhyme-mirror` 的 `position:absolute; display:none; color:transparent; overflow:hidden; height` 等基底規則（`css/panels.css:1613-1629`）。因為版面屬性改走 `<html data-lm>`（X3），預覽自動拿到同一組 padding 規則，不需要 `.lyrics-section` 祖先。
- 偏好設定 overlay 的內容寬度：`.settings-dropdown { width: min(22rem, 92vw); padding: 1.5rem 1.75rem; }`（`css/base.css:557-567`）→ 內容寬約 296px；顏色格 `repeat(auto-fill, minmax(var(--hit), 1fr))` 在 296px 下是 6 欄而非 UI-SPEC 寫的 5 欄（`6×44+5×4 = 284 ≤ 296`），不影響功能，Human check 看。

### Pattern 8: 外觀變數（不重畫）
```css
/* css/panels.css（改現有三行 34% / 17% 的硬編碼；色碼仍只存在 JS） */
.rm-hl { background: color-mix(in srgb, var(--rm-c) var(--rm-end, 34%), var(--card-bg)); }
.rm-hl.rm-solo { background: color-mix(in srgb, var(--rm-c) var(--rm-orph, 17%), var(--card-bg)); }
.rm-sw { background: color-mix(in srgb, var(--rm-c) var(--rm-end, 34%), var(--card-bg)); }
/* gutter：輸入框與鏡像層共用一條規則；--lm-cols 是 JS 從固定查表算出的 rem 字串 */
html[data-lm="right"] .section-textarea, html[data-lm="right"] .rhyme-mirror {
    padding-right: calc(0.75rem + min(var(--lm-cols), 36%) + var(--sp-2));
}
.lm-mk { position: absolute; white-space: nowrap; pointer-events: none; color: var(--text-secondary); }
html[data-lm="right"] .lm-mk { right: calc(var(--lm-bar, 0px) + 0.75rem); width: min(var(--lm-cols), 36%); overflow: hidden; }
html[data-lm="tail"] .lm-mk { margin-inline-start: 0.5em; }
.lm-t { font-size: var(--lm-fs); display: inline-block; }      /* marker 本身繼承鏡像層字級與行高，內層縮小 → 與歌詞同基線 */
```
- `var()` 放進 `color-mix` 百分比位置已在 Chromium 153 實測有效（`--rm-end:40%` → `color(srgb 1 0.6 0.6)`；未定義時退回 34% → `color(srgb 1 0.66 0.66)`）。[VERIFIED: 實測 `cm.mjs`]
- 查表（JS 常數，不是使用者字串）：`size`：s/m/l → 0.75/0.875/1；`depth`：light/std/heavy → [26,14]/[34,17]/[40,20]；`--lm-cols` ＝ Σ(啟用 token 欄寬 em) × fs(rem) 的數字＋`rem`（欄寬 em：字母 1.25、字數 1.5、差異 2.25、結構 5.5，欄間 0.5em，UI-SPEC §3.2）。
- 因為 `pos`／`size`／`depth`／`colors` 都只改變數與 `<html>` 屬性，**切換這些設定不重畫、不重新分析、不動輸入框節點**——游標、選取、捲動位置天然不受影響（UI-SPEC §9「Position switch」）。需要重畫的只有 `line`、四個 token、`end/inner/letters/strict/skipParticles`。
- `lhMapApplyPalette`（`js/rhyme-map.js:22-27`）改成 `colors[n] ?? 預設組[n]`，主題 `MutationObserver` 已在（第 30 行），再加 `storage` 事件與設定變更時呼叫。`<input type=color>` 的 `input` 事件只 `style.setProperty('--rm-cN', hex)`（先 `LH_MAP_COLOR_RE` 驗證），`change` 才 `lhMapSetColor`。

### Anti-Patterns to Avoid
- **marker 夾在行尾空白之後**（X1）：多折一列。
- **以文字內容決定 gutter padding**（X3）：組字／首行輸入時輸入框跳版。
- **在 `ResizeObserver` 回呼裡改被觀察元素的 padding**：觸發 `ResizeObserver loop completed with undelivered notifications`，Playwright `pageerror` 可能抓到。
- **設定改了就整份重新分析**：`pos`／`size`／`depth`／`colors` 只需要變數。
- **把 `wordPhoneticMap` 存成模組變數**：`switchLexiconPack` 會整個換掉 Map（`js/wordlist.js:311`）。
- **用 `Object.keys(輸入的 colors)` 迭代**：用固定的 16 把鍵，避免原型污染與 DoS。

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 字數／單位切分 | 自己寫第二套字元分類 | `_LH_WC_RE` ＋ `lhCountWords`（`js/sections-core.js:94-101`） | 段落標題列字數與逐行字數必須同一套（A1）；加總恆等式靠它 |
| 標點／空白斷點清單 | 維護一份標點字元表 | 「相鄰單位之間有任何非單位字元」 | 與 `lhCountWords` 同一定義，不會漏掉新符號或 emoji |
| 浮層定位 | 自己算夾進視窗 | `lhPlaceMenu`（`js/ui-common.js`）＋ `_lhMapBarPlace` 既有流程 | 鍵盤出現、`visualViewport` 縮放已處理 |
| 游標／行尾座標 | 自己量文字寬度 | `lhMirror`／`lhCaretRect`（`js/word-drag.js:23,92`） | 已驗證與輸入框逐字一致 |
| 顏色選擇器 | 自製色盤 | 原生 `<input type="color">`（Phase 9 的 `.section-color-input` 寫法，`js/sections.js:653`） | 專案既有模式；`input` 預覽、`change` 才儲存 |
| 色彩混合 | JS 逐像素算 | CSS `color-mix(in srgb, …)`＋變數 | 已是 Phase 10 作法；僅「對比提醒」才在 JS 重算 |
| 設定驗證 | 各處各寫 | 單一 `lhRhymeNormalizeSettings`（儲存、備份、`storage`、setter 都走它） | Phase 10 T-10-07 的設計 |
| 時間控制 | `setTimeout` mock | `page.clock`（Playwright 內建） | 已驗證可用 |

**Key insight:** 這個階段的難度全在「不要動到既有對齊不變量」，而不是演算法；凡是能用 CSS 變數、`<html>` 屬性或既有純函式解決的，都不要新增 JS 狀態。

## Runtime State Inventory

> 本階段不是 rename／refactor／migration，但改了一個**已存在**的持久化格式（`lh:map`），所以仍列出。

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `localStorage['lh:map']`：舊的五布林物件（Phase 10 使用者）或不存在 | 無資料遷移：新正規化對舊物件補預設；**不在讀取時寫回**（沿用 Phase 10 的「沒碰過設定就不寫 lh:map」） |
| Stored data | IndexedDB 詞庫快取 | None — 本階段只讀 `wordPhoneticMap` |
| Live service config | None — 沒有外部服務持有此設定（Worker 不涉及 `lh:map`） | None |
| OS-registered state | None — 純前端 | None |
| Secrets/env vars | None | None |
| Build artifacts | `index.html` 的 `?v=0.96.14` 標籤（11 個 css／js／data 標籤） | 全部升到 `0.96.15`；新增 `js/line-core.js` 標籤（`tests/split-tags.spec.mjs` 的 `JS_ORDER` 同步加入）；沒有 SW 快取清單、manifest 版號需要改（grep 只有 `index.html` 含 `0.96.14`） |
| 備份檔 | 既有備份檔（版本 2）內含 `settings['lh:map']` 字串 | 匯入走 normalise→serialize；舊檔逐字不變（見 Pitfall 4） |

## Common Pitfalls

### Pitfall 1: marker 夾在行尾空白之後會多折一列
**What goes wrong:** 行 `夢裡想起你的臉 `（尾端半形空白）在寬度剛好放得下 7 字時，加了 marker 後該行變兩列，後面所有行下移 25.84px。
**Why it happens:** `pre-wrap` 行尾空白在強制換行（`\n`）前會「懸掛」；一旦行外元素夾在空白與 `\n` 之間，空白不再被視為行尾而參與換行。
**How to avoid:** X1——marker 放在最後非空白字元之後、行尾空白之前。
**Warning signs:** 換行不變測試在 `w=131`（內容寬剛好 7 字 + 空白）紅。測試資料必須包含半形、全形（`　`）、tab 的行尾空白。

### Pitfall 2: 在 RO 回呼裡改自己的 padding
**What goes wrong:** `ResizeObserver loop completed with undelivered notifications`，可能被 `pageerror` 收集而讓整組測試紅。
**How to avoid:** X2——gutter 右內距寫成純 CSS `calc`＋`min(var(--lm-cols), 36%)`，JS 只多寫 `--lm-bar`（自訂屬性不影響被觀察元素的尺寸）。
**Warning signs:** `errors` 陣列裡出現 `ResizeObserver`。

### Pitfall 3: gutter 取決於內容會讓輸入框在打字當下跳版
**What goes wrong:** 空段落或剛打第一行時 gutter 還沒有，第一個可分析字出現的瞬間 padding 改變，組字中的 textarea 重排。
**How to avoid:** X3——`<html data-lm>` 只看設定；所有段落（含空段落）預留相同欄寬，跨段落的欄位也對齊。

### Pitfall 4: 一旦序列化多寫新鍵，Phase 10 的字串相等測試全紅
**What goes wrong:** 這些測試把 `lh:map` 當**整串字串**比對：`tests/rhyme-map-ui.spec.mjs:630`（`MAP_DEFAULT = '{"end":true,"letters":false,"inner":false,"strict":false,"skipParticles":true}'`）、`:640-643`（備份帶 `want`）、`:670`、`:672`、`:704`、`:1514`；`tests/rhyme-audit.spec.mjs:22-23,450`；`tests/rhyme-journey.spec.mjs:223`。
**How to avoid:** X5——`lhRhymeSerialize` 最小序列化，使舊設定的輸出與 Phase 10 逐字相同。Wave 0 的測試審計表（下）列出需改與不需改的。
**Warning signs:** `備份：壞掉的韻腳設定`、`備份：韻腳設定跟著備份走` 紅。

### Pitfall 5: 對照差異在被比較的段落改動後過期
**What goes wrong:** 在 Verse I 打字只重畫 Verse I；Verse II 的 `≠8` 仍是舊值，直到它自己被編輯。
**How to avoid:** X9——`lnDiff`（且 `line`）開著時，`lhMapSchedule(secEl)` 同時把「同類型所有段落」加入 `_lhMapPending`（只在 `_lhMapSet.line && _lhMapSet.lnDiff` 時）。快取 `sig` 另加「參考段文字」（存在 cache entry 裡，用字串相等比對，不要雜湊）。段落新增／刪除／換類型／排序走 `lhMapRenderAll`（`js/sections.js:551`），已涵蓋。

### Pitfall 6: D-07 推翻 Phase 10 的浮動列測試
**What goes wrong:** `浮動列：這些情況不出現`（`tests/rhyme-map-ui.spec.mjs:896-934`）斷言「`abc`（無中文字）不出現」與「21 字不出現」；D-07 之後兩者都會出現（只有「📏 分析」一顆）。另外 `浮動列：鍵盤操作`（:1003）的方向鍵循環、`浮動列：觸控按鈕夠大`（:1136）、`手機長按選字`（:1103）、`超長段落不量版面`（:1154）、`讀音：…` 系列也數按鈕或依賴按鈕順序，要逐一審。
**How to avoid:** 在計畫的 Wave 0／相關任務明確列出「改寫這些斷言」，不要讓執行者以為是回歸。

### Pitfall 7: 詞表尚未載入時的「≈」與快取
**What goes wrong:** 開機時 `wordPhoneticMap` 為空，若把「沒有猜」的結果當成最終快取，詞庫載好後不重畫。
**How to avoid:** 不需要額外機制——`_loadWordlistOnce` 成功後呼叫 `lhMapOnLexiconChange`（`_lhMapEpoch++` ＋ `lhMapRenderAll`），`sig` 含 `_lhMapEpoch`。面板與偏好設定的「詞庫載入中，≈ 的自動斷句稍後補上」以 `wordPhoneticMap.size === 0` 判斷。**測試要涵蓋**「先無詞庫 → 載入 → 出現 ≈」。

### Pitfall 8: 組字中不可動鏡像子節點
**What goes wrong:** 任何在 `compositionstart`～`compositionend` 之間新增／移除鏡像子節點，會讓 `組字：組字中鏡像零變動` 紅（它計 childList 突變）。
**How to avoid:** 新增的 `lm-typing` 只切 class（UI-SPEC D-06，tail 模式隱藏 marker 避免與新打的字重疊）；分析、marker 建構、面板、hover 計時全部在 `_lhComposing` 時不執行；`compositionstart` 取消 hover 計時並關閉面板。

### Pitfall 9: `lhMapPaint` 的「只開結構字母不逐行排版」捷徑
**What goes wrong:** 現在 `paintRows = _lhMapSet.end || _lhMapSet.inner`（`js/rhyme-map.js:73`）；只開逐行標記時 `end` 與 `inner` 都關，會整個不畫。
**How to avoid:** 判斷拆成兩個：`needRhyme = end || inner || letters || (line && lnRhyme)`、`needLine = line && (lnCount || lnSplit || lnDiff)`、`paintRows = end || inner || needLine`；`res` 可以是 null（只有句構標記）——`_lhMapStatsData` 已能處理 `res === null`。`rm-on` 在「有色塊／底線／marker 任一」時為真。

### Pitfall 10: 偏好設定 overlay 的 z-index 與 toggle
**What goes wrong:** overlay `z-index: 999`，浮層 `#rhymeMenu`／bar／面板 `10000` 會蓋在 overlay 上；`toggleSettings()` 又是 toggle。
**How to avoid:** X8——「更多設定…」先 `lhMapCloseMenu(false)`（以及整個 `lhMapCloseAll()`），再明確開啟 overlay；開啟 overlay 時也要 `lhMapCloseAll()`（bar／面板還開著會浮在 overlay 前面）。

### Pitfall 11: 對比提醒用 `getComputedStyle` 讀 color-mix
**What goes wrong:** Chromium 把 `color-mix` 的計算值序列化成 `color(srgb 1 0.6 0.6)`，不是 `rgb()`；直接解析容易錯。
**How to avoid:** 提醒函式只用 JS 對 `--text-primary`／`--card-bg`（以探針元素的 `getComputedStyle(el).color` 取得 `rgb(...)`）與 16 個色做 sRGB 逐頻道混色再算 WCAG 對比，與 `tests/rhyme-core.spec.mjs:217-224` 的 `mixHex`／`contrastOf` 完全相同公式，不去讀 `color-mix` 的計算值。

## Code Examples

### 換行不變測試骨架（把本次實測轉成 Playwright 測試）
```javascript
// 來源：本次實測 real6.mjs／real7.mjs。每個寬度：同一個鏡像層，先畫「無 marker」記錄每個字元的 (top,left)，
// 再畫「有 marker」記錄一次，兩串字串必須完全相等；另檢查 marker 落在該行最後非空白字元所在的視覺列
const tops = mirror => {
    const o = [], wk = document.createTreeWalker(mirror, NodeFilter.SHOW_TEXT);
    for (let n; (n = wk.nextNode());) {
        if (n.parentNode !== mirror) continue;               // 只算鏡像層直接的文字節點（略過 marker 裡的字）
        for (let i = 0; i < n.data.length; i++) {
            if (n.data[i] === '\n') continue;
            const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1);
            const q = r.getClientRects(), z = q[q.length - 1];
            o.push(z ? +z.top.toFixed(2) + ':' + +z.left.toFixed(2) : 'x');
        }
    }
    return o.join(',');
};
// 資料必須含：行尾半形空白、全形空白、tab、純標點行、英文長串、中英混排、40 行以上；
// 寬度 330–1500 掃描；兩種 data-lm；有／無 15px 捲軸（沿用 launchWithBars／injectScrollbar）
```

### 「更多設定…」明確開啟 overlay（X8）
```javascript
// 不用 toggleSettings()（已開會被關掉）。renderLexiconPackList 是 toggleSettings 開啟時會做的事
function lhMapOpenPrefs() {
    lhMapCloseAll();
    const overlay = document.getElementById('settingsOverlay');
    if (!overlay.classList.contains('show')) { overlay.classList.add('show'); renderLexiconPackList(); }
    const d = document.getElementById('mapSettingsSection');
    d.open = true;
    d.scrollIntoView({ block: 'start' });                    // 不加 behavior：瞬間捲動（減少動態）
    d.querySelector('summary').focus({ preventScroll: true });
}
```

### 讀入時清洗 readings（IN-04，順手修）
```javascript
// js/songs.js _normalizeSong 內（REVIEW IN-04 / IN-05 的建議做法；rhyme-core.js 載入較晚，執行期才呼叫，要有 typeof 守門）
if (s.readings !== undefined) {
    const r = typeof lhRhymeCleanReadings === 'function' ? lhRhymeCleanReadings(s.readings) : null;
    if (r) { if (JSON.stringify(r) !== JSON.stringify(s.readings)) changed = true; s.readings = r; }
    else { delete s.readings; changed = true; }
}
```
> 注意：`_normalizeSong` 的 `changed` 旗標代表「要寫回儲存」；該函式有註解寫「讀取不寫入」的刻意設計（只對 label 重算不設 `changed`）。清洗 readings 是否寫回屬於政策決定——建議**不設 `changed`**（保持「讀取不寫入」），只讓記憶體裡的資料乾淨，下次編輯才寫入。

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 鏡像層 + JS 量測行尾座標再定位 overlay | 絕對定位靜態位置（不量測） | 本階段 | 少一次強制 layout；風險移到跨引擎一致性（待實機） |
| 以 px 在 JS 算欄寬 | CSS `min()` ＋ 百分比內距 | 本階段（X2） | 無 RO 迴圈、縮放自動跟 |
| 一律整份重畫 | 外觀屬性走變數與 `<html>` 屬性 | 本階段 | 切換位置／字級／濃淡／顏色零重畫 |

**Deprecated/outdated:** 無。

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | WebKit（iOS／iPadOS Safari）與 Gecko 對「絕對定位 marker 夾在最後非空白字元與行尾空白之間」的換行行為、垂直靜態位置與 Chromium 相同 | Pattern 1 | iPad／iPhone 上 marker 位置偏幾 px 或某行多折；備案是量測式定位。**列入 Human check（必看）** |
| A2 | `(hover: hover) and (pointer: fine)` 在 iPadOS 接觸控板／滑鼠時的回報值 | Pattern 6 | 若誤判為 fine，觸控板使用者會看到 hover 自動開面板（預設關，且另有 `pointerType === 'mouse'` 把關），風險低 |
| A3 | v096 以外的詞庫包（chewing、mcbopomofo、vanguard-tw）的猜斷句品質與 v096 相近 | Pattern 2 | 品質差異只影響 ≈ 的準確度；規則本身不變 |
| A4 | `page.mouse.down/move/up` 真拖曳在 fake clock 下選不到字（本次實測 `selectionStart === selectionEnd`，原因未查清） | Pattern 6 | 若測試想用真拖曳會不穩；建議用程式化選取（Phase 10 已有 `pick()`） |
| A5 | 色碼 `<input type=color>` 在 iOS 的 `input`／`change` 時序（拖曳中觸發 `input`、關閉面板時觸發 `change`） | Pattern 8 | 若 iOS 只在 `change` 觸發，預覽不即時但提交仍正確；列入 Human check |
| A6 | 其餘瀏覽器對 `color-mix()` 內 `var()` 百分比的支援與 Chromium 相同（Safari 16.2+、Firefox 113+ 皆支援 color-mix） | Pattern 8 | 現有 `@supports not (color-mix…)` 後備已存在（`css/panels.css:1642-1645`），舊瀏覽器退回固定 `opacity` |

## Open Questions (RESOLVED)

> 全部採下列建議（Claude 自主決定，2026-10-28，Andy 授權；列入 11-08 UAT）。

1. **對照＝第一段還是最近的前一段？** — **RESOLVED：採同類型第一段（`lhLineRefIndex`）**
   - What we know: CONTEXT B1 與 UI-SPEC §10.1 寫「Verse III 對 Verse I」；UI-SPEC D-09 文字寫「nearest earlier」。
   - What's unclear: 哪個是 Andy 的意思。
   - Recommendation: 採 CONTEXT（鎖定決策，且同類型第一段通常是歌詞結構的「基準段」）；`lhLineRefIndex` 一個函式就能換，單元測試固定在這個語意。列入 UAT。

2. **`lh:map` 是否永遠寫滿 15 鍵？** — **RESOLVED：採最小序列化 `lhRhymeSerialize`（X5）**
   - Recommendation: 最小序列化（X5），避免改寫 8+ 條 Phase 10 測試，也讓降版時舊程式讀到的仍是五鍵布林。

3. **設定頁要不要補 Esc 關閉？** — **RESOLVED：補 Esc 關閉偏好設定（X7）**
   - What we know: 現況沒有（X7）。
   - Recommendation: 補，`keydown` Esc 且 overlay 有 `show` 且沒有 `<input type=color>` 彈窗時關閉；3 行＋1 個測試。若不補，D-19 的文字要改。

4. **分析面板與選字浮動列的「一起算一個浮層」** — **RESOLVED：面板綁在浮動列上，`lhMapCloseAll` 同收（覆寫 CONTEXT C5，已在 UI-SPEC D-08 註明）**（UI-SPEC D-08 override CONTEXT C5）
   - Recommendation: 照 UI-SPEC（面板綁在浮動列上）；`lhMapCloseAll` 同時收兩者。

5. **IN-04（readings 讀入清洗）要不要這階段做？** — **RESOLVED：本階段做 IN-04／IN-03／IN-05**
   - Recommendation: 做，一個小任務＋一個測試（手改 `lh:songs` 讓 `readings` 是字串／陣列，不應拋錯且不被寫壞）；不設 `changed`（保持「讀取不寫入」）。IN-03 同理（Pattern 5）。IN-05（`safety.js` 的 `typeof` 守門）一併加在 `_lhSettingFrom` 的 `lh:map` 分支。

6. **marker 數量對大段落的成本** — **RESOLVED：不改上限，用效能測試把關；超標才降 marker 建構上限**
   - What we know: Phase 10 REVIEW IN-06 指出 `LH_MAP_MAX_LINES = 5000` 遠高於已量測範圍。每個可分析行加 1 個 marker＋最多 4 個 token span。
   - Recommendation: 本階段不改上限（UI-SPEC 明定超過上限無 marker）；效能測試擴充到 150 行、全部 token 開（Validation 表 V-10）。若實測超標，再降低 marker 的建構上限（例如只在 ≤ 1000 行時建 marker）。

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | `node:vm` 測試、Playwright | ✓ | v26.8.1 | — |
| `@playwright/test` | 全部瀏覽器測試 | ✓ | 1.63.0 | — |
| Chromium | 瀏覽器測試 | ✓ | 153.0.8010.12 | — |
| WebKit／Firefox（Playwright） | 跨引擎驗證 marker 技術 | ✗ | — | 無；改列 Human check（iPad／iPhone Safari 必看，Firefox 選看） |
| `tests/serve.mjs` 靜態伺服器 | `webServer`（config 自動啟動） | ✓ | — | — |
| 真詞庫 `data/wordlist-c00…09.json` | 斷句範例與效能 | ✓ | 233,713 詞 | 測試用 `tests/fixtures/wordlist-stub.ndjson` 與 mini 詞表 |

**Missing dependencies with no fallback:** 無。
**Missing dependencies with fallback:** WebKit／Firefox → Human check。

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright Test 1.63.0（瀏覽器測試）＋ `node:vm` 純函式測試（`tests/node-core.mjs` 的 `loadCore()`） |
| Config file | `playwright.config.mjs`（`testDir: 'tests'`、`fullyParallel`、`webServer: node tests/serve.mjs`、Desktop Chrome 1280×900） |
| Quick run command | `npx playwright test tests/line-core.spec.mjs tests/rhyme-core.spec.mjs tests/split-tags.spec.mjs` |
| Full suite command | `npm test`（Phase 10 結束時 964 passed／28 skipped／0 failed，見 `10-REVIEW-FIX.md`） |
| Perf command | `LH_PERF=1 npx playwright test tests/rhyme-map-perf.spec.mjs --workers=1`（門檻乘 `LH_PERF_SCALE`） |
| 截圖 | 只更新 `-darwin`（`npx playwright test tests/visual.spec.mjs --update-snapshots`） |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MAP-09 | 單位切分＝`lhCountWords`；`月光 灑在 窗前→2+2+2` 無 ≈；`夢裡想起你的臉→≈2+2+3`；≤4 字不猜；空行／純標點略過；加總恆等 | unit | `npx playwright test tests/line-core.spec.mjs` | ❌ Wave 0 |
| MAP-09 | `lhLineRefIndex`：Verse II／III→Verse I、Chorus II→Chorus I、custom 同名、第一段 -1、custom 不同名不配對 | unit | 同上 | ❌ Wave 0 |
| MAP-09 | 逐行對照：字數不同→`≠b`，相同不標，對方沒有該行不標；行號以非空行算 | unit ＋ e2e | `… -g "對照"` | ❌ Wave 0 |
| MAP-09 | 標記不改換行：tail／gutter × 掃寬 × 行尾空白 × 有／無捲軸 × scale 50／100／150 | e2e | `npx playwright test tests/line-analysis-ui.spec.mjs -g "換行不變"` | ❌ Wave 0 |
| MAP-09 | marker 在最後一個視覺列；gutter 欄右緣＝`ta.right − bar − 0.75rem` | e2e | `-g "最後視覺列"` | ❌ Wave 0 |
| MAP-09 | 詞庫尚未載入：只有字數與明確斷點，載入後出現 ≈ | e2e | `-g "詞庫載入"` | ❌ Wave 0 |
| MAP-10 | 常駐：`line` 開→每行 `A · 7 · 3+4` 依 token 開關；預設設定不出現任何 marker | e2e | `-g "常駐"` | ❌ Wave 0 |
| MAP-10 | 「分析」按鈕：半行選取算整行；表格列、對照列、✓／≠；> 80 行截斷；空選取文案；Esc／點外面／捲動／選取改變收起 | e2e | `-g "分析面板"` | ❌ Wave 0 |
| MAP-10 | D-07：長選取、無中文字選取只有「📏 分析」；≤ 20 字含漢字三顆 | e2e（**改寫** `rhyme-map-ui.spec.mjs:896`） | `-g "浮動列"` | ✅ 需改 |
| MAP-10 | hover 停留：`autoHover` 開、滑鼠、1.5 秒才出現（1499ms 未出現）；移動 ≥3px／wheel／keydown／選取改變／組字取消；觸控與 `autoHover` 關不出現 | e2e（`page.clock`） | `-g "hover"` | ❌ Wave 0 |
| MAP-10 | 組字中：不分析、鏡像子節點零變動（只可切 `rm-stale`／`lm-typing`）、面板不開、確認後只重畫一次 | e2e | `-g "組字"` | ✅ 擴充 |
| MAP-11 | `lhRhymeNormalizeSettings`：逐鍵退回預設、`colors` 只收 16 鍵＋`#rrggbb`（含 `__proto__`、大寫、短碼、非字串）、舊五鍵補預設 | unit | `tests/rhyme-core.spec.mjs` | ✅ 擴充 |
| MAP-11 | `lhRhymeSerialize`：舊五鍵物件逐字不變；新鍵僅在非預設時出現；`colors` 非空才出現 | unit | 同上 | ✅ 擴充 |
| MAP-11 | 全新使用者：僅 `end` 開（無 marker、無底線、無字母條、無 hover） | e2e | `-g "預設只開句尾上色"` | ✅ 擴充 `rhyme-map-ui.spec.mjs:493` |
| MAP-11 | 偏好設定區塊：逐項開關、radio 方向鍵、與「韻腳 ▾」選單雙向同步、`storage` 事件同步、重新整理後保留 | e2e | `-g "偏好設定"` | ❌ Wave 0 |
| MAP-11 | 位置／字級／濃淡／顏色改變→DOM 立即變、輸入框節點／游標／選取／捲動不動、零重畫 | e2e | `-g "顯示方式"` | ❌ Wave 0 |
| MAP-11 | 顏色：`input` 只改變數不存；`change` 存一次；恢復預設兩段式；對比提醒；備份匯出匯入往返含 `colors`；壞色碼被丟棄 | e2e | `-g "韻族顏色"` | ❌ Wave 0 |
| MAP-11 | 對比：淡／標準 ≥ 4.5（淺／深、含 Phase 10 極端）；濃的數字等於 UI-SPEC §2.2；marker 文字 5.62／5.32；全部色碼 `^#[0-9a-f]{6}$` | unit | `tests/rhyme-core.spec.mjs` | ✅ 擴充 `:225-252` |
| MAP-11 | 備份／匯入：壞 `lh:map`（junk、`[1,2]`、字串布林）安全退回；`__proto__` 在 `colors` 無影響 | e2e | 擴充 `rhyme-map-ui.spec.mjs:662` | ✅ 擴充 |
| 橫切 | 預覽與真實鏡像逐行 token 字串、class、`data-f` 相同 | e2e | `-g "預覽"` | ❌ Wave 0 |
| 橫切 | 觸控目標 ≥ 44（分析、更多設定…、新開關、radio、色格、恢復預設、summary、關閉句構）三種裝置 | e2e | 沿用 `auditTouchTargets` | ❌ Wave 0 |
| 橫切 | 靜態掃描：新程式無 `innerHTML`／`outerHTML`／`insertAdjacentHTML`、catch 必有 `lhWarn`、新 CSS 無 `@keyframes`／`transition`／色碼、`style.setProperty` 只收驗證過的 hex | scan | `tests/scan.spec.mjs`／`style.spec.mjs`（自動涵蓋新檔） | ✅ 自動 |
| 橫切 | `?v=` 一致（0.96.15）、`JS_ORDER` 含 `line-core` | unit | `tests/split-tags.spec.mjs` | ✅ 需改 |
| 橫切 | 效能：150 行、全部 token 開、4× CPU 節流連續打字無 > 50ms 長任務；200 行 `lhLineRows` < 20ms | perf | `LH_PERF=1 … rhyme-map-perf.spec.mjs` | ✅ 擴充 |
| 橫切 | 輸出：TXT／Markdown／PDF／列印不含 marker 標記 | e2e | 擴充 `songs-export.spec.mjs` 或新斷言 | ✅ 擴充 |

### Sampling Rate
- **Per task commit:** `npx playwright test tests/line-core.spec.mjs tests/rhyme-core.spec.mjs tests/split-tags.spec.mjs`（純函式＋標籤，數秒）
- **Per wave merge:** `npx playwright test tests/rhyme-map-ui.spec.mjs tests/line-analysis-ui.spec.mjs tests/rhyme-audit.spec.mjs tests/rhyme-journey.spec.mjs`
- **Phase gate:** `npm test` 全綠＋`LH_PERF=1` 效能測試＋`-darwin` 截圖更新後 `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/line-core.spec.mjs` — MAP-09 純函式（含 fuzz 加總恆等式、mini 詞表固定範例）
- [ ] `tests/line-analysis-ui.spec.mjs` — MAP-09／10／11 e2e（換行不變、marker、面板、hover、偏好設定、顏色、預覽）
- [ ] `tests/node-core.mjs`：`CORE` 加 `'js/sections-core.js'`（放在 `state.js` 之後）與 `'js/line-core.js'`（放在 `rhyme-core.js` 之後）[CORE 現況：`['js/phonetic-tables.js', 'js/dict.js', 'js/search.js', 'js/state.js', 'js/polyphonic.js', 'js/rhyme-core.js', 'js/wordlist.js', 'js/candidates.js']`，`tests/node-core.mjs:7`]
- [ ] `tests/split-tags.spec.mjs`：`JS_ORDER` 在 `'rhyme-core'` 後加 `'line-core'`（現況見該檔 8-11 行），並把註解的 28 個 js 數字同步
- [ ] **改寫會被 Phase 11 推翻的 Phase 10 斷言：** `rhyme-map-ui.spec.mjs:896-934`（`abc`、21 字）；審計 `:1003-1049`（方向鍵循環按鈕數）、`:1103-1135`、`:1136-1152`、`:1154-1192`、`:1193-1330` 讀音系列（按鈕順序／數量）
- [ ] 審計 `lh:map` 字串相等斷言（Pitfall 4）：在最小序列化下應全數維持原狀，Wave 0 先跑一次確認
- [ ] 安裝新框架：不需要

## Security Domain

> `security_enforcement` 預設啟用（`.planning/config.json`：`security_enforcement: true`, `security_asvs_level: 1`）。

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | —（純前端，無多使用者資源） |
| V5 Input Validation | **yes** | `lhRhymeNormalizeSettings`（固定鍵、列舉查表、`^#[0-9a-f]{6}$`）；所有使用者歌詞進 DOM 一律 `textContent` |
| V6 Cryptography | no | — |
| V12 Files / V13 API（備份檔匯入） | yes | `_lhSettingFrom` 已有長度上限（`LH_IMPORT_CAPS.setting = 1000000`）與形狀檢查；`lh:map` 分支改用正規化＋序列化 |

### Known Threat Patterns for 純前端 vanilla JS

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| 歌詞或段落名稱經 innerHTML 注入（面板、marker、預覽） | Tampering／Elevation | 只用 `createElement`＋`textContent`；靜態掃描涵蓋新檔；測試用 `<img src=x onerror=alert(1)>你` 這一行 |
| 被篡改的備份／localStorage 讓 CSS 變數接到任意字串 | Tampering | `colors` 只收 16 把固定鍵＋`^#[0-9a-f]{6}$`；`pos`／`size`／`depth` 只收列舉並經查表轉成 class／數字；`style.setProperty` 只在驗證後呼叫 |
| 原型污染（`__proto__`／`constructor` 當 `colors` 的鍵） | Tampering | 固定鍵迭代＋`hasOwnProperty.call`；輸出為新物件；`lhLineRefIndex` 用 `Map` |
| 巨大 `colors` 物件或超長字串 | DoS | 固定 16 鍵 O(16)；匯入字串長度上限已存在 |
| `storage` 事件被別的分頁灌入壞值 | Tampering | 讀入一律經 normalise；壞值逐鍵退回預設 |
| 惡意輸入造成正規表示式災難性回溯 | DoS | `_LH_WC_RE` 為既有、線性；`_LH_TRAIL_WS` 為 `[ \t　]+$` 錨定行尾（行內單次掃描） |

## Sources

### Primary (HIGH confidence)
- 本機實測（Chromium 153.0.8010.12，Playwright 1.63.0）：換行不變掃描（獨立頁面 321 寬 ×12 行型；真實 app 131 寬；15px 古典捲軸 45 寬）、`color-mix` 內 `var()` 百分比、`page.clock` 快轉、前向最長詞切分與效能。腳本：`/private/tmp/claude-502/-Users-Shared-Coding-Projects-Lucky-Hawaii/0e9f2856-552b-4615-b7d0-01fb9aecaa83/scratchpad/{wrap2,real6,real7,seg2,ref,cm,clock}.mjs`
- repo 原始碼（本 session 全部以 Read 開啟）：見下方〈Verified In-Repo Values〉
- `.planning/phases/11-line-analysis-settings/11-CONTEXT.md`、`11-UI-SPEC.md`、`.planning/phases/10-rhyme-map/10-REVIEW.md`／`10-REVIEW-FIX.md`

### Secondary (MEDIUM confidence)
- CSSWG 2019 決議（`pre-wrap` 行尾空白在 soft wrap 前懸掛、在區塊末與強制換行處不懸掛）：https://lists.w3.org/Archives/Public/public-css-archive/2019Feb/0719.html（只佐證規範有討論，**不**佐證絕對定位元素夾在其間的行為）

### Tertiary (LOW confidence)
- WebSearch 對「絕對定位元素靜態位置在 Safari／Firefox 的差異」沒有找到具體資料（搜尋結果只有 CSS2.1 規範與 WPT `absolute-non-replaced-height-008`）→ 相關主張標為 `[ASSUMED]`（A1）

### Verified In-Repo Values（逐字引用；`[VERIFIED: 路徑:行]`）

- 預設開關 `[VERIFIED: js/rhyme-core.js:12]`：`const LH_RHYME_DEFAULTS = Object.freeze({ end: true, letters: false, inner: false, strict: false, skipParticles: true });`
- 混色比例 `[VERIFIED: js/rhyme-core.js:33-34]`：`const LH_RHYME_MIX = Object.freeze({ end: 34, orphan: 17, inner: 30 });` ／ `const LH_RHYME_NONE = 16;`
- 色票 `[VERIFIED: js/rhyme-core.js:26-31]`：light 第 0 色 `'#d9534f'`…第 16 色 `'#8a8f98'`；dark 第 0 色 `'#c9524e'`…第 16 色 `'#7a808a'`（17 色，0–15 為家族、16 為空韻灰）
- 漢字判斷 `[VERIFIED: js/rhyme-core.js:38]`：`const _LH_RHYME_HAN_RE = /^\p{Script=Han}$/u;`
- 字數規則 `[VERIFIED: js/sections-core.js:94-101]`：`const _LH_CJK = String.raw\`[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Bopomofo}]\`;` ／ `const _LH_WC_RE = new RegExp(\`${_LH_CJK}|(?:(?!${_LH_CJK})[\\p{L}\\p{N}])+(?:['’](?:(?!${_LH_CJK})[\\p{L}\\p{N}])+)*\`, 'gu');` ／ `function lhCountWords(text) {`
- 名稱編號 `[VERIFIED: js/sections-core.js:66]`：`function lhSecNames(sections) {`；型別清單 `[VERIFIED: js/sections-core.js:7]`：`const LH_SEC_TYPES = ['intro', 'verse', 'prechorus', 'chorus', 'inter', 'bridge', 'outro', 'custom'];`
- 詞表變數 `[VERIFIED: js/state.js:23]`：`let wordPhoneticMap = new Map();`；換包重設 `[VERIFIED: js/wordlist.js:311]`：`wordPhoneticMap = new Map();`；載入成功通知 `[VERIFIED: js/wordlist.js:292]`：`if (out !== null && typeof lhMapOnLexiconChange === 'function') lhMapOnLexiconChange();`
- 排程常數 `[VERIFIED: js/rhyme-map.js:7-10]`：`const LH_MAP_DEBOUNCE = 200;` ／ `const LH_MAP_MAXWAIT = 1000;` ／ `const LH_MAP_MAX_LINES = 5000;` ／ `const LH_MAP_HEX = /^#[0-9a-f]{6}$/;`
- 快取簽章 `[VERIFIED: js/rhyme-map.js:57]`：`const sig = [_lhMapSet.end, _lhMapSet.letters, _lhMapSet.inner, _lhMapSet.strict, _lhMapSet.skipParticles].map(Number).join('') + '|' + _lhMapEpoch + '|' + _lhMapReadVer;`
- 鏡像層捲軸補償 `[VERIFIED: js/rhyme-map.js:41]`：`mirror.style.paddingRight = ((parseFloat(cs.paddingRight) || 0) + Math.max(0, bar)) + 'px';`
- 只畫列的捷徑 `[VERIFIED: js/rhyme-map.js:73]`：`const paintRows = _lhMapSet.end || _lhMapSet.inner;   // 只開結構字母：鏡像層不必逐行排版`
- 寫設定 `[VERIFIED: js/rhyme-map.js:366-372]`：`function lhMapSetSetting(key, value) {` ／ `if (!Object.prototype.hasOwnProperty.call(LH_RHYME_DEFAULTS, key) || typeof value !== 'boolean') return;` ／ `lhSet('lh:map', JSON.stringify(_lhMapSet));`
- 浮動列門檻 `[VERIFIED: js/rhyme-map.js:618]`：`const LH_MAP_SEL_MAX = 20;`；隱藏條件 `[VERIFIED: js/rhyme-map.js:743-745]`：`if (chars.length > LH_MAP_SEL_MAX) return lhMapHideBar();` ／ `if (!han.length) return lhMapHideBar();`
- 全部關浮層 `[VERIFIED: js/rhyme-map.js:420-424]`：`function lhMapCloseAll() {` ／ `lhMapCloseMenu(false);` ／ `lhMapHideBar();` ／ `lhMapCloseStats(false);`
- 備份匯入分支 `[VERIFIED: js/safety.js:553-556]`：`if (key === 'lh:map') {` ／ `try { return JSON.stringify(lhRhymeNormalizeSettings(JSON.parse(v))); }`；登記 `[VERIFIED: js/safety.js:31]`：`{ key: 'lh:map', group: 'setting' }`；長度上限 `[VERIFIED: js/safety.js:512]`：`setting: 1000000`
- 偏好設定開關 `[VERIFIED: js/search-ui.js:40-45]`：`function toggleSettings() {` ／ `overlay.classList.toggle('show');`；關閉 `[VERIFIED: js/search-ui.js:99-104]`：`function closeSettingsOverlay(event) {` ／ 只有 `event.target === event.currentTarget` 才移除 `show`（**無 Esc 處理**；`grep -n "Escape" js/*.js` 沒有任何針對 `#settingsOverlay` 的處理；`js/panels.js:116` 只是在有 `.settings-overlay.show` 時讓出 Esc）
- overlay CSS `[VERIFIED: css/base.css:541-575]`：`.settings-overlay { … z-index: 999; … }`；`.settings-dropdown { … padding: 1.5rem 1.75rem; … width: min(22rem, 92vw); max-height: calc(var(--app-h) - 2rem); overflow-y: auto; … }`
- `<details>` 寫法 `[VERIFIED: index.html:198]`：`<details class="settings-backups" id="autoBackupSection"><summary onclick="renderAutoBackups()">自動備份</summary>…`；`.settings-backups` `[VERIFIED: css/panels.css:1020-1022]`
- `?v=` `[VERIFIED: index.html:17-24, 447-457]`：`<link rel="stylesheet" href="css/base.css?v=0.96.14">` 等；除 `index.html` 外 repo 內無其他 `0.96.14`
- 色塊 CSS `[VERIFIED: css/panels.css:1634-1640, 379]`：`background: color-mix(in srgb, var(--rm-c) 34%, var(--card-bg));` ／ `.rm-hl.rm-solo { background: color-mix(in srgb, var(--rm-c) 17%, var(--card-bg)); }` ／ `.rm-sw { background: color-mix(in srgb, var(--rm-c) 34%, var(--card-bg)); }`
- 版面 `[VERIFIED: css/panels.css:1489,1598-1629]`：`.section-body { flex: 1; min-height: 0; position: relative; }`；`.section-textarea, .rhyme-mirror { width: 100%; padding: 0.625rem 0.75rem; … line-height: 1.7; }`；觸控字級 `[VERIFIED: css/responsive.css:737-741]`：`font-size: max(16px, 1rem);`
- 測試基礎 `[VERIFIED: tests/node-core.mjs:7]`：`export const CORE = ['js/phonetic-tables.js', …]`；`[VERIFIED: tests/split-tags.spec.mjs:8-11]`：`const JS_ORDER = [ 'phonetic-tables', 'dict', 'search', 'state', 'sections-core', 'songs', 'undo', 'polyphonic', 'rhyme-core', 'cards', 'lyrics', 'sections', 'song-io', 'wordlist', 'panels', 'rhyme-display', 'ai-client', 'candidates', 'ai-generate', 'ui-common', 'results', 'search-ui', 'theme', 'init', 'report', 'ai-word-events', 'word-drag', 'rhyme-map' ]`
- Phase 10 字串斷言 `[VERIFIED: tests/rhyme-map-ui.spec.mjs:630]`：`const MAP_DEFAULT = '{"end":true,"letters":false,"inner":false,"strict":false,"skipParticles":true}';`；`[VERIFIED: tests/rhyme-audit.spec.mjs:22-23]`：`const MAP_ALL = JSON.stringify({ end: true, letters: true, inner: true, strict: false, skipParticles: true });`
- 對比公式 `[VERIFIED: tests/rhyme-core.spec.mjs:217-224]`：`mixHex`、`lumOf`、`contrastOf`（sRGB 逐頻道四捨五入混色＋WCAG 相對亮度）
- UI-SPEC §2.2 數字重算 `[VERIFIED: 實跑 contrast.mjs，用上述色票與 #2d3748/#f7fafc、#d2c8b7/#2d3748]`：淡 26% 淺 7.91／深 5.08；標準 34% 淺 6.97／深 4.52；濃 40% 淺 6.32／深 4.14（深色有 5 個色 < 4.5）；marker 文字 `#5a6577` 在 `#f7fafc` 5.62、`#a0aec0` 在 `#2d3748` 5.32 ——全部與 UI-SPEC 一致

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 無新依賴，沿用既有 Playwright／node:vm。
- Architecture: HIGH（Chromium）——marker／gutter／變數技術以真實 app DOM 實測；MEDIUM（跨引擎）——WebKit／Gecko 未測。
- Pitfalls: HIGH——Pitfall 1 為實測重現，Pitfall 4／6 為讀既有測試所得，Pitfall 5 由程式碼（`lhMapSchedule` 只排單段）推得。
- 斷句規則品質: MEDIUM——規則可預測且加總恆等已驗證；語感好壞要靠 Andy 的 Human check（已列已知誤切）。

**Research date:** 2026-10-28
**Valid until:** 2026-11-27（專案內部程式碼穩定；Playwright／Chromium 版本若升級需重跑換行不變掃描）
