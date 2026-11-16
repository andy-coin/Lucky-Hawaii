---
phase: "11"
slug: "line-analysis-settings"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: true
wave_0_complete: false
created: "2026-10-28"
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: 11-RESEARCH.md § Validation Architecture (full requirement → test map lives there).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright Test 1.63.0＋`node:vm` 純函式測試（`tests/node-core.mjs` 的 `loadCore()`） |
| **Config file** | `playwright.config.mjs` |
| **Quick run command** | `npx playwright test tests/line-core.spec.mjs tests/rhyme-core.spec.mjs tests/split-tags.spec.mjs` |
| **Full suite command** | `npm test`（Phase 10 結束 964 passed／28 skipped／0 failed） |
| **Perf command** | `LH_PERF=1 npx playwright test tests/rhyme-map-perf.spec.mjs --workers=1` |
| **Estimated runtime** | quick ~10 s；full ~3 min |

---

## Sampling Rate

- **After every task commit:** quick run command
- **After every plan wave:** `npx playwright test tests/rhyme-map-ui.spec.mjs tests/line-analysis-ui.spec.mjs tests/rhyme-audit.spec.mjs tests/rhyme-journey.spec.mjs`
- **Before `/gsd-verify-work`:** `npm test` green＋perf command＋`-darwin` 截圖更新
- **Max feedback latency:** 180 seconds

---

## Per-Task Verification Map

Filled by the planner per task (`<automated>` + `<fails_when>`). Requirement → test map: 11-RESEARCH.md lines 653–680 (MAP-09 純函式／對照／換行不變／最後視覺列／詞庫載入；MAP-10 常駐／分析面板／浮動列 D-07／hover／組字；MAP-11 設定清洗與最小序列化／預設只開句尾上色／偏好設定區塊／顯示方式／韻族顏色／對比／備份匯入；橫切 預覽／觸控 44／靜態掃描／?v=／效能／輸出不含標記)。

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/line-core.spec.mjs` — MAP-09 純函式
- [ ] `tests/line-analysis-ui.spec.mjs` — MAP-09／10／11 e2e
- [ ] `tests/node-core.mjs` CORE 加 `js/sections-core.js`、`js/line-core.js`
- [ ] `tests/split-tags.spec.mjs` JS_ORDER 加 `line-core`
- [ ] 改寫被 D-07 推翻的 Phase 10 斷言（`rhyme-map-ui.spec.mjs:896-934` 等）
- [ ] 改寫被「逐行標記」選單開關推翻的開關清單斷言：`rhyme-map-ui.spec.mjs:1467`（data-k 清單加 `'line'`，排在 `'inner'` 後）、`rhyme-audit.spec.mjs:492-493`（多一組 `['line', 'false', '關']`）——11-01 Task 3，與加開關同一個任務
- [ ] 確認 `lh:map` 備份匯入改用最小序列化（`safety.js` 的 `_lhSettingFrom`）跟擴充後的清洗函式同一個任務落地，否則 `rhyme-map-ui.spec.mjs:641-672` 的五鍵字串會變紅——11-01 Task 1
- [ ] 確認 `lh:map` 字串相等斷言在最小序列化下維持原狀

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 自動猜斷句合不合語感 | MAP-09 | 語感判斷 | 用 3～5 首真實歌詞看 ≈ 結構 |
| 標記版面美觀、手機 390px 靠右欄寫字寬度 | MAP-09/11 | 美觀 | iPhone／iPad／Android 實機 |
| WebKit／Gecko 標記不改換行、垂直位置 | MAP-09 | 本機只有 Chromium | Safari／Firefox 開長歌詞切兩種位置 |
| iPadOS 觸控板 hover 停留、iOS 原生色票 | MAP-10/11 | 裝置限定 | 實機操作 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 180s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
