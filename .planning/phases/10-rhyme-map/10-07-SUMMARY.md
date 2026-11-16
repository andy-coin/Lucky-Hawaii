---
phase: 10-rhyme-map
plan: 07
subsystem: ui
tags: [rhyme-map, section-header, rhyme-scheme, stats-popover, a11y, header-fit, playwright]
status: complete

requires:
  - phase: 10-rhyme-map
    provides: "10-01 lhRhymeAnalyze {rows, letters, count}; 10-03 lhMapPaint + cache; 10-04 韻腳 menu and switch rows, lhMapCloseAll; 10-05 lhMapLookup; 10-06 row.manual"
provides:
  - "lhRhymeSummary(result, strict) -> { n, k, p, groups } in js/rhyme-core.js"
  - "button.section-rhyme in every section header (hidden by default), excluded from the collapse toggle"
  - "段落結構字母 switch (setting key letters), _lhMapStrip (strip painting inside lhMapPaint)"
  - "#rhymeStats, lhMapOpenStats(secEl, byKeyboard), lhMapCloseStats(refocus), _lhMapStatsRefresh(secId)"
affects: [10-08 UAT list and hostile-text audit]

actuals:
  tokens: 14000
  tasks: 3
  commits: 3
plan_head_before: 605e43d5f46198fc9f1485b190cf172837af57f5
plan_head_after: 70a4d982b81c4bb83e8b12427d8afed4963f3ab5

tech-stack:
  added: []
  patterns:
    - "The strip is written only inside lhMapPaint (via _lhMapStrip), so it never changes during composition; the analysis result is stored in the paint cache entry (res) and the stats popover reads it from there"
    - "Stats popover = rebuilt-from-scratch content on every open and on every repaint of its section; keyboard focus is restored to the same row index"

key-files:
  created: []
  modified:
    - js/lyrics.js
    - js/sections.js
    - js/rhyme-core.js
    - js/rhyme-map.js
    - css/panels.css
    - tests/rhyme-core.spec.mjs
    - tests/rhyme-map-ui.spec.mjs

key-decisions:
  - "Only-letters mode (end and inner both off) skips building the mirror content; the mirror stays empty and rm-on is not set"
  - "Stats opened on a section whose cached analysis is out of date (typing within the 200 ms debounce) repaints that section first, so the numbers always match the text"
  - "A section that becomes un-analysable while its stats are open keeps the popover open with the empty message; because the strip is then hidden, the popover is only re-clamped in place instead of re-anchored"
  - "The popover can cover the strip it was opened from when the section is too long to fit below or above (same clamp rule as the Phase 9 section menu); Esc, 關閉統計 and outside pointerdown still close it"
  - "Tail character shown for a '-' row is the last letter/digit of the line (e.g. y of 'Oh baby'); those rows are aria-disabled with the aria-label 「第 {i} 句，沒有可查的句尾」"
  - "嚴格 mode group labels are the 韻母 itself (including ㄓ ㄕ ㄗ ㄙ); 空韻 appears as a label only in 寬韻"

requirements-completed: []

