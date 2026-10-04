---
phase: 05-multi-device-layout
plan: 11
subsystem: testing
tags: [visual-regression, screenshots, playwright, cache-busting, uat]
status: complete

requires:
  - phase: 05-multi-device-layout/05-01
    provides: DEVICES, waitStill, setScale (tests/layout-lib.mjs), bootPage device/colorScheme/storage options, baseline-before screenshots
  - phase: 05-multi-device-layout/05-10
    provides: settle() waits for data-render done; npm run perf
provides:
  - "tests/visual.spec.mjs: 15 matrix baselines (results light/dark, lyrics, AI, custom colours x 3 devices) + 1 phone-150% long-reading baseline + 3 single-card-group checks, with a missing-baseline guard"
  - "tests/visual.spec.mjs-snapshots/*-linux.png: 16 committed baselines (per-platform; Mac needs its own -darwin set)"
  - "package.json: visual:update"
  - "index.html: single shared ?v=0.96.7 on all 27 local tags"
  - "css/responsive.css: pinned 提供詞語建議 button no longer covered by word cards (z-index: 2) + regression test"
affects: []

plan_head_before: fd203748c5fad995338c41db061a42148a40e71e
plan_head_after: 36d98a47613e1f89d2176f230104a3c39711e4b2

actuals:
  tokens: 2800     # chars/4 over the added lines in css index.html tests/*.mjs package.json (11184 chars; PNG baselines not counted)
  tasks: 2
  commits: 3       # MEASURED: git rev-list --count fd20374..HEAD (before the docs commit)

tech-stack:
  added: []
  patterns:
    - "Baseline guard: expectShot() throws when the platform's baseline file is missing and the run is not an explicit --update-snapshots run, so a missing picture can never be silently written and then pass on a re-run"
    - "Backstop geometry checks (card/grid width ratio, per-card reading inside the card) sit beside the screenshots instead of relying on pixels alone"

key-files:
  created:
    - tests/visual.spec.mjs
    - tests/visual.spec.mjs-snapshots/ (16 PNG, -linux)
  modified:
    - package.json
    - tests/parity.spec.mjs
    - tests/layout.spec.mjs
    - css/responsive.css
    - index.html
    - .planning/TEST-CHECKLIST.md

key-decisions:
  - "Baselines are per platform; this container is linux, so the committed set is -linux. Andy's Mac needs one npm run visual:update to create the -darwin set (TEST-CHECKLIST D-11)"
  - "The missing-baseline guard lives in the spec (existence check before toHaveScreenshot) rather than in playwright.config, so the rest of the suite is unaffected"
  - "A layout bug found by the new AI-panel baseline (pinned button covered by cards) was fixed in this plan before the baselines were taken, not frozen into them"

requirements-completed: [UI-02, PERF-01]

duration: ~75 min
completed: 2026-10-04
---

# Phase 5 Plan 11: Screenshot baselines, ?v=0.96.7 and the real-device checklist Summary

The finished look is pinned by 16 committed screenshot baselines (light, dark and custom colours on 390x844, 820x1180 and 1440x900, plus lyrics and AI panels and a phone-150% long-reading shot) that fail on any unintended change and on any missing file; all 27 local tags carry one `?v=0.96.7`; the phase gate is green.

## What was done

**Pre-task fix, commit `6c4c06b`** (css/responsive.css, tests/layout.spec.mjs)
- Reading the first AI-panel baseline showed the pinned 「提供詞語建議」 button on phone and tablet painted underneath the word cards, only a sliver visible. The button sits before the cards in the DOM and the cards are `position: relative`, so they paint on top. `z-index: 2` on the sticky button (inside the 900px media block) fixes it; desktop is untouched.
- New test 「底部面板：釘在底部的「提供詞語建議」整條都在詞卡上面」 samples 5 x 2 points across the button at three scroll positions on phone and tablet. It failed before the fix and passes after. The older test only probed the button centre, which lands in the gap between two cards.

