        function resetSuggestedPool() {
            suggestedPool.clear();
            sentCandidatesSet.clear();
            cumulativeCandidates = [];
            _aiEpoch++;
            const c = document.getElementById('aiWordsContainer');
            if (c) c.innerHTML = '';
        }

        function toggleRightPanel() {
            const panel = document.getElementById('rightPanel');
            panel.classList.toggle('collapsed');
            lhSet('rightPanelCollapsed', panel.classList.contains('collapsed'));
            //if (!panel.classList.contains('collapsed')) loadWordlist();
            // 剛打開的是右邊：放不下兩個面板時，收起的是左邊
            syncCenterPanel(panel.classList.contains('collapsed') ? undefined : 'right');
        }

        // 面板狀態的唯一同步入口（呼叫端不變）。只做三件事，不再算任何像素位移：
        // 1. 桌機／平板橫放：依展開狀態切 body.lp-open / body.rp-open，由 CSS 把主畫面推開
        //    （以前用 translateX 往外推，面板內容被切掉 86–100px、縮放按鈕被蓋住）
        // 2. 兩個面板都展開、主畫面會不到 24rem 時，收起「不是剛打開」的那一個
        // 3. 收起的面板鍵盤選不到（inert）；展開的面板絕不 inert，否則寫詞／AI 建議就用不了
        // 4. 寬螢幕（lhIsDockMode）：三塊分割畫面、不必收一邊，略過第 2 點；最後交給 lhDockRender 重算版面（js/dock.js）
        // opener：'left'／'right' 代表使用者剛打開那邊；沒給（開頁、改視窗大小）就保留左邊、收右邊
        function syncCenterPanel(opener) {
            const lp = document.getElementById('leftPanel');
            const rp = document.getElementById('rightPanel');
            if (!lp || !rp) return;
            const sheet = lhIsSheetMode();

            if (sheet) {
                document.body.classList.remove('lp-open', 'rp-open');
            } else {
                if (!lhIsDockMode() && !lp.classList.contains('collapsed') && !rp.classList.contains('collapsed')) {
                    const rootStyle = getComputedStyle(document.documentElement);
                    const rem = parseFloat(rootStyle.fontSize) || 16;
                    const gutter = parseFloat(rootStyle.getPropertyValue('--page-pad')) || 0;
                    // 左右各自量真實寬度：歌曲清單推開時左面板比右面板寬 --song-w，不能把左邊的寬度算兩次（Phase 8 D-02）
                    const lpW = lp.getBoundingClientRect().width;
                    const rpW = rp.getBoundingClientRect().width;
                    if (window.innerWidth - lpW - rpW - 2 * gutter < 24 * rem) {
                        const victim = opener === 'right' ? lp : rp;
                        victim.classList.add('collapsed');
                        // 只有使用者親手打開造成的收起才記起來；單純視窗變窄不改他存的偏好
                        if (opener === 'right') lhSet('leftPanelCollapsed', true);
                        else if (opener === 'left') lhSet('rightPanelCollapsed', true);
                    }
                }
                document.body.classList.toggle('lp-open', !lp.classList.contains('collapsed'));
                document.body.classList.toggle('rp-open', !rp.classList.contains('collapsed'));
            }

            if (typeof lhDockRender === 'function') lhDockRender();

            // 左面板收起（任何版型）時，蓋在歌詞上的清單跟著關；推開欄的偏好不動（Phase 8 §9）
            if (lp.classList.contains('collapsed') && typeof closeSongListOverlay === 'function') closeSongListOverlay();

            for (const panel of [lp, rp]) {
                const collapsed = panel.classList.contains('collapsed');
                const content = panel.querySelector('.side-panel-body');
                if (sheet) {
                    // 底部 sheet：收起的整個面板藏起來（含鍵盤與讀屏）
                    panel.toggleAttribute('inert', collapsed);
                    if (collapsed) panel.setAttribute('aria-hidden', 'true');
                    else panel.removeAttribute('aria-hidden');
                    if (content) content.removeAttribute('inert');
                } else {
                    // 桌機：面板本身不能 inert（邊上的分頁要點得到），只鎖收起面板的內容
                    panel.removeAttribute('inert');
                    panel.removeAttribute('aria-hidden');
                    if (content) content.toggleAttribute('inert', collapsed);
                }
            }
        }

        // 底部三個分頁的亮起與 aria-pressed：開著哪個 sheet 就亮哪個；都沒開就亮「查韻」
        function _lhSyncMobileTabs(open) {
            const current = open === 'lyrics' || open === 'ai' ? open : 'search';
            for (const t of ['search', 'lyrics', 'ai']) {
                const btn = document.getElementById(`mtab-${t}`);
                if (!btn) continue;
                btn.classList.toggle('active', t === current);
                btn.setAttribute('aria-pressed', t === current ? 'true' : 'false');
            }
        }

        // 三個分頁：'search'（或任何別的值）= 收起所有 sheet 回到查韻；'lyrics'／'ai' = 開那一個、關另一個，再按一次同一個 = 收起
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
            _lhSyncMobileTabs(tab);
            // 開關狀態變了：一併更新 inert 與 body 類別
            syncCenterPanel();
        }

        // Esc 收起底部 sheet（只在 ≤ 900；桌機的側邊面板不吃 Esc，免得打字時誤收）
        document.addEventListener('keydown', e => {
            if (e.key !== 'Escape' || !lhIsSheetMode()) return;
            // 注音／拼音輸入法組字中按 Esc 是「取消組字」，不是收起面板（WR-03）；keyCode 229 是部分瀏覽器的組字訊號
            if (e.isComposing || e.keyCode === 229) return;
            // 有對話框蓋在面板上時，Esc 屬於最上面的對話框，不要把底下的 sheet 收掉
            if (e.defaultPrevented || document.querySelector('.settings-overlay.show, .about-overlay.show, .feedback-modal-overlay.show')) return;
            const lp = document.getElementById('leftPanel');
            const rp = document.getElementById('rightPanel');
            if (!lp || !rp || (lp.classList.contains('collapsed') && rp.classList.contains('collapsed'))) return;
            mobileTab('search');
        });

        // ==================== 底部 sheet：把手拖曳調整高度 ====================
        // 高度存成「可見高度的比例」（lh:sheetH），旋轉螢幕也成立；歌詞 sheet 與 AI sheet 共用
        const LH_SHEET_KEY = 'lh:sheetH';
        const LH_SHEET_MIN = 0.3;    // 放開時低於這個比例就收起（不存）
        const LH_SHEET_MAX = 0.95;   // 最高 95%，上方留一條背景
        let _lhSheetDragged = false;   // 剛拖過：吃掉放開後那一下 click，免得調高度同時把 sheet 關掉

        // r 是數字就套用（CSS 看 html[data-sheet-h]），null 就回預設 78%
        function _lhSheetApply(r) {
            const root = document.documentElement;
            if (typeof r === 'number') {
                root.style.setProperty('--sheet-r', String(r));
                root.setAttribute('data-sheet-h', '');
            } else {
                root.style.removeProperty('--sheet-r');
                root.removeAttribute('data-sheet-h');
            }
        }
        // 壞值（不是數字、超出 0.3–0.95）→ 回預設
        _lhSheetApply(lhGetJSON(LH_SHEET_KEY, null, v => typeof v === 'number' && v >= LH_SHEET_MIN && v <= LH_SHEET_MAX));

        document.querySelectorAll('.sheet-handle').forEach(handle => {
            // 鍵盤 Enter／空白（detail 0）永遠是關閉；滑鼠／觸控剛拖完的那一下 click 不算
            handle.addEventListener('click', e => {
                if (_lhSheetDragged && e.detail !== 0) { _lhSheetDragged = false; return; }
                mobileTab('search');
            });
            handle.addEventListener('pointerdown', e => {
                if (!lhIsSheetMode() || !e.isPrimary || e.button !== 0) return;
                _lhSheetDragged = false;
                const startY = e.clientY, id = e.pointerId;
                const startH = handle.closest('.side-panel').getBoundingClientRect().height;
                const vh = window.innerHeight;
                const root = document.documentElement;
                const prev = root.hasAttribute('data-sheet-h') ? parseFloat(root.style.getPropertyValue('--sheet-r')) : null;
                let dragging = false, r = null;
                handle.setPointerCapture(id);
                const move = ev => {
                    const dy = ev.clientY - startY;
                    if (!dragging && Math.abs(dy) < 6) return;   // 小於 6px 還算點擊
                    dragging = true;
                    r = Math.min(LH_SHEET_MAX, Math.max(0.05, (startH - dy) / vh));
                    _lhSheetApply(r);
                };
                const end = () => {
                    handle.removeEventListener('pointermove', move);
                    handle.removeEventListener('pointerup', up);
                    handle.removeEventListener('pointercancel', cancel);
                };
                const up = () => {
                    end();
                    if (!dragging) return;   // 沒拖：交給 click 收起
                    _lhSheetDragged = true;
                    if (r < LH_SHEET_MIN) { _lhSheetApply(prev); mobileTab('search'); return; }   // 拉很低 = 收起，高度維持上次
                    lhSet(LH_SHEET_KEY, JSON.stringify(Math.round(r * 1000) / 1000));
                };
                const cancel = () => { end(); _lhSheetApply(prev); };
                handle.addEventListener('pointermove', move);
                handle.addEventListener('pointerup', up);
                handle.addEventListener('pointercancel', cancel);
            });
        });

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
            // 保留池的字可能來自詞庫、AI 或匯入檔：只用 textContent 與事件監聽，不拼 HTML、不拼 onclick 字串（T-08-06）
            if (savedWords.length === 0) {
                const empty = document.createElement('span');
                empty.textContent = '點擊上方詞彙保留';
                empty.style.color = 'var(--text-secondary)';
                empty.style.fontSize = '0.82rem';
                container.replaceChildren(empty);
                return;
            }
            container.replaceChildren(...savedWords.map(w => {
                const chip = document.createElement('div');
                chip.className = 'word-chip';
                chip.append(w);
                chip.addEventListener('click', () => copyWord(w));
                const x = document.createElement('span');
                x.className = 'chip-remove';
                x.textContent = '×';
                x.addEventListener('click', e => { e.stopPropagation(); removeSavedWord(w); });
                chip.appendChild(x);
                return chip;
            }));
        }
