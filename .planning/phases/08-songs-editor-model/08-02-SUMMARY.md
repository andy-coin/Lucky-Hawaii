---
phase: 08-songs-editor-model
plan: 02
subsystem: editor
tags: [songs-model, ime, composition, merge-write, dom-api, playwright]
status: complete
requires:
  - phase: 08-01
    provides: lh:songs / lh:activeSong, lhSongsOk, lhSongFromLegacy, lh:schema 2, window.__lhMigrated
provides:
  - "js/songs.js: in-memory song model (curSong, makeEmptySong, markDirty, scheduleSave, flushSongs, initSongs) with 300 ms merge-write into lh:songs"
  - "Legacy single-song mode (lh:schema not '2'): same editor, edits go to haiku_lyrics / haiku_hashtags, lh:songs stays absent"
  - "DOM-API editor (no HTML strings) with delegated, composition-safe listeners; sections matched by data-id"
  - "window.__hoyunSongsReady signal; lhNewId(prefix) in js/safety.js"
affects: [08-03, 08-04, 08-05, 08-07, 08-08]
actuals:
  tokens: 15159
  tasks: 2
  commits: 2
plan_head_before: 3a1c827bc5f4ff0b3b8213495c81cdc214dbcfe1
plan_head_after: ba6e9105c03805387313695455b572ae0415d0c8
commits: 2
tech-stack:
  added: []
  patterns: ["model-first editor: events write memory, render reads memory, nothing reads the DOM back", "per-song merge-write (re-read lh:songs, replace only dirty ids, drop deleted ids)", "composition gate: compositionstart flag + e.isComposing, flush on compositionend / focusout / pagehide / visibilitychange"]
key-files:
  created: [js/songs.js, tests/songs-ime.spec.mjs, tests/songs-model.spec.mjs]
  modified: [js/safety.js, js/state.js, js/lyrics.js, js/ui-common.js, js/ai-generate.js, index.html, tests/helpers.mjs, tests/split-tags.spec.mjs, tests/storage.spec.mjs, tests/layout.spec.mjs, tests/ai-client.spec.mjs, tests/save-failure.spec.mjs]
key-decisions:
  - "Legacy mode rule: initSongs picks 'legacy' whenever lh:schema is not '2'; the one in-memory song comes from lhSongFromLegacy(), flushSongs writes haiku_lyrics / haiku_hashtags only and never touches lh:songs / lh:activeSong"
  - "lh:songs corrupt, empty array or whole key missing with schema 2: corrupt/empty gives one empty song 未命名歌曲 1 (corrupt raw text stays under lh:corrupt:lh:songs); missing key rebuilds from the legacy keys"
  - "lhNewId(prefix) lives in js/safety.js (next to LH_ID_RE) because the 08-07 backup normaliser needs it too; no crypto.randomUUID"
  - "Section toggle updates class and chevron in place instead of re-rendering, so focus and caret are never lost; structural changes (add, delete, drop) re-render"
  - "initSongs also normalises songs read from storage (missing title / hashtags / context, duplicate or missing section ids, no sections) and marks only the touched songs dirty"
requirements-completed: [EDIT-01, EDIT-04]
duration: 12 min
completed: 2026-10-11
---

# Phase 8 Plan 02: Editor on the song model (tracer) Summary

The editor now runs on an in-memory song model: typing and Zhuyin composition only mutate memory, a 300 ms debounce (or compositionend / focusout / pagehide) merge-writes the active song into lh:songs, the legacy keys are never written in v2 mode, and nothing is ever read back from the DOM.

## Accomplishments

- js/songs.js (new): `makeEmptySong`, `curSong`, `markDirty`, `scheduleSave`, `flushSongs` (v2 merge-write and legacy write), `initSongs`, pagehide and visibilitychange flush. Merge-write re-reads lh:songs, replaces only dirty ids, drops deleted ids, and falls back to the in-memory songs when the stored value is unreadable so no song is ever dropped.
- js/lyrics.js: DOM-API `renderLyricsSections` / `renderHashtags` (createElement, textContent, .value, setAttribute with numeric indexes only), `renderActiveSong`, `syncFromField` (finds the section by `data-id`, writes only the model), delegated listeners on `#lyricsSections` and `#contextDescription`, section / #tag CRUD on the model, v1 `exportSession` / `importSession` going through the model. `saveLyrics` and all HTML-string building removed.
- js/state.js: `songs`, `activeSongId`, `songsMode` shells. js/ui-common.js: empty-lyrics auto-wipe removed; `window.__hoyunSongsReady = window.__hoyunSafetyReady.then(initSongs)`.
- js/ai-generate.js: AI suggestions and the context generator read lyrics, #tags and context from the active song; the generator's result goes into the song captured before the request and only touches the screen if that song is still active.
- index.html: songs.js tag after state.js (`?v=0.96.12`), `載入歌詞中…` placeholder inside `#lyricsSections`.
- Tests: songs-ime.spec (2 specs titled 組字：), songs-model.spec (12 specs titled 資料為準：), helpers (`activeSong`, `compose`, `STORAGE_SPY`, `__hoyunSongsReady`), split-tags expects 21 js.
- Suite: 585 passed / 27 skipped / 0 failed (baseline 571 + 14 new). Visual snapshots unchanged (no baseline refreshed).

## RED evidence

