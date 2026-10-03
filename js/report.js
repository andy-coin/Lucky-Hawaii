        // 右鍵回報選單
        let _ctxWord = '';
        const _ctxMenu = document.getElementById('wordCtxMenu');
        function _hideCtxMenu() { _ctxMenu.classList.remove('show'); }

        // 破音字 chip 回報選單
        let _polyCtxChar = '', _polyCtxReading = '';
        const _polyCtxMenu = document.getElementById('polyChipCtxMenu');
        function _hidePolyCtxMenu() { _polyCtxMenu.classList.remove('show'); }

        function _showPolyCtxMenu(char, reading, x, y) {
            _polyCtxChar = char;
            _polyCtxReading = reading;
            // reading 是 zhuyin+toneMark；切換到拼音時轉成拼音顯示
            let displayReading = reading;
            if (lastSearchType === 'pinyin') {
                const m = reading.match(/^(.*?)([ˊˇˋ˙])?$/);
                const base = m ? m[1] : reading;
                const toneIdx = ['', 'ˊ', 'ˇ', 'ˋ', '˙'].indexOf(m && m[2] || '');
                const tone = toneIdx > 0 ? toneIdx + 1 : 1;
                displayReading = fmtPhonetic(base, tone);
            }
            document.getElementById('polyChipCtxTitle').textContent = `「${char}」${displayReading}`;
            _polyCtxMenu.style.left = Math.min(x, window.innerWidth - 160) + 'px';
            _polyCtxMenu.style.top = Math.min(y, window.innerHeight - 100) + 'px';
            _polyCtxMenu.classList.add('show');
        }

        window.addEventListener('resize', syncCenterPanel);
        document.addEventListener('click', () => { _hideCtxMenu(); _hidePolyCtxMenu(); });
        document.addEventListener('contextmenu', e => {
            if (!e.target.closest('.word-ctx-menu') && !e.target.closest('.ai-word-card') && !e.target.closest('.char-card')) _hideCtxMenu();
            if (!e.target.closest('.word-ctx-menu') && !e.target.closest('.poly-chip')) _hidePolyCtxMenu();
        });

        function wordCtxReport(type) {
            _hideCtxMenu();
            const labels = { rhyme: '押韻錯誤', notExist: '詞不存在', duplicate: '重複出現', obscure: '極度冷僻' };
            postFeedback({ type: 'word-report', word: _ctxWord, reportType: labels[type] });
            showToast(`已回報「${_ctxWord}」— ${labels[type]}`);
        }

        // AI 造詞專用：建議收錄 / 修改後收錄
        function aiWordSuggest(action) {
            _hideCtxMenu();
            if (action === 'accept') {
                postFeedback({ type: 'ai-word-suggest', word: _ctxWord, action: 'accept' });
                showToast(`已建議收錄「${_ctxWord}」`);
            } else if (action === 'modify') {
                const modified = prompt(`「${_ctxWord}」修改為：`, _ctxWord);
                if (!modified || modified === _ctxWord) return;
                postFeedback({ type: 'ai-word-suggest', word: _ctxWord, action: 'modify', modified });
                showToast(`已建議「${_ctxWord}」→「${modified}」`);
            }
        }

        const _CTX_MENU_NORMAL = `
        <div class="word-ctx-item" onclick="wordCtxReport('notExist')">❓ 詞不存在</div>
        <div class="word-ctx-item" onclick="wordCtxReport('obscure')">📦 極度冷僻</div>
        <div class="word-ctx-item" onclick="wordCtxReport('rhyme')">🎵 押韻錯誤</div>
        <div class="word-ctx-item" onclick="wordCtxReport('duplicate')">🔁 重複出現</div>
        <div class="word-ctx-item" onclick="wordSuggestReading()">🔤 建議讀音</div>`;
        const _CTX_MENU_AI = `
            <div class="word-ctx-item" onclick="aiWordSuggest('accept')">✅ 建議收錄</div>
            <div class="word-ctx-item" onclick="aiWordSuggest('modify')">✏️ 建議修改</div>
            <div class="word-ctx-item" onclick="wordSuggestReading()">🔤 建議讀音</div>`;

        function wordSuggestReading() {
            _hideCtxMenu();
            if (!_ctxWord) return;
            const currentZ = getWordPhoneticDisplay(_ctxWord) || '';
            const hint = lastSearchType === 'pinyin'
                ? '建議的拼音（空白分隔，含聲調數字，例：chang2 da4）：'
                : '建議的注音（空白分隔，含聲調符號，例：ㄔㄤˊ ㄉㄚˋ）：';
            const suggested = prompt(`「${_ctxWord}」${hint}`, currentZ.replace(/\s+/g,' '));
            if (!suggested || !suggested.trim()) return;
            postFeedback({ type: 'word-report', word: _ctxWord, reportType: '建議讀音', suggested: suggested.trim() });
            showToast(`已建議「${_ctxWord}」讀音`);
        }

        // ===== 字卡右鍵 =====
        let _charCtxChar = null;
        function _showCharCtxMenu(char, x, y) {
            _charCtxChar = char;
            const readings = getCharReadingsFormatted(char);
            document.getElementById('wordCtxTitle').textContent = char;
            const readingRows = readings.map(({text, tier}) => {
                const cls = tier === 'rare' ? 'word-ctx-reading-row rare' : 'word-ctx-reading-row';
                const mark = tier === 'rare' ? '<span class="rare-mark">冷</span>' : '';
                return `<div class="${cls}">${text}${mark}</div>`;
            }).join('');
            document.getElementById('wordCtxItems').innerHTML =
                readingRows +
                `<div class="word-ctx-item" onclick="charSuggestReading()">🔤 建議讀音</div>`;
            _ctxMenu.style.left = Math.min(x, window.innerWidth - 220) + 'px';
            _ctxMenu.style.top = Math.min(y, window.innerHeight - 100) + 'px';
            _ctxMenu.classList.add('show');
        }
        function charSuggestReading() {
            _hideCtxMenu();
            if (!_charCtxChar) return;
            const current = getCharReadingsFormatted(_charCtxChar).map(r => r.text).join('／');
            const hint = lastSearchType === 'pinyin'
                ? '建議的拼音（含聲調數字，例：chang2）：'
                : '建議的注音（含聲調符號，例：ㄔㄤˊ）：';
            const suggested = prompt(`「${_charCtxChar}」目前讀音：${current}\n${hint}`, '');
            if (!suggested || !suggested.trim()) return;
            postFeedback({ type: 'char-reading-report', char: _charCtxChar, reportType: '建議讀音', suggested: suggested.trim() });
            showToast(`已建議「${_charCtxChar}」讀音`);
        }
        // 字卡 contextmenu / 長按
        document.addEventListener('contextmenu', e => {
            const card = e.target.closest('.char-card');
            if (!card || e.target.closest('.mark-badge')) return;
            const char = card.dataset.char;
            if (!char) return;
            e.preventDefault();
            _showCharCtxMenu(char, e.clientX, e.clientY);
        });
        let _charLongPressTimer = null, _charLongPressMoved = false;
        document.addEventListener('touchstart', e => {
            const card = e.target.closest('.char-card');
            if (!card || e.target.closest('.mark-badge')) return;
            _charLongPressMoved = false;
            _charLongPressTimer = setTimeout(() => {
                if (_charLongPressMoved) return;
                const t = e.touches[0];
                _showCharCtxMenu(card.dataset.char, t.clientX, t.clientY);
            }, 500);
        }, { passive: true });
        document.addEventListener('touchmove', e => {
            if (e.target.closest('.char-card')) {
                _charLongPressMoved = true;
                clearTimeout(_charLongPressTimer);
            }
        }, { passive: true });
        document.addEventListener('touchend', e => {
            if (e.target.closest('.char-card')) clearTimeout(_charLongPressTimer);
        }, { passive: true });
        function _setCtxMenuFor(card) {
            const isAI = !!card.querySelector('.ai-badge');
            document.getElementById('wordCtxItems').innerHTML = isAI ? _CTX_MENU_AI : _CTX_MENU_NORMAL;
        }

        function polyChipReport(type) {
            _hidePolyCtxMenu();
            if (type === 'missingReading') {
                document.getElementById('feedbackSubject').value = `「${_polyCtxChar}」缺少讀音`;
                document.getElementById('feedbackBody').value = '';
                document.getElementById('feedbackModalOverlay').classList.add('show');
                setTimeout(() => document.getElementById('feedbackBody').focus(), 50);
            } else {
                const labels = { wrongReading: '讀音錯誤', obscure: '極度冷僻' };
                postFeedback({ type: 'char-reading-report', char: _polyCtxChar, reading: _polyCtxReading, reportType: labels[type] });
                showToast(`已回報「${_polyCtxChar}」${_polyCtxReading} — ${labels[type]}`);
            }
        }

        // 破音字 chip：右鍵（桌面）+ 長按（手機）— 用 document 委派，因為 chips 是動態元素
        document.addEventListener('contextmenu', e => {
            const chip = e.target.closest('.poly-chip');
            if (!chip) return;
            e.preventDefault();
            _showPolyCtxMenu(chip.dataset.char, chip.dataset.reading, e.clientX, e.clientY);
        });
        let _polyLongPressTimer = null, _polyLongPressMoved = false;
        document.addEventListener('touchstart', e => {
            const chip = e.target.closest('.poly-chip');
            if (!chip) return;
            _polyLongPressMoved = false;
            _polyLongPressTimer = setTimeout(() => {
                if (_polyLongPressMoved) return;
                const touch = e.touches[0];
                _showPolyCtxMenu(chip.dataset.char, chip.dataset.reading, touch.clientX, touch.clientY);
            }, 500);
        }, { passive: true });
        document.addEventListener('touchmove', e => {
            if (e.target.closest('.poly-chip')) {
                _polyLongPressMoved = true;
                clearTimeout(_polyLongPressTimer);
            }
        }, { passive: true });
        document.addEventListener('touchend', e => {
            if (e.target.closest('.poly-chip')) clearTimeout(_polyLongPressTimer);
        }, { passive: true });
        document.addEventListener('touchcancel', e => {
            if (e.target.closest('.poly-chip')) clearTimeout(_polyLongPressTimer);
        }, { passive: true });

        async function postFeedback(data) {
            // 回傳是否送出成功；失敗時給使用者一個白話提示（D-08：回報是使用者主動的操作）
            try {
                const res = await fetch(WORKER_URL + '/feedback', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                if (res.ok) return true;
                lhWarn('回報送出失敗：伺服器回應 ' + res.status);
            } catch(e) {
                lhWarn('回報送出失敗', e);
            }
            showToast('回報沒有送出，請檢查網路後再試一次');
            return false;
        }

        function openFeedbackModal() {
            document.getElementById('feedbackSubject').value = '';
            document.getElementById('feedbackBody').value = '';
            document.getElementById('feedbackModalOverlay').classList.add('show');
            setTimeout(() => document.getElementById('feedbackSubject').focus(), 50);
        }

        function closeFeedbackModal(e) {
            if (e && e.target !== document.getElementById('feedbackModalOverlay')) return;
            document.getElementById('feedbackModalOverlay').classList.remove('show');
        }

        async function submitFeedback() {
            const subject = document.getElementById('feedbackSubject').value.trim();
            const body = document.getElementById('feedbackBody').value.trim();
            if (!subject && !body) { showToast('請填寫主旨或內文'); return; }
            // 送出成功才關視窗；失敗時視窗與已輸入的文字都留著，使用者可以直接重試（postFeedback 失敗時已顯示提示）
            const sendBtn = document.querySelector('.feedback-send-btn');
            sendBtn.disabled = true;   // 送出中不能重複按
            try {
                if (await postFeedback({ type: 'feedback', subject, body })) {
                    document.getElementById('feedbackModalOverlay').classList.remove('show');
                    showToast('感謝你的回饋！');
                }
            } finally { sendBtn.disabled = false; }
        }

