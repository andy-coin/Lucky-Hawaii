---
phase: 03-split-index-html
plan: 01
subsystem: infra
tags: [refactor, classic-script, node-vm, playwright, cache-busting]

requires:
  - phase: 01-safety-net
    provides: golden, smoke, scan, storage specs used as the move guard
provides:
  - tests/verify-split.mjs (verbatim reassembly check against base 2f2d248)
  - js/phonetic-tables.js (base 2492-2686 verbatim, classic script)
  - tests/core-node.spec.mjs (node:vm core loader plus first pure-Node test)
  - tests/split-tags.spec.mjs (permanent tag guard, 5 tests)
  - shared ?v=0.96.4 on every local tag, including js/safety.js
affects: [03-02, 03-03, 03-04, 03-05, split-index-html]

actuals:
  tokens: 4401
  tasks: 2
  commits: 4
plan_head_before: 2f2d248841f210860cefb3278db85b90b42094cc
plan_head_after: c2b35ad72adeff5ac52fc9a760a0c4ec8d5dc93a

tech-stack:
  added: []
  patterns:
    - "Top-first pure move: sed -n slice from base, delete the same lines, add a classic script tag directly above the remaining bare inline script"
    - "node:vm core loader: window = context, 5 safety stubs, CORE list appended per plan"
    - "One shared ?v= on all local tags, enforced by split-tags spec"

key-files:
  created:
    - tests/verify-split.mjs
    - js/phonetic-tables.js
    - tests/core-node.spec.mjs
    - tests/split-tags.spec.mjs
  modified:
    - index.html

key-decisions:
  - "Verifier drops exactly one line break after the bare tag before joining inline bodies (without it every intermediate state reports FAIL)"
  - "Shared ?v=0.96.4 literal is not hard-coded in the spec, so later bumps only edit index.html"
  - "split-tags order test uses prefix checks (valid at every intermediate commit); plan 03-05 tightens to full equality"

patterns-established:
  - "Move commits touch only index.html and the new js/css file; test and fix commits stay separate"
  - "Tooling lives in tests/, never scripts/ (gitignored) or js/ (scanned and shipped)"

requirements-completed: [FND-04]

duration: 6min
completed: 2026-10-04
status: complete
---

# Phase 3 Plan 01: Split tracer Summary

**Tracer for the index.html split: verbatim verifier, js/phonetic-tables.js moved out as a versioned classic script (195 lines, 231 tests green), the same file loading in Node via node:vm, and a permanent 5-test tag guard.**

## Performance

- **Duration:** about 6 min
- **Started:** 2026-10-03T20:47:26Z
- **Completed:** 2026-10-03T20:52:50Z
- **Tasks:** 2 (Task 1 tracer, Task 2 auto)
- **Files modified:** 5 (4 created, index.html modified)

## Accomplishments

- Base sha: `2f2d248841f210860cefb3278db85b90b42094cc`. `node tests/verify-split.mjs 2f2d248` prints `OK   script: 176728 vs 176729 chars` and `OK   style: 66770 vs 66771 chars`, exit 0, both on the unsplit file and after the move.
- Negative control (verifier): appending one character to js/phonetic-tables.js gave `FAIL script`, exit 1; regenerating from base gave OK again. No-argument run prints the Chinese usage line and exits 2.
- Pure move verified: `cmp` of base 2492-2686 vs js/phonetic-tables.js passes; file is 195 lines; index.html is 6059 lines; the only added index.html lines are the new js/ tag and the safety.js tag with 0.96.4.
- Node loader: `core：純 Node 載入音韻表` passes in about 8 ms with no browser (zhuyinInitials 21, BORROW_MAP['ㄚ'] = ㄚ/ㄧㄚ/ㄨㄚ, fullZhuyinToPinyin['ㄅㄢ'] = ban, fullPinyinToZhuyin['ban'] = ['ㄅㄢ'], RHYME_TO_FAMILY['ㄧㄚ'] equals that of 'ㄚ').
- Tag guard negative controls (never committed): safety.js back at 0.96.3 failed the version test; phonetic-tables tag above the safety tag failed the order test; after `git checkout -- index.html` all 5 pass.
- Test counts: golden+smoke+scan 56 passed at the move; `npm test` 231 passed at the move commit (self-contained, deployable), 232 after the Node spec, 237 after split-tags; 0 failed throughout.
- One-newline join fix confirmed necessary: a copy of the verifier with the line-break removal stripped reports `FAIL script` on the moved state.

## Task Commits

1. **Task 1a: verifier** - `8789cc3` (test)
2. **Task 1b: pure move of js/phonetic-tables.js plus safety.js 0.96.4** - `f275b57` (refactor; touches only index.html and js/phonetic-tables.js)
3. **Task 1c: Node loader spec** - `61b6c5e` (test)
4. **Task 2: tag guard spec** - `c2b35ad` (test)

Tracer gate: after Task 1 the verify chain (verify-split, core-node, `npm test` 232 passed) was re-run; passed, expansion continued. Nothing pushed.

## Files Created/Modified

- `tests/verify-split.mjs` - reassembles moved files plus inline tail in tag order and compares to base `<script>`/`<style>` bodies
- `js/phonetic-tables.js` - zhuyin/pinyin tables, BORROW_MAP, RHYME_FAMILIES (verbatim, original 8-space indent)
- `tests/core-node.spec.mjs` - vm loader (CORE list, 5 stubs, silent console) and first test
- `tests/split-tags.spec.mjs` - shared ?v=, each file once, safety first and manifest-prefix order, sync loading, UTF-8/no BOM/LF
- `index.html` - new classic script tag above the bare inline script; safety.js tag now `?v=0.96.4`

## Decisions Made

None beyond the plan (see key-decisions in frontmatter).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. The first `sed i\` insertion was checked by line count (6059) and diff (exactly two added lines).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Procedure proven; plans 03-02 to 03-05 repeat it for the remaining 19 JS chunks and 3 CSS files, appending core files to CORE in original order.
- Every future deploy that touches js/css must bump the shared `?v=` in all tags together (split-tags fails on a mismatch).
- No known stubs. No new security surface beyond the plan's threat model (no threat flags).

## Self-Check: PASSED

- Files exist: tests/verify-split.mjs, js/phonetic-tables.js, tests/core-node.spec.mjs, tests/split-tags.spec.mjs
- Commits exist: 8789cc3, f275b57, 61b6c5e, c2b35ad (`git rev-list --count 2f2d248..HEAD` = 4)

---
*Phase: 03-split-index-html*
*Completed: 2026-10-04*
