---
phase: 08-songs-editor-model
plan: 06
subsystem: ui
tags: [export, txt, markdown, print-pdf, clipboard, menu, playwright]
status: complete
requires:
  - phase: 08-05
    provides: .lyrics-head header row, curSong / flushSongs / cutName, songs model
provides:
  - "js/song-io.js: songExportSections, songToTxt, songToMd, safeFileName, downloadText, copySongText, printSong, exportSongAs, toggleExportMenu, closeExportMenu, menu keyboard"
  - "css/print.css: print sheet scoped to body.print-song (only file allowed #000 / #fff)"
  - "index.html: ⬇ 匯出 (#exportToggle), #exportMenu, #printSheet, js/song-io.js and css/print.css tags"
  - "js/ui-common.js: fallbackCopy returns a boolean, selects on iOS, always removes its textarea"
  - "tests/songs-export.spec.mjs: 17 specs titled 匯出："
affects: [08-07, 08-08, 08-09]
actuals:
  tokens: 9900
  tasks: 3
  commits: 3
plan_head_before: 34056427389508ed80f4dca75fe00cd2d3c52322
plan_head_after: b719641192b3638db0a35b4438d573495c2314d8
commits: 3
tech-stack:
  added: []
  patterns: ["export strings built from the model only (curSong), never from the screen", "PDF = hidden #printSheet filled with textContent + body.print-song + window.print(), cleared on afterprint", "Blob URL on an anchor appended to body, revoked 10 s later, no prompt", "menu on .word-ctx-menu + lhPlaceMenu with flip-above"]
key-files:
  created: [js/song-io.js, css/print.css, tests/songs-export.spec.mjs]
  modified: [index.html, js/ui-common.js, css/panels.css, css/responsive.css, tests/split-tags.spec.mjs, tests/style.spec.mjs, tests/songs-ui.spec.mjs, tests/visual.spec.mjs-snapshots/desktop-lyrics-darwin.png, tests/visual.spec.mjs-snapshots/phone-lyrics-darwin.png, tests/visual.spec.mjs-snapshots/tablet-lyrics-darwin.png]
key-decisions:
  - "F6: print rules apply only while body has print-song, so a normal Cmd/Ctrl+P still prints the page (UI-SPEC D-12 said every body child hidden unconditionally)"
  - "Menu hint and toast show the safe file name (我的_歌_1) cut to 16 characters, so the text matches what is actually downloaded"
  - "A single afterprint listener registered at load clears the sheet and the class (no per-print one-shot listeners piling up)"
  - "Print colours are forced to #000 / #fff on body, #printSheet and every descendant, with body transition disabled so a computed-style check never sees a mid-fade colour"
  - "style.spec colour scan: files that did not exist at 078c5d1 contribute no historical allowances, #000 / #fff are accepted only in css/print.css (self-check proves another file still fails)"
requirements-completed: [EDIT-08]
duration: 22 min
completed: 2026-10-11
coverage:
  - deliverable: "TXT download named after the song, exact layout, UTF-8 no BOM"
    verification:
      - { kind: test, ref: "tests/songs-export.spec.mjs#匯出：下載 TXT", status: pass }
    human_judgment: false
  - deliverable: "Markdown download with hard breaks and escaped line starts"
    verification:
      - { kind: test, ref: "tests/songs-export.spec.mjs#匯出：Markdown", status: pass }
      - { kind: test, ref: "tests/songs-export.spec.mjs#匯出：Markdown 跳脫會變成標記的行", status: pass }
    human_judgment: false
  - deliverable: "複製整首 (clipboard, legacy fallback, failure toast)"
    verification:
      - { kind: test, ref: "tests/songs-export.spec.mjs#匯出：複製整首", status: pass }
      - { kind: test, ref: "tests/songs-export.spec.mjs#匯出：剪貼簿退回舊方法", status: pass }
    human_judgment: false
  - deliverable: "Blank songs export nothing; no network; only the active song's content"
    verification:
      - { kind: test, ref: "tests/songs-export.spec.mjs#匯出：空白歌不匯出", status: pass }
      - { kind: test, ref: "tests/songs-export.spec.mjs#匯出：不連網路，也只匯出這首歌", status: pass }
      - { kind: test, ref: "tests/songs-export.spec.mjs#匯出：歌名有標記也只當文字", status: pass }
    human_judgment: false
  - deliverable: "PDF print sheet (black on white, scoped to the PDF flow, dark theme, normal printing untouched)"
    verification:
      - { kind: test, ref: "tests/songs-export.spec.mjs#匯出：PDF 列印頁", status: pass }
      - { kind: test, ref: "tests/songs-export.spec.mjs#匯出：平常列印不受影響", status: pass }
      - { kind: test, ref: "tests/songs-export.spec.mjs#匯出：深色主題也印黑字白底", status: pass }
    human_judgment: false
  - deliverable: "Export menu keyboard, flip above, dialog interplay, header at 150%, touch floors"
    verification:
      - { kind: test, ref: "tests/songs-export.spec.mjs#匯出：選單鍵盤", status: pass }
      - { kind: test, ref: "tests/songs-export.spec.mjs#匯出：標題列在手機放大也放得下", status: pass }
      - { kind: test, ref: "tests/songs-export.spec.mjs#匯出：觸控目標", status: pass }
    human_judgment: false
  - deliverable: "PDF page layout beauty on a long song, iOS download file names and Home-Screen printing"
    human_judgment: true
    rationale: "No PDF text extraction tool is installed; the long-song test only proves a valid %PDF- with more bytes and no horizontal overflow. Page breaks, stranded labels and iOS behaviour need eyes on a real PDF / device (08-UAT)."
