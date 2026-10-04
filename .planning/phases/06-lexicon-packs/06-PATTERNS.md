# Phase 6: Lexicon Packs 台灣詞庫包 - Pattern Map

**Mapped:** 2026-10-04
**Files analyzed:** 19 (6 modified, 13 new groups)
**Analogs found:** 14 / 19 (the Python tool tree has no in-repo analog; patterns come from RESEARCH.md plus worker/JS references)

All analog paths below were checked with `git ls-files` (tracked). `data/packs/**` and `tools/lexicon/**` do not exist yet. There is no `scripts/` or `tools/` directory in the repo.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `js/wordlist.js` (modify) | service/loader | file-I/O + cache (IDB) | itself (Phase 4 loader) | exact (self) |
| `js/state.js` (modify, `WORDLIST_CHUNKS`, new pack state) | config/state | n/a | `js/state.js:11-21` | exact (self) |
| `js/safety.js` (modify, `LH_KEYS`) | config | CRUD (localStorage) | `lh:uiScale` entry `js/safety.js:26` | exact |
| `js/search-ui.js` (modify, switch handler, About lazy NOTICE) | controller (UI) | event-driven | `toggleSettings` / `toggleAbout` `js/search-ui.js:13-42` | role-match |
| `index.html` (modify, pack list in `#settingsOverlay`, 詞庫來源 block in `#aboutOverlay`, `?v=` bump) | component | request-response | `index.html:138-182` | exact |
| `js/layout.js`-style key wrapper for the pack setting (new small function, put in `wordlist.js` or `search-ui.js`) | utility | CRUD | `js/layout.js:6-40` (`lhNormalizeScale`, `LH_UI_SCALE_KEY`) | role-match |
| `data/packs/index.json` | config (manifest) | batch output | `data/wordlist-meta.json` | role-match |
| `data/packs/<id>/meta.json` | config | batch output | `data/wordlist-meta.json` | role-match |
| `data/packs/<id>/cNN.json` | data (NDJSON) | batch output | `data/wordlist-c00.json` | exact |
| `data/packs/<id>/NOTICE.txt`, `LICENSE.*.txt` | data (static text) | static | none (NOTICE template in RESEARCH.md) | no analog |
| `.gitattributes` (modify) | config | n/a | `.gitattributes:1-2` | exact |
| `tools/lexicon/build.py` + `lex/*.py` | utility/pipeline | batch, transform | none in repo; RESEARCH.md "Rule engine core" | no analog |
| `tools/lexicon/lex/judge.py` (provider adapters) | service | request-response (batch HTTP) | `worker/src/ai.js` (`geminiRequest`, `parseRetryAfterMs`) | role-match (JS to Python port) |
| `tools/lexicon/sources.lock.json` | config | static | RESEARCH.md lock-file excerpt | no analog |
| `tools/lexicon/rules/*`, `judgments/*`, `reports/<id>/*` | data | batch | `data/wordlist-overrides.json` (shape of `added`/`removed`) | partial |
| `tools/lexicon/tests/*.py` + `tests/lexicon-build.spec.mjs` (wrapper) | test | batch | `tests/worker-config.spec.mjs` (uses `execFileSync`/`spawnSync`) | role-match |
| `tests/lexicon-packs.spec.mjs` (output invariants + browser switch) | test | event-driven | `tests/wordlist-cache.spec.mjs` | exact |
| `tests/helpers.mjs` (add `stubPack`) | test util | request-response | `stubWordlist` `tests/helpers.mjs:71-77` | exact |
| `tests/scan.spec.mjs`, `tests/storage.spec.mjs` (count 17 to 18) | test | n/a | lines 69-70, 141 | exact (self) |
| `tests/wordlist-cache.spec.mjs` (extend) | test | event-driven | itself | exact (self) |

## Pattern Assignments

### `js/wordlist.js` (loader, file-I/O + IDB cache)

**Analog:** itself. Current code to refactor, with the exact edit points.

