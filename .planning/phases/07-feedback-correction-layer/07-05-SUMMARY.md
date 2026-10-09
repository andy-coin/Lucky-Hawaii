---
phase: 07-feedback-correction-layer
plan: 05
subsystem: admin-ui
tags: [admin, grouping, batch-review, x-admin-key, xss, a11y, playwright]
status: complete

requires:
  - phase: 07-feedback-correction-layer
    provides: "07-01 的 adminKeyOk（X-Admin-Key 優先）與 /reports.json 的 X-Reports-Truncated；07-04 送出的 reportType（讀音錯誤／極度冷僻／不該出現／其他）與 note／suggested 欄位"
provides:
  - "後台金鑰只走 X-Admin-Key header（adminFetch），網址上沒有 key="
  - "groupReports：同一個詞（或字＋讀音）＋同一個回報類型合成一列，feedback 與 AI 建議各自一列"
  - "memberStatus／groupStatus（layer 參數預設為空，07-07 填入）、approveOpFor（D-12 預設動作）"
  - "整列核准／駁回對列內每一筆寫入同一個決定（並行 4）；篩選五顆、全選目前篩選結果、批次核准／駁回／封存／還原／刪除"
  - "所有列內按鈕改 data-act＋事件委派，沒有範本拼出的 on* 屬性（B5）"
  - "後台自己的 --action-bg／--action-bg-hover／--info-text／--ok-text／--err-text／--warn-text（亮暗各一份）與 ≤700px 手機版面"
affects: [07-07, 07-10]

actuals:
  tokens: 27900
  tasks: 3
  commits: 4
plan_head_before: f51128dd0125bc289637e7e1c23094818ab69055
plan_head_after: dab7fb07658d59d68bd6bb11665bdccfb5df0426

tech-stack:
  added: []
  patterns:
    - "列（group）是操作單位：runGroup／batchRun 對列內每一筆各送一次 /reports/decision，失敗就逐筆回滾並在那一列顯示錯誤"
    - "按鈕只放 data-act／data-group／data-op，一個 #main 上的 click 委派分派；使用者字串只經 esc()"
    - "bridgeWorker 的 reflectOrigin 選項：後台測試把 ACAO 換成請求來源"

key-files:
  created:
    - tests/admin.spec.mjs
  modified:
    - admin/index.html
    - tests/worker-helpers.mjs

key-decisions:
  - "×1 與 ×n 的取捨照 UI-SPEC 10.1：只有一筆也顯示「×1」（版面穩定），≥3 才用警示色；不採邊界探測「只有 n≥2 才顯示」的說法（07-10 TEST-CHECKLIST 自主決定要記）"
  - "換篩選或切換「顯示已封存」時，看不見的列自動取消選取，批次動作永遠只作用在畫面上的列"
  - "批次結果行是獨立的固定元素 #batchResult（4 秒），因為成功後選取清空、批次列會隱藏"
  - "已寫入資料檔（written）歸「已上線」篩選；備註已處理（done）與已封存只在「全部」出現"
  - "已上線／已寫入的回報在核准、駁回、封存、還原、刪除時一律略過（isLocked），07-07 才提供撤回"

patterns-established:
  - "後台測試：bootAdmin（bridgeWorker＋FakeKV＋台北時區＋記錄每個 Worker 請求的標頭），用 context.route 疊一層攔截可延遲或改寫單一路徑的回應"
  - "整頁會捲動的後台，相鄰間距檢查改成一段一段捲動、同一刻量可見控制項的框（auditTouchTargets 的 overlaps 會誤報）"

requirements-completed: [FB-02]

