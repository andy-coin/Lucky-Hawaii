# Project Research Summary

**Project:** 好韻器 Lucky Hawaii (Chinese lyric rhyming tool, v0.96 stabilization milestone)
**Domain:** Taiwan-Mandarin lyric writing assistant (pure front-end + free LLM + Cloudflare Worker)
**Researched:** 2026-10-03
**Confidence:** MEDIUM-HIGH

<!-- Persisted by orchestrator (#222 self-heal): synthesizer returned content inline without writing the file. -->

## Executive Summary

好韻器 is a mature proof-of-concept with three critical vulnerabilities blocking stability: **AI reliability is broken by dead models and disabled fallback**, **storage has silent failures**, and **a monolithic 6000-line file with no tests makes any refactor risky**. Recommended approach: fix AI reliability and add a safety net first, then split the file with tests as a foundation for the main work: lexicon quality (offline Python pipeline with rule-based cleaning), editor modernization (model-first state, multi-song, undo), and rhyme-map visualization.

## Key Findings

### Critical Hotfixes (urgent)
- GitHub Models hard-retired 2026-07-30; client default `gpt-4.1` (GitHub Models id) hard-coded ~5 places and not in `LLM_MODELS`.
- `gemini-2.5-*` reported retiring 2026-10-16 (verify); Groq `qwen/qwen3.6-27b` shut down 2026-09-14 but still listed.
- `autoFallback: false` on all `LLM_MODELS` entries → fallback effectively disabled; errors swallowed by empty `catch`.
- Worker sends `maxOutputTokens: 2048` without `thinkingLevel` → Gemini 3.x thinking tokens can truncate output.
- Worker trusts client-supplied `model` / `_provider` / `messages` (no allowlist, no size limits).

### Recommended Stack
- Vanilla JS + GitHub Pages (no build), Cloudflare Worker + KV for AI and corrections.
- LLM chain moved server-side (single Worker endpoint): Gemini 3.5-Flash-Lite → Gemini 3.7/3.8-Flash → Groq gpt-oss-120b → Groq qwen3.8-27b → Workers AI. Per-attempt timeouts, retry only 429/5xx, dead-model memo on 404, JSON-schema output, `tried[]` diagnostics.
- Lexicon backbone: McBopomofo `BPMFMappings.txt` + `phrase.occ` (MIT/BSD), cross-voted with vChewing (MulanPSL-2.0), libchewing tsi.csv (LGPL, optional), MOE 重編國語辭典 headwords (CC BY-ND 3.0 TW, build-time signal only). Avoid rime-essay, jieba, zhwiki frequencies, CKIP, scraped lyrics.
- Cleaning: cp950 encode test (simplified/rare), OpenCC TWPhrases flag gated by occ ≤ 5, multi-source evidence tiers. Prototype: ~84k auto-keep, ~23k gray, ~136k auto-drop. LLM judge on gray only: ~130–235k tokens (Gemini free tier, one day).
- **Scope warning:** 3+ char words shrink to ~28–33k (cleaner). No open lexicon has lyric-style daily collocations — more would need a separate corpus-mining/LLM-generation phase.
- Libraries: SortableJS 1.15.7 (reorder), native Pointer Events (resize), own snapshot undo/redo, chunked rendering via IntersectionObserver + `content-visibility`, own DP segmentation over lexicon with `Intl.Segmenter` fallback.

### Expected Features
- **Table stakes:** end-rhyme coloring with toggles, click-to-look-up, per-line/section char count, section reorder + structured labels, undo/redo, multi-song with migration, txt/JSON export, visible save-failure alerts, validated-candidates-first AI, low-friction feedback button, full mobile usability.
- **Differentiators:** integrated rhyme map + editor + AI, internal/multi-syllable rhyme (off by default), rhyme-rule presets, per-section rhyme scheme letters, per-line phrase structure (3+4), cross-section comparison, selection-triggered analysis, AI-generated badge with mandatory rhyme validation, per-word report, admin grouping/batch/one-click apply/rollback, Google-Docs-style song tabs.
- **Anti-features:** lyric scoring, full-lyric AI generation, social/accounts/cloud sync, all markers on by default, re-analysis on every keystroke, hover-only features, admin key in URL.

### Architecture Approach
Model-first state (`songs-store` owns lyrics, DOM no longer source of truth), pure functional core (phonetics, rhyme-index, rhyme-query, lyrics-analysis, overrides, ai-pipeline — testable in Node), delegated UI. Existing `data/wordlist-overrides.json` schema `{removed, hidden, fixed, added, version}` becomes the correction-layer schema; KV live tier stacked on top via pure `applyOverrides(base, layers)`; separate KV namespace from feedback. Retrieval/fill/validation on client; Worker owns provider chain and stays rhyme-agnostic. Persistence: new `lh:*` keys, backup → write → flip schema flag; old keys kept ≥1 release.

## Critical Pitfalls (Top 5)
1. **Refactor regression with no safety net** — golden tests on pure search functions + smoke test clicking all 79 inline handlers before splitting; never mix move + fix in one commit.
2. **Free-tier LLM deprecation** — Worker-side model list, real fallback, timeouts, daily canary cron, visible errors.
3. **Storage migration losing lyrics** — crash-safe idempotent migration with backup; debounce + flush on `pagehide`.
4. **Rhyme-map rendering breaking IME/caret** — editor is a `<textarea>` from template string; use read-only gutter first, Highlight API only after device tests; never touch DOM during composition.
5. **KV correction layer consistency** — per-item idempotent entries, version handshake, clear only after live deploy verified; admin auth via header, no `innerHTML` of user text (stored XSS).

Also: IndexedDB cache can pin stale chunks (HTTP `max-age=600` + unawaited `ver` write); wordlist is actually 233,713 entries; zoom bug likely CSS `zoom` on container → replace with `--ui-scale` root font-size + rem.

## Implications for Roadmap

Suggested order (reconciled across researchers):
1. **Safety net** — golden tests, smoke test, silent-catch removal, localStorage inventory/backup.
2. **AI reliability hotfix + Worker chain** — urgent (deprecations); fix pick-count/fill-to-target and generated-word validation.
3. **Split index.html** — CSS out, script out, leaf modules extracted with tests.
4. **Layout/scale/perf** — zoom fix, responsive phone/tablet/desktop, chunked rendering.
5. **Lexicon v2** (offline Python, can run in parallel after step 2) — license gate first.
6. **Feedback & correction layer** — low-friction reporting, admin batch UX, KV layer + write-back script, auth fix.
7. **Editor model** — songs store, multi-song side tabs, undo/redo, drag modules, export, migration.
8. **Rhyme map & line analysis** — engine, gutter/overlay, settings page toggles.
9. **Mobile polish** — real-device tuning.

Dependencies: editor model → rhyme map; scale fix → rhyme map rendering; safety net → split.

### Open Decisions
- **Split mechanism:** ES modules (STACK) vs classic `defer` + `globalThis` shim strangler (ARCHITECTURE/PITFALLS, due to 79 inline `onclick`). Decide in split phase planning.
- **Local workflow:** ES modules need a local http server (no `file://`).
- **Worker deploy method:** dashboard paste vs wrangler (affects new KV binding/routes).
- **3+ char phrase volume** after cleaning — separate corpus phase if insufficient.
- **Section layout:** ordered stack with resizable height (recommended) vs free 2D placement.

### Research Flags
- AI phase: verify live Gemini/Groq model IDs and retirement dates.
- Layout phase: real iOS/Android zoom + memory repro.
- Lexicon phase: license gate (MOE BY-ND, LGPL), optional Taiwan corpus.
- Rhyme map phase: Highlight API browser matrix, Intl.Segmenter on real lyrics, polyphonic disambiguation.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Retirements verified from official docs; lexicon measured on real files |
| Features | MEDIUM-HIGH | Competitors from public pages |
| Architecture | HIGH | Codebase read directly with line refs |
| Pitfalls | MEDIUM-HIGH | Browser-specific and legal items MEDIUM |

## Sources
- STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md (this directory) — see each for primary sources (docs.github.com, ai.google.dev, console.groq.com, developers.cloudflare.com, McBopomofo/vChewing/libchewing repos, moedict README).

---
*Research completed: 2026-10-03*
*Ready for roadmap: yes*
