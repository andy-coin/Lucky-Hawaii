# Phase 7: Feedback & Correction Layer 回報與修正層 - Research

**Researched:** 2026-10-09
**Domain:** Cloudflare Worker + KV 單文件修正層、vanilla-JS 網站載入時套用、純前端後台批改頁、Python 標準函式庫寫回腳本、Playwright／unittest 本機驗證
**Confidence:** HIGH（程式碼事實與 Cloudflare 限額）／MEDIUM（GitHub Pages 快取行為只在別的 Pages 站實測、Andy 的站 404 無法直測）

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
（CONTEXT.md 的 `## Implementation Decisions` A1–D4，原文如下；所有項目本身標為 Claude's Discretion，但 Andy 已授權「用推薦方案決定」，planner 一律當鎖定處理。）

**A. 網站回報入口（FB-01）**
- **A1 手機不靠長按的入口：** 沿用現有「點選字卡／詞卡 → 出現批次工具列」的操作，在批次工具列（桌機 `#batchPanel`、手機 `#m-batchPanel`）加一顆「🚩 回報」按鈕，對目前選取的卡片開回報視窗。不在每張卡上加按鈕（避免字卡變擠）。若某種卡片（例如 AI 詞卡、詞庫詞卡）目前不能被選取，planner 要補一個同樣不靠長按、不擠版面的入口（例如在該卡片區的既有工具列放回報），並維持 Phase 5 的 44×44 觸控規則。
- **A2 長按：** 字卡／詞卡的長按不再開回報選單，留給之後的拖曳（Phase 8／9）。桌機右鍵選單完整保留。破音字 chip 不會被拖曳，它的長按回報選單保留。
- **A3 回報視窗：** 一個視窗、一頁完成。原因用大按鈕單選（讀音錯誤／太冷僻／不該出現（不押韻、怪詞、錯字）／其他），說明欄選填；多選卡片時一次送出，每個詞各存一筆回報（後台才能依詞合併）。沿用 `postFeedback` 的失敗提示與「送出成功才關視窗」行為；不新增必填欄位。
- **A4 防重複：** 同一個分頁內，同一個詞＋同一原因已送過就不再送，改顯示「已回報過」。不寫進 localStorage（不新增儲存鍵）。

**B. 後台批改（FB-02、安全強化）**
- **B1 合併：** 回報依「詞（或字＋讀音）＋回報類型」合併成一列，顯示次數、最早／最新時間，可展開看每一筆原文。
- **B2 批次：** 每列有勾選框＋「全選目前篩選結果」；勾選後可一次「核准」或「駁回」。核准沿用現有 agreed 狀態與動作格式（`/reports/decision`），合併列核准時，列內每一筆都寫入同一個決定。
- **B3 套用是另一顆按鈕：** 「核准」只是批改；「🚀 套用到線上」一次把所有「已核准、還沒套用」的動作送進修正層（Andy 可以先批改一批再一次套用）。已套用的列顯示「已上線」與「撤回」。
- **B4 後台金鑰改走 header：** Worker 接受 `X-Admin-Key` header；查詢字串 `?key=` 暫時仍接受（Worker 會先於 main 合併部署，舊版後台還在用），在程式註解與 DEPLOY.md 標示 v2 移除。新後台一律用 header。
- **B5 防注入：** 後台把回報內容（使用者輸入）放進畫面時一律用 textContent 或跳脫；`onclick="...('${k}')"` 這類把 KV 鍵或使用者字串拼進 HTML 屬性的寫法改成 data 屬性＋事件委派。

**C. 修正層（Worker；FB-03、FB-04）**
- **C1 存放：** 用既有的 `AI_STATE_KV`，單一文件鍵 `corrections:v1`，與回報（`USER_FEEDBACK_KV`）分開；不新建 KV namespace（Andy 不必多一個部署步驟）。`wrangler.toml` 綁定不變。
- **C2 格式：** 與 `data/wordlist-overrides.json`、`data/rhyme-dict-overrides.json` 同一套欄位（removed／hidden／fixed／added），分成 wordlist 與 rhymeDict 兩區；每一筆另帶 `id`、`source_kvKeys`（來源回報）、`applied_at`。撤回 = 依 id 從修正層移除該筆（並把來源回報狀態改回「已核准、未套用」）。
- **C3 公開讀取：** `GET /corrections.json` 不需金鑰、只回修正內容（不含回報原文、時間戳以外的個資），只回應允許的網站來源（沿用 `originAllowed`／CORS 規則），`Cache-Control: max-age=60`。寫入路由（套用、撤回、清空）都需要後台金鑰（B4），只收 POST。
- **C4 網站套用：** 載入詞庫時，`data/*-overrides.json` 先套、修正層後套（同一套 removed／hidden／fixed／added 規則；Phase 6 決定的「removed／hidden／fixed 對每個詞庫包都生效、added 依詞去重」同樣適用）。修正層抓不到（離線、Worker 未部署、逾時 3 秒）就略過，只記 log，不擋畫面、不跳橫幅。
- **C5 生效時間：** 「重新整理就看到」以約 1 分鐘內為準（KV 最終一致＋60 秒快取），後台套用後的提示文字寫明「約 1 分鐘內生效」。
- **C6 上限：** 修正層超過 500 筆時後台提示「先跑寫回腳本」，但不阻擋套用。

**D. 寫回腳本（FB-05）**
- **D1 語言／位置：** Python 標準函式庫，`tools/corrections/writeback.py`，與 `tools/lexicon` 同風格（`python3 -B`、unittest 進 `npm test`），`npm run corrections:writeback`。取代後台「匯出 agreed」產生一次性 Python 腳本的舊流程；舊的匯出按鈕先保留當備援（Worker 新路由上線前還用得到），v2 再移除。
- **D2 流程：** 讀修正層 → 合併進 `data/*-overrides.json`（以內容為準、可重複執行：已存在的不重複加）→ 預設只顯示差異（dry-run）；加 `--apply` 才寫檔＋git commit；加 `--push` 才 push → 輪詢線上網站的 overrides 檔，直到內容包含這批修正（最多 10 分鐘）→ 只清掉「這批 id」的修正層項目（寫回期間新套用的不會被清）→ 印出結果。
- **D3 分支安全：** 線上網站來自 `main`。目前分支不是 `main` 時，腳本只寫檔＋commit，不 push、不清空，並提示「合併到 main 後用 `--confirm-only` 完成確認與清空」。push 是對外動作，必須 Andy 自己下 `--push`。
- **D4 失敗即停：** 任一步失敗（抓不到修正層、合併衝突、git 失敗、線上確認逾時）就停在那一步，修正層完全不動；重跑安全（已寫入的不重複、未清空的會重新確認）。腳本需要的後台金鑰只從環境變數讀，不印出、不寫檔。

### Claude's Discretion
- 以上 A～D 全部為 Claude 依專案慣例與既有決定選的推薦方案（Andy 授權不逐一詢問）。
- 視窗、按鈕、後台列表的細部樣式由 planner／UI-SPEC 決定，需符合 Phase 5 的 rem、44×44、晝夜主題規則。

### Deferred Ideas (OUT OF SCOPE)
- 回報者收到處理結果通知 — v2
- AI 先幫忙初審回報 — v2
- 移除查詢字串金鑰與舊的「匯出 agreed」按鈕 — v2（新流程上線穩定後）

（CONTEXT「不在本 phase」另列：回報者通知／回覆、AI 自動審核回報、編輯器內拖曳（Phase 8／9）、官方詞庫合併（Phase 12）。）
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FB-01 | 回報入口更明顯、步驟更少（保留詞卡右鍵回報；長按保留給拖曳） | 第 5 節（入口實作清單）、UI-SPEC §2–3；必須改的舊測試見「Tests that assert old behaviour」 |
| FB-02 | 後台同一個詞的多筆回報合併顯示，可批次核准／駁回 | 群組鍵 `(subject, reportType)`、`/reports/decision` 逐筆寫入的 KV 寫入預算、B5 事件委派重構 |
| FB-03 | 後台核准後一鍵套用，修正暫存為 Worker 上的「修正層」，線上使用者即時生效（與回報資料分開存放） | 修正層文件形狀、`/corrections/apply`、公開 `GET /corrections.json`、網站兩段式套用、KV 一致性與快取數字 |
| FB-04 | 已套用的修正可一鍵撤回 | `/corrections/revoke`（依 id）、狀態由修正層文件推導（不再多寫報告 KV）、rev 樂觀鎖 |
| FB-05 | 腳本可把累積的修正層寫回 `data/`、push 到 GitHub，確認線上部署生效後才清空 Worker 修正層，不會重複套用或遺失修正 | `tools/corrections/writeback.py` 設計、冪等合併語意、`merge(live,batch)==live` 確認法、Pages CDN 快取實測、離線測試法 |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

來源：`/Users/Shared/Coding Projects/Lucky Hawaii/.claude/CLAUDE.md`（專案）與 `~/.claude/CLAUDE.md`（Andy 全域）。planner 視同鎖定決定。

- **介面與詞庫繁體中文（台灣）為主，嚴禁簡體**；本文件所有建議的使用者可見字串皆為繁體。
- **純前端、無建置**：GitHub Pages ＋ Cloudflare Worker，免費額度；不得新增 npm／CDN／字型相依（UI-SPEC 也寫明）。
- **資料安全**：更新不得弄丟使用者已存的歌詞、覆寫、設定；本 phase **不新增 localStorage／IDB 鍵**（A4）。儲存一律經 `js/safety.js` 的 `lhGet／lhSet`。
- **程式風格**：4 空白縮排、單引號、全域 camelCase 函式、註解用中文講「為什麼」、`// ==== 區塊 ====` 標題；使用者看得到的錯誤用 `showToast`／`lhWarn`，Worker 回應保留舊格式相容。
- **動到 `css/` 或 `js/` 時所有標籤 `?v=` 一起加**（split-tags 測試守；目前 0.96.9）。
- **Python 工具一律 `python3 -B`**，`tools/` 底下不可留 `__pycache__`（lexicon-build.spec 會失敗）。
- **GSD 流程**：修改檔案前走 GSD 指令；`.planning/` 在 `.gitignore`（只留本機），`commit_docs=false`，故 RESEARCH.md 不 commit。
- Andy 習慣：每次 coding 任務後更新 `handoff.md`；關鍵字 "commit" 才 git commit；討論用白話不講變數名。
- CLAUDE.md 內「`admin/woker.js`」已過時：Worker 現在是 `worker/src/*.js`（`admin/woker.js` 是 gitignored 舊副本）。

## Summary

