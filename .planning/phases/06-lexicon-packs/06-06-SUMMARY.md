---
phase: 06-lexicon-packs
plan: 06
subsystem: lexicon-packs-reports-rescue
tags: [lexicon-packs, reports, rescue, stats, verify, r3-gray, keep-json]
status: complete

requires:
  - phase: 06-lexicon-packs (06-05)
    provides: removed.ndjson rows (rule, reason, src, n), apply_rules counts identity, keep.json honoured as K0, gray counts in meta
provides:
  - "tools/lexicon/lex/report.py: pick_samples, build_stats, top_chars, render_report, write_report"
  - "tools/lexicon/lex/__init__.py: estimate_tokens + PER_WORD_IN / PER_WORD_OUT / PER_REQUEST_IN / DEFAULT_BATCH (06-07 reuses them)"
  - "tools/lexicon/reports/{chewing,mcbopomofo,vanguard-tw}/REPORT.md + stats.json (generated on every build, byte-identical on rebuild)"
  - "pack.verify checks reports/<id>/stats.json, REPORT.md, removed.ndjson: kept == meta.entries, removed == ndjson lines, kept + removed == in_scope, by_rule sums and per-rule counts, gray_pending <= gray, version not stale"
  - "build.py rescue WORD [WORD ...] [--rebuild] (keep.json sorted/unique atomic write, per-pack rule + reason + overrides line, exit 2 on invalid input without writing)"
  - "tools/lexicon/rules/r3-gray.json + rule G-china-term (pre-task): doubtful China-flavoured computing terms are kept and flagged gray instead of being permanently kept in keep.json"
affects: [06-07, 06-08]

plan_head_before: 47d8b8ec2f930ff9ae70d3c8bf3a66d6c2b793c2
plan_head_after: 0274b46cd246645c2a5ff674ab603d22345bfca0

actuals:
  tokens: 12700    # chars/4 over the added lines of code, tests, README and rule files (generated reports and checklist excluded)
  tasks: 2         # plus the orchestrator's pre-task
  commits: 3       # MEASURED: git rev-list --count 47d8b8e..HEAD (pre-task + Task 1 + Task 2), before the docs commit

tech-stack:
  added: []        # no packages installed
  patterns:
    - "Reports are a pure function of (cfg, meta, removed rows, gray rows, multi-reading rows, china-kept rows); samples seeded by '<id>:<version>:<rule>', no timestamps except meta.built"
    - "collect(..., multi_out=None) and apply_rules extra output keys are additive, so existing callers and tests are unchanged"
    - "verify recomputes the report identities from files, so a report cannot silently disagree with its pack (T-06-28)"

key-files:
  created:
    - tools/lexicon/lex/report.py
    - tools/lexicon/rules/r3-gray.json
    - tools/lexicon/tests/test_report.py
    - tools/lexicon/reports/{chewing,mcbopomofo,vanguard-tw}/REPORT.md
    - tools/lexicon/reports/{chewing,mcbopomofo,vanguard-tw}/stats.json
  modified:
    - tools/lexicon/build.py
    - tools/lexicon/lex/__init__.py
    - tools/lexicon/lex/pack.py
    - tools/lexicon/lex/parse.py
    - tools/lexicon/lex/rules.py
    - tools/lexicon/rules/keep.json
    - tools/lexicon/tests/test_pack.py
    - tools/lexicon/tests/test_rules.py
    - tools/lexicon/tests/fixtures/rule-inputs/TWPhrases.txt
    - tools/lexicon/README.md
    - tests/lexicon-packs.spec.mjs
    - data/packs/{chewing,mcbopomofo,vanguard-tw}/meta.json
    - .planning/TEST-CHECKLIST.md

