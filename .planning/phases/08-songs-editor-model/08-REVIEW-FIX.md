---
phase: 08-songs-editor-model
fixed_at: 2026-10-11T00:00:00Z
review_path: .planning/phases/08-songs-editor-model/08-REVIEW.md
iteration: 2
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 8: Code Review Fix Report

**Fixed at:** 2026-10-11
**Source review:** .planning/phases/08-songs-editor-model/08-REVIEW.md (iteration-2 re-review; it replaced the iteration-1 review file)
**Iteration:** 2

**Summary (iteration 2):**
- Findings in scope: 5 (WR-12, plus IN-07, IN-08, IN-09 promoted for data safety, and the optional IN-10, which turned out to be small)
- Fixed: 5
- Skipped: 0
- Not attempted by design: IN-03 to IN-06 (carried-forward Info items, outside the requested scope)

**Where verification ran:** main checkout (`workflow.use_worktrees=false`), branch `gsd/v0.96-stabilize`. Final `npm test`: 716 passed / 27 skipped / 0 failed (iteration-1 end state was 709 / 27 / 0). `?v=` tags untouched (0.96.12). Nothing was pushed.

## Fixed Issues (iteration 2)

### WR-12: The not-ready guard also blocks the recovery paths when `initSongs` has failed
**Files modified:** `js/state.js`, `js/songs.js`, `js/song-io.js`, `tests/songs-model.spec.mjs`
**Commit:** 6c99a78
**Status:** fixed
**Applied fix:** New `songsFailed` flag set by `songsLoadFailed`, kept separate from `songsReady`. `requireSongsReady({ allowFailed: true })` lets file selection, 「全部還原」 and the auto-backup restore through when loading has failed (they only need storage). Everything else is still blocked and now says 「歌詞載入失敗，請重新整理頁面，或到「設定」的「自動備份」還原」 instead of 「歌曲還在載入」. Specs: the failure test checks the new wording; two new specs drive replace-import and auto-backup restore out of a deterministically failing boot, and check the page recovers after reload.

### IN-07: A save latch that stays on after a failed rollback is silent
**Files modified:** `js/safety.js`, `js/songs.js`, `js/song-io.js`, `tests/songs-backup.spec.mjs`, `tests/songs-model.spec.mjs`
**Commit:** 956a581
**Status:** fixed: requires human verification (UX of the broken-state banner)
**Applied fix:** `setSavesFrozen(on, broken)`. A failed rollback (import replace or auto-backup restore) now freezes in the "broken" mode: `flushSongs()` returns `false` and shows a new save-failure banner kind `frozen` with 「資料可能沒有存下來，請先「備份全部」再重新整理。」, and `scheduleSave` keeps arming the timer so every typing burst re-triggers the check (banner repeats are throttled to once per 60 s by the existing banner logic, and it stays visible until the user closes it). I chose the banner rather than making the editor read-only. 「備份全部」 still exports from memory, so typed text is not lost (tested). Also moved `_pendingExternal = false` below the latch check in `_applyExternalSongs`, so a deferred external change is applied after a normal release (new spec).

### IN-08: `corrupt-songs-*` could be lost in the localStorage fallback and piled up on repeated corrupt boots
**Files modified:** `js/safety.js`, `js/songs.js`, `tests/songs-model.spec.mjs`
**Commit:** 6f83c37
**Status:** fixed: requires human verification (backup slot design)
**Applied fix:** The corrupt original now uses the fixed id `corrupt-songs-latest`. In IndexedDB, `lhBackup` replaces that record only when the raw `lh:songs` text differs (identical text is a no-op). In the localStorage fallback it has its own third slot `lh:backup:ls3` (new meta key, excluded from snapshots), so neither delete/import backups (`ls2`) nor `pre-schema-*` (`ls`) can push it out, and only the newest corrupt text is kept. `_lhLocalBackups` reads all three slots. Two new specs (IndexedDB replacement and no-op; fallback slot survives delete backups).

