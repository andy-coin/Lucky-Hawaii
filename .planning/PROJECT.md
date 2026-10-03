# 好韻器 Lucky Hawaii

## What This Is

好韻器是一個純前端的中文歌詞押韻工具（目前 v0.96 beta，GitHub Pages 部署），以常用「字」為索引查同韻字，並搭配詞庫與 AI 建議詞彙、段落式歌詞編輯器，幫華語作詞人想出押韻好詞。使用對象是作詞人／音樂創作者（包含開發者 Andy 本人），要在電腦、平板、手機上都好用。

## Core Value

輸入一個字或音，就能快速拿到「符合台灣日常語感、真的能寫進歌詞」的押韻字詞——查得到、查得快、查得準，其他功能都建立在這之上。

## Requirements

### Validated

<!-- 現有程式碼已具備、使用者已在用的功能（v0.96 beta） -->

- ✓ 注音／拼音／漢字輸入，自動索引同韻字（含借韻 BORROW_MAP 規則）— existing
- ✓ 三種篩選模式：常用字／同聲韻／同聲調；注音／拼音顯示切換 — existing
- ✓ 字卡頻率（常用度 tier）可手動調整，使用者覆寫存在 localStorage — existing
- ✓ 詞庫分塊（10 chunks）延遲載入＋ IndexedDB 快取 — existing
- ✓ AI 建議詞彙：先硬性索引符合韻腳的候選詞，再交 AI 挑選；候選不足才允許造詞；支援雙押／多押／子音／母音模式；多模型 fallback（Gemini / OpenAI / Meta / Deepseek…）透過 Cloudflare Worker 代理 — existing
- ✓ 多段落歌詞編輯器＋情境標籤，AI 會參考歌詞與標籤 — existing
- ✓ 晝夜模式、客製顏色、儲存／讀取 — existing
- ✓ 使用者回報 → Cloudflare Worker + KV → 後台 admin 頁面審核 — existing
- ✓ PWA manifest，可加到手機主畫面 — existing

### Active

<!-- 本輪範圍：「先穩定再說」，不綁 v1.0 版本號 -->

**1. 效能與 BUG**
- [ ] 修正 UI 縮放 bug：預設 100% 實際經過 offset，使用者只想放大一點就會讓靠近邊框的內容被吃掉
- [ ] AI 建議穩定性：常失敗／沒回應、免費額度或 API 變動導致模型失效，fallback 鏈需可靠且有明確錯誤提示
- [ ] AI 挑詞邏輯修正：候選詞遠超過目標數量時 AI 卻只挑很少，接著觸發造詞；造詞也只擠出兩三個、還觸發第二輪依舊不足 → 必須確保候選充足時優先填滿目標數量
- [ ] AI 造詞品質：造出的詞不可用且不押韻 → 造詞結果必須通過韻腳驗證，不合格的丟棄
- [ ] 首次搜尋卡頓、大量字卡一次渲染造成行動裝置卡住（codebase map 已指出）
- [ ] 存檔相關靜默失敗（localStorage 爆量、IndexedDB 失敗無提示）

**2. 新詞庫**
- [ ] 尋找並引用適合的台灣用語詞庫，減少中國用語、簡體字、文言冷僻詞
- [ ] 增加三字以上、貼近日常與創作語境的詞彙
- [ ] 清洗策略不得依賴人工審 10 萬條，也要避免大量燒 AI token（具體做法交給研究階段決定）

**3. UI / UX 與多裝置**
- [ ] 整體使用體驗提升，電腦、平板、手機三種裝置都要好用（行動端可完整創作：查韻、寫詞、AI 建議）
- [ ] 介面美觀、一致，保留客製化彈性

**4. 回報／建議機制與後台**
- [ ] 使用者回報要更簡單（入口明顯、步驟少）
- [ ] 後台批改更省工（審核、套用操作便利）
- [ ] 混合上線流程：少量修正可在後台一鍵套用，暫存為 Worker 上的「修正層」即時生效；累積到一定量時，由腳本把修正層寫回 `data/`、push，並清空 Worker 修正層

