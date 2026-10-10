# Phase 8: Songs & Editor Model 歌曲管理與資料模型 - Research

**Researched:** 2026-10-10
**Domain:** Vanilla-JS data model over localStorage (first real schema migration 1→2), IME-safe textarea editing, multi-song UI state, TXT/MD/print export, JSON backup/restore, Playwright validation
**Confidence:** HIGH for repo facts and Chromium behaviour (read or ran this session); MEDIUM for Safari/iOS/Android behaviour (cited or unverifiable here, see Assumptions Log)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

(Copied verbatim from 08-CONTEXT.md `## Implementation Decisions`.)

### A. 資料模型與遷移（資料安全最優先）
- **A1 新格式：** 新鍵 `lh:songs`（陣列，每首 `{ id, title, sections:[{ id, label, text, collapsed }], hashtags:[], context:'', createdAt, updatedAt }`）與 `lh:activeSong`（目前這首的 id）；兩個鍵都登記在 `js/safety.js` 的鍵清單（group: data／setting），讀寫一律走 `lhGet／lhSet`。
- **A2 遷移 1→2：** 用既有的 `LH_MIGRATIONS` 機制（`LH_SCHEMA_TARGET` 改 2）。把舊 `haiku_lyrics`（段落）、`haiku_hashtags`、目前畫面上的情境文字（舊版沒存，遷移時為空字串）組成第一首歌，標題「我的第一首歌」。遷移前一定先有備份（既有 `lhBootSafety` 流程）；遷移要 idempotent：`lh:songs` 已存在就不再做。**舊鍵 `haiku_lyrics`／`haiku_hashtags` 本 phase 不刪**（保留給降版與備份還原），但升級後不再寫入。
- **A3 開機順序：** 主程式第一次讀歌詞前 `await window.__hoyunSafetyReady`（STATE 待辦 WR-03 剩餘）；遷移失敗時照既有機制自動還原並維持舊版行為，不讓使用者看到空白歌詞。
- **A4 每首歌各自的：** 段落、#標籤、情境描述（情境改為會存檔，修掉舊版重新整理就消失的問題）。**全域共用的：** 保留池（saved words）、偏好設定、詞庫包。
- **A5 多分頁：** 監聽 `storage` 事件；別的分頁改了歌曲清單或某首歌時，若本分頁的編輯框沒有焦點就重新載入畫面，有焦點則等失焦後再更新，並 toast「其他分頁更新了歌詞，已重新載入」。同一首歌兩邊同時打字時，以最後存的為準（單人工具，接受）。

### B. 編輯器資料流（EDIT-01）
- **B1 資料為準：** 打字時只更新記憶體裡那一段的 `text`（用段落 id 對應，不靠畫面順序），不重新渲染任何 textarea；只有結構變動（新增／刪除／收合段落、切換歌曲）才重畫。
- **B2 存檔時機：** 輸入後延遲 300 毫秒存；`compositionend`、失焦、切換歌曲、`pagehide`／`visibilitychange` 時立刻存，確保關分頁不掉字。組字中（`compositionstart`～`compositionend`）不做任何會動到 DOM 的事。
- **B3 跳脫：** 段落文字、標籤、歌名一律用 DOM 屬性（`.value`／`textContent`）放入，不再用字串拼進 HTML（修掉舊版 `${s.text}` 直接塞進 textarea 的注入問題）；`renderSavedWords` 也一併改成跳脫（STATE 待辦）。
- **B4 外觀不變：** 段落的樣子、收合、標籤雙擊改名、刪除前確認都維持現狀；Phase 9 才重做段落模組。

### C. 側邊歌曲清單（EDIT-04）
- **C1 位置：** 在歌詞面板（桌機左側面板、手機／平板「歌詞」分頁）頂端加一顆「☰ 歌曲」按鈕，打開歌曲清單：桌機在歌詞面板內左側滑出一欄，手機在歌詞分頁內由上方展開覆蓋；顯示／隱藏狀態存成 UI 鍵 `lh:songListOpen`（登記）。歌詞面板標題列顯示目前歌名。
- **C2 新增：** 「＋ 新歌」建立「未命名歌曲 N」（N 取下一個可用數字），內含一個空段落，並切換過去、歌名進入可編輯狀態。
- **C3 重新命名：** 清單裡每首歌有 ✎；點 ✎ 或雙擊歌名進入編輯，Enter 或失焦存檔，Esc 取消；空白歌名退回原名；歌名最長 60 字。
- **C4 刪除：** 每首歌有 🗑；確認視窗「刪除「{歌名}」？這首歌的歌詞會一起刪除（刪除前會自動備份，可從備份還原）」；確認後先 `lhBackup` 再刪。刪掉最後一首時自動建立一首空的新歌，畫面永遠有一首歌。
- **C5 排序：** 依建立時間，新的在上；本 phase 不做拖曳排序。目前這首歌在清單中高亮。
- **C6 AI：** AI 建議與情境讀「目前這首歌」的歌詞、#標籤、情境。

### D. 匯出（EDIT-08）
- **D1 入口：** 歌詞面板標題列「⬇ 匯出」按鈕，選單：TXT（預設，第一項）／Markdown／PDF（列印）／複製整首。
- **D2 TXT 格式：** 第一行歌名、空一行；每段先一行「[段落名]」再接歌詞；段落之間空一行；UTF-8；檔名 `{歌名}.txt`（不合法字元換成 `_`）。
- **D3 Markdown：** `# 歌名`、每段 `## 段落名`、歌詞每行保留換行（行尾兩個空格）；檔名 `{歌名}.md`。
- **D4 PDF：** 不加任何套件，用瀏覽器列印（列印專用樣式表：只印歌名與各段落、黑字白底、段落名粗體、不印按鈕與面板），提示「在列印視窗選『儲存為 PDF』」。
- **D5 複製整首：** 複製 TXT 格式；`navigator.clipboard.writeText` 失敗時退回選取文字的舊方法；toast「已複製整首」。

### E. 備份與還原（EDIT-09）
- **E1 格式：** JSON `{ format: 'lucky-hawaii-backup', version: 2, exportedAt, songs, activeSong, savedWords, settings }`；`settings` 包含所有登記為 setting 的鍵（輸入模式、主題與客製顏色、詞庫包、AI 模型偏好等）與 `dictOverrides_v076`；不含 UI 收合狀態。用既有 `lhSnapshot` 的登記鍵清單產生，不另寫一份鍵名清單。
- **E2 入口：** 標題列既有的 SAVE／LOAD 改為「備份全部」「匯入備份」（文字維持短，aria-label／title 寫清楚）；檔名 `LuckyHawaii-備份-{日期時間}.json`。
- **E3 匯入：** 先檢查格式；顯示摘要「這份備份有 N 首歌與你的設定」，兩個選擇：「全部還原（取代目前資料）」與「只加入歌曲」；取代前自動 `lhBackup` 目前資料；只加入時 id 重複就換新 id、歌名重複加「（匯入）」。
- **E4 舊存檔相容：** 舊版 SAVE 產生的 v1 檔（`lyricsSections`＋`hashtags`＋`savedWords`＋`contextDescription`）仍可匯入，變成一首新歌（保留池合併去重）。
- **E5 壞檔：** 格式不對、版本太新、JSON 壞掉都只顯示白話錯誤，不改動任何資料。

### Claude's Discretion
- 以上 A～E 全部為 Claude 依專案慣例與既有決定選的推薦方案（Andy 授權不逐一詢問）。
- 視覺細節（清單寬度、動畫、圖示）由 UI-SPEC 決定，須符合 Phase 5 的 rem、44×44、晝夜／客製主題規則與 Phase 7 的按鈕語彙。

### Deferred Ideas (OUT OF SCOPE)
- 雲端同步、多裝置自動同步 — 不做（純前端、免費額度）
- 歌曲資料夾／標籤分類、歌曲拖曳排序、版本歷史 — v2
- 刪除舊鍵 `haiku_lyrics`／`haiku_hashtags` — 新格式穩定一個版本後再清
- 段落拖曳、Undo／Redo、段落標籤結構化、字數統計 — Phase 9
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EDIT-01 | 歌詞以資料模型為準（不再從畫面讀回），編輯時游標、注音輸入法組字不被打斷 | §Q2 (IME events, CDP simulation, RED tests), §Pattern 2 (delegated input handler), §Q3 (debounce/flush), Pitfalls 1-4, 9 |
| EDIT-04 | 多首歌管理：側邊分頁、顯示／隱藏、新增、切換、刪除、重新命名；舊單首歌詞自動遷移成第一首 | §Q1 (boot order, migration 1→2, legacy-mode fallback), §Q4 (storage event, merge-write), Pattern 1/3, Pitfalls 5-8 |
| EDIT-08 | 匯出：預設 TXT，另支援 PDF 與 Markdown；可一鍵複製整首 | §Q5 (Blob download, clipboard, print sheet, test recipes) |
| EDIT-09 | JSON 備份與還原（全部歌曲＋設定），可換裝置匯入 | §Q6 (v2 format, validation, replace/add, v1 compat, clean-browser test), Security Domain |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

Extracted from `./.claude/CLAUDE.md` and the user's global CLAUDE.md. Treated with the same authority as locked decisions.

