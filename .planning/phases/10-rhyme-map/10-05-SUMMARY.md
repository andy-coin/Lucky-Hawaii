---
phase: 10-rhyme-map
plan: 05
subsystem: ui
tags: [rhyme-map, selection-bar, lookup, ai, a11y, touch, playwright]
status: complete

requires:
  - phase: 10-rhyme-map
    provides: "10-04: lhMapCloseAll, #rhymeMenu, the capture pointerdown / Escape listeners, the reclamp helper"
provides:
  - "#rhymeSelBar.word-ctx-menu.rm-bar (role toolbar, aria-label 選字工具) built once, buttons 「🔍 查韻：{字}」 and 「✨ AI 建議」"
  - "Selection watcher on #lyricsSections, lhMapShowBar / lhMapHideBar / lhMapLookup(char, withAI, byKeyboard), lhMapBarBuild"
  - "lhMapCloseAll() now also hides the bar"
affects: [10-06 adds the 「讀音」 button to the same bar, 10-07 stats rows reuse lhMapLookup, 10-08 UAT list]

actuals:
  tokens: 22000
  tasks: 3
  commits: 3
plan_head_before: e61c46a16292f678708d6be42bc41cbc211c5517
plan_head_after: dd4af64592ae6b36ddc237f1737df3c621e4f839

tech-stack:
  added: []
  patterns:
    - "Snapshot-at-show: the bar keeps { ta, secId, a, b, end, char } and buttons act on it, never re-read the selection (RESEARCH Pitfall 8)"
    - "Dismissed-selection signature (段落:起:迄): a selection closed by Esc or a button does not re-appear by itself; a new mouseup or a different range clears it"
    - "Placement = lhMirror + lhCaretRect then lhPlaceMenu; no measurement above LH_WD_BIG, and a selection end scrolled out of the textarea also docks"

key-files:
  created: []
  modified:
    - js/rhyme-map.js
    - css/panels.css
    - tests/rhyme-map-ui.spec.mjs

key-decisions:
  - "Lookup does exactly the search box's input-handler calls (selectedChars.clear, updateSelectedCharsHint, _handleSearch); no second lookup implementation"
  - "Selection ending in a newline (triple-click) is placed at the last non-space character's line, so the bar sits under the last visible line"
  - "Scroll closes only a bar that is already shown and does not cancel the pending 400 ms check (focus makes the browser scroll once); scrolls within 700 ms of a viewport resize are ignored (keyboard open scrolls by itself)"

requirements-completed: []

coverage:
  - id: D1
    description: "Selecting 1-20 characters containing a Chinese character in a section textarea shows the bar below the last selected line; first button 「🔍 查韻：{last Han}」; plain click / tap, no-Han and 21-char selections show nothing"
    requirement: MAP-05
    verification:
      - kind: e2e
        ref: "tests/rhyme-map-ui.spec.mjs#浮動列：反白後出現、按查韻就查; #浮動列：只點一下不會出現; #浮動列：這些情況不出現"
        status: pass
    human_judgment: false
  - id: D2
    description: "查韻 puts the character in #searchInput, runs the search, cards appear; desktop keeps textarea focus and selection; phone switches to the 查韻 tab. AI 建議 clears lastLyricsSelection, opens the right panel / AI tab and presses #generateBtn"
    requirement: MAP-05
    verification:
      - kind: e2e
        ref: "tests/rhyme-map-ui.spec.mjs#AI 建議：先查韻再出 AI 詞卡、送整首歌; #浮動列：手機查韻與 AI 建議切分頁"
        status: pass
    human_judgment: false
  - id: D3
    description: "Bar hides on Esc (focus + selection back), collapse, scroll, outside pointerdown, compositionstart, song switch, panel collapse; buttons do not steal selection/focus; Alt+ArrowDown / arrows / Esc keyboard path with aria-keyshortcuts only while shown"
    requirement: MAP-05
    verification:
      - kind: e2e
        ref: "tests/rhyme-map-ui.spec.mjs#浮動列：這些情況收起來; #浮動列：按鈕不會吃掉選取; #浮動列：鍵盤操作"
        status: pass
    human_judgment: false
  - id: D4
    description: "Placement: below the selection, docked inside the visible viewport when it does not fit, inside the visible area with a 336 px emulated keyboard, exactly one appearance ~400 ms after five selection changes, no measuring above 200,000 characters, every bar button >= 44x44 on phone / tablet / coarse 1180x820"
    requirement: MAP-05
    verification:
      - kind: e2e
        ref: "tests/rhyme-map-ui.spec.mjs#浮動列：在選取下方，放不下就貼在可見範圍底部; #浮動列：鍵盤打開時仍在可見範圍內; #浮動列：手機長按選字，連續改選取只出現一次; #浮動列：超長段落不量版面、直接貼底; #浮動列：觸控按鈕夠大"
        status: pass
    human_judgment: true
    rationale: "Native selection handles, the iOS / Android callout and a real software keyboard cannot be reproduced in Chromium (UAT)"
