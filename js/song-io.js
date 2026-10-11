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

// Markdown：「# 歌名」、每段「## 段落名」，歌詞每行尾巴補兩個空格（強制換行）。
// 行首是 # > - * + 或「數字.」的歌詞行前面加反斜線，才不會被當成標題、引用、清單
function songToMd(song) {
    const esc = line => (/^(?:[#>*+-]|\d+\.)/.test(line) ? '\\' + line : line);
    const parts = songExportSections(song).map(s =>
        '## ' + s.label + '\n\n' + s.text.replace(/\s+$/, '').split('\n').map(esc).join('  \n'));
    return '# ' + song.title + '\n\n' + parts.join('\n\n') + '\n';
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

// 複製整首 = TXT 字串。writeText 要在點擊當下同步呼叫（Safari 要求）；被拒絕或沒有剪貼簿 API（非 https）就退回舊方法
function copySongText(song) {
    const text = songToTxt(song);
    const done = () => showToast('已複製整首');
    const legacy = () => (fallbackCopy(text) ? done() : showToast('複製失敗，請改用「TXT」下載', 2400));
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, legacy);
    else legacy();
}

// PDF：不用任何函式庫。把歌填進隱藏的 #printSheet，body 加上 print-song 讓 css/print.css 只印這張，再叫出瀏覽器的列印視窗。
// 全部用 textContent（歌名、段落名、歌詞都是使用者打的字）；列印結束（afterprint）清空，見下方
function printSong(song) {
    const sheet = document.getElementById('printSheet');
    if (!sheet) return;
    const mk = (tag, cls, text) => {
        const el = document.createElement(tag);
        el.className = cls;
        el.textContent = text;
        return el;
    };
    sheet.textContent = '';
    sheet.appendChild(mk('h1', 'print-title', song.title));
    for (const s of songExportSections(song)) {
        const text = s.text.replace(/\s+$/, '');
        const sec = document.createElement('section');
        // 12 行以內的段落不要被分頁切成兩半；更長的才允許切
        sec.className = 'print-section' + (text.split('\n').length <= 12 ? ' print-short' : '');
        sec.appendChild(mk('h2', 'print-label', s.label));
        sec.appendChild(mk('p', 'print-text', text));
        sheet.appendChild(sec);
    }
    document.body.classList.add('print-song');
    showToast('在列印視窗選「儲存為 PDF」', 3000);
    window.print();
}

function _endPrint() {
    const sheet = document.getElementById('printSheet');
    if (sheet) sheet.textContent = '';
    document.body.classList.remove('print-song');
}
window.addEventListener('afterprint', _endPrint);

// kind：'txt' | 'md' | 'pdf' | 'copy'（選單項目寫死傳進來）
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
    } else if (kind === 'md') {
        downloadText(safe + '.md', songToMd(song), 'text/markdown;charset=utf-8');
        showToast('已匯出「' + cutName(safe, 16) + '.md」', 2400);
    } else if (kind === 'pdf') {
        printSong(song);
    } else if (kind === 'copy') {
        copySongText(song);
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
    // 有對話框開著就不開選單（對話框蓋在選單上面，開了也點不到）
    if (document.querySelector('.feedback-modal-overlay.show')) { closeExportMenu(); return; }
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

// 鍵盤：選單開著時 ↑↓ 在選項間移動（頭尾相接），Esc 關閉並把焦點還給 ⬇ 匯出。
// 注音組字中的 Esc 是取消組字，不是關選單
document.addEventListener('keydown', e => {
    const menu = document.getElementById('exportMenu');
    if (!menu || !menu.classList.contains('show') || e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Escape') {
        closeExportMenu();
        document.getElementById('exportToggle').focus();
        e.preventDefault();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const items = [...menu.querySelectorAll('.export-item')];
        const i = items.indexOf(document.activeElement);
        const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i <= 0 ? items.length - 1 : i - 1);
        items[next].focus();
        e.preventDefault();
    }
});

// ==================== 備份全部／匯入備份（EDIT-09） ====================
// 備份 = 所有歌曲、保留池、設定（不含金鑰）一個檔。檔案內容由 js/safety.js 的 lhBuildBackup 組、lhParseBackup 整理
const _pad2 = n => String(n).padStart(2, '0');

// 檔名用本機時間：LuckyHawaii-備份-20261011-1530.json；不問檔名（沒有 prompt）
function exportSession() {
    flushSongs();   // 還在 300 毫秒等待中的修改先寫進模型再組備份
    const data = lhBuildBackup(songs, activeSongId, savedWords);
    const d = new Date();
    const stamp = d.getFullYear() + _pad2(d.getMonth() + 1) + _pad2(d.getDate()) + '-' + _pad2(d.getHours()) + _pad2(d.getMinutes());
    downloadText('LuckyHawaii-備份-' + stamp + '.json', JSON.stringify(data, null, 2), 'application/json');
    showToast('已匯出備份檔（' + data.songs.length + ' 首歌）', 2400);
}

// 匯入視窗的狀態：parsed 是整理過的檔案內容；opener 是開啟前的焦點；busy 是 全部還原 進行中
const _imp = { parsed: null, opener: null, busy: false };
const _impEl = id => document.getElementById(id);
const _importOpen = () => !!_impEl('importOverlay') && _impEl('importOverlay').classList.contains('show');

const IMPORT_ERRORS = {
    notjson: '這個檔案不是有效的備份檔（內容讀不出來）。請選擇用「備份全部」存出來的 .json 檔。',
    format: '這不是好韻器的備份檔。請選擇用「備份全部」存出來的 .json 檔。',
    version: v => '這份備份是比較新的版本做的（版本 ' + v + '），目前的好韻器還讀不了。請先重新整理頁面更新，再試一次。',
    nosongs: '這份備份裡沒有任何歌曲，沒有東西可以匯入。',
    toolarge: '檔案太大了（超過 ' + (LH_BACKUP_MAX_BYTES / 1024 / 1024) + ' MB），不像是備份檔。請確認選對檔案。',
    read: '讀取失敗：這個檔案打不開，請再試一次。',
    write: '還原沒有完成：瀏覽器的儲存空間可能已滿，已經回到匯入前的狀態。',
    backup: '還原沒有開始：自動備份存不下來（瀏覽器的儲存空間可能已滿）。',
};
const IMPORT_UNCHANGED = '目前的歌詞與設定都沒有被改動。';

// 同一個視窗外殼的四種畫面：'summary'（v2）、'v1'（舊存檔）、'working'（還原中）、'error'
function _setImportView(view, errText) {
    const show = (id, on) => { _impEl(id).hidden = !on; };
    const isErr = view === 'error';
    const isV1 = view === 'v1';
    _impEl('importTitle').textContent = isErr ? '這個檔案無法匯入' : '匯入備份';
    show('importSummary', !isErr);
    show('importMeta', view === 'summary' || view === 'working');
    show('importChips', view === 'summary' || view === 'working');
    show('importAddBtn', !isErr);
    show('importReplaceBtn', view === 'summary' || view === 'working');
    show('importStatus', view === 'working');
    show('importError', isErr);
    _impEl('importStatus').textContent = view === 'working' ? '還原中…' : '';
    _impEl('importError').textContent = isErr ? errText : '';
    const working = view === 'working';
    for (const id of ['importAddBtn', 'importReplaceBtn', 'importCancelBtn']) _impEl(id).disabled = working;
    const cancel = _impEl('importCancelBtn');
    cancel.textContent = isErr ? '關閉錯誤訊息' : '先不匯入';
    cancel.setAttribute('aria-label', isErr ? '關閉錯誤訊息，回到頁面' : '先不匯入，關閉視窗');
    cancel.title = cancel.getAttribute('aria-label');
    _impEl('importAddLabel').textContent = isV1 ? '加入成新歌曲' : '只加入歌曲';
    _impEl('importAddHint').textContent = isV1 ? '保留池的詞會合併，重複的不會多出來' : '保留你現在的歌曲與設定，備份裡的歌曲會加進來';
}

function _showImportOverlay() {
    if (!_importOpen()) _imp.opener = document.activeElement;
    _impEl('importOverlay').classList.add('show');
}

// 錯誤畫面：一段白話、一顆「關閉錯誤訊息」，焦點直接放在按鈕上（Enter 就能關）
function showImportError(kind, info) {
    const msg = IMPORT_ERRORS[kind];
    const text = (typeof msg === 'function' ? msg(String(info && info.version).slice(0, 12)) : msg || IMPORT_ERRORS.format) + IMPORT_UNCHANGED;
    _imp.parsed = null;
    _imp.busy = false;
    _showImportOverlay();
    _setImportView('error', text);
    _impEl('importCancelBtn').focus();
}

// 摘要畫面：parsed 是 lhParseBackup 回傳 ok 的結果（已整理過）
function openImportDialog(parsed) {
    _imp.parsed = parsed;
    _imp.busy = false;
    const ymdhm = iso => {
        const t = new Date(iso);
        return Number.isNaN(t.getTime()) ? '' : t.getFullYear() + '/' + _pad2(t.getMonth() + 1) + '/' + _pad2(t.getDate()) + ' ' + _pad2(t.getHours()) + ':' + _pad2(t.getMinutes());
    };
    const chips = _impEl('importChips');
    chips.replaceChildren();
    if (parsed.kind === 'v1') {
        _impEl('importSummary').textContent = '這是舊版的存檔：有 ' + parsed.sectionCount + ' 段歌詞，會加進成新的一首歌';
        _impEl('importMeta').textContent = '';
    } else {
        _impEl('importSummary').textContent = '這份備份有 ' + parsed.songs.length + ' 首歌與你的設定';
        const when = ymdhm(parsed.exportedAt);
        _impEl('importMeta').textContent = when ? '備份時間：' + when : '';
        const mk = text => {
            const chip = document.createElement('span');
            chip.className = 'report-chip';
            chip.textContent = text;
            return chip;
        };
        const shown = parsed.songs.slice(0, 5).map(s => mk(s.title));
        if (parsed.songs.length > 5) shown.push(mk('+' + (parsed.songs.length - 5)));
        chips.replaceChildren(...shown);
        _impEl('importReplaceHint').textContent = '目前的 ' + songs.length + ' 首歌與設定會被換成備份檔的內容；換之前會先自動備份目前資料';
    }
    _showImportOverlay();
    _setImportView(parsed.kind === 'v1' ? 'v1' : 'summary');
    _impEl('importTitle').focus();   // 焦點放標題（tabindex -1），手機鍵盤不會彈出來
}

// 選了檔案：先擋太大的，再讀文字、整理，通過才跳出摘要；壞檔只跳說明，不碰任何資料。選完一定清空 input，同一個檔才能再選
function importSession(ev) {
    const input = ev && ev.target;
    const file = input && input.files && input.files[0];
    if (input) input.value = '';
    if (!file) return;
    if (file.size > LH_BACKUP_MAX_BYTES) { showImportError('toolarge'); return; }
    const reader = new FileReader();
    reader.onerror = () => {
        lhWarn('讀取備份檔失敗', reader.error);
        showImportError('read');
    };
    reader.onload = () => {
        const r = lhParseBackup(String(reader.result));
        if (r.ok) openImportDialog(r);
        else showImportError(r.error, r);
    };
    reader.readAsText(file);
}

// 「只加入歌曲」見下方 importAddSongs（Task 2）
function importAddSongs() {
    closeImportDialog();
}

async function importReplaceAll() {
    const p = _imp.parsed;
    if (!p || p.kind !== 'v2' || _imp.busy || !_importOpen()) return;
    _imp.busy = true;
    flushSongs();
    _setImportView('working');
    let r;
    try { r = await lhApplyBackupReplace(p); }
    catch (e) { lhWarn('全部還原失敗', e); r = { ok: false, stage: 'write' }; }
    if (!r.ok) {
        showImportError(r.stage === 'backup' ? 'backup' : 'write');
        return;
    }
    // 重新載入時 pagehide 會把這個分頁還沒存的修改合併進去，蓋掉剛還原的歌：清掉旗標
    _dirty.clear();
    _deleted.clear();
    history.replaceState(null, '', location.pathname + location.search + '#lh-restored=' + p.songs.length);
    location.reload();   // 主題、顏色、詞庫包、輸入模式都靠開機流程重讀儲存，重新載入最單純
}

// 重新載入後顯示結果（網址上的暗號只有數字），然後把暗號收掉
document.addEventListener('DOMContentLoaded', () => {
    const m = /^#lh-restored=(\d{1,4})$/.exec(location.hash);
    if (!m) return;
    showToast('已還原 ' + Number(m[1]) + ' 首歌與設定（還原前的資料已自動備份）', 4000);
    history.replaceState(null, '', location.pathname + location.search);
});

// 關閉：遮罩只有點在遮罩本身才算；還原中不能關；焦點回到開啟前的按鈕
function closeImportDialog(e) {
    const overlay = _impEl('importOverlay');
    if (!overlay || !overlay.classList.contains('show') || _imp.busy) return;
    if (e && e.target !== overlay) return;
    overlay.classList.remove('show');
    _imp.parsed = null;
    const op = _imp.opener;
    _imp.opener = null;
    if (op && op.focus && document.contains(op)) op.focus();
}

// Esc 關閉（組字中的 Esc 是取消組字，不算）；Tab 只在視窗裡打轉
document.addEventListener('keydown', e => {
    if (!_importOpen() || e.isComposing || e.keyCode === 229) return;
    const ov = _impEl('importOverlay');
    if (e.key === 'Escape') { e.preventDefault(); closeImportDialog(); return; }
    if (e.key !== 'Tab') return;
    const tabbables = [...ov.querySelectorAll('button')].filter(el => !el.disabled && !el.hidden && el.tabIndex >= 0);
    if (tabbables.length === 0) { e.preventDefault(); return; }
    const first = tabbables[0], last = tabbables[tabbables.length - 1], a = document.activeElement;
    if (!ov.contains(a)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && (a === first || a === _impEl('importTitle'))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
});
