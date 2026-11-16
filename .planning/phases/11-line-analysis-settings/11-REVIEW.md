---
phase: 11-line-analysis-settings
reviewed: 2026-10-28T00:00:00Z
depth: standard
files_reviewed: 18
files_reviewed_list:
  - js/line-core.js
  - js/rhyme-core.js
  - js/rhyme-map.js
  - js/safety.js
  - js/search-ui.js
  - js/songs.js
  - css/panels.css
  - index.html
  - tests/line-analysis-ui.spec.mjs
  - tests/line-audit.spec.mjs
  - tests/line-core.spec.mjs
  - tests/line-journey.spec.mjs
  - tests/node-core.mjs
  - tests/rhyme-audit.spec.mjs
  - tests/rhyme-core.spec.mjs
  - tests/rhyme-map-perf.spec.mjs
  - tests/rhyme-map-ui.spec.mjs
  - tests/split-tags.spec.mjs
findings:
  critical: 0
  warning: 1
  info: 5
  total: 6
status: issues_found
---

# Phase 11: Code Review Report

**Reviewed:** 2026-10-28
**Depth:** standard
**Files Reviewed:** 18
**Status:** issues_found

## Summary

Reviewed the Phase 11 diff (`f1a2f16..HEAD`) for the mirror-layer markers, the segmentation guess, the 📏 分析 panel, mouse dwell, the prefs section and the `lh:map` serialiser. I traced the callers of the shared functions and ran probes in Chromium via Playwright. The existing suites pass: the 61 node-level tests and the 135 UI/audit/perf tests, with 2 perf tests skipped.

No security problems found:

- Every node built from lyric text, labels or settings goes through `createElement` / `textContent` / `append(string)`.
- `setProperty` and `style.*` only receive values from constant tables or values that passed `/^#[0-9a-f]{6}$/`.
- `lhRhymeNormalizeSettings` reads a fixed key list, never iterates input keys, and so can't be hit by `__proto__`.
- The import path (`_lhSettingFrom`) re-serialises through `lhRhymeSerialize`.

Settings are backward compatible: a Phase 10 five-key object round-trips byte for byte, and new keys are written only when they differ from the default.

Wrap alignment holds in every boundary case I probed, except the trailing-whitespace case in IN-01 below. The probes covered 390/700/1280 px widths, right and tail positions, leading and trailing ASCII space, tab and U+3000, and counts of 20–40 characters. Paint cost is acceptable: 8 ms for 150 lines, 47 ms for 1000 and 218 ms for 4000, all with every marker on.

One real functional defect: with 對照差異 on, the `≠` markers go stale when a section's type, custom name or position changes.

## Warnings

### WR-01: 對照差異 (`≠`) markers go stale after changing a section's type, custom name or order

**File:** `js/rhyme-map.js:271-285` (scheduling), `js/rhyme-map.js:179-191` (cache key). The missing trigger is in `js/sections.js:65-90` (`lhSecRefreshMeta`) and `js/sections.js:33-46` (`lhSecApply`).

**Issue:** The 對照段落 (comparison section) is "the first section of the same type" (`lhLineRefIndex` / `lhLineGroupKey`).

- Repaints of the mirror are triggered only from `lhSecCountOne` (typing, composition end, undo of text, word drag), `lhSecCountAll` (full re-render) and the wordlist / settings paths.
- The structural actions that change the reference don't go through any of these:
  - clicking the type button (`lhSecApply('type', …)`, sections.js:579)
  - the section menu's type or name (`_lhMenuSet`, sections.js:766)
  - move by drag or Alt+↑↓ (`lhSecApply('move', …, { dom: 'move' })`)
- These call only `lhSecRefreshMeta()`, which never touches the mirror. The `ref` cache check in `lhMapPaint` is correct but never runs.
- Repro, run in Chromium with `lh:map = {line:true, lnDiff:true}` and sections `[verse "我望著遠方的光\n獨自站在窗", verse "我望著遠方\n獨自站在窗前", chorus]`:
  - Before: section 2 shows `≠7`, `≠5`.
  - After clicking the first section's type button (it becomes pre-chorus, so section 2 is now the first Verse and has no reference), section 2 still shows `≠7`, `≠5`.
  - The stale values stay until section 2 or its reference is edited, or the page is reloaded.
- Undo of a type change and add / remove are fine, because they call `renderLyricsSections`.

**Fix:** Add a small entry point in rhyme-map.js and call it from `lhSecRefreshMeta` (or from the non-render branch of `lhSecApply`). The per-section cache already skips sections whose text, settings and reference text are unchanged, so only affected sections repaint.

