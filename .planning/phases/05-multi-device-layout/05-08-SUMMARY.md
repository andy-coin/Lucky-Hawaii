---
phase: 05-multi-device-layout
plan: 08
subsystem: ui
tags: [touch-targets, hit-area, confirm-before-delete, context-menu-clamp, visualViewport, playwright-audit]
status: complete

requires:
  - phase: 05-multi-device-layout/05-07
    provides: keyboard model, input font floor, #inputModeBtn ::after expansion, auditVisibleControls / expectReallyClickable helpers
  - phase: 05-multi-device-layout/05-06
    provides: bottom sheets, tab bar, sheet-handle, section collapse rules
  - phase: 05-multi-device-layout/05-03
    provides: --hit token (max(44px, 2.75rem)), --app-h
provides:
  - "css/base.css, css/panels.css, css/responsive.css: one headed touch-floor block each under (pointer: coarse), (max-width: 900px) implementing UI-SPEC section 7; S batch row as a 3-column grid; collapsed rows sized 44 plus border"
  - "js/lyrics.js: removeLyricsSection asks confirm() (exact copy) only when the section text is non-empty"
  - "js/layout.js: lhPlaceMenu(el, x, y) measures the real menu and clamps it into the visual viewport; four call sites in js/report.js and js/ai-word-events.js"
  - "tests/layout-lib.mjs: meetsHit, auditTouchTargets (measured hit boxes, overlaps, mustSee)"
  - "tests/layout.spec.mjs: 7 touch tests (7 states x 2 devices, adjacency, mouse desktop, results >= 420, AI panel without search, wide touch screens) and 3 delete/menu tests"
affects: [05-09, 05-10, 05-11]

plan_head_before: 44d85c47c6eeccf8def6a74bca2b3989d705e0f8
plan_head_after: eff86bcf55cd21b63428c427b5ea885b27460c47

actuals:
  tokens: 8900     # chars/4 over the added lines in js/ css/ tests/ (35584 chars)
  tasks: 2
  commits: 3       # MEASURED: git rev-list --count 44d85c4..HEAD (before the docs commit)

tech-stack:
  added: []
  patterns:
    - "Hit boxes are measured, not trusted: elementFromPoint probed outward from each edge one pixel at a time; Chromium's hit region is (left-1, right) and (top-1, bottom), so left/top probes start at edge-1"
    - "Small visual, big target: transparent border + background-clip: padding-box (round add button), ::after inset (about i, mark badge); controls that sit next to text or other chips (chip x, section minus) are real 44x44 instead so neighbouring hit boxes cannot overlap"
    - "Menu placement measures first (left/top 0, add .show), then clamps with the real width and height against visualViewport offset and size"
    - "A destructive control made bigger gets a confirm for non-empty content; label goes into the dialog as a plain string"

key-files:
  created: []
  modified:
    - css/base.css
    - css/panels.css
    - css/responsive.css
    - js/lyrics.js
    - js/layout.js
    - js/report.js
    - js/ai-word-events.js
    - tests/layout-lib.mjs
    - tests/layout.spec.mjs
    - .planning/TEST-CHECKLIST.md

key-decisions:
  - "Chip x buttons, section minus and hint clear are real 44x44 (not ::after) so they cannot steal taps from neighbouring chips or section names; chips grow in height and width"
  - "Phone search area gives back height for the 44px controls: search-section padding 0.75rem, batch row padding 0.25rem, gear 44x44 icon only -> results region 426px at 390x844 (needs 420)"
  - "Collapsed rows are 44 plus their borders (3px lyrics section, 1px context and saved pool) so the 44px header is not clipped"
  - "Scanner exemptions: absolutely positioned overlay controls (#inputModeBtn inside the search field), .mark-badge 44x32, inline links in the about dialog"

requirements-completed: [UI-01]

duration: ~32 min
completed: 2026-10-04
---

# Phase 5 Plan 08: Everything tappable with a finger, deletes cannot lose lyrics, menus stay on screen Summary

On phones, tablets and touch screens every interactive control now has a measured hit box of at least 44x44 (mark badges 44x32), a section with written lyrics asks before it is deleted, and the right-click and long-press menus are placed from their real size inside the visual viewport at any zoom.

## What was done

