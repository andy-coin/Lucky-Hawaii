---
phase: 06-lexicon-packs
plan: 03
subsystem: lexicon-cache-eviction-overrides-about
tags: [lexicon-packs, indexeddb, lru-eviction, overrides, about-dialog, deterministic-test]
status: complete

requires:
  - phase: 06-lexicon-packs (06-02)
    provides: per-pack IndexedDB keys p:<id>:<i> / p:<id>:ver, _idbReplaceAll / _idbReadCache with pack descriptors, switchLexiconPack, applyWordlistOverrides with liveness callback, manifest entries with notice
provides:
  - "js/wordlist.js: 'p:index' cache registry ([{id, ver, t}]) read-modify-written inside the swap transaction; at most 2 packs kept (active + most recently used other); evicted packs lose only their own keys (legacy v096 -> numeric range + 'ver', others -> p:<id>: range); cache-hit touch in a separate small transaction"
  - "applyWordlistOverrides de-duplicates 'added' words (against the pack and within added); removed/hidden/fixed apply to every pack"
  - "index.html + js/search-ui.js + css/responsive.css: About dialog block 目前使用的詞庫 + scrollable NOTICE (renderAboutPackNotice, textContent only)"
  - "tests: eviction, A8 proof, no-registry legacy cache, per-pack version replacement, overrides de-dup / no mixing, About block (6 new tests) and a deterministic render test"
affects: [06-04, 06-05, 06-06, 06-07, 06-08]

plan_head_before: 8dcf6e15612f6056550bfb55209adddd4bf3aff5
plan_head_after: 7290a4a08e3dc0afdc37e4c8c1bcf6d3be6a5bd2

actuals:
  tokens: 6650     # chars/4 over the added lines of this plan's code, css, html and test changes (incl. the pre-task)
  tasks: 3         # plus the pre-task (render test)
  commits: 4       # MEASURED: git rev-list --count 8dcf6e1..HEAD (pre-task + 3 task commits, before the docs commit)

tech-stack:
  added: []        # no packages installed
  patterns:
    - "Registry in the same readwrite transaction as the swap: read 'p:index', upsert the active pack first (stable sort keeps it ahead on equal timestamps), keep 2, range-delete the rest, write back; any sync exception aborts the whole transaction"
    - "Eviction never clears the store: ids are re-validated with LH_PACK_ID_RE before a range is built; the legacy id maps to IDBKeyRange.bound(0, 1e9) + 'ver'"
    - "An unregistered old v0.96 cache counts as the oldest pack ({id: 'v096', t: 0}) the first time another pack swaps in"
    - "Test holds the progressive-render slice scheduler (requestAnimationFrame callbacks named step) instead of racing it"

key-files:
  created: []
  modified:
    - js/wordlist.js
    - js/search-ui.js
    - index.html
    - css/responsive.css
    - tests/lexicon-packs.spec.mjs
    - tests/wordlist-cache.spec.mjs
    - tests/render.spec.mjs
    - .planning/TEST-CHECKLIST.md

key-decisions:
  - "Keep 2 packs (active + 1), constant LH_PACK_KEEP; cache-hit touch never evicts (next swap trims)"
  - "added-word de-dup is by word only (first occurrence wins); a word removed by the same overrides file can still be re-added, as before"
  - "NOTICE is re-read with cache:'no-cache' every time About opens; failure shows 詞庫來源說明暫時讀不到 and logs via lhWarn"

requirements-completed: []   # LEX-06, LEX-07 and LEX-01 are also declared by later 06-0x plans; they flip when the last declaring plan finishes (same rule as 06-01 / 06-02)

duration: ~45 min of work plus ~25 min of full and repeated test runs
completed: 2026-10-04
---

# Phase 6 Plan 03: Bounded pack cache, per-pack versions, overrides de-dup, About sources Summary

Browser storage now holds at most the active pack plus the most recently used other pack; a new version of one pack replaces only that pack's keys; corrections apply on every pack without duplicates; and 關於 shows the active pack's name and NOTICE. Golden tests, default v0.96 files and `?v=` (0.96.8) are untouched.

## Pre-task: deterministic render test (commit `d012b82`)

