# Phase 5: Multi-Device Layout 多裝置版面與流暢度 - Research

**Researched:** 2026-10-04
**Domain:** Vanilla HTML/CSS/JS responsive layout, root-font-size UI scaling, progressive DOM rendering, mobile keyboard/viewport handling, Playwright visual + performance testing
**Confidence:** HIGH for measured in-repo findings (all numbers below were measured this session with Playwright 1.63.0 / chromium-1243 against the current branch `gsd/v0.96-stabilize`); MEDIUM for iOS/Android real-device behaviour (emulation only)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**縮放（PERF-01）**
- 現行縮放用 CSS `zoom` 套在結果區（js/search-ui.js zoomIn/zoomOut，MzoomScale 50–150%，MzoomBaseRatio）→ 改為根字級／CSS 變數 `--ui-scale` 驅動（rem 尺寸），不再用 `zoom`
- 保留現有放大／縮小按鈕與百分比顯示，範圍維持（研究確認 50–150% 是否合理），設定存既有 registry 鍵或新增 `lh:` 鍵（需登記到 safety.js registry）
- 預設 100% 必須與目前畫面視覺一致（golden 不受影響；版面截圖比對以「目前版本」為基準）

**分批渲染（PERF-02）**
- 字卡以分批（requestAnimationFrame／分段 append）渲染；首批立即出現、其餘陸續補上；不可改變最終 DOM 結果（golden 必須等全部渲染完成再比對 → 提供「渲染完成」訊號）
- 不引入虛擬清單函式庫；必要時用 `content-visibility: auto`

**三種裝置版面（UI-01、UI-02）**
- 斷點沿用現有 900px／440px，研究評估平板（768–1024）是否需要獨立調整
- 手機：側邊面板改為可收合抽屜／底部區塊，確保查韻、寫詞、AI 建議三個主流程都能點到；觸控目標至少 44px
- 晝夜模式與客製顏色走既有 CSS 變數，不新增色系

**手機輸入（UI-03）**
- 所有 input／textarea 在手機斷點字級 ≥ 16px（避免 iOS 自動放大）；viewport 加 `viewport-fit=cover`、使用 `dvh`／`visualViewport` 讓輸入框在鍵盤彈出時捲到可見
- 不使用 `maximum-scale=1`／`user-scalable=no`（保留使用者縮放，無障礙）

**測試**
- Playwright 多 viewport（手機 390×844、平板 820×1180、桌機 1440×900）跑主流程腳本＋元素不超出視窗檢查＋可點擊檢查
- 多縮放值（50%、100%、150%）檢查貼邊元素在視窗內
- 截圖比對：晝夜模式 × 三種 viewport 建立基準截圖（toHaveScreenshot），基準拍攝於本 phase 改版完成時；改版前先拍一組「現況」供 Andy 對照
- CPU 降速（CDP Emulation.setCPUThrottlingRate 4–6×）量測長任務

### Claude's Discretion
- 抽屜／底部區塊的細節互動、動畫、圖示
- 分批大小與時間切片數值

### Deferred Ideas (OUT OF SCOPE)
- 歌詞編輯器重做、多首歌側邊分頁 → Phase 8
- 段落拖曳模組 → Phase 9
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PERF-01 | 修正 UI 縮放 bug：預設 100% 正確、放大時靠近邊框內容不被吃掉（以根字級縮放取代 CSS `zoom`） | Root cause measured (section "Q1"); px→rem migration plan with computed-style parity gate; `lh:uiScale` registry impact (scan.spec 16→17) |
| PERF-02 | 首次搜尋與大量字卡不卡頓：結果分批渲染 | Card counts, per-phase cost, 3 prototypes measured at 6× CPU; lazy `createCharCard` batching required; golden-safe design; render-complete signal |
| UI-01 | 電腦、平板、手機三種版面都可完整使用（查韻、寫詞、AI 建議） | Layout audit: L side-panel content clipped 86–100px, landscape phone results unreachable, banner covers controls, touch-target inventory |
| UI-02 | 視覺一致、美觀，保留晝夜模式與客製顏色 | Dark/custom screenshots reviewed; screenshot determinism proven; baseline strategy |
| UI-03 | 行動端輸入不被虛擬鍵盤遮擋、不觸發自動放大 | Font-size inventory (7 of 8 controls < 16px on phone), viewport meta, keyboard emulation by viewport shrink, device limits |
</phase_requirements>

## Summary

The zoom bug is not mysterious: `zoomIn()/zoomOut()` write `style.zoom` on `.container` (`resultsSection` is just an alias of `.container`, js/theme.js:50-51). Chromium multiplies every length inside the zoomed box, including `height: calc(100vh - 40px)`, so the container becomes `zoom ×` taller than the viewport. Measured at 150%: container bottom is 1314 px on a 900 px desktop viewport (1260 on 844 phone, 1734 on 1180 tablet) and the page itself starts to scroll. At 100% the desktop and tablet are clean in steady state, but the phone is already 28 px too tall (`document.scrollHeight` 872 vs 844) because `.container { height: calc(100vh - 20px) }` is paired with 24 px body padding. Because the container is sized to exactly fill the viewport, any increase pushes bottom/edge content out: this matches Andy's "100% already has an offset; one step up eats the edges".

Beyond zoom, the audit found real defects the UI-SPEC already targets and that this research confirms with numbers: (1) on desktop (901–~1710 px wide) the expanded side panels are translated off-screen by `syncCenterPanel()` so 86–100 px of the panel content is clipped (lyrics header, textarea, AI model select, `押字首`, generate button), (2) landscape phone 844×390 makes the results region unreachable (results start at y=344 of a 390 px viewport, container is `overflow:hidden`, page cannot scroll), (3) the save banner covers search input / batch buttons / about button on phone and about button on tablet, (4) 7 of 8 text controls on a 390 px phone are below 16 px (only `#searchInput` is 16 px) and `#searchInput` is 15.2 px on tablet and phone-landscape, (5) dozens of touch targets are < 44 px.

For rendering, current cost is modest on this machine but scales linearly: default queries give 356–689 cards (golden max 689), `隱藏冷僻字` off gives up to 1633. At 6× CPU throttle the worst single query produces two long tasks of 154 + 383 ms (LoAF blocking 465 ms). Batching only the DOM insertion is NOT enough (first task stays 160–180 ms because the HTML string for all cards is built up front); batching the `createCharCard()` calls too brings the max long task to 64–109 ms. Golden hashes `#resultsContainer.innerHTML` (whitespace-normalised), so CSS-only work cannot break it and progressive rendering is safe if the final DOM is identical and tests wait for a render-complete signal.

**Primary recommendation:** Do the work in the order the UI-SPEC already defines (Pass A mechanical px→rem + `--ui-scale`, proven by a computed-style parity gate captured BEFORE touching CSS; then Pass B layout/keyboard/touch; progressive render last), but build progressive rendering as "skeleton first, then create cards lazily in 48–96-card slices" (not "build the whole string, then slice the DOM"), and make `tests/helpers.mjs` `settle()` wait for `#resultsContainer[data-render]` to be `idle|done` so every existing spec (golden included) is automatically safe.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| UI scale (`--ui-scale`, root font-size) | Browser / Client (CSS custom property on `<html>`) | Browser storage (`lh:uiScale` via safety.js) | Pure presentation; must apply before first paint (script in `<head>`) |
| Breakpoints, panel/sheet layout, touch floors | Browser / Client (CSS media queries) | Client JS (`matchMedia` change listeners) | Media queries read physical viewport px, unaffected by root font-size |
| Keyboard avoidance | Browser / Client (`visualViewport`, `dvh`, `interactive-widget`) | — | Only the browser knows viewport vs keyboard; iOS needs JS |
| Progressive card rendering | Browser / Client (JS in js/results.js, js/cards.js) | — | No server involvement; DOM batching on main thread |
| Save-failure banner | Browser / Client (js/safety.js DOM + css/base.css) | — | Existing client-only safety layer |
| Visual / perf regression tests | Test runner (Playwright, local) | Static test server `tests/serve.mjs` | CI-less local runs on macOS only |
| Static hosting / fonts | CDN / Static (GitHub Pages, Google Fonts) | — | Unchanged; fonts mocked in tests |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| (none new) vanilla CSS custom properties + rem | — | `--ui-scale` driving `html { font-size: calc(100% * var(--ui-scale)) }` | CONTEXT locks "no zoom, rem-driven"; no build step allowed |
| `@playwright/test` | 1.63.0 [VERIFIED: package.json devDependencies `"@playwright/test": "1.63.0"`; `npx playwright --version` → `Version 1.63.0`] | Layout, visual (`toHaveScreenshot`), perf (CDP) specs | Already the project's only test runner (277 tests pass in 1.1 min, measured) |
| Chromium | chromium-1243 [VERIFIED: `ls ~/Library/Caches/ms-playwright`] | Emulation (`isMobile`, `hasTouch`) and CDP throttling | Installed |

