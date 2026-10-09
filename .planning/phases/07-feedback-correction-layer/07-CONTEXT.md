# Phase 7: Feedback & Correction Layer 回報與修正層 - Context

**Gathered:** 2026-10-09
**Status:** Ready for planning
**Mode:** Smart discuss（autonomous；Andy 事先授權「灰色地帶不要問、用推薦方案決定」，所有決定標為 Claude's Discretion，並列入 `.planning/驗收清單-精簡版.md` 的「自主決定」讓 Andy 事後否決）

<domain>
## Phase Boundary

使用者回報更簡單，Andy 在後台批改更省工：核准後一鍵套用到 Worker 上的「修正層」、線上重新整理即生效、可一鍵撤回；累積後用一個腳本把修正層寫回 `data/*-overrides.json`、push，確認線上生效後才清空修正層。

涵蓋：FB-01～FB-05。網站回報入口（`js/report.js`、批次工具列）、後台 `admin/index.html`、Worker `worker/src/index.js`（新增修正層路由）、網站載入時套用修正層（`js/wordlist.js`、`js/dict.js`）、寫回腳本（新）。

不在本 phase：回報者通知／回覆、AI 自動審核回報、編輯器內拖曳（Phase 8／9 才做拖曳本身，這裡只把長按讓出來）、官方詞庫合併（Phase 12）。
</domain>

<decisions>
## Implementation Decisions

### A. 網站回報入口（FB-01）
- **A1 手機不靠長按的入口：** 沿用現有「點選字卡／詞卡 → 出現批次工具列」的操作，在批次工具列（桌機 `#batchPanel`、手機 `#m-batchPanel`）加一顆「🚩 回報」按鈕，對目前選取的卡片開回報視窗。不在每張卡上加按鈕（避免字卡變擠）。若某種卡片（例如 AI 詞卡、詞庫詞卡）目前不能被選取，planner 要補一個同樣不靠長按、不擠版面的入口（例如在該卡片區的既有工具列放回報），並維持 Phase 5 的 44×44 觸控規則。
- **A2 長按：** 字卡／詞卡的長按不再開回報選單，留給之後的拖曳（Phase 8／9）。桌機右鍵選單完整保留。破音字 chip 不會被拖曳，它的長按回報選單保留。
- **A3 回報視窗：** 一個視窗、一頁完成。原因用大按鈕單選（讀音錯誤／太冷僻／不該出現（不押韻、怪詞、錯字）／其他），說明欄選填；多選卡片時一次送出，每個詞各存一筆回報（後台才能依詞合併）。沿用 `postFeedback` 的失敗提示與「送出成功才關視窗」行為；不新增必填欄位。
- **A4 防重複：** 同一個分頁內，同一個詞＋同一原因已送過就不再送，改顯示「已回報過」。不寫進 localStorage（不新增儲存鍵）。

### B. 後台批改（FB-02、安全強化）
- **B1 合併：** 回報依「詞（或字＋讀音）＋回報類型」合併成一列，顯示次數、最早／最新時間，可展開看每一筆原文。
- **B2 批次：** 每列有勾選框＋「全選目前篩選結果」；勾選後可一次「核准」或「駁回」。核准沿用現有 agreed 狀態與動作格式（`/reports/decision`），合併列核准時，列內每一筆都寫入同一個決定。
- **B3 套用是另一顆按鈕：** 「核准」只是批改；「🚀 套用到線上」一次把所有「已核准、還沒套用」的動作送進修正層（Andy 可以先批改一批再一次套用）。已套用的列顯示「已上線」與「撤回」。
- **B4 後台金鑰改走 header：** Worker 接受 `X-Admin-Key` header；查詢字串 `?key=` 暫時仍接受（Worker 會先於 main 合併部署，舊版後台還在用），在程式註解與 DEPLOY.md 標示 v2 移除。新後台一律用 header。
- **B5 防注入：** 後台把回報內容（使用者輸入）放進畫面時一律用 textContent 或跳脫；`onclick="...('${k}')"` 這類把 KV 鍵或使用者字串拼進 HTML 屬性的寫法改成 data 屬性＋事件委派。

