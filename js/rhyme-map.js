// ==================== 韻腳地圖：鏡像層與排程 ====================
// 每個段落輸入框後面有一個一模一樣排版的透明文字層（div.rhyme-mirror，js/lyrics.js 建好）；句尾字在這一層包成色塊，
// 輸入框本身（節點、內容、游標、選取）完全不動，所以注音組字不受影響（CONTEXT B1、G2）。
// 判定全部來自 js/rhyme-core.js；這支檔案只負責：讀模型文字、排程（打字停 200 毫秒才算、組字中完全不碰）、畫色塊、對齊位置。
// 最後載入：lhSec*、curSong、_lhComposing 都已存在。畫面一律 createElement／textContent，不拼 HTML。

const LH_MAP_DEBOUNCE = 200;       // 打字停這麼久才重算（F1）
const LH_MAP_MAXWAIT = 1000;       // 連續打字最久等這麼久就算一次
const LH_MAP_MAX_LINES = 5000;     // 超過這麼多行的段落不分析（字數上限沿用 LH_WD_BIG）
const LH_MAP_HEX = /^#[0-9a-f]{6}$/;

let _lhMapSet = lhRhymeNormalizeSettings(lhGetJSON('lh:map', null));   // 目前的開關；儲存裡的值壞了就退回預設（UI-SPEC 9.1 error）
let _lhMapOk = false;              // 字典、歌曲就緒就可以畫逐行標記的字數與明確斷點（詞庫沒載好也行，CONTEXT A4）
let _lhMapWl = false;              // 詞庫也結束（成功或失敗）才做韻腳分析與猜斷句（A5）
let _lhMapEpoch = 0;               // 詞庫換包時加一，讓快取失效
let _lhMapReadVer = 0;             // 手動讀音變動時加一，讓快取失效
const _lhMapCache = new Map();     // 段落 id → { text, sig }：同文字同設定就不重畫
const _lhMapPending = new Set();   // 等著重算的段落 id
let _lhMapTimer = 0;
let _lhMapFirstAt = 0;             // 這一批第一次編輯的時間

