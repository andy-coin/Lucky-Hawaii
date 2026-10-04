---
phase: 04-ai-fill-validate-ai
plan: 02
subsystem: ai
tags: [vanilla-js, playwright, node-vm, rhyme-validation]

requires:
  - phase: 04-ai-fill-validate-ai
    provides: 04-01 的 loadCore（tests/node-core.mjs）、tests/ai-fill.spec.mjs
provides:
  - validateWordRhyme 與候選篩選同一套規則（js/candidates.js）
  - _effInitial 共用有效聲母（candidates.js 定義，wordlist.js 使用）
  - 真詞庫鏡射性質測試（驗證與篩選通過率 >= 97%）
affects: [04-03, 04-04, 04-05]

plan_head_before: 47940a57542bbbc4a5b88f0176aa6037ea827338
plan_head_after: ea3a936a1a1a1f04a87a92d9c34ef1dc8434619d
actuals:
  tokens: 3500
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "驗證與篩選同一規則，讀音來源不同（charInfo vs 詞庫注音），破音字任一讀音通過"
    - "兩套判定是否分家，用真詞庫上的通過率下限（97%）守住"

key-files:
  created: []
  modified:
    - js/candidates.js
    - js/wordlist.js
    - tests/ai-fill.spec.mjs
    - tests/smoke.spec.mjs

key-decisions:
  - "單字押字首 = 首字韻部家族相同（鏡射 filterWordsByInitialSingle，OD-2）；要改成聲母相同須改篩選而非驗證"
  - "-g 篩選字串唯一：原計畫的『篩選鏡射』測試改名『篩選對照』，讓 -g 鏡射 只命中真詞庫那一個"

patterns-established:
  - "新增規則類測試用 REQ 字面值表 + rhymeJudge 輔助，每組先重設全部篩選狀態"

requirements-completed: []

coverage:
  - id: D1
    description: "心押字尾：開心、傷心、信心、真心、美音、原因、光陰、列印、人群 通過；朋友、天空、開門、開丂、單字心 不通過"
    requirement: AI-04
    verification:
      - kind: unit
        ref: "tests/ai-fill.spec.mjs#validateWordRhyme：心押字尾"
        status: pass
    human_judgment: false
  - id: D2
    description: "單字押字首看首字韻部（音樂、心情、星期過；小心、鄉村不過）；純聲母ㄅ押字尾看末字聲母、押字首看首字聲母"
    requirement: AI-04
    verification:
      - kind: unit
        ref: "tests/ai-fill.spec.mjs#validateWordRhyme：心押字首"
        status: pass
      - kind: unit
        ref: "tests/ai-fill.spec.mjs#validateWordRhyme：純聲母ㄅ"
        status: pass
    human_judgment: false
  - id: D3
    description: "同字／同聲調／排除借韻／字數、破音字任一讀音、多字押母音／押子音、萬用字與查無字略過、空搜尋一律不過"
    requirement: AI-04
    verification:
      - kind: unit
        ref: "tests/ai-fill.spec.mjs#validateWordRhyme：篩選對照"
        status: pass
      - kind: unit
        ref: "tests/ai-fill.spec.mjs#validateWordRhyme：破音字任一讀音通過"
        status: pass
      - kind: unit
        ref: "tests/ai-fill.spec.mjs#validateWordRhyme：多字"
        status: pass
      - kind: unit
        ref: "tests/ai-fill.spec.mjs#validateWordRhyme：沒有搜尋韻腳一律不過"
        status: pass
    human_judgment: false
  - id: D4
    description: "真詞庫上驗證與篩選不分家：24 個組合各取前 2000 候選，通過率 >= 97%"
    requirement: AI-04
    verification:
      - kind: unit
        ref: "tests/ai-fill.spec.mjs#鏡射：validateWordRhyme 與詞庫篩選同一套規則（真詞庫）"
        status: pass
    human_judgment: false
  - id: D5
    description: "單字押字首的語意（首字韻部相同 vs 首字聲母相同）符合 Andy 的手感"
    requirement: AI-04
    verification: []
    human_judgment: true
    rationale: "屬產品判斷（OD-2 / A1），沿用候選篩選現況，列入最後 UAT"

duration: 約 20 min
completed: 2026-10-04
status: complete
---

# Phase 4 Plan 02: 造出的詞用同一套韻腳規則驗證 Summary

**validateWordRhyme 改成與候選篩選完全相同的規則：開心、傷心對「心」終於算押韻，押字首不再全拒；在真詞庫 24 個組合上通過率 99.8% 到 100%，用負向對照證明測試真的抓得到分家。**

## Performance

- **Duration:** 約 20 min
- **Completed:** 2026-10-04
- **Tasks:** 2（皆 auto；Task 1 tdd）
- **Files modified:** 4
- **plan_head_before:** `47940a57542bbbc4a5b88f0176aa6037ea827338`

## Accomplishments

- 單字押字尾原本拿「整個音節」查韻部家族（`ㄒㄧㄣ` 不在家族表，只有 `ㄧㄣ` 在），有聲母的字全部落空；改成先 `getZhuyinRhyme` 再查家族
- 單字押字首原本比聲母，與篩選（首字韻部家族）互相矛盾，真候選 0 個通過；改為鏡射篩選
- 純聲母（ㄅ）、多字押子音（有效聲母）、萬用字與查無字略過、同字／同聲調／排除借韻／字數，全部與篩選一致
- `_effInitial` 只存在一份：candidates.js 定義，`filterWordsByInitial` 與驗證共用

