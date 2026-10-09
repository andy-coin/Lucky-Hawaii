---
gsd_state_version: "1.0"
milestone: v0.96
current_phase: 07
current_phase_name: Feedback & Correction Layer 回報與修正層
status: executing
stopped_at: Completed 07-09-PLAN.md
last_updated: "2026-10-09T22:54:51.629Z"
last_activity: 2026-10-10
last_activity_desc: Phase 07 execution started
state_head: 7b4b78195e0920be059c4988d4bd7d7b89eb4887
progress:
  total_phases: 12
  completed_phases: 2
  total_plans: 51
  completed_plans: 50
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-03)

**Core value:** 輸入一個字或音，就能快速拿到「符合台灣日常語感、真的能寫進歌詞」的押韻字詞——查得到、查得快、查得準。
**Current focus:** Phase 07 — Feedback & Correction Layer 回報與修正層

## Current Position

Phase: 07 (Feedback & Correction Layer 回報與修正層) — EXECUTING
Plan: 10 of 10
Status: Ready to execute
Last activity: 2026-10-10 — Phase 07 execution started

Progress: [██░░░░░░░░] 17%

## Performance Metrics

**Velocity:**
- Total plans completed: 11
- Average duration: -
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 6 | - | - |
| 03 | 5 | - | - |

