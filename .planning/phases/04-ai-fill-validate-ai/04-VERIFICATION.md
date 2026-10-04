---
phase: 04-ai-fill-validate-ai
verified: 2026-10-04T12:00:00Z
status: human_needed
score: 4/4 roadmap success criteria verified (plus 1 backstop truth, write half verified, read half abstained)
covered_files:
  - .planning/phases/04-ai-fill-validate-ai/04-01-PLAN.md
  - .planning/phases/04-ai-fill-validate-ai/04-01-SUMMARY.md
  - .planning/phases/04-ai-fill-validate-ai/04-02-PLAN.md
  - .planning/phases/04-ai-fill-validate-ai/04-02-SUMMARY.md
  - .planning/phases/04-ai-fill-validate-ai/04-03-PLAN.md
  - .planning/phases/04-ai-fill-validate-ai/04-03-SUMMARY.md
  - .planning/phases/04-ai-fill-validate-ai/04-04-PLAN.md
  - .planning/phases/04-ai-fill-validate-ai/04-04-SUMMARY.md
  - .planning/phases/04-ai-fill-validate-ai/04-05-PLAN.md
  - .planning/phases/04-ai-fill-validate-ai/04-05-SUMMARY.md
  - index.html
  - js/ai-generate.js
  - js/candidates.js
  - js/panels.js
  - js/search.js
  - js/state.js
  - js/wordlist.js
  - tests/ai-client.spec.mjs
  - tests/ai-fill.spec.mjs
  - tests/core-node.spec.mjs
  - tests/helpers.mjs
  - tests/node-core.mjs
  - tests/smoke.spec.mjs
  - tests/split-tags.spec.mjs
  - tests/wordlist-cache.spec.mjs
covered_digest: "v2:sha256:48662a9f4adb484600602b2e7d1ea5081954f0fbe4357dd3937c01cb1c4e0653"
behavior_unverified: 0
overrides_applied: 0
insufficient_spec_items:
  - truth: "Cache reads are one readonly transaction (ver plus all chunks) and swaps one readwrite transaction, so two tabs loading during a version change cannot observe or leave a mixed set (verification: backstop)"
    reason: insufficient_spec
    note: "Re-assessed after 078c5d1. Write/swap side now has direct evidence: failure-injection tests (throw, abort) plus a two-page concurrent-swap test. Read side (a tab reading ver and chunks while another tab swaps) still has code-presence evidence only: in the new test both pages read the V1 cache before any write begins."
human_verification:
  - test: "Andy tries real rhymes in the browser: 心 / 安 / 愛 / 衣 / 月, tail and head rhyme, with filters (same tone, length chips), and presses AI suggestion several times"
    expected: "Count is always 24 when candidates are enough (even with AI off or failing); when candidates are short, the AI-badged words all really rhyme to the ear and the shortfall is mostly made up in one press; ranking and the single-character head-rhyme meaning (OD-2, first-char rhyme family) feel right"
    why_human: "Rhyme quality, ranking feel and the OD-2 semantics are subjective; the automated tests only prove the program's own rhyme rule is applied consistently"
  - test: "Read-side cross-tab check (optional, low risk): a tab that opens its cache while another tab is mid-swap should never end up with ver from one version and chunks from another"
    expected: "Loaded wordlist is one complete version; no mixed set in memory"
    why_human: "Honest-verifier backstop: the write/swap side is now covered by a two-page test, but no test makes a reader overlap a swap, so the single-readonly-transaction read is proven by code reading only"
---

# Phase 4: AI fill and validate Verification Report

**Phase Goal:** Press AI suggestion and the count is always enough and generated words always rhyme: enough candidates means the program guarantees the fill, too few means generate only one round, and the race between wordlist loading and AI is removed.
**Verified:** 2026-10-04
**Status:** human_needed
**Re-verification:** No, initial verification