- Hosting stays pure-front-end GitHub Pages + Cloudflare Worker; no new paid services; **no build step** (classic scripts, no import/export).
- **Data safety:** updates must not lose saved lyrics, overrides, settings; localStorage/IndexedDB changes must be backward compatible or migrated.
- Code may be split into several JS/CSS files, but must deploy with no or minimal build.
- UI and lexicon are Taiwan Traditional Chinese; **Simplified Chinese is forbidden** (every proposed user-facing string below is zh-TW).
- Style: 4-space indent, single quotes, camelCase, `_`-prefixed internals, Chinese comments explaining *why*, section headers `// ==================== X ====================`.
- When touching `css/` or `js/`, bump **all** `?v=` together (currently `0.96.11`; `tests/split-tags.spec.mjs` enforces).
- New storage keys must be registered in `js/safety.js`; tests scan for unregistered keys and for direct `localStorage` use outside `safety.js`.
- User-visible errors in plain language via `showToast` / `lhWarn`; confirmations use existing dialog styles.
- GSD workflow: file edits go through a GSD command (this research writes only the RESEARCH.md; no source touched).
- `.planning/` is gitignored locally (`.gitignore:17`); `commit_docs: false` in config, so no commit step is run.
- Global: Andy is a music producer, not a programmer; discussion in plain language; handoff.md is updated after coding tasks (executor concern).

## Summary

The phase is mostly a *re-plumbing* job: every piece of lyric state currently lives in three globals (`lyricsSections`, `hashtags`, plus the un-persisted `#contextDescription` DOM value) and is **read back from the DOM** (`saveLyrics`, `generateAISuggestions`, `generateContextFromLyrics`, `exportSession`). The new model replaces them with `songs[]` + `activeSongId`, persisted under the two new keys, with all UI reading/writing through the model. I ran the real app against the current code and confirmed the defects the new design must remove (see Q2): 3 `haiku_lyrics` writes happen during a 3-step composition, `</textarea><img>` in a section text injects a real element, DOM tampering flows into storage via `saveLyrics`, and pressing Enter while composing in the hashtag popup submits the half-composed text (`isComposing: true` on the keydown).

The first real migration (1→2) is safe if it is written as a **pure, deterministic, idempotent function inside `js/safety.js`** (it must live there because `lhBootSafety` runs at script load and the step needs `LH_MIGRATIONS` before any other script exists), uses a **fixed song id** so two tabs migrating at once write the same record, and treats `lh:songs` already-present as "skip". The app must additionally be able to boot in a **legacy single-song mode** when the migration was blocked (backup could not be stored) or rolled back, because A3 requires "維持舊版行為"; the existing storage tests already exercise both situations (600 000-char lyrics with no IndexedDB; failing migrations). Eight existing tests assert `lh:schema === '1'`, the key count 18, backup id lists, or read `haiku_lyrics` after an edit; they must change (full list in Q1 and Validation Architecture).

Two latent design gaps in CONTEXT/UI-SPEC need a decision now (both have recommended defaults in Open Questions): (1) the delete dialog promises "可從備份還原", but no UI restores an `lhBackup` record, and `LH_BACKUP_KEEP = 3` would evict the `baseline`/`pre-schema-2` safety copies after two deletions; (2) `lhRestoreFromBackup` does not reset `lh:schema`, so restoring a pre-upgrade backup would leave schema `2` with no `lh:songs`.

**Primary recommendation:** Build `js/songs.js` (model, 300 ms dirty-song merge-write persistence, flush hooks, `storage` handler) loaded right after `state.js`, keep every textarea alive during typing via **one delegated listener set on `#lyricsSections`** (input / compositionstart / compositionend / focusout), put the 1→2 step plus the key-iterating backup build/apply code **inside `js/safety.js`** (exempt from the registry scanner), and write the Playwright RED tests for composition (CDP `Input.imeSetComposition`) first.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Song/section model, active song | Browser / Client (JS memory) | Browser storage (localStorage `lh:songs`) | Pure front-end app; no server involved |
| Persistence + migration 1→2 | Browser storage (`js/safety.js` layer) | IndexedDB `backups` store | Existing safety layer owns all storage access, backups and restore |
| IME-safe editing | Browser / Client (event delegation) | — | Composition events exist only in the DOM; model update must not touch DOM |
| Cross-tab sync | Browser / Client (`storage` event) | localStorage | Same-origin tabs only; no server |
| TXT/MD export, clipboard | Browser / Client (Blob, Clipboard API) | — | No upload; strings built client-side |
| PDF | Browser print engine | CDN/Static (`css/print.css`) | `window.print()` + `@media print`; no library |
| Backup JSON build/apply | Browser / Client (`safety.js` + UI module) | File picker / download | Dynamic key iteration must stay in `safety.js` (scanner exemption + secret exclusion colocated) |
| AI prompts (lyrics/context/tags) | Browser / Client | Cloudflare Worker (unchanged) | Only the *source* of the three strings changes (model instead of DOM) |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| (none new) | — | Vanilla JS, native Blob / Clipboard / Storage / print APIs | Project constraint "no production dependencies, no build step" `[VERIFIED: .claude/CLAUDE.md]`; UI-SPEC "No new dependency (npm, CDN, font, icon set)" `[VERIFIED: 08-UI-SPEC.md:35]` |

### Supporting (dev/test only, already installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @playwright/test | 1.63.0 | All automated validation | `package.json` devDependencies: `"@playwright/test": "1.63.0"` `[VERIFIED: package.json]` |
| acorn | 8.18.0 | Static scan (`tests/scan-lib.mjs`) | Already used by registry/catch scanners `[VERIFIED: package.json]` |
| Chromium 1243 (Playwright cache) | — | CDP IME simulation, download, print emulation | `~/Library/Caches/ms-playwright` contains only `chromium-1243`, `chromium_headless_shell-1243`, `ffmpeg-1011` `[VERIFIED: ls this session]` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `window.print()` + print.css | jsPDF / pdfmake | Locked out by D4 ("不加任何套件") and CJK font embedding cost |
| Single `lh:songs` key | One key per song (`lh:song:<id>` prefix) | Per-key writes avoid cross-tab clobbering but need a new registry prefix and a second index; A1 locks the single key, so use merge-on-write instead |
| `navigator.locks` for migration | Web Locks API | Unneeded: deterministic id + idempotent step already make concurrent runs converge `[ASSUMED]` |

**Installation:** none. **Version verification:** no package added, so `npm view` is not applicable.

## Package Legitimacy Audit

No external packages are installed by this phase. `gsd_run query package-legitimacy check` not run (empty set).

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| — | — | — | — | — | — | none installed |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
 page load (head)                              body end (classic scripts, in order)
 ───────────────                               ───────────────────────────────────
 safety.js ──► _lhBootSnapshot (sync)          state.js: songs=[], activeSongId=null (empty shells)
   │  lhBootSafety():                                    savedWords = lhGetJSON(...) (unchanged key, sync read OK)
   │   baseline backup ─► lh:schema=1                    window.__hoyunSongsReady =
   │   lhMigrate(LH_MIGRATIONS, 2)                          __hoyunSafetyReady.then(initSongs)
   │     └─ backup 'pre-schema-2' ─► step 1→2                │
   │          legacy haiku_* ─► lh:songs, lh:activeSong      ▼
   │          ─► lh:schema='2'                         initSongs(): mode = (lh:schema==='2' && lh:songs valid)
   ▼                                                          ? 'v2' : 'legacy'  (hydrate 1 song from haiku_*)
 window.__hoyunSafetyReady                                   │
                                                             ▼
   user types ─► #lyricsSections (delegated listeners) ─► model.section.text (by section id)
        │  composing? ─► no storage, no DOM
        ▼  else
   mark song dirty ─► 300 ms timer ─► flushSongs(): re-read lh:songs, replace only dirty songs,
        ▲                              drop deleted ids, lhSet('lh:songs'), lhSet('lh:activeSong')
        │ flush NOW on: compositionend, focusout, song switch, pagehide, visibilitychange(hidden)
        │
   other tab writes lh:songs ─► 'storage' event ─► editing here? ─ yes ─► pendingExternal=true
                                                         │ no                 └─ on focus leave: flush own,
                                                         ▼                         reload model, re-render, toast
                                                  flush own dirty, reload, re-render, toast

   export:  model ─► toTxt/toMd(song) ─► Blob+<a download> | clipboard | #printSheet + window.print()
   backup:  lhSnapshot registry ─► {format,version:2,songs,activeSong,savedWords,settings} ─► download
   import:  file ─► validate/normalize (safety.js) ─► dialog ─► lhBackup(current) ─► apply ─► reload
