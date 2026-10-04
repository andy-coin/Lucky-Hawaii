---
phase: 02-ai-service-hotfix-ai
verified: 2026-10-04T00:00:00Z
status: human_needed
score: 5/5 roadmap success criteria verified (automatable parts); 0 gaps
covered_files:
  - ".planning/phases/02-ai-service-hotfix-ai/02-01-PLAN.md"
  - ".planning/phases/02-ai-service-hotfix-ai/02-01-SUMMARY.md"
  - ".planning/phases/02-ai-service-hotfix-ai/02-02-PLAN.md"
  - ".planning/phases/02-ai-service-hotfix-ai/02-02-SUMMARY.md"
  - ".planning/phases/02-ai-service-hotfix-ai/02-03-PLAN.md"
  - ".planning/phases/02-ai-service-hotfix-ai/02-03-SUMMARY.md"
  - ".planning/phases/02-ai-service-hotfix-ai/02-04-PLAN.md"
  - ".planning/phases/02-ai-service-hotfix-ai/02-04-SUMMARY.md"
  - ".planning/phases/02-ai-service-hotfix-ai/02-05-PLAN.md"
  - ".planning/phases/02-ai-service-hotfix-ai/02-05-SUMMARY.md"
  - ".planning/phases/02-ai-service-hotfix-ai/02-06-PLAN.md"
  - ".planning/phases/02-ai-service-hotfix-ai/02-06-SUMMARY.md"
  - "index.html"
  - "package-lock.json"
  - "package.json"
  - "tests/ai-client.spec.mjs"
  - "tests/helpers.mjs"
  - "tests/smoke.spec.mjs"
  - "tests/worker-admin.spec.mjs"
  - "tests/worker-ai.spec.mjs"
  - "tests/worker-config.spec.mjs"
  - "tests/worker-health.spec.mjs"
  - "tests/worker-helpers.mjs"
  - "worker/.gitignore"
  - "worker/DEPLOY.md"
  - "worker/check-ids.mjs"
  - "worker/package.json"
  - "worker/src/ai.js"
  - "worker/src/health.js"
  - "worker/src/index.js"
  - "worker/src/models.js"
  - "worker/test/dev-smoke.mjs"
  - "worker/wrangler.toml"
covered_digest: "v2:sha256:7c37a1d4f01bf6ac8a639bcc45d925a6de2160746ed3adf00380a27f95f84566"
behavior_unverified: 0
overrides_applied: 0
advisory:
  - finding: "index.html still defines dead saveApiKey() (line ~4469) although 02-REVIEW IN-02 resolution says it no longer exists"
    category: other
    reason: "Unused function writing apiKey_* to localStorage; no caller found by grep. Cosmetic, does not affect goal."
    evidence_status: "grep shows definition only, no callers"
human_verification:
  - test: "Run `npx wrangler login`, fill the two real KV ids into worker/wrangler.toml (DEPLOY.md steps 3-4), set the three secrets, then `npm run worker:deploy`; read the deploy diff before confirming"
    expected: "Deployed lucky-hawaii at https://lucky-hawaii.is3000dollar.workers.dev; the diff shows no removal/rebind of USER_FEEDBACK_KV or the three secrets; admin page still lists old reports"
    why_human: "Needs Andy's Cloudflare account. wrangler.toml deliberately still carries REPLACE_WITH_* placeholders and `node worker/check-ids.mjs` exits 1 until Andy fills them."
  - test: "After production deploy: POST https://lucky-hawaii.is3000dollar.workers.dev/health/run?key=<admin key>, then click AI 建議 once on the live site (after the site branch is merged)"
    expected: "Six models ok:true (or dead ones auto-excluded); live AI suggestion returns word cards; dropdown shows 自動（推薦） plus the Worker's model list"
    why_human: "Real provider keys, real Gemini/Groq behavior (e.g. whether thinkingLevel LOW is accepted by 3.7/3.8 Flash), live origin."
  - test: "Confirm Cloudflare free plan accepts the [[ratelimits]] block at deploy time, and observe the per-location eventually-consistent limit (backstop truth AI-07 concurrency: a burst from one IP may slightly exceed 20/60s before 429s start)"
    expected: "Deploy accepts the block (or Andy removes it per DEPLOY.md step 7 and AI still works); a burst eventually yields 429 RATE_LIMITED"
    why_human: "Real Cloudflare rate-limit binding semantics cannot be exercised locally; tests only use a fake limiter. Backstop truth, insufficient_spec."
  - test: "After the first 03:17 Taiwan-time cron, GET /health.json?key=<admin key>"
    expected: "checkedAt shows a fresh date, active lists the healthy models"
    why_human: "Real cron schedule only fires in production (local trigger via /cdn-cgi/local/scheduled was verified)."
  - test: "Judgment call WR-04: confirm the 'keep a model active if it failed transiently once' trade-off in health.js"
    expected: "Andy accepts that a transient probe failure keeps yesterday's active state and only two consecutive days of transient failure remove a model"
    why_human: "REVIEW flagged this as a judgment choice."
