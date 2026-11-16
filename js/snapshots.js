// ==================== 快照與垃圾桶（0.98.21） ====================
// 歌詞本身邊打邊存（js/songs.js flushSongs）；這裡是「回到今天稍早的版本」：
// - 定時快照：每 N 分鐘（設定滑桿：關閉／10／15／30／60，lh:snapCfg），這段時間有改動才拍
// - 最新進度：改動後閒置 10 秒拍一張，每個專案永遠只有一張（取代前一張）
// - 只保留 24 小時；滑桿「關閉」＝兩種都不拍
// - 像 Git：一首歌的內容存成一個 blob（以內容雜湊為鍵），快照只記每首歌指向哪個 blob；沒改的歌不重複存。沒有快照指到的 blob 會被清掉
// 垃圾桶：刪掉的歌、專案整份放 7 天（js/songs.js 刪除前先 lhTrashPut，放成功才刪）。
// 全部存在獨立的 IndexedDB「lh-snaps」（不動安全層的 lh 資料庫版本）。歌名、歌詞一律 textContent 進畫面

const LH_SNAP_DB = 'lh-snaps';
const LH_SNAP_KEEP_MS = 24 * 3600e3, LH_TRASH_KEEP_MS = 7 * 24 * 3600e3, LH_SNAP_IDLE_MS = 10e3;
const LH_SNAP_STEPS = [0, 10, 15, 30, 60];   // 滑桿的五格（分鐘）；0＝關閉
const LH_SNAP_DEFAULT = 15;

let _lhSnapDbP = null;
function _lhSnapDb() {
    if (_lhSnapDbP) return _lhSnapDbP;
    _lhSnapDbP = new Promise((resolve, reject) => {
        if (!window.indexedDB) { reject(new Error('沒有 IndexedDB')); return; }
        const req = indexedDB.open(LH_SNAP_DB, 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            db.createObjectStore('blobs', { keyPath: 'h' });
            db.createObjectStore('snaps', { keyPath: 'id' });
            db.createObjectStore('trash', { keyPath: 'id' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error('快照資料庫被其他分頁擋住'));
    });
    _lhSnapDbP.catch(e => { lhWarn('快照資料庫打不開', e); _lhSnapDbP = null; });
    return _lhSnapDbP;
}
// 一個交易做完回傳 fn 的結果；fn(stores) 可以同步排很多個請求
function _lhSnapTx(names, mode, fn) {
    return _lhSnapDb().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(names, mode), st = {};
        for (const n of names) st[n] = tx.objectStore(n);
        let out;
        try { out = fn(st); } catch (e) { try { tx.abort(); } catch (e2) { lhWarn('快照交易中止失敗', e2); } reject(e); return; }
        tx.oncomplete = () => resolve(out && typeof out === 'object' && 'result' in out && out.readyState ? out.result : out);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    }));
}
const _lhSnapAll = name => _lhSnapTx([name], 'readonly', st => st[name].getAll());

// 內容雜湊（cyrb53）：只拿來辨認「內容一不一樣」，不是安全用途
function _lhHash(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36);
}
// 一首歌的內容（文字、段落、排版、角色…都算；修改時間不算，只改時間不算改動）
const _lhSongBody = s => JSON.stringify({ ...s, updatedAt: 0 });
const _lhSongChars = s => s.sections.reduce((t, x) => t + (typeof lhCountWords === 'function' ? lhCountWords(x.text) : x.text.replace(/\s/g, '').length), 0);

// ===== 設定 =====
function lhSnapMinutes() {
    const v = Number(lhGet('lh:snapCfg'));
    return LH_SNAP_STEPS.includes(v) && lhGet('lh:snapCfg') !== null ? v : LH_SNAP_DEFAULT;
}

// ===== 拍快照 =====
const _lhSnapS = { changed: new Map(), autoDue: new Set(), lastAuto: new Map(), blobs: null, busy: false, pruneAt: 0 };
// js/songs.js markDirty、自訂詞彙改動、還原之後呼叫：記下這個專案什麼時候改的
function lhSnapNote(pid) {
    if (typeof pid !== 'string') return;
    _lhSnapS.changed.set(pid, Date.now());
    _lhSnapS.autoDue.add(pid);
}

