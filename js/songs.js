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
    renderActiveSong();
    if (_dirty.size) flushSongs();
}

// 關頁或切到背景前把等待中的修改寫出去（不用 beforeunload：手機上不可靠，而且會跳離開確認）
window.addEventListener('pagehide', flushSongs);
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSongs();
});
