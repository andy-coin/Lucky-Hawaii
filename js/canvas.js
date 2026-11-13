// ==================== 自由畫布（完整編輯器的「吸附／自由」排版，Part A） ====================
// 自由模式：#lyricsSections 變成原生捲動的畫布，每個段落是用 left／top 擺在畫布上的卡片（100% 大小，沒有 transform）。
// 卡片位置寬高（s.pos）存在每個段落裡、排版模式（song.canvas）存在每首歌裡；純函式與整理都在 js/sections-core.js。
// 卡片幾何一律是畫布 px，不受 --ui-scale 影響。這支檔案最後才載入（roles.js 之後），
// 前面的檔案只用 typeof 守門呼叫 lhCanvasApply／lhCanvasReveal／lhCanvasAbort。
// lhCanvasApply（排版）與 lhCanvasReveal（露出卡片）是 Part B 加縮放時唯一要改的兩處。
// 手勢用 document 層的 pointermove／pointerup 監聽，開始時加、結束時拿掉（不用 setPointerCapture）。

let _lhCv = null;            // 進行中的手勢
let _lhCvSwallow = false;    // 拖完那一下的 click 要吞掉（不然會點到標題列的收合）

const _lhCvBox = () => document.getElementById('lyricsSections');
const _lhCvIsFree = song => !!(song && song.canvas && song.canvas.mode === 'free');
// 自由排版的條件：編輯器開著、這首歌是自由模式、手機鍵盤沒打開（鍵盤打開時退回整齊直列，D-06）
const _lhCvFree = () => lhEditorIsOpen() && _lhCvIsFree(curSong()) && !document.documentElement.classList.contains('kb-open');
const _lhCvPx = v => (Number.isFinite(v) ? v + 'px' : null);

function _lhCvSetRect(el, r) {
    for (const [k, v] of [['--cv-x', r.x], ['--cv-y', r.y], ['--cv-w', r.w], ['--cv-h', r.h]]) {
        const px = _lhCvPx(v);
        if (px) el.style.setProperty(k, px);
    }
}

// ----- 縮放（只在記憶體，每首歌各一個，重新整理回 100%）-----
const LH_CV_ZMIN = 0.4, LH_CV_ZMAX = 1.5;
const _lhCvZooms = new Map();
const _lhCvZ = () => { const s = curSong(); return (s && _lhCvZooms.get(s.id)) || 1; };

// 縮放到 z，並讓畫布可視區裡 (px, py)（相對可視區左上）那一點留在原處；省略就用中心
function lhCanvasZoom(z, px, py) {
    const box = _lhCvBox(), song = curSong();
    if (!box || !song || !Number.isFinite(z)) return;
    z = Math.round(Math.min(LH_CV_ZMAX, Math.max(LH_CV_ZMIN, z)) * 100) / 100;
    const z0 = _lhCvZ();
    if (px === undefined) { px = box.clientWidth / 2; py = box.clientHeight / 2; }
    const sl = (box.scrollLeft + px) / z0 * z - px, st = (box.scrollTop + py) / z0 * z - py;
    _lhCvZooms.set(song.id, z);
    box.style.setProperty('--cv-z', String(z));
    _lhCvExtent();
    box.scrollLeft = Math.max(0, sl);
    box.scrollTop = Math.max(0, st);
    _lhCvZoomLabel();
}
// 畫布的可捲範圍＝卡片最遠處再加一個可視區的 75%：卡片都在畫面內時手掌工具（右鍵拖、單指拖）也拖得動
function _lhCvExtent() {
    const box = _lhCvBox(), song = curSong();
    if (!box || !song || !_lhCvFree()) return;
    const rects = lhCanvasLayout(song.sections), z = _lhCvZ();
    const mx = Math.max(0, ...rects.map(r => r.x + r.w)) * z, my = Math.max(0, ...rects.map(r => r.y + r.h)) * z;
    box.style.setProperty('--cv-ex', Math.round(mx + box.clientWidth * 0.75) + 'px');
    box.style.setProperty('--cv-ey', Math.round(my + box.clientHeight * 0.75) + 'px');
}
function _lhCvZoomLabel() {
    const b = document.getElementById('canvasZoomReset');
    if (b) b.textContent = Math.round(_lhCvZ() * 100) + '%';
}

