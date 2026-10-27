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

// 17 色寫成 CSS 變數 --rm-c0…--rm-c16：深色主題用 dark 組，其餘 light 組（色碼只存在 JS，CSS 不寫色碼）
function lhMapApplyPalette() {
    const set = document.documentElement.getAttribute('data-theme') === 'dark' ? LH_RHYME_COLORS.dark : LH_RHYME_COLORS.light;
    set.forEach((hex, n) => {
        if (LH_MAP_HEX.test(hex)) document.documentElement.style.setProperty('--rm-c' + n, hex);
    });
}
// 版面外觀（第 11 階段）：位置、字級、欄寬都只改 <html> 的屬性與 CSS 變數，不重畫、不重新分析（RESEARCH Pattern 8）。
// 寫進 style.setProperty 的值一律來自下面這幾張常數表，絕不直接用儲存裡的字串
const LH_MAP_LOOK_KEYS = new Set(['pos', 'size', 'depth']);   // 這幾個設定只影響 CSS，改了不必重畫鏡像層
const LH_MAP_SIZE_REM = { s: 0.75, m: 0.875, l: 1 };           // 標記字級（UI-SPEC D-21）
const LH_MAP_COL_EM = { lnRhyme: 1.25, lnCount: 1.5, lnDiff: 2.25, lnSplit: 5.5 };   // 靠右欄各欄寬度（單位 em，UI-SPEC 3.2）；欄與欄之間再加 0.5em
// 逐行標記有沒有內容要顯示：總開關開著，而且四個內容項至少開一個
function _lhMapNeedMk() {
    return _lhMapSet.line && (_lhMapSet.lnRhyme || _lhMapSet.lnCount || _lhMapSet.lnSplit || _lhMapSet.lnDiff);
}
function lhMapApplyLook() {
    const root = document.documentElement;
    // 欄位的有無只看設定、不看文字內容（X3）：不然打下第一個字的瞬間輸入框內距會變，輸入框會跳版
    if (_lhMapNeedMk()) root.setAttribute('data-lm', _lhMapSet.pos);
    else root.removeAttribute('data-lm');
    const rem = LH_MAP_SIZE_REM[_lhMapSet.size];
    const cols = Object.keys(LH_MAP_COL_EM).filter(k => _lhMapSet[k]);
    const em = cols.reduce((a, k) => a + LH_MAP_COL_EM[k], 0) + 0.5 * Math.max(0, cols.length - 1);
    root.style.setProperty('--lm-fs', rem + 'rem');
    root.style.setProperty('--lm-cols', (em * rem) + 'rem');
    lhMapApplyPalette();
    if (_lhComposing) return;   // 組字中不量版面；下一次畫的時候會對齊
    document.querySelectorAll('#lyricsSections .section-textarea').forEach(ta => {
        const mirror = _lhMapMirrorOf(ta);
        if (mirror) _lhMapSync(ta, mirror);   // 輸入框內距變了，鏡像層要馬上複製，ResizeObserver 不會因為內距改變而觸發
    });
}
lhMapApplyLook();
// 日夜主題切換（applyTheme 改 <html data-theme>）：換一組色票就好，不必重畫——色塊讀的是 CSS 變數
new MutationObserver(lhMapApplyPalette).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

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
}

function _lhMapMirrorOf(ta) {
    const m = ta.previousElementSibling;
    return m && m.classList.contains('rhyme-mirror') ? m : null;
}

// 行尾空白（半形、全形、tab）要留在換行旁邊、標記插在它前面：標記夾在行尾空白與換行之間，會破壞 pre-wrap 行尾空白的懸掛，讓該行多折一列（X1）
const _LH_TRAIL_WS = /[ \t\u3000]+$/;

