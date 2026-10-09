---
phase: 07-feedback-correction-layer
plan: 07
subsystem: admin-ui
tags: [admin, corrections-layer, apply, revoke, optimistic-lock, a11y, playwright]
status: complete

requires:
  - phase: 07-feedback-correction-layer
    provides: "07-02 的 /corrections/apply、/revoke、/admin.json（rev、409、503、LAYER_FULL）；07-05 的分組列、memberStatus(r, layer)、adminFetch、事件委派、後台顏色變數"
provides:
  - "黏在最上面的套用列：線上修正層筆數、等待套用筆數、🚀 套用到線上（m），每 100 筆一批只送 kvKey 與 baseRev，沒有確認視窗"
  - "已上線／已寫入由修正層推出來（byKey／writtenSet），不另外寫回報；已上線列顯示套用時間、已上線標籤與撤回按鈕"
  - "撤回：依來源回報找出修正層項目，一次送 ids 與 baseRev，成功後列回到已核准未套用"
  - "失敗全部白話：金鑰不對／網路不通／伺服器回應 N、409 請重新載入、撤回已不在線上、讀取失敗加重試、超過 500 筆提醒"
  - "getEffectiveReadings 在 data 修正檔之後再套修正層 view"
  - "匯出 agreed 改為備援（btn-reload 外觀）"
affects: [07-08, 07-10]

actuals:
  tokens: 35000
  tasks: 2
  commits: 3
plan_head_before: 4318f883425d6d71955baea87b761b7c7a93161b
plan_head_after: 1dd2bb770195c0dcecbc1e108243527f7b68c0ba

tech-stack:
  added: []
  patterns:
    - "狀態由修正層推出來：loadLayer 把 entries 的 source_kvKeys 建成 Map，memberStatus 查表；每次寫入後重讀，頁面永遠顯示線上真正的狀態"
    - "layerBusy 同時鎖套用與撤回，套用另外鎖勾選與批次列；fetchReports 等修正層讀完才畫列，已上線不會先閃成已核准"
    - "測試用 except(path, fn) 包 context.route，OPTIONS 預檢放給 Worker 橋，其餘才攔截"

key-files:
  created: []
  modified:
    - admin/index.html
    - tests/admin.spec.mjs

key-decisions:
  - "列內只要有一筆在線上就顯示撤回（不只整列都已上線時），否則已上線三筆後又來一筆新回報的列再也撤不掉"
  - "Worker 重驗後不收的項目（invalid／no_effect／not_found…）算沒套用：訊息補「另有 N 筆沒有套用」，全部不收時用失敗行；already_applied／already_written 視為已完成"
  - "修正層讀取失敗時保留上一份資料、只把狀態改成 error（套用停用），不清空"
  - "套用列的說明文字與摘要改用 --text-primary，不用 UI-SPEC 的 --text-secondary（亮色底 3.6:1，沿用 07-05 的判斷）"

patterns-established:
  - "後台測試的黏頂套用列要與內容控制項分層量間距（sticky 蓋在內容上面）"

requirements-completed: [FB-03, FB-04]

coverage:
  - id: D1
    description: "套用一次送出全部已核准項目（只有 kvKey 與 baseRev），三筆同詞合成一條，列變已上線，線上公開 view 讀得到；撤回一鍵恢復，等待套用回升"
    requirement: FB-03
    verification:
      - kind: e2e
        ref: "tests/admin.spec.mjs#後台：套用／後台：撤回"
        status: pass
    human_judgment: false
  - id: D2
    description: "套用失敗（403／網路中斷／503）、409、重按、部分略過、讀取失敗與重試、撤回已不在、超過 500 筆（500 無、501 有）都有白話說明且狀態正確"
    requirement: FB-04
    verification:
      - kind: e2e
        ref: "tests/admin.spec.mjs#後台：套用失敗／409／重按／套用部分略過／超過 500 筆／讀取失敗／撤回已不在"
        status: pass
    human_judgment: false
  - id: D3
    description: "已寫入資料檔、備註已處理、有效讀音併入修正層、備援匯出鈕"
    requirement: FB-03
    verification:
      - kind: e2e
        ref: "tests/admin.spec.mjs#後台：已寫入資料檔／備註／有效讀音／備援匯出"
        status: pass
    human_judgment: false
  - id: D4
    description: "已上線標籤、成功／失敗／警告行亮暗對比 ≥ 4.5；手機 390 錯誤行在套用列內換行不蓋按鈕"
    requirement: FB-03
    verification:
      - kind: automated_ui
        ref: "tests/admin.spec.mjs#後台：已上線顏色／後台：手機錯誤行"
        status: pass
    human_judgment: false
  - id: D5
    description: "真機上黏頂套用列蓋住內容的程度、按下 🚀 後到網站實際看到修正的體感時間"
    requirement: FB-03
    human_judgment: true
    rationale: "Playwright 量得到版面與請求，量不到真手機捲動手感與 Cloudflare 邊緣快取的實際生效時間；列入 07-10 人工驗收"

duration: ~45 min
completed: 2026-10-10
---

# Phase 7 Plan 07: 後台套用到線上與撤回 Summary

**後台新增黏頂套用列：按一下 🚀 把所有已核准的修正送進 Worker 修正層，列依修正層顯示已上線並可一鍵撤回，所有失敗、衝突、過大與讀取失敗都用白話說明，取代讀音時看得到修正層的有效讀音。**

