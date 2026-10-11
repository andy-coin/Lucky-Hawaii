---
phase: 08-songs-editor-model
verified: 2026-10-11T00:00:00Z
status: human_needed
score: 13/13 must-have groups verified (4 ROADMAP success criteria + 9 plans); 8/8 backstop items have a wired, passing held-out test (2 of them only up to what Chromium can show, see human items)
covered_files:
  - css/base.css
  - css/panels.css
  - css/print.css
  - css/responsive.css
  - index.html
  - js/ai-generate.js
  - js/dict.js
  - js/init.js
  - js/lyrics.js
  - js/panels.js
  - js/safety.js
  - js/song-io.js
  - js/songs.js
  - js/state.js
  - js/ui-common.js
  - tests/helpers.mjs
  - tests/songs-audit.spec.mjs
  - tests/songs-backup.spec.mjs
  - tests/songs-crosstab.spec.mjs
  - tests/songs-delete.spec.mjs
  - tests/songs-export.spec.mjs
  - tests/songs-ime.spec.mjs
  - tests/songs-journey.spec.mjs
  - tests/songs-migrate.spec.mjs
  - tests/songs-model.spec.mjs
  - tests/songs-ui.spec.mjs
covered_digest: "v2:sha256:037b554f4ca8b491f483ebe2b84fc0face848ded031daf4a898b35482e4ee99f"
behavior_unverified: 0
overrides_applied: 0
gaps: []
human_verification:
  - test: "真機注音輸入法組字：在 macOS 注音、iOS 注音、Android 注音鍵盤各打一段歌詞（含選字、游標移到句中再插入）、#標籤彈窗、段落名稱改名、情境欄"
    expected: "組字過程不卡、不跳游標、不重畫；按確認後約 0.4 秒內字就存進去（重新整理還在）；#標籤彈窗與改名中按選字用的 Enter 不會提早送出"
    why_human: "ROADMAP Human check。自動測試用 Chromium 的 CDP Input.imeSetComposition 模擬組字，跟真的 IME（尤其 iOS／Android）事件順序不完全一樣，只有真機看得出手感"
  - test: "匯出 PDF：選「匯出 -> PDF」，在列印視窗選「儲存為 PDF」，看短歌、200 行長歌、很長的段落名稱，再切到深色主題重做一次"
    expected: "黑字白底、歌名與段落名清楚、短段落不被切在兩頁、段落名不孤零零留在頁尾、沒有橫向被切、版面好看"
    why_human: "ROADMAP Human check。自動測試只確認列印頁存在、黑字白底、page.pdf() 有 %PDF- 開頭且 200 行比 20 行大、沒有橫向溢出；「好不好看」與換頁品質（08-06 的長歌 backstop）不能用程式判斷"
  - test: "手機實機（iPhone Safari、Android Chrome）：下載 TXT／Markdown／備份 JSON、複製整首、PDF 列印、改名時鍵盤彈出、刪除視窗與匯入視窗在鍵盤出現時"
    expected: "檔案真的存得下來且內容對、剪貼簿有整首、鍵盤不蓋住改名輸入框與送出鈕、分頁列在鍵盤出現時藏起來"
    why_human: "iOS 的下載、列印、剪貼簿與真鍵盤行為 Chromium 沒有；08-08 的鍵盤 backstop 只用縮小視窗 336px 模擬"
  - test: "換裝置還原：在一台裝置「備份全部」，另一台（或乾淨的瀏覽器設定檔）「匯入備份 -> 全部還原」，也試一次「只加入歌曲」"
    expected: "所有歌曲、目前這首、保留池、主題／輸入模式／模型／詞庫包、字庫覆寫都回來；金鑰不會跟著備份（需重新填）；還原前資料有自動備份"
    why_human: "ROADMAP 第 4 條的自動測試用同一台機器上的兩個乾淨瀏覽器環境；真的跨裝置（不同瀏覽器、不同系統）只有人能做"
  - test: "確認 Andy 是否接受自主決定：UI-SPEC D-02／D-06 覆寫 CONTEXT C1／C3、F6 列印範圍只在 PDF 流程（平常 Cmd+P 印整個頁面）、只加入歌曲保留原 createdAt、全部還原會移除備份檔裡沒有的設定、備份不含金鑰、ponytail 式簡化（見 08-0x SUMMARY 與驗收清單 5-69..5-90）"
    expected: "1.是 2.否（若否，需要回頭調整對應行為）"
    why_human: "這些決定覆寫了 CONTEXT 或計畫的字面條文；依專案「灰色地帶自主決定、事後讓 Andy 否決」規則，需 Andy 點頭才算定案"
  - test: "在雲端環境跑 npm run visual:update 更新過期的 -linux.png 截圖基準，再跑 npm test"
    expected: "視覺測試在 Linux 基準下全過"
    why_human: "這台 Mac 不能產生 Linux 基準圖；屬環境項目，不是程式缺口（darwin 基準在本機全過）"
