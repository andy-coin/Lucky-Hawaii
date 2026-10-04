---
phase: 02-ai-service-hotfix-ai
plan: 05
subsystem: ai-worker-health-check
tags: [cloudflare-worker, cron, kv, model-registry, health-check, playwright]

requires:
  - phase: 02-ai-service-hotfix-ai
    provides: "02-02 AI_STATE_KV binding and cron 17 19 * * *; 02-03 callModel/runChain; 02-04 parseAiBody allowlist, origin rule"
provides:
  - "worker/src/models.js STALE_DAYS (183), MIN_ACTIVE (2), computeActive(results, nowMs, models)"
  - "worker/src/health.js runHealthCheck, readHealth (5-min isolate cache, 72 h max age), activeModels, _resetHealthCache, HEALTH_KEY"
  - "worker/src/index.js scheduled(), /models from the active list with checkedAt, GET /health.json, POST /health/run (admin key)"
  - "worker/src/ai.js runChain candidates from activeModels"
  - "tests/worker-health.spec.mjs: 30 tests (淘汰 12, 健康 8, 排程 1, 清單 9)"
affects: [02-06, phase-04-ai-word-picking]

actuals:
  tokens: 8612    # chars/4 over git diff 9aa4350..HEAD (34,449 chars, 7 files)
  tasks: 2
  commits: 2
plan_head_before: 9aa4350e64160aea758d8fdbbf3ba70852f4bf63
plan_head_after: 49997c30be204d28552e5cba7dcacb88368d2cb0

tech-stack:
  added: []
  patterns:
    - "Pure keep/drop function (computeActive) with the model list as a third argument so synthetic families test every boundary without touching the real registry"
    - "health.js and ai.js import each other (callModel/classify one way, activeModels the other); safe because both are only used at call time, wrangler dry-run bundles it"
    - "Tests seed the health doc by really running worker.scheduled with a faked fetch, then _resetHealthCache() so requests read it back from KV"

key-files:
  created:
    - worker/src/health.js
    - tests/worker-health.spec.mjs
  modified:
    - worker/src/models.js
    - worker/src/ai.js
    - worker/src/index.js
    - tests/worker-helpers.mjs

key-decisions:
  - "Admin routes /health.json and /health/run live in the router (not handleFeedbackAdmin) with a non-empty key check; replies use the normal json() CORS helper"
  - "Probe records status/ms/reason/stage/retirementTime only; upstream text is never stored (tests assert it)"
  - "Cache time for a fresh run is the run's own now, so /models follows POST /health/run immediately"

patterns-established:
  - "A model with no fresh health document is never treated as dead: activeModels falls back to the full registry (also when the filter is empty or KV is unbound)"

requirements-completed: [AI-05]

coverage:
  - id: D1
    description: "computeActive: drops failed probes; drops a stale model (over 183 days strictly, UTC epoch ms, or modelStage LEGACY/DEPRECATED/RETIRED) only when a healthy, fresh, newer same-family model exists; keeps at least 2; never empty; registry order"
    requirement: AI-05
    verification:
      - kind: unit
        ref: "tests/worker-health.spec.mjs#淘汰 (12 tests: today, dead, stale+fresher, stale alone, adjacency, 183 days vs +1 ms, min 2, empty, one healthy, ordering, stage)"
        status: pass
    human_judgment: false
  - id: D2
    description: "runHealthCheck probes all six models, writes exactly one 'health' doc { v:1, checkedAt, results, active }, survives a failing put, is idempotent; readHealth ignores unparsable, no-active, over-72-h docs and reads KV at most once per 5 minutes"
    requirement: AI-05
    verification:
      - kind: unit
        ref: "tests/worker-health.spec.mjs#健康 (8 tests) and 排程 (1 test)"
        status: pass
    human_judgment: false
  - id: D3
    description: "GET /models lists only active models plus checkedAt; chain and preferred-model handling skip inactive models; no health doc means full registry and checkedAt null"
    requirement: AI-05
    verification:
      - kind: unit
        ref: "tests/worker-health.spec.mjs#清單 (menu, chain, preferred inactive, no health, Groq-only active with a long prompt)"
        status: pass
      - kind: unit
        ref: "tests/ai-client.spec.mjs#選單 (site menu still follows /models)"
        status: pass
    human_judgment: false
  - id: D4
    description: "GET /health.json and POST /health/run need the exact non-empty USER_REPORT_KEY (403 'Forbidden' otherwise, no upstream calls); /health/run probes six models and returns the new doc; GET /health/run is 405; /health.json is 404 before any run"
    requirement: AI-05
    verification:
      - kind: unit
        ref: "tests/worker-health.spec.mjs#清單：後台 (4 tests)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Overlapping cron run and POST /health/run both write the 'health' key: last write wins, each stored document internally consistent"
    requirement: AI-05
    verification: []
    human_judgment: true
    rationale: "Declared backstop in the plan. Each run builds and writes one complete JSON string, so a document cannot be half-mixed; confirming real KV last-write-wins needs a deployed Worker (02-06 Human check)"
  - id: D6
    description: "Real-runtime cron trigger and the live probe answers (thinkingLevel casing, Groq 404 vs 400 for retired ids, whether modelStatus is populated)"
    requirement: AI-05
    verification: []
    human_judgment: true
    rationale: "Needs real provider keys and a deployed or wrangler-dev Worker; covered by npm run worker:smoke and the post-deploy POST /health/run click in plan 02-06"

