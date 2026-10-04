---
phase: 05-multi-device-layout
verified: 2026-10-04T16:00:00Z
status: human_needed
score: 5/5 must-haves verified
covered_files:
  - .planning/phases/05-multi-device-layout/05-01-PLAN.md
  - .planning/phases/05-multi-device-layout/05-01-SUMMARY.md
  - .planning/phases/05-multi-device-layout/05-02-PLAN.md
  - .planning/phases/05-multi-device-layout/05-02-SUMMARY.md
  - .planning/phases/05-multi-device-layout/05-03-PLAN.md
  - .planning/phases/05-multi-device-layout/05-03-SUMMARY.md
  - .planning/phases/05-multi-device-layout/05-04-PLAN.md
  - .planning/phases/05-multi-device-layout/05-04-SUMMARY.md
  - .planning/phases/05-multi-device-layout/05-05-PLAN.md
  - .planning/phases/05-multi-device-layout/05-05-SUMMARY.md
  - .planning/phases/05-multi-device-layout/05-06-PLAN.md
  - .planning/phases/05-multi-device-layout/05-06-SUMMARY.md
  - .planning/phases/05-multi-device-layout/05-07-PLAN.md
  - .planning/phases/05-multi-device-layout/05-07-SUMMARY.md
  - .planning/phases/05-multi-device-layout/05-08-PLAN.md
  - .planning/phases/05-multi-device-layout/05-08-SUMMARY.md
  - .planning/phases/05-multi-device-layout/05-09-PLAN.md
  - .planning/phases/05-multi-device-layout/05-09-SUMMARY.md
  - .planning/phases/05-multi-device-layout/05-10-PLAN.md
  - .planning/phases/05-multi-device-layout/05-10-SUMMARY.md
  - .planning/phases/05-multi-device-layout/05-11-PLAN.md
  - .planning/phases/05-multi-device-layout/05-11-SUMMARY.md
  - css/base.css
  - css/panels.css
  - css/responsive.css
  - index.html
  - js/cards.js
  - js/init.js
  - js/layout.js
  - js/lyrics.js
  - js/panels.js
  - js/report.js
  - js/results.js
  - js/safety.js
  - js/search-ui.js
  - js/state.js
  - js/theme.js
  - js/ui-common.js
  - tests/layout.spec.mjs
  - tests/perf.spec.mjs
  - tests/render.spec.mjs
  - tests/style.spec.mjs
  - tests/visual.spec.mjs
covered_digest: "v2:sha256:22cac7a908ee2192136829c9b58596f4fc0adb11bdcfa3bb5ecfc943271f0be5"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "iPhone Safari and Android Chrome: tap search box, lyrics box and feedback dialog with the on-screen keyboard open (TEST-CHECKLIST 05-11-1, 05-11-6; steps 05-07-1, 05-07-2, 05-07-3, 05-07-4, 05-07-6)"
    expected: "The caret/line being typed always stays above the keyboard; panel fills from top to keyboard edge; bottom tab bar returns when keyboard closes"
    why_human: "Chromium cannot reproduce iOS's 'only visualViewport shrinks' behaviour or a real soft keyboard; the automated tests emulate it by resizing the window (innerHeight and visualViewport shrink together)"
  - test: "iPhone and Android: tap every kind of input, then pinch-zoom (TEST-CHECKLIST 05-11-2, 05-11-3; steps 05-07-5)"
    expected: "No auto-zoom on focus; two-finger zoom is still allowed"
    why_human: "Automated check only proves font-size >= 16px and a viewport meta without maximum-scale/user-scalable; actual iOS auto-zoom behaviour needs a real device"
  - test: "Phone: +/- zoom through 50% to 150%, tap the percentage to reset (TEST-CHECKLIST 05-11-4; steps 05-06-9, 05-08-9)"
    expected: "Each tap responds smoothly, tapping the % returns to 100%, nothing is clipped at 150%"
    why_human: "Zoom 'feel' (smoothness, responsiveness) is a declared Human check in ROADMAP"
  - test: "Phone/tablet bottom tabs and sheet handle; desktop push-aside panels (TEST-CHECKLIST 05-11-5, 05-11-7; steps 05-06-1..3, 05-05-1, 05-05-2)"
    expected: "Tabs and handle feel natural; main area pushed narrower on desktop is acceptable"
    why_human: "Ergonomic and aesthetic judgement"
  - test: "Overall look in light, dark and custom colours on phone, tablet, desktop vs baseline-before screenshots (TEST-CHECKLIST 05-11-8, D-14)"
    expected: "Overall nicer and consistent; decide whether header gradient and tab bar staying purple/orange under custom colours is acceptable"
    why_human: "Aesthetic judgement is a declared Human check in ROADMAP"
  - test: "Phone: large result set (ㄅ ㄆ ㄇ, hide-rare off) while scrolling as cards stream in (TEST-CHECKLIST 05-11-9, 05-10-1..6; optionally D-10 strict perf on Mac: LH_PERF_SCALE=1 npm run perf)"
    expected: "No freeze; selection survives; scroll position kept on same-query redraw"
    why_human: "Real device CPU feel; cloud perf thresholds were scaled by 7.35x measured speedFactor"
  - test: "Phone/tablet AI panel generate button stays fully visible; 150% long zhuyin fits; single-card groups not stretched (TEST-CHECKLIST 05-11-10, 05-11-11)"
    expected: "Pinned button fully visible; no overflow of reading text; single-card group stays normal width"
    why_human: "Visual confirmation on a real device"
  - test: "Landscape short phone (iPhone SE class): search ㄢ then scroll the main container (TEST-CHECKLIST 05-RF-3, 05-RF-9)"
    expected: "Toolbar and batch buttons reachable; after one scroll results fill the screen with at least one full card row"
    why_human: "Layout judgement call logged by the fixer (no auto-scroll to results after search)"
  - test: "Mac: run npm run visual:update once to create -darwin screenshot baselines, inspect, commit (TEST-CHECKLIST D-11)"
    expected: "Baselines created; npm test green on Mac"
    why_human: "Baselines are per platform; only -linux.png set exists. Not a product gap"
