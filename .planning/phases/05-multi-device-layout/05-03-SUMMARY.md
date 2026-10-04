---
phase: 05-multi-device-layout
plan: 03
subsystem: ui
tags: [layout-shell, dvh, safe-area, header-toolbar, ui-scale, media-query-helpers]
status: complete

requires:
  - phase: 05-multi-device-layout/05-02
    provides: all sizes in rem, rem guard test, layout-lib setScale / expectFullyInViewport
provides:
  - "css/base.css :root structural tokens (--app-h, --page-pad, --tabbar-h, --kb-inset, --vv-top, --tab-w, --panel-w, --hit, --body-extra, --pad-t, --pad-b, --sp-1..7)"
  - "body and .container sized from --app-h minus pad-t and pad-b; the page itself never scrolls"
  - "index.html .header-toolbar with .zoom-cluster and .zoom-reset (tap the percentage to return to 100%)"
  - "js/layout.js LH_MQ_PHONE, LH_MQ_SHEET, lhIsPhone(), lhIsSheetMode()"
  - "tests/layout-lib.mjs noPageScroll, rectsOverlap, auditVisibleControls"
affects: [05-04, 05-05, 05-06, 05-07, 05-08, 05-09, 05-10, 05-11]

plan_head_before: 52e63667206b0ef5fd530153c1af441d513dad6e
plan_head_after: 0bb0466b385314cde2991110cacdb8e2e95915a0

actuals:
  tokens: 7300     # chars/4 over the realized diff (29126 chars, golden excluded)
  tasks: 2
  commits: 2       # MEASURED: git rev-list --count 52e6366..HEAD

tech-stack:
  added: []
  patterns:
    - "Structural tokens live on :root; --body-extra is declared on :root (not body) so --pad-b can read it"
    - "Breakpoints are read only through lhIsPhone() / lhIsSheetMode(); components attach a change listener on LH_MQ_PHONE"
    - "Physical 44px floors written as max(44px, 2.75rem) so controls never shrink with the scale"

key-files:
  created: []
  modified:
    - index.html
    - css/base.css
    - css/responsive.css
    - css/panels.css
    - js/layout.js
    - js/theme.js
    - js/search-ui.js
    - tests/layout-lib.mjs
    - tests/layout.spec.mjs

key-decisions:
  - "The search placeholder reuses the long text already in index.html as the desktop value (stored once at load) instead of repeating the string in JS"
  - ".mobile-tab-bar height now uses var(--tabbar-h) so the bar and the body reserve are the same number at every scale"
  - "h1 line-height 1.2 and subtitle line-height 1.3 apply at 900px and below only, so the desktop header stays near its old height (166px vs 168px before)"

requirements-completed: []   # PERF-01 and UI-01 are declared here but not marked complete until the last plan that declares them

duration: ~35 min
completed: 2026-10-04
---

# Phase 5 Plan 03: Layout shell and header toolbar Summary

The page is now sized from the real visible height (dvh, safe areas and the tab-bar reserve), so it no longer overflows by 28px on a phone and never scrolls as a whole on any of the five reference viewports. The zoom buttons, the new tap-to-reset percentage and the theme toggle sit in a wrapping toolbar that stays on screen from 50% to 150% on phone, tablet and desktop.

## What was done

**Task 1, commit `421a2e7`** (css/base.css, css/responsive.css, css/panels.css, index.html, tests)
- Viewport meta is now `width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content`. It has no maximum-scale and no user-scalable.
- `:root` carries the structural tokens. `@supports not (height: 100dvh)` falls back to `100vh` (the only `100vh` left in css/base.css and css/responsive.css).
- `body` padding, `min-height` and `overscroll-behavior` come from the tokens. `.container` is `calc(var(--app-h) - var(--pad-t) - var(--pad-b))`, `width: 100%`, `max-width: min(56.25rem, 100%)`. The old `body { padding: 1.5rem }`, the two `vh` container heights and the `.options { flex-wrap: nowrap }` at 440 are gone. `.char-pinyin` got `min-width: 0; overflow-wrap: anywhere`.
- `--page-pad` is 16px at 900 and below and 12px at 440 and below. `--body-extra` is the tab-bar height at 900 and below. `--tab-w` is 2.75rem on coarse pointers.
- `.results-section` bottom padding is 1.875rem on wide screens and 1rem at 900 and below.
- Short-height rule (`max-width: 900px` and `max-height: 600px`): `.header` and `.mobile-batch-area` are hidden, and `.results-section` has `min-height: 0`.
- Tests added: whole page does not scroll (5 viewports, idle and after searching ㄢ), landscape phone shows the first card, viewport meta is exact.