---

# Phase 8 Plan 06: Export (EDIT-08) Summary

⬇ 匯出 in the lyrics header opens a keyboard- and touch-friendly menu that downloads the active song as TXT or Markdown, prints it to PDF through a black-on-white print sheet, or copies the TXT to the clipboard, all built from the model, skipping blank sections, never touching the network.

## Accomplishments

- **Builders** (`js/song-io.js`, no DOM): blank sections skipped, empty labels become 「段落 n」 (n counts exported sections), `\r\n` normalised, TXT = title + blank line + 「[段落名]」 blocks + one trailing `\n`; Markdown = `# 歌名`, `## 段落名`, lines joined by two spaces + `\n`, a leading backslash on lines starting with `#`, `>`, `-`, `*`, `+` or `digits.`; `safeFileName` replaces `\ / : * ? " < > |` and control characters with `_`, falls back to 未命名歌曲.
- **Download**: Blob with the right type, anchor appended to `body`, revoked after 10 s, no prompt. Toasts 已匯出「…」 for 2400 ms with the name cut to 16 characters.
- **Copy**: `navigator.clipboard.writeText` called synchronously in the click; on rejection or no API, `fallbackCopy` (now readOnly, `setSelectionRange`, try/catch with `lhWarn`, textarea always removed, returns the boolean). Copied text equals the downloaded TXT byte for byte.
- **Print**: `printSong` fills `#printSheet` (`h1.print-title`, `section.print-section > h2.print-label + p.print-text`, all `textContent`), adds `body.print-song`, toasts for 3000 ms, calls `window.print()`; one `afterprint` listener empties the sheet and removes the class. `css/print.css` hides every other body child only under `body.print-song`, forces `#000` / `#fff`, A4 with 20mm / 16mm margins, 20 / 12 / 14 pt scale, `break-after: avoid` on labels, `break-inside: avoid` on sections up to 12 lines.
- **Menu**: `#exportMenu` on `.word-ctx-menu` (role menu / menuitem), placed with `lhPlaceMenu`, flips above the button when the clamp would cover it, closes on outside pointerdown, Esc (focus back to ⬇ 匯出, ignored while composing), after choosing an item, and refuses to open while a `.feedback-modal-overlay.show` is up. Keyboard open focuses the first item, pointer open focuses nothing; ArrowUp / ArrowDown wrap.
- **Touch and layout**: `.export-toggle` shares the `.song-toggle` look and the 44px floor; `.export-item` is covered by the existing `.word-ctx-item` floor. At 390×844, scale 100 and 150, with a 60-character title all four header controls stay inside the panel with no overlap.
- **Empty song**: every section blank gives 「這首歌還沒有歌詞可以匯出」 for all four items; no download, no `window.print`, clipboard untouched.

## RED evidence

- Task 1: `匯出：下載 TXT` against the 08-05 code: failed (`#exportToggle` does not exist, test timed out waiting for it).
- Task 2: 10 new specs against the Task 1 code: 9 failed (no Markdown / PDF / copy items), 1 passed (平常列印不受影響, already true because no print rule existed; it is the guard for F6).
- Task 3: the specs were written after the code (the Task 2 handler already included the dialog guard); the two failures seen on first run were test bugs (see deviations 3 and 4).
- RED and GREEN went in one commit per task, as the plan's per-task commit rule asks, not as separate `test(...)` commits.

## Commits

- de8a238 feat(08-06): export menu and TXT download named after the song
- 50f5213 feat(08-06): Markdown, copy whole song, PDF print sheet, blank songs not exported
- b719641 feat(08-06): export menu keyboard, touch floors, narrow header, long-song print; darwin lyrics baselines refreshed

Verification: Task 1 verify 26 passed (incl. 1 spec titled 匯出：); Task 2 verify 40 passed (11 titled 匯出：); Task 3 verify 116 passed then 117 with the flip spec (17 titled 匯出：); final `npm test` 640 passed / 27 skipped / 0 failed (baseline 623 plus 17 new).

