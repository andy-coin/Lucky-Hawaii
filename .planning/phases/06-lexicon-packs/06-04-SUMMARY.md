---
phase: 06-lexicon-packs
plan: 04
subsystem: lexicon-packs-mcbopomofo-vanguard
tags: [lexicon-packs, mcbopomofo, vanguard, parsers, notice, licence-gate, settings-list]
status: complete

requires:
  - phase: 06-lexicon-packs (06-01)
    provides: PARSERS registry, normalise (R0), choose_reading, collect, write_pack / write_notice / write_manifest, licence gate, lock entries for mcbopomofo / vanguard-tw / tabe-notice
  - phase: 06-lexicon-packs (06-02, 06-03)
    provides: manifest-driven settings list, switchLexiconPack, bounded cache, About NOTICE block
provides:
  - "tools/lexicon/lex/parse.py: parse_mcbopomofo (BPMFMappings.txt + phrase.occ, single-space) and parse_vanguard (two phrase files) registered in PARSERS"
  - "data/packs/mcbopomofo/ 小麥注音詞庫: 140,010 entries, 6 chunks, version 1.0054220524, NOTICE + LICENSE.MIT.txt (sha256 72ed3219...f47b72) + LICENSE.TaBE-BSD-3-Clause.txt"
  - "data/packs/vanguard-tw/ 唯音台灣詞庫（精簡版）: 64,781 entries, 3 chunks, version 1.fffafbac8b, NOTICE (states the 教育部 component is excluded) + LICENSE.MulanPSL-2.0.txt (sha256 8283312c...5d04) + LICENSE.TaBE-BSD-3-Clause.txt"
  - "data/packs/index.json lists v096 (default), chewing, mcbopomofo, vanguard-tw"
  - "tools/lexicon/reports/{mcbopomofo,vanguard-tw}/removed.ndjson (7 and 12 R0 deletions)"
  - "pack.py: optional notice_extra config field printed as a 補充說明 line in NOTICE"
affects: [06-05, 06-06, 06-07, 06-08]

plan_head_before: ee5c54b5f073c031497f7ae0cee1692dbec5e7dc
plan_head_after: f387026b1fe99c943e985386c92fcad532adfb51

actuals:
  tokens: 4500     # chars/4 over the added lines of code, tests and fixtures (generated pack data excluded)
  tasks: 2
  commits: 2       # MEASURED: git rev-list --count ee5c54b..HEAD (two task commits, before the docs commit)

tech-stack:
  added: []        # no packages installed
  patterns:
    - "New source = a parser registered in PARSERS plus a packs.json entry; build.py unchanged"
    - "Unit tests resolve parser inputs through the same {source/path: file} mapping build.py passes"

key-files:
  created:
    - data/packs/mcbopomofo/ (c00-c05.json, meta.json, NOTICE.txt, LICENSE.MIT.txt, LICENSE.TaBE-BSD-3-Clause.txt)
    - data/packs/vanguard-tw/ (c00-c02.json, meta.json, NOTICE.txt, LICENSE.MulanPSL-2.0.txt, LICENSE.TaBE-BSD-3-Clause.txt)
    - tools/lexicon/reports/mcbopomofo/removed.ndjson
    - tools/lexicon/reports/vanguard-tw/removed.ndjson
    - tools/lexicon/tests/fixtures/BPMFMappings-mini.txt
    - tools/lexicon/tests/fixtures/phrase-mini.occ
    - tools/lexicon/tests/fixtures/phrases-vchewing-mini.txt
    - tools/lexicon/tests/fixtures/phrases-tabe-mini.txt
  modified:
    - tools/lexicon/lex/parse.py
    - tools/lexicon/lex/pack.py
    - tools/lexicon/packs.json
    - tools/lexicon/tests/test_parse.py
    - tools/lexicon/tests/test_sources.py
    - tools/lexicon/tests/test_notice.py
    - data/packs/index.json
    - tests/lexicon-packs.spec.mjs
    - .planning/TEST-CHECKLIST.md

key-decisions:
  - "notice_extra is printed as its own 補充說明 line before 改作說明; packs without the field (chewing) produce a byte-identical NOTICE"
  - "Two lines of packs.json formatting follow the existing style (inline arrays for short lists) so the diff only adds the two pack objects"
  - "Words missing from phrase.occ get p 0 and stay in the pack (they are real BPMFMappings words)"

requirements-completed: []   # LEX-01 and LEX-07 are also declared by later 06-0x plans; they flip when the last declaring plan finishes (same rule as 06-01 .. 06-03)

