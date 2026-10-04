---
status: testing
phase: 04-ai-fill-validate-ai
source: [04-VERIFICATION.md]
started: 2026-10-04
updated: 2026-10-04
---

## Current Test

number: 1
name: 真實韻腳試 AI 建議（需先完成 Phase 2 Worker 部署）
expected: |
  搜 心、安、愛、衣、月（押字尾／押字首、搭配篩選），連按 AI 建議：候選夠時每次剛好 24 個；AI 造的詞（有 AI 徽章）真的押韻、是台灣日常繁體說法
awaiting: user response

## Tests

### 1. 真實韻腳試 AI 建議
expected: 候選夠時剛好 24 個；AI 造詞都押韻、台灣日常繁體
result: [pending]

### 2. 「押字首」單字模式的意思
expected: Andy 接受「首字韻部相同」（例：心 → 音樂、心情、星期 通過，小心、鄉村 不通過）；若要「首字聲母相同」需另開修改
result: [pending]

### 3. AI 挑太少時依常用度補滿的順序
expected: 補上的詞順序（常用的在前）手感 OK
result: [pending]

### 4. 剛開網頁立刻按 AI 建議
expected: 先出現「詞庫載入中…」，之後正常出現建議詞
result: [pending]

### 5. （選擇性）兩個分頁同時打開新版
expected: 兩個分頁的查韻與 AI 建議都正常（讀取端單一交易，風險低）
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
