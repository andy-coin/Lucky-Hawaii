---
phase: 01-safety-net
plan: 05
subsystem: backup-and-indexeddb
tags: [indexeddb, backup, baseline, snapshot, toast, banner, fallback]

requires:
  - phase: 01-03
    provides: "js/safety.js registry (LH_KEYS, prefixes, meta keys, exclusions), lhGet/lhSet, lhSaveFailed banner, bootPage"
  - phase: 01-04
    provides: "lhWarn records on every catch, catch scan rule in npm test"
provides:
  - "js/safety.js lhIdbOpen(): the single shared IndexedDB opener (DB haoYunQi v2, stores wl and backups, 5 s timeout, onblocked record, onversionchange close)"
  - "js/safety.js lhSnapshot(), _lhBootSnapshot (registry-only raw strings captured synchronously at script load)"
  - "js/safety.js lhBackup(id, label, snap) -> { ok, where: 'idb'|'ls'|null, existed }, lhListBackups(), _lhBackupToLocal(record), lhBootSafety(), window.__hoyunSafetyReady"
  - "Backup record shape { id, seq, label, createdAt, appVersion, schema, data }, keep newest 3 by seq, never overwrite an existing id"
  - "LH_BANNER_TEXT.backup, LH_APP_VERSION='0.96', LH_BACKUP_KEEP=3; localStorage meta keys lh:schema ('1' after first backup) and lh:backup:ls (single-copy fallback)"
  - "index.html: _idbOpen delegates to lhIdbOpen; _idbPut settles once on complete/error/abort/sync throw; _wlCacheWriteFailed shows a one-time toast"
affects: [01-06, phase-08-restore-ui]

actuals:
  tokens: 6200   # chars/4 over git diff dd544fa..HEAD (24,743 chars incl. context lines)
  tasks: 3
  commits: 6
plan_head_before: dd544fa06e774b89acd124ea3962730f6f677130
plan_head_after: 0f5cbd1f210fea30df502f352c46e60ac7f819ed

tech-stack:
  added: []
  patterns:
    - "One shared IndexedDB opener in safety.js; index.html never opens the database itself"
    - "Synchronous load-time snapshot, async write afterwards from the in-memory object"
    - "Rotation and ordering by insertion seq, never by createdAt (same-millisecond ties)"
    - "Fault injection by wrapping IDBObjectStore.prototype.put and Storage.prototype.setItem in init scripts"

key-files:
  created: []
  modified:
    - js/safety.js
    - index.html
    - tests/storage.spec.mjs
    - tests/save-failure.spec.mjs

key-decisions:
  - "lhIdbOpen rejections are logged once inside the opener (tag IndexedDB 開啟失敗) because the catch scan rule treats a silent promise .catch as a swallowed error; callers still log their own context tag"
  - "safety.js script tag bumped from ?v=0.96.1 to ?v=0.96.2 (RESEARCH Pitfall 9: avoid a cached old safety.js paired with the new index.html)"
  - "_idbGet left unchanged as the plan says; if a tab is told to close its connection (versionchange) mid-load, a later _idbGet would throw outside the chunk try. Rare; noted below"

requirements-completed: [PERF-04]

