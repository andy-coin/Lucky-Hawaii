# Phase 9: Section Modules 段落模組 - Pattern Map

**Mapped:** 2026-10-23
**Files analyzed:** 15 (4 new JS, 1 new test lib, 10 modified)
**Analogs found:** 15 / 15 (all analogs are git-tracked: verified with `git ls-files`)

規則提醒：不用 `innerHTML` 拼使用者字串、不拼 `onclick` 字串、不拼 selector（用迴圈比對 `dataset.id`）、`catch` 內必須呼叫函式（`lhWarn`）、不直接碰 `localStorage`、CSS 只用變數（8 個色票 hex 放 JS 常數）、hover 包在 `@media (hover: hover) and (pointer: fine)`、字重只用 400/700、不加 `@keyframes`／`transition`。

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `js/sections-core.js` (new) | utility (pure fns) | transform | `js/phonetic-tables.js` + `tests/node-core.mjs` 載入法；驗證式樣 `js/safety.js:589-609` | role-match |
| `js/undo.js` (new) | store (in-memory history) | event-driven | `js/songs.js` (`curSong/markDirty/flushSongs`、`_lhComposing`) | role-match |
| `js/sections.js` (new) | component + controller | event-driven (pointer, delegation) | `js/lyrics.js:272-306` (委派) + `js/layout.js:153` (`lhPlaceMenu`) | role-match |
| `js/word-drag.js` (new) | controller | event-driven (cross-panel pointer session) | `js/ai-word-events.js:10-20` (卡片事件 + `lhPlaceMenu`) | partial |
| `js/lyrics.js` (mod) | component | CRUD + render | self (`renderLyricsSections` L214-270, `syncFromField` L278-293, 事件 L295-306) | exact |
| `js/songs.js` (mod) | service/model | CRUD | self (`_normalizeSong` L96-120, `makeEmptySong`, `_applyExternalSongs`) | exact |
| `js/safety.js` (mod) | service (validation) | transform | self (`lhNormalizeSong` L598-609) | exact |
| `js/ui-common.js` (mod) | utility | request-response | self (`showToast` L51-63) | exact |
| `js/song-io.js` (mod, 預期不改) | service | file-I/O | self (`songExportSections` L5-11) | exact |
| `index.html` (mod) | config | static | 現有 30 個 `?v=` 標籤 + `.lyrics-head` | exact |
| `css/panels.css` (mod) | config (style) | static | `.section-label` L1052-1072、`.lyrics-section.dragging` L1073、`.word-ctx-menu` L616-630、`.copy-toast` L897-917 | exact |
| `css/responsive.css` (mod) | config (style) | static | L69 `.section-label`、L705 `kb-open .copy-toast`、L737 16px 清單、L783 reduced-motion | exact |
| `tests/node-core.mjs` + `tests/core-node.spec.mjs` (mod) | test | transform | self (`CORE` 清單 + `pick/loadCore`) | exact |
| `tests/split-tags.spec.mjs` (mod) | test | static scan | self (`JS_ORDER` L8-11, L63「完整 22 個」) | exact |
| `tests/sections-*.spec.mjs`, `tests/drag-lib.mjs` (new) | test | event-driven | `tests/songs-ime.spec.mjs` (`bootPage`, MutationObserver, fixture) | role-match |

## Pattern Assignments

### `js/sections-core.js` (utility, transform)

**Analog:** 無相同檔案；形式取自 `tests/node-core.mjs` 能載入的「純函式、不碰 document/localStorage」檔（`js/phonetic-tables.js`）。內容骨架直接用 09-RESEARCH.md Pattern 1（已在 Node 實測：`LH_SEC_TYPES`、`lhInferSecType`、`lhSecFields`、`lhToRoman`、`lhSecNames`、`lhSecFinalize`、`lhCountWords`）。

