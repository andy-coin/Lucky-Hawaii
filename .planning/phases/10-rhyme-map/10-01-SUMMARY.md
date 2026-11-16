---
phase: 10-rhyme-map
plan: 01
subsystem: ui
tags: [rhyme-map, mirror-layer, textarea, vanilla-js, playwright, node-vm]
status: complete

requires:
  - phase: 09-sections
    provides: lhSecCountOne / lhSecCountAll hooks, section DOM, _lhComposing gate, LH_WD_BIG
provides:
  - "js/rhyme-core.js: pure rhyme-map functions (lhRhymeMatch / Key / Color / Target / Reading / Analyze, constants)"
  - "js/rhyme-map.js: div.rhyme-mirror painting, 200 ms scheduling, readiness gate, window.__lhMapReady"
  - "Per-section div.rhyme-mirror (lyrics.js), 17-color CSS variables and .rm-hl bands, ?v=0.96.14"
  - "tests/rhyme-core.spec.mjs (Node) and tests/rhyme-map-ui.spec.mjs (browser)"
affects: [10-02 lookup parity, 10-03 alignment/perf, 10-04 settings, 10-05 menu, 10-06 readings, 10-07 letters, 10-08 selection bar]

actuals:
  tokens: 8749
  tasks: 2
  commits: 2
plan_head_before: 4ceb60e9b61dec583b806d6f856f26cc12c4d19b
plan_head_after: d9c816c306043b4de1706125abe7a11660e4062a

tech-stack:
  added: []
  patterns:
    - "Decorative mirror div behind a transparent textarea; the textarea is never touched by painting"
    - "Pure analysis file (Node-loadable) plus DOM file; two typeof-guarded hooks in sections.js"
    - "Palette as JS constants written to --rm-c0..16 custom properties; CSS has no hex"

key-files:
  created:
    - js/rhyme-core.js
    - js/rhyme-map.js
    - tests/rhyme-core.spec.mjs
    - tests/rhyme-map-ui.spec.mjs
  modified:
    - js/lyrics.js
    - js/sections.js
    - css/panels.css
    - css/responsive.css
    - index.html
    - tests/split-tags.spec.mjs
    - tests/helpers.mjs
    - tests/songs-ime.spec.mjs
    - tests/sections-ui.spec.mjs
    - tests/node-core.mjs
    - tests/sections-audit.spec.mjs

key-decisions:
  - "Final names table from the plan confirmed unchanged (lhRhyme* in rhyme-core.js, lhMap* in rhyme-map.js, .rhyme-mirror / .rm-hl / .rm-solo, --rm-c0..16)"
  - "All-particles line uses the LAST character (RESEARCH prototype returned the first); particles walk-back also skips punctuation between particles"
  - "Mirror geometry comes from the textarea's own offset box plus computed right padding and scrollbar width, not inset 0"
  - "Painting during composition is limited to class toggles (rm-stale); no mirror child is added or removed"

requirements-completed: []

coverage:
  - id: D1
    description: "Each line's tail character is banded in its rhyme family color (same family same data-f), live, in a mirror under each section textarea"
    requirement: MAP-02
    verification:
      - kind: e2e
        ref: "tests/rhyme-map-ui.spec.mjs#上色：句尾字依韻部上色"
        status: pass
    human_judgment: true
    rationale: "Look and legibility of the 17 colors on real devices is Andy's UAT (A7); mechanics are tested"
  - id: D2
    description: "Pure rhyme primitive and tail/reading/letter rules locked by Node tests on the real dictionary (VALIDATION fixtures F-AABB .. F-KONG, both modes)"
    requirement: MAP-01
    verification:
      - kind: unit
        ref: "tests/rhyme-core.spec.mjs (17 tests, 字母／句尾／讀音／判定／效能)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Only the edited section repaints after 200 ms; nothing is analysed or mutated during composition; nothing painted before dictionary, wordlist and songs settle"
    requirement: MAP-12
    verification:
      - kind: e2e
        ref: "tests/rhyme-map-ui.spec.mjs#上色：打字後只重畫那一段, #上色：字典與詞庫載好前不上色; tests/songs-ime.spec.mjs and sections-ui.spec.mjs composition specs still green"
        status: pass
    human_judgment: true
    rationale: "Real IME composition on iPad/iPhone/Android and a dedicated composition-mutation spec arrive in 10-03; here only the existing CDP composition specs cover it"
---

# Phase 10 Plan 01: Rhyme Map Tracer Summary

句尾字依韻部上色的整條線一次接通：純判定函式（Node 可測）、每段輸入框後面的透明鏡像層、兩個掛鉤、就緒閘門、版號與測試工具，輸入框與注音組字完全不被碰。

## Performance

- **Duration:** about 12 min (2026-10-23 13:36 to 13:47 local, executed unattended)
- **Tasks:** 2 (1 tracer, 1 TDD-style auto)
- **Files:** 4 created, 11 modified (15 files, +711 / -48)
- **Commits:** 2 task commits (`83c983c` feat, `d9c816c` test)

## Accomplishments

