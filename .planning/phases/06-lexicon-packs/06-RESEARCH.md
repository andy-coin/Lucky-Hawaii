# Phase 6: Lexicon Packs 台灣詞庫包 - Research

**Researched:** 2026-10-04
**Domain:** Offline lexicon-cleaning pipeline (Python stdlib) + multi-pack loader/IndexedDB cache in a no-build static site (GitHub Pages) + free-tier LLM batch judging
**Confidence:** HIGH for licences, pins, formats, volumes and loader design (all verified this session by downloading the pinned files and running measurements). MEDIUM-LOW for Gemini free-tier numbers (only third-party pages were reachable) and for legal interpretation of CC BY-ND / LGPL data derivatives (`[ASSUMED]`, flagged for Andy).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**A. Sources and licensing (LEX-01)**
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

**B. Pack format and switching on the site (LEX-07, LEX-06)**
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

**C. Cleaning pipeline (LEX-02, LEX-03, LEX-04)**
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

**D. Deletion report and rescue (LEX-05)**
- **D1. What each pack gets.**
  - A machine-readable removed list `{word, reason, rule, source}`.
  - A human-readable Traditional Chinese report (counts per reason, ~20 random samples per reason, and the gray / pending-AI counts), committed under `data/packs/<id>/` or a `reports/` folder. Planner's choice; it must not be loaded by the site at runtime.
- **D2. Rescue path.** A wrongly removed word is restored by adding it to the existing correction-layer `added` list (Phase 7 makes this one click from admin). The pipeline also honours a committed `keep` allowlist on the next rebuild, so a rescue survives future rebuilds.

### Claude's Discretion
- Implementation language and where the tools live (`tools/lexicon/` or `scripts/`). The old `scripts/build_wordlist.py` / `merge_corelib.py` referenced by the docs are **not in this repo**: probably ignored on Andy's Mac and never pushed. Build fresh; do not depend on them. Asking Andy to push them is a 「待 Andy 決定／動手」 item.
- Exact chunk sizes, frequency (`p`) derivation when a source has no frequency (fall back to existing frequency data or the other sources' frequency; 0 when unknown), and pack ids and names.
- Exact comprehensibility heuristics before the AI step (e.g. length or affix patterns for chemical or technical names). Cap their aggressiveness: when unsure → gray, not delete.

### Deferred Ideas (OUT OF SCOPE)
- Merge into the official lexicon and make it the default: Phase 12 (LEX-08).
- One-click rescue from admin: Phase 7.
- 2-character word expansion (LEX-V2-02) and corpus phrase mining (LEX-V2-01): v2.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LEX-01 | Several Taiwan-centred sources, licence compatible with a public site, NOTICE per pack | Section "Source Licence Verdicts": 3 packs INCLUDE (libchewing LGPL-2.1+, McBopomofo MIT+TaBE BSD-3, Vanguard non-MOE part MulanPSL-2.0+TaBE BSD-3), MOE family EXCLUDE; pinned URLs + sha256; NOTICE templates; automated licence gate |
| LEX-07 | One unified format, independent packs, switchable on the site | Format is today's `{w,z,p}` NDJSON; per-source parsers; reading-selection rule; manifest + loader design; measured pack sizes |
| LEX-02 | Remove simplified / rare-character entries and China-only terms | Measured rule layer (volumes per rule per source), char sets (MOE lists + stdlib Big5), OpenCC pitfalls and the frequency guard |
| LEX-03 | 可理解性 standard, 三酸甘油酯 keep, 聚乙烯醇縮丁醛 / 分散式雜湊表 delete | Prompt standard + calibration set; finding that the two "delete" examples occur in NO real source (synthetic fixture rows needed); 三酸甘油酯 is McBopomofo-only (so it is a real gray case) |
| LEX-04 | Fully automatic; single-source → gray; free AI judges gray within free tokens | Gray volume ≈ 33.8k words → ~0.5M tokens; batching, hard cap, resume, provider adapters (recorded / Gemini direct / Worker), recommendation |
| LEX-05 | Deletion reason per word, report with stats + samples, rescue via correction flow | `removed.ndjson` schema carrying `z` and `p` so a rescue is a ready-made `added` entry; keep-allowlist + overrides.added honoured on rebuild |
| LEX-06 | New pack version, old caches auto-invalidate | Content-hash versions, per-pack IDB keys (legacy numeric keys kept for the default pack), LRU cleanup, stale-load race guard |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

Extracted from `/home/user/Lucky-Hawaii/.claude/CLAUDE.md` (project block) and `.planning/CLOUD-RELAY.md`. Treat as locked:

- **Hosting:** pure-frontend GitHub Pages + Cloudflare Worker; free tiers only; no self-hosted backend, no paid AI. [VERIFIED: CLAUDE.md "Constraints"]
- **Data safety:** an update must not lose users' lyrics / overrides / settings; localStorage / IndexedDB changes must be backwards-compatible or migrated. Every new storage key must be registered in `js/safety.js` `LH_KEYS`.
- **Language:** UI and lexicon Traditional Chinese (Taiwan); **Simplified Chinese is forbidden** (this also applies to NOTICE / licence text files shipped on the site — see Pitfall 15).
- **Code style:** classic global `<script>` files, no ES modules, no build step, 4-space indent, single quotes, comments in Chinese explaining *why*, camelCase, `_prefix` for internal functions.
- **Cache-busting:** whenever `css/` or `js/` changes, bump the `?v=` on **all** tags together (split-tags test).
- **Tests:** `npm test` must be fully green before each commit; golden snapshots change only via deliberate `npm run golden:update` (must NOT change in this phase: default pack = current lexicon).
- **GSD workflow:** edits go through a GSD command; commits per plan, branch `gsd/v0.96-stabilize`, never touch `main`.
- **Cloud relay:** no AI key available; things only Andy can do go to `.planning/TEST-CHECKLIST.md` 「待 Andy 決定／動手」; autonomous judgement calls go to 「自主決定」 as `06-CTX-n`.
- **Python:** project docs say Python 3.13 for build scripts; Andy's Mac may be older, so keep the tool compatible with Python ≥ 3.9 (no `match`, no `X | Y` annotations at runtime).

## Summary

The current lexicon (233,713 entries) is essentially **vChewing's VanguardLexicon (≈217k words) ∪ libchewing (21.9k extra)**. [VERIFIED: set arithmetic over the pinned files and `data/wordlist-c*.json`, this session] 64% of it (150,497 words) comes from vChewing's `phrases-moe-cht.txt`, which the vChewing README declares as taken from 《重編國語辭典修訂本 2015》 under **CC BY-ND 3.0**. That is simultaneously the origin of the "classical / niche" quality problem and a licence exposure of the *already shipped* default pack. Three other Taiwan-centred sources have clearly republishable licences and together give about 160k distinct words: libchewing-data `tsi.csv` (LGPL-2.1-or-later, declared in the file header), McBopomofo (MIT repo; word list derived from libtabe, BSD-3), and the non-MOE parts of VanguardLexicon (`phrases-vchewing` MulanPSL-2.0, `phrases-tabe` TaBE BSD-3). The whole 教育部 dictionary family is CC BY-ND 3.0 Taiwan and must stay out of the pipeline.

The rule layer is **cheap and conservative in practice**: on the three included sources only 149 / 193 / 173 entries per pack are deleted by rules (format, simplified, rare-char, China-term), because IME dictionaries are already Traditional and mostly within Big5. The real quality lever is the gray layer: 33.8k words (≈13.4k + 13.4k + 7.0k) are attested by exactly one of the three sources. Judging them costs roughly 0.5M tokens / ~230 requests, which fits any plausible free tier in one resumable session. The two LEX-03 "delete" examples (聚乙烯醇縮丁醛, 分散式雜湊表) do not occur in any source or in v0.96, so the sample test must use synthetic evidence rows; 三酸甘油酯 is a genuine McBopomofo-only (gray) word.

On the browser side the cleanest change is: keep v0.96 files and cache keys **untouched** (they are the default pack, so golden and cache tests and existing users' IndexedDB data keep working), add `data/packs/index.json` + per-pack directories, key non-default caches as string keys `p:<id>:…` in the same `wl` object store, bump the packs through a content hash version, and make the loader chunk-count / URL / cache-key aware.

**Primary recommendation:** Build `tools/lexicon/` in Python 3 stdlib with a pinned `sources.lock.json` (URLs + sha256 + licence gate), produce three new packs (`chewing`, `mcbopomofo`, `vanguard-tw`) plus the untouched `v096` default, run the AI pass through a provider-adapter (recorded for tests; direct Gemini key as the default real provider; Worker as optional), and extend `js/wordlist.js` with manifest-driven pack loading while leaving the default pack's file names, cache keys and URLs exactly as they are.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Fetch + pin + licence-gate upstream sources | Offline build tool (Python, Andy's Mac / cloud) | — | Must never run in the browser; raw downloads stay outside the published tree |
| Rule cleaning (format / simplified / rare / China-term / single-source → gray) | Offline build tool | — | Deterministic, testable without a browser |
| Gray-area AI judging | Offline build tool → LLM provider (direct Gemini; optional via Worker `/ai`) | Cloudflare Worker (optional proxy) | Batch, one-off, cached to a committed file; the browser is not involved |
| Pack storage + manifest + NOTICE + reports | CDN / Static (GitHub Pages files) | — | Plain files under `data/packs/…`; reports live under `tools/` and are never fetched at runtime |
| Pack selection setting | Browser (localStorage via `js/safety.js`) | — | Per-user preference; registered key |
| Pack loading, version check, IndexedDB cache, cleanup | Browser (`js/wordlist.js`) | CDN (chunks + meta) | Existing Phase 4 loader owns this; extended per pack |
| Correction overrides applied on top of active pack | Browser (`applyWordlistOverrides`) | Static `data/wordlist-overrides.json` | Existing mechanism (B5); Phase 7 will feed it |
| Lookup / AI suggestions using the active pack | Browser (`js/candidates.js`, `js/ai-generate.js`) | Worker (`/ai`) | Unchanged logic; pools must be reset on pack switch |
| Rescue of wrongly deleted words | Static data (`overrides.added` + `keep.json`) | Build tool honours both on rebuild | D2; Phase 7 adds the admin UI |

## Standard Stack

### Core (all stdlib; **no new npm or PyPI packages**)

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| Python 3 stdlib (`urllib.request`, `csv`, `json`, `hashlib`, `argparse`, `unicodedata`, `codecs`, `unittest`, `random`) | 3.11.15 here, 3.13 on Andy's dev container; keep ≥ 3.9 compatible | Entire pipeline + its tests | Matches the project's old build scripts; `codecs` ships the `big5` codec (gives the Taiwan charset for free); no dependency risk |
| Playwright Test | 1.63.0 (existing `devDependencies`) | Runs `npm test`; browser pack-switching tests; wraps the Python unit tests | Already the project test stack |
| Node 22 | 22.22.0 here | Existing tests only | — |

### Build-time data inputs (pinned; none of this is redistributed except as cleaned packs)

| Input | Pin (verified reachable via raw.githubusercontent.com on 2026-10-04) | Role |
|-------|------|------|
| `chewing/libchewing-data` `dict/chewing/tsi.csv` (5,244,487 B) | commit `c44e81aef24b06f1509f19e1be54c99812d0c43f`, sha256 `c889a1ac3ae1901b3f8f62748bc41b958f010bf995f7f88dbaf9e3494f341428` | Pack `chewing` |
| `openvanilla/McBopomofo` `Source/Data/BPMFMappings.txt` (5,019,395 B) + `phrase.occ` (1,768,276 B) | commit `be6564acad6c4d3265c34a2e1a872d80f9db6068` (branch `master`); sha256 `394f3946…e00171` / `dcd11597…cc7b8d` (full values in the lock-file example below) | Pack `mcbopomofo` |
| `vChewing/libvchewing-data` (a.k.a. vChewing-VanguardLexicon) `…/components/cht/phrases-vchewing-cht.txt` (266,746 B) + `phrases-tabe-cht.txt` (2,135,027 B) | commit `d41f2fc244eadf94c37df50ef98e716fdc28146d` | Pack `vanguard-tw` |
| `BYVoid/OpenCC` `data/dictionary/STCharacters.txt`, `TSCharacters.txt`, `TWPhrases.txt` + `LICENSE` | commit `3ac34aa439a9908dd49fa92b5174b46314787ac2` (Apache-2.0, per file header) | Simplified detection, China-term list (build-time rule input) |
| `zispace/hanzi-chars` `data-charlist/臺灣《常用國字表》（1982年）.txt` (4,808 chars) + `臺灣《次常用國字表》（1982年）.txt` | commit `6970aa7e4030253e22accfa5297d7e292d75a597` (repo has **no LICENSE file**; used only as a membership filter, never redistributed) | Rare-char rule (together with stdlib Big5) |

**Version verification:** every URL above was fetched by its pinned commit SHA (HTTP 200) and hashed this session; `git ls-remote` over HTTPS works in the container (api.github.com does not). `libchewing-data` was **archived by its owner on 2026-03-24 and migrated to codeberg.org/chewing/libchewing-data** [CITED: github.com/chewing/libchewing-data page, fetched 2026-10-04]; the GitHub snapshot stays readable and pinned, Codeberg is blocked in this container (CONNECT 403), so a future bump of that source must be done from a machine that can reach Codeberg.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Python | Node (`TextDecoder('big5')` can decode but not encode) | Node fits the test stack but has no ready Big5 charset test, and the old scripts were Python. Python wins; tests are wrapped by a Playwright spec so `npm test` still covers them |
| MOE lists + Big5 union as the "allowed chars" set | MOE lists alone | MOE-only flags 1,215 v0.96 words, including everyday ones written with accepted variants (推薦, 舖, 癡, 艷, 曬, 樑, 裏); union flags 449. Use the union |
| Direct Gemini key for the AI pass | Worker `/ai` proxy | Feasible (see AI section) but shares the live site's Gemini free quota and needs the not-yet-deployed Worker; keep as optional adapter |
| Re-deriving readings per character | Pick among the source's own readings | Source readings are already Taiwan 審音; never "improve" them from a PRC dictionary (PITFALLS.md) |

**Installation:** none. (`npm install` already provides Playwright; Python stdlib only.)

## Package Legitimacy Audit

No external packages are installed by this phase (Python standard library only; no `npm install` / `pip install` additions). The `package-legitimacy` gate is therefore not applicable.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none) | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Source Licence Verdicts (LEX-01)

