---
phase: 06-lexicon-packs
plan: 01
subsystem: lexicon-pipeline
tags: [python, lexicon, licence-gate, sha256-pin, ndjson, reproducible-build, chewing]
status: complete

requires:
  - phase: 05-multi-device-layout
    provides: green npm test baseline (400 pass / 27 skipped / 1 known cloud-only failure), `?v=0.96.7`
provides:
  - "tools/lexicon/build.py: CLI fetch | build | verify (--strict accepted, same as verify until 06-05) | all; exit 0 / 1 (problems, one per line) / 2 (LexError on stderr)"
  - "tools/lexicon/sources.lock.json: 7 pinned sources (3 pack, 2 rule-input, 2 licence-text) with 40-hex commits, bytes, sha256, licence SPDX and evidence; tabe-notice carries the libtabe extract rule"
  - "tools/lexicon/lex/{__init__,sources,parse,pack}.py: stdlib-only (Python >= 3.9) cache/fetch/licence gate, tsi parser + R0 + reading choice, pack writer + manifest + NOTICE + offline verify"
  - "data/packs/chewing/: 128,973 entries in 6 chunks (24,000 lines each, last 8,973), meta.json, NOTICE.txt, LICENSE.LGPL-2.1.txt, LICENSE.TaBE-BSD-3-Clause.txt"
  - "data/packs/index.json: default v096 (legacyCache, existing files untouched), second entry chewing"
  - "data/packs/v096/NOTICE.txt: honest source/licence statement incl. CC BY-ND 3.0 and the CC BY credit line"
  - "tools/lexicon/reports/chewing/removed.ndjson (empty: R0 removed 0 rows on this source)"
  - "tools/lexicon/tests/ (68 offline unit tests, network guard) + tests/lexicon-build.spec.mjs (2 npm-test wrappers)"
  - "npm run lexicon:build / lexicon:verify / lexicon:test; tools/lexicon/README.md"
affects: [06-02, 06-03, 06-04, 06-05, 06-06, 06-07, 06-08]

plan_head_before: bab72ffa70cb6131dd40ca699cc00be66cd46aed
plan_head_after: d93f50b108cc3c7c846282fc0433626e86fed629

actuals:
  tokens: 19700    # chars/4 over the hand-written files of this plan (data/packs generated output not counted)
  tasks: 3
  commits: 3       # MEASURED: git rev-list --count bab72ff..HEAD (before the docs commit)

tech-stack:
  added: []        # Python standard library only; no packages installed
  patterns:
    - "Pinned fetch: raw URL built only from lock owner/repo + 40-hex commit + quoted path; download capped at the locked byte count; sha256 verified before os.replace; mismatch deletes the temp file and exits 2"
    - "Reproducible output: code-point-sorted NDJSON, fixed 24,000-line chunks, no clocks, meta.built rewritten only when the content version changes, writes skipped when bytes are identical"
    - "Parser registry (lex.parse.PARSERS) dispatched by packs.json `parser`, so 06-04 adds parsers without touching build.py"
    - "Two verify levels: offline `verify` over committed files runs inside npm test; `--strict` reserved for 06-05"

key-files:
  created:
    - tools/lexicon/build.py
    - tools/lexicon/lex/__init__.py
    - tools/lexicon/lex/sources.py
    - tools/lexicon/lex/parse.py
    - tools/lexicon/lex/pack.py
    - tools/lexicon/sources.lock.json
    - tools/lexicon/packs.json
    - tools/lexicon/rules/reading-overrides.json
    - tools/lexicon/reports/chewing/removed.ndjson
    - tools/lexicon/README.md
    - tools/lexicon/tests/ (__init__.py, test_sources.py, test_parse.py, test_pack.py, test_notice.py, fixtures/tsi-mini.csv)
    - data/packs/index.json
    - data/packs/v096/NOTICE.txt
    - data/packs/chewing/ (meta.json, NOTICE.txt, 2 LICENSE files, c00..c05.json)
    - tests/lexicon-build.spec.mjs
  modified:
    - package.json
    - .gitattributes
    - .planning/TEST-CHECKLIST.md

