---
phase: 06-lexicon-packs
plan: 07
subsystem: lexicon-packs-ai-judging
tags: [lexicon-packs, ai-judging, gemini, worker, gray-words, offline-tests, quota-guard]
status: complete

requires:
  - phase: 06-lexicon-packs (06-06)
    provides: gray_rows from apply_rules, estimate_tokens and its constants, report.py / stats.json, pack.verify report identities, rescue and keep.json
provides:
  - "tools/lexicon/lex/judge.py: PROMPT_VERSION lex03-v1, JUDGMENTS_HEADER, load_judgments, save_judgments, RecordedProvider, run_judge, build_prompt, parse_output, parse_retry_after_s, gemini_text, TextProvider, GeminiProvider, WorkerProvider, select_provider, ProviderError / ProviderBusy / ProviderAuthError / RequestCapReached"
  - "rules.resolve + apply_rules(parsed, ctx, judgments): gray + D -> R5-ai-incomprehensible (reason names the model), gray + K -> kept, unjudged -> kept and counted pending, keep.json / overrides win over D"
  - "build.py judge subcommand (--provider auto|gemini|worker|recorded, --recorded, --model, --batch-size 1..300, --max-requests, --max-tokens, --force, --dry-run, --rejudge, --rebuild, --gray-policy) and npm run lexicon:judge"
  - "tools/lexicon/judgments/judgments.tsv (committed verdict cache, header only until Andy's AI pass)"
  - "meta.judged_with, stats gray_keep / gray_deleted / judged_with, REPORT.md judged/pending rows, NOTICE sentence when an AI pass happened"
  - "pack.verify: pending gray words must stay within 1,000,000 tokens and 400 requests at batch 150; judged_with must be a list; report identities pending + keep + deleted == gray and gray_deleted == R5 rows"
  - "tools/lexicon/README.md section 「灰色地帶 AI 判斷（需要免費金鑰）」"
affects: [06-08]

plan_head_before: 251ee8c74ab55693a8e495353dcfd0d848e90271
plan_head_after: f7ab0b5070eb84e7ae9cb1fd78951ef1d15d2d98

actuals:
  tokens: 21400    # chars/4 over the added lines of code, tests and README (generated reports, checklist and judgments excluded)
  tasks: 2
  commits: 2       # MEASURED: git rev-list --count 251ee8c..HEAD (Task 1 + Task 2), before the docs commit

tech-stack:
  added: []        # no packages installed; urllib / http.server from the standard library only
  patterns:
    - "Provider interface judge(words) -> {word: 'K'|'D'|None} with a requests counter and an optional request_cap; run_judge owns the estimate, caps, per-batch save and resume"
    - "Verdict cache keyed by word only, one line word<TAB>K|D<TAB>model<TAB>prompt_version, sorted, atomic temp + os.replace after every batch"
    - "Network adapters are tested only against 127.0.0.1 fake servers (tests/__init__.py blocks everything else); redirects are never followed so the key header cannot be forwarded"

key-files:
  created:
    - tools/lexicon/lex/judge.py
    - tools/lexicon/judgments/judgments.tsv
    - tools/lexicon/tests/test_judge.py
    - tools/lexicon/tests/test_providers.py
    - tools/lexicon/tests/fixtures/recorded-judgments.tsv
  modified:
    - tools/lexicon/lex/rules.py
    - tools/lexicon/lex/pack.py
    - tools/lexicon/lex/report.py
    - tools/lexicon/build.py
    - tools/lexicon/README.md
    - package.json
    - data/packs/{chewing,mcbopomofo,vanguard-tw}/meta.json
    - tools/lexicon/reports/{chewing,mcbopomofo,vanguard-tw}/{stats.json,REPORT.md}
    - .planning/TEST-CHECKLIST.md

