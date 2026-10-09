---
phase: 07-feedback-correction-layer
reviewed: 2026-10-10T00:00:00Z
depth: standard
files_reviewed: 19
files_reviewed_list:
  - worker/src/index.js
  - worker/src/corrections.js
  - admin/index.html
  - tools/corrections/writeback.py
  - js/report.js
  - js/ai-word-events.js
  - css/panels.css
  - index.html
  - worker/DEPLOY.md
  - worker/test/dev-smoke.mjs
  - tests/admin.spec.mjs
  - tests/corrections-site.spec.mjs
  - tests/corrections-writeback.spec.mjs
  - tests/report-entry.spec.mjs
  - tests/worker-admin.spec.mjs
  - tests/worker-corrections.spec.mjs
  - tests/worker-health.spec.mjs
  - tools/corrections/tests/test_live.py
  - tools/corrections/tests/test_writeback.py
findings:
  critical: 0
  warning: 2
  info: 6
  total: 8
status: issues_found
---

# Phase 7: Code Review Report (iteration 2, re-review after fixes)

**Reviewed:** 2026-10-10
**Depth:** standard
**Files Reviewed:** 19
**Status:** issues_found

## Summary

I re-read the fix commits `6bf9726..b185881` against `a819f61` and traced each previous finding through the code. I also ran `python3 -B -m unittest discover -s tools/corrections/tests -t tools/corrections` (50 OK) and `npx playwright test` on the four Worker and write-back specs (98 passed).

**Previous findings, status:**

- **CR-01 resolved.** `/feedback` keeps only the 11 listed string fields (`worker/src/index.js:161,181-182`). Every call site in `js/` (`report.js:38-228`, `rhyme-display.js:153`) sends only whitelisted fields, so no legitimate field is dropped. `decided_by` is written only in `/reports/decision` (`index.js:241`) and checked on every path that applies a report (`corrections.js:343`). The only other writer of `status` is the admin-authenticated decision route, and revoke only deletes fields. No path lets a stranger mark a report agreed.
- **CR-02 resolved.** `exportChanges` and the `.py` generator are gone from `admin/index.html`.
- **WR-01 resolved.** Liveness is checked first in `memberStatus` (`admin/index.html:835`). The Worker returns 409 on decision (non-agreed) and delete for live kvKeys (`index.js:230,257`). All row and batch buttons are disabled when the layer is not loaded (`bt`, `batchBlocked`, `runGroup`, `deleteGroups`).
- **WR-02 resolved.** Revoke writes the layer first, then resets each source report to pending. A reset failure is isolated per key and reported (`resetFailed`). The admin message covers that case.
- **WR-03 resolved** (comment only, accurate now).
- **WR-04 resolved.** `?key=` is honoured only on `/reports.json`, `/reports/decision` and `/reports/delete`. The `/corrections/*` handlers receive an `adminKeyOk` closure with `allowQuery` off, and so do `/health*`. `safeEqual` runs a full-length loop with no early exit. Empty or unset keys are rejected. A wrong header does not fall back to `?key=`, because `??` only falls through on null.
- **WR-05 resolved.** The limiter sits before the 403 and only wrong-key requests reach it, so the correct key never uses quota and cannot be locked out. With no binding it fails open to a plain 403.
- **WR-06 resolved.** The two AI-only reasons are gated on `_report.ai`, and their payloads match the context-menu payloads. The `[hidden]` CSS override and the arrow-key logic over visible buttons are correct. The `?v=` bump is uniform (27 tags, 0.96.11).
- **WR-07 only partly resolved.** The in-run wait is handled correctly, but the same hazard remains outside it. See WR-02 below.
- **WR-08 resolved.** The missing-file, bad-JSON, no-`version` and unreadable-base-item paths all stop with exit 3 before any write. The three-file temp-then-`os.replace` path cleans its temp files on failure. The key never appears in output: `Stop` messages use only exception type names, and the catch-all prints only `type(e).__name__`.

Two new warnings remain, both side effects of the fixes. No critical issues were found. Info items IN-01 to IN-05 are carried forward unchanged.

## Warnings

### WR-01: Old approved reports without `decided_by` fall back to "pending", including ones already written to `data/`

**File:** `admin/index.html:834-843`
**Issue:** `memberStatus` checks `lay.writtenSet` and the `note` shortcut only inside the `agreed && decided_by === 'admin'` branch. Any report approved before this change (agreed, no `decided_by`) now shows as 待審 and sorts to the top of the queue. That includes reports whose kvKey is already in `layer.written` (applied then cleared under the old Worker) and reports Andy approved through the old 「匯出 agreed」 flow and applied by hand. The REVIEW-FIX note covers only the "approved but not yet applied" case.

The risk is a batch 核准 over the pending queue. Worker `apply` skips written kvKeys (`already_written`), but kvKeys that went to `data/` via the removed exporter are not in `written`. Those would be re-applied into the layer and later re-written. A re-write can reverse later manual edits to `data/`, the same shape of harm as IN-01.

