---
phase: 10-rhyme-map
plan: 04
subsystem: ui
tags: [rhyme-map, settings, menu, inner-rhyme, backup, a11y, playwright]
status: complete

requires:
  - phase: 10-rhyme-map
    provides: "10-01..03: mirror layer, lhRhymeAnalyze, lhMapPaint / lhMapRenderAll, lhRhymeMatch / lhRhymeKey, palette variables"
provides:
  - "button#rhymeMenuBtn in .lyrics-tools and #rhymeMenu (switch rows, mode radiogroup, particle switch, 17-cell legend, close)"
  - "lh:map setting (22nd registered key, group setting) with lhRhymeNormalizeSettings, backup / restore, cross-tab sync"
  - "Inner rhyme: lhRhymeInner + row.inner, span.rm-inner underlines"
  - "lhMapSetSetting(key, value), lhMapOpenMenu(byKeyboard), lhMapCloseAll()"
affects: [10-05 selection bar, 10-07 header strip (adds the 段落結構字母 row), 10-08 UAT list]

actuals:
  tokens: 17000
  tasks: 3
  commits: 3
plan_head_before: 62920f470be5bdc4f68159071abec24620383a0e
plan_head_after: e61c46a16292f678708d6be42bc41cbc211c5517

tech-stack:
  added: []
  patterns:
    - "Build-once menu on body (.word-ctx-menu.section-menu) with capture pointerdown / Escape, Tab wrap, double-rAF reclamp, re-placement when its content grows"
    - "Every untrusted lh:map source (storage, backup file, other tab) goes through one normaliser that keeps five real booleans"

key-files:
  created: []
  modified:
    - index.html
    - js/rhyme-map.js
    - js/rhyme-core.js
    - js/safety.js
    - js/sections.js
    - css/panels.css
    - tests/scan.spec.mjs
    - tests/rhyme-map-ui.spec.mjs
    - tests/rhyme-core.spec.mjs
    - tests/layout.spec.mjs
    - tests/visual.spec.mjs-snapshots/desktop-lyrics-darwin.png
    - tests/visual.spec.mjs-snapshots/phone-lyrics-darwin.png
    - tests/visual.spec.mjs-snapshots/tablet-lyrics-darwin.png

key-decisions:
  - "Legend has a 17th cell 「空韻」 for the neutral color (planner choice, as written in the plan)"
  - "Inner rhyme ignores particles while 忽略句尾語助詞 is on; lines without a tail get no underline (planner choices, as written)"
  - "The touch audit does not require #rhymeMenuBtn in the menu-open state: on a phone the tall menu is clamped over the button; the button itself is audited in the 歌詞開著 state"
  - "The unattended run only refreshed the three -darwin lyrics shots; -linux untouched"

requirements-completed: []

coverage:
  - id: D1
    description: "「韻腳 ▾」 button and #rhymeMenu: keeps open after toggles; closes on Esc (focus back), outside pointerdown, 關閉韻腳設定, re-render, breakpoint, panel collapse, section popover; keyboard open focuses first switch, pointer open focuses nothing, Tab wraps"
    requirement: MAP-06
    verification:
      - kind: e2e
        ref: "tests/rhyme-map-ui.spec.mjs#開關：句尾上色關掉後重新整理還是關的; #開關：鍵盤開選單的焦點"
        status: pass
    human_judgment: false
  - id: D2
    description: "句尾上色, 寬韻 / 嚴格, 忽略句尾語助詞, 句中押韻 each apply to every section at once and persist in lh:map; strict keeps family colors and changes only solo; default shows tail coloring only"
    requirement: MAP-06
    verification:
      - kind: e2e
        ref: "tests/rhyme-map-ui.spec.mjs#開關：嚴格與寬韻, #開關：忽略句尾語助詞, #開關：預設只開句尾上色, #句中：預設關、打開後最多三個底線"
        status: pass
    human_judgment: true
    rationale: "Whether the 開 pills read as the focal point of the menu is UAT"
  - id: D3
    description: "Inner rhyme: at most 3 per line, left to right, never the tail, punctuation or (while skipping) particles; works with 句尾上色 off; both off gives an empty mirror"
    requirement: MAP-03
    verification:
      - kind: unit
        ref: "tests/rhyme-core.spec.mjs#句中：*"
        status: pass
      - kind: e2e
        ref: "tests/rhyme-map-ui.spec.mjs#句中：預設關、打開後最多三個底線"
        status: pass
    human_judgment: true
    rationale: "Underline look and 3:1 contrast in real themes is UAT (numbers were enforced in 10-03)"
  - id: D4
    description: "lh:map is the 22nd registered key, in 備份全部 and restored by 全部還原; corrupt, non-object, unknown-key and non-boolean values fall back per key; other tabs sync; loading caption while the lexicon loads"
    requirement: MAP-07
    verification:
      - kind: e2e
        ref: "tests/rhyme-map-ui.spec.mjs#備份：*, #開關：儲存裡的值壞掉時用預設, #開關：別的分頁改了設定, #開關：詞庫載入中的提示; tests/scan.spec.mjs#registry (22 keys)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Menu controls and 「韻腳 ▾」 are at least 44x44 on phone 390x844, tablet 820x1180 and coarse 1180x820"
    requirement: MAP-06
    verification:
      - kind: e2e
        ref: "tests/layout.spec.mjs#觸控：手機平板每個按鈕至少 44px（韻腳選單開著）, #觸控：橫放平板 1180×820 的韻腳選單每個控制項 ≥ 44×44"
        status: pass
    human_judgment: false
---

# Phase 10 Plan 04: 韻腳 ▾ Menu and lh:map Settings Summary

