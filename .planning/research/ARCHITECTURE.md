# Architecture Research

**Domain:** Chinese (Taiwan Mandarin) lyric-rhyming web tool, pure front-end (GitHub Pages) + Cloudflare Worker, no build step
**Researched:** 2026-10-03
**Confidence:** HIGH for codebase-derived findings (I read the code); MEDIUM for browser-behaviour claims (flagged inline); the zoom-bug root cause is a ranked hypothesis, not a confirmed diagnosis.

---

## 0. What the code actually looks like (findings that change the plan)

I read `index.html`, `admin/woker.js`, the admin export script generator and `data/` before writing this. These facts drive the recommendations below. They go beyond the codebase map.

| # | Finding | Where | Why it matters |
|---|---------|-------|----------------|
| F1 | **The DOM is the source of truth for lyrics.** `saveLyrics()` reads `.section-textarea` values back out of the DOM, and sections are rendered by string templates that interpolate `${s.text}` straight into `<textarea>`. | `index.html:3747`, `:3941` | Undo/redo, multi-song tabs and rhyme overlay all need *model first, DOM derived*. This is the single biggest refactor. It is also a latent bug: lyrics containing `</textarea>` break rendering. |
| F2 | **AI fallback is effectively disabled.** All 5 entries of `LLM_MODELS` have `autoFallback:false`. The default `selectedId` is `'gpt-4.1'`, which is not in the list. `findIndex` returns -1, `tryList` ends up empty, and the UI shows 沒有可用模型 unless the user manually picked a model once (it is then saved in localStorage). | `:4449-4457`, `:5187-5198`, `:4479-4488` | This is likely the root of "常失敗／沒回應" for new users. It is a ~5-line fix, so hotfix it before any refactor. Verify at runtime. |
| F3 | **AI "pick 24" logic is a 230-line function with the three rhyme modes copy-pasted** (rhyme / initial / selected-chars), interleaved with DOM writes. The LLM is asked to pick 24 of *all* candidates (could be thousands). Short results trigger a second LLM round, then `generateAIWords` only when candidates are < 24. | `:5038-5271` | Root cause of "candidates plentiful but AI picks few". The fix is architectural (deterministic fill-to-target), not prompt tuning. |
| F4 | `validateWordRhyme` already exists and is mostly pure, but reads globals (`currentRhymes`, `rhymeMode`, `filterSameChar`). `generateAIWords` already calls it. | `:4857-4891`, `:5011` | The validation half of the pipeline exists. It needs parameterising, not inventing. The "造出的詞不押韻" complaint may be partly the `RHYME_TO_FAMILY` family check being too lax or too strict. Needs a test corpus. |
| F5 | **An in-repo correction layer already exists.** `data/wordlist-overrides.json` and `data/rhyme-dict-overrides.json` have the shape `{version, removed[], hidden[], fixed{}, added[], updated_at}`. They are fetched with `cache:'no-cache'` and applied at runtime. Admin generates a standalone `apply_changes_<date>.py` that appends to them and logs to `applied-changes.log`. | `:4034-4076`, `:2755-2800`, `admin/index.html:1049-1190` | The hybrid flow is not new infrastructure. It is a **live tier on top of an existing tier with the same schema**. Reuse the schema and the apply code. |
| F6 | `applyWordlistOverrides()` is **destructive and single-shot**: it replaces `wordlistData` with a filtered copy and mutates entries in place. It can't be re-run with a changed layer. | `:4046-4072` | A runtime KV layer that can change (refresh in the background, admin undo) needs `effective = apply(base, layers)` as a pure function over an immutable base. |
| F7 | Wordlist chunks are **NDJSON saved with a `.json` extension**. Cache validation is `wordlist-meta.json.version` (a timestamp). `wordlist-meta.json` is fetched **without** `no-cache`. | `:3991`, `:4008`, `data/wordlist-c00.json` | On GitHub Pages (`max-age=600`, below) a stale meta plus new chunk files can produce a version-label/chunk-content mismatch cached into IDB. |
| F8 | **79 inline `onclick=` handlers** (plus 5 `oninput/onchange/onkeydown`), many inside JS template strings. 23 references to `lyricsSections`. | `index.html` | ES modules do not create globals, so every inline handler breaks the moment the script becomes `type=module`. A bridge is mandatory during migration. |
| F9 | Section drag uses the HTML5 Drag-and-Drop API (`draggable`, `ondragstart`). | `:3928-3933` | HTML5 DnD doesn't fire on touch in most mobile browsers. The "draggable module" requirement needs Pointer Events, not a patch of the old code. |
| F10 | `/reports.json` does `list()` over the **whole** `USER_FEEDBACK_KV` and parses every value as a report. | `admin/woker.js:53-63` | If the correction layer is stored as a key in that namespace it will appear as a bogus report. Use a separate KV namespace. Also, `list()` returns at most 1000 keys, and N reads per call count against the 100k/day free quota. |
| F11 | Admin key travels as `?key=` query param; Worker CORS only allows `Content-Type`. | `woker.js:9-16,49` | New admin endpoints are the right moment to switch to an `Authorization` header (add to `Allow-Headers`). Not blocking, but do it for the new routes. |
| F12 | Zoom: desktop slider sets `.container.style.zoom`; mobile ± buttons do the same. `.container` is `height: calc(100vh - 40px)` + `overflow:hidden`, side panels are `position:fixed` bottom-sheets at ≤900px. | `:63-75`, `:5874-5889`, `:5746-5756`, `:1547-1560` | See §8 for the ranked hypotheses. |

**Environment facts (verified):**
- GitHub Pages serves with `Cache-Control: max-age=600`, no custom headers possible. MEDIUM (community sources, consistent across several reports).
- Cloudflare KV free plan: 100,000 reads/day, 1,000 writes/day, same-key writes 1/s, values up to 25 MiB, minimum `cacheTtl` 30 s, global propagation "up to 60 seconds or more". HIGH (official docs, fetched 2026-10-03).
- CSS `zoom` is Baseline 2024 (standardised) but historically had engine-specific interactions with viewport units and `position:fixed`. MDN does not spell out the `vh` behaviour. MEDIUM-LOW.
- `<script type="module">` and `<script defer>` (classic) share the same ordered "execute after parse" queue. This is the HTML spec, and it is what makes the strangler technique in §1 work. MEDIUM-HIGH. Verify with a 5-line test page first.
- ES modules do not load from `file://` (CORS). Dev must use a local http server (`python3 -m http.server`, or the devcontainer). This is a workflow change for Andy.

---

## 1. Recommended Architecture

### System overview (target state)

