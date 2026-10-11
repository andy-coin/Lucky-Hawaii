// ==================== 儲存安全層 ====================
// 古典 script（無 import/export），在 index.html 的 head 載入，早於主程式。
// 所有 localStorage 存取都走這裡：鍵值有登記、寫入失敗看得見、讀取損毀不會整頁掛掉。

const LH_LOG_PREFIX = '[好韻器]';

// === 已知儲存鍵清單（備份與測試共用；D-13） ===
// 以 AST 掃描驗證過的 21 個固定鍵（Phase 5 加入 lh:uiScale，Phase 6 加入 lh:lexiconPack，Phase 8 加入 lh:songs / lh:activeSong / lh:songListOpen）
const LH_KEYS = [
    { key: 'haiku_lyrics', group: 'data' },
    { key: 'haiku_hashtags', group: 'data' },
    { key: 'haiku_savedwords', group: 'data' },
    { key: 'dictOverrides_v076', group: 'data' },
    { key: 'haoYunQi_inputMode', group: 'setting' },
    { key: 'selectedModel', group: 'setting' },
    { key: 'hoyun_theme_mode', group: 'setting' },
    { key: 'bgColor1', group: 'setting' },
    { key: 'containerBg', group: 'setting' },
    { key: 'textColor', group: 'setting' },
    { key: 'highlightColor', group: 'setting' },
    { key: 'recentPanelCollapsed', group: 'ui' },
    { key: 'leftPanelCollapsed', group: 'ui' },
    { key: 'rightPanelCollapsed', group: 'ui' },
    { key: 'contextSectionCollapsed', group: 'ui' },
    { key: 'savedPoolCollapsed', group: 'ui' },
    { key: 'lh:uiScale', group: 'ui' },
    { key: 'lh:lexiconPack', group: 'setting' },
    { key: 'lh:songs', group: 'data' },
    { key: 'lh:activeSong', group: 'data' },
    { key: 'lh:songListOpen', group: 'ui' }
];
// secret 旗標讓之後的匯出（Phase 8）可以排除金鑰
const LH_KEY_PREFIXES = [{ prefix: 'apiKey_', group: 'setting', secret: true }];
// 新鍵一律用 lh: 前綴；這兩個是中介資料，不備份
const LH_META_KEYS = ['lh:schema', 'lh:backup:ls'];
// 後台頁（admin/）與本站同網域，它的金鑰是機密，絕對不可被快照或備份（RESEARCH Pitfall 8）
const LH_EXCLUDED_KEYS = ['haoYunQi_admin_key', 'haoYunQi_admin_theme'];

// 讀到損毀 JSON 的鍵（啟動流程用來避免把「損毀後的預設值」誤當成使用者清空）
const LH_CORRUPT_KEYS = new Set();

// 背景、非關鍵錯誤只留主控台記錄（D-07）；呼叫端只傳鍵名與錯誤物件，不傳儲存的內容（apiKey 等）
function lhWarn(tag, err) {
    if (err === undefined || err === null) console.warn(LH_LOG_PREFIX + ' ' + tag);
    else console.warn(LH_LOG_PREFIX + ' ' + tag, err);
}

function lhIsKnownKey(key) {
    if (LH_EXCLUDED_KEYS.includes(key)) return false;
    if (LH_KEYS.some(k => k.key === key)) return true;
    if (LH_KEY_PREFIXES.some(p => key.startsWith(p.prefix))) return true;
    return LH_META_KEYS.includes(key);
}

// 清單外的鍵用 console.error 留記錄（冒煙測試會因此失敗），但不擋寫入——寧可存下也不丟使用者資料
function lhAssertKnownKey(key) {
    if (!lhIsKnownKey(key)) console.error(LH_LOG_PREFIX + ' 未登記的儲存鍵：' + key);
}

// === 安全讀寫 ===
function lhGet(key) {
    try { return localStorage.getItem(key); }
    catch (e) { lhWarn('讀取 ' + key + ' 失敗', e); return null; }
}

// 損毀的原始內容另存一份：呼叫端退回預設值後，下一次存檔會蓋掉原本的損毀字串，使用者就再也救不回來。
// 刻意不登記成已知鍵：不進快照、不被還原動到；寫入失敗只留記錄（再跳橫幅會干擾開機）
const LH_CORRUPT_STASH = 'lh:corrupt:';
function _lhStashCorrupt(key, raw) {
    try {
        const old = localStorage.getItem(LH_CORRUPT_STASH + key);
        if (old !== null && JSON.parse(old).raw === raw) return;   // 同一份損毀內容不重複寫
        localStorage.setItem(LH_CORRUPT_STASH + key, JSON.stringify({ savedAt: Date.now(), raw }));
    } catch (e) { lhWarn('保存 ' + key + ' 的損毀內容失敗', e); }
}

