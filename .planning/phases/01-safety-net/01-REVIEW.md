---
phase: 01-safety-net
reviewed: 2026-10-03T00:00:00Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - index.html
  - js/safety.js
  - package.json
  - playwright.config.mjs
  - tests/serve.mjs
  - tests/helpers.mjs
  - tests/scan-lib.mjs
  - tests/golden.spec.mjs
  - tests/smoke.spec.mjs
  - tests/scan.spec.mjs
  - tests/save-failure.spec.mjs
  - tests/storage.spec.mjs
  - tests/error-visibility.spec.mjs
findings:
  critical: 1
  warning: 5
  info: 6
  total: 12
status: issues_found
---

# Phase 1: Code Review Report

**Reviewed:** 2026-10-03
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

I reviewed the phase-01 diff of `index.html` (`7296c5e..HEAD`), all of `js/safety.js`, and the test infrastructure and specs. I also ran the four storage-related specs (`storage`, `save-failure`, `error-visibility`, `scan`). All 44 passed in 9.4s, so the problems below are gaps the suite does not cover, not failures it reports.

The banner and toast paths are XSS-safe. They use `textContent` and static strings, and the console logs record only key names. The IndexedDB v1 to v2 upgrade correctly checks `objectStoreNames.contains` before creating stores. The test server's path-traversal check (`relative()` plus `isAbsolute`) is sound.

The main weakness is that the phase promises "corrupt data does not take the page down" and "original content is preserved". Both hold only for the narrow case of unparseable JSON. Valid JSON with the wrong shape still kills the app. The raw corrupt value is destroyed on the first save. Restore and migrate have non-atomic and stale-snapshot hazards that are dormant today (the migration list is empty) but will become live in Phase 8.

## Critical Issues

### CR-01: Valid-JSON-but-wrong-shape storage values still crash app init (verified)

**File:** `index.html:3298-3300` (consumers at `index.html:5438` and the `savedWords` render)
**Issue:** `lhGetJSON` only guards against `JSON.parse` failures. A value that parses but is not the expected type is returned as-is. I reproduced this against the real page:

| Stored value | Result |
|---|---|
| `haiku_lyrics = 'null'` | `pageerror: Cannot read properties of null (reading 'every')` |
| `haiku_lyrics = '{}'` | `pageerror: lyricsSections.every is not a function` |
| `haiku_savedwords = '5'` | `pageerror: savedWords.map is not a function` |

The init IIFE aborts, so the rest of the startup (panels, colors, render) does not run. The user cannot recover without clearing site data, which destroys the very data the phase set out to protect. This is the same "corruption does not take the whole page down" requirement, reached through a different corruption shape. Partial writes, other tools, and hand edits can all produce these values. `LH_CORRUPT_KEYS` is never set for them, so the `haiku_lyrics` guard at line 5438 does not protect them either.
**Fix:** Add an optional validator to `lhGetJSON` so that a wrong shape is treated exactly like a parse failure (recorded in `LH_CORRUPT_KEYS`, fallback returned):
```js
function lhGetJSON(key, fallback, validate) {
    const raw = lhGet(key);
    if (raw === null || raw === '') return fallback;
    try {
        const v = JSON.parse(raw);
        if (validate && !validate(v)) throw new TypeError('資料形狀不符');
        return v;
    } catch (e) {
        LH_CORRUPT_KEYS.add(key);
        lhWarn(key + ' 內容損毀，已改用預設值（原始內容保留不動）', e);
        return fallback;
    }
}
// index.html
let hashtags = lhGetJSON('haiku_hashtags', [], Array.isArray);
let lyricsSections = lhGetJSON('haiku_lyrics', [{ label: '', text: '' }],
    v => Array.isArray(v) && v.length > 0 && v.every(s => s && typeof s === 'object'));
let savedWords = lhGetJSON('haiku_savedwords', [], Array.isArray);
```
Also add a storage spec for `'null'`, `'{}'` and `'5'`.

