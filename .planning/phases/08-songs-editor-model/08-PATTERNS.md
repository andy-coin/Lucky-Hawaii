# Phase 8: Songs & Editor Model - Pattern Map

**Mapped:** 2026-10-10
**Files analyzed:** 22 (5 new, 17 modified; tests counted)
**Analogs found:** 22 / 22 (all analogs are git-tracked `js/`, `css/`, `tests/` files; no mirror paths)

Conventions that apply to every JS file (from `.claude/CLAUDE.md`): classic scripts, no import/export, 4-space indent in new files (existing `lyrics.js`, `state.js`, `ui-common.js` body code is indented 8 spaces because it was cut from the old inline script; keep each file's current indent when editing, use 4 spaces in new files like `safety.js`/`report.js` top-level), single quotes, Chinese "why" comments, `// ==================== X ====================` headers, all storage through `lhGet/lhGetJSON/lhSet/lhRemove`, bump all `?v=` together.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `js/safety.js` (mod: 3 keys, schema 2 step, `lhBuildBackup`/`lhApplyBackup`, pinned backups, schema-aware restore, `__lhMigrated`) | service (storage layer) | CRUD + batch migration | itself (`LH_KEYS`, `lhMigrate`, `lhBackup`, `lhRestoreFromBackup`) | exact |
| `js/songs.js` (new) | service (model + persistence) | CRUD, event-driven (`storage`, `pagehide`) | `js/lyrics.js` (current save) + `js/safety.js` (`lhSet` return-value contract) | role-match |
| `js/state.js` (mod) | config/state | request-response | itself lines 6-10 | exact |
| `js/lyrics.js` (mod: render via DOM API, delegated editor, hashtags, song list UI) | component | event-driven | itself (`renderLyricsSections`, `saveLyrics`) + `js/report.js` (dialog/keydown) | exact |
| `js/song-io.js` (new: toTxt/toMd, download, copy, print, backup UI, import dialog) | utility + component | file-I/O | `js/lyrics.js` `exportSession`/`importSession` (153-215) + `js/report.js` `openReportDialog` | role-match |
| `js/ui-common.js` (mod: drop auto-wipe, move first render to `initSongs`, `fallbackCopy`) | component | request-response | itself lines 11-20, 78-120 | exact |
| `js/ai-generate.js` (mod: read `curSong()`) | service | request-response | itself lines 77-78, 231-237 | exact |
| `js/panels.js` (mod: `renderSavedWords` to DOM API) | component | CRUD | itself 134-150; `js/report.js` chip rendering (DOM API) | exact |
| `index.html` (mod: header row, `#songList`, dialogs, `#printSheet`, 2 script tags, `?v=`) | config/markup | n/a | `#reportModalOverlay` (line 247), `#hashtagPopupOverlay` (371), `#leftPanel` (291) | exact |
| `css/panels.css` (mod: `.lyrics-head`, `.song-list`, `.song-dialog`, `.import-choice`) | config (style) | n/a | `.feedback-modal*` (466-517), `.report-modal` (519+), `.word-ctx-menu` | exact |
| `css/base.css` (mod: `--danger-*` tokens) | config | n/a | `--action-*` tokens | exact |
| `css/responsive.css` (mod: touch floors, input-floor list, `body.songs-open`) | config | n/a | `html.kb-open .feedback-modal-overlay` (718), input floor list (738, 774) | exact |
| `css/print.css` (new, `media="print"`) | config | n/a | no analog (see No Analog) | none |
| `tests/storage.spec.mjs` (mod + new migration/two-tab tests) | test | event-driven | itself (`openTwoTabs` 459-472, boot tests) | exact |
| `tests/scan.spec.mjs` (mod 18 -> 21) | test | static | itself lines 69-70 | exact |
| `tests/split-tags.spec.mjs` (mod JS_ORDER/CSS_ORDER) | test | static | itself lines 8-12, 63-64 | exact |
| `tests/helpers.mjs` (mod: add `__hoyunSongsReady`) | test util | n/a | itself line 148 | exact |
| `tests/songs.spec.mjs` (new: IME RED tests R1-R5, list CRUD, multi-tab) | test | event-driven | `tests/storage.spec.mjs` + `tests/report-entry.spec.mjs` 282-320 | role-match |
| `tests/song-io.spec.mjs` (new: export/print/backup round trip, bad files) | test | file-I/O | `tests/smoke.spec.mjs:249-282` + `tests/report-entry.spec.mjs` | role-match |
| `tests/layout.spec.mjs`, `tests/ai-client.spec.mjs`, `tests/smoke.spec.mjs`, `tests/save-failure.spec.mjs` (mod, per RESEARCH Q1 table) | test | n/a | themselves | exact |

## Pattern Assignments

### `js/safety.js` (storage layer, CRUD + migration)

**Analog:** `js/safety.js` itself. All new code sits next to the pattern it extends.

**Key registry** (lines 9-28, 30). Add the three keys in the same object style; `lh:songs`/`lh:activeSong` group `data`, `lh:songListOpen` group `ui` (F9). Update the "18 個固定鍵" comment to 21.
```javascript
    { key: 'haiku_lyrics', group: 'data' },
    ...
    { key: 'lh:uiScale', group: 'ui' },
    { key: 'lh:lexiconPack', group: 'setting' }
];
// secret 旗標讓之後的匯出（Phase 8）可以排除金鑰
const LH_KEY_PREFIXES = [{ prefix: 'apiKey_', group: 'setting', secret: true }];
```

**Migration contract** (lines 325-329 and 384-418). Raise `LH_SCHEMA_TARGET` to 2 and `LH_MIGRATIONS.push({ to: 2, run(store) {...} })` in this file (not from another file; `lhBootSafety` runs at head-load). Step receives `store.get/set/remove` which `throw` on write failure and guard unregistered keys, so failure triggers the existing rollback.
```javascript
const LH_SCHEMA_TARGET = 1;
// 步驟格式 { to: N, run(store) }：同步執行、必須冪等、只能透過 store 碰清單內的鍵、任何失敗都要 throw
const LH_MIGRATIONS = [];
...
const store = {
    get: k => lhGet(k),
    set: (k, v) => { guard(k); localStorage.setItem(k, v); },
    remove: k => { guard(k); localStorage.removeItem(k); }
};
...
for (const s of steps.filter(s => s.to > cur && s.to <= target).sort((a, c) => a.to - c.to)) {
    s.run(store);
    localStorage.setItem('lh:schema', String(s.to));   // 每步完成才翻旗標
```
Step body: copy RESEARCH Pattern 3 (fixed id `'song-migrated'`, skip if valid `lh:songs`, use `lhGetJSON(..., validate)` so corrupt raw is stashed as `lh:corrupt:haiku_lyrics`). Legacy shape validator to reuse is the one at `js/state.js:9` (array, non-empty, each object with string-or-undefined text).

**Capture migration result** (line 426): change `await lhMigrate(LH_MIGRATIONS, LH_SCHEMA_TARGET);` to `const m = await lhMigrate(...); window.__lhMigrated = !!(m && m.ran > 0);`. `lhBootSafety` must still never reject (keep the `try/catch` at 428-431).

**Backup eviction pin (F1)** (lines 285-294). Pattern to modify: keep the dedupe-by-id check and `seq` ordering, but exclude ids starting `baseline` / `pre-schema-` from the `.slice(LH_BACKUP_KEEP).forEach(delete)`:
```javascript
if (recs.some(r => r.id === id)) { existed = true; return; }
const rec = _lhBuildRecord(id, recs.reduce((m, r) => Math.max(m, r.seq || 0), 0) + 1, label, snap);
store.put(rec);
recs.concat(rec).sort((a, b) => b.seq - a.seq).slice(LH_BACKUP_KEEP)
    .forEach(r => store.delete(r.id));
```
Existing test `storage.spec.mjs:174-193` ("keep 3") must change to `['baseline','t3','t4','t5']`.

**Schema-aware restore (F1)** (lines 364-381). After a successful `lhRestore(rec.data)` write `lh:schema = String(rec.schema)` via direct storage (meta key, `_lhRestorable` excludes it); keep the `secretsOmitted` merge branch (375-379) and apply the schema write to both return paths.

**Backup build/apply (F10/F11)**: put `lhBuildBackup()` / `lhApplyBackup()` / `lhNormalizeSong()` in this file (dynamic key loops are exempt from the scanner there). Build from `lhSnapshot()` + `LH_KEYS` filtered by `group === 'setting'` plus `dictOverrides_v076`; never loop `LH_KEY_PREFIXES` (secrets). Apply writes through `lhSet` and on any `false` calls `lhRestore(preSnapshot)` (rollback pattern at 408-417). Import settings by registry lookup only: `LH_KEYS.find(k => k.key === name)`, never `Object.assign` from file.

**Failure banner export button** (line 132-135): label text change per F5 (`'匯出備份'` -> `'備份全部'`, and `LH_BANNER_TEXT` strings 110-111). Keep `typeof exportSession === 'function'` guard and keep the function name `exportSession`.

---

### `js/songs.js` (new; model, debounced merge-write persistence, storage handler)

**Analog:** no single file; compose from `js/safety.js` return-value contract and `js/lyrics.js` save call sites. Load right after `state.js` in `index.html` and in `JS_ORDER`.

**Core persistence pattern** (RESEARCH Pattern 1; relies on `lhSet` returning true/false and showing the banner itself, `safety.js:91-100`):
```javascript
const _dirty = new Set(), _deleted = new Set();
function flushSongs() {
    clearTimeout(_saveTimer); _saveTimer = null;
    if (!_dirty.size && !_deleted.size) return true;
    const cur = lhGetJSON('lh:songs', [], Array.isArray);
    const byId = new Map(cur.map(s => [s.id, s]));
    _deleted.forEach(id => byId.delete(id));
    _dirty.forEach(id => { const s = songs.find(x => x.id === id); if (s) byId.set(id, s); });
    const ok = lhSet('lh:songs', JSON.stringify([...byId.values()])) && lhSet('lh:activeSong', activeSongId);
    if (ok) { _dirty.clear(); _deleted.clear(); }
    return ok;
}
```
Legacy mode (F2): same function but writes `haiku_lyrics`/`haiku_hashtags` instead; chosen in `initSongs` when `lhGet('lh:schema') !== '2'` or `lh:songs` fails validation.

**Boot hook** (A3): `state.js` sets `window.__hoyunSongsReady = window.__hoyunSafetyReady.then(initSongs)`. The existing signal pattern to copy is `window.__hoyunSafetyReady = lhBootSafety();` (`safety.js:435`) and `window.__hoyunReady = Promise.all([...])` (`js/init.js:7`), both commented "測試用就緒訊號".

**Flush triggers** (B2): `pagehide`, `visibilitychange` (hidden), `focusout`/`compositionend` from the delegated listeners in `lyrics.js`. Do not use `beforeunload`.

**Storage handler** (A5/Q4): `window.addEventListener('storage', e => { if (e.key === 'lh:songs' || e.key === 'lh:activeSong' || e.key === null) ... })`. Never write the bare token `localStorage` outside `safety.js` (scanner, `tests/scan.spec.mjs:35-58`). Toast via existing `showToast(msg, duration)` (`js/ui-common.js:40`).

**Id generation**: `Date.now().toString(36) + Math.random().toString(36).slice(2, 8)`; ids must match `/^[A-Za-z0-9_-]{1,40}$/`.

**Header**: keep the file-top section header style used in `safety.js:1-3`.

---

### `js/state.js` (state shells)

**Analog:** itself, lines 6-10.
```javascript
let hashtags = lhGetJSON('haiku_hashtags', [], Array.isArray);
let lyricsSections = lhGetJSON('haiku_lyrics', [{ label: '', text: '' }],
    v => Array.isArray(v) && v.length > 0 && v.every(s => s && typeof s === 'object' && (s.text === undefined || typeof s.text === 'string')));
let savedWords = lhGetJSON('haiku_savedwords', [], Array.isArray);
```
Replace first two with `let songs = [], activeSongId = null;` and the `__hoyunSongsReady` assignment (RESEARCH Q1 snippet). `savedWords` stays a synchronous read (key not migrated). Note `initSongs` must `await` only `__hoyunSafetyReady`; do not depend on its value (it returns the baseline backup result, `safety.js:422-432`).

---

### `js/lyrics.js` (editor component, event-driven)

**Analog:** itself plus the dialog/keydown conventions in `js/report.js`.

**Replace DOM read-back** (`saveLyrics`, lines 63-71): delete. Current callers to re-point at the model: `disableSectionLabel` (98-101), `onSectionDrop` (121-130, Phase 9 will rework; just route to model + `scheduleSave`), `toggleLyricsSection` (80-89), `addLyricsSection` (217-226), `removeLyricsSection` (228-240), `exportSession` (153-177).

**Render pattern to replace** (lines 242-272) uses `container.innerHTML = lyricsSections.map(...)` with `${s.text}` and `value="${labelVal}"`. New version builds nodes with `document.createElement`, sets `.value`/`textContent`, keeps these class names and attributes (tests and `css/responsive.css:64` depend on them): `.lyrics-section`, `data-index`, `.lyrics-section-header`, `.section-chevron`, `.section-label` (readonly input), `.section-remove`, `.section-body`, `.section-textarea`, plus new `data-id`. Preserve the existing handlers' inline attribute names (`onclick="onSectionHeaderClick(event,i)"`, `ondragstart`, etc.) via `setAttribute` of numeric-only strings, since drag handlers stay until Phase 9, and the smoke coverage gate enumerates inline handler names. Keep the placeholders `'在這裡輸入或貼上歌詞…'` (index 0) and `'在這裡輸入歌詞…'` and default labels `'歌詞'`/`'新段落'` (246-252). Keep the delete confirm (233-236) unchanged (B4).

**Delegated editor listeners** (RESEARCH Pattern 2), attach once on `#lyricsSections`:
```javascript
const area = document.getElementById('lyricsSections');
let _composing = false;
area.addEventListener('compositionstart', () => { _composing = true; });
area.addEventListener('compositionend', e => { _composing = false; syncFromField(e.target); flushSongs(); });
area.addEventListener('input', e => {
    syncFromField(e.target);                       // 只改記憶體，不碰 DOM
    if (!_composing && !e.isComposing) scheduleSave();
});
area.addEventListener('focusout', () => { _composing = false; flushSongs(); applyPendingExternalIfIdle(); });
```
`syncFromField` resolves the section via `e.target.closest('.lyrics-section').dataset.id`. Remove `oninput="saveLyrics()"` from markup. Same gating for `#contextDescription` (writes `song.context`, F3/A4).

**Enter / composing guard (F12)**: copy the guard idiom from `js/panels.js:109`:
```javascript
e.isComposing || e.keyCode === 229
```
Apply to the section-label `onkeydown="if(event.key==='Enter')this.blur()"` (line 266), the hashtag popup's `onkeydown` in `index.html` (~374-375, calls `confirmHashtagPopup()`), and the new `.song-name-input`.

**Hashtags** (lines 8-52): `addHashtag`/`removeHashtag` operate on `curSong().hashtags` and call `flushSongs()`/`scheduleSave()`. Replace the string-built chips (line 49-51: `#${t}` + `onclick="removeHashtag('${t.replace(/'/g, "\\'")}')"`) with DOM nodes: `span.hashtag-chip` with `textContent = '#' + t`, child `span.chip-remove` with `textContent = '×'` and an `addEventListener('click', ...)`. Empty state text span (line 46) is kept.

**Song list UI**: delegated listener on `#songList` using `data-song-id`; rename input, roving focus, Esc/F2/Delete keys per UI-SPEC 2.4. Names only via `textContent`/`.value`.

**Import/export**: `exportSession`/`importSession` names stay (called from `safety.js:134` and `index.html:65-66,192`); implementations move to `song-io.js`. Remove them from `lyrics.js` when moved (single definition).

---

### `js/song-io.js` (new; export/backup/import)

**Analog A (download + file read):** `js/lyrics.js` 164-176 (Blob + anchor) and 179-215 (`FileReader`, `ev.target.value = ''`).
```javascript
const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = `${safe}.json`;
a.click();
URL.revokeObjectURL(url);
```
Deviate per RESEARCH Q5: append the anchor to `document.body`, and `setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 10000)`. Drop the `window.prompt` (line 166; `bootPage` auto-answers prompts with `'測試'`, `tests/helpers.mjs:147`). Filename sanitizer: reuse the existing regex idea at line 168, extended to `[\\/:*?"<>|\u0000-\u001f]` -> `_`.

**Analog B (clipboard + fallback):** `js/ui-common.js:2-20` (`copyWord` + `fallbackCopy`). Extend `fallbackCopy` with `ta.readOnly = true`, `ta.setSelectionRange(0, ta.value.length)` and return the `execCommand` boolean; call `navigator.clipboard.writeText` synchronously in the click handler and toast only on success (`複製失敗，請改用「TXT」下載` when both fail).

**Analog C (dialog shell, focus, Esc, Tab trap):** `js/report.js` 359-390 and 466-478. Copy these exactly for delete dialog (`#songDeleteOverlay`, `role="alertdialog"`) and import dialog (`#importOverlay`):
```javascript
_report.opener = document.activeElement;
...
_rpt('reportModalOverlay').classList.add('show');
_rpt('reportTitle').focus();   // 焦點放標題，不放說明欄，手機鍵盤才不會彈出來
...
function closeReportDialog(e) {
    const overlay = _rpt('reportModalOverlay');
    if (e) { if (e.target !== overlay) return; ... }   // 點遮罩才關
    if (!overlay.classList.contains('show')) return;
    overlay.classList.remove('show');
    const op = _report.opener; _report.opener = null;
    if (op && op.focus && document.contains(op)) op.focus();
}
...
document.addEventListener('keydown', e => {
    const ov = _rpt('reportModalOverlay');
    if (!ov.classList.contains('show')) return;
    if (e.key === 'Escape') { e.preventDefault(); closeReportDialog(); return; }
    if (e.key !== 'Tab') return;
    const tabbables = [...ov.querySelectorAll('button, textarea')].filter(el => !el.disabled && el.tabIndex >= 0);
    const first = tabbables[0], last = tabbables[tabbables.length - 1], a = document.activeElement;
    if (!ov.contains(a)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && (a === first || a === _rpt('reportTitle'))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
});
```
Delegate to a small shared `_trapDialog(overlayId)` only if two or more dialogs need it; otherwise copy per dialog (lazy). Dialog title element needs `tabindex="-1"` to take focus.

**Analog D (export menu):** `lhPlaceMenu(el, x, y)` in `js/layout.js:153-170` (adds `.show`, measures, clamps to visualViewport with 4px margin) and the menu usage at `js/report.js:24` / `97` (`lhPlaceMenu(_ctxMenu, x, y)`), closed by `classList.remove('show')` (`report.js:4`). Compute `x,y` from `exportToggle.getBoundingClientRect()`. Markup classes `.word-ctx-menu`, `.word-ctx-item`, `.word-ctx-divider` (CSS at `css/panels.css` ~455-465).

**Toast**: `showToast(msg, duration)` (`js/ui-common.js:40-52`), set durations per UI-SPEC D-16 and change `.copy-toast` white-space rule in CSS.

**Print**: fill `#printSheet` with `textContent`, set a temporary body class (F6), `window.print()`, clear on `afterprint`.

**Pure builders** `songToTxt(song)` / `songToMd(song)` / `safeFileName(title)`: pure functions with no DOM so `tests/core-node.spec.mjs` style can load them (see `tests/node-core.mjs`).

---

### `js/ui-common.js` (modify)

**Analog:** itself, lines 78-120 (IIFE).
- Delete lines 84-91 (empty-lyrics auto-wipe of hashtags/context; it would erase intentionally empty songs).
- Lines 101-102 `renderLyricsSections(); renderHashtags();` move into `initSongs`; keep `renderSavedWords(); renderModelSelect(); window.__hoyunModelsReady = loadModels();` (103-106) in place.
- Show the static placeholder text in `#lyricsSections` (「載入歌詞中…」) before `initSongs`, via `textContent`.
- `copyWord` (2-9) builds `「${word}」` for `showToast` which is textContent-safe; no change needed, but the inline `onclick="copyWord('...')"` callers in `panels.js` are what must go.

---

### `js/ai-generate.js` (modify)

**Analog:** itself.
```javascript
const contextText = document.getElementById('contextDescription').value.trim();   // line 77
const hashtagStr = hashtags.length > 0 ? hashtags.map(t => '#' + t).join(' ') : '';   // line 78
...
document.getElementById('contextDescription').value = val;   // line 231
hashtags = tags;
lhSet('haiku_hashtags', JSON.stringify(hashtags));            // 236-237
```
Read `curSong().context` / `curSong().hashtags` (C6) and lyrics from `curSong().sections` (lines ~192-195). Writes: set `song.context` / `song.hashtags`, update the textarea `.value` (programmatic, no composition active), mark dirty and `flushSongs()`. Test `tests/ai-client.spec.mjs:212` must switch to `locator.fill()`.

---

### `js/panels.js` (`renderSavedWords`, lines 134-150)

**Analog:** itself plus the DOM-API chip construction. Current injectable code:
```javascript
container.innerHTML = savedWords.map(w =>
    `<div class="word-chip" onclick="copyWord('${w.replace(/'/g, "\\'")}')">` +
    `${w}<span class="chip-remove" onclick="event.stopPropagation();removeSavedWord('${w.replace(/'/g, "\\'")}')">×</span></div>`
).join('');
```
Rewrite with `createElement('div')` `.className = 'word-chip'`, `textContent = w`, child `.chip-remove` span, `addEventListener('click', ...)` closures calling `copyWord(w)` / `removeSavedWord(w)`. Keep the empty-state span (line 144) and the `savedCount` handling (136-139). Same B3/F11 treatment applies to the `renderHashtags` chips.

---

### `index.html` (markup)

**Analogs:**
- Dialog shell: line 247 `<div class="feedback-modal-overlay" id="reportModalOverlay" onclick="closeReportDialog(event)">` (read the surrounding lines for the `.feedback-modal.report-modal` structure and `.feedback-modal-actions`).
- Left panel header: `#leftPanel` at line 291; `#lyricsSections` at 299; `#contextDescription` at 308. Replace the `.side-panel-title` row with `.lyrics-head` per UI-SPEC 2.1 and add `.lyrics-layout` / `aside#songList` / `.lyrics-main` wrappers (IDs `#lyricsSections`, `#contextSection`, `#contextDescription`, `#hashtagChips` unchanged).
- Header buttons lines 64-67 and settings dialog line 192-193: change visible text to 備份全部 / 匯入備份 and add `title` + `aria-label` per UI-SPEC 8.1. Keep `onclick="exportSession()"` and the hidden `#importFileInput`.
- Hashtag popup keydown: line ~371-375 (Enter handler) add composing guard.
- Add `<script src="js/songs.js?v=">` after state.js and `js/song-io.js` per final `JS_ORDER`, `<link rel="stylesheet" href="css/print.css?v=" media="print">`, `<div id="printSheet" aria-hidden="true"></div>` as a direct `<body>` child, and bump every `?v=` (21 tags, currently 0.96.11).

