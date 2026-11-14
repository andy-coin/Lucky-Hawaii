// ==================== 詞卡（多字直接查雙押）與詞宇宙 ====================
// 搜尋欄打「安打」（2–6 個字、中間沒有空白）＝查整個詞的韻：列出詞庫裡符合的詞（詞卡）。選項列換成同母音／同子音／同讀音＋同聲調、排除借韻。
// 打「安 打」（有空白）照舊是兩個字各自的單字韻（js/search.js）。displayResults（js/results.js）一開始就問 lhWsRender，
// 所以換主題、勾選項等所有重畫的路徑都會走到這裡。
// 「顯示全部」：三塊面板往左、上、右收走，所有詞攤在整個畫面上（介面上不說「宇宙」，視覺上是星雲）：
// 同一種聲調組合聚成一團，最常用的詞在中心（恆星），其他詞依常用度一圈圈繞著它轉（行星）；很孤立的詞像流星一樣長距離穿過。
// 停在詞上＝定格＋光暈＋淡淡的 📌（保留）✕（隱藏）；單擊＝釘住；拖曳＝甩到別處（停下後在新的軌道上繼續繞）；空白處拖＝平移；滾輪／雙指＝縮放。
// 詞都是使用者詞庫或覆寫來的字串：一律 textContent，不拼 HTML。

const LH_WS_MIN = 2, LH_WS_MAX = 6;
const LH_WS_PAGE = 240;            // 詞卡一次多畫幾張（捲到底再補）
const LH_WS_SPACE_MAX = 800;       // 「顯示全部」最多放幾個詞（最常用的優先）；ponytail: DOM 節點逐幀移動，再多手機會掉幀，要更多就改畫在 canvas
// 每團一個顏色：主題的四個重點色，再兩兩混出六個（跟著主題走，不寫死色碼）
const _lhMix = (a, b, k = 50) => 'color-mix(in oklab, var(' + a + ') ' + k + '%, var(' + b + '))';
const LH_WS_COLORS = ['var(--highlight-border)', 'var(--accent-2)', 'var(--accent-3)', 'var(--accent-4)',
    _lhMix('--highlight-border', '--accent-2'), _lhMix('--accent-2', '--accent-4'), _lhMix('--accent-3', '--accent-4'),
    _lhMix('--highlight-border', '--accent-3'), _lhMix('--accent-2', '--accent-3'), _lhMix('--danger-line', '--accent-4', 60)];
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
    const z = cs.includes('*') ? null : wordPhoneticMap.get(cs.join(''));
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
    _lhWs.list = lhWsMatch(wordlistData, target, word, _lhWs);
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
    const go = _lhWsEl('button', 'ws-expand-btn', '顯示全部');
    go.type = 'button';
    go.disabled = !_lhWs.list.length;
    go.addEventListener('click', () => lhWsOpen());
    head.append(count, go);
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
        if (card) saveWord(card.dataset.char);
    };
}

