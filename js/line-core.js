// ==================== 句構分析：純函式 ====================
// 純函式、不碰 DOM／儲存，Node 可直接載入（tests/line-core.spec.mjs 用 node:vm 載入這一支）。
// 負責：每行字數、斷句結構（明確斷點＋≥5 字片段的自動猜）、同類型段落的對照索引。
// 依賴的全域（_LH_WC_RE 在 sections-core.js、_LH_RHYME_HAN_RE 在 rhyme-core.js、wordPhoneticMap 在 state.js）都只在函式內部、執行期才讀，
// 所以載入順序不影響；wordPhoneticMap 在 switchLexiconPack 時會整個換成新的 Map，因此每次現讀，絕不存參照。

const LH_LINE_GUESS_MIN = 5;   // 沒有明確斷點、單位數 ≥ 這個才猜（CONTEXT A2）
const LH_LINE_WORD_MAX = 4;    // 詞庫的詞最長 4 字（CONTEXT A2）

// 一行的字數與斷句。has：詞存在嗎（測試可傳入；預設讀全域詞庫）。structs：這首歌手動／AI 指定的句構（鍵＝去頭尾空白的整行文字）。
// 單位切分用和 lhCountWords 同一個 _LH_WC_RE，所以「各組字數加總 = 字數」由構造保證；
// 相鄰兩個單位之間隔著任何沒被算進去的字元（空白、標點、emoji）就是明確斷點，不必維護標點清單；
// 漢字和英文字母直接黏在一起（麻雀in）也算斷點。
// 回傳 { n, frags, groups, guess, guessed, starts, src }：frags 是每個明確片段的字數；groups 是細分後的每一組；
// guess 與 groups 一一對應，true 代表機器猜的；starts 是每組第一個字的位置（以字元算，給雙押用）；src 是 'auto'／'ai'／'man'
let _lhLineCjk = null;   // 單一個中日韓字（_LH_CJK 在 sections-core.js，執行期才讀）
function lhLineAnalyze(line, has, structs) {
    const hasWord = has || (w => wordPhoneticMap.has(w));
    line = String(line);
    const frags = [], pos = [];
    let cur = null, prevEnd = -1, prevHan = false, cp = 0, last = 0;
    for (const m of line.matchAll(_LH_WC_RE)) {   // 'gu' 旗標：matchAll 會複製 regex，不污染 lastIndex
        const han = (_lhLineCjk ||= new RegExp('^' + _LH_CJK + '$', 'u')).test(m[0]);
        if (!cur || m.index !== prevEnd || han !== prevHan) { cur = []; frags.push(cur); }   // 中間有東西、或漢字和英文交界 → 明確斷點
        cur.push(m[0]);
        cp += Array.from(line.slice(last, m.index)).length;
        pos.push(cp);
        cp += Array.from(m[0]).length;
        last = m.index + m[0].length;
        prevEnd = last;
        prevHan = han;
    }
    if (!frags.length) return { n: 0, frags: [], groups: [], guess: [], guessed: false, starts: [], src: 'auto' };   // 空行、純標點：略過（A3）
    const n = pos.length, fl = frags.map(f => f.length);
    const startsOf = gs => { const o = []; let u = 0; for (const g of gs) { o.push(pos[u]); u += g; } return o; };
    // 手動／AI 指定的句構：加總必須等於字數，否則（歌詞改過）當作沒指定
    const own = structs && Object.prototype.hasOwnProperty.call(structs, line.trim()) ? structs[line.trim()] : null;
    if (own && Array.isArray(own.g) && own.g.reduce((x, y) => x + y, 0) === n) {
        return { n, frags: fl, groups: own.g.slice(), guess: own.g.map(() => false), guessed: false, starts: startsOf(own.g), src: own.src === 'ai' ? 'ai' : 'man' };
    }
    const groups = [], guess = [];
    for (const f of frags) {
        if (f.length < LH_LINE_GUESS_MIN) { groups.push(f.length); guess.push(false); continue; }
        // 前向最長詞優先；words 的每個元素是詞長（單位數）。只有純漢字視窗才查詞庫
        const words = [];
        for (let i = 0; i < f.length;) {
            let k = 1;
            if (_LH_RHYME_HAN_RE.test(f[i])) {
                for (let t = Math.min(LH_LINE_WORD_MAX, f.length - i); t >= 2; t--) {
                    let han = true;
                    for (let j = i; j < i + t; j++) if (!_LH_RHYME_HAN_RE.test(f[j])) { han = false; break; }
                    if (han && hasWord(f.slice(i, i + t).join(''))) { k = t; break; }
                }
            }
            words.push(k);
            i += k;
        }
        // 單字詞併進前一個詞；片段開頭的單字併進後一個詞
        const g = [];
        let lead = 0;
        for (const w of words) {
            if (w > 1) { g.push(w + lead); lead = 0; }
            else if (g.length) g[g.length - 1]++;
            else lead++;
        }
        if (lead) g.push(lead);
        // 機器真的切開了（兩組以上）才算「猜」；整段併成一組就跟沒猜一樣，不加記號
        const cut = g.length >= 2;
        for (const x of g) { groups.push(x); guess.push(cut); }
    }
    return { n, frags: fl, groups, guess, guessed: guess.some(Boolean), starts: startsOf(groups), src: 'auto' };
}

