---
phase: 05-multi-device-layout
plan: 05
subsystem: ui
tags: [side-panels, push-layout, inert, matchMedia, breakpoints, autofocus]
status: complete

requires:
  - phase: 05-multi-device-layout/05-03
    provides: structural tokens (--panel-w, --tab-w, --page-pad, --app-h), js/layout.js (LH_MQ_PHONE, LH_MQ_SHEET, lhIsPhone, lhIsSheetMode)
  - phase: 05-multi-device-layout/05-04
    provides: in-flow save banner (its z-index workaround is removed here)
provides:
  - "css/panels.css: side panels push the main card inside @media (min-width: 901px) (body.lp-open / body.rp-open gutters); shared look stays outside the media query"
  - "js/panels.js: syncCenterPanel(opener) with no px maths, both-open check against 24rem, inert sync (sheet: whole collapsed panel + aria-hidden; desktop: collapsed panel body only)"
  - "js/ui-common.js _lhApplyPanelTier() and js/init.js _lhPlaceBatchPanel(), both re-run from matchMedia change listeners"
  - "no js/ file reads innerWidth against 440 or 900; the `phone` global is gone"
affects: [05-06, 05-07, 05-08, 05-09, 05-11]

plan_head_before: 006cb39699ea8525685772f5e7449c4222ae0c74
plan_head_after: 7b25a6622052b72744a5fa90d2d6d96decb1a096

actuals:
  tokens: 7100     # chars/4 over the realized diff in css/ js/ tests/ (28416 chars)
  tasks: 2
  commits: 2       # MEASURED: git rev-list --count 006cb39..HEAD (before the docs commit)

tech-stack:
  added: []
  patterns:
    - "Desktop-only panel geometry lives inside @media (min-width: 901px); the sheet block in responsive.css no longer needs !important to undo it"
    - "One sync entry (syncCenterPanel) owns body classes, both-open rule and inert; callers pass the opener only on a user toggle"
    - "Breakpoint-dependent DOM state is a named function called at boot and from the MediaQueryList change event"

key-files:
  created: []
  modified:
    - css/panels.css
    - css/responsive.css
    - css/base.css
    - js/panels.js
    - js/lyrics.js
    - js/ui-common.js
    - js/init.js
    - js/cards.js
    - js/report.js
    - tests/layout.spec.mjs
    - tests/save-failure.spec.mjs

key-decisions:
  - "Both-open rule uses page-pad (20px) as the gutter, exactly as in UI-SPEC section 6; the collapse of the other panel is saved to its localStorage key only when the user's own click caused it, never on a plain window resize"
  - "Leaving phone width puts #m-batchPanel back at its original place in the page (remembered next sibling), not at the end of body"
  - "Crossing the sheet breakpoint also clears the sheet backdrop and the tab highlights, otherwise a sheet left open on a phone leaves an invisible overlay on a desktop-width window"

requirements-completed: []   # UI-01 is declared here but not marked complete until the last plan that declares it

duration: ~25 min
completed: 2026-10-04
---

# Phase 5 Plan 05: Push side panels and live breakpoints Summary

On desktop and landscape tablet the 歌詞 and AI 建議 panels now push the main card aside instead of sliding over it, so nothing is cut off and the zoom, theme and settings buttons stay clickable. Every layout decision follows the live window width, so rotating a tablet or dragging the window edge never leaves stale panel or batch-button state.

## What was done

**Task 1, commit `6911a06`** (css/panels.css, css/responsive.css, css/base.css, js/panels.js, js/lyrics.js, tests)
- `.side-panel` keeps only its look (fixed, background, border, shadow, z-index, transition) outside a media query. Position, height, width, per-side radius and direction, the collapsed `translateX(calc(-100% + var(--tab-w)))` and the tab width are inside `@media (min-width: 901px)`. The body gets a gutter of at least the tab width plus 0.25rem on both sides (safe-area aware) and `body.lp-open` / `body.rp-open` widen it to `--panel-w + --page-pad`. No transition on the body padding.
- The five `!important` that undid the desktop rules in the 900px sheet block are removed (count 7 to 2).
- `syncCenterPanel(opener)` lost all pixel maths (`PANEL_W`, `MIN_PANEL`, `containerLeft`). It toggles the body classes, applies the 24rem both-open rule (panel width from `getBoundingClientRect`, root font and `--page-pad` from computed style), and syncs `inert`: at 900 and below a collapsed panel is inert with `aria-hidden="true"`; above 900 only a collapsed panel's body is inert, the panel and its edge tab never are. `toggleLeftPanel` / `toggleRightPanel` pass the opener; `mobileTab` calls `syncCenterPanel()` at its end.
- 05-04 follow-up: the banner's `z-index: 820` is gone, and its geometry test now boots with both panels expanded instead of collapsed.
- Tests (4): no panel overlaps the container and the zoom and theme buttons hit-test true at 1440 and 1280 with left, right and both open; at 920 the collapsed tabs stay at least tab width plus 4px from the container; opening the second panel collapses the first at 1000 while both stay open at 1440; 40 Tab presses never land inside a collapsed panel body and the expanded panel is reachable.

