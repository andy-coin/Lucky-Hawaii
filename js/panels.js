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


// ==================== 三直排拉交界（平板、窄桌機） ====================
// 左右面板都展開、不是寬螢幕吸附（那邊有自己的分隔線）時，兩條交界線可以拖：改左／右面板的寬度（rem），主畫面吃剩下的。
// 寬度存在 lh:panelW（{ l, r }，單位 rem；壞值回預設）。雙擊或按 Home 回預設；方向鍵每次 1rem（Shift 4rem）。
const LH_PANE_KEY = 'lh:panelW';
const LH_PANE_MIN = 16, LH_PANE_MAIN_MIN = 24;   // rem：面板最窄、主畫面最窄
const _lhPaneW = { l: null, r: null };
{
    const ok = v => typeof v === 'number' && Number.isFinite(v) && v >= LH_PANE_MIN && v <= 80;
    const saved = lhGetJSON(LH_PANE_KEY, null, o => !!o && typeof o === 'object' && (o.l === null || ok(o.l)) && (o.r === null || ok(o.r)));
    if (saved) { _lhPaneW.l = saved.l; _lhPaneW.r = saved.r; }
}
const _lhRem = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
function _lhPaneApply() {
    const root = document.documentElement;
    for (const [k, v] of [['--lp-w', _lhPaneW.l], ['--rp-w', _lhPaneW.r]]) {
        if (v === null) root.style.removeProperty(k); else root.style.setProperty(k, v + 'rem');
    }
}
// 限制在合理範圍：面板 ≥ 16rem，且主畫面（加上左右留白與歌曲清單欄）至少 24rem
function _lhPaneClamp(side, rem) {
    const root = getComputedStyle(document.documentElement), r = _lhRem();
    const other = side === 'l' ? document.getElementById('rightPanel') : document.getElementById('leftPanel');
    const otherW = other.getBoundingClientRect().width / r;
    const songW = side === 'l' ? 0 : (parseFloat(root.getPropertyValue('--song-w')) || 0) / r;
    const gutter = 2 * (parseFloat(root.getPropertyValue('--page-pad')) || 0) / r;
    const max = innerWidth / r - otherW - songW - gutter - LH_PANE_MAIN_MIN;
    return Math.round(Math.max(LH_PANE_MIN, Math.min(max, rem)) * 10) / 10;
}
function _lhPaneSet(side, rem) {
    _lhPaneW[side] = rem === null ? null : _lhPaneClamp(side, rem);
    _lhPaneApply();
}
function _lhPaneSave() { lhSet(LH_PANE_KEY, JSON.stringify(_lhPaneW)); }
function _lhPaneCur(side) {
    const el = document.getElementById(side === 'l' ? 'leftPanel' : 'rightPanel');
    const songW = side === 'l' ? (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--song-w')) || 0) : 0;
    return (el.getBoundingClientRect().width - songW) / _lhRem();
}
for (const side of ['l', 'r']) {
    const d = document.createElement('div');
    d.className = 'pane-divider pane-divider-' + side;
    d.setAttribute('role', 'separator');
    d.setAttribute('aria-orientation', 'vertical');
    d.setAttribute('aria-label', side === 'l' ? '拖曳調整歌詞區寬度（雙擊還原）' : '拖曳調整 AI 建議區寬度（雙擊還原）');
    d.title = side === 'l' ? '拖曳調整歌詞區與查詢區的寬度（雙擊還原）' : '拖曳調整查詢區與 AI 建議區的寬度（雙擊還原）';
    d.tabIndex = 0;
    d.addEventListener('pointerdown', e => {
        if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
        e.preventDefault();
        d.setPointerCapture(e.pointerId);
        d.classList.add('active');
        document.body.classList.add('pane-resizing');
        const songW = side === 'l' ? (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--song-w')) || 0) : 0;
        const move = ev => {
            const px = side === 'l' ? ev.clientX - songW : innerWidth - ev.clientX;
            _lhPaneSet(side, px / _lhRem());
        };
        const end = () => {
            d.removeEventListener('pointermove', move);
            d.removeEventListener('pointerup', end);
            d.removeEventListener('pointercancel', end);
            d.classList.remove('active');
            document.body.classList.remove('pane-resizing');
            _lhPaneSave();
        };
        d.addEventListener('pointermove', move);
        d.addEventListener('pointerup', end);
        d.addEventListener('pointercancel', end);
    });
    d.addEventListener('dblclick', () => { _lhPaneSet(side, null); _lhPaneSave(); });
    d.addEventListener('keydown', e => {
        if (e.key === 'Home') { e.preventDefault(); _lhPaneSet(side, null); _lhPaneSave(); return; }
        const k = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
        if (!k) return;
        e.preventDefault();
        _lhPaneSet(side, _lhPaneCur(side) + (side === 'l' ? k : -k) * (e.shiftKey ? 4 : 1));
        _lhPaneSave();
    });
    document.body.appendChild(d);
}
_lhPaneApply();
// 視窗變窄時，存的寬度可能讓主畫面不夠：重新夾一次（不改存的偏好，只改目前套用的）
window.addEventListener('resize', () => {
    for (const side of ['l', 'r']) if (_lhPaneW[side] !== null) document.documentElement.style.setProperty(side === 'l' ? '--lp-w' : '--rp-w', _lhPaneClamp(side, _lhPaneW[side]) + 'rem');
});
