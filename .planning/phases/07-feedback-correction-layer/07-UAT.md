---
status: testing
phase: 07-feedback-correction-layer
source: [07-VERIFICATION.md]
started: 2026-10-10
updated: 2026-10-10
---

## Current Test

number: 1
name: 正式環境走一次「核准 → 套用 → 撤回 → 寫回 push → 清空」
expected: |
  Worker 先部署、再合併 main；套用後 1～2 分鐘網站看得到修正、撤回後恢復；
  寫回腳本 --apply --push 等到線上生效才清空，重跑不重複
awaiting: user response

## Tests

> 白話步驟在 `.planning/驗收清單-精簡版.md`（括號內是清單編號），這裡只列結論。

### 1. 正式環境走一次（2-23、2-24、1-4）
expected: 核准→套用→看到→撤回→恢復→重新核准→套用→寫回 push→清空→重跑沒有變化；記下 CDN 實際等了多久；確認 Pages 發佈分支（3-16）
result: [pending]

### 2. 手機實機回報流程（2-18～2-21）
expected: 點選字卡 → 🚩 回報 → 選原因 → 送出順手；長按字卡不跳選單；AI 回報模式好用；iOS 鍵盤不擋
result: [pending]

### 3. 後台手機批改手感（2-22、4-16～4-18）
expected: 合併列、批次核准、套用列在手機上好用
result: [pending]

### 4. 雲端重拍 Linux 截圖基準（3-17）
expected: 在雲端容器跑 npm run visual:update 後 npm test 全過
result: [pending]

### 5. 程式碼審查後的四個改變與舊核准清理（5-64）
expected: 同意或否決；舊「匯出 agreed」手動套用過的回報已封存
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
