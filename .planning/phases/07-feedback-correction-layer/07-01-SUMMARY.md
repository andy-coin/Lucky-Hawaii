---
phase: 07-feedback-correction-layer
plan: 01
subsystem: worker-api
tags: [cloudflare-worker, kv, corrections-layer, admin-auth, cors, playwright]
status: complete

requires:
  - phase: 02-worker-ai
    provides: Worker 路由、AI_STATE_KV 綁定、回報／後台路徑
  - phase: 06-lexicon-packs
    provides: applyWordlistOverrides 對每個詞庫包都套用的規則
provides:
  - "worker/src/corrections.js：corrections:v1 文件、POST /corrections/apply（rev 樂觀鎖）、GET /corrections.json（公開 view）"
  - "adminKeyOk 共用金鑰檢查（X-Admin-Key 優先、?key= 暫留、空金鑰一律拒絕）與預檢 Max-Age 7200"
  - "網站兩段式詞庫修正（data 修正檔 → 修正層）與 loadCorrections"
  - "測試基礎：routeExternal corrections 選項、FakeKV 失敗模式（failPut／staleOnce／分頁 list／lastGetOpts）"
affects: [07-02, 07-03, 07-04, 07-05, 07-06, 07-07, 07-08, 07-09, 07-10]

actuals:
  tokens: 13700
  tasks: 2
  commits: 3
plan_head_before: 6abfbc4b6258eeec53a8e0cf2a6876d9e3e272b4
plan_head_after: 2a058492031c876c121b0b738b6095225e713c76

tech-stack:
  added: []
  patterns:
    - "Worker 模組以注入 helpers（json／readBodyCapped／adminKeyOk／originAllowed）避免與 index.js 循環引用"
    - "修正層儲存為扁平 entries，公開 view 由 replayEntries 依序重播推導（同一詞後者勝）"

key-files:
  created:
    - worker/src/corrections.js
    - tests/worker-corrections.spec.mjs
    - tests/corrections-site.spec.mjs
  modified:
    - worker/src/index.js
    - js/dict.js
    - js/wordlist.js
    - index.html
    - tests/helpers.mjs
    - tests/worker-helpers.mjs
    - tests/worker-admin.spec.mjs

key-decisions:
  - "handleCorrections 的 adminKeyOk／originAllowed 注入為無參數閉包（index.js 已綁好 request／url／env／origin），比計畫寫的直接傳函式更簡單"
  - "applyWordlistOverrides 的 base 抓不到回 undefined、解析出 null 仍走『套用失敗』記錄，保持 wordlist-cache 既有測試語意"
  - "不新增 wrangler.toml 設定；X-Admin-Key 預檢只靠 CORS 標頭"

patterns-established:
  - "Worker 寫入路由：key 先於 method、body 先限大小再解析、rev 不符 409、put 失敗 503 且文件不變"
  - "測試 Worker 路由用 FakeKV 失敗模式，不用真 KV"

requirements-completed: [FB-03]

coverage:
  - id: D1
    description: "後台套用已核准的「移除詞」回報進 KV 修正層，只 put 一次、不動回報 KV"
    requirement: FB-03
    verification:
      - kind: integration
        ref: "tests/worker-corrections.spec.mjs#修正層 Worker：套用「移除詞」→ 200，AI_STATE_KV 恰好寫一次，報告 KV 不動"
        status: pass
    human_judgment: false
  - id: D2
    description: "GET /corrections.json 公開 view 只含修正內容（無 id／來源／時間／written），帶 Cache-Control、Vary、cacheTtl 30，其他來源 403、非 GET 405"
    requirement: FB-03
    verification:
      - kind: integration
        ref: "tests/worker-corrections.spec.mjs#修正層 Worker：公開讀取只回修正內容，帶 Cache-Control／Vary，KV 讀取走 cacheTtl 30"
        status: pass
    human_judgment: false
  - id: D3
    description: "網站套用修正層後該詞不在 wordlistData／wordPhoneticMap／wordPriorityMap；修正層壞掉只留警告、詞庫照常載入；只抓一次"
    requirement: FB-03
    verification:
      - kind: e2e
        ref: "tests/corrections-site.spec.mjs#修正層：套用「移除詞」後重新整理，網站詞庫就沒有那個詞（只抓一次修正層）"
        status: pass
      - kind: e2e
        ref: "tests/corrections-site.spec.mjs#修正層：抓不到、慢過 3 秒、形狀不對 → 只留一則警告，詞庫照常載入"
        status: pass
    human_judgment: false
  - id: D4
    description: "所有後台路徑共用 adminKeyOk；X-Admin-Key 優先、?key= 暫留、空金鑰一律拒絕；舊 403 純文字但帶 CORS；預檢允許 X-Admin-Key、Max-Age 7200"
    requirement: FB-03
    verification:
      - kind: integration
        ref: "tests/worker-admin.spec.mjs#admin：（20 筆，含 6 筆新增）"
        status: pass
      - kind: integration
        ref: "tests/worker-corrections.spec.mjs#修正層 Worker：預檢允許 X-Admin-Key／空金鑰一律拒絕"
        status: pass
    human_judgment: false
  - id: D5
    description: "27 個本機 ?v= 標籤全部 0.96.10"
    verification:
      - kind: automated_ui
        ref: "tests/split-tags.spec.mjs"
        status: pass
    human_judgment: false

