---
phase: 02-ai-service-hotfix-ai
plan: 03
subsystem: ai-worker-chain-and-client-errors
tags: [cloudflare-worker, fallback-chain, gemini, groq, legacy-shim, playwright, zh-TW-errors]

requires:
  - phase: 02-ai-service-hotfix-ai
    provides: "02-01 runChain/geminiRequest/MODELS/findModel and bridgeWorker test helpers; 02-02 ported admin routes in worker/src/index.js"
provides:
  - "worker/src/ai.js full chain: classify, callModel, Gemini + Groq adapters, per-isolate cooldown/dead/provider maps, 4-attempt / 28 s budget, ALL_BUSY / EMPTY / BAD_REQUEST, toLegacy, _resetState"
  - "worker/src/index.js legacy POST / route (old cached pages keep working, reply shaped per _provider)"
  - "index.html aiError / AI_FALLBACK_MSG and plain-language failure display in generateAIWords, generateAISuggestions, generateContextFromLyrics"
  - "tests/worker-ai.spec.mjs (29 tests) and 5 new 白話 tests in tests/ai-client.spec.mjs"
affects: [02-04, 02-05, 02-06, phase-04-ai-word-picking]

actuals:
  tokens: 12815   # chars/4 over git diff 49efe1f..HEAD (51,260 chars, 5 files)
  tasks: 3
  commits: 3
plan_head_before: 49efe1f5b6cb2bf2f473a4c53ed14f65806affe4
plan_head_after: ce547bf040e6d353d0cdf4888e1d2d073979d8e2

tech-stack:
  added: []
  patterns:
    - "Chain state (cooldown, dead, providerCooldown) lives in module-level Maps per isolate; tests reset with _resetState() in beforeEach"
    - "Candidate list is built once up front; mid-chain availability is re-checked so a 401 cools the whole provider inside the same request; the 'all cooled' fallback is flagged forced and skips that re-check"
    - "Client errors: aiError(message) sets e.plain = true; callers show e.plain ? e.message : AI_FALLBACK_MSG, always via textContent"

key-files:
  created:
    - tests/worker-ai.spec.mjs
  modified:
    - worker/src/ai.js
    - worker/src/index.js
    - index.html
    - tests/ai-client.spec.mjs

key-decisions:
  - "Thinking-400 retry counts as its own attempt toward MAX_ATTEMPTS and writes its own tried entry (plan wording was ambiguous; each upstream call is one attempt)"
  - "Legacy route rejects a body whose messages is not a non-empty array with 400 {error:{message}} so the chain cannot throw; full validation and caps stay in plan 02-04"
  - "temperatureOf() extracted in index.js so /ai and the legacy route share the same default and clamp"
  - "An internal throw new Error('empty') in generateAISuggestions (AI answered, nothing matched the candidates) shows the fixed fallback sentence, as the plan specifies"

patterns-established:
  - "Worker chain tests drive worker.fetch directly with installFetch call logs; asserting which model URL was hit is how cooldowns are proven"

requirements-completed: [AI-02]

