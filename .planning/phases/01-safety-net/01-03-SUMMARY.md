---
phase: 01-safety-net
plan: 03
subsystem: storage-safety
tags: [localStorage, save-failure-banner, key-registry, acorn-scan, corrupt-json, rename-only-refactor]

requires:
  - phase: 01-01
    provides: "tests/helpers.mjs, npm test, golden baseline"
  - phase: 01-02
    provides: "smoke suite, tests/fixtures/v096-localStorage.json"
provides:
  - "js/safety.js: LH_KEYS (16) + apiKey_ prefix registry, LH_META_KEYS, LH_EXCLUDED_KEYS, lhWarn/lhGet/lhGetJSON/lhSet/lhRemove, LH_CORRUPT_KEYS, lhSaveFailed(kind) banner"
  - "index.html loads js/safety.js?v=0.96.1 in head; all 49 storage calls go through lhGet/lhSet/lhRemove; the 3 boot JSON reads use lhGetJSON"
  - "Sticky, dismissible, 60 s throttled, theme-readable 存檔失敗 banner (#lhSaveBanner), plain Traditional Chinese, no modal"
  - "tests/scan-lib.mjs (collectSources, parseAny, walk, findStorageUsages, topLevelStringConsts, resolveKey) and tests/scan.spec.mjs registry scan"
  - "tests/save-failure.spec.mjs (5 localStorage tests), tests/storage.spec.mjs corrupt-boot test, tests/fixtures/v096-corrupt.json"
  - "bootPage option beforeGoto"
affects: [01-04, 01-05, 01-06, phase-02-ai-fallback, phase-03-file-split, phase-08-backup]

actuals:
  tokens: 8400   # chars/4 over the realized +/- diff vs a76ce03 (33,585 chars)
  tasks: 3
  commits: 5
plan_head_before: a76ce034c9da38c3e9baffc39792f09729efdf26
plan_head_after: ee9cd4f9af5961a8777e1eaee5149eba4a7f1256

tech-stack:
  added: []
  patterns:
    - "All storage access via one safety layer; static scan fails on unregistered keys and on direct localStorage use outside js/safety.js"
    - "Failure injection by wrapping Storage.prototype.setItem behind window.__failLS; throttle tested with page.clock"
    - "Mechanical refactor and bug fix in separate commits; rename-only property checked by reverse-substituting the diff"

key-files:
  created:
    - js/safety.js
    - tests/save-failure.spec.mjs
    - tests/scan-lib.mjs
    - tests/scan.spec.mjs
    - tests/storage.spec.mjs
    - tests/fixtures/v096-corrupt.json
  modified:
    - index.html
    - tests/helpers.mjs

key-decisions:
  - "lhGetJSON and LH_CORRUPT_KEYS were added in Task 3 (the fix commit), not Task 1, so the fix commit touches exactly index.html and js/safety.js as the plan requires"
  - "Banner throttle is counted from when it was shown, per kind, using Date.now(); closing the banner does not reset it"
  - "lhAssertKnownKey uses console.error and never blocks the write, so an unregistered key fails the smoke suite but never loses user data"
  - "Scan allows unresolved keys only inside DYNAMIC_KEY_FUNCS (handleColorChange); apiKey_ template literals are matched against registered prefixes"

requirements-completed: [PERF-04, FND-03]

