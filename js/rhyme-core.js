// ==================== 韻腳地圖：純函式 ====================
// 純函式、不碰 DOM／儲存，Node 可直接載入（tests/rhyme-core.spec.mjs 用 node:vm 載入這一支）。
// 負責：押韻判定原語（寬韻＝同家族、嚴格＝韻母全等）、句尾字抽取（跳標點與語助詞）、讀音來源、字母編號。
// 字典與詞庫的全域變數（charInfo、wordPhoneticMap、RHYME_TO_FAMILY）只在函式內部使用，所以載入順序不影響。
// 查韻篩選（candidates.js、wordlist.js）與韻腳地圖共用 lhRhymeMatch，才能保證兩邊判定一致。

// 語助詞（CONTEXT E1）：句尾遇到這些字，往前找真正的押韻字
const LH_RHYME_PARTICLES = new Set(Array.from('啊呀哪呢喔哦噢吧啦嘛耶欸囉唷了的嗎'));
// 字母表：先大寫再小寫共 52 個，再多就用 '*'
const LH_RHYME_ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
// 開關預設（CONTEXT B4、C3、E1、E2）：只有句尾上色預設開。這五個鍵是第 10 階段就存在的，順序與預設值不可動（備份與測試逐字比對）
const LH_RHYME_DEFAULTS = Object.freeze({ end: true, letters: false, inner: false, strict: false, skipParticles: true });
// 第 11 階段的完整設定預設（CONTEXT D4）：前五個鍵同上；逐行標記總開關預設關，打開後內容項預設是字數＋斷句開、韻腳字母與對照差異關
// （D4 括號的說法——第一次打開就有東西看、但不擠）。總開關沒開時什麼都不顯示，所以全新使用者仍然只看到句尾上色
const LH_MAP_DEFAULTS = Object.freeze(Object.assign({}, LH_RHYME_DEFAULTS, {
    line: false, lnRhyme: false, lnCount: true, lnSplit: true, lnDiff: false, autoHover: false,
    pos: 'right', size: 'm', depth: 'std',
}));
// 列舉值只收清單裡的；顏色鍵固定 '0'…'15'（16 個韻族，空韻 16 不開放自訂），色碼只收小寫 #rrggbb（與 rhyme-map.js 的 LH_MAP_HEX 同形）
const LH_MAP_ENUM = Object.freeze({ pos: Object.freeze(['right', 'tail']), size: Object.freeze(['s', 'm', 'l']), depth: Object.freeze(['light', 'std', 'heavy']) });
const LH_MAP_COLOR_RE = /^#[0-9a-f]{6}$/;
const LH_MAP_COLOR_KEYS = Object.freeze(Array.from({ length: 16 }, (_, i) => String(i)));

// 把任何來源（儲存、備份檔、別的分頁）的 lh:map 整理成固定形狀：不是物件就全用預設；每個鍵獨立檢查，壞的只退回那一鍵的預設。
// 開關只收自己的 typeof boolean 屬性、列舉只收清單內的字串、colors 只讀固定 16 把鍵再驗色碼（絕不迭代輸入的鍵，
// 所以 __proto__ 之類的鍵打不到任何東西，也不會被惡意大物件拖慢）；回傳的永遠是全新物件（T-10-07、T-11-01、T-11-02）
function lhRhymeNormalizeSettings(o) {
    const out = Object.assign({}, LH_MAP_DEFAULTS, { colors: {} });
    if (o && typeof o === 'object' && !Array.isArray(o)) {
        const own = (x, k) => Object.prototype.hasOwnProperty.call(x, k);
        for (const k of Object.keys(LH_MAP_DEFAULTS)) {
            if (typeof LH_MAP_DEFAULTS[k] === 'boolean' && own(o, k) && typeof o[k] === 'boolean') out[k] = o[k];
        }
        for (const k of Object.keys(LH_MAP_ENUM)) {
            if (own(o, k) && LH_MAP_ENUM[k].includes(o[k])) out[k] = o[k];
        }
        const c = own(o, 'colors') ? o.colors : null;
        if (c && typeof c === 'object' && !Array.isArray(c)) {
            for (const k of LH_MAP_COLOR_KEYS) {
                if (own(c, k) && typeof c[k] === 'string' && LH_MAP_COLOR_RE.test(c[k])) out.colors[k] = c[k];
            }
        }
    }
    return out;
}

