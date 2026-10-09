# Phase 7: Feedback & Correction Layer - Pattern Map

**Mapped:** 2026-10-09
**Files analyzed:** 18 (new + modified)
**Analogs found:** 17 / 18 (all analogs git-tracked; `data/*.json`, `js/*`, `worker/src/*`, `tools/lexicon/*`, `tests/*` verified tracked)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `worker/src/corrections.js` (new) | service/route | CRUD on single KV doc | `worker/src/health.js` + `handleFeedbackAdmin` in `worker/src/index.js` | role-match |
| `worker/src/index.js` (mod: CORS header, `adminKeyOk`, route hook) | route/config | request-response | itself (`:23-30`, `:133`, `:236-247`, `:262-266`) | exact |
| `js/dict.js` (mod: two-stage `applyRhymeDictOverrides`, `loadCorrections`) | service | transform | itself `:107-131` | exact |
| `js/wordlist.js` (mod: extract `applyWordlistOverrideDoc`, run twice) | service | transform | itself `:343-402` | exact |
| `js/report.js` (mod: `openReportDialog`, ctx menu item, drop char long-press) | component | request-response | itself `:94-146`, `:196-229` | exact |
| `js/ai-word-events.js` (mod: drop long-press, add report mode) | component | event-driven | itself `:8-45` | exact |
| `index.html` (mod: `#batchPanel`, `#m-batchPanel` add 🚩 button; dialog markup; `#aiReportRow`) | component | event-driven | `index.html:101-112`, `:243-256` | exact |
| `css/*.css` (mod: `.btn-report`, report dialog, `--action-*` tokens) | config | static | existing `.feedback-modal*` rules (grep css/) | role-match |
| `admin/index.html` (mod: grouping, batch, apply bar, header key, data-attr delegation) | component | request-response | itself `:195-228`, `:467`, `:486-510`, `:615-640`, `:1626` | exact |
| `tools/corrections/writeback.py` (new) | utility/CLI | batch + file-I/O | embedded script in `admin/index.html:1051-1260`; CLI layout `tools/lexicon/build.py` | role-match |
| `tools/corrections/tests/__init__.py` (new) | test | config | `tools/lexicon/tests/__init__.py` | exact |
| `tools/corrections/tests/test_*.py` (new) | test | batch | `tools/lexicon/tests/test_pack.py` | role-match |
| `tests/worker-corrections.spec.mjs` (new) | test | request-response | `tests/worker-admin.spec.mjs` | exact |
| `tests/corrections-site.spec.mjs`, `report-entry.spec.mjs`, `admin.spec.mjs` (new) | test | browser e2e | `tests/worker-helpers.mjs` `bridgeWorker` + `tests/helpers.mjs` `routeExternal` | role-match |
| `tests/worker-helpers.mjs` (mod: FakeKV `list` cursor, `staleOnce`, put-throws mode) | test util | - | itself `:6-12` | exact |
| `tests/helpers.mjs` (mod: `/corrections.json` branch in `routeExternal`) | test util | - | itself `:31-45` | exact |
| `tests/fixtures/corrections-vectors.json` (new) | test fixture | - | none | none |
| `package.json` (mod: 2 scripts) | config | - | `package.json:14-18` | exact |
| `worker/DEPLOY.md` (mod) | doc | - | itself | exact |

## Pattern Assignments

### `worker/src/corrections.js` (service, KV single-doc CRUD)

**Analog:** `worker/src/health.js` (KV doc in `AI_STATE_KV`, `JSON.parse` with null fallback) and `index.js` route/response helpers.

**Imports/export style** (`health.js:1-9`): header comment `// ==== 區塊 ====` in Chinese stating why; `export const HEALTH_KEY = 'health';` -> use `export const CORRECTIONS_KEY = 'corrections:v1';`.

**Response + CORS: use `json()` not `feedbackJson`** (`index.js:32-37`):
```js
export function json(status, obj, origin, env = {}) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin, env) },
    });
}
```
(`json` is exported; `readBodyCapped` / `isRateLimited` are not — export them or move to a shared spot. `corrections.js` importing from `index.js` while `index.js` imports `corrections.js` is circular; export what is needed from `index.js` only for functions already used lazily at call-time, or pass helpers in as args.)

