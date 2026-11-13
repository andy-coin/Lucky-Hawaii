// ==================== 段落模組：動作與事件 ====================
// 所有「改段落結構」的動作都走 lhSecApply：改模型 → 重算名稱 → 存檔 → 只更新畫面上變了的地方。
// 後面的計畫（復原、刪除、移動、顏色、插字）都從這個入口進來，歷史紀錄也只在這裡加。
// 標題列的點擊用事件委派掛在 #lyricsSections 上（不會被重畫），名稱與編號一律用 textContent，不拼 HTML。

// 用 data-id 找區塊（逐個比對，不把 id 組進選擇器字串）
function lhSecEl(id) {
    for (const el of document.getElementById('lyricsSections').children) {
        if (el.dataset.id === id) return el;
    }
    return null;
}

// 段落類型按鈕的文字、提示、無障礙名稱（建立與原地更新共用）
function lhSecFillTypeBtn(btn, label) {
    btn.textContent = label;
    btn.title = label;
    btn.setAttribute('aria-label', label + '，段落類型，按一下切換');
}

// ⋮⋮ 把手的無障礙名稱（建立與原地更新共用）
function lhSecHandleLabel(label) {
    if (document.getElementById('lyricsSections')?.dataset.canvas === 'free') return '拖曳移動「' + label + '」卡片，或按 Alt+上下鍵調整段落順序';
    return '拖曳排序「' + label + '」，或按 Alt+上下鍵移動';
}

// 底邊拉桿的無障礙名稱（建立與原地更新共用）
function lhSecResizeLabel(label) {
    return '調整「' + label + '」高度（雙擊回到自動高度）';
}

// kind：動作名稱（之後記進歷史）；mutate(song) 改模型，回傳 false 代表沒改；opts.dom === 'render' 才整個重畫
// 回傳這一步的歷史紀錄（真值）；沒改任何東西回傳 false
function lhSecApply(kind, mutate, opts = {}) {
    const song = curSong();
    if (!song) return false;
    lhHistEnsure(song).present = _snap(song);   // 改之前先確認歷史的「現在」是改之前的樣子（高度與收合不進歷史，但被刪的段落復原時要拿到最新值）
    if (mutate(song) === false) return false;
    lhSecFinalize(song.sections);
    const step = lhHistCommit(song, kind, opts.caret);
    markDirty(song.id);
    flushSongs();
    if (opts.dom === 'render') renderLyricsSections();
    else {
        if (opts.dom === 'move') lhSecMoveDom(opts.id, opts.beforeId);   // 搬現有節點，不重畫
        lhSecRefreshMeta();
    }
    return step;
}

// 給讀屏軟體的提示（#lhLive 在面板外面，不影響組字測試的 DOM 監看）
function lhAnnounce(msg) {
    const live = document.getElementById('lhLive');
    if (live) live.textContent = msg;
}

// 復原／重做後讓第一個變動的段落閃 700 毫秒外框（不用動畫，UI-SPEC D-14）
function lhSecFlash(id) {
    const el = lhSecEl(id);
    if (!el) return;
    el.classList.add('sec-flash');
    setTimeout(() => el.classList.remove('sec-flash'), 700);
}

// 依模型就地更新每個區塊的名稱、編號、placeholder；節點不換，焦點、游標、捲動、組字都不受影響
function lhSecRefreshMeta() {
    const song = curSong();
    if (!song) return;
    const byId = new Map(song.sections.map(s => [s.id, s]));
    [...document.getElementById('lyricsSections').children].forEach((el, i) => {
        const s = byId.get(el.dataset.id);
        if (!s) return;
        el.dataset.index = String(i);
        el.dataset.type = s.type;
        lhSecApplyColor(el, s.color);
        const btn = el.querySelector('.section-type');
        if (btn) lhSecFillTypeBtn(btn, s.label);
        const hd = el.querySelector('.section-handle');
        if (hd) hd.setAttribute('aria-label', lhSecHandleLabel(s.label));
        const rz = el.querySelector('.section-resize');
        if (rz) rz.setAttribute('aria-label', lhSecResizeLabel(s.label));
        const ta = el.querySelector('.section-textarea');
        if (ta) ta.placeholder = i === 0 ? '在這裡輸入或貼上歌詞…' : '在這裡輸入歌詞…';
        const rm = el.querySelector('.section-remove');
        if (rm) {
            rm.hidden = song.sections.length === 1;   // 只剩一段不能刪
            rm.setAttribute('aria-label', '刪除「' + s.label + '」');
        }
    });
    lhSecMenuSync();
    if (typeof lhMapOnSectionsChanged === 'function') lhMapOnSectionsChanged();   // 對照差異跟著新的對照段落走
}

// 刪除段落（C5）：不問、立刻刪，下方 5 秒內可按「復原」；只剩一段時什麼都不做
// 「復原」只在這一步還是歷史最上面一步時才動作，別的動作（打字、換歌）之後按了也不會誤動
function lhSecRemove(id) {
    const song = curSong();
    if (!song || song.sections.length < 2) return;
    const index = song.sections.findIndex(s => s.id === id);
    if (index < 0) return;
    const label = song.sections[index].label || '段落';
    const step = lhSecApply('remove', song => { song.sections.splice(index, 1); }, { dom: 'render' });
    if (!step) return;
    // 焦點（D-13）：滑鼠裝置落在原位置（沒有就最後一個）的類型鈕；觸控不聚焦，鍵盤不會自己彈出來
    if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
        const btns = document.querySelectorAll('#lyricsSections .section-type');
        btns[Math.min(index, btns.length - 1)]?.focus({ preventScroll: true });
    }
    showUndoToast('已刪除「' + cutName(label, 16) + '」', '復原', () => {
        if (lhHistTop(curSong()) === step) lhHistUndo();
    }, 5000, '復原刪除「' + label + '」');
}

// ===== 排序（C1～C3）：⋮⋮ 把手＋Pointer Events；拖曳中只動畫面上的覆蓋層，放開才寫一次模型 =====

// 把 id 這段搬到 beforeId 之前（null＝最後面）。順序沒變或找不到就回傳 false
function lhSecMoveTo(id, beforeId) {
    const song = curSong();
    if (!song) return false;
    const from = song.sections.findIndex(s => s.id === id);
    if (from < 0) return false;
    const rest = song.sections.filter(s => s.id !== id);
    const to = beforeId === null ? rest.length : rest.findIndex(s => s.id === beforeId);
    if (to < 0 || to === from) return false;
    const step = lhSecApply('move', song => {
        const [m] = song.sections.splice(from, 1);
        song.sections.splice(to, 0, m);
    }, { dom: 'move', id, beforeId });
    if (!step) return false;
    lhSecFlash(id);
    lhAnnounce(song.sections[to].label + ' 已移到第 ' + (to + 1) + ' 段，共 ' + song.sections.length + ' 段');
    return true;
}

// 鍵盤用：往上（-1）或往下（+1）一格；已在盡頭就什麼都不做
function lhSecMoveBy(id, delta) {
    const song = curSong();
    if (!song) return false;
    const i = song.sections.findIndex(s => s.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= song.sections.length) return false;
    // 往上：放到上一段前面；往下：放到下下段前面（沒有就最後）
    const next = delta < 0 ? song.sections[j] : song.sections[j + 1];
    const ok = lhSecMoveTo(id, next ? next.id : null);
    const el = ok && lhSecEl(id);
    if (el) if (!(typeof lhCanvasReveal === 'function' && lhCanvasReveal(el))) el.scrollIntoView({ block: 'nearest' });
    return ok;
}

// 搬現有節點（insertBefore）：textarea 的內容、游標、捲動都留著；搬節點會讓焦點丟失，所以搬完還給原本有焦點的元素
function lhSecMoveDom(id, beforeId /* null＝最後面 */) {
    const area = document.getElementById('lyricsSections');
    const el = lhSecEl(id);
    if (!el) return;
    const ref = beforeId ? lhSecEl(beforeId) : null;
    const ae = document.activeElement;
    const focused = ae && el.contains(ae) ? ae : null;
    const tas = [...el.querySelectorAll('textarea')].map(t => [t, t.scrollTop, t.selectionStart, t.selectionEnd]);
    const sc = lhSecScroller(), scTop = sc.scrollTop;
    area.insertBefore(el, ref);
    sc.scrollTop = scTop;   // 瀏覽器的捲動錨點會把被搬動的段落當錨，整個列表跟著跳一格；放回原本的位置
    for (const [t, top, a, b] of tas) {   // 重新插入會讓 textarea 的捲動歸零
        t.scrollTop = top;
        if (t === focused) t.setSelectionRange(a, b);
    }
    if (focused) focused.focus({ preventScroll: true });
}

