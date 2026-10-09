---
phase: 06-lexicon-packs
reviewed: 2026-10-09T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - js/wordlist.js
  - tools/lexicon/lex/judge.py
  - tests/lexicon-packs.spec.mjs
  - tools/lexicon/tests/test_providers.py
  - tools/lexicon/tests/test_eval.py
  - tools/lexicon/rules/char-allow.txt
  - tools/lexicon/rules/keep.json
  - tools/lexicon/judgments/calibration.tsv
  - index.html
findings:
  critical: 0
  warning: 1
  info: 8
  total: 9
status: issues_found
---

# Phase 6: Code Review Report (iteration 2)

**Reviewed:** 2026-10-09
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Re-review of the five fix commits (`git diff 2291d09..HEAD`, regenerated packs and reports excluded). `npm run lexicon:test` passes and `npm run lexicon:verify` passes (4 packs).

**Verification of the iteration-1 warnings**

- **WR-01 (URL guard): resolved.** The check now uses the parsed host and refuses any URL with a username or password. `127.0.0.1.evil.com`, `127.0.0.1@evil.com` and backslash tricks all fail. The scheme is lowercased by `urlsplit`, so `HTTP://127.0.0.1` still works. `_opener()` uses the same `urlsplit().hostname`, so the guard and the opener agree on the host. One new edge case is open: WR-06.
- **WR-02 (rollback target): resolved.**
  - `_lastGoodPack` is only written inside the `live()` block after `wordlistData = out`, and only when `out !== null`. A stale load can therefore never overwrite it.
  - On the first load it records the real stored value, including `null` and an invalid stored id, so rollback restores exactly what was there.
  - Rollback bumps `_wlGen` and captures `rbGen`. If the user switches again during the rollback reload, `rbGen !== _wlGen` and no refresh runs.
  - The earlier switch call also returns false at its own `myGen` check.
  - `loadWordlist()` never rejects, and `_refreshFromCurrentInput` only runs after `wordlistData !== null`, so no unhandled rejection is possible on this path.
  - The new Playwright test covers A (slow) then C (fail).
  - One behaviour change is recorded in IN-07.
- **WR-03 (retry error swallowing): resolved.**
  - `ProviderAuthError` is re-raised and any other `ProviderError` leaves the missing words as `None`.
  - `judge()` only builds a result dict. Verdicts are counted by the caller from that dict, so there is no double-counting.
  - A failed retry still consumes one request toward `request_cap`, which is correct.
- **WR-04 (allow-list): resolved.** `裏 銹 鐧 獴 菓 肽` and `歐拉` are in the rules. `家裏`, `生銹`, `殺手鐧`, `狐獴`, `和菓子`, `胜肽` and `歐拉` no longer appear in any `removed.ndjson`. The packs were rebuilt and `verify` agrees with the manifest.
- **WR-05 (calibration overlap): resolved.** The four overlapping words were swapped. `test_eval.py` now fails if a calibration word appears in the prompt as a quoted example. The three other prompt examples (惆悵, 月光曲, 刻舟求劍) are not in the table. See IN-08 for what is still weak.
- **index.html:** the diff is only the `?v=0.96.8` to `0.96.9` cache-bust bump. No stale `0.96.8` remains in `index.html` or `js/`.

## Warnings

### WR-06: `_checked_url` raises a raw `ValueError` traceback for malformed URLs such as `https://[x`

**File:** `tools/lexicon/lex/judge.py:477`
**Issue:** The new `urllib.parse.urlsplit(value)` raises `ValueError("Invalid IPv6 URL")` for input like `https://[x`. This is not a `LexError`, so the CLI prints a full traceback instead of the friendly refusal message. I reproduced it with `LEX_AI_URL='https://[x' python3 build.py judge --provider worker`. The old `startswith` check could not do this, so it is a small regression from the WR-01 fix. No secret is leaked (the traceback shows the URL, not the key), but the "refuse with a clear message" contract is broken. `parts.port` is also never validated, so `http://127.0.0.1:99999` passes the guard and fails only later at request time.
**Fix:**
```python
def _checked_url(value, what):
    value = value.strip()
    try:
        parts = urllib.parse.urlsplit(value)
        parts.port                      # 連接埠不合格也會丟 ValueError
    except ValueError:
        raise LexError('%s 不是合格的網址' % what)
    ...
```
Add `'https://[x'` to the `bad` tuple in `test_urls_must_be_https_or_local`.

## Info

### IN-01: `save_judgments` silently drops malformed and hand-written lines

