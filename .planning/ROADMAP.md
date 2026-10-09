# Roadmap: 好韻器 Lucky Hawaii

## Overview

本輪「先穩定再說」：先替現有 v0.96 建立安全網（回歸測試、錯誤看得見、資料備份），立刻搶修即將因模型下架而失效的 AI 服務，再把 28 萬字元的單一 `index.html` 拆檔。之後修正 AI 挑詞／造詞邏輯與多裝置版面，接著用全自動流程產出可切換比較的台灣詞庫包，並讓回報能一鍵修正上線。最後把歌詞編輯器升級為資料模型驅動（多首歌、段落模組、Undo/Redo），在其上疊加韻腳地圖與句構分析；Andy 實測詞庫包後，再合併成官方詞庫收尾。

每個 phase 的成功條件盡量標成可由 Claude 自動驗證（〔自動〕＝Node 測試或 headless 瀏覽器腳本），真正需要 Andy 親眼或實機確認的列在 **Human check**。

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Safety Net 安全網** - 回歸測試、錯誤可見、儲存資料盤點與自動備份 (completed 2026-10-03)
- [ ] **Phase 2: AI Service Hotfix AI 服務不斷線** - 移除下架模型、fallback 移到 Worker、wrangler 部署、每日健康檢查、防濫用
- [x] **Phase 3: Split index.html 拆檔** - 單檔拆成多個 JS／CSS，行為不變、免建置部署 (completed 2026-10-04)
- [ ] **Phase 4: AI Fill & Validate AI 挑詞填滿與造詞驗證** - 候選夠就填滿、造詞只一輪且必須押韻、消除詞庫載入競態
- [ ] **Phase 5: Multi-Device Layout 多裝置版面與流暢度** - 縮放修正、分批渲染、手機／平板／桌機完整可用
- [ ] **Phase 6: Lexicon Packs 台灣詞庫包** - 多來源自動清洗成統一格式詞庫包，網站上可切換比較
- [ ] **Phase 7: Feedback & Correction Layer 回報與修正層** - 回報更簡單、後台批次審核、一鍵套用／撤回、腳本寫回 data
- [ ] **Phase 8: Songs & Editor Model 歌曲管理與資料模型** - 資料模型驅動編輯器、多首歌側邊分頁、匯出與備份
- [ ] **Phase 9: Section Modules 段落模組** - 段落拖曳排序與調高、結構化標籤、Undo/Redo、字數、AI 詞卡拖曳插入
- [ ] **Phase 10: Rhyme Map 韻腳地圖** - 句尾依韻部上色、韻式統計、內部押韻、點字查韻
- [ ] **Phase 11: Line Analysis & Settings 句構分析與設定頁** - 逐行字數與斷句、段落比對、標記顯示設定
- [ ] **Phase 12: Official Lexicon 官方詞庫** - 依 Andy 實測結果合併成官方詞庫並設為預設

## Phase Details

### Phase 1: Safety Net 安全網

**Goal**: 在動任何大手術之前，查韻結果有自動測試守著、所有錯誤看得見、使用者資料改格式前一定先備份——之後每一步改動都能立刻知道有沒有弄壞東西。
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: FND-01, FND-02, FND-03, PERF-04
**Success Criteria** (what must be TRUE):
  1. 一個指令就能跑完回歸測試：固定一組注音／拼音／漢字輸入與三種篩選模式，查韻結果與目前 v0.96 完全一致〔自動：golden test〕
  2. 冒煙測試在 headless 瀏覽器裡把頁面上每個 inline 按鈕都點過一次，沒有任何 JS 錯誤〔自動〕
  3. 程式裡不再有吞錯的空 `catch`；刻意製造錯誤時，使用者看得到提示或至少留下記錄〔自動：程式碼掃描＋測試〕
  4. localStorage 容量爆滿或 IndexedDB 寫入失敗時，使用者看到「存檔失敗」提示，不再默默沒存〔自動：模擬配額錯誤〕
  5. 所有既有儲存鍵值都有清單；格式變更前自動備份，遷移重跑多次結果相同，用舊版資料快照測試時歌詞、覆寫、設定一個都不少〔自動〕

**Human check**: 無（全部可自動驗證）
**Plans**: 6/6 plans complete