---

### CSS (`css/panels.css`, `css/base.css`, `css/responsive.css`)

**Analog (dialog):** `css/panels.css:466-517`
```css
.feedback-modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 12000; align-items: center; justify-content: center; }
.feedback-modal-overlay.show { display: flex; }
.feedback-modal { background: var(--container-bg); border-radius: 0.875rem; padding: 1.5rem; width: min(26.25rem, 92vw); max-height: calc(var(--app-h) - 2rem); overflow-y: auto; ... }
.feedback-modal-actions { display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 0.25rem; }
.feedback-cancel-btn { background: none; color: var(--text-secondary); }
```
New rules extend with `.song-dialog` (same shell approach as `.report-modal` at `css/panels.css:519+`, which only overrides h3 size and spacing with `--sp-*`). Tiles `.import-choice` copy the `.report-reason` construction (find it just under line 519). Menu surface reuses `.word-ctx-menu` (z-index 10000). Song button/row rules use tokens only; no new hex outside token definitions and `print.css`.

**Analog (tokens):** `--action-*` definitions in `css/base.css` (grep `--action-bg`) for `--danger-*` (UI-SPEC D-09).
**Analog (touch/input floors, kb-open):** `css/responsive.css:718` (`html.kb-open .feedback-modal-overlay`), 738 and 774 (selector lists that include `.feedback-modal input`); add `.song-name-input` to both lists. `css/responsive.css:64` uses `.lyrics-section[data-index="0"]`, so `data-index` must remain.
**Toast fix (D-16):** change `.copy-toast` `white-space: nowrap` to normal with `max-width: min(92vw, 28rem)`; grep `copy-toast` in `css/`.

