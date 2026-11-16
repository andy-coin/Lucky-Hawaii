---
status: testing
phase: 11-line-analysis-settings
source: [11-VERIFICATION.md]
started: 2026-10-28T02:27:34Z
updated: 2026-10-28T02:27:34Z
---

## Current Test

number: 1
name: 真實歌詞的斷句合不合語感
expected: |
  用 3～5 首真實歌詞，看自動猜的 ≈ 結構是否符合 Andy 的語感
awaiting: user response

## Tests

### 1. 真實歌詞的斷句合不合語感
expected: 自動猜的 ≈ 結構（最長詞＋單字併前）多數合語感；猜錯時加空白就能改正
result: [pending]

### 2. 標記版面美觀
expected: 全部標記開著時，手機／平板／電腦、日夜主題、靠右欄／句尾後、三種字級、三種濃淡都好看不擠
result: [pending]

### 3. Safari／Firefox 換行對齊
expected: iPad／iPhone Safari 開長歌詞，兩種位置的標記都不讓字換行、垂直位置對
result: [pending]

### 4. iOS 原生色票
expected: 韻族顏色拖曳即時變色、關閉才存，沒有卡住
result: [pending]

### 5. iPad 觸控板／滑鼠停留
expected: 反白後停 1.5 秒自動分析不誤觸；手指不會觸發
result: [pending]

### 6. 自主決定點頭或搖頭
expected: ≈ 只標猜的那段、對照用「≠」列不加欄、顏色另開格子、面板與浮動列算一層、對照取同類型第一段、預設靠右欄、停留預設關、設定放 ⚙️ 偏好設定（完整清單：驗收清單-精簡版 5-131～5-154）
result: [pending]

### 7. -linux 截圖基準
expected: 在雲端容器執行 npm run visual:update
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0

## Gaps
