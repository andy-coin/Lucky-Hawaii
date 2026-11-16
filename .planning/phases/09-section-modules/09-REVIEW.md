---
phase: 09-section-modules
reviewed: 2026-10-23T00:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - css/panels.css
  - css/responsive.css
  - index.html
  - js/lyrics.js
  - js/safety.js
  - js/sections-core.js
  - js/sections.js
  - js/songs.js
  - js/ui-common.js
  - js/undo.js
  - js/word-drag.js
  - tests/drag-lib.mjs
findings:
  critical: 0
  warning: 0
  info: 7
  total: 7
status: clean
---

# Phase 9: Code Review Report (iteration 2)

**Reviewed:** 2026-10-23
**Depth:** standard
**Files Reviewed:** 12
**Status:** clean (no Critical or Warning findings remain)

## Summary

Re-reviewed the phase after the fix commits 0896b7d..4ceb60e. I read the diff of `js/undo.js`, `js/sections.js`, `js/songs.js` and `js/sections-core.js` and traced each fix through its callers. I also ran `lhInferSecType` in `node:vm` against 19 labels.

All six earlier findings are fixed correctly. I found no regressions.

| Finding | Verdict | Evidence |
|---|---|---|
| CR-01 | Fixed | `_lhHistMove` returns false while `_lhComposing` is true (`undo.js:76`). `_lhComposing` is declared with `let` in `songs.js:18`, which is a classic script that loads before any call, so the global lexical scope shares it. The guard covers the buttons, the toast "復原" action (`sections.js:108`), the keydown route and the beforeinput route. The flag is reset on `compositionend`, `focusout` and re-render (`lyrics.js:154,259,271`), so the guard cannot lock undo permanently. |
| WR-01 | Fixed | `_LH_UNDO_SCOPE` no longer contains `#sectionMenu` (`undo.js:147`). Both the keydown and beforeinput handlers use `_lhInScope`, so both fall through to native undo for the name input. |
| WR-02 | Fixed | `#sectionMenu` was added to the `isEditingField()` selector (`songs.js:223`). `m.id = 'sectionMenu'` is set at `sections.js:638`, so the selector matches the real node. |
| WR-03 | Fixed | `_lhHistMove` passes `redo ? h.caret : null` (`undo.js:97`). I traced undo of an insertion, undo of a deletion and a surrogate pair. All three land at the restored block's end, which for an insertion is its start. Redo keeps the recorded caret. The recorded caret is the one saved when the undone step was pushed (`undo.js:84`), so redo lands at the end of the edit as intended. |
| WR-04 | Fixed | Both mutation entry points re-snapshot `present` first. These are `lhSecApply` (`sections.js:36`) and `_lhHistMove` (`undo.js:81`). The latter is the only other caller of `to(h).push`, and `lhHistCommit` runs after the `lhSecApply` refresh. `h.present` is reassigned to a new array afterwards (`undo.js:95`), so nothing aliases. The extra refresh also makes the stored step correct when the model was changed outside the history, which is harmless. |
| WR-05 | Fixed | Node run: `Verse x`, `Verse XIV`, `Verse xix`, `Verse xxxix`, `Verse vi`, `Verse viii`, `Intro i` are all treated as numbered. `Verse C`, `Outro C`, `Bridge L`, `Verse VV`, `Verse IIII`, `Verse xxxx` and `Verse xl` stay custom. The pattern always consumes at least one character, because the lookahead requires `i`, `v` or `x` and the alternatives take it. Arabic and Chinese numerals are unchanged. |

The code is careful about untrusted text. Section names are built with `textContent`, colors are checked against a strict `#rrggbb` pattern, and lookups use Map and Set. I found no XSS, injection or prototype-pollution path.

## Info

These are carried over from iteration 1 and not addressed, since they are out of scope for the `critical_warning` fix pass. IN-07 is new.

### IN-01: Ctrl+Y is treated as Redo on macOS

**File:** `js/undo.js:153`
**Issue:** `k === 'y' && e.ctrlKey` also matches macOS, where Ctrl+Y is the Emacs-style yank key in text fields. The button tooltip only advertises ⇧⌘Z on Mac.
**Fix:** Gate the Ctrl+Y branch with `!mac`. Detect the platform once at module top and reuse it for the tooltips.

### IN-02: Variable `raw` shadows the function parameter in `lhNormalizeSong`

**File:** `js/safety.js:604-607`
**Issue:** `.map(raw => ...)` shadows the outer `raw` song. It is harmless today but an easy trap for the next edit.
**Fix:** Rename the callback parameter to `rs` or `sec`.

### IN-03: Keyboard-invoked `contextmenu` detection relies on `clientX === 0 && clientY === 0`

**File:** `js/sections.js:846-853`
**Issue:** Chrome and Firefox can report the focused element's coordinates for a keyboard-triggered `contextmenu`, not (0,0). The code then reopens the menu at those coordinates, moving it over the name button right after the keydown handler opened it below. It also loses the "focus the current row" behavior.
**Fix:** Ignore `contextmenu` when the menu was opened by the keydown handler in the same task, or use `e.button === -1` or `e.pointerType === ''` as the keyboard signal.

### IN-04: `_hists` entries are never released, and `lhCaretIndexAt` can leak its mirror if it throws

**File:** `js/undo.js:9`, `js/word-drag.js:51-89`
**Issue:**
- History for deleted songs stays in memory for the page lifetime. It is capped at 100 steps per song but never pruned.
- When `lhCaretIndexAt` is called without a cached mirror, `m.remove()` is only reached on the success paths. A throw from `getClientRects` or `setStart` leaves a large hidden div in `<body>`.

**Fix:** Delete the `_hists` entry when a song is deleted. Wrap the mirror use in `try { ... } finally { if (!mirror) m.remove(); }`.

### IN-05: A word-drag swallow flag can remain set after `pointercancel`

**File:** `js/word-drag.js:114-129, 283-291`
**Issue:** After a cancelled touch drag, `_lhWdFinish(false)` arms an untimed swallow. No `pointerup` follows a cancel, so the flag stays true until the next `pointerdown`. A keyboard-activated click on a card in between would be eaten.
**Fix:** In `_lhWdAbort`, arm the swallow with `timed = true`, or add a 400 ms fallback timer for the untimed case.

### IN-06: Same-shape undo hides the change if the changed section is collapsed

**File:** `js/undo.js:108-127`
**Issue:** In the single-diff branch, `area.value` changes but nothing flashes, and `scrollIntoView` targets a collapsed section. The user gets no feedback that undo did anything. The full-render path does flash.
**Fix:** Call `lhSecFlash(diff[0].id)` in that branch too.

### IN-07: Undo/redo buttons give no feedback when refused during composition

**File:** `js/undo.js:76`, `js/undo.js:179`
**Issue:** The new CR-01 guard returns false silently. The ↶ ↷ buttons keep their enabled look, and `lhAnnounce` is not called. On Android keyboards that compose every English word, a tap mid-word looks like a dead button.
**Fix:** Optional. Either set `aria-disabled` on both buttons from `compositionstart` and `compositionend`, or call `lhAnnounce('組字中，請先完成輸入')` in the early return.

---

_Reviewed: 2026-10-23_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
