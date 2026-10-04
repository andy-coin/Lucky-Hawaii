---
phase: "4"
slug: "ai-fill-validate-ai"
status: complete
nyquist_compliant: true
wave_0_complete: true
created: "2026-10-04"
---

# Phase 4 — Validation Strategy

> Source: 04-RESEARCH.md § Validation Architecture.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `@playwright/test` 1.63.0 (browser + Node vm specs) |
| **Config file** | `playwright.config.mjs` |
| **Quick run command** | `npx playwright test tests/ai-fill.spec.mjs tests/core-node.spec.mjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~70 seconds |

## Sampling Rate

- **After every task commit:** quick run (<10 s)
- **After every plan wave:** `npm test`
- **Before `/gsd-verify-work`:** `npm test` green, golden unchanged, `grep -rn _aiExtraRoundDone js tests` empty
- **Max feedback latency:** 90 seconds

## Per-Task Verification Map

| Req | Behavior | Test Type | Automated Command | File Exists | Status |
|-----|----------|-----------|-------------------|-------------|--------|
| AI-03 | fillToTarget: pool ≥ target ⇒ exactly target, no dupes, all in pool; AI returns 0 / off-pool / dupes still filled | unit | `npx playwright test tests/ai-fill.spec.mjs -g "fillToTarget"` | ✅ | ✅ green：tests/ai-fill.spec.mjs「fillToTarget：數量剛好…」「fillToTarget：同分維持原順序…」 |
| AI-03 | browser: AI returns 3 → 24 cards, /ai once, no generation | e2e | `npx playwright test tests/ai-fill.spec.mjs -g "填滿"` | ✅ | ✅ green：tests/ai-fill.spec.mjs「填滿：候選 ≥ 24 時 AI 只回 3 個…」「邊界：候選剛好 24 不造詞、23 才造詞」 |
| AI-03 | AI fails + pool ≥ 24 → 24 cards + 白話提示 | e2e | `npx playwright test tests/ai-fill.spec.mjs -g "AI 失敗仍填滿"` | ✅ | ✅ green：tests/ai-fill.spec.mjs「AI 失敗仍填滿…」 |
| AI-03 | repeated clicks keep prompt under Worker cap | e2e | `npx playwright test tests/ai-fill.spec.mjs -g "連按"` | ✅ | ✅ green：tests/ai-fill.spec.mjs「連按：候選池再大…」「用完與重置…」 |
| AI-04 | validateWordRhyme rules (開心/傷心 vs 心, 押字首, 純聲母, 多字, 破音字) + mirror pass rate ≥ 97% | unit | `npx playwright test tests/ai-fill.spec.mjs -g "validateWordRhyme\|鏡射"` | ✅ | ✅ green：tests/ai-fill.spec.mjs「validateWordRhyme：…」×6、「鏡射：…」 |
| AI-04 | pool < 24 → one generation round; invalid dropped; no extra round | e2e | `npx playwright test tests/ai-fill.spec.mjs -g "造詞一輪"` | ✅ | ✅ green：tests/ai-fill.spec.mjs「造詞一輪：…」「generatedWordOk…」「buildGenPrompt…」 |
| PERF-03 | slow wordlist: 詞庫載入中, 0 /ai calls until ready | e2e | `npx playwright test tests/wordlist-cache.spec.mjs -g "慢速"` | ✅ | ✅ green：tests/wordlist-cache.spec.mjs「慢速：…」×2 |
| PERF-03 | version bump: atomic swap; partial failure keeps old set; v= on URLs | e2e | `npx playwright test tests/wordlist-cache.spec.mjs -g "版本"` | ✅ | ✅ green：tests/wordlist-cache.spec.mjs「版本：…」 |
| PERF-03 | non-200 chunk logged | e2e | `npx playwright test tests/wordlist-cache.spec.mjs -g "非 200"` | ✅ | ✅ green：tests/wordlist-cache.spec.mjs「非 200：…」 |
| Regression | golden/smoke/storage unchanged | e2e | `npm test` | ✅ | ✅ green：npm test 269 passed，golden 自 2f5239e 無 diff |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

## Wave 0 Requirements

- [x] retire `tests/verify-split.mjs` + its split-tags negative control (first commit)
- [x] `tests/node-core.mjs` shared loadCore
- [x] `tests/ai-fill.spec.mjs`, `tests/wordlist-cache.spec.mjs`
- [x] `tests/helpers.mjs` waitWordlist option; stub regex allows `?v=`

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real-rhyme quality & count feel | AI-03, AI-04 | Subjective quality (ROADMAP Human check) | Andy tries a few real rhymes (e.g. 心, 安, 愛) after Worker deploy |

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** 2026-10-04 自動核准（04-05 phase gate 全綠；手感項目交 Andy UAT）
