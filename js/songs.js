// ==================== 歌曲資料模型 ====================
// 歌詞以這裡的記憶體模型為準（B1）：畫面只是模型的顯示，打字只改模型，存檔也從模型來，絕不從畫面讀回。
// songs / activeSongId / songsMode 宣告在 state.js；安全層開機（備份＋遷移）完成後才由 initSongs 填入（A3）。

const SONG_SAVE_DELAY = 300;   // 打字停下來多久才存；組字中完全不存（B2）
let _saveTimer = null;
const _dirty = new Set();      // 這個分頁改過、還沒寫進儲存的歌 id
const _deleted = new Set();    // 這個分頁刪掉、還沒從儲存移除的歌 id

function makeEmptySong(title) {
    const now = Date.now();
    return {
        id: lhNewId('song-'),
        title,
        sections: [{ id: lhNewId('sec-'), label: '', text: '', collapsed: false }],
        hashtags: [],
        context: '',
        createdAt: now,
        updatedAt: now
    };
}

// 還沒開機完成時是 null；所有呼叫端都要容忍
function curSong() {
    return songs.find(s => s.id === activeSongId) || null;
}

function markDirty(id) {
    const song = songs.find(s => s.id === id);
    if (!song) return;
    song.updatedAt = Date.now();
    _dirty.add(id);
}

function scheduleSave() {
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(flushSongs, SONG_SAVE_DELAY);
}

// v0.96 單首模式（遷移沒跑成）：寫回舊鍵，絕不碰 lh:songs / lh:activeSong
function _flushLegacy() {
    const song = curSong();
    if (!song || !_dirty.size) return true;
    const ok = lhSet('haiku_lyrics', JSON.stringify(song.sections.map(s => ({ label: s.label, text: s.text, collapsed: s.collapsed }))))
        && lhSet('haiku_hashtags', JSON.stringify(song.hashtags));
    if (ok) _dirty.clear();
    return ok;
}

// 為什麼合併寫入：兩個分頁各改不同的歌時，不能互相蓋掉。只換掉這個分頁改過的歌，其餘以儲存裡現有的為準
function flushSongs() {
    clearTimeout(_saveTimer);
    _saveTimer = null;
    if (songsMode === 'legacy') return _flushLegacy();
    if (!_dirty.size && !_deleted.size) return true;
    // 儲存裡讀不到或損毀（lhGetJSON 已另存損毀原文）時，改以記憶體裡的歌為底，才不會因為讀不到就丟歌
    const cur = lhGetJSON('lh:songs', null, lhSongsOk) || songs.slice();
    const byId = new Map(cur.map(s => [s.id, s]));
    _deleted.forEach(id => byId.delete(id));
    _dirty.forEach(id => {
        const s = songs.find(x => x.id === id);
        if (s) byId.set(id, s);
    });
    // 兩個都寫成功才清旗標；失敗就留著下次再試（橫幅 lhSet 已經跳了）
    const ok = lhSet('lh:songs', JSON.stringify([...byId.values()]))
        && (activeSongId === null || lhSet('lh:activeSong', activeSongId));
    if (ok) { _dirty.clear(); _deleted.clear(); }
    return ok;
}

// 儲存裡的歌可能少欄位（舊版、手動改過）：補成畫面與存檔都能用的形狀，回傳有沒有補過
function _normalizeSong(s) {
    let changed = false;
    if (typeof s.title !== 'string') { s.title = '未命名歌曲'; changed = true; }
    if (!Array.isArray(s.hashtags) || s.hashtags.some(t => typeof t !== 'string')) {
        s.hashtags = Array.isArray(s.hashtags) ? s.hashtags.filter(t => typeof t === 'string') : [];
        changed = true;
    }
    if (typeof s.context !== 'string') { s.context = ''; changed = true; }
    if (!Number.isFinite(s.createdAt)) { s.createdAt = Date.now(); changed = true; }
    if (!Number.isFinite(s.updatedAt)) { s.updatedAt = s.createdAt; changed = true; }
    const seen = new Set();
    s.sections = s.sections.filter(x => x && typeof x === 'object').map(x => {
        if (typeof x.id !== 'string' || !LH_ID_RE.test(x.id) || seen.has(x.id)) { x.id = lhNewId('sec-'); changed = true; }
        seen.add(x.id);
        if (typeof x.label !== 'string') { x.label = ''; changed = true; }
        if (typeof x.text !== 'string') { x.text = ''; changed = true; }
        if (typeof x.collapsed !== 'boolean') { x.collapsed = !!x.collapsed; changed = true; }
        return x;
    });
    if (s.sections.length === 0) {
        s.sections.push({ id: lhNewId('sec-'), label: '', text: '', collapsed: false });
        changed = true;
    }
    return changed;
}

