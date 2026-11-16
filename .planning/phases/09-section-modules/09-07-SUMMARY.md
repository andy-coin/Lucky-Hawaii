---
phase: 09-section-modules
plan: 07
subsystem: section-resize
tags: [resize, pointer-events, touch, keyboard, a11y, rem, playwright]
status: complete
requires:
  - phase: 09-section-modules
    provides: "09-06 pointer-session pattern, lhSecAbortInteractions, lhSecEl, lhSecRefreshMeta, tests/drag-lib.mjs; 09-01 lhSecFields (validated height 4-60, one decimal)"
provides:
  - "js/sections.js: lhSecSetHeight(secEl, rem | null), lhSecResetHeight, lhSecSaveHeight, lhSecNowRem, lhSecBarNow, lhSecResizeLabel, private resize session (_lhResize, lhSecResize*), dblclick / double-tap / keyboard handlers, lhSecAbortInteractions now also ends a resize"
  - "DOM / CSS: div.section-resize[role=separator] at the bottom of every section, [data-h] overrides, body.is-section-resizing"
  - "tests/layout-lib.mjs: TOUCH_SELECTOR audits the bar"
affects: [09-08, 09-09, 09-10 verification (UAT: D-11 touch cost)]
actuals:
  tokens: 14000
  tasks: 2
  commits: 2
plan_head_before: a6fe7735099ad8968d88aae2025ee3b181c10f80
plan_head_after: cf59eee4765d42cbd506f57abaa82cd0446a30a9
commits: 2
key-files:
  created: []
  modified: [js/sections.js, js/lyrics.js, css/panels.css, tests/sections-drag.spec.mjs, tests/layout-lib.mjs, tests/layout.spec.mjs, tests/visual.spec.mjs-snapshots/desktop-lyrics-darwin.png, tests/visual.spec.mjs-snapshots/phone-lyrics-darwin.png, tests/visual.spec.mjs-snapshots/tablet-lyrics-darwin.png]
key-decisions:
  - "Height is written straight to the model (s.height) and saved with markDirty + flushSongs, never through lhSecApply, so no history step exists; undo already keeps each section's current height (js/undo.js)"
  - "Only sections with data-h opt out of the Phase 5 floors; the extra .lyrics-area class in the selector outranks the data-index and min-height rules, so unsized sections keep their old layout"
  - "A press that moves less than 3px is a click: no write, no height change; this is what lets two quick taps be recognised as a double tap"
  - "aria-valuenow is the stored height when there is one, else the measured textarea height (refreshed on pointerdown and focusin), clamped to 4-60"
requirements-completed: []
duration: ~30 min
completed: 2026-10-23
coverage:
  - id: R1
    description: "Dragging the bar with mouse changes the textarea by the pointer delta, saved on release (no flush), survives reload, one decimal, not an undo step"
    requirement: EDIT-02
    verification:
      - { kind: e2e, ref: "tests/sections-drag.spec.mjs#高度：拖拉桿改高度", status: pass }
    human_judgment: false
  - id: R2
    description: "Finger drag on the bar (CDP touch) resizes and saves"
    requirement: EDIT-02
    verification:
      - { kind: e2e, ref: "tests/sections-drag.spec.mjs#高度：手指拉", status: pass }
    human_judgment: false
  - id: R3
    description: "Reset to automatic height by double-click, double tap (300 ms / 20 px) and Home; a slow second tap does not reset"
    requirement: EDIT-02
    verification:
      - { kind: e2e, ref: "tests/sections-drag.spec.mjs#高度：雙擊回自動", status: pass }
      - { kind: e2e, ref: "tests/sections-drag.spec.mjs#高度：連點兩下回自動", status: pass }
      - { kind: e2e, ref: "tests/sections-drag.spec.mjs#高度：連點兩下太慢不算", status: pass }
    human_judgment: false
  - id: R4
    description: "Keyboard: Arrow 1rem, Shift+Arrow 4rem, stops at 4, aria-valuenow follows, Home resets, no history step"
    requirement: EDIT-02
    verification:
      - { kind: e2e, ref: "tests/sections-drag.spec.mjs#高度：鍵盤", status: pass }
    human_judgment: false
  - id: R5
    description: "Clamp 4rem to 60rem, hidden when collapsed (height kept), scales with --ui-scale (1.5 x at 150%)"
    requirement: EDIT-02
    verification:
      - { kind: e2e, ref: "tests/sections-drag.spec.mjs#高度：上下限", status: pass }
      - { kind: e2e, ref: "tests/sections-drag.spec.mjs#高度：收合時看不到", status: pass }
      - { kind: e2e, ref: "tests/sections-drag.spec.mjs#高度：縮放跟著變", status: pass }
    human_judgment: false
  - id: R6
    description: "A render mid-gesture ends the resize and restores the stored height, nothing saved"
    requirement: EDIT-02
    verification:
      - { kind: e2e, ref: "tests/sections-drag.spec.mjs#高度：拖曳中被中止", status: pass }
    human_judgment: false
  - id: R7
    description: "Bar hit box is 44px tall on touch with <= 4px neighbour overlap; phone textareas still >= 112px"
    requirement: EDIT-02
    verification:
      - { kind: e2e, ref: "tests/layout.spec.mjs#觸控：手機平板每個按鈕至少 44px（7 種畫面）", status: pass }
      - { kind: e2e, ref: "tests/layout.spec.mjs#觸控：相鄰按鈕的點擊範圍重疊不超過 4px", status: pass }
    human_judgment: false
  - id: R8
    description: "Real finger feel and the cost of a 44px bar under every section on a physical phone / tablet"
    requirement: EDIT-02
    verification: []
    human_judgment: true
    rationale: "D-11 accepted the layout cost; only a person can judge whether it feels right on a real device"