coverage:
  - id: D1
    description: "A refused localStorage write shows one sticky, dismissible banner starting 存檔失敗 with 匯出備份 and 關閉; the app keeps working"
    requirement: PERF-04
    verification:
      - kind: e2e
        ref: "tests/save-failure.spec.mjs#localStorage: 寫入被拒時顯示存檔失敗橫幅"
        status: pass
    human_judgment: false
  - id: D2
    description: "Repeated failures within 60 s give exactly one banner element; closed stays hidden in the window; shows again after 61 s"
    requirement: PERF-04
    verification:
      - kind: e2e
        ref: "tests/save-failure.spec.mjs#localStorage: 60 秒內只顯示一次、不堆疊"
        status: pass
    human_judgment: false
  - id: D3
    description: "Banner contrast is at least 4.5:1 in light and dark using existing CSS variables"
    requirement: PERF-04
    verification:
      - kind: e2e
        ref: "tests/save-failure.spec.mjs#localStorage: 橫幅淺色與深色都看得清楚"
        status: pass
    human_judgment: false
  - id: D4
    description: "Save failure during real user actions (toggle side panel, type lyrics) shows the banner and raises no uncaught error"
    requirement: PERF-04
    verification:
      - kind: e2e
        ref: "tests/save-failure.spec.mjs#localStorage: 使用者操作存檔失敗時不再出現程式錯誤"
        status: pass
    human_judgment: false
  - id: D5
    description: "Every storage key is registered (16 + apiKey_ prefix); nothing bypasses js/safety.js; admin keys are excluded and not in LH_KEYS"
    requirement: FND-03
    verification:
      - kind: e2e
        ref: "tests/scan.spec.mjs#registry (4 tests)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Corrupted haiku_lyrics / haiku_savedwords no longer kill the app; raw values and hashtags are left untouched; a [好韻器] record names the key"
    requirement: FND-03
    verification:
      - kind: e2e
        ref: "tests/storage.spec.mjs#corrupt: 存檔內容損毀時照常開啟、查韻正常、原始內容不動"
        status: pass
    human_judgment: false
  - id: D7
    description: "Banner wording and look are plain Traditional Chinese, non-jargon (PERF-04 prohibition on jargon)"
    requirement: PERF-04
    verification: []
    human_judgment: true
    rationale: "Wording quality and visual taste are judgment calls; no test asserts them beyond the 存檔失敗 / 匯出備份 strings"

duration: 11min
completed: 2026-10-03
status: complete
---

# Phase 1 Plan 03: Storage Safety Layer Summary

**`js/safety.js` puts every localStorage call behind a 16-key registry with a sticky, 60 s throttled, theme-readable 存檔失敗 banner; a rename-only commit routes all 49 call sites through it, an acorn registry scan enforces it, and corrupted stored JSON no longer kills the app or deletes the hashtags. `npm test`: 57 passed.**

## Performance

- **Duration:** about 11 min (10:57Z to 11:08Z)
- **Tasks:** 3 (5 commits)
- **Files:** 8 (6 new, index.html and tests/helpers.mjs modified)

## Accomplishments

- Save-failure banner: `#lhSaveBanner` (`role="alert"`, z-index 10000, own injected style from `--card-bg` / `--text-primary` / `--border` / `--shadow`, 4px red left border). Text set with `textContent`, buttons wired with `addEventListener` (no inline handlers, no `innerHTML`). 匯出備份 calls the global `exportSession()`, 關閉 hides it. Not a modal.
- Registry: 16 keys in 4 groups plus `apiKey_` prefix (`secret: true`), `lh:schema` / `lh:backup:ls` meta keys, `haoYunQi_admin_key` / `haoYunQi_admin_theme` excluded.
- Swap: `localStorage.getItem/setItem/removeItem` to `lhGet/lhSet/lhRemove` in 49 places, no `localStorage` token left in index.html.
- Registry scan sees 53 usages (49 in index.html plus 4 direct accesses inside js/safety.js, which is exempt); the only non-literal keys are the two `apiKey_` templates and `handleColorChange`.
- Corrupt boot: three top-level reads use `lhGetJSON`; the boot auto-clear now skips when `haiku_lyrics` was corrupt.

## Task Commits

1. **Task 1: safety layer plus banner** - `18cb797` feat(01-03)
2. **Task 2a: mechanical storage swap (rename-only, index.html only)** - `6f528ec` refactor(01-03)
3. **Task 2b: registry scan plus user-action failure test** - `96a7139` test(01-03)
4. **Task 3a: corrupt JSON fix (index.html + js/safety.js only)** - `349ea5b` fix(01-03)
5. **Task 3b: corrupt boot test and fixture** - `ee9cd4f` test(01-03)

**Rename-only check on `6f528ec`: PASSED.** It touches only index.html, and reverse-substituting `lhGet(`/`lhSet(`/`lhRemove(` back to the `localStorage.*` names on the added lines reproduces the removed lines exactly (98 changed lines, 49 each way). Fix commit `349ea5b` touches exactly `index.html js/safety.js`.

