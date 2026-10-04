# Pitfalls Research

**Domain:** Taiwan-Mandarin lyric rhyming web tool (vanilla-JS monolith on GitHub Pages + Cloudflare Worker/KV + free LLM tiers), "stabilize first" milestone
**Researched:** 2026-10-03
**Confidence:** MEDIUM-HIGH. Facts about this repo were read from the code (HIGH). License, deprecation and KV facts come from official pages or web search (MEDIUM, marked inline). The browser-behaviour items (IME, iOS Safari) come from established platform knowledge plus search (MEDIUM). This is not legal advice.

## Phase Labels Used Below

The roadmap does not exist yet. These labels are a suggested split to adapt, and each pitfall is mapped to one of them.

| Label | Scope |
|-------|-------|
| **P0 Safety net + split** | Golden tests, extract pure logic, split the file, storage inventory |
| **P1 Stability** | Zoom bug, silent failures, render/memory, data-cache correctness |
| **P2 AI reliability** | Worker-side fallback, deterministic pick/fill/validate |
| **P3 Lexicon** | Source licenses, TW/PRC cleaning, rebuild and cache |
| **P4 Worker / feedback / admin** | Correction layer, write-back, auth, spam |
| **P5 Editor** | Draggable modules, undo/redo, multi-song, schema migration |
| **P6 Rhyme map / 句構** | Highlighting, analysis, settings toggles |
| **P7 Mobile/UI polish** | Touch, iOS viewport, visual clutter |

---

## Findings From Reading the Actual Code (these change the priorities)

These are concrete facts that make the generic pitfalls below more urgent.

1. **The "fallback chain" is effectively off.** In `index.html` ~L4449, every entry of `LLM_MODELS` has `autoFallback: false`. `isModelAvailable()` returns true for all Worker-managed providers. The try-list is therefore only the selected model. A dead model means a failed request with no fallback.
2. **The Worker trusts the client.** `admin/woker.js` L128-186 uses `raw.model` and `raw._provider` straight from the request body. The Gemini URL is built as `models/${model}:generateContent`, and `messages` and token limits are unbounded. Anyone who finds the Worker URL can burn the shared free quota or probe arbitrary model paths.
3. **The IndexedDB cache can pin stale chunks.**
   - `fetch('data/wordlist-meta.json')` and `fetch('data/wordlist-cXX.json')` go through the normal HTTP cache. GitHub Pages serves `max-age=600`.
   - A new meta version can therefore be paired with old chunk bodies, and that mixed set is stored under the new `ver` until the next bump.
   - The `'ver'` write is not awaited and is decoupled from the chunk writes.
4. **Memory is the real mobile risk.**
   - The wordlist has 233,713 entries (not the 130K in CONCERNS.md) in 12.95 MB, loaded with `Promise.all` over 10 chunks.
   - Each chunk is text, then split, then parsed into one object per line, then pushed to `buf`, then written to two `Map`s, then structured-cloned into IndexedDB.
   - Peak memory is several times the file size, and iOS Safari kills tabs for this.
5. **Zoom is CSS `zoom` on `.container`** (L5748-5887, slider 50-150%, plus the mobile `MzoomBaseRatio`). `zoom` on a container that has `width:100%`, `vh`/`vw` units or fixed/absolute descendants shifts or overflows content. That matches the reported "edge content eaten even at 100%" bug.
6. **The lyric editor is `<textarea>` rebuilt from a template string** (L3941: `<textarea ... oninput="saveLyrics()">${s.text}</textarea>`).
   - Any full re-render destroys focus, caret, IME composition and the native undo stack.
   - Lyrics containing `&amp;` or `</textarea>` are corrupted by being parsed as HTML.
   - Textareas cannot be coloured inline, which constrains the rhyme-map design.
7. **There are 79 inline `onclick=` handlers** and global functions. Switching to ES modules breaks every one of them.
8. **localStorage keys in use**, all of which must survive migration:
   - `haiku_lyrics`, `haiku_hashtags`, `haiku_savedwords`
   - `dictOverrides_v076` (user tier overrides)
   - `selectedModel`, `haoYunQi_inputMode`
   - the panel-collapsed flags, the colour keys, `apiKey_*`
9. **The wordlist is per-word reading data:** `{"w":"一丁點","z":"ㄧˋ ㄉㄧㄥ ㄉㄧㄢˇ","p":790}`. This is the right foundation. Rhyme must use the word's own reading of its last character, never a per-character default.
10. **No service worker was found** (grep). That is good, because it removes one stale-asset class, but it means GitHub Pages' 10-minute cache is the only staleness layer.

---

## Critical Pitfalls

### Pitfall 1: "Refactor" with no safety net, so the first regression is silent

**What goes wrong:**
- Splitting 6000 lines of inline JS changes behaviour in ways nobody notices.
- Typical breakages: script order, a `let`/`const` that stops being visible, an `onclick="foo()"` that no longer resolves, a function hoisted differently, duplicate globals colliding.
- The rhyme search "works" but returns slightly different results.

**Why it happens:**
- There are no tests, global state, 79 inline handlers, and `catch(e){}` everywhere (CONCERNS.md), so failures are swallowed.
- AI-assisted large edits touch many places at once.

**How to avoid (minimal safety net, one afternoon of work, no framework):**
1. **Golden-master snapshot BEFORE touching structure.**
   - Extract (or just `eval` in Node) the pure search functions: `searchRhyme`, zhuyin split, rhyme filter, polyphonic selection, and candidate indexing.
   - Run about 150-300 fixed queries (single chars, 破音字 like 樂/行/長/了, tone filters, 雙押/多押/子音/母音 modes).
   - Save the outputs to `tests/golden.json`.
   - A single `node tests/golden.mjs` diffs against it.
   - Refactor commits must keep it green. Intentional behaviour changes regenerate the file in their own commit, with a reviewed diff.
2. **One headless smoke test** (Playwright or a puppeteer script, 30 lines):
   - Load the page and wait for the wordlist.
   - Search 「愛」 and assert the card count is greater than 0.
   - Assert zero `console.error`.
   - Click every element with an `onclick` and assert no `ReferenceError`.
3. **Replace every `catch(e){}` with `catch(e){ reportError('tag', e) }`** first. It writes to console and a small in-memory ring buffer shown in a hidden debug panel. Do this before the split so the split cannot hide failures.
4. **Split as classic `<script src defer>` files sharing global scope, in a fixed order.**
   - Do NOT convert to ES modules in this milestone. Modules would force removing all 79 inline handlers at once.
   - Migrate handlers to `addEventListener`/delegation file by file, later.
5. **Behaviour-preserving commits and feature commits never mix.**
   - Tag a git tag at every green state.
   - Keep the pre-refactor `index.html` reachable at a known URL or path for A/B comparison. The `history version/` folder already helps.
6. **Cache-bust split assets** with `?v=<build>` in the `<script>` tags. Otherwise GitHub Pages can serve new HTML with old JS for up to 10 minutes.

**Warning signs:**
- "It loads" is the only acceptance criterion.
- A refactor PR touches more than about 3 concerns.
- `ReferenceError: x is not defined` in the console after a split.
- Golden diff shows changed result ORDER (often from `Map`/`Set` iteration or sort stability changes).

**Phase to address:** **P0**. Everything else depends on it.

---