duration: ~25 min
completed: 2026-10-10
---

# Phase 7 Plan 01: 修正層 tracer 與後台金鑰強化 Summary

**後台套用「移除詞」到 KV 修正層（corrections:v1），公開 view 與資料檔同形狀，網站在 data 修正檔之後兩段式套用，重新整理那個詞就不見；同時所有後台路徑改共用 adminKeyOk（X-Admin-Key、空金鑰拒絕）。**

## Accomplishments
- `worker/src/corrections.js`：`loadDoc`／`saveDoc`／`actionToEntry`（remove_word、hide_word）／`replayEntries`／`buildView`／`handleCorrections`。apply 只收 kvKeys，由 Worker 讀回報 KV 轉換；同一詞多筆回報合併；rev 樂觀鎖 409、put 失敗 503 `KV_BUSY`、文件損毀 500 且不覆蓋。
- `worker/src/index.js`：`adminKeyOk`、CORS Allow-Headers 加 X-Admin-Key、Max-Age 7200、`json()` 可帶額外標頭、`readBodyCapped` 匯出、`handleCorrections` 掛在 `handleFeedbackAdmin` 之後。舊路徑 403 body 與狀態碼不變但帶 CORS；`wrangler.toml` 未動。
- `js/dict.js` `loadCorrections()`（memoized、3 秒逾時、不加 no-cache、永不 reject）；`js/wordlist.js` 抽出 `applyWordlistOverrideDoc`，`applyWordlistOverrides` 先 data 修正檔再修正層，兩段各自 try/catch。
- 測試：`routeExternal` 的 `corrections` 選項（view／`'down'`／`'bad'`／`'hang'`）與 `EMPTY_CORRECTIONS`；`FakeKV` 加 `lastGetOpts`、`failPut`、`staleOnce`、分頁 `list`；兩份新 spec 與 `worker-admin.spec.mjs` 新增 6 筆。
- `index.html` 27 個本機標籤 `?v=0.96.10`（整個 Phase 7 共用）。

## Task Commits
1. Task 1 (tracer): `961f18a` feat(07-01) 修正層 tracer
2. Task 2 RED: `6efe755` test(07-01) 失敗測試
3. Task 2 GREEN: `2a05849` feat(07-01) adminKeyOk 全面套用、舊 403 帶 CORS、FakeKV 失敗模式

## Verification
- Task 1 verify（worker-corrections／corrections-site／worker-admin／split-tags／wordlist-cache／lexicon-packs／golden）：106 passed。
- Task 2 verify（worker-admin／worker-health／worker-corrections／worker-ai）：127 passed；`-g "admin："` 20 passed（要求 ≥17）。
- `npm test`：**444 passed / 27 skipped / 0 failed**（基準 423 / 27 / 0）。
- 全部 acceptance_criteria 已逐條執行並通過（grep 計數、`?v=0.96.10` 27 個、`wrangler.toml` 無差異）。

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] base 修正檔解析出 `null` 時少了警告**
- **Found during:** Task 1 驗證（tests/wordlist-cache.spec.mjs 修正檔格式壞掉）
- **Issue:** 重構後 `if (base)` 把 JSON `null` 當成「沒有修正檔」，原本會丟 TypeError 並留下「詞庫修正檔套用失敗」記錄。
- **Fix:** 沒有檔案／非 200 回 `undefined`，只有 `undefined` 才略過；其餘（含 `null`）走 try/catch。
- **Files modified:** js/wordlist.js
- **Commit:** 961f18a（同一 commit 內修好）

### 判斷與小差異（非偏離）
- 計畫寫 `h = { adminKeyOk, originAllowed }` 但兩者簽名不一致；實作統一成無參數閉包，行為相同。
- 額外加了一個網站 e2e（修正層 down／bad／hang 只留一則警告、詞庫照載），計畫 C4 要求但原步驟沒列。
- `AbortSignal.timeout(3000)` 的 hang 情境耗時約 3.5 秒，測試放在同一個 test 內依序跑三種模式。

**Total deviations:** 1 auto-fixed (Rule 1)。**Impact:** 無範圍外變動。

## Known Stubs
None.

## Threat Flags
None — 新增的兩個路由（`GET /corrections.json`、`POST /corrections/apply`）與 CORS 變更都已在計畫 threat_model（T-07-01～05）內，對應測試已寫。

## Issues Encountered
- 部署提醒（非本計畫範圍）：Worker 要先於 main 部署，因為舊後台仍用 `?key=`，新網站的 `loadCorrections` 在 Worker 未部署前只會留一則警告、不影響詞庫。

## Next Phase Readiness
Ready for 07-02。`actionToEntry` 只接 remove_word／hide_word，07-02 補齊其餘動作時不需改 entry 形狀；`replayEntries` 的 rhymeDict 目前只回空形狀，也由 07-02 補。

## Self-Check: PASSED
- 已建立檔案存在：worker/src/corrections.js、tests/worker-corrections.spec.mjs、tests/corrections-site.spec.mjs。
- 三個 commit（961f18a、6efe755、2a05849）皆在 `git log`。