## Task Commits

1. **Task 1 fix**（只動 js/candidates.js）- `aa9aa67` fix(04-02): validateWordRhyme 改用與候選篩選相同的規則
2. **Task 1 test** - `4afeb62` test(04-02): validateWordRhyme 規則測試（7 個）
3. **Task 2 test** - `86c150d` test(04-02): 真詞庫鏡射性質測試（含 smoke 註解修正）
4. **Task 2 refactor** - `ea3a936` refactor(04-02): filterWordsByInitial 改用共用的 _effInitial

修正 commit `aa9aa67` 檔案清單：只有 `js/candidates.js`。每個 commit 皆綠；`npm test`：基準 251，fix 後（含新測試的工作樹）258，最終 259 passed（0 failed）。golden（`tests/golden/`、`tests/golden.spec.mjs`）自 PHASE_BASE `2f5239e` 起 diff 為空。

## Red / Green 證據

修正前對未改動的程式執行 `-g "validateWordRhyme"`：**6 failed、1 passed**。
- 失敗：心押字尾、心押字首、純聲母ㄅ、篩選對照（同字／同聲調／排除借韻／字數）、破音字、多字
- 通過：空搜尋（本來就回 false）

修正後：7 passed。RED 沒有單獨 commit（計畫要求先 commit 修正、再 commit 測試，確保每個 commit 皆綠）。

## 鏡射通過率（真詞庫，前 2000 候選）

| 組合 | 寬 | 嚴（排除借韻） | 押字首 |
|------|----|----------------|--------|
| 心 | 1999/2000 | 1998/2000 | 2000/2000 |
| 安 | 1995/2000 | 1995/2000 | 2000/2000 |
| 愛 | 1994/2000 | 1993/2000 | 1998/2000 |
| 衣 | 1997/2000 | 1997/2000 | 2000/2000 |
| 月 | 1999/2000 | 1997/2000 | 1996/2000 |
| 行 | 2000/2000 | 1999/2000 | 2000/2000 |
| ㄅ | 1995/2000 | 1995/2000 | 2000/2000 |

多字：愛心 押母音 324/324；心衣 押子音 419/421；心衣 押母音 777/781。最低 99.65%（愛 押字尾 嚴）。沒過的是詞庫讀音不在 `charInfo` 裡的詞（字典缺該讀音），不是規則錯。

## 負向對照（未 commit）

暫時把單字押字尾的 `getZhuyinRhyme(i.zhuyin)` 改回整個音節 `i.zhuyin`：鏡射測試在第一列失敗，訊息「心 押字尾 寬 通過率 290/2000」；還原後 `git status js/` 乾淨，測試通過。

## Deviations from Plan

### 小處理

**1. [測試命名] 「篩選鏡射」改名「篩選對照」**
- **原因:** 計畫指定測試標題含「篩選鏡射」，同時驗收要求 `-g "鏡射"` 恰好 1 passed；兩者會互撞（-g 命中 2 個）
- **處理:** 規則測試改名「validateWordRhyme：篩選對照（…）」，內容不變；改名放在 `86c150d`
- **Files modified:** tests/ai-fill.spec.mjs

其餘 None - plan executed exactly as written。

## Issues Encountered

- `sed -i` 在 macOS（BSD sed）下語法不同，加 import 失敗；改用 Edit 工具。沒有任何檔案被誤改。
- 驗收指令裡的 `set -- $VAR` 在 zsh 不適用，改用 `git show --name-only` 與 `git diff --quiet` 逐項等價驗證（結果見 Self-Check）。

## Known Stubs

None。

## Andy UAT 項目

**押字首（單字）= 首字韻部相同（沿用候選篩選現況）；若要首字聲母相同需另改篩選。** 例：搜「心」押字首，現在 音樂、心情、星期 算押，小心、鄉村 不算。

## Threat Flags

None。T-04-04：朋友、天空、開門、小心（押字首）仍為 false，未知字一律 false；T-04-05：修正 commit 只含 js/candidates.js，golden diff 為空；T-04-SC：未安裝任何套件，package.json 未動。

## Next Phase Readiness

AI-04 在最後一個宣告它的 plan 完成前不標完成（本 plan 只完成「驗證用同一套規則」這半）。`validateWordRhyme` 的唯一呼叫端仍是 `generateAIWords`（js/ai-generate.js:43），後續 plan 重寫造詞分支時可直接沿用。

## Self-Check: PASSED

- 檔案存在：js/candidates.js、js/wordlist.js、tests/ai-fill.spec.mjs、tests/smoke.spec.mjs、本 SUMMARY
- Commits 存在：aa9aa67、4afeb62、86c150d、ea3a936（`git rev-list --count` plan_head_before..HEAD = 4）
- 驗收：`function _effInitial` 在 candidates.js 1 個；`RHYME_TO_FAMILY[info.zhuyin]` 0 個；wordlist.js `_effInitial(` 1 個、`zy[0]==='ㄩ'` 0 個；smoke.spec 中 `validateWordRhyme` 0 個；HEAD 只列 js/wordlist.js 且為 refactor(04-02)
- 修正 commit `aa9aa67` 只含 js/candidates.js；golden diff（2f5239e..HEAD）為空
- `npm test` 259 passed；未推送

---
*Phase: 04-ai-fill-validate-ai*
*Completed: 2026-10-04*