### Pitfall 2: Lexicon license contamination on a public site

**What goes wrong:**
The shipped `data/*.json` is a merged derivative of several sources, and the licenses are not compatible with each other or with how the file is published.

| Source | License (status) | Consequence |
|--------|------------------|-------------|
| libchewing `tsi.csv` (libchewing-data) | LGPL-2.1-or-later (MEDIUM, search) | A derived data file you redistribute must carry the same terms and notice. |
| vChewing VanguardLexicon | Compiler is BSD-3 (MEDIUM). The repo says the corpus includes 重編國語辭典修訂本 2015 (CC BY-ND 3.0), CNS11643 (OGDv1) and LibTaBE (BSD-3). | Data provenance inside a "BSD" repo is mixed. |
| 教育部 國語辭典 family, incl. 萌典 data | **CC BY-ND 3.0 Taiwan** (MEDIUM-HIGH, official MOE page via search). Commercial use is allowed, **modification is not**. | Filtering, normalising and merging into your own JSON is arguably an adaptation. |
| CC-CEDICT, Wikipedia titles/dumps | CC BY-SA | ShareAlike is viral to the derived dataset. One-way compatible with GPLv3, **not** LGPL-2.1. Do not merge it into the same file as LGPL data. |
| McBopomofo character data | MIT | Fine, but keep the notice. |

**Why it happens:**
- `merge_corelib.py` flattens everything into one JSON and loses provenance.
- "Free to download" gets mistaken for "free to redistribute in a modified form".

**How to avoid:**
1. **Write a `data/LICENSES.md` / `THIRD_PARTY_NOTICES` and an About-page credit now**, even though this is a hobby site. This is the cheapest, highest-value fix.
2. **Add a provenance bit-flag per entry (`s`)** or ship per-source files. Never produce a single merged file whose licence you cannot state.
3. **Treat BY-ND data (MOE dictionary) as a build-time signal only.**
   - Use it to compute a score or boolean such as "is attested in a Taiwan-standard dictionary".
   - Ship the boolean or tier, not their text or definitions.
4. **Prefer sources you can legally transform:** CC0, public domain, MIT, BSD, Apache. If a SA source is truly needed, keep it as a separate, separately licensed file and do not mix it with LGPL data.
5. **Keep the data licence separate from the code licence** (`data/` has its own LICENSE) so LGPL and SA obligations do not leak onto `index.html`.
6. **Do not trust a "zh-tw" label on web text corpora.** Wikipedia zh-tw output is produced by an automatic variant converter, so it can contain PRC wording.
7. **If the legal reading matters to Andy, ask for a real opinion on ND and LGPL-data before shipping.** The research here is not a legal conclusion.

**Warning signs:**
- A new "great Taiwan wordlist" is adopted without opening its LICENSE or README.
- The build script has no per-source metadata.
- Frequency data comes from a corpus with its own redistribution terms (for example, academic corpora with no redistribution).

**Phase to address:** **P3**, decided before any sourcing. Provenance flags go into the build pipeline first.

---

### Pitfall 3: TW/PRC variant cleaning that is wrong in both directions (OpenCC misuse)

**What goes wrong:**
- OpenCC `s2twp` (and friends) is a **text converter**, not a classifier.
- Using "output differs from input" as the PRC-word test produces false positives that delete legitimate Taiwan words, and false negatives that keep PRC words.
- Examples to expect:
  - Glyph-level variants (裏/裡, 著/着, 於/于, 台/臺) look like "differences" but are not lexical PRC-isms.
  - Words valid in Taiwan but present in the phrase map: 程序 (程序正義), 質量 (物理), 信息 (in some uses).
  - Ambiguous traditional-to-simplified mappings: 髮/發, 乾/幹/干, 後/后, 裡/里. Simplified text converted to traditional becomes wrong text like 頭髮/頭發.
  - PRC wording that survives because the phrase map does not list it.

**Why it happens:**
- OpenCC is built to convert, and its phrase tables are small compared to a 233K lexicon.
- Treating "converter differs" as truth, and deleting on it, is irreversible.

**How to avoid:**
1. **Use signals, not a verdict.** Compute a per-word score from several signals:
   - (a) contains a character that exists only in Simplified (hard drop, safe);
   - (b) hits an OpenCC `TWPhrases` key (soft penalty);
   - (c) attested in the Taiwan MOE dictionary (bonus; see Pitfall 2 for how to use it);
   - (d) frequency in a Taiwan-origin corpus;
   - (e) a small hand-made "PRC-isms" and "classical-only" blocklist for the 200 most egregious cases.
2. **Normalise glyph variants instead of dropping them.** Map 着→著, 裏→裡, 台/臺 consistently, and key the rhyme index on the normalised form. Dedupe after normalising and merge `p` by max, not sum.
3. **Demote, never delete, in the shipped data.** Use a `tier` or score field.
   - Rare, classical words are exactly what poets sometimes want. Burying them below the top N is enough.
   - Log every drop to `excluded.tsv` with a reason code.
4. **Cheap human audit, not a 100K review.** Andy spot-checks 200 random removed and 200 random kept entries (about 15 minutes) and records precision. If more than about 5% are wrong in either list, adjust rules. This is more informative than an LLM judge.
5. **Do not use the LLM to classify 233K words.** It burns the free quota and its Taiwan-versus-PRC judgments are inconsistent. A small LLM pass only on the borderline middle band (a few thousand) is acceptable, behind a hard cap.
6. **Do the OpenCC work in the Python build step.** Never ship OpenCC dictionaries to the browser.

**Warning signs:**
- "Removed N words" is the only report, with no listing of what was removed.
- Common words disappear (check a canary list of about 100 everyday words, plus about 100 known PRC words that must disappear).
- Duplicate entries after normalising (for example 著/着) with different `p`.

**Phase to address:** **P3**, with the canary lists as acceptance tests.

---

### Pitfall 4: 多音字 / 破音字 reading mismatch is the likely root cause of "coined words don't rhyme"

**What goes wrong:**
- Rhyme is judged per character, using a default reading.
- Examples:
  - 樂: 快樂 ㄌㄜˋ versus 音樂 ㄩㄝˋ.
  - 行: ㄒㄧㄥˊ versus ㄏㄤˊ.
  - 長, 了, 還, 得, 著, 和.
- For a music tool, 樂 is the poster child.

**Why it happens:**
- The existing wordlist has the correct per-word reading (`z`), but the per-character dictionary (`chineseDict`) has several readings.
- `polyphonic-order.json` picks the first, and CONCERNS.md notes there is no validation and no fallback.
- AI-coined words (not in the lexicon) have no per-word reading, so any char-level check is ambiguous.

**How to avoid:**
1. **For a word in the lexicon, always use its `z` reading.** Never recompute from characters.
2. **For a coined word, validate against the user-selected reading of the target character.**
   - Accept a coined word only if the last character's reading is unambiguous, or the matching reading is the dominant one (by frequency of the word's neighbours).
   - If it is ambiguous, show it as "uncertain" (de-emphasised), not as a confirmed rhyme.
   - "Any reading matches" is too lenient. It accepts 「音樂」 as a ㄜˋ rhyme.