---

### Tests

**`tests/storage.spec.mjs`** (migration + two tabs). Analogs:
- Boot with fixture and assert (lines ~133-146): `ready` helper is `Promise.all([__hoyunReady, __hoyunWordlistReady, __hoyunSafetyReady])` (line 133); add `__hoyunSongsReady`. Update: `lh:schema` `'1'` -> `'2'` (146, 201, 481, 500), backup ids `['baseline']` -> `['baseline','pre-schema-2']` (139, 198), 212-219 (IDB unavailable), 174-193 (keep 3, pinned), 256-389 (call `localStorage.setItem('lh:schema','1')` first), 50-58 (read `lh:songs` active song after `flushSongs()`).
- Two-tab pattern to extend for "exactly one song, same id" and for the storage-event test R5:
```javascript
async function openTwoTabs(browser, storage) {
    const context = await browser.newContext({ ...CONTEXT_OPTS,
        storageState: { cookies: [], origins: [{ origin: BASE, localStorage: Object.entries(storage).map(([name, value]) => ({ name, value })) }] } });
    await routeExternal(context);
    await stubWordlist(context, readFileSync(new URL('./fixtures/wordlist-stub.ndjson', import.meta.url), 'utf8'));
    const pages = [await context.newPage(), await context.newPage()];
    const errs = pages.map(p => collectErrors(p).errors);
    await Promise.all(pages.map(p => p.goto('/index.html')));
    await Promise.all(pages.map(ready));
    return { context, pages, errs };
}
```
Export it (or copy into a shared helper in `tests/helpers.mjs`) for `songs.spec.mjs`.
- Migration test style: build storage from `FIXTURE` (`tests/fixtures/v096-localStorage.json`), assert byte equality of old `haiku_lyrics` sections against the migrated song, `dumpLS(page)` helper (line 132), and `expect(errors).toEqual([])`. Titles prefixed with a short category (`'backup: ...'`, `'migrate: ...'`, `'corrupt: ...'`); new files should use `'songs: ...'` / `'匯出: ...'` style consistently.