// 吸附分列：完整編輯器開著、鍵盤沒打開、至少有一段和前一段同列才切成格線（120 格；寬度照 rw 比例，沒有就均分；列首有 rh 就固定列高）
function _lhRowsLayout(box, secs) {
    const on = lhEditorIsOpen() && !document.documentElement.classList.contains('kb-open') && secs.some((s, i) => i > 0 && s.rj);
    for (const el of box.children) {
        if (!el.dataset.id) continue;
        for (const k of ['--r-row', '--r-col', '--r-span', '--r-h', '--r-ml', '--r-mr']) el.style.removeProperty(k);
        delete el.dataset.rh;
    }
    if (!on) { delete box.dataset.layout; return; }
    box.dataset.layout = 'rows';
    const byId = new Map(secs.map(s => [s.id, s]));
    lhRowsOf(secs).forEach((row, ri) => {
        const spans = lhRowSpans(secs, row), rh = byId.get(row[0]).rh;
        let col = 1;
        row.forEach((id, k) => {
            const el = lhSecEl(id);
            if (!el) return;
            el.style.setProperty('--r-row', String(ri + 1));
            el.style.setProperty('--r-col', String(col));
            el.style.setProperty('--r-span', String(spans[k]));
            // 縫的寬度由兩邊分攤：第 k 張左邊 k/n、右邊 (n-1-k)/n 個縫寬，每張少掉的寬度一樣
            el.style.setProperty('--r-ml', String(k / row.length));
            el.style.setProperty('--r-mr', String((row.length - 1 - k) / row.length));
            if (rh) { el.dataset.rh = '1'; el.style.setProperty('--r-h', rh + 'px'); }
            col += spans[k];
        });
    });
}

let _lhCvWasFree = false;
// 依這首歌的模式套用排版：每次重畫、開關編輯器、鍵盤開關、切模式都呼叫
function lhCanvasApply() {
    const box = _lhCvBox();
    const song = curSong();
    if (!box) return;
    const snapBtn = document.getElementById('canvasSnapBtn'), freeBtn = document.getElementById('canvasFreeBtn');
    const isFree = _lhCvIsFree(song);
    if (snapBtn) snapBtn.setAttribute('aria-pressed', String(!isFree));
    if (freeBtn) freeBtn.setAttribute('aria-pressed', String(isFree));
    const secs = song ? song.sections : [];
    const byId = new Map(secs.map(s => [s.id, s]));
    if (!_lhCvFree()) {
        const was = _lhCvWasFree;
        _lhCvWasFree = false;
        lhCanvasAbort();
        delete box.dataset.canvas;
        box.style.removeProperty('--cv-z');
        document.body.classList.remove('cv-free');
        for (const el of box.children) {
            const s = byId.get(el.dataset.id);
            const grip = el.querySelector('.section-handle');
            if (grip && s) { grip.title = '拖曳排序'; grip.setAttribute('aria-label', lhSecHandleLabel(s.label)); }
        }
        // 自由模式量到的高度是卡片的高度，回到整齊直列要依內容重新量
        if (was) for (const ta of box.querySelectorAll('.section-textarea')) lhSecFit(ta);
        _lhRowsLayout(box, secs);
        return;
    }
    _lhCvWasFree = true;
    _lhRowsLayout(box, []);   // 自由畫布不用分列
    box.dataset.canvas = 'free';
    box.style.setProperty('--cv-z', String(_lhCvZ()));
    document.body.classList.add('cv-free');
    _lhCvZoomLabel();
    const rects = lhCanvasLayout(secs);
    secs.forEach((s, i) => {
        const el = lhSecEl(s.id);
        if (!el) return;
        _lhCvSetRect(el, rects[i]);
        if (!el.querySelector('.cv-corner')) {
            const c = document.createElement('span');
            c.className = 'cv-corner';
            c.setAttribute('aria-hidden', 'true');
            el.appendChild(c);
        }
        const grip = el.querySelector('.section-handle');
        if (grip) { grip.title = '拖曳移動卡片'; grip.setAttribute('aria-label', lhSecHandleLabel(s.label)); }
    });
    _lhCvExtent();
}

// 切換模式（只動 song.canvas；模式是檢視狀態，不進復原）。沒有 canvas 欄位就算吸附，所以在新歌按「吸附」什麼都不寫
function lhCanvasSetMode(mode) {
    const song = curSong();
    if (!song || (mode !== 'free' && mode !== 'snap')) return;
    if (mode === (_lhCvIsFree(song) ? 'free' : 'snap')) return;
    song.canvas = lhCanvasClean({ ...song.canvas, mode });
    markDirty(song.id);
    flushSongs();
    lhCanvasApply();
    lhAnnounce(mode === 'free' ? '自由排版：拖標題列移動卡片，拉右下角改大小' : '吸附排版：整齊直列，自由排版的位置都留著');
}
for (const [id, mode] of [['canvasSnapBtn', 'snap'], ['canvasFreeBtn', 'free']]) {
    const b = document.getElementById(id);
    if (!b) continue;
    b.addEventListener('click', () => lhCanvasSetMode(mode));
    // 按下去不搶輸入框的焦點（和復原鈕一樣）
    b.addEventListener('pointerdown', e => e.preventDefault());
    b.addEventListener('mousedown', e => e.preventDefault());
}

