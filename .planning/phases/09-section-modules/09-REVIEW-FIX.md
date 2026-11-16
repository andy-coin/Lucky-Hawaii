---
phase: 09-section-modules
fixed_at: 2026-10-23T00:00:00Z
review_path: .planning/phases/09-section-modules/09-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 9: Code Review Fix Report

**Fixed at:** 2026-10-23
**Source review:** .planning/phases/09-section-modules/09-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (CR-01, WR-01..WR-05)
- Fixed: 6
- Skipped: 0

Verification ran in the main checkout (`workflow.use_worktrees` is false, so no worktree was created). Each fix has a Playwright spec, and each new or changed spec was confirmed to fail with the fix stashed. Final `npm test`: 847 passed, 27 skipped, 0 failed (2.3m).

## Fixed Issues

### CR-01: Undo/redo buttons can rewrite the textarea during IME composition

**Files modified:** `js/undo.js`, `tests/undo.spec.mjs`
**Commit:** 0896b7d
**Applied fix:** `_lhHistMove` returns false at the top while `_lhComposing` is true, which covers the buttons, keyboard and beforeinput routes. New spec `復原：組字中按按鈕不動輸入框` composes through CDP and clicks ↶ mid-composition. It checks that the textarea keeps the half-composed text, the history is unchanged, and the flag clears after the commit. The other button-driven `lhSecApply` callers were not guarded. They go through a full re-render, which already resets the flag (`lyrics.js:154`).

### WR-01: Section-settings menu hijacked by the lyrics Ctrl/Cmd+Z handler

**Files modified:** `js/undo.js`, `tests/undo.spec.mjs`
**Commit:** cd8fdde
**Applied fix:** Removed `#sectionMenu` from `_LH_UNDO_SCOPE`, so the custom-name input uses native undo. New spec `復原：段落設定選單的名稱框不被攔` types a name, presses Ctrl+Z, and checks that the input is emptied while the lyrics history and the section type are untouched.

### WR-02: External-sync deferral does not cover the section-menu name input

**Files modified:** `js/songs.js`, `tests/songs-crosstab.spec.mjs`
**Commit:** df2ad29
**Applied fix:** Added `#sectionMenu` to the `isEditingField()` selector. New spec `多分頁：選單名稱框編輯中不重畫` has tab B typing in the name input while tab A saves. It checks that B's menu stays open and keeps the typed name.

### WR-03: Undo caret uses the previous edit's caret

**Files modified:** `js/undo.js`, `tests/undo.spec.mjs`
**Commit:** 5fff52f
**Applied fix:** `_lhHistMove` takes a `redo` flag. Undo passes no recorded caret, so `_lhHistShow` works the position out from the diff. It uses the common prefix and suffix and puts the caret at the end of the restored block. For an undone insertion that is where the edit began. Redo still uses the recorded caret. The existing `復原：只換一格` spec had encoded the buggy behaviour ("caret at the end of the previous step"). It now expects 0. It also sets the caret with `setSelectionRange(0, 0)` because the Home key scrolls instead of moving the caret on macOS, which had hidden the problem. Marked as a logic fix, so it needs a quick human check that the caret feels right when undoing deletions and replacements.

### WR-04: Undoing a section delete restores stale height and collapsed state

**Files modified:** `js/sections.js`, `js/undo.js`, `tests/undo.spec.mjs`
**Commit:** 8339d5e
**Applied fix:** `lhSecApply` re-snapshots `h.present` before `mutate`. `_lhHistMove` does the same before it pushes onto the opposite stack, so the redo-then-undo path also gets fresh values. The typing-run start was not changed. Typing undo only touches sections that still exist, and those keep their current height. New spec `復原：刪除段落後復原帶回最新的高度與收合` covers delete then undo, and redo then undo again.

### WR-05: Legacy-label inference strips any trailing roman-numeral letter run

**Files modified:** `js/sections-core.js`, `tests/sections-core.spec.mjs`
**Commit:** 4ceb60e
**Applied fix:** The suffix pattern now accepts only valid roman numerals from I to XXXIX, so `Outro C`, `Bridge L`, `Verse C`, `Chorus C`, `Verse VV` and `Verse IIII` stay as custom names. `Verse x`, `Verse XIV` and `Verse xxxix` are still treated as numbered. I did not use the reviewer's exact regex, which would have rejected XI to XIX. `sections-core.spec.mjs` got the extra cases.

## Skipped Issues

None. The Info findings (IN-01..IN-06) are out of scope for `critical_warning` and were not touched.

---

_Fixed: 2026-10-23_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
