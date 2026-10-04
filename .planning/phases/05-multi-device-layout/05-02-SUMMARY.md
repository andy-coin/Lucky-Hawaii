---
phase: 05-multi-device-layout
plan: 02
subsystem: ui
tags: [rem, ui-scale, parity-gate, css, guard-test]
status: complete

requires:
  - phase: 05-multi-device-layout/05-01
    provides: root font-size --ui-scale, parity baseline-before (15 PNG + 15 JSON), layout-lib setScale
provides:
  - "css/base.css, css/panels.css, css/responsive.css: every size in rem (÷16), 100% view unchanged"
  - "index.html inline style attributes and the ai-generate.js status padding in rem"
  - "tests/layout.spec.mjs: rem guard (scans css/*.css and index.html style attributes, with negative controls) and whole-UI 150% scale test"
affects: [05-03, 05-04, 05-05, 05-06, 05-07, 05-08, 05-09, 05-10, 05-11]

plan_head_before: 1d0356fca2a436b968a3f4903f7ef94020bc515b
plan_head_after: 52e63667206b0ef5fd530153c1af441d513dad6e

actuals:
  tokens: 17600    # chars/4 over the realized diff (70451 chars, golden excluded)
  tasks: 2
  commits: 2       # MEASURED: git rev-list --count 1d0356f..HEAD

tech-stack:
  added: []
  patterns:
    - "Sizes are rem; px survives only for lines of 4px or less, 0, max() floors written max(Npx, Mrem), shadows, blur, letter-spacing, transform and @media breakpoints"
    - "A Node scan in layout.spec.mjs fails on any new px size above 4px, reported as file:line declaration"

key-files:
  created: []
  modified:
    - css/base.css
    - css/panels.css
    - css/responsive.css
    - index.html
    - js/ai-generate.js
    - tests/layout.spec.mjs

key-decisions:
  - "Every px in a whitelisted size property converts, including values of 4px or less (padding 3px becomes 0.1875rem) so the whole UI follows the scale. Only border widths of 4px or less stay px, because they are hairlines. The guard still tolerates values of 4px or less, so Pass B can write hairlines in px"
  - "Commented-out declarations are left as written; the guard strips comments before scanning"

requirements-completed: []   # PERF-01 is declared here but is not marked complete until the last plan that declares it

duration: ~4 min
completed: 2026-10-04
---

# Phase 5 Plan 02: Pass A px to rem Summary

All sizes in the three stylesheets, the inline styles and one JS inline style are now rem (px divided by 16). The 100% view did not move: all 21 parity cases passed on the first run with no hand fixes. A permanent guard test stops new px sizes from creeping back.

## What was done

**Task 1, commit `a289cab`** (css/base.css, css/panels.css, css/responsive.css)
- A throwaway Node script, kept outside the repo in the session scratchpad, rewrote sizes line by line. It skipped `@media`, `@import` and `@supports` lines and touched only whitelisted properties (padding, margin, gap, width, height, min/max, top/right/bottom/left/inset, flex, flex-basis, grid-template-*, border-radius, font-size, line-height). Border shorthands changed only for widths above 4px.
- Replacement counts: css/base.css 127, css/panels.css 163, css/responsive.css 150 (440 px values in total). The rem count across the three files went from 114 to 551.
- Checked afterwards that the old and new files are identical once every length is masked, so only values changed.

**Task 2, commit `52e6366`** (index.html, js/ai-generate.js, tests/layout.spec.mjs)
- Eight inline `style` attributes in index.html and `padding:6px 0` in js/ai-generate.js became rem. The plan's line numbers had shifted by a few lines, so I located them by content. `text-underline-offset:3px` stays px: it is not a sizing property and it is under 4px.
- New test "縮放：尺寸一律用 rem（px 只留 ≤4px 細線與 max() 下限）": scans css/*.css and the index.html style attributes, skips @media/@import/@supports lines and comments, and reports `file:line declaration`. It has four in-test negative controls: a 12px padding is caught, a 12px gap in an index.html style attribute is caught, and `max(44px, …)`, `border-left: 4px`, `height: 4px`, `0px`, @media lines and commented lines are accepted.
- New test "縮放：整個介面一起放大（側邊面板、分頁列、提示）": at 1440×900, the `.side-panel` width, `.mtab-btn` font-size and `.copy-toast` font-size at 150% are 1.5× their 100% values.

## Verification

| Run | Result |
|-----|--------|
| `LH_PARITY=check` after commit 1 | 21 passed (0 skipped) |
| golden + split-tags after commit 1 | 53 passed |
| `npm test` after commit 1 | 283 passed, 21 skipped (parity, no LH_PARITY), 0 failed |
| `layout.spec.mjs -g 縮放` after commit 2 | 8 passed |
| `-g "尺寸一律用 rem"` | 1 passed |
| `LH_PARITY=check` after commit 2 | 21 passed |
| `npm test` after commit 2 | 285 passed, 21 skipped, 0 failed |
| `git diff --quiet 078c5d1 -- tests/golden` | unchanged |

Acceptance checks: rem tokens 551 (needs at least 450); padding, margin or gap with a px value of 5 or more: 0; inline style px of 5 or more: 0; `padding:0.375rem 0` in js/ai-generate.js: 1; `git show --name-only HEAD` for commit 1 lists exactly the three css files. No file deletions in either commit.

## Deviations from Plan

**1. [Rule 1 - Bug in throwaway script] Whitelist missed `border-top-left-radius` and `border-top-right-radius`**
- **Found during:** Task 1, review of remaining px after the first run
- **Issue:** the pattern `border-[a-z]+-radius` has one dash group, so the four corner declarations at 30px stayed px.
- **Fix:** widened the pattern and re-ran. The script is idempotent. This changed 4 more values in css/base.css (the four 30px corner radii at lines 651, 652, 681, 682), which is why the per-file counts above include them.
- **Files modified:** css/base.css
- **Commit:** a289cab

**2. [Rule 1 - Bug in throwaway script] A commented-out declaration was rewritten**
- **Found during:** Task 1, diff review
- **Issue:** a `/* border-top: 5px solid … */` comment in css/panels.css was converted.
- **Fix:** restored the comment text. No hand edit to any real declaration was needed after parity, because parity never mismatched.
- **Files modified:** css/panels.css
- **Commit:** a289cab

**Total deviations:** 2 auto-fixed, both in the throwaway script before the first parity run. **Impact:** none on the delivered code.

## Known Stubs

None.

## Threat Flags

None. T-05-04 (parity gate before commit) and T-05-05 (permanent guard with negative control) are mitigated. T-05-SC: no package installs.

## Notes for later plans

- Floors that must stay physical are written `max(Npx, Mrem)`; the guard accepts only a px literal that is the first argument of `max(`.
- js/panels.js `syncCenterPanel` still does px maths (PANEL_W = 400); it is unaffected at 100% and 05-05 removes it.
- `LH_PARITY=capture` was not re-run; baseline-before is still the frozen pre-phase truth.

## Self-Check: PASSED

- Files found: css/base.css, css/panels.css, css/responsive.css, index.html, js/ai-generate.js, tests/layout.spec.mjs.
- Commits found: a289cab, 52e6366.