// 放手：把這張卡片的新矩形與所有卡片一起算推開，一次寫進 s.pos，記成一步（含被推開的）。
// 第一次提交會把每張卡片現在的位置都寫進去，沒動過的卡片不會跳
function _lhCvCommit(id, rect, kind) {
    const song = curSong();
    if (!song) return;
    const idx = song.sections.findIndex(s => s.id === id);
    const mine = lhSecPosClean(rect);
    if (idx < 0 || !mine) return;
    const rects = lhCanvasLayout(song.sections);
    rects[idx] = mine;
    const out = lhCanvasPushApart(rects, idx);
    const same = (a, b) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
    let pushed = 0;
    out.forEach((r, i) => { if (i !== idx && !same(r, lhSecPosClean(rects[i]) || r)) pushed++; });
    const step = lhSecApply(kind, s => {
        let changed = false;
        s.sections.forEach((sec, i) => {
            const p = lhSecPosClean(out[i]);
            if (p && !(sec.pos && same(sec.pos, p))) { sec.pos = p; changed = true; }
        });
        if (!changed) return false;
    });
    lhCanvasApply();
    if (!step) return;
    const label = song.sections[idx].label;
    lhAnnounce((kind === 'canvas-size' ? '已調整「' + label + '」大小' : '已移動「' + label + '」') + (pushed ? '，推開 ' + pushed + ' 張卡片' : ''));
}

// 手勢結束的共同收尾：拿掉監聽與樣式
function _lhCvEnd() {
    const g = _lhCv;
    if (!g) return;
    _lhCv = null;
    document.removeEventListener('pointermove', _lhCvMove, true);
    document.removeEventListener('pointerup', _lhCvUp, true);
    document.removeEventListener('pointercancel', _lhCvCancel, true);
    document.removeEventListener('keydown', _lhCvKey, true);
    g.card.classList.remove('cv-moving');
    _lhCvBox().querySelectorAll('.cv-guide').forEach(n => n.remove());
    document.body.classList.remove('is-canvas-dragging');
}

// 放棄手勢：卡片回到模型裡的位置
function lhCanvasAbort() {
    if (!_lhCv) return;
    _lhCvEnd();
    lhCanvasApply();
}

function _lhCvMove(e) {
    const g = _lhCv;
    if (!g || e.pointerId !== g.pointerId) return;
    const box = _lhCvBox();
    // 螢幕像素換回畫布座標：除以縮放倍率（手指移動、捲動量都是螢幕像素）
    const dx = (e.clientX - g.sx + (box.scrollLeft - g.sl)) / g.z;
    const dy = (e.clientY - g.sy + (box.scrollTop - g.st)) / g.z;
    if (!g.started) {
        if (Math.hypot(dx, dy) < (g.touch ? 6 : 4)) return;
        g.started = true;
        g.card.classList.add('cv-moving');
        document.body.classList.add('is-canvas-dragging');
        if (typeof lhSecPressEnd === 'function') lhSecPressEnd();
        if (typeof lhSecCloseMenu === 'function') lhSecCloseMenu();
        if (typeof lhMapHideBar === 'function') lhMapHideBar();
    }
    const r = g.rect, s = g.start;
    if (g.kind === 'move') {
        r.x = Math.min(LH_CV_MAX, Math.max(0, s.x + dx));
        r.y = Math.min(LH_CV_MAX, Math.max(0, s.y + dy));
        if (!e.altKey) _lhCvSnap(g, r, 'move');   // 按住 Alt＝不吸附
    } else {
        r.w = Math.min(LH_CV_WMAX, Math.max(LH_CV_WMIN, s.w + dx));
        r.h = Math.min(LH_CV_HMAX, Math.max(LH_CV_HMIN, s.h + dy));
        if (e.shiftKey) {   // 按住 Shift＝維持原本的長寬比：跟著拉得比較多的那一邊
            const k = Math.max(r.w / s.w, r.h / s.h);
            r.w = s.w * k; r.h = s.h * k;
        }
        if (!e.altKey) _lhCvSnap(g, r, e.shiftKey ? 'ratio' : 'size');   // 右緣、下緣貼齊別張卡片的邊
        if (e.shiftKey) r.h = r.w * s.h / s.w;
        r.w = Math.min(LH_CV_WMAX, Math.max(LH_CV_WMIN, r.w));
        r.h = Math.min(LH_CV_HMAX, Math.max(LH_CV_HMIN, r.h));
    }
    _lhCvSetRect(g.card, r);
}

