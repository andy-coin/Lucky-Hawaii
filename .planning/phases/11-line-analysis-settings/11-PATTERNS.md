# Phase 11: Line Analysis & Settings 句構分析與設定頁 - Pattern Map

**Mapped:** 2026-10-28
**Files analyzed:** 15 (新增 3 + 修改 12)
**Analogs found:** 15 / 15（全部是 git 追蹤的 `js/`、`css/`、`tests/`、`index.html`，已用 `git ls-files` 確認，無鏡像路徑）

## 重要提醒（planner 必讀）

1. **以 RESEARCH 的 X1-X9 為準**（覆蓋 UI-SPEC）。對 PATTERNS 影響最大的：X1 marker 插在「最後非空白字元後、行尾空白前」；X2 右內距走純 CSS `calc`+`min()`，JS 只在 `_lhMapSync` 多寫 `--lm-bar`；X3 gutter 只看設定（`<html data-lm>`）；X5 新增 `lhRhymeSerialize` 最小序列化（舊五鍵字串逐字不變，否則 Phase 10 至少 8 條字串相等測試全紅）；X8 「更多設定…」不能用 `toggleSettings()`（它是 toggle）。
2. **RESEARCH 已附可直接抄的參考實作**：`lhLineAnalyze`/`lhLineStructText`/`lhLineRefIndex`/`lhLineRows`（Pattern 2、3）、`lhRhymeNormalizeSettings`/`lhRhymeSerialize`（Pattern 4）、`lhMapOpenPrefs`（Code Examples）、dwell 偵測（Pattern 6）、CSS（Pattern 8）。本檔不重貼，只指出「骨架要貼在哪個既有檔案的哪個形狀上」。
3. **掛鉤點沿用 Phase 10**：`lhSecCountOne`/`lhSecCountAll` 末尾已呼叫 `lhMapSchedule`/`lhMapRenderAll`；不要另開入口。組字守門 `_lhComposing` 已在 `lhMapSchedule`、`_lhMapFlush`、`_lhMapSelCheck`。
4. **載入順序**：`line-core.js` 只在執行期才用 `_LH_WC_RE`（sections-core.js）、`_LH_RHYME_HAN_RE`（rhyme-core.js）、`wordPhoneticMap`，載入順序不影響；放在 `rhyme-core.js` 之後即可。Node 測試用 `tests/node-core.mjs` 的 `CORE` 陣列加一項，且 `_LH_WC_RE` 來自 `js/sections-core.js`，**CORE 目前沒有載 sections-core.js**，需一併加入（或測試自行 `run('js/sections-core.js')`）。

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `js/line-core.js` (new) | utility（純函式） | transform | `js/rhyme-core.js`（及 `js/sections-core.js:90-101`） | exact |
| `js/rhyme-core.js` (改：`LH_MAP_DEFAULTS`、擴充 normalise、新增 `lhRhymeSerialize`) | utility | transform | 自身 `:11-24` | exact |
| `js/rhyme-map.js` (改：marker 繪製、`lhMapApplyLook`、分析面板、dwell、偏好區塊) | component | event-driven | 自身 `:51-105`（paint）、`:259-372`（選單/設定）、`:629-752`（浮動列） | exact |
| `js/safety.js` (改：`lh:map` 匯入分支) | config/驗證 | CRUD（備份匯入） | 自身 `:552-556` | exact |
| `js/search-ui.js` (改：選用，Esc 關偏好設定 X7) | component | event-driven | 自身 `:36-45`、`:99-104` | exact |
| `js/songs.js` (選用 IN-04：`_normalizeSong` 清洗 readings) | utility | transform | RESEARCH Code Examples「讀入時清洗 readings」 | role-match |
| `css/panels.css` (改：`.lm-mk`、`[data-lm]`、`#rhymeAnalysis`、`.lm-preview`、`.rm-hl` 用 `var(--rm-end)`) | config | — | 自身 `:325-387`（`.rm-switch`、`.rm-sw`、`.rm-bar`）、`:1634-1645`（`.rm-hl`） | exact |
| `css/responsive.css` (改：手機面板、44px) | config | — | 自身 `panels.css:1808` `.rm-switch { min-height: var(--hit) }` 同模式 | role-match |
| `index.html` (改：`line-core.js` script、`<details id="mapSettingsSection">`、`?v=0.96.15`) | config | — | `index.html:198` `<details class="settings-backups" id="autoBackupSection">` | exact |
| `tests/line-core.spec.mjs` (new) | test（Node vm） | transform | `tests/rhyme-core.spec.mjs:1-30` | exact |
| `tests/line-analysis-ui.spec.mjs` (new) | test（e2e） | event-driven | `tests/rhyme-map-ui.spec.mjs:1-30` | exact |
| `tests/node-core.mjs` (改：`CORE` 加項) | test util | — | 自身 `:6` | exact |
| `tests/split-tags.spec.mjs` (改：`JS_ORDER` 加 `line-core.js`、`?v=`) | test | — | 自身 `:8` `JS_ORDER` | exact |
| `tests/rhyme-map-ui.spec.mjs`（改：Pitfall 6 浮動列斷言重寫；其它字串相等斷言原則上不動） | test | event-driven | 自身 `:630,:640-643,:896-934,:1003,:1103,:1136,:1154` | exact |
| `tests/rhyme-map-perf.spec.mjs`（改：100 行打字加 line 設定的長任務量測） | test | batch | 自身（Phase 10 同檔） | exact |

