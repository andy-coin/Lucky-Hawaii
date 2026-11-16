## 0.98.22.5（2026-11-16，已 push）
- 日冕：保留各自伸縮，再加平滑 sine 波（corona.waveAmp／waveFreq／waveSpeed；波長照日冕半徑、根部不擺、24 段）
- 客製顏色「強調色」去掉括號（避免換行）

## 0.98.22.4（2026-11-16，已 push）
- 日冕退回直線細絲（波浪像海草），改成每條各自慢慢伸長縮短、節奏錯開（starfx.corona.amp／speed；freq 拿掉）
- ⚙ 面板每組改 <details> 可收合，一開始全收；調過的值放開滑桿就存 lh:spTune（LH_KEYS 第 35 個，group ui），開宇宙時讀回；「還原預設」清掉
- tests：scan 35 鍵、word-space 齒輪測試先展開群組＋檢查存檔

## 0.98.22.3（2026-11-16，已 push）
- 客製顏色改名：頁面背景／面板底色／文字／強調色（邊框、按鈕）；label 加 for（index.html 頂部色盤＋偏好設定外觀分頁）
- 間距：拿掉 label 固定寬度（原本讓字看起來屬於左邊色塊），字貼自己的色塊、格子之間拉開（css/base.css .color-item）

## 0.98.22.2（2026-11-16，已 push）
- 日冕大小、光芒長度、恆星光暈大小改成「自己星系半徑的比例」（js/word-space.js _lhSpStarFx 的 Rg；glow.starSize 新滑桿，預設 0.5＝原本的 1/2）
- 光芒起點、粗細、熱浪幅度仍以字寬為單位

## 0.98.22.1（2026-11-16，已 push）
- 殘影：凝聚／沖散速度只算 trail.gather（預設 0.25）倍進殘影；尾巴收的柔邊 trail.edge 進滑桿；fade 改名「從尾巴收完」（js/word-space.js 殘影段）
- 日冕改成每條細絲一道往外走的波，現場畫（starfx.corona.n／amp／freq／speed），不再用預先畫好的圖
- 色標：拿掉「收起色標」鈕；分頁改成主畫面側邊分頁款（寬 --tab-w、高 4.5rem），貼左面板右緣正中間（_lhSpNavPlace）
- 換批三角形顏色改 --highlight-border（自訂顏色 UI 叫「邊框」的就是它；--border 是淡分隔線，命名容易混）
- 待驗：凝聚殘影手感、日冕波浪、齒輪仍開著

## 0.98.22（2026-11-16，已 push）
- 寫入 Andy 用 ⚙ 調好的數值（js/word-space.js LH_SP_TUNE／LH_SP_STARFX）；齒輪暫時還留著（LH_SP_TUNE_UI＝true），給新的熱浪、日冕扭動調參
- 殘影從尾巴收：停手後停 hold，再用 fade 時間從最舊的片掃到最新的片；速度為主（凝聚 gv 也算）、距離只佔兩成；片的濃度跟速度走（s.w）
- 恆星：刪掉扭曲光環；熱浪晃動獨立成 starfx.heat（a/amp/speed）；日冕兩層來回扭動＋微壓扁（corona.twist／twistSpeed）
- 換批按鈕：大三角形、無底座，顏色 var(--border)（css/panels.css .ws-nav）；拿掉沒用到的 --mix-light
- 測試：word-space 齒輪測試配合新群組與預設值
- 待驗：殘影尾巴收的手感、日冕扭動、熱浪預設值；調好後關掉齒輪

## 0.98.21（2026-11-16，已 push）
- 多專案：歌有 project 欄（沒有＝proj-default「我的歌詞」）；切換／新增／改名／刪除只在 ☰ 歌曲清單上方 .proj-bar（js/songs.js 專案區、renderProjectBar）；歌詞標題只顯示專案名（#songProj）。手機平板 proj-bar 會折行（css/panels.css .proj-bar）。
- 快照（js/snapshots.js，IndexedDB lh-snaps：blobs/snaps/trash）：定時（滑桿 關閉/10/15/30/60 分）＋每專案「最新進度」閒置 10 秒；只留 24 小時；歌曲內容雜湊去重。卡片展開看歌詞、單首還原；同專案最多 3 張三欄比對（lhSnapCompare）。
- 垃圾桶：刪歌／刪專案先放 trash（7 天）。垃圾桶寫不進去（沒有 IndexedDB）→ 退回整份備份 _lhDelFallbackBackup（js/songs.js），兩者都失敗才不刪；提示文字分兩種。
- 匯出分開：資料分頁「匯出這個專案／匯出全部專案」（創作內容 kind:content）、「匯出設定外觀」（kind:settings）、「從檔案匯入…」。存檔失敗橫幅的「備份全部」仍是整份（exportSession → lhBuildBackup，0.98.21 起也帶 projects、customWords），全部還原時寫回專案清單（js/safety.js lhApplyBackupReplace）。
- 修：創作內容檔按「全部還原」原本直接 return（js/song-io.js importReplaceAll kind 判斷）；還原後提示「N 首歌與專案」（#lh-restored-c=）。
- 安全快照（匯入、升級前）改 24 小時、最多 10 份（LH_BACKUP_KEEP_MS/MAX），升級前的也照這規則。
- 常用／一般／冷僻改篩選鈕（lhTierFilter、js/results.js）；拿掉批量標記、本機字庫覆寫（舊資料留著不讀不刪）；空位改儲存空間條。
- 貼上區塊 #pasteBlock（js/sections.js lhPasteBlock，事件改在 JS 綁，不用 onclick）；合併模式（canvas.js data-merge、sections.js lhMergeAssign/lhMergeJoin）。
- 宇宙：色標第二面板可收（.ws-legbtn 邊緣分頁、.ws-legclose）；標題兩行；fx 滑桿中途切換直接收尾 _lhSpFinishFx；殘影 hold 0–1 秒照位移量×速度；凝聚彈簧隨時間變硬（~9 秒到 90%、過衝 ~5.6%、~15.5 秒停）；第 3 級恆星光暈、第 5 級恆星日冕／輻射／扭曲 LH_SP_STARFX（透明度與速度在這裡調）。
- CSS 守則：px→rem、11px 字→12px、#000/#fff 改 --mix-dark/--mix-light（css/base.css）、wsBreath 搬到 base.css（測試白名單 +1）、拿掉 2 個新 transition；捲動底線變數 --sw/--sx 改 --sxw/--sxp（避開色票的 --sw）。手機平板快照清單不捲中捲、按鈕撐到 --hit。
- 測試：大量配合新介面更新（songs-delete 改垃圾桶、songs-backup 新增「創作內容與設定外觀分開」測試、storage 24 小時淘汰、golden han-poly-xing 與 3 張截圖重錄）。Mac 的 End 鍵是捲動：lyrics-editor 改用 → 鍵。
- 暫時的調參齒輪（宇宙縮放鈕左邊 ⚙，js/word-space.js LH_SP_TUNE／LH_SP_TUNE_ROWS／_lhSpTunePanel，css/panels.css .ws-tune）：殘影、光暈閃爍、混沌凝聚、第 5 級恆星日冕／輻射／扭曲都可即時調；「複製數值」→ Andy 貼回來寫死 → LH_SP_TUNE_UI 改 false 藏起來。重新整理會回到預設（沒存 localStorage）。
- 舊的 3 個壞測試都是測試過時：theme-r2 背景飄字（0.98.16 起第 3 級定格，改用第 4 級測）、wordlist-cache 非預設包（自己開的 context 沒開 __lhPacksOn）、rhyme-map-ui 鏡像對齊（約 1/6 機率拍到收尾中的畫面，改成連拍兩張一樣才比）。全套 1288 過、0 失敗。
- 待 Andy：用 ⚙ 調好數值按「複製數值」貼給 Claude。
- 待 Andy 實測：專案切換、快照比對、垃圾桶救回、合併模式、貼上區塊、篩選鈕、第 5 級恆星特效濃淡。

## 0.98.20（2026-11-16，已 push）
- 第 5 級混沌凝聚：改用跟「拖恆星沖散」同一套彈簧引力，剛度 1/4、阻尼 1/2（慢一倍、一樣的彈性）；起點仍撒在恆星周圍 2 倍直徑。舊時間內插版見 git 94f3f9d（js/word-space.js 位置迴圈開頭 w.gk）。
- 大風吹座位（_lhSpSeats，每 0.3 秒）：同一圈散開的行星照角度排序、整組轉最省路的偏移去坐空位，就近歸隊不交叉；省 2 成以上才換。沖散、凝聚都用。
- 殘影改時間切片（_lhSpDraw 開頭）：每 0.12 秒一片（0.75 倍解析度、最多 16 片），每片照當時速度停 0.06–1.46 秒再 0.4 秒淡掉 → 尾巴從尾端消失；疊影 0.35×0.5 透明、墊在字下；流星尾巴畫主畫布不留疊影。
- 打開 50% 的詞在畫面裡；100% 鈕改 100%↔50% 兩檔循環。
- 第 1 級：撤回輪流分配，改一個星系一個星系由內往外、每批 32 個原位浮現，間隔 120–260ms。
- 三個星系以內且最大的 > 其他總和：最大恆星釘在 (0,0)、不漫遊（_lhSpLayout）。
- 流星 hover／按住也顯示讀音全息框。恆星拖 18px 才算拖。
- 進宇宙時已保留的詞直接釘住連成星座（_lhSpShow），點一下照常取消。
- 多重宇宙左右三角換批（.ws-nav，左邊會避開左面板／色標面板，_lhSpNavPlace）。
- 色標移到第二層面板 .ws-legpanel，左面板標題旁三角開關（預設：短邊 ≥ 600 展開）；4 個字以上標題寫「N個字」。
- 右上縮放列下方加特效等級滑桿（.ws-tr／.ws-fx，跟偏好設定同一個值；手機 4、5 級警告沒做）。
- 主面板：點查詢器空白處取消選字（js/cards.js document click）；已選字／讀音鈕／AI 選字模式條放不下時兩側淡出（lhScrollCue、css/base.css .sx-l/.sx-r），新增字自動捲到最後，滑鼠滾輪可左右捲。
- 待 Andy 實測：凝聚速度感、殘影濃淡、色標面板預設開關。

## 0.98.19.3（2026-11-16，只升 ?v，已 push）
- 第 1 級每個詞浮現 0.7→1.6 秒，smoothstep 緩進緩出；浮現期間 busy，避免第 1 級「沒變化不畫」停在半透明。