---

# Phase 02: AI 服務救援 Verification Report

**Phase Goal:** 搶在 Gemini 2.5 下架之前，讓 AI 建議不再因模型下架或額度用完而默默失敗：由 Worker 負責模型 fallback、每日自我健康檢查、擋濫用，並改用 wrangler 指令部署。
**Verified:** 2026-10-04
**Status:** human_needed
**Re-verification:** No, initial verification

## Commands Run (by verifier, not trusted from SUMMARY)

| Command | Result |
|---|---|
| `npm test` | 231 passed (1.1m), 0 failed |
| `npm run worker:check` | exit 0, no WARNING; bindings listed: USER_FEEDBACK_KV, AI_STATE_KV, AI_LIMITER (20 requests/60s) |
| `npm run worker:smoke` (run while `npm test` was in flight) | 12 checkmarks, "全部通過" |
| `node worker/check-ids.mjs` | exit 1 (placeholders still in file, deploy guard works) |
| `git status --porcelain` after dry-run | only pre-existing untracked `.claude/CLAUDE.md`, `.gsd/`; no tracked change |
| Own throwaway Playwright probe (deleted afterwards) | dropdown change while `/models` in flight is not overwritten by the late response: passed |
| Own throwaway Node probe (deleted afterwards) | two overlapping `runHealthCheck` plus `POST /health/run`: stored doc has 6 results, 6 active, internally consistent |

## ROADMAP Success Criteria

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Stale localStorage `selectedModel` (gpt-4.1) auto-uses an available model; AI suggestion works | VERIFIED | `tests/ai-client.spec.mjs` "舊模型" sends the fixture profile through the real `worker/src/index.js` (bridgeWorker) to a faked Gemini; AI-badged cards appear. `index.html` `renderModelSelect` shows `auto` for unknown stored ids without writing; `callLLM` posts `{prompt, model, temperature}` to `WORKER_URL + '/ai'` (lines ~4490-4545). No `gpt-4.1`/GitHub Models left in `index.html`. |
| 2 | Timeout/429/5xx switch models; dead models skipped; all-fail gives plain-language reason | VERIFIED | `worker/src/ai.js` `classify()`/`runChain()`: per-attempt `AbortSignal.timeout` clamped to remaining budget, 429/408/5xx cool and move on, 404 dead 1 h, 401-403 provider cooldown, MAX_ATTEMPTS 4, ALL_BUSY/EMPTY/BAD_REQUEST messages in Traditional Chinese with no upstream text. 61 tests in `worker-ai.spec.mjs` (incl. mock providers, cooldown reuse across requests, concurrent hang) pass. Client shows `aiError` plain messages in all three paths; 5 "白話" browser tests pass. |
| 3 | `wrangler deploy` one-liner, config in git, keys not in git, KV data/bindings intact | VERIFIED (automatable part); production deploy is Human check | `worker/wrangler.toml` tracked, name `lucky-hawaii`, `keep_vars = true` above first table, cron, `[secrets] required`, `USER_FEEDBACK_KV` (same binding name the old `admin/woker.js` uses) + `AI_STATE_KV` + `AI_LIMITER`. `npm run worker:deploy` = `node worker/check-ids.mjs && wrangler deploy ...`; check-ids rejects placeholder, malformed and duplicate ids. `worker/.gitignore` and root `.gitignore` ignore `.dev.vars*` and `.wrangler/`; no `.dev.vars` tracked; key-shape grep (AIza…/gsk_…) over tracked files finds nothing. Dry-run and smoke pass offline. |
| 4 | Daily cron health check prunes dead/~6-month-old models; site menu follows | VERIFIED | `worker/src/models.js` `computeActive` (strict >183 d UTC ms, only evicted when fresher healthy same-family sibling, min 2, never empty, registry order). `worker/src/health.js` `runHealthCheck` probes all models in parallel and writes one KV doc; `scheduled()` calls it via `ctx.waitUntil`; cron `17 19 * * *` UTC = 03:17 Taiwan. `/models` is built from `activeModels()`; `loadModels()` rebuilds the dropdown from it. Smoke script triggers the real local cron via `/cdn-cgi/local/scheduled`, sees 6 active, then a model turned dead disappears from `/models`. 32 `worker-health.spec.mjs` tests pass. |
| 5 | Non-allowlisted model / oversized request rejected; output tokens capped | VERIFIED | `parseAiBody` rejects unknown model with 400 MODEL_NOT_ALLOWED before any upstream call; `readBodyCapped` counts streamed UTF-8 bytes against 65 536 (feedback 8 192); prompt ≤24 000 chars, ≤8 legacy messages; `clampMaxTokens` ≤2048 then per-model `maxOut` (Groq 1024); temperature clamped 0..1; `originAllowed` exact-match origin with dev-only `ALLOW_LOCAL_ORIGIN=1`; `AI_LIMITER` keyed on IPv6 /64 or IPv4; `logFailure` redacts keys and upstream text never reaches responses. Boundary and precision tests pass (65 536/65 537, 24 000/24 001, 21 846 Chinese chars → 413). |

