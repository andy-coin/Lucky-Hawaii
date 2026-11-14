// ==================== 新手導覽（Andy 1-c） ====================
// 一步一步把畫面上的區塊點亮（其餘變暗），旁邊放說明。原生寫，不用套件。
// 第一次來自動跑一次（記在 lh:tourSeen）；之後從標題列的「?」或偏好設定重看。
// 自動測試（navigator.webdriver）不自動出現，免得蓋住既有測試；導覽自己的測試直接呼叫 lhTourStart()。

const LH_TOUR_KEY = 'lh:tourSeen';

// panel：這一步要開哪一邊（'left'／'right'／null＝都不用）；手機版對應底部分頁
// place：'left'＝說明框放在目標左邊、靠上半段（目標是整個高高的面板時，不要壓在右下角）
const LH_TOUR_STEPS = [
    { sel: '.search-box', panel: null, title: '從一個字開始',
      body: '輸入一個字或注音／拼音（例如「安」「ㄢ」「an」），列出所有同韻的字。字中間加空白（「安 打」）就是每個字各查各的。' },
    { sel: '#resultsContainer', panel: null, title: '同韻字卡',
      body: '常用的字排前面。點字卡會選字，AI 建議就只找含這些字的詞；上方三顆按鈕切換排列方式；按住字卡可以直接拖進歌詞。' },
    { sel: '.search-box', panel: null, title: '一次找雙押、多押',
      body: '直接打整個詞（例如「安打」），會列出每個字都押韻的詞，可以只看同聲調、排除借韻。按「顯示全部」，所有押韻詞會攤開在整個畫面上，慢慢瀏覽、挑喜歡的保留。' },
    { sel: '#leftPanel .lyrics-head', panel: 'left', title: '歌曲與匯出',
      body: '這裡切換、新增歌曲，也能匯出。按「展開」打開完整歌詞編輯器，空間更大。' },
    { sel: '#contextSection', panel: 'left', title: '標籤與情境',
      body: '先替這首歌定方向：加幾個標籤、寫一兩句情境。按小燈泡讓 AI 從歌詞整理；這些都會當作 AI 建議的參考。' },
    { sel: '#lyricsSections', panel: 'left', title: '分段寫歌詞',
      body: 'Verse、Chorus 一段一段寫，抓著標題列拖曳換順序、右鍵複製或刪除。反白幾個字會浮出選字列：查韻、問 AI、指定角色都在那裡。' },
    { sel: '#rhymeMenuBtn', panel: 'left', title: '韻腳地圖與角色',
      body: '把押韻的句尾上色，一眼看出哪幾句押在一起；「角色」替對唱、音樂劇的字換上不同顏色。' },
    { sel: '#editorOpenBtn', panel: 'left', title: '完整編輯器與排版',
      body: '展開後有「吸附」與「自由」兩種排版。吸附：拖到另一塊中間是互換、拖到邊緣是並排；自由：想放哪就放哪，還能縮放。' },
    { sel: '#rightPanel .side-panel-body', panel: 'right', place: 'left', title: 'AI 建議詞語',
      body: '查完韻腳按「提供詞語建議」。最上面那列會告訴你 AI 這次參考了哪些標籤、情境與歌詞；點詞就保留到下面的「保留」。' },
    { sel: '#mainContainer > .header', panel: null, title: '自己排版面',
      body: '寬螢幕上抓著三塊的標題列拖曳：放到別塊中間是對調，放到邊緣是分割畫面。三塊並排時，左右兩塊旁邊的小三角形可以收合。' },
    { sel: '#settingsTrigger', panel: null, title: '偏好設定',
      body: '讀音顯示、詞庫、主題顏色、備份都在這裡。按鈕停一下會浮出說明；想再看一次導覽，按標題列的「?」。' },
];

let _lhTour = null;   // 進行中：{ i, root, spot, card, raf, restore, back }

