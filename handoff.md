## Docker 開發容器

- 已設定完成，容器名稱：`lucky-hawaii-dev`
- 使用 `./start.sh` 啟動，`./enter.sh` 進入，`./stop.sh` 停止
- Pi Agent 預設連 ToshLLM (Qwen3.6)，profile: IQ50
- `.devcontainer/docker-compose.yml` 的 ports 預設註解，web server 專案需取消註解

## ▶ 本機接續中（2026-10-09）

- 已 pull 雲端進度到本機（HEAD 與 origin/gsd/v0.96-stabilize 一致；Mac 鑰匙圈在 SSH 下不能用，pull 要在終端機輸入 token）
- Mac 截圖基準已建（05ebcce，15 張 -darwin.png）；`tests/layout.spec.mjs:1559` 搜尋框單行檢查改成比填字前後高度（2291d09，Mac 字型行高較高誤判）
- 本機 `npm test`：421 過／27 跳過，修完那 1 項後應全過；`lexicon:test` OK
- Phase 6 程式碼審查完成（06-REVIEW.md／06-REVIEW-FIX.md，.planning 本機不 commit）：WR-01～06 全修
  - WR-01 `tools/lexicon/lex/judge.py` `_checked_url` 改用解析後主機（56e1c94）；WR-06 同函式不合法網址改白話錯誤（1648db5）
  - WR-02 `js/wordlist.js` 換包失敗退回「最後真的載好」的包＋重跑搜尋，`?v=` 升 0.96.9（52fe5d4）
  - WR-03 judge 補問失敗保留已拿到的判斷（3b9d678）；WR-04 白名單補 裏銹鐧獴菓肽＋歐拉，詞庫包已重建（fca098d）；WR-05 校準詞表換掉與提示範例重複的 4 詞（69113b6）
  - 剩 IN-01～08 為 Info，未修
- 回歸關卡：`npm test` 423 過／27 跳過／0 失敗（注意：python 一律加 `-B`，tools/ 留 __pycache__ 會讓 lexicon-build 測試失敗）
- Phase 6 驗證：human_needed（3/5 自動過、2 項需真 AI），06-UAT.md 4 項；驗收清單更正 5-42／5-43、新增 3-15（高頻中國用語）；commit 952d24f
- 進行中：`/gsd-autonomous --from 7`
  - Phase 7 回報與修正層：10/10 計畫完成（commit 961f18a…a819f61），`npm test` 548 過／27 跳過／0 失敗，`corrections:test` 42 OK，`worker:smoke`／`worker:check` 過
    - Worker：`worker/src/corrections.js`（apply／revoke／clear／admin.json／公開 `/corrections.json`）、`adminKeyOk`（X-Admin-Key 優先）
    - 網站：`js/wordlist.js`、`js/dict.js` 兩段式套用＋`loadCorrections`（3 秒逾時略過）；`js/report.js` 🚩 回報視窗；`js/ai-word-events.js` AI 回報模式；頁尾「回報」改名「意見」；`?v=0.96.10`
    - 後台：`admin/index.html` 合併列、批次核准／駁回、🚀 套用到線上、撤回
    - 寫回腳本：`tools/corrections/writeback.py`（`npm run corrections:writeback`）
    - 驗收：精簡版 2-18～2-24、3-16～3-18、4-16～4-18、5-51～5-63；`-linux.png` 截圖基準 16 張待雲端 `npm run visual:update`
  - 下一步：Phase 7 code review（進行中）→ verifier → Phase 8
- 注意：這台不能 push（SSH 下鑰匙圈鎖住）；本機 commit 累積中，Andy 回家後自己 push

## ⏸ 雲端接力結束（2026-10-04，接回本機繼續）

- 分支 `gsd/v0.96-stabilize` 已全部 push；`main`（線上網站）沒動
- **Phase 5 多裝置版面**：11/11 計畫完成＋程式碼審查（3 輪修正）＋驗證（自動 5/5）；實機項目待 Andy → `/gsd-verify-work 05`（05-UAT.md）
- **Phase 6 台灣詞庫包**：8/8 計畫完成（LEX-01～07）。**尚未跑**：`/gsd-code-review 6`、phase 驗證（verifier）、`phase.complete`（為省雲端額度留到本機）
  - 本機接續：`/gsd-code-review 6 --fix --auto` → `/gsd-execute-phase 6`（會偵測到計畫全做完、直接進驗證）→ 再 `/gsd-autonomous --from 7`
  - 四個詞庫包：v0.96 現行（預設）、新酷音、小麥注音、唯音台灣精簡版；偏好設定可切換；`npm run lexicon:build` 重建、`tools/lexicon/reports/*/REPORT.md` 刪除報告
  - 灰色地帶約 3.36 萬詞「待 AI 判斷」：Mac 上 `GEMINI_API_KEY=… npm run lexicon:eval`（≥90%）再 `npm run lexicon:judge`（約 225 次請求，可續跑）
