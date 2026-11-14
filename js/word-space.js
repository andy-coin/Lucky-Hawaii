// ==================== 詞卡（多字直接查雙押）與詞宇宙 ====================
// 搜尋欄打「安打」（2–6 個字、中間沒有空白）＝查整個詞的韻：列出詞庫裡符合的詞（詞卡）。選項列換成同母音／同子音／同讀音＋同聲調、排除借韻。
// 打「安 打」（有空白）照舊是兩個字各自的單字韻（js/search.js）。displayResults（js/results.js）一開始就問 lhWsRender，
// 所以換主題、勾選項等所有重畫的路徑都會走到這裡。
// 「顯示全部」：三塊面板往左、上、右收走，所有詞攤在整個畫面上（介面上不說「宇宙」，視覺上是星雲）：
// 同一種聲調組合聚成一團，最常用的詞在中心（恆星），其他詞依常用度一圈圈繞著它轉（行星）；很孤立的詞像流星一樣長距離穿過。
// 停在詞上＝定格＋光暈＋淡淡的 📌（保留）✕（隱藏）；單擊＝釘住（三個以上連成星座）；拖曳＝甩出去，恆星再慢慢拉回來；
// 拖恆星＝整團被沖散拖走、再慢慢聚回來；恆星平常在自己的範圍裡慢慢飄；空白處拖＝平移；滾輪／雙指＝縮放。
// 詞都是使用者詞庫或覆寫來的字串：一律 textContent，不拼 HTML。

const LH_WS_MIN = 2, LH_WS_MAX = 6;
const LH_WS_PAGE = 240;            // 詞卡一次多畫幾張（捲到底再補）
const LH_WS_SPACE_MAX = 800;       // 「顯示全部」最多放幾個詞（最常用的優先）；ponytail: DOM 節點逐幀移動，再多手機會掉幀，要更多就改畫在 canvas
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
    const go = _lhWsEl('button', 'ws-expand-btn');
    go.type = 'button';
    go.innerHTML = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z"/><circle cx="18.5" cy="17.5" r="1.5"/><circle cx="6" cy="18" r="1"/></svg><span>顯示全部</span>';
    go.disabled = !_lhWs.list.length;
    go.addEventListener('click', () => lhWsOpen());
    // 回報：跟 AI 詞卡一樣先進「挑選」模式（點詞卡＝勾選，不是保留），再送出；放在數量那一列右邊，不另佔一行
    const rep = _lhWsEl('div', 'ws-rep');
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
    rep.append(repBtn, repCancel);
    container.classList.remove('report-mode');
    repSync();
    _lhWs.repSync = repSync;
    head.append(count, rep, go);
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
const LH_SP_RING = 46;   // 軌道之間的距離（世界座標 px）
const _lhSpReduce = matchMedia('(prefers-reduced-motion: reduce)');
const LH_SP_PIN = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6M10 3v6l-3 4h10l-3-4V3M12 13v8"/></svg>';
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
    const keep = _lhWsEl('button', 'ws-keep'), hide = _lhWsEl('button', 'ws-hide');
    keep.type = hide.type = 'button';
    keep.innerHTML = LH_SP_PIN;
    hide.innerHTML = LH_SP_X;
    acts.append(keep, hide);
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
    tools.append(fl);   // 不放「取消選取」：點空白處就是取消選取
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
    panel.append(title, posBox, legend, tools);
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
    _lhSp.el.querySelector('.ws-filter-cap').textContent = v ? '常用度：前 ' + (100 - v) + '%' : '常用度：不限';
}

// 一個詞在畫面上大約多寬（世界座標 px），排軌道用
const _lhSpWidth = (w, s) => [...w].length * 16 * s + 22;

