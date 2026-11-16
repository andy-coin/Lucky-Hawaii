// ==================== 自訂詞彙（0.98.05） ====================
// 使用者自己加的專有名詞（音樂劇角色、招式、品牌、店名、調酒…）：和詞庫一起被詞卡、星雲、關聯詞彙索引（js/word-space.js lhCwMerge）。
// 每筆 { id, w: 詞（2–6 個漢字）, z: 注音（每字一節、空白分開、帶聲調）, s: 'g'＝整個專案 或 歌曲 id（只在那首歌顯示）, p: 專案 id（0.98.21；缺＝預設專案）, at }。
// 存在 lh:customWords；壞的筆數讀入時丟掉。設定 →「查詢與詞庫」裡管理：新增、改讀音、勾選批次刪除、重設全部。
// 詞與讀音一律 textContent／value，不拼 HTML。

const LH_CW_KEY = 'lh:customWords';
const LH_CW_MAX = 2000;
const LH_CW_WORD_RE = /^[一-鿿]{2,6}$/;
const LH_CW_SYL_RE = /^[ㄅ-ㄩ]{1,4}[ˊˇˋ˙]?$/;

function _lhCwValidZ(w, z) {
    const syl = String(z || '').trim().split(/\s+/);
    return syl.length === [...w].length && syl.every(s => LH_CW_SYL_RE.test(s));
}
function _lhCwClean(list) {
    const out = [], seen = new Set();
    for (const x of Array.isArray(list) ? list : []) {
        if (!x || typeof x.w !== 'string' || !LH_CW_WORD_RE.test(x.w) || !_lhCwValidZ(x.w, x.z)) continue;
        const s = x.s === 'g' || (typeof x.s === 'string' && /^[\w-]{1,64}$/.test(x.s)) ? x.s : 'g';
        const p = typeof x.p === 'string' && /^[\w-]{1,40}$/.test(x.p) ? x.p : LH_PROJ_DEFAULT;
        const key = x.w + '|' + s + '|' + p;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ id: typeof x.id === 'string' ? x.id : 'cw' + Math.random().toString(36).slice(2, 10), w: x.w, z: x.z.trim().split(/\s+/).join(' '), s, p, at: Number.isFinite(x.at) ? x.at : Date.now() });
        if (out.length >= LH_CW_MAX) break;
    }
    return out;
}
let lhCustomWords = _lhCwClean(lhGetJSON(LH_CW_KEY, [], Array.isArray));
function _lhCwSave() { lhSet(LH_CW_KEY, JSON.stringify(lhCustomWords)); }

// 目前專案的自訂詞（0.98.21）
const lhCwMine = () => lhCustomWords.filter(x => x.p === activeProjectId);
// 現在看得到的（目前專案的「整個專案」＋目前這首歌的），轉成詞庫的格式；p 給很大，排在最前面
function lhCwActive() {
    const sid = typeof activeSongId === 'string' ? activeSongId : null;
    return lhCwMine().filter(x => x.s === 'g' || x.s === sid).map(x => ({ w: x.w, z: x.z, p: 1e12, custom: true }));
}
// 詞庫＋自訂詞（自訂的優先，同一個詞只留自訂那筆）
function lhCwMerge(list) {
    const cw = lhCwActive();
    if (!cw.length) return list || [];
    const mine = new Set(cw.map(e => e.w));
    return cw.concat((list || []).filter(e => !mine.has(e.w)));
}
// 查整個詞時，這個詞是自訂詞就用自訂的讀音
function lhCwReading(w) {
    const hit = lhCwActive().find(e => e.w === w);
    return hit ? hit.z : null;
}
// 猜讀音：整個詞在詞庫裡就用詞庫的，否則逐字取主要讀音（js/word-space.js _lhWsTarget）
function lhCwGuess(w) {
    if (typeof _lhWsTarget !== 'function') return null;
    const t = _lhWsTarget([...w]);
    if (t.some(x => !x || x.miss)) return null;
    return t.map(x => x.zy + (['', '', 'ˊ', 'ˇ', 'ˋ', '˙'][x.tone] || '')).join(' ');
}