Plans:
**Wave 1**
- [x] 01-01-PLAN.md — Tracer：Playwright 工具（供應鏈閘門）、本機 server、就緒訊號、golden 41 案例 × 3 模式基準（單獨 commit）

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 01-02-PLAN.md — 冒煙測試：每個 inline handler 乾淨環境各點一次、覆蓋率閘門、負控制、匯入情境

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 01-03-PLAN.md — 儲存安全層 js/safety.js、存檔失敗橫幅、localStorage 全面改走 lh*（純改名 commit）、鍵值清單掃描、損毀 JSON 不再掛掉

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 01-04-PLAN.md — 吞錯 catch 掃描規則＋13 處修正（只加記錄）、回報失敗提示、錯誤可見性測試

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 01-05-PLAN.md — IndexedDB v2 共用開啟、詞庫快取失敗提示、基準備份（只含清單鍵、保留 3 份）、備份失敗橫幅與 localStorage 備援

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 01-06-PLAN.md — 遷移機制（先備份、依序、失敗自動還原）、還原驗證、舊版快照完整還原、Phase gate

### Phase 2: AI Service Hotfix AI 服務不斷線

**Goal**: 搶在 Gemini 2.5 下架（據報 2026-10-16）之前，讓 AI 建議不再因模型下架或額度用完而默默失敗：由 Worker 負責模型 fallback、每日自我健康檢查、擋濫用，並改用 wrangler 指令部署。
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: FND-05, AI-01, AI-02, AI-05, AI-07
**Success Criteria** (what must be TRUE):
  1. 舊使用者 localStorage 裡殘留 `gpt-4.1` 等已下架模型時，打開網站會自動換成可用模型，按 AI 建議拿得到結果〔自動〕
  2. 主模型逾時或回 429／5xx 時，Worker 自動換下一個模型、失效模型自動跳過；全部失敗時使用者看到白話的失敗原因，而不是空白或轉圈不停〔自動：mock 各家 API 測 Worker 邏輯〕
  3. Worker 用 `wrangler deploy` 一行指令部署：設定檔在 git 裡、API key 不在 git 裡，部署後既有回報 KV 資料與綁定完好〔自動：本機 `wrangler dev`；正式部署見 Human check〕
  4. Worker 每日排程檢查各模型，失效或發布超過約半年的模型自動從清單移除，網站上的模型選單跟著更新〔自動：本機觸發排程測試〕
  5. 送非白名單模型或超大請求給 Worker 會被拒絕，輸出 token 有上限〔自動：腳本打 API 測試〕

**Human check**: 首次 `wrangler login`（瀏覽器授權）；正式 Worker 部署後，線上實際按一次 AI 建議確認可用
**Plans**: 6/6 plans executed

Plans:
**Wave 1**
- [x] 02-01-PLAN.md — Tracer：舊設定使用者按 AI 建議 → /ai → Worker → Gemini → 出詞；模型選單改由 /models 產生（保留有效手動選擇、開站不寫入）

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 02-02-PLAN.md — wrangler 4.147.0（自動供應鏈閘門）、worker/wrangler.toml、部署前 KV id 檢查、金鑰不入 git、回報／後台路徑原封搬移

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 02-03-PLAN.md — Worker 換手鏈（逾時、429、失效跳過、全部失敗白話回報）、舊版根路徑相容、網頁顯示白話失敗原因

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 02-04-PLAN.md — 防濫用：白名單、64 KB／24,000 字／8 則上限、輸出 token 上限、來源檢查、每 IP 限流、不洩漏

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 02-05-PLAN.md — 每日健康檢查與淘汰規則（至少兩個、絕不清空）、模型清單與換手鏈跟著走、後台查看／立即重跑

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 02-06-PLAN.md — wrangler dev 整體冒煙（含排程）、worker/DEPLOY.md 上線清單、Phase gate

### Phase 3: Split index.html 拆檔

