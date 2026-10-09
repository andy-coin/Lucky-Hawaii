# 好韻器 Worker 上線清單（給 Andy）

照著做，一步一步來，不用懂程式。每一步都有「要貼的指令」、「成功長什麼樣子」、「失敗怎麼辦」。
遇到跟這份清單對不上的畫面，就停下來，把畫面貼給 Claude，不要硬按。

---

## 先知道的事

- **AI 建議現在其實是壞的。** 瀏覽器裡還留著舊設定（預設模型是 GitHub Models）的人，按 AI 建議會失敗，因為 GitHub Models 這個服務已在 2026-07-30 結束。Groq 的 Qwen 3.6 模型也在 2026-09-14 關閉了。
- 網路上流傳「Gemini 2.5 在 10/16 下架」，**Google 官方表格並沒有確認這個日期**（沒有公布下架日，只說 2.5 限制給舊用戶使用）。我們還是把 2.5 拿掉了。所以這個期限是我們自己訂的，不是 Google 訂的，不用慌。
- 新的 Worker 已經改成：網站只說「請 AI 幫忙」，由 Worker 決定用哪個模型，失敗會自動換下一個，每天凌晨還會自己檢查哪些模型還活著。
- 下面每一步都要用你的 Cloudflare 帳號登入，Claude 沒辦法代勞，所以才變成手動清單。**所有程式碼 Claude 都已經在你的電腦上測過了**（有一個假的 AI 伺服器，把整個 Worker 從頭到尾跑過一遍）。
- 今天的啟用模型是六個：Gemini 3.5 Flash-Lite、Gemini 3.8 Flash、Gemini 3.7 Flash、GPT-OSS 120B、Qwen3.8 27B、GPT-OSS 20B。

**順序很重要：先上線 Worker（步驟 1 到 8），確認沒問題，才更新網站（步驟 9）。**
以前的網站頁面可以繼續使用新的 Worker（Worker 還聽得懂舊格式），所以 Worker 先上線不會弄壞任何人。反過來就不行：網站先更新，Worker 還是舊的，AI 會直接壞掉。

所有指令都在終端機執行，而且要先進到專案資料夾：

```
cd "/Users/Shared/Coding Projects/Lucky Hawaii"
```

---

## 步驟 1　登入 Cloudflare

指令：

```
npx wrangler login
```

- 會自動打開瀏覽器，按「Allow」（允許）。
- 成功：終端機出現 `Successfully logged in`。
- 失敗：瀏覽器沒有跳出來的話，把終端機印出的那串網址複製到瀏覽器打開。還是不行就貼畫面給 Claude。

---

## 步驟 2　先看一下後台現在的狀況（只看，不要改）

1. 打開 Cloudflare 後台，點 Workers & Pages，點 lucky-hawaii，再點 Settings（設定），找到 Variables and Secrets（變數與金鑰）。
2. 找這三個名字：`GEMINI_API_KEY`、`GROQ_API_KEY`、`USER_REPORT_KEY`。
3. 每一個旁邊的類型，寫下來是 **Secret**（看不到內容）還是 **Plain text**（看得到內容）。

這個結果會決定步驟 5 要不要做。順手看一下有沒有 `GITHUB_API_KEY`，有的話先留著，步驟 8 之後才刪。

---

## 步驟 3　找回報資料的 KV id，填進設定檔

這一步最容易出事，請慢慢來。回報資料（使用者按「回報」送出的東西、後台列表看到的東西）就存在一個 KV 裡，我們要告訴新的 Worker「請接上那一個」，不是新建一個。

1. 指令：

   ```
   npx wrangler kv namespace list
   ```

   會印出一串清單，每一項有 `title` 和 `id`。找存回報用的那一個（名字通常有 feedback 或 report；不確定的話，到 Workers & Pages → lucky-hawaii → Bindings 看 `USER_FEEDBACK_KV` 連到哪一個，兩邊的 id 要一樣）。

2. 用文字編輯器打開 `worker/wrangler.toml`，找到這兩行：

   ```
   binding = "USER_FEEDBACK_KV"
   id = "REPLACE_WITH_USER_FEEDBACK_KV_ID"
   ```

