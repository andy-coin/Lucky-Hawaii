---
phase: 02-ai-service-hotfix-ai
plan: 02
subsystem: worker-deploy
tags: [wrangler, cloudflare-worker, kv, supply-chain-gate, characterization-tests, playwright]

requires:
  - phase: 02-ai-service-hotfix-ai
    provides: "plan 02-01 tracked worker/ (index.js with /ai and /models, ai.js, models.js), tests/worker-helpers.mjs (FakeKV, makeEnv)"
provides:
  - "wrangler 4.147.0 pinned in package.json/package-lock.json behind an automated supply-chain gate; scripts worker:dev, worker:check, worker:deploy"
  - "worker/wrangler.toml (tracked): name lucky-hawaii, keep_vars, daily cron, secrets.required x3, USER_FEEDBACK_KV + AI_STATE_KV (fill-in ids), AI_LIMITER"
  - "worker/check-ids.mjs deploy guard; tracked worker/.gitignore (.dev.vars*, .wrangler/)"
  - "worker/src/index.js: ported /feedback, /reports.json, /reports/decision, /reports/delete, /reports with byte-compatible behaviour"
  - "tests/worker-config.spec.mjs (4 tests) and tests/worker-admin.spec.mjs (14 tests)"
affects: [02-03, 02-04, 02-05, 02-06]

actuals:
  tokens: 6111   # chars/4 over git diff 874974940f34..HEAD excluding package-lock.json (24,445 chars)
  tasks: 2
  commits: 3
plan_head_before: 874974940f348993bc30d52bfad782a402ed8649
plan_head_after: 49efe1f5b6cb2bf2f473a4c53ed14f65806affe4

tech-stack:
  added: ["wrangler 4.147.0 (devDependency)"]
  patterns:
    - "Deploy config in git, secrets out of git: tracked worker/.gitignore, [secrets] required, keep_vars above the first TOML table"
    - "Characterization tests: old dashboard Worker behaviour is the spec; drive worker.fetch with FakeKV, no browser"
    - "Idempotency checked by comparing git status before and after two dry-run deploys"

key-files:
  created:
    - worker/wrangler.toml
    - worker/check-ids.mjs
    - worker/.gitignore
    - tests/worker-config.spec.mjs
    - tests/worker-admin.spec.mjs
  modified:
    - package.json
    - package-lock.json
    - worker/src/index.js

key-decisions:
  - "KV fill-in form kept as REPLACE_WITH_USER_FEEDBACK_KV_ID / REPLACE_WITH_AI_STATE_KV_ID: wrangler 4.147.0 dry-run accepts them with no warning, so the 000...01/02 fallback was not needed (plan 02-06 quotes the REPLACE_WITH form)"
  - "fsevents allowed in the install-script gate by orchestrator amendment (see Supply-chain gate); no allowScripts config added"
  - "Admin routes ported unchanged including key-in-URL and e.message in 500 bodies (accepted T-02-09 / T-02-10; hardening is Phase 7)"
  - "The ported routes sit in their own handler (handleFeedbackAdmin) that returns null for other paths, so /ai and /models are untouched"

patterns-established:
  - "worker/.gitignore must be force-added once (root .gitignore has a bare .gitignore pattern); tracked afterwards"

requirements-completed: [FND-05]

coverage:
  - id: D1
    description: "wrangler 4.147.0 pinned exactly and passed the automated supply-chain gate (signatures, install scripts limited to esbuild/workerd/fsevents, zero high audit findings, other pins unchanged)"
    requirement: FND-05
    verification:
      - kind: other
        ref: "npm audit signatures; npm audit --audit-level=high; lockfile hasInstallScript subset check (exit 0 each)"
        status: pass
    human_judgment: false
  - id: D2
    description: "npm run worker:check (wrangler deploy --dry-run) works offline, lists USER_FEEDBACK_KV, AI_STATE_KV and AI_LIMITER with no WARNING, and re-running leaves the worktree unchanged"
    requirement: FND-05
    verification:
      - kind: integration
        ref: "tests/worker-config.spec.mjs#config：dry-run 部署離線可跑、重跑結果相同"
        status: pass
    human_judgment: false
  - id: D3
    description: "wrangler.toml shape (name, main, keep_vars before first table, cron, secrets.required, two KV bindings with ids, AI_LIMITER, no dev-only switches)"
    requirement: FND-05
    verification:
      - kind: unit
        ref: "tests/worker-config.spec.mjs#config：wrangler.toml 形狀"
        status: pass
    human_judgment: false
  - id: D4
    description: "No key or secret is tracked; .dev.vars* and .wrangler/ are ignored by the tracked worker/.gitignore"
    requirement: FND-05
    verification:
      - kind: unit
        ref: "tests/worker-config.spec.mjs#config：金鑰不在 git"
        status: pass
    human_judgment: false
  - id: D5
    description: "npm run worker:deploy refuses (exit 1, Traditional Chinese message) while either KV id is a fill-in value or fewer than two ids exist"
    requirement: FND-05
    verification:
      - kind: unit
        ref: "tests/worker-config.spec.mjs#config：KV id 沒填不准部署"
        status: pass
    human_judgment: false
  - id: D6
    description: "The ported feedback/admin routes answer with the same statuses, bodies, KV writes, check order and CORS header as the old dashboard Worker"
    requirement: FND-05
    verification:
      - kind: unit
        ref: "tests/worker-admin.spec.mjs (14 tests, all prefixed admin：)"
        status: pass
    human_judgment: false
  - id: D7
    description: "A real deploy over the live dashboard-made Worker keeps USER_FEEDBACK_KV bound, secrets intact and the admin page working"
    requirement: FND-05
    verification: []
    human_judgment: true
    rationale: "Needs Andy's wrangler login, the real KV ids and a read of wrangler's diff prompt; nothing may be deployed automatically. Covered by the Human check in plan 02-06 (worker/DEPLOY.md)"

