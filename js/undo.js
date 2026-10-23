// ==================== 復原／重做（第 9 階段，EDIT-03） ====================
// 應用層快照堆疊：每首歌一條，只存在記憶體（重新整理就清空，不寫任何儲存）。
// 打字：同一段連續輸入、中間停頓不超過 1 秒算一步；組字（注音）確認一個詞算一步，組字中不記。
// 結構動作（新增、換類型……）都走 js/sections.js 的 lhSecApply，在那裡各記一步。
// 高度與收合不進歷史：還原時每個還在的段落保留「現在」的高度與收合。

const LH_UNDO_MAX = 100;        // 最多留 100 步，第 101 步擠掉最舊的
const LH_TYPING_GAP = 1000;     // 打字停頓超過這麼久（毫秒）就另起一步
const _hists = new Map();       // 歌 id → { ref, past, future, present, caret, run }

// 快照：段落的淺拷貝（text／label 是不可變字串，100 步幾乎不吃記憶體）
const _snap = song => song.sections.map(s => ({ ...s }));
// 內容簽名：id／類型／自訂名／顏色／文字，不含高度與收合
const _sig = sections => JSON.stringify(sections.map(s => [s.id, s.type, s.custom, s.color, s.text]));

// 取得（或建立）這首歌的歷史。verify：畫面重畫時順便檢查，模型在歷史之外被改過（例如還沒接上歷史的刪除、拖曳）就重新起算
function lhHistEnsure(song, verify) {
    let h = _hists.get(song.id);
    if (h && h.ref === song && !verify) return h;
    // 同一首歌被重新載入成另一個物件：內容沒變就沿用（換歌再換回來、別頁只改了高度）；別的分頁改過內容就從頭開始（D7）
    if (h && _sig(song.sections) === _sig(h.present)) { h.ref = song; return h; }
    h = { ref: song, past: [], future: [], present: _snap(song), caret: null, run: null };
    _hists.set(song.id, h);
    return h;
}

// 結構步驟：動作「之後」呼叫；回傳剛放進歷史的那一步
function lhHistCommit(song, kind, caret) {
    const h = lhHistEnsure(song);
    h.run = null;   // 結構動作打斷連打合併
    hideUndoToastAction();   // 有更新的一步，刪除提示上的「復原」不能再按
    const step = { snap: h.present, kind, caret: h.caret };
    h.past.push(step);
    if (h.past.length > LH_UNDO_MAX) h.past.shift();
    h.present = _snap(song);
    h.future.length = 0;
    h.caret = caret || null;
    lhHistSyncButtons();
    return step;
}

// 打字：模型寫完之後呼叫；連續、同一段、停頓不超過 LH_TYPING_GAP 合成一步
function lhHistTyping(song, secId, caret, now = Date.now()) {
    const h = lhHistEnsure(song);
    if (!h.run || h.run.secId !== secId || now - h.run.t > LH_TYPING_GAP) {
        hideUndoToastAction();
        h.past.push({ snap: h.present, kind: 'text', caret: h.caret });
        if (h.past.length > LH_UNDO_MAX) h.past.shift();
        h.future.length = 0;
        h.run = { secId, t: now };
    }
    h.run.t = now;
    h.present = _snap(song);
    h.caret = { id: secId, pos: caret };   // UTF-16 索引（selectionStart）
    lhHistSyncButtons();
}

function lhHistTop(song) {
    const h = song && _hists.get(song.id);
    return h && h.past.length ? h.past[h.past.length - 1] : null;
}

// ↶ ↷ 的可用狀態：用 aria-disabled（不用 disabled 屬性），按鈕有焦點時變灰也不會丟焦點
function lhHistSyncButtons() {
    const song = curSong();
    const h = song && _hists.get(song.id);
    for (const [id, n] of [['undoBtn', h ? h.past.length : 0], ['redoBtn', h ? h.future.length : 0]]) {
        const btn = document.getElementById(id);
        const v = n ? 'false' : 'true';
        if (btn && btn.getAttribute('aria-disabled') !== v) btn.setAttribute('aria-disabled', v);
    }
}

// 回到 step 的狀態；from／to 是要搬去的另一邊（redo 或 undo 的堆疊）
function _lhHistMove(from, to, msg, redo) {
    if (_lhComposing) return false;   // 組字中不動輸入框（寫 .value 會砍掉組字，旗標也會卡在 true）
    const song = curSong();
    const h = song && lhHistEnsure(song);
    hideUndoToastAction();
    if (!h || !from(h).length) return false;
    h.present = _snap(song);   // 高度與收合不進歷史：搬去另一邊的這一步要帶最新值
    h.run = null;
    const step = from(h).pop();
    to(h).push({ snap: h.present, kind: step.kind, caret: h.caret });
    const before = song.sections;
    const cur = new Map(before.map(s => [s.id, s]));
    // 還在的段落保留現在的收合與高度（D2）
    song.sections = step.snap.map(s => {
        const c = cur.get(s.id);
        return c ? { ...s, collapsed: c.collapsed, height: c.height } : { ...s };
    });
    lhSecFinalize(song.sections);
    markDirty(song.id);
    flushSongs();
    h.present = _snap(song);
    h.caret = step.caret;
    _lhHistShow(before, song.sections, redo ? h.caret : null);   // 復原的游標看這次的差異；記下的游標是上一步結束的位置，只有重做用得上
    lhHistSyncButtons();
    lhAnnounce(msg);
    return true;
}

