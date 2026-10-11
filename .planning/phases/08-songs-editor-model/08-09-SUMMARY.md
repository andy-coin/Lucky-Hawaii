---
phase: 08-songs-editor-model
plan: 09
subsystem: phase-gate
tags: [e2e, journey, audit, accessibility, security-render, contrast, touch, handoff, playwright]
status: complete
requires:
  - phase: 08-08
    provides: delete dialog, pinned backups, settings 自動備份 list with two-tap 還原這份
  - phase: 08-07
    provides: 備份全部 / 匯入備份 dialog, --danger-* tokens, lhBuildBackup / lhParseBackup
  - phase: 08-06
    provides: ⬇ 匯出 menu, TXT / Markdown / PDF / 複製整首, #printSheet
  - phase: 08-05
    provides: ☰ 歌曲 list, rename, createSong
  - phase: 08-01
    provides: v0.96 to lh:songs migration, baseline / pre-schema-2 backups
provides:
  - "tests/songs-journey.spec.mjs: 整合：舊版使用者的一整天 (upgrade, second song, Zhuyin composition, reload, TXT + 複製整首, 備份全部, clean-browser 全部還原, delete, 自動備份 restore)"
  - "tests/songs-audit.spec.mjs: 9 specs titled 檢查： (long names, hostile text, static no-innerHTML scan, touch targets x3 devices, focus, non-colour cues, 3-theme contrast, colour-literal scan, accessible names)"
  - "handoff.md: Phase 8 section (shared ?v=0.96.12, open-old-tab hazard, Human checks, -linux baseline item)"
  - ".planning/TEST-CHECKLIST.md and .planning/驗收清單-精簡版.md: Phase 8 items, decisions and counts for Andy"
affects: [verify-work 08]
actuals:
  tokens: 11560
  tasks: 2
  commits: 3
plan_head_before: 488e7b6ff692a5687b2a2722c219bf3691fe3044
plan_head_after: b840e783cc093d7a49f27ce5514352d74c73be89
commits: 3
tech-stack:
  added: []
  patterns: ["one continuous browser journey across two contexts (A = upgraded v0.96 profile, B = clean browser) with a real backup file between them", "audit specs filter the shared touch scan to Phase 8 selectors so older unrelated controls cannot fail the Phase 8 gate", "static source scans (no innerHTML family in the song code, no colour literals in song / export / import / backup rules) sit next to the runtime checks"]
key-files:
  created: [tests/songs-journey.spec.mjs, tests/songs-audit.spec.mjs]
  modified: [handoff.md, .planning/TEST-CHECKLIST.md, .planning/驗收清單-精簡版.md]
key-decisions:
  - "No product code changed: the journey and all nine audits passed against the 08-08 code, so there were no seams to fix"
  - "Touch audit compares only Phase 8 selectors (PHASE8 regex) for failures and overlaps, and asserts every mustSee control was actually measured"
  - "Checklist items for Andy live in the two planning checklists (force-added), numbered after the existing ones: 2-25..2-33, 3-19, 4-19..4-22, 5-65..5-68, decisions 5-69..5-90, full list 08-xx-n / D-24 / 08-CTX-1..22"
