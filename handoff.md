## 2026-11-14 回報 10 點＋選字列（?v=0.96.42，待 Andy 實機驗收）
- 1 寬螢幕吸附門檻 1600→1400（比 13 吋 iPad 橫放 1376 寬、且是滑鼠）：js/layout.js LH_MQ_DOCK；測試在 tests/helpers.mjs 設 window.__lhDockMinW=1600 沿用舊門檻。
- 2 美術：寬螢幕兩側標題列往上／左右延伸貼齊面板（panels.css 檔尾「美術修正」）；新增段落與提供詞語建議同 2.25rem 高、同字級；電腦上左側面板 ⋮⋮ 也隱藏（手機平板左側保留，手指要靠它拖）；保留池內容加內距＋fill-soft 底；「歌曲」鈕土耳其綠（css/base.css 檔尾，淺 #16766f／深 #4fd1c5，style.spec 白名單加這兩色）。
- 3 電腦字卡也縮 8%：css/responsive.css 平板那組改成 (min-width: 441px)。
- 4 浮動列查韻／AI：選 5 個中文字內就整組查（慢吞吞＝ㄢ ㄨㄣ ㄨㄣ），更長退回最後一字（js/rhyme-map.js LH_MAP_MULTI_MAX）；讀音列仍看最後一字。
- 5 自由畫布拉右下角：右緣／下緣吸別張卡片的邊、Shift 等比例、Alt 不吸（js/canvas.js _lhCvSnap mode）。
- 6/7 主視窗拖放：結果和現在一樣（版型＋位置相同）就不提示、不動（js/dock.js _dkShape）；原本會把比例砍半。
- 8 三直排的側邊分頁只給外側：歌詞在最左（dk-tab-l）、AI 在最右（dk-tab-r）；排到中間改小三角形。
- 9 段落設定選單拿掉「關閉設定」（點空白、Esc 關）。
- 10 金幣往上噴 ×1.2（落下不變）；token 文字改寫在「回報詞語」右邊 #aiStatus，4 秒後 WAAPI 淡出（不管特效開關都顯示）。
- 選字列：選字前後那一列高度不變（不推擠）、已選字同一行左右捲、黏頂底色帶面板紋理（css/base.css「已選的字」）。
- 測試：全套 1275 過；新增 canvas「拉大小吸附＋Shift」；截圖基準更新。

## 2026-11-14 收尾 11 點（?v=0.96.41，待 Andy 實機驗收）
- 1 三直排收起一側仍算三直排：js/dock.js lhDockRender 改看整棵樹（含收起的）判斷 dock-classic。
- 2 拿掉 ⋮⋮：主視窗三個標題列的 ::before 與 1.5rem 左內距刪掉（css/panels.css「三個標題列」）；完整編輯器的 .section-handle 視覺隱藏、Tab 仍可聚焦（panels.css 檔尾）。左側窄面板的 ⋮⋮ 保留（觸控在那裡只能抓 ⋮⋮）。
- 3 新增段落＝提供詞語建議同色（--action-bg）。4 保留池內容區加框＋左邊重點色，和標題列連成一塊。
- 5／9／10 吸附分列（js/canvas.js 檔尾「拖卡片之間的縫」）：同列直縫拉寬度（段落 rw，120 格）、隔空吸到別列的縫（3 格內，Alt 關閉）、拖曳中就有導引線 #lhRowGuide；兩列之間橫縫＝上高下矮（列首段落 rh，px）；雙擊縫回預設；一步復原。純函式 js/sections-core.js lhRowSpans、lhRowsApply（成員變動的列清掉 rw／rh）；undo.js _sig 含 rw、rh。格線改成 column-gap 0、卡片用 --r-ml／--r-mr 分攤縫寬（原本 119 個欄間距會把卡片擠出右邊）。拖排預覽框 z-index 850→955（被 950 的編輯器蓋住，所以「放開才出現」）。自由畫布吸附拿掉 50% 中線。
- 6 平板：編輯器標題列觸控可拖（touch-action:none），名稱鈕／▾ 在觸控時也能當起點（觸控校正會把手指吸到名稱鈕）；setPointerCapture 延到真的開始拖，點名稱鈕照常開選單；移動／放開改聽 document。
- 7 自由畫布手掌：根因是卡片都在畫面內時畫布沒有可捲範圍。_lhCvExtent 在卡片外多留 75% 可視區（::after 撐開）；單指拖卡片內任何非標題列／按鈕處都平移。副作用：Mac 的 End 鍵＝捲動，canvas.spec 縮放測試改用 setSelectionRange。
- 8 設定「韻腳與句構」：預覽移到最上面並 sticky（只在 ≥600×600；手機仍一起捲），預覽自己最高 11rem。
- 11 重點跟隨：偵測仍只看指標所在段落，浮出顏色改整首歌（js/rhyme-map.js _lhHvBoxesOf）。
- 測試：全套 1273 過，只剩舊的 rhyme-map-ui:280；新增 editor-layout「拖卡片之間的縫」；lyrics 三張截圖基準更新；line-analysis-ui 預覽順序／黏頂改新規格。
- 沒做：橫縫的 y 隔空對齊（整列等寬，橫縫本來就是整條對齊）；單欄（沒有並排）時沒有拖縫（那時不是格線，改成格線會動到拖曳排序的落點線）。
- 未驗：iPad 實機（觸控校正、單指平移、捏合）只用 Chrome 模擬測過。

