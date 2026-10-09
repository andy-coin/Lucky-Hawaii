---
phase: 07-feedback-correction-layer
plan: 02
subsystem: worker-api
tags: [cloudflare-worker, kv, corrections-layer, replay-semantics, shared-vectors, playwright]
status: complete

requires:
  - phase: 07-feedback-correction-layer
    provides: "07-01 的 corrections.js（loadDoc／saveDoc／apply／公開 view）、adminKeyOk、FakeKV 失敗模式"
provides:
  - "validateEntryValue：詞／字／注音／dict_key／等級在 Worker 重驗（T-07-06）"
  - "actionToEntry 涵蓋全部 11 種後台動作（note 略過 no_effect）"
  - "replayEntries 完整規則（wordlist／rhymeDict 四個欄位），規則寫成函式上方的註解，是 07-08 Python 寫回腳本的契約"
  - "tests/fixtures/corrections-vectors.json：31 個 case + 17 筆不合格值，JS 與之後的 Python 共用"
  - "POST /corrections/revoke、POST /corrections/clear、GET /corrections/admin.json、LAYER_FULL 上限"
  - "/reports.json 用 cursor 列完全部鍵、只讀最新 800 筆、X-Reports-Truncated"
affects: [07-03, 07-04, 07-05, 07-06, 07-07, 07-08, 07-09, 07-10]

actuals:
  tokens: 17500
  tasks: 3
  commits: 5
plan_head_before: 999415d97f767c84b3613f0fc21ec38b2dd4118c
plan_head_after: b4984501e832240f35d07232ad4d5aa5e4743e36

tech-stack:
  added: []
  patterns:
    - "replayEntries 以 Map 做集合語意：先 base 順序、再依最後放入順序；更新已存在的對象不動位置"
    - "handleCorrections 外層統一接 LAYER_CORRUPT → 500，內層 route 不必重複 try/catch"
    - "trySave：put 失敗一律 503 KV_BUSY，文件不變"

key-files:
  created:
    - tests/fixtures/corrections-vectors.json
  modified:
    - worker/src/corrections.js
    - worker/src/index.js
    - tests/worker-corrections.spec.mjs
    - tests/worker-admin.spec.mjs

key-decisions:
  - "rhymeDict fixed(v) 除了把 (字, to) 從 removed／hidden 拿掉，也把 (字, from) 拿掉——否則『先移除修正後的讀音、再修正』重播第二次結果不同，違反冪等"
  - "wordlist added(item) 的 z 為空（手動新增沒填注音）時不去動既有的 fixed[w]，避免用空字串蓋掉修正過的注音"
  - "手動新增詞可以沒有注音；AI 收錄／改寫收錄的注音一定要有（空或含 ? 一律 invalid）"
  - "撤回與清空先比 baseRev（409），再判斷 ids 是否存在；全找不到：撤回 404、清空 200 不寫入"

patterns-established:
  - "共用向量：有序 entries → 預期最終狀態，JS 與 Python 都讀同一份；每個 case 還要通過『再重播一次不變』與 validateEntryValue"

requirements-completed: [FB-03, FB-04, FB-02]

coverage:
  - id: D1
    description: "11 種核准動作都對應到正確的 (target, bucket, value)；不合格的值被擋（invalid）、備註略過（no_effect）；回報上的 word 欄位與 client 送的 action 一律不看"
    requirement: FB-03
    verification:
      - kind: integration
        ref: "tests/worker-corrections.spec.mjs#修正層 Worker：動作對照（4 筆）"
        status: pass
    human_judgment: false
  - id: D2
    description: "replayEntries 的語意（連鎖修正、base 順序、更新不動位置）由共用向量釘住，且每個 case 重播兩次結果相同、base 不被改動"
    requirement: FB-03
    verification:
      - kind: integration
        ref: "tests/worker-corrections.spec.mjs#修正層 Worker：共用向量（3 筆）"
        status: pass
    human_judgment: false
  - id: D3
    description: "撤回依 id 移除（written 不動、先前的修正重新生效、全找不到 404）；清空依 id 移除並併入 written（去重、上限 5000）；admin.json 要金鑰"
    requirement: FB-04
    verification:
      - kind: integration
        ref: "tests/worker-corrections.spec.mjs#修正層 Worker：撤回／清空／後台讀取"
        status: pass
    human_judgment: false
  - id: D4
    description: "重按只留一筆；版本不符與讀到過期文件都 409；KV 太忙 503 且文件不變；文件損毀每條路徑 500 不被蓋掉；滿 2000 筆 400 LAYER_FULL"
    requirement: FB-03
    verification:
      - kind: integration
        ref: "tests/worker-corrections.spec.mjs#修正層 Worker：重按／409／503／損毀／上限"
        status: pass
    human_judgment: false
  - id: D5
    description: "/reports.json 用 cursor 列完全部鍵，只讀最新 800 筆，超過時回 X-Reports-Truncated 並開放 Expose-Headers，仍是陣列"
    requirement: FB-02
    verification:
      - kind: integration
        ref: "tests/worker-admin.spec.mjs#admin：/reports.json 鍵很多時用 cursor…、超過 800 筆…"
        status: pass
    human_judgment: false

duration: ~30 min
completed: 2026-10-10
---

# Phase 7 Plan 02: 修正層動作對照、重播語意與撤回／清空 Summary

**每一種後台核准動作都能變成修正層的一筆（Worker 重驗），重播規則用 31 個共用向量釘住，並補上依 id 撤回、清空、後台讀取，以及 /reports.json 的 cursor 列表。**