let _lhDrag = null;   // 進行中的拖曳：{ handle, secEl, id, pointerId, sx, sy, x, y, started, raf, ghost, line, scroller, drop, touch }

// 其他段落中，第一個「中線在指標下面」的那段的 id；都沒有＝放最後（null）
function lhSecDropFor(d) {
    for (const el of document.getElementById('lyricsSections').children) {
        if (el === d.secEl || !el.classList.contains('lyrics-section')) continue;
        const b = el.getBoundingClientRect();
        if (d.y < b.top + b.height / 2) return el.dataset.id;
    }
    return null;
}

// 這個落點等於原位（原來的下一段就是落點）
function lhSecDropSame(d, beforeId) {
    const list = [...document.getElementById('lyricsSections').children].filter(c => c.classList.contains('lyrics-section'));
    const next = list[list.indexOf(d.secEl) + 1];
    return beforeId === (next ? next.dataset.id : null);
}

// 往上找第一個真的會捲動的祖先（含自己）；找不到就用列表本身
function lhSecScroller() {
    const area = document.getElementById('lyricsSections');
    for (let el = area; el && el !== document.body; el = el.parentElement) {
        const oy = getComputedStyle(el).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) return el;
    }
    return area;
}

// 超過 4px 才算開始拖：做出殘影與落點線
function lhSecDragBegin(d) {
    d.started = true;
    d.scroller = lhSecScroller();
    const song = curSong();
    const s = song && song.sections.find(x => x.id === d.id);
    const ghost = document.createElement('div');
    ghost.className = 'section-drag-ghost';
    if (s && /^#[0-9a-f]{6}$/.test(s.color || '')) {
        const bar = document.createElement('span');
        bar.className = 'section-drag-ghost-bar';
        bar.style.background = s.color;
        ghost.appendChild(bar);
    }
    const name = document.createElement('span');
    name.className = 'section-drag-ghost-name';
    name.textContent = d.secEl.querySelector('.section-type')?.textContent || '';
    const cnt = document.createElement('span');
    cnt.className = 'section-drag-ghost-count';
    cnt.textContent = d.secEl.querySelector('.section-count')?.textContent || '';
    ghost.append(name, cnt);
    document.body.appendChild(ghost);
    d.ghost = ghost;
    const line = document.createElement('div');
    line.className = 'section-drop-line';
    document.getElementById('lyricsSections').appendChild(line);
    d.line = line;
    d.secEl.classList.add('dragging');
    document.body.classList.add('is-section-dragging');
}

// 每個 pointermove 排一個 rAF：捲動、殘影位置、落點線；靠邊時持續排下一幀
function lhSecDragTick() {
    const d = _lhDrag;
    if (!d || !d.started) return;
    d.raf = 0;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const zone = 3 * rem;
    const r = d.scroller.getBoundingClientRect();
    const nearTop = d.y < r.top + zone, nearBottom = d.y > r.bottom - zone;
    if (nearTop || nearBottom) {
        // 越靠邊越快：每幀 0.25～0.75rem（功能性的，不受減少動態影響）
        const depth = Math.min(1, Math.max(0, (zone - (nearTop ? d.y - r.top : r.bottom - d.y)) / zone));
        d.scroller.scrollTop += (nearTop ? -1 : 1) * (0.25 + 0.5 * depth) * rem;
        d.raf = requestAnimationFrame(lhSecDragTick);
    }
    // 殘影：水平夾在歌詞列表內（左側面板或完整編輯器都一樣），觸控時放在手指上方（不被手指擋住）
    const pr = document.getElementById('lyricsSections').getBoundingClientRect();
    const w = d.ghost.offsetWidth, h = d.ghost.offsetHeight;
    const x = Math.max(pr.left, Math.min(d.x - w / 2, pr.right - w));
    const y = Math.max(0, Math.min(d.y - h / 2 - (d.touch ? 2 * rem : 0), innerHeight - h));
    d.ghost.style.transform = 'translate(' + x + 'px, ' + y + 'px)';
    // 落點線：放在目標段落上緣；放最後時貼在最後一段的下緣
    const beforeId = lhSecDropFor(d);
    const lh = d.line.offsetHeight;
    let top;
    if (beforeId) {
        const t = lhSecEl(beforeId);
        top = t.offsetTop - (parseFloat(getComputedStyle(t.parentElement).rowGap) || 0) / 2 - lh / 2;
    } else {
        const secs = [...document.getElementById('lyricsSections').children].filter(c => c.classList.contains('lyrics-section') && c !== d.secEl);
        const last = secs[secs.length - 1];
        top = last ? last.offsetTop + last.offsetHeight - lh : 0;
    }
    d.line.style.top = Math.max(0, top) + 'px';
    d.drop = beforeId;
}

// 結束一次拖曳：commit 為真且落點不是原位才寫模型；每條路徑都把事件、殘影、線、class 清乾淨
function lhSecDragEnd(commit) {
    const d = _lhDrag;
    if (!d) return;
    _lhDrag = null;
    cancelAnimationFrame(d.raf);
    d.handle.removeEventListener('pointermove', lhSecDragMove);
    d.handle.removeEventListener('pointerup', lhSecDragUp);
    d.handle.removeEventListener('pointercancel', lhSecDragCancel);
    d.handle.removeEventListener('lostpointercapture', lhSecDragCancel);
    document.removeEventListener('keydown', lhSecDragKey, true);
    try { d.handle.releasePointerCapture(d.pointerId); } catch (err) { lhWarn('releasePointerCapture 失敗', err); }
    const beforeId = d.started && commit ? lhSecDropFor(d) : undefined;   // 用放開當下的位置重算
    d.ghost?.remove();
    d.line?.remove();
    d.secEl.classList.remove('dragging');
    document.body.classList.remove('is-section-dragging');
    if (beforeId === undefined || lhSecDropSame(d, beforeId)) return;
    lhSecMoveTo(d.id, beforeId);
}

function lhSecDragMove(e) {
    const d = _lhDrag;
    if (!d || e.pointerId !== d.pointerId) return;
    d.x = e.clientX;
    d.y = e.clientY;
    if (!d.started) {
        if (Math.hypot(d.x - d.sx, d.y - d.sy) < 4) return;   // 點一下把手不算拖
        lhSecDragBegin(d);
    }
    if (!d.raf) d.raf = requestAnimationFrame(lhSecDragTick);
}

function lhSecDragUp(e) {
    const d = _lhDrag;
    if (!d || e.pointerId !== d.pointerId) return;
    d.x = e.clientX;
    d.y = e.clientY;
    lhSecDragEnd(true);
}

function lhSecDragCancel() { lhSecDragEnd(false); }

// Esc 取消：capture 階段攔下並 preventDefault，≤ 900 的 sheet 才不會同時被收起（panels.js 看 defaultPrevented）；組字中不攔
function lhSecDragKey(e) {
    if (e.key !== 'Escape' || e.isComposing || e.keyCode === 229) return;
    if (!_lhDrag || !_lhDrag.started) return;
    e.preventDefault();
    e.stopPropagation();
    lhSecDragEnd(false);
}

// ===== 高度（C4）：底邊拉桿；高度存在模型的 height（rem），不進復原歷史（D2），所以不走 lhSecApply =====

// 套用高度：null＝自動高度（拿掉 data-h 與 --sec-h）；數字夾在 4～60 rem、取一位小數。
// 只用 style.setProperty 寫「有限數字＋rem」，不拼 cssText（T-09-15）。回傳實際套用的值
function lhSecSetHeight(secEl, rem) {
    let v = null;
    if (typeof rem === 'number' && Number.isFinite(rem)) {
        v = Math.round(Math.min(LH_SEC_H_MAX, Math.max(LH_SEC_H_MIN, rem)) * 10) / 10;
        secEl.dataset.h = String(v);
        secEl.style.setProperty('--sec-h', v + 'rem');
    } else {
        delete secEl.dataset.h;
        secEl.style.removeProperty('--sec-h');
    }
    lhSecBarNow(secEl);
    return v;
}

const _lhRootPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