```

### Recommended Project Structure
```
js/
├── safety.js     # + 3 registry keys, LH_SCHEMA_TARGET=2, step 1→2, lhNormalizeSong, lhBuildBackup, lhApplyBackup,
│                 #   pinned backups, schema-aware lhRestoreFromBackup, window.__lhMigrated flag
├── state.js      # replace lyricsSections/hashtags globals with songs/activeSongId shells
├── songs.js      # NEW (after state.js): model accessors, flushSongs, dirty/deleted sets, storage handler, legacy mode
├── lyrics.js     # render via DOM API, delegated editor listeners, hashtags UI, song list/rename/delete UI
├── song-io.js    # NEW: toTxt/toMd, download, copy, print sheet, exportSession/importSession + import dialog
├── ui-common.js  # IIFE no longer renders lyrics/hashtags; calls initSongs hook
├── ai-generate.js, panels.js   # read model; renderSavedWords via DOM API
css/print.css     # NEW (UI-SPEC D-12), linked media="print"
```
Every new `js/` or `css/` file requires editing `tests/split-tags.spec.mjs` (`JS_ORDER`, `CSS_ORDER`, the "完整 20 個 js" / "完整 3 個 css" messages) and the shared `?v=` bump.

### Pattern 1: Model-first with per-song merge-write
**What:** The model is the single source; persistence writes only the songs this tab touched, merged into whatever `lh:songs` currently holds.
**Why:** a single `lh:songs` key means a naive "write my whole array" in tab B silently reverts tab A's edits to a different song.
```js
// songs.js — 為什麼合併寫入：兩個分頁各改不同的歌時，不能互相蓋掉
const _dirty = new Set(), _deleted = new Set();
function flushSongs() {
    clearTimeout(_saveTimer); _saveTimer = null;
    if (!_dirty.size && !_deleted.size) return true;
    const cur = lhGetJSON('lh:songs', [], Array.isArray);
    const byId = new Map(cur.map(s => [s.id, s]));
    _deleted.forEach(id => byId.delete(id));
    _dirty.forEach(id => { const s = songs.find(x => x.id === id); if (s) byId.set(id, s); });
    const ok = lhSet('lh:songs', JSON.stringify([...byId.values()])) && lhSet('lh:activeSong', activeSongId);
    if (ok) { _dirty.clear(); _deleted.clear(); }       // 失敗就留著，下次再試（橫幅 lhSet 已跳）
    return ok;
}
```
`[CITED: lhSet returns true/false and always shows the banner on failure — js/safety.js:91-100]`.

### Pattern 2: One delegated listener set, textareas never replaced while typing
```js
// lyrics.js — 掛在不會被重畫的容器上；重畫只換子節點
const area = document.getElementById('lyricsSections');
let _composing = false;
area.addEventListener('compositionstart', () => { _composing = true; });
area.addEventListener('compositionend', e => { _composing = false; syncFromField(e.target); flushSongs(); });
area.addEventListener('input', e => {
    syncFromField(e.target);                       // 只改記憶體（.value → section.text），不碰 DOM
    if (!_composing && !e.isComposing) scheduleSave();   // Firefox：compositionend 之後才來的最後一個 input 也會走這裡
});
area.addEventListener('focusout', () => { _composing = false; flushSongs(); applyPendingExternalIfIdle(); });
```
`syncFromField` finds the section by `closest('.lyrics-section').dataset.id`, never by index. Keep the existing class names and `data-index` (tests and responsive.css rely on them: `css/responsive.css:64 .lyrics-section[data-index="0"]`) and add `data-id`.

### Pattern 3: Deterministic idempotent migration step (inside safety.js)
```js
// safety.js — 步驟必須在這裡：lhBootSafety 於載入當下啟動，其他 script 還不存在
const LH_SCHEMA_TARGET = 2;
LH_MIGRATIONS.push({ to: 2, run(store) {
    let songs = lhGetJSON('lh:songs', null, v => Array.isArray(v) && v.length > 0 && v.every(s => s && typeof s.id === 'string'));
    if (!songs) {                                          // 已有合法的 lh:songs 就不重做（冪等；兩個分頁同時跑也安全）
        const secs = lhGetJSON('haiku_lyrics', null, _lhLegacySectionsOk) || [{ label: '', text: '' }];
        const tags = lhGetJSON('haiku_hashtags', [], Array.isArray).filter(t => typeof t === 'string');
        const now = Date.now();
        songs = [{ id: 'song-migrated', title: '我的第一首歌',
            sections: secs.map((s, i) => ({ id: 'sec-m' + i, label: String(s.label ?? ''), text: String(s.text ?? ''), collapsed: !!s.collapsed })),
            hashtags: tags, context: '', createdAt: now, updatedAt: now }];
        store.set('lh:songs', JSON.stringify(songs));
    }
    const a = store.get('lh:activeSong');
    if (!songs.some(s => s.id === a)) store.set('lh:activeSong', songs[0].id);
}});
```
`LH_SCHEMA_TARGET` current value is `const LH_SCHEMA_TARGET = 1;` and the steps array is `const LH_MIGRATIONS = [];` `[VERIFIED: js/safety.js:327-329]`. Because `lhMigrate` reads `steps` only after `await lhBackup(...)` (js/safety.js:388-402) pushing from another file *can* work, but is racy; define the step in `safety.js`. Using `lhGetJSON` inside the step gives the existing corrupt-stash behaviour for free (`lh:corrupt:haiku_lyrics`), which `tests/storage.spec.mjs:54` already asserts.

### Anti-Patterns to Avoid
- **Writing `textarea.value` while composing** — Chromium experiment: `t.value += 'x'` mid-composition produced `ㄋㄧx你` (composition text stranded); replacing the node lost focus and the composition entirely (final value `''`); same-value assignment and `setSelectionRange` were harmless `[VERIFIED: ran ime3.mjs, Chromium 1243 via CDP Input.imeSetComposition]`.
- **Index-based identity** (`data-index` → `lyricsSections[i]`) for edits: use section ids (B1). Phase 9 reordering depends on it.
- **`innerHTML` with any user string** (section text, label, title, hashtag, saved word, imported anything).
- **Re-rendering from the `storage` handler while a field has focus.**
- **Deleting legacy keys or writing them after migration** (A2). In legacy mode only, writes go to the legacy keys.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Storage read/write + failure banner | new try/catch around localStorage | `lhGet/lhGetJSON/lhSet/lhRemove` | Banner, corrupt stash and registry assertion already there; scanner forbids direct access |
| Pre-change safety copy | custom snapshot | `lhBackup(id, label, lhSnapshot())` | IDB + localStorage fallback, keep-N, idempotent id |
| Rollback on failed apply | manual undo | `lhRestore(snapshot)` (writes first, then deletes, validates keys) | Already tested for quota failures |
| Settings key enumeration for backup | second key list | `LH_KEYS` / `LH_KEY_PREFIXES` (`secret` flag) | E1 says no second list; secret flag exists "讓之後的匯出(Phase 8)可以排除金鑰" |
| File → text | custom parser | `FileReader.readAsText` (existing pattern in `importSession`) | Already used and tested (`smoke.spec.mjs:249`) |
| Menu positioning | new popover math | `lhPlaceMenu(el, x, y)` `[VERIFIED: js/layout.js:153]` | UI-SPEC D-10 reuses it |
| Dialog shell | new modal framework | `.feedback-modal-overlay` pattern (report dialog) | UI-SPEC §3/§5 |
| PDF generation | any PDF library | browser print dialog | D4 |
| Markdown escaping | full CommonMark escaper | the 6-rule line-start escape specified in UI-SPEC §4.2 | Lyrics are plain lines |
| UUIDs | `crypto.randomUUID` | `Date.now().toString(36) + Math.random().toString(36).slice(2, 8)` | `randomUUID` exists only in secure contexts (LAN `http://` testing on the iPad would break); collision risk is irrelevant for one user `[ASSUMED]` |

**Key insight:** the only genuinely new algorithms are (a) merge-on-write, (b) the composition-safe event gate, (c) import validation/normalisation. Everything else already exists.

## Runtime State Inventory

> Phase 8 is a data-format migration (schema 1→2), so this section applies.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `haiku_lyrics`, `haiku_hashtags` (localStorage) hold the single song; `haiku_savedwords`, `dictOverrides_v076` unchanged. `contextDescription` was never stored. IndexedDB `backups` holds `baseline` (old format, schema 1). | **Data migration** (step 1→2 creates `lh:songs`/`lh:activeSong`); legacy keys left untouched (A2). **Code edit** for all readers/writers. |
| Live service config | None — Worker/KV hold feedback and corrections only, no lyrics. Verified by grep: no `haiku_`/lyrics reference in `admin/` or `worker/` (grep run this session returned nothing). | None |
| OS-registered state | None (PWA `manifest.json` only). | None |
| Secrets/env vars | `apiKey_*` keys are `secret: true` prefixed keys `[VERIFIED: js/safety.js:30]`. | Backup file must **omit** them; import must **ignore** them. |
| Build artifacts | None (no build). `?v=0.96.11` cache-busting tags in `index.html` (21 tags) must all be bumped. | Bump all together; add new files to `split-tags` expectations. |

**Open-tab hazard:** an already-open pre-upgrade tab (v0.96.x) keeps writing `haiku_lyrics`; after migration those writes are invisible to the new model. Accepted (document in handoff; the legacy key is also what a downgrade would read) `[ASSUMED]`.

## Q1 — Boot order, readers/writers, migration contract

### Exact boot order (read this session)
1. `<head>` (`index.html:17-23`, verified): `data/rhyme-dict.js`, `data/polyphonic-order.js`, **`js/safety.js`**, `js/layout.js`. `safety.js` takes `_lhBootSnapshot = lhSnapshot()` synchronously (js/safety.js:238) and ends with `window.__hoyunSafetyReady = lhBootSafety();` (js/safety.js:435).
2. End of `<body>` (verified `index.html` lines near 391-401): `phonetic-tables, dict, search, state, polyphonic, cards, lyrics, wordlist, panels, rhyme-display, ai-client, candidates, ai-generate, ui-common, results, search-ui, theme, init, report, ai-word-events`.
3. `state.js:7-10` reads `hashtags`, `lyricsSections`, `savedWords` **synchronously**, i.e. before the backup/migration promise settles. `ui-common.js:78-120` IIFE then renders them synchronously.

### Every reader/writer to change (grep'd this session)
| Item | Location | Change |
|------|----------|--------|
| initial reads | `js/state.js:7-9` | Replace with empty shells; `savedWords` (line 10) may stay synchronous (key not migrated) |
| empty-lyrics auto-wipe of tags/context | `js/ui-common.js:86-91` | **Delete.** It would erase tags/context of any intentionally empty song |
| first render | `js/ui-common.js:101-103` | Move `renderLyricsSections/renderHashtags` into `initSongs`; keep `renderSavedWords` |
| save from DOM | `js/lyrics.js:63-71 saveLyrics` | Remove DOM readback; `disableSectionLabel` (98-101) and `onSectionDrop` (121-130) call it → replace with model update + `scheduleSave` |
| hashtags | `js/lyrics.js:8-52`, `js/ai-generate.js:236-238` | Operate on `curSong().hashtags`; `renderHashtags` uses DOM API (today `#${t}` and `removeHashtag('${...}')` are string-built) |
| section CRUD | `js/lyrics.js:80-89, 217-272` | Operate on active song; render via DOM API |
| AI lyrics/context source | `js/ai-generate.js:77-82, 192-195, 231` | Read `curSong()`; context write goes to `song.context` + flush |
| v1 export/import | `js/lyrics.js:153-215` | Replace (Q6). Keep names `exportSession`/`importSession`: `safety.js:134` calls `exportSession` guarded by `typeof`, so renaming silently kills the banner's export button |
| saved words | `js/panels.js:134-150` | DOM API (B3); `onclick="copyWord('${...}')"` is injectable via imported words |
| header buttons | `index.html:64-67, 192-193`, `#lyricsSections` (299), `#contextDescription` (308) | Per UI-SPEC |

