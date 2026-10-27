// ==================== 句構分析：純函式 ====================
// 純函式、不碰 DOM／儲存，Node 可直接載入（tests/line-core.spec.mjs 用 node:vm 載入這一支）。
// 負責：每行字數、斷句結構（明確斷點＋≥5 字片段的自動猜）、同類型段落的對照索引。
// 依賴的全域（_LH_WC_RE 在 sections-core.js、_LH_RHYME_HAN_RE 在 rhyme-core.js、wordPhoneticMap 在 state.js）都只在函式內部、執行期才讀，
// 所以載入順序不影響；wordPhoneticMap 在 switchLexiconPack 時會整個換成新的 Map，因此每次現讀，絕不存參照。

const LH_LINE_GUESS_MIN = 5;   // 沒有明確斷點、單位數 ≥ 這個才猜（CONTEXT A2）
const LH_LINE_WORD_MAX = 4;    // 詞庫的詞最長 4 字（CONTEXT A2）

// 一行的字數與斷句。has：詞存在嗎（測試可傳入；預設讀全域詞庫）。
// 單位切分用和 lhCountWords 同一個 _LH_WC_RE，所以「各組字數加總 = 字數」由構造保證；
// 相鄰兩個單位之間隔著任何沒被算進去的字元（空白、標點、emoji）就是明確斷點，不必維護標點清單。
// 回傳 { n, groups, guess, guessed }：guess 與 groups 一一對應，true 代表這一組是機器猜的（CONTEXT A2：自己標的和機器猜的要分得出來）
function lhLineAnalyze(line, has) {
    const hasWord = has || (w => wordPhoneticMap.has(w));
    const frags = [];
    let cur = null, prevEnd = -1;
    for (const m of String(line).matchAll(_LH_WC_RE)) {   // 'gu' 旗標：matchAll 會複製 regex，不污染 lastIndex
        if (!cur || m.index !== prevEnd) { cur = []; frags.push(cur); }   // 與前一單位之間有東西 → 明確斷點
        cur.push(m[0]);
        prevEnd = m.index + m[0].length;
    }
    if (!frags.length) return { n: 0, groups: [], guess: [], guessed: false };   // 空行、純標點：略過（A3）
    const groups = [], guess = [];
    let n = 0;
    for (const f of frags) {
        n += f.length;
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
    return { n, groups, guess, guessed: guess.some(Boolean) };
}

// 結構字串拆成連續的「自己標的／機器猜的」段落：[{ text, guess }]。少於兩組沒有結構（字數已經說明了）。
// 只有猜的那一段以「≈」開頭；兩段之間的「+」歸給自己標的那一段（接在它後面或前面），所以猜的那段永遠以「≈」開頭，
// 畫面上只有它會變斜體（月光 灑在 窗前 夢裡想起你的臉 → 「2+2+2+」「≈2+2+3」）
function lhLineStructParts(r) {
    if (!r || r.groups.length < 2) return [];
    const runs = [];
    r.groups.forEach((g, i) => {
        const guess = !!r.guess[i];
        const last = runs[runs.length - 1];
        if (last && last.guess === guess) last.g.push(g);
        else runs.push({ guess, g: [g] });
    });
    return runs.map((run, i) => {
        let text = run.g.join('+');
        if (run.guess) text = '≈' + text;
        else {
            if (i > 0) text = '+' + text;                   // 前面接著猜的段落
            if (i < runs.length - 1) text += '+';           // 後面接著猜的段落
        }
        return { text, guess: run.guess };
    });
}

function lhLineStructText(r) {
    return lhLineStructParts(r).map(p => p.text).join('');
}

// 一段文字逐行的字數與結構（略過 n 為 0 的行），row 是原始行號；對照用的「第幾行」是這個陣列的位置（CONTEXT A3）
function lhLineRows(text, has) {
    const out = [];
    String(text).replace(/\r\n?/g, '\n').split('\n').forEach((line, row) => {
        const r = lhLineAnalyze(line, has);
        if (r.n > 0) out.push({ row, n: r.n, groups: r.groups, guess: r.guess, guessed: r.guessed });
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
