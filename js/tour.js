// ==================== 新手導覽（Andy 1-c） ====================
// 一步一步把畫面上的區塊點亮（其餘變暗），旁邊放說明。原生寫，不用套件。
// 第一次來自動跑一次（記在 lh:tourSeen）；之後從標題列的「?」或偏好設定重看。
// 自動測試（navigator.webdriver）不自動出現，免得蓋住既有測試；導覽自己的測試直接呼叫 lhTourStart()。

const LH_TOUR_KEY = 'lh:tourSeen';   // 看過哪些面板的導覽：空白分開的組名（"search lyrics"）；舊版的 '1'＝所有面板都看過

// 0.98.41 Andy：每個面板各自一組導覽，右上角的「?」只講自己那塊；第一次進到那塊自動跑一次。
// 用詞原則：講功能、用常用詞，不用內部設計稱呼；不重複講同一件事；隱藏彩蛋不提。
// panel：這一步要開哪一邊（'left'／'right'／null）；手機版對應底部分頁。place：'left'＝說明框放目標左邊。
// mouse：只有電腦（滑鼠、寬螢幕）才有的步驟；bodyTouch：手機、平板的說法
const LH_TOURS = {
    search: [
        { sel: '.search-box', title: '從一個字開始',
          body: '輸入一個字、注音或拼音（例如「唉」「ㄞ」「ai」），列出所有同韻的字。' },
        { sel: '#resultsContainer', title: '同韻字卡',
          body: '照常用程度排序。點字卡可以選字，AI 建議就只找含這些字的詞；按住字卡能直接拖進歌詞。' },
        { sel: '.search-box', title: '雙押、多押',
          body: '輸入連續的詞（例如「洋流」），列出每個字都押韻的詞。用 * 代替不必押的字（例如「*莉蓮」）；空白分開多個詞（例如「蒸籠 發粿」）會一起列出來。按「顯示全部」把所有押韻詞攤開來挑。' },
        { sel: '#mainContainer > .header', title: '自己排版面', mouse: true,
          body: '抓著三塊面板的標題列拖曳：放到別塊中間是對調，放到邊緣是分割畫面。拖面板之間的分隔線可以調寬度。' },
        { sel: '#mainContainer > .header', title: '加到主畫面', ios: true,
          body: '在 Safari 按分享鈕（方框加向上箭頭），選「加入主畫面」。之後從主畫面打開就像 App 一樣全螢幕，沒有網址列擋畫面。' },
        { sel: '#settingsTrigger', title: '偏好設定',
          body: '讀音顯示、自訂詞彙、主題顏色、特效、AI 金鑰、備份都在這裡。每塊面板右上角的「?」可以再看一次說明。' },
    ],
    lyrics: [
        { sel: '#leftPanel .lyrics-head', panel: 'left', title: '歌曲',
          body: '在這裡切換、新增歌曲，也能匯出。' },
        { sel: '#contextSection', panel: 'left', title: '標籤與情境',
          body: '加幾個標籤、寫一兩句情境，AI 建議會照這個方向挑詞。小燈泡可以讓 AI 從歌詞幫你整理。' },
        { sel: '#lyricsSections', panel: 'left', title: '分段寫歌詞',
          body: '一段一段寫，拖標題列換順序，按右鍵複製或刪除。反白文字會浮出選字列：查韻、問 AI、指定角色。',
          bodyTouch: '一段一段寫，拖標題列換順序，長按段落名稱複製或刪除。反白文字會浮出選字列：查韻、問 AI、指定角色。' },
        { sel: '#rhymeMenuBtn', panel: 'left', title: '韻腳上色與角色',
          body: '把押韻的句尾上色，一眼看出哪幾句押在一起；「角色」替對唱的不同人標上顏色。' },
        { sel: '#editorOpenBtn', panel: 'left', title: '展開編輯器',
          body: '展開後有三種排版——吸附：整齊排好，拖到另一段中間是互換、拖到邊緣是並排；自由：想放哪就放哪，還能拉大小；合併：所有段落接成一整份，像寫文件一樣。' },
    ],
    ai: [
        { sel: '#rightPanel .side-panel-body', panel: 'right', place: 'left', title: 'AI 建議',
          body: '先查好韻腳，再按「提供詞語建議」。AI 會參考標籤、情境和已經寫好的歌詞。' },
        { sel: '#savedPoolSection', panel: 'right', place: 'left', title: '保留',
          body: '像便利貼：覺得有感覺的詞先貼在這裡，邊寫邊看、幫你發想，沒有其他作用。點建議的詞就收進來，按住可以直接拖進歌詞。' },
        { sel: '#modelPickerWrap', panel: 'right', title: '模型與金鑰',
          body: '「自動」會幫你挑模型；有自己的 AI 金鑰，按旁邊的鑰匙設定。' },
    ],
    space: [
        // 2026-11-25 Andy：第一步先講「字越大越常用」；拿掉「拖詞搬位置」（沒什麼用）和特效說明
        { sel: '.ws-canvas', title: '字越大越常用',
          body: '每個詞照常用程度畫大小：越大的詞越常見。拖曳空白處移動畫面，滾輪或右上角縮放；點詞就收進保留。',
          bodyTouch: '每個詞照常用程度畫大小：越大的詞越常見。拖曳空白處移動畫面，兩指縮放；點詞就收進保留。' },
        { sel: '.ws-panel', title: '篩選',
          body: '照字在詞首或詞尾、字數、常用程度篩選，只留下想看的詞。' },
        { sel: '.ws-ptop', title: '換一批、找靈感',
          body: '詞很多時會分成好幾批，用滑桿切換。骰子隨機挑一組詞、AI 照你的歌詞挑一組；出現後用左右箭頭一個一個看，旗子全部保留、循環箭頭重抽、垃圾桶放棄這組。' },
    ],
};

