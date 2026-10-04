---
phase: 05-multi-device-layout
plan: 06
subsystem: ui
tags: [bottom-sheet, tab-bar, aria-pressed, inert, sticky-cta, z-index, real-click-flow]
status: complete

requires:
  - phase: 05-multi-device-layout/05-05
    provides: syncCenterPanel() inert/aria-hidden sync, live breakpoints (lhIsSheetMode), push-layout desktop panels
  - phase: 05-multi-device-layout/05-03
    provides: tokens --app-h, --tabbar-h, --hit, --sp-*; layout-lib helpers
provides:
  - "index.html: three-tab bar (#mtab-search, #mtab-lyrics, #mtab-ai) with type=button and aria-pressed, a .sheet-handle button (aria-label 關閉面板) as first child of each side panel"
  - "js/panels.js: _lhSyncMobileTabs() (active + aria-pressed, 查韻 when no sheet is open), mobileTab('search') as the single close path, Escape listener limited to sheet mode"
  - "css/responsive.css: sheet geometry min(100%, 44rem) x min(78% app-h, 52rem) centred; lyrics sheet scroll rules; AI sheet pinned CTA (order + sticky), auto-fill word grid, long-text guards"
  - "css/panels.css: tab bar with safe-area height, label ellipsis, coarse-pointer backdrop without blur; desktop collapsed edge tabs nudged 1px so they sit fully in the viewport"
  - "tests/layout-lib.mjs: expectReallyClickable(page, locator, label)"
  - "tests/layout.spec.mjs: 22 new tests (7 task 1, 15 task 2) including the five-viewport real-click flow"
affects: [05-07, 05-08, 05-09, 05-11]

plan_head_before: cf712eec6f37dfe0f27f9ed8c5950e8afcb9b6e7
plan_head_after: 9957321d8fdf6ef4a036eec86117fb0d335cf8f1

actuals:
  tokens: 12000    # chars/4 over the realized diff in css/ js/ index.html tests/ (48148 chars)
  tasks: 2
  commits: 2       # MEASURED: git rev-list --count cf712ee..HEAD (before the docs commit)

tech-stack:
  added: []
  patterns:
    - "One close path for every sheet exit (handle, backdrop, 查韻 tab, Esc) = mobileTab('search'); tab highlight and aria-pressed come from one function"
    - "A CTA that must stay reachable under scrolling content is moved after the content with CSS order (DOM unchanged) and then made sticky; sticky alone only pins an element that starts below the fold"
    - "Tests prove reachability, not just existence: expectReallyClickable scrolls to the centre, requires the full box in the viewport and an elementFromPoint hit on the target"

key-files:
  created: []
  modified:
    - index.html
    - css/panels.css
    - css/responsive.css
    - js/panels.js
    - js/ui-common.js
    - tests/layout-lib.mjs
    - tests/layout.spec.mjs

key-decisions:
  - "Sheet height uses var(--app-h) (100dvh), so the 78% follows the visible height including the mobile browser bar"
  - "The tab bar top line is an inset box-shadow, not a border: with a 2px border the 48px tab buttons were pushed 2px below the viewport at 50% scale"
  - "查韻 is highlighted (active + aria-pressed) whenever no sheet is open, also after a breakpoint cross"
  - "Esc only closes sheets at <= 900; desktop push panels ignore it"

requirements-completed: []   # UI-01 is declared here but not marked complete until the last plan that declares it

duration: ~75 min
completed: 2026-10-04
---

# Phase 5 Plan 06: Bottom sheets - three tabs, handle, Esc, usable contents Summary

On phones and tablets the 查韻, 歌詞 and AI 建議 flows now sit behind one three-tab bar with four ways to close a sheet (handle, backdrop, 查韻 tab, Esc), hidden sheets are inert, and the sheets keep their contents usable with many lyric sections or many words: the lyrics area scrolls, the AI button stays pinned at the bottom, and long names wrap or truncate. A real-click full flow (search ㄢ, pick a card, type lyrics, generate, keep a word) passes at 390x844, 820x1180, 1440x900, 844x390 and 1180x820.

## What was done