**Node 載入方式** (`tests/node-core.mjs:6, 11-27`)：
```js
export const CORE = ['js/phonetic-tables.js', 'js/dict.js', 'js/search.js', 'js/state.js', 'js/polyphonic.js', 'js/wordlist.js', 'js/candidates.js'];
export const pick = ev => code => JSON.parse(JSON.stringify(ev(code)));   // vm 跨 realm，先 JSON 往返
```
動作：把 `'js/sections-core.js'` 加進 `CORE`（或另開 `loadSections()`）。檔案頂層只能用 `const`/`function`，不可引用 `lhWarn` 以外的全域（loadCore 只提供 `lhGet/lhGetJSON/lhSet/lhRemove/lhWarn` 替身）。

**命名慣例** (CLAUDE.md)：camelCase、常數 UPPER_CASE（`LH_SEC_*`）、註解中文、4 空格縮排、單引號。用 `Set/Map` 查表，不用物件（防 `__proto__`）。

---

### `js/lyrics.js` (modify: render + delegation + remove old drag)

**Analog:** self。

**可保留的原子模式 — 結構建立用 createElement/textContent** (`js/lyrics.js:214-223, 259-268`)：
```js
function renderLyricsSections() {
    const container = document.getElementById('lyricsSections');
    const song = curSong();
    if (!container || !song) return;
    _lhComposing = false;   // 輸入框被換掉時不會收到 compositionend／focusout，旗標不能卡在 true
    container.replaceChildren(...song.sections.map((s, i) => {
        const el = document.createElement('div');
        el.className = 'lyrics-section' + (s.collapsed ? ' collapsed' : '');
        el.dataset.index = String(i);
        el.dataset.id = s.id;
        ...
        const ta = document.createElement('textarea');
        ta.className = 'section-textarea';
        ta.value = s.text;
```
動作：在函式開頭加 `lhSecAbortInteractions()`（Pitfall 7）；header 改成 `button.section-handle / span.section-chevron / button.section-type / span.section-count（預建 Text node）/ button.section-remove`，加 `data-type`、`--sec-color`、`--sec-h`（`style.setProperty`，值已驗證）、`.section-resize`。**刪除 L227-233 的全部 `setAttribute('on…')` 與 `draggable`**。

**要刪除的整組**：`onSectionHeaderClick` (L85-89)、`enableSectionLabel`/`disableSectionLabel` (L107-118)、`_dragSrcIdx` + `onSectionDrag*` (L120-153)、`removeLyricsSection` 的 `confirm` (L185-199)。

**事件委派（擴充，不是新建）** (`js/lyrics.js:295-306`)：
```js
['lyricsSections', 'contextDescription'].forEach(id => {
    const area = document.getElementById(id);
    area.addEventListener('compositionstart', () => { _lhComposing = true; clearTimeout(_saveTimer); });
    area.addEventListener('compositionend', e => { _lhComposing = false; syncFromField(e.target); flushSongs(); });
    area.addEventListener('input', e => {
        syncFromField(e.target);
        // Firefox 在 compositionend 之後還會送最後一個 input，所以兩個旗標都看
        if (!_lhComposing && !e.isComposing) scheduleSave();
    });
    area.addEventListener('focusout', () => { _lhComposing = false; flushSongs(); });
});
```
動作：`compositionend` 追加 `lhHistTyping(...)` 與字數更新；`input` 在 `!_lhComposing && !e.isComposing` 時才記 undo 與更新字數；`syncFromField` 刪掉 `section-label` 分支（L290，label 不再是輸入框）。新增 `click`/`contextmenu`/`pointerdown`/`keydown` 委派也掛在 `#lyricsSections`（不會被重畫）。

**toggle 不重畫（原地更新）範例** (`js/lyrics.js:91-105`)：用 `classList.toggle` + `markDirty` + `flushSongs`，無 `renderLyricsSections()`。排序、改名、改色同樣走這種原地更新。

**新增段落（改 B6 預設類型）** (`js/lyrics.js:171-183`)：
```js
const song = curSong(); if (!song) return;
song.sections.push({ id: lhNewId('sec-'), label: '新段落', text: '', collapsed: false });
markDirty(song.id); flushSongs(); renderLyricsSections();
```
改成經 `lhSecApply('add', …)`，欄位補 `type/custom/color/height`。