---

# Phase 10 Plan 05: Selection Bar (查韻 / AI 建議) Summary

在歌詞裡反白一個字（1–20 字、至少一個中文字），選取下方就出現「🔍 查韻：{字}」「✨ AI 建議」；按下去直接查同韻字卡或請 AI 出詞，輸入框的焦點和選取都不被搶走。

## Performance

- **Tasks:** 3 (1 tracer, 2 auto); **commits:** 3 (`4671190`, `97675e0`, `dd4af64`)
- **Files:** 3 modified (`js/rhyme-map.js` +~190 lines, `css/panels.css` +5, `tests/rhyme-map-ui.spec.mjs` +~300)
- **`npm test`:** 922 passed, 28 skipped, 0 failed (10-04 baseline 909 / 28); `package.json` / `package-lock.json` untouched

## Accomplishments

- **Tracer (`4671190`).** `#rhymeSelBar` built once on `<body>`; watcher on `#lyricsSections`; `lhMapLookup`; `lhMapCloseAll()` hides the bar. Specs 「浮動列：反白後出現、按查韻就查」 and 「只點一下不會出現」.
- **Behaviour (`97675e0`).** AI path, phone tab switching, the not-shown / closes-on matrix, buttons not eating the selection, keyboard path. One real bug found while writing the specs (see Deviations).
- **Placement and devices (`dd4af64`).** Specs for placement below the selection and docking, the 336 px emulated keyboard, the long-press flicker backstop, 200,000+ character section, touch size on three devices.

## Event timings and behaviour as implemented