### C. 修正層（Worker；FB-03、FB-04）
- **C1 存放：** 用既有的 `AI_STATE_KV`，單一文件鍵 `corrections:v1`，與回報（`USER_FEEDBACK_KV`）分開；不新建 KV namespace（Andy 不必多一個部署步驟）。`wrangler.toml` 綁定不變。
- **C2 格式：** 與 `data/wordlist-overrides.json`、`data/rhyme-dict-overrides.json` 同一套欄位（removed／hidden／fixed／added），分成 wordlist 與 rhymeDict 兩區；每一筆另帶 `id`、`source_kvKeys`（來源回報）、`applied_at`。撤回 = 依 id 從修正層移除該筆（並把來源回報狀態改回「已核准、未套用」）。
- **C3 公開讀取：** `GET /corrections.json` 不需金鑰、只回修正內容（不含回報原文、時間戳以外的個資），只回應允許的網站來源（沿用 `originAllowed`／CORS 規則），`Cache-Control: max-age=60`。寫入路由（套用、撤回、清空）都需要後台金鑰（B4），只收 POST。
- **C4 網站套用：** 載入詞庫時，`data/*-overrides.json` 先套、修正層後套（同一套 removed／hidden／fixed／added 規則；Phase 6 決定的「removed／hidden／fixed 對每個詞庫包都生效、added 依詞去重」同樣適用）。修正層抓不到（離線、Worker 未部署、逾時 3 秒）就略過，只記 log，不擋畫面、不跳橫幅。
- **C5 生效時間：** 「重新整理就看到」以約 1 分鐘內為準（KV 最終一致＋60 秒快取），後台套用後的提示文字寫明「約 1 分鐘內生效」。
- **C6 上限：** 修正層超過 500 筆時後台提示「先跑寫回腳本」，但不阻擋套用。

### D. 寫回腳本（FB-05）
- **D1 語言／位置：** Python 標準函式庫，`tools/corrections/writeback.py`，與 `tools/lexicon` 同風格（`python3 -B`、unittest 進 `npm test`），`npm run corrections:writeback`。取代後台「匯出 agreed」產生一次性 Python 腳本的舊流程；舊的匯出按鈕先保留當備援（Worker 新路由上線前還用得到），v2 再移除。
- **D2 流程：** 讀修正層 → 合併進 `data/*-overrides.json`（以內容為準、可重複執行：已存在的不重複加）→ 預設只顯示差異（dry-run）；加 `--apply` 才寫檔＋git commit；加 `--push` 才 push → 輪詢線上網站的 overrides 檔，直到內容包含這批修正（最多 10 分鐘）→ 只清掉「這批 id」的修正層項目（寫回期間新套用的不會被清）→ 印出結果。
- **D3 分支安全：** 線上網站來自 `main`。目前分支不是 `main` 時，腳本只寫檔＋commit，不 push、不清空，並提示「合併到 main 後用 `--confirm-only` 完成確認與清空」。push 是對外動作，必須 Andy 自己下 `--push`。
- **D4 失敗即停：** 任一步失敗（抓不到修正層、合併衝突、git 失敗、線上確認逾時）就停在那一步，修正層完全不動；重跑安全（已寫入的不重複、未清空的會重新確認）。腳本需要的後台金鑰只從環境變數讀，不印出、不寫檔。

### E. 研究後補充決定（2026-10-09，回應 07-RESEARCH.md OQ1～OQ8；同為 Claude's Discretion）
- **E1（OQ1）** 寫回腳本等線上生效：預設最多 20 分鐘、每 30 秒查一次，`--timeout` 可調；逾時訊息寫明「不是壞掉，CDN 還沒更新，過幾分鐘用 `--confirm-only` 重跑」（取代 D2 的 10 分鐘）。
- **E2（OQ2）** Worker 公開讀取用 KV `cacheTtl: 30`＋`Cache-Control: max-age=60`；後台提示文字改「約 1～2 分鐘內生效」（取代 C5 的「約 1 分鐘」）。
- **E3（OQ3）** 寫回並清空後的回報顯示「✓ 已寫入資料檔」，歸在「已上線」篩選、沒有撤回鈕。
- **E4（OQ4）** hidden 與 removed 兩個欄位都保留（與 data 檔一致）。
- **E5（OQ5）** `/reports.json` 用 cursor 把所有鍵列完，只讀最新 800 筆的內容並回 `truncated: true`，後台顯示「只載入最新 800 筆」；不做分頁介面。
- **E6（OQ6）** 連鎖修正採簡單的集合語意（同一對象後套用者為準），寫進共用測試向量；後台「有效讀音」一併讀修正層。
- **E7（OQ7）** 寫回腳本加 `--live-branch`（預設 `main`）；正式環境的 Pages 發佈分支列入 Andy 驗收。
- **E8（OQ8）** 一次回報最多 **10** 個詞（取代 UI-SPEC D-09 的 20），避免單次送出就用完每分鐘 20 次的限流；仍要有 429 的白話提示。
- **E9** 公開讀取的修正層格式＝與 `data/*-overrides.json` 相同形狀（wordlist／rhymeDict 各自 removed／hidden／fixed／added）；KV 內部文件帶 `rev` 版本號，寫入時比對 `baseRev`，不一致回 409（後台提示重新整理再套用）。
- **E10** 後台金鑰檢查共用一個函式：先看 `X-Admin-Key` header、再看 `?key=`，金鑰為空一律拒絕；寫回腳本的金鑰環境變數名 `LH_ADMIN_KEY`。