### Supporting
| API | Purpose | When to Use |
|-----|---------|-------------|
| `window.visualViewport` (resize/scroll) | iOS keyboard detection (layout viewport does not shrink) | `js/layout.js` keyboard model |
| `PerformanceObserver({type:'longtask'})` and `'long-animation-frame'` | Long-task / blocking measurement in perf spec | perf.spec; both worked in chromium-1243 (measured) |
| CDP `Emulation.setCPUThrottlingRate` | 4–6× CPU | perf.spec via `context.newCDPSession(page)` (measured working) |
| `matchMedia('(pointer: coarse)')` | Touch floors | Verified: Playwright `isMobile+hasTouch` contexts report `coarse:true, fine:false, hover:false`; desktop reports `coarse:false, fine:true, hover:true` (measured) |
| `100dvh` | Viewport height excluding browser chrome | `CSS.supports('height','100dvh')` is true in test chromium; keep `100vh` fallback via `@supports not` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| rem migration of ~320 px values | Keep `zoom` on `<html>` | Violates locked decision; also leaves `vh` interplay. Not an option. |
| Lazy per-slice `createCharCard` | `content-visibility:auto` only | Does not reduce the up-front string build/parse (first long task); intrinsic-size jumpiness in a flowing grid. Keep as optional follow-up only if Wave 0 measurement still misses budget [ASSUMED: not measured]. |
| `scheduler.yield()` / `scheduler.postTask` | `requestAnimationFrame` slices | Safari lacks `scheduler.yield` [ASSUMED]; rAF works everywhere. Use rAF + hidden-tab flush. |

**Installation:** none. No new package, CDN asset, font family or icon set (UI-SPEC "Registry Safety" agrees).

## Package Legitimacy Audit

No external packages are installed by this phase. `@playwright/test` 1.63.0 is already pinned in `package.json`. Package Legitimacy Gate: not applicable (no `npm install`).

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
 user input (typing / tap / +,- button)
        |
        v
 [layout.js (head, sync)] --reads--> lhGet('lh:uiScale') --> clamp 50..150 step 5
        |                                   |
        |  sets --ui-scale on <html>        +--> html { font-size: calc(100% * var(--ui-scale)) }
        v                                         |
 every rem length in css/base|panels|responsive  <+   (media queries stay physical px; JS lhIsPhone/lhIsSheetMode via matchMedia)
        |
 search input --> _handleSearch --> searchRhyme --> displayResults(results)
                                                       |
                       sync: header + group titles + EMPTY .results-grid skeletons ; data-render="first"
                                                       |
                       jobs[] = per-grid item lists (document order)
                                                       |
                  rAF slice loop (epoch-checked) --createCharCard(item) x48..96--> grid.insertAdjacentHTML('beforeend')
                                                       |
                       data-render="more" ... "done"  --> window 'lh:render-done'
        |
 focusin on text field --> visualViewport resize --> html.kb-open, --app-h/--kb-inset --> sheet/tab-bar/overlay re-layout
        |
 lhSaveFailed(kind) --> #lhSaveBanner (in-flow first child of .container)   (spec D-05)
```

### Recommended Project Structure
```
js/layout.js        # NEW, in <head> right after safety.js: setUiScale, lhIsPhone/lhIsSheetMode, matchMedia listeners, keyboard model
css/base.css        # :root tokens (--ui-scale, --app-h, --page-pad, --hit...), html font-size, banner rules moved here
css/panels.css      # side panels: L push panels in @media (min-width: 901px); sheets in responsive.css
css/responsive.css  # <=900 sheets, <=440 compact
tests/layout.spec.mjs  tests/visual.spec.mjs  tests/perf.spec.mjs   # NEW
tests/helpers.mjs   # bootPage gets viewport/isMobile/hasTouch/colorScheme options; settle() waits for render idle
```

### Pattern 1: `--ui-scale` (UI-SPEC section 3 is correct; implementation shape)
```javascript
// js/layout.js — classic script (no modules; tests/split-tags forbids defer/async/module)
const LH_UI_SCALE_KEY = 'lh:uiScale';
function setUiScale(pct, save = true) {
    let n = Math.round(Number(pct) / 5) * 5;           // NaN stays NaN
    if (!Number.isFinite(n)) n = 100;                  // tampered localStorage value -> default
    n = Math.min(150, Math.max(50, n));
    document.documentElement.style.setProperty('--ui-scale', String(n / 100));   // numeric only: no CSS injection
    const v = document.getElementById('MzoomValue'); if (v) v.textContent = n + '%';
    if (save) lhSet(LH_UI_SCALE_KEY, String(n));
    return n;
}
// before first paint (script is in <head>): setUiScale(lhGet(LH_UI_SCALE_KEY) ?? 100, false)
```
Source of the shape: current code being replaced is js/search-ui.js:17-27 (`MzoomScale = Math.min(MzoomScale + 5, 150); // 最大放大到 150%` / `resultsSection.style.zoom = MzoomScale / 100 * MzoomBaseRatio;`). `#MzoomValue` does not exist at head time: apply the variable immediately, update the label on `DOMContentLoaded`.

### Pattern 2: Skeleton + lazy slices (recommended progressive render)
**What:** `displayResults` keeps ALL its existing filtering/sorting/grouping and the exact group templates, but each `${group.map(item => createCharCard(...)).join('')}` becomes an empty `<div class="results-grid"></div>` plus a pushed job `{items, hl}`. After `container.innerHTML = header + content` (synchronous: header, group titles, empty grids), a rAF loop walks `container.querySelectorAll('.results-grid')` in order (index i = job i), calls `createCharCard` for the next K items and `grid.insertAdjacentHTML('beforeend', html)`.
**Why this and not "build the string then slice DOM":** prototype A (full string up front, DOM inserted in slices) leaves the first long task at 160–180 ms for 1633 cards at 6×; prototype B (cards created lazily) gives max long task 64–109 ms (measured, table below). It also keeps `createCharCard` call order identical to today, which matters because it reads/writes globals (see Pitfall 3).
**Golden safety:** card strings start and end with whitespace; normalised by `replace(/\s+/g,' ')` the inner HTML of a grid is identical whether it was one template or N `insertAdjacentHTML` calls (adjacent whitespace text nodes serialise concatenated). Do NOT add attributes/classes/data-* to the skeleton grids (they would change `innerHTML`); index order is the mapping.
```javascript
// sketch — js/results.js
let _renderEpoch = 0;
const FIRST_BATCH = 48, SLICE = 64;          // see "batch size" below
function _renderJobs(container, jobs, epoch) {
    const grids = container.querySelectorAll('.results-grid');
    let g = 0, i = 0, done = 0, total = jobs.reduce((n, j) => n + j.items.length, 0);
    container.dataset.render = 'first';
    const slice = (budget) => {
        if (epoch !== _renderEpoch) return;                         // superseded: stop, append nothing
        let n = 0;
        while (g < jobs.length && n < budget) {
            const j = jobs[g], take = Math.min(budget - n, j.items.length - i);
            grids[g].insertAdjacentHTML('beforeend', j.items.slice(i, i + take).map(it => createCharCard(it, j.showPinyin, j.hl)).join(''));
            i += take; n += take; done += take;
            if (i >= j.items.length) { g++; i = 0; }
        }
        if (done < total) { container.dataset.render = 'more'; (document.hidden ? setTimeout : requestAnimationFrame)(() => slice(SLICE)); }
        else { container.dataset.render = 'done'; window.dispatchEvent(new Event('lh:render-done')); }
    };
    slice(FIRST_BATCH);                                             // first batch synchronous
}
```
(`createCharCard` signature in the repo is `createCharCard(item, showPinyin, highlightTarget)` — js/cards.js:6.)

### Pattern 3: Test-side render-complete wait
```javascript
// tests/helpers.mjs — one-line change protects golden + every spec that uses settle()
export function settle(page) {
    return page.evaluate(() => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))))
        .then(() => page.waitForFunction(() => {
            const s = document.getElementById('resultsContainer')?.dataset.render;
            return !s || s === 'idle' || s === 'done';
        }));
}
```
All early-return branches of `displayResults` (empty-state, "沒有找到結果") must set `data-render="idle"`, otherwise this wait would hang on a stale `more`.