// 空值與沒存過都回預設值（等同舊的 `|| default`）；損毀的 JSON 回預設值並記錄，原始內容保留不動
// validate（選用）：JSON 合法但形狀不對（例如 'null'、'{}'、'5'）一樣當成損毀處理，不然呼叫端會在開機時丟例外
function lhGetJSON(key, fallback, validate) {
    const raw = lhGet(key);
    if (raw === null || raw === '') return fallback;
    try {
        const v = JSON.parse(raw);
        if (validate && !validate(v)) throw new TypeError('資料形狀不符');
        return v;
    } catch (e) {
        LH_CORRUPT_KEYS.add(key);
        _lhStashCorrupt(key, raw);
        lhWarn(key + ' 內容損毀，已改用預設值（原始內容保留不動）', e);
        return fallback;
    }
}

// 回傳 true/false；失敗一定顯示橫幅，絕不往外丟例外
function lhSet(key, value) {
    lhAssertKnownKey(key);
    try { localStorage.setItem(key, value); return true; }
    catch (e) {
        lhWarn('寫入 ' + key + ' 失敗', e);
        lhSaveFailed('save');
        return false;
    }
}

function lhRemove(key) {
    try { localStorage.removeItem(key); }
    catch (e) { lhWarn('移除 ' + key + ' 失敗', e); }
}

// === 存檔失敗橫幅（D-09） ===
const LH_BANNER_THROTTLE_MS = 60000;
const LH_BANNER_TEXT = {
    save: '存檔失敗：瀏覽器的儲存空間可能已滿，剛剛的修改可能沒有存下來。建議先按「備份全部」存成檔案，再清掉不需要的舊資料。',
    backup: '資料備份沒有存成功：瀏覽器的儲存空間可能已滿。你的歌詞與設定沒有被更動，建議先按「備份全部」存成檔案。',
    'migrate-failed': '資料升級失敗，已自動還原成升級前的內容，歌詞與設定都在。',
    'restore-failed': '資料升級失敗，而且自動還原沒有完整做完。請先按「備份全部」存成檔案，並且不要清除網站資料；升級前的備份還留在瀏覽器裡。'
};
const _lhBannerShownAt = {};

function _lhBannerShow(text) {
    let el = document.getElementById('lhSaveBanner');
    if (!el) {
        el = document.createElement('div');
        el.id = 'lhSaveBanner';
        el.className = 'lh-save-banner';
        el.setAttribute('role', 'alert');
        el.setAttribute('aria-live', 'assertive');
        const msg = document.createElement('div');
        msg.className = 'lh-save-banner-text';
        const actions = document.createElement('div');
        actions.className = 'lh-save-banner-actions';
        const exportBtn = document.createElement('button');
        exportBtn.type = 'button';
        exportBtn.className = 'lh-save-banner-export';
        exportBtn.textContent = '備份全部';
        exportBtn.addEventListener('click', () => {
            if (typeof exportSession === 'function') exportSession();
        });
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'lh-save-banner-close';
        closeBtn.textContent = '關閉';
        closeBtn.addEventListener('click', () => { el.hidden = true; });
        actions.append(exportBtn, closeBtn);
        el.append(msg, actions);
        // 排在 .container 最上方、把內容往下推，不蓋住搜尋框與按鈕（D-05）；
        // .container 還沒生出來就先固定顯示（自帶最小樣式），DOMContentLoaded 再搬進去
        const container = document.querySelector('.container');
        if (container) container.prepend(el);
        else {
            el.classList.add('lh-save-banner--fixed');
            el.style.cssText = 'position:fixed;top:12px;left:12px;right:12px;z-index:10000;box-sizing:border-box;'
                + 'background:var(--card-bg);color:var(--text-primary);border-left:4px solid #e53e3e;padding:12px 14px;';
            document.body.appendChild(el);
            document.addEventListener('DOMContentLoaded', () => {
                const c = document.querySelector('.container');
                if (!c) return;
                el.classList.remove('lh-save-banner--fixed');
                el.removeAttribute('style');
                c.prepend(el);
            }, { once: true });
        }
    }
    el.querySelector('.lh-save-banner-text').textContent = text;
    el.hidden = false;
}

// 同一種 kind 在節流視窗內只顯示一次（從顯示當下起算，中途關掉也一樣）
function lhSaveFailed(kind) {
    const k = LH_BANNER_TEXT[kind] ? kind : 'save';
    const now = Date.now();
    if (_lhBannerShownAt[k] !== undefined && now - _lhBannerShownAt[k] < LH_BANNER_THROTTLE_MS) return;
    _lhBannerShownAt[k] = now;
    if (document.body) { _lhBannerShow(LH_BANNER_TEXT[k]); return; }
    // body 還沒生出來（例如 head 階段就寫入）→ 等 DOM 好了再顯示一次
    document.addEventListener('DOMContentLoaded', () => _lhBannerShow(LH_BANNER_TEXT[k]), { once: true });
}

// ===== IndexedDB（詞庫快取 wl ＋ 備份 backups 共用同一個開啟入口）=====
// 兩個地方各自 open 不同版本會互相打架（RESEARCH Pitfall 3），所以全站只有這一個入口
const LH_IDB_TIMEOUT_MS = 5000;
let _lhDbP = null;

