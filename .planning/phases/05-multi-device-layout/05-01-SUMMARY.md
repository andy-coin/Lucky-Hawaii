---
phase: 05-multi-device-layout
plan: 01
subsystem: ui
tags: [ui-scale, root-font-size, playwright, parity-gate, localStorage]
status: complete

requires:
  - phase: 04-wordlist-cache
    provides: stable 277-test suite, js/safety.js storage registry, ?v=0.96.6 tag set
provides:
  - "js/layout.js: setUiScale / lhNormalizeScale / lhUiScale, loaded in head before first paint"
  - "lh:uiScale registered in LH_KEYS (17 keys)"
  - "Pass A gate: tests/parity.spec.mjs (LH_PARITY=capture|check, 21 cases) plus the 'before' set in baseline-before/"
  - "tests/layout-lib.mjs (DEVICES, waitStill, setScale, expectFullyInViewport); bootPage device/colorScheme; render-aware settle"
affects: [05-02, 05-03, 05-04, 05-05, 05-06, 05-07, 05-08, 05-09, 05-10, 05-11]

plan_head_before: 078c5d114514f3be12a04840c40b197b52156998
plan_head_after: 1d0356fca2a436b968a3f4903f7ef94020bc515b

actuals:
  tokens: 7700     # chars/4 over the realized diff (30740 chars, golden excluded)
  tasks: 2
  commits: 3       # MEASURED: git rev-list --count 078c5d1..HEAD

tech-stack:
  added: []
  patterns:
    - "Zoom is the root font-size: html { font-size: calc(100% * var(--ui-scale)) }, value written by a head script"
    - "Stored value is normalised on read (Number, round to step 5, clamp 50-150, bad value -> 100); only String(n/100) reaches CSS"

key-files:
  created:
    - js/layout.js
    - tests/layout-lib.mjs
    - tests/parity.spec.mjs
    - tests/layout.spec.mjs
    - .planning/phases/05-multi-device-layout/baseline-before/ (15 PNG + 15 parity JSON, git-ignored)
  modified:
    - tests/helpers.mjs
    - index.html
    - css/base.css
    - css/responsive.css
    - js/search-ui.js
    - js/safety.js
    - js/theme.js
    - js/cards.js
    - tests/split-tags.spec.mjs
    - tests/scan.spec.mjs

key-decisions:
  - "The label (#MzoomValue) is re-synced on DOMContentLoaded by layout.js itself; the first-paint test reads the label at window load because its own DCL listener registers first"
  - "No new tags in index.html beyond js/layout.js; ?v= stays 0.96.6 (OD-5)"

requirements-completed: []   # PERF-01 is declared here but is not marked complete until the last plan that declares it

duration: ~25 min
completed: 2026-10-04
---

# Phase 5 Plan 01: Scale tracer (root font-size, parity baseline) Summary

The zoom buttons now drive `--ui-scale` on `<html>` from a head script, with no CSS `zoom` left in the code, and the 100% view is unchanged. The scale is saved as `lh:uiScale`. The pre-redesign look is frozen as 15 screenshots and 15 computed-style files.

## What was done

**Task 1 (tracer), two commits**
- `a9e6442` (test-only, first Phase 5 commit): `bootPage` gains `device` and `colorScheme`. `settle()` also waits until `#resultsContainer` has no `data-render` or it is `idle`/`done`. Added `tests/layout-lib.mjs` and `tests/parity.spec.mjs`. Captured the "before" set on unmodified css/js.
- `12e61ba` (feat): `js/layout.js` is the second `<script>` in `<head>`. It holds `lhNormalizeScale` and `setUiScale`, and applies the stored value before first paint. `zoomIn`/`zoomOut` call `setUiScale(lhUiScale ± LH_UI_SCALE_STEP)`. `html` font-size is `calc(100% * var(--ui-scale))`. `lh:uiScale` is registered (16 to 17 keys). `split-tags` and `scan` specs were updated. 4 layout tests were added.

**Task 2, one commit**
- `1d0356f` (refactor): removed the dead `.zoom-control` slider (markup, both CSS rules, the theme.js listeners), `MzoomScale`/`MzoomBaseRatio`, and the `resultsSection` alias. Added `_lhSyncScaleControls()`: ➖ is `disabled` + `aria-disabled="true"` at 50, ➕ at 150. Added `aria-label` on both buttons. 2 more layout tests: a static zoom scan with a negative control, and the limit tests.

## Verification

| Run | Result |
|-----|--------|
| `LH_PARITY=capture` | 21 passed |
| `LH_PARITY=check` on the same code (determinism) | 21 passed |
| Baseline `npm test` before any change | 277 passed |
| `npm test` after commit 1a | 277 passed, 21 skipped (parity, no LH_PARITY) |
| `LH_PARITY=check` after commit 1b | 21 passed |
| `npm test` after commit 1b | 281 passed, 21 skipped |
| `LH_PARITY=check` after commit 2 | 21 passed |
| `npm test` after commit 2 | 283 passed, 21 skipped, 0 failed |
| `layout.spec.mjs -g 縮放` | 6 passed |
| `git diff --quiet 078c5d1 -- tests/golden` | unchanged |

Acceptance greps: baseline-before holds 15 PNG and 15 parity JSON. The first commit lists only `tests/helpers.mjs`, `tests/layout-lib.mjs`, `tests/parity.spec.mjs`. The `zoom` grep, the removed-global grep, `id="zoomSlider"` count (0) and the `aria-disabled` count (2) all pass. Script order in index.html is safety.js then layout.js. Tracer gate: `⚡ Tracer verified end-to-end — expanding`.

PHASE_BASE = `078c5d1` (full `078c5d114514f3be12a04840c40b197b52156998`). The "before" set is in `.planning/phases/05-multi-device-layout/baseline-before/` (about 22 MB, git-ignored). Later plans must compare against it with `LH_PARITY=check`, and the capture must not be re-run after css/js changes.

## Deviations from Plan

**1. [Rule 3 - Blocking] `.gitignore` could not be committed**
- **Found during:** commit 1a
- **Issue:** `.gitignore` is listed in itself (line 10), so it is untracked and ignored. The plan's commit 1a lists it as a fourth path. Staging it needs `git add -f`, which is forbidden for ignored files.
- **Fix:** The `tests/parity.spec.mjs-snapshots/` entry is added locally and works (`git check-ignore` confirms). Commit 1a contains the three tracked files only.
- **Files modified:** `.gitignore` (local only)
- **Commit:** a9e6442

**2. [Rule 1 - Bug in test] First-paint test asserted the label too early**
- **Found during:** commit 1b verification
- **Issue:** The test's `DOMContentLoaded` listener is registered before layout.js's own, so it saw the label as `100%`.
- **Fix:** Font size is read at `DOMContentLoaded`, the label at `load`.
- **Files modified:** `tests/layout.spec.mjs`
- **Commit:** 12e61ba

Otherwise the plan was executed as written.

## Known Stubs

None.

## Threat Flags

None. `lh:uiScale` read-back is covered by T-05-01 (normalise + numeric-only CSS write) and T-05-02 (registered, 17 keys). No existing localStorage key was changed.

## Self-Check: PASSED

- Files found: `js/layout.js`, `tests/layout-lib.mjs`, `tests/parity.spec.mjs`, `tests/layout.spec.mjs`, 15 PNG and 15 JSON in `baseline-before/`.
- Commits found: a9e6442, 12e61ba, 1d0356f.