## 2026-11-14 批次 1–3（?v=0.96.36，待 Andy 實機驗收）
- 批次 1（d76cdf4）：標籤晶片移到「標籤 ＆ 情境」標題列（index.html 405，css/panels.css 單行橫捲、輸入框固定不動）；「自由」鈕補左框（#canvasSnapBtn／#canvasFreeBtn 圓角＋重疊 1px）；js/rhyme-map.js 2 處吞錯改 lhWarn；golden 快照刷新、tests/sections-audit.spec.mjs 動畫守門起點改 29e7c27。
- 批次 2（7abb78d，0.96.35）：角色新增／改名／改色／刪除進復原歷史（js/undo.js `_snap` 帶 .roles、`_sig(sections, roles)`；js/roles.js `_lhRoleCommit`、`lhRolesChanged`）；「移到段落」搬字帶角色標記（js/sections-core.js `lhMarksSlice`、js/sections.js `lhSecMoveText`）。
- 超大段落（>20 萬字或 >5000 行）角色淡底：不做。這種長度鏡像層本來就整個不畫（效能），歌詞幾乎碰不到，為它另開一條畫法不划算。
- 批次 3（a612463，0.96.36）：自由畫布 Part B（js/canvas.js）：`lhCanvasZoom`（40%–150%，只在記憶體、每首歌一個、重整回 100%）、縮放鈕 `.canvas-zoom`（index.html 402）、Ctrl／⌘＋滾輪、雙指捏合、滑鼠拖空白處／中鍵平移、拖曳與拉大小的座標除以倍率、方向鍵移卡片（⋮⋮ 上 8px，Shift 40px）。CSS：卡片用 `left/top × --cv-z` 加 `transform: scale`（css/panels.css）。
- 已知：tests/rhyme-map-ui.spec.mjs:280（鏡像逐像素對齊）在較早 commit 也會失敗、:156 偶發，與本批無關。縮放後的 caret 量測只測了選字列與打字，word-drag（拖字）在縮放下未驗證。雙指捏合只能實機測。-linux 視覺基準未更新。

## 2026-11-14 自由畫布 Part A（quick 261113-t1z，?v=0.96.32，待 Andy 實機驗收）
編輯器工具列多「吸附／自由」。自由模式下每段是畫布上的卡片：拖 ⋮⋮ 或標題列空白處移動、拉右下角改大小、放手把壓到的卡片推開、一步復原；畫布超出畫面用原生捲動。

