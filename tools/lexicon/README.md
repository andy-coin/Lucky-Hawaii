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
