---
phase: 07-feedback-correction-layer
plan: 03
subsystem: site-corrections
tags: [rhyme-dict, corrections-layer, robustness, playwright]
status: complete

requires:
  - phase: 07-feedback-correction-layer
    provides: "07-01 loadCorrections（記憶化、永不 reject、3 秒逾時）與 bootPage corrections 選項；07-02 replayEntries 的 rhymeDict 規則"
provides:
  - "applyRhymeDictOverrideDoc：data 修正檔與修正層共用同一套套用規則"
  - "兩段式 applyRhymeDictOverrides：data 檔先套、修正層後套，兩段各自可缺、各自 try/catch"
  - "修正層 Worker 失敗／逾時／離線、順序、換詞庫包、只抓一次的瀏覽器規格"
affects: [07-04, 07-08]

actuals:
  tokens: 6000
  tasks: 2
  commits: 2
plan_head_before: 38e98021cf6b67c202ddc25937fbf83a20fcc956
plan_head_after: 2a11602855ae5f2ec7bca5323d67ad5c827ac2f7

tech-stack:
  added: []
  patterns:
    - "字庫與詞庫的修正層都走『base 與 layer 各自 optional、各自 try/catch』的兩段式套用"

key-files:
  created: []
  modified:
    - js/dict.js
    - tests/corrections-site.spec.mjs

key-decisions:
  - "init.js 不動：applyRhymeDictOverrides 仍回傳 count > 0，buildIndex() 在兩段套完後只跑一次"
  - "fixed 的測試改用 常 ㄔㄤ2 → ㄕㄤ2：計畫寫的 長 → ㄓㄤ3 在 data 字庫裡本來就有（ㄓㄤ3 已含『長』），拿它驗不出修正有沒有生效"
  - "『不繞過瀏覽器快取』無法用瀏覽器測：Playwright 攔截路由會關掉 HTTP 快取，請求標頭也看不到 fetch 的 cache 模式（實測注入 no-cache 後標頭完全相同），改為檢查 loadCorrections 原始碼不含 no-cache／no-store／reload，並維持『只發一次請求』的行為斷言"

requirements-completed: [FB-03]

coverage:
  - id: C1
    description: "修正層字庫 hidden 的讀音，重新整理後查韻看不到那張字卡（對照頁仍有）"
    requirement: FB-03
    verification:
      - kind: e2e
        ref: "tests/corrections-site.spec.mjs#修正層：字庫隱藏讀音後，查韻看不到那張字卡（對照頁仍看得到）"
        status: pass
    human_judgment: false
  - id: C2
    description: "修正層字庫 fixed／added 與 data 修正檔用同一套規則移動、新增字"
    requirement: FB-03
    verification:
      - kind: e2e
        ref: "tests/corrections-site.spec.mjs#修正層：字庫修正與新增讀音"
        status: pass
    human_judgment: false
  - id: C3
    description: "Worker 503／形狀不對／逾時／離線：頁面就緒、查韻與 AI 建議可用、恰一則「修正層載入失敗」警告、無橫幅無提示無 console.error"
    requirement: FB-03
    verification:
      - kind: e2e
        ref: "tests/corrections-site.spec.mjs#修正層：Worker 失敗（503／形狀不對）時網站照常可用，只留一則警告"
        status: pass
      - kind: e2e
        ref: "tests/corrections-site.spec.mjs#修正層：逾時（Worker 一直不回）不卡頁面，3 秒後放棄並留一則警告"
        status: pass
      - kind: e2e
        ref: "tests/corrections-site.spec.mjs#修正層：離線（Worker 請求被中斷）時網站照常可用，只留一則警告"
        status: pass
    human_judgment: false
  - id: C4
    description: "data 檔先移除、修正層再加回 → 只有一筆；換詞庫包時修正層被移除的詞在每個包都消失，且只請求一次"
    requirement: FB-03
    verification:
      - kind: e2e
        ref: "tests/corrections-site.spec.mjs#修正層：順序——data 修正檔先套、修正層後套（先移除、再加回，只有一筆）"
        status: pass
      - kind: e2e
        ref: "tests/corrections-site.spec.mjs#修正層：換詞庫包——被移除的詞在每個包都消失，且不再抓第二次"
        status: pass
    human_judgment: false
  - id: C5
    description: "修正層請求不繞過瀏覽器快取、每次載入只發一次"
    requirement: FB-03
    verification:
      - kind: e2e
        ref: "tests/corrections-site.spec.mjs#修正層：只抓一次，且 loadCorrections 不繞過瀏覽器快取（沒有 no-cache）"
        status: pass
    human_judgment: true
    rationale: "快取模式在 Playwright 內不可觀測，只有原始碼檢查；真正的 max-age=60 生效要在部署後的瀏覽器網路面板看"
---

# Phase 7 Plan 03: 字庫修正層兩段式套用與失敗韌性 Summary

