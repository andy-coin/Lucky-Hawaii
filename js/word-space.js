// ==================== 詞卡（多字直接查雙押）與詞宇宙 ====================
// 搜尋欄打「安打」（2–6 個字、中間沒有空白）＝查整個詞的韻：列出詞庫裡符合的詞（詞卡）。選項列換成同母音／同子音／同讀音＋同聲調、排除借韻。
// 打「安 打」（有空白）照舊是兩個字各自的單字韻（js/search.js）。displayResults（js/results.js）一開始就問 lhWsRender，
// 所以換主題、勾選項等所有重畫的路徑都會走到這裡。
// 「顯示全部」：三塊面板往左、上、右收走，所有詞攤在整個畫面上（介面上不說「宇宙」，視覺上是星雲）：
// 同一種聲調組合聚成一團，最常用的詞在中心（恆星），其他詞依常用度一圈圈繞著它轉（行星）；很孤立的詞像流星一樣長距離穿過。
// 停在詞上＝定格＋光暈＋右上角淡淡的隱藏鈕；單擊＝釘住＋保留（連成星座），再點＝取消；面板「取消選取」全部取消；
// 拖曳照等級（LH_SP_LV）：第 1、2 級拖到哪停在哪、拖恆星整團一起走；第 3 級起甩出去再被拉回、拖恆星沖散整團；空白處拖＝平移；滾輪／雙指＝縮放。
// 詞都是使用者詞庫或覆寫來的字串：一律 textContent，不拼 HTML。

const LH_WS_MIN = 2, LH_WS_MAX = 6;
const LH_WS_PAGE = 240;            // 詞卡一次多畫幾張（捲到底再補）
const LH_WS_SPACE_MAX = 550;       // 單一星系超過這個數才切開（分批見 _lhSpPages：一批約 500±50，星系不拆）
// 顏色跟著第一個字的聲調走（一～四聲＋輕聲五個色系，跟著主題、不寫死色碼）；同一團裡每個詞再依常用度＋一點隨機混出深淺
const _lhMix = (a, b, k = 50) => 'color-mix(in oklab, var(' + a + ') ' + k + '%, var(' + b + '))';
// 支援相對色（oklch from）就從主題強調色出發、色相每個聲調轉 72°，五色差最大；不支援就用主題的四個強調色＋一個混色
const LH_WS_TONE_C = CSS.supports('color', 'oklch(from red l c calc(h + 72))')
    ? [0, 1, 2, 3, 4].map(k => 'oklch(from var(--highlight-border) l max(c, 0.12) calc(h + ' + k * 72 + '))')
    : ['var(--highlight-border)', 'var(--accent-2)', 'var(--accent-3)', 'var(--accent-4)', _lhMix('--danger-line', '--accent-4', 60)];
// 一團的顏色：第一個字聲調的顏色和第二個字聲調的顏色互相混（一·一＝純色，一·三＝一聲色混三聲色）
const _lhWsToneMix = key => {
    const [a, b] = key.split('·').map(n => Math.min(5, Math.max(1, +n || 1)));
    return !b || a === b ? LH_WS_TONE_C[a - 1] : 'color-mix(in oklch, ' + LH_WS_TONE_C[a - 1] + ' 62%, ' + LH_WS_TONE_C[b - 1] + ')';
};
const LH_WS_TONE_N = ['一聲', '二聲', '三聲', '四聲', '輕聲'];
const _lhWs = { key: '', input: '', target: null, list: [], shown: 0, mode: 'rhyme', tone: false, strict: false, hidden: new Set(), io: null };

// 輸入是不是「查整個詞」：去頭尾空白後沒有空白、2–6 個字、全是漢字或 *（* 是萬用字）、至少一個漢字。是就回傳字的陣列
function lhWsQuery(input) {
    const t = String(input || '').trim();
    if (!t || /\s/.test(t)) return null;
    const cs = [...t];
    if (cs.length < LH_WS_MIN || cs.length > LH_WS_MAX) return null;
    if (!cs.every(c => /[一-鿿]/.test(c) || c === '*') || cs.every(c => c === '*')) return null;
    return cs;
}

// 每個字的目標讀音：整個詞在詞庫裡就用詞庫的讀音（破音字才準），否則逐字取主要讀音。* 回 null；查不到的字回 { miss: true }
function _lhWsTarget(cs) {
    const z = cs.includes('*') ? null : ((typeof lhCwReading === 'function' && lhCwReading(cs.join(''))) || wordPhoneticMap.get(cs.join('')));
    const syl = z && z.split(' ').length === cs.length ? z.split(' ') : null;
    return cs.map((c, i) => {
        if (c === '*') return null;
        if (syl) { const zy = stripTone(syl[i]); return { zy, rhyme: getZhuyinRhyme(zy), tone: getZhuyinTone(syl[i]) }; }
        const list = chineseDict[c];
        if (!list || !list.length) return { miss: true };
        let zy = list[0];
        const pri = polyphonicsOrderMap && polyphonicsOrderMap.get(c);
        if (pri && pri[0]) { const b = pri[0].replace(/[ˊˇˋ˙]$/, ''); if (list.includes(b)) zy = b; }
        const info = (charInfo[c] || []).find(x => x.zhuyin === zy);
        return { zy, rhyme: getZhuyinRhyme(zy), tone: info && info.tone ? info.tone : 1 };
    });
}

// 純函式：詞庫裡符合的詞，常用的在前（排序固定，不給改）。
// mode：rhyme＝每個字都押韻（同母音）；initial＝每個字聲母相同（同子音）；
//       same＝至少一個字讀音完全相同（不管聲調），其他字押韻或同聲母都算（同讀音）。
// tone＝每個字也要同聲調；strict＝排除借韻（押韻時韻母要完全相同）。* 的位置不比對
function lhWsMatch(entries, target, word, { mode = 'rhyme', tone, strict, hidden } = {}) {
    const n = target.length, out = [];
    const rhymeOk = (zy, t) => lhRhymeMatch(getZhuyinRhyme(zy), t.rhyme, strict);
    const initOk = (zy, t) => _effInitial(zy) === _effInitial(t.zy);
    for (const e of entries) {
        if (e.w.length !== n || e.w === word || (hidden && hidden.has(e.w))) continue;
        const syl = e.z.split(' ');
        if (syl.length !== n) continue;
        let ok = true, same = false;
        for (let i = 0; i < n && ok; i++) {
            const t = target[i];
            if (!t) continue;
            const zy = stripTone(syl[i]);
            if (tone && getZhuyinTone(syl[i]) !== t.tone) ok = false;
            else if (mode === 'initial') ok = initOk(zy, t);
            else if (mode === 'same') { if (zy === t.zy) same = true; else ok = rhymeOk(zy, t) || initOk(zy, t); }
            else ok = rhymeOk(zy, t);
        }
        if (ok && (mode !== 'same' || same)) out.push(e);
    }
    return out.sort((a, b) => (b.p || 0) - (a.p || 0));
}

// 選項列上的詞卡按鈕（index.html .q-word）：比對方式三選一、篩選可多選，按了就重畫
document.addEventListener('click', e => {
    const b = e.target.closest('[data-ws], [data-ws-f]');
    if (!b) return;
    if (b.dataset.ws) _lhWs.mode = b.dataset.ws;
    else _lhWs[b.dataset.wsF] = !_lhWs[b.dataset.wsF];
    _lhWsSyncOpts();
    if (_lhWs.input) lhWsRender(_lhWs.input);
});
function _lhWsSyncOpts() {
    document.querySelectorAll('[data-ws]').forEach(b => b.classList.toggle('active', b.dataset.ws === _lhWs.mode));
    document.querySelectorAll('[data-ws-f]').forEach(b => b.setAttribute('aria-pressed', String(!!_lhWs[b.dataset.wsF])));
}

function _lhWsEl(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
}

function _lhWsPhon(e) {
    const syl = e.z.split(' ');
    return lastSearchType === 'pinyin' ? syl.map(s => zhuyinToPinyin(stripTone(s)) + (['', '', 'ˊ', 'ˇ', 'ˋ', '˙'][getZhuyinTone(s)] || '')).join(' ') : syl.join(' ');
}

// 詞卡的注音／拼音：押到的部分像字卡一樣上色（第 i 個字用第 i 種標記色）。
// 同母音＝標韻母；同子音＝標聲母；同讀音＝讀音一樣的字整個標，其他字標押到的那一半。勾掉「標記搜尋」就不上色
function _lhWsPhonEl(e) {
    const box = _lhWsEl('div', 'char-pinyin'), hl = document.getElementById('highlightSearch');
    const on = !hl || hl.checked, pin = lastSearchType === 'pinyin';
    e.z.split(' ').forEach((syl, i) => {
        if (i) box.append('  ');
        const zy = stripTone(syl), t = _lhWs.target && _lhWs.target[i];
        let init = getZhuyinInitial(zy) || '', rest = zy.slice(init.length);
        if (pin) {
            const py = zhuyinToPinyin(zy), pi = pinyinInitials.find(x => py.startsWith(x) && py.length > x.length) || '';
            init = pi; rest = py.slice(pi.length);
        }
        let part = '';
        if (on && t && !t.miss) {
            if (_lhWs.mode === 'same' && zy === t.zy) part = 'all';
            else if (_lhWs.mode === 'initial') part = 'init';
            else if (lhRhymeMatch(getZhuyinRhyme(zy), t.rhyme, _lhWs.strict)) part = 'rhyme';
            else part = 'init';
            if (part === 'init' && !init) part = 'all';     // 沒有聲母的字（ㄢ、ㄧ…）：整個標
            if (part === 'rhyme' && !rest) part = 'all';    // 只有聲母的字（ㄓ、ㄙ…）
        }
        const mk = s => _lhWsEl('span', 'search-highlight-' + ((i % 5) + 1), s);
        if (part === 'all') box.append(mk(init + rest));
        else if (part === 'init') box.append(mk(init), rest);
        else if (part === 'rhyme') box.append(init, mk(rest));
        else box.append(init + rest);
        const tm = ['', '', 'ˊ', 'ˇ', 'ˋ', '˙'][getZhuyinTone(syl)] || '';
        if (tm) box.append(_lhWsEl('span', 'tone-mark', tm));
    });
    return box;
}

// displayResults 一開始呼叫：是「查整個詞」就畫詞卡並回 true（呼叫端就不畫字卡）
function lhWsRender(input) {
    const cs = lhWsQuery(input);
    if (!cs) { _lhWs.key = ''; return false; }
    const container = document.getElementById('resultsContainer');
    if (_lhWs.io) { _lhWs.io.disconnect(); _lhWs.io = null; }
    container.onclick = null;
    container.dataset.render = 'done';
    container.removeAttribute('aria-busy');
    const word = cs.join('');
    _lhWs.input = word;
    const target = _lhWsTarget(cs);
    if (target.some(t => t && t.miss)) {
        container.replaceChildren(_lhWsEmpty('有字不在字庫裡，查不到整個詞的韻', '試試換個字，或在字中間加空白分開查單字韻'));
        return true;
    }
    _lhWs.target = target;
    if (!wordlistData) {
        container.replaceChildren(_lhWsEmpty('詞庫載入中…', '載好就會列出押「' + word + '」的詞'));
        loadWordlist().then(() => { if (wordlistData && lhWsQuery(document.getElementById('searchInput').value) && _lhWs.input === word) lhWsRender(word); });
        return true;
    }
    _lhWs.list = lhWsMatch(typeof lhCwMerge === 'function' ? lhCwMerge(wordlistData) : wordlistData, target, word, _lhWs);   // 自訂詞彙一起比（js/custom-words.js）
    _lhWsDraw(container, word);
    return true;
}

function _lhWsEmpty(title, sub) {
    const box = _lhWsEl('div', 'empty-state');
    box.append(_lhWsEl('h3', '', title), _lhWsEl('p', '', sub));
    return box;
}

