---
phase: 09-section-modules
plan: 08
subsystem: section-settings-popover
tags: [popover, color, long-press, ime, a11y, contrast, touch, keyboard, playwright]
status: complete
requires:
  - phase: 09-section-modules
    provides: "09-01 lhSecFields (validated type / custom / color), 09-02 type button + lhSecApply, 09-04 history (undo scope already lists #sectionMenu), 09-05 lhSecRemove, 09-06 lhSecMoveBy / lhSecAbortInteractions / drag-lib, 09-07 resize session"
provides:
  - "js/sections.js: LH_SEC_COLORS, lhSecApplyColor, lhSecOpenMenu(secEl, x, y, byKeyboard), lhSecCloseMenu(commitName), lhSecMenuBuild / Sync / Color / Type / Name, touch long-press (500 ms / 10 px), ContextMenu / Shift+F10, first-use hint, viewport re-clamp"
  - "DOM: #sectionMenu.word-ctx-menu.section-menu[role=dialog] built once, appended to body"
  - "CSS: colored bar + 14% tint, .section-menu blocks, .swatch, .type-row, .section-name-input, .section-menu-btn, .is-pressing, coarse 44px rules"
  - "tests: 12 popover specs in tests/sections-ui.spec.mjs, custom-name IME spec, layout touch state 段落設定開著"
affects: [09-09, 09-10 verification (UAT: real-device long-press, native color picker, soft keyboard)]
actuals:
  tokens: 14400
  tasks: 3
  commits: 3
plan_head_before: cf59eee4765d42cbd506f57abaa82cd0446a30a9
plan_head_after: 2dbfeb095e30f39fa3160fcbc66913721189bea7
commits: 3
key-files:
  created: []
  modified: [js/sections.js, js/lyrics.js, css/panels.css, css/responsive.css, tests/sections-ui.spec.mjs, tests/songs-ime.spec.mjs, tests/layout.spec.mjs]
key-decisions:
  - "Menu is non-modal, built once with createElement / textContent; every change goes through lhSecApply (one undo step, none when the value is unchanged); only #rrggbb lower-case ever reaches style.setProperty / dataset"
  - "Native color input: input event previews on the section element only, change commits once; closing without change snaps the screen back to the model color"
  - "Pending custom-name text is saved when the user clicks outside (lhSecCloseMenu(true)), but not when a re-render closes the menu, so undo can never add a stray step"
  - "Long press = pointerdown timer (500 ms, 10 px slop); contextmenu during a touch press is only preventDefault'ed so Android's own long-press event cannot open the menu twice; the next click on that button is swallowed by a capture listener"
  - "Shift+F10 / ContextMenu are handled in our own keydown (Mac Chrome does not synthesize contextmenu for them); a contextmenu at (0,0) is also treated as keyboard"