---

# Phase 8: 歌詞資料模型、多首歌、匯出與備份 Verification Report

**Phase Goal:** 歌詞改以資料模型為準，打字（含注音組字）不再被打斷；可以像 Google Docs 一樣用側邊分頁管理多首歌，並匯出、備份、換裝置還原。
**Verified:** 2026-10-11
**Status:** human_needed
**Re-verification:** No, initial verification
**Mode:** mvp (the ROADMAP goal is not in User Story form; `user-story.validate` returns false, same as Phases 6 and 7. Verified against the stated goal and the four success criteria.)

## Verdict

No code gaps. Every ROADMAP success criterion has an implemented path that I read in the code, and a passing test that exercises it. I ran the full suite myself: `npx playwright test` gave 716 passed, 27 skipped, 0 failed (743 total, 2.1 min). The 27 skips are the perf, parity and golden-update modes (opt-in by environment variable), none of them Phase 8 specs. The remaining items are what the task brief already names as human or environment work: real IME feel, PDF look, iOS download/print/clipboard, true cross-device restore, the stale `-linux.png` baselines, and Andy's sign-off on recorded autonomous decisions.

The fingerprint tool (`verification fingerprint`) refuses the combined list when the phase's PLAN/SUMMARY files are included (each file passes alone, the combined call errors out), so `covered_digest` covers the 15 implementation files plus 11 test files. The PLAN and SUMMARY files are not in the digest.

## Goal Achievement

### ROADMAP Success Criteria

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Typing Zhuyin and moving the caret is not interrupted by re-rendering or caret jumps | VERIFIED (real-IME feel is a human item) | `js/lyrics.js:273-306`: `input` only calls `syncFromField` (writes `sec.text` into the model, never writes `.value` back); `compositionstart` sets `_lhComposing` and clears the save timer; `compositionend` syncs and flushes; `focusout` flushes. `js/songs.js:77` `flushSongs` returns early while composing (only pagehide / visibilitychange force it). `renderLyricsSections` (`lyrics.js:214`) is only called from add/remove/reorder/song-switch/external-apply paths, never from typing; `_applyExternalSongs` is held back while `isEditingField()`. `tests/songs-ime.spec.mjs` (9 tests, CDP `Input.imeSetComposition` + `Input.insertText`): zero storage writes during composition, saved within 400 ms after commit, MutationObserver on `#leftPanel` records zero childList mutations, caret and textarea node unchanged, Enter during composition does not add a tag or leave label edit, tab close and background switch do not lose text. All pass in my run. |
| 2 | Side tabs show/hide; add, switch, delete, rename; v0.96 single-song user's lyrics become song 1, nothing lost | VERIFIED | `index.html:340-346` `#songListToggle` (aria-expanded/controls) and `aside#songList` (hidden, inert when closed). `js/songs.js` has `toggleSongList`, `createSong`, `switchSong`, `startRenameSong`, `confirmDeleteSong`. Migration `js/safety.js:380-430`: 1→2 step writes only `lh:songs` and `lh:activeSong`, fixed id `song-migrated`, title 我的第一首歌, idempotent, legacy `haiku_*` keys untouched, preceded by a `pre-schema-2` backup. Delete stores an automatic backup first and aborts if it cannot (`songs.js:615-640`), never leaves 0 songs. `songs-migrate.spec.mjs` (9): byte-for-byte text incl. `&` and `<b>`, three reboots give one song, interrupted migration converges, two tabs at once give one song, empty/corrupt legacy lyrics, write-failure rollback, backup-failure blocks upgrade. `songs-ui.spec.mjs` (22), `songs-delete.spec.mjs` (18), `songs-crosstab.spec.mjs` (8), `songs-journey.spec.mjs` (v0.96 upgrade through backup restore) all pass. |
| 3 | One song exports as TXT (default), PDF, Markdown; one-tap copy of the whole song | VERIFIED (PDF look is a human item) | `js/song-io.js:5-112`: `songToTxt`, `songToMd` (heading and line escaping, two-space hard breaks), `downloadText` (Blob URL on a body-attached anchor, revoked after 10 s), `copySongText` (clipboard with legacy fallback, byte-identical to the TXT), `printSong` (hidden `#printSheet`, `textContent` only, `body.print-song` scoped by `css/print.css`, cleared on `afterprint`), blank-song guard. `songs-export.spec.mjs` (17) checks file name, content, toasts, clipboard rejection fallback, empty song, emulated print media (black on white, dark theme too, only title and sections visible), ordinary printing unaffected, `page.pdf()` returns `%PDF-`, no network and no other-song data in output, hostile titles. All pass. |
| 4 | Export JSON backup (all songs + settings), import in a clean browser and get a full restore | VERIFIED (true cross-device is a human item) | `js/safety.js:635-760`: `lhBuildBackup` (format `lucky-hawaii-backup`, version 2, songs, activeSong, savedWords, registered settings incl. `dictOverrides_v076`, no `apiKey_*`, no admin key), `lhParseBackup` (normalises hostile files, caps, id regex, `dictOverrides` allow-list per CR-01), `lhApplyBackupReplace` (automatic backup first, nothing written if it fails, rollback on partial failure, honest `rollback` stage). `js/song-io.js:179-390` export, import summary dialog, add-only and replace-all flows. `songs-backup.spec.mjs` (27): clean-context full restore equals source, file format, add-only with id/title collisions, v1 file as a new song, bad / hostile / oversize files change nothing, mid-write failure rolls back, backup-failure writes nothing, save latch during restore, broken-rollback honesty. All pass. |

