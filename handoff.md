## 🔄 第二輪三線並行（2026-11-12 下午，基準 1cc4407，進行中）
## ▶ R2 BYOK 用自己的金鑰（2026-11-12，worktree `Lucky Hawaii-wt-byok`，分支 r2/byok，沒 push、`?v=` 沒升）

- `js/ai-client.js`：最上面 `BYOK_PROVIDERS`（Gemini 3.5 Flash-Lite／3.8 Flash、Groq GPT-OSS 20B／120B，含用量格）；`callLLM` 遇到 `byok:` 開頭的模型改走 `_callByok` 直連（Gemini 用 x-goog-api-key、Groq 用 Bearer），錯誤經 `_byokErrorMsg` 轉白話，不退回 Worker；自製下拉 `_renderModelPicker`／`modelPickerOpen`（隱藏的 `#modelSelect` 仍是值的來源）；鑰匙 `_syncKeyBtn`、`lhOpenAiPrefs`；AI 分頁 `byokSaveKey`／`byokTest`。舊 `saveApiKey` 空殼已刪。
- `index.html`：AI 面板標題（約 437 行）鑰匙＋自製下拉；偏好設定新增 `#prefsTab-ai`／`#prefsPanel-ai`（約 167、208 行），拿掉「查詢與詞庫」裡 Groq 那行。`js/search-ui.js` 切到 ai 分頁時重填金鑰欄。
- `css/panels.css` 檔尾 BYOK 區塊（鑰匙沿用 `lhPulse` 呼吸，不新增 @keyframes）。
- 測試：新增 `tests/byok.spec.mjs`（11 題，page.route 攔服務商）；`prefs-tabs`、`layout`、`line-analysis-ui`、`ai-client` 跟著改成六分頁＋自製下拉。截圖腳本 `tests/_shots-byok.mjs`（不進版本）→ `r2-shots/byok-*`。待決 → `R2-byok.md`。

## ▶ R2 偏好設定分頁（2026-11-12，worktree `Lucky Hawaii-wt-prefs`，分支 r2/prefs，沒 push、`?v=` 沒升）

- 偏好設定改成五個分頁（`index.html` 約 159～210 行的 `#prefsTabs`、`.prefs-panel`）：外觀／查詢與詞庫／韻腳與句構（`#mapSettingsSection` 本身就是 tabpanel）／資料與備份／說明與回饋。切換邏輯 `lhPrefsSelectTab` 在 `js/search-ui.js` 的 `toggleSettings` 底下（記住上次的分頁、方向鍵、Home、End）；背景動畫開關 `#prefsBgFx` 等主題那條分支的 `lhBgFxSet`／`lhBgFxGet`。
- `js/rhyme-map.js`：「韻腳 ▾」選單拿掉「關閉韻腳設定」；點外面收起（pointerdown）、焦點移出也收起（focusout）；`lhMapOpenPrefs` 改成切到 `map` 分頁。
- CSS：`css/base.css` 的 `.settings-dropdown` 改成固定高度、不捲，捲的是 `.prefs-panel`；`css/panels.css` 預覽 sticky `top: 0`。
- 測試：新增 `tests/prefs-tabs.spec.mjs`、`rhyme-map-ui` 加了點外面的測試（滑鼠、觸控、焦點）；舊測試改成先切分頁。待決事項在 `R2-prefs.md`，截圖在 `r2-shots/`。

## 🌙 夜間三線並行（2026-11-12，分支 overnight/2026-11-12，進行中）

- Andy iPad 回饋第二輪，三個 subagent 各在 worktree 做，完成後由主 session 合併、升 `?v=`、push 到 gsd/v0.96-stabilize：
  - `../Lucky Hawaii-wt-theme`（r2/theme，埠 4321）：四主題 City／Midnight／Moon／Plain＋自訂，右上角鈕五個循環；多重點色；面板紋理；背景飄字動畫（`lhBgFxSet`）。參考圖 `~/Dropbox/#2ndy Own/zzZ/color theme reference/*.png`。待決 → `R2-theme.md`
  - `../Lucky Hawaii-wt-editor`（r2/editor，埠 4322）：浮動完整歌詞編輯器（電腦：展開鈕＋雙擊；手機平板：點歌詞自動彈出）含拖曳／新增段落／歌曲分頁；新增段落移到標籤情境與段落之間；iPad 收起間距；新段落高度跳動。待決 → `R2-editor.md`
  - `../Lucky Hawaii-wt-prefs`（r2/prefs，埠 4323）：韻腳選單拿掉「關閉」、點外面自動關；偏好設定改分頁，「更多設定」直達韻腳分頁；外觀分頁接背景動畫開關。待決 → `R2-prefs.md`
