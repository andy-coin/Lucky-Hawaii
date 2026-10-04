---
phase: 02-ai-service-hotfix-ai
plan: 01
subsystem: ai-client-and-worker
tags: [cloudflare-worker, gemini, playwright, localstorage, model-menu, tracer]

requires:
  - phase: 01-safety-net
    provides: "lhGet/lhSet/lhWarn safety layer, bootPage/routeExternal test helpers, golden + smoke + storage + scan specs"
provides:
  - "worker/ (tracked, ES modules): POST /ai, GET /models, OPTIONS preflight, origin allowlist with dev-only localhost switch"
  - "worker/src/models.js MODELS (6 dated entries, Gemini first) + findModel (exact match)"
  - "worker/src/ai.js geminiRequest (key in x-goog-api-key header) + runChain(req, env) -> { status, payload } (single Gemini candidate in this plan)"
  - "index.html thin AI client: AUTO_MODEL, let LLM_MODELS, loadModels(), aiTryList(), callLLM posting {prompt, model, temperature} to WORKER_URL + '/ai', window.__hoyunModelsReady"
  - "tests/worker-helpers.mjs (FakeKV, makeEnv, installFetch, geminiOk, bridgeWorker) and tests/ai-client.spec.mjs (9 browser tests)"
affects: [02-02, 02-03, 02-04, 02-05, 02-06, phase-04-ai-word-picking]

actuals:
  tokens: 10842   # chars/4 over git diff 57803f0..HEAD (43,367 chars, 9 files)
  tasks: 2
  commits: 3
plan_head_before: 57803f0116cc2fd35d62d2ba596980146553745c
plan_head_after: 874974940f348993bc30d52bfad782a402ed8649

tech-stack:
  added: []
  patterns:
    - "Browser tests run the real Worker code in-process: bridgeWorker routes the Worker host into worker.fetch, installFetch fakes only the upstream Gemini call"
    - "Read-time normalisation: a stored selectedModel that is not in the live list is shown as 自動 and never rewritten; only onModelChange writes"
    - "Option labels that come from the network are built with new Option(label, id), never HTML strings"

key-files:
  created:
    - worker/package.json
    - worker/src/models.js
    - worker/src/ai.js
    - worker/src/index.js
    - tests/worker-helpers.mjs
    - tests/ai-client.spec.mjs
  modified:
    - index.html
    - tests/helpers.mjs
    - tests/smoke.spec.mjs

key-decisions:
  - "Stale selectedModel is normalised at read time (O-4): dropdown shows 自動, /ai body carries model 'auto', localStorage keeps the user's raw value byte-for-byte"
  - "Near-miss ids (different case, trailing space) are unknown: findModel and the client list check both use exact equality"
  - "The client keeps exactly one value (preference id or auto) and aiTryList() returns one entry; the model chain lives only in the Worker (assumption-delta PROMOTE)"
  - "Gemini key travels only in the x-goog-api-key header; thinkingLevel is sent only for models whose registry entry has thinking set, never the older budget-style field"
  - "GET /models answers non-GET with 405 METHOD (symmetry with /ai; the plan did not specify it)"

patterns-established:
  - "Worker unit/e2e specs import ../worker/src/index.js directly; worker/package.json {type: module} is what makes that work under Playwright"
  - "bootPage waits on __hoyunModelsReady; models and aiFail are bootPage options that feed the Worker-host mock"

requirements-completed: [AI-01, AI-02, AI-05]

coverage:
  - id: D1
    description: "A user whose localStorage still holds the retired gpt-4.1 default clicks AI 建議 and gets AI-badged cards through the real Worker code; the browser sends only {prompt, model:'auto', temperature:0.95}"
    requirement: AI-01
    verification:
      - kind: e2e
        ref: "tests/ai-client.spec.mjs#舊模型：舊設定的使用者按 AI 建議拿得到結果"
        status: pass
    human_judgment: false
  - id: D2
    description: "The Gemini request carries the key in x-goog-api-key and never as a ?key= parameter"
    requirement: AI-02
    verification:
      - kind: e2e
        ref: "tests/ai-client.spec.mjs#舊模型：舊設定的使用者按 AI 建議拿得到結果"
        status: pass
    human_judgment: false
  - id: D3
    description: "Opening the page never writes selectedModel; stale, near-miss, missing and unreachable-list cases all show 自動 with storage untouched; opening the same stale profile twice gives identical results"
    requirement: AI-01
    verification:
      - kind: e2e
        ref: "tests/ai-client.spec.mjs -g 保留 (5 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The model menu is 自動（推薦） followed by the Worker's /models entries in the order returned; a valid manual choice stays selected and is sent as the preference; user change is the only write; labels render as inert text"
    requirement: AI-05
    verification:
      - kind: e2e
        ref: "tests/ai-client.spec.mjs -g 選單 (3 tests) and 保留：有效的手動選擇保留並送給 Worker"
        status: pass
    human_judgment: false
  - id: D5
    description: "Changing the dropdown while /models is still in flight keeps the user's choice (late response only re-renders)"
    requirement: AI-01
    verification: []
    human_judgment: true
    rationale: "Declared backstop in the plan (verification: backstop): by construction onModelChange writes before the late loadModels re-render, which reads storage; no timing-controlled test was written"
  - id: D6
    description: "Production behaviour against the real Gemini API (thinkingLevel casing, live key) and the deploy order Worker-first, site-second"
    requirement: AI-02
    verification: []
    human_judgment: true
    rationale: "Needs Andy's Cloudflare login and real keys; covered by the Human check in plan 02-06"