**Fix:** Two parts.
1. Trust the Worker-owned `written` list regardless of `decided_by`. Only the Worker's `/corrections/clear` writes it:
```js
function memberStatus(r, lay = layer) {
  if (lay.byKey && lay.byKey.has(r.kvKey)) return 'live';
  if (lay.writtenSet && lay.writtenSet.has(r.kvKey)) return 'written';
  ...
```
2. Before the Worker ships, run a one-off script that archives every report with `status === 'agreed'` and no `decided_by`. Or have `/reports.json` mark them `legacy: true` and have the admin show them as 已處理 instead of 待審. State in DEPLOY.md that this runs once.

### WR-02: Write-back warns about entries revoked during its own wait, but not about entries revoked between commit and the later `--confirm-only`

**File:** `tools/corrections/writeback.py:533-546, 596-603, 611-619`
**Issue:** `finish_live` (exit code 6) only sees revocations that happen inside one `finish_live` call. There are three other routes to the same "already in `data/`, gone from the layer" state, and none of them is detected:
- exit 4 (CDN timeout), followed by a revoke in the admin, followed by `--confirm-only`;
- a commit on a non-live branch (`NOT_LIVE_MSG`), a revoke before the merge, then `--confirm-only`, which can be days later;
- a crash between `git push` and `finish_live`.

In each case `confirmed_batch(entries, logged_ids)` is built from the current layer, so the revoked entry is not in it. The log holds its id, `data/` holds its effect, and the site serves it. The admin shows the entry as live with a 撤回 button the whole time, because nothing tells it the entry is in the log. The revoke succeeds and resets the report to pending, so the admin then claims the correction is gone.

**Fix:** In `--confirm-only` and in `run()` after the push, parse the log lines (`... | corrections:... | {json}`) and flag every logged id that is neither in `layer['entries']` nor covered by `layer['written']` (compare the logged `source_kvKeys` against `written`). Print `revoked_warning` for them and return 6. A cheaper alternative is to have the Worker refuse `/corrections/revoke` for an entry the write-back has marked as committed (a `committed` flag set by a new call before push). That needs a Worker change.

## Info

### IN-01: `written` list is a 5000-entry FIFO, so very old applied reports eventually reappear as "approved"

**File:** `worker/src/corrections.js:17, 299`
**Issue:** Once more than 5000 kvKeys have been cleared, evicted keys fall out of the written set. Those old agreed reports show as 已核准 and can be re-applied by 🚀. `/reports.json` reads only the newest 800, so it is unlikely soon. Document it, or archive a report when it is cleared.

### IN-02: `AbortSignal.timeout` throws synchronously on Safari older than 16.4

**File:** `js/dict.js:114`
**Issue:** The call sits inside `try`, so the failure is caught and the layer is silently skipped. Old iOS devices never see layer corrections. An `AbortController` plus `setTimeout` fallback would fix it.

### IN-03: `urllib` forwards `X-Admin-Key` across redirects

**File:** `tools/corrections/writeback.py:69-73, 497-499`
**Issue:** If `--worker` or the Worker URL ever redirects to another host, `urllib` resends all request headers, including the key. The defaults are fixed HTTPS URLs and the Worker does not redirect, so the risk is low. A custom `HTTPRedirectHandler` that raises would close it.

### IN-04: `WORD_RE` allows invisible and bidi-override characters

**File:** `worker/src/corrections.js:19`; `tools/corrections/writeback.py:~150`
**Issue:** U+202E, U+200B and U+2060 pass in both implementations. A reported word can look different from what is stored. Excluding `\p{Cf}` in both regexes and the shared vectors closes it.

### IN-05: `tests/style.spec.mjs` depends on specific git commits

**File:** `tests/style.spec.mjs:205, 285`
**Issue:** It runs `git show 078c5d1:…` and `git show 952d24f:…`. On a shallow or squashed checkout, `execFileSync` throws. The second call catches it and treats the baseline as 0, which then trips its own `toBeGreaterThan(0)` check.

### IN-06: Duplicate admin-key checks left behind after the central pre-check

**File:** `worker/src/index.js:296, 329`; `worker/src/corrections.js:269, 279, 315`
**Issue:** `route()` now rejects every `ADMIN_PATHS` request with a wrong key before dispatch (`index.js:296`). The `/health*` re-check at `:329` and the per-route `h.adminKeyOk()` calls in `corrections.js` can no longer be reached with a failing key. They are harmless belt and braces, but a future edit to `ADMIN_PATHS` would silently shift which layer enforces what. Keep one layer, or add a comment that the inner checks are intentional. This does not affect the limiter: an inner 403 would skip it, but only if a path is removed from `ADMIN_PATHS`.

---

_Reviewed: 2026-10-10_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