### 改了什麼（檔案:行）
- 純函式：js/sections-core.js 301 `lhSecPosClean`、310 `lhCanvasClean`（只存 mode）、323 `lhCanvasLayout`（沒位置的卡片預設 3 欄）、343 `lhCanvasPushApart`（推開，上限 400 次＋保底）；`lhSecFields`／`lhSecFinalize` 帶 s.pos。
- 資料：段落 `s.pos = {x,y,w,h}`、歌 `song.canvas = {mode}`；沒用過畫布的歌存檔沒有這兩個欄位。js/songs.js `_normalizeSong`、js/safety.js `lhNormalizeSong` 整理壞值；js/undo.js 14 `_sig` 含 s.pos（改位置算一步）。
- 畫布本體：js/canvas.js（新檔）：27 `lhCanvasApply`（排版）、70 `lhCanvasSetMode`、91 `_lhCvCommit`（推開＋一次寫入＝一步）、188 捕獲階段 pointerdown（手勢）、224 `lhCanvasReveal`（只捲畫布）。
- 呼叫點：js/lyrics.js 250／353／377 套排版；露出卡片改走 `lhCanvasReveal`：lyrics.js 152、360、sections.js 146、1118、undo.js 127；js/sections.js ⋮⋮ 在自由模式不啟動排序、標籤改「拖曳移動…」；js/layout.js 122／131 鍵盤開關時重套（鍵盤打開退回整齊直列）。
- 介面：index.html 402 `#canvasTools`（吸附／自由，只在編輯器）；css/panels.css 2362 起（自由畫布整段）。
- 測試：tests/canvas-core.spec.mjs（純函式）、tests/canvas.spec.mjs（26 個：資料、切換、移動、拉大小、推開、復原、只捲畫布、手機觸控與鍵盤、自由模式下選字列／角色標記／打字／移到段落）。

### 已知限制
- 模式（吸附／自由）是檢視狀態，不進復原；位置與大小進復原。
- 還沒有縮放、平移（Part B）；畫布很寬要靠捲動。方向鍵移動卡片也留到 Part B。
- 從 AI／結果卡拖字進編輯器不可行（遮罩蓋住）；舊的單曲路徑（songs.js:66）不存畫布資料。
- 「移到段落」搬進「新」段落時，那張卡片沒有位置，會顯示在其他卡片下方的預設位置。
- 收合的卡片推開時仍佔用它存的完整大小；舊的並排角色欄在卡片裡只會捲動。
- ≤ 900px 時編輯器欄本身仍會捲動（和吸附模式一樣），手機細修留 Part B；-linux 截圖基準未動。

### 下一個 quick（Part B，0.96.33）
縮放與平移（Ctrl／⌘＋滾輪、雙指捏合、空白處拖動、工具列 −／％／＋／重設，zoom／pan 存進 song.canvas 並經 lhCanvasClean）、縮放下的座標補償（word-drag.js lhCaretIndexAt／lhCaretRect 除以縮放比、選字列、右鍵選單）、鍵盤移動卡片（方向鍵 10px／Shift 50px、Alt＋方向鍵改大小，一次按住算一步；要處理 Alt＋↑↓ 目前是排序）、手機細修（「全部看得到」、拉伸角落反向縮放、≤900px 外層不捲、iOS 實機）。

### 待 Andy 實測（回答「1.是 2.否…」即可）
1. 編輯器工具列有「吸附／自由」，左側歌詞面板沒有？
2. 切到自由，段落變成卡片，拖 ⋮⋮ 或標題列空白處能移動？
3. 點名稱鈕、字母條照常開選單，不會拖到卡片？
4. 拉卡片右下角能改大小，字跟著換行？
5. 把卡片放到別張上面，被壓到的會被推開、不會重疊？
6. ↶ 一次能把剛才的移動（含被推開的）整個復原？
7. 卡片放到畫面外，用滾輪／觸控板／手指捲得到；新增段落或復原時畫布自己捲過去，外面不亂跳？
8. 切回吸附再切回自由，位置還在；重新整理、切歌後也還在？
9. 手機打字（鍵盤打開）時正在打的那段撐滿畫面、好打字？