**Safe load of KV doc** (`index.js:269-271`, same style):
```js
let doc = null;
try { doc = JSON.parse(await env.AI_STATE_KV.get(HEALTH_KEY)); } catch (e) { doc = null; }
```
New route: same, null -> empty `{version:1, rev:0, entries:[], written:[]}`. Use `get(key, {cacheTtl:30})` only on public read (E2).

**Body read** (`index.js:143-144`): `const body = await readBodyCapped(request, 16384); if (!body.ok) return json(413, ...)`.

**Origin gate for public GET** (`index.js:254-255`):
```js
if (!originAllowed(origin, env)) return json(403, { ok: false, code: 'FORBIDDEN', message: '來源不被允許' }, origin, env);
if (request.method !== 'GET') return json(405, { ok: false, code: 'METHOD', message: '不支援這個操作' }, origin, env);
```

**Key check (replace everywhere with shared `adminKeyOk`, E10)**: current `index.js:133` `const keyOk = () => url.searchParams.get('key') === env.USER_REPORT_KEY;` and non-empty variant `:264` `if (!key || key !== env.USER_REPORT_KEY) return new Response('Forbidden', { status: 403 });`. New: `request.headers.get('X-Admin-Key') ?? url.searchParams.get('key')`, require non-empty. Keep 403 `new Response('Forbidden', {status:403})` and "key check before method check" ordering (`:176-177`).

**Reading agreed reports for `/corrections/apply`**: copy `/reports/decision` read pattern (`index.js:179-185`): `const val = await env.USER_FEEDBACK_KV.get(kvKey); if (!val) ...; JSON.parse(val)`; only accept `status === 'agreed'`; convert via the action->entry table in RESEARCH ("action -> entry 對照"); re-validate zhuyin with `/^[ㄅ-ㄩ]+[ˊˇˋ˙]?$/` per syllable (copy of `admin/index.html:410-416`).

**Error handling:** route-level try/catch returning JSON `{ error: e.message }` 500 (`index.js:150-152`) for admin routes; `put` throwing (1 write/sec/key) -> 503 白話 message; rev mismatch -> 409 `{ok:false, code:'REV_MISMATCH', rev}`.

---

### `worker/src/index.js` (modify)

- `corsHeaders` (`:23-30`): change `'Access-Control-Allow-Headers': 'Content-Type'` to `'Content-Type, X-Admin-Key'`, add `'Access-Control-Max-Age': '7200'`. OPTIONS handled at `route()` start (`:241`) — no per-route work.
- `route()` (`:236-247`): mount `handleCorrections` right after `handleFeedbackAdmin`:
```js
const admin = await handleFeedbackAdmin(request, env, url);
if (admin) return admin;
```
- Replace `keyOk` closure (`:133`) and `:264` with the shared function. Old comment at `:128-130` ("強化…在 Phase 7") should be updated; add `// ?key= 待 v2 移除` comment (B4).
- `/reports.json` (`:155-171`): loop `list({cursor})` with `list_complete`; cap 800, return `truncated:true` (E5). Keep response array shape for legacy admin (wrap decision: if `truncated` needed, add header or envelope only for new admin; check `tests/worker-admin.spec.mjs` expectations first).
- Do NOT touch `wrangler.toml` bindings (`worker-config.spec.mjs` guards exactly two KV bindings).

---

### `js/dict.js` — `applyRhymeDictOverrides` (service, transform)

**Analog:** itself, `:107-131`. Extract the three loops into `applyRhymeDictOverrideDoc(ovr)` returning count; call for base (`data/rhyme-dict-overrides.json`) then `ovr.rhymeDict` from layer:
```js
for (const it of (ovr.removed || []).concat(ovr.hidden || [])) {
    if (!it.char || !it.dict_key) continue;
    if (_removeCharFromRhymeKey(it.dict_key, it.char)) count++;
}
for (const it of (ovr.fixed || [])) {
    if (!it.char || !it.to) continue;
    if (it.from) _removeCharFromRhymeKey(it.from, it.char);  // from 空 → 純新增
    _addCharToRhymeKey(it.to, it.char, it.tier || 'normal');
    count++;
}
```
Fetch/error idiom to reuse for `loadCorrections()` (`:108-113`): `try { const r = await fetch(...); if (!r.ok) return ...; ovr = await r.json(); } catch(e) { lhWarn('字庫修正檔載入失敗', e); ... }`. Base failure must no longer `return false` early (layer still applies). Add `AbortSignal.timeout(3000)`, no `cache:'no-cache'`, shape-validate; memoize Promise. `WORKER_URL` const is in `js/ai-client.js:1`.

