---
phase: 07-feedback-correction-layer
plan: 10
subsystem: phase-gate-docs
tags: [worker-smoke, wrangler-dev, deploy-guide, acceptance-checklist, phase-gate]
status: complete

requires:
  - phase: 07-feedback-correction-layer
    provides: "07-01～07-09 的修正層路由、後台、回報入口、寫回腳本與各份摘要裡的交接事項"
provides:
  - "worker/test/dev-smoke.mjs 步驟 5a～5e：真 workerd＋本機 KV 跑 預檢 → 標頭金鑰核准 → 套用 → 公開讀取 → 撤回"
  - "worker/DEPLOY.md「第 7 階段：回報與修正層」：新網址、部署順序、KV 額度表、寫回指令、正式環境人工驗收"
  - "TEST-CHECKLIST.md 的 Phase 7 必測／建議測、D-21～D-23、07-CTX-1～29"
  - "驗收清單-精簡版.md 的 2-18～2-24、3-16～3-18、4-16～4-18、5-51、5-B 的 5-52～5-63"
affects: []

actuals:
  tokens: 5950
  tasks: 2
  commits: 2
plan_head_before: 6dc14c264927ab14ad663fb981ed5c083198c15e
plan_head_after: 99cca14a894181e3133bd2924787452220b2cece

tech-stack:
  added: []
  patterns:
    - "冒煙測試的寫入路徑之間等 1.1 秒（KV 同鍵一秒一寫），讀取輪詢最多 3 秒等本機 KV 讀取快取"

key-files:
  created: []
  modified:
    - worker/test/dev-smoke.mjs
    - worker/DEPLOY.md
    - .planning/TEST-CHECKLIST.md
    - .planning/驗收清單-精簡版.md

key-decisions:
  - "新增的冒煙步驟接在原步驟 (5) 之後、(6) 排程之前，原有步驟與最後一行「全部通過」都不動"
  - "舊的清單項目裡提到的「回報 / 意見」「回報視窗」「最下面的回報」是第 7 階段改名前的說法，兩份清單都改成「意見回饋」「意見」並註明改名"
  - "精簡版的級別題數表同步更正（原表第 3 級寫 14 但實際 15 題），現為 5／24／18／18／63 共 128"
  - "快照基準：darwin 16 個檔已由 07-04／07-06 重拍；linux 16 個檔留給 Andy 在雲端容器重拍，記為 D-22／3-17"

requirements-completed: [FB-01, FB-02, FB-03, FB-04, FB-05]

coverage:
  - id: D1
    description: "真 workerd＋本機 KV：預檢允許 X-Admin-Key；標頭金鑰讀回報與核准；admin.json 沒金鑰 403；套用後 rev 1；公開 /corrections.json 帶 max-age=60、有被移除的詞、不含 kvKey、陌生來源 403；撤回後公開版不再有該詞"
    requirement: FB-03
    verification:
      - kind: integration
        ref: "npm run worker:smoke（步驟 5a～5e，18 個 ✓ 後輸出 全部通過）"
        status: pass
    human_judgment: false
  - id: D2
    description: "部署說明：新網址、Worker 先於 main 的順序、KV 額度表、寫回指令與逾時處理"
    requirement: FB-05
    verification:
      - kind: unit
        ref: "grep LH_ADMIN_KEY／--confirm-only 於 worker/DEPLOY.md"
        status: pass
    human_judgment: true
    rationale: "文件是否讓 Andy 看得懂、照著做得出來，只有 Andy 能判斷"
  - id: D3
    description: "Andy 的驗收清單與自主決定表（正式環境走一次、真手機、Pages 分支、雲端截圖重拍）"
    requirement: FB-01
    verification:
      - kind: unit
        ref: "grep 07-10 於 TEST-CHECKLIST.md（15 筆）；grep 回報 於精簡版（23 筆）"
        status: pass
    human_judgment: true
    rationale: "ROADMAP 的人工驗收（正式環境 核准→套用→寫回 push→清空）必須由 Andy 用真 Worker 與真 GitHub 做"
  - id: D4
    description: "第 7 階段總檢查：npm test、corrections:test、worker:smoke、worker:check、27 個 ?v=0.96.10、tools 無 __pycache__、wrangler.toml 與真實資料檔自 952d24f 零差異"
    verification:
      - kind: integration
        ref: "見本檔 Phase Gate 表"
        status: pass
    human_judgment: false

duration: ~40 min
completed: 2026-10-10
---