### Claude's Discretion
- 以上 A～D 全部為 Claude 依專案慣例與既有決定選的推薦方案（Andy 授權不逐一詢問）。
- 視窗、按鈕、後台列表的細部樣式由 planner／UI-SPEC 決定，需符合 Phase 5 的 rem、44×44、晝夜主題規則。
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `js/report.js`：字卡右鍵／長按選單（`_showCharCtxMenu`、`_setCtxMenuFor`）、破音 chip 選單、`postFeedback()`（已含失敗提示）、回報視窗 `#feedbackModalOverlay`。
- 批次工具列：`index.html` `#batchPanel`（桌機）與 `#m-batchPanel`（手機），`js/cards.js` `batchMark()`、`#batchCount`。
- `js/wordlist.js` `applyWordlistOverrides()`（每次載入末段套用、不進 IDB）；`js/dict.js` `applyRhymeDictOverrides()`。
- Worker：`worker/src/index.js` `handleFeedbackAdmin()`（/feedback、/reports.json、/reports/decision、/reports/delete）、`originAllowed`、`corsHeaders`、`isRateLimited`、`readBodyCapped`；`AI_STATE_KV` 已綁定。
- 後台：`admin/index.html` 的 `postDecision()`、`exportChanges()`（產生 apply_changes 腳本，內含 overrides 合併邏輯與注音格式檢查，可搬進寫回腳本）。
- 測試：`tests/` 的 `bridgeWorker`（瀏覽器測試跑真的 worker/src、只假上游）、`worker/test/dev-smoke.mjs`（wrangler dev＋假供應商）、`tools/lexicon/tests` 的 unittest 寫法。

### Established Patterns
- 儲存一律經 `js/safety.js` 的 `lhGet／lhSet`；新儲存鍵要登記（本 phase 預期不新增）。
- 動到 `css/` 或 `js/` 時所有標籤的 `?v=` 一起加（split-tags 測試）；目前 0.96.9。
- 使用者看得到的錯誤用白話 `showToast`／`lhWarn`；Worker 回應保留舊格式相容（admin 依賴狀態碼與回應內容）。
- Python 工具一律 `python3 -B`（tools/ 底下不可留 `__pycache__`，有測試守）。

### Integration Points
- 網站載入：`js/init.js`（`applyRhymeDictOverrides` 後 rebuild）、`js/wordlist.js` 載入末段。
- Worker 路由：`route()` 先過 `handleFeedbackAdmin()`。
- 後台：GitHub Pages `/admin/`，`WORKER_URL` 常數。
</code_context>

<specifics>
## Specific Ideas

- Phase 6 D2：被誤刪的詞用修正層的 `added` 加回；本 phase 讓後台能一鍵做到（把某則「詞不見了」的回報核准成 added 動作並套用）。
- Phase 2 遺留：後台金鑰改走 header、防注入（02-CONTEXT「→ Phase 7」）。
- Worker 尚未正式部署（Phase 2 待 Andy）；本 phase 的線上行為全部用本機 Worker＋KV 模擬測試，正式環境走一次「核准 → 套用 → 寫回 push → 清空」列入 Andy 驗收。
</specifics>

<deferred>
## Deferred Ideas

- 回報者收到處理結果通知 — v2
- AI 先幫忙初審回報 — v2
- 移除查詢字串金鑰與舊的「匯出 agreed」按鈕 — v2（新流程上線穩定後）
</deferred>