// 一行的標記：字數與斷句結構（以及對照差異），沒有可分析內容的行（空行、純標點）回 null（A3）。文字一律 textContent。
// row：韻腳分析的這一行（沒有分析就是 undefined，行尾韻腳字母留空欄位）。
// diff：{ refN, k }，refN 是對照段落各「可分析行」的字數，k 是這個段落目前數到第幾個可分析行（CONTEXT B3：照可分析行的順序對，不是照原始行號）
function _lhMapMarker(line, diff, row) {
    const r = lhLineAnalyze(line);
    if (r.n <= 0) return null;
    const mk = _lhMk('span', 'lm-mk');
    if (_lhMapSet.lnRhyme) {
        const t = _lhMk('span', 'lm-t lm-t-r', row ? row.letter || '-' : '');   // 沒有韻腳是「-」；有韻腳的字母底下畫家族色（和標題列字母條同一套）
        if (row && row.key !== null) t.dataset.f = String(row.f);
        mk.append(t);
    }
    if (_lhMapSet.lnCount) mk.append(_lhMk('span', 'lm-t lm-t-c', String(r.n)));
    if (_lhMapSet.lnDiff) {
        const b = diff.refN[diff.k];   // 對照段落沒有這一行（比較短）就是 undefined，什麼都不加
        mk.append(_lhMk('span', 'lm-t lm-t-d', b !== undefined && b !== r.n ? '≠' + b : ''));   // 空的 span 也要留著，欄位才對得齊
    }
    diff.k++;
    if (_lhMapSet.lnSplit) {
        const st = _lhMk('span', 'lm-t lm-t-s');   // 沒有結構（少於兩組）也要有這個欄位，欄位才對得齊
        for (const part of lhLineStructParts(r)) {
            if (part.guess) st.append(_lhMk('span', 'lm-guess', part.text));
            else st.append(part.text);
        }
        mk.append(st);
    }
    return mk;
}

// 把一段文字依目前設定建成鏡像層的 DocumentFragment（真實鏡像層與之後的預覽共用）。回傳 { frag, res, on }：
// res 是韻腳分析結果（沒有任何韻腳功能開著就是 null），on 代表至少畫了一個色塊、底線或標記
function _lhMapBuildFrag(text, readings, refText) {
    const S = _lhMapSet;
    const needMk = !!_lhMapNeedMk();
    const needRhyme = _lhMapWl && (S.end || S.inner || S.letters || (S.line && S.lnRhyme));   // 詞庫沒載好前不做韻腳分析
    const paintRows = (_lhMapWl && (S.end || S.inner)) || needMk;   // 只開結構字母：鏡像層不必逐行排版
    const res = needRhyme ? lhRhymeAnalyze(text, { strict: S.strict, skipParticles: S.skipParticles, inner: S.inner }, readings) : null;
    const frag = document.createDocumentFragment();
    let on = false;
    // 對照差異：對照段落每個可分析行的字數（只要字數，不猜斷句，所以傳一個永遠說「沒有這個詞」的判斷）
    const diff = { refN: S.line && S.lnDiff ? lhLineRows(refText || '', () => false).map(x => x.n) : [], k: 0 };
    const rows = !paintRows ? [] : res ? res.rows : text.replace(/\r\n?/g, '\n').split('\n').map(line => ({ line, t: null, inner: [] }));
    rows.forEach((r, n) => {
        // 這一行要特別標示的字：句尾字（色塊，句尾上色開著才有）與句中押韻的字（底線）
        const marks = new Map();
        if (r.t && S.end) marks.set(r.t.i, { cls: (r.solo ? 'rm-hl rm-solo' : 'rm-hl') + (r.manual ? ' rm-manual' : ''), f: r.f });
        for (const m of r.inner) marks.set(m.i, { cls: 'rm-inner', f: m.f });
        const mk = needMk ? _lhMapMarker(r.line, diff, res ? r : undefined) : null;
        if (!marks.size && !mk) frag.append(r.line);
        else {
            const m = mk && _LH_TRAIL_WS.exec(r.line);
            const core = m ? r.line.slice(0, m.index) : r.line;
            let buf = '';
            Array.from(core).forEach((c, i) => {
                const hit = marks.get(i);
                if (!hit) { buf += c; return; }
                if (buf) { frag.append(buf); buf = ''; }
                const sp = document.createElement('span');
                sp.className = hit.cls;
                sp.dataset.f = String(hit.f);
                sp.textContent = c;
                frag.append(sp);
            });
            if (buf) frag.append(buf);
            if (mk) frag.append(mk);
            if (m) frag.append(m[0]);
            on = true;
        }
        if (n < rows.length - 1) frag.append('\n');
    });
    if (paintRows) frag.append('​');   // 結尾零寬字元：文字以換行結尾時，和輸入框一樣多出一個空行
    return { frag, res, on };
}