## 0.98.19.2（2026-11-16，只升 ?v，已 push）
- 混沌凝聚時長加倍：8–13 秒（w.gd）。
- 全息面板分段浮現 STEP 300→150ms（_lhSpHoloDraw）。

## 0.98.19.1（2026-11-16，只升 ?v，已 push）
- 混沌凝聚起點：不撒滿整片宇宙，改成撒在自己恆星周圍、半徑＝星系半徑 2 倍（直徑＝星系直徑 2 倍）的圓內，均勻分布（js/word-space.js 位置迴圈 w.gx0）。

## 0.98.19（2026-11-16，已 push）
- 第 1 級進宇宙：刻意無聊、等速。
  - 份數改輪流分配，每份大小字混一樣多、畫圖成本一樣。
  - 固定間隔 0.25–0.4 秒，每個詞原位 0.7 秒從透明浮現；拿掉整張畫布淡入。
- 第 4 級：spiral 旗標，間隔照份數由長到短（`_lhSp.gapFn`，g0×(0.12+0.88(1-i/n)²)），整段約 2 秒、越發越快。
  - 實測「不」：前幾份約 0.6–0.9 秒（大字畫圖），後段 67ms。
- 殘影收尾：停留結束後 0.4 秒內擦除比例由 7% 以 u² 漸增到平常值，修「最後一下斷層消失」。
- 版本 0.98.19（safety.js、?v）。
- worktree：`../Lucky Hawaii-wt-{byok,editor,prefs,theme}` 用 git worktree move 收進 `.worktrees/`（都已合併，只有 .DS_Store 未提交）；.gitignore 加 `.worktrees/`；.claude/CLAUDE.md 加規則。

## 0.98.18.5（2026-11-16，只升 ?v，已 push）
- 修：選字多時破音字讀音鈕被擠到折行、凍結列長高（css/base.css「.results-header .polyphonic-chips」）。
  - 讀音鈕、已選的字都不折行、各自左右捲；已選的字最少 5em、讀音鈕最少 7.5em。
  - 手機：最少 3em／5em，塞不下整列左右滑。
  - 選字時隱藏「破音字：」標籤。
- AI 面板「選字模式」條（css/responsive.css .selected-chars-hint）：不折行，字那段左右捲，✕ 不縮。
- visual.spec 的 tablet lyrics／ai 截圖失敗仍是舊的（iPad 全寬），待重錄。

## 0.98.18.4（2026-11-16，只升 ?v，已 push）
- 觸控：恆星、行星、流星一碰到就定格；手指按著還沒拖時，整團（hc）也停住。撤回 0.98.18.2 的「等面板出來才定格」（那次誤會 Andy 的意思）。
- 滑鼠停在行星上：恆星照常旅行（維持）。
- 恆星光暈中心濃度 0.18→0.13。

## 0.98.18.3（2026-11-16，只升 ?v，已 push）
- 殘影折衷版（js/word-space.js `_lhSpDraw`）：
  - 殘影層的詞在上一格到這一格之間畫光帶（平頭線，寬 0.45 字高，透明度 0.28），疊影連成一片。
  - 快速縮放／拖曳（fastN > 0.12）會設停留時間 holdT＝0.8 秒×速度（上限 0.8 秒）；停留期間每格只擦 7%，結束後 0.22 秒每格擦 35%。
  - 換宇宙時重設 holdT。

## 0.98.18.2（2026-11-16，只升 ?v，已 push）
- js/word-space.js：看行星面板時恆星照常旅行（hc 只在 hw.star 時）；行星自己仍停公轉。
- 觸控按住恆星／行星：面板出來（d.held）前照常動；流星一碰就定格。drag 物件加 touch，位置迴圈用 dg 判斷。

## 0.98.18.1（2026-11-16，只升 ?v，已 push）
- js/bgfx.js `_lhBgUpdate`：第 4、5 級在星雲開著時也照跑落字動畫（拿掉 _lhBgFaint 定格條件），Andy：4、5 級是落字動畫。
- 第 5 級流星光暈：恆亮、淡很多（a×0.35）；只有字本身閃（cf 只留在疊加提亮）。

## 0.98.18（2026-11-16，未 commit）
- 殘影改成依速度調整（js/word-space.js `_lhSpDraw` 開頭，「漏水桶」）：
  - 每格累加縮放量 |Δln z| 與拖曳距離，桶子 0.3 秒時間常數漏掉。
  - 最快的基準：縮放每秒 e^2 倍、拖曳每秒 1800px。
  - 第 4 級只看縮放：不動就整張清，最快擦 30%。
  - 第 5 級取縮放、拖曳、gv（凝聚／沖散速度）的最大值：平常擦 82%、最快擦 28%。
  - 舊的 TRAIL／HOLD 時間式拿掉；換宇宙時重設桶子。
  - 實測：慢滾一格約 0.2、連續快滾約 1.0、停手 1.5 秒後歸零。
- 凝聚：時間扭曲 0.6→0.45（最快點約 2 成）。
- 星際穿越前段：0.5 秒加速放大到 3 倍（不透明），最後 0.2 秒衝到 6 倍並淡出。
- 殘影層改成「每個詞自己決定」：螢幕位移＋大小變化（w.spd，每格衰減 0.85）超過 1.5px 才畫進殘影層 TL，其他畫主畫布 M。
  - 殘影層在 mags／top 之前蓋上去，停住、釘住的詞永遠在最上層。
  - 縮放到最大後繼續滾不會再觸發（實測 zAcc≈0）。
- 小圖邊距 pad 0.6→0.85 字高（`_lhSpSprite`），光暈不再被切成方框；小圖面積約 +30%。
- 待 Andy 決定：放大後光暈粗糙／色階，提案「放大時解析度上限隨畫面內詞數調整」，需要先量記憶體。
- 行星全息面板：`_lhSpHolo(w, delay)`；滑鼠停在行星上等 LH_SP_HOLO_PLANET_WAIT（1.14 秒）再長，框長好約 1.9 秒（恆星的 2.5 倍）；觸控按住行星 0.875 秒。
  - 面板內容：讀音逐音節浮現（w.phon，注音／拼音跟詞卡一樣看 lastSearchType），下行寫詞本身。
  - 看面板的行星停止公轉（still 加 hw）。
- 版本 0.98.18（safety.js、?v）。已 push。

## 0.98.17（2026-11-16）
- 包含上一段「0.98.16 之後」的全部內容。
- js/word-space.js `_lhSpDraw`：第 4、5 級改成雙層畫布。
  - 字畫在殘影層（`_lhSp.tc`/`tctx`，每格擦一部分）。
  - 恆星光暈、流星光暈、hover 光暈直接畫在主畫布 M，每格清乾淨，最後把殘影層蓋上去；全息標籤畫在 M 最上層。修「縮放時光暈跟殘影疊出印記」。
  - 降到沒殘影的等級時放掉殘影層。
- 第 5 級殘影收回：平常每格擦 82%（原 70%），縮放擦 30%、共 1.2 秒（原 18%、1.5 秒），凝聚最濃擦 40%（原 25%）。
- 凝聚：時間扭曲 kg^0.6，最快點提早到約 3 成、之後長減速；時長 4–6.5 秒。
- 星際穿越 `_lhSpWarp`：舊宇宙先放大＋淡出 0.7 秒，第 0.5 秒起接星光線，光線開始 0.2 秒後換新宇宙。
- 恆星閃爍機率 ×0.4。
- 第 1 級換批 swap 'fade'。
- 等級名：3 精緻、4 生動（search-ui.js LH_FX_NAME、index.html ticks、tests/prefs-tabs 140）。
- 第 1 級大量詞仍分批（內圈先）出現：小圖要逐張畫，一次全部畫好再出現總時間一樣、但空白更久。已回覆 Andy，未改。
- 版本 0.98.17。

## 0.98.16 之後（未 commit，2026-11-16）
- js/word-space.js `LH_SP_LV` 重寫：
  - 保留詞五級統一：外框＋柔光＋呼吸 3%。
  - 第 3 級公轉 0.6、小星系不漫遊（新旗標 roam：第 4 級 1、第 5 級 1.8 倍速）。
  - 流星：第 1 級不動；第 2 級停著、透明度 5 秒一輪（cometPulse）；第 3 級直線（curve 0）；第 4 級原彎度；第 5 級彎度 2.5 倍＋光暈（`_lhSpGlowImg` 0.3）＋固定閃爍（cometHalo，cf）。
- 星座線光暈寬度約縮成 6 成：呼吸層 18/11/6.5/3.5，閃爍層 15/8/4/2.2。
- 第 5 級殘影：沖散或甩出去的行星速度也拉高 gv，最多 0.85。
- js/bgfx.js：第 5 級背景字數 1.9→2.8 倍。

## 0.98.16（2026-11-16，已 push）
- 起始縮放：約 40% 的詞在畫面內（`_lhSpFitZoom`，原 25%）。
- 五級重新分配（js/word-space.js `LH_SP_LV`）：
  - 1：fadeIn（整張畫布 0.9 秒淡入、原位出現、gap 0）；背景定格。
  - 2：drag 'fling'＋starStay（放手會滑、拖恆星整團搬）、keptGlow、lineGlow 'still'、swap 'fade'（換批淡出淡入，`_lhSpWhip`）。
  - 3：orbit 1、twinkle 0.4＋twFlat（只亮不放大）；背景定格（bgfx `_lhFxLv <= 3`）。
  - 4：拿掉 gather（回分批浮現），zoomTrail 1（擦 30%、0.9 秒）；背景字數 1.4 倍。
  - 5：gather 獨有、lineFlash 0.4/秒、zoomTrail 2：殘影一直都在（平常每格擦 70%，縮放擦 18%/共 1.5 秒，凝聚最快時擦 25%，`_lhSp.gv`）；背景字數 1.9 倍。
- 甩動摩擦 2.2→3.2。
- 恆星光暈 0.13→0.18，抽到閃爍時光暈暫時最多 2 倍。
- hover 字的提亮降成一層 0.45。
- 全息框最小 170×52。
- hover 恆星時那一團不飄、不漫遊、不被推：`hc`＋`cl.tOff`，放開後不跳。
- 實測（「不」1466 詞，ms/秒）：
  - 電腦：0 / 20 / 60 / 53.5 / 123.9
  - 模擬手機：0 / 39.5 / 193.8 / 195.2 / 320.5（45 格）
  - 網站 artifact 已更新（v6）。
