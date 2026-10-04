# 詞庫清洗工具（tools/lexicon）

## 給 Andy：一句話版

一個指令，把多個授權相容的台灣詞庫自動下載、檢查授權、清洗成同一種格式的「詞庫包」，放進 `data/packs/`。

```
npm run lexicon:build
```

- 第一次執行要連網下載約 16 MB 的來源檔，放在你家目錄的 `~/.cache/lucky-hawaii/lexicon`（不在專案裡面，不會被 commit）。
- 之後再執行，快取還在就完全不連網，幾秒鐘跑完。
- 同樣的輸入重跑，輸出一個位元組都不會變，所以不會讓 git 多出無謂的修改。
- 需要 Python 3.9 以上（終端機輸入 `python3 --version` 可以看）。工具只用 Python 內建的功能，不用安裝任何套件。

## 什麼是「詞庫包」

網站查詞用的是一份大詞庫。詞庫包就是「一整份獨立的詞庫」，格式跟現行的 v0.96 詞庫一樣（每行一個詞：`{"w":詞,"z":注音,"p":次數}`），只是來源、清洗規則不同。現行的 v0.96 詞庫檔案原封不動，仍然是預設；新做的詞庫包放在 `data/packs/<名稱>/`，目前有：

| 詞庫包 | 來源 | 授權 |
|---|---|---|
| `v096`（現行，預設） | 現有檔案 `data/wordlist-c00..c09.json` | 見 `data/packs/v096/NOTICE.txt` |
| `chewing`（新酷音詞庫） | libchewing-data 的 `tsi.csv` | LGPL-2.1-or-later |

## 會產生哪些檔案

- `data/packs/index.json`：詞庫包清單（網站從第 06-02 計畫起讀它）。
- `data/packs/<名稱>/c00.json …`：依詞排序、每片 24,000 行的詞庫分片。
- `data/packs/<名稱>/meta.json`：版本、筆數、來源 commit、授權、建立日期。版本 = 規則版本 + 全部分片內容的雜湊前 10 碼，內容只要有變版本就跟著變。
- `data/packs/<名稱>/NOTICE.txt`：來源、授權、改作說明（繁體中文）；`LICENSE.*.txt`：授權全文（原文）。
- `tools/lexicon/reports/<名稱>/removed.ndjson`：被刪掉的詞與原因（每行一個詞，含注音與次數，可直接拿來「救回」）。
- `tools/lexicon/judgments/judgments.tsv`：灰色詞的 AI 判斷快取（見下面「灰色地帶 AI 判斷」）；還沒跑過 AI 時只有一行標頭。
- `tools/lexicon/reports/<名稱>/REPORT.md`、`stats.json`：給人看的刪除報告與機器讀的數字（見下面「刪除報告在哪裡、怎麼看」）。這些報告不在 `data/` 底下，網站不會讀取。

## 刪除報告在哪裡、怎麼看

每次 `npm run lexicon:build` 都會替每個新詞庫包重寫 `tools/lexicon/reports/<名稱>/REPORT.md`（繁體中文，用文字編輯器或 GitHub 打開都行）。從上往下看：

- **總覽**：範圍內的詞、保留、刪除、灰色（保留但待 AI 判斷）、略過的單字、多讀音詞各有幾筆；保留 + 刪除 = 範圍內的詞。
- **各原因統計與樣本**：每種刪除原因（R0 格式、R1 簡體字、R2 罕用字、R3 中國用語）共幾筆，並抽最多 20 個詞給你抽查有沒有誤刪。樣本是固定種子抽的，同一版本每次重建都一樣。
- **灰色地帶（待 AI 判斷）**：灰色詞數、估算的 AI 請求次數與 token（照每次 150 個詞估），以及灰色樣本；拿不準的中國用語（`rules/r3-gray.json`）會全部列出。
- **最常造成刪除的字**：害最多詞被刪的 20 個字；其中其實台灣正常在用的字，加進 `rules/char-allow.txt`。
- **中國用語對照表吻合但保留**：詞頻夠高所以不刪的詞。
- **多讀音詞選用的讀音**：一個詞有多個讀音時選了哪個。詞庫包保留辭典原本的聲調（例如「一下」是 ㄧ，v0.96 是 ㄧˊ），押韻比對不看聲調，所以不影響結果。

