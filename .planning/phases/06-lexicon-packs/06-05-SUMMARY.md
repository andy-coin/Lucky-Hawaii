---
phase: 06-lexicon-packs
plan: 05
subsystem: lexicon-packs-rule-layer
tags: [lexicon-packs, rules, simplified-chars, rare-chars, china-terms, gray, verify-strict, big5]
status: complete

requires:
  - phase: 06-lexicon-packs (06-01)
    provides: build.py pipeline, pack.write_pack / write_removed / write_notice, R0 (parse.normalise), choose_reading, lock sources opencc + tw-charlists (rule inputs, already cached)
  - phase: 06-lexicon-packs (06-04)
    provides: three independent packs in one format so the single-source (gray) rule can compare them
provides:
  - "tools/lexicon/lex/rules.py: big5_levels / check_big5, load_char_list / load_opencc_keys / load_twphrases / load_char_allow / load_keep_allow, RuleContext, load_rule_context, classify (K0 > R0 > R1 > R2 > R3 > G > K1), apply_rules (cross-source evidence + counts identity), CHINA_FREQ_MIN=100, RULE_REASONS, simplified_chars_in, shipped_text_problems"
  - "tools/lexicon/rules/char-allow.txt (15 chars with reasons), china-terms-extra.txt (header only), keep.json (27 words)"
  - "build.py: two-phase build (parse every pack, then apply rules), --gray-policy p1|p2, verify --strict, shipped-text check; `all` now ends with verify --strict"
  - "Rebuilt chewing / mcbopomofo / vanguard-tw packs, rules_version 2, meta gray / gray_pending / gray_policy, removed.ndjson rows for R0-R3 with reason, src, n"
affects: [06-06, 06-07, 06-08]

plan_head_before: e0aaa22c69390e9a4cc1f5080ab465eba6caf281
plan_head_after: b9d63d7d01a1d18764bf80fcdf03fb116308746e

actuals:
  tokens: 16000    # chars/4 over the added lines of code, tests and fixtures (generated pack data excluded)
  tasks: 2
  commits: 1       # MEASURED: git rev-list --count e0aaa22..HEAD (one feature commit, before the docs commit); see deviations

tech-stack:
  added: []        # no packages installed
  patterns:
    - "Rule functions are pure (classify reads only RuleContext + evidence); build.py wires files, tests pass fixtures"
    - "Two-phase build: parse all packs, then classify with cross-source evidence, then write"
    - "Counts identity (entries + removed == in-scope words) asserted on every build and re-checked from the committed meta by a unit test"

