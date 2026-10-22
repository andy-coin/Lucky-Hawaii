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
    else lhSecRefreshMeta();
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
