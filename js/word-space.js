// ==================== 詞卡（多字直接查雙押）與詞宇宙 ====================
// 搜尋欄打「安打」（2–6 個字、中間沒有空白）＝查整個詞的韻：列出詞庫裡每個字都押韻的詞（詞卡），可選同聲調、排除借韻。
// 打「安 打」（有空白）照舊是兩個字各自的單字韻（js/search.js）。displayResults（js/results.js）一開始就問 lhWsRender，
// 所以換主題、勾選項等所有重畫的路徑都會走到這裡。
// 「展開詞宇宙」：三塊面板往左、上、右收走，所有詞在背景飄字（js/bgfx.js，加深）上慢慢漂；
// 停在詞上＝定格＋光暈＋淡淡的「保留」「隱藏」；單擊＝釘住（維持光暈與定格）；拖曳＝甩到別處；空白處拖＝平移；滾輪／雙指＝縮放。
// 詞都是使用者詞庫或覆寫來的字串：一律 textContent，不拼 HTML。

const LH_WS_MIN = 2, LH_WS_MAX = 6;
const LH_WS_PAGE = 240;            // 詞卡一次多畫幾張（捲到底再補）
const LH_WS_SPACE_MAX = 800;       // 詞宇宙最多放幾個詞（最常用的優先）；ponytail: DOM 節點逐幀移動，再多手機會掉幀，要更多就改畫在 canvas
const LH_WS_COLORS = ['--highlight-border', '--accent-2', '--accent-3', '--accent-4', '--text-primary', '--text-secondary'];
const _lhWs = { key: '', input: '', target: null, list: [], shown: 0, tone: false, strict: false, hidden: new Set(), io: null };

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