工具列多了「韻腳 ▾」選單：句尾上色、句中押韻、寬韻／嚴格、忽略句尾語助詞都即時套用到每個段落，存進第 22 個儲存鍵 lh:map，跟著備份走、壞值回預設、別的分頁改了會同步。

## Performance

- **Tasks:** 3 (1 tracer, 2 auto); **commits:** 3
- **Files:** 13 modified (`js/rhyme-map.js` +~230 lines, `css/panels.css` +77, tests, three -darwin PNGs)
- **`npm test`:** 909 passed, 28 skipped, 0 failed (10-03 baseline 888 / 28)

## Accomplishments

- **Tracer (`71a3052`).** `button#rhymeMenuBtn` between the undo group and 「共 N 字」; `#rhymeMenu` built once on `<body>`. `lh:map` registered in `LH_KEYS` (22 keys), read through `lhRhymeNormalizeSettings(lhGetJSON('lh:map', null))`. `lhMapPaint` analyzes only when 句尾上色, 句中押韻 or (later) 結構字母 is on; otherwise the mirror is empty and `rm-on` is removed (D-18). `lhSecAbortInteractions` and `lhSecOpenMenu` call `lhMapCloseAll()` (typeof-guarded).
- **Options (`80ef4db`).** Inner rhyme in `js/rhyme-core.js` (`lhRhymeInner`, `row.inner`); painter wraps tail bands and underlines in one pass; menu gained the 判定 radiogroup (roving tabindex, arrows move focus, Enter / Space select), the particle switch with its caption, the 句中押韻 hint linked by `aria-describedby`, and the closed-by-default 17-cell legend.
- **Safety (`e61c46a`).** `_lhSettingFrom` has a `lh:map` branch that re-serializes the normalised object (invalid JSON dropped with `lhWarn`); `storage` listener closes the popovers, re-reads and repaints; menu caption 「詞庫載入中，載好後會自動上色」 hides when `_lhMapOk`.

## Inner-rhyme rules as implemented

- Section tail keys = the keys (current 寬韻 / 嚴格 mode) of every analyzable tail of the section, including the line's own tail.
- A character before a line's tail counts when it is a Han character in `charInfo`, its dictionary first reading (`getCharAllReadings(c)[0].reading`) has a key in that set, and it is not a particle while 忽略句尾語助詞 is on. Left to right, at most 3 per line. Lines without a tail get none. Punctuation, the tail and anything after it never qualify. Manual readings are not used for inner characters (only for tails).
- Colors follow the character's own family (`data-f`), whatever the mode.

## Screenshots refreshed

`tests/visual.spec.mjs-snapshots/{desktop,phone,tablet}-lyrics-darwin.png` only. Viewed old and new: the sole change is the new 「韻腳 ▾」 button in the lyrics toolbar. The old baselines had still passed (1 percent tolerance), so the files were deleted and regenerated to make the baselines show the button. `-linux` files are untouched (Andy to-do).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Menu not re-clamped when the legend opens**
- **Found during:** Task 2 (touch audit of the new menu on 390x844)
- **Issue:** `lhPlaceMenu` clamped the menu while the legend was closed; opening the legend made it taller and its bottom (and the 關閉韻腳設定 button) fell below the viewport.
- **Fix:** the legend toggle calls `_lhMapPlaceMenu()` after changing visibility.
- **Files modified:** `js/rhyme-map.js`
- **Commit:** `80ef4db`

**2. [Rule 3 - Blocking] Touch audit cannot require `#rhymeMenuBtn` while the menu is open on a phone**
- **Issue:** on 390x844 the tall menu is clamped over the button (same as the section popover), so the audit's hit test never reaches it.
- **Fix:** `RHYME_MENU_MUST` omits the button; it is still audited in the 歌詞開著 state.
- **Commit:** `80ef4db`

### Notes on plan execution

- The 17-cell legend, the touch audit state 「韻腳選單開著」 and a 1180x820 coarse test were added to `tests/layout.spec.mjs` in Task 2 (plan listed only the mustSee entry in Task 1); the plan's must-have on touch floors needs them.
- The 「詞庫載入中」 caption and its hook were written in Task 3 as planned (not earlier).
- The test title 「觸控：手機平板每個按鈕至少 44px（7 種畫面）」 now scans 8 states; title kept so existing filters still match.

## Known Stubs

None.

## Threat Flags

None new. T-10-07 (lh:map tampering): five-key boolean normaliser used at load, restore and cross-tab, covered by tests; T-10-08: the menu is built with `_lhMk` / `textContent` only (the acorn HTML-sink scan in the full suite passes); `package.json` / `package-lock.json` unchanged.

## Items for Andy (not done unattended)

- Real look of the menu, the 開 pills and the underlines on real devices and in custom themes (UAT).
- `-linux` lyrics baselines still show no 「韻腳 ▾」 button; regenerate in the cloud container.
- No `?v=` cache-busting bump for the changed JS / CSS; bump at release time.
- `requirements-completed` left empty on purpose: MAP-01, MAP-03, MAP-06, MAP-07 are also declared by 10-08, so they are not marked complete in REQUIREMENTS.md yet.
- The 段落結構字母 switch row is not in the menu yet (10-07 adds it with the header strip).

## Self-Check: PASSED

- Files exist: all 13 modified files; `10-04-SUMMARY.md`.
- Commits `71a3052`, `80ef4db`, `e61c46a` in `git log`; `rev-list` count since the ledger base is 3.
- Full `npm test`: 909 passed, 0 failed. Mutation checks: reverting the backup normaliser and the storage listener each made the matching test fail.
- Acceptance greps: `id="rhymeMenuBtn"` 1; `toHaveLength(22)` 1; `lhMapCloseAll()` in sections.js 2; `lhRhymeNormalizeSettings(` in safety.js 1; no `-linux` or package file changes.