---

# Phase 9 Plan 07: Section height by bottom bar Summary

Every expanded section now ends with a resize bar (mouse, finger, arrow keys) that sets its textarea height in rem, saves it with the song, resets to automatic by double-click / double-tap / Home, and stays out of undo.

## What was built

- **js/lyrics.js:** each section gets `div.section-resize` (role separator, horizontal, tabindex 0, aria-label 「調整「{名稱}」高度（雙擊回到自動高度）」, valuemin 4, valuemax 60) after the body; a stored height is applied with `lhSecSetHeight`.
- **js/sections.js (+180 lines):** `lhSecSetHeight(secEl, rem | null)` clamps to 4 to 60, rounds to one decimal and writes `data-h` and `--sec-h` only through `style.setProperty(value + 'rem')` (T-09-15); `null` removes both. Resize session on a delegated `pointerdown`: pointer capture in try / catch with `lhWarn`, ends any section drag first, 3px threshold, live height from `(startPx + dy) / rootPx`, pointerup writes `s.height` + `markDirty` + `flushSongs` (no `lhSecApply`, so no history), cancel / lostpointercapture / Esc / `lhSecAbortInteractions` restore the pre-gesture height and save nothing. dblclick and a second non-mouse pointerup within 300 ms and 20 px reset; keydown on the bar: Arrow +-1rem, Shift +-4rem, Home reset (ignored with Alt / Ctrl / Meta or while composing). `lhSecRefreshMeta` keeps the bar's label in step with renames.
- **css/panels.css:** `.section-resize` (0.75rem, `--container-bg`, 1px `--border` top, centered 2.5 x 0.25rem grip, `ns-resize`, `touch-action: none`), grip darkens on focus-visible / resizing / fine-pointer hover, hidden when the section is collapsed, `var(--hit)` tall on coarse / <= 900, and the `.lyrics-area .lyrics-section[data-h]:not(.collapsed)` overrides (flex 0 0 auto, min-height 0, textarea `height: var(--sec-h)`). No new color literal, `@keyframes` or `transition`. css/responsive.css needed no change (the specificity of the override already beats its floors).
- **tests:** 10 height specs in tests/sections-drag.spec.mjs; `[role="separator"]:not(.word-ctx-divider)` in `TOUCH_SELECTOR`; `div.section-resize` in the 歌詞開著 mustSee list.

## Task commits

| Task | Commit | Summary |
|------|--------|---------|
| 1 (tracer) | d89498a | bar, mouse session, `lhSecSetHeight`, CSS overrides, RED-first spec, lyrics -darwin baselines |
| 2 | cf59eee | dblclick / double tap / Home, arrow keys, 9 more specs, audit selector and mustSee |

Tracer gate: `<verify>` is automated-only and `human_verify_mode` is end-of-phase, so the whole Task 1 verify set (sections-drag, undo, sections-ui, style, scan, layout, visual) was re-run end to end before Task 2: green.