key-decisions:
  - "keep.json now holds only the 15 clearly everyday Taiwan words; 12 doubtful China-flavoured computing terms live in rules/r3-gray.json and become gray (G-china-term), kept now and judged later by the AI pass (C2/C3)"
  - "Report samples are seeded per rule with '<id>:<version>:<rule>' (not one shared '<id>:<version>' generator) so one rule's sample does not shift when another rule's row count changes"
  - "rescue prints an explanation instead of an overrides line for R0 (format) removals, because the site cannot take that format"
  - "keep.json and r3-gray.json use 2-space JSON indent (the rescue writer's format) so the first rescue does not churn the file"

patterns-established:
  - "Tracer gate satisfied: unit tests, build all, verify --strict, fingerprint check and full npm test were green on the report slice before the rescue task was added"

requirements-completed: []   # LEX-05 is also declared by 06-08; it flips when the last declaring plan finishes (same rule as 06-01 .. 06-05)

duration: ~1 h 40 min of work plus four ~6.5 min full test runs
completed: 2026-10-04
---

# Phase 6 Plan 06: Deletion reports and rescue Summary

Every pack now has a Traditional Chinese deletion report Andy can spot-check (counts per rule, 20 seeded samples per rule, gray words with the estimated AI cost, the characters behind most deletions, China-term matches kept by the frequency guard, multi-reading words), and a wrongly removed word comes back with one command (`build.py rescue`) or by pasting one printed line into the correction file. The reports live outside `data/`, are byte-identical on rebuild, and `verify` recomputes their numbers. Golden tests, default v0.96 files and `?v=` (0.96.8) are untouched.

## Pre-task (orchestrator request): re-split keep.json, commit f0ae01b

06-05 had put 27 words into `keep.json`. keep.json bypasses the AI entirely, but CONTEXT C2/C3 says doubtful words should be gray and judged later. Re-classified:

| Group | Words | Mechanism |
|-------|-------|-----------|
| Stay in keep.json (15, permanent K0 keep) | 丁丁當當 丁當 奔馳 萬象 低級 查看 發送 壁紙 複印 掛斷 禁用 溢出 呼出 觸摸 拋出 | unchanged |
| Moved to `rules/r3-gray.json` (12, kept now, flagged 待 AI 判斷) | 創建 兼容 全局 調度 交互 運行 仿真 高清 查找 屏蔽 刷新 點擊 | `classify`: an R3 hit (exact TWPhrases key, frequency < 100) whose word is in `ctx.r3_gray` returns `('gray', 'G-china-term', tw)` instead of delete |

Details: `RuleContext.r3_gray`, `load_r3_gray`, `paths['r3_gray']` in build.py; `apply_rules` counts `stats.china_gray`; `verify --strict` does not flag r3-gray words as China-term leftovers; keep.json still wins over r3-gray (K0 is first) and the frequency guard still keeps words with frequency >= 100 as before. Rebuilt packs: word lists and versions unchanged (the 12 words were already kept), only `meta.json` gray counts moved (+6 chewing, +10 mcbopomofo, +3 vanguard-tw, new `china_gray`, `keep_allow` 25/24/12 down to 15/14/6 because only the 15 permanent words are counted now). Unit tests cover one word on each side (奔馳 stays K0, 創建 becomes gray; plus delete-without-the-list, keep.json beats r3-gray, frequency guard, end-to-end counts, strict verify). Recorded under TEST-CHECKLIST 自主決定 06-06-1 with both lists.

## What was done

