---
phase: 07-feedback-correction-layer
verified: 2026-10-10T00:00:00Z
status: human_needed
score: 14/14 must-have groups verified (4 ROADMAP success criteria + 10 plans); 4 plan-level truths superseded by recorded review-fix decisions (see Deviations)
covered_files:
  - .planning/phases/07-feedback-correction-layer/07-01-PLAN.md
  - .planning/phases/07-feedback-correction-layer/07-01-SUMMARY.md
  - .planning/phases/07-feedback-correction-layer/07-02-PLAN.md
  - .planning/phases/07-feedback-correction-layer/07-02-SUMMARY.md
  - .planning/phases/07-feedback-correction-layer/07-03-PLAN.md
  - .planning/phases/07-feedback-correction-layer/07-03-SUMMARY.md
  - .planning/phases/07-feedback-correction-layer/07-04-PLAN.md
  - .planning/phases/07-feedback-correction-layer/07-04-SUMMARY.md
  - .planning/phases/07-feedback-correction-layer/07-05-PLAN.md
  - .planning/phases/07-feedback-correction-layer/07-05-SUMMARY.md
  - .planning/phases/07-feedback-correction-layer/07-06-PLAN.md
  - .planning/phases/07-feedback-correction-layer/07-06-SUMMARY.md
  - .planning/phases/07-feedback-correction-layer/07-07-PLAN.md
  - .planning/phases/07-feedback-correction-layer/07-07-SUMMARY.md
  - .planning/phases/07-feedback-correction-layer/07-08-PLAN.md
  - .planning/phases/07-feedback-correction-layer/07-08-SUMMARY.md
  - .planning/phases/07-feedback-correction-layer/07-09-PLAN.md
  - .planning/phases/07-feedback-correction-layer/07-09-SUMMARY.md
  - .planning/phases/07-feedback-correction-layer/07-10-PLAN.md
  - .planning/phases/07-feedback-correction-layer/07-10-SUMMARY.md
  - admin/index.html
  - css/panels.css
  - index.html
  - js/ai-word-events.js
  - js/dict.js
  - js/report.js
  - js/wordlist.js
  - tests/admin.spec.mjs
  - tests/corrections-site.spec.mjs
  - tests/corrections-writeback.spec.mjs
  - tests/report-entry.spec.mjs
  - tests/worker-admin.spec.mjs
  - tests/worker-corrections.spec.mjs
  - tools/corrections/tests/test_live.py
  - tools/corrections/tests/test_writeback.py
  - tools/corrections/writeback.py
  - worker/DEPLOY.md
  - worker/src/corrections.js
  - worker/src/index.js
  - worker/test/dev-smoke.mjs
covered_digest: "v2:sha256:c956ef7ec9245f32bf2c11f1a5a66b2fa77989d92188c6e6049986b8414f6c98"
behavior_unverified: 0
overrides_applied: 0
gaps: []
human_verification:
  - test: "正式環境走一次完整流程：部署 Worker（先於 main 合併）-> 用真實回報在後台核准 -> 按「套用到線上」-> 網站重新整理看到修正 -> 撤回 -> 再套用 -> 跑 npm run corrections:writeback -- --apply --push -> 等線上生效 -> 確認修正層被清空 -> 再跑一次確認是 no-op"
    expected: "套用後約 1～2 分鐘內網站重新整理看到修正；撤回後約 1～2 分鐘消失；寫回腳本等到 GitHub Pages 真的換新後才清空；重跑不重複、不遺失"
    why_human: "ROADMAP Human check。Worker 尚未部署、這台機器不能 push。真實 KV 邊緣快取、GitHub Pages CDN 延遲與 Pages 發佈分支（--live-branch）只有正式環境看得到；離線只用本機 workerd、FakeKV、假 Pages 伺服器測過"
  - test: "真機走一次手機回報：點字卡 -> 工具列「🚩 回報」-> 點原因 -> 送出；AI 詞卡「🚩 回報詞語」-> 選詞 -> 回報；iOS 鍵盤彈出時說明欄與「送出回報」仍看得到"
    expected: "4 次點擊內送出；長按字卡／詞卡不會跳出選單（留給 Phase 8/9 拖曳）；破音字 chip 長按仍有選單；鍵盤不蓋住送出鈕"
    why_human: "07-04 的鍵盤項目是 backstop：測試用縮小視窗 336px 模擬，真 iOS 鍵盤與手感只能真機驗"
  - test: "在雲端環境跑 npm run visual:update 更新 16 張過期的 -linux.png 截圖基準，再跑 npm test"
    expected: "視覺測試在 Linux 基準下全過"
    why_human: "這台 Mac 不能產生 Linux 基準圖；屬環境項目，不是程式缺口"
  - test: "確認 Andy 是否接受四項「審查修正後取代原計畫文字」的自主決定（見 Deviations）：撤回後回報回到「待審」而非「已核准未套用」、移除後台「匯出 agreed」備援、/corrections/* 與 /health* 只收標頭金鑰、?v= 升到 0.96.11"
    expected: "1.是 2.否（若否，需要回復舊行為並重新評估 CR-02 的程式碼注入風險）"
    why_human: "這些決定覆寫了 CONTEXT D1／UI-SPEC D-16 與 07-07 計畫的字面條文；依專案「灰色地帶自主決定、事後讓 Andy 否決」規則，需 Andy 點頭才算定案"
  - test: "整理舊回報：部署後在後台檢查舊 Worker 時期已核准、但沒有 decided_by 的回報（會顯示待審）"
    expected: "只對確定還沒寫進 data/ 的重新核准；不要整批盲目核准（走過舊「匯出 agreed」手動套用的項目不在 written 清單內，會被再套用一次）"
    why_human: "REVIEW-FIX I2-WR-01 明確列為「未做」的善後；只有 Andy 知道哪些舊回報已手動處理過"