**Recent Trend:**
- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 01 P01 | 4 min | 2 tasks | 48 files |
| Phase 01 P02 | 20 min | 2 tasks | 4 files |
| Phase 01 P03 | 11 min | 3 tasks | 8 files |
| Phase 01 P04 | 14 min | 3 tasks | 4 files |
| Phase 01 P05 | 8 min | 3 tasks | 4 files |
| Phase 01 P06 | 14 min | 2 tasks | 2 files |
| Phase 02 P01 | 9 min | 2 tasks | 9 files |
| Phase 02 P02 | 5 min | 2 tasks | 8 files |
| Phase 02 P03 | 6 min | 3 tasks | 5 files |
| Phase 02 P04 | 6min | 2 tasks | 3 files |
| Phase 02 P05 | 30min | 2 tasks | 6 files |
| Phase 02 P06 | 5min | 2 tasks | 3 files |
| Phase 03 P01 | 6min | 2 tasks | 5 files |
| Phase 03 P02 | 5min | 2 tasks | 5 files |
| Phase 03 P03 | 7 min | 2 tasks | 6 files |
| Phase 03 P04 | 8min | 3 tasks | 9 files |
| Phase 03 P05 | 10min | 3 tasks | 10 files |
| Phase 04 P01 | 35 min | 2 tasks | 10 files |
| Phase 04 P02 | 20min | 2 tasks | 4 files |
| Phase 04 P03 | 15min | 2 tasks | 3 files |
| Phase 04 P04 | 20min | 2 tasks | 7 files |
| Phase 04 P05 | 30min | 3 tasks | 5 files |
| Phase 05 P01 | 25min | 2 tasks | 14 files |
| Phase 05 P02 | 4 min | 2 tasks | 6 files |
| Phase 05 P03 | 35 min | 2 tasks | 9 files |
| Phase 05 P04 | 30min | 2 tasks | 7 files |
| Phase 05 P05 | 25 min | 2 tasks | 11 files |
| Phase 05 P06 | 75 min | 2 tasks | 7 files |
| Phase 05 P07 | 50 min | 2 tasks | 4 files |
| Phase 05 P08 | 32 min | 2 tasks | 10 files |
| Phase 05 P09 | 35 min | 2 tasks | 6 files |
| Phase 05 P10 | 95 min | 3 tasks | 8 files |
| Phase 05 P11 | 75 min | 2 tasks | 22 files |
| Phase 06 P01 | 20 min | 3 tasks | 30 files |
| Phase 06 P02 | 27min | 2 tasks | 9 files |
| Phase 06 P03 | 70min | 3 tasks | 8 files |
| Phase 06 P04 | 35min | 2 tasks | 24 files |
| Phase 06 P05 | 70min | 2 tasks | 40 files |
| Phase 06 P06 | 100min | 2 tasks | 22 files |
| Phase 06 P07 | ~2 h | 2 tasks | 24 files |
| Phase 06 P08 | 1.5h | 3 tasks | 14 files |
| Phase 07 P01 | 25 min | 2 tasks | 10 files |
| Phase 07 P02 | 30min | 3 tasks | 5 files |
| Phase 07 P03 | 25 min | 2 tasks | 2 files |
| Phase 07 P04 | 25 min | 3 tasks | 8 files |
| Phase 07 P05 | 21 min | 3 tasks | 3 files |
| Phase 07 P06 | 20 min | 2 tasks | 8 files |
| Phase 07 P07 | 45 min | 2 tasks | 2 files |
| Phase 07 P08 | 40 min | 2 tasks | 7 files |
| Phase 07 P09 | 45min | 2 tasks | 4 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: 安全網（Phase 1）先於拆檔（Phase 3）；Worker 端 AI 搶修放在 Phase 2，趕在 Gemini 2.5 下架前
- [Roadmap]: AI 挑詞／造詞邏輯（Phase 4）放在拆檔之後，讓邏輯可在 Node 直接測試
- [Roadmap]: 詞庫先做可切換的多個詞庫包（Phase 6），官方合併（Phase 12）等 Andy 實測後才做
- [Roadmap]: 編輯器資料模型（Phase 8）與縮放修正（Phase 5）都先於韻腳地圖（Phase 10）
- [Roadmap]: 拆檔方式（ES modules vs classic defer + globalThis shim）留到 Phase 3 規劃時決定
- [Phase 01]: Milestone commits go on local branch gsd/v0.96-stabilize; main (live site) untouched, nothing pushed
- [Phase 01]: Golden baseline pinned from v0.96 + readiness hook only; @playwright/test 1.63.0 [SUS too-new] cleared by automated gate (audit signatures, 0 install scripts); 1.62.1 is the fallback pin if Andy prefers
- [Phase 01]: Smoke loop not sharded (about 50 s); bootPage gained wordlist/aiReply options; UNREACHABLE list is empty
- [Phase 01]: Finding for Phase 2: stale selectedModel gpt-4.1 leaves AI uncallable, and validateWordRhyme rejects finals with an initial (e.g. 開心)
- [Phase 01]: 01-03: lhSet/lhGetJSON safety layer; storage swap is rename-only commit; banner throttle counted from show time per kind
- [Phase 01]: 01-04: saveDictOverrides drops its try/catch (lhSet never throws); other postFeedback callers stay fire-and-forget and the failure toast replaces their own toast
- [Phase 01]: 01-05: 全站只有 lhIdbOpen 一個 IndexedDB 開啟入口（v2，5 秒逾時）；備份依寫入順序 seq 淘汰、同 id 不覆寫、只備份登記鍵；詞庫快取失敗只跳 toast，備份失敗跳橫幅並改存 localStorage
- [Phase 01]: 01-06: lh:schema restored to exact previous raw value on migration failure; lhRestoreFromBackup prefers IndexedDB record over lh:backup:ls
- [Phase 02]: 02-01: stale selectedModel normalised at read time (shown as 自動, never written at boot); client keeps one preference value and the model chain lives only in the Worker
- [Phase 02]: 02-01: Gemini key only in x-goog-api-key header; browser tests run real worker/src via bridgeWorker with only upstream fetch faked
- [Phase 02]: 02-02: wrangler 4.147.0 pinned; fsevents allowed in install-script gate by orchestrator amendment; KV fill-ins are REPLACE_WITH_USER_FEEDBACK_KV_ID / REPLACE_WITH_AI_STATE_KV_ID (dry-run accepts them)
- [Phase 02]: 02-03: thinking-400 retry consumes its own attempt slot and its own tried entry; N in ALL_BUSY counts distinct model ids
- [Phase 02]: 02-03: legacy POST / rejects non-array messages with 400 {error:{message}} (full validation and caps in 02-04)
- [Phase 02]: 02-04: AI route limiter runs inside handleAi/handleLegacy before body read and fails open (no binding or limiter error); caps 65,536 bytes / 24,000 chars / 8 messages; maxTokens ceiling 2048, temperature 0..1
- [Phase 02]: 02-05: active model list = healthy, minus stale (over 183 days UTC ms or LEGACY/DEPRECATED/RETIRED) only when a fresher healthy same-family model exists; min 2 (refill prefers non-404), never empty; health doc in AI_STATE_KV, 5-min isolate cache, 72 h max age; /health.json and /health/run need non-empty admin key
- [Phase 02]: 02-06: worker:smoke runs wrangler dev with dummy --var secrets and a fake provider on free ports (no .dev.vars); DEPLOY.md makes the main merge of gsd/v0.96-stabilize the site-update step after the Worker is verified
- [Phase 03]: [03-01] verify-split 接合時去掉標籤後恰好一個換行；本機 js/css 標籤共用單一 ?v=0.96.4（含 safety.js），由 split-tags 測試守住
- [Phase 04]: 04-01: AI_TARGET=24 in js/state.js, pick path = one AI call + fillToTarget; AI failure still fills with hint; verify-split retired
- [Phase 04]: 04-02: 單字押字首 = 首字韻部相同（鏡射候選篩選，OD-2），列入 Andy UAT
- [Phase 04]: 04-03: 造詞只問一次，請求數 min(remaining*2+4,40)，驗證失敗只記 log；字典白名單擋 HTML 注入
- [Phase 04]: 04-04: 送 AI 的候選上限 AI_POOL_MAX=1000 只限 prompt，補滿仍用整個池；用完判定只看池空且唯一一輪造詞新增 0，移除補一輪旗標
- [Phase 04]: 04-05: 詞庫快取單一交易整套換版（?v= 網址、缺段整份丟棄、只刪數字鍵）；loadWordlist 單一 Promise；AI 建議等詞庫、換搜尋作廢
- [Phase 05]: 05-01: zoom is the root font-size via --ui-scale set by head script js/layout.js; lh:uiScale registered (17 keys); parity baseline in baseline-before/ is the Pass A reference, never re-capture after css/js edits
- [Phase 05]: 05-02: every whitelisted size converts to rem including values of 4px or less; only border widths of 4px or less stay px (hairlines); guard tolerates values of 4px or less
- [Phase 05]: 05-03: search placeholder reuses the long text already in index.html; tab bar height follows --tabbar-h; h1/subtitle line-height 1.2/1.3 apply at 900px and below only (desktop header 166px)
- [Phase 05]: 05-04: banner z-index 820 (flex item, stays in flow) keeps buttons clickable over desktop side panels until 05-05; dialogs sized min(w,92vw) with max-height app-h-2rem and internal scroll
- [Phase 05]: 05-05: 兩個面板同時展開的規則用邊距 page-pad 當 gutter；只有使用者親手打開造成的收起才寫入 localStorage，單純縮視窗不改偏好
- [Phase 05]: 05-05: 跨過 900 斷點時一併清掉底部面板遮罩與分頁高亮；離開手機版時批次按鈕放回原本位置
- [Phase 05]: 底部面板高度用可見高度（dvh）的 78%，上限 52rem；平板最寬 44rem 置中
- [Phase 05]: 分頁列上緣線改用內陰影，避免 48px 分頁按鈕被框線擠出視窗
- [Phase 05]: 沒開面板時亮「查韻」；Esc 只在 900 以下收起底部面板
- [Phase 05]: AI 按鈕用 order 排到詞卡後再 sticky 貼底（DOM 不動，桌機不變）
- [Phase 05]: 05-07: keyboard = text field focused and stable height minus visualViewport height >= 150; kb-short below 600; input floor max(16px, 1rem) for <=900 or coarse
- [Phase 05]: 05-08: chip x, section minus, hint clear and context refresh are real 44x44 (not ::after) so neighbouring chips and section names are never overlapped; deleting a non-empty lyrics section confirms first; context menus placed by lhPlaceMenu from measured size
- [Phase 05]: 05-10: fixed SLICE 64 (adaptive per-frame budget measured and dropped); perf absolute thresholds scaled by machine speedFactor 7.35 stored in perf-baseline.json
- [Phase 05]: 05-11: screenshot baselines are per platform (-linux committed from the cloud container); Mac needs one npm run visual:update (D-11); missing-baseline guard lives in tests/visual.spec.mjs
- [Phase 06]: 06-02: failed pack switch rolls back stored value and active pack; legacyCache honoured for v096 only; stale loads guarded by _wlGen (incl. overrides mutation)
- [Phase 06]: Keep at most 2 cached packs (active + most recently used other); eviction in the swap transaction by range delete, never clear()
- [Phase 06]: Overrides added-word de-dup by word; removed/hidden/fixed apply to every pack
- [Phase 06]: About NOTICE re-read with no-cache on every open, textContent only
- [Phase 06]: 06-04: notice_extra config field prints a 補充說明 line in NOTICE (absent for chewing, its NOTICE unchanged); vanguard-tw uses only the two non-MOE phrase files
- [Phase 06]: 06-05: 倒三角形 被 R0 刪除是唯音來源注音只有 3 個音節的資料錯誤（小麥注音版本完整、仍保留），R0 不改
- [Phase 06]: 06-05: R3 中國用語只看本來源詞頻（<100 才刪）；keep.json 放 27 個台灣日常詞、char-allow.txt 多加 9 個人名／小吃用字
- [Phase 06]: 06-05: Big5 字數只數統一漢字範圍（5,401／7,650）；規則層上線後詞庫包 rules_version 2
- [Phase 06]: 06-06: keep.json holds only 15 clearly everyday Taiwan words; 12 doubtful China-flavoured computing terms go to rules/r3-gray.json and become gray (G-china-term), judged later by the AI pass
- [Phase 06]: 06-06: deletion reports live in tools/lexicon/reports/<id>/ (not data/), seeded samples, verify recomputes stats identities; rescue command writes sorted keep.json and cannot rescue R0 format removals
- [Phase 06]: 06-08: calibration passes at 90% agreement; eval writes no files; AI-pass checklist stays D-20 (extended)
- [Phase 07]: 07-01: 修正層放 AI_STATE_KV 單一文件 corrections:v1（扁平 entries＋rev 樂觀鎖），公開 view 與 data 修正檔同形狀；網站在 data 修正檔之後兩段式套用，修正層壞掉只留警告、詞庫照載
- [Phase 07]: 07-01: 後台金鑰共用 adminKeyOk（X-Admin-Key 優先、?key= 暫留到 v2、空金鑰一律拒絕）；舊路徑 403 仍純文字但帶 CORS；整個 Phase 7 共用 ?v=0.96.10
- [Phase 07]: 07-02: rhymeDict fixed(v) 同時把 (字, to) 與 (字, from) 從 removed/hidden 拿掉，才能讓重播冪等；Python 寫回腳本照 replayEntries 註解實作
- [Phase 07]: 07-02: wordlist added 的 z 為空時不蓋既有 fixed[w]；手動新增詞可無注音，AI 收錄必須有注音
- [Phase 07]: 07-03: 字庫修正層與 data 修正檔共用 applyRhymeDictOverrideDoc，先 data 後修正層，兩段各自可缺、各自 try/catch
- [Phase 07]: 07-03: 修正層『不繞過瀏覽器快取』在 Playwright 內不可觀測（攔截路由關閉 HTTP 快取），以 loadCorrections 原始碼檢查代替標頭斷言
- [Phase 07]: 07-04: 手機批次列左右內距收到 0.5rem、900px 以下桌機批次列收緊，才能在 390／820／844 都排下第 4 顆 🚩 回報而不換行
- [Phase 07]: 07-04: 本頁已回報過只存記憶體 _reportedSet，不新增儲存鍵；一次最多 10 個、遇失敗或 429 即停
- [Phase 07]: 07-05: 後台「×1」照 UI-SPEC 一律顯示（≥3 才用警示色），不採「只有 n≥2 才顯示」
- [Phase 07]: 07-05: 亮色主題下展開鈕／篩選晶片／備註文字改用 --text-primary，「（沒有說明）」改斜體（原色對比 3.6／1.8 低於 4.5）
- [Phase 07]: 07-05: 換篩選時看不見的列自動取消選取，批次動作只作用在畫面上的列；已上線列一律被 isLocked 擋住（07-07 補撤回）
- [Phase 07]: 07-06: AI 詞卡回報模式只活在 #aiWordsContainer.report-mode class（捕獲階段攔點擊，不存保留區）；字卡與 AI 詞卡長按移除、破音字 chip 長按保留；選單 🚩 回報… 的 handler 只帶常數 'char'／'word' — D-03/D-04/D-05：手機不靠長按回報，長按留給 Phase 8/9 拖曳；T-07-19/T-07-20
- [Phase 07]: 07-07: 列內只要有一筆在線上就顯示撤回；Worker 不收的項目留在等待套用並說明；修正層讀取失敗保留舊資料只改狀態
- [Phase 07]: 07-08：--push／--confirm-only 在寫檔版暫時明確拒絕（exit 3），07-09 補實作時再放行
- [Phase 07]: 07-08：寫回腳本預覽與 --apply 都先整批驗證；只有 --apply 才檢查三個目標檔是否未 commit；非 main 訊息以 --live-branch 取代 main
- [Phase 07]: 07-09: 批次 = 日誌已記 id；清空前重抓 rev、409 重試一次；--push 須搭配 --apply；有 --push 時沒有新 commit 也 push

