# 好韻器 (Lucky Hawaii)

押韻工具，服務對象是中文歌詞創作者。輸入注音/拼音/漢字，找到同韻腳的字，再搭配多家 LLM（Gemini / GitHub Models / Groq 自動 fallback）推薦適合歌詞的詞語。

**部署：** GitHub Pages → `https://andy-coin.github.io/Lucky-Hawaii`  
**架構：** 純前端單 HTML 檔，無後端，Gemini API 直接由前端呼叫（API key 以 Google Cloud domain restriction 保護）

---

## 面板佈局

```
[ 左側面板 400px ]          [ 主容器 900px ]       [ 右側面板 400px ]
  📝 歌詞段落（flex: 1 each）      韻腳搜尋            ✨ AI 建議（flex: 1）
    └ 段落 0（預設「歌詞」）                             押字尾 / 押字首（單字）
    └ 新增段落（可折疊/拖曳/重命名）                     押母音 / 押子音（多字）
  ── 情境 & 標籤（flex: 0 0 33%）                      filter chips（單字模式）
                                                      📌 保留池（flex: 0 0 28%）
```

- 左右面板在 `≤900px` 螢幕改為底部 bottom sheet，由 Tab 列控制
- 面板狀態（展開/收起）存 localStorage
- 情境＆標籤、保留池：點標題列收折，`flex-basis` 過渡動畫，狀態存 localStorage
- 歌詞段落：點 header 空白處 / chevron 折疊（`flex` transition），雙擊標題文字可編輯，拖曳 header 可重排

---

## 全域狀態變數

| 變數 | 說明 |
|------|------|
| `inputMode` | `'auto'`/`'zhuyin'`/`'pinyin'`，搜尋框右側切換鈕，存 `haoYunQi_inputMode` |
| `hashtags` | 情境標籤陣列，存 `haiku_hashtags` |
| `lyricsSections` | 歌詞段落 `{label, text, collapsed}[]`，存 `haiku_lyrics` |
| `savedWords` | 保留池詞語，存 `haiku_savedwords` |
| `currentRhymes` | 當前搜尋偵測到的韻腳陣列 `{char, zhuyin, initial, rhyme, familyLabel}[]` |
| `rhymeMode` | `'rhyme'`（押字尾/母音）或 `'initial'`（押字首/子音） |
| `wordlistData` | 詞庫陣列（boot 階段背景預載），null = 未載入 |
| `wordPriorityMap` | Map\<word, priority\>，詞庫載入後建立 |
| `wordPhoneticMap` | Map\<word, zhuyin串\>，整詞讀音索引（解決破音字） |
| `suggestedPool` | Set，本次搜尋已建議過的詞（換字時清空） |
| `filterSameTone` | 單字模式：同聲調 filter |
| `filterSameChar` | 單字模式：同字 filter |
| `filterNoExtRhyme` | 單字模式：排除借韻 filter |
| `filterWordLen` | 單字模式：限字數 filter，`0`=不限 / `2` / `3` / `4`（4 表 ≥4） |
| `polyphonicsOrderMap` | Map\<char, string[]\>，破音字讀音順序表，從 `data/polyphonic-order.json` lazy fetch |
| `_polyphonic` | `{char, reading}`，使用者目前點選的破音字讀音；換字時自動重置 |
| `sentCandidatesSet` | Set，已送出給 AI 評估過的詞（跨次累積），搭配 `cumulativeCandidates` |
| `cumulativeCandidates` | 累積的候選詞陣列（每次生成追加），活躍池 = 排除 suggestedPool 和 savedWords 後的子集 |
| `_aiExtraRoundDone` | boolean，標記是否已執行過純 AI 造詞輪；換字/reset/toggleFilter 時重置 |

---

## 核心資料結構

| 名稱 | 位置 | 說明 |
|------|------|------|
| `rhymeDict` | `data/rhyme-dict.js` | 字庫主體。格式：`'注音+聲調': '常用字｜一般字｜冷僻字'`，1343 條目，由 `<script src>` 載入（file:// 離線也可用） |
| `RHYME_FAMILIES` | index.html | 16 個韻部分組（ㄤ、ㄧㄢ…），每組含多個注音韻母 |
| `RHYME_TO_FAMILY` | 由 RHYME_FAMILIES 建立 | 反查 Map：注音韻母 → 韻部 id |
| `chineseDict` | 由 buildIndex 建立 | 漢字 → 注音陣列 |
| `charInfo` | 由 buildIndex 建立 | 漢字 → `{zhuyin, tone, tier}` 陣列 |
| `wordlist-c00~c09.json` | `data/` | vChewing + libchewing 合併詞庫，切成 10 個 NDJSON chunk，格式 `{w, z, p}` |
| `wordlist-meta.json` | `data/` | 詞庫版本資訊 `{version, chunks, total}`，build 時自動產生，供 IDB 快取比對 |