- 已知：visual.spec「tablet lyrics／ai」截圖失敗，是之前「iPad 面板全寬」改動造成、不是這輪；待 Andy 同意後重錄基準圖。
- 待決：手機第 5 級固定 30 格？自動降格提案。第 1 級換批目前仍是鏡頭一甩（Andy 沒指定）。
## 0.98.15.6（2026-11-16）
- js/bgfx.js `_lhBgUpdate`：星雲開著（_lhBgFaint）時背景落字定格一張，不跑 RAF；lhBgFxFaint 改呼叫 _lhBgUpdate。
- js/word-space.js：
  - 恆星光暈（L4+ starGlow）改用快取光暈圖 `_lhSpGlowImg(rgb,a)`（128px 放射漸層，drawImage 放大）。
  - 第 5 級縮放殘影：`trailK`＝每格擦除比例，乘在星座線光暈、恆星光暈、hover 光暈上，避免殘影期間半透明光暈疊濃（Andy 回報滾輪縮放時光暈變另一個樣子）。
  - starHi：拿掉字的 shadowBlur 描層，改閃爍式 lighter 疊兩次（0.8k／0.5k）＋放大 6%。
- js/dict.js getCharMark 加 tone 參數（results.js／cards.js 傳 tone）：同注音不同聲調各自依讀音標冷僻（打 ㄉㄚˊ 冷僻、ㄉㄚˇ 常用）。Andy 確認一字兩卡一常用一冷僻是正常結果。
- 待決：自動降格（提案：連續 1–2 秒平均幀間隔超標→降 30 幀，10 秒後再試 60）、手機第 5 級固定 30 幀、筆電 dpr 1.5。

## 0.98.15.5（?v 破快取；已 push，待 Andy 手機驗 crash 是否消失）
- 記憶體修正（js/word-space.js _lhSpRescale 重寫）：只有畫面內＋外圍 1/4 的詞換成目前倍率，畫面外維持打開時的倍率 _lhSp.S0；倍率上限 LH_SP_SMAX＝觸控 4、滑鼠 6；一個詞一個詞直接換（拿掉 nspr 雙份）；一輪換完才讓星系圖重畫。第 2 級倍率 > 2 時不用星系圖。實測（模擬 iPhone）放到最大：「不」706 MB → 9 MB、「愛」272 → 10 MB；各級都 ≤ 17 MB。
- 第 1 級：idle（沒變化就不畫，保留的詞在呼吸才畫）＋整片呼吸改 CSS 縮放畫布（css/panels.css wsBreath、.ws-space.ws-breathe）。模擬手機「不」1466 詞：每秒 96 ms → 0。代價：呼吸時 hover 判定最多偏 1.2%（邊緣約 7px）。
- 第 4 級 fps 40 → 30（60Hz 本來就只有 30）。第 5 級手機 45 格不做（60Hz 只能 60 或 30），等 Andy 選。
- 測試：word-space、golden、layout 128 全過。

## 0.98.15.4（?v 破快取；已 push）
- 功能導覽文字（js/tour.js）照 Andy 給的改：第 2 步（同韻字卡）、第 3 步（一次找雙押、多押；觸控版「兩指縮放」）、第 4 步「空間更大」→「使用完整空間排版」。tour＋golden 47 全過。

## 2026-11-15 效能／記憶體實測（分級表網頁 https://claude.ai/artifact/NUoEJt5851vJEZdNq814Mf 已更新）
- **手機第 5 級 crash 最可能是畫布記憶體**：放大到最大（z 3 × dpr 2 → 小圖 S≈5.66），_lhSpRescale 把「所有」詞（含畫面外）重畫成高解析小圖：「不」1466 詞 706 MB、「愛」478 詞 272 MB，單張恆星小圖 15 MB；第 1～4 級格數低、每格 4ms 畫小圖，6 秒內沒畫完但最後一樣會到。**待 Andy 決定**：只重畫畫面內＋邊緣的詞、手機小圖倍率設上限、舊小圖盡早釋放。
- 效能（「不」1466 詞、CPU 4 倍降速，每秒毫秒）：1→96、2→40、3→165、4→316、5→370（只跑到 42 格）。斷層：2→3 ×4.1 最大、3→4 ×1.9；第 1 級比第 2 級貴（沒用星系一張圖＋整片呼吸）；第 4 級 fps 40 在 60Hz 實際 30。建議見網頁，都還沒改。

## 0.98.15.3（?v 破快取；已 push）
- 星雲恆星 hover 光暈改柔和（js/word-space.js `_lhSpDraw` 的 starHi）：漸層中心 0.8→0.3、stop 改 0/0.3/0.6/1＝0.3/0.16/0.06/0；字發光描層 3→2 層（透明度 ×0.6）；lighter 疊加 0.5→0.2。R 上限、k≥0、0.3 秒淡入照舊。
- 主畫面搜尋國字：搜尋的字無條件排第一張（js/results.js：新 `_lhSearchPins` 從 searchedTerms「安→ㄢ」取字；`_makeJob` 每組把它排最前；displayResults 篩選後被冷僻／破音篩掉的放回來；同聲韻／同聲調模式含該字的組排最前）。「安 打」每個字各自在自己那組第一；注音／拼音不動。注意：打 在資料裡被標冷僻，現在 hideRare 下也會出現。
- 測試：word-space + golden + render + rhyme-journey + parity + smoke 全過；golden 15 檔因排序改變重錄（UPDATE_GOLDEN=1）。

## 0.98.15.2（?v 破快取；已 push）
- 超大星系宇宙（非 organic）也不死釘中央：整組置中後再隨機偏移，最多最大星系半徑 25%（橫向，縱向 ×0.8）；只有一個星系也偏。全是流星（clusters 空）時跳過（不然 Math.min() 爆掉、星雲打不開——word-space.spec 抓到）。

## 0.98.15.1（?v 破快取；已 push）
- 星系擺放加隨機（_lhSpLayout）：星系 > 2 個且最大的佔不到一半詞數 → organic：擺放順序用 n×(0.4–1.6 隨機) 排、螺旋起始角隨機、每步角度 ±0.35 rad、距離 ×0.8–1.2；否則照舊（最大的先放中間）。最後一樣整組外框置中。「愛」每次打開位置都不同；「不」第一批（1457＋9）照舊。

## 0.98.15（2026-11-15 已 push，待 Andy 實機驗）
- 版號 0.98.15（index.html 44 個 ?v、js/safety.js、README、.claude/CLAUDE.md）；內容＝0.98.14.1–.15 全部小修＋下面這條。
- 星系擺放（js/word-space.js _lhSpLayout 黃金角螺旋之後）：整組排好後把所有星系外框（x±r、y±r）的中心移到 (0,0)，最大星系不再釘在原點；畫面打開仍對準 (0,0)。「愛」實測最大星系落在 (−28,−33)。
- 測試：word-space、golden、layout、tour、prefs-tabs 138 全過。

## 0.98.14.15（?v 破快取；已 push）
- 修 hover 恆星「先閃一下」：holo.t0 用 performance.now()（事件當下），rAF 的 t 可能比它早 → k 負數 → 負的 globalAlpha 被忽略、沿用 1 → 第一格全亮。starHi 的 k、_lhSpHoloDraw 的 age 都夾 ≥ 0。
- 恆星 hover 光暈再加強但封頂：R＝min(max(60, 字寬)×1.8, 星系半徑×縮放×呼吸 / 2)；中心 0.8／0.35 處 0.38／0.7 處 0.1；字發光 shadowBlur ≤ R×0.6、描 3 層；lighter 0.5。

## 0.98.14.14（?v 破快取；已 push）
- 恆星 hover 發光退回 0.98.14.6 的強度（R×1.3、中心 0.5、shadowBlur 26 兩層、lighter 0.35）：.12 那次加強是因為 bug 看不到，修好後太亮。
- 凝聚：行星不等恆星（lead 0）。實測原本行星在恆星後 0.78–1.95 秒才 born，加上亂撒在畫面外、easeInOut 慢起步，看起來像等恆星完成。

## 0.98.14.13（?v 破快取；已 push）
- 星際穿越偷跑改 0.7 秒（GO＝max(0.02,(T−700)/T)，T＝730 → 幾乎一開始就換內容），穿越完就看得到恆星。
- 凝聚模式恆星由小變大：w.kb 乘 0.2→1（easeOutCubic），比淡入晚 0.35 秒開始、1.4 秒長完；光暈跟著 kb 一起長。實測 0.5 秒 0.43 倍／透明度 0.36，1.2 秒全長。

## 0.98.14.12（?v 破快取；已 push）
- 凝聚：行星聚回來放慢一倍 3.2–5.2 秒（w.gd）；恆星不變（1.4 秒淡入、先亮 0.7 秒）。
- 恆星 hover 發光大幅加強並修 bug：原本滑鼠停住時恆星被黑洞放大走 mags 分支，發光那段根本沒跑到 → 抽成 _lhSpDraw 內的 starHi()，一般／mags／top 三條路都呼叫。光暈半徑 ×2（最小 80px）、中心 0.85；shadowBlur 48 起描 4 層＋lighter 0.6。

## 0.98.14.11（?v 破快取；已 push）
- 星系呼吸週期改分段線性（_lhSpLayout cl.bp）：10 詞 5.5 秒 → 200 詞 20 秒 → 885 詞 60 秒（封頂），每團 ±15% 隨機；幅度不變（±3% 起，每 50 詞 +0.4%）。例：50 詞 8.6 秒、100 詞 12.4 秒、400 詞 31.7 秒、600 詞 43.4 秒。

## 0.98.14.10（?v 破快取；已 push）
- 第 5 級星際穿越：換內容的時間點從一半（365ms）提前到結束前 0.5 秒（GO＝(T−500)/T，約 230ms），新星系形成跟光線重疊，不再有一瞬間全空（_lhSpWarp）。
- 穿越中再換批不再被忽略：記在 _lhSp.warpNext，播完接著穿越一次（word-space.spec 換批測試靠這個）。

## 0.98.14.9（?v 破快取；已 push）
- 凝聚模式浮現順序：所有星系的恆星放在 queue 第一份（各在自己位置，不置中），lead 0.7 秒後行星才開始一份份聚過來（_lhSpShow queue、_lhSpReveal bornAt＋g.lead）。

## 0.98.14.8（?v 破快取；已 push）
- 凝聚：恆星不亂撒，在自己的位置由透明 1.4 秒浮現（光暈跟著 w.alpha），行星照舊亂撒聚回。
- 全息標籤：只有「中間」才加（N）；字首／字尾不加。