```
┌──────────────────────────── BROWSER (GitHub Pages, no build) ────────────────────────────┐
│                                                                                          │
│  UI layer (DOM, imperative, thin)        index.html = markup shell + <link> + 2 scripts  │
│  ┌────────────┐ ┌─────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐  │
│  │ search/    │ │ char cards  │ │ editor (tabs,│ │ rhyme overlay│ │ settings, toasts,│  │
│  │ results    │ │ (paginated) │ │ sections,DnD)│ │ + gutter     │ │ feedback modal   │  │
│  └─────┬──────┘ └──────┬──────┘ └──────┬───────┘ └──────┬───────┘ └────────┬─────────┘  │
│        │  user events → actions          │ model changes → re-render          │           │
│  ──────┴────────────────┴────────────────┴────────────────┴──────────────────┴────────   │
│  State / services layer (owns state; no DOM)                                             │
│  ┌──────────────┐ ┌──────────────┐ ┌────────────────┐ ┌──────────────┐ ┌─────────────┐  │
│  │ songs-store  │ │ history      │ │ lexicon        │ │ settings     │ │ llm-client  │  │
│  │ (model+save) │ │ (undo/redo)  │ │ (load+layers)  │ │ store        │ │ (→ Worker)  │  │
│  └──────┬───────┘ └──────────────┘ └───────┬────────┘ └──────────────┘ └──────┬──────┘  │
│         │ storage.js (safeGet/Set, schema migrate)   │ IDB cache + fetch         │         │
│  ───────┴────────────────────────────────────────────┴────────────────────────┴───────   │
│  CORE (pure functions, no DOM, no window, no fetch → node --test)                        │
│  ┌───────────┐ ┌────────────┐ ┌─────────────┐ ┌──────────────────┐ ┌─────────────────┐   │
│  │phonetics  │ │rhyme-index │ │rhyme-query  │ │lyrics-analysis   │ │ai-pipeline      │   │
│  │(tables,   │→│(BORROW_MAP,│→│(match,      │→│(lines, rhyme map,│ │(orchestrator,   │   │
│  │ tone/init)│ │ families)  │ │ validate)   │ │ section compare) │ │ deps injected)  │   │
│  └───────────┘ └────────────┘ └─────────────┘ └──────────────────┘ └─────────────────┘   │
│  overrides.js: applyOverrides(base, [repoLayer, kvLayer])  ← pure, idempotent            │
└──────────────┬───────────────────────────────────────────────────────┬───────────────────┘
               │ fetch (static)                                         │ fetch (CORS, origin-locked)
┌──────────────▼──────────────┐                     ┌──────────────────▼─────────────────────────┐
│ GitHub Pages: data/         │                     │ Cloudflare Worker (admin/woker.js)          │
│  lex2/ chunks + meta        │                     │  POST /ai/complete  (fallback chain, norm.)  │
│  wordlist-overrides.json    │                     │  GET  /layer.json?since=rev   (public)       │
│  rhyme-dict(.json/.js)      │                     │  POST /layer/apply|clear      (admin)        │
└──────────────▲──────────────┘                     │  /feedback, /reports*         (existing)     │
               │ git push                           │  KV: FEEDBACK_KV (existing), LAYER_KV (new)  │
┌──────────────┴──────────────┐                     └──────────────────▲─────────────────────────┘
│ Offline (Andy's Mac)        │   export + clear(upto=rev)             │
│  scripts/lex/*.py pipeline  │◄───────────────────────────────────────┘
│  scripts/apply_layer.py     │      admin/index.html (reviewer UI)
└─────────────────────────────┘
```

**Dependency rule (enforce by convention and a one-line grep in the smoke test):** `core/` imports only other `core/`. `data/`/state modules import `core/`. `ui/` imports anything. Nothing imports `ui/`. The legacy file is the only thing allowed to touch everything, and it shrinks monotonically.

### Component boundaries

| Component | Owns | Talks to | Must NOT |
|-----------|------|----------|----------|
| `core/phonetics.js` | Zhuyin/Pinyin tables, tone/initial/final parsing | nothing | read `window`, `charInfo` |
| `core/rhyme-index.js` | `BORROW_MAP`, `RHYME_TO_FAMILY`, `buildCharIndex(rhymeDict, overrides)` → `charInfo` | phonetics | keep module-level mutable state; return the index instead |
| `core/rhyme-query.js` | `makeQuery(input, mode, opts)` → `RhymeQuery`; `matchWord(query, word, index)`; `validateWord()` (replaces `validateWordRhyme`) | rhyme-index | read `currentRhymes`/`rhymeMode` globals |
| `core/lyrics-analysis.js` | `analyze(song, index, opts)` → `Analysis` (§7) | rhyme-index | touch DOM, `localStorage`, fetch |
| `core/overrides.js` | `applyOverrides(baseWords, layers)`; idempotent set-merge (§5) | nothing | mutate `base` |
| `core/ai-pipeline.js` | `suggest({query, target, ctx}, deps)` → `{picked, filled, generated, stats, errors}` (§6) | injected `deps` | call `fetch`/DOM directly |
| `data/lexicon.js` | load + IDB cache + `ready` promise + layering → exposes `words`, `index` | core/overrides, Pages, Worker `/layer.json` | render UI |
| `data/storage.js` | `safeGet/safeSet` (surfaces quota errors), schema version, migrations | localStorage | know about songs |
| `data/songs-store.js` | song model, CRUD, autosave, `subscribe()` | storage, history | read DOM |
| `data/history.js` | per-song undo/redo ring buffer | songs-store | persist (v1) |
| `services/llm-client.js` | one `complete(prompt, opts)` call to Worker | Worker | build prompts |
| `ui/*` | DOM, events, layout, rendering | everything above | hold canonical state |
| Worker | proxy + provider fallback + correction layer + feedback | LLMs, KV | know rhyme rules (no shared bundle) |

### Target file structure

```
index.html                 # markup shell; <link> css; <script type=module src=js/boot.js>; <script defer src=js/legacy.js>
css/        tokens.css  base.css  layout.css  components.css  themes.css   # concatenation order == old <style> order
js/
  boot.js                  # imports modules, installs the global bridge, runs init order
  legacy.js                # the old inline script, shrinks over time (classic, defer)
  core/    phonetics.js rhyme-index.js rhyme-query.js lyrics-analysis.js overrides.js ai-pipeline.js
  data/    lexicon.js storage.js songs-store.js history.js settings-store.js
  services/ llm-client.js feedback-client.js
  ui/      editor.js tabs.js section-dnd.js rhyme-overlay.js settings-panel.js layout.js cards.js
tests/     core/*.test.mjs  storage-migrate.test.mjs  fixtures/{localStorage-v1.json, lyrics-samples.json}  smoke.mjs
scripts/lex/  01_ingest.py 02_normalize.py 03_filter.py 04_score.py 05_emit.py  lists/{allow,deny,tw-terms}.txt  report/
admin/woker.js             # do NOT rename (deploy path); add routes in place
```

### Pattern 1: Strangler with a global shim (how to split without breaking anyone)

**What:** Never "convert the file". Move one *region* at a time out of `legacy.js` into a module, and make `boot.js` re-attach its exports to `globalThis` so the untouched legacy code and the 79 inline `onclick`s keep resolving bare names.