// 色塊混進去的底（--card-bg）夠暗就用 dark 組：量的是實際算出來的顏色，不是主題名稱，所以主題的底色以後怎麼改都會跟著。
// 判斷法和「這個底上該放白字還是黑字」一樣：對白色的對比比對黑色高就算暗。量不到（還沒有 body、底色透明）才退回看 data-theme
let _lhMapBgDark = false;
let _lhMapBgProbe = null;
function _lhMapMeasureBg() {
    if (!document.body) return document.documentElement.getAttribute('data-theme') === 'dark';
    if (!_lhMapBgProbe) {
        _lhMapBgProbe = document.createElement('span');
        _lhMapBgProbe.hidden = true;
        _lhMapBgProbe.style.background = 'var(--card-bg)';
    }
    if (!_lhMapBgProbe.isConnected) document.body.appendChild(_lhMapBgProbe);
    const m = getComputedStyle(_lhMapBgProbe).backgroundColor.match(/[\d.]+/g);
    if (!m || m.length < 3 || (m.length > 3 && +m[3] === 0)) return document.documentElement.getAttribute('data-theme') === 'dark';
    const bg = m.slice(0, 3).map(Number);
    return lhRhymeContrast(bg, [255, 255, 255]) > lhRhymeContrast(bg, [0, 0, 0]);
}
// 一個韻族目前實際用的顏色：使用者自訂的（lh:map.colors，日夜共用，已整理成小寫 #rrggbb），沒有就用目前底色那一組的預設色
function _lhMapEffColor(n) {
    const c = n < 16 ? _lhMapSet.colors[String(n)] : undefined;
    return c || (_lhMapBgDark ? LH_RHYME_COLORS.dark : LH_RHYME_COLORS.light)[n];
}
// 17 色寫成 CSS 變數 --rm-c0…--rm-c16：自訂色優先，其次依底色亮度選 dark／light 組（色碼只存在 JS 與 lh:map，CSS 不寫色碼）
function lhMapApplyPalette() {
    _lhMapBgDark = _lhMapMeasureBg();
    for (let n = 0; n <= LH_RHYME_NONE; n++) {
        const hex = _lhMapEffColor(n);
        if (LH_MAP_HEX.test(hex)) document.documentElement.style.setProperty('--rm-c' + n, hex);
    }
}
// 版面外觀（第 11 階段）：位置、字級、欄寬都只改 <html> 的屬性與 CSS 變數，不重畫、不重新分析（RESEARCH Pattern 8）。
// 寫進 style.setProperty 的值一律來自下面這幾張常數表，絕不直接用儲存裡的字串
const LH_MAP_LOOK_KEYS = new Set(['pos', 'size', 'depth', 'autoHover']);   // 這幾個設定只影響 CSS 或行為，改了不必重畫鏡像層
const LH_MAP_SIZE_REM = { s: 0.75, m: 0.875, l: 1 };           // 標記字級（UI-SPEC D-21）
const LH_MAP_COL_EM = { lnRhyme: 2.25, lnCount: 1.5, lnDiff: 2.25 };   // 斷句結構改畫在行下面，不佔右欄；行尾韻腳改寫注音（最多三個符號）   // 靠右欄各欄寬度（單位 em，UI-SPEC 3.2）；欄與欄之間再加 0.5em
// 逐行標記有沒有內容要顯示：總開關開著，而且四個內容項至少開一個
function _lhMapNeedMk() {
    return _lhMapSet.line && (_lhMapSet.lnRhyme || _lhMapSet.lnCount || _lhMapSet.lnSplit || _lhMapSet.lnDiff);   // lnSplit 也算：畫括號要逐行排版
}
function lhMapApplyLook() {
    document.documentElement.toggleAttribute('data-rm-hover', !!_lhMapSet.hoverOnly);
    document.documentElement.toggleAttribute('data-lm-under', !!(_lhMapSet.line && _lhMapSet.lnSplit));   // 行距拉開，留位置畫斷句括號
    const root = document.documentElement;
    // 欄位的有無只看設定、不看文字內容（X3）：不然打下第一個字的瞬間輸入框內距會變，輸入框會跳版
    if (_lhMapNeedMk()) root.setAttribute('data-lm', _lhMapSet.pos);
    else root.removeAttribute('data-lm');
    const rem = LH_MAP_SIZE_REM[_lhMapSet.size];
    const cols = Object.keys(LH_MAP_COL_EM).filter(k => _lhMapSet[k]);
    const em = cols.reduce((a, k) => a + LH_MAP_COL_EM[k], 0) + 0.5 * Math.max(0, cols.length - 1);
    root.style.setProperty('--lm-fs', rem + 'rem');
    root.style.setProperty('--lm-cols', (em * rem) + 'rem');
    const dp = LH_MAP_DEPTH[_lhMapSet.depth];   // 句尾上色濃淡：[主色塊, 孤句] 百分比，只從常數表取
    root.style.setProperty('--rm-end', dp[0] + '%');
    root.style.setProperty('--rm-orph', dp[1] + '%');
    lhMapApplyPalette();
    if (_lhComposing) return;   // 組字中不量版面；下一次畫的時候會對齊
    document.querySelectorAll('#lyricsSections .section-textarea').forEach(ta => {
        const mirror = _lhMapMirrorOf(ta);
        if (mirror) _lhMapSync(ta, mirror);   // 輸入框內距變了，鏡像層要馬上複製，ResizeObserver 不會因為內距改變而觸發
    });
}
lhMapApplyLook();
// 日夜主題切換（applyTheme 改 <html data-theme>）：換一組色票就好，不必重畫——色塊讀的是 CSS 變數；偏好設定的色票跟著顯示新主題的預設色
new MutationObserver(() => { lhMapApplyPalette(); lhMapMenuSync(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

// 鏡像層位置與大小由輸入框自己的框決定（桌機輸入框比 .section-body 矮，不能用 inset: 0）；
// 右邊補上輸入框的捲軸寬，換行位置才會和輸入框逐字相同
function _lhMapSync(ta, mirror) {
    const cs = getComputedStyle(ta);
    const bar = ta.offsetWidth - ta.clientWidth - (parseFloat(cs.borderLeftWidth) || 0) - (parseFloat(cs.borderRightWidth) || 0);
    mirror.style.left = ta.offsetLeft + 'px';
    mirror.style.top = ta.offsetTop + 'px';
    mirror.style.width = ta.offsetWidth + 'px';
    mirror.style.height = ta.offsetHeight + 'px';
    mirror.style.paddingRight = ((parseFloat(cs.paddingRight) || 0) + Math.max(0, bar)) + 'px';   // 靠右欄開著時，輸入框的內距已含欄寬，一併複製
    mirror.style.setProperty('--lm-bar', Math.max(0, bar) + 'px');   // 標記靠右欄時要讓開捲軸
    mirror.scrollTop = ta.scrollTop;
    mirror.scrollLeft = ta.scrollLeft;
}

function _lhMapMirrorOf(ta) {
    const m = ta.previousElementSibling;
    return m && m.classList.contains('rhyme-mirror') ? m : null;
}

// 行尾空白（半形、全形、tab）要留在換行旁邊、標記插在它前面：標記夾在行尾空白與換行之間，會破壞 pre-wrap 行尾空白的懸掛，讓該行多折一列（X1）
const _LH_TRAIL_WS = /[ \t\u3000]+$/;

// 把一行的斷句結構畫進 el：自己標的是文字節點，機器猜的那一段是 span.lm-guess（斜體）；回傳有沒有畫出東西（少於兩組就沒有結構）。
// 逐行標記與句構分析面板共用，兩邊的斜體規則才會一樣
function _lhMapStructInto(el, r) {
    const parts = lhLineStructParts(r);
    for (const part of parts) {
        if (part.guess) el.append(_lhMk('span', 'lm-guess', part.text));
        else el.append(part.text);
    }
    return parts.length > 0;
}

// 一行的標記：字數與斷句結構（以及對照差異），沒有可分析內容的行（空行、純標點）回 null（A3）。文字一律 textContent。
// row：韻腳分析的這一行（沒有分析就是 undefined，行尾韻腳字母留空欄位）。
// diff：{ refN, k }，refN 是對照段落各「可分析行」的字數，k 是這個段落目前數到第幾個可分析行（CONTEXT B3：照可分析行的順序對，不是照原始行號）
function _lhMapMarker(line, diff, row, structs) {
    const r = lhLineAnalyze(line, undefined, structs);
    if (r.n <= 0) return null;
    const mk = _lhMk('span', 'lm-mk');
    if (_lhMapSet.lnRhyme) {
        const t = _lhMk('span', 'lm-t lm-t-r', row ? row.label || '-' : '');   // 直接寫韻腳；沒有韻腳是「-」，底下畫家族色（和標題列同一套）
        if (row && row.key !== null) _lhMapTint(t, row);
        mk.append(t);
    }
    if (_lhMapSet.lnCount) mk.append(_lhMk('span', 'lm-t lm-t-c', String(r.n)));
    if (_lhMapSet.lnDiff) {
        const b = diff.refN[diff.k];   // 對照段落沒有這一行（比較短）就是 undefined，什麼都不加
        mk.append(_lhMk('span', 'lm-t lm-t-d', b !== undefined && b !== r.n ? '≠' + b : ''));   // 空的 span 也要留著，欄位才對得齊
    }
    diff.k++;
    // 斷句結構不在右欄了：改畫在每行下面（_lhMapBuildFrag 的 .lm-g）
    return mk;
}

// 把一段文字依目前設定建成鏡像層的 DocumentFragment（真實鏡像層與之後的預覽共用）。回傳 { frag, res, on }：
// res 是韻腳分析結果（沒有任何韻腳功能開著就是 null），on 代表至少畫了一個色塊、底線或標記
// 上色：data-f 是韻族（語意、測試看它），data-c 是自動配色後畫面實際用的顏色（CSS 裡 data-c 排在後面、蓋過 data-f）
function _lhMapTint(el, o) {
    el.dataset.f = String(o.f);
    if (o.c !== undefined) el.dataset.c = String(o.c);
    if (o.k !== undefined) el.dataset.k = o.k;   // 押韻鍵：「滑過才顯示」用它找同韻的字
}

// 英文押韻字表：歌詞（或預覽）裡第一次出現英文字母才去載，載好全部重畫
let _lhMapEnLoading = null;
function _lhMapEnLoad() {
    if (_lhMapEnLoading) return;
    _lhMapEnLoading = fetch('data/en-rhyme.json?v=0.96.34').then(r => r.json()).then(o => {
        lhEnSetDict(o);
        // 只重畫有英文的段落（其他段落的標記節點不動）
        const box = document.getElementById('lyricsSections');
        for (const el of box ? box.children : []) {
            const hit = _lhMapCache.get(el.dataset.id);
            if (hit && /[A-Za-z]/.test(hit.text)) { _lhMapCache.delete(el.dataset.id); lhMapPaint(el); }
        }
        _lhMapPreviewPaint();
    }).catch(e => lhWarn('英文押韻字表載入失敗', e));
}

// rl（選用）：{ marks, idx } 角色標記；idx＝角色 id → 0..7（顏色槽）。標記範圍包進 span.rl，淡底疊在韻腳色塊下面
function _lhMapBuildFrag(text, readings, refText, structs, rl) {
    const S = _lhMapSet;
    if (!_lhEnDict && _lhMapWl && /[A-Za-z]/.test(text)) _lhMapEnLoad();
    const needMk = !!_lhMapNeedMk();
    const needRhyme = _lhMapWl && (S.end || S.inner || S.letters || (S.line && S.lnRhyme));   // 詞庫沒載好前不做韻腳分析
    const paintRows = (_lhMapWl && (S.end || S.inner)) || needMk || !!rl;   // 只開結構字母：鏡像層不必逐行排版
    const res = needRhyme ? lhRhymeAnalyze(text, { strict: S.strict, skipParticles: S.skipParticles, inner: S.inner, multi: S.multi, structs,
        palette: S.autoColor ? Array.from({ length: 16 }, (_, n) => _lhMapEffColor(n)) : null }, readings) : null;
    const frag = document.createDocumentFragment();
    let on = false;
    // 對照差異：對照段落每個可分析行的字數（只要字數，不猜斷句，所以傳一個永遠說「沒有這個詞」的判斷）
    const diff = { refN: S.line && S.lnDiff ? lhLineRows(refText || '', () => false).map(x => x.n) : [], k: 0 };
    const rows = !paintRows ? [] : res ? res.rows : text.replace(/\r\n?/g, '\n').split('\n').map(line => ({ line, t: null, inner: [], ends: [] }));
    let off = 0, mi = 0;   // off：這一行第一個字在整段文字裡的 UTF-16 位置；mi：目前對到的角色標記
    rows.forEach((r, n) => {
        const rowOff = off;
        off += r.line.length + 1;
        let hasRl = false;
        if (rl) {
            while (mi < rl.marks.length && rl.marks[mi].b <= rowOff) mi++;
            hasRl = mi < rl.marks.length && rl.marks[mi].a < rowOff + r.line.length;
        }
        // 這一行要特別標示的字：每個句尾字（色塊，句尾上色開著才有；行中逗號、空白前的也算）、
        // 雙押／多押時句尾前面跟著押的字（同色淡一層，底下一條同色細線把整組連起來）與句中押韻的字（底線）
        const marks = new Map();
        if (S.end) for (const m of r.inner) marks.set(m.i, { cls: 'rm-inner', f: m.f, c: m.c, k: m.k });   // 模式「關閉」連句中底線也不畫
        if (S.end) {
            for (const e of r.ends) {
                const mx = S.multi && e.multi > 1 ? ' rm-mx' : '';
                const hl = { cls: (e.solo ? 'rm-hl rm-solo' : 'rm-hl') + (e.manual ? ' rm-manual' : '') + mx, f: e.f, c: e.c, k: e.key };
                for (let k = e.t.s ?? e.t.i; k <= e.t.i; k++) marks.set(k, hl);   // 英文字整個字上色
                if (mx) for (let k = 1; k < e.multi; k++) marks.set(e.t.i - k, { cls: 'rm-multi rm-mx', f: e.f, c: e.c, k: e.key });
            }
        }
        const mk = needMk ? _lhMapMarker(r.line, diff, res ? r : undefined, structs) : null;
        // 斷句結構畫在這一行下面：每一組字包成 span.lm-g（data-n＝字數），CSS 用偽元素畫小括號和數字，不改版面寬度
        const ga = S.line && S.lnSplit ? lhLineAnalyze(r.line, undefined, structs) : null;
        const gs = new Map();
        if (ga && ga.groups.length >= 2) ga.groups.forEach((g, k) => gs.set(ga.starts[k], { n: g, end: ga.ends[k], guess: ga.guess[k] }));
        if (!marks.size && !mk && !gs.size && !hasRl) frag.append(r.line);
        else {
            const m = mk && _LH_TRAIL_WS.exec(r.line);
            const core = m ? r.line.slice(0, m.index) : r.line;
            let buf = '', dst = frag, gEnd = -1;
            let sp = null, prev = null;
            let rsp = null, rslot = -1, u = 0;   // rsp：目前的角色底色 span；rslot：它的顏色槽（-1＝沒有角色；-2＝強制重開）
            const flush = () => { if (buf) { (rsp || dst).append(buf); buf = ''; } };
            Array.from(core).forEach((c, i) => {
                const g = gs.get(i);
                if (g) {
                    flush();
                    rsp = null; rslot = -2;
                    const ge = _lhMk('span', 'lm-g' + (g.guess ? ' lm-g-guess' : ''));
                    ge.dataset.n = String(g.n);
                    frag.append(ge);
                    dst = ge; gEnd = g.end; prev = null;
                }
                if (hasRl) {
                    const o = rowOff + u;
                    u += c.length;
                    while (mi < rl.marks.length && rl.marks[mi].b <= o) mi++;
                    const slot = mi < rl.marks.length && rl.marks[mi].a <= o ? rl.idx.get(rl.marks[mi].r) : -1;
                    if (slot !== rslot) {
                        flush();
                        prev = null;
                        rsp = null;
                        if (slot >= 0) {
                            rsp = _lhMk('span', 'rl');
                            rsp.dataset.rl = String(slot);
                            dst.append(rsp);
                        }
                        rslot = slot;
                    }
                }
                const hit = marks.get(i);
                if (!hit) { buf += c; prev = null; }
                else if (hit === prev) sp.textContent += c;   // 英文字整個字同一個色塊
                else {
                    flush();
                    sp = document.createElement('span');
                    sp.className = hit.cls;
                    _lhMapTint(sp, hit);
                    sp.textContent = c;
                    (rsp || dst).append(sp);
                    prev = hit;
                }
                if (i === gEnd - 1) { flush(); dst = frag; prev = null; rsp = null; rslot = -2; }
            });
            flush();
            if (mk) frag.append(mk);
            if (m) frag.append(m[0]);
            on = true;
        }
        if (n < rows.length - 1) frag.append('\n');
    });
    if (paintRows) frag.append('​');   // 結尾零寬字元：文字以換行結尾時，和輸入框一樣多出一個空行
    return { frag, res, on };
}

// 角色欄（並排的第 2 欄以後）：各自分析、各自上色，不做對照與統計。回傳有沒有畫出東西
// ponytail: 每次都整欄重畫，沒有快取；欄很長才需要像第一欄一樣比對文字
function _lhMapPaintCols(secEl, sec, song) {
    let on = false;
    const S = _lhMapSet;
    for (const t of secEl.querySelectorAll('.section-col-ta')) {
        const m = _lhMapMirrorOf(t), c = sec.cols && sec.cols[+t.dataset.col - 1];
        if (!m || !c) continue;
        const okSize = c.text.length <= LH_WD_BIG && c.text.split('\n').length <= LH_MAP_MAX_LINES;
        if (okSize && ((_lhMapWl && (S.end || S.inner)) || _lhMapNeedMk())) {
            const b = _lhMapBuildFrag(c.text, song.readings, null, song.structs);
            m.replaceChildren(b.frag);
            on = on || b.on;
        } else m.replaceChildren();
        _lhMapRO.observe(t);   // 已經在看的再 observe 一次不會重複
        m.classList.remove('rm-stale', 'lm-typing');
        _lhMapSync(t, m);
    }
    return on;
}

// 畫一段：從模型讀文字（不讀輸入框，G2），一次 replaceChildren
function lhMapPaint(secEl) {
    const song = curSong();
    const sec = song && secEl && song.sections.find(x => x.id === secEl.dataset.id);
    const ta = secEl && secEl.querySelector('.section-textarea');
    const mirror = ta && _lhMapMirrorOf(ta);
    if (!sec || !mirror) return;
    const S = _lhMapSet;
    const sig = [S.end, S.letters, S.inner, S.multi, S.autoColor, S.strict, S.skipParticles, S.line, S.lnRhyme, S.lnCount, S.lnSplit, S.lnDiff].map(Number).join('') + '|' + _lhMapEpoch + '|' + _lhMapReadVer + '|' + (song.roles || []).map(r => r.id).join(',');   // pos／size／depth／colors 只改 CSS，不進簽名（E2）
    // 對照段落的文字（同類型第一段，CONTEXT B1）：對照差異關著就不看；它改了，這一段的快取就失效（RESEARCH X9）
    let refText = null;
    if (S.line && S.lnDiff) {
        const r = lhLineRefIndex(song.sections)[song.sections.indexOf(sec)];
        refText = r >= 0 ? song.sections[r].text : null;
    }
    const colOn = _lhMapPaintCols(secEl, sec, song);
    // 角色標記：只留認得的角色（刪掉的角色留下的標記不畫）；槽號＝角色在清單裡的順序，對應 --rl0..--rl7
    const idx = new Map((song.roles || []).map((r, k) => [r.id, k]));
    const rlm = (sec.marks || []).filter(m => idx.has(m.r));
    const rl = rlm.length ? { marks: rlm, idx } : null;
    const hit = _lhMapCache.get(sec.id);
    if (hit && hit.text === sec.text && hit.sig === sig && hit.ref === refText && hit.marks === sec.marks) {   // 沒變：只把「暫時藏起來」解除，不重畫
        mirror.classList.remove('rm-stale', 'lm-typing');
        secEl.classList.toggle('rm-on', hit.on || colOn);
        _lhMapSync(ta, mirror);
        return;
    }
    const text = sec.text;
    let on = false, res = null;
    const big = text.length > LH_WD_BIG || text.split('\n').length > LH_MAP_MAX_LINES;
    // 句尾上色、句中押韻、結構字母、逐行標記全關，或段落太大：完全不分析，和第 9 階段一樣（D-18、D-17）
    if (!((_lhMapWl && (S.end || S.inner || S.letters)) || _lhMapNeedMk() || rl) || big) {
        mirror.replaceChildren();   // 關掉或太大：不分析，鏡像層留空
    } else {
        const built = _lhMapBuildFrag(text, song.readings, refText, song.structs, rl);
        res = built.res;
        on = built.on;
        mirror.replaceChildren(built.frag);
    }
    secEl.classList.toggle('rm-on', on || colOn);
    mirror.classList.remove('rm-stale', 'lm-typing');
    _lhMapSync(ta, mirror);   // 顯示出來之後才設得動 scrollTop，所以放在最後
    _lhMapCache.set(sec.id, { text, sig, res, ref: refText, on, marks: sec.marks });
    _lhMapStrip(secEl, res, big);
}

// 標題列的結構字母條：結構字母開著、而且這段至少有一行有韻才顯示；太大的段落顯示「—」。只在 lhMapPaint 裡更新（組字中不會走到這裡）
function _lhMapStrip(secEl, res, big) {
    const strip = secEl.querySelector('.section-rhyme');
    if (!strip) return;
    const show = _lhMapSet.letters && (big || (res && res.count.size > 0));
    if (!show) {
        strip.hidden = true;
        strip.replaceChildren();
        strip.removeAttribute('aria-label');
        strip.removeAttribute('title');
    } else if (big) {
        strip.replaceChildren('—');
        strip.setAttribute('aria-label', '押韻結構 —，按一下看統計');
        strip.title = '段落太長，不做押韻分析';
        strip.hidden = false;
    } else {
        const rows = res.rows.filter(r => !r.blank);
        const { n, k } = lhRhymeSummary(res, _lhMapSet.strict);
        const kids = rows.slice(0, 12).map(r => {
            const sp = document.createElement('span');
            sp.textContent = r.label || '-';   // 直接寫韻腳（ㄤㄤㄠㄠ），不用 AABB
            sp.dataset.letter = r.letter || '-';   // 結構字母留在屬性上（測試與日後的 AABB 檢視用）
            if (r.key !== null) _lhMapTint(sp, r);
            return sp;
        });
        if (rows.length > 12) kids.push(document.createTextNode('…'));
        strip.replaceChildren(...kids);
        const labels = rows.map(r => r.label || '-').join(' ');
        strip.setAttribute('aria-label', '押韻結構 ' + labels + '，按一下看統計');
        strip.title = labels + '　押韻 ' + k + '/' + n + ' 句，點一下看統計';
        strip.hidden = false;
    }
    if (typeof _lhMapStatsRefresh === 'function') _lhMapStatsRefresh(secEl.dataset.id);
}

// 同步量位置：所有輸入框共用一個 ResizeObserver（捲軸出現／消失、拖高度、縮放、收合展開都會觸發）。
// 組字中不動，下一次畫的時候才對齊，不在組字中改鏡像層
const _lhMapRO = new ResizeObserver(entries => {
    for (const e of entries) {
        const mirror = _lhMapMirrorOf(e.target);
        if (!mirror) continue;
        if (!_lhComposing) _lhMapSync(e.target, mirror);
    }
});

// 整個重畫（開機、換歌、列表重畫、詞庫換包）：同步執行，打字不走這裡
function lhMapRenderAll() {
    if (!_lhMapOk) return;
    const box = document.getElementById('lyricsSections');
    if (!box) return;
    _lhMapCache.clear();
    _lhMapPending.clear();
    _lhMapRO.disconnect();
    if (_lhMapStatsOn && !lhSecEl(_lhMapStatsSec)) lhMapCloseStats(false);   // 開著統計的段落已經不在了
    for (const el of box.children) {
        const ta = el.querySelector('.section-textarea');
        if (ta) _lhMapRO.observe(ta);
        lhMapPaint(el);
    }
}

// 排程一段：打字停 200 毫秒才算，連續打字最久 1 秒算一次；組字中不排程（compositionend 後 lhSecCountOne 會再叫一次）
function lhMapSchedule(secEl) {
    if (!_lhMapOk || _lhComposing || !secEl) return;
    const now = Date.now();
    if (!_lhMapPending.size) _lhMapFirstAt = now;
    _lhMapPending.add(secEl.dataset.id);
    // 對照差異開著：同類型的其他段落（它們拿這一段當對照）一起排；沒變的會在 lhMapPaint 的快取比對直接略過
    const song = _lhMapSet.line && _lhMapSet.lnDiff ? curSong() : null;
    const sec = song && song.sections.find(x => x.id === secEl.dataset.id);
    if (sec) {
        const key = lhLineGroupKey(sec);
        for (const o of song.sections) if (o !== sec && lhLineGroupKey(o) === key && lhSecEl(o.id)) _lhMapPending.add(o.id);
    }
    clearTimeout(_lhMapTimer);
    _lhMapTimer = setTimeout(_lhMapFlush, Math.max(0, Math.min(LH_MAP_DEBOUNCE, _lhMapFirstAt + LH_MAP_MAXWAIT - now)));
}

// 段落的類型、名稱或順序改了（lhSecRefreshMeta）：對照段落可能換人，對照差異開著時每段都重排；沒變的會被快取略過
function lhMapOnSectionsChanged() {
    if (!_lhMapSet.line || !_lhMapSet.lnDiff) return;
    for (const el of document.getElementById('lyricsSections').children) lhMapSchedule(el);
}

function _lhMapFlush() {
    _lhMapTimer = 0;
    // 一次只畫一段，畫完還有就再排一次：對照差異開著時同類型的段落會一起排，全塞在同一個任務裡會變成長任務（11-02 實測）
    const run = () => {
        if (_lhComposing) return;   // 組字中完全不動；確認後會重新排程，待算的段落還留在清單裡
        const id = _lhMapPending.values().next().value;
        if (id === undefined) return;
        _lhMapPending.delete(id);
        const el = lhSecEl(id);
        if (el) lhMapPaint(el);
        if (_lhMapPending.size && !_lhMapTimer) _lhMapFlush();
    };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 500 });
    else setTimeout(run, 0);
}

// 詞庫換包（之後由 switchLexiconPack 呼叫）：讀音來源變了，全部重算
function lhMapOnLexiconChange() {
    _lhMapEpoch++;
    lhMapMenuSync();   // 偏好設定裡「詞庫載入中」的提醒跟著收起來
    lhMapRenderAll();
}

// 輸入框捲動時鏡像層跟著捲；組字中不讀不寫，只把鏡像層暫時藏起來（class 切換，不增減節點），組字結束的重畫會重新對齊
document.getElementById('lyricsSections').addEventListener('scroll', e => {
    const ta = e.target;
    if (!ta.classList || !(ta.classList.contains('section-textarea') || ta.classList.contains('section-col-ta'))) return;
    const mirror = _lhMapMirrorOf(ta);
    if (!mirror) return;
    if (_lhComposing) mirror.classList.add('rm-stale');
    else { mirror.scrollTop = ta.scrollTop; mirror.scrollLeft = ta.scrollLeft; }   // 角色欄不換行，會左右捲
}, true);

// 過期規則（UI-SPEC D-06）：行尾打字（含注音組字中的預選字）色塊照舊留著；
// 行數變了、或改動不在行尾（改的是句中），色塊可能對到錯的字，就先藏起來（只切 class，鏡像層不增減節點、不量版面），重畫時解除。
// 不看游標：組字中游標會停在預選字中間（CDP 與部分輸入法都是），改成比「這次輸入前後」的模型文字找出改動的範圍。
// 比的是上一次 input 的文字（單次改動範圍很小）；藏起來的 class 一路留著，直到重畫才解除。lyrics.js 的 input 監聽先跑，模型已是新文字
function _lhMapMovesBand(a, b) {
    const n = Math.min(a.length, b.length);
    let p = 0;
    while (p < n && a.charCodeAt(p) === b.charCodeAt(p)) p++;
    let s = 0;
    while (s < n - p && a.charCodeAt(a.length - 1 - s) === b.charCodeAt(b.length - 1 - s)) s++;
    const aEnd = a.length - s, bEnd = b.length - s;
    if (a.indexOf('\n', p) !== -1 && a.indexOf('\n', p) < aEnd) return true;    // 動到換行
    if (b.indexOf('\n', p) !== -1 && b.indexOf('\n', p) < bEnd) return true;
    return a.length > aEnd && a[aEnd] !== '\n';   // 改動後面還接著同一行的字：句中修改
}
document.getElementById('lyricsSections').addEventListener('input', e => {
    const ta = e.target;
    if (!ta.classList || !ta.classList.contains('section-textarea')) return;
    const secEl = ta.closest('.lyrics-section');
    if (!secEl || !secEl.classList.contains('rm-on')) return;
    const mirror = _lhMapMirrorOf(ta);
    const hit = _lhMapCache.get(secEl.dataset.id);
    const song = curSong();
    const sec = song && song.sections.find(x => x.id === secEl.dataset.id);
    if (!mirror || !hit || !sec) return;
    const prev = hit.last !== undefined ? hit.last : hit.text;
    hit.last = sec.text;
    if (_lhMapMovesBand(prev, sec.text)) mirror.classList.add('rm-stale');
    // 句尾後：標記緊貼在行尾，剛打的字會蓋到還沒更新的舊標記，所以先只把標記藏起來（色塊照舊）；靠右欄的標記在欄位裡，不會撞到字（UI-SPEC D-06）。
    // 一樣只切 class、不增減鏡像層的節點，組字中也合法；重畫時一起解除
    else if (_lhMapSet.pos === 'tail' && mirror.querySelector('.lm-mk')) mirror.classList.add('lm-typing');
}, false);

// ==================== 「韻腳 ▾」選單（E3、UI-SPEC D-12／D-13／D-14） ====================
// 選單只建一次（掛在 body，沿用 .word-ctx-menu.section-menu 的外觀）；每個開關改了就馬上套用、寫進 lh:map，選單不關
let _lhMapMenu = null;
let _lhMapMenuOn = false;
// 文案照 UI-SPEC 第 7 節逐字
const LH_MAP_HINT_LETTERS = '在每個段落標題列，依序列出每一行的韻腳（例如 ㄤㄤㄠㄠ）';
const LH_MAP_HINT_LINE = '打開後照細項顯示：行尾韻腳、字數靠右，斷句結構畫在每行下面；細項在「更多設定」';
const LH_MAP_HINT_MULTI = '句尾倒數兩、三個字都押韻時（例：離開／你來），前面的字也淡淡上同色，底下一條細線連起來';
const LH_MAP_HINT_INNER = '同一行裡，跟這行最後一個字同韻母的字加底線（只比韻母、不比子音；每行最多 3 個）';
const LH_MAP_MODE_HELP = {
    wide: '寬韻：同一個韻族都算押韻（例：ㄤ、ㄧㄤ、ㄨㄤ）',
    strict: '嚴格：韻母要完全一樣才算押韻（例：ㄤ 和 ㄧㄤ 不同）',
};
const LH_MAP_PARTICLE_CAP = '略過：' + Array.from(LH_RHYME_PARTICLES).join('、');   // 順序與 UI-SPEC 一致：啊、呀、哪…

// 判定：寬韻／嚴格兩個 radio。選單與偏好設定各建一組，行為一樣：方向鍵只移焦點（roving tabindex），Enter／空白才選（走外層的點擊）
function _lhMapRadioKeys(group) {
    group.addEventListener('keydown', e => {
        const k = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        const rows = [...group.children];
        const i = rows.indexOf(document.activeElement);
        if (!k || i < 0 || e.isComposing || e.keyCode === 229) return;
        e.preventDefault();
        rows.forEach(r => r.tabIndex = -1);
        const next = rows[(i + k + rows.length) % rows.length];
        next.tabIndex = 0;
        next.focus({ preventScroll: true });
    });
}
function _lhMapModeRadios() {
    const modes = _lhMk('div', 'type-grid');
    modes.setAttribute('role', 'radiogroup');
    modes.setAttribute('aria-label', '押韻判定');
    for (const [id, name] of [['wide', '寬韻'], ['strict', '嚴格']]) {
        const r = _lhMkBtn('type-row', name);
        r.setAttribute('role', 'radio');
        r.dataset.m = id;
        modes.appendChild(r);
    }
    _lhMapRadioKeys(modes);
    return modes;
}

// 「顯示方式」的單選組：每個選項是 .type-row[data-k][data-v]，值只是列舉字串，點了走 lhMapSetSetting（它會驗證）。
// cols3：三個選項排三欄
function _lhMapLookRadios(label, key, items, cols3) {
    const g = _lhMk('div', cols3 ? 'type-grid type-grid-3' : 'type-grid');
    g.setAttribute('role', 'radiogroup');
    g.setAttribute('aria-label', label);
    for (const [v, name] of items) {
        const r = _lhMkBtn('type-row', name);
        r.setAttribute('role', 'radio');
        r.dataset.k = key;
        r.dataset.v = v;
        g.appendChild(r);
    }
    _lhMapRadioKeys(g);
    return g;
}
const LH_MAP_HOVER_HINT = '反白後滑鼠停著不動 1.5 秒，自動打開句構面板；只有接了滑鼠的電腦會自動出現，觸控請按「分析」';
const LH_MAP_DEPTH_HELP = '濃：色塊比較明顯，深色主題下有些顏色的字會比較不好讀';   // 只有選「濃」時才顯示
// 目前位置的說明文字（UI-SPEC 第 7 節逐字）
const LH_MAP_POS_HELP = {
    right: '靠右欄：輸入框右邊留一條欄位，數字上下對齊，但寫字的寬度會少一點',
    tail: '句尾後：標記緊貼每行最後一個字，不佔寬度；行太滿時會被輸入框邊緣切掉',
};

// 開關一列：文字＋右邊的「開／關」藥丸（狀態用字不用色，D-14）
function _lhMapSwitchRow(key, label) {
    const b = _lhMkBtn('rm-switch', '');
    b.setAttribute('role', 'switch');
    b.dataset.k = key;
    b.append(_lhMk('span', 'rm-switch-label', label), _lhMk('span', 'rm-pill', ''));
    return b;
}

function lhMapMenuBuild() {
    if (_lhMapMenu) return _lhMapMenu;
    const m = _lhMk('div', 'word-ctx-menu section-menu');
    m.id = 'rhymeMenu';
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-label', '韻腳地圖設定');
    // 詞庫還沒載好時的提示（A5）：載好後隱藏，控制項一直可用
    const loading = _lhMk('div', 'section-menu-cap rm-loading', '詞庫載入中，載好後會自動上色');
    loading.hidden = _lhMapWl;
    const lettersSw = _lhMapSwitchRow('letters', '段落結構');
    const lettersHint = _lhMk('span', 'section-menu-cap', LH_MAP_HINT_LETTERS);
    lettersHint.id = 'rhymeHintLetters';
    lettersSw.setAttribute('aria-describedby', lettersHint.id);
    const lineSw = _lhMapSwitchRow('line', '句構判定');
    const lineHint = _lhMk('span', 'section-menu-cap', LH_MAP_HINT_LINE);
    lineHint.id = 'rhymeHintLine';
    lineSw.setAttribute('aria-describedby', lineHint.id);
    // 快速選單只留四樣（Andy 2026-11-13）：模式三鈕、段落結構、句構判定、寬韻／嚴格；其他在「更多設定…」
    const show = _lhMkBlock('顯示', _lhMapModeSeg(), lettersSw, lettersHint, lineSw, lineHint);
    // 判定：寬韻／嚴格兩個 radio，下面只顯示目前模式的說明
    const modes = _lhMapModeRadios();
    const help = _lhMk('span', 'section-menu-cap rm-mode-help');
    const judge = _lhMkBlock('判定', modes, help);
    // 句中押韻、語助詞、色票對照搬到「更多設定…」（偏好設定裡有韻族顏色）
    const more = _lhMkBtn('section-menu-btn rm-more', '更多設定…');   // 開偏好設定裡的完整設定（CONTEXT D1）
    // 沒有「關閉」鈕（R2）：點選單外面任何地方或按 Esc 就收起來（下面的 pointerdown／keydown）
    m.append(_lhMk('div', 'section-menu-title', '韻腳地圖'), loading, show, judge, more);
    document.body.appendChild(m);
    m.addEventListener('click', e => {
        const seg = e.target.closest && e.target.closest('.rm-seg-btn');
        if (seg) lhMapSetMode(seg.dataset.mode);
        const sw = e.target.closest && e.target.closest('.rm-switch');
        if (sw) lhMapSetSetting(sw.dataset.k, sw.getAttribute('aria-checked') !== 'true');
        const r = e.target.closest && e.target.closest('.type-row');
        if (r) lhMapSetSetting('strict', r.dataset.m === 'strict');
    });
    more.addEventListener('click', lhMapOpenPrefs);
    // Tab 在選單裡頭尾相接
    m.addEventListener('keydown', e => {
        if (e.key !== 'Tab') return;
        const items = [...m.querySelectorAll('button')].filter(n => n.tabIndex >= 0 && n.offsetParent !== null);
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    _lhMapMenu = m;
    return m;
}

// 依目前設定更新兩處開關的字與 aria 狀態：「韻腳 ▾」選單與偏好設定裡的段落，一邊改了另一邊馬上跟著變（CONTEXT D1）
function lhMapMenuSync() {
    document.documentElement.toggleAttribute('data-rm-hover', !!_lhMapSet.hoverOnly);
    const mapMode = _lhMapMode();
    document.querySelectorAll('.rm-seg-btn').forEach(b => {
        const on = b.dataset.mode === mapMode;
        b.classList.toggle('active', on);
        b.setAttribute('aria-checked', String(on));
    });
    document.querySelectorAll('#rhymeMenu .rm-switch, #mapSettingsSection .rm-switch').forEach(b => {
        const on = !!_lhMapSet[b.dataset.k];
        b.setAttribute('aria-checked', String(on));
        b.querySelector('.rm-pill').textContent = on ? '開' : '關';
    });
    const mode = _lhMapSet.strict ? 'strict' : 'wide';
    document.querySelectorAll('#rhymeMenu .type-row[data-m], #mapSettingsSection .type-row[data-m]').forEach(r => {
        const on = r.dataset.m === mode;
        r.setAttribute('aria-checked', String(on));
        r.tabIndex = on ? 0 : -1;
    });
    document.querySelectorAll('#rhymeMenu .rm-mode-help, #mapSettingsSection .rm-mode-help').forEach(h => { h.textContent = LH_MAP_MODE_HELP[mode]; });
    // 顯示方式的單選：目前值加粗、roving tabindex；說明文字跟著目前值
    document.querySelectorAll('#mapSettingsSection .type-row[data-k]').forEach(r => {
        const on = String(_lhMapSet[r.dataset.k]) === r.dataset.v;
        r.setAttribute('aria-checked', String(on));
        r.tabIndex = on ? 0 : -1;
    });
    document.querySelectorAll('#mapSettingsSection .rm-pos-help').forEach(h => { h.textContent = LH_MAP_POS_HELP[_lhMapSet.pos]; });
    document.querySelectorAll('#mapSettingsSection .rm-depth-help').forEach(h => { h.hidden = _lhMapSet.depth !== 'heavy'; });
    if (_lhMapMenu) _lhMapMenu.querySelector('.rm-loading').hidden = _lhMapWl;
    document.querySelectorAll('#mapSettingsSection .rm-colors input[data-n]').forEach(i => { i.value = _lhMapEffColor(+i.dataset.n); });
    const rst = document.querySelector('#mapSettingsSection .rm-color-reset');
    if (rst) {
        const none = !Object.keys(_lhMapSet.colors).length;
        rst.setAttribute('aria-disabled', String(none));
        if (none) _lhMapDisarm(rst);
    }
    _lhMapColorAdvice();
    // 偏好設定的兩行提醒：詞庫還沒載好（猜的斷句稍後補上）、四個細項都關著（Pitfall 7、UI-SPEC D-17、D-18）
    const wait = document.querySelector('#mapSettingsSection .rm-lex-wait');
    if (wait) wait.hidden = wordPhoneticMap.size > 0;
    const none = document.querySelector('#mapSettingsSection .rm-none');
    if (none) none.hidden = !(_lhMapSet.line && !_lhMapSet.lnRhyme && !_lhMapSet.lnCount && !_lhMapSet.lnSplit && !_lhMapSet.lnDiff);
    _lhMapPreviewPaint();   // 預覽跟著任何設定變動重畫（設定、別的分頁、詞庫載好、主題都會走到這裡）
}

// ==================== 偏好設定裡的「韻腳地圖與句構分析」（第 11 階段，CONTEXT D1／D2） ====================
// 外殼是 index.html 的分頁 <div id="mapSettingsSection" role="tabpanel">，內容第一次切到這個分頁（或按「更多設定…」）才建，之後只靠 lhMapMenuSync 更新
let _lhMapPrefsBuilt = false;

// 一個開關加它的說明：說明有自己的 id，開關用 aria-describedby 接起來
function _lhMapPrefRow(key, label, cap, capId) {
    const sw = _lhMapSwitchRow(key, label);
    const c = _lhMk('span', 'section-menu-cap', cap);
    c.id = capId;
    sw.setAttribute('aria-describedby', capId);
    return [sw, c];
}

function lhMapPrefsBuild() {
    const sec = document.getElementById('mapSettingsSection');
    if (!sec || _lhMapPrefsBuilt) return;
    _lhMapPrefsBuilt = true;
    const hint = _lhMk('p', 'settings-backups-hint', '調整句尾上色、逐行字數與斷句標記的開關、位置、大小和顏色');
    const sub = _lhMk('div', 'rm-sub');   // 四個細項縮排在逐行標記底下；總開關關著也照樣能設（UI-SPEC D-17）
    sub.append(
        ..._lhMapPrefRow('lnRhyme', '行尾韻腳', '直接寫這一行的韻腳（ㄤ、ㄠ…），跟著上面的寬韻／嚴格', 'rmPrefRhyme'),
        ..._lhMapPrefRow('lnCount', '字數', '每行幾個字（空白、標點不算）', 'rmPrefCount'),
        ..._lhMapPrefRow('lnSplit', '斷句結構', '畫在每行下面：每一組字底下一個小括號和字數；斜體數字是機器猜的，可以在「📏 分析」裡改', 'rmPrefSplit'),
    );
    // 對照差異先藏起來（Andy 2026-11-13：太複雜，之後再說）；設定與程式都還在
    // 詞庫沒載好時，斷句結構的 ≈ 還出不來：提醒一句，載好就自己收起來
    const wait = _lhMk('span', 'section-menu-cap rm-lex-wait', '詞庫載入中，括號裡的自動斷句稍後補上');
    sub.children[5].after(wait);   // 緊接在斷句結構的說明後面
    const none = _lhMk('span', 'section-menu-cap rm-none', '細項都關著，所以沒有東西可顯示');
    none.hidden = true;
    sub.append(none);
    const lineRow = _lhMapPrefRow('line', '句構判定', '打開後照下面的細項顯示', 'rmPrefLine');
    const mapRows = [
        ..._lhMapPrefRow('multi', '雙押／多押', LH_MAP_HINT_MULTI, 'rmPrefMulti'),
        ..._lhMapPrefRow('autoColor', '自動配色', '前後幾行裡不同的韻，自動換成差最多的顏色；關掉就是每個韻族固定一色', 'rmPrefAuto'),
        ..._lhMapPrefRow('letters', '段落結構', LH_MAP_HINT_LETTERS, 'rmPrefLetters'),
        ..._lhMapPrefRow('inner', '句中押韻', LH_MAP_HINT_INNER, 'rmPrefInner'),
        ..._lhMapPrefRow('skipParticles', '忽略句尾語助詞', LH_MAP_PARTICLE_CAP, 'rmPrefSkip'),
        _lhMk('span', 'section-menu-cap', '押韻判定'),
        _lhMapModeRadios(),
        _lhMk('span', 'section-menu-cap rm-mode-help'),
    ];
    const posHelp = _lhMk('span', 'section-menu-cap rm-pos-help');
    const depthHelp = _lhMk('span', 'section-menu-cap rm-depth-help', LH_MAP_DEPTH_HELP);
    const look = _lhMkBlock('顯示方式',
        _lhMk('span', 'section-menu-cap', '標記位置'), _lhMapLookRadios('標記位置', 'pos', [['right', '靠右欄'], ['tail', '句尾後']], false), posHelp,
        _lhMk('span', 'section-menu-cap', '標記文字大小'), _lhMapLookRadios('標記文字大小', 'size', [['s', '小'], ['m', '中'], ['l', '大']], true),
        _lhMk('span', 'section-menu-cap', '句尾上色濃淡'), _lhMapLookRadios('句尾上色濃淡', 'depth', [['light', '淡'], ['std', '標準'], ['heavy', '濃']], true), depthHelp);
    // 韻族顏色（D-15）：16 個原生色票 + 不能點的「空韻」；顏色日夜共用，存在 lh:map.colors
    const grid = _lhMk('div', 'rm-colors');
    for (let n = 0; n < 16; n++) {
        const label = RHYME_FAMILIES[n].label;
        const inp = _lhMk('input', 'section-color-input');
        inp.type = 'color';
        inp.dataset.n = String(n);
        inp.setAttribute('aria-label', '「' + label + '」韻族顏色');
        const cell = _lhMk('div', 'rm-color-cell');
        cell.append(inp, _lhMk('span', 'rm-cell-label', label));
        grid.append(cell);
    }
    const noneSw = _lhMk('span', 'rm-sw');
    noneSw.dataset.f = String(LH_RHYME_NONE);
    const noneCell = _lhMk('div', 'rm-color-cell');
    noneCell.append(noneSw, _lhMk('span', 'rm-cell-label', '空韻'));
    grid.append(noneCell);
    const advice = _lhMk('span', 'section-menu-cap rm-color-advice');   // 看不清楚時的提醒（_lhMapColorAdvice 填，沒事就藏）
    advice.hidden = true;
    advice.setAttribute('role', 'note');
    // 兩下確認：第一下變成「再按一次確定恢復」，4 秒或離開按鈕就解除（和自動備份的還原一樣）；沒有自訂色時按了沒反應
    const reset = _lhMkBtn('backup-restore-btn rm-color-reset', LH_MAP_RESET_TEXT);
    reset.setAttribute('aria-disabled', 'true');
    reset.addEventListener('click', () => {
        if (reset.getAttribute('aria-disabled') === 'true') return;
        if (reset.dataset.armed === '1') { _lhMapDisarm(reset); lhMapResetColors(); return; }
        reset.dataset.armed = '1';
        reset.textContent = '再按一次確定恢復';
        reset._armTimer = setTimeout(() => _lhMapDisarm(reset), 4000);
    });
    reset.addEventListener('blur', () => _lhMapDisarm(reset));
    // 讀目前主題的文字色與卡片底色用的隱形探針（樣式由 CSS 的變數決定，這裡只讀它算出來的 rgb，不解析 color-mix，RESEARCH Pitfall 11）
    const colors = _lhMkBlock('韻族顏色', _lhMk('span', 'section-menu-cap', '點色塊換顏色，日夜主題共用；「空韻」固定為灰色。自動配色開著時，這 16 色是調色盤，依位置重新分配'), grid, advice, reset, _lhMk('span', 'rm-probe'));
    // 拖曳中（input）只改 CSS 變數，放開（change）才存；兩者都先驗過小寫 #rrggbb，變數名稱只由固定的家族編號組成（T-11-11）
    function _lhMapColorInput(e) {   // 有名字，檢查才找得到 setProperty 只出現在固定的地方
        const t = e.target;
        if (t.dataset && LH_MAP_COLOR_KEYS.includes(t.dataset.n) && LH_MAP_COLOR_RE.test(t.value)) document.documentElement.style.setProperty('--rm-c' + t.dataset.n, t.value);
    }
    grid.addEventListener('input', _lhMapColorInput);
    grid.addEventListener('change', e => {
        const t = e.target;
        if (t.dataset && t.dataset.n !== undefined) lhMapSetColor(t.dataset.n, t.value);
    });
    // 預覽（D-13、D-23）：永遠在最上面，唯讀、讀屏軟體略過；內容由 _lhMapPreviewPaint 用真正的鏡像層渲染器畫，所以每個設定都看得到
    const pv = _lhMk('div', 'rhyme-mirror lm-preview');
    pv.tabIndex = -1;   // 預覽可以捲但不進 Tab 順序（Chrome 會把可捲動的區塊自動變成可聚焦）
    pv.setAttribute('aria-hidden', 'true');
    const pvDiff = _lhMk('span', 'section-menu-cap rm-preview-diff', '對照差異要有同類型的前一段才看得到');
    pvDiff.hidden = true;
    const preview = _lhMkBlock('預覽', pv, pvDiff);
    preview.classList.add('lm-preview-block');
    // 最上面是模式三鈕（關閉／重點跟隨／全部標記），取代原本的「句尾上色」與「滑過才顯示」兩個開關
    const modeBlock = _lhMkBlock('韻腳地圖模式', _lhMapModeSeg(), _lhMk('span', 'section-menu-cap', LH_MAP_MODE_HINT));
    sec.append(hint, modeBlock, preview, _lhMkBlock('韻腳地圖', ...mapRows), _lhMkBlock('句構分析', ...lineRow, sub,
        ..._lhMapPrefRow('autoHover', '反白停留自動分析', LH_MAP_HOVER_HINT, 'rmPrefHover')), look, colors);
    // 整個段落共用一個點擊監聽（和選單一樣）：開關翻轉、寬韻／嚴格選一個，改了就存、就畫
    sec.addEventListener('click', e => {
        const seg = e.target.closest && e.target.closest('.rm-seg-btn');
        if (seg) lhMapSetMode(seg.dataset.mode);
        const sw = e.target.closest && e.target.closest('.rm-switch');
        if (sw) lhMapSetSetting(sw.dataset.k, sw.getAttribute('aria-checked') !== 'true');
        const r = e.target.closest && e.target.closest('.type-row[data-m]');
        if (r) lhMapSetSetting('strict', r.dataset.m === 'strict');
        const lk = e.target.closest && e.target.closest('.type-row[data-k]');
        if (lk) lhMapSetSetting(lk.dataset.k, lk.dataset.v);
    });
    lhMapMenuSync();
}
// 「更多設定…」：關掉所有韻腳浮層，打開偏好設定（已經開著就留著，不能走 ⚙️ 的 toggle，那會把它關掉），
// 直接切到「韻腳與句構」分頁（從最上面開始），焦點放在那個分頁鈕
function lhMapOpenPrefs() {
    lhMapCloseAll();
    const ov = document.getElementById('settingsOverlay');
    if (!ov.classList.contains('show')) {
        ov.classList.add('show');
        renderLexiconPackList();   // ⚙️ 打開時會做的事：詞庫包清單永遠對得上目前真正在用的包
    }
    lhPrefsSelectTab('map', true);
}

// 一個設定改了：存檔、套用外觀、選單文字跟著變；只有會改變鏡像層內容的設定才全部段落重畫。
// 只認 LH_MAP_DEFAULTS 的鍵，而且值經過整理後必須原封不動（壞值、不認得的字串都進不來）；colors 不走這裡
// ==================== 韻腳地圖模式（關閉／重點跟隨／全部標記）====================
// 底下還是兩個開關：end（句尾上色）＋ hoverOnly（滑過才顯示）；三鈕只是一次設好兩個
const LH_MAP_MODE_HINT = '重點跟隨：滑鼠移到字上（觸控點一下），同韻的字才浮出顏色；全部標記：每個韻腳都上色';
function _lhMapMode() {
    return !_lhMapSet.end ? 'off' : _lhMapSet.hoverOnly ? 'hover' : 'all';
}
function _lhMapModeSeg() {
    const g = _lhMk('div', 'rm-seg');
    g.setAttribute('role', 'radiogroup');
    g.setAttribute('aria-label', '韻腳地圖模式');
    for (const [m, t] of [['off', '關閉'], ['hover', '重點跟隨'], ['all', '全部標記']]) {
        const b = _lhMkBtn('rm-seg-btn', t);
        b.setAttribute('role', 'radio');
        b.dataset.mode = m;
        g.append(b);
    }
    return g;
}
function lhMapSetMode(mode) {
    const want = { off: { end: false }, hover: { end: true, hoverOnly: true }, all: { end: true, hoverOnly: false } }[mode];
    if (!want) return;
    _lhMapSet = lhRhymeNormalizeSettings(Object.assign({}, _lhMapSet, want));
    lhSet('lh:map', lhRhymeSerialize(_lhMapSet));
    lhMapApplyLook();
    lhMapMenuSync();
    lhMapRenderAll();
}

function lhMapSetSetting(key, value) {
    if (!Object.prototype.hasOwnProperty.call(LH_MAP_DEFAULTS, key)) return;
    const next = lhRhymeNormalizeSettings(Object.assign({}, _lhMapSet, { [key]: value }));
    if (next[key] !== value) return;
    _lhMapSet = next;
    lhSet('lh:map', lhRhymeSerialize(_lhMapSet));
    lhMapApplyLook();
    lhMapMenuSync();
    if (!LH_MAP_LOOK_KEYS.has(key)) lhMapRenderAll();
}

const LH_MAP_RESET_TEXT = '恢復預設顏色';
function _lhMapDisarm(btn) {
    clearTimeout(btn._armTimer);
    delete btn.dataset.armed;
    btn.textContent = LH_MAP_RESET_TEXT;
}
// 預覽用的三行範例（含空白斷句、七字句、十字句）：和真正的歌詞走同一個渲染器 _lhMapBuildFrag，所以不可能和歌詞畫得不一樣
const LH_MAP_PREVIEW_TEXT = [   // Andy 的〈麻雀〉：中英夾雜、空白斷句、語助詞、雙押都測得到
    'yo yo 麻雀in the house',
    '夜晚還在街道　別管那些尖叫',
    '笑鬧 逃跑 快樂或紛擾',
    '一夜之間　slow down calm down',
    '一念之間　也 好　也 好 奇',
    '新的家新的我 新的樹有新的蟲',
    '想新的拆遷名單',
    '像辛得勒名單',
    '耳罩帶好好 抗議go to hell',
    'sparrow leave the house',
    "and who's the next pity mouse?",
].join('\n');
function _lhMapPreviewPaint() {
    const pv = document.querySelector('#mapSettingsSection .lm-preview');
    if (!pv) return;
    const { frag } = _lhMapBuildFrag(LH_MAP_PREVIEW_TEXT, null, null);   // 單一段落沒有可對照的前一段
    pv.replaceChildren(frag.childNodes.length ? frag : LH_MAP_PREVIEW_TEXT);   // 全部標記都關：照樣顯示文字，預覽不會整個消失
    document.querySelector('#mapSettingsSection .rm-preview-diff').hidden = !(_lhMapSet.line && _lhMapSet.lnDiff);
}
// 恢復預設顏色：清掉全部自訂色（lh:map 的 colors 鍵跟著消失）；不碰「重設顏色!」管的頁面主題色
function lhMapResetColors() {
    _lhMapSet = lhRhymeNormalizeSettings(Object.assign({}, _lhMapSet, { colors: {} }));
    lhSet('lh:map', lhRhymeSerialize(_lhMapSet));
    lhMapApplyLook();
    lhMapMenuSync();
    lhAnnounce('已恢復預設顏色');
}
// 看不清楚的提醒（D-15）：用目前真正的文字色與卡片底色，算每個韻族色在目前濃淡下混出來的底色對文字的對比；
// 低於 4.5:1 的列出名字（最多三個，其餘寫「等 n 個」）。只提醒，不擋存檔。偏好設定還沒建好時什麼都不做
function _lhMapColorAdvice() {
    const cap = document.querySelector('#mapSettingsSection .rm-color-advice');
    if (!cap) return;
    const cs = getComputedStyle(cap.parentNode.querySelector('.rm-probe'));
    const text = (cs.color.match(/\d+/g) || []).slice(0, 3).map(Number), card = (cs.backgroundColor.match(/\d+/g) || []).slice(0, 3).map(Number);
    const bad = [];
    if (text.length === 3 && card.length === 3) {
        const pct = LH_MAP_DEPTH[_lhMapSet.depth][0];
        for (let n = 0; n < 16; n++) {
            const hex = _lhMapEffColor(n);
            const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
            if (lhRhymeContrast(text, lhRhymeMixRgb(rgb, card, pct)) < 4.5) bad.push(RHYME_FAMILIES[n].label);
        }
    }
    cap.hidden = !bad.length;
    cap.textContent = !bad.length ? '' : bad.slice(0, 3).join('、') + (bad.length > 3 ? '等 ' + bad.length + ' 個' : '')
        + '顏色在目前主題下讓字不太好讀（對比低於 4.5:1），可以選淡一點的顏色，或調低「句尾上色濃淡」';
}

// 改一個韻族的顏色（色票放開時）：只收固定的家族編號 '0'…'15' 與小寫 #rrggbb；顏色純 CSS，不必重畫鏡像層
function lhMapSetColor(n, hex) {
    n = String(n);
    if (!LH_MAP_COLOR_KEYS.includes(n) || typeof hex !== 'string' || !LH_MAP_COLOR_RE.test(hex)) return;
    _lhMapSet = lhRhymeNormalizeSettings(Object.assign({}, _lhMapSet, { colors: Object.assign({}, _lhMapSet.colors, { [n]: hex }) }));
    lhSet('lh:map', lhRhymeSerialize(_lhMapSet));
    lhMapApplyLook();
    lhMapMenuSync();
    lhAnnounce('已更新「' + RHYME_FAMILIES[+n].label + '」韻族顏色');
}

// 別的分頁改了設定：先收掉這個分頁的浮層，重讀、重畫，選單文字跟著變
window.addEventListener('storage', e => {
    if (e.key !== 'lh:map') return;
    lhMapCloseAll();
    _lhMapSet = lhRhymeNormalizeSettings(lhGetJSON('lh:map', null));
    lhMapApplyLook();
    lhMapMenuSync();
    lhMapRenderAll();
});

// 選單放在按鈕正下方；下面放不下被擠上去蓋住按鈕時，翻到按鈕上方（跟段落設定選單一樣）
function _lhMapPlaceMenu() {
    const btn = document.getElementById('rhymeMenuBtn');
    if (!_lhMapMenu || !btn) return;
    const r = btn.getBoundingClientRect();
    lhPlaceMenu(_lhMapMenu, r.left, r.bottom + 4);
    const b = _lhMapMenu.getBoundingClientRect();
    if (b.top < r.bottom && r.top - b.height - 4 >= 4) lhPlaceMenu(_lhMapMenu, r.left, r.top - b.height - 4);
}

// byKeyboard：鍵盤打開才把焦點放到第一個開關；滑鼠、觸控不搶焦點（手機鍵盤不要彈出來）
function lhMapOpenMenu(byKeyboard) {
    _lhDwellCancel();
    const m = lhMapMenuBuild();
    if (typeof lhSecCloseMenu === 'function') lhSecCloseMenu();
    if (typeof closeExportMenu === 'function') closeExportMenu();
    if (typeof closeSongListOverlay === 'function') closeSongListOverlay();
    lhMapCloseAll();
    lhMapMenuSync();
    _lhMapMenuOn = true;
    _lhMapPlaceMenu();
    document.getElementById('rhymeMenuBtn').setAttribute('aria-expanded', 'true');
    if (byKeyboard) m.querySelector('.rm-seg-btn.active')?.focus({ preventScroll: true });
}

// refocus：按 Esc 才把焦點還給按鈕（點外面時焦點跟著被點的東西走）
function lhMapCloseMenu(refocus) {
    if (!_lhMapMenu || !_lhMapMenuOn) return;
    _lhMapMenuOn = false;
    _lhMapMenu.classList.remove('show');
    const btn = document.getElementById('rhymeMenuBtn');
    btn.setAttribute('aria-expanded', 'false');
    if (refocus) btn.focus({ preventScroll: true });
}

// 關掉所有韻腳相關的浮層（重畫列表、跨 900px、收面板、段落選單打開時都會叫）
function lhMapCloseAll() {
    _lhDwellCancel();
    lhMapCloseMenu(false);
    lhMapHideAnalysis();
    lhMapHideBar();
    lhMapCloseStats(false);
    if (typeof lhRoleSelClose === 'function') lhRoleSelClose();
    if (typeof lhRolePanelClose === 'function') lhRolePanelClose();
}

document.getElementById('rhymeMenuBtn').addEventListener('click', e => {
    if (_lhMapMenuOn) lhMapCloseMenu(false);
    else lhMapOpenMenu(e.detail === 0);   // 鍵盤（Enter／空白）觸發的 click，detail 是 0
});
// 點選單外面關掉（滑鼠、觸控、觸控筆都走 pointerdown）：只收起選單，不攔這一下，被點到的東西照常反應（和原生 popover 一樣）；
// 點「韻腳 ▾」本身交給它的 click 切換。Esc 關掉並把焦點還給按鈕（capture：≤ 900 的 sheet 才不會同時被收起）
document.addEventListener('pointerdown', e => {
    if (_lhMapMenuOn && !(e.target.closest && e.target.closest('#rhymeMenu, #rhymeMenuBtn'))) lhMapCloseMenu(false);
}, true);
// 焦點被移到選單外面（讀屏軟體、程式）也收起；relatedTarget 是 null（點選單裡的空白、切到別的視窗）不算
document.addEventListener('focusout', e => {
    if (!_lhMapMenuOn || !_lhMapMenu.contains(e.target) || !e.relatedTarget) return;
    if (!e.relatedTarget.closest('#rhymeMenu, #rhymeMenuBtn')) lhMapCloseMenu(false);
});
document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !_lhMapMenuOn || e.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    e.stopPropagation();
    lhMapCloseMenu(true);
}, true);
// 螢幕鍵盤出現／收起、視窗大小改變：選單重新夾進可見範圍（等兩個 frame，layout.js 要先更新 --app-h）
let _lhMapMenuRaf = 0;
function _lhMapReclamp() {
    if ((!_lhMapMenuOn && !_lhMapBarSnap) || _lhMapMenuRaf) return;
    _lhMapBarGrace = performance.now() + 700;   // 鍵盤出現時瀏覽器會自己把輸入框捲進可見範圍，那不算使用者捲動，選字列不收
    _lhMapMenuRaf = requestAnimationFrame(() => requestAnimationFrame(() => {
        _lhMapMenuRaf = 0;
        if (_lhMapBarSnap) { _lhMapBarPlace(); if (_lhMapAnOn) _lhMapAnPlace(); }   // 選字列、分析面板也跟著重新放
        if (!_lhMapMenuOn) return;
        _lhMapPlaceMenu();
        const ae = document.activeElement;
        if (ae && _lhMapMenu.contains(ae)) ae.scrollIntoView({ block: 'nearest' });
    }));
}
window.addEventListener('resize', _lhMapReclamp);
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', _lhMapReclamp);
    window.visualViewport.addEventListener('scroll', _lhMapReclamp);
}

