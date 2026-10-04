---
phase: 04-ai-fill-validate-ai
plan: 05
subsystem: wordlist
tags: [vanilla-js, indexeddb, playwright, wordlist-cache, race-condition]

requires:
  - phase: 04-ai-fill-validate-ai
    provides: 04-04 的單一流程 generateAISuggestions（候選夠才挑、不夠才造一次）
provides:
  - loadWordlist 單一 Promise（不 reject、成功後立刻 resolve、失敗後下次重抓）（js/wordlist.js）
  - AI 建議在詞庫未就緒時顯示「詞庫載入中…」並等同一個載入，換搜尋就作廢（js/ai-generate.js）
  - 詞庫快取整套換版：單一唯讀交易讀、單一寫入交易換、?v= 網址、meta no-cache、缺段整份丟棄
  - tests/wordlist-cache.spec.mjs（慢速 x2、版本、非 200）；bootPage waitWordlist 選項；stub 路由接受 ?v=
affects: [phase-06-wordlist-release]

plan_head_before: 2f042f285ef92aae70018b0c7e724e17ceb72928
plan_head_after: b20745e5937f632cdd59cf76325862028848424d
actuals:
  tokens: 14000
  tasks: 3
  commits: 2

tech-stack:
  added: []
  patterns:
    - "分段先全進記憶體、齊了才寫快取；一個交易刪數字鍵、寫十段、寫 ver"
    - "快取在套 overrides 之前寫入（put 當下結構化複製），快取永遠是原始內容"
    - "wordlistData 只在 overrides 套完後才公開"

key-files:
  created:
    - tests/wordlist-cache.spec.mjs
  modified:
    - js/wordlist.js
    - js/state.js
    - js/ai-generate.js
    - tests/helpers.mjs

key-decisions:
  - "applyWordlistOverrides 改為吃進清單、回傳清單，不再改全域，避免 wordlistData 出現未套修正的中間狀態"
  - "loadWordlist 在 .catch 內吞掉意外例外並 lhWarn，保證 never rejects"
  - "沒做的可選項：以 meta.chunks 取代 WORDLIST_CHUNKS、離線時沿用舊快取（Phase 6 換詞庫包時再評估）"

patterns-established:
  - "慢速載入 e2e：context.route 卡閘門，release 後驗證請求數與卡片數"
  - "版本更新 e2e：可變 state 驅動的 meta／分段 stub，同一 context 跨頁保留 IndexedDB"

requirements-completed: [PERF-03, AI-03, AI-04]

coverage:
  - id: D1
    description: "詞庫載入中按 AI 建議：顯示「詞庫載入中…」、等詞庫期間 0 次 /ai、放行後 24 張卡、剛好 1 次挑詞請求、不含「直接生成」、分段請求恰 10 次"
    requirement: PERF-03
    verification:
      - kind: e2e
        ref: "tests/wordlist-cache.spec.mjs#慢速：詞庫還沒載完就按 AI 建議，會等詞庫、不誤觸造詞"
        status: pass
    human_judgment: false
  - id: D2
    description: "等詞庫期間換搜尋：那次按鈕動作作廢，0 張卡、0 次 /ai、按鈕解鎖、#aiLoading 隱藏"
    requirement: PERF-03
    verification:
      - kind: e2e
        ref: "tests/wordlist-cache.spec.mjs#慢速：等詞庫期間換了搜尋，那次按鈕動作作廢"
        status: pass
    human_judgment: false
  - id: D3
    description: "版本更新：meta 讀不到不寫快取且網址無 v=；V1 整套快取；V2 缺第 3 段時舊 V1 十段原封不動、AI 按鈕只提示失敗、0 次 /ai；修好後同頁重試整套換 V2（chunk 0 最慢到仍依編號排序）、快取是原始讀音而記憶體是 overrides 後的讀音、sentinel 與備份清單不變；同版本再開 0 次分段請求"
    requirement: PERF-03
    verification:
      - kind: e2e
        ref: "tests/wordlist-cache.spec.mjs#版本：改版時整套換新、缺一段就保留舊的整套、網址帶 v="
        status: pass
    human_judgment: false
  - id: D4
    description: "分段回 500：留下 [好韻器] 詞庫分段 5 載入失敗 記錄、wordlistData 為 null、無存檔橫幅、按 AI 建議提示載入失敗且 0 次 /ai"
    requirement: PERF-03
    verification:
      - kind: e2e
        ref: "tests/wordlist-cache.spec.mjs#非 200：詞庫分段回 500 會留下記錄、AI 不會用殘缺詞庫"
        status: pass
    human_judgment: false
  - id: D5
    description: "既有行為不退化：快取寫入失敗只跳 toast、v1 升級 v2 保留 sentinel 鍵、分段 3 壞掉與 meta 壞掉的記錄、IndexedDB 被擋仍可查韻"
    requirement: PERF-03
    verification:
      - kind: e2e
        ref: "tests/save-failure.spec.mjs、tests/storage.spec.mjs、tests/error-visibility.spec.mjs（原樣全綠）"
        status: pass
    human_judgment: false
  - id: D6
    description: "按 AI 建議後的手感（24 個夠不夠好用、押字首語意、補滿詞可接受度、造詞是否押韻、剛開頁就按的體驗）"
    requirement: AI-03
    verification:
      - kind: human
        ref: "下方「給 Andy 的試用清單」"
        status: pending
    human_judgment: true