function _lhCwChanged() {
    _lhCwSave();
    if (typeof lhSnapNote === 'function') lhSnapNote(activeProjectId);
    lhCwRender();
    // 正在查整個詞：馬上重畫，新詞立刻出現
    const v = document.getElementById('searchInput')?.value || '';
    if (typeof lhWsQuery === 'function' && lhWsQuery(v) && typeof lhWsRender === 'function') lhWsRender(v.trim());
}
// 換歌：只在某首歌顯示的詞跟著換
// force：換專案（整份清單都換）
function lhCwSongChanged(force) {
    if (!force && !lhCustomWords.some(x => x.s !== 'g')) return;
    _lhCwChanged();
}

function lhCwAdd(w, scope) {
    w = String(w || '').trim();
    if (!LH_CW_WORD_RE.test(w)) { showToast('自訂詞要是 2–6 個中文字'); return false; }
    const s = scope === 'song' && typeof activeSongId === 'string' ? activeSongId : 'g';
    if (lhCustomWords.some(x => x.w === w && x.s === s && x.p === activeProjectId)) { showToast('「' + w + '」已經在清單裡'); return false; }
    if (lhCustomWords.length >= LH_CW_MAX) { showToast('自訂詞最多 ' + LH_CW_MAX + ' 個'); return false; }
    const z = lhCwGuess(w);
    if (!z) { showToast('有字查不到讀音，換個寫法試試'); return false; }
    lhCustomWords.unshift({ id: 'cw' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), w, z, s, p: activeProjectId, at: Date.now() });
    _lhCwChanged();
    showToast('已加入「' + w + '」，讀音 ' + z + '（可以在清單裡改）');
    return true;
}

// ===== 設定裡的管理清單 =====
function lhCwRender() {
    const ul = document.getElementById('cwList');
    if (!ul) return;
    const titleOf = id => { const s = typeof songs !== 'undefined' && songs.find(x => x.id === id); return s ? '「' + s.title + '」' : '（已刪除的歌）'; };
    const mine = lhCwMine();
    ul.replaceChildren(...mine.map(x => {
        const li = document.createElement('li');
        li.className = 'cw-row';
        li.dataset.id = x.id;
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'cw-pick';
        cb.setAttribute('aria-label', '選取「' + x.w + '」');
        const w = document.createElement('span');
        w.className = 'cw-word';
        w.textContent = x.w;
        const z = document.createElement('input');
        z.type = 'text';
        z.className = 'cw-z';
        z.value = x.z;
        z.setAttribute('aria-label', '「' + x.w + '」的讀音（注音，每個字之間空一格）');
        z.addEventListener('change', () => {
            const v = z.value.trim().split(/\s+/).join(' ');
            if (!_lhCwValidZ(x.w, v)) { showToast('讀音要是 ' + [...x.w].length + ' 節注音，空白分開（例：ㄊㄜˋ ㄙ ㄌㄚ）'); z.value = x.z; return; }
            x.z = v;
            _lhCwChanged();
        });
        const sc = document.createElement('span');
        sc.className = 'cw-scope';
        sc.textContent = x.s === 'g' ? '整個專案' : titleOf(x.s);
        li.append(cb, w, z, sc);
        return li;
    }));
    const n = mine.length;
    const cap = document.getElementById('cwCount');
    if (cap) cap.textContent = (typeof lhProjName === 'function' ? '專案「' + lhProjName() + '」· ' : '') + (n ? '共 ' + n + ' 個' : '還沒有自訂詞');
    const all = document.getElementById('cwAll');
    if (all) all.checked = false;
}

