---
phase: 07-feedback-correction-layer
plan: 09
subsystem: tools-writeback
tags: [python-stdlib, writeback, push, cdn-poll, clear-batch, idempotent-rerun, unittest, e2e]
status: complete

requires:
  - phase: 07-feedback-correction-layer
    provides: "07-08 的 writeback.py（merge／replay、apply_files、commit_targets、fetch_layer、--push／--confirm-only 旗標先宣告）；07-02 的 POST /corrections/clear（rev／409、written[]）"
provides:
  - "--apply --push：在 --live-branch 上寫檔、commit、push，輪詢網站直到 merge(線上, 這批) == 線上（忽略 updated_at），才 POST /corrections/clear 只清這批 id"
  - "confirmed_batch：這批 = 修正層裡 id 已記在 applied-changes.log 的項目；寫回期間或別的分支才套用的不會被清"
  - "--confirm-only：不寫檔、不 commit、不 push、任何分支都可，只確認線上已生效並清空已記過的那批；沒有可確認的印「沒有需要確認的修正」exit 0"
  - "逾時 exit 4（預設 1200 秒、每 30 秒，訊息含「不是壞掉，CDN 還沒更新，過幾分鐘用 --confirm-only 重跑」）；清空 409 重抓 rev 同樣 id 再試一次，仍失敗 exit 5"
  - "任何一步中斷後直接重跑：不重複 commit／日誌／資料項目，commit 沒推出去的也會在重跑時推出去"
  - "端到端離線證明：真 Worker 程式碼＋暫存 clone＋本機 bare 遠端＋慢半拍的假 Pages＋真腳本（ROADMAP 準則 4）"
affects: [07-10]

actuals:
  tokens: 8000
  tasks: 2
  commits: 2
plan_head_before: 09d44c49f6b2c4c73aecf51211527997120c148a
plan_head_after: 7d164cc00463fe2b0e6a38f19d21543ef09a89a2

tech-stack:
  added: []
  patterns:
    - "確認生效 = merge(線上, 這批) 等於線上（merge 冪等，不需任何狀態，別人中途又推了別的也不怕）"
    - "批次由日誌決定，不由「這次讀到的整個修正層」決定；每次執行都從新讀的修正層＋日誌重算"
    - "清空前重抓 rev（等待期間 rev 多半變了），409 再重抓一次；超過 100 筆分批，批與批之間等 1.1 秒（KV 每秒一次寫入）"
    - "測試的假網站用計數器控制「第 N 次輪詢才換新」，on_poll 掛鉤在輪詢中途改假 Worker 的修正層"

key-files:
  created:
    - tools/corrections/tests/test_live.py
  modified:
    - tools/corrections/writeback.py
    - tools/corrections/tests/test_writeback.py
    - tests/corrections-writeback.spec.mjs

key-decisions:
  - "批次 = 日誌裡有的 id；push 之後不再另抓修正層重算，用開頭讀到的那份與日誌取交集（未記日誌者不可能進批次）；清空前才重抓 rev"
  - "--push 沒有 --apply 一起用直接 exit 3（什麼都不做），不默默略過"
  - "有 --apply --push 時，即使沒有新 commit 也 push（上次可能 commit 完就中斷），push 失敗 exit 3 且不清空"
  - "預覽模式遇到「資料檔已包含這批修正」多提示可用 --confirm-only 完成清空"

requirements-completed: [FB-05]