## Accomplishments

- **Task 1 tracer（`b94917b`）**：`loadLayer` 讀 `/corrections/admin.json`，建 `byKey`／`writtenSet`；`applyApproved` 每 100 筆一批、帶目前 rev、不彈確認；`revokeGroup` 依來源回報找出項目；`memberStatus` 改查表。Tracer 閘：`admin.spec` + `worker-corrections.spec` 53 passed 後才擴充。
- **Task 2 RED（`f0004b7`）**：13 筆新規格，9 筆失敗。
- **Task 2 GREEN（`1dd2bb7`）**：409／404／部分略過／讀取失敗重試／超過 500 筆提醒、已上線標籤、`getEffectiveReadings` 併入 `layer.view.rhymeDict`、匯出鈕改備援。
- 測試：`後台：` 開頭共 **35 筆**（要求 ≥32）；`npx playwright test tests/admin.spec.mjs tests/worker-corrections.spec.mjs` 66 passed；`npm test` **546 passed / 27 skipped / 0 failed**（基準 531 / 27 / 0）。

## Task Commits

1. Task 1 tracer: `b94917b` feat(07-07) 後台套用到線上與撤回
2. Task 2 RED: `f0004b7` test(07-07) 失敗、409、重按、超過 500 筆等規格
3. Task 2 GREEN: `1dd2bb7` feat(07-07) 失敗說明、超過 500 筆、讀取失敗、有效讀音、備援匯出

## Files Modified

- `admin/index.html` — 套用列（`applyBarHtml`、`.apply-bar`）、`loadLayer`／`setLayer`／`applyApproved`／`revokeGroup`／`retryLayer`、`rowActions` 加撤回、`getEffectiveReadings`／`applyReadingOvr`、已上線標籤、匯出鈕。
- `tests/admin.spec.mjs` — 15 筆新規格；「金鑰標頭」多一條 admin.json；手機間距檢查把黏頂套用列另成一層。

## Deviations from Plan

**1. [Rule 1 - Bug] 計畫的已上線底色在亮色主題對比不到 4.5**
- **Found during:** Task 2（「後台：已上線顏色」）
- **Issue:** UI-SPEC 的 `rgba(90,103,216,.18)`（標籤）與 07-05 留下的 `.12`（預覽）疊在 `#eee3ce` 上，`--info-text` 只有 4.14 與 4.44。計畫自己要求 ≥ 4.5。
- **Fix:** 兩者底色透明度降為 `.08`，文字色不動。
- **Files modified:** admin/index.html；**Commit:** 1dd2bb7

**2. [Rule 2 - 缺漏功能] 混合狀態的列沒有撤回**
- **Issue:** 計畫只在整列狀態為已上線時給撤回；已上線三筆後又來一筆已核准，列狀態變「已核准」，撤不掉。
- **Fix:** 列內只要有一筆在線上就顯示撤回（只動線上那幾筆）。**Commit:** b94917b

**3. 判斷與小差異（非偏離）**
- 摘要與說明文字用 `--text-primary`（UI-SPEC 寫 `--text-secondary`，亮色 3.6:1），同 07-05 的處理。
- 新增「套用部分略過」訊息與規格（計畫未寫）：Worker 不收的項目不能被說成已套用。
- 撤回的 409／其他失敗文字計畫沒寫，自擬為「…請按「重新載入」後再試」「撤回沒有成功：{原因}。可以再按一次。」。
- 預檢請求（OPTIONS）要放給 Worker 橋處理，測試才能攔截單一路徑回 403／503。

**Total deviations:** 2 auto-fixed（Rule 1、Rule 2）。**Impact:** 全在 `admin/` 與 `tests/`；沒有既有測試被改弱，只改了兩處因本計畫新增行為而必須變的斷言（請求路徑清單、手機間距分層）。主站 `css/`、`js/` 未動，`?v=` 維持 0.96.10。

## Issues Encountered

None。

## Known Stubs

None。

## Threat Flags

None — 沒有新增端點；T-07-21（只送 kvKey＋baseRev，測試斷言 body 欄位）、T-07-22（每次寫入後重讀修正層）、T-07-23（管理資料只經 esc() 與 data-*）皆有對應。

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 07-08（Python 寫回腳本）會用到 `/corrections/clear`；後台目前沒有清空按鈕，超過 500 筆提示指向 `npm run corrections:writeback`。
- 07-10 人工驗收：真機黏頂套用列手感、按 🚀 後實際生效時間（D5）。
- 提醒：`FB-03`、`FB-04` 與同階段其他計畫共用，`requirements.ready-ids` 決定是否標記完成。

## Self-Check: PASSED

- 檔案：`admin/index.html`、`tests/admin.spec.mjs` 存在。
- Commits：`b94917b`、`f0004b7`、`1dd2bb7` 在 `git log`；`git rev-list --count 4318f88..HEAD` = 3。
- acceptance_criteria：applyApproved 1、`/corrections/admin.json` 2、`/corrections/revoke` 1、「約 1～2 分鐘內生效」2、超過 500 筆 1、已寫入資料檔 3、匯出 agreed（備援）1、線上修正層剛剛有變動 1、layer.view 1，`-g "套用"` 全 passed；`npm test` 546 / 27 / 0。

---
*Phase: 07-feedback-correction-layer*
*Completed: 2026-10-10*
