---
status: testing
phase: 06-lexicon-packs
source: [06-VERIFICATION.md]
started: 2026-10-09
updated: 2026-10-09
---

## Current Test

number: 1
name: 用免費 Gemini 金鑰跑灰色詞 AI 判斷（先校準再正式跑）
expected: |
  lexicon:eval 一致率 ≥ 90%（三酸甘油酯判 K、聚乙烯醇縮丁醛與分散式雜湊表判 D）；
  lexicon:judge 跑完後三個包的「待 AI 判斷」歸零，npm run lexicon:verify 與 npm test 仍全過
awaiting: user response

## Tests

> 白話步驟在 `.planning/驗收清單-精簡版.md`（括號內是清單編號），這裡只列結論。

### 1. 灰色詞 AI 判斷實際跑一次（3-11；SC3、SC4）
expected: 校準 ≥ 90%，正式跑完待判斷歸零，測試全過
result: [pending]

### 2. 抽查三包的刪除報告樣本（tools/lexicon/reports/*/REPORT.md）
expected: 沒有明顯誤刪；審查後放行的「裏、銹、鐧、獴、菓、肽、歐拉」合你的語感（5-43）
result: [pending]

### 3. 高頻中國用語要不要處理（3-15、5-42）
expected: 你選定做法（維持／加進一定刪除／做標記可隱藏／留到第 12 階段）
result: [pending]

### 4. 切換四個詞庫包實際寫詞比較手感（2-16、2-17、3-13）
expected: 切換後查韻與 AI 建議只用新包的詞；「關於」看得到該包來源與授權；選出最順手的包供第 12 階段
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