duration: 30min
completed: 2026-10-04
status: complete
---

# Phase 2 Plan 05: Nightly model health check Summary

**Every night the Worker probes all six registry models, stores one health document in AI_STATE_KV, and both the AI chain and the site menu follow its active list: failed or superseded models drop out, never fewer than two, never none, and Andy can read or re-run the check with his admin key.**

## Performance

- **Duration:** about 30 min (2026-10-04)
- **Tasks:** 2 (both TDD: tests first, RED confirmed, then implementation)
- **Files:** 2 created, 4 modified; no package files touched
- **Tests:** `npm test` 218 passed on the Task 2 run (188 from 02-04 + 30 new). `error-visibility.spec.mjs:123` did not fire. After a final small refactor (single `'/health.json'` literal) the four Worker specs (health, ai, admin, config) re-ran: 100 passed. `npm run worker:check` exit 0, 0 warning lines.

## The keep/drop rule as implemented (`computeActive`)

1. Healthy means `results[id].ok === true`. If nothing is healthy, return the whole registry in registry order.
2. Stale means released more than 183 days before `nowMs` (strictly greater; `Date.parse` of the ISO date, UTC epoch ms) or Gemini reported `modelStage` LEGACY, DEPRECATED or RETIRED. Unknown release date (`released: null`) is never stale by date.
3. A stale model is dropped only if another healthy, non-stale model of the same family exists that is newer (or either date is unknown).
4. Refill to 2 when fewer remain: healthy models first (registry order), then, if fewer than 2 are healthy, models that are not marked dead (status 404), and only last the 404 ones.
5. Output is always in registry order. The list can only shrink to a subset of the hand-dated registry; the cron never adds models.

Boundary pinned by test: a model exactly 183 x 86,400,000 ms old is fresh, +1 ms makes it stale.

## Today's evaluation (2026-10-03 registry, all probes healthy)

All six stay active, in registry order:
- `gemini-3.5-flash-lite` (2026-07-21), `gemini-3.8-flash` (2026-09-02), `gemini-3.7-flash` (2026-08-13): fresh.
- `openai/gpt-oss-120b` and `openai/gpt-oss-20b` (2025-08-05, date ASSUMED): older than 183 days, but family `gpt-oss` has no fresher sibling, so they stay.
- `qwen/qwen3.8-27b`: release date unknown, never counted as old.

## Note for Andy (gpt-oss)

AI-05 literally says to keep only models released within about half a year. CONTEXT locked a softer rule: an old model is removed only when a newer, healthy model of the same family is available. Today both gpt-oss models are over 183 days old but have no newer sibling, so they stay. This is the locked rule, implemented as decided. To make them go away sooner, add a newer `gpt-oss` entry (with its official date) to `worker/src/models.js` and redeploy.

## Task Commits

1. **Task 1: nightly check and keep/drop rule** - `0ce898c` (feat) - `worker/src/models.js`, `worker/src/health.js`, `worker/src/index.js`, `tests/worker-helpers.mjs`, `tests/worker-health.spec.mjs`
2. **Task 2: chain, menu and admin routes follow the active list** - `49997c3` (feat) - `worker/src/ai.js`, `worker/src/index.js`, `worker/src/health.js`, `tests/worker-health.spec.mjs`

Commit count measured from `git rev-list --count 9aa4350..HEAD` = 2. The ledger file was not written (orchestrator said to skip it and record `plan_head_before: 9aa4350` instead). Docs commit skipped: `.planning/` is gitignored (SUMMARY not force-added). Nothing pushed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `runChain` crashed when the active list had no model that fits the prompt**
- **Found during:** Task 2 (reading candidate building before switching it to the active list)
- **Issue:** `fits.reduce(...)` on an empty array throws. That could not happen while Gemini was always in the list, but an active list holding only Groq models plus a prompt over 4,500 characters would empty it.
- **Fix:** if `fits` is empty, rebuild it from the full registry (Gemini has no prompt limit). Test: `清單：只剩 Groq 啟用、提示又很長時…`.
- **Files modified:** worker/src/ai.js
- **Committed in:** `49997c3`
- **Approved by orchestrator.**

