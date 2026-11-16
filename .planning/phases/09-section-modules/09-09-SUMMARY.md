---
phase: 09-section-modules
plan: 09
subsystem: word-drag-insert
tags: [drag, pointer-events, touch, long-press, caret, mirror-div, phone-sheet, a11y, playwright]
status: complete
requires:
  - phase: 09-section-modules
    provides: "09-04 history (lhSecApply caret, one step), 09-05/06 lhSecApply, lhSecFlash, lhAnnounce, lhSecCountOne, lhSecScroller, lhSecAbortInteractions, drag-lib touchSession / mouseDrag / centerOf, 09-08 lhSecCloseMenu"
provides:
  - "js/word-drag.js (new, loads last): lhMirror(ta), lhCaretIndexAt(ta, x, y, mirror), lhCaretRect(ta, mirror, i), lhWordDragCancel(), card pointer session (pending -> dragging -> drop / cancel), one-shot click swallow, touch contextmenu guard, phone tab switch (F7), collapsed-section dwell (F8), edge auto-scroll"
  - "DOM / CSS: .word-drag-ghost, .drop-caret, .section-textarea.drop-target, .word-drag-source, .drag-hint, .lyrics-section.dwell, body.is-word-dragging"
  - "js/sections.js: lhSecAbortInteractions also cancels an active word drag"
  - "tests/drag-lib.mjs caretOracle(page, textareaLocator, x, y); tests/word-drag.spec.mjs (24 specs)"
affects: [09-10 verification (UAT: real-device touch, iOS A1 / A6, F1 / F7 / collapsed-panel toast decisions)]
actuals:
  tokens: 14400
  tasks: 3
  commits: 3
plan_head_before: 2dbfeb095e30f39fa3160fcbc66913721189bea7
plan_head_after: 94dba9376b5c3fe570f41c128fd39f05fdb6fe8f
commits: 3
key-files:
  created: [js/word-drag.js, tests/word-drag.spec.mjs]
  modified: [index.html, css/panels.css, js/sections.js, tests/drag-lib.mjs, tests/split-tags.spec.mjs]
key-decisions:
  - "Drag only draws overlays (ghost, caret, outline); the model is written once on release through lhSecApply('insert', ..., { caret }), so every cancel path leaves no trace and no history step"
  - "Mouse starts after 5 px; touch/pen starts after a 400 ms hold with <= 10 px movement, moving more than 10 px first abandons the gesture without touching the browser's scroll; a non-passive document touchmove blocker is registered only while dragging"
  - "Swallow of the click after a drag: armed when a drag ends (timed 400 ms after release; if Esc ended it with the button still down, the countdown starts at the next pointerup), cleared by the next pointerdown"
  - "contextmenu guard is session based (touch gesture pending / dragging / ended < 600 ms), so a mouse right-click never starts a session and still opens the Phase 7 menu"
  - "Caret index below the last line returns end of text, the same as a real click (found by the grid test against real selectionStart)"
  - "Lyrics list scrolls only when the pointer x is inside the scroll parent, so a drag started on the AI panel at the desktop window edge does not scroll the lyrics"
