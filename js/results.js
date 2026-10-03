        // 顯示結果
        function displayResults(results) {
            
            // 搜尋欄為空時恢復初始畫面
            const currentInput = document.getElementById('searchInput').value.trim();
            if (!currentInput) {
                const container = document.getElementById('resultsContainer');
                container.innerHTML = `
                    <div class="empty-state">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                        </svg>
                        <h3>開始搜尋</h3>
                        <p></br>子.母音搜尋｜漢字反查｜AI建議｜雙押.多押</br>
                        </br>*代表任意聲韻｜歌詞、情境、標籤將作為AI參考依據</p>
                    </div>
                `;
                return;
            }

            results.forEach(r => {
                // 搜尋階段已把 tone/tier 帶上來（含同 base 不同 tone 的破音字），這裡只補搜尋未填入的舊路徑
                if (r.tone !== undefined && r.tier !== undefined) return;
                const infos = charInfo[r.char];
                if (infos) {
                    const match = infos.find(i => i.zhuyin === r.zhuyin);
                    if (match) {
                        r.tone = match.tone;
                        r.tier = match.tier;
                    } else {
                        r.tone = 0;
                        r.tier = getCharMark(r.char, r.zhuyin);
                    }
                } else {
                    r.tone = 0;
                    r.tier = 'normal';
                }
            });

            const container = document.getElementById('resultsContainer');
            const showPinyin = document.getElementById('showPinyin').checked;
            const hideRare = document.getElementById('hideRare').checked;
            const filterDup = document.getElementById('filterDuplicate').checked;

            // 過濾冷僻字
            if (hideRare) {
                results = results.filter(r => {
                    const mark = getCharMark(r.char, r.zhuyin);
                    return mark !== 'rare';
                });
            }

            // 過濾破音字（勾選時或關閉讀音時，每字只保留第一個匹配）
            if (filterDup || !showPinyin) {
                const seen = new Set();
                results = results.filter(r => {
                    if (seen.has(r.char)) return false;
                    seen.add(r.char);
                    return true;
                });
            }
            
            if (results.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="8" x2="12" y2="12"></line>
                            <line x1="12" y1="16" x2="12.01" y2="16"></line>
                        </svg>
                        <h3>沒有找到結果</h3>
                        <p>試試其他韻腳，例如：an、ing、ong</p>
                    </div>
                `;
                return;
            }
            
            const header = `
                <div class="results-header">
                    <div class="results-count">找到 ${results.length} 個字</div>
                    <div class="batch-count" id="batchCount"></div>
                </div>
            `;
            
            let content = '';
            
            if (currentMode === 'tone') {
                // ===== 同聲調並列模式 =====
                const toneNames = { 1: '一聲', 2: '二聲', 3: '三聲', 4: '四聲', 5: '輕聲', 0: '未標' };
                const toneOrder = [1, 2, 3, 4, 5, 0];

                const toneGroups = {};
                results.forEach(item => {
                    const t = item.tone || 0;
                    if (!toneGroups[t]) toneGroups[t] = [];
                    toneGroups[t].push(item);
                });

                const tierOrder = { common: 0, normal: 1, rare: 2 };
                for (const t of Object.keys(toneGroups)) {
                    toneGroups[t].sort((a, b) => (tierOrder[a.tier] || 1) - (tierOrder[b.tier] || 1));
                }

                toneOrder.forEach(t => {
                    if (!toneGroups[t] || toneGroups[t].length === 0) return;
                    content += `
                        <div class="group-section">
                            <div class="group-title">${toneNames[t]}（${toneGroups[t].length}）</div>
                            <div class="results-grid">
                                ${toneGroups[t].map(item => createCharCard(item, showPinyin)).join('')}
                            </div>
                        </div>
                    `;
                });
            } else if (currentMode === 'initial') {
                // ===== 同聲韻並列模式 =====
                const showAsZhuyin = lastSearchType === 'bopomofo';
                
                // 判斷是否有韻母搜尋（需按子音分組）
                const hasRhymeSearch = searchedTerms.some(s => s.isRhymeSearch);
                const hasInitialSearch = searchedTerms.some(s => s.isInitial);
                
                // 三級排序函數
                const tierSort = (a, b) => {
                    const markA = getCharMark(a.char, a.zhuyin);
                    const markB = getCharMark(b.char, b.zhuyin);
                    return (markA === 'common' ? 0 : (markA === 'rare' ? 2 : 1))
                         - (markB === 'common' ? 0 : (markB === 'rare' ? 2 : 1));
                };
                
                if (hasRhymeSearch && !hasInitialSearch) {
                    // ===== 韻母搜尋 → 按子音分組，顏色標記子音 =====
                    const consonantGroups = {};
                    results.forEach(item => {
                        const key = item.zhuyinInitial || '/';
                        if (!consonantGroups[key]) consonantGroups[key] = [];
                        consonantGroups[key].push(item);
                    });
                    
                    // 按聲母排序（/ 排最前）
                    const zhuyinOrder = ['/', ...zhuyinInitials];
                    const sortedConsonants = Object.keys(consonantGroups).sort((a, b) => {
                        return zhuyinOrder.indexOf(a) - zhuyinOrder.indexOf(b);
                    });
                    
                    sortedConsonants.forEach((consonant, ci) => {
                        const group = consonantGroups[consonant];
                        group.sort(tierSort);
                        // 設定顯示用的顏色索引
                        group.forEach(item => { item._displayIndex = ci; });
                        
                        const colorClass = `search-highlight-${(ci % 5) + 1}`;
                        let displayTitle = consonant;
                        if (!showAsZhuyin && consonant !== '/') {
                            displayTitle = zhuyinInitialToPinyin[consonant] || consonant;
                        }
                        
                        content += `
                            <div class="group-section">
                                <div class="group-title rhyme-group"><span class="${colorClass}">[${displayTitle}]</span>（${group.length}）</div>
                                <div class="results-grid">
                                    ${group.map(item => createCharCard(item, showPinyin, 'initial')).join('')}
                                </div>
                            </div>
                        `;
                    });
                } else if (hasInitialSearch && !hasRhymeSearch) {
                    // ===== 子音搜尋 → 按韻母家族分組，顏色標記母音 =====
                    const grouped = {};
                    results.forEach(item => {
                        const gKey = item.rhymeIndex !== undefined ? item.rhymeIndex : 0;
                        if (!grouped[gKey]) grouped[gKey] = [];
                        grouped[gKey].push(item);
                    });
                    
                    const sortedKeys = Object.keys(grouped).sort((a, b) => parseInt(a) - parseInt(b));
                    
                    sortedKeys.forEach(gKey => {
                        const group = grouped[gKey];
                        const searchTerm = searchedTerms.find(s => s.index === parseInt(gKey));
                        
                        // 標題：顯示該組實際出現的韻母
                        let displayTitle = '';
                        if (searchTerm) {
                            const members = searchTerm.rhymeMembers || [searchTerm.zhuyin];
                            if (showAsZhuyin) {
                                displayTitle = members.join('.');
                            } else {
                                displayTitle = members.map(m => rhymeToPinyinLabel[m] || fullZhuyinToPinyin[m] || m).join('.');
                            }
                        }
                        
                        group.sort(tierSort);
                        const colorClass = `search-highlight-${(parseInt(gKey) % 5) + 1}`;
                        
                        content += `
                            <div class="group-section">
                                <div class="group-title rhyme-group"><span class="${colorClass}">[${displayTitle}]</span>（${group.length}）</div>
                                <div class="results-grid">
                                    ${group.map(item => createCharCard(item, showPinyin, 'rhyme')).join('')}
                                </div>
                            </div>
                        `;
                    });
                } else {
                    // ===== 混合搜尋 / PINYIN_SPECIAL → 按 rhymeIndex 分組 =====
                    const grouped = {};
                    results.forEach(item => {
                        const gKey = item.rhymeIndex !== undefined ? item.rhymeIndex : 0;
                        if (!grouped[gKey]) grouped[gKey] = [];
                        grouped[gKey].push(item);
                    });
                    
                    const sortedKeys = Object.keys(grouped).sort((a, b) => parseInt(a) - parseInt(b));
                    
                    sortedKeys.forEach(gKey => {
                        const group = grouped[gKey];
                        const searchTerm = searchedTerms.find(s => s.index === parseInt(gKey));
                        let displayTitle = '';
                        if (searchTerm) {
                            if (showAsZhuyin) {
                                displayTitle = searchTerm.zhuyin || searchTerm.original;
                            } else {
                                const zy = searchTerm.zhuyin || '';
                                displayTitle = fullZhuyinToPinyin[zy] || searchTerm.original;
                            }
                        }
                        
                        group.sort(tierSort);
                        const colorClass = `search-highlight-${(parseInt(gKey) % 5) + 1}`;
                        // 混合模式：根據該組的 searchTerm 決定高亮目標
                        const hlTarget = searchTerm && searchTerm.isRhymeSearch ? 'initial' : 'rhyme';
                        
                        content += `
                            <div class="group-section">
                                <div class="group-title rhyme-group"><span class="${colorClass}">[${displayTitle}]</span>（${group.length}）</div>
                                <div class="results-grid">
                                    ${group.map(item => createCharCard(item, showPinyin, hlTarget)).join('')}
                                </div>
                            </div>
                        `;
                    });
                }
            } else {
                // 常用字優先模式：三級排序
                results.sort((a, b) => {
                    const markA = getCharMark(a.char, a.zhuyin);
                    const markB = getCharMark(b.char, b.zhuyin);
                    const orderA = markA === 'common' ? 0 : (markA === 'rare' ? 2 : 1);
                    const orderB = markB === 'common' ? 0 : (markB === 'rare' ? 2 : 1);
                    return orderA - orderB;
                });
                
                content = `<div class="results-grid">
                    ${results.map(item => createCharCard(item, showPinyin)).join('')}
                </div>`;
            }
            
            container.innerHTML = header + content;

            // 點擊事件（使用事件委派）
            const resultsContainer = document.getElementById('resultsContainer');
            resultsContainer.onclick = function(e) {
                if (e.target.classList.contains('mark-badge')) return;
                const card = e.target.closest('.char-card');
                if (card) {
                    const char = card.dataset.char;
                    toggleSelection(char, card);
                } else if (selectedChars.size > 0) {
                    // 點擊空白處：取消所有選擇
                    selectedChars.clear();
                    document.querySelectorAll('.char-card.selected').forEach(c => c.classList.remove('selected'));
                    updateBatchCount();
                }
            };
        }

