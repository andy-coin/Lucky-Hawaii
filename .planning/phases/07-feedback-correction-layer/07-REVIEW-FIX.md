---
phase: 07-feedback-correction-layer
fixed_at: 2026-10-10T00:00:00Z
review_path: .planning/phases/07-feedback-correction-layer/07-REVIEW.md
iteration: 2
findings_in_scope: 12
fixed: 12
skipped: 0
status: all_fixed
---

# Phase 7: Code Review Fix Report

**Fixed at:** 2026-10-10
**Source review:** .planning/phases/07-feedback-correction-layer/07-REVIEW.md
**Iteration:** 2 (iteration-1 entries kept below as history; the iteration-2 section is first)

**Summary (cumulative):**
- Findings in scope: 12 (iteration 1: CR-01, CR-02, WR-01 to WR-08; iteration 2: two new warnings, listed as I2-WR-01 and I2-WR-02 to avoid clashing with iteration-1 ids)
- Fixed: 12
- Skipped: 0

## Iteration 2

**Final verification (main checkout):** `npm test` 562 passed / 27 skipped / 0 failed (baseline 561; +1 new admin spec), `npm run corrections:test` 53 OK (was 50; +3), `npm run worker:smoke` all passed. No main-site css/js changed, so no `?v=` bump.

### I2-WR-01: Old approved reports without `decided_by` fell back to 待審, including ones already written to `data/`
**Files modified:** `admin/index.html`, `tests/admin.spec.mjs`
**Commit:** cc813cd
**Applied fix:** `memberStatus` now checks the Worker's `written` set right after the live check and before the `decided_by` gate (live, then written, then the gate). A report in `written` shows as 已寫入 whatever its `decided_by`, so a batch 核准 or 🚀 can no longer pick it up. Dismissed and archived reports keep their own status. Legacy `agreed` reports with no `decided_by` that are neither live nor written still show as 待審; that is intended and they need re-approval. New spec: two legacy reports, one in `written` and one not; the first stays 已寫入, the second is 待審, select-all plus batch 核准 plus 🚀 sends only the second kvKey to `/corrections/apply`.
**Not done:** the review's optional one-off archive script for old `agreed` reports. Reports approved through the removed exporter and never cleared are not in `written` and will show as 待審, so Andy should not batch-approve old items blindly. This is worth stating in the handover.
**Status:** fixed: requires human verification (status-derivation logic).

### I2-WR-02: Write-back missed entries revoked after being written but outside its own wait
**Files modified:** `tools/corrections/writeback.py`, `tools/corrections/tests/test_live.py`, `worker/DEPLOY.md`
**Commit:** 00319c4
**Applied fix:** Every run (preview, `--apply`, `--confirm-only`) now compares the ids logged in `data/applied-changes.log` against the current layer. A logged entry is reported as lost when its id is not in the layer, and its `source_kvKeys` are not all covered by the layer's `written` list or by another live entry's sources. The warning is printed to stderr first, in Traditional Chinese, listing id, target/bucket and value, and the run still proceeds. If it would otherwise exit 0 it exits 6; other failure codes are unchanged. Nothing is cleared for a lost entry. Old-format or unparsable log lines are ignored. The warning stays on every run until Andy removes the entry's line from the log after fixing `data/`, and the message says so. Tests: exit 4, then a revoke, then `--confirm-only`; a non-main commit, a revoke, then `--confirm-only` and preview, silenced after the log line is removed; and no false positives after a normal clear or when the same report is re-applied as a new entry. The test fake Worker now adds sources to `written` on clear, as the real one does. DEPLOY.md documents the extra detection.
**Known limit:** `written` keeps only the newest 5000 keys, so very old cleared entries could be flagged falsely (marked `ponytail:` in code; ties to IN-01).
**Status:** fixed: requires human verification (new exit-6 path, tested only against the fake Worker).

## Iteration 1 (history)

**Where verification ran:** the main checkout on branch `gsd/v0.96-stabilize` (`workflow.use_worktrees` is `false`, so no worktree was created). Final run: `npm test` 561 passed / 27 skipped / 0 failed (baseline 548 passed; the extra 13 are new tests), `npm run corrections:test` 50 OK (was 42), `npm run worker:smoke` all passed.

**Commit grouping note:** CR-01, WR-01 (Worker half), WR-02 (Worker half), WR-03, WR-04 and WR-05 all edit the same two Worker files (`worker/src/index.js`, `worker/src/corrections.js`) and share one test file, so they landed as one commit (`6bf9726`) rather than six. The other findings have their own commits.

## Decisions recorded

