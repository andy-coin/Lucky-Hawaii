---
phase: 10-rhyme-map
reviewed: 2026-10-28T00:00:00Z
depth: standard
files_reviewed: 25
files_reviewed_list:
  - css/panels.css
  - css/responsive.css
  - index.html
  - js/candidates.js
  - js/lyrics.js
  - js/rhyme-core.js
  - js/rhyme-map.js
  - js/safety.js
  - js/sections.js
  - js/wordlist.js
  - tests/helpers.mjs
  - tests/layout.spec.mjs
  - tests/lexicon-packs.spec.mjs
  - tests/node-core.mjs
  - tests/rhyme-audit.spec.mjs
  - tests/rhyme-core.spec.mjs
  - tests/rhyme-journey.spec.mjs
  - tests/rhyme-map-perf.spec.mjs
  - tests/rhyme-map-ui.spec.mjs
  - tests/rhyme-parity.spec.mjs
  - tests/scan.spec.mjs
  - tests/sections-audit.spec.mjs
  - tests/sections-ui.spec.mjs
  - tests/songs-ime.spec.mjs
  - tests/split-tags.spec.mjs
findings:
  critical: 0
  warning: 3
  info: 6
  total: 9
status: issues_found
---

# Phase 10: Code Review Report

**Reviewed:** 2026-10-28
**Depth:** standard
**Files Reviewed:** 25
**Status:** issues_found

## Summary

I reviewed the phase 10 diff (`83c983c^..HEAD`) against the current source and ran `rhyme-core.spec.mjs` and `rhyme-parity.spec.mjs`. All 40 tests pass. I also probed `lhRhymeTarget`, `lhRhymeAnalyze` and `lhRhymeSummary` through the `node-core.mjs` vm harness.

**No critical issues found.** The priority areas hold up:

- **XSS:** The mirror, menus, stats dialog, strip and floating bar are built with `createElement`, `textContent` and `dataset`. Lyric text, `label` and `r.line` never reach `innerHTML`. `dataset.f` only receives numbers, and palette hex values go through `LH_MAP_HEX`.
- **Imported `lh:map` and `readings`:** `lhRhymeNormalizeSettings` accepts only real booleans on own keys. `lhRhymeCleanReadings` rejects `__proto__` keys and keeps only keys that are 1 to 4 Han characters. It also checks each value against the dictionary and caps the count at 2000. Both are wired into `lhParseBackup`. A full-restore import ends in `location.reload()`, so `_lhMapSet` cannot go stale.
- **Rhyme verdict:** `lhRhymeKey` equality is the same relation as `lhRhymeMatch`. The refactored call sites in `candidates.js` and `wordlist.js` keep their old behaviour, including the `!searchRhyme` guard.
- **IME handling:** Scheduling, flushing and stats rebuilds are all gated on `_lhComposing`. The input listener order (`lyrics.js` first) is correct.
- **Cross-tab and key handling:** `lh:map` is registered in `LH_KEYS`, so backup, restore and rollback cover it. The storage handler re-normalises the stored value and closes the overlays before redrawing.

The defects below are stale colouring in specific paths, one test that can fail for timing reasons alone, and some dead code and small inconsistencies.

## Warnings

### WR-01: Setting or clearing a manual reading only repaints the section it was made in

**File:** `js/rhyme-map.js:851-856`
**Issue:** `song.readings` is song-wide and keyed by the line-end text (`tail`). `lhRhymeManual` applies an entry to any line in any section whose tail matches.

`lhMapSetReading` bumps `_lhMapReadVer` and then repaints only `lhSecEl(secId)`. Other sections of the same song that end with the same tail keep their old colours, letter strip and open stats. This stays until each of those sections is edited or the whole list is redrawn. The cache signature changes, but nothing triggers the repaint.

In practice, the user picks 好 → ㄏㄠˋ in verse 1 and the identical line in the chorus keeps the old colour. The dotted "manual" underline, the AABB strip and the stats then disagree with the data model.

**Fix:**
```js
    _lhMapReadVer++;
    const sn = _lhMapBarSnap;
    if (sn) _lhMapBarSkip = _lhMapSelSig(sn.ta);
    lhMapHideBar();
    lhMapRenderAll();   // readings are song-wide: repaint every section, not just secId
```
`lhMapRenderAll` already clears the cache and disconnects and re-observes the ResizeObserver, and a pass over 100+ lines is cheap.

### WR-02: Late or retried lexicon loads never refresh the rhyme map

**File:** `js/wordlist.js:327-336` and `js/ai-generate.js:102` (consumer: `js/rhyme-core.js:94-100`)
**Issue:** The map's read-order tier "last word of a lexicon word ending at the target" depends on `wordPhoneticMap`. The map is invalidated (`lhMapOnLexiconChange`) in only two places: after a successful `switchLexiconPack`, and in the rollback `back.then`.

Two paths are missed:

1. The first `loadWordlist()` can fail (`_wlP` is reset, `wordlistData` stays null). `__lhMapReady` still resolves via `allSettled` and paints with dictionary-only readings. A later successful retry, such as the one in `ai-generate.js:102`, fills `wordPhoneticMap`. The `_lhMapCache` signature (`_lhMapEpoch`) does not change, so colours stay on dictionary-first readings until each section is edited.
2. In `switchLexiconPack`, `wordPhoneticMap = new Map()` is reset at line 309. If the new pack fails to load and `_lastGoodPack` is null, the code returns `false` with no `lhMapOnLexiconChange` call. Existing colours were computed from the old pack and are never recomputed.