## Pattern Assignments

### `js/line-core.js` (utility, transform)

**Analog:** `js/rhyme-core.js`（檔頭風格、純函式、Node vm 可載入）+ `js/sections-core.js`（字數 regex）

**檔頭註解風格**（`js/rhyme-core.js:1-5`）：
```javascript
// ==================== 韻腳地圖：純函式 ====================
// 純函式、不碰 DOM／儲存，Node 可直接載入（tests/rhyme-core.spec.mjs 用 node:vm 載入這一支）。
// ...
// 字典與詞庫的全域變數（charInfo、wordPhoneticMap、RHYME_TO_FAMILY）只在函式內部使用，所以載入順序不影響。
```
→ 新檔頭改成 `// ==================== 句構分析：純函式 ====================`，並註明依賴 `_LH_WC_RE`、`_LH_RHYME_HAN_RE`、`wordPhoneticMap`（執行期才讀；`switchLexiconPack` 會整個換掉 Map，每次現讀、不存參照）。

**單位切分用同一支 regex**（`js/sections-core.js:94-101`，不要寫第二套）：
```javascript
const _LH_CJK = String.raw`[\p{Script=Han}\p{Script=Hiragana}...]`;
const _LH_WC_RE = new RegExp(`${_LH_CJK}|(?:...)+...`, 'gu');
function lhCountWords(text) {
    if (typeof text !== 'string') return 0;
    let n = 0;
    for (const _ of text.matchAll(_LH_WC_RE)) n++;   // matchAll 會複製 regex，不污染 lastIndex
    return n;
}
```

**核心**：直接貼 RESEARCH Pattern 2 的 `lhLineAnalyze`/`lhLineStructText`，Pattern 3 的 `lhLineRefIndex`/`lhLineRows`。不變量測試：任何字串 `groups` 加總 = `lhCountWords(line)`。

**查表用 Map/Set 不用物件字面量**（`js/sections-core.js:46` 註解：`'__proto__'`、`'constructor'` 打不到原型鍵）——`lhLineRefIndex` 的 `first` 用 `Map`。

---

### `js/rhyme-core.js`（修改：設定驗證與序列化）(utility, transform)

**Analog:** 自身 `js/rhyme-core.js:11-24`