requirements-completed: [EDIT-01, EDIT-04, EDIT-08, EDIT-09]
duration: 18 min
completed: 2026-10-11
coverage:
  - id: F1
    description: "One continuous journey: v0.96 profile upgrades to 我的第一首歌 with all three sections intact, 新增歌曲 + rename, Zhuyin composition (no lh:songs write during composition, stored within 400 ms), reload keeps both songs, TXT + 複製整首 equal the spec and songToTxt, 備份全部 imported with 全部還原 in a clean context (songs, active song, saved words, model equal; no API key), delete stores a song-delete- backup, 還原這份 twice restores the song with its fixture text; no page errors and no off-origin requests in either context"
    requirement: EDIT-01
    verification:
      - { kind: e2e, ref: "tests/songs-journey.spec.mjs#整合：舊版使用者的一整天", status: pass }
    human_judgment: false
  - id: F2
    description: "A 60-character name stays one line with ellipsis in the header and list row, delete title is cut at 24, menu hints and 已匯出 / 已刪除 toasts at 16; no page scroll at 390x844 / scale 150 and at 1440x900"
    requirement: EDIT-04
    verification:
      - { kind: e2e, ref: "tests/songs-audit.spec.mjs#檢查：長歌名", status: pass }
    human_judgment: false
  - id: F3
    description: "A song named <img src=x onerror=alert(1)> with a section containing </textarea><script> renders as literal text in the header, list, rename input, lyrics textarea, export menu hints, delete dialog, import chips and print sheet; no img / script / b element, no alert, window.__pwn undefined; static scan finds no innerHTML / outerHTML / insertAdjacentHTML / document.write in js/songs.js, js/song-io.js, js/lyrics.js and renderSavedWords"
    requirement: EDIT-04
    verification:
      - { kind: e2e, ref: "tests/songs-audit.spec.mjs#檢查：怪字元原樣顯示", status: pass }
      - { kind: static, ref: "tests/songs-audit.spec.mjs#檢查：怪字元——新程式碼不用 innerHTML", status: pass }
    human_judgment: false
  - id: F4
    description: "At 390x844, 820x1180 (touch) and 1180x820 (coarse) every Phase 8 control has a hit box of at least 44x44 and no neighbour overlap: ☰ 歌曲, ⬇ 匯出, + 新增段落, ＋ 新增歌曲, song rows, ✎ 🗑, rename input, export items, both import tiles + 先不匯入, delete dialog buttons, 還原這份"
    requirement: EDIT-04
    verification:
      - { kind: e2e, ref: "tests/songs-audit.spec.mjs#檢查：觸控目標", status: pass }
    human_judgment: false
  - id: F5
    description: "Focus: Esc on the list returns to ☰ 歌曲 and the closed list is hidden + inert; the delete dialog opens on 先不刪除 and returns focus to its 🗑; the export menu opened by keyboard returns to ⬇ 匯出; the import error view focuses 關閉錯誤訊息"
    requirement: EDIT-04
    verification:
      - { kind: e2e, ref: "tests/songs-audit.spec.mjs#檢查：焦點", status: pass }
    human_judgment: false
  - id: F6
    description: "Active row is marked by aria-current, a 4 px stripe and bold text (others transparent / regular); the replace tile is identified by 取代目前資料 and an aria-hidden ⚠"
    requirement: EDIT-04
    verification:
      - { kind: e2e, ref: "tests/songs-audit.spec.mjs#檢查：不只靠顏色", status: pass }
    human_judgment: false
  - id: F7
    description: "Computed contrast in light, dark and the custom-colour preset: text on card and container at least 4.5, danger-text on danger-bg 5.47 (also on the rendered delete button), danger-line on container and card in light (5.92 / 7.18) and dark (6.96 / 4.91); no colour literal in song / export / import / backup / danger rules"
    requirement: EDIT-04
    verification:
      - { kind: e2e, ref: "tests/songs-audit.spec.mjs#檢查：三種主題對比", status: pass }
      - { kind: static, ref: "tests/songs-audit.spec.mjs#檢查：沒有新的顏色常數（Phase 8 的規則）", status: pass }
    human_judgment: false
  - id: F8
    description: "Every section 8.1 control exposes its accessible name as aria-label (and title where specified), and getByRole finds the six header / list buttons by name"
    requirement: EDIT-04
    verification:
      - { kind: e2e, ref: "tests/songs-audit.spec.mjs#檢查：無障礙名稱", status: pass }
    human_judgment: false
  - id: F9
    description: "Real Zhuyin feel (macOS Chrome / Safari, iPad / iPhone Safari, Android Gboard), PDF layout of a long song, iOS download names / Home-Screen printing / clipboard, iOS keyboard with the rename input and delete dialog, a restore between two physical devices"
    human_judgment: true
    rationale: "Playwright drives a CDP composition and a shrunk viewport, not a real IME, PDF reader, iOS Safari or second device; these are items 2-26, 2-27, 2-31, 2-32, 2-33 and 4-21 in Andy's checklist."
---

# Phase 8 Plan 09: Whole-Phase Journey and Cross-Surface Audit Summary

