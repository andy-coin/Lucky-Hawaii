---
status: testing
phase: 10-rhyme-map
source: [10-VERIFICATION.md]
started: 2026-10-27T18:25:47Z
updated: 2026-10-27T18:25:47Z
---

## Current Test

number: 1
name: 上色在真機（iPad／iPhone Safari、Android Chrome）晝夜主題的可讀性與美觀
expected: |
  16＋1 色分得出來、孤句較淡但看得到、文字對比夠；戶外亮度下也能分辨
awaiting: user response

## Tests

### 1. 上色在真機晝夜主題的可讀性與美觀
expected: 16＋1 色分得出來、孤句較淡但看得到、文字對比夠
result: [pending]

### 2. 真機注音組字與慣性捲動
expected: 組字時色塊不閃不卡；Safari 慣性捲動時鏡像層不抖、不錯位
result: [pending]

### 3. 手機長按選字後的浮動列
expected: 浮動列與系統拷貝選單／選取把手不互相蓋住，按得到「查韻／AI 建議／指定讀音」
result: [pending]

### 4. 「點字查韻」的方式（SC4）
expected: Andy 決定：維持「反白→浮動列→查韻」，或改成單擊就查
result: [pending]

### 5. 自主決定點頭或搖頭
expected: B1 背景螢光筆、B2 嚴格模式顏色仍按韻族、B3 孤句較淡、C3 字母與統計預設關、E1 了／的／嗎算語助詞、A3 手動讀音綁句尾 4 字、D-10 從統計逐句查（完整清單見 handoff.md 與 TEST-CHECKLIST.md 10-CTX-1～22）
result: [pending]

### 6. -linux 截圖基準
expected: 在雲端容器執行 npm run visual:update 更新 -linux 截圖
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
