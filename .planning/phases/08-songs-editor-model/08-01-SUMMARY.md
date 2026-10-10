---
phase: 08-songs-editor-model
plan: 01
subsystem: storage
tags: [localStorage, schema-migration, safety-layer, playwright]
status: complete
requires:
  - phase: 05-07 (safety layer)
    provides: lhMigrate / lhBackup / lhRestore / lhGetJSON, key registry, banner
provides:
  - "Schema 1->2 migration: v0.96 lyrics become one song 'song-migrated' (我的第一首歌) in lh:songs, byte for byte"
  - "Registry of 21 keys (lh:songs, lh:activeSong, lh:songListOpen added)"
  - "window.__lhMigrated flag for the one-time toast (08-05)"
affects: [08-02, 08-05, 08-08]
actuals:
  tokens: 7821
  tasks: 2
  commits: 2
plan_head_before: 0b8ef718c4648a2cbeeb71f583746cece1dc848a
plan_head_after: 59918cd68d0b7200e4316cb5d15275bcc1bb4dda
commits: 2
tech-stack:
  added: []
  patterns: ["idempotent migration via fixed id + existing-valid-data check", "legacy keys never written by the step"]
key-files:
  created: [tests/songs-migrate.spec.mjs]
  modified: [js/safety.js, index.html, tests/storage.spec.mjs, tests/scan.spec.mjs, tests/save-failure.spec.mjs]
key-decisions:
  - "Fixed song id 'song-migrated' makes the 1->2 step idempotent across reloads, second tabs and crash re-runs"
  - "Corrupt or empty legacy lyrics migrate to one empty section; the raw text stays under lh:corrupt:haiku_lyrics and haiku_lyrics itself is untouched"
  - "?v=0.96.12 is shared by the whole phase (bumped once here, all 27 local tags together)"
requirements-completed: [EDIT-04]
duration: 25 min
completed: 2026-10-11
---

# Phase 8 Plan 01: Songs schema migration (tracer) Summary

First real schema migration (1 to 2) in js/safety.js: a v0.96 profile gets 'baseline' and 'pre-schema-2' backups, then a new-format copy of its lyrics as one song in lh:songs, while haiku_lyrics / haiku_hashtags stay byte-identical.

## Accomplishments

- js/safety.js: 3 new registry keys (21 total), `LH_SCHEMA_TARGET = 2`, `LH_ID_RE`, `_lhLegacySectionsOk`, `lhSongsOk`, `lhSongFromLegacy`, step `to: 2` pushed into `LH_MIGRATIONS`, `window.__lhMigrated` captured in `lhBootSafety`.
- index.html: all 27 local `?v=` tags now 0.96.12 (zero 0.96.11 left).
- tests/songs-migrate.spec.mjs: 9 specs titled 遷移：... covering word-for-word copy, reload x3, crash between the two writes, two tabs, missing/empty lyrics, corrupt lyrics, failed write rollback, blocked backup, `__lhMigrated`.
- Existing specs moved to schema 2 and two backups (see below). Suite: 571 passed / 27 skipped / 0 failed (baseline was 562 passed; +9 new).

## RED evidence

Run of tests/songs-migrate.spec.mjs against unmodified safety.js: 8 failed, 1 passed. Failing: 一字不少, 重開三次只有一首, 中斷後重開, 兩個分頁同時升級, 沒有舊歌詞, 舊歌詞損毀, 寫入失敗會退回, 只有升級的那一頁知道. Passing before implementation (vacuously, because nothing migrates yet): 備份存不下就不升級. After the change all 9 pass.

## Commits

- 98e1f88 feat(08-01): migrate v0.96 lyrics into lh:songs (schema 1 to 2) (js/safety.js, index.html, songs-migrate spec, scan spec)
- 59918cd test(08-01): storage specs on schema 2 with two safety backups (storage.spec, save-failure.spec)

## Existing specs changed and why

- tests/scan.spec.mjs: registry count 18 to 21 (both assertions).
- tests/storage.spec.mjs: backup ids now ['baseline','pre-schema-2'], schema '2'; baseline picked by id in the not-overwritten test; IndexedDB-unavailable slot now holds 'pre-schema-2'; restore-from-localStorage restores 'pre-schema-2'; all hand-written lhMigrate tests first set lh:schema back to '1' (boot now leaves 2); the blocked-backup test uses target 3 ('pre-schema-3') because 'pre-schema-2' already exists from boot and an existing id counts as success; two-tab backup test also asserts exactly one 'song-migrated'; two-tab migrate test sets schema '1' first.
- tests/save-failure.spec.mjs (not listed in the plan, found by `npm test`): the "IndexedDB backup write fails" test expected the localStorage fallback slot to hold 'baseline' and schema '1'; it now holds 'pre-schema-2' and schema '2' (same pre-upgrade data, migration ran). Intent unchanged.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Spec/plan mismatch] Write-failure spec asserts lh:schema '1', not null**
- **Found during:** Task 1 (writing specs)
- **Issue:** The plan text for 遷移：寫入失敗會退回 says lh:schema null, but the truths say "back to its previous value", and boot sets '1' once the baseline backup succeeds, so the previous value is '1'.
- **Fix:** Spec asserts '1' (rollback to the previous value). The blocked-backup spec keeps null (baseline never stored, so schema never set).
- **Files modified:** tests/songs-migrate.spec.mjs
- **Commit:** 98e1f88

**2. [Rule 3 - Blocking] tests/save-failure.spec.mjs also needed the schema-2 update**
- **Found during:** Task 2 (`npm test`)
- **Fix:** see "Existing specs changed" above.
- **Commit:** 59918cd

**Total deviations:** 2 auto-fixed. **Impact:** none on behaviour; spec wording only.

## Autonomous decisions (for Andy's 自主決定 list)

- Fixed id `song-migrated` for the migrated song (idempotency).
- Corrupt legacy lyrics: one empty section, raw text kept under lh:corrupt:haiku_lyrics, haiku_lyrics not modified.
- `?v=0.96.12` shared by the whole phase.

## Known accepted intermediate state

The editor still reads/writes the legacy keys until 08-02 switches it to lh:songs, so edits made in this build are not yet mirrored into lh:songs. Nothing ships between the two plans.

## Known Stubs

None.

## Threat Flags

None. No new network endpoints; new keys are registered and written only through `store.set`.

## Self-Check: PASSED

- js/safety.js, tests/songs-migrate.spec.mjs present; commits 98e1f88 and 59918cd found in `git log`.
- All task acceptance criteria re-run (greps for target 2, 3 keys, 'song-migrated', __lhMigrated, lhSongFromLegacy, 27 tags 0.96.12, 0 tags 0.96.11, 'pre-schema-2' x9 and 'song-migrated' x1 in storage.spec): pass.
- `npx playwright test tests/songs-migrate.spec.mjs tests/scan.spec.mjs tests/split-tags.spec.mjs`: 29 passed. `npm test`: 571 passed, 27 skipped, 0 failed.