**Task 1, commit `ead5dca`** (index.html, css/panels.css, css/responsive.css, js/panels.js, js/ui-common.js, tests)
- Tab bar is now 🔍 查韻 · 📝 歌詞 · ✨ AI 建議; every tab is `type="button"` with `aria-pressed`. Each side panel starts with a `.sheet-handle` button (`aria-label="關閉面板"`, 44px high, hidden at 901 and above) that replaced the old drag-bar pseudo-element.
- `mobileTab` keeps its toggle behaviour; `_lhSyncMobileTabs` sets `.active` and `aria-pressed` for the open sheet's tab, or 查韻 when none is open. `_lhApplyPanelTier` (05-05) now calls it too instead of clearing the highlights.
- One `keydown` listener closes an open sheet on Escape, only when `lhIsSheetMode()`.
- Sheet geometry: `width: min(100%, 44rem)`, `margin-inline: auto`, `height: min(calc(var(--app-h) * 0.78), 52rem)`; shown with `transform: none`. Body padding-bottom is tab-bar height + safe-area + 0.5rem. Tab bar height includes `env(safe-area-inset-bottom)`; labels truncate with an ellipsis; touch devices drop the backdrop blur. The hashtag popup was already at z-index 960, so the documented stack order needed no change.
- Tests (7): open/close paths on phone and tablet (4 close paths x 2 sheets, aria-pressed, one sheet at a time, handle name), desktop Esc does nothing and handles are hidden, inert + aria-hidden with a 70-press Tab walk in every state, sheet size/centring/22% for three viewports, computed z-index order, tab labels fit at 100% and 150%.

**Task 2, commit `9957321`** (css/panels.css, css/responsive.css, tests/layout-lib.mjs, tests/layout.spec.mjs)
- Lyrics sheet: area scrolls (`overflow-y: auto`, `overscroll-behavior: contain`), sections are `flex: 0 0 auto`, first section `flex: 1 0 12rem`, collapsed `flex: 0 0 var(--hit)`; text areas have `min-height: 7rem` (112px at 100%); section label ellipsis; context section 33% / collapsed `--hit`; hashtag chips wrap with `overflow-wrap: anywhere`.
- AI sheet: `#generateBtn` gets `order: 1; position: sticky; bottom: 0; min-height: 3rem` and a card-coloured 0.5rem ring so words scroll behind it; word grid `repeat(auto-fill, minmax(8.5rem, 1fr))`; model select ellipsis (max 10rem); progress text wraps; saved-pool header `min-height: var(--hit)`, `flex: 0 0 28%` / collapsed `--hit`; scroll area `scroll-padding-bottom: 4rem` so scrolling a card into view clears the pinned button.
- `expectReallyClickable` added to the layout lib.
- Tests (15): six sections scroll with every textarea at least 112px; key buttons inside sheet and viewport (phone, tablet); no horizontal scroll in the four scroll areas, 3 viewports x 50/100/150 (3 tests); generating state (disabled button, loader inside the scroll area, button pinned at scroll 0 / 0.5 / 1, long progress text); single word card under 60% of grid width and the saved badge hidden at 0 / shown at 1; long label, latin 40-char hashtag, 60-char model name; backstop: 503 message scrolls fully above the pinned button; real-click flow at five viewports (5 tests).

## Measured sheet geometry (100% scale)

| Viewport | Sheet width | Sheet height | Top visible |
|----------|-------------|--------------|-------------|
| 390x844 | 390 (full) | 658 (78% of 844) | 186 (22.0%) |
| 820x1180 | 704 (44rem, centred at x=58) | 832 (52rem cap; 78% would be 920) | 348 (29.5%) |
| 844x390 | 704 (centred) | 304 (78% of 390) | 86 (22.1%) |

At 844x390 the lyrics editing window is about 74px tall (see Notes and D-6 in the checklist).

## Verification

| Run | Result |
|-----|--------|
| 7 task-1 tests before implementation | 7 failed, 1 old test passed (red) |
| `layout + smoke` after task 1 | 42 passed |
| `npm test` after task 1 | 317 passed, 21 skipped, 1 failed (known cloud-only worker-config) |
| 15 task-2 tests, first run after writing | 9 failed (1 on missing lyrics scroll styles, 1 on the 1px desktop edge tab, 7 on a test-side missing `settle` import that hid the pinned-button and flow checks until fixed) |
| mutation check: `position: sticky` swapped for `static` | pinned-button test fails with the button 361px below the scroll area |
| `npm test` after task 2 | 332 passed, 21 skipped, 1 failed (known cloud-only worker-config) |

