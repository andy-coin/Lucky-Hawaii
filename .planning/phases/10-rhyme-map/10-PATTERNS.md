# Phase 10: Rhyme Map 韻腳地圖 - Pattern Map

**Mapped:** 2026-10-23
**Files analyzed:** 17 (新增 6 + 修改 11)
**Analogs found:** 17 / 17（所有 analog 皆為 git 追蹤的 `js/`、`css/`、`tests/` 原始檔，已用 `git ls-files js` 確認，無鏡像路徑）

## 重要提醒（planner 必讀）

1. **命名衝突：** RESEARCH 用 `.rmap-backdrop` / `.rmap-hl` / `.rmap-in` / `lhMap*`；UI-SPEC 用 `.rhyme-mirror` / `.rm-hl` / `.rm-inner` / `#rhymeMenu` / `lhRmMenu`。兩份文件的測試敘述各引用自己的名字。planner 須在第一個 plan 裡統一一組命名（建議：CSS class 用 UI-SPEC 的 `rm-*` + `.rhyme-mirror`，純函式與 JS 全域用 RESEARCH 的 `lhMap*` / `lhRhyme*`），並同步修正測試過濾條件（`songs-ime` / `sections-ui` 的 `.rmap-backdrop` 過濾要用最終名稱）。
2. **UI-SPEC D-06 與 RESEARCH 不同：** UI-SPEC 允許組字中對鏡像根節點只切一個 class（`rm-stale`）；RESEARCH 要求組字中鏡像零突變。class 屬性突變不是 childList 突變，兩者可並存，但測試要寫清楚觀察的是 childList。
3. **掛鉤點只有兩個：** `lhSecCountOne`（`js/sections.js:553-563`）末尾與 `lhSecCountAll`（`js/sections.js:540` 附近）末尾；組字守門已在 `js/lyrics.js:257-271`，不要另開入口。

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `js/rhyme-core.js` (new) | utility（純函式） | transform | `js/sections-core.js` | exact |
| `js/rhyme-map.js` (new) | component（鏡像層/選單/浮動列） | event-driven + request-response | `js/sections.js`（選單）+ `js/word-drag.js`（鏡像量測） | role-match（拆兩個來源） |
| `css/panels.css`（改） | config（樣式） | — | `css/panels.css:1270-1306`（`.section-menu-btn`/`.type-row`） | exact |
| `css/responsive.css`（改） | config（樣式） | — | `css/responsive.css:737-751` | exact |
| `index.html`（改） | config（腳本標籤、工具列按鈕） | — | `index.html:357` 工具列 + `:461-467` script 標籤 | exact |
| `js/candidates.js`（改） | service（查韻篩選） | transform | 自身 `:79-81`、`:281-294` | exact（等價改寫） |
| `js/wordlist.js`（改） | service | transform | 自身 `:427,432` | exact（等價改寫） |
| `js/safety.js`（改） | config/驗證（`LH_KEYS`、`lhNormalizeSong`、`_lhSettingFrom`） | CRUD（備份匯入匯出） | 自身 `:8-31`、`:540-553`、`:587-625` | exact |
| `js/sections.js`（改，2 行掛鉤） | component | event-driven | 自身 `:540-563` | exact |
| `js/sections.js` 或 `js/lyrics.js`（標題列字母 strip） | component | event-driven | `lhSecRefreshMeta`（`sections.js:65`）、`.section-count` Text node 技巧 | role-match |
| `tests/rhyme-core.spec.mjs` (new) | test（Node vm） | transform | `tests/sections-core.spec.mjs` | exact |
| `tests/rhyme-parity.spec.mjs` (new) | test（瀏覽器） | request-response | `tests/golden.spec.mjs`、`tests/core-node.spec.mjs` | role-match |
| `tests/rhyme-map-ui.spec.mjs` (new) | test（e2e） | event-driven | `tests/sections-ui.spec.mjs`、`tests/songs-ime.spec.mjs` | role-match |
| `tests/rhyme-map-perf.spec.mjs` (new) | test（perf） | batch | `tests/perf.spec.mjs` | exact |
| `tests/node-core.mjs`（改） | test util | — | 自身 `:6` `CORE` | exact |
| `tests/scan.spec.mjs` / `tests/split-tags.spec.mjs` / `tests/sections-audit.spec.mjs`（改） | test | — | 自身（21→22、`JS_ORDER`、`FILES`） | exact |
| `tests/songs-ime.spec.mjs:83`、`tests/sections-ui.spec.mjs:266`（改） | test | event-driven | 自身 `watchLeftPanel` / `watchLeft` | exact |