3. 只把第二行引號裡面的 `REPLACE_WITH_USER_FEEDBACK_KV_ID` 換成你找到的那串 id（32 個英文字母和數字），引號和 `id = ` 保持原樣。例如：

   ```
   id = "0123456789abcdef0123456789abcdef"
   ```

**絕對不要留空，也不要自己編一個 id。** 留空或亂填，Cloudflare 會幫你新建一個空的 KV，結果後台列表就看不到任何舊回報了（舊資料還在，只是沒接上）。

- 成功：檔案裡 `USER_FEEDBACK_KV` 底下的 id 是 32 碼。
- 失敗：找不到那個 KV 的話，先停下來問 Claude，不要往下做。

---

## 步驟 4　建立健康檢查用的 KV，填進設定檔

這是新的、空的，專門放「每天檢查哪些模型還活著」的紀錄，不會和回報混在一起。

1. 指令：

   ```
   npx wrangler kv namespace create AI_STATE_KV
   ```

2. 終端機會印出一段文字，裡面有 `id = "..."`。複製那串 id。
3. 回到 `worker/wrangler.toml`，找到這兩行：

   ```
   binding = "AI_STATE_KV"
   id = "REPLACE_WITH_AI_STATE_KV_ID"
   ```

4. 只把第二行引號裡的 `REPLACE_WITH_AI_STATE_KV_ID` 換成剛剛印出的 id。

- 成功：兩個 KV 的 id 都換成 32 碼了。
- 失敗：說已經存在的話，用步驟 3 的 `npx wrangler kv namespace list` 找到 `AI_STATE_KV` 那一個的 id 來用，不要再建第二個。

---

## 步驟 5　設定三把金鑰

三把金鑰：Gemini 的、Groq 的，還有後台的管理金鑰。**只有步驟 2 看到是 Plain text 的才一定要做**；看到三個都是 Secret 的話，可以跳到步驟 6（做了也不會壞，只是重填一次）。

一把一把來，每次指令跑完會請你貼上金鑰，貼完按 Enter（貼的時候畫面不會顯示字，是正常的）：

```
npx wrangler secret put GEMINI_API_KEY --config worker/wrangler.toml
npx wrangler secret put GROQ_API_KEY --config worker/wrangler.toml
npx wrangler secret put USER_REPORT_KEY --config worker/wrangler.toml
```

- `USER_REPORT_KEY` 要貼**後台頁面現在用的那一把一模一樣的金鑰**，貼錯的話後台會進不去。
- 成功：每一個都出現 `Success! Uploaded secret ...`。
- 失敗：如果 wrangler 說「已經有同名的變數了」，到 Cloudflare 後台把那個 Plain text 的同名變數刪掉，再重新跑一次該行指令。

---

## 步驟 6　上線前自我檢查

三個指令，一個一個跑，**三個都要通過**：

```
npm test
npm run worker:check
npm run worker:smoke
```

- `npm test`：最後一行顯示全部 passed，沒有 failed。（偶爾有一個叫 error-visibility 的測試會偶發失敗，再跑一次就好；連續兩次都失敗再問 Claude。）
- `npm run worker:check`：這是「假部署」，不會真的上線。結果裡不能有 `WARNING`。
- `npm run worker:smoke`：用你電腦上的假 AI 把整個 Worker 跑一遍，最後一行要是 `全部通過`。
- 失敗：把紅字貼給 Claude，先不要往下。

---

## 步驟 7　部署 Worker（真的上線）

指令：

```
npm run worker:deploy
```

- 它會先檢查兩個 KV id 填好沒。如果跳出「KV id 還沒填好」的訊息，回到步驟 3 和 4。
- 接著 wrangler 會列出**這次部署會改什麼**（一份差異清單），然後問你要不要繼續。
  **這份清單一定要看。** 如果有紅色的行，或是前面有 `-`（減號）的行，而且內容提到 `USER_FEEDBACK_KV`、`GEMINI_API_KEY`、`GROQ_API_KEY`、`USER_REPORT_KEY` 其中任何一個，**請回答 No，然後把畫面貼給 Claude**。這代表它想把回報資料的連線或金鑰拿掉。