// 畫一段：從模型讀文字（不讀輸入框，G2），一次 replaceChildren
function lhMapPaint(secEl) {
    const song = curSong();
    const sec = song && secEl && song.sections.find(x => x.id === secEl.dataset.id);
    const ta = secEl && secEl.querySelector('.section-textarea');
    const mirror = ta && _lhMapMirrorOf(ta);
    if (!sec || !mirror) return;
    const S = _lhMapSet;
    const sig = [S.end, S.letters, S.inner, S.strict, S.skipParticles, S.line, S.lnRhyme, S.lnCount, S.lnSplit, S.lnDiff].map(Number).join('') + '|' + _lhMapEpoch + '|' + _lhMapReadVer;   // pos／size／depth／colors 只改 CSS，不進簽名（E2）
    // 對照段落的文字（同類型第一段，CONTEXT B1）：對照差異關著就不看；它改了，這一段的快取就失效（RESEARCH X9）
    let refText = null;
    if (S.line && S.lnDiff) {
        const r = lhLineRefIndex(song.sections)[song.sections.indexOf(sec)];
        refText = r >= 0 ? song.sections[r].text : null;
    }
    const hit = _lhMapCache.get(sec.id);
    if (hit && hit.text === sec.text && hit.sig === sig && hit.ref === refText) {   // 沒變：只把「暫時藏起來」解除，不重畫
        mirror.classList.remove('rm-stale');
        _lhMapSync(ta, mirror);
        return;
    }
    const text = sec.text;
    let on = false, res = null;
    const big = text.length > LH_WD_BIG || text.split('\n').length > LH_MAP_MAX_LINES;
    // 句尾上色、句中押韻、結構字母、逐行標記全關，或段落太大：完全不分析，和第 9 階段一樣（D-18、D-17）
    if (!((_lhMapWl && (S.end || S.inner || S.letters)) || _lhMapNeedMk()) || big) {
        mirror.replaceChildren();   // 關掉或太大：不分析，鏡像層留空
    } else {
        const built = _lhMapBuildFrag(text, song.readings, refText);
        res = built.res;
        on = built.on;
        mirror.replaceChildren(built.frag);
    }
    secEl.classList.toggle('rm-on', on);
    mirror.classList.remove('rm-stale');
    _lhMapSync(ta, mirror);   // 顯示出來之後才設得動 scrollTop，所以放在最後
    _lhMapCache.set(sec.id, { text, sig, res, ref: refText });
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
            sp.textContent = r.letter || '-';
            if (r.key !== null) sp.dataset.f = String(r.f);
            return sp;
        });
        if (rows.length > 12) kids.push(document.createTextNode('…'));
        strip.replaceChildren(...kids);
        strip.setAttribute('aria-label', '押韻結構 ' + res.letters + '，按一下看統計');
        strip.title = res.letters + '　押韻 ' + k + '/' + n + ' 句，點一下看統計';
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
    if (!ta.classList || !ta.classList.contains('section-textarea')) return;
    const mirror = _lhMapMirrorOf(ta);
    if (!mirror) return;
    if (_lhComposing) mirror.classList.add('rm-stale');
    else mirror.scrollTop = ta.scrollTop;
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
}, false);

