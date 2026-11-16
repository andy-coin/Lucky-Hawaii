---
phase: 09-section-modules
plan: 10
subsystem: phase-gate
tags: [integration, audit, journey, touch-targets, multi-tab, xss-scan, flaky-test, checklist, playwright]
status: complete
requires:
  - phase: 09-section-modules
    provides: "09-01 … 09-09 (sections-core, sections, undo, word-drag, toast, popover, resize, drag)"
provides:
  - "tests/sections-journey.spec.mjs: 1 spec 「整合：段落模組一次走完」 covering ROADMAP criteria 1-5 in one session"
  - "tests/sections-audit.spec.mjs: 11 specs 「檢查：」 (12 sections, mode switch, panel collapse, second tab, touch targets x3 devices, header fit, hostile text, HTML-sink scan, no new animation, reload + exports, save failure)"
  - "Seam fixes: css/panels.css min-height 9rem for expanded sections; js/songs.js isEditingField counts only text fields"
  - "Root cause of the flaky 「復原：只換一格」 and a deterministic wait in the test"
  - "Phase 9 human checks and 17 autonomous decisions in both checklists; handoff.md Phase 9 block"
affects: [/gsd-verify-work 09 (UAT), Phase 10]
actuals:
  tokens: 19000
  tasks: 3
  commits: 5
plan_head_before: 94dba9376b5c3fe570f41c128fd39f05fdb6fe8f
plan_head_after: 398ac83ea2f4bd0b8bae92aa67c73ad899b06f26
commits: 5
key-files:
  created: [tests/sections-journey.spec.mjs, tests/sections-audit.spec.mjs]
  modified: [css/panels.css, js/songs.js, tests/undo.spec.mjs, handoff.md, .planning/TEST-CHECKLIST.md, ".planning/驗收清單-精簡版.md"]
key-decisions:
  - "Fix seams in the owning file only: min-height in css/panels.css (desktop 12-section list), isEditingField in js/songs.js (cross-tab reload while focus is on a button); no earlier test was weakened"
  - "The flaky undo spec was a test-timing problem, not a product bug: the product writes scrollTop twice (switchSong -> 0, undo -> exactly the value it had at undo time); a leftover browser caret-reveal scroll animation moved the list 20-50 px after the click, before the test read its baseline"
  - "Journey cycles Chorus once and expects Inter (cycle order is Intro, Verse, Pre-Chorus, Chorus, Inter, ...); the plan text said Pre-Chorus, which is the step before Chorus"