本 phase 是五塊拼起來：（1）網站回報入口（批次工具列 🚩、AI 詞卡回報模式、右鍵新增「🚩 回報…」、拿掉卡片長按）；（2）後台把同詞回報合併成列、批次核准／駁回、`X-Admin-Key`、防注入；（3）Worker 新增「修正層」單一 KV 文件與套用／撤回／清空／公開讀取路由；（4）網站載入時把修正層疊在 `data/*-overrides.json` 之後；（5）Python 寫回腳本。最大的設計風險不在 UI，而在**一致性與冪等**：KV 最終一致、沒有 CAS、GitHub Pages CDN 會把 JSON 快取最多 10 分鐘且**實測不吃 query string**。

**核心建議（皆已用程式碼或實測佐證）：**
1. **把「已上線」狀態放進修正層同一份文件**（`entries[].source_kvKeys` ＋ 清空後移進 `written[]`），不要為了標記狀態去多寫 N 筆回報 KV。理由：KV 免費額度每天只有 1,000 次寫入（回報本身、核准決定、套用都吃這個額度），而且兩個 KV 無法原子更新，單一文件可避免「修正層寫了、回報沒標到」的半套狀態；萬一發生 lost update，回報會自然退回「已核准、未套用」，**自我修復且肉眼看得見**。
2. **修正層儲存成扁平 `entries[]`（每筆帶 id、target、bucket、value、source_kvKeys、applied_at），公開 `GET /corrections.json` 回「推導後的 view」，其欄位形狀與 `data/*-overrides.json` 完全相同**（wordlist／rhymeDict 兩區，每區 removed／hidden／fixed／added）。網站因此可用**同一支套用函式**跑兩次（先 base、後 layer）；view 在推導時做「同一主體後者勝」，解決「先 added 後 removed 會被 added 蓋回來」的問題。
3. **寫回腳本的合併是「集合語意＋最後一筆勝」且完全由內容決定**；「線上已生效」的判斷用 **`merge(live, batch) == live`**（再套一次不會改變任何東西），不需要記狀態、不怕重跑。
4. **GitHub Pages 實測（pages.github.com）：`cache-control: max-age=600`，且換 `?cb=` 後 `age` 繼續累加、`x-cache: HIT` — CDN 快取鍵不含 query string**。所以「加 cache-busting 查詢」**不能**繞過 CDN；輪詢要靠等。CONTEXT D2 的「最多 10 分鐘」不夠（建置＋CDN 最壞可到 ~20 分鐘），建議預設 20 分鐘、可用 `--timeout` 調整（見 Open Questions OQ1）。
5. **CORS：只要把 `Access-Control-Allow-Headers` 加上 `X-Admin-Key`**（`worker/src/index.js:27` 現在只有 `Content-Type`），預檢由 `route()` 開頭的 OPTIONS 分支回（`:241`）。Playwright 的 `route.fulfill` 會跳過預檢且不強制 CORS（已實測），所以**預檢正確性只能用「OPTIONS 回應標頭斷言」測**，不能靠瀏覽器 e2e。

**Primary recommendation:** 依序做 Wave 0（測試基礎設施＋共用測試向量）→ A Worker（修正層＋金鑰 header）→ 並行 B 網站套用／C 回報入口／D 後台／E 寫回腳本；全程用 `bridgeWorker`（真 Worker 程式碼＋FakeKV）、Python unittest＋本機 bare git repo＋假 HTTP server 驗證，不需要真實部署或 push。

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 回報入口 UI（🚩、AI 回報模式、回報視窗、已回報過） | Browser / Client | — | 純 DOM／事件；防重複只放記憶體 `Set`（A4，不寫儲存） |
| 回報資料儲存、限流、大小上限 | API / Backend（Worker `/feedback`） | Database（`USER_FEEDBACK_KV`） | 沿用既有；每筆 1 次 KV 寫入 |
| 後台列表合併／批次選取／展開原文 | Browser / Client（`admin/index.html`） | — | 後台是 GitHub Pages 靜態頁，分組在瀏覽器算 |
| 後台金鑰驗證（`X-Admin-Key`／`?key=`） | API / Backend | — | 驗證必須在 Worker；瀏覽器只負責帶 header |
| action → 修正層 entry 的轉換與驗證 | API / Backend（`/corrections/apply` 讀報告 KV 再轉） | — | 以 KV 內已核准的報告為準，不信任 client 送來的 action；注音格式在伺服器端再驗一次 |
| 修正層儲存（entries、rev、written） | Database（`AI_STATE_KV` 鍵 `corrections:v1`） | — | C1 鎖定 |
| 公開修正層 view | API / Backend（`GET /corrections.json`） | Browser HTTP cache（max-age=60） | `workers.dev` 上 Cache API 不可用，只能靠瀏覽器快取＋KV 邊緣快取 |
| 載入時套用修正層 | Browser / Client（`js/wordlist.js`、`js/dict.js`） | — | 與 base overrides 同一支套用函式；失敗略過 |
| 寫回 data、git commit／push、線上確認、清空 | 開發機本機腳本（Python） | Worker（`/corrections/admin.json`、`/corrections/clear`） | push 是對外動作，必須 Andy 手動下 `--push` |
| 線上生效確認 | CDN / Static（GitHub Pages） | 本機腳本輪詢 | CDN 快取最久 10 分鐘，不吃 query string |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Cloudflare Worker（現有 `worker/src/index.js`） | wrangler 4.147.0（`npx --no-install wrangler --version` → 4.147.0） | 新增 `worker/src/corrections.js` 並在 `route()` 掛上 | 專案既有；`compatibility_date = "2026-10-01"` |
| Workers KV `AI_STATE_KV`（既有綁定） | — | 單一文件 `corrections:v1` | C1 鎖定；`worker-config.spec.mjs` 守「恰兩個 KV 綁定」，不可動 `wrangler.toml` |
| Vanilla JS（網站、後台） | — | 回報 UI、套用修正層、後台群組 | 專案慣例，無框架無建置 |
| Python 3 標準函式庫（`urllib.request`、`json`、`subprocess`、`http.server`、`unittest`） | 本機 3.13.15；lexicon README 要求 3.9+，維持 3.9 語法相容 | `tools/corrections/writeback.py` | D1 鎖定 |
| Playwright Test | 1.63.0（`package.json`） | 既有 `npm test`；新增 worker／site／admin／writeback 規格 | 既有 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tests/worker-helpers.mjs` 的 `FakeKV`、`makeEnv`、`bridgeWorker` | repo 內 | Worker 單元與瀏覽器整合測試 | 全部 Worker 相關測試；Wave 0 要擴充 `FakeKV`（見 Validation） |
| `wrangler dev`（`worker/test/dev-smoke.mjs` 模式） | 4.147.0；`node_modules/@cloudflare/workerd-darwin-64` 存在 | 真 workerd＋本機 KV 的冒煙 | 階段收尾一次，不放每個 commit |
| `git`（subprocess） | 2.55.0 | 寫回腳本 commit／push | 測試用本機 bare repo 當 remote |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| KV 單一文件＋rev 樂觀鎖 | Durable Object（強一致、免費方案已有 SQLite-backed DO） | 強一致但需要新綁定＋部署步驟，違反 C1「Andy 不必多一個部署步驟」；維持 KV |
| 以 `source_kvKeys` 推導狀態 | 套用時逐筆回寫報告 KV 的 `applied_*` 欄位 | 每筆 +1 次寫入（日額 1,000）且非原子；不採用 |
| Worker 內 `caches.default` | 瀏覽器 `Cache-Control` ＋ KV `cacheTtl` | `workers.dev` 上 Cache API 無保證可用（[CITED] 文件只說 custom domain 可用）；wrangler.toml 用 `workers_dev = true`，不採用 |
| isolate 內記憶體快取修正層 | 不做 | 讀取量遠低於額度（見預算表）；YAGNI。若日後要做，需以 `env.AI_STATE_KV` 為 WeakMap 鍵，否則測試間互相污染 |

**Installation:** 無新增套件。`package.json` 只新增兩個 script：
```json
"corrections:writeback": "python3 -B tools/corrections/writeback.py",
"corrections:test": "python3 -B -m unittest discover -s tools/corrections/tests -t tools/corrections"
```

**Version verification:** 本 phase 不安裝任何外部套件（網站／後台／Worker 全部用既有程式與平台 API，Python 只用標準函式庫）。已實測：`npx --no-install wrangler --version` → `4.147.0`；`python3 --version` → `3.13.15`；`git --version` → `2.55.0`；`node --version` → `v26.8.1`。

## Package Legitimacy Audit

本 phase 不安裝任何 npm／PyPI／crates 外部套件，故不需要 `package-legitimacy check`。

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| （無） | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
 使用者（手機／桌機）                          Andy（桌機）
 ───────────────────                           ───────────────
  點字卡/選 AI 詞 ──► 🚩 回報視窗                後台 admin/index.html（GitHub Pages）
        │  每個詞一筆                              │  X-Admin-Key header
        ▼  POST /feedback（限流 fb:、8KB 上限）      │
  ┌──────────────────────────── Cloudflare Worker（lucky-hawaii.*.workers.dev）───────────────┐
  │  /feedback ──► USER_FEEDBACK_KV   ◄── /reports.json、/reports/decision、/reports/delete    │
  │                    ▲ 讀 status=agreed 的報告＋action                                       │
  │  /corrections/apply ─┘ 轉成 entries（驗證注音）→ rev+1 → put 1 次                          │
  │  /corrections/revoke {ids}      ┐                                                          │
  │  /corrections/clear  {ids}      ├──► AI_STATE_KV['corrections:v1']  {rev, entries[], written[]}│
  │  GET /corrections/admin.json    ┘      （寫入需 baseRev，不符回 409）                       │
  │  GET /corrections.json（公開，只限網站來源）── 推導 view（同 overrides 形狀）, max-age=60   │
  └──────────────────────────────────────────────────────────────────────────────────────────┘
        │ GET /corrections.json（3 秒逾時，失敗略過）            ▲
        ▼                                                       │ GET admin.json／POST clear（env LH_ADMIN_KEY）
  網站載入：base overrides 先套 ──► 修正層後套（同一支套用函式）    │
  wordlist（每包）／rhymeDict（buildIndex 一次）            tools/corrections/writeback.py
                                                         1 讀層 → 2 合併進 data/*-overrides.json（冪等）
  GitHub Pages ◄── git push main（Andy 手動 --push）◄── 3 commit（只含兩個 data 檔＋log）
  （CDN max-age=600，快取鍵不含 query）──► 4 輪詢直到 merge(live,batch)==live ──► 5 clear 這批 ids
```