---

### `js/sections.js` (component/controller, event-driven)

**Analog:** `js/lyrics.js` 委派段 + `js/layout.js:153-169` (`lhPlaceMenu`) + `js/ai-word-events.js:10-20` (contextmenu 開選單)。

**右鍵選單放置模式** (`js/ai-word-events.js:10-20`, `js/layout.js:153-169`)：
```js
_aiWordsCt.addEventListener('contextmenu', e => {
    const card = e.target.closest('.ai-word-card');
    if (!card) return;
    e.preventDefault();
    ...
    lhPlaceMenu(_ctxMenu, e.clientX, e.clientY);
});
// lhPlaceMenu：先 left/top=0、加 .show、量尺寸、夾進 visualViewport、只寫 left/top 兩個 px 數字
```
動作：`#sectionMenu` 用同樣的 `.word-ctx-menu` 外殼（自己加 `.section-menu` 變體），`lhPlaceMenu(menu, x, y)`；觸控／鍵盤傳按鈕的 `left`、`bottom+4`。內容一律 `textContent`。注意：`ai-word-events.js` 的 `.innerHTML =`（L19）是舊寫法，**不要複製**。

**單一變更入口 `lhSecApply(kind, mutate, opts)`**（RESEARCH Architecture）：沿用 `curSong() → mutate → lhSecFinalize → markDirty(song.id) → lhHistCommit → flushSongs() → 原地更新或 renderLyricsSections()`。持久化三件套與 `js/lyrics.js:42-45` (`removeHashtag`) 同形：
```js
song.hashtags = ...; markDirty(song.id); flushSongs(); renderHashtags();
```

**IME 判斷（自訂名稱輸入框）**：複製 `js/songs.js:496` 與舊 label 寫法 `js/lyrics.js:247` 的 `event.isComposing || event.keyCode === 229` 判斷；`_lhComposing` 宣告在 `js/songs.js:18`。

**拖曳／拉桿 / 長按**：無既有 Pointer Events 實作可抄（舊的是 HTML5 DnD，將刪除）→ 用 RESEARCH Pattern 4 骨架（把手 `setPointerCapture`、`insertBefore` 搬節點、結尾 `handle.focus({preventScroll:true})`）。`try { setPointerCapture } catch (err) { lhWarn(...) }`。

---

### `js/undo.js` (store, event-driven)

**Analog:** `js/songs.js`（`curSong`、`markDirty`、`flushSongs`、`_applyExternalSongs` 約 L228、`_lhComposing` L18）。骨架用 RESEARCH Pattern 5（`_hists = new Map()`、`lhHistCommit`、`lhHistTyping`、快照 `sections.map(s => ({...s}))`）。

**注意**：
- 不得使用 localStorage（`tests/scan.spec.mjs` 規則）。
- undo 套回時對仍存在的 id 保留目前 `collapsed`、`height`（D2）。
- 清歷史掛鉤：`_applyExternalSongs` 之後 `_hists.clear()`；`confirmDeleteSong` 成功後 `_hists.delete(id)`。
- 鍵盤攔截：document capture `keydown` + `beforeinput(historyUndo/historyRedo)` 兩條都要，範圍限 `e.target.closest('#lyricsSections, .lyrics-tools')`。
- ↶ ↷ 用 `aria-disabled`（UI-SPEC D-10），不用 `disabled`；`mousedown`/`pointerdown` preventDefault。

---

### `js/word-drag.js` (controller, event-driven)

**Analog (partial):** `js/ai-word-events.js` 與 `js/report.js:125`（卡片事件、`.report-mode`、contextmenu 攔截）。無既有跨面板 pointer session。