function lhIdbOpen() {
    if (_lhDbP) return _lhDbP;
    const p = new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined' || !indexedDB) return reject(new Error('IndexedDB 不可用'));
        let timedOut = false;
        // 舊分頁還抓著 v1 連線時，v2 的 open 會永遠卡住；等 5 秒就放棄，讓詞庫改走網路
        const timer = setTimeout(() => {
            timedOut = true;
            reject(new Error('IndexedDB 升級逾時（可能被舊分頁擋住）'));
        }, LH_IDB_TIMEOUT_MS);
        try {
            const req = indexedDB.open('haoYunQi', 2);
            req.onupgradeneeded = () => {
                // 舊使用者已經有 wl，絕對不能無條件重建（會 ConstraintError，也會丟掉詞庫快取）
                const db = req.result;
                if (!db.objectStoreNames.contains('wl')) db.createObjectStore('wl', { keyPath: 'k' });
                if (!db.objectStoreNames.contains('backups')) db.createObjectStore('backups', { keyPath: 'id' });
            };
            req.onblocked = () => lhWarn('IndexedDB 升級被其他分頁擋住，請關閉舊的好韻器分頁');
            req.onsuccess = () => {
                const db = req.result;
                clearTimeout(timer);
                if (timedOut) { db.close(); return; }   // 已經放棄了，不要留一條沒人用的連線擋住以後的升級
                // 以後別的分頁要升級時，本分頁主動讓路
                db.onversionchange = () => { db.close(); if (_lhDbP === p) _lhDbP = null; };
                resolve(db);
            };
            req.onerror = () => { clearTimeout(timer); reject(req.error); };
        } catch (e) { clearTimeout(timer); reject(e); }
    });
    _lhDbP = p;
    p.catch(e => { if (_lhDbP === p) _lhDbP = null; lhWarn('IndexedDB 開啟失敗', e); });   // 失敗後下次呼叫可重試
    return p;
}

// ===== 備份 =====
// 備份記錄格式 { id, seq, label, createdAt, appVersion, schema, data }，之後的遷移與還原都讀這個形狀（D-11、D-12）
const LH_APP_VERSION = '0.96';
const LH_BACKUP_KEEP = 3;
// 基準備份與升級前的安全副本釘住，淘汰永遠不碰（F1）：刪歌、匯入產生的自動備份再多，也擠不掉升級前那份
const _lhPinnedBackup = id => id === 'baseline' || (typeof id === 'string' && id.startsWith('pre-schema-'));

// 只收清單內的鍵與已登記前綴的鍵（D-13）：不收中介資料、後台金鑰、同網域其他專案的鍵
function lhSnapshot() {
    const snap = {};
    let keys = [];
    try {
        for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    } catch (e) { lhWarn('列舉儲存鍵失敗', e); return snap; }
    for (const key of keys) {
        if (key === null || LH_EXCLUDED_KEYS.includes(key) || LH_META_KEYS.includes(key)) continue;
        if (!LH_KEYS.some(k => k.key === key) && !LH_KEY_PREFIXES.some(p => key.startsWith(p.prefix))) continue;
        try { snap[key] = localStorage.getItem(key); }
        catch (e) { lhWarn('讀取 ' + key + ' 失敗', e); }
    }
    return snap;
}

// 必須在載入當下、主程式 script 執行之前同步拍下：主程式開機時會讀取、甚至刪除 haiku_hashtags（RESEARCH Pitfall 4）
const _lhBootSnapshot = lhSnapshot();

function _lhBuildRecord(id, seq, label, snap) {
    return {
        id, seq, label, createdAt: Date.now(), appVersion: LH_APP_VERSION,
        schema: Number(lhGet('lh:schema') || 1), data: snap
    };
}

// localStorage 單份備援（D-11）：同 id 已存在就不動；直接寫 storage 物件而不走 lhSet，
// 因為這裡失敗要跳「備份」橫幅，不是「存檔」橫幅
// 備援跟使用者自己的歌詞共用同一個約 5MB 的額度：金鑰不放進備援（不要多一份明文），
// 太大就不存（寧可跳備份橫幅，也不要把使用者自己的存檔擠爆）
const LH_LS_BACKUP_MAX_CHARS = 500000;
function _lhBackupToLocal(record) {
    try {
        const old = localStorage.getItem('lh:backup:ls');
        if (old !== null && JSON.parse(old).id === record.id) return true;
    } catch (e) { lhWarn('讀取 lh:backup:ls 失敗，將覆寫', e); }
    const data = {};
    for (const [k, v] of Object.entries(record.data)) {
        if (!LH_KEY_PREFIXES.some(p => p.secret && k.startsWith(p.prefix))) data[k] = v;
    }
    const json = JSON.stringify({ ...record, data, secretsOmitted: true });
    if (json.length > LH_LS_BACKUP_MAX_CHARS) { lhWarn('備援備份太大，不寫入 localStorage（' + json.length + ' 字元）'); return false; }
    try { localStorage.setItem('lh:backup:ls', json); return true; }
    catch (e) { lhWarn('備份寫入 localStorage 失敗', e); return false; }
}