requirements-completed: []
duration: ~55 min
completed: 2026-10-23
coverage:
  - id: R1
    description: "Right-click a section name opens 段落設定 at the pointer; a swatch colors the section (0.25rem bar + tint), saved, undo / redo, survives reload"
    requirement: EDIT-06
    verification:
      - { kind: e2e, ref: "tests/sections-ui.spec.mjs#顏色：右鍵選色", status: pass }
    human_judgment: false
  - id: R2
    description: "Custom color preview never writes the model or history; change commits one step; non-hex values never stored; cancel restores"
    requirement: EDIT-06
    verification:
      - { kind: e2e, ref: "tests/sections-ui.spec.mjs#顏色：自訂色預覽與確定", status: pass }
      - { kind: e2e, ref: "tests/sections-ui.spec.mjs#顏色：無顏色", status: pass }
    human_judgment: false
  - id: R3
    description: "Touch long-press opens the menu under the button without cycling the type; 100 ms tap still cycles; > 10 px movement cancels"
    requirement: EDIT-06
    verification:
      - { kind: e2e, ref: "tests/sections-ui.spec.mjs#設定：長按開啟不循環", status: pass }
    human_judgment: false
  - id: R4
    description: "Keyboard open (Shift+F10, ContextMenu) focuses the current type row; Esc returns focus to the button and does not close the phone sheet"
    requirement: EDIT-06
    verification:
      - { kind: e2e, ref: "tests/sections-ui.spec.mjs#設定：鍵盤開啟", status: pass }
    human_judgment: false
  - id: R5
    description: "Direct type radiogroup, custom name (Enter / blur commit, Esc revert, 40 chars, whitespace = Custom, kept across cycling, no focus on touch), 上移 / 下移 with disabled ends"
    requirement: EDIT-05
    verification:
      - { kind: e2e, ref: "tests/sections-ui.spec.mjs#設定：直接選類型", status: pass }
      - { kind: e2e, ref: "tests/sections-ui.spec.mjs#設定：自訂名稱", status: pass }
      - { kind: e2e, ref: "tests/sections-ui.spec.mjs#設定：上移下移", status: pass }
    human_judgment: false
  - id: R6
    description: "Custom-name Enter / Esc during IME composition do nothing; Enter after composition commits"
    requirement: EDIT-03
    verification:
      - { kind: e2e, ref: "tests/songs-ime.spec.mjs#組字：自訂名稱組字中按 Enter 不送出", status: pass }
    human_judgment: false
  - id: R7
    description: "Every close path (outside, 關閉設定, Esc, delete, switch song, drag start, abort) closes; color-input focus does not; opening closes the export menu; first-use hint once per page"
    requirement: EDIT-06
    verification:
      - { kind: e2e, ref: "tests/sections-ui.spec.mjs#設定：關閉方式", status: pass }
      - { kind: e2e, ref: "tests/sections-ui.spec.mjs#設定：第一次提示", status: pass }
    human_judgment: false
  - id: R8
    description: "Text contrast >= 4.5 on the 14% tint for 8 presets + 5 extreme colors in light, dark and custom themes"
    requirement: EDIT-06
    verification:
      - { kind: e2e, ref: "tests/sections-ui.spec.mjs#顏色：三種主題對比", status: pass }
    human_judgment: false
  - id: R9
    description: "Menu fits at 390 px x 150%, 844x390 and 150% landscape, scrolls inside, every control clickable; >= 44x44 and input >= 16px at 50 / 100 / 150%; soft keyboard keeps the name input visible; names render as text"
    requirement: EDIT-06
    verification:
      - { kind: e2e, ref: "tests/sections-ui.spec.mjs#設定：選單不出界", status: pass }
      - { kind: e2e, ref: "tests/sections-ui.spec.mjs#設定：觸控點擊範圍與輸入框 16px", status: pass }
      - { kind: e2e, ref: "tests/sections-ui.spec.mjs#設定：鍵盤出現時看得到", status: pass }
      - { kind: e2e, ref: "tests/sections-ui.spec.mjs#設定：名稱只當純文字", status: pass }
      - { kind: e2e, ref: "tests/layout.spec.mjs#觸控：手機平板每個按鈕至少 44px（7 種畫面）", status: pass }
    human_judgment: false
  - id: R10
    description: "Feel of long-press, native color picker and soft keyboard on real iOS / Android devices"
    requirement: EDIT-06
    verification: []
    human_judgment: true
    rationale: "Playwright's CDP touch and a resized window only approximate the real gesture recognizer, vibrate, Android's own long-press contextmenu, the iOS color picker and the iOS visual-viewport-only keyboard"
---

# Phase 9 Plan 08: Section settings popover Summary

Right-click, touch long-press or Shift+F10 on a section name opens a non-modal 段落設定 popover with 8 preset colors plus a native picker (left bar + 14% tint), a direct type radiogroup, a Custom name field that respects IME composition, and 上移 / 下移, every change one undo step.

## What was built