// 現在的輸入框高度（rem）；段落收合或面板收起時量不到（0），回傳 null
function lhSecNowRem(secEl) {
    const ta = secEl.querySelector('.section-textarea');
    const h = ta ? ta.getBoundingClientRect().height : 0;
    return h > 0 ? h / _lhRootPx() : null;
}

// aria-valuenow 跟著畫面上的高度（夾在 min～max 之間，量不到就先不寫）
function lhSecBarNow(secEl) {
    const rz = secEl.querySelector('.section-resize');
    const n = secEl.dataset.h ? Number(secEl.dataset.h) : lhSecNowRem(secEl);
    if (!rz || n === null) return;
    rz.setAttribute('aria-valuenow', String(Math.round(Math.min(LH_SEC_H_MAX, Math.max(LH_SEC_H_MIN, n)) * 10) / 10));
}

// 把畫面上的高度寫進模型並存檔（沒有歷史步驟；放開、鍵盤、重設共用）
function lhSecSaveHeight(secEl) {
    const song = curSong();
    const s = song && song.sections.find(x => x.id === secEl.dataset.id);
    if (!s) return;
    s.height = secEl.dataset.h ? Number(secEl.dataset.h) : null;
    markDirty(song.id);
    flushSongs();
}

// 回到自動高度
function lhSecResetHeight(secEl) {
    if (!secEl.dataset.h) return;
    lhSecSetHeight(secEl, null);
    lhSecSaveHeight(secEl);
}

let _lhResize = null;   // 進行中的拉動：{ bar, secEl, pointerId, sy, startPx, stored, moved }
let _lhLastTap = null;  // 上一次沒拉動的放開：{ bar, t, x, y }，用來認「連點兩下」（觸控沒有 dblclick）

// 結束一次拉動：commit 為真才存；否則高度回到拉之前
function lhSecResizeEnd(commit) {
    const r = _lhResize;
    if (!r) return;
    _lhResize = null;
    r.bar.removeEventListener('pointermove', lhSecResizeMove);
    r.bar.removeEventListener('pointerup', lhSecResizeUp);
    r.bar.removeEventListener('pointercancel', lhSecResizeCancel);
    r.bar.removeEventListener('lostpointercapture', lhSecResizeCancel);
    document.removeEventListener('keydown', lhSecResizeKey, true);
    try { r.bar.releasePointerCapture(r.pointerId); } catch (err) { lhWarn('releasePointerCapture 失敗', err); }
    document.body.classList.remove('is-section-resizing');
    r.bar.classList.remove('resizing');
    if (commit && r.moved) lhSecSaveHeight(r.secEl);
    else if (r.moved) lhSecSetHeight(r.secEl, r.stored);
}

function lhSecResizeMove(e) {
    const r = _lhResize;
    if (!r || e.pointerId !== r.pointerId) return;
    if (!r.moved) {
        if (Math.abs(e.clientY - r.sy) < 3) return;   // 點一下不算拉
        r.moved = true;
        _lhLastTap = null;
    }
    lhSecSetHeight(r.secEl, (r.startPx + e.clientY - r.sy) / _lhRootPx());
}

function lhSecResizeUp(e) {
    const r = _lhResize;
    if (!r || e.pointerId !== r.pointerId) return;
    if (r.moved) lhSecSetHeight(r.secEl, (r.startPx + e.clientY - r.sy) / _lhRootPx());
    else if (e.pointerType !== 'mouse') {
        // 連點兩下：300 毫秒內、20px 內的第二次放開（滑鼠走 dblclick）
        const t = _lhLastTap;
        if (t && t.bar === r.bar && e.timeStamp - t.t < 300 && Math.hypot(e.clientX - t.x, e.clientY - t.y) <= 20) {
            _lhLastTap = null;
            lhSecResizeEnd(false);
            lhSecResetHeight(r.secEl);
            return;
        }
        _lhLastTap = { bar: r.bar, t: e.timeStamp, x: e.clientX, y: e.clientY };
    }
    lhSecResizeEnd(true);
}

function lhSecResizeCancel() { lhSecResizeEnd(false); }

// Esc 取消：跟排序拖曳一樣在 capture 階段攔下（≤ 900 的 sheet 才不會同時被收起）；組字中不攔
function lhSecResizeKey(e) {
    if (e.key !== 'Escape' || e.isComposing || e.keyCode === 229) return;
    if (!_lhResize || !_lhResize.moved) return;
    e.preventDefault();
    e.stopPropagation();
    lhSecResizeEnd(false);
}

// 給外面用：重畫列表、跨 900px、收起左面板時，把進行中的拖曳與拉動乾淨收掉（模型與高度不動）
function lhSecAbortInteractions() {
    lhSecDragEnd(false);
    lhSecResizeEnd(false);
    if (typeof lhCanvasAbort === 'function') lhCanvasAbort();   // 自由畫布的卡片拖曳／拉大小（canvas.js 較晚載入）
    lhSecCloseMenu();
    lhMoveSelClose();   // 選取移動選單（檔尾；函式宣告會提升）
    if (typeof lhMapCloseAll === 'function') lhMapCloseAll();   // 韻腳選單（js/rhyme-map.js 最後才載入）
    if (typeof lhWordDragCancel === 'function') lhWordDragCancel();   // word-drag.js 最後才載入；第一次重畫時它還不存在
}
LH_MQ_SHEET.addEventListener('change', lhSecAbortInteractions);
new MutationObserver(() => {
    if (document.getElementById('leftPanel').classList.contains('collapsed')) lhSecAbortInteractions();
}).observe(document.getElementById('leftPanel'), { attributes: true, attributeFilter: ['class'] });

document.getElementById('lyricsSections').addEventListener('pointerdown', e => {
    const rbar = e.target.closest && e.target.closest('.section-resize');
    if (rbar) {
        if (_lhResize || !e.isPrimary) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        const secEl = rbar.closest('.lyrics-section');
        if (!secEl) return;
        lhSecCloseMenu();
        lhSecDragEnd(false);   // 同時只有一種手勢
        const startPx = secEl.querySelector('.section-textarea').getBoundingClientRect().height;
        _lhResize = {
            bar: rbar, secEl, pointerId: e.pointerId, sy: e.clientY, startPx,
            stored: secEl.dataset.h ? Number(secEl.dataset.h) : null, moved: false,
        };
        try { rbar.setPointerCapture(e.pointerId); } catch (err) { lhWarn('setPointerCapture 失敗', err); }
        rbar.addEventListener('pointermove', lhSecResizeMove);
        rbar.addEventListener('pointerup', lhSecResizeUp);
        rbar.addEventListener('pointercancel', lhSecResizeCancel);
        rbar.addEventListener('lostpointercapture', lhSecResizeCancel);
        document.addEventListener('keydown', lhSecResizeKey, true);
        document.body.classList.add('is-section-resizing');
        rbar.classList.add('resizing');
        lhSecBarNow(secEl);
        return;
    }
    const handle = e.target.closest && e.target.closest('.section-handle');
    if (!handle || _lhDrag || !e.isPrimary) return;
    if (document.getElementById('lyricsSections').dataset.canvas === 'free') return;   // 自由畫布：⋮⋮ 是移動卡片（js/canvas.js），不啟動排序
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const secEl = handle.closest('.lyrics-section');
    if (!secEl) return;
    lhSecCloseMenu();
    _lhDrag = {
        handle, secEl, id: secEl.dataset.id, pointerId: e.pointerId, touch: e.pointerType === 'touch',
        sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY,
        started: false, raf: 0, ghost: null, line: null, scroller: null, drop: null,
    };
    try { handle.setPointerCapture(e.pointerId); } catch (err) { lhWarn('setPointerCapture 失敗', err); }
    handle.addEventListener('pointermove', lhSecDragMove);
    handle.addEventListener('pointerup', lhSecDragUp);
    handle.addEventListener('pointercancel', lhSecDragCancel);
    handle.addEventListener('lostpointercapture', lhSecDragCancel);
    document.addEventListener('keydown', lhSecDragKey, true);
});

// 拉桿：滑鼠雙擊回自動高度（觸控的連點兩下在 pointerup 認）
document.getElementById('lyricsSections').addEventListener('dblclick', e => {
    const rz = e.target.closest && e.target.closest('.section-resize');
    const secEl = rz && rz.closest('.lyrics-section');
    if (secEl) lhSecResetHeight(secEl);
});

