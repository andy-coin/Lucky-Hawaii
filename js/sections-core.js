// ==================== 段落模組：純函式 ====================
// 純函式、不碰 DOM／儲存，Node 可直接載入（tests/sections-core.spec.mjs 用 node:vm 載入這一支）。
// 負責：段落類型清單、舊 label 推斷類型、羅馬數字編號、欄位整理（壞值丟掉、段落照收）。
// songs.js（開機／跨分頁讀取）、safety.js（備份匯入）、各 UI 動作都呼叫這裡；safety.js 比這支早載入，
// 但它只在匯入時（執行期）才用到，所以載入順序不影響。

const LH_SEC_TYPES = ['intro', 'verse', 'prechorus', 'chorus', 'inter', 'bridge', 'outro', 'custom'];   // 類型順序（下拉選單）
const LH_SEC_TYPE_SET = new Set(LH_SEC_TYPES);   // 用 Set／Map 查表，不用物件字面量：'__proto__'、'constructor' 才打不到原型鍵
const LH_SEC_NAMES = { intro: 'Intro', verse: 'Verse', prechorus: 'Pre-Chorus', chorus: 'Chorus', inter: 'Inter', bridge: 'Bridge', outro: 'Outro', custom: 'Custom' };   // 只用驗證過的鍵讀
const LH_SEC_CUSTOM_MAX = 40;   // 自訂名稱上限（以字元，不是 UTF-16 單位）
const LH_SEC_H_MIN = 4;         // 段落高度（rem）合理範圍（A4）
const LH_SEC_H_MAX = 60;
const LH_SEC_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
// 舊 label → 類型（比對前已轉小寫、去掉尾端編號）
const LH_SEC_KEY2TYPE = new Map(Object.entries({
    intro: 'intro', '前奏': 'intro',
    verse: 'verse', '主歌': 'verse', '歌詞': 'verse', '新段落': 'verse', '段落': 'verse',
    prechorus: 'prechorus', 'pre-chorus': 'prechorus', 'pre chorus': 'prechorus', pre: 'prechorus', '導歌': 'prechorus', '預副歌': 'prechorus',
    chorus: 'chorus', '副歌': 'chorus',
    inter: 'inter', interlude: 'inter', '間奏': 'inter',
    bridge: 'bridge', '橋段': 'bridge',
    outro: 'outro', '尾奏': 'outro', '結尾': 'outro'
}));

// 以字元（code point）切，CJK 擴充字不會被切成半個
function _lhSecCut(s, n) {
    return Array.from(s).slice(0, n).join('');
}