- **排隊（等 r2/prefs 合併後做）BYOK**（Andy 2026-11-12 指定）：
  - 偏好設定「AI」分頁：選服務商（Gemini、Groq）＋貼金鑰＋測試連線；有金鑰就直連服務商，沒有照舊走 Worker；金鑰沿用 `apiKey_<provider>`（safety.js 已設為機密，不進備份）；`js/ai-client.js:7` 的 `saveApiKey` 是舊空殼可接上
  - 右上「AI 建議」標題右邊：無外框的低調鑰匙 icon 鈕；沒用自己金鑰時靜止，有用時閃爍（尊重減少動態）；點了開設定到 AI 分頁
  - 有金鑰時模型下拉補上該服務商最新模型（實作時上網查最新清單），每個選項靠右顯示 Wi-Fi 訊號格狀的用量圖示（解讀：吃額度的多寡，待 Andy 確認）
  - 設定頁簡短說明＋教學影片連結：Google 免費金鑰 https://www.youtube.com/watch?v=Upk-iMyC3aM 、Groq 免費金鑰 https://www.youtube.com/watch?v=nt1PJu47nTk
  - ✅ 已驗證（2026-11-12 curl）：Groq（ACAO *）與 Gemini（ACAO 回 andy-coin.github.io）都允許瀏覽器直連，401／400 錯誤回應也帶 CORS 標頭 → 兩家都直連，不經 Worker
  - 用量圖示＝吃額度多寡（Andy 已確認）
- 注意：上一輪 `overnight-shots/` 新舊對照圖清 worktree 時被刪（主 session 失誤），需要時從舊 commit 重拍

## ✅ 夜間三線並行完成（2026-11-12，已 push 到 origin/gsd/v0.96-stabilize c8ad4ce；main 沒動）

- 三條都已合併：rhyme（3-a 標點／空格前算句尾、3-b 雙押多押、1-e 色票依底色亮度）、lexicon（自建潮流詞庫 3,118 詞 `data/slang/words.json`、來源 `tools/lexicon/slang/*.tsv`、`js/wordlist.js` 疊加）、ui（紙墨重設計、AI 參考狀態列、7 步導覽 `js/tour.js`、標籤 inline 多筆＋板塊移到歌詞上面）
- `?v=` 0.96.16；`npm test` 1062 過／29 跳過／0 失敗；`npm run lexicon:test` 265 過
- 主 session 早上補修：手機情境框被 `.context-section` 的 max-height 42% 裁掉 → `css/responsive.css` 手機段改成整個 `.lyrics-main` 一起捲（測試改量 `lhSecScroller()`）；導覽箭頭被 `.tour-card` 的 overflow 裁掉 → `css/panels.css` 約 2000 行，捲動改到 `.tour-body`，箭頭放大＋同亮框色
- 待 Andy：iPad 實測；三份待決清單 `OVERNIGHT-rhyme.md`（8 題）、`OVERNIGHT-lexicon.md`（6 題）、`OVERNIGHT-ui.md`（7 題）；雲端 `npm run visual:update` 更新 -linux 截圖
- 2026-11-12 下午（1cc4407，已 push）：Andy iPad 實測回饋——
  - 標題被按鈕壓住 → `css/base.css` 約 345 行：`.header` 設成容器，工具列只有在標題區夠寬時（滑鼠 25rem、觸控 42rem）才疊在兩角，不夠寬就排在標題上面一列
  - 左欄擠成兩排 → `css/panels.css` 約 266 行：左欄寬度 < 24rem 時匯出／新增段落只留圖示（`index.html` 加 `.btn-label`）、歌名讓位
  - 復原／重做換 SVG 彎箭頭（`index.html` #undoBtn／#redoBtn；`js/tour.js` 說明文字改「兩個箭頭」）
  - 順手修：鏡像層同步捲動會誤收浮動列（UI 重設計後輸入框變矮才冒出來，測試約 6 成失敗）→ `js/rhyme-map.js` 約 1229 行忽略 `.rhyme-mirror` 的 scroll
  - 待 Andy：iPad 再測一次；三欄在 iPad 橫向仍偏擠，可考慮「平板一次只開一側面板」
- worktree `../Lucky Hawaii-wt-{ui,lexicon,rhyme}` 還留著（ui 的 `overnight-shots/` 有新舊對照圖），確認後可 `git worktree remove`