---

## 詞庫（AI 建議）架構

### 詞庫來源
- **vChewing VanguardLexicon**（主要，優先採用）：phrases-moe / tabe / vchewing-cht，從 GitHub 下載
- **libchewing tsi.csv**（補充，LGPL-2.1-or-later）：填入 vChewing 沒有的詞
- 由 `scripts/build_wordlist.py` 處理，格式：`{"w":"詞","z":"每字注音 空格分隔（含聲調，1聲省略）","p":frequency}`
- 前端 `getZhuyinRhyme()` 在入口剝聲調，比對韻部/聲母時 tone-safe；`getWordPhoneticDisplay()` 直接用詞庫聲調，解決破音字 hover 例外
- `p` 為原始語料庫出現次數（0 ~ 250 萬），**p=0 不代表冷僻**（libchewing 詞條無頻率資料）

### Priority 分層機制
**多字模式**（押母音/押子音）：每次生成逐層嘗試門檻直到有候選為止。

| 層級 | 門檻 | 意義 |
|------|------|------|
| 第一層 | p ≥ 30 | 高頻常用詞 |
| 第二層 | p ≥ 10 | 中頻詞 |
| 第三層 | p ≥ 1 | 全部詞庫 |

**單字模式**（押字尾/押字首）：三層機制暫時停用，直接取全部候選詞（p ≥ 1，無數量上限），shuffle 後交給 AI。

- 候選詞以累積池方式管理（`cumulativeCandidates`），每次生成新 batch 並追加到活躍池
- AI 每次從累積池挑選最多 **24 個**（`sentCandidatesSet` 追蹤已送出的詞，避免重複送給 AI）
- AI 選出的詞加入 `suggestedPool`，下次生成自動排除
- 候選詞 < 24 個時**直接全數列出**（不經 AI 篩選），再呼叫 `generateAIWords` 補足至 24
- 候選池耗盡 → 先進行一輪**純 AI 造詞**（24 個，`_aiExtraRoundDone = true`）→ 再次耗盡才顯示「已推薦所有符合詞彙」+ ↺ 重置
- 候選池充足時（主路徑 AI 挑選）**不呼叫 `generateAIWords`**，多餘留給下一輪
- `generateAIWords` 造詞全數失敗時顯示「AI 也想不到更多符合的詞彙，你自己想吧」
- 搜尋不同字 → `suggestedPool` / `sentCandidatesSet` / `cumulativeCandidates` / `_aiExtraRoundDone` 全部自動清空

### 詞庫分批載入 + IndexedDB 快取

```
Boot 同步初始化結束 → loadWordlist() 立即背景啟動（fire-and-forget，不阻塞 UI）
  → fetch wordlist-meta.json（~50 bytes）取版本號
  → 比對 IndexedDB 快取版本
  → 相同 → 從 IDB 讀 10 chunk（~200ms，無感）
  → 不同 → 平行 fetch c00~c09（10 × ~1.2MB）→ 存入 IDB → 下次快
進度顯示：AI 面板內「詞庫載入中 X/10…」
若使用者在載入完成前就按 AI 建議 → 顯示「詞庫載入中，請稍後再試」toast（不重觸發載入）
```

**重建詞庫後**只需 push `data/wordlist-c*.json` 和 `data/wordlist-meta.json`，IDB 快取自動失效。

### 萬用字元 `*`（多字搜尋）
CJK 輸入中可用 `*` 代表「任意一字」的位置，例如：

| 輸入 | 效果 |
|------|------|
| `安*感` | 3字詞，首字押「安」韻，末字押「感」韻，中間自由 |
| `安**感` | 4字詞，中間兩格自由 |
| `*感` | 2字詞，末字押「感」韻，首字自由 |

- `updateAIRhymeDisplay` 解析 `*` 為 `{isWild: true}`，不計算韻腳
- `filterWordsByRhyme` / `filterWordsByInitial`：wild 位置跳過韻腳/聲母比對
- `validateWordRhyme`：wild 位置跳過驗證
- AI 面板韻腳顯示：wild 位置顯示半透明 `＊`
- 有 wild 時不進入單字模式（filter chips 不顯示）