**Fix:** Call the hook where the data is actually published, so every path is covered once. In `_loadWordlistOnce`, right after `wordlistData = out;` inside `if (live())`:
```js
if (out !== null && typeof lhMapOnLexiconChange === 'function') lhMapOnLexiconChange();
```
It is harmless before `_lhMapOk`, because `lhMapRenderAll` returns early. The two explicit calls in `switchLexiconPack` then become redundant.

### WR-03: Unconditional 20 ms wall-clock assertion in a default-run test

**File:** `tests/rhyme-map-perf.spec.mjs:44-64` (assertion at line 62)
**Issue:** The first test is gated behind `LH_PERF=1` and scaled by `LH_PERF_SCALE`. The second test, "兩百行分析在 20ms 內", is not gated and ignores the scale factor. It asserts a median of 5 runs under a hard 20 ms.

It runs in the normal suite alongside other workers, so it can fail from CPU contention without any code regression. The file header and the 50 ms comment also disagree with the actual 20 ms threshold.

**Fix:**
- Apply `Number(process.env.LH_PERF_SCALE || 1)` to the threshold.
- Move it behind the same `LH_PERF` gate, or loosen it to a regression canary (for example 100 ms).
- Fix the header comment.

## Info

### IN-01: `_lhMapDeferred` is dead state

**File:** `js/rhyme-map.js:142-148, 159`
**Issue:** The set is added to in the ResizeObserver callback during composition and cleared in `lhMapRenderAll`, but it is never read. The deferred re-alignment actually happens because `lhMapPaint` (including its cache-hit branch) always ends with `_lhMapSync`. The comment "下一次畫的時候才對齊" is true, but the set does nothing.
**Fix:** Remove the set. In the observer, use `if (!_lhComposing) _lhMapSync(e.target, mirror);`.

### IN-02: Opening stats on an over-long section says "no analysable line ends"

**File:** `js/rhyme-map.js:498-500`
**Issue:** For a section over `LH_WD_BIG` characters or `LH_MAP_MAX_LINES` lines, the strip correctly shows "—" with the title "段落太長，不做押韻分析". Clicking it opens stats that say "這個段落還沒有可分析的句尾", because `res` is null. That is misleading and contradicts the strip.
**Fix:** In `_lhMapStatsFill`, distinguish the two cases. For example, have the cache entry carry `big`, and show "段落太長，不做押韻分析" when it is set.

### IN-03: Stats dialog is built twice per repaint

**File:** `js/rhyme-map.js:484-491, 586-595`
**Issue:** `_lhMapStatsFill` calls `_lhMapStatsData`. On a stale cache that calls `lhMapPaint`, which calls `_lhMapStrip`, which calls `_lhMapStatsRefresh`, which calls `_lhMapStatsFill` again. The second pass finds a cache hit and builds the dialog. The first pass then builds it again.

The `resize` and `visualViewport` handlers also call `_lhMapStatsRefresh`, so every resize event rebuilds the whole list and resets its scroll position.
**Fix:**
- Have `_lhMapStatsData` take its result from the cache only after painting, and skip the nested refresh with a re-entrancy flag.
- For resize, only re-run `_lhMapStatsPlace`.

### IN-04: Stored `readings` are only validated on import, despite the comment saying "匯入／載入"

**File:** `js/rhyme-core.js:169-171`, `js/songs.js:100-125`
**Issue:** `lhRhymeCleanReadings` is only called from `lhNormalizeSong` (import). `_normalizeSong`, which handles songs read from `lh:songs`, does not touch `readings`.

Reads are safe. `lhRhymeManual` uses `hasOwnProperty.call` and checks the value. Writes are not. If a hand-edited store holds `readings` as a string or array, `lhMapSetReading` takes `song.readings[tail] = reading` on a truthy non-object. In sloppy mode this either fails silently or, for an array, sets a property that `JSON.stringify` drops. The user's "指定讀音" then appears to work and is lost on reload.

Separately, `lhMapSetReading` never prunes entries whose tail no longer appears in the song. `lhRhymeCleanReadings` silently truncates a song with more than 2000 such entries on import.
**Fix:** In `_normalizeSong`, add `if (s.readings !== undefined) { const r = lhRhymeCleanReadings(s.readings); if (r) s.readings = r; else delete s.readings; }`. Optionally prune orphans when writing.

### IN-05: `safety.js` now calls `rhyme-core.js` functions without a guard

**File:** `js/safety.js:553-556, 635`
**Issue:** `safety.js` loads in `<head>` and calls `lhRhymeNormalizeSettings` and `lhRhymeCleanReadings` at import time with no `typeof` guard. Other cross-file hooks added in this phase, such as `lhMapCloseAll` and `lhMapSchedule`, are guarded. If `rhyme-core.js` fails to load, for example from a stale cache with a mismatched `?v=`, every backup import throws `ReferenceError`.
**Fix:** Either guard the calls (`typeof lhRhymeCleanReadings === 'function' ? … : null`) or drop `readings` and `lh:map` with a warning in that case.

### IN-06: Whole-section re-analysis cap is far above the measured range

**File:** `js/rhyme-map.js:9, 66`
**Issue:** The tests measure 200 lines at under 20 ms. A section is only skipped above `LH_WD_BIG` (200000 characters) or `LH_MAP_MAX_LINES` (5000 lines). On every 200 ms pause, a section near 5000 lines is fully re-analysed and its mirror is rebuilt with thousands of spans. Extrapolating from the test, that is roughly 25 times the tested cost and likely well over the 50 ms long-task budget the other perf test enforces. `lhMapRenderAll` also repaints collapsed sections.
**Fix:** Lower `LH_MAP_MAX_LINES` to a few hundred, or, when the line count exceeds that, skip collapsed sections and defer them until expanded.

---

_Reviewed: 2026-10-28_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