coverage:
  - id: D1
    description: "main 上 --apply --push：push → 輪詢到線上真的換新 → 只清這批 id；輪詢中新套用的一筆留在修正層"
    requirement: FB-05
    verification:
      - kind: unit
        ref: "tools/corrections/tests/test_live.py#PushPollClear.test_push_waits_for_the_site_then_clears_only_the_batch"
        status: pass
      - kind: e2e
        ref: "tests/corrections-writeback.spec.mjs#寫回腳本：端到端"
        status: pass
    human_judgment: false
  - id: D2
    description: "逾時 exit 4 不清空；清空 409 重試一次（同 id、新 rev）；兩次失敗 exit 5 修正層不動；超過 100 筆分批"
    requirement: FB-05
    verification:
      - kind: unit
        ref: "tools/corrections/tests/test_live.py#PushPollClear"
        status: pass
    human_judgment: false
  - id: D3
    description: "未帶 --push 不 push；非 live 分支不 push 不清空；push 失敗 exit 3 不清空；--push 不帶 --apply 被拒絕"
    requirement: FB-05
    verification:
      - kind: unit
        ref: "tools/corrections/tests/test_live.py#PushPollClear"
        status: pass
      - kind: unit
        ref: "tools/corrections/tests/test_writeback.py#SafetyStops.test_push_without_apply_is_refused"
        status: pass
    human_judgment: false
  - id: D4
    description: "--confirm-only（任何分支、沒有已記的就說沒有）；commit 後／push 後逾時／輪詢中新增一筆後重跑都不重複不遺失；--live-branch release；--help 預設值"
    requirement: FB-05
    verification:
      - kind: unit
        ref: "tools/corrections/tests/test_live.py#Interruptions"
        status: pass
    human_judgment: false
  - id: D5
    description: "第一次真的對線上 Worker、真網站、真 origin 跑 --apply --push，看 GitHub Pages 實際多久換新、訊息是否好懂"
    requirement: FB-05
    human_judgment: true
    rationale: "測試只連 127.0.0.1 與本機 bare 遠端；真實 CDN 延遲與真 push 由 Andy 在 07-10 人工驗收"

duration: ~45 min
completed: 2026-10-10
---

# Phase 7 Plan 09: 推上線、等線上生效、只清這一批（FB-05 外送那一半）Summary

**`--apply --push` 在 main 上推完之後，每 30 秒（可調）看網站的兩個修正檔，直到「線上 + 這批 = 線上」才只清這批 id；逾時 exit 4 不清、清空 409 重試一次、`--confirm-only` 補做確認，任何一步中斷後重跑都不重複不遺失；整段用真 Worker 程式碼、本機 bare 遠端與慢半拍的假 Pages 離線跑通。**

## Accomplishments

- **Task 1 tracer（`5bec75c`）**：`confirmed_batch`、`git_push`、`fetch_live`（`?cb=` 只是順手加，不依賴）、`wait_until_live`（可注入時鐘；讀不到一律當「還沒生效」並印出原因、不含金鑰）、`clear_ids`（409 重抓 rev、同 id 再試；其他失敗 exit 5；超過 100 筆分批、批間等 1.1 秒）、`finish_live`、`--confirm-only` 路徑；`run()` 重排成「預覽／寫檔 commit／非 live 分支停下／未帶 `--push` 停下／push → 等 → 清」。端到端 spec「寫回腳本：端到端」：第一次執行清 k1、k2，k3（輪詢第 1 次時才套用）留在修正層；第二次寫入 k3 恰好一個新 commit 並清空；第三次沒有新 commit、沒有清空請求。
- **Task 2（`7d164cc`）**：逾時、409、409＋500、分批、其他分支＋`--push`、push 失敗、`--confirm-only`（其他分支、沒有已記的）、commit 後中斷、push 後逾時再 `--confirm-only`、輪詢中新增一筆再重跑、`--live-branch release`、`--help` 預設值、注入時鐘的逾時。
- 測試：`npm run corrections:test` **42 筆全過**（07-08 為 26，新增 test_live 16、test_writeback 以「--push 不帶 --apply 被拒絕」取代舊的「暫時拒絕」）；端到端 spec 約 0.7 秒（三次執行共約 580 ms、詞庫檔輪詢 4 次）；`npm test` **548 passed / 27 skipped / 0 failed**（基準 547，多的 1 筆是端到端）。

## Task Commits

1. Task 1 tracer: `5bec75c` feat(07-09) 推上去、等線上真的換新、才清空這一批（寫回腳本全部實作、test_live 的推送／逾時／409／分批測試、端到端 spec）
2. Task 2: `7d164cc` test(07-09) --confirm-only、中斷後重跑、--live-branch、注入時鐘的行為鎖定

## Verification

