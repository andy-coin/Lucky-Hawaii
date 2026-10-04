---
phase: 05-multi-device-layout
plan: 07
subsystem: ui
tags: [visualViewport, virtual-keyboard, kb-open, input-font-floor, ios-autozoom, playwright-emulation]
status: complete

requires:
  - phase: 05-multi-device-layout/05-06
    provides: bottom sheets (height from --app-h), tab bar, close paths; sheet-handle
  - phase: 05-multi-device-layout/05-03
    provides: tokens --app-h, --kb-inset, --vv-top, --body-extra, --hit; short-height media rule; viewport meta without zoom lock
provides:
  - "js/layout.js: keyboard model - stable height, visualViewport/window/focus listeners (rAF-throttled), html.kb-open / html.kb-short, --app-h / --vv-top / --kb-inset written from raw numbers, scrollIntoView on focus and on the closed-to-open transition"
  - "css/responsive.css: kb-open responses (tab bar hidden, open sheet and four overlays fill the visible range, toast above keyboard, header and batch area hidden below 600px, lyrics focus collapses the context section) and the max(16px, 1rem) input floor for <= 900 or coarse pointer"
  - "tests/layout-lib.mjs: emulateKeyboard, restoreViewport, readKeyboard, insideVisible, meetsInputFloor, scanInputFonts"
  - "tests/layout.spec.mjs: 5 keyboard tests and 4 input tests"
affects: [05-08, 05-09, 05-11]

plan_head_before: dafacabcd495f4162c020b173bba8ed8b0922f2c
plan_head_after: 2c9c70a5f8789b9d5c599a1de008ec8b456d72fe

actuals:
  tokens: 7700     # chars/4 over the added lines in js/ css/ tests/ (30850 chars)
  tasks: 2
  commits: 2       # MEASURED: git rev-list --count dafacab..HEAD (before the docs commit)

tech-stack:
  added: []
  patterns:
    - "Keyboard = text field focused AND (max innerHeight since load - visualViewport.height) >= 150; width change resets the baseline, height-only change keeps it"
    - "Layout reacts to html classes and three numeric custom properties only; CSS never measures the keyboard itself"
    - "A font-size floor is a max(16px, 1rem) rule listing every control class, never a zoom lock; the scan test measures computed CSS px so scale and DPR do not matter"
    - "Hit boxes are measured by probing elementFromPoint outward from the box edge, not by trusting the CSS that was written"

key-files:
  created: []
  modified:
    - js/layout.js
    - css/responsive.css
    - tests/layout-lib.mjs
    - tests/layout.spec.mjs

key-decisions:
  - "All kb-open / kb-short / floor CSS sits in css/responsive.css (end of file); base.css and panels.css needed no change"
  - "The context-section collapse on lyrics focus is not tied to kb-open (plan wording: 'while a lyrics textarea is focused on <= 900')"
  - "Keyboard thresholds 150 and 600 are the UI-SPEC values, unchanged"

requirements-completed: [UI-03]

duration: ~50 min
completed: 2026-10-04
---

# Phase 5 Plan 07: Virtual keyboard never hides the field, inputs never trigger iOS zoom Summary

A visualViewport keyboard model in js/layout.js adds html.kb-open when a text field is focused and the visible height is 150px or more below the stable height; CSS then hides the tab bar, makes the open sheet and the four dialogs exactly as tall as the visible area, and hides the header below 600px. Separately, every text control is at least 16px on phones, tablets and touch screens at any scale (50 to 150), and a 20-character CJK query or a 5,000-character lyric no longer breaks the layout.

## What was done

**Task 1, commit `2a93aad`** (js/layout.js, css/responsive.css, tests)
- `js/layout.js`: `lhStableH` (max innerHeight since load, reset when innerWidth changes), `_lhTextFieldFocused()` (textarea, select, input except checkbox / radio / color / range / file / button types), rAF-throttled `_lhKbUpdate()` on visualViewport resize and scroll, window resize, focusin and focusout (setTimeout when the tab is hidden, since rAF pauses). Open: `html.kb-open`, `--app-h = vv.height + 'px'`, `--vv-top`, `--kb-inset = max(0, innerHeight - vv.height - vv.offsetTop)`, `kb-short` below 600. Closed: both classes and all three properties removed. Only numbers plus `px` are written (T-05-15). On focusin of a text field, and 250 ms later, and on the closed-to-open transition (Android focuses first and shrinks later), the focused field gets `scrollIntoView({ block: 'nearest' })`.
- `css/responsive.css` (one block at the end, `max-width: 900px`): `html.kb-open` zeroes `--body-extra`, hides `.mobile-tab-bar`, lifts `.copy-toast` to `--kb-inset + 1rem`; the open `.side-panel` gets `top: var(--vv-top); bottom: auto; height: var(--app-h); border-radius: 0`; the settings, about, hashtag and feedback overlays get the same top/height; `html.kb-short` hides `.header` and `.mobile-batch-area` and sets `.results-section` min-height 0; `.side-panel:has(.section-textarea:focus) .context-section` collapses to `--hit`; inputs get `scroll-margin-bottom: 1rem`.
- Tests (5): shrink 336 with the lyrics textarea focused (kb-open, tab bar `display: none`, field inside the visible range, `--app-h` equals `vv.height + 'px'` exactly, sheet height within 1px of `vv.height`, restore removes class and all three properties, tab bar returns); 149 does not and 150 does open, and a further 1px keeps it open; no focus (and a focused button) at 336 never opens; searching ㄢ at 390x508 hides header and batch area, results min-height 0, first card and search box inside the visible range; lyrics focus collapses the context section to 44px and releases it on blur, and with kb-open the feedback subject input, the overlay (top and height equal the visible range) and the whole dialog are inside the visible range.

