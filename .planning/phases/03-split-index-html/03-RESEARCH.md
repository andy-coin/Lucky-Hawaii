# Phase 3: Split index.html 拆檔 - Research

**Researched:** 2026-10-04
**Domain:** Behavior-preserving split of a 6253-line single-file vanilla-JS app into classic-script and CSS files (no build step, GitHub Pages)
**Confidence:** HIGH (the proposed split was executed end to end in a scratch copy; the full suite passed, see "Trial Result")

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
### 拆檔機制
- 採「classic script（非 ES module）＋依序載入」：79 個 inline `onclick` 等 handler 依賴全域函式，classic script 保留全域語意、`file://` 也能開、零建置；不改成 ES modules（研究 STACK vs ARCHITECTURE 分歧，此處決定 classic）
- 載入順序完全保留原本 inline script 由上到下的執行順序（同一個全域作用域語意）；注意 `let`/`const` 在多個 classic script 間共用全域詞法環境，仍可互相存取
- 核心純邏輯檔（注音／拼音轉換、韻母／借韻、查韻、篩選）做成可在 Node 載入：檔尾以 `typeof module !== 'undefined'` 守衛匯出，或 Node 測試以 `vm` 載入；由研究決定最小侵入的方式
- CSS 拆到 `css/` 下（依區塊切成數個檔或單一檔由研究決定，維持原本規則順序）

### Commit 紀律
- 「搬移程式碼」與「修 bug」絕不混在同一個 commit；搬移 commit 必須可機械驗證（拆出的內容與原段落逐字相同，只差位置）
- 每一步搬移後 Phase 1 golden＋smoke＋全套 `npm test` 必須全綠

### 快取與部署
- 新增的 `<link>`/`<script src>` 一律帶版本參數（沿用 `?v=` 慣例），避免 GitHub Pages 快取新舊混用
- 使用者存的歌詞／覆寫／設定在拆分後完整讀得到（storage 測試＋v0.96 fixture 驗證）

### Claude's Discretion
- 檔案切分粒度、檔名（建議 `js/` 下依職責命名，如 phonetics、rhyme、search、render、lyrics、ai-client、theme、init）
- Node 測試採 Playwright Node-only spec（與 Phase 2 worker 測試相同模式）或 node:test

### Deferred Ideas (OUT OF SCOPE)
- 改為 ES modules／模組化全域狀態 → 視 Phase 8 編輯器資料模型需要再議
- 死碼清理（saveApiKey 等）若非必要不在本 phase
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FND-04 | `index.html` 拆分為多個 JS / CSS 檔，GitHub Pages 直接部署無需建置；拆分與修 bug 不混在同一個 commit | Chunk manifest (20 JS + 3 CSS, contiguous verbatim ranges); trial split passed 229/231 (2 unrelated, see below); `tests/verify-split.mjs` mechanical verbatim check; Node `vm` core loader; single shared `?v=`; commit plan |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

Source: `./.claude/CLAUDE.md` and Andy's global instructions.
- Hosting stays pure-frontend GitHub Pages + Cloudflare Worker; no build step ("仍需無建置或極簡建置可直接部署").
- Data safety: updates must not lose saved lyrics / overrides / settings (localStorage / IndexedDB backward compatible).
- Code style: 4-space indent, Chinese comments, single quotes, section headers `// ==================== X ====================`. Moved code stays verbatim (do not reformat or dedent).
- Interface and lexicon Traditional Chinese only; Simplified Chinese forbidden.
- GSD workflow enforcement: all edits go through a GSD workflow (this phase is one).
- Global habit: after each coding task update `handoff.md` (it is gitignored); "commit" keyword triggers a git commit. GSD state files are the source of truth for GSD projects.
- Never push; `.planning/` is gitignored (`.gitignore`: `.planning/`).

## Summary

The inline script (`index.html` lines 2492-6250) can be cut into 20 contiguous, verbatim, in-order slices that become sequential classic `<script src>` files, and the inline `<style>` (lines 15-2175) into 3 contiguous CSS files. I executed exactly this split in a scratch copy of the repo (outside the working tree) and ran the real `npx playwright test`: 229 passed, 2 failed, and the 2 failures are `worker-config` tests that call `git` inside a non-git scratch copy (unrelated to the split). Golden (41x3), smoke (91 handlers + coverage gate), scan (registry + swallowed-catch, which walks `js/**`), storage and save-failure tests all passed on the split layout with zero edits to any test.

Hoisting across the old single script is **not relied upon at load time**. An AST analysis (transitive closure of every top-level statement and IIFE, over-approximating) found zero statements whose load-time reach includes a top-level name declared later in the file. The only load-time executors of app code are the IIFE at 5318-5371 (panel-state restore) and the init block at 5915-5942, and everything they reach is declared earlier. So any in-order contiguous split is safe; reordering code is not needed and must not happen in this phase. One scanner constraint is real: `tests/scan-lib.mjs` resolves `const NAME = 'literal'` per source file, so `THEME_KEY` must stay in the same file as its `lhGet/lhSet` uses (it does in `js/theme.js`).

Core testing in Node needs no change to moved code: Node `vm` loads `data/rhyme-dict.js` plus 7 core files into one context with 5 stub functions, and top-level `let/const` share the context's global lexical scope exactly as in the browser. `searchRhyme` is DOM-free (it only reads/writes global state), so the Node result was compared byte-for-byte with the browser result for 12 inputs and matched. `displayResults` grouping is interleaved with HTML-string generation and DOM reads; do not extract it in this phase (see Open Questions).

**Primary recommendation:** Move verbatim slices top-first (CSS, then 20 JS chunks in 4-5 grouped commits), verify each commit with `node tests/verify-split.mjs <BASE>` plus full `npm test`, add a `vm`-based Node spec for the core files with a browser-parity check, use one shared `?v=` on every new tag, and keep `init.js` in its original mid-file position.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Asset delivery (HTML skeleton, css/, js/) | CDN / Static (GitHub Pages) | — | Pure static hosting, `cache-control: max-age=600` fixed by GitHub (verified below) |
| Script load order / global scope | Browser / Client | — | Classic scripts sharing one global lexical environment |
| Rhyme search + word filtering (core) | Browser / Client (pure functions, DOM-free) | Node (test-time load via `vm`) | Core files have no load-time DOM access; tests exercise them headless |
| Rendering results / panels / theme | Browser / Client | — | DOM-centric, unchanged |
| Persistence (localStorage/IDB) | Browser / Client via `js/safety.js` | — | Untouched; safety.js stays first in `<head>` |
| AI calls | Cloudflare Worker (Phase 2) | Browser client in `js/ai-client.js` | Moved verbatim only |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Classic `<script src>` (no `defer`/`async`, end of `<body>`) | HTML spec | Sequential load preserving original semantics | Same timing as the former inline script; inline `onclick` handlers keep resolving globals [VERIFIED: trial run, smoke passed] |
| `<link rel="stylesheet">` x3 in `<head>` | HTML spec | Replace inline `<style>` | Render-blocking so no FOUC; document order = cascade order |
| `node:vm` | Node 26.8.1 | Load core files untouched in Node | No guard/export edits to moved code [VERIFIED: trial run] |
| `@playwright/test` | 1.63.0 | Existing runner; Node-only spec like Phase 2 worker specs | Already installed [VERIFIED: `npx playwright --version` -> `Version 1.63.0`] |
| `acorn` | 8.18.0 | Already used by `tests/scan-lib.mjs` | No new dependency [VERIFIED: package.json devDependencies] |