---

# Phase 5: Multi-Device Layout Verification Report

**Phase Goal:** 電腦、平板、手機都能完整查韻、寫詞、用 AI 建議；縮放正確不吃邊、大量字卡不卡頓、手機輸入不被鍵盤擋。
**Verified:** 2026-10-04
**Status:** human_needed
**Re-verification:** No, initial verification

All five ROADMAP success criteria are backed by real code and passing automated tests that this verifier ran itself. The only things left are the Human checks that the roadmap declares (real iPhone/Android keyboard, zoom feel, aesthetics), which cannot be done in the cloud container.

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Default 100% has no offset; at max zoom content near edges is still fully visible, not clipped | VERIFIED | `js/layout.js` implements zoom as root font-size via `--ui-scale` (clamped 50-150, step 5, persisted `lh:uiScale`). `grep zoom` over css/js shows no CSS `zoom` declaration or style write (only names like `.zoom-cluster`, `MzoomIn`). Tests passed: "縮放：程式碼與樣式表沒有任何 zoom"; "縮放：50／100／150 都不吃邊" for phone, tablet and desktop, idle and after search (every header, search and tab-bar control fully in viewport, no page scroll, no element with computed zoom != 1); "縮放：手機 150% 工具列不重疊…"; "縮放：尺寸一律用 rem"; screenshots in `tests/visual.spec.mjs` incl. phone 150%. Safe-area insets and `dvh` present in `css/base.css`. |
| 2 | First search and large card sets render in batches; with CPU throttling the page does not freeze (long-task measurement) | VERIFIED | `js/results.js` `_startRender`: FIRST_BATCH 48 synchronous, then SLICE 64 per rAF, `safeSlice`, epoch cancel, background-tab flush, scroll preservation. 11 render tests pass (states first/more/done, 48/49 boundary, stale-search no mixing, selection kept while loading, throw-mid-render recovers). `npm run perf` run here: 5 passed. 6x throttle, largest query: max long task 255ms (baseline pre-change 2889ms, 11.5x faster); 4x: 151ms. Thresholds are scaled by a measured 7.35x speedFactor (cloud CPU), so absolute limits are lenient here; the relative "at least 3x faster" check is machine-independent and passed. Real-device feel is in human items. |
| 3 | On phone, tablet and desktop, rhyme lookup, lyric writing and AI suggestions are fully operable, with nothing covered or untappable | VERIFIED | Test "流程：五種視窗用真的點擊走完查韻→選字→歌詞→AI 建議→保留" ran for all 5 viewports (390x844, 820x1180, 1440x900, 844x390, 1180x820) with real pointer/touch events; every target must be fully in viewport and not covered (`expectReallyClickable`), ends with the word saved and no page errors. Also passed: touch targets >= 44px on 7 screens, adjacent hit areas overlap <= 4px, pinned AI button not covered by cards, 6 lyric sections scroll, menus stay on-screen at 150%, bottom-sheet size/inert/Esc tests, landscape-phone tests (4 viewports down to 568x320: results area >= one card row after scrolling the container, controls clickable). |
| 4 | Tapping an input on phone does not trigger auto-zoom; the on-screen keyboard does not cover the typing position | VERIFIED (automated part); real-device part routed to human | `css/responsive.css` `@media (max-width: 900px), (pointer: coarse)` sets all text fields to `max(16px, 1rem)`. Viewport meta is `width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content` with no `maximum-scale` or `user-scalable` (test asserts exact string). `js/layout.js` `_lhKbUpdate` writes `--app-h/--vv-top/--kb-inset`, `kb-open/kb-short` classes from `visualViewport`, with 150px threshold, pinch-zoom and desktop-resize guards. Tests passed: input font >= 16px (3 zoom levels x 6 states), 16px boundary, 149 vs 150 keyboard threshold, zoomed != keyboard, desktop shrink != keyboard, no focus != keyboard, lyrics/search/feedback typing stays visible with emulated keyboard, 5000-char paste wraps. Keyboard is emulated by shrinking the Chromium window; real iOS/Android behaviour is in human_verification. |
| 5 | Light/dark mode and custom colours work under the new layout with a consistent look (screenshot comparison) | VERIFIED (automated part); aesthetics routed to human | `tests/visual.spec.mjs` has 16 committed `-linux.png` baselines (3 devices x light/dark results, lyrics panel, AI panel, custom colours, plus phone-150% and single-card-group shots); all "截圖：" tests passed in the full run. `tests/style.spec.mjs` passed: only 400/700 font weights, min font 0.75rem, light/dark text contrast >= 4.5, theme priority, hover only for mouse, visible Tab focus ring, no new colour constants, reduced-motion. "Overall beautiful" is a human judgement; macOS baselines do not exist yet (D-11). |