key-decisions:
  - "Pack source files are handed to a parser as a {source_id/path: cached path} mapping (parse_tsi also accepts a bare path), so multi-file sources in 06-04 need no build.py change"
  - "normalise() returns (nfc_word, verdict): None = pass, 'skip-single' = counted only, otherwise an R0 rule id"
  - "removed.ndjson rows are per source line (w, z); `src` is the list of source ids and `n` the number of sources attesting (1 here), matching the RESEARCH row schema"
  - "meta.json gains a `stats` object (lines, skipped_single, merged_lines, removed, kept) and licence_files entries carry {file, sha256}; verify checks them against the lock"
  - "Commit attribution trailer uses the harness-provided model line (Claude Sonnet 5.5), not the 'Opus 5.5' wording in the dispatch note"

requirements-completed: [LEX-01, LEX-07, LEX-06]

duration: ~14 min of work plus ~6 min full test run
completed: 2026-10-04
---

# Phase 6 Plan 01: Pinned, licence-checked pipeline that builds the 新酷音 pack Summary

One command (`npm run lexicon:build`) downloads seven pinned upstream files into a cache outside the repo, checks bytes, sha256 and licence evidence, and writes a reproducible, content-hash-versioned 新酷音詞庫 pack (128,973 words, 6 chunks) with NOTICE, LGPL and TaBE licence texts, a removed list and a manifest that keeps v0.96 as the default; the v0.96 files and golden snapshots are untouched.

## What was done

**Task 1 (tracer), commit `facbefd`**: lock, fetch + licence gate, tsi parser, R0, reading choice, pack writer, manifest, NOTICE, verify, CLI.
- First `build.py all` took 7.7 s including the 14 downloads (about 16 MB). `fetch` is idempotent: a complete cache makes zero requests (also pinned by a unit test with urlopen patched to fail).
- Chewing result: lines 160,458; single-character lines skipped 26,073; repeated lines merged 5,412; R0 deletions 0; kept 128,973; version `1.b04c2ee8bd`; built 2026-10-04.
- Tracer gate (auto, end-of-phase, automated-only verify): `build.py all`, `verify` and the v0.96 diff re-run end to end and passed, so expansion continued.

**Task 2, commit `8df1e57`**: 68 unit tests (fixtures only). `tests/__init__.py` blocks every non-loopback `socket.connect` / `create_connection` with RuntimeError 「單元測試不可連網」, points `LEX_CACHE_DIR` at a fresh temp dir and removes `GEMINI_API_KEY` / `LEX_AI_URL`.
- test_sources (24): real lock validates, no MOE names, gate refusals (redistribute false, SPDX `CC-BY-ND-3.0`, token outside list, rule-input as pack source), wrong sha256 / oversize / missing evidence, cache hit with zero network, extract rule, cache dir inside the repo refused and not created.
- test_parse (21): header, skipped lines, every R0 rule, NFC of U+F91D, polyphonic rank / tone-stripped match / override, collect() counts and removed-row schema.
- test_pack (18) and test_notice (5): 25 entries with CHUNK_SIZE 10 give 10/10/5, byte-identical rebuild keeps `built`, a changed entry changes version and `built`, stale chunk removed, manifest order, and verify reporting unsorted chunk / wrong version / missing or tampered LICENSE / extra file / extra chunk / non-BMP word / NOTICE gap / wrong default / disallowed SPDX.

**Task 3, commit `d93f50b`**: `tests/lexicon-build.spec.mjs` (2 tests: unit tests run with 68 >= 20 and `OK`, no `__pycache__`; committed packs pass offline `verify` printing 「驗證通過」), three npm scripts, README for Andy, TEST-CHECKLIST items.

## Verification

| Check | Result |
|-------|--------|
| `build.py all` then `verify` | exit 0; 「新酷音詞庫：保留 128973 筆、刪除 0 筆（格式）、略過單字 26073 筆、版本 1.b04c2ee8bd」, 「驗證通過：2 個詞庫包」 |
| Reproducibility: fingerprint of `find data/packs tools/lexicon/reports -type f | sha256sum` before and after a second `build` | identical (`f0ecb05e78de0c33eedcee2c544ab4ff49165ce6c392c0ca15771e7fca721d97`) |
| `git diff --exit-code 6d65638 -- data/wordlist-meta.json 'data/wordlist-c*.json' tests/golden` | no change |
| LICENSE sha256 | LGPL `dc626520…fe551`, TaBE `edbaad40…37b54` as required |
| `LEX_CACHE_DIR=$PWD/tmp-cache … fetch` | exit 2, `tmp-cache` not created |
| Cache location | `/root/.cache/lucky-hawaii/lexicon` (7 source folders), outside the repo |
| `find . -name __pycache__` (outside node_modules) | 0 |
| `python3 -B -m unittest discover -s tools/lexicon/tests -t tools/lexicon` | Ran 68 tests, OK |
| `npx playwright test tests/lexicon-build.spec.mjs` | 2 passed |
| `npm test` (full) | 402 passed, 27 skipped, 1 failed: the known cloud-only `tests/worker-config.spec.mjs:53` (wrangler proxy WARNING) |
| Task 1 acceptance criteria (entries 128,973 in 110k-140k, 6 chunks, version `1.` + 10 hex; index.json shape; NOTICE greps; no `phrases-moe|phrases-custom|moedict` in lock or packs.json) | all pass |