coverage:
  - id: D1
    description: "後台每個 Worker 請求（reports.json、decision、delete）都帶 X-Admin-Key，網址沒有 key="
    requirement: FB-02
    verification:
      - kind: e2e
        ref: "tests/admin.spec.mjs#後台：金鑰標頭"
        status: pass
      - kind: unit
        ref: "tests/admin.spec.mjs#後台：靜態掃描"
        status: pass
    human_judgment: false
  - id: D2
    description: "同詞＋同原因合併成一列（×n、最早→最新、展開原文新到舊、note 與 suggested 都顯示、沒說明有後備字樣）；原因不同分列；feedback 不合併"
    requirement: FB-02
    verification:
      - kind: e2e
        ref: "tests/admin.spec.mjs#後台：合併"
        status: pass
      - kind: e2e
        ref: "tests/admin.spec.mjs#後台：次數"
        status: pass
    human_judgment: false
  - id: D3
    description: "整列核准（hide_word）與駁回對列內每一筆寫入同一個決定，可還原"
    requirement: FB-02
    verification:
      - kind: e2e
        ref: "tests/admin.spec.mjs#後台：整列核准／後台：駁回"
        status: pass
    human_judgment: false
  - id: D4
    description: "篩選五顆帶數量、全選目前篩選結果（半選、空篩選選到 0 列）、顯示已封存疊在上面"
    requirement: FB-02
    verification:
      - kind: e2e
        ref: "tests/admin.spec.mjs#後台：篩選／後台：全選"
        status: pass
    human_judgment: false
  - id: D5
    description: "批次核准依 D-12（太冷僻→隱藏、不該出現→移除，其餘略過並說明）、全部略過不送、批次駁回、部分失敗只留失敗列、處理中鎖住"
    requirement: FB-02
    verification:
      - kind: e2e
        ref: "tests/admin.spec.mjs#後台：批次核准／全部略過／批次駁回／部分失敗／處理中"
        status: pass
    human_judgment: false
  - id: D6
    description: "空白、篩選沒有、金鑰不對、讀取失敗、載入中、截斷提示、待審優先排序、混合狀態筆數、統計列"
    requirement: FB-02
    verification:
      - kind: e2e
        ref: "tests/admin.spec.mjs#後台：空白與錯誤／排序／統計／次數"
        status: pass
    human_judgment: false
  - id: D7
    description: "使用者字串（詞、字、備註、主旨、AI 詞）一律當文字：img／svg 載荷不產生元素、不跳對話框；沒有範本拼出來的 on* 屬性"
    requirement: FB-02
    verification:
      - kind: e2e
        ref: "tests/admin.spec.mjs#後台：XSS"
        status: pass
      - kind: unit
        ref: "tests/admin.spec.mjs#後台：靜態掃描"
        status: pass
    human_judgment: false
  - id: D8
    description: "手機 390：不橫向捲動、時間掉到標題下、全部控制項 ≥44px 且間距 ≥4px、批次列貼底；新顏色變數亮暗各一份、文字對比 ≥4.5；新規則字級字重合規"
    requirement: FB-02
    verification:
      - kind: automated_ui
        ref: "tests/admin.spec.mjs#後台：手機"
        status: pass
      - kind: automated_ui
        ref: "tests/admin.spec.mjs#後台：顏色"
        status: pass
      - kind: unit
        ref: "tests/admin.spec.mjs#後台：字級與字重"
        status: pass
    human_judgment: false
  - id: D9
    description: "真機手機上批次審回報的手感（點選範圍、批次列貼底後蓋住內容的程度、橡皮筋框選在觸控上的行為）"
    requirement: FB-02
    human_judgment: true
    rationale: "Playwright 只能量版面與點擊範圍，無法判斷真手指操作順不順；列入 07-10 人工驗收"

duration: 21 min
completed: 2026-10-10
---

# Phase 7 Plan 05: 後台合併列與批次核准／駁回 Summary

**後台改用 X-Admin-Key header，同一個詞＋同一原因的回報合成一列（×n、時間範圍、展開原文），一鍵核准／駁回整列每一筆，並加上五顆篩選、全選目前篩選結果、依 D-12 預設的批次核准、各種空白／載入／錯誤畫面，所有使用者字串改走 esc() 與 data-* 事件委派，手機 390 版面全部控制項 ≥44px。**

## Performance

- **Duration:** 21 min
- **Started:** 2026-10-09T18:39:22Z
- **Completed:** 2026-10-09T19:00:22Z（系統時鐘；計畫日期記 2026-10-10）
- **Tasks:** 3（tracer＋TDD 兩段）
- **Files modified:** 3（`admin/index.html`、`tests/admin.spec.mjs` 新增、`tests/worker-helpers.mjs`）

## Accomplishments