**Score:** 5/5 truths verified (0 present-but-behavior-unverified; real-device items listed separately as the declared Human check)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `js/layout.js` | `--ui-scale`, breakpoints, keyboard model, menu placement | VERIFIED | 170 lines, substantive; loaded in `<head>` after `js/safety.js`; used by `search-ui.js` (`zoomIn/zoomOut`), `panels.js`, menus |
| `js/results.js` | Batched progressive render | VERIFIED | Real implementation, called from `displayResults`; `createCharCard` only called from `_startRender` |
| `css/base.css`, `css/panels.css`, `css/responsive.css` | rem sizing, dvh, safe-area, bottom sheet, input floor, touch targets | VERIFIED | All present and exercised by the layout and style tests |
| `js/panels.js` | Bottom tabs, handle, Esc, desktop push-aside | VERIFIED | Tests for transitions, Esc during IME and with a dialog open, inert collapsed panels |
| `tests/layout.spec.mjs`, `render.spec.mjs`, `perf.spec.mjs`, `visual.spec.mjs`, `style.spec.mjs` | Automated gates | VERIFIED | Run and passing (see below) |
| `tests/visual.spec.mjs-snapshots/*-linux.png` | 16 baselines | VERIFIED | 16 files present |
| `baseline-before/` | Pre-change evidence | VERIFIED | Screenshots and parity JSON present |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| zoom buttons in `index.html` | `setUiScale` / `--ui-scale` on `<html>` | `onclick="zoomIn()"/"setUiScale(100)"` to `js/layout.js` to root font-size | WIRED (tested end to end: 105% gives root font 16.8px, stored `lh:uiScale`) |
| `visualViewport` resize and focusin | `kb-open` class, `--app-h/--vv-top/--kb-inset` | `_lhKbSchedule` to `_lhKbUpdate` to panel CSS in `css/responsive.css` | WIRED (tests with emulated keyboard) |
| search input to `displayResults` to `_startRender` | batched DOM + `data-render` state | `lh:render-done` event | WIRED |
| bottom tab bar to panels | toggles one sheet at a time | `js/panels.js` | WIRED (flow test, all 5 viewports) |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| Result grid | `.char-card` list | rhyme search to `createCharCard` over real dictionary; golden specs byte-compare final DOM with pre-change output | Yes | FLOWING |
| AI panel cards | `.ai-word-card` | mocked AI reply in test, real client in app | Yes | FLOWING |

