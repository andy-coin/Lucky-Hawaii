---
phase: 08-songs-editor-model
plan: 07
subsystem: backup-restore
tags: [backup, restore, import, json, security, allow-list, dialog, playwright]
status: complete
requires:
  - phase: 08-06
    provides: js/song-io.js downloadText / safeFileName, dialog and focus patterns, songs model (flushSongs, markDirty, cutName, _refreshSongUI)
  - phase: 08-01
    provides: lhNewId, LH_ID_RE, lhSongsOk, lhSnapshot / lhBackup / lhRestore, setting registry
provides:
  - "js/safety.js: LH_BACKUP_FORMAT / VERSION / MAX_BYTES, LH_IMPORT_CAPS, LH_SETTING_SHAPES, lhNormalizeSong, lhParseBackup, lhBuildBackup, lhApplyBackupReplace, banner copy 備份全部"
  - "js/song-io.js: v2 exportSession, importSession, import dialog views (summary / v1 / working / error), importAddSongs, importReplaceAll, closeImportDialog, restored toast after reload"
  - "index.html: #importOverlay dialog, header and settings buttons renamed 備份全部 / 匯入備份 with title and aria-label"
  - "css/base.css: --danger-bg / --danger-bg-hover / --danger-text / --danger-line tokens (light and dark); css/panels.css: .song-dialog h3, import tiles, chips, status and error styles"
  - "tests/songs-backup.spec.mjs: 22 specs titled 備份："
affects: [08-08, 08-09]
actuals:
  tokens: 19700
  tasks: 3
  commits: 3
plan_head_before: 20626231a66076e8f1864d020e814d256df0522f
plan_head_after: 8f33cd820281943591d05f501e660aff4e21039d
commits: 3
tech-stack:
  added: []
  patterns: ["untrusted file is parsed and normalised in js/safety.js before any dialog or write; settings read by explicit registry lookup (hasOwnProperty), never by walking the file's own keys", "全部還原 = lhBackup first, lhSet each key, lhRestore(pre) when a write fails after something was written, then reload with a numeric #lh-restored= hash for the result toast", "one dialog shell with four views toggled by hidden attributes (summary, v1, working, error)"]
key-files:
  created: [tests/songs-backup.spec.mjs]
  modified: [js/safety.js, js/song-io.js, js/lyrics.js, index.html, css/base.css, css/panels.css, tests/style.spec.mjs, tests/smoke.spec.mjs, tests/save-failure.spec.mjs, tests/visual.spec.mjs-snapshots/desktop-ai-darwin.png, tests/visual.spec.mjs-snapshots/desktop-custom-darwin.png, tests/visual.spec.mjs-snapshots/desktop-lyrics-darwin.png, tests/visual.spec.mjs-snapshots/desktop-results-dark-darwin.png, tests/visual.spec.mjs-snapshots/desktop-results-darwin.png]
key-decisions:
  - "Add-only imports keep each song's original createdAt (older imported songs sort among the existing ones instead of always on top)"
  - "全部還原 also removes registered settings the backup does not contain, so the result equals the source; apiKey_* and haoYunQi_admin_* are never read, written or removed"
  - "A v1 SAVE file imports as one new song and switches to it"
  - "--danger-* tokens are defined here (D-09) and reused by 08-08"
  - "Settings values are checked against the shape the app itself writes (#rrggbb colours, light/dark, auto/zhuyin/pinyin, pack id), not only for length"
  - "Result toast after 全部還原 travels through a numeric #lh-restored=N hash, removed on load"