Acceptance greps task 1: `id="mtab-search"` 1; `class="sheet-handle"` 2; `Escape` in panels.js 1; `aria-pressed` in panels.js 2; the removed drag-bar selector in responsive.css 0. Task 2: `phoneLandscape` in the spec 3; `minmax(8.5rem, 1fr)` in exactly one CSS file; `position: sticky` in one CSS file; `ai-fill.spec.mjs` and `smoke.spec.mjs` green (inside the full run). Golden tests unchanged.

## Deviations from Plan

**1. [Rule 1 - Existing test encoded the old behaviour] Widening a phone keeps one tab lit**
- **Found during:** Task 1.
- **Issue:** `面板：開著底部面板時轉成寬螢幕…` expected zero `.mtab-btn.active` after the resize. The plan makes 查韻 active whenever no sheet is open.
- **Fix:** the test now expects exactly `mtab-search` active.
- **Commit:** ead5dca

**2. [Rule 1 - Bug] Tab bar border pushed the buttons out of the viewport**
- **Found during:** Task 1 full run (`縮放：50／100／150 都不吃邊`, phone and tablet).
- **Issue:** the tab bar is `--tabbar-h` (48px at 50%) with a 2px top border; the new 48px minimum button height then overflowed by 2px.
- **Fix:** the top line is an inset box-shadow, which takes no height.
- **Files modified:** css/panels.css
- **Commit:** ead5dca

**3. [Rule 1 - Bug] Collapsed desktop edge tabs sat 1px outside the viewport**
- **Found during:** Task 2, desktop matrix test via `expectReallyClickable`.
- **Issue:** the panel border takes 1px, so a collapsed panel's tab started at x=-1 (left) or ended at width+1 (right). The plan's flow truth needs every target fully inside the viewport.
- **Fix:** collapsed translate is nudged by 1px on both sides (css/panels.css, a 05-05 rule, outside this plan's `files_modified` for that rule but the file is listed).
- **Commit:** 9957321

**4. [Rule 3 - Blocking] `expectReallyClickable` centres the element before the hit test**
- **Found during:** Task 2, 844x390 flow.
- **Issue:** Playwright's `scrollIntoViewIfNeeded` treats a partly visible element as visible. The textarea is 168px tall in a 74px-high lyrics window, so its centre stayed under the context header.
- **Fix:** the helper also calls `scrollIntoView({ block: 'center' })`, which is what a user does by scrolling.
- **Commit:** 9957321

**5. [Plan wording] Test file imports**
- `settle` and `expectReallyClickable` were added to the spec's imports; `css/base.css` from `files_modified` needed no change (tokens already existed).

**6. [Plan wording] Task 2 test for "long hashtag" uses 40 latin characters**
- CJK text breaks anywhere and would never overflow, so the long-tag case uses unbroken latin letters (plus a CJK one in the overflow matrix).

**Total deviations:** 6 (4 auto-fixed bugs/blockers, 2 wording). **Impact:** none on the plan's truths.

## Notes for later plans

- `mobileTab('search')` is the only close path; later plans (05-07 keyboard / 05-08 touch targets) can rely on `_lhSyncMobileTabs()` for tab state.
- The 44px handle button and 48px tab buttons already satisfy the touch-target size; the context-section `+` and `↻` buttons (1.375rem round) are still small and belong to the touch-target plan.
- At 844x390 the lyrics window is small (about 74px). Left as specified by UI-SPEC section 6 (78%); recorded as D-6 for Andy.
- No cache-busting `?v=` bump here; 05-11 owns the phase's single bump.
- `.generate-btn` order and sticky exist only inside `@media (max-width: 900px)`; desktop DOM order and look are unchanged.

## Known Stubs

None.

## Threat Flags

None. T-05-13 mitigated: collapsed sheets carry `inert` and `aria-hidden` (05-05 sync) and a 70-press Tab walk in every state asserts focus never enters them while an open sheet stays reachable. T-05-14 mitigated: four close paths tested at 390x844 and 820x1180. T-05-SC: no package installs, package.json untouched.

## Self-Check: PASSED

- Files found: index.html, css/panels.css, css/responsive.css, js/panels.js, js/ui-common.js, tests/layout-lib.mjs, tests/layout.spec.mjs.
- Commits found: ead5dca, 9957321.