// 隔空對齊：移動中的卡片，左／右緣貼齊別張卡片的左／右緣（上／下同理；不吸中線，免得吸附點太多），差 6 畫面像素內就吸過去，並畫一條導引線。
// 只吸一個軸向各一條線；g.snapTo＝其他卡片的矩形（開始時算一次）
// mode：'move'＝移動（左右緣都可吸，改位置）；'size'＝拉大小（只吸右緣、下緣，改寬高）；'ratio'＝等比例拉，只吸右緣（高度由比例決定）
function _lhCvSnap(g, r, mode = 'move') {
    const tol = 6 / g.z;
    if (!g.others) {
        const song = curSong(), rects = song ? lhCanvasLayout(song.sections) : [];
        g.others = rects.filter((_, i) => song.sections[i].id !== g.id);
    }
    const best = { x: null, y: null };
    for (const o of g.others) {
        for (const [k, size, ok, os] of [['x', 'w', 'x', 'w'], ['y', 'h', 'y', 'h']]) {
            if (mode === 'ratio' && k === 'y') continue;
            for (const mine of (mode === 'move' ? [0, 1] : [1])) for (const theirs of [0, 1]) {
                const diff = (o[ok] + o[os] * theirs) - (r[k] + r[size] * mine);
                if (Math.abs(diff) <= tol && (!best[k] || Math.abs(diff) < Math.abs(best[k].diff))) best[k] = { diff, at: o[ok] + o[os] * theirs, o };
            }
        }
    }
    if (mode === 'move') {
        if (best.x) r.x += best.x.diff;
        if (best.y) r.y += best.y.diff;
        r.x = Math.max(0, r.x); r.y = Math.max(0, r.y);
    } else {
        if (best.x) r.w += best.x.diff;
        if (best.y) r.h += best.y.diff;
    }
    const box = _lhCvBox();
    let gl = box.querySelector('.cv-guide-x'), gt = box.querySelector('.cv-guide-y');
    for (const [k, el, cls] of [['x', gl, 'cv-guide-x'], ['y', gt, 'cv-guide-y']]) {
        if (!best[k]) { if (el) el.remove(); continue; }
        const n = el || Object.assign(document.createElement('div'), { className: 'cv-guide ' + cls });
        if (!el) { n.setAttribute('aria-hidden', 'true'); box.appendChild(n); }
        const z = g.z, o = best[k].o;
        if (k === 'x') Object.assign(n.style, { left: best.x.at * z + 'px', top: Math.min(r.y, o.y) * z + 'px', width: '1px', height: (Math.max(r.y + r.h, o.y + o.h) - Math.min(r.y, o.y)) * z + 'px' });
        else Object.assign(n.style, { top: best.y.at * z + 'px', left: Math.min(r.x, o.x) * z + 'px', height: '1px', width: (Math.max(r.x + r.w, o.x + o.w) - Math.min(r.x, o.x)) * z + 'px' });
    }
}

function _lhCvUp(e) {
    const g = _lhCv;
    if (!g || e.pointerId !== g.pointerId) return;
    const { started, id, rect, kind } = g;
    _lhCvEnd();
    if (!started) return;
    _lhCvSwallow = true;
    setTimeout(() => { _lhCvSwallow = false; }, 400);
    _lhCvCommit(id, rect, kind === 'move' ? 'canvas-move' : 'canvas-size');
}

function _lhCvCancel(e) {
    if (_lhCv && e.pointerId === _lhCv.pointerId) lhCanvasAbort();
}

// Esc：放棄這次拖曳，並且不讓編輯器自己的 Esc（關閉編輯器）收到
function _lhCvKey(e) {
    if (e.key !== 'Escape' || e.isComposing) return;
    e.preventDefault();
    e.stopPropagation();
    lhCanvasAbort();
}

// 容器的捕獲階段：比 js/sections.js 的排序拖曳、標題列的收合點擊更早看到。
// 只有 ⋮⋮、標題列空白處（含 ▾）與右下角會開始手勢；名稱鈕、字母條、−、字數保留自己的點擊與長按
_lhCvBox().addEventListener('pointerdown', e => {
    if (_lhPinch || _lhPan || _lhCv || !e.isPrimary || !_lhCvFree()) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const t = e.target;
    if (!t || !t.closest) return;
    let kind = null;
    if (t.closest('.cv-corner')) kind = 'resize';
    else if (t.closest('.lyrics-section-header') && (t.closest('.section-handle') || !t.closest('button, .section-count'))) kind = 'move';
    if (!kind) return;
    const card = t.closest('.lyrics-section');
    const song = curSong();
    const idx = card && song ? song.sections.findIndex(s => s.id === card.dataset.id) : -1;
    if (idx < 0) return;
    const box = _lhCvBox();
    const start = lhCanvasLayout(song.sections)[idx];
    _lhCv = {
        kind, card, id: card.dataset.id, pointerId: e.pointerId, touch: e.pointerType === 'touch',
        z: _lhCvZ(), sx: e.clientX, sy: e.clientY, sl: box.scrollLeft, st: box.scrollTop, start, rect: { ...start }, started: false,
    };
    document.addEventListener('pointermove', _lhCvMove, true);
    document.addEventListener('pointerup', _lhCvUp, true);
    document.addEventListener('pointercancel', _lhCvCancel, true);
    document.addEventListener('keydown', _lhCvKey, true);
}, true);