One real-UI journey now proves the four ROADMAP criteria together (v0.96 profile upgrades, a second song is written with Zhuyin composition, TXT and clipboard export match the spec, 備份全部 restores both songs plus settings in a clean browser, a deleted song comes back from 自動備份), and nine audit specs measure every new surface with the same ruler (long and hostile names, 44 px hit boxes on three devices, focus, non-colour cues, contrast in three themes, accessible names). Nothing needed fixing: no product file changed.

## Performance

- **Duration:** 18 min
- **Started:** 2026-10-11T03:44:00Z
- **Completed:** 2026-10-11T04:02:00Z
- **Tasks:** 2 (1 tracer, 1 auto)
- **Files:** 2 new specs, handoff.md, 2 planning checklists

## Accomplishments

- **Journey (Task 1, tracer)**: context A boots the v0.96 fixture (the migration toast shows, three sections equal the old `haiku_lyrics` texts), adds 新歌 through the real ＋ 新增歌曲 and rename input, types 第一句 and composes 你 with the CDP helper. No `lh:songs` write happens during the 500 ms composition and the text is stored within 400 ms of the commit. After a reload both songs and the active song are intact and `haiku_lyrics` is byte-identical to the fixture. TXT download equals exactly `新歌\n\n[段落 1]\n第一句你\n`, equals `songToTxt(curSong())`, and 複製整首 puts the same string on the clipboard. The backup file is imported into context B (empty storage) with 全部還原; `lh:songs`, `lh:activeSong`, `haiku_savedwords`, `selectedModel` are string-equal to A, the API key did not travel. In B the song 我的第一首歌 is deleted (a `song-delete-` backup exists) and restored with two taps on 還原這份; it comes back with the fixture lyrics. Both contexts end with no page errors and no off-origin requests. Re-run three more times: stable.
- **Audits (Task 2)**: nine specs titled 檢查：. `長歌名` (390x844 at 150% and 1440x900), `怪字元原樣顯示` (eight surfaces, no element created, no alert), `怪字元——新程式碼不用 innerHTML` (static), `觸控目標` (three devices, six open states each), `焦點`, `不只靠顏色`, `三種主題對比` (also measures the rendered delete button), `沒有新的顏色常數（Phase 8 的規則）` (static), `無障礙名稱`.
- **handoff.md**: Phase 8 section with the shared `?v=0.96.12`, the open-old-tab hazard (RESEARCH A8), new files and specs, the Human checks and the Andy item for the `-linux` baselines.
- **Andy's checklists**: both planning checklists gained the Phase 8 items (see below).

## Task Commits

1. **Task 1 (tracer): journey spec** - `33601b0` (test)
2. **Task 2: audit specs + handoff** - `ea68f57` (test)
3. **Checklists for Andy** - `b840e78` (docs; both files force-added)

**Plan metadata:** this SUMMARY commit, then the STATE / ROADMAP / REQUIREMENTS commit.

## RED evidence

Both specs are verification-only (no product code changed), so there is no failing-first product commit. To prove the audits are not vacuous, two mutations were applied and reverted (the working tree was restored byte for byte from copies): removing the `aria-label` and `title` of `⬇ 匯出` failed `檢查：無障礙名稱`, and changing `pick.textContent = s.title` to `pick.innerHTML = s.title` failed both the static `innerHTML` scan and `檢查：怪字元原樣顯示` (the runtime spec saw the element). The first runs of my own specs also failed for test-side reasons only, fixed in the spec (see Deviations).

## Verification

- `npx playwright test tests/songs-journey.spec.mjs`: 1 passed, repeated 4 times with no flake. `tests/songs-audit.spec.mjs` plus the journey: 10 passed, repeated 3 times.
- Final `npm test`: **688 passed / 27 skipped / 0 failed** (08-08 left 678 / 27; plus 1 journey and 9 audits). The plan's quoted baseline of 562 / 27 predates 08-01..08-08; against it the phase added 126 passing tests and no skips.
- `grep` acceptance checks: `整合：舊版使用者的一整天` 1, `compose(` 1, `全部還原` 2, `檢查：怪字元原樣顯示` 1, `檢查：三種主題對比` 1, nine `test('檢查：` titles, `Phase 8` in handoff.md 2, `0.96.12` in handoff.md 1, `?v=0.96.11` in index.html 0; all 30 local `?v=` tags read 0.96.12.
- Plan `<verification>` list (songs-*, storage, scan, split-tags, smoke, save-failure, style) is part of the green `npm test` run.
- Scope of the local gate: Chromium on macOS only. `-linux.png` visual baselines are excluded; no `-darwin.png` baseline changed in this plan.