### IN-09: `lhRestoreFromBackup` swallowed a failed `lh:schema` write
**Files modified:** `js/safety.js`, `tests/songs-backup.spec.mjs`
**Commit:** 1ddb850
**Status:** fixed
**Applied fix:** A failed `lh:schema` write now logs, shows the save-failure banner and makes the function return `false`, so `restoreAutoBackup` rolls back instead of reloading with a mismatched schema. New spec runs the full flow with a one-time `lh:schema` write failure and checks the data is rolled back.

### IN-10: Fallback backups not listed while IndexedDB is healthy
**Files modified:** `js/safety.js`, `tests/songs-delete.spec.mjs`
**Commit:** 93afda4
**Status:** fixed
**Applied fix:** `lhListBackups` merges the localStorage-slot records into the IndexedDB result (IndexedDB wins on a duplicate id; extras are ordered by `createdAt`). The result is unchanged when no extra record exists. New spec makes one IndexedDB `put` fail during a delete, then finds that backup in the 自動備份 list and restores the deleted song from it.

## Skipped Issues

None.

---

_Fixed (iteration 2): 2026-10-11_
_Fixer: Claude (gsd-code-fixer)_

# History: iteration 1

The iteration-1 report is kept below unchanged apart from heading levels. All of it was confirmed resolved by the iteration-2 re-review.
# Phase 8: Code Review Fix Report

**Fixed at:** 2026-10-11
**Source review:** .planning/phases/08-songs-editor-model/08-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 14 (CR-01, WR-01..WR-11, plus IN-01 and IN-02 promoted by the orchestrator for data safety)
- Fixed: 14
- Skipped: 0

**Where verification ran:** main checkout (`workflow.use_worktrees=false`), branch `gsd/v0.96-stabilize`. Final `npm test`: 709 passed / 27 skipped / 0 failed (baseline was 688 / 27 / 0; the difference is the new regression tests). `?v=` tags were not touched (still 0.96.12). Nothing was pushed.

### Fixed Issues

#### CR-01: Imported `dictOverrides_v076` is only checked for "is an object"
**Files modified:** `js/safety.js`, `js/dict.js`, `js/init.js`, `tests/songs-backup.spec.mjs`
**Commit:** 8cba3ed
**Status:** fixed
**Applied fix:** New `lhCleanDictOverrides` allow-list (keys must match `^[ㄅ-ㄩ]{1,8}[1-5]$`, values must be strings of at most 20000 characters; `__proto__`, `constructor`, `prototype` never match). Used in `_lhSettingFrom` (import) and in `loadDictOverrides` (stored data), which now skips bad entries, warns once, and stashes the original text. `buildIndex` skips non-string values, and `init.js` wraps both calls in try/catch with `lhWarn`, so the rest of boot always runs. Three new specs.

#### WR-01: `_dirty.clear()` before reload does not stop later keystrokes from overwriting restored data
**Files modified:** `js/songs.js`, `js/song-io.js`, `tests/songs-backup.spec.mjs`
**Commit:** 9f9c344
**Status:** fixed: requires human verification (concurrency / timing logic)
**Applied fix:** One-way latch `setSavesFrozen(true)` set at the start of "全部還原" and `restoreAutoBackup`. While frozen, `flushSongs`, `scheduleSave` and `_applyExternalSongs` are no-ops. The `_dirty.clear()` / `_deleted.clear()` calls are gone. The latch is released (and pending edits flushed) on any failure path, and stays on until reload on success. Two new specs (latch blocks typing, timers, blur and pagehide; failed restore releases it and the edits typed meanwhile get saved).

#### WR-02: Import caps lower than the editor allows
**Files modified:** `js/safety.js`, `js/song-io.js`, `tests/songs-backup.spec.mjs`
**Commit:** 3ad560b
**Status:** fixed
**Applied fix:** Caps raised well above anything the editor can produce (songs 5000, sections 2000, label 200, tags 200 x 100 chars, context 100000, section text 1,000,000, saved words 20000 x 100). Song title stays at 60 because the editor enforces it. `lhParseBackup` now returns `truncated`, and the import summary adds 「注意：有內容超過上限，匯入時會被截短」 before the user chooses, so nothing is cut silently. The existing hostile-file spec was updated to the new limits and a new spec checks that editor-sized content restores intact.

