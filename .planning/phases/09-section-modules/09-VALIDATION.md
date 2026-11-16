---
phase: "9"
slug: "section-modules"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: true
wave_0_complete: false
created: "2026-10-23"
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: 09-RESEARCH.md § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright Test 1.63.0（純函式經 `node:vm` 載入 `js/*.js`） |
| **Config file** | `playwright.config.mjs` |
| **Quick run command** | `npx playwright test tests/sections-core.spec.mjs tests/undo.spec.mjs tests/split-tags.spec.mjs tests/style.spec.mjs tests/scan.spec.mjs --workers=4` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | quick ~30 s；full 數分鐘 |

---

## Sampling Rate

- **After every task commit:** 該任務對應的 spec ＋ `tests/split-tags.spec.mjs tests/style.spec.mjs tests/scan.spec.mjs`
- **After every plan wave:** `npx playwright test tests/songs-*.spec.mjs tests/sections-*.spec.mjs tests/undo.spec.mjs tests/word-drag.spec.mjs tests/layout.spec.mjs tests/smoke.spec.mjs`
- **Before `/gsd-verify-work`:** `npm test` 全綠（-darwin 截圖重拍並目視確認）
- **Max feedback latency:** 60 秒

---

## Per-Task Verification Map

| Req | Behavior | Test Type | Automated Command | File Exists | Status |
|-----|----------|-----------|-------------------|-------------|--------|
| EDIT-05 | 類型推斷、編號（單一不編號、≥2 羅馬數字）、欄位整理 | unit | `npx playwright test tests/sections-core.spec.mjs` | ❌ W0 | ⬜ pending |
| EDIT-05 | 左鍵循環、拖曳／新增／刪除後重算編號 | e2e | `npx playwright test tests/sections-ui.spec.mjs` | ❌ W0 | ⬜ pending |
| EDIT-06 | 右鍵／長按開設定窗、改色、存檔、對比 | e2e | `npx playwright test tests/sections-ui.spec.mjs` | ❌ W0 | ⬜ pending |
| EDIT-07 | 字數規則＋即時更新、組字中不變 | unit＋e2e | `npx playwright test tests/sections-core.spec.mjs tests/sections-ui.spec.mjs` | ❌ W0 | ⬜ pending |
| EDIT-02 | 把手拖曳排序（滑鼠＋CDP 觸控）、Esc、自動捲動、Alt+↑↓、調高度 | e2e | `npx playwright test tests/sections-drag.spec.mjs` | ❌ W0 | ⬜ pending |
| EDIT-03 | 歷史堆疊、連打合併、組字、快捷鍵、↶↷、刪除復原 | unit＋e2e | `npx playwright test tests/undo.spec.mjs` | ❌ W0 | ⬜ pending |
| AI-06 | 詞卡／字卡滑鼠與觸控長按拖曳插入、點擊不插入、手機切分頁、游標索引 | e2e | `npx playwright test tests/word-drag.spec.mjs` | ❌ W0 | ⬜ pending |
| A4 | 備份匯入新欄位白名單 | e2e | `npx playwright test tests/songs-backup.spec.mjs` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/sections-core.spec.mjs` — 純函式（EDIT-05、EDIT-07）
- [ ] `tests/drag-lib.mjs` — CDP 觸控、滑鼠拖曳、長按、游標索引 helper
- [ ] `tests/sections-ui.spec.mjs`、`tests/sections-drag.spec.mjs`、`tests/undo.spec.mjs`、`tests/word-drag.spec.mjs`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 平板／手機實機拖曳與長按手感 | EDIT-02、AI-06 | iOS Safari 觸控行為無法在 Chromium 模擬（RESEARCH A1–A6、A9） | iPad／iPhone Safari、Android Chrome 各拖一次段落與詞卡 |
| iOS 搖一搖復原、↶↷ 不收鍵盤 | EDIT-03 | 實機鍵盤行為 | iPhone 上打字後按 ↶ |
| 段落顏色在實機上的可讀性 | EDIT-06 | 主觀美觀 | 晝夜主題各看一次 8 色 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
