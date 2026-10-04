# Phase 4: AI Fill & Validate AI 挑詞填滿與造詞驗證 - Research

**Researched:** 2026-10-04
**Domain:** 純前端 vanilla JS（classic script、全域函式）— AI 挑詞流程重構、押韻判定修正、IndexedDB 詞庫快取
**Confidence:** HIGH（全部是本 repo 內的程式與資料，已逐檔讀過並用 node:vm 實測；唯二 MEDIUM 見 Assumptions Log）

> 本 phase 沒有新套件、沒有外部服務，所以沒有跑 research-plan／Context7 流程；所有結論來自讀碼與在 Node 直接執行 repo 程式（探針腳本結果直接引在文中）。基準線：`npm test` = 248 passed（1.0 分鐘，本 session 實跑）。

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**填滿規則（AI-03）**
- 目標數 = 現有 UI 的建議數量設定（沿用既有變數，不新增設定）
- 流程：程式先算出合格候選池 → 交 AI 排序挑選 → 取 AI 回傳且「確實在候選池內」的詞（AI 亂編不在池內的詞丟掉）→ 不足目標數時由程式依既有常用度／優先序從剩餘候選補滿
- 候選數 ≥ 目標數時「造詞」分支完全不可達（程式結構保證，不只是機率）
- AI 呼叫失敗時：候選數 ≥ 目標數 → 仍由程式直接依優先序給滿（附提示「AI 暫時無法排序，先依常用度列出」）；候選不足 → 顯示既有白話錯誤

**造詞與驗證（AI-04）**
- 只有候選數 < 目標數才造詞，且整個按鈕動作最多一輪造詞（移除現有第二輪／_aiExtraRoundDone 類邏輯）
- 每個造出的詞用該詞每個字的讀音（charInfo）跑既有韻腳判定；破音字任一讀音組合通過即算押韻；字典查不到的字 → 丟棄
- 修正 Phase 1 發現的 validateWordRhyme 錯誤：單字押韻比對用「韻母家族」（getZhuyinRhyme 後再查 RHYME_TO_FAMILY），不要拿整個音節去查（開心、傷心 對「心」應該通過）——此修正必須在獨立 fix commit，並以 golden／測試鎖定
- 造詞結果標示既有的 AI 造詞徽章（沿用現有 class），不合格數量只記 log 不打擾使用者
- 造詞後總數仍不足目標數 → 顯示實際數量，不再追加

**詞庫載入競態與快取（PERF-03）**
- AI 建議在詞庫未就緒時：顯示「詞庫載入中…」並 await 既有就緒 Promise（Phase 1 的 __hoyunWordlistReady 或同等），就緒後才算候選；不得以「暫時候選太少」觸發造詞
- 詞庫版本（wordlist-meta 版本號）變更：先清除 IndexedDB 舊 chunk，全部新 chunk 寫入成功後才寫入版本記號（寫入版本記號 await 完成）；中途失敗下次重抓，不混用
- chunk 抓取回非 200 → 留 [好韻器] 記錄（Phase 1 遺留項）

**測試**
- 填滿／造詞驗證邏輯做成純函式，在 Node 測（沿用 Phase 3 tests/core-node.spec.mjs 的 vm 載入模式）
- 競態：headless 瀏覽器模擬慢速詞庫載入 + mock AI，驗證不觸發造詞、最終數量正確
- 版本更新：fixture 模擬舊版 chunk 在 IndexedDB、meta 版本升級，驗證全部換新

### Claude's Discretion
- 函式切分與命名、優先序的確切排序鍵（沿用既有 p 值／tier）
- 「詞庫載入中」提示的呈現（沿用既有 loading 區塊）

### Deferred Ideas (OUT OF SCOPE)
- 詞庫品質（簡體、冷僻詞）→ Phase 6
- 候選詞拖曳插入歌詞 → Phase 9（AI-06）
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AI-03 | 候選詞數量 ≥ 目標數時，結果一定填滿目標數量（AI 只負責排序挑選，數量由程式保證），不得觸發造詞 | § 現況流程追蹤（短少點 S1–S5）；§ Pattern 1 `fillToTarget`（由構造證明 `words.length === target`）；§ Pattern 2 單一流程骨架使造詞分支結構上不可達 |
| AI-04 | 候選詞不足時才造詞，且只造一輪；每個造出的詞必須通過原有韻腳判定（以該詞自身讀音），不合格的丟棄 | § validateWordRhyme 修正規則（鏡射候選篩選、實測 98%+ 一致）；§ Pattern 3 `selectGenerated`；§ 移除 `_aiExtraRoundDone`（5 個檔、11 處） |
| PERF-03 | 詞庫快取版本正確更新，不會新舊 chunk 混用；詞庫載入與 AI 建議之間無競態 | § 詞庫載入重寫（單一交易原子換版、`?v=` 破 HTTP 快取、非 200 記錄、單一 Promise）；§ 慢速載入／版本更新測試設計 |
</phase_requirements>

## Summary

**現況比 CONTEXT 描述的更糟的三件事（規劃必看）：**
1. **沒有「建議數量設定」可沿用。** 目標數 24 是寫死的字面值，散在 `js/ai-generate.js` 12 處（123、133、157、165、189、197、205、213、231、241、243、249 行），UI 上沒有任何數量控制 [VERIFIED: `grep 'type="number"|type="range"|建議數' index.html` 只找到縮放滑桿 `zoomSlider`（index.html:50）]。計畫應新增單一常數 `AI_TARGET = 24`（放 `js/state.js`），不要新增 UI 設定——這與 CONTEXT「不新增設定」一致，只是「沿用既有變數」要改讀成「把既有字面值收成一個常數」。
2. **`validateWordRhyme` 比 Phase 1 發現的更壞，且「押字首」判定和候選篩選互相矛盾。** 在真詞庫上，舊驗證只放行真正候選詞的 **0%～20%**（例：搜「心」押字尾，4000 個真候選只過 573 個；搜「安」押字首 4000 個全部被拒）。修正後同樣樣本過 3986–3999 個（≥ 98.6%）[VERIFIED: 本 session 在 node:vm 實測，見 § validateWordRhyme]。
3. **候選池會無限成長，第 7 次左右按鈕就會撞 Worker 上限。** 每按一次，`newBatch`（≤ 1000 詞，約 3.7k 字）累加進 `cumulativeCandidates`，AI 一次只挑 ≤ 24 個；整池每次都塞進 prompt。實測「心」押字尾共 16821 個候選、1000 個約 3713 字 [VERIFIED: probe2 輸出]；Worker 的 `MAX_CHARS = 24000`、`MAX_BODY_BYTES = 65536`（中文 3 bytes）[VERIFIED: worker/src/ai.js:242、worker/src/index.js:40]，約第 6–7 次按下就會 413「內容太長」，使用者看到 AI 失敗。新流程必須限制送給 AI 的池大小。

**Primary recommendation:** 把 `generateAISuggestions` 的三份重複分支（選字／押母音／押子音）收成「取得候選 → `pool.length >= AI_TARGET` 走挑選 + `fillToTarget`，否則走『全列出 + 一次造詞』」的單一流程；純函式（`parseAiWords`、`fillToTarget`、`selectGenerated`）放進已在 Node CORE 清單裡的 `js/candidates.js`（不新增 js 檔，免動 `split-tags` 的 JS_ORDER 與 index.html 標籤）；`validateWordRhyme` 改為逐條鏡射候選篩選規則（獨立 fix commit）；`loadWordlist` 改成「全部抓到記憶體 → 一個 IndexedDB 交易（刪舊分段＋寫新分段＋寫 ver）→ 才算完成」，並回傳同一個 Promise 供 AI 流程 await。

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 候選池計算（押韻篩選、排序、補滿） | Browser / Client（純函式，Node 可測） | — | 詞庫與字典都在瀏覽器記憶體；無後端 |
| AI 挑詞 / 造詞呼叫 | Browser（組 prompt、解析、驗證） | Worker（`/ai` 換手鏈，Phase 2 已完成） | 瀏覽器只送 `{prompt, model, temperature}`；數量保證與驗證一定在瀏覽器，不能信 AI |
| 造詞押韻驗證 | Browser（`validateWordRhyme`，讀 `charInfo`） | — | 唯一有字典與使用者當前韻腳狀態的地方 |
| 詞庫版本與快取 | Browser（IndexedDB `wl` store） | CDN／GitHub Pages（`max-age=600`） | 快取一致性要在客戶端用「版本進網址＋單一交易」解決，伺服端無法加標頭 |
| 請求大小上限 | Worker（Phase 2 已有 24,000 字／64 KB） | Browser（限制池大小才不會撞上限） | 客戶端不縮池，Worker 只會回 413 |

## Standard Stack

沒有新增依賴。沿用：

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| Vanilla JS（classic script） | — | 全部邏輯 | 專案限制：無建置、無模組系統 [VERIFIED: .claude/CLAUDE.md 與 index.html:331-350 的 20 個 `<script src>`] |
| `@playwright/test` | 1.63.0 | 全部測試（含 Node-only spec，用 `node:vm`） | 既有；`npx playwright --version` → `Version 1.63.0` [VERIFIED: 本 session] |
| `node:vm` | Node v26.8.1 | Node 純函式測試 | `tests/core-node.spec.mjs` 既有模式 [VERIFIED: 本 session `node --version`] |