requirements-completed: [EDIT-09]
duration: 17 min
completed: 2026-10-11
coverage:
  - id: D1
    description: "備份全部 writes LuckyHawaii-備份-{YYYYMMDD-HHmm}.json with exactly format / version 2 / exportedAt / songs / activeSong / savedWords / settings, settings = registered setting keys + dictOverrides_v076 only, no secrets, no UI keys, no legacy keys"
    requirement: EDIT-09
    verification:
      - { kind: e2e, ref: "tests/songs-backup.spec.mjs#備份：檔案格式", status: pass }
    human_judgment: false
  - id: D2
    description: "Export in one browser, import in a brand-new browser with 全部還原: songs, active song, saved words, settings and dictOverrides equal the source, automatic import-replace backup exists, result toast shows"
    requirement: EDIT-09
    verification:
      - { kind: e2e, ref: "tests/songs-backup.spec.mjs#備份：乾淨瀏覽器完整還原", status: pass }
      - { kind: e2e, ref: "tests/songs-backup.spec.mjs#備份：全部還原時目前這首", status: pass }
      - { kind: e2e, ref: "tests/songs-backup.spec.mjs#備份：全部還原會清掉備份檔裡沒有的設定", status: pass }
    human_judgment: false
  - id: D3
    description: "只加入歌曲 keeps existing songs and settings, renames duplicate ids / titles, keeps createdAt order, merges saved words; v1 SAVE file becomes one new song"
    requirement: EDIT-09
    verification:
      - { kind: e2e, ref: "tests/songs-backup.spec.mjs#備份：只加入歌曲", status: pass }
      - { kind: e2e, ref: "tests/songs-backup.spec.mjs#備份：加入的歌照建立時間排", status: pass }
      - { kind: e2e, ref: "tests/songs-backup.spec.mjs#備份：舊版存檔加成新歌", status: pass }
    human_judgment: false
  - id: D4
    description: "Broken, foreign, too-new, empty, zero-song, oversized and unreadable files show their own plain sentence and change nothing"
    requirement: EDIT-09
    verification:
      - { kind: e2e, ref: "tests/songs-backup.spec.mjs#備份：壞檔：不是 JSON / 空檔案 / 格式不對 / 版本太新 / 沒有任何歌曲 / 檔案太大", status: pass }
      - { kind: e2e, ref: "tests/songs-backup.spec.mjs#備份：讀取失敗", status: pass }
    human_judgment: false
  - id: D5
    description: "A hostile backup is normalised (ids, caps, tags, context, words, settings allow-list, __proto__, secrets, script text) before anything is shown or written"
    requirement: EDIT-09
    verification:
      - { kind: e2e, ref: "tests/songs-backup.spec.mjs#備份：被動過手腳的檔案", status: pass }
    human_judgment: false
  - id: D6
    description: "Quota error during 全部還原 rolls storage back to the pre-import state and shows the write-failed view plus the save-failure banner; an automatic backup that cannot be stored writes nothing"
    requirement: EDIT-09
    verification:
      - { kind: e2e, ref: "tests/songs-backup.spec.mjs#備份：寫到一半失敗會退回", status: pass }
      - { kind: e2e, ref: "tests/songs-backup.spec.mjs#備份：備份存不下就不動", status: pass }
    human_judgment: false
  - id: D7
    description: "Dialog behaviour: restoring state disables tiles and cancel, chips (5 + 「+k」, long titles wrap), one-song summary, focus on title, Tab trap, Esc / overlay / cancel return focus, touch floors"
    requirement: EDIT-09
    verification:
      - { kind: e2e, ref: "tests/songs-backup.spec.mjs#備份：還原中按鈕停用", status: pass }
      - { kind: e2e, ref: "tests/songs-backup.spec.mjs#備份：歌名標籤太多與太長", status: pass }
      - { kind: e2e, ref: "tests/songs-backup.spec.mjs#備份：一首歌的摘要", status: pass }
      - { kind: e2e, ref: "tests/songs-backup.spec.mjs#備份：視窗焦點與鍵盤", status: pass }
    human_judgment: false
  - id: D8
    description: "Header, settings and banner buttons read 備份全部 / 匯入備份 with full titles and aria-labels, header buttons 0.875rem/700"
    requirement: EDIT-09
    verification:
      - { kind: e2e, ref: "tests/songs-backup.spec.mjs#備份：按鈕名稱", status: pass }
      - { kind: e2e, ref: "tests/save-failure.spec.mjs#localStorage: 寫入被拒時顯示存檔失敗橫幅", status: pass }
    human_judgment: false
  - id: D9
    description: "Real-device feel of the import dialog (iOS file picker, keyboard-free focus, tile touch comfort) and a restore across two genuinely different devices"
    human_judgment: true
    rationale: "Playwright proves two clean browser contexts and a 390 px viewport, not iOS Safari's file chooser or a second physical device (08-UAT)."
