---
phase: 03-split-index-html
plan: 02
subsystem: infra
tags: [refactor, css, cascade, playwright, cache-busting]

requires:
  - phase: 03-split-index-html
    provides: verify-split.mjs, split-tags.spec.mjs, shared ?v=0.96.4 (plan 03-01)
provides:
  - css/base.css, css/panels.css, css/responsive.css (base 15-742, 743-1545, 1546-2175 verbatim)
  - three render-blocking stylesheet links in index.html head
  - three CSS guard tests in tests/split-tags.spec.mjs (8 tests total)
affects: [03-03, 03-04, 03-05, split-index-html]

actuals:
  tokens: 3500
  tasks: 2
  commits: 2
plan_head_before: c2b35ad72adeff5ac52fc9a760a0c4ec8d5dc93a
plan_head_after: 034f641ba832b17886f4e5627c307fb9c59ce4f4

tech-stack:
  added: []
  patterns:
    - "CSS pure move: sed -n slices from base 2f2d248, three contiguous files, links in cascade order"

key-files:
  created: [css/base.css, css/panels.css, css/responsive.css]
  modified: [index.html, tests/split-tags.spec.mjs]

key-decisions:
  - "Followed plan: 3 CSS files, shared ?v=0.96.4, links placed where the style block was (before data/rhyme-dict.js)"

requirements-completed: []

duration: 5min
completed: 2026-10-04
status: complete
---

# Phase 3 Plan 02: CSS move Summary

**The whole inline stylesheet (2163 lines) now lives in three verbatim css/ files linked in cascade order, with three guards that fail if the font @import, head placement or url() paths break.**

## Accomplishments

- `cmp` of base slices vs css files passes; line counts 728 / 803 / 630; index.html 3899 lines; 3 stylesheet links, 0 `<style`; every line added to index.html since base is a local js/ or css/ tag.
- `node tests/verify-split.mjs 2f2d248`: `OK   script: 176728 vs 176729 chars`, `OK   style: 66766 vs 66771 chars` (style differs by the 5 chars of the removed `<style>` line breaks, handled by the verifier), exit 0.
- Tests: 237 passed at the move commit (self-contained), 240 passed at the end (`npm test`), 0 failed.
- Negative controls (never committed): panels link placed above base made the order test fail (also the exactly-once test, because of how the edit was made); a `.x{}` line above the `@import` failed the @import test; both restored with `git checkout`, 8 passed afterwards.
- Plan 03-01's FND-04 stays open (requirements-completed empty): it completes in 03-05.

## Task Commits

1. **Task 1: CSS pure move** - `a081126` (refactor; touches only index.html and the three css files)
2. **Task 2: CSS guards** - `034f641` (test; touches only tests/split-tags.spec.mjs)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. The plan's commit ledger was created at the start (it did not exist yet for 03-02); base is the 03-01 head `c2b35ad`.

## Known Stubs

None.

## Threat Flags

None. Only same-origin css/ links were added; no new third-party origin.

## Next Phase Readiness

- Remaining: 19 JS chunks (plans 03-03 to 03-05). css/ files must be bumped together with js/ tags when `?v=` changes.

## Self-Check: PASSED

- Files exist: css/base.css, css/panels.css, css/responsive.css, tests/split-tags.spec.mjs
- Commits exist: a081126, 034f641 (`git rev-list --count c2b35ad..HEAD` = 2)

---
*Phase: 03-split-index-html*
*Completed: 2026-10-04*