## Accomplishments
- `worker/src/corrections.js`：`validateEntryValue`、完整 `actionToEntry`（11 種動作）、完整 `replayEntries`（兩個 target 各四個欄位），規則寫在函式上方註解。
- 新路由：`GET /corrections/admin.json`（要金鑰）、`POST /corrections/revoke`、`POST /corrections/clear`；都走 403 → 405 → 413 → 400 → 409，一次只 put 一次。
- `handleCorrections` 外層統一處理 `LAYER_CORRUPT`（500，不覆蓋）；`trySave` 統一 503 `KV_BUSY`；套用超過 2000 筆回 400 `LAYER_FULL`；`written` 去重並只留最新 5000。
- `worker/src/index.js`：`/reports.json` 用 cursor 列完全部鍵名，倒序後只讀 `REPORTS_READ_MAX = 800`，超過時加 `X-Reports-Truncated: 1` 與 `Access-Control-Expose-Headers`，回應仍是原本的陣列。
- `tests/fixtures/corrections-vectors.json`（新）：31 個 case（含兩個 base 位置案例、連鎖修正）與 17 筆不合格值。

## Task Commits
1. Task 1 (tracer): `6a5715c` feat(07-02) 動作對照、驗證、完整重播與共用向量
2. Task 2 RED: `c875e27` test(07-02) 撤回、清空、後台讀取、409／503、損毀、上限、重按
3. Task 2 GREEN: `78eb93f` feat(07-02) 路由實作
4. Task 3 RED: `43ab793` test(07-02) /reports.json cursor 與截斷
5. Task 3 GREEN: `b498450` feat(07-02) cursor 列表與 X-Reports-Truncated

## Verification
- `npx playwright test tests/worker-corrections.spec.mjs`：31 passed（要求 ≥15）；`-g "共用向量"` 3 passed；`-g "撤回"` 4 passed。
- `npx playwright test tests/worker-admin.spec.mjs tests/worker-corrections.spec.mjs tests/worker-health.spec.mjs`：87 passed。
- `npm test`：**465 passed / 27 skipped / 0 failed**（基準 444 / 27 / 0）。
- 全部 acceptance_criteria 的 grep／node 檢查已逐條執行並通過（replayEntries、validateEntryValue、no_effect、三個路由、REV_MISMATCH、LAYER_FULL、REPORTS_READ_MAX = 800、X-Reports-Truncated 2 行、list_complete）。

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 計畫寫的 rhymeDict fixed 規則讓『先移除修正後的讀音、再修正』重播第二次結果不同**
- **Found during:** Task 1（共用向量的『再重播一次不變』檢查）
- **Issue:** entries = [removed(長, ㄓㄤ3), fixed(長 ㄔㄤ2→ㄓㄤ3)]。第一次結果 fixed 有一筆、removed 空；第二次以此為 base 重播時，removed(長, ㄓㄤ3) 會連帶把 from（ㄔㄤ2）放進 removed，而 fixed 只拿掉 (長, to)，ㄔㄤ2 殘留 → 結果不同，違反 D2 冪等。
- **Fix:** fixed(v) 同時把 (字, to) 和 (字, from) 從 removed／hidden 拿掉（修正在該 from 上重新生效時，連帶產生的 from 移除要讓位）。規則已寫進 replayEntries 註解；Python 寫回腳本（07-08）要照這個版本。新增向量『先移除原讀音後修正』。
- **Files modified:** worker/src/corrections.js、tests/fixtures/corrections-vectors.json
- **Commit:** 6a5715c

### 判斷與小差異（非偏離）
- wordlist `added(item)` 的 z 為空字串（手動新增沒填注音）時，不去改既有的 `fixed[w]`（計畫字面是 `fixed[w] = value.z`，會用空字串蓋掉修正過的注音）。已寫進註解；向量未涵蓋此邊角，07-08 照註解實作即可。
- 撤回／清空的檢查順序：baseRev（409）先於 ids 存在與否（404／missing）。
- 為了讓向量檔變成真正的契約，每個 case 的 entries 也必須通過 `validateEntryValue`（測試裡斷言）。

**Total deviations:** 1 auto-fixed (Rule 1)。**Impact:** 重播語意多一條規則，07-08 的 Python 要同步；無範圍外變動。

## Known Stubs
None.

## Threat Flags
None — 新增的三個路由與 /reports.json 變更都在計畫 threat_model（T-07-06～10）內，對應測試已寫（驗證、409／過期讀取、body／ids／entries／written／800 筆上限、admin.json 要金鑰、只收 agreed 的回報）。

## Issues Encountered
None。

## Next Phase Readiness
Ready for 07-03。後台可用 `GET /corrections/admin.json` 取得 entries／written／rev 來推導狀態；`POST /corrections/revoke`（`{ids, baseRev}`）已可撤回；`X-Reports-Truncated` 讓列表能提示「只顯示最新 800 筆」。07-08 的 Python 合併需照 `replayEntries` 註解與 `tests/fixtures/corrections-vectors.json` 實作（注意上面 fixed 的 (字, from) 規則）。

## Self-Check: PASSED
- 已建立／修改檔案存在：tests/fixtures/corrections-vectors.json、worker/src/corrections.js、worker/src/index.js、tests/worker-corrections.spec.mjs、tests/worker-admin.spec.mjs。
- 五個 commit（6a5715c、c875e27、78eb93f、43ab793、b498450）皆在 `git log`。