**Installation:** 無。
**Version verification:** 不適用（無新套件）。

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| 新增 `js/ai-pick.js` 放純函式 | 放進既有 `js/candidates.js` | 新檔要改 `index.html` 標籤、`tests/split-tags.spec.mjs` 的 `JS_ORDER`（寫死 20 檔）、`CORE` 清單；`candidates.js` 已在 CORE 且已含 `validateWordRhyme`。**選後者。** |
| `chunk URL ?v=<ver>` 破快取 | `fetch(..., { cache: 'reload' })` | `reload` 每次載入都重抓 13 MB；`?v=` 只在版本變時才是新網址，平時仍吃 HTTP 快取。**選 `?v=`。** |
| 逐筆 `_idbPut` ＋ 最後寫 ver（CONTEXT 字面順序） | 單一 IndexedDB 交易 | 單一交易由瀏覽器保證全有或全無，天然滿足「全部 chunk 成功才有 ver」；字面順序在中途失敗時仍可能留下新舊混合的 chunk。**選單一交易**（滿足 CONTEXT 意圖，見 Pitfall 4）。 |

## Package Legitimacy Audit

本 phase 不安裝任何外部套件。

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| （無新增） | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none（既有的 `@playwright/test` 1.63.0 `[SUS too-new]` 已在 Phase 1 由 orchestrator 放行，見 STATE.md）

## Architecture Patterns

### 現況流程追蹤（Q1）

#### 進入點（誰會呼叫 AI）

| 呼叫點 | 位置 | 與本 phase 關係 |
|--------|------|------------------|
| 按鈕 `#generateBtn` → `generateAISuggestions()` | index.html:298 `onclick="generateAISuggestions()"`；定義 js/ai-generate.js:71-296 | **主要改造對象** |
| `generateAIWords(remaining, container, excludeSet)`（造詞） | js/ai-generate.js:2-69；被 123、157、189、213 行呼叫 | **改造**（驗證、提示詞、只一輪） |
| 第二輪挑選 `callLLM(m, round2Prompt)` | js/ai-generate.js:262（在 241-279 的 if 區塊） | **刪除** |
| `generateContextFromLyrics()`（歌詞→情境標籤） | js/ai-generate.js:306-364，`callLLM` 在 330 | 與挑詞無關，**不碰** |

`callLLM` 在 js 裡共 4 個呼叫點（41、228、262、330）[VERIFIED: grep]；Phase 2 摘要說的「三個入口」是 `generateAIWords` / `generateAISuggestions` / `generateContextFromLyrics` 的失敗顯示。候選來源則有三條分支（選字／押母音／押子音）× 單字／多字。

#### 資料流（按鈕 → 渲染）

```
#generateBtn click
  └─ generateAISuggestions()                         js/ai-generate.js:71
       ├─ currentRhymes 空 → toast，return           :72
       ├─ btn.disabled / loading 顯示 / container 清空   :97-99
       ├─ activePool = cumulativeCandidates 去掉 suggestedPool/savedWords   :105-106
       ├─ 三選一產生 newBatch：
       │    selectedChars>0 → getWordlistCandidatesSelected()   :108-109 → candidates.js:204-219（無 1000 上限）
       │    rhymeMode==='rhyme'   → 單字 getWordlistCandidatesSingle() candidates.js:134-158（上限 1000，:154）
       │                             多字 getWordlistCandidates()      wordlist.js:184-203（上限 1000，:199）
       │    else(子音)            → 單字 getWordlistCandidatesSingle() / 多字 getWordlistCandidatesInitial() wordlist.js:235-253
       │      （候選內部先 Math.random 洗牌 candidates.js:86-89 等，再 slice 1000）
       ├─ newBatch === null（wordlistData 為 null）→ toast「詞庫載入中，請稍後再試／載入失敗」，return   :110-113、145-147、177-179
       ├─ newBatch 全部進 sentCandidatesSet；cumulativeCandidates = [...activePool, ...newBatch]   :114-115 等
       ├─ cumulativeCandidates.length === 0：
       │     _aiExtraRoundDone 已為 true → 顯示「已推薦所有符合的詞彙」＋重置鈕，return     :117-120、151-154、183-186
       │     否則設旗標，generateAIWords(24, …)，return     :121-124、155-158、187-190
       ├─ 組 prompt（要求「必須挑滿 24 個」）            :133、165、197
       ├─ 0 < cumulativeCandidates.length < 24：
       │     全列出（無 AI 徽章）＋「共 N 個候選詞，已全數列出」，generateAIWords(24 - N, …)，return   :204-215
       ├─ for m of aiTryList()  （實際只有一個模型，ai-client.js:43-45）：
       │     text = callLLM(m, prompt)                   :228
       │     words = 切詞 → 長度 2..8 且 ∈ candidateSet → slice(0,24)   :229-231
       │     words.length === 0 → throw Error('empty')（被當成模型失敗）  :232
       │     渲染 words + 「從 N 個候選詞中，挑出 M 個」              :233-239
       │     words.length < 24 且非「同字」模式 → 第二輪 callLLM 補挑（失敗被吞掉 :277）  :241-279
       └─ 失敗 → 顯示 aiError 白話或 AI_FALLBACK_MSG（textContent）    :286-292；finally 式解鎖 :293-295
```

#### 數量會短少的每個位置

| # | 位置 | 現況行為 | 新設計 |
|---|------|----------|--------|
| S1 | ai-generate.js:229-231 | AI 回得比 24 少、或回了池外的詞 → 直接 `slice(0,24)`，沒有補滿 | `fillToTarget` 由程式補滿 |
| S2 | :241-279 | 只靠「第二輪再問 AI 一次」補，同樣沒保證；同字模式（:242）完全不補；第二輪失敗靜默（:277，CONCERNS.md 已列） | 整段刪除；程式補滿 |
| S3 | :232 | AI 回的全是池外的詞 → `throw 'empty'` → 顯示「AI 暫時無法使用」，**即使池裡有上千個候選** | 視為「AI 沒挑到」，仍由程式補滿 |
| S4 | :205-215 + 造詞 | 候選 < 24 才造詞，但造詞用有 bug 的驗證，幾乎全被丟 | 驗證修正（§ validateWordRhyme） |
| S5 | :116-124 等 | 池耗盡 → 造 24 個；有旗標才不無限造 | 池 0 個 → 造一輪；造出 0 個 → 顯示「已推薦所有…」＋重置鈕（保留 `resetSuggestedPool`） |

**造詞觸發點（Q1 要求）：** 只有兩種：`cumulativeCandidates.length === 0`（:116、150、182，三份複製）與 `0 < length < 24`（:205）。候選 ≥ 24 時現況其實不會造詞——Andy 感受到的「候選遠超過目標卻只挑很少、接著造詞」來自「AI 挑少 → 第二輪 → 池被一路消耗到 0 → 造詞」的連鎖（以上為讀碼推論，非重現）。

**旗標 `_aiExtraRoundDone` 出現處（全部要刪）：** `js/state.js:26`（宣告）、`js/candidates.js:21`、`:40`（`toggleFilter`／`cycleFilterWordLen` 的重置）、`js/panels.js:5`（`resetSuggestedPool`）、`js/search.js:119`（新搜尋重置）、`js/ai-generate.js:117、121、151、155、183、187` [VERIFIED: grep]。新設計無旗標：池 0 個時每按一次最多造一輪（符合「整個按鈕動作最多一輪」），造出 0 個新詞時顯示耗盡訊息。

**目標數與排序（Q2 前半）：** 目標 = 字面值 24（見 Summary）。候選順序：每個 `filterWords*` 以 `Math.random` 洗牌（candidates.js:86-89、127-130、197-200；wordlist.js:176-179、228-231）→ 取前 1000。詞的「常用度」= `wordPriorityMap.get(w)`（`js/state.js:13`；`loadWordlist` 在 wordlist.js:85 填入 `e.p`，`p` 是詞頻計數，例：`創新` 75099、`一心` 12759 [VERIFIED: tests/fixtures/wordlist-stub.ndjson]）。**沒有詞級 tier**——tier（common/normal/rare）只存在於字（`charInfo[char][i].tier`）。原本用 `entry.p < minPriority` 的過濾因「p 不準確（很多 p=0 並非冷僻）」被註解掉（candidates.js:62、105 等），但「p 當補滿的排序鍵」是較溫和的用法。真詞庫 233,713 筆中 p==0 有 85,958 筆；「心」押字尾的 16,821 個候選中 5,585 個 p==0 [VERIFIED: probe2]。**補滿排序鍵：`wordPriorityMap.get(w) ?? 0` 由大到小，同分保持原池順序**（`Array.prototype.sort` 為穩定排序）。已知偏向：p 最高的前幾名是新聞語料詞（`中心、進行、已經…`），所以補滿只用於 AI 挑不夠的差額，不取代 AI 挑選。

#### AI「挑詞」回傳格式
`callLLM` 回純文字（ai-client.js:89，已去 `<think>`）；程式以 `/[，,、\n\s]+/` 切詞、`trim`、留長度 2..8（ai-generate.js:229-231、42）。沒有 JSON；AI 可能夾編號、說明、重複、池外詞。解析要容忍，驗證靠「是否在池內」。

### System Architecture Diagram

