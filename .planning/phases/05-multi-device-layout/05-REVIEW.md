---
phase: 05-multi-device-layout
reviewed: 2026-10-04T00:00:00Z
depth: standard
files_reviewed: 30
files_reviewed_list:
  - css/base.css
  - css/panels.css
  - css/responsive.css
  - index.html
  - js/ai-generate.js
  - js/ai-word-events.js
  - js/cards.js
  - js/init.js
  - js/layout.js
  - js/lyrics.js
  - js/panels.js
  - js/report.js
  - js/results.js
  - js/safety.js
  - js/search-ui.js
  - js/theme.js
  - js/ui-common.js
  - package.json
  - tests/fixtures/perf-baseline.json
  - tests/helpers.mjs
  - tests/layout-lib.mjs
  - tests/layout.spec.mjs
  - tests/parity.spec.mjs
  - tests/perf.spec.mjs
  - tests/render.spec.mjs
  - tests/save-failure.spec.mjs
  - tests/scan.spec.mjs
  - tests/split-tags.spec.mjs
  - tests/style.spec.mjs
  - tests/visual.spec.mjs
findings:
  critical: 0
  warning: 5
  info: 3
  total: 8
status: issues_found
---

# Phase 5: Code Review Report

**Reviewed:** 2026-10-04
**Depth:** standard
**Files Reviewed:** 30
**Status:** issues_found

## Summary

Reviewed the Phase 5 diff (`a9e6442^..HEAD`) with emphasis on the areas called out: user data safety, the progressive card render, visualViewport/keyboard handling, matchMedia listeners, and XSS.

Checked and found sound:

- **No new XSS surface.** Everything newly written into CSS or DOM is numbers (`--ui-scale`, `--app-h`, `--vv-top`, `--kb-inset`, menu left/top) or `textContent` (render status, live region, banner text, `confirm()` message). The progressive render builds the same HTML strings as before. `_makeJob` splits the template on a control character that cannot appear in a template, and `shell` and `wsAfter` only reassemble template text.
- **Data safety holds.**
  - `_lhApplyPanelTier` and `mobileTab` never write `leftPanelCollapsed` or `rightPanelCollapsed`.
  - The only new persisted key, `lh:uiScale`, is registered in `LH_KEYS` and normalized through `lhNormalizeScale` on read.
  - `removeLyricsSection` now confirms before deleting a non-empty section.
- **Render cancellation is correct.**
  - `displayResults` bumps `_renderEpoch` first.
  - Every deferred entry point (`step`, `flushAll`) checks the epoch.
  - `_flushRender` is cleared on idle and on finish.
  - Nothing else writes `#resultsContainer.innerHTML`.
  - The shell, status-row and trailing-whitespace bookkeeping reproduces the old single-pass DOM.
- **Breakpoint listeners cover both directions.** `LH_MQ_PHONE` and `LH_MQ_SHEET` listeners re-run the batch-panel placement, placeholder, theme icon and panel tier, with the pre-move DOM position remembered.

Defects found, most serious first:

- Global render state leaks across cancelled renders, so highlight colours depend on timing.
- The keyboard heuristic misfires under pinch-zoom or a desktop window resize.
- Escape closes the sheet during IME composition.
- A short-landscape media rule removes the theme toggle, zoom controls and batch buttons with no alternative.
- A throw during a deferred render slice leaves the UI stuck in a busy state.

## Warnings

### WR-01: Progressive render leaks `colorClass` / `lastTarget` across cancelled renders, so first-group highlight colours depend on timing

**File:** `js/results.js:55` (state read and written in `js/cards.js:31-34,68-71`, declared in `js/state.js:43`)
**Issue:** `createCharCard` reads and writes the globals `colorClass` and `lastTarget`. The first card of a render keeps the old `colorClass` whenever `lastTarget === currentTarget` and `currentMode !== 'initial'`.