**Task 1, commit `565afe8`** (tests/visual.spec.mjs, tests/visual.spec.mjs-snapshots/, package.json, tests/parity.spec.mjs)
- 15 matrix tests 「截圖：{device} {state}」 (results, results-dark, lyrics, ai, custom) with `animations: 'disabled'`, `caret: 'hide'`, `scale: 'css'`, `maxDiffPixelRatio: 0.01`, `Math.random` pinned, Google Fonts routed to empty CSS (helpers).
- 3 backstop tests 「截圖：只有一個字的群組不會被撐滿（{device}）」: search ㄢ, then in 'tone' mode redraw with one non-rare item; the card is exactly one and its width is under 40% of the grid and left-aligned.
- 1 backstop test 「截圖：手機 150% 長拼音不超出字卡」: real ➕ to 150%, search ㄓㄨㄤ, every `.char-pinyin` text range inside its card and not scrolling, then a baseline `phone-150-zhuang`.
- `visual:update` script mirrors `golden:update`. parity.spec header and skip reason now say Pass A finished in 05-02 and `LH_PARITY=check` is expected to fail from 05-03.

**Task 2, commit `36d98a4`** (index.html)
- `sed` over all `?v=0.96.6` to `?v=0.96.7`: 27 tags, nothing else changed; the commit lists only index.html.

## Verification

| Run | Result |
|-----|--------|
| `npm run visual:update` (twice: before and after the button fix) | 19 passed, baselines written |
| `npx playwright test tests/visual.spec.mjs` x2 consecutively | 19 passed, 19 passed (deterministic) |
| Missing-baseline guard (tablet-custom moved away) | 1 failed with 「缺少截圖基準」, 18 passed, nothing written (15 files still); file restored, 19 passed |
| Guard before any baseline existed | 16 failed, 3 passed (the geometry checks) |
| `npm test` after Task 1 | 390 passed, 27 skipped, 1 failed (known cloud-only worker-config) |
| `npx playwright test tests/split-tags.spec.mjs` | 11 passed |
| `npm test` final (after the ?v= bump) | 390 passed, 27 skipped, 1 failed (known cloud-only worker-config); the 19 visual tests ran in parallel with everything else and passed |
| `npm run perf` (machine idle) | 5 passed, 1 skipped (record mode); 6x bpm-off 270 ms against 250 x 7.35 threshold, ratio 11.56 |
| `git diff --quiet 078c5d1 -- tests/golden` | exit 0 |
| Layout, style and golden specs after the CSS fix | 124 passed |

Acceptance: `ls tests/visual.spec.mjs-snapshots/*.png | wc -l` is 16; `git ls-files tests/visual.spec.mjs-snapshots | wc -l` is 16; `grep -o '"visual:update"' package.json | wc -l` is 1; `grep -o '?v=[0-9.]*' index.html | sort -u` prints only `?v=0.96.7`; `git show --name-only --format= HEAD` lists only index.html.

I looked at these baselines by eye: phone-results, phone-ai (after the fix), phone-custom, phone-150-zhuang, tablet-ai, tablet-lyrics, tablet-results-dark, desktop-lyrics, desktop-ai, desktop-custom. Each shows the intended state.

## Deviations from Plan

**1. [Rule 1 - Bug] Pinned AI button covered by word cards on phone and tablet**
- **Found during:** Task 1 (reading the first AI baseline).
- **Issue:** the 「✨提供詞語建議」 button was painted under the cards.
- **Fix:** `z-index: 2` in css/responsive.css plus a regression test in tests/layout.spec.mjs (red before, green after). Committed before the baselines so they show the fixed look.
- **Files modified:** css/responsive.css, tests/layout.spec.mjs
- **Commit:** 6c4c06b

**2. [Platform deviation, cloud container] Baselines are -linux, not -darwin**
- **Issue:** the plan assumes Andy's Mac (`-darwin.png`); the container is Linux and Playwright suffixes by platform.
- **Fix:** baselines generated and committed as `-linux.png`; the design (only `npm run visual:update` writes baselines, missing baseline fails) is kept; the spec header says baselines are per platform. TEST-CHECKLIST D-11 asks Andy to run `npm run visual:update` once on the Mac, look at the pictures and commit them; until then Mac `npm test` fails only the 19 「截圖：」 tests.

**3. [Rule 2 - Missing critical functionality] Explicit missing-baseline guard in the spec**
- **Issue:** Playwright's default (`updateSnapshots: 'missing'`) writes the missing file and fails that first run, but the next run passes against the file it just wrote, which is a silent pass (OD-8).
- **Fix:** `expectShot()` checks the file exists unless the run is an explicit update, and throws a plain message otherwise. The CLI `--update-snapshots` run still writes. Nothing changed in playwright.config.