## Warnings

**Resolution:** fixed in 7338d15（lhGetJSON 加 validate；形狀不對視同損毀；storage.spec 新增 5 個形狀測試；safety.js 快取參數 ?v=0.96.3）

### WR-01: "Original content preserved" is false after the first save, and `dictOverrides_v076` is not tracked at all

**File:** `js/safety.js:61-71`, `index.html:2730-2739`, `index.html:3299`
**Issue:** After `lhGetJSON` returns the fallback for a corrupt `haiku_lyrics`, the next keystroke runs `saveLyrics`, which `lhSet`s over the corrupt raw string. The only remaining copy is the `baseline` backup. That backup is taken once, on the first boot, and is never refreshed, because the id `baseline` already exists. If the corruption happens after the baseline was captured, the corrupt value is lost and the baseline holds stale data. `loadDictOverrides` (`index.html:2730`) has its own `JSON.parse` in a `try`. It never adds `dictOverrides_v076` to `LH_CORRUPT_KEYS` and sets `dictOverrides = {}`, so the next `saveDictOverrides` silently replaces the raw value. The corrupt-boot test only asserts the value is unchanged before any write happens.
**Fix:** In `lhGetJSON`'s catch, stash the raw string once under a registered meta key before returning the fallback. For example, store `lh:corrupt:<key>` with a timestamp only if it does not already exist, and add the `lh:corrupt:` prefix to `LH_META_KEYS` handling so it is not snapshotted or restored. Route `loadDictOverrides` through `lhGetJSON` so it gets the same treatment. Add a test that types into the lyrics after a corrupt boot and asserts the raw value is still recoverable.

**Resolution:** fixed in ca5d752（損毀原始內容另存 `lh:corrupt:<key>`，未登記成已知鍵故不進快照、不被還原動到；loadDictOverrides 改走 lhGetJSON）

### WR-02: `lhRestore` is not atomic, and `lhMigrate` ignores its result while telling the user everything was restored

**File:** `js/safety.js:315-337`, `js/safety.js:376-382`
**Issue:** `lhRestore` first removes every registered key that is missing from the snapshot, then writes the snapshot values. If a `setItem` throws midway (quota, storage disabled), the removals have already happened and the remaining keys are never written. The result is a half-restored store, and the function returns `false`. `lhMigrate`'s catch calls `lhRestore(snap)` without checking the return value. It then unconditionally raises the `migrate-failed` banner, whose text says "已自動還原成升級前的內容，歌詞與設定都在", and returns `{ restored: true }`. The `lh:schema` rollback below it can also fail silently. The user is told their data is safe when it may not be.
**Fix:** Write first and remove afterward, so a failure leaves extra keys rather than missing ones. Make `lhMigrate` report the truth:
```js
const restored = lhRestore(snap);
if (prevSchema === null) lhRemove('lh:schema'); else lhSet('lh:schema', prevSchema);
lhSaveFailed(restored ? 'migrate-failed' : 'save');   // add a 'restore-failed' text that points to the backup
return { ran: 0, restored };
```
Also keep the removals out of the `lhRestore` path used for a user-initiated "restore backup", or make that path opt in.

**Resolution:** fixed in f4d5ff0（lhRestore 先寫後刪；lhMigrate 還原失敗改跳新增的 restore-failed 橫幅並回傳 restored:false；lh:schema 還原失敗也算失敗）。「使用者手動還原也不要刪鍵」未另做：先寫後刪已不會造成半套狀態，完整還原本來就該清掉備份沒有的鍵。

### WR-03: Migration snapshot goes stale across an `await`, and the app does not wait for the safety layer