## Docker 開發容器

- 已設定完成，容器名稱：`lucky-hawaii-dev`
- 使用 `./start.sh` 啟動，`./enter.sh` 進入，`./stop.sh` 停止
- Pi Agent 預設連 ToshLLM (Qwen3.6)，profile: IQ50
- `.devcontainer/docker-compose.yml` 的 ports 預設註解，web server 專案需取消註解

## ▶ 夜間 overnight/rhyme（2026-11-12，worktree `Lucky Hawaii-wt-rhyme`，沒 push、`?v=` 沒升）

- 完成：A 標點／空白前的字也算句尾（`js/rhyme-core.js` `lhRhymeTargets`）；B 雙押／多押（`lhRhymeTailRhymes`、`lhRhymeMulti`，`js/rhyme-map.js` `_lhMapBuildFrag` 畫 `.rm-multi`／`.rm-mx`，統計 `.rm-sum-multi`，偏好設定開關 `multi`）；C 新色票＋依卡片底色亮度選組（`_lhMapMeasureBg`）。
- 數字：`npm test` 1047 過／29 跳過／0 失敗；perf 3 過（高負載時連原程式都會超標，重跑過）。
- 待 Andy：`OVERNIGHT-rhyme.md` 8 題（字母要不要按小句、空白算不算句尾、雙押開關位置、新配色…）。

## ✅ Phase 11 句構分析與設定頁：8/8 計畫完成（2026-10-28，分支 gsd/v0.96-stabilize，沒 push；夜間 `/gsd-autonomous --from 10 --to 11`，停在這裡等 Andy）

- 狀態：Phase 10 收尾 ✅（審查 0 嚴重／3 警告全修）；Phase 11 計畫 11-01～11-08 全部做完；審查 0 嚴重／1 警告已修（03709a9：`js/sections.js:90` `lhSecRefreshMeta` 呼叫新的 `lhMapOnSectionsChanged`（`js/rhyme-map.js`），段落改類型／名稱／順序後 ≠ 跟著換）；驗證 3/3 → human_needed，`11-UAT.md` 7 項，下一步 `/gsd-verify-work 11`。GSD 的狀態、決策、各計畫摘要看 `.planning/phases/11-line-analysis-settings/`，這裡只記 GSD 沒記的。
- 數字：`npm test` **1038 過／29 跳過／0 失敗**；`LH_PERF=1 npx playwright test tests/rhyme-map-perf.spec.mjs --workers=1` 3 過（150 行連打與全部標記開著連打最長任務 0 ms、200 行分析中位數 0.4 ms）；截圖 -darwin 全部沒變（預設沒有新畫面），-linux 沒動。
- 新檔：`js/line-core.js`（字數、斷句、對照純函式）；`js/rhyme-map.js` 加逐行標記 `_lhMapMarker`（約 103 行）、偏好設定區塊 `lhMapPrefsBuild`（約 555 行）、分析面板 `lhMapAnalysisBuild`／`_lhMapAnContent`（約 1288 行）、反白停留 `_lhDwellArm`（約 1216 行）；`css/panels.css` 約 1450～1760 行是新樣式（靠右欄、`.lm-*`、`.rm-colors`、預覽）。
- 11-08 補的檢查在 `tests/line-audit.spec.mjs` 後半（列印與匯出、惡意文字、不拼 HTML、setProperty 位置與無動畫、舊資料、顏色以外的線索）；唯一動到產品程式的是 `js/rhyme-map.js` 約 623 行，色票 input 監聽改成具名函式 `_lhMapColorInput`（讓掃描找得到），行為沒變。
- 驗收清單已補：`.planning/TEST-CHECKLIST.md` Phase 11 一節（11-01-1…11-04-2、11-CTX-1…24）、`.planning/驗收清單-精簡版.md` 2-41～2-44、4-30～4-35、5-131～5-154，表頭題數 256。