- **Tracer (Task 1, `83c983c`).** `js/rhyme-core.js` holds the shared primitive (`lhRhymeMatch`, `lhRhymeKey`, `lhRhymeColor`), tail extraction, reading order and letter assignment. `js/rhyme-map.js` paints one `DocumentFragment` per section into `div.rhyme-mirror`, aligned from the textarea's own box (offset rect, computed right padding plus scrollbar width, scrollTop), scheduled 200 ms after the last keystroke (1 s ceiling), gated on `_lhComposing`, and enabled only after `Promise.allSettled([__hoyunReady, __hoyunWordlistReady, __hoyunSongsReady])` (`window.__lhMapReady`). Hooks are the last line of `lhSecCountOne` and `lhSecCountAll`.
- **Rules locked (Task 2, `d9c816c`).** 17 Node vm tests with the real dictionary and real polyphonic order: every VALIDATION fixture (F-AABB, F-ABAB, F-FAM1/2, F-PART, F-POLY, F-KONG) in both modes, particles, tail extraction, reading priority, zero / one / many, CR/LF normalisation, more than 26 rhymes, and a 200-line performance bound.
- **Visual check.** A throwaway screenshot of a six-line section showed bands aligned to the tail characters; the bands render and the text is not doubled (the desktop textarea's 72 px height clipping the third line is the known Phase 9 behavior).

## Final names table

Confirmed exactly as in the plan; no name was changed. `LH_RHYME_COLORS` index 16 (neutral grey for no-family tails) is the planner addition to UI-SPEC D-04, already listed for UAT.

## Test numbers

| Run | Result |
|-----|--------|
| `tests/rhyme-map-ui.spec.mjs` | 5 passed |
| `tests/rhyme-core.spec.mjs` | 17 passed (7 titled 「字母：」) |
| Task 1 verify set (rhyme-map-ui, split-tags, songs-ime, sections-ui, songs-crosstab, smoke) | 77 passed |
| Task 2 verify set (rhyme-core, core-node, golden, sections-audit, scan) | 84 passed |
| `npm test` (full) | 869 passed, 27 skipped, 0 failed (Phase 9 baseline 843 / 27 / 0) |

Acceptance criteria: `?v=0.96.14` count 36, `?v=0.96.13` count 0; rhyme-core after polyphonic and rhyme-map after word-drag; each hook count 1; `rhyme-mirror` greps 1 / 1 / at least 1; `__lhMapReady` in helpers 2; `字母：` 7; node-core 1; sections-audit 1. Plan-level: `package.json` / `package-lock.json` unchanged, no `-linux.png` touched.

## Specs touched and why

- `tests/songs-ime.spec.mjs` `watchLeftPanel` and `tests/sections-ui.spec.mjs` `watchLeft`: the childList filter now ignores records whose target is inside `.rhyme-mirror`. The mirror is a decorative copy that repaints after typing; both specs still watch the textarea and the rest of the panel, and every other assertion is unchanged.
- `tests/helpers.mjs`: `bootPage` (only when it waits for the wordlist) and `openTwoTabs` also wait for `window.__lhMapReady`, so the first paint is over before specs count mutations.
- `tests/split-tags.spec.mjs`: `JS_ORDER` now 28 files (same commit as `index.html`).
- `tests/node-core.mjs`: `CORE` loads `js/rhyme-core.js` after polyphonic (10-02 makes candidates / wordlist call `lhRhymeMatch`).
- `tests/sections-audit.spec.mjs`: the 「新程式沒有拼 HTML」 scan covers the two new files.
- No screenshot baseline changed: the lyrics area is visually identical without bands (no new toolbar button in this plan), and `visual.spec.mjs` stayed green on -darwin.

## The all-particles fix

The RESEARCH prototype's walk-back stopped at index 0 and could return the first character for an all-particle line. `lhRhymeTarget` now walks back to the nearest character that is neither a particle nor punctuation; if there is none, the target is the last character (`啊呀` gives 呀, `啊！呀！` gives 呀). Locked by 「句尾：語助詞跳過…」.

## Deviations from Plan

None - plan executed exactly as written. Two small implementation details beyond the text, neither a deviation: the mirror's scrollTop is set after display is switched on (a `display: none` element ignores it), and the cache-hit path re-syncs geometry so a stale mirror realigns without repainting.

## Known Stubs

None. `LH_RHYME_DEFAULTS` is not persisted yet (`_lhMapSet` is an in-memory copy); persistence and `lh:map` registration are 10-04 by plan. `song.readings` is read when present and is undefined until 10-06.

## Threat Flags

None. Lyric text enters the mirror only as strings in a `DocumentFragment` and `span.textContent`; `data-f` is `String(integer)`; no fetch / XHR (the 上色 spec asserts zero requests while repainting and typing); sections over 5,000 lines or `LH_WD_BIG` characters are not analysed.

## Items for Andy (not done unattended)

- Real-device check of the 17 colors, the light / dark sets and the neutral grey at index 16 (UAT items A7, UI-SPEC D-04 addition).
- Real IME composition on iPad, iPhone and Android Safari / Chrome (only CDP-simulated composition is covered here).
- `-linux.png` visual baselines were not touched (and nothing needed refreshing in this plan).
- No theme-change handling yet: the palette is written once at load; 10-03 adds the `data-theme` observer (a section painted in light, then switched to dark, keeps the light variables until then).

## Next Phase Readiness

Ready for 10-02 (lookup parity: `candidates.js` / `wordlist.js` call `lhRhymeMatch`, and `switchLexiconPack` calls `lhMapOnLexiconChange`). MAP-01, MAP-02 and MAP-12 are shared with later plans and are not marked complete.

## Self-Check: PASSED

- Files exist: `js/rhyme-core.js`, `js/rhyme-map.js`, `tests/rhyme-core.spec.mjs`, `tests/rhyme-map-ui.spec.mjs` (checked).
- Commits `83c983c` and `d9c816c` found in `git log`; `rev-list` count since the ledger base is 2.
- All task acceptance criteria and the plan-level verification re-run and passing.