coverage:
  - id: D1
    description: "IndexedDB upgrades v1 to v2 keeping the wl store and rows, and adds the backups store"
    requirement: FND-03
    verification:
      - kind: e2e
        ref: "tests/storage.spec.mjs#IndexedDB: v1 升級 v2 保留詞庫快取"
        status: pass
    human_judgment: false
  - id: D2
    description: "A stale tab holding v1 cannot hang the app: boot finishes after the 5 s wait, wordlist loads from the network, search works, a [好韻器] blocked record is left"
    requirement: FND-03
    verification:
      - kind: e2e
        ref: "tests/storage.spec.mjs#IndexedDB: 舊分頁擋住升級時仍能開啟並查韻"
        status: pass
    human_judgment: false
  - id: D3
    description: "Wordlist-cache write failure shows only the one-time toast plus a [好韻器] record, never the sticky banner"
    requirement: PERF-04
    verification:
      - kind: e2e
        ref: "tests/save-failure.spec.mjs#IndexedDB: 詞庫快取寫入失敗只跳提示、不出存檔失敗橫幅"
        status: pass
    human_judgment: false
  - id: D4
    description: "Baseline backup holds exactly the registered keys byte-for-byte (no admin keys, no other project keys, no lh: keys), is never overwritten, lh:schema set only after a backup"
    requirement: FND-03
    verification:
      - kind: e2e
        ref: "tests/storage.spec.mjs#backup: 第一次開啟建立基準備份，只含清單內的鍵 / 舊版資料開啟後每個鍵值完全不變 / 基準備份之後不會被覆寫"
        status: pass
    human_judgment: false
  - id: D5
    description: "Same-millisecond backups get distinct seq and never overwrite; only the newest 3 remain; an existing id is left alone"
    requirement: FND-03
    verification:
      - kind: e2e
        ref: "tests/storage.spec.mjs#backup: 同一毫秒建立的備份不互相覆蓋，只保留最新 3 份"
        status: pass
    human_judgment: false
  - id: D6
    description: "Fresh browser boots with zero errors, empty baseline, lh:schema '1'"
    requirement: FND-03
    verification:
      - kind: e2e
        ref: "tests/storage.spec.mjs#backup: 全新瀏覽器開啟沒有錯誤並設定資料版本"
        status: pass
    human_judgment: false
  - id: D7
    description: "Backup failure is visible: IndexedDB write failure shows the backup banner and writes lh:backup:ls; IndexedDB unavailable falls back silently with a record; both failing shows the banner and leaves lh:schema unset"
    requirement: PERF-04
    verification:
      - kind: e2e
        ref: "tests/save-failure.spec.mjs#IndexedDB: 備份寫入失敗時出現橫幅… / 備份兩處都存不進去時出現橫幅…; tests/storage.spec.mjs#backup: IndexedDB 無法使用時改存 localStorage 單份並留記錄"
        status: pass
    human_judgment: false
  - id: D8
    description: "Two tabs opening the new version at the same instant both end with an intact baseline and lose no data (backstop truth)"
    requirement: FND-03
    verification: []
    human_judgment: true
    rationale: "Declared backstop in the plan; not asserted by an automated test. Design reasons: the existing-id check and the put happen in one readwrite transaction, which IndexedDB serializes across tabs, and the snapshot only reads localStorage."

duration: 8min
completed: 2026-10-03
status: complete
---

# Phase 1 Plan 05: Backup and IndexedDB v2 Summary

**First open now stores a baseline backup of exactly the registered localStorage keys (captured synchronously before the app touches anything) in a new IndexedDB `backups` store, newest 3 kept by insertion order, with a localStorage single-copy fallback; the wordlist cache and backups share one v2 opener that cannot hang on a stale tab; cache write failures show one gentle toast, backup failures show the sticky banner. `npm test`: 82 passed.**

## For Andy: one-way IndexedDB change

The `haoYunQi` database goes from version 1 to version 2 for every visitor once this ships. A version cannot be lowered without deleting the database. What that means in practice:

- Existing users keep their wordlist cache (the upgrade never recreates `wl`; a test proves a sentinel row survives).
- An older cached copy of `index.html` that still asks for version 1 will fail to open the database, and degrades to "no cache, load the wordlist from the network" (slower start, everything else works).
- A tab still open on the old version can block the upgrade; the new tab waits 5 seconds, logs `[好韻器] IndexedDB 升級被其他分頁擋住，請關閉舊的好韻器分頁`, then loads from the network and keeps the backup in localStorage instead. The stale-tab test takes about 6 s because of that wait.

The orchestrator rated this one-way with no checkpoint; the safety measures are in place (guarded store creation, 5 s open timeout, versionchange close).

## Performance

- **Duration:** about 8 min (start 11:15Z, end 11:23Z)
- **Tasks:** 3 (6 commits)
- **Files:** 4 modified, 0 created (415 insertions, 13 deletions)

## Accomplishments

- `lhIdbOpen()` in js/safety.js is the only opener. `_idbOpen` in index.html is now `return lhIdbOpen();`.
- `_idbPut` settles exactly once (complete, error, abort, or a synchronous throw) and on failure calls `_wlCacheWriteFailed`: a `[好韻器] 詞庫快取寫入失敗` record every time, the toast 詞庫快取沒存成功，下次開啟會比較慢，不影響使用 only the first time per page session, never the banner.
- `lhSnapshot()` iterates registry keys and registered prefixes only; `_lhBootSnapshot` runs at script load. `lhBackup` does read, existing-id check, put and keep-3 delete in one readwrite transaction.
- Failure ladder: IndexedDB write fails -> banner plus `lh:backup:ls`; IndexedDB unavailable, blocked or timed out -> `lh:backup:ls` plus `[好韻器] IndexedDB 不可用…` record, no banner; fallback write also fails -> banner and `lh:schema` stays unset.
- `lhListBackups()` returns IndexedDB records by seq, or the single localStorage record when IndexedDB cannot be read.
- 9 new tests: storage.spec 2 `IndexedDB:` + 6 `backup:`, save-failure.spec 3 `IndexedDB:`.

## Task Commits

1. **Task 1: shared v2 opener, settle-once cache writer, toast** - `24ced6b` feat(01-05); tests `6599ec0` test(01-05)
2. **Task 2: baseline backup, keep-3, seq ordering** - `fbf003e` feat(01-05); tests `8e8765d` test(01-05)
3. **Task 3: backup failure banner and localStorage fallback** - `6694669` feat(01-05); tests `0f5cbd1` test(01-05)