**Task 1 (tracer): reports, commit 966865e**
- `lex/__init__.py`: `estimate_tokens(n_words, batch_size=150)` and the 7 / 3 / 600 constants (33,800 words gives 226 requests, matching RESEARCH).
- `lex/report.py`: `pick_samples` (sorted rows, `random.Random(seed).sample`, displayed sorted), `top_chars`, `build_stats`, `render_report`, `write_report` (stats.json indent 2, sorted keys; REPORT.md with the plan's sections plus a G-china-term list).
- `parse.collect(..., multi_out=None)` collects multi-reading words (chosen reading plus the others); `apply_rules` additionally returns `gray_rows` and `china_kept_rows`.
- `build.py`: writes the report per pack after `write_pack` and prints the report path.
- `pack.verify`: `_verify_report` requires stats.json, REPORT.md and removed.ndjson and re-checks every identity (T-06-28).
- `tests/test_pack.py` fixture now writes a consistent report; `tests/test_report.py` (16 tests at that commit).

**Task 2: rescue, commit 0274b46**
- `build.py rescue WORD [WORD ...] [--rebuild]`: NFC, 2-11 BMP CJK ideographs only (else `停止：只能救回 2～11 個漢字的詞：…`, exit 2, nothing written, even when other words in the same call were valid), sorted/unique atomic write of keep.json (`KEEP_PATH` and `REPORTS_ROOT` are module globals, patched by tests), per pack prints `<包名>：<rule>（<reason>）` and the compact `{"w","z","p"}` line, prints 「目前沒有詞庫包刪除這個詞，已加入保留名單…」 when nothing removed it, ends with 「重新執行 npm run lexicon:build 後生效」 unless `--rebuild` runs build + verify --strict.
- 7 rescue unit tests (output, rebuild brings the word back and removes it from the removed list, no-pack-removed note, R0 note, invalid input exit 2 with unchanged bytes, twice = once and sorted, real keep.json still sorted) and the site test 「詞庫包：刪除清單的詞放進修正檔就會回來」 (first row of chewing removed.ndjson pasted into overrides `added`, chewing active: word appears once with its reading, no console errors).
- README sections 「刪除報告在哪裡、怎麼看」 and 「誤刪了怎麼救回」.

## Per-pack results (stats.json, committed)

| Pack | In scope | Kept | Removed | R0 | R1 | R2 | R3 | Gray (single / china-gray) | Multi-reading kept | China guard keeps | Est. AI requests | Est. tokens (in / out) | Version |
|------|---------|------|---------|----|----|----|----|----------------------------|--------------------|-------------------|------------------|------------------------|---------|
| chewing | 128,973 | 128,841 | 132 | 0 | 0 | 18 | 114 | 13,365 (13,359 / 6) | 4,887 | 79 | 90 | 147,555 / 40,095 | 2.c1553b706b |
| mcbopomofo | 140,017 | 139,865 | 152 | 7 | 5 | 74 | 66 | 13,399 (13,389 / 10) | 5,168 | 42 | 90 | 147,793 / 40,197 | 2.89e6dcffac |
| vanguard-tw | 64,793 | 64,637 | 156 | 12 | 2 | 86 | 56 | 6,867 (6,864 / 3) | 3,525 | 64 | 46 | 75,669 / 20,601 | 2.3f0521dcc1 |

Estimated AI pass for all pending gray words at batch 150: about 226 requests, roughly 0.37 M input plus 0.10 M output tokens across the three packs (the judgments cache is keyed by word, so overlapping words are judged once; real volume will be lower).

Report locations: `/home/user/Lucky-Hawaii/tools/lexicon/reports/{chewing,mcbopomofo,vanguard-tw}/REPORT.md` (and `stats.json`, `removed.ndjson` beside them). Nothing in `js/` or `index.html` references them (a unit test checks this); they are not under `data/`.

## Verification

| Check | Result |
|-------|--------|
| `python3 -B -m unittest discover -s tools/lexicon/tests -t tools/lexicon` | 157 tests OK (was 127 after 06-05; +7 r3-gray, +23 in test_report.py) |
| `python3 -B tools/lexicon/build.py all` / `verify` / `verify --strict` | exit 0, 「驗證通過：4 個詞庫包（嚴格…）」 |
| Reproducibility | sha256 fingerprint over `data/packs` + `tools/lexicon/reports` identical before and after a second `build` |
| `grep -rn "tools/lexicon/reports" js index.html` | 0 lines |
| `rescue abc` | exit 2, keep.json unchanged |
| `npx playwright test tests/lexicon-packs.spec.mjs -g "放進修正檔就會回來"` | 1 passed |
| `npm test` (before each of the three commits) | pre-task 420 passed / 27 skipped / 1 failed; Task 1 420 / 27 / 1; Task 2 421 / 27 / 1; the one failure is always the known cloud-only `tests/worker-config.spec.mjs:53` |
| Golden / v0.96 files / `?v=` | untouched |

## Deviations from Plan

**1. [Orchestrator pre-task] keep.json re-classification (commit f0ae01b)** — not in the plan; requested by the orchestrator before Task 1. See the section above. Impact: new file `rules/r3-gray.json`, new rule id `G-china-term`, `meta.stats.china_gray`, `keep_allow` counts changed in the three metas, fixture TWPhrases gained two real lines (奔馳, 創建). The `commits` count is 3 instead of 2 because of this commit.

**2. [Rule 1 - interface] Sample seed is per rule** — the plan says `random.Random('<id>:<version>')`; I seed `'<id>:<version>:<rule>'` (and `:gray`, `:multi`) so each section is stable independently. Same determinism and same version dependence; recorded as TEST-CHECKLIST 06-06-7.

**3. [Rule 2 - correctness] rescue refuses to offer an overrides line for R0 removals** — a word removed for format reasons cannot be rescued by keep.json (K0 requires a valid format) and the site cannot ingest it, so the command explains instead of printing a misleading line. Recorded as 06-06-12.

**4. [Rule 3 - test fixture] `test_pack.py` fixture writes a report** — `verify` now requires reports for every non-legacy pack, so the demo pack fixture writes a consistent report through the new API.

**5. [Plan literal] keep.json indent** — the 06-05 file used 1-space indent; the plan's rescue writer uses 2, so both rule files were rewritten at indent 2 (content unchanged) to keep the first rescue from churning the file. The plan's "keep.json stays `[]` unless 06-05 added real rescues" holds: it holds only the 06-05 rescues (now 15).

**Total deviations:** 1 orchestrator pre-task, 1 interface tweak, 2 auto-added correctness / blocking fixes, 1 formatting normalisation, 0 architectural.

## Authentication Gates

None.

## Known Stubs

None. (`gray_pending` equal to `gray` remains the documented placeholder until 06-07 adds AI judgments; the report says so by showing the pending count and cost estimate.)

## Threat Flags

None beyond the plan's threat model. T-06-18 (rescue input NFC-normalised and limited to 2-11 BMP CJK ideographs, atomic sorted write, exit 2 without writing: tested), T-06-28 (verify recomputes kept / removed / in-scope / per-rule identities from the files: tested with off-by-one, line-count and stale-version cases) are mitigated as planned; T-06-19 accepted (reports contain only public lexicon words, counts and upstream identifiers). No new network, auth or storage surface.

## For Andy (TEST-CHECKLIST)

- 必測: 06-06-2 (open a REPORT.md), 06-06-3 (spot-check samples), 06-06-4 (gray section and cost estimate), 06-06-9 (rescue 打印機 trial, then restore keep.json), 06-06-10 (invalid rescue input).
- 建議測: 06-06-5 (top characters and multi-reading section), 06-06-6 (rebuild leaves git clean).
- 待 Andy 決定／動手: none new.
- 自主決定: 06-06-1 (keep.json 15 stay / 12 gray split, please review both lists), 06-06-7 (sample seed), 06-06-8 (reports outside data/), 06-06-11 (site rescue step covered by an automated test), 06-06-12 (rescue design: R0 words, sorting, indent).

## Next Phase Readiness

Ready for 06-07 (AI judging of gray words): gray words are recomputed by `apply_rules` (now also returned as `gray_rows`, including `G-china-term` words that the AI pass should judge), `estimate_tokens` and its constants are in `lex/__init__.py`, and `meta.gray_pending` is what the report estimates from.

## Self-Check: PASSED

Created files exist (`tools/lexicon/lex/report.py`, `tools/lexicon/rules/r3-gray.json`, `tools/lexicon/tests/test_report.py`, the three `REPORT.md` and `stats.json`); commits f0ae01b, 966865e and 0274b46 are in history; the last `npm test` ran on the committed code and shows only the known cloud-only failure.