**2. [Rule 2 - Missing critical] Health probe retries without `thinkingConfig` on a thinking-related 400**
- **Found during:** Task 1 (probe design; RESEARCH assumption A3, `thinkingLevel` casing unproven against the live API)
- **Issue:** without the same guard the chain has, a wrong `thinkingLevel` would mark `gemini-3.8-flash` and `gemini-3.7-flash` dead on the first night and drop the two best models from the menu.
- **Fix:** `probe` repeats the call once with `noThinking: true` when Gemini returns 400 with "thinking" in the error text. Happy path is still exactly 6 upstream calls. Test: `健康：thinkingLevel 被 400 退回時…` (8 calls).
- **Files modified:** worker/src/health.js
- **Committed in:** `0ce898c`
- **Approved by orchestrator.**

**3. [Interpretation, orchestrator-directed] "At least 2" when fewer than 2 are healthy**
- The plan's action text refills only from healthy models, which leaves 1 entry when exactly one model is healthy, contradicting the truth "at least 2, never empty". Per orchestrator decision the refill continues in registry order, preferring models not marked dead (HTTP 404) over dead ones. Probe failures such as timeouts or 429s are far more often transient than a real removal, and the chain's own cooldowns still skip a model that really is gone. Test: `淘汰：只有一個健康時湊到兩個…`. Zero healthy still returns the full registry.

**4. [Test-support] Shared helpers**
- `FakeKV` already had `gets`/`puts`; only `makeCtx` was needed. `groqOk` and `byProvider` were added to `tests/worker-helpers.mjs` (worker-ai.spec keeps its own local copies, untouched).

**Total deviations:** 2 auto-fixes (approved), 1 orchestrator-directed interpretation, 1 test-support. **Impact:** none on scope or contracts.

## Authentication Gates

None. No `wrangler login`, deploy, `secret` or `kv` command was run; nothing pushed; `admin/woker.js`, `package.json`, `package-lock.json` and `wrangler.toml` untouched.

Process note: the first pre-write guard call (the orchestrator's `rootpin.sh`) was denied by the permission classifier. I stopped and reported; the orchestrator replaced it with an inline `git rev-parse --show-toplevel` plus `git branch --show-current` check, which I ran before the first write and before each commit (all passed). No guard was skipped.

## Known Stubs

None.

## Threat Flags

None beyond the plan register. T-02-21 (admin key required, empty key rejected, POST only, no upstream calls without key), T-02-22 (doc holds status, timing, reason, stage only; test asserts upstream text and the probe reply are absent), T-02-23 (one put per run in try/catch, reads cached 5 min, `gets` asserted), T-02-24 (unparsable, no `active`, over 72 h, or empty filter all fall back to the full registry) and T-02-SC (no installs) are mitigated as planned. Prohibition AI-05 (never zero models, never self-added models) holds by construction and by the 淘汰 empty and ordering tests.

## Issues Encountered

- A failed read of the health document (unparsable JSON, missing KV binding) logs one `console.error` line (`[好韻器] 讀取健康檢查紀錄失敗，改用完整模型名單`) and the result is cached as null for 5 minutes. This shows as harmless noise in two test runs.
- `/health/run` costs 6 free-tier provider calls each time it is clicked; the key gate is the only throttle (no per-key rate limit).

## Next Phase Readiness

Ready for 02-06 (DEPLOY.md, `worker:smoke`, Human check). The post-deploy checklist should include: create the `AI_STATE_KV` namespace and put its id into `wrangler.toml`; click `POST /health/run?key=...` once and read `GET /health.json?key=...` to see real probe answers (confirms thinkingLevel casing A3, Groq retired-model status A4, whether `modelStatus` is populated A11, and KV last-write-wins D5); repeat the gpt-oss note above; confirm `/models` returns the pruned list and `checkedAt` after the first nightly run.

## Self-Check: PASSED

- Files exist: worker/src/models.js, worker/src/health.js, worker/src/ai.js, worker/src/index.js, tests/worker-helpers.mjs, tests/worker-health.spec.mjs, 02-05-SUMMARY.md.
- Commits on gsd/v0.96-stabilize: 0ce898c, 49997c3 (`git rev-list --count 9aa4350..HEAD` = 2); nothing pushed; no deletions (`git diff --diff-filter=D` empty for both).
- Acceptance re-run: `--list` count 21 (>= 15) before Task 2 and 30 after; `-g 淘汰` 12 passed, `-g 健康` 14 passed (the pattern also matches other test names that contain the word 健康); `node -e` computeActive check exits 0; `grep -c "waitUntil(runHealthCheck"` 1; `activeModels(` 1 in ai.js and 1 in index.js; `'/health.json'` 1 and `'/health/run'` 1; `-g 清單` list count 9 (>= 5); `ai-client.spec.mjs -g 選單` 3 passed; `npm test` 218 passed; `npm run worker:check` exit 0, 0 warnings; no stray `serve.mjs` or wrangler process.
