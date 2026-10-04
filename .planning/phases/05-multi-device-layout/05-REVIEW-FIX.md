---
phase: 05-multi-device-layout
fixed_at: 2026-10-04T00:00:00Z
review_path: /home/user/Lucky-Hawaii/.planning/phases/05-multi-device-layout/05-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 5: Code Review Fix Report

**Fixed at:** 2026-10-04
**Source review:** /home/user/Lucky-Hawaii/.planning/phases/05-multi-device-layout/05-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (Critical 0, Warning 5; Info excluded by `fix_scope: critical_warning`)
- Fixed: 5
- Skipped: 0

**Verification environment:** `workflow.use_worktrees` is `false`, so all edits, commits and test runs happened in the main checkout on `gsd/v0.96-stabilize` (no worktree, no sentinel). Final full `npm test` run: 396 passed, 27 skipped, 1 failed. The failure is the known cloud-only `tests/worker-config.spec.mjs:53`, untouched. No golden or visual baselines changed.

## Fixed Issues

### WR-01: Progressive render leaks `colorClass` / `lastTarget` across cancelled renders

**Files modified:** `js/results.js`, `js/state.js`, `tests/render.spec.mjs`
**Commit:** a85a68d
**Status:** fixed: requires human verification (logic change in highlight state)
**Applied fix:** `displayResults` now resets `colorClass = ''` and `lastTarget = ''` right after `_renderEpoch++`, so a render never inherits colour state from a cancelled one. `colorClass` had never been declared anywhere (implicit global); it is now declared next to `lastTarget` in `js/state.js`. Regression test poisons both globals and asserts the re-render HTML is identical to a clean render; it fails without the fix. Golden, render and parity specs pass unchanged.

### WR-02: Keyboard detection misfires under pinch-zoom and desktop window-height resize

**Files modified:** `js/layout.js`, `tests/layout.spec.mjs`
**Commit:** 8936b9c
**Status:** fixed: requires human verification (logic change in keyboard heuristic)
**Applied fix:** `_lhKbUpdate` now also requires `visualViewport.scale <= 1.01` and (`lhIsSheetMode()` or `(pointer: coarse)`). Two new tests (pinch-zoom simulated by overriding `visualViewport.scale`; desktop window shrunk 336px with the search box focused) fail without the fix. Existing keyboard tests still pass.

### WR-03: Escape closes the bottom sheet during IME composition and when a dialog sits on top

**Files modified:** `js/panels.js`, `tests/layout.spec.mjs`
**Commit:** e4a24df
**Status:** fixed
**Applied fix:** The Escape handler now returns early on `e.isComposing` or `keyCode === 229` (Zhuyin/Pinyin composition cancel), on `e.defaultPrevented`, and when any of the settings/about/hashtag/feedback overlays has `.show`. New test covers composing Esc, keyCode 229, dialog-open Esc, and that a plain Esc still collapses the sheet; it fails without the fix.

### WR-04: Short-landscape rule hides theme toggle, zoom controls and batch buttons

**Files modified:** `css/responsive.css`, `tests/layout.spec.mjs`
**Commit:** 81638de
**Status:** fixed: requires human verification (layout judgment call, see below)
**Applied fix:** Removed `.header, .mobile-batch-area { display: none !important }` from the `max-width: 900px and max-height: 600px` media rule. Those two are now hidden only by the existing `html.kb-short` rule (keyboard open and visible height < 600), matching 05-07's intent. Simply removing the rule left the results area at about 50px in 844x390 landscape (first card pushed off-screen, breaking the existing first-card test), so the landscape rule now also hides only the decorative `.header h1` and `.header p` and tightens vertical padding on `.header`, `.search-section` and `.results-section`. Result: a slim toolbar row (zoom + theme) stays, batch buttons stay, and the results area is about 111px with the first card row visible. Save/Load is already hidden at <= 900 and lives in settings, and the About dialog has its own entry in settings, so nothing becomes unreachable. New test checks the header is displayed, the theme/zoom/batch controls are really clickable in landscape, and that the theme and zoom actually change; it fails without the fix. Visual baselines unaffected (no landscape screenshots).

### WR-05: Exception inside a deferred render slice leaves results stuck in busy state

**Files modified:** `js/results.js`, `tests/render.spec.mjs`
**Commit:** d263258
**Status:** fixed
**Applied fix:** Added `safeSlice()` wrapping every `slice()` call (first batch, `step`, `flushAll`, scroll-restore loop). On a throw it logs `console.error('[好韻器] 字卡分批渲染失敗…')`, abandons the remaining jobs and lets `finish()` run (status row removed, `aria-busy` cleared, live region and `lh:render-done` fire). The inner loop in `slice` also flushes already-built cards in a `finally`, so cards made before the throw are kept. Test overrides `createCharCard` to throw after 100 cards and asserts state `done`, no status row, exactly 100 cards, and the logged error; it fails without the fix (hang in `settle`).

## Skipped Issues

None.

## Judgment Calls (also logged in `.planning/TEST-CHECKLIST.md` as 05-RF-5 to 05-RF-8, committed 806c5fe)

- WR-04: conservative option taken (header/batch area hide only while the keyboard is open) plus a compact landscape header instead of a redesign.
- WR-01: chose deterministic output over bit-exact legacy carry-over (the reviewer's alternative of snapshot/restore was not used); goldens still match.
- WR-02: narrow-window (<= 900) desktop browsers with a mouse still count as sheet mode, so a very tall shrink there can still be read as a keyboard.
- WR-05: a first-batch error is now logged instead of thrown out of `displayResults`.

Info findings (IN-01 to IN-03) were out of scope and not touched.

---

_Fixed: 2026-10-04_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