### Waiting for `__hoyunSafetyReady` without blocking first paint
Only the *lyrics area* waits. Everything else (search, results) paints immediately.
```js
// state.js
let songs = [], activeSongId = null;
window.__hoyunSongsReady = window.__hoyunSafetyReady.then(initSongs);   // initSongs 在 songs.js；呼叫時才解析
```
- Show a static placeholder inside `#lyricsSections` until `initSongs` renders (worst case `lhIdbOpen` waits 5 s: `LH_IDB_TIMEOUT_MS = 5000` `[VERIFIED: js/safety.js:178]`), copy: 「載入歌詞中…」.
- `initSongs` decides the mode after the promise: `v2` iff `lhGet('lh:schema') === '2'` and `lh:songs` validates; otherwise `legacy` (blocked backup, rolled-back migration). Do not depend on the promise's value (`lhBootSafety` returns the baseline backup result, not the migration result).
- **Legacy mode:** hydrate one in-memory song with the same builder the migration uses (export it from `safety.js` as `lhSongFromLegacy()`); `flushSongs` writes `haiku_lyrics`/`haiku_hashtags` instead; hide ☰ 歌曲 and make ＋ 新增歌曲 inert. Existing tests that force this path: `storage.spec.mjs:224-239` (600 000-char lyrics, no IDB, expects `lh:schema` null and no errors) and the failing-migration tests.
- Signal for tests: add `window.__hoyunSongsReady` to the `Promise.all` in `tests/helpers.mjs:bootPage` (the helper already tolerates undefined signals) and to the local `ready` helper in `storage.spec.mjs:133`.
- Signal for the UI-SPEC "first run after migration" toast (shown once, by the migrating tab): capture the `lhMigrate` result in `lhBootSafety` (`const m = await lhMigrate(...)`) and set `window.__lhMigrated = m.ran > 0`. Today the result is discarded (js/safety.js:426).

### Migration contract (idempotent, crash-safe, cross-tab-safe, reversible)
| Property | How it is satisfied |
|----------|---------------------|
| Pre-condition | `lhMigrate` takes `'pre-schema-2'` backup first and does **not** run if it cannot be stored (`blocked: true`, js/safety.js:388-389) |
| Idempotent | Step skips writing when a valid `lh:songs` exists; only repairs a missing/stale `lh:activeSong` |
| Crash after `lh:songs` written, before `lh:schema='2'` | Re-run on next boot: step sees valid `lh:songs`, only sets `lh:activeSong`, then flips the flag. `lh:schema` is set per-step after `run` (js/safety.js:404) |
| Partial write failure | `store.set` throws → existing catch path `lhRestore(snap)` removes registered keys absent from the snapshot (so `lh:songs`, `lh:activeSong` are removed) and resets `lh:schema`; banner `migrate-failed` (js/safety.js:408-417). `lh:songs` and `lh:activeSong` must therefore be **registered** (they are restorable only if known) |
| Two tabs at once | Fixed id `'song-migrated'`: both tabs write byte-equivalent songs (only timestamps differ); merge-write replaces by id so no duplicate "我的第一首歌" appears. `lhBackup` returns `existed` for the second `pre-schema-2` (js/safety.js:289). Existing test `storage.spec.mjs:487` already runs two migrating tabs |
| Corrupt/invalid legacy lyrics | `lhGetJSON` stashes raw under `lh:corrupt:<key>` and returns the fallback; the song becomes one empty section; legacy key and baseline backup keep the raw text |
| Reversible | **Gap:** `lhRestoreFromBackup` (js/safety.js:364-381) restores keys but not `lh:schema` (a meta key, excluded by `_lhRestorable`). Restoring `baseline`/`pre-schema-2` leaves schema `2` with no `lh:songs` → empty app. **Fix:** after a successful restore, write `lh:schema = String(rec.schema)` (records carry `schema`, js/safety.js:243) so the next boot re-migrates from the restored legacy keys |
| Backup eviction | `LH_BACKUP_KEEP = 3` (js/safety.js:219) is shared. Song-delete and import-replace backups would evict `baseline` and `pre-schema-2` after two operations. **Recommend:** never evict ids starting `baseline` or `pre-schema-`; keep the newest 3 of the rest |
| Idempotency of "migration ran" toast | Only when `m.ran > 0` in this tab |

**Registry additions** (verbatim existing style, js/safety.js:9-28):
```js
{ key: 'lh:songs', group: 'data' },
{ key: 'lh:activeSong', group: 'data' },
{ key: 'lh:songListOpen', group: 'ui' },
```
`lh:activeSong` is `data` (not `setting`) so the settings loop of the backup does not pick it up twice. Header comment "18 個固定鍵" must become 21.

### Existing tests that must change (verified by reading)
| File:line | Current assertion | Required change |
|-----------|-------------------|-----------------|
| `tests/scan.spec.mjs:69-70` | `expect(keys).toHaveLength(18)` / `.size).toBe(18)` | 21 |
| `tests/storage.spec.mjs:146, 201` | `lh:schema` `'1'` after boot | `'2'` |
| `storage.spec.mjs:139, 198` | backup ids `['baseline']` | `['baseline','pre-schema-2']` (line 141 `toHaveLength(17)` is the FIXTURE data size — unchanged) |
| `storage.spec.mjs:212-219` (IDB unavailable) | LS slot id `'baseline'`, list length 1 | slot now holds `'pre-schema-2'` (single slot overwritten, js/safety.js:252-264); `lh:schema` `'2'` |
| `storage.spec.mjs:174-193` (keep 3) | `['t3','t4','t5']` | with pinned baseline: `['baseline','t3','t4','t5']` (if Open Question 1 default is taken) |
| `storage.spec.mjs:256-389` (7 tests calling `lhMigrate([...],N)`) | assume boot left schema at 1 | boot now leaves schema `2`; first `page.evaluate(() => localStorage.setItem('lh:schema','1'))` in each (steps `to:2` are skipped otherwise) |
| `storage.spec.mjs:481, 500` (two tabs) | `lh:schema` `'1'` / pre-schema ids | `'2'`; add: exactly one song, same id in both tabs; the two-tab migrate test needs the reset helper |
| `storage.spec.mjs:50-58` | haiku_lyrics contains typed text | read `lh:songs` active song after flush; stash assertions stay |
| `tests/layout.spec.mjs:1786 savedLyrics` (+ uses 1810-1846) | `JSON.parse(localStorage.getItem('haiku_lyrics'))` | helper `activeSong(page)` reading `lh:songs`+`lh:activeSong`; wait for flush (`flushSongs()` via evaluate or `expect.poll`) |
| `tests/ai-client.spec.mjs:212` | sets `.value` with no event | use `locator.fill()` (fires `input`) because AI now reads the model |
| `tests/smoke.spec.mjs:249-282` | v1 payload import → toast `已讀取存檔`, first textarea, `#contextDescription` | v1 path must still work; keep toast text or update test; dialog now appears (UI-SPEC View A′) → click 「加入成新歌曲」 |
| `smoke.spec.mjs` coverage gate | every inline handler name must be fired in some scenario | new inline handlers are enumerated automatically from static markup (`base` scenario); dynamic list rows via delegated listeners are invisible to it — cover them in dedicated specs |
| `tests/split-tags.spec.mjs` | 20 js / 3 css | + `songs`, `song-io`, + `css/print.css` (UI-SPEC D-12) |
| `tests/save-failure.spec.mjs:29` | banner contains 「匯出備份」 | follow Open Question 5 |
| `tests/save-failure.spec.mjs:101-108` | dispatches `input` on textarea, expects banner | still works (save is debounced 300 ms; `toContainText` polls 5 s) |

## Q2 — IME composition

### What fires (measured, Chromium 1243 via CDP `Input.imeSetComposition`)
Sequence for 3 updates then commit with `Input.insertText('你')`:
```
compositionstart
compositionupdate  → beforeinput:insertCompositionText (isComposing=true) → input (isComposing=true) …(×3)
compositionupdate d="你" → beforeinput → input (isComposing=true, value="你")
compositionend   (value already "你")
```
- The **committing `input` still has `isComposing === true`**; `compositionend` follows it `[VERIFIED: ime.mjs run this session]`. A handler that ignores `isComposing` input events and does not save on `compositionend` would lose the last character. Hence B2's "compositionend → save now".
- Other engines order differently: the UI Events spec places `input` before `compositionend` (Chrome, Safari), whereas Firefox/Edge fire `input` after `compositionend` with `isComposing=false` `[CITED: https://github.com/w3c/uievents/issues/202 via lists.w3.org public-webapps-github 2018Apr/1183]` — MEDIUM. The Pattern 2 handler is correct for both orders (model always synced; save scheduled only when not composing; `compositionend` flushes).
- `blur()` during composition: Chromium fires `compositionend` (committing the half-composed text literally) **before** `blur` `[VERIFIED: ime3.mjs scenario E]`; so focusout flush sees the committed value.
- Enter handling: in the hashtag popup (`index.html` `onkeydown="if(event.key==='Enter'){confirmHashtagPopup()…"`) a composing Enter keydown arrives with `isComposing: true`, `keyCode 13` in this synthetic path and the current code **submits the half-composed text**: after `imeSetComposition('ㄅㄚ')` + `keyboard.press('Enter')` → `hashtags = ["ㄅㄚ"]`, popup closed `[VERIFIED: enter.mjs run against the real app]`. Real browsers report `keyCode 229` (Safari reports `isComposing=false` after `compositionend` but still 229) `[CITED: bugs.webkit.org/show_bug.cgi?id=165004 via search]`. Guard every Enter/Esc handler with `e.isComposing || e.keyCode === 229` (pattern already at `js/panels.js:109`): section label input (`onkeydown="if(event.key==='Enter')this.blur()"`), hashtag popup, the new song rename input, export menu typeahead if any.
- Writing `.value` mid-composition corrupts/ends it (table in Anti-Patterns). `compositionstart` may also be re-fired per word on Android Gboard, which treats most typing as composition and uses keyCode 229 `[ASSUMED]` — so never gate saving on "compositionend must arrive": `focusout`, `visibilitychange(hidden)`, `pagehide` also flush and reset `_composing`.
- iOS Zhuyin keyboard: marked text commits on candidate pick or blur; late/missing `compositionend` is a known class of quirk `[ASSUMED]` → same defence.