In the old synchronous code the carry-over into render N was always the final state of the fully completed render N-1. Now a render can be cancelled mid-way by a newer `displayResults` (new keystroke, reorder timer, option toggle). The next render then inherits colour state from a partially painted, different query.

The same query and mode can therefore produce a different highlight colour on its first group depending on typing speed or machine load. That is nondeterministic output, and it breaks the "final DOM equals old DOM" guarantee outside the golden tests, which only ever run on a fresh page.

**Fix:** Make a render independent of the previous one. Reset the globals at the start of every render, and re-baseline goldens if any shift:
```js
// js/results.js, in displayResults, right after _renderEpoch++
colorClass = '';
lastTarget = '';
```
If bit-exact legacy behaviour is required, instead snapshot `{colorClass, lastTarget}` when a render starts and restore them if that render is abandoned.

### WR-02: Keyboard detection misfires under pinch-zoom (and on desktop window-height resize), shrinking the layout to the zoomed visual viewport

**File:** `js/layout.js:389-417` (`_lhKbUpdate`)
**Issue:** The keyboard test is `_lhTextFieldFocused() && (lhStableH - vvH >= 150)`. `visualViewport.height` also shrinks when the user pinch-zooms (`vv.scale > 1`), with no keyboard. On a phone with a focused text field (the lyrics textarea is a common case), a zoom of about 1.3x or more passes the 150px test. The code then:
- writes `--app-h = vvH`, which shrinks `.container` and the sheet height;
- adds `kb-open`, which hides the tab bar;
- may add `kb-short`, which hides the header.

Layout stays broken until blur or zoom-out. `--app-h` is also consumed by ungated desktop rules (`.container` height, `.side-panel` height), and the desktop search box is autofocused. A trackpad pinch, or shrinking the window height by 150px or more while focused, therefore also writes `--app-h`. `lhStableH` never decreases unless the width changes.

**Fix:** Ignore zoomed states, and only treat it as a keyboard when the layout is in a touch or sheet context:
```js
const scale = vv ? vv.scale : 1;
const open = scale <= 1.01 && _lhTextFieldFocused()
          && (lhIsSheetMode() || matchMedia('(pointer: coarse)').matches)
          && (lhStableH - vvH >= LH_KB_THRESHOLD);
```

### WR-03: Escape closes the bottom sheet during IME composition and when a dialog sits on top

**File:** `js/panels.js:611-617`
**Issue:** The `keydown` handler collapses an open sheet on any `Escape` while `lhIsSheetMode()`. This is a Chinese lyrics tool, so users type with Zhuyin and Pinyin IMEs. On tablets with a hardware keyboard, Esc is the way to cancel a composition. Without an `e.isComposing` check (or `keyCode === 229`), cancelling a composition in the lyrics textarea also dismisses the whole sheet, and the user loses the focused field.

The handler also ignores `e.defaultPrevented`. If the settings, feedback, hashtag or about dialog is open over a sheet, one Esc collapses the sheet underneath instead of closing the topmost dialog first.

**Fix:**
```js
document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || e.isComposing || e.defaultPrevented || !lhIsSheetMode()) return;
    if (document.querySelector('.settings-overlay.show, .about-overlay.show, .hashtag-popup-overlay.show, .feedback-modal-overlay.show')) return;
    ...
});
```

### WR-04: Short-landscape rule hides the theme toggle, UI zoom controls and mobile batch-mark buttons with no alternative path

**File:** `css/responsive.css:650-655` (and `html.kb-short`, `css/responsive.css:684`)
**Issue:** At `max-width: 900px` and `max-height: 600px` (any phone in landscape), `.header, .mobile-batch-area { display: none !important; }`.
- `.header` now contains `.header-toolbar`, which holds the zoom cluster and `#themeToggle`. The old design placed those elsewhere. Neither control exists in the settings overlay, so landscape phone users cannot change theme or UI scale.
- `.mobile-batch-area` holds the three batch-mark buttons, so batch marking is unreachable in landscape. The desktop `.batch-panel.inline` is hidden at ≤440px, and landscape phones wider than 440px have the batch panel parked in the hidden area.