**File:** `js/safety.js:354-383`, `index.html:3298-3300`
**Issue:** `lhMigrate` takes `snap = lhSnapshot()` and then `await`s `lhBackup`. That await can take up to 5s, the `LH_IDB_TIMEOUT_MS` when an old tab is blocking. The main script is not gated on `__hoyunSafetyReady`. It has already read storage synchronously and the UI is live, so edits made during that window are written to localStorage. If a step then throws, `lhRestore(snap)` rolls storage back to the pre-await snapshot and silently discards those edits. Even on success, the app's in-memory `lyricsSections` was loaded in the pre-migration format and its next `lhSet` would overwrite migrated data with old-format data. This is dormant today because `LH_MIGRATIONS` is empty, but the first real migration in Phase 8 will hit it. The comment that says to await `__hoyunSafetyReady` before the first read is not enforced by anything.
**Fix:** Take a fresh `lhSnapshot()` after the backup await and immediately before running steps, and use it for rollback. Keep the earlier snapshot only for the backup record. For Phase 8, gate the app's first storage read on `await window.__hoyunSafetyReady`, or have migrations run before the main script reads anything. Add a test that edits storage during a slow backup.

**Resolution:** partially fixed in fb4a024（還原用快照改在備份 await 之後才拍，附測試）。Deferred：主程式啟動前先 await `__hoyunSafetyReady`、以及記憶體內資料仍是舊格式的問題，要等 Phase 8 第一個真遷移上線時一併處理（目前 LH_MIGRATIONS 為空，不會觸發）；已在 lhMigrate 留 ponytail 註解。

### WR-04: The localStorage backup fallback duplicates the whole dataset in the 5MB quota

**File:** `js/safety.js:235-242`
**Issue:** When IndexedDB is unavailable (private mode, blocked, timed out), `_lhBackupToLocal` writes a full copy of the snapshot into `lh:backup:ls`. That includes `dictOverrides_v076`, all lyrics and the API keys, which roughly doubles localStorage usage. The backup, intended as a safety net, can push the origin over quota. Subsequent `lhSet` calls for the user's own lyrics then fail and raise the save-failure banner. The backup writes also happen on first boot, before the user has done anything.
**Fix:** Skip the fallback when the snapshot is large, or compare `JSON.stringify(record).length` against a budget (for example 1MB) and show the `backup` banner instead of writing. At minimum, exclude `apiKey_*` from the localStorage copy, since it is a second plaintext copy of the secrets.

**Resolution:** fixed in 6904915（localStorage 備援排除 apiKey_*，上限 500000 字元，超過視為備份失敗並跳備份橫幅；lhRestoreFromBackup 對無金鑰的備援還原時補回目前金鑰，避免被刪）

### WR-05: A failed feedback submit loses the text the user typed

**File:** `index.html:6261-6267`, `index.html:6249-6254`
**Issue:** `submitFeedback` closes the modal before sending. On failure it shows "回報沒有送出，請檢查網路後再試一次". `openFeedbackModal` clears both fields every time it opens, so the user must retype the whole report to retry. The toast invites a retry that cannot reuse their input.
**Fix:** Keep the modal open until `postFeedback` resolves true, or restore the values on failure:
```js
const ok = await postFeedback({ type: 'feedback', subject, body });
if (ok) { overlay.classList.remove('show'); showToast('感謝你的回饋！'); }
```

## Info

**Resolution:** fixed in c81e68a（成功才關視窗，失敗保留視窗與文字，送出中停用按鈕）

### IN-01: Fire-and-forget `postFeedback` callers now show a success toast, then a failure toast

**File:** `index.html:4458-4461`, `index.html:6078-6095` (and the other `postFeedback(...)` call sites)
**Issue:** `reportMissingChar`, `wordCtxReport`, `aiWordSuggest` and others call `postFeedback` without awaiting it, then immediately `showToast('已回報…')`. When the post fails, the new failure toast replaces the success one a moment later. This is confusing, and the success toast is untrue.
**Fix:** `await` the result and show the success toast only when it is true, or drop the failure toast for these automatic reports.

**Resolution:** skipped（需改 7 個呼叫點，不是一行修正；留待之後處理）

### IN-02: `tests/serve.mjs` hardening nits

