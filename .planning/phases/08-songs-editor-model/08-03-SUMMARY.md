---
phase: 08-songs-editor-model
plan: 03
subsystem: editor
tags: [ime, composition, enter-guard, dom-api, xss, playwright, cdp]
status: complete
requires:
  - phase: 08-02
    provides: js/songs.js model, flush on compositionend / focusout / pagehide / visibilitychange, DOM-API editor, test helpers compose / activeSong / STORAGE_SPY
provides:
  - "Enter and Esc ignored while composing in #hashtagPopupInput; Enter ignored while composing in .section-label"
  - "renderSavedWords built with createElement / textContent / closures (no HTML strings left in the editor or the 保留池)"
  - "Automated proof of EDIT-01: no DOM mutation or caret jump while typing / composing, pagehide and visibilitychange flush, literal rendering of saved words and #tags, AI context lands on the original song"
affects: [08-04, 08-05, 08-07, 08-08]
actuals:
  tokens: 6500
  tasks: 2
  commits: 2
plan_head_before: b4922657e3d2f7e43e959734b810673887d6c026
plan_head_after: 73c18b67c9a8fdf5e2d355d7c22511e58a7692b9
commits: 2
tech-stack:
  added: []
  patterns: ["IME guard idiom on every Enter/Esc handler: !event.isComposing && event.keyCode !== 229", "user strings reach the DOM only through textContent / append and addEventListener closures"]
key-files:
  created: []
  modified: [index.html, js/lyrics.js, js/panels.js, tests/songs-ime.spec.mjs, tests/songs-model.spec.mjs]
key-decisions:
  - "The Esc branch of #hashtagPopupInput uses the same early return as Enter (Esc while composing cancels the composition, not the popup)"
  - "Section-label composition spec reads the stored label without flushing, because the model (memory) follows the half-composed text while typing; only the persisted value and the readonly attribute prove Enter did not commit"
requirements-completed: [EDIT-01]
duration: 9 min
completed: 2026-10-11
---

# Phase 8 Plan 03: IME-safe Enter and DOM-API saved words Summary

Pressing Enter to pick a Zhuyin candidate in the #標籤 popup or a section name no longer commits the half-typed text, and the 保留池 chips are now built with DOM APIs so words containing markup or quotes display, copy and delete exactly as typed.

## Accomplishments

- index.html: `#hashtagPopupInput` onkeydown returns early when `event.isComposing || event.keyCode === 229`, so neither Enter nor Esc acts during composition; a real Enter still adds the tag.
- js/lyrics.js: the `.section-label` inline onkeydown only blurs on Enter when `!event.isComposing && event.keyCode !== 229` (handler stays inline, smoke still enumerates and fires it).
- js/panels.js `renderSavedWords`: chips are `div.word-chip` + text node + `span.chip-remove`, click listeners are closures (`copyWord(w)`, `stopPropagation` + `removeSavedWord(w)`); empty state is a span with the same text 點擊上方詞彙保留 and the same color / size.
- Tests: 2 specs for R4 / label (Task 1) and 3 + 3 guard / regression specs (Task 2).

## RED evidence

- Task 1, before any code change: both new specs failed on the 08-02 code (`組字中按 Enter 沒有新增標籤` / `組字中按 Enter 還在編輯`); the two older 組字 specs passed.
- Task 2, before the panels.js change: only `資料為準：保留池的字原樣顯示` failed (the img-word chip's first child was an element, not the literal text).
- Guard tests that already passed on 08-02 as-is: 組字：不重畫也不跳游標, 組字：關分頁不掉字, 組字：切到背景立刻存, 資料為準：標籤原樣顯示, 資料為準：情境結果寫回原本那首歌. No fix to the 08-02 code path was needed.

## Commits

- d00fad3 feat(08-03): Enter during Zhuyin composition no longer commits the tag popup or section name (index.html, js/lyrics.js, tests/songs-ime.spec.mjs)
- 73c18b6 feat(08-03): saved-word chips built with DOM APIs; no-redraw, pagehide and literal-text specs (js/panels.js, tests/songs-ime.spec.mjs, tests/songs-model.spec.mjs)

Task 1 verify (songs-ime + smoke): 9 passed. Task 2 verify (songs-ime, songs-model, style, smoke): 40 passed, 7 titled 組字：, 15 titled 資料為準：. `npm test`: 593 passed, 27 skipped, 0 failed (baseline 585 + 8 new). No screenshot baseline touched.

## Deviations from Plan

None - plan executed exactly as written. Notes: smoke handler signature count dropped from 93 to 89 because the four string-built onclick handlers in the saved-word chips no longer exist; coverage spec still passes. The `'#標籤' 標籤原樣顯示` and context-race behaviours were already delivered by 08-02 (renderHashtags with textContent, result written to the captured song), so those specs are pure guards.

## Known Stubs

None.

## Threat Flags

None. T-08-06 (saved words XSS), T-08-07 (IME Enter) and T-08-08 (context race) are covered by the specs above.

## Autonomous decisions (for Andy's 自主決定 list)

- Esc in the tag popup is guarded the same way as Enter (cancel composition first, close popup on the next Esc).

## Human check still open

Real-device feel of Zhuyin composition (macOS Zhuyin, iPad, Android Gboard) stays a manual check; Chromium CDP covers composition events but not a real IME's keyCode 229 stream.

## Self-Check: PASSED

- index.html isComposing count 1, js/lyrics.js `keyCode !== 229` count 1, js/panels.js `copyWord('` (non-comment) 0, createElement 3, 點擊上方詞彙保留 1, spec titles present; commits d00fad3 and 73c18b6 in `git log`.
- `npm test`: 593 passed, 27 skipped, 0 failed.
