---
phase: 10-rhyme-map
plan: 08
subsystem: testing
tags: [rhyme-map, integration-journey, cross-surface-audit, touch-targets, hostile-text, uat-checklist, playwright]
status: complete

requires:
  - phase: 10-rhyme-map
    provides: "10-01..10-07: rhyme-core / rhyme-map, 韻腳 ▾ menu, selection bar, manual readings, strip and stats popover"
provides:
  - "tests/rhyme-journey.spec.mjs: 整合：韻腳地圖一次走完 (ROADMAP criteria 1-5 in one continuous session)"
  - "tests/rhyme-audit.spec.mjs: 9 cross-surface audits (檢查：)"
  - "Phase 10 sections in TEST-CHECKLIST.md and 驗收清單-精簡版.md, handoff.md Phase 10 state"
affects: [Phase 11 (MAP-09/10/11), /gsd-verify-work 10, /gsd-code-review 10, /gsd-secure-phase 10]

actuals:
  tokens: 11004
  tasks: 3
  commits: 3
plan_head_before: 70a4d982b81c4bb83e8b12427d8afed4963f3ab5
plan_head_after: 947620e7f9e8fbfe7bed68e43bb33b4f74c21ed1

tech-stack:
  added: []
  patterns:
    - "Journey spec asserts expected colour families from the page's own dictionary (RHYME_TO_FAMILY via lhRhymeReading), never hard-coded"
    - "Audit spec copies the Phase 9 structure: auditTouchTargets with mustSee per surface, separate passes per popover, acorn HTML-sink scan with a planted-sink self-check"

key-files:
  created:
    - tests/rhyme-journey.spec.mjs
    - tests/rhyme-audit.spec.mjs
  modified:
    - handoff.md
    - .planning/TEST-CHECKLIST.md
    - .planning/驗收清單-精簡版.md

key-decisions:
  - "No seam needed fixing: every audit and the journey passed against the 10-01..10-07 code unchanged; no js/ or css/ file was touched in this plan"
  - "The 'AI request carries the whole song' truth is verified at the moment generateAISuggestions runs (reading lastLyricsSelection and the song text), not from the /ai body: with the stub wordlist the pool is small, the app takes the 'invent words' branch, and that prompt never includes lyrics (the 10-05 spec already pins it this way)"
  - "Other-tab edit while the selection bar is open: the app defers it until the textarea loses focus (Phase 8 isEditingField rule, unchanged); the audit asserts that deferral and then the clean close, instead of expecting an instant reload"

requirements-completed: [MAP-01, MAP-02, MAP-03, MAP-04, MAP-05, MAP-06, MAP-07, MAP-08, MAP-12]