**待 Andy 出手**
- 雲端容器執行 `npm run visual:update` 更新 -linux 截圖基準（第 5～11 階段累積）。
- 真機／真眼睛才能判斷的（精簡版 2-41～2-44、4-30～4-35）：≈ 自動斷句合不合語感（已知誤切：風吹過熟悉的街道 → 2+4+2、不怕前方的路遙 → 2+5，自己加空白可改）；手機 390 寬靠右欄留的寫字寬度；標記字級與淡色日夜好不好讀；濃淡三段、深色「濃」可讀性、孤句在「淡」；長按選整段的浮動列＋分析面板位置；反白停留 1.5 秒手感；iOS／Android 原生色票；偏好設定在手機會不會太長；Safari／Firefox 標記不改換行；iPad 接觸控板會不會誤觸。這些全都沒有被自動測試當成已驗證。
- 自主決定要點頭或搖頭（5-131～5-154）：最容易被推翻的是 ≈ 規則、預設靠右欄（36% 上限）、停留 1.5 秒預設關、「濃」＝40%、對照放每行下面一整列（不是 CONTEXT 說的多一欄）、「≈」只標猜的那一段（推翻 UI-SPEC D-04）、原生色票放在偏好設定而不是選單的色票對照（推翻 CONTEXT D3）。
- 尚未解決／要留意：Safari／Firefox 沒有可測的瀏覽器，標記垂直對齊與 `.lm-t-s` 的 `overflow: clip` 只在 Chromium 量過；`__lhMapReady` 要等字典＋歌曲＋詞庫三件事（詞庫沒好時只有字數與明確斷點，≈ 稍後補上）。Phase 12 需 Andy 指定詞庫組合，沒開始。

## ▶ 夜間自動執行（2026-10-23，`/gsd-autonomous` 從 Phase 9 起，Andy 授權自主決定）

- Phase 9 ✅（含審查修正 CR-01＋WR-01～05：0896b7d…4ceb60e，覆審 clean；`npm test` 847 過／27 跳過／0 失敗）；驗證 human_needed 5/5 → `09-UAT.md` 6 項
- Phase 10 韻腳地圖 ✅ 計畫 10-01～10-08 全部做完（待審查與驗證）；見下一節
- 刻意跳過：Phase 1／3 驗證報告「過期」沒重跑；Phase 12 需 Andy 指定詞庫組合；不 push、不部署

## ✅ Phase 10 韻腳地圖：8/8 計畫完成（2026-10-23，分支 gsd/v0.96-stabilize，沒 push）

- `npm test` **964 過／28 跳過／0 失敗**（Mac 的 Chromium，只比對 -darwin 截圖）；`LH_PERF=1 npx playwright test tests/rhyme-map-perf.spec.mjs --workers=1` **2 過**（150 行連打最長任務 0 ms、200 行分析中位數 0.30 ms）；`?v=` 全部 **0.96.14**（36 個標籤；10-03～10-07 改了 js/css 沒再升版，因為 0.96.14 從沒上線，發佈時一致即可），split-tags 的 JS_ORDER 28 支；`package.json`／`package-lock.json` 沒動
- 新檔：`js/rhyme-core.js`（純函式：共用判定 lhRhymeMatch、讀音優先序、句尾字、分析、統計、設定與讀音清洗）、`js/rhyme-map.js`（鏡像層上色、200 ms 排程、「韻腳 ▾」選單、浮動列、指定讀音、標題字母條、統計視窗、`lhMapCloseAll`）；`js/lyrics.js` 每段多一層 `div.rhyme-mirror` 與 `button.section-rhyme`；`js/safety.js` 登記 `lh:map` 並在 `lhNormalizeSong` 清洗 `readings`
- 新測試：`tests/rhyme-core|rhyme-parity|rhyme-map-ui|rhyme-map-perf.spec.mjs`，10-08 加 `rhyme-journey.spec.mjs`（整合：一次走完）與 `rhyme-audit.spec.mjs`（檢查：9 項，全部一次通過，沒有需要修的接縫）
- 10-08 的測試對應 App 既有規則的地方：(1) 浮動列開著時游標還在輸入框，別的分頁改歌要等離開輸入框才套用（第 8 階段規則）；(2) 同一段反白範圍收起後不會再出現（10-05 刻意）；(3) 用假詞庫時 AI 走「造詞」分支，請求內容不含歌詞，所以「AI 用整首歌」改驗 `generateAISuggestions` 執行當下的歌詞與反白
- 驗收清單已補：`.planning/TEST-CHECKLIST.md` Phase 10 一節（10-01-1…10-07-2、10-CTX-1…22）、`.planning/驗收清單-精簡版.md` 2-39～2-40、4-26～4-29、5-109～5-130，表頭題數 222

