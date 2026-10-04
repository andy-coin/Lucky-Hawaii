---
phase: 03-split-index-html
plan: 04
subsystem: infra
tags: [refactor, classic-script, node-vm, playwright, word-filtering, ai-client]

requires:
  - phase: 03-split-index-html
    provides: verify-split.mjs, split-tags.spec.mjs, node:vm loader, shared ?v=0.96.4, core files (plans 03-01..03-03)
provides:
  - js/cards.js, js/lyrics.js, js/wordlist.js, js/panels.js (base 3444-3683, 3684-3947, 3948-4201, 4202-4306 verbatim)
  - js/rhyme-display.js, js/ai-client.js, js/candidates.js (base 4307-4462, 4463-4553, 4554-4898 verbatim)
  - seven classic script tags after js/polyphonic.js, in original order
  - word filtering (filterWordsByRhyme, _wordLenPass) tested in pure Node with the 12-word stub wordlist
affects: [03-05, phase-04-ai, split-index-html]

actuals:
  tokens: 10000
  tasks: 3
  commits: 3
plan_head_before: 6748244648fbfe22c61c8f66d260a1c848da59f9
plan_head_after: 23f7709c5d313a87aa5ea890e7d04e0f23d2b3ee

tech-stack:
  added: []
  patterns:
    - "Batch pure move: sed -n slices from base 2f2d248, N lines deleted under the bare script tag, tags inserted above it"
    - "CORE loader order extended: wordlist.js, candidates.js after polyphonic.js; wordlistData assigned inside the vm context from the ndjson stub"

key-files:
  created: [js/cards.js, js/lyrics.js, js/wordlist.js, js/panels.js, js/rhyme-display.js, js/ai-client.js, js/candidates.js]
  modified: [index.html, tests/core-node.spec.mjs]

key-decisions:
  - "Followed plan: two pure-move batch commits then one test commit; dead saveApiKey() left in js/ai-client.js verbatim (CONTEXT Deferred)"

requirements-completed: []

duration: 8min
completed: 2026-10-04
status: complete
---

# Phase 3 Plan 04: UI/data, display, AI client and candidate filter move Summary

**Seven more chunks (cards, lyrics, wordlist, panels, rhyme-display, ai-client, candidates) now run from verbatim js/ files, and word filtering plus the length filter are tested in pure Node against the 12-word stub wordlist.**

## Accomplishments

- Base `2f2d248`. `cmp` of all seven base slices passes; line counts 240 / 264 / 254 / 105 and 156 / 91 / 345. index.html is 2287 lines after Batch A and 1698 after Batch B; 13 `<script src="js/` tags (safety + 12 moved).
- `node tests/verify-split.mjs 2f2d248` at both move commits: `OK   script: 176728 vs 176729 chars`, `OK   style: 66766 vs 66771 chars`, exit 0.
- `npm test`: 243 passed, 0 failed at Batch A commit; 243 passed, 0 failed at Batch B commit (AI client, smoke 91 handler signatures, scan, storage, split-tags specs included); 244 passed, 0 failed at the end.
- `npx playwright test tests/core-node.spec.mjs -g "純 Node"`: 4 passed. New test: filterWordsByRhyme([{rhyme:'ㄧㄣ'}],2,1) returns exactly the 12 stub words; ㄚ rhyme and target length 3 return []; savedWords=['一心'] leaves 11 words without 一心; _wordLenPass follows filterWordLen (0 any, 2 exact, 4 means four or more).
- Negative control (never committed): expected count 11 changed to 12 failed the test (1 failed, 3 passed); reverted, 4 passed.
- FND-04 stays open (requirements-completed empty): it completes in 03-05.

## Task Commits

1. **Task 1: pure move of cards/lyrics/wordlist/panels** - `4a7fd5a` (refactor; index.html + four js files)
2. **Task 2: pure move of rhyme-display/ai-client/candidates** - `85c3e3d` (refactor; index.html + three js files)
3. **Task 3: Node word filtering test** - `23f7709` (test; tests/core-node.spec.mjs only)

Nothing pushed.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. OD-3 guard and verify-split passed before the first edit and before every commit. The commit ledger for 03-04 did not exist; it was created from the 03-03 head (`6748244`).

## Known Stubs

None.

## Threat Flags

None. Only moved code and tests; T-03-12 and T-03-13 mitigated by scan/smoke specs green at each move commit; no installs.

## Next Phase Readiness

- Remaining for 03-05: the last eight chunks (init stays inline until its plan decides), index.html reduced to skeleton, completion-state test, moved-only commit audit, phase gate. Next inline remainder starts at base 4899 (`// AI 生成補足詞…`).

## Self-Check: PASSED

- Files exist: seven js files and tests/core-node.spec.mjs
- Commits exist: 4a7fd5a, 85c3e3d, 23f7709 (`git rev-list --count 6748244..HEAD` = 3)
- Acceptance criteria re-run: cmp OK for all seven, index.html 2287 then 1698 lines, 13 tags, HEAD file lists as specified, grep counts 1 and 1

---
*Phase: 03-split-index-html*
*Completed: 2026-10-04*