**現況（要擴充，不要刪 `LH_RHYME_DEFAULTS`，它是 `lhRhymeSerialize` 決定「五舊鍵永遠寫」的依據，也被 candidates/wordlist 以外的程式引用）：**
```javascript
const LH_RHYME_DEFAULTS = Object.freeze({ end: true, letters: false, inner: false, strict: false, skipParticles: true });
function lhRhymeNormalizeSettings(o) {
    const out = Object.assign({}, LH_RHYME_DEFAULTS);
    if (o && typeof o === 'object' && !Array.isArray(o)) {
        for (const k of Object.keys(LH_RHYME_DEFAULTS)) {
            if (Object.prototype.hasOwnProperty.call(o, k) && typeof o[k] === 'boolean') out[k] = o[k];
        }
    }
    return out;
}
```
**要做的**：照 RESEARCH Pattern 4 加 `LH_MAP_DEFAULTS`（15 鍵：舊五鍵 + `line:false, lnRhyme:false, lnCount:true, lnSplit:true, lnDiff:false, autoHover:false, pos:'right', size:'m', depth:'std'`，另 `colors:{}`）、`LH_MAP_ENUM`、`LH_MAP_COLOR_RE`、`LH_MAP_COLOR_KEYS`（固定 16 把鍵，不迭代輸入）。沿用現有「`hasOwnProperty` + `typeof` 逐鍵檢查，壞值丟掉」手法；顏色另用 `/^#[0-9a-f]{6}$/`（與 `js/rhyme-map.js:10` `LH_MAP_HEX` 同形）。`lhRhymeSerialize` 新增在同檔。

**色票/混色比例既有常數**（`:26-34`，`lhMapApplyLook` 取預設組要用）：`LH_RHYME_COLORS.light/.dark`（17 色）、`LH_RHYME_MIX = { end: 34, orphan: 17, inner: 30 }`。濃淡三段查表 `light/std/heavy → [26,14]/[34,17]/[40,20]` 放 JS 常數（RESEARCH Pattern 8）。

---

### `js/rhyme-map.js`（修改：設定、繪製、面板）(component, event-driven)

**Analog:** 自身（Phase 10）。以下是各新增功能要貼的既有形狀。

**1. 設定載入與 setter 白名單**（`:12`、`:366-372`）——`lhMapSetSetting` 白名單改成「`key in LH_MAP_DEFAULTS` 且經 normalise 後值不變」，存檔改 `lhSet('lh:map', lhRhymeSerialize(_lhMapSet))`：
```javascript
let _lhMapSet = lhRhymeNormalizeSettings(lhGetJSON('lh:map', null));
function lhMapSetSetting(key, value) {
    if (!Object.prototype.hasOwnProperty.call(LH_RHYME_DEFAULTS, key) || typeof value !== 'boolean') return;
    _lhMapSet = lhRhymeNormalizeSettings(Object.assign({}, _lhMapSet, { [key]: value }));
    lhSet('lh:map', JSON.stringify(_lhMapSet));
    lhMapMenuSync();
    lhMapRenderAll();
}
```
注意：`pos/size/depth/colors` 變更只呼叫新的 `lhMapApplyLook()`，**不呼叫 `lhMapRenderAll`**（RESEARCH Pattern 8）；`line/lnRhyme/lnCount/lnSplit/lnDiff/end/inner/letters/strict/skipParticles` 才重畫。

**2. 跨分頁同步**（`:375-381`）——沿用，加一行 `lhMapApplyLook()`：
```javascript
window.addEventListener('storage', e => {
    if (e.key !== 'lh:map') return;
    lhMapCloseAll();
    _lhMapSet = lhRhymeNormalizeSettings(lhGetJSON('lh:map', null));
    lhMapMenuSync();
    lhMapRenderAll();
});
```

**3. 調色盤變數**（`:21-30`）——`lhMapApplyPalette` 改成 `colors[n] ?? 預設組[n]`，保留 `LH_MAP_HEX.test` 檢查與 `data-theme` 的 `MutationObserver`：
```javascript
function lhMapApplyPalette() {
    const set = document.documentElement.getAttribute('data-theme') === 'dark' ? LH_RHYME_COLORS.dark : LH_RHYME_COLORS.light;
    set.forEach((hex, n) => { if (LH_MAP_HEX.test(hex)) document.documentElement.style.setProperty('--rm-c' + n, hex); });
}
new MutationObserver(lhMapApplyPalette).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
```