The `kb-short` variant is temporary, but the media-query variant is permanent for the orientation. `!important` also blocks any override.

**Fix:** Either collapse the header to a slim single row that keeps the toolbar, or expose theme, zoom and batch controls in the settings overlay when the header is hidden. At minimum, keep `.header-toolbar` out of the hidden set:
```css
@media (max-width: 900px) and (max-height: 600px) {
    .header h1, .header p { display: none; }   /* keep .header-toolbar */
    .mobile-batch-area { display: none; }      /* needs another entry point first */
}
```

### WR-05: An exception inside a deferred render slice leaves the results stuck in a busy state

**File:** `js/results.js:55,755-762`
**Issue:** `createCharCard` runs inside `requestAnimationFrame(step)`. If it throws on one malformed item (missing `zhuyin` or `pinyin` on a user override), the `step` chain dies silently. The result is:
- `data-render="more"` and `aria-busy="true"` forever;
- the "載入中… 已顯示 N / M" status row never removed;
- `lh:render-done` never fired;
- the screen-reader live region left empty;
- the remaining cards never painted.

Before this change, a throw aborted `displayResults` synchronously and surfaced immediately. Now the failure is partial and invisible, and tests would only see a hang in `settle`.

**Fix:** Guard the slice and always finish:
```js
function step() {
    if (epoch !== _renderEpoch) return;
    try {
        if (document.hidden) { flushAll(); return; }
        slice(SLICE);
    } catch (err) {
        console.error('[好韻器] render slice failed', err);
        st.ji = jobs.length;            // give up the rest, but leave a consistent DOM
    }
    if (st.ji >= jobs.length) { finish(); return; }
    updateStatus();
    requestAnimationFrame(step);
}
```
Apply the same guard to `slice(FIRST_BATCH)` and `flushAll`.

## Info

### IN-01: `MediaQueryList.addEventListener('change', …)` throws on Safari < 14, aborting later script initialisation

**File:** `js/init.js:286`, `js/search-ui.js:1034`, `js/theme.js:1078`, `js/ui-common.js:1136`
**Issue:** iOS 13 and Safari 13 only support `MediaQueryList.addListener`. `addEventListener` on an MQL throws a TypeError there. Because these are top-level statements in classic scripts, the throw aborts the remainder of that file. For `init.js` that includes `loadColors()` and the initial render. The project targets modern browsers, but `inert`, `:has()`, `dvh` and `interactive-widget` also assume new engines, so this is only worth a one-line guard.
**Fix:** Add a helper in `js/layout.js` and use it everywhere:
```js
function lhOnMq(mql, fn) { (mql.addEventListener ? mql.addEventListener('change', fn) : mql.addListener(fn)); }
```

### IN-02: Re-running the same query is treated as a "same query redraw" and keeps the old scroll position

**File:** `js/results.js:806-813`
**Issue:** `renderKey = currentInput + '|' + currentMode`. Pressing Enter or search again with identical input, or tapping the same recent-search entry, takes the "same query" path and restores the previous `scrollTop` instead of returning to the top. This is probably unintended UX, though it is not a correctness break.
**Fix:** If it matters, clear `_lastRenderKey` in the explicit-search entry points (the Enter handler and recent-item click), keeping the preserve-scroll behaviour only for internal redraws such as theme, options and reorder.

### IN-03: `perf` scripts use POSIX-only inline env assignment

**File:** `package.json:6-7`
**Issue:** `"perf": "LH_PERF=1 playwright test …"` fails under Windows `cmd`, while `golden:update` already used the same pattern. Low priority because the dev container is Linux. The recorded `tests/fixtures/perf-baseline.json` is a single-machine capture (`speedFactor` 7.35), so any timing assertion built on it is only meaningful relative to that factor.
**Fix:** Use `cross-env`, or set the env var inside `perf.spec.mjs` via an npm config argument.

---

_Reviewed: 2026-10-04_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