### Recommended Project Structure
```
worker/src/
├── index.js            # 既有；改：corsHeaders 加 X-Admin-Key＋Max-Age、共用 adminKeyOk()、route() 掛 handleCorrections
└── corrections.js      # 新：load/save 文件、action→entry、validate、buildView、apply/revoke/clear/admin.json/public
js/
├── dict.js             # 改：applyRhymeDictOverrides 兩段式（base→layer），並放共用 loadCorrections()（dict.js 在 JS_ORDER 最前面，不必新增 script 標籤）
├── wordlist.js         # 改：applyWordlistOverrides 抽 applyWordlistOverrideDoc(list, doc)，跑兩次
├── report.js           # 改：openReportDialog、postFeedbackRaw、右鍵新增項、移除字卡長按
└── ai-word-events.js   # 改：移除長按；加回報模式（capture 階段攔 click）
tools/corrections/
├── writeback.py        # 新：CLI＋純函式 merge／replay／format
└── tests/__init__.py, test_merge.py, test_writeback.py, test_format.py   # 新（仿 tools/lexicon/tests/__init__.py 的「只准連 127.0.0.1」保護）
tests/
├── worker-corrections.spec.mjs      # 新（Node-only）
├── corrections-site.spec.mjs        # 新（瀏覽器）
├── report-entry.spec.mjs            # 新（瀏覽器）
├── admin.spec.mjs                   # 新（瀏覽器載入 /admin/index.html＋bridgeWorker）
├── corrections-writeback.spec.mjs   # 新（spawn Python unittest；＋真 Worker＋本機 bare git 的 e2e）
└── fixtures/corrections-vectors.json # 新：JS view builder 與 Python replay 共用的測試向量
```

### Pattern 1：修正層文件（儲存形狀）
**What:** 單一 KV 值 `corrections:v1`：
```json
{
  "version": 1,
  "rev": 7,
  "updated_at": "2026-10-09T12:00:00.000Z",
  "entries": [
    { "id": "c_mgx3k9_ab12", "target": "wordlist",  "bucket": "removed", "value": "潛烈蟹",
      "source_kvKeys": ["1778520867886_z9pb"], "applied_at": "2026-10-09T12:00:00.000Z" },
    { "id": "…", "target": "wordlist",  "bucket": "fixed",   "value": { "w": "X", "z": "ㄅㄧˋ" }, "…": "…" },
    { "id": "…", "target": "wordlist",  "bucket": "added",   "value": { "w": "平安", "z": "ㄆㄧㄥˊ ㄢ", "tier": "normal", "source": "ai_accept" }, "…": "…" },
    { "id": "…", "target": "rhymeDict", "bucket": "hidden",  "value": { "char": "長", "dict_key": "ㄔㄤ2", "reading": "ㄔㄤˊ" }, "…": "…" },
    { "id": "…", "target": "rhymeDict", "bucket": "fixed",   "value": { "char": "長", "from": "ㄔㄤ2", "to": "ㄓㄤ3" }, "…": "…" },
    { "id": "…", "target": "rhymeDict", "bucket": "added",   "value": { "char": "長", "reading": "ㄓㄤˇ", "dict_key": "ㄓㄤ3", "tier": "normal" }, "…": "…" }
  ],
  "written": ["kvKey 已寫進 data 且已清空者…（上限 5000，滿了丟最舊）"]
}
```
**When to use:** 修正層的唯一儲存格式。每次寫入 `rev+1`、只 `put` 一次。
**對 CONTEXT C2 的說明：** C2 要求「與 overrides 同一套欄位、每筆帶 id／source_kvKeys／applied_at」。`removed`／`hidden` 在 data 檔裡是純字串陣列，無處放 id，所以**儲存**用扁平 entries（bucket 欄位對應 removed／hidden／fixed／added），**公開 view** 才是與 data 檔同形狀的 `wordlist:{removed,hidden,fixed,added}`／`rhymeDict:{…}`。這是 Claude's Discretion 範圍內的實作細節，欄位語意完全符合 C2。

### Pattern 2：公開 view（`GET /corrections.json`）
```json
{ "version": 1, "rev": 7,
  "wordlist":  { "removed": ["潛烈蟹"], "hidden": [], "fixed": { "X": "ㄅㄧˋ" }, "added": [ { "w": "平安", "z": "ㄆㄧㄥˊ ㄢ", "p": 1 } ] },
  "rhymeDict": { "removed": [], "hidden": [ { "char": "長", "dict_key": "ㄔㄤ2" } ], "fixed": [ { "char": "長", "from": "ㄔㄤ2", "to": "ㄓㄤ3" } ], "added": [] } }
```
- **不含** `id`、`source_kvKeys`、`written`、`applied_at`（C3：只回修正內容）。
- 推導規則：依 `applied_at` 順序走一遍，**同一主體後者勝**（wordlist 主體 = 詞；rhymeDict 主體 = `char|dict_key`，fixed 用 `char|from`）。被蓋掉的 entry 留在儲存裡（撤回後者時前者恢復），只是不進 view。
- 為什麼一定要在伺服器端解析：網站套用順序固定為 removed→hidden→fixed→added（見下），若不解析，「先 added X、後 removed X」會被 added 加回來，與時間順序相反。[VERIFIED: js/wordlist.js:365-388]

### Pattern 3：網站兩段式套用（同一支函式跑兩次）
**現況（已讀）：** `applyWordlistOverrides(list, live)` 抓 `data/wordlist-overrides.json`，用 `removedSet`／`hiddenSet` 過濾、`fixedMap[e.w]` 改注音、再依 `have` 集合去重加 `added`：
```js
// js/wordlist.js:357-359, 379-388（逐字引用）
const removedSet = new Set(ovr.removed || []);
const hiddenSet  = new Set(ovr.hidden  || []);
const fixedMap   = ovr.fixed  || {};
...
const have = new Set(filtered.map(e => e.w));
for (const a of added) {
    if (typeof a?.w !== 'string' || typeof a.z !== 'string' || !a.w || !a.z || a.z.includes('?')) continue;  // 缺注音或格式不對的跳過
    if (have.has(a.w)) continue;
    have.add(a.w);
    const entry = { w: a.w, z: a.z, p: a.p ?? 1 };
```
`js/dict.js:115-129`：removed／hidden 用 `it.dict_key`＋`it.char`；fixed 用 `it.from`（空 → 純新增）、`it.to`、`it.tier || 'normal'`；added 用 `a.dict_key`、`a.tier || 'normal'`。[VERIFIED: js/dict.js:115-129]

**改法（最小）：**
- `js/wordlist.js`：把迴圈本體抽成 `applyWordlistOverrideDoc(list, ovr)`（回傳新陣列、同時更新 `wordPriorityMap`／`wordPhoneticMap`），`applyWordlistOverrides` 先 `Promise.all([fetch base, loadCorrections()])`，再 `base → layer` 各 try/catch 一次（layer 壞掉保留 base 結果；base 壞掉仍要套 layer）。保留 `if (!live()) return list;` 檢查。
- `js/dict.js`：`applyRhymeDictOverrides` 目前 base 抓不到就 `return false`（`:111`），要改成「base 與 layer 各自可缺」；兩段都套完才回傳 `count > 0`，`init.js:7` 的 `buildIndex()` 仍只重建一次。
- 共用 `loadCorrections()`（放 `js/dict.js`，memoized Promise）：`fetch(WORKER_URL + '/corrections.json', { signal: AbortSignal.timeout(3000) })`；**不要**加 `cache: 'no-cache'`（那會讓 `max-age=60` 失效）；失敗 `lhWarn('修正層載入失敗', e)` 後回 `null`；驗形狀（`doc && typeof doc.wordlist === 'object'`），形狀不對一律當沒有。`WORKER_URL` 是 `ai-client.js:1` 的 top-level const，呼叫時（非解析時）才讀，載入順序不是問題。
- 注意 `tests/helpers.mjs:31-45` `routeExternal` 對 Worker 主機的**未知路徑**會回 `{candidates:[…]}` 形狀；若不加 `/corrections.json` 專用分支，網站會拿到「形狀不對」的 JSON — 驗形狀的程式必須吞得住它，且 Wave 0 要補一個回空 view 的分支。

### Pattern 4：寫回腳本的「冪等合併」語意
合併不讀 `data/wordlist.json`（它在 `.gitignore`，clone 下來沒有），也不做「對象是否存在」檢查——那是舊匯出腳本用來減少冗餘的，代價是腳本依賴一份不在 git 的 12.6 MB 檔。改用**最終狀態集合語意**（對同一份有序 entries 重播多次結果相同）：

| 輸入（依 `applied_at` 順序） | wordlist 檔的動作 | rhymeDict 檔的動作 |
|---|---|---|
| removed(w／char,dk) | `removed ∪ {w}`；從 hidden、fixed、added 移除 w | `removed` upsert（char,dk）；從 hidden、added 移除該 (char,dk) |
| hidden | `hidden ∪ {w}`；從 removed、fixed、added 移除 w | 同上對稱 |
| fixed | w 在 `added` 內 → 改該筆 z；否則 `fixed[w]=z`；並從 removed／hidden 移除 w | upsert 以 (char,from) 為鍵；從 removed／hidden 移除 (char,to) |
| added | `added` 以 w upsert（取代 z）；從 removed／hidden 移除 w | `added` 以 (char,dk) upsert；從 removed／hidden 移除 (char,dk) |

為什麼 added 一律進 `added`（即使該詞原本就在詞庫、只是被 removed 過）：若採「從 removed 拿掉就當還原、不寫 added」，第二次重跑時 removed 已空、added 也沒有 → 會多寫一筆 added，**第二次結果 ≠ 第一次**，違反 D2「重跑不會重複」。一律 upsert 到 added 在執行期是安全的（網站以詞去重：`have.has(a.w)`，[VERIFIED: js/wordlist.js:379-383]），唯一代價是資料檔多一筆冗餘 added 與 `p` 預設 1。
- 格式：沿用舊匯出腳本的自訂排版（removed／hidden 每行 10 個、fixed 逐詞換行、obj 陣列逐筆一行）。**已實測**：把它的 `_fmt_*` 寫法套到目前 `data/wordlist-overrides.json` 與 `data/rhyme-dict-overrides.json`，輸出與現有檔案**逐位元組相同**（避免第一次寫回就產生整檔 diff）。`updated_at` 只在內容真的變了才更新（否則重跑會改檔）。
- 審計：沿用 `data/applied-changes.log`（已被 git 追蹤，[VERIFIED: git ls-files data → data/applied-changes.log]）；每行含 entry `id`，**寫入前先檢查 id 是否已在 log 內**，重跑不重複記。

