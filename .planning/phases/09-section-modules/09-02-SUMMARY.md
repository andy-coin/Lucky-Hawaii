---
phase: 09-section-modules
plan: 02
subsystem: section-header-type-cycle
tags: [sections, type-cycle, lhSecApply, in-place-update, event-delegation, playwright]
status: complete
requires:
  - phase: 09-section-modules
    provides: "09-01 sections-core.js (LH_SEC_TYPES, lhSecFinalize, lhNextSecType), makeEmptySection(type), per-section type/custom/color/height/label"
provides:
  - "js/sections.js: lhSecApply(kind, mutate, opts), lhSecRefreshMeta(), lhSecEl(id), lhSecFillTypeBtn(btn, label), one delegated click listener on #lyricsSections (cycle / remove / collapse)"
  - "button.section-type replaces input.section-label; .lyrics-section[data-type]"
  - "#secTypeHint (sr-only) and aria-describedby on every type button"
affects: [09-03 colors, 09-04 history, 09-05 delete, 09-06 drag, 09-08 settings popover (custom rename)]
actuals:
  tokens: 40000
  tasks: 2
  commits: 2
plan_head_before: 4e5ef5cd4e8789d32685acf0dcb5d840bc05d755
plan_head_after: 38c8e7c33b3b7e4ae1770c003c2e629ea51d1fad
commits: 2
tech-stack:
  added: []
  patterns:
    - "single structural entry point lhSecApply: mutate model -> lhSecFinalize -> markDirty -> flushSongs -> in-place patch (or full render only when asked)"
    - "header events delegated on the stable container, no inline on* attributes, no ids in selector strings"
    - "square box for a rotated glyph so getBoundingClientRect of the rotated element does not intrude on neighbours"
key-files:
  created: [js/sections.js]
  modified: [index.html, js/lyrics.js, css/panels.css, css/responsive.css, tests/sections-ui.spec.mjs, tests/songs-model.spec.mjs, tests/songs-ime.spec.mjs, tests/songs-backup.spec.mjs, tests/split-tags.spec.mjs, tests/layout.spec.mjs, tests/visual.spec.mjs-snapshots/desktop-lyrics-darwin.png, tests/visual.spec.mjs-snapshots/phone-lyrics-darwin.png, tests/visual.spec.mjs-snapshots/tablet-lyrics-darwin.png]
key-decisions:
  - "lhSecApply returns false (and writes nothing) when mutate returns false; opts.dom === 'render' is the only path that rebuilds the list (add), every other kind patches in place"
  - "A section that cycles through Custom keeps its stored custom name but cannot be renamed until the 09-08 settings popover (intermediate state, per plan)"
requirements-completed: []
duration: ~20 min
completed: 2026-10-23
coverage:
  - id: D1
    description: "Clicking / Enter on the section name cycles Intro > Verse > Pre-Chorus > Chorus > Inter > Bridge > Outro > Custom; 8 presses return; names renumber at once, model label = button text, stored song updated without manual flush, reload shows the same"
    requirement: EDIT-06
    verification:
      - { kind: e2e, ref: "tests/sections-ui.spec.mjs#循環：點一下換下一種類型", status: pass }
    human_judgment: false
  - id: D2
    description: "A cycle patches in place: same button keeps focus across repeated Enter, no .lyrics-section node replaced, textarea value / caret / scrollTop unchanged"
    requirement: EDIT-06
    verification:
      - { kind: e2e, ref: "tests/sections-ui.spec.mjs#循環：原地更新", status: pass }
    human_judgment: false
  - id: D3
    description: "Header row fits (chevron, type button, - on one line, no overlap, inside the section, collapsed included) at 390 / 820 / 1440 x scale 100 and 150 with a 40-character custom name; long name ellipsized with full title"
    requirement: EDIT-06
    verification:
      - { kind: e2e, ref: "tests/sections-ui.spec.mjs#循環：標題列不擠不疊", status: pass }
    human_judgment: false
  - id: D4
    description: "+ 新增段落 goes through lhSecApply; fine pointer focuses the new textarea and scrolls it into view, touch focuses nothing"
    requirement: EDIT-05
    verification:
      - { kind: e2e, ref: "tests/sections-ui.spec.mjs#循環：新增段落的焦點", status: pass }
    human_judgment: false
  - id: D5
    description: "Hostile custom name renders as literal button text, creates no img, no inline on* attribute on the header or type button"
    requirement: EDIT-06
    verification:
      - { kind: e2e, ref: "tests/sections-ui.spec.mjs#循環：名稱只當純文字", status: pass }
    human_judgment: false
  - id: D6
    description: "Touch floors: every .section-type has a >= 44px hit box in the Phase 5 audit; the 歌詞開著 audit lists button.section-type"
    requirement: EDIT-06
    verification:
      - { kind: e2e, ref: "tests/layout.spec.mjs (touch-target audits, 歌詞開著)", status: pass }
    human_judgment: false
  - id: D7
    description: "How the outlined name button looks and feels in the header (size, weight, contrast, click-to-cycle discoverability)"
    requirement: EDIT-06
    verification: []
    human_judgment: true
    rationale: "visual taste and discoverability of a click-to-cycle control; UAT item for Andy"