## Pattern Assignments

### `js/rhyme-core.js` (utility, transform)

**Analog:** `js/sections-core.js`（純函式、不碰 DOM/儲存、Node vm 可單獨載入）

**檔頭註解與常數風格**（`sections-core.js:1-13`）：
```javascript
// ==================== 段落模組：純函式 ====================
// 純函式、不碰 DOM／儲存，Node 可直接載入（tests/sections-core.spec.mjs 用 node:vm 載入這一支）。
...
const LH_SEC_TYPE_SET = new Set(LH_SEC_TYPES);   // 用 Set／Map 查表，不用物件字面量：'__proto__'、'constructor' 才打不到原型鍵
const LH_SEC_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
```
rhyme-core 的 `LH_MAP_PARTICLES`（Set）、`LH_READING_KEY_RE` 照此：查表用 Set/Map，不用物件字面量；readings 清洗用 `Object.keys` 只走自有鍵。

**欄位整理（壞值丟掉）**（`sections-core.js:43-55`）：
```javascript
function lhSecFields(s) {
    const hasType = typeof s.type === 'string' && LH_SEC_TYPE_SET.has(s.type);
    ...
    return { type: ..., color: typeof s.color === 'string' && LH_SEC_COLOR_RE.test(s.color) ? s.color.toLowerCase() : '', height: Number.isFinite(s.height) && ... ? ... : null };
}
```
→ `lhMapNormalizeSettings(o)`（只收 5 個已知布林鍵、其餘補預設）與 `lhMapCleanReadings(raw)` 直接照此「逐欄檢查，壞的丟掉、其他照收」寫法。具體可抄原型：RESEARCH §Code Examples 1（`lhRhymeMatch`/`lhRhymeKey`）、2（`lhMapTarget`/`lhMapReading`/`lhMapAnalyze`）、4（`lhMapCleanReadings`）、5（`lhMapNormalizeSettings`）。

**依賴的既有純函式：** `getZhuyinRhyme`（`js/search.js:26-34`）、`RHYME_TO_FAMILY`（`js/phonetic-tables.js:136-137`）、`getCharAllReadings`（`js/polyphonic.js:25-48`，回 `[{reading,tier}]`）、`wordPhoneticMap`（`js/wordlist.js:281`）、`charInfo`（`js/dict.js`）。載入順序：`polyphonic.js` 之後、`wordlist.js` 之前（候選：`index.html` 在 `polyphonic.js` 後加 script 標籤）。

**不可用 DOM 的驗證：** 檔案不得偷用 `document`/`window`（sections-core.spec 用 `vm.createContext({})` 空環境載入，偷用會 ReferenceError）。但 rhyme-core 依賴字典全域，所以測試改用 `tests/node-core.mjs` 的 `loadCore()`（見下）。

---

### `js/rhyme-map.js` (component, event-driven)

**Analog A（選單/浮動列/鍵盤/外點關閉）:** `js/sections.js:593-941`
**Analog B（鏡像量測/選取定位）:** `js/word-drag.js:18-102`

**節點建構輔助（直接重用，不要另寫）**（`sections.js:615-633`）：
```javascript
function _lhMk(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
}
function _lhMkBtn(cls, text, label) {
    const b = _lhMk('button', cls, text);
    b.type = 'button';
    if (label) b.setAttribute('aria-label', label);
    return b;
}
function _lhMkBlock(cap, ...kids) {
    const b = _lhMk('div', 'section-menu-block');
    b.append(_lhMk('span', 'section-menu-cap', cap), ...kids);
    return b;
}
```
rhyme-map.js 最後載入，這三個全域已存在；所有文字走 `textContent`（`sections-audit` 的 acorn「無 HTML sink」掃描會擋 `innerHTML`/模板字串 HTML）。

