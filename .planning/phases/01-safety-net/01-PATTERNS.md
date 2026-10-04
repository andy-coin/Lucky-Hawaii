# Phase 1: Safety Net 安全網 - Pattern Map

**Mapped:** 2026-10-03
**Files analyzed:** 14 new, 1 modified (index.html, many sites)
**Analogs found:** 6 / 15 (all analogs are regions of tracked `index.html`; confirmed via `git ls-files`)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `js/safety.js` (lhGet/lhSet/lhWarn, banner) | utility/service | request-response | `index.html` `showToast` 5386-5397 | role-match |
| `js/safety.js` `lhIdbOpen` (v2, wl+backups) | service | CRUD | `index.html` `_idbOpen/_idbGet/_idbPut` 3948-3970 | exact |
| `js/safety.js` backup/migrate/restore | service | batch | `index.html` `importSession` 3859-3895 (write-several-keys + try/catch + toast) | partial |
| `index.html` localStorage swap to `lhGet/lhSet/lhRemove` | modify | CRUD | `index.html` 3292-3298, 2729-2743, plus 24 `setItem` sites | exact (self) |
| `index.html` swallowed-catch fixes (10+3 sites) | modify | event-driven | `loadWordlist` 3985-3993 | exact (self) |
| `index.html` readiness hook (`__hoyunReady`) | modify | event-driven | `index.html` ~5995-6022 | exact (self) |
| `tests/serve.mjs`, `playwright.config.mjs`, `tests/helpers.mjs` | config/utility | request-response | none | none |
| `tests/golden.spec.mjs` + `tests/golden/*.json` | test | transform | none | none |
| `tests/smoke.spec.mjs` | test | event-driven | none | none |
| `tests/scan.spec.mjs` | test | batch | none | none |
| `tests/save-failure.spec.mjs`, `storage.spec.mjs`, `error-visibility.spec.mjs` | test | event-driven | none | none |
| `tests/fixtures/*` | fixture | file-I/O | none | none |
| `package.json`, `.gitignore` | config | none | none | none |

## Pattern Assignments

### `js/safety.js` (banner, `lhSaveFailed`) — analog `showToast`

**index.html 5386-5397** (copy the lazy-create-by-id DOM idiom, class/state toggling, timer reset):
```javascript
function showToast(msg, duration = 1800) {
    let toast = document.getElementById('copyToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'copyToast';
        toast.className = 'copy-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), duration);
```
Difference: banner has no auto-dismiss timer, close button, per-kind throttle via `Date.now()`, own injected `<style>`, `z-index` above `.copy-toast` (9999). Use `textContent` only. Body may not exist when safety.js runs in `<head>`, so create lazily at failure time.

### `js/safety.js` `lhIdbOpen` — analog `_idbOpen/_idbPut`

**index.html 3948-3970** (replace; `_idbOpen` becomes `return lhIdbOpen();`):
```javascript
function _idbOpen() {
    return new Promise((res, rej) => {
        const req = indexedDB.open('haoYunQi', 1);
        req.onupgradeneeded = e => e.target.result.createObjectStore('wl', { keyPath: 'k' });
        req.onsuccess = e => res(e.target.result);
        req.onerror = () => rej(req.error);
    });
}
function _idbPut(db, k, v) {
    return new Promise(res => {
        const tx = db.transaction('wl', 'readwrite');
        tx.objectStore('wl').put({ k, v });
        tx.oncomplete = res;
        tx.onerror = res;     // never listens to onabort; resolves silently on error
    });
}
```
Keep: promise-wrapping style, `keyPath: 'k'`, store `wl`. Change: version 2, guard `createObjectStore` with `objectStoreNames.contains`, add `backups` store (`keyPath: 'id'`), `onversionchange` close, 5 s timeout, and `_idbPut` settles on complete/error/abort with `lhWarn` (see RESEARCH Pattern 8 for full code).

### `index.html` empty-catch fixes — analog `loadWordlist` 3985-3993

