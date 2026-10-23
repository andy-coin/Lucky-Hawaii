// ==================== 詞卡／字卡拖進歌詞（第 9 階段，AI-06） ====================
// 滑鼠按住詞卡（.ai-word-card）或字卡（.char-card）移動超過 5px 就開始拖；放開在段落輸入框上，就把那個詞原樣插在指標下的字與字之間。
// 單純點一下維持原本的意思（存進保留池／選取字卡），不插入任何字。
// 拖曳中只畫覆蓋層（殘影、插入線、輸入框外框），放開才寫一次模型（lhSecApply），所以取消不會留下痕跡。
// 詞一律用 textContent 與 .value 進畫面，不經過 HTML 解析。這支檔案最後載入，lhSec* 與 curSong 都已存在。

const LH_WD_MOUSE_PX = 5;        // 滑鼠移動超過這麼多 px 才算拖
const LH_WD_TOUCH_PX = 10;       // 觸控：長按期間移動超過這麼多 px 就是捲動，不拖
const LH_WD_HOLD_MS = 400;       // 觸控：按住這麼久不動才開始拖
const LH_WD_DWELL_MS = 600;      // 停在收合段落的標題列上這麼久就展開（F8）
const LH_WD_BIG = 200000;        // 超過這麼多字的段落不即時算游標，放開才算一次（鏡像排版太貴）

let _lhWd = null;                // 進行中的手勢：{ card, word, pointerId, touch, sx, sy, x, y, state, ghost, caretEl, ta, mirror, raf }
let _lhWdSwallow = false;        // 拖曳之後的那一次 click 要吞掉
let _lhWdSwallowTimer = 0;
let _lhWdTouchEnd = -Infinity;   // 上一次觸控手勢結束的時間：之後 600ms 內擋 contextmenu

// ===== 鏡像 div：算 textarea 裡「指標下的字」的索引（RESEARCH Pattern 8，用真實點擊的 selectionStart 驗證過） =====
const _LH_MIRROR_COPY = ['boxSizing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle',
    'letterSpacing', 'lineHeight', 'textTransform', 'textIndent', 'wordSpacing', 'tabSize', 'overflowWrap', 'wordBreak', 'textAlign'];

// 建一個藏起來、排版和 textarea 一樣的 div（樣式全是從計算後樣式複製的數值，不含使用者文字）
function lhMirror(ta) {
    const cs = getComputedStyle(ta), m = document.createElement('div');
    for (const p of _LH_MIRROR_COPY) m.style[p] = cs[p];
    m.style.cssText += ';position:absolute;left:-9999px;top:0;visibility:hidden;white-space:pre-wrap;overflow:hidden;height:auto;border-width:0';
    m.style.boxSizing = 'content-box';
    // clientWidth 不含捲軸；寬度算錯整個換行位置都會錯
    m.style.width = (ta.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) + 'px';
    m.append(document.createTextNode(ta.value + '​'));   // 結尾加零寬字元：最後一行行尾也量得到
    document.body.appendChild(m);
    return m;
}

// 行高（px）：計算後樣式是 normal 時用字級的 1.5 倍估
function _lhLineH(cs) {
    const lh = parseFloat(cs.lineHeight);
    return lh > 0 ? lh : (parseFloat(cs.fontSize) || 16) * 1.5;
}

// 第 i 個字的矩形（換行時取最後一塊）
function _lhCharRect(node, i) {
    const r = document.createRange();
    r.setStart(node, i);
    r.setEnd(node, i + 1);
    const rs = r.getClientRects();
    return rs.length ? rs[rs.length - 1] : r.getBoundingClientRect();
}