// 再畫一頁；最後一張還沒畫完就放一個哨兵，捲到它就再補
function _lhWsMore(grid) {
    const end = Math.min(_lhWs.list.length, _lhWs.shown + LH_WS_PAGE);
    const frag = document.createDocumentFragment();
    for (let i = _lhWs.shown; i < end; i++) {
        const e = _lhWs.list[i];
        const card = _lhWsEl('div', 'char-card ws-card');
        card.dataset.char = e.w;
        card.title = '點一下保留；按住拖到歌詞';
        card.append(_lhWsEl('div', 'char-main', e.w), _lhWsEl('div', 'char-pinyin', _lhWsPhon(e)));
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
const _lhSp = { el: null, world: null, words: [], groups: [], raf: 0, last: 0, t0: 0, z: 1, px: 0, py: 0, pts: new Map(), pan: null, pinch: null, drag: null, nav: null, back: null, bound: 1000 };
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
    const world = _lhWsEl('div', 'ws-world');
    const mk = (cls, txt, label, fn) => { const b = _lhWsEl('button', 'ws-hud-btn ' + cls, txt); b.type = 'button'; b.setAttribute('aria-label', label); b.title = label; b.addEventListener('click', fn); return b; };
    // 左上：標題、各團按鈕（點了導覽過去）、取消選取、常用度篩選
    const panel = _lhWsEl('div', 'ws-panel');
    const title = _lhWsEl('div', 'ws-title');
    const legend = _lhWsEl('div', 'ws-legend');
    const tools = _lhWsEl('div', 'ws-tools');
    const clear = mk('ws-clear', '取消選取', '取消所有釘住的詞', () => { for (const w of _lhSp.words) if (w.pinned) { w.pinned = false; w.hot = false; w.el.classList.remove('pinned', 'hot'); } });
    const fl = _lhWsEl('label', 'ws-filter');
    const fcap = _lhWsEl('span', 'ws-filter-cap', '常用度：不限');
    const range = _lhWsEl('input', 'ws-range');
    range.type = 'range'; range.min = '0'; range.max = '95'; range.step = '5'; range.value = '0';
    range.setAttribute('aria-label', '只顯示比較常用的詞');
    range.addEventListener('input', () => _lhSpFilter(+range.value));
    fl.append(fcap, range);
    tools.append(clear, fl);
    panel.append(title, legend, tools);
    // 右上：縮放與關閉
    const zoom = _lhWsEl('div', 'ws-zoom');
    const pct = mk('ws-pct', '100%', '回到 100%', () => _lhSpZoom(1));
    zoom.append(mk('', '−', '縮小', () => _lhSpZoom(_lhSp.z / 1.25)), pct, mk('', '＋', '放大', () => _lhSpZoom(_lhSp.z * 1.25)));
    const close = mk('ws-close', '', '關閉（Esc）', () => lhWsClose());
    close.innerHTML = LH_SP_X;
    zoom.append(close);
    el.append(world, panel, zoom);
    document.body.append(el);
    _lhSp.el = el;
    _lhSp.world = world;
    _lhSpEvents(el);
    return el;
}

// 常用度篩選：只留前 (100 - v)% 常用的詞；0＝不限
function _lhSpFilter(v) {
    const n = _lhSp.words.length;
    const sorted = [..._lhSp.words].sort((a, b) => b.p - a.p);
    const keep = new Set(sorted.slice(0, Math.max(1, Math.ceil(n * (100 - v) / 100))));
    for (const w of _lhSp.words) w.el.classList.toggle('dim', !keep.has(w));
    _lhSp.el.querySelector('.ws-filter-cap').textContent = v ? '常用度：前 ' + (100 - v) + '%' : '常用度：不限';
}

// 一個詞在畫面上大約多寬（世界座標 px），排軌道用
const _lhSpWidth = (w, s) => [...w].length * 16 * s + 22;

// 分群（聲調組合）→ 每團：最常用的詞在中心，其他依常用度一圈圈排在軌道上；只有 1–2 個詞的團變流星。
// 字的大小照常用度（詞庫的 p，取對數）在 0.8～2 倍之間（最大最小差 2.5 倍）
function _lhSpLayout(list) {
    const lp = list.map(e => Math.log1p(e.p || 0)), lo = Math.min(...lp), hi = Math.max(...lp);
    const sizeOf = e => 0.8 + 1.2 * (hi > lo ? (Math.log1p(e.p || 0) - lo) / (hi - lo) : 0.5);
    const groups = new Map();
    for (const e of list) {
        const k = e.z.split(' ').map(s => getZhuyinTone(s)).join('·');
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(e);
    }
    const G = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
    const words = [], clusters = [], comets = [];
    let ci = 0;
    for (const [key, g] of G) {
        if (g.length <= 2 && G.length > 1) { comets.push(...g); continue; }   // 很孤立的：流星
        const color = LH_WS_COLORS[ci % LH_WS_COLORS.length];
        const cl = { key, n: g.length, color, x: 0, y: 0, r: 0, dir: ci % 2 ? -1 : 1 };
        clusters.push(cl);
        ci++;
        // 軌道：第 k 圈半徑 = 中心詞的一半寬 + k × 間距；沿圓周照寬度依序放，滿了換下一圈；同一圈的詞平均分開
        const star = g[0], rings = [[]];
        let r = _lhSpWidth(star.w, sizeOf(star)) / 2 + LH_SP_RING * 0.9, used = 0;
        const radii = [r];
        for (const e of g.slice(1)) {
            const wd = _lhSpWidth(e.w, sizeOf(e)) + 10;
            if (used + wd > 2 * Math.PI * r && rings[rings.length - 1].length) { rings.push([]); r += LH_SP_RING; radii.push(r); used = 0; }
            rings[rings.length - 1].push(e);
            used += wd;
        }
        cl.r = r + LH_SP_RING;
        words.push({ e: star, cl, s: sizeOf(star), r: 0, th: 0, om: 0 });
        rings.forEach((ring, k) => {
            const th0 = Math.random() * Math.PI * 2;
            const om = cl.dir * 0.16 / Math.sqrt(k + 1);   // 內圈轉得快、外圈慢（像行星）；第一圈約 40 秒一圈
            ring.forEach((e, j) => words.push({ e, cl, s: sizeOf(e), r: radii[k], th: th0 + (2 * Math.PI * j) / ring.length, om }));
        });
    }
    // 團沿黃金角螺旋往外放，不互相重疊
    const placed = [];
    clusters.forEach((cl, i) => {
        for (let k = 0; i > 0; k++) {
            const a = k * 2.39996, d = 60 + k * 22;
            cl.x = Math.cos(a) * d; cl.y = Math.sin(a) * d * 0.8;
            if (placed.every(p => Math.hypot(p.x - cl.x, p.y - cl.y) > p.r + cl.r + 30)) break;
        }
        placed.push(cl);
    });
    const bound = Math.max(600, ...clusters.map(c => Math.hypot(c.x, c.y) + c.r)) * 1.25;
    for (const e of comets) {   // 流星：隨機起點、隨機方向，慢慢地直直穿過整片，出了邊界從對面回來
        const a = Math.random() * Math.PI * 2, v = 28 + Math.random() * 30;
        words.push({ e, cl: null, s: sizeOf(e), comet: true, x: (Math.random() * 2 - 1) * bound, y: (Math.random() * 2 - 1) * bound, vx: Math.cos(a) * v, vy: Math.sin(a) * v, ang: a });
    }
    return { words, clusters, bound };
}

// 一打開的縮放：讓大約 75% 的詞落在畫面裡（詞少就放大一點，詞多就縮小一點）
function _lhSpFitZoom(words) {
    const el = _lhSp.el, W = el.clientWidth / 2 - 30, H = el.clientHeight / 2 - 40;
    const q = words.filter(w => !w.comet).map(w => {
        const x = w.cl.x + w.r * Math.cos(w.th), y = w.cl.y + w.r * Math.sin(w.th);
        return Math.max(Math.abs(x) / W, Math.abs(y) / H);
    }).sort((a, b) => a - b);
    if (!q.length) return 1;
    const p75 = q[Math.min(q.length - 1, Math.floor(q.length * 0.75))] || 1;
    return Math.min(2.2, Math.max(LH_SP_ZMIN, 1 / p75));
}

function lhWsOpen() {
    if (!_lhWs.list.length) return;
    const el = _lhSpBuild();
    const { words, clusters, bound } = _lhSpLayout(_lhWs.list.slice(0, LH_WS_SPACE_MAX));
    _lhSp.bound = bound;
    _lhSp.groups = clusters;
    const n = words.length;
    el.querySelector('.ws-title').textContent = '「' + _lhWs.input + '」· ' + n + (_lhWs.list.length > n ? ' / ' + _lhWs.list.length : '') + ' 個詞';
    // 各團的按鈕：點了導覽到那一團
    el.querySelector('.ws-legend').replaceChildren(...clusters.map(cl => {
        const b = _lhWsEl('button', 'ws-leg', cl.key + ' 聲（' + cl.n + '）');
        b.type = 'button';
        b.style.setProperty('--c', cl.color);
        b.title = '移到這一團';
        b.addEventListener('click', () => _lhSpGoTo(cl));
        return b;
    }));
    el.querySelector('.ws-range').value = '0';
    el.querySelector('.ws-filter-cap').textContent = '常用度：不限';
    _lhSp.world.replaceChildren();
    _lhSp.words = words.map(it => {
        const node = _lhWsEl('div', 'ws-word' + (it.comet ? ' comet' : ''));
        node.style.setProperty('--c', it.cl ? it.cl.color : 'var(--text-secondary)');
        node.style.setProperty('--s', it.s.toFixed(2));
        if (it.comet) node.style.setProperty('--ang', it.ang + 'rad');
        node.title = _lhWsPhon(it.e);
        const keep = _lhWsEl('button', 'ws-keep');
        const hide = _lhWsEl('button', 'ws-hide');
        keep.type = hide.type = 'button';
        keep.innerHTML = LH_SP_PIN;
        hide.innerHTML = LH_SP_X;
        keep.setAttribute('aria-label', '保留「' + it.e.w + '」');
        hide.setAttribute('aria-label', '隱藏「' + it.e.w + '」');
        node.append(_lhWsEl('span', 'ws-txt', it.e.w), keep, hide);
        _lhSp.world.append(node);
        return Object.assign(it, { w: it.e.w, p: it.e.p || 0, el: node, wob: Math.random() * 100, hot: false, pinned: false, free: false, fx: 0, fy: 0, fvx: 0, fvy: 0, sx: 0, sy: 0 });
    });
    _lhSp.back = document.activeElement;
    el.hidden = false;
    _lhSp.px = 0; _lhSp.py = 0;
    _lhSp.z = _lhSpFitZoom(_lhSp.words);
    _lhSpApplyView();
    for (const id of ['leftPanel', 'mainContainer', 'rightPanel', 'mobileTabBar']) { const p = document.getElementById(id); if (p) p.inert = true; }
    document.body.classList.add('ws-anim');   // 三塊面板收走／回來的動畫只在這段期間有（不影響面板平常的收合動畫）
    requestAnimationFrame(() => document.body.classList.add('ws-open'));
    if (typeof lhBgFxHide === 'function') lhBgFxHide(true);   // 背景飄落的字先藏起來，不和漂浮的詞搶
    _lhSp.t0 = performance.now();
    _lhSp.last = 0;
    _lhSp.nav = null;
    cancelAnimationFrame(_lhSp.raf);
    _lhSp.raf = requestAnimationFrame(_lhSpFrame);
    el.querySelector('.ws-close').focus({ preventScroll: true });
    document.addEventListener('keydown', _lhSpKey, true);
}

function lhWsClose() {
    if (!_lhSp.el || _lhSp.el.hidden) return;
    document.body.classList.remove('ws-open');
    document.removeEventListener('keydown', _lhSpKey, true);
    for (const id of ['leftPanel', 'mainContainer', 'rightPanel', 'mobileTabBar']) { const p = document.getElementById(id); if (p) p.inert = false; }
    if (typeof syncCenterPanel === 'function') syncCenterPanel();   // 收起的面板要回到 inert（syncCenterPanel 是唯一管 inert 的地方）
    if (typeof lhBgFxHide === 'function') lhBgFxHide(false);
    const el = _lhSp.el;
    setTimeout(() => { if (!document.body.classList.contains('ws-open')) { el.hidden = true; document.body.classList.remove('ws-anim'); cancelAnimationFrame(_lhSp.raf); _lhSp.raf = 0; } }, _lhSpReduce.matches ? 0 : 600);
    if (_lhSp.back && _lhSp.back.isConnected) _lhSp.back.focus({ preventScroll: true });
    // 這裡隱藏的詞，清單也一起拿掉
    if (_lhWs.input && lhWsQuery(document.getElementById('searchInput').value)) lhWsRender(_lhWs.input);
}

function _lhSpKey(e) {
    if (e.key === 'Escape' && !e.isComposing) { e.preventDefault(); e.stopPropagation(); lhWsClose(); }
}

function _lhSpApplyView() {
    _lhSp.world.style.transform = 'translate(' + _lhSp.px + 'px,' + _lhSp.py + 'px) scale(' + _lhSp.z + ')';
    _lhSp.world.style.setProperty('--z', String(_lhSp.z));   // 📌 ✕ 反向縮放，不管怎麼縮放都一樣大
    const b = _lhSp.el.querySelector('.ws-pct');
    if (b) b.textContent = Math.round(_lhSp.z * 100) + '%';
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
    return { x: w.cl.x + w.r * Math.cos(w.th) + w.sx, y: w.cl.y + w.r * Math.sin(w.th) + w.sy };
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
    const fr = Math.exp(-dt * 2.2), B = _lhSp.bound, drag = _lhSp.drag && _lhSp.drag.w;
    for (const w of _lhSp.words) {
        const still = w.hot || w.pinned || reduce;   // 停在詞上、釘住：定格
        if (w !== drag) {
            if (w.free) {   // 甩出去：照速度滑，摩擦慢慢停；停下來就在新位置接上這一團的軌道繼續繞
                w.fx += w.fvx * dt; w.fy += w.fvy * dt;
                w.fvx *= fr; w.fvy *= fr;
                if (Math.hypot(w.fvx, w.fvy) < 6 && !w.comet) {
                    const dx = w.fx - w.cl.x, dy = w.fy - w.cl.y;
                    w.r = Math.hypot(dx, dy); w.th = Math.atan2(dy, dx); w.sx = w.sy = 0;
                    w.om = w.cl.dir * 0.16 / Math.sqrt(Math.max(1, w.r / LH_SP_RING));
                    w.free = false;
                } else if (Math.hypot(w.fvx, w.fvy) < 6) { w.x = w.fx; w.y = w.fy; w.free = false; }
            } else if (!still) {
                if (w.comet) {
                    w.x += w.vx * dt; w.y += w.vy * dt;
                    if (w.x > B) w.x = -B; else if (w.x < -B) w.x = B;
                    if (w.y > B) w.y = -B; else if (w.y < -B) w.y = B;
                } else {
                    w.th += w.om * dt;
                    w.wob += dt;
                    w.sx = Math.sin(w.wob * 0.7) * 2.5; w.sy = Math.cos(w.wob * 0.55) * 2.5;   // 一點點呼吸，不會像在游泳
                }
            }
        }
        const p = _lhSpPos(w);
        w.el.style.transform = 'translate3d(' + (p.x * ease).toFixed(1) + 'px,' + (p.y * ease).toFixed(1) + 'px,0) translate(-50%,-50%)';
    }
}

function _lhSpWordOf(t) {
    const n = t && t.closest && t.closest('.ws-word');
    return n ? _lhSp.words.find(w => w.el === n) : null;
}

function _lhSpEvents(el) {
    // 停在詞上：定格＋光暈＋淡淡的按鈕（觸控沒有 hover，靠單擊釘住）
    el.addEventListener('pointerover', e => {
        if (e.pointerType !== 'mouse') return;
        const w = _lhSpWordOf(e.target);
        if (w && !w.hot) { w.hot = true; w.el.classList.add('hot'); }
    });
    el.addEventListener('pointerout', e => {
        const w = _lhSpWordOf(e.target);
        if (!w || w.el.contains(e.relatedTarget) || (_lhSp.drag && _lhSp.drag.w === w)) return;
        w.hot = false;
        w.el.classList.remove('hot');
    });
    el.addEventListener('click', e => {
        const w = _lhSpWordOf(e.target);
        if (!w) return;
        if (e.target.closest('.ws-keep')) { saveWord(w.w); w.el.classList.add('kept'); return; }
        if (e.target.closest('.ws-hide')) {
            _lhWs.hidden.add(w.w);
            w.el.classList.add('gone');
            _lhSp.words = _lhSp.words.filter(x => x !== w);
            setTimeout(() => w.el.remove(), 300);
        }
    });
    el.addEventListener('wheel', e => {
        if (e.target.closest('.ws-panel')) return;
        e.preventDefault();
        const r = el.getBoundingClientRect();
        _lhSpZoom(_lhSp.z * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    el.addEventListener('pointerdown', e => {
        if (e.target.closest('.ws-panel, .ws-zoom, .ws-keep, .ws-hide')) return;
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
        const w = _lhSpWordOf(e.target);
        if (w) {
            const p = _lhSpToWorld(e.clientX, e.clientY), at = _lhSpPos(w);
            _lhSp.drag = { w, id: e.pointerId, sx: e.clientX, sy: e.clientY, gx: p.x - at.x, gy: p.y - at.y, moved: false, hist: [] };
        } else _lhSp.pan = { id: e.pointerId, x: e.clientX, y: e.clientY };
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
            if (!d.moved) { d.moved = true; d.w.el.classList.add('dragging', 'hot'); d.w.hot = true; d.w.free = true; d.w.fvx = d.w.fvy = 0; }
            const p = _lhSpToWorld(e.clientX, e.clientY);
            d.w.fx = p.x - d.gx; d.w.fy = p.y - d.gy;
            d.hist.push({ t: e.timeStamp, x: p.x, y: p.y });
            if (d.hist.length > 6) d.hist.shift();
            return;
        }
        const p = _lhSp.pan;
        if (p && p.id === e.pointerId) {
            _lhSp.px += e.clientX - p.x; _lhSp.py += e.clientY - p.y;
            p.x = e.clientX; p.y = e.clientY;
            el.classList.add('panning');
            _lhSpApplyView();
        }
    });
    const end = e => {
        if (!_lhSp.pts.delete(e.pointerId)) return;
        if (_lhSp.pts.size < 2) _lhSp.pinch = null;
        const d = _lhSp.drag;
        if (d && d.id === e.pointerId) {
            _lhSp.drag = null;
            d.w.el.classList.remove('dragging');
            if (d.moved) {
                // 甩動：用最後一小段的速度（世界座標／秒）繼續滑，摩擦慢慢停下
                const h = d.hist, a = h[0], b = h[h.length - 1];
                const dt = b && a && b.t > a.t ? (b.t - a.t) / 1000 : 0;
                if (dt > 0 && e.timeStamp - b.t < 80) {
                    const vmax = 2400;
                    d.w.fvx = Math.max(-vmax, Math.min(vmax, (b.x - a.x) / dt));
                    d.w.fvy = Math.max(-vmax, Math.min(vmax, (b.y - a.y) / dt));
                }
                if (!d.w.pinned && !d.w.el.matches(':hover')) { d.w.hot = false; d.w.el.classList.remove('hot'); }
            } else if (e.type === 'pointerup') {   // 單擊：釘住／放開（維持光暈與定格）
                d.w.pinned = !d.w.pinned;
                d.w.el.classList.toggle('pinned', d.w.pinned);
                if (!d.w.pinned && e.pointerType !== 'mouse') { d.w.hot = false; d.w.el.classList.remove('hot'); }
            }
        }
        if (_lhSp.pan && _lhSp.pan.id === e.pointerId) { _lhSp.pan = null; el.classList.remove('panning'); }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
}
