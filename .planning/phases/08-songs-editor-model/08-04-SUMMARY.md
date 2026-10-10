---
phase: 08-songs-editor-model
plan: 04
subsystem: editor
tags: [cross-tab, storage-event, merge-write, playwright]
status: complete
requires:
  - phase: 08-02
    provides: flushSongs merge-write, _dirty / _deleted, renderActiveSong, __hoyunSongsReady
  - phase: 08-03
    provides: IME-safe editor (no change needed here)
provides:
  - "js/songs.js: storage listener, isEditingField, _pendingExternal, _applyExternalSongs, sortedSongs, cutName"
  - "tests/helpers.mjs: exported openTwoTabs(browser, storage)"
  - "tests/songs-crosstab.spec.mjs: 8 specs titled 多分頁："
affects: [08-05, 08-07, 08-08]
actuals:
  tokens: 9000
  tasks: 2
  commits: 2
plan_head_before: f3cfabb45c7876977b7141e60e1f79d14773bafb
plan_head_after: 75414978917d2ff1736f09afcb8b467d286b4374
commits: 2
tech-stack:
  added: []
  patterns: ["external change = re-read lh:songs through lhGetJSON + lhSongsOk, never the event payload", "defer re-render until focusout leaves the editor (setTimeout 0 then re-check)"]
key-files:
  created: [tests/songs-crosstab.spec.mjs]
  modified: [js/songs.js, tests/helpers.mjs]
key-decisions:
  - "Storage events are ignored until initSongs has run (activeSongId still null): songsMode defaults to 'v2' in state.js, so without this guard a tab that was still booting treated another tab's first write as 'my song was deleted' and toasted"
  - "Unreadable lh:songs relies on the lhGetJSON warning (one [好韻器] line); an extra lhWarn is added only when the key was removed or emptied (lhGetJSON is silent there), so there is never a double warning"
  - "Deleted-elsewhere neighbour is chosen from the OLD sortedSongs order: first surviving song after the current one, else first surviving before it, else the first of the new list"
  - "A deleted-elsewhere switch also writes lh:activeSong so the tab's own current song survives a reload"
requirements-completed: [EDIT-01, EDIT-04]
duration: 14 min
completed: 2026-10-11
---

# Phase 8 Plan 04: Cross-tab sync Summary

A song saved in one tab now reloads the other tab's editor with a 4 s toast, but only after that tab's focus leaves the editor; two tabs editing different songs keep each other's edits, and a song deleted elsewhere hands over to its neighbour.

## Accomplishments

- js/songs.js: `isEditingField()` (document.hasFocus and activeElement inside `#lyricsSections`, `#contextDescription` or `.song-name-input`), `sortedSongs()` (createdAt descending, ties by id), `cutName(name, n)` (code points plus 「…」), `_applyExternalSongs()` (flush own edits first, re-read lh:songs, normalise, keep or replace the active song, render, toast), window `storage` listener (only lh:songs or key null, only in v2 mode after boot), document `focusout` listener that applies the pending change once focus is outside the editor.
- Toasts: 「其他分頁更新了歌詞，已重新載入」 and 「其他分頁刪除了這首歌，已切換到「{歌名 cut to 16 + …}」」, 4000 ms, only in the receiving tab.
- Empty list from another tab produces one new 未命名歌曲 1 written back; invalid or removed lh:songs keeps the in-memory songs, one warning, no error.
- Tests: `openTwoTabs` helper (same shape as the storage.spec copy, which stays), 8 specs: 另一頁改了歌詞(R5), 各改不同的歌都留著, 同一首以最後存的為準, 別頁刪掉這首就換到旁邊那首, 全部被刪掉時補一首空白歌, 無關的鍵不會重新載入, 讀不出來的資料不影響畫面 (also covers `clear()` key-null event), 兩個分頁同時升級只有一首.

## RED evidence

