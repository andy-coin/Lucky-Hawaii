---
phase: 04-ai-fill-validate-ai
plan: 01
subsystem: ai
tags: [vanilla-js, playwright, node-vm, ai-suggestions]

requires:
  - phase: 02-ai-service
    provides: Worker /ai 換手鏈與前端 aiError 白話訊息
  - phase: 03-split-index
    provides: js/ 拆檔、tests/core-node.spec.mjs 的 node:vm 載入模式
provides:
  - AI_TARGET 單一常數（js/state.js）
  - parseAiWords、fillToTarget 純函式（js/candidates.js，Node 可測）
  - 挑詞路徑：一次 AI 呼叫，AI 只排序，程式補滿，AI 失敗仍補滿並附提示
  - tests/node-core.mjs 共用 vm 載入器
  - 共用 ?v=0.96.5
affects: [04-02, 04-03, 04-04, 04-05]

plan_head_before: 2f5239eabc519a8d5a0037eea2a58f8a61b9a9aa
plan_head_after: 47940a57542bbbc4a5b88f0176aa6037ea827338
actuals:
  tokens: 8300
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "AI 只提供偏好順序，數量由純函式 fillToTarget 保證"
    - "AI 失敗不清畫面，改走補滿並附 textContent 提示"

key-files:
  created:
    - tests/node-core.mjs
    - tests/ai-fill.spec.mjs
  modified:
    - js/state.js
    - js/candidates.js
    - js/ai-generate.js
    - index.html
    - tests/core-node.spec.mjs
    - tests/ai-client.spec.mjs
    - tests/split-tags.spec.mjs
  deleted:
    - tests/verify-split.mjs

key-decisions:
  - "AI_TARGET = 24 放 js/state.js，不做 UI 設定（OD-1）"
  - "挑詞路徑只呼叫一次 AI；第二輪補挑整段刪除（D-05）"
  - "AI 失敗且候選 >= 24：依 wordPriorityMap p 值補滿並附「AI 暫時無法排序，先依常用度列出」，只有 e.plain 才附 Worker 原因（D-04、OD-4）"
  - "Phase 4 起不再做逐字比對（verify-split 退役），歷史保留在 5d18f50（OD-5）"

patterns-established:
  - "新純函式放進已在 CORE 清單的 js/candidates.js，不新增 js 檔"
  - "Node 測試經 tests/node-core.mjs 的 loadCore 取用 ctx.fnName"

requirements-completed: [AI-03]

coverage:
  - id: D1
    description: "候選 >= 24 時按 AI 建議，AI 只回 3 個仍剛好 24 張，AI 挑的在前、其餘依 p 值遞減，只呼叫一次 /ai"
    requirement: AI-03
    verification:
      - kind: e2e
        ref: "tests/ai-fill.spec.mjs#填滿：候選 ≥ 24 時 AI 只回 3 個，畫面仍剛好 24 張"
        status: pass
    human_judgment: false
  - id: D2
    description: "AI 503 失敗且候選 >= 24 時仍給 24 張並附完整 Worker 原因提示，按鈕與讀取中恢復"
    requirement: AI-03
    verification:
      - kind: e2e
        ref: "tests/ai-fill.spec.mjs#AI 失敗仍填滿：候選 ≥ 24 時 AI 503 仍給 24 張並附原因"
        status: pass
    human_judgment: false
  - id: D3
    description: "fillToTarget 在各種池大小與 AI 回覆下數量剛好、無重複、全在池內；同分穩定；parseAiWords 分隔與長度"
    requirement: AI-03
    verification:
      - kind: unit
        ref: "tests/ai-fill.spec.mjs#fillToTarget：數量剛好、無重複、全在候選池內"
        status: pass
      - kind: unit
        ref: "tests/ai-fill.spec.mjs#fillToTarget：同分維持原順序、AI 亂回也補滿"
        status: pass
      - kind: unit
        ref: "tests/ai-fill.spec.mjs#parseAiWords：分隔與長度"
        status: pass
    human_judgment: false
  - id: D4
    description: "用實際韻腳按 AI 建議，數量與排序品質符合 Andy 的手感"
    requirement: AI-03
    verification: []
    human_judgment: true
    rationale: "排序是否符合手感、OD-2（單字押字首沿用候選篩選的意義）屬主觀判斷，列入最後 UAT"

duration: 約 35 min
completed: 2026-10-04
status: complete
---

# Phase 4 Plan 01: 候選夠就由程式補滿 24 個 Summary

**挑詞路徑改成「AI 只排序、程式用 fillToTarget 補滿 AI_TARGET=24」：一次按鈕只打一次 AI，AI 回 3 個、回池外詞、或整個 503，畫面都剛好 24 張（失敗時附白話原因）。**

## Performance

- **Duration:** 約 35 min
- **Completed:** 2026-10-04T01:32:30Z
- **Tasks:** 2（1 tracer + 1 tdd）
- **Files modified:** 10（含 1 刪除、2 新增）
- **PHASE_BASE（commit 1a 之前的 HEAD）:** `2f5239eabc519a8d5a0037eea2a58f8a61b9a9aa`

## Accomplishments

- `AI_TARGET = 24` 只在 `js/state.js` 一處；`js/ai-generate.js` 已沒有字面值 24（grep 為 0）
- `parseAiWords`、`fillToTarget` 純函式放進 `js/candidates.js`，在 Node 以 property 測試鎖定（池大小 0/1/23/24/25/1000 乘五種 AI 回覆）
- 挑詞尾段重寫：單一模型、單次 `callLLM`、第二輪補挑與 `throw new Error('empty')` 刪除
- AI 失敗時不再清空畫面：照常補滿 24 張，再加一行 textContent 提示；非白話錯誤只顯示基本句，不洩漏技術字
- 共用版本 0.96.4 到 0.96.5（26 個本機標籤一次換完）
- Phase 3 逐字比對工具退役，作為 Phase 4 第一個 commit