## Goal Achievement

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Candidates >= target: result exactly fills target, never triggers generation; even if AI returns few, program fills | VERIFIED | `js/candidates.js:247` `fillToTarget` = dedupe pool, keep in-pool AI picks (capped at target), fill rest by rank desc, slice to `target - picked`. `js/ai-generate.js` pick branch (`pool.length >= AI_TARGET`) ends with `return`, so `generateAIWords` (sole call site, line 166) is unreachable on that path. Tests: `填滿` e2e (AI returns 3, 24 cards), `AI 失敗仍填滿` (503, 24 cards plus hint), `fillToTarget` property test (sizes 0/1/23/24/25/1000), `邊界` (exactly 24 does not generate, 23 generates once), `連按` (240 distinct words, prompt list capped at AI_POOL_MAX). |
| 2 | Candidates insufficient: only one generation round; every generated word passes the existing rhyme judgment by its own reading, non-rhyming discarded | VERIFIED | `generateAIWords` makes one `callLLM`, no loop; `generatedWordOk` (candidates.js:303) requires every code point in `charInfo` then `validateWordRhyme` (judges via `charInfo` readings, any reading for polyphonic), or the selected-char rule. Rejected words only reach `lhWarn`. Cards carry `.ai-badge`. Tests: `造詞一輪`, `generatedWordOk`, 8 `validateWordRhyme` rule tests, `buildGenPrompt`, real-wordlist mirror property (forward >= 99%, reverse bounded). |
| 3 | AI clicked before wordlist loaded waits, no false generation | VERIFIED | `generateAISuggestions` awaits the shared `loadWordlist()` when `wordlistData === null` before computing any candidate; a null result toasts and returns. Headless gated-chunk tests: `慢速：詞庫還沒載完就按 AI 建議` (0 /ai requests while loading, then 24 cards from one pick request, 10 chunk requests total) and `慢速：等詞庫期間換了搜尋` (press voided). |
| 4 | Wordlist version bump: new chunks fetched, no old/new mixing | VERIFIED | `js/wordlist.js`: cache used only when meta version equals cached `ver` and all 10 chunks are arrays; otherwise whole set refetched with `?v=<ver>`; any missing chunk discards the load and writes nothing; swap is one readwrite transaction (delete numeric keys, put 10 chunks, put ver). Tests: `版本` (V1 cached, V2 with chunk 3 failing keeps V1 complete, retry stores V2 complete), `快取寫入失敗` throw and abort modes (old ver and all 10 chunks intact), `非 200`, `修正檔格式壞掉`. |

**Score:** 4/4 roadmap truths verified.

### Plan must_haves, spot checks

| Item | Status | Evidence |
|------|--------|----------|
| `AI_TARGET = 24` once in state.js, no literal 24 in ai-generate.js | VERIFIED | grep: constant in js/state.js; `AI_TARGET` used throughout ai-generate.js |
| Extra-round flag removed | VERIFIED | `grep _aiExtraRoundDone js tests index.html` returns nothing |
| Button unlock on every exit | VERIFIED | `try/catch/finally` in `generateAISuggestions` (catch added in fc2ea0d); test for injected exception |
| Stale-press guard (review CR-01) | VERIFIED | `_aiEpoch` snapshot plus `stale()` re-checked after `loadWordlist`, after pick `callLLM`, after `generateAIWords`, and inside it after its own `callLLM` (both paths); two e2e tests |
| Card template escaping (WR-01) | VERIFIED | `aiWordCardHtml` escapes HTML and uses `JSON.stringify` for the onclick argument; special-character click test |
| Prohibition: more than one AI call per press on fill path | VERIFIED (test) | e2e asserts a single /ai request |
| Prohibition: hide AI ranking failure | VERIFIED (test) | hint 「AI 暫時無法排序，先依常用度列出」 appended on any `aiErr` |
| Prohibition: AI word without badge | VERIFIED (test) | generation path always `aiWordCardHtml(w, true)` |
| Prohibition: Simplified Chinese wording (judgment tier) | UNVERIFIED, flagged | Prompt asks 「只用台灣日常會用的繁體中文詞語」, and the `charInfo` gate rejects characters absent from the dictionary, which removes most Simplified-only forms. Whether a returned word reads as Simplified or non-Taiwan usage is a judgment call (deferred to Phase 6 lexicon work per the plan). Covered by Andy's human check. |
| Prohibition: cache swap touches only numeric keys and `ver` | VERIFIED (test) | `IDBKeyRange.bound(0, 1e9)`, no `clear()`; sentinel test in `版本` |
| Backstop: single readonly read and single readwrite swap, two-tab safe | PARTIAL: swap/leave half VERIFIED, read/observe half ABSTAIN (insufficient_spec) | See below |
| Golden unchanged since 2f5239e | VERIFIED | `git diff --stat 2f5239e HEAD -- tests/golden tests/golden.spec.mjs` is empty; golden spec passes |
| `fix(04-02)` touches only js/candidates.js | VERIFIED | aa9aa67 changes only js/candidates.js |
| Shared cache-bust version | VERIFIED with deviation | All 26 local tags share `?v=0.96.6` (plan said 0.96.5; bumped in b8eca20 after review fixes changed js behavior, consistent) |
| Nothing pushed | VERIFIED | Branch `gsd/v0.96-stabilize` has no upstream; no remote branch contains HEAD |

**Backstop (honest-verifier), re-assessed after commit 078c5d1:** The truth says reads and swaps are each one transaction, so two tabs cannot see or leave a mixed set.

