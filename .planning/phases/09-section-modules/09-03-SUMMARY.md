---
phase: 09-section-modules
plan: 03
subsystem: section-word-count
tags: [sections, word-count, text-node, ime, lyrics-tools, playwright, node-vm]
status: complete
requires:
  - phase: 09-section-modules
    provides: "09-02 lhSecApply / lhSecRefreshMeta / delegated header click (already excludes .section-count from collapse), header built in renderLyricsSections"
provides:
  - "js/sections-core.js lhCountWords(text) (private _LH_CJK / _LH_WC_RE)"
  - "js/sections.js lhSecCountAll(), lhSecCountOne(secEl), lhSecCountFrom(target), module Map _lhSecCounts"
  - "DOM: span.section-count (one Text node) in every header; div.lyrics-tools > span#songTotal.lyrics-total (one Text node) as first child of .lyrics-main"
  - "CSS: .section-count, .lyrics-tools, .lyrics-total; margin-inline-start:auto moved from .section-remove to .section-count"
affects: [09-04 undo/redo buttons join .lyrics-tools, 09-06 drag, 09-10 verification]
actuals:
  tokens: 18000
  tasks: 2
  commits: 2
plan_head_before: 38c8e7c33b3b7e4ae1770c003c2e629ea51d1fad
plan_head_after: ecbb79ba047a9c52db307179538892b2655305ec
commits: 2
tech-stack:
  added: []
  patterns:
    - "live numbers written through a Text node's .data created once, so typing / composition cause zero childList mutations"
    - "per-section count cache (Map id -> n); total = sum over the current song's sections; only the edited section is recounted"
key-files:
  created: []
  modified: [js/sections-core.js, js/sections.js, js/lyrics.js, index.html, css/panels.css, tests/sections-core.spec.mjs, tests/sections-ui.spec.mjs, tests/visual.spec.mjs-snapshots/desktop-lyrics-darwin.png, tests/visual.spec.mjs-snapshots/phone-lyrics-darwin.png, tests/visual.spec.mjs-snapshots/tablet-lyrics-darwin.png]
key-decisions:
  - "D-16 deviation (orchestrator decision): 「共 N 字」 lives in a new row div.lyrics-tools above #lyricsSections, not in .lyrics-head, so .lyrics-head keeps exactly four children"
  - "Event helper lhSecCountFrom(target) filters to .section-textarea so the context textarea (same listener) is never counted"
requirements-completed: []
duration: ~15 min
completed: 2026-10-23
coverage:
  - id: E1
    description: "Counting rule: Han / kana / Hangul / Bopomofo 1 each, other letter or digit runs 1 (internal apostrophe keeps one word), space / punctuation / emoji 0; integer from match count (CJK Ext B correct); non-string 0; 1M characters < 100 ms"
    requirement: EDIT-07
    verification:
      - { kind: unit, ref: "tests/sections-core.spec.mjs#字數：規則表", status: pass }
      - { kind: unit, ref: "tests/sections-core.spec.mjs#字數：一百萬字不卡", status: pass }
    human_judgment: false
  - id: E2
    description: "Each header shows 「N 字」, #songTotal shows 「共 N 字」 (sum), updates on typing, switching songs shows the new song's total, all-empty song shows 共 0 字"
    requirement: EDIT-07
    verification:
      - { kind: e2e, ref: "tests/sections-ui.spec.mjs#字數：打字即時更新", status: pass }
      - { kind: e2e, ref: "tests/sections-ui.spec.mjs#字數：全部是空段落顯示共 0 字", status: pass }
    human_judgment: false
  - id: E3
    description: "During IME composition neither section count nor total changes; both update at compositionend; typing and composing cause 0 childList mutations in #leftPanel; textarea content untouched by the counter"
    requirement: EDIT-07
    verification:
      - { kind: e2e, ref: "tests/sections-ui.spec.mjs#字數：組字中不變、確認後才變", status: pass }
      - { kind: e2e, ref: "tests/songs-ime.spec.mjs#組字：不重畫也不跳游標", status: pass }
    human_judgment: false
  - id: E4
    description: "Collapse, type change and reorder never change the song total"
    requirement: EDIT-07
    verification:
      - { kind: e2e, ref: "tests/sections-ui.spec.mjs#字數：排序收合換類型不影響總數", status: pass }
    human_judgment: false
  - id: E5
    description: "Held-out backstop: 390px at 150%, three Pre-Chorus sections with 999 字 keep chevron, type button, count and − on one line inside the section with no overlap"
    requirement: EDIT-07
    verification:
      - { kind: e2e, ref: "tests/sections-ui.spec.mjs#字數：150% 長名稱與大字數不擠", status: pass }
    human_judgment: false
  - id: E6
    description: "Whether the small 「N 字」 at the header's right end and the 「共 N 字」 row above the sections look right, and whether the total row (instead of sitting in the title bar) is acceptable (D-16 deviation)"
    requirement: EDIT-07
    verification: []
    human_judgment: true
    rationale: "visual taste and placement; flagged for UAT"
---

# Phase 9 Plan 03: Word count per section and song total Summary

Every section header now shows a live 「N 字」 and a new row above the sections shows 「共 N 字」; both are written through pre-created Text nodes and only outside IME composition, so typing and 注音 composition still cause zero DOM churn.

## What was built

