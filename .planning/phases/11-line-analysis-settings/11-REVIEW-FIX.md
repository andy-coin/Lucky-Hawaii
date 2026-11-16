---
phase: 11-line-analysis-settings
fixed: 2026-10-28
status: fixed
---

# Phase 11: Review Fix

| Finding | Outcome | Change |
|---------|---------|--------|
| WR-01 | fixed | `js/rhyme-map.js` 新增 `lhMapOnSectionsChanged()`（對照差異開著時每段重排，沒變的被快取略過）；`js/sections.js` `lhSecRefreshMeta` 結尾呼叫；測試「對照：改了段落類型，對照段落換人，≠ 跟著更新」（沒修時紅、修後綠） |
| IN-05 | fixed | `index.html` line-core 標籤縮排 |
| IN-01～04 | open (advisory) | IN-01 鏡像層尾端零寬字在剛好換行時多一列（Phase 10 就有，字與標記仍對齊）；IN-02 詞庫載入失敗時「載入中」提示不消失；IN-03／04 重複常數與條件 |

Verification: `npm test` 1038 passed / 29 skipped / 0 failed.