### 破音字讀音修正
`updateAIRhymeDisplay` 遇到多字詞時，優先從 `wordPhoneticMap` 整詞查讀音（解決「長征」被誤讀為ㄔㄤ等問題），找不到才 fallback 逐字取第一讀音。

### 破音字 chips
搜尋結果為**單一 CJK 字且具多個 baseZhuyin**（`chineseDict[char].length > 1`）時，在搜尋框下方出現讀音選擇按鈕列：
- 讀音順序依 `data/polyphonic-order.json` 排序（`polyphonicsOrderMap`），預設高亮第一個
- chip 文字依 `lastSearchType` 切換（拼音模式顯示拼音），`data-reading` 屬性仍保留注音形式作為內部識別
- 點擊 chip → `_polyphonic = {char, reading}` → 重新呼叫 `updateAIRhymeDisplay`，AI 面板韻腳隨之切換
- 換字搜尋時自動重置（`_handleSearch` 偵測 char 改變）
- 長按 chip（手機）→ 右鍵選單（桌面）可回報「缺漏讀音」或「讀音順序錯誤」

| 狀態變數 | 說明 |
|---------|------|
| `polyphonicsOrderMap` | `Map<char, string[]>`，頁面初始化後背景 fetch `data/polyphonic-order.json` |
| `_polyphonic` | `{char, reading}`，目前選定的破音字讀音；換字時重置為 null |

### 輸入模式切換（注音 / 拼音 / 自動）
搜尋框右側按鈕，點擊循環：自動 → 注音（藍）→ 拼音（紫）→ 自動。
影響：搜尋路由（`queryIsBopomofo`）、字卡注音/拼音標記（`lastSearchType`）、AI 面板韻腳、破音字 chip 文字、右鍵選單標題。
拼音聲調統一用數字 1-5（輕聲=5）；詞讀音用 `-` 分隔且每音節首字大寫（例：`Hu2-Li2`）。
所有讀音顯示透過 `fmtPhonetic` 統一格式化，避免東漏一個西漏一個。

### 字卡 / 詞卡右鍵
- **字卡右鍵**：標題顯示字本體（大字），下方列出該字所有讀音（依 `polyphonicsOrderMap` 排序，套用當下顯示模式），末列為「🔤 建議讀音」 → prompt → `char-reading-report{reportType:'建議讀音', suggested}`
- **AI 詞卡右鍵**：標題同列顯示「詞 + 讀音」；選項末尾固定有「🔤 建議讀音」 → 預填當前讀音 → `word-report{reportType:'建議讀音', suggested}`
- 桌面右鍵 + 手機長按 500ms 觸發（事件委派在 `document` 上）

### AI 角色（優先選詞，不足時補造）
AI **優先從詞庫候選**中依情境挑選最多 24 個。候選詞 < 24 時直接全數列出，再由 `generateAIWords` 補造剩餘數量。候選詞充足時**不補造**，剩餘留給下一輪。

若 AI 第一輪挑回不滿 24（且非「同字」模式），**不隨機湊數**，改成第一輪結果先 render，再用同一個 model + 剩餘候選池發第二輪 prompt（候選詞同批，僅排除第一輪已選），第二輪結果 append 並更新 `.candidate-report` 標記「含補挑第二輪」。第二輪失敗則保留第一輪結果。Prompt 結構（詞庫路徑）：
```
你是歌詞創作助手。以下詞語的押韻符合要求，請挑選最適合此創作情境的詞語（一次24個）：
候選詞：[cumulativeCandidates，逗號分隔]
【情境與#標籤】（優先參考）：[contextFull]
【歌詞風格參考】：[lyricsText.slice(0,200)]
已保留（不可重複）：[savedWords.slice(-30)]
直接輸出詞語，頓號「、」分隔，不要說明或編號。
```

AI 補造詞（`generateAIWords`）會對回傳詞跑 `validateWordRhyme()` 驗證，並標上「AI」徽章。

### 單字模式 filter chips（押字尾 / 押字首）
搜尋單字時，模式按鈕改名為「押字尾」/「押字首」，並顯示三個 filter chip：

