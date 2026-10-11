---
status: testing
phase: 08-songs-editor-model
source: [08-VERIFICATION.md]
started: 2026-10-11
updated: 2026-10-11
---

## Current Test

number: 1
name: 實機注音輸入法組字（Mac Chrome／Safari、iPad／iPhone Safari、Android Gboard）
expected: |
  在段落裡用系統注音打一整段：游標不跳、畫面不閃、最後一個字不掉、按 Enter 只選字不送出；切歌、重新整理後文字都在
awaiting: user response

## Tests

> 白話步驟在 `.planning/驗收清單-精簡版.md`（括號內是清單編號），這裡只列結論。

### 1. 實機注音組字（2-26、2-27）
expected: 順暢、不掉字、Enter 只選字
result: [pending]

### 2. 真實瀏覽器升級：舊歌詞變成「我的第一首歌」一字不少（2-25）
expected: 升級後歌詞、#標籤完整
result: [pending]

### 3. 多首歌日常使用、刪除與從自動備份還原（2-28、2-29）
expected: 新增／切換／改名／刪除順手；刪掉的歌可從「設定 → 自動備份」救回
result: [pending]

### 4. 匯出 TXT／Markdown／複製整首、PDF 排版好看（2-30、2-31）
expected: 內容正確；長歌 PDF 分頁不把段落名單獨留在頁尾
result: [pending]

### 5. iPhone／Android 下載、列印、複製與兩台裝置之間備份還原（2-32、2-33）
expected: 檔名正確、還原完整
result: [pending]

### 6. 雲端重拍 Linux 截圖基準（3-19）
expected: 雲端容器 npm run visual:update 後 npm test 全過
result: [pending]

### 7. 第 8 階段自主決定與審查後改變（5-69～5-91）
expected: 逐條同意或否決
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0

## Gaps
