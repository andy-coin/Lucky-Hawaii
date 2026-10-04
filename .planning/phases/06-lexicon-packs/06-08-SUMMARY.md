---
phase: 06-lexicon-packs
plan: 08
subsystem: lexicon-packs-verification
tags: [lexicon-packs, comprehensibility-standard, sample-list, calibration, phase-gate, test-checklist]
status: complete

requires:
  - phase: 06-lexicon-packs (06-07)
    provides: RecordedProvider, resolve, select_provider, PROMPT_VERSION, NO_PROVIDER_MESSAGE, recorded-judgments fixture
provides:
  - "tools/lexicon/tests/fixtures/samples.tsv (18 rows, columns 詞 注音 來源數 詞頻 預期 規則 說明) and tests/test_samples.py: the LEX-03 comprehensibility standard pinned inside npm test (C5)"
  - "committed-judgments anchor test: when judgments.tsv holds 三酸甘油酯 / 聚乙烯醇縮丁醛 / 分散式雜湊表 their verdicts must be K / D / D (T-06-25)"
  - "tools/lexicon/judgments/calibration.tsv (60 words: 36 K, 24 D, none Simplified) and judge.load_calibration / judge.run_eval"
  - "build.py eval subcommand (--provider, --recorded, --model, --min-agree, --calibration; exit 0 / 1 / 2 / 4) and npm run lexicon:eval"
  - "tests/lexicon-build.spec.mjs runs unittest verbosely and asserts test_samples ran"
  - "TEST-CHECKLIST: Phase 6 總覽, 06-08-1..7, D-20 extended with the calibrate-first step, 06-08-8..12"
affects: []

plan_head_before: 7273f122ca3639620f00e3fb4b058f902c50d0d8
plan_head_after: 8e51f484acfc65856591f5b56bca01d0afa7c364

actuals:
  tokens: 6600     # chars/4 over the added lines (tests, code, README, calibration, samples, checklist)
  tasks: 3
  commits: 3       # MEASURED: git rev-list --count 7273f12..HEAD, before the docs commit

tech-stack:
  added: []        # no packages installed
  patterns:
    - "Sample-list test: one TSV of expected outcomes run through classify + resolve with recorded verdicts, one subTest per word, and the spec asserts the test name appears so it cannot be silently dropped"
    - "Calibration before spend: a labelled word list is sent to the provider in one request, nothing is written, disagreements are listed word by word"

key-files:
  created:
    - tools/lexicon/tests/fixtures/samples.tsv
    - tools/lexicon/tests/test_samples.py
    - tools/lexicon/judgments/calibration.tsv
    - tools/lexicon/tests/test_eval.py
  modified:
    - tools/lexicon/lex/judge.py
    - tools/lexicon/build.py
    - tools/lexicon/tests/fixtures/recorded-judgments.tsv
    - tools/lexicon/tests/fixtures/rule-inputs/TWPhrases.txt
    - tests/lexicon-build.spec.mjs
    - package.json
    - tools/lexicon/README.md
    - .planning/TEST-CHECKLIST.md

key-decisions:
  - "Calibration passes at 90 % agreement (60 words go out as one request of at most 60); words the AI leaves unanswered count as disagreement and are reported separately"
  - "eval writes no file at all and reuses select_provider / redact, so it can never change judgments.tsv"
  - "The AI-pass checklist item stays D-20 (extended with a calibrate-first step) instead of adding a duplicate D-number: D-19 is already the 06-04 pack-preference question and D-20 is the 06-07 AI pass"

patterns-established:
  - "Phase gate recorded as commands with results (below)"

requirements-completed: [LEX-03, LEX-04, LEX-01, LEX-02, LEX-05, LEX-06, LEX-07]

duration: ~1.5 h of work plus three ~6.4 min full test runs
completed: 2026-10-04
---

# Phase 6 Plan 08: Sample list, calibration, phase gate Summary

The 「可理解性」 standard is now pinned by an automatic sample list (三酸甘油酯 keep; 聚乙烯醇縮丁醛 and 分散式雜湊表 deleted by recorded AI verdicts, plus rule-decided rows for China terms, Simplified, rare characters, format, keep list and the frequency guard), Andy has a one-command calibration (`npm run lexicon:eval`) to run before spending his free quota on the real pass, and the phase gate is green. Nothing real was sent to an AI: no key and no Worker exist in the cloud.

## What was done