// ==================== 韻腳統計（MAP-04、CONTEXT C2／C4／D2、UI-SPEC D-10／D-11、4.2） ====================
// 點標題列的字母條開 #rhymeStats：結構字母、共幾句押韻幾句、每個韻出現幾次，下面一句一列，點一列就查那一句的句尾。
// 內容全來自該段最近一次分析（_lhMapCache 的 res），每個字串都走 textContent；沒有 hover 彈窗（D-11）
let _lhMapStats = null;
let _lhMapStatsOn = false;
let _lhMapStatsSec = '';           // 開著的是哪一段
let _lhMapStatsBusy = false;       // 正在補畫過期的段落（_lhMapStatsData 裡）

const _lhMapCut = (str, n) => { const cs = Array.from(str); return cs.length > n ? cs.slice(0, n).join('') + '…' : str; };

function lhMapStatsBuild() {
    if (_lhMapStats) return _lhMapStats;
    const m = _lhMk('div', 'word-ctx-menu section-menu');
    m.id = 'rhymeStats';
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-label', '韻腳統計');
    document.body.appendChild(m);
    _lhMapStats = m;
    return m;
}

// 該段的分析結果：快取過期（打字後還沒重畫）就先重畫一次
function _lhMapStatsData(secEl) {
    const sec = curSong()?.sections.find(x => x.id === secEl.dataset.id);
    if (!sec) return null;
    const hit = _lhMapCache.get(sec.id);
    if (!hit || hit.text !== sec.text) {
        if (!_lhComposing) {
            _lhMapStatsBusy = true;   // 補畫會回頭叫 _lhMapStatsRefresh，那一次不必再建一次清單（IN-03）
            try { lhMapPaint(secEl); } finally { _lhMapStatsBusy = false; }
        }
    }
    return { sec, res: (_lhMapCache.get(sec.id) || {}).res || null };
}