// 回傳 { ok, where: 'idb' | 'ls' | null, existed }
function lhBackup(id, label, snap) {
    return lhIdbOpen().then(db => new Promise(resolve => {
        let settled = false;
        let existed = false;
        // IndexedDB 寫入失敗：跳橫幅（O-2），同時改存 localStorage 一份（D-11）
        const fail = e => {
            if (settled) return;
            settled = true;
            lhWarn('備份寫入 IndexedDB 失敗', e);
            lhSaveFailed('backup');
            const okLocal = _lhBackupToLocal(_lhBuildRecord(id, 0, label, snap));
            resolve({ ok: okLocal, where: okLocal ? 'ls' : null, existed: false });
        };
        try {
            const tx = db.transaction('backups', 'readwrite');
            const store = tx.objectStore('backups');
            const all = store.getAll();
            all.onsuccess = () => {
                try {
                    const recs = all.result;
                    // 同一個 id 已存在就不動它：當機重跑也不會把原始備份換成改到一半的狀態
                    if (recs.some(r => r.id === id)) { existed = true; return; }
                    // 依「寫入順序」編號與淘汰，不用 createdAt（同一毫秒會平手）
                    const rec = _lhBuildRecord(id, recs.reduce((m, r) => Math.max(m, r.seq || 0), 0) + 1, label, snap);
                    store.put(rec);
                    recs.concat(rec).filter(r => !_lhPinnedBackup(r.id)).sort((a, b) => b.seq - a.seq).slice(LH_BACKUP_KEEP)
                        .forEach(r => store.delete(r.id));
                } catch (e) { fail(e); try { tx.abort(); } catch (e2) { lhWarn('備份交易中止失敗', e2); } }
            };
            tx.oncomplete = () => { if (settled) return; settled = true; resolve({ ok: true, where: 'idb', existed }); };
            tx.onerror = e => fail(tx.error || e.target.error);
            tx.onabort = () => fail(tx.error);
        } catch (e) { fail(e); }
    }), e => {
        // IndexedDB 根本不能用（不存在、被舊分頁擋住或逾時）：照 D-11 改存 localStorage，只留記錄、不跳橫幅
        lhWarn('IndexedDB 不可用，備份改存在 localStorage（只保留一份）', e);
        const okLocal = _lhBackupToLocal(_lhBuildRecord(id, 0, label, snap));
        if (!okLocal) lhSaveFailed('backup');
        return { ok: okLocal, where: okLocal ? 'ls' : null, existed: false };
    });
}

// 依 seq 由舊到新；IndexedDB 讀不到時回 localStorage 那一份（沒有就是 []）
function lhListBackups() {
    return lhIdbOpen().then(db => new Promise((resolve, reject) => {
        const req = db.transaction('backups', 'readonly').objectStore('backups').getAll();
        req.onsuccess = () => resolve(req.result.sort((a, b) => a.seq - b.seq));
        req.onerror = () => reject(req.error);
    })).catch(e => {
        lhWarn('讀取備份清單失敗', e);
        try {
            const raw = localStorage.getItem('lh:backup:ls');
            return raw === null ? [] : [JSON.parse(raw)];
        } catch (e2) { lhWarn('讀取 lh:backup:ls 失敗', e2); return []; }
    });
}

// ===== 資料格式遷移 =====
// 1 = 基準版本：所有 v0.96 鍵值維持原樣；缺 lh:schema 視為 1
// 2 = 多首歌（Phase 8）：舊的單首歌詞複製成 lh:songs 的第一首，舊鍵 haiku_lyrics / haiku_hashtags 原封不動留著（降級與還原要讀）
const LH_SCHEMA_TARGET = 2;
// 步驟格式 { to: N, run(store) }：同步執行、必須冪等、只能透過 store 碰清單內的鍵、任何失敗都要 throw
const LH_MIGRATIONS = [];

// 歌曲與區塊的 id：只允許安全字元（之後會當 DOM id、檔名片段用）
const LH_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