## 0.98.14.7（?v 破快取；已 push）
- 凝聚（第 4、5 級，LH_SP_LV gather）：打開／換批時每個詞（流星除外）先在 ±bound 範圍亂撒（w.gx0/gy0），1.6–2.6 秒用 easeInOutCubic 聚回軌道（_lhSpFrame 浮現那段）；不凝聚的等級照舊從星系中心散開。只多一道位置內插，不增加繪製量。

## 0.98.14.6（?v 破快取；已 push）
- 全息標籤：細拆的第幾字併進位置 →「不（ˋ） · 中間（3） · 四字」（_lhSpClParts）。
- 看全息標籤的恆星大幅提亮（_lhSpDraw 主迴圈 blit 之後）：放射光暈（中心 0.6、0.45 處 0.25）＋一般疊法描兩次彩色 shadowBlur（淺色主題也看得出）＋少量 lighter 提亮，0.3 秒亮起。

## 0.98.14.5（?v 破快取；已 push）
- 第 5 級縮放殘影（Andy 是「要加」不是要修）：LH_SP_LV[5].zoomTrail；_lhSpDraw 開頭縮放後 0.45 秒內不整張清，改 destination-out 擦淡（前 0.12 秒每格留 40%，之後線性收到全清）。坑：擦的 fillStyle 要明設 '#000'，沿用上一格的透明漸層會什麼都擦不到（整片糊掉）。

## 0.98.14.4（?v 破快取；已 push）
- 星雲按「100%」只回倍率（以畫面中心縮放），不再把位置歸零（js/word-space.js ws-pct 按鈕）。

## 0.98.14.3（?v 破快取，LH_APP_VERSION 仍 0.98.14；已 push）
- 星座線光暈（js/word-space.js _lhSpDraw「星座線」）：寬度跟著縮放 zk＝√(z / 這次的 100%)，夾 0.45–2.4；第 4 級起光暈 4 層由外而內（30／18／10／5 px × zk，透明度 .025／.045／.08／.14），整體慢呼吸（5.6 秒一輪，0.72–1）；主線 1.5px × zk（夾 0.7–1.6）、shadowBlur 5 × zk。第 5 級閃爍照舊 1.2 秒隨機，4 層寬度也乘 zk，跟呼吸不同步。

## 0.98.14.2（?v 破快取，LH_APP_VERSION 仍 0.98.14；已 push）
- 全息標籤文字改格式（js/word-space.js _lhSpClParts、_lhSpToneMark；_lhRelShow 傳 cfg.poly）：關聯詞＝國字 · 位置 · 字數（＋細拆的第N字）；這批詞裡該字有 2 種以上讀音（含變調）才在國字後加聲調符號「不（ˋ）」，一聲用 ˉ。顯示全部＝「一聲 · 四聲」。
- 實測：「不（ˋ） · 中間 · 四字 · 第3字」、「愛 · 字首 · 兩字」、「一聲 · 四聲」。

## 0.98.14.1（?v 破快取，LH_APP_VERSION 仍 0.98.14；已 push）
- 全息標籤分段慢慢浮現（js/word-space.js _lhSpClParts／_lhSpHoloDraw）：折線 0.52 秒 → 框 0.24 秒 → 注音 → 字首／中間／字尾 → 幾字 → 第N字（每段隔 0.3 秒、淡入 0.22 秒），段落之間淡色「·」隔開；最後才出「N 個詞」。例「ㄅㄨˋ · 中間 · 四字 · 第3字」。圖例標籤沒改。

## 0.98.14（2026-11-15 已 push，待 Andy 實機驗）
- 版號 0.98.14（index.html 44 個 ?v、js/safety.js、README、.claude/CLAUDE.md）；內容含 0.98.13.1／.2 的細拆星系、四字、手機面板。
- 手機特效警告（js/search-ui.js prefsFxRange 的 change）：短邊 < 600 且觸控，從 3 級以下放手停在 4／5 級 → lhAsk「手機開「精緻／浮誇」特效？」；按「改回預設」退回 3 級。
- 恆星全息標籤（js/word-space.js _lhSpClLabel／_lhSpHolo／_lhSpHoloDraw，_lhSpDraw 最後畫）：滑鼠停在恆星、或觸控按住恆星 0.35 秒 → 從恆星側邊中間拉折線（斜線→橫線，0.26 秒長出來）到框：分類名稱（例「字首兩字 ㄞˋ」）＋「N 個詞」；框角亮角＋淡掃描線；右邊放不下往左。觸控按住放手就收、這次放手不算點擊（drag.held）。圖例標籤也改用 _lhSpClLabel。
- 測試：word-space、golden、layout、tour、prefs-tabs 133 全過；模擬 iPhone 按住恆星、警告、改回預設都驗過。

## 0.98.13.2（?v 破快取，LH_APP_VERSION 仍 0.98.13；已 push）
- 關聯詞字數加「四字」：2／3／4／m（m＝五字以上）。js/word-space.js LH_REL_LEN、LH_REL_LEN_N、_lhRelCat、_lhWsRelList 篩選、字數按鈕（4 顆）；單字配色 3×4＝12 色相；多字配色 li 色偏 [-18,-6,6,18]；圖例排序加第幾字。tests/word-space.spec.mjs 字數按鈕 4 顆。
- 手機（≤600px）展開的星雲面板也貼上緣（拿掉 3.5rem 下移），跟收合鈕同位置；iPhone 13：面板右緣 138px、縮放列左緣 213px 不重疊。
- 「不」現在 10 批 [1466,885,619,574,501,507,467,295,407,295]；最大星系＝中間四字ㄅㄨˋ第3字 1457（XX不X）。
- 「空宇宙」是 Andy 看錯（其實是星系太大跑不出來），不用追。

## 0.98.13.1（小修，只改 ?v 破快取，LH_APP_VERSION 仍 0.98.13；已 push）
- 導覽第一步刪掉「字中間加空白（洋 流）…」那句（第二步已講）。
- 關聯詞星系細拆（js/word-space.js _lhRelShow groupOf）：基本 key 字|位置|字數|讀音 超過 500 詞 → 加第 5 段「第幾個字」；顏色依第幾字轉 ±24° 色相，圖例加「第N字」。
- 分批（_lhSpPages）：批數上限＝星系數(>2 詞)/2，保證每個宇宙至少兩個星系；最大的 B 個星系先各佔一批，再從最小的星系依序配給最大的那批（大配小），其餘照舊放最少的那批。
- 實測：「不」9 批 [1786,1036,644,640,510,477,310,318,295]，每批 2 星系；最大星系仍 1776（「不」在 4 字詞第 2 字）→ 若還嫌大，下一步再細拆（例如照字數 4／5／6 字）。「一」6 批、「的」2 批、「愛」1 批。
- 「空宇宙」電腦上沒重現（舊算法每批都有詞）；懷疑是 iPad 舊詞庫或字首／字尾篩選後整批沒符合 → 待 Andy 說明在哪個操作下看到。
- 測試：word-space、tour、golden 53 全過。

## 0.98.13（2026-11-15 已 push，待 Andy 實機驗）
- 版號 0.98.13（index.html 44 個 ?v、js/safety.js、README、.claude/CLAUDE.md）。
- 手機 vs iPad「不」關聯詞數量不同（6016 vs 2991）：iPad 存著舊設定 lh:lexiconPack＝新酷音（含「不」2957 詞），詞庫包選單 0.98.05 起藏起來切不回來。修：js/wordlist.js resolveLexiconPack 只有 window.__lhPacksOn 才讀存的包，否則一律預設 v096；tests/helpers.mjs 開 __lhPacksOn 讓舊測試照舊。
- 縮放 100% 重新定義（js/word-space.js）：100%＝這次打開時自動抓的縮放 _lhSp.z100（_lhSpFitZoom，約 25% 的詞在畫面裡）；按 100% 回到該倍率＋位置歸零。拿掉 0.98.11.1 的照螢幕縮 Z100。實際倍率下限 LH_SP_ZMIN 0.25→0.1，打開時的自動縮放下限 LH_SP_FIT_MIN 0.2（手機 0.1 只剩恆星看得清）。模擬：iPhone「不」0.2、「一」約 0.2；iPad「不」0.195、「一」0.27。**Andy 若覺得太小／太大→調 LH_SP_FIT_MIN 或 25% 的比例。**
- 分批浮現：_lhSpShow 的 queue 把每個星系切成 48 詞一份（恆星、內圈先），間隔 16–140ms；第一批字約在打開動畫結束（1.2 秒）就出現。
- 手機（≤600px）面板收合只剩小三角形、移回右上縮放列同一排（css/panels.css .ws-panel.min 的 600px media）。
- 測試：word-space、layout、golden、tour、lexicon-packs、corrections-site 165 全過。

## 0.98.12（2026-11-15 已 push，待 Andy 實機驗）
- 版號 0.98.12：index.html 44 個 ?v、js/safety.js、README、.claude/CLAUDE.md。
- 星雲左側面板：短邊 < 600px（手機直／橫）打開時預設收合（_lhSpShow 裡 .ws-panel.min）。
- 手機兩指縮放修（待 iPhone 實測；Chromium 模擬本來就正常）：第一指 pointerdown（isPrimary）先清掉殘留的手指紀錄 _lhSp.pts；擋 Safari gesturestart/gesturechange。若 iPhone 仍不行→下一步加 touchstart/touchmove 的備援縮放。
- 測試：word-space＋layout＋golden 128 全過。
- 0.98.12 追加（第二次 push）：Info 版本號改讀 LH_APP_VERSION（index.html #aboutVer、js/search-ui.js toggleAbout），不再寫死。
- 功能導覽（js/tour.js）：lhTourSteps() 依裝置挑步驟——滑鼠且非 sheet＝11 步；平板／手機跳過 mouse:true 的「自己排版面」＝10 步，有 bodyTouch 的換觸控說法（兩指縮放、長按段落名稱、拿掉「停一下浮出說明」）。範例「安打」全改「洋流」、第一步例子改成跟搜尋框一樣「ㄞ」「ai」「唉」「唉呀」；換批滑桿說明改「上方」。tests/tour.spec.mjs 改用 _lhTour.steps、手機期望 10 步。tour＋golden 47 全過。

### 以下 0.98.11.1 內容一併進 0.98.12
- 手機星雲縮放（js/word-space.js）：根本原因＝恆星加成「每 50 詞 +0.25 倍」沒封頂，880 詞星系恆星 11.8 倍、內圈 5 倍，自動縮放縮到底 0.25 還框不住。改成 300 詞封頂（最多 3 倍，starS 那行）。
  另外 _lhSpZ100()：螢幕短邊 < 800px 時 100% 照比例縮（手機 390 寬約 0.73 實際倍率）；手動縮放下限也跟著縮（_lhSpZoom）；打開時的自動縮放下限仍 0.25。iPhone 模擬：「一」關聯詞打開 34%、字大小正常。