**選單只建一次、每次打開重填（#rhymeMenu / #rhymeStats 照抄）**（`sections.js:635-641, 681-682, 749-750`）：
```javascript
function lhSecMenuBuild() {
    if (_lhMenu) return _lhMenu;
    const m = _lhMk('div', 'word-ctx-menu section-menu');
    m.id = 'sectionMenu';
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-label', '段落設定');
    ...
    m.append(title, _lhMkBlock('顏色', grid, row), ..., close);
    document.body.appendChild(m);
    ...
    _lhMenu = m;
    return m;
}
```

**radiogroup（寬韻/嚴格）與方向鍵**（`sections.js:657-666, 696-712`）：`type-row` + `role="radio"` + `aria-checked`、roving tabindex、方向鍵只移焦點、Enter/Space 才選。複製 `types.addEventListener('keydown', ...)` 整段（含 `e.isComposing || e.keyCode === 229` 守衛）。

**Tab 頭尾相接**（`sections.js:741-748`）：
```javascript
m.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const items = [...m.querySelectorAll('button, input')].filter(n => n.tabIndex >= 0 && n.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});
```

**開/關/定位（鍵盤開才搶焦點、觸控不搶；開前先關其他選單）**（`sections.js:813-843`）：
```javascript
function lhSecOpenMenu(secEl, x, y, byKeyboard) {
    const m = lhSecMenuBuild();
    closeExportMenu();
    closeSongListOverlay();
    _lhMenuId = secEl.dataset.id;
    lhSecMenuSync();
    lhPlaceMenu(m, x, y);
    if (byKeyboard) m.querySelector('.type-row[aria-checked="true"]')?.focus({ preventScroll: true });
    return m;
}
// _lhMenuUnder：按鈕下方放不下就翻到上方
const b = m.getBoundingClientRect();
if (b.top < r.bottom && r.top - b.height - 4 >= 4) lhPlaceMenu(m, r.left, r.top - b.height - 4);
```
UI-SPEC D-13：開 #rhymeMenu 時要同時關 `#sectionMenu`（呼叫 `lhSecCloseMenu()`）、#rhymeStats、export menu、selection bar；反向（開 sectionMenu 時關韻腳選單）要在 `lhSecOpenMenu` 加一行 `typeof` 守衛的 `lhRmCloseAll()`，或由 rhyme-map 在 capture `pointerdown` 處理。

**外點關閉 + Esc 還焦點（capture）**（`sections.js:911-923`）：
```javascript
document.addEventListener('pointerdown', e => {
    if (_lhMenuId && !(e.target.closest && e.target.closest('#sectionMenu'))) lhSecCloseMenu(true);
}, true);
document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !_lhMenuId || e.isComposing || e.keyCode === 229) return;
    ...
    e.preventDefault(); e.stopPropagation();
    lhSecCloseMenu();
    lhSecEl(id)?.querySelector('.section-type')?.focus({ preventScroll: true });
}, true);
```

**鍵盤/視窗變動重新夾進可見範圍**（`sections.js:927-941`）：`_lhMenuReclamp` 用雙 `requestAnimationFrame` 等 `layout.js` 先更新 `--app-h`，監聽 `resize` 與 `visualViewport` 的 `resize`/`scroll`。三個浮層（選單、統計、浮動列）共用一份即可。

**選單定位工具（共用，勿重寫）**（`js/layout.js:153-170`）：`lhPlaceMenu(el, x, y)` 量真實大小、夾進 visualViewport 四邊 4px。

**鏡像量測與選取定位（浮動列）**（`word-drag.js:19-33, 92-102`）：
```javascript
const _LH_MIRROR_COPY = ['boxSizing', 'paddingTop', ..., 'overflowWrap', 'wordBreak', 'textAlign'];
function lhMirror(ta) {
    const cs = getComputedStyle(ta), m = document.createElement('div');
    for (const p of _LH_MIRROR_COPY) m.style[p] = cs[p];
    m.style.cssText += ';position:absolute;left:-9999px;top:0;visibility:hidden;white-space:pre-wrap;overflow:hidden;height:auto;border-width:0';
    m.style.boxSizing = 'content-box';
    m.style.width = (ta.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) + 'px';
    m.append(document.createTextNode(ta.value + '​'));
    document.body.appendChild(m);
    return m;
}
function lhCaretRect(ta, mirror, i) { ... return { left, top, height }; }   // 螢幕座標
```
浮動列用法：`const m = lhMirror(ta); const pos = lhCaretRect(ta, m, ta.selectionEnd); m.remove();`（RESEARCH §Code 6）。超長段落沿用 `LH_WD_BIG = 200000`（`word-drag.js:11`）改固定位置。