**4. 輸入框/鏡像同步，多寫一行 `--lm-bar`**（`:34-43`）：
```javascript
function _lhMapSync(ta, mirror) {
    const cs = getComputedStyle(ta);
    const bar = ta.offsetWidth - ta.clientWidth - (parseFloat(cs.borderLeftWidth) || 0) - (parseFloat(cs.borderRightWidth) || 0);
    mirror.style.left = ta.offsetLeft + 'px';  /* top/width/height 同 */
    mirror.style.paddingRight = ((parseFloat(cs.paddingRight) || 0) + Math.max(0, bar)) + 'px';
    mirror.scrollTop = ta.scrollTop;
}
```
**陷阱**：這裡 inline 設 `paddingRight`，會蓋掉 CSS 的 `html[data-lm="right"] .rhyme-mirror { padding-right: calc(...) }`。右內距要改成「CSS 右內距 + 捲軸寬」：不要再 inline 設 `paddingRight`，改寫 `mirror.style.setProperty('--lm-bar', Math.max(0, bar) + 'px')` 並讓 CSS 的 padding 含 `var(--lm-bar)`（或 data-lm 為空時 inline 路徑保持原行為）。planner 需在計畫裡明確處理這個衝突（X2 只提到多寫 `--lm-bar`，沒提到既有 inline paddingRight）。

**5. paint 迴圈**（`:51-105`）——要改的三處：
- 快取 `sig`（`:57`）：目前 `[end,letters,inner,strict,skipParticles].map(Number).join('') + '|' + _lhMapEpoch + '|' + _lhMapReadVer`；加入 `line/lnRhyme/lnCount/lnSplit/lnDiff` 與（lnDiff 時）參考段文字（存在 cache entry，字串相等比對，Pitfall 5）。
- 「全關不分析」判斷（`:68`）：`!(end || inner || letters)` 要拆成 `needRhyme`/`needLine`/`paintRows`（Pitfall 9）。`res` 可為 null。
- 每行 append（`:74-96`）：`frag.append(r.line)` / `buf` 路徑改成「core（去行尾空白）→ `span.lm-mk` → 行尾空白 → `'\n'`」（X1，見 RESEARCH Pattern 1 的 `_lhMapAppendLine` 與 `_LH_TRAIL_WS`）。保留結尾零寬字元（`:97`）與 `rm-on` 切換（`:100`）、`replaceChildren(frag)`（單次突變，組字守門不動）。
- RESEARCH Pattern 7 要求把「文字+設定建 DocumentFragment」抽成 `_lhMapBuildFrag(text, readings, set, ctx)`，真實鏡像與偏好設定預覽共用。

**6. 排程**（`:166-189`）——`lhMapSchedule` 加：`_lhMapSet.line && _lhMapSet.lnDiff` 時，把同類型所有段落（用 `lhLineRefIndex(song.sections)` 或同 type/custom 名）一併 `_lhMapPending.add`（X9）：
```javascript
function lhMapSchedule(secEl) {
    if (!_lhMapOk || _lhComposing || !secEl) return;
    const now = Date.now();
    if (!_lhMapPending.size) _lhMapFirstAt = now;
    _lhMapPending.add(secEl.dataset.id);
    clearTimeout(_lhMapTimer);
    _lhMapTimer = setTimeout(_lhMapFlush, Math.max(0, Math.min(LH_MAP_DEBOUNCE, _lhMapFirstAt + LH_MAP_MAXWAIT - now)));
}
```

**7. 偏好設定區塊的開關列/按鈕建構**（直接重用，不要另寫）——`_lhMk/_lhMkBtn/_lhMkBlock` 在 `js/sections.js:619-636`；`_lhMapSwitchRow` 在 `js/rhyme-map.js:251-257`：
```javascript
function _lhMapSwitchRow(key, label) {
    const b = _lhMkBtn('rm-switch', '');
    b.setAttribute('role', 'switch');
    b.dataset.k = key;
    b.append(_lhMk('span', 'rm-switch-label', label), _lhMk('span', 'rm-pill', ''));
    return b;
}
```
說明文字掛 `aria-describedby`（`:269-276` 模式：hint 節點給 id，開關 `setAttribute('aria-describedby', id)`）。寬韻/嚴格是 `role="radiogroup"` 的 `.type-row` 按鈕（`:279-287`）。

