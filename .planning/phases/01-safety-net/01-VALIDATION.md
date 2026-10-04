---
phase: "1"
slug: "safety-net"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-10-03"
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `@playwright/test` 1.63.0 (browser, static-scan and storage tests in one runner) |
| **Config file** | `playwright.config.mjs` (present) |
| **Quick run command** | `npx playwright test tests/<file>.spec.mjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~90 seconds |

---

## Sampling Rate

- **After every task commit:** Run the spec file touched, plus `npx playwright test tests/golden.spec.mjs` for any `index.html` edit
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Req | SC | Behavior | Test Type | Automated Command | File Exists | Status |
|-----|----|----------|-----------|-------------------|-------------|--------|
| FND-01 | SC1 | ~35 inputs × 3 modes equal v0.96 snapshots; deterministic; no orphan goldens | integration | `npx playwright test tests/golden.spec.mjs` | ✅ | ✅ green |
| FND-01 | SC2 | Every inline handler fires, zero pageerror/console.error; coverage gate; negative control | integration | `npx playwright test tests/smoke.spec.mjs` | ✅ | ✅ green |
| FND-02 | SC3 | No swallowing catch / `.catch` in inline scripts + `js/**` | static scan | `npx playwright test tests/scan.spec.mjs -g "catch"` | ✅ | ✅ green |
| FND-02 | SC3 | Induced failures leave `[好韻器]` records; user-action failures toast | integration | `npx playwright test tests/error-visibility.spec.mjs` | ✅ | ✅ green |
| PERF-04 | SC4 | QuotaExceededError → one sticky dismissible throttled banner | integration | `npx playwright test tests/save-failure.spec.mjs -g "localStorage"` | ✅ | ✅ green |
| PERF-04 | SC4 | IDB failure: backup → banner; cache → toast + log | integration | `npx playwright test tests/save-failure.spec.mjs -g "IndexedDB"` | ✅ | ✅ green |
| FND-03 | SC5 | Registry covers every key; no direct localStorage outside safety layer; admin key excluded | static scan | `npx playwright test tests/scan.spec.mjs -g "registry"` | ✅ | ✅ green |
| FND-03 | SC5 | Old-data fixture intact; baseline backup; keep-3; migrate ×3 idempotent; failing migration restores | integration | `npx playwright test tests/storage.spec.mjs` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `package.json`, `package-lock.json`, `playwright.config.mjs`, `.gitignore` additions
- [x] `tests/serve.mjs`, `tests/helpers.mjs`
- [x] `tests/golden.spec.mjs` + `tests/golden/*.json` (from untouched v0.96)
- [x] `tests/smoke.spec.mjs`, `tests/scan.spec.mjs`, `tests/save-failure.spec.mjs`, `tests/storage.spec.mjs`, `tests/error-visibility.spec.mjs`
- [x] `tests/fixtures/*` (v0.96 localStorage snapshot, corrupt variant, wordlist stub)
- [x] `npx playwright install chromium` + `npm audit signatures` gate

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-10-03 (npm test: 104 passed)