- **js/sections-core.js:** `lhCountWords` (RESEARCH Pattern 1 regex, Unicode property escapes). Count comes from `matchAll` iterations, never UTF-16 length. Non-string returns 0.
- **js/sections.js:** `_lhSecCounts` Map (id -> count); `lhSecCountAll()` recounts every section of the current song and writes each `.section-count` text node plus the total; `lhSecCountOne(secEl)` recounts one section from the model (never reads or writes the textarea) and refreshes the total; `lhSecCountFrom(target)` is the event-side filter (only `.section-textarea`).
- **js/lyrics.js:** header gets `span.section-count` holding one empty Text node (after the type button); `renderLyricsSections` ends with `lhSecCountAll()`; the `input` listener calls `lhSecCountFrom` only when `!_lhComposing && !e.isComposing`; `compositionend` calls it after `syncFromField` and `flushSongs`.
- **index.html:** `<div class="lyrics-tools"><span id="songTotal" class="lyrics-total">共 0 字</span></div>` is the first child of `.lyrics-main`.
- **css/panels.css:** `.lyrics-tools` (2rem row), `.lyrics-total`, `.section-count` (0.75rem / 400 / secondary / tabular-nums / nowrap / no shrink / `margin-inline-start: auto`); the auto margin was removed from `.section-remove`. No new colour literals, keyframes or transitions.

## Task commits

| Task | Commit | Summary |
|------|--------|---------|
| 1 (tracer) | 131fc1a | lhCountWords, count spans, total row, styles, 「字數：打字即時更新」, lyrics -darwin baselines |
| 2 | ecbb79b | rule table, 1M timing, composition freeze, total invariance, empty song, 150% backstop |

Tracer gate: `<verify>` is automated-only and `human_verify_mode` is end-of-phase, so the full verify was re-run end to end after the tracer work and execution continued. RED for Task 1 was recorded (the new UI test failed with an empty count list before implementation).

## Deviations from Plan

**1. [Process] Task 2 RED was not visible for the Node and composition tests**
- lhCountWords and the Text-node writes already existed from Task 1 (as the plan prescribes), so 「字數：規則表」, 「一百萬字不卡」, 「組字中不變」 and the backstop passed on first run. Recorded, not faked.

**2. [Rule 1 - Test bug] Wrong expected total in my own test**
- 「字數：排序收合換類型不影響總數」 first expected 共 9 字 for sections of 2 + 2 + 3 characters; the correct sum is 7 ('Hello 123' is 2). Fixed the expectation (test only, no product change).

No CSS change was needed in Task 2 (the 150% backstop passed with the Task 1 rules), so no baseline refresh there.

## Deviation from UI-SPEC D-16 (for UAT)

UI-SPEC D-16 puts the total (and later ↶ ↷) inside `.lyrics-head`. By orchestrator decision this plan uses a separate `.lyrics-tools` row so `.lyrics-head` keeps its four children (`songs-export.spec.mjs` and `songs-ui.spec.mjs` header tests unchanged). 09-04 adds the undo buttons to this row. Costs one extra 2rem row of vertical space (the phone textarea floor checks in layout still pass).

## Refreshed baselines

`tests/visual.spec.mjs-snapshots/desktop-lyrics-darwin.png`, `phone-lyrics-darwin.png`, `tablet-lyrics-darwin.png` (diff was within the 1% tolerance, regenerated with `--update-snapshots=all` after viewing the phone image: new 「共 0 字」 row and 「0 字」 in the header). No `-linux.png` touched.

## Threat model status

- T-09-07 (DoS on every input): only the edited section is recounted; 1,000,000 characters measured well under the 100 ms guard (about 60 ms total test time in Node).
- T-09-SC: no package installed; `package.json` / `package-lock.json` unchanged.

## Known Stubs

None.

## Requirements

EDIT-07 is also declared by 09-10, so it is NOT marked complete in REQUIREMENTS.md here.

## Verification

- `npx playwright test tests/sections-core.spec.mjs tests/sections-ui.spec.mjs tests/songs-ime.spec.mjs tests/style.spec.mjs` -> 44 passed
- `npx playwright test tests/layout.spec.mjs tests/songs-ui.spec.mjs tests/songs-export.spec.mjs tests/split-tags.spec.mjs tests/scan.spec.mjs` -> 138 passed
- `npx playwright test tests/visual.spec.mjs` -> 19 passed
- `-g "字數"`: sections-core 2 passed, sections-ui 5 passed
- Acceptance: `grep -c "function lhCountWords" js/sections-core.js` 1; `class="lyrics-tools"` 1; `id="songTotal"` 1; `git diff --stat package.json package-lock.json` empty.
- Note: the style spec prints `fatal: path 'css/print.css' exists on disk, but not in '952d24f'` (pre-existing git probe noise, tests pass; not touched).

## Andy to-do

- 在雲端容器執行 `npm run visual:update`，更新 -linux 截圖基準（本機只更新 -darwin 的 3 張 lyrics 基準）。
- UAT：字數小字放在標題列右端、「共 N 字」獨立一列（取代放在標題列）看起來是否合意；組字時數字不跳、確認後才變是否符合預期。

## Self-Check: PASSED

- FOUND: js/sections-core.js (lhCountWords), js/sections.js (lhSecCountOne), index.html (.lyrics-tools, #songTotal)
- FOUND commits: 131fc1a, ecbb79b