- 清單裡只有新增（`+`）或沒看到那四個名字的話，回答 Yes 繼續。
- 成功：最後會出現 `Deployed lucky-hawaii` 和網址 `https://lucky-hawaii.is3000dollar.workers.dev`。
- 失敗，而且訊息提到 `ratelimits`：免費方案有可能不接受限流那一段設定。處理方式：打開 `worker/wrangler.toml`，把從 `[[ratelimits]]` 那行開始，一直到 `period = 60` 那行為止的整段刪掉（包含中間的 `name`、`namespace_id`、`[ratelimits.simple]`、`limit` 幾行），存檔，再執行一次 `npm run worker:deploy`。刪掉之後 Worker 照常運作，只是少了「每個 IP 每分鐘最多 20 次」的限制。
- 其他失敗：貼給 Claude。

---

## 步驟 8　確認線上的 Worker 真的好了

1. 叫它現在就檢查一次所有模型（把「你的後台金鑰」換成真的金鑰）：

   ```
   curl -X POST "https://lucky-hawaii.is3000dollar.workers.dev/health/run?key=你的後台金鑰"
   ```

2. 會回一大段文字。裡面六個模型每一個都應該有 `"ok":true`，最後的 `active` 會列出六個 id。
   - 如果 Gemini 3.7 或 3.8 顯示 `bad-request`，代表思考設定的寫法要調一下，請告訴 Claude。（Worker 遇到這個會自動改用不帶思考設定的方式再試一次，所以 AI 建議照樣能用，不急。）
   - 如果某個模型是 `"ok":false`，也告訴 Claude，不用自己處理；它會被自動排除，網站選單也會跟著少一個。
   - 回的是 `Forbidden`：金鑰打錯了，或步驟 5 的 `USER_REPORT_KEY` 貼錯了。
3. 打開後台頁面（admin），確認**以前的回報都還在列表裡**。如果列表是空的，**不要做任何刪除**，回頭檢查步驟 3 的 KV id，並告訴 Claude。
4. 確認都正常之後，Cloudflare 後台裡的 `GITHUB_API_KEY` 已經沒有用了，可以刪掉（不刪也不影響）。

---

## 步驟 9　最後才更新網站

**只有步驟 8 全部正常才做這一步。**

網站的改動都在 `gsd/v0.96-stabilize` 這個分支上，Claude 沒有推出去。「把這個分支合併進 main 並推上去」就是更新網站（GitHub Pages 會自動發布）。你決定什麼時候做；要做的話，最簡單的方式是告訴 Claude「可以更新網站了」。自己做的話：

```
git checkout main
git merge gsd/v0.96-stabilize
git push
```

- 成功：過幾分鐘，網站就是新版。
- 提醒：還握著舊預設模型設定的使用者，要等網站更新之後，AI 建議才會恢復，因為新網站會自動把舊設定當成「自動」。在那之前，他們看到的還是舊的失敗行為；這也是為什麼要盡快做這一步。
- 失敗：`merge` 說有衝突的話，不要硬解，貼給 Claude。

---

## 步驟 10　在線上網站實際點一次

1. 打開正式網站（https://andy-coin.github.io/ 上的好韻器），強制重新整理一次。
2. 查一個字，按一次「AI 建議」。
3. 成功：幾秒內出現建議詞。選單裡看得到新的模型名稱，預設是「自動」。
4. 失敗：畫面會用白話告訴你原因（例如「操作太頻繁」或「AI 暫時不可用」）。把那段文字告訴 Claude。

做到這裡，這個階段就算全部完成。

---

## 第 7 階段：回報與修正層

這一段是第 7 階段多出來的東西。第一次上線 Worker 的人照步驟 1 到 10 做完，再看這裡；已經上線過的人，重新部署一次（步驟 6、7）再看這裡就好。

### 7-1　新增的網址（全都在同一個 Worker 上，不用新建任何東西）

| 網址 | 做什麼 | 要不要後台金鑰 |
|---|---|---|
| `GET /corrections.json` | 網站載入時抓「線上修正層」（只有修正內容，沒有回報原文），瀏覽器快取 60 秒 | 不用，但只回應正式網站的來源 |
| `GET /corrections/admin.json` | 後台和寫回腳本讀整份修正層（含編號、來源回報、已寫入清單） | 要 |
| `POST /corrections/apply` | 後台「🚀 套用到線上」 | 要 |
| `POST /corrections/revoke` | 後台「撤回」 | 要 |
| `POST /corrections/clear` | 寫回腳本確認線上生效後，清空「這一批」 | 要 |