// 把內容填進去（每次都整個重建）
function _lhMapStatsFill() {
    const m = _lhMapStats, secEl = lhSecEl(_lhMapStatsSec);
    const d = secEl && _lhMapStatsData(secEl);
    if (!m || !d) return;
    const strip = secEl.querySelector('.section-rhyme');
    const res = d.res && d.res.count.size ? d.res : null;   // 沒有任何一行有韻（或太大沒分析）：只顯示空狀態
    const kids = [_lhMk('div', 'section-menu-title', '韻腳統計：' + _lhMapCut(d.sec.label || '', 16))];
    if (!res) kids.push(_lhMk('span', 'section-menu-cap', '這個段落還沒有可分析的句尾'));
    else {
        const strict = _lhMapSet.strict, sm = lhRhymeSummary(res, strict);
        const rows = res.rows.filter(r => !r.blank);
        const letters = _lhMk('div', 'rm-letters');
        for (const r of rows) {
            const sp = _lhMk('span', '', r.label || '-');
            sp.dataset.letter = r.letter || '-';
            if (r.key !== null) _lhMapTint(sp, r);
            letters.append(sp);
        }
        kids.push(letters);
        kids.push(_lhMk('div', 'rm-sum', '共 ' + sm.n + ' 句，押韻 ' + sm.k + ' 句（' + sm.p + '%）'));
        if (_lhMapSet.multi) kids.push(_lhMk('div', 'rm-sum-multi', '雙押 ' + sm.m2 + ' 句，三押以上 ' + sm.m3 + ' 句'));
        kids.push(_lhMk('span', 'section-menu-cap', '判定：' + (strict ? '嚴格' : '寬韻')));
        const groups = _lhMk('div', 'section-menu-block');
        for (const g of sm.groups) {
            const row = _lhMk('div', 'rm-group');
            const sw = _lhMk('span', 'rm-sw');
            _lhMapTint(sw, g);
            row.append(sw, _lhMk('span', '', g.label + ' ×' + g.count + (g.count === 1 ? '（孤句）' : '')));
            groups.append(row);
        }
        kids.push(groups);
        const list = _lhMk('div', 'section-menu-block');
        list.append(_lhMk('span', 'section-menu-cap', '逐句'));
        rows.forEach((r, n) => {
            const ch = r.t ? r.t.char : (Array.from(r.line.replace(/[^\p{L}\p{N}]+$/u, '')).pop() || '');
            const b = _lhMkBtn('rm-row', '', r.t ? '查韻：' + ch + '，第 ' + (n + 1) + ' 句' : '第 ' + (n + 1) + ' 句，沒有可查的句尾');
            const lineCs = Array.from(r.line.trim());
            b.append(_lhMk('span', 'rm-g-letter', r.label || '-'), _lhMk('span', 'rm-tail', ch),
                _lhMk('span', 'rm-prev', lineCs.slice(0, 12).join('') + (lineCs.length > 12 ? '…' : '')));
            if (!r.t) b.setAttribute('aria-disabled', 'true');
            b.addEventListener('click', e => {
                if (!r.t) return;
                const kb = e.detail === 0;
                lhMapCloseAll();
                lhMapLookup(r.t.char, false);
                if (kb && !lhIsSheetMode()) secEl.querySelector('.section-rhyme')?.focus({ preventScroll: true });
            });
            list.append(b);
        });
        kids.push(list);
    }
    const close = _lhMkBtn('section-menu-btn section-menu-close', '關閉統計');
    close.addEventListener('click', () => lhMapCloseStats(true));
    kids.push(close);
    m.replaceChildren(...kids);
    // 字母條還在就放它下面；被藏起來了（段落剛好變成沒有韻）就留在原地，只夾進可見範圍
    if (strip && !strip.hidden) _lhMapStatsPlace(strip);
    else lhPlaceMenu(m, parseFloat(m.style.left) || 0, parseFloat(m.style.top) || 0);
}