// 拉桿：點到或聚焦時，aria-valuenow 對上畫面上的高度（自動高度時才需要量）
document.getElementById('lyricsSections').addEventListener('focusin', e => {
    const rz = e.target.closest && e.target.closest('.section-resize');
    if (rz) lhSecBarNow(rz.closest('.lyrics-section'));
});

// 拉桿鍵盤：↑／↓ 一次 1rem，Shift 一次 4rem，Home 回自動高度；每次都存，不進歷史
document.getElementById('lyricsSections').addEventListener('keydown', e => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.isComposing || e.keyCode === 229) return;
    const rz = e.target.closest && e.target.closest('.section-resize');
    const secEl = rz && rz.closest('.lyrics-section');
    if (!secEl) return;
    if (e.key === 'Home') {
        e.preventDefault();
        lhSecResetHeight(secEl);
        return;
    }
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const cur = secEl.dataset.h ? Number(secEl.dataset.h) : lhSecNowRem(secEl);
    if (cur === null) return;   // 量不到（面板收起）就不動
    const step = (e.shiftKey ? 4 : 1) * (e.key === 'ArrowUp' ? -1 : 1);
    lhSecSetHeight(secEl, cur + step);
    lhSecSaveHeight(secEl);
});

// 鍵盤：焦點在把手時 Alt+↑／↓ 移一格；移完焦點還在這一段的把手上，可以連按
document.getElementById('lyricsSections').addEventListener('keydown', e => {
    if (!e.altKey || e.ctrlKey || e.metaKey || e.isComposing || e.keyCode === 229) return;
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    const handle = e.target.closest && e.target.closest('.section-handle');
    const secEl = handle && handle.closest('.lyrics-section');
    if (!secEl) return;
    e.preventDefault();
    lhSecMoveBy(secEl.dataset.id, e.key === 'ArrowUp' ? -1 : 1);
});

// ===== 字數（E1、E2）：每段一個 Text node，只改 .data，不增減節點；各段字數快取在 Map，打字時只重算那一段 =====
const _lhSecCounts = new Map();   // 段落 id → 字數

function _lhSecShowTotal() {
    const song = curSong();
    const node = document.getElementById('songTotal')?.firstChild;
    if (!song || !node) return;
    let sum = 0;
    for (const s of song.sections) sum += _lhSecCounts.get(s.id) || 0;
    node.data = '共 ' + sum + ' 字';
}

// 全部重算（重畫列表、換歌之後）
function lhSecCountAll() {
    const song = curSong();
    _lhSecCounts.clear();
    if (!song) return;
    for (const s of song.sections) _lhSecCounts.set(s.id, lhCountWords(s.text));
    for (const el of document.getElementById('lyricsSections').children) {
        const node = el.querySelector('.section-count')?.firstChild;
        if (node) node.data = (_lhSecCounts.get(el.dataset.id) || 0) + ' 字';
    }
    _lhSecShowTotal();
    if (typeof lhMapRenderAll === 'function') lhMapRenderAll();   // 韻腳地圖（js/rhyme-map.js 最後載入）：每次重畫列表都整個重上色
}

// 只重算一段（打字、組字確認之後）：從模型讀文字，絕不碰 textarea
// 段落依內容自動長高（Andy：段落自己的捲軸和整個歌詞區的捲軸打架）：只留歌詞區一條捲軸。
// 先設 auto 再量 scrollHeight；外層捲動位置先記下來再放回去，不然量的那一瞬間會跳。
// 看不見（收合、display:none）的不量；寬度變了（換行跟著變）由 ResizeObserver 重量
function lhSecFit(ta) {
    if (!ta || !ta.offsetParent) return;
    const sc = [ta.closest('.lyrics-area'), ta.closest('.lyrics-main')].filter(Boolean).map(el => [el, el.scrollTop]);
    const own = ta.scrollTop;   // 鍵盤打開時段落自己捲（CSS 用 !important 蓋掉高度），位置也要保住
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
    for (const [el, top] of sc) el.scrollTop = top;
    ta.scrollTop = own;
}
const _lhSecFitW = new WeakMap();
const _lhSecFitRO = new ResizeObserver(es => {
    for (const e of es) {
        const w = e.contentRect.width;
        if (_lhSecFitW.get(e.target) !== w) { _lhSecFitW.set(e.target, w); lhSecFit(e.target); }
    }
});

// ==================== 並排角色欄（對唱、音樂劇） ====================
// 第一欄就是原本的歌詞（.section-textarea，所有既有功能照舊）；加的欄是 .section-col-ta，有自己的鏡像層（韻腳上色）。
// 有角色欄時所有欄不自動換行、太長就左右捲，這樣第 n 行在每一欄都在同一個高度（逐行對齊）
function lhSecBuildCols(body, s, ta0) {
    const n = s.cols.length + 1;
    body.classList.add('has-cols');
    body.style.setProperty('--cols', String(n));
    const heads = [];
    for (let k = 0; k < n; k++) {
        const h = _lhMk('div', 'sec-role');
        const name = _lhMk('input', 'sec-role-name');
        name.type = 'text';
        name.dataset.col = String(k);
        name.maxLength = LH_SEC_ROLE_MAX;
        name.placeholder = '角色 ' + (k + 1);
        name.value = k ? s.cols[k - 1].name : (s.role || '');
        name.setAttribute('aria-label', '第 ' + (k + 1) + ' 欄的角色名');
        h.append(name);
        if (k) {
            const del = _lhMkBtn('sec-col-del', '×', '刪除第 ' + (k + 1) + ' 欄');
            del.dataset.col = String(k);
            h.append(del);
        }
        if (k === n - 1 && n <= LH_SEC_COLS_MAX) h.append(_lhMkBtn('sec-col-add', '＋', '再加一欄角色'));
        heads.push(h);
    }
    body.prepend(...heads);
    s.cols.forEach((c, j) => {
        const m = _lhMk('div', 'rhyme-mirror');
        m.setAttribute('aria-hidden', 'true');
        const t = _lhMk('textarea', 'section-col-ta');
        t.dataset.col = String(j + 1);
        t.placeholder = '第 ' + (j + 2) + ' 個角色的歌詞，每行對齊左邊那一欄';
        t.setAttribute('aria-label', (c.name || '角色 ' + (j + 2)) + ' 的歌詞');
        t.value = c.text;
        body.append(m, t);
        _lhSecFitRO.observe(t);
    });
    ta0.setAttribute('aria-label', (s.role || '角色 1') + ' 的歌詞');
}

// 加一欄／刪一欄：結構步驟（可復原），整段重畫
function lhSecAddCol(id) {
    lhSecApply('cols', song => {
        const s = song.sections.find(x => x.id === id);
        if (!s || (s.cols && s.cols.length >= LH_SEC_COLS_MAX)) return false;
        s.cols = [...(s.cols || []), { name: '', text: '' }];
    }, { dom: 'render' });
    lhSecEl(id)?.querySelector('.section-col-ta:last-of-type')?.focus({ preventScroll: true });
}
function lhSecDelCol(id, k) {
    lhSecApply('cols', song => {
        const s = song.sections.find(x => x.id === id);
        if (!s || !s.cols || !s.cols[k - 1]) return false;
        s.cols = s.cols.filter((_, j) => j !== k - 1);
        if (!s.cols.length) { delete s.cols; delete s.role; }
    }, { dom: 'render' });
}

// 角色欄打字：自己長高、記一步打字（和第一欄分開合併）、重排韻腳上色
function lhSecColTyped(t) {
    const secEl = t.closest('.lyrics-section');
    if (!secEl) return;
    lhSecFit(t);
    lhHistTyping(curSong(), secEl.dataset.id + '#' + t.dataset.col, t.selectionStart);
    if (typeof lhMapSchedule === 'function') lhMapSchedule(secEl);
}

document.getElementById('lyricsSections').addEventListener('click', e => {
    const add = e.target.closest && e.target.closest('.sec-col-add');
    const del = e.target.closest && e.target.closest('.sec-col-del');
    const secEl = (add || del) && e.target.closest('.lyrics-section');
    if (!secEl) return;
    e.stopPropagation();
    if (add) return lhSecAddCol(secEl.dataset.id);
    // 有字的欄要按兩下才刪（第一下變「確定？」，3 秒內再按）
    const sec = curSong().sections.find(x => x.id === secEl.dataset.id), k = +del.dataset.col;
    if (sec && sec.cols && sec.cols[k - 1] && sec.cols[k - 1].text.trim() && del.dataset.armed !== '1') {
        del.dataset.armed = '1';
        del.textContent = '確定？';
        setTimeout(() => { del.dataset.armed = ''; del.textContent = '×'; }, 3000);
        return;
    }
    lhSecDelCol(secEl.dataset.id, k);
}, true);