- **不需要新的 KV、也不需要新的密鑰。** 修正層就存在步驟 4 建的 `AI_STATE_KV` 裡，鍵名是 `corrections:v1`（單一文件）；回報還是存在原本的 `USER_FEEDBACK_KV`。`worker/wrangler.toml` 這一階段完全沒改。
- 後台金鑰現在有兩種給法：標頭 `X-Admin-Key`（新版後台用這個）和網址 `?key=`（舊版後台用這個）。兩種都收，金鑰是空的一律拒絕。**網址帶金鑰的方式只是暫時保留，v2 才會移除。**

### 7-2　部署順序（很重要）

**先部署 Worker（步驟 6、7、8），確認沒問題，再把網站合併到 main（步驟 9）。**

原因：線上現在的舊後台還在用網址帶金鑰；新 Worker 兩種都聽得懂，所以 Worker 先上線不會讓舊後台壞掉。反過來，如果先合併、Worker 還是舊的，新網站抓不到 `/corrections.json`（網站只會悄悄略過，不影響使用），但新後台的「套用」會失敗。另外，瀏覽器裡還快取著舊後台頁面的人，在 Worker 更新後仍然可以用，所以也不用急著移除舊方式。

### 7-3　免費額度（Cloudflare KV，每天，UTC 午夜歸零）

免費方案的上限：**寫入 1,000 次／讀取 100,000 次／刪除 1,000 次／列出鍵名 1,000 次**；Worker 請求每天 100,000 次。（保守起見，把所有 KV 當成共用同一份額度算。）回報、核准、套用都在花同一份寫入額度，請留意：

| 操作 | KV 寫入 | KV 讀取 | 備註 |
|---|---|---|---|
| 使用者送 1 筆回報 | 1 | 0 | |
| 使用者一次送 10 筆（上限） | 10 | 0 | 一次最多 10 個，剛好不超過每分鐘 20 次的限流 |
| 後台核准或駁回 1 筆回報 | 1 | 1 | |
| 後台核准一個「×5」的合併列 | 5 | 5 | 列內每一筆各存一次決定 |
| 套用 N 筆回報 | 1 | N + 1 | 不論 N 多少，修正層只寫一次 |
| 撤回或清空 | 1 | 1 | |
| 每次有人開網站 | 0 | 1 | 瀏覽器快取 60 秒，實際更少 |
| 後台重新載入 | 0 | 1 次列出鍵名＋讀最新 800 筆 | |

估計：每天 3,000 次開站，大約多 3,000 次讀取，離 100,000 還很遠；真正要小心的是**寫入**：一天回報加核准加套用合計別超過 1,000 次。

### 7-4　寫回資料檔（把修正層累積的內容變成永久的）

修正層是暫時的，累積後用寫回腳本把內容寫進 `data/wordlist-overrides.json`、`data/rhyme-dict-overrides.json`，推上去，等線上真的換新再清空修正層。**修正層超過 500 筆時，後台會提醒你先跑這個。**

先設後台金鑰（只放在這個終端機視窗，不會印出、不會存檔），再進專案資料夾：

```
cd "/Users/Shared/Coding Projects/Lucky Hawaii"
```

1. **先看差異（不改任何東西）**

   ```
   LH_ADMIN_KEY=你的後台金鑰 npm run corrections:writeback
   ```

   會印出這一批要寫進哪些檔案、各加減幾筆。沒問題再往下。

2. **寫檔並 commit**

   ```
   LH_ADMIN_KEY=你的後台金鑰 npm run corrections:writeback -- --apply
   ```

   只會寫那兩個修正檔和寫回紀錄、做一個 commit。如果這三個檔案有尚未 commit 的修改，腳本會停下來，不會動。

3. **推上去、等線上生效、清空這一批（要在 main 分支上）**

   ```
   LH_ADMIN_KEY=你的後台金鑰 npm run corrections:writeback -- --apply --push
   ```

   會 push，然後每 30 秒查一次線上網站，**最多等 20 分鐘**（GitHub Pages 的快取最久約 10 分鐘，加上建置時間）。確認線上資料檔真的包含這批修正之後，才只清空「這一批」；寫回期間新套用的不會被清。
   - **等到逾時不是壞掉**，只是 CDN 還沒更新（結束代碼 4）。過幾分鐘用下面第 4 點重跑即可。
   - 想改等待時間：加 `--timeout 秒數`。

