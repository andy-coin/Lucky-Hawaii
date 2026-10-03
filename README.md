# 好韻器 Lucky Hawaii

**中文歌詞押韻工具 - v0.96 beta**

鑑於目前網路上的韻腳查詢工具幾乎都是以「詞」為架構，且常混雜著大量冷僻詞彙，因此特別開發針對常用「字」為索引系統的工具，並引進AI建議詞彙。祝大家想出絕妙好詞！

## 功能簡介

### 查詢同韻字：
    - 支援注音 / 拼音 / 漢字，自動索引同韻腳的字
    - 三種不同模式篩選方式：常用字 / 同聲韻 / 同聲調
    - 支援注音 / 拼音顯示方式
    - 字卡頻率可手動調整

### 段落編輯器
    - 歌詞段落管理：多段落編輯、情境標籤
    - 韻腳地圖(即將更新):自動標記韻腳

### AI建議
    - 從詞庫候選中挑選符合韻腳或字的詞彙
    - 根據字數自動對影，雙押與多押沒問題
    - 多種建議模式：同母音/同子音/押字首/押字尾
    - AI會參考歌詞與情境情境標籤篩選詞語
    - 多款模型自動 fallback (Gemini / OpenAI / Meta / Deepseek etc.)

### Misc
    - 晝夜模式
    - 客製顏色
    - 儲存與讀取

## 資料來源

- **字庫：** [小麥注音](https://github.com/openvanilla/McBopomofo)（data-plain-bpmf）
- **詞庫：** [唯音輸入法](https://github.com/vChewing/vChewing-VanguardLexicon)（vChewing VanguardLexicon）+ [新酷音詞庫](https://github.com/chewing/libchewing-data)（libchewing tsi.csv，LGPL-2.1-or-later）

## 使用

直接開啟 [好韻器Lucky-Hawaii](https://andy-coin.github.io/Lucky-Hawaii)，無需安裝，純前端運行。

開發尚未完成，未經同意請勿轉傳。v1.0正式上線後歡迎自由分享~