// 開機：決定模式、載入歌、第一次畫出編輯器。不依賴安全層的回傳值，只看 lh:schema 與 lh:songs 實際長怎樣
function initSongs() {
    if (lhGet('lh:schema') !== '2') {
        // 備份被擋住或升級退回：沿用舊版單首歌詞，編輯寫回舊鍵，lh:songs 不出現
        songsMode = 'legacy';
        songs = [lhSongFromLegacy()];
    } else {
        songsMode = 'v2';
        const list = lhGet('lh:songs') === null ? null : lhGetJSON('lh:songs', null, lhSongsOk);
        if (list && list.length > 0) songs = list;
        else {
            // 沒有（升級中斷）→ 從舊歌詞補一首；損毀或被清空 → 一首空歌。永遠至少有一首
            songs = [lhGet('lh:songs') === null ? lhSongFromLegacy() : makeEmptySong('未命名歌曲 1')];
            songs.forEach(s => _dirty.add(s.id));
        }
        songs.forEach(s => { if (_normalizeSong(s)) _dirty.add(s.id); });
    }
    const saved = lhGet('lh:activeSong');
    activeSongId = songs.some(s => s.id === saved)
        ? saved
        : songs.reduce((a, b) => (b.createdAt > a.createdAt ? b : a)).id;
    _refreshSongUI();
    if (_dirty.size) flushSongs();
    // 桌機的推開欄記得上次開關；手機／平板的覆蓋層一律從關著開始（D-04）
    if (songsMode === 'v2' && _MQ_SONG_PUSH.matches && lhGet('lh:songListOpen') === 'true') {
        _applySongListState(true);
        syncCenterPanel();
    }
    // 只有跑了升級的那一頁會看到一次（__lhMigrated 只在那一頁為 true）
    if (window.__lhMigrated === true) showToast('你原本的歌詞已整理成第一首歌「我的第一首歌」，一字不少', 6000);
}

// ==================== 多分頁同步 ====================
// 別的分頁改了 lh:songs：沒在打字就立刻重載，正在打字就等離開輸入框再重載（A5）。
// 這個分頁自己寫入不會收到自己的 storage 事件；lh:activeSong 的變動不處理（每個分頁各自看自己的那首）。
let _pendingExternal = false;

// 游標在歌詞、情境或歌名輸入框裡才算正在編輯；整個視窗失焦時不算（否則背景分頁永遠不更新）
function isEditingField() {
    if (!document.hasFocus()) return false;
    const ae = document.activeElement;
    return !!(ae && ae.closest && ae.closest('#lyricsSections, #contextDescription, .song-name-input'));
}