// 螢幕座標 (clientX, clientY) 對到的插入索引（字與字之間）。mirror 可傳入快取的鏡像；沒傳就自己建、用完拆掉
function lhCaretIndexAt(ta, clientX, clientY, mirror) {
    const rect = ta.getBoundingClientRect(), cs = getComputedStyle(ta);
    const m = mirror || lhMirror(ta), node = m.firstChild, n = ta.value.length, mr = m.getBoundingClientRect();
    const px = mr.left + (clientX - rect.left - parseFloat(cs.borderLeftWidth) + ta.scrollLeft);
    const py = mr.top + (clientY - rect.top - parseFloat(cs.borderTopWidth) + ta.scrollTop);
    // 0) 指標在最後一行的下面（內容之外）：和真實點擊一樣放在全文最後
    const end = _lhCharRect(node, n);
    if (py > end.top + end.height / 2 + _lhLineH(cs) / 2) {
        if (!mirror) m.remove();
        return n;
    }
    // 1) 找第一個「字形頂端在指標下方」的索引，指標所在的行就是它前一個字所在的行
    //    （不用 rect.bottom：CJK 字形矩形比行高矮，行與行的縫會落到下一行）
    let lo = 0, hi = n;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (_lhCharRect(node, mid).top > py) hi = mid; else lo = mid + 1;
    }
    const first0 = Math.max(0, lo - 1), lineTop = _lhCharRect(node, first0).top;
    let a = 0, b = first0;
    while (a < b) {   // 該視覺行的第一個字
        const mid = (a + b) >> 1;
        if (Math.abs(_lhCharRect(node, mid).top - lineTop) <= 2) b = mid; else a = mid + 1;
    }
    // 2) 沿該行找最近的邊界；換行字元一定在行尾，落在它前面
    let i = a;
    for (; i < n; i++) {
        const r = _lhCharRect(node, i);
        if (Math.abs(r.top - lineTop) > 2) break;
        if (ta.value[i] === '\n' || px < r.left + r.width / 2) break;
    }
    if (!mirror) m.remove();
    // 不切開代理對（罕用字）：落在一對中間就退回前面
    if (i > 0 && i < n) {
        const c1 = ta.value.charCodeAt(i - 1), c2 = ta.value.charCodeAt(i);
        if (c1 >= 0xD800 && c1 <= 0xDBFF && c2 >= 0xDC00 && c2 <= 0xDFFF) i--;
    }
    return i;
}

// 索引 i 的插入線位置（螢幕座標）：{ left, top, height }；左緣取第 i 個字的左邊
function lhCaretRect(ta, mirror, i) {
    const rect = ta.getBoundingClientRect(), cs = getComputedStyle(ta);
    const mr = mirror.getBoundingClientRect();
    const r = _lhCharRect(mirror.firstChild, Math.min(i, ta.value.length));
    const lh = _lhLineH(cs);
    return {
        left: rect.left + parseFloat(cs.borderLeftWidth) + (r.left - mr.left) - ta.scrollLeft,
        top: rect.top + parseFloat(cs.borderTopWidth) + (r.top - mr.top) + r.height / 2 - lh / 2 - ta.scrollTop,
        height: lh,
    };
}

// ===== 手勢 =====

// 指標下最上面的元素若是段落輸入框就回傳它（殘影與插入線都是 pointer-events:none，不會擋）
function _lhWdTextareaAt(x, y) {
    const top = document.elementsFromPoint(x, y)[0];
    return top && top.classList && top.classList.contains('section-textarea') ? top : null;
}

// 拖曳結束後的那一次 click 要吞掉（saveWord／選取字卡不該被誤觸）。
// timed：手指／滑鼠已經放開，0.4 秒後解除；否則（Esc 取消時滑鼠還按著）等放開後再開始倒數。下一次按下一定解除
function _lhWdArmSwallow(timed) {
    _lhWdSwallow = true;
    clearTimeout(_lhWdSwallowTimer);
    if (timed) _lhWdSwallowTimer = setTimeout(() => { _lhWdSwallow = false; }, 400);
}
document.addEventListener('pointerup', () => {
    if (!_lhWdSwallow) return;
    clearTimeout(_lhWdSwallowTimer);
    _lhWdSwallowTimer = setTimeout(() => { _lhWdSwallow = false; }, 400);
}, true);
document.addEventListener('click', e => {
    if (!_lhWdSwallow) return;
    _lhWdSwallow = false;
    e.stopPropagation();
    e.preventDefault();
}, true);

// 離開目前的輸入框：拿掉外框、插入線、鏡像
function _lhWdLeaveTa(d) {
    if (d.ta) d.ta.classList.remove('drop-target');
    if (d.mirror) d.mirror.el.remove();
    if (d.caretEl) d.caretEl.style.display = 'none';
    d.ta = null;
    d.mirror = null;
}

// 這個輸入框的鏡像：內容或寬度變了才重建
function _lhWdMirrorFor(d, ta) {
    if (d.mirror && d.mirror.value === ta.value && d.mirror.width === ta.clientWidth) return d.mirror.el;
    if (d.mirror) d.mirror.el.remove();
    d.mirror = { el: lhMirror(ta), value: ta.value, width: ta.clientWidth };
    return d.mirror.el;
}