coverage:
  - id: D1
    description: "One continuous 1440x900 session: tails coloured by family (data-f from the page dictionary), a new line committed through 注音 composition with zero mirror childList mutations and zero analyses during it, 韻腳 ▾ switches (段落結構字母 ABABAA, 嚴格 ABCDCC with unchanged data-f, 忽略句尾語助詞 off/on moves the band 亮↔啊, 句中押韻 underlines), select 光 -> 查韻 cards, 的光 -> AI 建議 (whole song at call time, AI cards), 行 -> 指定讀音 -> data-f changes + dotted cue + #lhLive, stats row looks up 道, reload keeps settings/readings/bands/strip, TXT and Markdown and 備份全部 carry no rm- / rhyme-mirror / U+200B and the backup carries lh:map and readings; only /ai POSTs and no off-origin requests"
    requirement: MAP-02
    verification:
      - kind: e2e
        ref: "tests/rhyme-journey.spec.mjs#整合：韻腳地圖一次走完"
        status: pass
    human_judgment: false
  - id: D2
    description: "Touch: 韻腳 ▾, every switch, both radios, 色票對照, 關閉韻腳設定, strip, every stats row, 關閉統計, selection-bar buttons and every reading chip are >= 44x44 with neighbour overlap <= 4 px on 390x844, 820x1180 and 1180x820"
    requirement: MAP-05
    verification:
      - kind: e2e
        ref: "tests/rhyme-audit.spec.mjs#檢查：三種裝置的觸控大小（韻腳地圖）"
        status: pass
    human_judgment: false
  - id: D3
    description: "Menu, stats and bar stay inside the viewport at 390x844 x 150% and 844x390, with every switch, last stats row, 關閉統計 and last reading chip reachable"
    requirement: MAP-04
    verification:
      - kind: e2e
        ref: "tests/rhyme-audit.spec.mjs#檢查：選單、統計、浮動列在小螢幕都看得到"
        status: pass
    human_judgment: false
  - id: D4
    description: "Resizing 1440x900 -> 820x1180 -> 390x844 -> 1440x900 with menu / stats / bar open leaves no .show surface, aria-expanded false everywhere, settings untouched and bands still on their tail characters"
    requirement: MAP-12
    verification:
      - kind: e2e
        ref: "tests/rhyme-audit.spec.mjs#檢查：切版型時收起來"
        status: pass
    human_judgment: false
  - id: D5
    description: "Another tab changing the song or lh:map closes menu / stats / bar and repaints every mirror (bar case waits for the textarea to lose focus, per the Phase 8 rule)"
    requirement: MAP-12
    verification:
      - kind: e2e
        ref: "tests/rhyme-audit.spec.mjs#檢查：另一個分頁改了歌或設定"
        status: pass
    human_judgment: false
  - id: D6
    description: "Hostile lines and a hostile custom section name render as literal text in the mirror, strip label and title, stats title and rows, bar label, #lhLive and the menu; window.__pwn stays undefined, no dialog, no img / script / b under any surface; acorn scan of rhyme-core.js and rhyme-map.js finds no HTML sink or on* assignment, with a planted-sink self-check"
    requirement: MAP-01
    verification:
      - kind: e2e
        ref: "tests/rhyme-audit.spec.mjs#檢查：惡意文字只當文字（韻腳地圖）; #檢查：韻腳地圖新程式沒有拼 HTML"
        status: pass
    human_judgment: false
  - id: D7
    description: "Print sheet, TXT and Markdown contain no rhyme markup and the mirror is not visible in print media; a Phase 9 profile boots with lh:songs byte-identical (also after reload) and without writing lh:map; a backup made now (strict + inner + manual reading) restores through 全部還原 with lh:map and readings"
    requirement: MAP-06
    verification:
      - kind: e2e
        ref: "tests/rhyme-audit.spec.mjs#檢查：列印與匯出沒有韻腳標記; #檢查：舊歌與舊資料"
        status: pass
    human_judgment: false
  - id: D8
    description: "Non-colour cues: mirror aria-hidden, strip letters + aria-label, stats group rows (letter, family text, count) and row aria-labels, switches say 開/關 with aria-checked, 17 legend labels, manual reading has a dotted border and is announced in #lhLive, no new text input"
    requirement: MAP-04
    verification:
      - kind: e2e
        ref: "tests/rhyme-audit.spec.mjs#檢查：顏色以外的線索"
        status: pass
    human_judgment: false
  - id: D9
    description: "Andy's checklists list the Phase 10 real-device checks and all 22 autonomous decisions (10-CTX-1..22 = 5-109..5-130) in plain Traditional Chinese; handoff.md carries the Phase 10 state and the -linux to-do"
    requirement: MAP-12
    verification:
      - kind: manual
        ref: ".planning/TEST-CHECKLIST.md '### Phase 10 韻腳地圖'; .planning/驗收清單-精簡版.md 2-39..2-40, 4-26..4-29, 5-109..5-130; handoff.md"
        status: pass
    human_judgment: true
---

# Phase 10 Plan 08: Final Integration and Gate Summary

韻腳地圖從頭到尾當成一次寫詞來跑：上色、用注音打新句、韻腳選單的每個開關、反白查韻與 AI 建議、指定讀音、字母條統計、重新整理、匯出與備份，全部在同一個連續的 session 裡通過；再把三種裝置的 44px、小螢幕、切版型、別的分頁、惡意文字、列印匯出、舊資料、顏色以外的線索一次量完——沒有找到需要修的接縫，所以這一份計畫沒有改任何 js／css。

## Performance

