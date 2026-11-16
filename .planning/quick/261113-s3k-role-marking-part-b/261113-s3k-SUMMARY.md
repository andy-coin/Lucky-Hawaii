---
phase: quick-261113-s3k
plan: 01
subsystem: lyrics-editor / role-marking
tags: [roles, export, print, ui-panel, version-bump]
requires: [quick-261113-r05]
provides:
  - lhMarksParts / lhMarksTagText (pure, js/sections-core.js)
  - "[角色名] tags in TXT / Markdown / copy; coloured span.print-role in PDF print"
  - "#roleMenu role manager panel (add / rename / recolour / two-press delete)"
  - legacy 並排角色欄 menu entry disabled (data still works)
  - version 0.96.31
affects: [js/song-io.js, js/roles.js, js/sections.js, css/panels.css, css/print.css, index.html]
key-files:
  modified:
    - js/sections-core.js
    - js/song-io.js
    - css/print.css
    - js/roles.js
    - js/rhyme-map.js
    - js/sections.js
    - css/panels.css
    - index.html
    - tests/roles-core.spec.mjs
    - tests/roles.spec.mjs
    - tests/rhyme-map-ui.spec.mjs
    - tests/sections-cols.spec.mjs
decisions:
  - "Print colour = role colour 60% + black 40% (80% gives 3.64 contrast for default yellow; 60% gives >= 4.5 for all 8 defaults, locked by a test)"
  - "New role from the selection menu shows a toast instead of auto-opening the panel"
  - "Panel is not refilled passively; it refills on open/add/delete, lhMapCloseAll closes it on every re-render path"
  - "Print spans carry data-rl (role index) and reuse the global [data-rl] -> --rl-c rules; song-io.js never touches a colour string"
metrics:
  tasks: 3
  commits: 3
  files_changed: 12
status: complete
commits: 3
plan_head_before: 6c79039
plan_head_after: 5d64a21
actuals:
  tasks: 3
  commits: 3
---

# Phase quick-261113-s3k Plan 01: Role marking Part B Summary