**必須協調的既有行為**：
- 報告模式用捕獲階段攔 click：`ai-word-events.js:74`；`#aiWordsContainer.report-mode` 時不啟動拖曳。
- 卡片資料來源：AI 卡 `dataset.word`（`ai-generate.js:8`）、字卡 `dataset.char`（`cards.js:105`）。
- 起點排除 `.mark-badge`、`.poly-chip`、非主鍵。
- 觸控 contextmenu 在 `pending||dragging` 與剛結束 600ms 內 `preventDefault()+stopImmediatePropagation()`；滑鼠右鍵不攔。
- 手機分頁切換用 `mobileTab(tab)`（`js/panels.js:86-108`，同分頁再呼叫會收起，所以只在不同時才呼叫）、`lhIsSheetMode()`（`js/layout.js:53-54`）。
- 游標定位用 RESEARCH Pattern 8 (`lhMirror` + `lhCaretIndexAt`)；插入走 `lhSecApply('insert', …)`，組字中（`_lhComposing`）取消。

---

### `js/songs.js` (modify: normalize + new-song defaults)

**Analog:** self。**`_normalizeSong` 延遲正規化插入點** (`js/songs.js:106-120`)：
```js
s.sections = s.sections.filter(x => x && typeof x === 'object').map(x => {
    if (typeof x.id !== 'string' || !LH_ID_RE.test(x.id) || seen.has(x.id)) { x.id = lhNewId('sec-'); changed = true; }
    ...
    return x;
});
if (s.sections.length === 0) {
    s.sections.push({ id: lhNewId('sec-'), label: '', text: '', collapsed: false });
    changed = true;
}
return changed;
```
動作：在 `return` 前 `lhSecFinalize(s.sections)`；**不要**因此設 `changed = true`（讀取不寫入，RESEARCH Pattern 2）。空段落預設改 `{ type:'verse', label:'Verse', custom:'', color:'', height:null }`；`makeEmptySong`（約 L26-37）同。`_flushLegacy`（L61）不改。

---

### `js/safety.js` (modify: import whitelist)

**Analog:** self。**唯一關卡** (`js/safety.js:601-609`)：
```js
const sections = validSecs
    .slice(0, LH_IMPORT_CAPS.sections)
    .map(s => ({
        id: pickId(s.id, 'sec-', secIds),
        label: typeof s.label === 'string' ? _lhCut(s.label, LH_IMPORT_CAPS.label, stats) : '',
        text: typeof s.text === 'string' ? _lhCut(s.text, LH_IMPORT_CAPS.text, stats) : '',
        collapsed: !!s.collapsed
    }));
if (sections.length === 0) sections.push({ id: pickId(null, 'sec-', secIds), label: '', text: '', collapsed: false });
```
動作：`.map` 內以 `...lhSecFields(s)` 加入 type/custom/color/height，之後對 `sections` 跑 `lhSecFinalize`；空段落預設補新欄位。`LH_ID_RE`（L386）、`LH_IMPORT_CAPS`（L511）不動。`lhBuildBackup`（L677-693）不改。

---

### `js/ui-common.js` (modify: undo toast)

**Analog:** `showToast` (`js/ui-common.js:51-63`)：
```js
function showToast(msg, duration = 1800) {
    let toast = document.getElementById('copyToast');
    if (!toast) { toast = document.createElement('div'); toast.id = 'copyToast'; toast.className = 'copy-toast'; document.body.appendChild(toast); }
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), duration);
}
```
動作：新增 `showUndoToast(msg, actionLabel, onAction, ms)`，同樣的「找不到就建」+ `_timer` 模式，但 `.copy-toast` 是 `pointer-events:none`，所以加 `has-action` class 並讓按鈕 `pointer-events:auto`（UI-SPEC D-09）；訊息 `textContent`。`showToast` 須移除殘留按鈕（`replaceChildren` 會是 childList 變動，但 toast 不在 `#leftPanel` 內，不影響 IME 測試）。

---

### `css/panels.css` / `css/responsive.css` (style)

**Analog:** self。

