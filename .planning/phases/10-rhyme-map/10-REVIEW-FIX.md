---
phase: 10-rhyme-map
fixed: 2026-10-28
fix_commit: see git log "fix(10): 審查修正"
status: fixed
---

# Phase 10: Review Fix

| Finding | Outcome | Change |
|---------|---------|--------|
| WR-01 | fixed | `js/rhyme-map.js` `lhMapSetReading`：`lhMapPaint(el)` → `lhMapRenderAll()`（readings 整首歌共用） |
| WR-02 | fixed | `js/wordlist.js` `_loadWordlistOnce`：`wordlistData = out` 成功後呼叫 `lhMapOnLexiconChange`；拿掉換包成功／退回兩處重複呼叫 |
| WR-03 | fixed | `tests/rhyme-map-perf.spec.mjs`：20ms 門檻乘 `LH_PERF_SCALE`，檔頭註解同步 |
| IN-01 | fixed | 刪掉只寫不讀的 `_lhMapDeferred` |
| IN-02～06 | open (advisory) | 不影響正確性；留給之後整理（IN-04 讀入時清洗 readings 可在 Phase 11 動 lh:map 時一起做） |

Verification: `npm test` 964 passed / 28 skipped / 0 failed.
