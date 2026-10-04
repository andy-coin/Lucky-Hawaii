## Docker 開發容器

- 已設定完成，容器名稱：`lucky-hawaii-dev`
- 使用 `./start.sh` 啟動，`./enter.sh` 進入，`./stop.sh` 停止
- Pi Agent 預設連 ToshLLM (Qwen3.6)，profile: IQ50
- `.devcontainer/docker-compose.yml` 的 ports 預設註解，web server 專案需取消註解

## ⏸ 暫停點（2026-10-04，Andy 要 /clear 後繼續）

- `/gsd-autonomous` 停在 **Phase 5 第 4/11 計畫完成後**（05-01～05-04 ✅，下一個 05-05）
- 續跑：`/clear` 後 `/gsd-autonomous --from 5`（Phase 5 的 CONTEXT／UI-SPEC／RESEARCH／11 個 PLAN 都在，會直接從 05-05 執行）
- 目前 `npm test` 302 passed／21 skipped（parity 只在 LH_PARITY 時跑）；HEAD 05c5e45；golden 自 078c5d1 未變
- Phase 1、3 ✅ 已驗證；Phase 2、4 程式完成、驗證待 Andy（02-UAT.md、04-UAT.md，STATE.md「Deferred Verification」）
- Phase 5 改版前截圖：`.planning/phases/05-multi-device-layout/baseline-before/`（15 張，給 Andy 對照）
- 這輪自主決定給 Andy 過目：開本機分支、use_worktrees=false、wrangler 檢查放行 fsevents、Gemini 2.5 雖未證實退役仍移除

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