```
[#generateBtn] ─▶ generateAISuggestions()
                    │ (snapshot: currentRhymes / rhymeMode；上鎖按鈕)
                    ▼
        wordlistData === null ? ──是──▶ #aiLoading「詞庫載入中…」─▶ await loadWordlist()（同一個 Promise）
                    │否                                                │失敗(仍 null) → toast「詞庫載入失敗…」→ 解鎖 return
                    ▼◀──────────────────────────────────────────────────┘
        算候選：selectedChars / 押母音 / 押子音（單字／多字）→ newBatch
        pool = 去重([...newBatch, ...activePool])；全進 sentCandidatesSet
                    │
         pool.length >= AI_TARGET ?
        ┌───是───────────────────────────┐        ┌────否 (含 0)──────────────────────┐
        ▼                                │        ▼                                   │
 callLLM(挑詞 prompt，池取前 AI_POOL_MAX 個) │   pool 全部列出（無徽章；0 個就不列）        │
   成功 → parseAiWords                    │   remaining = AI_TARGET - pool.length       │
   失敗 → aiPicks=[]（記 lhWarn）          │   generateAIWords(remaining) ← 唯一一輪      │
        ▼                                │     callLLM(造詞 prompt) → parseAiWords      │
 fillToTarget(pool, aiPicks, AI_TARGET)  │     selectGenerated(validateWordRhyme)      │
   words.length === AI_TARGET（保證）     │     不合格只 lhWarn 計數                      │
        ▼                                │        ▼                                   │
 渲染 24 張卡 +「從 N 個候選詞中挑出 24 個」 │   渲染 AI 徽章卡；造出 0 且 pool 0 →「已推薦所有…」+重置鈕
 AI 失敗 → 加提示「AI 暫時無法排序，先依常用度列出」 │   AI 失敗 → 既有白話錯誤                      │
        └────────────────────────────────┴────────────────────────────────────────────┘
                    ▼
        finally：按鈕解鎖、#aiLoading 隱藏、文字還原「AI 思考中…」
```
造詞（右欄）只能從 `pool.length < AI_TARGET` 進入；左欄是 `>=`，結構上沒有往造詞的邊。

### Recommended Project Structure
```
js/
├── state.js        # 新增 AI_TARGET、AI_POOL_MAX 常數；刪 _aiExtraRoundDone
├── candidates.js   # 修 validateWordRhyme；新增純函式 parseAiWords / fillToTarget / selectGenerated
├── wordlist.js     # 重寫 loadWordlist（單一 Promise、原子換版）；_idbPut → _idbReplaceAll
├── ai-generate.js  # generateAISuggestions 收成單一流程；generateAIWords 只一輪
├── panels.js / search.js   # 只刪旗標一行
tests/
├── node-core.mjs   # （新）把 core-node.spec 的 loadCore 抽成共用 helper，匯出給多個 spec
├── core-node.spec.mjs      # 改 import node-core.mjs（行為不變）
├── ai-fill.spec.mjs        # （新）Node 純函式測試＋validateWordRhyme 規則測試
├── wordlist-cache.spec.mjs # （新）慢速載入、版本更新、非 200（瀏覽器）
└── helpers.mjs     # bootPage 新增 waitWordlist 選項；stubWordlist 正規表示式允許 ?v=；新增版本化 stub
```

### Pattern 1：`fillToTarget`（AI-03 的核心，純函式）
**What:** AI 只提供「偏好順序」，數量由程式保證。**When:** 每次 `pool.length >= AI_TARGET` 的挑詞結果（含 AI 失敗時 `aiPicks = []`）。
```js
// 純函式：不碰 DOM、不讀全域（rank 由呼叫端傳入），Node 直接測
// 保證：pool.length >= target ⇒ words.length === target；words 無重複、全部 ∈ pool
function fillToTarget(pool, aiPicks, target, rank = () => 0) {
    const all = [...new Set(pool)];
    const inPool = new Set(all);
    const picked = [...new Set(aiPicks)].filter(w => inPool.has(w)).slice(0, target);   // AI 亂編的池外詞在這裡被丟掉
    const pickedSet = new Set(picked);
    const filled = all.filter(w => !pickedSet.has(w)).sort((a, b) => rank(b) - rank(a)).slice(0, target - picked.length);   // sort 為穩定排序：同分維持池順序
    return { words: [...picked, ...filled], picked: picked.length, filled: filled.length };
}
// 呼叫：fillToTarget(pool, parseAiWords(text), AI_TARGET, w => wordPriorityMap.get(w) ?? 0)
```
**證明（供計畫引用）：** `picked.length ≤ target`；`rest = all.length − picked.length ≥ target − picked.length`（因 `all.length ≥ target`），故 `filled.length = target − picked.length`，總數恰為 `target`。

### Pattern 2：單一流程骨架（取代三份複製）
三個分支只有三樣不同：取候選的函式、prompt 的第一句、耗盡訊息。收成查表即可；全流程包 `try/finally` 保證解鎖（現況有 6 處手動解鎖，漏一處按鈕就卡死）。
```js
const AI_TARGET = 24;      // js/state.js — 取代 ai-generate.js 內 12 處字面值 24
const AI_POOL_MAX = 1000;  // js/state.js — 送進 prompt 的候選上限（= 現況單批上限，之後不再隨連按成長）

async function generateAISuggestions() {
    // …（組 context/lyrics 字串的部分不動）…
    btn.disabled = true; loading.style.display = 'block'; container.innerHTML = '';
    const snap = { r: currentRhymes, m: rhymeMode };            // 等待詞庫期間使用者可能改搜尋 → 結果要作廢
    const stale = () => currentRhymes !== snap.r || rhymeMode !== snap.m;
    try {
        if (wordlistData === null) {                              // PERF-03：等同一個 Promise，不看「暫時候選太少」
            loading.textContent = '詞庫載入中…';
            await loadWordlist();
            loading.textContent = 'AI 思考中…';
            if (stale()) return;
        }
        // 候選必須在 await 之後才算
        const newBatch = getBatch();                             // 三種來源之一；詞庫仍為 null → toast「詞庫載入失敗，請重新整理頁面」並 return
        newBatch.forEach(w => sentCandidatesSet.add(w));
        const pool = [...new Set([...newBatch, ...activePool])]; cumulativeCandidates = pool;
        if (pool.length >= AI_TARGET) { /* callLLM(挑詞 prompt，池取前 AI_POOL_MAX) → fillToTarget → 渲染 */ }
        else { /* 全列出 pool；await generateAIWords(AI_TARGET - pool.length, …) 一次 */ }
    } finally { btn.disabled = false; loading.style.display = 'none'; loading.textContent = 'AI 思考中…'; }
}
```
（骨架只示意結構，實際字串與 DOM 沿用現有；`getBatch` 對應 ai-generate.js:108-109 / 141-143 / 173-175。）

### Pattern 3：`parseAiWords` / `selectGenerated`（造詞，純函式）
```js
function parseAiWords(text) {
    return String(text).split(/[，,、\n\s]+/).map(w => w.trim()).filter(w => w.length >= 2 && w.length <= 8);
}
// isValid 由呼叫端傳入（一般模式 = validateWordRhyme；選字模式見 Open Question 2）
function selectGenerated(words, exclude, remaining, isValid) {
    const out = [];
    for (const w of words) {
        if (out.length >= remaining) break;
        if (exclude.has(w) || out.includes(w) || !isValid(w)) continue;
        out.push(w);
    }
    return out;
}
// 呼叫端：const kept = selectGenerated(parseAiWords(text), exclude, remaining, validateWordRhyme);
//         lhWarn(`AI 造詞：${raw.length - kept.length} 個不合格或重複已丟棄`);   // 只記 log，不打擾使用者
```
`generateAIWords` 其餘調整（皆為 Claude's Discretion 範圍）：
- 向 AI 要的數量由 `remaining + 4`（ai-generate.js:29）改為 `Math.min(remaining * 2, 40)`：驗證會丟詞，只造一輪就要多要一些。
- 排除集一律 `suggestedPool ∪ savedWords ∪ 已列出的候選`（現況 :213 的呼叫只傳 `shownSet`，造出的詞可能與已保留詞重複）。
- 造出的詞同時進 `sentCandidatesSet`，避免之後又從詞庫候選冒出來重複。
- **prompt 必須與判定一致：** 單字、非純聲母、「押字首」時，現況 prompt 說「首字聲母為「ㄒ」」（:19），但篩選與（修正後）驗證要的是「首字韻部相同」；改成 `首字押「${char}」的韻腳（韻部：${familyLabel}）`。同時依 `filterWordLen` 設 `lenDesc`（現為固定「2～4字」，:11）。

### 渲染不要改成 DOM API（有連動測試）
卡片現用字串樣板 `<div class="ai-word-card" data-word="${w}" onclick="saveWord('…')">`。`tests/smoke.spec.mjs:228-250` 的「原始碼裡的每個 handler 都有被觸發」以 regex 掃 js 原始碼裡的 `onclick="…"` 簽章；改成 `el.onclick = …` 會讓該簽章從原始碼消失、造成覆蓋測試誤報。**做法：** 三處重複的樣板收成一個 helper（`aiWordCardHtml(w, isAI)`），輸出字串與現況完全相同；`resetSuggestedPool()` 的按鈕同理保留。安全性靠「先驗證再渲染」（見 Security Domain）。