// 放在字母條正下方；下面放不下被擠上去蓋住字母條時翻到上方（和段落設定選單一樣）
function _lhMapStatsPlace(strip) {
    const r = strip.getBoundingClientRect();
    lhPlaceMenu(_lhMapStats, r.left, r.bottom + 4);
    const b = _lhMapStats.getBoundingClientRect();
    if (b.top < r.bottom && r.top - b.height - 4 >= 4) lhPlaceMenu(_lhMapStats, r.left, r.top - b.height - 4);
}

// byKeyboard：鍵盤打開才把焦點放到第一個能點的句子；滑鼠、觸控不搶焦點
function lhMapOpenStats(secEl, byKeyboard) {
    const strip = secEl && secEl.querySelector('.section-rhyme');
    if (!strip || strip.hidden) return;
    const m = lhMapStatsBuild();
    if (typeof lhSecCloseMenu === 'function') lhSecCloseMenu();
    if (typeof closeExportMenu === 'function') closeExportMenu();
    if (typeof closeSongListOverlay === 'function') closeSongListOverlay();
    lhMapCloseAll();
    _lhMapStatsSec = secEl.dataset.id;
    _lhMapStatsOn = true;
    strip.setAttribute('aria-expanded', 'true');
    _lhMapStatsFill();
    if (byKeyboard) (m.querySelector('.rm-row:not([aria-disabled="true"])') || m.querySelector('.section-menu-close')).focus({ preventScroll: true });
}

// refocus：按「關閉」或 Esc 才把焦點還給字母條
function lhMapCloseStats(refocus) {
    if (!_lhMapStats || !_lhMapStatsOn) return;
    _lhMapStatsOn = false;
    _lhMapStats.classList.remove('show');
    const strip = lhSecEl(_lhMapStatsSec)?.querySelector('.section-rhyme');
    if (strip) strip.setAttribute('aria-expanded', 'false');
    if (refocus && strip && !strip.hidden) strip.focus({ preventScroll: true });
}

// 開著的那一段重畫了（lhMapPaint 呼叫）：內容重建，鍵盤焦點留在同一列
function _lhMapStatsRefresh(secId) {
    if (!_lhMapStatsOn || _lhMapStatsBusy || secId !== _lhMapStatsSec) return;
    const m = _lhMapStats, ae = document.activeElement;
    const rows = [...m.querySelectorAll('.rm-row')];
    const at = m.contains(ae) ? rows.indexOf(ae) : -2;   // -2：焦點不在裡面；-1：在關閉鈕
    _lhMapStatsFill();
    if (at === -2) return;
    const now = [...m.querySelectorAll('.rm-row')];
    (now[Math.min(Math.max(at, 0), now.length - 1)] || m.querySelector('.section-menu-close')).focus({ preventScroll: true });
}

document.getElementById('lyricsSections').addEventListener('click', e => {
    const strip = e.target.closest && e.target.closest('.section-rhyme');
    if (!strip) return;
    const secEl = strip.closest('.lyrics-section');
    if (_lhMapStatsOn && _lhMapStatsSec === secEl.dataset.id) lhMapCloseStats(false);   // 再按一次就收起來
    else lhMapOpenStats(secEl, e.detail === 0);   // 鍵盤（Enter／空白）觸發的 click，detail 是 0
});
document.addEventListener('pointerdown', e => {
    if (_lhMapStatsOn && !(e.target.closest && e.target.closest('#rhymeStats, .section-rhyme'))) lhMapCloseStats(false);
}, true);
document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !_lhMapStatsOn || e.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    e.stopPropagation();
    lhMapCloseStats(true);
}, true);
// 螢幕鍵盤、縮放：統計只重新夾進可見範圍，不重建清單（捲動位置、焦點都留著，IN-03）
function _lhMapStatsReplace() {
    if (!_lhMapStatsOn) return;
    const strip = lhSecEl(_lhMapStatsSec)?.querySelector('.section-rhyme');
    if (strip && !strip.hidden) _lhMapStatsPlace(strip);
}
window.addEventListener('resize', _lhMapStatsReplace);
if (window.visualViewport) window.visualViewport.addEventListener('resize', _lhMapStatsReplace);