requirements-completed: [EDIT-02, EDIT-03, EDIT-05, EDIT-06, EDIT-07, AI-06]
duration: ~95 min
completed: 2026-10-23
coverage:
  - id: R1
    description: "One continuous browser journey: v0.96 profile upgrades to Verse / Chorus / Bridge, Chorus cycled, colored red from the popover, Bridge dragged by its handle, first section resized, typing + undo + redo, delete + toast 復原, AI word dragged in, reload keeps order / names / color / height / text, undo + redo aria-disabled, TXT headings equal displayed names"
    requirement: EDIT-02
    verification:
      - { kind: e2e, ref: "tests/sections-journey.spec.mjs#整合：段落模組一次走完", status: pass }
    human_judgment: false
  - id: R2
    description: "Interruptions cancel cleanly: viewport 1440 -> 820 -> 390 -> 1440 with popover / section drag / resize / word drag active; panel collapse and leaving the 歌詞 tab; a second tab changing the song during a section drag, popover or word drag (history cleared, other tab's text shown)"
    requirement: EDIT-03
    verification:
      - { kind: e2e, ref: "tests/sections-audit.spec.mjs#檢查：切版型時中止", status: pass }
      - { kind: e2e, ref: "tests/sections-audit.spec.mjs#檢查：收起歌詞面板時中止", status: pass }
      - { kind: e2e, ref: "tests/sections-audit.spec.mjs#檢查：另一個分頁改了這首歌", status: pass }
    human_judgment: false
  - id: R3
    description: "Populated list, header fit, touch targets: 12 mixed sections numbered per type and scrolling inside the list with edge auto-scroll; header controls inside their section on one line at 3 devices x scale 100 / 150; every new control >= 44 x 44 (neighbour overlap <= 4 px) on phone, tablet portrait and tablet landscape"
    requirement: EDIT-05
    verification:
      - { kind: e2e, ref: "tests/sections-audit.spec.mjs#檢查：十二段的編號與捲動", status: pass }
      - { kind: e2e, ref: "tests/sections-audit.spec.mjs#檢查：標題列在各尺寸都放得下", status: pass }
      - { kind: e2e, ref: "tests/sections-audit.spec.mjs#檢查：三種裝置的觸控大小", status: pass }
    human_judgment: false
  - id: R4
    description: "Hostile text (img onerror, textarea + script, bold word) renders as literal text in type button, popover title, section ghost, word ghost, toast, #lhLive, textarea; static syntax-tree scan of the four new JS files finds no HTML sinks or on* attributes; no new @keyframes or transition declarations since 905320a"
    requirement: EDIT-06
    verification:
      - { kind: e2e, ref: "tests/sections-audit.spec.mjs#檢查：惡意文字只當文字", status: pass }
      - { kind: unit, ref: "tests/sections-audit.spec.mjs#檢查：新程式沒有拼 HTML", status: pass }
      - { kind: unit, ref: "tests/sections-audit.spec.mjs#檢查：沒有新增動畫", status: pass }
    human_judgment: false
  - id: R5
    description: "After setting height, color and type and reloading the module renders identically; TXT, Markdown, PDF and 備份全部 carry the displayed names and the new fields; a failing localStorage write shows the save-failure banner and the screen still matches the in-memory model"
    requirement: EDIT-07
    verification:
      - { kind: e2e, ref: "tests/sections-audit.spec.mjs#檢查：重新整理後一模一樣、匯出照名稱", status: pass }
      - { kind: e2e, ref: "tests/sections-audit.spec.mjs#檢查：存檔失敗時畫面與模型一致", status: pass }
    human_judgment: false
  - id: R6
    description: "Full suite green: npm test 843 passed, 27 skipped, 0 failed; undo spec stable (600/600 under 24 workers)"
    requirement: AI-06
    verification:
      - { kind: e2e, ref: "npm test", status: pass }
      - { kind: e2e, ref: "tests/undo.spec.mjs#復原：只換一格 (repeat-each=600)", status: pass }
    human_judgment: false
  - id: R7
    description: "Real iPad / iPhone Safari / Android Chrome feel (handle drag, 0.4 s card hold, phone auto-switch, 0.5 s label long-press), 44 px bar cost, swatches in day / night, 注音 typing with counts and undo, iOS shake-to-undo, keyboard staying up on ↶"
    requirement: EDIT-02
    verification: []
    human_judgment: true
    rationale: "CDP touch and headless Chromium cannot reproduce iOS gesture arbitration, real finger size, real IME or the look of colors; listed for Andy in both checklists (2-34 … 2-38, 4-23 … 4-25)"
---

# Phase 9 Plan 10: Phase gate Summary

The whole of Phase 9 now runs as one continuous browser session and survives every interruption the UI-SPEC lists; the suite is green (843 passed, 27 skipped, 0 failed), the long-standing flaky undo spec is explained and fixed, and Andy has a plain-language checklist plus 17 decisions to approve.

## What was built