// ==================== 「韻腳 ▾」選單（E3、UI-SPEC D-12／D-13／D-14） ====================
// 選單只建一次（掛在 body，沿用 .word-ctx-menu.section-menu 的外觀）；每個開關改了就馬上套用、寫進 lh:map，選單不關
let _lhMapMenu = null;
let _lhMapMenuOn = false;
// 文案照 UI-SPEC 第 7 節逐字
const LH_MAP_HINT_LETTERS = '在每個段落標題列顯示 AABB 這類字母';
const LH_MAP_HINT_LINE = '每行旁邊顯示字數與斷句；細項在「更多設定」';
const LH_MAP_HINT_INNER = '句子裡面跟句尾押同韻的字，加底線（每行最多 3 個）';
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
    // 句中押韻的說明用 aria-describedby 接到開關上
    const innerSw = _lhMapSwitchRow('inner', '句中押韻');
    const innerHint = _lhMk('span', 'section-menu-cap', LH_MAP_HINT_INNER);
    innerHint.id = 'rhymeHintInner';
    innerSw.setAttribute('aria-describedby', innerHint.id);
    const lettersSw = _lhMapSwitchRow('letters', '段落結構字母');
    const lettersHint = _lhMk('span', 'section-menu-cap', LH_MAP_HINT_LETTERS);
    lettersHint.id = 'rhymeHintLetters';
    lettersSw.setAttribute('aria-describedby', lettersHint.id);
    const lineSw = _lhMapSwitchRow('line', '逐行標記');
    const lineHint = _lhMk('span', 'section-menu-cap', LH_MAP_HINT_LINE);
    lineHint.id = 'rhymeHintLine';
    lineSw.setAttribute('aria-describedby', lineHint.id);
    const show = _lhMkBlock('顯示', _lhMapSwitchRow('end', '句尾上色'), lettersSw, lettersHint, innerSw, innerHint, lineSw, lineHint);
    // 判定：寬韻／嚴格兩個 radio，下面只顯示目前模式的說明
    const modes = _lhMapModeRadios();
    const help = _lhMk('span', 'section-menu-cap rm-mode-help');
    const skipSw = _lhMapSwitchRow('skipParticles', '忽略句尾語助詞');
    const skipCap = _lhMk('span', 'section-menu-cap', LH_MAP_PARTICLE_CAP);
    skipCap.id = 'rhymeHintSkip';
    skipSw.setAttribute('aria-describedby', skipCap.id);
    const judge = _lhMkBlock('判定', modes, help, skipSw, skipCap);
    // 色票對照：預設收著，每次打開選單都收回去；17 格都是純文字說明，不能點
    const legend = _lhMk('div', 'rm-legend');
    legend.id = 'rhymeLegend';
    legend.hidden = true;
    for (let n = 0; n <= LH_RHYME_NONE; n++) {
        const cell = _lhMk('div', 'rm-cell');
        const swatch = _lhMk('span', 'rm-sw');
        swatch.dataset.f = String(n);
        cell.append(swatch, _lhMk('span', 'rm-cell-label', n === LH_RHYME_NONE ? '空韻' : RHYME_FAMILIES[n].label));
        legend.appendChild(cell);
    }
    const legendBtn = _lhMkBtn('section-menu-btn rm-legend-toggle', '色票對照 ▾');
    legendBtn.setAttribute('aria-expanded', 'false');
    legendBtn.setAttribute('aria-controls', legend.id);
    const more = _lhMkBtn('section-menu-btn rm-more', '更多設定…');   // 開偏好設定裡的完整設定（CONTEXT D1）
    const close = _lhMkBtn('section-menu-btn section-menu-close', '關閉韻腳設定');
    m.append(_lhMk('div', 'section-menu-title', '韻腳地圖'), loading, show, judge, _lhMkBlock('色票對照', legendBtn, legend), more, close);
    document.body.appendChild(m);
    m.addEventListener('click', e => {
        const sw = e.target.closest && e.target.closest('.rm-switch');
        if (sw) lhMapSetSetting(sw.dataset.k, sw.getAttribute('aria-checked') !== 'true');
        const r = e.target.closest && e.target.closest('.type-row');
        if (r) lhMapSetSetting('strict', r.dataset.m === 'strict');
    });
    legendBtn.addEventListener('click', () => {
        legend.hidden = !legend.hidden;
        legendBtn.setAttribute('aria-expanded', String(!legend.hidden));
        _lhMapPlaceMenu();   // 選單變高了：重新夾進可見範圍，關閉鈕才不會掉到畫面外
    });
    more.addEventListener('click', lhMapOpenPrefs);
    close.addEventListener('click', () => lhMapCloseMenu(true));
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
    if (_lhMapMenu) _lhMapMenu.querySelector('.rm-loading').hidden = _lhMapWl;
    // 偏好設定的兩行提醒：詞庫還沒載好（猜的斷句稍後補上）、四個細項都關著（Pitfall 7、UI-SPEC D-17、D-18）
    const wait = document.querySelector('#mapSettingsSection .rm-lex-wait');
    if (wait) wait.hidden = wordPhoneticMap.size > 0;
    const none = document.querySelector('#mapSettingsSection .rm-none');
    if (none) none.hidden = !(_lhMapSet.line && !_lhMapSet.lnRhyme && !_lhMapSet.lnCount && !_lhMapSet.lnSplit && !_lhMapSet.lnDiff);
}