// 拖完放手後的那個 click 吞掉一次；下一次按下就解除
document.addEventListener('click', e => {
    if (!_lhCvSwallow) return;
    _lhCvSwallow = false;
    e.preventDefault();
    e.stopPropagation();
}, true);
document.addEventListener('pointerdown', () => { _lhCvSwallow = false; }, true);

// 露出卡片（新增、復原、移到段落、帶游標打開編輯器…）：自由模式只捲畫布本身，絕不用 scrollIntoView，
// 外層容器與頁面的捲動位置不會被帶動。回傳 true 表示已處理（呼叫端就不要再 scrollIntoView）
function lhCanvasReveal(el) {
    if (!_lhCvFree()) return false;
    const card = el && el.closest && el.closest('.lyrics-section');
    const box = _lhCvBox();
    if (!card || !box) return false;
    const b = box.getBoundingClientRect(), r = card.getBoundingClientRect();
    const left = b.left + box.clientLeft, top = b.top + box.clientTop;
    const inside = r.left >= left && r.left <= left + box.clientWidth && r.top >= top && r.top <= top + box.clientHeight;
    if (!inside) box.scrollTo(box.scrollLeft + r.left - left - LH_CV_ORIGIN, box.scrollTop + r.top - top - LH_CV_ORIGIN);
    return true;
}

lhCanvasApply();

// ===== 縮放、平移、捏合、鍵盤移動卡片（Part B）=====
for (const [id, f] of [['canvasZoomOut', z => z - 0.1], ['canvasZoomReset', () => 1], ['canvasZoomIn', z => z + 0.1]]) {
    const b = document.getElementById(id);
    if (!b) continue;
    b.addEventListener('click', () => lhCanvasZoom(f(_lhCvZ())));
    b.addEventListener('pointerdown', e => e.preventDefault());
    b.addEventListener('mousedown', e => e.preventDefault());
}

// Ctrl／⌘＋滾輪（觸控板捏合也是這個事件）：以游標為中心縮放；一般滾輪照舊捲動
_lhCvBox().addEventListener('wheel', e => {
    if (!(e.ctrlKey || e.metaKey) || !_lhCvFree()) return;
    e.preventDefault();
    const r = _lhCvBox().getBoundingClientRect();
    lhCanvasZoom(_lhCvZ() * Math.exp(-e.deltaY * 0.01), e.clientX - r.left - _lhCvBox().clientLeft, e.clientY - r.top - _lhCvBox().clientTop);
}, { passive: false });

// 滑鼠平移：拖畫布空白處（左鍵或按住右鍵），或按住滑鼠中鍵拖任何地方；觸控的單指、雙指手勢在下面自己處理
// 空白處沒有右鍵選單，所以右鍵拖曳不會被選單打斷（Mac 的 contextmenu 在按下時就送出，要擋掉）
_lhCvBox().addEventListener('contextmenu', e => { if (_lhCvFree() && e.target === _lhCvBox()) e.preventDefault(); });
let _lhPan = null;
_lhCvBox().addEventListener('pointerdown', e => {
    if (_lhPan || _lhPinch || _lhCv || e.pointerType !== 'mouse' || !_lhCvFree()) return;
    if (!(e.button === 1 || ((e.button === 0 || e.button === 2) && e.target === _lhCvBox()))) return;   // 中鍵拖哪裡都行；左鍵、右鍵（按住右鍵＝手掌工具）拖空白處
    e.preventDefault();
    const box = _lhCvBox();
    _lhPan = { id: e.pointerId, x: e.clientX, y: e.clientY, sl: box.scrollLeft, st: box.scrollTop };
    box.classList.add('cv-panning');
}, true);
document.addEventListener('pointermove', e => {
    if (!_lhPan || e.pointerId !== _lhPan.id) return;
    const box = _lhCvBox();
    box.scrollLeft = _lhPan.sl - (e.clientX - _lhPan.x);
    box.scrollTop = _lhPan.st - (e.clientY - _lhPan.y);
}, true);
const _lhPanEnd = e => {
    if (!_lhPan || e.pointerId !== _lhPan.id) return;
    _lhPan = null;
    _lhCvBox().classList.remove('cv-panning');
};
document.addEventListener('pointerup', _lhPanEnd, true);
document.addEventListener('pointercancel', _lhPanEnd, true);