3. **Rhyme lookup UI for a 破音字:** show every reading as chips and require an explicit choice. Remember the choice per query, and put the default reading first, ordered by frequency.
4. **Taiwan-standard readings differ from PRC defaults** (垃圾, 血, 期, 剝 and others). Source readings from the Taiwan-based lexicon (already the case) and never "improve" them from a PRC dictionary.
5. **Normalise tone-sandhi and neutral-tone handling explicitly.**
   - Rhyme on the base tone, not the sandhi tone.
   - Decide, and document, whether the neutral-tone mark `˙` counts as a tone for same-tone filtering.
6. **Strip 兒化 (erhua) entries**, which PRC-origin lexicons contain. A final ㄦ changes the rhyme of 花兒.
7. **Extend the golden tests with about 30 破音字 cases**, each with its expected rhyme set.

**Warning signs:**
- Correction reports from users say "這個字唸錯了" for the same few characters.
- A coined word rhymes in testing only because the checker used a different reading from the one displayed.
- A mismatch between the displayed 注音 and the rhyme bucket.

**Phase to address:** **P0** (golden cases), implemented in **P2** (coined-word validation) and **P3** (lexicon readings).

---

### Pitfall 5: Treating the LLM as the rhyme judge (hallucinated rhymes, under-delivered picks)

**What goes wrong:**
- "Pick N from M candidates" returns fewer than N, or invents words that are not in the list.
- The coined fallback then produces unusable words.
- Chinese LLMs are poor at 注音 and rhyme, so they cannot reliably judge rhyme.

**Why it happens:**
- The prompt asks the model to do arithmetic (exactly N), the rhyme judgment (which it cannot do), and the semantics, all in one shot.
- With hundreds of candidates, models also drift ("lost in the middle") and stop early.

**How to avoid (division of labour: code guarantees correctness and count, the LLM only supplies taste):**
1. **Code does rhyme and count. The LLM ranks naturalness and lyric suitability.** Pre-filter by rhyme deterministically, and show the zhuyin on each candidate line so the model never has to derive it.
2. **Ask for IDs, not strings.**
   - Number the candidates `1..M`.
   - Ask for a JSON array of integers.
   - A hallucinated word becomes an out-of-range integer, which is trivial to drop.
   - Always re-check returned strings against the candidate set (exact match after normalisation).
3. **Oversample and fill deterministically.**
   - Ask for about 2N picks, or a ranking of the top 40.
   - If the response has fewer than N valid picks, fill the rest from the code-side ranking (tier, then frequency). The user always gets N.
   - The count is never a prompt promise.
4. **Cap the candidate list the model sees** (about 80-150 after a deterministic pre-rank). Chunk if larger, then merge the chunk results in code.
5. **Coining is a last resort, and it must pass the code validator** (Pitfall 4: last-char reading, rhyme mode, Traditional-only characters, length, not already in the lexicon, no repeated characters unless intended). Discard failures silently, and show the true count honestly ("找到 17 個").
6. **Reject Simplified output:** any returned character that is not in the Traditional char table is dropped.
7. **Make the second round part of the same pipeline, not a silent `catch (_)`.** A failed second round must surface a visible notice, per the existing known bug at L5256.
8. **Prompt hygiene:** "繁體中文、台灣用語", temperature around 0.2-0.4, and the user's lyrics/tags passed as quoted data. User text must never be able to change the output format.

**Warning signs:**
- The delivered count is less than the requested count more than about 5% of the time.
- Output contains strings not in the candidate list (log the rate).
- A valid response arrives with many `finishReason` values other than STOP.

**Phase to address:** **P2** (pipeline), with the validator shared with **P3**.

---

### Pitfall 6: Free-tier LLM instability (silent deprecations, 429s, malformed JSON, blocked content)

**What goes wrong:**
- Models disappear or are rerouted: Gemini 2.0 Flash and Flash-Lite shut down 2026-06-01. Per web search (MEDIUM), the entire 2.5 series retires 2026-10-16, which is days away. `gemini-2.5-flash` is currently in `LLM_MODELS`.
- The Gemini docs fetch also notes 2.5 access is restricted to prior active users.
- The Groq page lists `llama-3.1-8b-instant` and `llama-3.3-70b-versatile` replaced on 2026-08-16, and several others retired in July and September 2026.
- Free quotas were cut 50-80% since Dec 2025 (MEDIUM), and Pro models are paid-only since April 2026.
- Failure shapes to expect: 429 (RPM versus daily), 404/400 "model not found", "thinking" tokens eating `maxOutputTokens` (truncated or empty JSON), safety-blocked lyrics (love, grief, violence in lyrics) returning no candidates, and JSON wrapped in code fences or prose.

**Why it happens:**
- Model IDs are hard-coded in the front-end.
- Fallback is off (see Findings 1).
- Errors are truncated to 80 chars.
- There is no health signal.

**How to avoid:**
1. **Move model order, fallback and per-model timeouts into the Worker.**
   - One client request in, the Worker walks the chain, and the front-end never hard-codes IDs.
   - A deprecation is then a Worker config change, not a front-end release.
   - Verify every ID with the provider's list-models endpoint, because the current `gemini-3.5-flash-lite` and `gemini-3.7-flash` IDs must be checked.
2. **Enable real fallback:** per-model `AbortController` timeout (8-10 s), then next model. Return a structured result: `{ok, model, attempted:[{id,code,ms}]}`. The UI shows which models failed and why, in plain 繁中.
3. **Classify errors.**
   - RPM 429: back off and retry once or move on.
   - Daily-quota 429: mark the model "dead until tomorrow" in Worker memory or Cache API.
   - 404/400 model-gone: mark dead until the config changes, and alert.
   - Timeout and 5xx: short cooldown.
4. **Use native JSON mode** (`responseMimeType`/`responseSchema` for Gemini, `response_format` for OpenAI-compatible) **plus a tolerant parser** (strip fences, extract the first `[...]`, then validate types). Retry with a "fix your JSON" turn at most once.
5. **For thinking models:** raise `maxOutputTokens` or disable/limit thinking, and check `finishReason` (`MAX_TOKENS`, `SAFETY`) explicitly. Treat blocked or empty as a model failure, not as "no words found".
6. **Daily canary:** a Worker Cron Trigger sends a tiny prompt to each model and stores the status (1 KV write per day per model). The admin page shows red/green. This detects a silent deprecation before users do.
7. **Per-IP rate limit and a shared-quota guard in the Worker.** One heavy user must not exhaust the single shared key for everyone. Use the Cache API or in-memory counters, not KV (Pitfall 9).
8. **Always show an actionable error** ("AI 暫時額度用完，約 X 分後再試，或換模型"), never a truncated raw error.

**Warning signs:**
- A "works on my machine" model that quietly returns 404 elsewhere.
- Non-200 responses logged with no model name.
- Success rate drops at the same hour daily (daily-quota reset).

**Phase to address:** **P2**. Check the 2.5 retirement date first, because it is imminent.

---

### Pitfall 7: Worker KV correction layer: eventual consistency, lost updates, double apply

**What goes wrong:**
- Cloudflare KV is eventually consistent. Writes can take up to about 60 s to be visible everywhere, and there is a 1 write/s limit per key (MEDIUM, search).
- Free plan caps include about 1,000 writes/day (MEDIUM, search).
- Failure modes:
  1. The admin approves a fix, the list view reads a stale copy, and the admin applies it twice.
  2. A single JSON blob under one key is read-modify-written, so two quick approvals lose one.
  3. After write-back to `data/`, the client has the new data and also still applies the old correction layer (double apply, or worse, reverting a later fix).
  4. The Worker layer is cleared before GitHub Pages has finished deploying and the CDN has refreshed, so corrections vanish for minutes or hours.
  5. The client caches the correction layer and shows stale state.