// ios：只給 iPhone／iPad 用 Safari 開、還沒加到主畫面的人（iPadOS 會假裝是 Mac：用觸控點數認）
const _lhTourIosWeb = () => (/iP(hone|ad|od)/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1))
    && !(navigator.standalone === true || matchMedia('(display-mode: standalone)').matches);
// 電腦（滑鼠、不是底部 sheet 版面）走完整的步驟；平板、手機跳過 mouse: true 的步驟，說明有 bodyTouch 就用觸控版
function lhTourSteps(group = 'search') {
    const desk = matchMedia('(hover: hover) and (pointer: fine)').matches && !lhIsSheetMode();
    return (LH_TOURS[group] || LH_TOURS.search).filter(s => (desk || !s.mouse) && (!s.ios || _lhTourIosWeb())).map(s => desk || !s.bodyTouch ? s : { ...s, body: s.bodyTouch });
}
const _lhTourSeen = () => { const v = lhGet(LH_TOUR_KEY) || ''; return v === '1' ? [] : v.split(' ').filter(Boolean); };   // 舊版 '1'：新的分面板導覽當作都沒看過
function _lhTourMark(group) { const s = _lhTourSeen(); if (!s.includes(group)) lhSet(LH_TOUR_KEY, [...s, group].join(' ')); }
// 第一次進到某個面板：自動跑那個面板的導覽（自動測試不跑；已經有導覽在跑就不疊）
function lhTourAuto(group, delay = 400) {
    if (navigator.webdriver || _lhTour || _lhTourSeen().includes(group)) return;
    setTimeout(() => { if (!_lhTour && !_lhTourSeen().includes(group)) lhTourStart(group); }, delay);
}

let _lhTour = null;   // 進行中：{ i, root, spot, card, raf, restore, back }

