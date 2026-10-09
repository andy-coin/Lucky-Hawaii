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
            lhPlaceMenu(_polyCtxMenu, x, y);
        }

        // 桌機改視窗寬度時重新檢查「兩個面板同時開、主畫面會不夠寬」；用箭頭函式，避免把 resize 事件當成參數傳進去
        window.addEventListener('resize', () => syncCenterPanel());
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
            lhPlaceMenu(_ctxMenu, x, y);
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

        // 送出一筆回報；回傳 { ok, status }（網路錯誤 status 為 0）。只記錄、不跳提示，由呼叫的人決定怎麼告訴使用者
        async function postFeedbackRaw(data) {
            try {
                const res = await fetch(WORKER_URL + '/feedback', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                if (res.ok) return { ok: true, status: res.status };
                lhWarn('回報送出失敗：伺服器回應 ' + res.status);
                return { ok: false, status: res.status };
            } catch(e) {
                lhWarn('回報送出失敗', e);
                return { ok: false, status: 0 };
            }
        }

        async function postFeedback(data) {
            // 回傳是否送出成功；失敗時給使用者一個白話提示（D-08：回報是使用者主動的操作）
            const r = await postFeedbackRaw(data);
            if (!r.ok) showToast('回報沒有送出，請檢查網路後再試一次');
            return r.ok;
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

        // ===== 回報視窗（Phase 7，FB-01） =====
        const REPORT_MAX = 10;          // 一次最多回報幾個（每個一筆 KV 寫入）
        const REPORT_CHIPS_MAX = 8;     // 視窗裡最多列幾個字詞晶片，其餘收成「+k」
        const REPORT_NOTE_MAX = 500;    // 說明欄上限（Unicode 字元數，不是 UTF-16 長度）
        // 視窗上的原因 → 實際存進去的 reportType（後台依 reportType 合併）＋選了之後的說明欄提示
        const REPORT_REASONS = {
            '讀音錯誤': { type: '讀音錯誤', placeholder: '你覺得正確的讀音是？（選填）例：ㄔㄤˊ', placeholderPinyin: '你覺得正確的讀音是？（選填）例：chang2' },
            '太冷僻': { type: '極度冷僻', placeholder: '補充說明（選填）' },
            '不該出現': { type: '不該出現', placeholder: '補充說明（選填）' },
            '其他': { type: '其他', placeholder: '請簡單說明（選填）' }
        };
        const _REPORT_TONE_MARKS = ['', '', 'ˊ', 'ˇ', 'ˋ', '˙'];
        // 視窗狀態只活在這個物件（不寫 localStorage）：items 是開啟當下的快照，換選取也不會變
        const _report = { items: [], reason: null, opener: null, sending: false };

        // 讀目前選取的字卡 → 回報項目（依畫面順序；壞掉的卡與重複的卡略過）
        function _reportItemsFromSelection() {
            const items = [], seen = new Set();
            document.querySelectorAll('.char-card.selected').forEach(card => {
                const char = card.dataset.char, key = card.dataset.key;
                if (!char || !key || key === 'undefined0' || seen.has(char + key)) return;
                seen.add(char + key);
                const base = key.slice(0, -1), tone = parseInt(key.slice(-1), 10) || 1;
                items.push({ kind: 'char', char, base, tone, reading: base + _REPORT_TONE_MARKS[tone] });
            });
            return items;
        }

        function _reportItemLabel(it) { return it.kind === 'char' ? it.char : it.word; }

        function _renderReportState() {
            const items = _report.items;
            const title = document.getElementById('reportTitle');
            title.textContent = items.length === 1 ? `回報「${_reportItemLabel(items[0])}」` : `回報 ${items.length} 個字詞`;
            const box = document.getElementById('reportWords');
            box.textContent = '';
            items.slice(0, REPORT_CHIPS_MAX).forEach(it => {
                const chip = document.createElement('span');
                chip.className = 'report-chip';
                chip.appendChild(document.createTextNode(_reportItemLabel(it)));
                if (it.kind === 'char') {
                    const r = document.createElement('span');
                    r.className = 'report-chip-reading';
                    r.textContent = fmtPhonetic(it.base, it.tone);
                    chip.appendChild(r);
                }
                box.appendChild(chip);
            });
            if (items.length > REPORT_CHIPS_MAX) {
                const more = document.createElement('span');
                more.className = 'report-chip';
                more.textContent = `+${items.length - REPORT_CHIPS_MAX}`;
                box.appendChild(more);
            }
            document.querySelectorAll('#reportReasons .report-reason').forEach(b => {
                const on = b.dataset.reason === _report.reason;
                b.setAttribute('aria-checked', on ? 'true' : 'false');
                b.querySelector('.report-reason-label').textContent = (on ? '✓ ' : '') + b.dataset.reason;
            });
            const info = REPORT_REASONS[_report.reason];
            document.getElementById('reportNote').placeholder = info
                ? ((lastSearchType === 'pinyin' && info.placeholderPinyin) || info.placeholder) : '補充說明（選填）';
            document.getElementById('reportSendBtn').disabled = !_report.reason || _report.sending;
            document.getElementById('reportSendBtn').textContent = items.length > 1 ? `送出回報（${items.length} 個）` : '送出回報';
        }

        // 打開回報視窗；items 預設是目前選取的字卡。什麼都沒選就只跳提示（D-02）
        function openReportDialog(items) {
            const list = Array.isArray(items) ? items : _reportItemsFromSelection();
            if (list.length === 0) { showToast('先點一下要回報的字，再按回報'); return; }
            _report.items = list.slice(0, REPORT_MAX);
            _report.reason = null;
            _report.sending = false;
            _report.opener = document.activeElement;
            document.getElementById('reportNote').value = '';
            document.getElementById('reportStatus').textContent = '';
            _renderReportState();
            document.getElementById('reportModalOverlay').classList.add('show');
            document.getElementById('reportTitle').focus();   // 焦點放標題，不放說明欄，手機鍵盤才不會彈出來
        }

        function closeReportDialog(e) {
            const overlay = document.getElementById('reportModalOverlay');
            if (e && e.target !== overlay) return;
            overlay.classList.remove('show');
            const op = _report.opener;
            _report.opener = null;
            if (op && op.focus && document.contains(op)) op.focus();
        }

        function _reportPayload(it, reportType, note) {
            const body = it.kind === 'char'
                ? { type: 'char-reading-report', char: it.char, reading: it.reading, reportType }
                : { type: 'word-report', word: it.word, reportType };
            if (note) body[reportType === '讀音錯誤' ? 'suggested' : 'note'] = note;
            return body;
        }

        async function submitReport() {
            if (!_report.reason || _report.sending) return;
            const reportType = REPORT_REASONS[_report.reason].type;
            const note = document.getElementById('reportNote').value.trim();
            _report.sending = true;
            _renderReportState();
            let allOk = true;
            for (const it of _report.items) {
                const r = await postFeedbackRaw(_reportPayload(it, reportType, note));
                if (!r.ok) { allOk = false; break; }
            }
            _report.sending = false;
            if (!allOk) {
                showToast('回報沒有送出，請檢查網路後再試一次');
                _renderReportState();
                return;
            }
            const first = _report.items[0];
            showToast(_report.items.length === 1 ? `已回報「${_reportItemLabel(first)}」— ${_report.reason}` : `已回報 ${_report.items.length} 個字詞，謝謝你`);
            closeReportDialog();
        }

        document.querySelectorAll('#reportReasons .report-reason').forEach(b => b.addEventListener('click', () => {
            if (_report.sending) return;
            _report.reason = b.dataset.reason;
            _renderReportState();
        }));
        document.getElementById('reportCancelBtn').addEventListener('click', () => closeReportDialog());
        document.getElementById('reportSendBtn').addEventListener('click', () => submitReport());