**Why it happens:**
- The correction layer is modelled as mutable state with deltas instead of idempotent facts.
- Clearing is tied to "I pushed" instead of "the deployed site contains it".

**How to avoid:**
1. **One KV key per correction** (`corr:<id>`, created once, never edited), plus a status key or a tombstone, instead of one growing blob. This removes lost updates and the 1 write/s per-key trap.
2. **Corrections are absolute, idempotent operations**, for example "set reading of word W to Z", "remove word W", or "set tier of W to T". Applying twice equals applying once. Never use deltas such as "add 100 to p".
3. **Version handshake with the data build:**
   - `data/wordlist-meta.json` carries `appliedCorrectionIds` (or a monotonically increasing `correctionSeq`).
   - The client ignores any correction already included.
   - The write-back script bumps the data version.
   - The clear step deletes **only** ids whose seq is less than or equal to the version that the **live site** reports, fetched with a cache-busting query string after deploy.
4. **Admin UI uses optimistic local state.** Mark an item "applied" locally and do not trust a re-read within about 60 s. Show "約 1 分鐘後全站生效".
5. **Client fetches the layer with a version/etag** and falls back gracefully (a bad layer must never block the lexicon).
6. **Keep a rollback record:** a keyed log of previous values so a bad correction can be reverted. `applied-changes.log` is a start.
7. **Budget the KV writes:** each report, each admin decision and any cache write costs one of about 1,000 daily writes (Pitfall 9).

**Warning signs:**
- A correction "comes back" or "doesn't stick" depending on who refreshes.
- Admin lists show an item as pending right after approving it.
- Double-applied tier changes.

**Phase to address:** **P4**. The version handshake must be designed before the write-back script is written.

---

### Pitfall 8: Admin auth in the URL plus public text rendered into an admin page

**What goes wrong:**
- The admin key in a URL parameter leaks into browser history, server and Cloudflare logs, screenshots and shared links.
- `Origin` checking is not authentication. Non-browser clients set any header they like.
- The admin page stores the key in `localStorage` and renders user-submitted feedback. If any of it is rendered with `innerHTML`, a public report containing script becomes stored XSS that steals the admin key.

**How to avoid:**
1. **Send the key in an `Authorization: Bearer` header over POST.** Never in the query string. On the Worker, compare with a constant-time check, rate-limit failures, and log failures.
2. **Best, and free for personal use:** put `/admin` behind Cloudflare Access (one-time-PIN login) so there is no shared key at all. Otherwise keep the key in `sessionStorage` and a rotation procedure in the README.
3. **Render every report field with `textContent`** (or escape on output). Do the same for LLM output shown in the main app.
4. **Allowlist and size-limit the Worker's LLM input:**
   - models and providers from a config list, not from the client;
   - max message length, max messages, max tokens;
   - reject anything else with 400.
   This also fixes the model-path injection in Findings 2.
5. **Add a restrictive CSP** to the admin page (no inline script) as defence in depth.

**Warning signs:**
- The admin URL is bookmarked with the key in it.
- Any `innerHTML +=` in admin code with a report field.
- Unexpected Worker usage from IPs not matching your own.

**Phase to address:** **P4** (auth, rendering). The Worker allowlist belongs in **P2**, since the model chain moves there.

---

### Pitfall 9: Open feedback endpoint spam exhausts the free KV budget

**What goes wrong:**
- A public `POST /report` writes to KV. About 1,000 writes/day on free (MEDIUM) means spam, or one bot, can brick report writes and the admin decision writes for the day, since reads and writes fail hard at the cap rather than throttle.
- If cache or rate-limit state is also stored in KV, the same budget is consumed.

**How to avoid:**
1. **Do not store rate-limit counters in KV.** Use Cloudflare's Rate Limiting rules or the Rate Limiting binding where available. Otherwise use in-memory per-isolate counters (best-effort) or the Cache API.
2. **Cheap abuse filters before any write:** a honeypot field, minimum time-on-form, strict length caps, and drop reports with zero CJK characters or with URLs.
3. **Batch and dedupe:** hash the normalised body, skip duplicates (checked in memory or Cache), and accept at most N reports per IP per hour.
4. **Optionally add Cloudflare Turnstile**, which is free and invisible, if spam actually appears. Do not add it speculatively.
5. **Return success (200) to obvious bots** so they do not retry. Count them in Analytics, not in KV.
6. **Alert at about 70% of the daily write budget** (the canary cron can read a counter).

**Warning signs:**
- The report list fills with near-duplicates or non-Chinese text.
- 429/500 from the KV binding late in the day.

**Phase to address:** **P4**.

---

### Pitfall 10: IndexedDB wordlist cache invalidation and mobile memory

**What goes wrong:**
- Mixed old/new chunks are pinned under a new version (Findings 3).
- Parsing everything at once spikes memory on phones (Findings 4). iOS kills the tab, which looks like a "freeze on first search".
- Safari can evict script-writable storage for sites not visited for about 7 days (WebKit ITP, MEDIUM, from the 2020 WebKit announcement; does not apply to home-screen web apps).
- Private mode and quota errors are caught and silently ignored.

**How to avoid:**
1. **Content-addressed chunk filenames** (`wordlist-c03.<hash8>.json`) listed in the meta/manifest. The manifest is the only mutable file, and it is fetched with `cache: 'no-cache'` (or `?t=`). Mixed versions become impossible by construction.
2. **Atomic swap:** write the new version's chunks to IndexedDB under a versioned key namespace, set the `ver` pointer **only after all chunk puts complete** (await them), then delete the old namespace.
3. **Verify on read:** store a chunk checksum or count and recheck on load. A mismatch means a refetch, not a crash.
4. **Memory: avoid per-entry objects on the client.**
   - Store parallel arrays (`words[]`, `zhuyin[]`, `p` as a typed array) or keep the chunk text and parse lazily.
   - Load common-tier chunks first and the rest during idle time.
   - Fetch with limited concurrency (2-3), not `Promise.all` of 10.
   - Skip the intermediate `buf` and the double `Map` population (indexing only what searches need).
5. **Persist and monitor storage:** call `navigator.storage.persist()` and `estimate()`. Show a visible banner when IndexedDB is unavailable or quota-limited ("詞庫無法離線快取，每次會重新下載").
6. **Test on a real mid-range iPhone and a low-RAM Android**, with Safari remote-debugging memory snapshots. Desktop Chrome devtools do not show this failure.
7. **After any lexicon change, bump `ver` and run a "cold, warm, upgrade-from-old" test matrix** (see the checklist).

**Warning signs:**
- First search takes more than about 3 s on mobile, or the tab reloads on its own.
- Counts differ between two devices after the same update.
- `QuotaExceededError` visible in the debug ring buffer.

**Phase to address:** **P1** (silent failures, memory, load order) and **P3** (hashed filenames when the lexicon is rebuilt).

---

### Pitfall 11: Rhyme highlighting breaks typing (caret jumps, IME composition, performance)

