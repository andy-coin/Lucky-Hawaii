---
phase: 07-feedback-correction-layer
plan: 08
subsystem: tools-writeback
tags: [python-stdlib, writeback, corrections-layer, idempotent-merge, byte-exact-format, git, unittest]
status: complete

requires:
  - phase: 07-feedback-correction-layer
    provides: "07-02 的 GET /corrections/admin.json、replayEntries 契約註解、tests/fixtures/corrections-vectors.json（31 case＋17 筆不合格值）"
provides:
  - "npm run corrections:writeback：讀線上修正層，預設只列差異；--apply 才寫 data/wordlist-overrides.json、data/rhyme-dict-overrides.json、data/applied-changes.log 並只 commit 這三個檔"
  - "merge／replay：Python 版重播，與 Worker 同一份向量逐 case 相同，重播兩次位元組相同"
  - "format_word／format_rhyme：與現有兩個資料檔逐位元組相同（已用真檔往返驗證）"
  - "validate_entry／check_entries：對照 Worker 的 validateEntryValue，任何一筆不合格 exit 3、不寫檔"
  - "安全停點：沒金鑰／403／連不上 exit 2；目標檔未 commit exit 3；非 main 只 commit 不 push 不清空；--push／--confirm-only 目前明確拒絕（exit 3）"
  - "npm run corrections:test（26 筆）＋ tests/corrections-writeback.spec.mjs 接進 npm test"
affects: [07-09, 07-10]

actuals:
  tokens: 9964
  tasks: 2
  commits: 2
plan_head_before: 85b484c893f4006f8c4fd84232d0803e15e7bbe2
plan_head_after: 282c7c65aab3d8fc0674a986d83f9584ffc156df

tech-stack:
  added: []
  patterns:
    - "dict 當有序集合重播：更新不動位置、先刪再放移到最後，與 JS Map 一致"
    - "寫回前先 check_entries 整批驗證，再比對 git 狀態，最後才寫檔（失敗即停，D4）"
    - "git 一律 subprocess.run 參數串列、不經 shell、GIT_TERMINAL_PROMPT=0；commit 用 `-- <3 paths>`"
    - "日誌每行帶 entry id，寫入前先讀已記過的 id，所以重跑不重複"

key-files:
  created:
    - tools/corrections/writeback.py
    - tools/corrections/tests/__init__.py
    - tools/corrections/tests/test_format.py
    - tools/corrections/tests/test_merge.py
    - tools/corrections/tests/test_writeback.py
    - tests/corrections-writeback.spec.mjs
  modified:
    - package.json

key-decisions:
  - "--push／--confirm-only 在這一版直接拒絕（exit 3、什麼都不做），而不是靜默略過；07-09 補上實作時再放行"
  - "非 main 訊息用常數，輸出時把 main 換成 --live-branch 的值，預設時與規格字串完全一致"
  - "預覽與 --apply 都先驗證整批；只有 --apply 才檢查目標檔是否有未 commit 修改"
  - "差異輸出用 + / - / ~ 表示新增／移除／改動（如「詞庫 removed +1：測試詞」），最多列 10 筆"

requirements-completed: [FB-05]

coverage:
  - id: D1
    description: "一個指令預覽差異；--apply 寫兩個資料檔（排版逐字相同）、日誌每個 id 只記一次、只 commit 三個檔，其他未提交檔案不受影響"
    requirement: FB-05
    verification:
      - kind: unit
        ref: "tools/corrections/tests/test_writeback.py#DryRunAndApply"
        status: pass
      - kind: unit
        ref: "tools/corrections/tests/test_format.py"
        status: pass
    human_judgment: false
  - id: D2
    description: "合併語意與 Worker 共用同一份向量，重播兩次結果與位元組相同；不合格值全被擋"
    requirement: FB-05
    verification:
      - kind: unit
        ref: "tools/corrections/tests/test_merge.py#SharedVectors"
        status: pass
    human_judgment: false
  - id: D3
    description: "不合格 entry、目標檔未 commit、沒金鑰／金鑰不對／連不上、commit hook 失敗、非 main 都在寫入前或寫入後安全停下；金鑰不出現在輸出、檔案、網址與 git 歷史"
    requirement: FB-05
    verification:
      - kind: unit
        ref: "tools/corrections/tests/test_writeback.py#SafetyStops"
        status: pass
      - kind: e2e
        ref: "tests/corrections-writeback.spec.mjs#寫回腳本：Python 單元測試全過"
        status: pass
    human_judgment: false
  - id: D4
    description: "用真正的 Worker 網址與真金鑰做一次預覽，看輸出是否符合 Andy 的預期"
    requirement: FB-05
    human_judgment: true
    rationale: "測試只連 127.0.0.1 的假 Worker；真實 Cloudflare 對自訂 User-Agent 的反應（RESEARCH 假設 A1）與真資料的差異列要由 Andy 在 07-10 實跑確認"

duration: ~40 min
completed: 2026-10-10
---

# Phase 7 Plan 08: 寫回腳本（讀修正層、預覽、--apply 寫檔並 commit）Summary

**`npm run corrections:writeback` 讀線上修正層，預設只列出會改什麼；加 `--apply` 才把兩個資料檔以現有排版逐字寫回、每個 id 只記一次日誌、只 commit 這三個檔；合併語意與 Worker 共用同一份 31 個測試向量，任何不合格資料、未提交的目標檔、缺金鑰或不在 main 都會在動資料前或 push 前停下。**

## Accomplishments