**注意：** 背景鏡像層（`.rhyme-mirror`/`.rmap-backdrop`）不要複用 `lhMirror`（那是一次性量測、`left:-9999px`、`visibility:hidden`）；背景層要 CSS 共用選擇器 + `ResizeObserver`（RESEARCH Pattern 2、Code 3：`left/top/width/height = ta.offset*`、右 padding 加 `ta.offsetWidth - ta.clientWidth`、`scroll` 同步、結尾 `​`）。

**組字閘門（F1）**（`lyrics.js:254-271`，掛鉤已在守門後）：
```javascript
area.addEventListener('compositionstart', () => { _lhComposing = true; clearTimeout(_saveTimer); });
area.addEventListener('compositionend', e => {
    _lhComposing = false; syncFromField(e.target); flushSongs(); lhSecCountFrom(e.target);
    ...
});
area.addEventListener('input', e => {
    syncFromField(e.target);
    if (!_lhComposing && !e.isComposing) {            // Firefox 在 compositionend 之後還會送最後一個 input
        scheduleSave(); lhSecCountFrom(e.target);
        ...
    }
});
```
`lhMapSchedule`/flush 內還是要再各自檢查 `_lhComposing`（宣告在 `songs.js`）。讀文字一律從模型：`curSong().sections.find(x => x.id === secEl.dataset.id).text`，絕不讀/寫 `ta.value`（G2）。

**掛鉤（只改兩行）**（`sections.js:553-563`）：
```javascript
function lhSecCountOne(secEl) {
    const song = curSong();
    const s = song && secEl && song.sections.find(x => x.id === secEl.dataset.id);
    if (!s) return;
    const n = lhCountWords(s.text);
    _lhSecCounts.set(s.id, n);
    const node = secEl.querySelector('.section-count')?.firstChild;
    if (node) node.data = n + ' 字';
    _lhSecShowTotal();
    // 新增：if (typeof lhMapSchedule === 'function') lhMapSchedule(secEl);
}
```
`lhSecCountAll()` 末尾同樣加 `typeof lhMapRenderAll === 'function'` 守衛。呼叫者（已涵蓋）：`lyrics.js:227,259,267`、`undo.js:124`、`word-drag.js:376`。

**標題列字母 strip 的 DOM 更新技巧：** 字數用 Text node `.data` 更新（`sections.js:557-558`，不重建節點）；strip 同樣：`button.section-rhyme` 預設 `hidden`，字母串走 Text node。標題列 DOM 順序（UI-SPEC D-09）：handle, chevron, `.section-type`, `.section-rhyme`, `.section-count`, `.section-remove`；插入點在 `js/lyrics.js` 約 156-226 的 `renderLyricsSections`。

**查韻/AI 建議（D1/D17）：** 只填 `searchInputEl.value` 並 `dispatchEvent(new Event('input', { bubbles: true }))`，`lastLyricsSelection = ''`（Pitfall 9，`ai-generate.js:189-191`），手機 `if (lhIsSheetMode()) mobileTab(...)`（`panels.js:86`），AI：`_handleSearch(char).then(() => generateAISuggestions())`（`ai-generate.js:74`）。骨架見 RESEARCH §Code 6。

**錯誤處理：** 所有 `catch` 必須 `lhWarn(tag, e)`（`safety.js:45-48`），否則 `scan.spec` 吞錯掃描失敗；不得直接用 `localStorage`，設定走 `lhGetJSON('lh:map', …)` / `lhSet`。

---

### `js/safety.js`（改：`LH_KEYS`、`_lhSettingFrom`、`lhNormalizeSong`、`LH_IMPORT_CAPS`）

**Analog:** 自身既有登記方式

**登記鍵（group:'setting' 自動進備份，`_lhBackupSettingKeys` 在 `:534-536`）**（`:26-31`）：
```javascript
    { key: 'lh:lexiconPack', group: 'setting' },
    { key: 'lh:songs', group: 'data' },
    ...
    { key: 'lh:songListOpen', group: 'ui' }
];
```
→ 加 `{ key: 'lh:map', group: 'setting' }`，並把 `:8` 註解「21 個」改 22。