**Goal**: 把單一 `index.html` 拆成多個 JS／CSS 檔，使用者感受不到任何差異，但之後修 bug、加功能、寫測試都更安全；GitHub Pages 仍直接部署、無需建置。
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: FND-04
**Success Criteria** (what must be TRUE):
  1. `index.html` 只剩頁面骨架，樣式與程式分在多個檔案；用本機 http server 或 GitHub Pages 打開即可使用，不需任何建置步驟〔自動〕
  2. Phase 1 的 golden 測試與冒煙測試在拆分後全部通過，查韻結果與每個按鈕的行為都和拆分前一致〔自動〕
  3. 核心查韻／篩選邏輯可以直接在 Node 裡載入測試，不必開瀏覽器〔自動〕
  4. 舊使用者存的歌詞、覆寫、設定在拆分後版本仍完整讀得到；「搬移程式碼」與「修 bug」在 git 裡是分開的 commit〔自動〕

**Human check**: 無（全部可自動驗證）
**Plans**: 5/5 plans complete

Plans:
**Wave 1**
- [x] 03-01-PLAN.md — Tracer：逐字比對工具 verify-split → 第一塊 js/phonetic-tables.js 以 ?v=0.96.4 classic script 載入 → 同檔在 Node 載入；標籤一致性測試

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 03-02-PLAN.md — 樣式逐字搬到 css/base、panels、responsive；@import 第一、在 head、無相對路徑守門測試

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 03-03-PLAN.md — 搬出 dict、search、state、polyphonic；Node 直接測查韻＋與瀏覽器逐字比對

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 03-04-PLAN.md — 搬出 cards、lyrics、wordlist、panels，再搬 rhyme-display、ai-client、candidates；Node 直接測詞庫篩選

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 03-05-PLAN.md — 搬出最後八塊（init 維持原位）、index.html 只剩骨架；完成狀態測試、只搬移 commit 稽核、Phase gate

### Phase 4: AI Fill & Validate AI 挑詞填滿與造詞驗證

**Goal**: 按下 AI 建議，拿到的數量一定夠、造出的詞一定押韻：候選夠就由程式保證填滿，不夠才造詞且只造一輪，並消除詞庫載入與 AI 之間的競態。
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: AI-03, AI-04, PERF-03
**Success Criteria** (what must be TRUE):
  1. 候選詞數量 ≥ 目標數時，結果一定剛好填滿目標數量、完全不觸發造詞；即使 AI 只回很少，程式也會補滿〔自動：Node 測試〕
  2. 候選詞不足時只造一輪；每個造出的詞都以自身讀音通過原有韻腳判定，不押韻的被丟掉、不會出現在結果裡〔自動：Node 測試〕
  3. 詞庫還沒載完就按 AI 建議，系統會等詞庫備妥再挑詞，不會因為候選暫時太少而誤觸造詞〔自動：headless 瀏覽器模擬慢速載入〕
  4. 詞庫版本號更新後重新整理，自動抓新 chunk，不會新舊 chunk 混用〔自動〕

**Human check**: Andy 用幾個實際韻腳試 AI 建議，確認數量與押韻品質符合手感
**Plans**: 5/5 plans executed

Plans:
**Wave 1**
- [x] 04-01-PLAN.md — Tracer：退役 verify-split（第一個 commit）→ AI_TARGET、fillToTarget，候選 ≥ 24 一定剛好 24 張；AI 失敗仍填滿並附原因；共用版本 0.96.5

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 04-02-PLAN.md — validateWordRhyme 修正（獨立 fix commit，與候選篩選同一套規則）＋真詞庫鏡射性質測試

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 04-03-PLAN.md — 造詞只問一次、每個詞驗過字典與韻腳才顯示並標 AI；造詞提示與判定一致

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 04-04-PLAN.md — 單一流程（夠就挑、不夠才造一次）、送 AI 候選上限 1000、按鈕一定解鎖；移除補一輪旗標

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 04-05-PLAN.md — 詞庫未就緒時 AI 等詞庫、整套原子換版（?v=、單一交易、缺段不用、非 200 留記錄）、Phase gate

### Phase 5: Multi-Device Layout 多裝置版面與流暢度