**Task 1, commit `0dcdb1f`** (css/base.css, css/panels.css, css/responsive.css, tests)
- One block per file under `@media (pointer: coarse), (max-width: 900px)`. Real `min-height: var(--hit)` for mode buttons, batch buttons, gear, poly chips, filter chips, rhyme-mode buttons, generate, add-section, reset-pool, model select, AI word cards, section header and label, context refresh, search/feedback/hashtag inputs; checkbox rows 44 high with a 20x20 box; word-context items 44 high.
- Transparent expansion where the visual should stay small: `.about-btn::after` (inset -0.875rem), `.mark-badge::after` (inset -0.375rem -0.5rem, badge text 0.75rem, min-height 1.25rem), `.hashtag-add-btn` (44px border-box, transparent 0.6875rem border, `background-clip: padding-box`, visible dot stays about 22px).
- Real 44x44 for `.chip-remove`, `.section-remove` (now always `opacity: 1` on touch), `.hint-clear`, `.context-refresh-btn`; `.word-chip` / `.hashtag-chip` get `padding-right: 0` so the x sits flush at the chip end.
- Phone search area (UI-SPEC 5.2): `.m-batch-panel` is `grid; repeat(3, 1fr); gap .5rem`, the left/right 14px offsets on `.m-batch-btn` are deleted, gear is 44x44, `.search-section` padding 0.75rem 0.9375rem. Results region after searching ㄢ at 390x844 went from 394px to 426px.
- Collapsed rows: lyrics section `calc(var(--hit) + 3px)`, context and saved pool `calc(var(--hit) + 1px)`.
- `tests/layout-lib.mjs auditTouchTargets(page, { sample, mustSee })`: visible controls only (inert, hidden, zero-size, covered-at-centre ones are skipped and counted), each scrolled into view, hit box = own rect plus pixel-by-pixel `elementFromPoint` extension on four sides, checkbox via its label; many-instance groups (cards, badges) sampled evenly with first and last; overlaps compared inside the same scroll container or fixed layer, skipping nested pairs, sticky, and absolutely positioned overlay controls. Returns failures, overlaps, seen, missing (mustSee), sizes.
- Tests: 44px over 7 states (idle, searched 樂 with poly chips and badges, lyrics with collapsed section and tags, AI with words, saved chips, selected-char hint and exhausted reset button, settings, feedback, hashtag) on phone and tablet, with a probe proving 43px is caught, 44px passes, a badge 22 high passes and 18 high fails; adjacency (probe: 10px overlap caught, 4px not); mouse desktop `.mode-button` / `.batch-btn` under 44; phone results >= 420; AI panel without search (rhyme-mode and four chips >= 44, toast 「請先在上方搜尋要押韻的字」).

**Task 2, commit `4116acd`** (js/lyrics.js, js/layout.js, js/report.js, js/ai-word-events.js, css/panels.css, tests)
- `removeLyricsSection`: non-empty `text.trim()` asks `confirm('刪除「' + name + '」？段落內的歌詞會一併刪除，無法復原。')`; name is the label or 歌詞 / 新段落; cancelled returns without touching the array or storage; empty sections delete as before.
- `lhPlaceMenu(el, x, y)` in js/layout.js: set left/top to 0 and add `.show` (fixed boxes shrink-wrap to the space left of their offset), read the rect, clamp into `[vv.offsetLeft + 4, vv.offsetLeft + vv.width - w - 4]` and the same vertically; only two px numbers are written. All four old `innerWidth - 160/220` and `innerHeight - 100/140` clamps are replaced.
- `.word-ctx-menu`: `min-width: 9rem`, `max-height: calc(var(--app-h) - 1rem)` with `overflow-y: auto`; the touch `.word-ctx-item` height rule lives in the Task 1 block of css/panels.css (one copy).
- Tests: confirm exact copy, cancel keeps section, text and saved data, accept deletes and saves, empty section no dialog; label `<b>x</b>` appears literally and creates no element, empty label uses 新段落; at 150% on desktop (right-click) and phone (500 ms long-press) the char-card, AI-word and polyphonic-chip menus stay inside the visual viewport at all four corners, are at least 9rem wide, and touch items are at least 44 high.

**Follow-up, commit `eff86bc`** (css/base.css, tests)
- A spot check of wide touch screens (1180x820 tablet landscape, touch 1440x900) found `.feedback-btn` 42 wide. Added it to the `min-width: var(--hit)` rule and a test for both contexts.

## Verification

| Run | Result |
|-----|--------|
| `npx playwright test tests/layout.spec.mjs tests/golden.spec.mjs tests/smoke.spec.mjs` after Task 1 | 113 passed |
| mutation: dropped `.mode-button` / `.batch-btn` floor, `.ai-word-card` floor, `mark-badge::after`, `.word-ctx-item` height | the 44px audit failed with 16 offenders listed |
| `npm test` after Task 1 | 346 passed, 21 skipped, 1 failed (known cloud-only worker-config) |
| mutation: confirm removed, old fixed clamp restored | delete test and menu test fail |
| `npm test` after Task 2 | 349 passed, 21 skipped, 1 failed (known cloud-only worker-config) |
| `npm test` after follow-up (final) | 350 passed, 21 skipped, 1 failed (known cloud-only worker-config) |