## Plan must-haves (merged, non-roadmap)

All plain-string truths in plans 02-01..02-06 are covered by the 231 passing tests or by direct code reading above (header-only API key, no `thinkingBudget`, legacy `POST /` shape per `_provider`, `/health.json` and `/health/run` key guard incl. empty key, KV read cache 5 min / 72 h max age, modelStage LEGACY/DEPRECATED/RETIRED treated as stale, failed KV put logged not thrown, smoke uses own port and temp persistence).

### Backstop-tagged truths (honest-verifier)

| Truth | Disposition | Evidence |
|---|---|---|
| AI-01 concurrency: dropdown change while `/models` in flight is never overwritten | VERIFIED (directly observed) | Verifier's own held-out Playwright probe (gated `/models` response, user change, release): `selectedModel` stayed the user's value, menu re-rendered to 3 options. No such test is committed in the repo. |
| AI-05 concurrency: overlapping cron and `/health/run`, last write wins, each doc consistent | VERIFIED (directly observed) | Verifier's own Node probe: 3 overlapping runs, 3 puts, stored doc internally consistent. Single `put` of one whole JSON doc by design. |
| FND-05 concurrency: smoke can run during `npm test` | VERIFIED (directly observed) | Verifier ran `worker:smoke` while `npm test` was running; both passed. |
| AI-07 concurrency: AI_LIMITER per-location eventually consistent, burst may slightly exceed 20/60 s | insufficient_spec, flagged | Only a faked limiter is exercised locally; real Cloudflare semantics need production. Routed to human verification (not a gap). |

### Prohibitions

| Prohibition | Tier | Disposition |
|---|---|---|
| No automated production deploy/login/secret put/kv create/git push (FND-05) | test | Held: `wrangler.toml` still contains `REPLACE_WITH_*` ids and `check-ids` exits 1, so `npm run worker:deploy` cannot have succeeded; no `.dev.vars`; no `worker/.wrangler` tracked. Enforcement is by process, not by a negative test, so flagged for Andy's confirmation (below). |
| wrangler.toml must not unbind/recreate the feedback KV | test | Held: binding name matches old Worker, id guard + duplicate guard; `config` tests cover placeholder/two real ids/one filled. |
| No raw upstream/English/Simplified text shown to user (AI-02) | test | Held: `白話：語言` test plus `aiError`/`AI_FALLBACK_MSG` path. |
| No model outside the dated registry (AI-07) | test | Held: `findModel` exact match; no runtime model discovery in code. |
| Health maintenance never empties list nor discovers new models (AI-05) | test | Held: `computeActive` never empty, subset of `MODELS`; `activeModels` falls back to full registry. |
| No writes to `selectedModel` at boot (AI-01) | test | Held: `renderModelSelect`/`loadModels` only read via `lhGet`; "選單：使用者改選才寫入" and Phase 1 storage specs pass. |

