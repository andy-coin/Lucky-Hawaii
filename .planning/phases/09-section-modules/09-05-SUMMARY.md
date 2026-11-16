---
phase: 09-section-modules
plan: 05
subsystem: section-delete
tags: [delete, undo-toast, history, a11y, playwright]
status: complete
requires:
  - phase: 09-section-modules
    provides: "09-04 lhSecApply returning the history step, lhHistTop, lhHistUndo; 09-02 type button and delegated header click"
provides:
  - "js/ui-common.js: showUndoToast(msg, actionLabel, onAction, ms = 5000, actionAria), hideUndoToastAction(); showToast drops has-action"
  - "js/sections.js: lhSecRemove(id) through lhSecApply('remove'); − visibility and aria-label kept in lhSecRefreshMeta"
  - "CSS: .copy-toast.show.has-action, .toast-action, .section-remove[hidden]"
  - "Removed: removeLyricsSection and its confirm() dialog"
affects: [09-06 drag (last direct-mutation path still covered by lhHistEnsure verify), 09-10 verification]
actuals:
  tokens: 11000
  tasks: 2
  commits: 2
plan_head_before: 7dee6a49cf613ef872af78d14feb4037467bd357
plan_head_after: 7cc2e6e62ba2ca1f2a0a88ab72874fb58e36f7e4
commits: 2
key-files:
  created: []
  modified: [js/ui-common.js, js/sections.js, js/lyrics.js, js/undo.js, css/panels.css, tests/sections-ui.spec.mjs, tests/layout.spec.mjs, tests/songs-model.spec.mjs]
key-decisions:
  - "Toast button border uses currentColor instead of the UI-SPEC literal rgba(255,255,255,0.6): no new color literal in CSS (style.spec rule); renders white on the dark toast as intended"
  - "復原 action is guarded by identity: it runs only when lhHistTop(curSong()) is the delete's own step object"
  - "Touch CSS gives .section-remove display:inline-flex, which beats the hidden attribute, so .section-remove[hidden] { display: none } was added"
requirements-completed: []
duration: ~20 min
completed: 2026-10-23
coverage:
  - id: D1
    description: "− deletes at once with no dialog; names renumber, one undo step, saved; toast 已刪除「名稱」 with 復原 restores the same section (id, text, type, color) at the same index"
    requirement: EDIT-03
    verification:
      - { kind: e2e, ref: "tests/sections-ui.spec.mjs#刪除：直接刪、按復原救回", status: pass }
      - { kind: e2e, ref: "tests/layout.spec.mjs#刪除：不跳確認、按復原救回", status: pass }
    human_judgment: false
  - id: D2
    description: "復原 only undoes its own delete: newer step (typing, type change, add), undo / redo and a later showToast remove it; pressing after a song switch does nothing"
    requirement: EDIT-03
    verification:
      - { kind: e2e, ref: "tests/sections-ui.spec.mjs#刪除：新動作讓復原鈕消失", status: pass }
      - { kind: e2e, ref: "tests/sections-ui.spec.mjs#刪除：換歌後按復原不動", status: pass }
    human_judgment: false
  - id: D3
    description: "Last section cannot be deleted (− hidden, lhSecRemove no-op); first section can; one / two Verse naming"
    requirement: EDIT-03
    verification:
      - { kind: e2e, ref: "tests/sections-ui.spec.mjs#刪除：最後一段不能刪", status: pass }
      - { kind: e2e, ref: "tests/sections-ui.spec.mjs#刪除：第一段也能刪", status: pass }
      - { kind: e2e, ref: "tests/sections-ui.spec.mjs#刪除：一段兩段多段的名稱", status: pass }
    human_judgment: false
  - id: D4
    description: "Focus after delete: type button at that index (else last) on fine pointer, nothing focused on touch"
    requirement: EDIT-03
    verification:
      - { kind: e2e, ref: "tests/sections-ui.spec.mjs#刪除：焦點", status: pass }
    human_judgment: false
  - id: D5
    description: "Names cut to 16 chars plus 「…」 in the toast, full name in aria-label, names are plain text (no element created)"
    requirement: EDIT-03
    verification:
      - { kind: e2e, ref: "tests/sections-ui.spec.mjs#刪除：名稱太長", status: pass }
      - { kind: e2e, ref: "tests/layout.spec.mjs#刪除：段落名稱只當純文字顯示", status: pass }
    human_judgment: false
  - id: D6
    description: "Backstop: after the toast is gone (5.5 s), Cmd/Ctrl+Z in the editor restores the section with same index, text, type, color"
    requirement: EDIT-03
    verification:
      - { kind: e2e, ref: "tests/sections-ui.spec.mjs#刪除：五秒後仍可復原", status: pass }
    human_judgment: false
  - id: D7
    description: "Look and feel of the toast and 復原 button on real devices (position above the on-screen keyboard, tap comfort)"
    requirement: EDIT-03
    verification: []
    human_judgment: true
    rationale: "Real keyboard and finger feel cannot be exercised in headless Chromium; layout.spec checks the button is really clickable on phone emulation"
---

# Phase 9 Plan 05: Undoable delete Summary

