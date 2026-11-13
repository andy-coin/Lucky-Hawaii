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
    box.scrollLeft = Math.max(0, sl);
    box.scrollTop = Math.max(0, st);
    _lhCvZoomLabel();
}
function _lhCvZoomLabel() {
    const b = document.getElementById('canvasZoomReset');
    if (b) b.textContent = Math.round(_lhCvZ() * 100) + '%';
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
        return;
    }
    _lhCvWasFree = true;
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
    } else {
        r.w = Math.min(LH_CV_WMAX, Math.max(LH_CV_WMIN, s.w + dx));
        r.h = Math.min(LH_CV_HMAX, Math.max(LH_CV_HMIN, s.h + dy));
    }
    _lhCvSetRect(g.card, r);
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

// 滑鼠平移：拖畫布空白處，或按住滑鼠中鍵拖任何地方（觸控的單指平移是瀏覽器原生捲動）
let _lhPan = null;
_lhCvBox().addEventListener('pointerdown', e => {
    if (_lhPan || _lhPinch || _lhCv || e.pointerType !== 'mouse' || !_lhCvFree()) return;
    if (!(e.button === 1 || (e.button === 0 && e.target === _lhCvBox()))) return;
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

// 雙指捏合：追蹤兩根手指的距離，以兩指中點為中心縮放；第二根手指一落下就放棄進行中的卡片手勢
let _lhPinch = null;
const _lhPts = new Map();
_lhCvBox().addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch' || !_lhCvFree()) return;
    _lhPts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (_lhPts.size !== 2) return;
    lhCanvasAbort();
    const [a, b] = [..._lhPts.values()];
    _lhPinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: _lhCvZ() };
    e.stopPropagation();
}, true);
document.addEventListener('pointermove', e => {
    if (!_lhPts.has(e.pointerId)) return;
    _lhPts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!_lhPinch || _lhPts.size < 2) return;
    const [a, b] = [..._lhPts.values()];
    const box = _lhCvBox(), r = box.getBoundingClientRect();
    lhCanvasZoom(_lhPinch.z0 * Math.hypot(a.x - b.x, a.y - b.y) / _lhPinch.d0, (a.x + b.x) / 2 - r.left - box.clientLeft, (a.y + b.y) / 2 - r.top - box.clientTop);
}, true);
const _lhPtEnd = e => {
    _lhPts.delete(e.pointerId);
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