- 替換 `.section-label`（`panels.css:1052-1072`，含 `:not([readonly])`）→ `.section-type` 按鈕樣式；`.lyrics-section.dragging`（L1073）保留，**刪** `.drag-over`（L1074，含硬編碼 `#8d51c9`）。
- 彈出選單外殼複製 `.word-ctx-menu` (`panels.css:616-630`)：`position:fixed; z-index:10000; max-height: calc(var(--app-h) - 1rem); overflow-y:auto; display:none` + `.show{display:block}`（`lhPlaceMenu` 只加 `.show` 與 left/top）。
- Toast 變體沿用 `.copy-toast`（`panels.css:897-917`，z 9999）；`responsive.css:705` 的 `html.kb-open .copy-toast { bottom: calc(var(--kb-inset) + 1rem); }` 要同樣套到 undo toast。
- `panels.css:1245` 的 `min-height: var(--hit)` 清單：把 `.section-label` 換成 `.section-type`；`responsive.css:69` 的 `.section-label { min-width:0; text-overflow:ellipsis }` 改為 `.section-type`。
- `responsive.css:737` 的 ≥16px 輸入框清單：移除 `.section-label`，加入 `.section-name-input`。
- `responsive.css:783` reduced-motion 區塊：不新增動畫（D-14），無需動。
- 色票 hex 絕不寫進 CSS（`tests/style.spec.mjs:199-227` 掃描）；新 class 名避開 `song|export|import|backup|danger|print-` 子字串（`tests/songs-audit.spec.mjs:376-389`）；`:hover` 一律包 `@media (hover: hover) and (pointer: fine)`。
- 高度 CSS 疊加用 `.lyrics-area .lyrics-section.has-h`（權重高於 `responsive.css:64` 的 `[data-index="0"]` 與 `.collapsed`）。

---

### `index.html` (modify)

- `?v=0.96.12` → `0.96.13`（30 個標籤，一次 `sed`）。
- 新 `<script>` 順序：`sections-core` 在 `state` 之後、`songs` 之前；`undo` 在 `songs` 之後；`sections` 在 `lyrics` 之後；`word-drag` 最後（`ai-word-events` 之後）。同步改 `tests/split-tags.spec.mjs` `JS_ORDER`（L8-11）與 L63 的「完整 22 個」文字／長度。
- `.lyrics-head > *` 必須維持 4 個子元素（`tests/songs-export.spec.mjs:328`、`tests/songs-ui.spec.mjs:495`）→ ↶ ↷ 與總字數放新增的 `.lyrics-tools` 列，不要塞進 `.lyrics-head`（與 UI-SPEC D-16 的 DOM 順序有出入，規劃時要選一邊並同步改這兩支測試；RESEARCH 建議新列）。
- `#lhLive`（visually-hidden aria-live）、`#sectionMenu`、`#secTypeHint` 靜態節點加在 body。

---

### `tests/*` (test)

**Analog:** `tests/songs-ime.spec.mjs`（`bootPage`、`FIXTURE`、`STORAGE_SPY`、MutationObserver 監看 `#leftPanel` childList 為 0）、`tests/core-node.spec.mjs`（Node 純函式：`pick(loadCore().ev)`）。

```js
import { test, expect } from '@playwright/test';
import { bootPage, compose, activeSongRaw, STORAGE_SPY } from './helpers.mjs';
const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/v096-localStorage.json', import.meta.url), 'utf8'));
const { context, page, errors } = await bootPage(browser, { storage: FIXTURE, init: STORAGE_SPY });
```
- 純函式（類型推斷、羅馬數字、字數、`lhSecFields` 壞值）→ `core-node.spec.mjs` 風格，不開瀏覽器。
- 觸控用 CDP `Input.dispatchTouchEvent`（RESEARCH Code Examples 的 `touchSession` → 新 `tests/drag-lib.mjs`）；合成 PointerEvent 測不了 capture。
- 計時（1 秒合併、400/500ms 長按、0.6 秒展開）用 `page.clock`。
- 需改的既有斷言：`songs-model`/`songs-ime`/`layout`/`songs-export`/`songs-journey`（`inputValue()` → `textContent`、雙擊改名、confirm、`[段落 1]` → `[Verse]`）；`visual.spec.mjs` lyrics 三張基準（darwin 重拍，linux 列待辦）。

---

## Shared Patterns