---

# Phase 7: Feedback & Correction Layer 回報與修正層 Verification Report

**Phase Goal:** 使用者回報更簡單，Andy 在後台批改更省工：核准後一鍵套用、線上即時生效、可一鍵撤回；累積後用腳本寫回 `data/` 並安全清空修正層。
**Verified:** 2026-10-10
**Status:** human_needed
**Re-verification:** No, initial verification
**Mode:** mvp (ROADMAP goal is not in User Story form; `user-story.validate` returns false, same as Phase 6. Verified against the stated goal and the four success criteria.)

## Verdict

No code gaps. Every ROADMAP success criterion has an implemented path that I read in the code and a passing test that exercises it. The remaining items are what the task brief already names as human or environment work: production walk-through, real CDN timing, real-device feel, stale Linux screenshot baselines. Four plan-level truths were deliberately overridden by review fixes; those need Andy to confirm.

## Goal Achievement

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | 詞卡回報入口明顯、幾步內送出；桌機保留右鍵、長按留給拖曳、手機有不靠長按的方式 | VERIFIED | `index.html:111` 與 `:281` 兩個工具列（桌機 `#batchPanel`、手機 `#m-batchPanel`）各有 `btn-report`「🚩 回報」。`js/report.js` 的 `contextmenu` 監聽（約 :125）保留字卡右鍵；整份 `js/` 只剩 `.poly-chip` 有 `touchstart` 長按計時，字卡／AI 詞卡沒有（`grep touchstart` 驗過）。`js/ai-word-events.js` 的「🚩 回報詞語」選取模式（捕獲階段攔截 click，不再 saveWord）讓 AI 詞卡手機也能回報。測試：`report-entry.spec` 步驟數（4 步）、長按、右鍵、手機工具列、AI 回報模式全過。 |
| 2 | 後台同一個詞的多筆回報合併成一列，可勾選多筆一次核准或駁回 | VERIFIED | `admin/index.html` `groupKeyOf`／`groupReports` 以（回報類型, 詞）或（字, 讀音, 類型）精確字串合併；批次核准套用 D-12 預設動作並略過需手動列。`admin.spec` 合併、整列核准、批次核准、批次駁回、全選、部分失敗、XSS、金鑰標頭等 38 項全過。 |
| 3 | 後台按「套用」後線上重新整理就看到（修正層與回報分開存）；按「撤回」恢復原狀 | VERIFIED（時序部分待人工） | `worker/src/corrections.js`：修正層單一文件 `corrections:v1` 存在 `AI_STATE_KV`，回報在 `USER_FEEDBACK_KV`；`/corrections/apply` 只收 kvKey，內容由 Worker 讀回報並重驗；`GET /corrections.json` 公開、`Cache-Control: public, max-age=60`、KV `cacheTtl:30`；`/corrections/revoke` 依 id 移除並把來源回報改回待審。網站端 `js/dict.js loadCorrections()`（每頁一次、3 秒逾時、失敗只留 `[好韻器] 修正層載入失敗` 警告）+ `js/wordlist.js applyWordlistOverrides`／`applyRhymeDictOverrides` 先套 data 檔、後套修正層。我另跑 `npm run worker:smoke`（真 workerd + 本機 KV）：回報 -> 標頭金鑰核准 -> 套用 -> 公開讀取有該詞且 `max-age=60` -> 陌生來源 403 -> 撤回 -> 公開 view 空，全部通過。真實 CDN／KV 邊緣快取延遲見 human_verification #1。 |
| 4 | 寫回腳本把修正層寫進 `data/` 並 push；確認線上生效後才清空；重跑不重複、不遺失 | VERIFIED（正式環境待人工） | `tools/corrections/writeback.py`：預設只預覽；`--apply` 才寫檔並只 commit 三個檔（`data/wordlist-overrides.json`、`data/rhyme-dict-overrides.json`、`data/applied-changes.log`）；`--push` 且在 live 分支才 push，之後 `wait_until_live` 輪詢到 `merge(線上, 這批) == 線上` 才呼叫 `/corrections/clear`，且只清日誌裡已記的 id（寫回期間新套用的留著）；逾時 exit 4、清空失敗 exit 5、被撤回的 exit 6。`npm run corrections:test`：53 OK。`tests/corrections-writeback.spec.mjs` 端到端（真 Worker 程式碼 + 暫存 clone + 本機 bare remote + 延遲生效的假 Pages）通過：第一次寫回並清空、中途套用的留下、第二次清掉剩下的、第三次 no-op。真實資料檔自 `952d24f` 起無差異（`git diff` 為空），代表測試沒汙染正式資料。 |