---

# Phase 8 Plan 07: Backup and Restore (EDIT-09) Summary

備份全部 saves every song, the 保留池 and the settings (never an API key) into one JSON file, and 匯入備份 on any browser shows what is inside and offers 只加入歌曲 or 全部還原 (which stores an automatic backup first); old v1 SAVE files still come in as a new song, and every broken, foreign, too-new, oversized or hostile file is explained in plain words and changes nothing.

## Performance

- **Duration:** 17 min
- **Started:** 2026-10-11T03:03:05Z
- **Completed:** 2026-10-11T03:21:04Z
- **Tasks:** 3
- **Files modified:** 15 (10 source / test files, 5 darwin baselines)

## Accomplishments

- **Backup file (E1, F11)**: `lhBuildBackup` builds `{ format, version: 2, exportedAt, songs, activeSong, savedWords, settings }`; settings are the registered `setting` keys plus `dictOverrides_v076`, looked up by registry key. `apiKey_*`, `haoYunQi_admin_*`, UI keys, legacy `haiku_lyrics` / `haiku_hashtags` and meta keys can never appear. File name `LuckyHawaii-備份-YYYYMMDD-HHmm.json` (local time, no prompt); toast 已匯出備份檔（N 首歌）.
- **Parse and normalise (F8, T-08-19..23)**: `lhParseBackup` rejects not-JSON, wrong format, version above 2 and zero songs, then rebuilds every song from scratch: ids must match `LH_ID_RE` and be unique else regenerated, title cut to 60 code points (empty gives 未命名歌曲), at most 200 sections of 200 000 characters, 50 tags of 30, 情境 5 000, saved words of 50 characters de-duplicated. v1 files (`lyricsSections`) become one song 匯入的歌曲. The page checks `file.size` against 5 MB before reading.
- **全部還原**: `lhApplyBackupReplace` takes `lhBackup('import-replace-{time}')` first (nothing is written if that fails), writes `lh:songs`, `lh:activeSong`, `haiku_savedwords`, each setting present in the file, removes registered settings the file lacks, makes sure `lh:schema` is 2, and restores the pre-import snapshot when a write fails after something was written. Success reloads the page with a `#lh-restored=N` hash, which the next load turns into the toast 已還原 N 首歌與設定（還原前的資料已自動備份） (4000 ms) and removes.
- **只加入歌曲**: new id when the id exists, 「（匯入）」 (stacked, always within 60 characters) when the title exists, original `createdAt` kept so songs sort into the list by time, saved words appended in file order without duplicates, nothing removed, active song unchanged; toast 已加入 N 首歌. A v1 file adds one song, switches to it and toasts 已把舊版存檔加成新的一首歌「…」.
- **Import dialog**: one `.feedback-modal` shell, four views (summary, v1, working 還原中…, error 這個檔案無法匯入). Title focused (tabindex -1), 5 title chips then 「+k」, tiles 只加入歌曲 (filled `--action-bg`) then ⚠ 全部還原（取代目前資料） (`--danger-line` outline, accessible name is the plain label via `aria-labelledby`), Tab trap, Esc / overlay click / 先不匯入 return focus to the opener, nothing closes it while restoring. Error view paragraph ends with 「目前的歌詞與設定都沒有被改動。」 and its single button 關閉錯誤訊息 is focused.
- **Names and styling (D-13, D-19, F5)**: header and settings buttons read 💾 備份全部 / 📂 匯入備份 with the full title and aria-label, header buttons 0.875rem/700; the save-failure banner text and button say 備份全部. `--danger-*` tokens defined once in `css/base.css`, hex values allowed by `tests/style.spec.mjs` only on lines that declare them.
- v1 `exportSession` / `importSession` removed from `js/lyrics.js`; single definitions live in `js/song-io.js`.

## Task Commits