**待 Andy 出手**
- 在雲端容器執行 `npm run visual:update`，更新 -linux 截圖基準（本機只比對 -darwin；第 5～10 階段累積，第 10 階段新增「韻腳 ▾」按鈕）
- 真機驗收（機器量不到）：iPad／iPhone Safari、Android Chrome 的顏色在日夜／戶外的樣子、16＋1 色分不分得出來、孤句會不會太淡；長按選字後的浮動列和系統拷貝選單／把手有沒有打架；注音組字有沒有閃或卡；手機標題列字母條擠不擠、「韻腳 ▾」位置；Safari／Firefox 對齊與 iOS 慣性捲動
- 自主決定要點頭或搖頭（10-CTX-1～22）：B1 背景螢光筆、B2 嚴格模式顏色仍按韻族、B3 孤句較淡、C3 字母與統計預設關、D1 反白→浮動列而不是單擊、E1 了／的／嗎算語助詞、A3 手動讀音綁句尾 4 字；OQ1 嚴格下詩／知／字／思不同韻（寬韻歸空韻）、OQ2 人／風寬韻不同色、OQ6 多字選取一律查最後一字；D-06 組字／改句中時色塊先藏起來、D-10 改成從統計逐句查、D-11 沒有 hover 彈窗；計畫選擇：第 17 色中性灰、「指定讀音」按鈕與只在句尾出現、句中押韻略過語助詞、行尾字母等第 11 階段、浮動列 AI 建議送整首歌、讀音不算復原步驟、改設定所有段落一起重畫、Esc 後同範圍不再彈出、統計在長段落可能蓋住字母條
- 下一步：Phase 10 審查（`/gsd-code-review 10`）與驗證（`/gsd-verify-work 10`）；MAP-09／10／11 在第 11 階段

## ✅ Phase 9 段落模組：10/10 計畫完成（2026-10-23，分支 gsd/v0.96-stabilize，沒 push）

- `npm test` **843 過／27 跳過／0 失敗**（Mac 的 Chromium，只比對 -darwin 截圖）；`?v=` 全部 **0.96.13**（34 個標籤），split-tags 的 JS_ORDER 26 支
- 新檔：`js/sections-core.js`（純函式：類型、羅馬數字、字數）、`js/sections.js`（類型鈕、顏色／設定視窗、⋮⋮ 拖曳排序、拉桿調高度、`lhSecAbortInteractions`）、`js/undo.js`（每首歌一條復原堆疊）、`js/word-drag.js`（詞卡／字卡拖進歌詞）
- 新測試：`tests/sections-core|sections-ui|sections-drag|undo|word-drag.spec.mjs`，10-10 加 `sections-journey.spec.mjs`（整合：一次走完）與 `sections-audit.spec.mjs`（檢查：11 項）
- 10-10 挖出並修掉的縫：(1) `css/panels.css` 電腦上段落很多時被壓成只剩標題列 → `.lyrics-section:not(.collapsed)` 加 `min-height: 9rem`，列表自己捲；(2) `js/songs.js` `isEditingField` 只算文字欄位，焦點在 ⋮⋮ 把手時別的分頁的更新也會立刻套用並收掉手勢；(3) 「復原：只換一格」偶發失敗＝測試太早量瀏覽器自己的捲動動畫（產品正確），測試改成等動畫停（600 次連跑全過）
- 驗收清單已補：`.planning/TEST-CHECKLIST.md` Phase 9 一節（09-01-1…09-10-2、09-CTX-1…17）、`.planning/驗收清單-精簡版.md` 2-34～2-38、4-23～4-25、5-92～5-108

**待 Andy 出手**
- 在雲端容器執行 `npm run visual:update`，更新 -linux 截圖基準（本機只比對 -darwin；第 5～9 階段累積）
- 真機驗收（機器量不到）：iPad／iPhone Safari、Android Chrome 的把手拖曳手感、詞卡按住 0.4 秒再拖、手機拖詞自動切到歌詞分頁、名稱長按 0.5 秒開設定視窗；拉桿 44px 的高度成本可不可以接受（D-11）；色票在日夜客製主題的樣子；注音打字時字數與復原；iOS 搖一搖復原／Android 外接鍵盤復原；點 ↶ ↷ 時 iOS 鍵盤有沒有保持開著
- 自主決定要點頭或搖頭：B1 英文名稱、B2 單一類型不編號、B6 新段落猜類型、C5 刪除改復原提示條、E1 英文算一個詞、F1 字卡也能拖、F7 手機自動切歌詞、A3 舊歌匯出標題變英文、D-16（總字數在 .lyrics-tools 那一列）、D-10（↶ ↷ 用 aria-disabled）、收起面板時拖詞卡的提示、提示條按鈕邊框 currentColor、舊版單首模式不存顏色與高度、電腦段落很多時 9rem 下限、分頁更新只等文字欄位
- 注意（RESEARCH A1／A6）：若 iOS Safari 長按後拖詞卡時頁面還是會捲，備案是在 touchstart 就掛非被動的 touchmove 擋住並暫時加 `touch-action: none`
- 下一步：`/gsd-verify-work 09`（帶上面的真人項目）；之後 Phase 10 押韻上色