### Pattern 5：「線上已生效」確認 = `merge(live, batch) == live`
- `live` = 輪詢抓回來的兩個 JSON；`batch` = 這次快照的 entries（含 ids）。對 `live` 的深拷貝再跑一次同一個 `merge()`，若結果與 `live` 相等（忽略 `updated_at`）→ 這批已完全包含在線上。因為 merge 是冪等的，這個判斷不需要任何狀態，也不怕別人在中間又推了別的修改。
- 輪詢：每 30 秒一次（`--poll-interval` 可調，測試設 0.05），URL 帶 `?cb=<time>`（無害但**不可依賴**，見 Pitfall 3），逾時 → 退出碼非 0、不清空。
- 清空：`POST /corrections/clear {ids, baseRev}`，只刪這批 ids；Worker 把被刪 entries 的 `source_kvKeys` 併入 `written`。回 409（rev 不符）→ 腳本重抓 admin.json 取最新 rev、**ids 不變**再試一次。

### Pattern 6：Admin 狀態由修正層推導
```
報告 R 的顯示狀態：
  R.status 無         → 待審
  R.status=agreed 且 R.kvKey ∈ 任一 entries[].source_kvKeys  → 已上線（可撤回）
  R.status=agreed 且 R.kvKey ∈ written                       → 已寫入資料檔（無撤回；歸在「已上線」篩選，標「✓ 已寫入資料檔」）
  R.status=agreed 其餘                                       → 已核准、未套用
  dismissed／archived 照舊
```
- 撤回 = 從 entries 刪掉該 id（1 次 KV 寫入）；報告 KV 不動（C2 括號內「把來源回報狀態改回已核准、未套用」由推導自動達成）。
- `action.type === 'note'` 不產生 entry（見 Pitfall 7）；admin 要把它視為「已核准且不需套用」，否則會永遠卡在「已核准、未套用」。
- UI-SPEC §4.5 的狀態表沒有「已寫入資料檔」這一列，屬小缺口，建議併入「已上線」篩選、只是不顯示撤回鈕（見 OQ3）。

### Pattern 7：Worker 寫入路徑（rev 樂觀鎖）
```js
// 概念（非最終碼）：所有寫入路由共用
const doc = await loadDoc(env);                 // get('corrections:v1',{cacheTtl:30}) → JSON.parse；null → 空文件
if (body.baseRev !== doc.rev) return json(409, { ok:false, code:'REV_MISMATCH', rev: doc.rev, message:'線上修正層剛剛有變動，請重新讀取後再試' }, origin, env);
...改 entries...
doc.rev += 1; doc.updated_at = new Date().toISOString();
await env.AI_STATE_KV.put('corrections:v1', JSON.stringify(doc));   // 每次操作只寫 1 次
return json(200, { ok:true, rev: doc.rev, … }, origin, env);        // 回傳新 rev，client 不必再讀
```
- 同一個 key 免費方案每秒最多 1 次寫入（[CITED: developers.cloudflare.com/kv/platform/limits/]）：連點套用→撤回可能讓 `put` 丟例外；catch 後回 503 白話訊息「儲存太快了，請等一秒再試」，admin 在 busy 期間鎖按鈕（UI-SPEC 已要求）。
- 讀取過期風險：KV 邊緣快取最久 60 秒未過期時，同一據點的 `get` 可能讀到舊版（[CITED: developers.cloudflare.com/kv/concepts/how-kv-works/]）。`baseRev` 在「client 剛收到前一次寫入回應、緊接著第二次寫入」這個最常見路徑上能擋住（舊版 rev 較小 → 409）。殘餘風險：腳本與 Worker 兩次讀取都讀到同一份舊快取。因為腳本在輪詢 ≥ 30 秒後才 clear，實務上 KV 快取早已過期；就算發生，被洗掉的 entry 會顯示為「已核准、未套用」，Andy 可重新套用（Pitfall 4）。

### Anti-Patterns to Avoid
- **為了標「已上線」逐筆回寫報告 KV：** 日額 1,000 次寫入很快燒光，且與修正層非原子。用推導。
- **相信 client 送來的 action：** `/corrections/apply` 只收 `kvKeys`，由 Worker 讀 `USER_FEEDBACK_KV` 內 `status==='agreed'` 的報告再轉。
- **`cache: 'no-cache'` 抓 `/corrections.json`：** 每次載入都回源，抵銷 `max-age=60`，也多吃 KV 讀取。
- **寫回腳本依賴 `data/wordlist.json`：** 它被 gitignore，clone 後不存在。
- **依賴 `?cb=` 繞過 Pages CDN：** 實測不吃 query（Pitfall 3）。
- **在 admin 用 `esc()` 把使用者字串塞進 `onclick="…('${…}')"`：** HTML 跳脫後的 `&#39;` 會在屬性解碼後變回 `'`，仍可跳出 JS 字串（現有 `defaultValue:'${esc(r.reading||'')}'`，admin/index.html:871 附近）。一律 `data-*`＋事件委派。

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 請求本文大小限制 | 自己數位元組 | 既有 `readBodyCapped(request, max)`（`index.js:42`） | 已處理 Content-Length 說謊與串流；新路由用 16 KB 上限 |
| 限流 | 新計數器 | 既有 `isRateLimited(request, env, prefix)`（`index.js:86`） | 沒綁定就放行；後台寫入路由有金鑰，不需要再限流 |
| 預檢／CORS | 每個路由自己加標頭 | 既有 `corsHeaders`／`json()`（`index.js:23,32`） | 新路由用 `json()`，才會跟著 `ALLOW_LOCAL_ORIGIN` 本機開關走；舊的 `feedbackJson` ACAO 寫死正式網站 |
| 注音格式驗證 | 新正規式 | 照搬 `isValidZhuyin` 規則 `^[ㄅ-ㄩ]+[ˊˇˋ˙]?$`＋音節數（admin/index.html:410-416；舊匯出腳本 `_valid_z`） | 三處（Worker、Python、admin）用同一條規則，並放進共用測試向量 |
| 資料檔排版 | 新的 JSON dump | 舊匯出腳本的 `_fmt_str_array／_fmt_obj_array／_fmt_str_dict`（已證實可逐位元組還原現有檔） | 不產生整檔 diff |
| 寫回前的格式預設 | 重寫 action→entry 全部邏輯 | 以 `ACTION_LABEL` 的 11 種 type 為準（admin/index.html:335-347）逐一映射 | 見下表 |
| HTTP 輪詢測試 | 真實網路 | `http.server.ThreadingHTTPServer` 綁 127.0.0.1（`tools/lexicon/tests/__init__.py` 的保護只放行本機） | 離線可測 |
| 唯一 id | 自訂雜湊 | `crypto.randomUUID()`（Workers 與 Node ≥ 19 皆有）或沿用 `Date.now()_隨機` 風格 | KV key 風格一致 |

**action → entry 對照（以 admin `buildAction()` 與 ACTION_LABEL 為準）：**

| action.type | target／bucket | entry.value |
|---|---|---|
| `hide_word` | wordlist／hidden | `word` |
| `remove_word` | wordlist／removed | `word` |
| `fix_word_reading` | wordlist／fixed | `{ w: word, z: new_z }` |
| `manual_add_word` | wordlist／added | `{ w: word, z, tier: tier||'normal', source: 'manual' }` |
| `accept_ai_word` | wordlist／added | `{ w: word, z, tier: 'normal', source: 'ai_accept' }` |
| `modify_ai_word` | wordlist／added | `{ w: modified, z, tier: 'normal', source: 'ai_modify', original }` |
| `hide_char_reading` | rhymeDict／hidden | `{ char, dict_key, reading }` |
| `remove_char_reading` | rhymeDict／removed | `{ char, dict_key, reading }` |
| `fix_char_reading` 且 `old_dict_key` 非空 | rhymeDict／fixed | `{ char, from: old_dict_key, to: new_dict_key }` |
| `fix_char_reading` 且 `old_dict_key` 空 | rhymeDict／added | `{ char, reading: new_reading, dict_key: new_dict_key, tier: to_tier||'normal' }` |
| `manual_add_reading` | rhymeDict／added | `{ char, reading: new_reading, dict_key: new_dict_key, tier: to_tier||'normal' }` |
| `note` | （不產生 entry） | — |

**Key insight:** 這個 phase 的難點是「同一套語意在三個地方（Worker view、網站套用、Python 合併）各實作一次」。三種語言無法共用程式碼，所以**共用測試向量**（`tests/fixtures/corrections-vectors.json`：有序 entries → 預期的最終集合狀態）是唯一能防分岔的手段；JS 規格與 Python unittest 都載入同一份。

## Runtime State Inventory

> 本 phase 不是改名／重構，但它**新增了跨系統的持久狀態**；列出以免漏掉驗收與清理。

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | 新：`AI_STATE_KV['corrections:v1']`（Worker KV，部署後才存在）。既有：`USER_FEEDBACK_KV` 回報（不改動其結構，只新增欄位 `note`；舊回報照常顯示）。無新增 localStorage／IDB 鍵（A4） | 無資料遷移；文件不存在時一律當空層 |
| Live service config | Worker 尚未正式部署（Phase 2 待 Andy）。`USER_REPORT_KEY` secret 已在 DEPLOY.md 步驟 5 規劃；本 phase 不新增 secret | 部署順序寫進 DEPLOY.md：Worker 先於 main 部署（舊後台仍用 `?key=`） |
| OS-registered state | 無 | 無 |
| Secrets/env vars | 寫回腳本讀環境變數（建議名 `LH_ADMIN_KEY`；CONTEXT D4 只說「環境變數」未指名，屬 discretion）；後台金鑰仍在瀏覽器 localStorage `haoYunQi_admin_key`（既有） | 腳本不印、不寫檔；`worker-config.spec` 掃「金鑰樣式」不得被新檔誤觸 |
| Build artifacts | 無；唯一要小心的是 `tools/` 下不可留 `__pycache__` | 一律 `python3 -B`；新規格比照 `lexicon-build.spec` 檢查 |

## Common Pitfalls

### Pitfall 1：KV 單 key 寫入頻率與「連點」
**What goes wrong:** 套用後立刻撤回，第二次 `put` 在 1 秒內打到同一個 key。
**Why it happens:** 免費方案同 key 每秒最多 1 次寫入。[CITED: developers.cloudflare.com/kv/platform/limits/]
**How to avoid:** Worker 對 `put` 丟例外回 503＋白話訊息；admin 在 busy 時鎖按鈕、收到 503/409 後提示再按一次；測試用 FakeKV 模擬 put 丟例外。
**Warning signs:** admin 出現「套用沒有成功：伺服器回應 503」。