// 指標停在收合段落的標題列上：加 dwell（淡底），600ms 後展開；離開就取消。自己展開的記在 d.expanded，結束時收回去
function _lhWdDwell(d) {
    const hit = document.elementsFromPoint(d.x, d.y)[0];
    const hdr = hit && hit.closest ? hit.closest('.lyrics-section-header') : null;
    const secEl = hdr && hdr.closest('.lyrics-section');
    const target = secEl && secEl.classList.contains('collapsed') ? secEl : null;
    if (target === d.dwellEl) return;
    clearTimeout(d.dwellTimer);
    if (d.dwellEl) d.dwellEl.classList.remove('dwell');
    d.dwellEl = target;
    if (!target) return;
    target.classList.add('dwell');
    d.dwellTimer = setTimeout(() => {
        if (_lhWd !== d || d.dwellEl !== target) return;
        target.classList.remove('dwell');
        d.dwellEl = null;
        const song = curSong();
        const idx = song ? song.sections.findIndex(x => x.id === target.dataset.id) : -1;
        if (idx < 0 || !song.sections[idx].collapsed) return;
        toggleLyricsSection(idx);
        d.expanded.add(target.dataset.id);
    }, LH_WD_DWELL_MS);
}

// 每個 pointermove 排一個 rAF：殘影位置、找輸入框、算游標、畫插入線
function _lhWdTick() {
    const d = _lhWd;
    if (!d || d.state !== 'dragging') return;
    d.raf = 0;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const h = d.ghost.offsetHeight;
    // 滑鼠：殘影在指標左上 0.75rem；手指：置中在手指上方 3rem（不被手指擋住）
    const gx = d.touch ? Math.max(0, d.x - d.ghost.offsetWidth / 2) : Math.max(0, d.x - 0.75 * rem);
    const gy = Math.max(0, d.y - (d.touch ? 3 : 0.75) * rem - h);
    d.ghost.style.transform = 'translate(' + gx + 'px, ' + gy + 'px)';
    // 靠邊自動捲（同段落排序：3rem 範圍、越靠邊越快；滑鼠要在歌詞面板的左右範圍內才捲）
    d.scroller = d.scroller || lhSecScroller();
    const r = d.scroller.getBoundingClientRect();
    const zone = 3 * rem;
    if (d.x >= r.left && d.x <= r.right && (d.y < r.top + zone || d.y > r.bottom - zone)) {
        const up = d.y < r.top + zone;
        const depth = Math.min(1, Math.max(0, (zone - (up ? d.y - r.top : r.bottom - d.y)) / zone));
        d.scroller.scrollTop += (up ? -1 : 1) * (0.25 + 0.5 * depth) * rem;
        d.raf = requestAnimationFrame(_lhWdTick);   // 靠邊時持續排下一幀（指標不動也要繼續捲）
    }
    _lhWdDwell(d);
    const ta = _lhWdTextareaAt(d.x, d.y);
    if (ta !== d.ta) {
        _lhWdLeaveTa(d);
        if (ta) { d.ta = ta; ta.classList.add('drop-target'); }
    }
    if (!ta || ta.value.length > LH_WD_BIG) {
        if (d.caretEl) d.caretEl.style.display = 'none';
        return;
    }
    const mirror = _lhWdMirrorFor(d, ta);
    const i = lhCaretIndexAt(ta, d.x, d.y, mirror);
    const c = lhCaretRect(ta, mirror, i);
    const tb = ta.getBoundingClientRect();
    if (!d.caretEl) {
        d.caretEl = document.createElement('div');
        d.caretEl.className = 'drop-caret';
        document.body.appendChild(d.caretEl);
    }
    const out = c.top + c.height < tb.top || c.top > tb.bottom || c.left < tb.left || c.left > tb.right;   // 捲到輸入框外面了就不畫
    d.caretEl.style.display = out ? 'none' : '';
    d.caretEl.style.left = c.left + 'px';
    d.caretEl.style.top = c.top + 'px';
    d.caretEl.style.height = c.height + 'px';
}