// ==================== 偏好設定裡的「韻腳地圖與句構分析」（第 11 階段，CONTEXT D1／D2） ====================
// 外殼是 index.html 的 <details id="mapSettingsSection">，內容第一次打開（或按「更多設定…」）才建，之後只靠 lhMapMenuSync 更新
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
        ..._lhMapPrefRow('lnRhyme', '行尾韻腳字母', 'A、B…，跟著上面的寬韻／嚴格', 'rmPrefRhyme'),
        ..._lhMapPrefRow('lnCount', '字數', '每行幾個字（空白、標點不算）', 'rmPrefCount'),
        ..._lhMapPrefRow('lnSplit', '斷句結構', '例如 3+4。你自己打的空白和標點一定算；開頭有 ≈ 的是機器猜的', 'rmPrefSplit'),
        ..._lhMapPrefRow('lnDiff', '對照差異', '跟同類型第一段的同一行字數不同時，標出 ≠ 和對方的字數', 'rmPrefDiff'),
    );
    // 詞庫沒載好時，斷句結構的 ≈ 還出不來：提醒一句，載好就自己收起來
    const wait = _lhMk('span', 'section-menu-cap rm-lex-wait', '詞庫載入中，≈ 的自動斷句稍後補上');
    sub.children[5].after(wait);   // 緊接在斷句結構的說明後面
    const none = _lhMk('span', 'section-menu-cap rm-none', '四個細項都關著，所以沒有東西可顯示');
    none.hidden = true;
    sub.append(none);
    const lineRow = _lhMapPrefRow('line', '逐行標記', '每行旁邊顯示淡色小字；下面四項決定要顯示什麼', 'rmPrefLine');
    const mapRows = [
        _lhMapSwitchRow('end', '句尾上色'),
        ..._lhMapPrefRow('letters', '段落結構字母', LH_MAP_HINT_LETTERS, 'rmPrefLetters'),
        ..._lhMapPrefRow('inner', '句中押韻', LH_MAP_HINT_INNER, 'rmPrefInner'),
        ..._lhMapPrefRow('skipParticles', '忽略句尾語助詞', LH_MAP_PARTICLE_CAP, 'rmPrefSkip'),
        _lhMk('span', 'section-menu-cap', '押韻判定'),
        _lhMapModeRadios(),
        _lhMk('span', 'section-menu-cap rm-mode-help'),
    ];
    const posHelp = _lhMk('span', 'section-menu-cap rm-pos-help');
    const look = _lhMkBlock('顯示方式',
        _lhMk('span', 'section-menu-cap', '標記位置'), _lhMapLookRadios('標記位置', 'pos', [['right', '靠右欄'], ['tail', '句尾後']], false), posHelp);
    sec.append(hint, _lhMkBlock('韻腳地圖', ...mapRows), _lhMkBlock('句構分析', ...lineRow, sub), look);
    // 整個段落共用一個點擊監聽（和選單一樣）：開關翻轉、寬韻／嚴格選一個，改了就存、就畫
    sec.addEventListener('click', e => {
        const sw = e.target.closest && e.target.closest('.rm-switch');
        if (sw) lhMapSetSetting(sw.dataset.k, sw.getAttribute('aria-checked') !== 'true');
        const r = e.target.closest && e.target.closest('.type-row[data-m]');
        if (r) lhMapSetSetting('strict', r.dataset.m === 'strict');
        const lk = e.target.closest && e.target.closest('.type-row[data-k]');
        if (lk) lhMapSetSetting(lk.dataset.k, lk.dataset.v);
    });
    lhMapMenuSync();
}
document.getElementById('mapSettingsSection').addEventListener('toggle', e => {
    if (e.target.open) lhMapPrefsBuild();
});