// 純函式：詞庫裡每個字都押到目標的詞，常用的在前。tone＝每個字也要同聲調；strict＝排除借韻（韻母完全相同才算）
function lhWsMatch(entries, target, word, { tone, strict, hidden } = {}) {
    const n = target.length, out = [];
    for (const e of entries) {
        if (e.w.length !== n || e.w === word || (hidden && hidden.has(e.w))) continue;
        const syl = e.z.split(' ');
        if (syl.length !== n) continue;
        let ok = true;
        for (let i = 0; i < n && ok; i++) {
            const t = target[i];
            if (!t) continue;
            if (!lhRhymeMatch(getZhuyinRhyme(syl[i]), t.rhyme, strict)) ok = false;
            else if (tone && getZhuyinTone(syl[i]) !== t.tone) ok = false;
        }
        if (ok) out.push(e);
    }
    return out.sort((a, b) => (b.p || 0) - (a.p || 0));
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
    const count = _lhWsEl('div', 'results-count', '押「' + word + '」的詞：' + _lhWs.list.length.toLocaleString('zh-TW') + ' 個');
    const opts = _lhWsEl('div', 'ws-opts');
    for (const [k, label, tip] of [['tone', '同聲調', '每個字的聲調也要一樣'], ['strict', '排除借韻', '韻母完全相同才算（ㄢ 不收 ㄧㄢ、ㄨㄢ）']]) {
        const lb = _lhWsEl('label', 'checkbox-label');
        const cb = _lhWsEl('input');
        cb.type = 'checkbox';
        cb.checked = _lhWs[k];
        cb.addEventListener('change', () => { _lhWs[k] = cb.checked; lhWsRender(word); });
        lb.title = tip;
        lb.append(cb, document.createTextNode(' ' + label));
        opts.append(lb);
    }
    const go = _lhWsEl('button', 'ws-expand-btn', '✦ 展開詞宇宙');
    go.type = 'button';
    go.disabled = !_lhWs.list.length;
    go.addEventListener('click', () => lhWsOpen());
    head.append(count, opts, go);
    if (!_lhWs.list.length) {
        container.replaceChildren(head, _lhWsEmpty('沒有每個字都押到的詞', _lhWs.tone || _lhWs.strict ? '把「同聲調」「排除借韻」取消試試' : '試試少一個字，或用 * 代替不必押的字（例：*打）'));
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

// ==================== 詞宇宙 ====================
const _lhSp = { el: null, world: null, words: [], raf: 0, last: 0, t0: 0, z: 1, px: 0, py: 0, pts: new Map(), pan: null, pinch: null, drag: null, back: null };
const LH_SP_ZMIN = 0.3, LH_SP_ZMAX = 3;
const _lhSpReduce = matchMedia('(prefers-reduced-motion: reduce)');

function _lhSpBuild() {
    if (_lhSp.el) return _lhSp.el;
    const el = _lhWsEl('div', 'ws-space');
    el.id = 'wordSpace';
    el.hidden = true;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', '詞宇宙');
    const world = _lhWsEl('div', 'ws-world');
    const hud = _lhWsEl('div', 'ws-hud');
    const title = _lhWsEl('div', 'ws-title');
    const zoom = _lhWsEl('div', 'ws-zoom');
    const mk = (txt, label, fn) => { const b = _lhWsEl('button', 'ws-hud-btn', txt); b.type = 'button'; b.setAttribute('aria-label', label); b.title = label; b.addEventListener('click', fn); return b; };
    const pct = mk('100%', '回到 100%', () => _lhSpZoom(1));
    pct.classList.add('ws-pct');
    zoom.append(mk('−', '縮小', () => _lhSpZoom(_lhSp.z / 1.25)), pct, mk('＋', '放大', () => _lhSpZoom(_lhSp.z * 1.25)));
    const close = mk('收合', '收合詞宇宙（Esc）', () => lhWsClose());
    close.classList.add('ws-close');
    hud.append(title, zoom, close, _lhWsEl('div', 'ws-legend'));
    el.append(world, hud);
    document.body.append(el);
    _lhSp.el = el;
    _lhSp.world = world;
    _lhSpEvents(el);
    return el;
}

// 分群：聲調組合（例如 1·3 聲）一群、一個顏色、聚在一起（韻母大多相同，用聲調分才看得出差別）。群依大小排，沿螺旋往外放，不互相重疊
function _lhSpLayout(list) {
    const groups = new Map();
    for (const e of list) {
        const k = e.z.split(' ').map(s => getZhuyinTone(s)).join('·');
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(e);
    }
    const G = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
    const C = 58, placed = [], out = [];
    out.legend = G.map(([k, g], gi) => ({ label: k + ' 聲', n: g.length, c: LH_WS_COLORS[gi % LH_WS_COLORS.length] }));
    const pmax = Math.log1p(Math.max(1, ...list.map(e => e.p || 0)));
    G.forEach(([, g], gi) => {
        const R = C * Math.sqrt(g.length) + C;
        let cx = 0, cy = 0;
        for (let k = 0; gi > 0; k++) {   // 沿黃金角螺旋找第一個不和已放的群重疊的位置
            const a = k * 2.39996, r = 40 + k * 18;
            cx = Math.cos(a) * r; cy = Math.sin(a) * r * 0.72;
            if (placed.every(p => Math.hypot(p.x - cx, (p.y - cy) / 0.72) > p.r + R)) break;
        }
        placed.push({ x: cx, y: cy, r: R });
        g.forEach((e, i) => {   // 群內用向日葵排列：最常用的在中心
            const a = i * 2.39996, r = C * Math.sqrt(i + 0.5);
            out.push({ e, x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * 0.72, c: LH_WS_COLORS[gi % LH_WS_COLORS.length], s: Math.log1p(e.p || 0) / pmax });
        });
    });
    return out;
}

function lhWsOpen() {
    if (!_lhWs.list.length) return;
    const el = _lhSpBuild();
    const items = _lhSpLayout(_lhWs.list.slice(0, LH_WS_SPACE_MAX));
    el.querySelector('.ws-title').textContent = '「' + _lhWs.input + '」的詞宇宙 · ' + items.length + (_lhWs.list.length > items.length ? ' / ' + _lhWs.list.length : '') + ' 個詞';
    // 圖例：顏色＝聲調組合（前 6 群；更多群顏色會重複）
    el.querySelector('.ws-legend').replaceChildren(...items.legend.slice(0, LH_WS_COLORS.length).map(g => {
        const s = _lhWsEl('span', 'ws-leg', g.label + '（' + g.n + '）');
        s.style.setProperty('--c', 'var(' + g.c + ')');
        return s;
    }));
    _lhSp.world.replaceChildren();
    _lhSp.words = items.map(it => {
        const n = _lhWsEl('div', 'ws-word');
        n.style.setProperty('--c', 'var(' + it.c + ')');
        n.style.setProperty('--s', (0.9 + it.s * 0.9).toFixed(2));
        n.dataset.word = it.e.w;
        n.title = _lhWsPhon(it.e);
        const keep = _lhWsEl('button', 'ws-keep', '保留');
        const hide = _lhWsEl('button', 'ws-hide', '隱藏');
        keep.type = hide.type = 'button';
        n.append(_lhWsEl('span', 'ws-txt', it.e.w), keep, hide);
        _lhSp.world.append(n);
        return {
            w: it.e.w, el: n, hx: it.x, hy: it.y, vx: 0, vy: 0, t: Math.random() * 100,
            f1: 0.05 + Math.random() * 0.08, f2: 0.04 + Math.random() * 0.07, amp: 10 + Math.random() * 22,
            ox: 0, oy: 0, hot: false, pinned: false,
        };
    });
    // 一打開就縮到大部分群都看得到（最小 55%，字才不會小到讀不了）
    const ext = Math.max(1, ...items.map(it => Math.max(Math.abs(it.x), Math.abs(it.y) / 0.72)));
    _lhSp.z = Math.max(0.55, Math.min(1, Math.min(innerWidth, innerHeight / 0.72) * 0.5 / ext));
    _lhSp.px = 0; _lhSp.py = 0;
    _lhSpApplyView();
    _lhSp.back = document.activeElement;
    el.hidden = false;
    for (const id of ['leftPanel', 'mainContainer', 'rightPanel', 'mobileTabBar']) { const p = document.getElementById(id); if (p) p.inert = true; }
    document.body.classList.add('ws-anim');   // 三塊面板收走／回來的動畫只在這段期間有（不影響面板平常的收合動畫）
    requestAnimationFrame(() => document.body.classList.add('ws-open'));
    if (typeof lhBgFxBoost === 'function') lhBgFxBoost(2.4);
    _lhSp.t0 = performance.now();
    _lhSp.last = 0;
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
    if (typeof lhBgFxBoost === 'function') lhBgFxBoost(1);
    const el = _lhSp.el;
    setTimeout(() => { if (!document.body.classList.contains('ws-open')) { el.hidden = true; document.body.classList.remove('ws-anim'); cancelAnimationFrame(_lhSp.raf); _lhSp.raf = 0; } }, _lhSpReduce.matches ? 0 : 600);
    if (_lhSp.back && _lhSp.back.isConnected) _lhSp.back.focus({ preventScroll: true });
    // 宇宙裡隱藏的詞，清單也一起拿掉
    if (_lhWs.input && lhWsQuery(document.getElementById('searchInput').value)) lhWsRender(_lhWs.input);
}

function _lhSpKey(e) {
    if (e.key === 'Escape' && !e.isComposing) { e.preventDefault(); e.stopPropagation(); lhWsClose(); }
}

function _lhSpApplyView() {
    _lhSp.world.style.transform = 'translate(' + _lhSp.px + 'px,' + _lhSp.py + 'px) scale(' + _lhSp.z + ')';
    const b = _lhSp.el.querySelector('.ws-pct');
    if (b) b.textContent = Math.round(_lhSp.z * 100) + '%';
}

// 以畫面上 (cx, cy)（相對宇宙左上角，省略＝中心）為中心縮放
function _lhSpZoom(z, cx, cy) {
    const el = _lhSp.el;
    z = Math.min(LH_SP_ZMAX, Math.max(LH_SP_ZMIN, z));
    if (cx === undefined) { cx = el.clientWidth / 2; cy = el.clientHeight / 2; }
    // 世界原點在畫面中心：畫面點 = 中心 + p + 世界點 × z
    const ox = el.clientWidth / 2, oy = el.clientHeight / 2;
    const wx = (cx - ox - _lhSp.px) / _lhSp.z, wy = (cy - oy - _lhSp.py) / _lhSp.z;
    _lhSp.z = z;
    _lhSp.px = cx - ox - wx * z;
    _lhSp.py = cy - oy - wy * z;
    _lhSpApplyView();
}

function _lhSpToWorld(x, y) {
    const r = _lhSp.el.getBoundingClientRect();
    return { x: (x - r.left - r.width / 2 - _lhSp.px) / _lhSp.z, y: (y - r.top - r.height / 2 - _lhSp.py) / _lhSp.z };
}

function _lhSpFrame(t) {
    _lhSp.raf = requestAnimationFrame(_lhSpFrame);
    const dt = _lhSp.last ? Math.min((t - _lhSp.last) / 1000, 0.05) : 0;
    _lhSp.last = t;
    const reduce = _lhSpReduce.matches;
    // 一打開：詞從中心散開到自己的位置（1.2 秒緩出）
    const k = reduce ? 1 : Math.min(1, (t - _lhSp.t0) / 1200), ease = 1 - Math.pow(1 - k, 3);
    const fr = Math.exp(-dt * 2.2);   // 甩出去之後的摩擦
    for (const w of _lhSp.words) {
        if (w !== (_lhSp.drag && _lhSp.drag.w)) {
            if (w.vx || w.vy) {
                w.hx += w.vx * dt; w.hy += w.vy * dt;
                w.vx *= fr; w.vy *= fr;
                if (Math.abs(w.vx) + Math.abs(w.vy) < 2) w.vx = w.vy = 0;
            }
            if (!w.hot && !w.pinned && !reduce) {   // 停在詞上、釘住：定格（漂移時間不再前進）
                w.t += dt;
                w.ox = Math.sin(w.t * w.f1 * 6.283) * w.amp;
                w.oy = Math.cos(w.t * w.f2 * 6.283) * w.amp * 0.8;
            }
        }
        const x = (w.hx + w.ox) * ease, y = (w.hy + w.oy) * ease;
        w.el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0) translate(-50%,-50%)';
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
        e.preventDefault();
        const r = el.getBoundingClientRect();
        _lhSpZoom(_lhSp.z * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    el.addEventListener('pointerdown', e => {
        if (e.target.closest('.ws-hud, .ws-keep, .ws-hide')) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
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
            const p = _lhSpToWorld(e.clientX, e.clientY);
            _lhSp.drag = { w, id: e.pointerId, sx: e.clientX, sy: e.clientY, gx: p.x - w.hx - w.ox, gy: p.y - w.hy - w.oy, moved: false, hist: [] };
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
            if (!d.moved) { d.moved = true; d.w.el.classList.add('dragging', 'hot'); d.w.hot = true; d.w.vx = d.w.vy = 0; }
            const p = _lhSpToWorld(e.clientX, e.clientY);
            d.w.hx = p.x - d.gx - d.w.ox;
            d.w.hy = p.y - d.gy - d.w.oy;
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
                    d.w.vx = Math.max(-vmax, Math.min(vmax, (b.x - a.x) / dt));
                    d.w.vy = Math.max(-vmax, Math.min(vmax, (b.y - a.y) / dt));
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
