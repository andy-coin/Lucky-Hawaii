---
phase: 03-split-index-html
reviewed: 2026-10-04T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - index.html
  - tests/verify-split.mjs
  - tests/split-tags.spec.mjs
  - tests/core-node.spec.mjs
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-10-04
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Scope: the skeleton `index.html` (tag list, load order, `?v=` consistency) and the three test files. The contents of `js/*.js` and `css/*.css` were not reviewed for style, per the brief.

What was checked and found sound:

- `node tests/verify-split.mjs 2f2d248` returns OK for both script and style.
- The full Playwright suite passes (245 tests).
- The head and body of `index.html` match the old file apart from the intended tag changes. Only `safety.js` moved from `?v=0.96.3` to `?v=0.96.4`.
- `data/rhyme-dict.js`, `data/polyphonic-order.js` and `js/safety.js` still load in the head, in the original order, before every consumer.
- All 20 `js/` files are plain synchronous classic scripts at the end of `<body>`. There is no `defer`, `async` or `type=module`, and there is no `'use strict'` in the original or the split files.
- Load-time dependency analysis (acorn AST, transitive through function declarations and function-valued `const`s):
  - No top-level code, IIFE body (including the `ui-common.js` panel-init IIFE) or transitive call path references a name declared in a later file.
  - There are no duplicate top-level declarations across files.
  - No JS reads `document.styleSheets`, `<style>` or `currentScript`.
  - The only forward reference is `safety.js` to `exportSession`, `showToast`, `savedWords` and similar names. It sits inside a banner click handler and was already in the old code, so it is not a regression.
- Mutation probes against `verify-split` (run on a scratch copy, not the repo):
  - Reordering two tags: FAIL (caught).
  - A single content change in the middle of a file: FAIL (caught).
  - `defer` on a tag: FAIL (caught).
  - Extra whitespace only at the very start or end of the whole concatenation: still OK. This is by design (`.trim()`) and harmless.

No blockers. The findings below are false-pass and fragility risks in the guard tests, plus one cache-consistency gap.

## Warnings

### WR-01: A commented-out `<script>` or `<link>` tag passes both verify-split and split-tags

**File:** `tests/verify-split.mjs:25-33`, `tests/split-tags.spec.mjs:14-15`
**Issue:**
- Both tools extract tags with a raw regex over the HTML text and do not strip `<!-- -->` comments.
- Reproduced on a scratch copy: wrapping `<script src="js/report.js?v=0.96.4"></script>` in an HTML comment still gives `OK script: 176724 vs 176729` from verify-split.
- That file would no longer load in the browser, so `report.js` would be silently dead.
- split-tags sees the tag as referenced once and in the right place, so its tests (version, once-each, order, sync) also pass.
- Only the Playwright smoke tests would catch it, and only indirectly.
- This is the exact "ignoring files" false-pass the guard tests exist to prevent.

**Fix:** Strip comments before matching, in both tools:
```js
const stripComments = s => s.replace(/<!--[\s\S]*?-->/g, '');
const html = stripComments(readFileSync('index.html', 'utf8'));   // split-tags.spec.mjs
const now  = stripComments(readFileSync('index.html', 'utf8'));   // verify-split.mjs
```
Strip the base HTML the same way in verify-split. Do this before building `base`, so a commented-out inline `<script>` is not counted.

**Resolution:** Fixed in 4bb7431 (test(03)). New `tests/html-lib.mjs` `stripHtmlComments` removes comments outside `<script>`/`<style>` bodies, so JS strings containing `<!--` stay intact. It is used by `verify-split` (index and base) and `split-tags`. Added two negative controls: a commented-out `report.js` / `panels.css` tag drops out of the tag list, and `verify-split` run against a commented-out copy exits 1 while the real file exits 0. `verify-split` takes an optional second argument for the index path. Base size is unchanged (176724 vs 176729).

### WR-02: `data/*.js` scripts have no `?v=` and are outside every split-tags check

**File:** `index.html:17-18`, `tests/split-tags.spec.mjs:16-17`
**Issue:**
- `isLocal` only matches `^(js|css)/`, so `data/rhyme-dict.js` and `data/polyphonic-order.js` are exempt from all of these checks:
  - the shared-`?v=` test
  - the once-each test
  - the synchronous-load test
  - the "before the first main script" ordering
- `init.js` does `rhymeDict = window._rhymeDictData || {}`. If those tags were moved after the main scripts, or given `defer`, the dictionary would silently become `{}` instead of failing loudly.
- The two data scripts are unversioned, while the `js/` files are cache-busted.
- On GitHub Pages (about a 10 minute cache), a new `?v=` bump for `js/` can therefore pair with a stale `rhyme-dict.js`. That is the "mixed old/new files" scenario the `?v=` test is meant to prevent.
- The file is regenerated by `scripts/`, so it does change.