完整的被刪詞清單在同資料夾的 `removed.ndjson`。`stats.json` 是同一份數字的機器版，`verify` 會重算它（保留數要等於 `meta.json` 的筆數、刪除數要等於 `removed.ndjson` 的行數、各原因加總要等於刪除數），報告和詞庫包對不起來就會報錯。

## 誤刪了怎麼救回

兩種方式：

1. **一個指令（推薦，之後每次重建都會保留）**：

   ```
   python3 -B tools/lexicon/build.py rescue 詞
   ```

   可一次寫多個詞（輸入必須是 2～11 個漢字，否則停下來、什麼都不寫）。它會把詞加進 `rules/keep.json`（排序、不重複），並列出每個刪掉這個詞的詞庫包、規則與原因，以及一行 `{"w":…,"z":…,"p":…}`。然後執行 `npm run lexicon:build`（或在指令後面加 `--rebuild` 直接重建），詞就回到那些詞庫包、從 `removed.ndjson` 消失。因為「格式不合」（R0）被刪的詞（例如含擴充區字元）救不回來，指令會明講。
2. **馬上在網站上看到**：把指令印出的那一行貼進 `data/wordlist-overrides.json` 的 `added`，網站每個詞庫包都會把它加回來（同一個詞只會出現一次）。第 7 階段會把這一步做成管理頁上的一個按鈕。

## 灰色地帶 AI 判斷（需要免費金鑰）

**灰色詞**是什麼：只有一個詞庫包收錄的詞（單一來源，可能是真的好詞，也可能是冷僻或亂碼般的詞），加上少數拿不準是不是中國用語的詞（例如「創建」「運行」）。規則沒辦法分辨它們，所以交給 AI 看。

**在 AI 看過之前，灰色詞一律保留在詞庫包裡**，報告和 `meta.json` 都標成「待 AI 判斷」（`gray_pending`）。沒有判斷就不刪，所以現在（還沒有金鑰）的詞庫包是完整可用的；AI 之後只會「刪掉判為一般讀者難以理解的詞」，不會增加新詞。

### 你要做的（在你自己的 Mac 上，一個指令）

1. 到 Google AI Studio（https://aistudio.google.com/）用你的 Google 帳號免費申請一把 Gemini API 金鑰。
2. 在專案資料夾的終端機輸入（把「你的金鑰」換掉；金鑰只放在這一行指令裡，**不要存進任何檔案、不要 commit**）：

```
GEMINI_API_KEY=你的金鑰 npm run lexicon:judge
```

3. 它會先印一行估算，例如「灰色 33624 筆、待判 33624 筆、批次 225、估計輸入 370368 token、輸出 100872 token」，然後開始分批判斷（約 225 次請求；Google 的免費額度規定常變，實際能一次跑完幾次請求以當時為準，跑不完就隔天再跑，見下一節）。判完會自動重建詞庫包並嚴格驗證。
4. 跑完看一下 `git status`：`tools/lexicon/judgments/judgments.tsv`（判斷快取）、`data/packs/*/`（詞庫包，版本會自動更新）、`tools/lexicon/reports/*/`（報告）會有變動，沒問題就 commit。

先看估算、不連網、不花額度：`npm run lexicon:judge -- --dry-run`（或 `python3 -B tools/lexicon/build.py judge --dry-run`）。

### 它怎麼保護你的額度

- **先估算再執行**：估計用量超過 `--max-tokens`（預設 1,000,000）就不跑（結束代碼 3），要硬跑加 `--force`。
- **請求次數有上限**：這一次最多送 `--max-requests` 次（預設 400）請求；到了就乾淨停下（印「已達本次上限」），已判斷的都已存檔，**明天再跑同一個指令就會接著判斷剩下的**（Gemini 免費方案若每日請求數很少，這樣分幾天跑完就好）。
- **每判完一批就存檔**（`judgments.tsv`）：中途斷線、按 Ctrl+C、AI 出錯都不會白做；再跑一次只會問還沒判斷的詞。要全部重新判斷才加 `--rejudge`。
- **遇到 429（太忙或額度用完）**：照 AI 回覆指示的秒數等待再試；連續 5 次都 429 就停下來（結束代碼 4），等一下再跑。
- 常用選項：`--batch-size`（每次請求幾個詞，預設 150、最多 300）、`--model`（預設 `gemini-3.5-flash-lite`）、`--provider auto|gemini|worker`。

### 備用：走 Worker（不用自己的金鑰）

```
LEX_AI_URL=https://lucky-hawaii.is3000dollar.workers.dev npm run lexicon:judge
```