- iPad 直式／橫放手機：底部面板（歌詞、AI）寬度改成 100%（css/responsive.css .side-panel width；tests/layout.spec.mjs 底部面板尺寸期望值跟著改）。
- 手機／平板搜尋框按 Enter／「搜尋」→ blur 收鍵盤（js/search-ui.js keydown，只在 pointer: coarse）。
- 星雲左側面板加收合／展開鈕（js/word-space.js _lhSpBuild 的 .ws-head／.ws-fold，面板加 .min；css/panels.css .ws-head 那幾行）：收起只剩標題列、寬度縮成一行。不存檔，每次打開都是展開。
- 測試：layout＋word-space 86 個全過。

## 0.98.11（2026-11-15 收工）
- 版號升 0.98.11：index.html 44 個 ?v、js/safety.js LH_APP_VERSION、README、.claude/CLAUDE.md。
- 內容＝0.98.10.1～.5 的小修：分批 600±30 不拆星系、超大星系散開、關聯詞依讀音（含聲調）拆星系、100%＝實際 1.5 倍、色偏套全部星系、字卡縫不算空白、星座線一起閃、星雲雙擊才取消、星座線避開星系色。
- 只動星雲，跑星雲／render 相關測試即可；Andy 確認不用補跑全套。

## 0.98.10.5（小修，未升版號）
- 星座線顏色避開星系色（js/word-space.js _lhSpLineGoal，_lhSpFrame 裡漸層 cLineNow）：釘住的詞色相照彩度加權取圓周平均→線用對面色（hsl 75%、深色主題 68% 亮／淺色 40%）；平均向量長度 < 0.45（太分散）→白色（淺色主題用主文字色）；全灰→主題強調色。每次釘／取消重算，約 0.6 秒漸層。
- 實測：紫色星系 → 黃線；「長」跨 2、5 個星系 → 藍線。

## 0.98.10.4（小修，未升版號）
- 第 5 級星座線閃爍改成所有線一起閃（每秒約 20% 機率、1.2 秒；js/word-space.js _lhSpDraw「星座線」的 _lhSp.lineTw）。
- 星雲點空白：一律雙擊才全部取消（拿掉「只選一個時單擊就取消」）；tests/word-space.spec.mjs 跟著改。主畫面字卡區點空白仍是單擊取消。

## 0.98.10.3（小修，未升版號）
- 星雲縮放校正：顯示的 100%＝實際倍率 1.5（js/word-space.js LH_SP_Z100；_lhSpApplyView 顯示、% 按鈕回到 1.5）。實際上下限 0.25–3 沒動 → 顯示約 17%–200%。
- 字卡點空白取消全選：點到字卡之間的縫（.results-grid 本身）不算（js/results.js resultsContainer.onclick）。
- 色偏（明暗 ±0.08、色相 ±35°）改成所有星系都套、每一級都開（_lhSpLayout tintB）；只在打開時算，實測「不」2493 詞打開 81ms。

## 0.98.10.2（小修，未升版號）
- 關聯詞星系再依「這個字在詞裡的實際讀音（含聲調、變調）」拆開：key＝字|位置|字數|讀音（js/word-space.js _lhRelCat 的 rd、_lhRelShow 的 rank/colorOf）。不受「過濾破音字」影響。
- 顏色：每個字詞數最多的讀音用原色，其餘依序明暗 ±0.14／±0.24＋色相 ±18°；圖例標籤後面加讀音（例「字首多字 ㄧ（880）」）。
- 實測「一」：3437 詞分 6 批 [880,786,444,440,439,448]（ㄧ／ㄧˊ／ㄧˋ 拆開後各批較平均）。

## 0.98.10.1（小修，未升版號）
- 分批改「一批約 600±30」，星系一律不拆（js/word-space.js _lhSpPages、LH_WS_SPACE_MAX=630）；同條件的詞放同一個宇宙。
- 超大星系（150 詞起、550 封頂）：每個詞多一點明暗與色相偏移（±35°，量化成 5° 一階）、圈距最多 1.9 倍、每圈只放 1/1.6 → 散得開（_lhSpLayout 的 big／RING／tintB）。
- 實測「一」關聯詞：3437 詞分 6 批 [907,877,603,574,293,183]——超過 600 的星系自己一批，所以後面幾批較少。
- 待驗：超大星系散開後鏡頭是否仍框得住、顏色落差夠不夠。

## 2026-11-15 v0.98.10（已 push；全套 1252＋修正後重跑通過，只剩 rhyme-map-ui:280 舊失敗）
- 關聯詞（js/word-space.js _lhRelShow／_lhRelApply）：一律拿全部的詞，照「字×位置（首/中/尾）×字數（2/3/多）」拆星系（key "字|首|2"）；字首／字尾、兩字三字多字＝_lhRelApply 把不符合的星系（含流星）收回中心淡出（w.off／w.vis 0.45 秒），不重排；換批也重套。顏色 _lhRelColor：一個字＝9 等分色相；多個字＝字分 LH_WS_TONE_C 色系，位置調 l ±0.09、字數調 h ±14（不支援相對色走 color-mix）。圖例按鈕 _lhSp.legBtns 跟著藏。
- 分批 _lhSpPages：多批時 >150 詞的星系平均拆到各批（每批混到各種星系，不會一整批同一色）。
- 星座 55/35/10；第 5 級連線閃爍三層（0.95／0.45／0.18）。星際穿越光線顏色＝隨機抽畫面上看得到的詞色。
- 主畫面：常用／冷僻／取消 → 常用／一般／冷僻（batchMark('normal')）；字卡上的常用度徽章只顯示、不能點（拿掉 handleBadgeClick、cycleCharMark）。
- 凍結的數量列 .results-header.has-sel 改 padding-bottom 1.25rem、margin 0：凍結區含下方留白，字卡不會貼著文字切齊（桌機／iPad／手機都看過）。
- 測試：golden 只有 htmlSha1 變（徽章拿掉 onclick），已 UPDATE_GOLDEN；render.spec showAllRare 和 corrections-site cardCount 明確關掉「過濾破音字」（預設已打勾）。

## 2026-11-15 v0.98.09 追加（版本號不變）
- 星雲（js/word-space.js）：星座 50/41/9（Andy 給 55/45/10 加起來 110，等比例換算）；LH_SP_RING 46→64；恆星光暈半徑＝星系半徑 cl.r 的 1/2、中心不透明度 13%；流星速度 3 倍（135–270）、轉彎速率同乘 3（看起來曲率仍是 0.98.08 的 1/2）、尾巴長＝0.8 秒路程；hover 不再設 w.hot（不定格、不畫膠囊），隱藏鈕跟著 _lhSp.hover；黑洞放大照字大小打折（恆星 0.2 倍，(2.2−s)/1.4）；第 4、5 級 starGlow（恆星後面放射漸層）；第 5 級拿掉 keptFlash、keptBreathe 0.025＋clBreath；第 3、4 級加 whole；keptBreathe 改成數值＝幅度。
- 分批（_lhSpPages）：一批約 500±50、星系整團不拆（超過 550 的星系才切，切法是輪流發牌 i % n，每塊都有常用詞當恆星）；批數＝round(n/500)，星系由大到小放進最少的那批；‹宇宙 n/N› 改成 .ws-page-range 滑桿＋數字（目前那份用重點色，--a/--b）。
- 背景飄字（js/bgfx.js）：1、2 級也有畫布，定格一張不跑（_lhBgUpdate）；lhBgFxIsOn 仍是 3 級以上。
- 中間面板：.options container query，616px 以下藏按鈕圖示、540px 以下換行後靠左；關聯詞彙／顯示全部上下各 12px 置中（.ws-rel-btn margin）。搜尋框上下 padding 縮成約 0.88 倍高；提示字「例如：ㄞ/ai/唉/唉呀」。
- 偏好設定：分頁改名「韻腳地圖」；第 4 級叫「精緻」；子標題統一 0.9rem 主文字色、內容縮排 --pf-in 0.625rem（panels.css 檔尾）；查詢分頁加「顯示與篩選」子標題；韻腳地圖分頁說明移到預覽上面；AI 分頁兩條分隔線併一條。
- 英文：AH＋M（come、some、from）→ㄨㄤ。
- 「過濾破音字」預設打勾（index.html checked；golden.spec 沒指定時明確設 false，golden 檔不用重錄）。
- 星星閃爍：機率 0.015、放大 10%、發光疊兩次。觸控裝置的 .ws-len／.ws-pos 按鈕 min-width 0（44px 最小寬讓三顆擠成直排）。
- index.html 的 ?v= 改成 0.98.09.2（只破快取，畫面上的版本號 LH_APP_VERSION 不變）。**待辦：最後跑一次全套（Andy 要求最後一起測）。**
- 點空白（_lhSpEvents end，pan 沒拖動）：只選一個＝單擊就取消；雙擊（400ms、24px 內）＝全部取消，都不問（_lhSpClearNow 也取消保留）；點過詞會重設 _lhSp.blankTap。
- 星系呼吸照大小：u＝(n−10)/50，週期 bp×(1＋0.1u)、幅度 cl.ba＝0.03＋0.004u（連續）。
- 恆星放大後：內圈詞跟著放大（boost(k)＝1＋extra×0.35×0.5^k，extra＝恆星加成−1）、第一圈半徑多推 0.8×extra 圈、放大的圈間距×boost（_lhSpLayout 的 szOf）。
- 修：換批滑桿移出面板後，畫布的 pointer 處理沒排除 .ws-pages（點不到）；拿掉旋臂開關時誤刪 _lhSpWarp（第 5 級換批報錯）→ 補回，word-space.spec 加真點擊換批測試（第 3、5 級）。
- 詞卡選取（0.98.09）：.ws-card.kept 外框＝savedWords 有沒有這個詞；點＝保留／再點取消；renderSavedWords 呼叫 lhWsSyncKept 同步（保留區打叉、清除全部都會更新）；換關鍵詞再回來照 savedWords 畫。不用 .selected（cards.js、report.js 會抓字卡的 .selected）。
- 隱藏的詞只在這次星雲有效：lhWsClose 清 _lhWs.hidden；換批也濾掉已隱藏的。接任恆星彈簧 k12、阻尼 7（實測約 1.3 秒接手，原本 2.1 秒以上），接任中就畫恆星光暈。
- 恆星照星系大小加成：starS＝sizeOf×(1＋clamp(log10(n/10),0,1))，只放大不縮小（10 詞以下×1、100 詞×2、之後每 50 詞＋0.25）。
- 小星系漫遊（第 3 級起，L.comet）：3–5 詞 32–54、6–10 詞 12–22（流星 135–270），cl.vx/vy 移動家的位置 hx/hy，出 bound 從對面回來。
- 旋臂：拿掉開關，>25 詞的星系一律旋臂、其他同心圓（_lhSpLayout 的 spiral 變數）。
- 旋臂模式（實驗）：星雲左上「旋臂」鈕切換 _lhSpSpiral（不存檔）；克卜勒 om∝(r0/r)^1.5、每星系 2–5 條臂（cl.arms/arm0/twist/ecc）、一圈只放 55%。
- 第 5 級換批＝星際穿越 _lhSpWarp（.ws-warp 疊一張畫布畫星光線 1.1 秒，舊的放大模糊、半途換、新的由小拉近）；第 1–4 級照舊鏡頭一甩。換批滑桿移到畫面正上方中間（窄螢幕 760px 以下移到下方）。
- 背景落字各主題 --fx-opacity +0.04（預設主題 0.28）。第 5 級改名「浮誇」。
- 換批過場 _lhSpWhip：畫布用 element.animate 甩出（240ms、往翻頁方向、模糊 14px＋淡出）→ 同一個 onfinish 裡換內容 → 從另一邊甩進來（420ms）；減少動態直接換。
- 星座線：第 4 級 lineGlow（底下兩層粗淡描線）、第 5 級再加 lineFlash（每條線各自隨機閃，1.2 秒、每秒約 15%，狀態記在 chord 陣列 sg.tw）。
- 恆星光暈與流星尾巴改在 _lhSpDraw 分流（top／mags）之前畫：hover 放大、釘住時不再消失。
- 修 bug：恆星光暈／流星尾巴用字串改 rgba，遇到 oklch 主題色整格報錯（第 4、5 級只剩背景）→ _lhSpRGBA 先畫到 1×1 畫布讀回 RGB；word-space.spec 加測試。第 4 級保留詞只剩外框（拿掉 keptGlow、keptFlash）。
- 韻腳地圖分頁：說明併成預覽的子標題「…大小和顏色。預覽：」一起凍結；模式三鈕外框貼齊（#mapSettingsSection .rm-seg padding 0）。
- 導覽（js/tour.js）：結構沿用，只更新「一次找雙押」（星雲操作、換批滑桿）和「偏好設定」兩步的文字。