Acceptance: `pointer: coarse` count across the three CSS files 9 (needed 3); `mark-badge::after` 1; `-g "至少 44px"` passed; `git diff --quiet 078c5d1 -- tests/golden` exit 0; `無法復原` in js/lyrics.js 1; old clamps 0; `lhPlaceMenu(` call sites 4; smoke 0 failed; `-g "刪除|選單"` 3 passed; `-g "觸控"` 7 passed. The `?v=` stays at 0.96.6 (05-11 owns the bump).

## Deviations from Plan

**1. [Rule 1 - Test measured the wrong thing] Chromium hit-test region**
- **Found during:** Task 1 (scanner self-check).
- **Issue:** `elementFromPoint` treats a box as covering (left-1, right) and (top-1, bottom). Probing half a pixel outside the left or top edge falsely counted 1px of expansion, so a 43px probe button measured 44 and passed.
- **Fix:** probes use integer points, left/top start at edge-1, right/bottom at edge, counting steps until the element is no longer hit. Measured extension now equals the real `::after` reach. The probe test locks this in (43 caught, 44 passes).
- **Commit:** 0dcdb1f

**2. [Rule 2 - Missing critical] Chip x and section minus are real 44x44, not ::after**
- **Found during:** Task 1.
- **Issue:** plan wording is `::after` for `.section-remove` / `.chip-remove` / `.hint-clear` / `.context-refresh-btn`. An expansion on a control placed next to a section name or another chip covers that neighbour, which both fails the 4px adjacency rule and makes a tap on the name delete the section (data loss, the thing this plan prevents).
- **Fix:** those controls are real 44x44; chips lose right padding. The round add button keeps its small look through a transparent border.
- **Commit:** 0dcdb1f

**3. [Rule 3 - Blocking] Results region needed height back**
- **Issue:** with 44px controls the phone results region was 394px, under the 420px truth.
- **Fix:** padding changes listed above (426px). The plan's own UI-SPEC value for `.search-section` (0.75rem) was applied; the batch-row padding and gear size are my choices.
- **Commit:** 0dcdb1f

**4. [Rule 1 - Bug] 42px-wide 回報 button on wide touch screens**
- **Found during:** final spot check at 1180x820 and touch 1440x900.
- **Fix:** `min-width: var(--hit)` for `.feedback-btn`; new test.
- **Commit:** eff86bc

**5. [Plan wording] Scanner details**
- Probes sit at the actual box edge instead of "21px from the centre" (which would only prove 42px); controls whose centre is covered by a backdrop or collapsed sheet are skipped; the filter-chip row is hidden before a single-character search (existing behaviour), so the "no search" test shows it only to measure the CSS size; the search-field overlay button is exempt from the adjacency check.

**Total deviations:** 5 (2 test-side or scanner, 1 safety-driven design change, 1 layout, 1 follow-up bug). **Impact:** none on the plan's truths; chips and tags are visibly taller on touch (listed for Andy as D-8).

## Notes for later plans

- Keep the touch blocks at the end of each CSS file; later rules in responsive.css win over base.css and panels.css at equal weight.
- Phase 9 (undo) replaces the section-delete confirm; remove it then and keep the data-safety test intact.
- 05-09 (card rendering) and 05-11 (cache bump and UAT) must not shrink cards below `min-height: var(--hit)` or change the `.mark-badge::after` inset.
- `auditTouchTargets` is reusable for later screens (pass `mustSee` so a scan can never be empty).

## Backstop items for the 05-11 UAT list (real devices, OD-3)

1. **Fingers on glass:** the 44px targets are measured, not felt; checklist 05-08-1 to 05-08-4 and 05-08-7 on a real phone and a real tablet.
2. **Delete safety:** checklist 05-08-5 and 05-08-6 on a real phone (the browser's own confirm window looks different per device).
3. **Menus at 150%:** checklist 05-08-9 with a real long-press.

## Known Stubs

None.

## Threat Flags

None. T-05-17 mitigated: the section label goes into `confirm()` as a plain string (test: `<b>x</b>` appears literally, no element created). T-05-18 mitigated: non-empty sections need a confirm and cancelling leaves array, textarea and stored data unchanged (test). T-05-19 mitigated: `lhPlaceMenu` clamps with the measured size inside the visual viewport at four corners, 150%, desktop and phone (test). T-05-SC: no package installs.

## Self-Check: PASSED

- Files found: css/base.css, css/panels.css, css/responsive.css, js/lyrics.js, js/layout.js, js/report.js, js/ai-word-events.js, tests/layout-lib.mjs, tests/layout.spec.mjs.
- Commits found: 0dcdb1f, 4116acd, eff86bc.
