---
phase: 01-safety-net
plan: 04
subsystem: error-visibility
tags: [acorn-scan, swallowed-catch, lhWarn, feedback-toast, console-records]

requires:
  - phase: 01-03
    provides: "js/safety.js lhWarn, tests/scan-lib.mjs (collectSources, parseAny, walk), bootPage beforeGoto"
provides:
  - "tests/scan-lib.mjs: findSwallowedCatches(ast), scanCatches(sources) -> sorted file:line list"
  - "tests/scan.spec.mjs: 5 'catch:' tests (4 fixture self-tests + real-repo zero-offender test)"
  - "index.html: all 12 former silent catch sites leave a [好韻器] record via lhWarn; the redundant try/catch in saveDictOverrides is removed (13th site)"
  - "postFeedback returns a boolean; failed send shows 回報沒有送出，請檢查網路後再試一次; submitFeedback shows 感謝你的回饋！ only on success"
  - "tests/error-visibility.spec.mjs: 9 runtime tests (7 induced background failures, 2 report-send tests)"
affects: [01-05, 01-06, phase-02-ai-fallback, phase-03-file-split]

actuals:
  tokens: 4400   # chars/4 over git diff ee9cd4f..HEAD (17,815 chars incl. context lines)
  tasks: 3
  commits: 5
plan_head_before: ee9cd4f9af5961a8777e1eaee5149eba4a7f1256
plan_head_after: dd544fa06e774b89acd124ea3962730f6f677130

tech-stack:
  added: []
  patterns:
    - "Static AST rule: a catch / .catch callback with no CallExpression and no throw is a swallowed error; npm test fails on it"
    - "Fault injection with 200-OK-but-unparseable bodies via context.route in bootPage beforeGoto, never abort (Pitfall 6)"

key-files:
  created:
    - tests/error-visibility.spec.mjs
  modified:
    - tests/scan-lib.mjs
    - tests/scan.spec.mjs
    - index.html

key-decisions:
  - "Scanner counts any function call as 'reporting' (ceiling noted in a ponytail: comment); NewExpression does not count"
  - "saveDictOverrides loses its try/catch entirely rather than gaining a log: lhSet never throws and shows the save-failure banner itself"
  - "Other postFeedback callers stay fire-and-forget; their failure now replaces their own toast with the failure toast (intended visible outcome)"

requirements-completed: [FND-02]

coverage:
  - id: D1
    description: "Scanner flags every swallowing catch shape (catch {}, comment-only, return-only, empty .catch callback) and ignores catches that call a function or rethrow"
    requirement: FND-02
    verification:
      - kind: e2e
        ref: "tests/scan.spec.mjs#catch: 掃描器抓得到四種吞錯寫法 / 有呼叫或重新丟出的 catch 不算吞錯 / 沒有違規時回報為空 / 多個違規全部列出並依檔名與行號排序"
        status: pass
    human_judgment: false
  - id: D2
    description: "No swallowing catch remains in the app; any re-introduced one fails npm test with file:line"
    requirement: FND-02
    verification:
      - kind: e2e
        ref: "tests/scan.spec.mjs#catch: 程式碼裡沒有吞錯的 catch"
        status: pass
    human_judgment: false
  - id: D3
    description: "Induced background failures (rhyme overrides, wordlist chunk, wordlist meta, wordlist overrides, polyphonic order, corrupt local overrides, IndexedDB unavailable) each leave a [好韻器] record, search keeps rendering cards, no banner, no uncaught error"
    requirement: FND-02
    verification:
      - kind: e2e
        ref: "tests/error-visibility.spec.mjs (7 background-error tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "A failed report send shows 回報沒有送出，請檢查網路後再試一次 and never the thanks toast; a successful send still shows 感謝你的回饋！"
    requirement: FND-02
    verification:
      - kind: e2e
        ref: "tests/error-visibility.spec.mjs#使用者操作：回報送不出去會提示 / 回報送出成功仍顯示感謝"
        status: pass
    human_judgment: false
  - id: D5
    description: "AI fallback control flow is unchanged (logging only)"
    requirement: FND-02
    verification:
      - kind: command
        ref: "grep -c 'lastErr = e;' index.html = 1; grep -c \"throw new Error('all models failed')\" index.html = 1; golden + smoke green"
        status: pass
    human_judgment: false

duration: 14min
completed: 2026-10-03
status: complete
---

# Phase 1 Plan 04: Error Visibility Summary

**An acorn rule in `npm test` now fails on any catch or `.catch` callback that neither calls a function nor throws; all 13 swallowing catches in v0.96 are fixed (12 gain a `[好韻器]` `lhWarn` record, 1 redundant wrapper removed), a failed report send shows a plain failure toast instead of a false thank-you, and 9 runtime tests prove induced failures are recorded. `npm test`: 71 passed.**

## Performance

- **Duration:** about 14 min (start roughly 10:59Z, end 11:13Z)
- **Tasks:** 3 (5 commits)
- **Files:** 4 (1 new, 3 modified)