### Fields that need the same treatment
`.section-textarea`, `.section-label` input, `#contextDescription`, the hashtag popup input, the song rename input (`.song-name-input`), `#searchInput` (already has a compositionend handler, js/search-ui.js:157 — leave).

### Simulating composition in Playwright (Chromium only)
```js
const cdp = await page.context().newCDPSession(page);   // Chromium only; WebKit/Firefox are not installed here
const compose = (t) => cdp.send('Input.imeSetComposition', { text: t, selectionStart: t.length, selectionEnd: t.length });
await page.locator('.section-textarea').first().focus();
for (const t of ['ㄋ', 'ㄋㄧ', 'ㄋㄧˇ']) await compose(t);
await cdp.send('Input.insertText', { text: '你' });      // commit → compositionend
```
`page.keyboard.insertText` is a plain `insertText` input, **not** a composition. `document.hasFocus()` is `true` in every Playwright page (focus emulation) `[VERIFIED: storage_ev.mjs]`.

### Tests that FAIL on the current code (write these first = RED)
| # | Test | Current result (measured) |
|---|------|---------------------------|
| R1 | Spy `Storage.prototype.setItem` (init script); 3× `imeSetComposition`; assert **0** writes to the lyrics key(s) during composition and exactly the committed text stored ≤ 400 ms after `insertText` | 3 `haiku_lyrics` writes during composition `[VERIFIED: real.mjs]` → FAIL |
| R2 | Section text `</textarea><img id=pwn>&amp;x` loaded from storage: no `#pwn` element, textarea value equals the exact string | `#pwn` exists, value `''` `[VERIFIED: real.mjs]` → FAIL |
| R3 | Type `abc`; set `ta.value='TAMPER'` with no event; trigger backup/export/copy; output contains `abc`, not `TAMPER` | current `saveLyrics()` stores `TAMPER` `[VERIFIED: real.mjs]` → FAIL |
| R4 | Compose in hashtag popup, press Enter: no tag added, popup stays open | tag `ㄅㄚ` added `[VERIFIED: enter.mjs]` → FAIL |
| R5 | Two pages same context: B focuses a textarea; A saves a change; B's DOM unchanged until B blurs, then shows A's text + toast 「其他分頁更新了歌詞，已重新載入」 | no `storage` handler today → FAIL |

### Regression guards (pass today, must keep passing)
Node identity (`window.__ta === document.querySelector('.section-textarea')` after typing/composition), caret preserved (`selectionStart`), `MutationObserver` on `#lyricsSections` records 0 childList mutations during typing and composition. These guard the new design, they do not prove the old one broken.

### Limits
Real Zhuyin on macOS Safari/Chrome, iOS, Android Gboard cannot be automated here (no WebKit browser installed, synthetic CDP IME). That is the phase's **Human check** and must stay in 08-UAT.

## Q3 — Debounced save, flush semantics, quota

- **Flush events:** `pagehide`, `visibilitychange` (when `document.visibilityState === 'hidden'`), `focusout` from the editor, `compositionend`, song switch, before backup/export/import/delete.
- **Chromium verified:** a pending 300 ms write is flushed by `pagehide` both on in-tab navigation and on `page.close()` `[VERIFIED: flush.mjs]`. Test with `type → page.close()` then read from a sibling page of the same context; no `waitForTimeout` needed.
- **iOS/Safari:** `beforeunload`/`unload` are not reliable and a killed tab may emit nothing; `pagehide` + `visibilitychange(hidden)` are best-effort `[CITED: https://bugs.webkit.org/show_bug.cgi?id=199854 and ctrl.blog/entry/safari-beacon-issues]` — MEDIUM. Accept ≤ 300 ms of loss in a hard kill; do **not** use `beforeunload`.
- **Retention on failure:** `flushSongs` keeps the dirty set when `lhSet` fails so the next trigger retries; the failure banner is already throttled to once per 60 s (`LH_BANNER_THROTTLE_MS = 60000`).
- **Quota (Chromium, measured):** `QuotaExceededError` after 5 217 000 characters of 1 000-char values `[VERIFIED: quota.mjs]`. A 100-song library (5 sections × 12 lines, context, tags) stringifies to 145 381 characters in 1 ms and writes in 0.4 ms. So a ~3 % quota footprint; the whole-array rewrite per save is fine. Safari/Firefox are documented around 5 MB `[ASSUMED]`.
- **Backup fallback limit:** `LH_LS_BACKUP_MAX_CHARS = 500000` (js/safety.js:251): only matters when IndexedDB is unavailable; with ≳ 300 songs the localStorage fallback copy will not be written and the existing `backup` banner shows. Acceptable, mention in UAT.
- **Safari storage eviction:** ITP deletes script-writable storage (localStorage, IndexedDB) after seven days of Safari use without user interaction; Home Screen web apps have their own counter `[CITED: https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/]`. This is the real-world reason the manual JSON backup matters on iPad/iPhone; consider mentioning it in the import/backup hint copy (optional).

## Q4 — `storage` event cross-tab sync

Verified in Chromium with two pages in one context `[VERIFIED: storage_ev.mjs]`:
- The originating tab never receives its own event; the other tab does.
- `setItem` with an **unchanged value fires nothing**.
- `removeItem` → `newValue: null`; `clear()` → one event with `key: null`.

Design:
1. Handler filters `e.key === 'lh:songs' || e.key === 'lh:activeSong' || e.key === null` (also covers `lhRestore`, import-replace and migration writes). No `e.storageArea` check needed; **do not** write the bare token `localStorage` outside `safety.js` (the scanner flags it, `tests/scan-lib.mjs:73`).
2. "Editing" = `document.hasFocus()` **and** `document.activeElement` inside `#lyricsSections`, `#contextDescription`, or `.song-name-input`. Using `hasFocus()` means a background tab with a stale focused textarea updates immediately instead of staying stale (the lost-update hazard).
3. Not editing → `flushSongs()` (merge own pending first), re-read `lh:songs`, rebuild `songs`, keep the same active song if it still exists else pick the neighbour (toast 「其他分頁刪除了這首歌，已切換到「{歌名}」」), re-render, toast.
4. Editing → set `pendingExternal = true`; apply on the first `focusout` after which focus is no longer inside the editor (`setTimeout(0)` then re-check `document.activeElement`; moving between two textareas must not trigger a re-render).
5. Merge-write (Pattern 1) is what prevents tab B's save of song T from reverting tab A's edit of song S. Same song in both tabs: last write wins (A5).
6. Deleted-elsewhere resurrection: a tab that still holds a dirty copy of a song deleted in another tab will re-add it on its next flush. Accepted ("以最後存的為準"); the dirty set is emptied by the storage reload for non-focused tabs.
7. The deletion path must `_deleted.add(id)` and call `flushSongs()` synchronously after `lhBackup` resolves.

## Q5 — Export

### Download
- `a.download` + Blob URL works in Chromium and Playwright reports the suggested name: ran a click on `a[download="我的歌.txt"]`, `download.suggestedFilename()` → `我的歌.txt`, content byte-exact UTF-8 `[VERIFIED: print.mjs]`.
- The current code revokes the URL immediately after `a.click()` (js/lyrics.js:174-175). On WebKit, revoking right away can break the download and a delayed revoke has been reported to change the filename in one iOS case `[CITED: https://bugs.webkit.org/show_bug.cgi?id=211234]` — MEDIUM. Use: append the anchor to `document.body`, `click()`, then `setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 10000)`. iOS filename behaviour is a human check; 「複製整首」 is the always-available fallback. Optional later: `navigator.share({ files })` (not planned).
- TXT/MD: UTF-8, **no BOM**, `\n` (UI-SPEC §4.2). Type `text/plain;charset=utf-8` / `text/markdown;charset=utf-8`.
- File name: replace `[\\/:*?"<>|\u0000-\u001f]` with `_`, trim, fallback 「未命名歌曲」 (UI-SPEC §4.2).

### Text builders (pure functions → unit-testable in `core-node` style)
Blank sections skipped, blank label → 「段落 {n}」, all-blank song → toast 「這首歌還沒有歌詞可以匯出」 (UI-SPEC D-11). Markdown escape per UI-SPEC §4.2: a line starting with `#`, `>`, `-`, `*`, `+` or digits + `.` gets a leading backslash; hard break = two trailing spaces `[CITED: 08-UI-SPEC.md §4.2]`.

