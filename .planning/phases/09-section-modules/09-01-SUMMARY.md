---
phase: 09-section-modules
plan: 01
subsystem: sections-data-model
tags: [sections, roman-numbering, backup-validation, no-schema-migration, playwright, node-vm]
status: complete
requires:
  - phase: 08-songs-editor-model
    provides: lh:songs v2 model, _normalizeSong, lhNormalizeSong / lhParseBackup whitelist, TXT / Markdown / PDF export reading section.label
provides:
  - "js/sections-core.js: LH_SEC_TYPES, LH_SEC_TYPE_SET, LH_SEC_NAMES, LH_SEC_KEY2TYPE (Map), LH_SEC_CUSTOM_MAX, LH_SEC_H_MIN, LH_SEC_H_MAX, LH_SEC_COLOR_RE, lhInferSecType, lhSecFields, lhToRoman, lhSecNames, lhSecFinalize, lhNextSecType"
  - "js/songs.js makeEmptySection(type); makeEmptySong first section is Verse; _normalizeSong finalizes names in memory without marking the song changed"
  - "js/safety.js lhNormalizeSong accepts and validates type / custom / color / height per section"
  - "js/lyrics.js addLyricsSection guesses the next common type; renderLyricsSections shows the model label only"
  - "?v=0.96.13 on all 31 local tags; sections-core between state.js and songs.js; split-tags JS_ORDER lists 23 files"
  - "tests/sections-core.spec.mjs (7 Node tests), tests/sections-ui.spec.mjs (4 browser tests), 3 new backup tests"
affects: [09-02 label button, 09-03 colors, 09-04 drag, 09-05 delete/undo, later Phase 9 plans]
actuals:
  tokens: 36000
  tasks: 3
  commits: 3
plan_head_before: 905320ad01d3246930720d3ffe8ffc9db9182add
plan_head_after: 4e5ef5cd4e8789d32685acf0dcb5d840bc05d755
commits: 3
tech-stack:
  added: []
  patterns:
    - "pure helpers in a classic script loaded by node:vm into an empty context (no DOM, no storage, no other file's globals)"
    - "lookups by user data use Set / Map, never object literals (prototype-key safe)"
    - "read never writes: names are recomputed in memory on load; storage changes only when the song is next edited (A2 lazy normalization)"
key-files:
  created: [js/sections-core.js, tests/sections-core.spec.mjs, tests/sections-ui.spec.mjs]
  modified: [index.html, js/songs.js, js/lyrics.js, js/safety.js, tests/split-tags.spec.mjs, tests/songs-model.spec.mjs, tests/songs-export.spec.mjs, tests/songs-journey.spec.mjs, tests/songs-backup.spec.mjs, tests/layout.spec.mjs, tests/visual.spec.mjs-snapshots/desktop-lyrics-darwin.png, tests/visual.spec.mjs-snapshots/phone-lyrics-darwin.png, tests/visual.spec.mjs-snapshots/tablet-lyrics-darwin.png]
key-decisions:
  - "Numbering and type inference follow RESEARCH Pattern 1 verbatim; helper names carry a private _lhSecCut prefix so classic-script globals cannot collide"
  - "lhNormalizeSong builds the section from a shallow copy whose label is already cut to 200 code points, so inference sees the cut label and the spread keeps '__proto__' keys as plain data"
  - "Backups are built from memory, so an unedited Phase 8 song exports with recomputed English names and new fields even though its stored lh:songs entry is still the old text"