**Goal**: 電腦、平板、手機都能完整查韻、寫詞、用 AI 建議；縮放正確不吃邊、大量字卡不卡頓、手機輸入不被鍵盤擋。
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: PERF-01, PERF-02, UI-01, UI-02, UI-03
**Success Criteria** (what must be TRUE):
  1. 預設 100% 畫面沒有偏移；把介面放大到最大時，靠近邊框的內容仍完整可見、不被裁掉〔自動：多個縮放值下檢查元素是否超出視窗＋截圖〕
  2. 首次搜尋與大量字卡分批出現，模擬手機 CPU 降速時畫面不凍結〔自動：量測長任務〕
  3. 在手機、平板、桌機三種尺寸下，查韻、寫詞、AI 建議都能完整操作，沒有被遮住或點不到的按鈕〔自動：三種 viewport 腳本跑完整流程〕
  4. 手機上點輸入框不會觸發自動放大，虛擬鍵盤彈出時正在輸入的位置不被擋住〔自動：檢查字級與 viewport 設定；實機見 Human check〕
  5. 晝夜模式與客製顏色在新版面下都正常，整體視覺一致〔自動：截圖比對〕

**Human check**: iPhone／Android 實機的鍵盤遮擋與縮放手感；整體美觀判斷
**Plans**: 11/11 plans executed
**UI hint**: yes

Plans:
**Wave 1**
- [x] 05-01-PLAN.md — Tracer：改版前拍照存證（15 張截圖＋計算樣式）→ ➕／➖ 改走根字級 --ui-scale、存 lh:uiScale；移除所有 zoom

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 05-02-PLAN.md — Pass A：尺寸 px 全面換 rem（100% 逐像素一致）＋ px 守門測試

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 05-03-PLAN.md — 頁面骨架（dvh、安全區、分頁列預留、橫拿手機）＋頂部工具列一鍵回 100%；50–150% 不吃邊

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 05-04-PLAN.md — 存檔失敗橫幅改排在主畫面最上方；偏好設定每種裝置都完整、對話框矮螢幕可捲

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 05-05-PLAN.md — 桌機側邊面板推開主畫面；斷點改即時（轉向不必重整）、觸控不自動聚焦

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 05-06-PLAN.md — 底部三分頁（查韻・歌詞・AI 建議）、把手與 Esc、面板內容；五種視窗完整流程

**Wave 7** *(blocked on Wave 6 completion)*
- [x] 05-07-PLAN.md — 虛擬鍵盤不擋輸入（visualViewport 模型）＋輸入框字級 ≥ 16px

**Wave 8** *(blocked on Wave 7 completion)*
- [x] 05-08-PLAN.md — 觸控目標 ≥ 44px；有內容的段落刪除先確認；選單不跑出畫面

**Wave 9** *(blocked on Wave 8 completion)*
- [x] 05-09-PLAN.md — 視覺一致：字型 link 預載、400/700、對比、hover 只給滑鼠、焦點框、減少動態

**Wave 10** *(blocked on Wave 9 completion)*
- [x] 05-10-PLAN.md — 字卡分批渲染（首批 48、每格 64），golden 不變；4×/6× 降速長任務量測

**Wave 11** *(blocked on Wave 10 completion)*
- [x] 05-11-PLAN.md — 截圖基準（晝夜、客製顏色 × 三種裝置）、版號 0.96.7、Phase gate、Andy 實機清單

### Phase 6: Lexicon Packs 台灣詞庫包

**Goal**: 用全自動流程把多個台灣來源詞庫清洗成統一格式的「詞庫包」，網站上可以切換比較；查到的詞更符合台灣日常語感，簡體、中國用語與冷僻詞大幅減少。
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: LEX-01, LEX-02, LEX-03, LEX-04, LEX-05, LEX-06, LEX-07
**Success Criteria** (what must be TRUE):
  1. 每個來源都通過授權檢查並有 NOTICE 標示，各自產出同一格式的獨立詞庫包〔自動：檢查產出檔〕
  2. 網站設定可以切換詞庫包，切換後查韻與 AI 建議立刻改用該包；新版詞庫發布後舊快取自動失效，不需手動清除〔自動〕
  3. 清洗腳本一個指令跑完、不需人工逐條審核：產出中簡體／罕用字詞條為零，中國專用詞被移除；只有單一來源的詞進入灰色地帶而非直接刪除，灰色地帶由免費 AI 依「可理解性」標準判斷，總 token 在免費額度內〔自動：腳本統計＋斷言〕
  4. 用一份範例詞表驗證「可理解性」標準：例如「三酸甘油酯」保留、「聚乙烯醇縮丁醛」與「分散式雜湊表」刪除〔自動〕
  5. 產出刪除報告：每個被刪的詞都有原因，附原因統計與樣本；被誤刪的詞可透過回報流程加回〔自動〕