coverage:
  - id: D1
    description: "When the first model hangs, is rate-limited (429/408/5xx) or retired (404), the Worker answers with the next model; cooled or dead models are skipped on the next request in the same isolate"
    requirement: AI-02
    verification:
      - kind: unit
        ref: "tests/worker-ai.spec.mjs#逾時 / 429 (2 tests) / 分類 (6 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "400 and other 4xx stop the chain with BAD_REQUEST after exactly one upstream call; 413 moves on without cooldown; 401/402/403 cool the whole provider"
    requirement: AI-02
    verification:
      - kind: unit
        ref: "tests/worker-ai.spec.mjs#分類：400、430、499、405 / 分類：413 / 分類：Gemini 回 401"
        status: pass
    human_judgment: false
  - id: D3
    description: "All-fail answers 503 ALL_BUSY (or EMPTY) with a plain Traditional Chinese message, at most 4 attempts, a 28 s budget, a never-empty candidate list, and no upstream text or keys in the body"
    requirement: AI-02
    verification:
      - kind: unit
        ref: "tests/worker-ai.spec.mjs#全部失敗 (3 tests) / 預算"
        status: pass
    human_judgment: false
  - id: D4
    description: "Gemini and Groq requests are built as decided: header key, thinkingLevel LOW only for 3.8/3.7, never thinkingBudget, output caps, reasoning_effort low for gpt-oss, no max_tokens; ordering, preferred model, Groq pre-skip for long prompts, and two concurrent requests"
    requirement: AI-02
    verification:
      - kind: unit
        ref: "tests/worker-ai.spec.mjs#請求內容 (4 tests) / 順序 (3 tests) / 並行"
        status: pass
    human_judgment: false
  - id: D5
    description: "Old cached pages posting the legacy body to the Worker root get candidates (gemini) or choices+usage (others); retired model ids are served as auto; failures come back as {error:{message}}; wrong Origin is 403"
    requirement: AI-02
    verification:
      - kind: unit
        ref: "tests/worker-ai.spec.mjs -g 舊版 (8 tests)"
        status: pass
    human_judgment: false
  - id: D6
    description: "When AI fails the page shows the Worker's plain Traditional Chinese reason (or a fixed fallback), the 產生 button is enabled and the loading line hidden, in the supplementary-word path, the main suggestion path and the context generator; network failure and page-side timeout use fixed sentences"
    requirement: AI-02
    verification:
      - kind: e2e
        ref: "tests/ai-client.spec.mjs -g 白話 (5 tests)"
        status: pass
    human_judgment: false
  - id: D7
    description: "Real behaviour against live Gemini/Groq (actual status codes, Retry-After values, thinkingLevel acceptance) and the 12 s per-attempt timeout under real latency"
    requirement: AI-02
    verification: []
    human_judgment: true
    rationale: "Needs Andy's Cloudflare login and real keys; the chain is proven against faked upstreams only. Covered by the post-deploy Human check in plan 02-06"

duration: 6min
completed: 2026-10-03
status: complete
---

# Phase 2 Plan 03: Fallback chain, legacy shim and plain-language failures Summary

**The Worker now walks Gemini 3.5 Flash-Lite, 3.8 Flash, 3.7 Flash and the Groq models with a 12 s per-attempt timeout, a 4-attempt / 28 s budget and per-isolate cooldowns, answers old cached pages through the legacy root endpoint in the shape their `_provider` expects, and the page shows the Worker's plain Traditional Chinese failure reason with the button and loading line always restored.**

## Performance

- **Duration:** 6 min (2026-10-03T15:57:07Z to 16:03Z)
- **Tasks:** 3 (Tasks 1 and 3 TDD style: failing tests first, then implementation; commit per task as the plan specifies)
- **Files:** 5 touched (1 created, 4 modified)
- **Tests:** `npm test` 165 passed (131 baseline from 02-02 + 21 chain + 8 legacy in `tests/worker-ai.spec.mjs` + 5 白話). The known WR-05 intermittent did not fire. `npm run worker:check` exit 0, 0 WARNING lines.

## Classification table as implemented

| Upstream status | `classify()` | Chain action |
|-----------------|--------------|--------------|
| 2xx | `ok` | non-empty, unblocked text: success; empty or `promptFeedback.blockReason`: tried `empty`, 30 s cooldown, next |
| 429 | `transient` | next; cooldown = clamp(`retry-after` header, else Gemini `retryDelay`, else 60 s) to 10 s..15 min |
| 408, 5xx (>= 500) | `transient` | next; 30 s cooldown |
| thrown timeout / network | (not classified) | tried `timeout` / `network`; 30 s cooldown; next |
| 404 | `dead` | next; model marked dead for 1 h |
| 401, 402, 403 | `auth` | next; whole provider cooled 10 min (also skipped later inside the same request) |
| 413 | `big` | next; no cooldown |
| any other (400, 405, 430, 499, ...) | `fatal` | stop: 400 `BAD_REQUEST` after exactly one upstream call; sole exception below |