requirements-completed: [EDIT-05]
duration: ~25 min
completed: 2026-10-23
coverage:
  - id: D1
    description: "Phase 8 songs open with inferred structured names (主歌 / 副歌 / 橋段 -> Verse / Chorus / Bridge; empty, 歌詞, 新段落 -> Verse; unknown labels stay as Custom names); every loaded section has type / custom / color / height and label equal to the displayed name"
    requirement: EDIT-05
    verification:
      - { kind: e2e, ref: "tests/sections-ui.spec.mjs#名稱：舊歌顯示結構化名稱", status: pass }
      - { kind: unit, ref: "tests/sections-core.spec.mjs#名稱：推斷表", status: pass }
    human_judgment: false
  - id: D2
    description: "Roman numbering (two or more of a type, Custom never numbered), adjacency, ordering, idempotent finalize, next-type table, lhToRoman values"
    requirement: EDIT-05
    verification:
      - { kind: unit, ref: "tests/sections-core.spec.mjs#名稱：編號", status: pass }
      - { kind: unit, ref: "tests/sections-core.spec.mjs#名稱：整理兩次結果相同", status: pass }
      - { kind: unit, ref: "tests/sections-core.spec.mjs#名稱：羅馬數字", status: pass }
      - { kind: unit, ref: "tests/sections-core.spec.mjs#名稱：下一段類型", status: pass }
    human_judgment: false
  - id: D3
    description: "A new song starts with one Verse; + 新增段落 follows Verse -> Pre-Chorus -> Chorus -> Verse and renumbers all names at once; names reach storage"
    requirement: EDIT-05
    verification:
      - { kind: e2e, ref: "tests/sections-ui.spec.mjs#名稱：新歌第一段是 Verse", status: pass }
      - { kind: e2e, ref: "tests/sections-ui.spec.mjs#名稱：新增段落猜下一段", status: pass }
    human_judgment: false
  - id: D4
    description: "Booting an unedited Phase 8 profile leaves the lh:songs raw string byte-identical and lh:schema at 2"
    requirement: EDIT-05
    verification:
      - { kind: e2e, ref: "tests/sections-ui.spec.mjs#名稱：讀取不寫回", status: pass }
    human_judgment: false
  - id: D5
    description: "Exports print the model label (TXT, Markdown, print sheet); <b>段</b> stays a literal Custom heading"
    requirement: EDIT-05
    verification:
      - { kind: e2e, ref: "tests/songs-export.spec.mjs (TXT, Markdown, 複製整首, PDF 列印頁, 歌名有標記也只當文字)", status: pass }
      - { kind: e2e, ref: "tests/songs-journey.spec.mjs#整合：舊版使用者的一整天", status: pass }
    human_judgment: false
  - id: D6
    description: "Backups round-trip type / custom / color / height through 全部還原 and 只加入歌曲; hostile or malformed fields are dropped one by one (type '__proto__' / 'constructor' / 'solo', non-#rrggbb colors, heights outside 4-60 or not a number, custom over 40 code points) while every section id and lyric text survives; Object.prototype gains no keys; no inline style contains url(; a v0.96 SAVE file imports with inferred types"
    requirement: EDIT-05
    verification:
      - { kind: e2e, ref: "tests/songs-backup.spec.mjs#備份：段落新欄位往返", status: pass }
      - { kind: e2e, ref: "tests/songs-backup.spec.mjs#備份：段落壞欄位丟掉、段落照收", status: pass }
      - { kind: e2e, ref: "tests/songs-backup.spec.mjs#備份：段落舊版存檔推斷類型", status: pass }
    human_judgment: false
  - id: D7
    description: "Whether English type names for old Chinese-labelled songs, and the export headings changing from 主歌 to Verse I, feel right to Andy (CONTEXT A3 + B1 accepted consequence)"
    requirement: EDIT-05
    verification: []
    human_judgment: true
    rationale: "Naming and export wording is a product taste call; marked for UAT in the plan"
---

# Phase 9 Plan 01: Section data model, structured names and backup validation Summary

Every section now has a structured type (Intro / Verse / Pre-Chorus / Chorus / Inter / Bridge / Outro / Custom) with automatic Roman numbering, inferred from the old label on read with no schema migration, carried and validated by backups, and used by all exports.

## What was built