### Plan-level must-haves

| Plan | Reqs | Result | Evidence |
|------|------|--------|----------|
| 07-01 Worker 修正層 + 網站套用（7 truths + 1 prohibition） | FB-03 | VERIFIED（2 處已被審查修正取代，見 Deviations） | 套用恰好一次 put、公開 view 無 id／source／note（`buildView` 只回 replay 結果，測試 `公開讀取只回修正內容`）、網站 3 秒逾時、`adminKeyOk` 共用且空金鑰拒絕、預檢允許 `X-Admin-Key` 且 Max-Age 7200、`wrangler.toml` 自 `952d24f` 無差異。 |
| 07-02 完整動作對照 + 撤回／清空 + 共用向量（9 truths + 1 prohibition） | FB-02/03/04 | VERIFIED | `actionToEntry` 11 種動作、`validateEntryValue`、`replayEntries` 冪等（向量測試 530–532 全過）、重按只留一筆、409 REV_MISMATCH、503 KV_BUSY、500 LAYER_CORRUPT 不覆寫、2000 筆上限、`/reports.json` cursor 列完只讀最新 800 並回 `X-Reports-Truncated`。Prohibition「未審核回報不得影響線上」：測試 548–550（偽造 `status:agreed` 且無 `decided_by` 被 `not_agreed` 擋下、KV 零寫入）。 |
| 07-03 字庫修正層（5 truths） | FB-03 | VERIFIED | `applyRhymeDictOverrides` 兩段各自 try/catch、base 缺失不再提早 return；`corrections-site.spec` 字庫隱藏／新增、Worker 503／逾時／離線只留一則警告、換包不重抓、不帶 `no-cache` 全過。 |
| 07-04 回報入口 + 回報視窗（約 21 truths + 1 prohibition） | FB-01 | VERIFIED（鍵盤實機項目歸人工） | `report-entry.spec` 工具列、4 步、手機四欄、多選上限 10、防重複、部分失敗／限流、500 字、鍵盤焦點、遮罩、版面（4 種視窗 x 100/150%）、字級 >= 16px、主題、切換斷點全過。Prohibition「回報不得夾帶使用者作品」：`只送必要欄位` 測試通過。Backstop 項（item 3 of 3 失敗、336px 鍵盤、150% 不裁切、無新 keyframes）各有具名測試且通過；真 iOS 鍵盤見 human_verification #2。 |
| 07-05 後台合併／批次（約 15 truths） | FB-02 | VERIFIED | 見 SC2；另有字級／字重、顏色對比、390px 無橫向捲動、>= 44px 觸控、靜態掃描無範本字串拼出的 `on*` 屬性（`admin.spec` 靜態掃描）。 |
| 07-06 AI 詞卡回報 + 長按讓出（7 truths） | FB-01 | VERIFIED | `ai-word-events.js` 回報模式；`長按`、`右鍵`、`AI 回報模式`、`AI 列隱藏`、`AI 列觸控` 測試全過；選單 150% 不出界的 layout 測試未退步（整套 npm test 0 failed）。 |
| 07-07 後台套用／撤回（約 10 truths + 1 prohibition） | FB-03/04 | VERIFIED（2 處已被審查修正取代） | 套用列、已上線標籤、已寫入資料檔、撤回、重按只有一個請求、409、失敗白話原因、超過 500 筆（500 無提示、501 琥珀）、讀取失敗停用套用、有效讀音併入修正層。Prohibition「核准不得單獨上線」：套用測試證明 `/corrections/apply` 只收 `{kvKeys, baseRev}`。 |
| 07-08 寫回腳本 tracer（8 truths + 1 prohibition） | FB-05 | VERIFIED | 預設 dry-run、位元組級排版相同、重跑不改檔不寫日誌不 commit、目標檔有未 commit 修改就 exit 3、非 live 分支不 push 不清空、金鑰只走環境變數與標頭（`main()` 連 traceback 都不印）、缺金鑰 exit 2、單元測試進 `npm test` 且不留 `__pycache__`（`find tools -name __pycache__` 為空）。 |
| 07-09 推上線 + 確認清空（7 truths + 1 prohibition） | FB-05 | VERIFIED | `test_live.py` 21 項：推上去後等線上、只清這批、逾時 exit 4 且不清、409 重試一次、兩次失敗 exit 5、`--confirm-only` 任何分支、任一步中斷後重跑、大批次分塊。Prohibition：`test_other_branch_with_push_neither_pushes_nor_clears`、`test_live_branch_only_without_push_flag_never_pushes`、`test_push_failure_exits_3_and_clears_nothing`。 |
| 07-10 真 Worker 冒煙 + 部署說明 + 驗收清單（4 truths） | FB-01..05 | VERIFIED | `npm run worker:smoke` 我實跑，全部通過（含 5a–5e）。`worker/DEPLOY.md` 有上線順序、金鑰標頭、`corrections:v1`、`--push`／`--confirm-only`／`--live-branch`、20 分鐘 CDN 等待、exit 4/5/6。`.planning/TEST-CHECKLIST.md` 有「Phase 7 正式環境走一次」等段落。`worker/wrangler.toml` 與真實 overrides／log 自 `952d24f` 無差異。 |