```js
// rhyme-map.js
function lhMapOnSectionsChanged() {   // 段落的類型、名稱、順序變了：對照段落可能換人
    if (!_lhMapOk || !_lhMapSet.line || !_lhMapSet.lnDiff) return;
    for (const el of document.getElementById('lyricsSections').children) _lhMapPending.add(el.dataset.id);
    if (!_lhMapFirstAt) _lhMapFirstAt = Date.now();
    clearTimeout(_lhMapTimer);
    _lhMapTimer = setTimeout(_lhMapFlush, 0);
}
// sections.js, end of lhSecRefreshMeta()
if (typeof lhMapOnSectionsChanged === 'function') lhMapOnSectionsChanged();
```

Add a UI test: change the first Verse's type and assert the `.lm-t-d` text of the second Verse becomes empty.

## Info

### IN-01: The trailing zero-width character stops trailing whitespace on the last line from hanging, so the mirror can be one row taller than the textarea

**File:** `js/rhyme-map.js:167`

**Issue:**

- `if (paintRows) frag.append('\u200b')` is appended after the last row unconditionally. The comment says it is for text that ends with a newline.
- When the last line ends with spaces, tabs or U+3000 and sits exactly at a wrap boundary, the textarea lets the trailing whitespace hang, but the mirror pushes it to a new row. The ZWSP follows the whitespace, so it is no longer at the end of the line.
- Measured at 390 px with the mirror and textarea forced to `height:1px` and compared by `scrollHeight`: 6 of 126 boundary cases diverge with `line:false` (e.g. 39 characters + 2×U+3000: 74 vs 102 px). 12 of 126 diverge with every marker on in right mode.
- Only the whitespace row differs; the glyph rows and markers stay aligned, so the visible effect is a taller scroll extent.
- The ZWSP existed in Phase 10, but Phase 11's trailing-whitespace handling (X1) is the part that was meant to guarantee this alignment.

**Fix:** Append the ZWSP only when it is needed, that is when the text ends with a newline and the last row is empty:

```js
if (paintRows && rows.length && rows[rows.length - 1].line === '') frag.append('\u200b');
```

### IN-02: "詞庫載入中" notices never go away if the wordlist fails to load

**File:** `js/rhyme-map.js:536` (prefs `.rm-lex-wait`) and `js/rhyme-map.js:1342` (analysis panel)

**Issue:** Both notices test `wordPhoneticMap.size`. Only the menu's `.rm-loading` uses the `_lhMapWl` gate, which is true once the wordlist has settled (success or failure). After a failed load, or while `switchLexiconPack` has replaced the map with an empty one and the load fails, the page permanently says "詞庫載入中，≈ 的自動斷句稍後補上".

**Fix:** Use the same signal as the menu: `wait.hidden = _lhMapWl && wordPhoneticMap.size > 0` for the prefs note, with a separate "詞庫沒有載入，不做自動斷句" text when `_lhMapWl && size === 0`. Apply the same condition in `_lhMapAnContent`.

### IN-03: The same colour regex is defined twice

**File:** `js/rhyme-map.js:10` (`LH_MAP_HEX`) and `js/rhyme-core.js:~26` (`LH_MAP_COLOR_RE`)

**Issue:** The two are identical. The comment in rhyme-core says "與 rhyme-map.js 的 LH_MAP_HEX 同形", so they have to be kept in step by hand. rhyme-map.js uses both (`LH_MAP_HEX` in `lhMapApplyPalette`, `LH_MAP_COLOR_RE` in `_lhMapColorInput` / `lhMapSetColor`).

**Fix:** Delete `LH_MAP_HEX` and use `LH_MAP_COLOR_RE` everywhere. rhyme-core.js loads first.

### IN-04: `lhMapShowBar` computes the "same selection" test twice

**File:** `js/rhyme-map.js:1109` and `js/rhyme-map.js:1114`

**Issue:** The condition `prev && prev.ta === snap.ta && prev.a === snap.a && prev.b === snap.b && prev.secId === snap.secId` is written out twice. The first copy is negated to collapse the reading row, the second assigns `same`.

**Fix:** Compute `const same = …` once above both uses.

### IN-05: Stray indentation on the new script tag

**File:** `index.html:~460` (`<script src="js/line-core.js?v=0.96.15"></script>`)

**Issue:** The tag has no indentation while its neighbours have four spaces.

**Fix:** Indent it like the others. `tests/split-tags.spec.mjs` doesn't check whitespace, so it won't catch this.

---

_Reviewed: 2026-10-28_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