requirements-completed: []
duration: ~75 min
completed: 2026-10-23
coverage:
  - id: R1
    description: "Mouse drag of an AI card inserts the word exactly at the caret under the pointer; saved without flush, one undo step, focus + caret after the word, #lhLive announcement, ghost / caret / outline cleaned"
    requirement: AI-06
    verification:
      - { kind: e2e, ref: "tests/word-drag.spec.mjs#拖詞：滑鼠拖進指定位置", status: pass }
      - { kind: e2e, ref: "tests/word-drag.spec.mjs#拖詞：讀屏提示", status: pass }
    human_judgment: false
  - id: R2
    description: "Plain click is unchanged (card saves to the pool, char card selects); neither inserts text; dragging a char card inserts its character and does not select it"
    requirement: AI-06
    verification:
      - { kind: e2e, ref: "tests/word-drag.spec.mjs#拖詞：點擊不插入", status: pass }
      - { kind: e2e, ref: "tests/word-drag.spec.mjs#拖詞：字卡也能拖", status: pass }
    human_judgment: false
  - id: R3
    description: "Touch: ~400 ms hold starts the drag with no list scroll and no focus after the drop; moving first is a scroll with no ghost; no Phase 7 report menu from the long-press while a mouse right-click still opens it"
    requirement: AI-06
    verification:
      - { kind: e2e, ref: "tests/word-drag.spec.mjs#拖詞：手指長按後拖", status: pass }
      - { kind: e2e, ref: "tests/word-drag.spec.mjs#拖詞：先滑動就是捲動", status: pass }
      - { kind: e2e, ref: "tests/word-drag.spec.mjs#拖詞：長按不跳回報選單", status: pass }
    human_judgment: false
  - id: R4
    description: "Exclusions and cancels: no drag from .mark-badge or report mode; release over header / lyrics-head / empty page, Esc, IME composition, re-render leave nothing and record no history; the same word dragged twice makes two steps; collapsed lyrics panel on desktop shows the toast"
    requirement: AI-06
    verification:
      - { kind: e2e, ref: "tests/word-drag.spec.mjs#拖詞：不從徽章或回報模式開始", status: pass }
      - { kind: e2e, ref: "tests/word-drag.spec.mjs#拖詞：放在歌詞外就取消", status: pass }
      - { kind: e2e, ref: "tests/word-drag.spec.mjs#拖詞：Esc 取消", status: pass }
      - { kind: e2e, ref: "tests/word-drag.spec.mjs#拖詞：組字中放開不插入", status: pass }
      - { kind: e2e, ref: "tests/word-drag.spec.mjs#拖詞：中斷就收", status: pass }
      - { kind: e2e, ref: "tests/word-drag.spec.mjs#拖詞：同一個詞拖兩次", status: pass }
      - { kind: e2e, ref: "tests/word-drag.spec.mjs#拖詞：歌詞面板收著", status: pass }
    human_judgment: false
  - id: R5
    description: "A word with < > & quote renders as text in the ghost, live region and textarea and creates no element"
    requirement: AI-06
    verification:
      - { kind: e2e, ref: "tests/word-drag.spec.mjs#拖詞：特殊字元原樣插入", status: pass }
    human_judgment: false
  - id: R6
    description: "Phone bottom-sheet layout: drag start brings up 歌詞, a drop stays there, a cancel or interruption returns to the original tab; large screens never switch tabs"
    requirement: AI-06
    verification:
      - { kind: e2e, ref: "tests/word-drag.spec.mjs#拖詞：手機自動切到歌詞", status: pass }
      - { kind: e2e, ref: "tests/word-drag.spec.mjs#拖詞：手機中斷會回到原分頁", status: pass }
      - { kind: e2e, ref: "tests/word-drag.spec.mjs#拖詞：大螢幕不切分頁", status: pass }
    human_judgment: false
  - id: R7
    description: "Collapsed section dwell (600 ms, header tint), self-expanded sections collapse again unless they got the word; edge auto-scroll while dragging a word"
    requirement: EDIT-03
    verification:
      - { kind: e2e, ref: "tests/word-drag.spec.mjs#拖詞：停在收合段落會展開", status: pass }
      - { kind: e2e, ref: "tests/word-drag.spec.mjs#拖詞：靠邊自動捲", status: pass }
    human_judgment: false
  - id: R8
    description: "lhCaretIndexAt equals the real click's selectionStart on a grid (unscrolled, scrolled to 150 px, wrapped 200-char mixed line); 250,000-char section draws no live caret and still inserts at the right index; rare characters are never split"
    requirement: AI-06
    verification:
      - { kind: e2e, ref: "tests/word-drag.spec.mjs#拖詞：游標索引對得上", status: pass }
      - { kind: e2e, ref: "tests/word-drag.spec.mjs#拖詞：長句換行游標", status: pass }
      - { kind: e2e, ref: "tests/word-drag.spec.mjs#拖詞：超長段落", status: pass }
      - { kind: e2e, ref: "tests/word-drag.spec.mjs#拖詞：不切開罕用字", status: pass }
    human_judgment: false
  - id: R9
    description: "Real finger / iOS Safari feel: long-press arbitration, non-passive touchmove blocking, events continuing after the AI sheet is moved away, vibration, hint readability"
    requirement: AI-06
    verification: []
    human_judgment: true
    rationale: "CDP touch in headless Chromium does not reproduce iOS Safari gesture arbitration (assumptions A1 / A6) or real finger size"