Phase 4 起不再做逐字比對（verify-split 退役）。

## Task Commits

1. **Task 1a（測試）** - `6eb377f` test(04-01): 退役 Phase 3 逐字比對工具與其負向對照（Phase 4 起會改動 js/）
2. **Task 1b（tracer）** - `ef53207` feat(04-01): 候選夠時 AI 只負責排序，程式補滿 AI_TARGET 個；共用版本 0.96.5
3. **Task 2a（測試）** - `c83ae53` test(04-01): 共用 Node 載入器；fillToTarget／parseAiWords 純函式測試
4. **Task 2b** - `47940a5` feat(04-01): AI 排序失敗時仍依常用度給滿並附白話原因

每個 commit 後的 `npm test`：基準 248 passed；6eb377f 後 split-tags 11 passed；ef53207 後 248 passed；c83ae53 後 251 passed；47940a5 後 251 passed（0 failed）。

Tracer 閘門：`⚡ Tracer verified end-to-end — expanding`（`npx playwright test tests/ai-fill.spec.mjs -g "填滿"` 1 passed，加 `npm test` 248 passed）。

TDD RED 證據（Task 2b）：先寫「AI 失敗仍填滿」測試，在實作前執行，失敗在 `toHaveCount(24)`（Expected 24, Received 0，因舊程式清空畫面只顯示錯誤字），即計畫要的斷言。為保持每個 commit 皆綠，RED 狀態沒有單獨 commit（計畫把該測試與實作放在同一個 commit）。

## Files Created/Modified

- `js/state.js` - 新增 `AI_TARGET`
- `js/candidates.js` - 新增 `parseAiWords`、`fillToTarget`（在 `validateWordRhyme` 上方）
- `js/ai-generate.js` - 挑詞尾段重寫；字面值 24 全改 `AI_TARGET`；失敗提示
- `index.html` - 26 個 `?v=` 改 0.96.5，其他不變
- `tests/node-core.mjs` - 新增，`CORE`、`pick`、`loadCore`（自 core-node.spec 原樣搬出）
- `tests/core-node.spec.mjs` - 改為匯入共用載入器，5 個測試不變
- `tests/ai-fill.spec.mjs` - 新增：填滿 e2e、失敗仍填滿 e2e、兩個 fillToTarget、parseAiWords
- `tests/ai-client.spec.mjs` - 刪除舊「主要建議路徑」測試（改寫搬到 ai-fill.spec）
- `tests/split-tags.spec.mjs` - 移除 verify-split 負向對照與僅它使用的 import
- `tests/verify-split.mjs` - 刪除

## Decisions Made

見 frontmatter key-decisions。補充：失敗提示用獨立 `div.candidate-report` 附在報告行之後，沿用既有樣式，不新增 CSS。

## Deviations from Plan

None - plan executed exactly as written.

（小處理，非偏離：Commit 2a 時暫把 AI 失敗 e2e 測試區塊拿出，讓該 commit 全綠，2b 再加回；計畫本來就把該測試歸在 2b。）

## Issues Encountered

- 第一次嘗試用未加引號的 heredoc 套用 2b 修改，反引號被 shell 當成指令而失敗，沒有任何檔案被改動；改用 Edit 工具後正常。

## Known Stubs

None。

## Deferred / 留給後續 plan 的殘留

- `js/ai-generate.js` 的 `generateAISuggestions` 內 `savedWordsLine`、`flexRule` 與 `usingWordlist` 在挑詞尾段改寫後已成死碼（`usingWordlist` 永遠為 true），計畫只要求刪 217-218 兩行，其餘留給後續重構 plan。
- `_aiExtraRoundDone` 仍存在（造詞分支使用），依計畫由後續 plan（D-05）移除。
- 候選池仍會隨連按累積、整池送 prompt（`AI_POOL_MAX` 屬後續 plan，OD-3/A5）。

## Threat Flags

None - 無計畫以外的新攻擊面。T-04-01（池外詞不進 innerHTML）由 `fillToTarget` 的池內過濾保證；T-04-02 用 textContent 且僅 `e.plain` 附原因；T-04-03 第二輪刪除，e2e 斷言單次 /ai。

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

04-02 起可直接使用 `AI_TARGET`、`fillToTarget`、`loadCore`。AI-03 在最後一個宣告它的 plan 完成前不標完成。Andy UAT 項目：用幾個實際韻腳試 AI 建議（含 OD-2 單字押字首的意義）。

## Self-Check: PASSED

- 檔案存在：`tests/node-core.mjs`、`tests/ai-fill.spec.mjs`、本 SUMMARY；`tests/verify-split.mjs` 已不存在
- Commits 存在：6eb377f、ef53207、c83ae53、47940a5
- 驗收：`grep -cE '\b24\b' js/ai-generate.js` = 0；`?v=` 去重僅 `0.96.5`；`AI_TARGET`、`fillToTarget`、`parseAiWords` 皆存在；舊測試字串 0；`loadCore` 只在 node-core.mjs；ai-fill `-g fillToTarget` 2 passed、`core-node.spec` 5 passed、全套 251 passed
- 第一個 Phase 4 commit（6eb377f）只含 `tests/split-tags.spec.mjs`、`tests/verify-split.mjs`
- 未推送

---
*Phase: 04-ai-fill-validate-ai*
*Completed: 2026-10-04*