### Supporting
None. No new packages are installed in this phase.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `vm` loader | `typeof module !== 'undefined'` export guard at file tails | Adds non-verbatim lines to every core file, so each move commit stops being a pure move; guard would need its own follow-up commit. `vm` needs zero code change. |
| 3 CSS files | 1 file `css/style.css` | One file is the lowest-risk move; 3 files are easier to navigate in Phase 5 layout work. Cut points were verified to be at brace depth 0. Recommended: 3. |
| Per-file `?v=` | single shared `?v=` | Per-file gives no extra safety on GitHub Pages (see Cache Strategy) and invites forgotten bumps. Recommended: single shared value. |

**Installation:** none (`npm install` not needed).

**Version verification:** `node --version` -> `v26.8.1`; `npx playwright --version` -> `Version 1.63.0` [VERIFIED: shell this session].

## Package Legitimacy Audit

No external packages are added or changed in this phase. `acorn` and `@playwright/test` are existing pinned devDependencies from Phase 1. Package Legitimacy Gate: not applicable.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
Browser GET /index.html  (skeleton: markup + <link>s + <script src>s)
   |
   |-- <head>
   |     css/base.css -> css/panels.css -> css/responsive.css     (render-blocking, cascade = tag order)
   |     data/rhyme-dict.js      -> window._rhymeDictData (var)
   |     data/polyphonic-order.js-> window._polyphonicsOrderData (var)
   |     js/safety.js            -> lh* helpers, LH_* registry, boot snapshot, __hoyunSafetyReady   (MUST be first JS)
   |
   `-- <body> markup ... then, in this exact order (all parser-blocking classic scripts):
         [CORE: DOM-free at load]   phonetic-tables -> dict -> search -> state -> polyphonic
         [UI / data]                cards -> lyrics -> wordlist -> panels -> rhyme-display
         [AI]                       ai-client -> candidates -> ai-generate
         [UI glue + load-time IIFE] ui-common (ends with panel-state IIFE: restores panels, renders lyrics/tags/saved,
                                      starts loadModels -> __hoyunModelsReady)
         [render + wiring]          results -> search-ui -> theme (reads THEME_KEY, applies theme at load)
         [BOOT]                     init  (rhymeDict = window._rhymeDictData; buildIndex(); __hoyunReady; loadColors();
                                      __hoyunWordlistReady = loadWordlist())
         [late listeners]           report (context menus + feedback) -> ai-word-events (hover/long-press)
   |
   `-- all globals (functions = window props, let/const = shared global lexical env)
         <- inline onclick="fn()" handlers resolve here at click time

