---
phase: "8"
slug: "songs-editor-model"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-10"
---

# Phase 8 — Validation Strategy

> Source: `08-RESEARCH.md` § Validation Architecture (full requirement → test map there).

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | @playwright/test 1.63.0 (browser, CDP IME simulation, static scan, node-only tests) |
| **Config file** | `playwright.config.mjs` (webServer `node tests/serve.mjs` on 127.0.0.1:4310) |
| **Quick run command** | `npx playwright test tests/songs-*.spec.mjs tests/storage.spec.mjs tests/scan.spec.mjs tests/split-tags.spec.mjs` |
| **Full suite command** | `npm test` (baseline 562 passed / 27 skipped / 0 failed) |
| **Estimated runtime** | ~110 s full; single spec seconds |

## Sampling Rate

- **After every task commit:** the touched spec + `tests/scan.spec.mjs`
- **After every plan wave:** `npx playwright test tests/songs-*.spec.mjs tests/storage.spec.mjs tests/scan.spec.mjs tests/split-tags.spec.mjs tests/smoke.spec.mjs tests/save-failure.spec.mjs`
- **Before `/gsd-verify-work`:** `npm test` green
- **Max feedback latency:** 120 seconds

## Requirement → Test Map (summary)

| Req | Command |
|-----|---------|
| EDIT-01 | `npx playwright test tests/songs-ime.spec.mjs tests/songs-model.spec.mjs tests/songs-crosstab.spec.mjs` (RED tests R1–R5 from research must fail on the old code) |
| EDIT-04 | `npx playwright test tests/songs-migrate.spec.mjs tests/songs-ui.spec.mjs` + layout touch audits |
| EDIT-08 | `npx playwright test tests/songs-export.spec.mjs` |
| EDIT-09 | `npx playwright test tests/songs-backup.spec.mjs tests/smoke.spec.mjs -g import` |
| static | `npx playwright test tests/scan.spec.mjs tests/split-tags.spec.mjs tests/style.spec.mjs` |

## Wave 0 Requirements

- [ ] `tests/helpers.mjs`: `window.__hoyunSongsReady` in `bootPage`; helpers `activeSong`, `flushSongs`, `compose` (CDP `Input.imeSetComposition`/`insertText`), `openTwoTabs`
- [ ] new specs: `songs-migrate`, `songs-ime`, `songs-model`, `songs-ui`, `songs-crosstab`, `songs-export`, `songs-backup`
- [ ] fixtures with `&amp;`, `</textarea>`, `<b>` in lyrics
- [ ] update existing: scan key count, storage.spec schema/backup-id/keep/pinned, layout `savedLyrics`, ai-client `fill`, smoke v1 import, split-tags new files, save-failure banner copy

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real Zhuyin composition (macOS Chrome/Safari, iPhone/iPad Safari, Android Gboard): caret, no flicker, last character kept, Enter commits candidate only | EDIT-01 | Only Chromium CDP simulation available here | Type a full verse with the system Zhuyin IME in a section, switch songs, reload; text intact |
| PDF layout beauty | EDIT-08 | Visual judgement | ⬇ 匯出 → PDF → 儲存為 PDF; check title, labels, page breaks |
| iOS download filename / Home-Screen app | EDIT-08/09 | Platform behaviour | Export TXT and backup on iPhone; files named correctly |

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
