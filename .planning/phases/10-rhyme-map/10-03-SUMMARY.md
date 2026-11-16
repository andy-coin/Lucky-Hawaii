---
phase: 10-rhyme-map
plan: 03
subsystem: ui
tags: [rhyme-map, mirror-layer, ime, alignment, theme, contrast, playwright]
status: complete

requires:
  - phase: 10-rhyme-map
    provides: "10-01: js/rhyme-map.js mirror painting, palette writer, rm-stale CSS rule, _lhMapCache, ResizeObserver; 10-02: lexicon-change hook"
provides:
  - "rm-stale rule in js/rhyme-map.js: bands stay while typing at a line end (incl. 注音 pre-edit), hide on line-count change or mid-line edit"
  - "Theme MutationObserver on <html data-theme> that rewrites --rm-c0..16"
  - "Specs: 組字／快取／鏡像對齊／樣式一致／對比／上色 in tests/rhyme-map-ui.spec.mjs, 效能 in tests/rhyme-map-perf.spec.mjs, 對比 in tests/rhyme-core.spec.mjs"
affects: [10-04 settings, 10-08 UAT list]

actuals:
  tokens: 22000
  tasks: 3
  commits: 3
plan_head_before: 343f8725842fd21b042c8353a6d87399d292310a
plan_head_after: 62920f470be5bdc4f68159071abec24620383a0e

tech-stack:
  added: []
  patterns:
    - "Staleness decided by diffing the model text between two input events (common prefix / suffix), not by the caret"
    - "Alignment verified by two-screenshot byte comparison with a negative control; scrollbar tests launch their own Chromium without --hide-scrollbars"

key-files:
  created:
    - tests/rhyme-map-perf.spec.mjs
  modified:
    - js/rhyme-map.js
    - tests/rhyme-map-ui.spec.mjs
    - tests/rhyme-core.spec.mjs

key-decisions:
  - "Staleness compares the model text before / after each input event (changed range + character after it), not selectionStart"
  - "Scrollbar-compensation tests use chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] }) plus an injected ::-webkit-scrollbar rule; the injection alone gives a 0 px bar in Playwright"
  - "Contrast pairs: default light with the light set, default dark with the dark set, the four custom extremes with both sets (UI-SPEC 2.2)"

requirements-completed: []

coverage:
  - id: D1
    description: "Nothing inside any .rhyme-mirror changes and lhRhymeAnalyze is not called between compositionstart and compositionend; one repaint follows the commit"
    requirement: MAP-12
    verification:
      - kind: e2e
        ref: "tests/rhyme-map-ui.spec.mjs#組字：組字中鏡像零變動，確認後才重畫; tests/songs-ime.spec.mjs and sections-ui.spec.mjs still green"
        status: pass
    human_judgment: true
    rationale: "CDP-simulated composition only; real iPad / iPhone / Android IME is Andy's UAT"
  - id: D2
    description: "Bands never sit on the wrong character: hidden by rm-stale on line-count change or mid-line edit, restored by the repaint"
    requirement: MAP-12
    verification:
      - kind: e2e
        ref: "tests/rhyme-map-ui.spec.mjs#組字：句尾打字時色塊留著，換行或句中修改時先藏起來"
        status: pass
    human_judgment: false
  - id: D3
    description: "Only the typed section repaints; unchanged text keeps its span nodes; 150-line + 50-line song at 4x CPU throttle has no long task"
    requirement: MAP-12
    verification:
      - kind: e2e
        ref: "tests/rhyme-map-ui.spec.mjs#快取：*; tests/rhyme-map-perf.spec.mjs#效能：*"
        status: pass
    human_judgment: false
  - id: D4
    description: "Mirror text is pixel-identical to textarea text at scroll top / middle / bottom with a 15 px scrollbar; computed styles and boxes match on phone / tablet / desktop at 100 and 150 percent; bands stay on the tail char for long wrapped lines, resize, zoom, collapse"
    requirement: MAP-02
    verification:
      - kind: e2e
        ref: "tests/rhyme-map-ui.spec.mjs#鏡像對齊：*, #樣式一致：*"
        status: pass
    human_judgment: true
    rationale: "Real-device zoom / pinch and iOS font rendering are Andy's UAT"
  - id: D5
    description: "Palette follows data-theme without reload; every text / band contrast >= 4.5 and underline >= 3; custom colors show bands; missing dictionary gives no band and no error"
    requirement: MAP-02
    verification:
      - kind: unit
        ref: "tests/rhyme-core.spec.mjs#對比：色票格式與文字對比, #對比：句中底線"
        status: pass
      - kind: e2e
        ref: "tests/rhyme-map-ui.spec.mjs#對比：日夜主題切換不必重新整理, #上色：客製顏色也有色塊, #上色：字典載不到時不上色也不報錯"
        status: pass
    human_judgment: true
    rationale: "Whether the 17 colors look good is UAT; numbers are enforced"
---

# Phase 10 Plan 03: Alignment, Composition and Theme Hardening Summary

韻腳色塊在 注音 組字時完全不動、行尾打字留著而換行／句中改字先藏起來，並在每種裝置、縮放、捲動與日夜主題下對準句尾字；一百五十行連續打字在 4 倍降速下沒有任何長任務。

## Performance