// 最小序列化：第 10 階段的五個鍵永遠照原順序寫，新鍵只在與預設不同時才寫，colors 有東西才寫。
// 這樣第 10 階段留下的設定、備份與測試讀回來逐字相同，新版也不會把一整排預設值灌進每個人的儲存（X5）
function lhRhymeSerialize(set) {
    const s = lhRhymeNormalizeSettings(set), o = {};
    for (const k of Object.keys(LH_RHYME_DEFAULTS)) o[k] = s[k];
    for (const k of Object.keys(LH_MAP_DEFAULTS)) {
        if (!Object.prototype.hasOwnProperty.call(LH_RHYME_DEFAULTS, k) && s[k] !== LH_MAP_DEFAULTS[k]) o[k] = s[k];
    }
    if (Object.keys(s.colors).length) o.colors = s.colors;
    return JSON.stringify(o);
}
// 17 色：0–15 依 RHYME_FAMILIES 順序，16 是沒有家族的韻（空韻 ㄓㄔㄕㄖㄗㄘㄙ 等）用的中性灰
const LH_RHYME_COLORS = Object.freeze({
    light: Object.freeze(['#d9534f', '#e8833a', '#d4a017', '#9aab2a', '#4caf50', '#2e9e74', '#1fa5a5', '#2f8fd0',
        '#4a6fd6', '#7b61d6', '#a255cf', '#c94fb0', '#d94f86', '#8a6d4b', '#6b7f8f', '#8a4f7d', '#8a8f98']),
    dark: Object.freeze(['#c9524e', '#d9803a', '#b58910', '#8a9b22', '#3f9e44', '#2a9270', '#1c9696', '#2a82c2',
        '#4a63c8', '#6a50d0', '#a24cc0', '#b9479f', '#c94a7a', '#7d6144', '#607382', '#b06a8a', '#7a808a'])
});
// 底色混合比例（百分比）：句尾字、孤句、句中押韻
const LH_RHYME_MIX = Object.freeze({ end: 34, orphan: 17, inner: 30 });
const LH_RHYME_NONE = 16;

const _LH_RHYME_TAIL_RE = /[^\p{L}\p{N}]+$/u;   // 行尾的標點、空白、符號、emoji 先去掉（A4）
const _LH_RHYME_WORD_RE = /[\p{L}\p{N}]/u;
const _LH_RHYME_HAN_RE = /^\p{Script=Han}$/u;

// 韻母所屬家族 id；沒有家族（空韻等）回 undefined
function lhRhymeFamilyId(rhyme) {
    return RHYME_TO_FAMILY[rhyme];
}

// 兩個韻母算不算同韻。嚴格：字串全等；寬韻：同家族（沒有家族的彼此 undefined === undefined 也算同，與既有詞庫篩選一致）
function lhRhymeMatch(a, b, strict) {
    return strict ? a === b : RHYME_TO_FAMILY[a] === RHYME_TO_FAMILY[b];
}

// 分組用的鍵（字母、統計）：嚴格＝韻母本身；寬韻＝'f' + 家族 id，沒有家族一律歸 'x'
function lhRhymeKey(rhyme, strict) {
    if (strict) return rhyme;
    const f = RHYME_TO_FAMILY[rhyme];
    return f === undefined ? 'x' : 'f' + f;
}

// 顏色編號：家族 id，沒有家族是 LH_RHYME_NONE（嚴格模式顏色也照家族，B2）
function lhRhymeColor(rhyme) {
    const f = RHYME_TO_FAMILY[rhyme];
    return f === undefined ? LH_RHYME_NONE : f;
}