- **Task 1 tracer（`5594fee`）**：`fetch_layer`（`X-Admin-Key` 標頭、自訂 User-Agent、錯誤訊息不含金鑰）、`format_word`／`format_rhyme`（真檔往返逐位元組相同）、完整 `merge`、`diff_lines`、`read_logged_ids`、`apply_files`（內容沒變不動 `updated_at`）、`commit_targets`（`git commit -- <3 paths>`）。
- **Task 2（`282c7c6`）**：`validate_entry`（對照 `validateEntryValue`，含 `fullmatch` 與 Unicode Cc／BOM 規則）、`check_entries`（整批先驗）、目標檔 dirty 檢查、`--live-branch` 路徑、commit hook 失敗回報。
- 測試共 **26 筆**（要求 ≥14）：format 4、merge 6（含每個向量的 subTest）、writeback 16；`npm test` **547 passed / 27 skipped / 0 failed**（基準 546 / 27 / 0，多的 1 筆是新 spec）。

## Task Commits

1. Task 1 tracer: `5594fee` feat(07-08) 預覽差異、--apply 寫檔、日誌去重、只 commit 三個檔
2. Task 2: `282c7c6` feat(07-08) 向量對齊、驗證、dirty／非 main／缺金鑰安全停點

## Verification

- `npm run corrections:test`：Ran 26 tests, OK。
- `npx playwright test tests/corrections-writeback.spec.mjs tests/lexicon-build.spec.mjs`：3 passed。
- `npm test`：547 passed / 27 skipped / 0 failed。
- acceptance_criteria：`def merge(` 1、`shell=True` 0、`GIT_TERMINAL_PROMPT` ≥ 1（2）、`corrections:writeback`／`corrections:test` 兩個 script 存在、`find tools -name __pycache__` 0、`git diff --exit-code -- data/...` 乾淨、`def validate_entry` 1、`corrections-vectors.json` 在 test_merge.py 1 次、「合併到 main 後用 --confirm-only」1 次。

## Deviations from Plan

### TDD 紅綠沒有拆成兩個 commit
- **Found during:** 兩個 task（皆 `tdd="true"`）
- **Issue:** Python 測試要 import 尚不存在的 `writeback`，Task 1 的「紅」只會是 ImportError（INVALID_RED），而且紅色 commit 會讓 `npm test`（含新 spec）整套變紅，違反「不要留下紅燈的套件」。
- **Handling:** Task 2 先寫測試、對 Task 1 的實作跑過一次，確認 `validate_entry` 缺少時整批 ERROR，再實作到全綠；兩個 task 各一個 `feat` commit（測試與實作同 commit）。沒有留下 RED 證據檔。
- **Impact:** 無功能影響；只是 git 歷史不是 test→feat 兩段。

### 判斷與小差異（非偏離）
- `--push`／`--confirm-only`：計畫說 07-09 才加。這一版若被傳入，直接 exit 3 拒絕，避免使用者以為已經推了。測試鎖住「遠端什麼都沒收到、沒有清空請求」。
- 測試用 `GIT_CONFIG_GLOBAL=/dev/null`、`NO_PROXY=127.0.0.1` 隔離使用者的全域 git 設定與系統 proxy。
- 向量沒涵蓋的邊角（手動新增 z 為空不蓋掉既有 `fixed`）補了一筆 test_merge 單元測試，依 07-02 SUMMARY 的註解實作。
- Python 的 `\s` 與 JS 的 `\s` 只差 U+FEFF，已在字元類別明確排除；`$` 一律用 `fullmatch`（Python 的 `$` 會放過結尾換行）。

**Total deviations:** 0 auto-fixed（1 項流程偏離見上）。**Impact:** 僅 `tools/corrections/`、`tests/corrections-writeback.spec.mjs`、`package.json`；真實的 `data/*.json` 與 `applied-changes.log` 未動。

## Known Stubs

None。

## Threat Flags

None — 沒有新增網路端點或信任邊界；T-07-24（validate_entry＋共用不合格向量＋exit 3）、T-07-25（金鑰只從環境變數進標頭，輸出／檔案／git 歷史／網址皆有斷言）、T-07-26（`commit -- <3 paths>`、dirty 中止、不經 shell、`GIT_TERMINAL_PROMPT=0`、不相關的未提交檔不被帶進 commit）皆有對應測試。

## Issues Encountered

None。

## User Setup Required

要真的跑一次需要 Andy 設定環境變數 `LH_ADMIN_KEY`（後台金鑰）。指令：`LH_ADMIN_KEY=… npm run corrections:writeback`（預覽）；確認差異後再加 `-- --apply`。目前不要加 `--push`（還沒實作，會被拒絕）。

## Next Phase Readiness

- 07-09 在 `run()` 的「已 commit；要推上線請加 --push」之後接 push、`merge(live, batch) == live` 輪詢確認、`POST /corrections/clear`（409 重抓 rev）；`merge` 與 `replay` 已可直接拿來做線上確認。`--poll-interval`／`--timeout`／`--site`／`--remote` 旗標已先宣告。
- 07-10 人工驗收：真 Worker／真金鑰預覽一次（D4，含自訂 User-Agent 在 Cloudflare 上的實際反應）。

## Self-Check: PASSED

- 檔案：`tools/corrections/writeback.py`、`tools/corrections/tests/{__init__,test_format,test_merge,test_writeback}.py`、`tests/corrections-writeback.spec.mjs`、`package.json` 存在。
- Commits：`5594fee`、`282c7c6` 在 `git log`；`git rev-list --count 85b484c..282c7c6` = 2。

---
*Phase: 07-feedback-correction-layer*
*Completed: 2026-10-10*