- `?v=` 目前 0.96.8；雲端 `npm test` 421 過／27 跳過／1 失敗（worker-config.spec.mjs:53 為雲端代理造成，Mac 上應全過）
- **Mac 第一次跑 `npm test` 前**：先 `npm run visual:update` 建立 Mac 版截圖基準（雲端只有 -linux.png，D-11）
- **一口氣驗收清單**：`.planning/TEST-CHECKLIST.md`（必測／建議測／待 Andy 決定 D-1～D-20／自主決定）
- **合併 main 前**：`git rm -r --cached .planning handoff.md .claude/CLAUDE.md`（見 CLOUD-RELAY.md）
- 授權注意（D-16）：v0.96 預設詞庫約 15 萬詞源自教育部 CC BY-ND 辭典；新詞庫包都不含

## GSD 狀態（以 .planning/ 為準）

- 2026-10-04 Phase 2 程式碼全部完成（6/6 計畫），`npm test` 218 項、`worker:check`、`worker:smoke` 皆過；**等 Andy 照 `worker/DEPLOY.md` 步驟 1–10 上線**（登入、填兩個 KV id、secret、部署、再合併分支更新網站、線上點一次 AI 建議）。Phase 1 安全網 ✅ 驗證 15/15
- **所有改動都在本機分支 `gsd/v0.96-stabilize`**，`main`（=線上網站）沒動、沒 push。Andy 測完再合併上線
- 測試：repo 根目錄 `npm test`（Playwright，約 1 分鐘，104 項）；golden 快照在 `tests/golden/`，刻意改資料才用 `npm run golden:update`
- 新檔：`js/safety.js`（儲存鍵清單、lhGet/lhSet、存檔失敗橫幅、IndexedDB v2 備份、遷移＋自動還原）
- 設定改動：`.planning/config.json` workflow.use_worktrees=false（.planning 被 gitignore，worktree 看不到計畫檔）
- 待 Andy 出手：Phase 2 `wrangler login` 瀏覽器授權＋正式部署；Phase 6 需免費 Gemini API key；Phase 12 需選定詞庫包組合
- 待 Andy 判斷：注音帶聲調輸入（ㄌㄞˊ）在 v0.96 查不到結果，是否為 bug（清單見 STATE.md Pending Todos）
- 注意：Gemini 2.5「10/16 退役」未被 Google 官方確認，已從清單移除（見 DEPLOY.md「先知道的事」）；新增 `npm run worker:smoke`（worker/test/dev-smoke.mjs，wrangler dev + 假供應商）

## Phase 3 拆檔完成（2026-10-04，分支 gsd/v0.96-stabilize，沒 push）

- `index.html` 只剩 352 行骨架；`css/` 3 檔、`js/` 21 檔（safety.js 在 head，其餘 20 個在 body 尾端，順序固定，init.js 夾在 theme 與 report 之間）；`npm test` 245 項全過
- 之後只要動到 `css/` 或 `js/`，部署前要把**所有標籤**的 `?v=` 一起加（split-tags 會檢查一致）
- `.claude/CLAUDE.md` 的架構行號還指向舊 index.html，可用 /gsd-map-codebase 更新（我沒動 CLAUDE.md）
- `js/ai-client.js` 裡還留著用不到的 `saveApiKey()`，照 CONTEXT 延後清理

## Phase 4 完成（2026-10-04，分支 gsd/v0.96-stabilize，沒 push）

- 04-05 做完：`js/wordlist.js` 詞庫載入改單一 Promise、快取單一交易整套換版（`_idbReadCache`／`_idbReplaceAll`，只刪數字鍵）、分段網址 `?v=`、缺段整份丟棄；`js/ai-generate.js` 詞庫沒好時顯示「詞庫載入中…」並等同一個載入，等待中換搜尋就作廢；`tests/wordlist-cache.spec.mjs` 4 項；`npm test` 269 項全過，golden 沒動
- **給 Andy 的試用清單（Worker 上線後，回「1.是 2.否…」）：**
  1. 用「心」「安」「愛」各按一次 AI 建議（押字尾），是否都剛好 24 個、詞夠好用？
  2. 切到押字首再試，是否接受「首字韻部相同」？（不接受就要改候選篩選）
  3. AI 挑不夠時，程式依詞頻補的詞是否可接受？
  4. 候選不足時 AI 造的詞是否都押韻？
  5. 剛開網頁就按 AI 建議，是否先看到「詞庫載入中…」再正常出詞？
- 行為變更：詞庫缺任何一段就整份不用，提示重新整理（以前默默用殘缺的）
- 已知上限：舊 loader 已混出來的快取會留到下次詞庫發新版（Phase 6）
- 仍待 Andy：Phase 2 Worker 部署（worker/DEPLOY.md），線上 AI 才會動
