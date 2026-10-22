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
function lhSecApply(kind, mutate, opts = {}) {
    const song = curSong();
    if (!song || mutate(song) === false) return false;
    // 第 9-04 計畫會在這裡先記下改動前的狀態（復原用）
    lhSecFinalize(song.sections);
    markDirty(song.id);
    flushSongs();
    if (opts.dom === 'render') renderLyricsSections();
    else lhSecRefreshMeta();
    return true;
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
    });
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
        removeLyricsSection(Number(secEl.dataset.index));
    } else if (e.target.closest('.lyrics-section-header') && !e.target.closest('.section-handle, .section-count')) {
        toggleLyricsSection(Number(secEl.dataset.index));
    }
});
