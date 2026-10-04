# Requirements: 好韻器 Lucky Hawaii

**Defined:** 2026-10-03
**Core Value:** 輸入一個字或音，就能快速拿到「符合台灣日常語感、真的能寫進歌詞」的押韻字詞——查得到、查得快、查得準。

## v1 Requirements

### Foundation（安全網與基礎建設）

- [x] **FND-01**: 重構前有自動化回歸測試：核心查韻／篩選函式的 golden test（固定輸入 → 固定結果），以及能點過所有 inline 按鈕的冒煙測試
- [x] **FND-02**: 所有靜默吞錯（空 `catch`）改為可見的錯誤提示或記錄
- [x] **FND-03**: 盤點所有 localStorage / IndexedDB 鍵值，任何資料格式變更前先自動備份，遷移可重複執行且不丟失使用者歌詞、覆寫、設定
- [x] **FND-04**: `index.html` 拆分為多個 JS / CSS 檔，GitHub Pages 直接部署無需建置；拆分與修 bug 不混在同一個 commit
- [x] **FND-05**: Cloudflare Worker 改用 `wrangler` 指令部署（設定檔納入版控、secrets 不入庫），取代手動貼後台

### AI（AI 建議）

- [x] **AI-01**: 移除已下架模型（GitHub Models / `gpt-4.1`、已停用的 Groq 模型），舊使用者 localStorage 裡失效的 `selectedModel` 自動遷移到可用模型
- [x] **AI-02**: 模型 fallback 鏈移到 Worker 端並真正生效：每次嘗試有逾時、429/5xx 才重試、失效模型自動跳過；全部失敗時使用者看到明確原因
- [x] **AI-03**: 候選詞數量 ≥ 目標數時，結果一定填滿目標數量（AI 只負責排序挑選，數量由程式保證），不得觸發造詞
- [x] **AI-04**: 候選詞不足時才造詞，且只造一輪；每個造出的詞必須通過原有韻腳判定邏輯（以該詞自身讀音判定），不合格的丟棄
- [x] **AI-05**: Worker 每日自動健康檢查各模型，並自動更新模型清單，只保留近半年內發布、仍可用的模型
- [ ] **AI-06**: 候選詞卡可「拖曳」到歌詞編輯器指定位置插入（只支援拖曳，不支援點擊插入；行動端以長按啟動拖曳）
- [x] **AI-07**: Worker 防濫用：只接受白名單模型、限制請求內容大小與輸出 token 上限

### Performance & Stability（效能與穩定）

- [ ] **PERF-01**: 修正 UI 縮放 bug：預設 100% 正確、使用者放大時靠近邊框的內容不被吃掉（以根字級縮放取代 CSS `zoom`）
- [ ] **PERF-02**: 首次搜尋與大量字卡不卡頓：結果分批渲染，手機上首次搜尋不凍結畫面
- [x] **PERF-03**: 詞庫快取版本正確更新，不會新舊 chunk 混用；詞庫載入與 AI 建議之間無競態
- [x] **PERF-04**: 存檔失敗（容量爆滿、IndexedDB 失敗）時使用者看到提示

### Lexicon（詞庫）

- [ ] **LEX-01**: 蒐集多個以台灣為主的詞庫來源（輸入法詞庫如小麥注音／新酷音、教育部辭典等），授權相容公開網站，並附 NOTICE 標示來源
- [ ] **LEX-07**: 所有詞庫來源轉換成同一個統一格式，各自成為獨立詞庫包；網站上可切換使用哪個詞庫包，方便 Andy 多輪實測比較
- [ ] **LEX-08**: 實測選定最順手的組合後，再合併成一個「好韻器官方維護詞庫」，作為預設詞庫（合併規則依實測結果決定）
- [ ] **LEX-02**: 移除含簡體字／罕用字的詞條，以及僅見於中國用語、台灣不使用的詞
- [ ] **LEX-03**: 篩選標準為「可理解性」：保留日常、口語、閱讀、文學、小說用得到的詞，大學以下教育範圍內的文言詞，以及常見專有名詞（例：三酸甘油酯）；刪除理解上已有困難的詞與極冷僻小眾專業學術名詞（例：聚乙烯醇縮丁醛、分散式雜湊表）。不以「歌詞風」等主觀標準篩選。此標準同樣適用於未來 2 字詞的擴充與篩選
- [ ] **LEX-04**: 清洗流程全自動、不需人工逐條審核：規則先分出保留／刪除／灰色地帶，「只有單一來源」降級為灰色而非直接刪除；灰色地帶以免費 AI 依 LEX-03 標準批次判斷，總 token 控制在免費額度內
- [ ] **LEX-05**: 每個被刪除的詞記錄刪除原因，產出可抽查的報告（原因統計＋樣本），並可透過回報機制把誤刪的詞救回
- [ ] **LEX-06**: 新詞庫以新版本發布，舊快取自動失效，使用者無需手動清除