// 新的歌曲／區塊 id；不用 crypto.randomUUID（區網 http 測試等非安全環境沒有它）；備份匯入（08-07）也要用，所以放在這裡
function lhNewId(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// 與 js/state.js 讀舊歌詞用的驗證相同
function _lhLegacySectionsOk(v) {
    return Array.isArray(v) && v.length > 0 && v.every(s => s && typeof s === 'object' && (s.text === undefined || typeof s.text === 'string'));
}

// lh:songs 的形狀檢查：陣列，每首有合法 id 與 sections 陣列；空陣列也算合法（使用者可能刪光）
function lhSongsOk(v) {
    return Array.isArray(v) && v.every(s => s && typeof s === 'object' && typeof s.id === 'string' && LH_ID_RE.test(s.id) && Array.isArray(s.sections));
}

// 把 v0.96 的單首歌詞轉成新格式的一首歌；固定 id 'song-migrated' 讓重跑變成什麼都不做（冪等）
// 舊歌詞缺或損毀（lhGetJSON 會把損毀原文另存到 lh:corrupt:haiku_lyrics）就給一個空區塊
function lhSongFromLegacy() {
    const legacy = lhGetJSON('haiku_lyrics', null, _lhLegacySectionsOk) || [{ label: '', text: '' }];
    const now = Date.now();
    return {
        id: 'song-migrated',
        title: '我的第一首歌',
        sections: legacy.map((s, i) => ({ id: 'sec-m' + i, label: String(s.label ?? ''), text: String(s.text ?? ''), collapsed: !!s.collapsed })),
        hashtags: lhGetJSON('haiku_hashtags', [], Array.isArray).filter(t => typeof t === 'string'),
        context: '',
        createdAt: now,
        updatedAt: now
    };
}

// 1→2：已有合法的 lh:songs（上次寫完就當機、或另一個分頁已做完）就保留，只補 lh:activeSong；絕不寫舊鍵
LH_MIGRATIONS.push({
    to: 2,
    run(store) {
        let songs = lhGetJSON('lh:songs', null, lhSongsOk);
        if (!songs || songs.length === 0) {
            songs = [lhSongFromLegacy()];
            store.set('lh:songs', JSON.stringify(songs));
        }
        if (!songs.some(s => s.id === store.get('lh:activeSong'))) store.set('lh:activeSong', songs[0].id);
    }
});

// 還原只動清單內的鍵：不含 lh: 中介資料、後台金鑰與同網域其他專案的鍵
function _lhRestorable(key) {
    return lhIsKnownKey(key) && !LH_META_KEYS.includes(key);
}

// 把 snap（{ 鍵: 原始字串 }）寫回儲存空間；snap 來自可能被竄改的備份記錄，所以逐項驗證（V5）
// 回傳 true/false；snap 不是物件時完全不動資料
function lhRestore(snap) {
    if (snap === null || typeof snap !== 'object' || Array.isArray(snap)) {
        lhWarn('還原內容不是物件，沒有動任何資料');
        return false;
    }
    try {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
        // 先寫後刪：中途寫入失敗時，頂多多留幾個鍵，不會變成「該有的鍵被刪了又沒寫回」
        for (const [k, v] of Object.entries(snap)) {
            if (_lhRestorable(k) && typeof v === 'string') localStorage.setItem(k, v);
            else lhWarn('還原時略過不合法的項目：' + k);   // 只記鍵名，不記內容
        }
        // 備份裡沒有的清單內鍵要清掉（例如失敗的遷移新增的鍵）
        for (const k of keys) {
            if (k !== null && _lhRestorable(k) && !Object.prototype.hasOwnProperty.call(snap, k)) localStorage.removeItem(k);
        }
        return true;
    } catch (e) {
        lhWarn('還原失敗', e);
        lhSaveFailed('save');
        return false;
    }
}

// 設定頁的「自動備份」清單會呼叫這個；優先用 IndexedDB 的記錄，找不到才看 localStorage 那一份備援
// 還原成功後 lh:schema 也要退回備份當時的版本：不退的話，還原升級前的備份後資料版本仍是 2，遷移不會重跑，開機會看到空白（F1，RESEARCH Pitfall 10）
async function lhRestoreFromBackup(id) {
    let rec = (await lhListBackups()).find(r => r && r.id === id);
    if (!rec) {
        try {
            const raw = localStorage.getItem('lh:backup:ls');
            const ls = raw === null ? null : JSON.parse(raw);
            if (ls && ls.id === id) rec = ls;
        } catch (e) { lhWarn('讀取 lh:backup:ls 失敗', e); }
    }
    if (!rec) return false;
    let ok;
    // localStorage 備援不含金鑰：還原時把目前的金鑰補進去，不然「清掉備份裡沒有的鍵」會把金鑰刪掉
    if (rec.secretsOmitted && rec.data && typeof rec.data === 'object') {
        const cur = lhSnapshot();
        const keep = Object.keys(cur).filter(k => LH_KEY_PREFIXES.some(p => p.secret && k.startsWith(p.prefix)));
        ok = lhRestore({ ...rec.data, ...Object.fromEntries(keep.map(k => [k, cur[k]])) });
    } else ok = lhRestore(rec.data);
    if (ok) {
        try { localStorage.setItem('lh:schema', String(rec.schema || 1)); }   // 中介資料鍵，lhRestore 不會動它
        catch (e) { lhWarn('寫入 lh:schema 失敗', e); }
    }
    return ok;
}

// ===== 備份檔 v2（Phase 8，EDIT-09）=====
// 備份檔可能是別人給的、被改過的：先整理乾淨（lhParseBackup）才顯示、才寫入；動態鍵的迴圈都集中在這個檔案
const LH_BACKUP_FORMAT = 'lucky-hawaii-backup';
const LH_BACKUP_VERSION = 2;
const LH_BACKUP_MAX_BYTES = 5 * 1024 * 1024;
// 上限要比編輯器實際能存的還寬：編輯器自己沒有段數、標籤長度、情境長度的限制，備份檔本身又有 5 MB 的總量限制（WR-02）。
// 歌名是例外，編輯器本來就限 60 字。真的超過時 stats.truncated 會讓匯入視窗明講，不會默默截短
const LH_IMPORT_CAPS = { songs: 5000, title: 60, sections: 2000, label: 200, text: 1000000, tags: 200, tag: 100, context: 100000, words: 20000, word: 100, setting: 1000000 };
// 設定值的形狀：app 自己會寫的值才收，壞值開機時會讓畫面壞掉（顏色反轉成 NaN 等）；沒列在這裡的設定只看長度
const LH_SETTING_SHAPES = {
    haoYunQi_inputMode: /^(auto|zhuyin|pinyin)$/,
    hoyun_theme_mode: /^(light|dark)$/,
    bgColor1: /^#[0-9a-fA-F]{6}$/,
    containerBg: /^#[0-9a-fA-F]{6}$/,
    textColor: /^#[0-9a-fA-F]{6}$/,
    highlightColor: /^#[0-9a-fA-F]{6}$/,
    'lh:lexiconPack': /^[a-z0-9-]{1,32}$/,
    selectedModel: /^[^\n\r]{0,200}$/
};

// 依字元（不是 UTF-16 單位）截斷，不把一個字切半；stats（選用）記下有沒有真的截掉東西
function _lhCut(s, n, stats) {
    if (s.length <= n) return s;
    const cut = Array.from(s);
    if (cut.length <= n) return s;
    if (stats) stats.truncated = true;
    return cut.slice(0, n).join('');
}

// 備份檔會帶的設定鍵：登記為 setting 的鍵加上字庫覆寫；機密前綴（apiKey_）與後台金鑰從來不在清單裡，所以不可能進來
function _lhBackupSettingKeys() {
    return LH_KEYS.filter(k => k.group === 'setting' || k.key === 'dictOverrides_v076').map(k => k.key);
}

// 從檔案的 settings 取一個登記過的鍵：只用登記的鍵名查（絕不走訪檔案自己的鍵，__proto__ 才不會被當成設定），
// 必須是自己的屬性、字串、長度與形狀都合格；不合格回 undefined
function _lhSettingFrom(src, key) {
    if (!src || typeof src !== 'object' || !Object.prototype.hasOwnProperty.call(src, key)) return undefined;
    const v = src[key];
    if (typeof v !== 'string' || v.length > LH_IMPORT_CAPS.setting) return undefined;
    if (LH_SETTING_SHAPES[key] && !LH_SETTING_SHAPES[key].test(v)) return undefined;
    if (key === 'dictOverrides_v076') {
        try {
            const o = JSON.parse(v);
            if (!o || typeof o !== 'object' || Array.isArray(o)) return undefined;
            return JSON.stringify(lhCleanDictOverrides(o).clean);
        } catch (e) { lhWarn('備份檔裡的字庫覆寫不是合法 JSON，略過', e); return undefined; }
    }
    return v;
}

// 字庫覆寫（dictOverrides_v076）只收「注音＋聲調數字」的鍵與字串值（CR-01）。
// 備份檔與瀏覽器裡的存檔都可能被改過；壞項目留到 buildIndex 才丟例外，整個 init 就停了。
// 回傳 { clean, dropped }：clean 是沒有原型的乾淨物件；__proto__ 等鍵不符合格式，一律被擋
const LH_DICT_KEY_RE = /^[ㄅ-ㄩ]{1,8}[1-5]$/;
const LH_DICT_VALUE_MAX = 20000;
function lhCleanDictOverrides(o) {
    const clean = Object.create(null);
    let dropped = 0;
    for (const k of Object.keys(o)) {
        const val = o[k];
        if (LH_DICT_KEY_RE.test(k) && typeof val === 'string' && val.length <= LH_DICT_VALUE_MAX) clean[k] = val;
        else dropped++;
    }
    return { clean, dropped };
}

// 保留池：字串、每個最多 50 字、去重、最多 5000 個
function _lhNormalizeWords(arr, stats) {
    const out = [];
    const seen = new Set();
    for (const w of Array.isArray(arr) ? arr : []) {
        if (typeof w !== 'string' || !w || seen.has(w)) continue;
        if (w.length > LH_IMPORT_CAPS.word) { if (stats) stats.truncated = true; continue; }
        seen.add(w);
        out.push(w);
        if (out.length >= LH_IMPORT_CAPS.words) { if (stats && arr.length > out.length) stats.truncated = true; break; }
    }
    return out;
}

// 把一首不可信的歌整理成乾淨的形狀；不是物件就回 null。takenIds：已經用掉的歌曲 id（Set），新 id 會加進去
// stats（選用）：{ truncated } 有內容被上限截掉時設成 true
function lhNormalizeSong(raw, takenIds, stats) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const pickId = (v, prefix, taken) => {
        let id = typeof v === 'string' && LH_ID_RE.test(v) && !taken.has(v) ? v : lhNewId(prefix);
        while (taken.has(id)) id = lhNewId(prefix);
        taken.add(id);
        return id;
    };
    const taken = takenIds || new Set();
    const id = pickId(raw.id, 'song-', taken);
    const title = _lhCut(typeof raw.title === 'string' ? raw.title.trim() : '', LH_IMPORT_CAPS.title, stats).trim() || '未命名歌曲';
    const secIds = new Set();
    const validSecs = (Array.isArray(raw.sections) ? raw.sections : []).filter(s => s && typeof s === 'object');
    if (stats && validSecs.length > LH_IMPORT_CAPS.sections) stats.truncated = true;
    const sections = validSecs
        .slice(0, LH_IMPORT_CAPS.sections)
        .map(s => ({
            id: pickId(s.id, 'sec-', secIds),
            label: typeof s.label === 'string' ? _lhCut(s.label, LH_IMPORT_CAPS.label, stats) : '',
            text: typeof s.text === 'string' ? _lhCut(s.text, LH_IMPORT_CAPS.text, stats) : '',
            collapsed: !!s.collapsed
        }));
    if (sections.length === 0) sections.push({ id: pickId(null, 'sec-', secIds), label: '', text: '', collapsed: false });
    const seenTag = new Set();
    const hashtags = [];
    for (const t of Array.isArray(raw.hashtags) ? raw.hashtags : []) {
        if (typeof t !== 'string') continue;
        const tag = _lhCut(t.trim(), LH_IMPORT_CAPS.tag, stats);
        if (!tag || seenTag.has(tag)) continue;
        seenTag.add(tag);
        hashtags.push(tag);
        if (hashtags.length >= LH_IMPORT_CAPS.tags) { if (stats && raw.hashtags.length > hashtags.length) stats.truncated = true; break; }
    }
    const createdAt = Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now();
    return {
        id, title, sections, hashtags,
        context: typeof raw.context === 'string' ? _lhCut(raw.context, LH_IMPORT_CAPS.context, stats) : '',
        createdAt,
        updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : createdAt
    };
}

