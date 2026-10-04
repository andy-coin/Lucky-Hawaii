# Phase 6: Lexicon Packs 台灣詞庫包 - Context

**Gathered:** 2026-10-04
**Status:** Ready for planning
**Mode:** Smart discuss, auto-accepted in the cloud relay session. CLOUD-RELAY.md: the blueprint was settled with Andy, so design questions are not re-asked. Every recommended answer below follows from REQUIREMENTS LEX-01..07, the PROJECT.md decisions and the code. Calls that were not settled are listed under 「自主決定」 in TEST-CHECKLIST.md (IDs 06-CTX-n) for Andy to review.

<domain>
## Phase Boundary

This phase builds a fully automatic, repeatable pipeline that:
1. fetches several Taiwan-centred lexicon sources whose licences allow republishing,
2. cleans each one by the 「可理解性」 rule (LEX-02/03/04),
3. writes each source as an independent **lexicon pack** in one unified format, with a NOTICE, a per-pack deletion report and a version.

The site gains a setting to switch the active pack. Rhyme lookup and AI suggestions use the chosen pack immediately. A pack version bump invalidates old caches automatically (LEX-06).

**Not in this phase:**
- Merging into one official lexicon and making it the default (Phase 12 / LEX-08, after Andy's real-use comparison).
- Making the admin and feedback flow easier (Phase 7). This phase only makes sure a wrongly removed word *can* be restored through the existing correction layer (LEX-05).
- Expanding or filtering 2-character words (LEX-V2-02).
- Mining phrases from corpora (LEX-V2-01).

</domain>

<decisions>
## Implementation Decisions

### A. Sources and licensing (LEX-01)
- **A1. Candidate sources.** Research must confirm each licence before a source is used. Candidates:
  - libchewing `tsi.csv` (新酷音)
  - McBopomofo data (小麥注音)
  - vChewing VanguardLexicon (唯音; the root of today's quality problem, kept for comparison)
  - Ministry of Education (教育部) dictionaries, *only if* their licence allows publishing a cleaned derivative. 重編國語辭典 / 簡編本 are CC BY-ND, and ND likely forbids a filtered derivative. If so, they may only be used as a **reference signal**, never shipped as a pack. Research decides.
  - Other Taiwan open lexicons research finds (e.g. g0v / moedict-derived data, 教育部常用字表).
  - A source whose licence is unclear or incompatible is **excluded** and recorded in the research doc with the reason.
- **A2. NOTICE per pack.** Each pack ships a `NOTICE` (source name, URL, licence, upstream version/commit, transformation statement). The site's About dialog lists the sources of the active pack.
- **A3. Pinned inputs.** The pipeline downloads sources at a pinned commit/version recorded in a manifest, so re-runs are reproducible. Raw downloads are cached outside the published `data/` tree and are not committed. Only the cleaned packs and reports are committed.
- **A4. Current pack kept.** Today's `data/wordlist-c*.json` lexicon stays available as a pack named 「v0.96 現行詞庫」, so Andy can compare old against new. It stays the **default pack** until Phase 12. Users who never touch the setting see zero change.

### B. Pack format and switching on the site (LEX-07, LEX-06)
- **B1. Entry format.** Keep today's entry shape `{"w":詞,"z":"注音 以空格分字","p":詞頻}`, chunked like today. This lets `js/wordlist.js` (single-promise loader, one-transaction cache swap, `?v=` per chunk, whole-pack discard on a missing chunk, from Phase 4) load any pack with minimal change.
- **B2. Directory layout.**
  - One directory per pack: `data/packs/<pack-id>/`, holding `meta.json` (id, name in Traditional Chinese, version, entry count, chunk count, sources, licence, build date), the chunks and `NOTICE`.
  - A manifest `data/packs/index.json` lists the packs and the default.
  - The current lexicon is exposed as a pack without duplicating 13MB: either point its manifest entry at the existing files or move them. Planner's choice, but **existing users' cached data must keep working** (data-safety constraint).
- **B3. Pack setting.**
  - It lives in 偏好設定 as a simple list showing pack name, entry count and a one-line description.
  - It is saved in a new storage key registered in `js/safety.js` `LH_KEYS`, with backup and migration rules like every other key.
  - Switching packs reloads the lexicon through the same loader (with the 「詞庫載入中…」 state), and the current search re-runs.
- **B4. Cache invalidation (LEX-06).** The IndexedDB cache is keyed by pack id + pack version. A new pack version, or switching packs, never mixes chunks across packs or versions. Old pack caches are cleaned up so storage does not grow without bound. Keep at most the active pack plus one; planner may tune.
- **B5. Overrides apply per pack.** Polyphonic data, the rhyme dictionary and the per-character index stay shared. Only the word list changes per pack. Correction overrides (`data/wordlist-overrides.json`, user overrides) apply on top of whichever pack is active.

### C. Cleaning pipeline (LEX-02, LEX-03, LEX-04)
- **C1. One command.** One command runs everything, e.g. `npm run lexicon:build` or `python3 tools/lexicon/build.py`. Planner picks the language: Python 3 stdlib matches the old build scripts, Node matches the test stack. No manual per-entry review. It must run offline after the first download, apart from the optional AI step.
- **C2. Rule layer, in this order.** Each entry ends as one of keep / delete / gray.
  - **Delete:** contains a Simplified-only character, using a Traditional↔Simplified character table such as OpenCC's, if licence-compatible.
  - **Delete:** contains a character outside the Taiwan common + secondary character sets (教育部常用字 4808 + 次常用字 6343, or the equivalent research finds), treated as 罕用字.
  - **Delete:** matches a China-only usage list, e.g. a 兩岸用語 mapping where the term is the mainland-only side.
  - **Delete:** pronunciation or encoding is broken, or the entry is a duplicate.
  - **Keep or gray:** the 可理解性 (comprehensibility) heuristics are applied.
  - **Gray:** a word attested by only **one** source is never deleted outright; it is downgraded to gray (LEX-04).
- **C3. Gray area judged by free AI (LEX-04).**
  - Gray entries are judged in batches against the LEX-03 standard (keep everyday, spoken, reading, literary and novel words; school-level classical words; common proper nouns such as 三酸甘油酯; delete hard-to-understand and ultra-niche academic terms such as 聚乙烯醇縮丁醛 and 分散式雜湊表). The standard is **not** 「歌詞風」.
  - Judgments are cached in a committed judgments file keyed by word, so re-runs cost zero tokens and stay deterministic.
  - The script estimates tokens first and stays under the free quota: batch size, an estimate printed before running, and a hard cap.
- **C4. No AI key in the cloud.** There is no AI key here (D-4 is Andy's to provide).
  - The AI step is built, tested with a recorded or mock provider, and can be resumed.
  - Packs are built now with **unjudged gray words kept** (conservative: nothing deleted without a reason) and flagged in the report as 「待 AI 判斷」.
  - When Andy supplies a key, or the Worker proxy is used, one command runs the AI pass and rebuilds the packs with a version bump.
  - Using the existing Cloudflare Worker AI proxy instead of a raw key is preferred if research shows it is feasible within the Worker's free limits and its abuse guards from Phase 2.
- **C5. Sample-list test (success criterion 4).**
  - A committed fixture word list with expected outcomes (三酸甘油酯 → keep; 聚乙烯醇縮丁醛, 分散式雜湊表 → delete; plus a dozen more everyday, literary, classical, China-only, simplified and rare-character cases) runs automatically in `npm test`.
  - Words decided by rules are asserted directly.
  - Words decided by AI are asserted through the committed judgments cache or the recorded provider, so the test is deterministic and needs no network.

### D. Deletion report and rescue (LEX-05)
- **D1. What each pack gets.**
  - A machine-readable removed list `{word, reason, rule, source}`.
  - A human-readable Traditional Chinese report (counts per reason, ~20 random samples per reason, and the gray / pending-AI counts), committed under `data/packs/<id>/` or a `reports/` folder. Planner's choice; it must not be loaded by the site at runtime.
- **D2. Rescue path.** A wrongly removed word is restored by adding it to the existing correction-layer `added` list (Phase 7 makes this one click from admin). The pipeline also honours a committed `keep` allowlist on the next rebuild, so a rescue survives future rebuilds.

### Claude's Discretion
- Implementation language and where the tools live (`tools/lexicon/` or `scripts/`). The old `scripts/build_wordlist.py` / `merge_corelib.py` referenced by the docs are **not in this repo**: probably ignored on Andy's Mac and never pushed. Build fresh; do not depend on them. Asking Andy to push them is a 「待 Andy 決定／動手」 item.
- Exact chunk sizes, frequency (`p`) derivation when a source has no frequency (fall back to existing frequency data or the other sources' frequency; 0 when unknown), and pack ids and names.
- Exact comprehensibility heuristics before the AI step (e.g. length or affix patterns for chemical or technical names). Cap their aggressiveness: when unsure → gray, not delete.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `js/wordlist.js` (Phase 4, 04-05): single-promise lexicon loader, IndexedDB cache swap in one transaction (`_idbReadCache` / `_idbReplaceAll`, numeric keys only), chunk URLs with `?v=`, missing chunk discards the whole lexicon, 「詞庫載入中…」 wait in `js/ai-generate.js`.
- `data/wordlist-meta.json` `{version, chunks, total}` plus `data/wordlist-c00..c09.json`, one JSON object per line `{"w","z","p"}` (about 233,713 entries).
- `data/wordlist-overrides.json` (version 2, `removed` list etc.): the correction layer applied on load.
- `js/safety.js` `LH_KEYS`, `lhGet`/`lhSet`, IndexedDB v2 backups and migrations: every new storage key must be registered here (`tests/scan.spec.mjs` enforces literal keys).
- Settings dialog (偏好設定) from Phase 5 is usable on every device and scrolls on short screens.
- `tests/wordlist-cache.spec.mjs`: cache, version and failure tests to extend for pack switching.
- `tests/golden.spec.mjs` plus `tests/golden/`: lookup results pinned for the current lexicon. They must stay unchanged while the default pack is still 「v0.96 現行詞庫」.

### Established Patterns
- Plain global-script JS, no build step, GitHub Pages static hosting. All `<script>`/`<link>` tags share one `?v=`, bumped together (split-tags test).
- Comments in Chinese. Traditional Chinese UI only, simplified Chinese is forbidden.
- Tests: Playwright (`npm test`); worker tests via wrangler dev.

### Integration Points
- `js/wordlist.js` load path: pack manifest → active pack meta → chunks.
- Settings dialog: the new pack selector.
- About dialog: NOTICE / sources of the active pack.
- Worker (`worker/`): optional AI proxy for gray-area judging. Respect Phase 2 rate limits and abuse guards.

</code_context>

<specifics>
## Specific Ideas

- Sample words fixed by REQUIREMENTS: 三酸甘油酯 (keep), 聚乙烯醇縮丁醛 (delete), 分散式雜湊表 (delete).
- PROJECT.md: the current word data comes from vChewing VanguardLexicon and libchewing tsi.csv. vChewing brings in many simplified characters, China-specific terms and classical archaisms, and has few everyday 3+ character words. That is the root problem this phase addresses.
- Andy compares packs by actually writing lyrics with each one (Human check). Pack names and descriptions in the selector must be plain Traditional Chinese that a musician understands.

</specifics>

<deferred>
## Deferred Ideas

- Merge into the official lexicon and make it the default: Phase 12 (LEX-08).
- One-click rescue from admin: Phase 7.
- 2-character word expansion (LEX-V2-02) and corpus phrase mining (LEX-V2-01): v2.

</deferred>
