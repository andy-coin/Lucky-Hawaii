---
phase: 01-safety-net
plan: 06
subsystem: data-migration-and-restore
tags: [migration, schema, restore, backup, validation, phase-gate]

requires:
  - phase: 01-05
    provides: "lhBackup / lhListBackups / lhSnapshot, baseline backup, lh:schema, LH_BANNER_TEXT, window.__hoyunSafetyReady"
provides:
  - "js/safety.js LH_SCHEMA_TARGET = 1, LH_MIGRATIONS = [] (step contract { to, run(store) })"
  - "js/safety.js lhMigrate(steps, target) -> { ran, blocked?, restored? }, backup id pre-schema-N"
  - "js/safety.js lhRestore(snap) -> boolean (validated), lhRestoreFromBackup(id) -> Promise<boolean>"
  - "LH_BANNER_TEXT['migrate-failed']"
  - "lhBootSafety runs lhMigrate(LH_MIGRATIONS, LH_SCHEMA_TARGET) after the baseline backup"
affects: [phase-08-multi-song, phase-08-restore-ui]

actuals:
  tokens: 3500   # chars/4 over git diff 0f5cbd1..HEAD (14,106 chars incl. context lines)
  tasks: 2
  commits: 3
plan_head_before: 0f5cbd1f210fea30df502f352c46e60ac7f819ed
plan_head_after: 2615dc7bf45b6dab585112199c49c076b6221d66

tech-stack:
  added: []
  patterns:
    - "Backup-first migration: the pre-schema-N backup must succeed before any step runs"
    - "Flip lh:schema after each completed step; any exception restores the in-memory pre-migration snapshot"
    - "Restore validates every entry: registered, non-meta, string values only; warnings name the key, never the value"

key-files:
  created: []
  modified:
    - js/safety.js
    - tests/storage.spec.mjs

key-decisions:
  - "On migration failure lh:schema is restored to its exact previous raw value (removed if it was absent) rather than forced to String(cur); identical in every tested case, more faithful when the flag was missing"
  - "lhRestoreFromBackup looks in the IndexedDB records first and only then at the lh:backup:ls copy (per 01-05 finding)"
  - "No ?v= bump on the safety.js script tag: index.html does not call anything new, so an old cached safety.js paired with the new index.html (or the reverse) breaks nothing"

requirements-completed: [FND-03]

coverage:
  - id: D1
    description: "Backup first: with no backup storable, no migration step runs, data untouched, backup banner shown"
    requirement: FND-03
    verification:
      - kind: e2e
        ref: "tests/storage.spec.mjs#migrate: 備份存不進去時不執行遷移"
        status: pass
    human_judgment: false
  - id: D2
    description: "Steps run in ascending order, each at most once; second call changes nothing"
    requirement: FND-03
    verification:
      - kind: e2e
        ref: "tests/storage.spec.mjs#migrate: 依版本順序執行、每步最多一次"
        status: pass
    human_judgment: false
  - id: D3
    description: "Three runs give deep-equal localStorage and exactly one pre-schema-2 backup"
    requirement: FND-03
    verification:
      - kind: e2e
        ref: "tests/storage.spec.mjs#migrate: 重跑三次結果相同、不多存備份"
        status: pass
    human_judgment: false
  - id: D4
    description: "A step failing midway (after an earlier step already advanced lh:schema) restores every registered key and lh:schema exactly and shows the banner"
    requirement: FND-03
    verification:
      - kind: e2e
        ref: "tests/storage.spec.mjs#migrate: 中途失敗自動還原成升級前"
        status: pass
    human_judgment: false
  - id: D5
    description: "A step cannot write an unregistered key; attempt aborts and restores"
    requirement: FND-03
    verification:
      - kind: e2e
        ref: "tests/storage.spec.mjs#migrate: 遷移步驟不可寫入未登記的鍵"
        status: pass
    human_judgment: false
  - id: D6
    description: "lhRestore writes only registered non-meta string values, ignores tampered entries without leaking values, and refuses non-object input"
    requirement: FND-03
    verification:
      - kind: e2e
        ref: "tests/storage.spec.mjs#restore: 只還原清單內的鍵與字串值 / 不是物件的備份內容不會動到任何資料"
        status: pass
    human_judgment: false
  - id: D7
    description: "Success criterion 5: v0.96 snapshot intact after boot, baseline holds every key, full wipe restored byte-for-byte via lhRestoreFromBackup('baseline'), page works after reload"
    requirement: FND-03
    verification:
      - kind: e2e
        ref: "tests/storage.spec.mjs#restore: v0.96 舊資料完整備份並可完整還原"
        status: pass
    human_judgment: false
  - id: D8
    description: "Corrupt stored JSON is preserved byte-for-byte in the baseline backup"
    requirement: FND-03
    verification:
      - kind: e2e
        ref: "tests/storage.spec.mjs#corrupt: 損毀的原始內容完整保存在基準備份"
        status: pass
    human_judgment: false
  - id: D9
    description: "Two tabs running the same migration at the same moment lose no data and end at the same schema version (declared backstop)"
    requirement: FND-03
    verification: []
    human_judgment: true
    rationale: "Backstop in the plan, not asserted by a test. Design reasons: pre-schema-N is written in one IndexedDB readwrite transaction (serialized across tabs, never overwritten), steps are idempotent, and schema flips only after each step. With the production step list empty this cannot happen in this release; Phase 8 adds the first real step."