function _lhWsDraw(container, word) {
    const head = _lhWsEl('div', 'ws-header');
    const how = { rhyme: '押「' + word + '」的詞', initial: '跟「' + word + '」同子音的詞', same: '跟「' + word + '」有字同讀音的詞' }[_lhWs.mode];
    const count = _lhWsEl('div', 'results-count', how + '：' + _lhWs.list.length.toLocaleString('zh-TW') + ' 個');
    const go = document.getElementById('wsAllBtn');   // 「顯示全部」在結果區上方（index.html，跟「關聯詞彙」同位置）
    if (go) go.disabled = !_lhWs.list.length;
    // 回報：跟 AI 詞卡一樣先進「挑選」模式（點詞卡＝勾選，不是保留），再送出；放在選項列最右邊（跟字卡的「回報」同一個位置）
    const rep = document.getElementById('wsRepSlot');
    const repBtn = _lhWsEl('button', 'batch-btn btn-report');
    repBtn.type = 'button';
    repBtn.title = '回報有問題的詞';
    const repCancel = _lhWsEl('button', 'batch-btn', '取消');
    repCancel.type = 'button';
    repCancel.hidden = true;
    const repSync = () => {
        const on = container.classList.contains('report-mode'), n = container.querySelectorAll('.ws-card.report-picked').length;
        repBtn.innerHTML = '<span class="batch-icon"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg></span><span></span>';
        repBtn.lastChild.textContent = on ? '送出回報（' + n + '）' : '回報';
        repCancel.hidden = !on;
    };
    const repExit = () => { container.classList.remove('report-mode'); container.querySelectorAll('.report-picked').forEach(c => c.classList.remove('report-picked')); repSync(); };
    repBtn.addEventListener('click', () => {
        if (!container.classList.contains('report-mode')) { container.classList.add('report-mode'); repSync(); showToast('點要回報的詞卡（可以多選），再按「送出回報」'); return; }
        const words = [...container.querySelectorAll('.ws-card.report-picked')].map(c => c.dataset.char);
        if (!words.length) { showToast('先點要回報的詞卡'); return; }
        openReportDialog(words.map(word => ({ kind: 'word', word })), { onSent: repExit });
    });
    repCancel.addEventListener('click', repExit);
    if (rep) rep.replaceChildren(repBtn, repCancel);
    container.classList.remove('report-mode');
    repSync();
    _lhWs.repSync = repSync;
    head.append(count);
    if (!_lhWs.list.length) {
        container.replaceChildren(head, _lhWsEmpty('沒有符合的詞', _lhWs.tone || _lhWs.strict ? '把「同聲調」「排除借韻」取消試試' : '試試換個比對方式、少一個字，或用 * 代替不必押的字（例：*打）'));
        return;
    }
    const grid = _lhWsEl('div', 'results-grid ws-grid');
    container.replaceChildren(head, grid);
    _lhWs.shown = 0;
    _lhWsMore(grid);
    // 點詞卡＝保留（和 AI 建議的詞卡一樣）；按住拖到歌詞（js/word-drag.js 認 .char-card 的 data-char）
    container.onclick = e => {
        const card = e.target.closest('.ws-card');
        if (!card) return;
        if (container.classList.contains('report-mode')) { card.classList.toggle('report-picked'); _lhWs.repSync(); return; }
        saveWord(card.dataset.char);
    };
}

// 再畫一頁；最後一張還沒畫完就放一個哨兵，捲到它就再補
function _lhWsMore(grid) {
    const end = Math.min(_lhWs.list.length, _lhWs.shown + LH_WS_PAGE);
    const frag = document.createDocumentFragment();
    for (let i = _lhWs.shown; i < end; i++) {
        const e = _lhWs.list[i];
        const card = _lhWsEl('div', 'char-card ws-card' + (e.custom ? ' ws-custom' : ''));
        card.dataset.char = e.w;
        card.title = '點一下保留；按住拖到歌詞';
        card.append(_lhWsEl('div', 'char-main', [...e.w].join(' ')),   // 字跟字之間一個半形空格，對齊比較寬的注音
             _lhWsPhonEl(e));
        frag.append(card);
    }
    _lhWs.shown = end;
    grid.append(frag);
    if (_lhWs.io) { _lhWs.io.disconnect(); _lhWs.io = null; }
    if (end >= _lhWs.list.length) return;
    const sentinel = grid.lastElementChild;
    _lhWs.io = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) _lhWsMore(grid); });
    _lhWs.io.observe(sentinel);
}

// ==================== 顯示全部（星雲） ====================
const _lhSp = { el: null, world: null, words: [], groups: [], raf: 0, last: 0, t0: 0, z: 1, px: 0, py: 0, pts: new Map(), pan: null, pinch: null, drag: null, nav: null, back: null, bound: 1000, pins: [], chords: [], line: null, tm: 0 };
const LH_SP_ZMIN = 0.25, LH_SP_ZMAX = 3;
const LH_SP_RING = 64;   // 軌道之間的距離（世界座標 px）；0.98.09 從 46 拉大，大星系加上隨機偏移也不會疊在一起
const _lhSpReduce = matchMedia('(prefers-reduced-motion: reduce)');
const LH_SP_EYE_OFF = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M4 20L20 4"/></svg>';
const LH_SP_X = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

function _lhSpBuild() {
    if (_lhSp.el) return _lhSp.el;
    const el = _lhWsEl('div', 'ws-space');
    el.id = 'wordSpace';
    el.hidden = true;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', '全部押韻詞');
    // 一張 canvas 畫全部的詞（js 最後的 _lhSpDraw）；📌 ✕ 是真的按鈕，只浮在停住／釘住的那個詞旁邊
    const cv = _lhWsEl('canvas', 'ws-canvas');
    cv.setAttribute('aria-hidden', 'true');
    const acts = _lhWsEl('div', 'ws-acts');
    acts.hidden = true;
    const hide = _lhWsEl('button', 'ws-hide');   // 只剩右上角的「隱藏」（點詞本身＝保留）
    hide.type = 'button';
    hide.innerHTML = LH_SP_EYE_OFF;
    acts.append(hide);
    const probe = _lhWsEl('span', 'ws-probe');   // 把 var()／color-mix() 換成 canvas 看得懂的顏色
    probe.hidden = true;
    const mk = (cls, txt, label, fn) => { const b = _lhWsEl('button', 'ws-hud-btn ' + cls, txt); b.type = 'button'; b.setAttribute('aria-label', label); b.title = label; b.addEventListener('click', fn); return b; };
    // 左上：標題、各團按鈕（點了導覽過去）、取消選取、常用度篩選
    const panel = _lhWsEl('div', 'ws-panel');
    const title = _lhWsEl('div', 'ws-title');
    const legend = _lhWsEl('div', 'ws-legend');
    const tools = _lhWsEl('div', 'ws-tools');
    const fl = _lhWsEl('label', 'ws-filter');
    const fcap = _lhWsEl('span', 'ws-filter-cap', '常用度：不限');
    const range = _lhWsEl('input', 'ws-range');
    range.type = 'range'; range.min = '0'; range.max = '95'; range.step = '5'; range.value = '0';
    range.setAttribute('aria-label', '只顯示比較常用的詞');
    range.addEventListener('input', () => _lhSpFilter(+range.value));
    fl.append(fcap, range);
    // 取消選取：跟保留池「清除全部」一樣，先變紅色「確定取消 N 個？」，4 秒內再按一次才取消（也一起取消保留）
    const clr = _lhWsEl('button', 'ws-hud-btn saved-clear-btn ws-clear', '取消選取');
    clr.type = 'button';
    clr.hidden = true;
    clr.addEventListener('click', _lhSpClearAsk);
    tools.append(clr, fl);
    const posBox = _lhWsEl('div', 'ws-pos');
    posBox.setAttribute('role', 'group');
    posBox.setAttribute('aria-label', '字在詞裡的位置');
    for (const [k, label] of [['head', '字首'], ['tail', '字尾']]) {
        const b = _lhWsEl('button', 'ws-hud-btn', label);
        b.type = 'button';
        b.dataset.pos = k;
        b.addEventListener('click', () => { _lhRel.pos = _lhRel.pos === k ? '' : k; _lhRelShow(); });
        posBox.append(b);
    }
    // 字數（可多選，都不選＝不限）：兩字、三字、四字以上
    const lenBox = _lhWsEl('div', 'ws-pos ws-len');
    lenBox.setAttribute('role', 'group');
    lenBox.setAttribute('aria-label', '詞的字數');
    for (const [k, label] of [['2', '兩字'], ['3', '三字'], ['m', '多字']]) {
        const b = _lhWsEl('button', 'ws-hud-btn', label);
        b.type = 'button';
        b.dataset.len = k;
        b.addEventListener('click', () => { const s = _lhRel.len; s.has(k) ? s.delete(k) : s.add(k); _lhRelShow(); });
        lenBox.append(b);
    }
    // 分批（0.98.09）：數字滑桿，一格一批；目前這批在軌道上用重點色標出來
    const pages = _lhWsEl('div', 'ws-pages');
    pages.hidden = true;
    const pr = _lhWsEl('input', 'ws-page-range');
    pr.type = 'range'; pr.min = '0'; pr.step = '1';
    pr.setAttribute('aria-label', '第幾批詞');
    const prMark = () => { const n = +pr.max + 1, v = +pr.value; pr.style.setProperty('--a', (v / n * 100) + '%'); pr.style.setProperty('--b', ((v + 1) / n * 100) + '%'); };
    pr.addEventListener('input', prMark);
    pr.addEventListener('change', () => { if (_lhSp.cfg && +pr.value !== (_lhSp.cfg.page || 0)) _lhSpWhip(+pr.value); });
    pages.append(pr, _lhWsEl('div', 'ws-page-ticks'));
    pages._mark = prMark;
    panel.append(title, posBox, lenBox, pages, legend, tools);
    // 右上：縮放與關閉
    const zoom = _lhWsEl('div', 'ws-zoom');
    const pct = mk('ws-pct', '100%', '回到 100%', () => _lhSpZoom(1));
    zoom.append(mk('', '−', '縮小', () => _lhSpZoom(_lhSp.z / 1.25)), pct, mk('', '＋', '放大', () => _lhSpZoom(_lhSp.z * 1.25)));
    const close = mk('ws-close', '', '關閉（Esc）', () => lhWsClose());
    close.innerHTML = LH_SP_X;
    zoom.append(close);
    el.append(cv, acts, probe, panel, zoom);
    document.body.append(el);
    _lhSp.el = el;
    _lhSp.cv = cv;
    _lhSp.ctx = cv.getContext('2d');
    _lhSp.acts = acts;
    _lhSp.probe = probe;
    new ResizeObserver(() => _lhSpResize()).observe(el);
    _lhSpEvents(el);
    return el;
}


// 常用度篩選：只留前 (100 - v)% 常用的詞；0＝不限
function _lhSpFilter(v) {
    const n = _lhSp.words.length;
    const sorted = [..._lhSp.words].sort((a, b) => b.p - a.p);
    const keep = new Set(sorted.slice(0, Math.max(1, Math.ceil(n * (100 - v) / 100))));
    for (const w of _lhSp.words) w.dim = !keep.has(w);
    for (const cl of _lhSp.groups) cl.ver++;   // 星系圖（第 2 級）要照新的淡／亮重畫
    _lhSp.dirty = true;
    _lhSp.el.querySelector('.ws-filter-cap').textContent = v ? '常用度：前 ' + (100 - v) + '%' : '常用度：不限';
}

// 一個詞在畫面上大約多寬（世界座標 px），排軌道用
const _lhSpWidth = (w, s) => [...w].length * 16 * s + 22;