### Clipboard
- `navigator.clipboard` exists only in secure contexts. GitHub Pages is HTTPS; `http://127.0.0.1` counts as secure: `isSecureContext === true`, `typeof navigator.clipboard === 'object'` at `http://127.0.0.1` `[VERIFIED: print.mjs]`. A LAN `http://192.168.x.x` test URL is **not** secure → fallback path matters there `[ASSUMED]`.
- Call `writeText` synchronously inside the click handler (Safari requires the user gesture) and toast only after success. Existing `fallbackCopy` (js/ui-common.js:11-20) uses `ta.select()` which does not select on iOS; add `ta.setSelectionRange(0, ta.value.length)` and `readOnly = true`, and return the `execCommand` boolean. If both fail: 「複製失敗，請改用「TXT」下載」.
- Test: `CONTEXT_OPTS.permissions` already grants `clipboard-read/clipboard-write` (tests/helpers.mjs:14), so `navigator.clipboard.readText()` verifies content. Fallback test: init script `Object.defineProperty(navigator, 'clipboard', { value: undefined })` and a `copy` event listener capturing `getSelection().toString()`.

### Print / PDF
- Flow (UI-SPEC D-12): fill `#printSheet` via `textContent`, call `window.print()`, clear on `afterprint`. UI-SPEC hides every `body > *:not(#printSheet)` unconditionally inside `css/print.css` (media="print"), so **Cmd/Ctrl+P outside the PDF flow prints a blank page**. Recommended: scope the hide rule with a body class set only during the export flow (Open Question 6).
- `window.print()` in headless Chromium returns immediately and fires `beforeprint`/`afterprint` `[VERIFIED: print.mjs: events ['before','after','before','after']]`, so the sheet is cleared on `afterprint` before a test can inspect it. Test recipe: stub `window.print = () => {}` via init script, trigger export PDF, then `page.emulateMedia({ media: 'print' })` and assert computed `display` (verified: chrome → `none`, print area → `block` under print media; reverts with `media: null`). Then dispatch `afterprint` and assert the sheet is empty.
- `page.pdf({ format: 'A4' })` works headless and returns `%PDF-` bytes (22 624 for the toy page) `[VERIFIED: print.mjs]`; **no PDF text extraction tool is installed** (`pdftotext`, `mutool`, `qpdf`, `pypdf` all absent) → content is verified via print-media DOM text (`innerText` of `#printSheet`, `checkVisibility()` of everything outside it is false), layout beauty via Human check.
- iOS Home-Screen (standalone) `window.print()` behaviour is unverified `[ASSUMED]` → UAT item.

## Q6 — Backup v2, import, clean-browser test

### Build (inside `safety.js`, from the registry)
```js
function lhBuildBackup() {            // 全部在 safety.js：動態鍵迴圈不受 scan.spec 的 DYNAMIC_KEY_FUNCS 限制，金鑰排除也集中在這
    const snap = lhSnapshot();        // 已排除 meta、後台金鑰、未登記鍵
    const settings = {};
    for (const k of LH_KEYS) {
        if ((k.group === 'setting' || k.key === 'dictOverrides_v076') && typeof snap[k.key] === 'string') settings[k.key] = snap[k.key];
    }                                  // 不迴圈 LH_KEY_PREFIXES：apiKey_* 是 secret:true，絕不進備份檔
    return { format: 'lucky-hawaii-backup', version: 2, exportedAt: new Date().toISOString(),
        songs: /* flush 後的 songs */, activeSong: /* id */, savedWords: /* array */, settings };
}
```
- Excluded: UI group keys (`lh:songListOpen`, collapse flags, `lh:uiScale`), legacy `haiku_lyrics`/`haiku_hashtags` (the songs carry them; including them would re-seed a stale first song on restore), `lh:songs`/`lh:activeSong` (top-level fields), secrets, meta, `haoYunQi_admin_*` (never registered).
- File name `LuckyHawaii-備份-{YYYYMMDD-HHmm}.json`, local time, no `prompt()` (UI-SPEC §5.1; `bootPage` answers prompts with 「測試」, so a leftover prompt would silently rename files in tests).

### Validate / normalise (untrusted file)
Reject non-JSON; `format !== 'lucky-hawaii-backup'` and no v1 shape → "wrong format"; `version > 2` → "too new"; 0 songs → "no songs"; `file.size > 5 * 1024 * 1024` → "too large {X} MB". Then **normalise every field** (do not trust): ids must match `/^[A-Za-z0-9_-]{1,40}$/` else regenerate (they are used in `data-*` attributes and Map keys); title ≤ 60 chars (trim, empty → 「未命名歌曲」); sections: cap count (e.g. 200) and text length (e.g. 200 000 chars); `collapsed` coerced to boolean; hashtags: strings only, ≤ 50 each ≤ 30 chars; context ≤ 5 000 chars; `settings`: only keys that are registered `setting`/`dictOverrides_v076` and **not** secret-prefixed, values strings ≤ 1 000 000 chars, looked up via the registry (never `Object.assign(target, file.settings)` — `__proto__` own keys from `JSON.parse`). `savedWords`: strings ≤ 50 chars, deduped. UI-SPEC supplies the exact error copy (§8).

### Apply
- **全部還原:** `flushSongs()` → `lhBackup('import-replace-' + Date.now(), …, lhSnapshot())`; if `!ok` abort with View C → write `lh:songs`, `lh:activeSong`, `haiku_savedwords`, each settings key via `lhSet`; any `false` → `lhRestore(preSnapshot)` and View C 「還原沒有完成…」 (UI-SPEC); success → `location.reload()` so theme, colors, lexicon pack and input mode re-initialise through their existing boot code. Also clear dirty/deleted sets before reload so `pagehide` cannot flush stale songs over the restore.
- **只加入歌曲:** dedupe ids against current songs (regenerate), titles that collide get 「（匯入）」, `createdAt = Date.now() + i` so they appear at the top; settings/savedWords untouched.
- **v1 file** (`Array.isArray(lyricsSections)`): one new song 「匯入的歌曲」-style title (Open Question 7), `savedWords` merged and deduped, `contextDescription` → `song.context`; legacy `label`/`text`/`collapsed` normalised exactly as the migration does.
- `ev.target.value = ''` after every attempt (existing behaviour) so the same file can be re-chosen.

### Clean-browser restore test (automated)
```js
// context A: boot with FIXTURE + create 2nd song + edit; click 備份全部
const [dl] = await Promise.all([A.page.waitForEvent('download'), A.page.click('[onclick="exportSession()"]')]);
const file = test.info().outputPath('backup.json'); await dl.saveAs(file);
// context B: brand-new, empty storage
const B = await bootPage(browser, { storage: {} });
await B.page.setInputFiles('#importFileInput', file);        // 隱藏的 input 也可用（既有慣例 smoke.spec.mjs:249）
await B.page.getByRole('button', { name: '全部還原（取代目前資料）' }).click();   // UI-SPEC tile
await B.page.waitForLoadState('load');                        // 還原後會 reload
// assert: songs deep-equal (ids preserved), selectedModel/colors/lexicon pack present,
// savedWords equal, no apiKey_* key in the file or in B, B has an 'import-replace-…' backup
```

## Q7 — see `## Validation Architecture`.

## Common Pitfalls

### Pitfall 1: Last composed character lost
**What goes wrong:** code skips `input` events with `isComposing` and never saves on `compositionend`.
**Why:** the committing `input` is still `isComposing=true` in Chromium/Safari order.
**How to avoid:** `compositionend` reads the field and flushes; also flush on focusout/pagehide.
**Warning signs:** test R1's "committed text stored" fails by one character.

### Pitfall 2: Re-render triggered by a non-typing event during composition
**What goes wrong:** `storage` event, AI context result, toast, or banner insertion causes `renderLyricsSections()` while a field is composing → node replaced, composition and focus lost.
**How to avoid:** every re-render path checks `isEditingField()` (Q4) and defers; `_lhBannerShow` only prepends to `.container` and is safe.
**Warning signs:** MutationObserver on `#lyricsSections` shows childList changes while typing.

### Pitfall 3: Enter commits IME text
**What goes wrong:** inline `onkeydown` Enter handlers (hashtag popup, section label, new rename input).
**How to avoid:** guard `e.isComposing || e.keyCode === 229` everywhere (verified live bug R4).

### Pitfall 4: `.value` writes for "sync"
**What goes wrong:** copying the model back into the textarea on every input, or on `focusout` re-render.
**How to avoid:** DOM → model only; model → DOM only on structural renders / song switch / external reload.

### Pitfall 5: Single-key clobbering between tabs
See Q4/Pattern 1. Without merge-write, two tabs editing different songs lose edits.

### Pitfall 6: Migration run twice produces two first songs
**How to avoid:** fixed id `'song-migrated'` + "valid `lh:songs` ⇒ skip" + id-keyed merge.

### Pitfall 7: Registry/scanner traps for new code
`scan.spec.mjs` fails on: unregistered literal keys, any `localStorage` token outside `safety.js`, `lhSet(variable, …)` outside the single whitelisted `handleColorChange`, and any swallowed `catch` (empty, comment-only or `return`-only; the rule is "must call or rethrow", `tests/scan.spec.mjs:97-133`). New `try/catch` must call `lhWarn(...)`.

### Pitfall 8: Smoke gate fires every inline handler with synthetic events
`smoke.spec.mjs:103-119` dispatches `new Event('input')`, `DragEvent`, `KeyboardEvent('Enter')` at each distinct inline-handler element in a clean context. New static inline handlers (☰ 歌曲, ⬇ 匯出, menu items, tiles) must tolerate being fired with no songs open, no dialog context, and `DragEvent` with an empty `DataTransfer`; handlers must not throw when `activeSongId` is null. Delegated listeners are not enumerated — add dedicated tests.

### Pitfall 9: Import dialog or bad file changes data
Validate and normalise fully **before** any write; do not mutate state until the backup and every `lhSet` succeeds; rollback with `lhRestore`.

### Pitfall 10: `lhBackup` eviction / restore without schema
See Q1. Without the two fixes the "可從備份還原" promise in the delete dialog is false.