function lhSecCountOne(secEl) {
    const song = curSong();
    const s = song && secEl && song.sections.find(x => x.id === secEl.dataset.id);
    if (!s) return;
    const n = lhCountWords(s.text);
    _lhSecCounts.set(s.id, n);
    const node = secEl.querySelector('.section-count')?.firstChild;
    if (node) node.data = n + ' 字';
    _lhSecShowTotal();
    lhSecFit(secEl.querySelector('.section-textarea'));
    if (typeof lhMapSchedule === 'function') lhMapSchedule(secEl);   // 韻腳地圖：只排程這一段（涵蓋打字、組字確認、復原、拖字）
}

// 事件用：只有段落輸入框才算（情境欄位不算字數）
function lhSecCountFrom(target) {
    if (target && target.classList && target.classList.contains('section-textarea')) lhSecCountOne(target.closest('.lyrics-section'));
}

let _lhMenuDrop = false;      // 這次選單是左鍵點名稱鈕開的（下拉模式）
let _lhMenuClosedBy = null;   // 按下名稱鈕時關掉的是哪一段的選單（同一段就不重開，達成「再點一次收起」）

// 標題列：型別按鈕開下拉選單、− 刪除、其餘空白處收合／展開
document.getElementById('lyricsSections').addEventListener('click', e => {
    const secEl = e.target.closest('.lyrics-section');
    if (!secEl) return;
    const typeBtn = e.target.closest('.section-type');
    if (typeBtn) {
        // 點名稱鈕＝下拉選單（Andy：循環切換不方便）；剛才那一下是在關同一段的選單，就只關不重開
        if (_lhMenuClosedBy === secEl.dataset.id) { _lhMenuClosedBy = null; return; }
        _lhMenuUnder(typeBtn, e.detail === 0, true);
    } else if (e.target.closest('.section-remove')) {
        lhSecRemove(secEl.dataset.id);
    } else if (e.target.closest('.lyrics-section-header') && !e.target.closest('.section-handle, .section-count, .section-rhyme')) {
        toggleLyricsSection(Number(secEl.dataset.index));
    }
});

// ===== 段落設定（EDIT-06）：右鍵／長按名稱鈕開 #sectionMenu；選單只建一次，每次打開重填文字 =====
// 8 個預設色只寫在這裡（CSS 不放色碼）；模型接受任何 #rrggbb，預設色只是快選（UI-SPEC D-04）
const LH_SEC_COLORS = [
    { name: '紅', hex: '#e05d5d' }, { name: '橘', hex: '#e98a3c' }, { name: '黃', hex: '#d69e2e' }, { name: '綠', hex: '#48a868' },
    { name: '青', hex: '#2c9fa0' }, { name: '藍', hex: '#4a7fd4' }, { name: '紫', hex: '#8d6bd0' }, { name: '粉', hex: '#d2649a' },
];
const _LH_COLOR_OUT = /^#[0-9a-f]{6}$/;   // 只有這個格式的值才會進 style／dataset（T-09-16）
const _LH_FINE = '(hover: hover) and (pointer: fine)';
let _lhMenu = null;     // #sectionMenu 節點（第一次打開才建）
let _lhMenuId = null;   // 開著的是哪一段（id）；null＝關著

// 顏色上畫面：dataset.color 給 CSS 屬性選擇器，--sec-color 給色條與淺底；值不合格式就拿掉
function lhSecApplyColor(secEl, color) {
    if (typeof color === 'string' && _LH_COLOR_OUT.test(color)) {
        secEl.dataset.color = color;
        secEl.style.setProperty('--sec-color', color);
    } else {
        delete secEl.dataset.color;
        secEl.style.removeProperty('--sec-color');
    }
}

// 建一個節點：文字一律走 textContent
function _lhMk(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
}
function _lhMkBtn(cls, text, label) {
    const b = _lhMk('button', cls, text);
    b.type = 'button';
    if (label) b.setAttribute('aria-label', label);
    return b;
}
// 有標題文字的區塊
function _lhMkBlock(cap, ...kids) {
    const b = _lhMk('div', 'section-menu-block');
    b.append(_lhMk('span', 'section-menu-cap', cap), ...kids);
    return b;
}