**4. [Plan wording] Snapshot count**
- 16 baselines (15 matrix plus `phone-150-zhuang`), 19 tests in the spec (15 + 3 single-card-group + 1), more than the plan's "at least 16 / 17".

**5. [Plan wording] Rhyme display in the long-reading test**
- With the search box in zhuyin mode the card readings are zhuyin with tone marks, not English pinyin; the check is on whatever `.char-pinyin` holds.

**Total deviations:** 5 (1 bug fix, 1 platform adaptation, 1 added guard, 2 wording). **Impact:** none on the plan's truths; one real layout bug fixed on the way in.

## 給 Andy 的實機試用清單

（全部放進 `.planning/TEST-CHECKLIST.md` 的「必測」→ Phase 5 → 05-11 一區，也可以直接照下面做。回答都用 1.是 2.否。舊版截圖在 `.planning/phases/05-multi-device-layout/baseline-before/`，新舊並排看。）

1. iPhone Safari：點搜尋框、歌詞框、回報視窗，鍵盤跳出來時，打字的位置（游標）都看得到嗎？（TEST-CHECKLIST 05-11-1，細節 05-07-1、05-07-3、05-07-4）
2. 點任何輸入框，畫面都沒有自己放大嗎？（05-11-2，細節 05-07-5）
3. 兩指縮放還能用嗎？（05-11-3）
4. ➕／➖ 與點中間百分比回 100% 的手感 OK 嗎？到最大 150% 時邊邊有沒有被切掉？（05-11-4）
5. 底部「查韻・歌詞・AI 建議」三個分頁，與面板把手的開關順手嗎？（05-11-5）
6. Android Chrome：把上面 1 到 5 各做一遍，是否一樣沒問題？（05-11-6，細節 05-07-2）
7. 電腦打開歌詞或 AI 面板時，主畫面被推開的樣子可以接受嗎？（05-11-7）
8. 對照 baseline-before 資料夾的舊截圖，新版淺色、深色、客製顏色整體好看嗎？客製顏色時標題漸層與分頁列維持原配色（研究 A7），要不要跟著換？（05-11-8；換不換見 D-14）
9. 大量結果（例如 ㄅ ㄆ ㄇ，關掉「隱藏冷僻字」）出現時，手機會不會卡？（05-11-9，細節 05-10-1、05-10-6）
10. 手機或平板開 AI 建議、按「✨提供詞語建議」並往下滑詞卡：按鈕有沒有整條看得到、沒被詞卡壓住？（05-11-10，這是這次修好的問題）
11. 手機 150% 搜尋「ㄓㄨㄤ」，讀音有沒有超出字卡；只有一個字的群組，字卡是否維持一般大小靠左？（05-11-11）

另外：
- **指令**：`npm run visual:update` 更新截圖標準圖（唯一會寫標準圖的指令）；`npm run perf` 跑降速量測；Mac 上嚴格版是 `LH_PERF_SCALE=1 npm run perf`（D-10）。
- **Mac 一次性動作**：D-11，在 Mac 上跑一次 `npm run visual:update` 產生 -darwin 標準圖，看過再 commit；在那之前 Mac 的 `npm test` 只有 19 項「截圖：」會失敗。
- **偏好設定的 Groq 說明文字**現在所有寬度都看得到，內容已過時，可以之後順手修（D-12）。
- **線上網站（`main`）完全沒動**，要等你自己合併；合併前先做 CLOUD-RELAY.md 最後那一步（D-13）。

## Known Stubs

None.

## Threat Flags

None. T-05-25 accepted: baselines show fixture data only (fresh profiles, mocked AI, no user content). T-05-26 mitigated: one shared `?v=0.96.7` on every local tag, split-tags.spec passes (11 passed). T-05-SC: no package installs (package.json gained one script).

## Self-Check: PASSED

- Files found: tests/visual.spec.mjs, 16 PNG in tests/visual.spec.mjs-snapshots, package.json, index.html, css/responsive.css, tests/layout.spec.mjs, tests/parity.spec.mjs.
- Commits found: 6c4c06b, 565afe8, 36d98a4 (hashes of the final history; verify with `git log --oneline -4`).