---

# Phase 9 Plan 02: Section name becomes a cycling button Summary

Clicking, tapping or pressing Enter / Space on a section name now moves it to the next type (Intro > Verse > Pre-Chorus > Chorus > Inter > Bridge > Outro > Custom), renumbers every name at once, saves immediately, and does all of it by patching existing DOM nodes, through the new single entry point `lhSecApply`.

## What was built

- **js/sections.js (new):** `lhSecApply(kind, mutate, opts)` (mutate model, `lhSecFinalize`, `markDirty`, `flushSongs`, then `lhSecRefreshMeta` or, with `opts.dom === 'render'`, `renderLyricsSections`); `lhSecRefreshMeta()` patches `dataset.index`, `dataset.type`, button text / title / aria-label and textarea placeholder in place; `lhSecEl(id)` finds a block by `dataset.id` with a loop; `lhSecFillTypeBtn` shared by render and refresh. One delegated `click` on `#lyricsSections`: `.section-type` cycles, `.section-remove` calls `removeLyricsSection`, other header clicks (not handle / count) call `toggleLyricsSection`. A comment marks where 09-04 adds history.
- **js/lyrics.js:** header builds `button.section-type` (type=button, title, aria-label 「{名稱}，段落類型，按一下切換」, aria-describedby secTypeHint); no `onclick` on header or remove button (drag attributes stay for 09-06); `data-type` on each block; `addLyricsSection` uses `lhSecApply('add', ..., { dom: 'render' })`, then focuses the new textarea on a fine pointer, always `scrollIntoView({ block: 'nearest' })`; the dead `#leftPanel .side-panel-body` scroll timeout is gone.
- **Removed:** `onSectionHeaderClick`, `enableSectionLabel`, `disableSectionLabel`, the label branch of `syncFromField`.
- **index.html:** `js/sections.js?v=0.96.13` right after lyrics.js; `<span id="secTypeHint" class="sr-only">` next to `#renderLive`.
- **CSS:** `.section-type` rules replace `.section-label` (UI-SPEC D-01 / D-02); header gap `var(--sp-1)`, padding `0 var(--sp-1)`; `.section-remove` gets `margin-inline-start: auto`; coarse list and responsive sheet rule renamed (`min-width: var(--hit)` on the sheet so the touch box stays >= 44); `.section-label` removed from the 16px input-floor list; `.section-chevron` is a 1rem square flex box.

## Task commits

| Task | Commit | Summary |
|------|--------|---------|
| 1 (tracer) | fda126d | name is a button that cycles, `lhSecApply`, in-place patch, specs and lyrics baselines |
| 2 | 38c8e7c | header fit / add focus / plain-text tests, square chevron box, baselines refreshed |

Tracer gate: `<verify>` is automated-only and `human_verify_mode` is end-of-phase, so the full verify (140 + 79 + 19) was re-run after the tracer commit and execution continued.

## Changed expectations and removed tests

| Spec | Old | New |
|------|-----|-----|
| sections-ui `labels` helper (09-01 tests) | `.section-label` input value | `.section-type` textContent |
| songs-model 升級後顯示我的第一首歌 / 原樣顯示 / 用段落 id 對應 / 預設段落名稱 | `.section-label` `inputValue()` / `e.value` | `.section-type` `textContent()` |
| songs-model 用段落 id 對應 class list | `.section-label` | `.section-type` |
| songs-model 畫面被改動不會寫回 | label dblclick + blur | `#searchInput.focus()` (textarea focusout runs the flush) |
| songs-backup 舊版存檔推斷類型 | `.section-label` values | `.section-type` textContent (not named in the plan; same mechanical swap) |
| layout 歌詞開著 mustSee | `input.section-label`, `div.lyrics-section-header` | `button.section-type` (header dropped: no inline handler, so no longer an audited control; its 44px min-height rule stays) |
| split-tags | 23 files | `'sections'` after `'lyrics'`, 24 files |
| songs-ime | 「組字：段落名稱組字中按 Enter 不結束編輯」 | **deleted** (the name is no longer a text field; the custom-name IME test arrives with the settings popover in 09-08) |