**IDB read (lines 17-30)**: reads `'ver'` and numeric keys `0..WORDLIST_CHUNKS-1` in one readonly tx; returns `{ver, chunks}` or `null`.
```js
st.get('ver').onsuccess = e => { out.ver = e.target.result?.v ?? null; };
for (let i = 0; i < WORDLIST_CHUNKS; i++) st.get(i).onsuccess = e => { out.chunks[i] = e.target.result?.v ?? null; };
```
Change: take `{keyOf, chunkCount}`. Legacy pack: `keyOf(i)=i`, ver key `'ver'`. Other packs: `p:<id>:<i>`, `p:<id>:ver`.

**IDB replace (lines 34-59)**: one readwrite tx, settle-once `fin`, abort on sync exception.
```js
st.delete(IDBKeyRange.bound(0, 1e9));
chunks.forEach((c, i) => st.put({ k: i, v: c }));
st.put({ k: 'ver', v: ver });
```
Change: per-pack range delete `IDBKeyRange.bound('p:<id>:', 'p:<id>:￿')`, update `p:index` registry and LRU-evict beyond active+1 in the same tx. Never `clear()` (shares DB with `backups`). Keep the `fin`/`tx.abort()` structure verbatim.

**Single-promise + load (lines 69-76)**: add `_wlGen` generation counter here.
```js
let _wlP = null;
function loadWordlist() {
    if (wordlistData !== null) return Promise.resolve();
    return _wlP ??= _loadWordlistOnce().catch(e => lhWarn('詞庫載入失敗', e)).finally(() => { _wlP = null; });
}
```
The switch path must null `wordlistData` first (Pattern 4 step 5) and a stale generation must not publish.

**Meta + chunk fetch (lines 84-119)**: meta `fetch(..., {cache:'no-cache'})`, `?v=` suffix, whole-pack discard on any missing chunk.
```js
const suffix = currentVer ? '?v=' + encodeURIComponent(currentVer) : '';
const res = await fetch(`data/wordlist-c${String(i).padStart(2,'0')}.json${suffix}`);
if (chunks.some(c => c === null)) { ...; return; }
```
Change: meta URL, chunk URL and chunk count from the manifest entry (`meta`, `chunkPattern`, `meta.chunks`); default pack with unreachable meta falls back to `WORDLIST_CHUNKS`. Keep v096 URLs and numeric keys byte-identical.

**Overrides (lines 143-187)**: added entries are pushed blindly.
```js
const entry = { w: a.w, z: a.z, p: a.p ?? 1 };
filtered.push(entry);
```
Change: skip if the word already exists in the active pack (Pitfall 14), keep the try/catch return-original-list fallback.

**Error/log pattern:** `lhWarn('詞庫分段 ' + i + ' 載入失敗', e)`; cache write failure goes through `_wlCacheWriteFailed` (toast once). Chinese comments explaining why.

---

### `js/safety.js` (config, register key)

**Analog:** `js/safety.js:8-27`.
```js
// 以 AST 掃描驗證過的 17 個固定鍵（Phase 5 加入 lh:uiScale）
    { key: 'lh:uiScale', group: 'ui' }
];
```
Add `{ key: 'lh:lexiconPack', group: 'setting' }` (new keys use the `lh:` prefix), update the comment to 18. Must be a literal string (scan test enforces). Use `lhGet`/`lhSet` only. Validate the stored id with the manifest AND `^[a-z0-9-]{1,32}$` before use in a URL or IDB key (unknown falls back to default silently, stored value untouched).

Companion test edits (Pitfall 10): `tests/scan.spec.mjs:69-70` (`toHaveLength(17)` and `new Set(keys).size).toBe(17)`) and `tests/storage.spec.mjs:141` (`toHaveLength(17)`) go to 18; check the `FIXTURE` in `storage.spec.mjs` includes every key.

---

### `js/search-ui.js` and `index.html` (settings pack list, About NOTICE)