Node test path:  vm.createContext(stubs) -> run data/rhyme-dict.js -> run CORE files (7) -> buildIndex() -> call searchRhyme / filterWords*
```

### Recommended Project Structure
```
index.html          # skeleton only: markup + <link> + <script src>
css/
├── base.css        # 15-742   @import fonts (MUST remain first rule), :root, dark vars, header, results, cards, settings
├── panels.css      # 743-1545 side panels, lyrics, AI panel, tags, saved pool, bottom tab bar
└── responsive.css  # 1546-2175 <=900px sheet, batch panel, tag popup, <=440px (late @media blocks must stay late)
js/
├── safety.js       # existing, untouched, first
├── phonetic-tables.js  # zhuyin/pinyin tables, BORROW_MAP, RHYME_FAMILIES, PINYIN_RHYME_MAP, PINYIN_SPECIAL
├── dict.js         # rhymeDict/chineseDict/charInfo, buildIndex, dict overrides, getCharMark/moveCharTier/cycleCharMark
├── search.js       # getZhuyinInitial/Rhyme, tone helpers, pinyin<->zhuyin, searchRhyme
├── state.js        # global state block (inputMode, hashtags, lyricsSections, savedWords, filters, ...)
├── polyphonic.js   # polyphonic order/readings/chips
├── cards.js        # createCharCard, reorder, badges, selection, batch mark
├── lyrics.js       # hashtags, left panel, sections, drag reorder, export/import session
├── wordlist.js     # IndexedDB wordlist cache, loadWordlist, overrides, filterWordsByRhyme/Initial, getWordlistCandidates*
├── panels.js       # right panel, syncCenterPanel, mobileTab, saved words pool
├── rhyme-display.js# updateAIRhymeDisplay, renderRhymeDisplay, setRhymeMode, reportMissingChar
├── ai-client.js    # WORKER_URL, AUTO_MODEL, loadModels, callLLM, aiError   (Phase 4 touches)
├── candidates.js   # filter toggles, *Single filters, selected chars, validateWordRhyme, phonetic display
├── ai-generate.js  # generateAIWords, generateAISuggestions, generateContextFromLyrics   (Phase 4 touches)
├── ui-common.js    # copyWord, showToast, cycleInputMode, + load-time panel-state IIFE
├── results.js      # displayResults
├── search-ui.js    # search input listeners, settings/about/zoom buttons, mode buttons
├── theme.js        # dark mode, THEME_KEY, zoom slider, colors (handleColorChange)
├── init.js         # boot sequence (stays mid-order)
├── report.js       # right-click report menus + feedback modal
└── ai-word-events.js # hover phonetic tooltip + long-press on AI word cards
tests/
├── verify-split.mjs      # one-off mechanical verbatim check (NOT *.spec so Playwright ignores it; NOT scripts/, which is gitignored)
└── core-node.spec.mjs    # vm-based Node core test + browser parity
```

### Chunk Manifest (current `index.html` line numbers, base commit 2f2d248)

Rule: a chunk starts at the first non-blank line after the previous chunk's last statement, and a comment directly above code stays with that code. End = next start - 1; last chunk ends at 6250 (line 2491 is `<script>`, 6251 is `</script>`). Every start below was checked: no top-level statement spans a boundary (`[VERIFIED: acorn statement spans vs start lines]`).

| File | Lines | Top-level declarations (load-time statements marked LT) |
|------|-------|--------------------------------------------------------|
| css/base.css | 15-742 | `@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC...')` first rule, `:root`, `[data-theme="dark"]` |
| css/panels.css | 743-1545 | |
| css/responsive.css | 1546-2175 | `@media (max-width: 900px)` x2, `@media (max-width: 440px)` |
| js/phonetic-tables.js | 2492-2686 | consts: zhuyinInitials, zhuyinInitialSet, pinyinInitials, fullZhuyinToPinyin, fullPinyinToZhuyin, pinyinInitialToZhuyin, BORROW_MAP, RHYME_FAMILIES, RHYME_TO_FAMILY, PINYIN_RHYME_MAP, zhuyinInitialToPinyin, rhymeToPinyinLabel, PINYIN_SPECIAL. LT: 4 `for...of` loops + `RHYME_FAMILIES.forEach` + `Object.assign` (reference only own consts) |
| js/dict.js | 2687-2883 | let rhymeDict, chineseDict, charInfo, dictOverrides; buildIndex, loadDictOverrides, saveDictOverrides, clearDictOverrides, _removeCharFromRhymeKey, _addCharToRhymeKey, applyRhymeDictOverrides (async), getCharMark, moveCharTier, cycleCharMark |
| js/search.js | 2884-3290 | getZhuyinInitial, TONE_MARK_RE, TONE_TAIL_RE, TONE_CHAR_TO_INT, stripTone, getZhuyinTone, getZhuyinRhyme, pinyinToZhuyinGroups, pinyinToZhuyin, zhuyinToPinyin, isPinyinInitial, isZhuyinInitial, searchRhyme |
| js/state.js | 3291-3330 | 36 `let/const`; LT: `lhGet('haoYunQi_inputMode')`, `lhGetJSON` x3 (from safety.js) |
| js/polyphonic.js | 3331-3443 | polyphonicsOrderMap, _polyphonic, _TONE_MARKS, _polyphonicsOrderPromise; loadPolyphonicsOrder, getCharAllReadings, isPolyphonic, renderPolyphonicChips, selectPolyphonicReading |
| js/cards.js | 3444-3683 | `let phone = window.innerWidth <= 440` (LT), MzoomScale, MzoomBaseRatio; createCharCard, reorderTimer, REORDER_DELAY, pendingChanges, scheduleReorder, handleBadgeClick, toggleSelection, batchMark, updateBatchCount |
| js/lyrics.js | 3684-3947 | toggleRecentPanel, hashtag fns, toggleLeftPanel, saveLyrics, section fns, drag fns, toggle*Section, exportSession, importSession, add/remove/renderLyricsSections |
| js/wordlist.js | 3948-4201 | _idbOpen, _idbGet, _idbPut, _wlCacheToastShown, _wlCacheWriteFailed, updateWordlistProgress, loadWordlist, applyWordlistOverrides, filterWordsByRhyme, getWordlistCandidates, filterWordsByInitial, getWordlistCandidatesInitial |
| js/panels.js | 4202-4306 | resetSuggestedPool, toggleRightPanel, syncCenterPanel, mobileTab, saveWord, removeSavedWord, renderSavedWords |
| js/rhyme-display.js | 4307-4462 | updateAIRhymeDisplay, renderRhymeDisplay, setRhymeMode, reportMissingChar |
| js/ai-client.js | 4463-4553 | WORKER_URL, AUTO_MODEL, LLM_MODELS, saveApiKey (dead, leave), renderModelSelect, onModelChange, loadModels, aiTryList, AI_FALLBACK_MSG, aiError, callLLM |
| js/candidates.js | 4554-4898 | updateModeButtonLabels, toggleFilter, cycleFilterWordLen, _wordLenPass, *Single filters, getPinyinPoolFor*, filterWordsBySelectedChars, getWordlistCandidatesSelected, clearSelectedChars, updateSelectedCharsHint, validateWordRhyme, fmtPhonetic, getCharReadingsFormatted, getWordPhoneticDisplay |
| js/ai-generate.js | 4899-5263 | generateAIWords, generateAISuggestions, LT: `document.addEventListener('mouseup', ...)`, generateContextFromLyrics |
| js/ui-common.js | 5264-5372 | copyWord, fallbackCopy, cycleInputMode, showToast; LT: IIFE "初始化三個面板狀態" (reads lhGet, calls syncCenterPanel, renderLyricsSections, renderHashtags, renderSavedWords, renderModelSelect, loadModels) |
| js/results.js | 5373-5649 | displayResults |
| js/search-ui.js | 5650-5747 | `const searchInputEl` (LT DOM), toggleSettings, closeSettingsOverlay, zoomIn/Out, toggleAbout/closeAbout, _getSearchSingleChar, _handleSearch, 3 input listeners, _refreshFromCurrentInput, 4 change listeners, `.mode-button` click wiring |
| js/theme.js | 5748-5914 | themeToggle, THEME_KEY, isDark, invertColor, applyTheme, savedTheme (LT `applyTheme(...)`), zoomSlider/zoomValue/zoomTarget/resultsSection, loadColors, applyColors, resetColors, handleColorChange, 8 color-input listeners |
| js/init.js | 5915-5943 | LT only: `rhymeDict = window._rhymeDictData || {}; loadDictOverrides(); buildIndex(); window.__hoyunReady = ...; if (!!phone) ...; loadColors(); window.__hoyunWordlistReady = loadWordlist();` |
| js/report.js | 5944-6176 | _ctxWord, _ctxMenu, _polyCtx*, context-menu fns, `_CTX_MENU_*`, charSuggestReading, long-press listeners, polyChipReport, postFeedback, openFeedbackModal, closeFeedbackModal, submitFeedback |
| js/ai-word-events.js | 6177-6250 | _phoneticTimer, _phoneticTooltip, _aiWordsCt, _longPress*, 7 listeners on `_aiWordsCt` |

(The trial used boundaries off by one blank/comment line at two places (dict 2686, ai-generate 4900); use the starts in this table. Both variants are behavior-identical.)

### Pattern 1: Top-first incremental extraction (keeps a single inline remainder)
**What:** Each move commit takes the first remaining slice off the top of the inline script, writes it to `js/x.js` verbatim (`sed -n 'a,bp'`, no reformatting), and inserts `<script src="js/x.js?v=N"></script>` immediately before the remaining inline `<script>`. The inline script is therefore always one contiguous tail and the reassembly check is exact at every step.
**When to use:** Every move commit. CSS first (same pattern: `<link>` replaces the head of the `<style>` body).
**Example:**
```html
<!-- state after moving the first 2 chunks -->
<script src="js/phonetic-tables.js?v=0.96.4"></script>
<script src="js/dict.js?v=0.96.4"></script>
<script>
        // ==================== 注音優先核心函數 ====================   <- remaining inline tail, unchanged text
```

