// ==================== 寬螢幕吸附版面（dock） ====================
// 古典 script，放在 panels.js 之後、ui-common.js 之前（ui-common 開機時會呼叫 syncCenterPanel → lhDockRender）。
// 只在 lhIsDockMode()（≥ 1600 且滑鼠，斷點定義在 layout.js）啟用：歌詞、查詢、AI 建議三塊分割整個畫面。
// 三塊都不搬 DOM：版面算出的矩形寫成元素上的 --dk-x/--dk-y/--dk-w/--dk-h，CSS 只在 body.dock 底下吃這些變數。
//
// 資料模型是「小版面樹」：葉子是區塊 id（'lyrics'｜'results'｜'ai'），
// 分割節點是 { d: 'row'|'col', k: [子節點], s: [權重] }。

const LH_DOCK_BLOCKS = { lyrics: 'leftPanel', results: 'mainContainer', ai: 'rightPanel' };

// 預設：三欄並排，權重 28 / 44 / 28
function _dkDefault() {
    return { d: 'row', k: ['lyrics', 'results', 'ai'], s: [28, 44, 28] };
}

let _dkTree = _dkDefault();   // 存的版面（可能含已收起的區塊）
let _dkVis = null;            // 最近一次畫出來的版面（只含展開的區塊）
let _dkRects = {};            // 區塊 id → { x, y, w, h }（最近一次版面）

// 查詢區永遠開著；歌詞／AI 看面板有沒有收起
function _dkOpen(id) {
    if (id === 'results') return true;
    const el = document.getElementById(LH_DOCK_BLOCKS[id]);
    return !!el && !el.classList.contains('collapsed');
}

// 純函式，不改動輸入：拿掉 keep(id) 為 false 的葉子（權重同步過濾）、空節點、只剩一個孩子的節點拆掉。
// 白名單內的樹修剪後不會出現同方向巢狀，所以不必再攤平
function _dkPrune(t, keep) {
    if (typeof t === 'string') return keep(t) ? t : null;
    const k = [], s = [];
    t.k.forEach((c, i) => {
        const p = _dkPrune(c, keep);
        if (p !== null) { k.push(p); s.push(t.s[i]); }
    });
    if (!k.length) return null;
    if (k.length === 1) return k[0];
    return { d: t.d, k, s };
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

// 遞迴排版：沿分割軸 可用 = 長度 − gap×(n−1)，每個孩子照權重分，中間隔一個 gap
function _dkLayout(t, r, gap) {
    if (typeof t === 'string') { _dkRects[t] = r; return; }
    const row = t.d === 'row', n = t.k.length;
    const avail = (row ? r.w : r.h) - gap * (n - 1);
    const sum = t.s.reduce((a, b) => a + b, 0);
    let pos = row ? r.x : r.y;
    t.k.forEach((c, i) => {
        const len = avail * t.s[i] / sum;
        _dkLayout(c, row ? { x: pos, y: r.y, w: len, h: r.h } : { x: r.x, y: pos, w: r.w, h: len }, gap);
        pos += len + gap;
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
    if (!on) return;
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
    _dkRects = {};
    _dkLayout(_dkVis, frame, gap);
    for (const id of Object.keys(_dkRects)) {
        const el = document.getElementById(LH_DOCK_BLOCKS[id]);
        if (el) _dkSetVars(el, _dkRects[id]);
    }
}

LH_MQ_DOCK.addEventListener('change', () => syncCenterPanel());
