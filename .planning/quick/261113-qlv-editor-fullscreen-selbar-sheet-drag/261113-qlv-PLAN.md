---
phase: quick-261113-qlv
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - css/panels.css
  - css/responsive.css
  - js/panels.js
  - js/rhyme-map.js
  - js/safety.js
  - index.html
  - tests/workflow-polish.spec.mjs
  - tests/move-selection.spec.mjs
  - tests/line-analysis-ui.spec.mjs
  - tests/line-journey.spec.mjs
  - tests/scan.spec.mjs
autonomous: true
requirements: [QUICK-261113-qlv]

estimate:
  tokens: 90000
  raw_tokens: 90000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "完整歌詞編輯器（#lyricsEditor .lyrics-editor）幾乎全螢幕：上緣留 --pad-t，左右下留 max(--page-pad, 安全區)，和 body／dock 外框用同一組變數。非 dock 桌機 1440×900：左右各 20px（= --page-pad），上下緣與展開的 #leftPanel 上下緣對齊。dock 1920×1080：四邊和三塊（#leftPanel、#mainContainer、#rightPanel）合起來的外框對齊"
    - "鍵盤開啟（html.kb-open）時，編輯器仍貼滿可見範圍（遮罩不留白，x = 0、寬 = 視窗寬）；既有 kb-open 規則照舊"
    - "桌機選字浮動列 #rhymeSelBar 直接顯示「移到段落 ▸」（在「指定讀音」之後、最後一顆），點了直接開 #moveSelSub（不經 #moveSelMenu 根選單），移完 Cmd+Z 一步復原；文字框右鍵選單照舊"
    - "≤ 900px 的歌詞 sheet 與 AI 建議 sheet：把手往上拖加高（上限可見高度 95%）、往下拖縮小、放開時低於 30% 就收起；滑鼠與觸控都能拖（Pointer Events），只點一下照樣是收起"
    - "拖過的高度以可見高度比例存在 localStorage 的 lh:sheetH（登記在 LH_KEYS，總數 26），兩個 sheet 共用、重新整理還在；壞值、超出 0.3–0.95 的值回到預設（78%、最高 52rem），不報錯"
    - "版本號 0.96.29：index.html 的 40 個 ?v=、js/rhyme-map.js 的 en-rhyme fetch、資訊面板「版本 v0.96.29 beta」"
    - "全套 Playwright（--reporter=dot）除了 base 1391af2 既有的失敗（golden.spec 約 30 個、scan.spec「catch: 程式碼裡沒有吞錯的 catch」、sections-audit「檢查：沒有新增動畫」、rhyme-map-ui「鏡像對齊：與文字框逐像素相同」）外全部通過"
  artifacts:
    - path: "css/panels.css"
      provides: ".lyrics-editor-overlay 用 --pad-t／--page-pad 留白、.lyrics-editor 撐滿遮罩；html.kb-open 時遮罩不留白"
      contains: "html.kb-open .lyrics-editor-overlay"
    - path: "css/responsive.css"
      provides: "≤ 900 的 .sheet-handle 加 touch-action: none；html[data-sheet-h] .side-panel 照存的比例算高度"
      contains: "html[data-sheet-h] .side-panel"
    - path: "js/panels.js"
      provides: "底部 sheet 把手拖曳：開機套用 lh:sheetH、pointerdown/move/up、拉低收起、點一下收起（拖過不算點）"
      contains: "lh:sheetH"
    - path: "js/rhyme-map.js"
      provides: "lhMapShowBar 不再依指標類型藏「移到段落 ▸」；按鈕順序 look, ai, an, rd, mv；en-rhyme fetch ?v=0.96.29"
      contains: "en-rhyme.json?v=0.96.29"
    - path: "js/safety.js"
      provides: "LH_KEYS 登記 { key: 'lh:sheetH', group: 'ui' }"
      contains: "lh:sheetH"
    - path: "tests/workflow-polish.spec.mjs"
      provides: "編輯器留白（非 dock、dock、kb-open）與 sheet 把手拖曳（滑鼠、觸控、存檔、壞值、拉低收起）的測試"
  key_links:
    - from: ".lyrics-editor-overlay padding"
      to: "css/base.css --pad-t／--page-pad（body padding、js/dock.js 的外框都由它算）"
      via: "同一組 CSS 變數，不寫死數字"
      pattern: "var\\(--pad-t\\)"
    - from: "js/panels.js 把手 pointermove"
      to: "html[data-sheet-h] .side-panel { height: calc(var(--app-h) * var(--sheet-r)) }"
      via: "documentElement 上的 --sheet-r 與 data-sheet-h"
      pattern: "--sheet-r"
    - from: "開機"
      to: "lhGetJSON('lh:sheetH', null, 驗證 0.3–0.95 的數字)"
      via: "壞值回 null → 不設 data-sheet-h → CSS 預設 78%"
      pattern: "lhGetJSON\\(LH_SHEET_KEY"
    - from: "#rhymeSelBar .rm-bar-move click"
      to: "js/sections.js lhMoveSelOpenSub(snap, …) → lhSecMoveText"
      via: "既有點擊處理（觸控已在用），桌機只是不再藏起來"
      pattern: "lhMoveSelOpenSub\\(snap"
