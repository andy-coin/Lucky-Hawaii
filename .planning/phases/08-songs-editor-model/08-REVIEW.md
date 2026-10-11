---
phase: 08-songs-editor-model
reviewed: 2026-10-11T00:00:00Z
depth: standard
files_reviewed: 18
files_reviewed_list:
  - index.html
  - js/ai-generate.js
  - js/dict.js
  - js/init.js
  - js/lyrics.js
  - js/safety.js
  - js/song-io.js
  - js/songs.js
  - js/state.js
  - js/ui-common.js
  - tests/helpers.mjs
  - tests/layout.spec.mjs
  - tests/songs-backup.spec.mjs
  - tests/songs-delete.spec.mjs
  - tests/songs-ime.spec.mjs
  - tests/songs-model.spec.mjs
  - tests/songs-ui.spec.mjs
  - tests/storage.spec.mjs
findings:
  critical: 0
  warning: 1
  info: 8
  total: 9
status: issues_found
---

# Phase 8: Code Review Report (re-review, iteration 2)

**Reviewed:** 2026-10-11
**Depth:** standard (`git diff 5e0fbe9..HEAD`, plus the unchanged consumers `js/cards.js`, `js/dict.js` and `data/rhyme-dict.json`)
**Files Reviewed:** 18
**Status:** issues_found

## Summary

All 14 in-scope findings are resolved: CR-01, WR-01 to WR-11, IN-01 and IN-02. I traced each fix through its failure paths and found no regression that loses or corrupts lyrics. One new warning (WR-12) concerns the recovery paths that the WR-09 guard blocks. The rest are low-risk Info items, plus four earlier Info items (IN-03 to IN-06) that still apply.

Points you asked me to check:

- **`setSavesFrozen` latch.** It is released on every non-success path:
  - **Import replace:** `backup`, `write` and a thrown error all unfreeze and flush the edits typed meanwhile. A failed rollback deliberately stays frozen.
  - **Auto-backup restore:** the `finally` block unfreezes unless `keepFrozen` is set. `keepFrozen` is set only on success (reload follows) or a failed rollback.
  - **Early returns:** the not-ready and busy guards run before the latch is set.
  - **Normal saving:** it is never blocked afterwards. See IN-07 for what the user sees when the latch stays on.
- **Rollback honesty.** `lhRollback` reports a failure of either the data restore or the `lh:schema` restore. `lhApplyBackupReplace` then returns `stage: 'rollback'`. That message drops the "沒有被改動" sentence, and the toast in `restoreAutoBackup` says whether the rollback worked.
- **Composition skip.**
  - **No text lost:** `pagehide` and hidden `visibilitychange` call `flushSongs(true)`, which bypasses the skip. `compositionend` and `focusout` flush after they clear the flag. The skipped writes leave `_dirty` set, so they are written later.
  - **Stuck flag:** `renderLyricsSections` resets the flag. The only remaining stuck-flag case is a field removed without a re-render, and `pagehide` still saves.
- **`songsReady` guard.**
  - **Normal path:** no deadlock. `.then(initSongs).catch(songsLoadFailed)` always settles, and `__hoyunSongsReady` resolves.
  - **After a failure:** it stays false by design. See WR-12.
- **Corrupt-songs salvage and `corrupt-songs-*` pin.**
  - **Salvage:** it keeps entries with a valid id and a sections array, and drops duplicate ids.
  - **Snapshot timing:** the pinned backup's snapshot is taken synchronously before the overwrite.
  - **IndexedDB eviction:** the `corrupt-songs-` prefix is pinned there. See IN-08 for the localStorage fallback.
- **`lh:backup:ls2`.**
  - **Registration:** it is in `LH_META_KEYS`, so it is excluded from snapshots and restores, and the key scan accepts it.
  - **Slots:** the pinned slot no longer gets overwritten by delete or import backups. `baseline` never replaces a pinned record.
  - **Reads:** `_lhLocalBackups` reads both slots, and `lhRestoreFromBackup` falls back to both.