**設定匯入驗證分支**（`:540-553`，照 `dictOverrides_v076` 加 `lh:map`）：
```javascript
function _lhSettingFrom(src, key) {
    if (!src || typeof src !== 'object' || !Object.prototype.hasOwnProperty.call(src, key)) return undefined;
    const v = src[key];
    if (typeof v !== 'string' || v.length > LH_IMPORT_CAPS.setting) return undefined;
    if (LH_SETTING_SHAPES[key] && !LH_SETTING_SHAPES[key].test(v)) return undefined;
    if (key === 'dictOverrides_v076') {
        try { ... return JSON.stringify(lhCleanDictOverrides(o).clean);
        } catch (e) { lhWarn('備份檔裡的字庫覆寫不是合法 JSON，略過', e); return undefined; }
    }
    return v;
}
```
新分支：`JSON.parse` → `JSON.stringify(lhMapNormalizeSettings(...))`，catch 內 `lhWarn(...)`。注意 `LH_SETTING_SHAPES` 若有形狀表也要看是否需要為 `lh:map` 補。

**`lhNormalizeSong` 白名單（Pitfall 7）**（`:587-625` return 區）：
```javascript
    return {
        id, title, sections, hashtags,
        context: typeof raw.context === 'string' ? _lhCut(raw.context, LH_IMPORT_CAPS.context, stats) : '',
        createdAt,
        updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : createdAt
    };
```
→ 加 `...(cleaned ? { readings: cleaned } : {})`，只在非空時輸出（避免既有 `toEqual` 整首歌比對失敗）。`lhMapCleanReadings` 在 `rhyme-core.js` 定義，safety.js 比它早載入但只在匯入時（執行期）呼叫（同 `lhSecFields` 的慣例，見 `:603` 註解）。「合法讀音」的字典比對放在 `lhMapReading` 使用時，不放 safety（safety 不依賴字典已載入）。

---

### `js/candidates.js`、`js/wordlist.js`（改：等價改寫成 `lhRhymeMatch`）

**Analog:** 自身既有判定（RESEARCH §Code 1 逐行對照）

現況（`candidates.js:79-81`）：
```javascript
const rhymeMatch = filterNoExtRhyme
    ? lastRhyme === searchRhyme
    : RHYME_TO_FAMILY[lastRhyme] === searchFamilyId;
```
改為 `lhRhymeMatch(lastRhyme, searchRhyme, filterNoExtRhyme)`。`validateWordRhyme`（`:281-294`）保留 `if (fam === undefined) return false;` 守衛（AI 造詞專屬），其餘改 `lhRhymeMatch(getZhuyinRhyme(i.zhuyin), req.rhyme, rhymeMode === 'rhyme' && filterNoExtRhyme)`；多字分支 `:294` 改 `lhRhymeMatch(..., false)`。`wordlist.js:427,432` 同理（`lhRhymeMatch(..., false)` 取反）。Edge（RESEARCH Pattern 1）：`searchFamilyId === null` 的不可達情境，改寫後加 `if (!searchRhyme) continue` 或單元測試鎖死。`searchRhyme` 字卡路徑不經此處（用 `BORROW_MAP`），golden hash 不變但仍要跑。

---

### `css/panels.css`、`css/responsive.css`（改）

**Analog:** `css/panels.css:1270-1306`（`.section-menu-btn`、`.type-row`）；`panels.css:1440-1452`（`.section-textarea`）；`responsive.css:737-751`

- `.section-textarea` 基本規則（`panels.css:1440`）與 ≤900/coarse 規則（`responsive.css:737,751`）把 mirror 類別加進選擇器清單，共用字型/行高/padding/overflow-wrap，而不是 JS 複製計算樣式。
- `.section-textarea { background: transparent }`，並處理 `.section-textarea.main-textarea { background: var(--card-bg) }`（`panels.css:1049`）（Pitfall 5）；`.section-body { position: relative }`。
- 選單視覺沿用 `.word-ctx-menu.section-menu` / `.section-menu-btn` / `.type-row[aria-checked="true"]`（`border-left: 0.25rem solid var(--highlight-border)`）。
- 禁止：新增 `transition`/`@keyframes`（`sections-audit` 只准 ≤ 既有數量）、CSS 內的 hex 色碼（`style.spec`）。色值只在 JS 常數（比照 `LH_SEC_COLORS`，`sections.js:595-598`），並以 `style.setProperty('--rm-cN', ...)` 寫入；寫入前驗證格式（比照 `_LH_COLOR_OUT = /^#[0-9a-f]{6}$/`，`sections.js:599`；`sections.js:605-613` `lhSecApplyColor` 是「值合格才進 style/dataset」的範本）。
- 觸控 ≥ `var(--hit)`，hover 只給 `(hover: hover) and (pointer: fine)`（`_LH_FINE`，`sections.js:600`）。