| Filter | 押字尾（韻母押） | 押字首（聲母押） |
|--------|----------------|----------------|
| 同聲調 | 末字聲調需與搜尋字相同 | 首字聲調需與搜尋字相同 |
| 同字 | 末字需與搜尋字完全相同 | 首字需與搜尋字完全相同 |
| 排除借韻 | 只匹配精確韻母，不含借韻家族 | 無效果（聲母本就精確匹配） |
| ⚙ 限字數 | 循環 chip：不限 → 2字 → 3字 → 4字+，限制詞長 | 同左 |

純拼音/注音韻母輸入（如 `an`、`ai`、`ㄢ`、`ㄞ`）：CJK 分支與非 CJK 分支都會對「無聲母」套用 fallback `effectiveInitial = ㄩ/ㄧ/ㄨ 介音 or rhyme`，押字首模式才有東西可押。

---

## 主要函式索引

### 字庫 & 搜尋
| 函式 | 說明 |
|------|------|
| `buildIndex()` | 啟動時從 rhymeDict 建立 chineseDict / charInfo 反查表（rhyme-dict.js 載入後同步執行） |
| `loadDictOverrides()` | 從 localStorage 載入使用者自訂字庫修改 |
| `reportMissingChar(char)` | 開 GitHub issue 回報缺字或建議；char 為空時開通用回報頁 |
| `searchRhyme(input)` | 核心搜尋：注音/拼音/漢字 → 押韻結果陣列；受 `inputMode` 控制路由 |
| `getZhuyinRhyme(zhuyin)` | 從注音拆出韻母 |
| `getZhuyinInitial(zhuyin)` | 從注音拆出聲母 |
| `moveCharTier(char, key, tier)` | 移動單字的分級（常用/一般/冷僻） |
| `cycleInputMode()` | 循環切換 inputMode（自動→注音→拼音），存 localStorage；呼叫 `_handleSearch` 重新觸發搜尋（確保破音字 chip 不被洗掉） |
| `loadPolyphonicsOrder()` | 背景 fetch `data/polyphonic-order.json` → `polyphonicsOrderMap` |
| `getCharAllReadings(char)` | 回傳字的所有讀音（按 polyphonicsOrderMap 排序），格式：注音+聲調符號 |
| `fmtPhonetic(baseZhuyin, tone)` | 依 `lastSearchType` 統一輸出含聲調的注音或拼音字串（拼音聲調為 1-5 數字，輕聲=5） |
| `getCharReadingsFormatted(char)` | 回傳字所有讀音的「顯示用」字串陣列，已套用 `fmtPhonetic` + polyphonicsOrderMap 排序 |
| `zhuyinToPinyin(zhuyin)` | 注音→拼音；純聲母（ㄓ/ㄔ/ㄕ/ㄖ/ㄅ…）走 `zhuyinInitialToPinyin` |
| `isPolyphonic(char)` | 判斷是否為真·破音字（chineseDict 中有多個 baseZhuyin） |
| `renderPolyphonicChips(char)` | 在 `.results-header` 下方插入破音字讀音 chip 列；非破音字直接 return |
| `selectPolyphonicReading(char, reading)` | 點擊 chip → 更新 `_polyphonic` → 重新 render chips + updateAIRhymeDisplay |
| `_handleSearch(val)` | 統一 input / compositionend 的搜尋入口；負責重置破音字選擇、呼叫搜尋、render chips |

### 詞庫 & AI 建議
| 函式 | 說明 |
|------|------|
| `loadWordlist()` | Boot 階段背景預載 10 個 chunk；優先從 IndexedDB 讀快取；進度顯示 X/10 |
| `_idbOpen/Get/Put()` | IndexedDB 操作封裝 |
| `updateWordlistProgress(loaded, total)` | 更新 AI 面板進度文字 |
| `filterWordsByRhyme(rhymes, targetLen, minP, max)` | 多字押母音：每個位置對應韻部家族 |
| `filterWordsByInitial(rhymes, targetLen, minP, max)` | 多字押子音：每個位置對應聲母 |
| `filterWordsByRhymeSingle(char, minP)` | 單字押字尾：末字韻母 + filter chips（同聲調/同字/排除借韻） |
| `filterWordsByInitialSingle(char, minP)` | 單字押字首：首字聲母 + filter chips |
| `getWordlistCandidates(rhymes, len)` | 多字韻母押：逐層嘗試 [30,10,1] |
| `getWordlistCandidatesInitial(rhymes, len)` | 多字聲母押：逐層嘗試 [30,10,1] |
| `getWordlistCandidatesSingle()` | 單字模式：依 rhymeMode 選用對應 filter |
| `resetSuggestedPool()` | 清空 suggestedPool / sentCandidatesSet / cumulativeCandidates 並清除詞卡容器 |
| `generateAISuggestions()` | 主流程：取詞庫候選 → 累積到池 → 呼叫 AI 選詞 → 渲染詞卡；不足24個時呼叫 generateAIWords 補造 |
| `generateAIWords(remaining, container, excludeSet)` | AI 補造詞：直接 prompt AI 生成，並用 validateWordRhyme 驗證後標「AI」徽章 |
| `validateWordRhyme(word)` | 驗證詞語是否符合當前韻腳（按 currentRhymes + rhymeMode 判斷） |
| `getWordPhoneticDisplay(word)` | 整詞讀音顯示字串；注音用雙空白分隔、拼音用 `-` 分隔且每音節首字大寫 |