Before any implementation, `tests/songs-ime.spec.mjs` + `tests/songs-model.spec.mjs` against the 08-01 code: 12 failed, 2 passed. Failing: both 組字 specs, 原樣顯示, 畫面被改動不會寫回, 用段落 id 對應, 預設段落名稱, 標籤與情境跟著這首歌存, 歌詞清空不會清掉標籤與情境, 舊鍵不再寫入, lh:songs 損毀, lh:songs 空陣列, 主控台不出現歌詞. The 2 that passed vacuously: 升級後顯示我的第一首歌 (the old editor already showed the same text) and 備份被擋住時維持舊版單首模式 (the old editor already wrote the legacy key). After Task 1 all 14 pass.

## Commits

- af6ace5 feat(08-02): editor runs on the song model, keystrokes only touch memory (js/safety.js, state.js, songs.js, lyrics.js, ui-common.js, ai-generate.js, index.html, helpers, songs-ime / songs-model specs, split-tags)
- ba6e910 test(08-02): existing specs read lyrics from the active song in lh:songs (storage, layout, ai-client, save-failure specs)

Tracer verify (songs-ime, songs-model, songs-migrate, split-tags, scan, smoke): 48 passed. After Task 2: `npm test` 585 passed, 27 skipped, 0 failed.

## Existing specs changed and why

- tests/split-tags.spec.mjs: `songs` inserted after `state` in JS_ORDER, message 完整 21 個 js.
- tests/storage.spec.mjs: corrupt-then-edit test reads the typed text with `activeSong(page)` and asserts haiku_lyrics still equals the corrupt raw string (the editor no longer writes it); local `ready` also waits for `__hoyunSongsReady`; the 600000-char no-IndexedDB test asserts the first textarea shows all 600000 characters (legacy mode).
- tests/layout.spec.mjs: `savedLyrics` reads the active song and maps sections to `{ label, text, collapsed }`, so the existing `toEqual(DELETE_SECTIONS)` assertions keep their meaning.
- tests/ai-client.spec.mjs: the context-generator test now opens the left panel and uses `fill()`. Reason beyond the plan text: with the panel collapsed the textarea sits off screen (x = -329) and Playwright's `fill` reports success without typing, so the model stayed empty and the generator answered 左側歌詞是空的.
- tests/save-failure.spec.mjs (not listed in the plan): comment only; the old comment named `saveLyrics`.
- tests/songs-model.spec.mjs console spec does not treat the corrupt blob itself as a leak: V8's JSON SyntaxError message quotes the first bytes of the corrupt text, and passing error objects to `lhWarn` is allowed by the plan (key names and error objects only).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] ai-client context-generator test needed the panel opened**
- **Found during:** Task 2 (`npm test`)
- **Issue:** plan step 3 says to use `fill(...)`; with the left panel collapsed the textarea is off screen and `fill` silently does not type.
- **Fix:** `toggleLeftPanel()` first, then `fill`.
- **Files modified:** tests/ai-client.spec.mjs
- **Commit:** ba6e910

**2. [Rule 2 - Missing critical] Defensive normalisation of stored songs in initSongs**
- **Found during:** Task 1
- **Issue:** `lhSongsOk` only checks song id and a sections array; a section without a valid or unique id would break id matching, and a song with zero sections would show an empty editor.
- **Fix:** `_normalizeSong` fills missing fields, repairs duplicate / invalid section ids, guarantees one section; only touched songs are marked dirty.
- **Files modified:** js/songs.js
- **Commit:** af6ace5

**Total deviations:** 2 auto-fixed. **Impact:** none on behaviour required by the plan.

## Autonomous decisions (for Andy's 自主決定 list)

- Legacy-mode rules: mode is `legacy` exactly when lh:schema is not '2'; edits write haiku_lyrics / haiku_hashtags, lh:songs and lh:activeSong never appear; 情境 is not stored in legacy mode (it never was in v0.96).
- Corrupt or empty lh:songs (schema 2) gives exactly one empty song 未命名歌曲 1, written back to lh:songs; corrupt raw text kept under lh:corrupt:lh:songs. A missing lh:songs rebuilds from the legacy keys.
- `lhNewId` lives in js/safety.js.
- The label input commits to the model while typing (input event) and flushes on blur; an emptied label shows the default name after the next render, as before.

## Known Stubs

None.

## Threat Flags

None. No new endpoints or storage keys beyond the registry; all new nodes are built with textContent / .value (T-08-01), no read-back from the DOM (T-08-03), unreadable lh:songs never leaves the app without a song (T-08-32), console messages carry key names and error objects only (T-08-05).

## Self-Check: PASSED

- js/songs.js, tests/songs-ime.spec.mjs, tests/songs-model.spec.mjs present; commits af6ace5 and ba6e910 found in `git log`.
- Task 1 acceptance greps re-run: lhNewId 1, flushSongs 1, initSongs 1, `__hoyunSafetyReady.then(initSongs)` 1, innerHTML 0, saveLyrics 0, legacy `lyricsSections` mutations 0, `querySelectorAll('.section-textarea')` in ai-generate 0, songs.js tag 1.
- Task 2 acceptance greps: `__hoyunSongsReady` in storage.spec 1, `localStorage.getItem('haiku_lyrics')` in layout.spec 0, `activeSong` in layout.spec 2.
- `npm test`: 585 passed, 27 skipped, 0 failed.