### Anti-Patterns to Avoid
- **px values mixed with rem inside one component** at scale ≠ 1 (padding stays 12 px while text grows): convert spacing together with type, otherwise "zoom" looks lopsided.
- **`transform`/`filter`/`contain`/`content-visibility` on `.container` or its ancestors**: `#settingsOverlay`/`#aboutOverlay` are `position:fixed` children inside `.container` (index.html:135,145) and would be re-anchored/clipped. The existing `slideIn` animation (transform) already does this for 0.5 s after load, so screenshots must wait/disable animations.
- **Using `window.innerWidth <= 900` once at load** (`phone` in js/cards.js:1, js/ui-common.js:60, js/init.js:22): rotation leaves state stale (UI-SPEC defect 3).
- **Batching only DOM insertion** while still building every card's HTML up front (see Pattern 2).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Keyboard height detection | UA sniffing / fixed keyboard heights | `visualViewport` + `stableH − vv.height ≥ 150` (UI-SPEC D-09) | iOS keyboard shrinks only the visual viewport [CITED: bram.us/2026/09/11/webkit-supports-interactive-widget-and-hopefully-safari-will-too — "on iOS Safari, the keyboard shrinks the visual viewport but not the layout viewport"] |
| Hidden-panel focus blocking | focus-trap library / tabindex juggling | `inert` attribute (UI-SPEC D-17) | Native; also stops hidden textareas opening the keyboard |
| Pixel diffing | custom canvas comparison | `expect(page).toHaveScreenshot()` (pixelmatch inside Playwright) | Already available |
| Long-task measurement | custom timers | `PerformanceObserver` longtask + long-animation-frame | Includes layout/paint that JS timers miss (measured: JS timers under-report; longtask 383 ms vs JS-visible ~100 ms) |
| Virtual scrolling | list virtualisation lib | slice rendering (+ optional `content-visibility`) | CONTEXT forbids libraries; max 1633 cards is small |
| px→rem conversion | hand editing ~320 values | one throwaway script limited to whitelisted properties + a computed-style parity test | Mechanical, verifiable |

**Key insight:** every hard part here already has a native answer (custom properties, `dvh`, `inert`, `visualViewport`, `toHaveScreenshot`). The risk is in verification, not in building.

## Runtime State Inventory

Not a rename/refactor-by-string phase. One piece of persisted state is added/changed:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | New key `lh:uiScale` (localStorage). No existing key is renamed. Existing `leftPanelCollapsed`/`rightPanelCollapsed` keep meaning. | Code edit: register in `LH_KEYS`; tolerate absent/garbage value (default 100). No data migration. |
| Live service config | None — verified: no server-side dependency touched | None |
| OS-registered state | None | None |
| Secrets/env vars | None | None |
| Build artifacts | `.planning/.../baseline-before/` PNGs and `tests/visual.spec.mjs-snapshots/` PNGs become new tracked artifacts; `?v=0.96.6` cache-bust query on every css/js tag must be bumped when js/css behaviour changes (precedent: commit b8eca20 bumped 0.96.5→0.96.6) | Bump `?v=` once at phase end (split-tags.spec requires one shared version) |

## Common Pitfalls

### Pitfall 1: Golden silently invalidated by markup, not CSS
**What goes wrong:** Golden stores `htmlSha1` of `resultsContainer.innerHTML` after whitespace normalisation, group titles' `innerHTML`, card rows, header text, chips, and `#aiRhymeDisplay` text. Quoted verbatim [VERIFIED: tests/golden.spec.mjs:70-89, 91-95]:
```
const root = document.getElementById('resultsContainer');
const rowOf = c => `${c.dataset.char}|${c.dataset.key}|${(c.querySelector('.mark-badge')?.textContent ?? '').trim()}`;
...
html: root.innerHTML,
...
const htmlSha1 = createHash('sha1').update(html.replace(/\s+/g, ' ').trim()).digest('hex');
```
Computed styles, class names on ancestors (`#resultsContainer` own attributes, `.results-section`, `.container`), and `data-render`/`aria-busy` on the container itself are NOT in `innerHTML`. So: all CSS changes, attribute additions on `#resultsContainer`, tab bar, panels are safe. Anything changed INSIDE the container (card classes, `.mark-badge` text, `.results-header` markup, `.group-title` markup, a status row) changes the hash. The UI-SPEC's status row ("載入中… 已顯示 n / N 字" as last child of `#resultsContainer`) is only safe because it is removed at `done` and golden waits for `done`.
**How to avoid:** Do not touch card/group/header markup in this phase (touch sizes via CSS only: `min-height`, `::after`). Golden then needs NO re-baseline. If a markup change is ever unavoidable, re-baseline deliberately with `npm run golden:update` and review the JSON diff (do not mix with other changes).
**Warning signs:** `htmlSha1` mismatch only; `rows`/`groups` still equal means whitespace/attribute-level change.

### Pitfall 2: `settle()` is not a render-complete signal
Golden calls `page.fill` → `settle(page)` (rAF + `setTimeout 0`, tests/helpers.mjs:108-110) → `capture`, and again after each mode-button/chip click. With slices, capture would run at `first`/`more` and hash/count partial DOM. Fix in `settle()` (Pattern 3). Other specs only assert presence (`.results-count` text, `.char-card` count > 0 — error-visibility.spec.mjs:22-23, storage.spec.mjs:39-40) and pass at the synchronous first batch.

### Pitfall 3: Order-dependent globals in `createCharCard`
`colorClass` is an implicit global (assigned at js/cards.js:36 and 73, never declared — grep for `let/var colorClass` finds nothing) and `lastTarget` is `let lastTarget = ''` (js/state.js:43). A card's highlight class depends on the previous card's state, and state persists across searches. Lazy slices must call `createCharCard` strictly in document order within one pass; a cancelled pass leaves these mutated. Golden is unaffected (fresh page per case, waits for done), but never run two passes interleaved and never reorder jobs.

### Pitfall 4: Test infrastructure asserts that WILL break (update them in the same plan)
- `tests/scan.spec.mjs:69` `expect(keys).toHaveLength(16);` (and the `new Set(keys).size).toBe(16)` below it) → 17 after registering `lh:uiScale`. [VERIFIED: grep output `tests/scan.spec.mjs:69:    expect(keys).toHaveLength(16);`]
- `tests/split-tags.spec.mjs:7-11` JS order list and `js[0]` must be `js/safety.js`: adding `js/layout.js` to `<head>` requires adding `'layout'` to the expected list/position. [VERIFIED: file read — `expect(js[0]).toBe('js/safety.js'); const rest = js.slice(1); expect(rest).toEqual(JS_ORDER.slice(0, rest.length));`]
- `tests/split-tags.spec.mjs:85-89` asserts `text.startsWith("@import url('https://fonts.googleapis.com/")` for css/base.css; UI-SPEC D-15 (replace `@import` by `<link>`) invalidates it. `css/base.css:1` currently is `@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@300;400;500;700&family=JetBrains+Mono:wght@400;500&display=swap');` [VERIFIED: css/base.css:1].
- `tests/split-tags.spec.mjs` "樣式表都在 <head>" uses `isLocal` (js|css|data prefixes) so external font `<link>` is not counted — fine. "不可有 style 元素" in `index.html`: do not add inline `<style>`.
- `tests/storage.spec.mjs:141` expects 17 backup keys for the FIXTURE (16 keys + `apiKey_` prefix key) — unaffected unless the fixture gains `lh:uiScale`.
- Smoke (`tests/smoke.spec.mjs`) enumerates every inline `on*` handler on the page and fires each in a fresh context; new inline handlers (zoom reset, sheet handle, `#mtab-search`) are picked up automatically as long as the functions exist. Section-delete `confirm()` is auto-accepted by `bootPage` (`page.on('dialog', d => d.accept(...))`, helpers.mjs:99).

### Pitfall 5: Input font-size floor must not scale below 16 px
`max(16px, 1rem)` (UI-SPEC D-08), not `1rem`: at 50% scale `1rem` = 8 px and iOS auto-zoom returns. Class selectors beat element selectors, so each control class must be listed (UI-SPEC section 9 lists them). Also needed for landscape phone / tablet: today `.search-input` is `clamp(0.95rem, 1.4vw, 1.2rem)` = 15.2 px at 820 and 844 wide, and the existing 16 px rule exists only inside `@media (max-width: 440px)` (css/responsive.css:424-425).