// 觸控手勢（畫布 CSS 是 touch-action: none，瀏覽器完全不接手，所以不會一下順一下卡、也不會把背後的主視窗拖著走）：
// ‧ 單指拖畫布空白處＝手掌工具（平移）；單指拖文字框＝捲文字框，文字框沒得捲就平移畫布
// ‧ 雙指＝以兩指中點為中心縮放，同時跟著中點平移；第二根手指一落下就放棄進行中的卡片手勢
// 兩指放開剩一指時不接著平移（免得畫面跳一下），要抬起再按
let _lhPinch = null;
let _lhTouchPan = null;   // { id, ta, x, y }：ta 有值＝從文字框開始，能捲就捲文字框
const _lhPts = new Map();
const _lhMid = () => {
    const [a, b] = [..._lhPts.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
};
_lhCvBox().addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch' || !_lhCvFree()) return;
    _lhPts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (_lhPts.size >= 2) {
        lhCanvasAbort();
        _lhTouchPan = null;
        const m = _lhMid();
        _lhPinch = { d0: m.d, z0: _lhCvZ(), mx: m.x, my: m.y };
        e.stopPropagation();
        return;
    }
    if (_lhCv) return;   // 標題列、右下角的卡片手勢
    const t = e.target, box = _lhCvBox();
    if (!t || !t.closest) return;
    // 單指：除了標題列（移動卡片）、右下角、按鈕與輸入元件，拖哪裡都是平移；從文字框開始且文字框捲得動就先捲文字框
    if (t !== box && t.closest('button, input, select, a, .cv-corner, .lyrics-section-header')) return;
    _lhTouchPan = { id: e.pointerId, ta: t.closest('textarea'), x: e.clientX, y: e.clientY };
}, true);
document.addEventListener('pointermove', e => {
    if (!_lhPts.has(e.pointerId)) return;
    _lhPts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const box = _lhCvBox();
    if (_lhPinch && _lhPts.size >= 2) {
        const m = _lhMid(), r = box.getBoundingClientRect();
        lhCanvasZoom(_lhPinch.z0 * m.d / _lhPinch.d0, m.x - r.left - box.clientLeft, m.y - r.top - box.clientTop);
        box.scrollLeft -= m.x - _lhPinch.mx;
        box.scrollTop -= m.y - _lhPinch.my;
        _lhPinch.mx = m.x;
        _lhPinch.my = m.y;
        return;
    }
    const p = _lhTouchPan;
    if (!p || e.pointerId !== p.id) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (p.ta && p.ta.scrollHeight > p.ta.clientHeight) p.ta.scrollTop -= dy;
    else {
        box.scrollLeft -= dx;
        box.scrollTop -= dy;
    }
    p.x = e.clientX;
    p.y = e.clientY;
}, true);
const _lhPtEnd = e => {
    _lhPts.delete(e.pointerId);
    if (_lhTouchPan && _lhTouchPan.id === e.pointerId) _lhTouchPan = null;
    if (_lhPts.size < 2) _lhPinch = null;
};
document.addEventListener('pointerup', _lhPtEnd, true);
document.addEventListener('pointercancel', _lhPtEnd, true);

// 鍵盤移動卡片：焦點在 ⋮⋮ 把手上，方向鍵每次 8px（Shift 40px）；Alt＋↑↓ 仍是調順序。走和拖曳同一條提交路徑：推開、一步復原
_lhCvBox().addEventListener('keydown', e => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.isComposing || !_lhCvFree()) return;
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    const handle = d && e.target.closest && e.target.closest('.section-handle');
    const card = handle && handle.closest('.lyrics-section');
    const song = curSong();
    const idx = card && song ? song.sections.findIndex(s => s.id === card.dataset.id) : -1;
    if (idx < 0) return;
    e.preventDefault();
    const step = e.shiftKey ? 40 : 8, r = { ...lhCanvasLayout(song.sections)[idx] };
    r.x = Math.min(LH_CV_MAX, Math.max(0, r.x + d[0] * step));
    r.y = Math.min(LH_CV_MAX, Math.max(0, r.y + d[1] * step));
    _lhCvCommit(card.dataset.id, r, 'canvas-move');
    lhSecEl(card.dataset.id)?.querySelector('.section-handle')?.focus({ preventScroll: true });
}, true);

// ===== 吸附分列：拖卡片之間的縫＝同時調整兩邊（和主視窗的分隔線一樣）=====
// 同一列兩張卡片之間的直縫：左右寬度一起變（120 格），靠近別列的直縫 3 格內就隔空對齊並亮導引線；
// 兩列之間的橫縫：上一列變高、下一列同時變矮（最後一列下面的縫只拉那一列）。連點兩下縫＝回預設（均分／跟著內容）。
// 縫上沒有元素：直接看指標落在 #lyricsSections 本身（卡片之外）的哪個位置；放開才寫模型，一步復原
let _lhRz = null;
const _lhRowsOn = () => _lhCvBox().dataset.layout === 'rows' && !_lhCvFree() && matchMedia('(min-width: 901px)').matches;