---

# Phase 9 Plan 09: Drag a word into the lyrics Summary

AI word cards and rhyme char cards can be dragged straight into any spot of the lyrics, with a mouse (5 px) or a 400 ms finger hold, inserted exactly under a measured mirror-div caret, one undo step, with the phone auto-switching to 歌詞 and collapsed sections opening under a resting pointer; a plain click still only saves or selects.

## What was built

- **js/word-drag.js (new, 412 lines, loads last):** `lhMirror` / `lhCaretIndexAt` / `lhCaretRect` ported from RESEARCH Pattern 8 (clientWidth-based width, trailing zero-width space, binary search on glyph tops, newline stops, surrogate-pair guard, end-of-text below the last line). One document-level session: capture `pointerdown` on `.ai-word-card` / `.char-card` (primary only; not `.mark-badge`, `.poly-chip`, `#aiWordsContainer.report-mode`), then `pointermove / up / cancel` on the document filtered by `pointerId` (the card may become inert when the AI sheet slides away). A rAF tick positions the ghost (0.75rem above-left of the mouse, centered 3rem above a finger), finds the textarea with `elementsFromPoint`, keeps a cached mirror per textarea (rebuilt when value or width changes), draws the caret, runs edge auto-scroll and the collapsed-header dwell. Release over a textarea (and not composing) calls `lhSecApply('insert', ..., { caret })`, then sets `.value`, `lhSecCountOne`, `lhSecFlash`, `lhAnnounce`, and focuses with the caret after the word for a mouse only. `lhWordDragCancel()` ends anything with no insert; `_lhWdFinish` removes every listener, overlay and class, collapses sections this drag expanded (except the one that got the word) and switches back to the original tab.
- **js/sections.js:** `lhSecAbortInteractions` calls `lhWordDragCancel()` behind a `typeof` guard (word-drag.js loads after the first render).
- **css/panels.css:** ghost, drop caret, `.drop-target` outline, `.word-drag-source` 0.5, `body.is-word-dragging`, cards `-webkit-touch-callout: none; user-select: none`, `.drag-hint` (same surface as `.copy-toast`), static `.dwell` header tint with `color-mix`. No new `@keyframes` / `transition`, tokens only.
- **tests:** `tests/word-drag.spec.mjs` 24 specs; `tests/drag-lib.mjs` `caretOracle`; `tests/split-tags.spec.mjs` now lists 26 scripts.

## Task commits

| Task | Commit | Summary |
|------|--------|---------|
| 1 (tracer) | e5a00c7 | mouse drag to an exact index, one undo step, click swallow, split-tags order, caretOracle |
| 2 | d2f140a | finger long-press, scroll gate, contextmenu guard, Esc, exclusions, char cards, 12 specs |
| 3 | 94dba93 | phone tab switch, collapsed-section dwell, auto-scroll, grid-vs-real-click caret specs |

Tracer gate: the Task 1 `<verify>` is automated-only and `human_verify_mode` is end-of-phase, so the verify set (word-drag, split-tags, style, scan, smoke, undo) was run end to end before expanding; green apart from the already-deferred undo spec (see below).

## Verification

Plan-level run (word-drag, sections-ui, sections-drag, undo, report-entry, split-tags, style, scan, smoke, layout, visual): **277 passed, 0 failed.** Acceptance greps: `function lhCaretIndexAt` = 1, `'word-drag'` in split-tags = 1, `lhSecApply('insert'` = 1, `passive: false` = 2, `lhWordDragCancel()` in sections.js = 1, `mobileTab(` in word-drag.js = 2, `caretOracle` export = 1; word-drag spec 24 passed. Mutation spot checks (each reverted): removing the touchmove blocker fails 手指長按後拖; removing the contextmenu guard fails 長按不跳回報選單; removing the auto-scroll step fails 靠邊自動捲.

## Deviations from Plan

