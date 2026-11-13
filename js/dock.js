// ==================== 寬螢幕吸附版面（dock） ====================
// 古典 script，放在 panels.js 之後、ui-common.js 之前（ui-common 開機時會呼叫 syncCenterPanel → lhDockRender）。
// 只在 lhIsDockMode()（≥ 1600 且滑鼠，斷點定義在 layout.js）啟用：歌詞、查詢、AI 建議三塊分割整個畫面。
// 三塊都不搬 DOM：版面算出的矩形寫成元素上的 --dk-x/--dk-y/--dk-w/--dk-h，CSS 只在 body.dock 底下吃這些變數。
//
// 資料模型是「小版面樹」：葉子是區塊 id（'lyrics'｜'results'｜'ai'），
// 分割節點是 { d: 'row'|'col', k: [子節點], s: [權重] }。

const LH_DOCK_BLOCKS = { lyrics: 'leftPanel', results: 'mainContainer', ai: 'rightPanel' };
const LH_DOCK_KEY = 'lh:dock';
// 只允許這些版型（含單塊 L、二塊）：三欄並排、三列疊放、左右二分、上下二分、一大兩小四種（左1右2、左2右1、上1下2、上2下1）
const LH_DOCK_SHAPES = new Set(['L', 'row(L,L)', 'col(L,L)', 'row(L,L,L)', 'col(L,L,L)',
    'row(L,col(L,L))', 'row(col(L,L),L)', 'col(L,row(L,L))', 'col(row(L,L),L)']);
const LH_DOCK_MIN_W = 20, LH_DOCK_MIN_H = 12;   // 分隔線縮放的最小寬高（rem）

// 預設：三欄並排，權重 28 / 44 / 28
function _dkDefault() {
    return { d: 'row', k: ['lyrics', 'results', 'ai'], s: [28, 44, 28] };
}

// 簽名：葉子＝'L'，節點＝方向(子簽名,…)，用來對白名單
function _dkSig(t) {
    return typeof t === 'string' ? 'L' : t.d + '(' + t.k.map(_dkSig).join(',') + ')';
}

// 存的值不可信（壞檔、手改、還原備份）：形狀、區塊 id、重複、權重、白名單全驗過才收
function _dkValid(o) {
    if (!o || typeof o !== 'object' || o.v !== 1) return false;
    const seen = new Set();
    const ok = (t, depth) => {
        if (typeof t === 'string') {
            if (!Object.hasOwn(LH_DOCK_BLOCKS, t) || seen.has(t)) return false;
            seen.add(t);
            return true;
        }
        if (!t || typeof t !== 'object' || depth > 2) return false;
        if (t.d !== 'row' && t.d !== 'col') return false;
        if (!Array.isArray(t.k) || t.k.length < 2 || t.k.length > 3) return false;
        if (!Array.isArray(t.s) || t.s.length !== t.k.length) return false;
        if (!t.s.every(w => typeof w === 'number' && Number.isFinite(w) && w > 0)) return false;
        return t.k.every(c => ok(c, depth + 1));
    };
    return ok(o.t, 0) && seen.has('results') && LH_DOCK_SHAPES.has(_dkSig(o.t));
}

let _dkTree = lhGetJSON(LH_DOCK_KEY, null, _dkValid)?.t ?? _dkDefault();   // 存的版面（可能含已收起的區塊）；壞值回預設
let _dkVis = null;            // 最近一次畫出來的版面（只含展開的區塊）
let _dkRects = {};            // 區塊 id → { x, y, w, h }（最近一次版面）
let _dkDivs = new Map();      // 分隔線 key → 描述（最近一次版面）
const _dkDivEls = new Map();  // 分隔線 key → 元素（拖到一半重排時沿用同一個）

// 查詢區永遠開著；歌詞／AI 看面板有沒有收起
function _dkOpen(id) {
    if (id === 'results') return true;
    const el = document.getElementById(LH_DOCK_BLOCKS[id]);
    return !!el && !el.classList.contains('collapsed');
}

// 純函式，不改動輸入：拿掉 keep(id) 為 false 的葉子（權重同步過濾）、空節點、只剩一個孩子的節點拆掉。
// 白名單內的樹修剪後不會出現同方向巢狀，所以不必再攤平
// 例外：每個新建的節點記在 _dkFrom（來源節點＋保留的子索引），分隔線縮放靠它把比例寫回存的樹
const _dkFrom = new WeakMap();
function _dkPrune(t, keep) {
    if (typeof t === 'string') return keep(t) ? t : null;
    const k = [], s = [], j = [];
    t.k.forEach((c, i) => {
        const p = _dkPrune(c, keep);
        if (p !== null) { k.push(p); s.push(t.s[i]); j.push(i); }
    });
    if (!k.length) return null;
    if (k.length === 1) return k[0];
    const n = { d: t.d, k, s };
    _dkFrom.set(n, { n: t, j });
    return n;
}