key-decisions:
  - "The estimate gate refuses only on tokens (> --max-tokens, exit 3, --force overrides); more batches than --max-requests just means the run stops cleanly at the cap and resumes next time (planner decision, Pitfall 8)"
  - "meta.gray stays the total number of words classified gray; verdicts are tracked in gray_keep / gray_deleted / gray_pending (they sum to gray) so kept + removed == in_scope still holds"
  - "A fully garbled or blocked reply is not retried (saves quota); a partial reply retries only the missing words once as a smaller batch"
  - "429: wait the indicated seconds, give up after 5 consecutive 429s, and give up immediately when the wait would exceed 120 s (daily quota gone)"

patterns-established:
  - "Tracer gate satisfied: unit tests, build all, verify --strict, judge --dry-run, the no-key exit 2 fingerprint check and a full npm test were green on the recorded-verdict slice before the real adapters were added"

requirements-completed: []   # LEX-03, LEX-04 and LEX-06 are also declared by 06-08; per the same rule as 06-01 .. 06-06 they flip when the last declaring plan finishes

duration: ~2 h of work plus three ~6.3 min full test runs
completed: 2026-10-04
---

# Phase 6 Plan 07: Gray-area AI judge Summary

The whole gray-word AI step now exists and is proven offline: an estimate-and-cap gate, per-batch saved verdicts that resume after any interruption, a pack rebuild that removes words judged D (rule R5, reason names the model) while keeping K and unjudged words, a Gemini direct adapter (default) and a Worker adapter (fallback), and the LEX-03 comprehensibility standard as the prompt. Nothing real was called: there is no key and no deployed Worker in the cloud, so the committed packs are unchanged in content and every unjudged gray word stays, counted as 「待 AI 判斷」. Andy's real pass is one command.

## Real pass for Andy (D-20 in TEST-CHECKLIST, relates to D-4 and D-17)

```
GEMINI_API_KEY=你的金鑰 npm run lexicon:judge
```