- **Tasks:** 3 (1 tracer, 2 auto); **commits:** 3 (`5515af3`, `7eb1a52`, `947620e`); about 20 minutes of wall clock between the first and last commit
- **Files:** 2 test files created (`tests/rhyme-journey.spec.mjs` ~300 lines, `tests/rhyme-audit.spec.mjs` ~500 lines), `handoff.md` updated and committed; both checklists edited in the working tree (`.planning` is not committed, commit_docs=false)
- **`npm test` (final run, on this Mac):** **964 passed, 28 skipped, 0 failed** (10-07 baseline 954 / 28; +1 journey, +9 audits). The 28 skips are the same pre-existing ones as before this plan.
- **Perf gate `LH_PERF=1 npx playwright test tests/rhyme-map-perf.spec.mjs --workers=1`:** 2 passed (150 lines x 4 typing runs: longest task 0 ms, 0 long tasks, threshold 50 ms; `lhRhymeAnalyze` 200 lines median 0.30 ms, threshold 20 ms)
- **Visual:** `npx playwright test tests/visual.spec.mjs` 19 passed with the existing `-darwin` baselines; no snapshot file changed and no `-linux` file touched
- **Stability:** the journey and the nine audits were run three times in a row (`--repeat-each=3`), 30 of 30 passed
- `package.json` / `package-lock.json` unchanged; `grep -c "?v=0.96.14" index.html` = 36 and no other `?v=` value exists (all tags consistently 0.96.14); `JS_ORDER` in `tests/split-tags.spec.mjs` lists 28 files

## Accomplishments

- **Tracer (`5515af3`).** `整合：韻腳地圖一次走完` drives the real UI at 1440x900 with both panels open and walks ROADMAP criteria 1-5 in order; expected colour families are read from the page's own dictionary.
- **Audits (`7eb1a52`).** Nine `檢查：` tests: touch size on three devices (menu with 色票對照 expanded, strip, stats, bar with the reading row open), small screens, breakpoint changes, another tab, hostile text, HTML-sink scan with self-check, print / export, old data and backups, non-colour cues.
- **Docs (`947620e`).** `handoff.md` Phase 10 state; Andy's checklists (see below).

## Deviations from Plan

### Auto-fixed Issues

None. No seam was found in any of the owning files, so `js/rhyme-core.js`, `js/rhyme-map.js` and `css/panels.css` are unchanged in this plan, and no earlier plan's assertion was weakened or removed.

### Notes on plan execution (test-side corrections, not code changes)

- **Same selection range does not bring the bar back** (10-05, deliberate): the journey selects 「光」 for 查韻 and then 「的光」 for AI 建議.
- **AI "whole song" check:** the plan text says an `/ai` request carrying the whole song. With the stub wordlist the candidate pool is small, so the app takes the "invent words" branch and that prompt contains no lyrics at all (the lyrics block only exists in the "enough candidates" branch). The journey therefore asserts what 10-05 already pins: at the moment `generateAISuggestions` runs, `lastLyricsSelection` is empty and the song text includes the second section, plus that an `/ai` POST happened and that it is the only non-GET request of the whole session.
- **Another tab while the bar is open:** the selection bar only exists while the textarea has focus, and Phase 8's `isEditingField` rule defers another tab's song update until focus leaves. The audit asserts the deferral (text unchanged after 500 ms), blurs, then asserts the clean close and repaint. Menu and stats cases reload immediately as the plan says.
- **Stats rows cut long lines** with 「…」, so the hostile-text check matches the readable prefix of the line (`你<img src=x o`), not the whole string.
- **Header-comment grep:** the journey's first comment line originally contained 「整合：」, which made `grep -c "整合：" ` print 2; it was reworded so the count is exactly 1 as the acceptance criterion requires.
- The static scan in the audit also flags `.onxxx =` assignments (the Phase 9 scan only listed three sinks); `js/rhyme-core.js` and `js/rhyme-map.js` have none.

## Andy's checklists