async function _lhSnapKnownBlobs() {
    if (!_lhSnapS.blobs) _lhSnapS.blobs = new Set(await _lhSnapTx(['blobs'], 'readonly', st => st.blobs.getAllKeys()));
    return _lhSnapS.blobs;
}

// kind：'latest'＝最新進度（每專案一張，取代舊的）；'auto'＝定時；'pre'＝還原前自動拍的（也照 24 小時規則）
async function lhSnapTake(pid, kind) {
    if (!songsReady || songsMode !== 'v2') return null;
    const list = projSongs(pid);
    if (!list.length) return null;
    const known = await _lhSnapKnownBlobs();
    const newBlobs = [], entries = sortedSongsOf(pid).map(s => {
        const body = _lhSongBody(s), h = _lhHash(body);
        if (!known.has(h)) newBlobs.push({ h, d: body });
        return { id: s.id, title: s.title, h, chars: _lhSongChars(s) };
    });
    const cwList = typeof lhCustomWords !== 'undefined' ? lhCustomWords.filter(x => x.p === pid).map(x => ({ w: x.w, z: x.z, s: x.s })) : [];
    let cw = null;
    if (cwList.length) { const body = JSON.stringify(cwList); cw = _lhHash(body); if (!known.has(cw)) newBlobs.push({ h: cw, d: body }); }
    const sig = entries.map(e => e.h).join(',') + '|' + cw;
    const rec = { id: 'snap-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), at: Date.now(), kind, project: pid, projName: lhProjName(pid),
        songs: entries, cw, sig, chars: entries.reduce((t, e) => t + e.chars, 0) };
    const all = await _lhSnapAll('snaps');
    // 定時快照：跟同專案上一張定時的一模一樣就不拍（只記時間）
    if (kind === 'auto') {
        const prev = all.filter(r => r.project === pid && r.kind === 'auto').sort((a, b) => b.at - a.at)[0];
        if (prev && prev.sig === sig) return prev;
    }
    await _lhSnapTx(['blobs', 'snaps'], 'readwrite', st => {
        for (const b of newBlobs) st.blobs.put(b);
        if (kind === 'latest') for (const r of all) if (r.project === pid && r.kind === 'latest') st.snaps.delete(r.id);
        st.snaps.put(rec);
    });
    newBlobs.forEach(b => known.add(b.h));
    return rec;
}
function sortedSongsOf(pid) {
    return projSongs(pid).sort((a, b) => (b.createdAt - a.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// 超過 24 小時的快照、超過 7 天的垃圾刪掉，再把沒人指到的 blob 清掉
async function lhSnapPrune() {
    const now = Date.now();
    const [snaps, trash] = await Promise.all([_lhSnapAll('snaps'), _lhSnapAll('trash')]);
    const keep = snaps.filter(r => now - r.at < LH_SNAP_KEEP_MS);
    const used = new Set();
    for (const r of keep) { r.songs.forEach(e => used.add(e.h)); if (r.cw) used.add(r.cw); }
    const known = await _lhSnapKnownBlobs();
    const dead = [...known].filter(h => !used.has(h));
    await _lhSnapTx(['blobs', 'snaps', 'trash'], 'readwrite', st => {
        for (const r of snaps) if (now - r.at >= LH_SNAP_KEEP_MS) st.snaps.delete(r.id);
        for (const r of trash) if (now - r.at >= LH_TRASH_KEEP_MS) st.trash.delete(r.id);
        for (const h of dead) st.blobs.delete(h);
    });
    dead.forEach(h => known.delete(h));
}

// 每 2 秒看一次：閒置 10 秒的專案更新「最新進度」；到了間隔、這段時間有改過的專案拍定時快照
async function _lhSnapTick() {
    if (_lhSnapS.busy || !songsReady || songsMode !== 'v2') return;
    const min = lhSnapMinutes();
    if (!min) { _lhSnapS.changed.clear(); _lhSnapS.autoDue.clear(); return; }
    _lhSnapS.busy = true;
    try {
        const now = Date.now();
        for (const [pid, at] of [..._lhSnapS.changed]) {
            if (now - at < LH_SNAP_IDLE_MS || !lhProjects.some(p => p.id === pid)) continue;
            if (typeof flushSongs === 'function') flushSongs();
            _lhSnapS.changed.delete(pid);
            await lhSnapTake(pid, 'latest');
        }
        for (const pid of [..._lhSnapS.autoDue]) {
            if (!lhProjects.some(p => p.id === pid)) { _lhSnapS.autoDue.delete(pid); continue; }
            if (now - (_lhSnapS.lastAuto.get(pid) || 0) < min * 60e3) continue;
            _lhSnapS.autoDue.delete(pid);
            _lhSnapS.lastAuto.set(pid, now);
            await lhSnapTake(pid, 'auto');
        }
        if (now - _lhSnapS.pruneAt > 60e3) { _lhSnapS.pruneAt = now; await lhSnapPrune(); }
    } catch (e) { lhWarn('拍快照失敗', e); }
    finally { _lhSnapS.busy = false; }
}
setInterval(_lhSnapTick, 2000);
// 開機：從資料庫讀回每個專案上一張定時快照的時間（重新整理後不會馬上又拍一張）
_lhSnapAll('snaps').then(all => { for (const r of all) if (r.kind === 'auto' && r.at > (_lhSnapS.lastAuto.get(r.project) || 0)) _lhSnapS.lastAuto.set(r.project, r.at); }, e => lhWarn('讀取快照時間失敗', e));

// ===== 垃圾桶 =====
// rec：{ kind: 'song'|'project', title, songs: [歌物件], project?: { id, name, ... }, projectId?, projName?, customWords? }；回傳成不成功
function lhTrashPut(rec) {
    const r = { ...rec, id: 'trash-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), at: Date.now(),
        songs: JSON.parse(JSON.stringify(rec.songs || [])) };
    return _lhSnapTx(['trash'], 'readwrite', st => { st.trash.put(r); }).then(() => true, e => { lhWarn('放進垃圾桶失敗', e); return false; });
}

// 把歌放回專案：專案不在了就照記錄重建；id 撞到（已經救回過）就換新 id
function _lhPutBackSongs(list, pid, pname) {
    if (!lhProjects.some(p => p.id === pid)) lhProjects.push({ id: pid, name: pname || '救回的專案', createdAt: Date.now(), last: null });
    const taken = new Set(songs.map(s => s.id));
    const out = [];
    for (const raw of list) {
        const s = lhNormalizeSong(raw, new Set(taken));
        if (!s) continue;
        if (taken.has(s.id)) s.id = lhNewId('song-');
        taken.add(s.id);
        s.project = pid;
        songs.push(s);
        markDirty(s.id);
        out.push(s);
    }
    return out;
}

async function lhTrashRestore(id) {
    if (!requireSongsReady()) return;
    const rec = (await _lhSnapAll('trash')).find(r => r.id === id);
    if (!rec) return;
    flushSongs();
    let pid = rec.kind === 'project' && rec.project ? rec.project.id : rec.projectId || activeProjectId;
    if (rec.kind === 'project' && lhProjects.some(p => p.id === pid)) pid = lhNewId('proj-');   // 同名專案還在（救回過）：另開一個
    const back = _lhPutBackSongs(rec.songs, pid, rec.kind === 'project' ? rec.project.name : rec.projName);
    if (rec.kind === 'project' && Array.isArray(rec.customWords) && rec.customWords.length && typeof _lhCwClean === 'function') {
        lhCustomWords = _lhCwClean(rec.customWords.map(x => ({ ...x, p: pid }))).concat(lhCustomWords);
        _lhCwSave();
    }
    await _lhSnapTx(['trash'], 'readwrite', st => { st.trash.delete(id); });
    flushSongs();
    _saveProjects();
    if (pid !== activeProjectId) switchProject(pid);
    if (back[0]) switchSong(back[0].id);
    _refreshSongUI();
    lhSnapNote(pid);
    showToast('已救回「' + cutName(rec.title, 16) + '」', 2400);
    lhDataRender();
}

// ===== 從快照還原 =====
const _lhBlob = h => _lhSnapTx(['blobs'], 'readonly', st => st.blobs.get(h)).then(b => b && b.d);
async function _lhSnapSong(rec, songId) {
    const e = rec.songs.find(x => x.id === songId);
    const d = e && await _lhBlob(e.h);
    return d ? JSON.parse(d) : null;
}

// 只還原一首：現在還在就換掉內容，已經刪了就放回去；還原前先替這個專案拍一張「還原前」，還原錯了可以再還原回來
async function lhSnapRestoreSong(snapId, songId) {
    if (!requireSongsReady()) return;
    const rec = (await _lhSnapAll('snaps')).find(r => r.id === snapId);
    const raw = rec && await _lhSnapSong(rec, songId);
    if (!raw) { showToast('這張快照讀不到這首歌'); return; }
    flushSongs();
    const pid = lhProjects.some(p => p.id === rec.project) ? rec.project : activeProjectId;
    await lhSnapTake(pid, 'pre');
    const i = songs.findIndex(s => s.id === songId);
    const s = lhNormalizeSong(raw, new Set());
    if (!s) return;
    s.project = pid;
    if (i >= 0) songs[i] = s; else songs.push(s);
    markDirty(s.id);
    flushSongs();
    if (pid !== activeProjectId) switchProject(pid);
    switchSong(s.id);
    _refreshSongUI();
    showToast('已還原「' + cutName(s.title, 16) + '」到 ' + _lhSnapWhen(rec.at) + ' 的版本（還原前已拍快照）', 3600);
    lhDataRender();
}

// 還原整個專案：專案的歌整份換成快照裡的（快照沒有的歌一起拿掉，但都在剛拍的「還原前」快照裡）；自訂詞彙也換回來
async function lhSnapRestoreProject(snapId) {
    if (!requireSongsReady()) return;
    const rec = (await _lhSnapAll('snaps')).find(r => r.id === snapId);
    if (!rec) return;
    const ok = await lhAsk({ title: '把專案「' + cutName(rec.projName, 16) + '」整個還原到 ' + _lhSnapWhen(rec.at) + '？', body: '現在的版本會先拍一張「還原前」快照，還原錯了可以再還原回來。',
        buttons: [{ label: '整個還原', value: true, kind: 'danger' }, { label: '取消', value: null }] });
    if (!ok) return;
    flushSongs();
    const pid = rec.project;
    if (lhProjects.some(p => p.id === pid)) await lhSnapTake(pid, 'pre');
    const bodies = await Promise.all(rec.songs.map(e => _lhBlob(e.h)));
    const cwBody = rec.cw ? await _lhBlob(rec.cw) : null;
    const gone = projSongs(pid).map(s => s.id);
    songs = songs.filter(s => projOf(s) !== pid);
    gone.forEach(id => { _dirty.delete(id); _deleted.add(id); });
    const back = _lhPutBackSongs(bodies.filter(Boolean).map(d => JSON.parse(d)), pid, rec.projName);
    back.forEach(s => _deleted.delete(s.id));
    if (typeof _lhCwClean === 'function') {
        lhCustomWords = lhCustomWords.filter(x => x.p !== pid).concat(_lhCwClean((cwBody ? JSON.parse(cwBody) : []).map(x => ({ ...x, p: pid }))));
        _lhCwSave();
    }
    if (pid === activeProjectId) { _ensureProjectSong(); _pickProjectSong(); }
    flushSongs();
    _saveProjects();
    if (pid !== activeProjectId) switchProject(pid);
    _refreshSongUI();
    if (typeof lhCwSongChanged === 'function') lhCwSongChanged(true);
    showToast('已把專案還原到 ' + _lhSnapWhen(rec.at) + '（還原前已拍快照）', 3600);
    lhDataRender();
}

async function lhSnapDelete(id) {
    await _lhSnapTx(['snaps'], 'readwrite', st => { st.snaps.delete(id); });
    await lhSnapPrune();
    lhDataRender();
}

// ===== 設定 → 資料與備份 =====
const _p2 = n => String(n).padStart(2, '0');
function _lhSnapWhen(ms) {
    const d = new Date(ms), today = new Date();
    const hm = _p2(d.getHours()) + ':' + _p2(d.getMinutes());
    return d.toDateString() === today.toDateString() ? '今天 ' + hm : (d.getMonth() + 1) + '/' + d.getDate() + ' ' + hm;
}
const LH_SNAP_KIND_N = { latest: '最新進度', auto: '定時', pre: '還原前', safety: '安全快照' };
const _el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const _btn = (cls, text, label) => { const b = _el('button', cls, text); b.type = 'button'; if (label) { b.setAttribute('aria-label', label); b.title = label; } return b; };
// 歌詞的純文字（預覽、比對共用）：每段前面一行「---Verse I---」
const _lhSongLines = s => s.sections.flatMap(x => ['---' + (x.label || '段落') + '---', ...x.text.split('\n')]);

const _data = { pick: new Set() };
async function lhDataRender() {
    const box = document.getElementById('snapList');
    if (!box) return;
    // 滑桿
    const r = document.getElementById('snapCfgRange'), min = lhSnapMinutes();
    if (r) { r.value = String(LH_SNAP_STEPS.indexOf(min)); }
    const cap = document.getElementById('snapCfgCap');
    if (cap) cap.textContent = min ? '每 ' + min + ' 分鐘' : '關閉';
    let snaps = [], trash = [], safety = [];
    try { await lhSnapPrune(); [snaps, trash] = await Promise.all([_lhSnapAll('snaps'), _lhSnapAll('trash')]); }
    catch (e) { lhWarn('讀取快照失敗', e); }
    try { safety = (await lhListBackups()).filter(b => b && typeof b.id === 'string' && Date.now() - (b.createdAt || 0) < LH_SNAP_KEEP_MS); }
    catch (e) { lhWarn('讀取安全快照失敗', e); }
    _data.pick = new Set([..._data.pick].filter(id => snaps.some(s => s.id === id)));
    snaps.sort((a, b) => b.at - a.at);
    const cards = snaps.map(rec => _lhSnapCard(rec));
    // 匯入、升級前的安全快照：整份資料（所有專案＋設定），只能整份還原
    for (const b of safety.sort((a, c) => (c.createdAt || 0) - (a.createdAt || 0))) {
        const li = _el('li', 'snap-card snap-safety');
        const head = _el('div', 'snap-head');
        head.append(_el('span', 'snap-kind', LH_SNAP_KIND_N.safety), _el('span', 'snap-name', typeof b.label === 'string' && b.label ? b.label : b.id), _el('span', 'snap-when', _lhSnapWhen(b.createdAt)));
        const rb = _btn('snap-btn backup-restore-btn', '整份還原', '整份還原這張安全快照（所有專案與設定）');
        rb.dataset.backupId = b.id;
        head.append(rb);
        li.append(head);
        cards.push(li);
    }
    box.replaceChildren(...(cards.length ? cards : [_el('li', 'snap-empty', min ? '還沒有快照：開始寫歌，改完閒置 10 秒就會有第一張' : '快照已關閉')]));
    _lhSnapSyncPick();
    // 垃圾桶
    const tl = document.getElementById('trashList');
    if (tl) {
        trash.sort((a, b) => b.at - a.at);
        tl.replaceChildren(...(trash.length ? trash.map(t => {
            const li = _el('li', 'snap-card trash-card');
            const left = Math.max(0, Math.ceil((t.at + LH_TRASH_KEEP_MS - Date.now()) / 86400e3));
            const head = _el('div', 'snap-head');
            head.append(_el('span', 'snap-kind', t.kind === 'project' ? '專案' : '歌曲'), _el('span', 'snap-name', t.title),
                _el('span', 'snap-meta', (t.kind === 'project' ? t.songs.length + ' 首 · ' : (t.projName ? '專案「' + t.projName + '」· ' : '')) + '還剩 ' + left + ' 天'));
            const back = _btn('snap-btn', '救回', '救回「' + t.title + '」');
            back.addEventListener('click', () => lhTrashRestore(t.id));
            const del = _btn('snap-btn danger', '永久刪除', '永久刪除「' + t.title + '」');
            del.addEventListener('click', async () => {
                const ok = await lhAsk({ title: '永久刪除「' + cutName(t.title, 16) + '」？', body: '刪了就救不回來', buttons: [{ label: '永久刪除', value: true, kind: 'danger' }, { label: '取消', value: null }] });
                if (!ok) return;
                await _lhSnapTx(['trash'], 'readwrite', st => { st.trash.delete(t.id); });
                lhDataRender();
            });
            head.append(back, del);
            li.append(head);
            return li;
        }) : [_el('li', 'snap-empty', '垃圾桶是空的')]));
    }
    lhStorageUse(snaps, trash);
}

// 儲存空間用量（0.98.21：原本「清除字庫 local 覆寫」的位置）：歌詞與設定在 localStorage（上限約 5 MB，滿了會存不進去）；
// 快照與垃圾桶在 IndexedDB（空間大很多）。只是估算：字元數 × 2 位元組
const LH_LS_LIMIT = 5 * 1024 * 1024;
const _lhBytes = n => n < 1024 * 1024 ? (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB' : (n / 1024 / 1024).toFixed(2) + ' MB';
async function lhStorageUse(snaps, trash) {
    const txt = document.getElementById('useText'), bar = document.getElementById('useBarLs');
    if (!txt) return;
    const ls = lhLocalBytes();
    let idb = 0;
    try {
        const blobs = await _lhSnapAll('blobs');
        idb = blobs.reduce((t, b) => t + b.d.length * 2, 0) + JSON.stringify(snaps || []).length * 2 + JSON.stringify(trash || []).length * 2;
    } catch (e) { lhWarn('計算快照空間失敗', e); }
    const pct = Math.min(100, ls / LH_LS_LIMIT * 100);
    if (bar) { bar.style.width = pct.toFixed(1) + '%'; bar.classList.toggle('warn', pct > 80); }
    txt.textContent = '歌詞與設定：' + _lhBytes(ls) + '（瀏覽器大約只給 5 MB，已用 ' + Math.round(pct) + '%' + (pct > 80 ? '，快滿了，建議匯出後清掉不要的歌' : '') + '）。快照與垃圾桶另外放在比較大的空間：' + _lhBytes(idb) + '。';
}

function _lhSnapCard(rec) {
    const li = _el('li', 'snap-card');
    li.dataset.id = rec.id;
    const head = _el('div', 'snap-head');
    const pick = _el('input', 'snap-pick');
    pick.type = 'checkbox';
    pick.checked = _data.pick.has(rec.id);
    pick.setAttribute('aria-label', '選這張來比對');
    pick.addEventListener('change', () => {
        if (pick.checked) {
            const first = [..._data.pick][0], other = first && document.querySelector('.snap-card[data-id="' + first + '"]');
            if (other && other.dataset.project !== rec.project) { pick.checked = false; showToast('只能比對同一個專案的快照'); return; }
            if (_data.pick.size >= 3) { pick.checked = false; showToast('最多比對 3 張'); return; }
            _data.pick.add(rec.id);
        } else _data.pick.delete(rec.id);
        _lhSnapSyncPick();
    });
    li.dataset.project = rec.project;
    const open = _btn('snap-open', '', '展開這張快照');
    open.setAttribute('aria-expanded', 'false');
    open.append(_el('span', 'snap-kind', LH_SNAP_KIND_N[rec.kind] || rec.kind), _el('span', 'snap-name', rec.projName),
        _el('span', 'snap-meta', rec.songs.length + ' 首 · ' + rec.chars.toLocaleString('zh-TW') + ' 字'), _el('span', 'snap-when', _lhSnapWhen(rec.at)));
    const del = _btn('snap-btn danger snap-del', '刪除', '刪除這張快照');
    del.addEventListener('click', () => lhSnapDelete(rec.id));
    head.append(pick, open, del);
    const body = _el('div', 'snap-body');
    body.hidden = true;
    open.addEventListener('click', async () => {
        body.hidden = !body.hidden;
        open.setAttribute('aria-expanded', String(!body.hidden));
        if (body.hidden || body.childElementCount) return;
        const all = _btn('snap-btn', '還原整個專案', '把整個專案還原到這張快照');
        all.addEventListener('click', () => lhSnapRestoreProject(rec.id));
        const ul = _el('ul', 'snap-songs');
        for (const e of rec.songs) {
            const row = _el('li', 'snap-song');
            const name = _btn('snap-song-name', '', '看「' + e.title + '」的歌詞');
            name.append(_el('span', '', e.title), _el('span', 'snap-meta', e.chars + ' 字'));
            const rs = _btn('snap-btn', '只還原這首', '只把「' + e.title + '」還原到這張快照');
            rs.addEventListener('click', () => lhSnapRestoreSong(rec.id, e.id));
            const pre = _el('pre', 'snap-lyrics');
            pre.hidden = true;
            name.addEventListener('click', async () => {
                if (!pre.textContent) { const s = await _lhSnapSong(rec, e.id); pre.textContent = s ? _lhSongLines(s).join('\n') : '（讀不到）'; }
                pre.hidden = !pre.hidden;
            });
            row.append(name, rs, pre);
            ul.append(row);
        }
        body.append(all, ul);
    });
    li.append(head, body);
    return li;
}

function _lhSnapSyncPick() {
    const b = document.getElementById('snapCompareBtn');
    if (b) { b.disabled = _data.pick.size < 2; b.textContent = '比對選取的快照（' + _data.pick.size + '/3）'; }
}

// ===== 三欄比對 =====
// 每一欄一張快照（舊的在左）。上面：歌曲順序（跟左邊那欄比：新增的、改過的標色，左邊有、這欄沒有的列在最後劃掉）；
// 點一首歌：下面三欄並排那首歌的歌詞，逐行比對——跟左欄比多出來的行標「新增」、跟右欄比被拿掉的行標「刪除」
function _lhLcsMarks(a, b) {   // 回傳 [a 每行是否保留, b 每行是否保留]
    const n = a.length, m = b.length, dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const ka = new Array(n).fill(false), kb = new Array(m).fill(false);
    for (let i = 0, j = 0; i < n && j < m;) { if (a[i] === b[j]) { ka[i] = kb[j] = true; i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++; }
    return [ka, kb];
}
async function lhSnapCompare() {
    const all = await _lhSnapAll('snaps');
    const recs = [..._data.pick].map(id => all.find(r => r.id === id)).filter(Boolean).sort((a, b) => a.at - b.at);
    if (recs.length < 2) return;
    document.getElementById('snapCmp')?.remove();
    const ov = _el('div', 'snap-cmp');
    ov.id = 'snapCmp';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', '比對快照');
    const close = () => { ov.remove(); document.removeEventListener('keydown', key, true); };
    const key = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
    document.addEventListener('keydown', key, true);
    const top = _el('div', 'snap-cmp-top');
    const x = _btn('snap-btn', '關閉', '關閉比對');
    x.addEventListener('click', close);
    top.append(_el('h3', '', '比對「' + recs[0].projName + '」的 ' + recs.length + ' 張快照'), x);
    const grid = _el('div', 'snap-cmp-grid');
    grid.style.setProperty('--n', recs.length);
    const lyr = _el('div', 'snap-cmp-grid snap-cmp-lyr');
    lyr.style.setProperty('--n', recs.length);
    let cur = null;
    const showSong = async id => {
        cur = id;
        grid.querySelectorAll('.snap-cmp-song').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
        const lines = await Promise.all(recs.map(async r => { const s = await _lhSnapSong(r, id); return s ? _lhSongLines(s) : null; }));
        if (cur !== id) return;
        lyr.replaceChildren(...lines.map((ls, i) => {
            const col = _el('div', 'snap-cmp-col');
            col.append(_el('div', 'snap-cmp-h', _lhSnapWhen(recs[i].at)));
            if (!ls) { col.append(_el('div', 'snap-cmp-none', '這張快照沒有這首歌')); return col; }
            const add = i > 0 && lines[i - 1] ? _lhLcsMarks(lines[i - 1], ls)[1] : null;
            const keepNext = i < lines.length - 1 && lines[i + 1] ? _lhLcsMarks(ls, lines[i + 1])[0] : null;
            ls.forEach((t, k) => {
                const row = _el('div', 'snap-ln' + (/^---.*---$/.test(t) ? ' sec' : '') + (add && !add[k] ? ' add' : '') + (keepNext && !keepNext[k] ? ' del' : ''), t || ' ');
                col.append(row);
            });
            return col;
        }));
    };
    grid.replaceChildren(...recs.map((r, i) => {
        const col = _el('div', 'snap-cmp-col');
        col.append(_el('div', 'snap-cmp-h', LH_SNAP_KIND_N[r.kind] + ' · ' + _lhSnapWhen(r.at)), _el('div', 'snap-meta', r.songs.length + ' 首 · ' + r.chars + ' 字'));
        const prev = recs[i - 1], ol = _el('ol', 'snap-cmp-order');
        for (const e of r.songs) {
            const pe = prev && prev.songs.find(x => x.id === e.id);
            const st = !prev ? '' : !pe ? ' add' : pe.h !== e.h ? ' chg' : '';
            const li = _el('li');
            const b = _btn('snap-cmp-song' + st, '', '比對「' + e.title + '」的歌詞');
            b.dataset.id = e.id;
            b.append(_el('span', '', e.title), _el('span', 'snap-meta', e.chars + ' 字' + (st === ' add' ? ' · 新增' : st === ' chg' ? ' · 改過' : '')));
            b.addEventListener('click', () => showSong(e.id));
            li.append(b);
            ol.append(li);
        }
        if (prev) for (const pe of prev.songs) if (!r.songs.some(e => e.id === pe.id)) { const li = _el('li', 'snap-cmp-gone', pe.title + '（這張沒有）'); ol.append(li); }
        col.append(ol);
        return col;
    }));
    ov.append(top, grid, _el('p', 'snap-hint', '點一首歌，下面並排比對歌詞：綠色＝比左邊那張多的行，紅色劃掉＝到右邊那張被拿掉的行'), lyr);
    document.body.append(ov);
    x.focus();
    const first = recs[recs.length - 1].songs[0];
    if (first) showSong(first.id);
}

// ===== 綁定（設定頁的元素在 index.html，這支載入時已經在） =====
{
    const r = document.getElementById('snapCfgRange');
    r?.addEventListener('input', () => {
        const min = LH_SNAP_STEPS[+r.value] ?? LH_SNAP_DEFAULT;
        lhSet('lh:snapCfg', String(min));
        document.getElementById('snapCfgCap').textContent = min ? '每 ' + min + ' 分鐘' : '關閉';
        r.setAttribute('aria-valuetext', min ? '每 ' + min + ' 分鐘' : '關閉');
    });
    document.getElementById('snapCompareBtn')?.addEventListener('click', lhSnapCompare);
    // 安全快照的整份還原：兩下確認（js/song-io.js restoreAutoBackup）
    document.getElementById('snapList')?.addEventListener('click', e => {
        const btn = e.target.closest && e.target.closest('.backup-restore-btn');
        if (!btn) return;
        if (btn.dataset.armed === '1') { clearTimeout(btn._armTimer); restoreAutoBackup(btn.dataset.backupId); return; }
        btn.dataset.armed = '1';
        btn.textContent = '再按一次確定還原（會先備份目前資料）';
        btn._armTimer = setTimeout(() => { delete btn.dataset.armed; btn.textContent = '整份還原'; }, 4000);
    });
}