### Pitfall 11: AI context race
`generateContextFromLyrics` awaits an AI reply (up to ~35 s); the user may switch songs meanwhile. Capture `const song = curSong()` before the await and write the result to **that** song, not the then-active one.

### Pitfall 12: Toast copy longer than viewport
`.copy-toast` is `white-space: nowrap` today; UI-SPEC D-16 fixes it. Several new messages are long — include in the CSS task.

## Code Examples

### Section field → model (no DOM write)
```js
// lyrics.js
function syncFromField(el) {
    const secEl = el.closest('.lyrics-section');
    const song = curSong();
    if (!secEl || !song) return;
    const sec = song.sections.find(s => s.id === secEl.dataset.id);
    if (!sec) return;
    if (el.classList.contains('section-textarea')) sec.text = el.value;
    else if (el.classList.contains('section-label')) sec.label = el.value;
    song.updatedAt = Date.now();
    markDirty(song.id);
}
```

### Render with DOM API (B3)
```js
// 全部用 textContent / .value / dataset，不再用 innerHTML 拼字串
const ta = document.createElement('textarea');
ta.className = 'section-textarea';
ta.placeholder = i === 0 ? '在這裡輸入或貼上歌詞…' : '在這裡輸入歌詞…';
ta.value = s.text;                       // </textarea> 之類的字串原樣顯示
```
Placeholders are quoted from `js/lyrics.js:252` (`'在這裡輸入或貼上歌詞…' : '在這裡輸入歌詞…'`).

### TXT builder contract
```js
function songToTxt(song) {
    const parts = visibleSections(song).map(({ label, text }) => '[' + label + ']\n' + text.replace(/\s+$/, ''));
    return song.title + '\n\n' + parts.join('\n\n') + '\n';
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| DOM readback (`saveLyrics`) | Model-first, delegated events | this phase | removes 3 defects measured above |
| `exportSession` v1 (`lyricsSections` etc.) | v2 `lucky-hawaii-backup` + v1 import compat | this phase | all songs + settings |
| Immediate `revokeObjectURL` | delayed revoke | this phase | safer on WebKit |

**Deprecated/outdated:** `window.prompt` for backup file names; the "歌詞全空自動清除情境與標籤" block (ui-common.js:84-91); inline `oninput="saveLyrics()"`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Android Gboard treats most typing as composition, may re-fire `compositionstart` per word, uses keyCode 229 | Q2 | Save gating too strict → handled by multi-trigger flush; human check on device |
| A2 | iOS Zhuyin keyboard may fire `compositionend` late or only on blur | Q2 | Same mitigation; verify on iPad/iPhone |
| A3 | iOS Home-Screen (standalone) supports `window.print()` | Q5 | PDF export dead there; fall back to TXT/MD/copy; UAT item |
| A4 | iOS download filename survives delayed revoke | Q5 | File saved as "Unknown"; copy remains available |
| A5 | No-BOM UTF-8 TXT opens correctly for Andy's tools (UI-SPEC locks "no BOM") | Q5 | Old Windows Notepad shows mojibake; low risk (macOS user) |
| A6 | Safari/Firefox localStorage quota ≈ 5 MB like Chromium | Q3 | Heavy users hit banner sooner |
| A7 | Deterministic song id makes Web Locks unnecessary | Pattern 3 | Rare duplicate first song; merge-by-id prevents it |
| A8 | An old v0.96 tab left open will keep writing legacy keys and those edits are lost | Runtime State | Document in handoff |
| A9 | `Date.now()+Math.random()` ids are unique enough for one user | Don't Hand-Roll | Collision → merge by id overwrites a song; probability negligible |
| A10 | Safari fires `input` before `compositionend` as spec; Firefox after | Q2 | Pattern 2 is order-agnostic; no impact |
| A11 | Plain-text lyrics rarely contain Markdown specials beyond the six line-start rules | Q5 | Minor MD render glitches |
| A12 | `http://` LAN origins are not secure contexts, so clipboard API is absent there | Q5 | Fallback already planned |

## Open Questions

1. **Backups can be evicted and cannot be restored from the UI**
   - Known: delete dialog and CONTEXT C4 promise 「可從備份還原」; no restore-from-`lhBackup` UI exists in CONTEXT/UI-SPEC; `LH_BACKUP_KEEP = 3` evicts oldest.
   - **Recommended default:** (a) pin `baseline` and `pre-schema-*` (never evicted; keep newest 3 others); (b) make `lhRestoreFromBackup` set `lh:schema` from the record; (c) do **not** build a restore UI this phase — instead change the dialog sentence only if Andy vetoes; list the gap in 驗收清單 as "自動備份目前只能由開發者從主控台還原" and offer a minimal "從自動備份還原" entry as the first Phase-9 item. If Andy wants the promise honest now, add one small list in the import dialog (label + time + 還原) using `lhListBackups()` + `lhRestoreFromBackup()` then reload.
2. **Legacy-mode fallback scope**
   - Recommended: single hydrated song, writes to legacy keys, hide song list, banner already informs. Alternative (refuse to run editor) violates A3.
3. **Context text of the migrated song**
   - Legacy never stored it; recommended `''` (matches A2). The tab's current `#contextDescription` content at upgrade time is lost; accepted.
4. **Cross-tab same-song edits**: A5 says last write wins. Recommended: implement exactly that, no field-level merge.
5. **Banner wording vs new buttons**: banner says 「匯出備份」 while UI-SPEC renames buttons 「備份全部」. Recommended: change `LH_BANNER_TEXT` strings and the banner button label to 「備份全部」 and update `save-failure.spec.mjs:29`.
6. **Cmd/Ctrl+P outside the PDF flow prints a blank page** because print.css hides everything but the (empty) sheet. Recommended: scope the hide rule with a body class set only during the export flow (`body.print-song` added before `window.print()`, removed on `afterprint`), leaving normal browser printing unchanged. This deviates slightly from UI-SPEC D-12 wording ("every body > *:not(#printSheet) is display:none") — raise to planner; tests unchanged (`emulateMedia print` after the class is set).
7. **v1 import song title**: not specified. Recommended 「匯入的歌曲」 (+ 「（匯入）」 suffix on collision), toast per UI-SPEC 「已把舊版存檔加成新的一首歌「{歌名}」」.
8. **Backup size cap**: recommended 5 MB (file) with copy 「檔案太大了（超過 5 MB）…」.
9. **`lh:activeSong` group**: recommended `data` (see Q1).
10. **New file split**: recommended `js/songs.js` + `js/song-io.js` + `css/print.css`; fewer files is possible (all in `lyrics.js`) but that file is already the 273-line catch-all for Phase 9 rework.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | test runner | ✓ | v26.8.1 | — |
| @playwright/test | all specs | ✓ | 1.63.0 | — |
| Chromium (Playwright) | CDP IME, print, download | ✓ | 1243 | — |
| WebKit / Firefox Playwright browsers | cross-engine IME order | ✗ | — | Human check on real devices |
| pdftotext / mutool / qpdf / pypdf | PDF text assertions | ✗ | — | Assert print-media DOM text + `%PDF` header + non-trivial size |
| Real macOS/iOS/Android IME | EDIT-01 feel | ✗ (human) | — | 08-UAT human check |
| Port 4310 test server (`tests/serve.mjs`) | webServer | ✓ | — | — |

Baseline: `npx playwright test tests/storage.spec.mjs tests/scan.spec.mjs tests/split-tags.spec.mjs` → **50 passed (7.3 s)** before any change `[VERIFIED: run this session]`.

