---
phase: 04-ai-fill-validate-ai
plan: 03
subsystem: ai
tags: [vanilla-js, playwright, node-vm, ai-generation, xss-guard]

requires:
  - phase: 04-ai-fill-validate-ai
    provides: 04-02 的 validateWordRhyme（與候選篩選同一規則）、04-01 的 parseAiWords
provides:
  - generatedWordOk：造出的詞每字須在字典、選字模式看固定字位、否則同候選規則（js/candidates.js）
  - buildGenPrompt：與判定一致的造詞提示（js/candidates.js）
  - generateAIWords 重寫：一次按鈕一次 callLLM、逐詞驗過、全部標 AI、回傳新增數或 null（js/ai-generate.js）
affects: [04-04, 04-05]

plan_head_before: ea3a936a1a1a1f04a87a92d9c34ef1dc8434619d
plan_head_after: ca076032779cdaac5957c2b77ad763abcf5e067b
actuals:
  tokens: 6500
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "進樣板前的唯一關卡是 generatedWordOk：字典內才放行，< > 引號 & 不可能出現在卡片"
    - "提示與判定寫在同一個檔、各自是 Node 可測的純函式，防止兩邊說的不一樣"

key-files:
  created: []
  modified:
    - js/candidates.js
    - js/ai-generate.js
    - tests/ai-fill.spec.mjs

key-decisions:
  - "造詞只問一次：失敗回 null 並顯示白話原因，沒詞通過回 0 並顯示「唉...」；不換模型、不追加（D-05、D-09）"
  - "請求數量 min(remaining*2+4, 40)：驗證會丟詞，而且只有一輪"
  - "造出的詞同時加進 suggestedPool 與 sentCandidatesSet，避免之後被當成新候選再送出"

patterns-established:
  - "e2e 用 expect.poll 等 /ai 請求、再等狀態字消失、再多等 300ms，才斷言「之後沒有第二次請求」"

requirements-completed: []

coverage:
  - id: D1
    description: "候選 12 個（<24）時一次按鈕只打一次 /ai；混合回覆只留 開心、傷心、真心，共 15 張卡，沒有注入元素，丟棄只記 log"
    requirement: AI-04
    verification:
      - kind: e2e
        ref: "tests/ai-fill.spec.mjs#造詞一輪：候選不足只造一次、不合格丟掉、不足不追加（情境 A）"
        status: pass
    human_judgment: false
  - id: D2
    description: "14 個合格詞只留前 12（24 − 12）共 24 張；沒有合格詞顯示「唉...」且無 AI 卡；皆只呼叫一次"
    requirement: AI-04
    verification:
      - kind: e2e
        ref: "tests/ai-fill.spec.mjs#造詞一輪（情境 B、C）"
        status: pass
    human_judgment: false
  - id: D3
    description: "generatedWordOk：ab心、<i>心、開丂、非 BMP 字詞、含引號詞被拒；選字模式固定字位 ∈ selectedChars（開心過、美音不過）"
    requirement: AI-04
    verification:
      - kind: unit
        ref: "tests/ai-fill.spec.mjs#generatedWordOk：只收字典內的字、押字尾規則與選字模式"
        status: pass
    human_judgment: false
  - id: D4
    description: "造詞提示與判定一致：押字首問首字韻腳、純聲母、字數、同聲調、排除借韻、選字、多字不限、數量上限 40、排除清單 40 個、台灣日常繁體中文"
    requirement: AI-04
    verification:
      - kind: unit
        ref: "tests/ai-fill.spec.mjs#buildGenPrompt：押字首看韻部、純聲母、字數、同聲調、選字、多字"
        status: pass
    human_judgment: false
  - id: D5
    description: "AI 回傳的詞是否為台灣慣用繁體（而非簡體用語）"
    requirement: AI-04
    verification: []
    human_judgment: true
    rationale: "提示已要求台灣日常繁體中文；字是否簡體用語屬判斷題，待 Phase 6 詞庫工作"

duration: 約 15 min
completed: 2026-10-04
status: complete
---

# Phase 4 Plan 03: 造詞一輪、逐詞驗證、提示與判定一致 Summary

**候選不夠時 AI 只造一次，每個詞要字字在字典且通過與候選相同的押韻規則才上畫面並標 AI；提示改成問判定接受的東西（押字首問首字韻腳，不再問聲母）。**