Refreshed baselines (-darwin only, after viewing phone, desktop and tablet images): `tests/visual.spec.mjs-snapshots/desktop-lyrics-darwin.png`, `phone-lyrics-darwin.png`, `tablet-lyrics-darwin.png` (refreshed in both tasks; the diffs were inside the 1% tolerance, so `--update-snapshots=all` was used as in 09-01). No `-linux.png` touched.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Process] Task 2's add-section routing landed in Task 1**
- **Found during:** Task 1 (rewriting lyrics.js)
- **Issue:** `addLyricsSection` still built its own model change; since lyrics.js was rewritten around `lhSecApply` in Task 1, the `lhSecApply('add', ...)` routing and the fine-pointer focus were done there. Task 2's RED tests for 「新增段落的焦點」 and 「名稱只當純文字」 therefore passed on first run; only 「標題列不擠不疊」 was red. Recorded, not faked.
- **Files modified:** js/lyrics.js (Task 1 commit fda126d)

**2. [Rule 1 - Bug] Collapsed chevron's rotated box overlapped the type button**
- **Found during:** Task 2 (header-fit test, phone 100%, collapsed section)
- **Issue:** the chevron was a glyph-sized flex item; `rotate(-90deg)` made its bounding rect wider than the 4px gap, so it intersected the button rect.
- **Fix:** `.section-chevron` is a 1rem x 1rem inline-flex box, so rotation does not change its rect.
- **Files modified:** css/panels.css
- **Commit:** 38c8e7c

**3. [Rule 1 - Test fix] Header-fit test measured mid-transition and assumed overflow on tablet**
- **Issue:** after `setScale` the collapsed section's `flex` transition was still running (measured 42px instead of 51px at 150%); and a 40-character name fits in the 820px sheet at 100%, so "scrollWidth > clientWidth" cannot hold there.
- **Fix:** `waitStill` before measuring; the ellipsis assertion is required on phone and desktop only (tablet still checks the title holds the full name).
- **Files modified:** tests/sections-ui.spec.mjs
- **Commit:** 38c8e7c

**4. [Rule 3 - Blocking] Responsive sheet rule would let the button shrink below the touch floor**
- **Issue:** the renamed `.section-type { min-width: 0 }` in the <= 900 sheet could shrink the hit box under 44px for short names.
- **Fix:** `min-width: var(--hit)` there instead (the plan's "rename the selector" kept, value adjusted for the touch floor requirement).
- **Files modified:** css/responsive.css
- **Commit:** fda126d

**5. [Rule 3] One spec outside the plan's file list changed**
- tests/songs-backup.spec.mjs read the old input value (one line); switched to `.section-type` textContent so it keeps passing. Committed with Task 1.

**Total deviations:** 5 (2 bugs, 3 blocking / process). **Impact:** none on scope.

## Threat model status

- T-09-05 (XSS via names): names reach the DOM only through `textContent`, `title` and `setAttribute('aria-label')`; 「循環：名稱只當純文字」 covers `<img src=x onerror=alert(1)>` through render and 8 cycle clicks (no img, `__pwn` undefined).
- T-09-06 (inline handler strings): header and type button carry no `on*` attribute apart from the six drag attributes on the header, which carry the index and are replaced in 09-06 (the plan says to keep them). Events are delegated; the test asserts no `onclick` / `onkeydown` inside `#lyricsSections`.
- T-09-SC: no package installed; `package.json` / `package-lock.json` unchanged.

## Known Stubs

None. The only intentional gap is the plan's intermediate state: a Custom section's name cannot be edited until 09-08.

## Verification

- `npx playwright test tests/sections-core.spec.mjs tests/sections-ui.spec.mjs tests/songs-model.spec.mjs tests/songs-ime.spec.mjs tests/songs-export.spec.mjs tests/songs-journey.spec.mjs tests/songs-backup.spec.mjs tests/split-tags.spec.mjs tests/style.spec.mjs tests/scan.spec.mjs tests/smoke.spec.mjs` -> 143 passed
- `npx playwright test tests/layout.spec.mjs tests/visual.spec.mjs` -> 98 passed
- Acceptance greps: removed functions in js/lyrics.js 0; `function lhSecApply` 1; `'sections'` in split-tags 1; `section-label` in css/panels.css and css/responsive.css 0; `lhSecApply('add'` in js/lyrics.js 1.
- `git diff --stat package.json package-lock.json` empty; no `-linux.png` changed.

## Andy to-do

- 在雲端容器執行 `npm run visual:update`，更新 -linux 截圖基準（本機只更新 -darwin 的 3 張 lyrics 基準）。
- UAT 確認項（人工判斷）：段落名稱變成有框的按鈕後，外觀、大小、「點一下就換類型」好不好發現。
- 過渡狀態：自訂名稱的段落暫時不能改名，等 09-08 的設定面板。

## Self-Check: PASSED

- FOUND: js/sections.js, .planning/phases/09-section-modules/09-02-SUMMARY.md
- FOUND commits: fda126d, 38c8e7c
