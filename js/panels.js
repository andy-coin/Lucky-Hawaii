        function resetSuggestedPool() {
            suggestedPool.clear();
            sentCandidatesSet.clear();
            cumulativeCandidates = [];
            const c = document.getElementById('aiWordsContainer');
            if (c) c.innerHTML = '';
        }

        function toggleRightPanel() {
            const panel = document.getElementById('rightPanel');
            panel.classList.toggle('collapsed');
            lhSet('rightPanelCollapsed', panel.classList.contains('collapsed'));
            //if (!panel.classList.contains('collapsed')) loadWordlist();
            syncCenterPanel();
        }

        function syncCenterPanel() {
            const lp = document.getElementById('leftPanel');
            const rp = document.getElementById('rightPanel');
            if (!lp || !rp) return;

            if (window.innerWidth <= 900) {
                lp.style.transform = '';
                rp.style.transform = '';
                return;
            }

            const vw = window.innerWidth;
            const containerW = Math.min(900, vw);
            const containerLeft = (vw - containerW) / 2;
            const GAP = 5;
            const MIN_PANEL = 300;
            const PANEL_W = 400;

            // 面板可見寬 = container 左邊界 - 5px，最少 300px（不足時疊進 container）
            const visibleW = Math.min(PANEL_W, Math.max(MIN_PANEL, containerLeft - GAP));
            const shift = visibleW - PANEL_W; // 永遠 ≤ 0

            const lpExp = !lp.classList.contains('collapsed');
            const rpExp = !rp.classList.contains('collapsed');

            lp.style.transform = lpExp && shift < 0 ? `translateX(${shift}px)` : '';
            rp.style.transform = rpExp && shift < 0 ? `translateX(${-shift}px)` : '';
        }

        function mobileTab(tab) {
            const lp = document.getElementById('leftPanel');
            const rp = document.getElementById('rightPanel');
            const bd = document.getElementById('mobileBackdrop');
            // 再按同一個 tab → toggle 關閉
            if (tab === 'lyrics' && !lp.classList.contains('collapsed')) tab = 'none';
            else if (tab === 'ai' && !rp.classList.contains('collapsed')) tab = 'none';
            // 先全部收起
            lp.classList.add('collapsed');
            rp.classList.add('collapsed');
            if (bd) bd.classList.remove('show');
            if (tab === 'lyrics') {
                lp.classList.remove('collapsed');
                if (bd) bd.classList.add('show');
            } else if (tab === 'ai') {
                rp.classList.remove('collapsed');
                if (bd) bd.classList.add('show');
                //loadWordlist();
            }
            ['lyrics','ai'].forEach(t => {
                const btn = document.getElementById(`mtab-${t}`);
                if (btn) btn.classList.toggle('active', t === tab);
            });
        }

        // ===== 右側：保留池 =====
        function saveWord(word) {
            if (!savedWords.includes(word)) {
                savedWords.unshift(word);
                lhSet('haiku_savedwords', JSON.stringify(savedWords));
                renderSavedWords();
            }
            showToast(`「${word}」已保留`);
        }

        function removeSavedWord(word) {
            savedWords = savedWords.filter(w => w !== word);
            lhSet('haiku_savedwords', JSON.stringify(savedWords));
            renderSavedWords();
        }

        function renderSavedWords() {
            const container = document.getElementById('savedWordsContainer');
            const countEl = document.getElementById('savedCount');
            if (!container) return;
            if (countEl) {
                countEl.textContent = savedWords.length;
                countEl.style.display = savedWords.length ? 'inline' : 'none';
            }
            if (savedWords.length === 0) {
                container.innerHTML = '<span style="color:var(--text-secondary);font-size:0.82rem;">點擊上方詞彙保留</span>';
                return;
            }
            container.innerHTML = savedWords.map(w =>
                `<div class="word-chip" onclick="copyWord('${w.replace(/'/g, "\\'")}')">` +
                `${w}<span class="chip-remove" onclick="event.stopPropagation();removeSavedWord('${w.replace(/'/g, "\\'")}')">×</span></div>`
            ).join('');
        }