// ==================== 選字浮動列（MAP-05、CONTEXT D1／D3、UI-SPEC D-15／D-16／D-17） ====================
// 在歌詞裡反白 1–20 個字（至少一個中文字），選取下方出現「🔍 查韻：{字}」「✨ AI 建議」；
// 只有反白＋按按鈕才查，單純點一下游標不會動搜尋。字取選取範圍最後一個中文字（韻腳在句尾）。
// 時機：滑鼠放開（mouseup）下一個 frame 就判斷；鍵盤與觸控在最後一次 select／selectionchange／keyup 之後 400ms 才判斷，拖選取把手時不會閃。
const LH_MAP_SEL_MAX = 20;       // 超過這麼多字（以字元計）的選取不是查詢意圖（全選、整段）：只限制「查韻」「AI 建議」，浮動列本身還在（只剩「分析」，D-07）
const LH_MAP_BAR_MS = 400;
const LH_MAP_HAN = /\p{Script=Han}/u;
let _lhMapBar = null;
let _lhMapBarSnap = null;        // 顯示當下的快照 { ta, secId, a, b, end, char }：按下按鈕時用它，不重讀選取（Pitfall 8）
let _lhMapBarTimer = 0;
let _lhMapBarSkip = '';          // 按過按鈕或 Esc 收掉的那個選取（段落:起:迄）：同一個選取不再自動跳出來，重新放開滑鼠或改選取才解除
let _lhMapBarGrace = 0;          // 這個時間點之前的捲動不算使用者捲動（鍵盤開關時瀏覽器自己會捲）
let _lhMapAn = null;             // #rhymeAnalysis（句構分析面板，和浮動列算同一個浮層）
let _lhMapAnOn = false;
// 反白停留自動分析（C4／D-10）：只給接了滑鼠的電腦。計時中就是 _lhDwellTimer 非 0，_lhDwellAt 是起算時指標的位置
const LH_MAP_DWELL_MS = 1500, LH_MAP_DWELL_PX = 3;
let _lhPtr = { x: 0, y: 0, mouse: false };   // 最後一次指標事件（只記座標，移動時絕不量版面）
let _lhDwellTimer = 0, _lhDwellAt = null;

const _lhMapSelSig = ta => (ta.closest('.lyrics-section')?.dataset.id || '') + ':' + ta.selectionStart + ':' + ta.selectionEnd;

function lhMapBarBuild() {
    if (_lhMapBar) return _lhMapBar;
    const bar = _lhMk('div', 'word-ctx-menu rm-bar');
    bar.id = 'rhymeSelBar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', '選字工具');
    const icon = t => { const s = _lhMk('span', '', t); s.setAttribute('aria-hidden', 'true'); return s; };
    const look = _lhMkBtn('section-menu-btn rm-bar-look', '');
    look.append(icon('🔍'), _lhMk('span', 'rm-bar-t', ' 查韻：'));
    const ai = _lhMkBtn('section-menu-btn rm-bar-ai', '');
    ai.append(icon('✨'), _lhMk('span', '', ' AI 建議'));
    const an = _lhMkBtn('section-menu-btn rm-bar-an', '', '分析選取範圍的句構');   // 任何歌詞選取都有（D-07）；按了開 #rhymeAnalysis
    an.append(icon('📏'), _lhMk('span', '', ' 分析'));
    an.setAttribute('aria-expanded', 'false');
    an.setAttribute('aria-controls', 'rhymeAnalysis');
    const mv = _lhMkBtn('section-menu-btn rm-bar-move', '移到段落 ▸');   // 桌機與觸控都有（桌機另外還能右鍵）
    mv.setAttribute('aria-haspopup', 'menu');
    mv.setAttribute('aria-controls', 'moveSelSub');
    const role = _lhMkBtn('section-menu-btn rm-bar-role', '指定角色 ▸');   // 逐字角色標記（js/roles.js）；桌機與觸控都有
    role.setAttribute('aria-haspopup', 'menu');
    role.setAttribute('aria-controls', 'roleSelMenu');
    const rd = _lhMkBtn('section-menu-btn rm-bar-rd', '指定讀音');   // 只有句尾的破音字才顯示（lhMapShowBar）
    rd.hidden = true;
    rd.setAttribute('aria-expanded', 'false');
    const row = _lhMk('div', 'rm-bar-reading');   // 讀音那一列：標籤＋晶片，按「指定讀音」才展開
    row.id = 'rhymeReadingRow';
    row.hidden = true;
    rd.setAttribute('aria-controls', row.id);
    bar.append(look, ai, an, rd, role, mv, row);   // 編輯動作排最後
    // 按鈕不能搶走輸入框的焦點與選取（手機鍵盤也才不會收起來）
    for (const t of ['pointerdown', 'mousedown']) bar.addEventListener(t, e => e.preventDefault());
    look.addEventListener('click', e => lhMapLookup(_lhMapBarSnap && _lhMapBarSnap.char, false, e.detail === 0));
    ai.addEventListener('click', e => lhMapLookup(_lhMapBarSnap && _lhMapBarSnap.char, true, e.detail === 0));
    an.addEventListener('click', e => {
        if (_lhMapAnOn) lhMapHideAnalysis();
        else lhMapOpenAnalysis(_lhMapBarSnap, e.detail === 0);
    });
    mv.addEventListener('click', e => {
        const sn = _lhMapBarSnap;
        if (!sn) return;
        const r = mv.getBoundingClientRect();
        const snap = { secId: sn.secId, a: sn.a, b: sn.b, text: sn.ta.value.slice(sn.a, sn.b) };   // lhMapHideBar 會清掉 _lhMapBarSnap，先組好
        lhMapHideBar();
        lhMoveSelOpenSub(snap, r.left, r.bottom + 4, e.detail === 0, r);
    });
    role.addEventListener('click', e => {
        const sn = _lhMapBarSnap;
        if (!sn) return;
        const r = role.getBoundingClientRect();
        const snap = { secId: sn.secId, a: sn.a, b: sn.end, text: sn.ta.value.slice(sn.a, sn.end) };   // 結尾空白、換行不算；先組好再收列
        lhMapHideBar();
        lhRoleSelOpen(snap, r.left, r.bottom + 4, e.detail === 0, r);
    });
    rd.addEventListener('click', e => lhMapReadingToggle(e.detail === 0));
    row.addEventListener('click', e => {
        const c = e.target.closest && e.target.closest('.rm-chip');
        const sn = _lhMapBarSnap;
        if (!c || !sn || !sn.rd) return;
        lhMapSetReading(sn.secId, sn.rd.tail, c.dataset.r || null);
        if (e.detail === 0) _lhMapBarRestore(sn);
    });
    bar.addEventListener('keydown', e => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        const items = [...bar.querySelectorAll('button')].filter(b => b.offsetParent !== null), i = items.indexOf(document.activeElement);
        if (i < 0) return;
        e.preventDefault();
        items[(i + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length].focus({ preventScroll: true });
    });
    document.body.appendChild(bar);
    _lhMapBar = bar;
    return bar;
}

function lhMapHideBar(keepTimer) {
    _lhDwellCancel();
    if (keepTimer !== true) { clearTimeout(_lhMapBarTimer); _lhMapBarTimer = 0; }
    lhMapHideAnalysis();   // 浮動列和分析面板算同一層：列收了面板跟著收
    if (_lhMapBarSnap) _lhMapBarSnap.ta.removeAttribute('aria-keyshortcuts');
    _lhMapBarSnap = null;
    if (_lhMapBar) {
        _lhMapBar.classList.remove('show');
        _lhMapBar.querySelector('.rm-bar-reading').hidden = true;
        _lhMapBar.querySelector('.rm-bar-rd').setAttribute('aria-expanded', 'false');
    }
}

// 放在選取結尾那一行的下方；放不下（lhPlaceMenu 夾進可見範圍）就貼在可見範圍底部
// 太長的段落不量版面（鏡像排版太貴，T-10-11）；選取結尾捲出輸入框外時也直接貼底
function _lhMapBarPlace() {
    const s = _lhMapBarSnap, ta = s.ta;
    const vv = window.visualViewport;
    const r = ta.getBoundingClientRect();
    let x = r.left, y = (vv ? vv.offsetTop + vv.height : innerHeight);
    s.zone = null;   // 太長的段落不量版面，也就沒有停留自動分析
    if (ta.value.length <= LH_WD_BIG) {
        const m = lhMirror(ta);
        let pos, p0;
        try { pos = lhCaretRect(ta, m, s.end); p0 = lhCaretRect(ta, m, s.a); } finally { m.remove(); }
        // 停留偵測的區域：輸入框的寬、選取第一個視覺列頂到最後一個視覺列底。放置時量這一次，之後 pointermove 只比座標（C4）
        s.zone = { left: r.left, right: r.right, top: Math.max(r.top, p0.top), bottom: Math.min(r.bottom, pos.top + pos.height) };
        if (pos.top + pos.height >= r.top && pos.top <= r.bottom) {
            const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
            x = pos.left;
            y = pos.top + pos.height + (matchMedia('(pointer: coarse)').matches ? 1.75 : 0.25) * rem;
        }
    }
    lhPlaceMenu(_lhMapBar, x, y);
}

function lhMapShowBar(snap) {
    lhMapCloseStats(false);   // 同時只開一個浮層
    const bar = lhMapBarBuild();
    const prev = _lhMapBarSnap;
    if (prev && prev.ta !== snap.ta) prev.ta.removeAttribute('aria-keyshortcuts');
    // 同一個選取重複判斷（例如焦點移進列裡）時，讀音那一列維持原樣；換了選取就收起來
    if (!(prev && prev.ta === snap.ta && prev.a === snap.a && prev.b === snap.b && prev.secId === snap.secId)) {
        bar.querySelector('.rm-bar-reading').hidden = true;
        bar.querySelector('.rm-bar-rd').setAttribute('aria-expanded', 'false');
    }
    // 換了選取：面板的內容是舊選取的，收掉；同一個選取重複判斷就留著
    const same = prev && prev.ta === snap.ta && prev.a === snap.a && prev.b === snap.b && prev.secId === snap.secId;
    if (_lhMapAnOn && !same) lhMapHideAnalysis();
    // 查韻、AI 建議只在有中文字、20 字內的選取才有（D-07）；沒有就只剩「分析」
    bar.querySelector('.rm-bar-look').hidden = bar.querySelector('.rm-bar-ai').hidden = !snap.char;
    bar.querySelector('.rm-bar-rd').hidden = !snap.rd;
    _lhMapBarSnap = snap;
    snap.ta.setAttribute('aria-keyshortcuts', 'Alt+ArrowDown');
    if (snap.char) bar.querySelector('.rm-bar-t').textContent = ' 查韻：' + snap.char;
    _lhMapBarPlace();
    if (_lhMapAnOn) _lhMapAnPlace();
}

// 「指定讀音」只在選取的最後一個中文字正好是那一行的有效句尾（跳過標點與語助詞之後）、且是破音字時才有意義：
// 手動讀音只綁句尾（A3），在別處指定不會改變任何顏色（OQ12）。回傳 { tail, char } 或 null
function _lhMapReadingTarget(ta, a, text, char) {
    if (!isPolyphonic(char)) return null;
    const pos = a + text.lastIndexOf(char);   // 選取裡最後一個該字的位置
    const v = ta.value;
    const ls = v.lastIndexOf('\n', pos - 1) + 1;
    let le = v.indexOf('\n', pos);
    if (le < 0) le = v.length;
    const i = Array.from(v.slice(ls, pos)).length;
    const t = lhRhymeTargets(v.slice(ls, le), _lhMapSet.skipParticles).find(x => x.i === i);   // 行中逗號、空白前的句尾也能指定
    return t && t.char === char ? { tail: t.tail, char } : null;
}

// 判斷這個輸入框現在的選取該不該出現浮動列
// byMouse：滑鼠放開走的路徑才可能啟動停留計時；鍵盤、觸控的 400ms 路徑永遠不會
function _lhMapSelCheck(ta, byMouse) {
    _lhMapBarTimer = 0;
    try {
        const a = ta.selectionStart, b = ta.selectionEnd;
        const rpt = document.getElementById('aiWordsContainer');
        const busy = _lhComposing || _lhDrag || _lhResize || _lhWd || _lhMenuId !== null || _lhMapMenuOn || _lhMoveSel !== null || (typeof lhRoleBusy === 'function' && lhRoleBusy()) || (rpt && rpt.classList.contains('report-mode'));
        if (busy || a === b || ta.getClientRects().length === 0 || _lhMapSelSig(ta) === _lhMapBarSkip) return lhMapHideBar();
        const v = ta.value;
        const text = v.slice(a, b);
        const end = b - (text.length - text.trimEnd().length);   // 三連點選會多選到換行：浮動列放在最後一個字那一行
        // D-07：碰到的行裡至少有一個可數的字才出現（空行、純標點不出現）；整段、英文歌詞也出現，不再有長度上限
        const ls = v.lastIndexOf('\n', a - 1) + 1;
        let le = v.indexOf('\n', Math.max(a, end - 1));
        if (le < 0) le = v.length;
        if (!lhCountWords(v.slice(ls, le))) return lhMapHideBar();
        // 查韻、AI 建議：20 字內而且有中文字才有（astral 字佔兩個單位，b - a 先擋掉明顯太長的，不必展開整個選取）
        let char = null;
        if (b - a <= LH_MAP_SEL_MAX * 2) {
            const chars = Array.from(text);
            if (chars.length <= LH_MAP_SEL_MAX) char = chars.filter(c => LH_MAP_HAN.test(c)).pop() || null;
        }
        lhMapShowBar({ ta, secId: ta.closest('.lyrics-section').dataset.id, a, b, end, char, rd: char ? _lhMapReadingTarget(ta, a, text, char) : null });
        if (byMouse) _lhDwellArm();
    } catch (e) {
        lhWarn('韻腳地圖選字列失敗', e);
        lhMapHideBar();
    }
}