// D6：只有一段文字不同 → 只換那個輸入框的內容（同一個節點）；否則整個重畫，捲動位置不變，第一個不同的段落閃一下
function _lhHistShow(before, after, caret) {
    const sameShape = before.length === after.length
        && after.every((s, i) => s.id === before[i].id && s.type === before[i].type && s.custom === before[i].custom && s.color === before[i].color);
    const diff = sameShape ? after.filter((s, i) => s.text !== before[i].text) : [];
    const el = diff.length === 1 && lhSecEl(diff[0].id);
    if (el) {
        const area = el.querySelector('.section-textarea');
        const s = diff[0];
        const old = before.find(x => x.id === s.id).text;
        let pos = 0;
        if (caret && caret.id === s.id) pos = Math.min(caret.pos, s.text.length);
        else {   // 沒記到游標（復原）：放在還原那一塊的尾端；被復原的是插入就是改動開始的地方（不切開代理對）
            let p = 0, q = 0;
            while (p < old.length && p < s.text.length && old[p] === s.text[p]) p++;
            while (q < old.length - p && q < s.text.length - p && old[old.length - 1 - q] === s.text[s.text.length - 1 - q]) q++;
            pos = s.text.length - q;
            if (pos && pos < s.text.length && /[\uD800-\uDBFF]/.test(s.text[pos - 1])) pos--;
        }
        area.value = s.text;
        area.setSelectionRange(pos, pos);
        lhSecCountOne(el);
        el.scrollIntoView({ block: 'nearest' });   // 不搬焦點（D-13）
        return;
    }
    const list = document.getElementById('lyricsSections');
    const top = list.scrollTop;
    const ae = document.activeElement;
    const focusId = ae && ae.classList.contains('section-textarea') ? ae.closest('.lyrics-section').dataset.id : null;
    renderLyricsSections();
    list.scrollTop = top;
    if (focusId) lhSecEl(focusId)?.querySelector('.section-textarea').focus({ preventScroll: true });
    const prev = new Map(before.map(s => [s.id, s]));
    const hit = after.find((s, i) => {
        const p = prev.get(s.id);
        return !p || before[i].id !== s.id || p.type !== s.type || p.custom !== s.custom || p.color !== s.color || p.text !== s.text;
    });
    if (hit) lhSecFlash(hit.id);
}

const lhHistUndo = () => _lhHistMove(h => h.past, h => h.future, '已復原', false);
const lhHistRedo = () => _lhHistMove(h => h.future, h => h.past, '已重做', true);

// 快捷鍵與瀏覽器自己的復原事件只在歌詞編輯區生效，組字中一律不攔；搜尋框、情境、標籤、歌名維持瀏覽器原生復原
const _LH_UNDO_SCOPE = '#lyricsSections, .lyrics-tools';   // 段落設定選單裡的自訂名稱框用原生復原，不動歌詞
const _lhInScope = t => !!(t && t.closest && t.closest(_LH_UNDO_SCOPE));

document.addEventListener('keydown', e => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey || e.isComposing || e.keyCode === 229 || !_lhInScope(e.target)) return;
    const k = e.key.toLowerCase();
    const redo = (k === 'z' && e.shiftKey) || (k === 'y' && e.ctrlKey);
    if (k !== 'z' && !redo) return;
    e.preventDefault();
    e.stopPropagation();
    redo ? lhHistRedo() : lhHistUndo();
}, true);

// 沒有 keydown 的路徑（Mac 選單「編輯 → 還原」、iOS 搖一搖）
// Chromium 的原生復原堆疊是整個頁面共用的：焦點在搜尋框按 Ctrl+Z，被復原的可能是之前在歌詞裡打的字（事件的 target 是那個輸入框）。
// 焦點不在編輯區卻要動歌詞的，直接取消，免得歌詞被別的欄位的快捷鍵改掉
document.addEventListener('beforeinput', e => {
    if ((e.inputType !== 'historyUndo' && e.inputType !== 'historyRedo') || e.isComposing || !_lhInScope(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    if (!_lhInScope(document.activeElement)) return;
    e.inputType === 'historyUndo' ? lhHistUndo() : lhHistRedo();
}, true);

(() => {
    const mac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
    const btns = [['undoBtn', lhHistUndo, mac ? '復原（⌘Z）' : '復原（Ctrl+Z）'],
        ['redoBtn', lhHistRedo, mac ? '重做（⇧⌘Z）' : '重做（Ctrl+Shift+Z 或 Ctrl+Y）']];
    for (const [id, fn, title] of btns) {
        const btn = document.getElementById(id);
        if (!btn) continue;
        btn.title = title;
        btn.addEventListener('click', () => { if (btn.getAttribute('aria-disabled') !== 'true') fn(); });
        // 按下去不搶輸入框的焦點（手機鍵盤不收，UI-SPEC D-10）
        btn.addEventListener('pointerdown', e => e.preventDefault());
        btn.addEventListener('mousedown', e => e.preventDefault());
    }
})();