#### WR-03 and WR-04: Rollback reported dishonestly / no rollback for auto-backup restore
**Files modified:** `js/safety.js`, `js/song-io.js`, `tests/songs-backup.spec.mjs`
**Commit:** 44fb992 (one commit for both, they share the new `lhRollback` helper)
**Status:** fixed: requires human verification (error-path logic)
**Applied fix:** New `lhRollback(snap, prevSchema)` restores data and `lh:schema` and reports success. `lhApplyBackupReplace` returns `stage: 'rollback'` when the rollback itself fails, and the dialog then says the data may be partly new, tells the user to press 「備份全部」, and does not claim 「都沒有被改動」. `restoreAutoBackup` now snapshots first, rolls back on failure, and its toast states honestly whether the rollback worked. When the rollback fails the save latch stays on so storage is not mangled further (「備份全部」 exports from memory). Three new specs.

#### WR-05: Stale `song` reference after the AI call
**Files modified:** `js/ai-generate.js`, `tests/songs-model.spec.mjs`
**Commit:** 4b997db
**Status:** fixed
**Applied fix:** Only the song id is kept across the `await`; the song is looked up again afterwards. If it is gone, the toast says 「這首歌已經不在了，結果沒有套用」. Two new specs (songs array replaced with fresh objects; song deleted while waiting).

#### WR-06: `lastLyricsSelection` leaks across songs
**Files modified:** `js/lyrics.js`, `tests/songs-model.spec.mjs`
**Commit:** 4b997db (same commit as WR-05)
**Status:** fixed
**Applied fix:** `renderActiveSong()` resets `lastLyricsSelection = ''`, which every switch, boot, delete and external reload goes through. New spec checks the prompt sent after a switch contains the new song's lyrics and not the old selection.

#### WR-07: Pending 300 ms save timer fires during IME composition
**Files modified:** `js/songs.js`, `js/lyrics.js`, `tests/songs-ime.spec.mjs`
**Commit:** 9699e4b
**Status:** fixed: requires human verification (IME behaviour; only simulated with CDP)
**Applied fix:** `_lhComposing` moved to `songs.js`; `flushSongs()` returns early while composing, so the armed timer and every other caller skip the write. `compositionstart` also cancels the timer; `compositionend` and `focusout` flush. One deliberate exception: `pagehide` and `visibilitychange: hidden` call `flushSongs(true)`, because losing already-typed text on tab close is worse than writing a half-composed character. `renderLyricsSections` resets the flag so it cannot stick when the input element is replaced. The new spec fails without the fix (verified by stashing it).

#### WR-08: `_applyExternalSongs` discards unsaved edits when the own flush failed
**Files modified:** `js/songs.js`, `tests/songs-model.spec.mjs`
**Commit:** ec1b05d
**Status:** fixed: requires human verification (multi-tab merge logic)
**Applied fix:** In-memory songs listed in `_dirty` are carried over when `songs` is replaced (and kept even if storage no longer has them); songs this tab deleted but could not write are not resurrected. When the flush failed the "已重新載入" toast is replaced by a message saying the edits are still on screen and to press 「備份全部」; the save-failure banner already comes from `lhSet`. New spec simulates a quota failure plus an external change.

#### WR-09: Actions before `initSongs` finishes, and endless 「載入歌詞中…」 on failure
**Files modified:** `js/state.js`, `js/songs.js`, `js/song-io.js`, `js/ui-common.js`, `tests/songs-model.spec.mjs`
**Commit:** 543faf7
**Status:** fixed
**Applied fix:** `songsReady` flag (set at the end of `initSongs`) and `requireSongsReady()` guard `exportSession`, `importSession`, `importAddSongs`, `importReplaceAll`, `restoreAutoBackup` and `createSong` with the toast 「歌曲還在載入，請稍候再試」. `initSongs` failure is caught in `ui-common.js` by `songsLoadFailed`: the editor area shows a plain message saying the stored data is untouched, plus a toast; the guards stay on. Two new specs.