## 2026-11-15 v0.98.09（已 push，待 Andy 實機驗收；全套 1279 通過，rhyme-map-ui:280 是舊的）
- 中間面板：「顯示全部」改成 index.html #wsAllBtn（跟 #wsRelBtn 同位置、滿版，查整個詞才出現；word-space.js _lhWsDraw 只設 disabled）；.results-section 上距 1.25rem、.ws-header 下距 1.25rem（數量列上下等距）；字卡模式 #batchPanel 緊接比對分頁、回報 margin-inline-start:auto 靠右，選項列小按鈕 padding 改 sp-2 才放得下（css/panels.css 詞卡段落）。平板截圖已更新。
- 流星：曲率 0.002–0.008（原 0.015–0.05）；尾巴改一條漸層漸細三角形（照前進方向、長約 1.6 秒路程），拿掉 trail 陣列。
- 行星速度：每圈照該圈詞平均常用度調速（1.55−1.1×avgN，大詞圈慢約 0.45 倍、小詞圈快約 1.55 倍；同圈共用速度不互撞）。
- 星座第 4 點起：一條 40%／兩條 45%／三條 15%（_lhSpPin）。
- 耗電：離開星雲後實測 rAF 有停、CPU 回到進去前；持續吃的是背景飄字（bgfx.js）。飄字改成每字一張小圖（_lhBgSprite，換主題／dpr 重畫），第 5 級上限 60fps；關星雲時清掉 _lhSp.words／queue 等（放掉小圖與星系圖）。無頭量測第 5 級閒置 12%→8.7%。
- 英文：ER 不再走暗 L（world、girl→ㄦ）；AH 單音節 ㄜ／ㄤ（love、up→ㄜ，done→ㄤ）；個別字 LH_EN_WORD（what ㄚ、one/won ㄨㄢ、fun/run ㄨㄤ）；AH T 的 -rate→ㄨㄟ（accurate）。待確認：AH＋M（come、some、from）維持ㄢ沒動。

## 2026-11-15 v0.98.08 追加（版本號不變；已 push，全套 1283 通過）
- 搜尋框提示字改「ㄞ/ai/唉/唉呀」，手機電腦同一句（拿掉 js/search-ui.js 換提示字的程式）。
- 星雲：第 1 級不轉（orbit 0，只剩整片呼吸＋保留呼吸），第 2 級 24fps（LH_SP_LV）。
- 點選判定（_lhSpHit）：重疊時選中心離游標最近的詞（黑洞放大讓鄰居蓋住游標下的詞，原本會點到鄰居）。
- 英文韻腳逐條重看（js/rhyme-core.js LH_EN_VOWEL／LH_EN_DARK_L／lhEnKeyRhyme）：AA＋N/M→ㄤ（on、calm、want）；AH 單音節重音→ㄚ／ㄢ（love、one），多音節弱讀→ㄜ／ㄣ（accurate、button）用 _lhEnSyl 判斷；OW＋N→ㄨㄥ（alone、phone）；暗 L 加 AA、AH、ER→ㄡ（doll、people、world）；拼字猜測加 -le→ㄡ、-tion→ㄣ。限制：字表沒記重音，above、enough 這類重音在最後的多音節字會被當弱讀。

## 2026-11-15 v0.98.08（已 push，待 Andy 實機驗收；全套 1281 通過，rhyme-map-ui:280 是舊的、:156 單跑會過）
- 星雲五級照「星雲效果分級表」（https://claude.ai/artifact/NUoEJt5851vJEZdNq814Mf）Andy 的勾選（js/word-space.js LH_SP_LV；0＝系統減少動態，完全靜止）：
  - 1：24fps、軌道 0.6 倍、拖到哪停在哪（拖恆星整團走）、停住＝膠囊＋變粗發光、保留的詞呼吸、整片星雲一起呼吸（_lhSp.zb，_lhSpZv）。
  - 2：20fps、不轉、星系一張圖（_lhSpClImg，cl.ver 變了或縮放換級才重畫，>2048px 不做）＋整團呼吸（cl.b、cl.bp）、黑洞放大（240px、最大約 2.3 倍）、保留的詞呼吸、拖到哪停在哪。
  - 3：30fps、軌道 0.6、流星（微彎、較快）＋尾巴＋加亮、甩動拉回、保留＝外框＋柔光、黑洞放大。
  - 4、5（40／60fps）：再加水彩偏移（排版時 jitter）、行星晃動、恆星飄移與互斥、保留閃＋光暈、隨機星星閃爍（每秒約 5 顆，常用最多多 15%，亮時放大 6%）。
  - 每級：綻放浮現、保留＝外框、停住＝膠囊。拖曳放手的共用收尾 _lhSpSettle（行星換新軌道）。
- 英文暗 L：hell、well、tell 歸ㄠ（和「好」同族），-ool→ㄨ、-ol→ㄡ、-eel→ㄧㄡ（js/rhyme-core.js LH_EN_DARK_L、lhEnGuess）。
- 韻腳預覽「像辛得勒名單」併到上一行；預覽上方多出的空白拿掉（#mapSettingsSection > .lm-preview-block:first-child）。
- AI 服務商說明文字照 Andy 版本；常用度預設改前 60%（lhAiTune freq 40）。

## 2026-11-15 v0.98.07（已 push，待 Andy 實機驗收；全套 1283 通過）
- 星雲（js/word-space.js）：恆星飄速落差加大（_lhSpLayout k＝2.6→0.45 × 恆星常用度 1～1.8，約 10 倍）；開場縮放改看 25%（_lhSpFitZoom p25）；畫小圖改時間預算（浮現每幀 ≤6ms、縮放重畫每幀 ≤4ms，手指／滑鼠按著時暫停 _lhSpRescale）。
- 星雲點詞＝釘住＋保留（saveWord），再點＝取消兩者；拿掉 📌，只剩右上角隱藏鈕（槓掉的眼睛 LH_SP_EYE_OFF）；點空白不再取消選取；面板 .ws-clear「取消選取」兩下確認（_lhSpClearAsk，同保留池清除全部，會一起取消保留）。
- 星座（_lhSpPin）：2 點一線、3 點三角形；第 4 點起新點連 1～3 個舊點（45/35/20%），機率 ∝ 1/距離²，夾角 <2° 不連；拿掉點後落單的點就近連一條。
- 第 5～9 點各級效果：先不改程式，做了對照表 https://claude.ai/artifact/NUoEJt5851vJEZdNq814Mf 等 Andy 勾完貼回。
- 偏好設定：背景動畫改滑桿 #prefsFxRange（簡單／省電／預設／流暢／全開，無說明）；AI 分頁用量在上、服務商在下，說明文字移到服務商下拉下面；候選上限預設 300（state.js AI_POOL_MAX）、常用度預設前 40%（lhAiTune freq 60）。韻腳預覽歌詞縮短、預覽 sticky 凍結。
- AI：Jev 加回（ai-client.js BYOK_PROVIDERS.jev，kind 'jev'，POST /v1/systemone 一題 choice、候選詞當選項 ≤255，byokJevRank 照機率排）；其他要寫文字的功能用 Jev 會白話報錯。AI 造詞暫停（generateAISuggestions 不呼叫 generateAIWords，函式保留）。結果說明改「從 yy 個詞（yy/xx）中，挑出 zz 個」。AI 會參考：關掉＝灰底（不劃線）、沒歌詞時灰色「歌詞」不能按、閃框不被切（.ai-ref padding 3px）。
- 版面：詞卡同聲調／排除借韻緊接比對方式、回報移到選項列最右（#wsRepSlot）、顯示全部和數量同一列；AI「回報」改成跟中間一樣的 batch-btn btn-report；AI 詞卡至少兩欄、7rem 起自動多欄；主畫面「找到 N 個字」前加彩色韻腳（results.js _lhRhymeTags）。
- 待驗：Jev 能不能從瀏覽器直連（CORS）、choice 選項上限 255。