### 顯示 & UI
| 函式 | 說明 |
|------|------|
| `displayResults(results)` | 將搜尋結果渲染成韻部分組卡片 |
| `createCharCard(item, ...)` | 建立單一字卡 HTML（含聲調顏色標記） |
| `updateModeButtonLabels()` | 按 currentRhymes 長度切換按鈕文字＋顯示/隱藏 filter row |
| `toggleFilter(name)` | 切換 filter chip 狀態，清空 suggestedPool |
| `batchMark(action)` | 批量標記常用/冷僻/清除 |

### 三個面板
| 函式 | 說明 |
|------|------|
| `toggleLeftPanel()` | 左側歌詞面板展開/收起 |
| `toggleRightPanel()` | 右側 AI 面板展開/收起 |
| `toggleContextSection()` | 情境＆標籤收折（flex-basis 動畫），存 localStorage |
| `toggleSavedPool()` | 保留池收折（flex-basis 動畫），存 localStorage |

### 左側：歌詞段落
| 函式 | 說明 |
|------|------|
| `renderLyricsSections()` | 渲染所有段落。所有段落統一帶 header（index 0 預設標題「歌詞」，無刪除鈕） |
| `saveLyrics()` | 從 DOM 回存 lyricsSections（含 collapsed 狀態）到 localStorage |
| `addLyricsSection()` | 新增 `{label:'新段落', text:'', collapsed:false}` |
| `removeLyricsSection(i)` | 刪除第 i 個段落（i>0 才有刪除鈕） |
| `toggleLyricsSection(i)` | 折疊/展開段落，CSS `flex` transition 動畫 |
| `onSectionHeaderClick(e, i)` | Header 點擊 handler（排除 label / remove 按鈕區域） |
| `enableSectionLabel(input, e)` | 雙擊標題 → 解除 readonly 進入編輯 |
| `disableSectionLabel(input)` | blur → 恢復 readonly + saveLyrics |
| `onSectionDragStart/Over/Leave/Drop/End` | HTML5 drag & drop 重排段落順序 |
| `exportSession()` / `importSession(ev)` | 存檔/讀取，JSON 包 lyricsSections / hashtags / savedWords / contextDescription |

### 左側底部：情境 & 標籤
| 函式 | 說明 |
|------|------|
| `renderHashtags()` | 渲染標籤 chip |
| `generateContextFromLyrics()` | 讀取歌詞（優先反白選取）→ AI → 自動填入情境 + 標籤 |

### 右側：AI 建議
| 函式 | 說明 |
|------|------|
| `updateAIRhymeDisplay(input)` | 搜尋後偵測所有 CJK 字元的韻腳，更新 `currentRhymes[]`；多字詞優先查 `wordPhoneticMap` 取正確讀音 |
| `renderRhymeDisplay()` | 根據 `rhymeMode` 和 `lastSearchType` 渲染韻腳顯示（注音/拼音跟隨輸入模式） |
| `setRhymeMode(mode)` | 切換押韻模式，重新渲染韻腳顯示 |
| `callLLM(model, prompt)` | 統一三家 API（Gemini / GitHub Models via Worker / Groq via Worker） |
| `saveWord(word)` | 點擊 AI 詞卡 → 移入保留池 |
| `renderSavedWords()` | 渲染保留池（顯示數量 badge） |

---

## AI 整合重點

### 模型清單（強→弱，自動 fallback）
定義在 `LLM_MODELS`。`autoFallback:false` 的只有手動選才會用，不會出現在自動降級鏈。預設起點：`gpt-4.1`。