### UI / UX & Devices（介面與多裝置）

- [ ] **UI-01**: 電腦、平板、手機三種版面都可完整使用（查韻、寫詞、AI 建議）
- [ ] **UI-02**: 整體視覺一致、美觀，保留晝夜模式與客製顏色
- [ ] **UI-03**: 行動端輸入不被虛擬鍵盤遮擋、不觸發自動放大

### Feedback & Admin（回報與後台）

- [ ] **FB-01**: 回報入口更明顯、步驟更少（保留詞卡右鍵回報；長按保留給拖曳）
- [ ] **FB-02**: 後台同一個詞的多筆回報合併顯示，可批次核准／駁回
- [ ] **FB-03**: 後台核准後一鍵套用，修正暫存為 Worker 上的「修正層」，線上使用者即時生效（與回報資料分開存放）
- [ ] **FB-04**: 已套用的修正可一鍵撤回
- [ ] **FB-05**: 腳本可把累積的修正層寫回 `data/`、push 到 GitHub，確認線上部署生效後才清空 Worker 修正層，不會重複套用或遺失修正

### Editor（歌詞編輯器）

- [ ] **EDIT-01**: 歌詞以資料模型為準（不再從畫面讀回），編輯時游標、注音輸入法組字不被打斷
- [ ] **EDIT-02**: 段落模組可縱向拖曳排序、可調整高度，桌機與觸控裝置都可操作；修正現有拖曳 bug
- [ ] **EDIT-03**: Undo / Redo 涵蓋文字編輯與段落操作（新增、刪除、排序、標籤）
- [ ] **EDIT-04**: 多首歌管理：Google Docs 式側邊分頁，可顯示／隱藏，可新增、切換、刪除、重新命名；舊的單首歌詞自動遷移成第一首
- [ ] **EDIT-05**: 段落標籤結構化：預設 Intro / Verse / Pre-Chorus / Chorus / Inter（獨立標籤）/ Bridge / Outro / Custom；同類型依拖曳後順序自動編號，使用羅馬數字（Verse I、Verse II…）
- [ ] **EDIT-06**: 左鍵點段落標籤按鈕在選項間循環切換；右鍵開啟 color picker 變更該段落顏色
- [ ] **EDIT-07**: 段落字數統計
- [ ] **EDIT-08**: 匯出：預設 TXT，另支援 PDF 與 Markdown；可一鍵複製整首
- [ ] **EDIT-09**: JSON 備份與還原（全部歌曲＋設定），可換裝置匯入

### Rhyme Map & Line Analysis（韻腳地圖與句構分析）

- [ ] **MAP-01**: 韻腳判定一律沿用 Andy 現有的核心押韻演算法（含嚴格／寬韻規則），不另寫一套新判定邏輯
- [ ] **MAP-02**: 句尾依韻部自動上色
- [ ] **MAP-03**: 句中多押／內部押韻偵測（預設關閉）
- [ ] **MAP-04**: 段落韻腳統計，並顯示押韻結構字母（AABB / ABAB）
- [ ] **MAP-05**: 點歌詞中的字即可查同韻字／AI 建議
- [ ] **MAP-06**: 嚴格／寬韻規則以 toggle 切換（使用既有規則）
- [ ] **MAP-07**: 可忽略句尾語助詞（啊、呢、喔、了…），可開關
- [ ] **MAP-08**: 破音字可手動指定讀音，沿用既有破音字程式碼
- [ ] **MAP-09**: 逐行句構分析：每行字數、斷句結構（如 3+4、2+2+3）、與對應段落比對（如 Verse I vs Verse II）
- [ ] **MAP-10**: 句構分析觸發方式：設定頁 toggle 常駐顯示，或反白後按「分析」，或反白後 hover 數秒出現（觸控裝置以按鈕替代 hover）
- [ ] **MAP-11**: 設定頁：使用者可逐項開關韻腳地圖與句構分析功能，並調整顯示方式（標記位置、標記文字大小、顏色）；預設只開句尾上色，避免眼花撩亂
- [ ] **MAP-12**: 分析不在注音組字過程中執行，長篇歌詞不卡頓