## 2026-11-15 v0.98.06（已 push 7056550，待 Andy 實機驗收；全套 1284 通過）
- 背景動畫與特效改 1–5 級（js/bgfx.js lhFxLevel／lhFxSetLevel，lh:bgFx 存 '1'～'5'，舊 off→1、on→3，預設 3；偏好設定外觀 #prefsBgFx 五段＋說明，js/search-ui.js _lhPrefsBgFxSync）。
  - 星雲各級（js/word-space.js LH_SP_LV）：1 靜止、不逐幀畫（有變化才畫）、滑過直接變粗發光、保留＝外框、詞不能拖；2 靜止＋Dock 式靠近放大、拖了彈回、保留＝外框＋柔光；3 30fps、軌道 0.6 倍、無團互推、保留閃（便宜版）；4 40fps 全效果；5 60fps 全效果。背景飄字 1–2 關、3 約 20fps 字少、4 30fps、5 60fps。
- 星雲：保留閃爍 1.2 秒一次（快一倍）；📌 再按＝取消保留（removeSavedWord）；縮放時不重畫小圖，手停 160ms 後在背景照新縮放整批畫好再一次換上（_lhSpRescale）；打開時面板慢慢收走 1.2 秒（body.ws-in），這段時間先畫小圖，之後一團團浮現（_lhSpReveal、queue）；流星走弧線（cv）、尾巴沿軌跡、加亮；恆星飄速照團大小分 20 級＋恆星越不常用越快；超過 800 詞「宇宙 1/n」翻頁（_lhSpPage，.ws-pages）；關聯詞加字數篩選兩字／三字／多字可多選（_lhRel.len）；關聯詞圖例固定 開頭→中間→結尾。
- 保留池清除全部：不跳視窗，按鈕變「確定清除 N 個？」4 秒內再按（js/panels.js lhSavedClearAll）。導覽第 2 步文字更新（js/tour.js）。
- 三直排收起一邊：平板／窄桌機 lhPanelRoom 改成 --lp-room／--rp-room 逐漸縮（主畫面最窄後再拉會整塊移過去，不跳）；電腦 dock 三直排照完整三欄排、收起那欄空著，拖交界到中間最窄時吃收起那欄的位置（js/dock.js lhDockRender／_dkResizeStart）。
- 韻腳與句構設定：預覽完整顯示不捲；三個細項一行；大小＋濃淡一行；標記位置改「靠左欄／靠右欄」（舊 tail 自動轉 left，js/rhyme-core.js）。
- AI：AI 會參考三樣變開關（預設有標籤或情境時歌詞關；歌詞送整首）；偏好設定 AI 分頁改「服務商下拉＋一行金鑰」：Anthropic、OpenAI、Gemini、xAI、Groq、DeepSeek、Ollama、其他 OpenAI 相容（本機／自訂存 lh:aiLocal，測試連線讀 /models）；Jev 不支援（判斷型模型不產生文字）；模型選單每家一組。用量三滑桿 lh:aiTune（一次幾個 8–60、候選上限 40–1000 預設 120、常用度前 %）；候選詞照常用度排名送前 N，AI 挑走的扣掉下次往後補（js/ai-generate.js）。
- 待驗：各家直連的 CORS（xAI、DeepSeek 不確定瀏覽器能不能直接連）；OpenAI 新模型不送 temperature。

## 2026-11-14 v0.98.05（已 push，待 Andy 實機驗收）
- 星雲改 canvas（js/word-space.js 後半）：一張 .ws-canvas 畫全部；每個詞先畫成小圖（字＋淡光暈，_lhSpSprite，縮放跨半個八度才重畫、每幀最多 60 個），每幀只貼圖；停住／釘住的詞畫膠囊外框光暈在最上層；保留的詞 lighter 疊光 2.4 秒呼吸；流星尾巴 6 段漸淡；星座線 _lhSp.segs。點擊用 _lhSpHit 自己算；📌✕ 是真按鈕 .ws-acts，只浮在游標停住（觸控：最後釘住）的詞上。顏色經 .ws-probe 換成 canvas 看得懂的值（_lhSpColor／_lhSpTheme，每次打開重讀）。dpr 最多 2。量測：481 詞 60fps。
- 釘住的詞再點一次＝取消釘選，滑鼠還停著也不會再亮（_lhSp.mute，離開再回來才亮）。
- 自訂詞彙（新檔 js/custom-words.js，載在 word-space.js 前；lh:customWords 加進 safety.js 登錄、scan 29 鍵）：設定 → 查詢與詞庫，詞庫包區塊先 hidden（邏輯不動，測試會打開它）。新增（2–6 字，自動猜讀音）、全域／只在這首歌、清單改讀音（驗證節數與注音）、勾選刪除、重設全部。lhCwMerge 讓詞卡、星雲、關聯詞彙一起索引，自訂詞排最前、卡片右上「自訂」；換歌 lhCwSongChanged 重畫。備份檔還沒包含自訂詞。
- 歌曲顏色標籤：song.color（#rrggbb，壞值讀入時拿掉、匯入驗證）；分頁列最後「●」開選色（角色同一組 8 色＋無），分頁上方色條、歌曲清單歌名前色點（js/songs.js lhSongSetColor、js/lyrics.js _lhSongColorPop）。
- 保留池「清除全部」（先 lhAsk 確認，js/panels.js lhSavedClearAll）；標題「韻」「器」只帶 10% 強調色、不發光。
- 測試：新增 tests/custom-words.spec.mjs；word-space 改用 _lhSp 狀態與 _lhSpScreenOf 定位、加「再點取消釘選」；split-tags 36 個 js；lexicon-packs 打開藏起來的區塊。全套只剩舊的 rhyme-map-ui:280。

## 2026-11-14 v0.98.04（已 push，待 Andy 實機驗收）
- 星雲開關動畫分段（js/word-space.js _lhSpShow／lhWsClose）：body.ws-leave 三塊面板先收走 0.45s → 0.48s 後才顯示星雲、加 ws-open 淡入；關閉反過來。背景飄字改成非常淡（js/bgfx.js lhBgFxFaint，×0.28），不再整個藏起來。
- 關聯詞彙（新）：查單字選了字卡 → #wsRelBtn（index.html，results-section 上方；js/cards.js updateBatchCount 開關，body[data-q=char] 才顯示）→ lhWsRelOpen：詞庫裡含選取字的 2–6 字詞（_lhWsRelList），左上「字首／字尾」二選一或都不選（.ws-pos）；分團＝字＋位置（任意）或字＋字數；圖例大類＝每個字。_lhSpLayout 改吃 cfg（groupOf／headOf／colorOf）。
- 詞卡回報：.ws-header 數量那列右邊 .ws-rep（回報 → 挑詞卡 report-picked → 送出回報（n）／取消），送 kind:'word'。
- 星座：第五點起的額外連線，和現有任何一條線夾角 < 2° 就改試別的點（_lhSpPin）。
- 軌道「水彩筆」：同圈半徑偏差 ±30% 間距、角度偏差 35%、每個詞呼吸幅度 3–7（同速度，彼此距離不變）。
- 拿掉：句構分析面板的「關閉句構」（點外面／Esc 收）、星雲的「取消選取」（點空白處）。
- 「顯示全部」加星形 icon；標題「韻」「器」低調混強調色＋微光（.h1-cap）；Moon 字卡底色 #f7eed6（更淺）。
- 歌詞面板寬 ≥ 畫面一半＝lp-wide（自由／吸附、分頁出現）。
- 平板／窄桌機：左右面板收起時主畫面留在原地（js/panels.js lhPanelRoom → body.lp-room／rp-room 保留位置；放不下、縮放、拖交界時重算），面板滑出動畫 0.38s 同歌詞展開曲線。dock（寬螢幕分割）沒動。
- 測試：line-analysis、line-audit、word-space（關聯詞彙、詞卡回報）、editor-layout、lyrics-editor 跟著新規格；visual 快照更新；transition 額度 +1。全套 1118 通過，只剩舊的 rhyme-map-ui:280。

## 2026-11-14 v0.98.03（已 push，待 Andy 實機驗收）
- 歌詞面板＝完整編輯器（js/lyrics.js lhLpFull／_lhLpSync／lhEditorToggle；css/panels.css 檔尾）：平板、電腦按「展開」不再開浮動面板，body.lp-full 讓 #leftPanel 貼著原本的邊拉到整個可用範圍（transition 只在 lp-anim 0.42s）；歌詞欄寬 ≥ 44rem（不管是展開還是拖交界）＝body.lp-wide：#lpTabs 歌曲分頁、#canvasTools 才出現，lhEditorIsOpen() 也回 true（自由畫布、分列拖曳跟著）。Esc／再按「收回」收回。手機（≤ 900）照舊浮動面板。songs.js 改名錨點也找 #lpTabs。
- 星雲：同一圈共用扁度／傾角／速度（只留很小的偏差，不再越轉越擠）；彈簧拉回慢三倍（K 0.155、阻尼 0.53）；團太近會在約 12 秒內慢慢互推；星座兩點就連線、三點以上頭尾相連、第五點起七成機會多一條隨機對角線（_lhSpPin／chords，path）；點空白處＝取消選取；保留的詞疊一層更亮的發光字慢慢閃（.ws-txt::after）；聲調色：支援 oklch from 時從強調色每聲轉 72°，一團＝第一、二字聲調色互混（_lhWsToneMix）；面板寬 10rem。
- 恆星被隱藏：剩下最常用的詞慢慢飄到中心接任（_lhSpPromote，rising）。釘住的詞被隱藏：從星座拿掉、前後點直接接上、相關對角線拿掉，之後再釘的接在最後。修：按住恆星還沒拖時整團被拉到畫面中央（frame 裡 star && free 才帶整團）。
- 詞卡字距一個半形空格；Moon 字卡／詞卡底色 --char-card-bg #f1e3bd；查詢器標題列按鈕墊 86% 容器色＋強調色。
- 測試：編輯器相關（lyrics-editor、canvas、dock、workflow-polish、layout 流程）改成新行為；sections-audit transition 額度 +2。全套 1116 通過，只剩舊的 rhyme-map-ui:280。