**8. 選單同步**（`:348-363`）——改成同時處理 `#rhymeMenu` 與 `#mapSettingsSection` 兩處（`document.querySelectorAll('#rhymeMenu .rm-switch, #mapSettingsSection .rm-switch')`）。現況只查 `_lhMapMenu.querySelectorAll`：
```javascript
_lhMapMenu.querySelectorAll('.rm-switch').forEach(b => {
    const on = !!_lhMapSet[b.dataset.k];
    b.setAttribute('aria-checked', String(on));
    b.querySelector('.rm-pill').textContent = on ? '開' : '關';
});
```
注意 `if (!_lhMapMenu) return;`（`:349`）會讓偏好區塊在選單從未打開時不同步，要改。

**9. 「更多設定…」+ 關閉所有浮層**（`:419-424`）——`lhMapCloseAll` 增加 `lhMapHideAnalysis()`；`lhMapHideBar` 同時收面板；`lhMapOpenPrefs` 直接用 RESEARCH Code Examples（不要呼叫 `toggleSettings`，X8）。`lhMapCloseAll` 現況：
```javascript
function lhMapCloseAll() {
    lhMapCloseMenu(false);
    lhMapHideBar();
    lhMapCloseStats(false);
}
```

**10. 浮動列加「📏 分析」按鈕與面板**（`:629-670`）——照 `look`/`ai` 兩顆的建法：
```javascript
const icon = t => { const s = _lhMk('span', '', t); s.setAttribute('aria-hidden', 'true'); return s; };
const ai = _lhMkBtn('section-menu-btn rm-bar-ai', '');
ai.append(icon('✨'), _lhMk('span', '', ' AI 建議'));
// ...
bar.append(look, ai, rd, row);
for (const t of ['pointerdown', 'mousedown']) bar.addEventListener(t, e => e.preventDefault());   // 不搶走輸入框焦點/選取
ai.addEventListener('click', e => lhMapLookup(_lhMapBarSnap && _lhMapBarSnap.char, true, e.detail === 0));
```
新增 `an` 按鈕（`rm-bar-an`）與面板節點（`#rhymeAnalysis`）掛 `document.body`；`click` handler 用 `e.detail === 0` 判斷鍵盤觸發（鍵盤才搬焦點）。方向鍵循環（`:660-666`）過濾 `b.offsetParent !== null`，面板內不放 `button` 以免干擾；若放，要改過濾。

**11. 浮動列顯示條件**（`:734-752`）——X6/Pitfall 6：現在 `chars.length > LH_MAP_SEL_MAX` 與 `!han.length` 直接 `lhMapHideBar()`；改成「決定按鈕組合」：碰到任一 `lhCountWords > 0` 的行才顯示；≤20 字且含漢字 → 三顆（加指定讀音）；否則只有「📏 分析」。現況：
```javascript
const text = ta.value.slice(a, b);
const chars = Array.from(text);
if (chars.length > LH_MAP_SEL_MAX) return lhMapHideBar();
const han = chars.filter(c => LH_MAP_HAN.test(c));
if (!han.length) return lhMapHideBar();
const end = b - (text.length - text.trimEnd().length);
lhMapShowBar({ ta, secId: ..., a, b, end, char: han[han.length - 1], rd: _lhMapReadingTarget(ta, a, text, han[han.length - 1]) });
```
`busy` 守門（`:739`，含 `_lhComposing`、`_lhMapMenuOn`）保留，C5 組字中不出現浮層即靠它。

**12. 面板定位**——重用 `_lhMapBarPlace`（`:685-701`）的 `lhMirror`/`lhCaretRect`（`js/word-drag.js:23,92`）+ `lhPlaceMenu`（`js/ui-common.js`）；`finally { m.remove(); }` 的鏡像清理寫法要保留，且 hover 區域 `snap.zone` 與定位用同一次鏡像量完（不要建第二個）。

