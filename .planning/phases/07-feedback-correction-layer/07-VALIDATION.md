---
phase: "7"
slug: "feedback-correction-layer"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-09"
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Source: `07-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright Test 1.63.0 (Node + browser specs) + Python `unittest` (spawned from a Playwright spec, like `tests/lexicon-build.spec.mjs`) + `worker/test/dev-smoke.mjs` (real workerd) |
| **Config file** | `playwright.config.mjs` (webServer `node tests/serve.mjs` on 127.0.0.1:4310); Python has no config file |
| **Quick run command** | `npx playwright test tests/worker-corrections.spec.mjs tests/corrections-site.spec.mjs` + `npm run corrections:test` |
| **Full suite command** | `npm test` (baseline 423 passed / 27 skipped / 0 failed) |
| **Estimated runtime** | ~100 seconds full suite; single spec a few seconds to ~30 seconds |

---

## Sampling Rate

- **After every task commit:** run the single spec mapped to the task (plus `npm run corrections:test` when Python changed)
- **After every plan wave:** `npx playwright test tests/worker-*.spec.mjs tests/corrections-*.spec.mjs tests/report-entry.spec.mjs tests/admin.spec.mjs tests/split-tags.spec.mjs tests/scan.spec.mjs tests/smoke.spec.mjs`
- **Before `/gsd-verify-work`:** `npm test` full suite green + `npm run worker:smoke` + `npm run worker:check`
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (filled by planner / validate-phase from PLAN.md task `<verify>` blocks) | | | FB-01..FB-05 | | | | | | ⬜ pending |

Requirement → test map (from research):

| Req | Behavior | Command |
|-----|----------|---------|
| FB-01 | 🚩 in batch toolbar, 0-selection toast, ≤4-step send, long-press removed on cards (kept on poly-chip), right-click 🚩 item, AI report mode, session dedupe without new storage key, failure/429 states, touch sizes | `npx playwright test tests/report-entry.spec.mjs` (+ updated `tests/layout.spec.mjs` menu test) |
| FB-02 | group by (type, word), ×n, time range, expand originals, select-all-filtered + batch approve/reject, XSS-safe rendering, `X-Admin-Key` header, phone layout | `npx playwright test tests/admin.spec.mjs` |
| FB-03 | Worker apply/public view/key/CORS/rev 409/put failure; site applies layer after base overrides; fetch failure/timeout ignored with log | `npx playwright test tests/worker-corrections.spec.mjs tests/corrections-site.spec.mjs` |
| FB-04 | revoke by id restores state; admin 已上線 → 撤回 → 已核准未套用 | `npx playwright test tests/worker-corrections.spec.mjs -g revoke` + `tests/admin.spec.mjs -g 撤回` + `npm run worker:smoke` |
| FB-05 | idempotent merge, byte-exact formatting, dry-run default, `--apply`/`--push`, non-main safety, live confirmation, clear-by-ids, rerun safety, key never printed | `npm run corrections:test` + `npx playwright test tests/corrections-writeback.spec.mjs` |
| all | `?v=` consistency, no swallowed catch, inline handlers smoke, no new hex | `npx playwright test tests/split-tags.spec.mjs tests/scan.spec.mjs tests/smoke.spec.mjs tests/style.spec.mjs` |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/fixtures/corrections-vectors.json` — ordered entries → expected final state, shared by the JS view builder and the Python replay (FB-03, FB-05)
- [ ] `tests/worker-helpers.mjs` `FakeKV` extended (`get` options, `put` exception injection, stale-once read, `list_complete`)
- [ ] `tests/helpers.mjs` `routeExternal` handles `/corrections.json`; new `bootAdmin(browser, {env, reports})`
- [ ] new specs: `tests/worker-corrections.spec.mjs`, `tests/corrections-site.spec.mjs`, `tests/report-entry.spec.mjs`, `tests/admin.spec.mjs`, `tests/corrections-writeback.spec.mjs`
- [ ] `tools/corrections/tests/__init__.py` (network guard copied from `tools/lexicon/tests/__init__.py`), `test_merge.py`, `test_writeback.py`, `test_format.py`
- [ ] `package.json` scripts `corrections:writeback`, `corrections:test`
- [ ] `worker/test/dev-smoke.mjs` extended with apply / public read / revoke

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Production walk-through: 核准 → 套用 → 寫回 push → 清空 | FB-03, FB-04, FB-05 | Needs the deployed Worker (Phase 2, Andy) and GitHub push credentials; Pages CDN timing only observable live | After Worker deploy and main merge: approve a test report in admin, press 🚀 套用到線上, refresh the site within 1–2 min and see the fix, press 撤回 and see it gone, re-apply, run `LH_ADMIN_KEY=… npm run corrections:writeback -- --apply --push`, wait for confirmation, check the layer is empty and the fix persists |
| Real-device report flow (iOS/Android) | FB-01 | Touch/keyboard behaviour on real phones | Select a card, press 🚩 回報, pick a reason, send; long-press a card does not open a menu |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