function lhTourStart(at = 0) {
    if (_lhTour) { _lhTourGo(at); return; }
    // 先收掉會蓋在上面的對話框與浮層
    document.getElementById('settingsOverlay')?.classList.remove('show');
    if (typeof lhMapCloseAll === 'function') lhMapCloseAll();
    const lp = document.getElementById('leftPanel'), rp = document.getElementById('rightPanel');
    _lhTour = {
        i: -1,
        back: document.activeElement,
        restore: { left: lp && lp.classList.contains('collapsed'), right: rp && rp.classList.contains('collapsed') },
    };
    const root = document.createElement('div');
    root.className = 'tour';
    root.id = 'lhTour';
    const spot = document.createElement('div');
    spot.className = 'tour-spot';
    const card = document.createElement('div');
    card.className = 'tour-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'lhTourTitle');
    card.setAttribute('aria-describedby', 'lhTourBody');
    card.tabIndex = -1;
    card.innerHTML = '<div class="tour-arrow" aria-hidden="true"></div>'
        + '<p class="tour-count" id="lhTourCount"></p>'
        + '<h3 class="tour-title" id="lhTourTitle"></h3>'
        + '<p class="tour-body" id="lhTourBody"></p>'
        + '<div class="tour-foot"><div class="tour-dots" aria-hidden="true"></div>'
        + '<button type="button" class="tour-btn tour-skip">略過</button>'
        + '<button type="button" class="tour-btn tour-prev">上一步</button>'
        + '<button type="button" class="tour-btn tour-next primary">下一步</button></div>';
    card.querySelector('.tour-dots').append(...LH_TOUR_STEPS.map(() => document.createElement('span')));
    root.append(spot, card);
    document.body.appendChild(root);
    Object.assign(_lhTour, { root, spot, card });
    card.querySelector('.tour-skip').addEventListener('click', () => lhTourEnd());
    card.querySelector('.tour-prev').addEventListener('click', () => _lhTourGo(_lhTour.i - 1));
    card.querySelector('.tour-next').addEventListener('click', () => {
        if (_lhTour.i >= LH_TOUR_STEPS.length - 1) lhTourEnd();
        else _lhTourGo(_lhTour.i + 1);
    });
    // 點暗處不做事（不小心點到不會跳掉）；鍵盤：Esc 關、← → 換步、Tab 留在說明框裡
    root.addEventListener('keydown', _lhTourKey);
    _lhTourGo(at);
    const loop = () => { if (!_lhTour) return; _lhTourPlace(); _lhTour.raf = requestAnimationFrame(loop); };
    _lhTour.raf = requestAnimationFrame(loop);
}