coverage:
  - id: D1
    description: "段落結構字母 switch between 句尾上色 and 句中押韻 (default 關, hint linked by aria-describedby); on: every section with a rhyme shows the strip AABB / ABAB (寬) / ABCD (嚴格) / A-AB; off: all strips hidden and empty; setting survives reload; works with 句尾上色 off"
    requirement: MAP-04
    verification:
      - kind: e2e
        ref: "tests/rhyme-map-ui.spec.mjs#標題字母：打開後顯示 AABB"
        status: pass
    human_judgment: false
  - id: D2
    description: "Strip click / Enter / Space never collapses the section; header DOM order handle, chevron, name, strip, count, minus; aria-label and title copy; letters underlined only when the line has a rhyme"
    requirement: MAP-04
    verification:
      - kind: e2e
        ref: "tests/rhyme-map-ui.spec.mjs#標題字母：點字母條不會收合段落; #標題字母：打開後顯示 AABB"
        status: pass
    human_judgment: false
  - id: D3
    description: "lhRhymeSummary: F-AABB 4/4/100 groups A ㄤ 2, B ㄠ 2; F-ABAB strict 0/0 four singletons; F-PART n 4 k 2 p 50; F-KONG wide 空韻 count 4; empty text zeros; 60 groups never produce 'undefined'"
    requirement: MAP-04
    verification:
      - kind: unit
        ref: "tests/rhyme-core.spec.mjs#統計：寬韻 AABB…; #統計：嚴格 ABAB…; #統計：英文行算一句…; #統計：空韻; #統計：沒有任何文字; #統計：超過 52 種…"
        status: pass
    human_judgment: false
  - id: D4
    description: "Stats popover content (title, structure, summary, 判定, groups with （孤句）, 逐句 rows with aria-labels, 關閉統計), placed under the strip, no focus steal on pointer open, toggles on a second strip click"
    requirement: MAP-04
    verification:
      - kind: e2e
        ref: "tests/rhyme-map-ui.spec.mjs#統計：內容"
        status: pass
    human_judgment: false
  - id: D5
    description: "A line row runs 查韻 for its tail (desktop: search box + cards, popover closes, keyboard Enter returns focus to the strip; phone: switches to the 查韻 tab); '-' rows do nothing"
    requirement: MAP-05
    verification:
      - kind: e2e
        ref: "tests/rhyme-map-ui.spec.mjs#統計：點一列就查那句的句尾; #統計：手機點一列查韻會切到查韻分頁"
        status: pass
    human_judgment: false
  - id: D6
    description: "Empty state (only title and 這個段落還沒有可分析的句尾) when the section stops being analysable while open; rebuilt when it becomes analysable again; blank section has no strip"
    requirement: MAP-04
    verification:
      - kind: e2e
        ref: "tests/rhyme-map-ui.spec.mjs#統計：沒有可分析的句尾"
        status: pass
    human_judgment: false
  - id: D7
    description: "Closing and focus: keyboard open focuses first row, Esc returns focus to strip, Space opens, outside click, 關閉統計, no close on focusout; closes on 韻腳 menu open, selection bar show, section menu open, section delete, song switch, left panel collapse"
    requirement: MAP-04
    verification:
      - kind: e2e
        ref: "tests/rhyme-map-ui.spec.mjs#統計：關閉與焦點"
        status: pass
    human_judgment: false
  - id: D8
    description: "Section name cut to 16 code points + 「…」 in the stats title (exactly 16 untouched)"
    requirement: MAP-04
    verification:
      - kind: e2e
        ref: "tests/rhyme-map-ui.spec.mjs#統計：名稱太長時截斷"
        status: pass
    human_judgment: false
  - id: D9
    description: "Header fit at 390x844, 820x1180, 1440x900 x scale 100 / 150 with collapsed section and a 40-character name: all six header parts inside the section, one line, no pairwise overlap; Tab order handle, name, strip, minus"
    requirement: MAP-04
    verification:
      - kind: e2e
        ref: "tests/rhyme-map-ui.spec.mjs#標題字母：各尺寸都放得下"
        status: pass
    human_judgment: false
  - id: D10
    description: "Zero / one / many: 1 line A + 0% + orphan band; AA 100%; identical adjacent lines one group; 14 lines = 12 letters + 「…」 with full 14 in stats; 30 distinct 韻母 in 嚴格 continue in lowercase; no undefined / NaN / null anywhere"
    requirement: MAP-04
    verification:
      - kind: e2e
        ref: "tests/rhyme-map-ui.spec.mjs#標題字母：零、一、多句"
        status: pass
    human_judgment: false
  - id: D11
    description: "Touch: strip, every stats row and 關閉統計 at least 44x44 on phone, tablet, landscape tablet with no overlaps; #rhymeStats fully inside the viewport at 390x844 scale 150 and 844x390 and scrolls internally to its last row"
    requirement: MAP-04
    verification:
      - kind: e2e
        ref: "tests/rhyme-map-ui.spec.mjs#標題字母：觸控大小與可見範圍"
        status: pass
    human_judgment: false
  - id: D12
    description: "Prohibition: a writer who has not turned the switch on never sees letters or stats (default letters false, no strip, no #rhymeStats node)"
    requirement: MAP-04
    verification:
      - kind: e2e
        ref: "tests/rhyme-map-ui.spec.mjs#標題字母：打開後顯示 AABB; #統計：內容 (no #rhymeStats node before first click)"
        status: pass
    human_judgment: false
---

# Phase 10 Plan 07: Section Rhyme Letters and Stats Summary

打開韻腳選單的「段落結構字母」後，每個有韻的段落標題列多一顆字母條（AABB、ABAB、A-AB…，字母底線是該句句尾的家族色），按下去在字母條底下開統計：共幾句押韻幾句、每個韻出現幾次，再下面一句一列，點哪一句就查哪一句的句尾字。預設關，沒打開的人完全看不到。

## Performance

- **Tasks:** 3 (1 tracer, 2 auto); **commits:** 3 (`fe1dac1`, `47595d8`, `70a4d98`)
- **Files:** 7 modified (`js/rhyme-map.js` +~216, `js/rhyme-core.js` +18, `js/lyrics.js` +7, `js/sections.js` 1 line, `css/panels.css` +~72, `tests/rhyme-core.spec.mjs` +47, `tests/rhyme-map-ui.spec.mjs` +~454)
- **`npm test`:** 954 passed, 28 skipped, 0 failed (10-06 baseline 937 / 28); `package.json` / `package-lock.json` untouched; no `-linux` snapshot touched

## Accomplishments

- **Tracer (`fe1dac1`).** Switch row + hint, `button.section-rhyme`, collapse exclusion, strip painting inside `lhMapPaint`, strip CSS with family-color underlines, two specs (`標題字母：打開後顯示 AABB`, `點字母條不會收合段落`).
- **Stats (`47595d8`).** `lhRhymeSummary` (the strip title now routes through it), `#rhymeStats` with every close path, line rows that call the existing `lhMapLookup`, six Node and six browser specs.
- **Fit and boundaries (`70a4d98`).** Header-fit across 3 devices x 2 scales, zero/one/many, 30-韻母 strict, touch size and viewport specs; one CSS adjustment (below).

