        // 初始化：從 <script src="data/rhyme-dict.js"> 注入的全域變數載入
        rhymeDict = window._rhymeDictData || {};
        loadDictOverrides();
        buildIndex();
        // 測試用就緒訊號：只給自動測試等待用，程式邏輯不可依賴它
        // 背景套用後台 overrides（data/rhyme-dict-overrides.json）完成後 rebuild；同時背景載入破音字讀音順序表
        window.__hoyunReady = Promise.all([ applyRhymeDictOverrides().then(applied => { if (applied) buildIndex(); }), loadPolyphonicsOrder() ]);

        // 手機版（≤440px）：將 batch panel 移入搜尋區域
        if (!!phone) {
            const batchPanel = document.getElementById('m-batchPanel');
            const mobileArea = document.getElementById('mobileBatchArea');
            if (batchPanel && mobileArea) {
                mobileArea.appendChild(batchPanel);
            }
        } else {
            // 只在桌面自動 focus（避免手機打開就彈出鍵盤）
            document.getElementById('searchInput').focus();
        }

        // 窄視窗（≤900px）：強制兩側面板收起，Tab 列接管
        if (window.innerWidth <= 900) {
            document.getElementById('leftPanel').classList.add('collapsed');
            document.getElementById('rightPanel').classList.add('collapsed');
        }

        loadColors();
        window.__hoyunWordlistReady = loadWordlist();

