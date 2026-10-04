---
phase: 01-safety-net
plan: 02
subsystem: testing
tags: [playwright, smoke-test, inline-handlers, coverage-gate, negative-control, fixtures]

requires:
  - phase: 01-01
    provides: "tests/helpers.mjs (bootPage, routeExternal, collectErrors, settle), npm test, local 127.0.0.1 server"
provides:
  - "tests/smoke.spec.mjs: fires every distinct inline handler (91 signatures) once, each in a fresh context, zero pageerror / console.error / off-origin"
  - "Coverage gate: handler function names in index.html + js/**/*.js must be fired or listed in UNREACHABLE with a reason (currently empty)"
  - "Negative control: undefined function and unknown host are both detected"
  - "Import tests: valid session shows 已讀取存檔 and renders lyrics; invalid JSON shows 讀取失敗：檔案格式錯誤"
  - "tests/fixtures/v096-localStorage.json (all 16 registry keys + apiKey_gemini) and wordlist-stub.ndjson (12 lines rhyming with 心)"
  - "helpers: stubWordlist(), bootPage options wordlist:'stub' and aiReply"
affects: [01-03, 01-04, 01-05, 01-06, phase-02-ai-fallback, phase-03-file-split]

actuals:
  tokens: 4700   # chars/4 over the realized diff vs 75016bb (18,632 chars)
  tasks: 2
  commits: 2
plan_head_before: 75016bb660b2bb2e3a467ffdf078bb47ab59765d
plan_head_after: a76ce034c9da38c3e9baffc39792f09729efdf26

tech-stack:
  added: []
  patterns:
    - "Enumerate handler signatures from the live DOM per scenario; dedupe by on* attribute text; one fresh context per signature"
    - "Fire handler events in-page (el.click / DragEvent / KeyboardEvent / Event) so no layout dependence"
    - "Coverage gate compares source-extracted function names against fired names"

key-files:
  created:
    - tests/smoke.spec.mjs
    - tests/fixtures/v096-localStorage.json
    - tests/fixtures/wordlist-stub.ndjson
  modified:
    - tests/helpers.mjs

key-decisions:
  - "No sharding: the full smoke loop takes about 48-51 s, under the plan's 90 s threshold"
  - "Six scenarios (base, aiCards, aiMenu, resetPool, polyphonic, missingChar) were enough; UNREACHABLE stays empty"
  - "bootPage gained an aiReply option (forwarded to routeExternal) so the scenarios can mock the Worker reply without touching routes after boot"
  - "Fixture keeps selectedModel 'gpt-4.1' as v0.96 really writes it; the aiCards scenarios pick a valid model in the dropdown by hand"

requirements-completed: [FND-01]

coverage:
  - id: D1
    description: "Every distinct inline handler (91 signatures across 6 scenarios) fires once in a fresh seeded context with zero JS errors and zero unmocked external requests"
    requirement: FND-01
    verification:
      - kind: e2e
        ref: "tests/smoke.spec.mjs#smoke：每個 inline handler 在乾淨環境各點一次，沒有 JS 錯誤"
        status: pass
    human_judgment: false
  - id: D2
    description: "Coverage gate ties handler names in source to what was fired; stale or reason-less UNREACHABLE entries fail"
    requirement: FND-01
    verification:
      - kind: e2e
        ref: "tests/smoke.spec.mjs#smoke 覆蓋率：原始碼裡的每個 handler 都有被觸發"
        status: pass
    human_judgment: false
  - id: D3
    description: "Negative control proves collector and off-origin recorder have teeth"
    requirement: FND-01
    verification:
      - kind: e2e
        ref: "tests/smoke.spec.mjs#smoke 負向對照：壞掉的 handler 與未知外部主機都會被抓到"
        status: pass
    human_judgment: false
  - id: D4
    description: "Importing valid and invalid session files behaves as v0.96 does without JS errors"
    requirement: FND-01
    verification:
      - kind: e2e
        ref: "tests/smoke.spec.mjs#import 合法存檔 / import 壞掉的檔案"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-10-03
status: complete
---

# Phase 1 Plan 02: Smoke Test Summary

**Playwright smoke net: 91 distinct inline handler signatures each fired once in a fresh fixture-seeded context with zero JS errors, a source-vs-fired coverage gate, a negative control, and import tests, all inside `npm test` (47 passed, about 58 s).**

## Performance

- **Duration:** about 20 min
- **Completed:** 2026-10-03T10:54Z
- **Tasks:** 2
- **Files:** 4 (3 new, helpers.mjs modified); index.html untouched

## Accomplishments

- **Handler signatures fired: 91** (selector = the 11 inline attribute names; dedupe by concatenated `on*` attribute text, so the 178 identical badge handlers are one signature).
- **Smoke runtime:** loop test about 48-51 s on this Mac; whole `npm test` (golden 41 + smoke 5 + file-set meta) 47 passed in about 58 s. **Sharding was not needed** (threshold 90 s).
- Scenarios: `base`, `aiCards` (search 心, stub wordlist gives 12 candidates so `.ai-word-card` renders directly, mocked Worker adds 3 AI cards, right-click a normal card), `aiMenu` (right-click an AI card), `resetPool` (generate again twice until the exhausted state shows the reset button), `polyphonic` (樂 chips plus a char-card right-click), `missingChar` (丂 gives the 回報 button).
- Coverage gate initially reported `charSuggestReading` and `selectPolyphonicReading`; the `polyphonic` scenario fixed both. **Final UNREACHABLE list: empty** (no name is un-renderable headless).
- Teeth verified: renaming `toggleLeftPanel` makes the loop fail naming `onclick=toggleLeftPanel()` ("toggleLeftPanel is not defined"); a never-rendered `smokeGateProbe()` handler inside a template literal makes the gate fail naming it; `index.html` restored after each probe.