function lhSecMenuBuild() {
    if (_lhMenu) return _lhMenu;
    const m = _lhMk('div', 'word-ctx-menu section-menu');
    m.id = 'sectionMenu';
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-label', '段落設定');
    const title = _lhMk('div', 'section-menu-title');
    // 顏色
    const grid = _lhMk('div', 'swatch-grid');
    for (const c of LH_SEC_COLORS) {
        const sw = _lhMkBtn('swatch', '', '顏色：' + c.name);
        sw.dataset.hex = c.hex;
        sw.style.setProperty('--sw', c.hex);
        grid.appendChild(sw);
    }
    const pick = _lhMk('input', 'section-color-input');
    pick.type = 'color';
    pick.value = '#888888';
    pick.setAttribute('aria-label', '自訂顏色');
    const none = _lhMkBtn('section-menu-btn section-color-none', '無顏色');
    const row = _lhMk('div', 'section-menu-row');
    row.append(pick, none);
    // 類型：8 個 radio，兩欄
    const types = _lhMk('div', 'type-grid');
    types.setAttribute('role', 'radiogroup');
    types.setAttribute('aria-label', '段落類型');
    for (const t of LH_SEC_TYPES) {
        const r = _lhMkBtn('type-row', LH_SEC_NAMES[t]);
        r.setAttribute('role', 'radio');
        r.dataset.type = t;
        types.appendChild(r);
    }
    // 自訂名稱（只有 Custom 才顯示）
    const name = _lhMk('input', 'section-name-input');
    name.type = 'text';
    name.maxLength = LH_SEC_CUSTOM_MAX;
    name.placeholder = '例如：Rap、Solo、Hook';
    name.setAttribute('aria-label', '自訂段落名稱');
    const nameBlock = _lhMkBlock('自訂名稱', name);
    nameBlock.classList.add('section-menu-name');
    // 位置
    const up = _lhMkBtn('section-menu-btn section-move-up', '↑ 上移');
    const down = _lhMkBtn('section-menu-btn section-move-down', '↓ 下移');
    const moves = _lhMk('div', 'section-menu-row');
    moves.append(up, down);
    const close = _lhMkBtn('section-menu-btn section-menu-close', '關閉設定');
    // 並排角色欄入口先關掉（0.96.31 起改用逐字角色標記，之後由自由畫布排版取代）；已存的 cols／role 照樣讀、顯示、編輯、匯出
    // const colAdd = _lhMkBtn('section-menu-btn section-col-menu', '＋ 並排角色欄');
    // colAdd.addEventListener('click', () => {
    //     if (colAdd.getAttribute('aria-disabled') === 'true' || !_lhMenuId) return;
    //     const id = _lhMenuId;
    //     lhSecCloseMenu();
    //     lhSecAddCol(id);
    // });
    // const colBlock = _lhMkBlock('角色（對唱、音樂劇）', colAdd);
    // colBlock.classList.add('section-col-block');   // 左鍵點名稱開的下拉不顯示（只給選類型，保持矮），右鍵／長按的完整設定才有
    // m.append(title, _lhMkBlock('類型', types), nameBlock, _lhMkBlock('顏色', grid, row), _lhMkBlock('位置', moves), colBlock, close);
    m.append(title, _lhMkBlock('類型', types), nameBlock, _lhMkBlock('顏色', grid, row), _lhMkBlock('位置', moves), close);
    document.body.appendChild(m);

    // 顏色：色票與「無顏色」馬上套用；原生選色盤拖動時只預覽（input），放開才記一步（change，D-06）
    grid.addEventListener('click', e => {
        const sw = e.target.closest && e.target.closest('.swatch');
        if (sw) lhSecMenuColor(sw.dataset.hex);
    });
    none.addEventListener('click', () => lhSecMenuColor(''));
    pick.addEventListener('input', () => {
        const el = _lhMenuId && lhSecEl(_lhMenuId);
        if (el && _LH_COLOR_OUT.test(pick.value)) lhSecApplyColor(el, pick.value);   // 只改畫面，不碰模型與歷史
    });
    pick.addEventListener('change', () => lhSecMenuColor(pick.value));
    // 類型：點一下就換；方向鍵只移焦點（頭尾相接），Enter／空白才是選
    types.addEventListener('click', e => {
        const r = e.target.closest && e.target.closest('.type-row');
        if (!r) return;
        lhSecMenuType(r.dataset.type);
        // 左鍵點開的下拉：選好類型就收起、焦點回名稱鈕；Custom 留著打名字。右鍵／長按開的是完整設定，不收
        if (_lhMenuDrop && r.dataset.type !== 'custom') {
            const id = _lhMenuId;
            lhSecCloseMenu();
            lhSecEl(id)?.querySelector('.section-type')?.focus({ preventScroll: true });
            return;
        }
        // 桌機選 Custom 直接可以打名字；觸控不聚焦，免得鍵盤自己彈出來（D-13）
        if (r.dataset.type === 'custom' && matchMedia(_LH_FINE).matches) {
            name.focus({ preventScroll: true });
            name.setSelectionRange(name.value.length, name.value.length);
        }
    });
    types.addEventListener('keydown', e => {
        const k = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        const rows = [...types.children];
        const i = rows.indexOf(document.activeElement);
        if (!k || i < 0 || e.isComposing || e.keyCode === 229) return;
        e.preventDefault();
        rows.forEach(r => r.tabIndex = -1);
        const next = rows[(i + k + rows.length) % rows.length];
        next.tabIndex = 0;
        next.focus({ preventScroll: true });
    });
    // 自訂名稱：Enter 或離開欄位送出（一步）；Esc 還原文字、選單不關；組字中的 Enter／Esc 是選字與取消組字，一律不處理
    name.addEventListener('keydown', e => {
        if (e.isComposing || e.keyCode === 229) return;
        if (e.key === 'Enter') {
            e.preventDefault();
            lhSecMenuName(name.value);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();   // 不讓 ≤ 900 的 sheet 一起收起
            const s = _lhMenuSec();
            name.value = s ? s.custom : '';
        }
    });
    name.addEventListener('blur', () => lhSecMenuName(name.value));
    // 位置：移完選單還開著（觸控沒有拖曳時的替代做法，C3）
    for (const [btn, delta] of [[up, -1], [down, 1]]) {
        btn.addEventListener('click', () => {
            if (btn.getAttribute('aria-disabled') === 'true' || !_lhMenuId) return;
            lhSecMoveBy(_lhMenuId, delta);
            lhSecMenuSync();
        });
    }
    close.addEventListener('click', () => lhSecCloseMenu(true));
    // Tab 在選單裡頭尾相接（D-05）
    m.addEventListener('keydown', e => {
        if (e.key !== 'Tab') return;
        const items = [...m.querySelectorAll('button, input')].filter(n => n.tabIndex >= 0 && n.offsetParent !== null);
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    _lhMenu = m;
    return m;
}

// 目前這一段的模型資料（沒開或找不到回傳 null）
function _lhMenuSec() {
    const song = curSong();
    return (song && _lhMenuId && song.sections.find(s => s.id === _lhMenuId)) || null;
}

// 這一步只改一個欄位；沒變就不記歷史（lhSecApply 收到 false 就不動）
function _lhMenuSet(kind, field, value) {
    const id = _lhMenuId;
    if (!id) return;
    lhSecApply(kind, song => {
        const s = song.sections.find(x => x.id === id);
        if (!s || s[field] === value) return false;
        s[field] = value;
    });
}

// 顏色：'' 或 #rrggbb（轉小寫）；其他格式一律不存（T-09-16）
function lhSecMenuColor(color) {
    const c = typeof color === 'string' ? color.toLowerCase() : null;
    if (c === '' || (c !== null && _LH_COLOR_OUT.test(c))) _lhMenuSet('color', 'color', c);
}

function lhSecMenuType(type) {
    if (LH_SEC_TYPE_SET.has(type)) _lhMenuSet('type', 'type', type);
}

// 自訂名稱：去頭尾空白、最多 40 個字元；空白＝沒有名字（顯示 Custom）
function lhSecMenuName(raw) {
    const input = _lhMenu && _lhMenu.querySelector('.section-name-input');
    if (!_lhMenuSec()) return;
    const v = Array.from(String(raw).trim()).slice(0, LH_SEC_CUSTOM_MAX).join('');
    _lhMenuSet('custom', 'custom', v);
    if (input) input.value = v;
}

// 依模型更新選單上會變的部分；使用者正在打字的輸入框不動
function lhSecMenuSync() {
    const s = _lhMenuSec();
    if (!_lhMenu || !s) return;
    const song = curSong();
    const i = song.sections.indexOf(s), n = song.sections.length;
    _lhMenu.querySelector('.section-menu-title').textContent = '段落設定：' + cutName(s.label, 16);
    _lhMenu.querySelectorAll('.swatch').forEach(sw => sw.setAttribute('aria-pressed', String(sw.dataset.hex === s.color)));
    _lhMenu.querySelector('.section-color-none').setAttribute('aria-pressed', String(!s.color));
    if (s.color) _lhMenu.querySelector('.section-color-input').value = s.color;
    _lhMenu.querySelectorAll('.type-row').forEach(r => {
        const on = r.dataset.type === s.type;
        r.setAttribute('aria-checked', String(on));
        r.tabIndex = on ? 0 : -1;
    });
    _lhMenu.querySelector('.section-menu-name').hidden = s.type !== 'custom';
    const name = _lhMenu.querySelector('.section-name-input');
    if (document.activeElement !== name) name.value = s.custom;
    // 入口關掉了（見 lhSecMenuBuild），這三行會讀到不存在的節點
    // const ca = _lhMenu.querySelector('.section-col-menu'), nc = s.cols ? s.cols.length : 0;
    // ca.textContent = nc ? '＋ 再加一欄角色（目前 ' + (nc + 1) + ' 欄）' : '＋ 並排角色欄';
    // ca.setAttribute('aria-disabled', String(nc >= LH_SEC_COLS_MAX));
    for (const [sel, off] of [['.section-move-up', i <= 0], ['.section-move-down', i >= n - 1]]) {
        _lhMenu.querySelector(sel).setAttribute('aria-disabled', String(off));
    }
    // 開著時內容變高（例如選 Custom 多出名稱欄）：重新夾回可見範圍，不讓下緣跑出畫面
    if (_lhMenu.classList.contains('show')) lhPlaceMenu(_lhMenu, parseFloat(_lhMenu.style.left), parseFloat(_lhMenu.style.top));
}

// x、y：選單左上角想放的位置（滑鼠＝指標；觸控與鍵盤＝名稱鈕下方）
function lhSecOpenMenu(secEl, x, y, byKeyboard, drop) {
    const m = lhSecMenuBuild();
    if (typeof lhMapCloseAll === 'function') lhMapCloseAll();   // 同時只開一個浮層
    closeExportMenu();
    closeSongListOverlay();
    _lhMenuId = secEl.dataset.id;
    _lhMenuDrop = !!drop;
    // m.querySelector('.section-col-block').hidden = _lhMenuDrop;   // 入口關掉了
    lhSecMenuSync();
    lhPlaceMenu(m, x, y);
    // 鍵盤打開才把焦點放到目前類型那一列；滑鼠、觸控不搶焦點（手機鍵盤不要彈出來）
    if (byKeyboard) m.querySelector('.type-row[aria-checked="true"]')?.focus({ preventScroll: true });
    return m;
}

// commitName：使用者點選單外面時，輸入框裡還沒送出的名字先存起來（重畫造成的關閉不存）
function lhSecCloseMenu(commitName) {
    if (!_lhMenu || !_lhMenuId) return;
    const name = _lhMenu.querySelector('.section-name-input');
    if (commitName && document.activeElement === name) lhSecMenuName(name.value);
    const el = lhSecEl(_lhMenuId), s = _lhMenuSec();
    _lhMenu.classList.remove('show');
    _lhMenuId = null;
    if (el && s) lhSecApplyColor(el, s.color);   // 選色盤預覽沒按確定就關：畫面回到模型的顏色
}

// 打開選單：滑鼠在指標位置；觸控與鍵盤在名稱鈕下方
function _lhMenuUnder(btn, byKeyboard, drop) {
    const r = btn.getBoundingClientRect();
    const m = lhSecOpenMenu(btn.closest('.lyrics-section'), r.left, r.bottom + 4, byKeyboard, drop);
    // 下面放不下被擠上去蓋住按鈕時，翻到按鈕上方（跟匯出選單一樣）；上下都放不下就維持夾進畫面
    const b = m.getBoundingClientRect();
    if (b.top < r.bottom && r.top - b.height - 4 >= 4) lhPlaceMenu(m, r.left, r.top - b.height - 4);
}

// 右鍵（桌機）：在指標位置開。觸控長按時 Android 也會送 contextmenu：交給長按計時器開，這裡只擋掉瀏覽器自己的選單
document.getElementById('lyricsSections').addEventListener('contextmenu', e => {
    const btn = e.target.closest && e.target.closest('.section-type');
    if (!btn) return;
    e.preventDefault();
    if (_lhPress) return;
    if (e.clientX === 0 && e.clientY === 0) _lhMenuUnder(btn, true);   // 鍵盤送來的 contextmenu 沒有座標
    else lhSecOpenMenu(btn.closest('.lyrics-section'), e.clientX, e.clientY, false);
});

// 鍵盤：ContextMenu 鍵或 Shift+F10（Mac 的 Chrome 不會自己送 contextmenu，所以自己接）
document.getElementById('lyricsSections').addEventListener('keydown', e => {
    const btn = e.target.closest && e.target.closest('.section-type');
    if (!btn || e.isComposing || e.keyCode === 229) return;
    if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
        e.preventDefault();
        _lhMenuUnder(btn, true);
    }
});

// 觸控長按（D-15）：按住 500 毫秒、移動不超過 10px 才算；按住時名稱鈕變深，開完選單後放開的那一下 click 要吞掉
const LH_LONGPRESS_MS = 500, LH_LONGPRESS_SLOP = 10;
let _lhPress = null;      // 按住中：{ btn, pointerId, x, y, timer }
let _lhSwallow = false;   // 長按開了選單：下一個名稱鈕的 click 不換類型

function lhSecPressEnd() {
    const p = _lhPress;
    if (!p) return;
    clearTimeout(p.timer);
    p.btn.classList.remove('is-pressing');
    _lhPress = null;
}
document.getElementById('lyricsSections').addEventListener('pointerdown', e => {
    const btn = e.target.closest && e.target.closest('.section-type');
    if (!btn || e.pointerType === 'mouse' || !e.isPrimary) return;
    lhSecPressEnd();
    _lhSwallow = false;
    btn.classList.add('is-pressing');
    _lhPress = {
        btn, pointerId: e.pointerId, x: e.clientX, y: e.clientY,
        timer: setTimeout(() => {
            if (typeof navigator.vibrate === 'function') navigator.vibrate(10);
            _lhSwallow = true;
            _lhMenuUnder(btn, false);
        }, LH_LONGPRESS_MS),
    };
});
document.addEventListener('pointermove', e => {
    const p = _lhPress;
    if (p && e.pointerId === p.pointerId && Math.hypot(e.clientX - p.x, e.clientY - p.y) > LH_LONGPRESS_SLOP) lhSecPressEnd();
});
for (const type of ['pointerup', 'pointercancel']) {
    document.addEventListener(type, e => {
        if (!_lhPress || e.pointerId !== _lhPress.pointerId) return;
        lhSecPressEnd();
        // click 緊接在 pointerup 後面；沒等到（手指移走）就別留著吞下一次真的點擊
        if (_lhSwallow) setTimeout(() => { _lhSwallow = false; }, 400);
    }, true);
}
document.addEventListener('click', e => {
    if (!_lhSwallow || !(e.target.closest && e.target.closest('.section-type'))) return;
    _lhSwallow = false;
    e.preventDefault();
    e.stopPropagation();
}, true);

// 點選單外面關掉；Esc 關掉並把焦點還給名稱鈕（capture：≤ 900 的 sheet 才不會同時被收起）
document.addEventListener('pointerdown', e => {
    if (_lhMenuId && !(e.target.closest && e.target.closest('#sectionMenu'))) {
        _lhMenuClosedBy = e.target.closest && e.target.closest('.section-type') && lhSecEl(_lhMenuId)?.contains(e.target) ? _lhMenuId : null;
        lhSecCloseMenu(true);
    }
}, true);
document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !_lhMenuId || e.isComposing || e.keyCode === 229) return;
    if (e.target.classList && e.target.classList.contains('section-name-input')) return;   // 輸入框自己處理：只還原文字
    const id = _lhMenuId;
    e.preventDefault();
    e.stopPropagation();
    lhSecCloseMenu();
    lhSecEl(id)?.querySelector('.section-type')?.focus({ preventScroll: true });
}, true);