| 模型 ID | 提供商 | autoFallback |
|---------|--------|--------------|
| gpt-4.1 | github | true（預設起點） |
| gpt-4.1-mini | github | false |
| gpt-4o | github | false |
| Mistral-Medium-2505 | github | true |
| DeepSeek-V3-0324 | github | true |
| DeepSeek-R1 | github | false |
| Llama-4-Maverick-17B-128E-Instruct-FP8 | github | true |
| Llama-4-Scout-17B-16E-Instruct | github | false |
| gemini-3-flash-preview | gemini | true |
| gemini-3.1-flash-lite | gemini | false |
| gemini-2.5-flash | gemini | false |
| gemini-2.5-flash-lite | gemini | false |
| gemini-3.1-pro-preview | gemini | false |
| Groq 系列（qwen3-32b / llama-4-scout / llama-3.3-70b） | groq | false（hidden） |

### API key 管理
- **所有模型（含 Gemini）全部走 Cloudflare Worker 代理**（`WORKER_URL`）
- Worker URL：`https://lucky-hawaii.is3000dollar.workers.dev`，僅接受來自 `https://andy-coin.github.io` 的 Origin
- `getApiKey()` 對所有 Worker 代理的 provider 回傳 `'worker-managed'`（視為 key 已存在）
- Gemini 請求由 Worker 代理後，回傳**原生 Gemini 格式**（`data.candidates[0].content.parts[0].text`）；其他 provider 回傳 **OpenAI 格式**（`data.choices[0].message.content`）

---

## 開發者工具（本機用）

| 腳本 | 說明 |
|------|------|
| `scripts/build_wordlist.py` | 從 vChewing + libchewing GitHub 下載並合併詞庫 → `wordlist.json` + `wordlist-c00~c09.json` + `wordlist-meta.json` |
| `scripts/merge_corelib.py` | 將小麥注音 `data-plain-bpmf.txt` 中缺少的字補進 `data/core library.txt` 冷僻區 |
| ~~`admin/apply_changes.py`~~ | 已退役。後台「匯出 agreed」也已移除（有程式碼注入風險），改由 `tools/corrections/writeback.py`（`npm run corrections:writeback`）把線上修正層寫回 data/ |
| `admin/woker.js` | Cloudflare Worker 本地副本，改完要手動部署 |

### 字庫更新流程

```bash
# 1. 合併小麥注音補字（需先把 data-plain-bpmf.txt 放在 ~/Downloads/）
python3 scripts/merge_corelib.py

# 2. 重新產生 JS 格式供網頁載入
python3 -c "
import json
data = json.load(open('data/rhyme-dict.json', encoding='utf-8'))
open('data/rhyme-dict.js', 'w', encoding='utf-8').write('var _rhymeDictData = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';')
"

# 3. 重建 AI 詞庫（需要網路）— 自動產生 chunks + meta，IDB 快取自動失效
cd '/Users/Shared/Claude/Lucky Hawaii'
python3 -X utf8 scripts/build_wordlist.py
```

---

## 初始化行為

- **歌詞全空時**：頁面載入若所有段落 text 皆空，自動清除情境描述與標籤

---

## 存檔 / 讀取

`exportSession()` / `importSession(event)`，匯出/匯入 JSON 檔：

| 欄位 | 說明 |
|------|------|
| `lyricsSections` | 所有歌詞段落（含 collapsed 狀態） |
| `hashtags` | 情境 #標籤 |
| `savedWords` | 📌 保留池 |
| `contextDescription` | 情境描述 textarea |

---

## localStorage keys

| Key | 內容 |
|-----|------|
| `haiku_hashtags` | 情境標籤陣列 |
| `haiku_lyrics` | 歌詞段落 `{label, text, collapsed}[]` |
| `haiku_savedwords` | 保留池詞語陣列 |
| `dictOverrides_v076` | 使用者修改過的字庫條目 |
| `leftPanelCollapsed` | 左側面板狀態 |
| `rightPanelCollapsed` | 右側面板狀態 |
| `contextSectionCollapsed` | 情境＆標籤收折狀態 |
| `savedPoolCollapsed` | 保留池收折狀態 |
| `selectedModel` | 目前選用的 LLM model id |
| `haoYunQi_inputMode` | 輸入模式（auto/zhuyin/pinyin） |
| `haoYunQi_*` | 主題/顏色設定 |

---

## IndexedDB

| DB | Store | Key | 說明 |
|----|-------|-----|------|
| `haoYunQi` (v1) | `wl` | `0`~`9` | 詞庫各 chunk 陣列 |
| | | `ver` | 快取版本號（來自 wordlist-meta.json） |