這條路會用到線上網站同一份免費 AI 額度（網站的 AI 建議也在用），所以請**避開大家常用的時段**再跑；它每次請求至少間隔 6 秒，只會呼叫 Worker 的 `/ai`，不會碰其他功能。Worker 要先照 `worker/DEPLOY.md` 部署好才能用。同時設了 `GEMINI_API_KEY` 與 `LEX_AI_URL` 時，預設用 Gemini 直連（`--provider worker` 可強制走 Worker）。

### 判斷的標準與結果

- 標準寫在提示詞裡（`tools/lexicon/lex/judge.py`，版本 `lex03-v1`）：日常、口語、閱讀、文學、小說用得到的詞、大學以下學過的文言詞、常見專有名詞（例如「三酸甘油酯」）都留；一般受過教育的台灣讀者沒有專業訓練就難以理解的詞、極冷僻的小眾學術名詞（例如「聚乙烯醇縮丁醛」「分散式雜湊表」）才刪。**不是「像不像歌詞」的測驗**，拿不準就留。
- AI 只回「編號 K（留）或 D（刪）」，其他任何文字都忽略；沒答、答錯格式的詞會再用小一點的批次問一次，還是沒有就維持「待判斷」（保留）。
- 被判 D 的詞會從詞庫包刪掉，原因寫「AI 判斷：一般讀者難以理解（模型名稱）」（規則 R5），一樣列在 `reports/<名稱>/removed.ndjson` 與 REPORT.md，**可以用 `rescue` 救回**（`keep.json` 一律贏過 AI 的 D）。
- `judgments.tsv` 每行是「詞、K 或 D、模型、提示版本」，依詞排序，可以用文字編輯器手改 K／D；改完執行 `npm run lexicon:build` 就會依新的判斷重建。
- 詞庫包的 `meta.json` 會記 `judged_with`（用了哪些模型）、`gray_pending`（還沒判斷的灰色詞數）；NOTICE 也會說明這一步。內容有變，詞庫包版本自動更新（網站會重新下載）。
- 結束代碼：0 完成（含到達上限）、2 沒有設定 AI（沒有金鑰也沒有 `LEX_AI_URL`，什麼檔案都不動）、3 估算超過上限、4 AI 服務中斷（已判斷的已存檔）。
- 金鑰只從環境變數 `GEMINI_API_KEY` 讀、只放在送出的標頭裡，不會出現在網址、畫面、`judgments.tsv` 或任何檔案；`npm test` 的測試全部用錄好的回答與本機假伺服器，不需要金鑰、不連網。

## 授權閘門（會直接停下來的情況，結束代碼 2）

工具在下載與建包時，遇到下面任何一種都會用中文訊息停下來，不會產生詞庫包：

- 來源標了「不可重新散布」（`redistribute:false`），卻被拿來當詞庫包來源。
- 授權不在允許清單（LGPL-2.1-or-later、MIT、BSD-3-Clause、MulanPSL-2.0）。
- 下載的檔案大小或 sha256 與 `sources.lock.json` 不符（防止來源被偷換）。
- 授權證據那一行不見了（例如 `tsi.csv` 檔頭不再寫 `# dc:license,LGPL-2.1-or-later,`）。
- 快取資料夾（`LEX_CACHE_DIR`）被設在專案裡面。

教育部的辭典（CC BY-ND）一律不會進來。

## 指令

都要加 `-B`（不寫 `__pycache__`）；npm 的捷徑已經加好：

| npm 捷徑 | 實際指令 | 做什麼 |
|---|---|---|
| `npm run lexicon:build` | `python3 -B tools/lexicon/build.py all` | 下載 + 建包 + 嚴格驗證 |
| `npm run lexicon:verify` | `python3 -B tools/lexicon/build.py verify` | 只驗證已提交的詞庫包（離線） |
| （沒有捷徑） | `python3 -B tools/lexicon/build.py verify --strict` | 嚴格驗證：另外確認沒有簡體字、罕用字、中國用語殘留（要有規則輸入的快取） |
| （沒有捷徑） | `python3 -B tools/lexicon/build.py rescue 詞 [詞 …] [--rebuild]` | 救回被誤刪的詞（見下面「誤刪了怎麼救回」） |
| `npm run lexicon:judge` | `python3 -B tools/lexicon/build.py judge --rebuild` | 用 AI 判斷灰色詞，判完重建詞庫包（要金鑰，見下面「灰色地帶 AI 判斷」） |
| `npm run lexicon:test` | `python3 -B -m unittest discover -s tools/lexicon/tests -t tools/lexicon` | 跑 Python 單元測試 |

