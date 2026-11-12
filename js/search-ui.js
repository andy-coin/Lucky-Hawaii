        // 事件監聽器
        const searchInputEl = document.getElementById('searchInput');

        // 手機寬度用短提示字，其餘沿用 HTML 裡的完整說明；轉向／調整視窗時跟著換
        const _SEARCH_PLACEHOLDER_LONG = searchInputEl.placeholder;
        function _syncSearchPlaceholder() {
            searchInputEl.placeholder = lhIsPhone() ? '輸入注音、拼音或漢字' : _SEARCH_PLACEHOLDER_LONG;
        }
        _syncSearchPlaceholder();
        LH_MQ_PHONE.addEventListener('change', _syncSearchPlaceholder);

        // 「關於」：顯示目前詞庫包的名稱與來源說明（NOTICE.txt）。名稱與內文一律用 textContent，不會被當成 HTML（T-06-11）
        let _aboutNoticeSeq = 0;   // 連續開關時只有最新一次的結果會寫進畫面
        async function renderAboutPackNotice() {
            const nameEl = document.getElementById('aboutPackName');
            const noticeEl = document.getElementById('aboutPackNotice');
            if (!nameEl || !noticeEl) return;
            const seq = ++_aboutNoticeSeq;
            let desc = activeLexiconPack;
            if (!desc) {
                try { desc = await resolveLexiconPack(); } catch (e) { lhWarn('詞庫來源說明讀取失敗', e); }
            }
            if (seq !== _aboutNoticeSeq) return;
            nameEl.textContent = desc ? (desc.name ?? desc.id) : '';
            let text = '詞庫來源說明暫時讀不到';
            try {
                // 路徑檢查和載入詞庫時一樣：只准 data/ 底下的簡單路徑
                const path = desc && desc.notice;
                if (typeof path !== 'string' || !LH_PACK_PATH_RE.test(path) || path.includes('..')) throw new Error('NOTICE 路徑不合格');
                const r = await fetch(path, { cache: 'no-cache' });
                if (!r.ok) throw new Error('HTTP ' + r.status);
                text = await r.text();
            } catch (e) { lhWarn('詞庫來源說明讀取失敗', e); }
            if (seq !== _aboutNoticeSeq) return;
            noticeEl.textContent = text;
            noticeEl.scrollTop = 0;
        }

        // 偏好設定面板
        function toggleSettings() {
            const overlay = document.getElementById('settingsOverlay');
            overlay.classList.toggle('show');
            // 每次打開都重畫詞庫包清單：勾選永遠對得上目前真正在用的包
            if (overlay.classList.contains('show')) {
                renderLexiconPackList();
                // 韻腳地圖的浮層會蓋在這個面板前面，先收掉；開到上次看的分頁（這次開網頁第一次開＝「外觀」；「更多設定…」走自己的路開「韻腳與句構」）
                if (typeof lhMapCloseAll === 'function') lhMapCloseAll();
                lhPrefsSelectTab(_lhPrefsTab, true);
            }
        }

        // ===== 偏好設定分頁（R2）：tablist／tab／tabpanel，左右（上下）方向鍵、Home、End 切換並自動選取 =====
        // 上次看的分頁只記在記憶體（重新整理回到「外觀」），不另存 localStorage
        let _lhPrefsTab = 'look';
        function lhPrefsSelectTab(name, focus) {
            const tabs = [...document.querySelectorAll('#prefsTabs [role="tab"]')];
            const tab = document.getElementById('prefsTab-' + name) || tabs[0];
            _lhPrefsTab = tab.id.slice('prefsTab-'.length);
            for (const t of tabs) {
                const on = t === tab;
                t.setAttribute('aria-selected', String(on));
                t.tabIndex = on ? 0 : -1;
                document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
            }
            if (_lhPrefsTab === 'map' && typeof lhMapPrefsBuild === 'function') lhMapPrefsBuild();   // 韻腳設定第一次看到才建
            if (_lhPrefsTab === 'ai' && typeof byokRenderPrefs === 'function') byokRenderPrefs();
            if (_lhPrefsTab === 'data' && document.getElementById('autoBackupSection').open) renderAutoBackups();
            _lhPrefsBgFxSync();
            document.getElementById(tab.getAttribute('aria-controls')).scrollTop = 0;
            tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });   // 手機上分頁列橫向捲動：選到的分頁要看得到
            if (focus) tab.focus({ preventScroll: true });
        }
        document.getElementById('prefsTabs').addEventListener('click', e => {
            const t = e.target.closest('[role="tab"]');
            if (t) lhPrefsSelectTab(t.id.slice('prefsTab-'.length), true);
        });
        document.getElementById('prefsTabs').addEventListener('keydown', e => {
            const tabs = [...document.querySelectorAll('#prefsTabs [role="tab"]')];
            const i = tabs.indexOf(document.activeElement);
            if (i < 0) return;
            const n = tabs.length;
            const to = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: n - 1 }[e.key];
            if (to === undefined) return;
            e.preventDefault();
            lhPrefsSelectTab(tabs[(to + n) % n].id.slice('prefsTab-'.length), true);
        });
        // 背景動畫開關：另一條分支提供 lhBgFxSet(on)；沒有這個函式就不顯示。目前狀態讀 lhBgFxIsOn()（js/bgfx.js）／<html data-bgfx>，都沒有就當開著
        function _lhPrefsBgFxSync() {
            const b = document.getElementById('prefsBgFx');
            b.hidden = typeof lhBgFxSet !== 'function';
            if (b.hidden) return;
            const on = typeof lhBgFxIsOn === 'function' ? !!lhBgFxIsOn() : document.documentElement.dataset.bgfx !== 'off';
            b.setAttribute('aria-checked', String(on));
            b.querySelector('.rm-pill').textContent = on ? '開' : '關';
        }
        document.getElementById('prefsBgFx').addEventListener('click', e => {
            if (typeof lhBgFxSet !== 'function') return;
            lhBgFxSet(e.currentTarget.getAttribute('aria-checked') !== 'true');
            _lhPrefsBgFxSync();
        });

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

        // Esc 關掉偏好設定（注音組字中的 Esc、別處已經處理過的 Esc 不算）
        document.addEventListener('keydown', e => {
            if (e.key !== 'Escape' || e.isComposing || e.keyCode === 229 || e.defaultPrevented) return;
            const ov = document.getElementById('settingsOverlay');
            if (!ov.classList.contains('show')) return;
            ov.classList.remove('show');
            e.preventDefault();
        });

        function closeSettingsOverlay(event) {
            // 點擊遮罩本身才關閉（內容區已 stopPropagation）；按鈕手動傳 {target: 遮罩} 進來時沒有 currentTarget，直接關
            if (!event.currentTarget || event.target === event.currentTarget) {
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
            const overlay = document.getElementById('aboutOverlay');
            overlay.classList.toggle('show');
            // 每次打開都重讀：換包之後看到的永遠是目前這一包的來源說明
            if (overlay.classList.contains('show')) renderAboutPackNotice();
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

