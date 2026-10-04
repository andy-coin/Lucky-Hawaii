# Phase 4: AI Fill & Validate AI 挑詞填滿與造詞驗證 - Context

**Gathered:** 2026-10-04
**Status:** Ready for planning
**Mode:** Smart discuss（自主）— Andy 指示自主決定，以下為 Claude 依推薦方案決定

<domain>
## Phase Boundary

按下 AI 建議時：
- 候選詞 ≥ 目標數 → 結果一定剛好填滿目標數，完全不觸發造詞；AI 只負責排序挑選，數量由程式保證（AI 回太少由程式補滿）
- 候選詞 < 目標數 → 才造詞，且只造一輪；每個造出的詞以「自身讀音」通過既有韻腳判定，不合格丟棄
- 詞庫還沒載完就按 AI 建議 → 等詞庫備妥再挑詞，不誤觸造詞；詞庫版本更新後自動抓新 chunk，不混用新舊 chunk

不在本 phase：詞庫內容本身（Phase 6）、AI 服務／Worker（Phase 2 已完成）、版面（Phase 5）。

</domain>

<decisions>
## Implementation Decisions

### 填滿規則（AI-03）
- 目標數 = 現有 UI 的建議數量設定（沿用既有變數，不新增設定）
- 流程：程式先算出合格候選池 → 交 AI 排序挑選 → 取 AI 回傳且「確實在候選池內」的詞（AI 亂編不在池內的詞丟掉）→ 不足目標數時由程式依既有常用度／優先序從剩餘候選補滿
- 候選數 ≥ 目標數時「造詞」分支完全不可達（程式結構保證，不只是機率）
- AI 呼叫失敗時：候選數 ≥ 目標數 → 仍由程式直接依優先序給滿（附提示「AI 暫時無法排序，先依常用度列出」）；候選不足 → 顯示既有白話錯誤

### 造詞與驗證（AI-04）
- 只有候選數 < 目標數才造詞，且整個按鈕動作最多一輪造詞（移除現有第二輪／_aiExtraRoundDone 類邏輯）
- 每個造出的詞用該詞每個字的讀音（charInfo）跑既有韻腳判定；破音字任一讀音組合通過即算押韻；字典查不到的字 → 丟棄
- 修正 Phase 1 發現的 validateWordRhyme 錯誤：單字押韻比對用「韻母家族」（getZhuyinRhyme 後再查 RHYME_TO_FAMILY），不要拿整個音節去查（開心、傷心 對「心」應該通過）——此修正必須在獨立 fix commit，並以 golden／測試鎖定
- 造詞結果標示既有的 AI 造詞徽章（沿用現有 class），不合格數量只記 log 不打擾使用者
- 造詞後總數仍不足目標數 → 顯示實際數量，不再追加

### 詞庫載入競態與快取（PERF-03）
- AI 建議在詞庫未就緒時：顯示「詞庫載入中…」並 await 既有就緒 Promise（Phase 1 的 __hoyunWordlistReady 或同等），就緒後才算候選；不得以「暫時候選太少」觸發造詞
- 詞庫版本（wordlist-meta 版本號）變更：先清除 IndexedDB 舊 chunk，全部新 chunk 寫入成功後才寫入版本記號（寫入版本記號 await 完成）；中途失敗下次重抓，不混用
- chunk 抓取回非 200 → 留 [好韻器] 記錄（Phase 1 遺留項）

### 測試
- 填滿／造詞驗證邏輯做成純函式，在 Node 測（沿用 Phase 3 tests/core-node.spec.mjs 的 vm 載入模式）
- 競態：headless 瀏覽器模擬慢速詞庫載入 + mock AI，驗證不觸發造詞、最終數量正確
- 版本更新：fixture 模擬舊版 chunk 在 IndexedDB、meta 版本升級，驗證全部換新

### Claude's Discretion
- 函式切分與命名、優先序的確切排序鍵（沿用既有 p 值／tier）
- 「詞庫載入中」提示的呈現（沿用既有 loading 區塊）

</decisions>

<code_context>
## Existing Code Insights

- 拆檔後（Phase 3）：`js/candidates.js`（候選與 validateWordRhyme ≈240）、`js/ai-generate.js`（AI 生成補足詞、第二輪邏輯）、`js/ai-client.js`（callLLM→/ai、aiError、AUTO_MODEL）、`js/wordlist.js`（loadWordlist、IndexedDB 快取、chunk 版本）、`js/ai-word-events.js`、`js/state.js`
- Phase 1：lhWarn、IndexedDB 開啟入口 lhIdbOpen（v2，store wl）、__hoyunWordlistReady 就緒訊號
- Phase 2：Worker /ai 換手鏈；前端 aiError 白話訊息
- 測試：tests/core-node.spec.mjs（vm 載入 js/*.js）、tests/helpers.mjs（bootPage 可 mock /ai 回覆、wordlist stub）、tests/ai-client.spec.mjs
- 已知：Phase 1 發現 validateWordRhyme 拿 RHYME_TO_FAMILY[info.zhuyin]（整個音節）比對 → 有聲母的字尾被誤判

</code_context>

<specifics>
## Specific Ideas

- Andy 原話痛點：候選遠超過目標數 AI 卻只挑很少、接著觸發造詞；造詞只擠出兩三個還觸發第二輪；造出的詞不押韻
- Human check（ROADMAP）：Andy 用幾個實際韻腳試 AI 建議，確認數量與押韻品質符合手感 → 列入最後 UAT 清單

</specifics>

<deferred>
## Deferred Ideas

- 詞庫品質（簡體、冷僻詞）→ Phase 6
- 候選詞拖曳插入歌詞 → Phase 9（AI-06）

</deferred>