**Task 2, commit `7b25a66`** (js/ui-common.js, js/init.js, js/cards.js, js/report.js, tests)
- `_lhApplyPanelTier()` collapses both panels in sheet mode and otherwise restores them from `leftPanelCollapsed` / `rightPanelCollapsed` (read only, never written), clears the sheet backdrop and tab highlights, then calls `syncCenterPanel()`. It runs at boot and on `LH_MQ_SHEET` change.
- `_lhPlaceBatchPanel()` moves `#m-batchPanel` into `#mobileBatchArea` on phone and back to its original spot otherwise; boot plus `LH_MQ_PHONE` change.
- Autofocus of `#searchInput` only when not in sheet mode and not a coarse pointer. The `innerWidth <= 900` block in init.js, the `innerWidth > 900` branch in ui-common.js and `let phone` in cards.js are deleted. The resize listener in report.js stays (cheap, needed for the both-open rule) and now calls `syncCenterPanel()` with no argument.
- Tests (7): resize sequence 1180 to 820 to 390 to 820 to 1180 asserting collapse, body classes, inert, aria-hidden, batch parent and that the stored keys are untouched; 900/901 and 440/441 flips; stale backdrop after a phone-to-desktop resize; touch devices (phone, tablet, landscape tablet) boot with focus on body and desktop on `#searchInput`; Node-only scan of `js/` with negative controls.

## Verification

| Run | Result |
|-----|--------|
| 4 new panel tests before implementation | 4 failed (red) |
| `layout.spec.mjs -g "面板"` after task 1 | 4 new passed |
| `layout + smoke + golden` after task 1 | 72 passed |
| `save-failure.spec.mjs` after banner cleanup | 12 passed |
| `npm test` after task 1 | 305 passed, 21 skipped, 1 failed (known cloud-only worker-config) |
| 4 task-2 tests before implementation | 4 failed (red) |
| `layout.spec.mjs -g "面板\|輸入"` after task 2 | 11 passed |
| `npm test` after task 2 | 310 passed, 21 skipped, 1 failed (known cloud-only worker-config) |

Acceptance greps task 1: `PANEL_W|MIN_PANEL|containerLeft` in js/panels.js 0; `min-width: 901px` in css/panels.css 1; `!important` in css/responsive.css 2. Task 2: `innerWidth` against 440 or 900 in js/ 0; `let phone =` 0; `LH_MQ_SHEET.addEventListener` in ui-common.js 1; `LH_MQ_PHONE.addEventListener` in init.js 1. Golden tests unchanged.

## Deviations from Plan

**1. [Rule 1 - Plan baseline drift] Narrow-desktop test uses 1000px, not 1100px**
- **Found during:** Task 1 test design.
- **Issue:** at 1100 the panel width is 30vw = 330, so two open panels leave 1100 - 660 - 40 = 400px for the card, which is above 24rem (384). The both-open rule correctly allows both at 1100, so the plan's example could not exercise the collapse.
- **Fix:** the test runs at 1000 (panels 320 each, 320px left, below 384, so the second open collapses the first) and also asserts both stay open at 1440. The rule itself is exactly the one in UI-SPEC section 6.
- **Commit:** 6911a06

**2. [Rule 1 - Existing test encoded the old width] Scale test measured the fixed 25rem panel**
- **Issue:** `縮放：整個介面一起放大` compared the panel width at 100% and 150%. The width is now `--panel-w` (follows the window width, capped by clamp), so 400px becomes 480px at 150%, by design of 05-03's token.
- **Fix:** the test measures the edge tab width (`--tab-w`, scales with the root font) instead.
- **Files modified:** tests/layout.spec.mjs
- **Commit:** 6911a06

**3. [Rule 3 - Blocking] Registry scan needs literal storage keys**
- **Issue:** a first version used `lhSet(cond ? 'leftPanelCollapsed' : 'rightPanelCollapsed', ...)`; `tests/scan.spec.mjs` could not resolve the key.
- **Fix:** two separate `lhSet` calls with literal keys.
- **Commit:** 6911a06

**4. [Plan follow-up from 05-04] Banner z-index and test override removed**
- css/base.css and tests/save-failure.spec.mjs are outside this plan's `files_modified`, but 05-04's notes asked for this cleanup once panels push the card. Tests pass with panels open.
- **Commit:** 6911a06

**5. [Rule 2 - Missing critical] Stale sheet backdrop and tab highlight on breakpoint cross**
- **Issue:** `.mobile-backdrop.show` is `display: block` at any width, so a sheet left open on a phone and then widened would leave a full-screen scrim on the desktop layout.
- **Fix:** `_lhApplyPanelTier` clears the backdrop and the tab highlights on every cross; new test covers it.
- **Commit:** 7b25a66

**6. [Plan wording] Batch panel returns to its original place**
- The plan says "append it back to document.body". The panel is a direct child of body in the markup, so remembering its next sibling and re-inserting there keeps the DOM order identical to before and still satisfies the parent check.
- **Commit:** 7b25a66

**Total deviations:** 6, all auto-fixed. Impact on the plan's truths: none (the 1100 example was replaced by an equivalent boundary at 1000).

## Notes for later plans

- No cache-busting `?v=` bump here; 05-11 owns the phase's single bump.
- 05-04's note about the banner is closed; the banner needs no special z-index.
- The 05-06 sheet-handle work can rely on `syncCenterPanel()` being called by `mobileTab()`, so inert and aria-hidden follow every open and close.
- The panel width token follows the window (320 to 400px at 100%), so at 150% on a 1440 window the panel is 480px, not 600px.

## Known Stubs

None.

## Threat Flags

None. T-05-11 is mitigated: `inert` is computed in one place from the current tier and the `.collapsed` state, and the tests assert expanded panels never carry it and desktop panel elements never carry it. T-05-12 accepted unchanged (only the literal `'false'` expands a panel). T-05-SC: no package installs, package.json untouched.

## Self-Check: PASSED

- Files found: css/panels.css, css/responsive.css, css/base.css, js/panels.js, js/lyrics.js, js/ui-common.js, js/init.js, js/cards.js, js/report.js, tests/layout.spec.mjs, tests/save-failure.spec.mjs.
- Commits found: 6911a06, 7b25a66.