PHASE_BASE (HEAD before this plan's first commit): `bab72ffa70cb6131dd40ca699cc00be66cd46aed`.

## Deviations from Plan

### Auto-fixed Issues

None needing a code fix: the unit tests passed on the first run against the Task 1 modules.

### Judgment calls (not bugs)

**1. [Documentation] Commit trailer model name** — the dispatch note asked for `Claude Opus 5.5`; the harness attribution rule names `Claude Sonnet 5.5`, which is the model that actually did the work. Commit `facbefd` was amended (not yet pushed) so all three task commits carry the same, truthful trailer.

**2. [Test order] Task 2 is `tdd="true"` but the code already existed** — Task 1 (tracer) had to land first, so the tests were written against finished modules and committed as `test(06-01)`; there is no separate RED commit. They still pin the behaviour list in the plan.

**3. [Scope-neutral additions]** `licence_evidence` is also filled for mcbopomofo, vanguard-tw and opencc (as the plan's lock excerpt lists) and re-checked after every fetch; `meta.json` has an extra `stats` block; parse_tsi accepts either a path or the `{source/path: file}` mapping. None changes a required output.

**Total deviations:** 0 auto-fixed, 3 judgment calls. **Impact:** none on outputs or acceptance criteria.

## Issues Encountered

None blocking. Observations worth knowing for later plans:
- On this source R0 deletes 0 rows, so `removed.ndjson` is an empty (committed) file; the deletion path is exercised by unit tests only. Real rule deletions arrive with 06-05.
- The chewing NOTICE (as the plan specifies) already says 「清洗規則使用：OpenCC 字表…、教育部常用／次常用國字表（僅作比對）」, but those rule inputs are first applied in 06-05. Recorded as TEST-CHECKLIST 06-01-9.
- REQUIREMENTS.md checkboxes for LEX-01, LEX-06 and LEX-07 are left unchecked on purpose: later 06-0x plans declare the same IDs (shared-ID gate, #2388), so they flip to Complete when the last declaring plan finishes.
- Reading choice differs from v0.96 in tone sandhi (e.g. 一下 `ㄧ ㄒㄧㄚˋ` vs `ㄧˊ ㄒㄧㄚˋ`); harmless for rhyme (tones are stripped) and recorded as TEST-CHECKLIST 06-01-7.

## Authentication Gates

None (no AI key or login needed; downloads came through the proxy without credentials).

## Known Stubs

None. (`tools/lexicon/rules/reading-overrides.json` is intentionally `{}` and `--strict` is accepted as an alias of `verify` until 06-05, both stated in the plan.)

## Threat Flags

None beyond the plan's threat model (the only new network surface is the build tool's fetch of pinned raw.githubusercontent.com URLs, T-06-01).

## For Andy (TEST-CHECKLIST)

- 必測: 06-01-1 to 06-01-3. 建議測: 06-01-4 to 06-01-7.
- 待 Andy 決定／動手: **D-18** (pack files live in the repository and its history; about 7 MB now, about 18 MB when all three exist).
- 自主決定: 06-CTX-8, 06-CTX-9, 06-01-8, 06-01-9, 06-01-10.

## Next Phase Readiness

Ready for 06-02 (site loader reads `data/packs/index.json`; owns the `?v=` 0.96.7 to 0.96.8 bump). The parser registry, lock schema and pack/manifest writers are in place for 06-04 to add mcbopomofo and vanguard-tw.

## Self-Check: PASSED

All key files exist, the three task commits (facbefd, 8df1e57, d93f50b) are in history, task acceptance criteria were re-run after the last commit (verify, 68 unit tests), the plan-level verification above was run, and the full npm test shows only the known cloud-only worker-config failure.
