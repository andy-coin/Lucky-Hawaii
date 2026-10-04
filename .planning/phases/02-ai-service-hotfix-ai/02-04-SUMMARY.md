---
phase: 02-ai-service-hotfix-ai
plan: 04
subsystem: ai-worker-abuse-protection
tags: [cloudflare-worker, allowlist, body-cap, rate-limit, origin-check, no-leak, playwright]

requires:
  - phase: 02-ai-service-hotfix-ai
    provides: "02-03 runChain/toLegacy/handleAi/handleLegacy, findModel/MODELS maxOut, worker-ai.spec helpers"
provides:
  - "worker/src/ai.js parseAiBody / parseLegacyBody (allowlist, 24,000-char and 8-message caps, token and temperature clamps) plus BAD_REQUEST_ERROR / TOO_LARGE_ERROR"
  - "worker/src/index.js readBodyCapped (64 KB, counted in bytes, never trusts Content-Length), isRateLimited (AI_LIMITER, fail-open), http(s)-only local origin"
  - "tests/worker-ai.spec.mjs: 23 new tests (白名單, 上限, token, 來源, 限流, 不洩漏)"
affects: [02-05, 02-06, phase-04-ai-word-picking]

actuals:
  tokens: 7989    # chars/4 over git diff ce547bf..HEAD (31,954 chars, 3 files)
  tasks: 2
  commits: 2
plan_head_before: ce547bf040e6d353d0cdf4888e1d2d073979d8e2
plan_head_after: 9aa4350e64160aea758d8fdbbf3ba70852f4bf63

tech-stack:
  added: []
  patterns:
    - "One shared read path for both AI routes: readAiRequest(request, parse) = capped read, JSON.parse, parse function; each route only maps the { error } to its own response shape ({ok:false,code,message} for /ai, {error:{message}} for the legacy root)"
    - "Tests build exact-size bodies by padding ASCII spaces inside the JSON, and chunked bodies with ReadableStream + duplex:'half'"

key-files:
  created: []
  modified:
    - worker/src/ai.js
    - worker/src/index.js
    - tests/worker-ai.spec.mjs

key-decisions:
  - "Limiter runs inside handleAi / handleLegacy (after the router's origin and method checks, before the body is read); /models and feedback/admin routes are not limited"
  - "temperature and maxTokens accept only real JS numbers (typeof number and finite); the old Number() coercion turned null and '' into 0, now they fall back to 0.95 / 2048"
  - "Local dev origin now also requires an http: or https: scheme (ftp://localhost, file://localhost rejected)"
  - "Legacy messages are copied to { role, content } only, so extra client fields never reach an upstream body"

patterns-established:
  - "Rejections (400/413/429/403) are decided before runChain, so a rejected request makes zero upstream calls; asserted by f.calls length in every rejection test"

requirements-completed: [AI-07]

coverage:
  - id: D1
    description: "A model id that is neither 'auto' nor in the registry gets 400 MODEL_NOT_ALLOWED with zero upstream calls on /ai; the legacy root serves it as auto"
    requirement: AI-07
    verification:
      - kind: unit
        ref: "tests/worker-ai.spec.mjs#白名單 (3 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Bodies over 65,536 bytes are rejected 413 before parsing, declared or chunked or lying about Content-Length, and the stream is cancelled; exact boundaries 65,536/65,537 bytes, 24,000/24,001 chars, 8/9 messages; the cap counts UTF-8 bytes (21,846 x 音 rejected)"
    requirement: AI-07
    verification:
      - kind: unit
        ref: "tests/worker-ai.spec.mjs#上限 (8 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Output tokens and temperature are forced by the Worker: maxTokens 99999 reaches Gemini as 2048 and Groq as 1024; temperature 5 becomes 1, -1 becomes 0, 'hot' becomes 0.95; legacy max_tokens/temperature use the same clamps"
    requirement: AI-07
    verification:
      - kind: unit
        ref: "tests/worker-ai.spec.mjs#token (2 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Only https://andy-coin.github.io (and with ALLOW_LOCAL_ORIGIN=1 only http(s) localhost / 127.0.0.1) may call /ai, /models and POST /; missing Origin, lookalike hosts and other schemes get 403; rejected origins are never echoed"
    requirement: AI-07
    verification:
      - kind: unit
        ref: "tests/worker-ai.spec.mjs#來源 (4 tests) plus 舊版：來源不對回 403"
        status: pass
    human_judgment: false
  - id: D5
    description: "AI_LIMITER success:false gives 429 RATE_LIMITED on /ai and POST / with zero upstream calls before the body is read; key is CF-Connecting-IP (or 'unknown'); no binding or a throwing limiter is served, the throw logged"
    requirement: AI-07
    verification:
      - kind: unit
        ref: "tests/worker-ai.spec.mjs#限流 (4 tests)"
        status: pass
    human_judgment: false
  - id: D6
    description: "No AI-route response (success, upstream failure, or Worker-side rejection) and no console.error line contains the provider keys, admin key, upstream text or upstream hosts"
    requirement: AI-07
    verification:
      - kind: unit
        ref: "tests/worker-ai.spec.mjs#不洩漏 (2 tests)"
        status: pass
    human_judgment: false
  - id: D7
    description: "Limiter counting behaviour under real Cloudflare (per location, eventually consistent, so a burst may slightly exceed 20 per 60 s) and whether the free plan accepts the [[ratelimits]] block at deploy"
    requirement: AI-07
    verification: []
    human_judgment: true
    rationale: "Needs a real deployment and Andy's Cloudflare login; locally the binding is a faked object. Covered by the post-deploy Human check in plan 02-06 (backstop)"

