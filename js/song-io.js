// ==================== 匯出與備份 ====================
// 匯出一律從記憶體模型（curSong）組字串，不讀畫面；只放這首歌的歌名、段落名與歌詞，其他資料（別首歌、標籤、情境、設定）不外流，也不連網路。

// 要匯出的段落：全空白的段落略過（D-11）；沒有段落名就叫「段落 n」，n 是匯出段落裡的順序
function songExportSections(song) {
    return song.sections
        .filter(s => s.text.trim())
        .map((s, i) => ({
            label: s.label.trim() || '段落 ' + (i + 1),
            text: s.text.replace(/\r\n?/g, '\n'),
        }));
}

// TXT：歌名、空一行，之後每段「[段落名]」加歌詞，段與段之間空一行，結尾只留一個換行
function songToTxt(song) {
    const parts = songExportSections(song).map(s => '[' + s.label + ']\n' + s.text.replace(/\s+$/, ''));
    return song.title + '\n\n' + parts.join('\n\n') + '\n';
}

// 檔名不能含的字元換成底線；全空白就用預設名（T-08-15）
function safeFileName(title) {
    return title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || '未命名歌曲';
}

// 下載：Blob 網址掛在 <a>（要先放進 body，iOS 才認），10 秒後才收掉網址，太早收 WebKit 會下載失敗
function downloadText(filename, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 10000);
}

// kind：'txt' 先做；其他種類之後加進來
function exportSongAs(kind) {
    flushSongs();
    const song = curSong();
    closeExportMenu();
    if (!song) return;
    if (!songExportSections(song).length) {
        showToast('這首歌還沒有歌詞可以匯出', 2400);
        return;
    }
    const safe = safeFileName(song.title);
    if (kind === 'txt') {
        downloadText(safe + '.txt', songToTxt(song), 'text/plain;charset=utf-8');
        showToast('已匯出「' + cutName(safe, 16) + '.txt」', 2400);
    }
}

// ===== 匯出選單 =====
function closeExportMenu() {
    const menu = document.getElementById('exportMenu');
    const btn = document.getElementById('exportToggle');
    if (menu) menu.classList.remove('show');
    if (btn) btn.setAttribute('aria-expanded', 'false');
}

function toggleExportMenu(e) {
    const menu = document.getElementById('exportMenu');
    const btn = document.getElementById('exportToggle');
    if (!menu || !btn) return;
    if (menu.classList.contains('show')) { closeExportMenu(); return; }
    // 提示裡的歌名最多 16 個字（只用 textContent，歌名裡的標記不會被當成 HTML）
    const song = curSong();
    const name = cutName(safeFileName(song ? song.title : ''), 16);
    const hints = { txt: '下載 ' + name + '.txt', md: '下載 ' + name + '.md' };
    menu.querySelectorAll('.export-hint[data-hint]').forEach(el => {
        if (hints[el.dataset.hint]) el.textContent = hints[el.dataset.hint];
    });
    const r = btn.getBoundingClientRect();
    lhPlaceMenu(menu, r.left, r.bottom + 4);
    // 下面放不下被擠上去蓋住按鈕時，翻到按鈕上方
    const m = menu.getBoundingClientRect();
    if (m.top < r.bottom && r.top - m.height - 4 >= 4) lhPlaceMenu(menu, r.left, r.top - m.height - 4);
    btn.setAttribute('aria-expanded', 'true');
    // 鍵盤打開才把焦點放到第一項；滑鼠、觸控打開不搶焦點
    if (e && e.detail === 0) {
        const first = menu.querySelector('.export-item');
        if (first) first.focus();
    }
}

// 點選單與按鈕以外的地方就關
document.addEventListener('pointerdown', e => {
    const menu = document.getElementById('exportMenu');
    if (!menu || !menu.classList.contains('show')) return;
    if (e.target.closest('#exportMenu, #exportToggle')) return;
    closeExportMenu();
});