### `js/wordlist.js` — `applyWordlistOverrides` (service, transform)

**Analog:** itself `:343-402`. Keep signature `(list, live = () => true)`; extract body of the inner `try` (`:358-399`) into `applyWordlistOverrideDoc(list, ovr)` (returns new array, updates `wordPriorityMap`/`wordPhoneticMap`). Preserve: `if (!live()) return list;` (`:353`), try/catch returning input on failure (`:400`), `have` Set de-dup for `added` (`:379-388`), `a.z.includes('?')` skip. Run base then layer, each in own try/catch. Layer `fixed` is `{word: z}` map; `added` items `{w,z,p}`.

---

### `js/report.js` (component, request-response)

**Analog:** itself.
- **Remove** `:149-169` char-card `touchstart/touchmove/touchend` long-press block (`_charLongPressTimer`). **Keep** poly-chip contextmenu + long-press (`:195-229` region) untouched (A2).
- **Context menu add item:** in `_showCharCtxMenu` (`:131-142`) prepend to `wordCtxItems.innerHTML` a `<div class="word-ctx-item" onclick="openReportDialog(...)">🚩 回報…</div>`; same for `_CTX_MENU_NORMAL` / `_CTX_MENU_AI` (`:70-78`).
- **Dialog open/close/submit shell:** copy `openFeedbackModal / closeFeedbackModal(e) / submitFeedback` (`:222-246`): overlay `.classList.add('show')`, `closeX(e)` guard `e.target !== overlay`, send button disabled during post with `try/finally`, close only after success.
```js
const sendBtn = document.querySelector('.feedback-send-btn');
sendBtn.disabled = true;
try {
    if (await postFeedback({ type: 'feedback', subject, body })) { ...close...; showToast('感謝你的回饋！'); }
} finally { sendBtn.disabled = false; }
```
- **`postFeedback`** (`:199-214`) returns boolean and toasts on failure; per UI-SPEC 3.4 needs 429 status exposed: add `postFeedbackRaw(data)` returning `{ok,status}`; keep `postFeedback` as wrapper so existing callers still get `true/false` + toast.
- **Payload shapes to keep** (admin groups on them): `{type:'word-report', word, reportType}` (`:37`), `{type:'char-reading-report', char, reading, reportType}` (`:187`); new reasons 太冷僻->`極度冷僻`, plus `不該出現`, `其他`, note in `suggested`/`note` (D-07). One record per item (A3), max 10 (E8), session-only `Set` dedupe (A4; no `lhSet`).
- Menu hiding via `document.addEventListener('click', ...)` (`:34`).

### `js/ai-word-events.js` (component, event-driven)

**Analog:** itself. Delete `:25-45` ("手機長按觸發回報選單" through `touchcancel`); keep `contextmenu` (`:8-22`, add 🚩 item via `_setCtxMenuFor`) and hover tooltip. Report mode: capture-phase `click` listener on `_aiWordsCt` (`const _aiWordsCt = document.getElementById('aiWordsContainer')`) that calls `e.stopPropagation()` when `.report-mode` is set, to prevent `saveWord`.

### `index.html` batch toolbar (component)

**Analog:** `index.html:101-112` (desktop) and `:243-256` (phone). Mirror exactly:
```html
<button class="batch-btn btn-clear" onclick="batchMark('clear')" title="取消標記">
    <span class="batch-icon">↩</span><span>取消</span>
</button>
```
-> add `<button class="batch-btn btn-report" onclick="openReportDialog()" title="回報選取的字或詞" aria-label="回報選取的字或詞" aria-disabled="true">…🚩…<span>回報</span></button>`; phone uses `m-batch-btn btn-report`. Selection source: `selectedChars` / `.char-card.selected` (see `js/cards.js batchMark`). Remember `?v=` bump on all tags when css/js change (split-tags test).