## ⏸ 暫停點（2026-10-11）：Phase 8 全部做完，依 Andy 指示停在這裡，尚未開始 Phase 9

- 已完成：Phase 6 審查＋驗證、Phase 7（10 計畫＋審查兩輪＋驗證）、Phase 8（9 計畫＋審查兩輪＋驗證）；三個階段都是「自動驗證全過、等 Andy 真人驗收」（06／07／08-UAT.md）
- 最新：`npm test` **716 過／27 跳過／0 失敗**；`?v=0.96.12`
- 本機 commit 很多都**還沒 push**（這台 SSH 下不能 push）→ Andy 回家後在終端機 `git push`
- 接續：`/gsd-autonomous --from 9`（Phase 9 段落模組）；或先 `/gsd-verify-work 06`／`07`／`08` 做真人驗收
- Phase 8 審查後補強（commit 8cba3ed…93afda4）：壞備份不再讓網站開不起來、還原時鎖住存檔、組字中不存半字、釘住的備份在沒有瀏覽器資料庫時也不被擠掉（`lh:backup:ls`／`ls2`／`ls3` 三格）、還原不動 API 金鑰、存不進去會出現提示、載入失敗仍可還原

## ✅ Phase 8 歌曲管理與資料模型：9/9 計畫完成（2026-10-11，分支 gsd/v0.96-stabilize，沒 push）

- `npm test` 688 過／27 跳過／0 失敗（Mac 的 Chromium；只比對 -darwin 截圖）。`?v=` 全部是 **0.96.12**（30 個標籤，split-tags 會檢查一致）
- 新檔：`js/songs.js`（歌曲模型、清單、改名、刪除）、`js/song-io.js`（匯出 TXT／Markdown／PDF／複製、備份全部、匯入、自動備份清單）、`css/print.css`；`js/safety.js` 多了備份檔解析與還原
- 新測試：`tests/songs-{migrate,model,ime,crosstab,ui,export,backup,delete}.spec.mjs`，加上 08-09 的 `songs-journey.spec.mjs`（整合：一整天流程）與 `songs-audit.spec.mjs`（檢查：長歌名、怪字元、觸控、焦點、顏色、對比、無障礙名稱）。整合與檢查沒有挖出需要改程式的缺口
- **舊分頁的風險（RESEARCH A8）**：升級前開著的舊版 v0.96 分頁不關的話，它會繼續寫舊的 `haiku_lyrics`，那些修改不會進新的歌曲資料。升級後請把舊分頁關掉或重新整理
- 舊鍵 `haiku_lyrics`／`haiku_hashtags` 升級後原封不動留著（當退路）；`lh:schema` 是 2；升級前有 baseline 與 pre-schema-2 兩份自動備份（永遠不會被擠掉）

**待 Andy 出手**
- 在雲端容器執行 `npm run visual:update`，更新 -linux 截圖基準（本機只比對 -darwin；08-05、08-06、08-07 只刷新了 -darwin）
- 真人驗收（機器量不到，`/gsd-verify-work 08` 會帶你走）：
  1. 注音輸入法組字的手感：macOS Chrome／Safari、iPad／iPhone Safari、Android Gboard，打字時不被打斷、游標不亂跳
  2. 長歌存成 PDF 的排版好不好看：頁與頁之間斷行、段落名不落單在頁底、沒被切邊
  3. iOS：下載檔名、從主畫面圖示開啟時能不能列印、複製整首進剪貼簿
  4. 手機：清單改名輸入框與刪除視窗搭配真的鍵盤；兩下確認的「還原這份」順不順
  5. 兩台真的不同的裝置之間，用備份檔還原一次
- 下一步：`/gsd-verify-work 08`（帶上面的真人項目），驗收清單已補在 `.planning/TEST-CHECKLIST.md`、`.planning/驗收清單-精簡版.md`

## ▶ 本機接續中（2026-10-09）

