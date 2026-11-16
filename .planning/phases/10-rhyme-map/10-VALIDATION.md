---
phase: "10"
slug: "rhyme-map"
status: draft
nyquist_compliant: true
wave_0_complete: false
created: "2026-10-23"
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: 10-RESEARCH.md § Validation Architecture (copied below).


### Test Framework
| Property | Value |
|----------|-------|
| Framework | `@playwright/test` 1.63.0（瀏覽器）＋ `node:vm`（純函式，經 Playwright runner 跑） |
| Config file | `playwright.config.mjs`（`testDir: 'tests'`、webServer＝`node tests/serve.mjs` port 4310、`fullyParallel`、單次 60s、`retries: 0`） |
| Quick run command | `npx playwright test tests/rhyme-core.spec.mjs`（Node vm，秒級） |
| Full suite command | `npm test`（Phase 9 結束基準：843 passed／27 skipped／0 failed） |
| Perf（計時，單一 worker） | `LH_PERF=1 npx playwright test tests/rhyme-map-perf.spec.mjs --workers=1`（比照 `package.json` 的 `perf` script） |

### 固定歌詞範例（均已在真字典＋真 `getCharAllReadings`＋`polyphonic-order.json` 的 Node vm 原型跑出；詞庫欄為 stub）
| ID | 歌詞（每行一句） | 寬韻字母 | 嚴格字母 | 備註（句尾字：韻／家族） |
|----|------------------|----------|----------|--------------------------|
| F-AABB | `我望著遠方的光`／`獨自站在窗`／`走過熟悉的街道`／`終於我也回到` | **AABB** | **AABB** | 光ㄨㄤ、窗ㄨㄤ（同韻）；道ㄠ、到ㄠ |
| F-ABAB | `我望著遠方的光`／`走過熟悉的街道`／`你笑著說天亮`／`不怕前方的路遙` | **ABAB** | **ABCD** | 光ㄨㄤ、亮ㄧㄤ 同家族 14；道ㄠ、遙ㄧㄠ 同家族 8 |
| F-FAM1 | `夜空裡閃著星光`／`我在這裡等天亮`／`風吹過熟悉的街道`／`回頭看你還在笑` | AABB | ABCD | 4 行全為孤句時嚴格各自孤句 |
| F-FAM2 | `我的心`／`你的星`／`走過去`／`走回來` | AABC | ABCD | 心ㄧㄣ／星ㄧㄥ 同家族 13；去ㄩ；來ㄞ |
| F-PART（含空行與英文行） | `愛你到天亮啊！`／（空行）／`（Oh baby）`／`想你想到心慌了…`／`好想好想你，嗎` | 跳語助詞：**A-AB**；不跳：**A-BA** | 跳：**A-BC**；不跳：A-BA | 目標字：亮／—／慌／你（跳）；啊／—／了／嗎（不跳）；`(Oh baby)` 收在英文字母→`-` |
| F-POLY | `我們快樂`／`聽著音樂`／`我不快樂` | 無詞庫 **AAA**；詞庫含 `音樂`＝`ㄧㄣ ㄩㄝˋ` 時 **ABA**；再手動 `readings['聽著音樂']='ㄌㄜˋ'` → **AAA**；手動值 `ㄅㄚ`（不合法）→ ABA（被忽略） | — | 樂 `getCharAllReadings`＝`ㄌㄜˋ`(common)、`ㄧㄠˋ`、`ㄩㄝˋ`(common) |
| F-KONG | `這是一首詩`／`我只想要你知`／`日子一天天`／`寫給自己的字`／`慢慢地想思` | **AABAA**（空韻同群） | **ABCDE** | Pitfall 2 的鎖定測試 |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MAP-01 | `lhRhymeMatch` 與 `validateWordRhyme`、`filterWordsByRhymeSingle` 在 9,800 組字對（寬／嚴）零差異；golden 全部不變 | e2e + node | `npx playwright test tests/rhyme-parity.spec.mjs tests/golden.spec.mjs tests/core-node.spec.mjs` | ❌ Wave 0（parity 新增；golden／core-node 既有） |
| MAP-01 | 字卡不變式：`searchRhyme(c)` 結果韻母 ⊆ 家族 ∪ {ㄣ↔ㄥ} | e2e | 同上 | ❌ Wave 0 |
| MAP-02 | 句尾字依家族上色：每個 `.rmap-hl` 的 `data-f` ＝ `RHYME_TO_FAMILY[rhyme]`（空韻 16）；同家族同色、不同家族不同色 | e2e | `npx playwright test tests/rhyme-map-ui.spec.mjs -g "上色"` | ❌ Wave 0 |
| MAP-02 | 鏡像對齊：隱藏 textarea 文字與隱藏鏡像文字兩張截圖逐像素相同（捲動 0／中／底；注入 15px `::-webkit-scrollbar`；負向對照＝不補捲軸寬必須 DIFF） | e2e | `... -g "鏡像對齊"` | ❌ Wave 0 |
| MAP-02 | 晝夜主題：最差文字對比 ≥ 4.5（淺 26%＝7.46、深 20%＝4.68 的實算值）；`.rmap-backdrop` 與 `.section-textarea` 的 computed 字型／行高／padding／overflow-wrap 在 3 裝置×縮放 100／150 相等 | e2e | `... -g "對比\|樣式一致"` | ❌ Wave 0 |
| MAP-03 | 句中押韻預設關；開啟後只在非句尾字畫 `.rmap-in`，每行 ≤ 3 | node + e2e | `... -g "句中"` | ❌ Wave 0 |
| MAP-04 | F-AABB／F-ABAB／F-FAM*／F-PART／F-KONG 字母與統計文字全部符合上表 | node | `npx playwright test tests/rhyme-core.spec.mjs -g "字母"` | ❌ Wave 0 |
| MAP-04 | 標題列字母預設隱藏；開啟後顯示、> 12 行縮成前 12＋「…」；點開選單逐行可查 | e2e | `... -g "標題字母"` | ❌ Wave 0 |
| MAP-05 | 選取文字→浮動列出現（組字中不出現）；「查韻」把選取最後一字填進 `#searchInput` 並出現字卡；手機自動切查韻頁；Esc／捲動／點別處收起 | e2e（桌機＋手機 CDP 觸控） | `... -g "浮動列"` | ❌ Wave 0 |
| MAP-05 | 「AI 建議」在 `/ai` stub 下先查韻、再出現 `.ai-word-card`；`lastLyricsSelection` 被清 | e2e | `... -g "AI 建議"` | ❌ Wave 0 |
| MAP-06 | 嚴格／寬韻 toggle 立即反映（字母、`.solo`、顏色不變）；設定寫入 `lh:map` | e2e | `... -g "開關"` | ❌ Wave 0 |
| MAP-07 | 忽略語助詞開關即時改變目標字；整行都是語助詞用最後一字 | node + e2e | `rhyme-core` `-g "語助詞"` | ❌ Wave 0 |
| MAP-08 | 手動讀音後上色跟著變、重整仍在、行尾字改了自動失效；備份匯出→匯入 `readings` 與 `lh:map` 不丟；惡意 readings（`__proto__`、超長、非注音）被丟 | e2e + node | `npx playwright test tests/rhyme-map-ui.spec.mjs tests/songs-backup.spec.mjs -g "讀音\|備份"` | ❌ Wave 0 |
| MAP-12 | 組字中分析次數＝0、鏡像層子樹突變＝0；確認後 ≥ 200ms 內只重算被改的那一段（以 `window.__rmapStats` 計數或快取命中數驗證）；快取命中時不重畫 | e2e | `... -g "組字\|快取"` | ❌ Wave 0 |
| MAP-12 | 120 行歌詞連續打字，4×／6× 降速下 `PerformanceObserver('longtask')` 無 > 50ms 項目（計時測試 `LH_PERF=1`）；永遠跑的結構性斷言：`lhMapAnalyze` 200 行 < 20ms | perf | `LH_PERF=1 npx playwright test tests/rhyme-map-perf.spec.mjs --workers=1` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx playwright test tests/rhyme-core.spec.mjs tests/core-node.spec.mjs tests/split-tags.spec.mjs tests/scan.spec.mjs`（Node＋靜態，< 20s）
- **Per wave merge:** 加跑 `tests/rhyme-parity.spec.mjs tests/rhyme-map-ui.spec.mjs tests/golden.spec.mjs tests/songs-ime.spec.mjs tests/sections-ui.spec.mjs tests/sections-audit.spec.mjs`
- **Phase gate:** `npm test` 全綠、`LH_PERF=1` 計時測試綠，才進 `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/rhyme-core.spec.mjs` — 原語、`lhMapTarget`（含空行、全形標點、emoji、英文收尾、整行語助詞）、`lhMapReading` 三段優先序、字母表（>26 種韻）、`lhMapNormalizeSettings`／`lhMapCleanReadings` 形狀清洗。載入方式：`loadCore()`＋手動補 `polyphonicsOrderMap`（`loadCore` 不載 polyphonic-order；原型用 `ev("polyphonicsOrderMap = new Map(Object.entries(...))")`）；`ctx.performance = performance`（vm 內預設沒有 `performance`）。
- [ ] `tests/rhyme-parity.spec.mjs` — 在頁面內取 70 個查詢字（含破音字）×70 個單讀音有家族的字，寬／嚴各比一次（本研究以相同方法跑 9,800 組零差異）。
- [ ] `tests/rhyme-map-ui.spec.mjs`、`tests/rhyme-map-perf.spec.mjs`
- [ ] 既有檔案修改：`tests/node-core.mjs`（CORE 加 `js/rhyme-core.js`）、`tests/scan.spec.mjs:69-70`（21→22，並在「掃描器自我檢查」之外確認 `lh:map` 已登記）、`tests/split-tags.spec.mjs`（`JS_ORDER` 加 `'rhyme-core'`（`polyphonic` 之後）與 `'rhyme-map'`（`word-drag` 之後）、註解與訊息的「26」→28）、`tests/songs-ime.spec.mjs:83`、`tests/sections-ui.spec.mjs:266`（過濾 `.rmap-backdrop`）、`tests/sections-audit.spec.mjs:383` 的 `FILES` 加兩個新檔
- [ ] 視覺：`npm run visual:update` 重拍 -darwin 的 `desktop/tablet/phone-lyrics`（及任何含 `.lyrics-tools` 的截圖，例如 `phone-150-zhuang`）；`.rmap-backdrop` 在無歌詞時為空，不應造成其他差異
- [ ] 觸控稽核：`tests/layout.spec.mjs` 的「歌詞開著」`mustSee` 可加 `button#rmapMenuBtn`；新的選單列、浮動列按鈕都要 ≥ 44×44（`auditTouchTargets` 會掃到）

### Manual-only（Human check，附理由）
- 句尾色塊在實機（iPad／iPhone Safari、Android Chrome）的可讀性與美觀、17 色辨識度與色盲友善度（A7）。
- 實機注音組字不受影響；Safari 慣性捲動時鏡像層不抖（A3）；iOS 原生選單不擋浮動列（A1）；手機長按選字後浮動列出現（A2）；鏡像對齊在 Safari／Firefox（A4）。
- UAT 待 Andy 確認的自主決定：Open Questions 1、2、6，以及 CONTEXT 列的七項。


## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s

**Approval:** pending
