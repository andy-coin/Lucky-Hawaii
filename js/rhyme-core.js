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
// （D4 括號的說法——第一次打開就有東西看、但不擠）。總開關沒開時什麼都不顯示，所以全新使用者仍然只看到句尾上色。
// multi（雙押／多押的標示）預設開：它只是在句尾色塊上多一層淡色與細線，沒有句尾上色就看不到
const LH_MAP_DEFAULTS = Object.freeze(Object.assign({}, LH_RHYME_DEFAULTS, {
    multi: true, line: false, lnRhyme: false, lnCount: true, lnSplit: true, lnDiff: false, autoHover: false,
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
// 句尾上色濃淡（第 11 階段）：[主色塊, 孤句] 的混合百分比。std 必須永遠等於上面的 LH_RHYME_MIX（第 10 階段的預設外觀不能變）；
// 淡、標準的文字對比測試保證 4.5:1，濃是使用者自己選的，深色主題有 5 色會低於 4.5（UI-SPEC D-14）
const LH_MAP_DEPTH = Object.freeze({ light: Object.freeze([26, 14]), std: Object.freeze([34, 17]), heavy: Object.freeze([40, 20]) });
// 提醒用的混色與對比（第 11 階段，UI-SPEC D-15）：輸入輸出都是 0–255 整數陣列 [r, g, b]，不讀 DOM。
// 混色是 sRGB 逐頻道、四捨五入（pct 是第一個顏色的百分比，和 CSS color-mix 的結果一致）；對比是 WCAG 相對亮度，門檻 0.03928
function lhRhymeMixRgb(fg, bg, pct) {
    return fg.map((v, i) => Math.round(v * pct / 100 + bg[i] * (100 - pct) / 100));
}
function lhRhymeContrast(a, b) {
    const lum = c => {
        const [r, g, bl] = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
        return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
    };
    const x = lum(a), y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
const LH_RHYME_NONE = 16;

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

// 一行裡所有的句尾：標點（全形半形）、空白、符號、emoji 這類「不是字也不是數字」的連續片段都是斷點，斷點前的那個字就是一個句尾，
// 行尾當然也是。回傳 [{ i, char, tail }]，由左到右；i 是以字元（code point）算的位置；tail 是以句尾字結尾、連續漢字、最多 4 個（手動讀音的鍵）。
// 連續標點、行首標點只是一段斷點，不會多出空句尾；英文單字之間的空白也是斷點，但英文字典查不到，本來就不上色（A4）。
// 語助詞（E1）：每個子句各自往前跳過語助詞；整個子句都是語助詞就不算一個句尾（「好想好想你，嗎」只有「你」）；整行都是語助詞才用最後一個字
function lhRhymeTargets(line, skipParticles) {
    const cs = Array.from(line), w = i => _LH_RHYME_WORD_RE.test(cs[i]);
    const ends = [], picks = [];
    for (let i = 0; i < cs.length; i++) if (w(i) && !(i + 1 < cs.length && w(i + 1))) ends.push(i);
    for (const e of ends) {
        let i = e;
        if (skipParticles) while (i >= 0 && w(i) && LH_RHYME_PARTICLES.has(cs[i])) i--;
        if (i >= 0 && w(i)) picks.push(i);
    }
    if (!picks.length && ends.length) picks.push(ends[ends.length - 1]);
    const out = [];
    for (const i of picks) {
        const char = cs[i];
        if (!charInfo[char]) continue;   // 字典查不到（英文、數字、符號）不上色、不計入（A4）
        let s = i;
        while (s > 0 && i - s < 3 && _LH_RHYME_HAN_RE.test(cs[s - 1])) s--;
        out.push({ i, char, tail: cs.slice(s, i + 1).join('') });
    }
    return out;
}

// 一行最後一個句尾（行尾那一句）：{ i, char, tail } 或 null。行尾是英文時退到前面最近一個中文句尾
function lhRhymeTarget(line, skipParticles) {
    const a = lhRhymeTargets(line, skipParticles);
    return a.length ? a[a.length - 1] : null;
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

// 句中押韻（E2）：行尾句尾字之前、讀音（字典第一讀音）的鍵與本段任何一個句尾相同的漢字，由左到右最多 3 個。
// 不含句尾字（含行中的句尾與多押的前字，由 skipIdx 給）、標點、字典查不到的字；語助詞開著時語助詞也不算。回傳 [{ i, f }]，i 是以字元算的位置，f 是顏色編號
function lhRhymeInner(line, t, tailKeys, strict, skip, skipIdx) {
    const out = [];
    const cs = Array.from(line);
    for (let i = 0; i < t.i && out.length < 3; i++) {
        const c = cs[i];
        if ((skipIdx && skipIdx.has(i)) || !_LH_RHYME_HAN_RE.test(c) || !charInfo[c] || (skip && LH_RHYME_PARTICLES.has(c))) continue;
        const infos = getCharAllReadings(c);
        if (!infos.length) continue;
        const rhyme = getZhuyinRhyme(infos[0].reading);
        if (tailKeys.has(lhRhymeKey(rhyme, strict))) out.push({ i, f: lhRhymeColor(rhyme) });
    }
    return out;
}

// 句尾往前每個字的韻母：[句尾的韻, 前一字的韻, …]，只看 tail 裡的連續漢字（最多 4 個）。
// 句尾的韻是已經照讀音優先序算好的 rhyme；前面的字優先用「以句尾結尾的詞庫詞」的讀音（4→2 字），沒有才用字典第一讀音
function lhRhymeTailRhymes(t, rhyme) {
    const cs = Array.from(t.tail), out = [rhyme];
    let syl = null;
    for (let n = cs.length; n >= 2 && !syl; n--) {
        const z = wordPhoneticMap.get(cs.slice(-n).join(''));
        if (z && z.split(' ').length === n) syl = z.split(' ');
    }
    for (let k = 1; k < cs.length; k++) {
        let r = syl && k < syl.length ? syl[syl.length - 1 - k] : null;
        if (!r) {
            const infos = getCharAllReadings(cs[cs.length - 1 - k]);
            if (!infos.length) break;
            r = infos[0].reading;
        }
        out.push(getZhuyinRhyme(r));
    }
    return out;
}

// 雙押／多押：同段兩個同韻的句尾，從句尾往前逐字比韻母（lhRhymeMatch，跟著寬韻／嚴格），連續押到幾個字就是 ×幾。
// 兩邊同一位置是同一個字就停（重複句、「某個人／這個人」的「個」不算押，免得副歌重複整段亮起來）。
// 每個句尾記下它跟同段任何一句最多押到幾個字（e.multi，至少 1）
function lhRhymeMulti(ends, count, strict) {
    const groups = new Map();
    for (const e of ends) {
        if (count.get(e.key) < 2) continue;
        e.rs = lhRhymeTailRhymes(e.t, e.rhyme);
        e.cs = Array.from(e.t.tail).reverse();
        if (!groups.has(e.key)) groups.set(e.key, []);
        groups.get(e.key).push(e);
    }
    // ponytail: 同韻的句尾兩兩比，O(n²)；一段幾十句沒差，真的有上千句同韻再改成依前一字的韻分桶
    for (const g of groups.values()) {
        for (let x = 0; x < g.length; x++) {
            for (let y = x + 1; y < g.length; y++) {
                const a = g[x], b = g[y];
                let k = 1;
                while (k < a.rs.length && k < b.rs.length && a.cs[k] !== b.cs[k] && lhRhymeMatch(a.rs[k], b.rs[k], strict)) k++;
                if (k > a.multi) a.multi = k;
                if (k > b.multi) b.multi = k;
            }
        }
    }
    for (const e of ends) { delete e.rs; delete e.cs; }
}

// 分析一段歌詞：每個實體行一列。opts = { strict, skipParticles, inner, multi }
// 回傳 { rows, letters, count }：letters 是字母字串（每行一個、看行尾那一句；空行不佔位、沒有句尾的行是 '-'），count 是 鍵 → 句尾數（含行中的句尾）。
// 每列：ends 是這行所有句尾 [{ t, reading, rhyme, key, f, solo, manual, multi }]（由左到右）；t、reading、rhyme、key、f、solo、manual 照舊是行尾那一句的；
// inner（句中押韻的字，沒開就是空陣列）
function lhRhymeAnalyze(text, opts, readings) {
    const strict = !!(opts && opts.strict), skip = !opts || opts.skipParticles !== false;
    const all = [];
    const rows = text.replace(/\r\n?/g, '\n').split('\n').map(line => {
        const row = { line, blank: !line.trim(), t: null, reading: null, rhyme: null, key: null, f: null, letter: '', solo: false, inner: [], ends: [] };
        if (row.blank) return row;
        for (const t of lhRhymeTargets(line, skip)) {
            const reading = lhRhymeReading(t, readings);
            if (!reading) continue;
            const rhyme = getZhuyinRhyme(reading);
            const e = { t, reading, rhyme, key: lhRhymeKey(rhyme, strict), f: lhRhymeColor(rhyme), solo: false, manual: lhRhymeManual(t, readings) === reading, multi: 1 };
            row.ends.push(e);
            all.push(e);
        }
        const last = row.ends[row.ends.length - 1];
        if (last) Object.assign(row, { t: last.t, reading: last.reading, rhyme: last.rhyme, key: last.key, f: last.f, manual: last.manual });
        else row.letter = '-';
        return row;
    });
    const letterOf = new Map(), count = new Map();
    for (const e of all) count.set(e.key, (count.get(e.key) || 0) + 1);
    for (const e of all) e.solo = count.get(e.key) === 1;   // 孤句（B3）：整段只有這一個句尾是這個韻
    let letters = '';
    for (const r of rows) {
        if (r.blank) continue;
        if (r.key === null) { letters += '-'; continue; }
        if (!letterOf.has(r.key)) letterOf.set(r.key, LH_RHYME_ALPHA[letterOf.size] || '*');
        r.letter = letterOf.get(r.key);
        r.solo = r.ends[r.ends.length - 1].solo;
        letters += r.letter;
    }
    if (opts && opts.multi) lhRhymeMulti(all, count, strict);
    if (opts && opts.inner) {
        const tailKeys = new Set(count.keys());
        for (const r of rows) {
            if (!r.t) continue;
            const busy = new Set();   // 已經是句尾色塊的字，不再畫句中底線
            for (const e of r.ends) for (let k = 0; k < e.multi; k++) busy.add(e.t.i - k);
            r.inner = lhRhymeInner(r.line, r.t, tailKeys, strict, skip, busy);
        }
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
    // 雙押（×2）、多押（×3 以上）的句尾數，含行中的句尾；沒開多押偵測時兩個都是 0
    let m2 = 0, m3 = 0;
    for (const r of rows) for (const e of r.ends || []) { if (e.multi === 2) m2++; else if (e.multi >= 3) m3++; }
    return { n: rows.length, k, p: rows.length ? Math.round(k / rows.length * 100) : 0, groups, m2, m3 };
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
