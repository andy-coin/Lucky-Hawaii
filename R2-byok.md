# R2 用自己的金鑰（BYOK，分支 r2/byok）— 等 Andy 拍板

截圖在 `r2-shots/byok-*`（desktop／ipad-1180x820／phone 各一組）：
- `key-idle`：沒金鑰，鑰匙淡淡靜止
- `key-on`：選了自己金鑰的模型，鑰匙亮起（實際會慢慢呼吸）
- `dropdown`：模型下拉展開，「用你自己的金鑰」那組右邊有用量訊號格
- `ai-tab`、`ai-tab-bottom`：偏好設定的「AI」分頁

## 加了哪些模型、用量幾格（2026-11 查官方文件）

| 服務商 | 模型 | 用量格 | 依據 |
|---|---|---|---|
| Gemini | Gemini 3.5 Flash-Lite | 2 格 | Google 說它是「最快、最省」的 3.5 模型，新專案建議用它或 3.8 Flash；免費版約每天 500 次（Google 文件沒公布數字，只說到 AI Studio 看；500 次是 Google 官方論壇使用者貼的） |
| Gemini | Gemini 3.8 Flash | 3 格 | 最新一代 Flash；免費版每天只有約 20 次（同上，Google 官方論壇） |
| Groq | GPT-OSS 20B | 1 格 | Groq 正式版模型，最快；每分鐘 30 次、每天 1,000 次 |
| Groq | GPT-OSS 120B | 2 格 | Groq 正式版模型；次數上限和 20B 一樣，但模型大、每次吃的字數（token）多，每天字數上限 20 萬會先用完 |

格數規則：每天能用幾次越少、每次越吃字數，格數越多。1 格＝放心用，3 格＝一天沒幾次。

官方來源：
- Gemini 模型清單：https://aistudio.google.com/docs/models （原 ai.google.dev/gemini-api/docs/models 已轉址到這）
- Gemini 免費版有哪些模型：https://aistudio.google.com/docs/pricing （3.5 Flash-Lite、3.8 Flash 都標「Free of charge」；Gemini 4 與 3.1 Pro 免費版不能用，所以沒加）
- Gemini 用量上限：https://aistudio.google.com/docs/rate-limits （沒有公開表格，叫你去 AI Studio 看）；論壇：https://discuss.ai.google.dev/t/gemini-3-8-flash-free-tier-20-rpd-is-too-limited-for-practical-evaluation/180609
- Groq 模型清單：https://console.groq.com/docs/models
- Groq 用量上限：https://console.groq.com/docs/rate-limits

## 待決事項

1. Gemini 的每日次數不是 Google 文件寫的 → 我先照 Google 官方論壇的數字（3.8 Flash 每天約 20 次、Flash-Lite 約 500 次）定格數。你可以登入 AI Studio 的「Rate limit」頁看你的帳號實際數字，不一樣再告訴我。
2. Groq 的用量頁表格上方寫「下面是 Developer（付費）方案的基本上限」，免費方案數字可能更低 → 我先照這張表；兩個 GPT-OSS 次數一樣，120B 因為模型大給 2 格。
3. 每家放幾個模型 → 我先每家兩個（一個省、一個強）。Groq 還有 Qwen 3.8 27B，但官方標「預覽版、可能隨時下架」，先不放；Llama 3.1 8B 在模型清單但用量頁沒列，也先不放。
4. 模型清單寫死在程式裡（`js/ai-client.js` 最上面的 `BYOK_PROVIDERS`）→ 服務商下架模型時要手動改。按「測試連線」時沒有去比對對方清單裡有沒有這幾個模型；要的話可以加「這把金鑰找不到 ○○ 模型」的提醒。
5. 金鑰什麼時候存 → 貼上後離開輸入框就存（不用另外按儲存）；「測試連線」也會先存再測。格式明顯不對（夾空白、中文）就不存並說明。要不要改成「測試成功才存」？
6. 選單分組 → 沒有金鑰時跟以前一樣只有一串；有金鑰才分成「好韻器提供」和「用你自己的金鑰」兩組。好韻器提供的模型沒有用量格（不吃你的額度）。
7. 鑰匙閃爍 → 沿用專案裡既有的呼吸動畫（約 2.6 秒一次、亮暗之間），沒有新增動畫（專案有「不新增動畫」的測試規則）。減少動態時改成靜態亮起（主題色）。
8. 選了自己金鑰的模型，後來把金鑰清掉 → 選單畫面顯示「自動」（走好韻器），但你存的選擇不動，重新貼回金鑰就恢復。
9. 用自己的金鑰成功時，右下會跳「Gemini 3.5 Flash-Lite（你的金鑰）｜本次 N tokens」，讓你知道真的在用自己的額度。
10. 模型選單的寬度上限維持 10rem，長名字會「…」；展開的清單可以比按鈕寬（最寬 18rem）。
11. 「AI」分頁放在「韻腳與句構」和「資料與備份」中間；原本「查詢與詞庫」最下面那行「Groq 已整合，無需填入 Key」拿掉，意思改寫進 AI 分頁第一句。
12. 手機上分頁列會橫向捲（六個分頁放不下）；觸控時每個分頁至少 44px 寬（「AI」兩個字原本太窄）。
