# 雲端接力說明（給 cloud session 的 Claude 讀）

使用者 Andy 是音樂工作者，只看繁體中文／英文，溝通用白話，不要講變數名、函式名。
藍圖已經跟 Andy 用大量問答敲定（PROJECT / REQUIREMENTS / ROADMAP），**不要再回頭問他設計問題**。

## 任務
1. 從 `handoff.md` 與 `.planning/STATE.md` 讀目前進度：Phase 5 已完成 05-01～05-04，從 **05-05** 接續。
2. 用 GSD 自主流程（等同 `/gsd-autonomous --from 5`）把 ROADMAP 剩下的 Phase 全部執行完。
3. 遇到只有 Andy 能做的事（`wrangler login`、正式部署、Gemini API key、選詞庫包組合、需要他主觀判斷的設計取捨）：
   **不要卡住**，記進 `.planning/TEST-CHECKLIST.md` 的「待 Andy 決定／動手」，然後做下一件能做的事。
4. 每完成一個計畫就 commit（沿用現有 `fix(05-04): …` 中文訊息格式）並 push。

## 必須維護：`.planning/TEST-CHECKLIST.md`
Andy 要在全部跑完後「一口氣測試」。請持續追加，每項格式：
- 哪個 Phase／計畫
- 在哪個畫面、怎麼操作（白話、一步一步）
- 預期看到什麼
- 讓 Andy 能用「1.是 2.否」回答的是非題

分三區：「必測」「建議測」「待 Andy 決定／動手」。

## 規矩
- 分支：`gsd/v0.96-stabilize`。**不要動 `main`**（`main` = 線上網站）。
- 測試：`npm test` 必須全過才能 commit；golden 快照只有刻意改資料才 `npm run golden:update`。
- 動到 `css/` 或 `js/`，所有標籤的 `?v=` 一起加。
- 雲端沒有 REAPER／本機 Docker／ToshLLM；用不到，也不要試。
- 不要修改 `resources/` 內任何檔案（與本專案無關，但為全域規定）。
- 不確定時選保守預設，把決定寫進 TEST-CHECKLIST 的「自主決定」讓 Andy 過目，不要停下來問。

## 結束時
- 更新 `handoff.md`（聚焦：做完什麼、檔名＋行數、未解 bug、待測）。
- 最後回報：完成的 Phase、`npm test` 結果、TEST-CHECKLIST 項目數。

## ⚠️ 給 Andy 的備忘（合併回 main 前）
`.planning/`、`handoff.md` 原本被 .gitignore 擋住，只留本機；這次為了雲端接力用 `git add -f` 帶進了本分支。
**合併到 `main` 之前**要先 `git rm -r --cached .planning handoff.md .claude/CLAUDE.md`，避免它們跑進線上網站。
repo 已改為 private。