---

<objective>
三項寫詞體驗修整：(1) 完整歌詞編輯器改成幾乎全螢幕，四邊留白和主畫面三塊的外框間距相同；(2) 桌機選字浮動列直接有「移到段落 ▸」，不用再按右鍵；(3) 手機／平板底部 sheet 的把手可以拖曳改高度並記住。

No CONTEXT.md (quick mode), so there are no D-XX decisions. The task description is the spec. Design choices (kept as small as the requirements allow):
- (1) Only CSS. The page frame comes from css/base.css: `--pad-t` (top, includes the safe area), `--page-pad` (20px desktop, 16px ≤ 900, 12px ≤ 440). The body padding and the js/dock.js frame are built from these same variables. The overlay gets that padding and the editor fills it. Bottom uses `max(var(--page-pad), env(safe-area-inset-bottom))` rather than `--pad-b`, because `--pad-b` adds `--body-extra` (the tab bar height ≤ 900) and the overlay covers the tab bar anyway. Above 900 the two are equal.
- (2) Remove the one line that hides the button on fine pointers. Move the button after 「指定讀音」 in the bar's append order. Two reasons: the existing keyboard test (three ArrowRight presses reach 指定讀音) stays valid, and the editing action sits last, after the lookup and analysis actions, on both desktop and touch.
- (3) One CSS rule plus one small JS block in js/panels.js, which owns mobileTab. The stored value is a ratio of the visible height, so it survives rotation. Both sheets share one key, which is the single new key the spec asks for. The handle's inline `onclick` moves into JS so a drag can't also fire the close click.

Purpose: Andy writes lyrics on a computer and on a phone or tablet. On a big screen the editor should use the whole screen. Moving selected text shouldn't require a right-click. The sheet height should fit what he is doing.
Output: edits to css/panels.css, css/responsive.css, js/panels.js, js/rhyme-map.js, js/safety.js and index.html; the new tests/workflow-polish.spec.mjs; synced expectations in four existing spec files; version 0.96.29.

Out of scope: resizing the sheet from the keyboard (the handle stays a 「關閉面板」 button for keyboard users), separate heights per sheet, and changing the desktop right-click menu.
</objective>

<execution_context>
@/Users/Shared/Coding Projects/Lucky Hawaii/.claude/gsd-core/workflows/execute-plan.md
@/Users/Shared/Coding Projects/Lucky Hawaii/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.claude/CLAUDE.md

<execution_notes>
- The working tree has unrelated uncommitted and untracked files (handoff.md, worker/wrangler.toml, .planning/ phase dirs, data/wordlist.json, …). Stage ONLY the files this plan changes, by explicit path (`git add css/panels.css index.html …`). Never `git add -A` / `git add .`. Never stash, checkout, reset or clean the main tree.
- One commit per task: `feat(quick-261113-qlv): …` in Traditional Chinese, like the earlier quick commits.
- After the last commit, push the branch: `git push origin gsd/v0.96-stabilize`. The user has authorised this; the branch is the live GitHub Pages source.
- Full regression: `npx playwright test --reporter=dot`. Failures already present at base 1391af2 are golden.spec (~30), scan.spec 「catch: 程式碼裡沒有吞錯的 catch」 (js/rhyme-map.js), sections-audit 「檢查：沒有新增動畫」 and rhyme-map-ui 「鏡像對齊：與文字框逐像素相同」 (line 280). Any other failure is a regression and must be fixed before finishing. Do not add new `catch` blocks that swallow errors, and do not add `@keyframes`/animations.
- Code style: vanilla JS with no build step, 4-space indent, Chinese comments, Traditional Chinese UI text. CSS sizes in rem or vars: tests/layout.spec.mjs fails any `px` > 4 in size properties, except as the first argument of `max()`. Only js/safety.js may touch localStorage directly; everything else uses `lhGet`/`lhSet`/`lhGetJSON` (scan.spec enforces this).
- At the end, overwrite the short "current status" part of handoff.md: what changed, with file and line references, and what Andy should test. Leave handoff.md unstaged, because it already carries unrelated uncommitted edits.
</execution_notes>