1. **Task 1 (tracer): 備份全部 → 全部還原 on a clean browser** - `e4f4c8f` (feat)
2. **Task 2: 只加入歌曲, v1 file as new song, button and banner renames, darwin baselines** - `119a8d8` (feat)
3. **Task 3: bad files, hostile file, write failure, busy state, chips, focus** - `8f33cd8` (test)

**Plan metadata:** docs commit follows this summary.

## RED evidence

- Task 1: both new specs against the 08-06 code failed on their target assertions (toast 已匯出 測試.json instead of 已匯出備份檔（2 首歌）, file name 測試.json instead of LuckyHawaii-備份-…; the old `window.prompt` flow).
- Task 2: after writing the specs, 6 of the 8 affected tests failed (add-only stub only closed the dialog, v1 flow, old SAVE / LOAD labels, banner text 匯出備份, smoke import flows); the two replace-mode specs already passed because Task 1 implemented 全部還原.
- Task 3: all 22 specs passed on first run because the error views, normalisation and rollback already shipped in Task 1 (the plan asks Task 3 to tighten only where an assertion fails; none did). To make sure the new specs are not vacuous, five mutations were applied and reverted: removing the `lhRestore(pre)` rollback, raising the title cap to 100, dropping the 5 MB check, skipping the automatic-backup gate (each failed exactly its own spec), and removing `_dirty.clear()` (no spec observes it, see Issues). Each commit holds RED and GREEN together, as 08-06 did; no separate `test(...)` commit precedes a `feat(...)` commit.

Verification: Task 1 verify 35 passed (2 titled 備份：); Task 2 verify 37 passed then full `npm test` 648 passed; Task 3 verify 36 passed (22 titled 備份：); final `npm test` 662 passed / 27 skipped / 0 failed (baseline 640 plus 22 new). `?v=` untouched at 0.96.12.

## Screenshot baselines

Ran `tests/visual.spec.mjs` first: all 19 passed because the header button change stays inside the 1 percent tolerance, so the baselines were refreshed with `--update-snapshots=all`. Diffs viewed: only the desktop header changed (SAVE / LOAD became 備份全部 / 匯入備份, wider buttons). Refreshed and kept: `desktop-results`, `desktop-results-dark`, `desktop-ai`, `desktop-custom`, `desktop-lyrics` `-darwin.png`. `phone-results-darwin.png` was regenerated with a few bytes of difference and no visible difference, so it was reverted. Tablet and phone hide the header buttons. **`-linux.png` baselines were not touched and need a refresh in the cloud container.**

## Decisions Made

