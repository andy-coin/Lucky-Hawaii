        // 事件監聽器
        const searchInputEl = document.getElementById('searchInput');

        // 手機寬度用短提示字，其餘沿用 HTML 裡的完整說明；轉向／調整視窗時跟著換
        const _SEARCH_PLACEHOLDER_LONG = searchInputEl.placeholder;
        function _syncSearchPlaceholder() {
            searchInputEl.placeholder = lhIsPhone() ? '輸入注音、拼音或漢字' : _SEARCH_PLACEHOLDER_LONG;
        }
        _syncSearchPlaceholder();
        LH_MQ_PHONE.addEventListener('change', _syncSearchPlaceholder);

        // 偏好設定面板
        function toggleSettings() {
            const overlay = document.getElementById('settingsOverlay');
            overlay.classList.toggle('show');
            // 每次打開都重畫詞庫包清單：勾選永遠對得上目前真正在用的包
            if (overlay.classList.contains('show')) renderLexiconPackList();
        }

        // 詞庫包清單（偏好設定）：只用 createElement + textContent 組畫面，清單文字不會被當成 HTML（T-06-07）
        let _packSwitchSeq = 0;   // 每次點選 +1；連點時只有最後一次的結果會顯示
        async function renderLexiconPackList() {
            const list = document.getElementById('lexiconPackList');
            const status = document.getElementById('lexiconPackStatus');
            if (!list || !status) return;
            status.textContent = '讀取中…';
            const m = await loadLexiconManifest();
            list.replaceChildren();
            if (!m) { status.textContent = '詞庫包清單暫時讀不到，先使用 v0.96 現行詞庫'; return; }
            const activeId = (activeLexiconPack || {}).id ?? m.default;
            for (const p of m.packs) {
                const label = document.createElement('label');
                label.className = 'checkbox-label pack-option';
                const radio = document.createElement('input');
                radio.type = 'radio';
                radio.name = 'lexiconPack';
                radio.value = p.id;
                radio.checked = p.id === activeId;
                const text = document.createElement('span');
                text.className = 'pack-option-text';
                const nameEl = document.createElement('span');
                nameEl.className = 'pack-option-name';
                nameEl.textContent = p.name;
                const metaEl = document.createElement('span');
                metaEl.className = 'pack-option-meta';
                metaEl.textContent = Number(p.entries).toLocaleString('zh-TW') + ' 詞・' + p.description;
                text.append(nameEl, metaEl);
                label.append(radio, text);
                list.append(label);
            }
            status.textContent = '';
        }

        document.getElementById('lexiconPackList').addEventListener('change', async e => {
            const radio = e.target;
            if (!radio || radio.name !== 'lexiconPack') return;
            const status = document.getElementById('lexiconPackStatus');
            const seq = ++_packSwitchSeq;
            status.textContent = '詞庫載入中…';
            const m = await loadLexiconManifest();
            const pack = m && m.packs.find(p => p.id === radio.value);
            const ok = await switchLexiconPack(radio.value);
            if (seq !== _packSwitchSeq) return;   // 後面又選了別的包，以那次為準
            if (ok) { status.textContent = '已改用：' + (pack ? pack.name : radio.value); return; }
            status.textContent = '詞庫載入失敗，請稍後再試';
            showToast('詞庫載入失敗，請稍後再試');
            // 退回原本的包：勾選要跟真正在用的一致
            const activeId = (activeLexiconPack || {}).id ?? (m ? m.default : null);
            document.querySelectorAll('#lexiconPackList input[name="lexiconPack"]').forEach(r => { r.checked = r.value === activeId; });
        });

        function closeSettingsOverlay(event) {
            // 點擊遮罩本身才關閉（內容區已 stopPropagation）
            if (event.target === event.currentTarget) {
                document.getElementById('settingsOverlay').classList.remove('show');
            }
        }

        // 上下限與步進由 js/layout.js 的 setUiScale 夾住
        function zoomIn(){
            setUiScale(lhUiScale + LH_UI_SCALE_STEP);
        }

        function zoomOut(){
            setUiScale(lhUiScale - LH_UI_SCALE_STEP);
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