4. **不在 main 分支，或 push 之後逾時：只做確認與清空**

   ```
   LH_ADMIN_KEY=你的後台金鑰 npm run corrections:writeback -- --confirm-only
   ```

   不寫檔、不 commit、不 push；只確認線上已經更新，然後清空已經寫入的那一批。任何分支都能執行。目前不在 main 時，腳本只會寫檔加 commit，不 push、不清空，並提醒你「合併到 main 之後用 `--confirm-only`」。
   - 如果 GitHub Pages 不是從 main 發佈（Settings → Pages 看 Branch），加 `--live-branch 分支名稱`。

注意：
- **同一時間只開一個寫回**，不要在兩個終端機視窗同時跑。
- 任何一步失敗，腳本就停在那一步、修正層完全不動；重跑是安全的（已寫進去的不會重複加，沒清空的會重新確認）。
- 第一次對真的 Worker 執行時，請留意 Cloudflare 對腳本的反應：如果預覽那一步就看到 403 或像 `1010` 的錯誤，代表 Cloudflare 擋了這支腳本，把畫面貼給 Claude。
- 這一份清單只說明怎麼做；Claude 不會代你對真的 Worker 或 GitHub 執行寫回。

### 7-5　上線後在正式環境走一次（人工驗收）

照 `.planning/驗收清單-精簡版.md` 的 2-23、2-24：回報一個你本來就想拿掉的怪詞 → 後台核准 → 套用 → 重新整理網站看不到 → 撤回 → 再套用 → 寫回並 push → 清空。**寫回會真的改到 `data/` 的修正檔**，所以請用一個你確定要拿掉的詞。

---

## 附錄

**為什麼兩個 GPT-OSS 模型沒被拿掉？**
它們發布超過半年了（日期是估的）。但規則是：舊模型只有在「有更新的、同一個系列的健康模型」可以取代時才會被移除，而且清單永遠至少留兩個、絕不清空。GPT-OSS 目前沒有更新的同系列模型，所以留著。想讓它們早點退場，就在 `worker/src/models.js` 加一個更新的 GPT-OSS（附官方發布日期）再重新部署。

**怎麼加新模型？**
編輯 `worker/src/models.js`，在清單加一筆（附官方發布日期），執行 `npm test`，再照步驟 7 部署。每晚的健康檢查只會讓清單縮小，不會自己加新模型。

**Gemini 免費額度在哪看？**
Google AI Studio：https://aistudio.google.com/rate-limit

**關於 wrangler 4.147.0 的供應鏈提醒。**
這個版本在 2026-10-02 才發布，被標成「太新」。Claude 安裝時做過檢查，結果都過關：套件簽章 39 個都驗證通過（24 個有來源證明）、帶安裝腳本的套件只有 esbuild、workerd、fsevents 三個、高風險漏洞 0 個。其中 fsevents 是 wrangler 自己帶的 macOS 選用套件（作者 pipobscure 與 paulmillr，簽章通過），原本清單沒有列它，經過人工確認後放行，而且在這台 Mac 上它的安裝腳本其實沒有執行。**請不要降版本**：4.140.0 及更早的版本有已知的高風險漏洞（undici）。

**限流（每 IP 每分鐘 20 次）的真實表現。**
Cloudflare 的限流是各地點分開算、最後才一致，所以短時間連續按，可能略多於 20 次才開始收到「操作太頻繁」。步驟 7 如果必須刪掉 `[[ratelimits]]`，就完全沒有這個限制，但其他功能不受影響。

**部署後可以順便確認的幾件事（不確定的假設）。**
- 步驟 8 的結果裡，Gemini 3.7 和 3.8 有沒有 `ok:true`，可以確認思考設定的寫法（`LOW`）是對的。
- 步驟 5：`wrangler secret put` 能不能直接蓋掉同名的純文字變數；不行的話就是照步驟 5 的失敗處理，先刪掉再重做。
- 免費方案接不接受限流那一段（步驟 7）。
- 隔天凌晨 03:17（台灣時間）之後，用 `curl "https://lucky-hawaii.is3000dollar.workers.dev/health.json?key=你的後台金鑰"` 可以看到排程有沒有自己跑過（`checkedAt` 有日期就是有）。