duration: 14min
completed: 2026-10-03
status: complete
---

# Phase 1 Plan 06: Migration Runner and Phase Gate Summary

**Schema-versioned migration runner (baseline schema 1, empty step list): pre-schema-N backup must succeed first, steps run in ascending order at most once, any failure restores the exact pre-migration snapshot and lh:schema with a plain-language banner; restore helpers accept only registered string values. Old-version snapshot round trip and corrupt-value preservation proven; `npm test` 91 passed twice. Phase 1 is complete.**

## Performance

- **Duration:** about 14 min
- **Tasks:** 2 (3 commits: 1 feat, 2 test)
- **Files:** 2 modified (252 insertions, 3 deletions)
- **npm test run times:** run 1 = 91 passed in 1.1 min (wall 1:04.6); run 2 = 91 passed in 1.1 min (wall 1:05.6). Zero retries configured, zero flakes.

## Accomplishments

- `lhMigrate(steps, target)` in js/safety.js: reads `lh:schema` (missing means 1), returns `{ ran: 0 }` when already at target; otherwise snapshots, awaits `lhBackup('pre-schema-' + target, ...)` and returns `{ ran: 0, blocked: true }` if that fails (the backup banner is raised by `lhBackup`). Steps get a `store` whose `set`/`remove` throw for any key that is not registered and non-meta, and write straight to the storage object so a quota error also aborts the migration.
- Failure path: `lhRestore(snap)`, then `lh:schema` back to its previous raw value, then the `migrate-failed` banner (資料升級失敗，已自動還原成升級前的內容，歌詞與設定都在。), result `{ ran: 0, restored: true }`.
- `lhRestore(snap)`: not a plain object (null, array, string, number) returns false and touches nothing. Otherwise registered keys absent from the record are removed, then each entry is written only if the key is registered, not a meta key and the value is a string; everything else is skipped with a `[好韻器] 還原時略過不合法的項目：<key>` record (key name only).
- `lhRestoreFromBackup(id)`: IndexedDB record first, then the `lh:backup:ls` copy if the id is only there (01-05 finding), then `lhRestore(record.data)`. No UI (Phase 8, EDIT-09).
- `lhBootSafety` now awaits `lhMigrate(LH_MIGRATIONS, LH_SCHEMA_TARGET)` after the baseline backup. At target 1 with an empty list it does nothing, so boot behaviour is unchanged. Comment added: future format-changing code must `await window.__hoyunSafetyReady` before its first read.
- 9 new tests in tests/storage.spec.mjs (7 `migrate:`/`restore:`, plus the v0.96 round trip and the corrupt preservation test). storage.spec now has 18 tests.

## Task Commits

1. **Task 1: migration runner and restore helpers** - `beed534` feat(01-06); tests `ad94ba6` test(01-06)
2. **Task 2: v0.96 round trip and corrupt preservation** - `2615dc7` test(01-06) (phase gate is verification only, no code)

**Plan metadata:** skipped (.planning gitignored, commit_docs=false). Branch gsd/v0.96-stabilize. Nothing pushed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug in test design] The planned 'migrate: 中途失敗' test could not catch a missing lh:schema reset**
- **Found during:** Task 1 teeth check
- **Issue:** With a single failing step, `lh:schema` is never advanced and `lhSnapshot()` excludes meta keys, so removing the `lh:schema` reset from the failure path left the test green; the plan's own acceptance criterion ("Teeth (schema reset) ... test fails") was not satisfiable.
- **Fix:** the test now uses two steps: `{ to: 2 }` succeeds (schema flips to 2, selectedModel changes), then `{ to: 3 }` corrupts lyrics, removes savedwords, writes `apiKey_newprov`, and throws. After restore the dump must deep-equal the original including `lh:schema = '1'`.
- **Verification:** removing the `lhRestore(snap)` call fails the test; removing the `lh:schema` reset fails the test; both restored with `git checkout -- js/safety.js`.
- **Commit:** `ad94ba6`