// 螢幕鍵盤出現／收起，可見範圍跟著變：選單重新夾進可見範圍，正在打字的欄位捲到看得到
// 等兩個 frame：js/layout.js 要先在自己的 rAF 更新 --app-h（選單的 max-height 看它）
let _lhMenuRaf = 0;
function _lhMenuReclamp() {
    if (!_lhMenuId || _lhMenuRaf) return;
    _lhMenuRaf = requestAnimationFrame(() => requestAnimationFrame(() => {
        _lhMenuRaf = 0;
        if (!_lhMenuId) return;
        lhPlaceMenu(_lhMenu, parseFloat(_lhMenu.style.left) || 0, parseFloat(_lhMenu.style.top) || 0);
        const ae = document.activeElement;
        if (ae && _lhMenu.contains(ae)) ae.scrollIntoView({ block: 'nearest' });
    }));
}
window.addEventListener('resize', _lhMenuReclamp);
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', _lhMenuReclamp);
    window.visualViewport.addEventListener('scroll', _lhMenuReclamp);
}

// ===== 選取文字移到別的段落（quick 261113-j3a）=====
// 桌機：文字框選字後右鍵 → 「移到段落 ▸」→ 子選單列出所有段落。觸控：選字浮動列的同名按鈕（js/rhyme-map.js）直接開子選單。
// 整個移動是一個 lhSecApply 步驟，Cmd+Z 一步還原。
let _lhMoveSel = null;    // 選取快照 { secId, a, b, text }；null＝選單關著
let _lhMoveRoot = null;   // #moveSelMenu（第一次打開才建）
let _lhMoveSub = null;    // #moveSelSub

// toId 有值＝接在該段最後；null＝在原段落後面建新段落
function lhSecMoveText(srcId, a, b, text, toId) {
    let dstId = toId;
    const step = lhSecApply('moveText', song => {
        const i = song.sections.findIndex(s => s.id === srcId);
        if (i < 0 || toId === srcId) return false;
        const src = song.sections[i];
        if (src.text.slice(a, b) !== text) return false;   // 快照過期：不動任何字，免得剪錯（T-q-01）
        const moved = text.replace(/^\n+|\n+$/g, '');
        if (!moved) return false;
        let dst;
        if (toId === null) {   // 新段落：建在原段落正後方，類型用 lhNextSecType 猜
            dst = makeEmptySection(lhNextSecType(src.type));
            dstId = dst.id;
            song.sections.splice(i + 1, 0, dst);
        } else dst = song.sections.find(s => s.id === toId);
        if (!dst) return false;
        // ponytail: 搬走的字在新段落沒有角色標記（來源段落的標記照常平移）；要帶著走再補
        const cut = src.text.slice(0, a) + src.text.slice(b);
        if (src.marks) lhSecSetMarks(src, lhMarksShift(src.marks, src.text, cut, a));
        src.text = cut;
        dst.text = dst.text === '' ? moved : dst.text + (dst.text.endsWith('\n') ? '' : '\n') + moved;
    }, { dom: 'render' });
    if (!step) return false;
    lhSecFlash(dstId);
    const el = lhSecEl(dstId);
    if (el) if (!(typeof lhCanvasReveal === 'function' && lhCanvasReveal(el))) el.scrollIntoView({ block: 'nearest' });
    // 重畫後焦點會掉到 body，Cmd+Z 要在文字框裡才有效；觸控不聚焦（鍵盤不要彈出來）
    const ta = el && el.querySelector('.section-textarea');
    if (ta && matchMedia(_LH_FINE).matches) {
        ta.focus({ preventScroll: true });
        ta.setSelectionRange(ta.value.length, ta.value.length);
    }
    const dstSec = curSong().sections.find(s => s.id === dstId);
    lhAnnounce('已移到「' + (dstSec ? dstSec.label : '') + '」');
    return true;
}