**Analog:** `toggleSettings` / `closeSettingsOverlay` / `toggleAbout` (`js/search-ui.js:13-42`) and `index.html:138-182`.
```js
function toggleAbout() { document.getElementById('aboutOverlay').classList.toggle('show'); }
```
```html
<div class="settings-dropdown show" onclick="event.stopPropagation()">
    <div class="settings-dropdown-title">⚙️ 偏好設定</div>
    <label class="checkbox-label"><input type="checkbox" id="hideRare" checked><span>隱藏冷僻字</span></label>
```
Copy: static container in `index.html` inside `.settings-dropdown` (reuse `checkbox-label` styling, radio inputs), populated from the manifest in JS with `textContent` only (never `innerHTML`). About: add a 「詞庫來源」 `<pre>` inside `.about-content`, filled lazily with the active pack's `NOTICE.txt` via `textContent`. Switch sequence reset (copy from `js/search.js:119`):
```js
if (input !== lastSearchInput) { suggestedPool.clear(); sentCandidatesSet.clear(); cumulativeCandidates = []; _aiEpoch++; }
```
plus `wordlistData = null; wordPriorityMap = new Map(); wordPhoneticMap = new Map();` (all `let` in `js/state.js:11-12,20`), then `window.__hoyunWordlistReady = loadWordlist()` and re-run the last search. Progress UI: `updateWordlistProgress` (`wordlist.js:61`) / 「詞庫載入中…」. Bump `?v=` on all tags together (split-tags test).

Setting persistence analog: `js/layout.js:6-24` (`LH_UI_SCALE_KEY`, normalize function that collapses any bad value to a default).

---

### `data/packs/index.json`, `data/packs/<id>/meta.json`, chunks (data)

**Analog:** `data/wordlist-meta.json` (`{"version": "2026-05-11T09:51:32Z", "chunks": 10, "total": 233713}`) and `data/wordlist-c00.json` (one `{"w","z","p"}` object per line). Specs: RESEARCH.md Pattern 1 (manifest JSON, `meta.json` fields, content-hash version `<rules_version>.<10 hex>`, 24,000 entries per chunk, sorted by code point, compact separators, `ensure_ascii=False`, no timestamps). v096 manifest entry points at existing `data/wordlist-meta.json` / `data/wordlist-c{NN}.json` with `legacyCache:true`; do not move those files. Add `data/packs/** linguist-generated=true` and `diff=false` to `.gitattributes`, mirroring:
```
data/wordlist*.json linguist-generated=true
data/wordlist*.json diff=false
```

---

### `tools/lexicon/**` (Python 3 stdlib pipeline; no in-repo analog)

Use RESEARCH.md as the pattern source: `classify()` / `resolve()` rule engine ("Code Examples"), `sources.lock.json` excerpt, `RecordedProvider`, `removed.ndjson` line schema, NOTICE template. Conventions to carry over: Chinese comments explaining why; Python 3.9-compatible (no `match`, no `X | Y` at runtime); output sorted and clock-free; raw cache in `~/.cache/lucky-hawaii/lexicon/` (`LEX_CACHE_DIR`), not in the repo; add `"lexicon:build"` to `package.json` scripts (existing style: `"worker:smoke": "node worker/test/dev-smoke.mjs"`).