**2. [Rule 3 - Stale criterion] Script tag version is `?v=0.96.2`, not `?v=0.96.1`**
- **Found during:** Task 2 acceptance criteria
- **Issue:** 01-05 bumped the tag to 0.96.2, so `grep -c 'js/safety.js?v=0.96.1' index.html` would print 0.
- **Fix:** verified `grep -c 'js/safety.js?v=0.96.2' index.html` prints 1 instead. I did not bump again (see key-decisions). All phase changes ship together in Andy's next deploy (nothing pushed), so one version string covers them.

**3. [Minor refinement] lh:schema restore uses the exact previous raw value**
- Plan text said `lhSet('lh:schema', String(cur))`. If the flag was absent it is now removed instead of set to '1'. No test differs.

**Total deviations:** 3 (1 test-design bug, 1 stale criterion, 1 refinement). **Impact:** none on scope.

## Verification

- `npx playwright test tests/storage.spec.mjs -g "migrate|restore"`: 7 passed. `-g "corrupt|v0.96"`: 3 passed.
- `npm test` twice: 91 passed both runs.
- VALIDATION commands: golden 42 passed; smoke 5 passed; scan `-g catch` 5 passed; scan `-g registry` 4 passed; error-visibility 9 passed; save-failure `-g localStorage` 6 passed; save-failure `-g IndexedDB` 3 passed; storage 18 passed; storage `-g corrupt` 2 passed.
- Acceptance greps: `lhMigrate(LH_MIGRATIONS, LH_SCHEMA_TARGET)` 1; `LH_SCHEMA_TARGET = 1` 1; `LH_MIGRATIONS = []` 1.
- Commit order and no push: golden baseline commit `75016bb` is an ancestor of the commit that added js/safety.js (PASS); no commit after the baseline touched tests/golden (PASS); `origin/main` = `12759f30d51ec3c5f47e0748b6d60d7fd82bf678` (PASS); local `main` = `7296c5e38c2781f45e929e05a8122ae2fdd7fb93` unchanged (PASS); package.json and package-lock.json unchanged (PASS); `git status --porcelain` shows only the intentionally unstaged `.claude/CLAUDE.md` and `.gsd/`.
- Teeth: both described under Deviation 1 (restored, nothing committed).

## For Andy (plain language, answer whenever)

Nothing is deployed and nothing needs a human check; these are for the next time you open the site after a deploy.

1. 打開網站，查韻、歌詞、標籤跟以前一樣嗎？ (是/否)
2. 打開開發者工具 Console，看得到 `[好韻器]` 開頭的記錄（有出錯時才會有）？ (是/否)
3. 第一次開啟後，畫面上沒有出現紅色「資料備份沒有存成功」或「資料升級失敗」的橫幅？ (是/否)
4. 你的歌詞、覆寫字庫、設定（主題顏色、AI 模型）一個都沒少？ (是/否)
5. 如果之後想要「從備份還原」的按鈕，那是第 8 階段才做，現在只有程式內部的還原功能，同意嗎？ (是/否)

## Known Stubs

None. `LH_MIGRATIONS = []` is intentional (baseline schema 1); Phase 8 adds the first real step `{ to: 2 }`.

## Threat Flags

None new. T-01-21 (restore validation, tampered-record test), T-01-22 (backup-first, snapshot restore, unregistered-key guard, tests), T-01-23 (no push; origin/main and main verified), T-01-24 (warnings name keys only; test asserts 'steal' absent), T-01-SC (no packages added).

## Phase 1 Closure Notes

- The `_idbGet` post-versionchange finding from 01-05 is still open; only reachable when a future v3 upgrade happens in another tab mid-load. Candidate for Phase 8 when it bumps the IndexedDB version.
- Two-tab simultaneous migration remains an untested backstop (D9). Production step list is empty in this release.

## Next Phase Readiness

Phase 1 complete, ready for verification (`/gsd-verify-work`) and Phase 2.

## Self-Check: PASSED

- Files exist: js/safety.js, tests/storage.spec.mjs (verified).
- Commits on gsd/v0.96-stabilize: beed534, ad94ba6, 2615dc7 (`git rev-list --count 0f5cbd1..HEAD` = 3).
- `npm test` 91 passed twice; all VALIDATION commands pass.