### Anti-Patterns to Avoid
- **在 `generateAISuggestions` 內再寫一個 `if (cumulativeCandidates.length === 0)` 造詞分支：** 這正是現況 3 份複製、各自帶旗標的來源。造詞只能出現在 `pool.length < AI_TARGET` 的 else 分支。
- **為了「測 AI 太少」而讓 AI 多問一輪：** CONTEXT 明確禁止；補滿一律由程式。
- **用 AI 的「池外詞」當成有效詞：** 一律以 `inPool` 過濾。
- **把 `validateWordRhyme` 改成吃參數的新函式並同時保留舊的：** 只有 ai-generate.js:43 一個呼叫者（grep 確認），直接修原函式。

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 「全部 chunk 寫入成功才有版本記號」 | 自己排序逐筆寫入、補償刪除 | 單一 IndexedDB `readwrite` 交易 | 交易 abort 時整筆還原 [CITED: developer.mozilla.org/en-US/docs/Web/API/IDBTransaction — abort() 說明：「Rolls back all the changes to objects in the database associated with this transaction」] |
| 破 HTTP 快取 | 自訂標頭／Service Worker | chunk 網址加 `?v=<meta.version>`；meta 用 `{ cache: 'no-cache' }` | `no-cache` = 每次都向伺服器做條件式驗證 [CITED: developer.mozilla.org/en-US/docs/Web/API/Request/cache]；GitHub Pages 無法自訂標頭（max-age=600）[CITED: .planning/research/ARCHITECTURE.md:21,29,515] |
| 讀音判斷 | 自寫注音解析 | `getZhuyinRhyme`、`getZhuyinInitial`、`RHYME_TO_FAMILY`、`charInfo`（js/search.js:4-34、phonetic-tables.js:136、dict.js:8） | MAP-01／「另寫新判定邏輯」在 Out of Scope |
| 隨機洗牌／排序 | 自寫排序 | `Array.prototype.sort`（穩定） | ES2019 起穩定 |
| 重複的「初始音」運算式 | 第 4 份複製 | 抽成 `_effInitial(zy)`（目前以內聯形式出現在 wordlist.js:222、rhyme-display.js:92-95） | 驗證要與篩選完全同義；抽出後兩邊都用（見下） |

**Key insight：** 本 phase 的 bug 全是「同一件事有多份略有差異的複製」造成的（三份造詞分支、篩選與驗證兩套判定、`_idbPut` 與版本寫入分離）。對策是收斂成一份，而不是再加防護。

## validateWordRhyme（Q3）

### 現況 bug — 實測證據
在 Node（`tests/core-node.spec.mjs` 同款 vm 載入）設定 `currentRhymes=[心]`、`rhymeMode='rhyme'` [VERIFIED: probe.mjs 本 session 輸出]：

| 詞 | 舊 `validateWordRhyme` | 為什麼 |
|----|------------------------|--------|
| 開心、傷心、信心、真心、新 | **false** | `charInfo['心'] = [{"zhuyin":"ㄒㄧㄣ","tone":1,"tier":"common"}]`，而 `RHYME_TO_FAMILY['ㄒㄧㄣ']` 是 `undefined`（家族表的 key 只有韻母 `ㄧㄣ`=13） |
| 美音、原因、光陰 | true | 字沒有聲母，`info.zhuyin` 本身就是韻母（`charInfo['音']` = `ㄧㄣ`） |

出錯行：`js/candidates.js:253` `return infos.some(info => RHYME_TO_FAMILY[info.zhuyin] === reqFamilyId);`——少了 `getZhuyinRhyme(...)`。同函式多字分支（:267）有寫 `getZhuyinRhyme`，所以只有**單字**分支壞。

### 還有 CONTEXT 沒提到的 4 個不一致（同函式，實測）
| # | 位置 | 問題 | 實測 |
|---|------|------|------|
| V2 | candidates.js:255-256（單字「押字首」） | 比的是聲母（`getZhuyinInitial(info.zhuyin) === req.initial`），但候選篩選 `filterWordsByInitialSingle`（candidates.js:112-118）對有韻母的搜尋字比的是**首字韻部家族**。兩者互相矛盾 | 搜「心」押字首：驗證放行 `小心／星期／鄉村`（聲母 ㄒ），但篩選要的是 ㄧㄣ 家族（`音樂` 應過）；`音樂` 舊驗證 false。搜「安」押字首：4000 個真候選 **0 個**通過 |
| V3 | 同上 | 純聲母搜尋（如 `ㄅ`，`rhyme===''`）在「押字尾」模式下，篩選用末字聲母（candidates.js:74-76），驗證用 `RHYME_TO_FAMILY['']`＝undefined → 全拒 | `爸爸／不要` rhyme 模式 → false |
| V4 | candidates.js:269（多字「押子音」） | 只比 `getZhuyinInitial`，沒處理 `ㄧ/ㄨ/ㄩ` 與純韻母字的「有效聲母」（wordlist.js:222 的 `eff` 規則） | `衣` 押字首：`以為／一起／天氣` 全 false；多字押子音 421 個真候選通過 0 個 |
| V5 | candidates.js:260-271（多字） | 沒跳過 `notFound`（篩選 wordlist.js:168 會跳過）；也不看 `_wordLenPass`／`filterSameTone`／`filterNoExtRhyme`／`filterSameChar`（單字分支只看 `filterSameChar`） | 多字含 notFound 的搜尋 → `美音` false |

### 正確規則（鏡射候選篩選，已實測）
「既有韻腳判定」的唯一真相是候選篩選函式（`filterWordsByRhymeSingle` candidates.js:50-91、`filterWordsByInitialSingle` :93-132、`filterWordsByRhyme` wordlist.js:149-181、`filterWordsByInitial` wordlist.js:205-233）。驗證 = 同一規則，但讀音來自 `charInfo`（造詞沒有詞庫注音），**每個字位只要任一讀音通過即可**（破音字，符合 CONTEXT；各字位獨立，所以「任一讀音組合」等於「各位置任一讀音」）。

```js
// 與詞庫篩選同一套規則（js/candidates.js 篩選函式、js/wordlist.js filterWordsByRhyme/Initial），
// 差別只在讀音來自 charInfo；破音字任一讀音通過即可
function _effInitial(zy) {   // 抽自 wordlist.js:222；有聲母取聲母，ㄧㄨㄩ 開頭取介音，其餘取韻母
    return getZhuyinInitial(zy) || (zy[0] === 'ㄩ' ? 'ㄩ' : zy[0] === 'ㄧ' ? 'ㄧ' : zy[0] === 'ㄨ' ? 'ㄨ' : getZhuyinRhyme(zy));
}
function validateWordRhyme(word) {
    const L = word.length;
    if (currentRhymes.length === 0 || L < 2 || L > 8) return false;
    if (currentRhymes.length === 1) {
        if (!_wordLenPass(L)) return false;
        const req = currentRhymes[0];
        const pureInitial = !req.rhyme && !!req.initial;
        const key = rhymeMode === 'rhyme' ? word[L - 1] : word[0];
        if (filterSameChar && key !== req.char) return false;
        const infos = charInfo[key] || [];
        if (!infos.length) return false;                              // 字典查不到 → 丟棄
        if (filterSameTone) { const t = (charInfo[req.char] || [])[0]?.tone; if (!infos.some(i => i.tone === t)) return false; }
        if (pureInitial) return infos.some(i => getZhuyinInitial(i.zhuyin) === req.initial);
        const fam = RHYME_TO_FAMILY[req.rhyme];
        if (fam === undefined) return false;
        return infos.some(i => {
            const r = getZhuyinRhyme(i.zhuyin);                       // ← 本次修正的核心：先取韻母再查家族
            return rhymeMode === 'rhyme' && filterNoExtRhyme ? r === req.rhyme : RHYME_TO_FAMILY[r] === fam;
        });
    }
    if (L !== currentRhymes.length) return false;
    for (let i = 0; i < L; i++) {
        const req = currentRhymes[i];
        if (req.isWild || req.notFound) continue;
        const infos = charInfo[word[i]] || [];
        if (!infos.length) return false;
        const ok = rhymeMode === 'rhyme'
            ? infos.some(x => RHYME_TO_FAMILY[getZhuyinRhyme(x.zhuyin)] === RHYME_TO_FAMILY[req.rhyme])
            : infos.some(x => _effInitial(x.zhuyin) === (req.initial || req.rhyme));
        if (!ok) return false;
    }
    return true;
}
```
此版本即 probe3.mjs 的 `validateWordRhyme2`，**已在真詞庫上對照** [VERIFIED: 本 session 實測，4000 筆真候選／格]：

| 搜尋字／模式 | 舊版通過 | 新版通過 |
|--------------|---------|----------|
| 心 押字尾（寬／嚴） | 573／750 | 3998／3995 |
| 安 押字尾（寬／嚴） | 351／245 | 3987／3994 |
| 安 押字首 | **0** | 3988 |
| 愛 押字首 | **0** | 3990 |
| 衣 押字首 | **0** | 3987 |
| 月 押字首 | **0** | 3943 |
| ㄅ（純聲母）押字尾 | **0** | 3995 |
| 多字 愛＋心 押母音（324 個候選） | 324 | 324 |
| 多字 心＋衣 押子音（421 個候選） | **0** | 419 |

沒過的 0.2%–1.8% 是詞庫讀音不在 `charInfo` 裡的詞（字典缺該讀音），不是規則錯。反向檢查：從詞庫等距抽 4675 個詞，新版放行 342 個，其中 325 個是真候選（其餘 17 個是靠破音字另一讀音通過，符合「任一讀音」決議）；`朋友`、`天空` 對「心」仍為 false。`開心／傷心／美音` 皆 true。

**單字「押字首」的語意是本研究唯一的產品判斷（A1）：** 採「鏡射篩選＝首字韻部家族相同」，因為 `updateModeButtonLabels`（candidates.js:5-6）單字時標籤為「押字尾／押字首」，篩選實際行為早已是韻部；若 Andy 其實要「首字聲母相同」，要改的是篩選，不是驗證。→ 列入 UAT 提問。