- **js/sections.js (+365 lines):** `LH_SEC_COLORS` (the only place the 8 hex values live), `lhSecApplyColor` (called from `lhSecRefreshMeta` and `renderLyricsSections`; accepts only `^#[0-9a-f]{6}$`), the popover built once with `createElement` / `textContent` (title, 顏色, 類型, 自訂名稱, 位置, 關閉設定), `lhSecOpenMenu` / `lhSecCloseMenu` / `lhSecMenuSync`, and `_lhMenuSet` so each control is one `lhSecApply` call that records nothing when the value is unchanged. `lhSecAbortInteractions` now closes the menu, so every re-render, song switch and breakpoint change closes it; drag / resize start close it explicitly. First type cycle in a page shows the 3000 ms hint (module flag, nothing stored).
- **css/panels.css (+125):** `.lyrics-section[data-color]::before` bar, tinted `.section-type` under `@supports (color-mix)`, `.section-menu` blocks, `.swatch`, `.type-row`, `.section-name-input`, `.section-menu-btn`, `.is-pressing`. No new hex, `@keyframes` or `transition`.
- **css/responsive.css:** `.section-name-input` in the 16px input-floor list; coarse / <= 900 block gives swatches, color input, type rows, buttons and the input `var(--hit)` and a `minmax(var(--hit), 1fr)` swatch grid.
- **tests:** 12 popover specs, 1 IME spec, 1 layout touch state (段落設定開著: swatch, color input, type-row, name input, 上移 / 下移, 關閉設定, 無顏色 must be scanned).

## Task commits

| Task | Commit | Summary |
|------|--------|---------|
| 1 (tracer) | 5ef0b76 | menu skeleton, swatches, native color input, bar + tint, RED-first spec 顏色：右鍵選色 |
| 2 | fbb3fa9 | long-press, keyboard open, type radiogroup, custom name + IME guard, 上移 / 下移, close paths, hint; 9 RED-first specs + IME spec |
| 3 | 2dbfeb0 | contrast / fit / 44 px / 16 px / keyboard / plain-text specs, layout touch state, viewport re-clamp |

Tracer gate: `<verify>` is automated-only and `human_verify_mode` is end-of-phase, so the Task 1 verify set was re-run before Task 2: all green except the pre-existing undo failure below.

## Contrast results (UI-SPEC §9.3, 13 colors x 3 themes = 39 checks, all >= 4.5)