// 側邊清單的順序：新的在前；建立時間相同就依 id，順序才固定
function sortedSongs() {
    return songs.slice().sort((a, b) => (b.createdAt - a.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// 歌名在提示裡最多 16 個字（用字元而不是 UTF-16 單位，不會把一個字切半）
function cutName(name, n) {
    const chars = Array.from(name);
    return chars.length > n ? chars.slice(0, n).join('') + '…' : name;
}

function _applyExternalSongs() {
    _pendingExternal = false;
    flushSongs();   // 先把這個分頁自己還沒存的修改合併進去，才不會被重載蓋掉（F4）
    const raw = lhGet('lh:songs');
    const list = lhGetJSON('lh:songs', null, lhSongsOk);   // 不直接用事件帶來的值（T-08-10）；損毀時這裡已經記過警告
    if (!list) {
        if (raw === null || raw === '') lhWarn('其他分頁移除了歌曲資料，維持目前畫面');
        return;
    }
    const oldOrder = sortedSongs().map(s => s.id);
    const oldPos = oldOrder.indexOf(activeSongId);
    if (list.length === 0) {
        songs = [makeEmptySong('未命名歌曲 1')];
        _dirty.add(songs[0].id);
    } else {
        songs = list;
        songs.forEach(s => { if (_normalizeSong(s)) _dirty.add(s.id); });
    }
    let deleted = false;
    if (!songs.some(s => s.id === activeSongId)) {
        deleted = true;
        const alive = new Set(songs.map(s => s.id));
        // 舊順序裡先往後找、找不到再往前找，都沒有就取清單第一首
        const after = oldOrder.slice(oldPos + 1);
        const before = oldOrder.slice(0, Math.max(oldPos, 0)).reverse();
        activeSongId = [...after, ...before].find(id => alive.has(id)) || sortedSongs()[0].id;
        lhSet('lh:activeSong', activeSongId);
    }
    if (_dirty.size) flushSongs();
    _refreshSongUI();
    showToast(deleted
        ? '其他分頁刪除了這首歌，已切換到「' + cutName(curSong().title, 16) + '」'
        : '其他分頁更新了歌詞，已重新載入', 4000);
}

window.addEventListener('storage', e => {
    if (songsMode !== 'v2' || activeSongId === null || (e.key !== 'lh:songs' && e.key !== null)) return;
    if (isEditingField()) _pendingExternal = true;
    else _applyExternalSongs();
});

// 離開編輯區才套用；從一個輸入框移到另一個時 activeElement 還在編輯區，不重畫
document.addEventListener('focusout', () => {
    if (!_pendingExternal) return;
    setTimeout(() => { if (_pendingExternal && !isEditingField()) _applyExternalSongs(); }, 0);
});

// 關頁或切到背景前把等待中的修改寫出去（不用 beforeunload：手機上不可靠，而且會跳離開確認）
window.addEventListener('pagehide', flushSongs);
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSongs();
});

// ==================== 歌曲清單（☰ 歌曲） ====================
// 桌機（≥ 1024）是推開左側面板的一欄，其餘寬度是蓋在歌詞區上面的覆蓋層；兩種都只是同一個 #songList 換 class（D-02、D-03）
const _MQ_SONG_PUSH = matchMedia('(min-width: 1024px)');
const _songListOpen = () => { const el = document.getElementById('songList'); return !!el && !el.hidden; };

// 標題列與清單的標題、數量、一首歌時的提示；舊版單首模式沒有清單，☰ 也藏起來（F2）
function renderSongHeader() {
    const song = curSong();
    const cur = document.getElementById('songCurrent');
    if (cur && song) { cur.textContent = song.title; cur.title = song.title; }
    const btn = document.getElementById('songListToggle');
    if (btn) btn.hidden = songsMode !== 'v2';
}

// 歌名一律用 createElement／textContent／setAttribute 進 DOM，動作用 data-song-id 加委派監聽（T-08-12）
function renderSongList() {
    const ul = document.getElementById('songItems');
    if (!ul) return;
    const list = sortedSongs();
    ul.replaceChildren(...list.map(s => {
        const active = s.id === activeSongId;
        const li = document.createElement('li');
        li.className = 'song-item';
        if (active) li.setAttribute('aria-current', 'true');
        const pick = document.createElement('button');
        pick.type = 'button';
        pick.className = 'song-pick';
        pick.dataset.songId = s.id;
        pick.tabIndex = active ? 0 : -1;
        pick.textContent = s.title;
        pick.title = s.title;
        const acts = document.createElement('div');
        acts.className = 'song-actions';
        const ren = document.createElement('button');
        ren.type = 'button';
        ren.className = 'song-act rename';
        ren.dataset.songId = s.id;
        ren.textContent = '✎';
        ren.setAttribute('aria-label', '重新命名「' + s.title + '」');
        ren.title = '重新命名「' + s.title + '」';
        acts.appendChild(ren);
        li.append(pick, acts);
        return li;
    }));
    const cap = document.getElementById('songListCaption');
    if (cap) cap.textContent = '歌曲（' + list.length + '）';
    const hint = document.getElementById('songListHint');
    if (hint) hint.hidden = list.length !== 1;
}

// 換歌、開機、別分頁更新後：編輯器、標題列、清單一起依目前這首歌重畫
function _refreshSongUI() {
    renderActiveSong();
    renderSongHeader();
    renderSongList();
}

// 只動畫面與 class，不寫儲存：開關的記憶由 toggleSongList 決定（覆蓋層不記，D-04）
function _applySongListState(open) {
    const list = document.getElementById('songList');
    const btn = document.getElementById('songListToggle');
    if (!list) return;
    const push = _MQ_SONG_PUSH.matches;
    list.hidden = !open;
    list.toggleAttribute('inert', !open);
    list.classList.toggle('song-list--push', push);
    list.classList.toggle('song-list--overlay', !push);
    if (btn) btn.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('songs-open', open && push);
    if (open) {
        const cur = list.querySelector('.song-item[aria-current="true"]');
        if (cur) cur.scrollIntoView({ block: 'nearest' });
    }
}

function toggleSongList(force) {
    if (songsMode !== 'v2') return;
    const open = typeof force === 'boolean' ? force : !_songListOpen();
    _applySongListState(open);
    if (_MQ_SONG_PUSH.matches) {
        lhSet('lh:songListOpen', String(open));
        syncCenterPanel(open ? 'left' : undefined);   // 左邊多了一欄，主畫面寬度要重算
    }
}

// 左邊面板收起（或離開歌詞分頁）時，蓋在歌詞上的清單跟著關；推開欄的偏好不動（§9）
function closeSongListOverlay() {
    if (_songListOpen() && !_MQ_SONG_PUSH.matches) _applySongListState(false);
}

// 換歌：先把舊歌還沒存的修改寫出去（B2），再換 activeSongId
function switchSong(id) {
    if (!songs.some(s => s.id === id)) return;
    const changed = id !== activeSongId;
    if (changed) {
        flushSongs();
        activeSongId = id;
        if (songsMode === 'v2') lhSet('lh:activeSong', id);
        _refreshSongUI();
        const area = document.getElementById('lyricsSections');
        if (area) area.scrollTop = 0;
    }
    if (_songListOpen() && !_MQ_SONG_PUSH.matches) {
        _applySongListState(false);
        const btn = document.getElementById('songListToggle');
        if (btn) btn.focus();
    } else {
        const pick = document.querySelector('#songItems .song-pick[data-song-id="' + id + '"]');   // id 已由 songs.some 驗證，只含 LH_ID_RE 字元
        if (pick) pick.focus();
    }
}

// 下一個沒用過的編號：現有「未命名歌曲 N」最大的 N 加 1（空缺不回頭補）
function nextUntitledNumber() {
    let max = 0;
    songs.forEach(s => {
        const m = /^未命名歌曲 (\d+)$/.exec(s.title);
        if (m) max = Math.max(max, Number(m[1]));
    });
    return max + 1;
}

function createSong() {
    if (songsMode !== 'v2') return;
    flushSongs();
    const song = makeEmptySong('未命名歌曲 ' + nextUntitledNumber());
    songs.push(song);
    markDirty(song.id);
    activeSongId = song.id;
    flushSongs();
    _refreshSongUI();
    const area = document.getElementById('lyricsSections');
    if (area) area.scrollTop = 0;
}

document.addEventListener('click', e => {
    const pick = e.target.closest && e.target.closest('#songItems .song-pick');
    if (pick) switchSong(pick.dataset.songId);
});