## Performance

- **Duration:** 約 15 min
- **Completed:** 2026-10-04
- **Tasks:** 2（皆 auto、tdd）
- **Files modified:** 3
- **plan_head_before:** `ea3a936a1a1a1f04a87a92d9c34ef1dc8434619d`

## Accomplishments

- 舊流程會逐模型重試、直接 `split` 後只靠壞掉的判定；現在單一 `callLLM`、`parseAiWords`、去重、排除已列出／已建議／已保留、`generatedWordOk`、截到 `remaining`
- 每個 code point 都必須是 `charInfo` 的 key：`<i>心`、`ab心`、`開丂`、`𠮷心` 全部進不了樣板（T-04-06）
- 失敗與「想不到」分開：AI 沒答成回 `null` 並顯示 Worker 白話原因或後備句；有答但無合格詞回 `0` 並顯示「唉...」
- `buildGenPrompt` 六行提示涵蓋：押字尾、押字首（首字韻腳）、純聲母、字數 chip、同聲調、排除借韻、同字、選字、多字不限

## Task Commits

1. **Task 1** - `b92b897` feat(04-03): 造詞只問一次，每個詞驗過讀音與字典才顯示並標 AI
2. **Task 2** - `ca07603` feat(04-03): 造詞提示與押韻判定一致（押字首看韻部、純聲母、字數、同聲調、選字）

測試：每個 commit 後 `npm test` 皆全綠（Task 1 後 261 passed，最終 262 passed、0 failed）；`tests/golden/` 與 `tests/golden.spec.mjs` 自 PHASE_BASE `2f5239e` 起 diff 為空。未推送。

## Deviations from Plan

None - plan executed exactly as written。小處理：Node 測試 generatedWordOk 多放了含單引號詞（`開'心`）一例；`buildGenPrompt` 在 `familyLabel` 為空時省略「韻部：」片語、同聲調句子在搜尋字查不到讀音（純聲母）時略過，避免出現空殼句子。

## Issues Encountered

- 首版 Node 測試誤用 Playwright 沒有的 `toBeTypeOf`；刪掉那行（它本來就只是為了讓 `rhymeJudge` 設狀態），其餘不變。

## Known Stubs

None。

## Andy UAT 項目

1. 押字首（單字）造詞：提示現在問「首字押『X』的韻腳」（首字韻部相同），不再問首字聲母（OD-2）。例：搜「心」押字首，音樂、心情算押。若你想要的是首字聲母相同，要改篩選與驗證兩處，請告知。
2. 候選不足時按一次 AI 建議，應只出現一次「AI 生成補充詞…」，AI 造的詞全部有 AI 徽章；有些詞被丟掉是正常的，只會留在主控台。
3. AI 偶爾回簡體用語無法自動擋，屬 Phase 6 詞庫工作。

## Threat Flags

None。T-04-06：generatedWordOk 字典白名單 + e2e 注入 `<i>心`；T-04-08：e2e 斷言只有一次 /ai 且之後無請求；T-04-SC：未安裝任何套件。

## Next Phase Readiness

04-04 可直接沿用 `generateAIWords(remaining, container, excludeSet)` 的回傳值（新增數或 null）；呼叫端的「補一輪」旗標 `_aiExtraRoundDone` 與三處 pool-0 分支尚未動，留給 04-04。AI-04 在最後一個宣告它的 plan 完成前不標完成。

## Self-Check: PASSED

- 檔案存在：js/candidates.js、js/ai-generate.js、tests/ai-fill.spec.mjs、本 SUMMARY
- Commits 存在：b92b897、ca07603（`git rev-list --count` plan_head_before..HEAD = 2）
- 驗收：`function generatedWordOk` 1、`generatedWordOk(` 於 ai-generate.js 1、`validateWordRhyme(` 於 ai-generate.js 0、`AI 造詞：丟棄` 1、`function buildGenPrompt` 1、`buildGenPrompt(` 於 ai-generate.js 1、舊「首字聲母為」提示 0、`直接生成` 於 candidates.js 1
- `npm test` 262 passed；golden diff 為空；未推送

---
*Phase: 04-ai-fill-validate-ai*
*Completed: 2026-10-04*