## Contrast measured (UI-SPEC 10.2 theme row)

| Pair | Light | Dark | Custom |
|------|-------|------|--------|
| text / card | 11.44 | 7.24 | 15.57 |
| text / container | 9.43 | 10.28 | 15.68 |
| danger-text / danger-bg (token and rendered button) | 5.47 | 5.47 | 5.47 |
| danger-line / container | 5.92 | 6.96 | not required |
| danger-line / card | 7.18 | 4.91 | not required |

## Seam fixes in product files

None. The journey and every audit passed against the 08-08 code.

## Deviations from Plan

### Auto-fixed Issues (all in the new specs, not product code)

**1. [Rule 1 - Bug] Typed text saved during the composition window**
- **Found during:** Task 1 first run (`組字中沒有任何 lh:songs 存檔` received 1).
- **Issue:** `keyboard.type('第一句')` starts the normal 300 ms save timer; the counter was cleared before it fired, so that write landed inside the composition window.
- **Fix:** wait for the typed text to reach `lh:songs` before clearing the write log.
- **File:** tests/songs-journey.spec.mjs. **Commit:** 33601b0

**2. [Rule 1 - Bug] Clean browser starts with the lyrics panel collapsed**
- **Issue:** panel open / closed is a UI key, not part of the backup, so the clean context B had no visible `☰ 歌曲`.
- **Fix:** the journey opens the left panel in B before using the list.
- **File:** tests/songs-journey.spec.mjs. **Commit:** 33601b0

**3. [Rule 1 - Bug] Row height assertion ignored the 44 px hit floor**
- **Issue:** at 150% the list row button is 66 px tall by design (min-height 44 px scaled), not a wrapped line.
- **Fix:** single-line proof is `white-space: nowrap` + truncation + a height limit of the larger of 1.5 line heights and the element's own min-height.
- **File:** tests/songs-audit.spec.mjs. **Commit:** ea68f57

**4. [Rule 1 - Bug] Push column shows ✎ 🗑 only on the active row, and not while renaming**
- **Issue:** the touch audit tried to click ✎ of a non-active row at 1180x820 and measured ✎ 🗑 while a row was in rename mode (its actions are hidden then).
- **Fix:** act on the active song, and measure the rename input in a second pass.
- **File:** tests/songs-audit.spec.mjs. **Commit:** ea68f57

**Total deviations:** 4 auto-fixed, all test-side. **Impact:** none on product behaviour.

## Estimates vs actuals (calibration data)

Every Phase 8 estimate was uncalibrated (confidence low). Actuals are chars/4 over the realized diff (added lines), not harness tokens.

| Plan | Estimate | Actual | Ratio |
|------|---------:|-------:|------:|
| 08-01 | 80 000 | 7 821 | 0.10 |
| 08-02 | 130 000 | 15 159 | 0.12 |
| 08-03 | 90 000 | 6 500 | 0.07 |
| 08-04 | 75 000 | 9 000 | 0.12 |
| 08-05 | 170 000 | 14 000 | 0.08 |
| 08-06 | 150 000 | 9 900 | 0.07 |
| 08-07 | 180 000 | 19 700 | 0.11 |
| 08-08 | 150 000 | 11 100 | 0.07 |
| 08-09 | 110 000 | 11 560 | 0.11 |
| **Phase** | **1 135 000** | **104 740** | **0.09** |

The estimates were about ten times too high on this scale; actuals measure written lines, so reading and test-run output (most of the real work) are not counted either way.

## Autonomous decisions (all plans, for Andy's 自主決定 list)

These are in Andy's checklists as decision rows 5-69..5-90 (精簡版) and 08-CTX-1..22 (完整版).