**Fix:**
- Add `?v=0.96.4` to the two data tags, and make the versions test cover them. For example, widen `isLocal` to `^(js|css|data)/`, and exclude `data/` from the on-disk-equals-referenced test, because `data/` holds many unreferenced files.
- Add a test that both data scripts appear before the first `js/phonetic-tables.js`, and are not async/defer.

**Resolution:** Fixed in 4326dda (fix(03), `index.html` tag-only change: `?v=0.96.4` on both data tags) and 1de6c93 (test(03)). `split-tags` now includes `data/` in the shared-`?v=`, sync-load and once-each checks. The on-disk comparison still covers `js/` and `css/` only. A new test requires exactly `data/rhyme-dict.js` and `data/polyphonic-order.js` before the first `js/` script. Mutations that drop `?v=`, add `defer`, or remove a data tag each fail one test. `verify-split` is unaffected because it only reads `js/` and `css/` tags.

### WR-03: Browser-parity test silently depends on `data/rhyme-dict-overrides.json` being empty

**File:** `tests/core-node.spec.mjs:73-83` (see also `:21-24`)
**Issue:**
- The Node side loads `data/rhyme-dict.js` and calls `buildIndex()` once.
- The browser side (`bootPage` waits for `__hoyunReady`) additionally runs `applyRhymeDictOverrides()`, which fetches the real `data/rhyme-dict-overrides.json` and rebuilds the index.
- The committed file is currently all-empty arrays, so the two agree. As soon as the admin dashboard commits any `removed`, `hidden`, `fixed` or `added` entry, this test fails with a spurious "Node and browser differ" error.
- That error would point at the split instead of the data change.

**Fix:** Make the browser side deterministic. Either route `**/data/rhyme-dict-overrides.json` in the test to a fixed empty overrides payload, or apply the same overrides in the Node `loadCore` (read the JSON and call `applyRhymeDictOverrides` equivalents). The first is two lines:
```js
await context.route('**/data/rhyme-dict-overrides.json', r => r.fulfill({ status: 200, contentType: 'application/json',
    body: '{"version":2,"removed":[],"hidden":[],"fixed":[],"added":[]}' }));
```
Register it before `bootPage` navigates, for example via `beforeGoto`.

## Info

**Resolution:** Fixed in 0fbc14d (test(03)). The browser side of the parity test routes `data/rhyme-dict-overrides.json` and `data/wordlist-overrides.json` to fixed empty payloads, and asserts the rhyme override request was served by the stub. Checked with a temporary `removed` entry for 愛: the old test failed and the new one passed. `data/` was restored afterwards. `polyphonic-order.json` is not an override and is left as is.

### IN-01: verify-split fails with an unhelpful TypeError and depends on the current directory

**File:** `tests/verify-split.mjs:14-19`
**Issue:**
- `baseBody` does `exec(base)[1]`. If the base commit has no inline `<script>`/`<style>` (for example, someone passes `HEAD` or a later commit), it throws `Cannot read properties of null` instead of printing a clear message.
- `readFileSync('index.html')` and the `js/`/`css/` reads are relative to the current directory, while `git show` works from any subdirectory. Running from elsewhere in the repo gives a confusing ENOENT.

**Fix:** Guard the null (`?.[1] ?? fail('基準 commit 沒有 inline <tag>')`) and `process.chdir(new URL('..', import.meta.url).pathname)` at the top.

**Resolution:** Fixed in 5d18f50 (test(03)). `verify-split` now chdirs to the repo root and exits 2 with a clear message when the base commit has no inline tag (checked with `HEAD`). It also works when run from `tests/`.

### IN-02: Small robustness gaps in the stylesheet checks

**File:** `tests/split-tags.spec.mjs:86-93`
**Issue:**
- The relative-`url()` check false-fails on fragment references such as `url(#grad)`.
- It also does not cover `@import "x.css"` without `url()`, which is relative to `css/` for the same reason.
- No such case exists today, so the check works as intended.

**Fix:** Allow `^#` in the `url()` check and add a scan for `@import\s+['"]`.

**Resolution:** Fixed in 5a61276 (test(03)). `url(#id)` is allowed, and a relative `@import "x.css"` without `url()` now fails. Both were checked with a temporary css file.

### IN-03: Overlapping and duplicated test code

**File:** `tests/split-tags.spec.mjs:36-52`, `tests/core-node.spec.mjs:31,40`
**Issue:**
- The "safety.js first, rest in original order" test duplicates the prefix check that the later "split complete" test makes with `toEqual(JS_ORDER)`. It exists to support intermediate commits, so after the split is done it is redundant.
- In `core-node.spec.mjs`, the first test defines a local `get` that is identical to the module-level `pick` defined right below it.

**Fix:** Keep as is, or drop the prefix-only test and reuse `pick` in the first test once the split phase closes.

**Resolution:** Partly fixed in 2f5239e (test(03)): the first `core-node` test now reuses `pick`. The overlapping prefix test in `split-tags` was kept on purpose, since it also covers intermediate states.

---

_Reviewed: 2026-10-04_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