`tests/render.spec.mjs` 「分批：載入中也能點選，畫完仍保留」 raced the progressive render (it clicked a card, then asserted the render was still `more`). Root cause: the test depended on the click landing before `results.js` finished its requestAnimationFrame-driven slices. Fix:
- `holdRenderSlices(page)` wraps `window.requestAnimationFrame` and parks only the callback named `step` (results.js's slice scheduler; Playwright's own actionability frames are not affected). The click and the batch-mark now happen while the state is provably `more`; `release()` re-queues the held slice (asserted: exactly one was held) and the test then waits for `done`.
- The old test picked the 3rd card, which has no later duplicate, so it never actually proved selection reaches cards drawn later. It now picks a first-batch card whose character is drawn again later (polyphonic readings, e.g. 蹣 at index 12 and 376 for ㄢ) and asserts all of its cards, before and after, are selected.
- Proof: `--repeat-each=5` on the single test and on the whole file (55 runs) green. Mutations: replacing the selected-class lookup in `js/cards.js` with `false` fails the test (Expected 2, Received 1); clearing `selectedChars` in the render `finish()` fails it (Expected 1, Received 0). Both reverted.

## What was done

**Task 1 (tracer), commit `b363913`**: registry and eviction in `js/wordlist.js`.
- `_idbReplaceAll`: after delete + puts, `st.get('p:index')`; unregistered old v0.96 cache (`st.get('ver')`) is added as `{id:'v096', t:0}` when another pack swaps in; upsert, keep `LH_PACK_KEEP = 2`, range-delete the dropped packs, put `p:index`. Any sync exception aborts the transaction and settles false. No `clear()`.
- `_idbTouchPack`: on a cache hit a separate small readwrite transaction refreshes this pack's `t`; failure only `lhWarn('詞庫快取索引更新失敗')`.
- Tests (3): 「快取最多留目前的包加上一個」, 「v0.96 換版只刪數字鍵，別的包留著」, and one for an old cache without a registry.
- Observed IndexedDB state (p:index ids, newest first): boot `[v096]` (numeric 0-9 + `ver`); after alpha `[alpha, v096]`, numeric keys still there; after beta `[beta, alpha]`, no numeric keys and no `ver`; after gamma `[gamma, beta]`, alpha keys gone; back to alpha `[alpha, gamma]` (alpha re-downloaded, beta gone); back to gamma `[gamma, alpha]` with zero new gamma requests. `sentinel` survived every step and the backups store count was unchanged. v0.96 version swap (V1 -> V2 with alpha cached): 10 chunk requests all `?v=V2`, `ver` = V2, numeric keys rewritten, `p:alpha:*`, `p:index` (`[v096, alpha]`) and `sentinel` intact.
- Mutations: keep-count 2 -> 9 fails two tests; replacing alpha's range delete with `st.clear()` fails the A8 and eviction tests. Reverted.

**Task 2, commit `4001624`**: per-pack version test and overrides de-dup.
- `applyWordlistOverrides`: before the added loop a Set of the words already in `filtered`; duplicates (also within `added`) are skipped and not counted; validation, map updates, summary and the try/catch fallback unchanged.
- `tests/wordlist-cache.spec.mjs` 「版本：非預設詞庫包改版時只換該包、缺段保留舊版」: V1 stored with `?v=V1`; same version -> zero requests; V2 -> three requests `?v=V2`, `p:alpha:ver` V2, chunks V2, seeded v0.96 markers (`ver`, numeric key 0) and `sentinel` untouched, `p:index` `[alpha, v096]`; V3 with chunk 1 failing -> `wordlistData` null, V2 set complete, warning 詞庫分段 1 載入失敗; fixed -> V3 published. Mutation (always delete the numeric range) fails it.
- `tests/lexicon-packs.spec.mjs` 「修正檔加回的詞不重複、刪除與改音在別的包也生效」: removed word absent (also from the phonetic map), fixed word has the new z in both list and map, an added word that already exists occurs once, a new added word (written twice) occurs once, an added item without a reading is skipped, total 30; after switching to beta the added words appear once there too and no other alpha word is present (32 words). Mutation (no de-dup) fails it.
- `git diff --exit-code 6d65638 -- tests/golden data/wordlist-overrides.json`: no change (real overrides have `added: []`).

**Task 3, commit `7290a4a`**: About block.
- `index.html`: `.about-pack` with `#aboutPackName` and `<pre id="aboutPackNotice" tabindex="0">` before the signature. `js/search-ui.js`: `renderAboutPackNotice()` (name from `activeLexiconPack`, else `resolveLexiconPack()`; NOTICE path checked with the loader's `LH_PACK_PATH_RE` and no `..`; `fetch(..., {cache:'no-cache'})`; textContent only; a sequence counter keeps only the latest open's result); `toggleAbout()` calls it whenever the overlay becomes shown. `css/responsive.css`: `.about-pack`, `.about-pack-title`, `.about-notice` (rem units, weights untouched, existing variables, 0.75rem text, max-height 12rem scroll).
- Test 「詞庫包：關於視窗顯示目前詞庫的來源」: default pack shows v0.96 name and the 重編國語辭典修訂本 statement; after switching to chewing the name and upstream commit c44e81ae... appear; NOTICE routed to 500 shows 詞庫來源說明暫時讀不到 with a warning logged and no console errors. I looked at desktop and phone (390 px) screenshots: block aligned left, scrolls inside, signature clear below. No visual baseline covers the About dialog, so none changed.

