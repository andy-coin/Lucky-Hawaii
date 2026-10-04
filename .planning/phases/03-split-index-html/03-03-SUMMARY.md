---
phase: 03-split-index-html
plan: 03
subsystem: infra
tags: [refactor, classic-script, node-vm, playwright, rhyme-engine]

requires:
  - phase: 03-split-index-html
    provides: verify-split.mjs, split-tags.spec.mjs, node:vm loader, shared ?v=0.96.4 (plans 03-01, 03-02)
provides:
  - js/dict.js, js/search.js, js/state.js, js/polyphonic.js (base 2687-2883, 2884-3290, 3291-3330, 3331-3443 verbatim)
  - four classic script tags after js/phonetic-tables.js, in original order
  - rhyme search and phonetic helpers tested in pure Node (no browser)
  - Node-versus-browser searchRhyme parity test on 12 inputs
affects: [03-04, 03-05, split-index-html]

actuals:
  tokens: 10000
  tasks: 2
  commits: 2
plan_head_before: 034f641ba832b17886f4e5627c307fb9c59ce4f4
plan_head_after: 6748244648fbfe22c61c8f66d260a1c848da59f9

tech-stack:
  added: []
  patterns:
    - "Batch pure move: four sed -n slices from base 2f2d248, 757 lines deleted under the bare script tag, four tags inserted above it"
    - "Core loader boot step: Math.random = () => 0; rhymeDict = window._rhymeDictData; buildIndex(); after CORE runs"

key-files:
  created: [js/dict.js, js/search.js, js/state.js, js/polyphonic.js]
  modified: [index.html, tests/core-node.spec.mjs]

key-decisions:
  - "Followed plan: batch move of the four core files in one commit; displayResults grouping stays inline (OD-1)"

requirements-completed: []

duration: 7min
completed: 2026-10-04
status: complete
---

# Phase 3 Plan 03: Core rhyme engine move Summary

**The rhyme engine (dictionary, search, global state, polyphonic) now runs from four verbatim js/ files, and rhyme search plus the phonetic helpers are tested in pure Node with a 12-input parity check against the browser.**

## Accomplishments

- Base `2f2d248`. `cmp` of the four base slices vs js/dict.js (197 lines), js/search.js (407), js/state.js (40), js/polyphonic.js (113) passes; index.html is 3146 lines; 6 `<script src="js/` tags (safety + 5 core).
- `node tests/verify-split.mjs 2f2d248`: `OK   script: 176728 vs 176729 chars`, `OK   style: 66766 vs 66771 chars`, exit 0.
- Tests: `npm test` 240 passed at the move commit (self-contained and deployable; includes storage, save-failure, smoke v0.96 fixture, split-tags order), 243 passed at the end, 0 failed.
- `npx playwright test tests/core-node.spec.mjs`: 4 passed; `-g "純 Node"`: 3 passed (no browser test selected). searchRhyme('ㄢ') rows have zhuyinRhyme exactly equal to BORROW_MAP['ㄢ'] (rule-derived, not a frozen count); searchRhyme('an') equals searchRhyme('ㄢ'); searchRhyme('zzz') and ('') return [] with searchedTerms [].
- Parity: Node and browser `searchRhyme` result plus `searchedTerms` are byte-identical for all 12 inputs.
- Negative control (never committed): changing one expected helper value ('ban' to 'bam') made the pure-Node tests that assert it fail (2 failed, 1 passed); reverted, 3 passed. Working tree verified clean of the edit.
- FND-04 stays open (requirements-completed empty): it completes in 03-05.

## Task Commits

1. **Task 1: pure move of dict/search/state/polyphonic** - `0587c7f` (refactor; touches only index.html and the four js files)
2. **Task 2: Node core tests and parity** - `6748244` (test; touches only tests/core-node.spec.mjs)

Nothing pushed.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. The OD-3 guard and verify-split passed before the first edit. The plan commit ledger did not exist for 03-03; it was created at start from the 03-02 head (`034f641`).

## Known Stubs

None.

## Threat Flags

None. No new network, auth, or storage surface; only moved code and tests (T-03-09 mitigated by order test, storage/save-failure/v0.96 fixture specs and cmp; T-03-10 mitigated by the parity test).

## Next Phase Readiness

- Remaining: later JS chunks (plans 03-04, 03-05). Append moved core files to CORE in original order; bump `?v=` in every tag together.

## Self-Check: PASSED

- Files exist: js/dict.js, js/search.js, js/state.js, js/polyphonic.js, tests/core-node.spec.mjs
- Commits exist: 0587c7f, 6748244 (`git rev-list --count 034f641..HEAD` = 2)
- Acceptance criteria for both tasks re-run and passing (cmp, line count 3146, 6 tags, verify-split OK x2, HEAD file lists, 3/4 core-node passes, buildIndex and js/polyphonic.js grep counts 1 and 1)

---
*Phase: 03-split-index-html*
*Completed: 2026-10-04*