// 「更多設定…」：關掉所有韻腳浮層，打開偏好設定（已經開著就留著，不能走 ⚙️ 的 toggle，那會把它關掉），
// 展開這一段、捲到最上面、焦點放在標題。scrollIntoView 不給 behavior：立即捲動，也就自動尊重「減少動態效果」
function lhMapOpenPrefs() {
    lhMapCloseAll();
    const ov = document.getElementById('settingsOverlay');
    if (!ov.classList.contains('show')) {
        ov.classList.add('show');
        renderLexiconPackList();   // ⚙️ 打開時會做的事：詞庫包清單永遠對得上目前真正在用的包
    }
    const sec = document.getElementById('mapSettingsSection');
    lhMapPrefsBuild();
    sec.open = true;
    sec.scrollIntoView({ block: 'start' });
    sec.querySelector('summary').focus({ preventScroll: true });
}

// 一個設定改了：存檔、套用外觀、選單文字跟著變；只有會改變鏡像層內容的設定才全部段落重畫。
// 只認 LH_MAP_DEFAULTS 的鍵，而且值經過整理後必須原封不動（壞值、不認得的字串都進不來）；colors 不走這裡
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
    const m = lhMapMenuBuild();
    if (typeof lhSecCloseMenu === 'function') lhSecCloseMenu();
    if (typeof closeExportMenu === 'function') closeExportMenu();
    if (typeof closeSongListOverlay === 'function') closeSongListOverlay();
    lhMapCloseAll();
    lhMapMenuSync();
    m.querySelector('#rhymeLegend').hidden = true;   // 色票對照每次打開都收著
    m.querySelector('.rm-legend-toggle').setAttribute('aria-expanded', 'false');
    _lhMapMenuOn = true;
    _lhMapPlaceMenu();
    document.getElementById('rhymeMenuBtn').setAttribute('aria-expanded', 'true');
    if (byKeyboard) m.querySelector('.rm-switch')?.focus({ preventScroll: true });
}

// refocus：按「關閉」或 Esc 才把焦點還給按鈕
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
    lhMapCloseMenu(false);
    lhMapHideBar();
    lhMapCloseStats(false);
}