**`tests/songs.spec.mjs`** (IME RED R1-R5). Use `bootPage(browser, { storage: FIXTURE, wordlist: 'stub' })`, then
```javascript
const cdp = await page.context().newCDPSession(page);
await cdp.send('Input.imeSetComposition', { text: 'ㄋ', selectionStart: 1, selectionEnd: 1 });
await cdp.send('Input.insertText', { text: '你' });
```
(RESEARCH Q2). Keyboard/dialog style: copy `tests/report-entry.spec.mjs:282-317` (`active()` helper via `document.activeElement.id`, Tab wrap via `focus()` + `keyboard.press('Tab')`, Esc returns focus to opener).

**`tests/report-entry.spec.mjs`** helpers to import for layout/touch assertions: `DEVICES, setScale, waitStill, expectFullyInViewport, rectsOverlap, auditTouchTargets, auditVisibleControls, emulateKeyboard, readKeyboard, insideVisible, meetsInputFloor` from `./layout-lib.mjs` (line 6). Reuse for header-fit, 44x44, input-floor (`.song-name-input`) and keyboard-safe tests.

**`tests/helpers.mjs` line 148:** extend `Promise.all([window.__hoyunReady, w ? window.__hoyunWordlistReady : null, window.__hoyunSafetyReady, window.__hoyunModelsReady])` with `window.__hoyunSongsReady`.

