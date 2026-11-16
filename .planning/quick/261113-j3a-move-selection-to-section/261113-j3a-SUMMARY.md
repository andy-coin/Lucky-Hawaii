---
phase: quick-261113-j3a
plan: 01
subsystem: lyrics-sections
tags: [sections, context-menu, undo, touch, rhyme-map]
status: complete
requirements: [QUICK-261113-j3a]
key-files:
  modified: [js/sections.js, js/rhyme-map.js, css/panels.css, index.html, tests/line-analysis-ui.spec.mjs]
  created: [tests/move-selection.spec.mjs]
actuals:
  tasks: 3
  commits: 3
plan_head_before: aeca31a
plan_head_after: ddcfbad50567b23867ca990ff5d45d6d4d548c99
completed: 2026-11-13
---

# Quick 261113-j3a: 選取文字移到別的段落 Summary

桌機文字框選字後右鍵出現「移到段落 ▸」，子選單列出所有段落與「＋ 新段落」，一步（lhSecApply）移動且可 Cmd+Z 復原；觸控從選字浮動列新增的同名按鈕進入同一份清單。

## Commits

- 7d49b43 Task 1（tracer）：右鍵選單、子選單、移到既有段落、復原（js/sections.js、css/panels.css、測試）
- e3122ab Task 2：＋ 新段落、方向鍵、Esc、lhSecAbortInteractions 收起
- ddcfbad Task 3：浮動列 `.rm-bar-move`、busy 判斷、版本號 0.96.27

## Verification（實跑結果）

- `tests/move-selection.spec.mjs`：9 個全過
- Task 3 指定的整組（move-selection、undo、sections-ui、rhyme-map-ui、line-analysis-ui、line-journey、rhyme-journey、line-audit、rhyme-audit、layout）：285 過、1 失敗，失敗已修（見偏差），修後 line-analysis-ui + move-selection 53 過
- `?v=0.96.27`：index.html 39 處、js/rhyme-map.js 1 處，無殘留 0.96.26
- 未做：iPhone／iPad／Mac 實機手動驗收（plan 的 human-check），handoff.md 已列待測項

## Deviations from Plan

**1. [Rule 1 - 既有測試跟著新行為更新] tests/line-analysis-ui.spec.mjs**
- 發現：「分析面板：手機上長選取只出現一次，只有分析」斷言觸控浮動列可見按鈕只有 `['📏 分析']`；plan 本身要求觸控多一顆「移到段落 ▸」，所以斷言改成 `['📏 分析', '移到段落 ▸']`
- 檔案：tests/line-analysis-ui.spec.mjs（一行）；併入 ddcfbad

**2. 測試寫法小調整**：「選單開著浮動列不跳出來」用 evaluate 檢查 `#rhymeSelBar.show`（浮動列從未被建出來，`not.toHaveClass` 會因找不到元素而失敗）。

另：plan 的 0c commit ledger 沒在第一個 commit 前建，plan_head_before 取第一個 commit 的父節點 aeca31a，`git rev-list --count aeca31a..HEAD` = 3。

## Known Stubs

None.

## Threat Flags

None（T-q-01 slice 比對、T-q-02 textContent 皆已實作並有測試覆蓋快照過期）。

## Self-Check: PASSED

- 檔案存在：js/sections.js、js/rhyme-map.js、css/panels.css、tests/move-selection.spec.mjs
- commits 7d49b43、e3122ab、ddcfbad 在 gsd/v0.96-stabilize 上
- 未 commit：handoff.md、SUMMARY.md（依指示）