**Task 1 (tracer), commit e22aa4e**
- `samples.tsv`: 18 rows. Expected outcomes: 三酸甘油酯 KEEP (G-single-source, recorded K); 聚乙烯醇縮丁醛, 分散式雜湊表 DELETE R5-ai-incomprehensible (synthetic evidence rows, n 1, freq 0, noted as such); 支持 and 社區 KEEP K1-pass despite being OpenCC keys (frequency guard); 阿司匹林, 打印機 DELETE R3-china-term; 电脑 R1-simplified; 㹴犬 R2-rare-char; 感謝祢 KEEP (char-allow); 剪貼板 KEEP K0-allowlist; 𰻞𰻞麵 R0-nonbmp; 一九九○ R0-nonhan; 腳踏車, 青梅竹馬, 溫故知新 KEEP K1-pass; 御劍飛行 KEEP (gray, recorded K).
- `test_samples.py` (6 tests): row-count and anchors, every row's decision and rule id (one subTest per word), the three anchors by name, an unjudged gray word stays pending and kept, synthetic rows are labelled, and the committed `judgments.tsv` anchor check (prints 「judgments.tsv 尚無 <詞>，略過」 for absent anchors, fails on a wrong verdict).
- Fixture growth kept minimal: `社區<TAB>社群 社區` copied verbatim from the cached real TWPhrases.txt; `御劍飛行 K` added to recorded-judgments.tsv. The other characters needed no new fixture lines (Big5 and the existing 電/脑/祢 rows cover them).
- `tests/lexicon-build.spec.mjs` now runs unittest with `-v` and requires `test_samples` and the per-row test to appear in the output.

**Task 2, commit 1fdbbc1**
- `calibration.tsv`: 36 K (日常、口語、閱讀、文學、小說、課本文言、常見專有名詞 incl. 三酸甘油酯) and 24 D (極冷僻學術、專業術語、難懂古語 incl. 聚乙烯醇縮丁醛, 分散式雜湊表); borderline words avoided; verified free of Simplified characters by a test.
- `judge.load_calibration` (skips comments, rejects bad labels, bad words, duplicates, missing labels) and `judge.run_eval` (batches of at most 60, prints 「詞：標準 K，AI 回答 D」 per disagreement, 「一致率 90%」, pass/fail guidance; exit 0 / 1 / 2 / 4; provider errors are redacted).
- `build.py eval` and `npm run lexicon:eval`; README section 「先校準再判斷」 and command-table row.
- `test_eval.py` (18 tests): every behaviour in the plan (100 %, 6 of 60 wrong = 90 % passes, 7 wrong fails and lists all 7, unanswered counted separately, no provider exit 2, batch size cap, provider error exit 4 with key redacted), CLI exit codes, directory and sha256 unchanged (nothing written), `--min-agree` validation, bad calibration file exit 2, package.json script.

**Task 3, commit 8e51f48** (TEST-CHECKLIST) plus the phase gate below.

## Phase gate

| Check | Result |
|-------|--------|
| `python3 -B -m unittest discover -s tools/lexicon/tests -t tools/lexicon` | 255 tests OK (231 after 06-07; +6 test_samples, +18 test_eval) |
| `npm test` after Task 1 / after Task 2 / final after the checklist commit | 421 passed / 27 skipped / 1 failed each time; the one failure is the known cloud-only `tests/worker-config.spec.mjs:53` (proxy WARNING), unmodified |
| `git diff --exit-code 6d65638 -- tests/golden data/wordlist-meta.json 'data/wordlist-c*.json' data/wordlist-overrides.json` | empty, exit 0 |
| `git diff --quiet 078c5d1 -- tests/golden` | exit 0 |
| `npm run lexicon:build` (complete cache) then `git status --porcelain` | build and strict verify OK, porcelain empty (no-op) |
| `python3 -B tools/lexicon/build.py verify --strict` | 驗證通過：4 個詞庫包（嚴格） |
| `grep -o '?v=0\.96\.8' index.html \| wc -l` | 27; no other `?v=` value present |
| `find . -name __pycache__ -not -path './node_modules/*'` | none |
| tracked raw upstream files (tsi.csv, BPMFMappings, phrase.occ, phrases-*, STCharacters, TSCharacters, TWPhrases, 國字表) | only `tools/lexicon/tests/fixtures/rule-inputs/{STCharacters,TSCharacters,TWPhrases}.txt` |
| `GEMINI_API_KEY= LEX_AI_URL= npm run lexicon:eval; echo $?` | 2, working tree unchanged |
| `grep -rn "AIza" tools/lexicon` / secrets | none |