---

### `admin/index.html` (component, request-response)

**Analog:** itself. Own px/`:root` design system (do NOT import main-site tokens).
- **Header key (B4):** replace `fetch(\`${WORKER_URL}/reports.json?key=${encodeURIComponent(key)}\`)` (`:467`), `/reports/decision?key=` (`:502`), `/reports/delete?key=` (`:652`) with `fetch(url, { headers: { 'X-Admin-Key': key, ... } })`. Existing error mapping to keep: `403 -> showError('密鑰錯誤（403）')`, `!res.ok -> showError('載入失敗：HTTP …')` (`:468-469`).
- **Decision write + rollback:** `postDecision(kvKey, status, action)` (`:486-510`) optimistic update with `prev` snapshot rollback; batch 核准 = loop it for each member (limited concurrency 4). Action objects from `buildAction(r, op, payload)` (`:615-636`): `hide_word`, `remove_word`, `hide_char_reading`, `remove_char_reading`, `fix_*`, etc. D-12 default: 太冷僻 -> `hideWord`/`hideReading`; 不該出現 -> `removeWord`/`removeReading`.
- **Zhuyin validation:** `isValidZhuyin(s, expected)` (`:410-416`).
- **Batch bar:** `.batch-bar` markup `:223-228` (`<button class="btn btn-archive" onclick="batchArchive()">`); add 核准/駁回 first.
- **B5 injection fix:** `esc()` (`:1626-1628`) is HTML-only; buttons built at `:832` (`onclick="${onclick}"`) and `defaultValue:'${esc(...)}'` (~`:871`) must become `data-kvkey`/`data-op` attributes + one delegated `addEventListener('click', e => e.target.closest('[data-act]'))`; user strings via `textContent`.
- **Export button (D-16):** `:219` `<button class="btn btn-export" id="exportBtn" disabled onclick="exportChanges()">` keep, restyle, relabel 「💾 匯出 agreed（備援）」.

---

### `tools/corrections/writeback.py` (utility CLI, batch + file-I/O)