## Screenshot baselines

Refreshed only `-darwin`: `desktop-lyrics-darwin.png`, `phone-lyrics-darwin.png`, `tablet-lyrics-darwin.png`. Diff viewed first: only the lyrics header changed (⬇ 匯出 beside the title, + 新增段落 wrapping to its own right-aligned line, as UI-SPEC D-01 describes). Only phone was outside the 1 percent tolerance; the three lyrics baselines were refreshed together (`-g lyrics --update-snapshots=all`) so they all show the new header. **`-linux.png` baselines were not touched and need a refresh in the cloud container.**

## Deviations from Plan

**1. [Rule 1 - Bug] 08-05 header spec counted three header children**
- **Found during:** Task 3 (`歌曲清單：標題列放得下` asserts `kids.length === 3`).
- **Fix:** now 4 (☰ 歌曲, title, ⬇ 匯出, + 新增段落). Meaning of the spec unchanged.
- **Files:** tests/songs-ui.spec.mjs. **Commit:** b719641

**2. [Rule 1 - Bug] body background transition made the colour check read mid-fade**
- **Found during:** Task 2 (PDF 列印頁 / 深色主題: `BODY` computed background was not yet `rgb(255, 255, 255)`).
- **Cause:** `body` has `transition: background 0.3s`.
- **Fix:** `transition: none !important` on `body.print-song` in css/print.css (also what a real print needs).
- **Commit:** 50f5213

**3. [Test bug] Menu items located by `hasText: 'TXT'` matched two items**
- 複製整首's hint says 「TXT 格式」. The helper now matches on the `.export-label` text only.

**4. [Test bug] Clicking page corner to close the menu closed the whole phone sheet; ➕➖ unreachable with the sheet open**
- The 150% header spec uses `setUiScale()` (as the 08-05 spec does) and Esc to close the menu.

**5. [Plan wording] Menu hint uses the safe file name**
- The plan says `{歌名}`; the hint and toast show the sanitised name (`我的_歌_1`) so they match the file Andy will actually get. For ordinary titles the two are identical.

**6. [Plan wording] Print colours forced on every sheet element**
- The plan says both "no backgrounds inside the sheet" and "background-color white on every element"; the sheet sets `background: #fff` on itself and every descendant, which satisfies the computed-style truth and prints identically.

**Total deviations:** 2 auto-fixed bugs (one in an older spec, one in the new CSS), 2 test-side fixes, 2 wording notes. **Impact:** none on required behaviour.

## Autonomous decisions (for Andy's 自主決定 list)

- **F6 override:** print rules are scoped to `body.print-song`, so Cmd/Ctrl+P outside the PDF flow still prints the normal page instead of a blank sheet (UI-SPEC D-12 hid every body child unconditionally).
- Hint and toast use the sanitised file name, cut to 16 characters.
- Opening the export menu while a feedback / report dialog is open is refused (the dialog sits above the menu).
- One module-level `afterprint` listener instead of a one-shot listener per print.

## Known Stubs

None.

## Threat Flags

None new. T-08-15 (`safeFileName`, spec with `/` and `:` in the title), T-08-16 (`匯出：不連網路，也只匯出這首歌`: no other song, #tag, 情境, saved word or `lh:` key in any of the four outputs, zero http requests), T-08-17 (`匯出：歌名有標記也只當文字`; `grep -v '^\s*//' js/song-io.js | grep -c innerHTML` = 0), T-08-18 (`fallbackCopy` removes its readOnly textarea in `finally`; specs assert none left after success and failure) are covered. T-08-SC: no package installs.

## Human checks still open (08-UAT)

- A real PDF of a long song: page breaks between lines, labels not stranded at a page bottom, no clipping.
- iOS: download file names, and `window.print()` from the Home-Screen app.

## Self-Check: PASSED

- Files present: js/song-io.js, css/print.css, tests/songs-export.spec.mjs.
- Commits de8a238, 50f5213, b719641 in `git log`.
- Task 1 greps: songToTxt 1, safeFileName 1, `id="exportToggle"` 1, `js/song-io.js?v=0.96.12` 1, window.prompt 0, `'song-io'` in split-tags 1.
- Task 2 greps: songToMd 1, printSong 1, `body.print-song` 10, `media="print"` 1, `id="printSheet"` 1, setSelectionRange 2, `css/print.css` in split-tags 1.
- Task 3 greps: ArrowDown 2, 匯出：長歌列印 1, `git status --porcelain -- tests/visual.spec.mjs-snapshots` lists only `-darwin.png`.
- Plan verification: songs-export / split-tags / style / smoke / visual green; `npm test` 640 passed, 27 skipped, 0 failed. `?v=` untouched at 0.96.12 (both new tags use it).