// 分群（聲調組合）→ 每團：最常用的詞在中心（恆星），其他依常用度由內往外排；只有 1–2 個詞的團變流星。
// 軌道不是整齊的同心圓：每個詞各自的半徑、橢圓扁度、傾角、起始角度、速度都帶一點隨機。
// 字的大小照常用度（詞庫的 p，取對數）在 0.8～2 倍之間（最大最小差 2.5 倍）
// cfg.groupOf(e)→團的 key、cfg.headOf(key)→圖例大類、cfg.colorOf(key)→團色；沒給就用聲調組合（顯示全部）
function _lhSpLayout(list, cfg = {}) {
    const lp = list.map(e => Math.log1p(e.p || 0)), lo = Math.min(...lp), hi = Math.max(...lp);
    const norm = e => hi > lo ? (Math.log1p(e.p || 0) - lo) / (hi - lo) : 0.5;
    const sizeOf = e => 0.8 + 1.2 * norm(e);
    const R = Math.random, TAU = Math.PI * 2;
    // 同一色系裡的深淺：越常用越接近主色，再加一點隨機
    const tint = (base, e) => 'color-mix(in oklab, ' + base + ' ' + Math.round(55 + 30 * norm(e) + 15 * R()) + '%, var(' + (R() < 0.5 ? '--text-primary' : '--text-secondary') + '))';
    const groups = new Map();
    for (const e of list) {
        const k = cfg.groupOf ? cfg.groupOf(e) : e.z.split(' ').map(s => getZhuyinTone(s)).join('·');
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
            ph: [R() * TAU, R() * TAU], f: [0.12 + R() * 0.08, 0.1 + R() * 0.08] };
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
        words.push({ e: star, cl, star: true, color, s: sizeOf(star), r: 0, ecc: 1, tilt: 0, th: 0, om: 0 });
        // 同一圈共用扁度、傾角、速度（才不會越轉越擠在一起），每個詞只再帶一點點偏差
        rings.forEach((ring, k) => {
            const th0 = R() * TAU, gap = TAU / ring.length;
            const om = cl.dir * 0.16 / Math.sqrt(k + 1) * (0.9 + R() * 0.2);   // 內圈快、外圈慢（像行星）
            const ecc = 0.82 + R() * 0.15, tilt = cl.tilt + (R() - 0.5) * 0.5;
            ring.forEach((e, j) => words.push({ e, cl, color: tint(color, e), s: sizeOf(e),
                // 水彩筆畫的圈：同一圈每個詞離軌道多遠不一樣（±30% 間距），角度也不平均；速度相同，所以彼此距離不會變
                r: radii[k] + (R() - 0.5) * LH_SP_RING * 0.6, ecc: ecc + (R() - 0.5) * 0.03, tilt: tilt + (R() - 0.5) * 0.08,
                th: th0 + gap * j + (R() - 0.5) * gap * 0.35, om, br: 3 + R() * 4 }));
        });
    }
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
    for (const e of comets) {   // 流星：隨機起點、隨機方向，慢慢地直直穿過整片，出了邊界從對面回來
        const a = R() * TAU, v = 28 + R() * 30;
        words.push({ e, cl: null, color: 'var(--text-secondary)', s: sizeOf(e), comet: true, x: (R() * 2 - 1) * bound, y: (R() * 2 - 1) * bound, vx: Math.cos(a) * v, vy: Math.sin(a) * v, ang: a });
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

// 一打開的縮放：讓大約 75% 的詞落在畫面裡（詞少就放大一點，詞多就縮小一點）
function _lhSpFitZoom(words) {
    const el = _lhSp.el, W = el.clientWidth / 2 - 30, H = el.clientHeight / 2 - 40;
    const q = words.filter(w => !w.comet).map(w => {
        const { x, y } = _lhSpOrbit(w);
        return Math.max(Math.abs(x) / W, Math.abs(y) / H);
    }).sort((a, b) => a - b);
    if (!q.length) return 1;
    const p75 = q[Math.min(q.length - 1, Math.floor(q.length * 0.75))] || 1;
    return Math.min(2.2, Math.max(LH_SP_ZMIN, 1 / p75));
}

function lhWsOpen() {
    if (!_lhWs.list.length) return;
    _lhSpShow({ list: _lhWs.list, title: '「' + _lhWs.input + '」' });
}

// ===== 關聯詞彙：查單字時選了字卡，列出含這些字的詞（js/cards.js updateBatchCount 開關按鈕） =====
// pos：'head'＝字在詞首、'tail'＝在詞尾、''＝任意位置。分團：字＋位置（任意）或字＋字數（詞首／詞尾）
const _lhRel = { chars: [], pos: '' };
function _lhWsRelList(chars, pos) {
    const set = new Set(chars), out = [];
    for (const e of typeof lhCwMerge === 'function' ? lhCwMerge(wordlistData) : wordlistData || []) {
        const cs = [...e.w], n = cs.length;
        if (n < 2 || n > LH_WS_MAX || _lhWs.hidden.has(e.w)) continue;
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
    const { chars, pos } = _lhRel;
    const list = _lhWsRelList(chars, pos);
    if (!list.length) { showToast('詞庫裡沒有' + (pos === 'head' ? '以這些字開頭' : pos === 'tail' ? '以這些字結尾' : '含這些字') + '的詞'); if (!_lhSp.el || _lhSp.el.hidden) return; }
    const set = new Set(chars);
    const where = e => { const cs = [...e.w]; return pos === 'tail' ? cs[cs.length - 1] : pos === 'head' ? cs[0] : cs.find(c => set.has(c)); };
    const groupOf = e => {
        const cs = [...e.w], c = where(e), i = cs.indexOf(c);
        return c + '|' + (pos ? cs.length + ' 字' : i === 0 ? '開頭' : i === cs.length - 1 ? '結尾' : '中間');
    };
    _lhSpShow({ list, title: '「' + chars.join('') + '」關聯詞', rel: true,
        groupOf, headOf: key => key.split('|')[0], colorOf: key => LH_WS_TONE_C[chars.indexOf(key.split('|')[0]) % 5] });
}

// 打開星雲（或已經開著時換內容）：cfg = { list, title, rel, groupOf, headOf, colorOf }
function _lhSpShow(cfg) {
    const el = _lhSpBuild();
    const reopen = !el.hidden;
    const { words, clusters, bound } = _lhSpLayout(cfg.list.slice(0, LH_WS_SPACE_MAX), cfg);
    _lhSp.bound = bound;
    _lhSp.groups = clusters;
    const n = words.length;
    el.querySelector('.ws-title').textContent = cfg.title + '· ' + n + (cfg.list.length > n ? ' / ' + cfg.list.length : '') + ' 個詞';
    // 圖例：一欄；大類（聲調色系，或關聯詞的字）點開看底下各團，點團導覽過去
    const legend = el.querySelector('.ws-legend');
    legend.replaceChildren();
    const heads = cfg.rel ? _lhRel.chars : [1, 2, 3, 4, 5];
    heads.forEach((h, hi) => {
        const cs = clusters.filter(cl => cl.t1 === h);
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
    // 關聯詞才有的「字首／字尾」：最多選一個，都不選＝任意位置
    const posBox = el.querySelector('.ws-pos');
    posBox.hidden = !cfg.rel;
    posBox.querySelectorAll('[data-pos]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.pos === _lhRel.pos)));
    el.querySelector('.ws-range').value = '0';
    el.querySelector('.ws-filter-cap').textContent = '常用度：不限';
    _lhSp.pins = [];
    _lhSp.chords = [];
    _lhSp.segs = [];
    _lhSp.hover = null;
    _lhSp.act = null;
    _lhSpTheme();
    _lhSp.words = words.map(it => Object.assign(it, {
        w: it.e.w, p: it.e.p || 0, rgb: _lhSpColor(it.color), phon: _lhWsPhon(it.e), spr: null, sprS: 0, tw: _lhSpWidth(it.e.w, it.s) - 22,
        wob: Math.random() * 100, hot: false, pinned: false, kept: savedWords.includes(it.e.w), dim: false, free: false, fx: 0, fy: 0, fvx: 0, fvy: 0, sx: 0, sy: 0 }));
    _lhSp.px = 0; _lhSp.py = 0;
    _lhSp.nav = null;
    if (reopen) {   // 已經開著（換字首／字尾）：直接換內容、重新散開
        el.hidden = false;
        _lhSp.z = _lhSpFitZoom(_lhSp.words);
        _lhSpApplyView();
        _lhSp.t0 = performance.now();
        return;
    }
    // 打開的順序：三塊面板先收走（0.45 秒）→ 只剩背景（飄字變很淡）→ 星雲淡入、詞從中心散開。
    // 星雲層在面板走完才出現，同一時間只有一種東西在動，電腦跑不動也不會閃
    _lhSp.back = document.activeElement;
    for (const id of ['leftPanel', 'mainContainer', 'rightPanel', 'mobileTabBar']) { const p = document.getElementById(id); if (p) p.inert = true; }
    if (typeof lhBgFxFaint === 'function') lhBgFxFaint(true);
    document.body.classList.add('ws-anim', 'ws-leave');
    clearTimeout(_lhSp.tm);
    _lhSp.tm = setTimeout(() => {
        el.hidden = false;
        _lhSpResize();
        _lhSp.z = _lhSpFitZoom(_lhSp.words);
        _lhSpApplyView();
        requestAnimationFrame(() => document.body.classList.add('ws-open'));
        _lhSp.t0 = performance.now();
        _lhSp.last = 0;
        cancelAnimationFrame(_lhSp.raf);
        _lhSp.raf = requestAnimationFrame(_lhSpFrame);
        el.querySelector('.ws-close').focus({ preventScroll: true });
    }, _lhSpReduce.matches ? 0 : 480);
    document.addEventListener('keydown', _lhSpKey, true);
}

function lhWsClose() {
    if (!_lhSp.el || !document.body.classList.contains('ws-leave')) return;
    const el = _lhSp.el, fast = _lhSpReduce.matches;
    document.removeEventListener('keydown', _lhSpKey, true);
    // 收起的順序反過來：星雲先淡出 → 三塊面板回來
    document.body.classList.remove('ws-open');
    clearTimeout(_lhSp.tm);
    _lhSp.tm = setTimeout(() => {
        el.hidden = true;
        cancelAnimationFrame(_lhSp.raf); _lhSp.raf = 0;
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
}
const _lhSpColors = new Map();
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
// 字的小圖（字＋淡淡光暈）照目前的縮放畫一次，每一幀只要貼上去；縮放跨過半個八度才重畫（每幀最多重畫 60 個，不卡）
const _lhSpBucket = z => Math.pow(2, Math.round(Math.log2(Math.max(0.1, z)) * 2) / 2);
function _lhSpSprite(w, S) {
    const fs = 16 * w.s * S, pad = Math.ceil(fs * 0.6);
    const m = _lhSp.ctx;
    m.font = fs + 'px ' + _lhSp.font;
    const tw = m.measureText(w.w).width;
    const c = w.spr || document.createElement('canvas');
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
    w.spr = c; w.sprS = S; w.tw = tw / S; w.tH = fs * 1.4 / S;
}

// 世界座標 ↔ 畫面座標（相對星雲左上角）：畫面點 = 中心 + p + 世界點 × z
const _lhSpScr = (x, y) => ({ x: _lhSp.W / 2 + _lhSp.px + x * _lhSp.z, y: _lhSp.H / 2 + _lhSp.py + y * _lhSp.z });
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
    return { x: (x - r.left - r.width / 2 - _lhSp.px) / _lhSp.z, y: (y - r.top - r.height / 2 - _lhSp.py) / _lhSp.z };
}

// 詞現在的世界座標（不含開場散開）
function _lhSpPos(w) {
    if (w.free) return { x: w.fx, y: w.fy };
    if (w.comet) return { x: w.x, y: w.y };
    return _lhSpOrbit(w);
}

// 點到哪個詞（client 座標）：上層（停住、釘住）先找；淡掉的不算。停住的詞往上多算一截，滑到它上面的按鈕不會掉
function _lhSpHit(cx, cy) {
    const p = _lhSpToWorld(cx, cy), z = _lhSp.z;
    const inside = w => {
        const hw = (w.tw || 0) / 2 + 9 * w.s, hh = (w.tH || 22 * w.s) / 2;
        const up = w.hot || w.pinned ? 26 / z : 0;
        return Math.abs(p.x - w.px) <= hw && p.y - w.py <= hh && w.py - p.y <= hh + up;
    };
    const ws = _lhSp.words;
    for (let i = ws.length - 1; i >= 0; i--) if ((ws[i].hot || ws[i].pinned) && !ws[i].dim && inside(ws[i])) return ws[i];
    for (let i = ws.length - 1; i >= 0; i--) if (!ws[i].dim && inside(ws[i])) return ws[i];
    return null;
}

function _lhSpFrame(t) {
    _lhSp.raf = requestAnimationFrame(_lhSpFrame);
    const dt = _lhSp.last ? Math.min((t - _lhSp.last) / 1000, 0.05) : 0;
    _lhSp.last = t;
    const reduce = _lhSpReduce.matches;
    if (_lhSp.nav) {   // 導覽：緩出
        const k = Math.min(1, (t - _lhSp.nav.t0) / 600), e = 1 - Math.pow(1 - k, 3);
        _lhSp.px = _lhSp.nav.fx + (_lhSp.nav.tx - _lhSp.nav.fx) * e;
        _lhSp.py = _lhSp.nav.fy + (_lhSp.nav.ty - _lhSp.nav.fy) * e;
        _lhSpApplyView();
        if (k >= 1) _lhSp.nav = null;
    }
    // 一打開：詞從中心散開到自己的位置（1.2 秒緩出）
    const k = reduce ? 1 : Math.min(1, (t - _lhSp.t0) / 1200), ease = 1 - Math.pow(1 - k, 3);
    const T = (t - _lhSp.t0) / 1000;
    // 恆星在自己的範圍裡慢慢飄（被拖著的那團跟著恆星走）
    if (!reduce) for (const cl of _lhSp.groups) if (!cl.held) { cl.x = cl.hx + _lhSpDx(cl, T); cl.y = cl.hy + _lhSpDy(cl, T); }
    // 兩團靠太近：慢慢互相推開（約 12 秒推到位）；被拖著的那團不動，另一團讓開
    if (dt) {
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
    for (const w of _lhSp.words) {
        const still = w.hot || w.pinned || reduce;   // 停在詞上、釘住：定格
        if (w === drag) { if (w.star && w.free) { w.cl.x = w.fx; w.cl.y = w.fy; } }   // 按著還沒拖動（free 還沒開）不動整團
        else if (w.free) {
            if (w.comet || w.star) {   // 流星、恆星甩出去：照速度滑，摩擦慢慢停
                w.fx += w.fvx * dt; w.fy += w.fvy * dt;
                w.fvx *= fr; w.fvy *= fr;
                if (w.star) { w.cl.x = w.fx; w.cl.y = w.fy; }
                if (Math.hypot(w.fvx, w.fvy) < 6) {
                    w.free = false;
                    if (w.comet) { w.x = w.fx; w.y = w.fy; }
                    else {   // 恆星停下：這裡就是這團新的家，飄動從現在的位置接著飄
                        const cl = w.cl;
                        _lhSpDrift(Object.assign(cl, { hx: w.fx, hy: w.fy }), _lhSp.groups);
                        cl.hx = w.fx - _lhSpDx(cl, T); cl.hy = w.fy - _lhSpDy(cl, T); cl.held = false;
                    }
                }
            } else {   // 行星被甩出去或被沖散：自己的恆星像彈簧一樣慢慢把它拉回軌道
                if (!still) w.th += w.om * dt;
                const o = _lhSpOrbit(w);
                w.fvx = (w.fvx + (o.x - w.fx) * K * dt) * damp;
                w.fvy = (w.fvy + (o.y - w.fy) * K * dt) * damp;
                w.fx += w.fvx * dt; w.fy += w.fvy * dt;
                const tol = w.rising ? 10 : 3;   // 接任的恆星：差不多到中心就接手，不必等完全停穩
                if (Math.hypot(o.x - w.fx, o.y - w.fy) < tol && Math.hypot(w.fvx, w.fvy) < tol * 5) { w.free = false; if (w.rising) { w.rising = false; w.star = true; } }
            }
        } else if (!still) {
            if (w.comet) {
                w.x += w.vx * dt; w.y += w.vy * dt;
                if (w.x > B) w.x = -B; else if (w.x < -B) w.x = B;
                if (w.y > B) w.y = -B; else if (w.y < -B) w.y = B;
            } else if (!w.star) {
                w.th += w.om * dt;
                w.wob += dt;
                const br = w.br || 2.5;
                w.sx = Math.sin(w.wob * 0.7) * br; w.sy = Math.cos(w.wob * 0.55) * br;   // 呼吸，每個詞幅度不同（水彩的毛邊）
            }
        }
        const p = _lhSpPos(w);
        w.px = p.x * ease; w.py = p.y * ease;
    }
    // 星座：釘住的詞照順序連線；兩個就一條線，三個以上頭尾相連（三角形、多邊形），五個以上再有幾條隨機的對角線
    const pins = _lhSp.pins.filter(w => w.pinned), segs = [];
    if (pins.length >= 2) for (let i = 0; i < pins.length - (pins.length >= 3 ? 0 : 1); i++) segs.push([pins[i], pins[(i + 1) % pins.length]]);
    for (const c of _lhSp.chords) if (c[0].pinned && c[1].pinned) segs.push(c);
    _lhSp.segs = segs;
    _lhSpDraw(t);
}

// 每一幀畫一次：星座線 → 流星尾巴 → 一般的詞 → 停住／釘住的詞（外框、光暈、在最上層）→ 已保留的詞的閃光
function _lhSpDraw(t) {
    const c = _lhSp.ctx, z = _lhSp.z, dpr = _lhSp.dpr || 1;
    if (!c || !_lhSp.W) return;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, _lhSp.W, _lhSp.H);
    const S = _lhSpBucket(z * dpr);
    let budget = 60;
    const vis = w => { const p = _lhSpScr(w.px, w.py); return p.x > -200 && p.x < _lhSp.W + 200 && p.y > -80 && p.y < _lhSp.H + 80 ? p : null; };
    // 星座線
    if (_lhSp.segs.length) {
        c.save();
        c.strokeStyle = _lhSp.cLine; c.lineWidth = 1.5; c.lineJoin = 'round'; c.globalAlpha = 0.85;
        c.shadowColor = _lhSp.cLine; c.shadowBlur = 6;
        c.beginPath();
        for (const [a, b] of _lhSp.segs) { const p = _lhSpScr(a.px, a.py), q = _lhSpScr(b.px, b.py); c.moveTo(p.x, p.y); c.lineTo(q.x, q.y); }
        c.stroke();
        c.restore();
    }
    const top = [];
    for (const w of _lhSp.words) {
        const p = vis(w);
        if (!p) continue;
        if (w.hot || w.pinned) { top.push([w, p]); continue; }
        if (w.comet && !w.dim) {   // 流星尾巴：往前進的反方向，幾段越來越淡
            c.save();
            c.strokeStyle = w.rgb; c.lineWidth = 1;
            const L = 112 * z, ux = -Math.cos(w.ang), uy = -Math.sin(w.ang);
            for (let i = 0; i < 6; i++) {
                c.globalAlpha = 0.6 * (1 - i / 6);
                c.beginPath(); c.moveTo(p.x + ux * L * i / 6, p.y + uy * L * i / 6); c.lineTo(p.x + ux * L * (i + 1) / 6, p.y + uy * L * (i + 1) / 6); c.stroke();
            }
            c.restore();
        }
        if ((!w.spr || w.sprS !== S) && (budget-- > 0 || !w.spr)) _lhSpSprite(w, S);
        const sw = w.spr.width / w.sprS * z, sh = w.spr.height / w.sprS * z;
        c.globalAlpha = w.dim ? 0.06 : w.comet ? 0.85 : 1;
        c.drawImage(w.spr, p.x - sw / 2, p.y - sh / 2, sw, sh);
        if (w.kept && !w.dim) {   // 已保留：原本的字不動，疊一層更亮的光慢慢亮起又淡回去（2.4 秒一次）
            c.save();
            c.globalAlpha = _lhSpReduce.matches ? 0.45 : 0.45 * (1 - Math.cos(t / 2400 * Math.PI * 2)) ;
            c.globalCompositeOperation = 'lighter';
            c.shadowColor = w.rgb; c.shadowBlur = 14 * w.s * z;
            c.drawImage(w.spr, p.x - sw / 2, p.y - sh / 2, sw, sh);
            c.restore();
        }
    }
    c.globalAlpha = 1;
    // 停住／釘住：半透明底＋外框＋光暈的膠囊，字在上面
    for (const [w, p] of top) {
        if (!w.spr || w.sprS !== S) _lhSpSprite(w, S);
        const fs = 16 * w.s * z, hw = w.tw * z / 2 + fs * 0.55, hh = fs * 0.7 + fs * 0.15;
        c.save();
        c.beginPath();
        if (c.roundRect) c.roundRect(p.x - hw, p.y - hh, hw * 2, hh * 2, hh); else c.rect(p.x - hw, p.y - hh, hw * 2, hh * 2);
        c.shadowColor = w.rgb; c.shadowBlur = 20;
        c.globalAlpha = 0.8; c.fillStyle = _lhSp.cCard; c.fill();
        c.shadowBlur = 0; c.globalAlpha = 1; c.strokeStyle = w.rgb; c.lineWidth = 1.5; c.stroke();
        c.restore();
        const sw = w.spr.width / w.sprS * z, sh = w.spr.height / w.sprS * z;
        c.drawImage(w.spr, p.x - sw / 2, p.y - sh / 2, sw, sh);
    }
    _lhSpActsPlace();
}

// 📌 ✕：浮在「游標停住的詞」（觸控：最後點的那個釘住的詞）兩端上方，跟著詞移動
function _lhSpActsPlace() {
    const a = _lhSp.acts, w = (_lhSp.hover && _lhSp.hover.hot) ? _lhSp.hover : (_lhSp.act && _lhSp.act.pinned ? _lhSp.act : null);
    if (!w || _lhSp.drag && _lhSp.drag.moved || !_lhSp.words.includes(w)) { if (!a.hidden) a.hidden = true; return; }
    const p = _lhSpScr(w.px, w.py), fs = 16 * w.s * _lhSp.z, hw = w.tw * _lhSp.z / 2 + fs * 0.55, hh = fs * 0.85;
    a.hidden = false;
    a.style.transform = 'translate(' + p.x.toFixed(1) + 'px,' + (p.y - hh + 6).toFixed(1) + 'px)';
    a.firstChild.style.left = (-hw + 8) + 'px';
    a.lastChild.style.left = (hw - 8) + 'px';
    if (a.dataset.w !== w.w) {
        a.dataset.w = w.w;
        a.firstChild.setAttribute('aria-label', '保留「' + w.w + '」');
        a.lastChild.setAttribute('aria-label', '隱藏「' + w.w + '」');
        a.firstChild.title = '保留「' + w.w + '」';
        a.lastChild.title = '隱藏「' + w.w + '」';
    }
}

// 恆星被隱藏：這一團剩下最常用的詞慢慢飄到中心接任恆星（到位才算恆星，拖它才會帶走整團）
function _lhSpPromote(cl) {
    const next = _lhSp.words.filter(x => x.cl === cl && !x.comet && !x.star).sort((a, b) => b.p - a.p)[0];
    if (!next) return;
    const at = _lhSpPos(next);
    Object.assign(next, { r: 0, ecc: 1, tilt: 0, om: 0, sx: 0, sy: 0, rising: true });
    if (!next.free) Object.assign(next, { free: true, fx: at.x, fy: at.y, fvx: 0, fvy: 0 });
}

// 釘住／放開之後整理星座：記釘的順序；第五個起每釘一個，有七成機會和一個不相鄰的舊點多連一條
function _lhSpPin(w) {
    _lhSp.pins = _lhSp.pins.filter(x => x !== w);
    _lhSp.chords = _lhSp.chords.filter(c => c[0] !== w && c[1] !== w);
    if (!w.pinned) return;
    const ps = _lhSp.pins;
    ps.push(w);
    if (ps.length >= 5 && Math.random() < 0.7) {
        // 候選：不相鄰的舊點，亂序一個個試；和現有任何一條線夾角小於 2° 就放棄、改試下一個
        const pool = ps.slice(1, -2).sort(() => Math.random() - 0.5);
        const pt = x => ({ x: x.px || 0, y: x.py || 0 });
        const segs = ps.map((a, i) => [a, ps[(i + 1) % ps.length]]).concat(_lhSp.chords);
        const ang = (a, b) => { const p = pt(a), q = pt(b); return Math.atan2(q.y - p.y, q.x - p.x); };
        const tooClose = (a1, a2) => { let d = Math.abs(a1 - a2) % Math.PI; d = Math.min(d, Math.PI - d); return d < Math.PI / 90; };
        const pick = pool.find(o => { const a = ang(w, o); return segs.every(([x, y]) => !tooClose(a, ang(x, y))); });
        if (pick) _lhSp.chords.push([w, pick]);
    }
}

function _lhSpClear() {
    for (const w of _lhSp.words) { w.pinned = false; w.hot = false; }
    _lhSp.pins = []; _lhSp.chords = []; _lhSp.act = null;
}

function _lhSpSetHover(w) {
    const h = _lhSp.hover;
    if (h === w) return;
    if (h && !(_lhSp.drag && _lhSp.drag.w === h)) h.hot = false;
    _lhSp.hover = w;
    if (w) w.hot = true;
    _lhSp.el.classList.toggle('on-word', !!w);
}

function _lhSpEvents(el) {
    // 📌 保留、✕ 隱藏（浮在詞旁的真按鈕）
    _lhSp.acts.addEventListener('click', e => {
        const w = _lhSp.words.find(x => x.w === _lhSp.acts.dataset.w);
        if (!w) return;
        if (e.target.closest('.ws-keep')) { saveWord(w.w); w.kept = true; return; }
        if (e.target.closest('.ws-hide')) {
            _lhWs.hidden.add(w.w);
            _lhSp.words = _lhSp.words.filter(x => x !== w);
            w.pinned = false;
            _lhSpPin(w);   // 釘住的詞被隱藏：從星座拿掉，前後兩個點直接接起來，和它有關的對角線一起拿掉；之後再釘的照常接在最後
            if (w.star) _lhSpPromote(w.cl);
            if (_lhSp.hover === w) _lhSpSetHover(null);
            if (_lhSp.act === w) _lhSp.act = null;
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
        if (e.pointerType !== 'mouse' || _lhSp.pts.size || e.target.closest('.ws-panel, .ws-zoom')) return;
        if (e.target.closest('.ws-acts')) return;
        let w = _lhSpHit(e.clientX, e.clientY);
        if (_lhSp.mute && w !== _lhSp.mute) _lhSp.mute = null;
        if (w && w === _lhSp.mute) w = null;
        _lhSpSetHover(w);
    });
    el.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !_lhSp.drag) _lhSpSetHover(null); });
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
            if (!d.moved) {
                d.moved = true; d.w.hot = true; d.w.free = true; d.w.fvx = d.w.fvy = 0;
                el.classList.add('panning');
                if (d.w.star) {   // 拖恆星：整團被沖散、跟著拖走，之後再慢慢聚回來
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
            if (d.moved) {
                // 甩動：用最後一小段的速度（世界座標／秒）繼續滑，摩擦慢慢停下
                const h = d.hist, a = h[0], b = h[h.length - 1];
                const dt = b && a && b.t > a.t ? (b.t - a.t) / 1000 : 0;
                if (dt > 0 && e.timeStamp - b.t < 80) {
                    const vmax = 2400;
                    d.w.fvx = Math.max(-vmax, Math.min(vmax, (b.x - a.x) / dt));
                    d.w.fvy = Math.max(-vmax, Math.min(vmax, (b.y - a.y) / dt));
                }
                if (!d.w.pinned && _lhSp.hover !== d.w) d.w.hot = false;
            } else if (e.type === 'pointerup') {   // 單擊：釘住；再點一次釘住的詞＝取消釘選（光暈、定格一起拿掉）
                d.w.pinned = !d.w.pinned;
                _lhSpPin(d.w);
                if (d.w.pinned) _lhSp.act = d.w;
                else {
                    if (_lhSp.act === d.w) _lhSp.act = null;
                    if (_lhSp.hover === d.w) _lhSpSetHover(null);
                    d.w.hot = false;
                    _lhSp.mute = d.w;   // 游標還停在上面：先別亮，離開再回來才亮
                }
            }
        }
        if (_lhSp.pan && _lhSp.pan.id === e.pointerId) {
            if (!_lhSp.pan.moved && e.type === 'pointerup') _lhSpClear();   // 點空白處（沒拖）＝取消選取
            _lhSp.pan = null;
        }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
}