**`lex/judge.py` Gemini adapter**: port from `worker/src/ai.js:47-60` (key only in header, never URL):
```js
fetch(`${base}/v1beta/models/${encodeURIComponent(m.id)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [...{ role, parts: [{ text }] }], generationConfig }),
```
**Rate-limit handling**: port `parseRetryAfterMs` (`worker/src/ai.js:89-102`): `retry-after` header seconds first, then `error.details[].retryDelay` matching `/^(\d+(?:\.\d+)?)s$/`, else 0. Answer text is `candidates[0].content.parts[].text` joined (line 84-87).

---

### `tests/lexicon-build.spec.mjs` (wrapper for Python unittest)

**Analog:** `tests/worker-config.spec.mjs` (imports `execFileSync, spawnSync` from `node:child_process`, line 3; helper `const git = (...args) => execFileSync('git', args, { encoding: 'utf8' })`, line 10). Pattern: `spawnSync('python3', ['-m','unittest','discover','-s','tools/lexicon/tests'])`, assert status 0 and print stderr on failure. Tests must never call the network or need a key.

---

### `tests/lexicon-packs.spec.mjs` and pack-switch tests

**Analog:** `tests/wordlist-cache.spec.mjs` (imports and stubbing, lines 1-23, 71-103).
```js
import { test, expect } from '@playwright/test';
import { bootPage, settle, CONTEXT_OPTS, routeExternal, collectErrors } from './helpers.mjs';
...
const context = await browser.newContext(CONTEXT_OPTS);
await routeExternal(context, { aiReply: '' });
await context.route(/\/data\/wordlist-meta\.json$/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: state.ver, chunks: 10, total: 10 }) }));
await context.route(/\/data\/wordlist-c0(\d)\.json(\?.*)?$/, async r => { ... });
```
Gate helper (`makeGate`, lines 9-23) is the template for the stale-load race test (switch A to B while A still downloading; assert `wordlistData` is B's). IDB `dump` helper (line 105+) uses `lhIdbOpen()` and `db.transaction('wl','readonly')`; reuse it to prove `p:` keys survive a legacy swap (Assumption A8). Use `realErrors` filter (line 69) for HTTP-500 cases.

**`stubPack` helper** (new, in `tests/helpers.mjs`), copy `stubWordlist` (`tests/helpers.mjs:71-77`):
```js
export async function stubWordlist(context, ndjson) {
    const filler = '{"w":"測試","z":"ㄘㄜˋ ㄕˋ","p":0}\n';
    await context.route(/\/data\/wordlist-c0\d\.json(\?.*)?$/, route => {
        const isFirst = new URL(route.request().url()).pathname.endsWith('wordlist-c00.json');
        return route.fulfill({ status: 200, contentType: 'application/json', body: isFirst ? ndjson : filler });
    });
}
```
New helper routes `data/packs/index.json`, `data/packs/<id>/meta.json` and `data/packs/<id>/c0N.json` from small fixtures so tests never download the real 18 MB packs. Existing default-pack regexes (`/data/wordlist-c0\d.json`) must keep matching because v096 files do not move. `golden.spec.mjs` must stay unchanged (default pack = v0.96).

---

## Shared Patterns

### Storage keys
**Source:** `js/safety.js` `LH_KEYS` + `lhGet`/`lhSet`. **Apply to:** pack setting. Never raw `localStorage`; literal key string.

### Failure visibility
**Source:** `lhWarn(tag, err)` (`js/safety.js:39-42`) and `_wlCacheWriteFailed` (`js/wordlist.js:9-14`). **Apply to:** all new loader branches (manifest fetch failure, bad pack id, cache write). Cache problems warn and fall back to network, never block lookup.

### Single IndexedDB opener
**Source:** `_idbOpen()` returns `lhIdbOpen()` (`js/wordlist.js:3-6`). **Apply to:** all pack cache code. No new DB or store; range-delete only.

### Whole-pack-or-nothing
**Source:** `js/wordlist.js:115-119` (missing chunk discards everything, no cache write). **Apply to:** every pack load.

### Code style
Classic global scripts, no ES modules, 4-space indent, single quotes, Chinese comments (why), camelCase, `_prefix` internals, Traditional Chinese UI only (also in NOTICE and reports; ship English licence texts, no Simplified legal files, Pitfall 15).

### Reproducible outputs
Sorted, no clocks, seeded sampling (`random.Random(f'{id}:{version}')`), `meta.built` rewritten only on hash change.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `tools/lexicon/**` pipeline code | utility | batch/transform | No Python or build tooling in repo (old `scripts/` never pushed); use RESEARCH.md excerpts |
| `sources.lock.json` | config | static | New concept; RESEARCH.md excerpt is authoritative |
| `NOTICE.txt` / `LICENSE.*.txt` | static text | static | No existing NOTICE; use RESEARCH.md template |
| judgments / calibration / samples TSV fixtures | data | batch | New; schema in RESEARCH.md (`詞<TAB>K|D<TAB>model<TAB>prompt_version`; samples columns 詞/注音/來源數/詞頻/預期/說明) |
| Reading-selection (polyphonic rank) | transform | transform | Input is `data/polyphonic-order.json` (tracked); logic specified in RESEARCH.md |

## Metadata

**Analog search scope:** `js/`, `tests/`, `worker/src/ai.js`, `data/`, `index.html`, `package.json`, `.gitattributes`
**Files read:** `js/wordlist.js` (full), `js/safety.js` (1-90), `js/layout.js` (1-40), `tests/wordlist-cache.spec.mjs` (1-110), `tests/helpers.mjs` (71-117), excerpts of `index.html`, `js/search-ui.js`, `js/search.js`, `js/state.js`, `worker/src/ai.js`
**Pattern extraction date:** 2026-10-04
