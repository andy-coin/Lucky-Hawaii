---
phase: 03-split-index-html
verified: 2026-10-04T12:00:00Z
status: passed
score: 4/4 must-haves verified
covered_files:
  - ".planning/phases/03-split-index-html/03-01-PLAN.md"
  - ".planning/phases/03-split-index-html/03-01-SUMMARY.md"
  - ".planning/phases/03-split-index-html/03-02-PLAN.md"
  - ".planning/phases/03-split-index-html/03-02-SUMMARY.md"
  - ".planning/phases/03-split-index-html/03-03-PLAN.md"
  - ".planning/phases/03-split-index-html/03-03-SUMMARY.md"
  - ".planning/phases/03-split-index-html/03-04-PLAN.md"
  - ".planning/phases/03-split-index-html/03-04-SUMMARY.md"
  - ".planning/phases/03-split-index-html/03-05-PLAN.md"
  - ".planning/phases/03-split-index-html/03-05-SUMMARY.md"
  - "css/base.css"
  - "css/panels.css"
  - "css/responsive.css"
  - "index.html"
  - "js/ai-client.js"
  - "js/ai-generate.js"
  - "js/ai-word-events.js"
  - "js/candidates.js"
  - "js/cards.js"
  - "js/dict.js"
  - "js/init.js"
  - "js/lyrics.js"
  - "js/panels.js"
  - "js/phonetic-tables.js"
  - "js/polyphonic.js"
  - "js/report.js"
  - "js/results.js"
  - "js/rhyme-display.js"
  - "js/safety.js"
  - "js/search-ui.js"
  - "js/search.js"
  - "js/state.js"
  - "js/theme.js"
  - "js/ui-common.js"
  - "js/wordlist.js"
  - "tests/core-node.spec.mjs"
  - "tests/html-lib.mjs"
  - "tests/split-tags.spec.mjs"
  - "tests/verify-split.mjs"
covered_digest: "v2:sha256:c18a1c1492e2a1473bb7a945149906054f533aece1e6568722a0268e5f65508f"
behavior_unverified: 0
overrides_applied: 0
---

# Phase 3: Split index.html Verification Report

**Phase Goal:** Split the single index.html into multiple JS/CSS files with no user-visible difference, safer for later bug fixes, features and tests; GitHub Pages deploys directly with no build.
**Verified:** 2026-10-04
**Status:** passed
**Re-verification:** No, initial verification

## Goal Achievement

### Observable Truths

| # | Truth (ROADMAP SC) | Status | Evidence |
|---|--------------------|--------|----------|
| 1 | index.html is a skeleton only; styles/code in multiple files; works over a local http server / GitHub Pages with no build | VERIFIED | index.html is 352 lines (base was about 6250). It has 0 `<style>` elements, no inline `<script>`, 3 `css/` links in head, and 23 script tags (2 `data/`, `js/safety.js`, 20 `js/`), all classic and synchronous (no defer/async/module). No bundler or build step. `npm test` serves the files via the static server in `tests/serve.mjs`. |
| 2 | Phase 1 golden + smoke tests pass after split; results and every button identical | VERIFIED | `npm test`: 248 passed, 0 failed. This includes golden, smoke (91 handler signatures, each clicked with no JS error, plus handler coverage), scan, storage, and split-tags. Independent check: whitespace-normalized concatenation of the 20 `js/` files (excluding safety.js) equals the base commit's single inline script, and the 3 CSS files equal the base style block. The non-script and non-style remainder of index.html differs from base only by 2 blank lines. `node tests/verify-split.mjs 2f2d248` gives `OK script: 176724 vs 176729` and `OK style: 66766 vs 66771`. |
| 3 | Core rhyme search/filter logic loadable and testable directly in Node | VERIFIED | The 4 pure-Node tests in `tests/core-node.spec.mjs` pass: phonetic tables, phonetic helpers, searchRhyme, and wordlist filtering. They load `js/*.js` via `node:vm` with no browser, and a parity test checks Node against browser results on 12 inputs. WR-03 pinned the overrides request so the parity test no longer depends on admin data. |
| 4 | Old users' saved lyrics/overrides/settings still readable; "moving code" and "fixing bugs" are separate commits | VERIFIED | Code was moved verbatim, so storage keys are unchanged. The storage specs pass, including `restore: v0.96 舊資料完整備份並可完整還原` against `tests/fixtures/v096-localStorage.json` and the corrupt-data fixture. `git diff 2f2d248..HEAD --stat` outside js/, css/ and tests/ touches only index.html. data/, scripts/ and js/safety.js are unchanged. Commit audit below. |

**Score:** 4/4 truths verified, 0 behavior-unverified.

### Move-vs-Fix Commit Audit (`2f2d248..HEAD`, 21 commits)

| Kind | Commits | Files touched | Result |
|------|---------|---------------|--------|
| `refactor(03-*)` pure moves | f275b57, a081126, 0587c7f, 4a7fd5a, 85c3e3d, df62c93, 952e76e | only `index.html` and new `js/*.js` or `css/*.css` | Clean, no test or logic mixing |
| `test(03*)` | 8789cc3, 61b6c5e, c2b35ad, 034f641, 6748244, 23f7709, 0f37e94, 4bb7431, 1de6c93, 0fbc14d, 5d18f50, 5a61276, 2f5239e | only `tests/` | Clean |
| `fix(03)` | 4326dda (add `?v=0.96.4` to the two `data/` tags) | only `index.html`, tag-only | Separate from the moves. It is a cache-busting fix, not a code move. |

No commit mixes a move with a fix. The only behavioral change to shipped files is the `?v=` cache-bust on the `data/` and `safety.js` tags, which is intentional and isolated.

### Backstop Check (non-inferable truth: "users feel no difference")

Presence and wiring alone do not prove this, so I used independent evidence:
- A verbatim byte-level equivalence (whitespace-normalized) between base and the split files, recomputed by me, not taken from SUMMARY.
- 91-handler smoke coverage with no JS errors.
- Golden outputs unchanged.
- The code review (03-REVIEW.md) ran a load-order dependency analysis and found no forward references at load time.

Not exercised by tests: pixel-level visual rendering. Since CSS is byte-for-byte the same and loaded render-blocking in cascade order, I rate the risk low. ROADMAP lists no human check for this phase.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| FND-04 | 03-01 to 03-05 (marked complete in 03-05) | index.html split into JS/CSS files, GitHub Pages deploys without a build, move and fix not in the same commit | SATISFIED | All of the above. REQUIREMENTS.md shows `[x]` and "Phase 3 / Complete". There are no orphaned Phase 3 requirements. |

### Review Findings (03-REVIEW.md)

WR-01, WR-02, WR-03 and IN-01, IN-02, IN-03 are all resolved with commits. I confirmed that each commit exists and that its fix is in the code. This includes the `data/` `?v=` tags and the comment-stripping in `tests/html-lib.mjs`. IN-03 was partly kept on purpose and is not a risk.

### Anti-Patterns Found

None. There are no TBD/FIXME/XXX markers in the new or changed files (also 0 in the base), and no stubs. All `js/` content is verbatim moved code. The dead `saveApiKey()` was kept verbatim by design (CONTEXT, Deferred).

### Human Verification Required

None.

### Gaps Summary

No gaps. The phase goal is achieved: index.html is a skeleton, 20 JS and 3 CSS files are byte-equivalent to the original, tests are green (248), core logic is Node-testable, and move and fix commits are separated.

---

_Verified: 2026-10-04_
_Verifier: Claude (gsd-verifier)_