duration: 約 30 min
completed: 2026-10-04
status: complete
---

# Phase 4 Plan 05: 詞庫載入競態、整套換版與 Phase 4 收尾 Summary

**詞庫載入改成單一 Promise：AI 建議在詞庫未就緒時等同一個載入、不誤觸造詞；快取改成單一交易整套換版（?v= 網址、缺段整份丟棄、舊快取原封不動）；Phase 4 gate 全綠。**

## Accomplishments

- `loadWordlist()` 回傳單一共用 Promise：載入中重複呼叫拿到同一個（頁面載入與 AI 按鈕共用，分段請求恰 10 次）、成功後立刻 resolve、失敗後下次呼叫重抓；`wordlistLoading` 旗標與 state.js 宣告整個移除
- `generateAISuggestions` 在算候選前，若詞庫還是 null：#aiLoading 顯示「詞庫載入中…」→ `await loadWordlist()` → 若 `currentRhymes` 或 `rhymeMode` 換了就直接作廢 → 仍為 null 則 toast「詞庫載入失敗，請重新整理頁面」。null 不會被當成空候選，所以暫時缺詞庫不可能走到造詞
- 快取讀取：`_idbReadCache` 單一唯讀交易讀 ver 與十段，版本相同且十段齊全才用，否則整套走網路
- 快取寫入：`_idbReplaceAll` 單一寫入交易，`delete(IDBKeyRange.bound(0, 1e9))` 只刪數字鍵、再 put 十段與 ver；字串鍵（ver、sentinel）與 backups store 不碰；`_idbPut`、`_idbGet` 刪除
- 網路載入：分段網址帶 `?v=<meta 版本>`，meta 用 `cache: 'no-cache'`；非 200 丟 `HTTP <status>`，沿用既有 `[好韻器] 詞庫分段 N 載入失敗` 標記（解決 STATE 待辦「詞庫 chunk 抓取回非 200 時沒有留下記錄」）；任一段缺就整份丟棄、不寫快取
- 組裝依分段編號順序，不受完成先後影響；快取在套 overrides 之前寫入，快取永遠是原始內容（Pitfall 5）
- helpers：`bootPage({ waitWordlist: false })`；`stubWordlist` 路由正則接受 `?v=`，第一段判斷改看 pathname（Pitfall 6）

## Task Commits

1. **Task 1** - `f90262b` feat(04-05): 詞庫未就緒時 AI 建議會等詞庫（同一個載入），換搜尋就作廢
2. **Task 2** - `b20745e` feat(04-05): 詞庫快取改為整套換版（單一交易、網址帶版本、缺段不用、非 200 留記錄）
3. **Task 3** - 無程式變更（phase gate）；只更新 gitignored 的 04-VALIDATION.md

`npm test`：Task 1 後 267 passed、Task 2 後 269 passed、0 failed（04-04 結束時 265）。

## Phase 4 Gate 輸出