**What goes wrong:**
- Writing coloured spans into a `contenteditable` (or rebuilding the DOM) on every `input` moves the caret and aborts 注音 composition.
- A textarea cannot hold inline colour, so developers reach for a mirrored overlay and then fight scroll sync and font metrics.
- On long lyrics, re-analysing the whole text per keystroke lags.
- Safari delivers `compositionend` **before** the Enter keydown that confirms a candidate, which is the reverse of Chrome. Any "Enter = something" handler fires on confirming a character.

**How to avoid:**
1. **Do not colour the editing surface by default.** Lowest risk:
   - (a) a read-only "韻腳地圖" view or side gutter that renders analysed lines;
   - (b) a dot or strip beside each line;
   - (c) opt-in inline mode.
   The editing surface stays a plain `<textarea>` with native undo and IME.
2. **If inline colour is wanted,** use the CSS Custom Highlight API (`CSS.highlights` + `::highlight()`).
   - It styles DOM text ranges without changing the DOM, so no caret loss.
   - It needs a `contenteditable` or rendered text, not a textarea.
   - Browser support is recent (Safari 17.2+, Chrome 105+, Firefox 140+; MEDIUM, verify against the actual browser matrix).
   - Provide a fallback (the read-only view) for older browsers.
3. **If a textarea overlay is used:**
   - mirror font, size, line-height, padding, letter-spacing and wrapping exactly;
   - sync `scrollTop`/`scrollLeft`;
   - make the textarea text transparent but keep the caret colour;
   - disable it on iOS if it wobbles. iOS adds default textarea padding and rounding.