Part B of role marking: a toolbar "角色 ▾" panel to add/rename/recolour/delete roles (delete also clears that role's marks everywhere), "[角色名]" tags in TXT/Markdown/copy and coloured tags in PDF print, the old 並排角色欄 menu entry commented out (old data still reads, edits and exports), version 0.96.31.

## Commits (pushed to origin/gsd/v0.96-stabilize)

| Task | Commit | Files |
|------|--------|-------|
| 1 export/print tags | 24159aa | js/sections-core.js, js/song-io.js, css/print.css, tests/roles-core.spec.mjs, tests/roles.spec.mjs |
| 2 role panel | 6eefbf0 | js/roles.js, js/rhyme-map.js, index.html, css/panels.css, tests/roles.spec.mjs, tests/rhyme-map-ui.spec.mjs |
| 3 disable column entry + version | 5d64a21 | js/sections.js, tests/sections-cols.spec.mjs, index.html, js/rhyme-map.js |

Visual baselines: not regenerated. The three `lyrics` darwin screenshots stayed within maxDiffPixelRatio, so no PNG changed.

## What was built

- `lhMarksParts(text, marks, roles)` returns `[{text, k, head}]` (parts join back to the original text, no empty part). A tag is placed for the first role in a section, on a role change, and after unmarked non-whitespace text; whitespace-only gaps do not repeat the tag; leading whitespace of a marked run stays before the tag; unknown role ids count as unmarked. `lhMarksTagText` joins with "[名]".
- `songExportSections` returns `{label, text, parts}`; only sections with marks and no legacy cols get parts, so legacy column sections and unmarked songs export byte-for-byte as before. `printRoleText` builds `p.print-text` from `span.print-role` / bold `span.print-role-tag` (data-rl = role index), textContent / createTextNode only.
- `css/print.css`: `color-mix(in srgb, var(--rl-c) 60%, #000)` with specificity (1,2,1) over the black rule.
- `js/roles.js` panel: `#roleMenu` (role=dialog) with per-role dot, name input (empty -> "角色 n"), 8 swatches plus `<input type=color>`, two-press delete (3 s auto-revert, blur disarm), "＋ 新角色" aria-disabled at 8 with toast. `lhRoleDelete` replaces `song.roles`, runs `lhSongRolesFix`, flushes, re-snaps the undo baseline AND clears the redo stack (orchestrator hardening), refreshes colour vars and repaints all mirrors. Esc / outside pointerdown / focusout / second click close it; `lhMapCloseAll` closes it; opening it closes the other overlays; `lhRoleBusy` includes it; resize / visualViewport re-clamps in place.
- `css/panels.css`: `.lyrics-tools` gets `flex-wrap: wrap`; `.role-row`, `.role-row-head`, `.role-del[data-armed]`, `.role-add`.
- `js/sections.js`: the colAdd button, its click listener, colBlock, the three lhSecMenuSync lines and the lhSecOpenMenu hidden toggle are commented out with a Chinese note, not deleted. In-column ＋/× handlers and all column build/merge code are untouched.
- Version 0.96.31 in 41 `?v=` tags, the info panel and the en-rhyme fetch; the two YouTube `?v=` links untouched.

## Verification

- Task 1 verify set: 119 passed. Task 2 verify set (roles, roles-core, rhyme-map-ui, layout, line-audit, style, move-selection, tour, visual, minus the base-failing pixel-mirror title): 285 passed. Task 3 verify set: 60 passed.
- Full suite (`npx playwright test --reporter=list`, `✘` per-test lines confirmed first): 1176 passed, 29 skipped, 34 failed. The 34 failing titles are exactly the 34-title allowed list (`comm -23` empty, and `comm -13` empty so the sets are identical): golden.spec (31), rhyme-map-ui 鏡像對齊：與文字框逐像素相同, scan catch, sections-audit 沒有新增動畫. No baseline worktree was needed because no failure fell outside the list.
- Replacement guards (added lines since 6c79039): no `@keyframes` / `transition` / `animation`, no `catch` in js. Clean.
- Panel eyeballed on desktop and a 390-wide phone (screenshots, not committed): rows, swatches and the armed delete state look right and the panel sits fully inside the viewport.

## Deviations from Plan

Four design deviations (planned, recorded in the plan's objective and in handoff.md): print colour 60%+40% black, toast instead of auto-opening the panel, no passive panel refill, `data-rl` reuse for print colour.

### Auto-fixed / adjusted during execution

**1. [Rule 1 - test expectation] Touch target for "角色 ▾" is the project's `--hit`, not 44**
- **Found during:** Task 2 (phone test).
- **Issue:** The plan asked for 44x44 on phones. The project sets `--hit: 36px` on phones (32 on tablets; Andy decided 44 takes too much room) and `.rhyme-menu-btn` already follows it; the button measured 67.6x36.
- **Fix:** the test asserts `hitMin(page)` (the same floor the existing layout audit uses) and keeps the no-overlap and no-overflow checks. No CSS change, the button follows the same rule as "韻腳 ▾".
- **Files:** tests/roles.spec.mjs. **Commit:** 6eefbf0.

**2. [Rule 3 - test harness] Phone 150% zoom test order**
- `setScale` needs the search tab (the lyrics sheet backdrop intercepts the zoom buttons), so the test zooms first and then switches to the lyrics tab. Tapping the aria-disabled "＋ 新角色" uses `force: true`, like the existing selection-menu test.
- **Files:** tests/roles.spec.mjs. **Commit:** 6eefbf0.

**3. [Orchestrator hardening] Redo stack cleared on role delete**
- `lhRoleDelete` also does `h.future.length = 0` and `lhHistSyncButtons()` so a redo cannot re-apply pre-delete snapshots; a test covers it. **Commit:** 6eefbf0.

**4. [Rule 2 - correctness] Panel close commits an empty name**
- Hiding the panel while a name input is empty (Esc, outside click) now restores "角色 n" in `lhRolePanelClose`, since a blur-triggered change event is not guaranteed when the element is hidden. **Commit:** 6eefbf0.

## Known limits (also in handoff.md)

- Role add/rename/recolour/delete are outside undo history (Part A limit, kept by instruction). Pre-delete undo steps can still restore invisible marks of the deleted role; they are not painted or exported and `lhSongRolesFix` drops them on the next load (`ponytail:` comment at `lhRoleDelete`).
- Legacy 並排欄 sections export "【角色】" lines without [name] tags; in-column ＋/× stay reachable (only the section-menu entry is disabled).
- `-linux` visual baselines remain Andy's to-do.

## Known Stubs

None.

## Threat Flags

None. Role names only reach the DOM via `.value`, `textContent` and `createTextNode`; colours are lowercased and checked against `LH_SEC_COLOR_RE` before entering the model, and print spans carry only a numeric `data-rl`.

## Self-Check: PASSED

- Commits 24159aa, 6eefbf0, 5d64a21 exist and are on origin/gsd/v0.96-stabilize.
- All 12 listed files are modified as described; handoff.md is updated and left unstaged; SUMMARY not committed (per instruction).