// 選取一變就先收掉（字可能換了）、400ms 後再判斷；選取收合馬上收掉
function _lhMapBarOnChange(e) {
    const ta = e.target;
    if (!ta.classList || !ta.classList.contains('section-textarea')) return;
    // selectionchange 也會從「別段、只有游標沒選字」的輸入框發出（復原重畫後尤其常見）：當成選取被取消，會把剛排好的 400ms 顯示計時器清掉，浮動列就不出現。只看有焦點的那個
    if (e.type === 'selectionchange' && ta !== document.activeElement) return;
    if (_lhMapSelSig(ta) !== _lhMapBarSkip) _lhMapBarSkip = '';
    if (ta.selectionStart === ta.selectionEnd) return lhMapHideBar();
    if (_lhMapBarSnap && (_lhMapBarSnap.ta !== ta || _lhMapBarSnap.a !== ta.selectionStart || _lhMapBarSnap.b !== ta.selectionEnd)) lhMapHideBar();
    clearTimeout(_lhMapBarTimer);
    _lhMapBarTimer = setTimeout(() => _lhMapSelCheck(ta), LH_MAP_BAR_MS);
}
{
    const area = document.getElementById('lyricsSections');
    for (const t of ['select', 'selectionchange']) area.addEventListener(t, _lhMapBarOnChange);
    area.addEventListener('keyup', e => { if (e.key !== 'Escape') _lhMapBarOnChange(e); });
    area.addEventListener('mouseup', e => {
        const ta = e.target;
        if (!ta.classList || !ta.classList.contains('section-textarea')) return;
        _lhMapBarSkip = '';
        clearTimeout(_lhMapBarTimer);
        requestAnimationFrame(() => _lhMapSelCheck(ta, true));
    });
    area.addEventListener('compositionstart', () => lhMapHideBar());
    // 捲動只收已經出現的列，不取消等著判斷的計時（聚焦時瀏覽器常會順手捲一下）
    // 上色鏡像層的 scroll 是程式跟著輸入框同步捲的（事件可能比浮動列晚到），不算使用者捲動；使用者捲的是輸入框本身
    // 段落不再自己捲（lhSecFit 自動長高），捲的是外層歌詞區：所以聽整頁，只認歌詞區裡面或包住歌詞區的捲動
    document.addEventListener('scroll', e => {
        const t = e.target;
        if (!t.contains || !(t.contains(area) || area.contains(t))) return;
        if (t.classList && t.classList.contains('rhyme-mirror')) return;
        if (_lhMapBarSnap && performance.now() > _lhMapBarGrace) lhMapHideBar(true);
    }, true);
    // Alt+↓：焦點到浮動列（D-16）
    area.addEventListener('keydown', e => {
        if (!_lhMapBarSnap || e.target !== _lhMapBarSnap.ta || !e.altKey || e.key !== 'ArrowDown' || e.isComposing || e.keyCode === 229) return;
        e.preventDefault();
        [..._lhMapBar.querySelectorAll('button')].find(b => b.offsetParent !== null).focus({ preventScroll: true });   // 第一顆看得到的（可能沒有「查韻」）
    });
}
// ==================== 反白停留自動分析（MAP-10、CONTEXT C4／C5、UI-SPEC D-10） ====================
// 滑鼠反白後、指標停在選取範圍內不動 1.5 秒，自己打開句構面板（和「📏 分析」同一個面板、不搶焦點）。
// 動 3px 以上就取消，而且不會重新起算：要再等，只有重新用滑鼠反白一次。
// 為什麼不動就不重新起算：使用者一動手，多半是要做別的事（拖、點、捲），這時跳出面板只會干擾
function _lhDwellOk() {
    const s = _lhMapBarSnap, z = s && s.zone;
    return !!(z && _lhMapSet.autoHover && _lhPtr.mouse && !_lhMapAnOn && !_lhComposing && !_lhMapMenuOn && _lhMenuId === null
        && matchMedia('(hover: hover) and (pointer: fine)').matches
        && _lhPtr.x >= z.left && _lhPtr.x <= z.right && _lhPtr.y >= z.top && _lhPtr.y <= z.bottom);
}
function _lhDwellCancel() {
    clearTimeout(_lhDwellTimer);
    _lhDwellTimer = 0;
    _lhDwellAt = null;
}
function _lhDwellArm() {
    _lhDwellCancel();
    if (!_lhDwellOk()) return;
    const { ta, a, b } = _lhMapBarSnap;
    _lhDwellAt = { x: _lhPtr.x, y: _lhPtr.y };
    _lhDwellTimer = setTimeout(() => {
        _lhDwellCancel();
        const s = _lhMapBarSnap;   // 放開滑鼠後的 400ms 路徑可能重建過快照，所以比選取範圍，不比物件
        if (s && s.ta === ta && s.a === a && s.b === b && _lhDwellOk()) lhMapOpenAnalysis(s, false);   // 同一個選取、條件還成立才開
    }, LH_MAP_DWELL_MS);
}
// 指標事件只記座標（pointerdown 也記：觸控的相容滑鼠事件之前，最後一個指標必須是手指而不是舊的滑鼠）
for (const t of ['pointermove', 'pointerdown']) document.addEventListener(t, e => {
    _lhPtr = { x: e.clientX, y: e.clientY, mouse: e.pointerType === 'mouse' };
    if (!_lhDwellAt) return;
    if (Math.hypot(e.clientX - _lhDwellAt.x, e.clientY - _lhDwellAt.y) >= LH_MAP_DWELL_PX || (e.target.closest && e.target.closest('#rhymeSelBar, #rhymeAnalysis'))) _lhDwellCancel();
}, true);
document.addEventListener('wheel', _lhDwellCancel, { capture: true, passive: true });
for (const t of ['keydown', 'compositionstart']) document.addEventListener(t, _lhDwellCancel, true);

// 點浮動列以外的地方收掉
document.addEventListener('pointerdown', e => {
    if (_lhMapBarSnap && !(e.target.closest && e.target.closest('#rhymeSelBar, #rhymeAnalysis'))) lhMapHideBar();
}, true);
// Esc：收掉、焦點回輸入框、選取不動（capture：≤ 900 的 sheet 才不會同時被收起）
document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !_lhMapBarSnap || e.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    e.stopPropagation();
    if (_lhMapAnOn) return lhMapHideAnalysis(true);   // 面板開著：先只收面板，焦點與選取回輸入框；再按一次 Esc 才收浮動列
    const s = _lhMapBarSnap;
    _lhMapBarSkip = _lhMapSelSig(s.ta);
    lhMapHideBar();
    _lhMapBarRestore(s);
}, true);

// 焦點與選取還給輸入框（只還原同一個範圍，不寫 .value）
function _lhMapBarRestore(s) {
    if (!s.ta.isConnected) return;
    s.ta.focus({ preventScroll: true });
    s.ta.setSelectionRange(s.a, s.b);
}

// 展開／收起讀音那一列：「自動」加上字典裡這個字的每個讀音（字典順序）；目前生效的讀音標 aria-pressed，鍵盤打開時焦點先到它
function lhMapReadingToggle(byKeyboard) {
    const s = _lhMapBarSnap;
    if (!s || !s.rd || !_lhMapBar) return;
    const row = _lhMapBar.querySelector('.rm-bar-reading'), btn = _lhMapBar.querySelector('.rm-bar-rd');
    if (!row.hidden) { row.hidden = true; btn.setAttribute('aria-expanded', 'false'); _lhMapBarPlace(); return; }
    lhMapHideAnalysis();   // 同時只開一個：展開讀音列就收掉面板
    const song = curSong();
    const t = { char: s.rd.char, tail: s.rd.tail };
    const cur = lhRhymeReading(t, song && song.readings);
    const chip = (text, r) => {
        const c = _lhMkBtn('rm-chip', text);
        c.dataset.r = r;
        c.setAttribute('aria-pressed', String(r !== '' && r === cur));
        return c;
    };
    row.replaceChildren(_lhMk('span', 'rm-bar-reading-label', '「' + t.char + '」讀音'), chip('自動', ''),
        ...getCharAllReadings(t.char).map(x => chip(x.reading, x.reading)));
    row.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    _lhMapBarPlace();   // 列變高了：重新夾進可見範圍
    if (byKeyboard) (row.querySelector('[aria-pressed="true"]') || row.querySelector('.rm-chip')).focus({ preventScroll: true });
}

// ==================== 句構分析面板（MAP-09／MAP-10，CONTEXT B4／C3，UI-SPEC D-07／D-08／D-09／4.2） ====================
// 浮動列的「📏 分析」：列出反白碰到的每一行的字數與斷句結構，有對照段落就在每行下面多一列對照（✓／≠）。
// 內容全從模型文字算（lhLineRows），不看常駐標記的設定；每個字串都走 textContent
const LH_MAP_AN_ROWS = 80;      // 最多畫這麼多行，其餘只算進「選到幾行、共幾字」

function lhMapAnalysisBuild() {
    if (_lhMapAn) return _lhMapAn;
    const m = _lhMk('div', 'word-ctx-menu section-menu');
    m.id = 'rhymeAnalysis';
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-label', '句構分析');
    m.tabIndex = -1;
    // 拖標題可以移動面板（滑鼠、觸控都行）；移過之後重新排版只夾回畫面，不再自動貼回浮動列
    m.addEventListener('pointerdown', e => {
        const h = e.target.closest && e.target.closest('.section-menu-title');
        if (!h || e.button > 0) return;
        const sx = e.clientX - parseFloat(m.style.left || 0), sy = e.clientY - parseFloat(m.style.top || 0);
        const move = ev => { _lhMapAnMoved = true; lhPlaceMenu(m, ev.clientX - sx, ev.clientY - sy); };
        const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); };
        addEventListener('pointermove', move);
        addEventListener('pointerup', up);
        addEventListener('pointercancel', up);
    });
    // 面板不能搶走輸入框的焦點與選取（手機鍵盤才不會收起來）；表格的捲動區照常能捲
    for (const t of ['pointerdown', 'mousedown']) m.addEventListener(t, e => { if (!(e.target.closest && e.target.closest('.rm-an-scroll'))) e.preventDefault(); });
    // Tab 只在「捲動區（有溢出才可聚焦）」和「關閉句構」之間繞
    m.addEventListener('keydown', e => {
        if (e.key !== 'Tab') return;
        if (e.target.closest && e.target.closest('.rm-an-input')) return;   // 改句構的輸入框：Tab 照常
        const items = [...m.querySelectorAll('.rm-an-scroll[tabindex="0"], .rm-an-edit, .rm-an-act, .section-menu-close')], i = items.indexOf(document.activeElement);
        e.preventDefault();
        items[i < 0 ? (e.shiftKey ? items.length - 1 : 0) : (i + (e.shiftKey ? -1 : 1) + items.length) % items.length].focus({ preventScroll: true });
    });
    document.body.appendChild(m);
    _lhMapAn = m;
    return m;
}

// pos 所在的實體行號（0 起算，數 \n）
function _lhMapRowAt(v, pos) {
    let n = 0;
    for (let p = v.indexOf('\n'); p >= 0 && p < pos; p = v.indexOf('\n', p + 1)) n++;
    return n;
}

// 面板內容：回傳 { kids, k }，k 是碰到的可分析行數
function _lhMapAnContent(song, sec, snap) {
    const kids = [_lhMk('div', 'section-menu-title', '句構：' + _lhMapCut(sec.label || '', 16))];
    const cap = t => _lhMk('span', 'section-menu-cap', t);
    const text = sec.text;
    if (text.length > LH_WD_BIG || text.split('\n').length > LH_MAP_MAX_LINES) {   // 和 lhMapPaint 同一個上限：太長不分析、不量版面
        kids.push(cap('段落太長，不做句構分析'));
        return { kids, k: 0 };
    }
    // 碰到的實體行：選取起點那行到最後一個非空白字那行（部分選到的行整行算；剛好停在下一行開頭不算碰到）
    const v = snap.ta.value;
    const r0 = _lhMapRowAt(v, snap.a), r1 = _lhMapRowAt(v, Math.max(snap.a, snap.end - 1));
    const rows = [];
    lhLineRows(text, undefined, song.structs).forEach((r, n) => { if (r.row >= r0 && r.row <= r1) rows.push({ r, i: n + 1 }); });   // i：可分析行的順序（對照也用它）
    if (!rows.length) {
        kids.push(cap('選取的範圍沒有可分析的行'));
        return { kids, k: 0 };
    }
    kids.push(_lhMk('div', 'rm-sum', '選到 ' + rows.length + ' 行，共 ' + rows.reduce((s, x) => s + x.r.n, 0) + ' 字'));
    const ri = lhLineRefIndex(song.sections)[song.sections.indexOf(sec)];
    const ref = ri >= 0 ? song.sections[ri] : null;
    if (ref) kids.push(cap('對照：' + _lhMapCut(ref.label || '', 16) + '（同類型第一段）'));
    else {
        const nm = sec.type === 'custom' ? (sec.custom || '').trim() : '';
        kids.push(cap('沒有對照段落：這是第一個「' + _lhMapCut(nm || (typeof LH_SEC_NAMES[sec.type] === 'string' ? LH_SEC_NAMES[sec.type] : sec.label) || '', 16) + '」'));
    }
    if (wordPhoneticMap.size === 0) kids.push(cap('詞庫載入中，括號裡的自動斷句稍後補上'));   // 詞庫沒好就不會猜 ≈（D-18）
    const refRows = ref ? lhLineRows(ref.text, undefined, song.structs) : null;
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    const table = _lhMk('table', 'rm-an-table');
    const head = _lhMk('tr');
    for (const h of ['行', '文字', '結構']) { const th = _lhMk('th', '', h); th.scope = 'col'; head.append(th); }
    const tb = _lhMk('tbody');
    for (const { r, i } of rows.slice(0, LH_MAP_AN_ROWS)) {
        const st = _lhMk('td', 'rm-an-s');
        st.append(_lhMapAnEdit(sec.id, lines[r.row], r));
        const tr = _lhMk('tr', refRows ? '' : 'rm-an-end');
        const no = _lhMk('td', 'rm-an-no');
        no.append(_lhMk('span', 'rm-an-l', '第 ' + i + ' 行'), _lhMk('span', 'rm-an-n', r.n + ' 字'));   // 字數放在行號下面
        const tt = _lhMk('td', 'rm-an-t');
        tt.append(_lhMapBraces(lines[r.row], r));
        tr.append(no, tt, st);
        tb.append(tr);
        if (!refRows) continue;
        // 對照放在這行下面的整列（不多一欄，390px 的手機放得下，CONTEXT C3 的已聲明覆寫）
        const rr = refRows[i - 1], td = _lhMk('td'), tr2 = _lhMk('tr', 'rm-an-ref rm-an-end');
        td.colSpan = 3;
        if (!rr) td.textContent = '對照段落沒有第 ' + i + ' 行';
        else {
            const rs = _lhMk('span', 'rm-an-rs');
            if (!_lhMapStructInto(rs, rr)) rs.textContent = '—';
            const vd = _lhMk('span', 'rm-an-v', rr.n === r.n ? '✓' : '≠');
            vd.setAttribute('role', 'img');
            vd.setAttribute('aria-label', rr.n === r.n ? '字數相同' : '字數不同');
            td.append('對照 ' + _lhMapCut(ref.label || '', 16) + ' 第 ' + i + ' 行：' + rr.n + ' 字　', rs, vd);
        }
        tr2.append(td);
        tb.append(tr2);
    }
    const cp = _lhMk('caption', 'sr-only', '逐行句構');
    const thead = _lhMk('thead');
    thead.append(head);
    table.append(cp, thead, tb);
    const sc = _lhMk('div', 'rm-an-scroll');
    sc.setAttribute('role', 'region');
    sc.setAttribute('aria-label', '逐行句構');
    sc.append(table);
    if (rows.length > LH_MAP_AN_ROWS) sc.append(cap('只顯示前 ' + LH_MAP_AN_ROWS + ' 行'));
    kids.push(sc, cap('點結構可以自己改（例如 4+4+4·2·3·2）；斜體是機器猜的'));
    // 三種模式：自動（預設）、AI 斷句（這幾行交給 AI）、手動（點結構改）；有指定過的可以一次改回自動
    const acts = _lhMk('div', 'rm-an-acts');
    const ai = _lhMkBtn('section-menu-btn rm-an-act', '🤖 AI 斷句');
    ai.addEventListener('click', () => lhMapAiStruct(sec.id, rows.slice(0, LH_MAP_AN_ROWS).map(x => lines[x.r.row]), ai));
    acts.append(ai);
    const own = rows.filter(x => x.r.src !== 'auto');
    if (own.length) {
        const back = _lhMkBtn('section-menu-btn rm-an-act', '全部改回自動');
        back.addEventListener('click', () => lhMapSetStructs(own.map(x => [lines[x.r.row], null])));
        acts.append(back);
    }
    kids.push(acts);
    return { kids, k: rows.length };
}