// 開始拖：畫殘影，來源卡變半透明
function _lhWdBegin(d) {
    // 桌機版左面板收著＝放不進去：不啟動，提示先打開（RESEARCH Open Question 4）
    if (!lhIsSheetMode() && document.getElementById('leftPanel').classList.contains('collapsed')) {
        showToast('先打開歌詞面板，再把詞拖進去');
        _lhWdArmSwallow(false);
        _lhWdFinish(false);
        return;
    }
    // 手機 sheet 版型（F7）：歌詞 sheet 沒開就先切到歌詞，記下原本在哪個分頁，取消時切回去
    if (lhIsSheetMode() && document.getElementById('leftPanel').classList.contains('collapsed')) {
        d.origTab = document.getElementById('rightPanel').classList.contains('collapsed') ? 'search' : 'ai';
        mobileTab('lyrics');
    }
    lhSecDragEnd(false);     // 同時只有一種手勢：收掉段落拖曳、拉高度、設定視窗
    lhSecResizeEnd(false);
    lhSecCloseMenu();
    d.state = 'dragging';
    d.card.classList.add('word-drag-source');
    const ghost = document.createElement('div');
    ghost.className = 'word-drag-ghost';
    ghost.textContent = d.word;
    document.body.appendChild(ghost);
    d.ghost = ghost;
    document.body.classList.add('is-word-dragging');
    if (d.touch) {
        if (navigator.vibrate) navigator.vibrate(10);
        // 長按 400ms 時瀏覽器還沒開始捲：此刻起擋掉 touchmove，列表才不會在指頭下捲動（要明確寫 passive:false）
        document.addEventListener('touchmove', _lhWdBlock, { passive: false });
        const hint = document.createElement('div');
        hint.className = 'drag-hint';
        hint.setAttribute('role', 'status');
        hint.textContent = '拖到想放的位置，放開就插入；放在歌詞外面就取消';
        document.body.appendChild(hint);
        d.hint = hint;
    }
    document.addEventListener('keydown', _lhWdKey, true);
    d.raf = requestAnimationFrame(_lhWdTick);
}

function _lhWdBlock(e) {
    if (_lhWd && _lhWd.state === 'dragging' && e.cancelable) e.preventDefault();
}

// Esc 取消：capture 階段攔下並 preventDefault，≤ 900 的 sheet 才不會同時被收起（panels.js 看 defaultPrevented）；組字中不攔
function _lhWdKey(e) {
    if (e.key !== 'Escape' || e.isComposing || e.keyCode === 229) return;
    if (!_lhWd || _lhWd.state !== 'dragging') return;
    e.preventDefault();
    e.stopPropagation();
    lhWordDragCancel();
}

// 觸控長按會在約 500ms 送 contextmenu（Android），Phase 7 的回報選單會跟著彈出：手勢進行中與結束後 600ms 內一律擋掉。
// 滑鼠右鍵不在這裡（滑鼠手勢不設 touch 旗標、也不記結束時間），桌機回報選單照舊
window.addEventListener('contextmenu', e => {
    if ((_lhWd && _lhWd.touch) || performance.now() - _lhWdTouchEnd < 600) {
        e.preventDefault();
        e.stopImmediatePropagation();
    }
}, true);

// 收尾：不論放開、取消或被打斷，每條路徑都把監聽、殘影、插入線、外框、class 清乾淨
// released：手指／滑鼠已放開；keepId：這次放進了哪一段（那段自動展開的不收回；也代表成功，留在歌詞分頁）
function _lhWdFinish(released, keepId) {
    const d = _lhWd;
    if (!d) return;
    _lhWd = null;
    clearTimeout(d.timer);
    clearTimeout(d.dwellTimer);
    d.dwellEl?.classList.remove('dwell');
    if (d.touch) _lhWdTouchEnd = performance.now();
    if (d.state === 'dragging') _lhWdArmSwallow(released);
    cancelAnimationFrame(d.raf);
    document.removeEventListener('pointermove', _lhWdMove, true);
    document.removeEventListener('pointerup', _lhWdUp, true);
    document.removeEventListener('pointercancel', _lhWdAbort, true);
    document.removeEventListener('touchmove', _lhWdBlock, { passive: false });
    document.removeEventListener('keydown', _lhWdKey, true);
    _lhWdLeaveTa(d);
    d.ghost?.remove();
    d.hint?.remove();
    d.caretEl?.remove();
    d.card.classList.remove('word-drag-source');
    document.body.classList.remove('is-word-dragging');
    // 自己展開的段落收回去（收到字的那段除外）
    const song = curSong();
    for (const id of d.expanded) {
        const idx = song ? song.sections.findIndex(x => x.id === id) : -1;
        if (id !== keepId && idx >= 0 && !song.sections[idx].collapsed) toggleLyricsSection(idx);
    }
    // 沒插入就切回原本的分頁（只在 sheet 版型；再按同一個分頁會變成收起，所以只在目前不是那一頁時才切）
    if (keepId === undefined && d.origTab && lhIsSheetMode()) {
        const rp = document.getElementById('rightPanel');
        if (d.origTab === 'search' || rp.classList.contains('collapsed')) mobileTab(d.origTab);
    }
}

// 外面叫的取消：不插入任何東西
function lhWordDragCancel() {
    if (!_lhWd) return;
    _lhWdFinish(false);
}