---

### `index.html`（改）

**Analog:** 自身
- 工具列（`:357`）：`.lyrics-tools` 內 DOM 順序 `[undo-group][韻腳 ▾ #rhymeMenuBtn][songTotal]`，按鈕樣式比照 `.undo-btn` 但帶文字。
- Script 標籤（`:461-467` 區）：新增 `<script src="js/rhyme-core.js?v=0.96.14">`（`polyphonic.js` 之後）與 `rhyme-map.js`（`word-drag.js` 之後最後載入）；其餘所有標籤 `?v=0.96.13` → `0.96.14`（`split-tags` 要求一致）。

---

### `tests/rhyme-core.spec.mjs` (test, transform)

**Analog:** `tests/sections-core.spec.mjs`（Node vm、`ev` 輔助、逐表驗證）+ `tests/node-core.mjs`（`loadCore()` 載入字典）

```javascript
import { test, expect } from '@playwright/test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const ctx = vm.createContext({});
vm.runInContext(readFileSync('js/sections-core.js', 'utf8'), ctx, { filename: 'js/sections-core.js' });
const ev = code => JSON.parse(JSON.stringify(vm.runInContext(code, ctx)));   // 跨 realm 先 JSON 往返
const j = v => JSON.stringify(v);
test('名稱：推斷表', () => { for (const [l, t] of Object.entries(table)) expect(ev(`lhInferSecType(${j(l)})`), l).toEqual({ type: t, custom: '' }); });
```
rhyme-core 需要字典，所以載入改用 `loadCore()`（`tests/node-core.mjs:12-34`，把 `'js/rhyme-core.js'` 加進 `CORE` 於 `'js/polyphonic.js'` 之後，**否則 `core-node.spec` 的詞庫篩選測試因 `lhRhymeMatch` 不存在而 ReferenceError**）。額外：手動補 `polyphonicsOrderMap`、`ctx.performance = performance`（RESEARCH Wave 0）。固定歌詞範例 F-AABB/F-ABAB/F-FAM*/F-PART/F-POLY/F-KONG 與預期字母見 RESEARCH §Validation「固定歌詞範例」表。

### `tests/rhyme-map-ui.spec.mjs`、`tests/rhyme-map-perf.spec.mjs`

**Analog:** `tests/sections-ui.spec.mjs`（段落 DOM/輔助）、`tests/songs-ime.spec.mjs`（組字：`compose(page, steps, commit, beforeCommit)` 於 `tests/helpers.mjs`）、`tests/perf.spec.mjs`（`PerformanceObserver('longtask')`、`LH_PERF=1` 才跑計時，其餘為永遠跑的結構性斷言）、`tests/drag-lib.mjs`（`touchSession` 觸控）。

**必改既有測試（Pitfall 3，過濾鏡像層子樹）：** `tests/songs-ime.spec.mjs:80-85`（`watchLeftPanel`）與 `tests/sections-ui.spec.mjs:263-269`（`watchLeft`）的 childList 過濾改為
`m.type === 'childList' && !(m.target.closest && m.target.closest('<最終鏡像 class>'))`。另新增專屬測試：組字期間鏡像子樹突變 = 0，確認後 ≥ 200ms 才有。

**其他必改（RESEARCH Wave 0）：** `tests/scan.spec.mjs:69-70`（21→22）、`tests/split-tags.spec.mjs:8-12`（`JS_ORDER` 加 `'rhyme-core'`、`'rhyme-map'`，26→28）、`tests/sections-audit.spec.mjs:383` `FILES` 加兩個新檔（HTML sink / 吞錯 acorn 掃描）、`tests/layout.spec.mjs`（`mustSee` 加按鈕）、-darwin 視覺截圖以 `npm run visual:update` 重拍（lyrics 三裝置）。捲軸寬補償測試用注入 `::-webkit-scrollbar { width: 15px }`（headless 預設 `--hide-scrollbars`）。

