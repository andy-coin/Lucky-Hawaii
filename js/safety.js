// ==================== 儲存安全層 ====================
// 古典 script（無 import/export），在 index.html 的 head 載入，早於主程式。
// 所有 localStorage 存取都走這裡：鍵值有登記、寫入失敗看得見、讀取損毀不會整頁掛掉。

const LH_LOG_PREFIX = '[好韻器]';

// === 已知儲存鍵清單（備份與測試共用；D-13） ===
// 以 AST 掃描驗證過的 16 個固定鍵（CONTEXT 寫「約 17」，實際為 16）
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
    { key: 'savedPoolCollapsed', group: 'ui' }
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
    save: '存檔失敗：瀏覽器的儲存空間可能已滿，剛剛的修改可能沒有存下來。建議先按「匯出備份」存成檔案，再清掉不需要的舊資料。',
    backup: '資料備份沒有存成功：瀏覽器的儲存空間可能已滿。你的歌詞與設定沒有被更動，建議先按「匯出備份」存成檔案。',
    'migrate-failed': '資料升級失敗，已自動還原成升級前的內容，歌詞與設定都在。',
    'restore-failed': '資料升級失敗，而且自動還原沒有完整做完。請先按「匯出備份」存成檔案，並且不要清除網站資料；升級前的備份還留在瀏覽器裡。'
};
const _lhBannerShownAt = {};

function _lhBannerStyle() {
    if (document.getElementById('lhSafetyStyle')) return;
    const style = document.createElement('style');
    style.id = 'lhSafetyStyle';
    // 自帶樣式，之後 CSS 搬家也不會壞；顏色全用既有變數，晝夜都看得清楚
    style.textContent = [
        '.lh-save-banner { position: fixed; top: 12px; left: 50%; transform: translateX(-50%);',
        '  max-width: min(92vw, 560px); z-index: 10000; box-sizing: border-box;',
        '  background: var(--card-bg); color: var(--text-primary); border: 1px solid var(--border);',
        '  border-left: 4px solid #e53e3e; border-radius: 10px; padding: 12px 14px;',
        '  box-shadow: 0 4px 16px var(--shadow); font-size: 0.9rem; line-height: 1.5; }',
        '.lh-save-banner[hidden] { display: none; }',
        '.lh-save-banner-actions { display: flex; gap: 8px; margin-top: 8px; justify-content: flex-end; }',
        '.lh-save-banner button { font: inherit; cursor: pointer; padding: 4px 12px; border-radius: 6px;',
        '  background: var(--card-bg); color: var(--text-primary); border: 1px solid var(--border); }',
        '.lh-save-banner button:hover { border-color: #e53e3e; }'
    ].join('\n');
    document.head.appendChild(style);
}

function _lhBannerShow(text) {
    _lhBannerStyle();
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
        exportBtn.textContent = '匯出備份';
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
        document.body.appendChild(el);
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
                    recs.concat(rec).sort((a, b) => b.seq - a.seq).slice(LH_BACKUP_KEEP)
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
// 1 = 基準版本：所有 v0.96 鍵值維持原樣；缺 lh:schema 視為 1；Phase 8 多首歌是 1→2（D-14）
const LH_SCHEMA_TARGET = 1;
// 步驟格式 { to: N, run(store) }：同步執行、必須冪等、只能透過 store 碰清單內的鍵、任何失敗都要 throw
const LH_MIGRATIONS = [];

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

// Phase 8 的手動還原介面會呼叫這個；優先用 IndexedDB 的記錄，找不到才看 localStorage 那一份備援
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
    // localStorage 備援不含金鑰：還原時把目前的金鑰補進去，不然「清掉備份裡沒有的鍵」會把金鑰刪掉
    if (rec.secretsOmitted && rec.data && typeof rec.data === 'object') {
        const cur = lhSnapshot();
        const keep = Object.keys(cur).filter(k => LH_KEY_PREFIXES.some(p => p.secret && k.startsWith(p.prefix)));
        return lhRestore({ ...rec.data, ...Object.fromEntries(keep.map(k => [k, cur[k]])) });
    }
    return lhRestore(rec.data);
}

// 先備份才動手（D-12）；步驟依 to 由小到大、每步最多一次；任何例外都還原成升級前並提示（D-15）
async function lhMigrate(steps, target) {
    const prevSchema = lhGet('lh:schema');
    const cur = Number(prevSchema || 1);
    if (cur >= target) return { ran: 0 };
    const b = await lhBackup('pre-schema-' + target, '升級資料格式前的備份（目標版本 ' + target + '）', lhSnapshot());
    if (!b.ok) return { ran: 0, blocked: true };   // 備份橫幅 lhBackup 已跳；備份沒存成就一步都不跑
    // 還原用的快照要在備份 await 之後才拍：備份最久會等 5 秒，期間使用者的編輯不能被還原蓋掉。
    // ponytail: 主程式記憶體裡的資料仍是升級前格式；Phase 8 第一個真遷移上線前，主程式要改成先 await __hoyunSafetyReady 再讀取
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
        // 還原沒做完就不能說「歌詞與設定都在」，改提示去匯出備份
        lhSaveFailed(restored ? 'migrate-failed' : 'restore-failed');
        return { ran: 0, restored };
    }
}

// 絕不 reject；先確定有備份才把資料版本旗標 lh:schema 設成 '1'，再跑遷移（目前是空清單，等於不動作）
// 之後有改資料格式的程式，第一次讀取前必須先 await window.__hoyunSafetyReady
async function lhBootSafety() {
    try {
        const r = await lhBackup('baseline', '基準備份（這個版本第一次開啟時）', _lhBootSnapshot);
        if (r.ok && lhGet('lh:schema') === null) lhSet('lh:schema', '1');
        await lhMigrate(LH_MIGRATIONS, LH_SCHEMA_TARGET);
        return r;
    } catch (e) {
        lhWarn('開機備份流程失敗', e);
        return { ok: false, where: null, existed: false };
    }
}

// 測試用就緒訊號：只給自動測試等待用，程式邏輯不可依賴它
window.__hoyunSafetyReady = lhBootSafety();