**13. 錯誤處理慣例**（`:748-751`）：
```javascript
} catch (e) {
    lhWarn('韻腳地圖選字列失敗', e);
    lhMapHideBar();
}
```
新增函式的 `catch` 一律 `lhWarn(中文訊息, e)`（`tests/scan*` 靜態掃描會檢查）。

**14. Dwell**——貼 RESEARCH Pattern 6；`pointermove` 以 capture 註冊（與 `:431` 的 `pointerdown` capture 同風格）；`keydown` Esc 處理沿用 `:434-435` 的 `e.isComposing || e.keyCode === 229` 守門。

---

### `js/safety.js`（修改：`lh:map` 匯入）(config/驗證, CRUD)

**Analog:** 自身 `:552-556`

```javascript
if (key === 'lh:map') {   // 韻腳地圖設定：只收五個鍵的真布林…，再重新序列化（T-10-07）
    try { return JSON.stringify(lhRhymeNormalizeSettings(JSON.parse(v))); }
    catch (e) { lhWarn('備份檔裡的韻腳地圖設定不是合法 JSON，略過', e); return undefined; }
}
```
**要做的**：`JSON.stringify(lhRhymeNormalizeSettings(...))` → `lhRhymeSerialize(JSON.parse(v))`（RESEARCH Pattern 4 第三個呼叫點）。更新註解「五個鍵」字樣。`catch` 與 `lhWarn` 原樣保留。`LH_SETTING_SHAPES[key]` 形狀檢查（`:545` 上一行）若對 `lh:map` 有 regex，要確認允許新鍵（grep 該表）。

---

### `index.html`（修改）(config)

**Analog:** `index.html:198`
```html
<details class="settings-backups" id="autoBackupSection"><summary onclick="renderAutoBackups()">自動備份</summary><p class="settings-backups-hint">...</p><ul id="autoBackupList" role="list"></ul></details>
```
**要做的**：在其後、「✉️ 意見回饋」前放靜態殼 `<details class="settings-backups" id="mapSettingsSection"><summary>韻腳地圖與句構分析</summary></details>`；內容由 `rhyme-map.js` 第一次 `toggle` 時用 `_lhMk*` 建（不是 inline HTML）。另：加 `<script src="js/line-core.js?v=0.96.15">`（在 `rhyme-core.js` 之後）；所有 `?v=0.96.14` 升到 `0.96.15`（RESEARCH 估 11 個標籤）。

---

### `js/search-ui.js`（選用，X7）(component, event-driven)

**Analog:** 自身（Esc 不存在，補一個）
```javascript
function toggleSettings() {
    const overlay = document.getElementById('settingsOverlay');
    overlay.classList.toggle('show');
    if (overlay.classList.contains('show')) renderLexiconPackList();   // 每次打開都重畫詞庫包清單
}
function closeSettingsOverlay(event) {
    if (event.target === event.currentTarget) document.getElementById('settingsOverlay').classList.remove('show');
}
```
Esc 關閉參考 `rhyme-map.js:434-435` 的 keydown 守門寫法；`<input type=color>` 彈窗開著時不要關。

---

### `css/panels.css`（修改）(config)

**Analog:** 自身

- **`.rm-hl`/`.rm-sw` 三處硬編碼 34%/17% 改 `var(--rm-end, 34%)`/`var(--rm-orph, 17%)`**：現況 `:370-379`（`.rm-sw`）、`:1634-1640`（`.rm-hl` 與 `.rm-solo`）：
  ```css
  .rm-hl.rm-solo { background: color-mix(in srgb, var(--rm-c) 17%, var(--card-bg)); }
  .rm-hl.rm-manual { border-bottom: 0.125rem dotted var(--text-secondary); }   /* 只有下緣，不改水平盒子，換行不受影響 */
  ```
  `@supports not (color-mix…)` 後備（`:1642-1645`，固定 `opacity`）保留。