---

## 響應式

### clamp 縮放（桌面）
main header / 搜尋框 / options 列套 `clamp()`，隨視窗寬度平滑縮放。

### 縮放 +/- 按鈕（桌面與手機共用）
左上角 `.m-zoomIn-button` / `.m-zoomOut-button` + `.m-zoom-value`，`zoomIn()/zoomOut()` 對 `resultsSection` 套 `style.zoom`。原本桌面用的 `.zoom-control` 滑桿已隱藏。

### Header 佈局
- 客製顏色控制統一在「偏好設定」modal 內（`sBgColor1 / sContainerBg / sTextColor / sHighlightColor`）；header 上的 `.color-panel` 已隱藏
- 深色模式 `.theme-toggle` 在右上 `.controls`；左上是縮放 +/- 按鈕

### 手機底部 Tab 導覽列（≤ 900px）

| 元素 | 說明 |
|------|------|
| `.mobile-tab-bar` | `position:fixed; bottom:0`，三個 tab：🔍搜尋 / 📝歌詞 / ✨AI |
| `.mobile-backdrop` | 半透明遮罩，點擊關閉面板 |
| `.side-panel`（≤900px） | `bottom:0; height:78vh; border-radius:20px 20px 0 0` |
| `mobileTab(tab)` | 管理 collapsed class + backdrop + tab active 狀態 |

---

## 回報系統 / Cloudflare Worker / Admin 後台

資料儲存於 Cloudflare KV (`USER_FEEDBACK_KV`)，由 Worker (`admin/woker.js`，本地副本、gitignored、改完要手動部署) 處理。Worker URL：`https://lucky-hawaii.is3000dollar.workers.dev`。後台 UI：`https://andy-coin.github.io/Lucky-Hawaii/admin/`（key 存 `localStorage haoYunQi_admin_key`，主題存 `haoYunQi_admin_theme`，配色與主程式同套）。

### Worker Endpoints
| Path | Method | 用途 |
|------|--------|------|
| `/feedback` | POST | 主程式提交回報（需來自 `ALLOWED_ORIGIN`） |
| `/reports.json?key={USER_REPORT_KEY}` | GET | admin 後台拉取 KV 全部資料，每筆帶 `kvKey` |
| `/reports/decision?key={USER_REPORT_KEY}` | POST | body `{kvKey, status, action?}`，把 status/action/decided_at 合併寫回該筆 KV value |
| `/reports` | GET | 已退役（410 Gone），請改用 `/admin/` |
| 其他 | POST | LLM proxy（Gemini / GitHub Models / Groq） |

### KV value 結構
- Key: `${Date.now()}_${rand4}`
- Value（POST body + 系統補欄位）：
  - `ts`：ISO 時間戳（feedback 寫入時加）
  - `type`：`word-report` / `char-reading-report` / `feedback` / `ai-word-suggest`
  - + 各 type 的內容欄位（見下）
  - admin 操作後合併：`status` (`pending` 不寫 / `agreed` / `dismissed` / `archived`) + `decided_at` + `action`（agreed 時帶）

### 主程式送出的回報 type
| type | 欄位 | reportType / 子型 | 觸發 |
|------|------|---|------|
| `word-report` | `word, reportType` | 押韻錯誤 / 詞不存在 / 重複出現 / 極度冷僻 | AI 詞卡右鍵（一般詞庫詞） |
| `word-report` | `word, reportType='缺字'` | 缺字 | `reportMissingChar()`（韻腳顯示∅按鈕） |
| `word-report` | `word, reportType='建議讀音', suggested` | 建議讀音（詞） | 任一詞卡右鍵末列「🔤 建議讀音」 |
| `char-reading-report` | `char, reading, reportType` | 讀音錯誤 / 極度冷僻 | 破音字 chip 右鍵 |
| `char-reading-report` | `char, reportType='建議讀音', suggested` | 建議讀音（字） | 字卡右鍵末列「🔤 建議讀音」 |
| `feedback` | `subject, body` | （subject 含「缺少讀音」會被 admin 特判） | 意見回饋 modal、破音字 chip「缺少讀音」 |
| `ai-word-suggest` | `word, action: 'accept'\|'modify', modified?` | — | AI 詞（有 `.ai-badge`）右鍵：建議直接收錄 / 修改後收錄 |

> ⚠️ `ai-word-suggest` 的 `action` 欄位會跟 admin 的 `decision.action` 撞名，admin 端在 `normalizeAISuggest()` 改名為 `r.action_kind`。

