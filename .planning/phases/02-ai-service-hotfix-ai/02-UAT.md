---
status: testing
phase: 02-ai-service-hotfix-ai
source: [02-VERIFICATION.md]
started: 2026-10-04
updated: 2026-10-04
---

## Current Test

number: 1
name: 登入 Cloudflare 並正式部署 Worker
expected: |
  照 worker/DEPLOY.md 步驟 1–7：wrangler login、填兩個 KV id、設三個 secret、讀過部署差異（不可移除回報 KV 與 secrets）後 npm run worker:deploy 成功
awaiting: user response

## Tests

### 1. 登入 Cloudflare 並正式部署 Worker
expected: DEPLOY.md 步驟 1–7 完成，部署成功，舊的回報資料還在後台看得到
result: [pending]

### 2. 線上健康檢查與 AI 建議
expected: POST /health/run?key=… 回報模型健康；合併分支更新網站後，在線上按一次「AI 建議」拿得到結果
result: [pending]

### 3. 免費方案是否接受 [[ratelimits]]
expected: 部署未因 ratelimits 區塊被拒；若被拒，依 DEPLOY.md 刪除該區塊後重新部署
result: [pending]

### 4. 第一次夜間排程（台灣 03:17）
expected: 隔天 GET /health.json?key=… 的 checkedAt 是新的日期
result: [pending]

### 5. 確認健康檢查的取捨（WR-04）
expected: Andy 同意：模型暫時性失敗一次仍沿用昨天狀態，連續兩天暫時性失敗才移除；404 立即移除
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
