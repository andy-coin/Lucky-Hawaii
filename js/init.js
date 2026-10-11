        // 初始化：從 <script src="data/rhyme-dict.js"> 注入的全域變數載入
        rhymeDict = window._rhymeDictData || {};
        // 失敗只記警告、不中止：後面的 __hoyunReady、載入顏色與詞庫還要照常跑，歌詞編輯才不會跟著壞掉（CR-01）
        try { loadDictOverrides(); } catch (e) { lhWarn('字庫覆寫套用失敗，略過', e); }
        try { buildIndex(); } catch (e) { lhWarn('字庫索引建立失敗', e); }
        // 測試用就緒訊號：只給自動測試等待用，程式邏輯不可依賴它
        // 背景套用後台 overrides（data/rhyme-dict-overrides.json）完成後 rebuild；同時背景載入破音字讀音順序表
        window.__hoyunReady = Promise.all([ applyRhymeDictOverrides().then(applied => { if (applied) buildIndex(); }), loadPolyphonicsOrder() ]);

        // 手機版：批次標記按鈕放進搜尋區；其餘寬度放回頁面最外層。
        // 開頁跑一次，之後跨過手機斷點（轉向、拖視窗）兩個方向都再跑，所以不必重新整理
        let _lhBatchHome = null;   // 原本在頁面最外層的位置：離開手機版時放回同一個地方，不改變其他版型的 DOM 順序
        function _lhPlaceBatchPanel() {
            const batchPanel = document.getElementById('m-batchPanel');
            const mobileArea = document.getElementById('mobileBatchArea');
            if (!batchPanel || !mobileArea) return;
            if (!_lhBatchHome) _lhBatchHome = { parent: batchPanel.parentNode, next: batchPanel.nextSibling };
            if (lhIsPhone()) {
                mobileArea.appendChild(batchPanel);
            } else if (batchPanel.parentNode !== _lhBatchHome.parent) {
                _lhBatchHome.parent.insertBefore(batchPanel, _lhBatchHome.next);
            }
        }
        _lhPlaceBatchPanel();
        LH_MQ_PHONE.addEventListener('change', _lhPlaceBatchPanel);

        // 只在寬螢幕＋滑鼠／觸控板時自動聚焦搜尋框：觸控裝置或底部 sheet 版型一聚焦就會彈出鍵盤，擋住畫面
        if (!lhIsSheetMode() && !matchMedia('(pointer: coarse)').matches) {
            document.getElementById('searchInput').focus();
        }

        loadColors();
        window.__hoyunWordlistReady = loadWordlist();