## Task Commits

1. **Task 1: fixtures plus per-handler smoke loop with negative control** - `60c5c6d` test(01-02)
2. **Task 2: coverage gate and import scenarios** - `a76ce03` test(01-02)

**Plan metadata:** skipped (.planning gitignored, commit_docs=false). Branch gsd/v0.96-stabilize. Nothing pushed.

## Files Created/Modified

- `tests/smoke.spec.mjs` - SCENARIOS, HANDLER_ATTRS, enumeration, per-signature firing, coverage gate with UNREACHABLE, negative control, two import tests
- `tests/fixtures/v096-localStorage.json` - 16 registry keys plus `apiKey_gemini: "test-key-not-real"` (synthetic only)
- `tests/fixtures/wordlist-stub.ndjson` - 12 verbatim wordlist lines whose last syllable is ㄧㄣ
- `tests/helpers.mjs` - `stubWordlist`, `bootPage` options `wordlist` and `aiReply` (defaults unchanged, golden still 41/41)

## Decisions Made

- No sharding (see above).
- `aiReply` option added to bootPage instead of re-routing after boot.
- AI reply words end in 音 / 因 / 陰 (no initial consonant) on purpose, see Findings.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Scenarios in the plan were not enough to reach every handler**
- **Found during:** Task 2 (coverage gate)
- **Issue:** plan listed scenarios 'base' / 'aiCards' / 'missingChar' but one context-menu state cannot show both the normal and the AI menu, and `charSuggestReading` / `selectPolyphonicReading` need a char-card menu and polyphonic chips
- **Fix:** split into `aiCards` / `aiMenu`, added `resetPool` and `polyphonic` (plan allowed "add scenarios only where the gate shows a gap")
- **Files modified:** tests/smoke.spec.mjs
- **Committed in:** 60c5c6d, a76ce03

**2. [Rule 3 - Blocking] Plan's single-char missing example does not render the button**
- **Found during:** Task 1
- **Issue:** `𠀀` (non-BMP, probably not treated as a Chinese char) only shows 無法識別韻腳 with no 回報 button; a BMP CJK char absent from `chineseDict` does render it
- **Fix:** `MISSING_CHAR = '丂'` (verified to render `reportMissingChar('丂')`)
- **Files modified:** tests/smoke.spec.mjs
- **Committed in:** 60c5c6d

**3. [Rule 1 - Test design] Plan's coverage teeth check cannot work with a static hidden button**
- **Found during:** Task 2 acceptance
- **Issue:** a hidden `<button onclick="smokeGateProbe()">` in the DOM is enumerated and fired, so the gate passes and the loop test (not the gate) fails
- **Fix:** verified the gate with a probe that exists only in source (inside a template literal); it fails naming `smokeGateProbe`. Static-button case is covered by the loop teeth check
- **Files modified:** none (probe reverted with `git checkout -- index.html`)

**Total deviations:** 3 (2 blocking scenario fixes, 1 test-design note). **Impact:** none on scope; index.html unchanged.

## Findings for later phases (v0.96 behaviour pinned, not fixed here)

- **Stale `selectedModel` disables AI entirely.** `selectedModel` `gpt-4.1` (the v0.96 default string, and what old data holds) is not in `LLM_MODELS`, so the dropdown value is empty, `startIdx` is -1, and no model has `autoFallback: true`: `generateAIWords` never calls the Worker and shows 唉...ai也想不到更多符合的詞彙. The smoke scenarios work around it by selecting `gemini-3.5-flash-lite`. Candidate evidence for Phase 2 (AI fallback).
- **`validateWordRhyme` rejects single-char searches whose final char has an initial.** It compares `RHYME_TO_FAMILY[info.zhuyin]` with the full syllable (ㄒㄧㄣ) instead of the rhyme, so 開心 / 傷心 are dropped as non-rhyming for a 心 search while 音 / 因 / 陰 pass. Logged for Phase 2; the scenario reply uses no-initial endings so the AI cards render.

## Issues Encountered

None beyond the deviations above.

## Known Stubs

None.

## Threat Flags

None. Fixture contains only synthetic values (T-01-05); every iteration is a fresh context (T-01-06); Worker and feedback traffic is mocked and offOrigin must be empty (T-01-07); package.json / package-lock.json not modified (T-01-SC).

## Next Phase Readiness

- `npm test` is green (47 passed); any index.html surgery in Plan 03 onward is now guarded by golden plus smoke.
- Phase 3 file split: the gate already scans `js/**/*.js`.

## Self-Check: PASSED

- Files exist: tests/smoke.spec.mjs, tests/fixtures/v096-localStorage.json, tests/fixtures/wordlist-stub.ndjson, tests/helpers.mjs (verified).
- Commits exist on gsd/v0.96-stabilize: 60c5c6d, a76ce03 (`git rev-list --count 75016bb..HEAD` = 2).
- Acceptance re-run: fixture key check exit 0; stub 12 lines and every line valid JSON; `nonexistentFn` present; golden 42 passed; `-g import` 2 passed; `-g 覆蓋率` passed and fails on probe; `git status --porcelain -- index.html` empty.
- Plan verification: `npx playwright test tests/smoke.spec.mjs` 5 passed; `npm test` 47 passed.