duration: 6min
completed: 2026-10-03
status: complete
---

# Phase 2 Plan 04: Abuse protection for the AI routes Summary

**Strangers can no longer burn Andy's free AI quota through the public Worker URL: only allowlisted models, a byte-counted 64 KB body cap that ignores Content-Length, 24,000-char and 8-message caps, Worker-forced output tokens and temperature, strict origin checks, a per-IP limiter that fails open, and tests proving nothing secret or upstream leaks.**

## Performance

- **Duration:** 6 min (2026-10-03T16:05Z to 16:11Z)
- **Tasks:** 2 (both TDD: tests first, then implementation)
- **Files:** 3 modified (no new files, no package files touched)
- **Tests:** `npm test` 188 passed (165 from 02-03 + 13 Task 1 + 10 Task 2). `tests/error-visibility.spec.mjs:123` did not fire. `npm run worker:check` exit 0, 0 warning lines. `worker-config.spec.mjs` 4 passed (wrangler.toml still has no dev switches).

## Constants

| Constant | Value | Where |
|----------|-------|-------|
| `MAX_BODY_BYTES` | 65536 (UTF-8 bytes) | `worker/src/index.js` |
| `MAX_CHARS` | 24000 (prompt, or sum of legacy message contents) | `worker/src/ai.js` |
| `MAX_MESSAGES` | 8 | `worker/src/ai.js` |
| `DEFAULT_MAX_TOKENS` | 2048 (also the ceiling; per-model `maxOut` then caps Groq at 1024) | `worker/src/ai.js` |
| `DEFAULT_TEMPERATURE` | 0.95 (clamp range 0..1) | `worker/src/ai.js` |
| Limiter | 20 requests / 60 s per `CF-Connecting-IP` (from `wrangler.toml` `[[ratelimits]]`, unchanged) | binding `AI_LIMITER` |

## Limiter fail-open decision

`isRateLimited` returns false (request served) when the `AI_LIMITER` binding is absent or when `limit()` throws, logging `[好韻器] 限流檢查失敗，先放行` plus the error message only. Reason: this is a free personal tool, availability matters more than strictness, and the binding block may need to be deleted if the free plan rejects it at deploy. Accepted residual risk, threat T-02-17. Origin only stops other websites' browsers, not scripts, so the real defences are allowlist, caps and limiter (comment in code).

## Boundary test list

| Boundary | Accepted | Rejected |
|----------|----------|----------|
| Body bytes | exactly 65,536 (with and without Content-Length) | 65,537; 70 KB chunked stream without Content-Length; Content-Length '100' with a 70 KB stream; Content-Length '999999' without reading; stream is cancelled early (pulled < 20 chunks) |
| Bytes not chars | n/a | 21,846 x 音 (65,538 bytes, 21,846 chars < 24,000) -> 413 |
| Prompt chars | exactly 24,000 | 24,001 -> 413 |
| Legacy messages | exactly 8 | 9 -> 400, 0 -> 400, summed content 24,001 -> 413, non-string content / unknown role / null / string item / missing content -> 400 |
| Shape | n/a | non-JSON body, prompt missing/empty/number/array, body `[]` or `null` -> 400 BAD_REQUEST |
| Model | 'auto', absent, every registry id | 'not-a-model', ' auto', 'AUTO', retired id, number, null -> 400 MODEL_NOT_ALLOWED (legacy: served as auto) |
| Token | 50 stays 50; absent / 'many' / -5 / 0 / NaN -> 2048 | 99999 -> Gemini 2048, Groq 1024 |
| Temperature | 0.3 stays | 5 -> 1, -1 -> 0, 'hot' -> 0.95 |
| Origin | production origin | evil.example, missing, `andy-coin.github.io.evil.com`, `http://andy-coin.github.io`, `:8443`, 'null'; local origins without switch (or switch '0'); with switch: `localhost.evil.com`, `127.0.0.1.evil.com`, `notlocalhost`, `ftp://localhost`, `file://localhost`, bare `localhost`, empty |
| Limiter | success true, no binding, throwing limiter | success false -> 429 on `/ai` and `POST /`; `/models` unaffected |

## Task Commits

