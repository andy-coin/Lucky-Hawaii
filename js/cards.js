        // 創建字卡 (highlightTarget: 'initial'=標記子音, 'rhyme'=標記母音, null=自動)
        function createCharCard(item, showPinyin, highlightTarget) {
            const isSelected = selectedChars.has(item.char) ? 'selected' : '';
            const highlightSearch = document.getElementById('highlightSearch').checked;
            const mark = getCharMark(item.char, item.zhuyin, item.tone);
            const customColorClass = hasCustomTextColor ? 'custom-color' : '';
            
            let displayText = '';
            
            if (showPinyin) {
                const showAsZhuyin = lastSearchType === 'bopomofo';
                const zhuyinInit = item.zhuyinInitial || '';
                const zhuyinRhy = item.zhuyinRhyme || '';
                

                // 如果韻母就是整個注音（純聲母字如 ㄓ），不拆分
                const isInitialOnly = zhuyinInit && zhuyinRhy === item.zhuyin;
                
                if (showAsZhuyin) {
                    // === 注音顯示模式 ===
                    const dispInit = zhuyinInit;
                    const dispRhyme = isInitialOnly ? '' : zhuyinRhy;
                    
                    if (highlightSearch) {
                        const searchTerm = searchedTerms.find(s => s.index === item.rhymeIndex) || searchedTerms[0];
                        const colorIdx = item._displayIndex !== undefined ? item._displayIndex : item.rhymeIndex;
                        const hlInit = highlightTarget ? (highlightTarget === 'initial') : (searchTerm && searchTerm.isInitial);
                        
                        // 判斷顏色標記對象
                        let currentTarget = hlInit ? dispInit : dispRhyme;
                        if (currentMode === 'initial' || (lastTarget !== currentTarget)) {
                            colorClass = `search-highlight-${(colorIdx % 5) + 1}`;
                        }
                        lastTarget = currentTarget;
                        
                        if (isInitialOnly) {
                            // 純聲母字（如 ㄓ=知）：整個標記
                            displayText = `<span class="${colorClass}">${dispInit}</span>`;
                        } else if (hlInit) {                            
                            displayText = `<span class="${colorClass}">${dispInit}</span>${dispRhyme}`;
                        } else {
                            displayText = `${dispInit}<span class="${colorClass}">${dispRhyme}</span>`;
                        }

                    } else {
                        displayText = isInitialOnly ? zhuyinInit : (zhuyinInit + zhuyinRhy);
                    }
                } else {
                    // === 拼音顯示模式 ===
                    const pinyinFull = item.pinyin || zhuyinToPinyin(item.zhuyin);
                    let pInit = '';
                    let pRhyme = pinyinFull;
                    for (const pi of pinyinInitials) {
                        if (pinyinFull.startsWith(pi) && pinyinFull.length > pi.length) {
                            pInit = pi;
                            pRhyme = pinyinFull.substring(pi.length);
                            break;
                        }
                    }

                    if (highlightSearch) {
                        const searchTerm = searchedTerms.find(s => s.index === item.rhymeIndex) || searchedTerms[0];
                        const colorIdx = item._displayIndex !== undefined ? item._displayIndex : item.rhymeIndex;
                        const hlInit = highlightTarget ? (highlightTarget === 'initial') : (searchTerm && searchTerm.isInitial);

                        // 判斷顏色標記對象
                        let currentTarget = hlInit ? pInit : pRhyme;
                        if (currentMode === 'initial' || (lastTarget !== currentTarget)) {
                            colorClass = `search-highlight-${(colorIdx % 5) + 1}`;
                        }
                        lastTarget = currentTarget;

                        if (hlInit) {
                            displayText = `<span class="${colorClass}">${pInit}</span>${pRhyme}`;
                        } else {
                            displayText = `${pInit}<span class="${colorClass}">${pRhyme}</span>`;
                        }
                    } else {
                        displayText = pinyinFull;
                    }
                }
            }
            
            // 聲調符號：一律用注音符號(ˊˇˋ˙)；拼音模式也沿用，bypass 12345 轉換
            if (showPinyin && displayText) {
                const toneMark = ['', '', 'ˊ', 'ˇ', 'ˋ', '˙'][item.tone] || '';
                if (toneMark) {
                    displayText += `<span class="tone-mark">${toneMark}</span>`;
                }
            }

            // 標記徽章：只顯示狀態（0.98.10：點徽章改屬性太容易誤觸，改成選字卡後按上面的常用／一般／冷僻）
            const dictKey = (item.zhuyin || '') + (item.tone || 0);
            let badgeHTML = '';
            const badgeAttr = `data-char="${item.char}" data-key="${dictKey}"`;
            if (mark === 'common') {
                badgeHTML = `<span class="mark-badge common" ${badgeAttr}>常用</span>`;
            } else if (mark === 'rare') {
                badgeHTML = `<span class="mark-badge rare" ${badgeAttr}>冷僻</span>`;
            } else {
                badgeHTML = `<span class="mark-badge normal" ${badgeAttr}>一般</span>`;
            }
            
            return `
                <div class="char-card ${isSelected}" data-char="${item.char}" data-key="${dictKey}">
                    <div class="char-main ${customColorClass}">${item.char}</div>
                    ${showPinyin ? `<div class="char-pinyin">${displayText}</div>` : ''}
                    ${badgeHTML}
                </div>
            `;
        }

        // 延遲重排系統
        let reorderTimer = null;
        const REORDER_DELAY = 3000;
        const pendingChanges = new Map(); // key: char+dictKey → oldTier

        function scheduleReorder() {
            if (reorderTimer) clearTimeout(reorderTimer);
            reorderTimer = setTimeout(() => {
                reorderTimer = null;
                // 快照庫空了 = 全部改回去了 = 不重排
                if (pendingChanges.size === 0) return;
                pendingChanges.clear();
                const currentInput = document.getElementById('searchInput').value;
                if (currentInput) {
                    const container = document.getElementById('resultsContainer');
                    container.style.opacity = '0.001';
                    container.style.transition = 'opacity 0.3s ease';
                    setTimeout(() => {
                        const results = searchRhyme(currentInput);
                        displayResults(results);
                        container.style.opacity = '1';
                    }, 500);
                }
            }, REORDER_DELAY);
        }

        // 切換選中狀態
        function toggleSelection(char, cardElement) {
            if (selectedChars.has(char)) {
                selectedChars.delete(char);
                cardElement.classList.remove('selected');
            } else {
                selectedChars.add(char);
                cardElement.classList.add('selected');
                // addToRecentClicks replaced by new panels
            }
            updateBatchCount();
        }

        function batchMark(action) {
            if (selectedChars.size === 0) return;

            const cards = document.querySelectorAll('.char-card.selected');
            const processed = new Set();
            const newTier = action === 'clear' ? 'normal' : action;
            const tierLabels = { common: '常用', normal: '一般', rare: '冷僻' };

            cards.forEach(card => {
                const char = card.dataset.char;
                const dictKey = card.dataset.key;
                if (!char || !dictKey || dictKey === 'undefined0' || processed.has(char + dictKey)) return;
                processed.add(char + dictKey);

                const baseZhuyin = dictKey.slice(0, -1);
                const snapKey = char + dictKey;

                // 拍快照（首次改動才記錄）
                if (!pendingChanges.has(snapKey)) {
                    pendingChanges.set(snapKey, getCharMark(char, baseZhuyin, +dictKey.slice(-1)));
                }

                moveCharTier(char, dictKey, newTier);

                // 比對：改回原狀態 → 消除快照
                if (pendingChanges.get(snapKey) === newTier) {
                    pendingChanges.delete(snapKey);
                }

                // 更新徽章外觀
                const badge = card.querySelector('.mark-badge');
                if (badge) {
                    badge.className = `mark-badge ${newTier}`;
                    badge.textContent = tierLabels[newTier];
                }
            });

            updateBatchCount();
            scheduleReorder();
        }

        // 更新批量面板計數
        function updateBatchCount() {
            const el = document.getElementById('batchCount');
            if (el) {
                el.textContent = selectedChars.size > 0 ? `已選 ${selectedChars.size} 字` : '';
            }
            // 已選的字用大字排在結果最上面（Andy：讓創作者一直盯著它想）；有選字時整列黏在捲動區頂端
            const board = document.getElementById('selBoard');
            if (board) {
                board.replaceChildren(...[...selectedChars].map(c => { const sp = document.createElement('span'); sp.textContent = c; return sp; }));
                board.closest('.results-header')?.classList.toggle('has-sel', selectedChars.size > 0);
            }
            // 🚩 回報鈕：沒選字時標成 aria-disabled（仍可按，會跳提示），選了就恢復
            document.querySelectorAll('.btn-report').forEach(b => b.setAttribute('aria-disabled', selectedChars.size === 0 ? 'true' : 'false'));
            // 「關聯詞彙」：選了字卡才出現（js/word-space.js lhWsRelOpen）
            const rel = document.getElementById('wsRelBtn');
            if (rel) rel.hidden = selectedChars.size === 0;
            updateSelectedCharsHint();
            // 0.98.20 Andy：字多到放不下時，捲到最新選的那個字（看得到捲動＝知道可以滑），兩側再淡出提示
            requestAnimationFrame(() => {
                for (const s of document.querySelectorAll('#selBoard, #selectedCharsDisplay')) if (s.scrollWidth > s.clientWidth) s.scrollTo({ left: s.scrollWidth, behavior: 'smooth' });
                lhScrollCue();
            });
        }

        // 只能左右捲的那幾條（已選的字、破音字讀音鈕、AI 選字模式條）：哪一邊還有東西，那一邊就淡出（css/base.css .sx-l／.sx-r）；
        // 滑鼠滾輪上下滾也會左右捲（捲到底就照常捲頁面）
        const LH_SX_SEL = '.sel-board, .results-header .polyphonic-chips, .selected-chars-hint .hint-chars';
        function lhScrollCue() {
            for (const el of document.querySelectorAll(LH_SX_SEL)) {
                const m = el.scrollWidth - el.clientWidth;
                el.classList.toggle('sx-l', m > 1 && el.scrollLeft > 1);
                el.classList.toggle('sx-r', m > 1 && el.scrollLeft < m - 1);
            }
        }
        document.addEventListener('scroll', e => { if (e.target.matches && e.target.matches(LH_SX_SEL)) lhScrollCue(); }, true);
        document.addEventListener('wheel', e => {
            const el = e.target.closest && e.target.closest(LH_SX_SEL);
            if (!el || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
            const m = el.scrollWidth - el.clientWidth;
            if (m <= 1 || (e.deltaY < 0 ? el.scrollLeft <= 0 : el.scrollLeft >= m - 1)) return;
            el.scrollLeft += e.deltaY;
            e.preventDefault();
        }, { passive: false });
        window.addEventListener('resize', lhScrollCue);

        // 0.98.20 Andy：點查詢器（中間面板）的空白處也取消選字（詞卡的保留不動）：header 空白、選項列空白…都算；
        // 按鈕、輸入框等控制項不算；結果區由 js/results.js 自己處理（字卡之間的縫不算）
        document.addEventListener('click', e => {
            if (!selectedChars.size || !e.target.closest('#mainContainer')) return;
            if (e.target.closest('#resultsContainer, button, input, select, textarea, a, label, summary, [role="button"], [onclick], [contenteditable], .char-card')) return;
            clearSelectedChars();
        });