**File:** `tests/serve.mjs:17-32`
**Issue:** The traversal check itself is correct, because `URL` normalization and the `relative()` check cover `..`, `%2e%2e` and malformed escapes. Remaining nits:
1. `rel.startsWith('..')` also rejects legitimate names such as `..foo`.
2. The server serves the whole repo root, including `.git/`, `.claude/` and `.planning/`, and does not check the `Host` header. A DNS-rebinding page opened in the developer's browser could read those files while the tests run.
3. Unknown extensions such as `.svg` and `.webmanifest` fall back to `application/octet-stream`.
**Fix:** Use `rel === '..' || rel.startsWith('..' + sep)`. Serve only an allowlist of top-level paths (`index.html`, `js/`, `data/`, `manifest.json`, icons). Reject requests whose `Host` is not `127.0.0.1:<PORT>`.

### IN-03: `scan-lib` has easy bypasses for its "no direct localStorage" and key-registry rules

**File:** `tests/scan-lib.mjs:79-90`, `tests/scan-lib.mjs:111-119`
**Issue:**
- `isLocalStorageRef` matches only `localStorage` and `window.localStorage`. It misses `const s = localStorage`, `window['localStorage']`, `globalThis.localStorage` and `sessionStorage`.
- A template literal with no expressions (`` lhGet(`haiku_lyrics`) ``) is classified as a `prefix`. It would be reported as an unregistered prefix, a false positive.
- The `reports()` heuristic accepts any call as "reporting" (already noted by the author's `ponytail:` comment).

**Fix:** Also flag `Identifier localStorage` used as a bare value (not just as a member-expression object), and treat a template literal with `quasis.length === 1` as a literal.

### IN-04: Version strings and the cache-buster are hand-maintained and can drift

**File:** `js/safety.js:204`, `index.html:2179`
**Issue:** `LH_APP_VERSION = '0.96'` is hardcoded in `safety.js`. The script tag carries `?v=0.96.2`, bumped by hand. If `safety.js` changes and the query is not bumped, GitHub Pages caches serve the old script to returning users. That same old script is what reads and restores their data.
**Fix:** Bump the query on every `safety.js` change, or derive both values from one source. Consider a test that fails when `LH_APP_VERSION` and the script query disagree.

### IN-05: Backup retention can evict the backup the migration depends on

**File:** `js/safety.js:262-271`, `js/safety.js:359`
**Issue:** `baseline` is only ever created once, and a fixed `id` means a repeated `pre-schema-N` is never refreshed. With `LH_BACKUP_KEEP = 3`, `baseline` is the oldest and is the first to be evicted. On the next boot `baseline` no longer exists, so a new "baseline" is written from current, possibly already-migrated data, with a label that says "第一次開啟時". After a failed migration that is retried later, `pre-schema-N` still holds the data from the first attempt. A manual restore from it silently drops later edits.
**Fix:** Protect `baseline` and the latest `pre-schema-*` from the eviction pass, or keep them in a separate keyed set. Re-create `pre-schema-N` with a timestamped id on each attempt.

### IN-06: Test reliability nits

**File:** `tests/error-visibility.spec.mjs:13-16`, `tests/smoke.spec.mjs:141`, `tests/smoke.spec.mjs:179`
**Issue:**
- `expectQuiet` discards every error containing "Failed to load resource". A genuine missing script or data file, the very kind of regression these tests exist to catch, would be masked in all seven background-error tests.
- The smoke test relies on a fixed `waitForTimeout(200)` before collecting errors. A handler error that surfaces later produces a false green rather than a flake.
- The 5s IndexedDB timeout adds a fixed 5s wait to the old-tab-blocking test and to real first loads for any user with a stale tab open (the wordlist waits for `lhIdbOpen`), though the test's 30s budget is adequate.

**Fix:** Filter only the specific URLs the test intentionally breaks. Replace the fixed sleep with a `settle` plus a bounded `expect.poll`.

---

_Reviewed: 2026-10-03_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