## As implemented

- **Strip.** Shown when the switch is on and at least one line has a rhyme; up to 12 spans (one per non-blank line, letter or `-`, `data-f` only for lines with a rhyme) then 「…」; `aria-label` 「押韻結構 {full letters}，按一下看統計」, `title` 「{letters}　押韻 {k}/{n} 句，點一下看統計」 (full string, not cut). Over 5,000 lines or `LH_WD_BIG` characters it shows 「—」 with title 「段落太長，不做押韻分析」. Rebuilt only in `lhMapPaint`, so never during composition; hidden strips carry no children and no label.
- **Analysis reuse.** `lhMapPaint` now analyses when any of end / inner / letters is on and keeps the result as `res` in `_lhMapCache`; with only letters on, the mirror content is not built.
- **Popover.** Built once on first open (`.word-ctx-menu.section-menu`, `role=dialog`, `aria-label 韻腳統計`), content rebuilt with `textContent` on each open and each repaint of its section. Placed under the strip with the flip-above rule; the strip carries `aria-expanded`. Second strip click toggles it closed; pointerdown on any strip does not count as "outside".
- **Closing.** Esc (focus to strip), outside pointerdown, 關閉統計 (focus to strip), `lhMapCloseAll` (render, breakpoint, panel collapse, 韻腳 menu, section menu), selection bar show, section removed (`lhMapRenderAll` check). Focus loss alone does not close it.
- **Header shrink order (CSS adjustment).** At 390 px and 150 % scale the six header parts needed about 380 px in 345 px. `.section-type` now has `flex: 0 100 auto` (shrinks first, strip next) and, only while a strip is shown, `min-width: max(44px, 1rem)` for both name and strip on coarse / <= 900 layouts (the Phase 9 floor was `var(--hit)` = 66 px at 150 %). Handle, count and minus still never shrink.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] px rule in the layout scan**
- **Found during:** Task 3 full-suite run (`tests/layout.spec.mjs` 「縮放：尺寸一律用 rem」)
- **Issue:** `min-width: 44px` was flagged as a raw px declaration.
- **Fix:** `max(44px, 1rem)` (an allowed `max()` floor, same effect at every scale used).
- **Files modified:** `css/panels.css`
- **Commit:** `70a4d98`

### Notes on plan execution

- Task 1 computed the strip's `k`/`n` inline (as the plan allows); Task 2 replaced that with `lhRhymeSummary`. The CSS floor change above landed together with Task 3's tests rather than in Task 1, because only the 150 % phone fit test showed it was needed.
- Three tests of my own had wrong expectations that were corrected (not the code): F-PART in 嚴格 is `A-BC` (not `A-AB`); the touch audit must run with the lyrics panel open on landscape tablet; the audit of the strip and of the popover rows are two separate passes because the audit scrolls the lyrics area while the fixed popover stays put.

## Known Stubs

None.

## Threat Flags

None new. T-10-14 mitigated: section names, lyric lines, group labels and tail characters enter the strip and popover only through `textContent` after code-point cutting; `data-f` values are integers from the analysis; the acorn HTML-sink scan in the full suite passes. T-10-15 mitigated: over the size cap nothing is analysed, the strip shows 「—」 and the stats show the empty state. T-10-SC: no package installed.

## Items for Andy (not done unattended)

- UAT (10-08): 「點結構字母查該行」 is done as rows inside the popover (UI-SPEC D-10 override), one tap more than CONTEXT D2; no hover popover (D-11). Letters at the end of each line (CONTEXT C3 「也可」) are not offered; position options belong to Phase 11 MAP-11. On a very long section the popover can cover the strip it came from (Esc / 關閉統計 close it). The popover does not follow the page when the lyrics area scrolls. Check the 150 % phone header by eye (name shows only a few characters when the strip is on).
- No `?v=` cache-busting bump; bump at release time. No screenshot baselines changed (strips are hidden by default), so no `-darwin` regeneration and `-linux` is untouched.
- `requirements-completed` left empty on purpose: MAP-04 and MAP-05 are also declared by 10-08, so they are not marked complete in REQUIREMENTS.md yet.

## Self-Check: PASSED

- Files exist: `js/lyrics.js`, `js/sections.js`, `js/rhyme-core.js`, `js/rhyme-map.js`, `css/panels.css`, `tests/rhyme-core.spec.mjs`, `tests/rhyme-map-ui.spec.mjs`, this SUMMARY.
- Commits `fe1dac1`, `47595d8`, `70a4d98` in `git log`; `rev-list --count` since the ledger base is 3.
- Acceptance greps: `section-rhyme` in `js/lyrics.js` 1 and `js/sections.js` 1; `標題字母：` in the UI spec 5; `統計：` in the core spec 6 and UI spec 10; `rhymeStats` in `js/rhyme-map.js` 3.
- Full `npm test`: 954 passed, 0 failed; `git diff --stat HEAD -- package.json package-lock.json` empty.