```html
<!-- index.html: order matters; module scripts and defer scripts run in document order after parse -->
<script src="data/rhyme-dict.js"></script>            <!-- existing classic globals, unchanged -->
<script src="data/polyphonic-order.js"></script>
<script type="module" src="js/boot.js?v=0.97"></script>
<script defer src="js/legacy.js?v=0.97"></script>      <!-- runs AFTER boot.js and its imports -->
```
```js
// js/boot.js
import * as phon from './core/phonetics.js';
import * as rq from './core/rhyme-query.js';
// transitional shim: delete a line when the last legacy caller is converted
Object.assign(globalThis, { getZhuyinInitial: phon.getZhuyinInitial, validateWord: rq.validateWord /* ... */ });
```

**State moves with its owner.** If a moved function needs `lyricsSections`, you don't import the legacy `let`. The new owner (`songs-store`) holds the state and legacy gets an accessor so bare-name reads keep working:
```js
Object.defineProperty(globalThis, 'lyricsSections', { get: () => songs.active().sections, set: v => songs.setSections(v) });
```
(Requires removing the legacy `let lyricsSections` declaration in the same commit. A declared `let` would shadow the accessor.)

**Trade-offs:** The shim is ugly but short-lived. The alternative, converting the whole file to `type=module` in one go, breaks every inline handler and every sloppy-mode construct at once.

**Pre-flight before any move (cheap, finds blockers):** add `'use strict';` at the top of the existing inline script and click through the app once. Modules are always strict, so any implicit global / duplicate param / octal literal throws now instead of mid-migration.

### Pattern 2: Model-first rendering for the editor (resolves F1)

`songs-store` owns `{songs[], activeId}`. UI is `render(song)` plus delegated events. A textarea `input` event calls `songs.setText(sectionId, value)`. It never calls `querySelector(...).value` to read state back. Re-render only structural changes (add/remove/reorder section, switch tab). Never re-set `textarea.value` while the user is typing, or caret/IME composition breaks.

Replace inline handlers with delegation as each region is rewritten:
```html
<button data-action="saveWord" data-word="好">…</button>
```
```js
document.addEventListener('click', e => { const el = e.target.closest('[data-action]'); if (el) actions[el.dataset.action]?.(el.dataset, e); });
```
Escape text with `textContent`/`.value =` after creation, never `${s.text}` in template strings.

### Pattern 3: Dependency injection for anything that touches the outside world

`ai-pipeline` and `lyrics-analysis` take `deps = { index, llm, now, rand }`. Tests pass fakes. This is what makes "rhyme map engine testable" real: `rhyme-dict.json` is read with `fs` in Node, and no browser is needed.

---

## 2. Safe incremental split of `index.html` (ordering for parallel work)

**Principle:** moves and behaviour changes never share a commit. Move-only commits are reviewed by diffing `git diff --color-moved` (or by concatenating the new files and diffing against the old file).

| Step | What | Risk | Parallel-safe? |
|------|------|------|----------------|
| S0 | **Safety net.** (a) `tests/fixtures/localStorage-v1.json` from Andy's real browser (lyrics, hashtags, overrides, saved words). (b) `tests/smoke.mjs`: Playwright (or a manual checklist if Playwright is too heavy) loads the page over http, searches 愛, expects cards, types lyrics, reloads, expects persistence, no console errors. (c) "匯出備份" JSON button in the existing UI before any storage change. (d) `'use strict'` dry run. | none | first, alone |
| S0.5 | **Ship tiny standalone hotfixes in place** (≤10 lines each, no moves): F2 default-model/fallback bug, `cache:'no-cache'` on `wordlist-meta.json` fetch, `safeSet` wrapper that toasts on quota failure. | low | yes, before S1 |
| S1 | **CSS out.** `<style>` (lines 14-2176) → `css/*.css`, same order, linked in `<head>`. Byte-identical rules. | very low (render-blocking `<link>` so no FOUC) | **do first among splits**: unblocks zoom/layout lane (§8) |
| S2 | **Inline script → `js/legacy.js`** (classic, `defer`, byte-identical) + `js/boot.js` (empty module). No semantic change. | low. Check script position: the inline script is at end of body so `defer` ≈ same timing. Anything that ran before `DOMContentLoaded` handlers is unaffected. | after S2, **bug fixes and features go to files**, so merges stop colliding on one 6000-line hunk |
| S3 | **Leaf extraction in dependency order**, one commit each, shim attached: `phonetics` → `rhyme-index` (take lines 2494-2725 tables) → `rhyme-query` (parameterise `validateWordRhyme`) → `overrides` (pure rewrite of `applyWordlistOverrides`). Each gets a `node --test` file at the same time. | medium (the parameterisation) | this is the "core" unlock for lanes B, C |
| S4 | **Extract-by-rewrite, not by move, for regions that are being rebuilt anyway**: AI suggest (lines 4290-5271) → `core/ai-pipeline.js` + `ui/ai-panel.js`; editor/section code (3743-3948) → `data/songs-store.js` + `ui/editor.js`; zoom/layout → `ui/layout.js`. Delete the legacy block in the same PR that lands the replacement. | medium-high | each lane owns its region; no two lanes touch the same legacy lines |
| S5 | **Stop.** Leave stable regions (theme/colors 5842-6027, context menus 6034-6223, card rendering 3447-3563) in `legacy.js` until someone touches them for another reason. A finished split is not a goal. | none | n/a |

**Cache coherence on GitHub Pages (10-minute max-age):** a user can briefly hold a new `boot.js` and an old module. Mitigations, cheapest first: (1) put `?v=<APP_VERSION>` on the two entry scripts and on `css/*.css`. (2) Make cross-module API changes **additive** within a release. (3) Only if mixed-version bugs are actually observed, add an `<script type="importmap">` that maps each module specifier to a versioned URL, stamped by a 20-line `scripts/stamp_version.py`. Recommendation: do (1)+(2) now and defer (3) until it bites.

**Ordering rule for fixes during the split:** a bug whose fix lives in a region scheduled for S4 rewrite is fixed *by the rewrite* (do not patch the legacy copy twice). A bug in a stable region (S5) is fixed in place in `legacy.js` after S2, any time.

---

## 3. Persistence and migration

### Inventory of what exists (all must keep working)

| Store | Key | Shape | Disposition |
|-------|-----|-------|-------------|
| localStorage | `haiku_lyrics` | `[{label,text}]` | **migrate** into songs |
| localStorage | `haiku_hashtags` | `string[]` (global) | migrate into first song's `hashtags` |
| localStorage | `haiku_savedwords` | `string[]` | keep as-is (global pool); out of scope to change |
| localStorage | `dictOverrides_v076` | user tier overrides | keep as-is (personal layer; the `_v076` suffix shows an earlier ad-hoc migration) |
| localStorage | `haoYunQi_inputMode`, `selectedModel`, `apiKey_*`, `hoyun_theme_mode`, `bgColor1/containerBg/textColor/highlightColor`, `*PanelCollapsed`, `contextSectionCollapsed`, `savedPoolCollapsed` | scalars | **leave untouched** (YAGNI to migrate; zero user value) |
| IndexedDB | DB `haoYunQi` v1, store `wl`, keys `'ver'` and `0..9` | chunks | keep; new dataset uses prefixed keys in the same store (§4) |