duration: 5min
completed: 2026-10-03
status: complete
---

# Phase 2 Plan 02: Worker deploy config and admin routes Summary

**wrangler 4.147.0 is pinned behind an automated supply-chain gate, `worker/wrangler.toml` (keep_vars, cron, required secrets, two KV bindings, rate limiter) dry-runs offline with all three bindings and no warning, `npm run worker:deploy` refuses until real KV ids are filled, and the feedback/admin routes are ported into the new Worker with byte-compatible behaviour under 14 characterization tests.**

## Performance

- **Duration:** 5 min (re-execution 2026-10-03T15:50:14Z to ~15:55Z). An earlier attempt of about 6 min halted at the supply-chain gate and is described below.
- **Tasks:** 2 (Task 2 TDD: RED then GREEN)
- **Files:** 8 changed (5 created, 3 modified)
- **Tests:** `npm test` 131 passed (113 baseline from 02-01 + 4 config + 14 admin). The known WR-05 intermittent did not fire.

## Supply-chain gate (O-1, threat T-02-SC) for Andy

Command: `npm install --save-exact -D wrangler@4.147.0` (npm 11.19.0, Node 26.8.1).

| Gate | Result |
|------|--------|
| (a) `npm audit signatures` | exit 0 - 39 packages have verified registry signatures, 24 have verified attestations |
| (b) lockfile `hasInstallScript` subset of esbuild, workerd, fsevents | exit 0 - set is `node_modules/esbuild`, `node_modules/fsevents`, `node_modules/workerd` |
| (c) `npm audit --audit-level=high` | exit 0 - found 0 vulnerabilities |
| (d) pins | exit 0 - wrangler `4.147.0`, `@playwright/test` `1.63.0`, `acorn` `8.18.0`; no `type` field; no `allowScripts` config |

**fsevents was allowed by orchestrator amendment (2026-10-03), not by the original plan.** The first attempt halted at gate (b) because `node_modules/fsevents@2.3.3` (`dev`, `optional`, `os: darwin`, install script `node-gyp rebuild`) is wrangler's own optional dependency and the original allowlist named only esbuild and workerd. I stopped, restored package.json/package-lock.json byte-identical and reported; the orchestrator amended the plan (must-have, step 1(b), the acceptance one-liner, T-02-SC) to allow fsevents and I re-ran Task 1 from the install step. Facts behind the amendment: repository github.com/fsevents/fsevents, maintainers pipobscure and paulmillr, signature verified by gate (a), last modified 2024-09-18, not present in the base lockfile, and on this Mac npm did not even materialise it, so its script did not run.

**Note for Andy:** wrangler 4.147.0 was published 2026-10-02 and is flagged too-new. Signatures, attestations and audit were clean. The only fallback is pasting the bundle by hand, which loses FND-05 (one-command, config-in-git deploy). Do not downgrade: 4.140.0 and older carry the high-severity undici advisory. esbuild and workerd have `postinstall: node install.js` (their binary check); dev and dry-run work without approving them.

## KV fill-in form and dry-run bindings

Form in the file: `REPLACE_WITH_USER_FEEDBACK_KV_ID` and `REPLACE_WITH_AI_STATE_KV_ID`. Plan 02-06 should quote these exact strings. `npm run worker:check` output (no WARNING):

```
env.USER_FEEDBACK_KV (REPLACE_WITH_USER_FEEDBACK_KV_ID)      KV Namespace
env.AI_STATE_KV (REPLACE_WITH_AI_STATE_KV_ID)                KV Namespace
env.AI_LIMITER (20 requests/60s)                             Rate Limit
--dry-run: exiting now.
```

`npm run worker:deploy` exits 1 in this state (the guard fires before wrangler runs). `worker/check-ids.mjs` also rejects the `000...01` / `000...02` fallback forms and fewer than two ids.

## admin/woker.js hash check

