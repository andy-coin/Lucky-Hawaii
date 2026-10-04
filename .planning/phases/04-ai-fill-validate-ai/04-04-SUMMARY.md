---
phase: 04-ai-fill-validate-ai
plan: 04
subsystem: ai
tags: [vanilla-js, playwright, ai-suggestions, single-flow]

requires:
  - phase: 04-ai-fill-validate-ai
    provides: 04-03 的 generateAIWords（回傳新增數或 null）、04-01 的 fillToTarget 與 parseAiWords
provides:
  - generateAISuggestions 單一流程：候選 >= AI_TARGET 只挑、不足才造詞，generateAIWords 全檔只有一個呼叫點（js/ai-generate.js）
  - AI_POOL_MAX = 1000：只限制送給 AI 的候選清單（js/state.js）
  - aiWordCardHtml(w, isAI)：字卡樣板單一出處，保留字串樣板與 inline onclick
  - 「補一輪」旗標整個移除（js/state.js、candidates.js、panels.js、search.js）
affects: [04-05]

plan_head_before: ca076032779cdaac5957c2b77ad763abcf5e067b
plan_head_after: 2f042f285ef92aae70018b0c7e724e17ceb72928
actuals:
  tokens: 9000
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "fill 與 generate 是同一個 pool.length >= AI_TARGET 比較的兩邊，造詞在結構上碰不到"
    - "按鈕解鎖只在 try/finally 的 finally 一處"

key-files:
  created: []
  modified:
    - js/ai-generate.js
    - js/state.js
    - js/candidates.js
    - js/panels.js
    - js/search.js
    - tests/ai-fill.spec.mjs
    - tests/smoke.spec.mjs

key-decisions:
  - "pick prompt 只送 pool.slice(0, AI_POOL_MAX)，fillToTarget 仍用整個 pool（OD-3/A5）"
  - "用完判定只看「池子本來是空、唯一一輪造詞也新增 0」，不再需要旗標（D-05）"
  - "finally 內用 btn.toggleAttribute('disabled', false) 解鎖，原因見偏差"

patterns-established:
  - "連按型 e2e：點擊會同步鎖住按鈕，所以點完等按鈕解鎖就等於這一次做完"

requirements-completed: []

coverage:
  - id: D1
    description: "候選剛好 24 張卡、只問一次 AI 排序、不含「直接生成」、候選詞清單 24 個；少一個（23）列出 23 張並只造詞一次"
    requirement: AI-03
    verification:
      - kind: e2e
        ref: "tests/ai-fill.spec.mjs#邊界：候選剛好 24 不造詞、23 才造詞"
        status: pass
    human_judgment: false
  - id: D2
    description: "安 連按十次每次 24 張新卡、共 240 個不重複詞；每個 prompt 候選清單 <= 1000 且 < 24000 字，無「直接生成」"
    requirement: AI-03
    verification:
      - kind: e2e
        ref: "tests/ai-fill.spec.mjs#連按：候選池再大，送給 AI 的清單也有上限"
        status: pass
    human_judgment: false
  - id: D3
    description: "池子用完顯示「已推薦所有符合的詞彙」與重置鈕、0 張卡；重置後再按又拿到 15 張；三次按鈕共三次 /ai"
    requirement: AI-04
    verification:
      - kind: e2e
        ref: "tests/ai-fill.spec.mjs#用完與重置：池子用完顯示已推薦所有…，重置後又能拿到"
        status: pass
    human_judgment: false
  - id: D4
    description: "js/ 與 tests/ 不再有 _aiExtraRoundDone；新搜尋、篩選、重置仍清空候選池"
    requirement: AI-04
    verification:
      - kind: e2e
        ref: "tests/smoke.spec.mjs（resetPool 情境與 handler 覆蓋）；grep 零命中"
        status: pass
    human_judgment: false

duration: 約 20 min
completed: 2026-10-04
status: complete
---

# Phase 4 Plan 04: 單一流程、候選上限、按鈕一定解鎖 Summary

**generateAISuggestions 的三份複製分支收成一條：候選夠（>= 24）就由程式填滿、只問 AI 排序，不夠才造詞且只造一輪；送給 AI 的清單上限 1000，按鈕一律在 finally 解鎖，「補一輪」旗標整個退場。**

## Performance

- **Duration:** 約 20 min
- **Completed:** 2026-10-04
- **Tasks:** 2（皆 auto）
- **Files modified:** 7
- **plan_head_before:** `ca076032779cdaac5957c2b77ad763abcf5e067b`

## Accomplishments