**Plan metadata:** skipped (.planning gitignored, commit_docs=false). Branch gsd/v0.96-stabilize. Nothing pushed.

## Decisions Made

See key-decisions above.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test design] Dark-theme contrast test must use the real theme toggle**
- **Found during:** Task 1
- **Issue:** the plan says to run `applyTheme(true, false)` in-page, but the app sets an inline `--text-primary` on `<html>` (from `applyColors`) that only `loadColors()` recomputes for dark mode. Calling `applyTheme` alone left the light text colour (#2d3748) on the dark card background (#2d3748), ratio 1.0. That is a test artefact, not a real defect: the real toggle (`themeToggle` click handler) calls `applyTheme` then `loadColors`.
- **Fix:** the test turns `__failLS` off, then clicks the real `#themeToggle` in-page (before the swap, the toggle's unguarded `setItem` would throw while failing), then asserts at least 4.5 again. Dark contrast then passes.
- **Files modified:** tests/save-failure.spec.mjs
- **Commit:** 18cb797

**2. [Ordering] `lhGetJSON` / `LH_CORRUPT_KEYS` added in Task 3, not Task 1**
- **Issue:** plan lists them under Task 3 step 1 while Task 3 acceptance requires the fix commit to touch js/safety.js; adding them in Task 1 would have left the fix commit without a safety.js change.
- **Fix:** held them back; Task 1 safety.js has no lhGetJSON. No behaviour impact.
- **Commit:** 349ea5b

**Total deviations:** 2 (1 test-design, 1 ordering). **Impact:** none on scope.

## Findings for later phases (not fixed here)

- While the banner is showing, it sits top-centre and can intercept pointer clicks on controls underneath it (observed: a Playwright `page.click('#themeToggle')` timed out while the banner was visible). It is dismissible and not a modal as the plan intends; if Andy finds it annoying, a position tweak is a CSS-only change in `_lhBannerStyle()`.
- Valid JSON of the wrong shape (e.g. `null` in `haiku_lyrics`) is still not validated (plan: "no shape validation").
- A corrupt `haiku_lyrics` raw value is preserved only until the user types; the next `saveLyrics` overwrites it. Plan 05's baseline backup is what keeps it.

## Issues Encountered

None.

## Known Stubs

None.

## Threat Flags

None new. T-01-08 (banner uses `textContent`, zero `innerHTML` in js/safety.js), T-01-09 (`lhWarn` takes key name and error only; the corrupt-boot test asserts the console record names the key), T-01-10 (`?v=0.96.1`), T-01-11 (`lhAssertKnownKey` plus registry scan), T-01-12 (`lhGetJSON` fallback, raw value untouched, hashtag clear skipped) are all implemented. Teeth: removing the `LH_CORRUPT_KEYS` guard makes the corrupt test fail (hashtags deleted: expected the stored value, received null); restored.

## Next Phase Readiness

- Plans 04-06 can use `lhWarn`, `lhSaveFailed(kind)` (add kinds to `LH_BANNER_TEXT`), `LH_KEYS` and the scan helpers in `tests/scan-lib.mjs`.
- `npm test` is green: 57 passed (golden 41, smoke 5, save-failure 5, registry 4, corrupt 1, plus file-set meta).

## Self-Check: PASSED

- Files exist: js/safety.js, tests/save-failure.spec.mjs, tests/scan-lib.mjs, tests/scan.spec.mjs, tests/storage.spec.mjs, tests/fixtures/v096-corrupt.json (verified).
- Commits on gsd/v0.96-stabilize: 18cb797, 6f528ec, 96a7139, 349ea5b, ee9cd4f (`git rev-list --count a76ce03..HEAD` = 5).
- Acceptance re-run: safety.js script tag count 1 and order OK; registry keys present in safety.js; zero inline on-attributes and zero `innerHTML` in safety.js; `-g localStorage` 5 passed; `-g registry` 4 passed; swap commit touches only index.html and is rename-only; `lhGetJSON` count 1 for each of the three keys; `LH_CORRUPT_KEYS.has('haiku_lyrics')` count 1; fix commit file set exact; teeth check fails without the guard.
- Plan verification: `npm test` 57 passed.