```javascript
let db = null;
try { db = await _idbOpen(); } catch(e) {}          // 3986: add lhWarn('IDB 快取不可用，改走網路', e)
...
try {
    const metaRes = await fetch('data/wordlist-meta.json');
    if (metaRes.ok) currentVer = (await metaRes.json()).version;
} catch(e) {}                                       // 3993: add lhWarn
```
Fix pattern: `catch(e) { lhWarn('<中文原因>', e); }`. Sites: 2742, 2799, 3986, 3993, 4019, 4041, 5024, 5256, 5312, 6220, plus recommended 2738, 5260, 3348. User-initiated failures use `showToast` (see `importSession` 3889-3891: `catch (e) { showToast('讀取失敗：檔案格式錯誤'); }`). Do not change logic at 5024/5256/5312 (Phase 2 owns it); add logging only.

### localStorage swap — analogs (self)

**Reads, top level 3292-3298** (become `lhGet` / `lhGetJSON(key, fallback)`; fixes corrupt-JSON app crash):
```javascript
let inputMode = localStorage.getItem('haoYunQi_inputMode') || 'auto';
let hashtags = JSON.parse(localStorage.getItem('haiku_hashtags') || '[]');
let lyricsSections = JSON.parse(localStorage.getItem('haiku_lyrics') || '[{"label":"","text":""}]');
let savedWords = JSON.parse(localStorage.getItem('haiku_savedwords') || '[]');
```
**Writes** (24 sites; mechanical rename only): `localStorage.setItem('haiku_lyrics', JSON.stringify(lyricsSections));` (3750, 3768, 3808, 3871, 3899, 3910); dynamic keys at 4470 (`` `apiKey_${provider}` ``), 5850 (`THEME_KEY`), 5971 (`key`). `importSession` 3869-3883 writes three keys in sequence; with `lhSet` returning false a failed write now raises the banner. Own commit, no logic change.

### `js/safety.js` registry/backup/migrate — no strong analog

Use RESEARCH.md Pattern 6 (lhGet/lhSet/lhWarn/lhIsQuotaError), Pattern 8 (LH_KEYS, lhSnapshot sync-first, lhBackup, lhMigrate, lhRestore). Only structural reference: `loadDictOverrides/saveDictOverrides` 2729-2743 (parse-with-fallback + key-specific store), which is what `lhGetJSON` generalizes.

## Shared Patterns

### Code style (all edits to index.html and js/safety.js)
- 4-space indent, single quotes, Chinese comments, classic script (no import/export, globals), section headers as in index.html 2491/2578/2686/2691/2884:
```javascript
// ==================== 儲存安全層 ====================
```
- Subsections `// ===== X =====`. Function names camelCase; internal prefixed `_`; new helpers prefixed `lh`.

### Log prefix
All background-error logs: `console.warn('[好韻器] ' + tag, err)` via `lhWarn`. Only non-critical errors; user-initiated failures use `showToast` with plain 繁體中文.

### Script load order
`<script src="js/safety.js?v=...">` goes in `<head>` after the data scripts (index.html ~2177-2178), before the inline script at ~2490, so `lhSnapshot()` runs before the 3292-3298 reads and the 5418-5421 `haiku_hashtags` removal.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `tests/*.mjs`, `playwright.config.mjs`, `tests/serve.mjs`, `tests/helpers.mjs` | test/config | request-response | Repo has no tests or Node tooling (only `.claude/hooks/package.json`). Use RESEARCH Patterns 1-5, 7 verbatim |
| `tests/golden/*.json`, `tests/fixtures/*` | fixture | file-I/O | None exist; RESEARCH Pattern 4 (capture shape) and Pattern 8 (fixtures) |
| `package.json`, `.gitignore` additions | config | — | No root package.json. `.gitignore` is untracked per RESEARCH; do not put anything under gitignored `scripts/` |

## Metadata

**Analog search scope:** `index.html` (grep of function names, setItem sites, section headers), CONTEXT.md, RESEARCH.md lines 1-524 (rest not loaded; Pitfalls and later sections not reviewed)
**Files scanned:** 1 source file plus 2 planning docs
**Pattern extraction date:** 2026-10-03
