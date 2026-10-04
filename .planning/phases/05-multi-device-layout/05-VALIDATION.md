---
phase: "5"
slug: "multi-device-layout"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-04"
---

# Phase 5 — Validation Strategy

> Source: 05-RESEARCH.md § Validation Architecture and 05-UI-SPEC.md § 15 (full per-check map lives there; this file is the sampling contract).

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `@playwright/test` 1.63.0 (multi-viewport e2e, toHaveScreenshot, CDP CPU throttling) |
| **Config file** | `playwright.config.mjs` |
| **Quick run command** | `npx playwright test tests/layout.spec.mjs tests/golden.spec.mjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~120 seconds |

## Sampling Rate

- **After every task commit:** quick run + the spec named in the task
- **After every plan wave:** `npm test`
- **Before `/gsd-verify-work`:** `npm test` green, golden unchanged, visual baselines committed
- **Max feedback latency:** 150 seconds

## Per-Task Verification Map

| Req | Behavior | Test Type | Automated Command | File Exists | Status |
|-----|----------|-----------|-------------------|-------------|--------|
| PERF-01 | 100% no overflow; 50/150% edge elements inside viewport (3 viewports) | e2e | `npx playwright test tests/layout.spec.mjs -g "縮放"` | ❌ W0 | ⬜ pending |
| PERF-02 | progressive render; long tasks under thresholds at 4×/6× CPU; final DOM identical (golden) | e2e/perf | `npx playwright test tests/perf.spec.mjs` + `tests/golden.spec.mjs` | ❌ W0 | ⬜ pending |
| UI-01 | search / lyrics / AI flows fully operable at 390×844, 820×1180, 1440×900 (+landscape functional) | e2e | `npx playwright test tests/layout.spec.mjs -g "流程"` | ❌ W0 | ⬜ pending |
| UI-02 | light/dark/custom-color screenshot baselines | visual | `npx playwright test tests/visual.spec.mjs` | ❌ W0 | ⬜ pending |
| UI-03 | inputs ≥16px on mobile; viewport meta; keyboard-shrink keeps focused field visible | e2e | `npx playwright test tests/layout.spec.mjs -g "輸入"` | ❌ W0 | ⬜ pending |
| Regression | golden/smoke/storage/save-failure unchanged | e2e | `npm test` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

## Wave 0 Requirements

- [ ] `tests/helpers.mjs` bootPage viewport/isMobile/hasTouch/colorScheme options; settle() waits for render-complete
- [ ] computed-style parity JSON captured before any CSS edit
- [ ] "before" screenshot set for Andy
- [ ] `tests/layout.spec.mjs`, `tests/perf.spec.mjs`, `tests/visual.spec.mjs`

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real iPhone/Android keyboard, auto-zoom, safe-area, zoom feel | UI-03, PERF-01 | Emulation cannot reproduce real keyboards/Safari | Open the site on phone after merge; type in search, lyrics, context fields; use +/- scale |
| Overall beauty | UI-02 | Subjective (ROADMAP Human check) | Compare "before" and "after" screenshots and use on devices |

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 150s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