另外有 `build.py fetch`（只下載）與 `build.py build`（只用快取建包）。結束代碼：0 成功、1 驗證有問題（逐行列出）、2 工具停止。

`npm test` 也會跑這些單元測試與離線驗證。

## 技術細節

- **快取位置**：環境變數 `LEX_CACHE_DIR`，沒設就是 `~/.cache/lucky-hawaii/lexicon`。放在專案裡面會被拒絕。
- **來源釘選**：`sources.lock.json` 記每個來源的 repo、40 位 commit、檔案大小與 sha256。網址一律是 `raw.githubusercontent.com/<擁有者>/<專案>/<commit>/<路徑>`。
- **升版（換釘選）**：改 `sources.lock.json` 裡該來源的 `commit`，再更新每個檔案的 `bytes` 與 `sha256`（先下載一次、用 `sha256sum` 算），然後重跑 `npm run lexicon:build` 檢查結果。注意：libchewing-data 在 GitHub 已封存，新版在 Codeberg（codeberg.org/chewing/libchewing-data）；更新時要確認新位置能下載，工具目前只支援 GitHub 的 raw 網址。
- **格式規則 R0**：NFC 正規化；單字略過（只計數）；含擴充區字元（非 BMP）、非漢字、詞長超過 11 字、注音含非注音符號、注音音節數與字數不符，都會被刪並寫進 `removed.ndjson`。
- **讀音選擇**：一個詞有多個讀音時，只在來源已有的讀音裡選，依 `data/polyphonic-order.json` 的名次；要人工指定就寫在 `rules/reading-overrides.json`（詞 → 注音）。
- **可重現**：排序固定、沒有時間戳；`meta.built` 只在版本改變時才更新。
- **內容規則（06-05）**：規則順序固定，每個被刪的詞都寫進 `removed.ndjson`（含規則 id、繁體中文原因、哪些詞庫包有這個詞 `src`、有幾個 `n`）。
  - **K0 一定保留**：`rules/keep.json`（詞的清單）與 `data/wordlist-overrides.json` 的「加回」詞，只要格式合格就一定留，不管 R1／R2／R3。要救回被誤刪的詞，把詞加進 `keep.json` 重跑即可。
  - **R0 格式**：見上。
  - **R1 簡體字**：詞裡有 OpenCC `STCharacters` 的鍵、但不在教育部常用／次常用字、不是 `TSCharacters` 的鍵、也不在 Big5 內的字。
  - **R2 罕用字**：詞裡有不在「教育部常用字 ∪ 次常用字 ∪ Big5 第一二級」的字（教育部字表只在建包時比對，不會放進詞庫包）。
  - 台灣正常使用、卻會被 R1／R2 誤傷的字，寫在 `rules/char-allow.txt`（一行一字：字、TAB、原因），這兩條規則就會放過它。
  - **R3 中國用語**：詞與 OpenCC `TWPhrases`（加上 `rules/china-terms-extra.txt`）的鍵**完全吻合**，而且這個詞在自己來源裡的詞頻低於 100 才刪；詞頻夠高（支持、設備、用戶、文件…）就留。絕不用「包含」比對。
  - **R3 拿不準的詞（`rules/r3-gray.json`）**：列在這份清單裡、又命中 R3 的詞（例如「創建」「兼容」「運行」這類大陸味較重的電腦用語），**不刪**，改成灰色（規則 id `G-china-term`）保留並計入 `gray`，之後由 AI 判斷。`keep.json` 則只放「明確是台灣日常用語」的詞（例如「奔馳」「查看」「發送」），因為放進 keep.json 就等於永久保留、AI 不會再看。同一個詞同時在兩份清單時，`keep.json` 優先。
  - **G 灰色**：只有一個詞庫包收錄、又沒被上面規則刪掉的詞，保留並標成灰色（`meta.json` 的 `gray`、`gray_pending`），留給之後的 AI 判斷，絕不因此刪除。`--gray-policy p2`（預設關閉）另外把「所有來源詞頻都是 0」的詞也標成灰色。
  - 自我檢查：Python 的 Big5 字表（第一級 5,401、第二級 7,650）與教育部常用字（4,808）對不上就停下來。
  - 隨詞庫包散布的 NOTICE／LICENSE 文字不可含簡體字，建包與 `verify --strict` 都會檢查。