**1. [Rule 1 - Bug] Index below the last line.**
- **Found during:** Task 3 (grid test against real clicks).
- **Issue:** a point under the last line (inside the textarea) returned the nearest character on the last line, but a real click puts the caret at the end of the text.
- **Fix:** `lhCaretIndexAt` returns `n` when the pointer is below the last line box. **Files:** js/word-drag.js. **Commit:** 94dba93.

**2. [Process] RED-first was partial.** Task 1: only the drag spec failed, the click spec already passed (existing behavior, kept as a regression guard). Task 2: Esc, interruption and composition specs failed first for the right reason, then passed. Task 3: 超長段落, 不切開罕用字 and 讀屏提示 passed on first run because Task 1's code already handled them. The surrogate guard cannot be proven by a Chromium test: removing it changes nothing here (a half-pair rect equals the whole glyph, so the scan never stops between the halves). It stays as a defensive guard per RESEARCH; the spec checks the invariant (index never between the halves, drop never splits the pair).

**3. [Test-only] Fixes while writing specs, no product change:** card 10 of 80 sat below the visible AI list so the scroll spec uses card 4; the spec's `ONE()` helper takes storage extras (for the collapsed-panel spec); the caret grid stops 24 px above the textarea bottom (the 09-07 resize bar covers it, a click there does not reach the textarea); collapse / expand layout animations are waited out in real time under the fake clock (`waitStill` would hang there); `caretOracle` was added in Task 1 instead of Task 3 because Task 1's spec needed it, and no `press` helper was needed in drag-lib.

**4. [Pre-existing] `tests/undo.spec.mjs` 「復原：只換一格」** failed during the Task 1 verify run (scrollTop 3116 vs 3153, the already-deferred item from 09-08) and passed in the final plan-level run; it is unrelated to this plan and looks timing dependent. Left as is in `deferred-items.md`.

**Total deviations:** 1 auto-fixed bug, 3 process / test notes. **Impact:** none on scope.

## Decisions recorded for UAT (Andy to confirm)

- **F1:** rhyme char cards (`.char-card`) are draggable too, not only AI word cards.
- **F7:** on a phone, starting a drag brings up the 歌詞 sheet; a successful drop stays on 歌詞; a cancel returns to the tab you were on (查韻 or AI).
- **Desktop with the lyrics panel collapsed (RESEARCH Open Question 4):** no drag starts and the toast 「先打開歌詞面板，再把詞拖進去」 appears (the left panel is not auto-opened because that can collapse the AI panel the card lives in).
- **Ceiling:** above 200,000 characters in one section no live caret is drawn; the index is computed once at release (measured with a 250,000-character section).
- **Real-device checks (assumptions A1 / A6):** iOS Safari must honor `preventDefault` on a document-level non-passive `touchmove` after the long-press, and must keep delivering pointermove / pointerup after the AI sheet is moved away; Android long-press `contextmenu` suppression (A3) is covered by a synthetic event only. If A1 fails, the fallback in RESEARCH is to register the blocker at `touchstart` with a temporary `touch-action: none` class.
- **Accepted gap:** there is no keyboard alternative for dragging a word in (UI-SPEC 8.3).

## Authentication Gates

None.

## Known Stubs

None.

## Threat Flags

None. T-09-19 mitigated (word written only through `textContent` and `.value`; covered by 特殊字元原樣插入); T-09-20 mitigated (thresholds, one-shot click swallow, composition guard; covered by 點擊不插入, 先滑動就是捲動, 組字中放開不插入); T-09-21 mitigated (cached mirror, rAF throttle, 200,000-character ceiling covered by 超長段落); T-09-SC: no package installed, package.json untouched.

## Visual baselines

Not regenerated: the visual spec (all three -darwin lyrics baselines and the rest) passes unchanged, the new overlays only exist during a drag. -linux baselines are untouched (Andy to-do carried over from 09-06 / 09-08).

## Next Phase Readiness

Ready for 09-10 (phase verification and UAT).

## Self-Check: PASSED

Created files exist (js/word-drag.js, tests/word-drag.spec.mjs); commits e5a00c7, d2f140a, 94dba93 found in git log; all task acceptance greps pass; plan-level verification 277 passed.