### Plan-level must-haves (all PLAN `must_haves.truths`, including lifted edge-coverage and UI-consideration items)

| Plan | Requirements | Status | Evidence (all backed by named, passing specs) |
|------|--------------|--------|------------------------------------------------|
| 08-01 migration | EDIT-04 | VERIFIED | `songs-migrate.spec.mjs`, `storage.spec.mjs` registry of 21 keys; prohibition on touching `haiku_lyrics`/`haiku_hashtags` enforced in the step body (writes only `lh:songs`/`lh:activeSong` via `guard`) and by the byte-identity assertions; every local `?v=` tag reads 0.96.12 (30 of 30). |
| 08-02 model-first editor | EDIT-01, EDIT-04 | VERIFIED | `songs-model.spec.mjs` (27): DOM tampering is never written back, ids not indexes, literal rendering of `</textarea><img>` and `<b>`, old keys not written, legacy single-song fallback, console never holds lyrics, per-song tags and 情境, 情境 result goes to the song captured before the request. No `innerHTML` in `songs.js`/`song-io.js`/`lyrics.js` (static scan in `songs-audit.spec.mjs`). Prohibition on console text: `lhWarn` calls in `songs.js` pass tag strings and error objects only. |
| 08-03 IME safety | EDIT-01 | VERIFIED | `songs-ime.spec.mjs`; saved-words and tag chips built with DOM nodes (literal `<img onerror>` stays text). |
| 08-04 multi-tab | EDIT-01, EDIT-04 | VERIFIED | `songs-crosstab.spec.mjs`: reload toast only in receiving tab, deferred while editing, merge-on-write keeps both tabs' edits, delete-by-other-tab switches to neighbour, unrelated keys ignored. |
| 08-05 song list UI | EDIT-04 | VERIFIED | `songs-ui.spec.mjs`, `songs-audit.spec.mjs` (long names, touch targets, focus, non-colour cues, three themes, no new colour constants, accessible names). |
| 08-06 export | EDIT-08 | VERIFIED | `songs-export.spec.mjs`; prohibition (only title, labels, text; no network) asserted by "不連網路，也只匯出這首歌". `print.css` at media=print and `song-io.js` loaded after `lyrics.js`, both with `?v=0.96.12`. |
| 08-07 backup / restore | EDIT-09 | VERIFIED | `songs-backup.spec.mjs`; prohibitions: no `apiKey_*` or admin key in the file or written on import, and no replace without a prior automatic backup, are both asserted ("備份存不下就不動", "被動過手腳的檔案"). |
| 08-08 delete + auto-backup restore | EDIT-04, EDIT-09 | VERIFIED | `songs-delete.spec.mjs`; prohibition "never delete without the backup stored first" asserted by "備份失敗就不刪". Pinned backups (`baseline`, `pre-schema-*`) never evicted; restore also restores `lh:schema`. |
| 08-09 whole-phase journey | EDIT-01, EDIT-04, EDIT-08, EDIT-09 | VERIFIED | `songs-journey.spec.mjs` (v0.96 upgrade to restore on a clean browser), `songs-audit.spec.mjs`, cross-surface checks. |