function _lhMoveBuild() {
    if (_lhMoveRoot) return;
    const mk = (id, label) => {
        const m = _lhMk('div', 'word-ctx-menu section-menu move-sel-menu');
        m.id = id;
        m.setAttribute('role', 'menu');
        m.setAttribute('aria-label', label);
        // 不搶文字框的焦點與選取（手機鍵盤也才不會收）
        for (const t of ['pointerdown', 'mousedown']) m.addEventListener(t, e => e.preventDefault());
        document.body.appendChild(m);
        return m;
    };
    _lhMoveRoot = mk('moveSelMenu', '選取的文字');
    _lhMoveSub = mk('moveSelSub', '移到段落');
    const btn = _lhMkBtn('section-menu-btn move-sel-item', '移到段落 ▸');
    btn.setAttribute('role', 'menuitem');
    btn.setAttribute('aria-haspopup', 'menu');
    btn.setAttribute('aria-controls', 'moveSelSub');
    btn.setAttribute('aria-expanded', 'false');
    _lhMoveRoot.appendChild(btn);
    btn.addEventListener('pointerenter', e => {
        if (e.pointerType === 'mouse') _lhMoveOpenSubFromRoot(false);
    });
    btn.addEventListener('click', e => _lhMoveOpenSubFromRoot(e.detail === 0));
    _lhMoveSub.addEventListener('click', e => {
        const b = e.target.closest && e.target.closest('.move-sel-to, .move-sel-new');
        if (!b || b.getAttribute('aria-disabled') === 'true' || !_lhMoveSel) return;
        const s = _lhMoveSel;
        lhMoveSelClose();
        lhSecMoveText(s.secId, s.a, s.b, s.text, b.dataset.id || null);
    });
    // 方向鍵：上下在看得到的項目間移動（頭尾相接，灰掉的也可聚焦）；右鍵開子選單、左鍵收回
    for (const m of [_lhMoveRoot, _lhMoveSub]) m.addEventListener('keydown', e => {
        const items = [...m.querySelectorAll('button')].filter(x => x.offsetParent !== null), i = items.indexOf(document.activeElement);
        if (i < 0) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus({ preventScroll: true });
        } else if (e.key === 'ArrowRight' && m === _lhMoveRoot) {
            e.preventDefault();
            _lhMoveOpenSubFromRoot(true);
        } else if (e.key === 'ArrowLeft' && m === _lhMoveSub && _lhMoveRoot.classList.contains('show')) {
            e.preventDefault();
            m.classList.remove('show');
            _lhMoveRoot.firstChild.setAttribute('aria-expanded', 'false');
            _lhMoveRoot.firstChild.focus({ preventScroll: true });
        }
    });
}

// 每次打開子選單重填：段落名稱是使用者輸入，只走 textContent（T-q-02）
function _lhMoveFillSub() {
    const kids = [_lhMk('span', 'section-menu-cap', '移到段落')];
    for (const s of curSong().sections) {
        const cur = s.id === _lhMoveSel.secId;
        const b = _lhMkBtn('section-menu-btn move-sel-to', cutName(s.label, 16) + (cur ? '（目前）' : ''));
        b.setAttribute('role', 'menuitem');
        b.dataset.id = s.id;
        if (cur) b.setAttribute('aria-disabled', 'true');
        kids.push(b);
    }
    const nb = _lhMkBtn('section-menu-btn move-sel-new', '＋ 新段落');
    nb.setAttribute('role', 'menuitem');
    kids.push(nb);
    _lhMoveSub.replaceChildren(...kids);
}

function lhMoveSelOpen(snap, x, y, byKeyboard) {
    _lhMoveBuild();
    if (typeof lhMapCloseAll === 'function') lhMapCloseAll();   // 同時只開一個浮層
    lhSecCloseMenu();
    closeExportMenu();
    closeSongListOverlay();
    _lhMoveSub.classList.remove('show');
    _lhMoveRoot.firstChild.setAttribute('aria-expanded', 'false');
    _lhMoveSel = snap;
    lhPlaceMenu(_lhMoveRoot, x, y);
    if (byKeyboard) _lhMoveRoot.firstChild.focus({ preventScroll: true });
}

// 從根選單的按鈕開子選單：貼在根選單右邊；右邊放不下（被夾回來）就放左邊
function _lhMoveOpenSubFromRoot(byKeyboard) {
    if (!_lhMoveSel) return;
    const rr = _lhMoveRoot.getBoundingClientRect(), br = _lhMoveRoot.firstChild.getBoundingClientRect();
    lhMoveSelOpenSub(null, rr.right, br.top - 4, byKeyboard);
    const sr = _lhMoveSub.getBoundingClientRect();
    if (sr.left < rr.right && rr.left - sr.width - 2 >= 4) lhPlaceMenu(_lhMoveSub, rr.left - sr.width - 2, br.top - 4);
}

// snap 有給＝觸控路徑直接開（沒有根選單）；anchorRect：被擠上來蓋住它時翻到它上方
function lhMoveSelOpenSub(snap, x, y, byKeyboard, anchorRect) {
    _lhMoveBuild();
    if (snap) {
        if (typeof lhMapCloseAll === 'function') lhMapCloseAll();
        lhSecCloseMenu();
        closeExportMenu();
        closeSongListOverlay();
        _lhMoveRoot.classList.remove('show');
        _lhMoveSel = snap;
    }
    if (!_lhMoveSel) return;
    _lhMoveFillSub();
    lhPlaceMenu(_lhMoveSub, x, y);
    if (anchorRect) {
        const b = _lhMoveSub.getBoundingClientRect();
        if (b.top < anchorRect.bottom && anchorRect.top - b.height - 4 >= 4) lhPlaceMenu(_lhMoveSub, x, anchorRect.top - b.height - 4);
    }
    _lhMoveRoot.firstChild.setAttribute('aria-expanded', 'true');
    if (byKeyboard) _lhMoveSub.querySelector('.move-sel-to:not([aria-disabled="true"])')?.focus({ preventScroll: true });
}

function lhMoveSelClose(refocus) {
    if (!_lhMoveRoot) return;
    const id = _lhMoveSel && _lhMoveSel.secId;
    const inside = _lhMoveRoot.contains(document.activeElement) || _lhMoveSub.contains(document.activeElement);
    for (const m of [_lhMoveRoot, _lhMoveSub]) m.classList.remove('show');
    _lhMoveRoot.firstChild.setAttribute('aria-expanded', 'false');
    _lhMoveSel = null;
    if (refocus && inside) lhSecEl(id)?.querySelector('.section-textarea')?.focus({ preventScroll: true });
}

// 文字框右鍵：有選取（不是只選到空白）、非組字、非觸控長按才攔；其餘維持瀏覽器原生選單
document.getElementById('lyricsSections').addEventListener('contextmenu', e => {
    const ta = e.target;
    if (!ta.classList || !ta.classList.contains('section-textarea')) return;
    if (e.pointerType === 'touch' || e.pointerType === 'pen' || _lhComposing || document.activeElement !== ta) return;
    const a = ta.selectionStart, b = ta.selectionEnd, text = ta.value.slice(a, b);
    if (a === b || !text.trim()) return;
    e.preventDefault();
    const snap = { secId: ta.closest('.lyrics-section').dataset.id, a, b, text };
    if (e.clientX === 0 && e.clientY === 0) {   // 鍵盤送來的 contextmenu 沒有座標
        const r = ta.getBoundingClientRect();
        lhMoveSelOpen(snap, r.left, r.top + 8, true);
    } else lhMoveSelOpen(snap, e.clientX, e.clientY, false);
});

// 點外面收起（不攔這一下）；Esc 收起並把焦點還給文字框（capture：≤ 900 的 sheet 才不會一起收）
document.addEventListener('pointerdown', e => {
    if (_lhMoveSel && !(e.target.closest && e.target.closest('#moveSelMenu, #moveSelSub'))) lhMoveSelClose();
}, true);
document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || e.isComposing || e.keyCode === 229 || !_lhMoveSel) return;
    e.preventDefault();
    e.stopPropagation();
    lhMoveSelClose(true);
}, true);
