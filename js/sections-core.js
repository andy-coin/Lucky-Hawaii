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
    const pos = lhSecPosClean(s.pos);   // 自由畫布的卡片位置；沒用過畫布就沒有這個欄位
    return {
        type: hasType ? s.type : inf.type,
        custom,
        color: typeof s.color === 'string' && LH_SEC_COLOR_RE.test(s.color) ? s.color.toLowerCase() : '',
        height: Number.isFinite(s.height) && s.height >= LH_SEC_H_MIN && s.height <= LH_SEC_H_MAX ? Math.round(s.height * 10) / 10 : null,
        ...lhSecColFields(s),
        ...(pos ? { pos } : {})
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

// 匯出、列印用：把整段文字切成 [{ text, k, head }]，k＝角色在 roles 裡的序號（-1＝沒標角色），接起來就是原文。
// head＝這一段前面要不要標「[角色名]」：段落裡第一次出現的角色、換角色、或同角色中間夾了沒標角色的非空白字之後再出現才標；
// 只隔空白、換行的同角色不重複標（一行一行唱同一個人，不用每行都標）。
// 標記開頭的空白、換行歸給前面沒標角色的那段，這樣標籤會貼著字：「…\n[女]你愛我」而不是「…[女]\n你愛我」。不認得的角色當作沒標。
function lhMarksParts(text, marks, roles) {
    const idx = new Map(roles.map((r, i) => [r.id, i]));
    const out = [];
    let pos = 0, lastK = -1, dirty = false;   // dirty＝上一個角色段之後，出現了沒標角色的非空白字
    const plain = t => {
        if (!t) return;
        const p = out[out.length - 1];
        if (p && p.k < 0) p.text += t;
        else out.push({ text: t, k: -1, head: false });
        if (/\S/.test(t)) dirty = true;
    };
    for (const m of marks || []) {
        const k = idx.has(m.r) ? idx.get(m.r) : -1;
        const a = Math.max(m.a, pos), b = Math.min(m.b, text.length);
        if (k < 0 || a >= b) continue;
        plain(text.slice(pos, a));
        const ws = text.slice(a, b).match(/^\s*/)[0].length;
        plain(text.slice(a, a + ws));
        const run = text.slice(a + ws, b);
        if (run) {
            out.push({ text: run, k, head: k !== lastK || dirty });
            lastK = k; dirty = false;
        }
        pos = b;
    }
    plain(text.slice(pos));
    return out;
}

// parts 接成帶標籤的字串：head 的段落前面加「[角色名]」
function lhMarksTagText(parts, roles) {
    return parts.map(p => (p.head ? '[' + roles[p.k].name + ']' : '') + p.text).join('');
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
        if (!f.pos) delete s.pos;
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

// ==================== 自由畫布（完整編輯器的「自由」排版）：純函式 ====================
// 單位是畫布 px（100% 時等於 CSS px，不受 --ui-scale 影響）。全部回傳新物件、不改輸入：復原歷史的快照是淺拷貝。
const LH_CV_W = 360, LH_CV_GAP = 24, LH_CV_ORIGIN = 24, LH_CV_COLS = 3;
const LH_CV_WMIN = 160, LH_CV_WMAX = 2400, LH_CV_HMIN = 96, LH_CV_HMAX = 2400;
const LH_CV_MAX = 100000;                                   // x／y 上限
const LH_CV_HEAD = 72, LH_CV_LINE = 28, LH_CV_HDEF = 600;   // 預設高度：標題列＋行數，封頂
const LH_CV_PUSH_MAX = 400;                                 // 推開次數上限

const _lhCvNum = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(v)));

// 卡片位置 {x, y, w, h}：四個都要是有限數字才收，四捨五入並夾進範圍；其他一律 null（回預設排列）
function lhSecPosClean(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const { x, y, w, h } = raw;
    if (![x, y, w, h].every(v => typeof v === 'number' && Number.isFinite(v))) return null;
    return { x: _lhCvNum(x, 0, LH_CV_MAX), y: _lhCvNum(y, 0, LH_CV_MAX), w: _lhCvNum(w, LH_CV_WMIN, LH_CV_WMAX), h: _lhCvNum(h, LH_CV_HMIN, LH_CV_HMAX) };
}

