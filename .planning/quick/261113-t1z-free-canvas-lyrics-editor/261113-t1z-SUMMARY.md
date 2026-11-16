---
phase: quick-261113-t1z
plan: 01
subsystem: lyrics-editor
tags: [canvas, free-layout, undo, persistence, push-apart]
requires: [261113-s3k]
provides: [free canvas layout Part A (0.96.32)]
affects: [js/sections-core.js, js/canvas.js, js/undo.js, js/songs.js, js/safety.js, js/lyrics.js, js/sections.js, js/layout.js, css/panels.css, index.html]
tech-stack:
  added: []
  patterns: [left/top cards in a natively scrolling container, document-level pointer listeners, pure-function normalisers, one undo step per gesture]
key-files:
  created: [js/canvas.js, tests/canvas-core.spec.mjs, tests/canvas.spec.mjs]
  modified: [js/sections-core.js, js/undo.js, js/songs.js, js/safety.js, js/lyrics.js, js/sections.js, js/layout.js, css/panels.css, index.html, js/rhyme-map.js, tests/split-tags.spec.mjs, tests/rhyme-map-ui.spec.mjs, tests/roles.spec.mjs]
decisions:
  - "song.canvas = { mode } and section pos = {x,y,w,h}; stored only in cleaned form; no new storage key"
  - "data-canvas=free is set only when editor open AND free AND NOT html.kb-open (same condition as the CSS); layout.js re-applies when kb-open toggles"
  - "Reveal in free mode scrolls only the canvas (scrollTo), never scrollIntoView, at all 5 call sites"
metrics:
  duration: single session
  completed: 2026-11-14
status: complete
commits: 4
plan_head_before: 5d64a21
plan_head_after: 13d62fc88d7997a8e10dae51c78eca63783d5d28
actuals:
  tasks: 4
  commits: 4
---

# Phase quick-261113-t1z Plan 01: Free canvas, Part A (0.96.32) Summary

Full lyrics editor gets a 吸附／自由 toggle; in 自由 every section is a card on a natively scrolling canvas (move by ⋮⋮ or blank header, resize from the corner, push-apart on release, one-step undo), with positions saved per song.

## Commits (all pushed to origin/gsd/v0.96-stabilize, pushed head 13d62fc)

| # | Hash | Content |
|---|------|---------|
| 1 | c89d14d | Data model and pure functions (sections-core, undo `_sig`, songs, safety) + canvas-core.spec + 4 data browser tests |
| 2a | 05b2428 | js/canvas.js, toolbar, CSS, toggle, move, resize, push-apart on release, one-step undo, snap keeps positions, grip guard |
| 2b | fff7ec6 | Reveal at the 5 call sites (canvas-only scroll), list.scrollLeft restore, kb-open fallback hook in layout.js, free-mode selection/role/typing/move-to-section tests |
| 3 | 13d62fc | Version 0.96.32 (42 local ?v=, info panel, en-rhyme fetch) |

2a/2b split followed orchestrator correction 2; the whole plan finished, so status is complete.

## Verification (real results)

- Task 1 set: 186 passed. 2a set: 379 passed. 2b set: 390 passed (excluding only the two base-failing titles).
- Task 3 full suite, fresh: 1209 passed, 29 skipped, 33 failed. Failure titles are a strict subset of the 34-title allowed list (`comm -23` empty). The one allowed title that passed this time: rhyme-map-ui 「鏡像對齊：與文字框逐像素相同」 (known flaky/failing). The other three known guard failures (golden 31, scan catch, sections-audit 動畫) failed as at base. No baseline worktree was needed.
- Replacement guards clean: no `@keyframes`/`transition`/`animation` and no `catch` word in added lines since 5d64a21, nor in js/canvas.js.
- Mirror alignment tests (rhyme-map-ui 長句換行、英文長串, roles glyph-position) green.

## Deviations from Plan

### Auto-fixed / adjustments

**1. [Rule 1 - test expectation] Test 「選字後打字」 expected text**
- My first expected string miscounted the index (replaced 愛 at index 5, not 4). Fixed the test; the code was right.

**2. [Rule 3 - test environment] kb-open sort test uses a simulated state**
- With real kb-open every other card is `display:none`, so a ⋮⋮ reorder drag cannot be done. The test adds `html.kb-open` manually, unhides cards via an injected style, then drags C above A. It proves data-canvas is removed, the label is the sort label, and ⋮⋮ sorting works. The real-keyboard behaviour (absolute -> not absolute -> absolute) is tested separately with `emulateKeyboard` on the phone profile.

**3. [Observation, not fixed - pre-existing] Second selection after undo in a 3-section song**
- In a debug run (snap AND free mode, identical), after selecting, assigning a role, undoing, then keyboard-selecting two identical-text characters in another section, `#rhymeSelBar` did not show. It happens without the canvas, so it is out of scope. The role test was reordered to put undo last. Worth a look in a later quick task if Andy notices the bar not appearing after undo.

**4. Reveal tests pass natively too**
- On desktop no ancestor of the canvas scrolls, so native scrollIntoView would also pass the "outer scroll unchanged" assertions. The guards still route through lhCanvasReveal as planned; the tests lock the behaviour, not the mechanism.

## Known limits (also in handoff.md)

Mode is not an undo step; no zoom/pan (Part B); arrow-key moving deferred; word drag from AI/result cards can't reach the editor; old single-song path (songs.js:66) stores no canvas; text moved into a NEW section by 移到段落 lands on a pos-less card (default spot below the others); a collapsed card reserves its full stored size for push-apart; legacy 並排角色欄 sections just scroll inside the card; on <=900px the editor column still scrolls; -linux visual baselines unchanged.

## Part B (next quick, 0.96.33) — as in plan `<out_of_scope>`

Zoom and pan stored via lhCanvasClean (zoom clamp 0.25-2, pan +-200000), per-card transform rendering with overflow clip, lhCanvasReveal as pan, coordinate compensation in word-drag.js lhCaretIndexAt/lhCaretRect (divide by zoom), zoom/pan UI (toolbar group, Ctrl/Cmd+wheel, blank drag, Space+drag, pinch), keyboard move/resize (arrows 10/50 px, Alt resize; settle Alt+Up/Down conflict), phone polish (fit-all button, counter-scaled corner, <=900px outer scroll, iOS device check).

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model (T-t1z-01..08 mitigations implemented: cleaned values only, numbers-only setProperty, capped push loop, writes only through lhSecApply, no HTML sinks - tested).

## Notes

- handoff.md overwritten (top section) and left unstaged, as instructed. No docs artifacts committed; ROADMAP/STATE untouched.
- Unrelated dirty files (.planning/.DS_Store, worker/wrangler.toml, untracked dirs) untouched.

## Self-Check: PASSED

- js/canvas.js, tests/canvas-core.spec.mjs, tests/canvas.spec.mjs exist; commits c89d14d, 05b2428, fff7ec6, 13d62fc present on origin/gsd/v0.96-stabilize.