// 分群（聲調組合）→ 每團：最常用的詞在中心（恆星），其他依常用度由內往外排；只有 1–2 個詞的團變流星。
// 軌道不是整齊的同心圓：每個詞各自的半徑、橢圓扁度、傾角、起始角度、速度都帶一點隨機。
// 字的大小照常用度（詞庫的 p，取對數）在 0.8～2 倍之間（最大最小差 2.5 倍）
// cfg.groupOf(e)→團的 key、cfg.headOf(key)→圖例大類、cfg.colorOf(key)→團色；沒給就用聲調組合（顯示全部）
// 換一批的過場（0.98.09）：鏡頭一甩，舊的帶模糊甩出去、新的從另一邊甩進來（往後翻往左甩）；減少動態時直接換
function _lhSpWhip(page) {
    const cv = _lhSp.cv, cfg = _lhSp.cfg, d = page > (cfg.page || 0) ? -1 : 1;
    const go = () => _lhSpShow(Object.assign({}, cfg, { page }));
    if (_lhSpReduce.matches || !cv.animate) { go(); return; }
    if (_lhSp.whip) _lhSp.whip.cancel();
    const away = 'translateX(' + (d * 40) + '%) scale(0.92)', back = 'translateX(' + (-d * 40) + '%) scale(0.92)';
    const out = cv.animate([{ transform: 'none', filter: 'blur(0)', opacity: 1 }, { transform: away, filter: 'blur(14px)', opacity: 0 }],
        { duration: 240, easing: 'cubic-bezier(.55,0,.9,.45)', fill: 'forwards' });
    _lhSp.whip = out;
    out.onfinish = () => {
        go();   // 同一個工作裡換內容、接著開始甩進來，中間不會露出空白的一格
        out.cancel();
        _lhSp.whip = cv.animate([{ transform: back, filter: 'blur(14px)', opacity: 0 }, { transform: 'none', filter: 'blur(0)', opacity: 1 }],
            { duration: 420, easing: 'cubic-bezier(.15,.7,.3,1)' });
    };
}
const _lhSpGroupKey = (e, cfg) => cfg.groupOf ? cfg.groupOf(e) : e.z.split(' ').map(s => getZhuyinTone(s)).join('·');
// 分批（0.98.09）：一批約 500（±50）個詞，整個星系一起分、不拆開（星系本身超過 550 才切）。
// 批數＝總數 / 500 四捨五入；星系由大到小，每次放進目前最少的那批（批與批的數量會很平均）。結果記在 cfg._pages
function _lhSpPages(cfg) {
    if (cfg._pages) return cfg._pages;
    const groups = new Map();
    for (const e of cfg.list) { const k = _lhSpGroupKey(e, cfg); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e); }
    const chunks = [];
    // 太大的星系要切開時「輪流發牌」（第 1 個詞給第 1 塊、第 2 個給第 2 塊…）：每塊都有常用到冷僻的詞，恆星才不會是個冷門小字
    // （0.98.09 iPad 實測：原本照常用度一段段切，後面幾批的大星系只剩冷門詞，恆星比旁邊的小星系還小）
    for (const g of groups.values()) { const n = Math.ceil(g.length / LH_WS_SPACE_MAX); for (let k = 0; k < n; k++) chunks.push(g.filter((_, i) => i % n === k)); }
    chunks.sort((a, b) => b.length - a.length);
    const bins = Array.from({ length: Math.max(1, Math.round(cfg.list.length / 500)) }, () => new Set());
    for (const c of chunks) { const b = bins.reduce((m, x) => x.size < m.size ? x : m); for (const e of c) b.add(e); }
    return (cfg._pages = bins.filter(b => b.size).map(b => cfg.list.filter(e => b.has(e))));   // 每批裡照原本順序（常用的先）
}
function _lhSpLayout(list, cfg = {}) {
    const lp = list.map(e => Math.log1p(e.p || 0)), lo = Math.min(...lp), hi = Math.max(...lp);
    const norm = e => hi > lo ? (Math.log1p(e.p || 0) - lo) / (hi - lo) : 0.5;
    const sizeOf = e => 0.8 + 1.2 * norm(e);
    const R = Math.random, TAU = Math.PI * 2, JIT = _lhSpCfg().jitter;   // 水彩偏移只在第 4、5 級（其他級同一圈整整齊齊）
    // 同一色系裡的深淺：越常用越接近主色，再加一點隨機
    const tint = (base, e) => 'color-mix(in oklab, ' + base + ' ' + Math.round(55 + 30 * norm(e) + 15 * R()) + '%, var(' + (R() < 0.5 ? '--text-primary' : '--text-secondary') + '))';
    const groups = new Map();
    for (const e of list) {
        const k = _lhSpGroupKey(e, cfg);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(e);
    }
    const G = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
    const words = [], clusters = [], comets = [];
    for (const [key, g] of G) {
        if (g.length <= 2 && G.length > 1) { comets.push(...g); continue; }   // 很孤立的：流星
        const t1 = cfg.headOf ? cfg.headOf(key) : Math.min(5, Math.max(1, +key.split('·')[0] || 1));
        const color = cfg.colorOf ? cfg.colorOf(key) : _lhWsToneMix(key);
        const cl = { key, t1, n: g.length, color, x: 0, y: 0, hx: 0, hy: 0, r: 0, D: 0, held: false, dir: R() < 0.5 ? -1 : 1, tilt: R() * Math.PI,
            ph: [R() * TAU, R() * TAU], f: [0.12 + R() * 0.08, 0.1 + R() * 0.08], bp: 4 + R() * 3, ver: 0 };   // bp：整團呼吸一輪幾秒（每團不同）
        clusters.push(cl);
        // 先照寬度一圈圈分好（第 k 圈半徑 = 中心詞的一半寬 + k × 間距），再給每個詞自己的隨機軌道
        const star = g[0], rings = [[]];
        let r = _lhSpWidth(star.w, sizeOf(star)) / 2 + LH_SP_RING * 0.9, used = 0;
        const radii = [r];
        for (const e of g.slice(1)) {
            const wd = _lhSpWidth(e.w, sizeOf(e)) + 10;
            if (used + wd > 2 * Math.PI * r && rings[rings.length - 1].length) { rings.push([]); r += LH_SP_RING; radii.push(r); used = 0; }
            rings[rings.length - 1].push(e);
            used += wd;
        }
        cl.r = r + LH_SP_RING * 1.1;
        words.push({ e: star, cl, star: true, color, s: sizeOf(star), n: norm(star), r: 0, ecc: 1, tilt: 0, th: 0, om: 0 });
        // 同一圈共用扁度、傾角、速度（才不會越轉越擠在一起），每個詞只再帶一點點偏差
        rings.forEach((ring, k) => {
            const th0 = R() * TAU, gap = TAU / ring.length;
            const avgN = ring.reduce((t, e) => t + norm(e), 0) / ring.length;   // 0.98.09：大行星（常用、字大）慢、小行星快，照這圈詞的平均大小（同圈共用速度才不會互撞）
            const om = cl.dir * 0.16 / Math.sqrt(k + 1) * (0.9 + R() * 0.2) * (1.55 - 1.1 * avgN);
            const ecc = 0.82 + R() * 0.15, tilt = cl.tilt + (R() - 0.5) * 0.5;
            ring.forEach((e, j) => words.push({ e, cl, color: tint(color, e), s: sizeOf(e), n: norm(e),
                // 水彩筆畫的圈（第 4、5 級）：同一圈每個詞離軌道多遠不一樣（±30% 間距），角度也不平均；速度相同，所以彼此距離不會變
                r: radii[k] + (JIT ? (R() - 0.5) * LH_SP_RING * 0.6 : 0), ecc: ecc + (JIT ? (R() - 0.5) * 0.03 : 0), tilt: tilt + (JIT ? (R() - 0.5) * 0.08 : 0),
                th: th0 + gap * j + (JIT ? (R() - 0.5) * gap * 0.35 : 0), om, br: 3 + R() * 4 }));
        });
    }
    // 恆星飄的速度：照團的大小分 20 級（5% 一級，跟常用度滑桿同單位），越小的團飄越快；恆星越不常用（字越小）也越快
    const bySize = [...clusters].sort((a, b) => a.n - b.n);
    bySize.forEach((cl, i) => {
        const lv = 1 + Math.round(19 * (bySize.length > 1 ? i / (bySize.length - 1) : 0.5));   // 1＝最小的團 … 20＝最大的團
        const star = words.find(w => w.cl === cl && w.star);
        const k = (2.6 - 2.15 * (lv - 1) / 19) * (1 + 0.8 * (1 - (star ? norm(star.e) : 0.5)));   // 最快約最慢的 10 倍
        cl.f = cl.f.map(f => f * k);
    });
    // 團沿黃金角螺旋往外放，彼此多留一點空間給恆星飄
    const placed = [];
    clusters.forEach((cl, i) => {
        for (let k = 0; i > 0; k++) {
            const a = k * 2.39996, d = 60 + k * 22;
            cl.x = Math.cos(a) * d; cl.y = Math.sin(a) * d * 0.8;
            if (placed.every(p => Math.hypot(p.x - cl.x, p.y - cl.y) > p.r + cl.r + 90)) break;
        }
        cl.hx = cl.x; cl.hy = cl.y;
        placed.push(cl);
    });
    for (const cl of clusters) _lhSpDrift(cl, clusters);
    const bound = Math.max(600, ...clusters.map(c => Math.hypot(c.x, c.y) + c.r)) * 1.25;
    for (const e of comets) {   // 流星：隨機起點、隨機方向，沿著微彎的弧線穿過整片（0.98.08 快一點、直一點），出了邊界從對面回來
        const a = R() * TAU, v = 45 + R() * 45, cv = (R() < 0.5 ? -1 : 1) * (0.0075 + R() * 0.0175);   // 0.98.09：曲率是 0.98.08 的 1/2
        words.push({ e, cl: null, color: 'var(--text-primary)', s: sizeOf(e), n: norm(e), comet: true, x: (R() * 2 - 1) * bound, y: (R() * 2 - 1) * bound, v, cv, ang: a });
    }
    return { words, clusters, bound };
}

// 恆星能飄多遠：和最近那團之間空隙的一半（兩團各飄各的也碰不到），3～60
function _lhSpDrift(cl, all) {
    let g = 240;
    for (const o of all) if (o !== cl) g = Math.min(g, Math.hypot(o.hx - cl.hx, o.hy - cl.hy) - o.r - cl.r);
    cl.D = Math.max(3, Math.min(60, g / 2 - 8));
}
const _lhSpDx = (cl, T) => cl.D * Math.sin(T * cl.f[0] + cl.ph[0]);
const _lhSpDy = (cl, T) => cl.D * 0.8 * Math.cos(T * cl.f[1] + cl.ph[1]);

// 詞在自己軌道上的位置（橢圓、傾斜，繞著恆星現在的位置）
function _lhSpOrbit(w) {
    const c = Math.cos(w.th) * w.r, sn = Math.sin(w.th) * w.r * w.ecc, ct = Math.cos(w.tilt), st = Math.sin(w.tilt);
    return { x: w.cl.x + c * ct - sn * st + (w.sx || 0), y: w.cl.y + c * st + sn * ct + (w.sy || 0) };
}

// 一打開的縮放：近一點，大約 25% 的詞落在畫面裡（其他的拖過去、縮小再看）
function _lhSpFitZoom(words) {
    const el = _lhSp.el, W = (el.clientWidth || innerWidth) / 2 - 30, H = (el.clientHeight || innerHeight) / 2 - 40;   // 還藏著（面板還在收）時用視窗大小
    const q = words.filter(w => !w.comet).map(w => {
        const { x, y } = _lhSpOrbit(w);
        return Math.max(Math.abs(x) / W, Math.abs(y) / H);
    }).sort((a, b) => a - b);
    if (!q.length) return 1;
    const p25 = q[Math.min(q.length - 1, Math.floor(q.length * 0.25))] || 1;
    return Math.min(2.2, Math.max(LH_SP_ZMIN, 1 / p25));
}

function lhWsOpen() {
    if (!_lhWs.list.length) return;
    _lhSpShow({ list: _lhWs.list, title: '「' + _lhWs.input + '」', page: 0 });
}