### Behavioral Spot-Checks (run by this verifier)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Whole automated suite | `npm test` | 400 passed, 27 skipped, 1 failed. The failure is `tests/worker-config.spec.mjs:53` (wrangler prints WARNING through the cloud proxy), the known environment-only failure | PASS |
| Perf under CPU throttle | `npm run perf` | 5 passed, 1 skipped (record mode only); max long task 255ms at 6x vs 2889ms baseline (11.5x) | PASS |
| No CSS zoom in source | grep css/js/index.html | Only identifier names matched; test "沒有任何 zoom" passes | PASS |
| Working tree after test runs | `git status --short` | Clean | PASS |

### Probe Execution

SKIPPED: no `scripts/*/tests/probe-*.sh` declared by this phase.

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|--------------|-------------|--------|----------|
| PERF-01 | 05-01, 05-02, 05-03, 05-11 | Zoom bug fixed: default 100% correct, edge content not eaten (root font-size scaling instead of CSS zoom) | SATISFIED | Truth 1; REQUIREMENTS.md marks Complete |
| PERF-02 | 05-10 | First search and large card sets do not freeze; batched render | SATISFIED | Truth 2 (perf and render tests) |
| UI-01 | 05-03, 05-04, 05-05, 05-06, 05-08 | Desktop, tablet and phone layouts fully usable | SATISFIED | Truth 3 |
| UI-02 | 05-04, 05-09, 05-11 | Visually consistent; light/dark and custom colours preserved | SATISFIED (automated); aesthetics human | Truth 5 |
| UI-03 | 05-07 | Mobile input not covered by keyboard, no auto-zoom | SATISFIED (automated); real device human | Truth 4 |

All five phase requirement IDs appear in at least one PLAN `requirements:` field and in REQUIREMENTS.md mapped to Phase 5. No orphaned requirements (PERF-03 maps to Phase 4, PERF-04 to Phase 1).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| css/js/index.html | n/a | TBD/FIXME/XXX debt markers | none found | OK |
| `js/results.js` | ~68-77, 92-100 | A render truncated by an exception still announces 「已顯示全部 N 字」 (review IN-01) | Info | Only on a defensive error path with no known trigger |
| `js/results.js` | ~160-170 | Re-running an identical query keeps old scroll position (review IN-03) | Info | Minor UX |
| `js/init.js`, `search-ui.js`, `theme.js`, `ui-common.js` | various | `MediaQueryList.addEventListener` throws on Safari < 14 (review IN-02) | Info | Project already requires modern engines (`inert`, `:has()`, `dvh`) |
| `package.json` | 6-7 | POSIX-only env assignment in perf scripts (IN-04) | Info | Dev container is Linux |

No blockers or warnings. The review's final open warning (landscape results sliver) was fixed in commit 898ba3a, and I confirmed the four regression tests for it pass.

### Deviations and Notes (not gaps)

- **Perf thresholds are machine-scaled.** The absolute limits (150/300/400/250ms) are multiplied by 7.35 on this cloud CPU, so the absolute checks are lenient. The scale-independent 11.5x improvement versus the pre-change baseline is the stronger evidence. TEST-CHECKLIST D-10 asks Andy to run `LH_PERF_SCALE=1 npm run perf` on the Mac for the strict version.
- **Screenshot baselines exist only for Linux** (D-11). On the Mac, the 19 "截圖：" tests fail until `npm run visual:update` creates the -darwin set. Environment, not product.
- **Landscape short phones** require one scroll of the main container to see a full results row (judgement calls 05-RF-9, 05-RF-10); this is tested and logged, but a human should confirm it feels acceptable.
- **Custom-colour theme**: header gradient and tab bar keep the purple/orange palette (D-14). This is a decision for Andy, not a defect.

### Human Verification Required

Declared ROADMAP Human check: iPhone/Android real-device keyboard occlusion and zoom feel; overall aesthetics. The step-by-step prose lives in `/home/user/Lucky-Hawaii/.planning/TEST-CHECKLIST.md`; IDs are listed in the frontmatter `human_verification` block and are not duplicated here. Core set: 05-11-1 to 05-11-11, plus 05-RF-1 to 05-RF-4 and 05-RF-9, and the owner decisions D-10, D-11, D-14.

### Gaps Summary

No gaps. Every automated must-have is satisfied by real, wired code and passing tests that were executed in this verification. Status is `human_needed` solely because the phase's declared real-device and aesthetic checks cannot be performed here.

---

_Verified: 2026-10-04_
_Verifier: Claude (gsd-verifier)_