document.getElementById('rhymeMenuBtn').addEventListener('click', e => {
    if (_lhMapMenuOn) lhMapCloseMenu(false);
    else lhMapOpenMenu(e.detail === 0);   // 鍵盤（Enter／空白）觸發的 click，detail 是 0
});
// 點選單外面關掉；Esc 關掉並把焦點還給按鈕（capture：≤ 900 的 sheet 才不會同時被收起）
document.addEventListener('pointerdown', e => {
    if (_lhMapMenuOn && !(e.target.closest && e.target.closest('#rhymeMenu, #rhymeMenuBtn'))) lhMapCloseMenu(false);
}, true);
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
        if (_lhMapBarSnap) _lhMapBarPlace();   // 選字列也跟著重新放
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
    if (!hit || hit.text !== sec.text) { if (!_lhComposing) lhMapPaint(secEl); }
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
            const sp = _lhMk('span', '', r.letter || '-');
            if (r.key !== null) sp.dataset.f = String(r.f);
            letters.append(sp);
        }
        kids.push(letters);
        kids.push(_lhMk('div', 'rm-sum', '共 ' + sm.n + ' 句，押韻 ' + sm.k + ' 句（' + sm.p + '%）'));
        kids.push(_lhMk('span', 'section-menu-cap', '判定：' + (strict ? '嚴格' : '寬韻')));
        const groups = _lhMk('div', 'section-menu-block');
        for (const g of sm.groups) {
            const row = _lhMk('div', 'rm-group');
            const sw = _lhMk('span', 'rm-sw');
            sw.dataset.f = String(g.f);
            row.append(_lhMk('span', 'rm-g-letter', g.letter), sw, _lhMk('span', '', g.label + ' ×' + g.count + (g.count === 1 ? '（孤句）' : '')));
            groups.append(row);
        }
        kids.push(groups);
        const list = _lhMk('div', 'section-menu-block');
        list.append(_lhMk('span', 'section-menu-cap', '逐句'));
        rows.forEach((r, n) => {
            const ch = r.t ? r.t.char : (Array.from(r.line.replace(/[^\p{L}\p{N}]+$/u, '')).pop() || '');
            const b = _lhMkBtn('rm-row', '', r.t ? '查韻：' + ch + '，第 ' + (n + 1) + ' 句' : '第 ' + (n + 1) + ' 句，沒有可查的句尾');
            const lineCs = Array.from(r.line.trim());
            b.append(_lhMk('span', 'rm-g-letter', r.letter || '-'), _lhMk('span', 'rm-tail', ch),
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
    if (!_lhMapStatsOn || secId !== _lhMapStatsSec) return;
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
// 螢幕鍵盤、縮放：統計重新夾進可見範圍
window.addEventListener('resize', () => _lhMapStatsRefresh(_lhMapStatsSec));
if (window.visualViewport) window.visualViewport.addEventListener('resize', () => _lhMapStatsRefresh(_lhMapStatsSec));

// ==================== 選字浮動列（MAP-05、CONTEXT D1／D3、UI-SPEC D-15／D-16／D-17） ====================
// 在歌詞裡反白 1–20 個字（至少一個中文字），選取下方出現「🔍 查韻：{字}」「✨ AI 建議」；
// 只有反白＋按按鈕才查，單純點一下游標不會動搜尋。字取選取範圍最後一個中文字（韻腳在句尾）。
// 時機：滑鼠放開（mouseup）下一個 frame 就判斷；鍵盤與觸控在最後一次 select／selectionchange／keyup 之後 400ms 才判斷，拖選取把手時不會閃。
const LH_MAP_SEL_MAX = 20;       // 超過這麼多字（以字元計）的選取不是查詢意圖（全選、整段）
const LH_MAP_BAR_MS = 400;
const LH_MAP_HAN = /\p{Script=Han}/u;
let _lhMapBar = null;
let _lhMapBarSnap = null;        // 顯示當下的快照 { ta, secId, a, b, end, char }：按下按鈕時用它，不重讀選取（Pitfall 8）
let _lhMapBarTimer = 0;
let _lhMapBarSkip = '';          // 按過按鈕或 Esc 收掉的那個選取（段落:起:迄）：同一個選取不再自動跳出來，重新放開滑鼠或改選取才解除
let _lhMapBarGrace = 0;          // 這個時間點之前的捲動不算使用者捲動（鍵盤開關時瀏覽器自己會捲）

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
    const rd = _lhMkBtn('section-menu-btn rm-bar-rd', '指定讀音');   // 只有句尾的破音字才顯示（lhMapShowBar）
    rd.hidden = true;
    rd.setAttribute('aria-expanded', 'false');
    const row = _lhMk('div', 'rm-bar-reading');   // 讀音那一列：標籤＋晶片，按「指定讀音」才展開
    row.id = 'rhymeReadingRow';
    row.hidden = true;
    rd.setAttribute('aria-controls', row.id);
    bar.append(look, ai, rd, row);
    // 按鈕不能搶走輸入框的焦點與選取（手機鍵盤也才不會收起來）
    for (const t of ['pointerdown', 'mousedown']) bar.addEventListener(t, e => e.preventDefault());
    look.addEventListener('click', e => lhMapLookup(_lhMapBarSnap && _lhMapBarSnap.char, false, e.detail === 0));
    ai.addEventListener('click', e => lhMapLookup(_lhMapBarSnap && _lhMapBarSnap.char, true, e.detail === 0));
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
    if (keepTimer !== true) { clearTimeout(_lhMapBarTimer); _lhMapBarTimer = 0; }
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
    if (ta.value.length <= LH_WD_BIG) {
        const m = lhMirror(ta);
        let pos;
        try { pos = lhCaretRect(ta, m, s.end); } finally { m.remove(); }
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
    bar.querySelector('.rm-bar-rd').hidden = !snap.rd;
    _lhMapBarSnap = snap;
    snap.ta.setAttribute('aria-keyshortcuts', 'Alt+ArrowDown');
    bar.querySelector('.rm-bar-t').textContent = ' 查韻：' + snap.char;
    _lhMapBarPlace();
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
    const t = lhRhymeTarget(v.slice(ls, le), _lhMapSet.skipParticles);
    return t && t.char === char && t.i === Array.from(v.slice(ls, pos)).length ? { tail: t.tail, char } : null;
}

// 判斷這個輸入框現在的選取該不該出現浮動列
function _lhMapSelCheck(ta) {
    _lhMapBarTimer = 0;
    try {
        const a = ta.selectionStart, b = ta.selectionEnd;
        const rpt = document.getElementById('aiWordsContainer');
        const busy = _lhComposing || _lhDrag || _lhResize || _lhWd || _lhMenuId !== null || _lhMapMenuOn || (rpt && rpt.classList.contains('report-mode'));
        if (busy || a === b || ta.getClientRects().length === 0 || _lhMapSelSig(ta) === _lhMapBarSkip) return lhMapHideBar();
        const text = ta.value.slice(a, b);
        const chars = Array.from(text);
        if (chars.length > LH_MAP_SEL_MAX) return lhMapHideBar();
        const han = chars.filter(c => LH_MAP_HAN.test(c));
        if (!han.length) return lhMapHideBar();
        const end = b - (text.length - text.trimEnd().length);   // 三連點選會多選到換行：浮動列放在最後一個字那一行
        lhMapShowBar({ ta, secId: ta.closest('.lyrics-section').dataset.id, a, b, end, char: han[han.length - 1], rd: _lhMapReadingTarget(ta, a, text, han[han.length - 1]) });
    } catch (e) {
        lhWarn('韻腳地圖選字列失敗', e);
        lhMapHideBar();
    }
}

// 選取一變就先收掉（字可能換了）、400ms 後再判斷；選取收合馬上收掉
function _lhMapBarOnChange(e) {
    const ta = e.target;
    if (!ta.classList || !ta.classList.contains('section-textarea')) return;
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
        requestAnimationFrame(() => _lhMapSelCheck(ta));
    });
    area.addEventListener('compositionstart', () => lhMapHideBar());
    // 捲動只收已經出現的列，不取消等著判斷的計時（聚焦時瀏覽器常會順手捲一下）
    area.addEventListener('scroll', () => { if (_lhMapBarSnap && performance.now() > _lhMapBarGrace) lhMapHideBar(true); }, true);
    // Alt+↓：焦點到浮動列（D-16）
    area.addEventListener('keydown', e => {
        if (!_lhMapBarSnap || e.target !== _lhMapBarSnap.ta || !e.altKey || e.key !== 'ArrowDown' || e.isComposing || e.keyCode === 229) return;
        e.preventDefault();
        _lhMapBar.querySelector('button').focus({ preventScroll: true });
    });
}
// 點浮動列以外的地方收掉
document.addEventListener('pointerdown', e => {
    if (_lhMapBarSnap && !(e.target.closest && e.target.closest('#rhymeSelBar'))) lhMapHideBar();
}, true);
// Esc：收掉、焦點回輸入框、選取不動（capture：≤ 900 的 sheet 才不會同時被收起）
document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !_lhMapBarSnap || e.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    e.stopPropagation();
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