- `npm run corrections:test`：Ran 42 tests, OK。
- `npx playwright test tests/corrections-writeback.spec.mjs`：2 passed（含「寫回腳本：端到端」）。
- `npm test`：548 passed / 27 skipped / 0 failed。
- acceptance_criteria：`def wait_until_live`／`def confirmed_batch` 各 1、`/corrections/clear` 與「CDN 還沒更新」在 writeback.py、`confirm_only` 2、「沒有需要確認的修正」1、`--help` 內有 1200、`find tools -name __pycache__` 0、`git log --grep '^資料：寫回修正層' 952d24f..HEAD` 空（真 repo 沒有寫回 commit、沒有 push）。

## Deviations from Plan

### TDD 與 task 邊界
- **Found during:** 兩個 task
- **Issue:** `--confirm-only`、冪等重跑與 `--push` 共用同一段流程，Task 1 的 `run()` 本來就得一次寫完；Task 2 沒有獨立的實作增量。Python 測試對尚不存在的函式只會 ImportError（INVALID_RED），而且紅色 commit 會讓 `npm test` 變紅。
- **Handling:** 實作與全部行為先寫完、全綠，再拆成兩個 commit：Task 1 = 實作＋push／逾時／409／分批測試＋端到端；Task 2 = 中斷重跑、`--confirm-only`、`--live-branch`、注入時鐘等測試。沒有 RED 證據檔。
- **Impact:** 無功能影響；git 歷史裡 Task 2 只有測試。

### Auto-fixed / 判斷
- **[Rule 2 - 缺漏] 分批清空**：Worker 的清空路由一次最多收 100 個 id（`MAX_APPLY_KEYS`），批次可能更多（修正層上限 2000）。`clear_ids` 超過 100 筆分批，用每批回應的新 rev 接著清，批間等 1.1 秒（KV 同 key 每秒一次寫入）。已有測試（把批大小調成 2）。
- **`--push` 不帶 `--apply`**：計畫沒寫。直接 exit 3 拒絕，避免使用者以為已經推了。
- **預覽訊息**：資料已 commit 但還沒清空時，預覽多印「推上線後用 --confirm-only」提示。
- 07-08 的 `test_push_and_confirm_only_are_refused_for_now` 因實作完成而移除，改測「--push 不帶 --apply 被拒絕」。

**Total deviations:** 1 項流程偏離、1 項 Rule 2 補強。**Impact:** 僅 `tools/corrections/`、`tests/corrections-writeback.spec.mjs`；真實 `data/*.json`、`applied-changes.log` 未動，沒有 push 真 repo，沒有對真 Worker／真網站發請求。

## Known Stubs

None。

## Threat Flags

None — 沒有新增端點或信任邊界。T-07-27（push 只在 `--push` 且在 live 分支；其他分支＋`--push` 有測試證明遠端沒收到東西；測試遠端一律是暫存 bare repo）、T-07-28（只在 `merge(線上, 這批) == 線上` 之後、只清日誌裡的 id、409 重試 id 不變、失敗不動修正層，皆有測試）、T-07-29（接受）、T-07-SC（只用標準函式庫，沒有安裝任何套件）。

## Issues Encountered

None。

## User Setup Required

跟 07-08 一樣需要 `LH_ADMIN_KEY`。真正對外跑一次由 Andy 在 07-10 驗收：先預覽（`npm run corrections:writeback`），確認後 `npm run corrections:writeback -- --apply --push`（要在 main 上）。等不到線上換新（約 10 分鐘的 CDN 快取）就會逾時 exit 4，過幾分鐘用 `--confirm-only` 重跑即可。**同時只開一個寫回。**

## Next Phase Readiness

- 07-10：人工驗收清單加上「對真 Worker／真 origin 跑一次 `--apply --push`，記下實際等了多久」。ROADMAP 準則 4 的離線部分已證明。

## Self-Check: PASSED

- 檔案：`tools/corrections/writeback.py`、`tools/corrections/tests/test_live.py`、`tools/corrections/tests/test_writeback.py`、`tests/corrections-writeback.spec.mjs` 存在。
- Commits：`5bec75c`、`7d164cc` 在 `git log`；`git rev-list --count 09d44c4..7d164cc` = 2。

---
*Phase: 07-feedback-correction-layer*
*Completed: 2026-10-10*