Evidence was read from the actual files at the pinned commits unless marked otherwise. "Verdict" legend: **INCLUDE** = may become a pack; **BUILD-INPUT** = used at build time, never shipped as data; **REFERENCE-ONLY** = not used by the pipeline; **EXCLUDE** = must not contribute.

| Source | Licence evidence | Verdict | Requirements for the NOTICE / pack |
|--------|------------------|---------|------------------------------------|
| **libchewing-data `tsi.csv`** (新酷音) | File header lines 1-4: `# dc:title,內建詞庫,` / `# dc:rights,Copyright (c) 2025 libchewing Core Team,` / `# dc:license,LGPL-2.1-or-later,` / `# dc:identifier,2025.11.17,` [VERIFIED: tsi.csv header, read this session]. `word.csv` header: `dc:identifier,2026.3.20`, same licence. The repo has no LICENSE file; the header is the only per-file statement. libchewing code is LGPL-2.1 (`COPYING` 26,530 B) | **INCLUDE** (pack `chewing`) | Ship licence text copy (`LICENSE.LGPL-2.1.txt`), copyright line, upstream URL + commit + `dc:identifier`, and a **modification statement with date** (LGPL-2.1 §2 requires modified files to carry prominent change notices [VERIFIED: COPYING line 169 "b) You must cause the files modified to carry prominent notices"]). Pack is licensed LGPL-2.1-or-later. Keep data separate from site code. Risk: LGPL-2.1 §2(a) says "The modified work must itself be a software library" — a data derivative is an edge case `[ASSUMED]` (common community practice treats libchewing data derivatives as LGPL data; flagged as Open Question 2) |
| **McBopomofo data** (小麥注音) | Repo `LICENSE.txt`: `MIT License` / `Copyright (c) 2011-2026 Mengjuei Hsieh et al.` [VERIFIED: LICENSE.txt read]. `Source/Data/README.md`: `BPMFMappings.txt … Originally simplified from tsi.src of libtabe (BSD Licensed) with modifications` [VERIFIED: README.md read]. `ACKNOWLEDGEMENTS.md` lists no data owner besides bpmfvs readings (Apache-2.0; we do not use them) | **INCLUDE** (pack `mcbopomofo`) | MIT copyright + permission notice **and** the libtabe BSD-3 notice (below) |
| **libtabe (TaBE) BSD-3** (upstream of McBopomofo's list and of `phrases-tabe`) | Full text read from the Node.js LICENSE file section `COPYING.libtabe`: `Copyright (c) 1999 TaBE Project.` / `Copyright (c) 1999 Pai-Hsiang Hsiao.`; second block `Copyright (c) 1999 Computer Systems and Communication Lab, Institute of Information Science, Academia Sinica. All rights reserved.`; 3 conditions (retain notice in source; reproduce notice in binary-form docs; no endorsement); plus `Copyright 1996 Chih-Hao Tsai @ Beckman Institute, University of Illinois` [CITED: raw.githubusercontent.com/nodejs/node/main/LICENSE lines ~516-585] | **INCLUDE as notice obligation** | Reproduce this text verbatim in the NOTICE of `mcbopomofo` and `vanguard-tw` (and, harmlessly, `chewing`: tsi lineage traces to libtabe/Academia Sinica `[ASSUMED]`) |
| **vChewing VanguardLexicon, non-MOE parts** (`phrases-vchewing-cht.txt` 6,573 lines, `phrases-tabe-cht.txt` 62,156 lines) | README: `木兰宽松授权条款第 2 版（MulanPSL-2.0）` for content maintained by the project; `LibTaBE (by Pai-Hsiang Hsiao under 3-Clause BSD License)` [VERIFIED: README.MD read]. `LICENSE.txt` §4 (English): `You may distribute the Software in any medium with or without modification … provided that you provide recipients with a copy of this License and retain copyright, patent, trademark and disclaimer statements` [VERIFIED: LICENSE.txt lines 35-37]. `phrases-tabe` header: all entries already in 重編國語辭典 2015 were removed from this file [VERIFIED: file header] | **INCLUDE** (pack `vanguard-tw`) | Ship a copy of the Mulan PSL v2 **English** text (the CHS/CHT files say the legal text is Simplified; keep Simplified out of the site) + copyright `© 2021-2022 vChewing Project, Maintained by Shiki Suen` + TaBE BSD-3 notice. Exclude `phrases-moe-*`, `phrases-custom-*` (game / ACG proper nouns, outside scope) |
| **vChewing `phrases-moe-cht.txt`** (152,682 words; 6,003,448 B) | README: `《重编国语辞典修订本 2015》的六字以内的词语资料 (CC BY-ND 3.0)` [VERIFIED: README.MD] | **EXCLUDE** | CC BY-ND forbids distributing adapted material; a filtered subset is at best arguable (see MOE row). Not used even as a vote (see "Why MOE is not even a reference vote") |
| **教育部 國語辭典 family** (重編國語辭典修訂本, 國語辭典簡編本, 國語小字典, 成語典), incl. **g0v/moedict-data** | MOE public-licence page: 「創用CC-姓名標示-禁止改作 3.0 臺灣授權條款」 [CITED: language.moe.gov.tw/001/Upload/Files/site_content/M0001/respub/index.html via search results 2026-10-04; the site itself is blocked from this container]. moedict-data README: `辭典本文的著作權仍為教育部所有` and quotes MOE's interpretation that the 改作 restriction targets the text itself, not format conversion / later applications; the conversion's own editorial copyright is CC0 by @kcwu [VERIFIED: README read] | **EXCLUDE from the pipeline; REFERENCE-ONLY for humans** | A pack consisting of a *subset* of headwords is the exact situation Andy's PITFALLS.md flagged ("filtering … is arguably an adaptation"). The moedict README's MOE-interpretation is hearsay in a third-party README, not a licence grant. If Andy wants it, he must ask NAER (onile@mail.naer.edu.tw, from the dictionary's imprint) in writing → Open Question 1. No evidence found (2026-10) that the licence was relaxed |
| **OpenCC dictionaries** (`STCharacters`, `TSCharacters`, `TWPhrases`) | File headers: `# License: Apache-2.0 (see LICENSE)`; `LICENSE` is Apache License 2.0 [VERIFIED: files read] | **BUILD-INPUT** | Not shipped; derived deletion *decisions* only. Mention "清洗規則使用 OpenCC 字表（Apache-2.0）" in each pack's report/NOTICE as good practice |
| **教育部 常用國字標準字體表 4,808 / 次常用 6,343** | Official MOE publications (公告). Machine-readable copy: `zispace/hanzi-chars` (no licence file; header cites the MOE source URL) [VERIFIED: clone listing + file header] | **BUILD-INPUT** (membership filter) | Never redistributed. Taiwan copyright law excludes official documents from copyright `[ASSUMED]`; irrelevant while we only filter with it. Pin by sha256 (`d5247938…c058`, `23491aa6…3d37`) |
| **Python stdlib Big5 codec** | Part of CPython | **BUILD-INPUT** | Verified: Big5 level-1 range 0xA440–0xC67E = 5,401 chars and level-2 0xC940–0xF9D5 = 7,650 chars among CJK-ideograph code points [VERIFIED: python run]. Add a startup self-check asserting these counts |
| **Wikipedia 兩岸用語 lists, CC-CEDICT** | CC BY-SA | **EXCLUDE** | ShareAlike is viral to the derived dataset and not compatible with LGPL-2.1 (PITFALLS.md Pitfall 2) |
| **教育部 兩岸常用詞典 / TOCFL 八千詞 / TBCL 詞表** | Licence not confirmed (sites blocked) | **REFERENCE-ONLY** (not used) | `[ASSUMED]` same family as other MOE/NAER material (BY-ND or restrictive); would need confirmation before any use |
| **rime-essay / jieba dicts / other** | Not examined in depth | **Not recommended** | No Taiwan-first provenance guarantee; the three included sources already give ~160k distinct words |
| **v0.96 現行詞庫 (the shipped default)** | Derived from VanguardLexicon (contains the CC BY-ND 重編國語辭典 component) + libchewing | **KEEP unchanged as default**, but document honestly | Its NOTICE must say so (see "Current-pack NOTICE"). Phase 12's official lexicon must not inherit the MOE-derived component → Open Question 1 / TEST-CHECKLIST item |

### Why MOE is not even a "reference vote"

Counting MOE membership as a second attestation would have cut the gray set by ~10k words (A-only 13,432 → 10,233; B-only 13,435 → 6,558 when R = vChewing's MOE list is counted) [VERIFIED: set arithmetic]. That saves ~100k tokens but (a) ties a legally unclear CC BY-ND file into the pipeline, (b) adds a 6 MB dependency inside the vChewing repo, and (c) MOE membership is not evidence of everyday use (it is the source of the archaisms). Recommendation: **do not use it**; the extra ~10k gray words are cheap.

### NOTICE template (every pack, Traditional Chinese frame + English legal text)

```
<詞庫包名稱>（id: <id>，版本 <version>）
來源：<project> — <repo URL>（commit <sha>，上游版本標示 <dc:identifier / date>）
授權：<SPDX id>（全文見同資料夾 LICENSE.*.txt）
著作權：<verbatim copyright lines>
改作說明：本詞庫包由上述資料經自動清洗產生——刪除簡體字／罕用字詞條、移除中國專用詞、以「可理解性」標準篩選單一來源詞條；
          並轉換為 JSON Lines 格式。共刪除 <N> 筆，刪除清單與原因見 <repo path>。改作日期 <build date>。
清洗規則使用：OpenCC 字表（Apache-2.0）、教育部常用／次常用國字表（僅作比對，不重新散布）。
<verbatim TaBE BSD-3 notice where applicable>
```

### Current-pack (v096) NOTICE

State: derived from vChewing VanguardLexicon (components under MulanPSL-2.0, BSD-3 (TaBE), **CC BY-ND 3.0 重編國語辭典修訂本**, OGDv1 for CNS11643 character data) and libchewing-data (LGPL-2.1-or-later); "known licence limitation; the Phase 12 official lexicon will not reuse the MOE-derived component". Add the CC BY credit line 「教育部《重編國語辭典修訂本》」 with link.

### Automated licence gate (success criterion 1)

`sources.lock.json` records per source `{id, repo, commit, files[{path,url,sha256,bytes}], licence_spdx, licence_evidence, redistribute:true|false, role:'pack'|'rule-input'}`. The fetch step must: (1) verify sha256 of every download (supply-chain pin); (2) assert the live licence evidence still matches (e.g. `tsi.csv` header line `# dc:license,LGPL-2.1-or-later,`; McBopomofo `LICENSE.txt` first line `MIT License`; OpenCC header `Apache-2.0`); (3) refuse to build a pack from any source with `redistribute:false`; (4) test that each pack's `meta.json.sources[*].licence_spdx` is in an allow-list `{LGPL-2.1-or-later, MIT, BSD-3-Clause, MulanPSL-2.0}` and its NOTICE contains the SPDX id and the pinned commit.

**Lock-file excerpt (values verified):**

```json
{
  "schema": 1,
  "sources": [
    {
      "id": "libchewing-data", "role": "pack", "redistribute": true,
      "repo": "https://github.com/chewing/libchewing-data",
      "upstream_note": "archived 2026-03-24, moved to codeberg.org/chewing/libchewing-data",
      "commit": "c44e81aef24b06f1509f19e1be54c99812d0c43f",
      "licence_spdx": "LGPL-2.1-or-later",
      "licence_evidence": {"file": "dict/chewing/tsi.csv", "line": "# dc:license,LGPL-2.1-or-later,"},
      "files": [{"path": "dict/chewing/tsi.csv", "bytes": 5244487,
                 "sha256": "c889a1ac3ae1901b3f8f62748bc41b958f010bf995f7f88dbaf9e3494f341428",
                 "url": "https://raw.githubusercontent.com/chewing/libchewing-data/c44e81aef24b06f1509f19e1be54c99812d0c43f/dict/chewing/tsi.csv"}]
    },
    {
      "id": "mcbopomofo", "role": "pack", "redistribute": true,
      "repo": "https://github.com/openvanilla/McBopomofo",
      "commit": "be6564acad6c4d3265c34a2e1a872d80f9db6068",
      "licence_spdx": "MIT",
      "files": [
        {"path": "Source/Data/BPMFMappings.txt", "bytes": 5019395,
         "sha256": "394f3946754ebdd9d5e503f0f94c6977e5e19bd7cab21b4b18a6ea0167e00171"},
        {"path": "Source/Data/phrase.occ", "bytes": 1768276,
         "sha256": "dcd11597090b2bef88fb385bdd567e235ccd916728c84b8d0d3f8069ccfc7b8d"}]
    },
    {
      "id": "vanguard-tw", "role": "pack", "redistribute": true,
      "repo": "https://github.com/vChewing/libvchewing-data",
      "commit": "d41f2fc244eadf94c37df50ef98e716fdc28146d",
      "licence_spdx": "MulanPSL-2.0 AND BSD-3-Clause",
      "files": [
        {"path": "Sources/LibVanguardChewingData/Resources/components/cht/phrases-vchewing-cht.txt", "bytes": 266746,
         "sha256": "b614361675d400fdb4b9a65763c1cfd474fa9004c5a050641b4823adaa2fdd86"},
        {"path": "Sources/LibVanguardChewingData/Resources/components/cht/phrases-tabe-cht.txt", "bytes": 2135027,
         "sha256": "39a3f9af670c83c4fc02b8c0a222176d802964d0a88918bb2df1d78b5eba8d1b"}]
    },
    {
      "id": "opencc", "role": "rule-input", "redistribute": false,
      "repo": "https://github.com/BYVoid/OpenCC", "commit": "3ac34aa439a9908dd49fa92b5174b46314787ac2",
      "licence_spdx": "Apache-2.0",
      "files": [
        {"path": "data/dictionary/STCharacters.txt", "bytes": 36026, "sha256": "a0ca1601c70648cf48b33c3c6210ccbecc5c7eead4b4c3daf76587ba2c03582b"},
        {"path": "data/dictionary/TSCharacters.txt", "bytes": 104520, "sha256": "9ff46a7d30e5765375eb13d33f2b03a34d298913caf2b120380679f33ae1642d"},
        {"path": "data/dictionary/TWPhrases.txt", "bytes": 19429, "sha256": "bcb435b744ee3e522beb9b18fcc5486a36ed4763c6aa642ce18112fb5d604e31"}]
    },
    {
      "id": "tw-charlists", "role": "rule-input", "redistribute": false,
      "repo": "https://github.com/zispace/hanzi-chars", "commit": "6970aa7e4030253e22accfa5297d7e292d75a597",
      "licence_spdx": "NONE-DECLARED (official MOE lists; filter only)",
      "files": [
        {"path": "data-charlist/臺灣《常用國字表》（1982年）.txt", "bytes": 19675, "sha256": "d5247938cdb37a89ce2dc6f940342a8d1414dcd70e6fa65d51ebf5151cbc8058"},
        {"path": "data-charlist/臺灣《次常用國字表》（1982年）.txt", "bytes": 26690, "sha256": "23491aa6b46b8a2a150c9e1a55773897415e69bb57a5dc6e4b8af7d512093d37"}]
    }
  ]
}
```

(raw URL = `https://raw.githubusercontent.com/<owner>/<repo>/<commit>/<path>`; the CJK file names must be percent-encoded, e.g. `%E8%87%BA%E7%81%A3%E3%80%8A%E5%B8%B8%E7%94%A8%E5%9C%8B%E5%AD%97%E8%A1%A8%E3%80%8B%EF%BC%881982%E5%B9%B4%EF%BC%89.txt`. [VERIFIED: all fetched with HTTP 200 this session.])

## Source Formats and Parsing (Q2)

All three pack sources already carry 注音 in exactly v0.96's convention, so **no reading derivation is needed**: space-separated syllables, first tone unmarked, tone marks `ˊ ˇ ˋ` and neutral `˙` written as a **suffix** (e.g. `ㄍㄜ˙`), Bopomofo letters in U+3105–U+312F (no `一` U+4E00 in any reading: 0 hits in all three). [VERIFIED: character-set scan of the pinned files; v0.96 data: 150,505 untoned / 216,327 ˋ / 159,894 ˊ / 110,227 ˇ / 7,306 ˙-suffix syllables]

| Source | Line format | Multi-reading | Frequency | Notes (measured) |
|--------|-------------|---------------|-----------|------------------|
| `tsi.csv` | `詞,頻率,注音` (comma); 4 header `#` lines; also contains single characters and stray tone-mark lines (`ˇ,1,ˇ`) | one line per reading (10,856 of 147,737 words have > 1 reading; duplicates often differ only by `一`'s tone) | integer in column 2 (0 for 4,679 of A-only words) | 128,973 words of length ≥ 2; skip len-1 and non-Han lines. Every one of them is also in v0.96 |
| `BPMFMappings.txt` | `詞 注音1 注音2 …` (single spaces) | one line per reading (145,603 lines / 140,017 words) | **none** here; `phrase.occ` is `詞 次數` separated by **a single space** (AGENTS.md says TAB, the file does not: `od -c` shows 0x20) | 39,864 words have occ = 0. Contains non-Han / non-BMP entries (`一九九○`, `菜々子`, `𰻞𰻞麵`) |
| `phrases-*-cht.txt` | `詞 頻次 注音…` (single spaces; `#` comments; neutral tone suffix) | one frequency per word (a word may repeat across the two files) | integer | 6,014 + 58,809 distinct words (64,793 union); 2 entries have syllable-count ≠ length (`擸𢶍`, `倒三角形`) |

**Common parser rules (R0, deterministic):** NFC-normalise; keep only length 2..11 words made of CJK ideographs (U+3400–U+4DBF, U+4E00–U+9FFF, U+F900–U+FAFF) **in the BMP only**; syllable count must equal `len(w)`; every syllable ⊆ Bopomofo + `ˊˇˋ˙`; collapse duplicates by word.

**Frequency `p`:** use the pack's own source frequency (`tsi` column 2; `phrase.occ` count; Vanguard column 2, `max` over the two files); 0 when absent. `p` is not used for filtering (js comment: `p 不準確（很多 p=0 並非冷僻），暫停使用`), only for ordering in `fillToTarget` and a debug suffix, so scale differences between packs are harmless. [VERIFIED: js/wordlist.js comment lines; js/ai-generate.js:145 `wordPriorityMap.get(w) ?? 0` via grep]

**Reading selection for words with several readings** (single `z` per word, because the loader keys `wordPhoneticMap` by word): choose the candidate with the lowest sum, over syllable positions, of the character's rank in the existing `data/polyphonic-order.json` (Andy's own first-reading order, 679 characters, e.g. `"乾": ["ㄍㄢ", "ㄑㄧㄢˊ"]`), tie → fewer neutral-tone syllables → lexicographic. Measured against v0.96's own readings for the same words: identical *ignoring tone marks* for **4,274 / 4,893 (87.3 %)** chewing multi-reading words and **4,069 / 4,737 (85.9 %)** McBopomofo ones; exactly identical in only ~50 % because v0.96 (vChewing) applies tone sandhi (`一下` → `ㄧˊ ㄒㄧㄚˋ`) while the sources list the dictionary tone. **This is not a lookup bug:** rhyme matching strips tones (`getZhuyinRhyme` → `stripTone`, js/search.js:26-35) and `wordlistTone` is display-only. Provide an optional `tools/lexicon/rules/reading-overrides.json` (word → z) for the remaining final-differing cases (`一腔熱血` 血 ㄒㄧㄝˇ vs ㄒㄩㄝˋ, `一脈相傳`, …) and list multi-reading words in the report. [VERIFIED: measured with a prototype]

## Rule Layer (Q3) — measured on the pinned sources

Prototype (stdlib only) run on the real files; **expected volumes** (planner should assert *ranges and invariants*, never exact counts, because re-pinning changes them):

| Rule (apply in this order) | chewing (128,973) | mcbopomofo (140,017) | vanguard-tw (64,793) |
|---|---|---|---|
| R0 format / BMP / syllable-count | 0 | 7 | 12 |
| R1 simplified-only char | 0 | 8 | 2 |
| R2 rare char (∉ MOE common ∪ MOE secondary ∪ Big5 L1/L2) | 23 | 88 | 99 |
| R3 China-only term with own freq < 100 | 126 | 90 | 60 |
| **Rule deletions total** | **149** | **193** | **173** |
| G single-source (never deleted outright) | 13,354 | 13,378 | 6,826 |
| China-term but freq ≥ 100 (kept: 支持, 設備, 用戶, 文件, …) | 79 | 42 | 64 |
| Keep (≥ 2 sources, no rule hit) | 115,391 | 126,404 | 57,730 |

Cross-source facts: A=chewing, B=McBopomofo, C=vanguard-tw non-MOE. |A∪B∪C| = 160,670; A∩B = 115,286; in ≥ 2 of the three = 126,837; single-source A/B/C = 13,432 / 13,435 / 6,966 = **33,833 unique gray candidates** (≈ 33.6k after rule deletions). [VERIFIED: set arithmetic]

**Simplified-only detection (R1).**
- Do **not** treat every `STCharacters.txt` key as simplified: the table maps many legitimate Taiwan forms to variants (`峰→峯`, `群→羣`, `床→牀`, `秘→祕`, `灶→竈`…); 235 of its keys occur in v0.96 words, only 14 are real problems. [VERIFIED]
- Rule: char `c` is simplified-only iff `c ∈ keys(STCharacters)` **and** `c ∉ MOE common ∪ secondary` **and** `c ∉ keys(TSCharacters)` **and** `c ∉ Big5`. This yields on all three sources just the chars `条 冲 联 奥 装 …` plus a few variants that are legitimate in Taiwan (`祢` Christian 祢=你 in worship songs, `疱` 疱疹, `咤` 叱咤風雲, `咏` 吟風咏月) and Big5-valid `庄 厘` (客家庄, 公厘). → keep a committed `tools/lexicon/rules/char-allow.txt` (seed `庄 厘 祢 疱 咤 咏`, each with a one-line reason) that exempts a char from R1 **and** R2, and make the report list the "top characters causing R1/R2 deletions" so Andy can curate it.
- Phrase-level detection through `STPhrases.txt` is **unusable**: 771 of chewing's words are STPhrases keys (台北, 台大, 周六, 村庄…). Do not use it.
- The three included sources contain almost no simplified text (11 flagged chars in total); v0.96 has 60 such words (e.g. `脊神经`, `测一下` — the latter is already in overrides `removed`). Success criterion "zero simplified entries" is therefore an *invariant test* on the output, not a heavy filter.

**Rare-char (R2).** Allowed set = MOE 常用 (4,808) ∪ MOE 次常用 (6,344 distinct chars parsed) ∪ Big5 L1+L2 (stdlib). 11 MOE chars are not in Big5 and 200 Big5 chars are not in the MOE lists (舖 癡 薦 艷 曬 樑 庄 彝 勳 …), which is why the union is needed. Effect on v0.96: 449 words (vs 1,215 with MOE alone). Non-BMP characters (`𰻞`, `𨑨`) must be dropped because JS `.length` counts UTF-16 units and the candidate filters compare `entry.w.length` with the syllable count (js/wordlist.js `if (entry.w.length !== targetLen) continue;`).

**China-only terms (R3).**
- OpenCC `TWPhrases.txt` has 818 keys (771 with key ≠ value, ≥ 2 chars). It is a *conversion* table, **not** a China-only list: of the 320 keys that exactly match v0.96 words, many are everyday Taiwan words — `支持`(chewing freq 9,318) `文件`(14,213) `設備`(52,875) `用戶`(37,886) `地址` `消息` `自行車` `社區` `打開`. Deleting on key match alone would be a serious false-positive source. [VERIFIED]
- Rule: delete iff **exact key match** (key ≠ value, length ≥ 2) **and** the word's own-source frequency < 100 (T is tunable; sensitivity table: chewing exact hits below T = 10/50/100/500/1000 → 71/113/126/155/170). Matches with freq ≥ T are kept (not gray). Containment matches (e.g. `…循環`, `…方程式`) are **not** used: 8-10 per source, mostly false positives.
- Real hits are transliterations and mainland IT terms: 阿司匹林, 沙特阿拉伯, 馬爾代夫, 莫桑比克, 老撾, 打印機, 局域網, 剪貼板.
- Optionally add `tools/lexicon/rules/china-terms-extra.txt` (hand-curated, committed) for terms OpenCC lacks. No other usable licence-clean 兩岸 dataset exists (Wikipedia list = CC BY-SA; MOE 兩岸常用詞典 = unconfirmed).

**Comprehensibility heuristics before the AI step (C2 "keep or gray").** Keep them minimal and *only escalate*, never delete: (a) single-source → gray (required); (b) optional `--gray-policy=P2` adds words whose frequency is 0 in **every** source, which raises unique gray from 33.8k to 45.6k (+11.7k, mostly 2-4-char fragments like `釦下去`, `坌集`, `惴恐`) — recommended as an *off-by-default* switch because LEX-04 only mandates single-source gray; (c) chemical-name affix pattern (`…醇|醛|酮|酯|酸|烯|胺` and length ≥ 6) is already single-source in practice (v0.96 has only 13 such words), so no extra rule is needed. Erhua (`…兒`, len ≥ 3) words are 229 / 100 / 58 in the three sources vs 1,449 in v0.96; leave to the AI standard.

## Gray-area AI judging (Q4)

**Volume and tokens** (estimates; counting CJK at ~1.2 tokens/char `[ASSUMED]`, avg gray word 3.4 chars):
- Per word ≈ 7 input tokens (word + index + separator) + ~3 output tokens. Per request fixed overhead ≈ 600 input tokens (instruction + 6-8 few-shot examples).

| Policy | Unique words | Batch 100 | Batch 150 | Batch 300 |
|---|---|---|---|---|
| P1 single-source only (required by LEX-04) | ≈ 33.8k | 339 req, ≈ 0.54M tok | 226 req, ≈ 0.47M tok | 113 req, ≈ 0.43M tok |
| P2 = P1 + zero-freq-everywhere | ≈ 45.6k | 456 req | 304 req ≈ 0.64M tok | 152 req |

Add ≈ 25 % extra requests if D-verdicts get a second independent opinion (recommended: delete only when two passes agree). Tokens are far below any per-minute limit; the binding constraint is **requests per day**.

**Free-tier limits (as of 2026-10-04) — treat as unverified.** The official page (ai.google.dev/gemini-api/docs/rate-limits) is blocked from this container. Third-party 2026 pages reported: Flash-Lite 15 RPM / 250k TPM / ~1,000-1,500 RPD; Flash 10 RPM / 250k TPM / ~250-500 RPD; and that Google cut free quotas on 2025-12-06 (2.5 Flash 250 → ~20 RPD) and removed Pro models from the free tier in April 2026. [CITED: web search summaries of tinkerllm.com, aipromptshub.co, apiyi.com, 2026 — secondary sources, not Google; confidence LOW-MEDIUM]. Consequence for design: the script must (1) never assume a limit — honour 429 `retryDelay` / `Retry-After`, (2) be **resumable** (append each batch's verdicts to the judgments file immediately), (3) offer `--max-requests` (hard cap, default ~400) and `--batch-size` (default 150, max ~300), so a low RPD just means "run again tomorrow". Default model `gemini-3.5-flash-lite` (first in the Worker's registry: `{ id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', provider: 'gemini', family: 'gemini-flash-lite', released: '2026-07-21', maxOut: 2048 }` [VERIFIED: worker/src/models.js:9-10]); whether its free tier exists today is `[ASSUMED]`.

**Provider adapters (same interface `judge(words) -> {word: 'K'|'D'}`):**
1. `recorded` — reads a committed fixture; used by every test. No network ever.
2. `gemini` — direct call, **default real provider**. Same wire format the Worker uses: `POST {base}/v1beta/models/{id}:generateContent`, header `x-goog-api-key` (key only from env `GEMINI_API_KEY`, never in the URL, never logged), body `{contents:[{role:'user',parts:[{text}]}], generationConfig:{temperature:0, maxOutputTokens}}`, answer in `candidates[0].content.parts[].text` [VERIFIED: worker/src/ai.js:47-60, 84-87].
3. `worker` — optional: `POST <worker>/ai` with `{prompt, model:'auto', temperature:0, maxTokens}`.

**Worker-proxy feasibility (answer to C4's preference).** Technically feasible: `/ai` accepts one `prompt` ≤ 24,000 chars, 64 KB body, `maxTokens` clamped to 2,048 (`const MAX_CHARS = 24000; const DEFAULT_MAX_TOKENS = 2048;` [VERIFIED: worker/src/ai.js:241-243]), model must be `auto` or in the registry, per-IP limiter 20 requests / 60 s (`wrangler.toml` `limit = 20`, `period = 60`), chain budget 28 s. A 150-word batch is ≈ 3k chars in / ≈ 450 tokens out, well inside. **But I recommend it only as a fallback**, because: (a) the Worker is not deployed yet (Phase 2 pending on Andy); (b) every call burns the same Gemini free quota the live site uses for AI suggestions, so a 230-request run can starve real users for the day; (c) the fallback chain may answer with Groq models (`maxPromptChars: 4500`, `maxOut: 1024`, lower quality) and the judgments file would then mix models — record the model per verdict; (d) it needs no new key, which is its only advantage. If used: throttle to ≤ 10 req/min, run off-peak (Worker health cron is 19:17 UTC), stop at `--max-requests`.

**Batching and prompt design.**
- Input block: numbered lines `N<TAB>詞`; words are *data*, quoted/delimited; instruct "output exactly one line per number: `N K` or `N D`, nothing else". Parser accepts only `^\d+\s*[KD]` lines; any missing / malformed number → retry that subset once in a smaller batch, then leave **unjudged** (kept, flagged 「待 AI 判斷」).
- Standard text (Traditional Chinese) restates LEX-03: keep everyday / spoken / reading / literary / novel words, classical words taught below university, common proper nouns (e.g. 三酸甘油酯); delete only if an ordinary educated Taiwanese reader cannot understand it without specialist training (e.g. 聚乙烯醇縮丁醛, 分散式雜湊表). "When unsure answer K." Explicitly **not** a 歌詞風 test.
- `temperature: 0`; store `prompt_version` in the judgments file header and re-judge only on explicit `--rejudge` (so editing the prompt cannot silently change committed results).
- **Calibration set** `tools/lexicon/judgments/calibration.tsv` (~60 words with Andy-standard K/D, including the three required examples): an optional `lexicon:eval` command reports agreement against a real provider (target ≥ 90 %); not part of `npm test`.
- Prompt-injection hygiene: lexicon words come from upstream files; cap word length (≤ 11), never put them in instruction position, ignore any output that is not `N K|D`.

**Judgments cache.** `tools/lexicon/judgments/judgments.tsv`, one line `詞<TAB>K|D<TAB>model<TAB>prompt_version`, sorted by word (≈ 34k lines ≈ 1 MB, diff-friendly), atomic write (temp + rename) after every batch. Keyed by word only (the standard is pack-independent). Rule: gray word with `D` → deleted with `rule=R5-ai-incomprehensible`; with `K` → kept; absent → kept + counted as pending. A `keep.json` entry always wins over `D`.

**Estimate gate.** Before any network call print `gray=… batches=… est_in_tokens=… est_out_tokens=…` and **exit non-zero** if `batches > --max-requests` or tokens > `--max-tokens` unless `--force`.

## Architecture Patterns

### System Architecture Diagram

```
 pinned upstream (GitHub raw @commit)                     Andy / cloud
 ┌────────────┐ ┌──────────────┐ ┌─────────────────┐
 │ tsi.csv    │ │ BPMFMappings │ │ phrases-vchewing│   OpenCC dicts, MOE char lists (filter only)
 │ (LGPL)     │ │ + phrase.occ │ │ + phrases-tabe  │            │
 └─────┬──────┘ └──────┬───────┘ └───────┬─────────┘            │
       ▼ fetch+sha256+licence gate (sources.lock.json) ─────────┘
 ┌──────────────────────────────────────────────────────────────────┐
 │ parse → normalise (NFC, BMP, syllable count) → pick reading       │
 │   → evidence per word {sources[], freqs, readings}                │
 │ rule engine:  keep-allowlist? → R0 → R1 → R2 → R3 → single-source│
 │                         │delete(+reason)        │gray             │
 │                         ▼                       ▼                 │
 │                  removed.ndjson          judgments.tsv ◄── AI judge (recorded │ gemini │ worker)
 │                         │                       │ K / D / none→pending        │
 │ write pack: sorted NDJSON chunks, meta.json (hash version), NOTICE, LICENSE.*   │
 │ write report: tools/lexicon/reports/<id>/ (REPORT.md, stats.json, removed.ndjson)│
 └───────────────┬──────────────────────────────────────────────────┘
                 ▼  data/packs/index.json + data/packs/<id>/…  (committed, served by GitHub Pages)
 ┌──────────────────────────── browser ────────────────────────────┐
 │ boot: lhGet('lh:lexiconPack') ─► index.json ─► active pack       │
 │   meta (no-cache) → version → IDB key p:<id>:… (v096: legacy keys)│
 │   hit & complete → use; else fetch chunks ?v=<version> → one tx   │
 │   swap + LRU prune → buf → applyWordlistOverrides → wordlistData │
 │ switch: set key → reset maps/pools/_aiEpoch → reload → re-search │
 └──────────────────────────────────────────────────────────────────┘
        rescue: removed.ndjson {w,z,p} ─► overrides.added (Phase 7) / keep.json ─► next rebuild keeps it
```

### Recommended Project Structure

```
tools/lexicon/
├── build.py                    # CLI: fetch | build | judge | report | verify | all   (npm run lexicon:build)
├── sources.lock.json           # pins, sha256, licences (above)
├── lex/                        # package: fetch.py parse.py rules.py reading.py judge.py pack.py report.py licence.py
├── rules/                      # keep.json  char-allow.txt  china-terms-extra.txt  reading-overrides.json
├── judgments/                  # judgments.tsv (committed cache)  calibration.tsv
├── reports/<id>/               # REPORT.md  stats.json  removed.ndjson   (NOT under data/, never fetched by the site)
└── tests/                      # unittest modules + tiny fixture sources
data/packs/
├── index.json                  # manifest (default + list)
├── chewing/ mcbopomofo/ vanguard-tw/   # meta.json  NOTICE.txt  LICENSE.*.txt  c00.json …
└── v096/NOTICE.txt             # the default pack keeps its chunks in data/ (see below)
tests/lexicon-build.spec.mjs    # Playwright wrapper: runs `python3 -m unittest discover -s tools/lexicon/tests`
tests/lexicon-packs.spec.mjs    # committed-output invariants + browser pack-switch tests
```
Raw downloads: default cache dir **outside the repo**, `~/.cache/lucky-hawaii/lexicon/` (override `LEX_CACHE_DIR`). The repo has **no `.gitignore` on this branch** (listing + `git check-ignore` negative), so an in-repo cache dir would risk being committed; add `data/packs/** linguist-generated=true` / `diff=false` to `.gitattributes` beside the existing `data/wordlist*.json` lines.

### Pattern 1: Pack format, manifest, version

`data/packs/<id>/c00.json …`: NDJSON `{"w","z","p"}` sorted by `w` (code-point order), equal-count chunks (≈ 24,000 entries ⇒ ~1.3 MB, like today's 10 × ~1.3 MB); `chunks = ceil(n/24000)`. Measured raw sizes after R0-R3 (before AI): chewing 6.94 MB, mcbopomofo 7.66 MB, vanguard-tw 3.42 MB ≈ **18.0 MB** (+13 MB v0.96); gzip ratio ≈ 4.7× (`wordlist-c00.json` 1,334,756 → 282,893 B). Compact JSON separators (`,` `:`), `ensure_ascii=False`, `\n` terminator, **no timestamps** so builds are byte-reproducible.

`meta.json` (planner may add fields): `{id, name, description, version, hash, entries, chunks, sources:[{id, repo, commit, licence_spdx}], licence, rules_version, gray_pending, judged_with, built}`. `version` = `<rules_version>.<first 10 hex of sha256 over all chunk bytes>`: any content change (including an AI pass) changes it automatically (LEX-06); rewrite `meta.json`/`built` only when the hash changed so re-runs leave the tree clean.

`data/packs/index.json`:
```json
{ "schema": 1, "default": "v096",
  "packs": [
    { "id": "v096", "name": "v0.96 現行詞庫", "description": "目前網站使用的詞庫（較大，含較多冷僻詞）",
      "entries": 233713, "meta": "data/wordlist-meta.json", "chunkPattern": "data/wordlist-c{NN}.json", "legacyCache": true },
    { "id": "chewing", "name": "新酷音詞庫", "description": "輸入法常用詞，偏日常口語",
      "entries": 0, "meta": "data/packs/chewing/meta.json", "chunkPattern": "data/packs/chewing/c{NN}.json" } ] }
```
(`entries` filled by the build.) The manifest carries no versions: each pack's version is read from its own meta at load time, exactly like today, so the existing cache tests that stub `data/wordlist-meta.json` keep working.

### Pattern 2: v0.96 stays where it is

Do **not** move or rename `data/wordlist-c00..c09.json` / `wordlist-meta.json`. Reasons: (a) `tests/helpers.mjs` `stubWordlist` routes `/\/data\/wordlist-c0\d\.json(\?.*)?$/`, `tests/wordlist-cache.spec.mjs` routes the same plus `wordlist-meta.json`, `tests/ai-fill.spec.mjs` reads `data/wordlist-c0${i}.json` from disk; (b) existing users' IndexedDB cache is keyed by numeric chunk keys + `'ver'` and matched against `wordlist-meta.json.version` (`{"version": "2026-05-11T09:51:32Z", "chunks": 10, "total": 233713}`) — leaving all of it alone means **zero re-download and zero risk** for people who never touch the setting; (c) no 13 MB duplicate. The v096 manifest entry simply points at the existing files and has `legacyCache:true`.

### Pattern 3: Per-pack IndexedDB keys in the same `wl` store

Current code (verified): reads `st.get('ver')` and `st.get(i)` for `i < WORDLIST_CHUNKS`; writes with `st.delete(IDBKeyRange.bound(0, 1e9)); chunks.forEach((c, i) => st.put({ k: i, v: c })); st.put({ k: 'ver', v: ver });` [VERIFIED: js/wordlist.js:23-24, 50-52] and `const WORDLIST_CHUNKS = 10;` [VERIFIED: js/state.js:21].

Design: legacy pack unchanged. Other packs use **string** keys `p:<id>:ver`, `p:<id>:0…`, plus a registry record `p:index` = `[{id, ver, t}]` (LRU by `t`). IndexedDB orders numbers before strings, so `IDBKeyRange.bound(0, 1e9)` can never touch `p:` keys and a pack's own keys are deleted with `IDBKeyRange.bound('p:<id>:', 'p:<id>:￿')` `[ASSUMED: W3C IndexedDB key ordering; add a test that proves it in Chromium]`. One readwrite transaction per swap: delete this pack's old keys → put new chunks + ver → update `p:index` → evict any pack beyond "active + 1 other" (legacy counts as one pack: eviction = delete numeric range + `'ver'`). Never `clear()` (it would wipe the `backups` store sharing the DB). Make `_idbReadCache` / `_idbReplaceAll` take `{keyOf, chunkCount}` instead of the global constant; `chunkCount` comes from the pack's `meta.chunks` (the cache tests' stub meta already says `chunks: 10`); when meta is unreachable the default pack falls back to `WORDLIST_CHUNKS`.

### Pattern 4: Switching sequence (and the race)

1. Validate the stored id against the manifest **and** `^[a-z0-9-]{1,32}$` before using it in any URL/IDB key (unknown → default pack, silently, keep the stored value untouched).
2. On user switch: `lhSet('lh:lexiconPack', id)`; bump a load generation `_wlGen++`; set `wordlistData = null`, `wordPriorityMap = new Map()`, `wordPhoneticMap = new Map()` (both are `let`, [VERIFIED: js/state.js:11-12,20]); clear the AI pools exactly as `search.js:119` does (`suggestedPool.clear(); sentCandidatesSet.clear(); cumulativeCandidates = []; _aiEpoch++`); `window.__hoyunWordlistReady = loadWordlist()`; when it resolves re-run the last search if `lastSearchInput` is set; show 「詞庫載入中…」.
3. A load whose generation is stale must **not publish** `wordlistData` or fill the Maps (but may still finish its cache write — keys are per pack).
4. Overrides: `applyWordlistOverrides` already runs on every load; add a de-dup so an `added` word already present in the active pack is not pushed twice (today it blindly pushes, which would duplicate candidates once rescued words exist in several packs).
5. `loadWordlist()` currently early-returns when `wordlistData !== null`; the switch path must null it first, as above.

### Pattern 5: UI

Pack list in the 偏好設定 dropdown (`#settingsOverlay`, js/search-ui.js `toggleSettings`): radio list built from the manifest with `textContent` (never `innerHTML`), showing name, `entries` formatted, one-line description; About dialog (`#aboutOverlay`) gets a 「詞庫來源」 block that lazily fetches `NOTICE.txt` of the active pack and renders it in a scrollable `<pre>` via `textContent`. Pack names/descriptions must be musician-plain, e.g. 「新酷音詞庫 — 輸入法常用詞，偏日常口語」, 「小麥注音詞庫 — 輸入法詞庫，成語與生活用語較多」, 「唯音台灣詞庫（精簡版）— 唯音詞庫中不含教育部辭典的部分」.

### Anti-Patterns to Avoid
- **Treating OpenCC `TWPhrases` keys as a China-only blacklist** (deletes 支持/設備/用戶…).
- **Using `STCharacters` keys as "simplified"** without subtracting Taiwan sets.
- **Moving v0.96 files or changing its cache keys** (breaks tests and users' caches).
- **Fetching reports at runtime** or putting them under `data/`.
- **Committing raw downloads** or storing them inside the repo tree.
- **Calling AI inside tests** or letting the build depend on a key being present.
- **Timestamps / unordered dicts in outputs** (non-reproducible packs bloat git history: each rebuild adds ~18 MB of new blobs; the repo's recommended ceiling is 1 GB).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Taiwan charset membership | A hand-typed rare-char list | MOE 4,808 + 6,343 lists (pinned) ∪ stdlib `codecs` Big5 | Variant forms (推薦, 舖, 癡…) are the trap; two independent official sources cover them |
| Simplified/Traditional tables | Own mapping | OpenCC `STCharacters` / `TSCharacters` (Apache-2.0) | 4k+5k entries maintained upstream |
| Mainland→Taiwan term table | Own list from memory | OpenCC `TWPhrases` **plus the frequency guard** | Starting point only; guard is the part you must add |
| Content hashing / versions | Date-based version strings | `hashlib.sha256` over chunk bytes | Deterministic, auto-invalidating |
| HTTP fetch + retries | A custom client | `urllib.request` with sha256-verified pins and explicit timeouts | No dependency; integrity from the pin |
| Rate-limit handling | Fixed sleeps | Honour `Retry-After` / `retryDelay` exactly like `parseRetryAfterMs` in worker/src/ai.js:89-102 | Free limits are volatile |
| IDB cache swap | A new store/DB | Existing `wl` store via `lhIdbOpen()` and the one-transaction pattern | Single DB opener is a Phase 1 invariant; backups share the DB |
| Storage keys | Raw `localStorage` | `lhGet`/`lhSet` + `LH_KEYS` | `tests/scan.spec.mjs` enforces it |
| Test runner for Python | Custom harness | stdlib `unittest`, wrapped by a Playwright spec | `npm test` stays the single entry |

**Key insight:** the data is already mostly clean; the value of this phase is *discipline* — pinned inputs, licence gate, conservative rules with a frequency guard, reproducible output, a rescue path — not clever NLP.

## Runtime State Inventory

This phase adds data and a loader; it does not rename anything. Still, the "what still carries the old state" question applies to the v0.96 default:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Users' IndexedDB `wl` store holds numeric chunk keys `0..9` + `'ver'` for the v0.96 lexicon | **None** — design keeps those keys and meaning for the default pack (code edit only) |
| Live service config | None — no external service stores pack ids | None |
| OS-registered state | None | None |
| Secrets/env vars | New optional `GEMINI_API_KEY` / `LEX_AI_URL` env for the offline judge only; never committed | Document in tool README; add to TEST-CHECKLIST 「待 Andy」 |
| Build artifacts | Nothing installed; raw cache `~/.cache/lucky-hawaii/lexicon/` is disposable | None |

New localStorage key `lh:lexiconPack` (group `setting`): existing users simply lack it (= default). No migration step is required; bump the key count in the two tests that assert 17 (see Pitfall 10).

## Common Pitfalls

### Pitfall 1: OpenCC `TWPhrases` is not a China-only list
**What goes wrong:** 320 exact keys hit v0.96 words; the high-frequency ones (支持 9,318, 文件 14,213, 設備 52,875, 用戶 37,886) are ordinary Taiwan words.
**How to avoid:** delete only on exact key match **and** own-source freq < 100; keep otherwise. Sample-test both sides (支持 keep, 阿司匹林 delete).
**Warning signs:** deletion report's top removed words by `p` contain household words.

### Pitfall 2: `STCharacters` keys include legitimate Taiwan forms
**What goes wrong:** 峰 床 群 秘 灶 … are keys; also real Taiwan-valid 庄 厘 祢 疱 咤 咏.
**How to avoid:** subtract MOE ∪ TS keys ∪ Big5, then a committed `char-allow.txt`; report top offending chars.

### Pitfall 3: MOE lists alone mis-flag variants
推薦 (薦), 舖, 癡, 艷, 曬, 樑 are outside the 4,808/6,343 lists but are in Big5 and in everyday Taiwan text. Use the union (449 flagged vs 1,215).

### Pitfall 4: Non-BMP characters break JS length matching
`𰻞𰻞麵`, `𨑨迌`, `腳𧿹趾` have `length` ≠ syllable count in JS. R0 drops them; add a pack invariant "every char is BMP".

### Pitfall 5: Reading choice and tone sandhi
Multi-reading words need one `z`. The new packs will show `ㄧ ㄒㄧㄚˋ` where v0.96 shows `ㄧˊ ㄒㄧㄚˋ`. Harmless for rhyme (tones stripped), visible only in the reading display; document it in the report and the TEST-CHECKLIST so Andy is not surprised.

### Pitfall 6: Source parsing traps
`tsi.csv` has `#` header lines, single characters and stray tone lines; McBopomofo `phrase.occ` is space- not tab-separated (docs say TAB); `BPMFMappings` has no frequency; non-Han entries (`一九九○`, `菜々子`, `哆啦Ａ夢`) must be dropped by R0.

### Pitfall 7: The required "delete" samples are not in any source
聚乙烯醇縮丁醛 and 分散式雜湊表 occur in none of tsi.csv / BPMFMappings / Vanguard / v0.96 (only the shorter 雜湊, 雜湊化, 聚乙烯, 聚乙烯醇 exist). A test that expects them to be *removed from a pack* cannot pass. The sample test must feed synthetic evidence rows (`sources=1`, `freq=0`) through the same `classify()` + judgments path. 三酸甘油酯 is real: McBopomofo only (`phrase.occ`: 3) → gray → judgments `K`; v0.96 even has the different spelling 三酸甘油脂.

### Pitfall 8: AI quota assumptions
Free-tier numbers changed at least twice (Dec 2025, Apr 2026) and could not be verified from the container. Never hard-code a limit; resumable + hard cap + 429 handling.

### Pitfall 9: Worker proxy competes with live users
See AI section (b). If used, run off-peak and cap.

### Pitfall 10: Hard-coded counts in existing tests
`tests/scan.spec.mjs:69-70` (`expect(keys).toHaveLength(17); expect(new Set(keys).size).toBe(17);`) and `tests/storage.spec.mjs:141` (`expect(Object.keys(list[0].data)).toHaveLength(17);`) plus the comment `// 以 AST 掃描驗證過的 17 個固定鍵` in `js/safety.js:8` must all go to 18 when `lh:lexiconPack` is added. Also `tests/storage.spec.mjs` `FIXTURE` includes every key; check it.

### Pitfall 11: Tests route only the default pack URLs
`stubWordlist` and `wordlist-cache.spec.mjs` match `/data/wordlist-c0\d.json`. Pack chunk URLs (`data/packs/<id>/c00.json`) are not matched, so browser tests for non-default packs need a new helper (`stubPack(context, id, ndjson, meta)`); and a fixture manifest must be routable so tests do not depend on the 18 MB real packs.

### Pitfall 12: IDB `clear()` / shared DB
The `wl` store and `backups` share `lhIdbOpen()`'s DB; only range-delete the pack's own keys.

### Pitfall 13: Stale load publishing after a switch
Use the generation counter (Pattern 4). Test: switch A→B while A is still downloading; assert `wordlistData` is B's.

### Pitfall 14: `overrides.added` duplicates
Rescued words added once end up in every pack; without de-dup candidates repeat. Also note `fixed`/`removed` apply to **all** packs by design (B5).

### Pitfall 15: Simplified Chinese inside shipped legal text
`LICENSE-CHS.txt`/`LICENSE-CHT.txt` in the Vanguard repo state the legal text is Simplified. Ship only English licence texts + a Traditional Chinese frame. Add a build check that rejects any shipped text file containing `ST`-only characters.

### Pitfall 16: Reproducibility
Sort everything (by code point), fixed chunk size, seeded sample selection (`random.Random(f'{id}:{version}')`), no clocks in outputs, `meta.built` rewritten only when the hash changes. Otherwise every run dirties ~18 MB.

### Pitfall 17: Licence drift and legal ambiguity
`libchewing-data` moved to Codeberg; tsi.csv's header is the only licence statement; LGPL-2.1 §2(a) ("must itself be a software library") and CC BY-ND "adaptation" are unsettled for data. Gate on the header, keep NOTICE explicit, and surface both questions to Andy (Open Questions).

## Code Examples

### Rule engine core (illustrative; Python ≥ 3.9)
```python
# 規則順序：保留清單 → R0 格式 → R1 簡體 → R2 罕用字 → R3 中國用語 → 單一來源轉灰色
def classify(w, z, ev, ctx):
    """回傳 (decision, rule)；decision ∈ keep | delete | gray。ev = {'n': 來源數, 'freq': 本來源詞頻}"""
    if w in ctx.keep_allow and ctx.format_ok(w, z):
        return 'keep', 'K0-allowlist'
    bad = ctx.format_error(w, z)          # NFC、BMP、長度 2..11、注音音節數相等
    if bad:
        return 'delete', 'R0-' + bad
    for c in w:
        if c in ctx.char_allow:
            continue
        if c in ctx.simp_only:            # STCharacters 鍵 − MOE − TS 鍵 − Big5
            return 'delete', 'R1-simplified'
        if c not in ctx.taiwan_chars:     # MOE 常用 ∪ 次常用 ∪ Big5
            return 'delete', 'R2-rare-char'
    if w in ctx.china_terms and ev['freq'] < ctx.china_freq_min:
        return 'delete', 'R3-china-term'
    if ev['n'] == 1:
        return 'gray', 'G-single-source'
    return 'keep', 'K1-multi-source'
```

### Judgment resolution
```python
def resolve(w, decision, rule, judgments, keep_allow):
    if decision != 'gray':
        return decision, rule, False
    if w in keep_allow:
        return 'keep', 'K0-allowlist', False
    v = judgments.get(w)                       # 'K' | 'D' | None
    if v == 'D':
        return 'delete', 'R5-ai-incomprehensible', False
    return 'keep', rule, v is None             # 第三個值 = 待 AI 判斷（報告計數）
```

### Removed-list line (carries what a rescue needs)
```json
{"w":"阿司匹林","z":"ㄚ ㄙ ㄆㄧˇ ㄌㄧㄣˊ","p":0,"rule":"R3-china-term","reason":"中國用語（台灣作「阿斯匹靈」）","src":["vanguard-tw"],"n":1}
```
A Phase 7 rescue is then literally `{"w":…,"z":…,"p":…}` appended to `overrides.added` (the existing schema: `"added": []` of objects with `w`, `z`, optional `p`, [VERIFIED: data/wordlist-overrides.json:15 and js/wordlist.js `a.p ?? 1`]); the pipeline additionally reads `overrides.added[].w` and `tools/lexicon/rules/keep.json` as an implicit allowlist so the word survives the next rebuild.

### Recorded provider + sample test (deterministic)
```python
class RecordedProvider:
    """測試用：只讀固定檔，不連網；找不到的詞回 None → 當作待判斷"""
    def __init__(self, table): self.table = table
    def judge(self, words): return {w: self.table.get(w) for w in words}

# tests/samples.tsv 欄位：詞 / 注音 / 來源數 / 詞頻 / 預期 / 說明
# 三酸甘油酯  ㄙㄢ ㄙㄨㄢ ㄍㄢ ㄧㄡˊ ㄓˇ  1  3  KEEP    （小麥注音獨有 → 灰色 → 錄製判斷 K）
# 聚乙烯醇縮丁醛 …                         1  0  DELETE  （合成證據列；錄製判斷 D）
# 分散式雜湊表   …                         1  0  DELETE
# 支持        ㄓ ㄔˊ                       3  9318 KEEP   （在 TWPhrases 但詞頻高 → 不刪）
# 阿司匹林    …                            1  0  DELETE  （R3）
# 电脑        …                            2  50 DELETE  （R1 簡體）
# 㹴犬        …                            1  0  DELETE  （R2 罕用字）
# 客家庄      …                            2  12 KEEP    （char-allow 庄）
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| One 233k lexicon of mixed provenance (vChewing + MOE-derived + libchewing) | Several independently licensed, independently cleaned packs | This phase | Licence-clean packs; comparison by writing real lyrics |
| libchewing-data on GitHub | Archived 2026-03-24, moved to Codeberg | 2026-03-24 | Pin the GitHub snapshot now; future updates need Codeberg access |
| `scripts/build_wordlist.py`, `merge_corelib.py` (unpushed) | Fresh `tools/lexicon/` | This phase | Reproducible from pinned inputs |
| Free Gemini daily quotas generous (2025) | Cut 2025-12-06 and 2026-04 (third-party reports) | 2025-12 / 2026-04 | Design for low RPD: resumable batches |

**Deprecated/outdated:** `McBopomofo/Source/Data/data.txt` is a *generated* file (not in git) — use `BPMFMappings.txt` + `phrase.occ`; the vChewing README says the Makefile no longer builds all targets — do not try to build their Swift tool, parse the text components.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A cleaned *data* derivative of LGPL-2.1 data may be published as LGPL-2.1-or-later data on a static site despite §2(a) "must itself be a software library" | Source Licence Verdicts | Low-medium; mitigate with explicit NOTICE; Andy may want a lawyer-free sanity decision |
| A2 | Excerpting/filtering CC BY-ND (MOE) headwords counts as an adaptation, so MOE stays out | Source Licence Verdicts | If MOE actually permits it, a useful signal is forgone (low cost) |
| A3 | Taiwan copyright law excludes MOE official character tables from protection | Verdicts | None while the lists are used only as a filter |
| A4 | libchewing's tsi lineage traces to libtabe, so adding the TaBE notice to the `chewing` pack is appropriate | Verdicts | Extra notice is harmless |
| A5 | Gemini free-tier limits (Flash-Lite ~15 RPM / ~1,000-1,500 RPD; Flash ~10 RPM / ~250-500 RPD; Dec 2025 and Apr 2026 cuts) | AI section | Wrong numbers only change how many runs are needed; design is limit-agnostic |
| A6 | `gemini-3.5-flash-lite` is available on the free tier today | AI section | Script must take `--model`; fall back to Worker registry models |
| A7 | ~1.2 tokens per CJK character for token estimates | AI section | ±50 % on a number far below limits |
| A8 | IndexedDB orders numeric keys before string keys so `bound(0,1e9)` never matches `p:` keys | Pattern 3 | Pack keys could be deleted by a legacy swap; a Chromium test must prove it |
| A9 | Taiwan usage of 疱疹 / 祢 / 咤 / 咏 justifies the `char-allow` seed | Rule layer | Wrong allowances keep a few rare words; trivially reversible |
| A10 | Andy's Mac can run Python ≥ 3.9 | Standard Stack | Tool would need a Node port (unlikely) |

## Open Questions

1. **The shipped default pack contains CC BY-ND (MOE) content — what is the policy?**
   - Known: 150,497 of v0.96's 233,713 words are in vChewing's MOE component; the site is already live with it; MOE's licence forbids derivatives.
   - Unclear: whether headword/reading lists count as 改作; whether MOE would clarify in writing.
   - Recommendation: keep v0.96 as default until Phase 12 as decided (A4), write the honest NOTICE with the CC BY credit, add a 「待 Andy 決定」 item (optionally email NAER onile@mail.naer.edu.tw), and make Phase 12's official lexicon built only from INCLUDE sources.
2. **LGPL-2.1 data derivative (A1).** Recommendation: proceed with explicit NOTICE; list as 06-CTX decision for Andy.
3. **AI provider for the real pass.** Recommendation: direct Gemini key on Andy's Mac (`GEMINI_API_KEY=… npm run lexicon:judge`), Worker adapter as fallback. Needs Andy to supply a key or approve the Worker route (Worker not deployed yet).
4. **Should `--gray-policy=P2` be on?** Recommendation: off by default (LEX-04 mandates only single-source); revisit after Andy reads the first deletion report.
5. **Third pack `vanguard-tw`: worth it?** It is the cheapest (3.4 MB) and gives Andy the non-MOE vChewing view, but may be dropped for scope without affecting LEX-01 ("several" is satisfied by two). Recommendation: include.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python 3 | Build tool + tests | ✓ | 3.11.15 | — (keep ≥ 3.9 compatible for Andy's Mac) |
| Node | Playwright tests | ✓ | v22.22.0 | — |
| `@playwright/test` | `npm test` | ✓ | 1.63.0 | — |
| git (HTTPS clone / `ls-remote`) | Pin discovery | ✓ | — | raw URLs by commit |
| raw.githubusercontent.com | Fetching pinned sources | ✓ | HTTP 200 (all pins) | — |
| api.github.com | (not needed) | ✗ | 403 | use raw + `git ls-remote` |
| codeberg.org | Future libchewing-data bumps | ✗ | CONNECT 403 | GitHub snapshot pinned |
| language.moe.gov.tw, ai.google.dev, docs.github.com | Docs only | ✗ | egress-blocked | search-result summaries (tagged `[CITED]`, secondary) |
| Gemini API key | Real AI pass | ✗ | — | Recorded provider; packs ship with gray kept + 「待 AI 判斷」 |
| Deployed Worker (`/ai`) | Optional AI route | ✗ | Phase 2 deploy pending on Andy | direct Gemini key |

**Missing dependencies with no fallback:** none (the AI pass is explicitly allowed to be deferred by C4).
**Missing dependencies with fallback:** AI key / Worker → packs built with unjudged gray words kept.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright Test 1.63.0 (`"@playwright/test": "1.63.0"` [VERIFIED: package.json]) for browser + wrapper specs; stdlib `unittest` (Python) for the pipeline |
| Config file | `playwright.config.mjs` (`testDir: 'tests'`, static server `node tests/serve.mjs`, `timeout: 60_000`) |
| Quick run command | `python3 -m unittest discover -s tools/lexicon/tests && npx playwright test tests/lexicon-build.spec.mjs tests/lexicon-packs.spec.mjs` |
| Full suite command | `npm test` (currently ~270+ tests, golden must stay unchanged) |
| Offline verify of committed packs | `python3 tools/lexicon/build.py verify` (reads `data/packs/**`, no network, a few seconds) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LEX-01 | lock file valid; sha256 + licence-evidence gate; allow-list of SPDX ids; `redistribute:false` source never in a pack; each pack has NOTICE with SPDX + commit + modification statement + LICENSE text; NOTICE/LICENSE contain no Simplified-only chars | unit + invariant | `python3 -m unittest tools.lexicon.tests.test_sources tools.lexicon.tests.test_notice` | ❌ Wave 0 |
| LEX-07 | pack files are `{w,z,p}` NDJSON, sorted, chunk count = `meta.chunks`, entries = `meta.entries`, manifest lists every pack dir; selector shows name/count/description; switching reloads and re-runs the search; AI suggestions come from the new pack | unit + browser | `npx playwright test tests/lexicon-packs.spec.mjs` | ❌ Wave 0 |
| LEX-02 | rule unit tests (simplified, rare, China-term with freq guard, allow-list, BMP, syllable count); **invariant over committed packs: zero entries with any char ∉ allowed set, none in `simp_only`, no non-BMP, no duplicate `w`** | unit + invariant | `python3 tools/lexicon/build.py verify` + unittest | ❌ Wave 0 |
| LEX-03 | `samples.tsv` rows through `classify()` + `RecordedProvider`: 三酸甘油酯 keep; 聚乙烯醇縮丁醛, 分散式雜湊表 delete; ≥ 12 more incl. 支持 keep, 阿司匹林 delete, 电脑 delete, 㹴犬 delete, 客家庄 keep | unit (deterministic) | `python3 -m unittest tools.lexicon.tests.test_samples` | ❌ Wave 0 |
| LEX-04 | single-source → gray, never delete; batching sizes; token estimate printed; hard cap exits non-zero; resume after simulated crash; malformed/missing provider output → unjudged-kept + counted; `D` + keep-allowlist → keep; pack builds with zero key present | unit (recorded + faulty fake providers) | `python3 -m unittest tools.lexicon.tests.test_judge` | ❌ Wave 0 |
| LEX-05 | every removed word has `rule` + `reason`; `kept + removed == source_total`; report counts per rule; ≥ min(20, n) deterministic samples per rule (seeded); `removed.ndjson` rows convertible to overrides `added`; word in `keep.json` or `overrides.added` survives a rebuild | unit + invariant | `python3 -m unittest tools.lexicon.tests.test_report` | ❌ Wave 0 |
| LEX-06 | version = content hash; a changed pack version replaces only that pack's cache; legacy numeric keys for the default pack preserved; switching never mixes chunks (missing chunk → whole pack discarded); cache LRU keeps ≤ active + 1; stale load after switch does not publish | browser | `npx playwright test tests/wordlist-cache.spec.mjs tests/lexicon-packs.spec.mjs` | extend existing + ❌ |
| (guard) | golden unchanged, scan/storage specs updated to 18 keys, `?v=` tags consistent | existing | `npm test` | ✅ (edit counts) |

### Sampling Rate
- **Per task commit:** the quick run command (fixture-based, offline, < 30 s).
- **Per wave merge:** `npm test` (full) + `python3 tools/lexicon/build.py verify`.
- **Phase gate:** full suite green, golden diff empty, `build.py all` re-run is a no-op (`git status` clean ⇒ reproducibility).

### Wave 0 Gaps
- [ ] `tools/lexicon/` scaffold + `tests/` + tiny fixture sources (mini `tsi.csv`, `BPMFMappings`, vanguard files, OpenCC/char-list stubs) so the whole pipeline runs offline in tests.
- [ ] `tests/lexicon-build.spec.mjs` — Playwright wrapper executing the Python unit tests (so `npm test` covers C5 as required).
- [ ] `tests/lexicon-packs.spec.mjs` + helper `stubPack()` / fixture manifest in `tests/helpers.mjs`.
- [ ] `tests/fixtures/lexicon/` recorded judgments + `samples.tsv` + `calibration.tsv`.
- [ ] Update count assertions 17→18 (`tests/scan.spec.mjs:69-70`, `tests/storage.spec.mjs:141`) and `js/safety.js` comment.
- [ ] `.gitattributes` lines for `data/packs/**`.
- Manual-only (justified): real-AI calibration agreement (needs a key) and Andy's spot-check of the deletion report / lyric-writing comparison — both already listed under the phase Human check.

## Security Domain

`security_enforcement` is enabled (ASVS level 1).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — (no accounts) |
| V3 Session Management | no | — |
| V4 Access Control | partial | Worker `/ai` has no auth by design (Origin only affects CORS); the offline script must respect its limiter and never be pointed at the admin routes |
| V5 Input Validation | **yes** | Pack id from localStorage/manifest validated against the manifest and `^[a-z0-9-]{1,32}$` before building URLs/IDB keys; pack JSON parsed with `JSON.parse` only; names/descriptions/NOTICE rendered with `textContent`; build parsers reject malformed lines (R0) |
| V6 Cryptography | partial | `hashlib.sha256` for pins/versions; never custom crypto |
| V8 Data Protection | partial | `GEMINI_API_KEY` only from env, never written to files/logs/judgments; no user data in the pipeline |
| V12 Files & Resources / V14 Config | **yes** | HTTPS-only downloads with size caps and sha256 verification; cache dir outside the repo; no secrets in `sources.lock.json` |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Upstream data tampering / moving branch | Tampering | Pin by commit SHA **and** sha256; licence-evidence re-check at fetch |
| Prompt injection through lexicon words sent to the LLM | Tampering | Words only in a delimited data block; strict `N K|D` output parser; unparsable → unjudged (kept) |
| Licence contamination (BY-ND / BY-SA data slipping in) | Legal | `redistribute` flag + SPDX allow-list test; MOE and CC-CEDICT/Wikipedia excluded |
| Path/URL injection via stored pack id | Tampering | Allow-list + regex before use in `fetch()` / IDB key |
| XSS via pack metadata / NOTICE | Tampering | `textContent`, never `innerHTML`; NOTICE is repo-controlled static text |
| API key leakage in logs or commits | Information disclosure | Env-only key; redact like `logFailure` in worker/src/ai.js; judgments file has no key |
| Burning the live site's free AI quota | Denial of service (self) | Direct key by default; Worker route throttled ≤ 10 req/min with `--max-requests` |

## Sources

### Primary (HIGH confidence — read or executed this session)
- `chewing/libchewing-data` @ c44e81aef24b…: `dict/chewing/tsi.csv` header (LGPL-2.1-or-later, 2025.11.17), `word.csv`, README, CMakeLists (project version 2026.3.22); repo page (archived 2026-03-24, Codeberg)
- `chewing/libchewing` @ 3c4a93aa…: `COPYING` (LGPL-2.1 text, §2 a/b), `.gitmodules`
- `openvanilla/McBopomofo` @ be6564ac…: `LICENSE.txt`, `Source/Data/README.md`, `AGENTS.md`, `BPMFMappings.txt`, `phrase.occ`, `BPMFBase.txt`, `ACKNOWLEDGEMENTS.md`
- `vChewing/libvchewing-data` @ d41f2fc2…: `README.MD`, `LICENSE.txt`, `LICENSE-CHT.txt`, `phrases-{vchewing,tabe,moe,custom}-cht.txt` headers
- `BYVoid/OpenCC` @ 3ac34aa4…: `STCharacters.txt`, `TSCharacters.txt`, `TWPhrases.txt`, `LICENSE`
- `zispace/hanzi-chars` @ 6970aa7e…: Taiwan 常用 / 次常用 lists (+ absence of a LICENSE file)
- `g0v/moedict-data` README (MOE copyright note, MOE's interpretation, CC0 for conversion)
- `nodejs/node` `LICENSE` section `COPYING.libtabe` (TaBE / Academia Sinica BSD-3 text)
- Repo files read: `js/wordlist.js`, `js/state.js`, `js/safety.js`, `worker/src/ai.js`, `worker/src/models.js`, `worker/wrangler.toml`, `data/wordlist-meta.json`, `data/wordlist-overrides.json`, `tests/helpers.mjs`, `tests/wordlist-cache.spec.mjs`, `tests/scan.spec.mjs`, `tests/storage.spec.mjs`, `playwright.config.mjs`, `package.json`
- `github/docs` `github-pages-limits.md` (raw): source repo recommended ≤ 1 GB; published site ≤ 1 GB; deployments time out after 10 min; soft 100 GB/month bandwidth; soft 10 builds/hour

### Secondary (MEDIUM confidence)
- Web search results (2026-10-04): MOE public-licence page and dictionary download pages state 「創用CC-姓名標示-禁止改作 3.0 臺灣」 (site blocked from the container; search snippets only); GitHub Pages limits page; libtabe licence (BSD) summaries

### Tertiary (LOW confidence — marked for validation)
- Gemini free-tier limits and the Dec 2025 / Apr 2026 cuts: third-party blogs/search summaries only (tinkerllm.com, aipromptshub.co, apiyi.com, tokenmix.ai, aifreeapi.com); official page unreachable
- 100 MiB per-file git push limit (general GitHub knowledge, docs.github.com blocked) `[ASSUMED]`; pack chunks are ~1.3 MB so it is not a practical constraint

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — stdlib only; Python 3.11 / Node 22 / Playwright 1.63.0 present and read from the repo.
- Source licences and pins: HIGH for the three INCLUDE sources (header / LICENSE text read at the pinned commits); MEDIUM for the MOE verdict (official page unreachable; consistent across vChewing README, moedict README and search results).
- Rule layer volumes: HIGH — measured on the pinned files (sets, rules, sizes); exact numbers will move when pins change, so tests must assert invariants/ranges.
- Architecture (loader/IDB): HIGH on current code behaviour (read in full); MEDIUM on IDB key-order assumption A8 (needs one proving test).
- AI quota: LOW-MEDIUM — design is limit-agnostic on purpose.
- Pitfalls: HIGH — most were observed in the data or the existing tests.

**Research date:** 2026-10-04
**Valid until:** ~30 days for licences/pins (re-run `git ls-remote` before relying on SHAs after that); 7 days for Gemini free-tier numbers.

## RESEARCH COMPLETE