### Deviations from plan text (superseded by recorded review-fix decisions)

These plan truths, as literally written, are no longer true. Each is a conscious, documented safety fix in `07-REVIEW-FIX.md`, and the phase goal and ROADMAP criteria still hold. They are not counted as failures, but they are not accepted overrides either until Andy confirms (human_verification #4).

| Plan truth (original) | Current behaviour | Why | Suggested override |
|-----------------------|-------------------|-----|--------------------|
| 07-07：撤回後該列回到「已核准未套用」，等待數增加 | 撤回後來源回報回到「待審」，要重新核准才會再套用 | WR-02：否則下一次「套用」會把剛撤回的修正放回線上 | `must_have: "撤回 ... the row returns to 已核准未套用"`, reason: "撤回改回待審以避免被下一次套用重新放回；見 07-REVIEW-FIX WR-02" |
| CONTEXT D1／UI-SPEC D-16／07-07：舊「匯出 agreed」按鈕保留當備援 | 按鈕與整個 .py 產生器已移除 | CR-02：會產生可注入的 Python 腳本、寫死路徑不存在，且已由 `writeback.py` 取代 | `must_have: "The old 匯出 agreed button stays as a backup"`, reason: "CR-02 程式碼注入風險；writeback.py 取代" |
| 07-01：所有後台路徑都先收 header、再收 `?key=` | 只有 `/reports.json`、`/reports/decision`、`/reports/delete` 還收 `?key=`；`/corrections/*`、`/health*` 只收 header | WR-04：金鑰不進網址／歷史／日誌 | `must_have: "legacy query key second"`, reason: "WR-04 縮小 ?key= 範圍" |
| 07-01／07-04／07-10：27 個 `?v=` 都是 0.96.10 | 27 個都是 0.96.11（`grep -o '?v=[0-9.]*' index.html` 計 27 個 0.96.11） | WR-06 動到 `js/`／`css/`，依 split-tags 規則整批升版 | 不需要 override，屬預期的版本演進 |

另外兩項行為變更（review 已記錄）：舊 Worker 核准過、沒有 `decided_by` 的回報會顯示待審（見 human_verification #5）；`written` 清單只留最新 5000 筆（IN-01）。

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `worker/src/corrections.js` (375 行) | 修正層路由、重播、驗證 | VERIFIED | 讀過全檔：實際邏輯，非 stub；`index.js:303` 掛載 |
| `worker/src/index.js` (340 行) | `adminKeyOk`、CORS、`/feedback` 白名單、`/reports*` 強化、路由掛載 | VERIFIED | `FEEDBACK_FIELDS` 白名單、`decided_by` 只在 `/reports/decision` 寫入、限流在 403 之前 |
| `admin/index.html` | 合併／批次／套用／撤回 UI | VERIFIED | `adminFetch` 帶 `X-Admin-Key`；`applyApproved`、`revokeGroup`、`loadLayer`、`memberStatus` 皆有實作；靜態 `onclick` 只剩固定字串 |
| `js/dict.js`、`js/wordlist.js` | 網站載入並套用修正層 | VERIFIED | `loadCorrections` 記憶化；`applyWordlistOverrideDoc` 兩段共用 |
| `js/report.js`、`js/ai-word-events.js`、`css/panels.css`、`index.html` | 回報視窗、工具列按鈕、AI 回報模式 | VERIFIED | 見 SC1 |
| `tools/corrections/writeback.py` (775 行) | 寫回、推送、確認、清空 | VERIFIED | 讀過全檔，涵蓋 dry-run／apply／push／confirm-only／exit 2–6 |
| `tests/fixtures/corrections-vectors.json` | JS／Python 共用重播向量 | VERIFIED | 向量測試（JS 側 530–532，Python 側 `test_merge`）皆過 |
| `worker/DEPLOY.md`、`.planning/TEST-CHECKLIST.md` | 部署說明與 Andy 驗收清單 | VERIFIED | 內容含第 7 階段上線順序與人工驗收段落 |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `js/wordlist.js applyWordlistOverrides` | `js/dict.js loadCorrections` | `Promise.all([fetchBase(), loadCorrections()])` | WIRED |
| `js/dict.js loadCorrections` | `GET /corrections.json` | `fetch(WORKER_URL + '/corrections.json', {signal: AbortSignal.timeout(3000)})` | WIRED |
| `worker/src/index.js route()` | `handleCorrections` | 在 `handleFeedbackAdmin` 之後掛載、注入 `json／readBodyCapped／adminKeyOk／originAllowed` | WIRED |
| `corrections.js apply` | 回報 KV | 只讀 `status==='agreed' && decided_by==='admin'` 的回報 | WIRED |
| `admin applyApproved` | `POST /corrections/apply` | 只送 `{kvKeys, baseRev}`，每 100 筆一批 | WIRED |
| `admin revokeGroup` | `POST /corrections/revoke` | `{ids, baseRev}` | WIRED |
| `writeback.py finish_live` | `POST /corrections/clear` | `wait_until_live` 通過後才呼叫，只送日誌內已記的 id | WIRED |
| `index.html .btn-report` | `openReportDialog` | `onclick="openReportDialog()"`（兩個工具列） | WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| 網站詞庫／字庫 | `layer.wordlist`／`layer.rhymeDict` | `GET /corrections.json` -> `buildView(loadDoc(AI_STATE_KV))` | 是（workerd 冒煙實測，套用後有詞、撤回後清空） | FLOWING |
| 後台列表 | `reports`、`layer` | `/reports.json`（USER_FEEDBACK_KV）、`/corrections/admin.json` | 是 | FLOWING |
| `data/*-overrides.json` | 合併結果 | `/corrections/admin.json` entries -> `merge` | 是（端到端測試寫入暫存 clone） | FLOWING |

### Behavioral Spot-Checks (I ran these)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 全套測試 | `npm test` | 562 passed / 27 skipped / 0 failed（27 個 skip 是 parity／perf 專案，與本階段無關） | PASS |
| 寫回腳本單元測試 | `npm run corrections:test` | 53 tests OK | PASS |
| 真 Worker 冒煙（workerd + 本機 KV） | `npm run worker:smoke` | 全部通過，含 (5a)–(5e) 修正層步驟 | PASS |
| `?v=` 一致 | `grep -o '?v=[0-9.]*' index.html` | 27 個 0.96.11 | PASS |
| 無 `__pycache__` | `find tools -name __pycache__` | 空 | PASS |
| 設定與資料未被汙染 | `git diff 952d24f -- worker/wrangler.toml data/*-overrides.json data/applied-changes.log` | 空 | PASS |

### Probe Execution

Step 7c: SKIPPED. 本階段沒有宣告 `scripts/*/tests/probe-*.sh`；驗證靠上面的 npm 指令。

### Requirements Coverage

PLAN frontmatter 宣告的需求 ID：FB-01、FB-02、FB-03、FB-04、FB-05；REQUIREMENTS.md 對應 Phase 7 的也只有這五個，沒有孤兒需求。

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|--------------|-------------|--------|----------|
| FB-01 | 07-04, 07-06, 07-10 | 回報入口更明顯、步驟更少（保留右鍵；長按留給拖曳） | SATISFIED | SC1 |
| FB-02 | 07-02, 07-05, 07-10 | 後台同詞合併顯示，可批次核准／駁回 | SATISFIED | SC2 |
| FB-03 | 07-01, 07-02, 07-03, 07-07, 07-10 | 核准後一鍵套用，Worker 修正層，線上即時生效，與回報分開存放 | SATISFIED（時序待人工） | SC3 |
| FB-04 | 07-02, 07-07, 07-10 | 已套用的修正可一鍵撤回 | SATISFIED | SC3、`admin.spec` 撤回、`worker:smoke` (5e) |
| FB-05 | 07-08, 07-09, 07-10 | 腳本寫回 `data/`、push、確認線上生效後才清空、不重複不遺失 | SATISFIED（正式環境待人工） | SC4 |

注意：REQUIREMENTS.md 已把 FB-01..05 標成 `[x]` Complete；在 Andy 完成正式環境走查之前，這是「程式與離線測試完成」的意思，不是「已在線上驗收」。

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (phase-modified files) | - | `TBD`／`FIXME`／`XXX` 掃描 | none | 0 筆 |
| `js/dict.js` | 114 | `AbortSignal.timeout` 在 Safari < 16.4 會同步丟錯（REVIEW IN-02） | WARNING（非阻擋） | 被外層 `try/catch` 吞掉，舊 iOS 使用者看不到修正層，頁面仍正常；`js/ai-client.js` 既有程式碼也用同一個 API，所以不是本階段新增的限制 |
| `worker/src/corrections.js` | 17, 299 | `written` 只留最新 5000 筆（IN-01） | INFO | 非常舊的已寫入回報最終可能重新出現為「已核准」；後台只讀最新 800 筆，短期不會遇到 |
| `tools/corrections/writeback.py` | 69–73 | `urllib` 跨轉址會轉送 `X-Admin-Key`（IN-03） | INFO | 預設網址固定為 HTTPS 且 Worker 不轉址，風險低 |
| `worker/src/corrections.js` / `writeback.py` | 19 / 185 | 詞驗證允許隱形／雙向覆寫字元（IN-04） | INFO | 管理員核准前看得到詞；可日後在兩邊正則與共用向量一起排除 `\p{Cf}` |
| `tests/style.spec.mjs` | 205, 285 | 依賴特定 git commit（IN-05） | INFO | 淺層 clone 會誤報；本機通過 |

沒有 BLOCKER 層級的反模式。

### Human Verification Required

見 frontmatter `human_verification`。摘要：

1. **正式環境完整走查**（ROADMAP Human check）：部署 Worker、核准 -> 套用 -> 重新整理 -> 撤回 -> 再套用 -> `--apply --push` -> 清空 -> 重跑 no-op。此項同時確認真實 CDN 時序與 Pages 發佈分支（`--live-branch`）。
2. **真機回報手感**與 iOS 鍵盤（07-04 backstop）。
3. **雲端更新 16 張 `-linux.png` 基準圖**（`npm run visual:update`）。
4. **Andy 確認四項取代原條文的自主決定**（撤回回待審、移除匯出備援、header-only 金鑰範圍、版本號）。
5. **舊回報善後**：舊 Worker 核准但沒有 `decided_by` 的回報會顯示待審，勿整批盲目核准。

### Gaps Summary

沒有程式缺口。Phase 7 的四條 ROADMAP 成功準則都有已實作且已測試的路徑：我讀了 Worker、網站載入端、後台與寫回腳本的實際程式碼，並親自跑了 `npm test`（562 過、0 失敗）、`corrections:test`（53 OK）與 `worker:smoke`（全過）。審查迭代 1、2 的 CR-01、CR-02、WR-01..08 都能在程式碼中找到對應的修正與測試。未能由代碼證明的只有環境性質的事：Worker 尚未部署、真實 CDN／KV 延遲、真機手感、Linux 截圖基準，以及 Andy 對四項覆寫決定的確認，所以狀態是 `human_needed` 而不是 `passed`。

---

_Verified: 2026-10-10_
_Verifier: Claude (gsd-verifier)_
