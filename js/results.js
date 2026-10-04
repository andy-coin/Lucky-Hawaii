        // ===== 字卡分批出現（PERF-02）=====
        // 一次畫上千張字卡會讓手機凍結，所以第一屏（FIRST_BATCH 張）當場畫完，其餘每個動畫格畫 SLICE 張。
        // 鐵則：最後的 DOM 要和「一次畫完」的舊版一字不差（golden 比對）——
        //   1. 字卡、群組、標題的標記都不能多加屬性或 class；狀態只放在 #resultsContainer 本身與它的最後一個子元素（.render-status，畫完就移除）。
        //   2. createCharCard 會讀寫全域的 colorClass、lastTarget，呼叫順序必須等於文件順序，兩次渲染不可交錯。
        //   3. 群組標題的「（k）」一開始就是最終數字；群組的外殼（標題＋空的 grid）只在它的第一張字卡要畫時才加進去。
        let _renderEpoch = 0;          // 每次 displayResults 加一；舊的分批看到不一致就自己停掉
        const FIRST_BATCH = 48;
        const SLICE = 64;
        const _CARD_SLOT = '\u0001';   // 模板裡「字卡清單」的位置標記，只在 _makeJob 內被拆掉
        let _flushRender = null;       // 目前這一輪「把剩下的一次畫完」的函式（分頁被藏起來時用）
        let _lastRenderKey = '';       // 上一輪畫的是哪個查詢（輸入文字＋模式）；一樣就是「同一查詢重畫」，要保留捲動位置

        // 把原本的模板字串拆成「外殼」與「字卡清單」：
        // 外殼 = 模板去掉字卡清單，且保留 grid 開頭的空白；grid 結尾的空白等這一組字卡畫完再補回去，
        // 這樣最後的 HTML（連空白）跟舊版一次 map().join('') 完全相同。
        function _makeJob(tpl, items, hl) {
            const i = tpl.indexOf(_CARD_SLOT);
            const pre = tpl.slice(0, i);
            const post = tpl.slice(i + _CARD_SLOT.length);
            const wsAfter = post.match(/^\s*/)[0];
            return { shell: pre + post.slice(wsAfter.length), wsAfter, items, hl };
        }

        function _setRenderLive(text) {
            const live = document.getElementById('renderLive');
            if (live) live.textContent = text;
        }

        // 回到「沒有分批在跑」的狀態（空白畫面、無結果）
        function _renderIdle(container) {
            _lastRenderKey = '';   // 空白／無結果：下一次任何查詢都算新查詢
            container.dataset.render = 'idle';
            container.removeAttribute('aria-busy');
            _flushRender = null;
            _setRenderLive('');
        }

        // 依序把 jobs 裡的字卡畫出來：第一批同步，其餘每個動畫格一批
        function _startRender(container, jobs, total, epoch, showPinyin, scroll) {
            const st = { ji: 0, ci: 0, shown: 0, grid: null, status: null };

            function slice(budget) {
                while (budget > 0 && st.ji < jobs.length) {
                    const job = jobs[st.ji];
                    if (st.ci === 0) {
                        // 這一組的第一張字卡要畫了：先開外殼（有狀態列時放在它上面，永遠只往下長）
                        if (st.status) st.status.insertAdjacentHTML('beforebegin', job.shell);
                        else container.insertAdjacentHTML('beforeend', job.shell);
                        const grids = container.querySelectorAll('.results-grid');
                        st.grid = grids[grids.length - 1];
                    }
                    const n = Math.min(budget, job.items.length - st.ci);
                    let html = '';
                    for (let k = 0; k < n; k++) html += createCharCard(job.items[st.ci + k], showPinyin, job.hl);
                    st.grid.insertAdjacentHTML('beforeend', html);
                    st.ci += n;
                    st.shown += n;
                    budget -= n;
                    if (st.ci >= job.items.length) {
                        if (job.wsAfter) st.grid.appendChild(document.createTextNode(job.wsAfter));
                        st.ji++;
                        st.ci = 0;
                    }
                }
            }

            function finish() {
                if (st.status) st.status.remove();
                st.status = null;
                _flushRender = null;
                container.dataset.render = 'done';
                container.removeAttribute('aria-busy');
                _setRenderLive(`已顯示全部 ${total} 字`);
                window.dispatchEvent(new Event('lh:render-done'));
            }

            function updateStatus() {
                if (!st.status) {
                    st.status = document.createElement('div');
                    st.status.className = 'render-status';
                    container.appendChild(st.status);
                }
                st.status.textContent = `載入中… 已顯示 ${st.shown.toLocaleString('zh-TW')} / ${total.toLocaleString('zh-TW')} 字`;
            }

            function flushAll() {
                if (epoch !== _renderEpoch) return;
                slice(Infinity);
                finish();
            }

            function step() {
                if (epoch !== _renderEpoch) return;     // 已被新的搜尋／重畫取代：不再加任何舊卡
                if (document.hidden) { flushAll(); return; }
                slice(SLICE);
                if (st.ji >= jobs.length) { finish(); return; }
                updateStatus();
                requestAnimationFrame(step);
            }

            // 捲動規則（UI-SPEC §12 規則 3）：
            //   新查詢 → 回到最上面；
            //   同一查詢重畫（換主題、勾選項、改字的分級）→ 先同步畫到「蓋住原本捲動位置再多兩個畫面高」（結果 ≤ 300 張就全畫），
            //   把捲動位置放回去，剩下的再分批補。只往下長，所以不會跳。
            function _applyScroll() {
                const section = scroll && scroll.section;
                if (!section) return;
                if (!scroll.same) { if (scroll.top > 0) section.scrollTop = 0; return; }   // 本來就在最上面就不用動（寫入捲動位置會強迫立刻排版）
                if (scroll.top <= 0) return;
                while (st.ji < jobs.length && (total <= 300 || section.scrollHeight < scroll.top + 2 * scroll.height)) slice(SLICE);
                section.scrollTop = scroll.top;
            }

            container.dataset.render = 'first';
            container.setAttribute('aria-busy', 'true');
            _setRenderLive('');
            slice(FIRST_BATCH);
            _applyScroll();
            if (st.ji >= jobs.length) { finish(); return; }
            // 背景分頁的動畫格會被暫停，剩下的一次畫完，絕不少於標題的字數
            if (document.hidden) { flushAll(); return; }
            container.dataset.render = 'more';
            updateStatus();
            _flushRender = flushAll;
            requestAnimationFrame(step);
        }

        // 分頁中途被藏起來：動畫格會停，直接把剩下的畫完
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && _flushRender) _flushRender();
        });

        // 顯示結果
        function displayResults(results) {
            _renderEpoch++;   // 先作廢任何還在跑的分批

            // 搜尋欄為空時恢復初始畫面
            const currentInput = document.getElementById('searchInput').value.trim();

            // 重畫會把內容清掉、捲動位置跟著被夾短，所以要在動手前先記下來
            const section = document.querySelector('.results-section');
            const renderKey = currentInput + '|' + currentMode;
            const scroll = {
                section,
                same: renderKey === _lastRenderKey,
                top: section ? section.scrollTop : 0,
                height: section ? section.clientHeight : 0,
            };
            _lastRenderKey = renderKey;
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
                _renderIdle(container);
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
                _renderIdle(container);
                return;
            }
            
            const header = `
                <div class="results-header">
                    <div class="results-count">找到 ${results.length} 個字</div>
                    <div class="batch-count" id="batchCount"></div>
                </div>
            `;
            
            const jobs = [];   // 依文件順序排好的「群組外殼＋字卡清單」，字卡晚點才一張張產生
            
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
                    jobs.push(_makeJob(`
                        <div class="group-section">
                            <div class="group-title">${toneNames[t]}（${toneGroups[t].length}）</div>
                            <div class="results-grid">
                                ${_CARD_SLOT}
                            </div>
                        </div>
                    `, toneGroups[t], undefined));
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
                        
                        jobs.push(_makeJob(`
                            <div class="group-section">
                                <div class="group-title rhyme-group"><span class="${colorClass}">[${displayTitle}]</span>（${group.length}）</div>
                                <div class="results-grid">
                                    ${_CARD_SLOT}
                                </div>
                            </div>
                        `, group, 'initial'));
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
                        
                        jobs.push(_makeJob(`
                            <div class="group-section">
                                <div class="group-title rhyme-group"><span class="${colorClass}">[${displayTitle}]</span>（${group.length}）</div>
                                <div class="results-grid">
                                    ${_CARD_SLOT}
                                </div>
                            </div>
                        `, group, 'rhyme'));
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
                        
                        jobs.push(_makeJob(`
                            <div class="group-section">
                                <div class="group-title rhyme-group"><span class="${colorClass}">[${displayTitle}]</span>（${group.length}）</div>
                                <div class="results-grid">
                                    ${_CARD_SLOT}
                                </div>
                            </div>
                        `, group, hlTarget));
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
                
                jobs.push(_makeJob(`<div class="results-grid">
                    ${_CARD_SLOT}
                </div>`, results, undefined));
            }
            
            // 標題一定要同步就位（renderPolyphonicChips 會把破音字 chips 放進 .results-header）
            container.innerHTML = header;

            // 點擊事件（使用事件委派）：必須在第一批字卡出現之前就綁好
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

            _startRender(container, jobs, results.length, _renderEpoch, showPinyin, scroll);
        }

