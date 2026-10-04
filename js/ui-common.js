        // ===== 複製 + Toast =====
        function copyWord(word) {
            if (navigator.clipboard) {
                navigator.clipboard.writeText(word).catch(() => fallbackCopy(word));
            } else {
                fallbackCopy(word);
            }
            showToast(`已複製「${word}」`);
        }

        function fallbackCopy(text) {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        }

        function cycleInputMode() {
            const modes = ['auto', 'zhuyin', 'pinyin'];
            const labels = { auto: '自動', zhuyin: '注音', pinyin: '拼音' };
            inputMode = modes[(modes.indexOf(inputMode) + 1) % 3];
            lhSet('haoYunQi_inputMode', inputMode);
            const btn = document.getElementById('inputModeBtn');
            if (btn) {
                btn.textContent = labels[inputMode];
                btn.className = 'input-mode-btn' + (inputMode !== 'auto' ? ` mode-${inputMode}` : '');
            }
            const val = document.getElementById('searchInput').value.trim();
            if (val) {
                // 走 _handleSearch 才會在 displayResults 後重新 render 破音字 chips，
                // 不然切換注音/拼音時 chip 會被洗掉
                _handleSearch(val);
            }
        }

        function showToast(msg, duration = 1800) {
            let toast = document.getElementById('copyToast');
            if (!toast) {
                toast = document.createElement('div');
                toast.id = 'copyToast';
                toast.className = 'copy-toast';
                document.body.appendChild(toast);
            }
            toast.textContent = msg;
            toast.classList.add('show');
            clearTimeout(toast._timer);
            toast._timer = setTimeout(() => toast.classList.remove('show'), duration);
        }

        // ===== 面板跟著目前版型走 =====
        // 底部 sheet 模式（≤ 900）：兩個面板固定收起，由底部分頁列控制；其餘版型：依使用者存的偏好還原。
        // 只讀 leftPanelCollapsed／rightPanelCollapsed，絕不改寫，所以轉向、縮放視窗不會弄丟偏好。
        // 開頁跑一次，之後每次跨過斷點（轉向、拖視窗）再跑一次，不必重新整理
        function _lhApplyPanelTier() {
            const lp = document.getElementById('leftPanel');
            const rp = document.getElementById('rightPanel');
            if (!lp || !rp) return;
            if (lhIsSheetMode()) {
                lp.classList.add('collapsed');
                rp.classList.add('collapsed');
            } else {
                lp.classList.toggle('collapsed', lhGet('leftPanelCollapsed') !== 'false');
                rp.classList.toggle('collapsed', lhGet('rightPanelCollapsed') !== 'false');
            }
            // 底部 sheet 專用的遮罩與分頁高亮：跨過斷點後不能殘留（否則桌機上會有一層看不見的遮罩擋住點擊）
            const bd = document.getElementById('mobileBackdrop');
            if (bd) bd.classList.remove('show');
            _lhSyncMobileTabs('search');
            syncCenterPanel();
        }
        LH_MQ_SHEET.addEventListener('change', _lhApplyPanelTier);

        // ===== 初始化三個面板狀態 =====
        (function() {
            const rCollapsed = lhGet('recentPanelCollapsed');
            if (rCollapsed !== 'false') document.getElementById('recentPanel').classList.add('collapsed');

            _lhApplyPanelTier();

            // 歌詞全空時自動清除情境與標籤
            // 歌詞存檔損毀時會退回一個空段落，那不等於「使用者清空了歌詞」，不能因此刪掉標籤
            if (!LH_CORRUPT_KEYS.has('haiku_lyrics') && lyricsSections.every(s => !s.text || s.text.trim() === '')) {
                hashtags = [];
                lhRemove('haiku_hashtags');
                const ctxEl = document.getElementById('contextDescription');
                if (ctxEl) ctxEl.value = '';
            }

            // 恢復輸入模式按鈕狀態
            const modeBtn = document.getElementById('inputModeBtn');
            if (modeBtn && inputMode !== 'auto') {
                const modeLabels = { zhuyin: '注音', pinyin: '拼音' };
                modeBtn.textContent = modeLabels[inputMode] || '自動';
                modeBtn.classList.add(`mode-${inputMode}`);
            }

            renderLyricsSections();
            renderHashtags();
            renderSavedWords();
            renderModelSelect();
            // 模型清單非同步載入；測試用這個訊號等待，程式邏輯不可依賴它；載入完只重畫選單、不寫入使用者設定
            window.__hoyunModelsReady = loadModels();

            // 恢復情境＆標籤收納狀態
            if (lhGet('contextSectionCollapsed') === 'true') {
                const s = document.getElementById('contextSection');
                const ch = document.getElementById('contextChevron');
                if (s) { s.classList.add('collapsed'); if (ch) ch.style.transform = 'rotate(-90deg)'; }
            }
            // 恢復保留池收納狀態
            if (lhGet('savedPoolCollapsed') === 'true') {
                const s = document.getElementById('savedPoolSection');
                const ch = document.getElementById('savedPoolChevron');
                if (s) { s.classList.add('collapsed'); if (ch) ch.style.transform = 'rotate(-90deg)'; }
            }
        })();