4. **IME rule:** track `compositionstart/compositionend` with a flag. Do nothing to the DOM and do not run analysis while composing. Treat `e.isComposing || e.keyCode === 229` as composing in key handlers. Re-analyse on `compositionend` or after a 300-500 ms idle debounce.
5. **Incremental analysis:** cache the per-line result keyed by the line's text. Only re-analyse changed lines, and analyse visible lines first.
6. **Visual clutter (the project's own concern):** default everything **off or minimal** (line-end colour only). Use a limited palette (about 8 hues, plus colour-blind-safe patterns or underline styles), not one colour per rhyme class. The settings page toggles each feature and the counts are small.
7. **Test with real 注音, with Chinese Pinyin and with Japanese/English keyboards,** on desktop Safari, Chrome and iOS Safari.

**Warning signs:**
- The first character after highlight updates is lost or duplicated.
- The 注音 candidate bar disappears mid-typing.
- Input latency over 50 ms with 200+ lines.

**Phase to address:** **P6**. The "no re-render of the editing surface" rule is set in **P5**.

---

### Pitfall 12: Undo/redo that fights native undo and the IME

**What goes wrong:**
- Programmatically setting `textarea.value`, or `innerHTML` re-render of sections, wipes the native undo stack. A custom Ctrl+Z then conflicts with the native one, and both fire.
- Snapshotting on every `input` event records half-composed text, and undoing it breaks the composition.
- Mixing text edits with structure edits (delete, reorder, drag a module, apply an AI suggestion) in one stack corrupts the state.
- Persisting a large undo history in localStorage consumes the quota (Pitfall 15).

**How to avoid:**
1. **Per-textarea text undo stays native.** Do not intercept Ctrl+Z inside a textarea unless you replace the mechanism entirely.
2. **Insert programmatic text with `setRangeText` / `document.execCommand('insertText')`** where possible, so it joins the native stack. Reserve full `.value` assignments for loads.
3. **A separate document-level undo for structure** (section add/delete/reorder/move, song switch, delete song).
   - Snapshots are small (ids and metadata plus text refs), coalesced, and capped at about 50.
   - Keep them **in memory only**.
4. **Never snapshot during composition.** Snapshot on `compositionend`, on a 500 ms pause, or on a structural action.
5. **A deleted section/song gets a toast with "復原"** (a soft delete). It is what users actually need (CONCERNS.md: "accidentally delete entire sections") and is much cheaper than a full undo system.
6. **Never rebuild all section textareas on a single change.** Update the changed one, and keep keyed elements stable (also needed by Pitfall 13 and Pitfall 11).
7. **Handle both Cmd (Mac) and Ctrl, and iOS shake-to-undo,** and verify the behaviour of `beforeinput` `inputType: 'historyUndo'`.

**Warning signs:**
- Pressing Ctrl+Z undoes twice or does nothing.
- Undo after an AI insertion removes more than the insertion.
- Undo history disappears after dragging a module (a re-render).

**Phase to address:** **P5** (and P0 for the "stop re-rendering textareas" groundwork).

---

### Pitfall 13: Draggable/resizable modules on touch devices

**What goes wrong:**
- Separate `mouse*` and `touch*` handlers duplicate or conflict.
- Dragging fights page scroll.
- Resize handles are too small (under 44 px).
- `draggable="true"` on a parent of a textarea or contenteditable breaks text selection and caret placement (notably in Safari and Firefox).
- Positions saved in raw pixels go off-screen on another device, after rotation, or when the viewport changes.
- Under CSS `zoom`, pointer deltas are scaled wrongly.

**How to avoid:**
1. **Pointer Events only** (`pointerdown/move/up` with `setPointerCapture`). Do not use HTML5 drag-and-drop for modules.
2. **`touch-action: none` only on the drag handle,** never on the whole module. The body stays scrollable, and the handle is an explicit grip with a 44x44 px target.
3. **Never make the module `draggable`;** the handle drives it.
4. **Store layout relative to the container** (fractions, order index, and size as a percentage or grid units). Clamp to the viewport on load, on `resize` and on `orientationchange`.
5. **Always provide "重設版面"** and an off-screen rescue, because an unreachable module is an unrecoverable state for a non-technical user.
6. **Reorder first, free-position later.** On a phone, vertical reorder with a handle plus collapsible sections is far more usable than free x/y positioning. Free drag/resize can be desktop/tablet only.
7. **Divide pointer deltas by the current UI scale** if any scale mechanism remains (Pitfall 14).
8. **Persist layout on `pointerup` only**, not per move event.

**Warning signs:**
- A drag also scrolls the page.
- A module cannot be selected for text after the first drag.
- Layout looks right on the dev machine and clipped on the phone.

**Phase to address:** **P5** (behaviour) and **P7** (touch polish).

---

### Pitfall 14: CSS `zoom` / transform scaling that eats edge content; iOS Safari viewport and keyboard

**What goes wrong:**
- `style.zoom` on `.container` (slider 50-150%) interacts with `width:100%`, `100vw/vh`, `position: fixed/absolute` children and `getBoundingClientRect`, so content overflows or is clipped at the edges. The bug is reproduced even at 100% when `MzoomBaseRatio` is not 1.
- `transform: scale()` does not change layout size at all, so content overflows unless width is compensated and `transform-origin` is set.
- iOS Safari specifics:
  - `100vh` includes the area behind the toolbar, so use `dvh`.
  - The on-screen keyboard does **not** resize the layout viewport. Fixed bottom bars and panels get covered. Use the `visualViewport` API.
  - Input `font-size` under 16 px triggers auto-zoom on focus.
  - Notch/home-indicator areas need `viewport-fit=cover` plus `env(safe-area-inset-*)`.
  - Scroll-lock tricks on `body` break with the keyboard open.

**How to avoid:**
1. **Replace both zoom and transform scaling with a single root scale variable.**
   - Set `html { font-size: calc(16px * var(--ui-scale)) }` and make all sizing `rem`/`em`/`%`/`clamp()`. This is native, has no pixel-offset bugs, and respects browser text settings.
   - This is a CSS-conversion task. Do it as one deliberate pass with before/after screenshots.
2. **Delete `zoomTarget.style.transform = 'none'` hacks** and the separate desktop/mobile zoom code paths.
3. **If `zoom` must stay temporarily,** set the same scale on the element and set `width: calc(100% / scale)`. Never put `position: fixed` elements inside it. Check pointer maths.
4. **Use `100dvh`/`svh`** and `min-height`, not `100vh`. Add `meta viewport` with `viewport-fit=cover`. Handle the keyboard by listening to `visualViewport.resize` and scrolling the focused textarea into view.
5. **All form controls at least 16 px** on mobile.
6. **Visual regression pass at fixed breakpoints:** 375x667, 390x844, 768x1024 portrait/landscape, 1440x900, at 90/100/110/125% UI scale, with an edge-content check (screenshot diff, or a script that asserts no element's right edge exceeds `documentElement.clientWidth`).

**Warning signs:**
- A horizontal scrollbar appears on the body at some zoom levels.
- The rightmost card or the settings button is cut off.
- A fixed bottom bar disappears behind the keyboard on iPhone.

**Phase to address:** **P1** (the reported zoom bug) and **P7** (iOS keyboard/viewport).

---

### Pitfall 15: localStorage schema migration that loses user lyrics

**What goes wrong:**
- Multi-song and undo change the storage shape (`haiku_lyrics` is currently one blob).
- A migration that transforms in place and then fails halfway, or parses a corrupted value, destroys the only copy.
- `saveLyrics()` runs per keystroke with a swallowed `catch`. A quota hit loses edits silently (known bug).
- On iOS the tab can be killed without `beforeunload`, losing the debounced save.
- Safari may evict storage after about 7 days of inactivity (Pitfall 10).
- Two tabs overwrite each other.

**How to avoid:**
1. **Inventory every key first** (see Findings 8) and write the migration against that list, including `dictOverrides_v076`, `haiku_savedwords` and `haiku_hashtags`. Add a `schemaVersion` key.
2. **Backup-then-migrate:** copy the raw old value to `haiku_lyrics__backup_v<n>` before touching it. If the backup fails (quota), refuse to migrate and offer a JSON download. Keep the backup for several sessions.
3. **Migrations are idempotent and pure,** from an old object to a new one, wrapped in try/catch. On any failure, leave old data untouched, show a visible message, and run in the old mode.
4. **Never delete or overwrite the old key in the same step.** Remove it only after the new structure has been read back and validated (`JSON.parse` plus shape check).
5. **Debounce saves (about 500 ms) and flush on `visibilitychange` (hidden) and `pagehide`,** not `beforeunload`. Report quota errors with a visible toast and a one-click export.
6. **Give the user export/import** and a periodic "backup nudge". Request `navigator.storage.persist()`.
7. **Guard multi-tab writes:** compare a `rev` counter on save. If it changed, warn rather than clobber (the `storage` event, or `navigator.locks` for the migration step).
8. **Test the migration with fixtures:** a real exported `haiku_lyrics` from today's production, an empty store, a corrupted JSON string, and a store near quota.

**Warning signs:**
- A user reports "my lyrics are gone after update."
- `JSON.parse` exceptions in the ring buffer.
- Lyrics only survive via manual export.

**Phase to address:** **P0** (storage inventory and visible error reporting) and **P5** (migration with multi-song).

---

## Moderate Pitfalls

### Pitfall 16: Mixed render and layout cost from `innerHTML +=` and giant result sets
**What goes wrong:** Hundreds of cards rendered at once, with repeated `innerHTML +=`, freeze phones (the "首次搜尋卡頓" requirement).
**Prevention:**
- Build with one `DocumentFragment` or one `innerHTML` string.
- Render the first about 60 cards, then append more via `IntersectionObserver` or a "show more" button. Pagination is enough; virtual scrolling is not needed.
- Use event delegation on the container instead of per-card handlers.
- Run `requestIdleCallback`/chunked work for index building.
**Phase:** P1.

### Pitfall 17: Stale-asset skew after the split
**What goes wrong:** New `index.html` plus old JS/CSS for up to about 10 minutes on GitHub Pages (`max-age=600`). Users get half-new code.
**Prevention:** version query strings on every asset, one manifest of versions, and an "app version" string in the footer so bug reports include it. Do not add a service worker in this milestone. It brings its own staleness class.
**Phase:** P0.

### Pitfall 18: Wrong frequency (`p`) semantics
**What goes wrong:** `p = 0` means "no data" for libchewing entries, not "cold" (CONCERNS.md). Filtering on `p` removes valid everyday words. The disabled priority filter makes the AI see thousands of candidates.
**Prevention:**
- Add an explicit `src`/"has-frequency" flag.
- Compute a unified `tier` at build time (frequency where known, else heuristics such as length, MOE attestation and character commonness).
- The client only uses `tier`.
**Phase:** P3.

### Pitfall 19: 3-character-plus words pulled from sources are mostly noise
**What goes wrong:**
- Raw phrase lists are full of proper nouns, brands, place names, idioms with sandhi issues and sentence fragments.
- Adding "more 3+ char words" without a filter hurts quality.
**Prevention:**
- Require attestation from at least two signals.
- Cap the length (for example up to 6).
- Drop entries that contain digits/Latin letters/punctuation.
- Spot-audit a sample of 200 additions.
**Phase:** P3.

### Pitfall 20: Rhyme-map semantic mistakes (not just UI)
**What goes wrong:**
- Rhymes are computed on 注音 finals, but lyric rhyme in Mandarin groups finals into 韻部 (the classic 十三轍-style grouping), and 借韻 (BORROW_MAP) rules differ by genre.
- 句尾 vs 句中 vs 內部押韻 get confused with punctuation, spaces and English words.
- 破音字 again changes the class.
**Prevention:**
- Define the rhyme-class rules in one table (reuse the existing BORROW_MAP), shared by search, AI validation and the map, so they cannot disagree.
- Strip punctuation and spaces, and skip non-CJK.
- Show uncertain readings visibly.
- Add 20-30 hand-checked lyric lines as golden tests.
**Phase:** P6.

### Pitfall 21: Sentence-structure analysis presented as fact
**What goes wrong:** Automatic 斷句 such as "3+4" or "2+2+3" is a guess. Auto triggers (select then hover for several seconds) are unreliable on touch and fire constantly while reading.
**Prevention:** the user can edit or override a line's split, and the label says "建議". Triggers are explicit: a button, and select-then-tap on touch. Hover is desktop-only and optional.
**Phase:** P6.

### Pitfall 22: Template-string rendering corrupts or injects text
**What goes wrong:** `<textarea>${s.text}</textarea>` and similar `innerHTML` templates decode `&amp;`-style text and break on `</textarea>`. LLM output and user labels in `innerHTML` are an XSS and corruption vector.
**Prevention:** create elements with `createElement`, then set `.value`/`.textContent`. A tiny `h()` helper is enough, and no framework is needed.
**Phase:** P1 (the textarea case), P5 (editor rebuild).

---

## Minor Pitfalls

### Pitfall 23: Hard-coded absolute paths in the build scripts
**Prevention:** `Path(__file__).parent` and CLI args, and validate that inputs exist. Rebuilding the lexicon on a second machine is a real P3 requirement. (CONCERNS.md.)

### Pitfall 24: Zhuyin codepoint look-alikes
**What goes wrong:** the bopomofo letter ㄧ (U+3127) versus the CJK numeral 一 (U+4E00) and similar look-alikes break lookups and golden diffs.
**Prevention:** normalise on input and in the build, with a unit test.

### Pitfall 25: Google Fonts/CDN dependency
**What goes wrong:** font load failure changes layout metrics and breaks the overlay alignment (Pitfall 11).
**Prevention:** system-font fallback stack with similar metrics, or self-host Noto Sans TC subsets. Low priority.

### Pitfall 26: Settings-page sprawl
**What goes wrong:** toggles for rhyme map, structure analysis, mark position, size and colour multiply states, and each combination is untested.
**Prevention:** a sane default preset, a "reset to default" button, and settings stored in one versioned object (Pitfall 15).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Keep `catch(e){}` "for now" | No refactor needed | Every other pitfall becomes invisible | Never. Replace in P0 |
| Convert to ES modules during the split | "Modern" structure | 79 inline handlers break at once, large regression risk | Later, handler by handler, after tests exist |
| Single KV blob for corrections | One read, one write | Lost updates, 1 write/s per-key limit, consistency hazards | Never. Use per-correction keys |
| Delete suspicious words from data | Smaller, "cleaner" file | Irreversible, hides false positives, loses rare-but-good words | Only hard-drop non-Traditional characters. Otherwise demote |
| Trust the client-sent model name in the Worker | Zero Worker config | Quota abuse, path injection | Never |
| Per-pixel panel positions | Quick to implement | Off-screen panels on other devices | Never for persisted data. Store relative |
| Full undo history in localStorage | "Survives refresh" | Quota exhaustion, silent save failure | Never. Memory only plus a soft-delete toast |
| Highlight by rewriting textarea/contenteditable DOM | Colour in place | Caret and IME bugs, native undo lost | Only behind a read-only view or the Highlight API |
| Ask the LLM to count and to check rhyme | Short prompt | Under-delivery, hallucinations | Never. Code owns count and rhyme |
| Skip the provenance flag in merged data | Simpler build script | Cannot state the licence, cannot remove one source later | Never |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Gemini API | Hard-coded preview/old model IDs, no `finishReason` check, thinking tokens eat the output budget | Verify IDs via list-models, check `finishReason`, set token budget, JSON mode |
| Groq | Assuming `llama-*-versatile` aliases still exist (replaced 2026-08-16 per its deprecations page) | Config-driven model list in the Worker, daily canary |
| GitHub Models | Treating it as an unlimited fallback (tight daily limits) | Last in the chain only, with a visible status |
| Cloudflare KV | Read-your-writes assumption, one big blob, counters in KV, free-plan write cap ignored | Per-item keys, idempotent ops, no counters in KV, budget the writes |
| Cloudflare Worker CORS | Treating `Origin` as authentication | Header-based auth or Cloudflare Access |
| GitHub Pages | Assuming a push is live immediately, ignoring the 10-minute cache | Hashed filenames, cache-busted manifest, verify the live version before clearing the Worker layer |
| OpenCC | Using conversion difference as a classifier, shipping it to the browser | Signals plus demotion, build-time only |
| IndexedDB (Safari) | No quota/eviction handling, un-awaited writes | `storage.persist()`, await puts, visible banner |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Per-entry objects for 233K words plus two Maps | Tab killed or reloaded on iPhone, slow first search | Parallel arrays or lazy chunk parsing, limited concurrency | Mid-range phones, today |
| `Promise.all` over 10 chunks of text | Memory spike at load | Concurrency 2-3, common tier first | Today on mobile |
| All results rendered at once | Long frozen frame after search | Render about 60, append on demand | Hundreds of cards |
| `saveLyrics()` on every keystroke | Typing jank, quota hits | 500 ms debounce plus flush on `pagehide` | Long lyrics, many sections |
| Whole-lyric rhyme re-analysis per keystroke | Input lag | Per-line cache, idle scheduling | About 200+ lines |
| Sequential client-side model fallback with long timeouts | 30 s plus waits | Worker-side chain, 8-10 s per-model timeouts | First time the primary model is down |
| Huge candidate lists in the prompt | Slow, expensive, dropped picks | Pre-rank to about 80-150, chunk | Single-char mode (priority filter off) |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Admin key in the URL | Leaks via history/logs/screenshots | Authorization header or Cloudflare Access |
| Public report text into admin `innerHTML` | Stored XSS leading to admin key theft | `textContent`, CSP |
| Worker accepts arbitrary `model`/`messages`/`max_tokens` | Quota burn, URL path injection | Allowlist and size limits |
| No rate limiting on the LLM and report endpoints | One actor exhausts a shared free quota | Per-IP limits (not in KV) |
| API keys in `localStorage` (`apiKey_*`) for user-supplied providers | Readable by any XSS | Escape all output, avoid third-party scripts, document the risk |
| Open feedback endpoint without caps | KV write budget exhausted | Honeypot, size limits, dedupe, Turnstile only if needed |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Generic or truncated AI error | "它壞了" with no recourse | Plain-language cause plus next step (retry time, switch model) |
| Fewer results than requested with no explanation | Looks like a bug | Always fill to N deterministically, or say how many were found and why |
| Rhyme map colouring everything | 眼花撩亂 (the project's own worry) | Minimal default, per-feature toggles, limited palette |
| Report flow with many steps | Few reports | One-tap report on a word card with the word and reading prefilled |
| Free-position modules on a phone | Unusable layout | Vertical reorder with handles on phones |
| Silent save failure | Lost lyrics | Visible save-state indicator and error toast |
| 破音字 picked silently | Wrong rhyme set with no clue | Reading chips, explicit choice, remembered |

## "Looks Done But Isn't" Checklist

- [ ] **Split of index.html:** every one of the 79 `onclick` handlers still resolves. Verify with the smoke test that clicks them all.
- [ ] **Golden tests:** run in CI or a pre-commit script, and include 破音字 and BORROW_MAP cases.
- [ ] **Lexicon update:** verified cold start, warm start and upgrade-from-old-cache on desktop and a real phone. A mixed-version set cannot occur.
- [ ] **Licenses:** `LICENSES`/`NOTICE` exist, each entry has provenance, and BY-ND data is not redistributed.
- [ ] **TW/PRC cleaning:** canary lists pass (about 100 everyday words kept, about 100 PRC words gone) and a random audit reaches at least 95% precision.
- [ ] **AI pick:** with 200+ candidates and a target of 24, the output is always 24, and the logged out-of-list rate is near 0.
- [ ] **Coined words:** every shown word passes the rhyme validator with the intended reading.
- [ ] **Fallback:** the first model blocked (kill it in the Worker config) and the UI still returns results and names the failed model.
- [ ] **Deprecation:** `gemini-2.5-*` removed or replaced before 2026-10-16, and every ID in the chain verified live.
- [ ] **Correction layer:** approve then immediately re-read in another region or incognito. No double apply, and nothing lost after write-back and clear.
- [ ] **Admin:** no key in any URL, no `innerHTML` of report fields.
- [ ] **Spam:** 100 rapid junk reports do not consume the KV write budget.
- [ ] **Highlighting:** type 注音 continuously for 2 minutes with highlighting on. No caret jump and no lost candidate bar, on desktop Safari and iOS Safari.
- [ ] **Undo:** after drag/reorder/AI insertion, Ctrl+Z undoes exactly one thing.
- [ ] **Touch:** drag, resize and reorder work on a real phone and tablet without page scroll hijack, and "重設版面" exists.
- [ ] **Zoom:** no horizontal scrollbar and no clipped edge content at 90/100/110/125% in all target viewports.
- [ ] **Migration:** a production export of today's `haiku_lyrics` migrates with zero loss, and a forced failure leaves the old data intact.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Refactor regression found late | MEDIUM | `git bisect` against the tagged green states. The golden diff identifies the function |
| Wrong data shipped (over-cleaning) | LOW | `excluded.tsv` plus a demotion field make it a rebuild, not an archaeology job |
| Licence problem found after publishing | MEDIUM | Remove the offending source from the build (provenance flag), rebuild, bump the version, add notices |
| Stale or mixed IndexedDB cache | LOW | Bump `ver`, hashed filenames, clear the old namespace on load |
| Model deprecated overnight | LOW (after P2) | Edit the Worker model list. No front-end release needed |
| Corrections lost or double applied | MEDIUM | Replay from per-correction keys and the append-only log, compare against `appliedCorrectionIds` |
| Leaked admin key | LOW-MEDIUM | Rotate the key, move behind Cloudflare Access, purge URL-key bookmarks |
| User lyrics lost in migration | HIGH | Only recoverable from `__backup_v<n>` or their exports, so the backup step is non-negotiable |
| Caret/IME bug in the editor | MEDIUM | Switch the feature to the read-only map view as a kill-switch setting |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1 No safety net | P0 | Golden + smoke test green before and after the split |
| 2 Licence contamination | P3 (decision gate before sourcing) | `LICENSES` file, provenance flags, no ND data redistributed |
| 3 OpenCC TW/PRC misuse | P3 | Canary lists, random audit at 95% or better |
| 4 破音字 reading mismatch | P0 (cases), P2, P3 | Golden 破音字 cases, coined-word validator tests |
| 5 LLM as rhyme judge | P2 | Count always equals N, out-of-list rate logged near 0 |
| 6 Free-tier instability | P2 | Kill-the-primary drill, daily canary, structured errors |
| 7 KV correction layer | P4 | Idempotency test, version handshake, clear-after-live-verify |
| 8 Admin auth / XSS | P4 (Worker allowlist in P2) | No key in URL, report-text injection test |
| 9 Feedback spam | P4 | Junk-flood test leaves the write budget intact |
| 10 IndexedDB cache and memory | P1, P3 | Cold/warm/upgrade matrix, memory snapshot on a real phone |
| 11 Highlighting vs IME | P6 (rule set in P5) | 2-minute 注音 typing test on desktop and iOS Safari |
| 12 Undo vs IME | P5 | Undo scenarios list (typing, AI insert, drag, delete) |
| 13 Touch drag/resize | P5, P7 | Real-device test, reset-layout works |
| 14 Zoom / iOS viewport | P1, P7 | No clipped edges at all scales and viewports |
| 15 localStorage migration | P0 (inventory), P5 (migration) | Production-export fixture, forced-failure test |
| 16 Render cost | P1 | First-search time on a mid-range phone |
| 17 Stale-asset skew | P0 | Version-string test after deploy |
| 18 `p` semantics | P3 | `tier` built at build time, not filtered on raw `p` |
| 19 3+ char noise | P3 | Random audit of additions |
| 20 Rhyme-map semantics | P6 | Hand-checked lyric golden lines |
| 21 句構 as fact | P6 | Editable splits, explicit triggers |
| 22 Template-string rendering | P1, P5 | Lyrics containing `&amp;` and `</textarea>` round-trip |

## Phase Research Flags

| Phase | Needs deeper research? | Why |
|-------|------------------------|-----|
| P0 Safety net + split | No | Standard pattern, only needs discipline |
| P1 Stability | Light | Memory budget on real iOS devices needs measuring, not research |
| P2 AI reliability | **Yes, small** | Verify live model IDs and the current free-tier limits per provider before design. Gemini 2.5 retires 2026-10-16 |
| P3 Lexicon | **Yes** | Candidate sources and their exact licences, an OpenCC phrase-table review and a legal read of BY-ND/LGPL data |
| P4 Worker/admin | Light | Confirm current KV free limits and the Cloudflare Access/Rate Limiting options on the account |
| P5 Editor | Light | Decide the undo scope, and test `beforeinput` undo behaviour on the target browsers |
| P6 Rhyme map | **Yes** | Choose Highlight API versus read-only view against the real browser matrix, and define 韻部 grouping rules |
| P7 Mobile polish | No | Standard, but needs real-device testing |

## Sources

Read directly from the repo (HIGH):
- `/Users/Shared/Coding Projects/Lucky Hawaii/.planning/PROJECT.md`
- `/Users/Shared/Coding Projects/Lucky Hawaii/.planning/codebase/CONCERNS.md`
- `index.html` (`LLM_MODELS` ~L4449, `loadWordlist` ~L3980-4030, zoom code ~L5748 and L5875-5890, textarea template ~L3941, `localStorage` key inventory)
- `admin/woker.js` (L126-186)
- `data/wordlist-c00.json`, `data/wordlist-meta.json`

Web (MEDIUM unless stated):
- [vChewing VanguardLexicon (corpus composition: 重編國語辭典 CC BY-ND, CNS11643 OGDv1, LibTaBE BSD-3)](https://github.com/vChewing/vChewing-VanguardLexicon)
- [libchewing-data (LGPL data)](https://github.com/chewing/libchewing-data)
- [教育部國語辭典公眾授權網 (CC BY-ND 3.0 Taiwan terms)](https://language.moe.gov.tw/001/Upload/Files/site_content/M0001/respub/index.html)
- [萌典 about page (source and licence of data)](https://www.moedict.org/about.html)
- [Gemini API deprecations](https://ai.google.dev/gemini-api/docs/deprecations)
- [Groq deprecations](https://console.groq.com/docs/deprecations)
- [Gemini free tier changes 2026](https://help.apiyi.com/en/google-gemini-api-free-tier-changes-april-2026-guide-en.html)
- [Cloudflare Workers KV consistency and limits](https://eastondev.com/blog/en/posts/dev/20260422-cloudflare-workers-kv-guide/)
- [contenteditable IME and composition notes](https://contenteditable.realerror.com/docs/ime-composition/)

Known but not freshly verified, which should be confirmed in the relevant phase (LOW-MEDIUM):
- Safari's 7-day script-writable storage cap (WebKit ITP, 2020).
- CSS Custom Highlight API browser versions.
- Exact behaviour of CSS `zoom` with `width:100%` across browsers.
- Free-tier request limits per provider (they change often).
- The Gemini and Groq deprecation pages were summarised by an automated fetch step and should be re-read directly before relying on specific dates.

---
*Pitfalls research for: Taiwan-Mandarin lyric rhyming web tool (好韻器 Lucky Hawaii)*
*Researched: 2026-10-03*