- **apiKey preservation.** Both restore paths now keep every current `apiKey_*` key and only add back backup keys that are currently missing. Admin keys were already unrestorable.
- **dictOverrides allow-list.**
  - **Keys:** `^[ㄅ-ㄩ]{1,8}[1-5]$`. All 1343 keys in `data/rhyme-dict.json` match, and `moveCharTier` only edits existing keys, so real overrides are never dropped. `__proto__`, `constructor` and `prototype` are rejected.
  - **Values:** they must be strings of at most 20000 characters. `JSON.stringify` of the null-prototype object is what gets stored.
  - **Boot:** `loadDictOverrides` and `buildIndex` are each wrapped in `try/catch` in `init.js`, and `buildIndex` skips non-string values.
  - **Characters:** a single-code-point character from an override value cannot form an attribute injection in `cards.js`.
- **Traditional Chinese.** No Simplified Chinese characters in the added lines of source or tests.

## Warnings

### WR-12: The not-ready guard also blocks the recovery paths when `initSongs` has failed, and the toast then says "還在載入"

**File:** `js/song-io.js:288` (`importSession`), `js/song-io.js:351` (`importReplaceAll`), `js/song-io.js:460` (`restoreAutoBackup`), `js/songs.js:114-128` (`requireSongsReady`, `songsLoadFailed`)
**Issue:** `songsReady` stays false forever once `songsLoadFailed` runs. That is right for export, add-only import and "新增歌曲", because `songs` is empty or unusable. But "全部還原" and the 設定, 自動備份 restore do not need `songs` at all. They snapshot storage, write storage and reload. They are exactly the way out when stored data makes `initSongs` throw deterministically, and they are now locked by the same guard. The user can only reload and see the same failure. The only way out is devtools.

The toast is also wrong in this state. It says 「歌曲還在載入，請稍候再試」 when loading has in fact failed.
**Fix:** Track failure separately and let the two replace-style paths through.

```js
let songsFailed = false;                       // state.js
function songsLoadFailed(e) { songsFailed = true; /* existing body */ }
function requireSongsReady(opts) {
    if (songsReady) return true;
    if (songsFailed) {
        if (opts && opts.allowFailed) return true;           // restore / replace only need storage
        showToast('歌詞載入失敗，請重新整理頁面，或到「設定」的「自動備份」還原', 4000);
        return false;
    }
    showToast('歌曲還在載入，請稍候再試', 2400);
    return false;
}
```

Call `requireSongsReady({ allowFailed: true })` in `restoreAutoBackup` and `importReplaceAll`, and in `importSession` only when the user is going on to "全部還原". The `flushSongs()` calls inside those functions are harmless with an empty `songs`.

## Info

### IN-03: Legacy mode and v2 mode can drift apart across tabs (carried forward)

**File:** `js/songs.js:40-48`, `js/songs.js:189-193`
**Issue:** Unchanged. A tab that booted in legacy mode keeps writing `haiku_lyrics`, and the storage listener ignores it. If another tab completes the migration, the legacy tab's later edits are never read back. They are not deleted, but they are invisible.
**Fix:** In legacy mode, when `lh:schema` becomes `'2'` (a storage event on that key), show a toast asking the user to reload.

### IN-04: Markdown export escapes only a leading `# > * + -` / `N.` (carried forward)

**File:** `js/song-io.js:22-27`
**Issue:** Unchanged. Other constructs in lyrics still change the rendering: `=== `, `1)`, 4-space indentation, inline `*_` and backticks, links, and raw `<tag>`. A title containing a newline, possible via an imported backup, adds structure to the `#` line.
**Fix:** Escape `\ * _ \` [ ] < >` inside lines, treat leading whitespace and `N)` as block markers, and collapse newlines in the title for the `#` line.

### IN-05: `importAddSongs` de-duplicates titles only against existing songs (carried forward)

**File:** `js/song-io.js:321-330`
**Issue:** Unchanged. The `titles` set is built once and not updated inside the loop. Two incoming songs with the same title both receive the same 「（匯入）」 suffix.
**Fix:** `titles.add(song.title)` after each insert.

