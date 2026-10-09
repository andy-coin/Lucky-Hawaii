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
        // 本頁已回報過的「字詞＋原因」：只放記憶體，重新整理就忘（A4、D-08，不寫任何儲存鍵）
        const _reportedSet = new Set();
        // 視窗狀態只活在這個物件：items 是開啟當下的快照，換選取也不會變；
        // msg 是送出後的結果訊息 { text, error }；epoch 每次關閉加 1，讓還在跑的送出知道視窗已經關了
        const _report = { items: [], reason: null, opener: null, onSent: null, sending: false, cut: false, msg: null, epoch: 0 };
        const _rpt = id => document.getElementById(id);

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

        function _reportItemLabel(it) { return it.kind === 'char' ? it.char : it.word.trim(); }
        // 同一個字詞＋同一個原因本頁只送一次；字詞用修剪後的原字串比對，不做任何正規化
        function _reportKey(it, reportType) {
            return it.kind === 'char' ? `c|${it.char}|${it.reading}|${reportType}` : `w|${it.word.trim()}|${reportType}`;
        }

        function _renderReportState() {
            const items = _report.items, info = REPORT_REASONS[_report.reason];
            const reportType = info && info.type;
            const done = it => !!reportType && _reportedSet.has(_reportKey(it, reportType));
            const skipped = items.filter(done).length;
            const fresh = items.length - skipped;
            _rpt('reportTitle').textContent = items.length === 1 ? `回報「${_reportItemLabel(items[0])}」` : `回報 ${items.length} 個字詞`;
            // 晶片只用 textContent／createElement 建，AI 來的詞帶標記也只會當文字（T-07-15）
            const box = _rpt('reportWords');
            box.textContent = '';
            items.slice(0, REPORT_CHIPS_MAX).forEach(it => {
                const chip = document.createElement('span');
                chip.className = 'report-chip' + (done(it) ? ' reported' : '');
                chip.appendChild(document.createTextNode(_reportItemLabel(it)));
                if (it.kind === 'char') {
                    const r = document.createElement('span');
                    r.className = 'report-chip-reading';
                    r.textContent = fmtPhonetic(it.base, it.tone);
                    chip.appendChild(r);
                }
                if (done(it)) {
                    const d = document.createElement('span');
                    d.className = 'report-chip-done';
                    d.textContent = '已回報過';
                    chip.appendChild(d);
                }
                box.appendChild(chip);
            });
            if (items.length > REPORT_CHIPS_MAX) {
                const more = document.createElement('span');
                more.className = 'report-chip';
                more.textContent = `+${items.length - REPORT_CHIPS_MAX}`;
                box.appendChild(more);
            }
            const btns = [...document.querySelectorAll('#reportReasons .report-reason')];
            btns.forEach((b, i) => {
                const on = b.dataset.reason === _report.reason;
                b.setAttribute('aria-checked', on ? 'true' : 'false');
                b.querySelector('.report-reason-label').textContent = (on ? '✓ ' : '') + b.dataset.reason;
                b.tabIndex = (_report.reason ? on : i === 0) ? 0 : -1;   // 單選群組只留一個 Tab 停靠點，方向鍵在裡面移動
                b.disabled = _report.sending;
            });
            const note = _rpt('reportNote');
            note.disabled = _report.sending;
            note.placeholder = info ? ((lastSearchType === 'pinyin' && info.placeholderPinyin) || info.placeholder) : '補充說明（選填）';
            // 狀態行：送出結果 > 送出中 > 已回報過 > 超過上限
            const status = _rpt('reportStatus');
            let text = '', error = false;
            if (_report.msg) { text = _report.msg.text; error = !!_report.msg.error; }
            else if (_report.sending) text = '送出中…';
            else {
                const parts = [];
                if (reportType && items.length > 0 && fresh === 0) parts.push('這些字詞已經用這個原因回報過了');
                else if (skipped > 0) parts.push(`${skipped} 個已回報過，會略過`);
                if (_report.cut) parts.push('一次最多回報 10 個，已先取前 10 個');   // 文字寫死 10，要改上限時跟 REPORT_MAX 一起改
                text = parts.join('；');
            }
            status.textContent = text;
            status.classList.toggle('error', error);
            const send = _rpt('reportSendBtn');
            const count = reportType ? fresh : items.length;
            send.textContent = _report.sending ? '送出中…' : (items.length > 1 ? `送出回報（${count} 個）` : '送出回報');
            send.setAttribute('aria-label', `送出回報，共 ${count} 個字詞`);
            send.disabled = !reportType || _report.sending || fresh === 0;
        }

        // 打開回報視窗；items 預設是目前選取的字卡。什麼都沒選就只跳提示（D-02）
        // opts.onSent：全部送出成功後呼叫（AI 詞卡回報模式用它離開選取）
        function openReportDialog(items, opts) {
            const list = Array.isArray(items) ? items : _reportItemsFromSelection();
            if (list.length === 0) { showToast('先點一下要回報的字，再按回報'); return; }
            _report.items = list.slice(0, REPORT_MAX);
            _report.cut = list.length > REPORT_MAX;
            _report.reason = null;
            _report.sending = false;
            _report.msg = null;
            _report.onSent = opts && typeof opts.onSent === 'function' ? opts.onSent : null;
            _report.opener = document.activeElement;
            _rpt('reportNote').value = '';
            _renderReportState();
            _rpt('reportModalOverlay').classList.add('show');
            _rpt('reportTitle').focus();   // 焦點放標題，不放說明欄，手機鍵盤才不會彈出來
        }

        function closeReportDialog(e) {
            const overlay = _rpt('reportModalOverlay');
            if (e) {
                if (e.target !== overlay) return;
                if (_rpt('reportNote').value.trim()) return;   // 點遮罩只在說明欄是空的時候才關，打到一半的字不能不見
            }
            if (!overlay.classList.contains('show')) return;
            overlay.classList.remove('show');
            _report.epoch++;
            _report.sending = false;
            const op = _report.opener;
            _report.opener = null;
            if (op && op.focus && document.contains(op)) op.focus();
        }

        function _reportPayload(it, reportType, note) {
            const body = it.kind === 'char'
                ? { type: 'char-reading-report', char: it.char, reading: it.reading, reportType }
                : { type: 'word-report', word: it.word.trim(), reportType };
            if (note) body[reportType === '讀音錯誤' ? 'suggested' : 'note'] = note;
            return body;
        }

        async function submitReport() {
            if (!_report.reason || _report.sending) return;
            const reportType = REPORT_REASONS[_report.reason].type;
            const todo = _report.items.filter(it => !_reportedSet.has(_reportKey(it, reportType)));
            if (todo.length === 0) return;
            const note = Array.from(_rpt('reportNote').value.trim()).slice(0, REPORT_NOTE_MAX).join('');
            const epoch = _report.epoch, onSent = _report.onSent;
            _report.sending = true;
            _report.msg = null;
            _renderReportState();
            let failed = null;
            for (const it of todo) {
                const r = await postFeedbackRaw(_reportPayload(it, reportType, note));
                if (r.ok) _reportedSet.add(_reportKey(it, reportType));
                if (epoch !== _report.epoch) return;          // 送到一半視窗被關了：不再送下一個，也不動畫面
                if (!r.ok) { failed = r; break; }
                _renderReportState();
            }
            _report.sending = false;
            if (!failed) {
                const n = _report.items.length;
                showToast(n === 1 ? `已回報「${_reportItemLabel(_report.items[0])}」— ${_report.reason}` : `已回報 ${n} 個字詞，謝謝你`);
                closeReportDialog();
                if (onSent) onSent();
                return;
            }
            // 失敗：視窗、原因、說明都留著；已送出的標成「已回報過」，使用者可以直接再按一次
            const k = _report.items.filter(it => _reportedSet.has(_reportKey(it, reportType))).length;
            if (failed.status === 429) {
                _report.msg = { text: '回報得太快了，請過一分鐘再試', error: true };
                showToast(_report.msg.text);
            } else if (k > 0) {
                _report.msg = { text: `已送出 ${k} 個，還有 ${_report.items.length - k} 個沒送出，請再按一次送出`, error: true };
            } else {
                _report.msg = { text: '回報沒有送出，請檢查網路後再試一次', error: true };
                showToast(_report.msg.text);
            }
            _renderReportState();
            _rpt('reportSendBtn').focus();
        }

        // 單選群組：點選、方向鍵移動（右／下 = 下一個，左／上 = 上一個，頭尾相接）
        (function wireReportDialog() {
            const btns = [...document.querySelectorAll('#reportReasons .report-reason')];
            const choose = b => {
                if (_report.sending) return;
                _report.reason = b.dataset.reason;
                _report.msg = null;
                _renderReportState();
            };
            btns.forEach(b => b.addEventListener('click', () => choose(b)));
            _rpt('reportReasons').addEventListener('keydown', e => {
                const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
                const i = btns.indexOf(document.activeElement);
                if (!step || i < 0) return;
                e.preventDefault();
                const next = btns[(i + step + btns.length) % btns.length];
                choose(next);
                next.focus();
            });
            _rpt('reportCancelBtn').addEventListener('click', () => closeReportDialog());
            _rpt('reportSendBtn').addEventListener('click', () => submitReport());
            // Esc 關閉；Tab 只在視窗裡打轉（遮罩蓋住整頁，簡單的焦點圈）
            document.addEventListener('keydown', e => {
                const ov = _rpt('reportModalOverlay');
                if (!ov.classList.contains('show')) return;
                if (e.key === 'Escape') { e.preventDefault(); closeReportDialog(); return; }
                if (e.key !== 'Tab') return;
                const tabbables = [...ov.querySelectorAll('button, textarea')].filter(el => !el.disabled && el.tabIndex >= 0);
                if (tabbables.length === 0) return;
                const first = tabbables[0], last = tabbables[tabbables.length - 1], a = document.activeElement;
                if (!ov.contains(a)) { e.preventDefault(); first.focus(); }
                else if (e.shiftKey && (a === first || a === _rpt('reportTitle'))) { e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
            });
        })();