### Pitfall 2：每日額度是共用的（回報、決定、套用都在花）
**What goes wrong:** 以為套用只花 1 次寫入，實際一天的寫入預算被回報＋核准吃掉。
**預算（免費方案，[CITED] KV 限額頁：讀 100,000／寫 1,000／刪 1,000／list 1,000 每日，UTC 午夜重置；Workers 100,000 請求／日）：**

| 操作 | KV 寫入 | KV 讀取 | Worker 請求 |
|---|---|---|---|
| 使用者送 1 筆回報 | 1 | 0 | 1（＋預檢通常被瀏覽器快取） |
| 使用者一次送 20 筆（UI-SPEC D-09 上限） | 20 | 0 | 20 → **剛好等於限流器 20/分鐘上限**（`wrangler.toml` `limit = 20`、`period = 60`，key 前綴 `fb:`）；同一分鐘內第二次送出會吃 429，UI-SPEC 已定義 429 文案 |
| 後台核准／駁回 1 筆 | 1（`/reports/decision` 逐筆） | 1 | 1 |
| 後台核准一個 ×5 的合併列 | 5 | 5 | 5（B2 規定每筆都寫同一決定） |
| 套用 N 筆報告 | **1**（修正層）＋0（狀態推導） | N（讀報告）＋1（讀層） | 1 |
| 撤回／清空 | 1 | 1 | 1 |
| 每次有人開網站 | 0 | 1（`/corrections.json`，被瀏覽器 60 秒快取吸收後更少） | +1（目前已有 `/models` 1 個） |
| 後台重新載入 | 0 | 1 list ＋ N 讀 | 1 |

粗估：一天 3,000 次開站 → +3,000 讀取、+3,000 請求，離 100,000 還很遠；**不需要** isolate 記憶體快取。
**How to avoid:** 套用不要逐筆標報告（Pattern 6）；批次核准用有限併發（4 個）送 `/reports/decision`；在 DEPLOY.md 寫明額度。KV「快取命中是否也算一次讀取」官方定價頁**沒說**（[ASSUMED]：保守當作都算）；免費方案寫入額度是否跨 namespace 合計文件也沒說（[ASSUMED]：保守當作合計）。

### Pitfall 3：GitHub Pages CDN 不吃 query string，快取最久 10 分鐘
**What goes wrong:** 腳本用 `?cb=` 輪詢，以為每次都拿到最新，其實拿到 CDN 舊檔，要嘛永遠等不到、要嘛誤判。
**Why it happens / 證據：** 對 `https://pages.github.com/` 實測：`cache-control: max-age=600`；連打 `/`、`/?cb=<亂數>`×3，`age` 都是 210–211、`x-cache: HIT` — 不同 query 命中同一份快取。`Cache-Control: no-cache` 請求標頭也沒有繞過。對 Andy 的 `https://andy-coin.github.io/Lucky-Hawaii/…` 本機實測回 404（站台未發佈或路徑不同），所以**這是在別的 Pages 站上的實測，不是 Andy 站本身**。[VERIFIED: curl 2026-10-09，pages.github.com；Andy 站 404 無法直測]
**How to avoid:** 預設逾時 20 分鐘（建置最久 ~10 分＋CDN 最久 10 分，[CITED: GitHub support 存檔頁，二手；官方 docs 抓取 404]）、輪詢 30 秒；仍保留 `?cb=` 無害；逾時不清空、可重跑。網站本身用 `fetch(…, {cache:'no-cache'})` 對 CDN 做條件請求，CDN 舊檔期間使用者仍靠修正層看到修正，這正是「確認後才清空」的理由。
**Warning signs:** `--push` 後 20 分鐘仍 `merge(live,batch) != live`。

### Pitfall 4：RMW 與 lost update
**What goes wrong:** 兩個寫入者（兩個後台分頁，或腳本 clear 與後台套用同時）讀到同一版再各自寫回，後者覆蓋前者。
**Why it happens:** KV 無 CAS；邊緣快取最久 60 秒。
**How to avoid:** `baseRev` ＋ 409；admin 單人使用可接受；狀態由文件推導讓遺失可見可補。Wave 0 的 `FakeKV` 加「讀到舊版」模式（`staleOnce`），以測試證明：舊讀＋`baseRev` 較新 → 409。
**Warning signs:** admin 的「已上線」數字突然變少、回報退回「已核准、未套用」。

### Pitfall 5：預檢與 `X-Admin-Key`
**What goes wrong:** 後台改送自訂標頭後，瀏覽器先發 OPTIONS；`Access-Control-Allow-Headers` 若沒列 `X-Admin-Key`，真正的請求被瀏覽器擋掉。
**Why it happens:** `corsHeaders()` 現在是 `'Access-Control-Allow-Headers': 'Content-Type'`。[VERIFIED: worker/src/index.js:27]
**How to avoid:** 改成 `'Content-Type, X-Admin-Key'`，再加 `'Access-Control-Max-Age': '7200'`（減少預檢請求數；Chrome 上限 2 小時 [ASSUMED]）。後台與網站同一個 origin（`https://andy-coin.github.io`，`ALLOWED_ORIGIN` 在 `index.js:7`），不需要新增來源。`GET /reports.json` 以前是「簡單請求」不預檢，改帶 header 後會預檢——OPTIONS 由 `route()` 開頭統一處理（`index.js:241`），不受路由影響。
**Warning signs:** 瀏覽器主控台 "Request header field x-admin-key is not allowed by Access-Control-Allow-Headers"。
**測試限制（已實測）：** Playwright `route.fulfill` 不會讓預檢到達 route handler，也不強制 CORS（我用腳本確認：自訂 header 的 fetch 直接 200、route 只看到 GET）。所以預檢只能用 Node 單元測試斷言 `OPTIONS` 回應含 `X-Admin-Key`。

### Pitfall 6：空金鑰通過驗證
**What goes wrong:** `keyOk` 是 `url.searchParams.get('key') === env.USER_REPORT_KEY`（`index.js:133`）。若 secret 被設成空字串、請求也帶空 header，兩者相等。
**How to avoid:** 新增共用 `adminKeyOk(request, url, env)`：取 `request.headers.get('X-Admin-Key') ?? url.searchParams.get('key')`，**要求非空**才比對（`/health.json` 已有 `!key ||` 的寫法，`index.js:264`）。所有舊路由（/reports.json、/reports/decision、/reports/delete、/health.json、/health/run）都改走它；舊測試的 403 行為不變（金鑰錯或沒給）。ASVS L1 不要求常數時間比較，Node 沒有 `crypto.subtle.timingSafeEqual`，不要為此增加相依。

### Pitfall 7：`note` 動作與無效果核准
**What goes wrong:** 管理員核准一則 `note`，它不產生修正，卻永遠顯示「已核准、未套用」並讓「套用（m）」計數不歸零。
**How to avoid:** apply 回傳 `skipped:[{kvKey, reason:'no_effect'}]`；admin 計算 m 時排除 `note`。

### Pitfall 8：`/reports.json` 的 `list()` 只回前 1000 個 key
**What goes wrong:** `env.USER_FEEDBACK_KV.list()` 沒帶 cursor（`index.js:157`），KV 單次最多 1,000 key；報告超過 1000 筆後後台悄悄少顯示，而且一次 1,000 個 `get` 正好撞上單次 invocation 的 1,000 內部操作上限（[CITED: workers/platform/limits，內部服務子請求上限 1,000]）。
**How to avoid:** 本 phase 不必解，但後台合併讓大量歷史回報更常見——在 plan 加一個小任務：`list` 迴圈處理 `list_complete`／`cursor`，並在單次回應超過 800 筆時停止並回 `truncated:true`，admin 顯示「只載入最新 800 筆」。列為 OQ5（預設：加上限提示，不做分頁）。

### Pitfall 9：長按移除後的殘留
**What goes wrong:** 只刪 `touchstart` 計時器卻留著 `_charLongPressTimer` 等變數與 `touchcancel` 清理，或誤刪破音 chip 的長按。
**How to avoid:** 只移除 `js/report.js:117-136`（字卡）與 `js/ai-word-events.js:22-43`（AI 詞卡）；保留 `js/report.js:163-185`（破音 chip）。[VERIFIED: 已讀這三段原始碼]

### Pitfall 10：`postFeedback` 的回傳型別
**What goes wrong:** UI-SPEC 要求 429 要能分辨，若把 `postFeedback` 改成回 `{ok,status}`，`submitFeedback()` 裡的 `if (await postFeedback(…))` 永遠為真（物件恆真）→ 失敗也關視窗。[VERIFIED: js/report.js:224]
**How to avoid:** 新增 `postFeedbackRaw(data, {quiet})` 回 `{ok, status}`；`postFeedback = async d => (await postFeedbackRaw(d)).ok`，舊呼叫端與 `error-visibility.spec` 的行為完全不變。

### Pitfall 11：字卡點選區的「點空白取消選取」
`js/results.js:433-444`：點 `#resultsContainer` 空白處會清掉所有選取。🚩 按鈕在工具列（容器外），沒有衝突；但回報視窗**開著期間不可重新渲染結果**（UI-SPEC「Stale content：視窗用開啟當下的快照」）。

### Pitfall 12：舊 AI 詞卡的 inline `onclick="saveWord(…)"`
AI 詞卡以字串樣板輸出 `onclick="saveWord(${jsArg})"`（`js/ai-generate.js:8`，smoke.spec 靠這個掃 handler）。回報模式要攔截點擊，**不要改樣板**：在 `#aiWordsContainer` 加 **capture 階段**的 `click` 監聽，回報模式啟用時 `e.stopPropagation(); e.preventDefault()`——capture 在祖先上先於目標元素的 inline handler 執行，因此不會呼叫 `saveWord`。

## Code Examples

### 預檢與金鑰（Worker）
```js
// Source: worker/src/index.js:23-30 現況 → 建議改法（為什麼：自訂標頭會觸發預檢）
function corsHeaders(origin, env) {
    return {
        'Access-Control-Allow-Origin': originAllowed(origin, env) ? origin : ALLOWED_ORIGIN,
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
        'Access-Control-Max-Age': '7200',
        'Vary': 'Origin',
    };
}
// v2 移除 ?key=（B4）：新後台一律用 header，舊版快取頁面仍在用查詢字串
function adminKeyOk(request, url, env) {
    const k = request.headers.get('X-Admin-Key') ?? url.searchParams.get('key');
    return !!k && k === env.USER_REPORT_KEY;
}
```