// 純函式：把一個展開卻不在樹裡的區塊吸回「老家」邊（歌詞＝前面、AI＝後面）。
// 樹只會缺 ≤ 1 塊（≤ 2 片葉子），加上這條規則後仍是白名單版型
function _dkAddEdge(t, id) {
    const front = id === 'lyrics';
    if (typeof t !== 'string' && t.d === 'row') {
        const w = t.s.reduce((a, b) => a + b, 0) * 28 / 72;
        return front ? { d: 'row', k: [id, ...t.k], s: [w, ...t.s] } : { d: 'row', k: [...t.k, id], s: [...t.s, w] };
    }
    return front ? { d: 'row', k: [id, t], s: [28, 72] } : { d: 'row', k: [t, id], s: [72, 28] };
}

function _dkInTree(t, id) {
    return typeof t === 'string' ? t === id : t.k.some(c => _dkInTree(c, id));
}

// 遞迴排版：沿分割軸 可用 = 長度 − gap×(n−1)，每個孩子照權重分，中間隔一個 gap。
// 順便記下每一對相鄰孩子之間的分隔線（_dkDivs：key → 描述）
function _dkLayout(t, r, gap, path = '') {
    if (typeof t === 'string') { _dkRects[t] = r; return; }
    const row = t.d === 'row', n = t.k.length;
    const avail = (row ? r.w : r.h) - gap * (n - 1);
    const sum = t.s.reduce((a, b) => a + b, 0);
    const lens = t.s.map(w => avail * w / sum);
    const from = _dkFrom.get(t);
    let pos = row ? r.x : r.y;
    t.k.forEach((c, i) => {
        _dkLayout(c, row ? { x: pos, y: r.y, w: lens[i], h: r.h } : { x: r.x, y: pos, w: r.w, h: lens[i] }, gap, path + '/' + i);
        pos += lens[i];
        if (i < n - 1) {
            const key = path + ':' + i;
            _dkDivs.set(key, {
                key, vertical: row, src: from.n, ja: from.j[i], jb: from.j[i + 1], a: lens[i], b: lens[i + 1],
                rect: row ? { x: pos, y: r.y, w: gap, h: r.h } : { x: r.x, y: pos, w: r.w, h: gap },
            });
            pos += gap;
        }
    });
}

function _dkSetVars(el, r) {
    el.style.setProperty('--dk-x', r.x + 'px');
    el.style.setProperty('--dk-y', r.y + 'px');
    el.style.setProperty('--dk-w', r.w + 'px');
    el.style.setProperty('--dk-h', r.h + 'px');
}

function lhDockRender() {
    if (!document.body) return;
    const on = lhIsDockMode();
    document.body.classList.toggle('dock', on);
    if (!on) { document.body.classList.remove('dock-classic'); _dkSyncDividers(); return; }
    // 先加 body.dock（它的 padding 規則決定外框），再量 body 內容區
    const cs = getComputedStyle(document.body);
    const padL = parseFloat(cs.paddingLeft) || 0, padR = parseFloat(cs.paddingRight) || 0;
    const padT = parseFloat(cs.paddingTop) || 0, padB = parseFloat(cs.paddingBottom) || 0;
    const root = document.documentElement;
    const frame = { x: padL, y: padT, w: root.clientWidth - padL - padR, h: root.clientHeight - padT - padB };
    const gap = (parseFloat(getComputedStyle(root).fontSize) || 16) * 0.5;
    // 存的樹一定含每個展開的區塊（此處不存檔）
    // ponytail: 收起期間做拖放重排（Task 3 從只含可見區塊的樹產生新樹）會讓收起那塊失去舊位置，
    // 重新打開時吸回老家邊；分隔線縮放寫回 _dkTree 所以不受影響。要保留就在重開時把葉子插回舊鄰居旁
    for (const id of Object.keys(LH_DOCK_BLOCKS)) {
        if (_dkOpen(id) && !_dkInTree(_dkTree, id)) _dkTree = _dkAddEdge(_dkTree, id);
    }
    _dkVis = _dkPrune(_dkTree, _dkOpen);
    // 最傳統的三直排（三塊並排）才保留左右兩側的收合分頁；其他版型改用標題列上的小三角形，免得分頁被誤認成也能拖去排版
    document.body.classList.toggle('dock-classic', _dkSig(_dkVis) === 'row(L,L,L)');
    for (const sel of Object.values(LH_DOCK_HANDLES)) {   // 標題列的說明（滑鼠停一下浮出）
        const h = document.querySelector(sel);
        if (h) h.title = '抓著標題列拖曳：放到別塊中間＝互換，放到別塊邊緣＝分割畫面';
    }
    _dkRects = {};
    _dkDivs = new Map();
    _dkLayout(_dkVis, frame, gap);
    for (const id of Object.keys(_dkRects)) {
        const el = document.getElementById(LH_DOCK_BLOCKS[id]);
        if (el) _dkSetVars(el, _dkRects[id]);
    }
    _dkSyncDividers();
}