function _lhRowsGeom() {
    const song = curSong();
    if (!song) return [];
    return lhRowsOf(song.sections).map(row => {
        const els = row.map(id => lhSecEl(id)).filter(Boolean);
        const rs = els.map(e => e.getBoundingClientRect());
        return {
            row, els, rs, spans: lhRowSpans(song.sections, row),
            top: Math.min(...rs.map(r => r.top)), bottom: Math.max(...rs.map(r => r.bottom)),
            left: Math.min(...rs.map(r => r.left)), right: Math.max(...rs.map(r => r.right)),
        };
    }).filter(g => g.els.length);
}

// 指標在哪條縫上：{ kind: 'v', ri, k }（第 ri 列第 k、k+1 張之間）或 { kind: 'h', ri }（第 ri 列下面）
function _lhRowsHit(x, y) {
    const G = _lhRowsGeom();
    for (let i = 0; i < G.length; i++) {
        const g = G[i], next = G[i + 1];
        if (y >= g.top && y <= g.bottom) {
            for (let k = 0; k < g.rs.length - 1; k++) if (x >= g.rs[k].right - 2 && x <= g.rs[k + 1].left + 2) return { kind: 'v', ri: i, k, G };
            return null;
        }
        if (y > g.bottom && (next ? y < next.top : y <= g.bottom + 14) && x >= g.left && x <= g.right) return { kind: 'h', ri: i, G };
    }
    return null;
}

function _lhRzGuide(show, x, snapped) {
    let gl = document.getElementById('lhRowGuide');
    if (!show) { if (gl) gl.hidden = true; return; }
    if (!gl) {
        gl = document.createElement('div');
        gl.id = 'lhRowGuide';
        gl.setAttribute('aria-hidden', 'true');
        document.body.appendChild(gl);
    }
    const br = _lhCvBox().getBoundingClientRect();
    const sc = _lhCvBox().closest('.lyrics-area') || _lhCvBox();
    const vr = sc.getBoundingClientRect();
    const top = Math.max(br.top, vr.top), bottom = Math.min(br.bottom, vr.bottom);
    Object.assign(gl.style, { left: (x - 1) + 'px', top: top + 'px', height: Math.max(0, bottom - top) + 'px' });
    gl.classList.toggle('snap', !!snapped);
    gl.hidden = false;
}

// 滑鼠停在縫上：游標變成左右／上下拉
_lhCvBox().addEventListener('pointermove', e => {
    if (_lhRz || e.pointerType !== 'mouse') return;
    const box = _lhCvBox();
    const hit = e.target === box && _lhRowsOn() ? _lhRowsHit(e.clientX, e.clientY) : null;
    box.style.cursor = hit ? (hit.kind === 'v' ? 'col-resize' : 'row-resize') : '';
});

_lhCvBox().addEventListener('pointerdown', e => {
    const box = _lhCvBox();
    if (_lhRz || e.target !== box || !e.isPrimary || !_lhRowsOn()) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const hit = _lhRowsHit(e.clientX, e.clientY);
    if (!hit) return;
    e.preventDefault();
    const g = hit.G[hit.ri];
    _lhRz = { ...hit, g, next: hit.G[hit.ri + 1] || null, id: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false };
    if (hit.kind === 'v') {
        const before = g.spans.slice(0, hit.k).reduce((a, b) => a + b, 0);
        _lhRz.lo = before + LH_ROW_WMIN;
        _lhRz.hi = before + g.spans[hit.k] + g.spans[hit.k + 1] - LH_ROW_WMIN;
        _lhRz.c0 = before + g.spans[hit.k];
        _lhRz.c = _lhRz.c0;
        _lhRz.before = before;
        _lhRz.colPx = (g.right - g.left) / 120;
        // 別列的直縫位置（格數），隔空對齊用
        _lhRz.others = [];
        hit.G.forEach((o, i) => {
            if (i === hit.ri) return;
            let acc = 0;
            o.spans.slice(0, -1).forEach(w => { acc += w; _lhRz.others.push(acc); });
        });
    } else {
        _lhRz.a0 = g.bottom - g.top;
        _lhRz.b0 = _lhRz.next ? _lhRz.next.bottom - _lhRz.next.top : null;
    }
    document.body.classList.add('rows-resizing');
    document.body.style.cursor = hit.kind === 'v' ? 'col-resize' : 'row-resize';
    document.addEventListener('pointermove', _lhRzMove, true);
    document.addEventListener('pointerup', _lhRzUp, true);
    document.addEventListener('pointercancel', _lhRzCancel, true);
}, true);
// 觸控從縫開始：擋掉瀏覽器的捲動（pointerdown 比 touchstart 先到，所以這時 _lhRz 已經有值）
_lhCvBox().addEventListener('touchstart', e => { if (_lhRz) e.preventDefault(); }, { passive: false });