// 讀備份檔的文字，回傳：
//   { ok: false, error: 'notjson' | 'format' | 'version' | 'nosongs', version }
//   { ok: true, kind: 'v2', songs, activeSong, savedWords, settings, exportedAt, truncated }
//   { ok: true, kind: 'v1', song, savedWords, sectionCount, truncated }   舊版 SAVE 檔：一首歌加保留池
// truncated：有內容超過上限而被截短（匯入視窗會先告訴使用者，WR-02）
// 全部整理過才回傳；呼叫端在 ok 之前不碰任何資料
function lhParseBackup(text) {
    let d;
    try { d = JSON.parse(text); }
    catch (e) { lhWarn('備份檔不是有效的 JSON', e); return { ok: false, error: 'notjson' }; }
    if (!d || typeof d !== 'object' || Array.isArray(d)) return { ok: false, error: 'format' };
    const has = k => Object.prototype.hasOwnProperty.call(d, k);
    if (has('format')) {
        if (d.format !== LH_BACKUP_FORMAT || !Number.isInteger(d.version) || d.version < 1) return { ok: false, error: 'format' };
        if (d.version > LH_BACKUP_VERSION) return { ok: false, error: 'version', version: d.version };
        const taken = new Set();
        const stats = { truncated: false };
        if (Array.isArray(d.songs) && d.songs.length > LH_IMPORT_CAPS.songs) stats.truncated = true;
        const songs = (Array.isArray(d.songs) ? d.songs.slice(0, LH_IMPORT_CAPS.songs) : [])
            .map(s => lhNormalizeSong(s, taken, stats)).filter(Boolean);
        if (songs.length === 0) return { ok: false, error: 'nosongs' };
        const settings = {};
        for (const key of _lhBackupSettingKeys()) {
            const v = _lhSettingFrom(d.settings, key);
            if (v !== undefined) settings[key] = v;
        }
        return {
            ok: true, kind: 'v2', songs,
            activeSong: typeof d.activeSong === 'string' && songs.some(s => s.id === d.activeSong) ? d.activeSong : null,
            savedWords: _lhNormalizeWords(d.savedWords, stats),
            settings,
            exportedAt: typeof d.exportedAt === 'string' ? d.exportedAt : '',
            truncated: stats.truncated
        };
    }
    if (Array.isArray(d.lyricsSections)) {
        const stats = { truncated: false };
        const song = lhNormalizeSong({
            title: '匯入的歌曲',
            sections: d.lyricsSections,
            hashtags: d.hashtags,
            context: d.contextDescription
        }, undefined, stats);
        return { ok: true, kind: 'v1', song, savedWords: _lhNormalizeWords(d.savedWords, stats), sectionCount: Math.min(d.lyricsSections.length, LH_IMPORT_CAPS.sections), truncated: stats.truncated };
    }
    return { ok: false, error: 'format' };
}

