---
phase: "3"
slug: "split-index-html"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-04"
---

# Phase 3 — Validation Strategy

> Source: 03-RESEARCH.md § Validation Architecture.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `@playwright/test` 1.63.0 (browser + Node-only specs) |
| **Config file** | `playwright.config.mjs` |
| **Quick run command** | `npx playwright test tests/golden.spec.mjs tests/smoke.spec.mjs tests/scan.spec.mjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~70 seconds |

## Sampling Rate

- **After every task commit:** `node tests/verify-split.mjs <BASE>` + quick run
- **After every move commit:** `npm test`
- **Before `/gsd-verify-work`:** full suite green, verify-split OK, `git status` clean
- **Max feedback latency:** 90 seconds

## Per-Task Verification Map

| Req / SC | Behavior | Test Type | Automated Command | File Exists | Status |
|----------|----------|-----------|-------------------|-------------|--------|
| FND-04 / SC1 | index.html skeleton only; works over HTTP, no build | static + e2e | `node tests/verify-split.mjs <BASE>` + `npx playwright test tests/split-tags.spec.mjs` | ❌ W0 | ⬜ pending |
| FND-04 / SC2 | search results + every button identical | golden + smoke | `npx playwright test tests/golden.spec.mjs tests/smoke.spec.mjs` | ✅ | ⬜ pending |
| FND-04 / SC3 | core logic runs in Node | Node-only | `npx playwright test tests/core-node.spec.mjs` | ❌ W0 | ⬜ pending |
| FND-04 / SC4a | old saved data readable | storage | `npx playwright test tests/storage.spec.mjs tests/save-failure.spec.mjs tests/smoke.spec.mjs` | ✅ | ⬜ pending |
| FND-04 / SC4b | move vs fix commits separate | git inspection | `node tests/verify-split.mjs <BASE>` per move commit | ❌ W0 | ⬜ pending |
| Scan | registry + catch scans cover js/** | static | `npx playwright test tests/scan.spec.mjs` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

## Wave 0 Requirements

- [ ] `tests/verify-split.mjs`
- [ ] `tests/split-tags.spec.mjs`
- [ ] `tests/core-node.spec.mjs`

## Manual-Only Verifications

All phase behaviors have automated verification.

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