### Admin 動作（agreed 時送的 action.type）
| action.type | 觸發按鈕 | 對應 reportType | payload 欄位 |
|---|---|---|---|
| `hide_char_reading`   | 🙈 隱藏（讀音）  | 讀音錯誤 / 極度冷僻 | `char, dict_key, reading` |
| `remove_char_reading` | 🗑 移除（讀音）   | 讀音錯誤 / 極度冷僻 | `char, dict_key, reading` |
| `fix_char_reading`    | ✏️ 修正 / ✓ 採用建議 | 讀音錯誤 / 建議讀音 | `char, old_reading/dict_key, new_reading/dict_key` |
| `manual_add_reading`  | ✓ 同意新增（讀音）| feedback「缺少讀音」 | `char, new_reading, new_dict_key, to_tier` |
| `hide_word`           | 🙈 隱藏（字卡）  | 押韻錯誤 / 詞不存在 / 極度冷僻 | `word` |
| `remove_word`         | 🗑 移除（字卡）   | 押韻錯誤 / 詞不存在 / 極度冷僻 | `word` |
| `fix_word_reading`    | ✏️ 修正注音 / ✓ 採用建議 | 押韻錯誤 / 詞不存在 / 建議讀音 | `word, new_z` |
| `manual_add_word`     | ✓ 新增（可編輯）  | 缺字              | `word, z, tier` |
| `accept_ai_word`      | ✓ 同意收錄        | ai-word-suggest (accept) | `word` |
| `modify_ai_word`      | ✓ 同意修改後收錄  | ai-word-suggest (modify) | `original, modified` |
| `note`                | 📝 備註           | feedback 一般     | `text`（status 仍 `agreed`，只是備註，不影響詞庫） |

### Admin 端機制
- **inline edit panel**：點「修正 / 備註」展開卡片下方輸入框（`_editing = {kvKey, op, ...}` 同時只一張）
- **新增 modal**：缺字 / 缺少讀音共用，動態切換標題與欄位
- **archive**：軟封存，預設不顯示，topbar toggle 可看回（已封存數即時計算）
- **寫回資料檔**（舊的「匯出 agreed」按鈕與它產生的 `apply_changes_*.py` 已移除；由 `tools/corrections/writeback.py` 取代）：把線上修正層**累積追加**寫進兩個 overrides 檔（不動原始字庫/詞庫）：
  - `data/wordlist-overrides.json`（schema v2，分區）：`{version:2, removed:[word,...], hidden:[word,...], fixed:{word:z,...}, added:[{w,z,tier,...},...], updated_at}`
  - `data/rhyme-dict-overrides.json`（schema v2，分區）：`{version:2, removed:[{char,dict_key},...], hidden:[...], fixed:[{char,from,to,tier?},...], added:[{char,reading,dict_key,tier,...},...], updated_at}`
  - 自訂排版：removed/hidden 字串陣列 10 個換行；fixed/added 逐條換行（diff 友善）
  - 審計記錄不入 JSON，全部寫進 `data/applied-changes.log`
  - 執行：`npm run corrections:writeback`（先預覽，確認後才寫入；細節見 worker/DEPLOY.md）
  - 前端 merge：
    - `applyRhymeDictOverrides()`（index.html，loadDictOverrides 下方）：boot 時跑完 buildIndex 後背景 fetch、就地改 `rhymeDict`、若有變動再 buildIndex 一次。`removed`/`hidden` → 從 dict_key 拿掉該字；`fixed` → 從 from 搬到 to；`added` → 依 tier 注入
    - `applyWordlistOverrides()`（loadWordlist 末段 await 呼叫，不存 IDB）：`removed`/`hidden` → Set 過濾 wordlistData、同步刪 priority/phonetic Map；`fixed` → 覆蓋 entry.z + wordPhoneticMap；`added` → z 為空或含 `?` 一律跳過
  - `accept_ai_word` / `modify_ai_word`：admin 在 AI 詞卡內嵌注音輸入框（用 `rhyme-dict.js` 自動反查每字第一個讀音預填，缺字顯示 `?` 並 highlight），同意前可手動修正破音字 → 帶 `z` 一起送進 action

## 版權

詞庫資料來源：**libchewing Core Team**，授權條款：**LGPL-2.1-or-later**
（`data/wordlist*.json` 由 `scripts/build_wordlist.py` 從 tsi.csv 建置）