### 公開 view（Worker，節錄）
```js
// 依 applied_at 順序走一遍，同一主體後者勝；回傳與 data/*-overrides.json 同形狀的物件
export function buildView(doc) {
    const wl = { removed: [], hidden: [], fixed: {}, added: [] };
    const rd = { removed: [], hidden: [], fixed: [], added: [] };
    const last = new Map();                       // 主體 → 最後一筆 entry
    for (const e of doc.entries) last.set(subjectOf(e), e);
    for (const e of last.values()) { /* 依 target／bucket 放進 wl／rd；wordlist.added 補 p:1 */ }
    return { version: 1, rev: doc.rev, wordlist: wl, rhymeDict: rd };
}
```
（`subjectOf`：wordlist = `w:` ＋ 詞；rhymeDict = `r:` ＋ `char|dict_key`，fixed 用 `char|from`。）

### 網站載入修正層（含逾時與形狀驗證）
```js
// 放在 js/dict.js；同一個 Promise 給 wordlist 與 rhymeDict 共用，只抓一次
let _corrP = null;
function loadCorrections() {
    if (_corrP) return _corrP;
    _corrP = fetch(WORKER_URL + '/corrections.json', { signal: AbortSignal.timeout(3000) })
        .then(r => (r.ok ? r.json() : null))
        .then(d => (d && typeof d.wordlist === 'object' && typeof d.rhymeDict === 'object' ? d : null))
        .catch(e => { lhWarn('修正層載入失敗', e); return null; });   // 離線／未部署／逾時：只記錄，不擋畫面
    return _corrP;
}
```

### 回報視窗的資料形狀（沿用既有欄位，新增 `note`）
```js
// 字卡：reading 由卡片的 data-key（例 'ㄔㄤ2'）還原成含聲調符號的注音（admin 的 readingToDictKey 的反函式）
// admin 用 readingToDictKey(reading) 才算得出 dict_key：tone 2–5 → ˊˇˋ˙，tone 1 → 無符號
postFeedbackRaw({ type: 'char-reading-report', char, reading, reportType: '極度冷僻', note });
postFeedbackRaw({ type: 'word-report', word, reportType: '不該出現', note });
// 讀音錯誤：使用者的說明放 suggested（admin 已會顯示並做 dispRead 正規化），其他原因放 note
```
`readingToDictKey` 現況：`TONE_MARK_TO_DIGIT = { 'ˊ': '2', 'ˇ': '3', 'ˋ': '4', '˙': '5' }`；末字是聲調符號 → 換數字，否則 `+ '1'`。[VERIFIED: admin/index.html:442-448]

### 寫回腳本骨架（重點在流程與退出碼）
```python
# 退出碼：0 成功／無事可做；2 抓不到修正層；3 合併或 git 失敗；4 線上確認逾時；5 清空失敗
def main(argv):
    key = os.environ.get('LH_ADMIN_KEY', '')            # 只從環境變數讀，不印、不寫檔
    layer = fetch_admin_doc(worker, key)                  # GET /corrections/admin.json，標頭 X-Admin-Key，自訂 User-Agent
    batch = layer['entries']; ids = [e['id'] for e in batch]; rev = layer['rev']   # 快照：之後新套用的不在 ids 內
    if not args.confirm_only:
        word, rhyme, changed = merge_all(load_files(), batch)   # 冪等；未改變 → changed=False
        print_diff(...)                                         # 預設 dry-run 到此為止
        if args.apply: write_files(); git_commit_only(files)    # git commit -- <路徑>，只提交這三個檔
    if current_branch != args.live_branch:                      # D3
        print('目前不在 main：已寫檔並 commit，不 push、不清空。合併到 main 後用 --confirm-only'); return 0
    if args.push: git_push(remote, branch)
    wait_until_live(site, batch, timeout, interval)             # merge(live,batch)==live，逾時 → 4
    clear_ids(worker, key, ids, rev)                            # 409 → 重抓 rev 再試一次
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 後台「匯出 agreed」→ 下載一次性 `apply_changes_*.py`（內嵌 actions、硬編 `/Users/Shared/Claude/Lucky Hawaii`，admin/index.html:1120）→ 手動跑 → 手動 commit | 套用到修正層（即時）→ `npm run corrections:writeback`（讀層、合併、commit、確認、清空） | 本 phase | 舊按鈕保留為備援到 v2（D1、D16） |
| `?key=` 查詢字串金鑰（會進瀏覽器歷史、日誌、Referer） | `X-Admin-Key` header | 本 phase | `?key=` 暫留相容，v2 移除 |
| admin 以 `onclick="exec('${k}',…)"` 拼字串 | `data-*`＋事件委派＋`textContent` | 本 phase | 消除屬性注入 |
| 長按字卡／詞卡開回報選單 | 批次工具列 🚩、AI 回報模式、桌機右鍵 | 本 phase | 長按讓給 Phase 8／9 拖曳 |

**Deprecated/outdated:** `admin/woker.js`（gitignored 舊 Worker 副本，已被 `worker/src` 取代）；舊匯出腳本內的 `word_exists`（依賴 gitignored 的 `data/wordlist.json`）。

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Python `urllib` 預設 User-Agent（`Python-urllib/3.x`）可能被 Cloudflare 瀏覽器完整性檢查擋掉（error 1010），所以腳本應自訂 UA | Pattern 4／Code Examples | 低：自訂 UA 無害；不設可能在真實部署時 403 |
| A2 | Andy 的 GitHub Pages 站（`https://andy-coin.github.io/Lucky-Hawaii/`，來源 README.md:38）行為與 pages.github.com 相同（max-age=600、快取鍵不含 query）。本機 curl 該網址回 404，無法直測 | Pitfall 3 | 中：若實際有繞過方法，逾時可以較短；若更慢，需要更長逾時 |
| A3 | Pages「建置＋CDN 傳播」總計最久約 10–20 分鐘（官方 docs 抓取 404，採二手存檔文字） | Pitfall 3、OQ1 | 中：決定預設逾時（建議 20 分鐘） |
| A4 | KV 的邊緣快取命中仍計入「每日讀取」額度（官方定價頁未說明） | Pitfall 2 | 低：只影響預算估算的保守程度 |
| A5 | 免費方案 KV 每日 1,000 次寫入是帳號層級合計，不分 namespace | Pitfall 2 | 低：預算已按合計算 |
| A6 | Chrome 預檢快取上限 7200 秒（Firefox 24 小時）；`Access-Control-Max-Age: 7200` 因此是合理值 | Pitfall 5 | 低：只影響預檢次數 |
| A7 | 500 筆 entries（~125 KB）的 `JSON.parse` 在免費方案 10 ms CPU 限額內 | Pattern 1 | 低中：若超限，Worker 會 1102；因此硬上限建議 2,000 筆並在 apply 時拒絕超過者 |
| A8 | 預設環境變數名 `LH_ADMIN_KEY`（CONTEXT D4 未指名） | Runtime State | 低：可改名 |
| A9 | 寫入端的 entries 硬上限 2,000、`written` 上限 5,000、單次 apply 最多 100 個 kvKeys、Worker 讀 body 上限 16 KB — 皆為研究者建議值，非 CONTEXT 決定 | Pattern 1／7 | 低：planner 可調 |

## Open Questions

1. **OQ1 輪詢逾時：CONTEXT D2 寫「最多 10 分鐘」，但 Pages 建置＋CDN 最壞可能 ~20 分鐘。**
   - What we know: CDN `max-age=600` 且不吃 query（實測）；建置自身也要 1–2 分鐘。
   - What's unclear: Andy 站實際行為（本機打不到）。
   - **Recommendation（預設）：** 預設 20 分鐘、輪詢 30 秒，`--timeout` 可調；逾時訊息明說「不是壞掉，CDN 還沒更新，過幾分鐘用 `--confirm-only` 重跑」。
2. **OQ2 「約 1 分鐘內生效」文案可能低估。** KV 邊緣快取（≤60 秒，另加傳播）＋瀏覽器 `max-age=60` 兩層相加，最壞約 2 分鐘。
   - **Recommendation：** Worker 公開讀取用 `cacheTtl: 30`（KV 允許的最小值，[CITED: kv/api/read-key-value-pairs]）、`Cache-Control: max-age=60`（C3 鎖定）→ 最壞約 90 秒；UI-SPEC 的提示文字改成「約 1～2 分鐘內生效」。若 Andy 堅持原文案，不影響功能。
3. **OQ3 UI-SPEC 缺「已寫入資料檔」狀態。** 修正層清空後，報告在 `written[]` 內，不能再顯示「已上線＋撤回」，也不該退回「已核准、未套用」。
   - **Recommendation：** 併入「已上線」篩選、顯示「✓ 已寫入資料檔」、無撤回鈕；計入 stats 的「已上線」。
4. **OQ4 `hidden` 與 `removed` 在網站端效果相同**（兩者都過濾掉；[VERIFIED: js/wordlist.js:366, js/dict.js:115]）。差別只是語意。
   - **Recommendation：** 保留兩個 bucket（與 data 檔一致），不另外處理。
5. **OQ5 `/reports.json` 超過 1000 筆的處理（Pitfall 8）。**
   - **Recommendation（預設）：** 本 phase 加 `list` 分頁迴圈＋上限 800 筆＋`truncated` 提示，不做真正的分頁 UI。
6. **OQ6 「連鎖修正」（同一字先 fixed 後又 removed 目標）的語意。** 舊匯出腳本有一套「互消」規則（撤銷 fixed 回原始）；本研究的集合語意較簡單且冪等。
   - **Recommendation：** 採簡單版，並在共用測試向量裡寫明預期；真正出現連鎖時，admin 的「有效讀音」（`getEffectiveReadings`）會讓 Andy 看到結果再決定。後台 `getEffectiveReadings`（admin/index.html:313-326）目前只讀 base overrides，建議同時併入修正層（小任務）。
7. **OQ7 Pages 發佈分支。** CONTEXT 說線上網站來自 `main`；本機 `git branch -a` 看得到 `main`、`gsd/v0.96-stabilize`，遠端分支清單這次沒有查成（本機沒有 `timeout` 指令，`git ls-remote` 根本沒執行；且 handoff.md 說這台對 GitHub 的認證不能用）。
   - **Recommendation：** 腳本提供 `--live-branch`（預設 `main`）；Human check 時請 Andy 確認 Pages 設定。