// 整行歌詞完整顯示，每一組底下一個倒下來的大括號（︸）和字數；機器猜的組，數字是斜體。組與組之間的空白、標點照原樣
function _lhMapBraces(line, r) {
    const cs = Array.from(line), out = _lhMk('span', 'rm-br-line');
    let p = 0;
    r.groups.forEach((g, k) => {
        const a = r.starts[k], b = r.ends[k];
        const gap = cs.slice(p, a).join('');
        if (gap && (k || gap.trim())) out.append(_lhMk('span', 'rm-br-gap', k ? gap : gap.trimStart()));   // 行首的空白不畫
        const grp = _lhMk('span', 'rm-br');
        grp.append(_lhMk('span', 'rm-br-t', cs.slice(a, b).join('')), _lhMk('span', 'rm-br-b'), _lhMk('span', 'rm-br-n' + (r.guess[k] ? ' lm-guess' : ''), String(g)));
        out.append(grp);
        p = b;
    });
    const tail = cs.slice(p).join('').trimEnd();   // 行尾的標點照畫（引號、問號），空白不畫
    if (tail) out.append(_lhMk('span', 'rm-br-gap', tail));
    return out;
}

// 結構欄：按鈕顯示目前的句構（手動、AI 指定的另外標記），點了變輸入框；Enter 或離開就存，Esc 取消，清空＝改回自動
function _lhMapAnEdit(secId, line, r) {
    const b = _lhMkBtn('rm-an-edit', '', '第 ' + r.n + ' 字這行的句構，點一下修改');
    if (!_lhMapStructInto(b, r)) b.textContent = '—';
    if (r.src !== 'auto') b.append(_lhMk('span', 'rm-an-src', r.src === 'ai' ? 'AI' : '手動'));
    b.addEventListener('click', () => {
        const inp = _lhMk('input', 'rm-an-input');
        inp.value = r.groups.join('+');
        inp.setAttribute('aria-label', '句構（' + r.n + ' 字）');
        inp.inputMode = 'numeric';
        let done = false;
        const fin = save => {
            if (done) return;
            done = true;
            const v = inp.value.trim();
            if (!save || v === r.groups.join('+')) { inp.replaceWith(b); b.focus({ preventScroll: true }); return; }
            if (!v) { lhMapSetStructs([[line, null]]); return; }
            const g = lhLineParseStruct(v, r.n);
            if (!g) { done = false; showToast('加起來要是 ' + r.n + ' 字'); inp.focus(); return; }
            lhMapSetStructs([[line, g, 'man']]);
        };
        inp.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); fin(true); }
            else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fin(false); }
        });
        inp.addEventListener('blur', () => fin(true));
        b.replaceWith(inp);
        inp.focus();
        inp.select();
    });
    return b;
}

// 寫這首歌的句構表：items＝[[整行文字, 各組字數 或 null（改回自動）, 'man'|'ai']]。和讀音一樣不是復原步驟；重畫、面板跟著更新
function lhMapSetStructs(items) {
    const song = curSong();
    if (!song) return;
    for (const [line, g, src] of items) {
        const k = String(line).trim();
        if (!k) continue;
        if (g) (song.structs ||= {})[k] = { g, src: src === 'ai' ? 'ai' : 'man' };
        else if (song.structs) delete song.structs[k];
    }
    if (song.structs && !Object.keys(song.structs).length) delete song.structs;
    markDirty(song.id);
    flushSongs();
    _lhMapReadVer++;
    lhMapRenderAll();
    if (_lhMapAnOn && _lhMapBarSnap) lhMapOpenAnalysis(_lhMapBarSnap, true);
}

// AI 斷句：提示詞放在後台（Worker 的 worker/src/prompts.js），這裡只把歌詞填進去送出。
// AI 回的每一行加總要等於字數才收，不對的那行沿用自動
let _lhMapStructPrompt = null;
async function lhMapAiStruct(secId, lines, btn) {
    const todo = [...new Set(lines.map(l => l.trim()).filter(Boolean))];
    if (!todo.length || btn.disabled) return;
    btn.disabled = true;
    btn.textContent = 'AI 斷句中…';
    try {
        if (!_lhMapStructPrompt) {
            const res = await fetch(WORKER_URL + '/prompts/line-struct', { signal: AbortSignal.timeout(10000) }).then(r => r.json()).catch(() => null);
            if (!res || !res.ok || typeof res.prompt !== 'string') throw aiError('後台還沒有斷句的提示詞，請先部署 Worker');
            _lhMapStructPrompt = res.prompt;
        }
        const reply = await callLLM(aiTryList()[0], _lhMapStructPrompt.replace('{{LINES}}', todo.map((l, i) => (i + 1) + '. ' + l).join('\n')));
        let got = null;
        try { got = JSON.parse((reply.match(/\{[\s\S]*\}/) || [''])[0]).lines; } catch (e) { got = null; }
        if (!Array.isArray(got)) throw aiError('AI 回的格式看不懂，請再試一次');
        const items = [];
        todo.forEach((l, i) => {
            const g = got[i], n = lhLineAnalyze(l).n;
            if (Array.isArray(g) && g.every(x => Number.isInteger(x) && x > 0) && g.reduce((a, b) => a + b, 0) === n) items.push([l, g, 'ai']);
        });
        const bad = todo.length - items.length;
        showToast('AI 斷好 ' + items.length + ' 行' + (bad ? '，' + bad + ' 行字數對不上，沿用自動' : ''));
        if (items.length) lhMapSetStructs(items);
    } catch (e) {
        lhWarn('AI 斷句失敗', e);
        showToast(e.plain ? e.message : 'AI 暫時無法使用，請稍後再試');
    } finally {
        btn.disabled = false;
        btn.textContent = '🤖 AI 斷句';
    }
}

// byKeyboard：鍵盤打開才把焦點放進面板；滑鼠、觸控不搶焦點（輸入框的選取與手機鍵盤都留著）
function lhMapOpenAnalysis(snap, byKeyboard) {
    if (!snap || _lhComposing || !_lhMapBar) return;
    try {
        const song = curSong(), sec = song && song.sections.find(x => x.id === snap.secId);
        if (!sec) return;
        // 浮動列、面板算同一層：其他浮層和讀音列先收
        lhMapCloseStats(false);
        lhMapCloseMenu(false);
        if (typeof closeExportMenu === 'function') closeExportMenu();
        const row = _lhMapBar.querySelector('.rm-bar-reading');
        if (!row.hidden) {
            row.hidden = true;
            _lhMapBar.querySelector('.rm-bar-rd').setAttribute('aria-expanded', 'false');
            _lhMapBarPlace();
        }
        const m = lhMapAnalysisBuild(), { kids, k } = _lhMapAnContent(song, sec, snap);
        const close = _lhMkBtn('section-menu-btn section-menu-close', '關閉句構');
        close.addEventListener('click', () => lhMapHideAnalysis(true));
        kids.push(close);
        m.replaceChildren(...kids);
        _lhMapAnOn = true;
        _lhMapBar.querySelector('.rm-bar-an').setAttribute('aria-expanded', 'true');
        _lhMapAnPlace();
        if (k > 0) lhAnnounce('句構分析：選到 ' + k + ' 行');
        if (byKeyboard) m.focus({ preventScroll: true });
    } catch (e) {
        lhWarn('韻腳地圖句構分析失敗', e);
        lhMapHideAnalysis();
    }
}

// refocus：按「關閉句構」或 Esc 才把焦點與選取還給輸入框
function lhMapHideAnalysis(refocus) {
    _lhDwellCancel();
    if (!_lhMapAn || !_lhMapAnOn) return;
    _lhMapAnOn = false;
    _lhMapAnMoved = false;
    _lhMapAn.classList.remove('show');
    if (_lhMapBar) _lhMapBar.querySelector('.rm-bar-an').setAttribute('aria-expanded', 'false');
    if (refocus && _lhMapBarSnap) _lhMapBarRestore(_lhMapBarSnap);
}

// 放在浮動列下方；放不下就翻到上方；上下都放不下就留給比較大的那一邊並在面板內捲動。浮動列自己不動
let _lhMapAnMoved = false;   // 使用者拖過面板了
function _lhMapAnPlace() {
    const p = _lhMapAn, bar = _lhMapBar;
    if (!p || !bar || !_lhMapAnOn) return;
    if (_lhMapAnMoved) { lhPlaceMenu(p, parseFloat(p.style.left), parseFloat(p.style.top)); return; }
    const r = bar.getBoundingClientRect(), vv = window.visualViewport;
    const vTop = vv ? vv.offsetTop : 0, vBot = vTop + (vv ? vv.height : innerHeight);
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    p.style.maxHeight = '';
    lhPlaceMenu(p, r.left, r.bottom + 4);
    const h = p.getBoundingClientRect().height;
    const below = vBot - (r.bottom + 4) - 4, above = r.top - 4 - (vTop + 4);
    if (h > below) {   // 下面放不下（lhPlaceMenu 已把它擠上去蓋住浮動列）
        if (h <= above) lhPlaceMenu(p, r.left, r.top - h - 4);
        else {
            const up = above > below, free = Math.max(up ? above : below, 8 * rem);
            p.style.maxHeight = free + 'px';
            lhPlaceMenu(p, r.left, up ? r.top - Math.min(h, free) - 4 : r.bottom + 4);
        }
    }
    // 捲動區真的有溢出才讓鍵盤聚焦得到
    const sc = p.querySelector('.rm-an-scroll');
    if (sc) { if (sc.scrollHeight > sc.clientHeight + 1) sc.tabIndex = 0; else sc.removeAttribute('tabindex'); }
}

// 指定（或用 null 清掉）某個句尾的讀音：只寫這首歌的 readings，不是復原步驟（D-08）；
// 馬上重畫那一段、朗讀、收掉浮動列。鍵只認「句尾連續漢字（最多 4 個）完全相同」，改了句尾就自動不再套用（A3）
function lhMapSetReading(secId, tail, reading) {
    const song = curSong();
    if (!song || typeof tail !== 'string' || !tail) return;
    const char = Array.from(tail).pop();
    if (reading !== null && !getCharAllReadings(char).some(r => r.reading === reading)) return;
    if (reading === null) {
        if (song.readings) {
            delete song.readings[tail];
            if (!Object.keys(song.readings).length) delete song.readings;
        }
    } else {
        if (!song.readings) song.readings = {};
        song.readings[tail] = reading;
    }
    markDirty(song.id);
    flushSongs();
    _lhMapReadVer++;
    const sn = _lhMapBarSnap;
    if (sn) _lhMapBarSkip = _lhMapSelSig(sn.ta);
    lhMapHideBar();
    lhMapRenderAll();   // readings 是整首歌共用（key＝句尾文字），別段同樣句尾的行也要跟著變
    lhAnnounce(reading === null ? '「' + char + '」讀音改回自動' : '已指定「' + char + '」讀音為 ' + reading);
}

// 查韻（withAI＝false）或查韻後問 AI（true）：做的事和搜尋框的 input 處理一樣（清已選字、更新提示、_handleSearch），不另寫第二套查詢
async function lhMapLookup(char, withAI, byKeyboard) {
    const s = _lhMapBarSnap;
    try {
        if (!char) return;
        if (s) _lhMapBarSkip = _lhMapSelSig(s.ta);
        lhMapHideBar();
        lastLyricsSelection = '';   // AI 要拿整首歌當風格參考，不是被選的那個字（Pitfall 9）
        searchInputEl.value = char;
        selectedChars.clear();
        updateSelectedCharsHint();
        const done = _handleSearch(char);
        if (lhIsSheetMode()) {
            if (!withAI) mobileTab('search');
            else if (document.getElementById('rightPanel').classList.contains('collapsed')) mobileTab('ai');
        } else {
            if (withAI && document.getElementById('rightPanel').classList.contains('collapsed')) toggleRightPanel();
            if (byKeyboard && s) _lhMapBarRestore(s);
        }
        await done;
        if (withAI) document.getElementById('generateBtn').click();   // 按鈕忙碌中是 disabled，點了沒反應
    } catch (e) {
        lhWarn('韻腳地圖查韻失敗', e);
    }
}

// 就緒閘門（A5）：字典、歌曲結束（成功或失敗都算）就開始畫逐行標記（字數、明確斷點不需要詞庫，CONTEXT A4）；
// 詞庫也結束才做韻腳分析與猜斷句，之前不畫、也不顯示錯誤。__lhMapReady 是「全部都結束」的訊號。
Promise.allSettled([window.__hoyunReady, window.__hoyunSongsReady]).then(() => {
    try {
        _lhMapOk = true;
        lhMapRenderAll();
    } catch (e) {
        lhWarn('韻腳地圖首次畫標記失敗', e);
    }
});
window.__lhMapReady = Promise.allSettled([window.__hoyunReady, window.__hoyunWordlistReady, window.__hoyunSongsReady]).then(() => {
    try {
        _lhMapWl = true;
        lhMapMenuSync();   // 選單可能已經開著：把「詞庫載入中」收掉
        lhMapRenderAll();
    } catch (e) {
        lhWarn('韻腳地圖首次上色失敗', e);
    }
});

// ==================== 滑過才顯示（hoverOnly）====================
// 色塊平常透明；指標停在某個有韻的字上，同一段（或預覽）裡同韻鍵的字加 .rm-show 浮出，移開就淡掉（CSS transition）。
// 輸入框蓋在鏡像層上面，所以用指標座標去比鏡像層色塊的位置。觸控：點一下字顯示 2 秒
let _lhHvBox = null, _lhHvKey = null, _lhHvRaf = 0, _lhHvTimer = 0;
function _lhHvSet(box, key) {
    if (box === _lhHvBox && key === _lhHvKey) return;
    if (_lhHvBox) for (const e of _lhHvBox.querySelectorAll('.rm-show')) e.classList.remove('rm-show');
    _lhHvBox = box; _lhHvKey = key;
    if (box && key) for (const e of box.querySelectorAll('[data-k]')) if (e.dataset.k === key) e.classList.add('rm-show');
}
function _lhHvBoxesOf(t, x, y) {
    const pv = document.querySelector('#mapSettingsSection .lm-preview');   // 預覽可能不接指標事件，用位置判斷
    const pr = pv && pv.offsetParent && pv.getBoundingClientRect();
    if (pr && x >= pr.left && x <= pr.right && y >= pr.top && y <= pr.bottom) return { scope: pv, mirrors: [pv] };
    const sec = t.closest && t.closest('.lyrics-section');
    if (sec && t.closest('.section-body')) return { scope: sec, mirrors: [...sec.querySelectorAll('.rhyme-mirror')] };
    return null;
}
function _lhHvAt(x, y, t) {
    const b = _lhHvBoxesOf(t, x, y);
    if (!b) return _lhHvSet(null, null);
    for (const m of b.mirrors) for (const e of m.querySelectorAll('[data-k]')) {
        for (const r of e.getClientRects()) if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return _lhHvSet(b.scope, e.dataset.k);
    }
    _lhHvSet(null, null);
}
document.addEventListener('pointermove', e => {
    if (!_lhMapSet.hoverOnly || e.pointerType !== 'mouse') return;
    const { clientX: x, clientY: y, target: t } = e;
    if (_lhHvRaf) return;
    _lhHvRaf = requestAnimationFrame(() => { _lhHvRaf = 0; _lhHvAt(x, y, t); });
}, { passive: true });
document.addEventListener('pointerdown', e => {
    if (!_lhMapSet.hoverOnly || e.pointerType === 'mouse') return;
    _lhHvAt(e.clientX, e.clientY, e.target);
    clearTimeout(_lhHvTimer);
    _lhHvTimer = setTimeout(() => _lhHvSet(null, null), 2000);
}, { passive: true });