1. **08-01**: migrated song has the fixed id `song-migrated` (one migrated song, ever). Corrupt legacy lyrics give one empty section; the raw text is kept under a `lh:corrupt:` key; the legacy key is not modified. One shared `?v=0.96.12` for the whole phase. Baseline and `pre-schema-2` backups are the upgrade safety net.
2. **08-02**: legacy single-song mode exactly when `lh:schema` is not `2` (edits go to the legacy keys, no `lh:songs`, no list, 情境 not stored). Corrupt or empty `lh:songs` at schema 2 gives one empty 未命名歌曲 1 and keeps the raw text. A missing `lh:songs` rebuilds from the legacy keys. Section label input commits to the model while typing and flushes on blur. (`lhNewId` lives in js/safety.js: internal, not in Andy's list.)
3. **08-03**: Esc in the tag popup is guarded like Enter during composition.
4. **08-04**: a song deleted in another tab while this tab holds unsaved edits of it is put back by the next flush; same song edited in two tabs, last write wins; an unfocused window counts as not editing; moving between editor fields never applies a pending reload.
5. **08-05**: D-02 the push column appears instantly (overrides CONTEXT C1 「滑出」). D-06 double-click rename only in the push column, ✎ everywhere (overrides CONTEXT C3). D-04 `lh:songListOpen` read and written only at 1024 and above. Numbering is largest N plus 1. The migration toast needs lyric text. Esc in the list closes it and, in the push column, writes closed.
6. **08-06**: F6 override: print rules scoped to `body.print-song`, so Cmd/Ctrl+P elsewhere prints the normal page (overrides UI-SPEC D-12). Hint and toast use the sanitised file name cut to 16. The export menu refuses to open while a dialog is open. One module-level `afterprint` listener (internal).
7. **08-07**: add-only imports keep each song's createdAt. 全部還原 removes registered settings the backup lacks; `apiKey_*` and `haoYunQi_admin_*` are never read, written or removed. A v1 SAVE file becomes one new song and switches to it. `--danger-*` tokens defined once and reused. Setting values are shape-checked; caps 5 MB / 1000 songs / 200 sections / 5000 words. Result toast travels through a numeric `#lh-restored=N` hash (internal).
8. **08-08**: 還原這份 is a two-tap inline confirm (no third dialog). `baseline` and `pre-schema-*` backups are pinned, the newest 3 others are kept. With IndexedDB unavailable the single localStorage slot holds only the newest backup. Backup ids carry a random tail (internal). A failed write after the backup puts the song back. 先不刪除 is disabled while the backup runs.

## Issues Encountered

- `_dirty.clear()` / `_deleted.clear()` before the reload in `importReplaceAll` and `restoreAutoBackup` (so `pagehide` cannot flush a stale song over the restore) still has no spec of its own: the modal blocks typing and the restore flushes first. Same open item as 08-07 and 08-08; it is a guard, not covered. The journey restore path passes with or without it.
- The localStorage fallback record is a single slot, so a device with no IndexedDB lists at most one automatic backup.

## Known Stubs

None.

## Threat Flags

None new. T-08-30 (cross-surface literal rendering plus static no-innerHTML scan) is covered by `檢查：怪字元原樣顯示` and `檢查：怪字元——新程式碼不用 innerHTML`. T-08-31: handoff.md holds file names, test names and steps only, no user data or keys. T-08-SC: no package installs.

## Human checks still open (for /gsd-verify-work 08)

In Andy's checklists: 2-25 (upgrade in the real browser), 2-26 and 2-27 (real Zhuyin on macOS Chrome / Safari, iPad / iPhone Safari, Android Gboard), 2-31 (long-song PDF layout), 2-32 (iOS download names, Home-Screen printing, clipboard), 2-33 (restore between two physical devices), 4-21 (iOS keyboard with rename input and delete dialog). **Andy item: 在雲端容器執行 `npm run visual:update`，更新 -linux 截圖基準（本機只比對 -darwin）** (7 files changed in `-darwin` over the phase: desktop-lyrics, desktop-results, desktop-results-dark, desktop-ai, desktop-custom, phone-lyrics, tablet-lyrics).

## Self-Check: PASSED

- Files present: tests/songs-journey.spec.mjs, tests/songs-audit.spec.mjs, handoff.md, .planning/TEST-CHECKLIST.md, .planning/驗收清單-精簡版.md.
- Commits 33601b0, ea68f57, b840e78 in `git log`; `git rev-list --count` from the ledger base gives 3.
- Acceptance greps and plan verification as listed under Verification; `npm test` 688 passed / 27 skipped / 0 failed.