- `.planning/TEST-CHECKLIST.md`: new `### Phase 10 韻腳地圖（10-01～10-08 …）` section after the Phase 9 one: what changed for the user, what the automatic tests prove, 9 real-device / look items (10-01-1 .. 10-07-2) and **10-CTX-1 .. 10-CTX-22**.
- `.planning/驗收清單-精簡版.md`: 第 2 級 +2 (2-39 注音組字, 2-40 浮動列／指定讀音／統計), 第 4 級 +4 (4-26 色彩日夜與戶外, 4-27 17 色分辨與孤句淡度, 4-28 手機「韻腳 ▾」位置與標題列擠不擠, 4-29 Safari／Firefox 對齊與慣性捲動), 5-B table **5-109 .. 5-130** each with ☐同意 ☐不同意; header count table now 5 / 40 / 19 / 29 / 129 = 222; a Phase 10 intro paragraph.
- **The 22 decisions added (10-CTX-n = 5-(108+n)):** B1 background highlighter; B2 strict keeps family colours; B3 faint orphans; C3 letters and stats off by default; D1 select-then-bar instead of single click; E1 了／的／嗎 count as particles; A3 manual reading bound to the line's last 4 characters; OQ1 strict: 詩／知／字／思 are different rhymes (wide groups them as 空韻); OQ2 wide: 人／風 different colours although 查韻 borrows between them; OQ6 multi-character selection looks up its last character; D-06 bands hidden while stale; D-10 look up from stats rows, not by tapping a letter; D-11 no hover popover; planner choices: 17th neutral colour for 空韻, 指定讀音 label and tail-only condition, inner rhyme skips particles, no line-end letters until Phase 11, AI 建議 from the bar uses the whole song, readings are not an undo step, settings change repaints all sections; plus two found while building: same range after Esc does not re-show the bar (10-05), long-section stats popover can cover its strip and does not follow scroll (10-07).

## Known Stubs

None.

## Threat Flags

None new. T-10-16 mitigated by `檢查：惡意文字只當文字（韻腳地圖）` and the acorn sink scan with a planted-sink self-check (both green). T-10-17 mitigated by `檢查：切版型時收起來` and `檢查：另一個分頁改了歌或設定` (no stray `.show`, settings string untouched, bands re-aligned). T-10-18 accepted (docs only; no keys). T-10-SC: no package installed, `package.json` / `package-lock.json` unchanged.

## Items for Andy (not done unattended)

- **-linux baselines:** `在雲端容器執行 npm run visual:update，更新 -linux 截圖基準` (accumulates Phase 5-10; the lyrics baselines now also need the 「韻腳 ▾」 button). This Mac only compares and keeps `-darwin`; no `-linux` file was touched. Also recorded in `handoff.md`.
- **Real devices** (iPad / iPhone Safari, Android Chrome): checklist items 2-39, 2-40, 4-26 .. 4-29 (colours day / night / outdoors, 16 + 1 distinguishable, orphans too faint, selection bar after long-press with iOS handles and callout, 注音 composition without flicker or lag, strip crowding in the phone header, 「韻腳 ▾」 position on the phone toolbar, alignment in Safari / Firefox and during iOS inertial scrolling).
- **Decisions to approve or veto:** 5-109 .. 5-130 above.
- **Cache-busting:** `?v=` is 0.96.14 everywhere (36 tags). 10-03 .. 10-07 changed js / css after the 10-01 bump without re-bumping; 0.96.14 was never deployed, so this is fine. Nothing was pushed or deployed.
- **Next:** `/gsd-code-review 10` and `/gsd-verify-work 10`; MAP-09 / MAP-10 / MAP-11 belong to Phase 11 and are intentionally not marked complete.

## Self-Check: PASSED

- Files exist: `tests/rhyme-journey.spec.mjs`, `tests/rhyme-audit.spec.mjs`, `handoff.md`, both checklists, this SUMMARY.
- Commits `5515af3`, `7eb1a52`, `947620e` in `git log`; `rev-list --count` since the ledger base is 3.
- Acceptance greps: `整合：` in the journey spec 1; `檢查：` in the audit spec 10 (9 tests plus the header comment); `?v=0.96.14` in `index.html` 36; `Phase 10` in `TEST-CHECKLIST.md` 1, in `handoff.md` 5; `5-109` in the short checklist 2; `git diff --name-only HEAD -- 'tests/visual.spec.mjs-snapshots/*-linux.png'` prints nothing; `git diff --stat HEAD -- package.json package-lock.json` empty.
- Full `npm test`: 964 passed, 28 skipped, 0 failed; perf gate green.