### Pattern 2: Node `vm` core loader (zero edits to moved code)
**What:** One shared context; stubs for the 5 safety.js helpers that the core files call at load or call time; `ctx.window = ctx` because `data/rhyme-dict.js` does `var _rhymeDictData = ...` and code reads `window._rhymeDictData`.
**Example** (this exact file passed 3/3 in the trial, including browser parity):
```javascript
// tests/core-node.spec.mjs  (Node-only; the parity test also uses the browser)
import { test, expect } from '@playwright/test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { bootPage } from './helpers.mjs';

const CORE = ['js/phonetic-tables.js', 'js/dict.js', 'js/search.js', 'js/state.js', 'js/polyphonic.js', 'js/wordlist.js', 'js/candidates.js'];

function loadCore() {
    const ctx = vm.createContext({
        console,
        lhGet: () => null,                       // safety.js needs DOM/storage; minimal stand-ins
        lhGetJSON: (_k, fallback) => fallback,
        lhSet() {}, lhRemove() {}, lhWarn() {},
    });
    ctx.window = ctx;
    const run = f => vm.runInContext(readFileSync(f, 'utf8'), ctx, { filename: f });
    run('data/rhyme-dict.js');
    CORE.forEach(run);
    vm.runInContext('Math.random = () => 0; rhymeDict = window._rhymeDictData; buildIndex();', ctx);
    return { ctx, ev: code => vm.runInContext(code, ctx) };
}

const INPUTS = ['ㄢ', 'ㄅ', 'an', 'uo', 'bi', '愛', '行', '安打', 'an ing', '* ㄢ', 'zzz', ''];
test('core：Node 與瀏覽器的 searchRhyme 結果一致', async ({ browser }) => {
    const { ev } = loadCore();
    const { context, page } = await bootPage(browser, {});
    try {
        for (const input of INPUTS) {
            const node = ev(`(() => { const r = searchRhyme(${JSON.stringify(input)}); return JSON.stringify({ r, t: searchedTerms }); })()`);
            const web = await page.evaluate(i => { const r = searchRhyme(i); return JSON.stringify({ r, t: searchedTerms }); }, input);
            expect(node, input).toBe(web);
        }
    } finally { await context.close(); }
});

test('core：詞庫篩選（stub wordlistData）', () => {
    const { ev } = loadCore();
    ev('wordlistData = ' + JSON.stringify(readFileSync('tests/fixtures/wordlist-stub.ndjson', 'utf8').trim().split('\n').map(l => JSON.parse(l))));
    const out = JSON.parse(JSON.stringify(ev("filterWordsByRhyme([{ rhyme: 'ㄧㄣ' }], 2, 1)")));  // 跨 realm：先 JSON 往返再比對
    expect(out.length).toBeGreaterThan(0);
});
```
Trial observations: `searchRhyme('ㄢ')` returned more than 300 rows in Node; `filterWordsByRhyme([{rhyme:'ㄧㄣ'}],2,1)` with the stub returned `["二心","正音","母音","宗親","定心","娘親","娛親","創新","勞心","滿心","漢音","一心"]`; pure-Node tests ran in about 25 ms each. Add assertions that make the pure-Node tests stand alone (known inputs, `getZhuyinRhyme`, `pinyinToZhuyin`, `zhuyinToPinyin`, `getCharMark`) so criterion 3 is covered without a browser; the parity test is an extra safety net.

### Anti-Patterns to Avoid
- **Reordering code to "group by responsibility" inside move commits:** breaks verbatim verification and the load-time analysis. `init.js` stays mid-order.
- **`defer`/`async` on the new tags:** changes timing relative to inline handlers and to each other (async has no order guarantee). Keep plain sync tags at the end of `<body>`.
- **Dedenting or reflowing moved code:** the verifier compares text exactly (modulo leading/trailing whitespace of the whole body).
- **Placing Node-only helpers under `js/`:** `smoke.spec.mjs` `sourceTexts()` and `scan-lib.mjs` `jsFiles()` walk `js/**/*.js`; a helper there gets scanned and shipped.
- **Mixing a bug fix into a move commit:** the verifier would fail by design.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Loading browser-global code in Node | A custom mini-DOM or export shims | `node:vm` `createContext` with 5 stubs | Core files have no load-time DOM; `let/const` sharing across `runInContext` calls matches browser global lexical scope |
| Proving a move is verbatim | Eyeballing `git diff` / `--color-moved` | `tests/verify-split.mjs` below (reassemble and compare to `git show BASE:index.html`) | Mechanical pass/fail, negative control verified |
| Static scan of new files | New scanner | Existing `tests/scan-lib.mjs` (`collectSources` already walks `js/**`) | Verified: scan specs pass on the split layout |
| Cache busting | Build-time hashing | One shared `?v=` literal on every tag + a tiny consistency test | No build step allowed |

**Key insight:** this phase is mostly a mechanical text move; the only logic worth writing is the verifier and the Node loader, both under 40 lines.

## Runtime State Inventory

Refactor/move phase, so all five categories answered explicitly.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | localStorage keys: 16 fixed keys + `apiKey_` prefix + meta keys, all registered in `js/safety.js` (unchanged). IndexedDB opened only via `lhIdbOpen` in `js/safety.js` (unchanged). No stored string embeds a file path or script name. | None. Covered by `storage.spec.mjs`, `save-failure.spec.mjs`, v0.96 fixture in smoke (all passed in trial). |
| Live service config | Cloudflare Worker URL/endpoints unchanged (`WORKER_URL` moves verbatim in `ai-client.js`); GitHub Pages serves whatever is on the branch, no config embeds file names. | None. |
| OS-registered state | None: no service worker (`grep serviceWorker index.html` empty; tests block service workers), no scheduled tasks reference these files. | None. |
| Secrets/env vars | None changed; admin key stays in the admin page. | None. |
| Build artifacts / caches | Browsers may hold the old `index.html` for up to 10 min (`cache-control: max-age=600`). Old HTML is self-contained (inline script), so it keeps working until it refreshes. `.gitignore` ignores `scripts/` and `.planning/` but NOT `css/` or `js/` (`git check-ignore css/base.css js/dict.js` -> exit 1, not ignored). | New files must be `git add`ed; verification script lives in `tests/`, not `scripts/`. |

## Load-Time Ordering and Hoisting Analysis (key question 1)

**Method:** acorn parse of the inline script, top-level declaration table (function vs let/const with line), per-function reference sets (locals subtracted, property names skipped), then for every top-level non-function statement (walking into IIFE bodies, skipping deferred callbacks) the transitive closure over function references; report anything in the closure declared on a later line than the statement. Over-approximate by design (any reference counts as a call).

**Result:** 121 load-time statements analysed, **0** reach a name declared later. Specifically for the two statements that execute app code at load:
- IIFE 5318-5371 reaches only syncCenterPanel, renderLyricsSections, renderHashtags, renderSavedWords, renderModelSelect, loadModels and their callees, all declared before line 5318, plus `LH_CORRUPT_KEYS`, `lhGet`, `lhRemove` from `js/safety.js`.
- Init block 5915-5942 reaches loadDictOverrides, buildIndex, applyRhymeDictOverrides, loadPolyphonicsOrder, loadColors, loadWordlist (+ callees), all declared before 5915. Async continuations (promise `.then`, IDB/fetch callbacks) can therefore also run between script executions without touching a not-yet-declared name.
- Everything else at load time only registers listeners (bodies deferred) or reads `document.getElementById(...)`, which exists because the scripts sit at the end of `<body>`.