### Schema v2 (new keys only; old keys are never rewritten after migration)

```
lh:schema            "2"
lh:songs:index       [{id,title,updatedAt,order,hidden}]          // small; read at boot
lh:song:<id>         {id,title,sections:[{id,label,text,box?}], hashtags:[], context:"", rev, createdAt, updatedAt}
lh:settings          {rhymeMap:{enabled,endRhyme,innerRhyme,lineShape,compare, markPos:"end|under|none", fontScale, palette}, panel:{songTabsOpen}}
lh:backup:v1         {haiku_lyrics, haiku_hashtags, at}           // verbatim copy made once, at migration
```

- `box` in a section is optional layout (`{x,y,w,h}`) for the draggable-module feature; absent means flow layout.
- **Do not store undo history in localStorage** and **do not move songs to IndexedDB**. Rationale: 100 songs at ~5 KB is ~500 KB, far under the quota. Undo across reloads is not in the requirements. This removes an IDB version bump (and its cross-tab `VersionError` hazards) from the plan. Revisit only if quota errors show up in the field (`safeSet` will report them).
- Songs are separate keys so that autosaving a keystroke rewrites one small value, not the whole library.

### Migration algorithm

```js
// data/storage.js, runs once at boot BEFORE any UI reads songs
export function migrate(ls = localStorage) {
  const v = Number(ls.getItem('lh:schema') || 1);
  if (v >= 2) return;
  const old = { lyrics: parseOr(ls.getItem('haiku_lyrics'), null), tags: parseOr(ls.getItem('haiku_hashtags'), []) };
  ls.setItem('lh:backup:v1', JSON.stringify({ ...old, at: Date.now() }));   // 1. backup first
  const id = newId();                                                        // 2. build v2 in memory
  const song = { id, title: '未命名', sections: (old.lyrics ?? [{label:'',text:''}]).map(s => ({ id: newId(), ...s })),
                 hashtags: old.tags, context: '', rev: 1, createdAt: Date.now(), updatedAt: Date.now() };
  ls.setItem(`lh:song:${id}`, JSON.stringify(song));                         // 3. write data
  ls.setItem('lh:songs:index', JSON.stringify([{ id, title: song.title, updatedAt: song.updatedAt, order: 0 }]));
  ls.setItem('lh:schema', '2');                                              // 4. flip the flag LAST (crash-safe: re-runs cleanly)
}   // old keys intentionally NOT deleted for ≥1 release (rollback + stale-tab safety)
```

Properties that matter:
- **Crash-safe and idempotent:** the flag flips last, and earlier writes overwrite harmlessly on retry. A failed `setItem` (quota) aborts before the flag, so the app keeps using v1 keys and shows a toast.
- **Forward-only plus a retained backup:** rollback = delete `lh:schema`, the old code still finds `haiku_lyrics` untouched.
- **Stale-tab hazard:** a tab still running old code keeps writing `haiku_lyrics` after migration, and the new code ignores it. Mitigate with a `storage` event listener in the new code: if `haiku_lyrics` changes after `lh:schema=2`, toast 「偵測到舊版分頁仍在編輯，請關閉它」. Also handle two *new* tabs: on `storage` event for `lh:song:<id>` compare `rev` and offer reload. Do not build merge logic (single-user tool).
- **Future migrations:** a `MIGRATIONS = {2: fn, 3: fn}` map keyed by target version, applied in order. Tested with the `localStorage-v1.json` fixture: `migrate(fixtureStorage)` then assert song count/text equal, `haiku_lyrics` still present.
- Ask for `navigator.storage.persist()` once, on first song creation. It costs nothing and reduces eviction risk on Safari/iOS (MEDIUM, browser-dependent).

### Undo/redo (in-memory, document-level)

- **Snapshot-at-commit model.** A commit is: textarea blur, 800 ms idle after `input`, or any structural op (add/delete/reorder section, tab rename, AI insert). Each commit pushes `JSON.stringify(song)` (a few KB) onto a ring buffer capped at ~100. Undo restores the snapshot into the store, and the store re-renders. No diffing library.
- **Why not native textarea undo?** It survives only until `textarea.value` is assigned programmatically (AI insert, section re-render, drag reorder), and it can't undo structural edits. Intercept with `beforeinput` where `inputType === 'historyUndo'|'historyRedo'`, call `preventDefault()`, and route to the store. MEDIUM: verify on iOS Safari (it supports these input types, but test).
- Per-song history, cleared on tab close; switching tabs preserves each song's buffer in memory.

---

## 4. Lexicon pipeline: replacing/cleaning the wordlist, shipping a versioned dataset

### Offline pipeline (Python, deterministic, re-runnable, no per-word AI)

```
sources ─► 01_ingest ─► 02_normalize ─► 03_filter ─► 04_score ─► 05_emit ─► data/lex2/
(vChewing,   raw.tsv     NFC, trad.      rules +      freq +      NDJSON      chunks + meta
 libchewing,             forms, z check  deny/allow   tier        by tier      + report
 new TW source)                          lists
```