**Plan metadata:** skipped (.planning gitignored, commit_docs=false). Branch gsd/v0.96-stabilize. Nothing pushed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Silent promise catch and empty catch tripped the Plan 04 scan rule**
- **Found during:** Task 2 (full `npm test`)
- **Issue:** `p.catch(() => { ... })` in `lhIdbOpen` and `catch (_) { /* 已結束 */ }` around `tx.abort()` contain no function call, so `tests/scan.spec.mjs` reported `js/safety.js:197` and `:254` as swallowed catches.
- **Fix:** the opener's `.catch(e => ...)` now also calls `lhWarn('IndexedDB 開啟失敗', e)`; the abort catch calls `lhWarn('備份交易中止失敗', e2)`.
- **Files modified:** js/safety.js
- **Commit:** `fbf003e`

**2. [Rule 2 - Missing critical] Bumped the safety.js cache-busting version**
- **Found during:** Task 3
- **Issue:** RESEARCH Pitfall 9: GitHub Pages caches for about 10 minutes, so an old cached safety.js paired with the new index.html (or the reverse) can leave functions undefined. The plan did not mention bumping `?v=`.
- **Fix:** `js/safety.js?v=0.96.1` -> `?v=0.96.2` in index.html.
- **Commit:** `6694669`

**Total deviations:** 2 auto-fixed (1 bug, 1 missing-critical). **Impact:** none on scope; both are small.

## Verification

- `npx playwright test tests/storage.spec.mjs tests/save-failure.spec.mjs -g "IndexedDB"`: 5 passed (3 in save-failure). `-g "backup"` on storage.spec: 6 passed.
- `npm test`: 82 passed (golden unchanged, smoke, scan including the catch rule, error-visibility).
- Acceptance greps: `indexedDB.open('haoYunQi', 2)` in safety.js 1, `indexedDB.open('haoYunQi', 1)` in index.html 0, `objectStoreNames.contains('wl')` 1, `contains('backups')` 1, `return lhIdbOpen()` 1, `onabort|'abort'` in index.html 1, `window.__hoyunSafetyReady = lhBootSafety()` 1, `LH_BACKUP_KEEP = 3` 1, `lhSaveFailed('backup')` 2, 資料備份沒有存成功 1.
- Teeth (each restored, nothing committed): `_wlCacheWriteFailed` calling `lhSaveFailed('save')` made the cache-failure test fail (timed out waiting for the toast); snapshotting every key made the baseline test fail; rotating by createdAt made the same-millisecond test fail; removing `lhSaveFailed('backup')` from the put-failure branch made the backup-write test fail (banner not visible).

## Findings for later phases (not fixed here)

- `_idbGet` can throw synchronously (inside its Promise executor, so it rejects) if the shared connection was closed by `onversionchange` mid-load; the first call (`cachedVer`) is outside a try. Only reachable when another tab upgrades the database during this tab's wordlist load (future v3). Plan 06 or a later phase may want a try there.
- A late backup retry does not exist: if the opener times out (stale tab), that boot's backup goes to `lh:backup:ls`; the next boot with the stale tab closed writes `baseline` to IndexedDB (it does not exist there yet) while `lh:backup:ls` keeps the older copy. Both hold the same baseline data. Plan 06's restore should prefer the IndexedDB record and treat `lh:backup:ls` as a backup of last resort.
- Two-tab simultaneous first open (plan backstop) is not automatically tested.

## Issues Encountered

None.

## Known Stubs

None.

## Threat Flags

None new. T-01-16 (registry-only snapshot; admin keys and other project's key asserted absent), T-01-17 (5 s timeout, blocked record, versionchange close; stale-tab test), T-01-18 (existing id never overwritten, seq rotation), T-01-19 and T-01-20 accepted as planned, T-01-SC (no packages added).

## Next Phase Readiness

- Plan 06 can build the migration runner on `lhBackup('pre-schema-N', ...)`, `lhListBackups()`, `lh:schema` and `window.__hoyunSafetyReady`. Boot stays synchronous apart from the background backup; no old key is deleted or rewritten.

## Self-Check: PASSED

- Files exist: js/safety.js, index.html, tests/storage.spec.mjs, tests/save-failure.spec.mjs (verified).
- Commits on gsd/v0.96-stabilize: 24ced6b, 6599ec0, fbf003e, 8e8765d, 6694669, 0f5cbd1 (`git rev-list --count dd544fa..HEAD` = 6).
- `npm test` 82 passed; working tree has only the untracked `.claude/CLAUDE.md` and `.gsd/` (intentionally not staged).