- **tests/sections-journey.spec.mjs (new):** one spec, 1440x900 with both panels open, v0.96 fixture. Upgrade shows Verse / Chorus / Bridge; click Chorus (becomes Inter, see deviations); right-click, 顏色：紅, Esc; Bridge dragged above it by its handle; first section resized +60 px by its bar; type `abc`, ↶, ↷; delete the last section and press the toast's 復原; AI card dragged to index 0 of the first textarea; storage asserted with `activeSongRaw` (no flush); reload; ids, names, color `#e05d5d`, stored height, textarea height, texts all as left, ↶ ↷ aria-disabled; TXT download `[heading]` lines equal the button texts in order.
- **tests/sections-audit.spec.mjs (new, 11 specs):** 十二段的編號與捲動; 切版型時中止 (popover, section drag, resize, word drag across 1440 / 820 / 390 / 1440, model unchanged, no trace classes or overlays); 收起歌詞面板時中止 (desktop collapse, phone `mobileTab('search')`; popover / drag / resize, ↶ still enabled); 另一個分頁改了這首歌 (section drag, popover, word drag; other tab's text shown, history cleared); 三種裝置的觸控大小 (phone, tablet portrait, tablet landscape, toast + popover passes, `mustSee` for every control in the plan); 標題列在各尺寸都放得下; 惡意文字只當文字; 新程式沒有拼 HTML (acorn syntax tree, with a self-check that it catches the sinks); 沒有新增動畫 (counts at 905320a vs now); 重新整理後一模一樣、匯出照名稱 (TXT, Markdown, PDF print sheet, 備份全部 file); 存檔失敗時畫面與模型一致 (backstop).
- **Seam fixes:** `css/panels.css` (`.lyrics-section:not(.collapsed) { min-height: 9rem }`), `js/songs.js` (`isEditingField` requires a `textarea` / `input`).
- **Checklists and handoff:** `.planning/TEST-CHECKLIST.md` Phase 9 section (09-01-1 … 09-10-2, 09-CTX-1 … 09-CTX-17); `.planning/驗收清單-精簡版.md` 2-34 … 2-38, 4-23 … 4-25, 5-92 … 5-108 (header table recounted: 38 / 25 / 107, total 194; 2-30's stale 「段落 1」 wording corrected); `handoff.md` Phase 9 block.

## Task commits

| Task | Commit | Summary |
|------|--------|---------|
| flaky fix (before Task 1) | d7887cb | undo spec waits for the browser's scroll animation to rest |
| 1 (tracer) | 1b02d17 | sections-journey.spec.mjs |
| 2 (seam fixes) | aa32ea5 | min-height 9rem; isEditingField text fields only |
| 2 (audits) | 8299ae6 | sections-audit.spec.mjs, 11 specs |
| 3 | 398ac83 | handoff.md (checklists are under .planning and not committed: commit_docs=false) |

Tracer gate: the Task 1 `<verify>` is automated-only and `human_verify_mode` is end-of-phase, so the verify set (journey, sections-ui, sections-drag, undo, word-drag: 104 passed) was run end to end before expanding to the audits.

## Verification

- `npm test`: **843 passed, 27 skipped, 0 failed** (run twice, identical; the 27 skips are the opt-in perf / parity / golden-update specs, unchanged from Phase 8's 27). Visual specs pass unchanged: no -darwin baseline was regenerated, `git diff` of `*-linux.png` is empty.
- `npx playwright test tests/sections-audit.spec.mjs`: 11 passed. `tests/sections-journey.spec.mjs`: 1 passed.
- Acceptance greps: `grep -c "?v=0.96.13" index.html` = 34, `?v=0.96.12` = 0; `flushAndReadActiveSong` in the journey = 0; `git diff --stat 905320a -- package.json package-lock.json` empty; JS_ORDER lists 26 files (split-tags passes).
- Mutation checks (each reverted): removing the `lhWordDragCancel()` call from `lhSecAbortInteractions` fails both 切版型時中止 (拖詞中) and 另一個分頁改了這首歌 (拖詞).

## The flaky 「復原：只換一格」: root cause

Reproduced at about 1 in 120 runs under 24 workers. Instrumenting the page showed that `list.scrollTop` was already 20-50 px lower than the baseline (`top`) **before** the undo click, with no `scrollIntoView` call, no `scrollTop` assignment and no layout change in between; the only two product writes were `switchSong` (-> 0) and the undo restore, and the restore always wrote exactly the value the list had at undo time. The mover is a leftover Chromium smooth scroll (caret reveal after Home / End / typing in a textarea inside a short scroll container) that finishes a few frames after Playwright's click. So the product restores scroll correctly; the test read its baseline too early. Fix: `scrollRest()` in tests/undo.spec.mjs waits (real time) until `scrollTop` is unchanged for three reads, before the structural step and before reading the baseline. 600/600 passed afterwards.

## Deviations from Plan

**1. [Rule 1 - Bug] Many sections on desktop were squeezed to header-only rows.**
- **Found during:** Task 2 (「檢查：十二段的編號與捲動」).
- **Issue:** at 1440x900, 12 sections were each 32 px tall (the textarea clipped by `overflow: hidden`), so the list never scrolled and the lyrics were unreadable; Phase 5's 9rem minimum only applies at <= 900.
- **Fix:** `.lyrics-section:not(.collapsed) { min-height: 9rem }` in css/panels.css (sections with a stored height are released by the existing `data-h` rule). Full suite, including layout and visual specs, stays green.
- **Files:** css/panels.css. **Commit:** aa32ea5.

**2. [Rule 1 - Bug] A cross-tab update was held back while focus sat on a button.**
- **Found during:** Task 2 (「檢查：另一個分頁改了這首歌」, section drag case).
- **Issue:** `isEditingField` treated any focused element inside `#lyricsSections` as editing, so with focus on the ⋮⋮ handle the Phase 8 reload waited until focusout; the drag would then drop into a stale model.
- **Fix:** only a focused `textarea` / `input` counts. The reload now runs immediately, `renderLyricsSections` -> `lhSecAbortInteractions` cancels the gesture, and the history for that song restarts (UI-SPEC multi-tab row). Typing protection is unchanged (songs-crosstab specs pass).
- **Files:** js/songs.js. **Commit:** aa32ea5.

**3. [Plan text vs code] Journey expects Inter, not Pre-Chorus.** The cycle order is Intro, Verse, Pre-Chorus, Chorus, Inter, Bridge, Outro, Custom, so one click on Chorus gives Inter. The journey follows the real order; everything else in the plan's journey is exercised as written.

**4. [Test-only]** 「檢查：切版型時中止」 and 「收起歌詞面板時中止」 scroll the handle / bar into view before pressing (phone sheet); popover title and section ghost assertions match the truncated name (`段落設定：<img src=x onerr…`); the touch audit measures the toast pass and the popover pass separately because each covers the other's controls.

**5. [Plan scope] No separate theme audit.** The plan's Task 2 list has no theme spec; 09-08 already proves the three-theme contrast. Not re-added here.

**Total deviations:** 2 auto-fixed bugs, 3 notes. **Impact:** two small product changes, both covered by the new audits.

## Autonomous decisions added to Andy's checklists

09-CTX-1 … 17 (TEST-CHECKLIST) = 5-92 … 5-108 (精簡版): B1 English names, B2 single type not numbered, B6 next-type guess, C5 undo toast instead of confirmation, E1 English words counted as one, F1 char cards draggable, F7 phone auto-switch to 歌詞, A3 old songs export English headings, UI-SPEC D-16 (.lyrics-tools row), D-10 aria-disabled, D-11 44 px bar, collapsed-panel toast for word drag, toast button currentColor border, legacy single-song mode keeps no colors / heights, 9rem minimum (new), cross-tab reload on non-text focus (new), undo-spec timing fix (note).

## Andy to-dos (not done here)

- **-linux baselines:** 「在雲端容器執行 npm run visual:update，更新 -linux 截圖基準」 (only -darwin is checked on this Mac; -linux files untouched). Also in handoff.md.
- Real-device checks (2-34 … 2-38, 4-23 … 4-25) and the 17 decisions above. No push, no deployment, no account steps were attempted.

## Authentication Gates

None.

## Known Stubs

None.

## Threat Flags

None. T-09-22 mitigated (切版型時中止, 收起歌詞面板時中止, 另一個分頁改了這首歌 pass, mutation-checked); T-09-23 mitigated (惡意文字只當文字 + syntax-tree scan of the four new files); T-09-24 accepted (docs only); T-09-SC: no package installed, package.json and package-lock.json unchanged since 905320a.

## Next Phase Readiness

Phase 9 is ready for `/gsd-verify-work 09` (real-device UAT). Requirements EDIT-02, EDIT-03, EDIT-05, EDIT-06, EDIT-07, AI-06 closed.

## Self-Check: PASSED

Created files exist (tests/sections-journey.spec.mjs, tests/sections-audit.spec.mjs); commits d7887cb, 1b02d17, aa32ea5, 8299ae6, 398ac83 found in git log; acceptance greps pass; `npm test` 843 passed / 27 skipped / 0 failed.