function _lhRzSetH(els, h) {
    for (const el of els) {
        el.dataset.rh = '1';
        el.style.setProperty('--r-h', Math.round(h) + 'px');
    }
}

function _lhRzMove(e) {
    const r = _lhRz;
    if (!r || e.pointerId !== r.id) return;
    if (!r.moved && Math.hypot(e.clientX - r.sx, e.clientY - r.sy) < 3) return;
    r.moved = true;
    if (r.kind === 'v') {
        let c = Math.round(r.c0 + (e.clientX - r.sx) / r.colPx);
        c = Math.min(r.hi, Math.max(r.lo, c));
        let snapped = false;
        if (!e.altKey) {   // 按住 Alt＝不吸附
            const near = r.others.filter(o => o >= r.lo && o <= r.hi && Math.abs(o - c) <= 3).sort((a, b) => Math.abs(a - c) - Math.abs(b - c))[0];
            if (near !== undefined) { c = near; snapped = true; }
        }
        r.c = c;
        const a = r.g.els[r.k], b = r.g.els[r.k + 1];
        a.style.setProperty('--r-span', String(c - r.before));
        b.style.setProperty('--r-col', String(c + 1));
        b.style.setProperty('--r-span', String(r.before + r.g.spans[r.k] + r.g.spans[r.k + 1] - c));
        const ar = a.getBoundingClientRect(), bb = b.getBoundingClientRect();
        _lhRzGuide(true, (ar.right + bb.left) / 2, snapped);
    } else {
        const dy = e.clientY - r.sy;
        let a = Math.min(LH_ROW_HMAX, Math.max(LH_ROW_HMIN, r.a0 + dy));
        if (r.b0 !== null) {
            let b = r.b0 - (a - r.a0);
            if (b < LH_ROW_HMIN) { b = LH_ROW_HMIN; a = r.a0 + r.b0 - LH_ROW_HMIN; }
            r.b = Math.round(b);
            _lhRzSetH(r.next.els, b);
        }
        r.a = Math.round(a);
        _lhRzSetH(r.g.els, a);
    }
}

function _lhRzEnd() {
    document.removeEventListener('pointermove', _lhRzMove, true);
    document.removeEventListener('pointerup', _lhRzUp, true);
    document.removeEventListener('pointercancel', _lhRzCancel, true);
    document.body.classList.remove('rows-resizing');
    document.body.style.cursor = '';
    _lhRzGuide(false);
    const r = _lhRz;
    _lhRz = null;
    return r;
}

function _lhRzCancel(e) {
    if (!_lhRz || e.pointerId !== _lhRz.id) return;
    _lhRzEnd();
    lhCanvasApply();
}

function _lhRzUp(e) {
    if (!_lhRz || e.pointerId !== _lhRz.id) return;
    const r = _lhRzEnd();
    if (!r.moved) { lhCanvasApply(); return; }
    const byId = new Map(curSong().sections.map(s => [s.id, s]));
    const step = lhSecApply('rows-size', () => {
        if (r.kind === 'v') {
            if (r.c === r.c0) return false;
            const spans = r.g.spans.slice();
            spans[r.k] = r.c - r.before;
            spans[r.k + 1] = r.before + r.g.spans[r.k] + r.g.spans[r.k + 1] - r.c;
            r.g.row.forEach((id, k) => { byId.get(id).rw = spans[k]; });
        } else {
            byId.get(r.g.row[0]).rh = r.a;
            if (r.next) byId.get(r.next.row[0]).rh = r.b;
        }
    });
    lhCanvasApply();
    if (step) lhAnnounce(r.kind === 'v' ? '已調整這一列的寬度比例' : '已調整列高');
}

// 連點兩下縫：這一列回到均分／跟著內容
_lhCvBox().addEventListener('dblclick', e => {
    if (e.target !== _lhCvBox() || !_lhRowsOn()) return;
    const hit = _lhRowsHit(e.clientX, e.clientY);
    if (!hit) return;
    const g = hit.G[hit.ri], next = hit.G[hit.ri + 1];
    const byId = new Map(curSong().sections.map(s => [s.id, s]));
    const step = lhSecApply('rows-size', () => {
        let changed = false;
        const clear = (id, k) => { const s = byId.get(id); if (s[k] !== undefined) { delete s[k]; changed = true; } };
        if (hit.kind === 'v') g.row.forEach(id => clear(id, 'rw'));
        else { clear(g.row[0], 'rh'); if (next) clear(next.row[0], 'rh'); }
        if (!changed) return false;
    });
    lhCanvasApply();
    if (step) lhAnnounce(hit.kind === 'v' ? '這一列回到均分寬度' : '列高回到跟著內容');
});