// ===== 關聯詞彙：查單字時選了字卡，列出含這些字的詞（js/cards.js updateBatchCount 開關按鈕） =====
// pos：'head'＝字在詞首、'tail'＝在詞尾、''＝任意位置。len：字數篩選（'2'／'3'／'m'＝四字以上，可多選，空＝不限）。
// 分團：字＋位置（任意）或字＋字數（詞首／詞尾）
const _lhRel = { chars: [], pos: '', len: new Set() };
function _lhWsRelList(chars, pos, len = new Set()) {
    const set = new Set(chars), out = [];
    for (const e of typeof lhCwMerge === 'function' ? lhCwMerge(wordlistData) : wordlistData || []) {
        const cs = [...e.w], n = cs.length;
        if (n < 2 || n > LH_WS_MAX || _lhWs.hidden.has(e.w)) continue;
        if (len.size && !len.has(n === 2 ? '2' : n === 3 ? '3' : 'm')) continue;
        if (pos === 'head' ? set.has(cs[0]) : pos === 'tail' ? set.has(cs[n - 1]) : cs.some(c => set.has(c))) out.push(e);
    }
    return out.sort((a, b) => (b.p || 0) - (a.p || 0));
}
function lhWsRelOpen() {
    const chars = [...selectedChars].filter(c => /[一-鿿]/.test(c));
    if (!chars.length) return;
    if (!wordlistData) { showToast('詞庫載入中…'); loadWordlist().then(() => { if (wordlistData) lhWsRelOpen(); }); return; }
    _lhRel.chars = chars;
    _lhRelShow();
}
function _lhRelShow() {
    const { chars, pos, len } = _lhRel;
    const list = _lhWsRelList(chars, pos, len);
    if (!list.length) { showToast('詞庫裡沒有' + (pos === 'head' ? '以這些字開頭' : pos === 'tail' ? '以這些字結尾' : '含這些字') + (len.size ? '、這個字數' : '') + '的詞'); if (!_lhSp.el || _lhSp.el.hidden) return; }
    const set = new Set(chars);
    const where = e => { const cs = [...e.w]; return pos === 'tail' ? cs[cs.length - 1] : pos === 'head' ? cs[0] : cs.find(c => set.has(c)); };
    const groupOf = e => {
        const cs = [...e.w], c = where(e), i = cs.indexOf(c);
        return c + '|' + (pos ? cs.length + ' 字' : i === 0 ? '開頭' : i === cs.length - 1 ? '結尾' : '中間');
    };
    _lhSpShow({ list, title: '「' + chars.join('') + '」關聯詞', rel: true, page: 0,
        groupOf, headOf: key => key.split('|')[0], colorOf: key => LH_WS_TONE_C[chars.indexOf(key.split('|')[0]) % 5] });
}