Delete is now immediate and undoable: − removes the section with no dialog, a toast offers 復原 for 5 seconds, and ↶ / Cmd+Z bring it back at any time; any section can go as long as one remains.

## What was built

- **js/ui-common.js:** `showUndoToast` reuses `#copyToast` (role=status, classes `show has-action`), message as a Text node, button via `textContent` / `setAttribute`; button click hides the action and toast, then runs the callback; a timer removes toast and action after `ms`. `hideUndoToastAction` removes the button and `has-action`. `showToast` also drops `has-action`.
- **js/sections.js:** `lhSecRemove(id)` returns when fewer than two sections; goes through `lhSecApply('remove', ..., { dom: 'render' })`; focuses the type button at that index (else last) only on `(hover: hover) and (pointer: fine)`; the toast callback undoes only if `lhHistTop(curSong())` is its own step. `lhSecRefreshMeta` keeps `−` hidden state and aria-label current. The delegated click now calls `lhSecRemove`.
- **js/lyrics.js:** `removeLyricsSection` and the confirmation are gone; every section renders `button.section-remove` (title 刪除這個段落, aria-label 刪除「名稱」), `hidden` when one section.
- **js/undo.js:** `hideUndoToastAction()` in `lhHistCommit`, the new-step branch of `lhHistTyping`, and `_lhHistMove` (undo and redo).
- **css/panels.css:** `.copy-toast.show.has-action` (pointer-events auto, flex), `.toast-action` (0.875rem / 700, min `--hit`), `.section-remove[hidden]`, touch comment updated. The `.copy-toast` position rules and the `html.kb-open` rule are untouched.
- **tests:** 10 new specs in tests/sections-ui.spec.mjs (RED recorded: first test failed at the missing `has-action` class; Task 2 RED: the toast-action and focus specs failed before undo.js / focus wiring); the two layout 刪除 tests rewritten for the no-dialog flow; songs-model comment updated.

## Task commits

| Task | Commit | Summary |
|------|--------|---------|
| 1 (tracer) | 572a7b9 | showUndoToast, lhSecRemove, − on every section, toast CSS, rewritten layout tests |
| 2 | 7cc2e6e | history hooks hide the 復原 button, delete focus, 9 delete specs incl. 5 s backstop |

Tracer gate: `<verify>` is automated-only and human_verify_mode is end-of-phase, so the verify set was re-run end to end after Task 1 (sections-ui, songs-model, undo, style, scan, smoke, layout: all green) before continuing.

## Deviations from Plan

**1. [Minor, planned] Toast button border is `currentColor`**, not the UI-SPEC literal rgba(255,255,255,0.6) (no new color literal; see plan objective).

**2. [Rule 1 - Bug] Touch `.section-remove` ignored `hidden`**
- **Found during:** Task 1 (CSS) while reading the coarse-pointer rule that sets `display: inline-flex`.
- **Fix:** added `.section-remove[hidden] { display: none; }` next to the base rule so the single-section − is hidden on touch too.
- **Files:** css/panels.css. **Commit:** 572a7b9

**3. [Test bug] Own test sequence**: my first draft of 「刪除：新動作讓復原鈕消失」 deleted the wrong section after an undo and then clicked a hidden −; rewritten as a straight sequence (typing, type change, add, ↶, showToast). No product change.

**4. [Process] desktop-lyrics-darwin.png was re-generated once and reverted**: the regenerated file differed only by encoding / noise (single section, − hidden, nothing visible changed), so the committed baseline is kept. No baseline changed in this plan; no -linux touched.

## Known Stubs

None.

## Threat model status

- T-09-11: action guarded by step identity; newer steps, undo / redo and showToast remove the button; tested by 「刪除：新動作讓復原鈕消失」 and 「刪除：換歌後按復原不動」.
- T-09-12: message is a Text node, label via textContent, aria-label via setAttribute; 「刪除：段落名稱只當純文字顯示」 and 「刪除：名稱太長」 pass.
- T-09-SC: no package installed; package.json / package-lock.json unchanged.
- Threat flags: none new.

## Requirements

EDIT-03 is also declared by 09-06, 09-08, 09-09 and 09-10, so it is NOT marked complete in REQUIREMENTS.md here.

## Verification

- `grep -c "confirm(" js/lyrics.js` is 0; `function showUndoToast` 1; `function lhSecRemove` 1; `hideUndoToastAction()` in js/undo.js 3.
- `npx playwright test tests/sections-ui.spec.mjs -g "刪除"` 9 passed.
- Full suite (`npx playwright test`): 767 passed, 27 skipped (not from this plan), 0 failed.

## Andy to-do

- 真機 UAT：手機刪除後提示與「復原」鈕的位置（鍵盤開著時是否在鍵盤上方）、手指好不好按、5 秒長短是否合意。
- 本計畫沒有改任何 -linux 截圖基準。

## Self-Check: PASSED

- FOUND: js/ui-common.js (showUndoToast), js/sections.js (lhSecRemove), tests/sections-ui.spec.mjs, .planning/phases/09-section-modules/09-05-SUMMARY.md
- FOUND commits: 572a7b9, 7cc2e6e