**Missing with no fallback:** none blocking.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | @playwright/test 1.63.0 (browser, CDP, static scan, node-only tests in one runner) |
| Config file | `playwright.config.mjs` (webServer `node tests/serve.mjs`, port 4310, `fullyParallel`, `retries: 0`) |
| Quick run command | `npx playwright test tests/songs-*.spec.mjs tests/storage.spec.mjs tests/scan.spec.mjs tests/split-tags.spec.mjs` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior (success criterion) | Test Type | Automated Command | File Exists? |
|--------|------------------------------|-----------|-------------------|-------------|
| EDIT-01 | R1: no storage writes during composition; committed text saved ≤ 400 ms (SC1) | e2e (CDP) | `npx playwright test tests/songs-ime.spec.mjs -g "組字"` | ❌ Wave 0 |
| EDIT-01 | R2/R3: injection and DOM-tamper do not reach DOM/model/outputs | e2e | `npx playwright test tests/songs-model.spec.mjs -g "跳脫\|資料為準"` | ❌ Wave 0 |
| EDIT-01 | Node identity, caret, 0 DOM mutations while typing and composing | e2e | `... tests/songs-ime.spec.mjs -g "不重畫"` | ❌ Wave 0 |
| EDIT-01 | R4: Enter during composition (hashtag popup, section label, rename) does not commit | e2e (CDP) | `... tests/songs-ime.spec.mjs -g "Enter"` | ❌ Wave 0 |
| EDIT-01 | Flush on `pagehide`/`page.close()`/`visibilitychange` | e2e | `... tests/songs-model.spec.mjs -g "關分頁"` | ❌ Wave 0 |
| EDIT-01 | R5 + merge-write: two tabs, different songs, no lost edit; focus defers reload (A5) | e2e (2 pages) | `... tests/songs-crosstab.spec.mjs` | ❌ Wave 0 |
| EDIT-04 | v0.96 FIXTURE boots → `lh:songs` has 1 song, title 「我的第一首歌」, sections/hashtags text identical (including `&`, `<b>`), legacy keys unchanged, `lh:schema '2'`, backups `baseline` + `pre-schema-2` (SC2) | e2e | `... tests/songs-migrate.spec.mjs -g "一字不少"` | ❌ Wave 0 |
| EDIT-04 | Migration idempotent ×3, crash between songs write and flag, two tabs → one song, corrupt/invalid legacy, blocked backup → legacy mode, failing step → rollback | e2e | `... tests/songs-migrate.spec.mjs` | ❌ Wave 0 |
| EDIT-04 | Song list: toggle, new (N numbering), switch, rename (Enter/Esc/blank/60), delete (backup first; last song → new empty), per-song tags/context persisted | e2e | `... tests/songs-ui.spec.mjs` | ❌ Wave 0 |
| EDIT-04 | AI prompt uses active song's lyrics/tags/context (request body inspected) | e2e | `... tests/songs-ui.spec.mjs -g "AI"` | ❌ Wave 0 |
| EDIT-04 | Touch targets ≥ 44×44 on new controls (phone/tablet), no overlap | e2e | extend `tests/layout.spec.mjs` audits | ✅ extend |
| EDIT-08 | TXT/MD download: suggested filename, exact content, blank-section skipping, escape rules (SC3) | e2e | `... tests/songs-export.spec.mjs -g "下載"` | ❌ Wave 0 |
| EDIT-08 | Copy whole song: clipboard text = TXT; fallback path with `navigator.clipboard` removed | e2e | `... tests/songs-export.spec.mjs -g "複製"` | ❌ Wave 0 |
| EDIT-08 | PDF: print media hides all chrome, shows only title + sections; sheet cleared on `afterprint`; `page.pdf()` is a valid PDF | e2e | `... tests/songs-export.spec.mjs -g "列印"` | ❌ Wave 0 |
| EDIT-08 | Pure text builders (`songToTxt`, `songToMd`, filename sanitiser) | node/unit | `... tests/songs-export.spec.mjs -g "builder"` (evaluate in page) | ❌ Wave 0 |
| EDIT-09 | Backup file shape (`format`, `version: 2`, no `apiKey_*`, no UI keys, no legacy keys, no admin keys) | e2e | `... tests/songs-backup.spec.mjs -g "格式"` | ❌ Wave 0 |
| EDIT-09 | Clean browser: export in context A → import in empty context B restores songs, settings, saved words (SC4) | e2e | `... tests/songs-backup.spec.mjs -g "乾淨"` | ❌ Wave 0 |
| EDIT-09 | Add-only: id dedupe, 「（匯入）」 titles; replace: auto-backup first; partial-write failure rolls back | e2e | `... tests/songs-backup.spec.mjs -g "加入\|取代"` | ❌ Wave 0 |
| EDIT-09 | Bad files: not JSON, wrong format, too new, no songs, too large, malicious ids/`__proto__`/`<script>` strings — no data change | e2e | `... tests/songs-backup.spec.mjs -g "壞檔"` | ❌ Wave 0 |
| EDIT-09 | v1 session file still imports (existing smoke tests updated) | e2e | `npx playwright test tests/smoke.spec.mjs -g "import"` | ✅ update |
| Registry | 21 keys, new keys registered, no direct storage, no swallowed catches | static | `npx playwright test tests/scan.spec.mjs` | ✅ update |
| Static | script/css tags and order incl. new files | static | `npx playwright test tests/split-tags.spec.mjs` | ✅ update |

### Sampling Rate
- **Per task commit:** the single spec file touched plus `tests/scan.spec.mjs` (≈ 10 s).
- **Per wave merge:** `npx playwright test tests/songs-*.spec.mjs tests/storage.spec.mjs tests/scan.spec.mjs tests/split-tags.spec.mjs tests/smoke.spec.mjs tests/save-failure.spec.mjs`.
- **Phase gate:** `npm test` fully green (baseline 548 passed / 27 skipped per handoff) before `/gsd-verify-work`; golden/visual snapshots for the `lyrics` state may need `npm run visual:update` (macOS `-darwin.png`) because the header row changes (UI-SPEC D-01) — treat as an expected, reviewed diff.

### Wave 0 Gaps
- [ ] `tests/songs-migrate.spec.mjs` — fixtures: reuse `tests/fixtures/v096-localStorage.json` and `v096-corrupt.json`; add a fixture string with `&amp;` and `</textarea>`.
- [ ] `tests/songs-ime.spec.mjs` — CDP helper `compose(page, text)`; storage-write spy init script.
- [ ] `tests/songs-model.spec.mjs`, `tests/songs-ui.spec.mjs`, `tests/songs-crosstab.spec.mjs` (reuse `openTwoTabs` pattern from `storage.spec.mjs:459`; move it into `helpers.mjs`).
- [ ] `tests/songs-export.spec.mjs`, `tests/songs-backup.spec.mjs`.
- [ ] `tests/helpers.mjs`: add `window.__hoyunSongsReady` to `bootPage`'s `Promise.all`; helpers `activeSong(page)`, `flushSongs(page)`, `compose`, `openTwoTabs`.
- [ ] Update list from Q1 (scan 18→21, storage.spec schema/backup-id/keep-3/reset-to-schema-1, layout `savedLyrics`, ai-client `fill`, smoke v1 import, split-tags, save-failure banner copy).
- [ ] Framework install: none.

**Human check (must remain in 08-UAT):** real Zhuyin composition on macOS Chrome/Safari, iPad/iPhone Safari, Android Gboard (caret, no flicker, last character kept, Enter commits candidate only); PDF layout beauty; iOS download filename and Home-Screen `window.print()`; clipboard on iOS Safari.

## Security Domain

`security_enforcement` is enabled (absent = enabled; config shows `security_enforcement: true`, ASVS level 1).

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | no accounts (admin key untouched) |
| V3 Session Management | no | — |
| V4 Access Control | partial | backup/import must never read or write `haoYunQi_admin_key` / `haoYunQi_admin_theme` (`LH_EXCLUDED_KEYS`, js/safety.js:34) |
| V5 Input Validation | **yes** | import normaliser + registry allow-list; DOM APIs (`textContent`/`.value`) instead of `innerHTML` |
| V6 Cryptography | no | none added |
| V8 Data Protection | **yes** | `apiKey_*` (`secret: true`) never written to the backup file, never accepted from it |
| V12 Files | **yes** | 5 MB size cap, `.json` only (`accept` attribute is advisory), parse in try/catch with `lhWarn`, safe download filename |
| V14 Config | partial | no new third-party script/CDN |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Stored XSS via imported backup (`title`, `label`, `text`, `hashtags`, `savedWords`, ids) — same origin as `admin/` pages and API keys | Tampering / Info disclosure | Render only through DOM APIs; sanitise ids to `/^[A-Za-z0-9_-]{1,40}$/`; remove string-built `onclick="…('${…}')"` for tags/saved words (currently injectable: `js/lyrics.js:50`, `js/panels.js:147-148`) |
| Existing injection `${s.text}` into textarea (reproduced: `</textarea><img id=pwn>` creates an element) | Tampering | Test R2 |
| Prototype pollution via `settings.__proto__` | Tampering | Allow-list by registry key, copy with explicit assignment to known keys only |
| Secret exfiltration through a shared backup file | Info disclosure | Exclude `secret` prefixes in build; ignore in apply |
| Oversized / deeply hostile JSON (DoS) | DoS | size cap, count/length caps before any write |
| Filename traversal / control chars in download name | Tampering | sanitiser (UI-SPEC §4.2) |
| Data loss on partial restore | Repudiation/Integrity | pre-import `lhBackup` + `lhRestore` rollback |
| Print sheet injection | Tampering | `textContent` only |

## Sources

### Primary (HIGH confidence)
- Repo files read this session: `js/safety.js` (all), `js/lyrics.js` (all), `js/state.js`, `js/init.js`, `js/ui-common.js`, `js/ai-generate.js:60-251`, `js/panels.js:1-150`, `index.html` (all), `tests/helpers.mjs`, `tests/storage.spec.mjs`, `tests/scan.spec.mjs`, `tests/smoke.spec.mjs:1-284`, `tests/split-tags.spec.mjs:1-70`, `tests/layout.spec.mjs:1780-1850`, `playwright.config.mjs`, `package.json`, `tests/serve.mjs`, `tests/fixtures/v096-localStorage.json`, 08-CONTEXT.md, 08-UI-SPEC.md (§1-§10 decisions, §2.4, §3-§5, §7-§9), 01-CONTEXT.md.
- Experiments run this session (scratchpad `ime/`): `ime.mjs`, `ime2.mjs`, `ime3.mjs`, `enter.mjs`, `real.mjs`, `print.mjs`, `quota.mjs`, `flush.mjs`, `storage_ev.mjs` — Chromium 1243, Playwright 1.63.0.
- Baseline test run: 50 passed (storage, scan, split-tags).
- https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/ — 7-day cap, Home Screen exemption.

### Secondary (MEDIUM confidence)
- W3C uievents issue 202 thread (via lists.w3.org public-webapps-github) — composition/input ordering across engines.
- https://bugs.webkit.org/show_bug.cgi?id=165004 — Safari Enter/keydown after compositionend.
- https://bugs.webkit.org/show_bug.cgi?id=199854 and ctrl.blog Safari beacon article — iOS lifecycle events unreliable.
- https://bugs.webkit.org/show_bug.cgi?id=211234 — iOS blob download revoke/filename.
- Pintura docs (download anchor pattern); classmethod/Evan You posts (value writes end composition) — corroborated by the Chromium experiment above.
- MDN `storage` event page (not fired on originating window) — corroborated by experiment.

### Tertiary (LOW confidence)
- Android Gboard and iOS Zhuyin behaviours (A1, A2) — training knowledge, not verified.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; versions read from `package.json`.
- Architecture: HIGH — derived from the actual code and exercised in the real app with experiments.
- Pitfalls: HIGH for Chromium/test-suite interactions (executed), MEDIUM for Safari/iOS/Android.

**Research date:** 2026-10-10
**Valid until:** 2026-11-10 (stable; re-check only if `js/safety.js` or the test helpers change before planning)