## Verification

Final run (sections-drag, sections-ui, undo, style, scan, smoke, visual): 110 passed, 0 failed; layout: 79 passed; `-g 高度`: 10 passed. Acceptance greps: `function lhSecSetHeight` = 1 in js/sections.js; `section-resize` in js/lyrics.js >= 1; `role="separator"` in layout-lib.mjs = 1; `div.section-resize` in layout.spec.mjs = 1. package.json and package-lock.json unchanged.

## Deviations from Plan

**1. [Process] Task 2 was not fully RED-first.** The double-tap logic lives in the same pointerup handler as the drag, so it shipped with the tracer and 「連點兩下回自動」 / 「太慢不算」 passed on first run. The dblclick and keyboard specs did fail first (2 failed, then 10 passed after the handlers were added).

**2. [Rule 1 - Bug] A drop made the whole list jump one section.**
- **Found during:** Task 1 verify (排序：手指不會讓列表在指頭下捲動).
- **Issue:** with the 44px bar the sections are taller, a partly visible section was the browser's scroll anchor, and `insertBefore` in `lhSecMoveDom` made `scrollTop` jump by one section (618 to 827). Pre-existing latent bug, exposed by the layout change.
- **Fix:** `lhSecMoveDom` saves and restores the scroller's `scrollTop` around the insert. **Files:** js/sections.js. **Commit:** d89498a.

**3. [Rule 1 - Bug, test] The finger-scroll spec hard-coded geometry.** It scrolled to 300 and dragged 110px; with the taller sections no handle fit that window. It now scrolls the 5th handle 230px below the area top and drags into the upper part (45%) of the previous section. **Commit:** d89498a.

**4. [Minor] Audit selector.** `[role="separator"]` alone would also pull in `.word-ctx-divider` (index.html:242, a menu divider, not a control), so the selector is `[role="separator"]:not(.word-ctx-divider)`. The bar is the only other separator.

**5. [Minor] No css/responsive.css change.** Listed in files_modified, but the `.lyrics-area .lyrics-section[data-h]` selector (specificity 0,3,0 or more) beats the <= 900 floors regardless of file order, and the touch bar height sits in the existing coarse block in css/panels.css next to `.section-handle`.

**Total deviations:** 5 (1 process, 1 real bug fix, 1 test fix, 2 minor). **Impact:** none on the contract.

## Visual baselines

`desktop-lyrics-darwin.png`, `phone-lyrics-darwin.png`, `tablet-lyrics-darwin.png` refreshed (the 1% pixel tolerance had kept the old ones passing, so the old files were deleted and regenerated) after viewing them: a thin bar with a grip under the section on desktop, a 44px bar on phone; nothing else moved. **-linux baselines untouched: regenerating `*-lyrics-linux.png` is an Andy to-do** (they still pass within tolerance but do not show the bar).

## D-11 touch cost (for UAT)

On coarse / <= 900 every expanded section grows by `var(--hit)` (44px). Phone: the first section is now bar 44 + header 44 + a 112px minimum textarea (the first section's 12rem flex basis is no longer enough, the textarea shrank 145 to 112 in the tablet fixture); a 12-section list is about 484px taller (2007 to 2491px scrollHeight at 820 wide). Andy should judge on a real device whether a 44px bar is acceptable or whether a smaller visual bar with an invisible hit area is preferred.

## Authentication Gates

None.

## Known Stubs

None.

## Threat Flags

None. T-09-15 mitigated (only finite numbers clamped to 4 to 60, written as `value + 'rem'` through `style.setProperty`; imported heights already pass `lhSecFields`; no cssText / setAttribute('style')); T-09-SC: no package installed, package.json and package-lock.json unchanged. Prohibition (no undo step for height, undo never changes height) covered by 拖拉桿改高度, 鍵盤, 雙擊回自動, 手指拉 (undo button state unchanged, Ctrl+Z leaves height).

## Process note

One `git stash` / `git stash pop` pair was run once mid-task to compare against HEAD (before the tree-wide rule against it was applied); the unrelated uncommitted files were restored and nothing was lost.

## Next Phase Readiness

Ready for 09-08. Open item for 09-10 UAT: D-11 44px bar feel on a real phone.

## Self-Check: PASSED

Modified files exist; commits d89498a and cf59eee found in git log; all acceptance greps pass; final verification green.
