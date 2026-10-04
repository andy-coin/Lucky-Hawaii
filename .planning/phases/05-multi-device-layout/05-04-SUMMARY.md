---
phase: 05-multi-device-layout
plan: 04
subsystem: ui
tags: [save-banner, settings-dialog, dialogs, short-screens, touch-targets]
status: complete

requires:
  - phase: 05-multi-device-layout/05-03
    provides: structural tokens (--app-h, --hit, --sp-*), layout-lib helpers (auditVisibleControls, rectsOverlap)
provides:
  - "js/safety.js: save-failure banner is the first child of .container (in flow), fixed fallback re-parented on DOMContentLoaded; injected lhSafetyStyle removed"
  - "css/base.css: .lh-save-banner rules, settings dialog visible on every device, dialog button/colour-swatch 44px floors, 1rem clearance around 重設顏色!"
  - "settings, about, feedback and hashtag dialogs sized from the visible height (max-height calc(var(--app-h) - 2rem)) and scroll internally"
affects: [05-05, 05-06, 05-08, 05-09]

plan_head_before: 0bb0466b385314cde2991110cacdb8e2e95915a0
plan_head_after: 05c5e450f7bdf5937749d14dc1f09c34448e3126

actuals:
  tokens: 5700     # chars/4 over the realized diff (22931 chars)
  tasks: 2
  commits: 2       # MEASURED: git rev-list --count 0bb0466..HEAD

tech-stack:
  added: []
  patterns:
    - "Banner is a flex item of .container: z-index applies without position, so it stays position: static (in flow) yet sits above the 800-level side panels"
    - "Dialog boxes: width min(<old width>, 92vw); max-height calc(var(--app-h) - 2rem); overflow-y auto; overscroll-behavior contain"

key-files:
  created: []
  modified:
    - js/safety.js
    - css/base.css
    - css/responsive.css
    - css/panels.css
    - index.html
    - tests/save-failure.spec.mjs
    - tests/layout.spec.mjs

key-decisions:
  - "Banner z-index 820 (above desktop side panels at 800, below the phone sheet backdrop at 840) so its buttons stay clickable while panels still overlay the card; removable after 05-05 pushes the card instead of overlaying it"
  - "Removed the dead `.color-panel { display: none !important }` in the 440 block (base.css already hides it) to reach the plan's important-count target"
  - "The feedback button inside settings got its own light/dark colours (it was the white-on-translucent header style, invisible on a card background now that it shows on desktop)"

requirements-completed: []   # UI-01 and UI-02 are declared here but not marked complete until the last plan that declares them

duration: ~30 min
completed: 2026-10-04
---

# Phase 5 Plan 04: Save banner in flow and complete, scroll-safe dialogs Summary

The save-failure banner now sits at the top of the main card and pushes content down, so it can no longer cover the search box or header buttons. The settings dialog offers custom colours, save/load and feedback on every device, and all four dialogs fit short screens and scroll inside themselves.

## What was done

**Task 1, commit `2b76d2a`** (js/safety.js, css/base.css, tests/save-failure.spec.mjs)
- `_lhBannerStyle` and the injected `<style id="lhSafetyStyle">` are gone. The banner is built with createElement only and its text is still `textContent` from the fixed `LH_BANNER_TEXT` map (T-05-08). Throttle and copy are unchanged.
- If `.container` exists the banner is `container.prepend(el)`. If it does not (failure raised while the body is being parsed) the banner is appended to the body with class `lh-save-banner--fixed` and a minimal inline style (fixed, top 12px, left and right 12px, z-index 10000). A one-time DOMContentLoaded handler removes the class and the inline style and prepends it into `.container`.
- css/base.css has the `.lh-save-banner` rules from the plan (flex, wrap, 4px red left border, `min-height: 2.25rem` buttons, `var(--hit)` under `max-width: 900px` or coarse pointer, hover border only for fine hover pointers). No new colours.
- Tests added: geometry test per device (phone, tablet, desktop) at 100% and 150%: banner is `.container`'s first element child, computed position `static`, no other visible control overlaps it, both buttons >= 44px on touch devices. Early-failure test: the page HTML is intercepted and a script placed right after `<body>` makes `lhSet` fail before `.container` exists; it asserts the fixed state at that moment and the in-flow state after load.

**Task 2, commit `05c5e45`** (css/base.css, css/responsive.css, css/panels.css, index.html, tests/layout.spec.mjs)
- The wide-screen hiding of `.settings-color-section`, `.settings-saveload` and `.settings-feedback-btn` and the 440 re-show override (with `!important`) are removed. Colour labels use `--text-secondary` at every width. `.settings-feedback-btn` got its own card-background colours.
- Dialogs: `.settings-dropdown` is `width: min(22rem, 92vw)` (replaces min/max-width). `.about-content` (25rem), `.feedback-modal` (26.25rem) and `.hashtag-popup` (18.75rem) use `width: min(<old>, 92vw)`. All four get `max-height: calc(var(--app-h) - 2rem)`, `overflow-y: auto`, `overscroll-behavior: contain`; flex children of settings and hashtag dialogs have `flex-shrink: 0` so they scroll instead of being squashed.
- Under `max-width: 900px` or coarse pointer: dialog buttons, colour rows and `input[type=color]` have a `var(--hit)` minimum. 重設顏色! has `margin-top: var(--sp-4)`, as does the button after it; the 440 block's `margin: 0 auto` (which wiped the top margin) became left and right auto. Inline `margin-top` values on those two buttons and the feedback button were removed from index.html (copy unchanged).
- Tests added (4): colours, save/load and feedback visible at desktop, tablet and phone; 844x390 dialogs no taller than innerHeight minus 32 and scrollable; 重設顏色! at least 16px from every other dialog button; text colour equal to container colour at 390x844 and 150% still resets.