### 哪些測試會變（Q3 要求列出）
- **Golden（`tests/golden.spec.mjs`、`tests/golden/*.json`）：零個變動。** `validateWordRhyme` 只被 `js/ai-generate.js:43` 呼叫（`grep -rn validateWordRhyme js index.html` 只有定義 candidates.js:240 與該處）；golden 擷取的是 `#resultsContainer` 查韻結果與 `aiRhymeDisplay`。不要重拍任何 golden。
- `tests/smoke.spec.mjs:8`：註解寫「AI_REPLY 刻意選無聲母的字…v0.96 的 validateWordRhyme 對有聲母的字一律判不合格」——修正後該限制消失，註解需更新；`AI_REPLY = '美音、原因、光陰'` 仍全部通過驗證，測試本身不變。
- `tests/ai-client.spec.mjs`：「舊模型」、「保留：…」各測試用 `美音、原因、光陰`，不受影響；**`白話：主要建議路徑`（:210-228）必須改寫**（見下節）。
- `tests/smoke.spec.mjs` `resetPool` 情境（:42-49 附近的註解寫「再按兩次…第二次出現已推薦所有符合的詞彙」）：新設計下第 2 次按就會出現耗盡訊息＋重置鈕（造詞全被排除→0 個），第 3 次同樣；原本連按 3 次的情境仍通過，註解需改。

## 詞庫載入（Q4）

### 現況（逐行）
- `loadWordlist`（js/wordlist.js:50-100）：守門 `if (wordlistData !== null || wordlistLoading) return;`（:51）→ 第二次呼叫回 `undefined`（無 Promise 可 await）。
- `window.__hoyunWordlistReady = loadWordlist()`（js/init.js:28）是唯一接這個 Promise 的地方（測試用）。
- 開 DB：`lhIdbOpen()`（js/safety.js:184-217，`indexedDB.open('haoYunQi', 2)`，store `wl` keyPath `k`；5 秒逾時）。
- 版本：`fetch('data/wordlist-meta.json')`（:61，**沒有** `no-cache`，走 HTTP 快取）→ `currentVer`；`cachedVer = _idbGet(db,'ver')`（:65）；`useCache = currentVer && cachedVer === currentVer`（:66）。真實 meta：`{"version": "2026-05-11T09:51:32Z", "chunks": 10, "total": 233713}` [VERIFIED: data/wordlist-meta.json]。
- 每個 chunk（10 個並行，:71-92）：先讀 IDB，沒有就 `fetch('data/wordlist-cNN.json')`（:75，同樣走 HTTP 快取）；`if (res.ok)`（:76）— **非 200 完全沒記錄也沒丟例外**；成功就 `_idbPut(db, i, chunk)` **不 await**（:79）。
- 結尾：`if (!useCache && db && buf.length > 0 && currentVer) _idbPut(db, 'ver', currentVer)`（:94）— 不 await，且 **只要 `buf.length > 0` 就寫版本**（即使有 chunk 失敗）。
- `wordlistData = buf.length > 0 ? buf : null`（:96）：**部分 chunk 失敗也被當成功**，之後 AI 的候選數會悄悄偏少。然後 `await applyWordlistOverrides()`（:97，會 `fetch` 並**重新指派** `wordlistData`，:142），最後才 `wordlistLoading = false`（:98）。
- 競態（PERF-03 的「AI 在詞庫就緒前按」）：載入期間 `wordlistData === null`，現況 `getWordlistCandidates*` 回 `null` → toast「詞庫載入中，請稍後再試」就 return（ai-generate.js:110-113 等）——**現況不會誤觸造詞**，但使用者得自己重按；而 `:96` 到 `:98` 之間 `wordlistData` 已有值卻還沒套 overrides，那段時間按下去用的是「未套 overrides」的資料，且 `applyWordlistOverrides` 之後會換掉整個陣列（`cumulativeCandidates` 可能含剛被移除的詞）。

### 「新舊 chunk 混用」真正會發生的路徑（本研究推演；對照 PITFALLS.md #3）
研究 SUMMARY 說的路徑是：meta 與 chunk 都走 `max-age=600` 的 HTTP 快取，新 meta 可能配到舊 chunk 本文，被存成新版本 [CITED: .planning/research/PITFALLS.md:30-34]。讀碼後另有一條**更直接**的混用路徑：
1. IDB 有舊版 V1 的 chunk 0..9 與 `ver=V1`；新版 V2 上線。
2. 載入：`currentVer=V2 ≠ V1` → 全部走網路；若 chunk 3 因網路／非 200 失敗 → 沒寫入，**IDB 裡 chunk 3 仍是 V1 內容**；
3. 其餘 chunk 成功 → `buf.length > 0` → `ver` 被寫成 V2（:94）；
4. 下次載入：`useCache` 為真 → chunk 3 從 IDB 讀到 V1 內容 → **V1／V2 混用，且被釘住到下個版本**。

### 原子換版設計（Q4 要求）
1. **版本進網址：** `const suffix = currentVer ? '?v=' + encodeURIComponent(currentVer) : ''`，chunk 抓 `data/wordlist-cNN.json${suffix}`。網址依版本變，HTTP 快取不可能把舊 V1 本文配給 V2。meta 本身改 `fetch('data/wordlist-meta.json', { cache: 'no-cache' })`，部署後立刻看得到新版本。測試伺服器（tests/serve.mjs）以 `new URL(...).pathname` 取檔，忽略查詢字串，所以 `?v=` 在測試與 GitHub Pages 都能用。
2. **全有或全無（記憶體）：** 每個 chunk 失敗（非 200、JSON 壞）就拋例外、被同一個 catch 記 `lhWarn('詞庫分段 N 載入失敗', e)`（保留既有標記，`tests/error-visibility.spec.mjs:38-45` 靠它）——這同時完成「非 200 留 [好韻器] 記錄」。任一 chunk 缺 → **整份丟棄**（`wordlistData` 維持 `null`、maps 保持空），不寫快取。結果是 AI 路徑走既有的「詞庫載入失敗，請重新整理頁面」，不會用殘缺詞庫算出「候選太少」而誤造詞。
3. **單一交易換版：** 只在「有任何 chunk 來自網路」且 `currentVer` 存在時寫入：
```js
// 一個交易：刪掉舊分段 → 寫全部新分段 → 寫版本。交易 abort 會整筆還原，所以不可能留下「新版號配舊分段」
function _idbReplaceAll(db, ver, chunks) {
    return new Promise(res => {
        let settled = false;
        const fin = (ok, err) => { if (settled) return; settled = true; if (!ok) _wlCacheWriteFailed(err); res(ok); };
        try {
            const tx = db.transaction('wl', 'readwrite');
            const st = tx.objectStore('wl');
            st.delete(IDBKeyRange.bound(0, 1e9));                 // 只刪數字鍵（分段）；IndexedDB 鍵排序「數字 < 字串」，所以 'ver' 與其他字串鍵不受影響
            chunks.forEach((c, i) => st.put({ k: i, v: c }));
            st.put({ k: 'ver', v: ver });
            tx.oncomplete = () => fin(true);
            tx.onerror = e => fin(false, tx.error || e.target.error);
            tx.onabort = () => fin(false, tx.error);
        } catch (e) { fin(false, e); }
    });
}
```
   用 `delete(bound)` 而非 `clear()`：`tests/storage.spec.mjs:111-137` 預先在 `wl` 放一個 `sentinel` 鍵，驗證 v1→v2 升級後「保留詞庫快取」；`clear()` 會把它刪掉使既有測試失敗。刪數字鍵也同時處理「新版 chunk 數比舊版少」的殘留。
4. **回傳單一 Promise：** 
```js
let _wlP = null;
function loadWordlist() {
    if (wordlistData !== null) return Promise.resolve();
    return _wlP ??= _loadWordlistOnce().finally(() => { _wlP = null; });   // 失敗後下次按按鈕可重試；成功時 wordlistData 非 null，上一行直接返回
}
```
   `init.js:28` 不用改。`ai-generate.js` 的 `await loadWordlist()` 在「載入中」時拿到同一個 Promise，在「已完成」時立刻 resolve。`wordlistLoading` 旗標可保留（`ai-generate.js:111` 等 toast 刪除後無人讀它，留著無害；要刪就連 state.js:12 一起刪）。
5. **寫入順序陷阱（Pitfall 5）：** `st.put` 在呼叫當下就做結構化複製。必須在 `applyWordlistOverrides()` **之前**呼叫 `_idbReplaceAll`（拿到 Promise 但先不 await），因為 overrides 會直接修改 `e.z`（wordlist.js:127-128）；若先套 overrides 再寫快取，修正後的 `z` 會被存進 IDB，日後 admin 撤掉修正時快取仍帶著舊修正（現況也是先 put 後套用，這是要保留的行為）。流程：抓／讀齊 chunks → `const cacheP = fromNet ? _idbReplaceAll(...) : Promise.resolve(true)` → 依 index 順序展開成 `buf`、填 maps → `wordlistData = buf; await applyWordlistOverrides();` → `wordlistLoading = false` → `await cacheP`。（以 index 順序展開也讓候選池順序在不同載入間固定，現況順序依 fetch 完成先後。）
6. 設計上限（寫進註解即可，不做）：讀快取是 10 次獨立的 `_idbGet`，別的分頁在兩次讀取之間換版仍可能讀到混合；單人工具且換版極少，接受。

可選（Claude's Discretion，預設不做）：以 `meta.chunks` 取代常數 `WORDLIST_CHUNKS=10`（js/state.js:22；Phase 6 詞庫包若 chunk 數不同才需要）；離線時 meta 抓不到但 IDB 有舊版，可沿用快取（`currentVer === null && cachedVer` → `useCache`）。

### AI 與詞庫之間的等待
見 Pattern 2：`wordlistData === null` 時顯示 `#aiLoading`「詞庫載入中…」（沿用既有 loading 區塊，CONTEXT 允許）並 `await loadWordlist()`；之後**才**呼叫候選函式。`#wordlistProgress`（index.html:297）仍會顯示 `詞庫載入中 n/10…`。等待期間使用者可能換搜尋字，所以用 `snap`／`stale()` 檢查（`currentRhymes` 每次搜尋都重新指派，js/rhyme-display.js:14）。

