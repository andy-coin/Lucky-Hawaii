# Technology Stack

**Project:** 好韻器 Lucky Hawaii (stabilization milestone, Active requirements only)
**Researched:** 2026-10-03
**Scope:** Lexicon sourcing and cleaning, free-LLM reliability, splitting `index.html` with no build, small-library decisions. The existing system is not re-researched.
**Overall confidence:** MEDIUM-HIGH. Lexicon numbers come from running a prototype on the real downloaded files, so they are measured, not guessed. LLM limits come from official docs where the docs publish them. Gemini free-tier quotas are not published outside AI Studio and rest on third-party reports.

**Confidence note.** The GSD `classify-confidence` seam rates the generic `websearch` and `webfetch` providers LOW even when verified. I upgraded a finding only when I read a primary source myself: raw repo files via curl, the official docs `.md.txt` pages, or the npm and PyPI registries. Each row below carries its own tag.

---

## 0. Findings that change the roadmap (read first)

| # | Finding | Evidence | Confidence |
|---|---------|----------|------------|
| 1 | **GitHub Models is dead.** It was fully retired 2026-07-30 (playground, catalog, inference API, BYOK). `models.inference.ai.azure.com` hard-fails. The default model `'gpt-4.1'` hard-coded in `index.html` (lines ~4479, 4487, 4997, 5187, 5302) was a GitHub Models id. | docs.github.com/en/github-models states "As of July 30, 2026, GitHub Models has been fully retired". The GitHub changelog and several blog posts agree. | HIGH |
| 2 | **Groq `qwen/qwen3.6-27b` was shut down 2026-09-14**, and the `LLM_MODELS` list still uses it. Replacement: `qwen/qwen3.8-27b`. Llama 3.1 8B and 3.3 70B left the free tier 2026-08-16. | console.groq.com/docs/deprecations (table row quoted verbatim), plus klymentiev.com (Sept 2026). | HIGH (deprecation), MEDIUM (free-tier removal) |
| 3 | **The fallback chain is switched off in code.** Every entry in `LLM_MODELS` has `autoFallback: false`, so `tryList` contains at most the one selected model. The `catch (e) { /* 嘗試下一個 */ }` blocks swallow every error. A stale `selectedModel` in localStorage pointing at a dead model gives silent failure. This is the likely root cause of "常失敗／沒回應". | Read directly from `index.html` ~4448-4456 and ~4994-5030. | HIGH |
| 4 | **Gemini 3.x thinking tokens can eat `maxOutputTokens`.** The Worker sends `maxOutputTokens: 2048` and no thinking config. `gemini-3.7-flash` defaults to medium thinking. Google's docs say a hit limit during reasoning returns an `incomplete` status with truncated or empty output. This is a probable "no response" cause. | ai.google.dev thinking guide (.md.txt) and the generateContent ThinkingConfig reference. | MEDIUM-HIGH (mechanism documented, not reproduced) |
| 5 | **Groq free TPM counts the declared `max_tokens`**, not the tokens actually generated. The TPM limit is 8K, so one large prompt plus `max_tokens: 4096` can 429 or 413 before running. | Groq rate-limit page (8K TPM) plus multiple GitHub issues and a DEV post describing it. | MEDIUM |
| 6 | **The current 233,713-word list is mostly noise.** About 103k of its words are in neither McBopomofo's curated list nor any corpus count (examples: 丫巴兒, 扯爛污, 緊那羅). Roughly 4,150 words carry simplified-only chars under a naive check (which is buggy, see section 1.5), and 440 carry non-Big5 chars. A rule-based pass cuts it to about 84k auto-keep plus about 23k gray, with no manual review. | Prototype run on the real files (section 1.4). | HIGH (counts), MEDIUM (quality) |
| 7 | **Do not use rime-essay, Rime luna/terra, jieba `dict.txt.big`, or zhwiki as a frequency source.** They are mainland-dominated. In rime-essay, 軟件 has weight 55,503 against 軟體 at 870, and 信息 has 89,682 against 資訊 at 4,672. | Measured on `essay.txt` (442,688 lines). | HIGH |

---

## 1. Lexicon sourcing and cleaning (highest priority)

### 1.1 Source inventory

All sizes were measured by downloading the files on 2026-10-03.