## Accomplishments

- `findSwallowedCatches` / `scanCatches` in tests/scan-lib.mjs; four fixture self-tests plus a real-repo test (titles start with `catch:`).
- Before the fix the characterization printed exactly the 13 known offenders (all index.html, post-Plan-03 line numbers): 2739 loadDictOverrides, 2743 saveDictOverrides, 2800 applyRhymeDictOverrides, 3346 loadPolyphonicsOrder (`.catch`), 3987 IndexedDB open, 3994 wordlist meta, 4020 wordlist chunk loop, 4042 applyWordlistOverrides, 5025 AI word generation, 5257 AI second round, 5261 AI model loop, 5313 context generation, 6222 postFeedback. After the fix `scanCatches(collectSources())` is `[]`.
- Tags used (all through `lhWarn`): 本機字庫覆寫資料損毀，已忽略 / 字庫修正檔載入失敗 / 破音字排序檔載入失敗 / IndexedDB 開啟失敗，詞庫改走網路 / 詞庫版本檔讀取失敗 / 詞庫分段 N 載入失敗 / 詞庫修正檔載入失敗 / AI 造詞模型失敗，換下一個 / AI 第二輪補挑失敗 / AI 模型失敗，換下一個 / 情境生成模型失敗，換下一個 / 回報送出失敗。
- `postFeedback` returns true on `res.ok`; on a non-ok response or exception it records and shows 回報沒有送出，請檢查網路後再試一次 and returns false. `submitFeedback` thanks only on true.
- Runtime proof: 9 tests in tests/error-visibility.spec.mjs, each also asserts no `#lhSaveBanner` and no uncaught page error.

## Task Commits

1. **Task 1: swallowed-catch rule plus self-tests** - `4fbc06a` test(01-04)
2. **Task 2a: 12 catch sites log, wrapper removed (logging only)** - `af1d5a0` fix(01-04)
3. **Task 2b: report send failure visible** - `e2cf7cc` fix(01-04)
4. **Task 2c: real-repo zero-offender test** - `db448cc` test(01-04)
5. **Task 3: error visibility runtime tests** - `dd544fa` test(01-04)

**Plan metadata:** skipped (.planning gitignored, commit_docs=false). Branch gsd/v0.96-stabilize. Nothing pushed.

## Deviations from Plan

None - plan executed exactly as written.

Notes (not deviations): the `a.js` fixture in the ordering test puts its offenders on lines 2 and 7 as the plan specifies. The two sites that rename `_` to `e` (5258, 5315) only use the binding inside the catch body, so no outer `e` is shadowed.

## Verification

- `npx playwright test tests/scan.spec.mjs -g "catch"`: 5 passed. `-g registry`: 4 passed.
- `npx playwright test tests/error-visibility.spec.mjs`: 9 passed.
- `npm test`: 71 passed (golden 41, smoke 5, save-failure 5, scan 9, corrupt 1, error-visibility 9, plus meta).
- Acceptance greps: `lhWarn('破音字排序檔載入失敗'` 1, `lhWarn('詞庫分段 '` 1, `lhWarn('AI 模型失敗，換下一個'` 1, `lastErr = e;` 1, `throw new Error('all models failed')` 1, failure toast string 1.
- Teeth: inserting an empty catch into index.html made `-g "沒有吞錯"` fail naming `index.html:2747`; removing the chunk-catch `lhWarn` made the chunk test fail (8 passed, 1 failed); both restored with `git checkout -- index.html`.

## Findings for later phases (not fixed here)

- Chunk loop: a chunk fetch that returns a non-OK status (`res.ok` false) is silent, not an exception, so it leaves no record. Out of scope (no catch involved); Phase 2/3 may want a record there.
- Scanner ceiling: a handler that calls any unrelated function passes, and `.then(ok, fail)` second arguments are not inspected.

## Issues Encountered

None.

## Known Stubs

None.

## Threat Flags

None new. T-01-13 (scan fails on re-introduced swallowing catches, enforced in npm test), T-01-14 (boolean result, runtime test), T-01-15 (records carry only the error object), T-01-SC (no packages added, lockfile untouched) all hold.

## Next Phase Readiness

- Plans 05-06 can rely on every error path leaving a `[好韻器]` record and on the catch scan guarding future edits. Phase 2 may change AI fallback control flow but must keep a call (e.g. `lhWarn`) in each catch.

## Self-Check: PASSED

- Files exist: tests/error-visibility.spec.mjs, tests/scan-lib.mjs, tests/scan.spec.mjs, index.html (verified).
- Commits on gsd/v0.96-stabilize: 4fbc06a, af1d5a0, e2cf7cc, db448cc, dd544fa (`git rev-list --count ee9cd4f..HEAD` = 5).
- Plan verification: `npm test` 71 passed; working tree has only the untracked `.claude/CLAUDE.md` and `.gsd/` (orchestrator-owned, intentionally not staged).