// 打開星雲（或已經開著時換內容）：cfg = { list, title, rel, groupOf, headOf, colorOf }
function _lhSpShow(cfg) {
    const el = _lhSpBuild();
    const reopen = !el.hidden;
    _lhSp.cfg = cfg;
    const batches = _lhSpPages(cfg), pageN = batches.length, page = Math.min(cfg.page || 0, pageN - 1);
    const { words, clusters, bound } = _lhSpLayout(batches[page], cfg);
    _lhSp.bound = bound;
    _lhSp.groups = clusters;
    const n = words.length;
    el.querySelector('.ws-title').textContent = cfg.title + '· ' + n + (cfg.list.length > n ? ' / ' + cfg.list.length : '') + ' 個詞';
    // 分批滑桿：超過 550 個才出現；底下的數字是每批的編號
    const pages = el.querySelector('.ws-pages'), pr = pages.querySelector('.ws-page-range');
    pages.hidden = pageN <= 1;
    pr.max = String(pageN - 1); pr.value = String(page);
    pr.setAttribute('aria-valuetext', '第 ' + (page + 1) + ' 批，共 ' + pageN + ' 批');
    pages._mark();
    pages.querySelector('.ws-page-ticks').replaceChildren(...Array.from({ length: pageN }, (_, i) => _lhWsEl('span', i === page ? 'on' : '', String(i + 1))));
    // 圖例：一欄；大類（聲調色系，或關聯詞的字）點開看底下各團，點團導覽過去
    const legend = el.querySelector('.ws-legend');
    legend.replaceChildren();
    const heads = cfg.rel ? _lhRel.chars : [1, 2, 3, 4, 5];
    // 關聯詞的團固定順序：開頭 → 中間 → 結尾；選了字首／字尾時照字數
    const relRank = k => { const s = k.split('|')[1] || ''; const i = ['開頭', '中間', '結尾'].indexOf(s); return i >= 0 ? i : parseInt(s, 10) || 99; };
    heads.forEach((h, hi) => {
        const cs = clusters.filter(cl => cl.t1 === h);
        if (cfg.rel) cs.sort((a, b) => relRank(a.key) - relRank(b.key));
        if (!cs.length) return;
        const total = cs.reduce((a, c) => a + c.n, 0);
        const head = _lhWsEl('button', 'ws-leg ws-leg-tone', (cfg.rel ? '「' + h + '」' : LH_WS_TONE_N[h - 1] + '開頭') + '（' + total + '）');
        const sub = _lhWsEl('div', 'ws-sub');
        head.type = 'button';
        head.style.setProperty('--c', LH_WS_TONE_C[(cfg.rel ? hi : h - 1) % 5]);
        head.setAttribute('aria-expanded', 'false');
        sub.hidden = true;
        head.addEventListener('click', () => { sub.hidden = !sub.hidden; head.setAttribute('aria-expanded', String(!sub.hidden)); });
        sub.append(...cs.map(cl => {
            const label = cfg.rel ? cl.key.split('|')[1] : cl.key.split('·').map(t => LH_WS_TONE_N[t - 1] ? LH_WS_TONE_N[t - 1][0] : t).join('·');
            const b = _lhWsEl('button', 'ws-leg', label + '（' + cl.n + '）');
            b.type = 'button';
            b.style.setProperty('--c', cl.color);
            b.title = '移到這一團';
            b.addEventListener('click', () => _lhSpGoTo(cl));
            return b;
        }));
        legend.append(head, sub);
    });
    // 關聯詞才有的「字首／字尾」（最多選一個，都不選＝任意位置）和字數（可多選）
    for (const box of el.querySelectorAll('.ws-pos')) box.hidden = !cfg.rel;
    el.querySelectorAll('[data-pos]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.pos === _lhRel.pos)));
    el.querySelectorAll('[data-len]').forEach(b => b.setAttribute('aria-pressed', String(_lhRel.len.has(b.dataset.len))));
    el.querySelector('.ws-range').value = '0';
    el.querySelector('.ws-filter-cap').textContent = '常用度：不限';
    _lhSp.pins = [];
    _lhSp.chords = [];
    _lhSp.segs = [];
    _lhSp.hover = null;
    _lhSp.act = null;
    _lhSpTheme();
    _lhSp.words = words.map(it => Object.assign(it, {
        w: it.e.w, p: it.e.p || 0, rgb: _lhSpColor(it.color), phon: _lhWsPhon(it.e), spr: null, nspr: null, tw: _lhSpWidth(it.e.w, it.s) - 22, tH: 22 * it.s,
        wob: Math.random() * 100, hot: false, pinned: false, kept: savedWords.includes(it.e.w), dim: false, free: false, fx: 0, fy: 0, fvx: 0, fvy: 0, sx: 0, sy: 0, born: 0, mag: 1, kb: 1, twk: 0 }));
    // 分批浮現：一次一個星系（大的先），流星最後；字的小圖先在背景畫好，畫好的那一團才出現，不會有一幀卡很久
    _lhSp.queue = clusters.map(cl => _lhSp.words.filter(w => w.cl === cl));
    const cm = _lhSp.words.filter(w => w.comet);
    if (cm.length) _lhSp.queue.push(cm);
    _lhSp.gap = Math.max(40, Math.min(140, 1400 / Math.max(1, _lhSp.queue.length)));
    _lhSp.bornAt = 0;
    _lhSp.px = 0; _lhSp.py = 0;
    _lhSp.nav = null;
    _lhSp.z = _lhSpFitZoom(_lhSp.words);
    _lhSp.dpr = Math.min(window.devicePixelRatio || 1, 2);
    _lhSp.S = _lhSpBucket(_lhSp.z * _lhSp.dpr);
    _lhSp.dirty = true;
    if (reopen) {   // 已經開著（換字首／字尾、換一批）：直接換內容、重新浮現
        el.hidden = false;
        _lhSp.visible = true;
        _lhSpApplyView();
        _lhSp.t0 = performance.now();
        return;
    }
    // 打開的順序：三塊面板先慢慢收走（1.2 秒）→ 只剩背景（飄字變很淡）→ 星雲淡入、一團團浮現。
    // 面板收走的這段時間，背景已經在畫字的小圖（星雲層還藏著），面板走完就能直接浮現
    _lhSp.back = document.activeElement;
    _lhSp.visible = false;
    for (const id of ['leftPanel', 'mainContainer', 'rightPanel', 'mobileTabBar']) { const p = document.getElementById(id); if (p) p.inert = true; }
    if (typeof lhBgFxFaint === 'function') lhBgFxFaint(true);
    document.body.classList.add('ws-anim', 'ws-in', 'ws-leave');
    clearTimeout(_lhSp.tm);
    _lhSp.t0 = performance.now();
    _lhSp.last = 0;
    cancelAnimationFrame(_lhSp.raf);
    _lhSp.raf = requestAnimationFrame(_lhSpFrame);
    _lhSp.tm = setTimeout(() => {
        el.hidden = false;
        document.body.classList.remove('ws-in');
        _lhSpResize();
        _lhSp.visible = true;
        _lhSp.dirty = true;
        _lhSpApplyView();
        requestAnimationFrame(() => document.body.classList.add('ws-open'));
        el.querySelector('.ws-close').focus({ preventScroll: true });
    }, _lhSpReduce.matches ? 0 : 1200);
    document.addEventListener('keydown', _lhSpKey, true);
}

function lhWsClose() {
    if (!_lhSp.el || !document.body.classList.contains('ws-leave')) return;
    const el = _lhSp.el, fast = _lhSpReduce.matches;
    document.removeEventListener('keydown', _lhSpKey, true);
    // 收起的順序反過來：星雲先淡出 → 三塊面板回來
    document.body.classList.remove('ws-open', 'ws-in');
    clearTimeout(_lhSp.tm);
    _lhSp.tm = setTimeout(() => {
        el.hidden = true;
        cancelAnimationFrame(_lhSp.raf); _lhSp.raf = 0;
        _lhSp.words = []; _lhSp.queue = []; _lhSp.pins = []; _lhSp.chords = []; _lhSp.segs = []; _lhSp.hover = _lhSp.act = null;   // 0.98.09：放掉每個詞的小圖、星系圖（下次打開會重建）
        document.body.classList.remove('ws-leave');
        for (const id of ['leftPanel', 'mainContainer', 'rightPanel', 'mobileTabBar']) { const p = document.getElementById(id); if (p) p.inert = false; }
        if (typeof syncCenterPanel === 'function') syncCenterPanel();   // 收起的面板要回到 inert（syncCenterPanel 是唯一管 inert 的地方）
        if (typeof lhBgFxFaint === 'function') lhBgFxFaint(false);
        if (_lhSp.back && _lhSp.back.isConnected) _lhSp.back.focus({ preventScroll: true });
        _lhSp.tm = setTimeout(() => { if (!document.body.classList.contains('ws-leave')) document.body.classList.remove('ws-anim'); }, fast ? 0 : 550);
    }, fast ? 0 : 380);
    // 這裡隱藏的詞，清單也一起拿掉
    if (_lhWs.input && lhWsQuery(document.getElementById('searchInput').value)) lhWsRender(_lhWs.input);
}

function _lhSpKey(e) {
    if (e.key === 'Escape' && !e.isComposing) { e.preventDefault(); e.stopPropagation(); lhWsClose(); }
}

function _lhSpApplyView() {
    _lhSp.dirty = true;
    const b = _lhSp.el.querySelector('.ws-pct');
    if (b) b.textContent = Math.round(_lhSp.z * 100) + '%';
}

// ===== canvas：尺寸、顏色、字的小圖 =====
function _lhSpResize() {
    const el = _lhSp.el, cv = _lhSp.cv;
    if (!el || !cv) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    _lhSp.dpr = dpr; _lhSp.W = el.clientWidth; _lhSp.H = el.clientHeight;
    cv.width = Math.max(1, Math.round(_lhSp.W * dpr));
    cv.height = Math.max(1, Math.round(_lhSp.H * dpr));
    _lhSp.dirty = true;
}
const _lhSpColors = new Map();
// 任何 CSS 顏色（rgb、oklch、color-mix…）加透明度：先在 1×1 畫布上畫一次讀回 RGB（快取），再組 rgba(…)。
// 不能直接改字串：主題色算出來可能是 oklch(…)，硬改會變成不合法的顏色、整格畫不出來（0.98.09 的 bug）
const _lhSpRgbC = new Map();
function _lhSpRGBA(css, a) {
    let v = _lhSpRgbC.get(css);
    if (!v) {
        const x = (_lhSpRGBA.c || (_lhSpRGBA.c = document.createElement('canvas').getContext('2d', { willReadFrequently: true })));
        x.clearRect(0, 0, 1, 1); x.fillStyle = '#000'; x.fillStyle = css; x.fillRect(0, 0, 1, 1);
        const d = x.getImageData(0, 0, 1, 1).data;
        _lhSpRgbC.set(css, v = d[0] + ', ' + d[1] + ', ' + d[2]);
    }
    return 'rgba(' + v + ', ' + a + ')';
}
function _lhSpColor(css) {
    if (!_lhSpColors.has(css)) { _lhSp.probe.style.color = css; _lhSpColors.set(css, getComputedStyle(_lhSp.probe).color); }
    return _lhSpColors.get(css);
}
// 主題的顏色、字型（每次打開重讀：可能換過主題）
function _lhSpTheme() {
    _lhSpColors.clear();
    const pr = _lhSp.probe;
    pr.style.fontFamily = 'var(--font-serif)';
    _lhSp.font = getComputedStyle(pr).fontFamily;
    _lhSp.cCard = _lhSpColor('var(--card-bg)');
    _lhSp.cLine = _lhSpColor('var(--highlight-border)');
    _lhSp.cMute = _lhSpColor('var(--text-secondary)');
}
// 字的小圖（字＋淡淡光暈）照某個縮放畫好，每一幀只要貼上去。
// 縮放時先拿舊的小圖放大縮小頂著；手停下來（160ms）才在背景照新縮放把整批畫好，全部畫好再一次換上去（不會一半新一半舊、也不卡）
const _lhSpBucket = z => Math.pow(2, Math.round(Math.log2(Math.max(0.1, z)) * 2) / 2);
function _lhSpSprite(w, S) {
    const fs = 16 * w.s * S, pad = Math.ceil(fs * 0.6);
    const m = _lhSp.ctx;
    m.font = fs + 'px ' + _lhSp.font;
    const tw = m.measureText(w.w).width;
    const c = document.createElement('canvas');
    c.width = Math.ceil(tw + pad * 2); c.height = Math.ceil(fs * 1.4 + pad * 2);
    const g = c.getContext('2d');
    g.font = fs + 'px ' + _lhSp.font;
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    g.fillStyle = w.rgb;
    g.shadowColor = w.rgb;
    g.shadowBlur = fs * 0.5;
    g.globalAlpha = 0.35;
    g.fillText(w.w, c.width / 2, c.height / 2);
    g.shadowBlur = 0;
    g.globalAlpha = 1;
    g.fillText(w.w, c.width / 2, c.height / 2);
    c.S = S;
    w.tw = tw / S; w.tH = fs * 1.4 / S;
    return c;
}

// 世界座標 ↔ 畫面座標（相對星雲左上角）：畫面點 = 中心 + p + 世界點 × z
// 畫面上真正用的縮放＝縮放 × 整片呼吸（第 1 級）
const _lhSpZv = () => _lhSp.z * (_lhSp.zb || 1);
const _lhSpScr = (x, y) => { const z = _lhSpZv(); return { x: _lhSp.W / 2 + _lhSp.px + x * z, y: _lhSp.H / 2 + _lhSp.py + y * z }; };
function _lhSpScreenOf(w) {   // 測試、按鈕定位用：詞在畫面上的位置（client 座標）
    const r = _lhSp.el.getBoundingClientRect(), p = _lhSpScr(w.px || 0, w.py || 0);
    return { x: r.left + p.x, y: r.top + p.y };
}

// 以畫面上 (cx, cy)（相對左上角，省略＝中心）為中心縮放；世界原點在畫面中心：畫面點 = 中心 + p + 世界點 × z
function _lhSpZoom(z, cx, cy) {
    const el = _lhSp.el;
    z = Math.min(LH_SP_ZMAX, Math.max(LH_SP_ZMIN, z));
    if (cx === undefined) { cx = el.clientWidth / 2; cy = el.clientHeight / 2; }
    const ox = el.clientWidth / 2, oy = el.clientHeight / 2;
    const wx = (cx - ox - _lhSp.px) / _lhSp.z, wy = (cy - oy - _lhSp.py) / _lhSp.z;
    _lhSp.z = z;
    _lhSp.zt = performance.now();
    _lhSp.px = cx - ox - wx * z;
    _lhSp.py = cy - oy - wy * z;
    _lhSp.nav = null;
    _lhSpApplyView();
}

// 導覽到某一團：0.6 秒緩緩平移過去（縮放不變）
function _lhSpGoTo(cl) {
    _lhSp.nav = { t0: performance.now(), fx: _lhSp.px, fy: _lhSp.py, tx: -cl.x * _lhSp.z, ty: -cl.y * _lhSp.z };
}

function _lhSpToWorld(x, y) {
    const r = _lhSp.el.getBoundingClientRect();
    const z = _lhSpZv();
    return { x: (x - r.left - r.width / 2 - _lhSp.px) / z, y: (y - r.top - r.height / 2 - _lhSp.py) / z };
}

// 詞現在的世界座標（不含開場散開）
function _lhSpPos(w) {
    if (w.free) return { x: w.fx, y: w.fy };
    if (w.comet) return { x: w.x, y: w.y };
    return _lhSpOrbit(w);
}

// 背景動畫與特效的等級（偏好設定 → 外觀，js/bgfx.js lhFxLevel；系統要求減少動態＝0：完全靜止）。
// 0.98.08 照 Andy 在「星雲效果分級表」（https://claude.ai/artifact/NUoEJt5851vJEZdNq814Mf）勾的：
// fps＝每秒畫幾格（0＝有變化才畫）；orbit＝軌道轉速倍率（0＝不轉）；jitter＝同一圈的隨機偏移（水彩感，打開時排版就決定）；
// wobble＝行星呼吸晃動；drift＝恆星飄移；push＝星系互斥；comet＝流星移動（走微彎的弧線）；tail＝流星尾巴；cometGlow＝流星加亮；
// drag：'stay'＝拖到哪就停在哪（拖恆星整團一起走）、'fling'＝甩出去再被拉回（拖恆星沖散整團）；
// dock＝黑洞放大；bold＝停住的詞變粗發光（外框照樣有）；keptGlow／keptFlash／keptBreathe＝保留的詞加柔光／閃＋光暈／呼吸（外框每級都有）；
// keptBreathe 的值＝保留的詞呼吸時放大多少（0.06＝6%）；starGlow＝恆星自帶光暈；lineGlow／lineFlash＝星座線光暈／隨機閃爍
// img＝星系一張圖（每個星系先畫成一張圖，每格只貼約 50 張）；clBreath＝整團呼吸；whole＝整片星雲一起呼吸；twinkle＝隨機星星閃爍
const LH_SP_LV = {
    0: { fps: 0, orbit: 0, drag: 'stay', bold: 1 },   // 系統要求減少動態：完全靜止，有變化才畫
    1: { fps: 24, orbit: 0, drag: 'stay', bold: 1, keptBreathe: 0.06, whole: 1 },   // 不轉，只有整片呼吸
    2: { fps: 24, orbit: 0, drag: 'stay', dock: 1, keptBreathe: 0.06, img: 1, clBreath: 1 },
    3: { fps: 30, orbit: 0.6, drag: 'fling', dock: 1, comet: 1, tail: 1, cometGlow: 1, keptGlow: 1, whole: 1 },   // 0.98.09：3、4 級加整片呼吸
    4: { fps: 40, orbit: 1, drag: 'fling', dock: 1, comet: 1, tail: 1, cometGlow: 1, jitter: 1, wobble: 1, drift: 1, push: 1, twinkle: 1, starGlow: 1, whole: 1, lineGlow: 1 },   // 0.98.09：保留的詞只有外框（不閃、不加柔光）
    5: { fps: 60, orbit: 1, drag: 'fling', dock: 1, comet: 1, tail: 1, cometGlow: 1, keptGlow: 1, keptBreathe: 0.025, jitter: 1, wobble: 1, drift: 1, push: 1, twinkle: 1, starGlow: 1, clBreath: 1, lineGlow: 1, lineFlash: 1 },   // 0.98.09：保留的詞不閃（閃爍留給隨機星星），只輕輕呼吸
};
const _lhSpCfg = () => LH_SP_LV[_lhSpReduce.matches ? 0 : (typeof lhFxLevel === 'function' ? lhFxLevel() : 5)] || LH_SP_LV[5];

// 點到哪個詞（client 座標）：上層（停住、釘住）先找；淡掉的、還沒浮現的不算。停住的詞往上多算一截，滑到它上面的按鈕不會掉
function _lhSpHit(cx, cy) {
    const p = _lhSpToWorld(cx, cy), z = _lhSp.z;
    const inside = w => {
        const m = w.mag || 1, hw = ((w.tw || 0) / 2 + 9 * w.s) * m, hh = (w.tH || 22 * w.s) / 2 * m;
        const up = w.hot || w.pinned || w === _lhSp.hover ? 26 / z : 0;   // 滑到隱藏鈕的路上不掉
        return Math.abs(p.x - w.px) <= hw && p.y - w.py <= hh && w.py - p.y <= hh + up;
    };
    // 黑洞放大會讓鄰居放大後蓋住游標下的詞：重疊時選中心離游標最近的那個（停住／釘住的優先）
    let best = null, bd = Infinity;
    for (const w of _lhSp.words) {
        if (!w.born || w.dim || !inside(w)) continue;
        const d = Math.hypot(p.x - w.px, p.y - w.py) - ((w.hot || w.pinned) ? 1e6 : 0);
        if (d < bd) { bd = d; best = w; }
    }
    return best;
}

// 分批浮現：照 _lhSp.queue 一團團畫小圖（每幀最多 40 張），一團畫好、離上一團至少 gap 毫秒就讓它出現。回傳還有沒有沒浮現的
function _lhSpReveal(t) {
    const q = _lhSp.queue;
    if (!q || !q.length) return false;
    const t1 = performance.now();   // 每幀最多花 6ms 畫小圖
    outer: for (const g of q) for (const w of g) {
        if (performance.now() - t1 > 6) break outer;
        if (!w.spr) w.spr = _lhSpSprite(w, _lhSp.S);
    }
    if (_lhSp.visible && q[0].every(w => w.spr) && t - _lhSp.bornAt >= _lhSp.gap) {
        for (const w of q.shift()) w.born = t;
        _lhSp.bornAt = t;
    }
    return true;
}

// 縮放停下來之後：照新縮放在背景把整批小圖畫好（每幀 30 張），全部好了一次換上。回傳還在畫
function _lhSpRescale(t) {
    const S = _lhSpBucket(_lhSp.z * (_lhSp.dpr || 1));
    if (S === _lhSp.S) return false;
    // 手還在拖、平移、捏：先不畫（不跟手搶時間）；每幀最多花 4ms 畫小圖，畫不完下一幀接著畫
    if (t - (_lhSp.zt || 0) < 160 || _lhSp.pts.size) return true;
    const t1 = performance.now();
    let done = true;
    for (const w of _lhSp.words) {
        if (w.nspr && w.nspr.S === S) continue;
        if (performance.now() - t1 > 4) { done = false; break; }
        w.nspr = _lhSpSprite(w, S);
    }
    if (!done) return true;
    for (const w of _lhSp.words) { w.spr = w.nspr; w.nspr = null; }
    _lhSp.S = S;
    _lhSp.dirty = true;
    return false;
}

function _lhSpFrame(t) {
    _lhSp.raf = requestAnimationFrame(_lhSpFrame);
    const L = _lhSpCfg();
    // 省電：照等級限制每秒畫幾次；第 1、2 級沒變化就完全不畫
    if (L.fps ? t - (_lhSp.lastDraw || 0) < 1000 / L.fps - 4 : !_lhSp.dirty && !_lhSp.busy) return;
    _lhSp.lastDraw = t;
    _lhSp.dirty = false;
    const dt = _lhSp.last ? Math.min((t - _lhSp.last) / 1000, 0.05) : 0;
    _lhSp.last = t;
    let busy = _lhSpReveal(t);
    if (_lhSp.visible && _lhSpRescale(t)) busy = true;
    if (_lhSp.nav) {   // 導覽：緩出
        const k = Math.min(1, (t - _lhSp.nav.t0) / 600), e = 1 - Math.pow(1 - k, 3);
        _lhSp.px = _lhSp.nav.fx + (_lhSp.nav.tx - _lhSp.nav.fx) * e;
        _lhSp.py = _lhSp.nav.fy + (_lhSp.nav.ty - _lhSp.nav.fy) * e;
        _lhSpApplyView();
        if (k >= 1) _lhSp.nav = null;
        busy = true;
    }
    const T = (t - _lhSp.t0) / 1000;
    // 恆星在自己的範圍裡慢慢飄（被拖著的那團跟著恆星走）
    if (L.drift) for (const cl of _lhSp.groups) if (!cl.held) { cl.x = cl.hx + _lhSpDx(cl, T); cl.y = cl.hy + _lhSpDy(cl, T); }
    // 兩團靠太近：慢慢互相推開（約 12 秒推到位）；被拖著的那團不動，另一團讓開
    if (L.push && dt) {
        const G = _lhSp.groups, kp = 1 - Math.exp(-dt / 4);
        for (let i = 0; i < G.length; i++) for (let j = i + 1; j < G.length; j++) {
            const a = G[i], b = G[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
            const over = a.r + b.r + 30 - d;
            if (over <= 0 || (a.held && b.held)) continue;
            const m = over * kp, ux = dx / d, uy = dy / d, fa = a.held ? 0 : b.held ? 1 : 0.5, fb = 1 - fa;
            a.hx -= ux * m * fa; a.hy -= uy * m * fa; b.hx += ux * m * fb; b.hy += uy * m * fb;
            if (!a.held) { a.x -= ux * m * fa; a.y -= uy * m * fa; }
            if (!b.held) { b.x += ux * m * fb; b.y += uy * m * fb; }
        }
    }
    const fr = Math.exp(-dt * 2.2), damp = Math.exp(-dt * 0.53), K = 0.155, B = _lhSp.bound, drag = _lhSp.drag && _lhSp.drag.w;
    // 黑洞放大：游標附近 240px 內的詞依距離放大，最近的約 2.3 倍，放大縮小都是緩動
    const dock = L.dock, mk = 1 - Math.exp(-dt * 14), mouse = _lhSp.mouse, TAU = Math.PI * 2;
    // 整片星雲一起呼吸（第 1 級）：畫面縮放跟著輕輕放大縮小，6 秒一輪
    _lhSp.zb = L.whole ? 1 + 0.012 * Math.sin(T * TAU / 6) : 1;
    // 整團呼吸（第 2 級）：每個星系照自己的節奏（4～7 秒一輪）輕輕放大縮小
    for (const cl of _lhSp.groups) cl.b = L.clBreath ? 1 + 0.03 * Math.sin(T * TAU / cl.bp + cl.ph[0]) : 1;
    for (const w of _lhSp.words) {
        const still = w.hot || w.pinned || (w.comet ? !L.comet : !L.orbit);   // 停在詞上、釘住、這一級不動的：定格
        if (w === drag) { if (w.star && w.free) { w.cl.x = w.fx; w.cl.y = w.fy; } }   // 按著還沒拖動（free 還沒開）不動整團
        else if (w.free) {
            if (w.comet || w.star) {   // 流星、恆星甩出去：照速度滑，摩擦慢慢停
                w.fx += w.fvx * dt; w.fy += w.fvy * dt;
                w.fvx *= fr; w.fvy *= fr;
                if (w.star) { w.cl.x = w.fx; w.cl.y = w.fy; }
                if (Math.hypot(w.fvx, w.fvy) < 6) _lhSpSettle(w, L, T);
            } else {   // 行星被甩出去或被沖散：自己的恆星像彈簧一樣慢慢把它拉回軌道
                if (!still) w.th += w.om * L.orbit * dt;
                const o = _lhSpOrbit(w);
                w.fvx = (w.fvx + (o.x - w.fx) * K * dt) * damp;
                w.fvy = (w.fvy + (o.y - w.fy) * K * dt) * damp;
                w.fx += w.fvx * dt; w.fy += w.fvy * dt;
                const tol = w.rising ? 10 : 3;   // 接任的恆星：差不多到中心就接手，不必等完全停穩
                if (Math.hypot(o.x - w.fx, o.y - w.fy) < tol && Math.hypot(w.fvx, w.fvy) < tol * 5) { w.free = false; if (w.rising) { w.rising = false; w.star = true; } if (w.cl) w.cl.ver++; }
            }
            busy = true;
        } else if (!still) {
            if (w.comet) {   // 流星走弧線：前進方向慢慢轉（尾巴照前進方向畫，不用記走過的點）
                w.ang += w.cv * dt;
                w.x += Math.cos(w.ang) * w.v * dt; w.y += Math.sin(w.ang) * w.v * dt;
                let wrap = false;
                if (w.x > B) { w.x = -B; wrap = true; } else if (w.x < -B) { w.x = B; wrap = true; }
                if (w.y > B) { w.y = -B; wrap = true; } else if (w.y < -B) { w.y = B; wrap = true; }
            } else if (!w.star) {
                w.th += w.om * L.orbit * dt;
                if (L.wobble) {   // 行星呼吸晃動（第 4、5 級），每個詞幅度不同（水彩的毛邊）
                    w.wob += dt;
                    const br = w.br || 2.5;
                    w.sx = Math.sin(w.wob * 0.7) * br; w.sy = Math.cos(w.wob * 0.55) * br;
                } else w.sx = w.sy = 0;
            }
        }
        const p = _lhSpPos(w);
        // 浮現：從自己那團的中心散開到位置（0.9 秒緩出）
        const k = w.born ? Math.min(1, (t - w.born) / 900) : 0, ease = 1 - Math.pow(1 - k, 3);
        if (k < 1 && w.born) busy = true;
        const ox = w.cl && !w.star ? w.cl.x : p.x, oy = w.cl && !w.star ? w.cl.y : p.y;
        w.ux = ox + (p.x - ox) * ease; w.uy = oy + (p.y - oy) * ease;   // 還沒乘上整團呼吸的位置（星系一張圖照這個畫）
        const b = w.cl && !w.comet ? w.cl.b : 1;
        w.px = w.cl && !w.comet ? w.cl.x + (w.ux - w.cl.x) * b : w.ux;
        w.py = w.cl && !w.comet ? w.cl.y + (w.uy - w.cl.y) * b : w.uy;
        w.alpha = Math.min(1, k * 1.6);
        // 保留的詞呼吸（第 1、2 級）：3 秒一輪輕輕放大縮小
        w.kb = L.keptBreathe && w.kept && !w.dim ? 1 + L.keptBreathe * Math.sin(t / 3000 * TAU + w.wob) : 1;
        // 隨機星星閃爍（第 4、5 級）：每秒大約 5 顆；越常用越容易被選到，但最多只多 15%；亮起來時跟著放大一點點
        if (L.twinkle && w.born && !w.dim && dt) {
            if (w.twk && t - w.twk > 1400) w.twk = 0;
            if (!w.twk && Math.random() < dt * 0.015 * (1 + 0.15 * (w.n || 0))) w.twk = t;   // 0.98.09：機率 0.006→0.015
        } else if (!L.twinkle) w.twk = 0;
        if (dock) {
            let goal = 1;
            if (mouse && w.born && !w.dim) {
                const s = _lhSpScr(w.px, w.py), d = Math.hypot(s.x - mouse.x, s.y - mouse.y);
                if (d < 240) goal = 1 + 1.3 * Math.pow(1 - d / 240, 2) * (w.star ? 0.2 : Math.min(1, Math.max(0.2, (2.2 - w.s) / 1.4)));   // 0.98.09：小字照舊放大，大字少放、恆星幾乎不放
            }
            w.mag += (goal - w.mag) * (dt ? mk : 1);
            if (Math.abs(goal - w.mag) > 0.004) busy = true; else w.mag = goal;
        } else w.mag = 1;
    }
    if (_lhSp.drag) busy = true;
    _lhSp.busy = busy;
    // 星座：釘住的詞之間的線（_lhSpPin 決定連哪些）
    _lhSp.segs = _lhSp.chords.filter(c => c[0].pinned && c[1].pinned);
    _lhSpDraw(t, L);
}

// 星系一張圖（第 2 級）：把這一團沒保留、沒釘住的詞先畫進一張圖，之後每一格整張貼上去（約 50 張，不是 800 個詞）。
// 內容變了（cl.ver：隱藏、保留、拖動、常用度篩選）或縮放換了一級才重畫；圖太大（放很大時）就不用，回到一詞一圖
function _lhSpClImg(cl) {
    const S = _lhSp.S, key = cl.ver + '|' + S;
    if (cl.imgKey === key) return cl.img;
    cl.imgKey = key; cl.img = null;
    const ws = _lhSp.words.filter(w => w.cl === cl && !w.comet && !w.kept && !w.pinned && w.spr);
    if (!ws.length) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const w of ws) {
        const hw = w.spr.width / w.spr.S / 2, hh = w.spr.height / w.spr.S / 2, x = w.ux - cl.x, y = w.uy - cl.y;
        x0 = Math.min(x0, x - hw); x1 = Math.max(x1, x + hw); y0 = Math.min(y0, y - hh); y1 = Math.max(y1, y + hh);
    }
    const cw = Math.ceil((x1 - x0) * S), ch = Math.ceil((y1 - y0) * S);
    if (cw > 2048 || ch > 2048) return null;   // ponytail: 太大就不做成圖（記憶體），放大時自然回到一詞一圖
    const c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    const g = c.getContext('2d');
    for (const w of ws) {
        const sw = w.spr.width / w.spr.S * S, sh = w.spr.height / w.spr.S * S;
        g.globalAlpha = w.dim ? 0.06 : 1;
        g.drawImage(w.spr, (w.ux - cl.x - x0) * S - sw / 2, (w.uy - cl.y - y0) * S - sh / 2, sw, sh);
    }
    return (cl.img = { c, x0, y0, S, ws: new Set(ws) });
}

// 每一幀畫一次：星座線 → 星系圖（第 2 級）→ 流星尾巴 → 一般的詞 → 已保留的詞 → 放大中的詞 → 停住／釘住的詞（外框、光暈、在最上層）
function _lhSpDraw(t, L) {
    const c = _lhSp.ctx, z = _lhSpZv(), dpr = _lhSp.dpr || 1;
    if (!c || !_lhSp.W || !_lhSp.visible) return;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, _lhSp.W, _lhSp.H);
    const vis = w => { const p = _lhSpScr(w.px, w.py); return p.x > -200 && p.x < _lhSp.W + 200 && p.y > -80 && p.y < _lhSp.H + 80 ? p : null; };
    const pill = (p, w, m) => {   // 詞外面的膠囊（畫面座標）
        const fs = 16 * w.s * z * m, hw = w.tw * z * m / 2 + fs * 0.55, hh = fs * 0.85;
        c.beginPath();
        if (c.roundRect) c.roundRect(p.x - hw, p.y - hh, hw * 2, hh * 2, hh); else c.rect(p.x - hw, p.y - hh, hw * 2, hh * 2);
    };
    const blit = (w, p, m = 1) => { const sw = w.spr.width / w.spr.S * z * m, sh = w.spr.height / w.spr.S * z * m; c.drawImage(w.spr, p.x - sw / 2, p.y - sh / 2, sw, sh); };
    // 星座線
    if (_lhSp.segs.length) {
        c.save();
        c.strokeStyle = _lhSp.cLine; c.lineWidth = 1.5; c.lineJoin = 'round'; c.globalAlpha = 0.85;
        c.shadowColor = _lhSp.cLine; c.shadowBlur = 6;
        c.beginPath();
        for (const [a, b] of _lhSp.segs) { const p = _lhSpScr(a.px, a.py), q = _lhSpScr(b.px, b.py); c.moveTo(p.x, p.y); c.lineTo(q.x, q.y); }
        c.stroke();
        if (L.lineGlow) {   // 0.98.09：第 4 級起星座線加光暈（底下再描兩層粗、淡的線，不用 shadowBlur 比較省）
            c.shadowBlur = 0;
            c.globalAlpha = 0.22; c.lineWidth = 4; c.stroke();
            c.globalAlpha = 0.1; c.lineWidth = 9; c.stroke();
        }
        if (L.lineFlash) {   // 第 5 級：每條線各自偶爾閃一下（1.2 秒，每條每秒約 15% 機率），跟星星閃爍同一種感覺
            const dt = Math.min(0.2, (t - (_lhSp.lineT || t)) / 1000);
            _lhSp.lineT = t;
            c.lineCap = 'round';
            for (const sg of _lhSp.segs) {
                if (sg.tw && t - sg.tw > 1200) sg.tw = 0;
                if (!sg.tw && Math.random() < dt * 0.15) sg.tw = t;
                if (!sg.tw) continue;
                const f = Math.sin((t - sg.tw) / 1200 * Math.PI), p = _lhSpScr(sg[0].px, sg[0].py), q = _lhSpScr(sg[1].px, sg[1].py);
                c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(q.x, q.y);
                c.globalAlpha = 0.5 * f; c.lineWidth = 3; c.stroke();
                c.globalAlpha = 0.2 * f; c.lineWidth = 12; c.stroke();
            }
        }
        c.restore();
    }
    // 星系一張圖：有詞正在動（停住、放大、拖著、還在浮現）的那一團，這一格改回一個個詞畫
    const asImg = new Set();
    if (L.img) {
        const live = new Set(), drag = _lhSp.drag && _lhSp.drag.w;
        for (const w of _lhSp.words) if (w.cl && (!w.born || t - w.born < 900 || w.hot || w.free || w === drag || w.mag > 1.01)) live.add(w.cl);
        for (const cl of _lhSp.groups) {
            if (live.has(cl)) continue;
            const im = _lhSpClImg(cl);
            if (!im) continue;
            asImg.add(cl);
            const o = _lhSpScr(cl.x, cl.y), k = z * cl.b / im.S;
            const x = o.x + im.x0 * z * cl.b, y = o.y + im.y0 * z * cl.b, wd = im.c.width * k, ht = im.c.height * k;
            if (x > _lhSp.W || y > _lhSp.H || x + wd < 0 || y + ht < 0) continue;
            c.drawImage(im.c, x, y, wd, ht);
        }
    }
    const top = [], mags = [];
    for (const w of _lhSp.words) {
        if (!w.born || !w.spr) continue;
        if (w.cl && asImg.has(w.cl) && w.cl.img.ws.has(w)) continue;   // 已經在星系圖裡
        const p = vis(w);
        if (!p) continue;
        if (w.star && L.starGlow && !w.dim) {   // 0.98.09：第 4 級起恆星自帶光暈；放大、釘住、停住時也畫（先畫，墊在所有字後面）
            const R = (w.cl ? w.cl.r / 3 : w.tw) * _lhSpZv() * (w.kb || 1) * (w.mag || 1);   // 光暈半徑＝自己星系半徑的 1/3
            const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, R);
            g.addColorStop(0, w.rgbG || (w.rgbG = _lhSpRGBA(w.rgb, 0.2)));
            g.addColorStop(1, w.rgb0 || (w.rgb0 = _lhSpRGBA(w.rgb, 0)));
            c.globalAlpha = w.alpha; c.fillStyle = g; c.fillRect(p.x - R, p.y - R, R * 2, R * 2);
        }
        if (w.comet && !w.dim && L.tail) {   // 流星尾巴：一整條往後漸細、漸淡的光（連續漸層，不分段），長度＝約 1.6 秒走的路；放大、釘住時也畫（先畫，墊在字後面）
            const z = _lhSpZv(), k = w.v * 1.6 * z, ex = p.x - Math.cos(w.ang) * k, ey = p.y - Math.sin(w.ang) * k;
            if (k > 4) {
                const nx = Math.sin(w.ang) * 1.8, ny = -Math.cos(w.ang) * 1.8;   // 頭端半寬 1.8px
                const g = c.createLinearGradient(p.x, p.y, ex, ey);
                g.addColorStop(0, w.rgb); g.addColorStop(1, w.rgb0 || (w.rgb0 = _lhSpRGBA(w.rgb, 0)));
                c.save(); c.globalAlpha = w.alpha * 0.75; c.fillStyle = g;
                c.beginPath(); c.moveTo(p.x + nx, p.y + ny); c.lineTo(ex, ey); c.lineTo(p.x - nx, p.y - ny); c.closePath(); c.fill();
                c.restore();
            }
        }
        if (w.pinned || w.hot) { top.push([w, p]); continue; }
        if (w.mag > 1.01) { mags.push([w, p]); continue; }   // 放大中的詞晚點畫，蓋在旁邊的詞上面
        const a = w.alpha * (w.dim ? 0.06 : 1);
        const tw = w.twk ? Math.sin(Math.min(1, (t - w.twk) / 1400) * Math.PI) : 0;   // 星星閃爍的亮度（0→1→0）
        const m = (w.kb || 1) * (1 + 0.1 * tw);
        c.globalAlpha = a;
        blit(w, p, m);
        if ((w.comet && L.cometGlow || tw) && !w.dim) {   // 流星加亮、星星閃爍：同一張小圖用發光疊加再貼一次
            c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = a * (tw ? tw : 0.55); blit(w, p, m); if (tw) { c.globalAlpha = a * 0.7 * tw; blit(w, p, m); } c.restore();   // 星星閃爍疊兩次，比較亮
        }
        if (w.kept && !w.dim) _lhSpKept(c, w, p, a, t, L, pill, blit, m);
    }
    c.globalAlpha = 1;
    for (const [w, p] of mags) {
        const m = w.mag * (w.kb || 1);
        c.globalAlpha = w.alpha * (w.dim ? 0.06 : 1);
        blit(w, p, m);
        if (w.kept && !w.dim) _lhSpKept(c, w, p, 1, t, L, pill, blit, m);
    }
    c.globalAlpha = 1;
    // 停住／釘住：半透明底＋外框＋光暈的膠囊，字在上面；第 1 級停住的字再變粗、發光
    for (const [w, p] of top) {
        const m = (w.mag || 1) * (w.kb || 1);
        c.save();
        pill(p, w, m);
        c.shadowColor = w.rgb; c.shadowBlur = 20;
        c.globalAlpha = 0.8; c.fillStyle = _lhSp.cCard; c.fill();
        c.shadowBlur = 0; c.globalAlpha = 1; c.strokeStyle = w.rgb; c.lineWidth = 1.5; c.stroke();
        c.restore();
        if (L.bold && !w.pinned) {
            const fs = 16 * w.s * z * m;
            c.save();
            c.font = '700 ' + fs + 'px ' + _lhSp.font;
            c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillStyle = w.rgb; c.shadowColor = w.rgb; c.shadowBlur = fs * 0.8;
            c.fillText(w.w, p.x, p.y);
            c.shadowBlur = 0;
            c.fillText(w.w, p.x, p.y);
            c.restore();
        } else blit(w, p, m);
    }
    _lhSpActsPlace();
}