8. **OQ8 一次送 20 筆正好等於限流上限（20/分鐘）。** UI-SPEC D-09 已鎖 20。
   - **Recommendation：** 維持 20，但驗收腳本與提示文案要涵蓋「第二次送出吃 429」；不改限流設定。

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Playwright、`worker:smoke`、本機 Worker 轉接 | ✓ | v26.8.1 | — |
| Playwright + Chromium | 全部瀏覽器規格 | ✓（spike 腳本成功啟動 HeadlessChrome 153） | 1.63.0 | — |
| wrangler / workerd | `worker:smoke`、`worker:check` | ✓ | 4.147.0；`@cloudflare/workerd-darwin-64` 存在 | 不放進每次 commit 的快速迴圈 |
| Python 3 | 寫回腳本與 unittest | ✓ | 3.13.15 | — |
| git | 寫回腳本、本機 bare repo 測試 | ✓ | 2.55.0 | — |
| 能 push 到 GitHub | 真實 `--push` | ✗（handoff.md：SSH 下鑰匙圈鎖住，Andy 自己 push） | — | 測試一律用本機 bare repo 當 remote；真實 push 列入 Human check |
| 已部署的 Worker／KV | 真實端到端 | ✗（Phase 2 待 Andy） | — | `bridgeWorker`（真 Worker 程式碼＋FakeKV）、`wrangler dev`（本機 KV） |
| 能打到 `andy-coin.github.io/Lucky-Hawaii/` | 驗證 Pages 快取行為 | ✗（本機 curl 回 404） | — | 以 pages.github.com 的實測代替（見 Pitfall 3），Human check 時再驗 |

**Missing dependencies with no fallback:** 無（所有自動驗證都能離線完成）。
**Missing dependencies with fallback:** 真實 push／真實 Worker／Andy 站快取行為 → 本機模擬＋Human check。

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright Test 1.63.0（Node 與瀏覽器規格）＋ Python `unittest`（透過 Playwright 規格 spawn，仿 `tests/lexicon-build.spec.mjs`）＋ `worker/test/dev-smoke.mjs`（真 workerd） |
| Config file | `playwright.config.mjs`（`testDir: 'tests'`、`fullyParallel: true`、`retries: 0`、webServer `node tests/serve.mjs` 在 127.0.0.1:4310）；Python 無設定檔 |
| Quick run command | `npx playwright test tests/worker-corrections.spec.mjs tests/corrections-site.spec.mjs` ＋ `npm run corrections:test` |
| Full suite command | `npm test`（目前基準：423 過／27 跳過／0 失敗，見 handoff.md；新規格都併入此指令） |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FB-01 | 批次工具列有第 4 顆 🚩，0 選取 → `aria-disabled` ＋ toast、不開視窗；≥1 選取 → 開視窗 | 瀏覽器 | `npx playwright test tests/report-entry.spec.mjs -g "工具列"` | ❌ Wave 0 |
| FB-01 | 冷搜尋 → 點卡 → 🚩 → 選原因 → 送出：恰好 1 個 `/feedback` body，`reportType` 正確（4 次點擊） | 瀏覽器 | `… -g "步驟數"` | ❌ Wave 0 |
| FB-01 | `.char-card`／`.ai-word-card` 長按 600 ms 不開任何選單；`.poly-chip` 長按仍開；右鍵選單第一項是「🚩 回報…」 | 瀏覽器 | `… -g "長按"` | ❌ Wave 0 |
| FB-01 | AI 回報模式：閒置點卡 = 存入保留；回報模式點卡不呼叫 `saveWord`；0 張卡時列隱藏 | 瀏覽器 | `… -g "AI 回報模式"` | ❌ Wave 0 |
| FB-01 | 防重複（同詞同因只送一次、重載可再送）、不新增 localStorage 鍵（`lhKeys` 數量不變） | 瀏覽器 | `… -g "防重複"` | ❌ Wave 0 |
| FB-01 | 失敗：500 保留視窗與說明；429 文案；第 3 筆失敗 → 前 2 筆標「已回報過」 | 瀏覽器 | `… -g "失敗"` | ❌ Wave 0 |
| FB-01 | 觸控尺寸／390×844、820×1180、1440×900、1180×820 觸控、縮放 100／150；`#reportNote` ≥ 16px | 瀏覽器 | `… -g "版面"`（沿用 `auditTouchTargets`） | ❌ Wave 0 |
| FB-01 | 舊測試更新（見下節）仍全過 | 瀏覽器 | `npx playwright test tests/layout.spec.mjs -g "選單"` | ✅ 需改 |
| FB-02 | 3 筆同詞同因 → 1 列 ×3、最早／最新時間、展開 3 筆原文；不同 `reportType` 分列；feedback／ai-word-suggest 不分組 | 瀏覽器（admin＋bridgeWorker） | `npx playwright test tests/admin.spec.mjs -g "合併"` | ❌ Wave 0 |
| FB-02 | 全選目前篩選結果＋批次核准：太冷僻 → hide、不該出現 → remove，讀音錯誤／其他略過並回報略過數；全略過訊息 | 瀏覽器 | `… -g "批次"` | ❌ Wave 0 |
| FB-02 | 後台 XSS：word = `<img src=x onerror=alert(1)>` 以純文字顯示；靜態掃描無 `onclick="…('${`；`X-Admin-Key` 標頭帶出（攔截請求斷言），無 `?key=` | 瀏覽器＋靜態掃描 | `… -g "XSS"`、`… -g "金鑰標頭"` | ❌ Wave 0 |
| FB-02 | 手機 390px：套用列堆疊、控制項 ≥ 44px、`.batch-bar` 貼底、無橫向捲動 | 瀏覽器 | `… -g "手機"` | ❌ Wave 0 |
| FB-03 | Worker：apply 讀已核准報告→entries、驗證注音、拒絕未核准／已套用、`put` 恰 1 次、回傳新 rev | Node（FakeKV） | `npx playwright test tests/worker-corrections.spec.mjs -g "apply"` | ❌ Wave 0 |
| FB-03 | Worker：公開 view 欄位與 data 檔同形、不含 id／source_kvKeys／written；非網站來源 403；`Cache-Control: max-age=60`；`Vary: Origin` | Node | `… -g "公開"` | ❌ Wave 0 |
| FB-03 | Worker：金鑰 header／query 兩種都通過、空金鑰一律 403、`OPTIONS` 的 `Access-Control-Allow-Headers` 含 `X-Admin-Key`；舊 `worker-admin.spec.mjs` 全過 | Node | `… -g "金鑰"`、`npx playwright test tests/worker-admin.spec.mjs` | ✅ 舊／❌ 新 |
| FB-03 | rev：舊 rev → 409；FakeKV 讀到舊版仍不遺失；`put` 丟例外 → 503 且文件不變 | Node | `… -g "rev"` | ❌ Wave 0 |
| FB-03 | 網站：修正層在 base 之後套用（removed／hidden／fixed／added 與每包去重）；`fetch` 失敗／逾時 3 秒／形狀不對 → 略過且有 `[好韻器] 修正層載入失敗` 記錄、搜尋正常 | 瀏覽器 | `npx playwright test tests/corrections-site.spec.mjs` | ❌ Wave 0 |
| FB-03 | 兩段式順序：base removed X ＋ layer added X → X 回來；layer 先 added 後 removed 同詞 → 不在 | 瀏覽器＋共用向量 | `… -g "順序"` | ❌ Wave 0 |
| FB-04 | 撤回 by id：entry 消失、報告顯示「已核准、未套用」、`written` 不動；撤回後者 → 前者恢復 | Node＋admin 瀏覽器 | `… -g "revoke"`、`tests/admin.spec.mjs -g "撤回"` | ❌ Wave 0 |
| FB-04 | admin 套用→列變「已上線」→撤回→回「已核准、未套用」；apply bar 數字更新；> 500 筆黃色提示且套用仍可按 | 瀏覽器 | `tests/admin.spec.mjs -g "套用"` | ❌ Wave 0 |
| FB-04/03 | 真 workerd＋本機 KV 的 apply→GET /corrections.json→revoke 流程 | 冒煙 | `npm run worker:smoke`（擴充 `worker/test/dev-smoke.mjs`） | ✅ 需擴充 |
| FB-05 | Python：合併冪等（跑兩次第二次無變動、不改檔、log 不重複）、排版逐位元組還原現有檔、共用向量、驗證失敗即停 | unittest | `npm run corrections:test` | ❌ Wave 0 |
| FB-05 | Python：預設 dry-run 不寫檔；`--apply` 才寫＋commit（`git commit -- <路徑>`，不帶其他變更）；非 `main` 不 push 不清空；髒工作樹中止 | unittest（暫存 git repo） | `npm run corrections:test` | ❌ Wave 0 |
| FB-05 | 確認法：`merge(live,batch)==live` 才清；逾時 → 不清、非 0 退出；清空只含這批 ids（輪詢期間新套用的保留）；clear 409 → 重試一次 | unittest（127.0.0.1 假 Worker＋假「線上站」） | `npm run corrections:test` | ❌ Wave 0 |
| FB-05 | 端到端：真 Worker 程式（Node http 轉接＋FakeKV）＋本機 bare repo（含延遲的「Pages」）＋真腳本；重跑不重複、不遺失；金鑰不出現在輸出 | Playwright 規格 spawn | `npx playwright test tests/corrections-writeback.spec.mjs` | ❌ Wave 0 |
| FB-05 | `tools/` 無 `__pycache__`；`worker-config.spec` 金鑰樣式掃描不誤觸 | Node | `npx playwright test tests/corrections-writeback.spec.mjs tests/worker-config.spec.mjs` | ❌／✅ |
| 全部 | split-tags：`?v=` 全標籤一致（0.96.9 → 下一版）；scan.spec 無吞錯 catch；smoke.spec 每個新 inline handler 在乾淨環境點一次不丟錯；style.spec 無新 hex | Node／瀏覽器 | `npx playwright test tests/split-tags.spec.mjs tests/scan.spec.mjs tests/smoke.spec.mjs tests/style.spec.mjs` | ✅ |