[VERIFIED: ad-hoc acorn analysis this session; corroborated by trial run where all 231 tests' relevant 229 passed]

Top-level `var`: none. `'use strict'`, `document.currentScript`, `eval`, `new Function`, `import(`: none in `index.html` or `js/safety.js` (grep empty), so strictness and script-identity do not differ between files. Relative `fetch('data/...')` paths resolve against the document URL, not the script URL, so moving scripts into `js/` does not break them.

Semantics worth knowing (all neutral after an in-order split): function declarations hoist only within their own script; `let/const/class` live in the shared global lexical environment (visible to later scripts and to inline handlers, but are not `window` properties, same as today); a script that throws stops only itself, so a mid-chain failure now cascades into later `ReferenceError`s instead of silently halting the rest (tests assert zero `pageerror`, so any such error still fails loudly).

## Inline Handlers (key question 2)

All 61 distinct function names called from inline `on*=` attributes (static HTML plus template-literal handlers, 79 `onclick=` occurrences in `index.html`) resolve to top-level `function` declarations; the only non-matching call names are DOM methods (`getElementById`, `click`, `stopPropagation`, `preventDefault`, `blur`, `replace`, `if`) [VERIFIED: regex extraction vs declaration list this session]. Function declarations in classic scripts become `window` properties, so handlers resolve exactly as before. Runtime proof: `tests/smoke.spec.mjs` fires every handler signature (91) and its coverage gate (`sourceHandlerNames()`, which already reads `index.html` plus `js/**/*.js`) passed on the split layout.

## Key Question 3: Core logic in Node

- DOM-free at load: `phonetic-tables`, `dict`, `search`, `state`, `polyphonic`, `wordlist`, `candidates` contain no `document`/`window` use at load time. Call-time impurity is limited to `clearDictOverrides` (`alert`/`confirm`/`location.reload()`), `applyRhymeDictOverrides` and `loadWordlist` (`fetch`, IndexedDB), none of which tests call.
- `searchRhyme` reads/writes these globals (found by free-variable analysis): searchedTerms, lastSearchInput, suggestedPool, sentCandidatesSet, cumulativeCandidates, _aiExtraRoundDone, inputMode, lastSearchType, charInfo, chineseDict, _polyphonic, plus tables. They are declared in `state.js` (3292-3329) and `polyphonic.js` (3333), so those two files must be in the Node load list. Tests set mode with `ev("inputMode = 'zhuyin'")`.
- Word filtering (`filterWordsByRhyme`, `filterWordsByInitial`, `getWordlistCandidates*`, `filterWordsBy*Single`, `filterWordsBySelectedChars`, `validateWordRhyme`, `_wordLenPass`) is also DOM-free: it reads `wordlistData`, `savedWords`, `sentCandidatesSet`, `currentRhymes`, `rhymeMode`, `filter*` flags, `charInfo`, `selectedChars`. Tests assign `wordlistData` an array of `{w, z, p}` (shape from `tests/fixtures/wordlist-stub.ndjson`: `{"w":"一心","z":"ㄧˋ ㄒㄧㄣ","p":12759}`). `filterWordsByRhyme` shuffles with `Math.random`, so tests set `Math.random = () => 0` for determinism (the loader above does).
- `displayResults` (5374-5648) reads 4 DOM elements, filters (hideRare, dedupe), and builds grouping + HTML strings in one pass per mode (`common` / `initial` / `tone`) calling `createCharCard`, which uses `document`. The grouping is not separable without rewriting, which would break the "pure move" rule. Recommendation: Node tests cover `searchRhyme` + phonetic helpers + word filtering; display grouping stays covered by the 41x3 browser golden snapshots. If a later phase wants a pure grouping helper, extract it then in a non-move commit with golden as the guard.
- Gotchas: values returned from `vm` are cross-realm (arrays fail `toEqual` against host arrays), so round-trip through `JSON.stringify/parse`; `buildIndex()` prints `[buildIndex] 13157 字, 1318 組` via `console`, pass a silent console in the loader if the noise is unwanted.

## CSS (key question 4)

- Single `<style>` at 14-2176 (the only one in `index.html`; `grep '<style'` hits only line 14). No `document.styleSheets`, `getComputedStyle` reliance on rule order, `insertRule`, or `adoptedStyleSheets` in `index.html`. `js/safety.js` injects `<style id="lhSafetyStyle">` into `<head>` at runtime (lines 115-132); leave it. It is appended after the `<link>`s, so it wins ties exactly as it does after the inline style today.
- `@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@300;400;500;700&family=JetBrains+Mono:wght@400;500&display=swap');` is the first line of the style body (line 15). It must stay the first rule of the first sheet (`css/base.css`); `@import` after any rule is ignored. Tests mock `fonts.googleapis.com` at the network level, which also covers an `@import` inside a linked sheet (trial passed with no off-origin failures).
- Three `@media` blocks (900px at 1547 and 1710, 440px at 1895) are late overrides interleaved with plain rules. Keep contiguous ranges and keep `<link>` order = file order. Cut points 743, 1546 were verified at brace depth 0 (all candidate section starts were depth 0; final depth 0).
- FOUC: `<link rel="stylesheet">` in `<head>` is render-blocking and scripts after it wait for pending stylesheets, so no flash and no behavior change. The `data/*.js` and `safety.js` tags come after the `<link>`s.
- Do not touch the `<meta>`/manifest/`apple-touch-icon` tags in `<head>`.

## Mechanical "Pure Move" Verification (key question 5)

Put the script at `tests/verify-split.mjs` (`.gitignore` contains `scripts/`, so a file there would be silently untracked: `git check-ignore -v scripts/verify-split.mjs` -> `.gitignore:14:scripts/`). Playwright `testDir` is `tests`, but only `*.spec`/`*.test` files are collected, so this file is not run by `npm test`. It is intentionally not a permanent test, because later phases legitimately edit the moved code.

Recorded `BASE` = the commit immediately before the first move commit (currently `2f2d248841f210860cefb3278db85b90b42094cc`, `git status` clean apart from untracked `.claude/CLAUDE.md`, `.gsd/`).

```javascript
// tests/verify-split.mjs  — 用法：node tests/verify-split.mjs <基準 commit>
// 把拆出的檔按 index.html 的標籤順序接回去，必須與基準 commit 的 inline <script>／<style> 本文逐字相同
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const base = execFileSync('git', ['show', `${process.argv[2]}:index.html`], { encoding: 'utf8', maxBuffer: 1 << 26 });
const now = readFileSync('index.html', 'utf8');
const INLINE = tag => `<${tag}(?![^>]*\\bsrc=)[^>]*>([\\s\\S]*?)</${tag}>`;
const baseBody = tag => new RegExp(INLINE(tag)).exec(base)[1];

// 依出現順序：外部檔（js/ 或 css/，safety.js 不算）貼檔案內容，沒搬完的 inline 貼本文
function assemble(srcPattern, tag) {
    let out = '';
    for (const m of now.matchAll(new RegExp(`${srcPattern}|${INLINE(tag)}`, 'g'))) {
        out += m[1] !== undefined && m[2] === undefined ? readFileSync(m[1], 'utf8') : (m[2] ?? '');
    }
    return out;
}
const js = assemble('<script src="(js/(?!safety\\.js)[^"?]+)(?:\\?[^"]*)?"></script>', 'script');
const css = assemble('<link rel="stylesheet" href="(css/[^"?]+)(?:\\?[^"]*)?">', 'style');
let bad = 0;
for (const [name, got, want] of [['script', js, baseBody('script')], ['style', css, baseBody('style')]]) {
    const same = got.trim() === want.trim();   // 只忽略標籤前後的空白行
    if (!same) bad++;
    console.log(`${same ? 'OK  ' : 'FAIL'} ${name}: ${got.length} vs ${want.length} chars`);
}
process.exit(bad ? 1 : 0);
```

Evidence: on the 20+3 file trial it printed `OK script: 176724 vs 176729 chars` and `OK style: 66766 vs 66771 chars` (the 5-char gap is the tag-adjacent whitespace that `trim()` ignores); a one-character tamper in `js/search.js` produced `FAIL script` and exit 1. Run unmodified against the current un-split repo with `2f2d248` it prints OK/OK, so the same command is valid at every intermediate commit (inline remainder + moved files reassemble to the base). Limitations: it proves text identity and order, not that a boundary does not cut a statement (the test suite covers that), and it only works while extraction is top-first.

Per-commit mechanical rule for "moves only": `git show --name-only --format= HEAD` must list only `index.html`, `js/*.js`, `css/*.css` (and `tests/verify-split.mjs` / new specs in test commits). A commit that changes anything else is not a move commit.

## Cache-Busting `?v=` Strategy (key question 6)

- GitHub Pages sends `cache-control: max-age=600` on every asset including `index.html` and `data/rhyme-dict.js` [VERIFIED: `curl -sI https://andy-coin.github.io/Lucky-Hawaii/` and `.../data/rhyme-dict.js` this session: `cache-control: max-age=600`, `expires` = now + 10 min, plus `etag` and `last-modified`]. Not configurable (no custom headers on Pages) [CITED: community reports found via web search, e.g. github.com/efficience-it/website/issues/868 and mrmarble.dev/blog/caching-github-pages].
- Currently only `js/safety.js?v=0.96.3` is versioned (`index.html:2179`: `<script src="js/safety.js?v=0.96.3"></script>`); `data/*.js` are unversioned (leave).
- Recommendation: one shared version string on every new `<link>`/`<script src>` and on `safety.js`, bumped together on each deploy (manual find-and-replace; no build step). Suggested value for the split release: `0.96.4`. A query string changes the cache key, so a refreshed HTML always requests fresh files; a stale HTML (up to 10 min) keeps referencing the previous URLs. Per-file versions add no safety because the stale-HTML window is identical, and they invite partial bumps.
- Residual risk (unchanged by the split, and strictly smaller than today's): during the 10 min window a client with a cached new HTML could mix cached-old and fresh files only if the version string was not bumped on a later deploy; so always bump on every deploy that touches css/js. Add one cheap test, `tests/split-tags.spec.mjs` (Node-only): every `<script src="js/...">`/`<link ... css/...>` in `index.html` has the same `?v=` value; every file in `js/` and `css/` is referenced exactly once; `js/safety.js` is the first `js/` script. About 15 lines, no browser.
- Do not add a service worker (PITFALLS Pitfall 17 says the same).

## scan-lib.mjs Coverage (key question 7)

- `collectSources()` reads each root `*.html` inline `<script>` (regex excludes tags with `src=`) plus every `js/**/*.js` [VERIFIED: tests/scan-lib.mjs:28-38]. After the split `index.html` has no inline script, and all 21 files under `js/` (including the 20 new ones) are scanned for registry keys and swallowed catches. `expect(sources.length).toBeGreaterThan(0)` stays satisfied.
- Exemption is by file name: `const SAFETY_FILE = 'js/safety.js';` (tests/scan.spec.mjs:6), unchanged. Direct `localStorage` use is still forbidden everywhere else.
- Dynamic-key allowance is by function name: `const DYNAMIC_KEY_FUNCS = { handleColorChange: ... }` (tests/scan.spec.mjs:8). `handleColorChange` moves verbatim into `js/theme.js` and keeps its name, so no change.
- **Per-file const resolution constraint:** `topLevelStringConsts(ast)` is built per source file (scan-lib.mjs:93-104; used in scan.spec.mjs:21). Current storage calls with identifier keys: `lhSet(THEME_KEY` (index.html:5770, inside `applyTheme`) and `lhGet(THEME_KEY)` (5774); `THEME_KEY` is defined at 5750 (`const THEME_KEY = 'hoyun_theme_mode';`). All three are inside one chunk (`theme.js`, 5748-5914). Any chunk boundary that separated them would make the scan report "無法解析的鍵". Template-literal key `apiKey_${...}` at 4471 (inside `saveApiKey`) is matched by prefix, not const.
- No test or fixture hard-codes `index.html:<line>` locations: grep of `tests/*.mjs` for `index.html` shows only helper navigation (`page.goto('/index.html')`), fixtures comments and smoke's `sourceTexts()`. Reported `file:line` strings will simply point into `js/*.js`.
- No exemption updates needed [VERIFIED: trial run, `scan.spec.mjs` all green on the split layout].

## Readiness Hooks (key question 8)

`tests/helpers.mjs:102` awaits `Promise.all([window.__hoyunReady, window.__hoyunWordlistReady, window.__hoyunSafetyReady, window.__hoyunModelsReady])` after `page.goto('/index.html')` (which waits for `load`). Where each is assigned after the split: `__hoyunSafetyReady` in `js/safety.js` (line 438, unchanged); `__hoyunModelsReady` in the IIFE at the end of `js/ui-common.js`; `__hoyunReady` and `__hoyunWordlistReady` in `js/init.js`. Parser-blocking scripts all finish before `load`, so all four are defined when evaluated. [VERIFIED: trial run, every spec that boots a page passed.]

## Common Pitfalls

### Pitfall 1: Reordering "for tidiness"
**What goes wrong:** Moving `init.js` last, or grouping `report.js` before it, changes listener registration order and where async continuations can run.
**Why it happens:** The init block sits at 5915-5942 in the middle of the file, which looks wrong.
**How to avoid:** Keep original order in this phase; the analysis above only proves safety for the original order. Relocating init is a future non-move commit guarded by golden/smoke.
**Warning signs:** `verify-split.mjs` FAIL, or `ReferenceError` in smoke.

### Pitfall 2: Splitting THEME_KEY from its users
**What goes wrong:** `scan.spec.mjs` registry test fails with 無法解析的鍵.
**How to avoid:** keep 5748-5914 in one file; for any future split, put the const with its `lhGet/lhSet` calls.

### Pitfall 3: `scripts/` is gitignored
**What goes wrong:** the verifier or new helpers silently never get committed.
**How to avoid:** put them in `tests/`; run `git status` after `git add`.

### Pitfall 4: `@import` no longer first
**What goes wrong:** Google Fonts stop loading with no error.
**How to avoid:** `css/base.css` line 1 is the `@import` line; do not add a header comment above it that precedes it with rules (comments are fine, rules are not).

### Pitfall 5: Mixed-version assets after deploy
**What goes wrong:** stale HTML or partially cached files for up to 10 minutes.
**How to avoid:** single shared `?v=` bumped on every deploy; consistency test.

### Pitfall 6: A throw in one file no longer stops later files
**What goes wrong:** one failing file produces a cascade of secondary `ReferenceError`s that hides the root cause in logs.
**How to avoid:** read the first `pageerror` in test output; keep `collectErrors` assertions.

### Pitfall 7: Move and fix in one commit
**How to avoid:** the only non-move edits allowed in a move commit are the `<script>`/`<link>` tags in `index.html`. Version-string bump of `safety.js` (`0.96.3` to the shared value) goes in the first extraction commit or its own tiny commit; it changes no code. Real bug fixes (if the split exposes one) get their own `fix(03):` commit.

## Code Examples

### Final index.html script section (illustrative; tags in this order, all with the shared version)
```html
<!-- head -->
<link rel="stylesheet" href="css/base.css?v=0.96.4">
<link rel="stylesheet" href="css/panels.css?v=0.96.4">
<link rel="stylesheet" href="css/responsive.css?v=0.96.4">
<script src="data/rhyme-dict.js"></script>
<script src="data/polyphonic-order.js"></script>
<script src="js/safety.js?v=0.96.4"></script>
<!-- end of body, after the last </div> -->
<script src="js/phonetic-tables.js?v=0.96.4"></script>
<script src="js/dict.js?v=0.96.4"></script>
<script src="js/search.js?v=0.96.4"></script>
<script src="js/state.js?v=0.96.4"></script>
<script src="js/polyphonic.js?v=0.96.4"></script>
<script src="js/cards.js?v=0.96.4"></script>
<script src="js/lyrics.js?v=0.96.4"></script>
<script src="js/wordlist.js?v=0.96.4"></script>
<script src="js/panels.js?v=0.96.4"></script>
<script src="js/rhyme-display.js?v=0.96.4"></script>
<script src="js/ai-client.js?v=0.96.4"></script>
<script src="js/candidates.js?v=0.96.4"></script>
<script src="js/ai-generate.js?v=0.96.4"></script>
<script src="js/ui-common.js?v=0.96.4"></script>
<script src="js/results.js?v=0.96.4"></script>
<script src="js/search-ui.js?v=0.96.4"></script>
<script src="js/theme.js?v=0.96.4"></script>
<script src="js/init.js?v=0.96.4"></script>
<script src="js/report.js?v=0.96.4"></script>
<script src="js/ai-word-events.js?v=0.96.4"></script>
```
Trial `index.html` ended at 352 lines (was 6253).

### Slicing one chunk verbatim
```bash
sed -n '2687,2883p' index.html > js/dict.js     # then delete exactly those lines from the inline script and add the <script src> tag above the remaining inline tail
```

## Trial Result (empirical evidence)

Procedure (outside the working tree, scratch dir; repo untouched): `rsync` a copy excluding `node_modules`/`.git`/`.planning`, symlink `node_modules`, run a generator that slices the line ranges above, rewrote `index.html`, then `LH_TEST_PORT=4377 npx playwright test`.

| Check | Result |
|-------|--------|
| `npx playwright test` on the split copy | **229 passed, 2 failed (1.0 min)**. The 2 failures are `tests/worker-config.spec.mjs:38` and `:53`, which run `git status` / `git ...` and failed with `fatal: not a git repository` because the scratch copy has no `.git`. They are unrelated to the split; re-run in the real repo before concluding. |
| Golden 41 cases x 3 modes, `golden 檔案清單與案例一致` | passed with the existing 41 snapshot files, no regeneration |
| Smoke (91 handlers, coverage gate, import tests) | passed, no test edits |
| `scan.spec.mjs` registry + catch scans over `js/**` | passed |
| `storage.spec.mjs`, `save-failure.spec.mjs`, `error-visibility.spec.mjs`, `ai-client.spec.mjs` | passed |
| `tests/core-node.spec.mjs` (code above) | 3 passed; Node vs browser `searchRhyme` + `searchedTerms` identical for 12 inputs |
| `verify-split.mjs` positive / negative control | OK / FAIL as described |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| One 6253-line inline script | 20 classic script files + 3 CSS files | This phase | Smaller diffs and merge surface for Phases 4-8 |
| ES modules (ARCHITECTURE.md strangler) | Classic scripts (CONTEXT lock) | decided in 03-CONTEXT | 79 inline handlers keep working; module conversion deferred |

**Deprecated/outdated:** `ARCHITECTURE.md` "S5: leave stable regions in legacy.js" and the `boot.js`/module strangler layout are superseded by the CONTEXT decision (everything moves, classic scripts). `.claude/CLAUDE.md` architecture section (line ranges inside `index.html`) will be stale after the split; refresh it when convenient (not a phase gate).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 21 sequential parser-blocking script requests are acceptable on slow mobile networks (GitHub Pages serves HTTP/2); not measured on a real device | Standard Stack | Slightly slower first paint on poor networks; mitigation is merging small files (e.g. fold `init.js` + `report.js`), but that only changes tags/file boundaries |
| A2 | `0.96.4` is the right shared version value for the split deploy | Cache Strategy | Cosmetic; any value different from `0.96.3` busts the cache |
| A3 | Grouping move commits into 4-5 batches (rather than one commit per file) satisfies "one block at a time, golden after each" | Commit plan | If Andy wants strictly one file per commit, the plan just has ~21 commits at ~70 s of tests each |
| A4 | The 2 `worker-config` failures in the scratch copy are purely due to missing `.git`, not the split (their code runs `git status --porcelain -- worker package.json package-lock.json`); not re-run in the real repo | Trial Result | If they fail in the real repo after the first move commit, investigate; they do not touch `index.html` |

## Open Questions

1. **Should `displayResults` grouping be extracted for Node testing now?**
   - What we know: grouping and HTML building are interleaved; `createCharCard` uses `document`.
   - What's unclear: whether Andy wants display-grouping unit tests in this phase.
   - Recommendation: no; criterion 3 says "core rhyme search/filter logic", which `searchRhyme` + word filtering satisfy. Golden covers display.
2. **One file vs several for CSS?** Recommended 3 contiguous files; if the planner prefers minimum risk, `css/style.css` (one file, lines 15-2175) is equally valid and trivially verifiable.
3. **Move `init.js` last in a later phase?** Out of scope; analysis shows it is safe where it is.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | `vm` loader, verifier, tests | yes | v26.8.1 | none needed |
| Playwright + Chromium | golden/smoke/parity | yes | 1.63.0 | none needed |
| git | verifier (`git show`), commit discipline | yes | repo on branch `gsd/v0.96-stabilize` | none needed |
| curl / network | cache-header check (research only) | yes | — | not needed for execution |

**Missing dependencies with no fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `@playwright/test` 1.63.0 (browser specs and Node-only specs share the runner) |
| Config file | `playwright.config.mjs` (`testDir: 'tests'`, `fullyParallel: true`, web server `node tests/serve.mjs` on `LH_TEST_PORT`||4310, no-store cache headers) |
| Quick run command | `npx playwright test tests/golden.spec.mjs tests/smoke.spec.mjs tests/scan.spec.mjs` |
| Full suite command | `npm test` (231 tests, about 70 s) |

### Phase Requirements to Test Map
| Req ID / Criterion | Behavior | Test Type | Automated Command | File Exists? |
|--------------------|----------|-----------|-------------------|-------------|
| FND-04 / SC1 | `index.html` is skeleton only (no inline script/style bodies); app works over HTTP with no build | static + e2e | `node tests/verify-split.mjs <BASE>` (reassembly OK) and `npx playwright test tests/split-tags.spec.mjs` (tags consistent, no inline `<script>`/`<style>` with bodies, all files referenced) and the whole suite runs through `tests/serve.mjs` (plain HTTP, no build) | verify-split: Wave 0 / split-tags: Wave 0 |
| FND-04 / SC2 | Search results and every button behave identically | golden + smoke | `npx playwright test tests/golden.spec.mjs tests/smoke.spec.mjs` then `npm test` | yes |
| FND-04 / SC3 | Core search/filter logic loads and runs in Node without a browser | Node-only | `npx playwright test tests/core-node.spec.mjs -g "Node 可跑\|詞庫篩選"` (pure Node assertions) plus parity test for the browser comparison | Wave 0 |
| FND-04 / SC4a | Old saved lyrics/overrides/settings still readable | storage + smoke fixture | `npx playwright test tests/storage.spec.mjs tests/save-failure.spec.mjs tests/smoke.spec.mjs` | yes |
| FND-04 / SC4b | Moves and fixes are separate commits | git inspection | `node tests/verify-split.mjs <BASE>` after every move commit; `git show --name-only --format= <sha>` lists only index.html/js/css for move commits | Wave 0 (script) |
| Scan coverage of new files | Registry + catch scans cover `js/**` | static | `npx playwright test tests/scan.spec.mjs` | yes |

### Sampling Rate
- **Per task commit:** `node tests/verify-split.mjs <BASE>` plus quick run (golden, smoke, scan) about 40 s.
- **Per wave merge / each move commit (CONTEXT requires):** `npm test` (about 70 s).
- **Phase gate:** full suite green, `verify-split.mjs` OK, `git status` clean, before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `tests/verify-split.mjs`: mechanical verbatim check (code above); commit as a `test(03)` commit before any move.
- [ ] `tests/split-tags.spec.mjs`: shared-`?v=` consistency, every `js/`/`css/` file referenced once, `safety.js` first, no inline script/style bodies (last assertion only after the final move commit).
- [ ] `tests/core-node.spec.mjs`: add after the core files exist as files (it needs `js/*.js`, so it lands in the commit right after the first core move group); add pure-Node assertions for `getZhuyinRhyme('ㄅㄢ') === 'ㄢ'`, `pinyinToZhuyin`, `zhuyinToPinyin`, `getCharMark`, and a `searchRhyme('ㄢ')` count/shape check.
- [ ] Framework install: none.

## Suggested Commit Sequence (for the planner)

1. `test(03)`: `tests/verify-split.mjs`, `tests/split-tags.spec.mjs` (tag assertions that only apply once files exist can be written to tolerate the current state, or the inline-script assertion added at the end).
2. `refactor(03)`: move CSS (3 files), tags in `<head>`. verify + `npm test`.
3. `refactor(03)`: move core group 1: `phonetic-tables`, `dict`, `search`, `state`, `polyphonic` (+ tag version bump). verify + `npm test`.
4. `test(03)`: `tests/core-node.spec.mjs` (needs wordlist/candidates too, so either add after group 3 or load only the 5 available files first and extend).
5. `refactor(03)`: group 2: `cards`, `lyrics`, `wordlist`, `panels`, `rhyme-display`; then `candidates` so the Node spec covers word filtering.
6. `refactor(03)`: group 3: `ai-client`, `ai-generate`, `ui-common`, `results`, `search-ui`.
7. `refactor(03)`: group 4: `theme`, `init`, `report`, `ai-word-events` (inline script now empty; remove empty `<script></script>`).
8. Final: `npm test`, `verify-split.mjs`, `split-tags.spec.mjs`, update `handoff.md`.
Any bug found is a separate `fix(03)` commit placed outside these.

## Security Domain

Applies (security_enforcement enabled, ASVS level 1). This phase adds no input handling, auth, crypto or network surface; it relocates same-origin static assets.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | admin key handling unchanged (excluded keys in `js/safety.js`) |
| V3 Session Management | no | none |
| V4 Access Control | no | none |
| V5 Input Validation | no (unchanged) | existing code moved verbatim; `safety.js` validators untouched |
| V6 Cryptography | no | none |
| V14 Configuration | yes | only same-origin `<script src>`/`<link>`; no new third-party origins (Google Fonts import unchanged); `tests/verify-split.mjs` calls `git` via `execFileSync` with an argv array (no shell), and the commit arg is developer-supplied |

### Known Threat Patterns for static classic-script site

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Stale or mixed-version assets after deploy | Tampering (integrity of running code) | single shared `?v=`, bump per deploy, consistency test |
| Script-injection via new third-party script | Tampering / Elevation | none added; keep only same-origin tags; `serve.mjs` keeps binding 127.0.0.1 and the path-traversal check |
| Safety layer bypass if load order changes | Tampering (data loss) | `js/safety.js` stays first and registry/direct-access scans cover every new file |

## Sources

### Primary (HIGH confidence)
- Repo files read this session: `.planning/phases/03-split-index-html/03-CONTEXT.md`, `index.html` (structure, lines 2177-2179, 2491-3340, 5195-5976, 6240-6253, CSS section map), `js/safety.js`, `tests/helpers.mjs`, `tests/scan-lib.mjs`, `tests/scan.spec.mjs`, `tests/serve.mjs`, `tests/golden.spec.mjs`, `tests/smoke.spec.mjs`, `playwright.config.mjs`, `package.json`, `.gitignore`, `.planning/research/ARCHITECTURE.md` and `PITFALLS.md` (split sections), Phase 1/2 summaries.
- Trial split run in a scratch copy and `npx playwright test` output (this session).
- Live headers: `curl -sI https://andy-coin.github.io/Lucky-Hawaii/` and `.../data/rhyme-dict.js` (`cache-control: max-age=600`).

### Secondary (MEDIUM confidence)
- Web search (GitHub Pages `max-age=600` not configurable; query-string cache busting is the common workaround): github.com/efficience-it/website/issues/868, mrmarble.dev/blog/caching-github-pages, github.com/Tamach1Q/aphasia-bidirectional/pull/7.

### Tertiary (LOW confidence)
- Performance of 21 script requests on slow mobile networks (A1): not measured.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, no new packages; classic scripts proven by trial.
- Architecture (chunk manifest, load order): HIGH, boundary validity checked by AST and by the passing suite.
- Pitfalls: HIGH for scanner/ignore/@import/order items (each observed or read in source); MEDIUM for deploy-skew behavior (headers verified, real stale-cache behavior inferred).

**Research date:** 2026-10-04
**Valid until:** 2026-11-03 for the analysis, but line numbers are only valid against base commit 2f2d248; recompute chunk starts if `index.html` changes before execution (the AST boundary check takes seconds).