function lhTourStart(group = 'search', at = 0) {
    if (typeof group === 'number') { at = group; group = 'search'; }
    if (_lhTour) lhTourEnd();
    // 先收掉會蓋在上面的對話框與浮層
    document.getElementById('settingsOverlay')?.classList.remove('show');
    if (typeof lhMapCloseAll === 'function') lhMapCloseAll();
    const lp = document.getElementById('leftPanel'), rp = document.getElementById('rightPanel');
    _lhTour = {
        i: -1,
        group,
        steps: lhTourSteps(group),
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
    card.querySelector('.tour-dots').append(..._lhTour.steps.map(() => document.createElement('span')));
    root.append(spot, card);
    document.body.appendChild(root);
    Object.assign(_lhTour, { root, spot, card });
    card.querySelector('.tour-skip').addEventListener('click', () => lhTourEnd());
    card.querySelector('.tour-prev').addEventListener('click', () => _lhTourGo(_lhTour.i - 1));
    card.querySelector('.tour-next').addEventListener('click', () => {
        if (_lhTour.i >= _lhTour.steps.length - 1) lhTourEnd();
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
    if (e.key === 'ArrowRight' && _lhTour.i < _lhTour.steps.length - 1) { e.preventDefault(); _lhTourGo(_lhTour.i + 1); return; }
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
    if (!lp || !rp || _lhTour.group === 'space') return;   // 詞彙畫面蓋在最上面，不動底下的面板
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
    i = Math.max(0, Math.min(_lhTour.steps.length - 1, i));
    _lhTour.i = i;
    const step = _lhTour.steps[i];
    _lhTourPanel(step.panel);
    const { card } = _lhTour;
    card.querySelector('#lhTourCount').textContent = `${i + 1} / ${_lhTour.steps.length}`;
    card.querySelector('#lhTourTitle').textContent = step.title;
    card.querySelector('#lhTourBody').textContent = step.body;
    card.querySelectorAll('.tour-dots span').forEach((d, k) => d.classList.toggle('on', k === i));
    card.querySelector('.tour-prev').hidden = i === 0;
    card.querySelector('.tour-skip').hidden = i === _lhTour.steps.length - 1;
    card.querySelector('.tour-next').textContent = i === _lhTour.steps.length - 1 ? '開始使用' : '下一步';
    // 目標在畫面外（手機、捲動區裡）先捲過去；面板滑進來的動畫期間由 rAF 迴圈一路跟著
    const t = document.querySelector(step.sel);
    if (t) {
        const r = t.getBoundingClientRect();
        if (r.top < 0 || r.bottom > innerHeight) t.scrollIntoView({ block: r.height > innerHeight * 0.6 ? 'start' : 'center' });
    }
    card.querySelector('.tour-next').focus({ preventScroll: true });
    if (typeof lhAnnounce === 'function') lhAnnounce(`導覽第 ${i + 1} 步，共 ${_lhTour.steps.length} 步：${step.title}`);
}

// 依目標的位置擺亮框與說明框：說明框放在目標下方，放不下就上方，再不行就貼畫面底；一律夾在畫面內
function _lhTourPlace() {
    const { spot, card, i } = _lhTour;
    const t = document.querySelector(_lhTour.steps[i].sel);
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
    if (_lhTour.steps[i].place === 'left' && s.l - m - cw >= m) {
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
    const { root, raf, restore, back, group: _lhTourDone } = _lhTour;
    cancelAnimationFrame(raf);
    root.remove();
    _lhTour = null;
    _lhTourMark(_lhTourDone);
    // 面板回到導覽前的開關狀態（手機：留在這個面板的分頁）
    if (!lhIsSheetMode()) {
        const lp = document.getElementById('leftPanel'), rp = document.getElementById('rightPanel');
        if (lp && restore.left !== lp.classList.contains('collapsed')) toggleLeftPanel();
        if (rp && restore.right !== rp.classList.contains('collapsed')) toggleRightPanel();
    }
    const b = back && back.isConnected && back !== document.body ? back : document.getElementById('tourBtn');
    if (b) b.focus({ preventScroll: true });
}

// 第一次來：歌曲與字典都好了之後，先跑查詢器的導覽（手機一打開就是查韻分頁）；
// 歌詞、AI 建議：手機切到那個分頁、電腦第一次點進那塊面板時才跑；詞彙畫面在 js/word-space.js 打開時呼叫
Promise.allSettled([window.__hoyunReady, window.__hoyunSongsReady]).then(() => {
    lhTourAuto('search');
    for (const [id, g] of [['leftPanel', 'lyrics'], ['rightPanel', 'ai']]) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('pointerdown', () => { if (!lhIsSheetMode() && !el.classList.contains('collapsed')) lhTourAuto(g, 250); }, true);
    }
});
