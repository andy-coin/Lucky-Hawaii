---
status: testing
phase: 05-multi-device-layout
source: [05-VERIFICATION.md]
started: 2026-10-04
updated: 2026-10-04
---

## Current Test

number: 1
name: iPhone／Android 實機：鍵盤跳出時打字的位置看得到
expected: |
  搜尋框、歌詞框、回報視窗打字時，正在打的那一行一直在鍵盤上方；面板從上方撐到鍵盤邊；收起鍵盤後底部分頁列回來
awaiting: user response

## Tests

> 每一題的白話操作步驟都在 `.planning/TEST-CHECKLIST.md`（括號內是清單編號），這裡只列結論。

### 1. 實機鍵盤不擋輸入（05-11-1、05-11-6；05-07-1～4、05-07-6）
expected: 正在打字的位置一直在鍵盤上方
result: [pending]

### 2. 點輸入框不自動放大、兩指縮放仍可用（05-11-2、05-11-3；05-07-5）
expected: 不自動放大；兩指縮放可以
result: [pending]

### 3. ➕／➖ 縮放手感、點百分比回 100%、150% 不吃邊（05-11-4；05-06-9、05-08-9）
expected: 順手、回得去、邊邊不被切
result: [pending]

### 4. 底部分頁與把手、桌機面板推開主畫面（05-11-5、05-11-7；05-06-1～3、05-05-1～2）
expected: 操作順手、樣子可接受
result: [pending]

### 5. 晝夜與客製顏色整體美觀（05-11-8、D-14；對照 baseline-before 資料夾）
expected: 整體比舊版好看、一致
result: [pending]

### 6. 手機大量結果不卡（05-11-9、05-10-1～6）
expected: 不凍結、選取不會掉
result: [pending]

### 7. AI 按鈕完整可見、150% 長注音不超出、單字群組不被撐滿（05-11-10、05-11-11）
expected: 都正常
result: [pending]

### 8. 小手機橫放：工具列可點、捲一下後結果滿版（05-RF-3、05-RF-9）
expected: 都正常
result: [pending]

### 9. Mac 上建立截圖基準（D-11：npm run visual:update）
expected: 建立後 Mac 上 npm test 全過
result: [pending]

## Summary

total: 9
passed: 0
issues: 0
pending: 9
skipped: 0
blocked: 0

## Gaps