// 句尾目標字：{ i, char, tail } 或 null。i 是以字元（code point）算的位置；
// tail 是以目標字結尾、連續漢字、最多 4 個（手動讀音的鍵）
function lhRhymeTarget(line, skipParticles) {
    const cs = Array.from(line.replace(_LH_RHYME_TAIL_RE, ''));
    let i = cs.length - 1;
    if (i < 0) return null;
    if (skipParticles && LH_RHYME_PARTICLES.has(cs[i])) {
        // 往前找第一個「不是語助詞的字或數字」，中間的標點空白略過；整行都是語助詞就留在最後一個字（E1）
        let j = i;
        while (j >= 0 && (LH_RHYME_PARTICLES.has(cs[j]) || !_LH_RHYME_WORD_RE.test(cs[j]))) j--;
        if (j >= 0) i = j;
    }
    const char = cs[i];
    if (!charInfo[char]) return null;   // 字典查不到（英文、數字、符號）不上色、不計入（A4）
    let s = i;
    while (s > 0 && i - s < 3 && _LH_RHYME_HAN_RE.test(cs[s - 1])) s--;
    return { i, char, tail: cs.slice(s, i + 1).join('') };
}

// 這個句尾的手動讀音：只在句尾鍵完全相同、且該值是這個字的合法讀音時才算，否則 null（A3，不會套到別的字或別的句）
function lhRhymeManual(t, readings) {
    const man = readings && Object.prototype.hasOwnProperty.call(readings, t.tail) ? readings[t.tail] : null;
    return man && getCharAllReadings(t.char).some(r => r.reading === man) ? man : null;
}

// 讀音：手動（且對該字合法）→ 以目標字結尾的詞庫詞（4、3、2 字）的最後一個音節 → 字典第一讀音（A2）
function lhRhymeReading(t, readings) {
    const infos = getCharAllReadings(t.char);
    if (!infos.length) return null;
    const man = lhRhymeManual(t, readings);
    if (man) return man;
    for (let n = Math.min(4, t.tail.length); n >= 2; n--) {
        const z = wordPhoneticMap.get(t.tail.slice(-n));
        if (z) {
            const syl = z.split(' ');
            if (syl.length === n) return syl[n - 1];
        }
    }
    return infos[0].reading;
}

// 句中押韻（E2）：句尾字之前、讀音（字典第一讀音）的鍵與本段任何一個句尾相同的漢字，由左到右最多 3 個。
// 不含句尾字本身、標點、字典查不到的字；語助詞開著時語助詞也不算。回傳 [{ i, f }]，i 是以字元算的位置，f 是顏色編號
function lhRhymeInner(line, t, tailKeys, strict, skip) {
    const out = [];
    const cs = Array.from(line);
    for (let i = 0; i < t.i && out.length < 3; i++) {
        const c = cs[i];
        if (!_LH_RHYME_HAN_RE.test(c) || !charInfo[c] || (skip && LH_RHYME_PARTICLES.has(c))) continue;
        const infos = getCharAllReadings(c);
        if (!infos.length) continue;
        const rhyme = getZhuyinRhyme(infos[0].reading);
        if (tailKeys.has(lhRhymeKey(rhyme, strict))) out.push({ i, f: lhRhymeColor(rhyme) });
    }
    return out;
}