**Human check**: 提供灰色地帶判斷用的免費 AI API key（若 Worker 不代理）；Andy 抽查刪除報告樣本；Andy 切換不同詞庫包實際寫詞比較手感（供 Phase 12 決定）
**Plans**: 8/8 plans executed

Plans:
**Wave 1**
- [x] 06-01-PLAN.md — Tracer（清洗流程）：釘選來源＋授權檢查 → 解析與格式規則 → 一個指令產出「新酷音詞庫」包、NOTICE、詞庫包清單（v0.96 為預設、原檔不動）；Python 單元測試進 npm test

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 06-02-PLAN.md — Tracer（網站）：依清單載入使用者選的包（每包自己的版本與快取鍵）、偏好設定「詞庫包」清單、切換後重跑搜尋與 AI 建議、連點不混包；版號 0.96.8

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 06-03-PLAN.md — 快取只留目前＋上一個包、新版只換該包快取、修正檔加回不重複且每包生效、「關於」顯示目前詞庫來源

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 06-04-PLAN.md — 小麥注音詞庫、唯音台灣詞庫（精簡版，不含教育部部分）兩個包＋各自授權全文；網站列出四個包

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 06-05-PLAN.md — 規則層：簡體／罕用字刪除（台灣異體字白名單）、中國用語（完全吻合＋本來源少用）刪除、單一來源轉灰色保留、救回名單；嚴格驗證

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 06-06-PLAN.md — 每包刪除報告（原因統計＋樣本＋待 AI 判斷數與估算 token）、一個指令救回誤刪的詞

**Wave 7** *(blocked on Wave 6 completion)*
- [x] 06-07-PLAN.md — 灰色詞 AI 判斷流程（估算、上限、分批存檔續跑、Gemini 直連為預設／Worker 備用、金鑰不外洩），離線測試；真正執行留給 Andy

**Wave 8** *(blocked on Wave 7 completion)*
- [x] 06-08-PLAN.md — 範例詞表驗證「可理解性」（三酸甘油酯留、聚乙烯醇縮丁醛／分散式雜湊表刪）、AI 校準指令、Phase gate、Andy 測試清單

### Phase 7: Feedback & Correction Layer 回報與修正層

**Goal**: 使用者回報更簡單，Andy 在後台批改更省工：核准後一鍵套用、線上即時生效、可一鍵撤回；累積後用腳本寫回 `data/` 並安全清空修正層。
**Mode:** mvp
**Depends on**: Phase 6
**Requirements**: FB-01, FB-02, FB-03, FB-04, FB-05
**Success Criteria** (what must be TRUE):
  1. 詞卡的回報入口明顯、幾步內就能送出；桌機保留右鍵回報，長按留給拖曳，手機也有不靠長按的回報方式〔自動：headless 流程〕
  2. 後台同一個詞的多筆回報合併成一列，可勾選多筆一次核准或駁回〔自動〕
  3. 後台按「套用」後，線上使用者重新整理就看到修正（修正層與回報資料分開存放）；按「撤回」即恢復原狀〔自動：本機 Worker＋KV 測試〕
  4. 執行寫回腳本會把修正層寫進 `data/` 並 push；確認線上已生效後才清空修正層，重跑不會重複套用也不會遺失修正〔自動：本機模擬〕

**Human check**: 正式環境實際走一次「核准 → 套用 → 寫回 push → 清空」
**Plans**: 7/10 plans executed

