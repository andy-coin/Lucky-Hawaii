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