Exception: a Gemini `fatal` with `m.thinking` set and an error text matching `/thinking/i` retries the same model once without `thinkingConfig` (own attempt, own tried entry); a second failure stops with `BAD_REQUEST`.

## Constants chosen (top of `worker/src/ai.js`, all tunable)

| Constant | Value |
|----------|-------|
| `ATTEMPT_TIMEOUT_MS` | 12000 (env override `ATTEMPT_TIMEOUT_MS`) |
| `MAX_ATTEMPTS` | 4 |
| `CHAIN_BUDGET_MS` | 28000 (env override `CHAIN_BUDGET_MS`) |
| `TRANSIENT_COOLDOWN_MS` | 30000 |
| `DEAD_MS` | 3600000 |
| `PROVIDER_COOLDOWN_MS` | 600000 |
| `RETRY_MIN_MS` / `RETRY_MAX_MS` / `RETRY_DEFAULT_MS` | 10000 / 900000 / 60000 |

Candidate order: allowlisted preferred model first, then `MODELS` in registry order; Groq entries dropped when summed message content exceeds `maxPromptChars` (4500); entries in cooldown/dead/provider-cooldown dropped; if nothing is left, the single size-eligible model whose unavailable-until time is earliest is called.

## Input used for the main-path 白話 test

`安`. In-page check after clicking: `lastCandidatesTotal` = 1000 with the real wordlist (>= 24), so it goes through the "pick 24 from candidates" path. 心 and 光 also gave 1000 in the exploration run; 安 was first in the plan's list so it was kept. The test message is deliberately longer than 80 characters to prove the old truncation is gone.

## Test counts

- `tests/worker-ai.spec.mjs`: 29 tests (21 chain: 逾時 1, 429 2, 分類 6, 全部失敗 3, 預算 1, 請求內容 4, 順序 3, 並行 1; 8 legacy 舊版).
- `tests/ai-client.spec.mjs`: 14 tests (9 from 02-01 + 5 白話).
- Plan-level checks: `worker-ai.spec.mjs` + `ai-client.spec.mjs` + `npm test` all exit 0; `scan.spec.mjs` 9 passed; the 5 白話 tests were also run against the pre-change `index.html` and all 5 failed (RED evidence), then pass with the change.

## Task Commits

1. **Task 1: Worker chain** - `40f0834` (feat) - `worker/src/ai.js`, `tests/worker-ai.spec.mjs`. RED run: the spec could not even import (`_resetState` missing), then all 21 pass on the first GREEN run.
2. **Task 2: legacy root endpoint** - `50f6267` (feat) - `worker/src/ai.js`, `worker/src/index.js`, `tests/worker-ai.spec.mjs`
3. **Task 3: plain-language failures in the page** - `ce547bf` (feat) - `index.html`, `tests/ai-client.spec.mjs`

Commit count measured from the ledger: `git rev-list --count 49efe1f..HEAD` = 3. Docs commit skipped: `.planning/` is gitignored (SUMMARY not force-added, per orchestrator).

## Accomplishments