// 已保留的詞：每級都有外框；第 3 級起加柔光；第 4、5 級再閃（1.2 秒一次）＋光暈
function _lhSpKept(c, w, p, a, t, L, pill, blit, m) {
    c.save();
    pill(p, w, m);
    c.globalAlpha = a * 0.75; c.strokeStyle = w.rgb; c.lineWidth = 1.2; c.stroke();
    c.globalCompositeOperation = 'lighter';
    if (L.keptGlow) { c.globalAlpha = a * 0.35; blit(w, p, m); }
    if (L.keptFlash) {
        c.globalAlpha = a * 0.45 * (1 - Math.cos(t / 1200 * Math.PI * 2));
        c.shadowColor = w.rgb; c.shadowBlur = 14 * w.s * _lhSpZv();
        blit(w, p, m);
    }
    c.restore();
}

// 隱藏鈕（槓掉的眼睛）：浮在「游標停住的詞」（觸控：最後點的那個釘住的詞）右上角，跟著詞移動
function _lhSpActsPlace() {
    const a = _lhSp.acts, w = _lhSp.hover ? _lhSp.hover : (_lhSp.act && _lhSp.act.pinned ? _lhSp.act : null);
    if (!w || _lhSp.drag && _lhSp.drag.moved || !_lhSp.words.includes(w)) { if (!a.hidden) a.hidden = true; return; }
    const z = _lhSpZv(), m = (w.mag || 1) * (w.kb || 1), p = _lhSpScr(w.px, w.py), fs = 16 * w.s * z * m, hw = w.tw * z * m / 2 + fs * 0.55, hh = fs * 0.85;
    a.hidden = false;
    a.style.transform = 'translate(' + p.x.toFixed(1) + 'px,' + (p.y - hh + 6).toFixed(1) + 'px)';
    a.lastChild.style.left = (hw - 8) + 'px';
    if (a.dataset.w !== w.w) {
        a.dataset.w = w.w;
        a.lastChild.setAttribute('aria-label', '隱藏「' + w.w + '」');
        a.lastChild.title = '隱藏「' + w.w + '」';
    }
}