### Pitfall 6: rAF is throttled/paused in hidden tabs
A search followed by switching tabs would leave `data-render="more"` forever. Flush synchronously (or `setTimeout`) when `document.hidden`. Headless Playwright pages are visible, so this is not caught by tests unless added explicitly.

### Pitfall 7: Baseline screenshots catch the `slideIn` animation
Container animates `translateY(30px)` for 0.5 s and `.results-grid` fades in 0.4 s (css/base.css `slideIn`, `fadeIn`). Steady-state `document.scrollHeight` on desktop is 900 but reads 910 during the first 0.5 s. Use `animations: 'disabled'` in `toHaveScreenshot` and wait ≥ 0.8 s (or the render signal) before any geometry measurement.

### Pitfall 8: Fixed `.results-section { min-height: 300px / 270px }` defeats shrinking
Container is `overflow:hidden; height: fixed; display:flex; column`; `.results-section` has `flex:1; min-height:300px` (270 on S). Anything added above it (header + search + in-flow banner) cannot take height from results below that floor; on short viewports the overflow is simply clipped. This is exactly the landscape-phone failure (section Q3). UI-SPEC section 4's `--app-h < 600px → header/mobile-batch hidden, results min-height:0` is required, not optional.

## Code Examples

### Long-task measurement under CPU throttle (works as written; measured)
```javascript
// tests/perf.spec.mjs
const cdp = await context.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
await page.evaluate(() => {
    window.__lt = [];
    new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration)); }).observe({ type: 'longtask' });
});
// then: fill the input (real input event path), await the render signal, read window.__lt
```
Boot the page first, THEN enable throttling and attach the observer, otherwise page-load/wordlist-parse tasks (PERF-03 territory) pollute the numbers.

### "Fully inside viewport" + "really clickable" helper
```javascript
// Playwright's click() succeeds on a clipped element if its CENTER is visible (desktop panel bug!), so assert geometry too.
async function expectFullyInViewport(page, locator) {
    const b = await locator.boundingBox();
    const vp = page.viewportSize();
    expect(b.x).toBeGreaterThanOrEqual(-0.5);
    expect(b.x + b.width).toBeLessThanOrEqual(vp.width + 0.5);
    expect(b.y).toBeGreaterThanOrEqual(-0.5);
    expect(b.y + b.height).toBeLessThanOrEqual(vp.height + 0.5);
}
```

### Keyboard emulation without a real keyboard (Playwright)
`page.setViewportSize({ width: 390, height: 844 - 336 })` shrinks both `innerHeight` and `visualViewport.height` in chromium, so the UI-SPEC rule `stableH − vv.height ≥ 150` can be exercised end to end (focus a textarea, shrink, assert `html.kb-open`, tab bar hidden, field rect inside viewport). Measured effect on the CURRENT code: with a 336 px keyboard (top at y=508) the context textarea sits at y 634–744 (under the keyboard) and the 78vh sheet is 658 px tall; after shrinking to 508 px the sheet re-fits (112–508) because it is `vh`-based. Limits: Chromium emulation does not reproduce iOS's "layout viewport stays, visual viewport pans" behaviour, so keyboard coverage on iOS remains a human check.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| CSS `zoom` on a container | root `font-size` × custom property + rem | project decision (CONTEXT) | Layout reflows instead of scaling `vh`/fixed offsets |
| `100vh` | `100dvh` (+ `@supports` fallback) | Safari 15.4 / Chrome 108 | Correct height with browser chrome |
| `maximum-scale=1` to stop iOS zoom | inputs ≥ 16 px | long-standing | Keeps pinch zoom (a11y) |
| Keyboard overlays layout viewport | `interactive-widget=resizes-content` (Chromium 108+/Firefox 133 Android) plus `visualViewport` for iOS | Chrome 108 | Safari has NOT shipped it [CITED: bram.us 2026-09-11: "It has not shipped in a public Safari release"] — the JS model is mandatory, the meta is a Chromium/Firefox bonus |

**Deprecated/outdated:** `window.innerWidth`-at-load device detection; `recentPanel` hidden stub (`<div id="recentPanel" style="display:none">`) can stay (still referenced by ui-common.js:57).

## Findings by Key Question

### Q1 — Zoom root cause, overflow numbers, rem migration, golden

**Code path (in-repo, read this session).** js/search-ui.js:17-27: `zoomIn(){ MzoomScale = Math.min(MzoomScale + 5, 150); resultsSection.style.zoom = MzoomScale / 100 * MzoomBaseRatio; ...}`; js/cards.js:2-3 `let MzoomScale = 100; let MzoomBaseRatio = 1.0;`; js/theme.js:50-51 `const zoomTarget = document.querySelector('.container'); const resultsSection = zoomTarget;`. `MzoomBaseRatio` is always 1.0. The desktop slider `#zoomSlider` is `display:none` (css/base.css:172 `.zoom-control { display: none; }`) but its `change` listener still writes `zoomTarget.style.zoom` (theme.js:57-62): dead code. No test references zoom (`grep -n "zoom\|Zoom" tests/*.mjs` → empty), so removal is free. Zoom is NOT persisted anywhere today.

**Measured (Playwright, light, after search `ㄢ`, steady state) — container rect [left, top, right, bottom], `document.scrollHeight` (docSH):**

| Viewport | Scale | container | docSH | Observation |
|----------|-------|-----------|-------|-------------|
| 390×844 | 50 | 24,25,366,437 | 844 | container only 412 px tall, UI tiny (zoom buttons 16×13 px) |
| 390×844 | 100 | 24,29,366,853 | **872** | already 28 px taller than viewport (`calc(100vh - 20px)` + 2×24 px body padding) |
| 390×844 | 150 | 24,24,366,1260 | 1284 | container 1236 px tall > 844; bottom 416 px must be reached by double scrolling |
| 820×1180 | 150 | 20,24,800,1734 | 1750 | container 1710 px tall |
| 1440×900 | 50 | 495,21,945,451 | 900 | container shrinks to 450×430 centered, wasted space |
| 1440×900 | 100 | 270,26,1170,886 | 900 | clean |
| 1440×900 | 150 | 45,24,1395,1314 | 1330 | bottom edge, footer (1217–1287) and last card rows off-screen |

Mechanism: lengths inside a `zoom`ed box (including `vh`-derived `height`) are multiplied by the zoom factor, so a box that exactly fills the viewport at 100% overflows at 105%. The 100%-state defect is phone-only (28 px). Andy's "100% already has an offset" is therefore best explained as: the container is sized to exactly the viewport so the first zoom step pushes edges out, plus the 28 px phone overflow [ASSUMED interpretation — Andy did not give a screenshot].

**Not scaled by zoom today:** side panels, tab bar, toast, banner and anything outside `.container` (so "zoom" never affected them); settings/about overlays are inside `.container` and are scaled.

**Range 50–150%:** keep (UI-SPEC D-01). With a fluid layout 150% on a 390 px phone is feasible; 50% is an overview mode where touch targets are intentionally small (the +/− and reset controls must stay ≥ 44 px physical so the user can always recover — UI-SPEC D-07/D-01 reset tap). Whether 150% truly fits 390 px must be proven by the layout spec (not measured here, rem migration does not exist yet).

