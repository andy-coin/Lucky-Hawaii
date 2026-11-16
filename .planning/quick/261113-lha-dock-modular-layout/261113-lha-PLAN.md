---
phase: quick-261113-lha
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - js/layout.js
  - js/dock.js
  - js/panels.js
  - js/safety.js
  - js/rhyme-map.js
  - css/panels.css
  - index.html
  - tests/dock.spec.mjs
  - tests/scan.spec.mjs
  - handoff.md
autonomous: true
requirements: [QUICK-261113-lha]

estimate:
  tokens: 95000
  raw_tokens: 95000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "視窗寬 ≥ 1600px 且是滑鼠／觸控板（hover: hover、pointer: fine）：歌詞（#leftPanel）、查詢（#mainContainer）、AI 建議（#rightPanel）三塊並排填滿畫面，互不重疊、都在畫面內（D-08）"
    - "寬度 < 1600、觸控裝置、≤ 900 底部 sheet：body 沒有 dock class，版面與現在一模一樣；既有 Playwright 測試全過（D-06、D-08）"
    - "拖區塊標題列到另一塊上：預覽框標出結果（邊緣＝那一半、中間＝整塊）；放開後邊緣＝分割、中間＝互換；Esc 取消（D-01）"
    - "只會出現五種支援版型：三欄並排、左右二分、上下二分、一大兩小（大塊在左或右）、上下二分加下方左右再分；其他落點不顯示預覽、放開不變（D-02）"
    - "拖兩塊之間的分隔線：兩側同時縮放、第三塊不動；寬不小於 20rem、高不小於 12rem（D-03）"
    - "版面存在 localStorage 的 lh:dock，重新整理還在；壞值或不支援的形狀回三欄預設、不報錯；設定 → 外觀「重設版面」回預設，只在寬螢幕模式顯示（D-04）"
    - "既有收合分頁照用：收起歌詞或 AI → 其他塊補滿（左右二分／上下二分），收起的分頁貼在畫面邊；再打開回到原本位置。收起期間拖分隔線也保留它的位置（新比例寫回存的版面）；只有收起期間拖放重排（吸附）才會讓它改回預設邊（歌詞左、AI 右）"
    - "在 1920×1080 dock 模式：歌詞大編輯器（lhEditorOpen／lhEditorClose 搬進搬出）、段落選單（右鍵名稱鈕開 #sectionMenu、選色生效；選字右鍵「移到段落 ▸」把文字移到別段）、韻腳地圖（句尾上色、鏡像層與文字框同框，拖分隔線後也同框；選字浮動列「查韻」可用）都照常；標題列上的按鈕照樣是點擊，不會變成拖曳（D-06）"
  artifacts:
    - path: "js/dock.js"
      provides: "版面樹（葉子＝區塊 id，分割節點 {d,k,s}）、prune（_dkFrom 記來源）／補回邊緣、算矩形、分隔線縮放（比例寫回 _dkTree）、lh:dock 讀寫與驗證、標題列拖放（_dkDrop）、預覽、重設"
      contains: "function lhDockRender"
    - path: "js/layout.js"
      provides: "LH_MQ_DOCK 與 lhIsDockMode()（斷點只在這裡讀，D-02 慣例）；setUiScale 之後重畫 dock"
      contains: "function lhIsDockMode"
    - path: "js/panels.js"
      provides: "syncCenterPanel 在 dock 模式跳過「放不下就收一邊」，最後呼叫 lhDockRender"
      contains: "lhDockRender"
    - path: "css/panels.css"
      provides: "body.dock 區段：三塊吃 --dk-x/--dk-y/--dk-w/--dk-h、分隔線、預覽框、拖曳游標、重設鈕只在 dock 顯示"
      contains: "body.dock"
    - path: "js/safety.js"
      provides: "LH_KEYS 登記 lh:dock（group ui）"
      contains: "lh:dock"
    - path: "index.html"
      provides: "js/dock.js script 標籤（panels.js 之後、ui-common.js 之前）、外觀分頁 #dockResetBtn、?v= 版號升到 0.96.28"
      contains: "js/dock.js?v=0.96.28"
    - path: "tests/dock.spec.mjs"
      provides: "寬螢幕三欄、收合重排、模式切換、編輯器、段落選單、移到段落、韻腳地圖、分隔線（含收起時縮放保留位置、鏡像層對齊）、存檔／壞值／重設、拖放五種版型與拒絕落點"
  key_links:
    - from: "js/panels.js syncCenterPanel"
      to: "js/dock.js lhDockRender"
      via: "收合狀態與 body.lp-open/rp-open 更新完之後呼叫（typeof 防護）"
      pattern: "lhDockRender\\(\\)"
    - from: "LH_MQ_DOCK change（js/layout.js 定義）"
      to: "syncCenterPanel → lhDockRender"
      via: "js/dock.js 掛的 change 監聽；視窗 resize 已由 js/report.js 呼叫 syncCenterPanel"
      pattern: "LH_MQ_DOCK.addEventListener"
    - from: "lhDockRender 算出的矩形"
      to: "css/panels.css body.dock 規則"
      via: "元素上的 --dk-x/--dk-y/--dk-w/--dk-h（只寫數字＋px）"
      pattern: "--dk-x"
    - from: "分隔線 pointermove"
      to: "_dkTree 裡的來源節點權重"
      via: "_dkPrune 記在 WeakMap _dkFrom 的來源節點與子索引；收起的區塊因此不會被縮放弄丟"
      pattern: "_dkFrom"
    - from: "標題列 pointerdown → 放開"
      to: "_dkDrop → lhSet(LH_DOCK_KEY)"
      via: "白名單 LH_DOCK_SHAPES 檢查通過才提交"
      pattern: "_dkDrop"
    - from: "開機"
      to: "lhGetJSON(LH_DOCK_KEY, null, _dkValid)"
      via: "壞值回預設三欄（safety.js 會另存損毀原文）"
      pattern: "lhGetJSON\\(LH_DOCK_KEY"