Recommended first, a small trial of about 40 words: `GEMINI_API_KEY=你的金鑰 python3 -B tools/lexicon/build.py judge --max-requests 2 --batch-size 20`. Fallback through the Worker (shares the site's free quota, off-peak): `LEX_AI_URL=https://lucky-hawaii.is3000dollar.workers.dev npm run lexicon:judge`.

Real `judge --dry-run` estimate (committed state): **gray 33,624, pending 33,624, batches 225 (batch 150), estimated input 370,368 tokens, output 100,872 tokens** (about 0.47 M total, 225 requests, under the 400-request default cap). pack.verify's per-pack sum is 33,631 words, still 225 requests.

## What was done

**Task 1 (tracer), commit ec944f9**
- `lex/judge.py`: verdict cache (`load_judgments` skips comments and malformed lines and counts them; `save_judgments` sorts by code point, temp file + `os.replace`, no churn when unchanged), `RecordedProvider` (offline, loads the same TSV format), `run_judge` implementing the printed estimate line 「灰色 G 筆、待判 P 筆、批次 B、估計輸入 X token、輸出 Y token」, exit 3 over `--max-tokens`, `--dry-run`, exit 2 without a provider, per-batch merge and save, 「已達本次上限（N 次請求）…」, exit 4 on a provider error with the redacted resume message, `--rejudge`, and the closing line 「本次判斷 N 筆（保留 a、刪除 b）、仍待判 c 筆」.
- `rules.py`: `resolve` per the plan; `apply_rules(parsed, ctx, judgments)` applies it to every gray word, adds `gray_pending`, `judged_with`, and `gray_keep` / `gray_deleted` stats; `R5-ai-incomprehensible` reason 「AI 判斷：一般讀者難以理解（{model}）」.
- `build.py`: `_prepare` split out of `cmd_build` (shared by build and judge); `build` loads the judgments; `judge` subcommand; `verify` reports a malformed judgments file; `package.json` gains `lexicon:judge`.
- `pack.py` / `report.py`: `judged_with` in meta and stats, REPORT.md gains judged / pending rows and an AI judgment column for the China-term gray list, NOTICE mentions the AI pass only when it happened, verify checks the free-quota estimate and the new report identities.
- Tests: `test_judge.py` (34 tests): file format, resolve, every run_judge behaviour listed in the plan, CLI exit codes and rebuild wiring, fixture rebuild (D removed with R5, K kept, unjudged pending, allowlist beats D, version changes only when content changes, report and verify stay consistent), quota verify.

**Task 2, commit f7ab0b5**
- `build_prompt` (LEX-03 text in Traditional Chinese, seven worked examples, words only in numbered lines after the data marker, output rule after the data, words that are not 2 to 11 BMP CJK characters refused), `parse_output` (only `N K` / `N D`, range-checked, first answer wins), `parse_retry_after_s` (port of the Worker's parseRetryAfterMs, default 30 s), `gemini_text` (blocked or SAFETY replies give no answers).
- `GeminiProvider`: `POST {base}/v1beta/models/{model}:generateContent`, key only in the `x-goog-api-key` header, temperature 0, `maxOutputTokens = min(2048, 8n + 64)`, 429 handling, 5xx retried twice with a 10 s wait, 400 / 401 / 403 / 404 give 「金鑰無效或模型不可用（HTTP n）」, redirects never followed, every message redacted.
- `WorkerProvider`: `POST {url}/ai` with `{prompt, model: 'auto', temperature: 0, maxTokens}`, at least 6 s between requests, records the reply's model id per batch, never builds another path.
- `select_provider` (auto: key means Gemini, otherwise `LEX_AI_URL` means Worker, otherwise none; URLs must be https:// or http://127.0.0.1; a key with whitespace or control characters is refused without echoing it); request cap enforced inside the provider so retries cannot exceed `--max-requests`.
- `test_providers.py` (40 tests) against local fake servers; README section for Andy.

## Verification

| Check | Result |
|-------|--------|
| `python3 -B -m unittest discover -s tools/lexicon/tests -t tools/lexicon` | 231 tests OK in about 1.7 s (was 157 after 06-06; +34 test_judge, +40 test_providers; the rest unchanged) |
| `python3 -B tools/lexicon/build.py all` / `verify` / `verify --strict` | exit 0; pack versions unchanged (2.c1553b706b / 2.89e6dcffac / 2.3f0521dcc1) because no verdicts exist |
| `judge --dry-run` | 灰色 33624 筆、待判 33624 筆、批次 225、估計輸入 370368 token、輸出 100872 token |
| `GEMINI_API_KEY= LEX_AI_URL= judge; echo $?` | 2; sha256 over judgments + data/packs + reports identical before and after |
| `judge --dry-run --max-tokens 1000` | exit 3 |
| meta check (`gray_pending == gray`, `judged_with == []`), header check, `lexicon:judge` script check | all pass |
| `grep -rn "AIza" tools/lexicon` | 0 lines |
| `npx playwright test tests/lexicon-build.spec.mjs` | 2 passed |
| `npm test` (before each commit) | Task 1: 421 passed / 27 skipped / 1 failed; Task 2: 421 passed / 27 skipped / 1 failed; the one failure is always the known cloud-only `tests/worker-config.spec.mjs:53` (proxy WARNING); a third run after the docs changes is not needed (no code changed) |
| Golden / v0.96 files / `?v=` (0.96.8) / `worker/` | untouched |

## Deviations from Plan

**1. [Rule 1 - Bug] Worker adapter sends the site's Origin header** — `worker/src/index.js` rejects `/ai` calls whose Origin is not `https://andy-coin.github.io` (403), so a plain script call would always fail. `WorkerProvider` therefore sends that Origin (constant `WORKER_ORIGIN`, tested). The Worker is unchanged; its real abuse guards are the limiter and caps, which is why the 6 s spacing and the off-peak advice stay. Recorded as 06-07-8.

**2. [Rule 2 - Correctness] Extra safety beyond the plan** — redirects are never followed (the key header must not be forwarded), the API key and `LEX_AI_URL` / `GEMINI_BASE` are validated (https or 127.0.0.1 only; a key with whitespace is refused without echoing it), a 429 that asks for more than 120 s stops the run instead of sleeping, and 404 joins 400 / 401 / 403 as 「金鑰無效或模型不可用」. `verify` also reports a malformed `judgments.tsv`.

**3. [Interface] `gray` semantics and extra stats** — the plan says "gray counts stay in meta.gray"; I keep `gray` as the total gray classification and add `gray_keep`, `gray_deleted` (so pending + keep + deleted == gray, verified). `gray_rows` now carry an optional `verdict` key. Recorded as 06-07-7.

**4. [Interface] `run_judge` filters already-judged words itself and takes `gray_total`** — so a direct caller resumes correctly and the printed 「灰色 G 筆」 can differ from 「待判 P 筆」; build.py passes all gray words and lets run_judge subtract the cached ones.

**5. [Plan literal] No retry when a reply is entirely unusable** — the plan says missing answers are retried once as a smaller batch; when every word is missing there is no smaller batch, so nothing is re-asked (saves quota; next run asks again). Recorded as 06-07-10.

**Total deviations:** 1 bug-class (Origin), 1 correctness set, 3 interface notes, 0 architectural.

## Authentication Gates

None. The missing Gemini key is the documented post-phase action D-20 (D-4), not a checkpoint.

## Known Stubs

None. `gray_pending == gray` is the documented state until Andy's AI pass; the reports and README say so. The Gemini adapter has never talked to the real service (no key, no network allowed): it is verified against fake servers written to the Worker's existing wire format (06-07-11).

## Threat Flags

None beyond the plan's threat model. T-06-20 (key only in the header, redact on every message, tests scan stdout, stderr, exception text and the judgments file for the fake key), T-06-21 (words validated and placed only in numbered lines after the data marker, only `N K|D` accepted, anything else leaves the word unjudged and kept), T-06-22 and T-06-24 (Worker path is only `/ai`, 6 s spacing, request cap enforced inside the provider, fake server log asserts no other path), T-06-23 (estimate printed first, exit 3 over `--max-tokens`, never more than `--max-requests` HTTP requests including retries) are mitigated and tested. New surface worth knowing: the tool now sends lexicon words (public data) to Google or the Worker when Andy runs it.

## For Andy (TEST-CHECKLIST)

- 必測: 06-07-1 (dry run), 06-07-2 (no key exits 2, nothing changes), 06-07-3 (report gray section).
- 建議測: 06-07-4 (over-limit exits 3), 06-07-5 (judgments.tsv is header only).
- 待 Andy 決定／動手: **D-20** the real AI pass (trial command, the one-command run, rescue, and the question of which route to use; relates to D-4 and D-17).
- 自主決定: 06-07-6 (gate refuses only on tokens, cap stops cleanly), 06-07-7 (gray number semantics), 06-07-8 (Worker Origin), 06-07-9 (prompt version, rejudge, hand-editable file), 06-07-10 (unanswered words, 429 policy), 06-07-11 (Gemini never run for real, default model unverified), 06-07-12 (conservative standard, unsure means K).

## Next Phase Readiness

Ready for 06-08 (sample verification, calibration, phase gate, Andy checklist): `RecordedProvider` and `fixtures/recorded-judgments.tsv` (三酸甘油酯 K, 聚乙烯醇縮丁醛 D, 分散式雜湊表 D) are in place, `select_provider` / `PROMPT_VERSION` are the hooks a calibration command needs, and the planner note (gate refuses only on tokens, cap stops cleanly) is written to the checklist as 06-07-6.

## Self-Check: PASSED

Created files exist (`tools/lexicon/lex/judge.py`, `tools/lexicon/judgments/judgments.tsv`, `tools/lexicon/tests/test_judge.py`, `tools/lexicon/tests/test_providers.py`, `tools/lexicon/tests/fixtures/recorded-judgments.tsv`); commits ec944f9 and f7ab0b5 are in history; the last `npm test` ran on the committed code and shows only the known cloud-only failure.