**Analog:** the Python embedded in `admin/index.html:1051-1260` (generated apply script — copy, don't import) and `tools/lexicon/build.py` for CLI structure (`python3 -B`, argparse subcommands, stdlib only).

**Reuse verbatim (byte-identical output with current data files, per RESEARCH):**
- `_valid_z(s, n=None)` (`admin/index.html:1142`)
- `_fmt_str_array(arr, per_line=10, indent='    ')`, `_fmt_obj_array`, `_fmt_str_dict` (`:1216-1232`)
- File layout writers (`:1240-1259`):
```python
f'  "removed": {_fmt_str_array(data["removed"])},\n\n'
f'  "hidden": {_fmt_str_array(data["hidden"])},\n\n'
f'  "fixed": {_fmt_str_dict(data["fixed"])},\n\n'
f'  "added": {_fmt_obj_array(data["added"])},\n\n'
```
- Audit: `LOG = DATA / 'applied-changes.log'` (`:1135`), check entry id already logged before appending.

**New logic (no analog):** merge semantics = set semantics, last-wins (RESEARCH Pattern 4 table); `merge(live,batch)==live` confirm (Pattern 5); flags `--apply --push --confirm-only --timeout(1200s default) --poll-interval(30) --live-branch(main)`; key from `os.environ['LH_ADMIN_KEY']` only, never printed. HTTP via `urllib.request` with `X-Admin-Key` header. Git via `subprocess.run([...], check=True)`; on non-live branch: commit only.

### `tools/corrections/tests/__init__.py` + tests

**Analog:** `tools/lexicon/tests/__init__.py` (network guard allowing only `127.0.0.1`/`::1`/`localhost`, patching `socket.socket.connect` and `socket.create_connection`) — copy as-is. Test style: `unittest`, tempdir fixtures, `mock.patch` (`tools/lexicon/tests/test_pack.py:1-12`). Use `http.server.ThreadingHTTPServer` on 127.0.0.1 as fake Worker/site; local bare git repo as remote. `npm` script:
`"corrections:test": "python3 -B -m unittest discover -s tools/corrections/tests -t tools/corrections"` (mirrors `package.json:18`). Never leave `__pycache__` under `tools/`.

---

### `tests/worker-corrections.spec.mjs` (test, Node-only)

**Analog:** `tests/worker-admin.spec.mjs:1-40`:
```js
import { test, expect } from '@playwright/test';
import worker from '../worker/src/index.js';
import { FakeKV, makeEnv } from './worker-helpers.mjs';
const call = (path, { method = 'GET', body, origin, env } = {}) => worker.fetch(new Request('https://w' + path, { method, headers: {...}, body: ... }), env, { waitUntil() {} });
const seeded = init => makeEnv({ USER_FEEDBACK_KV: new FakeKV(init) });
```
Add header-key tests (`X-Admin-Key`), empty-key rejection, OPTIONS asserts `Access-Control-Allow-Headers` contains `X-Admin-Key`, 409 on stale `baseRev`, 403 for non-allowed origin on `/corrections.json`.

### Browser specs (`corrections-site`, `report-entry`, `admin`)

**Analog:** `tests/worker-helpers.mjs:44-57` `bridgeWorker(context, env)` (runs real `worker/src` for `lucky-hawaii.is3000dollar.workers.dev`; Playwright `route.fulfill` skips CORS preflight — preflight is only testable in Node spec). `tests/helpers.mjs:31-45` `routeExternal`: add a `/corrections.json` branch returning an empty view (else the site gets the `{candidates}` fallback shape; `loadCorrections` shape check must tolerate it).

### `tests/worker-helpers.mjs` `FakeKV` (modify)

Current (`:6-12`): `list()` returns all keys with no `cursor`/`list_complete`, no `get(key, opts)` ignoring options. Extend: `list({cursor,limit})` with `list_complete`, `staleOnce` mode, `failPut` mode (1-write/sec simulation).

## Shared Patterns

### Admin key check
**Source:** `worker/src/index.js:133`, `:264`. **Apply to:** every admin route (old + `/corrections/*`, `/corrections/admin.json`). One function `adminKeyOk(request, url, env)`: header first, then `?key=`, non-empty required.

### Chinese comment / style
**Source:** `worker/src/health.js:1-9`, `index.js:1-4`. 4-space indent, single quotes, `// ==== 區塊 ====`, comments explain why in Traditional Chinese. User-visible errors: `showToast` / `lhWarn` (site), white-language messages.

### Failure-tolerant fetch of optional data
**Source:** `js/dict.js:108-113`, `js/wordlist.js:346-351` — `try { fetch; if (!r.ok) return fallback; json } catch(e) { lhWarn('…', e); return fallback; }`. **Apply to:** `loadCorrections`, both override appliers.

### Storage
`js/safety.js` `lhGet/lhSet` only; this phase adds NO storage keys (A4 session `Set` only).

### Python tools
`python3 -B`, stdlib only, no `__pycache__` in `tools/`, key from env only.

### Cache-bust
All `?v=` tags bumped together (0.96.9 -> next) when `css/` or `js/` change.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `tests/fixtures/corrections-vectors.json` | fixture | cross-language semantic parity | No existing shared JS/Python vector file; planner follows RESEARCH "Key insight" (ordered entries -> expected set state, loaded by both JS spec and Python unittest) |
| Merge/replay semantics in `writeback.py` and view-builder in `corrections.js` | logic | transform | Only formatting/validation can be copied from the old export script; the set-semantics merge is new (RESEARCH Pattern 4/5) |

## Metadata

**Analog search scope:** `worker/src`, `js/`, `admin/index.html`, `index.html`, `tests/`, `tools/lexicon`, `package.json`
**Files scanned:** ~15 read in part (index.js, health.js, report.js, ai-word-events.js, wordlist.js, dict.js, admin/index.html sections, worker-helpers.mjs, helpers.mjs, worker-admin.spec.mjs, lexicon tests `__init__`/`test_pack`)
**Not read:** `css/*` (grep for `.feedback-modal` and `.batch-btn` rules before editing), `js/cards.js`, `worker/DEPLOY.md`, `tools/lexicon/build.py` (CLI shape assumed from package.json scripts)
**Pattern extraction date:** 2026-10-09