1. **Task 1: allowlist, caps, token clamps** - `9e31f3c` (feat) - `worker/src/ai.js`, `worker/src/index.js`, `tests/worker-ai.spec.mjs`
2. **Task 2: origin, limiter, no-leak** - `9aa4350` (feat) - `worker/src/index.js`, `tests/worker-ai.spec.mjs`

Commit count measured from the ledger: `git rev-list --count ce547bf..HEAD` = 2. Docs commit skipped: `.planning/` is gitignored (SUMMARY not force-added, per orchestrator). Nothing pushed.

## Accomplishments

- `handleAi` and `handleLegacy` share `readAiRequest` (capped read, JSON parse, parse function); the inline `req` construction and `temperatureOf` from 02-03 are gone.
- The 02-03 Rule 2 guard on the legacy route (400 when `messages` is not a non-empty array) is now part of `parseLegacyBody`, and the legacy route returns 413/429/400 in its own `{error:{message}}` shape.
- Rejections are decided before `runChain`, so every rejected request makes zero upstream calls (asserted).
- A deliberately slow or infinite body cannot hold the Worker: reading stops and the stream is cancelled as soon as 65,536 bytes are exceeded.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Local dev origin required an http(s) scheme**
- **Found during:** Task 2 (plan step 2: confirm `originAllowed` matches the behaviour exactly)
- **Issue:** `originAllowed` compared only the hostname, so `ftp://localhost` or `file://localhost` passed with the dev switch on; the plan says http(s) only.
- **Fix:** also require `protocol` to be `http:` or `https:`. Test: `來源：開關打開時，長得像 localhost 的網址與非 http(s) 協定仍回 403`.
- **Files modified:** worker/src/index.js
- **Committed in:** `9aa4350`

**2. [Test adjustment] Stream test needs `highWaterMark: 0`**
- **Found during:** Task 2 first GREEN run
- **Issue:** the "limiter runs before the body is read" test flagged `read = true` because a default `ReadableStream` calls `pull` once when the `Request` is constructed, before the Worker runs.
- **Fix:** the test stream uses `{ highWaterMark: 0 }` so `pull` only fires on a real read. No Worker change.
- **Committed in:** `9aa4350`

**3. [Interpretation] Number coercion tightened**
- `clampTemperature` / `clampMaxTokens` accept only `typeof number` values, as the plan words it ("finite number"). The 02-03 `Number(raw)` treated `null` and `''` as 0; they now fall back to defaults 0.95 / 2048. No existing client sends these values.

**Total deviations:** 1 Rule 2 addition, 1 test adjustment, 1 interpretation. **Impact:** none on scope or contracts.

## Authentication Gates

None. No `wrangler login`, deploy, `secret` or `kv` command was run; nothing pushed; `admin/woker.js`, `package.json` and `package-lock.json` untouched.

## Known Stubs

None.

## Threat Flags

None beyond the plan register. T-02-15 (allowlist, token and temperature clamps), T-02-16 (byte-counted cap, 24,000 chars, 8 messages, lying Content-Length), T-02-17 (limiter, fail-open accepted), T-02-18 (dev switch absent from wrangler.toml, lookalike and scheme tests), T-02-20 (不洩漏 tests incl. console.error) and T-02-SC (no installs) are mitigated as planned; T-02-19 accepted as planned. Not covered by tests, by nature: real Cloudflare limiter behaviour (D7, backstop for 02-06).

## Issues Encountered

- The first RED run of Task 1 hung because the pre-change code reads an unbounded stream with `request.json()` (the very bug this plan fixes). I killed the run; the orphaned `tests/serve.mjs` server and Playwright worker from it held port 4310 and had to be stopped before the next run. Only those two processes of my own were stopped.

## Next Phase Readiness

Ready for 02-05 (health check, `/models` from KV): `/models` keeps the same origin rule and is not rate limited; candidate building in `runChain` is unchanged, so the KV health list plugs in where `isAvailable` is used. For 02-06 the Human check should additionally confirm the `[[ratelimits]]` block deploys on the free plan (if rejected: delete the block, the Worker serves unthrottled) and observe real 429 behaviour after a burst.

## Self-Check: PASSED

- Files exist: worker/src/ai.js, worker/src/index.js, tests/worker-ai.spec.mjs, 02-04-SUMMARY.md.
- Commits on gsd/v0.96-stabilize: 9e31f3c, 9aa4350 (`git rev-list --count ce547bf..HEAD` = 2); nothing pushed; no accidental deletions.
- Acceptance re-run: `--list` 白名單|上限|token = 15 (>= 8) and 來源|限流|不洩漏 = 11 (>= 6); `grep 65536` 1, `MAX_CHARS = 24000` 1, `AI_LIMITER` 3, `CF-Connecting-IP` 1; the `node -e` parseAiBody check exits 0; `npm test` 188 passed; `npm run worker:check` exit 0, no warning; `worker-config.spec.mjs` 4 passed.