## Common Pitfalls

### Pitfall 1：候選池無限成長撞 Worker 上限
**What goes wrong：** 連按約 6–7 次，prompt > 24,000 字／請求 > 64 KB，Worker 回 413，使用者看到「內容太長」。
**Why：** `cumulativeCandidates = [...activePool, ...newBatch]` 每次加 ≤ 1000，AI 每次只拿走 ≤ 24；選字分支甚至沒有 1000 上限（candidates.js:216 註解「移除200上限」）。
**How to avoid：** `AI_POOL_MAX = 1000`；送 prompt 的清單 = `pool.slice(0, AI_POOL_MAX)`（`pool` 內 `newBatch` 排前面）；`fillToTarget` 仍用整個 `pool`。
**Warning signs：** 測試連按 10 次，攔截 `/ai` 的 body，`prompt.length` 不得超過 ~6,000。

### Pitfall 2：第一次造詞還沒等詞庫就出現「候選太少」
**What goes wrong：** 若有人把「等詞庫」寫成 `if (!wordlistData) return`，或在 `await` 之前算候選，候選為 0 時會落入造詞分支。
**How to avoid：** 結構上讓造詞只在 `pool.length < AI_TARGET` 的分支；候選函式一律在 `await loadWordlist()` 之後呼叫；`wordlistData` 仍為 `null`（載入失敗）時直接 toast 後 return，**不能**把 `null` 當成空陣列。

### Pitfall 3：舊測試被「建議失敗」新行為打破
`tests/ai-client.spec.mjs:210-228`（`白話：主要建議路徑`）期望 AI 全失敗時 `#aiWordsContainer` 的文字**等於**Worker 的長訊息、且 `span` 恰 1 個。新行為（候選 ≥ 24 + AI 失敗 → 程式補滿 24 張卡＋提示）會讓它失敗。**改寫建議：** 提示列文字 = 「AI 暫時無法排序，先依常用度列出」＋若 `lastErr.plain` 則接上 Worker 白話原因（保住「使用者讀得到原因」的 Phase 2 契約，用 `textContent` 塞）；測試改為斷言 24 張 `.ai-word-card`、提示含原因、按鈕恢復。`白話：補充詞路徑`（:184-208，stub 詞庫 12 個候選 + 全部 503）不用改：候選 < 24 → 一次造詞呼叫 → `f.calls.length === 4` 仍成立（Worker 鏈 4 次），顯示 `ALL_BUSY_MSG`。

### Pitfall 4：照 CONTEXT 字面「逐筆寫、最後 await 寫 ver」仍會混用
逐筆寫入時中途失敗（或分頁被關）不會還原已寫的新 chunk，也不會還原「沒被覆寫的舊 chunk」。單一交易才有還原。若計畫者堅持字面順序，也至少要「抓齊全部 chunk 才開始寫」＋「寫入前先刪數字鍵」＋「await 每個寫入」，但仍不如單一交易。

### Pitfall 5：先套 overrides 再寫快取，會把「修正後」存進快取
見 § 詞庫載入第 5 點。測試：fixture overrides 含 `fixed` 一筆，載入後讀 IDB 對應 chunk，該詞 `z` 必須是原始值。

### Pitfall 6：`?v=` 讓既有 stub 正規表示式失效
`tests/helpers.mjs:73` 的 `/\/data\/wordlist-c0\d\.json$/` 有 `$` 錨點，網址帶 `?v=…` 就不再相符，整批使用 `wordlist:'stub'` 的測試會悄悄改打真詞庫（變慢、結果也變）。**必須同步改成 `/\/data\/wordlist-c0\d\.json(\?.*)?$/`**，`tests/error-visibility.spec.mjs:38` 的 `/\/data\/wordlist-c03\.json/` 沒有 `$`，不受影響。

### Pitfall 7：`split-tags.spec.mjs` 的 verify-split 負向對照會在第一個 js 修改後失敗（Q2）
見下節。

### Pitfall 8：Chromium 會把非 2xx 資源記成 console.error
`tests/helpers.mjs:22` 註解已說明。測「非 200 留記錄」時回 500 並用 `errors.filter(e => !/status of 500/.test(e))`（`tests/ai-client.spec.mjs:175` 同款寫法）；不要用 abort（會多一筆 `net::ERR_FAILED`）。

### Pitfall 9：等詞庫期間換搜尋，舊結果蓋掉新狀態
`search.js:119` 在輸入改變時清池；若舊請求之後才回來，會把舊詞加進新的 `suggestedPool`。用 `snap`／`stale()`（Pattern 2）在每個 `await` 之後檢查。

## Code Examples

### Node 測試載入（`tests/node-core.mjs`，抽自 `tests/core-node.spec.mjs:13-29`）
```js
// 與 core-node.spec.mjs 相同：node:vm、五個最小替身；CORE 清單不變（candidates.js、state.js 已在其中）
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
export const CORE = ['js/phonetic-tables.js', 'js/dict.js', 'js/search.js', 'js/state.js', 'js/polyphonic.js', 'js/wordlist.js', 'js/candidates.js'];
export function loadCore() { /* 原樣搬出 */ }
```
`state.js` 的 `let` 全域在 vm 裡可由後續 `ev('currentRhymes = [...]')` 直接改寫（既有測試 `core-node.spec.mjs:108-110` 已這樣用 `savedWords`）。注意：新增的 `AI_TARGET`／`AI_POOL_MAX` 若用 `const`，同樣可由 `ev('AI_TARGET')` 讀。

### 驗證規則測試（用 probe 實測的期望值）
```js
ev("currentRhymes=[{char:'心',zhuyin:'ㄒㄧㄣ',initial:'ㄒ',rhyme:'ㄧㄣ',familyLabel:'ㄧㄣ'}]; rhymeMode='rhyme'");
for (const w of ['開心','傷心','信心','真心','美音','原因','光陰']) expect(ev(`validateWordRhyme('${w}')`), w).toBe(true);
for (const w of ['朋友','天空']) expect(ev(`validateWordRhyme('${w}')`), w).toBe(false);
// 押字首（單字、非純聲母）= 首字韻部相同（鏡射 filterWordsByInitialSingle）
ev("rhymeMode='initial'");
expect(ev("validateWordRhyme('音樂')")).toBe(true);    // 舊版 false
expect(ev("validateWordRhyme('小心')")).toBe(false);   // 舊版 true（聲母相同但韻部不同）
```
性質測試（比逐例更能防回歸）：以真詞庫（`data/wordlist-c0N.json`）或 stub 設 `wordlistData`，對固定的 7 組（心/安/愛/衣/月/行/ㄅ）× 2 模式 × 嚴／寬，取 `filterWordsBy*` 的前 N 筆，斷言 `validateWordRhyme` 通過率 ≥ 97%（實測 98.6%–99.97%；用比例而非全等，因為字典缺讀音的詞會落在外面，Phase 6 換詞庫後比例也不應大幅變動）。

### `fillToTarget` 性質測試
隨機（固定種子）產生 pool 大小 ∈ {0,1,23,24,25,1000}、aiPicks 含重複／池外詞／空陣列／全池外，斷言：`words.length === Math.min(24, pool.length)`、無重複、全 ∈ pool、`picked + filled === words.length`；`aiPicks` 全是池外詞時結果 = 依 `rank` 排序的前 24 個。

### 慢速詞庫載入（瀏覽器）
```js
// helpers.mjs：bootPage 新增 waitWordlist（預設 true，行為不變）；為 false 時不等 __hoyunWordlistReady
await page.evaluate(w => Promise.all([window.__hoyunReady, w ? window.__hoyunWordlistReady : null, window.__hoyunSafetyReady, window.__hoyunModelsReady]), waitWordlist);

// 測試：用真詞庫（搜「安」有 1000 個候選），chunk 請求卡在閘門後面
let release; const gate = new Promise(r => { release = r; });
const { page, context } = await bootPage(browser, {
    waitWordlist: false, aiReply: '',
    beforeGoto: ({ context }) => context.route(/\/data\/wordlist-c0\d\.json/, async route => { await gate; await route.continue(); }),
});
const ai = []; page.on('request', r => { if (new URL(r.url()).pathname === '/ai') ai.push(JSON.parse(r.postData()).prompt); });
await page.fill('#searchInput', '安'); await settle(page);
await page.evaluate(() => document.getElementById('generateBtn').click());
await expect(page.locator('#aiLoading')).toContainText('詞庫載入中');
expect(ai).toHaveLength(0);                       // 等待期間沒有任何 /ai 請求，更沒有造詞
release();
await expect(page.locator('#aiWordsContainer .ai-word-card')).toHaveCount(24);
expect(ai).toHaveLength(1);                       // 只有「挑詞」一次呼叫
expect(ai[0]).not.toContain('直接生成');           // 造詞 prompt 的特徵字串（ai-generate.js:29）；沿用或改字時同步更新
```

