        // ===== 複製 + Toast =====
        function copyWord(word) {
            if (navigator.clipboard) {
                navigator.clipboard.writeText(word).catch(() => fallbackCopy(word));
            } else {
                fallbackCopy(word);
            }
            showToast(`已複製「${word}」`);
        }

        // 舊的複製方法：回傳是否成功。readOnly 讓手機不跳鍵盤；iOS 的 select() 選不到，要再補 setSelectionRange；
        // 暫時的 textarea 不管成敗都要移掉
        function fallbackCopy(text) {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.readOnly = true;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            let ok = false;
            try {
                ta.select();
                ta.setSelectionRange(0, ta.value.length);
                ok = document.execCommand('copy');
            } catch (e) {
                lhWarn('fallbackCopy 失敗', e);
            } finally {
                document.body.removeChild(ta);
            }
            return ok;
        }

        function cycleInputMode() {
            const modes = ['auto', 'zhuyin', 'pinyin'];
            const labels = { auto: '自動', zhuyin: '注音', pinyin: '拼音' };
            inputMode = modes[(modes.indexOf(inputMode) + 1) % 3];
            lhSet('haoYunQi_inputMode', inputMode);
            const btn = document.getElementById('inputModeBtn');
            if (btn) {
                btn.textContent = labels[inputMode];
                btn.className = 'input-mode-btn' + (inputMode !== 'auto' ? ` mode-${inputMode}` : '');
            }
            const val = document.getElementById('searchInput').value.trim();
            if (val) {
                // 走 _handleSearch 才會在 displayResults 後重新 render 破音字 chips，
                // 不然切換注音/拼音時 chip 會被洗掉
                _handleSearch(val);
            }
        }

        function showToast(msg, duration = 1800) {
            let toast = document.getElementById('copyToast');
            if (!toast) {
                toast = document.createElement('div');
                toast.id = 'copyToast';
                toast.className = 'copy-toast';
                document.body.appendChild(toast);
            }
            toast.textContent = msg;   // 一併丟掉上一個提示留下的「復原」按鈕
            toast.classList.remove('has-action');
            toast.classList.add('show');
            clearTimeout(toast._timer);
            toast._timer = setTimeout(() => toast.classList.remove('show'), duration);
        }

        // 帶一個按鈕的提示（刪除段落後的「復原」，UI-SPEC D-09）。訊息是 Text node、按鈕文字走 textContent，不經 HTML 解析（T-09-12）。
        // 按鈕只在提示顯示時收點擊；ms 之後提示和按鈕一起消失
        function showUndoToast(msg, actionLabel, onAction, ms = 5000, actionAria) {
            let toast = document.getElementById('copyToast');
            if (!toast) {
                toast = document.createElement('div');
                toast.id = 'copyToast';
                toast.className = 'copy-toast';
                document.body.appendChild(toast);
            }
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'toast-action';
            btn.textContent = actionLabel;
            if (actionAria) btn.setAttribute('aria-label', actionAria);
            btn.addEventListener('click', () => {
                hideUndoToastAction();
                toast.classList.remove('show');
                clearTimeout(toast._timer);
                onAction();
            });
            toast.replaceChildren(document.createTextNode(msg), btn);
            toast.setAttribute('role', 'status');
            toast.classList.add('show', 'has-action');
            clearTimeout(toast._timer);
            toast._timer = setTimeout(() => { toast.classList.remove('show'); hideUndoToastAction(); }, ms);
        }

        // 拿掉提示上的按鈕（有更新的歷史步驟、復原／重做之後，那個按鈕就不能再按了）
        function hideUndoToastAction() {
            const toast = document.getElementById('copyToast');
            if (!toast || !toast.classList.contains('has-action')) return;
            toast.querySelector('.toast-action')?.remove();
            toast.classList.remove('has-action');
        }

        // ===== 面板跟著目前版型走 =====
        // 底部 sheet 模式（≤ 900）：兩個面板固定收起，由底部分頁列控制；其餘版型：依使用者存的偏好還原。
        // 只讀 leftPanelCollapsed／rightPanelCollapsed，絕不改寫，所以轉向、縮放視窗不會弄丟偏好。
        // 開頁跑一次，之後每次跨過斷點（轉向、拖視窗）再跑一次，不必重新整理
        function _lhApplyPanelTier() {
            const lp = document.getElementById('leftPanel');
            const rp = document.getElementById('rightPanel');
            if (!lp || !rp) return;
            if (lhIsSheetMode()) {
                lp.classList.add('collapsed');
                rp.classList.add('collapsed');
            } else {
                lp.classList.toggle('collapsed', lhGet('leftPanelCollapsed') !== 'false');
                rp.classList.toggle('collapsed', lhGet('rightPanelCollapsed') !== 'false');
            }
            // 底部 sheet 專用的遮罩與分頁高亮：跨過斷點後不能殘留（否則桌機上會有一層看不見的遮罩擋住點擊）
            const bd = document.getElementById('mobileBackdrop');
            if (bd) bd.classList.remove('show');
            _lhSyncMobileTabs('search');
            syncCenterPanel();
        }
        LH_MQ_SHEET.addEventListener('change', _lhApplyPanelTier);

        // ===== 初始化三個面板狀態 =====
        (function() {
            const rCollapsed = lhGet('recentPanelCollapsed');
            if (rCollapsed !== 'false') document.getElementById('recentPanel').classList.add('collapsed');

            _lhApplyPanelTier();

            // 恢復輸入模式按鈕狀態
            const modeBtn = document.getElementById('inputModeBtn');
            if (modeBtn && inputMode !== 'auto') {
                const modeLabels = { zhuyin: '注音', pinyin: '拼音' };
                modeBtn.textContent = modeLabels[inputMode] || '自動';
                modeBtn.classList.add(`mode-${inputMode}`);
            }

            // 歌詞區等安全層開機（備份＋遷移）完成才畫（A3）；搜尋與結果不用等。
            // 在這裡指定是因為 initSongs 需要的函式（lyrics.js 等）此時都已載入；若在更早的 script 就指定，
            // 備份很快完成時 then 會在 songs.js 之前呼叫到還沒定義的函式
            window.__hoyunSongsReady = window.__hoyunSafetyReady.then(initSongs).catch(songsLoadFailed);
            renderSavedWords();
            renderModelSelect();
            // 模型清單非同步載入；測試用這個訊號等待，程式邏輯不可依賴它；載入完只重畫選單、不寫入使用者設定
            window.__hoyunModelsReady = loadModels();

            // 恢復情境＆標籤收納狀態
            if (lhGet('contextSectionCollapsed') === 'true') {
                const s = document.getElementById('contextSection');
                const ch = document.getElementById('contextChevron');
                if (s) { s.classList.add('collapsed'); if (ch) ch.style.transform = 'rotate(-90deg)'; }
            }
            // 恢復保留池收納狀態
            if (lhGet('savedPoolCollapsed') === 'true') {
                const s = document.getElementById('savedPoolSection');
                const ch = document.getElementById('savedPoolChevron');
                if (s) { s.classList.add('collapsed'); if (ch) ch.style.transform = 'rotate(-90deg)'; }
            }
        })();