// 詞停下來（甩完、或「拖到哪停在哪」放手）：流星從這裡接著飛；恆星：這裡就是這團新的家；
// 行星：照放手的位置換一條新軌道（離恆星多遠、在哪個角度），之後照常繞
function _lhSpSettle(w, L, T) {
    w.free = false;
    if (w.comet) { w.x = w.fx; w.y = w.fy; return; }
    const cl = w.cl;
    if (w.star) {
        _lhSpDrift(Object.assign(cl, { hx: w.fx, hy: w.fy }), _lhSp.groups);
        cl.hx = w.fx - (L.drift ? _lhSpDx(cl, T) : 0); cl.hy = w.fy - (L.drift ? _lhSpDy(cl, T) : 0); cl.held = false;
        cl.x = w.fx; cl.y = w.fy;
    } else {
        const dx = w.fx - cl.x, dy = w.fy - cl.y, ct = Math.cos(w.tilt), st = Math.sin(w.tilt);
        const c = dx * ct + dy * st, sn = (-dx * st + dy * ct) / (w.ecc || 1);
        w.r = Math.hypot(c, sn); w.th = Math.atan2(sn, c); w.sx = w.sy = 0;
    }
    cl.ver++;
}

// 恆星被隱藏：這一團剩下最常用的詞慢慢飄到中心接任恆星（到位才算恆星，拖它才會帶走整團）
function _lhSpPromote(cl) {
    const next = _lhSp.words.filter(x => x.cl === cl && !x.comet && !x.star).sort((a, b) => b.p - a.p)[0];
    if (!next) return;
    const at = _lhSpPos(next);
    Object.assign(next, { r: 0, ecc: 1, tilt: 0, om: 0, sx: 0, sy: 0, rising: true });
    if (!next.free) Object.assign(next, { free: true, fx: at.x, fy: at.y, fvx: 0, fvy: 0 });
}