### Pending Todos

- [Andy 新想法 2026-10-05] 中國用語不要一律刪：台灣也聽得懂的中國用語保留，但在詞庫包裡標記「中國用語」，詞卡上加小標記（像 AI 建議標記），偏好設定加勾選框可顯示／隱藏（預設待定）。涉及：清洗流程 R3 改「標記」不刪、詞庫包格式加欄位、詞卡與設定頁。建議在 Phase 6 審查後、Phase 12 前做
- [Andy 新想法 2026-10-05] 自備金鑰（BYOK）設定頁：讓使用者填自己的 AI 金鑰（Gemini／OpenAI／Anthropic／Groq），瀏覽器直接呼叫供應商，沒填就照舊走 Worker；附「免費申請 Groq 金鑰」圖文導覽。可另開一個 phase（用 /gsd-phase 插入）
- [Andy UAT] v0.96 注音帶聲調輸入（ㄌㄞˊ、ㄏㄠˇ…）與強制輸入模式案例回傳「沒有找到結果」——golden 照現況釘住，待 Andy 判斷是否為 bug
- ✓ 已解（04-05）：詞庫 chunk 抓取回非 200 時沒有留下記錄 — 現在留 [好韻器] 詞庫分段 N 載入失敗，缺段整份丟棄
- [Andy UAT] AI「押字首」單字模式的意思：目前是「首字韻部相同」（沿用候選篩選現況）；若 Andy 要「首字聲母相同」需另改篩選
- [x] [Phase 5] 存檔失敗橫幅 #lhSaveBanner 可能擋住頂端中間的按鈕（CSS 調整）— 05-04 已解決（橫幅改排在主畫面最上方）
- [Phase 8] WR-03 剩餘：主程式讀取前等待 __hoyunSafetyReady、遷移後記憶體資料格式；第一個真實遷移須 idempotent 或加跨分頁鎖
- ✓ 已解：tests/error-visibility.spec.mjs WR-05 偶發失敗（50ms 延遲 focus 競態，測試端修正 2f2d248）
- [Phase 8/9] js/panels.js renderSavedWords 未跳脫詞彙直接插入 HTML（來源為使用者自存詞／詞庫，風險低，編輯器重寫時一併處理）
- [Advisory] admin/ 不在吞錯掃描範圍（admin/index.html:311、:586）