// 組備份檔物件。settings 只從登記的設定鍵來；apiKey_ 前綴與後台金鑰不會被走訪到，所以不可能外流（F11）
function lhBuildBackup(songsArr, activeId, words) {
    const snap = lhSnapshot();
    const settings = {};
    for (const key of _lhBackupSettingKeys()) {
        if (typeof snap[key] === 'string') settings[key] = snap[key];
    }
    return {
        format: LH_BACKUP_FORMAT,
        version: LH_BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        songs: songsArr,
        activeSong: activeId,
        savedWords: words,
        settings
    };
}

// 全部還原：先把目前資料自動備份，備份存不下來就一個字都不寫；寫到一半有任何一項失敗就退回匯入前的快照。
// 回傳 { ok: true } 或 { ok: false, stage: 'backup' | 'write' }
async function lhApplyBackupReplace(parsed) {
    const pre = lhSnapshot();
    const b = await lhBackup('import-replace-' + Date.now(), '匯入備份前的自動備份', pre);
    if (!b.ok) return { ok: false, stage: 'backup' };
    let wrote = 0;
    let ok = true;
    const put = (key, value) => {
        if (!ok) return;
        if (lhSet(key, value)) wrote++;
        else ok = false;
    };
    // 最大的 lh:songs 先寫：它失敗時什麼都還沒動
    put('lh:songs', JSON.stringify(parsed.songs));
    const active = parsed.songs.find(s => s.id === parsed.activeSong) || parsed.songs.reduce((a, c) => (c.createdAt > a.createdAt ? c : a));
    put('lh:activeSong', active.id);
    put('haiku_savedwords', JSON.stringify(parsed.savedWords));
    // 設定以備份檔為準：檔案裡有的寫入，沒有的清掉，還原後才和來源一樣
    for (const key of _lhBackupSettingKeys()) {
        if (Object.prototype.hasOwnProperty.call(parsed.settings, key)) put(key, parsed.settings[key]);
        else if (ok) lhRemove(key);
    }
    // 資料格式旗標要是 2，重新載入後才會讀 lh:songs（備份被擋住的舊版單首模式可能還停在 1）
    if (ok && lhGet('lh:schema') !== '2') {
        try { localStorage.setItem('lh:schema', '2'); wrote++; }
        catch (e) { lhWarn('寫入 lh:schema 失敗', e); lhSaveFailed('save'); ok = false; }
    }
    if (!ok) {
        if (wrote > 0) lhRestore(pre);   // 一項都沒寫成就沒有東西要退回
        return { ok: false, stage: 'write' };
    }
    return { ok: true };
}