// ===== 低調提示（Andy R2 小修）：滑鼠停 250ms 淡入、離開淡出，取代瀏覽器原生 title 的慢速突然跳出 =====
// 對象：有 data-tip 的元素，加上會被程式改 title 的鑰匙與主題鈕。文字每次現讀（title 優先），顯示期間暫時拿掉 title 避免原生提示重疊
{
    const SEL = '[data-tip], #aiKeyBtn, #themeToggle';
    let tip = null, timer = 0, cur = null;
    const hide = () => {
        clearTimeout(timer);
        if (cur && cur.dataset.tipHold !== undefined) { cur.setAttribute('title', cur.dataset.tipHold); delete cur.dataset.tipHold; }
        cur = null;
        if (tip) tip.classList.remove('show');
    };
    document.addEventListener('pointerover', e => {
        if (e.pointerType !== 'mouse') return;
        const el = e.target.closest && e.target.closest(SEL);
        if (el === cur) return;
        hide();
        if (!el) return;
        cur = el;
        if (el.hasAttribute('title')) { el.dataset.tipHold = el.getAttribute('title'); el.removeAttribute('title'); }
        timer = setTimeout(() => {
            const text = el.dataset.tipHold || el.dataset.tip;
            if (!text || cur !== el) return;
            if (!tip) { tip = document.createElement('div'); tip.className = 'lh-tip'; tip.setAttribute('role', 'presentation'); document.body.appendChild(tip); }
            tip.textContent = text;
            const r = el.getBoundingClientRect(), w = tip.offsetWidth, vw = document.documentElement.clientWidth;
            const below = r.bottom + 8 + tip.offsetHeight < innerHeight;
            tip.style.left = Math.max(8, Math.min(vw - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
            tip.style.top = (below ? r.bottom + 8 : r.top - 8 - tip.offsetHeight) + 'px';
            tip.classList.add('show');
        }, 250);
    });
    document.addEventListener('pointerout', e => { if (cur && !cur.contains(e.relatedTarget)) hide(); });
    document.addEventListener('pointerdown', hide, true);
    document.addEventListener('scroll', hide, true);
}
