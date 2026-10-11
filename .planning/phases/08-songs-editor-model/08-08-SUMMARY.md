---
phase: 08-songs-editor-model
plan: 08
subsystem: song-delete
tags: [delete, backup, restore, schema, dialog, a11y, touch, playwright]
status: complete
requires:
  - phase: 08-07
    provides: --danger-* tokens, lhBuildBackup / lhApplyBackupReplace, import dialog patterns (opener focus, Esc / Tab trap, #lh-restored hash toast)
  - phase: 08-05
    provides: song list rows (renderSongList, #songItems delegates, startRenameSong), sortedSongs, cutName, nextUntitledNumber, makeEmptySong, _deleted set
  - phase: 08-01
    provides: lhBackup / lhListBackups / lhRestore / lhSnapshot, lh:schema migration (pre-schema-2 backup)
provides:
  - "js/songs.js: 🗑 row button, openDeleteSong / confirmDeleteSong / closeDeleteSong, Delete key, dialog Esc and Tab trap"
  - "js/safety.js: _lhPinnedBackup (baseline and pre-schema-* never evicted), lhRestoreFromBackup writes lh:schema from the backup record"
  - "js/song-io.js: renderAutoBackups, two-tap 還原這份, restoreAutoBackup (pre-restore backup first, reload), #lh-restored-backup toast"
  - "index.html: #songDeleteOverlay (alertdialog), settings #autoBackupSection"
  - "css/panels.css: .song-danger-btn, delete dialog text, backup list cards; css/responsive.css: 44px floors"
  - "tests/songs-delete.spec.mjs: 16 specs titled 刪除歌曲："
affects: [08-09]
actuals:
  tokens: 11100
  tasks: 3
  commits: 3
plan_head_before: 548ea474bb660bdae39f6b557f5d053348523d46
plan_head_after: 3c8cc760e522e987693aa3207e8a5595e584b2ed
commits: 3
tech-stack:
  added: []
  patterns: ["destructive action = backup first (id with random tail so same-millisecond runs never reuse an id), abort unless ok, in-memory and storage rollback when the write fails", "two-tap inline confirm instead of a third dialog", "pinned backup ids are excluded from the keep-3 eviction", "restore from a backup also resets the meta key lh:schema from the record"]
key-files:
  created: [tests/songs-delete.spec.mjs]
  modified: [js/songs.js, js/safety.js, js/song-io.js, index.html, css/panels.css, css/responsive.css, tests/storage.spec.mjs]
key-decisions:
  - "還原這份 uses a two-tap inline confirm (button text 再按一次確定還原（會先備份目前資料）, resets after 4 s) instead of a third dialog"
  - "baseline and pre-schema-* backups are pinned; the newest 3 of all other backups are kept"
  - "With IndexedDB unavailable the single localStorage fallback slot still holds only the newest backup (unchanged from 08-01)"
  - "Backup ids for delete and restore carry a random tail (song-delete-{ms}-{rand}, pre-restore-{ms}-{rand}) because lhBackup does not rewrite an existing id"
  - "A failed write after the backup puts the song back in memory and restores the pre-delete snapshot, so 「這首歌還在」 is true"
requirements-completed: [EDIT-04, EDIT-09]
duration: 17 min
completed: 2026-10-11
coverage:
  - id: E1
    description: "🗑 on a row (or Delete on a focused name) opens the alertdialog with title 刪除「{歌名}」？, the exact body, focus on 先不刪除; confirming stores a song-delete-* backup holding the song first, then removes it; the row below (else above) becomes active; toast 已刪除「{歌名}」"
    requirement: EDIT-04
    verification:
      - { kind: e2e, ref: "tests/songs-delete.spec.mjs#刪除歌曲：先備份再刪", status: pass }
      - { kind: e2e, ref: "tests/songs-delete.spec.mjs#刪除歌曲：鍵盤與焦點", status: pass }
      - { kind: e2e, ref: "tests/songs-delete.spec.mjs#刪除歌曲：取消不動資料", status: pass }
    human_judgment: false
  - id: E2
    description: "The list never reaches 0 songs: deleting the last song creates 未命名歌曲 1 with one empty section and makes it active; the hint and the last-song sentence appear only with exactly one song"
    requirement: EDIT-04
    verification:
      - { kind: e2e, ref: "tests/songs-delete.spec.mjs#刪除歌曲：最後一首", status: pass }
    human_judgment: false
  - id: E3
    description: "No song is deleted unless its backup was stored: a throwing or not-ok lhBackup leaves the dialog open with 刪除沒有完成，這首歌還在。 and the song in lh:songs; while the backup runs the button reads 刪除中… and Esc / overlay click do nothing"
    requirement: EDIT-04
    verification:
      - { kind: e2e, ref: "tests/songs-delete.spec.mjs#刪除歌曲：備份失敗就不刪", status: pass }
      - { kind: e2e, ref: "tests/songs-delete.spec.mjs#刪除歌曲：刪除中", status: pass }
    human_judgment: false
  - id: E4
    description: "baseline and pre-schema-* are never evicted, the newest 3 others are kept; restoring pre-schema-2 (IndexedDB or the localStorage fallback) resets lh:schema so the reload re-runs the migration and shows the original lyrics"
    requirement: EDIT-09
    verification:
      - { kind: e2e, ref: "tests/storage.spec.mjs#backup: 同一毫秒建立的備份不互相覆蓋，只保留最新 3 份", status: pass }
      - { kind: e2e, ref: "tests/songs-delete.spec.mjs#刪除歌曲：還原會一起還原資料版本", status: pass }
      - { kind: e2e, ref: "tests/songs-delete.spec.mjs#刪除歌曲：備援還原也還原資料版本", status: pass }
    human_judgment: false
  - id: E5
    description: "Settings 自動備份 lists every automatic backup newest first with YYYY/MM/DD HH:mm and its reason, 目前沒有自動備份 when empty, labels as literal text; 還原這份 needs a second tap within 4 s, stores pre-restore-*, restores, reloads and toasts 已還原自動備份（還原前的資料已自動備份）"
    requirement: EDIT-09
    verification:
      - { kind: e2e, ref: "tests/songs-delete.spec.mjs#刪除歌曲：自動備份清單", status: pass }
      - { kind: e2e, ref: "tests/songs-delete.spec.mjs#刪除歌曲：沒有備份時的清單", status: pass }
      - { kind: e2e, ref: "tests/songs-delete.spec.mjs#刪除歌曲：從自動備份救回刪掉的歌", status: pass }
      - { kind: e2e, ref: "tests/songs-delete.spec.mjs#刪除歌曲：備份名稱原樣顯示", status: pass }
    human_judgment: false
  - id: E6
    description: "Phone keyboard (336 px shrink) keeps the rename input and the dialog buttons in the visible area; at 150% the delete and import dialog buttons do not clip or overlap; every new button has a hit box of at least 44x44 at 390x844, 820x1180 touch and 1180x820 coarse; import tiles are disabled while restoring"
    requirement: EDIT-04
    verification:
      - { kind: e2e, ref: "tests/songs-delete.spec.mjs#刪除歌曲：手機鍵盤", status: pass }
      - { kind: e2e, ref: "tests/songs-delete.spec.mjs#刪除歌曲：放大 150% 按鈕不擠", status: pass }
      - { kind: e2e, ref: "tests/songs-delete.spec.mjs#刪除歌曲：觸控目標", status: pass }
      - { kind: e2e, ref: "tests/songs-delete.spec.mjs#刪除歌曲：還原中按鈕停用", status: pass }
      - { kind: e2e, ref: "tests/layout.spec.mjs#觸控：手機平板每個按鈕至少 44px（7 種畫面）", status: pass }
    human_judgment: false
  - id: E7
    description: "Real iOS keyboard with the rename input in the overlay list and the delete dialog; feel of the two-tap restore on a phone"
    human_judgment: true
    rationale: "Playwright shrinks the viewport by 336 px; it is not iOS Safari's keyboard or a real finger (08-UAT)."
---

# Phase 8 Plan 08: Delete a Song and Restore Automatic Backups Summary

🗑 on every song row (or the Delete key on a focused name) opens a real alertdialog; confirming first stores a `song-delete-*` automatic backup and only then removes the song, the list never drops to zero songs, and the settings dialog gets a 自動備份 list whose 還原這份 (two taps, backs up the current data first) makes the dialog's 「可從備份還原」 true, including old-format restores that reset `lh:schema` so the migration runs again.

## Performance

- **Duration:** 17 min
- **Started:** 2026-10-11T03:24:41Z
- **Completed:** 2026-10-11T03:42:13Z
- **Tasks:** 3 (1 tracer, 2 auto)
- **Files modified:** 8 (7 source / test files, 1 new spec)

## Accomplishments

- **Delete dialog (C4, §3)**: `#songDeleteOverlay` with `role="alertdialog"`; title cut to 24 characters with the full name in a line only when cut; the exact body, an extra sentence only for the last song; 先不刪除 / 刪除這首歌 (filled `--danger-bg`); focus starts on 先不刪除; Tab stays inside; Esc and overlay click mean 先不刪除; focus returns to the 🗑 that opened it, or to ☰ 歌曲 when the row is gone.
- **Safe order (T-08-25)**: `flushSongs()` must succeed, then `lhBackup('song-delete-…', '刪除「{歌名}」前的自動備份', lhSnapshot())` must return ok, and only then is the song removed. Any failure leaves the dialog open with 刪除沒有完成，這首歌還在。 and re-enables the button. While it runs the button reads 刪除中… and both buttons are disabled.
- **Never zero songs**: neighbour (row below, else above) becomes active when the deleted song was active; deleting the last song pushes `未命名歌曲 N` with one empty section; toast 已刪除「…」 (2400) or 已刪除「…」，並建立一首空白的新歌 (4000).
- **Pinned backups (F1, T-08-26)**: `_lhPinnedBackup(id)` (`baseline`, `pre-schema-*`) are filtered out before the keep-3 slice, so deletes and imports can never push the upgrade safety copies out.
- **Schema-aware restore (F1, T-08-27, Pitfall 10)**: `lhRestoreFromBackup` writes `lh:schema = String(rec.schema || 1)` after either restore path; restoring `pre-schema-2` and reloading re-runs the migration and shows the fixture lyrics, from IndexedDB and from the localStorage fallback record.
- **自動備份 list (T-08-28, T-08-29)**: settings `<details id="autoBackupSection">`; newest first, local time `YYYY/MM/DD HH:mm`, label via `textContent`, empty text 目前沒有自動備份. First tap on 還原這份 arms it (再按一次確定還原（會先備份目前資料）, reset after 4 s); second tap stores `pre-restore-*`, restores, reloads with `#lh-restored-backup`, and the next load toasts 已還原自動備份（還原前的資料已自動備份）.
- **Edges**: Delete on a focused `.song-pick`, dialog keyboard trap, `(pointer: coarse), (max-width: 900px)` floors for the dialog buttons, 還原這份 and the 自動備份 summary.

## Task Commits

1. **Task 1 (tracer): 🗑 → dialog → 先備份再刪除, pinned eviction** - `52edbdb` (feat)
2. **Task 2: 自動備份 list, schema-aware restore, two-tap 還原這份** - `6fbac0d` (feat)
3. **Task 3: Delete key, dialog keyboard, touch floors, edge specs** - `3c8cc76` (feat)

**Plan metadata:** docs commit follows this summary.

## RED evidence

- **Task 1:** `刪除歌曲：先備份再刪` failed on the first target step (`.song-act.delete` not found, no 🗑 rendered) and the storage keep-3 test, changed to expect `['baseline','pre-schema-2','t3','t4','t5']`, failed with received `['t3','t4','t5']`. Both RED on the target assertion, then GREEN after the eviction filter and the dialog.
- **Task 2:** the two schema tests failed on `expect(lh:schema).toBe('1')` (received `'2'`); the four list tests failed at the missing `#autoBackupSection summary`. GREEN after `rec.schema`, the settings section and `renderAutoBackups`. The first GREEN run still failed `從自動備份救回刪掉的歌`: the settings dropdown calls `stopPropagation`, so a document-level click listener never saw the button (see Deviations 1).
- **Task 3:** specs were written after the implementation was in place (the tracer already shipped the open / confirm / close logic), so most passed at first run. To prove they are not vacuous, two mutations were applied and reverted: replacing the `if (!backedUp)` gate with `if (false)` (failed `備份失敗就不刪`), and dropping `.backup-restore-btn` from the touch rule (failed `觸控目標`). Each commit holds RED and GREEN together, as 08-06 and 08-07 did; no separate `test(...)` commit precedes a `feat(...)` commit.

## Verification

- Task 1 verify: 36 passed (smoke, storage, songs-delete). Tracer re-run end to end: passed, expanded.
- Task 2 verify: 55 passed (songs-delete 7, storage, smoke, style).
- Task 3 verify: songs-delete 16 + songs-ui + songs-backup + layout: 139 passed after the summary-floor fix.
- Final `npm test`: **678 passed / 27 skipped / 0 failed** (baseline 662 plus 16 new). `?v=` untouched at 0.96.12.

## Decisions Made

- **自主決定 (for Andy's list):** 還原這份 uses a two-tap inline confirm instead of a third dialog; `baseline` and `pre-schema-*` backups are pinned (never evicted) while the newest 3 of the rest are kept; with IndexedDB unavailable the single localStorage fallback slot still holds only the newest backup, so the 自動備份 list shows one entry there and an empty-fallback profile reads 目前沒有自動備份.
- Backup ids for delete and restore carry a random tail because `lhBackup` leaves an existing id untouched; a same-millisecond second delete would otherwise silently skip its backup.
- The cancel button is disabled while the backup runs (the plan's "usable only when no write has started" is read as: the backup is the first step of the write).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Click listener for 還原這份 must sit on the list, not the document**
- **Found during:** Task 2 (first GREEN run of `從自動備份救回刪掉的歌`).
- **Issue:** `.settings-dropdown` has `onclick="event.stopPropagation()"`, so a `document` click listener never fires for buttons inside it; the first tap never armed.
- **Fix:** the delegated listener is attached to `#autoBackupList` itself (the plan's wording), with a comment saying why.
- **Files modified:** js/song-io.js
- **Committed in:** 6fbac0d

**2. [Rule 2 - Missing critical] A failed write after the backup puts everything back**
- **Found during:** Task 1.
- **Issue:** the plan says the dialog stays open with 「這首歌還在」 on failure, but if `flushSongs()` fails after the song was removed from memory, the status line would be untrue.
- **Fix:** `confirmDeleteSong` keeps `prevSongs` / `prevActive`, clears the `_deleted` flag, and calls `lhRestore(pre)` (the snapshot taken for the backup) before showing the failure line. A `flushSongs()` that fails before the backup also aborts.
- **Files modified:** js/songs.js
- **Committed in:** 52edbdb

**3. [Rule 2 - Missing critical] Unique backup ids for delete and restore**
- **Found during:** Task 1.
- **Issue:** `lhBackup` returns `{ ok: true, existed: true }` without writing when the id already exists, so `'song-delete-' + Date.now()` could reuse an id in the same millisecond (and under a fixed test clock) and skip the backup of the newer state.
- **Fix:** ids are `song-delete-{ms}-{random4}` and `pre-restore-{ms}-{random4}`; still start with the planned prefixes.
- **Files modified:** js/songs.js, js/song-io.js
- **Committed in:** 52edbdb, 6fbac0d

**4. [Rule 2 - Missing critical] 44px floor for the 自動備份 summary**
- **Found during:** Task 3 (full `layout.spec.mjs` touch audit: `設定開著：summary 294×28`).
- **Issue:** the plan lists only the three buttons; the new `<summary>` is also a control in the settings dialog.
- **Fix:** `.settings-backups summary { line-height: var(--hit) }` in the coarse / narrow block (not `display:flex`, which would remove the disclosure marker).
- **Files modified:** css/responsive.css
- **Committed in:** 3c8cc76

**5. [Rule 1 - Bug] Delete key opener when the actions row is hidden**
- **Found during:** Task 3 (design check).
- **Issue:** in the push column only the active row shows 🗑; pressing Delete on another focused name would return focus to a `display:none` button and lose it.
- **Fix:** the Delete key passes the row's 🗑 only when it is rendered (`offsetParent`), otherwise the song name button.
- **Files modified:** js/songs.js
- **Committed in:** 3c8cc76

**6. [Plan wording] Test placement and zoom helper**
- The fallback restore test lives in `tests/songs-delete.spec.mjs` (the plan allowed `storage.spec.mjs`). The 150% spec sets the scale with `setUiScale(150)` (the call `songs-ui.spec.mjs` already uses) because the real ➕ button sits in the header, which the phone lyrics sheet covers. The phone touch spec opens settings with `toggleSettings()` for the same reason.

**Total deviations:** 5 auto-fixed (2 Rule 1, 3 Rule 2) and 1 wording note. **Impact:** two extra safety paths and one extra touch floor; no scope creep.

## Issues Encountered

- `_dirty.clear()` / `_deleted.clear()` before the reload in `restoreAutoBackup` (copied from `importReplaceAll` so `pagehide` cannot flush a stale song over the restore) still has no spec of its own, same open item as 08-07. The two reload specs do pass, but they flush before restoring, so they would also pass without it.
- The localStorage fallback record has no secrets and is a single slot, so on a device with no IndexedDB the 自動備份 list shows at most one entry; a delete there replaces the previous fallback copy.

## Known Stubs

None.

## Threat Flags

None new. T-08-25 (throwing and not-ok `lhBackup` spec), T-08-26 (storage keep-3 spec with both pinned ids), T-08-27 (reload spec after restoring `pre-schema-2`, IndexedDB and fallback), T-08-28 (markup song name shown literally, no `<b>` element), T-08-29 (two-tap confirm spec, `pre-restore-*` backup holds the pre-restore songs) are covered. T-08-SC: no package installs.

## Human checks still open (08-UAT)

- iOS Safari: the keyboard with the rename input in the overlay list and the delete dialog; the two-tap 還原這份 on a real phone.
- `-linux.png` visual baselines (cloud container); no `-darwin.png` baseline changed in this plan (visual suite passed unchanged).

## Self-Check: PASSED

- Files present: tests/songs-delete.spec.mjs, js/songs.js, js/safety.js, js/song-io.js, index.html, css/panels.css, css/responsive.css.
- Commits 52edbdb, 6fbac0d, 3c8cc76 in `git log`.
- Acceptance greps: `function confirmDeleteSong` 1, `song-delete-` in songs.js 1, `_lhPinnedBackup` 2, `id="songDeleteOverlay"` 1, `role="alertdialog"` 1, `var(--danger-bg)` 1, `rec.schema` 1, `function renderAutoBackups` 1, `pre-restore-` 1, `id="autoBackupSection"` 1, `再按一次確定還原` 2, `'Delete'` 1, `刪除沒有完成，這首歌還在。` 1, last-song sentence in index.html 1, `刪除歌曲：放大 150% 按鈕不擠` 1.
- Plan `<verification>`: songs-delete + storage + songs-ui + smoke + style green; `npm test` 678 passed / 27 skipped / 0 failed.
