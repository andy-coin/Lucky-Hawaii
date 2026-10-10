---
phase: 08-songs-editor-model
plan: 05
subsystem: ui
tags: [song-list, push-column, overlay, rename, playwright, touch-targets]
status: complete
requires:
  - phase: 08-02
    provides: songs model, flushSongs, renderActiveSong, legacy mode
  - phase: 08-04
    provides: sortedSongs, cutName, isEditingField (already covers .song-name-input), openTwoTabs
provides:
  - "index.html: .lyrics-head (☰ 歌曲, #songCurrent, + 新增段落), .lyrics-layout, aside#songList, .lyrics-main"
  - "js/songs.js: renderSongHeader, renderSongList, _refreshSongUI, toggleSongList, closeSongListOverlay, switchSong, createSong, nextUntitledNumber, startRenameSong, list keyboard, breakpoint listener, migration toast"
  - "css/panels.css: header, song list, push column (--song-w), overlay, rename input, toast wrap"
  - "tests/songs-ui.spec.mjs: 22 specs titled 歌曲清單："
affects: [08-06, 08-07, 08-08, 08-09]
actuals:
  tokens: 14000
  tasks: 3
  commits: 3
plan_head_before: a186f2a25f633028e06cb881c757ddde6c24a118
plan_head_after: 5ac37ce3560367b0427f42b7f09679eeb7a38067
commits: 3
tech-stack:
  added: []
  patterns: ["one #songList element, push or overlay chosen by a (min-width: 1024px) MediaQueryList", "list DOM built with createElement/textContent/setAttribute, actions by data-song-id and document-level delegation", "switchSong updates aria-current in place so a double-click lands on the same button", "@starting-style for the overlay fade (no @keyframes)"]
key-files:
  created: [tests/songs-ui.spec.mjs]
  modified: [index.html, js/songs.js, js/panels.js, css/panels.css, css/responsive.css, tests/layout.spec.mjs, tests/songs-ime.spec.mjs, tests/visual.spec.mjs-snapshots/desktop-lyrics-darwin.png, tests/visual.spec.mjs-snapshots/phone-lyrics-darwin.png, tests/visual.spec.mjs-snapshots/tablet-lyrics-darwin.png]
key-decisions:
  - "D-02 instant push column: the left panel widens by --song-w (9rem) the moment the list opens, no sliding"
  - "D-06 double-click rename only in the push column; the pencil works everywhere"
  - "D-04 lh:songListOpen is read and written only at >= 1024; overlay and breakpoint changes never write it"
  - "New song number = largest existing 「未命名歌曲 N」 + 1, gaps are not refilled"
  - "Migration toast only when the migrated song has real lyric text (a first-time visitor with nothing to migrate is not told about 「原本的歌詞」)"
  - "Row-level dblclick: after the first click the active row grows a second line of actions, so the second click often lands on the actions area; the handler accepts any non-button part of the row"
requirements-completed: [EDIT-04]
duration: 22 min
completed: 2026-10-11
---

# Phase 8 Plan 05: Song list (EDIT-04) Summary

☰ 歌曲 in a new lyrics header opens a list of every song (push column on desktop, overlay on phone, tablet and 901–1023), with new song, switch, rename (pencil, double-click, F2, new-song-rename), keyboard, per-song tags and 情境, and a one-time migration toast.

## Accomplishments