| Stage | Does | Output / artefact |
|-------|------|-------------------|
| ingest | Download/read sources, tag each row with `src` | `build/raw.tsv` (gitignored) |
| normalize | Unicode NFC; require `len(syllables)==len(word)` (the existing check); drop non-CJK; normalise zhuyin tone encoding | `build/norm.tsv` |
| filter | **Rule-based**: reject if any char is simplified-only (via OpenCC `s2t` round-trip or a character set from the rhyme dict, since a char absent from `charInfo` is un-rhymeable anyway); reject known Mainland-only terms (a derived list from OpenCC `s2twp` phrase table plus a hand-kept `deny.txt`); reject classical/rare via `tier` of constituent chars (`charInfo` tier ≥ 2); keep anything in `allow.txt` | `build/kept.tsv`, **`build/rejected.tsv` with a reason column** |
| score | Frequency `p` from source counts, boosted by a Taiwan-usage signal if one is available; derive length buckets (≥3-char words promoted so they aren't buried) | `p` integer |
| emit | Sort by `p` desc, split into chunk files by priority tier, write NDJSON `{w,z,p}` (the same record shape the client already parses), write `lex-meta.json` with per-file SHA-256 | `data/lex2/*` |
| report | Counts per stage, per reject reason, **50 random kept + 50 random rejected samples** | `scripts/lex/report/<date>.md` committed |

Why this satisfies "no manual review of 100k, no token burn": the human reviews the **report** (reject-reason histogram and a 100-row sample) and edits two small list files (`deny.txt`, `allow.txt`). If an LLM is used at all, restrict it to the borderline band only (low-confidence rule outcomes, say ≤ 3000 words), run offline once, and cache results by word hash in `scripts/lex/cache/llm_labels.jsonl`. Never at runtime. Treat as optional.

**Build-time self-checks (assert, fail the build):** every `z` has `len(w)` syllables, no word contains a char outside `charInfo`, no duplicate `w`, total count within ±X% of the previous build (catches a source outage producing a half-empty set). Reuse the existing `isValidZhuyin` logic from the admin exporter.

### Shipping and cache invalidation

```jsonc
// data/lex2/lex-meta.json   (fetched with cache:'no-cache')
{ "schema": 2, "version": "2026-10-20.1", "built": "…",
  "files": [ {"name":"w-0.3fa91c.ndjson","n":24000,"sha":"3fa91c…"}, … ],
  "absorbed_layer_rev": 41 }
```

- **Content-hash chunk filenames** → a chunk URL never changes content, so the 10-minute CDN cache cannot produce version-skew. Only `lex-meta.json` is mutable, and it is fetched `no-cache` (revalidation is one tiny conditional request). This fixes F7.
- **IDB keys are namespaced** in the *existing* store: `lex2:ver`, `lex2:<filename>`. No `indexedDB.open(…, 2)` bump, so there is no cross-tab `VersionError` risk. After the new set loads successfully, delete the old numeric keys and `'ver'` to reclaim ~13 MB.
- **Per-file validation:** compare `n` to the parsed row count; on mismatch, discard that chunk and refetch. A half-cached set therefore self-heals.
- **Old files stay in `data/` for one release** so a stale `index.html` in someone's cache (≤10 min) still works. Delete `wordlist*.json` the release after.
- **Load order matches priority:** chunks are tiered by `p`, so the client can make `ready` resolve after the first N chunks (enough for candidate retrieval) and continue the rest in the background. This directly addresses first-search lag and the race condition in CONCERNS (`lexicon.ready` replaces the `wordlistLoading` boolean; the AI pipeline `await`s it).
- Build artefacts (`build/`) are gitignored. `data/lex2/` and the report are committed.

---

## 5. Hybrid correction flow (admin approve → KV layer → merge → export → clear)

### Design rule: the layer is **declarative state, not an op log**

Use the **same schema as the existing `wordlist-overrides.json`** plus a revision stamp per entry. Merge is a set-union with last-write-wins per key, so applying the same layer twice (or applying a layer that has been absorbed into `data/`) is a no-op. This is what makes "clients don't double-apply" safe by construction, and the `rev` guard is a belt on top.

```jsonc
// Worker KV (LAYER_KV, key "layer")  → served by GET /layer.json
{ "rev": 44,                     // monotonically increasing, bumped on every admin apply
  "floor": 41,                   // highest rev already absorbed into data/ (set by /layer/clear)
  "words":  { "removed": {"奏草": 42}, "hidden": {"團圍": 43}, "fixed": {"周偉航": {"z":"…","r":44}}, "added": {"夜航": {"z":"ㄧㄝˋ ㄏㄤˊ","p":3,"r":44}} },
  "chars":  { "fixed": {…}, "added": {…} } }          // rhyme-dict corrections, same {value, r} wrapper
```

### Runtime merge order (lowest → highest precedence)

```
base chunks (lex2, IDB-cached, immutable)
  → data/wordlist-overrides.json          (repo tier, no-cache)       absorbed_rev = N
    → KV layer entries with r > N          (live tier)                 ← ignores anything the repo already absorbed
      → localStorage dictOverrides_v076    (personal tier, this device only)
```

`effective = applyOverrides(base, [repoLayer, kvLayer.filter(r > repo.absorbed_rev), userLayer])`, **pure and re-runnable** (replaces the destructive F6 implementation). A merge pass over ~230k entries is a single filter/map, tens of ms. On layer refresh, rebuild derived maps (`wordPriorityMap`, `wordPhoneticMap`, rhyme index) from `base` again. Never patch the previously-merged copy.

### Client fetch behaviour

1. Boot: apply `localStorage['lh:layer']` (cached copy) immediately so a slow network never blocks the lexicon.
2. In the background, `GET /layer.json?since=<cachedRev>`. Worker answers `{rev, unchanged:true}` (tiny) or the full layer. Update the cache and re-merge if `rev` changed.
3. Worker responds with `Cache-Control: public, max-age=60` and an `ETag` of `rev`. KV read uses `cacheTtl: 60`. At 100k reads/day free quota this is fine for a hobby user base. Keep a counter in the Worker logs so it's visible if it ever approaches the limit.
4. Network or Worker failure → silently keep the cached layer (the core value, searching, must never depend on the Worker).

### Admin and Worker (new routes; separate namespace per F10)

| Route | Auth | Behaviour |
|-------|------|-----------|
| `GET /layer.json?since=` | public | described above |
| `POST /layer/apply` `{ops:[…], expectRev}` | `Authorization: Bearer` | read-modify-write the single `layer` key; reject 409 if `expectRev !== rev` (prevents two admin tabs clobbering; same-key writes are limited to 1/s anyway); each touched entry gets `r = ++rev` |
| `POST /layer/clear` `{upto: N}` | admin | delete entries with `r ≤ N`, set `floor = N`. **Entries added after the export (r > N) survive.** |
| `POST /layer/revert` `{keys:[…]}` | admin | one-click undo of a bad approval before export |

Write budget: one write per approve action (1000/day free). Batch "approve all selected" into one `/layer/apply` call.

### Export script flow (replaces the pasted `apply_changes_<date>.py` generator)

```
1. python scripts/apply_layer.py            # fetches GET /layer.json?key… (admin), records N = rev
2. merges layer entries (r > floor) into data/wordlist-overrides.json / rhyme-dict-overrides.json
      sets "absorbed_rev": N, appends to applied-changes.log  (same log the old exporter used)
3. (optional, when the override file grows) fold overrides into the next lexicon build: scripts/lex re-run; lex-meta.absorbed_layer_rev = N
4. git add data && git commit && git push                    # Andy
5. WAIT for Pages deploy (≈1-2 min) and verify by fetching the live URL (script prints a check)
6. python scripts/apply_layer.py --clear N   # POST /layer/clear {upto: N}
```

**Why steps 5→6 ordering plus `absorbed_rev` closes the race:** between push and Pages deploy, clients still see the KV layer (correct). After deploy but before clear, clients see both repo (absorbed_rev=N) and KV; entries with `r ≤ N` are ignored on the KV side and are idempotent anyway. After clear, the KV holds only `r > N`. A client with a stale cached `index.html` or stale `wordlist-overrides.json` for ≤10 min simply keeps the KV layer, because it was cleared only after the verified deploy, with the same data present in both. **Never clear before the deploy is live.**

Keep the existing admin "匯出 agreed" `.py` generator working until the new script is proven (no flag day). Both write the same files.

---

## 6. AI suggestion pipeline (where logic lives and how it's shaped)

### Placement decision

| Logic | Lives in | Why |
|-------|----------|-----|
| Candidate retrieval (rhyme/initial/selected-char), priority sort, exclusion of pool/saved | **Client** (`core/rhyme-query.js` + `data/lexicon.js`) | The 230k-word lexicon and rhyme index are already client-side. Moving retrieval to the Worker means shipping 13 MB to KV/Worker for no benefit. |
| Prompt building, fill-to-target, validation of generated words | **Client** (`core/ai-pipeline.js`) | Needs `charInfo`, user context, saved words. Pure and testable in Node. |
| Provider call, **model fallback chain**, response normalisation, model-list config | **Worker** (`POST /ai/complete`) | Provider/model churn (free-tier changes, deprecated model ids) is fixed by redeploying the Worker or editing a KV config, not by users refreshing past a 10-minute cache. The client sends `{prompt, maxTokens, prefer?}` and gets `{text, model, tried:[{model,status}]}` or a structured error. |
| Rate limiting / abuse control | **Worker** | Origin header is spoofable. Add a coarse per-IP counter (Workers `request.headers.get('CF-Connecting-IP')` + KV/Cache API) when quota abuse becomes visible. Not now (YAGNI). |

The Worker stays rhyme-agnostic. Don't bundle rhyme rules into it (no build tooling there, and duplicating rules invites drift).

### The pipeline (one function, one query abstraction, no DOM)

```
RhymeQuery  = { kind:'rhyme'|'initial'|'chars', slots:[…], sameChar?, chars? }   // replaces the 3 copy-pasted branches
candidates  = retrieve(query)        // deterministic, sorted by p desc, minus pool/saved
if |candidates| ≥ target:
     shortlist = top K by p (K ≈ 80–120, not thousands)         // bounded prompt, better picks, cheaper tokens
     picks     = parse(llm.pick(shortlist, ctx, target)) ∩ shortlist
     result    = picks ++ fillByPriority(shortlist ∪ rest, exclude picks, to target)   // ← guarantees target reached
else:
     result    = candidates                                        // show all, honestly
     need      = target - |candidates|
     gen       = llm.generate(query, need×2, exclude=result)
     gen       = gen.filter(w => validate(w, query) && !simplifiedOrUnknownChar(w) && notDup)
     result   += gen[:need]                                        // max ONE generation round
report { picked, filled, generated, shortBy }   // UI shows "挑出 X、補齊 Y、AI 造詞 Z"
```

Root-cause mapping to the PROJECT bugs:
- **"candidates ≫ target but AI picks few, then generates"** → eliminated: the LLM *influences order*, a deterministic fill reaches the target, generation is reachable **only** when `|candidates| < target`. The second LLM "round 2" is deleted.
- **"生成詞不押韻/不可用"** → every generated word passes `validate()` (existing logic from F4, parameterised) **plus** a character-known check (all chars in `charInfo` ⇒ rejects simplified, garbage and rare chars). Add a regression corpus: the known bad generations from feedback KV become test cases.
- **"失敗/沒回應"** → F2 hotfix plus Worker-side fallback with structured `tried[]` so the UI can say *which* providers failed and why ("Gemini 額度已滿 → 改用 Groq"). Surface that in the panel instead of silent catches.
- **Race with lexicon load (CONCERNS)** → `await lexicon.ready` at the top; if it rejects, show a retry button.

Mid-flight cancellation: pass an `AbortSignal` through `deps.llm`. Disable/re-enable the button in `ui/ai-panel.js` (`finally`), not inside the pipeline.

---

## 7. Rhyme map / line analysis as a pure engine, plus rendering

### Engine contract (`core/lyrics-analysis.js`, no DOM, no globals)

```js
analyze(song, deps, opts) → {
  sections: [{ id, label, charCount, lines: [{
      idx, text, start, end,                 // offsets into section.text (so any renderer can map back)
      chars: [{i, ch, cjk, readings:[{zhuyin, familyId}], chosen:familyId|null, ambiguous:bool}],
      count,                                 // CJK char count
      shape: [3,4],                          // breath-group split (by whitespace/，、 inside the line)
      endFamily, innerHits: [{from,to,familyId}]   // 句中多押 / internal rhyme
  }], rhymeGroups: [{familyId, lineIdx[], color}], stats: {…} }],
  compare: [{ a:sectionId, b:sectionId, lineDiffs:[…] }]    // 主歌1 vs 主歌2, matched by label prefix
}
// deps = { index: charInfo+families, readingOracle?: (text, i) => reading|null }
// opts = the settings toggles (so disabled features cost nothing)
```

Design decisions:
- **Offsets, not DOM nodes.** The renderer is replaceable (a backdrop mirror today, something else later) without touching the engine.
- **Polyphonic characters** (破音字) yield multiple `readings`. Default pick uses `polyphonic-order` (already in `data/`), and `readingOracle` is an optional upgrade that segments by lexicon words (longest match) when the lexicon is loaded. Ambiguous cases are marked `ambiguous:true` and rendered with a muted or dotted style, not a confident colour. This respects the "avoid 眼花撩亂" goal and avoids confidently wrong colours.
- **Grouping:** union-find over line-end `familyId`s per section, with 借韻 via the existing `BORROW_MAP`. Only groups with ≥ 2 lines get a colour (noise reduction). Colours are assigned by group frequency order from a fixed palette, so they're stable while typing. Palette comes from settings.
- **Non-CJK (English/numbers):** counted separately, never coloured, and the line is flagged `mixed`. Do not attempt English syllable rhyme.
- **Incremental:** memoise per-line analysis by `text + optionsHash`. Re-run grouping only for the edited section. Debounce `input` at ~150 ms. Typical song is < 100 lines, so even a full recompute is far below frame budget, but memoisation keeps mobile cool.
- **Triggers (hover-after-select, 「分析」 button) are UI only**: they call `analyze` on the selection's lines and render a popover.
- **Tests (`node --test`, no deps):** load `data/rhyme-dict.json` via `fs`; fixtures of ~30 real lyric lines with expected `endFamily`/`shape`/groups; property: `analyze` is deterministic and never throws on empty, punctuation-only, emoji or mixed input.

### Rendering the overlay (the risky part)

A `<textarea>` cannot style individual characters. Options, ranked:

| Option | Verdict |
|--------|---------|
| **A. Backdrop mirror**: a `<div>` behind a transparent-text textarea containing the same text with `<span>` marks; sync scroll; identical font/size/line-height/padding/`white-space:pre-wrap`/`overflow-wrap:anywhere` | **Recommended first renderer.** Keeps native editing, IME, undo hooks and mobile keyboards. Fragile only in alignment. |
| B. `contenteditable` with inline spans | Rejected: IME composition, caret jumps on re-render, and it breaks `beforeinput` undo routing, plus the paste-sanitisation burden. |
| C. Gutter-only (per-line chip at right edge: `3+4`, colour dot for end-rhyme) with no in-text colour | **Ship this as the fallback and as the mobile default.** Zero alignment risk and covers 句構 and end-rhyme. |
| D. Per-line `<input>` rows | Rejected: breaks multi-line paste and free editing flow. |

Plan: land C (gutter) and the engine first, then A as an opt-in "標記位置: 文字下方底色" setting. **Research flag:** spike A on iOS Safari + Android Chrome with Zhuyin/Pinyin IME and 150% UI scale before committing. Alignment under CSS `zoom` is a known trap (see §8), so fix the scale mechanism first.

Settings page → `lh:settings.rhymeMap` → `analyze(opts)` (gating computation) and `rhyme-overlay` (gating drawing). Both features are read from the same object, so a toggle can't leave them out of sync. "點字即查韻" posts the clicked character into the existing search input action, so there's no new search path.

---

## 8. Responsive 3-panel layout and the zoom/offset bug

### Layout model

Existing: left panel (search/results), centre cards, right (lyrics/AI) with bottom-sheet behaviour ≤900px and a `.mtab-btn` bar already present. Keep that idea and make it explicit, driven by **one** layout source instead of scattered `window.innerWidth <= 440/900` reads in JS (`:3442,:4207,:4213,:5406,:6016`):

| Breakpoint | Layout |
|-----------|--------|
| ≥ 1100px | 3 columns: search+cards / editor (with song tabs) / AI. All visible. |
| 700-1099px | 2 columns: search+cards / editor; AI as a right drawer |
| < 700px | single column + bottom tab bar (搜尋 / 歌詞 / AI); song tabs collapse into a drawer |

Implement with CSS (`grid`/`container queries`, `@media`) and a single `ui/layout.js` that sets `document.documentElement.dataset.layout = 'wide|medium|narrow'` from `matchMedia` and exposes it. JS reads the data attribute, never `innerWidth`. Use `100dvh` (with `100vh` fallback) for full-height shells. Song tabs (Google-Docs style) are a collapsible left rail inside the editor column, hidden by default on narrow.

### Zoom/offset bug: ranked hypotheses (reproduce with DevTools before fixing)

1. **CSS `zoom` on an element that has viewport-relative size and fixed-position descendants.** `.container{height:calc(100vh - 40px)}` is itself scaled by `zoom` (so at 120% it is 120% of the viewport tall, and the bottom/edge content is clipped by `overflow:hidden`). `position:fixed` side panels inside a zoomed ancestor get scaled coordinates (edge offset). The slider handler's explicit `transform = 'none'` suggests this was already fought once. MEDIUM.
2. **`100vh` on mobile browsers** is taller than the visible viewport (URL bar), so "100%" is already clipped at the bottom. MEDIUM (well-known behaviour).
3. `.container` `slideIn` animation/transform creating a containing block for fixed children. LOW-MEDIUM.

**Recommended fix (removes the mechanism, not the symptom):** replace `style.zoom` with a **UI scale variable**: `html{font-size: calc(16px * var(--ui-scale))}` and convert layout-relevant px (font sizes, paddings, gaps, control sizes) to `rem` with a one-off script after S1 (mechanical, review by diff; leave borders/shadows in px). The desktop slider and mobile ± buttons both just set `--ui-scale` (persist it in `lh:settings`). This gives bigger *text and controls* without distorting viewport units or fixed positioning. The overlay renderer (§7) also benefits (no zoom-vs-caret-metrics mismatch). If the rem conversion is too large for the phase, the fallback is `zoom` + compensating the shell: `height: calc((100dvh - 40px) / var(--ui-scale))`, and moving `position:fixed` panels **outside** the zoomed container. That is quicker, but it keeps the fragile mechanism.

**Perf (same lane):** paginate/virtualise char cards (render 50, then `IntersectionObserver` on a sentinel; or `content-visibility:auto` on card rows as the cheap first step). `requestAnimationFrame`-chunk the first render. These are UI-only and independent of everything else.

---

## 9. Data flow summaries

**Boot:** `migrate()` → `settings-store.load()` → `songs-store.load()` → render shell/layout → `lexicon.load()` (kicked off immediately; non-blocking; `ready` promise) → apply cached KV layer → background `GET /layer.json` → re-merge if changed.

**Typing lyrics:** `input` (textarea) → `songs.setText` → (a) debounced autosave `safeSet('lh:song:<id>')`, (b) debounced `analyze()` → overlay/gutter re-render, (c) debounced history commit. Failure of (a) → toast with a "匯出備份" action (never silent).

**Rhyme search:** input → `makeQuery` → `retrieve` (core) → paginated cards.

**AI suggest:** click → `await lexicon.ready` → `makeQuery` → `ai-pipeline.suggest(deps)` → `llm-client` → Worker `/ai/complete` → structured result → panel render (+ provenance counts, + provider failure details).

**Feedback/correction:** user report → Worker `/feedback` (existing) → admin reviews → `/layer/apply` → clients pick up within ~60-120 s → periodic `apply_layer.py` → git push → verify deploy → `/layer/clear`.

---

## 10. Anti-Patterns (specific to this project)

1. **Converting `index.html` to one big `type=module` in a single commit.** Breaks 79 inline handlers and every sloppy-mode construct simultaneously; no bisectability. Use the strangler (§1).
2. **Moving and fixing in the same commit.** Makes `git blame`/revert useless on a refactor that has no test net. Separate commits, always.
3. **Patching legacy AI code then rewriting it.** The fix for F3 is the rewrite. Don't polish the 230-line function.
4. **Storing the correction layer in the feedback KV namespace** (F10). Use a separate namespace.
5. **A delta/op-log layer.** Replaying ops needs ordering and exactly-once delivery, which you don't have (stale caches, 60 s propagation). Declarative, idempotent state avoids the problem.
6. **Clearing the KV layer before the Pages deploy is verified live.** Users in the gap lose corrections.
7. **Bumping the IndexedDB version for a new store you don't need.** Cross-tab `VersionError`s degrade stale tabs for no gain; namespace keys inside the existing store.
8. **Persisting undo history in localStorage.** Quota pressure, and it isn't required.
9. **Overlay by `contenteditable`.** IME/caret fragility (§7).
10. **Reading `window.innerWidth` in 6 places for layout.** One layout module, one data attribute.
11. **Letting the LLM decide *how many* results you get.** The LLM ranks; code guarantees the count.
12. **Shared mutable singletons in `core/`.** `buildCharIndex()` returns the index. If `core` holds module-level state, tests start depending on order.

---

## 11. Scaling considerations (realistic for a hobby tool)

| Concern | Today | If it becomes popular (hundreds of DAU) |
|---------|-------|-----------------------------------------|
| KV reads (`/layer.json`) | negligible with `cacheTtl` + `Cache-Control` | Cloudflare Cache API in front of KV; still free tier |
| KV writes | 1 per admin action | batch approvals; far below 1000/day |
| LLM free quotas | first thing to break | Worker fallback chain + client-visible provider status; consider a KV-config model list; per-IP throttle |
| Lexicon payload (~13 MB) | IDB cache; first load slow | tiered chunks, `ready` after first tiers; precomputed `family → word-index` shards only if retrieval is measured slow |
| GitHub Pages cache (10 min) | version-skew risk small | hash-named chunks (done), importmap stamping |
| localStorage quota | fine | `safeSet` reports; move songs to IDB only if hit |

First bottleneck: **LLM free-tier availability**, not infrastructure. Second: **first-load lexicon time on phones**.

---

## 12. Integration points

### External services

| Service | Pattern | Gotchas |
|---------|---------|---------|
| Gemini / Groq / GitHub Models | Worker-only keys; Worker normalises to `{text,usage}` | model ids deprecate; keep list in Worker config; the client currently has divergent parse code per provider (`callLLM` `:4595-4604`), which moves into the Worker |
| Cloudflare KV | `FEEDBACK_KV` (existing), `LAYER_KV` (new); `LAYER_KV` binding needs adding in the Worker dashboard / `wrangler` config (Andy-side step) | eventual consistency ≈ 60 s; same-key write 1/s; free 1000 writes/day |
| GitHub Pages | static; `max-age=600` | hashed filenames for data, `?v=` for entry scripts |
| OpenCC / lexicon sources (offline) | Python, run by Andy | license notes belong in the `scripts/lex/` README (libchewing is LGPL-2.1+; check any new source) |

### Internal boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| ui ↔ state | subscribe/emit on store; actions via `data-action` delegation | no UI reads of state from DOM |
| core ↔ everything | plain function calls with injected deps | no imports of `ui/` or `data/` |
| legacy ↔ modules | `globalThis` shim from `boot.js` (transitional) | each shim line has an owner and a deletion condition |
| client ↔ Worker | JSON over fetch, origin-locked; admin routes Bearer-auth | extend CORS `Allow-Headers` to include `Authorization` |

---

## 13. Suggested build order (with parallel lanes)

```
Phase 1  Foundation (serial, short):  S0 safety net → S0.5 hotfixes (F2, meta no-cache, safeSet) → S1 CSS split → S2 legacy.js + boot.js
            │
Phase 2  Core extraction (serial):    S3 phonetics → rhyme-index → rhyme-query (+tests) → overrides.js (pure)
            │
            ├── Lane A: DATA        lexicon pipeline (Python; can START during Phase 1, schema-only dependency)
            │                        → lex2 loader (`data/lexicon.js`, `ready`) → KV layer (Worker routes, admin UI) → apply_layer.py
            ├── Lane B: AI          Worker /ai/complete + fallback → ai-pipeline.js rewrite (needs rhyme-query) → ui/ai-panel → regression corpus
            ├── Lane C: EDITOR      storage.js + migrate + songs-store (model-first) → history (undo/redo) → song tabs → section DnD (Pointer Events)
            │                        → lyrics-analysis engine (can start in Phase 2; pure) → gutter → overlay renderer → settings page
            └── Lane D: LAYOUT/PERF --ui-scale + rem conversion (needs S1 only) → layout.js + responsive shell → card pagination → feedback-entry UX
```

Cross-lane dependencies (the only ones that matter):
- Lane B and the analysis engine need **Phase 2's `rhyme-query`/`rhyme-index`**.
- The overlay renderer needs **Lane C model-first editor** and **Lane D scale fix**. Do not build it before both.
- Lane A's runtime merge needs **`core/overrides.js`** (Phase 2). The Python pipeline and Worker routes do not.
- Song tabs and DnD need the **songs-store** (F1). Don't build them on the DOM-as-state editor.
- Settings page (rhyme-map toggles) can be built after `lh:settings` exists; its toggles initially drive only the gutter.

Recommended roadmap phases (suggested grouping):
1. **Foundation and safety net** (S0-S2 + hotfixes)
2. **Core extraction and AI repair** (S3 + Lane B; user-visible win: AI works reliably and fills to target)
3. **Layout, scale and performance** (Lane D; user-visible win: zoom fixed, mobile usable)
4. **Lexicon v2 and correction layer** (Lane A)
5. **Editor model, songs and history** (Lane C first half)
6. **Rhyme map and line analysis** (Lane C second half; spike first)

Phases 3, 4 and 5 can overlap (different files) after Phase 2.

### Research flags for phases

| Phase | Needs deeper research? | Why |
|-------|-----------------------|-----|
| 1 Foundation | No | mechanical; do a 5-line page to confirm `module`+`defer` ordering and `file://` impact |
| 2 Core/AI | Light | prompt format and Worker fallback config are tuning; build the regression corpus from real failures first |
| 3 Layout/scale | Light | repro of the zoom bug on real iOS Safari + Android before choosing rem vs compensation |
| 4 Lexicon | **Yes** | choice of Taiwan-usage frequency source, its license, and the OpenCC-derived deny list quality are open (STACK-level decisions) |
| 5 Editor | Light | `beforeinput` undo routing on iOS Safari |
| 6 Rhyme map | **Yes** | backdrop-mirror alignment under IME and zoom on phones; polyphonic disambiguation quality |

---

## Open questions / gaps

- Does Andy open `index.html` via `file://` today? If yes, the module move changes his workflow (needs a local server). Devcontainer exists, so likely fine. **Ask.**
- Is `admin/woker.js` deployed by paste-into-dashboard or `wrangler deploy`? This affects how `LAYER_KV` is bound and how the new routes ship.
- Whether `data/rhyme-dict.js` (classic global) can be dropped in favour of the JSON once everything is http-served (low priority duplicate).
- The zoom bug cause is unconfirmed (§8). Do a 15-minute DevTools repro as the first task of the layout phase.
- F2 and F4 are code-reading inferences; both need a 2-minute runtime confirmation before being quoted as root causes.
- No real-user data on quota: log provider failures from Worker before tuning.

## Sources

- Codebase (read directly): `index.html` (lines cited above), `admin/woker.js`, `admin/index.html:1040-1190`, `data/wordlist-overrides.json`, `data/wordlist-meta.json`, `scripts/build_wordlist.py`. HIGH.
- Cloudflare Workers KV limits: https://developers.cloudflare.com/kv/platform/limits/ (HIGH, fetched 2026-10-03)
- Cloudflare KV consistency and cacheTtl: https://developers.cloudflare.com/kv/concepts/how-kv-works/ (HIGH)
- MDN CSS `zoom` (Baseline 2024; `vh` interaction not documented): https://developer.mozilla.org/en-US/docs/Web/CSS/zoom (HIGH for status, LOW for `vh` behaviour)
- GitHub Pages `max-age=600` and `?v=`/hash busting practice: https://github.com/orgs/community/discussions/11884 and related issue threads (MEDIUM)
- HTML spec ordering of module and `defer` scripts (from knowledge; verify with a test page): MEDIUM

---
*Architecture research for: Chinese lyric rhyming web tool (好韻器 Lucky Hawaii)*
*Researched: 2026-10-03*