// 結構字串拆成片段：[{ text, guess }]。明確片段之間用「+」，片段被細分時寫成「11（4·2·3·2）」，括號那段是機器猜的就 guess＝true（畫成斜體）。
// 例：愛就愛吧 痛就痛吧 把心事都丟進杯子裡攪拌 → 4+4+11（4·2·3·2）。
// 手動／AI 的句構如果跨過了明確斷點（對不上片段），就直接寫成 4+4+2+…；少於兩組沒有結構（字數已經說明了）
function lhLineStructParts(r) {
    if (!r || r.groups.length < 2) return [];
    const fr = r.frags && r.frags.length ? r.frags : [r.groups.reduce((x, y) => x + y, 0)];
    const per = [];
    let gi = 0;
    for (const f of fr) {
        const sub = [];
        let sum = 0;
        while (gi < r.groups.length && sum < f) { sum += r.groups[gi]; sub.push(gi++); }
        if (sum !== f) return [{ text: r.groups.join('+'), guess: false }];
        per.push(sub);
    }
    const out = [];
    per.forEach((sub, k) => {
        const head = (k ? '+' : '') + fr[k];
        if (sub.length < 2) { out.push({ text: head, guess: false }); return; }
        out.push({ text: head, guess: false }, { text: '（' + sub.map(i => r.groups[i]).join('·') + '）', guess: sub.some(i => r.guess[i]) });
    });
    // 相鄰的非猜測段併起來，畫面上少幾個節點
    const merged = [];
    for (const p of out) {
        const l = merged[merged.length - 1];
        if (l && !l.guess && !p.guess) l.text += p.text; else merged.push(Object.assign({}, p));
    }
    return merged;
}

function lhLineStructText(r) {
    return lhLineStructParts(r).map(p => p.text).join('');
}

// 使用者在分析面板打的句構：「4+4+4+2+3+2」「4 4 4·2·3·2」「4+4+11（4·2·3·2）」都收；
// 括號裡有細分就用細分，數字之間任何非數字都算分隔。加總要等於 n，不然回 null
function lhLineParseStruct(s, n) {
    const t = String(s).replace(/\d+\s*[（(]([^）)]*)[）)]/g, '$1');
    const g = (t.match(/\d+/g) || []).map(Number);
    if (!g.length || g.some(x => x < 1) || g.reduce((x, y) => x + y, 0) !== n) return null;
    return g;
}

// 匯入／載入時整理句構表：鍵是 1–200 字的字串、值是 { g: 正整數陣列（≤60 組）, src: 'ai'|'man' }，最多 2000 筆
function lhLineCleanStructs(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const out = {};
    let n = 0;
    for (const k of Object.keys(raw)) {
        const v = raw[k];
        if (k.length < 1 || k.length > 200 || k === '__proto__' || !v || typeof v !== 'object' || !Array.isArray(v.g)) continue;
        if (!v.g.length || v.g.length > 60 || !v.g.every(x => Number.isInteger(x) && x > 0 && x < 1000)) continue;
        out[k] = { g: v.g.slice(), src: v.src === 'ai' ? 'ai' : 'man' };
        if (++n >= 2000) break;
    }
    return n ? out : null;
}

// 一段文字逐行的字數與結構（略過 n 為 0 的行），row 是原始行號；對照用的「第幾行」是這個陣列的位置（CONTEXT A3）
function lhLineRows(text, has, structs) {
    const out = [];
    String(text).replace(/\r\n?/g, '\n').split('\n').forEach((line, row) => {
        const r = lhLineAnalyze(line, has, structs);
        if (r.n > 0) out.push(Object.assign({ row }, r));
    });
    return out;
}

// 對照用的「同類」鍵：內建類型就是類型本身，自訂段落以去頭尾空白後的名稱算同類。
// 前綴 'custom:' 讓自訂段落取名叫 verse 也不會和內建 Verse 混在一起；11-02 的排程與下面的對照索引共用這一支，兩邊才會對「同類型」意見一致
function lhLineGroupKey(sec) {
    return sec.type === 'custom' ? 'custom:' + String(sec.custom || '').trim() : sec.type;
}

// 每一段的對照段落索引（沒有就是 -1）：同類型的第一段（CONTEXT B1，RESEARCH X4：Verse II、III 都對 Verse I，不是「最近的前一段」）。
// 用 Map 不用物件：'__proto__'、'constructor' 這類名稱打不到原型鍵
function lhLineRefIndex(sections) {
    const first = new Map();
    return sections.map((s, i) => {
        const k = lhLineGroupKey(s);
        if (!first.has(k)) { first.set(k, i); return -1; }
        return first.get(k);
    });
}
