---
phase: 06-lexicon-packs
plan: 02
subsystem: lexicon-loader-and-settings-ui
tags: [lexicon-packs, indexeddb, manifest, settings-ui, race-guard, cache-busting]
status: complete

requires:
  - phase: 06-lexicon-packs (06-01)
    provides: data/packs/index.json (default v096 + chewing), data/packs/chewing/ files, v096 NOTICE
provides:
  - "js/wordlist.js: manifest-driven loader (loadLexiconManifest, resolveLexiconPack, per-pack meta/chunk URLs, per-pack IndexedDB keys p:<id>:<i> / p:<id>:ver, _wlGen stale-load guard, switchLexiconPack with rollback)"
  - "lh:lexiconPack registered in LH_KEYS (group setting; 18 keys) so backups carry it"
  - "偏好設定 「詞庫包」 radio list (name, N 詞 with zh-TW grouping, one-line description), status line, change handler"
  - "tests/lexicon-packs.spec.mjs (10 browser tests), tests/helpers.mjs stubManifest / stubPack / packEntry"
  - "?v= 0.96.7 -> 0.96.8 on all 27 local tags"
affects: [06-03, 06-04, 06-05, 06-06, 06-07, 06-08]

plan_head_before: 4dd868b9b3082fc9aa2361a8b08a6a6340573e02
plan_head_after: 129876dc48065fb1492f1bda2340d4abd2fa44a2

actuals:
  tokens: 9200     # chars/4 over the added lines of this plan's code, test, css and html changes
  tasks: 2
  commits: 2       # MEASURED: git rev-list --count 4dd868b..HEAD (before the docs commit)

tech-stack:
  added: []        # no packages installed
  patterns:
    - "Manifest -> validated entry -> URLs and IndexedDB keys: the stored pack id never reaches fetch() or a key; only a manifest entry whose id passed ^[a-z0-9-]{1,32}$ and whose paths passed ^data/... (no '..') does"
    - "Generation counter (_wlGen): only the newest load publishes wordlistData, fills the maps or touches progress; an older load may finish its own cache write (keys are per pack)"
    - "legacyCache flag (honoured for id v096 only): never-switchers keep numeric IndexedDB keys + 'ver', same URLs, same ?v= rule"
    - "Settings list built with createElement + textContent only; one addEventListener, no inline handlers"

key-files:
  created:
    - tests/lexicon-packs.spec.mjs
  modified:
    - js/wordlist.js
    - js/safety.js
    - js/search-ui.js
    - index.html
    - css/base.css
    - tests/helpers.mjs
    - tests/scan.spec.mjs
    - .planning/TEST-CHECKLIST.md

key-decisions:
  - "Failed switch rolls back: stored value and active pack return to what they were before the click (a persisted failing pack would leave the next page load with no wordlist)"
  - "applyWordlistOverrides takes an optional liveness callback and returns the list untouched if the load went stale while it waited for the overrides file (it mutates the global maps after an await, which would otherwise corrupt the new pack's maps)"
  - "legacyCache is honoured only for the v096 entry; any other manifest entry uses its own p:<id>: keys"
  - "Progress line appears once the pack's chunk count is known (after its meta), not before"

requirements-completed: []   # LEX-07 and LEX-06 are also declared by later 06-0x plans; they flip when the last declaring plan finishes (same rule as 06-01)

duration: ~20 min of work plus ~7 min of full and repeated test runs
completed: 2026-10-04
---

# Phase 6 Plan 02: Site loads and switches lexicon packs Summary

