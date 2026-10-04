---
phase: 04-ai-fill-validate-ai
reviewed: 2026-10-04T00:00:00Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - js/candidates.js
  - js/ai-generate.js
  - js/wordlist.js
  - js/state.js
  - js/panels.js
  - js/search.js
  - index.html
  - tests/ai-fill.spec.mjs
  - tests/wordlist-cache.spec.mjs
  - tests/node-core.mjs
  - tests/helpers.mjs
  - tests/core-node.spec.mjs
  - tests/ai-client.spec.mjs
  - tests/smoke.spec.mjs
  - tests/split-tags.spec.mjs
findings:
  critical: 1
  warning: 4
  info: 4
  total: 9
status: issues_found
---

# Phase 4: Code Review Report

**Reviewed:** 2026-10-04
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Reviewed the phase-04 diff (`2f5239e..HEAD`). What holds up:

- **Fill count.** `fillToTarget` always returns `min(24, pool)` unique in-pool words.
- **XSS gate for generated words.** `generatedWordOk` requires every code point to be in `charInfo`. I loaded the real dictionary: 13157 keys, every one a CJK character, no `< > " ' & \`.
- **IndexedDB swap.** The delete, ten puts and `ver` run in one readwrite transaction with no await in between. `IDBKeyRange.bound(0, 1e9)` covers only numeric keys, because string keys sort after numbers. `put()` clones synchronously, so the later override mutation cannot reach the cache.
- **Single load.** `loadWordlist` has a single in-flight promise and resets `_wlP` in `finally`.

Main defects:

- The in-flight AI call is not guarded against stale presses.
- `aiWordCardHtml` does not escape its input.
- One exception in the overrides step now discards the whole wordlist.
- The tests do not prove the "atomic swap" or "stale press" claims.

## Critical Issues

### CR-01: Stale AI response overwrites the panel and pollutes the pools (no staleness check after `callLLM`)

**File:** `js/ai-generate.js:129-137` (fill path), `js/ai-generate.js:30-64` (generate path), compare the only guard at `js/ai-generate.js:92`
**Issue:** The "search changed while waiting, void this press" check exists only around `await loadWordlist()`. The real long await is `callLLM` (up to a 35 s timeout), and nothing is re-checked after it.

During that window the user can search a different character, toggle a filter, change the length chip or hit reset. Nothing blocks this. `searchRhyme`, `toggleFilter`, `cycleFilterWordLen` and `resetSuggestedPool` clear `suggestedPool`, `sentCandidatesSet`, `cumulativeCandidates` and the container, and `updateAIRhymeDisplay` replaces `currentRhymes`.

When the old response arrives:

- **Fill path.**
  - It writes the old search's 24 words into `container.innerHTML`.
  - It adds them to the freshly cleared `suggestedPool` and `sentCandidatesSet`.
  - It leaves `lastCandidatesTotal` from the old pool.
  - The panel then shows words that do not rhyme with the current search, under the new search's rhyme display.
- **Generate path (`generateAIWords`).** `kept` is validated against the new `currentRhymes`, but the exclude set, `remaining` and `pool` belong to the old press. The words are injected into the new panel and the pools.

This is the same invariant the new test "等詞庫期間換了搜尋" enforces, but only for the wordlist-wait await.

**Fix:** Snapshot a press token at the start and re-check it after every await, bailing before any DOM or pool mutation.
```js
let _aiPress = 0;               // module scope
async function generateAISuggestions() {
    ...
    const myPress = ++_aiPress;
    const stale = () => myPress !== _aiPress || currentRhymes !== snapRhymes || rhymeMode !== snapMode;
    // snapRhymes/snapMode captured once, right after the early guard (not only inside the load branch)
    ...
    const txt = await callLLM(m, prompt);
    if (stale()) return;        // same before generateAIWords mutates anything
```
Increment `_aiPress` in `searchRhyme`, `toggleFilter`, `cycleFilterWordLen` and `resetSuggestedPool` (or compare a shared "pool epoch" counter), so a filter or reset also voids the in-flight press. Pass `stale` into `generateAIWords` and check it after its `callLLM`.

## Warnings

**Resolution:** fixed in 23c75d4. A shared `_aiEpoch` counter (state.js) goes up wherever the pools are cleared (`searchRhyme` on a new input, `toggleFilter`, `cycleFilterWordLen`, `resetSuggestedPool`). `generateAISuggestions` snapshots epoch, `currentRhymes` and `rhymeMode` at the start and builds `stale()`. It re-checks after `loadWordlist`, after the fill-path `callLLM`, and after `generateAIWords`. `generateAIWords` takes `stale` and re-checks after its own `callLLM`, on both the success and the failure path, so no stale status line or message reaches the new panel. A stale press touches no DOM, `suggestedPool` or `sentCandidatesSet`. Two e2e tests (fill path and generate path) each change search, filter, word length and reset while `/ai` is pending, and both fail without the fix.

### WR-01: `aiWordCardHtml` interpolates `w` unescaped into an HTML attribute and an inline JS string

**File:** `js/ai-generate.js:3`
**Issue:** The helper is now the single card template for both pool words (`isAI=false`) and AI words. The AI path is protected only by the caller's `generatedWordOk`. The pool path has no check at all.

- Pool words come from `data/wordlist*.json` and from `data/wordlist-overrides.json` `added[].w`. The overrides file is exported from the admin dashboard, which fed from public user feedback. `a.w` only gets a truthiness and `'?'` check in `applyWordlistOverrides`.
- A word containing `"` breaks out of `data-word="..."`.
- A word containing `\` or `</...` gets through. `replace(/'/g, "\\'")` does not escape backslashes, so `\'` turns into `\\'` and ends the string literal early inside `onclick`.

This was already true before the phase, but the phase's claim is "generated text only renders after a dictionary-char check". The helper itself offers no protection, so any future caller is unsafe.

**Fix:** Escape inside the helper, or drop the inline handler.
```js
const esc = s => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
return `<div class="ai-word-card" data-word="${esc(w)}">${esc(w)}${isAI ? '<span class="ai-badge">AI</span>' : ''}</div>`;
```
Then handle the click by delegation on `#aiWordsContainer` using `card.dataset.word`. `ai-word-events.js` already delegates contextmenu and touch. The smoke test that scans for `onclick="saveWord("` would need updating. Also validate `a.w` with `/^[一-鿿]{1,8}$/` when applying overrides.

**Resolution:** fixed in 0ef8e85. `aiWordCardHtml` now escapes `& < > " '` for the attribute and body, and builds the `onclick` argument with `JSON.stringify` (handles backslashes, quotes, newlines) followed by HTML escaping. The inline `onclick="saveWord(` text is kept, so the smoke coverage scan still finds it. A new test renders ten words containing `"<>'\` and injection payloads, clicks each card, and asserts the saved word equals the original, with no injected elements and no `__pwn`. It fails on the old template. Not done: the `/^[一-鿿]{1,8}$/` check on `a.w` in `applyWordlistOverrides`. It could drop legitimate words (symbols, Latin letters), and escaping already removes the risk.

### WR-02: Any exception in `applyWordlistOverrides` now leaves `wordlistData === null` for a fully loaded wordlist

**File:** `js/wordlist.js:130`, `js/wordlist.js:145-174`
**Issue:** `wordlistData = buf.length > 0 ? await applyWordlistOverrides(buf) : null;` assigns only if the call returns. Only the `fetch`/`json()` part of `applyWordlistOverrides` is in `try`.

Possible throws:

- `ovr` is `null`, so `ovr.removed` throws a TypeError.
- `a.z.includes` runs on a non-string `a.z`.
- `ovr.removed` is a non-iterable object, so `new Set(...)` throws.

The exception propagates to `.catch(e => lhWarn(...))` in `loadWordlist`, and the user sees "詞庫載入失敗，請重新整理頁面" on every press. Before the phase, `wordlistData` was already assigned before the overrides step, so the wordlist stayed usable. The cache write also completes (floating `cacheP`), so a refresh does not fix it.

**Fix:** Wrap the processing in the same guard that returns `list` unchanged on any failure.
```js
try { ...whole body after r.json()... return filtered; }
catch (e) { lhWarn('詞庫修正檔套用失敗', e); return list; }
```
Note that `removed` words would already have been deleted from the two maps by then. Either build into temporaries first, or tolerate the inconsistency.

**Resolution:** fixed in 6bd19a1. `applyWordlistOverrides` computes everything into temporaries (a new list, `mapDel`, `mapSet`) and writes the two maps only after the loop succeeds. Entries are copied instead of mutated for `fixed`. Any exception returns the unmodified list with `lhWarn('詞庫修正檔套用失敗…')`. A non-string `a.w` or `a.z` in `added` is skipped per entry. The test covers `null`, `removed: 5`, and a failure after the removed words were already computed (`removed: [...], added: 5`). It asserts the wordlist loaded, the word is still in the list and both maps, and the warning was logged. It fails without the fix.

### WR-03: Generation prompt excludes the OLDEST 40 words instead of the newest

**File:** `js/candidates.js:346` (fed by `js/ai-generate.js:155`)
**Issue:** `[...excludeSet].slice(0, 40)` takes the first 40 in insertion order. The set is `[...suggestedPool, ...savedWords]`, so it holds the words suggested in earlier presses. The words just listed (the pool that triggered generation) and the newest saved words are at the end and never reach the prompt.

The AI is told to avoid old words and is free to repeat the ones the user is looking at. `generateAIWords` then silently drops them, so `kept` shrinks and the "AI 也想不到" message becomes more likely. The result is correct but wasteful. `savedWords.slice(-30)` elsewhere uses the right end, so this is inconsistent.

**Fix:** `[...excludeSet].slice(-40)`. The test at `tests/ai-fill.spec.mjs:361-364` asserts `fifty.slice(0, 40)` and must flip to `slice(-40)`.

**Resolution:** fixed in b47f5c2. `buildGenPrompt` now uses `slice(-40)`, and the test assertion flipped to `fifty.slice(-40)`.

### WR-04: Tests do not have teeth for the two headline guarantees (atomic swap, stale press)

**File:** `tests/wordlist-cache.spec.mjs:70-190`, `tests/ai-fill.spec.mjs:209-247`, `tests/ai-fill.spec.mjs:422-458`
**Issue:**

- **Atomicity is never exercised.** Scenario ② fails a network chunk, so no write happens at all. Nothing injects a write failure (abort, quota, error mid-transaction) and then asserts the old ver and chunks survived. Replacing `_idbReplaceAll` with "delete all, then put one by one in separate transactions" would pass the whole file. The sentinel only proves `clear()` is not used.
- **Stale press is covered only for the wordlist-wait await.** No test changes the search, toggles a filter or resets while `/ai` is pending (CR-01). That gap hid the bug.
- **Mirror test slack.** `validateWordRhyme` vs the wordlist filters passes at ≥97%. A systematic 3% divergence (for example polyphonic words) cannot fail it. It only checks the "candidate then validate" direction, not "validate accepts, filter rejects". It does not cover `sameTone`, `sameChar` or `wordLen`, which the rest of the file sets up.
- **Timing flake risk.** `genRound` and `pressOnStub` use `waitForTimeout(300)` to wait for rendering.

**Fix:**

- Add a test that wraps `IDBObjectStore.prototype.put` to throw or abort on the 5th chunk, then asserts old ver and chunks are intact.
- Add a pending-`/ai` test that fulfils the route only after a new search, then asserts the container is empty and `suggestedPool.size === 0`.
- Tighten the mirror threshold or enumerate the diffs.
- Replace `waitForTimeout` with an expectation on the final DOM state.

## Info

**Resolution:** fixed in 59be00a (tests only).
- Atomicity: new `快取寫入失敗` tests inject a failure on the put of the 5th chunk, in two modes. `throw` is a synchronous `DataCloneError`. `abort` aborts the transaction inside `put`. Both assert that `ver` and all ten old chunks are intact, that the in-memory wordlist is the new one, that a warning and a toast appear, and that the next load heals the cache to V2. The `throw` mode fails if the IN-01 abort is removed.
- Stale press: covered by the CR-01 tests.
- Mirror test: the forward threshold is raised from 0.97 to 0.99 (measured minimum is about 99.5%). Cases are added for same char, same tone, and word length 2 or 4+, for both tail and head rhyme. A reverse direction is added (validate accepts, filter does not give it). It is only a coarse bound (at most 40%, measured maximum about 30%) and is not meant as a precise mirror. This is by design: the filters read the wordlist's real reading, while `validateWordRhyme` only sees the text, so it accepts any dictionary reading of a character. Polyphonic words and `sameTone`, which uses only the first reading, therefore diverge. The reasoning is in a comment in the test.
- Timing: both `waitForTimeout(300)` calls are replaced by waiting for the button to unlock and the loading bar to hide, which only happens in `finally`.

### IN-01: `_idbReplaceAll` catch path does not abort the transaction

**File:** `js/wordlist.js:43-52`
**Issue:** If `put` throws synchronously (for example `DataCloneError` or `InvalidStateError`) after `delete` and some puts were queued, `fin(false, e)` runs but the transaction is not aborted. It commits the delete and the partial puts, which contradicts the comment "abort 會整筆還原". The completeness check in `_loadWordlistOnce` limits the damage, so this is hardening only. `safety.js` already does `try { tx.abort(); }` in the same situation.
**Fix:** Hoist `let tx;` above the `try` and call `try { tx && tx.abort(); } catch (_) {}` in the `catch`.

**Resolution:** fixed in 22656cd and a706e90. `tx` is hoisted above the `try`, and the `catch` calls `tx.abort()`. If the abort itself fails, it is logged via `lhWarn`; the scan test `沒有吞錯的 catch` requires that, as in safety.js. The `throw`-mode injection test covers it and fails without the abort.

### IN-02: Pool-empty presses call the AI again every time (the old "extra round" cap is gone)

**File:** `js/ai-generate.js:148-159`, `js/state.js`, `js/panels.js:1-8`
**Issue:** `_aiExtraRoundDone` was removed. When `pool.length === 0`, every press now calls `generateAIWords(24, …)`. The exhausted state appears only when the AI returns nothing valid and new. Each press is "once" (D-05 and the tests agree), but there is no per-search ceiling. A model that keeps inventing valid words never reaches "已推薦所有…", and each press costs a free-tier AI call.
**Fix:** Confirm this is intended. If "generate only once otherwise" means once per search, restore a per-search flag, cleared in `searchRhyme`, `toggleFilter`, `cycleFilterWordLen` and `resetSuggestedPool`.

**Resolution:** accepted, intended. One AI call per press, even when the pool is empty (D-05), and the tests agree. Each press is a deliberate user action. The exhausted message appears when the AI returns nothing valid and new. No per-search ceiling is added.

### IN-03: `generateAISuggestions` has `try/finally` but no `catch`

**File:** `js/ai-generate.js:85-165`
**Issue:** An unexpected exception (for example a bad `charInfo` shape or a null element) unlocks the button through `finally`. It then leaves an empty panel with no user message and an unhandled rejection from the inline `onclick`. Failures from `callLLM` are handled, but nothing else is.
**Fix:** Add `catch (e) { lhWarn('AI 建議失敗', e); showToast(AI_FALLBACK_MSG); }` before the `finally`.

**Resolution:** fixed in fc2ea0d. Added `catch (e)` before `finally` in `generateAISuggestions`. It calls `lhWarn('AI 建議失敗', e)` and shows the toast 「建議詞產生失敗，請再按一次試試」 (skipped if the press is stale). The button still unlocks in `finally`. A test injects an exception into `fillToTarget` and asserts the toast, the warning, that the button unlocks, and that there is no `pageerror`.

### IN-04: Cache edge cases and removed test coverage

**File:** `js/wordlist.js:86-89`, `tests/split-tags.spec.mjs` (diff)

- **Offline fallback.** `currentVer` is `null` when the meta fetch fails (offline). `useCache` is then false even with a complete cache, so offline use falls back to the network and fails. This matches the old behaviour, but CLAUDE.md advertises offline use. Consider trusting a complete cache when the meta fetch fails.
- **Old non-atomic caches.** Caches written by the old code can already hold a new `ver` with mixed-version chunks. The completeness check catches missing chunks, not stale ones. The mismatch heals only at the next version bump.
- **Dropped negative control.** The `verify-split` negative-control test and script were deleted along with `tests/verify-split.mjs`. Confirm that is intentional, because it removes the only end-to-end proof that a commented-out `<script>` tag is detected.

**Resolution:** documented only, no code change.
- Offline fallback: `currentVer` is `null` when the meta fetch fails, so a complete cache is not used. This matches the old behaviour. Trusting a complete cache when the meta fetch fails is left as a candidate for a later phase.
- Old non-atomic caches: stale mixed chunks heal at the next version bump.
- Dropped `verify-split` negative control: not decided here. The reviewer asked for confirmation that the deletion was intentional.

---

_Reviewed: 2026-10-04_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