- 已 pull 雲端進度到本機（HEAD 與 origin/gsd/v0.96-stabilize 一致；Mac 鑰匙圈在 SSH 下不能用，pull 要在終端機輸入 token）
- Mac 截圖基準已建（05ebcce，15 張 -darwin.png）；`tests/layout.spec.mjs:1559` 搜尋框單行檢查改成比填字前後高度（2291d09，Mac 字型行高較高誤判）
- 本機 `npm test`：421 過／27 跳過，修完那 1 項後應全過；`lexicon:test` OK
- Phase 6 程式碼審查完成（06-REVIEW.md／06-REVIEW-FIX.md，.planning 本機不 commit）：WR-01～06 全修
  - WR-01 `tools/lexicon/lex/judge.py` `_checked_url` 改用解析後主機（56e1c94）；WR-06 同函式不合法網址改白話錯誤（1648db5）
  - WR-02 `js/wordlist.js` 換包失敗退回「最後真的載好」的包＋重跑搜尋，`?v=` 升 0.96.9（52fe5d4）
  - WR-03 judge 補問失敗保留已拿到的判斷（3b9d678）；WR-04 白名單補 裏銹鐧獴菓肽＋歐拉，詞庫包已重建（fca098d）；WR-05 校準詞表換掉與提示範例重複的 4 詞（69113b6）
  - 剩 IN-01～08 為 Info，未修
- 回歸關卡：`npm test` 423 過／27 跳過／0 失敗（注意：python 一律加 `-B`，tools/ 留 __pycache__ 會讓 lexicon-build 測試失敗）
- Phase 6 驗證：human_needed（3/5 自動過、2 項需真 AI），06-UAT.md 4 項；驗收清單更正 5-42／5-43、新增 3-15（高頻中國用語）；commit 952d24f
- 進行中：`/gsd-autonomous --from 7`
  - Phase 7 回報與修正層：10/10 計畫完成（commit 961f18a…a819f61），`npm test` 548 過／27 跳過／0 失敗，`corrections:test` 42 OK，`worker:smoke`／`worker:check` 過
    - Worker：`worker/src/corrections.js`（apply／revoke／clear／admin.json／公開 `/corrections.json`）、`adminKeyOk`（X-Admin-Key 優先）
    - 網站：`js/wordlist.js`、`js/dict.js` 兩段式套用＋`loadCorrections`（3 秒逾時略過）；`js/report.js` 🚩 回報視窗；`js/ai-word-events.js` AI 回報模式；頁尾「回報」改名「意見」；`?v=0.96.10`
    - 後台：`admin/index.html` 合併列、批次核准／駁回、🚀 套用到線上、撤回
    - 寫回腳本：`tools/corrections/writeback.py`（`npm run corrections:writeback`）
    - 驗收：精簡版 2-18～2-24、3-16～3-18、4-16～4-18、5-51～5-63；`-linux.png` 截圖基準 16 張待雲端 `npm run visual:update`
  - 下一步：Phase 7 code review（進行中）→ verifier → Phase 8
- 注意：這台不能 push（SSH 下鑰匙圈鎖住）；本機 commit 累積中，Andy 回家後自己 push

## ⏸ 雲端接力結束（2026-10-04，接回本機繼續）

- 分支 `gsd/v0.96-stabilize` 已全部 push；`main`（線上網站）沒動
- **Phase 5 多裝置版面**：11/11 計畫完成＋程式碼審查（3 輪修正）＋驗證（自動 5/5）；實機項目待 Andy → `/gsd-verify-work 05`（05-UAT.md）
- **Phase 6 台灣詞庫包**：8/8 計畫完成（LEX-01～07）。**尚未跑**：`/gsd-code-review 6`、phase 驗證（verifier）、`phase.complete`（為省雲端額度留到本機）
  - 本機接續：`/gsd-code-review 6 --fix --auto` → `/gsd-execute-phase 6`（會偵測到計畫全做完、直接進驗證）→ 再 `/gsd-autonomous --from 7`
  - 四個詞庫包：v0.96 現行（預設）、新酷音、小麥注音、唯音台灣精簡版；偏好設定可切換；`npm run lexicon:build` 重建、`tools/lexicon/reports/*/REPORT.md` 刪除報告
  - 灰色地帶約 3.36 萬詞「待 AI 判斷」：Mac 上 `GEMINI_API_KEY=… npm run lexicon:eval`（≥90%）再 `npm run lexicon:judge`（約 225 次請求，可續跑）