## Verification

| Check | Result |
|-------|--------|
| `npx playwright test tests/render.spec.mjs --repeat-each=5` | 55 passed |
| Task 1 targeted (`lexicon-packs`, `wordlist-cache`, `save-failure`, `scan`) | all passed |
| Task 3 targeted (`lexicon-packs`, `style`, `smoke`, `split-tags`) / layout `設定\|關於\|觸控` | 42 passed / 12 passed |
| `npm test` (after the last code change) | 418 passed, 27 skipped, 1 failed: the known cloud-only `worker-config.spec.mjs:53` |
| `git diff --exit-code 6d65638 -- tests/golden data/wordlist-overrides.json` | no change |
| Acceptance greps: `'p:index'` in wordlist.js (3), no `.clear(` (0), `aboutPackNotice` in index.html (1), no `innerHTML` in `renderAboutPackNotice` (0), `renderAboutPackNotice()` calls (2) | pass |

## Deviations from Plan

### Pre-task requested by the orchestrator (not in the plan)

**[Pre-task] Make the render flake deterministic** — see above; commit `d012b82`, `test(06): 分批渲染「載入中也能點選」測試改成確定性（不再搶時間）`. Test-only, no product code touched.

### Auto-fixed Issues

**1. [Rule 1 - Bug] Empty catch tripped the repository's catch scan**
- **Found during:** Task 1 full `npm test` (`scan.spec.mjs` 「程式碼裡沒有吞錯的 catch」 failed)
- **Issue:** the touch helper's `catch (e3) { /* 已中止 */ }` swallowed the error silently.
- **Fix:** it now logs through `lhWarn('詞庫快取交易中止失敗', e3)` like the other abort paths.
- **Files modified:** js/wordlist.js
- **Commit:** b363913

**2. [Rule 3 - Test tooling] `bootWithStubPacks` could not take a third pack or per-test routes**
- Added optional `gamma` and `afterStubs` options (its own `beforeGoto` overrides a caller's). Default behaviour unchanged.
- **Files modified:** tests/lexicon-packs.spec.mjs
- **Commit:** b363913

**3. [Test correction] My first expectation about which pack survives was wrong**
- With order beta, gamma, alpha the kept "other" pack is gamma (most recently used), not beta. The implementation was right; the test expectation was corrected before commit.

**Total deviations:** 1 pre-task, 2 auto-fixes, 0 architectural. **Impact:** none on required outputs.

## Authentication Gates

None.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model. T-06-10 (range deletes only on 'wl', ids re-validated, sentinel/other packs/backups proven by tests, no `clear()` by grep), T-06-11 (textContent, notice path validated, no `innerHTML` by grep), T-06-12 (de-dup with mutation-checked test) are mitigated as planned.

## For Andy (TEST-CHECKLIST)

- 必測: 06-03-1 to 06-03-3 (關於 shows the active pack's sources; also updated the stale wording of 06-01-1). 建議測: 06-03-4 to 06-03-6.
- 待 Andy 決定／動手: nothing new (D-18 from 06-01 still open).
- 自主決定: 06-03-7 (keep 2 packs), 06-03-8 (unregistered old v0.96 cache is the oldest), 06-03-9 (added de-dup; removed/fixed on every pack), 06-03-10 (NOTICE re-read each time); 06-02-12 now says the render test is fixed.

## Next Phase Readiness

Ready for 06-04: pack switching is bounded and safe, the loader, registry and About block take any manifest entry, so adding the 小麥注音 and 唯音 packs only needs new data/packs/<id>/ directories and manifest entries.

## Self-Check: PASSED

Modified files exist (`js/wordlist.js`, `js/search-ui.js`, `index.html`, `css/responsive.css`, `tests/lexicon-packs.spec.mjs`, `tests/wordlist-cache.spec.mjs`, `tests/render.spec.mjs`); commits `d012b82`, `b363913`, `4001624`, `7290a4a` are in history; full `npm test` re-run after the last code change shows only the known cloud-only failure.
