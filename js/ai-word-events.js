        // Hover 3 秒顯示詞語注音/拼音
        let _phoneticTimer = null;
        const _phoneticTooltip = (() => {
            const el = document.createElement('div');
            el.className = 'phonetic-tooltip';
            document.body.appendChild(el);
            return el;
        })();
        const _aiWordsCt = document.getElementById('aiWordsContainer');
        _aiWordsCt.addEventListener('contextmenu', e => {
            const card = e.target.closest('.ai-word-card');
            if (!card) return;
            e.preventDefault();
            _ctxWord = card.dataset.word || card.textContent.replace('AI','').trim();
            const _ph = getWordPhoneticDisplay(_ctxWord);
            document.getElementById('wordCtxTitle').innerHTML =
                _ctxWord + (_ph ? `<span class="ctx-phonetic">${_ph}</span>` : '') + _pSuffix(_ctxWord);
            _setCtxMenuFor(card);
            lhPlaceMenu(_ctxMenu, e.clientX, e.clientY);
        });

        // 手機長按觸發回報選單
        let _longPressTimer = null;
        let _longPressMoved = false;
        _aiWordsCt.addEventListener('touchstart', e => {
            const card = e.target.closest('.ai-word-card');
            if (!card) return;
            _longPressMoved = false;
            _longPressTimer = setTimeout(() => {
                if (_longPressMoved) return;
                _ctxWord = card.dataset.word || card.textContent.replace('AI','').trim();
                document.getElementById('wordCtxTitle').textContent = `「${_ctxWord}」` + _pSuffix(_ctxWord);
                _setCtxMenuFor(card);
                const touch = e.touches[0];
                lhPlaceMenu(_ctxMenu, touch.clientX, touch.clientY);
            }, 500);
        }, { passive: true });
        _aiWordsCt.addEventListener('touchmove', () => {
            _longPressMoved = true;
            clearTimeout(_longPressTimer);
        }, { passive: true });
        _aiWordsCt.addEventListener('touchend', () => clearTimeout(_longPressTimer), { passive: true });
        _aiWordsCt.addEventListener('touchcancel', () => clearTimeout(_longPressTimer), { passive: true });
        _aiWordsCt.addEventListener('mouseover', e => {
            const card = e.target.closest('.ai-word-card');
            if (!card || !card.dataset.word) return;
            clearTimeout(_phoneticTimer);
            _phoneticTimer = setTimeout(() => {
                const phonetic = getWordPhoneticDisplay(card.dataset.word);
                const suffix = _pSuffix(card.dataset.word);
                if (!phonetic && !suffix) return;
                _phoneticTooltip.textContent = (phonetic || '') + suffix;
                const rect = card.getBoundingClientRect();
                _phoneticTooltip.style.left = (rect.left + rect.width / 2) + 'px';
                _phoneticTooltip.style.top = rect.top + 'px';
                _phoneticTooltip.classList.add('show');
            }, 1000);
        });
        _aiWordsCt.addEventListener('mouseout', e => {
            const card = e.target.closest('.ai-word-card');
            if (!card) return;
            if (card.contains(e.relatedTarget)) return;
            clearTimeout(_phoneticTimer);
            _phoneticTooltip.classList.remove('show');
        });

        // ===== AI 詞卡回報模式（Phase 7，D-03） =====
        // 手機不靠長按也能回報 AI 建議的詞：按「🚩 回報詞語」進入選取模式，點詞當作選取（不再存進保留區），
        // 按「回報（n）」開回報視窗。模式只活在 #aiWordsContainer.report-mode 這個 class，不寫任何儲存。
        const _aiRepRow = document.getElementById('aiReportRow');
        const _aiRepText = document.getElementById('aiReportText');
        const _aiRepStart = document.getElementById('aiReportStart');
        const _aiRepSend = document.getElementById('aiReportSend');
        const _aiRepExit = document.getElementById('aiReportExit');
        const _aiPickedCards = () => [..._aiWordsCt.querySelectorAll('.ai-word-card.report-picked')];

        function _renderAiReportRow() {
            const on = _aiWordsCt.classList.contains('report-mode');
            const n = _aiPickedCards().length;
            _aiRepRow.hidden = !_aiWordsCt.querySelector('.ai-word-card');   // 沒有詞卡（還沒生成、載入中、失敗）整列藏起來
            _aiRepRow.classList.toggle('active', on);
            _aiRepStart.hidden = on;
            _aiRepExit.hidden = !on;
            _aiRepSend.hidden = !on || n === 0;
            _aiRepText.textContent = !on ? '' : n === 0 ? '點選要回報的詞' : `已選 ${n} 個詞`;
            _aiRepSend.textContent = `回報（${n}）`;
            _aiRepSend.setAttribute('aria-label', `回報已選的 ${n} 個詞`);
            _aiRepSend.title = `回報已選的 ${n} 個詞`;
        }
        function exitAiReportMode() {
            _aiWordsCt.classList.remove('report-mode');
            _aiPickedCards().forEach(c => c.classList.remove('report-picked'));
            _renderAiReportRow();
        }
        // 用捕獲階段：詞卡自己的 onclick="saveWord(...)" 在目標階段才跑，非得在它之前攔下，選取模式才不會存詞
        _aiWordsCt.addEventListener('click', e => {
            if (!_aiWordsCt.classList.contains('report-mode')) return;
            const card = e.target.closest('.ai-word-card');
            if (!card) return;
            e.stopPropagation();
            e.preventDefault();
            card.classList.toggle('report-picked');
            _renderAiReportRow();
        }, true);
        // 詞卡被清空（重新生成、換搜尋、重置）就離開模式；有新詞卡出現就把列顯示出來
        new MutationObserver(() => {
            if (_aiWordsCt.querySelector('.ai-word-card')) _renderAiReportRow(); else exitAiReportMode();
        }).observe(_aiWordsCt, { childList: true });
        _aiRepStart.addEventListener('click', () => { _aiWordsCt.classList.add('report-mode'); _renderAiReportRow(); });
        _aiRepExit.addEventListener('click', exitAiReportMode);
        _aiRepSend.addEventListener('click', () => {
            const words = _aiPickedCards().map(c => c.dataset.word).filter(Boolean);
            if (words.length) openReportDialog(words.map(word => ({ kind: 'word', word })), { onSent: exitAiReportMode });
        });