- **Task 1 tracer（`3ca81b9`）**：`adminFetch` 只用 header 帶金鑰；`groupReports`／`memberStatus`／`groupStatus`／`renderGroupRow`；事件委派取代所有範本拼出的 `onclick`；`execGroup`／`runGroup` 對列內每一筆送決定（並行 4、失敗回滾）；`fmtTime` 改本機 `YYYY-MM-DD HH:mm`。Tracer 閘：4 筆後台測試＋20 筆 `worker-admin` 全綠後才擴充（`⚡ Tracer verified end-to-end — expanding`）。
- **Task 2（RED `fb39b27`、GREEN `c0707a5`）**：先寫 11 筆規格（10 筆失敗），再做篩選列、全選（半選）、`batchApprove`／`batchDismiss`、`batchRun`（失敗列保持選取）、處理中鎖定、`#batchResult`、待審優先排序、統計列、空白／載入／錯誤文案。
- **Task 3（`dab7fb0`）**：≤700px 規則（標題列換行、時間掉到標題下、控制項 ≥44px、批次列貼底）；XSS、靜態掃描、字級字重、手機、顏色五筆測試。
- 測試：`tests/admin.spec.mjs` 共 **20 筆**（要求 ≥18）；`npx playwright test tests/admin.spec.mjs tests/worker-admin.spec.mjs` 44 passed；`npm test` **525 passed / 27 skipped / 0 failed**（基準 505 / 27 / 0）。

## Task Commits

1. Task 1 tracer: `3ca81b9` feat(07-05) 後台改用 X-Admin-Key，同詞同原因合併，一鍵核准／駁回整列
2. Task 2 RED: `fb39b27` test(07-05) 篩選、全選、批次、空白與錯誤的規格（10 筆失敗）
3. Task 2 GREEN: `c0707a5` feat(07-05) 篩選列、全選、批次核准／駁回與各種畫面
4. Task 3: `dab7fb0` feat(07-05) 防注入收尾、手機版面、新顏色與測試

## Files Created/Modified

- `admin/index.html` — 分組與狀態（`groupReports`、`memberStatus`、`groupStatus`、`approveOpFor`）、`renderGroupRow`、篩選列與批次列、`adminFetch`、事件委派、≤700px 規則、新顏色變數；既有的匯出 agreed、編輯面板、新增視窗、橡皮筋框選保留（改以列為單位）。
- `tests/admin.spec.mjs` — 新增，`bootAdmin`（bridgeWorker＋FakeKV）與 20 筆 `後台：` 規格。
- `tests/worker-helpers.mjs` — `bridgeWorker(context, env, { reflectOrigin })` 新選項。

## Decisions Made

- **×1 vs ×n≥2（給 07-10 TEST-CHECKLIST「自主決定」）**：照 UI-SPEC 10.1，只有一筆也顯示「×1」，≥3 才用警示色；邊界探測寫的「只有 n≥2 才顯示」沒採用。
- 換篩選時自動取消看不見的列的選取；全選只作用在畫面上的列。
- 批次成功後，被略過的「需手動」列也一併取消選取；整批都被略過時選取保留。
- 已上線／已寫入的回報由 `isLocked` 擋在所有決定之外，07-07 補撤回後才會真的出現。

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 後台測試被瀏覽器 CORS 擋掉**
- **Found during:** Task 1（第一次跑 `bootAdmin`，頁面顯示「讀不到回報」）
- **Issue:** 回報／後台路徑的 `Access-Control-Allow-Origin` 固定是正式網站 `https://andy-coin.github.io`，測試頁面在 `127.0.0.1:4310`，Chromium 擋下回應（Failed to fetch）。
- **Fix:** `bridgeWorker` 加 `reflectOrigin` 選項，只在後台測試把 ACAO 換成請求來源；Worker 本身的 CORS 行為仍由 `worker-admin.spec.mjs` 守。
- **Files modified:** tests/worker-helpers.mjs、tests/admin.spec.mjs
- **Commit:** 3ca81b9

**2. [Rule 1 - Bug] 計畫指定的文字色在亮色主題對比不到 4.5**
- **Found during:** Task 3（「後台：顏色」實測）
- **Issue:** 照 UI-SPEC 用 `--text-secondary`（`#6b778a`）的展開鈕、篩選晶片、備註文字在 `#eee3ce` 底只有約 3.6:1；「（沒有說明）」用 `--text-muted` 只有 1.8:1。計畫自己的驗收要求 ≥4.5。
- **Fix:** `.card-text`、`.chip`、`.row-toggle`、`.mini-badge`、`.manual-note` 改用 `--text-primary`；「（沒有說明）」改用斜體區分，不再靠變淡。其餘顏色變數與 UI-SPEC §7 完全一致。
- **Files modified:** admin/index.html
- **Commit:** dab7fb0（變更在 Task 1 的 CSS 起頭、Task 3 驗證後定案）