## Required Artifacts (Levels 1-4)

| Artifact | Status | Details |
|---|---|---|
| `worker/src/index.js` | VERIFIED | Router, feedback/admin port, `scheduled`, `/models`, `/health*`, top-level try/catch; wired from `wrangler.toml main`. |
| `worker/src/ai.js` | VERIFIED | Real chain, adapters, parsers; wired from index.js. Data flows to real fetch to providers. |
| `worker/src/health.js` | VERIFIED | Probe + KV doc; wired into `scheduled`, `/models`, `runChain`. Circular import with ai.js is benign (REVIEW IN-01, function-hoisted). |
| `worker/src/models.js` | VERIFIED | 6-model dated registry, `computeActive`. |
| `worker/wrangler.toml`, `check-ids.mjs`, `worker/.gitignore`, `package.json` scripts | VERIFIED | See SC3. wrangler pinned at 4.147.0. |
| `worker/test/dev-smoke.mjs`, `worker/DEPLOY.md` | VERIFIED | Smoke passes; checklist covers login, KV ids, secrets, diff review, deploy, `/health/run`, site push order, live click. |
| `index.html` (AUTO_MODEL, loadModels, aiTryList, callLLM, aiError, `__hoyunModelsReady`) | VERIFIED | Wired at boot (`window.__hoyunModelsReady = loadModels()`); dropdown built from live `/models`. |
| tests/* | VERIFIED | 231 passing, not stubs. |

## Key Links

All plan key_links wired: `callLLM` to `POST /ai`, `loadModels` to `GET /models`, `/ai` to `parseAiBody` then `runChain`, legacy `/` to `toLegacy`, `scheduled` to `runHealthCheck`, `runChain` and `/models` to `activeModels`, `worker:deploy` to `check-ids.mjs`.

## Requirements Coverage

| Requirement | Plan(s) | Status | Evidence |
|---|---|---|---|
| FND-05 | 02-02, 02-06 | SATISFIED in repo; production deploy awaits Andy | wrangler config in git, secrets not in git, dry-run/smoke green, DEPLOY.md |
| AI-01 | 02-01 | SATISFIED | stale `selectedModel` shown/sent as `auto`, GitHub Models removed, tests green |
| AI-02 | 02-01, 02-03 | SATISFIED | Worker-side chain with timeout, 429/5xx retry, dead skip, plain-language failure |
| AI-05 | 02-01, 02-05 | SATISFIED | daily cron + `computeActive`; menu follows. Note: prune rule is "stale only if fresher same-family healthy sibling", so today both gpt-oss models (released 2025-08-05, ASSUMED date) stay; documented in DEPLOY.md appendix and consistent with the never-empty prohibition. Requirement wording "只保留近半年內發布" is therefore met conditionally, by design decision D-13. |
| AI-07 | 02-04 | SATISFIED | allowlist, size caps, token clamp, origin gate, per-IP limiter |

REQUIREMENTS.md maps no other Phase 2 IDs; no orphaned requirements.

## Anti-Patterns

| File | Pattern | Severity | Impact |
|---|---|---|---|
| index.html ~4469 | dead `saveApiKey()` | Info | Unused; 02-REVIEW IN-02 resolution text ("已不存在") is inaccurate. Not goal-affecting. |
| worker/src/models.js | Groq `released` dates are ASSUMED / null | Info | Documented; affects only eviction timing. |
| all phase files | TBD/FIXME/XXX scan | none found | |

## Deferred Items

None needed.

## Gaps Summary

No automatable gap. Every roadmap success criterion is verified by tests I ran myself plus code reading. The phase is `human_needed` solely because production steps need Andy's Cloudflare account (`wrangler login`, real KV ids in `wrangler.toml`, secrets, deploy, one live AI click) and because the AI_LIMITER eventual-consistency backstop truth cannot be exercised outside Cloudflare. Note the deploy ordering warning: until Andy deploys the Worker and merges the site branch, the live site still shows the old broken behavior.

---

_Verified: 2026-10-04_
_Verifier: Claude (gsd-verifier)_
