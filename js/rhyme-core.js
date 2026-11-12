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
    multi: true, autoColor: true, hoverOnly: false, line: false, lnRhyme: false, lnCount: true, lnSplit: true, lnDiff: false, autoHover: false,
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
// 17 色：0–15 依 RHYME_FAMILIES 順序，16 是沒有家族的韻（空韻 ㄓㄔㄕㄖㄗㄘㄙ 等）用的中性灰。
// 選色方式（overnight/rhyme，數字見 OVERNIGHT-rhyme.md）：用 OKLCH 每 22.5° 取一個色相，在「混進卡片底色後的亮度」固定的前提下把彩度拉到最高，
// 再把顏色重新分配給韻族，讓編號相鄰與發音相近的韻族（ㄢ／ㄧㄢ、ㄣ／ㄥ／ㄧㄣ、ㄤ／ㄨㄥ、ㄝ／ㄞ…）色差最大（含紅綠色盲模擬）。
// light 組給亮底：色塊比舊版深，對底色更明顯，深色字仍 ≥ 6:1；dark 組給暗底：色塊亮度壓在淺色字 4.5:1 的上限附近、彩度拉高。
// 哪一組由卡片底色的實際亮度決定（rhyme-map.js 的 _lhMapBgDark），不是看主題名稱
const LH_RHYME_COLORS = Object.freeze({
    light: Object.freeze(['#017967', '#4f26a7', '#5b3403', '#951283', '#3d3d02', '#067490', '#074a28', '#427300',
        '#0f4064', '#9744c1', '#034649', '#7d600a', '#cf387c', '#3b5edf', '#be0c32', '#c04a06', '#828288']),
    dark: Object.freeze(['#0e9ca2', '#e2590e', '#4a70f2', '#04a35e', '#df5fc8', '#d37e01', '#e64a8e', '#9476ff',
        '#ff5e69', '#ab55d7', '#9b7802', '#078d78', '#90910f', '#0593e6', '#508809', '#0e87a7', '#7c7c82'])
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
function lhRhymeTargets(line, skipParticles, starts) {
    const cs = Array.from(line), w = i => _LH_RHYME_WORD_RE.test(cs[i]);
    const ends = [], picks = [];
    for (let i = 0; i < cs.length; i++) {
        if (!w(i) || (i + 1 < cs.length && w(i + 1))) continue;
        // 英文片語只算最後一個字（slow down calm down 只有最後的 down）：後面隔著空白又接英文字母就不是句尾
        if (_LH_EN_RE.test(cs[i])) {
            if (/['’]/.test(cs[i + 1] || '') && _LH_EN_RE.test(cs[i + 2] || '')) continue;   // who's、don't：撇號後面還是同一個字
            let j = i + 1;
            while (j < cs.length && /[ \t\u3000]/.test(cs[j])) j++;
            if (j < cs.length && _LH_EN_RE.test(cs[j])) continue;
        }
        ends.push(i);
    }
    for (const e of ends) {
        let i = e;
        if (skipParticles) while (i >= 0 && w(i) && LH_RHYME_PARTICLES.has(cs[i])) i--;
        if (i >= 0 && w(i)) picks.push(i);
    }
    if (!picks.length && ends.length) picks.push(ends[ends.length - 1]);
    const out = [];
    for (const i of picks) {
        const char = cs[i];
        if (_LH_EN_RE.test(char)) {   // 英文字：整個字一起上色，讀音是對到的注音韻母（字表還沒載好就先不上色）
            let s = i;
            while (s > 0 && /[A-Za-z'’]/.test(cs[s - 1])) s--;
            const word = cs.slice(s, i + 1).join('');
            const en = lhEnRhyme(word);
            if (en) out.push({ i, s, char: word, tail: word, en });
            continue;
        }
        if (!charInfo[char]) continue;   // 字典查不到（數字、符號）不上色、不計入（A4）
        // 雙押只在同一個「句構詞」裡往前比：最多 4 個連續漢字，而且不跨過句構的斷點（starts＝每組開頭的位置）
        let s = i;
        while (s > 0 && i - s < 3 && _LH_RHYME_HAN_RE.test(cs[s - 1]) && !(starts && starts.has(s))) s--;
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
    if (t.en) return t.en;
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
function lhRhymeInner(line, t, tailKeys, strict, skip, skipIdx, colorOf) {
    const out = [];
    const cs = Array.from(line);
    for (let i = 0; i < t.i && out.length < 3; i++) {
        const c = cs[i];
        if ((skipIdx && skipIdx.has(i)) || !_LH_RHYME_HAN_RE.test(c) || !charInfo[c] || (skip && LH_RHYME_PARTICLES.has(c))) continue;
        const infos = getCharAllReadings(c);
        if (!infos.length) continue;
        const rhyme = getZhuyinRhyme(infos[0].reading);
        const k = lhRhymeKey(rhyme, strict);
        if (tailKeys.has(k)) out.push({ i, f: lhRhymeColor(rhyme), c: colorOf ? colorOf.get(k) : undefined, k });
    }
    return out;
}

// 句尾往前每個字的韻母：[句尾的韻, 前一字的韻, …]，只看 tail 裡的連續漢字（最多 4 個）。
// 句尾的韻是已經照讀音優先序算好的 rhyme；前面的字優先用「以句尾結尾的詞庫詞」的讀音（4→2 字），沒有才用字典第一讀音
function lhRhymeTailRhymes(t, rhyme) {
    if (t.en) return [rhyme];   // ponytail: 英文不做雙押，要做再比前一個字的母音
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
                if (a.cs[0] === b.cs[0]) continue;   // 句尾同一個字（亮／亮）：同字不算押韻對比（Andy 2026-11-13）
                let k = 1;
                while (k < a.rs.length && k < b.rs.length && a.cs[k] !== b.cs[k] && lhRhymeMatch(a.rs[k], b.rs[k], strict)) k++;
                // 疊字（好好）整組都是同一個字：不算雙押
                const same = e => e.cs.slice(0, k).every(c => c === e.cs[0]);
                if (k > 1 && (same(a) || same(b))) k = 1;
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
        // 句構的組頭（有 line-core 才有；手動、AI 的句構也在這裡生效）：雙押不跨過它
        const starts = typeof lhLineAnalyze === 'function' ? new Set(lhLineAnalyze(line, undefined, opts && opts.structs).starts) : null;
        for (const t of lhRhymeTargets(line, skip, starts)) {
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
    if (opts && opts.palette) {   // 自動配色：靠近的不同韻換成色差最大的顏色
        const slot = lhRhymeAutoColors(rows, opts.palette);
        // f 永遠是韻族（語意），c 是畫面實際用的顏色編號（只有自動配色才有）
        for (const r of rows) { for (const e of r.ends) if (slot.has(e.key)) e.c = slot.get(e.key); if (r.t) r.c = r.ends[r.ends.length - 1].c; }
    }
    if (opts && opts.inner) {
        const tailKeys = new Set(count.keys()), colorOf = new Map();
        for (const e of all) if (e.c !== undefined) colorOf.set(e.key, e.c);
        for (const r of rows) {
            if (!r.t) continue;
            const busy = new Set();   // 已經是句尾色塊的字，不再畫句中底線
            for (const e of r.ends) for (let k = 0; k < e.multi; k++) busy.add(e.t.i - k);
            r.inner = lhRhymeInner(r.line, r.t, tailKeys, strict, skip, busy, colorOf);
        }
    }
    return { rows, letters, count };
}

// ==================== 英文押韻 ====================
// 字表 data/en-rhyme.json（CMU 發音辭典，scripts/build-en-rhyme.mjs 產生）：「最後一個母音＋後面子音」→ 字。
// 中英互押：英文的最後一個母音（加上鼻音韻尾 N／M、NG）對到最接近的注音韻母，於是 house 和「好」同一族、down 和「當」同一族
const _LH_EN_RE = /[A-Za-z]/;
let _lhEnDict = null;   // 字 → 鍵（"AW S"）；null＝還沒載入
function lhEnSetDict(obj) {
    _lhEnDict = new Map();
    for (const k of Object.keys(obj || {})) for (const w of String(obj[k]).split(' ')) _lhEnDict.set(w, k);
}
// 母音 → [沒有鼻音韻尾, 收 N／M, 收 NG]
const LH_EN_VOWEL = {
    AA: ['ㄚ', 'ㄢ', 'ㄤ'], AE: ['ㄝ', 'ㄢ', 'ㄤ'], AH: ['ㄜ', 'ㄣ', 'ㄤ'], AO: ['ㄛ', 'ㄤ', 'ㄨㄥ'], AW: ['ㄠ', 'ㄤ', 'ㄤ'],
    AY: ['ㄞ', 'ㄞ', 'ㄞ'], EH: ['ㄝ', 'ㄣ', 'ㄥ'], ER: ['ㄦ', 'ㄣ', 'ㄥ'], EY: ['ㄟ', 'ㄟ', 'ㄟ'], IH: ['ㄧ', 'ㄧㄣ', 'ㄧㄥ'],
    IY: ['ㄧ', 'ㄧㄣ', 'ㄧㄥ'], OW: ['ㄡ', 'ㄡ', 'ㄨㄥ'], OY: ['ㄛ', 'ㄛ', 'ㄛ'], UH: ['ㄨ', 'ㄨㄣ', 'ㄨㄥ'], UW: ['ㄨ', 'ㄨㄣ', 'ㄨㄥ'],
};
function lhEnKeyRhyme(key) {
    const [v, c] = key.split(' '), m = LH_EN_VOWEL[v];
    if (!m) return null;
    if (v === 'AH' && !c) return 'ㄚ';   // 字尾的弱音 a（sofa、data）
    return m[c === 'N' || c === 'M' ? 1 : c === 'NG' ? 2 : 0];
}
// 字表沒有的字（俚語、自創字）照拼字猜：最後一組母音字母＋後面的子音
// ponytail: 拼字規則很粗，只求常見結尾大致對；猜錯可以之後加例外表
const LH_EN_SPELL = [[/(ee|ea|ie|y|i)$/, 'ㄧ'], [/(ay|ey|ai|ei|a_e)$/, 'ㄟ'], [/(ow|ou)$/, 'ㄠ'], [/(oo|ue|u|ew)$/, 'ㄨ'], [/(oy|oi)$/, 'ㄛ'],
    [/(o|oe|oa)$/, 'ㄡ'], [/a$/, 'ㄚ'], [/e$/, 'ㄝ']];
function lhEnGuess(word) {
    let w = word.toLowerCase().replace(/['’]s$/, '').replace(/([^aeiou])e$/, '$1');
    const m = /([aeiouy]+)([^aeiouy]*)$/.exec(w);
    if (!m) return null;
    const nas = /^(n|m|nd|nt|ns)$/.test(m[2]) ? 1 : /^(ng|nk)$/.test(m[2]) ? 2 : 0;
    const v = m[1];
    if (nas) return ({ a: ['ㄢ', 'ㄤ'], e: ['ㄣ', 'ㄥ'], i: ['ㄧㄣ', 'ㄧㄥ'], o: ['ㄤ', 'ㄨㄥ'], u: ['ㄣ', 'ㄨㄥ'] })[v.slice(-1)]?.[nas - 1] || null;
    for (const [re, z] of LH_EN_SPELL) if (re.test(v)) return z;
    return null;
}
function lhEnRhyme(word) {
    if (!_lhEnDict) return null;
    const w = word.toLowerCase().replace(/’/g, "'");
    const k = _lhEnDict.get(w);
    return k ? lhEnKeyRhyme(k) : lhEnGuess(w);
}

// ==================== 自動配色 ====================
// 在一段裡，靠得近（前後 4 行內）的不同韻，換成彼此色差最大的顏色；離得遠的可以重複用。
// 色差用 OKLab 距離。依出現順序一個一個挑：先挑還沒用過的顏色，同分再看跟鄰居的最小色差。回傳 鍵 → 顏色編號（0–15）
const LH_RHYME_NEAR = 4;
function _lhOklab(hex) {
    const c = [1, 3, 5].map(i => { const v = parseInt(hex.slice(i, i + 2), 16) / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    const l = Math.cbrt(0.4122214708 * c[0] + 0.5363325363 * c[1] + 0.0514459929 * c[2]);
    const m = Math.cbrt(0.2119034982 * c[0] + 0.6806995451 * c[1] + 0.1073969566 * c[2]);
    const s = Math.cbrt(0.0883024619 * c[0] + 0.2817188376 * c[1] + 0.6299787005 * c[2]);
    return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
function lhRhymeAutoColors(rows, palette) {
    const lab = palette.slice(0, 16).map(_lhOklab);
    const d = (a, b) => Math.hypot(lab[a][0] - lab[b][0], lab[a][1] - lab[b][1], lab[a][2] - lab[b][2]);
    const order = [], near = new Map(), lines = [];
    rows.forEach((r, n) => { for (const e of r.ends) if (RHYME_TO_FAMILY[e.rhyme] !== undefined) lines.push([n, e.key]); });   // 空韻維持灰色
    lines.forEach(([n, k], i) => {
        if (!near.has(k)) { near.set(k, new Set()); order.push(k); }
        for (let j = i - 1; j >= 0 && n - lines[j][0] <= LH_RHYME_NEAR; j--) if (lines[j][1] !== k) near.get(k).add(lines[j][1]);
        for (let j = i + 1; j < lines.length && lines[j][0] - n <= LH_RHYME_NEAR; j++) if (lines[j][1] !== k) near.get(k).add(lines[j][1]);
    });
    const slot = new Map(), used = new Set();
    for (const k of order) {
        let best = 0, score = -Infinity;
        for (let c = 0; c < lab.length; c++) {
            let min = 9;
            for (const k2 of near.get(k)) if (slot.has(k2)) min = Math.min(min, d(c, slot.get(k2)));
            const sc = (used.has(c) ? 0 : 10) + min;
            if (sc > score) { score = sc; best = c; }
        }
        slot.set(k, best);
        used.add(best);
    }
    return slot;
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
        groups.push({ letter: r.letter, label: strict ? (r.rhyme || '空韻') : (fam === undefined ? '空韻' : RHYME_FAMILIES[fam].label), count: c, f: r.f, c: r.c });
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