| Theme | Lowest | Notes |
|-------|--------|-------|
| Light | #000000 = 8.30 | presets all well above |
| Dark | #ffffff = 4.69 | matches the UI-SPEC D-03 figure; next #ffff00 4.88, #00ff00 5.30, lowest preset #d69e2e 5.78 |
| Custom preset (#fff7e6 / #1a202c / #2b6cb0) | #000000 = 11.29 | |

The spec mixes 14% of the color into `--card-bg` itself and checks the browser's computed background agrees within 2/255.

## Verification

- Plan-level: sections-ui, songs-ime, undo, sections-drag, songs-model, style, scan, smoke, visual = 162 passed, 0 failed; layout = 79 passed; songs-*, render, storage, error-visibility, save-failure, split-tags, ai-fill, golden = 296 passed.
- Acceptance: `-g "設定|顏色"` 10 passed; `-g 自訂名稱` (songs-ime) 1 passed; `grep -c section-name-input css/responsive.css` = 2; no `#e05d5d` / `#48a868` in any CSS file, `#48a868` once in js/sections.js; `grep -c 段落設定開著 tests/layout.spec.mjs` = 1; style 「視覺：沒有新的顏色常數」 passes.
- No visual baseline changed (default sections have no color); no `-darwin` or `-linux` snapshot touched. package.json / package-lock.json unchanged.

## Deviations from Plan

**1. [Rule 2 - Missing critical] Popover re-clamps when the visible area changes.**
- **Found during:** Task 3 (held-out keyboard-safe truth, RED first: input rect `y 696..740` in a 508 px visible area).
- **Issue:** `lhPlaceMenu` only runs at open, so a soft keyboard hid the name input.
- **Fix:** `_lhMenuReclamp` (two rAFs after window / visualViewport resize or scroll so layout.js updates `--app-h` first) calls `lhPlaceMenu` again and scrolls the focused control into view. **Files:** js/sections.js. **Commit:** 2dbfeb0.

**2. [Rule 2 - Missing critical] Touch / keyboard placement flips above the button when it does not fit below.**
- **Found during:** Task 2 (tablet long-press spec: the clamped menu covered the button, so the confirming tap would hit the menu).
- **Fix:** `_lhMenuUnder` flips above like `toggleExportMenu`; if neither fits it stays clamped and scrolls inside. **Commit:** fbb3fa9.

**3. [Rule 2] Keyboard open is handled in our own keydown.** Mac Chrome does not synthesize `contextmenu` for Shift+F10 / ContextMenu, so relying on the native event would fail on Andy's machine. A `contextmenu` at (0,0) is also treated as keyboard. **Commit:** fbb3fa9.

**4. [Rule 2] `lhSecMenuColor` rejects non-`#rrggbb` input before `lhSecApply`.** Otherwise `'#abc'` would pass `lhSecFields` (dropped to `''`) but still record an empty undo step. **Commit:** fbb3fa9.

**5. [Minor] Tab wraps inside the menu** (UI-SPEC D-05, not in the plan's must_haves); arrow keys in the 2-column grid all move in DOM order (Right / Down next, Left / Up previous, wrapping).

**6. [Minor, test] 選單不出界 opens the menu with `lhSecOpenMenu` at the bottom-right corner instead of a real right-click.** At phone 150% the last section header sits under the mobile tab bar (Playwright refused the click: `mtab-search intercepts pointer events`), a layout limit of the existing sheet, not of this plan. The test still exercises the clamping in the worst corner and clicks every control for real.

**7. [Minor] Pending custom-name text is saved on outside pointerdown only.** Re-render closes (undo, song switch) deliberately do not commit, so they cannot add a step after an undo.

**Total deviations:** 7 (2 missing-critical fixes found by RED tests, 2 further Rule 2 additions, 3 minor). **Impact:** none on the contract.

## Deferred / pre-existing

- `tests/undo.spec.mjs` 「復原：只換一格」 fails when run alone (`-g`) at HEAD cf59eee before any 09-08 change (scrollTop 3114 vs 3153, verified by reverting js/ and css/ to HEAD), but passes inside the full file / suites. Order-dependent and out of scope; logged in `.planning/phases/09-section-modules/deferred-items.md`.

## UAT for real devices (iOS / Android)

1. Long-press a section name 500 ms: menu opens under it, button darkens while held, phone vibrates (Android only; iOS has no `navigator.vibrate`), releasing does not cycle the type. A 100 ms tap still cycles. Android must not show its own long-press menu.
2. Tap a swatch, then drag inside the native color picker: the section follows live, only one ↶ step appears after the picker closes. On iOS check that closing the picker with the menu open keeps the menu.
3. Choose Custom on a phone: no keyboard until the name field is tapped; with the keyboard up the field and menu stay fully visible (iOS shrinks only the visual viewport, which the re-clamp relies on).
4. Zhuyin typing in the name field: Enter while a candidate is open must only pick the character.
5. Desktop: right-click, Shift+F10, ContextMenu key, Esc returns focus to the name button.

## Authentication Gates

None.

## Known Stubs

None.

## Threat Flags

None. T-09-16 mitigated (`lhSecApplyColor` and `lhSecMenuColor` accept only `^#[0-9a-f]{6}$` before `style.setProperty('--sec-color')` / `dataset.color`); T-09-17 mitigated (`createElement` / `textContent` / `setAttribute` only; 設定：名稱只當純文字 shows `<img src=x onerror=alert(1)>` literally, no element created, no dialog); T-09-18 mitigated (picker `input` previews only, `change` commits once; prohibition tests 自訂色預覽與確定 and 長按開啟不循環 pass); T-09-SC: no package installed.

## Process note

An earlier `git checkout -- js/sections.js js/lyrics.js css/panels.css` plus `git apply` of a saved patch was used once to compare the undo failure against HEAD; no `git stash`, nothing lost.

## Next Phase Readiness

Ready for 09-09 (word drag from the AI panel into lyrics). Shared requirement IDs (EDIT-03, EDIT-05, EDIT-06) are also declared by 09-09 / 09-10, so none were marked complete here.

## Self-Check: PASSED

Modified files exist; commits 5ef0b76, fbb3fa9 and 2dbfeb0 found in git log; acceptance greps and plan-level verification green (see Verification).