### IN-06: Empty section labels show 歌詞/新段落 on screen but 段落 n in exports (carried forward)

**File:** `js/lyrics.js:240` vs `js/song-io.js:9`
**Issue:** Unchanged. The UI and the export name the same unnamed section differently.
**Fix:** Share one `displayLabel(sec, i)` helper.

### IN-07: A save latch that stays on after a failed rollback is silent, and external-change events are dropped while it is on

**File:** `js/songs.js:62-70` and `js/songs.js:211-216`, `js/song-io.js:354-367` and `js/song-io.js:480-486`
**Issue:**
- **Silent unsaved typing.** When the rollback fails, the latch deliberately stays on. `flushSongs` then returns `true` with no write and no indicator. The one-off dialog or toast may already be gone, and the user can keep typing into an editor that never saves. A save-failure banner appears only if `lhRestore` itself failed, not if only the `lh:schema` rollback failed.
- **Dropped external events.** `_applyExternalSongs` clears `_pendingExternal` before it checks the latch. Storage events that arrive during a restore are therefore dropped for good, even after the latch is released on failure. No data is lost, because merge-on-write still protects storage, but the screen stays stale until the next event.
**Fix:**
- While the latch is held because a rollback failed, make `flushSongs` return `false` and call `lhSaveFailed('save')`, so the banner keeps showing.
- Move `_pendingExternal = false` below the latch check in `_applyExternalSongs`, so a deferred external change is applied once the latch is released.

### IN-08: `corrupt-songs-*` is pinned only in IndexedDB; the localStorage fallback can lose it, and repeated corrupt boots pile up pinned records

**File:** `js/safety.js:258-286` (`_lhBackupToLocal`), `js/songs.js:140-150` (`_keepCorruptSongs`)
**Issue:**
- **No-IndexedDB fallback.** The corrupt original is stored in `lh:backup:ls2` whenever the pinned slot already holds `pre-schema-2`, which is the normal case. The next delete or import backup overwrites it. The comment and the settings hint promise "一直留著", but that holds only for `pre-schema-*`.
- **Repeated corrupt boots.** If the overwriting flush keeps failing, for example on a full quota, every boot adds a new pinned `corrupt-songs-<timestamp>` record containing the full snapshot, and pinned records are never evicted.
**Fix:**
- Make the pinned-slot comment and the hint say what really happens, or give the no-IndexedDB case a third slot.
- Reuse one fixed id (`corrupt-songs-latest`). Backups are never rewritten, so rewrite that one only when the raw text differs.

### IN-09: `lhRestoreFromBackup` swallows a failed `lh:schema` write and still reports success

**File:** `js/safety.js:471-477`
**Issue:** If `localStorage.setItem('lh:schema', …)` throws after a successful data restore, it only logs a warning and returns `true`. `restoreAutoBackup` then reloads with a schema that does not match the restored data. This is the same pitfall the function comment describes: restoring an old backup leaves the schema at 2, no migration runs, and the page boots blank. With `lhRollback` available it can now be treated as a failure.
**Fix:** `return ok && schemaWritten;` so the caller rolls back instead of reloading.

### IN-10: Backups that fell back to localStorage while IndexedDB is healthy do not appear in the 自動備份 list

**File:** `js/safety.js:340-355` (`lhListBackups`), `js/song-io.js:430-450` (`renderAutoBackups`)
**Issue:** When one IndexedDB write fails, `lhBackup` returns `ok:true, where:'ls'`, and the delete dialog proceeds. `lhListBackups` returns only the IndexedDB records when IndexedDB opens, so that backup is not listed. The 「可從自動備份還原」 promise is then false for exactly that delete. `lhRestoreFromBackup` can find it by id, but there is no way to ask for it in the UI.
**Fix:** Merge `_lhLocalBackups()` into the IndexedDB result, de-duplicated by id, before sorting.

---

_Reviewed: 2026-10-11_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