**需更新的既有測試（斷言了舊行為）：**
- `tests/layout.spec.mjs:1876-1905` 「選單：放大 150% 時右鍵／長按選單不跑出畫面」：手機分支對「字卡選單」與「AI 詞卡選單」做 `touchstart` 長按 650 ms 並斷言選單出現——長按移除後會失敗。修法：手機分支只保留破音 chip（`polyChipCtxMenu`）長按；字卡／AI 詞卡兩種選單在手機也改用 `fireContext`（`contextmenu` 事件）驗證四個角落與 `.word-ctx-item` 高度 ≥ 43.5；桌機分支不變，但選單多了第一項「🚩 回報…」。[VERIFIED: tests/layout.spec.mjs:1876-1905 已讀]
- `tests/layout.spec.mjs:253,294`（`#batchPanel .batch-btn >> nth=0..2`）與 `:1635`、`:1742`（`.batch-btn` 高度）：新增第 4 顆後仍成立，但建議把 🚩 加進 `:294` 的觸控檢查清單；`:1742` 的高度斷言會自動涵蓋新按鈕（需 ≥ 44 於觸控）。
- 頁首「回報」→「意見」（UI-SPEC D-10）：測試用的是選擇器 `button.feedback-btn`／`.settings-feedback-btn`／函式 `openFeedbackModal()`（`layout.spec.mjs:463,1730`、`error-visibility.spec.mjs:123-145`），**沒有斷言文字「回報」**——不會壞；但 `index.html:135,192` 與任何驗收清單文字要同步改。
- `tests/helpers.mjs:31-45` `routeExternal`：加 `/corrections.json` 專用分支（回空 view），避免網站拿到 `{candidates…}`。
- `tests/worker-helpers.mjs` `FakeKV`：目前 `get(k)` 只收一個參數、無 `list_complete`；擴充 `get(k, opts)`（忽略）、`put` 可注入例外、`staleOnce` 模式（下一次 get 回舊值）、`list()` 回 `list_complete: true`。
- `core-node.spec.mjs:59-60`、`wordlist-cache.spec.mjs`、`lexicon-packs.spec.mjs` 對 overrides 的 stub 不受影響（新增的是不同主機的請求）；但凡是斷言「沒有未 mock 外部請求」的情境（smoke）都因 `routeExternal` 已涵蓋 Worker 主機而安全。

### Sampling Rate
- **Per task commit:** `npx playwright test <該任務對應的單一規格>`（Node-only 規格約數秒；瀏覽器規格約數十秒）＋ `npm run corrections:test`（若動到 Python）
- **Per wave merge:** `npx playwright test tests/worker-*.spec.mjs tests/corrections-*.spec.mjs tests/report-entry.spec.mjs tests/admin.spec.mjs tests/split-tags.spec.mjs tests/scan.spec.mjs tests/smoke.spec.mjs`
- **Phase gate:** `npm test` 全綠（基準 423 過／27 跳過／0 失敗）＋ `npm run worker:smoke` ＋ `npm run worker:check` 後再 `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/fixtures/corrections-vectors.json` — 有序 entries → 預期最終狀態，JS view builder 與 Python replay 共用（FB-03、FB-05）
- [ ] 擴充 `tests/worker-helpers.mjs` 的 `FakeKV`（`get` 選項、`put` 例外注入、`staleOnce`、`list_complete`）
- [ ] `tests/helpers.mjs` `routeExternal` 加 `/corrections.json`；新增 `bootAdmin(browser, {env, reports})`（`newContext` ＋ `routeExternal` ＋ `bridgeWorker`，env 加 `ALLOW_LOCAL_ORIGIN: '1'`，localStorage 預放 `haoYunQi_admin_key`）
- [ ] `tests/worker-corrections.spec.mjs`、`tests/corrections-site.spec.mjs`、`tests/report-entry.spec.mjs`、`tests/admin.spec.mjs`、`tests/corrections-writeback.spec.mjs`
- [ ] `tools/corrections/tests/__init__.py`（照抄 `tools/lexicon/tests/__init__.py` 的連線保護）、`test_merge.py`、`test_writeback.py`、`test_format.py`
- [ ] `package.json` 兩個 script（`corrections:writeback`、`corrections:test`）
- [ ] 擴充 `worker/test/dev-smoke.mjs`（apply／public／revoke）

*Framework install: none — 全部沿用既有工具。*

## Security Domain

`security_enforcement` 啟用（`.planning/config.json`：`"security_enforcement": true`、ASVS level 1、`security_block_on: "high"`）。

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes（後台金鑰） | 共用 `adminKeyOk()`：header 優先、`?key=` 暫留；**非空**才比對；金鑰不進日誌、不印、不寫檔；v2 移除 query 版本 |
| V3 Session Management | no（無工作階段，金鑰存後台 localStorage，既有） | — |
| V4 Access Control | yes | 所有 `/corrections/*` 寫入與 `admin.json` 需金鑰、只收規定的 HTTP 方法；公開 `GET /corrections.json` 只回修正內容；apply 以伺服器端讀到的 `status==='agreed'` 報告為準 |
| V5 Input Validation | yes | `readBodyCapped(…, 16384)`；JSON 形狀逐欄驗證（kvKeys 陣列長度 ≤ 100、字串長度、注音正規式與音節數、`dict_key` 正規式 `^[ㄅ-ㄩ]+[1-5]$`、詞長 1–20 且無控制字元／`<>"'\`）；Python 在寫入 git 前再驗一次；admin 以 `textContent`／`esc()` 輸出 |
| V6 Cryptography | no（不自製；`crypto.randomUUID()` 僅用於 id） | — |
| V7/V8 Error handling / Data protection | yes | Worker 錯誤回白話訊息、不洩漏內部細節；公開 view 不含報告原文與 KV 鍵 |
| V13 API | yes | CORS 白名單沿用 `originAllowed`；預檢 `Allow-Headers` 精確列出 `Content-Type, X-Admin-Key` |

### Known Threat Patterns for 這個 stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| 使用者回報內容 XSS（admin 以 innerHTML 拼）| Tampering／Elevation | 全部 `textContent`；移除 `onclick` 拼接；靜態掃描測試守 |
| 屬性內 JS 字串注入（`esc()` 後仍可 `'` 跳出）| Tampering | `data-*`＋事件委派（B5） |
| 竄改 apply 內容（client 送惡意 action）| Tampering | apply 只收 kvKeys，伺服器端讀 KV 內已核准報告；輸出格式再驗 |
| 惡意回報污染 data 檔（寫回腳本把使用者字串寫進公開 repo）| Tampering | 人工核准是第一道；Worker 與 Python 兩層格式驗證；寫入用 `json.dumps` |
| 金鑰洩漏（URL 進歷史／日誌／Referer）| Information disclosure | header 取代 query；腳本只讀環境變數；不印 URL 帶金鑰（腳本用 header，URL 本身無金鑰） |
| 暴力猜金鑰 | Spoofing | 金鑰長度由 Andy 決定；Worker 無額外鎖定（ASVS L1 可接受），可沿用 AI_LIMITER 另開 `adm:` 前綴（選配，不在本 phase 範圍） |
| CORS 設定過寬 | Information disclosure | 不用 `*`；沿用單一正式來源＋本機開關（`ALLOW_LOCAL_ORIGIN` 只能從 `--var` 進來，`worker-config.spec` 守） |
| 額度耗盡型濫用（刷 `/feedback`、刷 `/corrections.json`）| Denial of service | `/feedback` 既有限流＋8 KB；公開讀取只限網站來源＋60 秒快取；寫入需金鑰 |
| 寫回腳本誤 push／誤提交 | Tampering | 預設 dry-run；`--push` 才 push；非 live 分支永不 push／清空；`git commit -- <路徑>` 只含兩個資料檔與 log；髒工作樹中止；不使用 `shell=True`；`GIT_TERMINAL_PROMPT=0` 避免卡住 |

## Sources

### Primary (HIGH confidence)
- 本 repo 程式碼（本次 session 以 Read 讀過）：`worker/src/index.js`（全檔 1–275）、`worker/wrangler.toml`、`admin/index.html`（L290–670、L831–945、L1035–1640 含 `ACTION_LABEL`／`buildAction`／`exportChanges`／舊匯出腳本全文）、`js/report.js`（全檔）、`js/ai-word-events.js`（全檔）、`js/init.js`、`js/wordlist.js`（L180–440）、`js/dict.js`（L60–140）、`js/cards.js`、`index.html`（批次面板、回報按鈕、AI 區）、`tests/worker-helpers.mjs`、`tests/helpers.mjs`、`tests/worker-admin.spec.mjs`、`tests/layout.spec.mjs`（L440–475、L660–740、L1776–1930）、`tests/error-visibility.spec.mjs`、`tests/lexicon-build.spec.mjs`、`tests/split-tags.spec.mjs`、`tests/smoke.spec.mjs`（L95–165）、`worker/test/dev-smoke.mjs`、`data/wordlist-overrides.json`、`data/rhyme-dict-overrides.json`、`package.json`、`playwright.config.mjs`。
- 實測：Playwright `route.fulfill` 對自訂標頭 fetch 的行為（scratchpad 腳本，HeadlessChrome 153）；舊匯出腳本排版函式對現有兩個 overrides 檔的逐位元組還原；`curl -I` 對 pages.github.com 的快取標頭與 query 行為。
- Cloudflare 文件（WebFetch 2026-10-09）：[KV limits](https://developers.cloudflare.com/kv/platform/limits/)、[How KV works](https://developers.cloudflare.com/kv/concepts/how-kv-works/)、[KV read API（cacheTtl 最小 30、預設 60）](https://developers.cloudflare.com/kv/api/read-key-value-pairs/)、[KV pricing（免費額度：讀 100k／寫 1k／刪 1k／list 1k 每日）](https://developers.cloudflare.com/kv/platform/pricing/)、[Workers limits（免費 100k 請求／日、外部子請求 50、內部 1,000、CPU 10 ms）](https://developers.cloudflare.com/workers/platform/limits/)、[Cache API（僅 custom domain 保證可用）](https://developers.cloudflare.com/workers/runtime-apis/cache/)。

### Secondary (MEDIUM confidence)
- GitHub Pages 發佈延遲「最多 10 分鐘」：WebSearch 結果引用的 GitHub support 存檔頁與社群回覆（官方 docs 的 `configuring-a-publishing-source` 抓取 404，未能直接核對；定價／行為細節二手）。

### Tertiary (LOW confidence)
- Python `urllib` UA 被 Cloudflare 擋、Chrome 預檢快取 2 小時上限、500 筆 JSON.parse CPU：訓練知識，標為 [ASSUMED]（見 Assumptions Log）。

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 全部沿用既有工具，版本已實測。
- Architecture: HIGH — 文件形狀、路由、套用順序都對照過現有程式碼；rev 鎖與推導狀態是設計建議，邏輯已用既有 KV 語意推演。
- Pitfalls: MEDIUM-HIGH — Cloudflare 限額為官方文件；Pages 快取行為為別站實測（Andy 站 404）。
- Validation: HIGH — 每個成功判準都對到可離線執行的指令；唯一不能自動驗的是真實 push／部署（Human check）。

**Research date:** 2026-10-09
**Valid until:** 2026-11-08（30 天；Cloudflare 免費額度與 wrangler 版本是最可能變動的部分）