**`tests/scan.spec.mjs:69-70`:** `toHaveLength(18)` / `Set(...).size toBe(18)` -> 21.
**`tests/split-tags.spec.mjs:8-12, 63-64`:** add `'songs'` after `'state'` and `'song-io'` per final order; add `css/print.css` to `CSS_ORDER`; update messages "完整 20 個 js" / "完整 3 個 css". Note line 56-58 uses prefix comparisons against `CSS_ORDER`/`JS_ORDER`; `print.css` has `media="print"` so verify the tag regex still captures it.
**`tests/smoke.spec.mjs:249-282`**, **`tests/layout.spec.mjs:1786-1846`** (`savedLyrics` helper reads `haiku_lyrics`), **`tests/save-failure.spec.mjs:29`** (banner text) updated per RESEARCH Q1 table.

## Shared Patterns

### Storage access
**Source:** `js/safety.js:58-105`
**Apply to:** `songs.js`, `song-io.js`, `lyrics.js`, `ai-generate.js`
All reads `lhGet/lhGetJSON(key, fallback, validate)`; all writes `lhSet(key, value)` (returns true/false, banner on failure). Never `localStorage` outside `safety.js` (scanner `tests/scan.spec.mjs:35-58`); every key literal must be registered (`lhAssertKnownKey` logs `console.error`, which fails smoke). Dynamic key loops belong in `safety.js` only.