## Verification

| Run | Result |
|-----|--------|
| `save-failure.spec.mjs` before edits | 8 passed |
| `save-failure.spec.mjs` after task 1 | 12 passed (8 existing + 4 new) |
| `npm test` after task 1 | 298 passed, 21 skipped, 0 failed |
| `layout.spec.mjs -g "設定"` after task 2 (includes the older 輸入 test that matches the word) | 5 passed |
| `layout.spec.mjs -g "重設顏色"` | 2 passed |
| `npm test` after task 2 | 302 passed, 21 skipped (parity, no LH_PARITY), 0 failed |
| `git diff --quiet 078c5d1 -- tests/golden` | unchanged |
| New settings tests run against the pre-task CSS and markup | 3 of 4 failed as expected (visibility, short-screen, spacing); the text-equals-background test already passed on the old CSS, so it is a guard rather than a red test |

Acceptance greps: `lhSafetyStyle` count 0; `prepend(` count 2; `.lh-save-banner` in css/base.css 6; `!important` in css/responsive.css 7; no `display: none` after `.settings-saveload`; `calc(var(--app-h) - 2rem)` in all three CSS files.

## Deviations from Plan

**1. [Rule 1 - Bug] Banner buttons were covered by the open side panel (existing tests failed)**
- **Found during:** Task 1 first full run. Existing tests "寫入被拒..." and "60 秒內..." timed out clicking 關閉: the fixture opens both side panels, and at 1280px the right panel (z-index 800, fixed) lies over the right end of the in-flow banner where the buttons are.
- **Fix:** `z-index: 820` on `.lh-save-banner` (works without `position` because it is a flex item, so it stays static and in flow). Below the phone sheet backdrop (840).
- **Files modified:** css/base.css
- **Commit:** 2b76d2a

**2. [Rule 3 - Blocking] Geometry test collapses the side panels**
- **Issue:** with panels open on desktop, the full-height panel tabs overlap the banner's outer 28px on each side. Panels overlaying the card is pre-existing and is what 05-05 replaces with panels that push the card.
- **Fix:** the new geometry test boots with `leftPanelCollapsed` and `rightPanelCollapsed` set to `'true'`; the comment in the test says to drop the override once 05-05 lands.
- **Commit:** 2b76d2a

**3. [Rule 3 - Test design] Early-failure test uses an intercepted index.html instead of an init script**
- **Issue:** `lhSet` is defined only after safety.js loads, so an init script cannot call it before DOMContentLoaded.
- **Fix:** `page.route` rewrites `<body>` to start with a script that fails one write, and records whether the banner was fixed and in the body at that moment.
- **Commit:** 2b76d2a

**4. [Rule 2 - Missing critical] Feedback button in settings had header colours**
- **Issue:** `.save-load-btn` is white text on a translucent white fill. Inside the settings dialog (card background) the 回報 button would be unreadable on desktop and tablet.
- **Fix:** `.settings-feedback-btn.save-load-btn` uses `--container-bg`, `--text-primary` and `--border`, same as the two save/load buttons.
- **Commit:** 05c5e45

**5. [Plan baseline drift] `!important` count**
- The plan said the file had 8 and the target is 7. 05-03 had added one, so it had 9. Removing the settings re-show override gave 8; I also removed the dead `.color-panel { display: none !important }` in the 440 block (css/base.css already hides it) to reach 7.
- **Commit:** 05c5e45

**Total deviations:** 5, all auto-fixed. Impact on the plan's truths: none.

## Notes for later plans

- STATE.md todo 「存檔失敗橫幅 #lhSaveBanner 可能擋住頂端中間的按鈕」 is resolved by this plan.
- 05-05: when side panels push the card, remove the `z-index: 820` on `.lh-save-banner` and the panel-collapsed override in the geometry test, and let the test also run with panels open.
- Dialog overlays still use their old z-index values (settings and about 999, hashtag 960, feedback 12000). The banner (820) sits under all of them, as before it sat above (10000); a dialog open while a save fails will hide the banner until it closes.
- The settings dialog is now ~22rem wide on desktop and tablet, up from 20rem max.

## Known Stubs

None.

## Threat Flags

None. T-05-08 (banner text is textContent from the fixed map, DOM built with createElement) and T-05-09 (in-flow placement, geometry test at 3 viewports and 2 scales) are mitigated. T-05-10 is mitigated by the scrollable dialog and the 390x844 / 150% reset test. T-05-SC: no package installs, package.json untouched.

## Self-Check: PASSED

- Files found: js/safety.js, css/base.css, css/responsive.css, css/panels.css, index.html, tests/save-failure.spec.mjs, tests/layout.spec.mjs.
- Commits found: 2b76d2a, 05c5e45.