- **CR-02 overrides CONTEXT D1 / UI-SPEC D-16 ("keep the legacy export as a backup").** The 「匯出 agreed」 button and the whole Python-script generator are removed from `admin/index.html`. Reason: it was an injection vector, its hard-coded project path does not exist, and `tools/corrections/writeback.py` supersedes it. References in `worker/DEPLOY.md`, `.planning/TEST-CHECKLIST.md` (D-23, 07-CTX-13), `.planning/驗收清單-精簡版.md` (3-18, 5-56) and `ai_guide.md` were updated. The two planning files are force-tracked and were committed with `git add -f`. `ai_guide.md` is gitignored, so its edit is local only.
- **Existing `agreed` reports with no `decided_by` are treated as pending.** The admin page shows them as 待審 and the Worker skips them (`not_agreed`). This is deliberate: it is the only way to tell a forged approval from an old one. Anything approved through the old Worker before this change must be re-approved once. Reports already live are unaffected (liveness is checked first).
- **`/health.json` and `/health/run` are header-only too** (the review's WR-04 named `/health*`; the orchestrator note named `/corrections/*`). Neither is used by the old admin. Tests and `worker/test/dev-smoke.mjs` were updated.

## Fixed Issues

### CR-01: `/feedback` stored client-supplied `status`/`action`
**Files modified:** `worker/src/index.js`, `worker/src/corrections.js`, `tests/worker-corrections.spec.mjs`, `tests/worker-admin.spec.mjs`, `tests/admin.spec.mjs`, `tests/corrections-site.spec.mjs`, `tests/corrections-writeback.spec.mjs`
**Commit:** 6bf9726
**Applied fix:** `/feedback` now keeps only a fixed list of string fields (`type, word, char, reading, reportType, note, suggested, modified, subject, body, action`); anything else, and any object value, is dropped. `/reports/decision` writes `decided_by:'admin'` only for `agreed` and removes it for every other status. `/corrections/apply` requires `report.decided_by === 'admin'` (otherwise skip reason `not_agreed`). New tests reproduce the attack: one `/feedback` post with `status:"agreed"` plus an `action` object ends in `skipped: not_agreed`, an empty public view and zero KV writes. A second test covers a forged record already sitting in KV. A third checks `decided_by` set and cleared across decisions.

### CR-02: Admin "匯出 agreed" code injection and dead path
**Files modified:** `admin/index.html`, `tests/admin.spec.mjs`, `.planning/TEST-CHECKLIST.md`, `.planning/驗收清單-精簡版.md`
**Commit:** 1a292c2
**Applied fix:** Removed `exportChanges()` (about 575 lines), `#exportBtn`, its CSS and its enabling line. The note-input placeholder no longer says 匯出. The old backup-button test became a test that the button is gone and the source contains none of `exportChanges`, `apply_changes`, `DEFAULT_BASE`, `text/x-python`.

### WR-01: Live lock lost when report is not `agreed` or the layer failed to load
**Files modified:** `worker/src/index.js`, `worker/src/corrections.js`, `admin/index.html`, `tests/worker-corrections.spec.mjs`, `tests/admin.spec.mjs`
**Commit:** 6bf9726 (Worker), c5a283f (admin)
**Applied fix:** Worker: `/reports/decision` (status other than `agreed`) and `/reports/delete` return 409 `live` when the kvKey is in a layer entry's `source_kvKeys`. Admin: `memberStatus` checks the layer first, so a live report is always `live` with a 撤回 button. Row buttons, batch actions and delete are disabled and guarded when `layer.state !== 'ok'`, with a Traditional Chinese explanation.
**Status:** fixed: requires human verification (logic change; covered by tests but worth one manual pass with the layer unreachable).

### WR-02: Revoked reports re-applied by the next 🚀
**Files modified:** `worker/src/corrections.js`, `admin/index.html`, `tests/worker-corrections.spec.mjs`, `tests/admin.spec.mjs`
**Commit:** 6bf9726 (Worker), c5a283f (admin)
**Applied fix:** `/corrections/revoke` now also resets each source report to pending (removes `status`, `decided_at`, `action`, `decided_by`) after the layer write succeeds. The response adds `reset` and `resetFailed`. If a reset fails, the revoke still stands and the admin tells Andy which rows to put back to 待審 by hand. The admin updates its local state from `reset` and shows 「已撤回…這筆已改回待審，要重新核准才會再套用」. `/corrections/clear` is unchanged.
**Status:** fixed: requires human verification (changes the revoke contract from "back to approved" to "back to pending").

### WR-03: `rev` is not an atomic lock
**Files modified:** `worker/src/corrections.js`
**Commit:** 6bf9726
**Applied fix:** Comment-only, the review's stated minimum. The header comment now says plainly that `rev` only catches sequential stale clients, that concurrent requests can both succeed, and that write-path reads go through KV's edge cache. I tried a write-then-read etag check and dropped it: the re-read goes through the same edge cache, so it could produce a false 503 after a successful write, which is worse than the problem it solves.

### WR-04: `?key=` accepted on new routes; docs teach the key in URLs and history
**Files modified:** `worker/src/index.js`, `worker/DEPLOY.md`, `tests/worker-corrections.spec.mjs`, `tests/worker-admin.spec.mjs`, `tests/worker-health.spec.mjs`, `worker/test/dev-smoke.mjs`
**Commit:** 6bf9726 (code), 75ce010 (docs)
**Applied fix:** `adminKeyOk(request, url, env, { allowQuery })`: `?key=` is honoured only on `/reports.json`, `/reports/decision`, `/reports/delete`. `/corrections/*` and `/health*` accept only `X-Admin-Key`. The comparison is a constant-time byte loop (`safeEqual`; `crypto.subtle.timingSafeEqual` is not available in the Node test runtime). DEPLOY.md now uses `read -rs LH_ADMIN_KEY; export LH_ADMIN_KEY` and `curl -H "X-Admin-Key: $LH_ADMIN_KEY"`, with no key on any command line, and the write-back commands rely on the exported variable.

### WR-05: No throttling of key failures; shared KV write quota
**Files modified:** `worker/src/index.js`, `worker/DEPLOY.md`, `tests/worker-corrections.spec.mjs`
**Commit:** 6bf9726 (code), 75ce010 (docs)
**Applied fix:** Admin paths with a wrong key now pass through the existing `isRateLimited(request, env, 'adm:')` helper before the 403 (429 when limited). Correct-key requests consume no limiter quota. No limiter binding means plain 403 as before. No new KV namespace or binding; `wrangler.toml` untouched. DEPLOY.md documents that the protection depends on the `[[ratelimits]]` block and states the residual risk: many IPs can still burn the shared 1,000 writes per day, which makes admin writes return 503 until UTC midnight, and `/corrections.json` has no limiter (it spends Worker requests, not writes).

### WR-06: AI-word 建議收錄/修改 unreachable on touch devices
**Files modified:** `index.html`, `js/report.js`, `js/ai-word-events.js`, `css/panels.css`, `tests/report-entry.spec.mjs`
**Commit:** 5fcabd1
**Applied fix:** The report dialog gains two reasons, 建議收錄 and 建議修改, hidden unless the dialog was opened from AI report mode with every picked card being an AI-made word (the same condition as the desktop right-click menu). They post the same `ai-word-suggest` payloads as the context menu (`action:'accept'`, or `action:'modify'` with `modified`). 建議修改 takes the new word from the note box and is blocked, with a Traditional Chinese hint, unless exactly one word is picked and the new word differs from the original and is at most 20 characters. Long-press on cards is not reintroduced. `?v=` bumped on all 27 tags, 0.96.10 to 0.96.11. New tests cover both reasons, the validation messages, arrow-key movement among visible options only, and the plain dialog not showing them.

### WR-07: Write-back could bake in an entry revoked during the CDN wait
**Files modified:** `tools/corrections/writeback.py`, `tools/corrections/tests/test_live.py`, `worker/DEPLOY.md`
**Commit:** b185881
**Applied fix:** `finish_live` re-reads the layer after the wait and sends only ids still present for clearing. Any batch id that does not end up cleared (revoked before the re-read, or between re-read and clear) is printed loudly to stderr with id, target/bucket and value, saying it is already in `data/` and live. The script then exits with the new documented code 6. DEPLOY.md documents code 6. Tests cover both timings. I did not add the optional Worker-side "write-back in progress" flag or log exposure.
**Status:** fixed: requires human verification (new exit code and warning text, exercised only against the fake Worker).

### WR-08: "Re-run is safe" failed on malformed or missing data files
**Files modified:** `tools/corrections/writeback.py`, `tools/corrections/tests/test_writeback.py`, `worker/DEPLOY.md`
**Commit:** b185881
**Applied fix:** `load_overrides` turns a missing file, bad JSON or a missing `version` into `Stop(3, …)` with a Traditional Chinese message. A new `check_base` stops (exit 3, nothing written) on any existing item whose identity (word, or char plus dict_key/from) cannot be read, so the rewrite never silently drops base items. Duplicate base items are called out in the preview. `apply_files` now formats all outputs first, writes each to a temp file in the same directory, and only then `os.replace`s them, cleaning temp files on any outcome. `main()` catches unexpected exceptions into exit 3 with no traceback (a traceback could include the key), and the dirty-tree message now says how to recover from an interrupted run. Tests cover missing file, bad JSON, no version, unreadable base item, format failure leaving every file untouched, an unexpected error, and the duplicate note.

## Skipped Issues

None. Info findings IN-01 to IN-05 were out of scope (`fix_scope: critical_warning`).

## Notes for the orchestrator

- Nothing was pushed, deployed, or committed on `main`. `.planning/.DS_Store`, `milestone.lock`, `state.json`, `handoff.md` and `.gsd/` were not committed.
- `handoff.md` already had uncommitted changes before this run; I did not touch it.
- Deploy implication: the Worker change and the admin page must ship together. A new admin page against the old Worker works but loses the `decided_by` marker, and the old admin against the new Worker shows approvals through the legacy routes, which now write `decided_by` themselves.

---

_Fixed: 2026-10-10_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_

## Orchestrator note
- Iteration 3 re-review skipped: iteration-2 fixes (cc813cd, 00319c4) are narrow, each with new tests; npm test 562/27/0, corrections:test 53 OK, worker:smoke pass. Phase verifier re-checks.
