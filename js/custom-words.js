// ==================== 自訂詞彙（0.98.05） ====================
// 使用者自己加的專有名詞（音樂劇角色、招式、品牌、店名、調酒…）：和詞庫一起被詞卡、星雲、關聯詞彙索引（js/word-space.js lhCwMerge）。
// 每筆 { id, w: 詞（2–6 個漢字）, z: 注音（每字一節、空白分開、帶聲調）, s: 'g'＝全域 或 歌曲 id（只在那首歌顯示）, at }。
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
        const key = x.w + '|' + s;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ id: typeof x.id === 'string' ? x.id : 'cw' + Math.random().toString(36).slice(2, 10), w: x.w, z: x.z.trim().split(/\s+/).join(' '), s, at: Number.isFinite(x.at) ? x.at : Date.now() });
        if (out.length >= LH_CW_MAX) break;
    }
    return out;
}
let lhCustomWords = _lhCwClean(lhGetJSON(LH_CW_KEY, [], Array.isArray));
function _lhCwSave() { lhSet(LH_CW_KEY, JSON.stringify(lhCustomWords)); }

// 現在看得到的（全域＋目前這首歌的），轉成詞庫的格式；p 給很大，排在最前面
function lhCwActive() {
    const sid = typeof activeSongId === 'string' ? activeSongId : null;
    return lhCustomWords.filter(x => x.s === 'g' || x.s === sid).map(x => ({ w: x.w, z: x.z, p: 1e12, custom: true }));
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
    lhCwRender();
    // 正在查整個詞：馬上重畫，新詞立刻出現
    const v = document.getElementById('searchInput')?.value || '';
    if (typeof lhWsQuery === 'function' && lhWsQuery(v) && typeof lhWsRender === 'function') lhWsRender(v.trim());
}
// 換歌：只在某首歌顯示的詞跟著換
function lhCwSongChanged() {
    if (!lhCustomWords.some(x => x.s !== 'g')) return;
    _lhCwChanged();
}

function lhCwAdd(w, scope) {
    w = String(w || '').trim();
    if (!LH_CW_WORD_RE.test(w)) { showToast('自訂詞要是 2–6 個中文字'); return false; }
    const s = scope === 'song' && typeof activeSongId === 'string' ? activeSongId : 'g';
    if (lhCustomWords.some(x => x.w === w && x.s === s)) { showToast('「' + w + '」已經在清單裡'); return false; }
    if (lhCustomWords.length >= LH_CW_MAX) { showToast('自訂詞最多 ' + LH_CW_MAX + ' 個'); return false; }
    const z = lhCwGuess(w);
    if (!z) { showToast('有字查不到讀音，換個寫法試試'); return false; }
    lhCustomWords.unshift({ id: 'cw' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), w, z, s, at: Date.now() });
    _lhCwChanged();
    showToast('已加入「' + w + '」，讀音 ' + z + '（可以在清單裡改）');
    return true;
}

// ===== 設定裡的管理清單 =====
function lhCwRender() {
    const ul = document.getElementById('cwList');
    if (!ul) return;
    const titleOf = id => { const s = typeof songs !== 'undefined' && songs.find(x => x.id === id); return s ? '「' + s.title + '」' : '（已刪除的歌）'; };
    ul.replaceChildren(...lhCustomWords.map(x => {
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
        sc.textContent = x.s === 'g' ? '全域' : titleOf(x.s);
        li.append(cb, w, z, sc);
        return li;
    }));
    const n = lhCustomWords.length;
    const cap = document.getElementById('cwCount');
    if (cap) cap.textContent = n ? '共 ' + n + ' 個' : '還沒有自訂詞';
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
        if (!lhCustomWords.length) return;
        const ok = await lhAsk({ title: '清空全部 ' + lhCustomWords.length + ' 個自訂詞？', body: '這個動作不能復原', buttons: [{ label: '全部清空', value: true, kind: 'danger' }, { label: '取消', value: null }] });
        if (!ok) return;
        lhCustomWords = [];
        _lhCwChanged();
    });
    lhCwRender();
}