### 持久化入口（所有段落變動）
**Source:** `js/lyrics.js:42-45`、`js/lyrics.js:103-104`
```js
markDirty(song.id);
flushSongs();
```
**Apply to:** `sections.js`、`undo.js`（還原後）、`word-drag.js`（插入後）。絕不直接用 `localStorage`（只有 `safety.js` 的 `lhGet/lhSet` 可以）。

### 安全渲染（T-08-01）
**Source:** `js/lyrics.js:48`（註解）、`js/lyrics.js:62-72`
```js
const chip = document.createElement('span');
chip.className = 'hashtag-chip';
chip.append('#' + t);
x.addEventListener('click', () => removeHashtag(t));
```
**Apply to:** 所有新 DOM（選單、toast、ghost、live region）。`textContent`/`append`/`addEventListener`；`--sec-color`/`--sec-h` 只收驗證過的值並用 `style.setProperty`。

### IME / 組字守則
**Source:** `js/lyrics.js:298-305`、`js/songs.js:18`（`_lhComposing`）
**Apply to:** 打字記 undo、字數更新、Undo 快捷鍵、自訂名稱 Enter、詞插入。判斷三重：`_lhComposing || e.isComposing || e.keyCode === 229`。

### 原地更新而非整片重畫
**Source:** `js/lyrics.js:91-105` (`toggleLyricsSection`)；`tests/songs-ime.spec.mjs` MutationObserver 要求打字路徑 childList = 0
**Apply to:** 標籤循環、顏色、字數（只改 `Text.data`）、排序（`insertBefore`）、高度、↶↷ 狀態（只改屬性）。

### 選單放置與 Esc
**Source:** `js/layout.js:153-169` (`lhPlaceMenu`)；`js/panels.js:111-121`（Esc 收 sheet，`e.defaultPrevented` 時略過）
**Apply to:** `#sectionMenu`、拖曳取消：capture 階段 `preventDefault()+stopPropagation()`，組字中不處理。

### 錯誤處理
**Source:** CLAUDE.md Error Handling；`tests/scan-lib.mjs`（空 catch 掃描）
**Apply to:** 所有新 JS。`catch (err) { lhWarn('…', err); }` 非空；非關鍵操作靜默失敗；使用者可見才用 `showToast()`。

### 載入順序與版號
**Source:** `tests/split-tags.spec.mjs:8-11, 27-31, 63`
**Apply to:** `index.html` 與 `JS_ORDER` 同步；所有標籤同一個 `?v=`；無 inline script/style、UTF-8 無 BOM、LF。

## No Analog Found

| File / Concern | Role | Data Flow | Reason |
|----------------|------|-----------|--------|
| 段落把手拖曳（Pointer Events＋capture） | controller | event-driven | 現有為 HTML5 DnD（將刪除），無 Pointer Events 先例 → 用 RESEARCH Pattern 4 |
| 跨面板詞卡 pointer session + 鏡像 div 游標 | controller | event-driven | 專案無此類程式 → RESEARCH Pattern 7、8 |
| 應用層 undo 快照堆疊 | store | event-driven | 專案無歷史機制 → RESEARCH Pattern 5 |
| CDP 觸控測試 helper `tests/drag-lib.mjs` | test util | event-driven | 既有測試無 CDP 觸控 → RESEARCH Code Examples `touchSession` |
| 可點擊的 toast（`showUndoToast`） | component | request-response | `showToast` 為 pointer-events:none，只能類推其建構模式 |

## Metadata

**Analog search scope:** `js/`、`css/`、`tests/`、`index.html`（README/RESEARCH 提供的行號已對照原始碼核對）
**Files read:** `js/lyrics.js`（全）、`js/safety.js` 590-619、`js/songs.js` 90-124、`js/layout.js` 140-169、`js/ui-common.js` 40-79、`js/ai-word-events.js` 1-30、`tests/node-core.mjs`、`tests/core-node.spec.mjs` 1-25、`tests/split-tags.spec.mjs` 8-72、`css/panels.css` 616-630/897-917/1045-1075
**Pattern extraction date:** 2026-10-23