### 版本更新（瀏覽器，同一個 context 的 IndexedDB 跨頁保留）
```js
// 一個可變狀態驅動的 stub：meta 與 10 個 chunk 的內容隨 state.ver 變；state.failChunk 讓某分段回 500
const state = { ver: 'V1', failChunk: null };
await context.route(/\/data\/wordlist-meta\.json$/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: state.ver, chunks: 10, total: 10 }) }));
await context.route(/\/data\/wordlist-c0(\d)\.json(\?.*)?$/, r => {
    const i = Number(/c0(\d)/.exec(r.request().url())[1]);
    if (state.failChunk === i) return r.fulfill({ status: 500, body: 'x' });
    return r.fulfill({ status: 200, contentType: 'application/json', body: `{"w":"${state.ver === 'V1' ? '舊版' : '新版'}${i}","z":"ㄐㄧㄡˋ ㄅㄢˇ","p":1}\n` });
});
// 讀 IDB：const dump = () => page.evaluate(async () => { const db = await lhIdbOpen(); /* 讀 ver 與 0..9 */ });
```
斷言序列：①V1 開頁→IDB `ver=V1`、10 段全是「舊版」；②`state.ver='V2'`＋`failChunk=3` 開新頁→`wordlistData === null`、warnings 含 `[好韻器] 詞庫分段 3 載入失敗`、IDB **仍是 V1 完整一套**（沒有混用）；③`failChunk=null` 再開頁→`ver=V2`、10 段全是「新版」、`wordlistData` 全是新版；④所有 chunk 請求網址帶 `v=V2`（`page.on('request')` 收集）。另加：stub overrides 含 `fixed`，驗證 IDB 內該詞 `z` 是原始值（Pitfall 5）。

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 每個 chunk 單獨 `_idbPut`、`ver` 事後 fire-and-forget | 單一 readwrite 交易（刪舊、寫新、寫 ver）；資料先全進記憶體 | 本 phase | 消除新舊混用；換版寫入失敗時舊快取原封不動 |
| AI 回多少給多少，再問第二輪 | AI 只排序，程式保證數量 | 本 phase | 數量不再取決於模型；少一次 AI 呼叫 |
| 三份複製的候選／造詞分支各帶旗標 | 單一流程、無旗標 | 本 phase | 刪 11 處 `_aiExtraRoundDone`（5 個檔） |

**Deprecated/outdated：** `_idbPut`（wordlist.js:23-40）在新設計後無呼叫者，刪除（保留 `_wlCacheWriteFailed` 與 `_idbGet`）。

## verify-split 該如何處置（Q2 後半）

**事實：**
- `tests/verify-split.mjs` 把 `js/*.js`（`safety.js` 除外）依 index.html 標籤順序接回，與基準 commit `2f2d248` 的**整份 inline `<script>`**逐字比對；本 session 實跑 `node tests/verify-split.mjs 2f2d248` → `OK script: 176724 vs 176729`、`OK style: 66766 vs 66771`（現況為通過）。
- 它本身不是 `*.spec`，`npm test` 不會直接跑；**但 `tests/split-tags.spec.mjs:132-146`（`split：verify-split 抓得到被註解掉的標籤（負向對照）`）會 `execFileSync('node', ['tests/verify-split.mjs', '2f2d248', 'index.html'])` 並斷言 `原檔應 OK`（退出碼 0）**——這個測試在 `npm test` 裡 [VERIFIED: tests/split-tags.spec.mjs:132-146]。**Phase 4 對任何 `js/*.js` 的第一個正常編輯都會讓它失敗。**
- 「rebase」沒有意義：基準是「拆檔前的單一檔案」，它的存在目的就是證明搬移是逐字的；一旦刻意改了程式，它必然不等。

**建議（計畫的第一個 commit，先於任何 js 修改）：**
1. 刪除 `tests/split-tags.spec.mjs` 的 `split：verify-split 抓得到被註解掉的標籤（負向對照）` 測試，並清掉只有它用到的 import（`execFileSync`、`writeFileSync`、`mkdtempSync`、`rmSync`、`tmpdir`、`join`——刪前以 grep 確認該檔其他測試沒用）。同檔的 `stripHtmlComments` 負向對照（:117-128）與其餘標籤一致性測試**保留**（與基準無關）。測試數 248 → 247。
2. 刪除 `tests/verify-split.mjs`（Phase 3 的搬移守門已經完成並通過 `03-VERIFICATION.md`；歷史可由 `git show 5d18f50:tests/verify-split.mjs` 取回）。若想保留，替代方案是留檔但在檔頭標明「只在 Phase 3 結束 commit（`2f5239e` 之前、尚未修改任何 js 時）有效」，不要留在 npm test 路徑裡——此方案多一個會誤導人的死檔，不建議。
3. 同步更新 `.planning/phases/03-split-index-html/03-VALIDATION.md` 不需要（歷史文件）；在 04 的計畫摘要寫一句「Phase 4 起不再做逐字比對」即可。

## Runtime State Inventory

本 phase 不是改名／遷移，只動快取「寫入方式」，資料格式不變：

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | IndexedDB `haoYunQi` v2 的 `wl` store：鍵 `0..9`（分段陣列）與 `'ver'`（字串）[VERIFIED: wordlist.js:73、:94] | 格式不變，既有使用者快取（`ver` 等於目前 meta 版本者）新舊程式都讀得懂，**不需遷移、不需備份**；`wl` 是快取不是使用者資料 |
| Live service config | None — 詞庫由 GitHub Pages 靜態提供 | — |
| OS-registered state | None | — |
| Secrets/env vars | None | — |
| Build artifacts | `scripts/build_wordlist.py:129-132` 產生 meta（`version` 為 UTC 時間戳）| 不改；`?v=` 直接使用 `meta.version`，每次重新 build 版本都會變 |
| localStorage | 不新增任何鍵 | `scan.spec.mjs` 的「儲存鍵必須登記在 safety.js」規則不受影響 |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 單字「押字首」的正確語意是「首字韻部（家族）相同」（鏡射現行候選篩選），而非「首字聲母相同」 | validateWordRhyme | 若 Andy 要的是聲母相同：驗證與篩選都要改，且 prompt 文字也要改；需 UAT 確認 |
| A2 | 補滿排序鍵用 `wordPriorityMap`（詞頻 p）由大到小；p 前幾名偏新聞語料 | 現況流程追蹤 | 補滿的詞不夠「歌詞感」；可改成隨機補或 tier 加權，不影響計畫結構 |
| A3 | 選字模式（`selectedChars.size > 0`）造詞時，驗證改為「固定字位的字 ∈ selectedChars」，prompt 也說明；現況是用 `currentRhymes` 驗證、prompt 完全沒提選字（ai-generate.js:123） | Open Questions | 若 Andy 認為選字模式造詞用整體韻腳即可，改用 `validateWordRhyme` |
| A4 | `IDBObjectStore.put` 在呼叫當下同步做結構化複製；同一交易內請求依序執行 | 詞庫載入 | 若錯，Pitfall 5 的順序保護失效；由「IDB 內容是原始 z」的測試自動抓到 |
| A5 | `AI_POOL_MAX = 1000` 夠小（約 3.7k 字）且不降低挑詞品質 | Pitfall 1 | 太大撞 Worker 上限、太小減少 AI 選擇；數字可調，Worker 註解（worker/src/ai.js:238）也預期 Phase 4 縮減候選 |
| A6 | 任一 chunk 缺就整份丟棄（`wordlistData` 維持 null）比「用殘缺詞庫繼續」好；失敗後下次按按鈕會重試 | 詞庫載入 | 非 AI 功能中依賴 `wordPhoneticMap` 的整詞讀音查詢（rhyme-display.js:52-57）在失敗時退回逐字讀音；可接受，但屬行為變更 |

## Open Questions

1. **「建議數量設定」不存在**
   - 已知：目標 24 為字面值；index.html 無對應控制項。
   - 不清楚：Andy 是否預期有可調的數量？
   - 建議：本 phase 只收成 `AI_TARGET = 24`；若要 UI 可調放到之後 phase（CONTEXT 已寫「不新增設定」）。
2. **選字模式造詞的驗證標準（A3）**
   - 建議：`selectGenerated(..., isValid)` 的 `isValid` 在 `selectedChars.size > 0` 時用 `w => selectedChars.has(rhymeMode === 'rhyme' ? w.at(-1) : w[0]) && _wordLenPass(w.length)`；prompt 加一句「字尾／字首必須是這些字之一：…」。選字字是從查韻結果卡點選的，必然已押韻。
3. **AI 失敗時提示列的措辭**
   - CONTEXT 給「AI 暫時無法排序，先依常用度列出」；是否同時附 Worker 的白話原因（建議附，見 Pitfall 3），讓 Phase 2 的「使用者讀得到原因」契約不退化。
4. **UAT（Andy 手感）**：用「心」「安」「愛」押字尾與押字首各試一次，確認 ① 數量恆為 24（候選充足時）② 造詞押字首的結果符合 A1 ③ 補滿詞可接受（A2）。

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | 全部測試／探針 | ✓ | v26.8.1 | — |
| `@playwright/test`（含 Chromium） | 瀏覽器測試 | ✓ | 1.63.0（`npm test` 248 passed，1.0 分鐘） | — |
| 外部網路／AI 服務 | — | 不需要 | 測試全部用 `routeExternal` 的 `/ai` mock 與 `bridgeWorker` | — |
| 真詞庫 `data/wordlist-c0N.json` | 慢速載入測試、性質測試 | ✓ | 233,713 詞（12.95 MB） | 可用 `tests/fixtures/wordlist-stub.ndjson`（12 詞） |