R5 spec run on the 08-02 code (helper and spec only, before any songs.js change): failed at the final assertion, B's textarea still showed the old text (`夜色 & 微光<b>粗體</b>…`) instead of `A頁新寫的歌詞`. After the listener was added it passed together with scan.spec (10 passed). Task 2 specs were written against the Task 1 code: 5 passed and 3 failed on first run, all three traced to the boot-race guard (below) or to my own wrong expected string; no other product bug appeared.

## Commits

- d57a625 feat(08-04): other-tab song changes reload this tab after the editor loses focus (js/songs.js, tests/helpers.mjs, tests/songs-crosstab.spec.mjs)
- 7541497 feat(08-04): two tabs keep each other's songs; delete-elsewhere hands over to the neighbour (js/songs.js, tests/helpers.mjs, tests/songs-crosstab.spec.mjs)

Verification: `songs-crosstab + storage + scan` 47 passed; `npm test` 601 passed / 27 skipped / 0 failed (baseline 593 + 8 new). Crosstab file repeated 6x (48 runs) with no flake.

## Deviations from Plan

**1. [Rule 1 - Bug] Boot-race storage event treated as "song deleted"**
- **Found during:** Task 2 (R5 spec passed alone but the same-tick two-tab boot made a tab toast 「其他分頁刪除了這首歌」)
- **Issue:** `songsMode` defaults to `'v2'` in state.js, so a tab still before `initSongs` (activeSongId null) accepted another tab's first lh:songs write and switched to a "neighbour".
- **Fix:** listener also returns while `activeSongId === null`.
- **Files modified:** js/songs.js
- **Commit:** 7541497

**2. [Rule 3 - Blocking] Test helper needed a settle step**
- **Found during:** Task 2 (flaky toast assertions, about 30 percent of runs)
- **Issue:** with both tabs navigating in the same tick, the tab that boots first can still write lh:songs (normalisation or fresh migration timestamps differ), so the other tab legitimately toasts during boot.
- **Fix:** `openTwoTabs` polls lh:songs until it is unchanged for two 250 ms polls, then hides any boot toast. Production behaviour unchanged (a real second tab opened during the very first upgrade may show one harmless reload toast).
- **Files modified:** tests/helpers.mjs
- **Commit:** 7541497

**3. [Plan wording] No extra lhWarn on invalid data**
- The plan asked for an lhWarn when the re-read fails; `lhGetJSON` already warns once on corrupt data, so an additional one would produce two warnings. The extra warning is only emitted when the key was removed or emptied.

**Total deviations:** 2 auto-fixed, 1 wording adjustment. **Impact:** none on required behaviour.

## Autonomous decisions (for Andy's 自主決定 list)

- Accepted behaviour (RESEARCH Q4 step 6): if another tab deletes a song while this tab still holds unsaved edits of that same song, this tab's next flush puts the song back. A song deleted elsewhere with no pending edit here disappears normally. Same song edited in two tabs: last write wins.
- A tab whose whole window is unfocused counts as "not editing", so a background tab updates at once instead of staying stale.
- Moving focus between two editor fields never applies a pending reload.

## Known Stubs

None.

## Threat Flags

None. T-08-09 (merge-write plus flush-before-apply, spec 各改不同的歌都留著), T-08-10 (re-read through lhGetJSON + lhSongsOk, spec 讀不出來的資料不影響畫面), T-08-11 (focusout deferral, R5 spec and MutationObserver spec) are all covered.

## Self-Check: PASSED

- js/songs.js, tests/helpers.mjs, tests/songs-crosstab.spec.mjs present; commits d57a625 and 7541497 in `git log`.
- Acceptance greps: `addEventListener('storage'` 1, `function isEditingField` 1, `其他分頁更新了歌詞，已重新載入` 1, `export async function openTwoTabs` 1, `其他分頁刪除了這首歌，已切換到` 1, `function sortedSongs` 1, `function cutName` 1, `多分頁：各改不同的歌都留著` 1.
- `npm test`: 601 passed, 27 skipped, 0 failed. `?v=` untouched at 0.96.12.
