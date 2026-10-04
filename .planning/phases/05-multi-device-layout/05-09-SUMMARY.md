---
phase: 05-multi-device-layout
plan: 09
subsystem: ui
tags: [fonts, typography, contrast, hover-guard, focus-visible, reduced-motion, playwright-static-scan]
status: complete

requires:
  - phase: 05-multi-device-layout/05-08
    provides: touch-floor blocks, 44px hit targets, confirm-before-delete
  - phase: 05-multi-device-layout/05-06
    provides: bottom sheets (.side-panel, .mobile-backdrop transitions)
provides:
  - "index.html: preconnect x2 and one Google Fonts stylesheet link (Noto Sans TC 400/700, JetBrains Mono 400) before the local stylesheets; css/base.css has no @import"
  - "css/*.css: every font-weight is 400 or 700; no font-size below 0.75rem"
  - "css/base.css: light --text-secondary #5a6577; dead duplicate dark --container-bg removed; global :focus-visible ring; .char-card transition limited to transform, box-shadow, border-color"
  - "css/*.css: every :hover rule inside @media (hover: hover) and (pointer: fine)"
  - "css/responsive.css: prefers-reduced-motion block (container, results grid, side panel, backdrop, render-status)"
  - "tests/style.spec.mjs: 11 tests starting with the word 視覺; tests/split-tags.spec.mjs: fonts test replaces the @import test"
affects: [05-10, 05-11]

plan_head_before: 7c9f3ed77daba370a78c9a0fbf0f2486465d279f
plan_head_after: 4c6927a5b94accb4beefa1f83d7de7e949d4bac5

actuals:
  tokens: 6400     # chars/4 over the added lines in index.html css/ tests/ (25734 chars)
  tasks: 2
  commits: 2       # MEASURED: git rev-list --count 7c9f3ed..HEAD (before the docs commit)

tech-stack:
  added: []
  patterns:
    - "Hover guard is applied in place: each :hover rule is wrapped where it sits (nested inside an existing max-width media block when needed), so cascade order does not change"
    - "Static CSS scanners strip comments first and parse blocks with a depth stack; every scanner has a negative control inside the same test"
    - "Colour literal allow-list is built at test time from git show 078c5d1:css/<file>"
    - "Focus-ring test waits for the element's running transitions before measuring (many buttons have transition: all, so the outline fades in)"

key-files:
  created:
    - tests/style.spec.mjs
  modified:
    - index.html
    - css/base.css
    - css/panels.css
    - css/responsive.css
    - tests/split-tags.spec.mjs
    - .planning/TEST-CHECKLIST.md

key-decisions:
  - "Hover rules are wrapped in place, not grouped at the end of each file, so cascade order is unchanged"
  - "Reduced-motion block lives at the very end of css/responsive.css and uses !important only for the transition-duration override (the sheet and backdrop have several more specific transition rules)"
  - "Input fields keep their own outline: none plus focus border; the global ring sits before them in base.css so they are not double-ringed"

requirements-completed: [UI-02]

duration: ~35 min
completed: 2026-10-04
---

# Phase 5 Plan 09: One typeface weight system, readable greys, hover only for mouse, visible keyboard focus, calm motion Summary

Fonts now load from `<head>` with preconnect (no more `@import` stall), the whole site uses weights 400 and 700 and nothing under 12px, the light secondary grey passes 4.5:1, touch devices no longer get sticky hover, Tab shows a 2px ring in the highlight colour, and `prefers-reduced-motion` switches off the entrance, fade and sheet animations, all through the existing colour variables.

## What was done