{
    const add = document.getElementById('cwAddBtn'), input = document.getElementById('cwWord'), scope = document.getElementById('cwScope');
    const doAdd = () => { if (lhCwAdd(input.value, scope.value)) input.value = ''; };
    add?.addEventListener('click', doAdd);
    input?.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); doAdd(); } });
    document.getElementById('cwAll')?.addEventListener('change', e => document.querySelectorAll('#cwList .cw-pick').forEach(c => { c.checked = e.target.checked; }));
    document.getElementById('cwDelSel')?.addEventListener('click', async () => {
        const ids = new Set([...document.querySelectorAll('#cwList .cw-pick:checked')].map(c => c.closest('.cw-row').dataset.id));
        if (!ids.size) { showToast('先勾選要刪除的詞'); return; }
        const ok = await lhAsk({ title: '刪除選取的 ' + ids.size + ' 個自訂詞？', buttons: [{ label: '刪除', value: true, kind: 'danger' }, { label: '取消', value: null }] });
        if (!ok) return;
        lhCustomWords = lhCustomWords.filter(x => !ids.has(x.id));
        _lhCwChanged();
    });
    document.getElementById('cwReset')?.addEventListener('click', async () => {
        const n = lhCwMine().length;
        if (!n) return;
        const ok = await lhAsk({ title: '清空這個專案的 ' + n + ' 個自訂詞？', body: '其他專案的不受影響；這個動作不能復原（可以先「匯出」存一份）', buttons: [{ label: '全部清空', value: true, kind: 'danger' }, { label: '取消', value: null }] });
        if (!ok) return;
        lhCustomWords = lhCustomWords.filter(x => x.p !== activeProjectId);
        _lhCwChanged();
    });
    // 0.98.21：自訂詞彙單獨打包匯出／匯入（目前專案）。檔案格式 { format: 'lucky-hawaii-words', version: 1, project, words: [{ w, z, s }] }；
    // 只在某首歌的詞匯出時記歌名，匯入到別的地方一律變成「整個專案」（歌 id 換裝置就對不上）
    document.getElementById('cwExport')?.addEventListener('click', () => {
        const mine = lhCwMine();
        if (!mine.length) { showToast('這個專案還沒有自訂詞'); return; }
        const d = new Date(), pad = n => String(n).padStart(2, '0');
        const data = { format: 'lucky-hawaii-words', version: 1, project: lhProjName(), exportedAt: d.toISOString(), words: mine.map(x => ({ w: x.w, z: x.z })) };
        downloadText('LuckyHawaii-自訂詞彙-' + safeFileName(lhProjName()) + '-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '.json', JSON.stringify(data, null, 2), 'application/json');
        showToast('已匯出 ' + mine.length + ' 個自訂詞');
    });
    const cwFile = document.getElementById('cwImportFile');
    document.getElementById('cwImport')?.addEventListener('click', () => cwFile && cwFile.click());
    cwFile?.addEventListener('change', () => {
        const f = cwFile.files && cwFile.files[0];
        cwFile.value = '';
        if (!f) return;
        if (f.size > 2 * 1024 * 1024) { showToast('檔案太大，不像自訂詞彙檔'); return; }
        f.text().then(txt => {
            let d; try { d = JSON.parse(txt); } catch (e) { lhWarn('自訂詞彙檔讀不懂', e); d = null; }
            // 也接受「創作內容」或舊的備份檔裡的 customWords
            const raw = d && (d.format === 'lucky-hawaii-words' ? d.words : Array.isArray(d.customWords) ? d.customWords : null);
            if (!Array.isArray(raw)) { showToast('這不是自訂詞彙檔（請選「匯出」存出來的 .json）', 4000); return; }
            const clean = _lhCwClean(raw.map(x => ({ ...x, s: 'g', p: activeProjectId })));
            const have = new Set(lhCwMine().filter(x => x.s === 'g').map(x => x.w));
            const add = clean.filter(x => !have.has(x.w)).slice(0, Math.max(0, LH_CW_MAX - lhCustomWords.length));
            lhCustomWords = add.concat(lhCustomWords);
            _lhCwChanged();
            showToast('已匯入 ' + add.length + ' 個自訂詞到專案「' + lhProjName() + '」' + (clean.length > add.length ? '（' + (clean.length - add.length) + ' 個重複或超過上限，略過）' : ''), 4000);
        }, e => { lhWarn('讀取自訂詞彙檔失敗', e); showToast('檔案讀不出來，請再試一次'); });
    });
    lhCwRender();
}
