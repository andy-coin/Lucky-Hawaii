---
phase: 05-multi-device-layout
reviewed: 2026-10-04T00:00:00Z
depth: standard
files_reviewed: 18
files_reviewed_list:
  - css/base.css
  - css/panels.css
  - css/responsive.css
  - index.html
  - js/state.js
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
  - tests/layout.spec.mjs
  - tests/render.spec.mjs
findings:
  critical: 0
  warning: 1
  info: 4
  total: 5
status: issues_found
---

# Phase 5: Code Review Report (iteration 2)

**Reviewed:** 2026-10-04
**Depth:** standard
**Files Reviewed:** 18
**Status:** issues_found

## Summary

This pass re-reviewed the Phase 5 fixes from commits a85a68d, d263258, 8936b9c, e4a24df and 81638de, and looked for new defects they introduced.

| Previous finding | Verdict |
|---|---|
| WR-01 (render colour state leaks across renders) | Fixed correctly. `colorClass` / `lastTarget` are reset at the top of `displayResults`, before the early return. `colorClass` is now declared once in `js/state.js`. The three local `const colorClass` blocks in `js/results.js` only shadow it inside their own scope. No other file declares it, so there is no duplicate `let`. `createCharCard` is only called from `_startRender`. |
| WR-02 (keyboard misfire under pinch-zoom or desktop resize) | Fixed correctly. The new gate is `scale <= 1.01`, sheet mode or `(pointer: coarse)`, then focus and the 150px test. The iOS auto-zoom-on-focus concern does not break the zoom gate, because text fields are forced to at least 16px at ≤ 900 or on coarse pointers (`css/responsive.css:703`). |
| WR-03 (Esc during IME or with a dialog open) | Fixed correctly. It checks `isComposing`, `keyCode 229`, `defaultPrevented`, and the four overlay classes. I confirmed `.show` is the open-state class for all four overlays (`css/base.css:537`, `css/panels.css:453`, `css/responsive.css:310,373`). |
| WR-04 (landscape rule hides toolbar and batch buttons) | The hiding is gone, but the replacement layout makes the results area unusably small on common landscape phone sizes. See WR-01 below. |
| WR-05 (throw in a deferred render slice leaves the UI busy) | Fixed correctly. Every `slice()` call goes through `safeSlice`, including the `_applyScroll` loop, which cannot spin because `st.ji` is forced to `jobs.length`. The `try/finally` keeps the cards built before the throw, and `made` is not incremented for the throwing card. See IN-01 for a minor leftover. |

No new critical issues. The regression tests added for WR-01, WR-02, WR-03 and WR-05 are meaningful. They poison the globals, fake `visualViewport.scale`, and dispatch real keydown events, and I found no reliability problems in them.

## Warnings

### WR-01: The WR-04 fix leaves the results area as a 30–50px sliver on common landscape phones (667×375, 740×360)

**File:** `css/responsive.css:652-659`
**Issue:** The fix removed the permanent `display:none` on `.header` and `.mobile-batch-area`. In their place it hides only `.header h1/p` and trims padding. I measured the live page with a one-character search in a touch/mobile Chromium context. `.results-section` height, new layout against the old rule injected via `addStyleTag`:

| Viewport | New | Old (header and batch area hidden) |
|---|---|---|
| 844×390 | 111px | not measured |
| 812×375 | 97px | 149px |
| 667×375 | 46px | 98px |
| 740×360 | 31px | 83px |
| 640×360 | 32px | not measured |
| 568×320 | 28px | not measured |

Everything above the results (header toolbar, search section, and the content between them) consumes about 255px, and the page itself does not scroll (`scrollHeight == innerHeight`). At 667×375 and below, not even one card row is visible, so results are unusable in landscape. That is worse than before the fix, although the old layout was also tight. The existing test only covers 844×390, so it did not catch this.

**Fix:** Do not leave the full-height header, search section and batch row stacked at ≤ 600px height. Options:
- Put `.header-toolbar` on the same row as the search box in this media query, for example `.header { position: absolute; }`, a flex row, or moving the zoom and theme cluster into the search row.
- Make `.container` / `.results-section` scroll as a whole at short heights, so results are not squeezed to `min-height: 0`.
- Hide the batch buttons only below an explicit height, for example `max-height: 420px`, and only after they are reachable elsewhere (a settings entry).
- Add a test with a floor on `.results-section` height (at least one card row) for 667×375 and 740×360.

## Info

### IN-01: A truncated render still announces "已顯示全部 N 字" and shows group counts that no longer match

**File:** `js/results.js:68-77,92-100`
**Issue:** After a `safeSlice` failure, `finish()` sets the live region to "已顯示全部 ${total} 字" and `data-render="done"`. In fact only the cards built before the throw were shown, and group titles still carry the pre-computed final "（k）". The first-batch error is also now only logged, where it was thrown out of `displayResults` before. The user sees a short list with no visible hint.
**Fix:** Track `st.failed = true` in `safeSlice`. In `finish`, announce a partial count, such as `已顯示 ${st.shown} / ${total} 字（部分字卡無法顯示）`, or render a small `.render-status` note.

### IN-02: `MediaQueryList.addEventListener('change', …)` throws on Safari < 14 (carried over, unchanged)

**File:** `js/init.js:286`, `js/search-ui.js:1034`, `js/theme.js:1078`, `js/ui-common.js:1136`
**Issue:** On Safari/iOS 13 the call throws a TypeError at top level and aborts the rest of that classic script. The project already assumes modern engines (`inert`, `:has()`, `dvh`), so this is low priority.
**Fix:** Add `lhOnMq(mql, fn)` in `js/layout.js`, falling back to `addListener`, and use it at each call site.

### IN-03: Re-running an identical query keeps the old scroll position (carried over, unchanged)

**File:** `js/results.js:~160-170` (`renderKey = currentInput + '|' + currentMode`)
**Issue:** Pressing Enter or tapping the same recent-search entry again takes the "same query" path and restores the previous `scrollTop` instead of returning to the top.
**Fix:** Clear `_lastRenderKey` in the explicit-search entry points, and keep preserve-scroll only for internal redraws (theme, options, reorder).

### IN-04: `perf` npm scripts use POSIX-only inline env assignment (carried over, unchanged)

**File:** `package.json:6-7`
**Issue:** `LH_PERF=1 playwright test …` fails under Windows `cmd`. Low priority, since the dev container is Linux.
**Fix:** Use `cross-env`, or set the variable inside `perf.spec.mjs`.

---

_Reviewed: 2026-10-04_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