function _lhWdAbort(e) {
    if (_lhWd && e.pointerId === _lhWd.pointerId) lhWordDragCancel();
}

function _lhWdMove(e) {
    const d = _lhWd;
    if (!d || e.pointerId !== d.pointerId) return;
    d.x = e.clientX;
    d.y = e.clientY;
    if (d.state === 'pending') {
        const moved = Math.hypot(d.x - d.sx, d.y - d.sy);
        if (d.touch) {   // 長按前就移動＝在捲動：放棄，不攔瀏覽器
            if (moved > LH_WD_TOUCH_PX) _lhWdFinish(false);
            return;
        }
        if (moved <= LH_WD_MOUSE_PX) return;
        _lhWdBegin(d);
        if (!_lhWd) return;
    }
    if (!d.raf) d.raf = requestAnimationFrame(_lhWdTick);
}

function _lhWdUp(e) {
    const d = _lhWd;
    if (!d || e.pointerId !== d.pointerId) return;
    d.x = e.clientX;
    d.y = e.clientY;
    if (d.state !== 'dragging') { _lhWdFinish(true); return; }   // 沒拖起來＝一次普通的點擊
    const ta = _lhWdTextareaAt(d.x, d.y);
    // 組字中放開不插入（組字文字還沒進模型，插了會被蓋掉）
    if (!ta || _lhComposing) { _lhWdFinish(true); return; }
    // 先算好索引再收尾（收尾會拆掉鏡像）；超長段落這裡才第一次算
    const i = ta.value.length > LH_WD_BIG
        ? lhCaretIndexAt(ta, d.x, d.y)
        : lhCaretIndexAt(ta, d.x, d.y, _lhWdMirrorFor(d, ta));
    const word = d.word, touch = d.touch;
    _lhWdFinish(true, ta.closest('.lyrics-section').dataset.id);
    _lhWdDrop(ta, i, word, touch);
}

// 放開在輸入框上：在索引 i 插入 word，存檔、一步復原、閃一下、更新字數、通知讀屏
function _lhWdDrop(ta, i, word, touch) {
    const secEl = ta.closest('.lyrics-section');
    if (!secEl) return;
    const id = secEl.dataset.id, text = ta.value;
    const next = text.slice(0, i) + word + text.slice(i);
    const step = lhSecApply('insert', song => {
        const s = song.sections.find(x => x.id === id);
        if (!s) return false;
        s.text = next;
    }, { caret: { id, pos: i + word.length } });
    if (!step) return;
    ta.value = next;
    lhSecCountOne(secEl);
    lhSecFlash(id);
    const sec = curSong().sections.find(x => x.id === id);
    lhAnnounce('已插入「' + cutName(word, 16) + '」到' + (sec ? sec.label : '段落'));
    if (!touch) {   // 觸控不聚焦，鍵盤不會自己彈出來（D-13）
        ta.focus({ preventScroll: true });
        ta.setSelectionRange(i + word.length, i + word.length);
    }
}

// 按下詞卡／字卡：進入「待命」，移動超過門檻才算拖
document.addEventListener('pointerdown', e => {
    clearTimeout(_lhWdSwallowTimer);
    _lhWdSwallow = false;
    if (_lhWd || !e.isPrimary) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;   // 右鍵留給 Phase 7 的回報選單
    const t = e.target;
    if (!t || !t.closest) return;
    const card = t.closest('.ai-word-card, .char-card');
    if (!card || t.closest('.mark-badge, .poly-chip')) return;
    if (card.closest('#aiWordsContainer.report-mode')) return;   // 回報模式：點詞是選取，不拖
    const word = card.classList.contains('ai-word-card') ? card.dataset.word : card.dataset.char;
    if (!word) return;
    _lhWd = {
        card, word, pointerId: e.pointerId, touch: e.pointerType !== 'mouse',
        sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, state: 'pending',
        ghost: null, hint: null, caretEl: null, ta: null, mirror: null, raf: 0, timer: 0,
        scroller: null, dwellEl: null, dwellTimer: 0, expanded: new Set(), origTab: null,
    };
    if (_lhWd.touch) {
        const d = _lhWd;
        d.timer = setTimeout(() => { if (_lhWd === d && d.state === 'pending') _lhWdBegin(d); }, LH_WD_HOLD_MS);
    }
    document.addEventListener('pointermove', _lhWdMove, true);
    document.addEventListener('pointerup', _lhWdUp, true);
    document.addEventListener('pointercancel', _lhWdAbort, true);
}, true);