**Task 2, commit `0bb0466`** (index.html, css, js/layout.js, js/theme.js, js/search-ui.js, tests)
- The loose zoom buttons, `.m-zoom-value` and the old absolute `.controls` are replaced by `.header-toolbar` holding `.zoom-cluster` (➖, `.zoom-reset` with `#MzoomValue`, ➕) and `.controls` with the theme toggle. All ids, classes, onclick handlers and aria-labels from 05-01 are kept.
- At 900px and below, and on coarse pointers, the three zoom buttons and the theme toggle have a `min-width` and `min-height` of `var(--hit)`. At 901px and above the toolbar overlays the header corners (`pointer-events` none on the row, auto on the children).
- Subtitle is 0.875rem, weight 400, opacity 1, with a text shadow. The old `.theme-toggle` hacks at 440 (relative position, negative offsets) are removed.
- `js/layout.js` exports the two media-query objects and the two helpers. `applyTheme` uses `lhIsPhone()` and re-applies on `LH_MQ_PHONE` change. `_syncSearchPlaceholder()` does the same for the search box.
- Tests added: scale-fit matrix (phone, tablet and desktop as separate tests), 150% phone toolbar with reset, header height, rotation switch of theme label and placeholder (including 440 and 441, and dark mode).

## Measured values

| Item | Value |
|------|-------|
| Header height at 100%, 390 wide | 110.2px (limit 124; was 87 before the toolbar moved into the flow) |
| Header height at 100%, 820 wide | 124.8px (limit 150; was 130.8) |
| Header height at 100%, 1440 wide | 166px (was 168; spec allows plus or minus 8) |
| Header height at 150%, 390 wide | 165.3px |
| Page overflow on 390×844 before and after | 872 vs 844 scrollHeight before; 844 after |
| Landscape 844×390, results area | 144px tall, first card at y 253 to 372, inside the viewport |

**`.search-hint` had to be hidden in the short-height rule.** Without it the first card ended at y 404 on a 390px viewport. The hint is text only, no control. With it hidden the card fits in the viewport.

## Verification

| Run | Result |
|-----|--------|
| `layout.spec.mjs -g "版面\|輸入"` after task 1 (red first: 872 vs 844, card at 404, meta mismatch) | 3 passed |
| `layout.spec.mjs` + `golden.spec.mjs` after task 1 | 53 passed |
| `npm test` after task 1 | 288 passed, 21 skipped, 0 failed |
| `layout.spec.mjs -g "縮放\|版面\|輸入"` after task 2 | 17 passed |
| `layout.spec.mjs` + `smoke.spec.mjs` + `golden.spec.mjs` after task 2 | 64 passed, 0 failed |
| `npm test` after task 2 | 294 passed, 21 skipped (parity, no LH_PARITY), 0 failed |
| `-g "50／100／150"` | 3 passed |
| `git diff --quiet 078c5d1 -- tests/golden` | unchanged |

Acceptance greps all pass: viewport meta count 1, no maximum-scale or user-scalable, `--app-h` 4 in css/base.css, `--body-extra` 2 in css/responsive.css, one `100vh` left (css/base.css, the @supports fallback), `class="header-toolbar"` 1, `onclick="setUiScale(100)"` 1, `lhIsSheetMode` defined, `LH_MQ_PHONE.addEventListener` in both theme.js and search-ui.js, no `if (phone)` left in theme.js. `LH_PARITY=capture` was not re-run, and `LH_PARITY=check` was not run (it is expected to diverge from here on).