**Task 2, commit `2c9c70a`** (css/responsive.css, tests)
- One rule block under `@media (max-width: 900px), (pointer: coarse)`: `font-size: max(16px, 1rem)` on the ten control selectors from UI-SPEC section 9. The old `font-size: 1rem` in the 440px `.search-input` rule is removed (it would have been 8px at 50%). `.search-input` gets `min-height: 3rem; padding-right: 4rem; text-overflow: ellipsis`; `#inputModeBtn` gets `min-width: 2.75rem; min-height: 2.5rem` and an `::after` hit expansion; `.section-textarea` gets `overflow-wrap: anywhere`. Desktop (901 and up with a mouse) is unchanged.
- Tests (4): scan over phone, tablet, phone landscape and a touch 1440x900 context, each at 50, 100 and 150, in six states (idle, lyrics, AI, settings, feedback, hashtag), also asserting the scan actually saw the controls that belong to each state, with a probe test proving the scanner catches 15.99px, passes 16px and ignores checkboxes; `meetsInputFloor` boundary (16 true, 15.99 false), 900 wide fine-pointer applies the floor, 901 and 1440 keep desktop sizes; 20-character CJK query stays a single line inside its container with no page scroll and an `inputModeBtn` whose measured clickable area is at least 44x44; 5,000-character lyric (with a 300-letter unbroken run) has `scrollWidth <= clientWidth + 1` on phone and tablet.

## Verification

| Run | Result |
|-----|--------|
| 5 keyboard tests after implementation | 6 passed (5 new + the existing touch-no-autofocus test matched by the name filter) |
| mutation: threshold 150 changed to 149 | the 149/150 boundary test fails ("差 149：不算鍵盤") |
| mutation: tab-bar rule, sheet rule and :has rule selectors broken | 2 keyboard tests fail |
| `npm test` after task 1 | 337 passed, 21 skipped, 1 failed (known cloud-only worker-config) |
| mutation: floor changed to `max(15px, 1rem)` | the 3-scale scan fails at the first state ("手機 390×844 50% 閒置") |
| `npm test` after task 2 | 341 passed, 21 skipped, 1 failed (known cloud-only worker-config) |

Acceptance greps: `visualViewport` in js/layout.js 8 (needed 2 or more); `kb-open` 3 (needed 1 or more); `html.kb-open` appears in css/responsive.css (10) and nowhere else; `:has(.section-textarea:focus)` in exactly one CSS file; `max(16px, 1rem)` 2 in css/responsive.css; `-g "149"` 1 passed; `-g "字級 ≥ 16px"` passed; `尺寸一律用 rem` passes inside the full run (max() lower bound allowed). Golden tests unchanged. The `?v=` stays at 0.96.6 (05-11 owns the bump).

## Deviations from Plan

**1. [Rule 1 - Test measured the wrong thing] Hit-expansion probe**
- **Found during:** Task 2.
- **Issue:** the first version of the 20-character test hit-tested 3px outside the button box and failed on the right and top sides. An absolutely positioned `::after` in a button is placed from the padding box, so `inset: -0.25rem` reaches 4px minus the 1.5px border = about 2.5px beyond the visible border box (button 44x40 plus 2.5px each side = 49x45).
- **Fix:** the test now probes outward with `elementFromPoint` and asserts the measured clickable area is at least 44x44 (UI-SPEC 5.2 / section 7 wording). CSS stays as the plan specifies (`inset: -0.25rem`).
- **Commit:** 2c9c70a

**2. [Plan wording] Files**
- `css/base.css` and `css/panels.css` from `files_modified` needed no edits; every new rule lives at the end of css/responsive.css so later rules win without raising selector weight.

**3. [Plan wording] Task 2 scan scope**
- `scanInputFonts` also scans controls that sit inside translated (closed) sheets, because they are rendered; that is stricter than "visible on screen". Only `display: none`, `visibility: hidden`, zero-size and fully transparent elements are skipped.

**Total deviations:** 3 (1 test-side bug, 2 wording). **Impact:** none on the plan's truths.

## Notes for later plans

- The keyboard model only sets `--app-h / --vv-top / --kb-inset` and two classes; 05-08 (touch targets) and later plans must not write those.
- `html.kb-open` rules exist only at `max-width: 900px`; on a wider touch tablet the container height follows `--app-h` (via base.css) but sheets and overlays are untouched.
- Context-section collapse on lyrics focus is not limited to kb-open (see key-decisions); it is listed for Andy to verify (05-07-7).
- The 05-11 UAT list should carry the two backstop items below.

## Backstop items for the 05-11 UAT list (real devices, OD-3)

1. **Long lyric on a real phone:** a 5,000-character lyric wraps inside its textarea with no horizontal scroll, and while typing at the end the caret stays above the virtual keyboard on a real iPhone and Android phone (checklist 05-07-6).
2. **Keyboard safety on real devices:** the caret in the search input, the lyrics textarea and the feedback dialog is never hidden by the iOS Safari or Android Chrome keyboard, and focusing an input never triggers iOS auto-zoom (checklist 05-07-1 to 05-07-5).

## Known Stubs

None.

## Threat Flags

None. T-05-15 mitigated: only `visualViewport` / `innerHeight` numbers plus `px` reach `style.setProperty`. T-05-16 mitigated: the floor is a font-size rule, the viewport meta is unchanged and the 05-03 test that forbids `maximum-scale` / `user-scalable` still passes. T-05-SC: no package installs.

## Self-Check: PASSED

- Files found: js/layout.js, css/responsive.css, tests/layout-lib.mjs, tests/layout.spec.mjs.
- Commits found: 2a93aad, 2c9c70a.