## Shared Patterns

### 純函式層分離（Node 可測）
**Source:** `js/sections-core.js`（對應 UI 層 `js/sections.js`）
**Apply to:** `rhyme-core.js`（純）與 `rhyme-map.js`（DOM）的切分；純函式放前者，所有 `document`/`localStorage`/`curSong` 相關放後者。

### 模型唯讀、畫面絕不回寫、組字不碰 DOM
**Source:** `js/lyrics.js:237-252, 254-271`；`js/sections.js:553-563`
**Apply to:** `lhMapSchedule`/`lhMapPaint`/所有分析；一律讀 `curSong().sections[...].text`，用 `data-id` 找段落，不讀 `ta.value`（浮動列取選取範圍除外，且只讀不寫）。

### 無 HTML 注入（textContent / createElement / dataset 整數）
**Source:** `sections.js:615-633`（`_lhMk`/`_lhMkBtn`）、`word-drag.js:1-5` 註解
**Apply to:** 鏡像層 span、strip、統計、浮動列、讀音 chips；`sections-audit` 會 acorn 掃描新檔。`--rm-c` 只接受 `var(--rm-c<0–15>)`。

### 錯誤處理與儲存
**Source:** `js/safety.js:45-48`（`lhWarn`）、`safety.js:540-553`
**Apply to:** 所有 `catch` → `lhWarn(tag, e)`；儲存只經 `lhGetJSON`/`lhSet`，鍵須在 `LH_KEYS`。

### 浮層互斥 + 定位 + 鍵盤重夾
**Source:** `js/layout.js:153`（`lhPlaceMenu`）、`sections.js:911-941`
**Apply to:** `#rhymeMenu`、`#rhymeStats`、`#rhymeSelBar`；開一個關其他；Esc 還焦點；`visualViewport` 變動重夾。

### 節流/排程
**Source:** `sections.js:927-937`（雙 rAF 排程模式）；`ai-generate.js`/`lyrics.js` 的 `scheduleSave`
**Apply to:** `lhMapSchedule`：debounce ~200ms（最長等 1000ms）→ `requestIdleCallback`（fallback `setTimeout`）→ 每段快取（`entry.text === text && entry.sig === sig`）。

## No Analog Found

| File / 功能 | Role | Data Flow | Reason |
|-------------|------|-----------|--------|
| 背景鏡像層（`ResizeObserver` + scroll 同步 + 高亮 span） | component | event-driven | 專案現無「疊在 textarea 後面的繪圖層」；`lhMirror` 是一次性隱藏量測。用 RESEARCH §Pattern 2 與 §Code 3（已在 Chromium 153 逐像素驗證） |
| 增量分析快取 + `requestIdleCallback` 排程 | utility | batch | 無既有 idle 排程；最近的是 `scheduleSave` debounce 與 `_lhMenuReclamp` rAF 模式。參考 RESEARCH §F2/Finding 6 |
| 主題切換重算色票（`MutationObserver` on `data-theme`） | utility | event-driven | `js/theme.js` 可看如何讀主題，但無「JS 色票隨主題重寫 CSS 變數」的先例；`LH_SEC_COLORS` 只有單一組 |
| 選取浮動列（`select`/`selectionchange` 合併 + 400ms debounce） | component | event-driven | 專案無選取工具列；定位工具有（`lhMirror`+`lhCaretRect`+`lhPlaceMenu`），事件骨架用 RESEARCH §Code 6 |

## Metadata

**Analog search scope:** `js/*.js`（27 檔全為 git 追蹤）、`css/panels.css`、`css/responsive.css`、`index.html`、`tests/`
**Files read:** `sections-core.js`（全）、`word-drag.js`（1-130）、`sections.js`（540-575, 593-941）、`lyrics.js`（215-273）、`safety.js`（40-56, 536-640 片段）、`candidates.js`（片段）、`polyphonic.js`（1-50）、`layout.js`（145-185）、`tests/node-core.mjs`、`tests/sections-core.spec.mjs`（頭）
**Tracked-source gate:** `git ls-files js` 確認所有 analog 為追蹤檔；無 `.gsd/capabilities` 鏡像路徑
**Pattern extraction date:** 2026-10-23