duration: 9min
completed: 2026-10-03
status: complete
---

# Phase 2 Plan 01: Thin AI client and Worker tracer Summary

**The page now posts only {prompt, model, temperature} to a new tracked Worker (`worker/`) whose POST /ai calls Gemini with the key in a header, and the model menu is built from the Worker's GET /models with 自動（推薦） first, so a v0.96 user with the dead gpt-4.1 setting gets AI cards again without any localStorage write.**

## Performance

- **Duration:** 9 min (2026-10-03T15:36:06Z to 15:46Z)
- **Tasks:** 2 (Task 1 tracer, Task 2 TDD: RED + GREEN)
- **Files:** 9 touched (6 created, 3 modified)
- **Tests:** `npm test` 113 passed (Phase 1 baseline 104 + 9 new in `tests/ai-client.spec.mjs`)

## Tracer result

Task 1 (tracer, commit `ccc0d22`) proved one path through every layer: v0.96 fixture (stale `selectedModel: "gpt-4.1"`) -> boot shows 自動 -> search 心 -> click AI -> `POST {WORKER_URL}/ai` body `{prompt, model:'auto', temperature:0.95}` -> real `worker/src/index.js` (bridged in-process by Playwright) -> faked Gemini `generateContent` URL containing `gemini-3.5-flash-lite`, no `key=`, header `x-goog-api-key: g-test` -> reply 美音、原因、光陰 -> `.ai-word-card .ai-badge` cards on the page; `localStorage.selectedModel` still `gpt-4.1`; no console errors, no off-origin requests. It passed on the first run. Gate logged: tracer verified end-to-end, expanding (automated-only verify, `human_verify_mode` end-of-phase, re-run green: `npx playwright test tests/ai-client.spec.mjs -g "舊模型" && npm test`).

## admin/woker.js hash check

`shasum admin/woker.js` before the task and after both commits: `58e8f8bf6debb7e01218393d6b17e67e8869f7bb` (identical; file untouched, still gitignored).

## Removed client hard-codes (former `index.html` line numbers at base 57803f0)

