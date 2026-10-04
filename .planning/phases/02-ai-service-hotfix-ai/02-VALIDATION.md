---
phase: "2"
slug: "ai-service-hotfix-ai"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-03"
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Source: 02-RESEARCH.md § Validation Architecture.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `@playwright/test` 1.63.0 (browser e2e + Node-only Worker specs); `wrangler dev` smoke script |
| **Config file** | `playwright.config.mjs` |
| **Quick run command** | `npx playwright test tests/worker-ai.spec.mjs tests/worker-health.spec.mjs tests/worker-admin.spec.mjs tests/worker-config.spec.mjs` |
| **Full suite command** | `npm test` (+ `npm run worker:smoke`, `npm run worker:check` at phase gate) |
| **Estimated runtime** | ~90 seconds |

## Sampling Rate

- **After every task commit:** quick Worker specs (<15 s) + the spec named in the task
- **After every plan wave:** `npm test`
- **Before `/gsd-verify-work`:** `npm test` green, `npm run worker:check` clean, `npm run worker:smoke` green
- **Max feedback latency:** 120 seconds

## Per-Task Verification Map

| Req / SC | Behavior | Test Type | Automated Command | File Exists | Status |
|----------|----------|-----------|-------------------|-------------|--------|
| AI-01 / SC1 | stale `selectedModel` (gpt-4.1) → UI/request use `auto`, stored value untouched; valid stored model kept; `/models` unreachable keeps 自動 | e2e | `npx playwright test tests/ai-client.spec.mjs -g "舊模型\|保留"` | ❌ W0 | ⬜ pending |
| AI-02 / SC2 | timeout / 429 / 404 / 5xx → next model; 400 stops; dead/cooled skipped; all fail → 503 + 白話 + tried[] | unit | `npx playwright test tests/worker-ai.spec.mjs` | ❌ W0 | ⬜ pending |
| AI-02 / SC2 | client shows plain-language failure (no spinner) | e2e | `npx playwright test tests/ai-client.spec.mjs -g "白話"` | ❌ W0 | ⬜ pending |
| FND-05 / SC3 | wrangler.toml shape, bindings with ids, no secrets in worker/, dry-run deploy offline | unit/integration | `npx playwright test tests/worker-config.spec.mjs` | ❌ W0 | ⬜ pending |
| FND-05 / SC3 | admin endpoints behave as before (/feedback, /reports.json, decision, delete, 403, 410) | unit | `npx playwright test tests/worker-admin.spec.mjs` | ❌ W0 | ⬜ pending |
| FND-05 / SC3 | whole Worker under real `wrangler dev` incl. cron | smoke | `npm run worker:smoke` | ❌ W0 | ⬜ pending |
| AI-05 / SC4 | prune rules (dead, stale-with-fresher-sibling, min 2, never empty); health doc write; stale health ignored | unit | `npx playwright test tests/worker-health.spec.mjs` | ❌ W0 | ⬜ pending |
| AI-05 / SC4 | site menu follows `/models` | e2e | `npx playwright test tests/ai-client.spec.mjs -g "選單"` | ❌ W0 | ⬜ pending |
| AI-07 / SC5 | non-allowlisted model 400 with no upstream fetch; size/messages caps; token clamp; origin; rate limit; no key leakage | unit | `npx playwright test tests/worker-ai.spec.mjs -g "白名單\|上限\|token\|來源\|不洩漏"` | ❌ W0 | ⬜ pending |
| Regression | Phase 1 golden/smoke/storage/scan stay green | e2e | `npm test` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

## Wave 0 Requirements

- [ ] `tests/helpers.mjs` `/models` + `/ai` mocks; `tests/smoke.spec.mjs` stale-model workaround updated
- [ ] `tests/worker-helpers.mjs` (FakeKV, makeEnv, installFetch)
- [ ] worker spec files + `worker/test/dev-smoke.mjs`
- [ ] `worker/package.json` (`type: module`); root scripts; pinned wrangler 4.147.0 behind automated supply-chain gate
- [ ] `.gitignore`: `.dev.vars*`, `.wrangler/`

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Production deploy + live AI click | FND-05, AI-02 | Needs Andy's Cloudflare login (`wrangler login`) and real API keys | Follow the phase's Human-check page: login, KV id lookup, secrets, read deploy diff, deploy Worker, click AI 建議 on the live site |

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