## 2026-11-14 v0.98.02（已 push，待 Andy 實機驗收）
- 星雲開著時把交界把手（.pane-divider、.dock-divider）藏起來（panels.css body.ws-open）。
- 平板三直排：一邊收起來，另一條交界照樣能拉（panels.css 改成 lp-open／rp-open 各自顯示；js/panels.js _lhPaneClamp 收著的那邊寬度算 0）。交界線改放在面板和主畫面中間的空隙（寬＝--page-pad），不再蓋到面板邊的收合分頁；拖曳改照移動距離算（不跳）。layout-lib 觸控稽核豁免 .pane-divider。
- 詞卡注音／拼音上色（js/word-space.js _lhWsPhonEl）：第 i 個字用 search-highlight-(i+1)；同母音標韻母、同子音標聲母、同讀音整個標；跟著「標記搜尋」開關。
- (i) 置中：直立、字距 0、行高 1（base.css 檔尾）。「AI 建議」標題不換行（.ai-title-group nowrap）。
- 平板加到主畫面（display-mode standalone／fullscreen＋coarse＋≥768）：--pad-t 多 1.25rem 讓開 iOS 狀態列。
- 待討論（未動）：第 3 點「展開完整版」改成面板拉寬到接近全螢幕、仍貼著原本的邊；夠寬才出現自由／吸附等按鈕。牽動 lyrics.js lhEditorOpen（把歌詞搬進 #lyricsEditor 浮窗）、canvas.js、歌曲分頁，先跟 Andy 確認設計。
- 測試：editor-layout 加「一邊收起來仍能拉」。全套除了這輪改到的檔都綠，重跑受影響檔 170＋13 通過。

## 2026-11-14 v0.98.01（已 push，待 Andy 實機驗收）
- 星雲（js/word-space.js）：軌道改成每個詞各自隨機的半徑／橢圓扁度／傾角／起始角／速度（_lhSpOrbit）；恆星在 D 範圍內慢慢飄（_lhSpDrift＝和最近一團空隙的一半，兩團各飄各的碰不到）；甩出去的行星被恆星像彈簧拉回軌道；拖恆星＝整團被沖散跟著走，停下後那裡變新的家；釘 3 個以上照順序連星座線（svg .ws-stars，線寬不隨縮放）。
- 顏色：第一個字聲調決定色系（LH_WS_TONE_C 五色），同團每個詞依常用度＋隨機混 --text-primary／secondary 出深淺。
- 左上面板固定 14rem 一欄：一～輕聲開頭五顆，點開顯示該聲調開頭的組合（.ws-sub），點組合導覽；取消選取連星座一起清。
- 已保留的詞：不留圖釘、不加外框，整個詞慢慢閃（lhPulse 2.4s）。
- 「顯示全部」同「新增段落」「提供詞語建議」高度規則（panels.css html .ws-expand-btn）。三塊側邊分頁拿掉 title 提示文字（aria-label 保留）。
- 詞卡：字跟字之間兩個半形空格（white-space: pre），欄寬 8.5rem→7.5rem、手機 7rem→6.125rem（×0.88），高度不動。
- 測試：word-space 加圖例收納、星座線。全套 1115 通過。

## 2026-11-14 v0.98（已 push，待 Andy 實機驗收）
- 補充：選項列（字卡模式鈕＋批次鈕，含手機 #m-batchPanel）搜尋欄空的時候收起；查單字顯示原本那兩組、查整個詞換成同排樣式的「同母音／同子音／同讀音」（三選一）＋「同聲調」「排除借韻」（可多選）。
  - 切換：js/results.js displayResults 設 body[data-q]=none/char/word；CSS 在 panels.css .ws-header 附近（.q-char／.q-word）。index.html #wsModeGroup、.ws-filters；search-ui.js 模式鈕改綁 .mode-button[data-mode]。
  - js/word-space.js lhWsMatch 加 mode：initial＝每字 _effInitial 相同；same＝至少一字 stripTone 讀音相同，其他字押韻（受排除借韻影響）或同聲母。排序固定 p 大在前。詞卡標題的勾選框拿掉。
- 第 3 輪 18 點（同一個 commit）：「顯示全部」改名、bgfx 開啟時隱藏＋用歌詞／標籤／情境的字詞、📌✕ 圖示、75% 起始縮放、字級依常用度 2.5×、行星繞恆星、流星、取消選取＋常用度滑桿、圖例可點跳轉、10 色、✕ 關閉、三直排三角分頁（data-dk-side，中間不收、兩側可收）、導覽 11 步、(i) 陽刻、新角色就地輸入名稱＋顏色。
- 測試：word-space 加同讀音（誇張→誇獎、看漲、跨行）與選項列切換；golden／layout／report-entry 因選項列平常收起改成先搜尋或直接點。全套只剩舊的 rhyme-map-ui:280。
- 待驗：側邊三角分頁觸控寬 18px（低於 44px 建議，依 Andy 指定 40% 寬，測試已豁免）；圖例超過 10 團顏色會重複。
- 版本 0.98（?v=、關於、README、LH_APP_VERSION、.claude/CLAUDE.md）。

## 2026-11-14 v0.97.03（已 push，待 Andy 實機驗收）
- 0 「自訂」主題起始色改冷調鼠尾草紙＋覆盆子紅（css/base.css :root），和 Moon 分開。
- 1 觸控選字列躲開系統拷貝／貼上選單：選取在上半貼可見範圍底部、下半貼頂（js/rhyme-map.js _lhMapBarPlace）。
- 2 導引線閃爍亮 40%／暗 15%：lhPulse 改吃 --pulse-hi／--pulse-lo（預設不變），.cv-guide、#lhRowGuide.snap 設 0.4／0.15。
- 3 頁尾 (i)（.about-btn、手機 .about-btn-mobile）土耳其綠（css/base.css 檔尾）。
- 4 自由畫布右鍵不再平移（js/canvas.js），左鍵拖空白處／中鍵照舊。
- 5 詞卡＋詞宇宙（新檔 js/word-space.js，載在 results.js 之前；CSS 在 panels.css 檔尾）：
  - 「安打」（2–6 字、無空白、可含 *）＝查整個詞的韻；「安 打」照舊。displayResults 一開始問 lhWsRender，所有重畫路徑都會走到。
  - lhWsMatch：每個字都押（lhRhymeMatch，strict＝排除借韻），可加同聲調；常用（p 大）在前；詞卡每頁 240 張、捲到底再補。點詞卡＝保留；可拖到歌詞（.char-card data-char）。
  - 「✦ 展開詞宇宙」：body.ws-open 讓三塊面板 translate 往左／上／右收走（ws-anim 期間才有 transition）；bgfx 加深 ×2.4（lhBgFxBoost）。最多 800 詞，依聲調組合分群上色＋圖例，開啟時自動縮放（最小 55%）。
  - 互動：滑過＝定格＋光暈＋淡淡「保留」「隱藏」；單擊＝釘住；拖曳甩動（摩擦減速）；空白處拖＝平移；滾輪／雙指／± 縮放；Esc／收合。隱藏的詞存在本次工作階段，清單也拿掉。
- 測試：新增 tests/word-space.spec.mjs；golden word-anda／word-aiqing 改輸入「安 打」「愛 情」（結果相同）；選字列、右鍵平移、重設顏色、split 順序、transition 上限（WS_EXTRA 5）跟著新規格改。全套只剩舊的 rhyme-map-ui:280。
- 版本 0.97.03（?v=、關於、README、LH_APP_VERSION、.claude/CLAUDE.md）。

## 2026-11-14 回報 10 點（?v=0.97.1，已 push，待 Andy 實機驗收）
- 1 匯出 icon 改往上箭頭（index.html #exportToggle）。
- 2 刪除段落確認窗：只留標題、按鈕「刪除｜取消」（js/sections.js lhSecRemoveAsk；js/ui-common.js lhAsk 沒內文就藏 #lhAskBody）。
- 3 吸附分列不再限 > 900：手機、平板直版也能拖標題列排版（js/sections.js lhRowsDragOn、js/canvas.js _lhRowsOn、css/panels.css 兩段改 @media all）。
- 4 角色改字色：鏡像層 span.rl 字色＝角色色混主題文字色（淺底 55%、其他 75%，tests/roles 量 4 主題對比 ≥ 4.5）；段落 .rl-text 時輸入框字透明、鏡像層字顯示；打字中 .rl-typing 退回輸入框的字（js/roles.js input 監聽加、js/rhyme-map.js lhMapPaint 拿掉）。
- 5 自由畫布貼齊別張卡片相反邊時留 1px（js/canvas.js _lhCvSnap 的 theirs - mine）。
- 6 雙指只縮放、不平移，錨點固定在兩指落下時的中點（js/canvas.js pinch）。
- 7 導引線：--snap-guide #ff2da0（base.css :root）混 80% 半透明，沿用 lhPulse steps(1) 0.4167s＝2.4Hz 閃；減少動態不閃。
- 8 「歌曲」鈕：panels.css 同權重 .song-toggle（卡片底）較晚載入蓋掉綠色 → base.css 改 html .song-toggle，字色 --song-btn-ink。
- 9 三直排：中間那塊不給收合（dk-mid-lyrics／dk-mid-ai 藏小三角與分頁）；查詢區換到側邊時有「查詢」側邊分頁（.results-side-tab，dk-rs-l／dk-rs-r），收起＝dk-rs-fold 貼邊只露分頁，存 resultsPanelCollapsed；同側抽屜面板收著時不讓查詢區收（避免分頁疊在同一邊）。js/dock.js lhDockRender／toggleResultsPanel、css/panels.css 檔尾。
- 10 未修：Chromium 模擬 iPad／iPhone 的四主題變數與元件顏色和電腦完全相同；Playwright WebKit 在這台機器卡住無法比對。疑似 iOS 畫 SVG 雜訊質地（feTurbulence）不同、或 True Tone／夜覽。等 Andy 給同主題的電腦＋iPad 截圖再決定（可選：把質地烤成 PNG）。
- 測試：全套只剩舊的 rhyme-map-ui:280；roles 改測字色、canvas 吸附改 407、scan 鍵數 28。

## 2026-11-14 v0.97（已 push）
- 版本號 0.97：index.html ?v=0.97 與「關於」、README、js/safety.js LH_APP_VERSION、.claude/CLAUDE.md。
- 「歌曲」鈕所有主題都是土耳其綠 #4fd1c5＋深色字（css/base.css 檔尾；style.spec 白名單只留 #4fd1c5）。
- 新增段落／提供詞語建議：固定 height 2.25rem（不是 min-height，實機上圖示＋字會撐高其中一顆）。
- 平板側邊面板拖曳不帶整頁：js/panels.js 檔尾 touchmove 攔截（> 900、往那方向沒有可捲元素就 preventDefault）；觸控裝置 html overscroll-behavior: none（桌機不加，會讓 Mac End 鍵變捲動）。
- 待實機確認：iPad 上文字框內拖選取把手不受影響。

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