The site now reads `data/packs/index.json`, loads whichever pack 偏好設定 selects (the real 新酷音詞庫 works end to end, including AI suggestions that contain only that pack's words), keeps each pack's cache under its own IndexedDB keys, and never-switchers get byte-identical v0.96 behaviour (same URLs, same numeric keys, golden tests untouched).

## What was done

**Task 1 (tracer), commit `22fd682`**: loader, registry, test tools.
- `js/wordlist.js`: new 詞庫包 section (`LH_PACK_KEY`, `LH_PACK_ID_RE`, `LH_PACK_PATH_RE`, `LH_LEGACY_PACK`, `activeLexiconPack`, `_wlGen`, `_validPackEntry`, `loadLexiconManifest`, `resolveLexiconPack`, `_packKey` / `_packVerKey` / `_packChunkUrl`). `_idbReadCache` / `_idbReplaceAll` take the pack descriptor; the legacy branch still deletes `IDBKeyRange.bound(0, 1e9)`, other packs delete only `p:<id>:` .. `p:<id>:￿`; no `clear()` anywhere. `loadWordlist` keeps its contract, its `finally` clears `_wlP` only when `_wlP` is still its own promise.
- `js/safety.js`: `lh:lexiconPack` added (18 keys); `tests/scan.spec.mjs` 17 -> 18; `tests/storage.spec.mjs` untouched (OD-9).
- `tests/helpers.mjs`: `stubManifest`, `packEntry`, `stubPack` (state read at request time; optional `gate` promise holds chunk requests so tests can force races).
- 5 tests: never-switcher (10 requests `data/wordlist-c0N.json?v=<meta.version>`, numeric keys 0..9 + `ver`, no `p:v096*`, second page makes zero chunk requests), chewing end to end (requests, `p:chewing:*` keys, a v0.96-only word absent, 24 AI cards all in the chewing set), bad stored values (`nope`, `../x`, `A B`, `CHEWING` use v096 and the stored value stays), manifest 500 (falls back, warning 「詞庫包清單讀取失敗」), backup carries the key.

**Task 2, commit `129876d`**: settings list, switch flow, version bump.
- `index.html`: `#lexiconPackSection` (title, `#lexiconPackList` radiogroup, `#lexiconPackStatus` aria-live) after 「過濾破音字」; all 27 `?v=` tags 0.96.7 -> 0.96.8.
- `js/search-ui.js`: `renderLexiconPackList` (called whenever settings opens; createElement + textContent only) and one `change` listener: 「詞庫載入中…」 then 「已改用：<name>」; on failure 「詞庫載入失敗，請稍後再試」 + toast + radio of the active pack re-checked; a click counter makes only the last click's result visible.
- `js/wordlist.js` `switchLexiconPack(id)`: validate against manifest, store, bump `_wlGen`, null `wordlistData`, new maps, clear AI pools (`_aiEpoch++`), empty `#aiWordsContainer`, hide `#aiLoading`, reload via `loadWordlist` (updates `__hoyunWordlistReady`), re-run the current search; resolves false when a newer switch superseded it.
- `css/base.css`: `.settings-pack-section/-title/-status`, `.pack-option`, `.pack-option-text/-name/-meta`, radio sized like the checkbox (1.125rem; 1.25rem + flex-shrink 0 in the touch block). Rem units only, weights 400/700, existing colour variables, no hover rules. I looked at a screenshot of the dialog (desktop): rows, wrapping and spacing are fine; no visual baseline covers the settings dialog, so none changed.
- 5 more tests: list contents with stub manifest (names, 「1,234 詞」 grouping, active checked), real manifest (233,713 詞 default checked, 新酷音詞庫 row with 128,973 詞), full switch flow (storage value, 「詞庫載入中…」 then 「已改用：Alpha」, cards and pools emptied, search re-run, next AI cards all alpha), race 「還在下載時又換包」 (alpha gated, switch to beta, release alpha: beta published, no alpha words in `wordlistData` or the phonetic map), failing pack (status, previous radio re-checked, stored value restored, wordlist usable).
- Mutation check: replacing the `_wlGen` liveness check with `() => true` makes the race test fail, so it does guard B4 (reverted).

## Verification

| Check | Result |
|-------|--------|
| `npx playwright test tests/lexicon-packs.spec.mjs` | 10 passed |
| Task 1 targeted (`lexicon-packs`, `wordlist-cache`, `golden`, `scan`, `storage`) | 94 passed |
| Task 2 targeted (`lexicon-packs`, `split-tags`, `style`, `smoke`) / layout `設定\|觸控\|輸入` | 37 passed / 20 passed |
| `npm test` (after the last code change) | 411 passed, 27 skipped, 2 failed: the known cloud-only `worker-config.spec.mjs:53` and the flaky `render.spec.mjs:275` (see Deviations) |
| `git diff --exit-code 6d65638 -- tests/golden tests/storage.spec.mjs data/wordlist-meta.json 'data/wordlist-c*.json'` | no change |
| `grep -o '?v=0\.96\.8' index.html \| wc -l` / `0\.96\.7` | 27 / 0 |
| Acceptance greps (`lh:lexiconPack` in safety.js, `toHaveLength(18)`, `IDBKeyRange.bound(0, 1e9)`, no `.clear(`, no inline handler on lexicon ids, no `innerHTML` in renderLexiconPackList, `_refreshFromCurrentInput()` and `_aiEpoch++` in wordlist.js) | all pass |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Stale load could corrupt the new pack's maps**
- **Found during:** Task 1 design review (T-06-09)
- **Issue:** `applyWordlistOverrides` mutates the global `wordPriorityMap` / `wordPhoneticMap` after awaiting the overrides file. A load made stale by a pack switch would write its removals into the NEW pack's maps.
- **Fix:** optional second argument `live`; after the fetch it returns the list untouched when the load is no longer current. Default `() => true` keeps every existing call identical.
- **Files modified:** js/wordlist.js
- **Commit:** 22fd682

**2. [Rule 1 - Bug prevention] Failed switch would persist a pack that cannot load**
- **Found during:** Task 2 (behavior: 「previous active pack checked again」)
- **Issue:** with the plan's literal sequence the failed pack stays stored and becomes `activeLexiconPack`, so the radio could not return to the previous pack and the next page load would retry a broken pack with no wordlist.
- **Fix:** `switchLexiconPack` remembers the previous pack and stored value, restores both on failure (removing the key when none was stored) and reloads the previous pack in the background; the UI then re-checks that radio.
- **Files modified:** js/wordlist.js
- **Commit:** 22fd682
- **Recorded as:** TEST-CHECKLIST 06-02-7

**3. [Defense] `legacyCache` honoured for v096 only**
- A manifest entry for another id that carried `legacyCache: true` would have used numeric keys and could overwrite the v0.96 cache; the loader now ignores the flag unless `id === 'v096'` (06-02-10).

### Out-of-scope observation (not fixed)

`tests/render.spec.mjs:275` 「分批：載入中也能點選，畫完仍保留」 is timing-sensitive: it failed in my first full run and once alone, passed 4 of 4 isolated runs and 3 of 3 whole-file runs afterwards, and ALSO failed 2 of 3 whole-file runs on a checkout of the pre-plan commit `4dd868b`. It is unrelated to this plan; not modified (noted in TEST-CHECKLIST 06-02-12).

**Total deviations:** 3 auto-added (all within the loader), 0 architectural. **Impact:** none on required outputs; strengthens B4/T-06-09 and data safety.

## Authentication Gates

None.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model; T-06-06 (id validation, manifest-only URLs and keys), T-06-07 (textContent only), T-06-08 (registry, 18 keys), T-06-09 (generation guard with a mutation-checked race test) are mitigated as planned.

## For Andy (TEST-CHECKLIST)

- 必測: 06-02-1 to 06-02-3 (switching packs in 偏好設定, step by step). 建議測: 06-02-4 to 06-02-6.
- 待 Andy 決定／動手: nothing new (D-18 from 06-01 still open).
- 自主決定: 06-02-7 (failed switch rolls back), 06-02-8 (one small manifest request per page load), 06-02-9 (unknown stored value ignored, not rewritten), 06-02-10 (legacy cache keys only for v0.96), 06-02-11 (AI cards cleared on switch), 06-02-12 (flaky render test).

## Next Phase Readiness

Ready for 06-03: per-pack keys and `p:<id>:ver` are in place for cache eviction (keep active + one other) and version-bump proofs; `applyWordlistOverrides` already receives the liveness callback where the de-dup (Pitfall 14) will go; each manifest entry already carries `notice` for the About block.

## Self-Check: PASSED

Created and modified files exist (`tests/lexicon-packs.spec.mjs`, `js/wordlist.js`, `js/search-ui.js`, `css/base.css`, `index.html`, `tests/helpers.mjs`); commits `22fd682` and `129876d` are in history; plan-level verification re-run after the last code change (full `npm test` shows only the known cloud-only failure plus the pre-existing flaky render test, which passes in isolation).