Final per-pack state (unchanged since 06-07; no AI pass): 新酷音 version 2.c1553b706b, 128,841 entries, gray 13,365 (pending 13,365); 小麥注音 2.89e6dcffac, 139,865 entries, gray 13,399 (pending 13,399); 唯音台灣詞庫（精簡版） 2.3f0521dcc1, 64,637 entries, gray 6,867 (pending 6,867). v0.96 default files and golden snapshots untouched.

## TEST-CHECKLIST items added

- Phase 6 總覽 paragraph (four packs, how to switch, where reports are, the AI commands, decisions D-4 and D-16 to D-20) at the top of the Phase 6 必測 section.
- 必測: 06-08-1 (switch through all packs and back), 06-08-2 (About follows the pack), 06-08-3 (write with each pack, relates to D-19).
- 建議測: 06-08-4 (report spot-check), 06-08-5 (original-tone reading display), 06-08-6 (eval without key exits 2), 06-08-7 (read the calibration list).
- 待 Andy 決定／動手: D-20 relabelled 「06-07／06-08」 with a new step 1.5 (run `npm run lexicon:eval` first, 90 % or more) and a question on what to do below 90 %.
- 自主決定: 06-08-8 (single 0.96.8 bump), 06-08-9 (calibration list drafted by Claude, editable), 06-08-10 (eval sends one request, saves nothing), 06-08-11 (synthetic sample rows and the anchor guard), 06-08-12 (roll-up of the other Phase 6 autonomous calls with pointers to where each is recorded).

## Deviations from Plan

**1. [Interface] No new D-19** — the plan asked for 「D-19（06-07/06-08）」, but D-19 already exists (06-04 pack preference) and D-20 already is the 06-07 AI pass. I extended D-20 (relabelled 「06-07／06-08」, calibrate-first step added) instead of adding a duplicate, so references stay consistent. The plan's grep `D-19（06-07/06-08）` therefore finds nothing; `lexicon:judge` and `詞庫包` greps pass.

**2. [Plan literal] 自主決定 numbering** — the plan said to continue 06-CTX-N; the Phase 6 executors had already moved to per-plan ids (06-05-7, 06-07-6 and so on), so the new entries are 06-08-8..12. Items already recorded earlier (two-pack browser cache, estimate gate, direct key first, 100 frequency guard, report location, Python 3.9) are pointed to in 06-08-12 rather than repeated; 24,000 words per pack file, pack names and the Phase 6 total are written out there.

**3. [Rule 1 - Bug, in my own edit] unittest flag order** — the first spec edit put `-v` before `discover`, which Python rejects (`unrecognized arguments`); fixed before commit by placing `-v` after the discover options.

**4. [Rule 2 - Correctness] Extra checks beyond the plan** — calibration list rejects duplicates and malformed rows (it is the standard itself, so it must not be silently skipped), a test scans it for Simplified characters, and eval reports provider errors with exit 4 and redaction.

**Total deviations:** 1 interface, 1 numbering, 1 self-fixed, 1 correctness set, 0 architectural.

## Authentication Gates

None. The Gemini key (D-4) and the real calibration and judging runs are documented post-phase actions for Andy (D-20), not checkpoints.

## Known Stubs

None. The committed judgments file is header-only until Andy's AI pass, which is the documented state (gray words are kept and counted as pending); the calibration command has never talked to a real provider (verified against the recorded provider and, since 06-07, fake servers for the adapters).

## Threat Flags

None beyond the plan's threat model. T-06-25 mitigated (anchor test on the committed judgments), T-06-26 mitigated (eval reuses select_provider and redaction, writes no files, prints no environment values; tests assert the directory and sha256 are unchanged and that a key never appears in output), T-06-SC mitigated (no installs; package.json gains one script).

## Items for Andy

- 待 Andy 決定／動手: D-20 (calibrate with `npm run lexicon:eval`, then `npm run lexicon:judge`; needs the D-4 key), plus the existing D-16 to D-19 decisions.
- 自主決定: 06-08-8 to 06-08-12 (calibration list is Claude-drafted and editable).

## Self-Check: PASSED

Created files exist (`samples.tsv`, `test_samples.py`, `calibration.tsv`, `test_eval.py`); commits e22aa4e, 1fdbbc1 and 8e51f48 are in history; the last full `npm test` ran on the committed code and shows only the known cloud-only failure.