// 空字串或不是字串 → verse；認得的 → 該類型；其他 → custom 並保留原名（A2）
function lhInferSecType(label) {
    const raw = typeof label === 'string' ? label.trim() : '';
    if (!raw) return { type: 'verse', custom: '' };
    const k = raw.toLowerCase().replace(/[_\s]+/g, ' ')
        // 尾端的阿拉伯數字、要有空白隔開的羅馬數字（I～XXXIX，不含 L／C：'Outro C' 這種是使用者自己的名字）、中文數字都去掉
        .replace(/(?:\s*[#.\-]?\s*\d+|\s+(?=[ivx])x{0,3}(?:ix|iv|v?i{0,3})|\s*[一二三四五六七八九十]+)$/u, '')
        .trim().replace(/\s*-\s*/g, '-');
    return LH_SEC_KEY2TYPE.has(k)
        ? { type: LH_SEC_KEY2TYPE.get(k), custom: '' }
        : { type: 'custom', custom: _lhSecCut(raw, LH_SEC_CUSTOM_MAX) };
}

// 整理單一段落的四個新欄位；壞值丟掉、段落與歌詞照收（A4）
function lhSecFields(s) {
    const hasType = typeof s.type === 'string' && LH_SEC_TYPE_SET.has(s.type);
    const inf = hasType ? null : lhInferSecType(s.label);
    let custom = typeof s.custom === 'string' ? _lhSecCut(s.custom.trim(), LH_SEC_CUSTOM_MAX) : '';
    if (inf && inf.custom) custom = inf.custom;
    return {
        type: hasType ? s.type : inf.type,
        custom,
        color: typeof s.color === 'string' && LH_SEC_COLOR_RE.test(s.color) ? s.color.toLowerCase() : '',
        height: Number.isFinite(s.height) && s.height >= LH_SEC_H_MIN && s.height <= LH_SEC_H_MAX ? Math.round(s.height * 10) / 10 : null,
        ...lhSecColFields(s)
    };
}

// 並排角色欄（對唱、音樂劇）：role＝第一欄（原本的歌詞）的角色名；cols＝另外加的欄 [{ name, text }]，最多 LH_SEC_COLS_MAX 欄。
// 沒有加欄的段落不寫這兩個欄位（舊備份、舊測試逐字相同）
const LH_SEC_COLS_MAX = 3;
const LH_SEC_ROLE_MAX = 20;
function lhSecColFields(s) {
    const out = {};
    const cols = Array.isArray(s.cols) ? s.cols.filter(c => c && typeof c === 'object').slice(0, LH_SEC_COLS_MAX)
        .map(c => ({ name: typeof c.name === 'string' ? _lhSecCut(c.name.trim(), LH_SEC_ROLE_MAX) : '', text: typeof c.text === 'string' ? c.text.slice(0, 200000) : '' })) : [];
    if (cols.length) out.cols = cols;
    if (cols.length && typeof s.role === 'string' && s.role.trim()) out.role = _lhSecCut(s.role.trim(), LH_SEC_ROLE_MAX);
    return out;
}

// 匯出、列印用的文字：沒有角色欄就是原文；有的話逐行合併，每行前面標角色（沒取名叫「角色 n」），空行略過、組與組之間空一行
function lhSecMergedText(s) {
    if (!s.cols || !s.cols.length) return s.text;
    const cols = [{ name: s.role || '', text: s.text }, ...s.cols].map((c, i) => ({ name: c.name || '角色 ' + (i + 1), lines: c.text.replace(/\r\n?/g, '\n').split('\n') }));
    const rows = Math.max(...cols.map(c => c.lines.length)), out = [];
    for (let r = 0; r < rows; r++) {
        const got = cols.filter(c => (c.lines[r] || '').trim()).map(c => '【' + c.name + '】' + c.lines[r].trim());
        if (got.length) out.push(...got);
        else if (out.length && out[out.length - 1] !== '') out.push('');
    }
    return out.join('\n');
}

// ==================== 角色標記（對唱、音樂劇） ====================
// song.roles＝[{ id, name, color }]（最多 8 個）；段落 s.marks＝[{ a, b, r }]：UTF-16 半開區間 [a, b)、依 a 排序、
// 互不重疊、相鄰同角色合併。兩個欄位空的時候都不寫（舊歌、舊備份逐字相同）。
// 陣列永遠換新的、不就地改：復原快照是淺拷貝。
const LH_ROLE_MAX = 8;
const LH_ROLE_MARKS_MAX = 5000;   // 每段標記數上限（擋惡意備份）
const LH_ROLE_COLORS = ['#e05d5d', '#4a7fd4', '#48a868', '#e98a3c', '#8d6bd0', '#2c9fa0', '#d2649a', '#d69e2e'];
const _LH_ROLE_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;   // 同 safety.js 的 LH_ID_RE（這支檔要能單獨載入，不引用別支）

// 排序、裁掉重疊、丟掉空區間、合併相鄰同角色；回傳新陣列
function _lhMarksNorm(list) {
    const out = [];
    for (const m of list.slice().sort((x, y) => x.a - y.a)) {
        const prev = out[out.length - 1];
        const a = prev ? Math.max(m.a, prev.b) : m.a;
        if (m.b <= a) continue;
        if (prev && prev.b === a && prev.r === m.r) prev.b = m.b;
        else out.push({ a, b: m.b, r: m.r });
    }
    return out;
}

function lhRolesClean(raw) {
    if (!Array.isArray(raw)) return [];
    const seen = new Set(), out = [];
    for (const r of raw) {
        if (out.length >= LH_ROLE_MAX) break;
        if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !_LH_ROLE_ID_RE.test(r.id) || seen.has(r.id)) continue;
        seen.add(r.id);
        const i = out.length;
        out.push({
            id: r.id,
            name: (typeof r.name === 'string' ? _lhSecCut(r.name.trim(), LH_SEC_ROLE_MAX) : '') || '角色 ' + (i + 1),
            color: typeof r.color === 'string' && LH_SEC_COLOR_RE.test(r.color) ? r.color.toLowerCase() : LH_ROLE_COLORS[i]
        });
    }
    return out;
}

// ids：認得的角色 id（Set）；len：文字長度。壞值丟掉，超出長度的截到文字尾端
function lhMarksClean(raw, len, ids) {
    if (!Array.isArray(raw)) return [];
    const ok = [];
    for (const m of raw) {
        if (ok.length >= LH_ROLE_MARKS_MAX) break;
        if (!m || typeof m !== 'object' || !Number.isInteger(m.a) || !Number.isInteger(m.b) || m.a < 0 || m.a >= m.b || !ids.has(m.r)) continue;
        const b = Math.min(m.b, len);
        if (m.a < b) ok.push({ a: m.a, b, r: m.r });
    }
    return _lhMarksNorm(ok);
}

function lhSecSetMarks(s, list) {
    if (list && list.length) s.marks = list;
    else delete s.marks;
}

// 就地整理一首歌的角色與標記（開機讀取、備份匯入共用）；沒有角色就沒有標記，也不留空欄位
function lhSongRolesFix(song) {
    const roles = lhRolesClean(song.roles);
    if (roles.length) song.roles = roles;
    else delete song.roles;
    const ids = new Set(roles.map(r => r.id));
    for (const s of song.sections) lhSecSetMarks(s, lhMarksClean(s.marks, typeof s.text === 'string' ? s.text.length : 0, ids));
    return song;
}

// 把 [a, b) 指定給角色 r（null＝清除）
function lhMarksSet(marks, a, b, r) {
    if (!(a < b)) return marks;
    const out = [];
    for (const m of marks || []) {
        if (m.b <= a || m.a >= b) { out.push(m); continue; }
        if (m.a < a) out.push({ a: m.a, b: a, r: m.r });
        if (m.b > b) out.push({ a: b, b: m.b, r: m.r });
    }
    if (r) out.push({ a, b, r });
    return _lhMarksNorm(out);
}

// 文字改了，標記跟著平移。textarea 的一次編輯一定是一段連續的取代：舊字 [s, oe) 變成新字 [s, ne)。
// 只比對前後綴分不出插在哪（「愛愛」打一個「愛」插在 0、1、2 都一樣），所以呼叫端要給 caret＝編輯後插入文字的尾端
// （textarea 就是 selectionEnd；拖字、移段由呼叫端算出確切位置）。caret 缺少或對不上新舊文字才退回前後綴比對。
function lhMarksShift(marks, oldText, newText, caret) {
    if (!marks || !marks.length || oldText === newText) return marks;
    const oL = oldText.length, nL = newText.length, d = nL - oL;
    const hi = c => c >= 0xD800 && c <= 0xDBFF, lo = c => c >= 0xDC00 && c <= 0xDFFF;
    let p = 0;
    while (p < oL && p < nL && oldText[p] === newText[p]) p++;
    if (p > 0 && hi(oldText.charCodeAt(p - 1))) p--;   // 別把代理對切成兩半
    let s, oe, ne;
    const ok = Number.isInteger(caret) && caret >= 0 && caret <= nL && caret - d >= 0 && caret - d <= oL
        && !(caret > 0 && caret < nL && hi(newText.charCodeAt(caret - 1)) && lo(newText.charCodeAt(caret)))
        && oldText.slice(caret - d) === newText.slice(caret);
    if (ok) { ne = caret; oe = caret - d; s = Math.min(p, oe, ne); }
    else {
        let q = 0;
        const lim = Math.min(oL, nL) - p;
        while (q < lim && oldText[oL - 1 - q] === newText[nL - 1 - q]) q++;
        if (q > 0 && lo(newText.charCodeAt(nL - q))) q--;
        oe = oL - q; ne = nL - q; s = p;
    }
    const out = [];
    for (const m of marks) {
        let a, b;
        if (m.b <= s) { a = m.a; b = m.b; }
        else if (m.a >= oe) { a = m.a + d; b = m.b + d; }
        else if (m.a <= s && m.b >= oe) { a = m.a; b = m.b + d; }   // 整個改動區都在標記裡：新字沿用角色
        else { a = m.a < s ? m.a : ne; b = m.b > oe ? m.b + d : s; }
        if (b > a) out.push({ a, b, r: m.r });
    }
    return _lhMarksNorm(out);
}

// 1→I、4→IV、9→IX、14→XIV、1999→MCMXCIX
function lhToRoman(n) {
    const t = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    let out = '';
    for (const [v, r] of t) while (n >= v) { out += r; n -= v; }
    return out;
}

// 同類型出現 2 次以上才依目前順序加羅馬數字；Custom 不編號，沒名字就叫 Custom（B2）
function lhSecNames(sections) {
    const total = new Map(), seen = new Map();
    for (const s of sections) total.set(s.type, (total.get(s.type) || 0) + 1);
    return sections.map(s => {
        if (s.type === 'custom') return (s.custom || '').trim() || LH_SEC_NAMES.custom;
        const n = (seen.get(s.type) || 0) + 1;
        seen.set(s.type, n);
        return total.get(s.type) > 1 ? LH_SEC_NAMES[s.type] + ' ' + lhToRoman(n) : LH_SEC_NAMES[s.type];
    });
}

// 補欄位 → 重算 label（A3：label 永遠是「目前顯示的名稱」）；就地修改並回傳同一個陣列，重跑結果完全相同
function lhSecFinalize(sections) {
    for (const s of sections) {
        const f = lhSecFields(s);
        if (!f.cols) delete s.cols;
        if (!f.role) delete s.role;
        Object.assign(s, f);
    }
    const names = lhSecNames(sections);
    sections.forEach((s, i) => { s.label = names[i]; });
    return sections;
}

// ＋新增段落預設的類型：Verse → Pre-Chorus → Chorus → Verse，其他或不確定一律 Verse（B6）
function lhNextSecType(prevType) {
    if (prevType === 'verse') return 'prechorus';
    if (prevType === 'prechorus') return 'chorus';
    return 'verse';
}

// 字數（CONTEXT E1）：每個漢字／平假名／片假名／韓文／注音符號算 1；其餘字母或數字連續一串算 1（詞內撇號如 don't 不拆開）；
// 空白、標點、emoji 算 0。數量來自 match 的次數，不看 UTF-16 長度（𠀀 這類擴充字是 2 個單位但只算 1）。
const _LH_CJK = String.raw`[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Bopomofo}]`;
const _LH_WC_RE = new RegExp(`${_LH_CJK}|(?:(?!${_LH_CJK})[\\p{L}\\p{N}])+(?:['’](?:(?!${_LH_CJK})[\\p{L}\\p{N}])+)*`, 'gu');
function lhCountWords(text) {
    if (typeof text !== 'string') return 0;
    let n = 0;
    for (const _ of text.matchAll(_LH_WC_RE)) n++;
    return n;
}