<interfaces>
Existing globals and facts the executor needs (all classic scripts, global scope):
- css/base.css :root — `--page-pad: 20px` (css/responsive.css sets 16px at ≤ 900 and 12px at ≤ 440), `--pad-t: max(var(--page-pad), env(safe-area-inset-top))`, `--pad-b: calc(max(var(--page-pad), env(safe-area-inset-bottom)) + var(--body-extra))`, `--app-h: 100dvh` (js/layout.js overwrites it with px only while html.kb-open), `--vv-top`. `* { box-sizing: border-box }`.
- Panel frame: above 900 and not in dock, `.side-panel` has `top: var(--pad-t)` and `height: calc(var(--app-h) - var(--pad-t) - var(--page-pad))`, so it sits --page-pad above the bottom edge. In dock (body.dock, js/dock.js `lhDockRender`) the frame is the body padding (left/right `max(var(--page-pad), env(safe-area-inset-*))` when both panels are open, top --pad-t, bottom --pad-b), with a 0.5rem gap between blocks.
- css/panels.css ~2136–2164: `.lyrics-editor-overlay` (position fixed, left/right 0, `top: var(--vv-top)`, `height: var(--app-h)`, flex-centred, z-index 950) and `.lyrics-editor` (`width: 90vw; height: 90%; max-width: 75rem; …`). ~2315–2316: `html.kb-open .lyrics-editor { width: 100vw; max-width: none; height: 100%; border-radius: 0; padding: var(--sp-2); gap: var(--sp-1); }`. js/lyrics.js `lhEditorOpen`/`lhEditorClose` (not modified). The overlay closes when a pointerdown and click both land on the overlay itself (lyrics.js ~441), so clicks in the new padding still close it.
- js/rhyme-map.js `lhMapBarBuild` (~1142): it builds look, ai, an, mv (`.rm-bar-move`, text 「移到段落 ▸」, aria-haspopup menu, aria-controls moveSelSub), rd (`.rm-bar-rd`) and row (`.rm-bar-reading`), then calls `bar.append(look, ai, an, mv, rd, row)`. The mv click handler already calls `lhMoveSelOpenSub(snap, r.left, r.bottom + 4, e.detail === 0, r)`. ArrowLeft/Right cycle the visible buttons in DOM order. `lhMapShowBar` (~1257): `bar.querySelector('.rm-bar-move').hidden = matchMedia(_LH_FINE).matches;`. `_LH_FINE` is defined in js/sections.js:707 and used elsewhere there; leave it in place.
- js/sections.js: `lhMoveSelOpenSub(snap, x, y, byKeyboard, anchorRect)` (~1210) opens `#moveSelSub` directly and hides `#moveSelMenu`. `lhSecMoveText` (~1086) is one undo step; on fine pointers it focuses the destination textarea, so `ControlOrMeta+z` undoes.
- js/panels.js: `mobileTab(tab)` (~89): 'search' collapses both sheets and hides the backdrop. `syncCenterPanel()`. js/layout.js: `lhIsSheetMode()` (`(max-width: 900px)`), loaded in head.
- index.html 383 and 443: `<button type="button" class="sheet-handle" aria-label="關閉面板" onclick="mobileTab('search')"></button>` inside #leftPanel and #rightPanel. js/panels.js loads at ~518, after both. tests/layout.spec.mjs ~877 asserts every handle is [BUTTON, 'button', '關閉面板'], and ~861 taps the handle to close.
- css/responsive.css 13–60 (inside `@media (max-width: 900px)`): `.side-panel { … height: min(calc(var(--app-h) * 0.78), 52rem); … }`. `.sheet-handle { … height: var(--hit); cursor: pointer; … }`. ~660: `html.kb-open .side-panel:not(.collapsed) { top: var(--vv-top); bottom: auto; height: var(--app-h); border-radius: 0; }` (specificity 0,3,1). css/panels.css:1935 hides `.sheet-handle` on desktop.
- js/safety.js: `LH_KEYS` (25 entries, last `{ key: 'lh:dock', group: 'ui' }`); `lhGetJSON(key, fallback, validate)` returns fallback for missing, corrupt or invalid values (it stashes the corrupt raw and only console.warns); `lhSet(key, value)` logs console.error for unregistered keys, so register the key first. Pattern to copy: js/dock.js:45 and :152.
- index.html: 40 occurrences of `?v=0.96.28`; ~143 `<p>版本 v0.96.28 beta</p>`. js/rhyme-map.js:156 `fetch('data/en-rhyme.json?v=0.96.28')`.
- Tests: tests/helpers.mjs `bootPage(browser, { storage, device, wordlist: 'stub' })` → `{ context, page, errors }`. Storage is seeded once through storageState, so `page.reload()` keeps what the page wrote. `errors` collects pageerror and console.error. tests/layout-lib.mjs `DEVICES.desktop` (1440×900), `DEVICES.phone` (390×844, touch), `waitStill(page)`. tests/drag-lib.mjs `centerOf(locator)`, `mouseDrag(page, from, to, steps = 8)`, `touchSession(page)` → `.drag(from, to, steps)` (real CDP touch, so pointer capture works). Song seeding and openLeft: tests/lyrics-editor.spec.mjs lines 7–20. Dock setup: tests/dock.spec.mjs lines 8–16 (`WIDE` 1920×1080, `BASE_SEEDS` opens both panels, `boot`). Seed `'lh:tourSeen': '1'`.
- Tests that assert the desktop bar today: tests/move-selection.spec.mjs:162 (「桌機：浮動列的「移到段落 ▸」是隱藏的」, plus the line-1 header comment); tests/line-analysis-ui.spec.mjs:1304 and :1402 and tests/line-journey.spec.mjs:139 (`button:visible` lists 「🔍 查韻：…」「✨ AI 建議」「📏 分析」); tests/rhyme-map-ui.spec.mjs:1349–1351 (three ArrowRight presses reach 指定讀音, which stays valid with the new order). tests/scan.spec.mjs:73–74 expects 25 keys.
</interfaces>
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: 完整編輯器幾乎全螢幕（留白＝頁面外框變數，dock／非 dock／kb-open 都對）＋ 版號 0.96.29</name>
  <files>css/panels.css, index.html, js/rhyme-map.js, tests/workflow-polish.spec.mjs</files>
  <read_first>
    - css/panels.css 2135–2165 and 2315–2316 (overlay, editor, kb-open editor rule); 14–50 (panel frame above 900); 2405–2415 (body.dock padding)
    - css/base.css 50–62 (--page-pad, --pad-t, --pad-b)
    - tests/lyrics-editor.spec.mjs 1–50 (seeding, openLeft, open and close flow) and tests/dock.spec.mjs 1–30, 99–111 (dock boot, editor in dock)
  </read_first>
  <behavior>
    - Non-dock, DEVICES.desktop 1440×900, left panel open, #editorOpenBtn clicked: let pad be the --page-pad value read through getComputedStyle(document.documentElement) (20). The `.lyrics-editor` box has x ≈ pad, 1440 − (x + width) ≈ pad, y ≈ the #leftPanel box y, and 900 − (y + height) ≈ 900 − (#leftPanel y + height). Tolerance 1px.
    - Dock, WIDE 1920×1080 with both panels open (body has class dock): the editor box left ≈ the smallest x of the three blocks (#leftPanel, #mainContainer, #rightPanel), top ≈ the smallest y, right ≈ the largest right edge, bottom ≈ the largest bottom edge. Tolerance 1px.
    - With the editor open, adding class kb-open to documentElement (page.evaluate) makes the `.lyrics-editor` box x ≈ 0 and width ≈ the viewport width. Removing the class restores the padded box.
    - errors is [] in every case.
  </behavior>
  <action>
    Write the three behaviours above into a new tests/workflow-polish.spec.mjs first. Header comment: 「// 寫詞體驗修整（quick 261113-qlv）：完整編輯器全螢幕、桌機浮動列移到段落、底部 sheet 拖曳高度」. Reuse the seeding helpers copied from tests/lyrics-editor.spec.mjs (FIXTURE, typed, song, storage, openLeft) and the WIDE/BASE_SEEDS constants from tests/dock.spec.mjs; copy the few lines rather than importing between spec files. Run the file and watch the first two tests fail.

    Then change css/panels.css. On `.lyrics-editor-overlay`, add a padding of `var(--pad-t)` on top, `max(var(--page-pad), env(safe-area-inset-right))` on the right, `max(var(--page-pad), env(safe-area-inset-bottom))` on the bottom and `max(var(--page-pad), env(safe-area-inset-left))` on the left. Comment in Chinese: the four margins equal the main frame's gutter (the same variables as the body padding and the js/dock.js frame); the bottom drops --body-extra because the overlay covers the bottom tab bar. On `.lyrics-editor`, set width 100% and height 100% and delete the 90vw, 90% and max-width 75rem values. Update the section header comment to say it is now almost full screen. Next to the existing `html.kb-open .lyrics-editor` rule (~2316), add `html.kb-open .lyrics-editor-overlay { padding: 0; }` so the keyboard layout still fills the visible area. Leave every other kb-open rule untouched.

    Version bump: replace every `?v=0.96.28` in index.html with `?v=0.96.29` (40 occurrences). Change the about line (~143) to 「版本 v0.96.29 beta」. Change the en-rhyme fetch in js/rhyme-map.js:156 to `?v=0.96.29`.

    Run the verify command, commit by explicit path (css/panels.css index.html js/rhyme-map.js tests/workflow-polish.spec.mjs) with a message like 「feat(quick-261113-qlv): 完整編輯器幾乎全螢幕，四邊留白沿用頁面外框間距；版號 0.96.29」.
  </action>
  <verify>
    <automated>npx playwright test tests/workflow-polish.spec.mjs tests/lyrics-editor.spec.mjs tests/dock.spec.mjs --reporter=line && test "$(grep -o 'v=0\.96\.29' index.html | wc -l | tr -d ' ')" = 40 && ! grep -q "0\.96\.28" index.html js/rhyme-map.js && grep -q "en-rhyme.json?v=0\.96\.29" js/rhyme-map.js && grep -q "版本 v0\.96\.29 beta" index.html</automated>
  </verify>
  <done>The editor margins match the page frame in non-dock and dock mode. kb-open still fills the screen. lyrics-editor.spec and dock.spec stay green. The version reads 0.96.29 everywhere. Committed.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 桌機選字浮動列直接顯示「移到段落 ▸」，點了開子選單；同步既有測試</name>
  <files>js/rhyme-map.js, tests/move-selection.spec.mjs, tests/line-analysis-ui.spec.mjs, tests/line-journey.spec.mjs</files>
  <read_first>
    - js/rhyme-map.js 1142–1190 (lhMapBarBuild: buttons, append order, mv click) and 1243–1263 (lhMapShowBar)
    - js/sections.js 1195–1230 (lhMoveSelOpenSub)
    - tests/move-selection.spec.mjs 1–57 (helpers, the right-click flow and its undo assertions) and 134–170 (kbSelect, the touch test, the desktop "hidden" test)
  </read_first>
  <behavior>
    - Desktop (default bootPage device, fine pointer) with the `two()` storage: after kbSelect, `#rhymeSelBar .rm-bar-move` is visible with text 「移到段落 ▸」.
    - Clicking it hides #rhymeSelBar, shows #moveSelSub and keeps #moveSelMenu hidden. Clicking `.move-sel-to` nth(1) (Chorus) makes the texts `['一二\n', '五\n三四']`, and the stored texts match.
    - `ControlOrMeta+z` restores `['一二\n三四', '五']`. errors is [].
    - The right-click tests in the same file still pass unchanged.
  </behavior>
  <action>
    In tests/move-selection.spec.mjs, replace the test 「桌機：浮動列的「移到段落 ▸」是隱藏的」 (~162) with 「桌機：浮動列的「移到段落 ▸」直接開子選單，移完可復原」 implementing the behaviour above. Model it on the touch test just above it, using click instead of tap and the same `ControlOrMeta+z` undo as the first test in the file. Update the line-1 header comment to say desktop has both the right-click menu and the floating bar. Run it and watch it fail.

    In js/rhyme-map.js `lhMapShowBar`, delete the line that sets `.rm-bar-move` hidden from the fine-pointer media query. The button is now always shown, because any lyric selection can be moved. In `lhMapBarBuild`, change the append order to look, ai, an, rd, mv, row, so the editing action comes last and the ArrowRight path to 指定讀音 stays three presses. Update the mv creation comment (it currently says touch only) to say desktop and touch both have it, and desktop can still right-click.

    Sync the desktop visible-button expectations by appending 「移到段落 ▸」 to the lists at tests/line-analysis-ui.spec.mjs:1304 and :1402 and tests/line-journey.spec.mjs:139. Then run the files in the verify command. Treat any other failure whose only cause is the newly visible button (a button count, the bar width, or a placement next to the analysis panel) the same way: update the expectation to include the button, and never hide the button again. Commit by explicit path with a message like 「feat(quick-261113-qlv): 桌機選字浮動列直接顯示「移到段落 ▸」，點了開子選單；同步測試」.
  </action>
  <verify>
    <automated>npx playwright test tests/move-selection.spec.mjs tests/line-analysis-ui.spec.mjs tests/line-journey.spec.mjs tests/rhyme-audit.spec.mjs tests/rhyme-journey.spec.mjs tests/line-audit.spec.mjs --reporter=dot && npx playwright test tests/rhyme-map-ui.spec.mjs --reporter=dot --grep-invert "鏡像對齊：與文字框逐像素相同" && ! grep -q "rm-bar-move').hidden" js/rhyme-map.js</automated>
  </verify>
  <done>On desktop the floating bar shows 「移到段落 ▸」 and clicking it moves the selection through #moveSelSub, with one undo step. The right-click menu is unchanged. All listed specs are green, apart from the known rhyme-map-ui line-280 test. Committed.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: 底部 sheet 把手拖曳改高度（滑鼠＋觸控、95% 上限、拉低收起、存 lh:sheetH）＋ 全套回歸 ＋ push</name>
  <files>css/responsive.css, js/panels.js, js/safety.js, index.html, tests/workflow-polish.spec.mjs, tests/scan.spec.mjs</files>
  <read_first>
    - css/responsive.css 1–60 (the sheet .side-panel and .sheet-handle) and 650–666 (the kb-open sheet rule)
    - js/panels.js 85–125 (mobileTab and the Esc handler; the new block goes after them)
    - js/dock.js 45, 150–158, 185–220 (lhGetJSON with a validator, lhSet, the pointer-capture drag pattern)
    - js/safety.js 9–35 (LH_KEYS) and tests/scan.spec.mjs 66–75
  </read_first>
  <behavior>
    - Mouse, viewport 800×900 without touch (sheet mode by width), lyrics sheet opened by clicking #mtab-lyrics. Take h0 as the #leftPanel height. A mouseDrag of the handle centre up by 100px makes the height ≈ h0 + 100 (±2). The panel stays open (no class collapsed). Parsing localStorage 'lh:sheetH' gives ≈ (h0 + 100) / 900 (±0.01).
    - A further drag to y = 0 caps the height at ≈ 0.95 × 900 (±2). After switching to the AI sheet (#mtab-ai), #rightPanel has the same height.
    - After page.reload() and reopening the lyrics sheet, the height is still ≈ 0.95 × 900.
    - Dragging the handle down to near the bottom (y = 890) collapses #leftPanel, and 'lh:sheetH' keeps its previous value. Reopening shows the previous height.
    - Touch, DEVICES.phone. Tap #mtab-ai, then use touchSession().drag on the handle centre up by 150 → the #rightPanel height ≈ h0 + 150 (±2). Then tap the handle with locator.tap() (no movement) → the sheet closes.
    - The computed touchAction of `.sheet-handle` is 'none'; that of `#leftPanel .side-panel-body` is not 'none'.
    - Boot with 'lh:sheetH' seeded as 'abc', '5', '0.1' and '"0.9"' in turn (desktop 800×900): the lyrics sheet height ≈ min(0.78 × 900, 52rem) = 702 (±2). Seeding '0.9' gives ≈ 810. errors is [] for all.
    - tests/scan.spec.mjs: LH_KEYS has 26 entries, all unique.
  </behavior>
  <action>
    First, add the behaviours above to tests/workflow-polish.spec.mjs, using mouseDrag, touchSession and centerOf from tests/drag-lib.mjs and waitStill. Change tests/scan.spec.mjs:73–74 from 25 to 26 and extend the comment with 「底部面板高度加入 lh:sheetH」. Run them and watch them fail.

    In js/safety.js, append `{ key: 'lh:sheetH', group: 'ui' }` to LH_KEYS after lh:dock.

    In css/responsive.css, inside the existing `@media (max-width: 900px)` block:
    - On `.sheet-handle`, add `touch-action: none` (only on the handle, so the sheet body still scrolls) and change `cursor: pointer` to `cursor: ns-resize` so mouse users can see it drags.
    - Right after the `.side-panel` sheet rule, add `html[data-sheet-h] .side-panel { height: calc(var(--app-h) * var(--sheet-r)); }`. Chinese comment: after a drag, the height follows the stored ratio (0.3–0.95) without the 52rem cap; html.kb-open has higher specificity, so it still fills the visible height when the keyboard is open.
    - Update the comment above the sheet rule (78%) to mention that dragging the handle can change it.

    In index.html, remove `onclick="mobileTab('search')"` from both `.sheet-handle` buttons. Keep type="button" and aria-label="關閉面板" exactly as they are.

    In js/panels.js, after the Esc handler, add a section `// ==================== 底部 sheet：把手拖曳調整高度 ====================` with Chinese comments:
    - Constants `LH_SHEET_KEY = 'lh:sheetH'`, `LH_SHEET_MIN = 0.3` (the smallest height that is kept; releasing below it closes the sheet) and `LH_SHEET_MAX = 0.95`.
    - Helper `_lhSheetApply(r)`. With a number, it sets `--sheet-r` to r on document.documentElement.style and sets the `data-sheet-h` attribute. With null, it removes both.
    - At load, call `_lhSheetApply(lhGetJSON(LH_SHEET_KEY, null, v => typeof v === 'number' && v >= LH_SHEET_MIN && v <= LH_SHEET_MAX))`. Bad values give the default.
    - A module variable `_lhSheetDragged` (false).
    - For each `.sheet-handle`, add a click listener: if `_lhSheetDragged` is set and `e.detail !== 0` (a pointer click right after a drag), clear the flag and return; otherwise call `mobileTab('search')`. Keyboard Enter or Space always closes.
    - Add a pointerdown listener that returns unless `lhIsSheetMode()`, `e.isPrimary` and `e.button === 0`. Then:
      - Reset `_lhSheetDragged` to false. Record startY = e.clientY, the panel (`handle.closest('.side-panel')`), startH from its getBoundingClientRect().height, vh = innerHeight, and prev, the current `--sheet-r` as a number, or null when data-sheet-h is absent. Call setPointerCapture.
      - On pointermove: dy = clientY − startY. Ignore moves until |dy| ≥ 6. After that, mark dragging and apply r = clamp((startH − dy) / vh, 0.05, LH_SHEET_MAX) live through `_lhSheetApply`.
      - On pointerup: remove the listeners. If the pointer never dragged, return so the click closes the sheet as before. Otherwise set `_lhSheetDragged = true`. If the last r is below LH_SHEET_MIN, call `_lhSheetApply(prev)` and `mobileTab('search')`; nothing is saved. Otherwise save with `lhSet(LH_SHEET_KEY, JSON.stringify(Math.round(r * 1000) / 1000))`.
      - On pointercancel: remove the listeners and call `_lhSheetApply(prev)`.

    No new animation. No catch blocks.

    Run the verify command. Then run the full regression `npx playwright test --reporter=dot` and compare the failures with the known base set in execution_notes. Fix anything else. Commit by explicit path (css/responsive.css js/panels.js js/safety.js index.html tests/workflow-polish.spec.mjs tests/scan.spec.mjs) with a message like 「feat(quick-261113-qlv): 底部 sheet 把手可拖曳調整高度（滑鼠＋觸控、上限 95%、拉低收起），存 lh:sheetH」. Then `git push origin gsd/v0.96-stabilize`. Update handoff.md last and leave it unstaged.
  </action>
  <verify>
    <automated>npx playwright test tests/workflow-polish.spec.mjs tests/layout.spec.mjs tests/lyrics-editor.spec.mjs tests/scan.spec.mjs --reporter=dot --grep-invert "程式碼裡沒有吞錯的 catch" && grep -q "'lh:sheetH'" js/safety.js && ! grep -q "sheet-handle[^>]*onclick" index.html</automated>
  </verify>
  <done>Both sheets resize by dragging the handle with a mouse or by touch, capped at 95%. Dragging very low closes the sheet, and a plain tap still closes it. The height persists in lh:sheetH, and bad values fall back to the default. Existing sheet and layout tests stay green. The full regression shows only the known base failures. Committed and pushed to origin gsd/v0.96-stabilize.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| localStorage → js/panels.js | lh:sheetH is untrusted: it may be corrupt, hand-edited, or restored from a backup (the ui group is backed up) |
| sheet ratio → inline CSS | The ratio is written into the custom property --sheet-r on <html> |
| repo working tree | Unrelated uncommitted and untracked user files live beside this work |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-qlv-01 | Tampering | lh:sheetH load (lhGetJSON plus a validator) | low | mitigate | The validator accepts only a JSON number in [0.3, 0.95]. Anything else returns null, so CSS falls back to the default 78% and safety.js stashes the raw value. Covered by the bad-value test in tests/workflow-polish.spec.mjs |
| T-qlv-02 | Tampering | --sheet-r style write | low | mitigate | Only a number computed from pointer coordinates and clamped to [0.05, 0.95], or the validated stored number, reaches style.setProperty. Stored strings never reach innerHTML, selectors or attributes |
| T-qlv-03 | Denial of service | the handle's drag versus click | low | mitigate | After a real drag (≥ 6px), the `_lhSheetDragged` flag swallows the one trailing pointer click, so a resize can't also close the sheet. Keyboard clicks (detail 0) always close, so the close button stays usable |
| T-qlv-04 | Tampering (user data) | moving selected text from the desktop bar | medium | mitigate | It reuses lhMoveSelOpenSub and lhSecMoveText unchanged: a stale snapshot changes nothing, and the move is one undo step. The new desktop test asserts the stored texts and the Cmd+Z restore |
| T-qlv-05 | Tampering (user data) | git operations in a dirty tree | medium | mitigate | Files are staged by explicit path only. There is no stash, checkout, reset or clean, and handoff.md is left unstaged |
| T-qlv-SC | Tampering | npm/pip/cargo installs | low | accept | No packages are installed; Playwright is already pinned in package.json |
</threat_model>

<verification>
- `npx playwright test tests/workflow-polish.spec.mjs --reporter=line` passes: editor margins (non-dock, dock, kb-open) and sheet drag (mouse, touch, persistence, bad values, drag-low close, tap close, touch-action).
- tests/move-selection.spec.mjs passes, including the new desktop floating-bar flow and the unchanged right-click tests.
- `npx playwright test --reporter=dot` shows only the known base failures (golden.spec, scan.spec 「catch: 程式碼裡沒有吞錯的 catch」, sections-audit 「檢查：沒有新增動畫」, rhyme-map-ui 「鏡像對齊：與文字框逐像素相同」).
- `grep -o 'v=0\.96\.29' index.html | wc -l` prints 40, and no 0.96.28 is left in index.html or js/rhyme-map.js.
- `git status --short` lists the same unrelated files as before execution (plus the unstaged handoff.md edit), and `git log origin/gsd/v0.96-stabilize -3` shows the three new commits.
</verification>

<success_criteria>
- Double-clicking a lyric opens an editor that fills the screen, apart from a margin equal to the main page's panel gutter, on a normal desktop, in wide dock mode and on phones. With the keyboard open it still fills the visible area.
- On desktop, selecting lyric text shows 「移到段落 ▸」 on the floating bar, and one click opens the section list. Right-click still works.
- On a phone or tablet, Andy can drag either sheet's handle up (to 95%), drag it down, or drag it very low to close. The height is remembered after reload.
- Version 0.96.29 is deployed through the pushed branch.
</success_criteria>

<output>
Create `.planning/quick/261113-qlv-editor-fullscreen-selbar-sheet-drag/261113-qlv-SUMMARY.md` when done
</output>
