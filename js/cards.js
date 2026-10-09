        // 創建字卡 (highlightTarget: 'initial'=標記子音, 'rhyme'=標記母音, null=自動)
        function createCharCard(item, showPinyin, highlightTarget) {
            const isSelected = selectedChars.has(item.char) ? 'selected' : '';
            const highlightSearch = document.getElementById('highlightSearch').checked;
            const mark = getCharMark(item.char, item.zhuyin);
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

            // 標記徽章（帶 dictKey 供直接修改字庫）
            const dictKey = (item.zhuyin || '') + (item.tone || 0);
            let badgeHTML = '';
            const badgeAttr = `data-char="${item.char}" data-key="${dictKey}"`;
            if (mark === 'common') {
                badgeHTML = `<span class="mark-badge common" ${badgeAttr} onclick="handleBadgeClick(event)">常用</span>`;
            } else if (mark === 'rare') {
                badgeHTML = `<span class="mark-badge rare" ${badgeAttr} onclick="handleBadgeClick(event)">冷僻</span>`;
            } else {
                badgeHTML = `<span class="mark-badge normal" ${badgeAttr} onclick="handleBadgeClick(event)">一般</span>`;
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

        function handleBadgeClick(event) {
            event.stopPropagation();
            event.preventDefault();
            const badge = event.target;
            const char = badge.dataset.char;
            const dictKey = badge.dataset.key;
            if (!char || !dictKey) return;

            const baseZhuyin = dictKey.slice(0, -1);
            const snapKey = char + dictKey;

            // 拍快照：記錄「改動前」的狀態（只在首次改動該字時記錄）
            if (!pendingChanges.has(snapKey)) {
                pendingChanges.set(snapKey, getCharMark(char, baseZhuyin));
            }

            // 執行狀態切換
            cycleCharMark(char, dictKey);

            // 取得切換後的新狀態
            const newMark = getCharMark(char, baseZhuyin);

            // 比對快照：新狀態 === 舊狀態 → 改回去了 → 消除快照
            if (pendingChanges.get(snapKey) === newMark) {
                pendingChanges.delete(snapKey);
            }

            // 更新徽章外觀
            const tierLabels = { common: '常用', normal: '一般', rare: '冷僻' };
            badge.className = `mark-badge ${newMark}`;
            badge.textContent = tierLabels[newMark];

            scheduleReorder();
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
                    pendingChanges.set(snapKey, getCharMark(char, baseZhuyin));
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
            // 🚩 回報鈕：沒選字時標成 aria-disabled（仍可按，會跳提示），選了就恢復
            document.querySelectorAll('.btn-report').forEach(b => b.setAttribute('aria-disabled', selectedChars.size === 0 ? 'true' : 'false'));
            updateSelectedCharsHint();
        }