- **新規則**（`.lm-mk`、`html[data-lm=…]`、`.lm-t`、`#rhymeAnalysis`、`.lm-preview`）：貼 RESEARCH Pattern 8 的 CSS 區塊。色碼不進 CSS（style.spec），全用 `var(--…)`。
- **開關列**沿用 `.rm-switch`（`:325`、`[aria-checked="true"] .rm-pill` `:351`、hover `:383` 只給滑鼠）；浮動列 `.word-ctx-menu.rm-bar`（`:386-387`，`display:flex; flex-wrap:wrap`）三顆按鈕自然換行。
- **預覽容器**需覆寫 `.rhyme-mirror` 基底規則（`:1613-1629`：`position:absolute; display:none; color:transparent; overflow:hidden`）。
- 手機/觸控 ≥44px：`css/responsive.css` / `panels.css:1808` `.rm-switch { min-height: var(--hit); }` 同模式，用於新增 `.rm-bar-an`、色票 `input[type=color]`、分析面板列。

---

### `tests/line-core.spec.mjs`（new）(test, transform)

**Analog:** `tests/rhyme-core.spec.mjs:1-30`
```javascript
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { loadCore } from './node-core.mjs';
const { ctx, ev: run } = loadCore();
ctx.performance = performance;
const ev = code => { const v = run(code); return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); };
const j = v => JSON.stringify(v);
const reset = () => run('wordPhoneticMap = new Map()');
const F = { AABB: '我望著遠方的光\n...', ... };   // 固定歌詞範例
```
用 `run('wordPhoneticMap = new Map([...])')` 塞 RESEARCH Pattern 2 表格的 mini 詞表；斷言表中每一列（n、groups、顯示字串、略過）；加總恆等式用固定集。注意：`loadCore()` 的 `CORE`（`tests/node-core.mjs:6`）要加 `js/sections-core.js`（`_LH_WC_RE`）與 `js/line-core.js`，且順序在 `rhyme-core.js` 後；`lhCountWords` 若原本不在 CORE 內要確認載入不依賴 DOM。

### `tests/line-analysis-ui.spec.mjs`（new）(test, event-driven)

**Analog:** `tests/rhyme-map-ui.spec.mjs:1-30`
```javascript
import { bootPage, compose, openTwoTabs, activeSongRaw } from './helpers.mjs';
const v2Storage = (songs, extra = OPEN_PANELS) => ({ ...FIXTURE, 'lh:schema': '2', 'lh:songs': JSON.stringify(songs), 'lh:activeSong': songs[0].id, ...extra });
const typed = (id, type, text, extra = {}) => ({ id, type, custom: '', color: '', height: null, label: '', text, collapsed: false, ...extra });
const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: v2Storage([song([...])]) });
```
設定預置：在 `storage` 加 `'lh:map': JSON.stringify({...})`。程式化選取沿用該檔 `pick()`（`setSelectionRange`）再 `dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))`；hover 1.5 秒用 `beforeGoto: ({ page }) => page.clock.install()`（需確認 `bootPage` 支援）。換行不變測試骨架見 RESEARCH Code Examples（含半形/全形/tab 行尾空白、寬度 330–1500、兩種 `data-lm`、有無 15px 捲軸，沿用 `layout-lib.mjs` 的 `launchWithBars`/`injectScrollbar`）。`errors` 陣列要斷言無 `ResizeObserver`。

### `tests/rhyme-map-ui.spec.mjs`（既有測試修改）

需改寫（Pitfall 6）：`:896-934` 浮動列「這些情況不出現」（`abc`、21 字不再隱藏）；審視 `:1003`（方向鍵循環）、`:1103`（長按選字）、`:1136`（觸控 ≥44）、`:1154`（超長段落不量版面）。**不需改**：`MAP_DEFAULT` 等字串相等斷言（`:630,:640-643,:670,:672,:704,:1514`、`rhyme-audit.spec.mjs:22-23,450`、`rhyme-journey.spec.mjs:223`）——前提是 `lhRhymeSerialize` 最小序列化確實使舊五鍵輸出逐字相同。

## Shared Patterns

### 節點建構（一律 textContent，不用 innerHTML）
**Source:** `js/sections.js:619-636`（`_lhMk`、`_lhMkBtn`、`_lhMkBlock`）
**Apply to:** 分析面板、偏好設定區塊、預覽、色票格
```javascript
function _lhMk(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }
function _lhMkBtn(cls, text, label) { const b = _lhMk('button', cls, text); b.type = 'button'; if (label) b.setAttribute('aria-label', label); return b; }
```

