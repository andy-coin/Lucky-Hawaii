---
phase: 09-section-modules
plan: 04
subsystem: undo-redo
tags: [undo, redo, history, snapshot-stack, ime, a11y, lyrics-tools, playwright]
status: complete
requires:
  - phase: 09-section-modules
    provides: "09-02 lhSecApply, 09-03 .lyrics-tools row, lhSecCountOne"
provides:
  - "js/undo.js: LH_UNDO_MAX, LH_TYPING_GAP, lhHistEnsure(song, verify), lhHistCommit, lhHistTyping, lhHistUndo, lhHistRedo, lhHistTop, lhHistSyncButtons; module Map _hists; document capture keydown + beforeinput interception; button listeners"
  - "js/sections.js: lhSecApply records one history step and returns it (truthy) or false; lhAnnounce(msg); lhSecFlash(id)"
  - "DOM: .undo-group (role=group) > button#undoBtn.undo-btn + button#redoBtn.undo-btn at the start of .lyrics-tools; div#lhLive.sr-only[aria-live=polite]"
  - "CSS: .undo-group, .undo-btn (+ aria-disabled, fine-pointer hover, --hit on coarse / <=900), .lyrics-section.sec-flash"
affects: [09-05 delete toast guards on the returned step, 09-06 drag, 09-07 menu (#sectionMenu already in scope), 09-09 word insert, 09-10 verification]
actuals:
  tokens: 14000
  tasks: 3
  commits: 3
plan_head_before: ecbb79ba047a9c52db307179538892b2655305ec
plan_head_after: 7dee6a49cf613ef872af78d14feb4037467bd357
commits: 3
tech-stack:
  added: []
  patterns:
    - "application-level snapshot stack per song, memory only; present snapshot seeded on every render"
    - "aria-disabled instead of the disabled attribute so a focused control keeps focus when it greys out"
    - "restore touches only what changed: one textarea value (same node) or a full render with scrollTop kept and a 700 ms outline"
key-files:
  created: [js/undo.js, tests/undo.spec.mjs]
  modified: [js/sections.js, js/lyrics.js, index.html, css/panels.css, tests/split-tags.spec.mjs, tests/layout.spec.mjs, tests/visual.spec.mjs-snapshots/desktop-lyrics-darwin.png, tests/visual.spec.mjs-snapshots/phone-lyrics-darwin.png, tests/visual.spec.mjs-snapshots/tablet-lyrics-darwin.png]
key-decisions:
  - "D-10 override: CONTEXT D5 says the buttons turn grey (disabled); implemented with aria-disabled=true (never the disabled attribute) so a focused button keeps focus. Mechanism only, look is the same"
  - "Cross-tab clearing rule: a history survives a reloaded song object only when the content signature (id, type, custom, color, text per section; collapsed and height excluded) equals the history's present; otherwise it starts over (CONTEXT D7, T-09-08)"
  - "beforeinput historyUndo/Redo whose target is the lyrics editor but whose focus is elsewhere is cancelled, because Chromium's native undo stack is page-wide"
  - "lhHistEnsure takes an optional verify flag used on re-render: a song changed outside the history (delete / drag, not yet routed through lhSecApply) restarts its history instead of undoing past the untracked change"
requirements-completed: []
duration: ~25 min
completed: 2026-10-23
coverage:
  - id: U1
    description: "Typing then undo / redo with the buttons, Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z and Ctrl+Y; restored text saved without a manual flush"
    requirement: EDIT-03
    verification:
      - { kind: e2e, ref: "tests/undo.spec.mjs#復原：打字後按按鈕與快捷鍵", status: pass }
    human_judgment: false
  - id: U2
    description: "Structure steps (type change, add section) undo / redo; add-section redo returns the same id"
    requirement: EDIT-03
    verification:
      - { kind: e2e, ref: "tests/undo.spec.mjs#復原：段落操作", status: pass }
    human_judgment: false
  - id: U3
    description: "Typing merges by 1 s pause and by section; one 注音 word is one step and nothing is recorded during composition"
    requirement: EDIT-03
    verification:
      - { kind: e2e, ref: "tests/undo.spec.mjs#復原：連打合併", status: pass }
      - { kind: e2e, ref: "tests/undo.spec.mjs#復原：組字一個詞一步", status: pass }
    human_judgment: false
  - id: U4
    description: "Text-only undo replaces one textarea value in the same node with the recorded caret; structure undo re-renders, keeps scrollTop and flashes the first changed section for 700 ms"
    requirement: EDIT-03
    verification:
      - { kind: e2e, ref: "tests/undo.spec.mjs#復原：只換一格", status: pass }
    human_judgment: false
  - id: U5
    description: "Undo never restores height or collapsed; 100-step cap; carets are UTF-16 indices and a surrogate-pair text round-trips byte-identical"
    requirement: EDIT-03
    verification:
      - { kind: e2e, ref: "tests/undo.spec.mjs#復原：不動高度與收合", status: pass }
      - { kind: e2e, ref: "tests/undo.spec.mjs#復原：一百步上限", status: pass }
      - { kind: e2e, ref: "tests/undo.spec.mjs#復原：罕用字游標", status: pass }
    human_judgment: false
  - id: U6
    description: "Scope: native undo kept in search, context, hashtag popup; beforeinput historyUndo/Redo in the editor routed to the stack"
    requirement: EDIT-03
    verification:
      - { kind: e2e, ref: "tests/undo.spec.mjs#復原：其他欄位用原生復原", status: pass }
      - { kind: e2e, ref: "tests/undo.spec.mjs#復原：選單復原也攔", status: pass }
    human_judgment: false
  - id: U7
    description: "Per song histories; a song changed by another tab starts over while an untouched song keeps its history; reload clears everything and no storage key is added"
    requirement: EDIT-03
    verification:
      - { kind: e2e, ref: "tests/undo.spec.mjs#復原：每首歌各自一條", status: pass }
      - { kind: e2e, ref: "tests/undo.spec.mjs#復原：別的分頁改了就清空", status: pass }
      - { kind: e2e, ref: "tests/undo.spec.mjs#復原：重新整理就清空", status: pass }
    human_judgment: false
  - id: U8
    description: "Buttons keep focus when greyed, never take focus from the textarea, announce 已復原 / 已重做, carry labels and platform titles, 44px on touch (layout audit)"
    requirement: EDIT-03
    verification:
      - { kind: e2e, ref: "tests/undo.spec.mjs#復原：變灰不丟焦點", status: pass }
      - { kind: e2e, ref: "tests/undo.spec.mjs#復原：按鈕不搶走輸入框焦點", status: pass }
      - { kind: e2e, ref: "tests/undo.spec.mjs#復原：讀屏提示", status: pass }
      - { kind: e2e, ref: "tests/undo.spec.mjs#復原：按鈕說明", status: pass }
      - { kind: e2e, ref: "tests/layout.spec.mjs (touch audits with button#undoBtn / button#redoBtn in mustSee)", status: pass }
    human_judgment: false
  - id: U9
    description: "Real-device feel: phone keyboard stays up when tapping ↶ ↷ (iOS is assumed from Chromium behaviour), iOS shake-to-undo and Mac Edit menu route to the stack, look of the greyed buttons in the tools row"
    requirement: EDIT-03
    verification: []
    human_judgment: true
    rationale: "iOS / Android behaviour cannot be exercised in headless Chromium; flagged for UAT (RESEARCH marks it ASSUMED)"
---

# Phase 9 Plan 04: Undo / redo Summary

Per-song, memory-only undo / redo (100 steps) for typing and every structural change that goes through lhSecApply, with ↶ ↷ buttons in the tools row and Cmd/Ctrl shortcuts that only act inside the lyrics editor and never during 注音 composition.

## What was built

- **js/undo.js (new):** snapshot stack `{ ref, past, future, present, caret, run }` per song in a module Map. `lhHistTyping` merges consecutive typing in one section until a pause over 1 s or a section switch; `lhHistCommit` records structure steps and returns the pushed step. `lhHistUndo` / `lhHistRedo` rebuild `song.sections` from the snapshot while keeping each surviving section's current collapsed and height, then finalize, mark dirty and flush (so the restored text is saved). Screen update: one differing text means the same textarea gets the value and the recorded caret (fallback: start of the change, never inside a surrogate pair) and is scrolled into view without taking focus; anything else re-renders with scrollTop kept, focus returned to the section that had it and the first changed section outlined for 700 ms. Capture-phase `keydown` and `beforeinput` listeners are limited to `#lyricsSections, .lyrics-tools, #sectionMenu`. Buttons prevent pointerdown / mousedown default, use aria-disabled and get platform titles.
- **js/sections.js:** `lhSecApply` now does ensure, mutate, finalize, commit, save and returns the step; `lhAnnounce`, `lhSecFlash` added.
- **js/lyrics.js:** `lhHistTyping` after `syncFromField` in the (not composing) input handler and in compositionend; `renderLyricsSections` ends with `lhHistEnsure(song, true)` and `lhHistSyncButtons()`.
- **index.html / css/panels.css:** undo-group in `.lyrics-tools`, `#lhLive`, script tag after songs.js; 2rem buttons (`--hit` on coarse / <=900), hover only on fine pointers and not when greyed, `.sec-flash` outline (no animation).
- **tests:** `tests/undo.spec.mjs` (17 specs), split-tags order and count (25), layout touch audit includes both buttons.

## Task commits

| Task | Commit | Summary |
|------|--------|---------|
| 1 (tracer) | d38be49 | undo.js, hooks, buttons, #lhLive, styles, 「復原：打字後按按鈕與快捷鍵」, lyrics -darwin baselines |
| 2 | 2ea4b20 | 12 specs for structure, merge, IME, one-cell restore, caps, scope, per-song, cross-tab; beforeinput focus guard |
| 3 | 7dee6a4 | coarse sizing, sec-flash CSS, layout mustSee, 4 specs, phone / tablet -darwin baselines |

Tracer gate: `<verify>` is automated-only and human_verify_mode is end-of-phase, so the verify command was re-run end to end after Task 1 (all green) and execution continued.

## Deviations from Plan

**1. [Process] Task 1 already contained most of Tasks 2 and 3 in js/undo.js**
- The D6 screen update, beforeinput interception, pointerdown / mousedown prevention and platform titles were written in the same file as the Task 1 core, and `lhAnnounce` / `lhSecFlash` were needed at runtime by the first undo, so they landed in the Task 1 commit. Task 2 / Task 3 commits therefore contain the tests, the lhSecApply wiring was already in Task 1 too, and the CSS. RED for tasks 2 and 3 was not visible (only Task 1's RED was recorded: `#undoBtn` aria-disabled lookup failed). Recorded, not faked.

**2. [Rule 1 - Bug] Native Ctrl+Z in another field reverted lyrics**
- **Found during:** Task 2 (「復原：其他欄位用原生復原」)
- **Issue:** Chromium's native undo stack is page-wide. Ctrl+Z in `#searchInput` made the browser undo the earlier lyrics typing, with `beforeinput historyUndo` targeted at the textarea; my in-scope `beforeinput` handler then ran the app undo, so the lyrics changed from a different field's shortcut.
- **Fix:** the `beforeinput` handler cancels the event and only runs the app undo when `document.activeElement` is also in scope. Side effect: in that situation the native undo of the search box itself does not run (its own typing still undoes natively when it is the stack top).
- **Files modified:** js/undo.js, tests/undo.spec.mjs
- **Commit:** 2ea4b20

**3. [Rule 2 - Missing critical] `lhHistEnsure(song, verify)` for changes made outside the history**
- Delete (`removeLyricsSection`) and drag reorder still mutate the model directly until 09-05 / 09-06 route them through `lhSecApply`. Without a check, the history's present would be stale after them and a later undo would silently undo the delete too. The render path passes `verify = true`: if the content signature differs from the history's present, the history restarts. Cheap, and becomes a no-op once those plans land.

**4. [Rule 1 - Test bug] Own test assumptions**
- The scroll-keeping test needs a list that really scrolls (added a style tag making sections 20rem tall); the Shift+Tab test walks back until `#undoBtn` instead of assuming two presses; the last scope assertion checks the value because a stopPropagation'd keydown never reaches a bubble listener.

## Refreshed baselines

`desktop-lyrics-darwin.png`, `phone-lyrics-darwin.png`, `tablet-lyrics-darwin.png` regenerated with `--update-snapshots=all` after viewing the phone and tablet (and desktop) images: greyed ↶ ↷ in the tools row, 44px on phone and tablet. The old baselines were within the 1% tolerance, so a normal run does not rewrite them. No `-linux.png` touched.

## Threat model status

- T-09-08: cross-tab content change clears that song's history (signature rule), tested by 「復原：別的分頁改了就清空」.
- T-09-09: `grep -c "localStorage\|indexedDB" js/undo.js` is 0; the reload spec checks localStorage keys and IndexedDB database names are identical before and after editing.
- T-09-10: 100-step cap tested; snapshots are shallow copies.
- T-09-SC: no package installed; package.json / package-lock.json unchanged.
- Threat flags: none new.

## Known Stubs

None.

## Requirements

EDIT-03 is also declared by 09-05, 09-06, 09-08, 09-09 and 09-10, so it is NOT marked complete in REQUIREMENTS.md here.

## Verification

- Acceptance greps: `'undo'` in split-tags 1; undo.js tag right after songs.js; `localStorage|indexedDB` in js/undo.js 0; `lhHistTyping(` in js/lyrics.js 2; `lhHistCommit(song` 1 and `lhHistEnsure(song)` 1 in js/sections.js; `historyUndo` in js/undo.js 2; `button#undoBtn` in layout.spec 1; `sec-flash` in panels.css 1 (plus the rule).
- Plan verification set (undo, sections-ui, sections-core, songs-ime, songs-crosstab, songs-model, split-tags, style, scan, smoke, layout, visual) -> 220 passed.
- `tests/undo.spec.mjs` -> 17 passed, repeated 3 times without flakes.
- Full suite (`npx playwright test`): 758 passed, 27 skipped (not from this plan), 0 failed.

## Andy to-do

- 在雲端容器執行 `npm run visual:update`，更新 -linux 的 3 張 lyrics 截圖基準（本機只更新 -darwin）。
- 真機 UAT：手機點 ↶ ↷ 時鍵盤是否保持開著（iOS 為推測）；iOS 搖一搖、Mac 選單「編輯 → 還原」是否走自己的堆疊；↶ ↷ 在工具列的位置與灰色看起來是否合意。
- 已知取捨：焦點在搜尋框、而瀏覽器原生堆疊最上面是歌詞裡的打字時，Cmd/Ctrl+Z 什麼都不做（避免歌詞被別的欄位的快捷鍵改掉）。

## Self-Check: PASSED

- FOUND: js/undo.js, tests/undo.spec.mjs, .planning/phases/09-section-modules/09-04-SUMMARY.md
- FOUND commits: d38be49, 2ea4b20, 7dee6a4