**Missing dependencies with no fallback:** none
**Missing dependencies with fallback:** none

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `@playwright/test` 1.63.0（瀏覽器 spec 與 Node-only spec 同一個 runner；Node 邏輯以 `node:vm` 載入 `js/*.js`） |
| Config file | `playwright.config.mjs`（`fullyParallel: true`、`retries: 0`、測試用靜態伺服器 `tests/serve.mjs` 回 `cache-control: no-store`） |
| Quick run command | `npx playwright test tests/ai-fill.spec.mjs tests/core-node.spec.mjs`（純 Node，數秒） |
| Full suite command | `npm test`（基準 248 passed，約 1.0 分鐘） |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AI-03 | `fillToTarget`：`pool ≥ target` ⇒ 恰 `target` 個、無重複、全在池內；AI 回 0 個／全池外／重複皆補滿；依 rank 補滿 | unit（Node vm） | `npx playwright test tests/ai-fill.spec.mjs -g "fillToTarget"` | ❌ Wave 0 |
| AI-03 | 瀏覽器端：候選 ≥ 24 且 AI 只回 3 個 → 畫面恰 24 張卡、`/ai` 恰 1 次、prompt 不含造詞字樣 | e2e（mock `/ai`，真詞庫搜「安」） | `npx playwright test tests/ai-fill.spec.mjs -g "填滿"` | ❌ Wave 0 |
| AI-03 | AI 失敗（503）且候選 ≥ 24 → 24 張卡＋「AI 暫時無法排序，先依常用度列出」＋原因 | e2e | `… -g "AI 失敗仍填滿"`（取代 `ai-client.spec.mjs:210-228`） | ❌ Wave 0 / 改寫 |
| AI-03 | 連按 10 次，每次 prompt 長度有上限（Pitfall 1） | e2e | `… -g "連按"` | ❌ Wave 0 |
| AI-04 | `validateWordRhyme`：`開心/傷心/信心/真心` 對「心」押字尾為 true、`朋友/天空` false；押字首＝首字韻部；純聲母；多字含 `notFound`／萬用字；破音字任一讀音 | unit（Node vm） | `… -g "validateWordRhyme"` | ❌ Wave 0 |
| AI-04 | 性質：`filterWordsBy*` 的真候選通過率 ≥ 97%（7 字 × 2 模式 × 嚴寬） | unit（Node vm、真詞庫） | `… -g "鏡射"` | ❌ Wave 0 |
| AI-04 | 候選 < 24 → 只造一輪（`/ai` 呼叫數 = 1）；不合格詞被丟；總數不足不追加；造出 0 且池 0 → 耗盡訊息＋重置鈕 | e2e（stub 詞庫＋mock） | `… -g "造詞一輪"` | ❌ Wave 0 |
| AI-04 | `_aiExtraRoundDone` 在 `js/` 與 `tests/` 中 0 次出現 | static | `grep -rn _aiExtraRoundDone js tests` 應無輸出（放進 verify 步驟，不必獨立測試） | — |
| PERF-03 | 詞庫載入中按 AI：顯示「詞庫載入中…」、等待期間 0 個 `/ai` 請求、載入後正確數量 | e2e（route 閘門） | `npx playwright test tests/wordlist-cache.spec.mjs -g "慢速"` | ❌ Wave 0 |
| PERF-03 | 版本升級：V1 全套在 IDB → V2 全部換新；缺一段時 IDB 維持 V1 完整；chunk URL 帶 `v=`；overrides 不污染快取 | e2e | `… -g "版本"` | ❌ Wave 0 |
| PERF-03 | chunk 回 500 → `[好韻器] 詞庫分段 N 載入失敗` 留記錄 | e2e | `… -g "非 200"`（沿用 `tests/error-visibility.spec.mjs:38` 風格） | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx playwright test tests/ai-fill.spec.mjs tests/core-node.spec.mjs`（Node 純函式，< 10 秒）
- **Per wave merge:** `npm test`（全部，約 1 分鐘）
- **Phase gate:** `npm test` 全綠（預期 248 − 1（verify-split 負向對照）＋ 新增測試數）、`golden` 零變動（`git status tests/golden` 乾淨）、`grep _aiExtraRoundDone` 無輸出，再進 `/gsd-verify-work`；Andy UAT 見 Open Question 4。

### Wave 0 Gaps
- [ ] `tests/node-core.mjs` — 抽出共用 `loadCore`（`core-node.spec.mjs` 改 import，行為不變）
- [ ] `tests/ai-fill.spec.mjs` — AI-03／AI-04 純函式與 e2e
- [ ] `tests/wordlist-cache.spec.mjs` — PERF-03 三組測試
- [ ] `tests/helpers.mjs` — `bootPage({ waitWordlist })`；`stubWordlist` 的正規表示式放寬為允許 `?v=`；（可選）`stubWordlistVersioned`
- [ ] 刪除 `tests/split-tags.spec.mjs` 的 verify-split 負向對照＋刪 `tests/verify-split.mjs`（**必須是第一個 commit**，之後的 js 編輯才不會讓 npm test 變紅）
- [ ] 改寫 `tests/ai-client.spec.mjs:210-228`；更新 `tests/smoke.spec.mjs:8` 與 resetPool 情境註解

**Commit 順序建議（CONTEXT 要求 validateWordRhyme 修正獨立 commit）：** ① 退役 verify-split（test）→ ② 抽 `loadCore`、補 helpers（test）→ ③ **`fix(04): validateWordRhyme` 單獨 commit**（含 Node 規則測試；golden 不動）→ ④ 純函式＋AI 流程重構（刪旗標）→ ⑤ 詞庫載入重寫＋瀏覽器測試。②③可先寫失敗測試再修（紅→綠）。

## Security Domain

`security_enforcement: true`、`security_asvs_level: 1`、`security_block_on: high` [VERIFIED: .planning/config.json]。

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | **yes** | LLM 回覆視為不可信輸入：挑詞結果必須 ∈ 候選池；造詞每個字必須存在於 `charInfo` 且通過韻腳判定，才進入 `innerHTML` 樣板 |
| V6 Cryptography | no | — |
| V12/V13（資源濫用，ASVS 的 API 面） | yes（輕） | 客戶端限制 prompt 大小（`AI_POOL_MAX`），不倚賴 Worker 的 413 當唯一防線 |

### Known Threat Patterns for 純前端 + LLM 輸出

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| LLM 回覆含 HTML／腳本，經 `innerHTML` 字串樣板注入（ai-generate.js:47-49、210、235 的 `data-word="${w}"`、`onclick="saveWord('${w}')"`，只替換單引號） | Tampering／XSS | 渲染前一律先驗證：挑詞 ∈ 候選池（詞庫資料為可信來源）；造詞要求**每個字都在 `charInfo`**（只含字典裡的漢字，天然排除引號、`<`、`>`）。**不變量：未通過驗證的字串永遠不進樣板**；計畫的 code review 要檢查這一點。不改用 `el.onclick`（會破壞 smoke 覆蓋，見 Architecture） |
| Prompt 注入（歌詞／情境文字被送給 LLM） | Tampering | 影響範圍僅限使用者自己的結果；輸出經上述驗證，無法影響其他使用者或儲存資料 |
| 客戶端候選池過大造成 Worker 413／濫用額度 | DoS | `AI_POOL_MAX`；Worker 端 Phase 2 已有 24,000 字、64 KB、8 訊息上限 |
| 快取污染（新舊 chunk 混用、overrides 寫入快取） | Tampering（資料完整性） | 單一交易換版、`?v=`、先寫快取後套 overrides |

## Sources

### Primary (HIGH confidence)
- 本 repo 原始碼（本 session 逐檔 Read）：`js/ai-generate.js`、`js/candidates.js`、`js/wordlist.js`、`js/state.js`、`js/ai-client.js`、`js/init.js`、`js/panels.js`、`js/rhyme-display.js`、`js/search.js`（:1-60）、`js/dict.js`（:1-80）、`js/phonetic-tables.js`（:85-150）、`js/safety.js`（lhIdbOpen :181-217）、`worker/src/ai.js`（:236-300）、`index.html`（script 標籤、:291-299）
- 本 repo 測試：`tests/core-node.spec.mjs`、`tests/helpers.mjs`、`tests/ai-client.spec.mjs`、`tests/golden.spec.mjs`、`tests/smoke.spec.mjs`、`tests/split-tags.spec.mjs`、`tests/verify-split.mjs`、`tests/serve.mjs`、`tests/error-visibility.spec.mjs`、`tests/storage.spec.mjs`（:70-130）
- 實測探針（scratchpad，Node vm 載入 repo 程式、真詞庫 233,713 詞）：`probe.mjs`（舊驗證行為）、`probe2.mjs`（候選數量、字數、p 分布）、`probe3.mjs`（新驗證對照）；`npm test` 基準 248 passed
- `.planning/` 文件：04-CONTEXT.md、REQUIREMENTS.md、STATE.md、codebase/CONCERNS.md、phases/02-…/02-03-SUMMARY.md、phases/03-…/03-05-SUMMARY.md、03-VERIFICATION.md

### Secondary (MEDIUM confidence)
- MDN `Request.cache`（`no-cache` 定義）— https://developer.mozilla.org/en-US/docs/Web/API/Request/cache
- MDN `IDBTransaction`（abort 還原）— https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction
- `.planning/research/PITFALLS.md:30-34`、`.planning/research/ARCHITECTURE.md:21,29,515`（GitHub Pages `max-age=600`、`?v=` 破快取為業界慣例；該檔標為 MEDIUM）

### Tertiary (LOW confidence)
- A4（IndexedDB `put` 同步複製、交易內依序）— 規格行為，未在本 session 以文件原句驗證；由測試把關

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 無新依賴
- Architecture: HIGH — 全部由讀碼＋實測支持；唯一產品判斷是 A1
- Pitfalls: HIGH — Pitfall 1、3、5、6、7 都由實際行數或實測推得；Pitfall 4 為推演（單一交易為建議的更強做法）

**Research date:** 2026-10-04
**Valid until:** 30 天（程式碼為本 repo，變動只會來自本 milestone 內其他 phase；Phase 6 換詞庫格式時需回頭檢查 `WORDLIST_CHUNKS` 與測試中的 12 詞 stub 假設）