### Safe rendering (no string-built HTML with user text)
**Source:** pattern to establish; current anti-examples `js/lyrics.js:49-51, 245-271`, `js/panels.js:146-149`.
**Apply to:** section render, hashtag chips, saved words, song list, dialogs, print sheet.
Use `createElement` + `textContent`/`.value`/`setAttribute` with ids matching `/^[A-Za-z0-9_-]{1,40}$/`; events via `addEventListener` or delegated listeners with `data-*` ids.

### IME-safe key handling
**Source:** `js/panels.js:109` (`e.isComposing || e.keyCode === 229`) and `js/search-ui.js:157` (compositionend handler)
**Apply to:** section label input, hashtag popup, `.song-name-input`, `#contextDescription`.
Never write `.value` or replace nodes while composing; save only when `!_composing && !e.isComposing`, always flush on `compositionend`/`focusout`/`pagehide`.

### Dialog shell, focus return, Esc/Tab trap
**Source:** `js/report.js:359-390, 466-478`; markup `index.html:247`; CSS `css/panels.css:466-517`
**Apply to:** delete dialog, import dialog.

### Menu placement
**Source:** `js/layout.js:153-170` (`lhPlaceMenu`), consumer `js/report.js:24,97`
**Apply to:** `#exportMenu`.

### Toast / error copy
**Source:** `js/ui-common.js:40-52` (`showToast`), `lhWarn` (`js/safety.js:40-43`)
**Apply to:** all user-facing outcomes; strings come verbatim from UI-SPEC sections 7-8.