字庫（rhymeDict）的修正層與 data 修正檔共用同一套套用函式，先 data 後修正層、兩段各自可缺；Worker 掛掉、太慢、壞掉或離線時網站照常使用，只留一則警告。

## Performance

- **Duration:** 約 25 分鐘
- **Tasks:** 2
- **Files modified:** 2（js/dict.js、tests/corrections-site.spec.mjs）

## Accomplishments

- `applyRhymeDictOverrideDoc(ovr)` 從原函式抽出（欄位檢查與 tier 預設值不變），`applyRhymeDictOverrides()` 改成 `Promise.all([base 抓取, loadCorrections()])` 後依序套用，各自 try/catch（警告「字庫修正檔套用失敗」「修正層套用失敗」）。base 抓不到不再提早結束，修正層仍會套。
- 規格 +9 條（`修正層：` 開頭共 11 條）：字庫隱藏、修正與新增、Worker 失敗、逾時、離線、順序、換詞庫包、只抓一次。
- 實作面除了字庫兩段式之外沒有其他改動：07-01 的 `loadCorrections`（3 秒逾時、記憶化、永不 reject）與 `applyWordlistOverrides` 已經滿足 Task 2 的全部行為，新測試一寫出來就是綠的。

## Task Commits

1. **Task 1（tracer）：字庫兩段式套用** - `20a56be`（feat）。先寫兩條規格確認紅燈（隱藏讀音、修正讀音確實因斷言失敗），實作後 `corrections-site` + `golden` 47 條全綠，tracer 驗證通過後才進 Task 2。
2. **Task 2：失敗韌性／順序／換包／只抓一次** - `2a11602`（test）

## Verification

- `npx playwright test tests/corrections-site.spec.mjs tests/wordlist-cache.spec.mjs tests/lexicon-packs.spec.mjs`：39 passed
- `npm test`：473 passed / 27 skipped / 0 failed（基線 465）
- 突變檢查：把 `AbortSignal.timeout(3000)` 換掉，逾時規格確實紅燈（卡滿 1 分鐘）。
- 驗收：`function applyRhymeDictOverrideDoc` 1、`layer.rhymeDict` 1、init.js 該行 1（未改）、`no-cache` 在 js/dict.js 恰 1（僅 base 字庫檔）、`修正層載入失敗` 1。

## TDD Gate Compliance

Task 2 標 `tdd="true"`，但沒有 RED 提交：07-01 與 Task 1 已把所有行為做完，Task 2 的測試寫好第一次就通過（計畫預期「只修測試揭露的問題，預期無」）。為避免測試空轉，我另做了突變檢查（見上）證明逾時規格會失敗；快取規格因 Playwright 限制改為原始碼檢查（見 key-decisions）。Task 1 為 tracer，依規則只做一次提交。

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 計畫的 fixed 測試案例驗不出修正**
- **Found during:** Task 1
- **Issue:** 計畫用 長 `ㄔㄤ2 → ㄓㄤ3`，但 data 字庫的 `ㄓㄤ3` 本來就含「長」，即使修正沒套用該斷言也成立。
- **Fix:** 改用 常 `ㄔㄤ2 → ㄕㄤ2`（原本不在 ㄕㄤ2），同時斷言 ㄔㄤ2 下不再有常。added 仍照計畫用 長 → ㄌㄤ2。
- **Files modified:** tests/corrections-site.spec.mjs
- **Commit:** 20a56be

**2. [Rule 1 - Bug] 計畫的快取斷言在瀏覽器裡測不到**
- **Found during:** Task 2
- **Issue:** 計畫要求以請求標頭驗證沒有 no-cache；實測在 loadCorrections 注入 `cache: 'no-cache'` 後，Playwright 看到的標頭完全相同（攔截路由會關掉 HTTP 快取，fetch 的 cache 模式不寫進這層標頭），該斷言永遠是綠的。
- **Fix:** 改為檢查 loadCorrections 原始碼不含 no-cache／no-store／reload，並保留單次請求斷言；同時把 07-01 留在註解裡的字面 `no-cache` 改寫，讓 `grep -c "no-cache" js/dict.js` == 1。
- **Files modified:** tests/corrections-site.spec.mjs、js/dict.js
- **Commit:** 2a11602

**Total deviations:** 2 auto-fixed（2 Rule 1，皆為測試設計修正）。**Impact:** 無範圍變動，行為覆蓋不減。

## Known Stubs

None.

## Threat Flags

None. T-07-11（欄位檢查＋各段獨立 try/catch）與 T-07-12（3 秒逾時、記憶化、hang／離線規格）皆已落實。

## Next

Ready for 07-04.

## Self-Check: PASSED

- js/dict.js、tests/corrections-site.spec.mjs 存在；提交 20a56be、2a11602 存在於分支 gsd/v0.96-stabilize。