| Former lines | What was removed |
|--------------|------------------|
| 4465-4474 | `LLM_MODELS` with 5 hard-coded entries (`gemini-2.5-flash` at 4470, `qwen/qwen3.6-27b` at 4472, all `autoFallback: false`) -> `AUTO_MODEL` + `let LLM_MODELS = [AUTO_MODEL]` |
| 4476-4483 | `getApiKey` (provider list incl. `'github'`, `'claude'`) |
| 4491 | `isModelAvailable` |
| 4496, 4504 | `'gpt-4.1'` defaults in `renderModelSelect`; its `innerHTML` option assembly and `（未設定 key）` tag |
| 4511-4565 | commented-out dead `callLLM` (mentioned the retired GitHub provider) |
| 4567-4633 | old `callLLM`: second hard-coded Worker URL (4574), `_provider/messages/max_tokens` body, per-provider response parsing |
| 5014-5020, 5204-5215, 5320-5327 | three copy-pasted fallback `tryList` builders (`'gpt-4.1'` at 5014, 5204, 5320) -> `const tryList = aiTryList();` |
| 5212-5215 | unreachable 「沒有可用模型，請到 ⚙️ 設定 API key」 branch |
| 5234 | `if (m.id !== selectedId) showToast('已切到 …')` (callLLM now reports switches from the Worker's answer) |

`grep -c "gpt-4.1" index.html` = 0. `saveApiKey` and the `apiKey_` registry prefix are kept untouched.

## Task Commits

1. **Task 1 (tracer): AI 改走 Worker /ai** - `ccc0d22` (feat)
2. **Task 2 RED: failing menu tests** - `a62cca5` (test) - 6 of the 9 specs failed on assertions for the planned behaviour (dropdown stayed `auto` instead of the stored id, options missing the `/models` entries, `selectOption` timed out); 3 already held (stale, empty, double-boot)
3. **Task 2 GREEN: menu from /models** - `8749749` (feat)

Commit count measured from the ledger: `git rev-list --count 57803f0..HEAD` = 3. No REFACTOR commit.

## Accomplishments

- New tracked `worker/` (package.json `{"private":true,"type":"module"}`, `src/models.js`, `src/ai.js`, `src/index.js`) with POST /ai, GET /models, OPTIONS, exact-match origin allowlist (localhost/127.0.0.1 only when `ALLOW_LOCAL_ORIGIN === '1'`).
- `callLLM` reduced to one fetch with white-language errors (逾時 / 連不上 / 格式不對 / Worker `message`); every new catch calls `lhWarn`.
- `renderModelSelect` never writes; `loadModels()` only re-renders; labels via `new Option`.
- Test infra: `bridgeWorker` runs the real Worker in the browser tests; `bootPage` gained `models` and `aiFail` options and awaits `__hoyunModelsReady`; smoke no longer hand-sets the dropdown.

## Deviations from Plan

### Auto-fixed Issues

None of Rules 1-3 triggered in production code. Minor plan-adjacent choices:

1. **[Test adjustment] 保留：有效的手動選擇 clicks via `evaluate`** - Found during GREEN run. With only `selectedModel` in storage the side panels are collapsed, so `#generateBtn` is outside the viewport and `page.click` timed out. Switched to `page.evaluate(() => generateBtn.click())` (same as the Phase 1 smoke spec). The first RED run had already failed this test on the dropdown assertion, so the RED evidence stands. Commit `8749749`.
2. **[Interface superset] `json(status, obj, origin, env = {})`** takes an optional fourth `env` so the CORS echo can honour the dev-only localhost switch; the plan's three-argument form still works.
3. **[Unspecified detail] GET /models with a non-GET method returns 405 `METHOD`**, mirroring /ai.
4. **[Copy] `#modelSelect` tooltip** changed from 「從這個開始往下自動 fallback」 to 「自動＝由伺服器挑選並自動換手」, since the client no longer falls back.

**TDD note:** the plan is `type: execute` (only Task 2 is `tdd="true"`), so the `gsd_run check tdd-red-evidence` verdict was not run; its parser reads TAP/node:test/Surefire output and the project's runner is Playwright's list reporter. RED evidence is the failing run recorded above.

**Total deviations:** 0 rule-based, 4 notes. **Impact:** none on scope or contracts.

## Authentication Gates

None.

## Known Stubs

None. `DEFAULT_MODELS` in `tests/helpers.mjs` is an intentional test fixture. `GET /models` returns the static registry with `checkedAt: null` by design; plan 02-05 swaps the source for the daily health result with the same response shape.

## Threat Flags

None beyond the plan's register. T-02-01 (inert labels, test `選單：標籤只當文字`), T-02-02 (origin allowlist), T-02-03 (header-only key, asserted), T-02-04 (registry-only ids plus `encodeURIComponent`), T-02-05 (boot writes nothing, `保留` tests), T-02-SC (`git diff --quiet 57803f0 -- package.json package-lock.json js/safety.js` clean) are all mitigated as planned. Origin is still not authentication; caps and rate limit arrive in plan 02-04.

## Issues Encountered

- `tests/error-visibility.spec.mjs:123` (WR-05, already logged in STATE.md as advisory) failed once in one of three full runs and passed on rerun; the final `npm test` run is 113 passed.
- Left for later plans by design: the client still prints `所有模型都失敗：…slice(0,80)` on a failed run (plan 02-03 removes the truncation); the loops in the three AI call sites run exactly once (Phase 4 restructures them).

## Next Phase Readiness

Ready for 02-02. The Worker contract is fixed: later plans extend `runChain`'s body (full chain, classification, cooldown) without changing its signature or payload shape, add the ported admin/feedback routes and the legacy `POST /` shim, and replace the `/models` source. Deploy order stays Worker first, site second (the page now speaks `/ai`, which the live Worker does not have yet; plan 02-06 writes the checklist).

## Self-Check: PASSED

- Files exist: worker/package.json, worker/src/models.js, worker/src/ai.js, worker/src/index.js, tests/worker-helpers.mjs, tests/ai-client.spec.mjs (verified below).
- Commits on gsd/v0.96-stabilize: ccc0d22, a62cca5, 8749749 (`git rev-list --count 57803f0..HEAD` = 3); nothing pushed.
- `npm test`: 113 passed; plan acceptance greps all pass; `admin/woker.js` hash unchanged.
