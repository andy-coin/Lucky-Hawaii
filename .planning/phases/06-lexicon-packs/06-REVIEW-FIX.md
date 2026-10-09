---
phase: 06-lexicon-packs
fixed_at: 2026-10-09T00:00:00Z
review_path: .planning/phases/06-lexicon-packs/06-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 6: Code Review Fix Report

**Fixed at:** 2026-10-09
**Source review:** .planning/phases/06-lexicon-packs/06-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (0 Critical, 5 Warning; Info skipped by scope)
- Fixed: 5
- Skipped: 0

**Where it ran:** `workflow.use_worktrees` is `false`, so all edits, tests and commits ran in the main checkout on branch `gsd/v0.96-stabilize` (no worktree, no sentinel). Nothing was pushed and `main` was not touched.

**Verification:** `npm run lexicon:test` (256 tests) passed before every Python commit. `npm run lexicon:verify` passed after the rebuild. The full `npm test` (Playwright) ran once at the end with all fixes in place: 423 passed, 27 skipped (those were skipped before my changes), 0 failed. No golden update was needed (`npm run golden:update` was not run).

## Fixed Issues

### WR-01: `_checked_url` accepts hosts that only start with `http://127.0.0.1`

**Files modified:** `tools/lexicon/lex/judge.py`, `tools/lexicon/tests/test_providers.py`
**Commit:** 56e1c94
**Applied fix:** The check now parses the URL. It accepts `https://` with a host, or `http://` only when the parsed host is exactly `127.0.0.1`. Any URL carrying a username or password is refused. I kept `localhost` and `::1` rejected (the reviewer's sample allowed them) because an existing test requires `http://localhost:8787` to be refused. Added test cases for `127.0.0.1.evil.com`, `127.0.0.1@evil.com` and `https://user:pw@...`.

### WR-02: Rollback after a failed pack switch can return to a pack that never loaded

**Files modified:** `js/wordlist.js`, `index.html` (all 27 `?v=` tags 0.96.8 -> 0.96.9), `tests/lexicon-packs.spec.mjs`
**Commit:** 52fe5d4
**Applied fix:** A new `_lastGoodPack` records the pack, and the stored setting at that moment, only when a wordlist is actually published. A failed switch now rolls back to that pack instead of the half-loaded `activeLexiconPack`. After the rollback reload finishes, the current search is re-run, because the AI cards were cleared at switch time (skipped if the user switches again in between). Added a Playwright test (A slow, then C fails: must end on v0.96, setting restored, A not mixed in). It fails on the old code and passes on the new. Status: fixed, requires human verification (logic change, covered by the new test).

### WR-03: A failed retry for the missing words of a batch throws away the verdicts already received

**Files modified:** `tools/lexicon/lex/judge.py`, `tools/lexicon/tests/test_providers.py`
**Commit:** 3b9d678
**Applied fix:** The retry now swallows any `ProviderError` (busy, 5xx, network, request cap), so the verdicts from the first request are returned and saved. `ProviderAuthError` still stops the run. Added a test where the retry returns HTTP 500.

### WR-04: R2 and R3 delete words that are everyday Taiwan usage

**Files modified:** `tools/lexicon/rules/char-allow.txt`, `tools/lexicon/rules/keep.json`, `data/packs/{chewing,mcbopomofo,vanguard-tw}/*` (chunks, meta, NOTICE), `data/packs/index.json`, `tools/lexicon/reports/*/{REPORT.md,removed.ndjson,stats.json}`
**Commit:** fca098d
**Applied fix:** Added `裏 銹 鐧 獴 菓 肽` to `char-allow.txt` and `歐拉` to `keep.json`, then ran `npm run lexicon:build` and `lexicon:verify` and committed the regenerated packs and reports with the rule change. Pack versions changed: chewing 2.c1553b706b -> 2.61c5b37bff (132 -> 121 removed, +11 entries); the mcbopomofo and vanguard-tw versions also changed. One deviation from the review text: it lists `胜`, but `胜肽` is deleted because of `肽` (see the removed.ndjson reason), so I allowed `肽` and did not add `胜`. `奶酪` was left alone because the review calls only `歐拉` a likely false positive. Status: fixed, requires human verification (the allow-list is a judgment call about Taiwan usage; please glance at the rescued words in the new reports).

### WR-05: Calibration set contains 4 of the 7 prompt few-shot examples

**Files modified:** `tools/lexicon/judgments/calibration.tsv`, `tools/lexicon/tests/test_eval.py`
**Commit:** 69113b6
**Applied fix:** Swapped the four overlapping words for non-overlapping equivalents of the same label and category, so the balance stays 36 K / 24 D. 三酸甘油酯 (K) became 糖化血色素 (K). 聚乙烯醇縮丁醛, 二甲基亞碸 and 分散式雜湊表 (D) became 鄰苯二甲酸二辛酯, 三甲基氯矽烷 and 紅黑樹平衡演算法 (D). `test_eval.py` anchors were updated, and a new assertion fails if any calibration word appears as a quoted prompt example. I did not add extra borderline words, because I can't validate their labels offline. The prompt and `test_samples` anchors are unchanged. `npm run lexicon:eval` has not been run against a real model, so the agreement threshold still needs a live run by Andy.

## Skipped Issues

None. Info findings (IN-01 to IN-07) were out of scope for `critical_warning`.

---

_Fixed: 2026-10-09_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_

## Iteration 2（orchestrator 直接修）

### WR-06：網址解析錯誤沒轉成 LexError
- **Status:** fixed
- **Commit:** 1648db5
- `_checked_url` 用 try/except 包住 `urlsplit` 與 `.port`，不合法網址或埠號一律 `LexError('… 不是合法的網址')`；測試補 `https://[x`、`https://example.com:99999/x`。`lexicon:test` 256 項全過，實際重現指令只印一行白話提示。
- 改動 5 行、已手動驗證，未再跑第 3 輪審查。剩餘 IN-01～IN-08 為 Info，不在修正範圍。