// 先備份才動手（D-12）；步驟依 to 由小到大、每步最多一次；任何例外都還原成升級前並提示（D-15）
async function lhMigrate(steps, target) {
    const prevSchema = lhGet('lh:schema');
    const cur = Number(prevSchema || 1);
    if (cur >= target) return { ran: 0 };
    const b = await lhBackup('pre-schema-' + target, '升級資料格式前的備份（目標版本 ' + target + '）', lhSnapshot());
    if (!b.ok) return { ran: 0, blocked: true };   // 備份橫幅 lhBackup 已跳；備份沒存成就一步都不跑
    // 還原用的快照要在備份 await 之後才拍：備份最久會等 5 秒，期間使用者的編輯不能被還原蓋掉。
    // ponytail: 主程式記憶體裡的資料仍是升級前格式；編輯器改讀 lh:songs 的 plan（08-02）上線前，主程式要改成先 await __hoyunSafetyReady 再讀取
    const snap = lhSnapshot();
    const guard = k => { if (!_lhRestorable(k)) throw new Error('遷移不可寫入未登記的鍵：' + k); };
    // 直接寫 storage 物件：寫入失敗要 throw 讓遷移中止，不能像 lhSet 那樣吞掉
    const store = {
        get: k => lhGet(k),
        set: (k, v) => { guard(k); localStorage.setItem(k, v); },
        remove: k => { guard(k); localStorage.removeItem(k); }
    };
    let ran = 0;
    try {
        for (const s of steps.filter(s => s.to > cur && s.to <= target).sort((a, c) => a.to - c.to)) {
            s.run(store);
            localStorage.setItem('lh:schema', String(s.to));   // 每步完成才翻旗標
            ran++;
        }
        return { ran };
    } catch (e) {
        lhWarn('資料升級失敗，嘗試還原成升級前', e);
        let restored = lhRestore(snap);
        try {
            if (prevSchema === null) localStorage.removeItem('lh:schema'); else localStorage.setItem('lh:schema', prevSchema);
        } catch (e2) { lhWarn('還原 lh:schema 失敗', e2); restored = false; }
        // 還原沒做完就不能說「歌詞與設定都在」，改提示去按「備份全部」
        lhSaveFailed(restored ? 'migrate-failed' : 'restore-failed');
        return { ran: 0, restored };
    }
}

// 絕不 reject；先確定有備份才把資料版本旗標 lh:schema 設成 '1'，再跑遷移（1→2 會先存 'pre-schema-2' 備份）
// 之後有改資料格式的程式，第一次讀取前必須先 await window.__hoyunSafetyReady
async function lhBootSafety() {
    try {
        const r = await lhBackup('baseline', '基準備份（這個版本第一次開啟時）', _lhBootSnapshot);
        if (r.ok && lhGet('lh:schema') === null) lhSet('lh:schema', '1');
        const m = await lhMigrate(LH_MIGRATIONS, LH_SCHEMA_TARGET);
        window.__lhMigrated = !!(m && m.ran > 0);   // 只有這一頁真的跑了升級；之後給「已升級」提示用
        return r;
    } catch (e) {
        lhWarn('開機備份流程失敗', e);
        return { ok: false, where: null, existed: false };
    }
}

// 測試用就緒訊號：只給自動測試等待用，程式邏輯不可依賴它
window.__hoyunSafetyReady = lhBootSafety();
