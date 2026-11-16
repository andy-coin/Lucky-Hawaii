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
const LH_WS_SPACE_MAX = 630;       // 超過這個數才分批（分批見 _lhSpPages：一批約 600±30，星系一律不拆）
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
        // 0.98.09：再點一下取消保留（toggle）；外框由 lhWsSyncKept 照保留池畫
        if (savedWords.includes(card.dataset.char)) removeSavedWord(card.dataset.char); else saveWord(card.dataset.char);
    };
}
// 詞卡的選取外框＝這個詞有沒有在保留池（換關鍵詞再換回來也記得）；保留池每次變動都會呼叫（js/panels.js renderSavedWords）
function lhWsSyncKept() {
    for (const c of document.querySelectorAll('.ws-card')) c.classList.toggle('kept', savedWords.includes(c.dataset.char));
}

// 再畫一頁；最後一張還沒畫完就放一個哨兵，捲到它就再補
function _lhWsMore(grid) {
    const end = Math.min(_lhWs.list.length, _lhWs.shown + LH_WS_PAGE);
    const frag = document.createDocumentFragment();
    for (let i = _lhWs.shown; i < end; i++) {
        const e = _lhWs.list[i];
        const card = _lhWsEl('div', 'char-card ws-card' + (e.custom ? ' ws-custom' : '') + (savedWords.includes(e.w) ? ' kept' : ''));
        card.dataset.char = e.w;
        card.title = '點一下保留（再點一下取消）；按住拖到歌詞';
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
const LH_SP_ZMIN = 0.1, LH_SP_ZMAX = 3, LH_SP_FIT_MIN = 0.2;   // 實際倍率（1＝世界 1px 對螢幕 1px）
// 0.98.13 Andy：畫面上的「100%」＝這次打開時自動抓的縮放（_lhSp.z100，見 _lhSpFitZoom），按 100% 就回到一打開那個舒服的畫面
const _lhSpZ100 = () => _lhSp.z100 || 1;
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
        b.addEventListener('click', () => { _lhRel.pos = _lhRel.pos === k ? '' : k; _lhRelApply(); });
        posBox.append(b);
    }
    // 字數（可多選，都不選＝不限）：兩字、三字、四字、五字以上（0.98.14 加四字）
    const lenBox = _lhWsEl('div', 'ws-pos ws-len');
    lenBox.setAttribute('role', 'group');
    lenBox.setAttribute('aria-label', '詞的字數');
    for (const [k, label] of [['2', '兩字'], ['3', '三字'], ['4', '四字'], ['m', '多字']]) {
        const b = _lhWsEl('button', 'ws-hud-btn', label);
        b.type = 'button';
        b.dataset.len = k;
        b.addEventListener('click', () => { const s = _lhRel.len; s.has(k) ? s.delete(k) : s.add(k); _lhRelApply(); });
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
    // 收合／展開（0.98.11.1）：小螢幕上面板會擋住星雲，收起來只剩標題列
    const head = _lhWsEl('div', 'ws-head');
    const fold = mk('ws-fold', '', '收合面板', () => {
        const min = panel.classList.toggle('min');
        fold.setAttribute('aria-expanded', String(!min));
        fold.title = min ? '展開面板' : '收合面板'; fold.setAttribute('aria-label', fold.title);
    });
    fold.setAttribute('aria-expanded', 'true');
    fold.innerHTML = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>';
    // 0.98.20 Andy：色標（各星系按鈕）移到第二層面板，左面板旁邊的三角形展開／收起；選很多字時左面板才不會變超長
    const legPanel = _lhWsEl('div', 'ws-legpanel');
    legPanel.hidden = true;
    // 0.98.21 Andy：開關改成貼在左面板右邊緣的小分頁（比較看得到）；色標面板最下面也有一顆「收起」
    legPanel.append(legend);   // 0.98.22.1 Andy：不要「收起色標」鈕，開關只用分頁
    const legBtn = mk('ws-legbtn', '', '展開色標', () => { _lhSp.legOpen = !_lhSp.legOpen; _lhSpLegSync(); });
    legBtn.innerHTML = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l9 7-9 7z"/></svg>';
    fold.addEventListener('click', () => _lhSpLegSync());
    head.append(title, fold);
    panel.append(head, posBox, lenBox, tools);
    // 0.98.20 Andy：多重宇宙時，畫面左右邊界中間的三角形換上一批／下一批（第一批沒有左、最後一批沒有右）
    const nav = d => { const b = mk('ws-nav ' + (d < 0 ? 'ws-prev' : 'ws-next'), '', d < 0 ? '上一批' : '下一批', () => {
        const p = (_lhSp.cfg.page || 0) + d;
        if (p >= 0 && p < _lhSpPages(_lhSp.cfg).length) _lhSpWhip(p); });
        b.innerHTML = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="' + (d < 0 ? 'M18 2L5 12l13 10z' : 'M6 2l13 10L6 22z') + '"/></svg>';
        b.hidden = true; return b; };
    // 右上：縮放與關閉；底下一列特效等級（0.98.20 Andy，跟偏好設定同一個值）
    const tr = _lhWsEl('div', 'ws-tr');
    const fx = _lhWsEl('label', 'ws-fx'), fxCap = _lhWsEl('span', 'ws-fx-cap'), fxR = _lhWsEl('input', 'ws-fx-range');
    fxR.type = 'range'; fxR.min = '1'; fxR.max = '5'; fxR.step = '1';
    fxR.setAttribute('aria-label', '特效等級');
    fxR.addEventListener('input', () => { if (typeof lhFxSetLevel === 'function') lhFxSetLevel(+fxR.value); _lhSpFxSync(); _lhSpFinishFx(); });
    fx.append(fxCap, fxR);
    const zoom = _lhWsEl('div', 'ws-zoom');
    // 以畫面中心縮放、星系位置不動（0.98.14.4 Andy）；0.98.20 Andy：在 100% 就切到 50%，其他倍率回 100%（兩檔循環）
    const pct = mk('ws-pct', '100%', '切換 100%／50%', () => { const z1 = _lhSpZ100(); _lhSpZoom(Math.round(_lhSp.z / z1 * 100) === 100 ? z1 / 2 : z1); });
    zoom.append(mk('', '−', '縮小', () => _lhSpZoom(_lhSp.z / 1.25)), pct, mk('', '＋', '放大', () => _lhSpZoom(_lhSp.z * 1.25)));
    const close = mk('ws-close', '', '關閉（Esc）', () => lhWsClose());
    close.innerHTML = LH_SP_X;
    zoom.append(close);
    tr.append(zoom, fx);
    el.append(cv, acts, probe, panel, legBtn, legPanel, pages, nav(-1), nav(1), tr);
    if (LH_SP_TUNE_UI) {   // 0.98.21 Andy 暫時的調參齒輪：縮放鈕左邊
        const tune = _lhSpTunePanel();
        const gear = mk('ws-gear', '⚙', '宇宙特效調參', () => { tune.hidden = !tune.hidden; gear.setAttribute('aria-expanded', String(!tune.hidden)); });
        gear.setAttribute('aria-expanded', 'false');
        zoom.prepend(gear);
        el.append(tune);
    }   // 換批滑桿獨立放在畫面正上方中間（0.98.09）
    document.body.append(el);
    _lhSp.el = el;
    _lhSp.cv = cv;
    _lhSp.ctx = cv.getContext('2d');
    _lhSp.acts = acts;
    _lhSp.probe = probe;
    new ResizeObserver(() => _lhSpResize()).observe(el);
    const ro = new ResizeObserver(() => _lhSpNavPlace());   // 面板長高、收合、色標面板開關 → 色標面板和左三角形跟著挪
    for (const x of [el, panel, legPanel]) ro.observe(x);
    _lhSpEvents(el);
    return el;
}


// 標題（0.98.21 Andy：換行很亂）：固定兩行——第一行「「不好」」（跟收合鈕同一列，太長就 …），第二行小字「關聯詞 · 609 / 5415 個詞」
function _lhSpTitle(n) {
    const cfg = _lhSp.cfg, m = /^(「.*」)(.*)$/.exec(cfg.title) || [, cfg.title, ''];
    const main = _lhWsEl('span', 'ws-title-main', m[1]), sub = _lhWsEl('span', 'ws-title-sub', (m[2] ? m[2] + ' · ' : '') + n.toLocaleString('zh-TW') + (cfg.list.length > n ? ' / ' + cfg.list.length.toLocaleString('zh-TW') : '') + ' 個詞');
    main.title = cfg.title;
    _lhSp.el.querySelector('.ws-title').replaceChildren(main, sub);
}
// 色標面板：開關照 _lhSp.legOpen；左面板收合或沒有色標時一起藏
function _lhSpLegSync() {
    const el = _lhSp.el, lp = el.querySelector('.ws-legpanel'), b = el.querySelector('.ws-legbtn'), pn = el.querySelector('.ws-panel');
    const has = !!el.querySelector('.ws-legend').childElementCount;
    b.hidden = !has || pn.classList.contains('min');
    lp.hidden = b.hidden || !_lhSp.legOpen;
    b.setAttribute('aria-expanded', String(!lp.hidden));
    b.title = lp.hidden ? '展開色標' : '收起色標'; b.setAttribute('aria-label', b.title);
    _lhSpNavPlace();
}
// 色標面板貼在左面板右邊；左三角形若會被左邊的面板擋到，就往右挪到面板外面
function _lhSpNavPlace() {
    const el = _lhSp.el;
    if (!el || el.hidden) return;
    const er = el.getBoundingClientRect(), pr = el.querySelector('.ws-panel').getBoundingClientRect(), lp = el.querySelector('.ws-legpanel'), tab = el.querySelector('.ws-legbtn');
    tab.style.left = (pr.right - er.left - 1) + 'px';
    tab.style.top = (pr.top - er.top + (pr.height - (tab.offsetHeight || 64)) / 2) + 'px';   // 0.98.22.1：貼在左面板右邊緣的正中間
    lp.style.left = (pr.right - er.left + (tab.offsetWidth || 22) + 4) + 'px';
    const prev = el.querySelector('.ws-prev'), mid = er.height / 2;
    let left = 12;
    for (const r of [pr, lp.hidden ? null : lp.getBoundingClientRect()]) if (r && r.width && r.bottom - er.top > mid - 32 && r.top - er.top < mid + 32) left = Math.max(left, r.right - er.left + 8);
    prev.style.left = left + 'px';
}
// 0.98.21 Andy：宇宙裡切換特效等級時，正在播的特效直接收尾（打斷）：還沒浮現的全部出現、凝聚／沖散中的詞直接歸位、殘影清掉、換批過場停掉
function _lhSpFinishFx() {
    const now = performance.now();
    for (const g of _lhSp.queue || []) for (const w of g) { if (!w.spr) w.spr = _lhSpSprite(w, _lhSp.S); w.born = now - 5000; }
    _lhSp.queue = [];
    for (const w of _lhSp.words) {
        if (w.born) w.born = Math.min(w.born, now - 5000);
        if (w.gx0 === undefined) w.gx0 = w.gy0 = 0;   // 已經浮現的詞：切到第 5 級也不再撒開
        if (w.free && w !== (_lhSp.drag && _lhSp.drag.w)) { if (w.star || w.comet) _lhSpSettle(w, _lhSpCfg(), (now - _lhSp.t0) / 1000); else { w.free = false; w.gk = 0; } if (w.rising) { w.rising = false; w.star = true; } }
        w.fvx = w.fvy = 0;
    }
    for (const cl of _lhSp.groups) cl.ver++;
    _lhSp.slices = _lhSp.slCur = null;
    if (_lhSp.cv) _lhSp.cv.getAnimations().forEach(a => a.cancel());   // cancel 而不是 finish：星際穿越的放大是 fill forwards，finish 會停在全透明
    _lhSp.dirty = true;
}
const LH_SP_FX_NAME = ['', '簡單', '省電', '精緻', '生動', '浮誇'];
function _lhSpFxSync() {
    const el = _lhSp.el, lv = typeof lhFxLevel === 'function' ? lhFxLevel() : 5, r = el.querySelector('.ws-fx-range');
    el.querySelector('.ws-fx').hidden = typeof lhFxSetLevel !== 'function';
    r.value = String(lv);
    r.setAttribute('aria-valuetext', LH_SP_FX_NAME[lv]);
    el.querySelector('.ws-fx-cap').textContent = '特效：' + LH_SP_FX_NAME[lv];
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
    if (typeof lhFxLevel === 'function' && lhFxLevel() >= 5) { _lhSpWarp(go); return; }   // 第 5 級：星際穿越
    if (_lhSp.whip) _lhSp.whip.cancel();
    if (_lhSpCfg().swap === 'fade') {   // 第 2 級（0.98.16 Andy）：淡出再淡入
        const out = cv.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: 'ease-in', fill: 'forwards' });
        _lhSp.whip = out;
        out.onfinish = () => { go(); out.cancel(); _lhSp.whip = cv.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 420, easing: 'ease-out' }); };
        return;
    }
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
// 第 5 級的換批過場：星際穿越（超光速）。上面疊一張透明畫布畫從中心往外射的星光線，先加速再減速（約 1.1 秒）；
// 舊的星雲往前衝（放大、模糊、淡出），最快的時候換內容，新的從遠處拉近（由小變大、變清楚）
function _lhSpWarp(go) {
    if (_lhSp.warp) { _lhSp.warpNext = go; return; }   // 還在穿越：記下最後一次要換的，播完接著再穿越一次（不吃掉點擊）
    const el = _lhSp.el, cv = _lhSp.cv, W = el.clientWidth, H = el.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
    const o = document.createElement('canvas');
    o.className = 'ws-warp';
    o.width = Math.round(W * dpr); o.height = Math.round(H * dpr);
    el.insertBefore(o, cv.nextSibling);
    const x = o.getContext('2d'), cx = W / 2, cy = H / 2, maxR = Math.hypot(cx, cy);
    // 0.98.10：光線顏色取畫面上看得到的詞（隨機抽，哪個色系佔得多，光線就多是那個色）；畫面空的才用文字色
    const seen = _lhSp.words.filter(w => w.born && !w.dim && !w.off && w.rgb && (p => p.x > 0 && p.x < W && p.y > 0 && p.y < H)(_lhSpScr(w.px, w.py))).map(w => w.rgb);
    const fallback = getComputedStyle(el).getPropertyValue('--text-primary').trim() || '#fff';
    const pick = () => seen.length ? seen[Math.floor(Math.random() * seen.length)] : fallback;
    const stars = Array.from({ length: 220 }, () => ({ a: Math.random() * Math.PI * 2, d: 20 + Math.random() * maxR, w: 0.6 + Math.random() * 1.4, c: pick() }));
    const T = 730;   // 0.98.09：從 1100 縮短三分之一
    // 0.98.17 Andy：舊宇宙先放大＋漸漸變透明（0.7 秒，製造加速感），最後 0.2 秒才接上星光線；光線開始 0.2 秒後（舊的剛好消失）換新宇宙
    // 0.98.21 Andy：還是像播完一個再播另一個 → 光線提早 0.45 秒接上（重疊一半以上），放大前段加速更猛（4 倍）、最後衝到 9 倍
    const PRE = 800, OVL = 450, GO = OVL / T;
    _lhSp.warp = true;
    // 0.98.18 Andy：加速感不夠、太早變透明 → 前 0.5 秒越放越快到 3 倍（不透明），最後 0.2 秒衝到 6 倍、同時淡出
    cv.animate([
        { offset: 0, transform: 'scale(1)', filter: 'blur(0)', opacity: 1, easing: 'cubic-bezier(.7,0,1,.6)' },
        { offset: (PRE - OVL) / PRE, transform: 'scale(4)', filter: 'blur(3px)', opacity: 1, easing: 'cubic-bezier(.3,0,1,1)' },
        { offset: 1, transform: 'scale(9)', filter: 'blur(10px)', opacity: 0 },
    ], { duration: PRE, fill: 'forwards' });
    let t0 = 0;   // 光線第一格才開始計時
    let swapped = false;
    const step = now => {
        if (!t0) t0 = now;
        const u = Math.min(1, (now - t0) / T), sp = Math.sin(u * Math.PI);   // 速度 0→1→0
        if (!swapped && u >= GO) {
            swapped = true;
            cv.getAnimations().forEach(a => a.cancel());
            go();
            cv.animate([{ transform: 'scale(0.35)', filter: 'blur(8px)', opacity: 0 }, { transform: 'none', filter: 'blur(0)', opacity: 1 }], { duration: T * 0.6, easing: 'cubic-bezier(.15,.7,.3,1)' });
        }
        x.setTransform(dpr, 0, 0, dpr, 0, 0);
        x.clearRect(0, 0, W, H);
        x.lineCap = 'round';
        for (const s of stars) {
            s.d *= 1 + sp * 0.13;   // 越外面跑越快（透視）；時間短了，每格多衝一點
            if (s.d > maxR) { s.d = 10 + Math.random() * 60; s.a = Math.random() * Math.PI * 2; }
            const len = s.d * sp * 0.35, c = Math.cos(s.a), n = Math.sin(s.a);
            x.globalAlpha = Math.min(1, 0.25 + sp) * Math.min(1, s.d / 120);
            x.lineWidth = s.w * (0.6 + sp); x.strokeStyle = s.c;
            x.beginPath(); x.moveTo(cx + c * (s.d - len), cy + n * (s.d - len)); x.lineTo(cx + c * s.d, cy + n * s.d); x.stroke();
        }
        if (u < 1) requestAnimationFrame(step);
        else { o.remove(); _lhSp.warp = false; const nx = _lhSp.warpNext; _lhSp.warpNext = null; if (nx && _lhSp.visible) _lhSpWarp(nx); }
    };
    setTimeout(() => requestAnimationFrame(step), PRE - OVL);
}
// 旋臂（0.98.09）：超過 25 個詞的大星系自動排成旋臂——恆星不轉、離中心越遠轉越慢（克卜勒：角速度 ∝ 距離^-1.5），
// 每個星系 2～5 條往後拖的螺旋臂；25 個詞以下看不出臂，維持同心圓（內圈角速度快）。兩套同時並存，沒有開關
const _lhSpGroupKey = (e, cfg) => cfg.groupOf ? cfg.groupOf(e) : e.z.split(' ').map(s => getZhuyinTone(s)).join('·');
// 分批：一批約 600（±30）個詞，星系一律整個放同一批、不拆（同條件的詞沒理由拆散；超大星系改成色偏大、散得開，見 _lhSpLayout）。
// 批數＝總數 / 600 四捨五入（630 以下一批）；星系由大到小，每次放進目前最少的那批。結果記在 cfg._pages
function _lhSpPages(cfg) {
    if (cfg._pages) return cfg._pages;
    const groups = new Map();
    for (const e of cfg.list) { const k = _lhSpGroupKey(e, cfg); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e); }
    // 0.98.10 之後：不再把大星系拆到各批（舊版「輪流發牌」拆法見 git 6fdd3d4）
    const chunks = [...groups.values()];
    chunks.sort((a, b) => b.length - a.length);
    // 0.98.14：每個宇宙至少兩個星系（3 詞以上才算星系，2 詞以下是流星）→ 批數最多＝星系數 / 2；
    // 最大的幾個星系先各佔一批，再從最小的星系開始配給最大的那批（大配小，不硬拆），剩下的照舊放進目前最少的那批
    const N = cfg.list.length, G = chunks.filter(c => c.length > 2).length;
    const B = N <= LH_WS_SPACE_MAX ? 1 : Math.max(1, Math.min(Math.floor(G / 2), Math.max(2, Math.round(N / 600))));
    const bins = Array.from({ length: B }, () => new Set()), put = (b, c) => { for (const e of c) b.add(e); };
    const rest = chunks.slice(B);
    if (B > 1) {
        chunks.slice(0, B).forEach((c, i) => put(bins[i], c));
        const small = rest.filter(c => c.length > 2).reverse();   // 最小的星系在前
        for (const b of bins) { const c = small.shift(); if (!c) break; put(b, c); rest.splice(rest.indexOf(c), 1); }
    } else rest.unshift(...chunks.slice(0, B));
    for (const c of rest) put(bins.reduce((m, x) => x.size < m.size ? x : m), c);
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
            ph: [R() * TAU, R() * TAU], f: [0.12 + R() * 0.08, 0.1 + R() * 0.08], bp: 4 + R() * 3, ver: 0,   // bp：整團呼吸一輪幾秒（每團不同）
            arms: 2 + Math.floor(R() * 4), arm0: R() * TAU, twist: 1.4 + R() * 1.2, ecc: 0.82 + R() * 0.12 };   // 旋臂模式：幾條臂、起始角、捲曲程度、整個星系的扁度
        clusters.push(cl);
        // 先照寬度一圈圈分好（第 k 圈半徑 = 中心詞的一半寬 + k × 間距），再給每個詞自己的隨機軌道
        // 小星系漫遊（0.98.09）：3–5 個詞的微星系、6–10 個詞的小星系像流星一樣走長直線、出邊界從對面回來；流星 > 微星系 > 小星系
        if (g.length <= 10) { const a = R() * TAU, v = g.length <= 5 ? 32 + R() * 22 : 12 + R() * 10; cl.vx = Math.cos(a) * v; cl.vy = Math.sin(a) * v; }
        // 呼吸（0.98.09）：越大的星系呼吸越慢、幅度越大；幅度 ±3% 起、每多 50 個詞 +0.4%（885 詞約 ±10%）
        // 0.98.14.11 Andy：呼吸一輪的秒數照詞數分段線性——10 詞 5.5 秒、200 詞 20 秒、885 詞（實測最大）60 秒封頂；每團再 ±15% 隨機
        { const n = g.length, u = Math.max(0, n - 10) / 50;
          const P = n <= 10 ? 5.5 : n <= 200 ? 5.5 + (n - 10) / 190 * 14.5 : Math.min(60, 20 + (n - 200) / 685 * 40);
          cl.bp = P * (0.85 + R() * 0.3); cl.ba = 0.03 + 0.004 * u; }
        const spiral = g.length > 25;
        // 超大星系（150 個詞起，550 封頂）：圈距和臂上的空隙拉開，散得稀疏一點；big 0→1
        const big = Math.min(1, Math.max(0, (g.length - 150) / 400)), RING = LH_SP_RING * (1 + 0.9 * big);
        // 色偏（原本只給超大星系，Andy 喜歡、改成所有星系都套滿）：每個詞明暗 ±0.08、色相 ±35°。
        // 只在打開時算一次顏色（之後每格用快取的 rgb），不吃動畫效能，所以每一級都開
        const tintB = (base, e) => { const t = tint(base, e); if (!_LH_REL_REL) return t;
            const dl = Math.round((R() - 0.5) * 0.16 * 100) / 100, dh = Math.round((R() - 0.5) * 70 / 5) * 5;   // 量化：顏色快取才不會爆
            return 'oklch(from ' + t + ' calc(l + ' + dl + ') c calc(h + ' + dh + '))'; };   // 大星系排旋臂、小的維持同心圓（見上面 _lhSpGroupKey 前的說明）
        // 恆星照星系大小加成（0.98.09）：10 個詞以下不加，100 個 2 倍（中間照對數），之後每多 50 個詞再 +0.25 倍（連續，不跳階），300 個詞封頂＝3 倍（0.98.11.1：880 詞的星系原本衝到 5.9 倍，手機縮到最小還框不住）；常用度和星系規模都看得出來
        const star = g[0], rings = [[]], starS = sizeOf(star) * (1 + Math.min(1, Math.max(0, Math.log10(g.length / 10))) + Math.max(0, Math.min(300, g.length) - 100) / 50 * 0.25);
        // 恆星放大後（0.98.09）：靠近中心的幾圈也跟著大一點（第一圈分到恆星多出來的 35%，往外每圈減半），
        // 第一圈離恆星遠一點（恆星每多 1 倍推開 0.8 圈），放大的幾圈之間也跟著加寬
        const extra = starS / sizeOf(star) - 1, boost = k => 1 + extra * 0.35 * Math.pow(0.5, k), szOf = new Map();
        let r = _lhSpWidth(star.w, starS) / 2 + RING * (0.9 + 0.8 * extra), used = 0;
        const radii = [r];
        for (const e of g.slice(1)) {
            const k = rings.length - 1, sz = sizeOf(e) * boost(k), wd = _lhSpWidth(e.w, sz) + 10;
            // 旋臂模式：詞擠在臂上，一圈只放 55% 才不會疊
            if (used + wd > 2 * Math.PI * r * (spiral ? 0.55 : 1) / (1 + 0.6 * big) && rings[rings.length - 1].length) { rings.push([]); r += RING * boost(k); radii.push(r); used = 0; }
            const kk = rings.length - 1, s2 = sizeOf(e) * boost(kk);
            szOf.set(e, s2);
            rings[kk].push(e);
            used += _lhSpWidth(e.w, s2) + 10;
        }
        cl.r = r + RING * 1.1;
        words.push({ e: star, cl, star: true, color, s: starS, n: norm(star), r: 0, ecc: 1, tilt: 0, th: 0, om: 0 });
        // 同一圈共用扁度、傾角、速度（才不會越轉越擠在一起），每個詞只再帶一點點偏差
        if (spiral) rings.forEach((ring, k) => {
            // 第 k 圈：輪流分給每條臂；每條臂在這圈的中心角＝起始角＋第幾條×(360°/臂數)－捲曲×ln(半徑比)（往旋轉的反方向拖）
            const rk = radii[k], N = cl.arms, per = Array.from({ length: N }, () => []);
            const om = cl.dir * 0.16 * Math.pow(radii[0] / rk, 1.5);   // 克卜勒：越外面越慢
            ring.forEach((e, j) => per[j % N].push(e));
            per.forEach((lst, a) => {
                const ctr = cl.arm0 + a * TAU / N - cl.dir * cl.twist * Math.log(rk / radii[0]);
                const ws = lst.map(e => (_lhSpWidth(e.w, szOf.get(e)) + 10) / rk);
                let ang = ctr - ws.reduce((t, x) => t + x, 0) / 2;
                lst.forEach((e, i) => {
                    words.push({ e, cl, color: tintB(color, e), s: szOf.get(e), n: norm(e), r: rk + (JIT ? (R() - 0.5) * LH_SP_RING * 0.4 : 0),
                        ecc: cl.ecc, tilt: cl.tilt, th: ang + ws[i] / 2, om, br: 3 + R() * 4 });
                    ang += ws[i];
                });
            });
        });
        else rings.forEach((ring, k) => {
            const th0 = R() * TAU, gap = TAU / ring.length;
            const avgN = ring.reduce((t, e) => t + norm(e), 0) / ring.length;   // 0.98.09：大行星（常用、字大）慢、小行星快，照這圈詞的平均大小（同圈共用速度才不會互撞）
            const om = cl.dir * 0.16 / Math.sqrt(k + 1) * (0.9 + R() * 0.2) * (1.55 - 1.1 * avgN);
            const ecc = 0.82 + R() * 0.15, tilt = cl.tilt + (R() - 0.5) * 0.5;
            ring.forEach((e, j) => words.push({ e, cl, color: tintB(color, e), s: szOf.get(e), n: norm(e),
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
    // 團沿黃金角螺旋往外放（最大的先放在中間），彼此多留一點空間給恆星飄
    // 0.98.15.1 Andy：最大星系佔一半以上詞數＝超大星系宇宙，照大小順序、最大的在中間；
    // 否則（星系多、大小較平均）擺放順序打亂（大的仍較常先放）、螺旋起始角和每一步的角度／距離都加隨機，排得有機一點
    const placed = [], total = clusters.reduce((t, c) => t + c.n, 0), organic = clusters.length > 2 && clusters[0].n < total * 0.5;
    const order = organic ? clusters.map(c => [c, c.n * (0.4 + R() * 1.2)]).sort((p, q) => q[1] - p[1]).map(p => p[0]) : clusters;
    const a0 = organic ? R() * TAU : 0;
    order.forEach((cl, i) => {
        for (let k = 0; i > 0; k++) {
            const a = a0 + k * 2.39996 + (organic ? (R() - 0.5) * 0.7 : 0), d = (60 + k * 22) * (organic ? 0.8 + R() * 0.4 : 1);
            cl.x = Math.cos(a) * d; cl.y = Math.sin(a) * d * 0.8;
            if (placed.every(p => Math.hypot(p.x - cl.x, p.y - cl.y) > p.r + cl.r + 90)) break;
        }
        placed.push(cl);
    });
    // 0.98.15 Andy：最大的星系不必釘在原點——整組排好後，把所有星系的外框中心移到 (0,0)（畫面一打開對準的地方），各星系彼此的相對位置不變
    if (clusters.length) {   // 全是流星（沒有星系）就跳過
        const x0 = Math.min(...clusters.map(c => c.x - c.r)), x1 = Math.max(...clusters.map(c => c.x + c.r));
        const y0 = Math.min(...clusters.map(c => c.y - c.r)), y1 = Math.max(...clusters.map(c => c.y + c.r));
        // 0.98.15.2 Andy：不死釘在正中——超大星系宇宙（照大小擺的）整組再隨機偏一點，最多最大星系半徑的 25%
        const jr = organic ? 0 : clusters[0].r * 0.25 * Math.sqrt(R()), ja = R() * TAU;
        // 0.98.20 Andy：三個星系以內、最大的比其他加起來還大 → 最大的恆星就釘在畫面正中（0,0），也不漫遊
        const anchor = clusters.length <= 3 && clusters[0].n > total - clusters[0].n;
        const ox = anchor ? clusters[0].x : (x0 + x1) / 2 + Math.cos(ja) * jr, oy = anchor ? clusters[0].y : (y0 + y1) / 2 + Math.sin(ja) * jr * 0.8;
        if (anchor) clusters[0].vx = clusters[0].vy = 0;
        for (const c of clusters) { c.x -= ox; c.y -= oy; }
    }
    for (const cl of clusters) { cl.hx = cl.x; cl.hy = cl.y; }
    for (const cl of clusters) _lhSpDrift(cl, clusters);
    const bound = Math.max(600, ...clusters.map(c => Math.hypot(c.x, c.y) + c.r)) * 1.25;
    for (const e of comets) {   // 流星：隨機起點、隨機方向，沿著微彎的弧線穿過整片（0.98.08 快一點、直一點），出了邊界從對面回來
        const a = R() * TAU, v = (45 + R() * 45) * 3, cv = (R() < 0.5 ? -1 : 1) * (0.0075 + R() * 0.0175) * 3;   // 0.98.09：速度 3 倍；轉彎速率也 ×3，看起來的彎度維持 0.98.08 的 1/2
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

// 一打開的縮放：近一點，大約 40% 的詞落在畫面裡（0.98.16 Andy：25%→40%）（其他的拖過去、縮小再看）
function _lhSpFitZoom(words) {
    const el = _lhSp.el, W = (el.clientWidth || innerWidth) / 2 - 30, H = (el.clientHeight || innerHeight) / 2 - 40;   // 還藏著（面板還在收）時用視窗大小
    const q = words.filter(w => !w.comet).map(w => {
        const { x, y } = _lhSpOrbit(w);
        return Math.max(Math.abs(x) / W, Math.abs(y) / H);
    }).sort((a, b) => a - b);
    if (!q.length) return 1;
    const pk = q[Math.min(q.length - 1, Math.floor(q.length * 0.5))] || 1;   // 0.98.20 Andy：40%→50%
    return Math.min(2.2, Math.max(LH_SP_FIT_MIN, 1 / pk));   // 打開時最小 0.2（手機上幾千詞的星系，0.1 只剩恆星看得清）；手動還能縮到 LH_SP_ZMIN
}

function lhWsOpen() {
    if (!_lhWs.list.length) return;
    _lhSpShow({ list: _lhWs.list, title: '「' + _lhWs.input + '」', page: 0 });
}

// ===== 關聯詞彙：查單字時選了字卡，列出含這些字的詞（js/cards.js updateBatchCount 開關按鈕） =====
// pos：'head'＝字在詞首、'tail'＝在詞尾、''＝任意位置。len：字數篩選（'2'／'3'／'4'／'m'＝五字以上，可多選，空＝不限）。
// 分團：字＋位置（任意）或字＋字數（詞首／詞尾）
const _lhRel = { chars: [], pos: '', len: new Set() };
function _lhWsRelList(chars, pos, len = new Set()) {
    const set = new Set(chars), out = [];
    for (const e of typeof lhCwMerge === 'function' ? lhCwMerge(wordlistData) : wordlistData || []) {
        const cs = [...e.w], n = cs.length;
        if (n < 2 || n > LH_WS_MAX || _lhWs.hidden.has(e.w)) continue;
        if (len.size && !len.has(n <= 4 ? String(n) : 'm')) continue;
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
// 關聯詞（0.98.10）：一律拿全部的詞，照「字 × 位置（字首／中間／字尾）× 字數（兩字／三字／多字）」拆成獨立星系；
// 「字首／字尾」「兩字／三字／多字」只是把不符合的星系收起來（_lhRelApply），不重排。
// 顏色：只選一個字＝每種位置×字數各一個色相；選了好幾個字＝字分基礎色系，位置調明暗、字數調色偏
const LH_REL_POS = ['首', '中', '尾'], LH_REL_LEN = ['2', '3', '4', 'm'];
const LH_REL_POS_N = { 首: '字首', 中: '中間', 尾: '字尾' }, LH_REL_LEN_N = { 2: '兩字', 3: '三字', 4: '四字', m: '多字' };
const _lhRelCat = (e, set) => {
    const cs = [...e.w], i = cs.findIndex(c => set.has(c));
    // rd：這個字在這個詞裡的實際讀音（含聲調、變調，例如「一」有ㄧ／ㄧˊ／ㄧˋ）；聲調不同跟旋律倒字有關，一律分開，不看「過濾破音字」
    const z = (e.z || '').split(' '), rd = z.length === cs.length ? z[i] : '';
    return { c: cs[i], pos: i === 0 ? '首' : i === cs.length - 1 ? '尾' : '中', len: cs.length <= 4 ? String(cs.length) : 'm', rd };
};
const _LH_REL_REL = CSS.supports('color', 'oklch(from red calc(l + 0.1) c calc(h + 10))');
function _lhRelColor(chars, c, pos, len) {
    const pi = LH_REL_POS.indexOf(pos), li = LH_REL_LEN.indexOf(len);
    if (chars.length === 1) {   // 一個字：3 位置 × 4 字數＝12 種星系各一個色相（從主題強調色轉，不支援相對色就用主題色混）
        const k = pi * 4 + li;
        return _LH_REL_REL ? 'oklch(from var(--highlight-border) l max(c, 0.12) calc(h + ' + Math.round(k * 360 / 12) + '))'
            : LH_WS_TONE_C[k % 5];
    }
    const base = LH_WS_TONE_C[chars.indexOf(c) % 5];
    return _LH_REL_REL ? 'oklch(from ' + base + ' calc(l + ' + [0.09, 0, -0.09][pi] + ') c calc(h + ' + [-18, -6, 6, 18][li] + '))'
        : 'color-mix(in oklab, ' + base + ' ' + [70, 100, 80][pi] + '%, var(' + (pi === 2 ? '--text-secondary' : '--text-primary') + '))';
}
function _lhRelShow() {
    const { chars } = _lhRel;
    const list = _lhWsRelList(chars, '', new Set());
    if (!list.length) { showToast('詞庫裡沒有含這些字的詞'); if (!_lhSp.el || _lhSp.el.hidden) return; }
    const set = new Set(chars);
    // 每個字的讀音照詞數排名：最多的讀音用原色，其他讀音依序調明暗＋小色偏（同類別不同讀音一眼分得出來）
    const cnt = new Map();
    for (const e of list) { const k = _lhRelCat(e, set), id = k.c + k.rd; cnt.set(id, (cnt.get(id) || 0) + 1); }
    const rank = new Map();
    for (const c of chars) [...cnt].filter(([id]) => id.startsWith(c)).sort((a, b) => b[1] - a[1]).forEach(([id], i) => rank.set(id, i));
    // 0.98.14：超過 500 詞的星系再照「這個字是詞裡第幾個字」拆開（第 5 段＝第幾字，例「不」的多字詞拆成第 2／3／4 字）
    const base = e => { const k = _lhRelCat(e, set); return k.c + '|' + k.pos + '|' + k.len + '|' + k.rd; }, bn = new Map();
    for (const e of list) { const b = base(e); bn.set(b, (bn.get(b) || 0) + 1); }
    const poly = new Set(chars.filter(c => [...rank.keys()].filter(id => id.startsWith(c)).length > 1));   // 這批詞裡有兩種以上讀音（含變調）＝破音字
    // 0.98.20 Andy：選的字多（4 個起）標題會折好幾行 → 只寫「N個字」
    _lhSpShow({ list, title: '「' + (chars.length > 3 ? chars.length + '個字' : chars.join('')) + '」關聯詞', rel: true, page: 0, poly,
        catOf: e => _lhRelCat(e, set),
        groupOf: e => { const b = base(e); return bn.get(b) > 500 ? b + '|' + ([...e.w].findIndex(c => set.has(c)) + 1) : b; },
        headOf: key => key.split('|')[0],
        colorOf: key => { const [c, pos, len, rd, ix] = key.split('|'), ri = rank.get(c + rd) || 0, b0 = _lhRelColor(chars, c, pos, len);
            const base = ix && _LH_REL_REL ? 'oklch(from ' + b0 + ' l c calc(h + ' + ((+ix % 3) - 1) * 24 + '))' : b0;   // 細拆的星系：照第幾字轉一點色相
            if (!ri) return base;
            const dl = [0, 0.14, -0.14, 0.24, -0.24][Math.min(ri, 4)], dh = ri % 2 ? 18 : -18;
            return _LH_REL_REL ? 'oklch(from ' + base + ' calc(l + ' + dl + ') c calc(h + ' + dh + '))'
                : 'color-mix(in oklab, ' + base + ' ' + (100 - 15 * Math.min(ri, 4)) + '%, var(' + (dl > 0 ? '--text-primary' : '--text-secondary') + '))'; } });
}
// 篩選：不符合的星系（和流星）收回中心淡出，符合的綻放回來；不重排
function _lhRelApply(now) {
    const { pos, len } = _lhRel, P = { head: '首', tail: '尾' }[pos];
    const ok = k => k && (!P || k.pos === P) && (!len.size || len.has(k.len));
    let n = 0;
    for (const w of _lhSp.words) { w.off = !!w.cat && !ok(w.cat); if (now) w.vis = w.off ? 0 : 1; if (!w.off) n++; if (w.off && w.pinned) { w.pinned = false; _lhSpPin(w); } }
    for (const [cl, b] of _lhSp.legBtns || []) b.hidden = !!cl.cat && !ok(cl.cat);
    const el = _lhSp.el;
    el.querySelectorAll('[data-pos]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.pos === pos)));
    el.querySelectorAll('[data-len]').forEach(b => b.setAttribute('aria-pressed', String(len.has(b.dataset.len))));
    _lhSpTitle(n);
    for (const cl of _lhSp.groups) cl.ver++;
    _lhSp.dirty = true;
    _lhSpClearSync();
    if (!n && !now) showToast('這一批沒有符合的詞，換一批或取消篩選試試');
}

// 打開星雲（或已經開著時換內容）：cfg = { list, title, rel, groupOf, headOf, colorOf }
function _lhSpShow(cfg) {
    const el = _lhSpBuild();
    const reopen = !el.hidden;
    _lhSp.cfg = cfg;
    const batches = _lhSpPages(cfg), pageN = batches.length, page = Math.min(cfg.page || 0, pageN - 1);
    const { words, clusters, bound } = _lhSpLayout(batches[page].filter(e => !_lhWs.hidden.has(e.w)), cfg);   // 這次隱藏過的詞換批也不回來
    _lhSp.bound = bound;
    _lhSp.groups = clusters;
    const n = words.length;
    _lhSpTitle(n);
    // 分批滑桿：超過 630 個才出現；底下的數字是每批的編號
    const pages = el.querySelector('.ws-pages'), pr = pages.querySelector('.ws-page-range');
    pages.hidden = pageN <= 1;
    pr.max = String(pageN - 1); pr.value = String(page);
    pr.setAttribute('aria-valuetext', '第 ' + (page + 1) + ' 批，共 ' + pageN + ' 批');
    pages._mark();
    pages.querySelector('.ws-page-ticks').replaceChildren(...Array.from({ length: pageN }, (_, i) => {   // 數字也能按（0.98.09）
        const b = _lhWsEl('button', i === page ? 'on' : '', String(i + 1));
        b.type = 'button';
        b.setAttribute('aria-label', '第 ' + (i + 1) + ' 批');
        if (i === page) b.setAttribute('aria-current', 'true');
        b.addEventListener('click', () => { if (i !== (_lhSp.cfg.page || 0)) _lhSpWhip(i); });
        return b;
    }));
    el.querySelector('.ws-prev').hidden = page <= 0;
    el.querySelector('.ws-next').hidden = page >= pageN - 1;
    // 圖例：一欄；大類（聲調色系，或關聯詞的字）點開看底下各團，點團導覽過去
    const legend = el.querySelector('.ws-legend');
    legend.replaceChildren();
    const heads = cfg.rel ? _lhRel.chars : [1, 2, 3, 4, 5];
    // 關聯詞的團固定順序：開頭 → 中間 → 結尾；選了字首／字尾時照字數
    const relRank = k => { const [, p, l] = k.split('|'); return LH_REL_POS.indexOf(p) * 4 + LH_REL_LEN.indexOf(l) + (+k.split('|')[4] || 0) / 100; };   // 字首→中間→字尾，各自兩字→三字→四字→多字（細拆的照第幾字）
    _lhSp.legBtns = [];
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
            const label = _lhSpClLabel(cl, cfg);
            const b = _lhWsEl('button', 'ws-leg', label + '（' + cl.n + '）');
            b.type = 'button';
            b.style.setProperty('--c', cl.color);
            b.title = '移到這一團';
            b.addEventListener('click', () => _lhSpGoTo(cl));
            _lhSp.legBtns.push([cl, b]);
            return b;
        }));
        legend.append(head, sub);
    });
    if (_lhSp.legOpen === undefined) _lhSp.legOpen = Math.min(innerWidth, innerHeight) >= 600;   // 預設：電腦／平板展開、手機收起；之後記住使用者的選擇
    _lhSpFxSync();
    // 關聯詞才有的「字首／字尾」（最多選一個，都不選＝任意位置）和字數（可多選）
    for (const box of el.querySelectorAll('.ws-pos')) box.hidden = !cfg.rel;
    el.querySelector('.ws-range').value = '0';
    el.querySelector('.ws-filter-cap').textContent = '常用度：不限';
    _lhSp.pins = [];
    _lhSp.chords = [];
    _lhSp.segs = [];
    _lhSp.hover = null;
    _lhSp.act = null;
    _lhSpTheme();
    _lhSp.words = words.map(it => Object.assign(it, {
        w: it.e.w, p: it.e.p || 0, rgb: _lhSpColor(it.color), phon: _lhWsPhon(it.e), spr: null, tw: _lhSpWidth(it.e.w, it.s) - 22, tH: 22 * it.s,
        cat: cfg.catOf ? cfg.catOf(it.e) : null, off: false, vis: 1, wob: Math.random() * 100, hot: false, pinned: false, kept: savedWords.includes(it.e.w), dim: false, free: false, fx: 0, fy: 0, fvx: 0, fvy: 0, sx: 0, sy: 0, born: 0, mag: 1, kb: 1, twk: 0 }));
    for (const cl of clusters) { const w = _lhSp.words.find(x => x.cl === cl); cl.cat = w ? w.cat : null; }
    // 0.98.20 Andy：進宇宙時已經是保留詞的＝直接釘住、連成星座（再點一下就照常取消釘選＋取消保留）。先用軌道位置當座標，連線才照遠近
    for (const w of _lhSp.words) if (w.kept) { const p = _lhSpPos(w); w.px = p.x; w.py = p.y; w.pinned = true; _lhSpPin(w); }
    _lhSpClearSync();
    if (cfg.rel) _lhRelApply(true);   // 篩選（字首／字尾、字數）換批也照樣套用
    // 分批浮現：一次一個星系（大的先），流星最後；字的小圖先在背景畫好，畫好的那一團才出現，不會有一幀卡很久
    // 0.98.13：大星系再切成一小份一小份（恆星和內圈先），手機不用等整團幾千個字的小圖都畫好才看得到東西；
    // 每份間隔照份數縮短，整個浮現大約 1.4–2.5 秒
    const LH_SP_PIECE = _lhSpCfg().fadeIn ? 32 : 48, q = [];   // 第 1 級一小批（0.98.20）
    // 凝聚（第 4、5 級）：所有星系的恆星一起先浮現（各在自己的位置，不特別置中），行星之後才一份份聚過來
    const starFirst = _lhSpCfg().gather;
    if (starFirst) { const st = _lhSp.words.filter(w => w.star); st.lead = 0; q.push(st); }   // 0.98.14.14：行星跟恆星同時出發（亂撒在畫面外＋慢起步，實際會落在恆星浮現的後半段才進畫面）
    for (const cl of clusters) { const g = _lhSp.words.filter(w => w.cl === cl && !(starFirst && w.star)); for (let i = 0; i < g.length; i += LH_SP_PIECE) q.push(g.slice(i, i + LH_SP_PIECE)); }
    const cm = _lhSp.words.filter(w => w.comet);
    for (let i = 0; i < cm.length; i += LH_SP_PIECE) q.push(cm.slice(i, i + LH_SP_PIECE));
    _lhSp.queue = q;
    _lhSp.gap = Math.max(16, Math.min(140, 1400 / Math.max(1, q.length)));
    // 第 1 級（0.98.16 Andy）：不分批綻放，小圖畫好就原位出現，整張畫布 0.9 秒淡入（換批時鏡頭一甩的動畫建得比較晚，會蓋過這個）
    // 0.98.19 Andy：
    // 第 1 級＝刻意無聊：每份固定間隔（等速），在原位從透明浮現（不綻放、整張畫布不再淡入）
    // 第 4 級＝設計好的螺旋發牌：一開始慢、越發越快（間隔照份數從長縮到很短），整段約 2 秒
    _lhSp.qi = 0; _lhSp.gapFn = null;
    const LV = _lhSpCfg();
    // 第 1 級（0.98.20 Andy）：0.98.19 的「輪流分配」整片到處亂冒、看起來很亂 → 改回跟第 2、3 級一樣一個星系一個星系、由內圈往外一小批一小批，
    // 只是不綻放、在原位從透明浮現（輪流分配版見 git 94f3f9d）
    const qn = q.length;
    if (LV.fadeIn) _lhSp.gap = Math.max(120, Math.min(260, 3200 / Math.max(1, qn)));
    if (LV.spiral && qn > 2) { const g0 = Math.max(40, Math.min(320, 2000 / (0.413 * qn))); _lhSp.gapFn = i => g0 * (0.12 + 0.88 * Math.pow(1 - i / qn, 2)); }
    _lhSp.bornAt = 0;
    _lhSp.px = 0; _lhSp.py = 0;
    _lhSp.nav = null;
    _lhSp.z = _lhSp.z100 = _lhSpFitZoom(_lhSp.words);
    _lhSp.zAcc = _lhSp.pAcc = _lhSp.gD = 0; _lhSp.slices = _lhSp.slCur = null; _lhSp.zPrev = _lhSp.pxPrev = _lhSp.pyPrev = undefined;   // 換宇宙重設縮放、位置：不算成「動很快」
    _lhSp.dpr = Math.min(window.devicePixelRatio || 1, 2);
    _lhSp.S = _lhSp.S0 = Math.min(LH_SP_SMAX, _lhSpBucket(_lhSp.z * _lhSp.dpr));
    _lhSp.dirty = true;
    if (reopen) {   // 已經開著（換字首／字尾、換一批）：直接換內容、重新浮現
        el.hidden = false;
        _lhSp.visible = true;
        _lhSpApplyView();
        _lhSpLegSync();
        _lhSp.t0 = performance.now();
        return;
    }
    // 打開的順序：三塊面板先慢慢收走（1.2 秒）→ 只剩背景（飄字變很淡）→ 星雲淡入、一團團浮現。
    // 面板收走的這段時間，背景已經在畫字的小圖（星雲層還藏著），面板走完就能直接浮現
    // 小螢幕（短邊 < 600px，手機直放橫放都算）：左上面板預設收合（0.98.12 Andy）
    { const pn = el.querySelector('.ws-panel'), min = Math.min(innerWidth, innerHeight) < 600, f = pn.querySelector('.ws-fold');
      pn.classList.toggle('min', min); f.setAttribute('aria-expanded', String(!min)); f.title = min ? '展開面板' : '收合面板'; f.setAttribute('aria-label', f.title); }
    _lhSpLegSync();
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
        _lhSpLegSync();
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
    // 隱藏只在這次星雲裡有效（0.98.09）：關掉就全部還原，詞卡清單也跟著恢復
    _lhWs.hidden.clear();
    if (_lhWs.input && lhWsQuery(document.getElementById('searchInput').value)) lhWsRender(_lhWs.input);
}

function _lhSpKey(e) {
    if (e.key === 'Escape' && !e.isComposing) { e.preventDefault(); e.stopPropagation(); lhWsClose(); }
}

function _lhSpApplyView() {
    _lhSp.dirty = true;
    const b = _lhSp.el.querySelector('.ws-pct');
    if (b) b.textContent = Math.round(_lhSp.z / _lhSpZ100() * 100) + '%';
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
    _lhSp.lineFor = _lhSp.lineCur = null;   // 換主題：星座線顏色重算、不從舊顏色漸層
    _lhSp.cMute = _lhSpColor('var(--text-secondary)');
}
// 字的小圖（字＋淡淡光暈）照某個縮放畫好，每一幀只要貼上去。
// 縮放時先拿舊的小圖放大縮小頂著；手停下來（160ms）才在背景照新縮放把整批畫好，全部畫好再一次換上去（不會一半新一半舊、也不卡）
const _lhSpBucket = z => Math.pow(2, Math.round(Math.log2(Math.max(0.1, z)) * 2) / 2);
function _lhSpSprite(w, S) {
    const fs = 16 * w.s * S, pad = Math.ceil(fs * 0.85);   // 0.98.18：0.6→0.85，光暈（模糊半徑 0.5 字高）不再被小圖邊緣切成方框
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
// 0.98.16 起：保留詞五級一樣（外框＋柔光＋呼吸 3%）；comet＝流星會動，curve＝流星彎度倍數（0 直線）；cometPulse＝流星停著、透明度循環；
// cometHalo＝流星自帶光暈＋固定閃爍；roam＝小星系漫遊速度倍數（0 不漫遊）
const LH_SP_LV = {
    0: { fps: 0, orbit: 0, drag: 'stay', bold: 1 },   // 系統要求減少動態：完全靜止，有變化才畫
    // 第 1 級：不轉、沒變化就不畫（idle）、整片呼吸交給 CSS 縮放畫布；進宇宙整片淡入；流星是孤星，完全不動
    1: { fps: 24, idle: 1, orbit: 0, drag: 'stay', bold: 1, keptBreathe: 0.03, keptGlow: 1, cssBreath: 1, fadeIn: 1, swap: 'fade' },   // 0.98.17：換批也原地淡出淡入
    // 第 2 級：星系一張圖；放手會滑（拖恆星仍整團搬）；星座線固定光暈；換批淡出淡入；流星停著、透明度慢慢循環
    2: { fps: 24, orbit: 0, drag: 'fling', starStay: 1, dock: 1, keptBreathe: 0.03, keptGlow: 1, img: 1, clBreath: 1, lineGlow: 'still', swap: 'fade', cometPulse: 1 },
    // 第 3 級：公轉 0.6 倍、少量閃爍（只亮不放大）；流星走直線；小星系不漫遊
    3: { fps: 30, orbit: 0.6, drag: 'fling', dock: 1, comet: 1, curve: 0, tail: 1, cometGlow: 1, keptBreathe: 0.03, keptGlow: 1, whole: 1, twinkle: 0.4, twFlat: 1, starGlow: 1 },   // 0.98.21 Andy：第 3 級恆星也有光暈
    // 第 4 級：分批浮現（螺旋發牌）、縮放殘影、恆星光暈；流星原本的彎度；小星系漫遊
    4: { fps: 30, orbit: 1, drag: 'fling', dock: 1, spiral: 1, comet: 1, curve: 1, roam: 1, tail: 1, cometGlow: 1, keptBreathe: 0.03, keptGlow: 1, jitter: 1, wobble: 1, drift: 1, push: 1, twinkle: 1, starGlow: 1, whole: 1, lineGlow: 1, zoomTrail: 1 },
    // 第 5 級：混沌凝聚獨有、常駐殘影、星座線常閃；流星彎度 2.5 倍＋光暈＋固定閃爍；小星系漫遊 1.8 倍速
    5: { fps: 60, orbit: 1, drag: 'fling', dock: 1, comet: 1, curve: 2.5, roam: 1.8, tail: 1, cometGlow: 1, cometHalo: 1, keptBreathe: 0.03, keptGlow: 1, jitter: 1, wobble: 1, drift: 1, push: 1, twinkle: 1, starGlow: 1, clBreath: 1, lineGlow: 1, lineFlash: 0.4, zoomTrail: 2, gather: 1, starFx: 1 },
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
        if (!w.born || w.dim || w.off || !inside(w)) continue;
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
    if (_lhSp.visible && q[0].every(w => w.spr) && t - _lhSp.bornAt >= (_lhSp.gapFn ? _lhSp.gapFn(_lhSp.qi || 0) : _lhSp.gap)) {
        const g = q.shift();
        _lhSp.qi = (_lhSp.qi || 0) + 1;
        for (const w of g) w.born = t;
        _lhSp.bornAt = t + (g.lead || 0);
    }
    return true;
}

// 縮放停下來之後：照新縮放在背景把整批小圖畫好（每幀 30 張），全部好了一次換上。回傳還在畫
// 縮放後換小圖的解析度（0.98.15.5 記憶體修正）：以前放大時把「每一個」詞（含畫面外）重畫成高解析小圖，
// 放到最大時「不」1466 詞要 700 MB，手機 Safari 超過畫布上限就整頁重載。現在：
// 1. 只有畫面裡＋外圍 1/4 的詞用目前倍率；畫面外的維持打開時的倍率（_lhSp.S0，很小）
// 2. 倍率上限：觸控裝置 4、滑鼠 6（實際 z × dpr；再大就拿現有小圖放大，略糊但不爆記憶體）
// 3. 一個詞一個詞直接換（不再兩套小圖同時存在）；手還在拖、捏時先不畫，每格最多花 4ms，平移時陸續補
const LH_SP_SMAX = matchMedia('(pointer: coarse)').matches ? 4 : 6;
function _lhSpRescale(t) {
    const Sv = Math.min(LH_SP_SMAX, _lhSpBucket(_lhSp.z * (_lhSp.dpr || 1))), Sb = Math.min(Sv, _lhSp.S0 || Sv);
    if (t - (_lhSp.zt || 0) < 160 || _lhSp.pts.size) return Sv !== _lhSp.S;
    _lhSp.S = Sv;
    const W = _lhSp.W, H = _lhSp.H, mx = W * 0.25, my = H * 0.25, t1 = performance.now();
    let left = false;
    for (const w of _lhSp.words) {
        if (!w.spr) continue;   // 還沒浮現的詞由 _lhSpReveal 負責
        const p = _lhSpScr(w.px || 0, w.py || 0), want = p.x > -mx && p.x < W + mx && p.y > -my && p.y < H + my ? Sv : Sb;
        if (w.spr.S === want) continue;
        if (performance.now() - t1 > 4) { left = true; break; }
        w.spr = _lhSpSprite(w, want);
        _lhSp.rsDirty = _lhSp.dirty = true;
    }
    // 這一輪都換完才讓星系圖（第 2 級）重畫一次，不會每格重畫、也不會停在一半舊一半新
    if (!left && _lhSp.rsDirty) { _lhSp.rsDirty = false; for (const cl of _lhSp.groups) cl.ver++; }
    return left;
}

function _lhSpFrame(t) {
    _lhSp.raf = requestAnimationFrame(_lhSpFrame);
    const L = _lhSpCfg();
    // 省電：照等級限制每秒畫幾次；第 1、2 級沒變化就完全不畫
    if (_lhSp.el && _lhSp.el.classList.contains('ws-breathe') !== !!L.cssBreath) _lhSp.el.classList.toggle('ws-breathe', !!L.cssBreath);
    if (L.fps ? t - (_lhSp.lastDraw || 0) < 1000 / L.fps - 4 || (L.idle && !_lhSp.dirty && !_lhSp.busy) : !_lhSp.dirty && !_lhSp.busy) return;
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
    // 小星系漫遊（第 3 級起，跟流星一樣）：家的位置沿直線走，出了邊界從對面回來
    // 0.98.16 Andy：滑鼠停在恆星上（看全息標籤）時，那一團不飄、不漫遊、不被推，免得自己跑出游標範圍；
    // 停住期間累計 tOff，飄移時間扣掉它 → 放開後從原地接著飄，不會跳一下
    // 0.98.18.2 Andy：滑鼠看行星的面板時恆星照常旅行，只有看恆星時整團停；
    // 0.98.18.4 Andy：觸控時恆星、行星、流星一碰到就定格（連同整團，不然整團還在飄，手指下的字一樣會跑掉）
    const hw = _lhSp.holo && _lhSp.holo.w, tw0 = _lhSp.drag && _lhSp.drag.touch && !_lhSp.drag.moved && _lhSp.drag.w;
    const hc = (hw && hw.star && hw.cl) || (tw0 && tw0.cl);
    if (hc && dt) hc.tOff = (hc.tOff || 0) + dt;
    if (L.roam && dt) {   // 0.98.16：第 3 級不漫遊（跟第 4 級拉開差別），第 5 級 1.8 倍速
        const B = _lhSp.bound;
        for (const cl of _lhSp.groups) {
            if (!cl.vx || cl.held || cl === hc) continue;
            cl.hx += cl.vx * L.roam * dt; cl.hy += cl.vy * L.roam * dt;
            if (cl.hx > B) cl.hx -= 2 * B; else if (cl.hx < -B) cl.hx += 2 * B;
            if (cl.hy > B) cl.hy -= 2 * B; else if (cl.hy < -B) cl.hy += 2 * B;
            if (!L.drift) { cl.x = cl.hx; cl.y = cl.hy; }
        }
    }
    // 恆星在自己的範圍裡慢慢飄（被拖著的那團跟著恆星走）
    if (L.drift) for (const cl of _lhSp.groups) if (!cl.held && cl !== hc) { const Tc = T - (cl.tOff || 0); cl.x = cl.hx + _lhSpDx(cl, Tc); cl.y = cl.hy + _lhSpDy(cl, Tc); }
    // 兩團靠太近：慢慢互相推開（約 12 秒推到位）；被拖著的那團不動，另一團讓開
    if (L.push && dt) {
        const G = _lhSp.groups, kp = 1 - Math.exp(-dt / 4);
        for (let i = 0; i < G.length; i++) for (let j = i + 1; j < G.length; j++) {
            const a = G[i], b = G[j], ah = a.held || a === hc, bh = b.held || b === hc, dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
            const over = a.r + b.r + 30 - d;
            if (over <= 0 || (ah && bh)) continue;
            const m = over * kp, ux = dx / d, uy = dy / d, fa = ah ? 0 : bh ? 1 : 0.5, fb = 1 - fa;
            a.hx -= ux * m * fa; a.hy -= uy * m * fa; b.hx += ux * m * fb; b.hy += uy * m * fb;
            if (!ah) { a.x -= ux * m * fa; a.y -= uy * m * fa; }
            if (!bh) { b.x += ux * m * fb; b.y += uy * m * fb; }
        }
    }
    let gv = 0; const fr = Math.exp(-dt * 3.2),   /* 0.98.16 Andy：甩太遠 → 摩擦 2.2→3.2（滑行距離約剩 7 成） */ damp = Math.exp(-dt * 0.53), K = 0.155, B = _lhSp.bound, drag = _lhSp.drag && _lhSp.drag.w, dg = _lhSp.drag;
    // 黑洞放大：游標附近 240px 內的詞依距離放大，最近的約 2.3 倍，放大縮小都是緩動
    const dock = L.dock, mk = 1 - Math.exp(-dt * 14), mouse = _lhSp.mouse, TAU = Math.PI * 2;
    // 整片星雲一起呼吸（第 1 級）：畫面縮放跟著輕輕放大縮小，6 秒一輪
    // 0.98.21 Andy：切換等級時大小會跳（各級的呼吸不一樣）→ 呼吸的幅度 1 秒內平順過渡到新等級的值，不會一下子縮放
    const bk = dt ? 1 - Math.exp(-dt * 3) : 1;
    _lhSp.wWhole = (_lhSp.wWhole ?? (L.whole ? 1 : 0)) + ((L.whole ? 1 : 0) - (_lhSp.wWhole ?? (L.whole ? 1 : 0))) * bk;
    _lhSp.wCl = (_lhSp.wCl ?? (L.clBreath ? 1 : 0)) + ((L.clBreath ? 1 : 0) - (_lhSp.wCl ?? (L.clBreath ? 1 : 0))) * bk;
    if (Math.abs(_lhSp.wWhole - (L.whole ? 1 : 0)) > 0.002 || Math.abs(_lhSp.wCl - (L.clBreath ? 1 : 0)) > 0.002) busy = true;
    _lhSp.zb = 1 + 0.012 * _lhSp.wWhole * Math.sin(T * TAU / 6);
    // 整團呼吸（第 2 級）：每個星系照自己的節奏（4～7 秒一輪）輕輕放大縮小
    for (const cl of _lhSp.groups) cl.b = 1 + _lhSp.wCl * (cl.ba || 0.03) * Math.sin(T * TAU / cl.bp + cl.ph[0]);
    // 0.98.20 Andy（大風吹）：散開的行星每 0.3 秒重新分配座位，就近歸隊、不跨到對面
    if (t - (_lhSp.seatT || 0) > 300) { _lhSp.seatT = t; _lhSpSeats(); }
    for (const w of _lhSp.words) {
        const still = w.hot || w.pinned || w === hw || (w.comet ? !L.comet : !L.orbit);   // hw：正在看全息標籤的那個（行星也停，0.98.18）   // 停在詞上、釘住、這一級不動的：定格
        // 混沌凝聚（第 5 級）0.98.20 Andy：改用跟「拖恆星沖散」同一套引力（彈簧＋阻尼），只是再慢一倍（剛度 1/4、阻尼 1/2，像沖散後慢慢凝結）；
        // 起點撒在自己恆星周圍、直徑＝星系直徑 2 倍的圓裡。剛浮現的詞才撒（中途切到第 5 級不會把整片打散）
        if (L.gather && w.born && !w.comet && !w.star && w.cl && w.gx0 === undefined) {
            const GT = LH_SP_TUNE.gather, ra = w.cl.r * GT.scatter * Math.sqrt(Math.random()), an = Math.random() * TAU;
            w.gx0 = w.cl.x + Math.cos(an) * ra; w.gy0 = w.cl.y + Math.sin(an) * ra;
            if (t - w.born < 500 && !w.free && w !== drag) Object.assign(w, { free: true, fx: w.gx0, fy: w.gy0, fvx: 0, fvy: 0, gk: Math.max(0.05, 1 - GT.spread / 2 + Math.random() * GT.spread), gt0: t });
        }
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
                // 接任的恆星：拉得更快、不彈（約 1 秒內到中心）。
                // 凝聚中（gk，0.98.21 Andy）：彈簧隨時間越來越緊——剛度 0.04 ×（1＋6×(秒/10)²），阻尼比 0.55：
                // 一開始鬆、慢慢飄近，約 9 秒到 9 成（星系輪廓出來）；後段變緊，衝過頭約 5% 再拉回，最後 6 秒左右小距離定型、約 15.5 秒完全停。
                // 固定的彈簧做不到「衝過頭又很快收好」（阻尼低就回彈 20 秒以上）；age 封頂 30 秒，剛度不會無限變大
                // 數字在 LH_SP_TUNE.gather（k＝0.04、stiff＝6、ramp＝10、damp＝1.1）
                const GT = LH_SP_TUNE.gather, ga = w.gk ? Math.min(30, (t - w.gt0) / 1000) : 0, kg = w.gk ? GT.k * w.gk * (1 + GT.stiff * (ga / GT.ramp) ** 2) : 0;
                const k = w.rising ? 12 : w.gk ? kg : K, dm = w.rising ? Math.exp(-dt * 7) : w.gk ? Math.exp(-dt * GT.damp * Math.sqrt(kg)) : damp;
                w.fvx = (w.fvx + (o.x - w.fx) * k * dt) * dm;
                w.fvy = (w.fvy + (o.y - w.fy) * k * dt) * dm;
                w.fx += w.fvx * dt; w.fy += w.fvy * dt;
                gv = Math.max(gv, Math.min(0.85, Math.hypot(w.fvx, w.fvy) / 400));   // 0.98.16：沖散、甩出去的行星越快，第 5 級殘影越濃
                const tol = w.rising ? 10 : 3;   // 接任的恆星：差不多到中心就接手，不必等完全停穩
                if (Math.hypot(o.x - w.fx, o.y - w.fy) < tol && Math.hypot(w.fvx, w.fvy) < tol * 5) { w.free = false; w.gk = 0; if (w.rising) { w.rising = false; w.star = true; } if (w.cl) w.cl.ver++; }
            }
            busy = true;
        } else if (!still) {
            if (w.comet) {   // 流星走弧線：前進方向慢慢轉（尾巴照前進方向畫，不用記走過的點）
                w.ang += w.cv * (L.curve ?? 1) * dt;
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
        const k = w.born ? Math.min(1, (t - w.born) / 900) : 0;
        if (k < 1 && w.born) busy = true;
        // 篩選掉的星系：收回中心並淡出（0.45 秒）；篩選取消時同一條路綻放回來
        if (w.off ? w.vis > 0 : w.vis < 1) { w.vis = Math.max(0, Math.min(1, w.vis + (w.off ? -1 : 1) * dt / 0.45)); busy = true; }
        const vv = 1 - Math.pow(1 - w.vis, 3);
        const ox = w.cl && !w.star ? w.cl.x : p.x, oy = w.cl && !w.star ? w.cl.y : p.y;
        // 凝聚（第 4、5 級，0.98.14.7 Andy）：打開／換批時每個詞先在整片宇宙亂撒，1.6–2.6 秒慢慢聚回自己的軌道；
        // 只是位置多一道內插，畫的東西不變，不吃效能
        let bx = p.x, by = p.y, ease = (1 - Math.pow(1 - k, 3)) * vv;
        // 凝聚的位置由上面的彈簧算（w.free）；舊版時間內插（0.98.14.7–0.98.19.3）見 git 94f3f9d。恆星不亂撒：原位由透明慢慢浮現
        if (L.gather && w.born && !w.comet && !w.star) ease = vv;
        if (L.fadeIn && w.born) ease = vv;   // 第 1 級：不綻放，就在原位（整片淡入交給畫布 CSS）
        w.ux = ox + (bx - ox) * ease; w.uy = oy + (by - oy) * ease;   // 還沒乘上整團呼吸的位置（星系一張圖照這個畫）
        const b = w.cl && !w.comet ? w.cl.b : 1;
        w.px = w.cl && !w.comet ? w.cl.x + (w.ux - w.cl.x) * b : w.ux;
        w.py = w.cl && !w.comet ? w.cl.y + (w.uy - w.cl.y) * b : w.uy;
        w.alpha = (L.gather && w.star && w.born ? Math.min(1, (t - w.born) / 1400) : L.fadeIn ? (u => u * u * (3 - 2 * u))(Math.min(1, (t - w.born) / 1600)) : Math.min(1, k * 1.6)) * vv;   /* 第 1 級：原位 1.6 秒慢慢浮現（緩進緩出；0.98.19.3 Andy：0.7 秒太像 pop） */
        if (L.fadeIn && w.born && t - w.born < 1600) busy = true;   // 第 1 級沒變化不畫：浮現中要一直畫，不然會停在半透明   // 凝聚模式的恆星 1.4 秒才完全浮現
        // 保留的詞呼吸（第 1、2 級）：3 秒一輪輕輕放大縮小
        w.kb = L.keptBreathe && w.kept && !w.dim ? 1 + L.keptBreathe * Math.sin(t / 3000 * TAU + w.wob) : 1;
        if (w.kb !== 1) busy = true;   // 保留的詞在呼吸：第 1 級（沒變化就不畫）也要繼續畫
        // 凝聚模式的恆星（0.98.14.13 Andy）：除了淡入，也從小變大（0.2→1 倍），比淡入晚 0.35 秒開始、1.4 秒長完；光暈跟著 kb 一起長
        if (L.gather && w.star && w.born) { const kg = Math.max(0, Math.min(1, (t - w.born - 350) / 1400)); if (kg < 1) { w.kb *= 0.2 + 0.8 * (1 - Math.pow(1 - kg, 3)); busy = true; } }
        // 隨機星星閃爍（第 4、5 級）：每秒大約 5 顆；越常用越容易被選到，但最多只多 15%；亮起來時跟著放大一點點
        if (L.twinkle && w.born && !w.dim && dt) {
            if (w.twk && t - w.twk > LH_SP_TUNE.glow.twLen) w.twk = 0;
            if (!w.twk && Math.random() < dt * 0.015 * LH_SP_TUNE.glow.twRate * L.twinkle * (1 + 0.15 * (w.n || 0)) * (w.star ? 0.4 : 1)) w.twk = t;   // 0.98.17：恆星閃爍機率降到 4 成   // 0.98.09：機率 0.006→0.015
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
    _lhSp.busy = busy; _lhSp.gv = gv;
    // 星座：釘住的詞之間的線（_lhSpPin 決定連哪些）
    _lhSp.segs = _lhSp.chords.filter(c => c[0].pinned && c[1].pinned);
    if (_lhSp.lineFor !== _lhSp.pins) { _lhSp.lineFor = _lhSp.pins; _lhSp.lineGoal = _lhSpLineGoal(); }
    { const g = _lhSp.lineGoal, cur = _lhSp.lineCur || (_lhSp.lineCur = g.slice()), k = Math.min(1, (dt || 0.016) * 3);   // 約 0.6 秒漸層過去
        let d = 0; for (let i = 0; i < 3; i++) { cur[i] += (g[i] - cur[i]) * k; d += Math.abs(g[i] - cur[i]); }
        if (d > 1) _lhSp.dirty = true; else cur.splice(0, 3, ...g);
        _lhSp.cLineNow = 'rgb(' + cur.map(Math.round).join(',') + ')'; }
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
    const M = _lhSp.ctx, z = _lhSpZv(), dpr = _lhSp.dpr || 1;
    if (!M || !_lhSp.W || !_lhSp.visible) return;
    M.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 0.98.17：有殘影的等級（4、5），字畫在另一張「殘影層」上，每格只擦掉一部分；光暈（恆星、流星、hover）直接畫在主畫布、每格清乾淨，
    // 最後把殘影層蓋上去 → 光暈不會跟著殘影留下一圈圈的印子（Andy：縮放時恆星光暈跟殘影疊出難看的印記）
    // 0.98.20 Andy：殘影改成「時間切片」（舊的整張擦淡法見 git 94f3f9d）——每 0.12 秒開一張新的切片（0.75 倍解析度），
    // 在畫面上動得快的詞把自己的疊影畫進目前這片；每片記住當時多快 → 決定停多久（越快越久，最多 1.4 秒），停完 0.4 秒淡掉。
    // 舊的片先到期 → 尾巴從尾端開始消失，不是整條一起變透明。疊影整體半透明、墊在字下面，字本身清清楚楚
    const c = M;
    M.clearRect(0, 0, _lhSp.W, _lhSp.H);
    let ghost = null;
    if (!L.zoomTrail && _lhSp.slices) _lhSp.slices = _lhSp.slCur = null;   // 降到沒殘影的等級：放掉切片
    // 縮放殘影（第 5 級，0.98.14.5 Andy）：縮放中不整張擦掉，只把上一格擦淡一部分 → 星星拖出淡淡的殘影；
    // 停手後 0.45 秒內擦得越來越乾淨（殘影自然收掉），之後照常整張清
    // 殘影強度跟著「動得多快」走（0.98.18 Andy）：
    // - 縮放速度（第 4、5 級）、畫面拖曳速度（第 5 級）用「漏水桶」量：每格把變化量倒進去、桶子 0.3 秒漏掉一大半 → 桶裡的量≈最近的速度。
    //   慢慢滾一格只有一點點，連續快滾才滿；停手後跟著桶子自然收掉（約 1 秒）
    // - 第 5 級另外看凝聚、沖散的速度（gv，在位置計算那邊算好）
    // 擦的比例對整張一樣；同一時間跑越快的星星（外圈行星）前後兩格離得越遠，尾巴自然越長
    if (L.zoomTrail) {
        const dts = Math.min(0.1, Math.max(0, (t - (_lhSp.tdT || t)) / 1000)), leak = Math.exp(-dts / 0.3);
        _lhSp.tdT = t;
        const dzF = Math.abs(Math.log(_lhSp.z / (_lhSp.zPrev || _lhSp.z))), dpF = Math.hypot(_lhSp.px - (_lhSp.pxPrev ?? _lhSp.px), _lhSp.py - (_lhSp.pyPrev ?? _lhSp.py));
        _lhSp.zAcc = (_lhSp.zAcc || 0) * leak + dzF;
        _lhSp.pAcc = (_lhSp.pAcc || 0) * leak + dpF;
        // 這一次連續動作累計走了多遠（縮放 4 倍＝1、拖 1200px＝1）；停手超過 0.25 秒就算新的一次
        if (dzF > 1e-4 || dpF > 0.5) { if (t - (_lhSp.gT || 0) > 250) _lhSp.gD = 0; _lhSp.gT = t; _lhSp.gD = (_lhSp.gD || 0) + dzF / Math.log(4) + (L.zoomTrail === 2 ? dpF / 1200 : 0); }
        _lhSp.zPrev = _lhSp.z; _lhSp.pxPrev = _lhSp.px; _lhSp.pyPrev = _lhSp.py;
        const zN = Math.min(1, _lhSp.zAcc / 0.3 / 2), pN = Math.min(1, _lhSp.pAcc / 0.3 / 1800);   // 每秒縮放 e^2 倍（約 7 倍）、每秒拖 1800px 算「最快」
        const mv = L.zoomTrail === 2 ? Math.max(zN, pN, _lhSp.gv || 0) : zN;
        // 停多久：越快越久（最多 1.4 秒，0.98.20 Andy 加長）；第 5 級常駐殘影平常也留一點點（0.06 秒）；第 4 級只有縮放時才留
        // 0.98.21 Andy：停留＝1.0 秒 ×「快不快」×「動多遠」，0～1 秒連續刻度：短距離的快撥、長距離的慢拖都只停一下或不停，又快又遠才停滿
        // （0.98.19 最長 0.8 秒、0.98.20 1.4 秒而且幾乎每次都停滿）。快不快＝最近 0.3 秒的速度（每秒縮放 e^4 倍、拖 3600px 算最快）
        const spdN = Math.max(Math.min(1, _lhSp.zAcc / 0.3 / 4), L.zoomTrail === 2 ? Math.min(1, _lhSp.pAcc / 0.3 / 3600) : 0);
        const TT = LH_SP_TUNE.trail, HOLD = TT.hold, FADE = Math.max(1, TT.fade), SLICE = TT.slice, RS = 0.75;   // 數字在 LH_SP_TUNE.trail
        // 0.98.22 Andy：主要看速度（凝聚、沖散的速度也算），距離只佔兩成——不然凝聚時慢慢收的星星會糊成一團。sw＝快不快 0～1，同時決定停多久、多濃
        const sw = Math.max(0, (Math.max(spdN, L.zoomTrail === 2 ? (_lhSp.gv || 0) * TT.gather : 0) - TT.min) / (1 - Math.min(0.99, TT.min)));
        const hold = HOLD * Math.min(1, sw) * (0.8 + 0.2 * Math.min(1, _lhSp.gD || 0));
        const SL = _lhSp.slices || (_lhSp.slices = []);
        let live = false;
        // 0.98.22 Andy：從尾巴開始收——停手後先停 hold，再用 fade 的時間從最舊的一片掃到最新的一片（不是整條一起淡掉）
        const US = SL.filter(x => x.used).sort((a, b) => a.t0 - b.t0);   // 舊的先畫（墊在下面）
        const nw = US[US.length - 1], span = nw ? nw.tEnd - US[0].t0 + SLICE : 1;
        const cut = nw ? US[0].t0 + span * (1 + Math.max(0.05, TT.edge)) * (t - nw.tEnd - nw.hold) / FADE : 0;   // 掃到哪（時間）；多掃一個柔邊讓最新那片也淡完
        for (const s of US) {
            const ua = 1 - Math.max(0, t - s.tEnd - s.hold) / (FADE + span);   // 一直在動時：太舊的片自己慢慢淡掉
            const v = Math.min(1, ua, (s.tEnd - cut) / (span * Math.max(0.05, TT.edge)));
            if (v <= 0) { s.used = false; continue; }
            live = true;
            M.globalAlpha = TT.alpha * (s.w || 0) * v * v * (3 - 2 * v);   // 越快的片越濃（0.98.22）
            M.drawImage(s.c, 0, 0, _lhSp.W, _lhSp.H);
        }
        M.globalAlpha = 1;
        if (live || _lhSp.zAcc > 0.003 || _lhSp.pAcc > 1 || mv > 0.01) _lhSp.dirty = true;   // 桶子還沒漏完、還有切片在停／在淡：繼續畫
        if (L.zoomTrail === 2 || mv >= 0.03) ghost = () => {   // 有詞要留疊影時才開切片（沒東西動就不花力氣）
            let s = _lhSp.slCur;
            if (!s || !s.used || t - s.t0 >= SLICE) {
                const cw = Math.ceil(_lhSp.W * RS), ch = Math.ceil(_lhSp.H * RS);
                s = SL.find(x => !x.used);
                if (!s) { if (SL.length < 16) SL.push(s = { c: document.createElement('canvas') }); else s = SL.reduce((m, x) => x.tEnd < m.tEnd ? x : m); }   // ponytail: 最多 16 片（約 2 秒），再多就重用最舊的
                if (!s.x || s.c.width !== cw || s.c.height !== ch) { s.c.width = cw; s.c.height = ch; s.x = s.c.getContext('2d'); } else { s.x.setTransform(1, 0, 0, 1, 0, 0); s.x.clearRect(0, 0, cw, ch); }
                s.x.setTransform(RS, 0, 0, RS, 0, 0);
                Object.assign(s, { used: true, t0: t, tEnd: t, hold, w: 0 });
                _lhSp.slCur = s;
            }
            s.tEnd = t; if (hold > s.hold) s.hold = hold; s.w = Math.max(s.w, Math.min(1, sw));
            return s.x;
        };
    }
    const vis = w => { const p = _lhSpScr(w.px, w.py); return p.x > -200 && p.x < _lhSp.W + 200 && p.y > -80 && p.y < _lhSp.H + 80 ? p : null; };
    const pill = (p, w, m) => {   // 詞外面的膠囊（畫面座標）
        const fs = 16 * w.s * z * m, hw = w.tw * z * m / 2 + fs * 0.55, hh = fs * 0.85;
        c.beginPath();
        if (c.roundRect) c.roundRect(p.x - hw, p.y - hh, hw * 2, hh * 2, hh); else c.rect(p.x - hw, p.y - hh, hw * 2, hh * 2);
    };
    const blit = (w, p, m = 1) => { const sw = w.spr.width / w.spr.S * z * m, sh = w.spr.height / w.spr.S * z * m; c.drawImage(w.spr, p.x - sw / 2, p.y - sh / 2, sw, sh); };
    // 星座線
    if (_lhSp.segs.length) {
        // 0.98.14.3 Andy：光暈跟著縮放變粗變細（不然像雷射筆）；用「這次的 100%」當基準、取平方根，放大縮小都柔一點
        const zk = Math.min(2.4, Math.max(0.45, Math.sqrt(z / _lhSpZ100())));
        c.save();
        c.strokeStyle = _lhSp.cLineNow || _lhSp.cLine; c.lineJoin = 'round'; c.lineCap = 'round';
        c.beginPath();
        for (const [a, b] of _lhSp.segs) { const p = _lhSpScr(a.px, a.py), q = _lhSpScr(b.px, b.py); c.moveTo(p.x, p.y); c.lineTo(q.x, q.y); }
        if (L.lineGlow) {   // 第 4 級起：光暈由外而內一層層描（越外越寬越淡），整體慢慢呼吸（一輪約 5.6 秒，跟第 5 級的閃爍各走各的）
            const GL = LH_SP_TUNE.glow, br = L.lineGlow === 'still' ? 0.8 : 1 - GL.lineDepth + GL.lineDepth * Math.sin(t / (GL.lineBreath * 1000) * Math.PI * 2);   // 'still'＝第 2 級：光暈固定不呼吸（不用每格重畫）
            for (const [wd, al] of [[18, 0.025], [11, 0.045], [6.5, 0.08], [3.5, 0.14]]) { c.globalAlpha = al * br; c.lineWidth = wd * zk; c.stroke(); }
        }
        c.globalAlpha = 0.85; c.lineWidth = 1.5 * Math.min(1.6, Math.max(0.7, zk));
        c.shadowColor = c.strokeStyle; c.shadowBlur = 5 * zk;
        c.stroke();
        c.shadowBlur = 0;
        if (L.lineFlash) {   // 第 5 級：所有星座線一起閃（1.2 秒，每秒約 20% 機率；0.98.10 之後從「每條各自閃」改成整體一起）
            const dt = Math.min(0.2, (t - (_lhSp.lineT || t)) / 1000);
            _lhSp.lineT = t;
            const GL = LH_SP_TUNE.glow;
            if (_lhSp.lineTw && t - _lhSp.lineTw > GL.flashLen) _lhSp.lineTw = 0;
            if (!_lhSp.lineTw && Math.random() < dt * L.lineFlash * GL.flashRate) _lhSp.lineTw = t;
            if (_lhSp.lineTw) {
                const f = GL.flash * Math.sin(Math.min(1, (t - _lhSp.lineTw) / GL.flashLen) * Math.PI);   // 上面那條路徑還在，直接再描幾層（寬度一樣跟著縮放）
                for (const [wd, al] of [[15, 0.12], [8, 0.28], [4, 0.5], [2.2, 0.95]]) { c.globalAlpha = al * f; c.lineWidth = wd * zk; c.stroke(); }
            }
        }
        c.restore();
    }
    // 星系一張圖：有詞正在動（停住、放大、拖著、還在浮現）的那一團，這一格改回一個個詞畫
    const asImg = new Set();
    if (L.img && _lhSp.S <= 2) {   // 0.98.15.5：放大後（倍率 > 2）第 2 級改回一詞一圖，星系圖不畫成超大張
        const live = new Set(), drag = _lhSp.drag && _lhSp.drag.w;
        for (const w of _lhSp.words) if (w.cl && (!w.born || t - w.born < 900 || w.hot || w.free || w === drag || w.mag > 1.01 || w.off || w.vis < 1)) live.add(w.cl);
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
    // 看全息標籤的恆星大幅提亮（0.98.14.6／.12）：放射光暈＋彩色發光描好幾層＋疊加提亮，0.3 秒亮起來。
    // 一般、黑洞放大中（滑鼠停住時恆星會被放大，走 mags）、停住／釘住（top）三條路都要呼叫
    const starHi = (w, p, m, a) => {
        if (!_lhSp.holo || _lhSp.holo.w !== w || w.dim) return;
        // 夾 ≥ 0：t0 是滑鼠事件當下的時間，這一格的 rAF 時間可能比它早 → k 變負數，負的 globalAlpha 會被忽略、沿用全亮 → 先閃一下（0.98.14.15 修）
        const k = Math.max(0, Math.min(1, (t - _lhSp.holo.t0) / 300));
        if (k < 1) _lhSp.dirty = true;
        // 0.98.14.15 Andy：亮度、光暈再大幅提高，但光暈半徑最多＝這個星系半徑的一半（照目前縮放與呼吸）
        const R = Math.min(Math.max(60, w.tw * z * m) * 1.8, w.cl ? w.cl.r * z * (w.cl.b || 1) / 2 : 1e9);
        const g = M.createRadialGradient(p.x, p.y, 0, p.x, p.y, R);
        // 0.98.15.3 Andy：中心太濃不像光暈 → 中心降到 0.3、多幾個 stop 讓衰減更平滑
        g.addColorStop(0, _lhSpRGBA(w.rgb, 0.3 * k)); g.addColorStop(0.3, _lhSpRGBA(w.rgb, 0.16 * k)); g.addColorStop(0.6, _lhSpRGBA(w.rgb, 0.06 * k)); g.addColorStop(1, _lhSpRGBA(w.rgb, 0));
        M.fillStyle = g; M.globalAlpha = 1; M.fillRect(p.x - R, p.y - R, R * 2, R * 2);   // 光暈畫在主畫布（不留殘影）
        // 0.98.15.6 Andy：字不再描發光層（太亮），改成跟閃爍一樣：字本身疊加提亮兩次、微微放大 6%
        const mk = m * (1 + 0.06 * k);
        c.save(); c.globalCompositeOperation = 'lighter';
        c.globalAlpha = 0.45 * k; blit(w, p, mk); c.restore();   // 0.98.16 Andy：再調低（兩層 0.8＋0.5 → 一層 0.45）
        c.globalAlpha = a;
        };
    const top = [], mags = [];
    for (const w of _lhSp.words) {
        if (!w.born || !w.spr || w.vis <= 0.01) continue;
        if (w.cl && asImg.has(w.cl) && w.cl.img.ws.has(w)) continue;   // 已經在星系圖裡
        const p = vis(w);
        if (!p) continue;
        // 0.98.18 Andy：只有「在畫面上真的在動」的詞才畫進殘影層（照這一格跟上一格的螢幕位移＋大小變化）；
        // 縮放中心附近的詞幾乎沒位移，留在主畫布 → 不會疊成一團粗糙的光暈；外圈跑得快的行星才拖尾巴
        if (L.zoomTrail) {
            const x0 = w.lsx ?? p.x, y0 = w.lsy ?? p.y, mv1 = Math.hypot(p.x - x0, p.y - y0);
            const ds = mv1 + Math.abs(z - (w.lsz ?? z)) * w.tw * 0.5;
            w.lsx = p.x; w.lsy = p.y; w.lsz = z;
            w.spd = Math.max(ds, (w.spd || 0) * 0.85);   // 停下來後慢慢退，不會一格有疊影、一格沒有而閃
            // 停住、釘住、放大中的詞不留疊影（永遠清清楚楚）
            if (ghost && w.spd > 1.5 && !w.dim && !w.pinned && !w.hot && (w.mag || 1) <= 1.01) {
                const g = ghost(), m = w.kb || 1, sw = w.spr.width / w.spr.S * z * m, sh = w.spr.height / w.spr.S * z * m;
                g.globalAlpha = w.alpha * 0.35;
                g.drawImage(w.spr, p.x - sw / 2, p.y - sh / 2, sw, sh);
                // 0.98.18.3 Andy：上一格到這一格之間用光帶填滿 → 疊影之間連成一片漸層，不是一個一個分開
                if (mv1 > 2 && mv1 < 600) {
                    g.globalAlpha = w.alpha * 0.16; g.strokeStyle = w.rgb; g.lineCap = 'butt';   // 平頭：圓頭每段互相重疊會變成一串珠子
                    g.lineWidth = Math.max(1.5, 16 * w.s * z * 0.45);
                    g.beginPath(); g.moveTo(x0, y0); g.lineTo(p.x, p.y); g.stroke();
                }
            }
        }
        if ((w.star || w.rising) && L.starGlow && !w.dim) {   // 0.98.09：第 4 級起恆星自帶光暈（接任中的也先亮）；放大、釘住、停住時也畫（先畫，墊在所有字後面）
            const R = (w.cl ? w.cl.r / 2 : w.tw) * _lhSpZv() * (w.kb || 1) * (w.mag || 1);   // 光暈半徑＝自己星系半徑的 1/2，中心濃度 13%
            // 0.98.15.6：每種顏色先畫好一張 128px 的光暈圖，每格只貼上去放大（以前每顆恆星每格算一次幾百 px 的放射漸層，筆電內顯最吃這個，約占第 5 級的 4 成）
            // 0.98.16 Andy：中心濃度 0.13→0.18；這顆恆星剛好被抽到閃爍時，光暈跟著暫時亮到 2 倍
            const GL = LH_SP_TUNE.glow, tg = w.twk ? Math.sin(Math.min(1, (t - w.twk) / GL.twLen) * Math.PI) : 0;   // 數字在 LH_SP_TUNE.glow
            M.globalAlpha = Math.min(1, w.alpha * GL.star * (1 + tg * GL.twBoost)); M.drawImage(_lhSpGlowImg(w.rgb, 0.13),   /* 0.98.18.4 Andy：中心再暗（0.18→0.13） */ p.x - R, p.y - R, R * 2, R * 2);
            if (L.starFx && w.star) _lhSpStarFx(M, w, p, t, z);
        }
        if (w.comet && !w.dim && L.tail) {   // 流星尾巴：一整條往後漸細、漸淡的光（連續漸層，不分段），長度＝約 0.8 秒走的路（速度 3 倍後縮短）；放大、釘住時也畫（先畫，墊在字後面）
            const z = _lhSpZv(), k = w.v * 0.8 * z, ex = p.x - Math.cos(w.ang) * k, ey = p.y - Math.sin(w.ang) * k;
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
        // 0.98.16：第 2 級流星停著、透明度 5 秒一輪慢慢循環；第 5 級流星固定閃爍（約 1.6 秒一輪）＋自帶光暈
        const cf = w.comet && L.cometHalo ? 0.65 + 0.35 * Math.sin(t / LH_SP_TUNE.glow.cometFlick + w.wob * 7) : 1;
        const a = w.alpha * (w.dim ? 0.06 : 1) * (w.comet && L.cometPulse ? 0.55 + 0.45 * Math.sin(t / 5000 * Math.PI * 2 + w.wob) : 1);
        if (w.comet && L.cometHalo && !w.dim) { const R = Math.max(26, w.tw * 0.9) * _lhSpZv(); M.globalAlpha = a * LH_SP_TUNE.glow.comet; M.drawImage(_lhSpGlowImg(w.rgb, 0.3),   /* 0.98.18 Andy：光暈恆亮、淡很多（閃的只有字本身） */ p.x - R, p.y - R, R * 2, R * 2); }
        const tw = w.twk ? Math.sin(Math.min(1, (t - w.twk) / LH_SP_TUNE.glow.twLen) * Math.PI) : 0;   // 星星閃爍的亮度（0→1→0）
        const m = (w.kb || 1) * (L.twFlat ? 1 : 1 + 0.1 * tw);
        c.globalAlpha = a;
        blit(w, p, m);
        starHi(w, p, m, a);
        if ((w.comet && L.cometGlow || tw) && !w.dim) {   // 流星加亮、星星閃爍：同一張小圖用發光疊加再貼一次
            c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = a * (tw ? tw : 0.55 * cf); blit(w, p, m); if (tw) { c.globalAlpha = a * 0.7 * tw; blit(w, p, m); } c.restore();   // 星星閃爍疊兩次，比較亮
        }
        if (w.kept && !w.dim) _lhSpKept(c, w, p, a, t, L, pill, blit, m);
    }
    c.globalAlpha = 1;
    for (const [w, p] of mags) {
        const m = w.mag * (w.kb || 1);
        c.globalAlpha = w.alpha * (w.dim ? 0.06 : 1);
        blit(w, p, m);
        starHi(w, p, m, c.globalAlpha);
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
        starHi(w, p, m, 1);
    }
    _lhSpHoloDraw(M, t, z);   // 全息標籤畫在主畫布最上面，不留殘影
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
        cl.hx = w.fx - (L.drift ? _lhSpDx(cl, T - (cl.tOff || 0)) : 0); cl.hy = w.fy - (L.drift ? _lhSpDy(cl, T - (cl.tOff || 0)) : 0); cl.held = false;
        cl.x = w.fx; cl.y = w.fy;
    } else {
        const dx = w.fx - cl.x, dy = w.fy - cl.y, ct = Math.cos(w.tilt), st = Math.sin(w.tilt);
        const c = dx * ct + dy * st, sn = (-dx * st + dy * ct) / (w.ecc || 1);
        w.r = Math.hypot(c, sn); w.th = Math.atan2(sn, c); w.sx = w.sy = 0;
    }
    cl.ver++;
}

// 大風吹（0.98.20 Andy）：散開的行星不一定回自己原本的座位。同一圈（同一星系、同一個公轉速度）裡散開的那幾個，
// 照現在繞恆星的角度排好，整組一起轉一個「總路程最短」的偏移去坐這幾個座位 → 就近歸隊、彼此不交叉；
// 只有座位真的不夠近（一個蘿蔔一個坑）才會被擠去遠一點的位子。新的分法要省 2 成以上路程才換，免得來回改主意
function _lhSpSeats() {
    const TAU = Math.PI * 2, wrap = a => ((a % TAU) + TAU) % TAU, ad = (a, b) => { const d = Math.abs(wrap(a) - wrap(b)); return Math.min(d, TAU - d); };
    const drag = _lhSp.drag && _lhSp.drag.w, rings = new Map();
    for (const w of _lhSp.words) {
        if (!w.free || w.star || w.rising || w.comet || !w.cl || w === drag || w.pinned) continue;
        const k = w.cl.key + '|' + w.om;
        if (!rings.has(k)) rings.set(k, []);
        rings.get(k).push(w);
    }
    for (const ws of rings.values()) {
        const n = ws.length;
        if (n < 2) continue;
        const ang = ws.map(w => { const dx = w.fx - w.cl.x, dy = w.fy - w.cl.y, ct = Math.cos(w.tilt), st = Math.sin(w.tilt); return wrap(Math.atan2((-dx * st + dy * ct) / (w.ecc || 1), dx * ct + dy * st)); });
        const ord = ws.map((_, i) => i).sort((a, b) => ang[a] - ang[b]);
        const seats = ws.map(w => wrap(w.th)).sort((a, b) => a - b);
        let best = 0, bc = Infinity;
        for (let s = 0; s < n; s++) {
            let cst = 0;
            for (let i = 0; i < n && cst < bc; i++) cst += ad(ang[ord[i]], seats[(i + s) % n]);
            if (cst < bc) { bc = cst; best = s; }
        }
        const now = ws.reduce((tt, w, i) => tt + ad(ang[i], w.th), 0);
        if (bc < now * 0.8) ord.forEach((wi, i) => { ws[wi].th = seats[(i + best) % n]; });
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
    const r = Math.random(), want = r < 0.55 ? 1 : r < 0.9 ? 2 : 3;   // 0.98.10：一條 55%、兩條 35%、三條 10%
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

// 星座線的顏色：跟釘住的詞（可能跨好幾個星系）的顏色錯開。每次釘住／取消就重算：
// 把這些詞的色相照彩度加權取「圓周平均」，線用平均的對面色（+180°）；色相太分散（平均向量長度 < 0.45）就避不開，改用白色（淺色主題用主文字色）。
// 都是灰的（流星）或還沒釘：主題強調色
function _lhSpLineGoal() {
    const num = css => _lhSpRGBA(css, 1).slice(5, -1).split(',').slice(0, 3).map(Number);
    const bg = num(_lhSp.cCard), dark = 0.299 * bg[0] + 0.587 * bg[1] + 0.114 * bg[2] < 128;
    let sx = 0, sy = 0, sw = 0;
    for (const w of _lhSp.pins) {
        if (!w.pinned || !w.rgb) continue;
        const [r, g, b] = num(w.rgb).map(v => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = mx - mn;
        if (c < 0.08) continue;   // 幾乎沒顏色的不算
        const h = mx === r ? ((g - b) / c) % 6 : mx === g ? (b - r) / c + 2 : (r - g) / c + 4, a = h * Math.PI / 3;
        sx += Math.cos(a) * c; sy += Math.sin(a) * c; sw += c;
    }
    if (!sw) return num(_lhSp.cLine);
    if (Math.hypot(sx, sy) / sw < 0.45) return dark ? [255, 255, 255] : num(_lhSpColor('var(--text-primary)'));
    const hue = (Math.atan2(sy, sx) * 180 / Math.PI + 180 + 360) % 360;
    return num('hsl(' + Math.round(hue) + ' 75% ' + (dark ? 68 : 40) + '%)');
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
    _lhSpClearNow();
}
// 取消全部選取（也一起取消保留），不問
function _lhSpClearNow() {
    for (const w of _lhSp.pins) if (w.pinned && w.kept) { removeSavedWord(w.w); w.kept = false; }
    _lhSpClear();
}

// 星系的分類名稱（圖例、恆星的全息標籤共用）：關聯詞「中間四字 ㄅㄨˋ 第3字」；押韻詞「一·三」聲調
function _lhSpClLabel(cl, cfg = _lhSp.cfg) {
    const k = cl.key.split('|');
    return cfg && cfg.rel ? LH_REL_POS_N[k[1]] + k[2].replace(/./, x => LH_REL_LEN_N[x]) + ' ' + (k[3] || '') + (k[4] ? ' 第' + k[4] + '字' : '')
        : cl.key.split('·').map(t => LH_WS_TONE_N[t - 1] ? LH_WS_TONE_N[t - 1][0] : t).join('·');
}
// 恆星的全息標籤（0.98.14 Andy）：滑鼠停在恆星上、或手指按住恆星，從恆星拉一條折線出去，框裡寫這個星系的分類和詞數
// 0.98.18 Andy：行星也有（寫讀音）；delay＝晚多久才開始長出來（滑鼠掃過行星不會一路閃面板）
const LH_SP_HOLO_PLANET_WAIT = 1140;   // 恆星的框 0.76 秒長好；行星先等 1.14 秒再長 → 1.9 秒長好＝恆星的 2.5 倍
function _lhSpHolo(w, delay = 0) {
    const h = _lhSp.holo;
    if ((h && h.w) === (w || null)) return;
    _lhSp.holo = w ? { w, t0: performance.now() + delay } : null;
    _lhSp.dirty = true;
}
// 全息標籤的分類，一段一段（0.98.14.2 Andy）：
// 關聯詞＝國字 · 位置 · 字數（破音字在國字後面加聲調符號，例「不（ˋ）」；超大星系細拆的再加「第N字」）；顯示全部＝聲調 · 聲調（例「二聲 · 四聲」）
const _lhSpToneMark = rd => (rd.match(/[ˊˇˋ˙]/) || ['ˉ'])[0];
function _lhSpClParts(cl, cfg = _lhSp.cfg) {
    const k = cl.key.split('|');
    if (!(cfg && cfg.rel)) return cl.key.split('·').map(t => LH_WS_TONE_N[t - 1] || t);
    const ch = k[0] + (cfg.poly && cfg.poly.has(k[0]) && k[3] ? '（' + _lhSpToneMark(k[3]) + '）' : '');
    return [ch, LH_REL_POS_N[k[1]] + (k[4] && k[1] === '中' ? '（' + k[4] + '）' : ''), LH_REL_LEN_N[k[2]]];   // 細拆的第幾字併進位置：「中間（3）」
}
function _lhSpHoloDraw(c, t, z) {
    const h = _lhSp.holo, w = h && h.w;
    if (!w || !w.born || w.off || !_lhSp.words.includes(w)) return;
    if (t < h.t0) { _lhSp.dirty = true; return; }   // 行星：還在等
    // 時間軸（毫秒）：折線 0–520 長出來 → 框 520–760 淡入 → 分類一段一段（每段隔 300、淡入 220）→ 最後詞數
    const parts = w.star ? _lhSpClParts(w.cl) : (w.phon || '').split(' '), age = Math.max(0, t - h.t0),   /* 夾 ≥ 0，理由同 starHi */ LINE = 520, BOX = 240, STEP = 150, FADE = 220;   /* 0.98.19.2 Andy：分段浮現快一倍（STEP 300→150） */
    const tCount = LINE + BOX + parts.length * STEP, k = Math.min(1, age / LINE), e = 1 - Math.pow(1 - k, 3);
    const fade = t0 => Math.max(0, Math.min(1, (age - t0) / FADE));
    if (age < tCount + FADE) _lhSp.dirty = true;
    const p = _lhSpScr(w.px, w.py);
    const r = Math.max(14, (w.tw || 40) * z * (w.mag || 1) / 2 + 6), W = _lhSp.W;
    const SEP = w.star ? '  ·  ' : '  ', t1 = parts.join(SEP), t2 = w.star ? w.cl.n + ' 個詞' : w.w;   // 行星：讀音一個音節一段浮現（注音或拼音照主畫面），下面寫這個詞
    c.save();
    c.font = '600 13px ' + _lhSp.font; const w1 = c.measureText(t1).width;
    c.font = '12px ' + _lhSp.font; const w2 = c.measureText(t2).width;
    const bw = Math.max(170, Math.max(w1, w2) + 24), bh = 52;   // 0.98.16 Andy：最小尺寸加大
    const dir = p.x + r + 70 + bw > W - 8 ? -1 : 1;   // 右邊放不下就往左拉
    const ax = p.x + dir * (r + 4), ay = p.y + 2;   // 從恆星右側（或左側）中間出發，避開右上角的隱藏鈕
    const bx = ax + dir * 30, by = Math.max(bh / 2 + 8, ay - 40), ex = bx + dir * 26;
    c.strokeStyle = w.rgb; c.fillStyle = w.rgb; c.lineWidth = 1.2; c.shadowColor = w.rgb; c.shadowBlur = 6;
    // 折線一段段長出來：斜線 → 橫線
    const seg1 = Math.min(1, e * 2), seg2 = Math.max(0, e * 2 - 1), boxA = Math.max(0, Math.min(1, (age - LINE) / BOX));
    c.globalAlpha = 0.9;
    c.beginPath(); c.arc(ax, ay, 2.2, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.moveTo(ax, ay); c.lineTo(ax + (bx - ax) * seg1, ay + (by - ay) * seg1);
    if (seg2) c.lineTo(bx + (ex - bx) * seg2, by);
    c.stroke();
    if (boxA > 0) {
        const seg2 = boxA, x0 = dir > 0 ? ex : ex - bw, y0 = by - bh / 2;
        c.globalAlpha = seg2;
        c.shadowBlur = 14;
        c.fillStyle = _lhSp.cCard; c.globalAlpha = seg2 * 0.86;
        c.beginPath(); if (c.roundRect) c.roundRect(x0, y0, bw, bh, 4); else c.rect(x0, y0, bw, bh); c.fill();
        c.globalAlpha = seg2; c.shadowBlur = 0; c.stroke();
        // 全息感：框角的亮角＋淡淡的掃描線
        c.lineWidth = 2;
        for (const [x, y, sx, sy] of [[x0, y0, 1, 1], [x0 + bw, y0, -1, 1], [x0, y0 + bh, 1, -1], [x0 + bw, y0 + bh, -1, -1]]) {
            c.beginPath(); c.moveTo(x + sx * 7, y); c.lineTo(x, y); c.lineTo(x, y + sy * 7); c.stroke();
        }
        c.globalAlpha = seg2 * 0.08;
        for (let y = y0 + 3; y < y0 + bh; y += 3) c.fillRect(x0 + 1, y, bw - 2, 1);
        c.globalAlpha = seg2;
        c.textBaseline = 'middle'; c.textAlign = 'left';
        // 分類一段一段浮現，段與段之間用淡色的「·」隔開
        let x = x0 + 10;
        parts.forEach((pt, i) => {
            const a = fade(LINE + BOX + i * STEP);
            c.font = '600 13px ' + _lhSp.font;
            if (i) { c.globalAlpha = a * 0.6; c.fillStyle = _lhSp.cMute; c.fillText(SEP, x, y0 + 15); x += c.measureText(SEP).width; }   // 行星的分隔是空白
            c.globalAlpha = a; c.fillStyle = w.rgb; c.fillText(pt, x, y0 + 15); x += c.measureText(pt).width;
        });
        c.globalAlpha = fade(tCount); c.fillStyle = _lhSp.cMute; c.font = '12px ' + _lhSp.font; c.fillText(t2, x0 + 10, y0 + 31);
    }
    c.restore();
}

// ===== 第 5 級恆星特效（0.98.21 Andy）：日冕、輻射、扭曲——整體偏慢、偏淡、不搶焦點 =====
// 微調只改這張表：a＝透明度，size／len＝大小（恆星字寬的倍數），spin＝每秒轉幾圈，breath／pulse＝亮暗一輪幾秒，speed＝波動每秒幾輪
const LH_SP_STARFX = {
    corona: { a: 0.12, size: 2, spin: 0.008, breath: 7.5, n: 70, amp: 0.05, freq: 2, speed: 0.25 }, // 日冕：細細的放射絲，每條是一道往外走的波（0.98.22.1）：amp＝震幅（日冕半徑倍）、freq＝一條絲上幾個波、speed＝每秒走幾個波
    rays:   { n: 11, a: 0.05, len: 3.2, width: 0.11, spin: 0.008, pulse: 3 }, // 輻射：幾道細長光芒，各自慢慢明滅（彼此錯開）
    heat:   { a: 0.12, amp: 0.02, speed: 0.3 },                             // 熱浪：字本身很輕的晃動（0.98.22 從「扭曲」獨立出來；扭曲光環刪掉）
};
// ===== 0.98.21 Andy 暫時的調參面板（宇宙右上 ⚙）：殘影、光暈閃爍、混沌凝聚、第 5 級恆星特效的數字都在這裡 =====
// 滑桿直接改這張表、即時生效（重新整理會回到這裡寫的值）；Andy 調好按「複製數值」貼給 Claude 寫死，再把 LH_SP_TUNE_UI 改 false 藏起齒輪
const LH_SP_TUNE_UI = true;
const LH_SP_TUNE = {
    trail:  { hold: 1000, fade: 800, alpha: 0.5, slice: 80, min: 0.45, edge: 0.3, gather: 0.25 },   // edge＝尾巴收的柔邊、gather＝凝聚／沖散速度算進殘影的比例（0.98.22.1）   // 0.98.22 Andy 調好的值
    glow:   { star: 3, twBoost: 1.5, twRate: 1.8, twLen: 1400, lineBreath: 5.6, lineDepth: 0.28, flashRate: 1, flashLen: 300, flash: 0.2, comet: 0.05, cometFlick: 140 },
    gather: { k: 0.18, stiff: 12, ramp: 12, damp: 0.5, spread: 0.7, scatter: 2.3 },
    starfx: LH_SP_STARFX,
};
const LH_SP_TUNE_DEF = JSON.parse(JSON.stringify(LH_SP_TUNE));
// [群組, 鍵, 名稱, 最小, 最大, 一格]；恆星特效是 starfx.子群組.鍵
const LH_SP_TUNE_ROWS = [
    ['殘影', [['trail.hold', '最長停留（毫秒）', 0, 2000, 50], ['trail.fade', '從尾巴收完（毫秒）', 50, 2000, 25], ['trail.edge', '尾巴收的柔邊（越大越糊）', 0.05, 1.5, 0.05], ['trail.alpha', '濃度', 0, 1, 0.05],
        ['trail.min', '門檻（多快才開始停）', 0, 0.9, 0.01], ['trail.gather', '凝聚／沖散殘影加成', 0, 1, 0.05], ['trail.slice', '切片間隔（毫秒，越小越密）', 40, 300, 10]]],
    ['光暈閃爍', [['glow.star', '恆星光暈亮度（倍）', 0, 3, 0.05], ['glow.twRate', '星星閃爍頻率（倍）', 0, 4, 0.1], ['glow.twBoost', '閃爍時光暈加亮（倍）', 0, 3, 0.1],
        ['glow.twLen', '一次閃爍多久（毫秒）', 300, 4000, 50], ['glow.lineBreath', '星座線呼吸一輪（秒）', 1, 15, 0.2], ['glow.lineDepth', '星座線呼吸深淺', 0, 0.6, 0.02],
        ['glow.flashRate', '星座線閃光頻率（倍）', 0, 4, 0.1], ['glow.flashLen', '星座線閃光長度（毫秒）', 300, 4000, 50], ['glow.flash', '星座線閃光亮度（倍）', 0, 2, 0.05],
        ['glow.comet', '流星光暈濃度', 0, 1, 0.05], ['glow.cometFlick', '流星閃爍速度（越大越慢）', 60, 1200, 20]]],
    ['混沌凝聚', [['gather.k', '一開始的拉力', 0.005, 0.2, 0.005], ['gather.stiff', '越拉越緊的程度', 0, 20, 0.5], ['gather.ramp', '變緊的時間尺度（秒）', 2, 30, 0.5],
        ['gather.damp', '阻尼（越小擺盪越多次）', 0.2, 2, 0.05], ['gather.spread', '每顆拉力差異', 0, 1, 0.05], ['gather.scatter', '起點散開（星系半徑倍）', 0.5, 4, 0.1]]],
    ['恆星日冕', [['starfx.corona.a', '透明度', 0, 1, 0.01], ['starfx.corona.size', '大小', 0.5, 4, 0.05], ['starfx.corona.spin', '轉速（圈／秒）', 0, 0.1, 0.002], ['starfx.corona.breath', '亮暗一輪（秒）', 1, 30, 0.5],
        ['starfx.corona.n', '細絲數', 0, 200, 5], ['starfx.corona.amp', '波的震幅', 0, 0.3, 0.005], ['starfx.corona.freq', '波的頻率（一條幾個波）', 0, 8, 0.1], ['starfx.corona.speed', '波往外走的速度（波／秒）', 0, 3, 0.05]]],
    ['恆星輻射', [['starfx.rays.n', '光芒數', 0, 16, 1], ['starfx.rays.a', '透明度', 0, 1, 0.01], ['starfx.rays.len', '長度', 0.5, 8, 0.1], ['starfx.rays.width', '粗細', 0.02, 0.5, 0.01],
        ['starfx.rays.spin', '轉速（圈／秒）', 0, 0.1, 0.002], ['starfx.rays.pulse', '明滅一輪（秒）', 1, 30, 0.5]]],
    ['恆星熱浪', [['starfx.heat.a', '透明度', 0, 1, 0.01], ['starfx.heat.amp', '晃動幅度', 0, 0.1, 0.002], ['starfx.heat.speed', '晃動速度（輪／秒）', 0, 2, 0.02]]],
];
const _lhSpTunePath = (o, path) => { const ks = path.split('.'), last = ks.pop(); for (const k of ks) o = o[k]; return [o, last]; };
// 齒輪面板：每組一個標題、每個數字一條滑桿＋目前值；底下「複製數值」「還原預設」
function _lhSpTunePanel() {
    const box = _lhWsEl('div', 'ws-tune');
    box.hidden = true;
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', '宇宙特效調參');
    const inputs = [];
    for (const [name, rows] of LH_SP_TUNE_ROWS) {
        box.append(_lhWsEl('h4', 'ws-tune-h', name));
        for (const [path, label, min, max, step] of rows) {
            const row = _lhWsEl('label', 'ws-tune-row'), out = _lhWsEl('output', 'ws-tune-v'), r = _lhWsEl('input', 'ws-tune-range');
            Object.assign(r, { type: 'range', min: String(min), max: String(max), step: String(step) });
            const sync = () => { const [o, k] = _lhSpTunePath(LH_SP_TUNE, path); r.value = String(o[k]); out.textContent = String(o[k]); };
            r.addEventListener('input', () => { const [o, k] = _lhSpTunePath(LH_SP_TUNE, path); o[k] = +r.value; out.textContent = r.value; _lhSp.dirty = true; });
            row.append(_lhWsEl('span', 'ws-tune-l', label), out, r);
            box.append(row);
            inputs.push(sync);
            sync();
        }
    }
    const acts = _lhWsEl('div', 'ws-tune-acts');
    const copy = _lhWsEl('button', 'ws-tune-btn', '複製數值');
    copy.type = 'button';
    copy.addEventListener('click', () => {
        const txt = JSON.stringify(LH_SP_TUNE);
        navigator.clipboard.writeText(txt).then(() => showToast('已複製宇宙調參數值，貼給 Claude 就好', 2600),
            e => { lhWarn('複製調參數值失敗', e); console.log(txt); showToast('複製失敗：數值印在主控台（Console）', 3000); });
    });
    const reset = _lhWsEl('button', 'ws-tune-btn', '還原預設');
    reset.type = 'button';
    reset.addEventListener('click', () => {
        for (const g of Object.keys(LH_SP_TUNE_DEF)) {
            if (g === 'starfx') for (const s of Object.keys(LH_SP_TUNE_DEF.starfx)) Object.assign(LH_SP_STARFX[s], LH_SP_TUNE_DEF.starfx[s]);
            else Object.assign(LH_SP_TUNE[g], LH_SP_TUNE_DEF[g]);
        }
        inputs.forEach(f => f());
        _lhSp.dirty = true;
    });
    acts.append(copy, reset);
    box.append(acts);
    return box;
}
const _lhSpFxC = new Map();   // 日冕、光芒的小圖：每種顏色畫一次
function _lhSpFxImg(kind, rgb) {
    const key = kind + '|' + rgb;
    let cv = _lhSpFxC.get(key);
    if (cv) return cv;
    cv = document.createElement('canvas');
    const g = cv.getContext('2d');
    if (kind === 'corona') {   // 256×256：中心往外一百多條長短不一的細絲，越外越淡
        cv.width = cv.height = 256;
        g.lineCap = 'round';
        for (let i = 0; i < 150; i++) {
            const a = Math.random() * Math.PI * 2, r0 = 34 + Math.random() * 14, r1 = r0 + 22 + Math.random() * 70;
            const gr = g.createLinearGradient(128 + Math.cos(a) * r0, 128 + Math.sin(a) * r0, 128 + Math.cos(a) * r1, 128 + Math.sin(a) * r1);
            gr.addColorStop(0, _lhSpRGBA(rgb, 0.55)); gr.addColorStop(1, _lhSpRGBA(rgb, 0));
            g.strokeStyle = gr; g.lineWidth = 0.6 + Math.random() * 1.4;
            g.beginPath(); g.moveTo(128 + Math.cos(a) * r0, 128 + Math.sin(a) * r0);
            const bend = (Math.random() - 0.5) * 0.25;   // 微微彎，像日冕的磁力線
            g.quadraticCurveTo(128 + Math.cos(a + bend) * (r0 + r1) / 2, 128 + Math.sin(a + bend) * (r0 + r1) / 2, 128 + Math.cos(a) * r1, 128 + Math.sin(a) * r1);
            g.stroke();
        }
    } else {   // 光芒 256×32：從左端往右漸細漸淡的一道光
        cv.width = 256; cv.height = 32;
        const gr = g.createLinearGradient(0, 0, 256, 0);
        gr.addColorStop(0, _lhSpRGBA(rgb, 0.9)); gr.addColorStop(0.35, _lhSpRGBA(rgb, 0.35)); gr.addColorStop(1, _lhSpRGBA(rgb, 0));
        g.fillStyle = gr;
        g.beginPath(); g.moveTo(0, 6); g.lineTo(256, 16); g.lineTo(0, 26); g.closePath(); g.fill();
    }
    _lhSpFxC.set(key, cv);
    return cv;
}
function _lhSpStarFx(c, w, p, t, z) {
    const F = LH_SP_STARFX, s = t / 1000, ph = w.wob || 0, TAU = Math.PI * 2, m = (w.kb || 1) * (w.mag || 1);
    const Rt = Math.max(8, (w.tw || 40) * z * m * 0.5);   // 以恆星字寬的一半為單位
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.translate(p.x, p.y);
    // 日冕
    // 0.98.22.1 Andy：日冕每條細絲是一道往外走的波（根部固定、越外擺越大）；長短、角度每條固定不變，整圈用一道放射漸層越外越淡
    { const C = F.corona, cr = Rt * C.size, br = 0.75 + 0.25 * Math.sin(TAU * s / C.breath + ph), n = C.n | 0;
      const h = (i, k) => { const x = Math.sin(i * 12.9898 + k * 78.233 + ph * 7) * 43758.5453; return x - Math.floor(x); };
      if (n > 0) {
          const gr = c.createRadialGradient(0, 0, cr * 0.27, 0, 0, cr);
          gr.addColorStop(0, _lhSpRGBA(w.rgb, 0.55)); gr.addColorStop(1, _lhSpRGBA(w.rgb, 0));
          c.save(); c.rotate(TAU * s * C.spin + ph * 3); c.globalAlpha = w.alpha * C.a * br;
          c.strokeStyle = gr; c.lineWidth = Math.max(0.6, cr * 0.008); c.lineCap = 'round';
          c.beginPath();
          for (let i = 0; i < n; i++) {
              const a = (i + h(i, 1)) / n * TAU, r0 = cr * (0.27 + 0.11 * h(i, 2)), r1 = r0 + cr * (0.17 + 0.55 * h(i, 3)), q = h(i, 4) * TAU;
              const ca = Math.cos(a), sa = Math.sin(a);
              for (let k = 0; k <= 10; k++) {
                  const u = k / 10, r = r0 + (r1 - r0) * u, d = C.amp * cr * u * Math.sin(TAU * (C.freq * u - C.speed * s) + q);
                  const x = ca * r - sa * d, y = sa * r + ca * d;
                  if (k) c.lineTo(x, y); else c.moveTo(x, y);
              }
          }
          c.stroke(); c.restore();
      } }
    // 輻射
    { const img = _lhSpFxImg('ray', w.rgb), n = F.rays.n;
      for (let i = 0; i < n; i++) {
          const k = (i * 0.618 + ph) % 1, pu = 0.5 + 0.5 * Math.sin(TAU * s / (F.rays.pulse * (0.8 + 0.4 * k)) + i * 1.7 + ph);
          const len = Rt * F.rays.len * (0.75 + 0.35 * pu), wd = Rt * F.rays.width * 2;
          c.save(); c.rotate(ph * 5 + i * TAU / n + TAU * s * F.rays.spin * (i % 2 ? 1 : -1));
          c.globalAlpha = w.alpha * F.rays.a * pu * pu;
          c.drawImage(img, Rt * 0.55, -wd / 2, len, wd); c.restore();
      } }
    c.restore();
    // 熱浪：字本身很輕的晃動（兩張錯開一點點的小圖墊在字下面）
    if (w.spr && F.heat.a > 0) {
        const sw = w.spr.width / w.spr.S * z * m, sh = w.spr.height / w.spr.S * z * m, sp = TAU * s * F.heat.speed;
        c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = w.alpha * F.heat.a;
        for (const d of [1, -1]) {
            const dx = Math.sin(sp + ph + d) * Rt * F.heat.amp, dy = Math.cos(sp * 0.8 + ph * 2 + d) * Rt * F.heat.amp;
            c.drawImage(w.spr, p.x - sw / 2 + dx, p.y - sh / 2 + dy, sw * (1 + d * 0.01), sh);
        }
        c.restore();
    }
}

// 光暈圖快取：顏色＋中心濃度 → 一張 128×128 的放射漸層（貼上去再放大，看起來跟現場算的一樣）
const _lhSpGlowC = new Map();
function _lhSpGlowImg(rgb, a) {
    const key = rgb + '|' + a;
    let cv = _lhSpGlowC.get(key);
    if (!cv) {
        cv = document.createElement('canvas'); cv.width = cv.height = 128;
        const g = cv.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
        gr.addColorStop(0, _lhSpRGBA(rgb, a)); gr.addColorStop(1, _lhSpRGBA(rgb, 0));
        g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
        _lhSpGlowC.set(key, cv);
    }
    return cv;
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
        if (e.target.closest('.ws-panel, .ws-tune, .ws-legpanel, .ws-legbtn, .ws-pages, .ws-tr')) return;
        e.preventDefault();
        const r = el.getBoundingClientRect();
        _lhSpZoom(_lhSp.z * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    // 滑鼠停在詞上：定格＋外框光暈＋浮出 📌 ✕；剛取消釘選的詞要等游標離開再回來才會再亮（不然看起來像沒取消）
    el.addEventListener('pointermove', e => {
        if (e.pointerType === 'mouse' && _lhSpCfg().dock) {   // 黑洞放大要知道游標在哪
            const r = el.getBoundingClientRect();
            _lhSp.mouse = e.target.closest('.ws-panel, .ws-tune, .ws-legpanel, .ws-legbtn, .ws-tr, .ws-pages, .ws-nav') ? null : { x: e.clientX - r.left, y: e.clientY - r.top };
            _lhSp.dirty = true;
        }
        if (e.pointerType !== 'mouse' || _lhSp.pts.size || e.target.closest('.ws-panel, .ws-tune, .ws-legpanel, .ws-legbtn, .ws-tr, .ws-pages, .ws-nav')) return;
        if (e.target.closest('.ws-acts')) return;
        let w = _lhSpHit(e.clientX, e.clientY);
        if (_lhSp.mute && w !== _lhSp.mute) _lhSp.mute = null;
        if (w && w === _lhSp.mute) w = null;
        _lhSpSetHover(w);
        _lhSpHolo(w || null, w && !w.star ? LH_SP_HOLO_PLANET_WAIT : 0);   // 恆星馬上、行星和流星晚一點（0.98.20：流星也顯示讀音）
    });
    el.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { _lhSp.mouse = null; _lhSp.dirty = true; if (!_lhSp.drag) { _lhSpSetHover(null); _lhSpHolo(null); } } });
    el.addEventListener('pointerdown', e => {
        if (e.target.closest('.ws-panel, .ws-tune, .ws-legpanel, .ws-legbtn, .ws-tr, .ws-acts, .ws-pages, .ws-nav')) return;   // 換批滑桿移出面板後也要排除（0.98.09）
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        _lhSp.nav = null;
        // 0.98.12：第一根手指放下＝之前的手指都離開了；iOS 偶爾漏掉 pointerup，殘留的點會讓第二指湊不成「剛好 2 指」→ 不能縮放
        if (e.isPrimary) _lhSp.pts.clear();
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
            const d = _lhSp.drag = { w, id: e.pointerId, sx: e.clientX, sy: e.clientY, gx: p.x - at.x, gy: p.y - at.y, moved: false, hist: [], touch: e.pointerType !== 'mouse' };
            // 觸控按住恆星 0.35 秒：浮出全息標籤（放手就收），這次放手不算點擊（不釘選）
            clearTimeout(_lhSp.holoTm);
            if (e.pointerType !== 'mouse') _lhSp.holoTm = setTimeout(() => { if (_lhSp.drag === d && !d.moved) { d.held = true; _lhSpHolo(w); } }, w.star ? 350 : 875);   // 觸控按住：恆星 0.35 秒、行星 2.5 倍
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
            if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < (d.w.star ? 18 : 5)) return;   // 0.98.20 Andy：恆星要拖 18px 才算拖（微微晃到不會沖散）
            const L = _lhSpCfg();
            if (!d.moved) {
                d.moved = true; d.w.hot = true; d.w.free = true; d.w.fvx = d.w.fvy = 0;
                el.classList.add('panning');
                if (d.w.star && (L.drag === 'stay' || L.starStay)) d.w.cl.held = true;   // 第 1、2 級：整團跟著恆星走，不沖散
                else if (d.w.star) {   // 拖恆星：整團被沖散、跟著拖走，之後再慢慢聚回來
                    d.w.cl.held = true;
                    for (const o of _lhSp.words) {
                        if (o.cl !== d.w.cl || o === d.w || o.pinned) continue;
                        const at = _lhSpPos(o), a = Math.random() * Math.PI * 2, v = 120 + Math.random() * 220;
                        if (!o.free) { o.fx = at.x; o.fy = at.y; o.fvx = 0; o.fvy = 0; o.free = true; }
                        o.gk = 0;   // 凝聚到一半又被沖散：照一般的速度拉回
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
        if (e.pointerType !== 'mouse') { clearTimeout(_lhSp.holoTm); _lhSpHolo(null); }
        if (_lhSp.pts.size < 2) _lhSp.pinch = null;
        el.classList.remove('panning');
        const d = _lhSp.drag;
        if (d && d.id === e.pointerId) {
            _lhSp.drag = null;
            _lhSp.dirty = true;
            const L = _lhSpCfg();
            if (d.moved && (L.drag === 'stay' || (L.starStay && d.w.star))) {   // 第 1、2 級：拖到哪就停在哪（行星換一條新軌道、恆星帶著整團搬家）
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
            } else if (e.type === 'pointerup' && !d.held) {   // 單擊：釘住＋保留；再點一次釘住的詞＝取消釘選＋取消保留（按住看全息標籤的不算）
                _lhSp.blankTap = null;   // 點過詞，空白的雙擊重新算
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
            const pn = _lhSp.pan;
            _lhSp.pan = null;
            // 點空白（沒拖動）：一律點兩下才全部取消選取（不管選了幾個），不跳確認
            if (e.type === 'pointerup' && !pn.moved && _lhSp.pins.some(w => w.pinned)) {
                const now = e.timeStamp, last = _lhSp.blankTap;
                const dbl = last && now - last.t < 400 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 24;
                _lhSp.blankTap = dbl ? null : { t: now, x: e.clientX, y: e.clientY };
                if (dbl) _lhSpClearNow();
            }
        }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    // iOS Safari：兩指手勢別被瀏覽器拿去縮整頁（gesture* 是 Safari 專有事件）
    for (const t of ['gesturestart', 'gesturechange']) el.addEventListener(t, e => e.preventDefault(), { passive: false });
}