# Phase 7 Plan 10: 真 Worker 冒煙、部署說明與驗收清單、第 7 階段總檢查 Summary

**在真的 workerd＋本機 KV 上證明「回報 → 標頭金鑰核准 → 套用 → 網站公開讀取（max-age=60）→ 撤回 → 消失」，補上 DEPLOY.md 第 7 階段（Worker 先於 main、KV 額度表、寫回指令）與兩份給 Andy 的驗收清單（含 29 條自主決定），全部自動化檢查通過。**

## Accomplishments

- **Task 1（tracer，`aec9183`）**：`dev-smoke.mjs` 的 `call` 多收 `headers`；步驟 5a～5e：OPTIONS 預檢允許 `X-Admin-Key`（204）；`/feedback` 存「不該出現」回報、用標頭金鑰讀 `/reports.json`、`/reports/decision` 核准成 `remove_word`；`/corrections/admin.json` 沒金鑰 403、有金鑰 rev 0；`/corrections/apply` 200 rev 1；`/corrections.json` 200、`Cache-Control` 含 `max-age=60`、`wordlist.removed` 含該詞、全文沒有 kvKey、陌生來源 403；等 1.1 秒（KV 同鍵一秒一寫）後 `/corrections/revoke` 200，輪詢最多 3 秒到公開版不再有該詞。第一次執行就全綠。
- **Task 2（`99cca14`）**：
  - `worker/DEPLOY.md`：新增「第 7 階段」：7-1 新網址表與「不需新 KV／密鑰、wrangler.toml 沒改」、7-2 部署順序（Worker 先上線，因舊後台仍用 `?key=`，v2 才移除）、7-3 KV 免費額度表（一次回報最多 10 筆）、7-4 寫回四步（預覽、`--apply`、`--apply --push` 最多等 20 分鐘、`--confirm-only`／`--live-branch`；逾時不是壞掉、不要同時跑兩個、留意 Cloudflare 對腳本的反應）、7-5 正式環境人工驗收。
  - `TEST-CHECKLIST.md`：總覽；必測 07-04-1～5、07-06-1～3、07-05-1～3、07-07-1～3、07-10-1～5；建議測 07-04-6、07-05-4、07-07-4、07-06-4、07-10-6；D-21（Pages 分支）、D-22（雲端重拍 linux 截圖）、D-23（舊金鑰與匯出按鈕何時移除）；07-CTX-1～29 涵蓋 A1～E10、UI-SPEC D-01～D-21 與各計畫的取捨。
  - `驗收清單-精簡版.md`：2-18～2-24（含正式環境走一次上／下）、3-16～3-18、4-16～4-18、5-51、5-B 的 5-52～5-63（各列指向 07-CTX 編號，☐同意 ☐不同意）；更新開場說明與題數表；1-4 補「Worker 先上線再合併 main」。

## Task Commits

1. Task 1 (tracer): `aec9183` test(07-10) 真正的 Worker 執行環境跑一次 回報→核准→套用→公開讀取→撤回
2. Task 2: `99cca14` docs(07-10) 第 7 階段部署說明、Andy 的驗收清單與自主決定

## Phase Gate（依序執行，全數通過）

| 指令 | 結果 |
|---|---|
| `npm test` | **548 passed / 27 skipped / 0 failed**（1.8 分鐘，與基準一致） |
| `npm run corrections:test` | 42 tests OK |
| `npm run worker:smoke` | 全部通過（含新增 5a～5e 共 18 個 ✓、無 ✗） |
| `npm run worker:check` | exit 0；綁定 USER_FEEDBACK_KV、AI_STATE_KV、AI_LIMITER；無 WARNING |
| `grep -o '?v=0\.96\.10' index.html \| wc -l` | 27 |
| `find tools -name __pycache__` | 無輸出 |
| `git diff --exit-code 952d24f -- worker/wrangler.toml data/wordlist-overrides.json data/rhyme-dict-overrides.json data/applied-changes.log` | exit 0，零差異 |

驗收條件逐條：`/corrections/apply` 4（≥2）、`/corrections/revoke` 2（≥1）、`X-Admin-Key` 3（≥2）、`LH_ADMIN_KEY` 於 DEPLOY.md 4（≥1）、`--confirm-only` 2（≥1）、`07-10` 於 TEST-CHECKLIST 15（≥1）、`回報` 於精簡版 23（≥3）。

## 07-01～07-09 交接事項收集結果（全數落到清單）

