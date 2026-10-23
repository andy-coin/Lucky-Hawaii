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
    lhHistEnsure(song);   // 改之前先確認歷史的「現在」是改之前的樣子
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
    if (ok) lhSecEl(id)?.scrollIntoView({ block: 'nearest' });
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
    // 殘影：水平夾在面板內，觸控時放在手指上方（不被手指擋住）
    const pr = document.getElementById('leftPanel').getBoundingClientRect();
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
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const secEl = handle.closest('.lyrics-section');
    if (!secEl) return;
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
}

// 只重算一段（打字、組字確認之後）：從模型讀文字，絕不碰 textarea
function lhSecCountOne(secEl) {
    const song = curSong();
    const s = song && secEl && song.sections.find(x => x.id === secEl.dataset.id);
    if (!s) return;
    const n = lhCountWords(s.text);
    _lhSecCounts.set(s.id, n);
    const node = secEl.querySelector('.section-count')?.firstChild;
    if (node) node.data = n + ' 字';
    _lhSecShowTotal();
}

// 事件用：只有段落輸入框才算（情境欄位不算字數）
function lhSecCountFrom(target) {
    if (target && target.classList && target.classList.contains('section-textarea')) lhSecCountOne(target.closest('.lyrics-section'));
}

// 標題列：型別按鈕換下一種、− 刪除、其餘空白處收合／展開
document.getElementById('lyricsSections').addEventListener('click', e => {
    const secEl = e.target.closest('.lyrics-section');
    if (!secEl) return;
    if (e.target.closest('.section-type')) {
        lhSecApply('type', song => {
            const s = song.sections.find(x => x.id === secEl.dataset.id);
            if (!s) return false;
            s.type = LH_SEC_TYPES[(LH_SEC_TYPES.indexOf(s.type) + 1) % LH_SEC_TYPES.length];
        });
    } else if (e.target.closest('.section-remove')) {
        lhSecRemove(secEl.dataset.id);
    } else if (e.target.closest('.lyrics-section-header') && !e.target.closest('.section-handle, .section-count')) {
        toggleLyricsSection(Number(secEl.dataset.index));
    }
});