### Blockers/Concerns

- [Phase 2]: 研究查證（2026-10-03）：Google 官方表 gemini-2.5-flash「No shutdown date announced」，10-16 下架說法已被來源撤回；但 GitHub Models（2026-07-30）與 Groq qwen/qwen3.6-27b（2026-09-14）確定已死，前端預設 gpt-4.1 → AI 現在就不能用。Worker 仍須盡快部署上線才算止血
- [Phase 2]: 首次 `wrangler login` 需 Andy 在瀏覽器授權；`wrangler.toml` 必須宣告既有 KV 綁定，否則部署會把綁定拿掉；後台設定的純文字變數會被 wrangler 覆寫（secrets 不會）
- [Phase 5]: iOS／Android 實機縮放與鍵盤遮擋需 Andy 實測
- [Phase 6]: 授權把關（教育部辭典 CC BY-ND 僅作建置訊號、libchewing LGPL）；灰色地帶 AI 判斷需免費 API key；清洗後三字以上詞可能只剩約 2.8–3.3 萬，不足時另開 v2 語料挖掘（LEX-V2-01）
- [Phase 12]: 需要 Andy 實測詞庫包後指定組合，否則無法開始

## Deferred Verification

| Phase | State | Resume |
|-------|-------|--------|
| 02 | verification_deferred_human | /gsd-verify-work 02（先照 worker/DEPLOY.md 部署；UAT 清單 02-UAT.md） |
| 04 | verification_deferred_human | /gsd-verify-work 04（需 Worker 已部署；UAT 清單 04-UAT.md） |
| 05 | verification_deferred_human | /gsd-verify-work 05（實機鍵盤／縮放手感／美觀；UAT 清單 05-UAT.md，步驟見 TEST-CHECKLIST.md） |
| 06 | verification_deferred_human | /gsd-verify-work 06（審查 WR-01～06 已修、自動驗證 3/5＋2 項需真 AI；UAT 清單 06-UAT.md：AI 判斷、抽查刪除報告、高頻中國用語 3-15、切包手感） |

## Deferred Items

Items acknowledged and deferred at milestone close, most recent first:

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| *(none)* | | | | |

## Session Continuity

Last session: 2026-10-09T22:54:51.582Z
Stopped at: Completed 07-09-PLAN.md
Resume file: None