- **Swap / "leave" half: now explicit evidence.** The new test `版本：兩個分頁同時換版不會看到混合的詞庫` (tests/wordlist-cache.spec.mjs:322) seeds a V1 cache, then opens two real pages at once. The meta file gives them different versions (V2 and V3), and a gate holds all 20 chunk requests until both pages have asked, so the two swaps really overlap. It asserts each page's memory is one complete version, IndexedDB `ver` and all ten chunks belong to the same version, and no page errors. This is directly observed behavior of the two-page scenario. Together with the throw and abort failure-injection tests it covers the write side. I ran it: 5/5 pass, and it is included in the full run (277 passed).
- **Teeth: only partly confirmed by me.** I tried two mutants of `_idbReplaceAll` (reverted with `git checkout`, working tree clean). Chunk puts each in its own transaction failed 0/5. Chunk puts and `ver` each in separate `setTimeout` transactions failed 1/10. The coordinator reports 20/20 failures with its own mutation, which I did not reproduce. So the test can detect a split write, but how reliably depends on how the split is done. This is evidence, not a proof of detection.
- **Read / "observe" half: still not covered.** In the new test both pages read the V1 cache before any write starts, so a reader never overlaps a swap. If `_idbReadCache` were split into separate transactions, this test would not notice. That half rests on code reading (one readonly transaction for `ver` plus ten chunks) and IndexedDB's own isolation. Presence is not explicit evidence for a backstop truth, so the read half abstains as `insufficient_spec`. The risk is low, and it is the only remaining automated gap.

### Test Execution

`npm test`: **277 passed, 0 failed** (1.2m, rerun after 078c5d1), run by this verifier. Includes golden, smoke, ai-fill, wordlist-cache, scan, worker suites.

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|--------------|-------------|--------|----------|
| AI-03 | 04-01, 04-04, 04-05 | Candidates >= target always fills target; AI only ranks; no generation | SATISFIED | Truth 1; marked complete in REQUIREMENTS.md |
| AI-04 | 04-02, 04-03, 04-04, 04-05 | Generate only when short, one round, each word judged by its own reading, bad ones dropped | SATISFIED | Truth 2 |
| PERF-03 | 04-05 | Cache version correct, no old/new mixing; no race between wordlist load and AI | SATISFIED | Truths 3 and 4 (the cross-tab backstop is flagged for human) |

No orphaned requirements: REQUIREMENTS.md maps only AI-03, AI-04, PERF-03 to Phase 4, and all appear in plan frontmatter.

### Review Findings (04-REVIEW.md)

CR-01, WR-01..04, IN-01, IN-03 fixed with commits and tests that fail without the fix (checked in code: guard, escaping, temporaries in `applyWordlistOverrides`, `slice(-40)`, tx abort, catch block). IN-02 accepted as intended (one AI call per press even when pool is empty, no per-search ceiling). IN-04 documented only: offline use does not trust a complete cache when the meta fetch fails (matches old behavior); legacy mixed caches heal at next bump; the deleted `verify-split` negative control was "not decided here".

### Anti-Patterns

No TBD/FIXME/XXX in any modified source or test file. No stubs: all new functions are substantive and wired (`fillToTarget`, `generatedWordOk`, `buildGenPrompt`, `loadWordlist`, `_idbReplaceAll`, `_idbReadCache`).

### Advisory notes (non-blocking)

- Plan 05 phase gate wording ("exactly one fix(04 commit touching only js/candidates.js") was overtaken by later review-fix commits (more `fix(04)` commits; WR-03 also touched candidates.js). The intent (the rhyme-rule fix landed in one isolated commit, aa9aa67) holds.
- In selected-char mode `generatedWordOk` accepts any dictionary-char word whose fixed-position char is selected, mirroring `filterWordsBySelectedChars` by design (plan OD-3/A3).
- IN-04 residuals are open decisions for the user, not Phase 4 blockers.

### Human Verification Required

1. **Real-rhyme trial (required, from ROADMAP).** Andy tries 心 / 安 / 愛 / 衣 / 月, tail and head rhyme, with filters, pressing AI suggestion repeatedly. Expect always 24 when candidates are enough; AI-badged words really rhyme and are Taiwan-natural Traditional Chinese; OD-2 (single-char head rhyme = first-char rhyme family) and ordering feel right. Why human: subjective quality and the judgment-tier no-Simplified prohibition.
2. **Read-side cross-tab check (optional, low risk).** A tab reading its cache while another tab swaps never ends up with a mixed set. Why human: the backstop's read half has no overlapping-read test (the swap half is now covered by 078c5d1).

### Gaps Summary

No gaps. All four roadmap success criteria are backed by passing automated tests and code reading, golden is unchanged, `npm test` is green (277/0). The status is `human_needed` because the roadmap's own human check (Andy's real-rhyme trial) is outstanding, the judgment-tier Simplified-Chinese prohibition is flagged for human review, and one backstop truth (two-tab cache consistency) still has no behavioral evidence for its read half (the swap half is covered by the 078c5d1 test).

---

_Verified: 2026-10-04_
_Verifier: Claude (gsd-verifier)_