duration: ~35 min of work plus two ~6.5 min full test runs
completed: 2026-10-04
---

# Phase 6 Plan 04: 小麥注音詞庫 and 唯音台灣詞庫（精簡版） packs Summary

Two more licence-clean packs now come out of the same `npm run lexicon:build`: 小麥注音詞庫 (MIT + libtabe BSD, 140,010 words) and 唯音台灣詞庫（精簡版） (MulanPSL-2.0 + libtabe BSD, 64,781 words, no 教育部 component). 偏好設定 lists four packs and each of the two new ones loads when chosen. Golden tests, default v0.96 files, the chewing pack (versions unchanged) and `?v=` (0.96.8) are untouched.

## What was done

**Task 1 (tracer), commit `b9d13bb`**: 小麥注音詞庫 from pinned source to the settings list.
- `parse_mcbopomofo`: BPMFMappings.txt split on single spaces (word, then syllables; blank, `#` and one-token lines skipped), phrase.occ read with one right-hand split on the single space (word, integer count; malformed lines skipped, the `詞 次數` single-space-not-TAB trap is commented); rows `(w, z, occ.get(w, 0))`; header `{}`.
- `packs.json` mcbopomofo entry (MIT AND BSD-3-Clause, both copyright lines, LICENSE.MIT.txt copied from the McBopomofo LICENSE.txt and the TaBE extract, `notice_extra`).
- `pack.py`: `notice_extra` support (the plan listed the field but the writer did not print it; see deviations).
- Fixtures `BPMFMappings-mini.txt` / `phrase-mini.occ` and 10 tests (separator, occ default 0, malformed occ line, a TAB-separated occ proving why single-space matters, multi-reading lines, R0 outcomes 一九九○ / 𰻞𰻞麵 / 菜々子, reading choice, notice_extra on/off).
- Build output: `小麥注音詞庫：保留 140010 筆、刪除 7 筆（格式）、略過單字 0 筆、版本 1.0054220524`; `verify` passes; a second `build` leaves `git status` unchanged (chewing's version `1.b04c2ee8bd` also unchanged).
- Playwright: the old two-pack real-manifest settings test became three packs; new test 「詞庫包：真的清單裡有小麥注音詞庫，選了就載入」 reads the real manifest, checks the row text (`140,010 詞・…` zh-TW grouping), clicks the radio, waits for 已改用：小麥注音詞庫 and `__hoyunWordlistReady`, and checks `activeLexiconPack.id`, the stored value and a word read from the real c00.json in `wordPhoneticMap`.

**Task 2, commit `f387026`**: 唯音台灣詞庫（精簡版）.
- `parse_vanguard`: both phrase files (`phrases-vchewing-cht.txt`, `phrases-tabe-cht.txt`), `#` and blank lines skipped, tokens on single spaces (word, integer frequency, syllables), short or non-integer lines skipped; registered in PARSERS; exactly the two expected files are required (ValueError otherwise).
- `packs.json` vanguard-tw entry (MulanPSL-2.0 AND BSD-3-Clause, LICENSE.MulanPSL-2.0.txt, TaBE extract, notice_extra stating the 教育部 component is excluded).
- Fixtures `phrases-vchewing-mini.txt` / `phrases-tabe-mini.txt`; 6 parser tests (skips, fields, max frequency over both files with both readings considered, 倒三角形 -> R0-syllables, two-file requirement) and 3 `test_sources` tests (all real packs pass the gate with only role-pack redistributable sources; vanguard files are exactly the two phrase files plus LICENSE.txt with no moe/custom/revised in any path; licence tokens).
- Build output: `唯音台灣詞庫（精簡版）：保留 64781 筆、刪除 12 筆（格式）、略過單字 0 筆、版本 1.fffafbac8b`; `驗證通過：4 個詞庫包`; second `build` unchanged.
- Playwright: 「詞庫包：偏好設定列出四個詞庫包（真正的清單），v0.96 預設勾選」 (order, names, count text equal to manifest entries, non-empty descriptions, v096 checked, others not) and 「詞庫包：選唯音台灣詞庫（精簡版）就載入它的詞」 (activeLexiconPack.id 'vanguard-tw', stored value, a real word from c00.json).

## Pack facts

| Pack | Entries | Chunks | Size | Version | R0 removed (rule) | Licence files |
|------|---------|--------|------|---------|-------------------|---------------|
| chewing (06-01, unchanged) | 128,973 | 6 | ~7 MB | 1.b04c2ee8bd | 0 | LGPL, TaBE |
| mcbopomofo | 140,010 | 6 | 7.4 MB | 1.0054220524 | 7 (5 nonhan: 一九九○ 一四〇 二〇二 松嶋菜々子 菜々子; 2 nonbmp: 𨑨迌 𰻞𰻞麵) | MIT (sha 72ed3219...f47b72, byte-identical to upstream), TaBE |
| vanguard-tw | 64,781 | 3 | 3.4 MB | 1.fffafbac8b | 12 (7 nonhan e.g. エロ禁止 哆啦Ａ夢 Ｑ彈 泰ㄖ天; 4 nonbmp: 擸𢶍 腳𧿹趾 𨑨迌 𰻞𰻞麵; 1 syllables: 倒三角形) | MulanPSL-2.0 (sha 8283312c...5d04), TaBE |

`data/packs` is about 18 MB in total (matches D-18). Pinned commits appear in each NOTICE (be6564ac... and d41f2fc2...).

## Verification

| Check | Result |
|-------|--------|
| `python3 -B tools/lexicon/build.py all` / `verify` | 0; four packs verified; second `build` leaves `git status` clean |
| `python3 -B -m unittest discover -s tools/lexicon/tests -t tools/lexicon` | 87 tests OK (was 78 before this plan) |
| `npx playwright test tests/lexicon-packs.spec.mjs tests/lexicon-build.spec.mjs` | 19 passed |
| `npx playwright test tests/lexicon-packs.spec.mjs -g "小麥注音"` / `-g "四個詞庫包"` | 1 passed each |
| `npm test` after Task 1 | 419 passed, 27 skipped, 1 failed (known cloud-only `worker-config.spec.mjs:53`) |
| `npm test` after Task 2 (final code state) | 420 passed, 27 skipped, 1 failed (same known test) |
| Acceptance greps: `grep -cE "phrases-moe|phrases-custom" tools/lexicon/packs.json` = 0; sha256 of both licence texts match; commit ids present in both NOTICE files; index.json ids order and default | pass |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `notice_extra` was specified in packs.json but never printed**
- **Found during:** Task 1 (build output NOTICE had no mention of the libtabe origin)
- **Issue:** the plan's pack configs carry `notice_extra` and the vanguard NOTICE must state the 教育部 exclusion, but `pack_notice` ignored the field.
- **Fix:** `pack_notice` prints `補充說明：…` before the 改作說明 line when the field is set; test added (on and off). The chewing NOTICE is byte-identical (verified: git shows no change under data/packs/chewing).
- **Files modified:** tools/lexicon/lex/pack.py, tools/lexicon/tests/test_notice.py
- **Commit:** b9d13bb

**2. [Rule 1 - Test correction] The task 1 settings test locator**
- First attempt used `radio(page, id)` inside `has:`; Playwright needs a locator relative to the row. Changed to `page.locator('input[value="mcbopomofo"]')` before the first commit.

**Total deviations:** 1 auto-fix, 1 test correction, 0 architectural. **Impact:** none on required outputs.

## Authentication Gates

None.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model. T-06-13 (vanguard inputs are only the two non-MOE phrase files; test asserts no moe/custom/revised in the lock's vanguard paths or packs.json; licence gate runs for every pack on every build), T-06-14 (malformed lines skipped in both parsers, every entry passes R0; fixtures cover 一九九○, 𰻞𰻞麵, 菜々子, 倒三角形, malformed occ and phrase lines) are mitigated as planned. No new network, auth or storage surface.

## For Andy (TEST-CHECKLIST)

- 必測: 06-04-1 to 06-04-5 (four packs listed, both new packs load, About shows their sources, `npm run lexicon:build`). 建議測: 06-04-6 to 06-04-8.
- 待 Andy 決定／動手: D-19 (try the four packs and say which fits best; feeds Phase 12). D-18 (git size) still open and matches (~18 MB).
- 自主決定: 06-04-9 (〇/々 words dropped by R0), 06-04-10 (missing occ count = 0, vanguard takes max), 06-04-11 (vanguard 精簡版 uses only two files), 06-04-12 (notice_extra line), 06-04-13 (pack size).

## Next Phase Readiness

Ready for 06-05: all three sources exist as independent packs in the same format, so the single-source (gray) rule can compare them; R0 is the only rule applied so far (no simplified-character, rare-character or Mainland-usage cleaning yet).

## Self-Check: PASSED

Created files exist (`data/packs/mcbopomofo/meta.json`, `data/packs/vanguard-tw/meta.json`, both `removed.ndjson`, four fixtures); commits `b9d13bb` and `f387026` are in history; final `npm test` run on the committed code shows only the known cloud-only failure.
