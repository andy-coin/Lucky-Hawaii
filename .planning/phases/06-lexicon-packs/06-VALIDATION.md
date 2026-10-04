---
phase: "06"
slug: "lexicon-packs"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-04"
---

# Phase 06 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Source: 06-RESEARCH.md § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright Test 1.63.0 (browser + wrapper specs) + Python 3 stdlib `unittest` (pipeline) |
| **Config file** | `playwright.config.mjs` (existing); `tools/lexicon/tests/` (Wave 0) |
| **Quick run command** | `python3 -m unittest discover -s tools/lexicon/tests && npx playwright test tests/lexicon-build.spec.mjs tests/lexicon-packs.spec.mjs` |
| **Full suite command** | `npm test` (+ `python3 tools/lexicon/build.py verify` for committed packs) |
| **Estimated runtime** | quick ~30 s; full ~5 min (cloud) |

---

## Sampling Rate

- **After every task commit:** Run the quick run command
- **After every plan wave:** Run `npm test` + `python3 tools/lexicon/build.py verify`
- **Before `/gsd-verify-work`:** Full suite must be green, golden diff empty, `build.py all` re-run is a no-op
- **Max feedback latency:** 30 seconds (quick run)

---

## Per-Task Verification Map

Filled by the planner/executor per plan. Requirement → test map (from RESEARCH):

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|-----------|-------------------|-------------|--------|
| LEX-01 | lock file + sha256 + licence gate; NOTICE + LICENSE per pack; no Simplified chars in NOTICE | unit + invariant | `python3 -m unittest tools.lexicon.tests.test_sources tools.lexicon.tests.test_notice` | ❌ W0 | ⬜ pending |
| LEX-07 | uniform `{w,z,p}` packs; manifest; selector; switching reloads + re-runs search; AI uses new pack | unit + browser | `npx playwright test tests/lexicon-packs.spec.mjs` | ❌ W0 | ⬜ pending |
| LEX-02 | rule unit tests; invariant: zero disallowed / simplified-only / non-BMP / duplicate entries in committed packs | unit + invariant | `python3 tools/lexicon/build.py verify` + unittest | ❌ W0 | ⬜ pending |
| LEX-03 | sample list through classify() + RecordedProvider (三酸甘油酯 keep; 聚乙烯醇縮丁醛, 分散式雜湊表 delete; ≥12 more) | unit (deterministic) | `python3 -m unittest tools.lexicon.tests.test_samples` | ❌ W0 | ⬜ pending |
| LEX-04 | single-source → gray; batching; token estimate; hard cap; resume; malformed output kept; builds with no key | unit (recorded + fake providers) | `python3 -m unittest tools.lexicon.tests.test_judge` | ❌ W0 | ⬜ pending |
| LEX-05 | every removed word has rule + reason; kept + removed == total; report counts + seeded samples; rescue survives rebuild | unit + invariant | `python3 -m unittest tools.lexicon.tests.test_report` | ❌ W0 | ⬜ pending |
| LEX-06 | content-hash version; per-pack cache replace; legacy numeric keys preserved; no chunk mixing; LRU ≤ active+1; stale load not published | browser | `npx playwright test tests/wordlist-cache.spec.mjs tests/lexicon-packs.spec.mjs` | extend + ❌ W0 | ⬜ pending |
| guard | golden unchanged; scan/storage key counts 17→18; `?v=` consistent | existing | `npm test` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tools/lexicon/` scaffold + `tools/lexicon/tests/` + tiny offline fixture sources
- [ ] `tests/lexicon-build.spec.mjs` — Playwright wrapper running the Python unit tests (so `npm test` covers them)
- [ ] `tests/lexicon-packs.spec.mjs` + `stubPack()` helper / fixture manifest in `tests/helpers.mjs`
- [ ] `tests/fixtures/lexicon/` recorded judgments + `samples.tsv`
- [ ] Update storage key count assertions 17→18 (`tests/scan.spec.mjs`, `tests/storage.spec.mjs`) and the `js/safety.js` comment

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real-AI gray-area pass and calibration agreement | LEX-04 | Needs a free AI key (TEST-CHECKLIST D-4); none in the cloud | Run the AI judge command with a key, check the calibration report |
| Spot-check deletion report samples | LEX-05 | Human judgement (ROADMAP Human check) | Open each pack's report, read the samples per reason |
| Compare packs by writing lyrics | LEX-07 | Feeds Phase 12 decision (ROADMAP Human check) | Switch packs in 偏好設定 and write with each |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