---

<objective>
桌機寬螢幕（≥ 1600px＋滑鼠）上，把歌詞、查詢結果、AI 建議三塊做成 VS Code 式的吸附分割版面：拖標題列換位置或分割、拖分隔線縮放、版面記住、可重設。平板、手機、≤ 1599 的桌機維持現在的抽屜行為完全不變。

Decision IDs (from the user's locked list, numbered in order): D-01 拖標題列＋吸附預覽，邊緣＝分割、中間＝互換｜D-02 五種支援版型｜D-03 分隔線兩側同時縮放＋最小寬高｜D-04 localStorage 存版面、壞值回預設、「重設版面」｜D-05 背景動畫被蓋住是已知限制（不處理）｜D-06 歌詞大編輯器、段落選單、韻腳地圖、既有 Playwright 測試不可壞｜D-07 繁中介面、沿用 CSS 變數與深淺色、無建置 vanilla JS、4 空白、中文註解｜D-08 只在桌機寬螢幕啟用，≤ 900 sheet 與手機平板不變。

Design choices (kept as small as the requirements allow):
- 啟用條件 `(min-width: 1600px) and (hover: hover) and (pointer: fine)`，放在 js/layout.js 斷點區（D-08，斷點只在那裡讀）。為什麼是 1600：既有測試全部跑在 1280／1440 寬並假設抽屜版面，1600 以上才是真正的寬螢幕；門檻是一個常數，之後要調只改一處。
- 資料模型用「小版面樹」而不是預設版型表：葉子是區塊 id（'lyrics'｜'results'｜'ai'），分割節點是 `{ d: 'row'|'col', k: [子節點], s: [權重] }`。拖放＝「先把來源從樹拿掉、再把目標葉子換成分割」兩個小純函式；預設版型表反而要為每個（版型、位置、邊）寫轉換表。版型限制（D-02）用一個 7 個簽名的白名單 Set 守住：`L`、`row(L,L)`、`col(L,L)`、`row(L,L,L)`、`row(L,col(L,L))`、`row(col(L,L),L)`、`col(L,row(L,L))`。
- 三塊都不搬 DOM：版面算出的矩形寫成元素上的 `--dk-x/--dk-y/--dk-w/--dk-h`，CSS 只在 `body.dock` 底下吃這些變數。所以 lhEditorOpen 的「留註解佔位、搬進搬出」、所有 id 與既有測試的選擇器都不受影響。#mainContainer 用 `position: absolute`（不是 fixed：fixed 一定會開新的堆疊層，裡面的設定／關於浮層會被 z-index 800 的面板蓋住）。
- 既有收合分頁照用：展開的歌詞／AI 區塊裡照樣有那條直立分頁（跟現在的三欄一樣），點了收起；收起的面板回到原本「貼邊只露分頁」的抽屜外觀，版面少一塊自動重排（這就是 D-02 的左右二分／上下二分）。存的樹（_dkTree）一律保留收起區塊；畫面用的是 prune 過的副本（_dkVis）。拖分隔線把新比例寫回 _dkTree 的來源節點，所以收起時縮放不會弄丟收起那塊；只有收起時拖放重排（從只含可見區塊的 _dkVis 產生新樹）會讓它回預設邊。查詢區不能收。

Purpose: 大螢幕寫詞時三塊要怎麼擺由 Andy 自己決定，而不是固定左右抽屜加中間 56rem 的窄欄。
Output: js/dock.js（新）、tests/dock.spec.mjs（新），以及 js/layout.js、js/panels.js、js/safety.js、js/rhyme-map.js（版號）、css/panels.css、index.html 的小改動；?v= 版號 0.96.28。

Out of scope: 背景動畫在被填滿時看不到（D-05，已知限制）；觸控、平板的分割版面；用鍵盤重排版面（鍵盤路徑只有「重設版面」）；存多組版面。
</objective>

<execution_context>
@/Users/Shared/Coding Projects/Lucky Hawaii/.claude/gsd-core/workflows/execute-plan.md
@/Users/Shared/Coding Projects/Lucky Hawaii/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.claude/CLAUDE.md
@js/layout.js
@js/panels.js

<interfaces>
Existing globals this plan uses (all classic scripts, global scope):
- js/layout.js (head): `LH_MQ_PHONE`, `LH_MQ_SHEET` (matchMedia objects), `lhIsPhone()`, `lhIsSheetMode()`, `setUiScale(pct, save = true)` (writes --ui-scale on <html>; root font-size follows, so every rem changes).
- js/safety.js (head): `lhGet(key)` → string|null; `lhSet(key, value)` → bool (console.error for unregistered keys, so register first); `lhGetJSON(key, fallback, validate)` → parsed value, or fallback when empty/corrupt/validate fails (it stashes the corrupt raw and only console.warns); `lhRemove(key)`; `lhWarn(tag, err)`; registry array `LH_KEYS` (currently 24 entries; tests/scan.spec.mjs asserts that count).
- js/panels.js: `syncCenterPanel(opener)` — the single sync entry point. Called by toggleLeftPanel (js/lyrics.js:95), toggleRightPanel, mobileTab, js/report.js:28 on window resize, js/ui-common.js `_lhApplyPanelTier` at boot (ui-common.js runs after panels.js), js/songs.js. Non-sheet branch: auto-collapses one panel when both open leave < 24rem for the main area, then toggles body.lp-open / body.rp-open; finally sets inert on collapsed panel content.
- js/lyrics.js: `toggleLeftPanel()`, `lhEditorOpen(ta, sel)` / `lhEditorClose()` — moves `#leftPanel .lyrics-layout` and `#exportToggle` into `#lyricsEditorBody` with comment placeholders, then back.
- js/ui-common.js: `showToast(msg, duration = 1800)`.
- js/sections.js: right-click (contextmenu) on `#lyricsSections .section-type` opens `#sectionMenu` (color swatches `.swatch[aria-label="顏色：綠"]` set the section's `data-color` to '#48a868'). A contextmenu on a `.section-textarea` that is focused with a non-blank selection opens `#moveSelMenu` (one button 「移到段落 ▸」) → `#moveSelSub` with `.move-sel-to` rows; picking a row appends the selection to that section. `curSong().sections[i].text` reads the model.
- js/rhyme-map.js: each section body has a `.rhyme-mirror` (aria-hidden, before the textarea) shown when the section has class `rm-on`; colored line ends are `.rhyme-mirror .rm-hl` with `data-f` = rhyme family. `_lhMapSync` copies the textarea's offsetLeft/Top/Width/Height onto the mirror; one shared ResizeObserver re-syncs on any textarea size change. Keyboard selection shows the toolbar `#rhymeSelBar` (first button 「🔍 查韻：X」 searches X into `#searchInput`). The en-rhyme.json fetch carries the same `?v=` cache-bust token as index.html.
- Collapse state: `#leftPanel.collapsed` / `#rightPanel.collapsed`; prefs keys `leftPanelCollapsed` / `rightPanelCollapsed` ('false' = open; anything else = collapsed).
- DOM: `#mainContainer.container` (header `.header` → search → `.results-section` → footer; it also contains the fixed `#aboutOverlay` / `#settingsOverlay`); `#leftPanel.side-panel.left-panel` (flex row: `.side-panel-body` order 1 + `.side-panel-tab` order 2; title row `.side-panel-title.lyrics-head` with buttons and the plain span `#songCurrent`); `#rightPanel.side-panel.right-panel` (flex row-reverse; title row `.side-panel-body > .side-panel-title` holding span `.ai-title-group` and the model picker).
- CSS facts: `.side-panel` is position:fixed z-index 800 with `transition: transform`; inside `@media (min-width: 901px)` panels get `top: var(--pad-t)`, `height`, `width: var(--panel-w)` (left panel adds `var(--song-w)`), `.left-panel { left: 0 }`, `.right-panel { right: 0 }`, collapsed → translateX so only the tab (`--tab-w`) shows; `body` padding reserves `calc(var(--tab-w) + 0.25rem)` each side, `body.lp-open` / `body.rp-open` push by panel width. `.container` has `max-width: min(56.25rem, 100%)`, `margin: 0 auto`, `height: calc(var(--app-h) - var(--pad-t) - var(--pad-b))`, overflow hidden. `.results-section { min-height: 18.75rem; flex: 1; overflow-y: auto }`. `* { box-sizing: border-box }`. Theme vars available in both themes: `--highlight-border`, `--accent-soft`, `--fill-soft`, `--border`, `--card-bg`. Menus sit at z-index 870+.
- Tests: tests/helpers.mjs `bootPage(browser, { storage, device, wordlist: 'stub' | 'real' })` → `{ context, page, errors }` (errors collects pageerror + console.error; boot waits for ready signals); `BASE` reads `LH_TEST_PORT` (default 4310), and playwright.config.mjs passes the same env to its webServer. tests/layout-lib.mjs `DEVICES.desktop` (1440×900), `rectsOverlap(a, b, tol)`, `expectFullyInViewport(page, locator)`, `waitStill(page)`; tests/drag-lib.mjs `centerOf(locator)`, `mouseDrag(page, from, to, steps = 8)`. Seed `'lh:tourSeen': '1'` so the tour does not start; seed `leftPanelCollapsed` / `rightPanelCollapsed` = 'false' to open both panels. Song seeding: tests/move-selection.spec.mjs lines 6–12 (fixture `tests/fixtures/v096-localStorage.json` + 'lh:schema' '2' + 'lh:songs' + 'lh:activeSong'). Playwright config default viewport 1280×900, list reporter, webServer `node tests/serve.mjs`.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: 寬螢幕自動進入三欄吸附版面（收合分頁重排、模式來回切換、D-06 三項照常）＋ 版號 0.96.28 — 一條路打通</name>
  <files>js/layout.js, js/dock.js, js/panels.js, css/panels.css, index.html, js/rhyme-map.js, tests/dock.spec.mjs</files>
  <read_first>
    - js/layout.js（斷點區 59–64、setUiScale 38–45）
    - js/panels.js（syncCenterPanel 25–72）
    - css/panels.css 1–53（.side-panel 與 ≥ 901 推開版型）、base.css 229–266（body、.container）
    - index.html 380–383、441–446、502–531（面板結構與 script 順序）
    - tests/lyrics-editor.spec.mjs 1–40（bootPage／storage 寫法）、tests/layout-lib.mjs 1–56
    - tests/move-selection.spec.mjs 1–50（v2Storage、pick、合成右鍵 rightClick、#moveSelMenu／#moveSelSub 流程）
    - tests/sections-ui.spec.mjs 567–576（右鍵名稱鈕開 #sectionMenu、選色）
    - tests/rhyme-map-ui.spec.mjs 8–24（F_AABB、bands）、806–850（#rhymeSelBar、鍵盤選字）
  </read_first>
  <action>
Per D-08, D-06, D-07 and the Design choices in the objective. Wire one path end to end: breakpoint helper → syncCenterPanel → lhDockRender → CSS variables → three blocks on screen. No storage yet (the in-memory default tree); Task 2 adds persistence.

1. js/layout.js, inside the existing 斷點 section right after LH_MQ_SHEET: add `LH_MQ_DOCK = matchMedia('(min-width: 1600px) and (hover: hover) and (pointer: fine)')` and `function lhIsDockMode()`. Chinese comment saying why 1600 (existing suites run at 1280/1440 with drawers; ≥ 1600 + mouse = real wide desktop; the one knob to tune). At the end of setUiScale add one guarded call `if (typeof lhDockRender === 'function') lhDockRender();` — gaps, min sizes and the tab width are rem-based so a scale change must re-layout; at head time the function does not exist yet, so the guard skips it.

2. New js/dock.js (classic script, 4-space indent, Chinese comments, section header in the `// ==================== 寬螢幕吸附版面（dock） ====================` style):
   - `LH_DOCK_BLOCKS` maps block id → element id: lyrics → leftPanel, results → mainContainer, ai → rightPanel.
   - Tree format as in the objective. `_dkDefault()` returns a fresh row of lyrics / results / ai with weights 28 / 44 / 28. Module state: `_dkTree` (the stored arrangement, may contain collapsed blocks; for now `_dkDefault()`), `_dkVis` (the last rendered visible tree), `_dkRects` (block id → {x, y, w, h} from the last layout).
   - `_dkOpen(id)`: results is always open; lyrics / ai are open when their element exists and lacks `.collapsed`.
   - `_dkPrune(t, keep)`: pure, never mutates its input. Drops leaves where keep(id) is false (weights filtered in lockstep), drops empty nodes, unwraps single-child nodes. Whitelisted trees never produce same-direction nesting after pruning, so no flattening step is needed.
   - `_dkAddEdge(t, id)`: returns a new tree with an open block that is missing from t docked at its home edge. lyrics goes to the front, ai to the end. If the root is a row, insert into it with weight = sum(existing) × 28 / 72; otherwise wrap: a new row of [lyrics, root] with weights [28, 72] (ai: [root, ai] with [72, 28]). A tree only lacks a block when it has ≤ 2 leaves, and every such whitelisted tree plus this rule gives a whitelisted shape.
   - `_dkLayout(t, rect)`: recursive. gap = 0.5rem in px (read the root font size each render). Along the split axis, available = extent − gap × (n − 1); child extent = available × w_i / Σw; children placed in order with one gap between them. Leaves write `_dkRects[id]`.
   - `lhDockRender()`: if `!lhIsDockMode()`, remove `body.dock` and return. Otherwise add `body.dock` first (its padding rules define the frame), then frame = the body content box: x/y = computed padding-left/top, w = documentElement.clientWidth − left − right padding, h = documentElement.clientHeight − top − bottom padding. For each open block missing from `_dkTree`, set `_dkTree = _dkAddEdge(_dkTree, id)` (so the stored tree always holds every open block; no save here). Then `_dkVis = _dkPrune(_dkTree, _dkOpen)`, lay it out, and set `--dk-x/--dk-y/--dk-w/--dk-h` on each visible block element. Only computed numbers + 'px' are written, never stored strings. Add a ponytail comment on the reopen rule: a block that is collapsed while the arrangement is changed by a drag-drop (Task 3 builds the new tree from the visible blocks only) loses its old slot and re-docks at its home edge when reopened; divider resizes write back into `_dkTree` (Task 2) so they keep it; upgrade path = re-insert the collapsed leaf next to its old sibling.
   - Top level: `LH_MQ_DOCK.addEventListener('change', () => syncCenterPanel());`. Window resize is already covered by js/report.js calling syncCenterPanel.

3. js/panels.js syncCenterPanel: guard the "both open but < 24rem → collapse the victim" block with `!lhIsDockMode()` (in dock the blocks share the screen, so nothing needs closing). After the sheet / non-sheet if-else (body classes already toggled) and before the inert loop, call `if (typeof lhDockRender === 'function') lhDockRender();`. In sheet mode this also clears body.dock. Add a point 4 about dock mode to the function's header comment. Inert handling stays as it is (dock is a desktop mode).

4. css/panels.css: append a section `/* ===== 寬螢幕吸附版面（js/dock.js 加 body.dock） ===== */` at the very end of the file (so it wins same-specificity ties with the ≥ 901 rules), wrapped in `@media screen` (print keeps its own path):
   - `body.dock`: padding-left / padding-right = max(var(--page-pad), the safe-area inset, calc(var(--tab-w) + 0.25rem)), which leaves room for a collapsed panel's edge tab. `body.dock.lp-open` sets padding-left to max(var(--page-pad), env(safe-area-inset-left)), and `body.dock.rp-open` does the same on the right. These beat the ≥ 901 `body.lp-open` push.
   - `body.dock #mainContainer`: position absolute; left/top/width/height from the four vars; max-width none; margin 0. `body.dock .results-section { min-height: 0 }` so a short block scrolls instead of clipping.
   - `body.dock .side-panel:not(.collapsed)`: left/top/width/height from the vars; right auto; border-radius 0.75rem.
   - `body.dock .side-panel { transition: none }`: collapsing snaps instead of sliding in from a far-away rect.
   - Collapsed panels get no dock rule, so they fall back to the existing edge-drawer look.

5. index.html and the cache-bust token: add the dock.js script tag right after panels.js and before ui-common.js, with `?v=0.96.28`. ui-common's boot IIFE calls syncCenterPanel, so dock.js must already be loaded. In the same step replace the current release token on every other `?v=` in index.html (39 tags today, so 40 in total with the new one) and on the en-rhyme.json fetch in js/rhyme-map.js with 0.96.28. The about box text "v0.96 beta" stays as is.

6. New tests/dock.spec.mjs (Chinese test names like the other specs). WIDE = viewport 1920×1080 with deviceScaleFactor 1. Base storage seeds 'lh:tourSeen' '1' plus both collapse keys 'false'. Use `wordlist: 'stub'`. Add a helper that reads the boundingBox of #leftPanel, #mainContainer and #rightPanel, and a song-seeding helper copied from tests/move-selection.spec.mjs lines 6–12 that spreads the fixture first and the base seeds after it. Tests:
   (a) 三欄：body has class dock; x order lyrics < results < ai; no pairwise overlap (rectsOverlap); same top and height (±1); all fully in the viewport; results wider than lyrics; errors empty.
   (b) 收起 AI：click `#rightPanel .side-panel-tab`. The results right edge grows, the AI tab is fully in the viewport and does not overlap #mainContainer, lyrics and results stay side by side (左右二分). Click the tab again: all three boxes equal the boxes from (a) (±1).
   (c) 兩邊都收：#mainContainer fills the space between the two edge tabs with no overlap.
   (d) 不啟用與切換：at DEVICES.desktop (1440) body lacks dock and #mainContainer computed position is static. setViewportSize to 1920×1080 → dock with three columns. Back to 1440×900 → no dock, #leftPanel box x ≈ 0, #mainContainer static again. At 1920×1080 with isMobile + hasTouch → no dock.
   (e) 編輯器：in dock, click #editorOpenBtn → #lyricsEditor visible and #lyricsSections inside it. Press Escape → #lyricsSections is back inside `#leftPanel .lyrics-layout` and the #leftPanel box is unchanged (±1).
   (f) 段落選單（D-06）：seed one song with a verse 'A' and a chorus 'B'. In dock, real right-click (`click({ button: 'right' })`) the second `#lyricsSections .section-type` → #sectionMenu visible, fully in the viewport, and `document.elementFromPoint` at the menu's center lies inside #sectionMenu (no dock block covers it). Click `.swatch[aria-label="顏色：綠"]` → the second `.lyrics-section` has data-color '#48a868'. errors empty.
   (g) 移到段落（D-06）：seed verse '一二\n三四' and chorus '五' (the move-selection.spec fixture). Focus the first textarea, select [3, 5), dispatch a synthetic contextmenu on it with clientX/clientY inside its box (same as that spec's rightClick helper) → it is prevented and #moveSelMenu is visible. Click its button → #moveSelSub visible and fully in the viewport. Click the second `.move-sel-to` → `curSong().sections.map(s => s.text)` equals ['一二\n', '五\n三四']. errors empty.
   (h) 韻腳地圖（D-06）：seed a verse with F_AABB from tests/rhyme-map-ui.spec.mjs. In dock: the first section's `.rhyme-mirror .rm-hl` list of [text, data-f] equals [['光','14'],['窗','14'],['道','8'],['到','8']]; the first `.rhyme-mirror` box equals the first `.section-textarea` box (x, y, width, height ±1). Focus the textarea, set the caret at 7 and press Shift+ArrowLeft twice → #rhymeSelBar visible and fully in the viewport; click its first button → #searchInput has value '光'. errors empty.
  </action>
  <verify>
    <automated>npx playwright test tests/dock.spec.mjs tests/lyrics-editor.spec.mjs tests/move-selection.spec.mjs --reporter=line && ! grep -q "v=0\.96\.27" index.html js/rhyme-map.js && test "$(grep -o 'v=0\.96\.28' index.html | wc -l | tr -d ' ')" = 40 && grep -q "en-rhyme.json?v=0\.96\.28" js/rhyme-map.js</automated>
  </verify>
  <done>At 1920×1080 with a mouse the three blocks sit side by side, fill the frame and never overlap. Collapsing lyrics or AI reflows the rest and reopening restores the same boxes. At 1440, with touch, or at ≤ 900, body has no dock class and the old drawer geometry holds. In dock the lyrics editor moves out and back, the section menu opens on top and recolors, 移到段落 moves text, and the rhyme map paints line ends, stays aligned with its textarea and its toolbar searches. index.html carries 40 `?v=0.96.28` tags and no old token; js/rhyme-map.js fetches en-rhyme.json with 0.96.28. dock.spec (a)–(h), lyrics-editor.spec and move-selection.spec pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 拖分隔線縮放（兩側同時、最小寬高、比例寫回存的版面）＋ lh:dock 存檔／壞值回預設＋「重設版面」</name>
  <files>js/dock.js, js/safety.js, tests/scan.spec.mjs, index.html, css/panels.css, tests/dock.spec.mjs</files>
  <read_first>
    - js/safety.js 1–112（LH_KEYS、lhGetJSON、lhRemove）
    - tests/scan.spec.mjs 66–75（鍵數量斷言）
    - index.html 166–178（外觀分頁、重設顏色鈕）
    - tests/drag-lib.mjs（mouseDrag、centerOf）
  </read_first>
  <behavior>
    - Dragging the divider between lyrics and results by +120px: lyrics width +120 (±2), results −120 (±2), AI width unchanged (±1)
    - Dragging that divider far left (−2000px): lyrics width = 20rem in px (320 at 100%, ±2); results absorbs the rest; AI unchanged
    - Reload after a resize: same three widths (±1); lh:dock parses to an object with v === 1
    - Seeded bad values all give the default proportions (lyrics/results width ratio ≈ 28/44, ±0.02) with errors empty: unparseable '{oops'; three rows col(lyrics,results,ai) (not an allowed shape); duplicate leaf row(lyrics,lyrics,results); bad weights [1,-5,"x"]; missing results row(lyrics,ai)
    - Resize while collapsed keeps the slot: seed row(lyrics, col(results, ai)) and collapse AI (lyrics and results side by side). Drag their divider +100px → lyrics +100 (±2). Click the AI tab again → AI is back below results (AI x and width equal results' ±1, AI top > results bottom) and lyrics keeps the resized width (±2)
    - Rhyme map after a resize (D-06): with the F_AABB song seeded as in Task 1 test (h), after the +120px drag the first `.rhyme-mirror` box equals the first `.section-textarea` box (±1), polled until the ResizeObserver has run
    - Settings → 外觀 at 1920: #dockResetBtn visible; after a resize, clicking it restores the default widths (±1) and lh:dock reads null. At 1440 the button is hidden
  </behavior>
  <action>
Per D-03 and D-04 (and D-06 for the rhyme-map check, D-07 for wording and styling).

1. js/safety.js: add `{ key: 'lh:dock', group: 'ui' }` at the end of LH_KEYS and extend the header comment ("寬螢幕版面加入 lh:dock"). tests/scan.spec.mjs: change both 24s to 25 and update its comment. lhSet would console.error on an unregistered key, so this must land before any write.

2. js/dock.js persistence:
   - Top-level const `LH_DOCK_KEY = 'lh:dock'` (the scanner resolves top-level string consts).
   - `LH_DOCK_SHAPES` is a Set of the 7 signatures listed in the objective; `_dkSig(t)` returns 'L' for a leaf, otherwise `d + '(' + child signatures joined by ',' + ')'`.
   - `_dkValid(o)` requires: o is an object with `v === 1`. In the tree, leaves are strings that are keys of LH_DOCK_BLOCKS with no duplicates. Nodes have d of 'row' or 'col', k an array of length 2–3, and s an array of the same length whose entries are finite numbers > 0. 'results' is present, at most 3 leaves, and `_dkSig` is in LH_DOCK_SHAPES.
   - Boot: `_dkTree = lhGetJSON(LH_DOCK_KEY, null, _dkValid)?.t ?? _dkDefault()`. Bad data returns the default, and the safety layer stashes the raw value and only warns.
   - `_dkSave()` writes `JSON.stringify({ v: 1, t: _dkTree })` with lhSet.

3. js/dock.js dividers (D-03):
   - Extend `_dkPrune` to record, in a module-level WeakMap `_dkFrom`, each node it builds → { n: the source node, j: the source indices of the children it kept }. It still never mutates its input. Because lhDockRender always derives `_dkVis` from `_dkTree` by pruning (Task 1), every split node in `_dkVis` has a source node inside `_dkTree`.
   - `_dkLayout` also records one descriptor per adjacent child pair: key = node path + ':' + i, the gap strip rect (the node's full cross extent), the orientation, the source node and its two child indices (from `_dkFrom`), and both children's pixel extents a and b along the axis.
   - `_dkSyncDividers()` reuses `div.dock-divider` elements by key from a Map (so a divider being dragged survives re-layout), creates missing ones (role separator; aria-orientation 'vertical' for a row split, 'horizontal' for a col split; aria-label 拖曳調整區塊大小), writes the rect vars and removes stale ones. lhDockRender calls it; leaving dock mode removes them all.
   - Resize (mouse, button 0): on pointerdown call setPointerCapture, keep a copy of the descriptor, the start coordinate and P = the sum of the two source weights; add `.active` and `body.dock-resizing`.
   - On pointermove, clamp delta so both a + δ and b − δ stay ≥ the minimum (20rem for widths in a row split, 12rem for heights in a col split, rem read live). If a + b < 2 × min, do not move.
   - Write the pair's source weights inside `_dkTree`: first = P × (a + δ) / (a + b), second = P − first; then lhDockRender(). Writing into the stored tree instead of the pruned copy is what keeps a collapsed block's slot and weight through a resize (must_haves).
   - On pointerup / pointercancel: `_dkSave()` and remove the classes.

4. `lhDockReset()`: lhRemove(LH_DOCK_KEY), `_dkTree = _dkDefault()`, lhDockRender(), then a guarded `showToast('版面已重設')`. Collapse state is left to the tabs.

5. index.html: in #prefsPanel-look, right after the 重設顏色 button, add `<button type="button" class="reset-color" id="dockResetBtn" onclick="lhDockReset()">重設版面</button>`.

6. css/panels.css dock section:
   - `body:not(.dock) #dockResetBtn { display: none; }`.
   - `.dock-divider`: position fixed, rect from the vars, z-index 810, `touch-action: none`, `cursor: col-resize`; `[aria-orientation="horizontal"]` gets `row-resize`. A centered 2px `::after` line in var(--highlight-border) at opacity 0, opacity 1 on hover (inside `@media (hover: hover)`) and on `.active`.
   - `body.dock-resizing`: user-select none.

7. tests/dock.spec.mjs: add the behaviors above. Write them first and watch them fail, then implement. Pick the divider between lyrics and results as the vertical `.dock-divider` whose box lies between the two blocks. Use mouseDrag from tests/drag-lib.mjs. Seed layouts as `JSON.stringify({ v: 1, t: ... })` under 'lh:dock'. Reload with page.reload() followed by the same ready wait bootPage uses.
  </action>
  <verify>
    <automated>npx playwright test tests/dock.spec.mjs tests/scan.spec.mjs --reporter=line</automated>
  </verify>
  <done>Dividers resize exactly the two neighbours and respect 20rem / 12rem. A resize made while AI is collapsed keeps AI's slot, so reopening puts it back under results. The rhyme mirror stays aligned with its textarea after a resize. The layout survives reload through lh:dock. Every bad or unsupported stored value falls back to the default with no console.error. 重設版面 (dock-only) restores the default and clears the key. scan.spec passes with 25 registered keys.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: 拖標題列吸附（邊緣分割／中間互換／預覽／五種版型白名單）＋ handoff ＋ 全套回歸</name>
  <files>js/dock.js, css/panels.css, tests/dock.spec.mjs, handoff.md</files>
  <read_first>
    - js/dock.js（Task 1–2 的成果：_dkPrune、_dkSig、LH_DOCK_SHAPES、_dkRects、_dkVis、_dkSave）
    - js/word-drag.js 386–400（既有的 document pointerdown 寫法：isPrimary、button、門檻）
    - index.html 385–390、445–453（兩個標題列裡哪些是按鈕）
    - handoff.md（覆寫最上面一段，保留「先前（仍有效）」）
  </read_first>
  <behavior>
    - _dkDrop on the default tree: ('ai','results','bottom') → row(lyrics, col(results, ai)) [一大兩小，大塊在左]; ('lyrics','results','bottom') → row(col(results, lyrics), ai) [一大兩小，大塊在右]; ('lyrics','ai','center') → row(ai, results, lyrics) [互換]; ('lyrics','ai','right') → row(results, ai, lyrics) [重排三欄]; ('ai','ai','left') → null
    - _dkDrop on row(lyrics, col(results, ai)): ('lyrics','ai','left') → col(results, row(lyrics, ai)) [上下二分加下方左右再分]
    - _dkDrop on col(results, row(lyrics, ai)): ('ai','results','bottom') → null (three rows are not allowed)
    - Real mouse, default layout: drag `#rightPanel .ai-title-group` to (results center x, results top + 90% of height). Before mouseup, #dockPreview is visible over the bottom half of #mainContainer (±gap). After mouseup, AI sits below results with matching x and width (±1) and lyrics spans the full height on the left. The arrangement survives reload
    - Real mouse swap: drag `#songCurrent` to the center of #rightPanel → lyrics and AI boxes trade places (±1)
    - Seeded col(results, row(lyrics, ai)): dragging the AI handle onto the bottom edge of results shows no preview, and after mouseup the boxes are unchanged. Collapsing AI from this seed gives 上下二分 (results above lyrics, both full width)
    - Esc mid-drag hides the preview and leaves the layout unchanged. A plain click on #editorOpenBtn in dock still opens the editor
  </behavior>
  <action>
Per D-01, D-02, D-06 and D-07.

1. js/dock.js, the pure function `_dkDrop(t, src, dst, zone)` with zone one of 'left' | 'right' | 'top' | 'bottom' | 'center'. It returns a new tree, or null when the drop is not allowed. It never mutates t.
   - Return null if src equals dst or either is missing from t.
   - center: swap the two leaf ids. Weights stay put, so the blocks take each other's rects.
   - Edge: dir = 'row' for left/right and 'col' for top/bottom; before = left or top. Take t1 = `_dkPrune(t, id => id !== src)` and find dst and its parent in t1. If the parent's d equals dir, insert src next to dst on the before/after side and split dst's weight in half between them. Otherwise replace dst (in the parent, or as the root) with `{ d: dir, k: before ? [src, dst] : [dst, src], s: [1, 1] }`, which keeps dst's slot weight.
   - Return the result only if `LH_DOCK_SHAPES.has(_dkSig(result))`, otherwise null (D-02).

2. js/dock.js, the drag interaction (D-01):
   - `LH_DOCK_HANDLES` maps block id → title-row selector: lyrics '#leftPanel .lyrics-head', results '#mainContainer > .header', ai '#rightPanel .side-panel-body > .side-panel-title'.
   - One document pointerdown listener. Act only when body has dock, e.isPrimary, and mouse button 0; the target sits inside one of the three handles; and the target is not inside `button, input, select, textarea, a, label, [onclick], [role="button"], [contenteditable="true"], .model-picker`. This keeps every existing control a plain click (the about "i" span uses onclick).
   - Stay pending until the pointer moves more than 6px, so clicks and double-clicks on title text are untouched. Then start: call `window.getSelection().removeAllRanges()` (clear any native text selection begun on the title text) and add a one-line test asserting no residual selection after a drag; then body.dock-dragging, `.dock-src` on the source element, and a single lazily created `#dockPreview` div (aria-hidden, appended to body).
   - pointermove: the target is the visible block from `_dkRects` that contains the pointer, excluding src. For the zone, normalize the pointer inside the target rect. The nearest edge wins if its distance is < 0.25; otherwise the zone is center. candidate = `_dkDrop(_dkVis, src, dst, zone)`.
   - When a candidate exists, show the preview on that half of the target (edge) or the whole target (center) via the same --dk-* vars. When none exists, hide the preview and keep no candidate.
   - pointerup with a candidate: `_dkTree = candidate`, `_dkSave()`, `lhDockRender()`.
   - Every path then cleans up: classes, hidden preview, listeners. pointercancel, Escape keydown while dragging, and window blur all cancel without changing anything.
   - The drop works on `_dkVis` (visible blocks only), so a collapsed block is dropped from the new tree and re-docks at its home edge when reopened — the documented ceiling from Task 1's ponytail comment and the must_haves.

3. css/panels.css dock section:
   - The three handle selectors under body.dock: `cursor: grab` and `user-select: none`.
   - `body.dock-dragging`: `cursor: grabbing` (also on `*` inside it) and user-select none. `.dock-src` gets opacity 0.55.
   - `#dockPreview`: position fixed, rect from the vars, z-index 850 (above panels at 800, below menus at 870+), pointer-events none, border 2px solid var(--highlight-border), background var(--accent-soft), border-radius 0.75rem, a short transition on left/top/width/height, and `[hidden] { display: none }`.

4. tests/dock.spec.mjs: add the behaviors above. Write the pure _dkDrop table via page.evaluate first and see it fail, then implement, then the mouse tests. Use page.mouse down / move (steps) / check the preview / up instead of mouseDrag where the preview has to be checked mid-drag.

5. handoff.md: overwrite the top section with today's quick task 261113-lha status. List the src files with line numbers of the key functions (lhDockRender, _dkDrop, the resize handlers, lhIsDockMode), the 1600 threshold and where to tune it, and a numbered yes/no acceptance list for Andy. Keep the 「先前（仍有效）」 section.

6. Full regression (D-06): run the whole suite with `--reporter=dot`; it must end green. If a spec outside dock.spec fails, re-run that spec alone once to rule out parallel-load flakiness. If it still fails, compare it with the code from before this quick task without touching the main working tree (it holds Andy's untracked data, planning files and uncommitted edits): BASE = ddcfbad (the HEAD recorded before this quick task made any commit; it exists regardless of commit messages). Run `git worktree add --detach "$(mktemp -d)/lh-base" "$BASE"`, symlink the repo's node_modules into it, run only that spec there with `LH_TEST_PORT=4311` (so its server never collides with 4310), then `git worktree remove --force` that path. A spec that also fails at BASE is pre-existing: list it in the SUMMARY. Anything else is a regression: fix it. Never use stash, checkout, reset or clean on the main working tree.
  </action>
  <verify>
    <automated>npx playwright test tests/dock.spec.mjs --reporter=line && npx playwright test --reporter=dot</automated>
    <human-check>Mac 寬螢幕（瀏覽器視窗寬 ≥ 1600）：拖 AI 標題列到查詢區下緣看到預覽、放開變一大兩小；拖到中間互換；拖分隔線兩側一起變；收起／打開分頁會重排；深色模式下預覽框與分隔線看得清楚；設定 → 外觀 → 重設版面回三欄</human-check>
  </verify>
  <done>Edge drops split, center drops swap, and the preview matches the outcome. Only the five supported shapes (plus the 1-block state from collapsing) can appear, and refused zones show nothing. Esc cancels, and title-row buttons still click. dock.spec and the full Playwright suite pass (any failure that also fails at BASE in a throwaway worktree is listed as pre-existing). The main working tree was never stashed or reset. handoff.md has the status and the acceptance list.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| localStorage → js/dock.js | The persisted lh:dock value is untrusted: it may be corrupt, hand-edited, or come from a restored backup (the ui group is backed up) |
| layout numbers → CSS | Computed rects are written into inline CSS custom properties |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-lha-01 | Tampering | lh:dock load (lhGetJSON + _dkValid) | medium | mitigate | _dkValid checks v === 1, leaf ids against LH_DOCK_BLOCKS, no duplicates, results present, k length 2–3, finite positive weights, and the signature against the 7-entry whitelist. Anything else falls back to _dkDefault(), and safety.js stashes the raw value |
| T-lha-02 | Tampering | --dk-* style writes | low | mitigate | Only numbers computed by _dkLayout plus 'px' are written. Stored strings never reach style, innerHTML or selectors; block ids map to element ids through the fixed LH_DOCK_BLOCKS table |
| T-lha-03 | Denial of service | oversized or deeply nested stored tree | low | mitigate | The whitelist caps the tree at 3 leaves and depth 2, so render work is constant |
| T-lha-04 | Tampering (user data) | lyrics editor DOM moves | medium | mitigate | dock never moves DOM nodes (vars only), so lhEditorOpen/Close placeholders are untouched. dock.spec (e) plus the full lyrics-editor.spec guard it |
| T-lha-05 | Tampering (user data) | regression baseline check | medium | mitigate | The baseline comparison runs in a throwaway `git worktree` on a separate port; the main working tree (untracked data/wordlist.json, .planning/ phases and quick files, uncommitted handoff.md and worker/wrangler.toml) is never stashed, checked out, reset or cleaned |
| T-lha-SC | Tampering | npm/pip/cargo installs | low | accept | This plan installs no packages; Playwright and acorn are already pinned in package.json |
</threat_model>

<verification>
- `npx playwright test tests/dock.spec.mjs --reporter=line` passes. It covers the three columns, collapse reflow, mode switching, the editor, the section menu, 移到段落, the rhyme map (paint, mirror alignment, toolbar, alignment after a resize), dividers (including a resize while collapsed), persistence, bad values, reset, drag-drop shapes, refused zones and Esc — all at 1920×1080 with dock active.
- `npx playwright test --reporter=dot` (full suite) passes, so behaviour at 1280 / 1440 / tablet / phone is unchanged (D-06, D-08).
- `grep -o 'v=0\.96\.28' index.html | wc -l` prints 40.
- `grep -n "lhIsDockMode" js/layout.js js/panels.js js/dock.js` shows the helper defined only in layout.js.
- `grep -n "lh:dock" js/safety.js` shows the key registered.
- `git status --short` after execution shows the same untracked files as before (nothing stashed away).
</verification>

<success_criteria>
- At ≥ 1600px with a mouse, Andy can drag a title row to split or swap blocks and reach all five layouts, drag dividers to resize, and reload into the same layout; 重設版面 brings back three columns.
- Below 1600px, on touch devices and in ≤ 900 sheet mode, nothing changes, and the existing suite is green.
- The lyrics editor, section menu (including 移到段落) and rhyme map are each exercised in dock mode by dock.spec and behave the same.
</success_criteria>

<output>
Create `.planning/quick/261113-lha-dock-modular-layout/261113-lha-SUMMARY.md` when done
</output>