// 分析一段歌詞：每個實體行一列。opts = { strict, skipParticles, inner }
// 回傳 { rows, letters, count }：letters 是字母字串（空行不佔位、沒有目標字的行是 '-'），count 是 鍵 → 行數；
// 每列另有 inner（句中押韻的字，沒開就是空陣列）
function lhRhymeAnalyze(text, opts, readings) {
    const strict = !!(opts && opts.strict), skip = !opts || opts.skipParticles !== false;
    const rows = text.replace(/\r\n?/g, '\n').split('\n').map(line => {
        if (!line.trim()) return { line, blank: true, t: null, reading: null, rhyme: null, key: null, f: null, letter: '', solo: false, inner: [] };
        const t = lhRhymeTarget(line, skip);
        const reading = t && lhRhymeReading(t, readings);
        if (!t || !reading) return { line, blank: false, t: null, reading: null, rhyme: null, key: null, f: null, letter: '-', solo: false, inner: [] };
        const rhyme = getZhuyinRhyme(reading);
        return { line, blank: false, t, reading, rhyme, key: lhRhymeKey(rhyme, strict), f: lhRhymeColor(rhyme), letter: '', solo: false, inner: [], manual: lhRhymeManual(t, readings) === reading };
    });
    const letterOf = new Map(), count = new Map();
    let letters = '';
    for (const r of rows) {
        if (r.blank) continue;
        if (r.key === null) { letters += '-'; continue; }
        if (!letterOf.has(r.key)) letterOf.set(r.key, LH_RHYME_ALPHA[letterOf.size] || '*');
        r.letter = letterOf.get(r.key);
        letters += r.letter;
        count.set(r.key, (count.get(r.key) || 0) + 1);
    }
    for (const r of rows) if (r.key !== null) r.solo = count.get(r.key) === 1;   // 孤句（B3）
    if (opts && opts.inner) {
        const tailKeys = new Set(count.keys());
        for (const r of rows) if (r.t) r.inner = lhRhymeInner(r.line, r.t, tailKeys, strict, skip);
    }
    return { rows, letters, count };
}

// 統計（段落標題列的字母條與 #rhymeStats 共用）：n＝非空行、k＝句尾韻在本段出現至少兩次的行數、p＝k/n 的百分比；
// groups 依字母首次出現的順序，每個有韻的字母一筆 { letter, label, count, f }：寬韻 label 是家族名稱（沒有家族＝空韻），嚴格是韻母本身
function lhRhymeSummary(result, strict) {
    const rows = result.rows.filter(r => !r.blank);
    const groups = [], seen = new Set();
    let k = 0;
    for (const r of rows) {
        if (r.key === null) continue;
        const c = result.count.get(r.key);
        if (c >= 2) k++;
        if (seen.has(r.key)) continue;
        seen.add(r.key);
        const fam = RHYME_TO_FAMILY[r.rhyme];
        groups.push({ letter: r.letter, label: strict ? (r.rhyme || '空韻') : (fam === undefined ? '空韻' : RHYME_FAMILIES[fam].label), count: c, f: r.f });
    }
    return { n: rows.length, k, p: rows.length ? Math.round(k / rows.length * 100) : 0, groups };
}

// 匯入／載入時整理手動讀音（T-10-12）：鍵是 1–4 個漢字（擋掉 __proto__、constructor）、值是注音加選用聲調，
// 且必須是鍵的最後一個字的合法字典讀音；最多 2000 筆。回傳全新的普通物件，沒有任何一筆留下就回 null。
// 字典查不到這個字（還沒載入或冷僻字）時無法判斷合法，先保留——套用時 lhRhymeManual 仍會再驗一次，不會套錯
const LH_READINGS_MAX = 2000;
const _LH_READING_KEY_RE = /^\p{Script=Han}{1,4}$/u;
const _LH_READING_VAL_RE = /^[ㄅ-ㄩ]{1,4}[ˊˇˋ˙]?$/;
function lhRhymeCleanReadings(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const out = {};
    let n = 0;
    for (const k of Object.keys(raw)) {
        const v = raw[k];
        if (!_LH_READING_KEY_RE.test(k) || typeof v !== 'string' || !_LH_READING_VAL_RE.test(v)) continue;
        const infos = getCharAllReadings(Array.from(k).pop());
        if (infos.length && !infos.some(r => r.reading === v)) continue;
        out[k] = v;
        if (++n >= LH_READINGS_MAX) break;
    }
    return n ? out : null;
}