- Real fallback chain with timeout, classification, cooldowns, budget, both adapters and structured all-fail errors; `runChain` signature and payload contract from 02-01 unchanged.
- `classify` exported and unit-tested on the adjacency boundaries (429/408 retried but 430 not, 499 not but 500 yes, 404 dead but 405 stops).
- Legacy `POST /` for cached pages, retired model ids (`gpt-4.1`, `qwen/qwen3.6-27b`, `gemini-2.5-flash`) served as auto, `_provider` retired value `github` answered in the choices shape.
- Logging redacts `GEMINI_API_KEY`, `GROQ_API_KEY` and `USER_REPORT_KEY`, cuts to 200 chars, never logs headers or request bodies; no response body contains upstream text, URLs or keys (asserted with a sentinel string and the key value).
- Client: `aiError` / `AI_FALLBACK_MSG`; the empty `if (!e.quota)` statement, the English `all models failed` throw and the 80-character truncation are gone; failure text is set with `textContent` and `replaceChildren`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Legacy route guards a non-array `messages`**
- **Found during:** Task 2
- **Issue:** the plan defers message-array validation to 02-04, but without any guard a legacy body lacking `messages` makes `runChain` throw inside `reduce`, which surfaces as an uncaught 500 with no CORS header.
- **Fix:** `handleLegacy` returns 400 `{error:{message:'請求格式不正確'}}` when `messages` is not a non-empty array. Sizes and caps stay in 02-04. Test: `舊版：body 壞掉或 messages 不是陣列回 400`.
- **Files modified:** worker/src/index.js, tests/worker-ai.spec.mjs
- **Committed in:** `50f6267`

**2. [Test adjustment] 503 console line allowed in the 白話 browser tests**
- **Found during:** Task 3 first run
- **Issue:** the plan asserts a clean console for most browser tests, but Chromium logs one `Failed to load resource ... status of 503` per non-2xx `/ai` reply.
- **Fix:** an `unexpectedErrors()` helper filters exactly that line (same filter the existing 保留 test already uses); every other console error still fails the test. The network test filters exactly one `net::ERR_FAILED` as the plan says.
- **Committed in:** `ce547bf`

**3. [Interpretation] Thinking-retry attempt accounting** - see key-decisions: the retry consumes its own attempt slot and writes its own `tried` entry; `N` in the ALL_BUSY message counts distinct model ids.

**Total deviations:** 1 Rule 2 addition, 1 test adjustment, 1 interpretation. **Impact:** none on scope or contracts.

## Authentication Gates

None. No `wrangler login`, deploy, `secret` or `kv` command was run; nothing pushed; `admin/woker.js` hash unchanged (`58e8f8bf6debb7e01218393d6b17e67e8869f7bb`).

## Known Stubs

None. The `empty` Error in `generateAISuggestions` (AI answered but no word matched the candidates) is an existing internal path; it now shows the fixed fallback sentence rather than a blank or English text.

## Threat Flags

None beyond the plan register. T-02-11 (no upstream text in payloads, tests assert it), T-02-12 (4 attempts, 28 s budget, cooldowns, 400 never retried), T-02-13 (`textContent` / `replaceChildren` only), T-02-14 (`findModel` or auto, same origin rule as `/ai`) and T-02-SC (no package files touched) are mitigated as planned. Open by design: the legacy route has no size cap or per-IP limit until 02-04.

## Issues Encountered

None. All three tasks passed their acceptance criteria on the first full run.

## Next Phase Readiness

Ready for 02-04 (validation, caps, rate limit, and the dedicated `不洩漏` test): `handleAi` and `handleLegacy` both still take their message arrays unchecked apart from the type guard above, `maxTokens` is capped only by each model's `maxOut`, and `temperatureOf` is the shared clamp. For 02-05, `/models` still returns the static registry and `isAvailable()` only knows isolate memory; the KV health list plugs in at candidate building. For 02-06 the Human check should still verify real status codes and latency against live providers.

## Self-Check: PASSED

- Files exist: worker/src/ai.js, worker/src/index.js, tests/worker-ai.spec.mjs, tests/ai-client.spec.mjs, index.html.
- Commits on gsd/v0.96-stabilize: 40f0834, 50f6267, ce547bf (`git rev-list --count 49efe1f..HEAD` = 3); nothing pushed.
- All task acceptance criteria re-run and pass; `npm test` 165 passed; `npm run worker:check` exit 0 with no WARNING; `admin/woker.js` hash unchanged.