function _lhTourKey(e) {
    if (!_lhTour) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); lhTourEnd(); return; }
    if (e.key === 'ArrowRight' && _lhTour.i < LH_TOUR_STEPS.length - 1) { e.preventDefault(); _lhTourGo(_lhTour.i + 1); return; }
    if (e.key === 'ArrowLeft' && _lhTour.i > 0) { e.preventDefault(); _lhTourGo(_lhTour.i - 1); return; }
    if (e.key === 'Tab') {
        const f = [..._lhTour.card.querySelectorAll('button:not([hidden])')];
        const k = f.indexOf(document.activeElement);
        e.preventDefault();
        f[(k + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
}

// 這一步要的面板打開、另一邊收起（桌機兩邊放不下時 syncCenterPanel 也會收）；手機切到對應的分頁
function _lhTourPanel(want) {
    const lp = document.getElementById('leftPanel'), rp = document.getElementById('rightPanel');
    if (!lp || !rp) return;
    if (lhIsSheetMode()) {
        const tab = want === 'left' ? 'lyrics' : want === 'right' ? 'ai' : 'search';
        const open = !lp.classList.contains('collapsed') ? 'lyrics' : !rp.classList.contains('collapsed') ? 'ai' : 'search';
        if (open !== tab) mobileTab(tab);
        return;
    }
    if (want === 'left' && lp.classList.contains('collapsed')) toggleLeftPanel();
    if (want === 'right' && rp.classList.contains('collapsed')) toggleRightPanel();
}

function _lhTourGo(i) {
    if (!_lhTour) return;
    i = Math.max(0, Math.min(LH_TOUR_STEPS.length - 1, i));
    _lhTour.i = i;
    const step = LH_TOUR_STEPS[i];
    _lhTourPanel(step.panel);
    const { card } = _lhTour;
    card.querySelector('#lhTourCount').textContent = `${i + 1} / ${LH_TOUR_STEPS.length}`;
    card.querySelector('#lhTourTitle').textContent = step.title;
    card.querySelector('#lhTourBody').textContent = step.body;
    card.querySelectorAll('.tour-dots span').forEach((d, k) => d.classList.toggle('on', k === i));
    card.querySelector('.tour-prev').hidden = i === 0;
    card.querySelector('.tour-skip').hidden = i === LH_TOUR_STEPS.length - 1;
    card.querySelector('.tour-next').textContent = i === LH_TOUR_STEPS.length - 1 ? '開始使用' : '下一步';
    // 目標在畫面外（手機、捲動區裡）先捲過去；面板滑進來的動畫期間由 rAF 迴圈一路跟著
    const t = document.querySelector(step.sel);
    if (t) {
        const r = t.getBoundingClientRect();
        if (r.top < 0 || r.bottom > innerHeight) t.scrollIntoView({ block: r.height > innerHeight * 0.6 ? 'start' : 'center' });
    }
    card.querySelector('.tour-next').focus({ preventScroll: true });
    if (typeof lhAnnounce === 'function') lhAnnounce(`導覽第 ${i + 1} 步，共 ${LH_TOUR_STEPS.length} 步：${step.title}`);
}

// 依目標的位置擺亮框與說明框：說明框放在目標下方，放不下就上方，再不行就貼畫面底；一律夾在畫面內
function _lhTourPlace() {
    const { spot, card, i } = _lhTour;
    const t = document.querySelector(LH_TOUR_STEPS[i].sel);
    const vw = document.documentElement.clientWidth, vh = innerHeight, m = 12, pad = 6;
    let r = t ? t.getBoundingClientRect() : null;
    if (!r || (r.width === 0 && r.height === 0)) r = { left: vw / 2, top: vh / 2, right: vw / 2, bottom: vh / 2, width: 0, height: 0 };
    // 亮框只框住畫面內看得到的那一段
    const s = { l: Math.max(r.left - pad, 2), t: Math.max(r.top - pad, 2), r: Math.min(r.right + pad, vw - 2), b: Math.min(r.bottom + pad, vh - 2) };
    spot.style.transform = `translate(${s.l}px, ${s.t}px)`;
    spot.style.width = Math.max(0, s.r - s.l) + 'px';
    spot.style.height = Math.max(0, s.b - s.t) + 'px';

    const cw = card.offsetWidth, ch = card.offsetHeight;
    let top, side;
    if (LH_TOUR_STEPS[i].place === 'left' && s.l - m - cw >= m) {
        // 放在目標左邊、目標上緣往下約 1/4 處（AI 建議面板：不壓在右下角）
        const left = s.l - m - cw, tp = Math.max(m, Math.min(vh - m - ch, s.t + (s.b - s.t) * 0.25));
        card.style.transform = `translate(${Math.round(left)}px, ${Math.round(tp)}px)`;
        card.dataset.side = 'right';
        card.style.setProperty('--arrow-y', '1.5rem');
        return;
    }
    if (s.b + m + ch <= vh - m) { top = s.b + m; side = 'top'; }
    else if (s.t - m - ch >= m) { top = s.t - m - ch; side = 'bottom'; }
    else { top = vh - m - ch; side = 'none'; }   // 目標很高（整個面板）：說明框疊在下緣
    const cx = (s.l + s.r) / 2;
    const left = Math.max(m, Math.min(vw - m - cw, cx - cw / 2));
    card.style.transform = `translate(${Math.round(left)}px, ${Math.round(Math.max(m, top))}px)`;
    card.dataset.side = side;
    // 箭頭對準目標中線，但不跑出說明框的圓角
    card.style.setProperty('--arrow-x', Math.max(16, Math.min(cw - 16, cx - left)) + 'px');
}

function lhTourEnd() {
    if (!_lhTour) return;
    const { root, raf, restore, back } = _lhTour;
    cancelAnimationFrame(raf);
    root.remove();
    _lhTour = null;
    lhSet(LH_TOUR_KEY, '1');
    // 面板回到導覽前的開關狀態
    if (lhIsSheetMode()) mobileTab('search');
    else {
        const lp = document.getElementById('leftPanel'), rp = document.getElementById('rightPanel');
        if (lp && restore.left !== lp.classList.contains('collapsed')) toggleLeftPanel();
        if (rp && restore.right !== rp.classList.contains('collapsed')) toggleRightPanel();
    }
    const b = back && back.isConnected && back !== document.body ? back : document.getElementById('tourBtn');
    if (b) b.focus({ preventScroll: true });
}

// 第一次來：歌曲與字典都好了之後才出現（目標區塊要先畫好）
if (!lhGet(LH_TOUR_KEY) && !navigator.webdriver) {
    Promise.allSettled([window.__hoyunReady, window.__hoyunSongsReady]).then(() => setTimeout(() => {
        if (!_lhTour && !lhGet(LH_TOUR_KEY)) lhTourStart();
    }, 400));
}