## v2 Requirements

### Lexicon

- **LEX-V2-01**: 詞句挖掘：從台灣語料或免費 AI 生成日常三字以上詞組並自動驗證，補足開源詞庫缺少的日常搭配詞
- **LEX-V2-02**: 依 LEX-03 標準擴充／篩選 2 字詞

### Editor

- **EDIT-V2-01**: 刪除段落／歌曲時跳出「復原」提示
- **EDIT-V2-02**: 段落自由二維擺放（桌機並排、任意位置縮放）

### Feedback

- **FB-V2-01**: 後台安全性強化（管理金鑰不放網址、防止回報內容注入後台）

## Out of Scope

| Feature | Reason |
|---------|--------|
| 自架後端伺服器 | 維持純前端 GitHub Pages ＋ Cloudflare Worker |
| 付費 AI／主機 | 個人專案，維持免費額度 |
| 人工逐條審核詞庫 | 10 萬條不切實際，改用自動清洗＋回報修正 |
| 另寫新的押韻判定邏輯 | 必須沿用 Andy 既有核心演算法 |
| 點擊插入詞卡 | 只用拖曳插入，避免誤觸 |
| 長按回報 | 長按保留給拖曳；回報沿用右鍵 |
| 歌詞評分、整首 AI 代寫、自動改寫使用者歌詞 | 工具定位是輔助，不取代創作 |
| 帳號、雲端同步、社群、多人協作 | 單人本機創作工具 |
| 預設開啟所有標記 | 避免眼花撩亂，由設定頁自選 |
| v1.0 正式發布 | 本輪「先穩定再說」 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FND-01 | Phase 1 | Complete |
| FND-02 | Phase 1 | Complete |
| FND-03 | Phase 1 | Complete |
| FND-04 | Phase 3 | Complete |
| FND-05 | Phase 2 | Complete |
| AI-01 | Phase 2 | Complete |
| AI-02 | Phase 2 | Complete |
| AI-03 | Phase 4 | Complete |
| AI-04 | Phase 4 | Complete |
| AI-05 | Phase 2 | Complete |
| AI-06 | Phase 9 | Pending |
| AI-07 | Phase 2 | Complete |
| PERF-01 | Phase 5 | Pending |
| PERF-02 | Phase 5 | Pending |
| PERF-03 | Phase 4 | Complete |
| PERF-04 | Phase 1 | Complete |
| LEX-01 | Phase 6 | Pending |
| LEX-07 | Phase 6 | Pending |
| LEX-08 | Phase 12 | Pending |
| LEX-02 | Phase 6 | Pending |
| LEX-03 | Phase 6 | Pending |
| LEX-04 | Phase 6 | Pending |
| LEX-05 | Phase 6 | Pending |
| LEX-06 | Phase 6 | Pending |
| UI-01 | Phase 5 | Pending |
| UI-02 | Phase 5 | Pending |
| UI-03 | Phase 5 | Pending |
| FB-01 | Phase 7 | Pending |
| FB-02 | Phase 7 | Pending |
| FB-03 | Phase 7 | Pending |
| FB-04 | Phase 7 | Pending |
| FB-05 | Phase 7 | Pending |
| EDIT-01 | Phase 8 | Pending |
| EDIT-02 | Phase 9 | Pending |
| EDIT-03 | Phase 9 | Pending |
| EDIT-04 | Phase 8 | Pending |
| EDIT-05 | Phase 9 | Pending |
| EDIT-06 | Phase 9 | Pending |
| EDIT-07 | Phase 9 | Pending |
| EDIT-08 | Phase 8 | Pending |
| EDIT-09 | Phase 8 | Pending |
| MAP-01 | Phase 10 | Pending |
| MAP-02 | Phase 10 | Pending |
| MAP-03 | Phase 10 | Pending |
| MAP-04 | Phase 10 | Pending |
| MAP-05 | Phase 10 | Pending |
| MAP-06 | Phase 10 | Pending |
| MAP-07 | Phase 10 | Pending |
| MAP-08 | Phase 10 | Pending |
| MAP-09 | Phase 11 | Pending |
| MAP-10 | Phase 11 | Pending |
| MAP-11 | Phase 11 | Pending |
| MAP-12 | Phase 10 | Pending |

**Coverage:**
- v1 requirements: 53 total
- Mapped to phases: 53
- Unmapped: 0 ✓

---
*Requirements defined: 2026-10-03*
*Last updated: 2026-10-03 after roadmap creation (traceability filled)*