| Source | License (public GitHub Pages OK?) | Size | 3+ char phrases | Pronunciation | Frequency | TW vs PRC | Format | Role |
|--------|----------------------------------|------|-----------------|---------------|-----------|-----------|--------|------|
| **McBopomofo `Source/Data/BPMFMappings.txt`** (repo 3.1.1, 2026-09-02) | Repo MIT. The file derives from libtabe `tsi.src` (BSD) with edits. Permissive, attribution only. OK. | 145,603 lines, 140,017 unique words (2ch 73.8k, 3ch 33.6k, 4ch 29.3k, 5+ 3.3k) | Yes (2-6 chars, 9 max) | Zhuyin per char, multiple readings per word | None in this file | Taiwan IME, curated: the editorial rule says "IME is not an idiom database" and removes rare phrases | `word zhuyin…` space-separated | **Backbone** (the curated candidate set) |
| **McBopomofo `phrase.occ`** | Same repo, MIT | 161,803 lines | Yes | None | **Corpus occurrence count** (的 615,175; 支持 2,510). Config points at `textpool.11262021`. The corpus itself is not documented in the repo. | Taiwan-leaning. TW terms outrank PRC terms (資訊 vs 信息, 網路 5,807 vs 網絡 165). | `phrase<space or tab>count` | **Best single Taiwan-usage signal** |
| **vChewing VanguardLexicon** `phrases-moe/tabe/vchewing-cht.txt` (already in pipeline) | **MulanPSL-2.0** (permissive, keep license text and notices). The `moe` file derives from MOE content (see MOE row). OK with attribution. | moe 160,283 / tabe 62,156 / vchewing 6,573 lines | Yes | Zhuyin | `p` integer. **Caveat:** the `vchewing` own file contains meme values (114514, 100000) for entries such as 呷洨, 原神, 雞掰, 珈琲. Treat `p >= 100000` as "no real frequency". | Mixed: `moe` is the 國語辭典 headword list, `tabe` is libtabe | `word freq zhuyin…` | Source, plus one vote in cross-source counting |
| **libchewing `tsi.csv`** (already in pipeline) | **LGPL-2.1-or-later** (header: `dc:license`). The repo was archived 2026-03-24 and moved to Codeberg, so pin the last snapshot. Public site distribution is OK with notice, but copyleft on data is the least clean option. | 160,462 lines | Yes | Zhuyin | Priority number from usage statistics | Taiwan IME | CSV `term,priority,zhuyin` | Cross-source vote only. Do not use as the sole backbone. |
| **MOE 重編國語辭典修訂本** (`g0v/moedict-data` `dict-revised.json.xz`, 14.7MB xz, 80MB json; MOE site shows version `dict_revised_2015_20260929`) | **CC BY-ND 3.0 Taiwan.** MOE's own interpretation (quoted in the moedict README): the no-derivatives limit applies to the text itself, not to "格式轉換及後續應用". kcwu's conversion work is CC0. Attribution is required. A cleaned headword list with zhuyin falls under "subsequent use", but this is **not legal advice**. Show the MOE attribution on the site. | 161,194 entries (86.6k 2ch, 21.8k 3ch, 35.7k 4ch). Single chars, other lengths: ~17k. | Yes, plus idioms (成語) | Zhuyin and pinyin per heteronym | **None** | Taiwan standard (authoritative) | JSON with `heteronyms[].bopomofo/definitions` | **Validation and classical-marker signal only**, not a ranker |
| **OpenCC dictionaries** `TWPhrases.txt` (825 lines), `TWVariants.txt`, `STCharacters.txt` (OpenCC 1.4.2, 2026-08-22) | **Apache-2.0**, build-time only, never shipped. OK. | Small | Yes (825 phrase pairs) | None | None | `TWPhrases` keys are PRC phrases in traditional chars, values are TW equivalents | tab-separated text | **PRC-term flag** (never a hard drop on its own, see 1.3) |
| **Rime `rime-essay`** (`essay.txt`) | LGPL-3.0 | 442,688 lines | Yes | None | Yes | **Mainland-dominated** (軟件 55,503 vs 軟體 870) | `word<TAB>weight` | **Do not use** |
| **Rime luna_pinyin / terra_pinyin** | LGPL-3.0 | Large | Yes | Pinyin only, no zhuyin | essay weights | PRC-leaning wordlist | YAML | **Do not use** |
| **jieba `dict.txt.big`** | MIT | ~584k | Yes | None | Yes | Mixed, wiki-derived | text | **Do not use** (the repo data is mixed Wikipedia, with simplified-origin terms) |
| **中研院平衡語料庫詞頻 / CKIP lexicon** | Academic, restricted. Redistribution is not open, and `ckip-transformers` is GPL-3.0. | ~80k lexicon | Yes | Yes | Yes | Taiwan | Licensed-resource page (godel.iis.sinica.edu.tw) | **Do not use** (license friction for a public site) |
| **TOCFL 華語八千詞** | **Withdrawn** by the committee from 2021-06-30. Current lists moved to 國教院 coct.naer.edu.tw. Licence and download format not verified. | ~8k | Yes | Zhuyin | Levels only | Taiwan | n/a | Optional "daily core" whitelist, **unverified** (LOW) |
| **Taiwan corpora on Hugging Face** (`botp/yentinglin-zh_TW_c4` 5.18M docs, `erhwenkuo/wikinews-zhtw`, zhwiki) | Mixed. Some are NC (`tw-science-24M` is CC-BY-NC-SA). The `yentinglin/zh_TW_c4` page returned 401 to my fetch. | GBs | n/a | None | Computable by n-gram count | Taiwan-leaning but not pure | parquet / jsonl | **Optional Stage 3 only** (section 1.3). Count words from it; never redistribute the text. |
| **Lyric corpora** | No open-licensed Taiwan-Mandarin lyric corpus was found. Scraped lyrics are copyrighted. | n/a | n/a | n/a | n/a | n/a | n/a | **Do not use** |

**Recommended backbone: McBopomofo `BPMFMappings.txt` + `phrase.occ` (MIT/BSD, curated, Taiwan-leaning counts), cross-voted against vChewing, tsi, and the MOE headword list.** McBopomofo is already the project's character library source (PROJECT.md), and MIT/BSD is the cleanest licence for a public site.

### 1.2 Licence posture for the public site

- Create `data/SOURCES.md` and a short 「資料來源」 section in the app. It lists McBopomofo (MIT, libtabe BSD), vChewing VanguardLexicon (MulanPSL-2.0), libchewing (LGPL-2.1+), and the MOE 國語辭典 attribution wording ("中華民國教育部《重編國語辭典修訂本》", CC BY-ND 3.0 TW).
- libchewing is the only copyleft source. To shed it, drop `tsi.csv` from the vote. McBopomofo, vChewing and the MOE headwords still provide three votes, and the cleaning numbers barely change.
- OpenCC is used only at build time and never shipped.
- Statistics computed from any corpus (counts, thresholds) are facts about the text. Only the final word list is distributed. This is general practice, not legal advice. Say so in the roadmap.

### 1.3 Cleaning strategy: five automated stages, no manual review of 100k rows