### Backstop items (explicit evidence required)

| Backstop | Wired held-out test | Result |
|----------|--------------------|--------|
| Restore write failure shows error view, banner, storage equals pre-import snapshot | `songs-backup.spec.mjs` 「寫到一半失敗會退回」, 「連退回也失敗…如實說」 | passed |
| `lhBackup` throws on delete, dialog stays, song survives | `songs-delete.spec.mjs` 「備份失敗就不刪」 | passed |
| Push column vs viewport at 1024×768, 1180×820, 1440×900 | `songs-ui.spec.mjs` 「兩邊面板都開」 | passed |
| Reduced motion on overlay list | `songs-ui.spec.mjs` 「減少動態」 (transition ≤ 0.01 s, animation none) | passed |
| 150% labels on delete and import dialogs | `songs-delete.spec.mjs` 「放大 150% 按鈕不擠」 | passed |
| Keyboard-safe rename input and delete dialog (336 px shrink) | `songs-delete.spec.mjs` 「手機鍵盤」 | passed in emulation; real iOS keyboard is a human item |
| 200-line print: no horizontal clipping, PDF generated | `songs-export.spec.mjs` 「長歌列印」 | passed for overflow and PDF generation; page-break quality and "labels not stranded" are CSS-only (`break-after: avoid`, `break-inside: avoid` for sections of 12 lines or fewer) with no automatic proof, so routed to the PDF human item |

### Requirements Coverage

| Requirement | Source plans | Status | Evidence |
|-------------|--------------|--------|----------|
| EDIT-01 | 08-02, 08-03, 08-04, 08-09 | SATISFIED | Criterion 1 evidence above |
| EDIT-04 | 08-01, 08-02, 08-04, 08-05, 08-08, 08-09 | SATISFIED | Criterion 2 evidence above |
| EDIT-08 | 08-06, 08-09 | SATISFIED | Criterion 3 evidence above |
| EDIT-09 | 08-07, 08-08, 08-09 | SATISFIED | Criterion 4 evidence above |

REQUIREMENTS.md maps exactly EDIT-01, EDIT-04, EDIT-08 and EDIT-09 to Phase 8 (all marked Complete), and every one is claimed by at least one PLAN. No orphaned requirement IDs.

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `js/safety.js:740` | Stale `ponytail:` comment says the editor must still be changed to await `__hoyunSafetyReady` | Info | Already done: `js/ui-common.js:106` runs `initSongs` after `__hoyunSafetyReady`. Only the comment is out of date. No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK` in any Phase 8 source file (grep run) |
| `js/lyrics.js` `renderLyricsSections` | `header.setAttribute('onclick', ...)` inline handlers | Info | Indexes only, no user text in the attribute strings; same pattern as the pre-phase code, intentionally kept for layout tests |

### Advisory (carried forward, not blocking)

From `08-REVIEW.md`, deliberately not fixed in `08-REVIEW-FIX.md` and left as Info:
- IN-03 legacy mode and v2 mode can drift apart across tabs.
- IN-04 Markdown export escapes only a leading `# > * + -` or `N.` (lines starting with other Markdown syntax such as backticks or tables are not escaped).
- IN-05 add-only import de-duplicates titles only against existing songs, not among the incoming ones.
- IN-06 an empty section label shows 歌詞/新段落 on screen but exports as 段落 n.

CR-01 and WR-01..WR-12, plus IN-01, IN-02, IN-07..IN-10, were fixed with regression specs (commits 8cba3ed through 93afda4), and the suite that includes those specs passes.

## Human Verification Required

See the frontmatter `human_verification` list (6 items): real-device Zhuyin IME (ROADMAP Human check), PDF layout and page breaks (ROADMAP Human check), iOS/Android download, print, clipboard and keyboard, true cross-device restore, Andy's sign-off on the autonomous decisions, and the Linux screenshot baselines.

## Gaps Summary

None. Every success criterion and every plan-level truth is backed by code I read and a spec I ran. The status is `human_needed` only because the ROADMAP lists a Human check and several items cannot be proven in Chromium on macOS.

---

_Verified: 2026-10-11_
_Verifier: Claude (gsd-verifier)_