- Header: one wrapping row `.lyrics-head`: ☰ 歌曲 (aria-expanded / aria-controls / aria-label), current title (ellipsis, title attribute), + 新增段落 (inline style removed). The 📝 歌詞 caption is gone; the edge tab still reads 歌詞.
- List: `aside#songList` (hidden + inert when closed), caption 歌曲（N）, ＋ 新增歌曲, rows from `sortedSongs()`, one-song hint only when N = 1, exactly one `aria-current="true"` row with accent stripe and bold name.
- Push column (≥ 1024): `body.songs-open` sets `--song-w: 9rem`; left panel widens by exactly 144px, `#lyricsSections` width unchanged, container never intersected. `syncCenterPanel` now measures the real left and right widths (the old check used the left width twice) and closes the overlay list whenever the left panel is collapsed.
- Overlay (≤ 1023): absolute inside `.lyrics-layout`, never covers `.lyrics-head`, fades in with `@starting-style` (no `@keyframes`), `transition: none` under reduced motion, starts closed on reload, never writes `lh:songListOpen`.
- Rename: pencil (every row in overlay, active row only in push), double-click and F2, `maxlength 60` plus a code-point cut on commit, Enter or blur saves, Esc cancels without closing the list, whitespace reverts silently, composing Enter ignored; `#songCurrent` only changes for the active song. A new song goes straight into rename with the text selected; overlay mode then closes the list and focuses ☰ 歌曲, never a textarea.
- Keyboard: Up / Down roving between names, Enter switches, F2 renames, Esc closes the list and returns focus to ☰ 歌曲.
- Numbering and order: next 「未命名歌曲 N」 is max N + 1; same titles are separate songs; order is createdAt descending with ties by id and does not change on switch or rename.
- Toast: `.copy-toast` wraps (`width: max-content; max-width: min(92vw, 28rem); text-align: center; line-height: 1.5`); the migration toast (6000 ms) shows once, only in the tab that migrated.
- Touch floors and input floor: `.song-toggle`, `.lyrics-head .panel-add-btn`, `.song-new-btn`, `.song-pick`, `.song-name-input` get `min-height: var(--hit)`, `.song-act` is `var(--hit)` square, `.song-name-input` joins the `max(16px, 1rem)` list.

## RED evidence

- Task 1: `songs-ui.spec.mjs` with two specs against the 08-04 code: 2 failed (no `#songListToggle`, no toast element).
- Task 2: nine new specs against the Task 1 code: 7 failed, 4 passed. The passing ones were 編號與同名 and 每首歌各自的標籤與情境 (already true from the model) plus the two Task 1 specs. Failures: 改名, 改名的邊界, 改別首的名字, 新歌直接改名, 排序穩定, 鍵盤, AI 讀目前這首.
- Task 3: the layout specs were written after the code (22 specs total now); the first run had 1 failing spec (a measurement taken mid fade, test bug) and the two real defects below were found by the Task 2 run.

## Commits

- a5f3dd2 feat(08-05): song list opens from the lyrics header, new song, switch, one-time migration toast
- 39a4d39 feat(08-05): rename (pencil, double-click, F2), new-song rename, list keyboard, per-song tags and AI context
- 5ac37ce feat(08-05): song list keeps working across widths, scales and orientation; darwin lyrics baselines refreshed

Verification: Task 1 verify 29 passed; Task 2 verify (songs-ui, smoke, layout) 95 passed; Task 3 verify (songs-ui, layout, style) 114 passed, 22 specs titled 歌曲清單：; final `npm test` 623 passed / 27 skipped / 0 failed (baseline 601 plus 22 new).

## Screenshot baselines

Refreshed only `-darwin`: `desktop-lyrics-darwin.png`, `phone-lyrics-darwin.png`, `tablet-lyrics-darwin.png` (diff viewed first: only the header row changed, plus the lyrics area being a little shorter below it). Desktop and tablet were inside the 1 percent tolerance, so I refreshed all three lyrics baselines with `--update-snapshots=all -g lyrics` so the three stay consistent. **The `-linux.png` baselines were not touched and need a refresh in the cloud container.**

## Deviations from Plan

**1. [Rule 3 - Blocking] panels.js change done in Task 2, not Task 3**
- **Found during:** Task 2 (AI spec): with the list open the old both-panels check (`2 * leftWidth`) collapsed the right panel, so AI 建議 could not be clicked.
- **Fix:** moved the Task 3 step 1 `syncCenterPanel` change (real left and right widths, `closeSongListOverlay()` on collapse) into the Task 2 commit.
- **Files:** js/panels.js. **Commit:** 39a4d39

**2. [Rule 1 - Bug] layout.spec used `#leftPanel .panel-add-btn` (strict mode)**
- **Issue:** ＋ 新增歌曲 is a second `.panel-add-btn` in `#leftPanel`, so two layout specs (and the 六段歌詞 one) hit a strict-mode violation.
- **Fix:** the selector is now `#leftPanel .lyrics-head .panel-add-btn` (3 uses in tests/layout.spec.mjs). Meaning unchanged.
- **Commit:** 39a4d39

