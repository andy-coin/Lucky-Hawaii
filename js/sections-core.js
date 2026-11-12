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