- 人工驗收：真 iOS 鍵盤（07-04）→ 4-16；真機後台批次手感（07-05）→ 4-17；AI 回報列三種主題觀感（07-06）→ 4-18；黏頂套用列手感與實際生效時間（07-07）→ 4-17、2-22；真 Worker／真金鑰預覽、Cloudflare 對自訂 User-Agent 的反應（07-08）→ 2-24；第一次真的 `--apply --push` 與實際等待時間、真實 CDN 延遲（07-09）→ 2-24。
- 自主決定：×1 計數標籤與待審優先排序、換篩選取消選取、重播規則補充、對比色票、`?v=` 共用 0.96.10、版面微調、快取測不到改看原始碼等 → 07-CTX-8～29、5-B。
- 動手事項：`-linux.png` 基準 → D-22／3-17；Pages 發佈分支 → D-21／3-16；舊金鑰與備援按鈕 → D-23／3-18；Worker 先於 main 部署 → 1-4、DEPLOY 7-2。

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 先前清單裡的舊名稱與第 7 階段改名不一致**
- **Found during:** Task 2（寫清單時檢查現有「回報」字樣）
- **Issue:** 07-04 把頁首「回報」改名「意見」、設定裡「✉️ 回報 / 意見」改名「✉️ 意見回饋」；兩份清單裡的 05-07-4、05-07-5、05-11-1、05-08-14（精簡版 2-7、2-8、4-13）仍寫舊名稱，Andy 照著做會找不到。
- **Fix:** 兩份清單的對應句子改成新名稱並註明第 7 階段改名。
- **Files modified:** .planning/TEST-CHECKLIST.md、.planning/驗收清單-精簡版.md
- **Commit:** 99cca14

**2. [Rule 1 - Bug] 精簡版題數表與實際不符**
- 原表第 3 級寫 14 題、合計 101，但已有 3-1～3-15 共 15 題。重算並更新為 5／24／18／18／63＝128。
- **Commit:** 99cca14

### 判斷與小差異（非偏離）

- 計畫寫「步驟 5b 讀 kvKey 用標頭金鑰」：回報本體用 `reportType: '不該出現'` 的 `word-report`，Worker 的 `/feedback` 本來就接受，不需要改 Worker。
- 冒煙測試在撤回前加 `sleep(1100)`（計畫沒寫）：真 KV 同一個鍵一秒只能寫一次，本機剛好沒擋，但留著才不會在別的環境偶發 503。
- 精簡版第 5 級 5-B 把 29 條 07-CTX 合併成 12 列（5-52～5-63），每列標出對應 07-CTX 編號；完整逐條在 TEST-CHECKLIST（計畫要求「short 5-B list pointing to numbers」）。
- 07-CTX-18 的上限數字（2000／5000／100／16 KB）是研究者建議值、非 CONTEXT 決定，已在自主決定裡點名。
- 任何自動檢查都沒有失敗，所以沒有需要回頭到前面計畫修檔的小 commit。

**Total deviations:** 2 auto-fixed（皆為 Rule 1，文件一致性）。**Impact:** 僅 `.planning/` 兩份清單的文字，無程式變動。

## Authentication Gates

None（所有 Worker 動作都在本機 `wrangler dev` 上、用假金鑰 `smoke-admin`；沒有 `wrangler login`／`deploy`、沒有 push）。

## Known Stubs

None.

## Threat Flags

None — 冒煙測試只用假的 --var 金鑰，沒有 `.dev.vars`、沒有真金鑰（T-07-31；`worker-config.spec` 的金鑰樣式掃描在 `npm test` 中全綠）；部署順序與「舊金鑰用法保留到 v2」已寫進 DEPLOY.md 7-2（T-07-30）；本計畫沒有安裝任何套件（T-07-SC）。

## Issues Encountered

None.

## Next Phase Readiness

- 第 7 階段十個計畫全部完成，等 orchestrator 驗證與標記完成（本計畫沒有執行 phase.complete）。
- 需要 Andy 本人的事：D-1（Worker 上線）、2-23／2-24 正式環境走一次、D-21／D-22／D-23；詳見兩份清單。

## Self-Check: PASSED

- 檔案：`worker/test/dev-smoke.mjs`、`worker/DEPLOY.md`、`.planning/TEST-CHECKLIST.md`、`.planning/驗收清單-精簡版.md` 存在且已提交。
- Commits：`aec9183`、`99cca14` 在 `git log`；`git rev-list --count 6dc14c2..HEAD` = 2。
- 兩個 Task 的 acceptance_criteria 與 Phase Gate 全數 PASS。