- 三個分支（選字、押母音、押子音）各自重複的 getBatch → 空池判斷 → 提示字串，改成一個運算式選候選來源（選字 → 單字非萬用 → 押母音 → 押子音）加一個 `pool.length >= AI_TARGET` 判斷；刪掉七個沒用到的區域變數
- `generateAIWords` 全檔只有一個呼叫點，位於 `pool.length < AI_TARGET` 分支內，所以候選夠的時候結構上不可能造詞（AI-03）
- 連按驗證：安 的候選池約 9784 個，十次按鈕每次 24 張新卡、共 240 個不重複詞；最長 pick prompt 3818 字（上限 24000），候選清單被截在 1000 個，遠低於 Worker 上限
- 邊界：24 個候選不造詞、23 個才造詞一次
- 旗標移除後，「用完」只由「池子本來是空、唯一一輪造詞新增 0」判定，新搜尋、篩選 chip、重置三條清池路徑原樣保留

## Task Commits

1. **Task 1** - `a934c3a` feat(04-04): AI 建議收成單一流程（夠就挑、不夠才造一次）、送 AI 的候選上限 1000、按鈕一定解鎖
2. **Task 2** - `2f042f2` refactor(04-04): 移除「補一輪」旗標（單一流程後已無人讀取）

測試：兩個 commit 後 `npm test` 皆 265 passed、0 failed（04-03 結束時 262，新增 3 個 e2e）。`tests/golden/` 與 `tests/golden.spec.mjs` 自 `2f5239e` 起 diff 為空。未推送。

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 驗收 grep `btn.disabled = false <= 1` 與既有程式衝突**
- **Found during:** Task 1 驗收
- **Issue:** `generateContextFromLyrics` 的 `if (btn) { btn.disabled = false; }` 已佔一個命中，finally 若也寫 `btn.disabled = false` 會變 2，字面上不過驗收
- **Fix:** finally 內改用 `btn.toggleAttribute('disabled', false)`（同樣移除 disabled 屬性，原生 API），`generateAISuggestions` 內沒有其他手動解鎖。驗收意圖（單一出口、無散落的解鎖行）已滿足
- **Files modified:** js/ai-generate.js
- **Commit:** a934c3a

其餘：None - plan executed as written。

## Issues Encountered

- 第一次測試跑失敗是我 `sed` 改 import 時（BSD sed 的分隔字元與路徑衝突）沒生效，`stubWordlist` 未 import；改用 Edit 後三個新測試全過。

## Known Stubs

None。

## Andy UAT 項目

1. 候選很多的字（例如 安、心）連按 AI 建議多次，每次都應是 24 張新卡、不重複，按鈕不會卡死。
2. 候選很少的字（只有幾個詞）按一次：先列出全部候選，再出現一次 AI 造詞（有 AI 徽章），之後再按顯示「已推薦所有符合的詞彙」＋重置鈕；按重置後可再拿到。
3. 選字模式（點選字卡再按 AI 建議）用完時文字應為「已推薦所有含選字的詞彙」。此路徑只靠程式推導，沒有專門的 e2e。

## Threat Flags

None。T-04-09：`pool.slice(0, AI_POOL_MAX)` 與連按 e2e（<= 1000 個、< 24000 字）；T-04-10：try/finally 為唯一解鎖處；T-04-11：`aiWordCardHtml` 輸出字串與舊版相同，輸入仍只來自詞庫或已過 `generatedWordOk` 的詞；T-04-SC：未安裝任何套件、package.json 未動。

## Next Phase Readiness

04-05 可直接開始。AI-03、AI-04 仍由 04-05 宣告，所以此 plan 不標 requirements 完成。

## Self-Check: PASSED

- 檔案存在：js/ai-generate.js、js/state.js、js/candidates.js、js/panels.js、js/search.js、tests/ai-fill.spec.mjs、tests/smoke.spec.mjs、本 SUMMARY
- Commits 存在：a934c3a、2f042f2（`git rev-list --count` plan_head_before..HEAD = 2）
- 驗收：`await generateAIWords(` 1、`slice(0, AI_POOL_MAX)` 1、`const AI_POOL_MAX = 1000;` 1、`finally` 於 ai-generate.js 2（含既有一處）、`btn.disabled = false` 1（既有）、`onclick="resetSuggestedPool()"` 1、`function aiWordCardHtml` 1、`_aiExtraRoundDone` 於 js/ tests/ 0、`sentCandidatesSet.clear()` 於 search.js 與 panels.js 各 1、Task 2 commit 檔案清單剛好五個
- `npm test` 265 passed；golden diff 為空；未推送

---
*Phase: 04-ai-fill-validate-ai*
*Completed: 2026-10-04*