| # | 檢查 | 結果 |
|---|------|------|
| 1 | `npm test` | **269 passed**、0 failed（Phase 4 前基準 248；退役 1 個 verify-split 負向對照，新增 22 個測試） |
| 2 | `git diff --quiet 2f5239e HEAD -- tests/golden tests/golden.spec.mjs`（PHASE_BASE = `2f5239eabc519a8d5a0037eea2a58f8a61b9a9aa`） | 無 diff，golden 未動 |
| 3 | 已移除識別字 | `_aiExtraRoundDone` 於 js/ tests/ 0 命中；`wordlistLoading`、`_idbPut` 於 js/ 0 命中 |
| 4 | 提交紀律 | `^fix(04` 恰一個：`aa9aa67 fix(04-02)`，只動 `js/candidates.js`；第一個 Phase 4 commit `6eb377f test(04-01)` 只動 `tests/split-tags.spec.mjs`、`tests/verify-split.mjs` |
| 5 | index.html 本機標籤版本 | `grep -o '?v=[0-9.]*' index.html \| sort -u` 只有 `?v=0.96.5` |
| 6 | 沒有推送 | `git branch -r --contains HEAD` 0 行 |
| 7 | 04-VALIDATION.md | 每列 ✅ green 並附測試名稱、Wave 0 勾選、`status: complete`、`nyquist_compliant: true`、`wave_0_complete: true`、sign-off 勾選（gitignored，未提交） |

階段 commit 共 14 個（`6eb377f`..`b20745e`），皆在本機分支 `gsd/v0.96-stabilize`。

## Deviations from Plan

None - plan executed as written。

小備註（非偏差）：Task 1 的 loader 最外層另加 `.catch(e => lhWarn('詞庫載入失敗', e))`，確保「never rejects」在 applyWordlistOverrides 遇到意外壞格式時也成立；plan 的 `_wlP ??= …finally` 骨架其餘照寫。

## Issues Encountered

None。兩次測試都是第一次就全綠。版本 e2e 一次跑通，我另外靠 `d.ver` 在失敗後仍為 V1、sentinel 與備份 id 不變等斷言確認它不是空轉。

## Known Stubs

None。

## 給 Andy 的試用清單

Worker 上線後（`worker/DEPLOY.md`）請回答，格式「1.是 2.否（怎麼不對）…」：

1. 用「心」「安」「愛」各按一次 AI 建議（押字尾），是否每次都剛好 24 個、詞夠好用？
2. 切到「押字首」再試，是否接受「首字韻部相同」的意思？（OD-2/A1。若你要的是「首字聲母相同」，要改的是候選篩選，不是驗證）
3. AI 挑不夠 24 個時，程式依詞頻補上的詞（OD-3/A2）是否可接受？
4. 候選不足時 AI 造出的詞，是否都押韻？
5. 剛開網頁就立刻按 AI 建議，是否先看到「詞庫載入中…」，然後正常出詞？

另外記錄：

- **行為變更（OD-3/A6）：** 詞庫只要缺任何一段就整份不用（`wordlistData` 維持 null），AI 按鈕提示「詞庫載入失敗，請重新整理頁面」，再按會重抓；以前是用殘缺詞庫默默繼續。整詞讀音查詢在這種情況下退回逐字讀音。
- **已知上限：** 舊版 loader 已經在「目前版本」底下混出來的快取，會一直留到下次詞庫發新版（Phase 6 發新版時整套換新）。
- **前置條件：** Phase 2 延後的 Worker 部署還沒做，線上真實 AI 呼叫要等部署後才能用。

## Threat Flags

None。T-04-12：`?v=`、meta no-cache、單一交易讀與換、版本 e2e；T-04-13：`_idbReplaceAll` 在 overrides 之前呼叫，e2e 確認快取 z 是原始值；T-04-14：delete 限數字鍵，e2e 確認 sentinel 與備份 id 不變、storage.spec sentinel 測試維持綠；T-04-16：gate 輸出全記錄在上表；T-04-SC：沒有安裝套件、package.json 未動。

## Next Phase Readiness

Phase 4 全部 5 個計畫完成，剩 Andy 的手感驗收。PERF-03、AI-03、AI-04 已標完成。

## Self-Check: PASSED

- 檔案存在：js/wordlist.js、js/state.js、js/ai-generate.js、tests/helpers.mjs、tests/wordlist-cache.spec.mjs、本 SUMMARY
- Commits 存在：f90262b、b20745e（`git rev-list --count plan_head_before..HEAD` = 2）
- 驗收：`wordlistLoading` js/ 0；`await loadWordlist()` 與 `詞庫載入中…` 於 ai-generate.js 各 >= 1；`_wlP ??=` 1；`waitWordlist` >= 1；`_idbPut` 於 wordlist.js 0；`function _idbReplaceAll` 1；`IDBKeyRange.bound(0` 1；`cache: 'no-cache'` 2；`encodeURIComponent` 1；helpers 正則 1；`-g "慢速"` 2 passed；`-g "版本|非 200"` 2 passed
- `npm test` 269 passed；golden 無 diff；未推送

---
*Phase: 04-ai-fill-validate-ai*
*Completed: 2026-10-04*