The pipeline lives in Python 3.13 stdlib in `scripts/` (already the project's build language). It adds one script, `scripts/clean_wordlist.py`, with no new dependency.

**Stage 0: Union and normalise (zero cost).**
Union of vChewing 3 files + tsi + McBopomofo = **243,508 CJK words** (the existing 233,713 list is a subset of this).
Record per word: set of sources (`vmoe`, `vtabe`, `vown`, `tsi`, `mcb`), max vChewing `p` (ignore `p >= 100000` as meme or non-frequency), and McBopomofo `occ`. The source count measured: 1 source = 106,573 words, 2 = 33,261, 3 = 101,377, 4+ = 2,297.

**Stage 1: Hard rejects (deterministic).**
1. **Non-Big5 characters.** `c.encode('cp950')` fails. This catches simplified-only chars and rare or variant ideographs. It rejected **440 words** (examples: 天疱瘡, 腼腆, 北条, 王襃). The cost is a few legitimate rare-character words, which is acceptable for lyrics.
   **Do not** try to detect simplified chars by looking up `STCharacters.txt` keys on their own. My first attempt flagged 4,151 words, but most were valid traditional chars that also appear as ST keys (吃, 千, 里, 斗, 群). The cp950 test is correct and needs no dictionary.
2. **OpenCC PRC-phrase flag with a Taiwan-corpus gate.** If the word is a `TWPhrases` key whose value differs, **and** McBopomofo `occ <= 5`, reject it. This rejected **205 of 299** flagged words (分區, 分割槽-style terms, 枚舉, 奶酪, 老撾, 前列腺, 屏幕, and so on).
   **Do not** hard-drop all 299. The OpenCC list is over-aggressive for words that Taiwan actually uses: 支持 (occ 2,510), 社區 (1,848), 設備 (1,371), 消息 (1,254), 項目 (1,170), 保存 (1,019), 程序 (876), 打開 (724), 數據 (694). Dropping those would hurt the core value. The corpus count is what separates "PRC-only" from "shared".
3. **Non-CJK, length outside 2-8.**

**Stage 2: Evidence tiers (deterministic, free).**

| Tier | Rule (prototype, measured on the 243,508 union) | Count |
|------|--------------------------------------------------|-------|
| **Auto-keep** | `occ >= 3`, **or** (in >=3 sources **and** vChewing `p >= 50`) | **84,331** (2ch 55,033, 3ch 19,282, 4ch 9,048, 5ch 686, 6ch 282) |
| **Gray** | Not auto-keep; in >=2 sources and (`occ >= 1` or `p >= 10`) | **23,422** (2ch 10,563, 3ch 7,547, 4ch 4,684, 5ch 429, 6ch 199) |
| **Auto-drop** | Everything else (single-source, zero evidence), plus Stage 1 rejects | 135,755 |

Spot checks on lyric-typical idioms: 一見鍾情 (keep, occ 17), 無可奈何 (53), 海闊天空 (22), 刻骨銘心 (10), 愛不釋手 (13), 魂牽夢縈 (4), 心如止水 (3), 天長地久 (8), 一往情深 (3) were all kept. 號啕大哭 landed in gray. 活色生香 and 物是人非 were dropped because each appears in only one source. Real words get lost this way, which is why Stage 5 (feedback rescue) matters.

**Stage 3 (optional, run once, only if the 3+ char count after Stage 2 is judged too low): Taiwan-corpus n-gram evidence.**
Count every Stage 0 candidate as a substring in a Taiwan-leaning corpus (zh_TW_c4 mirror, wikinews-zhtw, PTT/Dcard dumps if a clean source turns up). Use Aho-Corasick (`pyahocorasick` 2.3.1, BSD-3-Clause) or plain `str.count` per word on a sample. No word segmentation is needed. Use the counts to rescue single-source 4-char idioms such as 活色生香 or to confirm gray words. Substring counts over-count words nested in longer words, which is fine for a keep/drop threshold. Cost: CPU hours, zero tokens. I did **not** run this stage, so the corpus choice and licence are the open items (LOW).

**Stage 4: LLM judge on the gray zone only (batched, cheap).**
Input: the gray words (3+ chars only: **12,859**; all lengths: **23,422**). Ask the model to label each word `1` keep or `0` drop with these criteria: everyday Taiwan usage suitable for lyrics; drop proper nouns (人名, 地名, 機構名, as in 蔣緯國 or 力霸集團, which also slipped into auto-keep), drop classical or obscure literary phrases, drop PRC-only usage, drop typos.

Batching: 150 words per call, numbered, output only a comma-separated list of the numbers to drop, with Gemini `responseMimeType: application/json` and a schema of `{drop:[int]}`.

Token estimate (conservative; Traditional Chinese is about 1-1.5 tokens per char):
- Per call: about 400 tokens of instructions plus 150 words at 4-6 tokens each (~900) in, about 100-300 tokens out, so **about 1.5K tokens per call**.
- 3+ char gray only: 86 calls, **about 130K tokens**.
- All gray: 156 calls, **about 235K tokens**.
- With a 2x safety margin: **under 0.5M tokens total**.

That fits well inside one day of the Gemini free tier (hundreds to 1,000 requests per day for Flash-Lite according to third-party reports) or Groq's 1,000 requests per day. At 8K TPM, Groq would need 235K / 8K = ~30 minutes of wall time. Paid-rate equivalent would be cents. Prefer Gemini 3.5 Flash-Lite with `thinkingLevel: "minimal"` or "low" for this job. The judge is a build-time script, so it does not run in the Worker. Run it once, then freeze the result in the repo (`data/lexicon-judgments.json`) so reruns are free.

Also run the **Stage 1 + 2 rules, then the LLM judge, then a 200-word human spot-check** (about 10 minutes) as the only manual step.

**Stage 5: Feedback rescue loop (ongoing, free).**
The existing 回報 to Worker KV 修正層 to periodic write-back flow (PROJECT.md section 4) becomes the long-tail fixer. Drops, adds and PRC flags from users are stored as overrides, and the periodic script folds them into the frozen judgments. This is why the pipeline should output a **reason code per dropped word** (`non-cp950`, `prc-low-occ`, `no-evidence`, `llm-drop-propernoun`, and so on): the admin can see why a word was dropped and one-click restore it.

**Expected result (to be confirmed by running the real pipeline):** about 84k auto-keep plus about half of gray, so roughly 90-100k words, of which about 28-33k are 3+ chars. Today's list has 110k 3+ char entries, but most are classical or proper-noun noise.

**Honest limit on requirement 2b ("增加三字以上、貼近日常與創作語境的詞彙").** Cleaning will **reduce** the count of 3+ char words while raising their quality. None of the open lexicons contains lyric-style daily collocations such as 想你想到睡不著 or 不想放手. If the roadmap wants more 3+ char daily phrases, it needs a corpus-mining phase (Stage 3 extended to n-gram discovery with PMI or left/right entropy over Taiwan text) or an LLM-assisted generation phase, and that phase needs its own research. I flag it as the largest open scope question for the lexicon work.

### 1.4 Prototype evidence (reproducible)

The prototype script sits at `…/scratchpad/proto.py` in the session scratchpad (not committed). Re-implementing it as `scripts/clean_wordlist.py` is the first task of the lexicon phase. Key numbers, all measured 2026-10-03:

- Existing `data/wordlist.json`: 233,713 entries. Length counts: 2ch 123,725; 3ch 52,189; 4ch 51,372; 5ch 4,285; 6+ ~2,100.
- Overlap of existing list with McBopomofo mappings: 130,361 in both; 103,352 only in the existing list; 9,656 only in McBopomofo.
- McBopomofo words by `occ`: >=1: 100,153; >=5: 61,639; >=20: 30,610; >=100: 9,528.
- Words in the existing list that are `TWPhrases` keys: 299, of which 205 have `occ <= 5`.
- vChewing entries that McBopomofo's corpus lacks but that are real Taiwan news terms (so `occ` alone would wrongly drop them): 國家科學委員會, 選情, 採收, 建置, 拜票, 義消, 設籍. The cross-source vote rule (`>=3 sources and p >= 50`) saves them.

### 1.5 Format recommendation for the shipped list

Replace the object-per-word JSON (`{"w","z","p"}`, ~13MB across 10 chunks) with a compact format: one chunk per word length class, or TSV lines `word<TAB>zhuyin<TAB>tier`, where `tier` is the existing 常用度 level (1-5) computed from `occ` and `p` quantiles. A ~95k-word list lands near 3-4MB raw. GitHub Pages serves gzip, so the transfer size is lower still (HIGH for gzip support on Pages; I did not measure the compressed size). Keep the chunking and IndexedDB cache already in the app, and bump `wordlist-meta.json` so existing caches invalidate.

---

## 2. Free LLM reliability

### 2.1 Provider status (as of 2026-10-03)

| Provider | Status | Free limits | Structured output | Verdict | Confidence |
|----------|--------|-------------|-------------------|---------|------------|
| **GitHub Models** | **Retired 2026-07-30** | none | n/a | **Remove from Worker, client, and docs now.** Also remove the "OpenAI / Meta / Deepseek" model names that came through it. | HIGH |
| **Google Gemini API** | Alive. Pro models removed from free tier April 2026. Free: Flash and Flash-Lite (`gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-3.5/3.6/3.7/3.8-flash`). `gemini-2.5-*` is limited to existing active users ("no shutdown date announced"), so a new key may get access errors. | Docs publish no numbers. Limits are per **project**, visible only in AI Studio. Third-party reports: Flash-Lite about 15 RPM / 1,000 RPD, 3.x Flash lower. | Yes: `generationConfig.responseMimeType: "application/json"` plus `responseJsonSchema`. `generateContent` stays "fully supported" per Google; the new Interactions API is beta, **do not migrate**. | **Primary.** Use `gemini-3.5-flash-lite` first (default thinking minimal), `gemini-3.7-flash` or `gemini-3.8-flash` second. Drop `gemini-2.5-flash`. | HIGH (models, API), LOW-MEDIUM (quota numbers) |
| **Groq** | Alive. Free chat models: `openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `qwen/qwen3.8-27b`. | 30 RPM, 1K RPD, **8K TPM**, 200K TPD per org (docs). | `json_schema` strict: gpt-oss-20b/120b and qwen3.8-27b. All models support `json_object`. | **Secondary.** TPM is the binding limit. Keep the prompt compact and `max_tokens` small (<= 600). | HIGH (limits, docs), MEDIUM (TPM-counts-max_tokens behaviour) |
| **Cloudflare Workers AI** | Alive. Native `env.AI` binding, no external key. | **10,000 neurons/day** on Free and Paid, reset 00:00 UTC. Hard stop on Free. | JSON mode on a subset (Llama 3.3 70B fp8-fast, Llama 3.1 8B, deepseek-r1-distill-qwen-32b…). Docs warn "can't guarantee" schema. Not streaming. | **Tertiary, last-resort.** Zero extra secrets and the same Worker. Candidates: `@cf/qwen/qwen3-30b-a3b-fp8` (supports `response_format`), `@cf/meta/llama-3.3-70b-instruct-fp8-fast`. Chinese quality needs a test. | MEDIUM |
| **OpenRouter `:free`** | Alive | 20 RPM; **50 RPD** until $10 is bought, then 1,000 RPD | model-dependent | Skip. Requires buying credits for a usable daily cap, which violates "free only". | HIGH |
| **Cerebras** | Alive, `gpt-oss-120b` and `qwen-3.8-27b` | 5 RPM, 1M tokens/day. Docs say the free trial needs a verified payment method for credits. | yes | Skip for now. Tight RPM and a payment method. Keep as a future option. | MEDIUM |
| **Mistral La Plateforme (Experiment)** | Alive, phone-verified free tier | ~1 request/second, large monthly token cap; exact numbers only in the console | yes | Optional fourth. Not needed yet. | MEDIUM |

The seam rates the generic web providers LOW, so quota numbers outside the vendors' own docs are labelled LOW-MEDIUM above.

### 2.2 Robust chain design for the Cloudflare Worker (recommended)

Move the chain **server-side**. The client currently owns it in three duplicated call sites and the Worker is a dumb proxy. Create one endpoint, `POST /suggest`, that accepts `{messages, schema, maxTokens}` and returns:

```json
{ "ok": true, "provider": "gemini", "model": "gemini-3.5-flash-lite", "json": { }, "tried": [{"provider":"groq","status":429,"ms":812}] }
```

or, when everything failed, `{ "ok": false, "tried": [...], "code": "ALL_PROVIDERS_FAILED", "retryAfterSec": 40 }` so the UI can say which tier failed and why instead of staying silent.

Chain order (fastest to give a usable answer first, cheapest quota last):
1. `gemini-3.5-flash-lite`, `thinkingConfig.thinkingLevel: "minimal"` (or `"low"`), JSON schema.
2. `gemini-3.7-flash` or `3.8-flash`, `thinkingLevel: "low"`.
3. Groq `openai/gpt-oss-120b`, `json_schema` strict, `max_tokens <= 600`.
4. Groq `qwen/qwen3.8-27b`.
5. Workers AI `@cf/qwen/qwen3-30b-a3b-fp8` via `env.AI.run`, `response_format`.

Practices to implement, each tied to a documented behaviour:
- **Per-attempt timeout** with `AbortController` (8-10 s for the first two, 15 s for later ones), so a hung provider does not block the chain.
- **Retry only on 429 / 5xx / timeout**, one retry with jittered backoff (1 s, 2 s), then move on. Do not retry 400 / 401 / 404. A 404 on a model id means "model removed", so mark it dead for this isolate (in-memory `Map` with a 10-minute TTL) and skip it next time. This is what would have caught qwen3.6 and gpt-4.1 automatically.
- **Honour `Retry-After`** when the provider sends it. Cache "this provider is rate-limited until T" in a module-level `Map` (per isolate) so the next request skips it immediately. Workers KV is too slow and write-limited for this, so skip it.
- **Validate the returned JSON** against the schema, and then validate each suggested word with `validateWordRhyme` (the existing 韻腳驗證). Treat an invalid response like a provider failure and try the next one. This directly serves the "造詞結果必須通過韻腳驗證" requirement.
- **Gemini key in a header** (`x-goog-api-key`), not the `?key=` query string the Worker uses today, so it does not end up in logs.
- **Keep `max_output_tokens` generous enough for thinking, or lower `thinkingLevel`.** Google's own guidance is to lower `thinking_level` rather than set a small `max_output_tokens`. For Gemini 3+ use `thinkingLevel`; `thinkingBudget` is for 2.5, and sending `thinkingLevel` to a 2.5 model errors (documented in the ThinkingConfig reference).
- **Keep prompts small for Groq's 8K TPM**: send at most the top N candidates with short numeric ids, not full candidate dumps.
- **Rate-limit your own users at the Worker** (Cloudflare's Rate Limiting binding or a simple per-IP counter) so a few heavy users do not burn the shared free quota for everyone. Optional, add if quota exhaustion shows up.
- **A `/health` or `/models` self-test** that pings each tier with a 1-token request, callable by the admin page. This turns "model quietly disappeared" into a visible red light.
- Cloudflare AI Gateway (free, "available on all plans", supports caching, rate limiting, retry and fallback) exists, but it adds a routing layer and I did not verify Groq support. **Do not adopt it**; a 100-line chain in the existing Worker is simpler to debug for a non-programmer.

**Design change that removes most hallucination bugs (feeds the "AI 挑詞邏輯" requirement):** show the model the hard-indexed candidates as a numbered list and ask for `{"picks":[ids]}`, with `minItems`/`maxItems` in the schema where the provider supports it. The model chooses, it does not type words. Free-form 造詞 is then a separate, clearly labelled second call whose outputs are rhyme-validated and discarded if they fail. I confirmed that Gemini and Groq both support JSON schema output on the models recommended above (Gemini: not every JSON Schema feature, per its docs).

### 2.3 What to delete in the client now

- The `'gpt-4.1'` default and every `provider: 'github'` / `'claude'` branch in `getApiKey`.
- The `qwen/qwen3.6-27b` entry (replace with 3.8).
- `autoFallback: false` on all entries, and the three duplicated `tryList` blocks (replace with one `POST /suggest`).
- A migration for `localStorage.selectedModel`: if the stored id is not in the new list, reset it. Otherwise returning users will keep selecting a dead model.

---

## 3. Splitting `index.html` without a build step

**Recommendation: native ES modules, no bundler, no new CI.** (HIGH)

Why it works here:
- GitHub Pages serves `.js` as `application/javascript` with `cache-control: max-age=600` (verified by `curl -I` on the live site, 2026-10-03). Modules load via `<script type="module">` with no config.
- The app is a vanilla-JS single page with no framework, so there is nothing for a build step to compile. A bundler would add npm, a CI deploy workflow, and a base-path problem for the non-programmer owner, in return for fewer requests that HTTP/2 does not penalise much.
- The project already loads `data/rhyme-dict.js` and `data/polyphonic-order.js` as classic scripts that set globals. Keep those as they are. Module scripts are deferred, so they run after the classic scripts have set the globals.

Concrete rules for the roadmap:
1. Entry: `<script type="module" src="js/main.js?v=0.97">`. Put shared state and storage in `js/state.js`, `js/storage.js`, then one module per area (rhyme engine, lexicon loader, AI client, editor, rhyme map, UI shell). Extract **pure logic first** (rhyme engine, lexicon cleaning consumers, storage with schema versioning), DOM glue last.
2. **The 79 inline `onclick="…"` handlers break under modules** because module scope is not global. Migrate to `data-action="…"` plus one delegated listener per container. As a stop-gap during the split, use `Object.assign(window, { zoomIn, zoomOut, … })` in `main.js` and delete entries as handlers are converted.
3. **Local testing:** modules do not load from `file://` (CORS). Andy needs a one-line static server (`python3 -m http.server 8080`, already available in the dev container). Put it in `README.md` or the handoff file.
4. **Cache busting:** GitHub Pages' 10-minute cache means a deploy can briefly mix old and new modules. Bump `?v=` on the entry script every release, and keep module files small and stable between releases. Do not build an import-map versioning system (overkill).
5. **CSS:** split into `css/*.css` loaded by `<link>` tags. Use CSS custom properties for the theme and UI scale, which is already the project's approach for day and night mode.
6. Add `<link rel="modulepreload">` for the 3-4 largest modules to avoid a waterfall on slow phones.

**When minimal tooling is worth it (not now):** `esbuild` 0.28.2 (npm, MIT) is the only tool I would add: single binary, no config, bundles and minifies in milliseconds. Consider it only if module request count becomes a measured problem on mobile, and then run it locally and commit the output (still no CI). **Not Vite, webpack, or Parcel.**

**The zoom bug (requirement 1.1) is an architecture issue, not a library issue.** The code applies `resultsSection.style.zoom = MzoomScale / 100 * MzoomBaseRatio` (`index.html` ~5748) and also has a separate desktop slider. CSS `zoom` changes layout size in browser-specific ways and does not compose with `vw`/`position: fixed` offsets, which fits the reported "100% already has an offset" symptom. Recommended replacement: a single `--ui-scale` custom property that multiplies the root `font-size`, with sizes in `rem`, so layout reflows instead of being scaled. I did not reproduce the bug, so treat this as a strong hypothesis for the phase to confirm (MEDIUM).

---

## 4. Libraries (native first)

| Need | Recommendation | Version / licence | Why | Confidence |
|------|----------------|-------------------|-----|------------|
| **Reorder paragraphs and song tabs by drag** | **SortableJS**, vendored in `vendor/` (not CDN, so the PWA works offline) | 1.15.7, MIT (npm registry, 2026-10-03). The ESM build is ~120KB unminified; use the minified file. | HTML5 drag-and-drop does not work on touch screens. Sortable handles touch, handles, auto-scroll and animations in one small dependency. Writing that correctly by hand is where the current drag bugs come from. | MEDIUM-HIGH |
| **Resize panels** | **Native Pointer Events** (about 25 lines: `pointerdown` + `setPointerCapture` + `pointermove`), with `touch-action: none` on the handle | none | The only need is a drag handle that changes a panel's height or width. CSS `resize` works only on desktop mouse. | HIGH |
| **Free-floating 2D positioning** (only if "位置" truly means x/y placement) | `interact.js` | 1.10.28, MIT | It covers drag plus resize plus touch plus snapping. **Recommend against free 2D** on phones; an ordered stack with resizable height and collapse is easier to use on a small screen and much easier to keep bug-free. Decide this in discussion before adding the dependency. | MEDIUM |
| **Undo / Redo** | **Own snapshot stack** (~40 lines) over the lyric state JSON, with debounce (about 400 ms) and a cap of ~100 snapshots | none | Native `textarea` undo breaks whenever the app assigns `.value` programmatically (AI insertion, tag changes). A model-level stack also covers moving paragraphs and renaming songs, which no library does for free. | HIGH |
| **Rendering many result cards** | **No virtual-scroll library.** Use chunked append (render 60, then the next 60 via `IntersectionObserver` on a sentinel) plus `content-visibility: auto` with `contain-intrinsic-size` on each card | CSS, **Baseline 2024** (Chrome, Firefox, Safari since Sept 2024, MDN) | The "一次渲染所有字卡卡死手機" problem is a first-render cost. Chunking fixes that with no dependency, and cards stay in the DOM, so find-in-page keeps working. A virtual-list library would fight the existing wrapped-flex card layout. | HIGH |
| **Chinese word segmentation for 斷句結構 (3+4, 2+2+3)** | **`Intl.Segmenter('zh-TW', {granularity:'word'})` as the quick path**, plus an **own max-probability DP over the cleaned lexicon** (about 40 lines, jieba-style: build a DAG from the word list, pick the path with the highest sum of log frequency) as the primary path | `Intl.Segmenter` is **Baseline 2024** (MDN) | Segmentation here drives a prosodic summary, so it must prefer the app's own Taiwan vocabulary, which a PRC-leaning ICU dictionary will not. My test on Node 26 gave: 我\|想要\|跟\|你\|一起\|看海 (good) but 你是\|我\|最深\|愛\|的\|人 and 夜空\|中\|最\|亮\|的\|星 (poor for lyric structure). Use the DP, fall back to `Intl.Segmenter`, and let the user correct a split by hand. Do not promise accuracy in the UI. | MEDIUM |
| **Browser segmenters** (`jieba-wasm`, `segmentit`, `nodejieba`) | **Do not use** | n/a | Simplified-leaning dictionaries, hundreds of KB to MB of payload, and no gain over the app's own lexicon. | MEDIUM |
| **Responsive layout** | **Native CSS only**: `dvh`/`svh` units, `clamp()`, CSS Grid, container queries, `env(safe-area-inset-*)` for notch phones, `@media (pointer: coarse)` for touch sizing (44px minimum targets) | CSS (Baseline) | Phone, tablet and desktop differences are layout, not logic. Avoid a UI framework. Pair this with the `--ui-scale`/`rem` change from section 3. | HIGH |
| **Fonts** | Keep Google Fonts Noto Sans TC, but add `font-display: swap` and consider `preconnect`; do not self-host the CJK font (multi-MB) | none | Already in use; the CJK subset delivery is Google's job. | MEDIUM |

---

## Recommended Stack (summary)

### Core
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Vanilla JS, native ES modules | ES2022+ | App code split across `js/*.js` | No build, works on GitHub Pages, no framework to learn. |
| GitHub Pages | n/a | Static hosting | Unchanged; serves gzip and `max-age=600`. |
| Cloudflare Worker (`admin/woker.js`, rename to `worker.js` during the Worker rewrite) | `wrangler` 4.147.0 (MIT OR Apache-2.0) if the Worker moves to CLI deploys | `/suggest` chain, feedback, correction layer | One place for provider logic; removes client-side fallbacks. |
| Cloudflare Workers AI binding | n/a | Tertiary LLM fallback | No extra key; 10K neurons/day free. |

### Data pipeline (build-time, Python 3.13 stdlib only)
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| McBopomofo `BPMFMappings.txt` + `phrase.occ` | repo 3.1.1 (2026-09-02), MIT / libtabe BSD | Backbone word list plus Taiwan corpus counts | Curated, Taiwan-leaning, permissive. |
| vChewing VanguardLexicon (3 files) | main | Cross-source vote, zhuyin, `p` | MulanPSL-2.0. Already wired in `build_wordlist.py`. |
| libchewing `tsi.csv` | last snapshot (repo archived 2026-03-24) | Optional vote | LGPL-2.1+; drop if licence simplicity matters. |
| MOE 重編國語辭典修訂本 (`dict-revised.json.xz`) | MOE `dict_revised_2015_20260929` | Headword vote, `quote` classical marker, authoritative zhuyin | CC BY-ND 3.0 TW (format conversion and later use allowed per MOE; attribution required). |
| OpenCC `TWPhrases.txt` | OpenCC 1.4.2 (2026-08-22), Apache-2.0 | PRC-phrase flag | Build-time only; pulled by URL, not vendored into the shipped site. |
| Python `cp950` codec | stdlib | Simplified/rare-char reject | Zero dependency. |
| `pyahocorasick` (optional, Stage 3) | 2.3.1, BSD-3-Clause | Substring counts over a corpus | Only if Stage 3 is run. |

### Supporting
| Library | Version | Purpose | When to use |
|---------|---------|---------|-------------|
| SortableJS | 1.15.7 (MIT) | Paragraph and song-tab reordering | Editor module phase. Vendor the minified file. |
| esbuild | 0.28.2 (MIT) | Optional local bundle/minify | Only if request count is shown to hurt mobile load. |
| interact.js | 1.10.28 (MIT) | Free 2D drag/resize | Only if free-floating panels are explicitly chosen. |

## Alternatives Considered

| Category | Recommended | Alternative | Why not |
|----------|-------------|-------------|---------|
| Lexicon backbone | McBopomofo (MIT/BSD) | libchewing `tsi.csv` alone | LGPL on shipped data; same Taiwan quality but a noisier list (no curation pass). |
| Lexicon backbone | McBopomofo + cross-vote | MOE dictionary alone | 161k entries but no frequency, and 33k of its 62k 3+ char entries have neither an example nor a citation (mostly classical or rare). |
| Frequency source | McBopomofo `phrase.occ` | rime-essay, jieba, zhwiki | Mainland-dominated (軟件 55,503 vs 軟體 870). |
| PRC detection | OpenCC `TWPhrases` flag **gated by corpus count** | OpenCC `s2twp` round trip, or hard-drop all flagged | Hard-dropping removes 94 words Taiwan really uses (支持, 社區, 設備, 消息, 項目…). |
| Simplified detection | `cp950` encode test | OpenCC `STCharacters` keys | ST keys include valid traditional chars (吃, 千, 里, 斗, 群), giving ~4,150 false positives. |
| LLM data cleaning | Rules first, then LLM on ~13k-23k gray words | LLM over all ~243k | 10x the tokens for little gain. |
| LLM host | Free Gemini and Groq, chain in Worker, Workers AI last | OpenRouter free, Cerebras, Mistral | Daily caps too low (OpenRouter 50 RPD unfunded), payment method required (Cerebras), or not needed yet (Mistral). |
| Module system | Native ES modules | Vite / esbuild pipeline with CI | Adds npm, CI and a base-path trap for a non-programmer owner. |
| Drag reorder | SortableJS | HTML5 DnD API by hand | Not supported on touch screens; the current drag bugs live here. |
| Segmentation | Own DP over lexicon + `Intl.Segmenter` fallback | `jieba-wasm`, CKIP | Simplified bias, payload size, GPL (CKIP). |
| Large lists | Chunked render + `content-visibility` | Virtual-scroll library | Fights the wrapped-flex layout, and the cost is first-render only. |

## What NOT to Use

| Avoid | Why | Use instead |
|-------|-----|-------------|
| GitHub Models (`models.inference.ai.azure.com`) and the model id `gpt-4.1` | Service retired 2026-07-30; hard failure. | Gemini and Groq chain (section 2.2). |
| `qwen/qwen3.6-27b` on Groq | Shut down 2026-09-14. | `qwen/qwen3.8-27b`. |
| `gemini-2.5-*` as a primary | Access limited to existing active users. | `gemini-3.5-flash-lite`, `gemini-3.7-flash`, `gemini-3.8-flash`. |
| The Gemini Interactions API (beta) | Beta with breaking changes (May 2026 notice); `generateContent` remains fully supported. | `generateContent` with `responseJsonSchema`. |
| rime-essay, Rime luna/terra, jieba `dict.txt.big`, zhwiki as frequency data | Mainland-dominated. | McBopomofo `phrase.occ` (plus optional Taiwan-corpus counts). |
| 中研院 ASBC / CKIP lexicon and `ckip-transformers` | Restricted or GPL-3.0; distribution friction on a public site. | The McBopomofo/vChewing/MOE vote. |
| Scraped lyric corpora | Copyright. | Rule and LLM filtering of existing lexicons. |
| Hard-dropping every OpenCC `TWPhrases` key | Removes shared words such as 支持, 社區, 設備. | Flag plus corpus gate. |
| Treating vChewing `p >= 100000` as frequency | Meme values (114514, 100000), not corpus counts. | Ignore `p` at or above that threshold. |
| CSS `zoom` on result containers | Browser-specific layout and offset behaviour, likely the zoom bug. | `--ui-scale` on root `font-size` with `rem` units. |
| Inline `onclick="…"` after the module split | Module scope is not global; 79 call sites break. | `data-action` plus delegated listeners (temporary `window` shim). |
| API keys in URLs (`?key=`) in the Worker | Appear in logs and traces. | `x-goog-api-key` header; secrets in Worker bindings only. |
| Admin key in the URL (`?key=…`) | Already flagged in PROJECT.md as weak. | Out of scope for this stack file; fix in the admin/feedback phase. |

## Stack Patterns by Variant

**If the 3+ char count after cleaning feels too low for the lyric use case:**
- Add Stage 3 (Taiwan-corpus n-gram evidence), then a separate n-gram discovery step.
- Because no open lexicon contains lyric-style daily collocations.

**If Gemini free quota tightens again (it already did in Dec 2025 and Apr 2026):**
- Promote Groq `gpt-oss-120b` to first position and add Mistral Experiment as a fourth tier.
- Because the Worker chain is configuration (an ordered array), not code, which is the point of moving it server-side.

**If free-floating panel placement is chosen over an ordered stack:**
- Add interact.js 1.10.28 and restrict free layout to desktop widths.
- Because 2D placement is awkward and bug-prone on a phone.

## Version Compatibility

| Package A | Compatible with | Notes |
|-----------|-----------------|-------|
| Gemini `thinkingLevel` | Gemini 3+ models only | Sending it to a 2.5 model errors. 2.5 uses `thinkingBudget`. |
| `gemini-3.5-flash-lite` | default thinking "minimal" | Levels: minimal, low, medium, high. |
| `gemini-3.7-flash`, `gemini-3.8-flash` | default "medium" | `minimal` is **not** supported on these two (levels low, medium, high). |
| Groq `json_schema` strict | gpt-oss-20b/120b, qwen3.8-27b | Other models only support `json_object`. |
| Workers AI JSON mode | Llama 3.3 70B fp8-fast, Llama 3.1 8B, deepseek-r1-distill-qwen-32b | Qwen3-30B-A3B page says `response_format` is supported; the JSON-mode page does not list it. Test before relying on it. No streaming with JSON mode. |
| Native ES modules | Any browser with Baseline 2018+ module support | `file://` does not work; use a local static server. |
| `Intl.Segmenter`, `content-visibility: auto` | Baseline 2024 | Needs Firefox 125+ / Safari 18+ for `content-visibility`; add a graceful no-op fallback. |

## Installation

```bash
# Data pipeline (no new Python deps for Stages 0-2)
python3 scripts/clean_wordlist.py        # to be written; reads McBopomofo, vChewing, tsi, MOE json, OpenCC TWPhrases
# Optional Stage 3 only
pip install pyahocorasick==2.3.1

# Editor drag-reorder: vendor, do not CDN
curl -L https://cdn.jsdelivr.net/npm/sortablejs@1.15.7/Sortable.min.js -o vendor/Sortable.min.js

# Worker (only if switching to CLI deploys; dashboard paste also works)
npm install -D wrangler@4.147.0
```

## Open questions and gaps

- **Gemini free-tier quotas are unpublished** outside AI Studio. Andy must read the real RPM/RPD values for his project at aistudio.google.com/rate-limit and put them in the Worker config. (LOW-MEDIUM)
- **Workers AI Chinese quality and JSON behaviour** for `qwen3-30b-a3b-fp8` and Llama 3.3: needs a 10-prompt test before it becomes a trusted tier.
- **McBopomofo `phrase.occ` corpus provenance** is not documented in the repo. The data behaves Taiwan-leaning (資訊 > 信息, 網路 > 網絡), but if exact provenance matters, check the McBopomofo issue tracker.
- **MOE CC BY-ND 3.0 TW**: MOE's interpretation (format conversion and subsequent use allowed) is quoted in the moedict README, but the MOE download page itself was unreachable (ECONNRESET). Re-read the MOE 使用說明 once before shipping MOE-derived data. This is not legal advice.
- **Stage 3 corpus choice and licence** (which Taiwan corpus, PTT/Dcard dump availability) is unresolved; only needed if the 3+ char count disappoints.
- **國教院 coct.naer.edu.tw core vocabulary** may offer a downloadable graded Taiwan vocabulary; unverified.
- **Prototype quality was spot-checked, not audited.** Auto-keep still contains proper nouns (蔣緯國, 勞勃瑞福, 力霸集團, 台北市工務局); the LLM judge should be extended to a sample of auto-keep 3+ char words for proper-noun detection, or those words should be run through a name/place heuristic. A 200-word human spot-check after the LLM pass is the only recommended manual step.

## Sources

Primary, read directly (HIGH):
- docs.github.com/en/github-models: retirement notice, 2026-07-30
- console.groq.com/docs/deprecations: qwen3.6-27b shutdown 09/14/26, Llama shutdowns
- console.groq.com/docs/rate-limits and /structured-outputs
- ai.google.dev/gemini-api/docs/pricing, /deprecations, /thinking (`.md.txt`), /interactions, /rate-limits (no numbers); ai.google.dev/api/generate-content (`.md.txt`, ThinkingConfig, responseMimeType, responseJsonSchema)
- developers.cloudflare.com/workers-ai/platform/pricing, /features/json-mode, /models/qwen3-30b-a3b-fp8
- openrouter.ai/docs/api-reference/limits
- inference-docs.cerebras.ai/support/rate-limits
- raw files: McBopomofo `Source/Data` (README, AGENTS.md, BPMFMappings.txt, phrase.occ), vChewing-VanguardLexicon (LICENSE.txt, LICENSE-CHT.txt, `phrases-*-cht.txt`), chewing/libchewing-data (`tsi.csv` header), g0v/moedict-data (README, `dict-revised.json.xz`), BYVoid/OpenCC (`data/dictionary/*`, LICENSE), rime/rime-essay (`essay.txt`)
- GitHub API licence endpoints; npm registry (sortablejs 1.15.7, interactjs 1.10.28, esbuild 0.28.2, wrangler 4.147.0, opencc-js 1.4.2); PyPI (OpenCC 1.4.2, pyahocorasick 2.3.1)
- MDN: Intl.Segmenter and `content-visibility` (both Baseline 2024)
- `curl -I` on andy-coin.github.io (cache-control max-age=600, application/javascript)

Secondary, cross-checked (MEDIUM):
- klymentiev.com/blog/groq-pricing (Llama removal, Sept 2026)
- GitHub issues and DEV posts on Groq `max_tokens` counted against TPM (lettucebo/SayIt #128, dev.to/build996)
- tinkerllm.com, aifreeapi.com, apiyi.com (Gemini free-tier shape; quota numbers LOW-MEDIUM)
- Hugging Face collection `Heng666/taiwan-pretrain-llm-zh-tw-corpus` (corpus availability only)

Not verified (LOW):
- TOCFL / 國教院 vocabulary list licensing; MOE download-page terms (site unreachable during research); third-party Gemini quota numbers.

---
*Stack research for: 好韻器 Lucky Hawaii stabilization milestone*
*Researched: 2026-10-03*