### 浮層放置與關閉
**Source:** `js/rhyme-map.js:419-424`（`lhMapCloseAll`）、`:384-391`（`lhPlaceMenu` 用法）、`:430-436`（pointerdown capture 外點關閉、Esc）
**Apply to:** `#rhymeAnalysis` 面板、dwell 自動出現的面板（同時只開一個；捲動/Esc/點別處收起）

### 組字守門
**Source:** `js/rhyme-map.js:168`（`_lhComposing` 不排程）、`:179`（flush 內再檢）、`:739`（`busy`）
**Apply to:** marker 建構、分析面板、dwell 計時（`compositionstart` 取消）。組字中鏡像零 childList 突變（Pitfall 8）；只允許切 class（`lm-typing`）。

### 錯誤處理
**Source:** `js/rhyme-map.js:748-751`、`js/safety.js:553-556`
`catch (e) { lhWarn('中文訊息', e); 安全預設 }`；不直接碰 localStorage，一律 `lhSet`/`lhGetJSON`（Node 測試 stub 在 `tests/node-core.mjs:13-17`）。

### 設定持久化與驗證單一入口
**Source:** `js/rhyme-core.js:16-24` → 擴充後的 `lhRhymeNormalizeSettings` + `lhRhymeSerialize`
**Apply to:** `lhMapSetSetting`、`lhMapSetColor`、`storage` 事件、`safety.js` 匯入。`lh:map` 已登記於 `LH_KEYS`（`js/safety.js:8-31`），不需新增鍵。沒碰過設定不寫 `lh:map`（Phase 10 既有測試）。

### 版號與腳本順序
**Source:** `tests/split-tags.spec.mjs:8`（`JS_ORDER`）、`:56,:63`（斷言 28 個 js 依序）
**Apply to:** 新增 `line-core.js` 後 `JS_ORDER` 加一項、`:63` 的「完整 28 個」描述/數量同步、`?v=0.96.15`。

## No Analog Found

| File / 功能 | Role | Data Flow | Reason |
|-------------|------|-----------|--------|
| hover 停留 1.5 秒偵測（`pointermove` 起算、取消條件） | event handler | event-driven | 專案沒有 dwell/timer-on-pointer 先例；用 RESEARCH Pattern 6 的設計，風格對齊 `_lhMapBarTimer`（`rhyme-map.js:735,673` 的 `clearTimeout` 慣例）|
| 絕對定位 marker `span.lm-mk`（靜態位置落行尾） | rendering | transform | 鏡像層目前只有 inline `span.rm-hl`；用 RESEARCH Pattern 1 實測方案，Safari/Firefox 待實機（A1）|
| 色彩對比提醒（WCAG） | utility | transform | 僅有測試內 `mixHex`/`contrastOf`（`tests/rhyme-core.spec.mjs:217-224`），正式碼沒有；公式照抄，探針元素取 `rgb()`（Pitfall 11）|
| `<input type="color">` 偏好設定格 | component | event-driven | 近似：Phase 9 `.section-color-input`（`js/sections.js:653` 附近）：`input` 預覽、`change` 才存 |

## Metadata

**Analog search scope:** `js/`、`css/panels.css`、`index.html`、`tests/`
**Files scanned:** rhyme-core.js（前 36 行）、rhyme-map.js（1-110、166-195、248-290、346-435、627-755）、sections-core.js（90-101）、sections.js（612-640）、safety.js（545-560）、search-ui.js（36-45、96-106）、node-core.mjs、rhyme-core.spec.mjs（1-30）、rhyme-map-ui.spec.mjs（1-30）、Phase 10 PATTERNS（格式）
**Pattern extraction date:** 2026-10-28
**備註：** 未逐行讀取 `css/panels.css`、`css/responsive.css`、`js/word-drag.js`、`js/ui-common.js`、`js/songs.js`；其行號來自 RESEARCH 引用與 grep，實作前請以 grep 重新確認。