function _dkSave() {
    lhSet(LH_DOCK_KEY, JSON.stringify({ v: 1, t: _dkTree }));
}

// 設定 → 外觀「重設版面」：清存檔、回三欄預設（收合狀態交給分頁）
function lhDockReset() {
    lhRemove(LH_DOCK_KEY);
    _dkTree = _dkDefault();
    lhDockRender();
    if (typeof showToast === 'function') showToast('版面已重設');
}

// ==================== 分隔線（拖曳縮放） ====================
// 沿用同一個 key 的元素（拖到一半重排不會斷）、補缺的、拿掉多的；離開 dock 時全部拿掉（_dkDivs 此時是空的就會全清）
function _dkSyncDividers() {
    const live = lhIsDockMode() ? _dkDivs : new Map();
    for (const [key, el] of _dkDivEls) {
        if (!live.has(key)) { el.remove(); _dkDivEls.delete(key); }
    }
    for (const [key, d] of live) {
        let el = _dkDivEls.get(key);
        if (!el) {
            el = document.createElement('div');
            el.className = 'dock-divider';
            el.setAttribute('role', 'separator');
            el.setAttribute('aria-label', '拖曳調整區塊大小');
            el.addEventListener('pointerdown', e => _dkResizeStart(e, key));
            document.body.appendChild(el);
            _dkDivEls.set(key, el);
        }
        el.setAttribute('aria-orientation', d.vertical ? 'vertical' : 'horizontal');
        _dkSetVars(el, d.rect);
    }
}

function _dkResizeStart(e, key) {
    const d0 = _dkDivs.get(key);
    if (!d0 || e.button !== 0 || !e.isPrimary) return;
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const start = d0.vertical ? e.clientX : e.clientY;
    const { a, b, vertical } = d0;
    const P = d0.src.s[d0.ja] + d0.src.s[d0.jb];
    el.classList.add('active');
    document.body.classList.add('dock-resizing');
    const move = ev => {
        const d = _dkDivs.get(key);   // 從最新的版面取來源節點：lhDockRender 可能在拖到一半重建過樹
        if (!d) return;
        const min = (vertical ? LH_DOCK_MIN_W : LH_DOCK_MIN_H) * rem();
        if (a + b < 2 * min) return;
        // 起點本來就小於最小值時不硬跳：只擋「再縮小」
        const delta = Math.min(Math.max((vertical ? ev.clientX : ev.clientY) - start, Math.min(0, min - a)), Math.max(0, b - min));
        const first = P * (a + delta) / (a + b);
        d.src.s[d.ja] = first;
        d.src.s[d.jb] = P - first;   // 寫進存的樹（不是修剪後的副本），收起的區塊才不會丟位置
        lhDockRender();
    };
    const end = () => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', end);
        el.removeEventListener('pointercancel', end);
        el.classList.remove('active');
        document.body.classList.remove('dock-resizing');
        _dkSave();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
}

LH_MQ_DOCK.addEventListener('change', () => syncCenterPanel());

// ==================== 拖標題列吸附（換位置／分割） ====================
// 純函式 _dkDrop(t, src, dst, zone)：zone＝'left'|'right'|'top'|'bottom'|'center'。回傳新樹；落點不被允許回 null。不改動輸入。
// 中間＝兩塊互換；邊緣＝把 src 拿掉後，在 dst 旁邊分割（父節點同方向就直接插進去、對半分 dst 的權重，否則 dst 換成分割）
function _dkDrop(t, src, dst, zone) {
    if (src === dst || !_dkInTree(t, src) || !_dkInTree(t, dst)) return null;
    let out;
    if (zone === 'center') {
        const swap = n => typeof n === 'string' ? (n === src ? dst : n === dst ? src : n) : { d: n.d, k: n.k.map(swap), s: n.s.slice() };
        out = swap(t);
    } else {
        const dir = zone === 'left' || zone === 'right' ? 'row' : 'col';
        const pair = zone === 'left' || zone === 'top' ? [src, dst] : [dst, src];
        const ins = n => {
            if (n === dst) return { d: dir, k: pair, s: [1, 1] };
            if (typeof n === 'string') return n;
            const k = [], s = [];
            n.k.forEach((c, i) => {
                if (c === dst && n.d === dir) { k.push(...pair); s.push(n.s[i] / 2, n.s[i] / 2); }
                else { k.push(ins(c)); s.push(n.s[i]); }
            });
            return { d: n.d, k, s };
        };
        out = ins(_dkPrune(t, id => id !== src));
    }
    return LH_DOCK_SHAPES.has(_dkSig(out)) ? out : null;
}