**px → rem migration sizing** (counted from css/*.css, excluding `@media`/`@import` lines): ~547 `px` tokens vs 114 `rem` tokens. By property: padding 183, border-radius 65, gap 44, border 40, box-shadow 27, margin-* ~31, width 12, height 10, min/max-width/height ~16, top/right/bottom/left ~23, grid-template-columns 2, font-size 2 (`css/responsive.css:70` `font-size: 14px;` and `:425` `font-size: 16px;`). Convert (÷16, exact in binary float for these values): padding, margin*, gap, width/height/min-*/max-*, top/right/bottom/left, grid-template-columns, border-radius, the `font-size: 14px` at responsive.css:70. Keep px: borders/outlines ≤ 4 px, box-shadow, backdrop-filter, letter-spacing, `@media` breakpoints, `env()`. Media queries with `px` are physical and unaffected by root font-size (they would only scale with `em/rem` units, which use the initial 16 px).
JS constants that encode px and must change or be deleted with the move to CSS-driven panels: js/panels.js:29-34 (`containerW = Math.min(900, vw)`, `GAP = 5`, `MIN_PANEL = 300`, `PANEL_W = 400`) — UI-SPEC D-03 deletes this maths. js/report.js:24,95 and js/ai-word-events.js:19,39 clamp context menus with `window.innerWidth - 160/220` (px, unscaled) — at scale 150% the menu's real width exceeds 160 px; clamp using `getBoundingClientRect().width` of the menu.

**Parity gate recommended in addition to the UI-SPEC's ≤0.1% screenshot diff (cheaper, exact, debuggable):** BEFORE touching CSS, capture a JSON of `getComputedStyle` for a fixed property list (font-size, padding-*, margin-*, gap, width/height via `getBoundingClientRect`, border-radius, top/left/right/bottom) of every element matching `body *` in states idle, search(`ㄢ`), lyrics open, AI open, settings open, at 3 viewports at scale 100. After Pass A the JSON must be byte-identical (rem × 16 = same px). This isolates "no visual change" from rendering noise and tells the executor WHICH selector drifted. It is a Pass-A-only gate (Pass B changes appearance on purpose); keep the fixture out of `tests/` permanent suite or mark it `test.skip` after Pass B.

**Golden impact — answer:** CSS-only work (the entire rem migration, touch floors, layout, banner) cannot change golden: it hashes markup/text only (quote in Pitfall 1). Progressive rendering is the only change that can; it stays valid when the final DOM is identical after whitespace normalisation and when specs wait for done. No re-baseline is needed; if a re-baseline were ever required it must be limited to `htmlSha1` and done with `npm run golden:update` in its own commit. The golden suite itself is the equivalence test for batched rendering (it covers common/initial/tone × 41 inputs including the 689-card cases).

### Q2 — Card rendering

**Counts (real wordlist, phone viewport):**

| Input | `隱藏冷僻字` on (default) | off |
|-------|--------------------------|-----|
| `ㄢ` / `an` | 356 | 1077 |
| `ㄧ` / `i` | 392 | 1461 |
| `愛` | 178 | 402 |
| `ㄅ` | ≤300 | 617 |
| `ㄅ ㄆ ㄇ` | 599 | 1633 |
| golden max (`multi-py`, `multi-zy`) | 689 | — |

HTML size 70–657 KB. Same counts in all three modes (common/initial/tone); tone/initial add group wrappers only.

**Structure of `displayResults` (js/results.js, read in full):** builds `header` + `content` as template strings; four branches (tone; initial → rhyme-search / initial-search / mixed; common) each embed `${group.map(item => createCharCard(item, showPinyin, X)).join('')}`; one `container.innerHTML = header + content` at js/results.js:259; click delegation via `resultsContainer.onclick` assigned afterwards (unaffected by batching). Three early-return branches (empty input, zero results) render empty-state markup. Callers: js/search-ui.js:52, js/polyphonic.js:110, js/cards.js:136 (`scheduleReorder` after 500 ms fade), js/theme.js:43/138/150. `_handleSearch` then calls `renderPolyphonicChips(char)` which appends into `.results-header` — header must exist synchronously after `displayResults` returns (it does in the skeleton design).

**Cost, baseline (current code), measured:**

| CPU | Case | cards | search | build+parse | forced layout | longtasks (ms) | LoAF blocking |
|-----|------|-------|--------|-------------|---------------|----------------|---------------|
| 1× | `ㄧ` hideRare off | 1461 | 4 | 8 | 22–30 | [50] | 16 |
| 4× | `ㄧ` hideRare off | 1461 | 17 | 34 | 123 | [86, 232] | 261 |
| 6× | default `ㄧ` (first search, fresh page) | 392 | — | — | — | [72, 149] | 164 |
| 6× | default `ㄅ ㄆ ㄇ` | 599 | — | — | — | [111, 166] | 219 |
| 6× | worst `ㄧ` hideRare off | 1461 | 28 | 55 | 197 | [101, 383] | 415 |
| 6× | worst `ㄅ ㄆ ㄇ` hideRare off | 1633 | 47 | 53 | 162 | [138, 407] | 474 |

Time to first card at 6×: 57–138 ms. The first long task is search + string build + `innerHTML` parse; the second is style/layout/paint of everything. On this 13900K Hackintosh a real low-end phone will not match 6× exactly [ASSUMED]; treat these as relative.

**Batching prototypes at 6× CPU (monkey-patched in-page; worst `ㄧ`/`ㄅ ㄆ ㄇ`, 1461/1633 cards, `common` and `initial`):**

| Approach | batch | max long task (ms) | long-task list (example worst) | time to all cards |
|----------|-------|--------------------|--------------------------------|-------------------|
| Current (one `innerHTML`) | — | 363–423 | [154, 383] | immediate (blocked) |
| A: full string up front, DOM moved in slices | 40 | 123–173 | [160, 55] | 710–982 ms |
| A | 80 | 105–181 | [176, 87, 60] | 642–759 ms |
| A | 150 | 124–166 | [166,124,86,71,…] | 464–639 ms |
| **B: `createCharCard` lazy per slice** | 40 | **64–97** | [87, 65, 59] | 888–1271 ms |
| **B** | 80 | **94–109** | [93, 100, 64, 62, 53] | 696–925 ms |

Default-size (392 cards) with B at batch 40/80: max long task 71–100 (vs 132–136 today); the floor is the first task (search ≈ 28 ms + skeleton + first batch ≈ 55–75 ms at 6×), so "3× better than today" is unachievable for small queries — apply that criterion only to the largest query (today 363–423 ms → B gives 64–109, i.e. 3.5–6×). Approach A cannot meet a 3× requirement on the worst query (160–180 vs 423/3 = 141).

**Recommendation:** B. First batch 48 (a phone screen shows ~32 cards, tablet ~80, desktop ~60), then 64–96 per rAF slice. UI-SPEC D-10's "8 ms budget" measures only JS time and misses layout/paint (which dominate: 197 of 280 ms at 6×); a fixed card count per slice is the stable control, so make the budget a card count and treat the 8 ms as a secondary guard. Starting values from this data: slice 64; thresholds from UI-SPEC section 12 item 7 (4×: no longtask > 150 ms, TBT ≤ 300 ms; 6×: no longtask > 250 ms) are met with margin by B (max 109 ms at 6×); also assert time-to-first-card ≤ 400 ms at 4×.
`content-visibility:auto` was not needed to reach these numbers; per UI-SPEC it may only go on `.group-section`, never `.char-card`/`.container`.

**Render-complete signal:** `#resultsContainer[data-render]` = `idle|first|more|done` (UI-SPEC D-10) set by `displayResults`, plus a `lh:render-done` window event; tests use `settle()`/`waitRenderSettled`. The repo's existing signal pattern is promises assigned to `window.__hoyunReady` etc. (js/init.js:7, helpers.mjs:103) — an attribute is better here because it re-arms on every search and works with Playwright's retrying `expect(locator).toHaveAttribute`.

### Q3 — Layout audit (current code; Playwright, 3 viewports × states idle/search/lyrics/ai/settings/feedback/hashtag/banner)

Method: for every visible interactive element: horizontal-overflow vs viewport, `elementFromPoint` hit test at centre after `scrollIntoView`, min-side < 44 for coarse. Collapsed panel contents excluded (they are off-screen by design); overlay-covered underlay elements excluded when a modal/sheet is open. Screenshots were reviewed visually (desktop lyrics/AI, phone banner/search/dark/custom).

**Real defects found**
1. **L side-panel content clipped (1440×900, also every width 901–~1710).** `syncCenterPanel()` computes `visibleW = min(400, max(300, containerLeft − 5))` and applies `translateX(shift)` (js/panels.js:37-44). At 1440 `containerLeft = 270` → visible 300 → panel shifted 100 px off-screen, but its contents are not reflowed, so they are cut: left panel header/section/textarea/context textarea start at x −86…−87; right panel `#modelSelect` right=1527, `押字首` 1527, `不限字數` 1472, `✨提供詞語建議` 1527, `📌 保留` 1527 (viewport 1440). The panel also overlays the container (covers zoom ➖/➕ and `LOAD`/theme button in screenshots). UI-SPEC D-03 (push panels, `transform:none` when expanded) fixes this; panel-no-cover test at 1440 and 1280 is the right gate.
2. **Landscape phone 844×390 (≤900 tier): results unreachable.** Container 20–370; header 134 + search 190 = 324 px; `.results-section` min-height 300 starts at y=344 → only 26 px visible, first card at y=423 > 390; `document.scrollHeight` 390 (no page scroll) and container is `overflow:hidden`. Search works, results cannot be seen. (1180×820 tablet landscape is fine: results 389–754.)
3. **Banner covers controls.** `#lhSaveBanner` is `position:fixed; top:12px; left:50%` (js/safety.js:121-125). Phone: covers `about-btn`, `#searchInput`, two of three `.m-batch-btn` (title also hidden; screenshot confirms). Tablet: covers `about-btn-mobile`. Desktop 1440: covers only the title (no interactive element) — the problem is S/M. See Q6.
4. **Phone height overflow 28 px at 100%** (see Q1) and `100vh` ignoring dynamic browser chrome.
5. **Touch targets < 44 (coarse contexts), measured sizes:** phone: theme toggle 34×33, ➕/➖ 33×25, about `i` 18×18, `#inputModeBtn` 39×24, `.m-batch-btn` 82×38, `.mode-button` 78×27; lyrics sheet: `+ 新增段落` 84×24, section header 25 high, section label 18, context header 37, `.hashtag-add-btn` 22×22, `.context-refresh-btn` 28×25; AI sheet: `#modelSelect` 147×24, `.rhyme-mode-btn` 180×30, `.filter-chip` 25 high, `.generate-btn` 42 high, `.saved-pool-title` 33; settings: checkboxes 18×18, colour inputs 30×24, save/load 31 high, reset buttons 28; dialogs: feedback buttons 35, hashtag buttons 33. Tablet: theme 104×40, ➕/➖ 39×32, mode buttons 36, batch 31–35, gear 39. (UI-SPEC defect list agrees.)
6. **Collapsed L panels keep focusable controls off-screen** (hidden by transform only) → UI-SPEC D-17 `inert`.
7. UI-SPEC D-11 (settings dialog completeness) is consistent with code: `.settings-color-section`, `.settings-saveload`, `.settings-feedback-btn` are `display:none` in css/base.css:456-462 and only shown inside `@media (max-width: 440px)` (css/responsive.css:367-368, 524-527); header `.save-load-controls` hidden ≤ 900 (responsive.css:18).

**Verified OK today:** no horizontal overflow of any visible element on phone and tablet portrait (apart from the banner overlaps); tablet 820 portrait uses the sheet layout fine; doc scroll equals viewport on tablet/desktop in steady state.

**Panel behaviour on phone:** `mobileTab()` (js/panels.js:47-70) toggles `.collapsed` on both panels + backdrop + `.active` on tab buttons; sheets are `78vh` from the bottom with `padding-bottom: 60px`; tab bar is `fixed` 56 px high z 870 covering results bottom (compensated by `.results-section { padding-bottom: 70px }`).

**Tablet 768–1024 needs no separate breakpoint:** 820 portrait is ≤900 (sheet layout, works); 1024×768/1180×820 landscape are ≥901 (L, push panels once D-03 is done). UI-SPEC D-02 agrees. The only gap is M-tier input sizing (15.2 px), covered by D-08.

**Dark/custom theme (UI-02) observations from screenshots:** dark desktop is coherent (container colour is the inverted custom value; `--container-bg` is declared twice in `[data-theme="dark"]`, last wins `#ffffff` before `loadColors()` overrides it — css/base.css:21-22). With custom colours (bg `#2f855a`, container `#fefcbf`, text `#702459`, accent `#d53f8c`) the header gradient and the tab bar/cards stay on their default palette (header gradient vars are not driven by the four customisable colours) — consistent with "no new colour families"; flag to Andy as a human visual-review item rather than a code defect.

### Q4 — Mobile input

**Computed font sizes (390×844 phone) for every text control:** `#searchInput` 16 ✓; `#feedbackSubject` 14.08, `#feedbackBody` 14.08, `.section-label` 12.8, `.section-textarea` (lyrics) 15.2, `#contextDescription` 14.08, `#modelSelect` 11.52, `#hashtagPopupInput` 14.4 — all < 16. At 844×390 (phone landscape) and 820×1180: additionally `#searchInput` 15.2 (the `@media (max-width:440px)` rule at css/responsive.css:424-425 does not apply). Only 8 text controls exist on the page; there is no other `<input>`/`<textarea>`/`<select>` source (js/lyrics.js:254,260 render the section label and textarea; js/ui-common.js:12 creates a hidden clipboard textarea with default size).
**Viewport meta (index.html:12):** `width=device-width, initial-scale=1.0` — no `viewport-fit`, no `interactive-widget`; no `maximum-scale`/`user-scalable` (keep it that way).
**Keyboard options and limits:** `interactive-widget=resizes-content` makes the layout viewport (and `dvh`) shrink on Chrome Android 108+/Firefox Android 133+; Safari does not support it (CITED above), so the `visualViewport`-driven `.kb-open` model in UI-SPEC D-09 is required for iOS and also works on Android. `scrollIntoView({block:'nearest'})` on `focusin` is the standard last-mile. Playwright can test: font-size scan (all visible controls, 3 viewports × scale 50/100/150), meta tag content, kb-open class/CSS vars via viewport shrink. Needs real devices: iOS visual-viewport panning, actual keyboard height/animation, caret visibility, auto-zoom-on-focus (Playwright cannot reproduce iOS's zoom), PWA standalone `black-translucent` + safe-area behaviour [ASSUMED; `apple-mobile-web-app-status-bar-style` is `black-translucent` in index.html:7, and `env(safe-area-inset-*)` is zero without `viewport-fit=cover`].
`:focus` cannot be forced by `page.fill` alone for the hashtag popup on a collapsed sheet (hidden textareas must be `inert`, D-17) — test with real taps via `locator.tap()` on `hasTouch` contexts.

### Q5 — Screenshot testing

**Stability measured:** 6 combinations (3 viewports × light/dark), 3 runs each, all six launched concurrently per run in separate contexts on macOS 14.8.9 with `animations:'disabled'`, `caret:'hide'`, `scale:'css'` → the PNG SHA-1 was identical across all 3 runs for every combination (e.g. phone-light `ef91fd4d`, desktop-light `6e6ac654`). Rendering is deterministic on this machine under parallel load.
**Fonts:** tests fulfil `fonts.googleapis.com`/`gstatic.com` with an empty CSS body (tests/helpers.mjs:28-30), so Noto Sans TC never loads and the page uses the system CJK fallback (+ Apple Color Emoji for the many emoji icons). Baselines therefore depend on the macOS font set: valid for this Hackintosh (Sonoma) only. Playwright's own guidance [CITED: playwright.dev/docs/test-snapshots] — "For consistent screenshots, run tests in the same environment where the baseline screenshots were generated"; default file names carry a `-darwin` platform suffix, so a baseline simply will not exist on another OS (the test fails with "writing actual") — acceptable for CI-less local runs.
**Where baselines live:** default `<spec>.mjs-snapshots/<name>-chromium-darwin.png` next to `tests/visual.spec.mjs`; updated with `--update-snapshots`. Add a script mirroring `golden:update`: `"visual:update": "playwright test tests/visual.spec.mjs --update-snapshots"`. Never let `npm test` create missing baselines silently; first run must be the explicit update. Sizes: 80–370 KB per viewport screenshot (viewport only, not full page) → the 15-image matrix is roughly 3 MB; the "before" set in `.planning/phases/05-multi-device-layout/baseline-before/` is plain PNG files saved with `page.screenshot` (not `toHaveScreenshot`) so it is not compared, only viewed.
**Thresholds:** exact repeatability means `maxDiffPixelRatio: 0.001` is safe for the Pass A parity comparison (UI-SPEC's "≤ 0.1%"); use `0.002–0.01` for later Pass B baselines to absorb OS micro-drift without hiding real shifts (a 20 px header shift on 1440×900 ≈ 1.5%). Keep `threshold` default 0.2. Masks: none needed — the model select options come from the mocked `/models`, results come from the deterministic rhyme dictionary; mask only `.copy-toast` if a test triggers it. Wait for `data-render="done"` (and fonts fallback is stable) before capture; do not rely on `waitForTimeout`.
**Context options needed:** `bootPage` currently hard-wires `CONTEXT_OPTS` (1280×900, light). Extend it with `viewport`, `isMobile`, `hasTouch`, `deviceScaleFactor: 1`, `colorScheme` (the app reads `prefers-color-scheme` once in `applyTheme`, js/theme.js:30).
**The custom-colour preset** is applied through `storage` (`bgColor1`, `containerBg`, `textColor`, `highlightColor`, plus optionally `hoyun_theme_mode`): all five keys are registered in LH_KEYS. [VERIFIED: js/safety.js:9-26 — `{ key: 'bgColor1', group: 'setting' }`, `{ key: 'containerBg', group: 'setting' }`, `{ key: 'textColor', group: 'setting' }`, `{ key: 'highlightColor', group: 'setting' }`, `{ key: 'hoyun_theme_mode', group: 'setting' }`.]

### Q6 — Save-failure banner (Phase 1 todo)

Current: injected `<style>` in js/safety.js:121-131: `.lh-save-banner { position: fixed; top: 12px; left: 50%; transform: translateX(-50%); max-width: min(92vw, 560px); z-index: 10000; ...}`. Existing test hooks (must keep passing): `#lhSaveBanner`, `[role="alert"].lh-save-banner`, `.lh-save-banner-close`, `.lh-save-banner-text` colour contrast (tests/save-failure.spec.mjs:17,31,49,73). Measured coverage: phone covers about `i`, search input, 2 batch buttons; tablet covers about `i`; desktop covers none.
**Recommendation: adopt UI-SPEC D-05/section 13 (in-flow first child of `.container`, flex-shrink 0)** — it removes overlap by construction at every width and scale and needs no per-device offsets. Constraints found: (1) `.container` is `display:flex; column; overflow:hidden; height:fixed`, so the banner takes height from `.results-section`, but that has `min-height:300/270px` — apply the `--app-h`-based `min-height:0` rule or the banner can push results out on short screens (Pitfall 8); (2) the banner can be raised before `<body>`/`.container` exist (safety.js head stage: `lhSaveFailed` already defers via `DOMContentLoaded`), keep a minimal inline-styled fixed fallback and re-parent; (3) safety.js loads in `<head>` before `js/layout.js`, so it must not depend on layout.js; (4) move CSS to css/base.css as the spec says but keep the banner functional if CSS fails to load (inline fallback style on the fixed variant); (5) tests: assert that when visible the banner's rect intersects no other visible interactive element at 3 viewports × scale 100/150 (reuse the hit-test audit helper from this research), and that `匯出備份`/`關閉` are ≥ 44 px high on coarse.
Rejected alternative (bottom-anchored fixed above the tab bar): collides with `.copy-toast` (`bottom: 70px`, z 9999) and the kb-open layout, and still overlays content.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | tests, serve.mjs | ✓ | (runs `npx playwright`) | — |
| @playwright/test | all specs | ✓ | 1.63.0 | — |
| Chromium for Playwright | emulation, CDP | ✓ | chromium-1243 (+ headless shell) | — |
| macOS | baselines | ✓ | 14.8.9 (Sonoma) | — |
| WebKit / Firefox in Playwright | iOS/Safari rendering | ✗ not installed (only chromium dirs found) | — | Human check on real iPhone; WebKit install is optional and OUT of scope (no new dependency) |
| Real iPhone / Android | keyboard, auto-zoom, safe-area | ✗ | — | Human UAT list (CONTEXT: human check) |

**Missing dependencies with no fallback:** none for automated work.
**Missing dependencies with fallback:** real devices → human check at end of phase (`human_verify_mode: end-of-phase` in config).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `@playwright/test` 1.63.0 (browser + Node specs), chromium only |
| Config file | `playwright.config.mjs` (testDir `tests`, `fullyParallel`, `retries:0`, `timeout 60000`, `reporter:'list'`, webServer `node tests/serve.mjs` on port 4310; default viewport 1280×900) |
| Quick run command | `npx playwright test tests/layout.spec.mjs tests/golden.spec.mjs` (golden: ~41 cases, tens of seconds) |
| Full suite command | `npm test` (277 tests, 1.1 min measured, all green at research time) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PERF-01 | No `zoom` anywhere (static scan: `grep` css/js for `style.zoom|zoom:` empty) | static | `npx playwright test tests/layout.spec.mjs -g "no zoom"` | ❌ Wave 0 |
| PERF-01 | Scales 50/100/150 via real ➖/➕: every header/search/options/tab-bar element fully inside viewport; `scrollWidth ≤ innerWidth`; page does not scroll (`scrollHeight ≤ innerHeight+1`) at 3 viewports | e2e | `npx playwright test tests/layout.spec.mjs -g "scale"` | ❌ Wave 0 |
| PERF-01 | 100% parity (Pass A): computed-style JSON identical to pre-migration capture; screenshot ≤ 0.1% | e2e | `npx playwright test tests/visual.spec.mjs -g "parity"` | ❌ Wave 0 (capture BEFORE css edits) |
| PERF-01 | `lh:uiScale` persisted, garbage value → 100, registry size 17 | unit/e2e | `npx playwright test tests/scan.spec.mjs tests/layout.spec.mjs -g "uiScale"` | ✅ scan.spec (update 16→17) / ❌ new test |
| PERF-02 | Largest query (hideRare off `ㄧ`, 1461 cards; and `ㄅ ㄆ ㄇ`) at 4× and 6×: max longtask ≤ 150 / ≤ 250 ms, time-to-first-card ≤ 400 ms (4×); median of 3 | perf | `npx playwright test tests/perf.spec.mjs` | ❌ Wave 0 |
| PERF-02 | `data-render` goes `first → more → done` and all N cards present; new search mid-render leaves no stale cards; tap works on rendered cards mid-render | e2e | `npx playwright test tests/perf.spec.mjs -g "render states"` | ❌ Wave 0 |
| PERF-02 | Golden unchanged after render-complete wait | e2e | `npx playwright test tests/golden.spec.mjs` | ✅ |
| UI-01 | 3 viewports (+844×390, 1180×820) full flow with REAL clicks: search → select card → open lyrics → type → open AI → generate (mock `/ai`) → click AI word; each target fully in viewport (`expectFullyInViewport`) and not covered (`elementFromPoint`) | e2e | `npx playwright test tests/layout.spec.mjs -g "flow"` | ❌ Wave 0 |
| UI-01 | L panels expanded do not intersect container at 1440 and 1280; landscape phone results visible (first card inside viewport) | e2e | `-g "panel"` / `-g "landscape"` | ❌ Wave 0 |
| UI-01 | Touch targets ≥ 44 on coarse contexts (exceptions per UI-SPEC) | e2e | `-g "touch"` | ❌ Wave 0 |
| UI-01 | Banner intersects no interactive element, 3 viewports × scale 100/150 | e2e | `-g "banner"` (extends save-failure.spec.mjs) | ✅ save-failure.spec (no geometry yet) / ❌ new |
| UI-02 | Baselines: results state × 3 viewports × light/dark; lyrics/AI open × 3; custom preset × 3 | visual | `npx playwright test tests/visual.spec.mjs` | ❌ Wave 0 |
| UI-02 | Contrast ≥ 4.5 for `--text-primary/--text-secondary` on `--container-bg/--card-bg` in default light/dark (computed) | e2e | `-g "contrast"` | ❌ Wave 0 |
| UI-03 | Every visible `input/textarea/select` (excl. checkbox/color/range/file) ≥ 16 px computed at ≤900 or coarse, scales 50/100/150; meta has `viewport-fit=cover`, no `maximum-scale`/`user-scalable` | e2e | `-g "input font"` | ❌ Wave 0 |
| UI-03 | Keyboard emulation: focus lyrics textarea, shrink viewport by 336 px → `html.kb-open`, tab bar hidden, field inside viewport | e2e | `-g "keyboard"` | ❌ Wave 0 |
| UI-01/03 | Real iPhone/Android: caret above keyboard, no auto-zoom, pinch works, scale feel, beauty | manual | UAT list | manual-only (cannot be emulated) |

### Sampling Rate
- **Per task commit:** `npx playwright test tests/layout.spec.mjs tests/golden.spec.mjs tests/split-tags.spec.mjs tests/scan.spec.mjs` (< 60 s target)
- **Per wave merge:** `npm test`
- **Phase gate:** `npm test` green, golden JSON files unchanged (`git diff --stat tests/golden` empty), visual baselines reviewed by Andy, human UAT done

### Wave 0 Gaps
- [ ] `tests/helpers.mjs` — `bootPage` viewport/isMobile/hasTouch/colorScheme/deviceScaleFactor options; `settle()` waits for render idle; shared `auditInPage` (overflow/hit-test), `expectFullyInViewport`
- [ ] BEFORE-change captures: screenshot matrix into `.planning/phases/05-multi-device-layout/baseline-before/`; computed-style parity JSON; recorded worst long tasks (this research has the starting numbers)
- [ ] `tests/layout.spec.mjs`, `tests/visual.spec.mjs`, `tests/perf.spec.mjs` (new); `package.json` script `visual:update`
- [ ] Update in-repo tests that encode removed facts: scan.spec 16→17; split-tags JS order + @import rule
- [ ] Framework install: none

## Security Domain

Applicable ASVS level 1 (config: `security_asvs_level: 1`, `security_enforcement: true`).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | no auth surface in this phase |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes | `lh:uiScale` read from localStorage is untrusted: parse as number, round to step, clamp 50–150, non-finite → 100; write only a numeric string to `setProperty('--ui-scale', ...)` (no string concatenation into CSS) |
| V6 Cryptography | no | — |
| V7 Error handling / logging | yes | Keep `lhSet` failure path (banner) unchanged; do not log stored values (existing rule in safety.js) |
| V14 Configuration | yes | No `maximum-scale/user-scalable`; no new third-party origin (fonts stay Google; `<link rel=preconnect>` to the same two hosts only) |

### Known Threat Patterns for static vanilla JS + localStorage

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via banner/dialog text built with `innerHTML` | Tampering | Keep `textContent` (already used in safety.js:164); the section-delete `confirm()` message includes the user's section label → pass it as plain string to `confirm()`, never HTML |
| Tampered localStorage (`lh:uiScale`, panel flags) | Tampering | Validate/clamp (above); unknown values fall back to defaults |
| Unregistered storage key / data loss on write failure | Denial/Repudiation | Register `lh:uiScale` in `LH_KEYS`; scan.spec enforces registration and no direct `localStorage` access outside safety.js |
| Inline CSS injection through attribute-built styles | Tampering | Use CSS classes and numeric custom properties only |

## Project Constraints (from CLAUDE.md)

From `./.claude/CLAUDE.md` (project) and the global `~/.claude/CLAUDE.md` user instructions:
- **Hosting/Budget:** pure frontend on GitHub Pages + Cloudflare Worker; free tiers only — no new paid service or build step.
- **Data safety:** updates must not lose saved lyrics/overrides/settings (localStorage/IndexedDB backward compatible) → new `lh:uiScale` is additive; never rewrite existing keys.
- **Code structure:** `index.html` may be split into JS/CSS files; must deploy without or with minimal build (classic scripts, no modules; split-tags.spec forbids `defer/async/module` and requires one shared `?v=`).
- **Devices:** computer, tablet, phone must all be good.
- **Language:** UI and lexicon Traditional Chinese (Taiwan); Simplified Chinese forbidden — all new copy (tab labels, aria-labels, confirm text) in 繁體.
- **Conventions:** 4-space indent, single quotes, camelCase functions, `_` prefix for internals, Chinese inline comments explaining why, section header comments `// ==================== ... ====================`; localStorage only through safety.js (`lhGet/lhSet/...`), keys registered in `LH_KEYS`; user-facing errors via `showToast`; no linter configured.
- **GSD enforcement:** edits only inside a GSD workflow; user wants handoff.md updated after coding tasks and "commit" keyword → git commit; branch `gsd/v0.96-stabilize`, never push.
- **Global user preferences (Andy):** do multi-step work in one batch and test at the end (memory: `feedback-batch-execution.md`); explain in plain language; GUI beauty/consistency/customisation matter; do not modify `/users/shared/coding projects/resources/*` reference files.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Andy's "100% already has an offset" means "container sized exactly to the viewport so any zoom step pushes edges out" (+ phone 28 px overflow); no other 100% offset exists | Q1 | Another visual offset he perceives (e.g., header gradient or margins) might remain after migration → needs his screenshot |
| A2 | iOS auto-zoom triggers for focused controls with computed font-size < 16 px (and iPad in mobile mode); Playwright cannot reproduce it | Q4, Pitfall 5 | Floor might need to differ per device; only a real-device check settles it |
| A3 | `viewport-fit=cover` is required for non-zero `env(safe-area-inset-*)` and PWA `black-translucent` layout needs it | Q4 | Notch/status-bar overlap not caught by emulation |
| A4 | Throttle 4–6× approximates mid/low-end phones; absolute ms thresholds are machine-dependent (13900K Hackintosh) | Q2 | Thresholds may need loosening on another machine; use relative "≥3× better than recorded baseline" for the largest query as the UI-SPEC suggests |
| A5 | `content-visibility:auto` is unnecessary once lazy slicing is in place (not measured) | Q2 | If layout of 1633 cards in one grid is still heavy on real phones, add it to `.group-section` per UI-SPEC |
| A6 | `scheduler.yield`/`postTask` unavailable on Safari, so rAF slicing is the portable choice | Standard Stack | Minor; rAF works either way |
| A7 | Custom-colour theme leaving header gradient/tab bar on default palette is acceptable ("no new colour families") | Q3 | Andy may expect those to follow custom colours (UI-02 beauty) → human review |
| A8 | Layout cost of appending slices to one large grid is roughly linear; not separately profiled per slice | Q2 | Late slices could cost more than early ones; perf spec assert on max long task covers it |
| A9 | At 150% on a 390 px phone the fluid layout fits without horizontal overflow (UI-SPEC claims this; rem migration does not exist yet to measure) | Q1 | May require extra wrapping rules or a lower max |

## Open Questions

1. **Does Andy want `lh:uiScale` (persisted) or reset-on-reload zoom?** Current zoom is not persisted. UI-SPEC D-01 decides persisted + tap-percentage-to-reset. Recommendation: follow the spec (a stored 50% that cannot be recovered is the main risk; the reset tap and ≥44 px controls mitigate it).
2. **How aggressive should the long-task acceptance threshold be?** What we know: current worst is 363–423 ms at 6×; lazy slicing yields 64–109. Unclear: variance on other hardware. Recommendation: hard-fail thresholds from UI-SPEC section 12 item 7 (150 ms at 4×, 250 ms at 6×) plus the relative ≥3× rule only for the largest query; take the median of 3 runs.
3. **Real-device verification scope** (UI-03 keyboard, auto-zoom, safe area) cannot be automated; confirm Andy will run the UAT checklist on one iPhone and one Android before the phase is closed.

## Sources

### Primary (HIGH confidence — measured/read this session)
- Repo files read: `index.html`, `css/base.css`, `css/panels.css`, `css/responsive.css`, `js/search-ui.js`, `js/cards.js`, `js/results.js`, `js/panels.js`, `js/ui-common.js`, `js/theme.js`, `js/state.js`, `js/init.js`, `js/safety.js` (lines 1-190), `tests/helpers.mjs`, `tests/golden.spec.mjs`, `tests/smoke.spec.mjs` (lines 1-60, 100-284), `tests/split-tags.spec.mjs`, `tests/scan.spec.mjs` (1-80), `playwright.config.mjs`, `package.json`, `.planning/phases/05-multi-device-layout/05-CONTEXT.md`, `05-UI-SPEC.md`
- Playwright 1.63.0 / chromium-1243 probes on macOS 14.8.9 (zoom geometry, long tasks with CDP throttle at 1×/4×/6×, batching prototypes A and B, layout audit, font inventory, screenshot determinism, `pointer`/`dvh` media support, landscape phone); `npm test`: 277 passed (1.1 min)

### Secondary (MEDIUM confidence)
- [bram.us — WebKit supports interactive-widget … and hopefully Safari will too? (2026-09-11)](https://www.bram.us/2026/09/11/webkit-supports-interactive-widget-and-hopefully-safari-will-too/) — via WebSearch summary: Chrome 108 Android and Firefox 133 Android support `interactive-widget`; not shipped in public Safari; iOS keyboard shrinks visual viewport only
- [MDN — meta viewport](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/viewport) — `interactive-widget` values (`resizes-visual` default, `resizes-content`, `overlays-content`) and `viewport-fit` (`auto|contain|cover`); the fetched page did not include the compatibility table
- [Playwright — visual comparisons](https://playwright.dev/docs/test-snapshots) — `-{platform}` suffix, `maxDiffPixels`, `stylePath`, `snapshotPathTemplate`, `--update-snapshots`, same-environment advice

### Tertiary (LOW confidence)
- Training knowledge for iOS auto-zoom threshold, safe-area behaviour without `viewport-fit=cover`, Safari `scheduler.yield` support (tagged `[ASSUMED]` above)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; everything verified in repo/toolchain
- Architecture: HIGH — prototypes measured (zoom geometry, batching approaches, layout audit); MEDIUM for how the planned rem migration behaves at 150% on 390 px (not yet built)
- Pitfalls: HIGH — each tied to a read file or a measurement; iOS-specific items MEDIUM/ASSUMED

**Research date:** 2026-10-04
**Valid until:** 2026-11-03 (stable; revisit if Playwright or macOS is upgraded because screenshot baselines are OS/font dependent)