- **自主決定 (for Andy's list):** add-only imports keep each song's original createdAt; 全部還原 removes registered settings the backup lacks; a v1 file switches to the new song; the `--danger-*` tokens are defined here and reused by 08-08.
- Settings values are shape-checked as well as length-capped (see deviation 1); song count capped at 1000 and saved words at 5000.
- 全部還原 tile and 只加入歌曲 tile use `aria-labelledby` / `aria-describedby`, so the accessible name is the plain label (UI-SPEC §5.2) while the hint is still announced.
- The pre-import backup id is `import-replace-{Date.now()}`; it counts against the existing keep-3 eviction (08-08 pins baseline and pre-schema backups).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Settings values are checked against the shape the app writes**
- **Found during:** Task 1 (reading `js/theme.js`: `invertColor` turns a garbage colour into `NaN` styles on every boot).
- **Issue:** the plan only caps setting length, so a hostile or damaged file could store a colour such as `red;background:url(http://…)` or an unknown theme value that the next boot would apply.
- **Fix:** `LH_SETTING_SHAPES` in `js/safety.js` (colours `#rrggbb`, theme light / dark, input mode auto / zhuyin / pinyin, pack id `[a-z0-9-]{1,32}`, model one line up to 200 characters) and `dictOverrides_v076` must be a JSON object; values that fail are ignored (and, in replace mode, count as absent).
- **Verification:** `備份：被動過手腳的檔案` includes a hostile `bgColor1`.
- **Committed in:** e4f4c8f

**2. [Rule 2 - Missing critical] Count caps on songs and saved words**
- **Found during:** Task 1.
- **Issue:** the plan names section, tag and length caps but no cap on the number of songs or saved words; a 5 MB file of tiny entries could still create tens of thousands.
- **Fix:** `LH_IMPORT_CAPS.songs` 1000 and `.words` 5000.
- **Committed in:** e4f4c8f

**3. [Rule 2 - Missing critical] 只加入歌曲 refuses in legacy single-song mode**
- **Found during:** Task 2.
- **Issue:** when the schema upgrade never ran (`songsMode` is `'legacy'`), `flushSongs` writes only the legacy keys, so added songs would silently not be stored.
- **Fix:** `importAddSongs` shows the error view with the 「備份存不下來」 sentence (legacy mode only happens when the automatic backup was blocked) and changes nothing.
- **Committed in:** 119a8d8

**4. [Plan wording] Stale line references**
- The plan points at `css/panels.css` 460-560 and `index.html` lines 64-67 / 192-193; the dialog styles actually sit near line 685 and the buttons were found by content. No behavioural impact.

**5. [Plan wording] Test for an automatic backup that cannot be stored**
- The plan suggests a huge `haiku_lyrics`; the spec instead removes `indexedDB` and makes `localStorage.setItem('lh:backup:ls')` throw, the pattern `tests/save-failure.spec.mjs` already uses. Same outcome (`lhBackup` returns not ok), deterministic.

**6. [Plan wording] Task 3 touched no source file**
- Task 3 lists `js/safety.js` and `js/song-io.js` as "tighten wherever an assertion fails"; nothing failed, so Task 3 is test-only.

**Total deviations:** 3 auto-added (Rule 2) and 3 wording notes. **Impact:** two extra safety checks, no scope creep.

## Issues Encountered

- `_dirty.clear()` / `_deleted.clear()` before the reload (so `pagehide` cannot flush a stale song over the restore) has no spec: the modal dialog blocks typing, and `importReplaceAll` flushes before backing up, so the window is only a tiny race. Kept as a guard, not covered.
- 全部還原 rolls back with `lhRestore(pre)`, which itself writes to `localStorage`. If the quota error persists for every write, the rollback can fail too; the first write is the large `lh:songs`, so the common "storage full" case fails before anything is changed (spec `lh:songs`), and a failure after that is exercised with a fail-once key (spec `selectedModel`). The view C sentence is the planned one in both cases.

## Known Stubs

None.

## Threat Flags

None new. T-08-19 (normalisation, hostile-file spec), T-08-20 (explicit registry lookup with `hasOwnProperty`, `({}).polluted` checked before and after), T-08-21 (`備份：檔案格式` reads the file for secrets), T-08-22 (ignored secret keys, key values unchanged), T-08-23 (5 MB check before reading, counts and lengths capped before any dialog), T-08-24 (backup first, rollback specs) are covered. T-08-SC: no package installs.

## Human checks still open (08-UAT)

- iOS Safari: the file chooser behind 匯入備份, and the dialog on a real phone.
- A restore between two genuinely different devices.
- `-linux.png` visual baselines (cloud container).

## Self-Check: PASSED

- Files present: tests/songs-backup.spec.mjs, js/safety.js, js/song-io.js, index.html, css/base.css, css/panels.css.
- Commits e4f4c8f, 119a8d8, 8f33cd8 in `git log`.
- Acceptance greps: `function lhParseBackup` 1, `function lhApplyBackupReplace` 1, `'lucky-hawaii-backup'` 1, `function exportSession` in song-io 1 and 0 in lyrics.js, `id="importOverlay"` 1, `Object.assign` outside comments in safety.js 0, `function importAddSongs` 1, `（匯入）` 3, `備份全部` in safety.js 5, `匯出備份` outside comments in safety.js 0, `把所有歌曲與設定存成一個備份檔` in index.html 2 lines, `這個檔案無法匯入` 1, `目前的歌詞與設定都沒有被改動。` 1, `hasOwnProperty` 4, `備份：被動過手腳的檔案` 1.
- `git status --porcelain -- tests/visual.spec.mjs-snapshots` lists only `-darwin.png` files.
- `npm test`: 662 passed, 27 skipped, 0 failed.