Plans:
**Wave 1**
- [x] 07-01-PLAN.md — Tracer：修正層端到端（Worker 套用＋公開讀取＋網站兩段式套用詞庫）、後台金鑰改走 X-Admin-Key、測試基礎設施、?v=0.96.10

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 07-02-PLAN.md — Worker：所有核准動作對照、共用重播測試向量、撤回／清空／後台讀取、409／503、/reports.json 分頁 800 筆
- [x] 07-03-PLAN.md — 網站：字庫修正層兩段式套用、Worker 失敗／逾時／離線照常可用、換詞庫包只抓一次
- [x] 07-04-PLAN.md — 回報入口 Tracer：批次工具列 🚩 回報＋一頁式回報視窗（多選、上限 10、防重複、失敗與限流、無障礙、版面）、頁首改名「意見」
- [x] 07-05-PLAN.md — 後台 Tracer：同詞同因合併成列、整列／批次核准駁回（D-12 預設）、篩選與全選、防注入、手機版

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 07-06-PLAN.md — AI 詞卡「🚩 回報詞語」模式、右鍵「🚩 回報…」、拿掉字卡／AI 詞卡長按（破音字保留）
- [x] 07-07-PLAN.md — 後台「🚀 套用到線上」與撤回、已上線／已寫入資料檔狀態、失敗與 >500 提示、有效讀音併入修正層
- [ ] 07-08-PLAN.md — 寫回腳本 Tracer：讀修正層、預覽差異、--apply 寫檔＋commit（排版逐字相同、重跑不重複、安全停下）

**Wave 4** *(blocked on Wave 3 completion)*
- [ ] 07-09-PLAN.md — 寫回腳本：--push → 等線上生效 → 只清這一批、--confirm-only、逾時、409 重試、中斷重跑；真 Worker 端到端

**Wave 5** *(blocked on Wave 4 completion)*
- [ ] 07-10-PLAN.md — 真 workerd 冒煙（套用／公開讀取／撤回）、DEPLOY.md、Andy 驗收清單與自主決定、整階段總檢查

**UI hint**: yes

### Phase 8: Songs & Editor Model 歌曲管理與資料模型

**Goal**: 歌詞改以資料模型為準，打字（含注音組字）不再被打斷；可以像 Google Docs 一樣用側邊分頁管理多首歌，並匯出、備份、換裝置還原。
**Mode:** mvp
**Depends on**: Phase 5
**Requirements**: EDIT-01, EDIT-04, EDIT-08, EDIT-09
**Success Criteria** (what must be TRUE):
  1. 在編輯器打注音組字、移動游標時，不會被重新渲染打斷或跳游標〔自動：模擬組字事件；實機見 Human check〕
  2. 側邊分頁可顯示／隱藏，可新增、切換、刪除、重新命名歌曲；舊版只有一首歌的使用者升級後，原歌詞自動成為第一首、一字不少〔自動〕
  3. 一首歌可匯出 TXT（預設）、PDF、Markdown，也可一鍵複製整首〔自動：檢查輸出內容〕
  4. 匯出 JSON 備份（全部歌曲＋設定）後，在另一個乾淨的瀏覽器匯入即可完整還原〔自動〕

**Human check**: 實機注音輸入法組字順暢；PDF 排版是否好看
**Plans**: TBD
**UI hint**: yes

### Phase 9: Section Modules 段落模組

**Goal**: 段落變成可拖曳排序、可調整高度的模組，搭配結構化標籤、段落顏色、字數統計與 Undo/Redo；AI 候選詞可以直接拖進歌詞裡。
**Mode:** mvp
**Depends on**: Phase 8
**Requirements**: EDIT-02, EDIT-03, EDIT-05, EDIT-06, EDIT-07, AI-06
**Success Criteria** (what must be TRUE):
  1. 段落可用滑鼠或手指縱向拖曳排序、拖拉調整高度，現有拖曳 bug 不再出現〔自動：模擬指標事件〕
  2. 左鍵點段落標籤會在 Intro／Verse／Pre-Chorus／Chorus／Inter／Bridge／Outro／Custom 間循環，同類型依排序自動編成羅馬數字（Verse I、Verse II）；右鍵開 color picker 改段落顏色〔自動〕
  3. 文字編輯與段落新增、刪除、排序、改標籤都能 Undo／Redo〔自動〕
  4. 每個段落顯示字數，編輯時即時更新〔自動〕
  5. 把 AI 候選詞卡拖到歌詞指定位置就插入該處（手機長按啟動拖曳），單純點擊詞卡不會插入〔自動〕

**Human check**: 平板／手機實機的拖曳與長按手感
**Plans**: TBD
**UI hint**: yes

### Phase 10: Rhyme Map 韻腳地圖