`shasum admin/woker.js` before Task 1, after Task 2 and at the end: `58e8f8bf6debb7e01218393d6b17e67e8869f7bb` (identical, still gitignored, never staged). The feat commit `49efe1f` file list is only `worker/src/index.js`; the acceptance command that greps the commit's file list for `admin/woker.js` exits 0.

## Task Commits

1. **Task 1: wrangler pin, wrangler.toml, guard, ignore rules, config spec** - `b3b7683` (chore)
2. **Task 2 RED: characterization tests** - `7021bea` (test) - 13 of 14 fail on the missing routes (404), 1 already holds (AI paths unaffected guard)
3. **Task 2 GREEN: ported routes** - `49efe1f` (feat)

Commit count measured from the ledger: `git rev-list --count 874974940f34..HEAD` = 3. No REFACTOR commit. Docs commit skipped: `.planning/` is gitignored (SUMMARY not force-added, per orchestrator).

## Accomplishments

- Pinned wrangler 4.147.0 with gate evidence; added `worker:dev`, `worker:check`, `worker:deploy` scripts.
- `worker/wrangler.toml` in the validated Pattern 1 shape with Traditional Chinese comments; dev-only switches (`ALLOW_LOCAL_ORIGIN`, provider bases, timeouts) appear nowhere in it, asserted by test.
- Deploy guard protects the live feedback namespace (T-02-07); secrets cannot be committed (T-02-06, scanned for `AIza…`/`gsk_…` over every tracked non-data file).
- Ported the five feedback/admin routes in one handler ahead of `/ai`/`/models`: same order of checks (key before method on `/reports/*`, method before origin on `/feedback`), same plain-text bodies, same JSON shapes, same KV key format and value shape, same newest-first sort, same decision semantics.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `worker/.gitignore` had to be force-added**
- **Found during:** Task 1, staging
- **Issue:** the local root `.gitignore` has a bare `.gitignore` pattern, which also ignores `worker/.gitignore`, so a plain `git add` refused it; the plan requires it tracked (acceptance: `git ls-files worker/.gitignore` prints the path).
- **Fix:** `git add -f worker/.gitignore` for that single planned path. Once tracked it needs no further force. No `.planning/` file and no other ignored file was force-added.
- **Commit:** `b3b7683`

**2. [Test adjustment] Idempotency compared before and after instead of expecting empty**
- **Found during:** Task 1, first spec run
- **Issue:** the plan asks for `git status --porcelain -- worker package.json package-lock.json` to be empty after the second dry run, but before the commit those paths are legitimately dirty (new files), so the spec could not pass at authoring time.
- **Fix:** `config：dry-run…` records the status before the two runs and asserts it is unchanged after, which proves the same FND-05 idempotency and holds both before and after commit. After the commit the status is in fact empty.
- **Commit:** `b3b7683`

**3. [Test adjustment] `config：金鑰不在 git` needs the files tracked**
- It reads `git ls-files`, so it passes only once the Task 1 files are staged or committed; verified after staging, then committed. No behaviour difference.

**4. [Plan amendment, orchestrator] fsevents added to the install-script allowlist** - see Supply-chain gate.

**Total deviations:** 1 Rule 3 fix, 2 test adjustments, 1 orchestrator amendment. **Impact:** none on scope or contracts.

## Authentication Gates

None. No `wrangler login`, non-dry-run deploy, `secret` or `kv` command was run; nothing pushed.

## Known Stubs

None. The two KV ids are deliberate fill-in values, guarded by `check-ids.mjs`; Andy replaces them following `worker/DEPLOY.md` (plan 02-06). The `AI_STATE_KV` binding is declared but unused until plan 02-05.

## Threat Flags

None beyond the plan register. T-02-06, T-02-07, T-02-08 (`keep_vars` before the first table, asserted) and T-02-SC are mitigated as planned; T-02-09 (key in URL) and T-02-10 (`e.message` in 500 bodies) are ported unchanged and accepted.

## Issues Encountered

- First execution attempt halted at the install-script gate (see above); resolved by orchestrator amendment, then re-executed cleanly. The temporary STATE.md blocker entry added during the halt was removed.

## Next Phase Readiness

Ready for 02-03. `worker/src/index.js` now has the admin/feedback routes ahead of `/ai` and `/models`; the legacy `POST /` shim and error-shape work can be added after them without touching these. For plan 02-06, quote the `REPLACE_WITH_…_KV_ID` fill-ins and tell Andy to answer No to any wrangler diff line that removes `USER_FEEDBACK_KV` or a secret.

## Self-Check: PASSED

- Files exist: worker/wrangler.toml, worker/check-ids.mjs, worker/.gitignore, tests/worker-config.spec.mjs, tests/worker-admin.spec.mjs, worker/src/index.js.
- Commits on gsd/v0.96-stabilize: b3b7683, 7021bea, 49efe1f (`git rev-list --count 874974940f34..HEAD` = 3); nothing pushed.
- Acceptance greps for both tasks pass; `npm run worker:check` exit 0; `npm test` 131 passed; `admin/woker.js` hash unchanged.
