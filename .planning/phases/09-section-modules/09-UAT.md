---
status: testing
phase: 09-section-modules
source: [09-VERIFICATION.md]
started: 2026-10-23T02:10:36Z
updated: 2026-10-23T02:10:36Z
---

## Current Test

number: 1
name: 實機拖曳手感（段落 ⋮⋮ 把手、AI 詞卡長按拖進歌詞）
expected: |
  iPad／iPhone Safari、Android Chrome 上，按住 ⋮⋮ 能上下拖段落；AI 詞卡長按約半秒後能拖進歌詞指定位置；畫面不會跟著亂捲
awaiting: user response

## Tests

### 1. 實機拖曳手感（段落 ⋮⋮ 把手、AI 詞卡長按拖進歌詞）
expected: iPad／iPhone Safari、Android Chrome 都拖得順；手機拖詞卡時自動切到「歌詞」分頁，放開就插進去
result: [pending]

### 2. iPhone 上按 ↶ ↷ 鍵盤不會收起；搖一搖復原可用
expected: 打字中按 ↶ 復原，鍵盤留著；搖一搖也走同一套復原
result: [pending]

### 3. 8 種段落顏色在白天／夜間主題都看得清楚、好看
expected: 右鍵（手機長按）段落名稱 → 選顏色，左邊色條與名稱底色清楚，字讀得到
result: [pending]

### 4. 復原刪除／取代後，游標停的位置順手
expected: 刪掉或改掉一段字後按 ↶，游標回到剛剛改的地方
result: [pending]

### 5. 雲端容器執行 npm run visual:update 更新 -linux 截圖基準
expected: Linux 截圖測試重新變綠
result: [pending]

### 6. 審核 Claude 自主決定的 17 項（TEST-CHECKLIST 09-CTX-1～17、驗收清單 5-92～5-108）
expected: 同意或指出要改的項目（例如舊歌的中文段落名改顯示成英文 Verse I、刪除改成「復原」不再跳確認）
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