const LH_DOCK_HANDLES = { lyrics: '#leftPanel .lyrics-head', results: '#mainContainer > .header', ai: '#rightPanel .side-panel-body > .side-panel-title' };
// 標題列上這些照樣是一般點擊，不會變成拖曳
const LH_DOCK_NODRAG = 'button, input, select, textarea, a, label, [onclick], [role="button"], [contenteditable="true"], .model-picker';

// 指標在目標塊裡的落點：最近的邊距離 < 0.25 取那一邊，否則中間
function _dkZone(r, x, y) {
    const nx = (x - r.x) / r.w, ny = (y - r.y) / r.h;
    const d = { left: nx, right: 1 - nx, top: ny, bottom: 1 - ny };
    const edge = Object.keys(d).reduce((a, b) => d[a] <= d[b] ? a : b);
    return d[edge] < 0.25 ? edge : 'center';
}

// 預覽框的矩形：邊緣＝目標那一半，中間＝整塊
function _dkPreviewRect(r, zone) {
    const hw = r.w / 2, hh = r.h / 2;
    switch (zone) {
        case 'left': return { x: r.x, y: r.y, w: hw, h: r.h };
        case 'right': return { x: r.x + hw, y: r.y, w: hw, h: r.h };
        case 'top': return { x: r.x, y: r.y, w: r.w, h: hh };
        case 'bottom': return { x: r.x, y: r.y + hh, w: r.w, h: hh };
        default: return r;
    }
}

document.addEventListener('pointerdown', e => {
    if (!document.body.classList.contains('dock') || !e.isPrimary || e.button !== 0 || e.pointerType !== 'mouse') return;
    const t = e.target instanceof Element ? e.target : null;
    if (!t || t.closest(LH_DOCK_NODRAG)) return;
    const src = Object.keys(LH_DOCK_HANDLES).find(id => t.closest(LH_DOCK_HANDLES[id]));
    if (!src || !_dkRects[src]) return;
    const x0 = e.clientX, y0 = e.clientY;
    let started = false, cand = null;
    const srcEl = document.getElementById(LH_DOCK_BLOCKS[src]);
    let pv = null;
    const hide = () => { if (pv) pv.hidden = true; };
    const finish = commit => {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        document.removeEventListener('pointercancel', cancel);
        document.removeEventListener('keydown', key, true);
        window.removeEventListener('blur', cancel);
        hide();
        document.body.classList.remove('dock-dragging');
        srcEl.classList.remove('dock-src');
        if (started && commit && cand) {
            _dkTree = cand;
            _dkSave();
            lhDockRender();
        }
    };
    const move = ev => {
        if (!started) {
            if (Math.hypot(ev.clientX - x0, ev.clientY - y0) <= 6) return;   // 還沒超過門檻：點擊與雙擊照舊
            started = true;
            window.getSelection().removeAllRanges();   // 清掉標題字上可能已經開始的原生選取
            document.body.classList.add('dock-dragging');
            srcEl.classList.add('dock-src');
            pv = document.getElementById('dockPreview');
            if (!pv) {
                pv = document.createElement('div');
                pv.id = 'dockPreview';
                pv.setAttribute('aria-hidden', 'true');
                document.body.appendChild(pv);
            }
        }
        const dst = Object.keys(_dkRects).find(id => {
            const r = _dkRects[id];
            return id !== src && ev.clientX >= r.x && ev.clientX <= r.x + r.w && ev.clientY >= r.y && ev.clientY <= r.y + r.h;
        });
        cand = null;
        if (dst) {
            const zone = _dkZone(_dkRects[dst], ev.clientX, ev.clientY);
            cand = _dkDrop(_dkVis, src, dst, zone);
            if (cand) {
                // 剛從隱藏變顯示：直接出現在位置上，不要從左上角滑過來
                const fresh = pv.hidden;
                if (fresh) pv.style.transition = 'none';
                _dkSetVars(pv, _dkPreviewRect(_dkRects[dst], zone));
                pv.hidden = false;
                if (fresh) { pv.offsetWidth; pv.style.transition = ''; }
            }
        }
        if (!cand) hide();
    };
    const up = () => finish(true);
    const cancel = () => finish(false);
    const key = ev => { if (ev.key === 'Escape' && started) { ev.stopPropagation(); finish(false); } };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', cancel);
    document.addEventListener('keydown', key, true);
    window.addEventListener('blur', cancel);
});