// 釘住／放開之後整理星座（線都存在 _lhSp.chords）：第 2 點連第 1 點；第 3 點連前兩點（三角形）；
// 第 4 點起，新的點連 1～3 個舊點，越近的點越容易被選到（機率 ∝ 1／距離²）；和現有的線夾角小於 2° 的不連
function _lhSpPin(w) {
    _lhSp.pins = _lhSp.pins.filter(x => x !== w);
    _lhSp.chords = _lhSp.chords.filter(c => c[0] !== w && c[1] !== w);
    const pt = x => ({ x: x.px || 0, y: x.py || 0 }), dist = (a, b) => Math.hypot(pt(a).x - pt(b).x, pt(a).y - pt(b).y) || 1;
    if (!w.pinned) {   // 拿掉一個點：因此落單的點，就近連一個
        for (const o of _lhSp.pins) if (_lhSp.pins.length > 1 && !_lhSp.chords.some(c => c[0] === o || c[1] === o)) {
            const near = _lhSp.pins.filter(x => x !== o).sort((a, b) => dist(o, a) - dist(o, b))[0];
            _lhSp.chords.push([o, near]);
        }
        return;
    }
    const old = _lhSp.pins.slice();
    _lhSp.pins.push(w);
    if (old.length <= 2) { for (const o of old) _lhSp.chords.push([w, o]); return; }
    const ang = (a, b) => Math.atan2(pt(b).y - pt(a).y, pt(b).x - pt(a).x);
    const tooClose = (a1, a2) => { let d = Math.abs(a1 - a2) % Math.PI; d = Math.min(d, Math.PI - d); return d < Math.PI / 90; };
    const r = Math.random(), want = r < 0.5 ? 1 : r < 0.91 ? 2 : 3;   // 0.98.09：Andy 給 55/45/10（加起來 110），等比例換成 一條 50%、兩條 41%、三條 9%
    let pool = old.slice();
    for (let n = 0; n < want && pool.length; n++) {
        const wt = pool.map(o => 1 / Math.pow(dist(w, o), 2)), sum = wt.reduce((a, b) => a + b, 0);
        let x = Math.random() * sum, k = 0;
        while (k < pool.length - 1 && (x -= wt[k]) > 0) k++;
        const o = pool[k];
        pool.splice(k, 1);
        const a = ang(w, o);
        if (_lhSp.chords.some(([p, q]) => tooClose(a, ang(p, q)))) { n--; continue; }
        _lhSp.chords.push([w, o]);
    }
    if (!_lhSp.chords.some(c => c[0] === w)) _lhSp.chords.push([w, old.sort((a, b) => dist(w, a) - dist(w, b))[0]]);   // 至少一條
}

function _lhSpClear() {
    for (const w of _lhSp.words) { w.pinned = false; w.hot = false; }
    for (const cl of _lhSp.groups) cl.ver++;
    _lhSp.pins = []; _lhSp.chords = []; _lhSp.act = null;
    _lhSp.dirty = true;
    _lhSpClearSync();
}
// 取消選取（面板按鈕）：第一下變「確定取消 N 個？」，4 秒或點別的地方就恢復；第二下才取消，選過的詞也一起取消保留
function _lhSpClearSync() {
    const b = _lhSp.el && _lhSp.el.querySelector('.ws-clear');
    if (!b) return;
    clearTimeout(_lhSp.clrArm); _lhSp.clrArm = 0;
    document.removeEventListener('pointerdown', _lhSpClearOut, true);
    b.classList.remove('armed');
    b.textContent = '取消選取';
    b.hidden = !_lhSp.pins.length;
}
function _lhSpClearOut(e) { if (!e.target.closest('.ws-clear')) _lhSpClearSync(); }
function _lhSpClearAsk() {
    const b = _lhSp.el.querySelector('.ws-clear'), ps = _lhSp.pins.filter(w => w.pinned);
    if (!ps.length) return;
    if (!_lhSp.clrArm) {
        b.classList.add('armed');
        b.textContent = '確定取消 ' + ps.length + ' 個？';
        _lhSp.clrArm = setTimeout(_lhSpClearSync, 4000);
        document.addEventListener('pointerdown', _lhSpClearOut, true);
        return;
    }
    for (const w of ps) if (w.kept) { removeSavedWord(w.w); w.kept = false; }
    _lhSpClear();
}

function _lhSpSetHover(w) {
    const h = _lhSp.hover;
    if (h === w) return;
    if (h && !(_lhSp.drag && _lhSp.drag.w === h)) h.hot = false;
    _lhSp.hover = w;
    _lhSp.dirty = true;
    _lhSp.el.classList.toggle('on-word', !!w);
}

function _lhSpEvents(el) {
    // 隱藏（浮在詞右上角的真按鈕）
    _lhSp.acts.addEventListener('click', e => {
        const w = _lhSp.words.find(x => x.w === _lhSp.acts.dataset.w);
        if (!w) return;
        _lhSp.dirty = true;
        if (e.target.closest('.ws-hide')) {
            _lhWs.hidden.add(w.w);
            _lhSp.words = _lhSp.words.filter(x => x !== w);
            if (w.cl) w.cl.ver++;
            w.pinned = false;
            _lhSpPin(w);   // 釘住的詞被隱藏：從星座拿掉，前後兩個點直接接起來，和它有關的對角線一起拿掉；之後再釘的照常接在最後
            if (w.star) _lhSpPromote(w.cl);
            if (_lhSp.hover === w) _lhSpSetHover(null);
            if (_lhSp.act === w) _lhSp.act = null;
            _lhSpClearSync();
        }
    });
    el.addEventListener('wheel', e => {
        if (e.target.closest('.ws-panel')) return;
        e.preventDefault();
        const r = el.getBoundingClientRect();
        _lhSpZoom(_lhSp.z * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    // 滑鼠停在詞上：定格＋外框光暈＋浮出 📌 ✕；剛取消釘選的詞要等游標離開再回來才會再亮（不然看起來像沒取消）
    el.addEventListener('pointermove', e => {
        if (e.pointerType === 'mouse' && _lhSpCfg().dock) {   // 黑洞放大要知道游標在哪
            const r = el.getBoundingClientRect();
            _lhSp.mouse = e.target.closest('.ws-panel, .ws-zoom') ? null : { x: e.clientX - r.left, y: e.clientY - r.top };
            _lhSp.dirty = true;
        }
        if (e.pointerType !== 'mouse' || _lhSp.pts.size || e.target.closest('.ws-panel, .ws-zoom')) return;
        if (e.target.closest('.ws-acts')) return;
        let w = _lhSpHit(e.clientX, e.clientY);
        if (_lhSp.mute && w !== _lhSp.mute) _lhSp.mute = null;
        if (w && w === _lhSp.mute) w = null;
        _lhSpSetHover(w);
    });
    el.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { _lhSp.mouse = null; _lhSp.dirty = true; if (!_lhSp.drag) _lhSpSetHover(null); } });
    el.addEventListener('pointerdown', e => {
        if (e.target.closest('.ws-panel, .ws-zoom, .ws-acts')) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        _lhSp.nav = null;
        _lhSp.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (_lhSp.pts.size === 2) {   // 第二根手指：放棄拖曳／平移，改成以兩指中點為中心縮放
            _lhSp.drag = null; _lhSp.pan = null;
            const [a, b] = [..._lhSp.pts.values()], r = el.getBoundingClientRect();
            _lhSp.pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: _lhSp.z, mx: (a.x + b.x) / 2 - r.left, my: (a.y + b.y) / 2 - r.top };
            return;
        }
        if (_lhSp.pts.size > 2) return;
        try { el.setPointerCapture(e.pointerId); } catch (err) { lhWarn('setPointerCapture 失敗', err); }
        const w = _lhSpHit(e.clientX, e.clientY);
        if (w) {
            const p = _lhSpToWorld(e.clientX, e.clientY), at = _lhSpPos(w);
            _lhSp.drag = { w, id: e.pointerId, sx: e.clientX, sy: e.clientY, gx: p.x - at.x, gy: p.y - at.y, moved: false, hist: [] };
        } else _lhSp.pan = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false };
    });
    el.addEventListener('pointermove', e => {
        if (!_lhSp.pts.has(e.pointerId)) return;
        _lhSp.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (_lhSp.pinch && _lhSp.pts.size >= 2) {
            const [a, b] = [..._lhSp.pts.values()];
            _lhSpZoom(_lhSp.pinch.z0 * Math.hypot(a.x - b.x, a.y - b.y) / _lhSp.pinch.d0, _lhSp.pinch.mx, _lhSp.pinch.my);
            return;
        }
        const d = _lhSp.drag;
        if (d && d.id === e.pointerId) {
            if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 5) return;
            const L = _lhSpCfg();
            if (!d.moved) {
                d.moved = true; d.w.hot = true; d.w.free = true; d.w.fvx = d.w.fvy = 0;
                el.classList.add('panning');
                if (d.w.star && L.drag === 'stay') d.w.cl.held = true;   // 第 1、2 級：整團跟著恆星走，不沖散
                else if (d.w.star) {   // 拖恆星：整團被沖散、跟著拖走，之後再慢慢聚回來
                    d.w.cl.held = true;
                    for (const o of _lhSp.words) {
                        if (o.cl !== d.w.cl || o === d.w || o.pinned) continue;
                        const at = _lhSpPos(o), a = Math.random() * Math.PI * 2, v = 120 + Math.random() * 220;
                        if (!o.free) { o.fx = at.x; o.fy = at.y; o.fvx = 0; o.fvy = 0; o.free = true; }
                        o.fvx += Math.cos(a) * v; o.fvy += Math.sin(a) * v;
                    }
                }
            }
            const p = _lhSpToWorld(e.clientX, e.clientY);
            d.w.fx = p.x - d.gx; d.w.fy = p.y - d.gy;
            d.hist.push({ t: e.timeStamp, x: p.x, y: p.y });
            if (d.hist.length > 6) d.hist.shift();
            return;
        }
        const p = _lhSp.pan;
        if (p && p.id === e.pointerId) {
            p.moved = p.moved || Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 5;
            _lhSp.px += e.clientX - p.x; _lhSp.py += e.clientY - p.y;
            p.x = e.clientX; p.y = e.clientY;
            if (p.moved) el.classList.add('panning');
            _lhSpApplyView();
        }
    });
    const end = e => {
        if (!_lhSp.pts.delete(e.pointerId)) return;
        if (_lhSp.pts.size < 2) _lhSp.pinch = null;
        el.classList.remove('panning');
        const d = _lhSp.drag;
        if (d && d.id === e.pointerId) {
            _lhSp.drag = null;
            _lhSp.dirty = true;
            const L = _lhSpCfg();
            if (d.moved && L.drag === 'stay') {   // 第 1、2 級：拖到哪就停在哪（行星換一條新軌道、恆星帶著整團搬家）
                _lhSpSettle(d.w, L, (performance.now() - _lhSp.t0) / 1000);
                if (!d.w.pinned) d.w.hot = false;   // 0.98.09：游標停在詞上不再定格，放手就恢復
            } else if (d.moved) {
                // 甩動：用最後一小段的速度（世界座標／秒）繼續滑，摩擦慢慢停下
                const h = d.hist, a = h[0], b = h[h.length - 1];
                const dt = b && a && b.t > a.t ? (b.t - a.t) / 1000 : 0;
                if (dt > 0 && e.timeStamp - b.t < 80) {
                    const vmax = 2400;
                    d.w.fvx = Math.max(-vmax, Math.min(vmax, (b.x - a.x) / dt));
                    d.w.fvy = Math.max(-vmax, Math.min(vmax, (b.y - a.y) / dt));
                }
                if (!d.w.pinned) d.w.hot = false;   // 0.98.09：游標停在詞上不再定格，放手就恢復
            } else if (e.type === 'pointerup') {   // 單擊：釘住＋保留；再點一次釘住的詞＝取消釘選＋取消保留
                d.w.pinned = !d.w.pinned;
                if (d.w.cl) d.w.cl.ver++;
                _lhSpPin(d.w);
                _lhSpClearSync();
                if (d.w.pinned) { _lhSp.act = d.w; if (!d.w.kept) { saveWord(d.w.w); d.w.kept = true; } }
                else {
                    if (d.w.kept) { removeSavedWord(d.w.w); d.w.kept = false; }
                    if (_lhSp.act === d.w) _lhSp.act = null;
                    if (_lhSp.hover === d.w) _lhSpSetHover(null);
                    d.w.hot = false;
                    _lhSp.mute = d.w;   // 游標還停在上面：先別亮，離開再回來才亮
                }
            }
        }
        if (_lhSp.pan && _lhSp.pan.id === e.pointerId) {
            _lhSp.pan = null;
        }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
}