- `?v=` 目前 0.96.8；雲端 `npm test` 421 過／27 跳過／1 失敗（worker-config.spec.mjs:53 為雲端代理造成，Mac 上應全過）
- **Mac 第一次跑 `npm test` 前**：先 `npm run visual:update` 建立 Mac 版截圖基準（雲端只有 -linux.png，D-11）
- **一口氣驗收清單**：`.planning/TEST-CHECKLIST.md`（必測／建議測／待 Andy 決定 D-1～D-20／自主決定）
- **合併 main 前**：`git rm -r --cached .planning handoff.md .claude/CLAUDE.md`（見 CLOUD-RELAY.md）
- 授權注意（D-16）：v0.96 預設詞庫約 15 萬詞源自教育部 CC BY-ND 辭典；新詞庫包都不含

## GSD 狀態（以 .planning/ 為準）

- 2026-10-04 Phase 2 程式碼全部完成（6/6 計畫），`npm test` 218 項、`worker:check`、`worker:smoke` 皆過；**等 Andy 照 `worker/DEPLOY.md` 步驟 1–10 上線**（登入、填兩個 KV id、secret、部署、再合併分支更新網站、線上點一次 AI 建議）。Phase 1 安全網 ✅ 驗證 15/15
- **所有改動都在本機分支 `gsd/v0.96-stabilize`**，`main`（=線上網站）沒動、沒 push。Andy 測完再合併上線
- 測試：repo 根目錄 `npm test`（Playwright，約 1 分鐘，104 項）；golden 快照在 `tests/golden/`，刻意改資料才用 `npm run golden:update`
- 新檔：`js/safety.js`（儲存鍵清單、lhGet/lhSet、存檔失敗橫幅、IndexedDB v2 備份、遷移＋自動還原）
- 設定改動：`.planning/config.json` workflow.use_worktrees=false（.planning 被 gitignore，worktree 看不到計畫檔）
- 待 Andy 出手：Phase 2 `wrangler login` 瀏覽器授權＋正式部署；Phase 6 需免費 Gemini API key；Phase 12 需選定詞庫包組合
- 待 Andy 判斷：注音帶聲調輸入（ㄌㄞˊ）在 v0.96 查不到結果，是否為 bug（清單見 STATE.md Pending Todos）
- 注意：Gemini 2.5「10/16 退役」未被 Google 官方確認，已從清單移除（見 DEPLOY.md「先知道的事」）；新增 `npm run worker:smoke`（worker/test/dev-smoke.mjs，wrangler dev + 假供應商）

## Phase 3 拆檔完成（2026-10-04，分支 gsd/v0.96-stabilize，沒 push）

- `index.html` 只剩 352 行骨架；`css/` 3 檔、`js/` 21 檔（safety.js 在 head，其餘 20 個在 body 尾端，順序固定，init.js 夾在 theme 與 report 之間）；`npm test` 245 項全過
- 之後只要動到 `css/` 或 `js/`，部署前要把**所有標籤**的 `?v=` 一起加（split-tags 會檢查一致）
- `.claude/CLAUDE.md` 的架構行號還指向舊 index.html，可用 /gsd-map-codebase 更新（我沒動 CLAUDE.md）
- `js/ai-client.js` 裡還留著用不到的 `saveApiKey()`，照 CONTEXT 延後清理

## Phase 4 完成（2026-10-04，分支 gsd/v0.96-stabilize，沒 push）

- 04-05 做完：`js/wordlist.js` 詞庫載入改單一 Promise、快取單一交易整套換版（`_idbReadCache`／`_idbReplaceAll`，只刪數字鍵）、分段網址 `?v=`、缺段整份丟棄；`js/ai-generate.js` 詞庫沒好時顯示「詞庫載入中…」並等同一個載入，等待中換搜尋就作廢；`tests/wordlist-cache.spec.mjs` 4 項；`npm test` 269 項全過，golden 沒動
- **給 Andy 的試用清單（Worker 上線後，回「1.是 2.否…」）：**
  1. 用「心」「安」「愛」各按一次 AI 建議（押字尾），是否都剛好 24 個、詞夠好用？
  2. 切到押字首再試，是否接受「首字韻部相同」？（不接受就要改候選篩選）
  3. AI 挑不夠時，程式依詞頻補的詞是否可接受？
  4. 候選不足時 AI 造的詞是否都押韻？
  5. 剛開網頁就按 AI 建議，是否先看到「詞庫載入中…」再正常出詞？
- 行為變更：詞庫缺任何一段就整份不用，提示重新整理（以前默默用殘缺的）
- 已知上限：舊 loader 已混出來的快取會留到下次詞庫發新版（Phase 6）
- 仍待 Andy：Phase 2 Worker 部署（worker/DEPLOY.md），線上 AI 才會動