## 先前（仍有效）
- 261113-s3k 角色標記 Part B（?v=0.96.31）11 題實測尚未回覆：工具列「角色 ▾」面板、匯出在角色轉換處標 [角色名]、列印顏色、關掉「＋ 並排角色欄」入口。
- 261113-qlv 完整編輯器近全螢幕、桌機浮動列「移到段落 ▸」、底部 sheet 把手可拖（?v=0.96.29）待 Andy 實機驗收（上一份 handoff 的 9 題尚未回覆）。
- 261113-r05 角色標記 Part A（?v=0.96.30）的 12 題實測尚未回覆（浮動列「指定角色 ▸」、平移、復原、8 個上限）。
- 261113-lha 寬螢幕吸附版面（?v=0.96.28）已 push、待實機驗收：≥1600 寬＋滑鼠三塊並排，拖分隔線／標題列、設定「重設版面」。細節見 git log 66a14c9／d28e3ce／093e630。
- 261113-j3a 選取文字「移到段落 ▸」（?v=0.96.27）待實測：Mac 反白右鍵→選段→Cmd+Z；iPhone／iPad 浮動列。
- 0.96.26 韻腳地圖十點待 Andy 驗收；待：Worker 部署、sections.js 舊 resize 死碼、台語、-linux 截圖

## 0.96.38（2026-11-14）編輯器吸附分列＋右鍵選單＋動畫特效
- 吸附分列：段落的 `rj`（同列旗標）＋順序；純函式 js/sections-core.js（lhRowsOf／lhRowsZone／lhRowsDrop／lhRowsApply），拖放 js/sections.js（lhRowsDragTarget／lhRowsCommit），格線排版 js/canvas.js `_lhRowsLayout` ＋ css/panels.css 檔尾。標題列可直接拖（觸控只能抓 ⋮⋮）。
- 區塊：`align`（靠左／置中／靠右）、右鍵（標題列與空白處；文字框內維持瀏覽器選單）有複製段落／複製文字／刪除；刪除一律先問（lhAsk，js/ui-common.js 檔尾）。
- 電燈泡：已有情境／標籤時問取代／擴充／取消（js/ai-generate.js）。
- 畫布：touch-action:none，單指平移、雙指縮放自己處理；右鍵拖空白處＝手掌（js/canvas.js）。注意：加 overscroll-behavior:contain 會讓 canvas.spec 的 End 鍵測試失敗，別加。
- 主視窗：dock 非三直排時隱藏側邊分頁、標題列小三角形（.panel-fold-btn）；標題列加底色與 ⋮⋮；tooltip 改為 title 也浮出。
- 平板三直排：js/panels.js 檔尾 .pane-divider，寬度存 lh:panelW（rem）。
- AI 完成特效：js/ai-client.js 檔尾 lhAiNotice／lhFxBurst（WAAPI，無 @keyframes），受 lh:bgFx（設定「背景動畫與特效」）與 reduced-motion 控制，關閉時連 token 提示也不出。
- 導覽改 10 步（js/tour.js）。
- 待 Andy 手感確認：手機實機雙指／單指手勢、特效觀感。已知失敗：rhyme-map-ui:280（舊）。
- 0.96.39：已選字大字降兩級（1.75→1.25rem）、黏頂列改用 container 底色（去掉淡色塊）、保留池標題列加底色與左邊框。
- 0.96.40：tooltip 2 秒才出且淡底；dock 預覽加說明文字；分隔線十字路口同拉兩向＋隔空對齊（js/dock.js _dkCross／LH_DOCK_SNAP、#dockSnap）；自由畫布卡片移動貼齊其他卡片＋導引線（_lhCvSnap，Alt 關閉）；金幣特效放慢約 1.8 倍。