**Goal**: 寫詞時一眼看出押韻結構：句尾依韻部自動上色、段落韻式統計、可選的句中押韻偵測、點字即查韻——判定一律沿用 Andy 既有的核心押韻演算法。
**Mode:** mvp
**Depends on**: Phase 9
**Requirements**: MAP-01, MAP-02, MAP-03, MAP-04, MAP-05, MAP-06, MAP-07, MAP-08, MAP-12
**Success Criteria** (what must be TRUE):
  1. 句尾字依韻部自動上色，判定與查韻功能用同一套核心演算法（同一組測試資料兩邊結果一致）；破音字手動指定讀音後上色跟著改變〔自動〕
  2. 每個段落顯示韻腳統計與押韻結構字母（如 AABB、ABAB）〔自動：固定歌詞範例斷言〕
  3. 嚴格／寬韻切換、忽略句尾語助詞（啊、呢、喔、了…）、句中多押偵測（預設關閉）都能開關並立即反映〔自動〕
  4. 點歌詞中的任一字，就能查它的同韻字與 AI 建議〔自動〕
  5. 注音組字過程中不執行分析；100 行以上的長篇歌詞編輯時不卡頓〔自動：量測長任務〕

**Human check**: 上色在實機上的可讀性與美觀；實機注音組字不受影響
**Plans**: TBD
**UI hint**: yes

### Phase 11: Line Analysis & Settings 句構分析與設定頁

**Goal**: 逐行看出字數與斷句結構、對照同類段落，並在設定頁自訂所有標記；預設只開句尾上色，不讓畫面眼花撩亂。
**Mode:** mvp
**Depends on**: Phase 10
**Requirements**: MAP-09, MAP-10, MAP-11
**Success Criteria** (what must be TRUE):
  1. 每行顯示字數與斷句結構（如 3+4、2+2+3），並可把 Verse I 與 Verse II 逐行對照〔自動：固定範例斷言〕
  2. 句構分析可在設定頁常駐開啟，也可反白後按「分析」，或反白後停留數秒自動出現；觸控裝置以按鈕代替 hover〔自動〕
  3. 設定頁可逐項開關韻腳地圖與句構分析，並調整標記位置、文字大小、顏色；全新使用者預設只開句尾上色〔自動〕

**Human check**: 用幾首真實歌詞抽查斷句是否符合 Andy 的語感；標記版面是否美觀
**Plans**: TBD
**UI hint**: yes

### Phase 12: Official Lexicon 官方詞庫

**Goal**: 依 Andy 實測結果，把選定的詞庫包組合合併成「好韻器官方維護詞庫」並設為所有使用者的預設詞庫。
**Mode:** mvp
**Depends on**: Phase 7（且需 Andy 完成 Phase 6 詞庫包實測並指定組合）
**Requirements**: LEX-08
**Success Criteria** (what must be TRUE):
  1. 合併腳本依 Andy 指定的詞庫包組合與規則，一個指令產出官方詞庫，來源 NOTICE 完整保留〔自動〕
  2. 新舊使用者打開網站都預設使用官方詞庫，舊快取自動失效〔自動〕
  3. 已累積的回報修正層在官方詞庫上仍正確生效〔自動〕

**Human check**: 本 phase 開始前，Andy 必須提供選定的詞庫包組合與合併偏好
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Safety Net 安全網 | 6/6 | Complete    | 2026-10-03 |
| 2. AI Service Hotfix AI 服務不斷線 | 6/6 | In Progress|  |
| 3. Split index.html 拆檔 | 5/5 | Complete    | 2026-10-04 |
| 4. AI Fill & Validate AI 挑詞填滿與造詞驗證 | 5/5 | In Progress|  |
| 5. Multi-Device Layout 多裝置版面與流暢度 | 11/11 | In Progress|  |
| 6. Lexicon Packs 台灣詞庫包 | 8/8 | In Progress|  |
| 7. Feedback & Correction Layer 回報與修正層 | 7/10 | In Progress|  |
| 8. Songs & Editor Model 歌曲管理與資料模型 | 0/TBD | Not started | - |
| 9. Section Modules 段落模組 | 0/TBD | Not started | - |
| 10. Rhyme Map 韻腳地圖 | 0/TBD | Not started | - |
| 11. Line Analysis & Settings 句構分析與設定頁 | 0/TBD | Not started | - |
| 12. Official Lexicon 官方詞庫 | 0/TBD | Not started | - |