#### WR-10: Corrupt `lh:songs` silently replaced by a blank song
**Files modified:** `js/safety.js`, `js/songs.js`, `tests/songs-model.spec.mjs`
**Commits:** a18e747, 6290895 (follow-up so the catch logs instead of swallowing, required by `scan.spec.mjs`)
**Status:** fixed: requires human verification (recovery logic)
**Applied fix:** `initSongs` now salvages every entry that has a valid id and a sections array (duplicates dropped). Before the corrupt text is overwritten, a snapshot containing it is saved as a pinned auto backup `corrupt-songs-<timestamp>` (the id prefix is added to the pinned set), and the user gets one toast saying how many songs were recovered and where the original is (設定 -> 自動備份). No new UI. Two new specs (partial salvage with pinning check; totally unreadable data).

#### WR-11: Test helper `activeSong()` forced `flushSongs()`
**Files modified:** `tests/helpers.mjs`, `tests/songs-model.spec.mjs`, `tests/songs-ime.spec.mjs`, `tests/songs-ui.spec.mjs`, `tests/storage.spec.mjs`, `tests/layout.spec.mjs`, `tests/songs-backup.spec.mjs`
**Commit:** 3a58ad4
**Status:** fixed
**Applied fix:** Helper split into `activeSongRaw` (reads storage, no flush, used for every persistence claim) and `flushAndReadActiveSong` (setup/teardown only). The old `activeSong` export is removed. Two assertions that really depend on the 300 ms debounce now use `expect.poll`; `storedSongs` in the backup spec no longer flushes. No source bug was uncovered: all other call sites already flush at the right moment.

#### IN-01: Pinned backups could be evicted, delete dialog promised more than it delivered
**Files modified:** `js/safety.js`, `js/songs.js`, `index.html`, `tests/songs-delete.spec.mjs`, `tests/songs-backup.spec.mjs`
**Commit:** f530464
**Status:** fixed: requires human verification (fallback backup design)
**Applied fix:** The localStorage fallback now has two slots: `lh:backup:ls` holds pinned records (baseline, pre-schema-*, corrupt-songs-*) and the new meta key `lh:backup:ls2` holds the latest ordinary auto backup (delete, import, restore). A delete backup can no longer overwrite `pre-schema-2`. Inside the pinned slot, `baseline` (re-requested on every boot) never replaces an existing pinned record, which also fixes a second-boot eviction of `pre-schema-2`; `pre-schema-N` may replace `baseline` or an older pre-schema; other pinned records fall back to the ordinary slot rather than push out a pre-schema. `lhListBackups` and `lhRestoreFromBackup` read both slots. Copy made honest: the delete dialog now says backups are restored from 設定 -> 自動備份 and that only the latest few are kept; the settings hint says the same and that pre-upgrade backups are kept; the delete-failure status now names the real reason (backup not saved, or recent edits not saved). Limitation: with no IndexedDB the pinned slot holds one record, and the ordinary slot only the latest backup.

#### IN-02: Restoring an IndexedDB auto backup replaced or removed current `apiKey_*` keys
**Files modified:** `js/safety.js`, `tests/storage.spec.mjs`
**Commit:** 3341f82
**Status:** fixed
**Applied fix:** `lhRestoreFromBackup` strips all secret-prefixed keys from the backup and adds the current ones for both the IndexedDB and the localStorage path. Current keys are never overwritten or removed; a key is only filled in from the backup when it is currently missing. Admin keys were already outside the restorable set. Rollback paths that restore their own snapshot keep their previous behaviour. New spec.

### Skipped Issues

None. Other Info items (IN-03 to IN-06) were out of scope for this run.

---

_Fixed: 2026-10-11_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_

## Orchestrator note
- Iteration 3 re-review skipped: iteration-2 fixes (6c99a78, 956a581, 6f83c37, 1ddb850, 93afda4) are narrow with new specs; npm test 716/27/0. Phase verifier re-checks.
