---
phase: 03-split-index-html
plan: 05
subsystem: infra
tags: [refactor, classic-script, static-site, playwright, move-only-audit]

requires:
  - phase: 03-split-index-html
    provides: verify-split.mjs, split-tags.spec.mjs, shared ?v=0.96.4, 12 moved js files plus css (plans 03-01..03-04)
provides:
  - js/ai-generate.js, js/ui-common.js, js/results.js, js/search-ui.js (base 4899-5263, 5264-5372, 5373-5649, 5650-5747 verbatim)
  - js/theme.js, js/init.js, js/report.js, js/ai-word-events.js (base 5748-5914, 5915-5943, 5944-6176, 6177-6250 verbatim)
  - index.html is a 352-line skeleton (no inline script, no style element)
  - split-tags test locking the full 20-js / 3-css order and the skeleton state
affects: [phase-04, split-index-html]

actuals:
  tokens: 40000
  tasks: 3
  commits: 3
plan_head_before: 23f7709c5d313a87aa5ea890e7d04e0f23d2b3ee
plan_head_after: 0f37e94ee058107dca711cad70b10b4dced5c727

tech-stack:
  added: []
  patterns:
    - "Batch pure move via sed -n slices from base 2f2d248; emptied inline script removed with its tags"
    - "split-tags: prefix order check kept for mid-phase, plus a final full-equality completion test"

key-files:
  created: [js/ai-generate.js, js/ui-common.js, js/results.js, js/search-ui.js, js/theme.js, js/init.js, js/report.js, js/ai-word-events.js]
  modified: [index.html, tests/split-tags.spec.mjs]

key-decisions:
  - "Followed plan: two pure-move commits, then one test commit; dead saveApiKey() left in js/ai-client.js (CONTEXT Deferred)"

requirements-completed: [FND-04]

duration: 10min
completed: 2026-10-04
status: complete
---

# Phase 3 Plan 05: Last eight chunks out, skeleton index.html, phase gate Summary

**The last eight chunks now run from verbatim js/ files, index.html is a 352-line skeleton with 3 stylesheet links and 21 script tags, and the full suite (245 tests) is green with the move-only history audited.**

## Accomplishments

- `cmp` of all eight base slices passes; line counts 365 / 109 / 277 / 98 and 167 / 29 / 233 / 74. index.html: 853 lines after Batch A, 352 after Batch B (bare inline script opening and closing tags removed; no empty script remains).
- Final `node tests/verify-split.mjs 2f2d248`:
  - `OK   script: 176724 vs 176729 chars`
  - `OK   style: 66766 vs 66771 chars`
- `npm test`: 244 passed, 0 failed at each move commit; 245 passed, 0 failed at the final commit.
- THEME_KEY, `lhSet(THEME_KEY` and `lhGet(THEME_KEY` all live in js/theme.js. init.js sits between theme.js and report.js.
- New test `split：拆檔完成，index.html 只剩骨架`: full JS_ORDER and CSS_ORDER equality, no script without `src`, no style element. Negative control (empty inline script added before `</body>`) failed it (1 failed, 8 passed); restored with `git checkout -- index.html`; final 9 passed.

## Phase gate

- Move-only audit: exactly 7 `refactor(03-` commits since 2f2d248, each touching only index.html, js/*.js or css/*.css (non-matching file count 0):
  - f275b57 (03-01): index.html, js/phonetic-tables.js
  - a081126 (03-02): css/base.css, css/panels.css, css/responsive.css, index.html
  - 0587c7f (03-03): index.html, js/dict.js, js/polyphonic.js, js/search.js, js/state.js
  - 4a7fd5a (03-04): index.html, js/cards.js, js/lyrics.js, js/panels.js, js/wordlist.js
  - 85c3e3d (03-04): index.html, js/ai-client.js, js/candidates.js, js/rhyme-display.js
  - df62c93 (03-05): index.html, js/ai-generate.js, js/results.js, js/search-ui.js, js/ui-common.js
  - 952e76e (03-05): index.html, js/ai-word-events.js, js/init.js, js/report.js, js/theme.js
  - No commit in the range mixes js/ or css/ with tests/.
- Data safety: `git diff --quiet 2f2d248 HEAD -- js/safety.js tests/fixtures tests/storage.spec.mjs tests/save-failure.spec.mjs tests/golden tests/golden.spec.mjs tests/smoke.spec.mjs` exit 0.
- No build step: `git diff --quiet 2f2d248 HEAD -- package.json package-lock.json playwright.config.mjs tests/serve.mjs` exit 0.
- Deployable as committed: `git ls-files js css` = 24; `git status --porcelain -- index.html js css tests` empty after the final commit.
- Nothing pushed; branch is gsd/v0.96-stabilize; main untouched. Final index.html: 352 lines.

## Task Commits

1. **Task 1: pure move of ai-generate/ui-common/results/search-ui** - `df62c93` (refactor)
2. **Task 2: pure move of theme/init/report/ai-word-events; skeleton** - `952e76e` (refactor)
3. **Task 3: completion-state test** - `0f37e94` (test; tests/split-tags.spec.mjs only)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. OD-3 guard passed before every edit and commit. handoff.md (gitignored) updated.

## Open notes for Andy

- Every deploy that touches css/ or js/ must bump the shared `?v=` on all tags together (split-tags enforces equality).
- `.claude/CLAUDE.md` architecture line ranges still point into the old index.html; refresh with /gsd-map-codebase (executor did not edit CLAUDE.md).
- Dead `saveApiKey()` remains in js/ai-client.js, deferred per CONTEXT.

## Known Stubs

None.

## Threat Flags

None. Only moved code and one test; T-03-14..T-03-18 mitigated by the gate checks above; no installs.

## Self-Check: PASSED

- Files exist: eight js files, index.html (352 lines), tests/split-tags.spec.mjs
- Commits exist: df62c93, 952e76e, 0f37e94 (`git rev-list --count 23f7709..HEAD` = 3)

---
*Phase: 03-split-index-html*
*Completed: 2026-10-04*