- **js/sections-core.js** (new, pure, loaded by node:vm in the tests): type list and Set / Map lookups, `lhInferSecType`, `lhSecFields` (drops bad type / color / height, cuts custom to 40 code points), `lhToRoman`, `lhSecNames`, `lhSecFinalize` (idempotent), `lhNextSecType`.
- **Load path (songs.js):** `_normalizeSong` calls `lhSecFinalize` but does not set `changed`, so booting never writes. New songs start with one Verse via `makeEmptySection('verse')`.
- **Editor (lyrics.js):** the label input shows `s.label` only; `+ 新增段落` pushes `makeEmptySection(lhNextSecType(last.type))` and finalizes all names.
- **Backups (safety.js):** `lhNormalizeSong` spreads `lhSecFields(s)` into each section and finalizes the array. Bad fields are dropped one at a time; sections, ids and lyric text are always kept.
- **Version:** all 31 local tags are `?v=0.96.13`; `tests/split-tags.spec.mjs` lists 23 files.

## Task commits

| Task | Commit | Summary |
|------|--------|---------|
| 1 (tracer) | a828571 | structured names on read, new song = Verse, ?v=0.96.13, spec expectations, lyrics baselines |
| 2 | 36bff00 | + 新增段落 guesses next type, Node rule tests, read-never-writes test |
| 3 | 4e5ef5c | backups carry and validate new fields, 3 backup tests |

Tracer gate: `<verify>` is automated-only and `human_verify_mode` is end-of-phase, so the verify was re-run after the tracer commit (73 + 2 + 19 passed) and execution continued.

## Changed expectations (old -> new)

| Spec | Old | New |
|------|-----|-----|
| songs-model 升級後顯示我的第一首歌 | `LEGACY[i].label` (主歌 / 副歌 / 橋段) | Verse / Chorus / Bridge |
| songs-model 預設段落名稱 | `['歌詞', '新段落']` | `['Verse I', 'Verse II']` |
| songs-model 用段落 id 對應 | added section reads `新段落` | `Verse` (after two Custom sections) |
| songs-export TXT_EXPECTED | `[主歌]` ... `[段落 2]` | `[Verse I]` ... `[Verse III]` |
| songs-export MD_EXPECTED | `## 主歌` ... `## 段落 2` | `## Verse I` ... `## Verse III` |
| songs-export PDF 列印頁 | `H2:主歌`, `H2:段落 2` | `H2:Verse I`, `H2:Verse III` |
| songs-journey TXT | `[段落 1]` | `[Verse]` |
| songs-journey restore check | `lh:songs` string equals A's stored string | full parsed songs equal A's in-memory songs (backup is built from memory; unedited old song is still raw in storage) |
| layout 刪除 (1) | `刪除「副歌」？...` | `刪除「Chorus」？...` |
| layout 刪除 (1) saved labels | `['主歌', '空白段']`, then `['主歌']` | `['Verse', '空白段']`, then `['Verse']` |
| layout 刪除 (2) | `刪除「新段落」？...` | `刪除「Verse II」？...` |
| songs-backup 乾淨瀏覽器完整還原 | restored songs equal A's stored `lh:songs` | equal A's in-memory songs (same reason as journey) |
| songs-backup 被動過手腳的檔案 | section keys `collapsed,id,label,text` | plus `color,custom,height,type` |
| songs-backup 編輯器能存的內容不會被截短 | 81-char unknown label survives | cut to 40 code points (custom name cap, CONTEXT A4); comment updated |

Refreshed baselines: `tests/visual.spec.mjs-snapshots/desktop-lyrics-darwin.png`, `phone-lyrics-darwin.png`, `tablet-lyrics-darwin.png` (label 歌詞 -> Verse; phone image viewed, only the label changed). The diff was inside the 1% pixel tolerance, so I regenerated with `--update-snapshots=all`. No `-linux.png` touched.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug in expectation] Existing round-trip assertions compared storage to a memory-built backup**
- **Found during:** Task 1 (songs-journey) and Task 3 (songs-backup)
- **Issue:** A backup is built from memory; an unedited Phase 8 song is still raw in storage (A2 lazy normalization), so a byte or deep comparison of the restored `lh:songs` with the source's stored string can never hold once names are inferred.
- **Fix:** both specs now compare against the source's in-memory `songs`; after Task 3 this is a full deep-equal including the new fields, which is a stronger check than before.
- **Files modified:** tests/songs-journey.spec.mjs, tests/songs-backup.spec.mjs
- **Commits:** a828571, 4e5ef5c