// 歌的排版設定 { mode }：不是物件就 null；mode 只認 'free'，其他都是 'snap'。
// 縮放與平移在 Part B（0.96.33）加進這裡；存進歌裡的 canvas 永遠必須是這支函式的輸出
function lhCanvasClean(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    return { mode: raw.mode === 'free' ? 'free' : 'snap' };
}

// 沒有位置的卡片預設高度：標題列＋行數（至少 3 行），封頂
function lhCanvasDefaultH(text) {
    const lines = String(text == null ? '' : text).split('\n').length;
    return Math.min(LH_CV_HDEF, Math.max(LH_CV_HMIN, LH_CV_HEAD + LH_CV_LINE * Math.max(3, lines)));
}

// 每張卡片現在的矩形（與 sections 同順序）：有可用 pos 的用 pos，其餘從「最低的有位置卡片」下面起排成 3 欄。
// 這裡不寫回模型；canvas.js 第一次移動時才把全部矩形寫進 s.pos，沒動過的卡片不會跳位置
function lhCanvasLayout(sections) {
    const rects = sections.map(s => lhSecPosClean(s && s.pos));
    let top = LH_CV_ORIGIN;
    const placed = rects.filter(Boolean);
    if (placed.length) top = Math.max(...placed.map(r => r.y + r.h)) + LH_CV_GAP;
    let col = 0, rowH = 0;
    sections.forEach((s, i) => {
        if (rects[i]) return;
        const h = lhCanvasDefaultH(s && s.text);
        rects[i] = { x: LH_CV_ORIGIN + col * (LH_CV_W + LH_CV_GAP), y: top, w: LH_CV_W, h };
        rowH = Math.max(rowH, h);
        if (++col >= LH_CV_COLS) { col = 0; top += rowH + LH_CV_GAP; rowH = 0; }
    });
    return rects;
}

// 放手後推開重疊的卡片（D-03）。fixed＝放下那張的索引，不會被推。
// 規則：被壓到的卡片往 右／下／左／上 中位移最小的一邊移到留 24px 間隙（x、y 不會變負；平手依這個順序），被推的再去推別人（佇列）。
// 先把輸入整理成有限數字並夾住範圍、零面積不算重疊；推開有次數上限（每次取出前檢查），超過後仍重疊的卡片依序搬到全部卡片的最下方（每次重算最低點），所以一定會結束且最後不重疊。
// ponytail: 先到先推的簡單規則，不是最佳排列；若作詞人嫌連鎖推開太遠，再改成排列演算法
function lhCanvasPushApart(rects, fixed, maxIter = LH_CV_PUSH_MAX) {
    const cl = (v, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(0, v)) : 0);
    const r = rects.map(o => ({ x: cl(o && o.x, LH_CV_MAX), y: cl(o && o.y, LH_CV_MAX), w: cl(o && o.w, LH_CV_WMAX), h: cl(o && o.h, LH_CV_HMAX) }));
    const ov = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    const queue = [fixed];
    let pushes = 0;
    while (queue.length && pushes < maxIter) {
        const ai = queue.shift(), A = r[ai];
        if (!A) continue;
        for (let i = 0; i < r.length; i++) {
            if (i === fixed || i === ai || !ov(A, r[i])) continue;
            const B = r[i];
            const cand = [['x', A.x + A.w + LH_CV_GAP - B.x], ['y', A.y + A.h + LH_CV_GAP - B.y],
                ['x', A.x - LH_CV_GAP - B.w - B.x], ['y', A.y - LH_CV_GAP - B.h - B.y]].filter(([k, d]) => B[k] + d >= 0);
            let best = null;
            for (const c of cand) if (!best || Math.abs(c[1]) < Math.abs(best[1])) best = c;
            if (best) { B[best[0]] += best[1]; queue.push(i); pushes++; }
        }
    }
    for (let i = 0; i < r.length; i++) {
        if (i === fixed) continue;
        if (r.some((o, j) => j !== i && ov(o, r[i]))) r[i].y = Math.max(...r.map(o => o.y + o.h)) + LH_CV_GAP;
    }
    return r;
}