- **Tasks:** 3 (1 tracer, 2 auto); **commits:** 3
- **Files:** 1 created, 3 modified (`js/rhyme-map.js` +~40 lines, tests)

## Accomplishments

- **Staleness rule (`322949e`).** One `input` listener on `#lyricsSections` (after lyrics.js) compares the model text of the previous input event with the new one. If the change touches a newline or is followed by more text on the same line, the section's mirror gets `rm-stale` (class toggle only, no node change, no layout read). `lhMapPaint` (already) clears it on repaint and on a cache hit.
- **Alignment (`a799359`).** No production change needed: 10-01's shared selector list + textarea offset box + scrollbar padding already produces byte-identical screenshots at scroll top / middle / bottom with a real 15 px scrollbar. Negative controls prove the tests bite (pixel test: removing the padding compensation differs; mutation run of the long-line test with the compensation removed failed at 50 percent with a scrollbar).
- **Theme (`62920f4`).** `MutationObserver` on `<html data-theme>` rewrites `--rm-c0..16`; bands read the variables so no repaint is needed.

## Numbers

| Check | Result |
|-------|--------|
| 150-line + 50-line song, 40 keys with 3 Enters, 4x CPU throttle, longest long task | 0 ms (0 long tasks; limit 50 ms x LH_PERF_SCALE=1) |
| `lhRhymeAnalyze` 200 lines, median of 5 in page | 0.4 - 0.6 ms (limit 20 ms) |
| 10 keys at 30 ms in one of two sections | repaint ids all that section; analyze calls 1 - 3 |
| Contrast, text over 34 / 17 percent band | light worst 6.97, dark worst 4.52 (tightest, ids 3 and 1), extremes 5.39 - 12.71 |
| Underline vs card | light 3.51, dark 3.09 |
| `npm test` | 888 passed, 28 skipped, 0 failed (10-02 baseline 869 / 27) |

## Palette changes

None. Every entry already passes; old -> new: n/a.

## CSS properties added to the shared selector list

None.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Staleness by caret was wrong during composition**
- **Found during:** Task 1
- **Issue:** Plan said to test the character at `selectionStart`. During (CDP, and likely real) composition the caret sits inside the pre-edit text (`selectionStart` 29 of 30), so a line-end 注音 edit looked like a mid-line edit and hid the bands, contradicting the truth "bands stay visible while typing at a line end incl. pre-edit".
- **Fix:** Decide from the model-text diff between two input events (changed range contains `\n`, or a non-newline character follows it); unit-checked on 10 cases.
- **Files modified:** `js/rhyme-map.js`
- **Commit:** `322949e`

**2. [Rule 3 - Blocking] Scrollbar injection alone gives no scrollbar in Playwright**
- **Issue:** RESEARCH suggested injecting `::-webkit-scrollbar { width: 15px }`; with the default `--hide-scrollbars` the textarea still measured offsetWidth - clientWidth = 0.
- **Fix:** The pixel and long-line specs launch their own Chromium with `ignoreDefaultArgs: ['--hide-scrollbars']` and inject the rule (15 px) or `display: none` (0 px) per case, asserting the measured bar width.
- **Commit:** `a799359`

**3. [Rule 1 - Test flake] Composition spec flaky under load**
- **Issue:** If the textarea had not yet scrolled to the caret, the composition itself scrolled it; the scroll listener (by design, 10-01) then adds `rm-stale`, failing the "no rm-stale" check intermittently (once in a full run).
- **Fix:** The spec scrolls the textarea to the bottom and waits before composing; 20 repeat runs pass.
- **Commit:** `62920f4`

### Not implemented / left as written

- 「上色：詞庫晚到時…」: not duplicated; 10-01's 「上色：字典與詞庫載好前不上色」 already holds the wordlist route (plan: keep one copy).
- Known ceiling of D-06 (accepted): deleting the band's own tail character at a line end leaves the old band over empty space until the repaint 200 ms later.

## Known Stubs

None.

## Threat Flags

None. Palette writer still only passes `^#[0-9a-f]{6}$` constants (now also unit-checked, 17 per set); no new network, storage or HTML paths; `package.json` / `package-lock.json` unchanged.

## Items for Andy (not done unattended)

- Real IME composition on iPad, iPhone, Android (only CDP simulation here); confirm bands do not flicker and hide only on mid-line edits.
- Visual look of colors in light / dark / custom themes on real devices (UAT A7).
- No `?v=` cache-busting bump was made for the changed `js/rhyme-map.js`; bump at release time.
- No screenshot baselines changed; `-linux` untouched.
- The timed perf spec was only run on this machine (0 ms); `LH_PERF_SCALE` is untested on a slower machine.

## Next Phase Readiness

Ready for 10-04 (settings persistence / toggles). MAP-02 and MAP-12 are shared with later plans and not marked complete.

## Self-Check: PASSED

- Files exist: `tests/rhyme-map-perf.spec.mjs`, `js/rhyme-map.js`, `tests/rhyme-map-ui.spec.mjs`, `tests/rhyme-core.spec.mjs`.
- Commits `322949e`, `a799359`, `62920f4` in `git log`; `rev-list` count since ledger base is 3.
- Full `npm test` (888 passed, 0 failed), `LH_PERF=1` perf spec (2 passed), 「沒有新增動畫」 passed.