key-files:
  created:
    - tools/lexicon/lex/rules.py
    - tools/lexicon/rules/char-allow.txt
    - tools/lexicon/rules/china-terms-extra.txt
    - tools/lexicon/rules/keep.json
    - tools/lexicon/tests/test_rules.py
    - tools/lexicon/tests/fixtures/rule-inputs/ (STCharacters, TSCharacters, TWPhrases, moe-common, moe-secondary excerpts)
  modified:
    - tools/lexicon/build.py
    - tools/lexicon/lex/__init__.py (RULES_VERSION '2')
    - tools/lexicon/lex/pack.py (NOTICE modification statement)
    - tools/lexicon/lex/parse.py (collect: one row per word, in_scope, dropped_readings)
    - tools/lexicon/README.md
    - tools/lexicon/tests/test_pack.py, test_parse.py
    - tests/lexicon-packs.spec.mjs (no longer pins 128,973)
    - data/packs/{index.json, chewing, mcbopomofo, vanguard-tw}/*
    - tools/lexicon/reports/{chewing,mcbopomofo,vanguard-tw}/removed.ndjson
    - .planning/TEST-CHECKLIST.md

key-decisions:
  - "倒三角形 was removed by R0 because the vanguard source itself has a 3-syllable reading for the 4-character word (a source data defect); R0 is not over-eager, so no R0 change"
  - "Big5 level counts are taken over the unified ideograph ranges only (5,401 / 7,650); the plan's wider range gives 7,652 because Python maps two Big5 codes to compatibility ideographs"
  - "keep.json seeded with 27 everyday Taiwan words found in the R3 deletions; char-allow.txt extended by 9 name/food characters"
  - "A word with a good and a bad reading keeps the word and silently drops the bad reading (no removed row), so entries + removed == in-scope always holds"

requirements-completed: []   # LEX-02, LEX-04, LEX-05 are also declared by later 06-0x plans; they flip when the last declaring plan finishes (same rule as 06-01 .. 06-04)

duration: ~1 h 10 min of work plus one ~6.4 min full test run
completed: 2026-10-04
---

# Phase 6 Plan 05: Rule layer (simplified, rare, China-term, gray, keep) Summary

The one command now cleans content, not just format: words with simplified-only or rare characters and Mainland-only terms are removed with a Traditional Chinese reason, words attested by only one pack stay as flagged gray, and a rescue list always wins. All three packs were rebuilt (rules_version 2) and `verify --strict` reports zero violations. Golden tests, default v0.96 files and `?v=` (0.96.8) are untouched.

## 倒三角形 finding (extra check requested by the orchestrator)

Row in `tools/lexicon/reports/vanguard-tw/removed.ndjson`:
`{"w":"倒三角形","z":"ㄉㄠˋ ㄙㄢ ㄐㄧㄠˇ","p":0,"rule":"R0-syllables","reason":"注音音節數與字數不符","src":["mcbopomofo","vanguard-tw"],"n":2}`

- **Cause: a genuine data defect in the source, not an over-eager rule.** The vanguard file `phrases-tabe-cht.txt` (line 30951) lists the 4-character word with only 3 syllables (ㄉㄠˋ ㄙㄢ ㄐㄧㄠˇ, missing ㄒㄧㄥˊ). A reading that does not match the character count cannot be used by the site (it indexes syllable by character), and RESEARCH already recorded 倒三角形 and 擸𢶍 as the two syllable-count defects of this source.
- It is **not** removed from the other packs: mcbopomofo's `BPMFMappings.txt` has the correct 4-syllable reading, so 倒三角形 is still in the mcbopomofo pack (checked in `data/packs/mcbopomofo/c00.json`); chewing never had it.
- No R0 change. I did not invent the missing syllable (source is source). Unit test `test_daosanjiaoxing_is_a_source_defect_not_an_over_eager_rule` plus the earlier parser test pin both sides (bad reading deleted, correct reading kept).
- The other 06-04 R0 casualties are legitimate format drops, unchanged: 一四〇 / 菜々子 (〇 and 々 are not in the BMP CJK ideograph ranges the site's character test uses), 𰻞𰻞麵 (non-BMP breaks JS length), 哆啦Ａ夢 (full-width Latin letter). Recorded for Andy under 自主決定 06-05-7 and the 06-04-9 note.

## What was done

Both plan tasks were implemented and verified together and landed as one commit `b9d63d7` (see deviations): the data files of the two tasks are generated by the same build, and a half-state (rules_version 2 without regenerated packs) fails the offline verify test.

**Task 1 (tracer) slice, R0 + R1 + R2 + char-allow + Big5 + shipped text**
- `rules.py`: `big5_levels` from the stdlib codec, `check_big5` (LexError 「Python 的 Big5 字表與預期不同（第一級 N、第二級 M）」), MOE list loaders, OpenCC key loaders, `load_char_allow`, `RuleContext` (taiwan_chars = MOE 常用 ∪ 次常用 ∪ Big5 ∪ char-allow; simp_only = ST keys − MOE − TS keys − Big5 − char-allow), `load_rule_context` with the MOE count self-checks (常用 = 4,808 distinct; 次常用 parsed = 6,343, inside 6,300-6,400), `classify`, `simplified_chars_in`.
- `char-allow.txt`: the six seeds 庄 厘 祢 疱 咤 咏 plus 喆 碁 堃 煊 嫺 魩 焿 蟎 坂, each with a reason.
- `build.py`: rule paths resolved from the pinned lock (sha256 already checked by `cached_files`), NOTICE/LICENSE scan after every build (LexError on any simplified-only character), `verify --strict` (offline verify + rule context from cache; missing cache gives 「找不到規則輸入快取，請先執行 npm run lexicon:build」, exit 2).
- `RULES_VERSION` '2'; NOTICE 改作說明 now names the content rules (licence and source lines unchanged).

**Task 2 slice, R3 + gray + K0**
- R3: exact TWPhrases key (length >= 2, key != value) or `china-terms-extra.txt` entry, own-source frequency < `CHINA_FREQ_MIN` (100), reason 「中國用語（台灣多作「{tw}」）」; never containment.
- Gray: `n == 1` and no delete rule gives `('gray', 'G-single-source')`; `--gray-policy p2` (off by default) adds `G-zero-freq`. meta gets `gray`, `gray_pending` (equal until 06-07), `gray_policy`, plus `stats.rules`, `stats.china_kept`, `stats.keep_allow`, `stats.in_scope`.
- K0: `keep.json` list plus `data/wordlist-overrides.json` `added[].w` (currently empty), only when the word passes R0.
- `apply_rules`: cross-source index (word to {pack: freq}) from R0-passing entries; removed rows carry `w, z, p, rule, reason, src (sorted pack ids holding the word), n`; per pack `entries + removed == in_scope` is asserted (LexError otherwise).
- `verify --strict` also reports pack entries that are exact china_terms keys with p < 100 and not in keep_allow.

## Per-pack results (committed data, rules_version 2)

| Pack | In-scope words | Entries (kept) | Removed | R0 | R1 | R2 | R3 | Gray (= pending) | China terms kept by the guard (freq >= 100) | K0 rescued present | Version |
|------|---------------|----------------|---------|----|----|----|----|------------------|---------------------------------------------|--------------------|---------|
| chewing | 128,973 | 128,841 | 132 | 0 | 0 | 18 | 114 | 13,359 | 79 | 25 | 2.c1553b706b |
| mcbopomofo | 140,017 | 139,865 | 152 | 7 (nonbmp 2, nonhan 5) | 5 | 74 | 66 | 13,389 | 42 | 24 | 2.89e6dcffac |
| vanguard-tw | 64,793 | 64,637 | 156 | 12 (nonbmp 4, nonhan 7, syllables 1) | 2 | 86 | 56 | 6,864 | 64 | 12 | 2.3f0521dcc1 |

Removal counts fall in the plan's 20-2,000 range and gray in 3,000-25,000 for every pack; the RESEARCH expectations (149/193/173 deletions, 13,354/13,378/6,826 gray, 79/42/64 guard keeps) are matched closely, the difference being the 27 rescued words and the 9 extra allowed characters (see decisions). `data/packs` is still ~18 MB. MOE parsed counts: 常用 4,808, 次常用 6,343. Big5 levels 5,401 / 7,650.

keep.json additions (27 words, reason: everyday Taiwan words that only appear in OpenCC's conversion table): 丁丁當當 丁當 奔馳 萬象 低級 查看 交互 運行 發送 創建 調度 拋出 呼出 溢出 觸摸 壁紙 點擊 複印 仿真 高清 查找 禁用 掛斷 全局 兼容 屏蔽 刷新. Everything else on the R3 list (about 200 words, e.g. 信息 軟件 打印機 算法 接口 默認 硬盤 阿司匹林 局域網 剪貼板) stays deleted. Pitfall 1 check: the highest-frequency R3 rows were reviewed by eye; 支持 設備 用戶 文件 are guarded by the frequency rule and appear in no removed list.

## Verification

| Check | Result |
|-------|--------|
| `python3 -B -m unittest discover -s tools/lexicon/tests -t tools/lexicon` | 127 tests OK (was 87; 40 new in test_rules.py) |
| `python3 -B tools/lexicon/build.py all` / `verify` / `verify --strict` | exit 0, 「驗證通過：4 個詞庫包（嚴格：…）」 |
| Reproducibility | fingerprint (sha256 over every file under data/packs and tools/lexicon/reports) identical across two consecutive builds; `git status` unchanged after the second build |
| `npm test` (final code state, before the feature commit) | 420 passed, 27 skipped, 1 failed (known cloud-only `tests/worker-config.spec.mjs:53`) |
| Plan acceptance greps (R2 + reasons present, 支持 not removed, no G rows, gray 3,000-25,000 and pending == gray, version starts with 2., CHINA_FREQ_MIN == 100, 祢 in char-allow) | all pass |
| Golden / v0.96 files / `?v=` | untouched (`git diff` shows no change under data/wordlist*, js, css, index.html, tests/golden) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug in plan constant] Big5 level 2 is 7,652 with the plan's range, not 7,650**
- **Found during:** Task 1 (first run of `check_big5`)
- **Issue:** the plan counts CJK ranges including U+F900-FAFF; Python's `big5` codec maps Big5 0xC94A (兀) and 0xDDFC (嗀) to compatibility ideographs U+FA0C / U+FA0D, giving 7,652.
- **Fix:** count only the unified ranges (U+3400-4DBF, U+4E00-9FFF), which gives exactly 5,401 / 7,650. The two compatibility characters become ordinary characters after NFC (words never contain them) and 嗀 is in the MOE 次常用 list, so the allowed set is unaffected. Documented in the docstring and TEST-CHECKLIST 06-05-8.
- **Files modified:** tools/lexicon/lex/rules.py

**2. [Rule 1 - Counts identity] `collect` could break "entries + removed == in-scope words"**
- **Found during:** Task 2 design (the plan asserts the identity per pack)
- **Issue:** `collect` produced one removed row per bad (word, reading, rule), so a word with one good and one bad reading, or two bad readings, would be counted wrongly. Real data has none of these today (measured), but the identity must hold on any input.
- **Fix:** one removed row per word and only for words with no valid reading; a bad reading of a word that also has a valid one is dropped (counted in `stats.dropped_readings`); `stats.in_scope` added. Existing test_parse expectations updated (你好 with the extra "ni hao" reading no longer yields a row); output for the real sources is unchanged.
- **Files modified:** tools/lexicon/lex/parse.py, tools/lexicon/tests/test_parse.py
- **Commit:** b9d63d7

**3. [Rule 2 - Missing critical functionality] Everyday Taiwan words and names were being deleted**
- **Found during:** Task 2 step 6 (eye check of removed lists, plan Pitfall 1 warning sign)
- **Issue:** R3 deleted 奔馳, 萬象, 查看, 發送 and similar general words; R2 deleted Taiwan names and brands such as 宏碁 (freq 17,708), 陶喆, 王建煊, 游錫堃, 魩仔魚 because the characters are outside the MOE lists.
- **Fix:** 27 words into keep.json, 9 characters into char-allow.txt (listed above), with TEST-CHECKLIST items 06-05-5, 06-05-9, 06-05-10. This is the mechanism the plan prescribes ("add it to keep.json ... append a checklist entry").
- **Files modified:** tools/lexicon/rules/keep.json, tools/lexicon/rules/char-allow.txt
- **Commit:** b9d63d7

**4. [Process] Two plan tasks landed as one commit**
- Task 1 (tracer) and Task 2 share rules.py, build.py, the generated packs and the same rules_version bump; a Task-1-only commit would need the packs rebuilt without R3 / gray / K0 and a second ~6.5 min full test run, and the intermediate state is not a useful product. The tracer gate (end-to-end verify before expanding) was satisfied by running unit tests, `all`, `verify --strict` and the reproducibility check on the full build before committing. Impact: `commits: 1` instead of 2; `git revert b9d63d7` undoes both tasks together.

### Test updates caused by the rules (not new failures)

- `tests/lexicon-packs.spec.mjs` pinned the chewing count 128,973; it now asserts a 100,000-140,000 range from the manifest (the exact count changed to 128,841).
- `tools/lexicon/tests/test_pack.py` version test uses `RULES_VERSION` instead of a literal `'1.'`.

**Total deviations:** 3 auto-fixes, 1 process note, 0 architectural.

## Authentication Gates

None.

## Known Stubs

None. (`gray_pending` equal to `gray` is the documented placeholder until 06-07 adds AI judgments.)

## Threat Flags

None beyond the plan's threat model. T-06-15 (every removed row has rule id, reason, src, n; counts identity asserted on every build and re-checked by a unit test on the committed meta), T-06-16 (exact key + own-source frequency < 100, containment never used; tests pin 支持 kept and 打印機器人 untouched), T-06-17 (Big5 and MOE count self-checks stop the build; tests prove a patched count raises), T-06-27 (NOTICE/LICENSE scanned with the simplified-only set on every build and in `verify --strict`; no shipped text contains one) are mitigated as planned. No new network, auth or storage surface; the rule inputs are the already pinned, sha256-checked cache files and are never redistributed (MOE character lists are build-time inputs only; no CC BY-ND dictionary content is used).

## For Andy (TEST-CHECKLIST)

- 必測: 06-05-1 to 06-05-3 (`npm run lexicon:build`, `verify --strict`, switch to each new pack and search).
- 建議測: 06-05-4 (eyeball a few removed words per rule: R1 簡體 e.g. 北条 封装, R2 罕用字 e.g. 酶 裏, R3 中國用語 e.g. 打印機 局域網 阿司匹林; tell me if any were wrongly deleted), 06-05-5 (how to rescue a word), 06-05-6 (gray counts).
- 待 Andy 決定／動手: none new (D-4 / D-17 still cover the AI key for the gray words; D-19 still open).
- 自主決定: 06-05-7 (倒三角形 is a source defect), 06-05-8 (Big5 range), 06-05-9 (keep.json 27 words), 06-05-10 (char-allow +9 chars), 06-05-11 (R3 uses the pack's own frequency), 06-05-12 (how gray is counted), 06-05-13 (good + bad reading), 06-05-14 (NOTICE and version 2.x).

## Next Phase Readiness

Ready for 06-06 (reports and rescue command): removed.ndjson rows already carry `rule`, `reason`, `src`, `n` and the keep.json rescue list is honoured on every rebuild; 06-07 can recompute gray words with the same cross-source index (`apply_rules`) and fill `gray_pending`.

## Self-Check: PASSED

Created files exist (`tools/lexicon/lex/rules.py`, `tools/lexicon/rules/char-allow.txt`, `china-terms-extra.txt`, `keep.json`, `tools/lexicon/tests/test_rules.py`, `tools/lexicon/tests/fixtures/rule-inputs/`); commit `b9d63d7` is in history; the final `npm test` run was on the committed code and shows only the known cloud-only failure.