**3. [計畫與現況不符] `auditTouchTargets().overlaps` 在整頁會捲動的後台誤報**
- **Issue:** 該函式對每個元素各自捲到畫面中央才量、座標不含頁面捲動量，後台整頁捲動時回報 882 筆假重疊（和 07-04 在 150% 縮放遇到的同一個限制）。
- **Fix:** 手機測試仍用 `auditTouchTargets` 檢查 `failures`（≥44px）與 `missing`；相鄰間距改成一段一段捲動、在同一刻用 `auditVisibleControls` 量可見控制項，框外擴 2px 不可重疊（= 間距 ≥4px）；貼底的批次列與頁面內容分開比。
- **Files modified:** tests/admin.spec.mjs
- **Commit:** dab7fb0

### 判斷與小差異（非偏離）

- 按鈕的可及名稱是 `aria-label`（例：`核准「二心」的回報（3 筆）`），所以測試用 `getByRole('button', { name: /^核准「/ })`，不是 `exact: '核准'`。
- 批次結果行做成固定的 `#batchResult`，不放在批次列內：成功後選取清空、批次列要隱藏（n = 0），結果行仍要看得到 4 秒。手機版移到畫面頂端以免蓋住貼底的批次列。
- 「全選」勾選框在 0 列時按下去勾不起來（狀態由實際選取數決定），測試對空篩選用 `click()` 而非 `check()`。
- 計畫寫「至少 14／18 筆」；實際 Task 2 結束 15 筆、Task 3 結束 20 筆（多的是「後台：次數」與「後台：字級與字重」，對應計畫真值裡的 ×100、20 筆捲動上限與字級字重規定）。

**Total deviations:** 2 auto-fixed（1 Rule 1、1 Rule 3）＋ 1 計畫與現況不符的測試手法調整。**Impact:** 全在 `admin/` 與 `tests/` 範圍內；沒有範圍外功能，沒有任何既有測試被改弱或改期望值；主站 `css/`、`js/` 未動，`?v=` 維持 0.96.10。

## Issues Encountered

- 系統時鐘顯示 2026-10-09，計畫與前幾份摘要記 2026-10-10；本摘要沿用 2026-10-10 作為完成日，時間戳記以實際時鐘為準。

## Known Stubs

- `admin/index.html` 的 `layer = { entries: [], written: [] }`：計畫指定的接縫，07-07 載入線上修正層後填入；在那之前「已上線／已寫入」狀態不會出現，也沒有「撤回」按鈕（`rowActions` 對 live／written 回傳空字串）。這不影響本計畫目標（ROADMAP 準則 2：合併、批次核准／駁回）。

## Threat Flags

None — 沒有新增網路端點、認證路徑或信任邊界；後台只改成用既有路由，T-07-16（XSS 測試）、T-07-17（靜態掃描）、T-07-18（標頭測試）都有對應測試。

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 07-07 可直接把 `layer` 填上（`entries` 的 `source_kvKeys` 對得到 kvKey 就會變「已上線」），並在 `rowActions` 補 live 的「撤回」；apply bar 放在 `#main` 第一個子元素前，篩選列已預留下面的位置。
- 07-10 人工驗收：真機手機批次審回報（D9）；TEST-CHECKLIST 自主決定記上 ×1 的取捨與「無說明改斜體」。
- 提醒：`FB-02` 與同階段其他計畫共用，`requirements.ready-ids` 顯示尚未全部完成，所以沒有標記完成。

## Self-Check: PASSED

- 檔案：`admin/index.html`、`tests/admin.spec.mjs`、`tests/worker-helpers.mjs` 皆存在。
- Commits：`3ca81b9`、`fb39b27`、`c0707a5`、`dab7fb0` 皆在 `git log`；`git rev-list --count f51128d..HEAD` = 4。
- 三個 Task 的 acceptance_criteria 全部 PASS（grep 計數與 `-g "整列核准"`、`-g "XSS"` 各 1 passed）；`npm test` 525 passed / 27 skipped / 0 failed。

---
*Phase: 07-feedback-correction-layer*
*Completed: 2026-10-10*