**2. [Rule 3 - Blocking] acceptance grep for 新段落 in addLyricsSection**
- **Found during:** Task 2 acceptance check
- **Issue:** a pre-existing comment 滾到底部讓新段落可見 inside the function made the criterion print 1.
- **Fix:** reworded the comment (滾到底部讓剛新增的那一段可見); criterion now prints 0.
- **Commit:** 36bff00

**3. [Process] Task 2 RED step**
- The Node tests for the pure helpers passed on first run because the full helper file (including `lhNextSecType`) was already created in Task 1 as the plan prescribes. Task 2's RED was therefore only visible for the UI tests (add-section guess). Recorded rather than faked.

**Total deviations:** 3 (1 blocking, 1 expectation bug, 1 process note). **Impact:** none on scope; no product behavior differs from the plan.

## Threat model status

- T-09-01 (color): `LH_SEC_COLOR_RE` + lower-case; 'red; background:url(x)', '#fff', '#12345' become ''. Tested in core and backup specs; DOM check confirms no `url(` inline style.
- T-09-02 (type): `LH_SEC_TYPE_SET.has` and Map lookups; '__proto__' and 'constructor' fall back to inference. Tested; `Object.prototype` own names unchanged after import.
- T-09-03 (custom): unknown labels kept as Custom (40 code points, CJK Extension B tested); text never touched.
- T-09-04 accepted. T-09-SC: `package.json` / `package-lock.json` unchanged.

## Known limits and notes for later plans / UAT

- **Legacy single-song mode** (`_flushLegacy`) writes only label / text / collapsed; color and height are not kept in that fallback mode (RESEARCH Pattern 2, acceptable).
- **Reversibility (costly):** the recomputed English label is written into `lh:songs` the next time an old song is edited; the original Chinese label survives only in pinned and automatic backups.
- **Edits to an old song** rewrite every section's label and add the four fields to that song only.
- `importAddSongs` bypasses `_normalizeSong` but is safe because parsing already finalizes.
- The section label is still an `<input readonly>` with dblclick rename; plan 09-02 turns it into the cycling button.

## Andy to-do

- 在雲端容器執行 `npm run visual:update`，更新 -linux 截圖基準（本機只更新了 -darwin 的 3 張 lyrics 基準）。
- UAT 確認項（人工判斷）：舊歌段落名稱變英文、匯出標題從「主歌」變 Verse I / II、`<b>段</b>` 以字面 Custom 標題匯出。

## Verification

Plan-level commands, all green on this Mac:

- `npx playwright test tests/sections-core.spec.mjs tests/sections-ui.spec.mjs tests/songs-model.spec.mjs tests/songs-export.spec.mjs tests/songs-journey.spec.mjs tests/songs-backup.spec.mjs tests/split-tags.spec.mjs tests/style.spec.mjs tests/scan.spec.mjs tests/smoke.spec.mjs` -> 130 passed
- `npx playwright test tests/layout.spec.mjs tests/visual.spec.mjs` -> 98 passed
- `git diff --stat package.json package-lock.json` -> empty
- Acceptance greps: `?v=0.96.12` 0, `?v=0.96.13` 31, sections-core tag directly after state.js, `'sections-core'` 1 in split-tags, `lhSecFinalize(s.sections)` 1 in songs.js, `function makeEmptySection` 1, `lhSecFields(s)` 1 and `lhSecFinalize(sections)` 1 in safety.js, `-linux.png` diff empty.

## Self-Check: PASSED

- FOUND: js/sections-core.js, tests/sections-core.spec.mjs, tests/sections-ui.spec.mjs
- FOUND commits: a828571, 36bff00, 4e5ef5c