**5. 歌詞編輯器／段落／韻腳地圖**
- [ ] 段落為可拖曳模組（大小、位置、順序），並修正現有拖曳相關 bug
- [ ] Undo / Redo
- [ ] 多首歌管理：改為類似 Google Docs 側邊分頁，可顯示／隱藏；可匯出
- [ ] 段落標籤更有用（並讓 AI 更懂語境）
- [ ] 段落字數統計
- [ ] 逐行句構分析：每行字數、斷句結構（如 3+4、2+2+3）、與對應段落比對（如主歌1 vs 主歌2）；可在設定頁 toggle，也可反白後按「分析」或反白後 hover 數秒觸發
- [ ] 韻腳地圖：句尾依韻部自動上色、句中多押／內部押韻偵測、段落韻腳統計、點字即查韻
- [ ] 韻腳地圖／句構分析設定頁：使用者可 toggle 各功能與顯示方式（標記位置、標記文字大小、顏色），避免標記過多眼花撩亂

### Out of Scope

- 自架後端伺服器 — 維持純前端 GitHub Pages ＋ Cloudflare Worker
- 付費 AI／付費主機 — 個人獨立專案，維持免費額度
- 人工逐條審核整個詞庫 — 10 萬條以個人專案不切實際
- v1.0 正式發布／公開宣傳 — 本輪目標是「先穩定再說」，版本號另議
- 即時多人協作編輯 — 單人創作工具，無此需求

## Context

- **現況**：單一 `index.html`（約 28 萬字元、6000+ 行 inline JS + CSS），無建置步驟、全域狀態、無測試。詳見 `.planning/codebase/`。
- **詞庫來源**：字庫為小麥注音（McBopomofo）；詞庫為唯音輸入法（vChewing VanguardLexicon，原威注音）＋新酷音 libchewing tsi.csv。唯音詞庫帶入大量簡體字、中國用語與文言古語，三字以上日常詞少，是本輪詞庫改善的根源。
- **資料管線**：`scripts/build_wordlist.py`、`scripts/merge_corelib.py` 產生 `data/` 下的 JSON（詞庫 ~13MB 分 10 塊）。
- **AI 流程**：僅服務多字押韻（雙押／多押／子音／母音）。先硬性索引出候選，再給 AI 挑；不足才造詞。Worker 綁定 Gemini、Groq、GitHub Models 等免費 API key。
- **回報後台**：`admin/woker.js`（Cloudflare Worker + KV）、`admin/index.html`。管理 key 以 URL 參數傳遞，安全性弱。
- **已知問題**：codebase map 的 CONCERNS.md 列出 race condition（詞庫載入 vs AI）、第二輪 fallback 被靜默忽略、無分頁渲染、無錯誤邊界等。
- **開發者**：Andy，音樂工作者、非程式背景；溝通以繁體中文、白話設計思路為主。

## Constraints

- **Hosting**: 維持純前端 GitHub Pages ＋ Cloudflare Worker — 免維運、免費
- **Budget**: AI 與主機全部使用免費額度 — 個人獨立專案
- **Data safety**: 更新不得弄丟使用者已存的歌詞、覆寫、設定（localStorage / IndexedDB 需向下相容或遷移）
- **Code structure**: 允許把 `index.html` 拆成多個 JS / CSS 檔（仍需無建置或極簡建置可直接部署到 GitHub Pages）
- **Devices**: 電腦、平板、手機都必須好用
- **Language**: 介面與詞庫以台灣繁體中文為主，嚴禁簡體

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 本輪定位為「先穩定再說」，不綁 v1.0 | 五大方向都要改，先穩定再談發布 | — Pending |
| 允許拆分 `index.html` | 單檔過大難維護，是修 bug 與加功能的前提 | — Pending |
| 詞庫清洗策略交給研究階段決定 | 需要先調查台灣開源詞庫與授權，不靠人工、不大量燒 token | — Pending |
| 回報修正採「Worker 修正層＋定期腳本寫回 data」混合流程 | 少量修正即時生效，大量累積後固化進資料檔並清空修正層 | — Pending |
| 韻腳地圖與句構分析全部可在設定頁 toggle | 預期標記過多會眼花撩亂，需使用者自訂 | — Pending |
| 多首歌管理採 Google Docs 式側邊分頁 | 可顯示／隱藏，不佔編輯空間 | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-10-03 after initialization*