**Task 1, commit `378e143`** (index.html, css/*.css, tests/split-tags.spec.mjs, tests/style.spec.mjs)
- Removed the `@import` line from css/base.css. index.html `<head>`, before the local stylesheets: `preconnect` to fonts.googleapis.com and fonts.gstatic.com (crossorigin) plus one stylesheet link `Noto+Sans+TC:wght@400;700` and `JetBrains+Mono:wght@400`, `display=swap`. No other origin.
- Weights: 300 and 500 to 400; 600 and 900 to 700 (one 900, outside the plan's listed set, also became 700). Font sizes below 0.75rem (0.52, 0.62, 0.65, 0.68, 0.7, 0.72, 0.74) raised to 0.75rem, including the rare mark, ai-badge and mark-badge.
- split-tags: the old "first rule is @import" test is replaced by 「split：字型由 head 連結載入（preconnect＋400/700），base.css 不再 import」 (no @import, both preconnect hrefs, gstatic has crossorigin, exactly one Google Fonts stylesheet link with wght@400;700, placed before the first local stylesheet, and the only external origins in head are the two Google ones).
- style.spec.mjs created with the weight test, the size test (comment-stripped parse; rem and px values) and a scanner self-check.

**Task 2, commit `4c6927a`** (css/*.css, index.html, tests/style.spec.mjs)
- Light `--text-secondary: #5a6577`; deleted the dead first `--container-bg` in the dark block.
- All 41 unguarded `:hover` rules wrapped in `@media (hover: hover) and (pointer: fine)` (the 42nd, the save-banner button, already was). One rule sits inside a max-width: 440px block and is wrapped in a nested media query there.
- Global `:focus-visible { outline: 2px solid var(--highlight-border); outline-offset: 2px; }` placed right after the `*` reset.
- `@media (prefers-reduced-motion: reduce)` at the end of css/responsive.css: `.container, .results-grid { animation: none }`, `.side-panel, .mobile-backdrop { transition-duration: 0.01ms !important }`, `.render-status { animation: none }` (05-10 adds that element).
- `.char-card` transition is now `transform, box-shadow, border-color` at 0.2s; index.html saved-pool empty text is 「點擊上方詞彙保留」 (js/panels.js already said this, so it was not touched).
- Tests: contrast, default base colour, theme precedence matrix (3 stored x 2 system = 6 cases), hover scan (+negative control), Tab focus ring (12 Tab stops at 1440x900, then keyboard to a polyphonic chip), colour-literal scan, reduced motion (backstop, emulated media plus a no-preference control), card transition and empty text.

## Measured contrast (WCAG relative luminance, computed variables after loadColors)

| Theme | Text | Surface | Ratio |
|-------|------|---------|-------|
| light | --text-primary #2d3748 | --container-bg #eee3ce | 9.43 |
| light | --text-primary #2d3748 | --card-bg #f7fafc | 11.44 |
| light | --text-secondary #5a6577 | --container-bg #eee3ce | 4.64 |
| light | --text-secondary #5a6577 | --card-bg #f7fafc | 5.62 |
| dark | --text-primary #d2c8b7 | --container-bg #111c31 | 10.28 |
| dark | --text-primary #d2c8b7 | --card-bg #2d3748 | 7.24 |
| dark | --text-secondary #a0aec0 | --container-bg #111c31 | 7.54 |
| dark | --text-secondary #a0aec0 | --card-bg #2d3748 | 5.32 |

The old `#6b778a` on `#eee3ce` is below 4.5 (asserted in the test as proof the measurement can fail). Default dark `--container-bg` is `#111c31`, the inversion of the light default.

## Verification

| Run | Result |
|-----|--------|
| `npx playwright test tests/split-tags.spec.mjs tests/style.spec.mjs tests/golden.spec.mjs` (Task 1) | 56 passed |
| `npm test` after Task 1 | 353 passed, 21 skipped, 1 failed (known cloud-only worker-config) |
| `npx playwright test tests/style.spec.mjs tests/save-failure.spec.mjs tests/golden.spec.mjs tests/layout.spec.mjs` | 135 passed |
| `npx playwright test tests/style.spec.mjs -g "視覺"` | 11 passed |
| mutation: focus rule disabled, reduced-motion block disabled | Tab test and reduced-motion test both fail |
| `npm test` after Task 2 (final) | 361 passed, 21 skipped, 1 failed (known cloud-only worker-config) |

Acceptance: `@import` in base.css 0; `wght@400;700` in index.html 1; `rel="preconnect"` 2; non-400/700 weights 0; `#5a6577` in base.css 1; `prefers-reduced-motion` count 1; `:focus-visible` in base.css 1; `點擊詞彙保留` in index.html 0; save-failure spec 0 failed (banner contrast still passes); golden `git diff --quiet 078c5d1 -- tests/golden` exit 0. The `?v=` stays at 0.96.6 (05-11 owns the bump).

## Deviations from Plan

**1. [Plan wording] Hover rules wrapped in place instead of grouped per file**
- **Found during:** Task 2.
- **Issue:** the plan says to move hover rules into grouped media blocks. Grouping would move rules to a different place in the cascade (and one sits inside a max-width block), which can change which rule wins.
- **Fix:** each rule is wrapped where it sits (nested inside the existing max-width: 440px block for the one rule there). Selectors and values unchanged.
- **Commit:** 4c6927a

**2. [Rule 1 - Test measured the wrong thing] Focus ring measured mid-transition**
- **Found during:** Task 2 (Tab test).
- **Issue:** `.input-mode-btn` and many other buttons have `transition: all`, so the outline width read 0 immediately after Tab.
- **Fix:** the test waits for the focused element's running animations to finish before reading the outline. The ring itself is correct (fades in over 0.2s).
- **Commit:** 4c6927a

**3. [Plan wording] Chip target in the Tab test**
- The plan says Tab reaches "buttons and chips". At 1440x900 the filter chips live in a collapsed side panel and are not focusable, so the chip check walks from the search box to a polyphonic chip (appears after searching 樂) instead.

**4. [Plan wording] font-weight 900**
- One `font-weight: 900` existed outside the plan's 300/500/600 list; mapped to 700 so the "only 400 or 700" truth holds.

**Total deviations:** 4 (1 cascade-safety choice, 1 test timing, 2 wording). **Impact:** none on the plan's truths.

## Notes for later plans

- 05-10: `.render-status` already has its reduced-motion rule (animation: none); keep its pulse as a CSS animation on that class so the rule applies.
- New hover styles must be written inside the hover/fine media query (the static scan fails otherwise) and new colours must use existing variables or black rgba (the colour scan fails otherwise).
- 05-11 does the single `?v=` bump for this and the other CSS changes.

## Backstop items for the 05-11 UAT list (real devices, OD-3)

1. Real eyes on type: checklist 05-09-1 to 05-09-3 (weights, readable grey in both themes).
2. Real touch: 05-09-4 (no sticky hover on a phone or tablet).
3. Keyboard focus ring and custom accent colour: 05-09-5, 05-09-8.
4. System "reduce motion" on a real device: 05-09-7 (truth marked backstop; emulated media is verified here).

## Known Stubs

None.

## Threat Flags

None. T-05-20 accepted: same two Google origins, tests assert no other external origin in head. T-05-21 mitigated: computed contrast test over light and dark defaults, all 8 pairs at or above 4.5 (lowest 4.64). T-05-SC: no package installs (colour scan uses git and node:child_process).

## Self-Check: PASSED

- Files found: tests/style.spec.mjs, index.html, css/base.css, css/panels.css, css/responsive.css, tests/split-tags.spec.mjs.
- Commits found: 378e143, 4c6927a.
