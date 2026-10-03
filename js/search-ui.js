        // 事件監聽器
        const searchInputEl = document.getElementById('searchInput');

        // 偏好設定面板
        function toggleSettings() {
            const overlay = document.getElementById('settingsOverlay');
            overlay.classList.toggle('show');
        }

        function closeSettingsOverlay(event) {
            // 點擊遮罩本身才關閉（內容區已 stopPropagation）
            if (event.target === event.currentTarget) {
                document.getElementById('settingsOverlay').classList.remove('show');
            }
        }

        function zoomIn(){
            MzoomScale = Math.min(MzoomScale + 5, 150); // 最大放大到 150%
            resultsSection.style.zoom = MzoomScale / 100 * MzoomBaseRatio;
            document.getElementById('MzoomValue').textContent = (MzoomScale) + '%';
        }

        function zoomOut(){
            MzoomScale = Math.max(MzoomScale - 5, 50); // 最小縮小到 50%
            resultsSection.style.zoom = MzoomScale / 100 * MzoomBaseRatio;
            document.getElementById('MzoomValue').textContent = (MzoomScale) + '%';
        }

        function toggleAbout() {
            document.getElementById('aboutOverlay').classList.toggle('show');
        }

        function closeAbout(event) {
            if (event.target === event.currentTarget) {
                document.getElementById('aboutOverlay').classList.remove('show');
            }
        }
        function _getSearchSingleChar(val) {
            const chars = [...val.trim()].filter(c => /[一-鿿]/.test(c));
            return chars.length === 1 ? chars[0] : null;
        }

        async function _handleSearch(val) {
            const char = _getSearchSingleChar(val);
            // 換字時重置破音字選擇
            if (char !== _polyphonic.char) _polyphonic = { char: null, reading: null };
            // 先 await 一次：此時 .results-header 還是上一輪的舊容器（或不存在），
            // 函式內會先把 _polyphonic 設為第一順位讀音，再因找不到正確 header 而 early return。
            // 這樣 searchRhyme / displayResults 才能尊重該選擇。
            await renderPolyphonicChips(char);
            const results = searchRhyme(val);
            displayResults(results);
            // displayResults 會重建 .results-header，所以再呼叫一次把 chips DOM append 上去
            await renderPolyphonicChips(char);
            updateAIRhymeDisplay(val);
        }

        //標準 input 事件
        searchInputEl.addEventListener('input', (e) => {
            // 如果正在輸入法組字中（如注音輸入法），跳過
            //if (e.isComposing) return;
            selectedChars.clear();
            updateSelectedCharsHint();
            _handleSearch(e.target.value);
        });

        // 輸入法組字完成事件（支援手機注音/拼音輸入法）
        searchInputEl.addEventListener('compositionend', (e) => {
            selectedChars.clear();
            updateSelectedCharsHint();
            _handleSearch(e.target.value);
        });
        
        // 確保手機上點擊搜尋框能正確取得焦點
        searchInputEl.addEventListener('touchend', (e) => {
            setTimeout(() => e.target.focus(), 10);
        });

        // 統一走 _handleSearch，displayResults 後會重新 append 破音字 chips
        function _refreshFromCurrentInput() {
            const currentInput = document.getElementById('searchInput').value;
            if (currentInput) _handleSearch(currentInput);
        }
        document.getElementById('showPinyin').addEventListener('change', _refreshFromCurrentInput);
        document.getElementById('highlightSearch').addEventListener('change', _refreshFromCurrentInput);
        document.getElementById('hideRare').addEventListener('change', _refreshFromCurrentInput);
        document.getElementById('filterDuplicate').addEventListener('change', _refreshFromCurrentInput);

        // 按鈕組切換（常用字 / 同聲韻 / 同聲調）
        document.querySelectorAll('.mode-button').forEach(button => {
            button.addEventListener('click', function() {
                document.querySelectorAll('.mode-button').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                currentMode = this.dataset.mode;
                _refreshFromCurrentInput();
            });
        });