### Version cache-bust
**Source:** `index.html` `?v=0.96.11` on 21 tags; enforced by `tests/split-tags.spec.mjs`
**Apply to:** every phase 8 change that touches `js/` or `css/`; bump all together.

### Test readiness signals
**Source:** `tests/helpers.mjs:148`, `tests/storage.spec.mjs:133`
**Apply to:** every new spec; wait for `__hoyunSongsReady`; assert `errors` is `[]` at the end; close the context.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `css/print.css` | config (print stylesheet) | n/a | No `@media print` or `media="print"` stylesheet exists yet. Use UI-SPEC section 4.3 table; link tag needs the shared `?v=`; check `tests/split-tags.spec.mjs` regex tolerates the `media` attribute; `tests/style.spec.mjs` may forbid hex literals, so add `css/print.css` to its allowlist (UI-SPEC permits `#000`/`#fff` there only). |
| IME composition handling in a delegated textarea listener | component | event-driven | Only `js/search-ui.js:157` handles `compositionend`, for a single input; use RESEARCH Pattern 2. |
| `storage` event listener (cross-tab sync) | service | event-driven | No existing `storage` listener; use RESEARCH Q4 design. |
| `window.print()` / `afterprint` flow | utility | file-I/O | None in repo; RESEARCH Q5 recipe (stub `window.print` in tests, `page.emulateMedia({ media: 'print' })`). |
| Playwright CDP IME tests | test | event-driven | No test uses CDP sessions yet; RESEARCH Q2 snippet. |

## Planner notes

- `js/lyrics.js`, `js/state.js`, `js/ui-common.js` are indented 8 spaces (legacy of the old inline script); new files and `safety.js`/`layout.js`/`report.js` top-level code use 4 spaces. Follow each file's existing indent when editing.
- `exportSession` / `importSession` names must survive (called from `safety.js:134`, `index.html:65-66,192`); define each once, in `song-io.js`, removing the `lyrics.js` copies.
- Hand-off order that keeps the app bootable at each commit: (1) safety.js registry + step + tests 18->21 and schema `'2'` updates, (2) state/songs init with legacy-compatible render, (3) lyrics.js DOM-API render + delegated editor, (4) song list + dialogs, (5) song-io + print.css, (6) AI/panels readers, (7) test updates. Each step bumps `?v=`.

## Metadata

**Analog search scope:** `js/`, `css/`, `tests/`, `index.html`
**Files scanned:** about 20 read in full or in targeted ranges (safety.js, lyrics.js, state.js, ui-common.js, layout.js 135-170, report.js 340-480, storage.spec.mjs, report-entry.spec.mjs, helpers.mjs, scan/split-tags excerpts, panels.js/css excerpts)
**Pattern extraction date:** 2026-10-10