**File:** `tools/lexicon/lex/judge.py:63-112, 150, 193`
**Issue:** Carried forward, unchanged. The header says the cache "can be edited by hand", but `run_judge` ignores the malformed-line count (`_bad`) and rewrites the whole file from the parsed table after every batch. Any line that was not parsed is deleted without warning.
**Fix:** In `run_judge`, if `_bad` is non-zero, stop with a message (exit 2) or keep the raw bad lines when saving.

### IN-02: Dead branch in `resolve` for keep-allow words

**File:** `tools/lexicon/lex/rules.py:316-317`
**Issue:** Carried forward, unchanged. `classify` returns `K0-allowlist` for keep-allow words before it can return `gray`, so the branch is unreachable. It also does not count the word in `gray_pending`, `gray_keep` or `gray_deleted`, so it would break the `pending + keep + deleted == gray` check in `pack._verify_report` if it were ever reached.
**Fix:** Remove the branch, or add a one-line comment saying it is a defensive guard.

### IN-03: China-term frequency threshold is hard-coded in two more places

**File:** `tools/lexicon/lex/report.py:18, 26`
**Issue:** Carried forward, unchanged. `CHINA_KEPT_FREQ_NOTE = 100` and the label text "詞頻低於 100" duplicate `rules.CHINA_FREQ_MIN`. If the threshold changes, reports will describe the wrong rule.
**Fix:** Import `CHINA_FREQ_MIN` and format the label from it.

### IN-04: `cmd_build` writes packs and the manifest before the final simplified-character check on shipped text

**File:** `tools/lexicon/build.py:132-176`
**Issue:** Carried forward, unchanged. `shipped_text_problems` runs after all chunks, `meta.json`, NOTICE and `index.json` are written. A failure raises `LexError` (exit 2) but leaves the new files on disk. They are a coherent set, so this is not corruption, but a failed build still changes the working tree.
**Fix:** Run the check against the NOTICE and LICENSE texts before `write_manifest`, or document that a failed build leaves files to be reverted with git.

### IN-05: Worker provider sends a fixed `Origin` header to pass the Worker's origin check

**File:** `tools/lexicon/lex/judge.py:31-32, 462`
**Issue:** Carried forward, unchanged. The script impersonates the site's origin so the Phase 2 allow-list accepts it. The 6-second spacing and the 400-request default cap then draw from the same free quota that site users share. This is a deliberate owner tool, but it works around the intent of the abuse guard.
**Fix:** Make sure the README states that the Worker path shares the site's budget, or give the Worker a separate script token.

### IN-06: Source ids and commit are used to build cache paths, but only the file paths are validated

**File:** `tools/lexicon/lex/sources.py:43-47, 96-97`
**Issue:** Carried forward, unchanged. `cache_path` is `base / source['id'] / commit / path`. `path` is checked for `..` and `commit` is a 40-char hex string, but `id` only has to be a non-empty string. An id such as `../x` would write outside the cache directory. The lock file is committed and reviewed, so exploitability is low.
**Fix:** Require `re.fullmatch(r'[a-z0-9-]+', sid)` in `load_lock`.

### IN-07: A pack that failed to load stays shown as the selected pack and cannot be re-selected to retry

**File:** `js/search-ui.js:88-91, 110`, `js/wordlist.js:213, 322-337`
**Issue:** Carried forward, with one addition from the WR-02 fix. `activeLexiconPack` is set before the load finishes, so the settings list checks that pack even when `wordlistData` is `null`, and clicking an already-checked radio fires no `change` event. New in this iteration: if the very first load failed (for example offline at startup, so `_lastGoodPack` is `null`) and the user then picks another pack that also fails, there is no rollback target. The failed pack's id stays in `lh:lexiconPack` and in `activeLexiconPack`. Before the fix, the rollback went to the (equally unloaded) original pack. The visible effect is the same, no wordlist and a failure toast, and the next page load simply retries the stored pack, so this is low risk.
**Fix:** After a failed initial load, either fall back to the default pack or render the list from the last pack that actually loaded.

### IN-08: Calibration set is still mostly easy cases, so the 90% gate says little about the gray zone

**File:** `tools/lexicon/judgments/calibration.tsv`
**Issue:** The WR-05 fix removed the leakage but, as its report states, did not add borderline words. The 63-line table (62 words) is still dominated by clear K (idioms, common drugs, landmarks) and clear D (chemical and anatomical names). A model can pass 90% without being tested on the mid-level technical nouns and rare idioms that the real run must decide. `npm run lexicon:eval` has also not been run against a live model, so the threshold is unverified.
**Fix:** Before the first paid or quota-limited run, have Andy add 10 to 15 borderline words with labels he is sure of, then run `npm run lexicon:eval` live once.

---

_Reviewed: 2026-10-09_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