## Deviations from Plan

**1. [Rule 1 - Bug] Gear icon wrapped to its own row at the far left on phones**
- **Found during:** Task 1 screenshot review
- **Issue:** removing `.options { flex-wrap: nowrap }` (as the plan requires) lets `.settings-trigger` wrap under the mode buttons, and with no margin it sat at the left edge.
- **Fix:** `.settings-trigger { margin-left: auto }` in the 440 block so it right-aligns on its own row. Plan 05-04 reworks the search area and may replace this.
- **Files modified:** css/responsive.css
- **Commit:** 421a2e7

**2. [Rule 2 - Missing critical] Tab bar height now follows `--tabbar-h`**
- **Found during:** Task 1
- **Issue:** the body reserve is `max(3.5rem, 48px)` but the bar was a fixed `3.5rem`. At 50% scale the bar would be 28px (below the 44px touch floor) while the body reserved 48px.
- **Fix:** `.mobile-tab-bar { height: var(--tabbar-h) }` in css/panels.css.
- **Files modified:** css/panels.css
- **Commit:** 421a2e7

**3. [Rule 1 - Test strengthened] Landscape test also checks the card is not clipped by the results area**
- **Issue:** a card can lie inside the viewport but outside the scrolling `.results-section` (it was clipped at y 318 while its box ended at 372).
- **Fix:** the test also asserts the card's top edge is inside `.results-section`. The whole card still does not fit inside the 144px results area; it is fully visible in the viewport box sense the plan specifies and reachable by scrolling the results area.
- **Files modified:** tests/layout.spec.mjs
- **Commit:** 421a2e7

**4. [Rule 3 - Blocking] Scale-fit test split into one test per device**
- **Issue:** one test for three devices took 41s against a 60s timeout, and would be flaky under parallel load.
- **Fix:** three tests (phone, tablet, desktop), about 13s each. The plan's `-g "50／100／150"` filter still matches all of them. A negative control injects an off-screen button and checks the audit catches it.
- **Commit:** 0bb0466

**5. [Rule 1 - Spec tuning] Line heights scoped to 900px and below**
- **Issue:** applying `line-height: 1.2` on h1 and `1.3` on the subtitle at all widths shrank the desktop header from 168 to 156px, outside the plus or minus 8 allowance.
- **Fix:** scoped both to the 900px block. Desktop is 166px.
- **Commit:** 0bb0466

**Total deviations:** 5, all auto-fixed. Impact: none on the plan's truths.

## Notes for later plans

- At 900px wide and 600px tall or less (landscape phones, small desktop windows) the whole `.header` is hidden, which hides the zoom buttons and the reset. This is what UI-SPEC section 4 specifies. A user stuck at a stored scale on such a window can rotate or enlarge the window to reach the reset. The truth about "reset stays reachable" is tested at the three portrait and desktop viewports only.
- On a phone at 150% the results area is about 200px tall below the search controls; 05-04 (search area) is where that gets reclaimed.
- `phone` (js/cards.js) is still read by js/init.js; 05-05 removes it. theme.js no longer uses it.
- The theme toggle text on phone is now `☀️` / `🌙` without the trailing space.

## Known Stubs

None.

## Threat Flags

None. T-05-06 (pinch-zoom kept; pinned by the viewport test) and T-05-07 (reset and ➖/➕ have 44px physical floors, asserted inside the viewport at 50, 100 and 150 on three devices) are mitigated. T-05-SC: no package installs, package.json untouched.

## Self-Check: PASSED

- Files found: index.html, css/base.css, css/responsive.css, css/panels.css, js/layout.js, js/theme.js, js/search-ui.js, tests/layout-lib.mjs, tests/layout.spec.mjs.
- Commits found: 421a2e7, 0bb0466.