- Mouse: `mouseup` on a section textarea clears the dismissed signature and checks on the next animation frame.
- Keyboard / touch / programmatic: `select`, `selectionchange` and `keyup` (not Escape) on `#lyricsSections`; a collapsed selection hides the bar at once; a changed range hides it at once and re-checks 400 ms after the last event (so dragging handles never flickers; five changes 100 ms apart produce one show about 400 ms after the last).
- Not shown while composing, `_lhDrag`, `_lhResize`, `_lhWd`, `_lhMenuId`, `#rhymeMenu` open, AI report mode, a hidden textarea, or the same range the user dismissed with Esc / a button.
- Closes on Esc (capture on document; focus and the same range go back to the textarea), outside `pointerdown`, `compositionstart`, scroll of the lyrics area, `lhMapCloseAll()` (re-render, song switch, breakpoint change, left-panel collapse, section popover / rhyme menu opening).
- Docking: the bar goes under the selection end (`+0.25rem` fine / `+1.75rem` coarse); `lhPlaceMenu` clamps it into `visualViewport`, which docks it at the bottom when it does not fit. Above `LH_WD_BIG` characters, or when the selection end is scrolled outside the textarea, no measurement is done and it docks at the bottom directly. On `resize` / `visualViewport` resize the existing double-rAF reclamp helper re-places it.
- 查韻: `lastLyricsSelection = ''`, `searchInputEl.value`, `selectedChars.clear()`, `updateSelectedCharsHint()`, `_handleSearch`; at <= 900 px `mobileTab('search')`; on desktop, only a keyboard-activated click restores focus and the same range.
- AI 建議: same query, at <= 900 px `mobileTab('ai')` only when the right panel is collapsed, on desktop `toggleRightPanel()` when it is collapsed, then `#generateBtn.click()` after the search promise resolves (a busy, disabled button ignores it).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] A scroll event cancelled the pending bar check**
- **Found during:** Task 2 (specs for keyboard path failed with the bar never built)
- **Issue:** `lhMapHideBar()` also cleared the 400 ms timer, and focusing the textarea makes the browser fire a scroll, so a freshly made selection never produced a bar.
- **Fix:** the scroll listener only hides an already shown bar (`lhMapHideBar(true)` keeps the timer); scrolls within 700 ms of a viewport resize are ignored.
- **Files modified:** `js/rhyme-map.js`
- **Commit:** `97675e0`

### Notes on plan execution

- The plan puts AI / keyboard / Esc handling in Task 2, but those parts were written together with the tracer in one pass, so commit `4671190` already contains them; commits 2 and 3 are the scroll fix plus the specs. The per-task test and acceptance checks were all run at the matching point.
- 「AI 建議」 spec: with the stub wordlist the pool is smaller than the ranking target, so the AI call goes through the word-generation path whose prompt carries no lyrics. The spec therefore records `lastLyricsSelection` (must be `''`) and the whole-song text at the instant `generateAISuggestions` runs, instead of grepping the request body.
- The touch-size spec filters failures to `.rm-bar` buttons: on 1180x820 with the right panel open `div.saved-pool-title` is 33 px high (pre-existing, not in this plan's scope; see Items).

## Known Stubs

None.

## Threat Flags

None new. T-10-09: the character reaches the label via `textContent` and `#searchInput` via `.value` only (acorn HTML-sink scan in the full suite passes). T-10-10: accepted, the AI button sends what it already sends. T-10-11: `lhMirror` is never called above `LH_WD_BIG`, covered by a spec that counts calls. T-10-SC: no package installed.

## Items for Andy (not done unattended)

- Real devices (UAT): native selection handles and the iOS / Android copy callout vs the bar placed below; real software keyboard; Safari / Firefox `select` / `selectionchange` on textareas (Chromium only here, RESEARCH A1 / A2); the always-last-character rule (OQ6).
- Same range re-selected after Esc or a button press does not bring the bar back until the mouse is released again or the range changes (deliberate, avoids Esc re-showing it).
- Pre-existing: `div.saved-pool-title` is 33 px high at 1180x820 with the right panel open (found by the touch audit, logged only).
- No `?v=` cache-busting bump; bump at release time. `-linux` baselines untouched (no screenshots changed in this plan).
- `requirements-completed` left empty on purpose: MAP-05 is also declared by 10-07 and 10-08.

## Self-Check: PASSED

- Files exist: `js/rhyme-map.js`, `css/panels.css`, `tests/rhyme-map-ui.spec.mjs`, this SUMMARY.
- Commits `4671190`, `97675e0`, `dd4af64` in `git log`; `rev-list --count` since the ledger base is 3.
- Acceptance greps: `rhymeSelBar` in js/rhyme-map.js 2+, `lastLyricsSelection = ''` 1, `aria-keyshortcuts` 3, `浮動列：` in the spec 12, `AI 建議：` 2.
- Full `npm test`: 922 passed, 0 failed. Mutation checks: removing the `lastLyricsSelection` reset and removing the pointerdown / mousedown default-prevention each made the matching spec fail.