**3. [Rule 1 - Bug] Migration toast shown to first-time visitors**
- **Found during:** Task 3 (phone screenshots of unrelated states changed).
- **Issue:** `__lhMigrated` is true for a brand-new profile too, so every new visitor was told 「你原本的歌詞已整理成…」 and the 6 s toast sat in the screenshots.
- **Fix:** the toast also requires the migrated song to contain lyric text. The upgrade spec (FIXTURE has lyrics) still proves the copy and the once-only rule.
- **Commit:** 5ac37ce

**4. [Rule 1 - Bug] Double-click rename missed its target**
- **Found during:** Task 2 (改名 spec).
- **Issue:** first click re-rendered the list and the active row grew a second action line, so the second click usually hit `.song-actions`, not the name.
- **Fix:** `switchSong` updates `aria-current` / tabindex in place, and the dblclick handler works on the whole row (excluding the buttons and the input).
- **Commit:** 39a4d39

**5. [Rule 3 - Blocking] songs-ime spec saw the migration toast**
- **Issue:** 組字：不重畫也不跳游標 asserts no toast while typing; the migration toast is now visible after a FIXTURE boot.
- **Fix:** the spec hides the toast first (same trick `openTwoTabs` uses). **Commit:** 39a4d39

**6. [Plan wording] Task 1 did not include new-song rename**
- The first spec in Task 1 does not rename; the rename flow (D-07) arrives in Task 2 as planned, and the first spec presses Enter once in the rename input after that.

**7. [Plan wording] AI spec uses the real word list**
- With the 12-word stub there are fewer candidates than the target, so the code takes the word-invention path, whose prompt never carries lyrics. The spec runs on the real wordlist so the ranking prompt (with lyrics, #tags, 情境) is the one measured. No code change.

**Total deviations:** 5 auto-fixed (3 bugs, 2 blocking) and 2 wording notes. **Impact:** none on required behaviour.

## Autonomous decisions (for Andy's 自主決定 list)

- D-02: the push column appears instantly (no sliding) instead of CONTEXT C1 「滑出」.
- D-06: double-click rename only in the push column; the pencil works everywhere.
- D-04: `lh:songListOpen` is only read and written at ≥ 1024. The overlay and crossing a breakpoint never write it; returning to desktop width re-opens the list when the saved value is `true`.
- Numbering: next number is the largest 「未命名歌曲 N」 plus 1 (a deleted number below the max is not reused).
- Migration toast only when there was lyric text to migrate (see deviation 3).
- Pressing Esc inside the list closes it in push mode too, and that writes `lh:songListOpen = false` (same as clicking ☰).
- Hovering the song actions: the 🗑 button is not part of this plan (08-08).

## Known Stubs

None.

## Threat Flags

None. T-08-12 (names only via createElement / textContent / .value / setAttribute; `grep -v '^\s*//' js/songs.js | grep -c innerHTML` = 0), T-08-13 (switchSong and createSong flush first; spec 每首歌各自的標籤與情境 and 多分頁 specs cover reload), T-08-14 (maxlength 60 plus code-point cut, spec 改名的邊界) are covered. A song name with markup is exercised in the 08-09 cross-surface audit.

## Self-Check: PASSED

- Files present: tests/songs-ui.spec.mjs, index.html (`id="songListToggle"` 1, `onclick="createSong()"` 1), js/songs.js, css/panels.css, css/responsive.css.
- Commits a5f3dd2, 39a4d39, 5ac37ce in `git log`.
- Task 1 greps: renderSongList 1, switchSong 1, migration copy 1, lh:songListOpen 2, innerHTML 0, song-w in panels.css 4.
- Task 2 greps: startRenameSong 1, nextUntitledNumber 1, song-name-input in responsive.css 2, 歌曲清單：AI 讀目前這首 1.
- Task 3 greps: closeSongListOverlay in panels.js 1, `min-width: 1024px` in songs.js 1, prefers-reduced-motion in responsive.css 1, `git status --porcelain -- tests/visual.spec.mjs-snapshots` lists only `-darwin.png` files.
- `npm test`: 623 passed, 27 skipped, 0 failed. `?v=` untouched at 0.96.12.
