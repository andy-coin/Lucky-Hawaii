// 本地伺服器＝本機或區網私有 IP（手機測試.command 讓同一個 Wi‑Fi 的 iPhone／iPad 連進來，也算本地：有齒輪、輔助線、開發者功能）
const LH_LOCAL_HOST = (() => { try { return /^(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(location.hostname); } catch (e) { lhWarn('讀不到網址主機名稱', e); return false; } })();
const LH_BUILD = '西瓜汁';   // 本地測試代號：每輪改完換一個，Andy 看標題後面的小字就知道是不是最新版（只有本地顯示）
if (LH_LOCAL_HOST && !navigator.webdriver) { const f = () => { const b = document.getElementById('h1Build'); if (b) { b.textContent = LH_BUILD; b.hidden = false; } }; if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', f); else f(); }   // 自動測試（webdriver）不顯示，截圖基準才不會每輪都變
// iOS／iPadOS Safari 的畫布不支援 ctx.filter（blur(…) 直接被忽略＝柔邊、光暈、對焦模糊全變銳利）。
// 偵測到不支援時接手：filter 字串記下來，drawImage 遇到 blur(Npx) 就先用「縮小再放大」做出模糊版再畫（url(#svg) 等其他濾鏡照樣略過）
// ponytail: 縮放模糊是近似高斯，邊緣比原生硬一點；要更像再換成多次 box blur
(() => {
    try { const c = document.createElement('canvas'); c.width = c.height = 9; const g = c.getContext('2d'); g.filter = 'blur(2px)'; g.fillStyle = '#fff'; g.fillRect(4, 4, 1, 1); if (g.getImageData(1, 4, 1, 1).data[3] > 0) return; } catch (e) { lhWarn('畫布模糊偵測失敗', e); return; }
    const P = CanvasRenderingContext2D.prototype, F = new WeakMap(), draw = P.drawImage, T = [0, 1, 2].map(() => document.createElement('canvas'));
    Object.defineProperty(P, 'filter', { configurable: true, get() { return F.get(this) || 'none'; }, set(v) { F.set(this, String(v)); } });
    const blur = (img, r) => {
        const w = img.width, h = img.height;
        let k = 1 + r * 0.9, cw = w, ch = h, src = img, i = 0;
        while (k > 1.01) {   // 每次最多縮一半（一次縮太多會閃顆粒），縮到總倍率 1/k
            const f = Math.max(0.5, 1 / k); k *= f;
            const nw = Math.max(1, Math.round(cw * f)), nh = Math.max(1, Math.round(ch * f)), t = T[i++ % 2], g = t.getContext('2d');
            t.width = nw; t.height = nh; g.imageSmoothingQuality = 'high';
            draw.call(g, src, 0, 0, cw, ch, 0, 0, nw, nh); src = t; cw = nw; ch = nh;
        }
        const o = T[2], g = o.getContext('2d');
        o.width = w; o.height = h; g.imageSmoothingQuality = 'high';
        draw.call(g, src, 0, 0, cw, ch, 0, 0, w, h);
        return o;
    };
    P.drawImage = function (img, ...a) {
        const m = /blur\(([\d.]+)px\)/.exec(F.get(this) || ''), r = m ? +m[1] : 0;
        return draw.call(this, r >= 0.3 && img && img.width > 1 && img.height > 1 ? blur(img, r) : img, ...a);
    };
})();
// ==================== 詞卡（多字直接查雙押）與詞宇宙 ====================
// 搜尋欄打「安打」（2–6 個字、中間沒有空白）＝查整個詞的韻：列出詞庫裡符合的詞（詞卡）。選項列換成同母音／同子音／同讀音＋同聲調、排除借韻。
// 打「安 打」（有空白）照舊是兩個字各自的單字韻（js/search.js）。displayResults（js/results.js）一開始就問 lhWsRender，
// 所以換主題、勾選項等所有重畫的路徑都會走到這裡。
// 「顯示全部」：三塊面板往左、上、右收走，所有詞攤在整個畫面上（介面上不說「宇宙」，視覺上是星雲）：
// 同一種聲調組合聚成一團，最常用的詞在中心（恆星），其他詞依常用度一圈圈繞著它轉（行星）；很孤立的詞像流星一樣長距離穿過。
// 停在詞上＝定格＋光暈＋右上角淡淡的隱藏鈕；單擊＝釘住＋保留（連成星座），再點＝取消；面板「取消選取」全部取消；
// 拖曳照等級（LH_SP_LV）：第 1、2 級拖到哪停在哪、拖恆星整團一起走；第 3 級起甩出去再被拉回、拖恆星沖散整團；空白處拖＝平移；滾輪／雙指＝縮放。
// 詞都是使用者詞庫或覆寫來的字串：一律 textContent，不拼 HTML。

const LH_WS_MIN = 2, LH_WS_MAX = 6;
const LH_WS_PAGE = 240;            // 詞卡一次多畫幾張（捲到底再補）
const LH_WS_SPACE_MAX = 630;       // 超過這個數才分批（分批見 _lhSpPages：一批約 600±30，星系一律不拆）
// 顏色跟著第一個字的聲調走（一～四聲＋輕聲五個色系，跟著主題、不寫死色碼）；同一團裡每個詞再依常用度＋一點隨機混出深淺
const _lhMix = (a, b, k = 50) => 'color-mix(in oklab, var(' + a + ') ' + k + '%, var(' + b + '))';
// 支援相對色（oklch from）就從主題強調色出發、色相每個聲調轉 72°，五色差最大；不支援就用主題的四個強調色＋一個混色
const LH_WS_TONE_C = CSS.supports('color', 'oklch(from red l c calc(h + 72))')
    ? [0, 1, 2, 3, 4].map(k => 'oklch(from var(--highlight-border) l max(c, 0.12) calc(h + ' + k * 72 + '))')
    : ['var(--highlight-border)', 'var(--accent-2)', 'var(--accent-3)', 'var(--accent-4)', _lhMix('--danger-line', '--accent-4', 60)];
// 一團的顏色：第一個字聲調的顏色和第二個字聲調的顏色互相混（一·一＝純色，一·三＝一聲色混三聲色）
const _lhWsToneMix = key => {
    const [a, b] = key.split('·').map(n => Math.min(5, Math.max(1, +n || 1)));
    return !b || a === b ? LH_WS_TONE_C[a - 1] : 'color-mix(in oklch, ' + LH_WS_TONE_C[a - 1] + ' 62%, ' + LH_WS_TONE_C[b - 1] + ')';
};
const LH_WS_TONE_N = ['一聲', '二聲', '三聲', '四聲', '輕聲'];
const _lhWs = { key: '', input: '', target: null, list: [], shown: 0, mode: 'rhyme', tone: false, strict: false, hidden: new Set(), io: null };

// 輸入是不是「查整個詞」：去頭尾空白後沒有空白、2–6 個字、全是漢字或 *（* 是萬用字）、至少一個漢字。是就回傳字的陣列
function lhWsQuery(input) {
    const t = String(input || '').trim();
    if (!t || /\s/.test(t)) return null;
    const cs = [...t];
    if (cs.length < LH_WS_MIN || cs.length > LH_WS_MAX) return null;
    if (!cs.every(c => /[一-鿿]/.test(c) || c === '*') || cs.every(c => c === '*')) return null;
    return cs;
}

// 每個字的目標讀音：整個詞在詞庫裡就用詞庫的讀音（破音字才準），否則逐字取主要讀音。* 回 null；查不到的字回 { miss: true }
function _lhWsTarget(cs) {
    const z = cs.includes('*') ? null : ((typeof lhCwReading === 'function' && lhCwReading(cs.join(''))) || wordPhoneticMap.get(cs.join('')));
    const syl = z && z.split(' ').length === cs.length ? z.split(' ') : null;
    return cs.map((c, i) => {
        if (c === '*') return null;
        if (syl) { const zy = stripTone(syl[i]); return { zy, rhyme: getZhuyinRhyme(zy), tone: getZhuyinTone(syl[i]) }; }
        const list = chineseDict[c];
        if (!list || !list.length) return { miss: true };
        let zy = list[0];
        const pri = polyphonicsOrderMap && polyphonicsOrderMap.get(c);
        if (pri && pri[0]) { const b = pri[0].replace(/[ˊˇˋ˙]$/, ''); if (list.includes(b)) zy = b; }
        const info = (charInfo[c] || []).find(x => x.zhuyin === zy);
        return { zy, rhyme: getZhuyinRhyme(zy), tone: info && info.tone ? info.tone : 1 };
    });
}

// 純函式：詞庫裡符合的詞，常用的在前（排序固定，不給改）。
// mode：rhyme＝每個字都押韻（同母音）；initial＝每個字聲母相同（同子音）；
//       same＝至少一個字讀音完全相同（不管聲調），其他字押韻或同聲母都算（同讀音）。
// tone＝每個字也要同聲調；strict＝排除借韻（押韻時韻母要完全相同）。* 的位置不比對
function lhWsMatch(entries, target, word, { mode = 'rhyme', tone, strict, hidden } = {}) {
    const n = target.length, out = [];
    const rhymeOk = (zy, t) => lhRhymeMatch(getZhuyinRhyme(zy), t.rhyme, strict);
    const initOk = (zy, t) => _effInitial(zy) === _effInitial(t.zy);
    for (const e of entries) {
        if (e.w.length !== n || e.w === word || (hidden && hidden.has(e.w))) continue;
        const syl = e.z.split(' ');
        if (syl.length !== n) continue;
        let ok = true, same = false;
        for (let i = 0; i < n && ok; i++) {
            const t = target[i];
            if (!t) continue;
            const zy = stripTone(syl[i]);
            if (tone && getZhuyinTone(syl[i]) !== t.tone) ok = false;
            else if (mode === 'initial') ok = initOk(zy, t);
            else if (mode === 'same') { if (zy === t.zy) same = true; else ok = rhymeOk(zy, t) || initOk(zy, t); }
            else ok = rhymeOk(zy, t);
        }
        if (ok && (mode !== 'same' || same)) out.push(e);
    }
    return out.sort((a, b) => (b.p || 0) - (a.p || 0));
}

// 選項列上的詞卡按鈕（index.html .q-word）：比對方式三選一、篩選可多選，按了就重畫
document.addEventListener('click', e => {
    const b = e.target.closest('[data-ws], [data-ws-f]');
    if (!b) return;
    if (b.dataset.ws) _lhWs.mode = b.dataset.ws;
    else _lhWs[b.dataset.wsF] = !_lhWs[b.dataset.wsF];
    _lhWsSyncOpts();
    if (_lhWs.input) lhWsRender(_lhWs.input);
});
function _lhWsSyncOpts() {
    document.querySelectorAll('[data-ws]').forEach(b => b.classList.toggle('active', b.dataset.ws === _lhWs.mode));
    document.querySelectorAll('[data-ws-f]').forEach(b => b.setAttribute('aria-pressed', String(!!_lhWs[b.dataset.wsF])));
}

function _lhWsEl(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
}

function _lhWsPhon(e) {
    const syl = e.z.split(' ');
    return lastSearchType === 'pinyin' ? syl.map(s => zhuyinToPinyin(stripTone(s)) + (['', '', 'ˊ', 'ˇ', 'ˋ', '˙'][getZhuyinTone(s)] || '')).join(' ') : syl.join(' ');
}

// 詞卡的注音／拼音：押到的部分像字卡一樣上色（第 i 個字用第 i 種標記色）。
// 同母音＝標韻母；同子音＝標聲母；同讀音＝讀音一樣的字整個標，其他字標押到的那一半。勾掉「標記搜尋」就不上色
function _lhWsPhonEl(e) {
    const box = _lhWsEl('div', 'char-pinyin'), hl = document.getElementById('highlightSearch');
    const on = !hl || hl.checked, pin = lastSearchType === 'pinyin';
    e.z.split(' ').forEach((syl, i) => {
        if (i) box.append('  ');
        const zy = stripTone(syl), t = _lhWs.target && _lhWs.target[i];
        let init = getZhuyinInitial(zy) || '', rest = zy.slice(init.length);
        if (pin) {
            const py = zhuyinToPinyin(zy), pi = pinyinInitials.find(x => py.startsWith(x) && py.length > x.length) || '';
            init = pi; rest = py.slice(pi.length);
        }
        let part = '';
        if (on && t && !t.miss) {
            if (_lhWs.mode === 'same' && zy === t.zy) part = 'all';
            else if (_lhWs.mode === 'initial') part = 'init';
            else if (lhRhymeMatch(getZhuyinRhyme(zy), t.rhyme, _lhWs.strict)) part = 'rhyme';
            else part = 'init';
            if (part === 'init' && !init) part = 'all';     // 沒有聲母的字（ㄢ、ㄧ…）：整個標
            if (part === 'rhyme' && !rest) part = 'all';    // 只有聲母的字（ㄓ、ㄙ…）
        }
        const mk = s => _lhWsEl('span', 'search-highlight-' + ((i % 5) + 1), s);
        if (part === 'all') box.append(mk(init + rest));
        else if (part === 'init') box.append(mk(init), rest);
        else if (part === 'rhyme') box.append(init, mk(rest));
        else box.append(init + rest);
        const tm = ['', '', 'ˊ', 'ˇ', 'ˋ', '˙'][getZhuyinTone(syl)] || '';
        if (tm) box.append(_lhWsEl('span', 'tone-mark', tm));
    });
    return box;
}

// displayResults 一開始呼叫：是「查整個詞」就畫詞卡並回 true（呼叫端就不畫字卡）
function lhWsRender(input) {
    const cs = lhWsQuery(input);
    if (!cs) { _lhWs.key = ''; return false; }
    const container = document.getElementById('resultsContainer');
    if (_lhWs.io) { _lhWs.io.disconnect(); _lhWs.io = null; }
    container.onclick = null;
    container.dataset.render = 'done';
    container.removeAttribute('aria-busy');
    const word = cs.join('');
    _lhWs.input = word;
    const target = _lhWsTarget(cs);
    if (target.some(t => t && t.miss)) {
        container.replaceChildren(_lhWsEmpty('有字不在字庫裡，查不到整個詞的韻', '試試換個字，或在字中間加空白分開查單字韻'));
        return true;
    }
    _lhWs.target = target;
    if (!wordlistData) {
        container.replaceChildren(_lhWsEmpty('詞庫載入中…', '載好就會列出押「' + word + '」的詞'));
        loadWordlist().then(() => { if (wordlistData && lhWsQuery(document.getElementById('searchInput').value) && _lhWs.input === word) lhWsRender(word); });
        return true;
    }
    _lhWs.list = lhWsMatch(typeof lhCwMerge === 'function' ? lhCwMerge(wordlistData) : wordlistData, target, word, _lhWs);   // 自訂詞彙一起比（js/custom-words.js）
    _lhSpPreFont(_lhWs.list.map(e => e.w));   // 查完就趁空檔先把宇宙要用的字下載好（Andy：打開時不要先閃系統字）
    _lhWsDraw(container, word);
    return true;
}

function _lhWsEmpty(title, sub) {
    const box = _lhWsEl('div', 'empty-state');
    box.append(_lhWsEl('h3', '', title), _lhWsEl('p', '', sub));
    return box;
}

function _lhWsDraw(container, word) {
    const head = _lhWsEl('div', 'ws-header');
    const how = { rhyme: '押「' + word + '」的詞', initial: '跟「' + word + '」同子音的詞', same: '跟「' + word + '」有字同讀音的詞' }[_lhWs.mode];
    const count = _lhWsEl('div', 'results-count', how + '：' + _lhWs.list.length.toLocaleString('zh-TW') + ' 個');
    const go = document.getElementById('wsAllBtn');   // 「顯示全部」在結果區上方（index.html，跟「關聯詞彙」同位置）
    if (go) go.disabled = !_lhWs.list.length;
    // 回報：跟 AI 詞卡一樣先進「挑選」模式（點詞卡＝勾選，不是保留），再送出；放在選項列最右邊（跟字卡的「回報」同一個位置）
    const rep = document.getElementById('wsRepSlot');
    const repBtn = _lhWsEl('button', 'batch-btn btn-report');
    repBtn.type = 'button';
    repBtn.title = '回報有問題的詞';
    const repCancel = _lhWsEl('button', 'batch-btn', '取消');
    repCancel.type = 'button';
    repCancel.hidden = true;
    const repSync = () => {
        const on = container.classList.contains('report-mode'), n = container.querySelectorAll('.ws-card.report-picked').length;
        repBtn.innerHTML = '<span class="batch-icon"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg></span><span></span>';
        repBtn.lastChild.textContent = on ? '送出回報（' + n + '）' : '回報';
        repCancel.hidden = !on;
    };
    const repExit = () => { container.classList.remove('report-mode'); container.querySelectorAll('.report-picked').forEach(c => c.classList.remove('report-picked')); repSync(); };
    repBtn.addEventListener('click', () => {
        if (!container.classList.contains('report-mode')) { container.classList.add('report-mode'); repSync(); showToast('點要回報的詞卡（可以多選），再按「送出回報」'); return; }
        const words = [...container.querySelectorAll('.ws-card.report-picked')].map(c => c.dataset.char);
        if (!words.length) { showToast('先點要回報的詞卡'); return; }
        openReportDialog(words.map(word => ({ kind: 'word', word })), { onSent: repExit });
    });
    repCancel.addEventListener('click', repExit);
    if (rep) rep.replaceChildren(repBtn, repCancel);
    container.classList.remove('report-mode');
    repSync();
    _lhWs.repSync = repSync;
    head.append(count);
    if (!_lhWs.list.length) {
        container.replaceChildren(head, _lhWsEmpty('沒有符合的詞', _lhWs.tone || _lhWs.strict ? '把「同聲調」「排除借韻」取消試試' : '試試換個比對方式、少一個字，或用 * 代替不必押的字（例：*打）'));
        return;
    }
    const grid = _lhWsEl('div', 'results-grid ws-grid');
    container.replaceChildren(head, grid);
    _lhWs.shown = 0;
    _lhWsMore(grid);
    // 點詞卡＝保留（和 AI 建議的詞卡一樣）；按住拖到歌詞（js/word-drag.js 認 .char-card 的 data-char）
    container.onclick = e => {
        const card = e.target.closest('.ws-card');
        if (!card) return;
        if (container.classList.contains('report-mode')) { card.classList.toggle('report-picked'); _lhWs.repSync(); return; }
        // 0.98.09：再點一下取消保留（toggle）；外框由 lhWsSyncKept 照保留池畫
        if (savedWords.includes(card.dataset.char)) removeSavedWord(card.dataset.char); else saveWord(card.dataset.char);
    };
}
// 詞卡的選取外框＝這個詞有沒有在保留池（換關鍵詞再換回來也記得）；保留池每次變動都會呼叫（js/panels.js renderSavedWords）
function lhWsSyncKept() {
    for (const c of document.querySelectorAll('.ws-card')) c.classList.toggle('kept', savedWords.includes(c.dataset.char));
}

// 再畫一頁；最後一張還沒畫完就放一個哨兵，捲到它就再補
function _lhWsMore(grid) {
    const end = Math.min(_lhWs.list.length, _lhWs.shown + LH_WS_PAGE);
    const frag = document.createDocumentFragment();
    for (let i = _lhWs.shown; i < end; i++) {
        const e = _lhWs.list[i];
        const card = _lhWsEl('div', 'char-card ws-card' + (e.custom ? ' ws-custom' : '') + (savedWords.includes(e.w) ? ' kept' : ''));
        card.dataset.char = e.w;
        card.title = '點一下保留（再點一下取消）；按住拖到歌詞';
        card.append(_lhWsEl('div', 'char-main', [...e.w].join(' ')),   // 字跟字之間一個半形空格，對齊比較寬的注音
             _lhWsPhonEl(e));
        frag.append(card);
    }
    _lhWs.shown = end;
    grid.append(frag);
    if (_lhWs.io) { _lhWs.io.disconnect(); _lhWs.io = null; }
    if (end >= _lhWs.list.length) return;
    const sentinel = grid.lastElementChild;
    _lhWs.io = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) _lhWsMore(grid); });
    _lhWs.io.observe(sentinel);
}

// ==================== 顯示全部（星雲） ====================
// 0.98.41 Andy：時間放慢——碰到黑洞（滑鼠停在上面、按住拖它、拖詞到它上方）整個宇宙照 1/bh.slow 倍速走。
// 宇宙裡的時間都走這個時鐘（_lhSpNow），不直接用 performance.now()；k 由 _lhSpFrame 每格平滑調整
const _lhSpClk = { r: 0, v: 0, k: 1 };
function _lhSpNow(r = performance.now()) {
    if (!_lhSpClk.r) _lhSpClk.r = _lhSpClk.v = r;
    else if (r > _lhSpClk.r) { _lhSpClk.v += (r - _lhSpClk.r) * _lhSpClk.k; _lhSpClk.r = r; }
    return _lhSpClk.v;
}
const _lhSp = { el: null, world: null, words: [], groups: [], raf: 0, last: 0, t0: 0, z: 1, px: 0, py: 0, pts: new Map(), pan: null, pinch: null, drag: null, nav: null, back: null, bound: 1000, pins: [], chords: [], line: null, tm: 0 };
const LH_SP_ZMIN = 0.1, LH_SP_ZMAX = 3, LH_SP_FIT_MIN = 0.2;   // 實際倍率（1＝世界 1px 對螢幕 1px）；沒有詞時的後備
// 0.98.22.11 Andy：縮放上下限照字的大小——縮到最小＝最大的恆星字高 14px；放到最大＝最小的字字高 28px（14×2）
const LH_SP_TXT_MIN = 14, LH_SP_TXT_MAX = 21;   // 0.98.22.11 Andy：最大改 14×1.5
function _lhSpZLim() {
    const ss = (_lhSp.words || []).map(w => w.s).filter(Number.isFinite);
    if (!ss.length) return [LH_SP_ZMIN, LH_SP_ZMAX];
    const lo = LH_SP_TXT_MIN / (16 * Math.max(...ss)), hi = LH_SP_TXT_MAX / (16 * Math.min(...ss));
    return [lo, Math.max(lo, hi)];
}
// 0.98.13 Andy：畫面上的「100%」＝這次打開時自動抓的縮放（_lhSp.z100，見 _lhSpFitZoom），按 100% 就回到一打開那個舒服的畫面
const _lhSpZ100 = () => _lhSp.z100 || 1;
// Andy：拖畫布光帶最長照縮放——100%＝1 倍，縮到最小＝1/8，放到最大＝2 倍（中間照縮放倍率的對數平滑過渡）
function _lhSpDistK() {
    const r = _lhSp.z / _lhSpZ100(), [lo, hi] = _lhSp.zLim || [LH_SP_ZMIN, LH_SP_ZMAX], rl = lo / _lhSpZ100(), rh = hi / _lhSpZ100();
    if (r < 1) return rl < 1 ? Math.pow(1 / 8, Math.min(1, Math.log(r) / Math.log(rl))) : 1;
    return rh > 1 ? Math.pow(2, Math.min(1, Math.log(r) / Math.log(rh))) : 1;
}
const LH_SP_RING = 64;   // 軌道之間的距離（世界座標 px）；0.98.09 從 46 拉大，大星系加上隨機偏移也不會疊在一起
const _lhSpReduce = matchMedia('(prefers-reduced-motion: reduce)');
const LH_SP_EYE_OFF = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M4 20L20 4"/></svg>';
const LH_SP_X = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

function _lhSpBuild() {
    if (_lhSp.el) return _lhSp.el;
    const el = _lhWsEl('div', 'ws-space');
    el.id = 'wordSpace';
    el.hidden = true;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', '全部押韻詞');
    // 一張 canvas 畫全部的詞（js 最後的 _lhSpDraw）；📌 ✕ 是真的按鈕，只浮在停住／釘住的那個詞旁邊
    const cv = _lhWsEl('canvas', 'ws-canvas');
    cv.setAttribute('aria-hidden', 'true');
    const acts = _lhWsEl('div', 'ws-acts');
    acts.hidden = true;
    const hide = _lhWsEl('button', 'ws-hide');   // 只剩右上角的「隱藏」（點詞本身＝保留）
    hide.type = 'button';
    hide.innerHTML = LH_SP_EYE_OFF;
    acts.append(hide);
    const probe = _lhWsEl('span', 'ws-probe');   // 把 var()／color-mix() 換成 canvas 看得懂的顏色
    probe.hidden = true;
    const mk = (cls, txt, label, fn) => { const b = _lhWsEl('button', 'ws-hud-btn ' + cls, txt); b.type = 'button'; b.setAttribute('aria-label', label); b.title = label; b.addEventListener('click', fn); return b; };
    // 左上：標題、各團按鈕（點了導覽過去）、取消選取、常用度篩選
    const panel = _lhWsEl('div', 'ws-panel');
    const title = _lhWsEl('div', 'ws-title');
    const legend = _lhWsEl('div', 'ws-legend');
    const tools = _lhWsEl('div', 'ws-tools');
    const fl = _lhWsEl('label', 'ws-filter');
    const fcap = _lhWsEl('span', 'ws-filter-cap', '常用度：不限');
    const range = _lhWsEl('input', 'ws-range');
    range.type = 'range'; range.min = '0'; range.max = '95'; range.step = '5'; range.value = '0';
    range.setAttribute('aria-label', '只顯示比較常用的詞');
    range.addEventListener('input', () => _lhSpFilter(+range.value));
    fl.append(fcap, range);
    // 取消選取：跟保留池「清除全部」一樣，先變紅色「確定取消 N 個？」，4 秒內再按一次才取消（也一起取消保留）
    const clr = _lhWsEl('button', 'ws-hud-btn saved-clear-btn ws-clear', '取消選取');
    clr.type = 'button';
    clr.hidden = true;
    clr.addEventListener('click', _lhSpClearAsk);
    tools.append(clr, fl);
    const posBox = _lhWsEl('div', 'ws-pos');
    posBox.setAttribute('role', 'group');
    posBox.setAttribute('aria-label', '字在詞裡的位置');
    for (const [k, label] of [['head', '字首'], ['tail', '字尾']]) {
        const b = _lhWsEl('button', 'ws-hud-btn', label);
        b.type = 'button';
        b.dataset.pos = k;
        b.addEventListener('click', () => { _lhRel.pos = _lhRel.pos === k ? '' : k; _lhRelFind(); });
        posBox.append(b);
    }
    // 字數（可多選，都不選＝不限）：兩字、三字、四字、五字以上（0.98.14 加四字）
    const lenBox = _lhWsEl('div', 'ws-pos ws-len');
    lenBox.setAttribute('role', 'group');
    lenBox.setAttribute('aria-label', '詞的字數');
    for (const [k, label] of [['2', '兩字'], ['3', '三字'], ['4', '四字'], ['m', '多字']]) {
        const b = _lhWsEl('button', 'ws-hud-btn', label);
        b.type = 'button';
        b.dataset.len = k;
        b.addEventListener('click', () => { const s = _lhRel.len; s.has(k) ? s.delete(k) : s.add(k); _lhRelFind(); });
        lenBox.append(b);
    }
    // 分批（0.98.09）：數字滑桿，一格一批；目前這批在軌道上用重點色標出來
    const pages = _lhWsEl('div', 'ws-pages');
    pages.hidden = true;
    const pr = _lhWsEl('input', 'ws-page-range');
    pr.type = 'range'; pr.min = '0'; pr.step = '1';
    pr.setAttribute('aria-label', '第幾批詞');
    const prMark = () => { const n = +pr.max + 1, v = +pr.value; pr.style.setProperty('--a', (v / n * 100) + '%'); pr.style.setProperty('--b', ((v + 1) / n * 100) + '%'); };
    pr.addEventListener('input', prMark);
    pr.addEventListener('change', () => { if (_lhSp.cfg && +pr.value !== (_lhSp.cfg.page || 0)) _lhSpWhip(+pr.value); });
    // 0.98.22.11 Andy：多重宇宙滑桿左邊「骰子」、右邊「AI」兩顆正方形鈕；底下一列星座導覽（◀ 加入保留 再換一批 ▶）
    pages.append(pr, _lhWsEl('div', 'ws-page-ticks'));
    const dice = mk('ws-cbtn ws-dice', '', '骰子：從畫面上的詞隨機抽一組星座', () => _lhSpConPress('dice'));
    dice.innerHTML = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="3.5"/><circle cx="8.5" cy="8.5" r="1.4"/><circle cx="15.5" cy="8.5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="8.5" cy="15.5" r="1.4"/><circle cx="15.5" cy="15.5" r="1.4"/></svg>';
    const aiB = mk('ws-cbtn ws-aib', 'AI', 'AI 建議：照標籤、情境、歌詞從畫面上的詞挑一組星座', () => _lhSpConPress('ai'));
    const cnav = _lhWsEl('div', 'ws-cnav');
    cnav.hidden = true;
    // Andy：保留＝旗子、更新＝雙方形循環箭頭、取消＝垃圾桶（丟掉這組星座；已保留的詞不動），三顆圖示擠在原本兩顆的位置（.ws-cn-mid）
    const icB = (cls, title, fn, path) => { const b = mk(cls, '', title, fn); b.innerHTML = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">' + path + '</svg>'; return b; };
    const cmid = _lhWsEl('div', 'ws-cn-mid');
    cmid.append(icB('ws-cn-keep', '保留：把這組星座的詞都加入保留', _lhSpConKeep, '<path d="M9 3h6"/><path d="M10 3v6l-3 4h10l-3-4V3"/><path d="M12 13v8"/>'),
        icB('ws-cn-again', '更新：重新抽一組', () => _lhSpConRoll(_lhSp.mode), '<path d="M4 11V9a2 2 0 0 1 2-2h13"/><path d="M16 4l3 3-3 3"/><path d="M20 13v2a2 2 0 0 1-2 2H5"/><path d="M8 20l-3-3 3-3"/>'),
        icB('ws-cn-del', '取消：丟掉這組星座', _lhSpConDrop, '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>'));
    cnav.append(mk('ws-cn-prev', '◀', '上一顆星', () => _lhSpConNav(-1)), cmid, mk('ws-cn-next', '▶', '下一顆星', () => _lhSpConNav(1)));
    // 0.98.22.11 Andy：都做成獨立按鈕，不把滑桿面板撐大——一個透明的格子排：[骰子][多重宇宙面板][AI]，導覽列在面板正下方
    const ptop = _lhWsEl('div', 'ws-ptop');
    ptop.append(dice, pages, aiB, cnav);
    pages._mark = prMark;
    // 收合／展開（0.98.11.1）：小螢幕上面板會擋住星雲，收起來只剩標題列
    const head = _lhWsEl('div', 'ws-head');
    const fold = mk('ws-fold', '', '收合面板', () => {
        const min = panel.classList.toggle('min');
        fold.setAttribute('aria-expanded', String(!min));
        fold.title = min ? '展開面板' : '收合面板'; fold.setAttribute('aria-label', fold.title);
    });
    fold.setAttribute('aria-expanded', 'true');
    fold.innerHTML = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>';
    // 0.98.20 Andy：色標（各星系按鈕）移到第二層面板，左面板旁邊的三角形展開／收起；選很多字時左面板才不會變超長
    const legPanel = _lhWsEl('div', 'ws-legpanel');
    legPanel.hidden = true;
    // 0.98.21 Andy：開關改成貼在左面板右邊緣的小分頁（比較看得到）；色標面板最下面也有一顆「收起」
    legPanel.append(legend);   // 0.98.22.1 Andy：不要「收起色標」鈕，開關只用分頁
    const legBtn = mk('ws-legbtn', '', '展開色標', () => { _lhSp.legOpen = !_lhSp.legOpen; _lhSpLegSync(); });
    legBtn.innerHTML = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l9 7-9 7z"/></svg>';
    fold.addEventListener('click', () => _lhSpLegSync());
    head.append(fold, title);   // 0.98.41 Andy：三角形移到標題左邊
    panel.append(head, posBox, lenBox, tools);
    // 0.98.20 Andy：多重宇宙時，畫面左右邊界中間的三角形換上一批／下一批（第一批沒有左、最後一批沒有右）
    const nav = d => { const b = mk('ws-nav ' + (d < 0 ? 'ws-prev' : 'ws-next'), '', d < 0 ? '上一批' : '下一批', () => {
        const p = (_lhSp.cfg.page || 0) + d;
        if (p >= 0 && p < _lhSpPages(_lhSp.cfg).length) _lhSpWhip(p); });
        b.innerHTML = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="' + (d < 0 ? 'M18 2L5 12l13 10z' : 'M6 2l13 10L6 22z') + '"/></svg>';
        b.hidden = true; return b; };
    // 右上：縮放與關閉；底下一列特效等級（0.98.20 Andy，跟偏好設定同一個值）
    const tr = _lhWsEl('div', 'ws-tr');
    const fx = _lhWsEl('label', 'ws-fx'), fxCap = _lhWsEl('span', 'ws-fx-cap'), fxR = _lhWsEl('input', 'ws-fx-range');
    fxR.type = 'range'; fxR.min = '1'; fxR.max = '5'; fxR.step = '1';
    fxR.setAttribute('aria-label', '特效等級');
    fxR.addEventListener('input', () => { if (typeof lhFxSetLevel === 'function') lhFxSetLevel(+fxR.value); _lhSpFxSync(); _lhSpFinishFx(); });
    fx.append(fxCap, fxR);
    const zoom = _lhWsEl('div', 'ws-zoom');
    // 以畫面中心縮放、星系位置不動（0.98.14.4 Andy）；0.98.20 Andy：在 100% 就切到 50%，其他倍率回 100%（兩檔循環）
    const pct = mk('ws-pct', '100%', '切換 100%／50%', () => { const z1 = _lhSpZ100(); _lhSpZoom(Math.round(_lhSp.z / z1 * 100) === 100 ? z1 / 2 : z1); });
    // 0.98.41 Andy：觸控裝置用兩指縮放，不放 − 100% ＋；叉叉旁邊放「?」（這個畫面自己的導覽）
    if (!LH_SP_COARSE) zoom.append(mk('', '−', '縮小', () => _lhSpZoom(_lhSp.z / 1.25)), pct, mk('', '＋', '放大', () => _lhSpZoom(_lhSp.z * 1.25)));
    const help = mk('ws-help', '?', '功能導覽', () => { if (typeof lhTourStart === 'function') lhTourStart('space'); });
    const close = mk('ws-close', '', '關閉（Esc）', () => lhWsClose());
    close.innerHTML = LH_SP_X;
    zoom.prepend(help); zoom.append(close);
    tr.append(zoom, fx);
    el.append(cv, acts, probe, panel, legBtn, legPanel, ptop, nav(-1), nav(1), tr);
    if (LH_SP_TUNE_UI) {   // 0.98.21 Andy 暫時的調參齒輪：縮放鈕左邊
        const tune = _lhSpTunePanel();
        const gear = mk('ws-gear', '⚙', '宇宙特效調參', () => { tune.hidden = !tune.hidden; gear.setAttribute('aria-expanded', String(!tune.hidden)); });
        gear.setAttribute('aria-expanded', 'false');
        zoom.prepend(gear);   // 0.98.41 Andy：齒輪、快轉是內部工具，放最左邊；「?」是使用者看得到的那排最左（手機＝緊貼 ✕ 左邊）
        // 0.98.41 Andy（本地測試用）：快轉——跳過混沌凝聚，黑洞直接長好（成形動畫的 bh.form 秒也跳過）
        const skip = mk('ws-skip', '', '快轉：跳過凝聚、黑洞直接長好（本地測試）', () => {
            _lhSpFinishFx();
            const now = _lhSpNow();
            for (const cl of _lhSp.groups || []) if (!cl.gDoneT) cl.gDoneT = now - 10000;
            _lhSp.bhSkip = true; _lhSp.dirty = true;
        });
        skip.innerHTML = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6l7 6-7 6z"/><path d="M12 6l7 6-7 6z"/><path d="M20 5v14"/></svg>';
        gear.after(skip);
        el.append(tune);
    }   // 換批滑桿獨立放在畫面正上方中間（0.98.09）
    {   // Andy：黑洞（所有人都有）——把詞拖進來＝放逐虛空（使用者：只從自己的詞庫淘汰＋匿名回報；本地開發者：改官方刪除名單）；點一下＝穿越到虛無，白洞可以把詞救回來
        const bh = mk('ws-bh', '', '黑洞', () => { if (!_lhSp.bhNoClick) _lhSpVoid(true); });
        bh.removeAttribute('title'); bh.appendChild(_lhWsEl('span', 'ws-bh-face', 'ˊ_>ˋ'));   // Andy：不給說明，讓使用者自己發現；hover 只冒一個表情
        // 拖、甩黑洞：按住移動超過 5px 才算拖（沒動＝點擊進虛無）；放手照最後一小段的速度甩出去
        bh.addEventListener('pointerdown', e => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            const B = _lhSp.bh; if (!B) return;
            try { bh.setPointerCapture(e.pointerId); } catch (err) { lhWarn('setPointerCapture 失敗', err); }
            const p0 = _lhSpToWorld(e.clientX, e.clientY);
            _lhSp.bhD = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: B.x - p0.x, oy: B.y - p0.y, moved: false, hist: [] };
            _lhSp.bhNoClick = false;
        });
        bh.addEventListener('pointermove', e => {
            const D = _lhSp.bhD, B = _lhSp.bh;
            if (!D || D.id !== e.pointerId) return;
            if (!D.moved && Math.hypot(e.clientX - D.sx, e.clientY - D.sy) < 5) return;
            D.moved = true; B.mode = 'drag'; B.bs = undefined;
            const p = _lhSpToWorld(e.clientX, e.clientY); B.x = p.x + D.ox; B.y = p.y + D.oy;
            D.hist.push({ t: e.timeStamp, x: B.x, y: B.y }); if (D.hist.length > 6) D.hist.shift();
        });
        const bhUp = e => {
            const D = _lhSp.bhD, B = _lhSp.bh;
            if (!D || D.id !== e.pointerId) return;
            _lhSp.bhD = null;
            if (!D.moved) return;
            _lhSp.bhNoClick = true; setTimeout(() => { _lhSp.bhNoClick = false; }, 0);   // 拖完放手不算點擊
            const h = D.hist, a = h[0], z = h[h.length - 1], dt = a && z && z.t > a.t ? (z.t - a.t) / 1000 : 0;
            const vm = 3000 / _lhSpZv();   // 宇宙座標／秒（畫面上最快 3000px／秒）
            B.vx = dt && e.timeStamp - z.t < 80 ? Math.max(-vm, Math.min(vm, (z.x - a.x) / dt)) : 0;
            B.vy = dt && e.timeStamp - z.t < 80 ? Math.max(-vm, Math.min(vm, (z.y - a.y) / dt)) : 0;
            B.mode = 'free'; B.rest = 0; B.brk = undefined;   // 煞車距離在 _lhSpBhDrift 第一格算
        };
        bh.addEventListener('pointerup', bhUp); bh.addEventListener('pointercancel', bhUp);
        bh.addEventListener('pointerenter', () => { _lhSp.bhHov = true; _lhSpBhMood(bh, true); }); bh.addEventListener('pointerleave', () => { _lhSp.bhHov = false; _lhSpBhMood(bh, false); });   // 0.98.41：停在黑洞上＝時間放慢
        bh.style.visibility = 'hidden';   // 等凝聚完成才開始成形（_lhSpBhDrift）
        const vd = _lhWsEl('div', 'ws-void');
        vd.hidden = true;
        const wh = _lhWsEl('button', 'ws-wh');
        wh.type = 'button'; wh.title = '白洞：把詞拖進來＝救回詞庫；點一下＝回到宇宙'; wh.setAttribute('aria-label', wh.title);
        wh.addEventListener('click', () => _lhSpVoid(false));
        vd.append(wh);
        el.append(bh, vd);
    }
    document.body.append(el);
    _lhSp.el = el;
    _lhSp.cv = cv;
    _lhSp.ctx = cv.getContext('2d');
    _lhSp.acts = acts;
    _lhSp.probe = probe;
    new ResizeObserver(() => _lhSpResize()).observe(el);
    const ro = new ResizeObserver(() => _lhSpNavPlace());   // 面板長高、收合、色標面板開關 → 色標面板和左三角形跟著挪
    for (const x of [el, panel, legPanel]) ro.observe(x);
    _lhSpEvents(el);
    return el;
}


// 標題（0.98.21 Andy：換行很亂）：固定兩行——第一行「「不好」」（跟收合鈕同一列，太長就 …），第二行小字「關聯詞 · 609 / 5415 個詞」
function _lhSpTitle(n) {
    const cfg = _lhSp.cfg, m = /^(「.*」)(.*)$/.exec(cfg.title) || [, cfg.title, ''];
    const main = _lhWsEl('span', 'ws-title-main', m[1]), sub = _lhWsEl('span', 'ws-title-sub', (m[2] ? m[2] + ' · ' : '') + n.toLocaleString('zh-TW') + (cfg.list.length > n ? ' / ' + cfg.list.length.toLocaleString('zh-TW') : '') + ' 個詞');
    main.title = cfg.title;
    _lhSp.el.querySelector('.ws-title').replaceChildren(main, sub);
}
// 色標面板：開關照 _lhSp.legOpen；左面板收合或沒有色標時一起藏
function _lhSpLegSync() {
    const el = _lhSp.el, lp = el.querySelector('.ws-legpanel'), b = el.querySelector('.ws-legbtn'), pn = el.querySelector('.ws-panel');
    const has = !!el.querySelector('.ws-legend').childElementCount;
    b.hidden = !has || pn.classList.contains('min');
    lp.hidden = b.hidden || !_lhSp.legOpen;
    b.setAttribute('aria-expanded', String(!lp.hidden));
    b.title = lp.hidden ? '展開色標' : '收起色標'; b.setAttribute('aria-label', b.title);
    _lhSpNavPlace();
}
// 色標面板貼在左面板右邊；左三角形若會被左邊的面板擋到，就往右挪到面板外面
function _lhSpNavPlace() {
    const el = _lhSp.el;
    if (!el || el.hidden) return;
    const er = el.getBoundingClientRect(), pr = el.querySelector('.ws-panel').getBoundingClientRect(), lp = el.querySelector('.ws-legpanel'), tab = el.querySelector('.ws-legbtn');
    // 0.98.22.7 Andy（iPad 截圖）：分頁貼齊左面板右邊緣、垂直置中；色標面板緊接在分頁右邊、頂端跟左面板對齊、至少跟左面板一樣高
    const tw = tab.offsetWidth || 18;
    // 0.98.22.11 Andy：兩個面板只隔 2px，分頁跨在縫的正中間
    tab.style.left = (pr.right - er.left + 1 - tw / 2) + 'px';
    tab.style.top = (pr.top - er.top + (pr.height - (tab.offsetHeight || 72)) / 2) + 'px';
    lp.style.left = (pr.right - er.left + 2) + 'px';
    lp.style.top = (pr.top - er.top) + 'px';
    lp.style.minHeight = pr.height + 'px';
    // 0.98.41 Andy（手機直放）：右邊放不下（會壓到右上角那排）→ 色標面板改放在左面板正下方
    const trR = el.querySelector('.ws-tr')?.getBoundingClientRect();
    if (trR && trR.width && pr.right + 2 + (lp.offsetWidth || 176) > trR.left - 4 && pr.bottom < trR.bottom + 400) {
        lp.style.left = (pr.left - er.left) + 'px'; lp.style.top = (pr.bottom - er.top + 4) + 'px'; lp.style.minHeight = '0';
    }
    const prev = el.querySelector('.ws-prev'), mid = er.height / 2;
    let left = 12;
    for (const r of [pr, lp.hidden ? null : lp.getBoundingClientRect()]) if (r && r.width && r.bottom - er.top > mid - 32 && r.top - er.top < mid + 32) left = Math.max(left, r.right - er.left + 8);
    prev.style.left = left + 'px';
    // Andy（手機橫放）：左面板＋色標面板寬到碰到上方中間那排（骰子／滑桿／AI）→ 那排搬到畫面下方（只看左右有沒有撞，搬上搬下左右不變，不會來回跳）
    const pt = el.querySelector('.ws-ptop');
    if (pt) { const pl = pt.getBoundingClientRect().left; el.classList.toggle('ws-plow', [pr, lp.hidden ? null : lp.getBoundingClientRect()].some(r => r && r.width && r.right + 8 > pl)); }
}
// 0.98.21 Andy：宇宙裡切換特效等級時，正在播的特效直接收尾（打斷）：還沒浮現的全部出現、凝聚／沖散中的詞直接歸位、殘影清掉、換批過場停掉
function _lhSpFinishFx() {
    const now = _lhSpNow();
    for (const g of _lhSp.queue || []) for (const w of g) { if (!w.spr) w.spr = _lhSpSprite(w, _lhSp.S); w.born = now - 5000; }
    _lhSp.queue = [];
    for (const w of _lhSp.words) {
        if (w.born) w.born = Math.min(w.born, now - 5000);
        if (w.gx0 === undefined) w.gx0 = w.gy0 = 0;   // 已經浮現的詞：切到第 5 級也不再撒開
        w.gHold = false;
        if (w.free && w !== (_lhSp.drag && _lhSp.drag.w)) { if (w.star || w.comet) _lhSpSettle(w, _lhSpCfg(), (now - _lhSp.t0) / 1000); else { w.free = false; w.gk = 0; } if (w.rising) { w.rising = false; w.star = true; } }
        w.fvx = w.fvy = 0;
    }
    for (const cl of _lhSp.groups) cl.ver++;
    _lhSp.slices = _lhSp.slCur = null;
    for (const w of _lhSp.words) w.trl = w.trOld = w.trRet = null;   // 光帶（0.98.22.7）
    if (_lhSp.cv) _lhSp.cv.getAnimations().forEach(a => a.cancel());   // cancel 而不是 finish：星際穿越的放大是 fill forwards，finish 會停在全透明
    _lhSp.dirty = true;
}
const LH_SP_FX_NAME = ['', '簡單', '省電', '精緻', '生動', '浮誇'];
function _lhSpFxSync() {
    const el = _lhSp.el, lv = typeof lhFxLevel === 'function' ? lhFxLevel() : 5, r = el.querySelector('.ws-fx-range');
    el.querySelector('.ws-fx').hidden = typeof lhFxSetLevel !== 'function';
    r.value = String(lv);
    r.setAttribute('aria-valuetext', LH_SP_FX_NAME[lv]);
    el.querySelector('.ws-fx-cap').textContent = '特效：' + LH_SP_FX_NAME[lv];
}

// 常用度篩選：只留前 (100 - v)% 常用的詞；0＝不限
function _lhSpFilter(v) {
    const n = _lhSp.words.length;
    const sorted = [..._lhSp.words].sort((a, b) => b.p - a.p);
    const keep = new Set(sorted.slice(0, Math.max(1, Math.ceil(n * (100 - v) / 100))));
    for (const w of _lhSp.words) w.dim = !keep.has(w);
    for (const cl of _lhSp.groups) cl.ver++;   // 星系圖（第 2 級）要照新的淡／亮重畫
    _lhSp.dirty = true;
    _lhSp.el.querySelector('.ws-filter-cap').textContent = v ? '常用度：前 ' + (100 - v) + '%' : '常用度：不限';
}

// 一個詞在畫面上大約多寬（世界座標 px），排軌道用
const _lhSpWidth = (w, s) => [...w].length * 16 * s + 22;

// 分群（聲調組合）→ 每團：最常用的詞在中心（恆星），其他依常用度由內往外排；只有 1–2 個詞的團變流星。
// 軌道不是整齊的同心圓：每個詞各自的半徑、橢圓扁度、傾角、起始角度、速度都帶一點隨機。
// 字的大小照常用度（詞庫的 p，取對數）在 0.8～2 倍之間（最大最小差 2.5 倍）
// cfg.groupOf(e)→團的 key、cfg.headOf(key)→圖例大類、cfg.colorOf(key)→團色；沒給就用聲調組合（顯示全部）
// 換一批的過場（0.98.09）：鏡頭一甩，舊的帶模糊甩出去、新的從另一邊甩進來（往後翻往左甩）；減少動態時直接換
function _lhSpWhip(page) {
    const cv = _lhSp.cv, cfg = _lhSp.cfg, d = page > (cfg.page || 0) ? -1 : 1;
    const go = () => _lhSpShow(Object.assign({}, cfg, { page }));
    if (_lhSpReduce.matches || !cv.animate) { go(); return; }
    if (typeof lhFxLevel === 'function' && lhFxLevel() >= 5) { _lhSpWarp(go); return; }   // 第 5 級：星際穿越
    if (_lhSp.whip) _lhSp.whip.cancel();
    if (_lhSpCfg().swap === 'fade') {   // 第 2 級（0.98.16 Andy）：淡出再淡入
        const out = cv.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: 'ease-in', fill: 'forwards' });
        _lhSp.whip = out;
        out.onfinish = () => { go(); out.cancel(); _lhSp.whip = cv.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 420, easing: 'ease-out' }); };
        return;
    }
    const away = 'translateX(' + (d * 40) + '%) scale(0.92)', back = 'translateX(' + (-d * 40) + '%) scale(0.92)';
    const out = cv.animate([{ transform: 'none', filter: 'blur(0)', opacity: 1 }, { transform: away, filter: 'blur(14px)', opacity: 0 }],
        { duration: 240, easing: 'cubic-bezier(.55,0,.9,.45)', fill: 'forwards' });
    _lhSp.whip = out;
    out.onfinish = () => {
        go();   // 同一個工作裡換內容、接著開始甩進來，中間不會露出空白的一格
        out.cancel();
        _lhSp.whip = cv.animate([{ transform: back, filter: 'blur(14px)', opacity: 0 }, { transform: 'none', filter: 'blur(0)', opacity: 1 }],
            { duration: 420, easing: 'cubic-bezier(.15,.7,.3,1)' });
    };
}
// 0.98.41 Andy 彩蛋：一直停在黑洞上——淡定臉（5 秒）→ 再 15 秒暴怒 → 再 30 秒哭 → 再 60 秒「無聊」；
// 離開時如果已經變過臉，換回淡定臉留 3 秒才淡掉（還沒變臉就照 CSS 原本的直接淡掉）
const LH_BH_MOODS = [[5, 'ˊ_>ˋ'], [20, '｡ﾟヽ(ﾟ´Д`)ﾉﾟ｡'], [50, '(;´༎ຶД༎ຶ`)'], [110, '無聊']];
function _lhSpBhMood(bh, on) {
    const f = bh.querySelector('.ws-bh-face'); if (!f) return;
    (_lhSp.bhMoodT || []).forEach(clearTimeout); _lhSp.bhMoodT = [];
    if (on) {
        f.classList.remove('stay'); f.textContent = LH_BH_MOODS[0][1];
        for (const [sec, txt] of LH_BH_MOODS.slice(1)) _lhSp.bhMoodT.push(setTimeout(() => { f.textContent = txt; f.classList.add('stay'); }, sec * 1000));
    } else if (f.classList.contains('stay')) {
        f.textContent = LH_BH_MOODS[0][1];
        _lhSp.bhMoodT.push(setTimeout(() => f.classList.remove('stay'), 3000));
    }
}
// 第 5 級的換批過場：星際穿越（超光速）。上面疊一張透明畫布畫從中心往外射的星光線，先加速再減速（約 1.1 秒）；
// 舊的星雲往前衝（放大、模糊、淡出），最快的時候換內容，新的從遠處拉近（由小變大、變清楚）
function _lhSpWarp(go) {
    if (_lhSp.warp) { _lhSp.warpNext = go; return; }   // 還在穿越：記下最後一次要換的，播完接著再穿越一次（不吃掉點擊）
    const el = _lhSp.el, cv = _lhSp.cv, W = el.clientWidth, H = el.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
    const o = document.createElement('canvas');
    o.className = 'ws-warp';
    o.width = Math.round(W * dpr); o.height = Math.round(H * dpr);
    el.insertBefore(o, cv.nextSibling);
    // 0.98.22.9 Andy：放大不要正面撞上恆星——往畫面中間一塊找離所有恆星最遠的點當放大中心（星光線也從這裡射出），恆星就從旁邊快速掠過
    // 0.98.22.11 Andy：離恆星太遠也怪 → 放大中心改成「擦過」離畫面中心最近的那顆恆星（在它旁邊 7% 畫面短邊，偏向中心那側），
    // 製造差點撞上的危險感；星光線（穿越本身）一律從畫面正中心射出
    const cx = W / 2, cy = H / 2, MISS = Math.min(W, H) * 0.07;   // ponytail: 擦過距離寫死，嫌太近／太遠再搬進齒輪
    let ox = cx, oy = cy;
    const q = _lhSp.words.filter(w => w.star && w.born && !w.off).map(w => _lhSpScr(w.px, w.py))
        .filter(p => p.x > 0 && p.x < W && p.y > 0 && p.y < H).sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy))[0];
    if (q) {
        const d = Math.hypot(cx - q.x, cy - q.y), a = d > 1 ? Math.atan2(cy - q.y, cx - q.x) : Math.random() * Math.PI * 2;
        ox = q.x + Math.cos(a) * MISS; oy = q.y + Math.sin(a) * MISS;
    }
    const x = o.getContext('2d'), maxR = Math.hypot(cx, cy);
    cv.style.transformOrigin = ox + 'px ' + oy + 'px';
    // 0.98.10：光線顏色取畫面上看得到的詞（隨機抽，哪個色系佔得多，光線就多是那個色）；畫面空的才用文字色
    const seen = _lhSp.words.filter(w => w.born && !w.dim && !w.off && w.rgb && (p => p.x > 0 && p.x < W && p.y > 0 && p.y < H)(_lhSpScr(w.px, w.py))).map(w => w.rgb);
    const fallback = getComputedStyle(_lhSp.probe).getPropertyValue('--text-primary').trim() || '#fff';
    const pick = () => seen.length ? seen[Math.floor(Math.random() * seen.length)] : fallback;
    const stars = Array.from({ length: 220 }, () => ({ a: Math.random() * Math.PI * 2, d: 20 + Math.random() * maxR, w: 0.6 + Math.random() * 1.4, c: pick() }));
    const T = 730;   // 0.98.09：從 1100 縮短三分之一
    // 0.98.17 Andy：舊宇宙先放大＋漸漸變透明（0.7 秒，製造加速感），最後 0.2 秒才接上星光線；光線開始 0.2 秒後（舊的剛好消失）換新宇宙
    // 0.98.21 Andy：還是像播完一個再播另一個 → 光線提早 0.45 秒接上（重疊一半以上），放大前段加速更猛（4 倍）、最後衝到 9 倍
    const PRE = 800, OVL = 450, GO = OVL / T;
    _lhSp.warp = true;
    _lhSp.smFade = _lhSpNow() + PRE - 300;   // Andy：舊宇宙的煙霧跟著星系放大，放大的最後 0.3 秒淡掉
    // 0.98.22.7 Andy：舊版兩段放大在中間接縫會先慢下來、最後還糊成一團光暈（blur 越來越大）→ 像減速停住。
    // 改成放大一條曲線一路加速到 14 倍、不加模糊；透明度另外一條：前 6 成不透明，最後才快速淡掉，直接接上星光線
    // 0.98.22.11 Andy：不淡出了——一路放大到 40 倍，星系直接從身旁飛過、飛出畫面（14 倍時放大中心附近還留著東西，換內容會突然切掉）
    // 減速感的原因：瀏覽器把 scale(1)→scale(40) 當直線內插，倍率每毫秒加一樣多；但眼睛看的是「相對放大」（1→2 跟 20→40 一樣快），
    // 後段同樣加 1 倍只放大一點點 → 看起來越來越慢。改成按「倍率的次方」排 16 個關鍵格（每格之間直線），相對放大一路加速
    const ZK = 16, ZMAX = 40, zf = u => Math.pow(ZMAX, Math.pow(u, 2.2)), lin = { duration: PRE, fill: 'forwards', easing: 'linear' };
    cv.animate(Array.from({ length: ZK + 1 }, (_, i) => ({ offset: i / ZK, transform: 'scale(' + zf(i / ZK) + ')' })), lin);
    // 放大殘影（0.98.22.11 Andy）：放大前把畫面拍 3 張，各自跟著放大但倍率落後一點（越後面落越多、越淡），
    // 衝得越快拉開越多＝往外拖的殘影；最後 15% 淡掉，換宇宙時不會一下子切掉
    const echoes = [0.4, 0.25, 0.13].map((k, i) => {
        const e = document.createElement('canvas'), lag = 1 - 0.08 * (i + 1);
        e.width = cv.width; e.height = cv.height; e.className = 'ws-canvas ws-echo';
        e.getContext('2d').drawImage(cv, 0, 0);
        e.style.transformOrigin = cv.style.transformOrigin;
        el.insertBefore(e, cv);
        e.animate(Array.from({ length: ZK + 1 }, (_, j) => { const u = j / ZK; return { offset: u, transform: 'scale(' + Math.pow(zf(u), lag) + ')', opacity: k * Math.min(1, u / 0.15, (1 - u) / 0.15) }; }), lin);
        return e;
    });
    // 0.98.41 Andy：黑洞（DOM，不在畫布上）也跟著同一個中心放大、飛出畫面，換內容時直接清空，不會孤零零留在畫面上
    const bhE = el.querySelector('.ws-bh');
    if (bhE && bhE.style.visibility !== 'hidden') {
        const r = bhE.getBoundingClientRect(), er = el.getBoundingClientRect(), dx = r.left + r.width / 2 - er.left - ox, dy = r.top + r.height / 2 - er.top - oy;
        bhE.animate(Array.from({ length: ZK + 1 }, (_, i) => { const k = zf(i / ZK); return { offset: i / ZK, translate: (dx * (k - 1)).toFixed(1) + 'px ' + (dy * (k - 1)).toFixed(1) + 'px', scale: String(k) }; }), lin);
    }
    let t0 = 0;   // 光線第一格才開始計時
    let swapped = false;
    const step = now => {
        if (!t0) t0 = now;
        const u = Math.min(1, (now - t0) / T), sp = Math.sin(u * Math.PI);   // 速度 0→1→0
        if (!swapped && u >= GO) {
            swapped = true;
            cv.getAnimations().forEach(a => a.cancel());
            echoes.forEach(e => e.remove());
            if (bhE) { bhE.getAnimations().forEach(a => { if (a.effect && a.effect.getKeyframes().some(f => f.scale)) a.cancel(); }); bhE.style.visibility = 'hidden'; }   // 舊宇宙的黑洞清掉；新宇宙照常由漂流重新決定要不要出現
            _lhSp.smFade = 0; for (const S of Object.values(_lhSp.smk3 || {})) { S.x.clearRect(0, 0, S.c.width, S.c.height); S.clean = true; }   // 換宇宙：煙霧整張清掉，不帶進新宇宙
            cv.style.transformOrigin = '';   // 新宇宙照常從畫面中心拉近
            go();
            cv.animate([{ transform: 'scale(0.35)', filter: 'blur(8px)', opacity: 0 }, { transform: 'none', filter: 'blur(0)', opacity: 1 }], { duration: T * 0.6, easing: 'cubic-bezier(.15,.7,.3,1)' });
        }
        x.setTransform(dpr, 0, 0, dpr, 0, 0);
        x.clearRect(0, 0, W, H);
        x.lineCap = 'round';
        for (const s of stars) {
            s.d *= 1 + sp * 0.13;   // 越外面跑越快（透視）；時間短了，每格多衝一點
            if (s.d > maxR) { s.d = 10 + Math.random() * 60; s.a = Math.random() * Math.PI * 2; }
            const len = s.d * sp * 0.35, c = Math.cos(s.a), n = Math.sin(s.a);
            x.globalAlpha = Math.min(1, 0.25 + sp) * Math.min(1, s.d / 120);
            x.lineWidth = s.w * (0.6 + sp); x.strokeStyle = s.c;
            x.beginPath(); x.moveTo(cx + c * (s.d - len), cy + n * (s.d - len)); x.lineTo(cx + c * s.d, cy + n * s.d); x.stroke();
        }
        if (u < 1) requestAnimationFrame(step);
        else { o.remove(); _lhSp.warp = false; const nx = _lhSp.warpNext; _lhSp.warpNext = null; if (nx && _lhSp.visible) _lhSpWarp(nx); }
    };
    setTimeout(() => requestAnimationFrame(step), PRE - OVL);
}
// 旋臂（0.98.09）：超過 25 個詞的大星系自動排成旋臂——恆星不轉、離中心越遠轉越慢（克卜勒：角速度 ∝ 距離^-1.5），
// 每個星系 2～5 條往後拖的螺旋臂；25 個詞以下看不出臂，維持同心圓（內圈角速度快）。兩套同時並存，沒有開關
const _lhSpGroupKey = (e, cfg) => cfg.groupOf ? cfg.groupOf(e) : e.z.split(' ').map(s => getZhuyinTone(s)).join('·');
// 分批：一批約 600（±30）個詞，星系一律整個放同一批、不拆（同條件的詞沒理由拆散；超大星系改成色偏大、散得開，見 _lhSpLayout）。
// 批數＝總數 / 600 四捨五入（630 以下一批）；星系由大到小，每次放進目前最少的那批。結果記在 cfg._pages
function _lhSpPages(cfg) {
    if (cfg._pages) return cfg._pages;
    const groups = new Map();
    for (const e of cfg.list) { const k = _lhSpGroupKey(e, cfg); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e); }
    // 0.98.10 之後：不再把大星系拆到各批（舊版「輪流發牌」拆法見 git 6fdd3d4）
    const chunks = [...groups.values()];
    chunks.sort((a, b) => b.length - a.length);
    // 0.98.14：每個宇宙至少兩個星系（3 詞以上才算星系，2 詞以下是流星）→ 批數最多＝星系數 / 2；
    // 最大的幾個星系先各佔一批，再從最小的星系開始配給最大的那批（大配小，不硬拆），剩下的照舊放進目前最少的那批
    const N = cfg.list.length, G = chunks.filter(c => c.length > 2).length;
    const B = N <= LH_WS_SPACE_MAX ? 1 : Math.max(1, Math.min(Math.floor(G / 2), Math.max(2, Math.round(N / 600))));
    const bins = Array.from({ length: B }, () => new Set()), put = (b, c) => { for (const e of c) b.add(e); };
    if (B > 1 && cfg.rel && cfg.catOf) {   // Andy 0.98.22.11：關聯詞的宇宙照「兩字→三字→四字→多字」排（同字數再照字首→中間→字尾），依序裝滿一批再換下一批（星系照舊不拆）
        const ck = c => { const k = cfg.catOf(c[0]); return LH_REL_LEN.indexOf(k.len) * 3 + LH_REL_POS.indexOf(k.pos); };
        chunks.sort((a, b) => ck(a) - ck(b) || b.length - a.length);
        let bi = 0;
        for (const c of chunks) { if (bi < B - 1 && bins[bi].size && bins[bi].size + c.length > N / B * 1.1) bi++; put(bins[bi], c); }
        // Andy：同字數剩下的零頭自己一個宇宙（例：五六百顆後面跟一個五六十顆）很怪 → 不到平均三成的宇宙併進前後比較小的鄰居
        const bs = bins.filter(b => b.size);
        for (let i = 0; i < bs.length && bs.length > 1;) {
            if (bs[i].size >= N / B * 0.3) { i++; continue; }
            const j = i === 0 ? 1 : i === bs.length - 1 ? i - 1 : (bs[i - 1].size <= bs[i + 1].size ? i - 1 : i + 1);
            for (const e of bs[i]) bs[j].add(e);
            bs.splice(i, 1);
            i = 0;
        }
        bins.splice(0, bins.length, ...bs);
        return (cfg._pages = bins.filter(b => b.size).map(b => cfg.list.filter(e => b.has(e))));
    }
    const rest = chunks.slice(B);
    if (B > 1) {
        chunks.slice(0, B).forEach((c, i) => put(bins[i], c));
        const small = rest.filter(c => c.length > 2).reverse();   // 最小的星系在前
        for (const b of bins) { const c = small.shift(); if (!c) break; put(b, c); rest.splice(rest.indexOf(c), 1); }
    } else rest.unshift(...chunks.slice(0, B));
    for (const c of rest) put(bins.reduce((m, x) => x.size < m.size ? x : m), c);
    return (cfg._pages = bins.filter(b => b.size).map(b => cfg.list.filter(e => b.has(e))));   // 每批裡照原本順序（常用的先）
}
function _lhSpLayout(list, cfg = {}) {
    const lp = list.map(e => Math.log1p(e.p || 0)), lo = Math.min(...lp), hi = Math.max(...lp);
    const norm = e => hi > lo ? (Math.log1p(e.p || 0) - lo) / (hi - lo) : 0.5;
    const sizeOf = e => 0.8 + 1.2 * norm(e);
    const R = Math.random, TAU = Math.PI * 2, JIT = _lhSpCfg().jitter;   // 水彩偏移只在第 4、5 級（其他級同一圈整整齊齊）
    // 同一色系裡的深淺：越常用越接近主色，再加一點隨機
    const tint = (base, e) => 'color-mix(in oklab, ' + base + ' ' + Math.round(55 + 30 * norm(e) + 15 * R()) + '%, var(' + (R() < 0.5 ? '--text-primary' : '--text-secondary') + '))';
    const groups = new Map();
    for (const e of list) {
        const k = _lhSpGroupKey(e, cfg);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(e);
    }
    const G = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
    const words = [], clusters = [], comets = [];
    for (const [key, g] of G) {
        if (g.length <= 2 && G.length > 1) { comets.push(...g); continue; }   // 很孤立的：流星
        const t1 = cfg.headOf ? cfg.headOf(key) : Math.min(5, Math.max(1, +key.split('·')[0] || 1));
        const color = cfg.colorOf ? cfg.colorOf(key) : _lhWsToneMix(key);
        const cl = { key, t1, n: g.length, color, x: 0, y: 0, hx: 0, hy: 0, r: 0, D: 0, held: false, dir: R() < 0.5 ? -1 : 1, tilt: R() * Math.PI,
            ph: [R() * TAU, R() * TAU], f: [0.12 + R() * 0.08, 0.1 + R() * 0.08], bp: 4 + R() * 3, ver: 0,   // bp：整團呼吸一輪幾秒（每團不同）
            arms: 2 + Math.floor(R() * 4), arm0: R() * TAU, twist: 1.4 + R() * 1.2, ecc: 0.82 + R() * 0.12 };   // 旋臂模式：幾條臂、起始角、捲曲程度、整個星系的扁度
        clusters.push(cl);
        // 先照寬度一圈圈分好（第 k 圈半徑 = 中心詞的一半寬 + k × 間距），再給每個詞自己的隨機軌道
        // 小星系漫遊（0.98.09）：3–5 個詞的微星系、6–10 個詞的小星系像流星一樣走長直線、出邊界從對面回來；流星 > 微星系 > 小星系
        // 0.98.22.11 Andy：微星系＝7 詞以下、小星系＝8～15 詞，會繞宇宙中心公轉；速度在齒輪（LH_SP_TUNE.roam），這裡只記方向和每團 ±25% 的隨機快慢
        if (g.length <= 30) { const a = R() * TAU, v = 0.75 + R() * 0.5; cl.vx = Math.cos(a) * v; cl.vy = Math.sin(a) * v; cl.roamK = g.length <= 7 ? 'micro' : g.length <= 15 ? 'small' : 'mid'; }   // Andy：加一階中小星系（16～30 詞），一樣繞宇宙中心大範圍公轉，更慢
        // 呼吸（0.98.09）：越大的星系呼吸越慢、幅度越大；幅度 ±3% 起、每多 50 個詞 +0.4%（885 詞約 ±10%）
        // 0.98.14.11 Andy：呼吸一輪的秒數照詞數分段線性——10 詞 5.5 秒、200 詞 20 秒、885 詞（實測最大）60 秒封頂；每團再 ±15% 隨機
        { const n = g.length, u = Math.max(0, n - 10) / 50;
          const P = n <= 10 ? 5.5 : n <= 200 ? 5.5 + (n - 10) / 190 * 14.5 : Math.min(60, 20 + (n - 200) / 685 * 40);
          cl.bp = P * (0.85 + R() * 0.3); cl.ba = 0.03 + 0.004 * u; }
        const spiral = g.length > 25;
        // 超大星系（150 個詞起，550 封頂）：圈距和臂上的空隙拉開，散得稀疏一點；big 0→1
        const big = Math.min(1, Math.max(0, (g.length - 150) / 400)), RING = LH_SP_RING * (1 + 0.9 * big);
        // 色偏（原本只給超大星系，Andy 喜歡、改成所有星系都套滿）：每個詞明暗 ±0.08、色相 ±35°。
        // 只在打開時算一次顏色（之後每格用快取的 rgb），不吃動畫效能，所以每一級都開
        const tintB = (base, e) => { const t = tint(base, e); if (!_LH_REL_REL) return t;
            const dl = Math.round((R() - 0.5) * 0.16 * 100) / 100, dh = Math.round((R() - 0.5) * 70 / 5) * 5;   // 量化：顏色快取才不會爆
            return 'oklch(from ' + t + ' calc(l + ' + dl + ') c calc(h + ' + dh + '))'; };   // 大星系排旋臂、小的維持同心圓（見上面 _lhSpGroupKey 前的說明）
        // 恆星照星系大小加成（0.98.09）：10 個詞以下不加，100 個 2 倍（中間照對數），之後每多 50 個詞再 +0.25 倍（連續，不跳階），300 個詞封頂＝3 倍（0.98.11.1：880 詞的星系原本衝到 5.9 倍，手機縮到最小還框不住）；常用度和星系規模都看得出來
        const star = g[0], rings = [[]], starS = sizeOf(star) * (1 + Math.min(1, Math.max(0, Math.log10(g.length / 10))) + Math.max(0, Math.min(300, g.length) - 100) / 50 * 0.25);
        // 恆星放大後（0.98.09）：靠近中心的幾圈也跟著大一點（第一圈分到恆星多出來的 35%，往外每圈減半），
        // 第一圈離恆星遠一點（恆星每多 1 倍推開 0.8 圈），放大的幾圈之間也跟著加寬
        const extra = starS / sizeOf(star) - 1, boost = k => 1 + extra * 0.35 * Math.pow(0.5, k), szOf = new Map();
        let r = _lhSpWidth(star.w, starS) / 2 + RING * (0.9 + 0.8 * extra), used = 0;
        const radii = [r];
        for (const e of g.slice(1)) {
            const k = rings.length - 1, sz = sizeOf(e) * boost(k), wd = _lhSpWidth(e.w, sz) + 10;
            // 旋臂模式：詞擠在臂上，一圈只放 55% 才不會疊
            if (used + wd > 2 * Math.PI * r * (spiral ? 0.55 : 1) / (1 + 0.6 * big) && rings[rings.length - 1].length) { rings.push([]); r += RING * boost(k); radii.push(r); used = 0; }
            const kk = rings.length - 1, s2 = sizeOf(e) * boost(kk);
            szOf.set(e, s2);
            rings[kk].push(e);
            used += _lhSpWidth(e.w, s2) + 10;
        }
        cl.r = r + RING * 1.1;
        words.push({ e: star, cl, star: true, color, s: starS, n: norm(star), r: 0, ecc: 1, tilt: 0, th: 0, om: 0 });
        // 同一圈共用扁度、傾角、速度（才不會越轉越擠在一起），每個詞只再帶一點點偏差
        if (spiral) rings.forEach((ring, k) => {
            // 第 k 圈：輪流分給每條臂；每條臂在這圈的中心角＝起始角＋第幾條×(360°/臂數)－捲曲×ln(半徑比)（往旋轉的反方向拖）
            const rk = radii[k], N = cl.arms, per = Array.from({ length: N }, () => []);
            const omD = radii[0] / rk, omB = cl.dir * 0.16, om = omB * Math.pow(omD, 1.5);   // 克卜勒：越外面越慢（omB／omD 給齒輪即時調「越外面越慢」的程度）
            // Andy：每圈隨機挑約 roam.interarm（齒輪，0～10%）的行星不放臂上，散在兩條臂之間的稀疏處；大小取左右兩條臂上行星的平均（不會在空處冒出一顆特大或特小的）
            // Andy：不落到最外圈旋臂外（看起來像掉出去）——只有最外圈半徑 8 成以內的圈才挑臂間行星，最外面幾圈全放臂上
            const inside = rk <= radii[radii.length - 1] * 0.8;
            const pick = new Set(inside && ring.length >= N * 2 ? ring.filter(() => R() < (LH_SP_TUNE.roam.interarm ?? 0.1)) : []);
            ring.filter(e => !pick.has(e)).forEach((e, j) => per[j % N].push(e));
            const avgS = lst => lst.length ? lst.reduce((t, e) => t + szOf.get(e), 0) / lst.length : null;
            for (const e of pick) {
                const a = Math.floor(R() * N), sA = avgS(per[a]), sB = avgS(per[(a + 1) % N]), s2 = sA && sB ? (sA + sB) / 2 : sA || sB || szOf.get(e);
                const mid = cl.arm0 + (a + 0.5) * TAU / N - cl.dir * cl.twist * Math.log(rk / radii[0]) + (R() - 0.5) * TAU / N * 0.35;   // 兩條臂中間，左右再隨機偏一點
                words.push({ e, cl, color: tintB(color, e), s: s2, n: norm(e), r: rk - R() * LH_SP_RING * 0.6,   // 半徑也散一點（只往內，不往外凸出去），看起來比較稀疏、不像又一條臂
                    ecc: cl.ecc, tilt: cl.tilt, th: mid, om, omB, omD, omE: 1.5, br: 3 + R() * 4, inter: true });
            }
            per.forEach((lst, a) => {
                const ctr = cl.arm0 + a * TAU / N - cl.dir * cl.twist * Math.log(rk / radii[0]);
                const ws = lst.map(e => (_lhSpWidth(e.w, szOf.get(e)) + 10) / rk);
                let ang = ctr - ws.reduce((t, x) => t + x, 0) / 2;
                lst.forEach((e, i) => {
                    words.push({ e, cl, color: tintB(color, e), s: szOf.get(e), n: norm(e), r: rk + (JIT ? (R() - 0.5) * LH_SP_RING * 0.4 : 0),
                        ecc: cl.ecc, tilt: cl.tilt, th: ang + ws[i] / 2, om, omB, omD, omE: 1.5, br: 3 + R() * 4 });
                    ang += ws[i];
                });
            });
        });
        else rings.forEach((ring, k) => {
            const th0 = R() * TAU, gap = TAU / ring.length;
            const avgN = ring.reduce((t, e) => t + norm(e), 0) / ring.length;   // 0.98.09：大行星（常用、字大）慢、小行星快，照這圈詞的平均大小（同圈共用速度才不會互撞）
            const omD = 1 / (k + 1), omB = cl.dir * 0.16 * (0.9 + R() * 0.2) * (1.55 - 1.1 * avgN), om = omB * Math.sqrt(omD);
            const ecc = 0.82 + R() * 0.15, tilt = cl.tilt + (R() - 0.5) * 0.5;
            ring.forEach((e, j) => words.push({ e, cl, color: tintB(color, e), s: szOf.get(e), n: norm(e),
                // 水彩筆畫的圈（第 4、5 級）：同一圈每個詞離軌道多遠不一樣（±30% 間距），角度也不平均；速度相同，所以彼此距離不會變
                r: radii[k] + (JIT ? (R() - 0.5) * LH_SP_RING * 0.6 : 0), ecc: ecc + (JIT ? (R() - 0.5) * 0.03 : 0), tilt: tilt + (JIT ? (R() - 0.5) * 0.08 : 0),
                th: th0 + gap * j + (JIT ? (R() - 0.5) * gap * 0.35 : 0), om, omB, omD, omE: 0.5, br: 3 + R() * 4 }));
        });
    }
    // 恆星飄的速度：照團的大小分 20 級（5% 一級，跟常用度滑桿同單位），越小的團飄越快；恆星越不常用（字越小）也越快
    const bySize = [...clusters].sort((a, b) => a.n - b.n);
    bySize.forEach((cl, i) => {
        const lv = 1 + Math.round(19 * (bySize.length > 1 ? i / (bySize.length - 1) : 0.5));   // 1＝最小的團 … 20＝最大的團
        const star = words.find(w => w.cl === cl && w.star);
        const k = (2.6 - 2.15 * (lv - 1) / 19) * (1 + 0.8 * (1 - (star ? norm(star.e) : 0.5)));   // 最快約最慢的 10 倍
        cl.f = cl.f.map(f => f * k);
    });
    // 團沿黃金角螺旋往外放（最大的先放在中間），彼此多留一點空間給恆星飄
    // 0.98.15.1 Andy：最大星系佔一半以上詞數＝超大星系宇宙，照大小順序、最大的在中間；
    // 否則（星系多、大小較平均）擺放順序打亂（大的仍較常先放）、螺旋起始角和每一步的角度／距離都加隨機，排得有機一點
    const placed = [], total = clusters.reduce((t, c) => t + c.n, 0), organic = clusters.length > 2 && clusters[0].n < total * 0.5;
    const order = organic ? clusters.map(c => [c, c.n * (0.4 + R() * 1.2)]).sort((p, q) => q[1] - p[1]).map(p => p[0]) : clusters;
    const a0 = organic ? R() * TAU : 0;
    order.forEach((cl, i) => {
        for (let k = 0; i > 0; k++) {
            const a = a0 + k * 2.39996 + (organic ? (R() - 0.5) * 0.7 : 0), d = (60 + k * 22) * (organic ? 0.8 + R() * 0.4 : 1);
            cl.x = Math.cos(a) * d; cl.y = Math.sin(a) * d * 0.8;
            if (placed.every(p => Math.hypot(p.x - cl.x, p.y - cl.y) > p.r + cl.r + 90)) break;
        }
        placed.push(cl);
    });
    // 0.98.15 Andy：最大的星系不必釘在原點——整組排好後，把所有星系的外框中心移到 (0,0)（畫面一打開對準的地方），各星系彼此的相對位置不變
    if (clusters.length) {   // 全是流星（沒有星系）就跳過
        const x0 = Math.min(...clusters.map(c => c.x - c.r)), x1 = Math.max(...clusters.map(c => c.x + c.r));
        const y0 = Math.min(...clusters.map(c => c.y - c.r)), y1 = Math.max(...clusters.map(c => c.y + c.r));
        // 0.98.15.2 Andy：不死釘在正中——超大星系宇宙（照大小擺的）整組再隨機偏一點，最多最大星系半徑的 25%
        const jr = organic ? 0 : clusters[0].r * 0.25 * Math.sqrt(R()), ja = R() * TAU;
        // 0.98.20 Andy：三個星系以內、最大的比其他加起來還大 → 最大的恆星就釘在畫面正中（0,0），也不漫遊
        const anchor = clusters.length <= 3 && clusters[0].n > total - clusters[0].n;
        const ox = anchor ? clusters[0].x : (x0 + x1) / 2 + Math.cos(ja) * jr, oy = anchor ? clusters[0].y : (y0 + y1) / 2 + Math.sin(ja) * jr * 0.8;
        if (anchor) clusters[0].vx = clusters[0].vy = 0;
        for (const c of clusters) { c.x -= ox; c.y -= oy; }
    }
    for (const cl of clusters) { cl.hx = cl.x; cl.hy = cl.y; }
    for (const cl of clusters) _lhSpDrift(cl, clusters);
    const bound = Math.max(600, ...clusters.map(c => Math.hypot(c.x, c.y) + c.r)) * 1.25;
    for (const e of comets) {   // 流星：隨機起點、隨機方向，沿著微彎的弧線穿過整片（0.98.08 快一點、直一點），出了邊界從對面回來
        const a = R() * TAU, v = (45 + R() * 45) * 3, cv = (R() < 0.5 ? -1 : 1) * (0.0075 + R() * 0.0175) * 3;   // 0.98.09：速度 3 倍；轉彎速率也 ×3，看起來的彎度維持 0.98.08 的 1/2
        words.push({ e, cl: null, color: 'var(--text-primary)', s: sizeOf(e), n: norm(e), comet: true, x: (R() * 2 - 1) * bound, y: (R() * 2 - 1) * bound, v, cv, ang: a });
    }
    return { words, clusters, bound };
}

// 恆星能飄多遠：和最近那團之間空隙的一半（兩團各飄各的也碰不到），3～60
function _lhSpDrift(cl, all) {
    let g = 240;
    for (const o of all) if (o !== cl) g = Math.min(g, Math.hypot(o.hx - cl.hx, o.hy - cl.hy) - o.r - cl.r);
    cl.D = Math.max(3, Math.min(60, g / 2 - 8));
}
const _lhSpDx = (cl, T) => cl.D * Math.sin(T * cl.f[0] + cl.ph[0]);
const _lhSpDy = (cl, T) => cl.D * 0.8 * Math.cos(T * cl.f[1] + cl.ph[1]);

// 詞在自己軌道上的位置（橢圓、傾斜，繞著恆星現在的位置）
function _lhSpOrbit(w) {
    const c = Math.cos(w.th) * w.r, sn = Math.sin(w.th) * w.r * w.ecc, ct = Math.cos(w.tilt), st = Math.sin(w.tilt);
    return { x: w.cl.x + c * ct - sn * st + (w.sx || 0), y: w.cl.y + c * st + sn * ct + (w.sy || 0) };
}

// 一打開的縮放：近一點，大約 40% 的詞落在畫面裡（0.98.16 Andy：25%→40%）（其他的拖過去、縮小再看）
function _lhSpFitZoom(words) {
    const el = _lhSp.el, W = (el.clientWidth || innerWidth) / 2 - 30, H = (el.clientHeight || innerHeight) / 2 - 40;   // 還藏著（面板還在收）時用視窗大小
    const q = words.filter(w => !w.comet).map(w => {
        const { x, y } = _lhSpOrbit(w);
        return Math.max(Math.abs(x) / W, Math.abs(y) / H);
    }).sort((a, b) => a - b);
    if (!q.length) return 1;
    const pk = q[Math.min(q.length - 1, Math.floor(q.length * 0.5))] || 1;   // 0.98.20 Andy：40%→50%
    return Math.min(2.2, Math.max(LH_SP_FIT_MIN, 1 / pk));   // 打開時最小 0.2（手機上幾千詞的星系，0.1 只剩恆星看得清）；手動還能縮到 LH_SP_ZMIN
}

// 宇宙用的字型：header 那套粗明體（Noto Serif TC 700）。Google 中文字型切成上百片、用到才下載，畫布寫字又不會觸發下載，所以要自己先叫它載。
const LH_SP_FONT = "700 16px 'Noto Serif TC'";
function _lhSpPreFont(ws) {
    if (!document.fonts || !ws.length) return Promise.resolve(true);
    const txt = [...new Set(ws.join(''))].join('');
    if (document.fonts.check(LH_SP_FONT, txt)) return Promise.resolve(true);
    const go = () => document.fonts.load(LH_SP_FONT, txt);
    return new Promise(r => (window.requestIdleCallback || setTimeout)(() => go().then(() => r(false), e => { lhWarn('宇宙字型預載失敗', e); r(true); })));
}
// 關聯詞彙：滑鼠移到按鈕上（或鍵盤停在上面）就先偷跑下載字型，選的字沒變就不重算
let _lhRelPreKey = '';
const _lhRelPre = e => {
    if (!e.target.closest || !e.target.closest('#wsRelBtn') || !wordlistData || typeof selectedChars === 'undefined') return;
    const chars = [...selectedChars].filter(c => /[一-鿿]/.test(c)), key = chars.join('') + '|' + _lhRel.pos + '|' + [..._lhRel.len].join('');
    if (!chars.length || key === _lhRelPreKey) return;
    _lhRelPreKey = key; _lhSpPreFont(_lhWsRelList(chars, _lhRel.pos, _lhRel.len).map(x => x.w));
};
document.addEventListener('pointerover', _lhRelPre, { passive: true }); document.addEventListener('focusin', _lhRelPre);
function lhWsOpen() {
    if (!_lhWs.list.length) return;
    _lhSpShow({ list: _lhWs.list, title: '「' + _lhWs.input + '」', page: 0 });
}

// ===== 關聯詞彙：查單字時選了字卡，列出含這些字的詞（js/cards.js updateBatchCount 開關按鈕） =====
// pos：'head'＝字在詞首、'tail'＝在詞尾、''＝任意位置。len：字數篩選（'2'／'3'／'4'／'m'＝五字以上，可多選，空＝不限）。
// 分團：字＋位置（任意）或字＋字數（詞首／詞尾）
const _lhRel = { chars: [], pos: '', len: new Set() };
function _lhWsRelList(chars, pos, len = new Set()) {
    const set = new Set(chars), out = [];
    for (const e of typeof lhCwMerge === 'function' ? lhCwMerge(wordlistData) : wordlistData || []) {
        const cs = [...e.w], n = cs.length;
        if (n < 2 || n > LH_WS_MAX || _lhWs.hidden.has(e.w)) continue;
        if (len.size && !len.has(n <= 4 ? String(n) : 'm')) continue;
        if (pos === 'head' ? set.has(cs[0]) : pos === 'tail' ? set.has(cs[n - 1]) : cs.some(c => set.has(c))) out.push(e);
    }
    return out.sort((a, b) => (b.p || 0) - (a.p || 0));
}
function lhWsRelOpen() {
    const chars = [...selectedChars].filter(c => /[一-鿿]/.test(c));
    if (!chars.length) return;
    if (!wordlistData) { showToast('詞庫載入中…'); loadWordlist().then(() => { if (wordlistData) lhWsRelOpen(); }); return; }
    _lhRel.chars = chars;
    _lhRelShow();
}
// 關聯詞（0.98.10）：一律拿全部的詞，照「字 × 位置（字首／中間／字尾）× 字數（兩字／三字／多字）」拆成獨立星系；
// 「字首／字尾」「兩字／三字／多字」只是把不符合的星系收起來（_lhRelApply），不重排。
// 顏色：只選一個字＝每種位置×字數各一個色相；選了好幾個字＝字分基礎色系，位置調明暗、字數調色偏
const LH_REL_POS = ['首', '中', '尾'], LH_REL_LEN = ['2', '3', '4', 'm'];
const LH_REL_POS_N = { 首: '字首', 中: '中間', 尾: '字尾' }, LH_REL_LEN_N = { 2: '兩字', 3: '三字', 4: '四字', m: '多字' };
const _lhRelCat = (e, set) => {
    const cs = [...e.w], i = cs.findIndex(c => set.has(c));
    // rd：這個字在這個詞裡的實際讀音（含聲調、變調，例如「一」有ㄧ／ㄧˊ／ㄧˋ）；聲調不同跟旋律倒字有關，一律分開，不看「過濾破音字」
    const z = (e.z || '').split(' '), rd = z.length === cs.length ? z[i] : '';
    return { c: cs[i], pos: i === 0 ? '首' : i === cs.length - 1 ? '尾' : '中', len: cs.length <= 4 ? String(cs.length) : 'm', rd };
};
const _LH_REL_REL = CSS.supports('color', 'oklch(from red calc(l + 0.1) c calc(h + 10))');
function _lhRelColor(chars, c, pos, len) {
    const pi = LH_REL_POS.indexOf(pos), li = LH_REL_LEN.indexOf(len);
    if (chars.length === 1) {   // 一個字：3 位置 × 4 字數＝12 種星系各一個色相（從主題強調色轉，不支援相對色就用主題色混）
        const k = pi * 4 + li;
        return _LH_REL_REL ? 'oklch(from var(--highlight-border) l max(c, 0.12) calc(h + ' + Math.round(k * 360 / 12) + '))'
            : LH_WS_TONE_C[k % 5];
    }
    const base = LH_WS_TONE_C[chars.indexOf(c) % 5];
    return _LH_REL_REL ? 'oklch(from ' + base + ' calc(l + ' + [0.09, 0, -0.09][pi] + ') c calc(h + ' + [-18, -6, 6, 18][li] + '))'
        : 'color-mix(in oklab, ' + base + ' ' + [70, 100, 80][pi] + '%, var(' + (pi === 2 ? '--text-secondary' : '--text-primary') + '))';
}
function _lhRelShow() {
    const { chars } = _lhRel;
    const list = _lhWsRelList(chars, '', new Set());
    if (!list.length) { showToast('詞庫裡沒有含這些字的詞'); if (!_lhSp.el || _lhSp.el.hidden) return; }
    const set = new Set(chars);
    // 每個字的讀音照詞數排名：最多的讀音用原色，其他讀音依序調明暗＋小色偏（同類別不同讀音一眼分得出來）
    const cnt = new Map();
    for (const e of list) { const k = _lhRelCat(e, set), id = k.c + k.rd; cnt.set(id, (cnt.get(id) || 0) + 1); }
    const rank = new Map();
    for (const c of chars) [...cnt].filter(([id]) => id.startsWith(c)).sort((a, b) => b[1] - a[1]).forEach(([id], i) => rank.set(id, i));
    // 0.98.14：超過 500 詞的星系再照「這個字是詞裡第幾個字」拆開（第 5 段＝第幾字，例「不」的多字詞拆成第 2／3／4 字）
    const base = e => { const k = _lhRelCat(e, set); return k.c + '|' + k.pos + '|' + k.len + '|' + k.rd; }, bn = new Map();
    for (const e of list) { const b = base(e); bn.set(b, (bn.get(b) || 0) + 1); }
    const poly = new Set(chars.filter(c => [...rank.keys()].filter(id => id.startsWith(c)).length > 1));   // 這批詞裡有兩種以上讀音（含變調）＝破音字
    // 0.98.20 Andy：選的字多（4 個起）標題會折好幾行 → 只寫「N個字」
    _lhSpShow({ list, title: '「' + (chars.length > 3 ? chars.length + '個字' : chars.join('')) + '」關聯詞', rel: true, page: 0, poly,
        catOf: e => _lhRelCat(e, set),
        groupOf: e => { const b = base(e); return bn.get(b) > 500 ? b + '|' + ([...e.w].findIndex(c => set.has(c)) + 1) : b; },
        headOf: key => key.split('|')[0],
        colorOf: key => { const [c, pos, len, rd, ix] = key.split('|'), ri = rank.get(c + rd) || 0, b0 = _lhRelColor(chars, c, pos, len);
            const base = ix && _LH_REL_REL ? 'oklch(from ' + b0 + ' l c calc(h + ' + ((+ix % 3) - 1) * 24 + '))' : b0;   // 細拆的星系：照第幾字轉一點色相
            if (!ri) return base;
            const dl = [0, 0.14, -0.14, 0.24, -0.24][Math.min(ri, 4)], dh = ri % 2 ? 18 : -18;
            return _LH_REL_REL ? 'oklch(from ' + base + ' calc(l + ' + dl + ') c calc(h + ' + dh + '))'
                : 'color-mix(in oklab, ' + base + ' ' + (100 - 15 * Math.min(ri, 4)) + '%, var(' + (dl > 0 ? '--text-primary' : '--text-secondary') + '))'; } });
}
// 篩選：不符合的星系（和流星）收回中心淡出，符合的綻放回來；不重排
const _lhRelOk = k => { const { pos, len } = _lhRel, P = { head: '首', tail: '尾' }[pos]; return !!k && (!P || k.pos === P) && (!len.size || len.has(k.len)); };
// Andy 0.98.22.11：按了字首／字尾／字數，這個宇宙沒有符合的星系、別的宇宙有 → 直接星際穿越過去（符合的第一個宇宙）
function _lhRelFind() {
    const cfg = _lhSp.cfg;
    if (_lhRelApply(false, true) || !cfg || !cfg.rel || !cfg.catOf) return;
    const pages = _lhSpPages(cfg), cur = Math.min(cfg.page || 0, pages.length - 1);
    const hit = pages.map((pg, i) => i).find(i => i !== cur && pages[i].some(e => _lhRelOk(cfg.catOf(e))));   // 宇宙照字數排好了 → 跳到符合的第一個
    if (hit !== undefined) _lhSpWhip(hit); else showToast('沒有符合的詞，取消篩選試試');
}
function _lhRelApply(now, quiet) {
    const ok = _lhRelOk, { pos, len } = _lhRel;
    let n = 0;
    for (const w of _lhSp.words) { w.off = !!w.cat && !ok(w.cat); if (now) w.vis = w.off ? 0 : 1; if (!w.off) n++; if (w.off && w.pinned) { w.pinned = false; _lhSpPin(w); } }
    for (const [cl, b] of _lhSp.legBtns || []) b.hidden = !!cl.cat && !ok(cl.cat);
    const el = _lhSp.el;
    el.querySelectorAll('[data-pos]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.pos === pos)));
    el.querySelectorAll('[data-len]').forEach(b => b.setAttribute('aria-pressed', String(len.has(b.dataset.len))));
    _lhSpTitle(n);
    for (const cl of _lhSp.groups) cl.ver++;
    _lhSp.dirty = true;
    _lhSpClearSync();
    if (!n && !now && !quiet) showToast('這一批沒有符合的詞，換一批或取消篩選試試');
    return n;
}

// 打開星雲（或已經開著時換內容）：cfg = { list, title, rel, groupOf, headOf, colorOf }
function _lhSpShow(cfg) {
    const el = _lhSpBuild();
    const reopen = !el.hidden, oldCfg = _lhSp.cfg;
    if (!reopen && typeof lhTourAuto === 'function') lhTourAuto('space', 1800);   // 第一次打開：等詞飛進來再跑導覽
    _lhSp.cfg = cfg;
    const batches = _lhSpPages(cfg), pageN = batches.length, page = Math.min(cfg.page || 0, pageN - 1);
    // Andy（第 5 級）：凝聚過的平行宇宙，切回去不再重跑混沌——離開時把整個宇宙（詞、星系、縮放、位置）收起來，回來直接放回去；
    // 星際穿越動畫照播。關掉宇宙（lhWsClose）或換查詢就清掉，下次「顯示全部」進來照樣從頭凝聚
    if (!_lhSp.pgCache || _lhSp.pgCache.list !== cfg.list) _lhSp.pgCache = { list: cfg.list, pages: {} };
    if (reopen && _lhSpCfg().gather && oldCfg && oldCfg.list === cfg.list && (oldCfg.page || 0) !== page && _lhSp.words.length)
        _lhSp.pgCache.pages[oldCfg.page || 0] = { words: _lhSp.words, clusters: _lhSp.groups, bound: _lhSp.bound, z: _lhSp.z, px: _lhSp.px, py: _lhSp.py, bh: _lhSp.bh, bhShape: _lhSp.bhShape };
    const want = batches[page].filter(e => !_lhWs.hidden.has(e.w)), pc = _lhSpCfg().gather && _lhSp.pgCache.pages[page];
    const hit = pc && pc.words.length === want.length && (S => pc.words.every(w => S.has(w.e)))(new Set(want));   // 詞完全一樣才用（中間隱藏了詞、換了篩選就重排）
    if (pc) delete _lhSp.pgCache.pages[page];
    const { words, clusters, bound } = hit ? { words: pc.words, clusters: pc.clusters, bound: pc.bound } : _lhSpLayout(want, cfg);   // 這次隱藏過的詞換批也不回來
    _lhSp.bound = bound;
    _lhSp.groups = clusters;
    // Andy：換宇宙（換批、換查詢）黑洞跟著換——新宇宙＝新的邊界形狀、凝聚完再從一個點長出來；切回凝聚過的宇宙＝它原本那顆黑洞
    if (!reopen || !oldCfg || oldCfg.list !== cfg.list || (oldCfg.page || 0) !== page) { _lhSp.bh = hit && pc.bh || null; _lhSp.bhShape = hit && pc.bhShape || null; _lhSp.bhScr = _lhSp.bhW = null; }
    const n = words.length;
    _lhSpTitle(n);
    // 分批滑桿：超過 630 個才出現；底下的數字是每批的編號
    const pages = el.querySelector('.ws-pages'), pr = pages.querySelector('.ws-page-range');
    pages.hidden = pageN <= 1;   // 只有一批：滑桿面板藏起來（骰子／AI 在外面，照樣在）
    pr.max = String(pageN - 1); pr.value = String(page);
    pr.setAttribute('aria-valuetext', '第 ' + (page + 1) + ' 批，共 ' + pageN + ' 批');
    pages._mark();
    pages.querySelector('.ws-page-ticks').replaceChildren(...Array.from({ length: pageN }, (_, i) => {   // 數字也能按（0.98.09）
        const b = _lhWsEl('button', i === page ? 'on' : '', String(i + 1));
        b.type = 'button';
        b.setAttribute('aria-label', '第 ' + (i + 1) + ' 批');
        if (i === page) b.setAttribute('aria-current', 'true');
        b.addEventListener('click', () => { if (i !== (_lhSp.cfg.page || 0)) _lhSpWhip(i); });
        return b;
    }));
    el.querySelector('.ws-prev').hidden = page <= 0;
    el.querySelector('.ws-next').hidden = page >= pageN - 1;
    // 圖例：一欄；大類（聲調色系，或關聯詞的字）點開看底下各團，點團導覽過去
    const legend = el.querySelector('.ws-legend');
    legend.replaceChildren();
    const heads = cfg.rel ? _lhRel.chars : [1, 2, 3, 4, 5];
    // 關聯詞的團固定順序：開頭 → 中間 → 結尾；選了字首／字尾時照字數
    const relRank = k => { const [, p, l] = k.split('|'); return LH_REL_POS.indexOf(p) * 4 + LH_REL_LEN.indexOf(l) + (+k.split('|')[4] || 0) / 100; };   // 字首→中間→字尾，各自兩字→三字→四字→多字（細拆的照第幾字）
    _lhSp.legBtns = [];
    heads.forEach((h, hi) => {
        const cs = clusters.filter(cl => cl.t1 === h);
        if (cfg.rel) cs.sort((a, b) => relRank(a.key) - relRank(b.key));
        if (!cs.length) return;
        const total = cs.reduce((a, c) => a + c.n, 0);
        const head = _lhWsEl('button', 'ws-leg ws-leg-tone', (cfg.rel ? '「' + h + '」' : LH_WS_TONE_N[h - 1] + '開頭') + '(' + total + ')');
        const sub = _lhWsEl('div', 'ws-sub');
        head.type = 'button';
        head.style.setProperty('--c', LH_WS_TONE_C[(cfg.rel ? hi : h - 1) % 5]);
        head.setAttribute('aria-expanded', 'false');
        sub.hidden = true;
        head.addEventListener('click', () => { sub.hidden = !sub.hidden; head.setAttribute('aria-expanded', String(!sub.hidden)); });
        sub.append(...cs.map(cl => {
            const label = _lhSpClLabel(cl, cfg);
            const b = _lhWsEl('button', 'ws-leg', label + '(' + cl.n + ')');
            b.type = 'button';
            b.style.setProperty('--c', cl.color);
            b.title = '移到這一團';
            b.addEventListener('click', () => _lhSpGoTo(cl));
            _lhSp.legBtns.push([cl, b]);
            return b;
        }));
        legend.append(head, sub);
    });
    if (_lhSp.legOpen === undefined) _lhSp.legOpen = false;   // Andy：預設收合（舊：電腦／平板展開）；之後記住使用者的選擇
    _lhSpFxSync();
    // 關聯詞才有的「字首／字尾」（最多選一個，都不選＝任意位置）和字數（可多選）
    for (const box of el.querySelectorAll('.ws-pos')) box.hidden = !cfg.rel;
    el.querySelector('.ws-range').value = '0';
    el.querySelector('.ws-filter-cap').textContent = '常用度：不限';
    _lhSp.pins = [];
    _lhSp.chords = [];
    _lhSp.segs = [];
    _lhSp.hover = null;
    _lhSp.act = null;
    // Andy：骰子／AI 星座留在它那個宇宙——離開時用詞的文字存起來（同一次查詢、照第幾批），回來時重建；換查詢就清掉
    if (!_lhSp.conStore || _lhSp.conStore.list !== cfg.list) _lhSp.conStore = { list: cfg.list, pages: {} };
    if (oldCfg && oldCfg.list === cfg.list && _lhSp.cons) _lhSp.conStore.pages[oldCfg.page || 0] = { mode: _lhSp.mode,
        cons: Object.fromEntries(Object.entries(_lhSp.cons).map(([k, c]) => [k, { groups: c.groups.map(g => g.map(w => w.w)), segs: c.segs.map(([a, b]) => [a.w, b.w]) }])) };
    _lhSp.cons = {}; _lhSp.conSeen = {}; _lhSp.mode = null; _lhSp.cnI = -1; _lhSp.holoPin = false; _lhSp.navF = null; _lhSp.aiTok = (_lhSp.aiTok || 0) + 1;   // 骰子／AI 星座只屬於這次宇宙
    _lhSpTheme();
    _lhSp.words = words.map(it => Object.assign(it, {
        w: it.e.w, p: it.e.p || 0, rgb: _lhSpColor(it.color), phon: _lhWsPhon(it.e), spr: null, tw: _lhSpWidth(it.e.w, it.s) - 22, tH: 22 * it.s,
        cat: cfg.catOf ? cfg.catOf(it.e) : null, off: false, vis: 1, wob: Math.random() * 100, hot: false, pinned: false, kept: savedWords.includes(it.e.w), dim: false, free: false, fx: 0, fy: 0, fvx: 0, fvy: 0, sx: 0, sy: 0, born: 0, mag: 1, kb: 1, twk: 0 }));
    for (const cl of clusters) { const w = _lhSp.words.find(x => x.cl === cl); cl.cat = w ? w.cat : null; }
    {   // 回到存過星座的宇宙：照詞的文字找回新的詞物件
        const sv = _lhSp.conStore.pages[cfg.page || 0], by = new Map(_lhSp.words.map(w => [w.w, w]));
        if (sv) {
            for (const [k, c] of Object.entries(sv.cons)) {
                const groups = c.groups.map(g => g.map(x => by.get(x)).filter(Boolean)).filter(g => g.length), segs = c.segs.map(([a, b]) => [by.get(a), by.get(b)]).filter(([a, b]) => a && b);
                if (groups.length) _lhSp.cons[k] = { groups, segs };
            }
            _lhSp.mode = sv.mode && _lhSp.cons[sv.mode] ? sv.mode : null;
        }
        _lhSpConSync();   // Andy bug：換宇宙後導覽列沒更新，還能導覽（前一個宇宙的）星星
    }
    // Andy（宇宙的字跟 header 長得不一樣）：查詢時已經預載（_lhSpPreFont）；還沒載完的（例如關聯詞彙直接打開），載好後整批小圖重畫一次
    { const ws = _lhSp.words;
        _lhSpPreFont(ws.map(w => w.w)).then(ready => {
            if (ready || _lhSp.words !== ws) return;   // 本來就載好了，或已經換批／關掉
            for (const w of ws) { if (w.spr) w.spr = _lhSpSprite(w, w.spr.S); w.sprB = w.sprH = null; }
            for (const cl of _lhSp.groups) cl.ver++;
            _lhSp.dirty = true;
        }); }
    // 0.98.20 Andy：進宇宙時已經是保留詞的＝直接釘住、連成星座（再點一下就照常取消釘選＋取消保留）。先用軌道位置當座標，連線才照遠近
    for (const w of _lhSp.words) if (w.kept) { const p = _lhSpPos(w); w.px = p.x; w.py = p.y; w.pinned = true; _lhSpPin(w); }
    _lhSpClearSync();
    if (cfg.rel) _lhRelApply(true);   // 篩選（字首／字尾、字數）換批也照樣套用
    // 分批浮現：一次一個星系（大的先），流星最後；字的小圖先在背景畫好，畫好的那一團才出現，不會有一幀卡很久
    // 0.98.13：大星系再切成一小份一小份（恆星和內圈先），手機不用等整團幾千個字的小圖都畫好才看得到東西；
    // 每份間隔照份數縮短，整個浮現大約 1.4–2.5 秒
    const LH_SP_PIECE = _lhSpCfg().fadeIn ? 32 : 48, q = [];   // 第 1 級一小批（0.98.20）
    // 凝聚（第 4、5 級）：所有星系的恆星一起先浮現（各在自己的位置，不特別置中），行星之後才一份份聚過來
    const starFirst = _lhSpCfg().gather;
    if (starFirst) { const st = _lhSp.words.filter(w => w.star); st.lead = 0; q.push(st); }   // 0.98.14.14：行星跟恆星同時出發（亂撒在畫面外＋慢起步，實際會落在恆星浮現的後半段才進畫面）
    for (const cl of clusters) { const g = _lhSp.words.filter(w => w.cl === cl && !(starFirst && w.star)); for (let i = 0; i < g.length; i += LH_SP_PIECE) q.push(g.slice(i, i + LH_SP_PIECE)); }
    const cm = _lhSp.words.filter(w => w.comet);
    for (let i = 0; i < cm.length; i += LH_SP_PIECE) q.push(cm.slice(i, i + LH_SP_PIECE));
    _lhSp.queue = q;
    _lhSp.gap = Math.max(16, Math.min(140, 1400 / Math.max(1, q.length)));
    // 第 1 級（0.98.16 Andy）：不分批綻放，小圖畫好就原位出現，整張畫布 0.9 秒淡入（換批時鏡頭一甩的動畫建得比較晚，會蓋過這個）
    // 0.98.19 Andy：
    // 第 1 級＝刻意無聊：每份固定間隔（等速），在原位從透明浮現（不綻放、整張畫布不再淡入）
    // 第 4 級＝設計好的螺旋發牌：一開始慢、越發越快（間隔照份數從長縮到很短），整段約 2 秒
    _lhSp.qi = 0; _lhSp.gapFn = null;
    const LV = _lhSpCfg();
    // 第 1 級（0.98.20 Andy）：0.98.19 的「輪流分配」整片到處亂冒、看起來很亂 → 改回跟第 2、3 級一樣一個星系一個星系、由內圈往外一小批一小批，
    // 只是不綻放、在原位從透明浮現（輪流分配版見 git 94f3f9d）
    const qn = q.length;
    if (LV.fadeIn) _lhSp.gap = Math.max(120, Math.min(260, 3200 / Math.max(1, qn)));
    if (LV.spiral && qn > 2) { const g0 = Math.max(40, Math.min(320, 2000 / (0.413 * qn))); _lhSp.gapFn = i => g0 * (0.12 + 0.88 * Math.pow(1 - i / qn, 2)); }
    _lhSp.bornAt = 0;
    _lhSp.px = 0; _lhSp.py = 0;
    _lhSp.nav = null;
    _lhSp.zLim = _lhSpZLim();
    _lhSp.z = _lhSp.z100 = Math.min(_lhSp.zLim[1], Math.max(_lhSp.zLim[0], _lhSpFitZoom(_lhSp.words)));   // 打開時的縮放也夾在字大小的範圍裡
    _lhSp.zAcc = _lhSp.pAcc = _lhSp.gD = 0; _lhSp.slices = _lhSp.slCur = null; _lhSp.zPrev = _lhSp.pxPrev = _lhSp.pyPrev = undefined;   // 換宇宙重設縮放、位置：不算成「動很快」
    _lhSp.dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (hit) { _lhSp.z = pc.z; _lhSp.px = pc.px; _lhSp.py = pc.py; }   // 回到離開時的縮放、位置
    _lhSp.S = _lhSp.S0 = Math.min(LH_SP_SMAX, _lhSpBucket(_lhSp.z * _lhSp.dpr));
    if (hit) {   // 凝聚過的宇宙：全部直接是完成的樣子（小圖現在一次畫好，穿越動畫蓋著看不到）
        const now = _lhSpNow();
        for (const w of _lhSp.words) { w.spr = _lhSpSprite(w, _lhSp.S); w.born = now - 5000; w.gx0 = w.gy0 = 0; w.gk = 0; w.gHold = false; w.free = false; }
        for (const cl of _lhSp.groups) { if (!cl.gDoneT) cl.gDoneT = now - 10000; cl.gGlowT = cl.gGlowT || now - 60000; cl.gF = 0; cl.gWait = 0; cl.ver++; }
        _lhSp.queue = [];
    }
    _lhSp.dirty = true;
    if (reopen) {   // 已經開著（換字首／字尾、換一批）：直接換內容、重新浮現
        el.hidden = false;
        _lhSp.visible = true;
        _lhSpApplyView();
        _lhSpLegSync();
        _lhSp.t0 = _lhSpNow();
        return;
    }
    // 打開的順序：三塊面板先慢慢收走（1.2 秒）→ 只剩背景（飄字變很淡）→ 星雲淡入、一團團浮現。
    // 面板收走的這段時間，背景已經在畫字的小圖（星雲層還藏著），面板走完就能直接浮現
    // 小螢幕（短邊 < 600px，手機直放橫放都算）：左上面板預設收合（0.98.12 Andy）
    { const pn = el.querySelector('.ws-panel'), min = Math.min(innerWidth, innerHeight) < 600, f = pn.querySelector('.ws-fold');
      pn.classList.toggle('min', min); f.setAttribute('aria-expanded', String(!min)); f.title = min ? '展開面板' : '收合面板'; f.setAttribute('aria-label', f.title); }
    _lhSpLegSync();
    _lhSp.back = document.activeElement;
    _lhSp.visible = false;
    for (const id of ['leftPanel', 'mainContainer', 'rightPanel', 'mobileTabBar']) { const p = document.getElementById(id); if (p) p.inert = true; }
    if (typeof lhBgFxFaint === 'function') lhBgFxFaint(true);
    document.body.classList.add('ws-anim', 'ws-in', 'ws-leave');
    clearTimeout(_lhSp.tm);
    _lhSp.t0 = _lhSpNow();
    _lhSp.last = 0;
    cancelAnimationFrame(_lhSp.raf);
    _lhSp.raf = requestAnimationFrame(_lhSpFrame);
    _lhSp.tm = setTimeout(() => {
        el.hidden = false;
        document.body.classList.remove('ws-in');
        _lhSpResize();
        _lhSp.visible = true;
        _lhSp.dirty = true;
        _lhSpApplyView();
        _lhSpLegSync();
        requestAnimationFrame(() => document.body.classList.add('ws-open'));
        el.querySelector('.ws-close').focus({ preventScroll: true });
    }, _lhSpReduce.matches ? 0 : 1200);
    document.addEventListener('keydown', _lhSpKey, true);
}

function lhWsClose() {
    if (!_lhSp.el || !document.body.classList.contains('ws-leave')) return;
    const el = _lhSp.el, fast = _lhSpReduce.matches;
    document.removeEventListener('keydown', _lhSpKey, true);
    _lhSp.bhHov = false; _lhSpClk.k = 1; window.__lhTimeK = 1;   // 關掉時一定回到正常速度
    // 收起的順序反過來：星雲先淡出 → 三塊面板回來
    document.body.classList.remove('ws-open', 'ws-in');
    clearTimeout(_lhSp.tm);
    _lhSp.tm = setTimeout(() => {
        el.hidden = true;
        cancelAnimationFrame(_lhSp.raf); _lhSp.raf = 0;
        { const vd = el.querySelector('.ws-void'); if (vd) { vd.hidden = true; vd.querySelectorAll('.ws-vw').forEach(x => x.remove()); } cancelAnimationFrame(_lhSp.vRaf); el.classList.remove('ws-in-void', 'ws-voiding'); }
        _lhSp.words = []; _lhSp.queue = []; _lhSp.pgCache = null; _lhSp.bh = _lhSp.bhShape = null; _lhSp.pins = [];   // bh：下次進宇宙黑洞重新隨機起點 _lhSp.chords = []; _lhSp.segs = []; _lhSp.hover = _lhSp.act = null;   // 0.98.09：放掉每個詞的小圖、星系圖（下次打開會重建）
        document.body.classList.remove('ws-leave');
        for (const id of ['leftPanel', 'mainContainer', 'rightPanel', 'mobileTabBar']) { const p = document.getElementById(id); if (p) p.inert = false; }
        if (typeof syncCenterPanel === 'function') syncCenterPanel();   // 收起的面板要回到 inert（syncCenterPanel 是唯一管 inert 的地方）
        if (typeof lhBgFxFaint === 'function') lhBgFxFaint(false);
        if (_lhSp.back && _lhSp.back.isConnected) _lhSp.back.focus({ preventScroll: true });
        _lhSp.tm = setTimeout(() => { if (!document.body.classList.contains('ws-leave')) document.body.classList.remove('ws-anim'); }, fast ? 0 : 550);
    }, fast ? 0 : 380);
    // 隱藏只在這次星雲裡有效（0.98.09）：關掉就全部還原，詞卡清單也跟著恢復
    _lhWs.hidden.clear();
    if (_lhWs.input && lhWsQuery(document.getElementById('searchInput').value)) lhWsRender(_lhWs.input);
}

function _lhSpKey(e) {
    if (e.key === 'Escape' && !e.isComposing) { e.preventDefault(); e.stopPropagation(); if (_lhSp.el && _lhSp.el.classList.contains('ws-in-void')) _lhSpVoid(false); else lhWsClose(); return; }   // 在虛無裡：Esc 先回宇宙
    // Andy：左右方向鍵＝導覽上一顆／下一顆星（跟導覽列 ◀ ▶ 一樣）；焦點在輸入框、滑桿上時不搶（滑桿要用方向鍵調）
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.altKey && !e.ctrlKey && !e.metaKey && !e.isComposing) {
        const tg = e.target, nav = _lhSp.el && _lhSp.el.querySelector('.ws-cnav');
        if (tg && tg.closest && tg.closest('input, textarea, select, [contenteditable="true"]')) return;
        if (!nav || nav.hidden || !_lhSpConOrder().length) return;
        e.preventDefault(); _lhSpConNav(e.key === 'ArrowLeft' ? -1 : 1);
    }
}

function _lhSpApplyView() {
    _lhSp.dirty = true;
    const b = _lhSp.el.querySelector('.ws-pct');
    if (b) b.textContent = Math.round(_lhSp.z / _lhSpZ100() * 100) + '%';
}

// ===== canvas：尺寸、顏色、字的小圖 =====
function _lhSpResize() {
    const el = _lhSp.el, cv = _lhSp.cv;
    if (!el || !cv) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    _lhSp.dpr = dpr; _lhSp.W = el.clientWidth; _lhSp.H = el.clientHeight;
    cv.width = Math.max(1, Math.round(_lhSp.W * dpr));
    cv.height = Math.max(1, Math.round(_lhSp.H * dpr));
    _lhSp.dirty = true;
}
const _lhSpColors = new Map();
// 任何 CSS 顏色（rgb、oklch、color-mix…）加透明度：先在 1×1 畫布上畫一次讀回 RGB（快取），再組 rgba(…)。
// 不能直接改字串：主題色算出來可能是 oklch(…)，硬改會變成不合法的顏色、整格畫不出來（0.98.09 的 bug）
const _lhSpRgbC = new Map();
function _lhSpRGBA(css, a) {
    let v = _lhSpRgbC.get(css);
    if (!v) {
        const x = (_lhSpRGBA.c || (_lhSpRGBA.c = document.createElement('canvas').getContext('2d', { willReadFrequently: true })));
        x.clearRect(0, 0, 1, 1); x.fillStyle = '#000'; x.fillStyle = css; x.fillRect(0, 0, 1, 1);
        const d = x.getImageData(0, 0, 1, 1).data;
        _lhSpRgbC.set(css, v = d[0] + ', ' + d[1] + ', ' + d[2]);
    }
    return 'rgba(' + v + ', ' + a + ')';
}
// 煙霧小圖用的近似色：每個詞顏色幾乎都不一樣（543 詞＝528 色），一色一套小圖會塞爆快取、一直重做 → 閃爍。每色頻道歸到 56 一階（軟煙看不出差）
const _lhSpSmRgbC = new Map();
function _lhSpSmRGB(css) {
    let v = _lhSpSmRgbC.get(css);
    if (!v) { const q = _lhSpRGBA(css, 1).match(/\d+/g).slice(0, 3).map(n => Math.min(255, Math.round(n / 56) * 56)); _lhSpSmRgbC.set(css, v = 'rgb(' + q.join(',') + ')'); }
    return v;
}
// 光帶漸層用：透明度歸到 1/128 階、字串快取（每格幾千個顏色點，不必每次重組字串）
const _lhSpRGBAqC = new Map();
function _lhSpRGBAq(css, a) {
    const k = Math.round(a * 128);
    let arr = _lhSpRGBAqC.get(css);
    if (!arr) { if (_lhSpRGBAqC.size > 2000) _lhSpRGBAqC.clear(); _lhSpRGBAqC.set(css, arr = []); }
    return arr[k] || (arr[k] = _lhSpRGBA(css, k / 128));
}
function _lhSpColor(css) {
    if (!_lhSpColors.has(css)) { _lhSp.probe.style.color = css; _lhSpColors.set(css, getComputedStyle(_lhSp.probe).color); }
    return _lhSpColors.get(css);
}
// 主題的顏色、字型（每次打開重讀：可能換過主題）
function _lhSpTheme() {
    _lhSpColors.clear();
    const pr = _lhSp.probe;
    pr.style.fontFamily = 'var(--font-serif)';   // Andy：跟 header「韻腳查詢器」同一套（粗明體 Noto Serif TC 700，小圖用 700 畫）
    _lhSp.font = getComputedStyle(pr).fontFamily;
    _lhSp.cCard = _lhSpColor('var(--card-bg)');
    _lhSp.cLine = _lhSpColor('var(--highlight-border)');
    _lhSp.lineFor = _lhSp.lineCur = null;   // 換主題：星座線顏色重算、不從舊顏色漸層
    _lhSp.cMute = _lhSpColor('var(--text-secondary)');
    // 骰子／AI 星座線：跟按鈕亮的顏色一樣（css/base.css --con-dice 黃、--con-ai 綠，所有主題共用）
    const rs = getComputedStyle(document.documentElement);
    _lhSp.cDice = _lhSpColor(rs.getPropertyValue('--con-dice').trim() || 'hsl(48 92% 60%)'); _lhSp.cAi = _lhSpColor(rs.getPropertyValue('--con-ai').trim() || 'hsl(140 68% 52%)');
}
// 字的小圖（字＋淡淡光暈）照某個縮放畫好，每一幀只要貼上去。
// 縮放時先拿舊的小圖放大縮小頂著；手停下來（160ms）才在背景照新縮放把整批畫好，全部畫好再一次換上去（不會一半新一半舊、也不卡）
const _lhSpBucket = z => Math.pow(2, Math.round(Math.log2(Math.max(0.1, z)) * 2) / 2);
function _lhSpSprite(w, S) {
    const fs = 16 * w.s * S, pad = Math.ceil(fs * 0.85);   // 0.98.18：0.6→0.85，光暈（模糊半徑 0.5 字高）不再被小圖邊緣切成方框
    const m = _lhSp.ctx;
    m.font = '700 ' + fs + 'px ' + _lhSp.font;
    const tw = m.measureText(w.w).width;
    const c = document.createElement('canvas');
    c.width = Math.ceil(tw + pad * 2); c.height = Math.ceil(fs * 1.4 + pad * 2);
    const g = c.getContext('2d');
    g.font = '700 ' + fs + 'px ' + _lhSp.font;
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    g.fillStyle = w.rgb;
    g.shadowColor = w.rgb;
    g.shadowBlur = fs * 0.5;
    g.globalAlpha = 0.35;
    g.fillText(w.w, c.width / 2, c.height / 2);
    g.shadowBlur = 0;
    g.globalAlpha = 1;
    g.fillText(w.w, c.width / 2, c.height / 2);
    c.S = S;
    w.tw = tw / S; w.tH = fs * 1.4 / S;
    return c;
}

// 字的小圖的模糊版（凝聚中的行星對焦用）：四周多留模糊半徑 2 倍的邊，不會被切成方框；小圖換了（縮放重畫）才重做
function _lhSpBlurSpr(w, lv) {   // lv 1～3：小糊、中糊、大糊（大糊＝字高 × gather.blur）
    const sp = w.spr, r = 16 * w.s * sp.S * LH_SP_TUNE.gather.blur * [0, 0.2, 0.5, 1][lv], B = w.sprB || (w.sprB = []);
    if (B[lv] && B[lv].src === sp && B[lv].r === r) return B[lv];
    const pad = Math.ceil(r * 2), c = document.createElement('canvas');
    c.width = sp.width + pad * 2; c.height = sp.height + pad * 2;
    const g = c.getContext('2d');
    g.filter = 'blur(' + r + 'px)'; g.drawImage(sp, pad, pad);
    c.src = sp; c.r = r;
    return (B[lv] = c);
}
// 世界座標 ↔ 畫面座標（相對星雲左上角）：畫面點 = 中心 + p + 世界點 × z
// 畫面上真正用的縮放＝縮放 × 整片呼吸（第 1 級）
const _lhSpZv = () => _lhSp.z * (_lhSp.zb || 1);
const _lhSpScr = (x, y) => { const z = _lhSpZv(); return { x: _lhSp.W / 2 + _lhSp.px + x * z, y: _lhSp.H / 2 + _lhSp.py + y * z }; };
// 黑洞魚眼（Andy：保底 14 號字放大後全擠在一起）：詞在畫面上的位置＝原位置＋魚眼推開量（w.fox／w.foy，下面 dock 段算）
function _lhSpWS(w) { const p = _lhSpScr(w.px || 0, w.py || 0); if (w.fox || w.foy) { p.x += w.fox || 0; p.y += w.foy || 0; } return p; }
function _lhSpScreenOf(w) {   // 測試、按鈕定位用：詞在畫面上的位置（client 座標）
    const r = _lhSp.el.getBoundingClientRect(), p = _lhSpWS(w);
    return { x: r.left + p.x, y: r.top + p.y };
}

// 以畫面上 (cx, cy)（相對左上角，省略＝中心）為中心縮放；世界原點在畫面中心：畫面點 = 中心 + p + 世界點 × z
function _lhSpZoom(z, cx, cy) {
    const el = _lhSp.el;
    const [zLo, zHi] = _lhSp.zLim || [LH_SP_ZMIN, LH_SP_ZMAX];
    z = Math.min(zHi, Math.max(zLo, z));
    if (cx === undefined) { cx = el.clientWidth / 2; cy = el.clientHeight / 2; }
    const ox = el.clientWidth / 2, oy = el.clientHeight / 2;
    const wx = (cx - ox - _lhSp.px) / _lhSp.z, wy = (cy - oy - _lhSp.py) / _lhSp.z;
    _lhSp.z = z;
    _lhSp.zt = _lhSpNow();
    _lhSp.px = cx - ox - wx * z;
    _lhSp.py = cy - oy - wy * z;
    _lhSp.nav = null; _lhSp.navF = null;   // 手動縮放：不再跟著導覽的星
    _lhSpApplyView();
}

// 導覽到某一團：0.6 秒緩緩平移過去（縮放不變）
function _lhSpGoTo(cl) {
    _lhSp.nav = { t0: _lhSpNow(), fx: _lhSp.px, fy: _lhSp.py, tx: -cl.x * _lhSp.z, ty: -cl.y * _lhSp.z };
}

function _lhSpToWorld(x, y) {
    const r = _lhSp.el.getBoundingClientRect();
    const z = _lhSpZv();
    return { x: (x - r.left - r.width / 2 - _lhSp.px) / z, y: (y - r.top - r.height / 2 - _lhSp.py) / z };
}

// 詞現在的世界座標（不含開場散開）
function _lhSpPos(w) {
    if (w.free) return { x: w.fx, y: w.fy };
    if (w.comet) return { x: w.x, y: w.y };
    return _lhSpOrbit(w);
}

// 背景動畫與特效的等級（偏好設定 → 外觀，js/bgfx.js lhFxLevel；系統要求減少動態＝0：完全靜止）。
// 0.98.08 照 Andy 在「星雲效果分級表」（https://claude.ai/artifact/NUoEJt5851vJEZdNq814Mf）勾的：
// fps＝每秒畫幾格（0＝有變化才畫）；orbit＝軌道轉速倍率（0＝不轉）；jitter＝同一圈的隨機偏移（水彩感，打開時排版就決定）；
// wobble＝行星呼吸晃動；drift＝恆星飄移；push＝星系互斥；comet＝流星移動（走微彎的弧線）；tail＝流星尾巴；cometGlow＝流星加亮；
// drag：'stay'＝拖到哪就停在哪（拖恆星整團一起走）、'fling'＝甩出去再被拉回（拖恆星沖散整團）；
// dock＝黑洞放大；bold＝停住的詞變粗發光（外框照樣有）；keptGlow／keptFlash／keptBreathe＝保留的詞加柔光／閃＋光暈／呼吸（外框每級都有）；
// keptBreathe 的值＝保留的詞呼吸時放大多少（0.06＝6%）；starGlow＝恆星自帶光暈；lineGlow／lineFlash＝星座線光暈／隨機閃爍
// img＝星系一張圖（每個星系先畫成一張圖，每格只貼約 50 張）；clBreath＝整團呼吸；whole＝整片星雲一起呼吸；twinkle＝隨機星星閃爍
// 0.98.16 起：保留詞五級一樣（外框＋柔光＋呼吸 3%）；comet＝流星會動，curve＝流星彎度倍數（0 直線）；cometPulse＝流星停著、透明度循環；
// cometHalo＝流星自帶光暈＋固定閃爍；roam＝小星系漫遊速度倍數（0 不漫遊）
const LH_SP_COARSE = matchMedia('(pointer: coarse)').matches;   // 觸控裝置（手機、平板）
const LH_SP_LV = {
    0: { fps: 0, orbit: 0, drag: 'stay', bold: 1 },   // 系統要求減少動態：完全靜止，有變化才畫
    // 第 1 級：不轉、沒變化就不畫（idle）、整片呼吸交給 CSS 縮放畫布；進宇宙整片淡入；流星是孤星，完全不動
    1: { fps: 24, idle: 1, orbit: 0, drag: 'stay', bold: 1, keptBreathe: 0.03, keptGlow: 1, cssBreath: 1, fadeIn: 1, swap: 'fade' },   // 0.98.17：換批也原地淡出淡入
    // 第 2 級：星系一張圖；放手會滑（拖恆星仍整團搬）；星座線固定光暈；換批淡出淡入；流星停著、透明度慢慢循環
    2: { fps: 24, orbit: 0, drag: 'fling', starStay: 1, dock: 1, keptBreathe: 0.03, keptGlow: 1, img: 1, clBreath: 1, lineGlow: 'still', swap: 'fade', cometPulse: 1 },
    // 第 3 級：公轉 0.6 倍、少量閃爍（只亮不放大）；流星走直線；小星系不漫遊
    3: { fps: 30, orbit: 0.6, drag: 'fling', dock: 1, comet: 1, curve: 0, tail: 1, cometGlow: 1, keptBreathe: 0.03, keptGlow: 1, whole: 1, twinkle: 0.4, twFlat: 1, starGlow: 1 },   // 0.98.21 Andy：第 3 級恆星也有光暈
    // 第 4 級：分批浮現（螺旋發牌）、縮放殘影、恆星光暈；流星原本的彎度；小星系漫遊
    4: { fps: 30, orbit: 1, drag: 'fling', dock: 1, spiral: 1, comet: 1, curve: 1, roam: 1, tail: 1, cometGlow: 1, keptBreathe: 0.03, keptGlow: 1, jitter: 1, wobble: 1, drift: 1, push: 1, twinkle: 1, starGlow: 1, whole: 1, lineGlow: 1, zoomTrail: 1 },
    // 第 5 級：混沌凝聚獨有、常駐殘影、星座線常閃；流星彎度 2.5 倍＋光暈＋固定閃爍；小星系漫遊 1.8 倍速
    5: { fps: LH_SP_COARSE ? 30 : 60, orbit: 1,   /* Andy：手機第 5 級固定每秒 30 格（效能實測 0.98.22.11：模擬手機只跑到 9～20 格） */ drag: 'fling', dock: 1, comet: 1, curve: 2.5, roam: 1.8, tail: 1, cometGlow: 1, cometHalo: 1, keptBreathe: 0.03, keptGlow: 1, jitter: 1, wobble: 1, drift: 1, push: 1, twinkle: 1, starGlow: 1, clBreath: 1, lineGlow: 1, lineFlash: 0.4, zoomTrail: 2, gather: 1, starFx: 1, sand: 1 },
};
const _lhSpCfg = () => LH_SP_LV[_lhSpReduce.matches ? 0 : (typeof lhFxLevel === 'function' ? lhFxLevel() : 5)] || LH_SP_LV[5];

// 點到哪個詞（client 座標）：上層（停住、釘住）先找；淡掉的、還沒浮現的不算。停住的詞往上多算一截，滑到它上面的按鈕不會掉
function _lhSpHit(cx, cy) {
    const p = _lhSpToWorld(cx, cy), z = _lhSp.z;
    const inside = w => {
        const m = w.mag || 1, hw = ((w.tw || 0) / 2 + 9 * w.s) * m, hh = (w.tH || 22 * w.s) / 2 * m;
        const up = w.hot || w.pinned || w === _lhSp.hover ? 26 / z : 0;   // 滑到隱藏鈕的路上不掉
        // 0.98.41 Andy：飛行中（甩出去、正在回家）的行星，判定框順著速度往前後各多算 grab.lead 秒的路（最多畫面 80px），手指追得上
        const ld = w.free && !w.star && !w.comet ? LH_SP_TUNE.grab.lead : 0, ex = ld ? Math.min(80 / z, Math.abs(w.fvx || 0) * ld) : 0, ey = ld ? Math.min(80 / z, Math.abs(w.fvy || 0) * ld) : 0;
        return Math.abs(p.x - w.px) <= hw + ex && p.y - w.py <= hh + ey && w.py - p.y <= hh + up + ey;
    };
    // 黑洞放大會讓鄰居放大後蓋住游標下的詞：重疊時選中心離游標最近的那個（停住／釘住的優先）
    let best = null, bd = Infinity;
    for (const w of _lhSp.words) {
        if (!w.born || w.dim || w.off || w.cmWait || !inside(w)) continue;
        const d = Math.hypot(p.x - w.px, p.y - w.py) - ((w.hot || w.pinned) ? 1e6 : 0);
        if (d < bd) { bd = d; best = w; }
    }
    return best;
}

// 分批浮現：照 _lhSp.queue 一團團畫小圖（每幀最多 40 張），一團畫好、離上一團至少 gap 毫秒就讓它出現。回傳還有沒有沒浮現的
function _lhSpReveal(t) {
    const q = _lhSp.queue;
    if (!q || !q.length) return false;
    const t1 = performance.now();   // 每幀最多花 6ms 畫小圖
    outer: for (const g of q) for (const w of g) {
        if (performance.now() - t1 > 6) break outer;
        if (!w.spr) w.spr = _lhSpSprite(w, _lhSp.S);
    }
    if (_lhSp.visible && q[0].every(w => w.spr) && t - _lhSp.bornAt >= (_lhSp.gapFn ? _lhSp.gapFn(_lhSp.qi || 0) : _lhSp.gap)) {
        const g = q.shift();
        _lhSp.qi = (_lhSp.qi || 0) + 1;
        for (const w of g) w.born = t;
        _lhSp.bornAt = t + (g.lead || 0);
    }
    return true;
}

// 縮放停下來之後：照新縮放在背景把整批小圖畫好（每幀 30 張），全部好了一次換上。回傳還在畫
// 縮放後換小圖的解析度（0.98.15.5 記憶體修正）：以前放大時把「每一個」詞（含畫面外）重畫成高解析小圖，
// 放到最大時「不」1466 詞要 700 MB，手機 Safari 超過畫布上限就整頁重載。現在：
// 1. 只有畫面裡＋外圍 1/4 的詞用目前倍率；畫面外的維持打開時的倍率（_lhSp.S0，很小）
// 2. 倍率上限：觸控裝置 4、滑鼠 6（實際 z × dpr；再大就拿現有小圖放大，略糊但不爆記憶體）
// 3. 一個詞一個詞直接換（不再兩套小圖同時存在）；手還在拖、捏時先不畫，每格最多花 4ms，平移時陸續補
const LH_SP_SMAX = matchMedia('(pointer: coarse)').matches ? 4 : 6;
function _lhSpRescale(t) {
    const Sv = Math.min(LH_SP_SMAX, _lhSpBucket(_lhSp.z * (_lhSp.dpr || 1))), Sb = Math.min(Sv, _lhSp.S0 || Sv);
    if (t - (_lhSp.zt || 0) < 160 || _lhSp.pts.size) return Sv !== _lhSp.S;
    _lhSp.S = Sv;
    const W = _lhSp.W, H = _lhSp.H, mx = W * 0.25, my = H * 0.25, t1 = performance.now();
    let left = false;
    for (const w of _lhSp.words) {
        if (!w.spr) continue;   // 還沒浮現的詞由 _lhSpReveal 負責
        const p = _lhSpScr(w.px || 0, w.py || 0), want = p.x > -mx && p.x < W + mx && p.y > -my && p.y < H + my ? Sv : Sb;
        if (w.spr.S === want) continue;
        if (performance.now() - t1 > 4) { left = true; break; }
        w.spr = _lhSpSprite(w, want);
        _lhSp.rsDirty = _lhSp.dirty = true;
    }
    // 這一輪都換完才讓星系圖（第 2 級）重畫一次，不會每格重畫、也不會停在一半舊一半新
    if (!left && _lhSp.rsDirty) { _lhSp.rsDirty = false; for (const cl of _lhSp.groups) cl.ver++; }
    return left;
}

function _lhSpFrame(tr) {
    _lhSp.raf = requestAnimationFrame(_lhSpFrame);
    {   // 時間放慢：目標倍速 1／(1/bh.slow)，約 0.25 秒平滑過去；CSS 動畫（黑洞光環、呼吸）一起放慢
        const C = _lhSpClk, el = _lhSp.el, bhEl = el && el.querySelector('.ws-bh');
        const tran = !!(_lhSp.warp || el && el.matches('.ws-in-void, .ws-voiding')), slow = !tran && !!(_lhSp.bhD || (bhEl && bhEl.classList.contains('near'))), want = slow ? 1 / Math.max(1, LH_SP_TUNE.bh.slow || 1) : 1;
        const rdt = C.r ? Math.max(0, Math.min(0.1, (tr - C.r) / 1000)) : 0;
        _lhSpNow(tr);
        const k0 = C.k; C.k = Math.abs(want - C.k) < 0.002 ? want : C.k + (want - C.k) * (1 - Math.exp(-rdt * 3 / Math.max(0.05, LH_SP_TUNE.bh.slowT || 0.75)));   if (tran) C.k = 1;   // 0.98.41：穿越、進出虛無一律正常速度（轉場動畫不能被放慢）   // slowT 秒內約 95% 到位（煞車、放開一樣長）
        if (el && (C.k !== k0 || C.k !== 1)) { if (Math.abs(C.k - (_lhSp.cssK ?? 1)) > 0.01 || (C.k === 1 && _lhSp.cssK !== 1)) { _lhSp.cssK = C.k; for (const a of el.getAnimations({ subtree: true })) if (!(typeof CSSTransition !== 'undefined' && a instanceof CSSTransition)) a.playbackRate = C.k; } _lhSp.dirty = true; }   // 轉場（hover 放大等）不放慢
        window.__lhTimeK = C.k;   // 背景飄字（js/bgfx.js）也跟著放慢
    }
    const t = _lhSpClk.v;
    if (_lhSp.visible) _lhSpBhDrift(t);   // 黑洞沿邊漂（不畫畫布的格子也照漂）
    const L = _lhSpCfg();
    // 省電：照等級限制每秒畫幾次；第 1、2 級沒變化就完全不畫
    if (_lhSp.el && _lhSp.el.classList.contains('ws-breathe') !== !!L.cssBreath) _lhSp.el.classList.toggle('ws-breathe', !!L.cssBreath);
    if (L.fps ? tr - (_lhSp.lastDraw || 0) < 1000 / L.fps - 4 || (L.idle && !_lhSp.dirty && !_lhSp.busy) : !_lhSp.dirty && !_lhSp.busy) return;   // 每秒幾格照真實時間（放慢時畫面照樣順）
    _lhSp.lastDraw = tr;
    _lhSp.dirty = false;
    const dt = _lhSp.last ? Math.min((t - _lhSp.last) / 1000, 0.05) : 0;
    _lhSp.last = t;
    let busy = _lhSpReveal(t);
    if (_lhSp.visible && _lhSpRescale(t)) busy = true;
    // 導覽到的星（navF）：盡量留在畫面中間附近，但不釘死在正中央——離中心超過一小圈（短邊 12%）才慢慢把鏡頭帶過去，圈內隨它飄
    if (_lhSp.navF && !_lhSp.nav) {
        const w = _lhSp.navF;
        if (!_lhSp.words.includes(w)) _lhSp.navF = null;
        else {
            const sx = w.px * _lhSp.z + _lhSp.px, sy = w.py * _lhSp.z + _lhSp.py, d = Math.hypot(sx, sy), R = Math.min(_lhSp.W, _lhSp.H) * 0.12;
            if (d > R && dt) { const f = (1 - Math.exp(-dt * 1.5)) * (d - R) / d; _lhSp.px -= sx * f; _lhSp.py -= sy * f; _lhSpApplyView(); }
            busy = true;   // 閃爍要一直畫
        }
    }
    if (_lhSp.nav) {   // 導覽：緩出
        const nv = _lhSp.nav, k = Math.min(1, (t - nv.t0) / (nv.ms || 600)), e = nv.w ? k * k * (3 - 2 * k) : 1 - Math.pow(1 - k, 3);
        if (nv.w) { nv.tx = -nv.w.px * _lhSp.z; nv.ty = -nv.w.py * _lhSp.z; }   // 星座導覽：目標星還在公轉，每格重算
        _lhSp.px = _lhSp.nav.fx + (_lhSp.nav.tx - _lhSp.nav.fx) * e;
        _lhSp.py = _lhSp.nav.fy + (_lhSp.nav.ty - _lhSp.nav.fy) * e;
        _lhSpApplyView();
        if (k >= 1) {
            if (nv.w) _lhSp.navF = nv.w;   // 0.98.22.11 Andy：到站後鏡頭鬆鬆地跟著這顆星（見下面），而且它會閃
            // 0.98.22.11 Andy：字小到認不出來時（字高 < 14px），導覽到的星直接浮出全息標籤（點空白或導覽到下一顆才收；滑鼠移動不收）
            if (nv.w && 16 * nv.w.s * _lhSpZv() < 14) { _lhSp.holoPin = true; _lhSp.holo = null; _lhSpHolo(nv.w); }
            _lhSp.nav = null;
        }
        busy = true;
    }
    const T = (t - _lhSp.t0) / 1000;
    // 小星系漫遊（第 3 級起，跟流星一樣）：家的位置沿直線走，出了邊界從對面回來
    // 0.98.16 Andy：滑鼠停在恆星上（看全息標籤）時，那一團不飄、不漫遊、不被推，免得自己跑出游標範圍；
    // 停住期間累計 tOff，飄移時間扣掉它 → 放開後從原地接著飄，不會跳一下
    // 0.98.18.2 Andy：滑鼠看行星的面板時恆星照常旅行，只有看恆星時整團停；
    // 0.98.18.4 Andy：觸控時恆星、行星、流星一碰到就定格（連同整團，不然整團還在飄，手指下的字一樣會跑掉）
    const hw = _lhSp.holo && _lhSp.holo.w, tw0 = _lhSp.drag && _lhSp.drag.touch && !_lhSp.drag.moved && _lhSp.drag.w;
    const hc = (hw && hw.star && hw.cl) || (tw0 && tw0.cl);
    if (hc && dt) hc.tOff = (hc.tOff || 0) + dt;
    if (L.roam && dt) {   // 0.98.16：第 3 級不漫遊（跟第 4 級拉開差別），第 5 級 1.8 倍速
        for (const cl of _lhSp.groups) {
            if (!cl.vx || cl.held || cl === hc) continue;
            // 0.98.22.11 Andy：不再直線走、出界從對面冒出來（行星會被彈簧硬拉過整個畫面）→ 改成繞宇宙中心公轉，大圓／橢圓，速度是原本直線的一半。
            // 每格把「(x, y÷扁率)」繞中心轉一個小角度再還原＝沿著通過目前位置的橢圓走；被推開時軌道跟著換，不會跳
            if (!cl.oe) cl.oe = 0.55 + Math.random() * 0.45;
            const ex = cl.hx, ey = cl.hy / cl.oe, A = Math.hypot(ex, ey);
            if (A > 1) {
                const da = (cl.dir || 1) * Math.hypot(cl.vx, cl.vy) * (LH_SP_TUNE.roam[cl.roamK] ?? 10) * L.roam * dt / A, c = Math.cos(da), sn = Math.sin(da);
                cl.hx = ex * c - ey * sn; cl.hy = (ex * sn + ey * c) * cl.oe;
            }
            if (!L.drift) { cl.x = cl.hx; cl.y = cl.hy; }
        }
    }
    // 恆星在自己的範圍裡慢慢飄（被拖著的那團跟著恆星走）
    if (L.drift) for (const cl of _lhSp.groups) if (!cl.held && cl !== hc) { const Tc = T - (cl.tOff || 0); cl.x = cl.hx + _lhSpDx(cl, Tc); cl.y = cl.hy + _lhSpDy(cl, Tc); }
    // 兩團靠太近：慢慢互相推開（約 12 秒推到位）；被拖著的那團不動，另一團讓開
    if (L.push && dt) {
        const G = _lhSp.groups, kp = 1 - Math.exp(-dt / 4);
        for (let i = 0; i < G.length; i++) for (let j = i + 1; j < G.length; j++) {
            const a = G[i], b = G[j], ah = a.held || a === hc, bh = b.held || b === hc, dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
            const over = a.r + b.r + 30 - d;
            if (over <= 0 || (ah && bh)) continue;
            const m = over * kp, ux = dx / d, uy = dy / d, fa = ah ? 0 : bh ? 1 : 0.5, fb = 1 - fa;
            a.hx -= ux * m * fa; a.hy -= uy * m * fa; b.hx += ux * m * fb; b.hy += uy * m * fb;
            if (!ah) { a.x -= ux * m * fa; a.y -= uy * m * fa; }
            if (!bh) { b.x += ux * m * fb; b.y += uy * m * fb; }
        }
    }
    let gv = 0; const fr = Math.exp(-dt * 3.2),   /* 0.98.16 Andy：甩太遠 → 摩擦 2.2→3.2（滑行距離約剩 7 成） */ damp = Math.exp(-dt * 0.53), K = 0.155, B = _lhSp.bound, drag = _lhSp.drag && _lhSp.drag.w, dg = _lhSp.drag;
    // 黑洞放大：游標附近 240px 內的詞依距離放大，最近的約 2.3 倍，放大縮小都是緩動
    const dock = L.dock, mk = 1 - Math.exp(-dt * 14), mouse = _lhSp.mouse, TAU = Math.PI * 2;
    // 整片星雲一起呼吸（第 1 級）：畫面縮放跟著輕輕放大縮小，6 秒一輪
    // 0.98.21 Andy：切換等級時大小會跳（各級的呼吸不一樣）→ 呼吸的幅度 1 秒內平順過渡到新等級的值，不會一下子縮放
    const bk = dt ? 1 - Math.exp(-dt * 3) : 1;
    _lhSp.wWhole = (_lhSp.wWhole ?? (L.whole ? 1 : 0)) + ((L.whole ? 1 : 0) - (_lhSp.wWhole ?? (L.whole ? 1 : 0))) * bk;
    _lhSp.wCl = (_lhSp.wCl ?? (L.clBreath ? 1 : 0)) + ((L.clBreath ? 1 : 0) - (_lhSp.wCl ?? (L.clBreath ? 1 : 0))) * bk;
    if (Math.abs(_lhSp.wWhole - (L.whole ? 1 : 0)) > 0.002 || Math.abs(_lhSp.wCl - (L.clBreath ? 1 : 0)) > 0.002) busy = true;
    _lhSp.zb = 1 + 0.012 * _lhSp.wWhole * Math.sin(T * TAU / 6);
    // 整團呼吸（第 2 級）：每個星系照自己的節奏（4～7 秒一輪）輕輕放大縮小
    for (const cl of _lhSp.groups) cl.b = 1 + _lhSp.wCl * (cl.ba || 0.03) * Math.sin(T * TAU / cl.bp + cl.ph[0]);
    // 0.98.20 Andy（大風吹）：散開的行星每 0.3 秒重新分配座位，就近歸隊、不跨到對面
    if (t - (_lhSp.seatT || 0) > 300) { _lhSp.seatT = t; _lhSpSeats(); }
    for (const w of _lhSp.words) {
        const still = w.hot || w.pinned || (w === hw && (w.star || w.comet)) || (w.comet ? !L.comet : !L.orbit);
        // 0.98.22.11 Andy：滑鼠停在行星上＝0.75 秒內平順煞停（舊版公轉一下就停，但恆星照常旅行，行星還被整團帶著慢慢滑走）。
        // bk 0→1 走 0.75 秒；公轉速度 ×(1−bk)，整團移動的量也照 bk 抵掉（記在 bax／bay），放開後同樣 0.75 秒加速、偏移約 1 秒滑回軌道
        let bkS = 0;
        if (w.cl && !w.star && !w.comet) {
            const hov = w === hw && !(w.free && w.src === 'B') && w !== drag;   // Andy：拖著的、甩出去的詞歸「甩動」管，hover 煞車不碰（不然放手先頓一拍才飛）
            w.bk = Math.max(0, Math.min(1, (w.bk || 0) + (hov ? 1 : -1) * dt / 0.8));
            bkS = w.bk * w.bk * (3 - 2 * w.bk);
            const dcx = w.lcx === undefined ? 0 : w.cl.x - w.lcx, dcy = w.lcy === undefined ? 0 : w.cl.y - w.lcy;
            w.lcx = w.cl.x; w.lcy = w.cl.y;
            if (hov && !w.free) { w.bax = (w.bax || 0) - dcx * bkS; w.bay = (w.bay || 0) - dcy * bkS; }   // 甩出去／凝聚中的行星位置不跟整團走，不用抵
            else if (w.bax || w.bay) { const f = Math.exp(-dt * 3); w.bax *= f; w.bay *= f; if (Math.hypot(w.bax, w.bay) < 0.1) w.bax = w.bay = 0; }
            if (hov && w.bk >= 1) { if (!w.bkT) w.bkT = t; } else w.bkT = 0;   // 完全煞停的時間：hover 光暈從這時才開始亮
            if (w.bk > 0 || w.bax) busy = true;
        }   // hw：正在看全息標籤的那個（行星也停，0.98.18）   // 停在詞上、釘住、這一級不動的：定格
        // 混沌凝聚（第 5 級）0.98.20 Andy：改用跟「拖恆星沖散」同一套引力（彈簧＋阻尼），只是再慢一倍（剛度 1/4、阻尼 1/2，像沖散後慢慢凝結）；
        // 起點撒在自己恆星周圍、直徑＝星系直徑 2 倍的圓裡。剛浮現的詞才撒（中途切到第 5 級不會把整片打散）
        if (L.gather && !w.born && !w.comet && !w.star && w.cl) w.cl.gWait = t;   // 0.98.22.11：這團還有行星沒浮現＝凝聚還沒開始，恆星先別亮（穿越後新宇宙的恆星先亮一下又暗掉的 bug）
        if (L.gather && w.born && !w.comet && !w.star && w.cl && w.gx0 === undefined) {
            const GT = LH_SP_TUNE.gather, ra = w.cl.r * GT.scatter * Math.sqrt(0.25 + 0.75 * Math.random()), an = Math.random() * TAU;
            const oT = _lhSpOrbit(w);   // 0.98.22.11 Andy：起點散開改成以「這顆自己該在的位置」為圓心（舊版以恆星為圓心：外圈的走很遠、內圈的可能一出生就在旁邊）
            w.gx0 = oT.x + Math.cos(an) * ra; w.gy0 = oT.y + Math.sin(an) * ra;
            if (t - w.born < 500 && !w.free && w !== drag) {
                Object.assign(w, { free: true, fx: w.gx0, fy: w.gy0, fvx: 0, fvy: 0, gk: Math.max(0.05, 1 - GT.spread / 2 + Math.random() * GT.spread), gt0: t, src: 'A' });
                const o0 = _lhSpOrbit(w), cl = w.cl;   // 0.98.22.11：整團一開始總共要走多遠（算凝聚進度，恆星最後一段才點亮）
                if (!(cl.gF >= t - 2000)) { cl.gD0 = 0;   /* 0.1→2 秒：卡一下（一格超過 0.1 秒）不再被當成新的凝聚、把整團進度歸零（已經浮現的又重走透明＋對焦） */ cl.gDoneT = 0; cl.gGlowT = 0; cl.gP = 0; cl.gPst = 0; cl.gStall = false; }
                w.gd0 = Math.hypot(o0.x - w.gx0, o0.y - w.gy0); w.gp = 0;
                cl.gD0 += w.gd0;
            }
        }
        if (w === drag) { if (w.star && w.free) { w.cl.x = w.fx; w.cl.y = w.fy; } }   // 按著還沒拖動（free 還沒開）不動整團
        else if (w.free) {
            if (w.comet || w.star) {   // 流星、恆星甩出去：照速度滑，摩擦慢慢停
                w.fx += w.fvx * dt; w.fy += w.fvy * dt;
                // 0.98.41 新黑洞：範圍內只有引力；宇宙邊界外（畫面裡）不煞車、保底速度；甩出去＝甩動煞車（直線等減速，煞停＝落腳）；沒有邊界的等級照舊摩擦
                if (w.inBh) { } else if (w.outB) _lhSpOutMin(w); else if (w.brk) { if (_lhSpBrakeW(w, dt)) w.brkP = 0; } else { w.fvx *= fr; w.fvy *= fr; }
                if (w.star) { w.cl.x = w.fx; w.cl.y = w.fy; }
                if (!w.inBh && !w.outB && !w.brk && Math.hypot(w.fvx, w.fvy) < 0.12 * _lhSpU()) _lhSpSettle(w, L, T);   // 慢到停下（宇宙半徑 0.12%／秒）
            } else if (w.inBh || w.brk || w.outB) {   // 0.98.41 新黑洞：行星在引力範圍裡（只有引力）、被甩出去（直線煞停後彈簧才接手）、在宇宙邊界外
                w.fx += w.fvx * dt; w.fy += w.fvy * dt;
                if (!w.inBh) { if (w.outB) _lhSpOutMin(w); else _lhSpBrakeW(w, dt); }
            } else {   // 行星被甩出去或被沖散：自己的恆星像彈簧一樣慢慢把它拉回軌道
                if (!still) w.th += _lhSpOm(w) * L.orbit * dt * (1 - bkS);
                const o = _lhSpOrbit(w);
                // 接任的恆星：拉得更快、不彈（約 1 秒內到中心）。
                // 凝聚中（gk，0.98.21 Andy）：彈簧隨時間越來越緊——剛度 0.04 ×（1＋6×(秒/10)²），阻尼比 0.55：
                // 一開始鬆、慢慢飄近，約 9 秒到 9 成（星系輪廓出來）；後段變緊，衝過頭約 5% 再拉回，最後 6 秒左右小距離定型、約 15.5 秒完全停。
                // 固定的彈簧做不到「衝過頭又很快收好」（阻尼低就回彈 20 秒以上）；age 封頂 30 秒，剛度不會無限變大
                // 數字在 LH_SP_TUNE.gather（k＝0.04、stiff＝6、ramp＝10、damp＝1.1）
                const GT = LH_SP_TUNE.gather, gs = w.gk ? 1 / Math.max(0.1, GT.dur || 1) : 1, gd = dt * gs, ga = w.gk ? Math.min(30, (t - w.gt0) / 1000 * gs) : 0,   /* gs：凝聚完成時間倍數 dur 的倒數——整段時間軸一起快轉／慢放，軌跡跟比例完全不變 */ kg = w.gk ? GT.k * w.gk * (1 + GT.stiff * (ga / GT.ramp) ** 2) : 0;
                const k = w.rising ? 12 : w.gk ? kg : K, dm = w.rising ? Math.exp(-dt * 7) : w.gk ? Math.exp(-gd * GT.damp * Math.sqrt(kg)) : damp;
                // 0.98.22.11：阻尼只壓「相對目的地的速度」——目的地沿軌道在跑（小星系還繞中心公轉），舊寫法連跟著跑的速度都被阻尼吃掉，
                // 行星永遠落後目的地一截（幾十 px）、相對速度也停不下來＝永遠不算凝聚完成、光芒不亮
                // 目的地「跳位」（大風吹換座位、被推開）不算速度，不然一跳就把行星踢一下、永遠擺不停
                let ovx = dt && w.oPx !== undefined ? (o.x - w.oPx) / dt : 0, ovy = dt && w.oPy !== undefined ? (o.y - w.oPy) / dt : 0;
                if (Math.hypot(ovx, ovy) > 300) ovx = ovy = 0;
                w.oPx = o.x; w.oPy = o.y;
                w.fvx = ovx + (w.fvx - ovx + (o.x - w.fx) * k * gd) * dm;
                w.fvy = ovy + (w.fvy - ovy + (o.y - w.fy) * k * gd) * dm;
                w.fx += (ovx + (w.fvx - ovx) * gs) * dt * (1 - bkS); w.fy += (ovy + (w.fvy - ovy) * gs) * dt * (1 - bkS); w.odist = Math.hypot(o.x - w.fx, o.y - w.fy);   // 離自己的位置多遠（煙霧判斷「回到家了」用）   // 0.98.22.11：凝聚中／甩出去的行星也照 hover 煞車（舊版只煞了在軌道上的，凝聚中的照跑＝沒生效）
                if (w.gk && w.cl) { const cl = w.cl, dd = Math.hypot(o.x - w.fx, o.y - w.fy); if (cl.gF !== t) { if (cl.gD0 > 0 && cl.gF) { cl.gP = Math.max(cl.gP || 0, 1 - cl.gDn / cl.gD0); if (!cl.gPst) { cl.gPst = t; cl.gPs = cl.gP; } else if (t - cl.gPst > 1500) { cl.gStall = cl.gP > 0.75 && cl.gP - cl.gPs < 0.02; if (cl.gStall && !cl.gDoneT) cl.gDoneT = t; cl.gPst = t; cl.gPs = cl.gP; }   /* 在這裡就標完成（畫面外的恆星不會畫特效、原本永遠標不到） */ }   /* gStall：過 75% 後 1.5 秒內前進不到 2%＝卡住（幾顆一直擺盪） */ cl.gF = t; cl.gDn = 0; } cl.gDn += dd;   /* gP：上一格算完的整團進度（只增），共用時間軸模式用 */ w.gp = Math.max(w.gp || 0, 1 - dd / Math.max(1, w.gd0 || 1)); }   // gp：這顆自己走完幾成（只增不減，衝過頭不算倒退）   // 這一格整團還差多遠
                gv = Math.max(gv, Math.min(0.85, Math.hypot(w.fvx, w.fvy) / 400));   // 0.98.16：沖散、甩出去的行星越快，第 5 級殘影越濃
                const tol = w.rising ? 10 : 3;   // 接任的恆星：差不多到中心就接手，不必等完全停穩
                if (Math.hypot(o.x - w.fx, o.y - w.fy) < tol && Math.hypot(w.fvx - ovx, w.fvy - ovy) < tol * 5) { w.free = false; w.bhF = false; if (w.gk) w.gHold = true; w.gk = 0; w.oPx = w.oPy = undefined; if (w.rising) { w.rising = false; w.star = true; } if (w.cl) w.cl.ver++; }
            }
            busy = true;
        } else if (!still) {
            if (w.comet && w.cmWait) {   // Andy：流星出界後休息 15～60 秒，再從「不是對面」的另外三邊隨機位置進來
                if (_lhSpNow() >= w.cmWait) {
                    const opp = [1, 0, 3, 2][w.cmSide], sides = [0, 1, 2, 3].filter(k => k !== opp), BHp = _lhSp.bh;
                    const ns = w.cmFar && BHp ? [0, 1, 2, 3].sort((a, b) => Math.hypot(BHp.x - [B, -B, 0, 0][b], BHp.y - [0, 0, B, -B][b]) - Math.hypot(BHp.x - [B, -B, 0, 0][a], BHp.y - [0, 0, B, -B][a]))[0] : sides[Math.floor(Math.random() * 3)], r = (Math.random() * 2 - 1) * B * 0.9;   // cmFar：被黑洞吞掉的，從離黑洞最遠的那一邊重生
                    w.cmFar = false;
                    const sp = (Math.random() - 0.5) * Math.PI / 2;   // 朝內 ±45°
                    [w.x, w.y, w.ang] = [[B, r, Math.PI + sp], [-B, r, sp], [r, B, -Math.PI / 2 + sp], [r, -B, Math.PI / 2 + sp]][ns];
                    { const AM = _lhSp.bhShape, K = _lhSp.bhK; if (AM && K) {   // Andy：宇宙邊界其實是變形蟲（紫線）——從那一邊的紫線上進場
                        const a = [0, Math.PI, Math.PI / 2, -Math.PI / 2][ns] + (Math.random() - 0.5) * 1.2, l = _lhSpAmoebaR(AM, a) * K * 0.99;
                        w.x = Math.cos(a) * l; w.y = Math.sin(a) * l; w.ang = a + Math.PI + sp; } }
                    w.cmWait = 0; w.trl = w.trOld = w.trRet = null; w.lsx = w.lsy = w.lux = w.luy = undefined;   // 瞬移回來：不要連一條光帶
                }
            } else if (w.comet) {   // 流星走弧線：前進方向慢慢轉（尾巴照前進方向畫，不用記走過的點）
                w.ang += w.cv * (L.curve ?? 1) * dt;
                const cv = w.v * (LH_SP_TUNE.roam.comet ?? 1);   // 流星速度倍數（齒輪「公轉」）
                const H = _lhSp.bhW;
                if (H) {   // 0.98.41 新黑洞引力（跟行星、恆星同一條公式）；掉進核心＝被吞，閒置一段時間後從離黑洞最遠的那邊重生
                    const o = { x: w.x, y: w.y, vx: Math.cos(w.ang) * cv * (w.cs || 1), vy: Math.sin(w.ang) * cv * (w.cs || 1), e: (w.bhE ??= {}) };
                    const st = _lhSpBhG(o, H, LH_SP_TUNE.bh, dt);
                    w.inBh = st === 1 ? 1 : 0;
                    if (st === 1) { w.ang = Math.atan2(o.vy, o.vx); w.cs = Math.max(0.2, Math.min(40, Math.hypot(o.vx, o.vy) / Math.max(1, cv))); }
                    if (st === 2) {
                        const sec = 15.5 * (LH_SP_TUNE.gather.dur || 1) + Math.random() * LH_SP_TUNE.bh.form;
                        w.cmWait = _lhSpNow() + sec * 1000; w.cmFar = true; w.cs = 1; w.inBh = 0; w.trl = w.trOld = w.trRet = null;
                    }
                } else w.inBh = 0;
                if (!w.inBh && w.cs && w.cs !== 1) w.cs += (1 - w.cs) * (1 - Math.exp(-dt / 2.5));   // 離開後 2～3 秒慢慢回到原本速度
                w.x += Math.cos(w.ang) * cv * (w.cs || 1) * dt; w.y += Math.sin(w.ang) * cv * (w.cs || 1) * dt;
                let side = w.x > B ? 0 : w.x < -B ? 1 : w.y > B ? 2 : w.y < -B ? 3 : -1;   // 0 右、1 左、2 下、3 上
                { const AM = _lhSp.bhShape, K = _lhSp.bhK; if (AM && K) {   // Andy：照變形蟲邊界（紫線）出界，不是舊的方形
                    const a = Math.atan2(w.y, w.x); side = Math.hypot(w.x, w.y) > _lhSpAmoebaR(AM, a) * K ? (Math.abs(Math.cos(a)) > Math.abs(Math.sin(a)) ? (Math.cos(a) > 0 ? 0 : 1) : (Math.sin(a) > 0 ? 2 : 3)) : -1; } }
                if (side >= 0) { w.cmSide = side; w.cmWait = _lhSpNow() + (15 + Math.random() * 45) * 1000; }
            } else if (!w.star) {
                w.th += _lhSpOm(w) * L.orbit * dt * (1 - bkS);
                if (L.wobble) {   // 行星呼吸晃動（第 4、5 級），每個詞幅度不同（水彩的毛邊）
                    w.wob += dt;
                    const br = w.br || 2.5;
                    const RM = LH_SP_TUNE.roam;   // 0.98.22.11 Andy：離軌道的隨機晃動幅度、晃回軌道的頻率（倍數）
                    w.sx = Math.sin(w.wob * 0.7 * RM.wobFreq) * br * RM.wobAmp; w.sy = Math.cos(w.wob * 0.55 * RM.wobFreq) * br * RM.wobAmp;
                } else w.sx = w.sy = 0;
            }
        }
        const p = _lhSpPos(w);
        // 浮現：從自己那團的中心散開到位置（0.9 秒緩出）
        const k = w.born ? Math.min(1, (t - w.born) / 900) : 0;
        if (k < 1 && w.born) busy = true;
        // 篩選掉的星系：收回中心並淡出（0.45 秒）；篩選取消時同一條路綻放回來
        if (w.off ? w.vis > 0 : w.vis < 1) { w.vis = Math.max(0, Math.min(1, w.vis + (w.off ? -1 : 1) * dt / 0.45)); busy = true; }
        const vv = 1 - Math.pow(1 - w.vis, 3);
        const ox = w.cl && !w.star ? w.cl.x : p.x, oy = w.cl && !w.star ? w.cl.y : p.y;
        // 凝聚（第 4、5 級，0.98.14.7 Andy）：打開／換批時每個詞先在整片宇宙亂撒，1.6–2.6 秒慢慢聚回自己的軌道；
        // 只是位置多一道內插，畫的東西不變，不吃效能
        let bx = p.x, by = p.y, ease = (1 - Math.pow(1 - k, 3)) * vv;
        // 凝聚的位置由上面的彈簧算（w.free）；舊版時間內插（0.98.14.7–0.98.19.3）見 git 94f3f9d。恆星不亂撒：原位由透明慢慢浮現
        if (L.gather && w.born && !w.comet && !w.star) ease = vv;
        if (L.fadeIn && w.born) ease = vv;   // 第 1 級：不綻放，就在原位（整片淡入交給畫布 CSS）
        w.ux = ox + (bx - ox) * ease; w.uy = oy + (by - oy) * ease;   // 還沒乘上整團呼吸的位置（星系一張圖照這個畫）
        const b = w.cl && !w.comet ? w.cl.b : 1;
        w.px = w.cl && !w.comet ? w.cl.x + (w.ux - w.cl.x) * b : w.ux;
        w.py = w.cl && !w.comet ? w.cl.y + (w.uy - w.cl.y) * b : w.uy;
        if (w.bax || w.bay) { w.px += w.bax; w.py += w.bay; }   // 煞車：抵掉整團帶著走的量
        w.alpha = (L.gather && w.star && w.born ? Math.min(1, (t - w.born) / 1400) : L.fadeIn ? (u => u * u * (3 - 2 * u))(Math.min(1, (t - w.born) / 1600)) : Math.min(1, k * 1.6)) * vv;   /* 第 1 級：原位 1.6 秒慢慢浮現（緩進緩出；0.98.19.3 Andy：0.7 秒太像 pop） */
        // 0.98.22.11 Andy：凝聚中的行星從透明慢慢浮現，橫跨自己凝聚的 0 → gather.fadeTo（5 成）；起點亮度 gather.fadeMin（0＝完全看不到）
        // 再改（Andy：看不出模糊、一出來就俐落）：舊版透明度和對焦同一條曲線——模糊版最清楚的時候整個字幾乎透明（最多只佔 1/4），等看得到時已經是清楚版。
        // 改成兩條：先在前 4 成（0 → fadeTo×0.4）亮起一團模糊光，對焦走完整段（0 → fadeTo）才完全清楚
        if (L.gather && (w.gk || w.gHold) && !w.star && !w.comet) {   // gHold：Andy bug（凝聚中隨機有詞突然完整出現）——早一步降落的詞以前直接跳成全亮，現在繼續跟整團淡入走完
            const GG = LH_SP_TUNE.gather, sm = v => { v = Math.max(0, Math.min(1, v)); return v * v * (3 - 2 * v); }, ft = Math.max(0.01, GG.fadeTo);
            // 再再改（Andy：一出現就七成濃）：亮度改走完整段 0 → fadeTo，而且前段壓低（曲線再取 fadeCurve 次方，預設 2：走到一半才 25%）
            // 少數行星直接亮的原因：起點剛好落在目的地旁邊（舊的隨機圓盤，中心附近也會抽到）→ 一出生進度就快滿。
            // ①起點至少離目的地一半距離（上面 ra 的圓環）；②另外加時間保底：出生後至少 gather.fadeMs 毫秒才亮滿，兩者取比較淡的
            // 0.98.22.11 Andy 切換：fadeShared＝1 → 整團共用一條時間軸（整團進度 cl.gP，所有行星一起浮現、一起對焦）；0 → 每顆照自己走完幾成＋時間保底
            const shared = GG.fadeShared >= 0.5, gp = shared ? (w.cl.gP || 0) : (w.gp || 0);
            // 0.98.22.11 Andy：透明→不透明、失焦→清楚共用一條曲線 gather.fadeShape：0.5＝直線；往 0＝前段慢、後段快（下凹）；往 1＝前段快、後段慢（上凸）
            const pw = Math.pow(4, (0.5 - GG.fadeShape) * 2), cv = v => Math.pow(Math.max(0, Math.min(1, v)), pw);
            const byDist = Math.max(cv(gp / ft), w.cl.gDoneT ? Math.min(1, (t - w.cl.gDoneT) / (3000 * (GG.dur || 1))) : 0), byTime = cv((t - (w.gt0 || t)) / Math.max(1, GG.fadeMs * (GG.dur || 1)));   // Andy bug（凝聚中隨機有詞一出來就不透明）：共用時間軸也要每顆自己的時間保底——晚出生的詞不會直接跳到整團的進度
            // Andy 根治（詞先清楚了又退回透明＋模糊重跑）：整團進度遇到歸零（停畫超過 2 秒、同團晚出生的詞）會掉回 0；
            // 現在每顆詞自己的淡入／對焦只進不退（換一次出生才重算）
            if (w.gBorn !== w.born) { w.gBorn = w.born; w.gBD = 0; }
            const bd = w.gBD = Math.max(w.gBD, byDist);
            w.alpha *= GG.fadeMin + (1 - GG.fadeMin) * Math.min(bd, byTime);
            if (w.gHold && (Math.min(bd, byTime) >= 1 || t - (w.gt0 || 0) > 20000)) w.gHold = false;   // 走完（或卡太久保底）才放手
            w.gFocus = GG.blur > 0 ? bd : undefined;   // 行星：對焦跟不透明一起走（Andy：focusFrom／To 只給恆星）
        }
        else if (L.gather && w.star && w.born && w.cl && (!w.cl.gDoneT || t - w.cl.gDoneT < 3000 * (LH_SP_TUNE.gather.dur || 1) || (w.gF9T && t - w.gF9T < 3000 * (LH_SP_TUNE.gather.dur || 1))) && (w.cl.gDoneT || w.cl.gD0 > 0 || w.cl.gWait >= t - 200 || t - w.born < 1500)) {   // Andy bug 根治（恆星先全亮、又回頭跑透明＋模糊）：舊條件「出生 1.5 秒內」一過、自己的行星還沒開始飛，就跳出這段＝直接全亮；行星一起飛又跳回來從 0 開始。現在：行星還在排隊（gWait）或凝聚開始過（gD0）都留在這段
            // Andy：恆星也跟整團共用時間軸，凝聚的前 gather.starTo（3 成）從透明→不透明、失焦→清楚（同一條 fadeShape 曲線）
            // bug 修（切換宇宙恆星先冒出來再消失）：行星還沒開始算進度的頭幾格，恆星也先當 0，不走舊的照時間浮現
            const GG = LH_SP_TUNE.gather, GD = Math.max(0.1, GG.dur || 1), act = w.cl.gD0 > 0;   /* 進度 gP 會留著，不必每格都有行星在飛 */
            if (act && !w.cl.gDoneT && !(w.cl.gF >= t - 600)) w.cl.gDoneT = t;   // 行星全部落地（沒有在飛的了）＝整團完成，剩下的照 3 秒收
            const pw = Math.pow(4, (0.5 - GG.fadeShape) * 2);
            const f = act ? Math.pow(Math.min(1, (w.cl.gP || 0) / Math.max(0.01, GG.starTo)), pw) : 0;
            const fF = GG.focusFrom ?? 0.6, fc = act ? Math.pow(Math.max(0, Math.min(1, ((w.cl.gP || 0) - fF) / Math.max(0.01, (GG.focusTo ?? 1) - fF))), pw) : 0;   // 恆星對焦走 focusFrom → focusTo（曲線同 fadeShape；試過三次方 ease-in、ease-out 都不要）
            // Andy：最後一段（對焦 9 成之後）不跟進度跑，改成固定 3 秒慢慢收完（最後 5% 太突兀）；整團被判定完成時還沒對焦完，也是 3 秒補完
            if (fc >= 0.9 && !w.gF9T) w.gF9T = t; else if (fc < 0.5) w.gF9T = 0;
            const fcL = w.gF9T ? 0.9 + 0.1 * Math.min(1, (t - w.gF9T) / (3000 * GD)) : Math.min(fc, 0.9);
            const fc2 = w.cl.gDoneT ? (w.gFc0 ??= fcL) + (1 - w.gFc0) * Math.min(1, (t - w.cl.gDoneT) / (3000 * GD)) : (w.gFc0 = undefined, fcL);
            if (w.gBorn !== w.born) { w.gBorn = w.born; w.gSF = w.gSC = 0; }   // 恆星一樣只進不退
            const fS = w.gSF = Math.max(w.gSF, w.cl.gDoneT ? 1 : f), fC = w.gSC = Math.max(w.gSC, fc2);
            w.alpha *= fS; w.gFocus = GG.blur > 0 && fC < 1 ? fC : undefined;
            // Andy：熱浪自己的對焦——整團凝聚 heatFocusFrom（6 成）→ heatFocusTo（10 成）；整團判定完成時沒到，3 秒補完
            const hF0 = GG.heatFocusFrom ?? 0.6, hfP = Math.max(0, Math.min(1, ((w.cl.gP || 0) - hF0) / Math.max(0.01, (GG.heatFocusTo ?? 1) - hF0)));
            const hf = w.cl.gDoneT ? (w.gHf0 ??= hfP) + (1 - w.gHf0) * Math.min(1, (t - w.cl.gDoneT) / (3000 * GD)) : (w.gHf0 = undefined, hfP);
            w.gHeatF = GG.blur > 0 && hf < 1 ? hf : undefined;
        }
        else if (L.gather && w.comet && w.born && t - w.born < _lhSpGatherCurve().end * 500 * (LH_SP_TUNE.gather.dur || 1)) {
            // Andy：流星也走混沌凝聚——透明、對焦的比例跟一顆普通行星一模一樣，只是時間快一倍（行星走一半，它就走完）
            const GG = LH_SP_TUNE.gather, GC = _lhSpGatherCurve(), D = GG.dur || 1, pw = Math.pow(4, (0.5 - GG.fadeShape) * 2), cv = v => Math.pow(Math.max(0, Math.min(1, v)), pw);
            const sec = (t - w.born) / 1000 * 2 / D, gp = GC.P[Math.min(GC.P.length - 1, Math.floor(sec * 60))];
            const bd = cv(gp / Math.max(0.01, GG.fadeTo)), bt = cv(sec * 1000 / Math.max(1, GG.fadeMs));
            w.alpha *= GG.fadeMin + (1 - GG.fadeMin) * Math.min(bd, bt);
            w.gFocus = GG.blur > 0 ? bd : undefined;
            busy = true;
        }
        else if (w.gFocus !== undefined || w.gHeatF !== undefined) { w.gFocus = w.gHeatF = undefined; w.sprB = null; }   // 對焦完：放掉模糊版
        if (w.reT) { const f = Math.min(1, (t - w.reT) / 2000); w.alpha *= f * f * (3 - 2 * f); if (f >= 1) w.reT = 0; else busy = true; }   // 0.98.41：被黑洞吞掉、在遠方重生＝2 秒淡入
        if (L.fadeIn && w.born && t - w.born < 1600) busy = true;   // 第 1 級沒變化不畫：浮現中要一直畫，不然會停在半透明   // 凝聚模式的恆星 1.4 秒才完全浮現
        // 保留的詞呼吸（第 1、2 級）：3 秒一輪輕輕放大縮小
        w.kb = (L.keptBreathe && w.kept && !w.dim ? 1 + L.keptBreathe * Math.sin(t / 3000 * TAU + w.wob) : 1) * (w.shr ?? 1);   // shr：0.98.41 被黑洞吸食縮水
        if (w.kb !== 1) busy = true;   // 保留的詞在呼吸：第 1 級（沒變化就不畫）也要繼續畫
        // 凝聚模式的恆星（0.98.14.13 Andy）：除了淡入，也從小變大（0.2→1 倍），比淡入晚 0.35 秒開始、1.4 秒長完；光暈跟著 kb 一起長
        if (L.gather && w.star && w.born) { const kg = Math.max(0, Math.min(1, (t - w.born - 350) / 1400)); if (kg < 1) { w.kb *= 0.2 + 0.8 * (1 - Math.pow(1 - kg, 3)); busy = true; } }
        // 隨機星星閃爍（第 4、5 級）：每秒大約 5 顆；越常用越容易被選到，但最多只多 15%；亮起來時跟著放大一點點
        if (L.twinkle && w.born && !w.dim && dt) {
            if (w.twk && t - w.twk > LH_SP_TUNE.glow.twLen) w.twk = 0;
            if (!w.twk && Math.random() < dt * 0.015 * LH_SP_TUNE.glow.twRate * L.twinkle * (1 + 0.15 * (w.n || 0)) * (w.star ? 0.4 : 1)) w.twk = t;   // 0.98.17：恆星閃爍機率降到 4 成   // 0.98.09：機率 0.006→0.015
        } else if (!L.twinkle) w.twk = 0;
        if (dock) {
            let goal = 1, fx = 0, fy = 0;
            // 放大鏡：游標一個、宇宙黑洞一個（黑洞的數值在齒輪「黑洞 → 魚眼」，預設照抄游標的）；同一個詞取放大較多的，推開的位移相加
            const lens = (C, DK, sc) => {   // C：畫面座標中心；sc：範圍縮放（黑洞成形中跟著長大）
                const s = _lhSpScr(w.px, w.py), d = Math.hypot(s.x - C.x, s.y - C.y), R = DK.r * sc;
                // Andy：改成「至少放大到幾 px」（dock.px）：游標正下方的字放到這個字高；已經比它大的再加 dock.extra px（取兩者大的，門檻前後接得上）；照距離曲線過渡（舊版：最多再放大幾倍＋保底 14px）
                if (d < R) { const h0 = 16 * w.s * _lhSpZv(), need = Math.max(DK.px, h0 + (DK.extra || 0)) / h0; if (need > 1) goal = Math.max(goal, 1 + (need - 1) * Math.pow(1 - d / R, DK.curve) * (w.star ? DK.star ?? 0.15 : 1)); }
                // 魚眼：周圍的詞照距離往外推，越靠中心間距撐越開（中心間距＝1＋D 倍），到範圍邊緣剛好不推、也不擠（外圈斜率回到 1）。
                // D 跟著中心該放多大走（一般字放到 dock.px 要幾倍），×dock.push；ponytail: g(x)=x+D·x(1−x)³，中段（半徑一半）間距被壓成 1−D/4，D 夾到 3 不交錯；想更開又不擠要加大範圍
                if (d < R && d > 0.5 && DK.push > 0) {
                    const cm = Math.max(DK.px, 16 * _lhSpZv() + (DK.extra || 0)) / (16 * _lhSpZv()), D = Math.min(3, DK.push * (cm - 1)), x = d / R;
                    const kk = D * (1 - x) * (1 - x) * (1 - x) * (w.star ? DK.star ?? 0.15 : 1); fx += (s.x - C.x) * kk; fy += (s.y - C.y) * kk;
                }
            };
            if (w.born && !w.dim) {
                if (mouse) lens(mouse, LH_SP_TUNE.dock, 1);   // Andy：恆星只受一點點影響（放大、推開都 × dock.star）
                const Q = _lhSp.bhScr; if (Q && Q.g > 0 && _lhSp.bhLens) lens(Q, _lhSp.bhLens, 1);   // 0.98.41：魚眼範圍＝黑洞半徑 × bh.lensR
            }
            // 0.98.41 Andy：拖著詞到黑洞上方＝反魚眼——越靠近黑洞中心越小，到中心時字寬＝黑洞（放大後）直徑的 0.8 倍；
            // 從黑洞半徑 2.5 倍的地方開始，跟原本的大小（含游標放大鏡）平滑接上，大小變化照放大鏡同樣的緩動
            if (w === drag && _lhSp.drag.moved && _lhSp.bhScr) {
                const be = _lhSp.el.querySelector('.ws-bh'), rect = be && be.style.visibility !== 'hidden' ? be.getBoundingClientRect() : null;
                if (rect && rect.width) {
                    const er = _lhSp.el.getBoundingClientRect(), cx = rect.left + rect.width / 2 - er.left, cy = rect.top + rect.height / 2 - er.top, sp = _lhSpWS(w);
                    const rb = rect.width / 2, Rn = rb * 2.5, dd = Math.hypot(sp.x - cx, sp.y - cy);
                    if (dd < Rn) {
                        const ww = Math.max(1, (w.tw || 40) * _lhSpZv() * (w.kb || 1)), sc0 = Math.min(goal, 0.8 * rect.width / ww), f = Math.min(1, (Rn - dd) / Math.max(1, Rn - rb * 0.5)), fs = f * f * (3 - 2 * f);   // 進到黑洞半徑一半以內＝完全縮到 0.8 倍
                        goal = goal + (sc0 - goal) * fs;
                    }
                }
            }
            w.mag += (goal - w.mag) * (dt ? mk : 1);
            if (Math.abs(goal - w.mag) > 0.004) busy = true; else w.mag = goal;
            w.fox = (w.fox || 0) + (fx - (w.fox || 0)) * (dt ? mk : 1); w.foy = (w.foy || 0) + (fy - (w.foy || 0)) * (dt ? mk : 1);
            if (Math.abs(fx - w.fox) + Math.abs(fy - w.foy) > 0.3) busy = true; else { w.fox = fx; w.foy = fy; }
        } else { w.mag = 1; w.fox = w.foy = 0; }
    }
    if (_lhSp.drag) busy = true;
    _lhSp.busy = busy; _lhSp.gv = gv;
    // 星座：釘住的詞之間的線（_lhSpPin 決定連哪些）
    _lhSp.segs = _lhSp.chords.filter(c => c[0].pinned && c[1].pinned);
    if (_lhSp.lineFor !== _lhSp.pins) { _lhSp.lineFor = _lhSp.pins; _lhSp.lineGoal = _lhSpLineGoal(); }
    { const g = _lhSp.lineGoal, cur = _lhSp.lineCur || (_lhSp.lineCur = g.slice()), k = Math.min(1, (dt || 0.016) * 3);   // 約 0.6 秒漸層過去
        let d = 0; for (let i = 0; i < 3; i++) { cur[i] += (g[i] - cur[i]) * k; d += Math.abs(g[i] - cur[i]); }
        if (d > 1) _lhSp.dirty = true; else cur.splice(0, 3, ...g);
        _lhSp.cLineNow = 'rgb(' + cur.map(Math.round).join(',') + ')'; }
    _lhSpDraw(t, L);
}

// 星系一張圖（第 2 級）：把這一團沒保留、沒釘住的詞先畫進一張圖，之後每一格整張貼上去（約 50 張，不是 800 個詞）。
// 內容變了（cl.ver：隱藏、保留、拖動、常用度篩選）或縮放換了一級才重畫；圖太大（放很大時）就不用，回到一詞一圖
function _lhSpClImg(cl) {
    const S = _lhSp.S, key = cl.ver + '|' + S;
    if (cl.imgKey === key) return cl.img;
    cl.imgKey = key; cl.img = null;
    const ws = _lhSp.words.filter(w => w.cl === cl && !w.comet && !w.kept && !w.pinned && w.spr);
    if (!ws.length) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const w of ws) {
        const hw = w.spr.width / w.spr.S / 2, hh = w.spr.height / w.spr.S / 2, x = w.ux - cl.x, y = w.uy - cl.y;
        x0 = Math.min(x0, x - hw); x1 = Math.max(x1, x + hw); y0 = Math.min(y0, y - hh); y1 = Math.max(y1, y + hh);
    }
    const cw = Math.ceil((x1 - x0) * S), ch = Math.ceil((y1 - y0) * S);
    if (cw > 2048 || ch > 2048) return null;   // ponytail: 太大就不做成圖（記憶體），放大時自然回到一詞一圖
    const c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    const g = c.getContext('2d');
    for (const w of ws) {
        const sw = w.spr.width / w.spr.S * S, sh = w.spr.height / w.spr.S * S;
        g.globalAlpha = w.dim ? 0.06 : 1;
        g.drawImage(w.spr, (w.ux - cl.x - x0) * S - sw / 2, (w.uy - cl.y - y0) * S - sh / 2, sw, sh);
    }
    return (cl.img = { c, x0, y0, S, ws: new Set(ws) });
}

// 每一幀畫一次：星座線 → 星系圖（第 2 級）→ 流星尾巴 → 一般的詞 → 已保留的詞 → 放大中的詞 → 停住／釘住的詞（外框、光暈、在最上層）
function _lhSpDraw(t, L) {
    const M = _lhSp.ctx, z = _lhSpZv(), dpr = _lhSp.dpr || 1;
    if (!M || !_lhSp.W || !_lhSp.visible) return;
    M.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 0.98.17：有殘影的等級（4、5），字畫在另一張「殘影層」上，每格只擦掉一部分；光暈（恆星、流星、hover）直接畫在主畫布、每格清乾淨，
    // 最後把殘影層蓋上去 → 光暈不會跟著殘影留下一圈圈的印子（Andy：縮放時恆星光暈跟殘影疊出難看的印記）
    // 0.98.20 Andy：殘影改成「時間切片」（舊的整張擦淡法見 git 94f3f9d）——每 0.12 秒開一張新的切片（0.75 倍解析度），
    // 在畫面上動得快的詞把自己的疊影畫進目前這片；每片記住當時多快 → 決定停多久（越快越久，最多 1.4 秒），停完 0.4 秒淡掉。
    // 舊的片先到期 → 尾巴從尾端開始消失，不是整條一起變透明。疊影整體半透明、墊在字下面，字本身清清楚楚
    const c = M;
    M.clearRect(0, 0, _lhSp.W, _lhSp.H);
    let ghost = null;
    if (!L.zoomTrail && _lhSp.slices) _lhSp.slices = _lhSp.slCur = null;   // 降到沒殘影的等級：放掉切片
    // 縮放殘影（第 5 級，0.98.14.5 Andy）：縮放中不整張擦掉，只把上一格擦淡一部分 → 星星拖出淡淡的殘影；
    // 停手後 0.45 秒內擦得越來越乾淨（殘影自然收掉），之後照常整張清
    // 殘影強度跟著「動得多快」走（0.98.18 Andy）：
    // - 縮放速度（第 4、5 級）、畫面拖曳速度（第 5 級）用「漏水桶」量：每格把變化量倒進去、桶子 0.3 秒漏掉一大半 → 桶裡的量≈最近的速度。
    //   慢慢滾一格只有一點點，連續快滾才滿；停手後跟著桶子自然收掉（約 1 秒）
    // - 第 5 級另外看凝聚、沖散的速度（gv，在位置計算那邊算好）
    // 擦的比例對整張一樣；同一時間跑越快的星星（外圈行星）前後兩格離得越遠，尾巴自然越長
    if (L.zoomTrail) {
        const dts = Math.min(0.1, Math.max(0, (t - (_lhSp.tdT || t)) / 1000)), leak = Math.exp(-dts / 0.3);
        _lhSp.trGap = t - (_lhSp.tdT || t) > 250;   // Andy bug：切去別的分頁再回來，中間停了很久，這一格的位移不算（不然整片爆出殘影）
        _lhSp.tdT = t;
        const navOn = !!_lhSp.nav && !!_lhSp.nav.w;   // 0.98.22.11 Andy：星座導覽時畫布快速移動，不算速度、不留殘影
        const dzF = Math.abs(Math.log(_lhSp.z / (_lhSp.zPrev || _lhSp.z))), dpF = navOn ? 0 : Math.hypot(_lhSp.px - (_lhSp.pxPrev ?? _lhSp.px), _lhSp.py - (_lhSp.pyPrev ?? _lhSp.py));
        _lhSp.zAcc = (_lhSp.zAcc || 0) * leak + dzF;
        _lhSp.pAcc = (_lhSp.pAcc || 0) * leak + dpF;
        // 這一次連續動作累計走了多遠（縮放 4 倍＝1、拖 1200px＝1）；停手超過 0.25 秒就算新的一次
        if (dzF > 1e-4 || dpF > 0.5) { if (t - (_lhSp.gT || 0) > 250) { _lhSp.gD = 0; _lhSp.camH = {}; } _lhSp.gT = t; _lhSp.gD = (_lhSp.gD || 0) + dzF / Math.log(4) + (L.zoomTrail === 2 ? dpF / 1200 : 0); }
        _lhSp.camMv = dzF > 1e-4 || dpF > 0.5;   // 這一格鏡頭真的有動（camOn 是慢慢衰減的速度，停手後還會亮 1～2 秒）
        { const zs = dzF > 1e-4 ? Math.sign(_lhSp.z - (_lhSp.zPrev || _lhSp.z)) : 0; if (zs && _lhSp.zSign && zs !== _lhSp.zSign) _lhSp.zFlipT = t; if (zs) _lhSp.zSign = zs; }   // 0.98.41 Andy：縮放方向反轉（放大↔縮小）的時間
        _lhSp.zPrev = _lhSp.z; _lhSp.pxPrev = _lhSp.px; _lhSp.pyPrev = _lhSp.py;
        const zN = Math.min(1, _lhSp.zAcc / 0.3 / 2), pN = Math.min(1, _lhSp.pAcc / 0.3 / 1800);   // 每秒縮放 e^2 倍（約 7 倍）、每秒拖 1800px 算「最快」
        const mv = L.zoomTrail === 2 ? Math.max(zN, pN, _lhSp.gv || 0) : zN;
        // 停多久：越快越久（最多 1.4 秒，0.98.20 Andy 加長）；第 5 級常駐殘影平常也留一點點（0.06 秒）；第 4 級只有縮放時才留
        // 0.98.21 Andy：停留＝1.0 秒 ×「快不快」×「動多遠」，0～1 秒連續刻度：短距離的快撥、長距離的慢拖都只停一下或不停，又快又遠才停滿
        // （0.98.19 最長 0.8 秒、0.98.20 1.4 秒而且幾乎每次都停滿）。快不快＝最近 0.3 秒的速度（每秒縮放 e^4 倍、拖 3600px 算最快）
        const spdN = Math.max(Math.min(1, _lhSp.zAcc / 0.3 / 4), L.zoomTrail === 2 ? Math.min(1, _lhSp.pAcc / 0.3 / 3600) : 0);
        // 0.98.22.11 Andy 殘影引擎重寫：兩組設定——trail＝B 鏡頭在動（縮放、拖畫布、被甩出去的詞）；trailA＝A 自己在動（混沌凝聚、被沖散的行星）。
        // 拿掉「停手後幾毫秒內收完」：改成「消逝速度」＝尾巴每秒縮短幾 px，長尾巴收久一點、短尾巴一下就收完，不再被迫同一段時間收完
        const TT = LH_SP_TUNE.trail, TA = LH_SP_TUNE.trailA, TC = LH_SP_TUNE.trailC, TD = LH_SP_TUNE.trailD, HOLD = TT.hold, SLICE = TT.slice, RS = 0.75;
        const TG = g => g === 'A' ? TA : g === 'C' ? TC : g === 'D' ? TD : TT;
        // Andy：拖畫布（C）跟縮放（B）速度基準不同，拆成兩組各自的門檻／暫停／消逝。sw＝快不快 0～1，各組照自己的門檻算
        const thr0 = (v, Q) => Math.max(0, Math.min(1, (v - Q.min) / (1 - Math.min(0.99, Q.min))));
        const spZ = Math.min(1, _lhSp.zAcc / 0.3 / 4), spP = L.zoomTrail === 2 ? Math.min(1, _lhSp.pAcc / 0.3 / 3600) : 0;
        _lhSp.camOn = Math.max(spZ, spP) > 0.02; _lhSp.trDts = dts;   // 鏡頭沒在動時，繞著走的詞算 D（公轉）
        if (_lhSp.camOn) _lhSp.camG = spP > spZ ? 'C' : 'B';   // 這次鏡頭動作算哪一組：哪個比較快就算誰
        const swB = thr0(spZ + (TT.boost || 0), TT), swC = thr0(spP + (TC.boost || 0), TC),   /* boost：速度加成（Andy：慢的動作也能出殘影） */ gd = 0.8 + 0.2 * Math.min(1, _lhSp.gD || 0);
        const holdB = TT.hold * swB * gd, holdC = TC.hold * swC * gd, sw = Math.max(swB, swC), hold = Math.max(holdB, holdC);
        if (_lhSp.gT === t) { const H = _lhSp.camH || (_lhSp.camH = {}); H.B = Math.max(H.B || 0, holdB); H.C = Math.max(H.C || 0, holdC); }   // 這次鏡頭動作裡最長的暫停（同組的鏡頭尾巴共用）
        const SL = _lhSp.slices || (_lhSp.slices = []);
        const fd = dzF / Math.log(4) + dpF / 1200 + (L.zoomTrail === 2 ? (_lhSp.gv || 0) * dts : 0) + dts * 0.01;   // 這一格畫面動了多遠（縮放 4 倍＝1、拖 1200px＝1）
        let live = false;
        // 收尾巴＝照長度等速縮短：停手 hold 之後，已收掉的長度 R＝(過了幾毫秒)×消逝速度；每一處的亮度＝(它離尾端多遠 − R)÷(全長×尾端柔邊)
        const MAXA = Math.max(SLICE, TT.max || 1500), sm = v => v * v * (3 - 2 * v);
        // 再改（Andy：照距離收不同步——星系中心走得短、外圍走得長，一樣的 px／秒，中心早收完、外圍拖很久）：
        // 改成「每秒收掉全長的幾成」（rate），長短尾巴同時收完；收完的時間＝1÷rate 秒
        const retract = (tStop, h, rate, len) => Math.max(0, t - tStop - h) / 1000 * Math.max(0.01, rate) * len;
        const US = SL.filter(x => x.used).sort((a, b) => a.t0 - b.t0);   // 舊的先畫（墊在下面）
        if (US.length) {   // 字的殘影切片：照鏡頭那組（B）的速度收；每片的「長度」＝那段時間畫面動了多遠（換算成約略的 px）
            const nw = US[US.length - 1], tmin = Math.min(t, nw.tEnd) - MAXA, E = Math.max(0.05, TT.edge);
            const wt = US.map(x => (x.d || 0) * 1200 * Math.max(0, Math.min(1, (x.tEnd - tmin) / Math.max(1, x.tEnd - x.t0))));
            const tot = wt.reduce((a, b) => a + b, 0) || 1, R = retract(nw.tEnd, nw.hold, TT.kill / LH_SP_TRAIL_N, tot);
            let acc = 0;
            US.forEach((x, i) => {
                const u = acc + wt[i] / 2; acc += wt[i];
                const v = wt[i] > 0 ? Math.max(0, Math.min(1, (u - R) / (E * tot))) : 0;
                if (v <= 0) { x.used = false; return; }
                live = true;
                M.globalAlpha = TT.alpha * (x.w || 0) * sm(v);   // 越快的片越濃（0.98.22）
                M.drawImage(x.c, 0, 0, _lhSp.W, _lhSp.H);
            });
        }
        // Andy 煙霧（第 5 級，0.98.22.11 重整）：公轉（D）、凝聚（A）各一張不清除的煙霧層（半解析度、×4 濃度畫、貼回 ÷4）。
        // 煙只由星星「自己在宇宙裡走」產生（下面逐字那段）；縮放＝整張跟著放大縮小；拖畫布不噴煙，只擾動已經有的煙：
        // smC.on＝1：煙有慣性（smC.inertia），速度慢慢追上鏡頭——等速拖就跟著走，突然加速就留在原地、被拉出又遠又廣的拉絲；拖越快散越快／慢（smC.fadeK）
        // smC.on＝0：拖畫布改畫光帶（trailC），煙黏在宇宙上
        const SCC = LH_SP_TUNE.smC, lv5 = L.zoomTrail === 2;
        _lhSp.smOnG = { D: lv5, A: lv5, C: false };   // Andy 0.98.22.11：拖畫布決定用光帶（trailC）；煙被沖散那套（smC）暫停用、程式先留著
        _lhSp.smGapK = (_lhSp.smGapK || 1) + (Math.max(1, (_lhSp.smNeed || 0) / 2500) - (_lhSp.smGapK || 1)) * 0.1;   // 間距倍率慢慢變（約 10 格），不然每格跳、濃淡閃
        _lhSp.smNeed = 0; _lhSp.smBudget = 6000; _lhSp.wispBudget = 6;   // 上一格需要的團數超過 2500 就拉開間距（每顆都還有煙）；6000＝失控保險；每格最多新做 6 張細絲圖
        const SMS = _lhSp.smk3 || (_lhSp.smk3 = {}), smO = _lhSpScr(0, 0), smSc = _lhSpScr(1, 0).x - smO.x, P0 = _lhSp.smCam, zoomF = !!P0 && Math.abs(smSc / P0.sc - 1) > 1e-6;
        let shx = 0, shy = 0, relx = 0, rely = 0, vcN = 0;
        if (P0 && !zoomF) {
            const dx = smO.x - P0.ox, dy = smO.y - P0.oy, vcx = dx / dts, vcy = dy / dts;
            if (_lhSp.smOnG.C) {
                const kk = 1 - Math.exp(-dts / Math.max(0.001, SCC.inertia * 0.8));   // 慣性 1＝0.8 秒才追上
                _lhSp.smVx = (_lhSp.smVx || 0) + (vcx - (_lhSp.smVx || 0)) * kk; _lhSp.smVy = (_lhSp.smVy || 0) + (vcy - (_lhSp.smVy || 0)) * kk;
                shx = _lhSp.smVx * dts; shy = _lhSp.smVy * dts; relx = dx - shx; rely = dy - shy;
                vcN = Math.min(1, Math.hypot(vcx, vcy) / 1500);
            } else { shx = dx; shy = dy; _lhSp.smVx = vcx; _lhSp.smVy = vcy; }
        }
        _lhSp.smCam = { sc: smSc, ox: smO.x, oy: smO.y };
        for (const sgK of ['D', 'A']) {
            const SMK = LH_SP_TUNE['sm' + sgK];
            let S = SMS[sgK];
            if (!lv5 && !(S && !S.clean)) continue;   // 降級後還有煙：照樣淡完
            const SB = 4, w2 = Math.max(1, Math.ceil(_lhSp.W * 0.5)), h2 = Math.max(1, Math.ceil(_lhSp.H * 0.5));
            if (!S || S.c.width !== w2 || S.c.height !== h2) {
                const mk = () => { const c = document.createElement('canvas'); c.width = w2; c.height = h2; return c; }, c = mk(), c2 = mk();
                S = SMS[sgK] = { c, x: c.getContext('2d'), c2, x2: c2.getContext('2d'), last: 0, clean: true };
            }
            if (!S.clean && (zoomF || Math.abs(shx) + Math.abs(shy) > 0.01 || Math.abs(relx) + Math.abs(rely) > 0.5)) {
                S.x2.clearRect(0, 0, w2, h2); S.x2.drawImage(S.c, 0, 0); S.x.clearRect(0, 0, w2, h2);
                if (zoomF) { const k = smSc / P0.sc; S.x.setTransform(k, 0, 0, k, (smO.x - P0.ox * k) * 0.5, (smO.y - P0.oy * k) * 0.5); S.x.drawImage(S.c2, 0, 0); S.x.setTransform(1, 0, 0, 1, 0, 0); }
                else {
                    // 被沖散（0.98.22.11 重寫）：整張只搬一次、只搬整數像素（小數留到下一格）——疊好幾份或小數位移，淡煙每次四捨五入都會多出一點，越拖越多、像水彩把宇宙塗滿
                    // 煙跟宇宙差越多（突然加速）×慣性越大 → 同一次搬動時糊開一點（被拉遠拉廣），不另外加煙
                    S.cx = (S.cx || 0) + shx * 0.5; S.cy = (S.cy || 0) + shy * 0.5; const ix = Math.round(S.cx), iy = Math.round(S.cy); S.cx -= ix; S.cy -= iy;
                    const rb = Math.min(4, SCC.inertia * Math.hypot(relx, rely) * 0.08);
                    if (rb > 0.3) S.x.filter = 'blur(' + rb.toFixed(1) + 'px)';
                    S.x.drawImage(S.c2, ix, iy); S.x.filter = 'none';
                }
            }
            // 淡：停留時間＝散到約 5%；拖畫布時再乘「沖散時消失速度」（拖越快越明顯）
            const life = Math.max(100, SMK.life), fa = 1 - Math.exp(-dts * 3000 / life * Math.max(0, 1 + (SCC.fadeK || 0) * vcN));
            if (!S.clean) {
                S.fr = (S.fr || 0) + 1;
                if (S.fr % 2 === 0) { S.x2.clearRect(0, 0, w2, h2); S.x2.filter = 'blur(' + Math.max(0.6, (SMK.wid ?? 1) * 0.4 * (1 - 0.6 * Math.max(0, Math.min(1, SMK.shape)))) + 'px)'; S.x2.drawImage(S.c, 0, 0); S.x2.filter = 'none'; S.x.clearRect(0, 0, w2, h2); S.x.drawImage(S.c2, 0, 0); }   // 擴散：每兩格糊一點點；（觸角氣流 _lhSpSmTurb 拿掉了：位移圖會把煙撕成碎片＝被抹掉的區塊；函式暫留未用）
                // 只乘比例會被 8 位元四捨五入吃掉（淡的煙卡在 ~14/255 永遠消不掉）：累積到 6% 才一次淡掉，剩下的淡霧每 life/10 毫秒固定扣 1/255 清掉（_lhSpSmCut）
                S.fAcc = 1 - (1 - (S.fAcc || 0)) * (1 - fa);
                if (S.fAcc >= 0.06) { S.x.globalCompositeOperation = 'destination-out'; S.x.fillStyle = 'rgba(0,0,0,' + S.fAcc + ')'; S.x.fillRect(0, 0, w2, h2); S.x.globalCompositeOperation = 'source-over'; S.fAcc = 0; }
                if (t - (S.cutT || 0) > life / 10) { S.cutT = t; S.x2.clearRect(0, 0, w2, h2); S.x2.filter = _lhSpSmCut(); S.x2.drawImage(S.c, 0, 0); S.x2.filter = 'none'; S.x.clearRect(0, 0, w2, h2); S.x.drawImage(S.c2, 0, 0); }
            }
            if (!S.clean && _lhSp.bhScr) {   // Andy：黑洞把附近的煙慢慢吸掉（中心一下就沒、外圍慢慢被吃）
                const Q = _lhSp.bhScr, g = S.x.createRadialGradient(Q.x * 0.5, Q.y * 0.5, 0, Q.x * 0.5, Q.y * 0.5, Q.R * 0.5), e = Math.min(1, dts * 6);
                g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(Q.r / Q.R, 'rgba(0,0,0,' + Math.min(1, e * 4) + ')'); g.addColorStop(1, 'rgba(0,0,0,0)');
                S.x.globalCompositeOperation = 'destination-out'; S.x.fillStyle = g; S.x.fillRect(Q.x * 0.5 - Q.R * 0.5, Q.y * 0.5 - Q.R * 0.5, Q.R, Q.R); S.x.globalCompositeOperation = 'source-over';
            }
            if (!S.clean && t - S.last > life * 1.5) { S.x.clearRect(0, 0, w2, h2); S.clean = true; }   // 很久沒新煙：整張清乾淨（不留殘霧）
            const sf = _lhSp.smFade ? Math.max(0, Math.min(1, 1 - (_lhSpNow() - _lhSp.smFade) / 300)) : 1;   // 星際穿越：最後 0.3 秒淡掉
            if (!S.clean && sf > 0 && SMK.alpha > 0) { M.globalAlpha = Math.min(1, sf / SB * SMK.alpha / 0.6);   // 濃淡只在貼到畫面時乘（層裡固定用 0.6 的濃度存，淡的煙才不會被 8 位元吃掉）
                M.drawImage(S.c, 0, 0, _lhSp.W, _lhSp.H); M.globalAlpha = 1; live = true; }
        }
        // 光帶（0.98.22.7）：每個詞自己記一串點、每格現場畫成一條漸層線；每個詞停下來就各自從尾巴照長度縮回去
        // 0.98.22.11 Andy 光帶柔邊：全部光帶先畫在一半大小的小畫布上，整張只模糊一次再放大貼回（幾百條也只模糊一次、像素少 4 倍；1/4 大小時底子就太糊）
        const BB = 4, BS = 0.5, bw = Math.max(1, Math.ceil(_lhSp.W * BS)), bh = Math.max(1, Math.ceil(_lhSp.H * BS));
        // A、B 兩組各一張小畫布（柔邊各自設定，各模糊一次）
        const BC = _lhSp.bandC4 || (_lhSp.bandC4 = Object.fromEntries(['A', 'B', 'C', 'D'].map(k => [k, [document.createElement('canvas'), document.createElement('canvas')]])));
        const bands = { A: 0, B: 0, C: 0, D: 0 }, BX = {};
        for (const k of ['A', 'B', 'C', 'D']) {
            for (const c of BC[k]) if (c.width !== bw || c.height !== bh) { c.width = bw; c.height = bh; }
            const x = BX[k] = BC[k][0].getContext('2d');
            x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, bw, bh); x.setTransform(BS, 0, 0, BS, 0, 0);
        }
        // 0.98.22.11 Andy（極限測試：手快速來回拉）：①方向一折返，舊的那條立刻另外放、TT.flip 毫秒內淡掉，新的從折返點重新長（彗星不會掉頭）；
        // ②整個畫面的光帶總量有上限（TT.cap＝畫面面積的幾成），超過就整層一起調淡，不會越堆越亮
        let ink = 0;
        const band = (w, P, mul) => {   // 畫一條；回傳 false＝這條已經收完可以丟
            const gk = P.g === 'A' || P.g === 'C' || P.g === 'D' ? P.g : 'B', Q = TG(gk), B = BX[gk], E = Math.max(0.05, Q.edge);
            const hd = P[P.length - 1], tmin = gk === 'C' ? -Infinity : Math.min(t, hd.t) - Math.max(100, Q.life ?? Q.max ?? 1500);   // Andy：拖畫布不看停留時間（停住時詞還在公轉、頭一直更新，舊點一超過就整批丟光＝整條瞬間消失），長度交給 trailC.dist 貪吃蛇淡出   // life：燃燒軌跡留幾毫秒
            let k0 = 0;
            while (k0 < P.length - 1 && P[k0 + 1].t <= tmin) k0++;   // 整段都超過「尾巴最長」的才丟（那段權重已經是 0、本來就看不到）
            if (k0) P.splice(0, k0);
            // Andy 拖畫布（C，含甩出去的詞）化繁為簡：只有兩條規則——①尾巴一直往前吃，最後一次變長後 50÷kill 秒吃完（不管多長、在拖或停、放開、來回）；
            // ②超過 dist（照縮放：100%＝1 倍、最小 1/8、最大 2 倍）的部分加速吃，distFade 毫秒內吃掉 95%。P.eat＝尾巴吃到第一段的哪裡，只會往前 → 不會重新亮。不看停留時間、暫停、鏡頭停下的時間
            if (gk === 'C') {
                const dZ = (Q.dist || 500) * _lhSpDistK(), dtE = Math.max(0.004, _lhSp.trDts || 0.016);
                let Lc = -(P.eat || 0); for (let i = 1; i < P.length; i++) if (!P[i].br) Lc += Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y);
                // ①按部就班吃：不管多長，最後一次變長後 50÷kill 秒（kill 10＝5 秒）剛好等速吃完——每格吃「剩下長度÷剩下時間」；還在拖（變長）就把吃完時間往後延
                //   （舊：固定 px／秒，短光帶點數不滿 50 就比預期早消失）
                // ②超過 dZ 的部分另外加速吃：多出來的在 distFade 毫秒內吃掉 95%（照長度算，不受記錄點疏密影響；尾巴照常柔邊）
                const T = LH_SP_TRAIL_N / Math.max(0.01, Q.kill) * 1000;
                // Andy 實驗：最後 tailN 個控制點（全長 50 點裡的最後幾點）強制每點花 tailS 秒走完——前面的照原本時間先吃到只剩那幾點，之後等速慢慢收
                const fN = Math.min(1, Math.max(0, Q.tailN ?? 0) / LH_SP_TRAIL_N), TS = Math.max(0, Q.tailS ?? 1);
                if (P.endT === undefined || Lc > (P.lastLc ?? 0) + 0.5) { P.endT = t + T * (1 - fN); P.L0 = Math.max(1, Lc); }   // L0：最後一次變長時的全長（一點＝L0÷50）
                const Lt = P.L0 * fN, tEnd = P.endT + fN * LH_SP_TRAIL_N * TS * 1000, e1 = fN > 0 && (Lc <= Lt || t >= P.endT)
                    ? Math.max(0, Lc) * Math.min(1, dtE * 1000 / Math.max(1, tEnd - t))   // 最後幾點：剩下的在「幾點×TS 秒」內等速吃完（每點約 TS 秒）；停住時詞還在公轉、頭會微微長，照剩下時間吃就不會永遠收不完
                    : Math.max(0, Lc - Lt) * Math.min(1, dtE * 1000 / Math.max(1, P.endT - t));
                const dE = Math.min(Math.max(0, Lc), e1) + Math.max(0, Lc - dZ) * 3 / (Math.max(50, Q.distFade ?? 600) / 1000) * dtE;
                P.eat = (P.eat || 0) + dE; P.lastLc = Lc - dE;   // lastLc：吃完之後剩多長（下一格比它長＝又變長了）
                while (P.length > 1) { const d = P[1].br ? 0 : Math.hypot(P[1].x - P[0].x, P[1].y - P[0].y); if (P.eat < d) break; P.eat -= d; P.shift(); }
                if (P.length < 2) return false;
            }
            if (P.length < 2) return t - P[0].t < 300;   // Andy bug（慢的永遠沒殘影）：慢慢走的第一點要累積 6px 才有第二點，只有一點時先留著，別當成收完丟掉（0.3 秒沒更新才丟）
            // Andy：停在原地（或幾乎沒走）的光帶很短，會被字本身擋住 → 尾巴往這條光帶自己的隨機方向歪出去，頭端照樣貼著字；
            // 越短歪越多（最多半個字寬），走得比字寬長的就不歪
            {
                let raw = 0; for (let i = 1; i < P.length; i++) raw += Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y);
                const lwH = P[P.length - 1].lw || 20, sk = Math.max(0, 1 - raw / lwH);
                if (P.oa === undefined) P.oa = Math.random() * Math.PI * 2;
                P.sx = Math.cos(P.oa) * lwH * 0.5 * sk; P.sy = Math.sin(P.oa) * lwH * 0.5 * sk;
            }
            const PO = P;   // 原本那條（下面歪出去時 P 換成這一格畫用的複本；記錄要寫回 PO）
            if (P.sx || P.sy) P = Object.assign(P.map((q, i, A) => { const f = 1 - i / Math.max(1, A.length - 1); return f ? { ...q, x: q.x + P.sx * f, y: q.y + P.sy * f } : q; }), { g: P.g, cam: P.cam, t0: P.t0, eat: P.eat, t0r: P.t0r, h0: P.h0, retT: P.retT, rp: P.rp, t0rL: P.t0rL, h0L: P.h0L });   // 只改這一格畫的位置，不動記錄（eat 等狀態一起帶，不然短光帶算出 NaN）
            const n = P.length, G = [0], U = [0], K = [P[0].k];
            let Lg = 0, Le = 0;
            for (let i = 1; i < n; i++) {
                const d = P[i].br ? 0 : Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y);
                Lg += d; Le += d * Math.max(0, Math.min(1, (P[i].t - tmin) / Math.max(1, P[i].t - P[i - 1].t)));
                G.push(Lg); U.push(Le); K.push(Math.max(K[i - 1], P[i].k));   // 亮度：從尾到頭取「到這裡為止最快」，頭不會比尾暗、也不會整條一起變暗
            }
            if (Lg <= 0 || Le <= 0) return true;
            // 0.98.22.11 Andy（最後一坨一口氣消失）：錐形頭寬又亮，份量全擠在靠頭那段；長度等速收＝最後零點幾秒收掉最重的一塊。
            // ①Andy：控制點等速收，不再加曲線／最後整條淡掉——尾端柔邊本身就讓剩下那段越收越淡，參數越少越好調；
            // ③鏡頭留下的尾巴（P.cam）一律從「鏡頭停下來」那刻（_lhSp.gT＋camH）一起開始收，中心、外圍同步
            let t0r = gk === 'C' ? t : P.t0r ?? (P.cam && _lhSp.gT ? Math.max(hd.t, _lhSp.gT) : hd.t), h0 = P.h0 ?? (P.cam ? Math.max(hd.h, (_lhSp.camH && _lhSp.camH[gk]) || 0) : hd.h);
            // Andy bug（放開等尾巴收、還沒收完又按住拖 → 整片重新亮）：鏡頭尾巴的起收時間跟著「鏡頭最後在動的時間」走，一動就歸零。
            // 已經開始收（rp＞2%）的，鏡頭一動就凍結在原本的起收時間（不管這顆有沒有記到新點）；下次記點時另起新的一條
            if (gk !== 'C' && P.t0r === undefined && (P.rp || 0) > 0.02 && P.t0rL !== undefined && t0r > P.t0rL + 1) { PO.t0r = P.t0r = t0r = P.t0rL; PO.h0 = P.h0 = h0 = P.h0L; PO.retT = P.retT = t; }   // t0r／h0：停過又動時凍結（見下面 trRet）
            const pr = gk === 'C' ? Math.min(1, P.eat / Math.max(1e-6, Le)) : Math.max(0, t - t0r - h0) / 1000 * Math.max(0.01, Q.kill) / LH_SP_TRAIL_N;   // 進度＝收掉了幾個控制點÷總數（C：尾巴在第一段吃到哪）
            PO.rp = pr; PO.t0rL = t0r; PO.h0L = h0;   // 記下這格收到哪、從何時開始收（停過又動時凍結用）
            if (pr >= 1) return false;
            const R = Le * pr;
            // 省效能（0.98.22.11）：①整條在畫面外（含錐形寬度）不畫 ②濃度×寬度小到模糊後看不見不畫——都照樣回傳 true（記錄繼續、該收照收）
            {
                const ba0 = w.alpha * 0.16 * Q.alpha * mul * K[n - 1], m = (P[n - 1].lw || 20) * Q.cone;
                if (ba0 < 0.004 || ba0 * m < 0.05) return true;
                let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
                for (const q of P) { if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x; if (q.y < y0) y0 = q.y; if (q.y > y1) y1 = q.y; }
                if (x1 < -m || y1 < -m || x0 > _lhSp.W + m || y0 > _lhSp.H + m) return true;
            }
            // 文字殘影：只在這條光帶的最尾巴留一個字，不等暫停（hold）、一出現就開始淡，1÷消逝速度 秒淡完
            if (Q.ghost && P.t0 && w.spr && 16 * w.s * z * (w.kb || 1) <= TT.ghostMax) {
                const ga = 0.35 * w.alpha * mul * K[n - 1] * (1 - (t - P.t0) / 1000 * Math.max(0.01, Q.kill) / LH_SP_TRAIL_N);
                if (ga > 0.003) {
                    let i = 0; while (i < n - 1 && U[i + 1] <= R) i++;   // 目前看得到的尾端在哪一點
                    const q = P[i], m = w.kb || 1, sw = w.spr.width / w.spr.S * z * m, sh = w.spr.height / w.spr.S * z * m;
                    M.globalAlpha = Math.min(1, ga); M.drawImage(w.spr, q.x - sw / 2, q.y - sh / 2, sw, sh); live = true;
                }
            }

            // Andy bug（尾端柔邊開到 0.4 以上，長光帶收尾邊閃邊淡）：舊的柔邊寬度＝E×全長，全長還含著第一段「已經吃掉、看不到」的那截；
            // 每吃完一段、那段從記錄拿掉，全長突然少一截 → 柔邊突然變窄 → 整條亮一階（每 0.1 秒左右一次＝閃爍）。柔邊小時只有尾巴一點點在淡，看不出來。
            // 拖畫布（C）改用「還看得到的長度」（全長 − 已吃掉）算柔邊寬度：拿掉一段前後數字完全接得上
            const EL = gk === 'C' ? Math.max(1e-6, Le - R) : Le;
            const lenVis = u => Math.max(0, Math.min(1, (u - R) / (E * EL)));   // u：離尾端多遠（px）
            live = true; bands[gk]++;
            const a = P[0], b = P[n - 1];
            // 0.98.22.11 Andy 的寫法：沿著光帶從尾到頭平均灑 LH_SP_TRAIL_N（50）個控制點，每點只看自己被收掉沒（跟記錄點、線段多長都無關）——
            // 一格走很長一段也照樣從尾往頭一點一點淡，不會整段一起消失
            let i = 1;   // u 從尾往頭只增不減：i 接著上一次往前找，不必每點從頭掃（記錄點多時省很多）
            const at = u => {   // 有效長度 u（離尾端）→ 幾何位置比例、該處的速度權重
                while (i < n - 1 && U[i] < u) i++;
                const f = U[i] > U[i - 1] ? Math.max(0, Math.min(1, (u - U[i - 1]) / (U[i] - U[i - 1]))) : 1;
                return [(G[i - 1] + (G[i] - G[i - 1]) * f) / Lg, K[i - 1] + (K[i] - K[i - 1]) * f];
            };
            // 畫面上很短的光帶不需要 50 點（每 6px 一點就夠細）：1000 個詞一起縮放時大多是短帶，省掉大半顏色字串；收的速度仍照 50 點算，不受影響
            const NS = Math.max(3, Math.min(24, Math.ceil(Lg / 14))), hfL = Math.min(Le * 0.3, 40), hfK = P.retT ? Math.min(1, (t - P.retT) / 200) : 0, col = (u, kk) => _lhSpRGBAq(w.rgb, Math.min(1, sm(lenVis(u)) * kk * (hfK ? 1 - hfK * (1 - sm(Math.min(1, (Le - u) / Math.max(1, hfL)))) : 1)));   // Andy：停過又動被切出來的舊條（retT），頭端也柔邊淡出（長度 3 成、最多 40px，0.2 秒內出現），切口不銳利   // 省效能：畫在半解析度、再模糊 → 每 14px 一個漸層點、最多 24 個就看不出差（舊：每 6px、最多 50）；顏色字串照 1/128 階快取
            // 0.98.22.11 Andy：光帶從細線改成錐形——頭端寬＝字寬，往尾巴照長度線性收到 0（每一點沿前後方向的法線往兩側展開，圍成一塊填色）
            // 0.98.22.11 Andy（柔邊淡出一團一團）：光帶本來只用 1 成多的濃度畫進小畫布，每個像素只剩二三十階，再模糊、再放大，階梯就變成一塊一塊。
            // 改成先用 4 倍濃度畫（階數多 4 倍），模糊完貼回畫面時才乘回 1/4
            const ba = w.alpha * 0.16 * Q.alpha * mul;
            B.globalAlpha = Math.min(1, ba * BB);
            ink += Lg * b.lw * 0.5 * ba * K[n - 1];
            // Andy（收的時候尖端被抹掉、剩下的尾巴越收越粗）：錐形改成「收到哪、哪裡就是新的尖端」——
            // 寬度照「離目前尾端 Rg 多遠 ÷ 剩下的長度」算，Rg 前面的寬度都是 0；跨在 Rg 上那一點挪到 Rg 的位置當尖端
            let j = 1; while (j < n - 1 && U[j] < R) j++;
            const fR = U[j] > U[j - 1] ? Math.max(0, Math.min(1, (R - U[j - 1]) / (U[j] - U[j - 1]))) : 1, Rg = G[j - 1] + (G[j] - G[j - 1]) * fR, Lr = Math.max(1e-6, Lg - Rg);
            const kR = j - 1, tip = { x: P[kR].x + (P[j].x - P[kR].x) * fR, y: P[kR].y + (P[j].y - P[kR].y) * fR };
            const Lp = [], Rp = [];   // 每個記錄點錐形兩側的角
            for (let i = 0; i < n; i++) {
                const lo = i && P[i].br ? i : Math.max(0, i - 1), hi = i + 1 < n && !P[i + 1].br ? i + 1 : i;   // 斷開處不跨過去算方向
                const p0 = P[lo], p1 = P[hi], dl = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1, q = i === kR && !P[j].br ? tip : P[i];
                const hw = Math.min(P[i].lw, b.lw) / 2 * Q.cone * Math.max(0, G[i] - Rg) / Lr,   /* Andy：寬度不超過頭端（現在）的字寬——急速縮小時尾巴的點是字很大時記的，舊版尾巴附近鼓成寬頭 */ nx = -(p1.y - p0.y) / dl * hw, ny = (p1.x - p0.x) / dl * hw;
                Lp.push([q.x + nx, q.y + ny]); Rp.push([q.x - nx, q.y - ny]);
            }
            // Andy（有些光帶完全沒淡、最後才一起消失）：漸層是沿「尾→頭的直線」畫的；光帶彎了（滑鼠邊縮放邊移、繞圈、來回）頭尾直線很短，
            // 所有控制點都擠在同一處＝整條同一個濃度。直的照舊一條漸層（省）；彎的改成每一段各自一條漸層，控制點一樣照長度灑
            const straight = Math.hypot(b.x - a.x, b.y - a.y) >= 0.9 * Lg && !P.some((q, i) => i && q.br);
            if (straight) {
                let lastO = 0; const g = B.createLinearGradient(a.x, a.y, b.x, b.y);
                for (let j = 0; j <= NS; j++) {
                    const u = Le * j / NS, [o, kk] = at(u), oo = Math.max(lastO, Math.min(1, o));
                    g.addColorStop(oo, col(u, kk)); lastO = oo;
                }
                B.fillStyle = g; B.beginPath();
                B.moveTo(Lp[0][0], Lp[0][1]);
                for (let i = 1; i < n; i++) B.lineTo(Lp[i][0], Lp[i][1]);
                for (let i = n - 1; i >= 0; i--) B.lineTo(Rp[i][0], Rp[i][1]);
                B.closePath(); B.fill();
            } else {
                // Andy（流星光帶一條一條斷斷續續）：舊版每一小段（6～7px）各畫一塊，接縫在縮小＋模糊後變成明暗紋。
                // 改成切成幾大塊「夠直」的（頭尾直線 ≥ 這塊路徑長的 97%），每塊一條漸層畫完，接縫只剩兩三條
                let s0 = 0;
                while (s0 < n - 1) {
                    if (P[s0 + 1].br) { s0++; continue; }
                    let e = s0 + 1;
                    while (e + 1 < n && !P[e + 1].br && Math.hypot(P[e + 1].x - P[s0].x, P[e + 1].y - P[s0].y) >= 0.97 * (G[e + 1] - G[s0])) e++;
                    const Lp2 = G[e] - G[s0];
                    if (Lp2 > 0.5) {
                        const sg = B.createLinearGradient(P[s0].x, P[s0].y, P[e].x, P[e].y), m = Math.max(1, Math.min(NS, Math.ceil(Lp2 / 14)));
                        let ii = s0 + 1;
                        for (let jj = 0; jj <= m; jj++) {
                            const gg = G[s0] + Lp2 * jj / m;
                            while (ii < e && G[ii] < gg) ii++;
                            const f = G[ii] > G[ii - 1] ? Math.max(0, Math.min(1, (gg - G[ii - 1]) / (G[ii] - G[ii - 1]))) : 1;
                            sg.addColorStop(jj / m, col(U[ii - 1] + (U[ii] - U[ii - 1]) * f, K[ii - 1] + (K[ii] - K[ii - 1]) * f));
                        }
                        B.fillStyle = sg; B.beginPath(); B.moveTo(Lp[s0][0], Lp[s0][1]);
                        for (let q = s0 + 1; q <= e; q++) B.lineTo(Lp[q][0], Lp[q][1]);
                        for (let q = e; q >= s0; q--) B.lineTo(Rp[q][0], Rp[q][1]);
                        B.closePath(); B.fill();
                    }
                    s0 = e;
                }
            }
            return true;
        };
        // 燃燒軌跡：宇宙座標換算到畫面，同時最多畫 trailD.cap 條（走得最快的優先）
        {
            const zv = _lhSpZv(), cand = _lhSp.words.filter(w => w.brn || w.brOld).sort((a, b) => (b.bv || 0) - (a.bv || 0));
            const cap = Math.max(1, LH_SP_TUNE.trailD.cap || 200);
            cand.forEach((w, i) => {
                for (const key of ['brOld', 'brn']) {
                    const P = w[key];
                    if (!P) continue;
                    for (const q of P) { const sp = _lhSpScr(q.wx, q.wy); q.x = sp.x; q.y = sp.y; q.lw = Math.max(2, q.lw0 * zv); }
                    if (i < cap ? !band(w, P, 1) : P.length && t - P[P.length - 1].t > 5000) w[key] = null;   // 超過上限的先不畫（太久沒動的照樣丟）
                }
            });
        }
        // 0.98.41 Andy（截圖：急速縮小時四周還留著上一輪放大「頭寬」的殘影，看起來像形狀畫反）：縮放方向一反轉，
        // 反轉前就有的縮放光帶（正在畫的、停過又動正在收的）全部照折返的方式在 trail.flip 毫秒內淡掉，不再照原本的慢速收
        const zfT = _lhSp.zFlipT, zfm = zfT ? 1 - (t - zfT) / Math.max(1, TT.flip ?? 150) : 1, zOld = P => zfT && P.g === 'B' && P.cam && P.t0 < zfT;
        for (const w of _lhSp.words) {
            if (w.trl && zOld(w.trl)) { w.trOld = { P: w.trl, t0: zfT }; w.trl = null; }
            const O = w.trOld;
            if (O) { const mul = 1 - (t - O.t0) / Math.max(1, TT.flip ?? 150); if (mul <= 0 || !band(w, O.P, mul)) w.trOld = null; }
            if (w.trl && !band(w, w.trl, 1)) w.trl = null;
            if (w.trRet) { w.trRet = w.trRet.filter(P => zOld(P) ? zfm > 0 && band(w, P, zfm) : band(w, P, 1)); if (!w.trRet.length) w.trRet = null; }   // 停過又動之前那幾條：照自己凍結的時間收完
        }
        if (bands.A || bands.B || bands.C || bands.D) {
            _lhSp.inkR = ink / (_lhSp.W * _lhSp.H);   // 測試／調參用：這一格光帶總量佔畫面幾成
            const capK = Math.min(1, _lhSp.W * _lhSp.H * Math.max(0.001, TT.cap ?? 0.1) / Math.max(1e-6, ink));
            _lhSp.bandK = (_lhSp.bandK ?? 1) + (capK - (_lhSp.bandK ?? 1)) * (capK < (_lhSp.bandK ?? 1) ? 0.5 : 0.1);   // 調淡快、回亮慢，不閃
            for (const k of ['A', 'B', 'C', 'D']) {
                if (!bands[k]) continue;
                if (_lhSp.bhScr) {   // Andy：黑洞附近的光帶被吸掉（越近越淡，核心裡全沒）
                    const Q = _lhSp.bhScr, x = BX[k], g = x.createRadialGradient(Q.x, Q.y, 0, Q.x, Q.y, Q.R * 0.7);
                    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(Math.min(0.99, Q.r * 1.3 / (Q.R * 0.7)), 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
                    x.globalCompositeOperation = 'destination-out'; x.fillStyle = g; x.fillRect(Q.x - Q.R, Q.y - Q.R, Q.R * 2, Q.R * 2); x.globalCompositeOperation = 'source-over';
                }
                const S2 = BC[k][1].getContext('2d'), sf = Math.max(0, TG(k).soft ?? 4) * BS;
                S2.clearRect(0, 0, bw, bh); S2.filter = sf > 0.2 ? 'blur(' + sf + 'px)' : 'none'; S2.drawImage(BC[k][0], 0, 0); S2.filter = 'none';
                M.globalAlpha = _lhSp.bandK / BB; M.drawImage(BC[k][1], 0, 0, _lhSp.W, _lhSp.H);
            }
        }
        _lhSp.trHold = { B: holdB, C: holdC }; _lhSp.trW = { B: swB, C: swC };
        M.globalAlpha = 1;
        if (live || _lhSp.zAcc > 0.003 || _lhSp.pAcc > 1 || mv > 0.01) _lhSp.dirty = true;   // 桶子還沒漏完、還有切片在停／在淡：繼續畫
        if (L.zoomTrail === 2 || mv >= 0.03) ghost = () => {   // 有詞要留疊影時才開切片（沒東西動就不花力氣）
            let s = _lhSp.slCur;
            if (!s || !s.used || t - s.t0 >= SLICE) {
                const cw = Math.ceil(_lhSp.W * RS), ch = Math.ceil(_lhSp.H * RS);
                s = SL.find(x => !x.used);
                if (!s) { if (SL.length < Math.min(24, Math.ceil(MAXA / SLICE) + 2)) SL.push(s = { c: document.createElement('canvas') }); else s = SL.reduce((m, x) => x.tEnd < m.tEnd ? x : m); }   // ponytail: 片數夠蓋住最長殘留（最多 24 片），超過才重用最舊的
                if (!s.x || s.c.width !== cw || s.c.height !== ch) { s.c.width = cw; s.c.height = ch; s.x = s.c.getContext('2d'); } else { s.x.setTransform(1, 0, 0, 1, 0, 0); s.x.clearRect(0, 0, cw, ch); }
                s.x.setTransform(RS, 0, 0, RS, 0, 0);
                Object.assign(s, { used: true, t0: t, tEnd: t, hold, w: 0, d: 0, dT: 0 });
                _lhSp.slCur = s;
            }
            s.tEnd = t; if (hold > s.hold) s.hold = hold; s.w = Math.max(s.w, Math.min(1, sw));
            if (s.dT !== t) { s.dT = t; s.d += fd; }   // 這片累計畫面動了多遠（照長度收尾巴用）
            return s.x;
        };
    }
    const vis = w => { const p = _lhSpWS(w); return p.x > -200 && p.x < _lhSp.W + 200 && p.y > -80 && p.y < _lhSp.H + 80 ? p : null; };
    const pill = (p, w, m) => {   // 詞外面的膠囊（畫面座標）
        const fs = 16 * w.s * z * m, hw = w.tw * z * m / 2 + fs * 0.55, hh = fs * 0.85;
        c.beginPath();
        if (c.roundRect) c.roundRect(p.x - hw, p.y - hh, hw * 2, hh * 2, hh); else c.rect(p.x - hw, p.y - hh, hw * 2, hh * 2);
    };
    // 0.98.22.11 Andy（縮很小時黑洞放大的字是糊的）：小圖照目前縮放畫（省效能），黑洞再放大 2～3 倍就是把小圖硬拉大。
    // 只替「正在被放大」的那幾十個字另外畫一張夠大的清楚小圖（每格最多新畫 12 張，不卡），離開黑洞就丟掉；其他字照舊
    let hiBudget = 12;
    const hiSpr = (w, m) => {
        if (m <= 1.12) { if (w.sprH) w.sprH = null; return w.spr; }
        const need = Math.min(LH_SP_SMAX * 2, _lhSpBucket(z * _lhSp.dpr * m));
        if (need <= w.spr.S * 1.05) return w.spr;
        if (w.sprH && w.sprH.S >= need * 0.95) return w.sprH;
        if (hiBudget-- > 0) { w.sprH = _lhSpSprite(w, need); return w.sprH; }
        return w.sprH && w.sprH.S > w.spr.S ? w.sprH : w.spr;   // 這格額度用完：先用手上最清楚的，下一格再補
    };
    const blit = (w, p, m = 1) => {
        const sw = w.spr.width / w.spr.S * z * m, sh = w.spr.height / w.spr.S * z * m, f = w.gFocus;
        if (f !== undefined && f < 1) {   // 0.98.22.11 Andy：凝聚中的行星字從大模糊慢慢對焦
            // 再改：只有「全糊／全清」兩張交叉淡時，清楚那張一有兩三成濃度，眼睛就先抓到俐落的邊＝看起來一出來就清楚。
            // 改成 4 階（大糊 → 中糊 → 小糊 → 清楚），每次只在相鄰兩階之間交叉淡，像鏡頭慢慢轉焦；清楚版最後一段才出現
            const pos = (1 - f) * 3, i = Math.min(2, Math.floor(pos)), fr = pos - i, ga = c.globalAlpha;
            for (const [lv, al] of [[i, 1 - fr], [i + 1, fr]]) {
                if (al <= 0.001) continue;
                const B = lv ? _lhSpBlurSpr(w, lv) : w.spr, bw = B.width / w.spr.S * z * m, bh = B.height / w.spr.S * z * m;
                c.globalAlpha = ga * al; c.drawImage(B, p.x - bw / 2, p.y - bh / 2, bw, bh);
            }
            c.globalAlpha = ga; return;
        }
        const sp = hiSpr(w, m);
        if (sp !== w.spr) { const hw = sp.width / sp.S * z * m, hh = sp.height / sp.S * z * m; c.drawImage(sp, p.x - hw / 2, p.y - hh / 2, hw, hh); return; }
        c.drawImage(w.spr, p.x - sw / 2, p.y - sh / 2, sw, sh);
    };
    // 星座線（0.98.22.11：保留詞／骰子／AI 三種，同一套畫法、各自顏色；最顯眼的一種照原樣，另外兩種整組乘 con.dim）
    const conLines = (segs, col, mul, flash) => {
        // 0.98.14.3 Andy：光暈跟著縮放變粗變細（不然像雷射筆）；用「這次的 100%」當基準、取平方根，放大縮小都柔一點
        const zk = Math.min(2.4, Math.max(0.45, Math.sqrt(z / _lhSpZ100())));
        c.save();
        c.strokeStyle = col; c.lineJoin = 'round'; c.lineCap = 'round';
        c.beginPath();
        // 0.98.41 Andy：星座線不受黑洞影響，一律直線（拿掉重力透鏡）
        for (const [a, b] of segs) { const p = _lhSpWS(a), q = _lhSpWS(b); c.moveTo(p.x, p.y); c.lineTo(q.x, q.y); }
        if (L.lineGlow) {   // 第 4 級起：光暈由外而內一層層描（越外越寬越淡），整體慢慢呼吸（一輪約 5.6 秒，跟第 5 級的閃爍各走各的）
            const GL = LH_SP_TUNE.glow, br = L.lineGlow === 'still' ? 0.8 : 1 - GL.lineDepth + GL.lineDepth * Math.sin(t / (GL.lineBreath * 1000) * Math.PI * 2);   // 'still'＝第 2 級：光暈固定不呼吸（不用每格重畫）
            for (const [wd, al] of [[18, 0.025], [11, 0.045], [6.5, 0.08], [3.5, 0.14]]) { c.globalAlpha = al * br * mul; c.lineWidth = wd * zk; c.stroke(); }
        }
        c.globalAlpha = 0.85 * mul; c.lineWidth = 1.5 * Math.min(1.6, Math.max(0.7, zk));
        c.shadowColor = c.strokeStyle; c.shadowBlur = 5 * zk;
        c.stroke();
        c.shadowBlur = 0;
        if (L.lineFlash && flash) {   // 第 5 級：所有星座線一起閃（1.2 秒，每秒約 20% 機率；0.98.10 之後從「每條各自閃」改成整體一起）
            const dt = Math.min(0.2, (t - (_lhSp.lineT || t)) / 1000);
            _lhSp.lineT = t;
            const GL = LH_SP_TUNE.glow;
            if (_lhSp.lineTw && t - _lhSp.lineTw > GL.flashLen) _lhSp.lineTw = 0;
            if (!_lhSp.lineTw && Math.random() < dt * L.lineFlash * GL.flashRate) _lhSp.lineTw = t;
            if (_lhSp.lineTw) {
                const f = GL.flash * Math.sin(Math.min(1, (t - _lhSp.lineTw) / GL.flashLen) * Math.PI);   // 上面那條路徑還在，直接再描幾層（寬度一樣跟著縮放）
                for (const [wd, al] of [[15, 0.12], [8, 0.28], [4, 0.5], [2.2, 0.95]]) { c.globalAlpha = al * f * mul; c.lineWidth = wd * zk; c.stroke(); }
            }
        }
        c.restore();
    };
    {
        const CT = LH_SP_TUNE.con, mode = _lhSp.mode, D = Math.max(0, CT.dim);
        const kinds = [['pin', _lhSp.segs, _lhSp.cLineNow || _lhSp.cLine], ['dice', _lhSp.cons.dice && _lhSp.cons.dice.segs, _lhSp.cDice], ['ai', _lhSp.cons.ai && _lhSp.cons.ai.segs, _lhSp.cAi]]
            .filter(k => k[1] && k[1].length).map(k => [...k, (k[0] === 'pin' ? !mode : mode === k[0]) ? 1 : D]).sort((a, b) => a[3] - b[3]);   // 淡的先畫、亮的蓋在上面
        // 第 5 級：線段交錯圍出的封閉多邊形，用幾乎透明的顏色塗（跟最靠近的那顆星同色系，相鄰的塊色相錯開一點）
        if (L.gather && CT.fill > 0) for (const [kind, segs, , mul] of kinds) {
            const sets = kind === 'pin' ? [segs] : _lhSp.cons[kind].groups.map(g => segs.filter(([a, b]) => g.includes(a) && g.includes(b)));
            for (const ss of sets) {
                if (ss.length < 3) continue;
                const ws = [...new Set(ss.flat())].map(w => [w, _lhSpWS(w)]);
                _lhSpConFaces(ss).forEach((f, fi) => {
                    const cx = f.reduce((a, p) => a + p.x, 0) / f.length, cy = f.reduce((a, p) => a + p.y, 0) / f.length;
                    const near = ws.reduce((m, x) => Math.hypot(x[1].x - cx, x[1].y - cy) < Math.hypot(m[1].x - cx, m[1].y - cy) ? x : m)[0];
                    c.globalAlpha = CT.fill * mul; c.fillStyle = _lhSpHue(near.rgb, ((fi * 7) % 5 - 2) * 9);
                    c.beginPath(); c.moveTo(f[0].x, f[0].y); for (let i = 1; i < f.length; i++) c.lineTo(f[i].x, f[i].y); c.closePath(); c.fill();
                });
            }
        }
        // 0.98.22.11 Andy：骰子＝黃色系、AI＝綠色系；同一種有好幾個星座時，每個星座色相錯開一點
        const GH = [0, -14, 12, -24, 22, -6, 6, 17];
        for (const [kind, segs, col, mul] of kinds) {
            if (kind === 'pin') { conLines(segs, col, mul, mul === 1); continue; }
            _lhSp.cons[kind].groups.forEach((g, gi) => conLines(segs.filter(([a, b]) => g.includes(a) && g.includes(b)), _lhSpHue(col, GH[gi % GH.length]), mul, mul === 1));
        }
        c.globalAlpha = 1;
    }
    // 星系一張圖：有詞正在動（停住、放大、拖著、還在浮現）的那一團，這一格改回一個個詞畫
    const asImg = new Set();
    if (L.img && _lhSp.S <= 2) {   // 0.98.15.5：放大後（倍率 > 2）第 2 級改回一詞一圖，星系圖不畫成超大張
        const live = new Set(), drag = _lhSp.drag && _lhSp.drag.w;
        for (const w of _lhSp.words) if (w.cl && (!w.born || t - w.born < 900 || w.hot || w.free || w === drag || w.mag > 1.01 || w.fox || w.foy || w.off || w.vis < 1)) live.add(w.cl);
        for (const cl of _lhSp.groups) {
            if (live.has(cl)) continue;
            const im = _lhSpClImg(cl);
            if (!im) continue;
            asImg.add(cl);
            const o = _lhSpScr(cl.x, cl.y), k = z * cl.b / im.S;
            const x = o.x + im.x0 * z * cl.b, y = o.y + im.y0 * z * cl.b, wd = im.c.width * k, ht = im.c.height * k;
            if (x > _lhSp.W || y > _lhSp.H || x + wd < 0 || y + ht < 0) continue;
            c.drawImage(im.c, x, y, wd, ht);
        }
    }
    // 看全息標籤的恆星大幅提亮（0.98.14.6／.12）：放射光暈＋彩色發光描好幾層＋疊加提亮，0.3 秒亮起來。
    // 一般、黑洞放大中（滑鼠停住時恆星會被放大，走 mags）、停住／釘住（top）三條路都要呼叫
    const starHi = (w, p, m, a) => {
        if (!_lhSp.holo || _lhSp.holo.w !== w || w.dim) return;
        // 夾 ≥ 0：t0 是滑鼠事件當下的時間，這一格的 rAF 時間可能比它早 → k 變負數，負的 globalAlpha 會被忽略、沿用全亮 → 先閃一下（0.98.14.15 修）
        // 0.98.22.11 Andy：行星等完全煞停（bkT）才亮光暈，不跟全息面板同時；恆星、流星照舊跟面板一起
        const pt = w.cl && !w.star && !w.comet, t0 = pt ? (w.bkT || Infinity) : _lhSp.holo.t0;
        const k = Math.max(0, Math.min(1, (t - t0) / 300));
        if (k < 1) _lhSp.dirty = true;
        // 0.98.14.15 Andy：亮度、光暈再大幅提高，但光暈半徑最多＝這個星系半徑的一半（照目前縮放與呼吸）
        // 0.98.22.11 Andy：行星（和流星）的光暈小很多、暗很多——半徑約一半、濃度 35%；恆星維持原樣
        const pl = !w.star, R = Math.min(Math.max(60, w.tw * z * m) * 1.8, w.cl ? w.cl.r * z * (w.cl.b || 1) / 2 : 1e9) * (pl ? 0.5 : 1);
        const g = M.createRadialGradient(p.x, p.y, 0, p.x, p.y, R);
        const kg = k * (pl ? 0.35 : 1);   // 只有光暈變暗，字的提亮照舊
        // 0.98.15.3 Andy：中心太濃不像光暈 → 中心降到 0.3、多幾個 stop 讓衰減更平滑
        g.addColorStop(0, _lhSpRGBA(w.rgb, 0.3 * kg)); g.addColorStop(0.3, _lhSpRGBA(w.rgb, 0.16 * kg)); g.addColorStop(0.6, _lhSpRGBA(w.rgb, 0.06 * kg)); g.addColorStop(1, _lhSpRGBA(w.rgb, 0));
        M.fillStyle = g; M.globalAlpha = 1; M.fillRect(p.x - R, p.y - R, R * 2, R * 2);   // 光暈畫在主畫布（不留殘影）
        // 0.98.15.6 Andy：字不再描發光層（太亮），改成跟閃爍一樣：字本身疊加提亮兩次、微微放大 6%
        const mk = m * (1 + 0.06 * k);
        c.save(); c.globalCompositeOperation = 'lighter';
        c.globalAlpha = 0.45 * k; blit(w, p, mk); c.restore();   // 0.98.16 Andy：再調低（兩層 0.8＋0.5 → 一層 0.45）
        c.globalAlpha = a;
        };
    if (L.sand) _lhSpBhStreams(M, t, z);   // 第 5 級：被吸的東西拉成麵條潮汐流（畫在字底下）
    const top = [], mags = [];
    const CM = _lhSp.mode && _lhSp.cons[_lhSp.mode], conF = CM ? (CM.fset ??= new Set(CM.groups.flat())) : null;   // 骰子／AI 星座裡的星（閃爍用）
    for (const w of _lhSp.words) {
        if (!w.born || !w.spr || w.vis <= 0.01 || w.cmWait) continue;   // cmWait：流星出界休息中
        if (w.cl && asImg.has(w.cl) && w.cl.img.ws.has(w)) continue;   // 已經在星系圖裡
        const p = vis(w);
        if (!p) continue;
        // 0.98.18 Andy：只有「在畫面上真的在動」的詞才畫進殘影層（照這一格跟上一格的螢幕位移＋大小變化）；
        // 縮放中心附近的詞幾乎沒位移，留在主畫布 → 不會疊成一團粗糙的光暈；外圈跑得快的行星才拖尾巴
        let rec = false;   // 這一格有沒有記點
        if (L.zoomTrail) {
            // Andy bug（滑鼠在畫布上就沒殘影）：快不快改看「沒被黑洞放大／魚眼推開」的原始位置 pu——移動滑鼠不會誤觸發，
            // 字自己在動時就算在黑洞範圍內也照常留殘影（記點仍記在畫面上看到的位置 p）
            const gap = _lhSp.trGap, pu = _lhSpScr(w.px, w.py), x0 = gap ? p.x : w.lsx ?? p.x, y0 = gap ? p.y : w.lsy ?? p.y;
            const mv1 = gap ? 0 : Math.hypot(pu.x - (w.lux ?? pu.x), pu.y - (w.luy ?? pu.y));
            const ds = mv1 + (gap ? 0 : Math.abs(z - (w.lsz ?? z)) * w.tw * 0.5);
            w.lsx = p.x; w.lsy = p.y; w.lux = pu.x; w.luy = pu.y; w.lsz = z;
            w.spd = Math.max(ds, (w.spd || 0) * 0.85);   // 停下來後慢慢退，不會一格有疊影、一格沒有而閃
            // 停住、釘住、放大中的詞不留疊影（永遠清清楚楚）
            // 這個詞屬於哪一組：凝聚中、被沖散＝A；被甩出去＝B；鏡頭在縮放＝B、在拖＝C；鏡頭沒動、自己繞著走（公轉、流星）＝D
            // 鏡頭殘影只剩兩組：鏡頭在縮放＝B、在拖＝C、被甩出去的詞＝B。自己動（凝聚）和公轉改成下面的「燃燒軌跡」，另外記、不會互相切組打斷
            const smC = _lhSp.smOnG && _lhSp.smOnG.C, grp = w.free && w.src !== 'A' ? (smC ? null : 'C') : _lhSp.camOn && _lhSp.camMv ?   /* Andy：鏡頭這一格真的有動才記鏡頭光帶（停手後公轉不會被當成拖畫布、一直把光帶延長） */ (smC && _lhSp.camG === 'C' ? null : (_lhSp.camG || 'B')) : null;   // 煙霧模式：拖畫布交給煙霧層   // Andy bug：鏡頭在動時，凝聚中／還在擺盪的行星也照鏡頭那組判斷（不然小範圍來回滾，只有停不下來的中心那團拖殘影）   // 自己動的比較慢：門檻放低
            if (ghost && !(_lhSp.nav && _lhSp.nav.w) && grp && w.spd > 1.5 && !w.dim && !w.pinned) {   /* Andy：被 hover、黑洞放大、魚眼推開中的也照常留殘影（舊版排除，滑鼠一放上畫布大半的字都沒殘影） */
                // 0.98.22.11 Andy：放很大時一下縮小，超大的字疊影會停在螢幕上很尷尬 → 畫面上字高超過 trail.ghostMax 像素的不留字的疊影（光帶照留）
                // 這個詞屬於哪一組：凝聚中、被沖散＝A（自己在動）；其他（鏡頭在動、被甩出去）＝B
                const TQ = grp === 'C' ? LH_SP_TUNE.trailC : LH_SP_TUNE.trail;
                // 0.98.22.11 Andy：字的殘影不再一格格疊進全螢幕切片（一大堆切片、又重），改成每條光帶只在「最尾巴」留一個字（見上面光帶段 band()）
                // 0.98.18.3 Andy：上一格到這一格之間用光帶連起來；0.98.22.7 改成記點（上面殘影段現場畫），每 4px 記一點、最多 60 點
                if (mv1 > 2) {
                    rec = true;
                    // 快不快（0～1）與暫停多久：A 看這個詞自己在畫面上的速度；B 看鏡頭，被甩出去的再跟自己的速度取大的
                    const own = w.free ? Math.hypot(w.fvx, w.fvy) * z : 0, thr = (v, Q) => Math.max(0, Math.min(1, (v - Q.min) / (1 - Math.min(0.99, Q.min))));
                    let k, hh;
                    { const kf = w.free ? thr(own / 1500, TQ) : 0; k = Math.max((_lhSp.trW && _lhSp.trW[grp]) || 0, kf); hh = Math.max((_lhSp.trHold && _lhSp.trHold[grp]) || 0, TQ.hold * kf); }
                    {
                    if (w.trl && w.trl.g !== grp) { w.trOld = { P: w.trl, t0: t }; w.trl = null; }   // 換組了（例如甩完被拉回）：舊的那條照折返的方式淡掉，新的重來
                    if (!w.trl) { w.trl = []; w.trl.g = grp; w.trl.t0 = t; w.trl.cam = !w.free; }
                    let P = w.trl, q = P[P.length - 1]; const h = Math.max(hh, q ? q.h : 0), lw = Math.max(2, (w.tw || 40) * z * (w.kb || 1));   // 錐形頭端的寬＝字在畫面上的寬（×各組錐形程度）
                    // Andy bug（光帶在收的時候，滑鼠停住沒放開、又繼續拖 → 整條重新亮起來）：收的進度是從「最後一點的時間」算的，再動一下就歸零。
                    // 改成停過 0.1 秒又動：舊的那條凍結它開始收的時間（t0r／h0），自己照常收完（w.trRet），新的動作另外長一條
                    if (grp !== 'C' && P.length > 1 && q && (P.t0r !== undefined || ((P.rp || 0) > 0.02 && P.t0rL !== undefined))) {   // 已經開始收了（上一格畫的時候 rp＞2%）：凍結、另起一條（舊版看「停 0.1 秒＋位置差 1px」，停住時位置沒變＝永遠不成立）
                        if (P.t0r === undefined) { P.t0r = P.t0rL; P.h0 = P.h0L; P.retT = t; }
                        (w.trRet || (w.trRet = [])).push(P); if (w.trRet.length > 4) w.trRet.shift();
                        const cam = P.cam; P = w.trl = []; P.g = grp; P.t0 = t; P.cam = cam; q = undefined;
                    }
                    const far = mv1 >= 600;   // 一格跳太遠（換位置、瞬移）：斷開，不連一條長線
                    if (!q || (t - q.t > 100 && Math.hypot(q.x - x0, q.y - y0) > 1) || far) P.push({ x: far ? p.x : x0, y: far ? p.y : y0, t, h, k, lw, br: true });   // Andy bug（拖畫布光帶一段段、收的時候整塊不見）：舊版每格走 2～6px 時都被當成「斷過」插斷點；改成真的停過 0.1 秒以上才斷
                    let q2 = P[P.length - 1];
                    const q1 = P[P.length - 2];
                    if (q1 && !q2.br && Math.hypot(q2.x - p.x, q2.y - p.y) >= 6) {   // 折返：跟上一段夾角超過 120°
                        const ax = q2.x - q1.x, ay = q2.y - q1.y, bx = p.x - q2.x, by = p.y - q2.y, la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
                        if (grp !== 'C' && la > 3 && (ax * bx + ay * by) < -0.5 * la * lb) { w.trOld = { P, t0: t }; w.trl = [{ ...q2, br: false }]; w.trl.g = grp; w.trl.t0 = t; w.trl.cam = P.cam; }
                    }
                    const P2 = w.trl; q2 = P2[P2.length - 1];
                    if (Math.hypot(q2.x - p.x, q2.y - p.y) >= 6) P2.push({ x: p.x, y: p.y, t, h, k, lw });
                    else Object.assign(q2, { t, h: Math.max(q2.h, h), k: Math.max(q2.k, k) });
                    if (P2.length > 60) for (let i = 1; i < 30 && i < P2.length - 1; i++) if (!P2[i].br && !P2[i + 1].br) P2.splice(i, 1);   // ponytail: 每詞約 60 點上限：太多就把舊的一半抽稀（形狀留著、不剪尾巴）
                    }
                }
            }
        }
        // Andy 燃燒軌跡（自己動＝凝聚／沖散 A、公轉＝其他自己在走的 D，只在第 5 級）：像流星一樣一直拖著，不看門檻。
        // 點記在宇宙座標（wx／wy），畫的時候才換算到畫面 → 縮放、拖畫布時跟著宇宙走、不會斷。
        // 在動：只留最近 life 毫秒；停下來（0.15 秒內每秒走不到 2px）：頭的時間凍住＝秒數規則不再作用，完全交給「每秒吃幾個控制點」從尾巴吃完
        if (L.zoomTrail === 2 && !w.dim && !_lhSp.trGap) {
            let bg = w.free ? (w.src === 'A' ? 'A' : null) : 'D';   // 被甩出去的照鏡頭組（B），不燒
            if (bg && _lhSp.smOnG && _lhSp.smOnG[bg]) bg = null;   // 這組開了煙霧：不畫光帶
            const Z = _lhSp.z, dts = Math.max(0.004, _lhSp.trDts || 0.016);
            const vx = (w.px - (w.bwx ?? w.px)) * Z / dts, vy = (w.py - (w.bwy ?? w.py)) * Z / dts, v = Math.hypot(vx, vy);   // 自己在宇宙裡走多快（換算成畫面 px／秒，不含鏡頭）
            w.bac = (w.bac || 0) + (Math.hypot(vx - (w.bvx ?? vx), vy - (w.bvy ?? vy)) / dts - (w.bac || 0)) * Math.min(1, dts * 6);   // 加速度平滑（約 0.17 秒），不然每格跳、濃淡會閃
            w.bwx = w.px; w.bwy = w.py; w.bvx = vx; w.bvy = vy; w.bv = v;
            if (w.brn && w.brn.g !== bg) { w.brOld = w.brn; w.brn = null; }   // 凝聚完變公轉：舊的照吃控制點收完
            if (bg) {
                if (v >= 4) w.brSlow = 0; else if (v < 2 && !w.brSlow) w.brSlow = t;
                const moving = !w.brSlow || t - w.brSlow < 150;
                if (moving) {
                    if (w.brStop && w.brn) { w.brOld = w.brn; w.brn = null; }   // 停過又走：吃到一半的那條自己收完，新的重來（不然被吃掉的又長回來）
                    w.brStop = false;
                    const Q = bg === 'A' ? LH_SP_TUNE.trailA : LH_SP_TUNE.trailD;
                    const k = bg === 'A' ? 1 + (Q.spd || 0) * Math.min(1, v / 600) + (Q.acc || 0) * Math.min(1, w.bac / 3000) : 1;   // 自己動：越快、加速度越大越濃
                    let P = w.brn;
                    if (!P) { P = w.brn = []; P.g = bg; P.t0 = t; }
                    const pt = { wx: w.px, wy: w.py, t, h: 0, k, lw0: (w.tw || 40) * (w.kb || 1) };
                    if (!P.length) P.push({ ...pt });   // 第一個固定點要另一個物件（不然跟尖端是同一個，永遠長不出來）
                    const tip = P[P.length - 1], prev = P[P.length - 2];
                    if (!prev || Math.hypot(tip.wx - prev.wx, tip.wy - prev.wy) * Z >= 6) P.push(pt);   // 尖端離上一個固定點 6px 了：固定下來，再長一個新尖端
                    else Object.assign(tip, { wx: w.px, wy: w.py, t, k: Math.max(tip.k, k) });
                    if (P.length > 60) for (let i = 1; i < 30 && i < P.length - 1; i++) P.splice(i, 1);   // ponytail: 每條約 60 點上限，太多就抽稀
                } else w.brStop = true;
            }
        }
        // 煙霧：只看星星自己在宇宙裡走了多遠（拖畫布、縮放、移動滑鼠都不冒煙）；從上一格的宇宙位置（換算到現在的畫面）蓋到現在的位置
        if (_lhSp.smOnG && _lhSp.smOnG.D && !w.dim) {
            const q = _lhSpScr(w.px, w.py), had = w.smwx !== undefined, l = had ? _lhSpScr(w.smwx, w.smwy) : q, lx = l.x, ly = l.y, dd = Math.hypot(q.x - lx, q.y - ly);
            if (!had || dd >= 1 || dd >= 600 || _lhSp.trGap) { w.smwx = w.px; w.smwy = w.py; w.smdt = (t - (w.smt ?? t)) / 1000; w.smt = t; }   // 走不到 1px 先不動起點：慢慢公轉的也會累積到冒煙（舊：每格重設，慢的永遠沒煙）
            const sg = w.free ? (w.src === 'A' && !(w.gk && (w.gp ?? 0) >= 0.95) && !(w.smHome = w.smHome || (!w.gk && (w.odist ?? 1e9) < (w.tw || 40) * 0.5)) ? 'A' : _lhSp.smOnG.C ? 'D' : null) : 'D';   // 凝聚、沖散＝A（凝聚的行星自己走完 95%、被沖散的回到離家半個字寬內，就算公轉：大星系有的一直擺盪、停不下來，不然會一直用凝聚的煙）；甩出去的歸拖畫布系統（煙霧模式冒公轉的煙、光帶模式畫 trailC 光帶）；其他（公轉、流星）＝D
            // 凝聚：每顆行星自己凝聚到 smA.from 才開始冒煙（之後 2 秒淡入）——行星陸續加入，打開宇宙那一刻不會一起噴
            const SMK = sg && LH_SP_TUNE['sm' + sg], gs = sg === 'A' && w.gk ? ((w.gp ?? 1) < SMK.from ? (w.smT0 = 0) : (w.smT0 || (w.smT0 = t), (k => k * k * (3 - 2 * k))(Math.min(1, (t - w.smT0) / 2000)))) : 1;   // Andy：到 from 後花 2 秒慢慢冒出來（平滑曲線），不是突然起火
            const S = sg && gs > 0 && SMK.alpha > 0 && _lhSp.smk3 && _lhSp.smk3[sg];   // 濃淡 0＝不冒（省效能）
            if (S && had && !_lhSp.trGap && _lhSp.smBudget > 0) {
                const d = Math.hypot(q.x - lx, q.y - ly);
                if (d >= 1 && d < 600) {
                    // 煙團：順著前進方向拉長（形狀越接近火焰拉越長、細絲越多），走越快越稀（每秒噴的煙一樣多）
                    const v0 = d / Math.max(0.004, w.smdt || _lhSp.trDts || 0.016), v = w.smv = w.smv === undefined ? v0 : w.smv + (v0 - w.smv) * 0.3, boost = Math.max(0.15, Math.min(4, 200 / Math.max(5, v)));   // 速度先平滑（在原地抖的行星不會一下一團濃煙＝閃）
                    const shp = Math.max(0, Math.min(1, SMK.shape)), ww = (w.tw || 40) * z * (w.kb || 1), r = Math.max(3, ww * 0.5 * (SMK.len ?? 1)), wd = Math.max(2, ww * (SMK.wid ?? 1));   // 長：字寬一半×len；寬：字寬×wid（1＝跟字一樣寬）
                    const len = r * (1 + 2 * shp * Math.min(1, 0.4 + v / 500)), gap = len * 0.35;
                    const n = Math.min(12, Math.ceil(d / (gap * _lhSp.smGapK))), ang = Math.atan2(q.y - ly, q.x - lx), ca = Math.cos(ang), sa = Math.sin(ang);
                    _lhSp.smNeed += Math.ceil(d / gap);
                    const back = len * 0.5 + (SMK.gap ?? 1) * 0.25 * ((w.tw || 40) + 16 * (w.s || 1)) * z * (w.kb || 1);   // 煙不超前：最前端在星球中心後面 gap×半個星球（smD／smA.gap，0＝前端貼在中心）
                    S.x.globalAlpha = Math.min(1, gs * 0.6 * 0.25 * boost * (w.alpha ?? 1) * Math.min(_lhSp.smGapK, d / n / gap) * 4);   // 間距被拉開幾倍、每團就濃幾倍（總量不變）
                                        for (let i = 1; i <= n; i++) {
                        const f = i / n, cx = (lx + (q.x - lx) * f - ca * back) * 0.5, cy = (ly + (q.y - ly) * f - sa * back) * 0.5;
                        const img = _lhSpGlowImg(_lhSpSmRGB(w.rgb));   // Andy：髮絲整套不要了（_lhSpWispImg 暫留未用），煙團一律軟光點
                        S.x.setTransform(ca, sa, -sa, ca, cx, cy); S.x.drawImage(img, -len * 0.5, -wd * 0.5, len, wd);
                    }
                    S.x.setTransform(1, 0, 0, 1, 0, 0);
                    S.x.globalAlpha = 1; _lhSp.smBudget -= n; S.last = t; S.clean = false;
                }
            }
        }
        // Andy（以滑鼠為中心快速縮放：頭沒對在字上，粗底座立在虛空）：縮放尾聲每格移動太小就不再記點，字卻還在慢慢滑——
        // 沒記點的格子，頭端直接黏回字目前的位置（只搬位置，不動時間、不延後收尾）
        if (!rec && w.trl && w.trl.length > 1) { const q = w.trl[w.trl.length - 1]; if (!q.br) { q.x = p.x; q.y = p.y; } }
        if ((w.star || w.rising) && L.starGlow && !w.dim) {   // 0.98.09：第 4 級起恆星自帶光暈（接任中的也先亮）；放大、釘住、停住時也畫（先畫，墊在所有字後面）
            const R = (w.cl ? w.cl.r * LH_SP_TUNE.glow.starSize : w.tw) * _lhSpZv() * (w.kb || 1) * (w.mag || 1);   // 光暈半徑＝自己星系半徑的 1/2，中心濃度 13%
            // 0.98.15.6：每種顏色先畫好一張 128px 的光暈圖，每格只貼上去放大（以前每顆恆星每格算一次幾百 px 的放射漸層，筆電內顯最吃這個，約占第 5 級的 4 成）
            // 0.98.16 Andy：中心濃度 0.13→0.18；這顆恆星剛好被抽到閃爍時，光暈跟著暫時亮到 2 倍
            const GL = LH_SP_TUNE.glow, tg = w.twk ? Math.sin(Math.min(1, (t - w.twk) / GL.twLen) * Math.PI) : 0;   // 數字在 LH_SP_TUNE.glow
            // 0.98.22.11 Andy：混沌凝聚時恆星的光分三段亮（進度＝整團行星已走完的距離比例）：
            // 日冕（熱浪跟著）從 gather.litCorona（7 成）亮到凝聚完成；光暈從 gather.litGlowAt（9 成）起花 litGlowDur 秒（8）亮滿；光芒從凝聚完成起花 litRayDur 秒（8）亮滿
            const cl = w.cl, GG = LH_SP_TUNE.gather, sm3 = x => x * x * (3 - 2 * x), wait = cl && cl.gWait === t;
            const gat = !wait && cl && cl.gD0 > 0, g0 = !gat ? 1 : cl.gF === t ? 1 - cl.gDn / cl.gD0 : 1;
            if (gat && (cl.gF !== t || g0 >= 0.98 || cl.gStall) && !cl.gDoneT) cl.gDoneT = t;   // 保險：整團走完 98% 也算完成；Andy：大星系卡在 92～95%（有幾顆一直擺盪）——過 75% 後 1.5 秒內前進不到 2% 也算完成
            if (gat && g0 >= GG.litGlowAt && !cl.gGlowT) cl.gGlowT = t;
            const after = (t0, sec) => t0 ? sm3(Math.min(1, (t - t0) / Math.max(1, sec * 1000))) : 0;
            const LC = Math.min(0.99, GG.litCorona);
            const litC = wait ? 0 : !gat ? 1 : sm3(Math.max(0, Math.min(1, (g0 - LC) / (1 - LC))));
            const litG = wait ? 0 : !gat ? 1 : after(cl.gGlowT, GG.litGlowDur), litR = wait ? 0 : !gat ? 1 : after(cl.gDoneT, GG.litRayDur);
            if (litC > 0 || litG > 0 || litR > 0 || (gat && !wait)) {
                const a0 = w.alpha, aE = a0 * (w.bhA ?? 1) * (w.star && L.sand && cl.stK ? 1 - 0.5 * cl.stK : 1);   // aE：黑洞附近光暈、日冕、熱浪、光芒被吸掉（字本身不受影響）
                M.globalAlpha = Math.min(1, Math.min(1, aE * litG * (1 + tg * GL.twBoost)) * 0.13 * GL.star / 3);   /* Andy：上限再開——舊寫法亮度乘完就被夾在 1，3 倍以上根本沒變；改成 3 倍＝原本的樣子，往上照比例真的變亮 */ { const sk = w.star && L.sand && cl.stK && _lhSp.bhScr ? cl.stK : 0;   // Andy：光暈被吸＝能量被剝奪——整團變淡、往黑洞那側偏、被拉長
                  if (sk) { const Qb = _lhSp.bhScr, an = Math.atan2(Qb.y - p.y, Qb.x - p.x); M.globalAlpha *= 1 - 0.45 * sk; M.save(); M.translate(p.x + Math.cos(an) * R * 0.5 * sk, p.y + Math.sin(an) * R * 0.5 * sk); M.rotate(an); M.scale(1 + 1.1 * sk, 1 - 0.35 * sk);   /* 0.98.41 Andy：光暈跟星塵是一體——整團往黑洞那側被拉長、偏過去，接上星塵的起點 */ M.drawImage(_lhSpGlowImg(w.rgb), -R, -R, R * 2, R * 2); M.restore(); }
                  else M.drawImage(_lhSpGlowImg(w.rgb),   /* 0.98.18.4 Andy：中心再暗（0.18→0.13） */ p.x - R, p.y - R, R * 2, R * 2); }
                // 熱浪（0.98.22.11 Andy）：凝聚 0 → gather.litHeatTo（7 成）就亮完，比日冕早
                const litH = wait ? 0 : !gat ? 1 : sm3(Math.max(0, Math.min(1, (g0 - (GG.litHeatFrom ?? 0.2)) / Math.max(0.01, GG.litHeatTo - (GG.litHeatFrom ?? 0.2)))));   // Andy：熱浪從凝聚 litHeatFrom（2 成）亮到 litHeatTo（6 成）
                w.alpha = aE * litC; w.aRay = aE * litR; w.aHeat = aE * litH;
                if (L.starFx && w.star) _lhSpStarFx(M, w, p, t, z);
                w.alpha = a0; w.aRay = w.aHeat = undefined;
            }
        }
        if (w.comet && !w.dim && L.tail) {   // 流星尾巴：一整條往後漸細、漸淡的光（連續漸層，不分段），長度＝約 0.8 秒走的路（速度 3 倍後縮短）；放大、釘住時也畫（先畫，墊在字後面）
            const z = _lhSpZv(), k = w.v * 0.8 * z, ex = p.x - Math.cos(w.ang) * k, ey = p.y - Math.sin(w.ang) * k;
            if (k > 4) {
                const nx = Math.sin(w.ang) * 1.8, ny = -Math.cos(w.ang) * 1.8;   // 頭端半寬 1.8px
                const g = c.createLinearGradient(p.x, p.y, ex, ey);
                g.addColorStop(0, w.rgb); g.addColorStop(1, w.rgb0 || (w.rgb0 = _lhSpRGBA(w.rgb, 0)));
                c.save(); c.globalAlpha = w.alpha * 0.75; c.fillStyle = g;
                c.beginPath(); c.moveTo(p.x + nx, p.y + ny); c.lineTo(ex, ey); c.lineTo(p.x - nx, p.y - ny); c.closePath(); c.fill();
                c.restore();
            }
        }
        if (w.pinned || w.hot) { top.push([w, p]); continue; }
        if (w.mag > 1.01) { mags.push([w, p]); continue; }   // 放大中的詞晚點畫，蓋在旁邊的詞上面
        // 0.98.16：第 2 級流星停著、透明度 5 秒一輪慢慢循環；第 5 級流星固定閃爍（約 1.6 秒一輪）＋自帶光暈
        const cf = w.comet && L.cometHalo ? 0.65 + 0.35 * Math.sin(t / LH_SP_TUNE.glow.cometFlick + w.wob * 7) : 1;
        const a = w.alpha * (w.dim ? 0.06 : 1) * (w.comet && L.cometPulse ? 0.55 + 0.45 * Math.sin(t / 5000 * Math.PI * 2 + w.wob) : 1);
        if (w.comet && L.cometHalo && !w.dim) { const R = Math.max(26, w.tw * 0.9) * _lhSpZv(); M.globalAlpha = Math.min(1, a * LH_SP_TUNE.glow.comet) * 0.3 * (w.bhA ?? 1); M.drawImage(_lhSpGlowImg(w.rgb),   /* 0.98.18 Andy：光暈恆亮、淡很多（閃的只有字本身） */ p.x - R, p.y - R, R * 2, R * 2); }
        const tw = w.twk ? Math.sin(Math.min(1, (t - w.twk) / LH_SP_TUNE.glow.twLen) * Math.PI) : 0;   // 星星閃爍的亮度（0→1→0）
        const m = (w.kb || 1) * (L.twFlat ? 1 : 1 + 0.1 * tw);
        c.globalAlpha = a;
        blit(w, p, m);
        if ((w === _lhSp.navF || (conF && conF.has(w))) && !w.dim) {   // Andy：骰子／AI 星座的星，沒按導覽也一樣閃   // 導覽到的詞：1.25 赫茲閃（發光疊加再貼一次）
            const fl = 0.5 + 0.5 * Math.sin(t / 1000 * Math.PI * 2 * 1.25);   // 0.98.41 Andy：閃爍慢一半（2.5→1.25 赫茲）
            c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = a * 0.9 * fl; blit(w, p, m); blit(w, p, m * (1 + 0.04 * fl)); c.restore();
        }
        starHi(w, p, m, a);
        if ((w.comet && L.cometGlow || tw) && !w.dim) {   // 流星加亮、星星閃爍：同一張小圖用發光疊加再貼一次
            c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = a * (tw ? tw : 0.55 * cf); blit(w, p, m); if (tw) { c.globalAlpha = a * 0.7 * tw; blit(w, p, m); } c.restore();   // 星星閃爍疊兩次，比較亮
        }
        if (w.kept && !w.dim) _lhSpKept(c, w, p, a, t, L, pill, blit, m);
    }
    c.globalAlpha = 1;
    for (const [w, p] of mags) {
        const m = w.mag * (w.kb || 1);
        c.globalAlpha = w.alpha * (w.dim ? 0.06 : 1);
        blit(w, p, m);
        starHi(w, p, m, c.globalAlpha);
        if (w.kept && !w.dim) _lhSpKept(c, w, p, 1, t, L, pill, blit, m);
    }
    c.globalAlpha = 1;
    // 停住／釘住：半透明底＋外框＋光暈的膠囊，字在上面；第 1 級停住的字再變粗、發光
    for (const [w, p] of top) {
        const m = (w.mag || 1) * (w.kb || 1);
        c.save();
        pill(p, w, m);
        c.shadowColor = w.rgb; c.shadowBlur = 20;
        c.globalAlpha = 0.8; c.fillStyle = _lhSp.cCard; c.fill();
        c.shadowBlur = 0; c.globalAlpha = 1; c.strokeStyle = w.rgb; c.lineWidth = 1.5; c.stroke();
        c.restore();
        if (L.bold && !w.pinned) {
            const fs = 16 * w.s * z * m;
            c.save();
            c.font = '700 ' + fs + 'px ' + _lhSp.font;
            c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillStyle = w.rgb; c.shadowColor = w.rgb; c.shadowBlur = fs * 0.8;
            c.fillText(w.w, p.x, p.y);
            c.shadowBlur = 0;
            c.fillText(w.w, p.x, p.y);
            c.restore();
        } else blit(w, p, m);
        starHi(w, p, m, 1);
    }
    _lhSpHoloDraw(M, t, z);   // 全息標籤畫在主畫布最上面，不留殘影
    _lhSpBhGuideDraw(M);
    _lhSpActsPlace();
}

// Andy：調黑洞滑桿時畫範圍輔助線（只有齒輪面板會觸發；放手 1.5 秒後淡掉）
const LH_SP_LOCAL = LH_LOCAL_HOST;   // Andy：輔助線（黑洞範圍、宇宙邊界）只在本地畫，線上版一律不畫
function _lhSpBhGuideDraw(c) {
    if (!LH_SP_LOCAL) return;
    if (LH_SP_TUNE_UI && _lhSp.bhD) _lhSp.bhGuide = _lhSpNow();   // 本地：按住黑洞也畫輔助線（放手後一樣 2 秒淡掉）
    const Q = _lhSp.bhScr, age = _lhSpNow() - (_lhSp.bhGuide || -1e9), on = !!Q && age <= 2000;
    const bh = _lhSp.el && _lhSp.el.querySelector('.ws-bh'); if (bh) bh.classList.toggle('guide', on);   // 黑洞本體變半透明，裡面幾圈才看得到
    const tu = _lhSp.el && _lhSp.el.querySelector('.ws-tune'), AM = _lhSp.bhShape, K = _lhSp.bhK;
    const GB = _lhSp.guideBh ??= lhGet('lh:spGuide') === '1', GE = _lhSp.guideEdge ??= lhGet('lh:spGuideE') === '1';   // 0.98.41 Andy：齒輪面板兩個開關——「黑洞範圍」「宇宙邊界」各自一直畫；關＝拉滑桿、按住黑洞時才暫時出現
    if (AM && K && (GE || on)) {   // 描出宇宙（變形蟲）邊界
        c.save(); c.strokeStyle = '#c9a0ff'; c.globalAlpha = 0.6; c.setLineDash([10, 6]); c.lineWidth = 1.5; c.beginPath();
        AM.pts.forEach(([x, y], i) => { const p = _lhSpScr(x * K, y * K); i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y); });
        c.closePath(); c.stroke(); c.restore();
    }
    const always = GB && !!Q;
    if (!on && !always) return;
    _lhSp.dirty = true;
    const rings = [[Q.R, '#7fd4ff', '引力範圍'], [Q.a, '#ffd27f', '光暈開始被吸'], [Q.s, '#ff9f5a', '恆星散架'], [Q.l, '#b9ff9e', '魚眼'], [Q.r, '#ff7f9e', '核心']];
    c.save(); c.globalAlpha = on ? Math.min(1, (2000 - age) / 500) : 0.55; c.setLineDash([6, 5]); c.lineWidth = 1.2; c.font = '11px sans-serif'; c.textAlign = 'center';
    for (const [r, col, txt] of rings) { c.strokeStyle = c.fillStyle = col; c.beginPath(); c.arc(Q.x, Q.y, r, 0, Math.PI * 2); c.stroke(); c.fillText(txt + ' ' + Math.round(r) + 'px', Q.x, Q.y - r - 4); }
    c.restore();
}

// 已保留的詞：每級都有外框；第 3 級起加柔光；第 4、5 級再閃（1.2 秒一次）＋光暈
function _lhSpKept(c, w, p, a, t, L, pill, blit, m) {
    c.save();
    pill(p, w, m);
    c.globalAlpha = a * 0.75; c.strokeStyle = w.rgb; c.lineWidth = 1.2; c.stroke();
    c.globalCompositeOperation = 'lighter';
    if (L.keptGlow) { c.globalAlpha = a * 0.35; blit(w, p, m); }
    if (L.keptFlash) {
        c.globalAlpha = a * 0.45 * (1 - Math.cos(t / 1200 * Math.PI * 2));
        c.shadowColor = w.rgb; c.shadowBlur = 14 * w.s * _lhSpZv();
        blit(w, p, m);
    }
    c.restore();
}

// 隱藏鈕（槓掉的眼睛）：浮在「游標停住的詞」（觸控：最後點的那個釘住的詞）右上角，跟著詞移動
function _lhSpActsPlace() {
    const a = _lhSp.acts, w = _lhSp.hover ? _lhSp.hover : (_lhSp.act && _lhSp.act.pinned ? _lhSp.act : null);
    if (!w || _lhSp.drag && _lhSp.drag.moved || !_lhSp.words.includes(w)) { if (!a.hidden) a.hidden = true; return; }
    const z = _lhSpZv(), m = (w.mag || 1) * (w.kb || 1), p = _lhSpWS(w), fs = 16 * w.s * z * m, hw = w.tw * z * m / 2 + fs * 0.55, hh = fs * 0.85;
    a.hidden = false;
    a.style.transform = 'translate(' + p.x.toFixed(1) + 'px,' + (p.y - hh + 6).toFixed(1) + 'px)';
    a.lastChild.style.left = (hw - 8) + 'px';
    if (a.dataset.w !== w.w) {
        a.dataset.w = w.w;
        a.lastChild.setAttribute('aria-label', '隱藏「' + w.w + '」');
        a.lastChild.title = '隱藏「' + w.w + '」';
    }
}

// 詞停下來（甩完、或「拖到哪停在哪」放手）：流星從這裡接著飛；恆星：這裡就是這團新的家；
// 行星：照放手的位置換一條新軌道（離恆星多遠、在哪個角度），之後照常繞
function _lhSpSettle(w, L, T) {
    w.free = false; w.bhF = false;
    if (w.comet) { w.x = w.fx; w.y = w.fy; return; }
    const cl = w.cl;
    if (w.star) {
        _lhSpDrift(Object.assign(cl, { hx: w.fx, hy: w.fy }), _lhSp.groups);
        cl.hx = w.fx - (L.drift ? _lhSpDx(cl, T - (cl.tOff || 0)) : 0); cl.hy = w.fy - (L.drift ? _lhSpDy(cl, T - (cl.tOff || 0)) : 0); cl.held = false;
        cl.x = w.fx; cl.y = w.fy;
    } else {
        const dx = w.fx - cl.x, dy = w.fy - cl.y, ct = Math.cos(w.tilt), st = Math.sin(w.tilt);
        const c = dx * ct + dy * st, sn = (-dx * st + dy * ct) / (w.ecc || 1);
        w.r = Math.hypot(c, sn); w.th = Math.atan2(sn, c); w.sx = w.sy = 0;
    }
    cl.ver++;
}

// 大風吹（0.98.20 Andy）：散開的行星不一定回自己原本的座位。同一圈（同一星系、同一個公轉速度）裡散開的那幾個，
// 照現在繞恆星的角度排好，整組一起轉一個「總路程最短」的偏移去坐這幾個座位 → 就近歸隊、彼此不交叉；
// 只有座位真的不夠近（一個蘿蔔一個坑）才會被擠去遠一點的位子。新的分法要省 2 成以上路程才換，免得來回改主意
function _lhSpSeats() {
    const TAU = Math.PI * 2, wrap = a => ((a % TAU) + TAU) % TAU, ad = (a, b) => { const d = Math.abs(wrap(a) - wrap(b)); return Math.min(d, TAU - d); };
    const drag = _lhSp.drag && _lhSp.drag.w, rings = new Map();
    for (const w of _lhSp.words) {
        if (!w.free || w.star || w.rising || w.comet || !w.cl || w === drag || w.pinned || (w.gk && w.gp > 0.9)) continue;   // 0.98.22.11：凝聚快到位（9 成）的不再換座位——大星系一圈幾十顆、座位只差 30px，一直被換座位就永遠到不了＝恆星光芒永遠不亮
        const k = w.cl.key + '|' + w.om;
        if (!rings.has(k)) rings.set(k, []);
        rings.get(k).push(w);
    }
    for (const ws of rings.values()) {
        const n = ws.length;
        if (n < 2) continue;
        const ang = ws.map(w => { const dx = w.fx - w.cl.x, dy = w.fy - w.cl.y, ct = Math.cos(w.tilt), st = Math.sin(w.tilt); return wrap(Math.atan2((-dx * st + dy * ct) / (w.ecc || 1), dx * ct + dy * st)); });
        const ord = ws.map((_, i) => i).sort((a, b) => ang[a] - ang[b]);
        const seats = ws.map(w => wrap(w.th)).sort((a, b) => a - b);
        let best = 0, bc = Infinity;
        for (let s = 0; s < n; s++) {
            let cst = 0;
            for (let i = 0; i < n && cst < bc; i++) cst += ad(ang[ord[i]], seats[(i + s) % n]);
            if (cst < bc) { bc = cst; best = s; }
        }
        const now = ws.reduce((tt, w, i) => tt + ad(ang[i], w.th), 0);
        if (bc < now * 0.8) ord.forEach((wi, i) => { ws[wi].th = seats[(i + best) % n]; });
    }
}

// 恆星被隱藏：這一團剩下最常用的詞慢慢飄到中心接任恆星（到位才算恆星，拖它才會帶走整團）
function _lhSpPromote(cl) {
    const next = _lhSp.words.filter(x => x.cl === cl && !x.comet && !x.star).sort((a, b) => b.p - a.p)[0];
    if (!next) return;
    const at = _lhSpPos(next);
    Object.assign(next, { r: 0, ecc: 1, tilt: 0, om: 0, sx: 0, sy: 0, rising: true });
    if (!next.free) Object.assign(next, { free: true, fx: at.x, fy: at.y, fvx: 0, fvy: 0 });
}

// 釘住／放開之後整理星座（線都存在 _lhSp.chords）：第 2 點連第 1 點；第 3 點連前兩點（三角形）；
// 第 4 點起，新的點連 1～3 個舊點，越近的點越容易被選到（機率 ∝ 1／距離²）；和現有的線夾角小於 2° 的不連
function _lhSpPin(w) {
    _lhSp.pins = _lhSp.pins.filter(x => x !== w);
    _lhSp.chords = _lhSp.chords.filter(c => c[0] !== w && c[1] !== w);
    const pt = x => ({ x: x.px || 0, y: x.py || 0 }), dist = (a, b) => Math.hypot(pt(a).x - pt(b).x, pt(a).y - pt(b).y) || 1;
    if (!w.pinned) {   // 拿掉一個點：因此落單的點，就近連一個
        for (const o of _lhSp.pins) if (_lhSp.pins.length > 1 && !_lhSp.chords.some(c => c[0] === o || c[1] === o)) {
            const near = _lhSp.pins.filter(x => x !== o).sort((a, b) => dist(o, a) - dist(o, b))[0];
            _lhSp.chords.push([o, near]);
        }
        return;
    }
    const old = _lhSp.pins.slice();
    _lhSp.pins.push(w);
    if (old.length <= 2) { for (const o of old) _lhSp.chords.push([w, o]); return; }
    const ang = (a, b) => Math.atan2(pt(b).y - pt(a).y, pt(b).x - pt(a).x);
    const tooClose = (a1, a2) => { let d = Math.abs(a1 - a2) % Math.PI; d = Math.min(d, Math.PI - d); return d < Math.PI / 90; };
    const r = Math.random(), want = r < 0.55 ? 1 : r < 0.9 ? 2 : 3;   // 0.98.10：一條 55%、兩條 35%、三條 10%
    let pool = old.slice();
    for (let n = 0; n < want && pool.length; n++) {
        const wt = pool.map(o => 1 / Math.pow(dist(w, o), 2)), sum = wt.reduce((a, b) => a + b, 0);
        let x = Math.random() * sum, k = 0;
        while (k < pool.length - 1 && (x -= wt[k]) > 0) k++;
        const o = pool[k];
        pool.splice(k, 1);
        const a = ang(w, o);
        if (_lhSp.chords.some(([p, q]) => tooClose(a, ang(p, q)))) { n--; continue; }
        _lhSp.chords.push([w, o]);
    }
    if (!_lhSp.chords.some(c => c[0] === w)) _lhSp.chords.push([w, old.sort((a, b) => dist(w, a) - dist(w, b))[0]]);   // 至少一條
}

// 星座線的顏色：跟釘住的詞（可能跨好幾個星系）的顏色錯開。每次釘住／取消就重算：
// 把這些詞的色相照彩度加權取「圓周平均」，線用平均的對面色（+180°）；色相太分散（平均向量長度 < 0.45）就避不開，改用白色（淺色主題用主文字色）。
// 都是灰的（流星）或還沒釘：主題強調色
function _lhSpLineGoal() {
    const num = css => _lhSpRGBA(css, 1).slice(5, -1).split(',').slice(0, 3).map(Number);
    const bg = num(_lhSp.cCard), dark = 0.299 * bg[0] + 0.587 * bg[1] + 0.114 * bg[2] < 128;
    let sx = 0, sy = 0, sw = 0;
    for (const w of _lhSp.pins) {
        if (!w.pinned || !w.rgb) continue;
        const [r, g, b] = num(w.rgb).map(v => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = mx - mn;
        if (c < 0.08) continue;   // 幾乎沒顏色的不算
        const h = mx === r ? ((g - b) / c) % 6 : mx === g ? (b - r) / c + 2 : (r - g) / c + 4, a = h * Math.PI / 3;
        sx += Math.cos(a) * c; sy += Math.sin(a) * c; sw += c;
    }
    if (!sw) return num(_lhSp.cLine);
    if (Math.hypot(sx, sy) / sw < 0.45) return dark ? [255, 255, 255] : num(_lhSpColor('var(--text-primary)'));
    const hue = (Math.atan2(sy, sx) * 180 / Math.PI + 180 + 360) % 360;
    return num('hsl(' + Math.round(hue) + ' 75% ' + (dark ? 68 : 40) + '%)');
}
function _lhSpClear() {
    for (const w of _lhSp.words) { w.pinned = false; w.hot = false; }
    for (const cl of _lhSp.groups) cl.ver++;
    _lhSp.pins = []; _lhSp.chords = []; _lhSp.act = null;
    _lhSp.dirty = true;
    _lhSpClearSync();
}
// ===== 骰子／AI 星座（0.98.22.11 Andy）=====
// 兩種各自一組（_lhSp.cons.dice／.ai：groups＝每 12 顆一個星座、照導覽順序；segs＝連線），一次只有一種「最顯眼」（_lhSp.mode）；
// 都沒開＝保留詞的星座最顯眼。這次宇宙還沒有那種星座：按鈕＝抽一組並開；已經有了：按鈕＝開／關（關了星座還在，只退到很淡）
const LH_SP_TRAIL_N = 50;   // 光帶從尾到頭平均灑幾個漸層控制點（0.98.22.11 Andy）
const LH_SP_CON_MAX = 10, LH_SP_CON_MIN = 5, LH_SP_CON_GROUPS = 8;   // 0.98.22.11 Andy：一個星座 5～10 顆、最多 8 個星座
// 分顆數：先決定幾個星座（每個最多 10 顆、但不超過 8 個），再盡量平均分，最後隨機互相挪 1～2 顆（不會出現 10＋2，會是 7＋5、6＋6 這種）
function _lhSpConSizes(n) {
    if (n <= LH_SP_CON_MAX) return [n];
    const g = Math.min(LH_SP_CON_GROUPS, Math.ceil(n / LH_SP_CON_MAX)), base = Math.floor(n / g), sz = Array.from({ length: g }, (_, i) => base + (i < n % g ? 1 : 0));
    const hi = Math.max(LH_SP_CON_MAX, Math.ceil(n / g));   // 超過 80 顆時每個只好多於 10
    for (let k = 0; k < g * 2; k++) {
        const a = Math.floor(Math.random() * g), b = Math.floor(Math.random() * g), m = 1 + Math.floor(Math.random() * 2);
        if (a !== b && sz[a] - m >= LH_SP_CON_MIN && sz[b] + m <= hi) { sz[a] -= m; sz[b] += m; }
    }
    return sz;
}
// 一顆普通行星（拉力差異取平均）的凝聚進度曲線：每 1/60 秒一格，照目前的拉力／剛度／阻尼模擬（彈簧是線性的，距離正規化成 1 就好）。
// 流星用它來跟行星走同樣的比例。end＝透明＋對焦都走完的秒數（行星時間）；參數變了才重算
function _lhSpGatherCurve() {
    const G = LH_SP_TUNE.gather, key = [G.k, G.stiff, G.ramp, G.damp, G.fadeTo, G.fadeMs].join();
    if (_lhSp.gCurve && _lhSp.gCurve.key === key) return _lhSp.gCurve;
    const P = [], dt = 1 / 60;
    let x = 1, v = 0, gp = 0, end = 30;
    for (let i = 0; i < 1800; i++) {
        const ga = i * dt, kg = G.k * (1 + G.stiff * (ga / G.ramp) ** 2);
        v = (v - x * kg * dt) * Math.exp(-dt * G.damp * Math.sqrt(kg)); x += v * dt;
        gp = Math.max(gp, 1 - Math.abs(x)); P.push(gp);
        if (end === 30 && gp >= G.fadeTo && ga >= G.fadeMs / 1000) end = ga;
    }
    return (_lhSp.gCurve = { key, P, end: end + 0.1 });
}
// 行星公轉角速度（0.98.22.11 Andy）：整體倍數 roam.planet；「越外面越慢」的程度 roam.fall（0＝內外一樣快、1＝原本：旋臂克卜勒 1.5 次方、同心圓 0.5 次方、2＝更懸殊）
function _lhSpOm(w) {
    const RM = LH_SP_TUNE.roam;
    return w.omB !== undefined ? w.omB * Math.pow(w.omD, w.omE * RM.fall) * RM.planet : w.om;
}
function _lhSpConPress(kind) {
    if (!_lhSp.cons[kind]) { _lhSpConRoll(kind); return; }
    _lhSp.mode = _lhSp.mode === kind ? null : kind;
    _lhSp.cnI = -1; _lhSp.navF = null; _lhSp.dirty = true;
    _lhSpConSync();
}
// 畫面上看得到、沒被篩掉的詞（常用度、字首字尾、字數篩選都會讓詞 off／dim）
function _lhSpConVisible() {
    const W = _lhSp.W, H = _lhSp.H;
    return _lhSp.words.filter(w => w.born && !w.off && !w.dim && w.vis > 0.5 && (p => p.x > 0 && p.x < W && p.y > 0 && p.y < H)(_lhSpScr(w.px, w.py)));
}
const _lhSpConN = () => typeof lhAiTune === 'function' ? lhAiTune().n : 20;   // 一次幾個詞＝偏好設定「AI 一次建議幾個詞」
// 骰子：不重複加權抽樣；最大的恆星權重 1、最冷門的行星 0.6（落差 40%），中間照常用度（w.n：0～1）連續分
function _lhSpDice(pool, n) {
    const left = pool.slice(), out = [];
    while (out.length < n && left.length) {
        const wt = left.map(w => 0.6 + 0.4 * (w.star ? 1 : Math.max(0, Math.min(1, w.n ?? 0.5)))), sum = wt.reduce((a, b) => a + b, 0);
        let x = Math.random() * sum, k = 0;
        while (k < left.length - 1 && (x -= wt[k]) > 0) k++;
        out.push(left.splice(k, 1)[0]);
    }
    return out;
}
// AI：候選＝畫面上看得到的詞（照常用度排、最多送 tune.pool 個），跟主畫面「AI 建議」同一套情境、標籤、歌詞與模型；AI 少回、失敗都照常用度補滿
async function _lhSpAiPick(pool, n) {
    const rank = w => w.p || 0, fed = pool.slice().sort((a, b) => rank(b) - rank(a)).slice(0, typeof lhAiTune === 'function' ? lhAiTune().pool : 200).map(w => w.w);
    let picks = [];
    try {
        const song = typeof curSong === 'function' ? curSong() : null, st = typeof lhAiRefState === 'function' ? lhAiRefState() : null;
        const on = k => st && typeof lhAiUseOn === 'function' && lhAiUseOn(k, st);
        const ctx = song ? [on('context') ? song.context.trim() : '', on('tags') && song.hashtags.length ? song.hashtags.map(t => '#' + t).join(' ') : ''].filter(Boolean).join('　') : '';
        const lyr = song && on('lyrics') ? ((typeof lastLyricsSelection === 'string' && lastLyricsSelection) || song.sections.map(x => x.text.trim()).filter(Boolean).join('\n')) : '';
        const ctxB = ctx ? `\n【情境與#標籤】（請重點優先參考）：${ctx}` : '', lyrB = lyr ? `\n【歌詞風格參考】：${lyr}` : '';
        const m = aiTryList()[0];
        if (m.byok && BYOK_PROVIDERS[m.provider]?.kind === 'jev') picks = (await byokJevRank(m, `以下詞語都符合押韻要求。${ctxB}${lyrB}`.trim(), fed)).slice(0, n);
        else picks = parseAiWords(await callLLM(m, `你是歌詞創作助手。以下詞語都符合押韻要求，請挑出最適合此創作情境的 ${n} 個詞語，最適合的排前面。\n候選詞：${fed.join('、')}${ctxB}${lyrB}\n直接輸出詞語，頓號「、」分隔，不要說明或編號。`));
    } catch (e) { if (typeof lhWarn === 'function') lhWarn('宇宙 AI 星座：AI 失敗，改依常用度補滿', e); }
    const set = new Set(fed), got = [...new Set(picks.filter(w => set.has(w)))];
    for (const w of fed) { if (got.length >= n) break; if (!got.includes(w)) got.push(w); }
    const byW = new Map(pool.map(w => [w.w, w]));
    return got.slice(0, n).map(w => byW.get(w)).filter(Boolean);
}
// 抽一組（或重抽）：詞照位置一串串連起來，每串最多 12 顆＝一個星座
async function _lhSpConRoll(kind) {
    if (!kind) return;
    // 0.98.22.11 Andy：換一批不要抽到抽過的（這次宇宙裡同一種抽過的都記著）；剩下的不夠一批才全部重來
    const seen = (_lhSp.conSeen || (_lhSp.conSeen = {}))[kind] || (_lhSp.conSeen[kind] = new Set()), n = _lhSpConN();
    let pool = _lhSpConVisible().filter(w => !seen.has(w));
    if (pool.length < Math.min(n, 2) || pool.length < n * 0.5) { seen.clear(); pool = _lhSpConVisible(); }
    if (pool.length < 2) { if (typeof showToast === 'function') showToast('畫面上的詞太少，先縮小一點看看'); return; }
    let ws;
    if (kind === 'ai') {
        const tok = _lhSp.aiTok, btn = _lhSp.el.querySelector('.ws-aib');
        btn.classList.add('busy'); btn.disabled = true;
        try { ws = await _lhSpAiPick(pool, n); } finally { btn.classList.remove('busy'); btn.disabled = false; }
        if (tok !== _lhSp.aiTok || !_lhSp.visible) return;   // 等 AI 的時候換了宇宙／關掉：作廢
    } else ws = _lhSpDice(pool, n);
    for (const w of ws) seen.add(w);
    _lhSp.cons[kind] = _lhSpConBuild(ws);
    _lhSp.mode = kind; _lhSp.cnI = -1; _lhSp.dirty = true;
    _lhSpConSync();
}
// 0.98.22.11 Andy（星座橫跨太遠、不同星座大量交疊）：舊版從最左邊一路接最近的一顆，後面剩下的點越來越散、互相穿插（舊版只存在 commit 之前的工作區，沒進 git：每串接最近一顆、首尾相接、三成機率跳一顆連）。
// ①先照位置分區：k-means（有顆數上限），每個星座是一塊不重疊的區域；②組內用最小生成樹連（總長最短、組內不會交叉）；
// ③再補少量短線圍出封閉形狀（第 5 級塗色），跟任何一條既有的線（含別的星座）交叉就不補
const _lhSpSegX = (a, b, c, e) => {   // 兩線段有沒有交叉（共用端點不算）
    if (a === c || a === e || b === c || b === e) return false;
    const o = (p, q, r) => Math.sign((q.px - p.px) * (r.py - p.py) - (q.py - p.py) * (r.px - p.px));
    return o(a, b, c) * o(a, b, e) < 0 && o(c, e, a) * o(c, e, b) < 0;
};
function _lhSpConBuild(ws) {
    const sizes = _lhSpConSizes(ws.length), k = sizes.length, d2 = (a, b) => (a.px - b.px) ** 2 + (a.py - b.py) ** 2;
    // ① 分區：k-means++ 挑起點，再「有名額的最近分配」反覆 8 次（每次從全部的點和中心距離由近到遠排，名額滿了換下一個中心）
    const C = [ws[Math.floor(Math.random() * ws.length)]].map(w => ({ px: w.px, py: w.py }));
    while (C.length < k) {
        const dm = ws.map(w => Math.min(...C.map(c => d2(w, c)))), sum = dm.reduce((a, b) => a + b, 0);
        let x = Math.random() * sum, i = 0; while (i < ws.length - 1 && (x -= dm[i]) > 0) i++;
        C.push({ px: ws[i].px, py: ws[i].py });
    }
    let grp = [];
    for (let it = 0; it < 8; it++) {
        const pairs = [];
        ws.forEach((w, i) => C.forEach((c, j) => pairs.push([d2(w, c), i, j])));
        pairs.sort((a, b) => a[0] - b[0]);
        const of = new Array(ws.length).fill(-1), cnt = new Array(k).fill(0);
        for (const [, i, j] of pairs) if (of[i] < 0 && cnt[j] < sizes[j]) { of[i] = j; cnt[j]++; }
        grp = C.map((_, j) => ws.filter((_, i) => of[i] === j));
        grp.forEach((g, j) => { if (g.length) C[j] = { px: g.reduce((a, w) => a + w.px, 0) / g.length, py: g.reduce((a, w) => a + w.py, 0) / g.length }; });
    }
    grp = grp.filter(g => g.length).sort((a, b) => Math.min(...a.map(w => w.px)) - Math.min(...b.map(w => w.px)));   // 導覽從左邊的星座開始
    // ② 每個星座各自的最小生成樹（Prim）
    const trees = grp.map(g => {
        const inT = new Set([g.reduce((m, w) => w.px < m.px ? w : m)]), tree = [];
        while (inT.size < g.length) {
            let best = null;
            for (const x of inT) for (const y of g) if (!inT.has(y) && (!best || d2(x, y) < best[0])) best = [d2(x, y), x, y];
            inT.add(best[2]); tree.push([best[1], best[2]]);
        }
        return tree;
    });
    // ②-2 樹枝跨星座交叉：拔掉比較長的那條，改用同一個星座裡「把兩半接回來、又不交叉」的最短一條；找不到就放回去
    const all = () => trees.flat(), comp = (tree, w) => { const seen = new Set([w]), st = [w]; while (st.length) { const x = st.pop(); for (const [p, q] of tree) { const y = p === x ? q : q === x ? p : null; if (y && !seen.has(y)) { seen.add(y); st.push(y); } } } return seen; };
    for (let pass = 0; pass < 4; pass++) {
        let fixed = false;
        for (let ti = 0; ti < trees.length; ti++) for (let ei = 0; ei < trees[ti].length; ei++) {
            const [a, b] = trees[ti][ei];
            if (!all().some(([c, e]) => _lhSpSegX(a, b, c, e))) continue;
            const T = trees[ti], rest = T.filter((_, k) => k !== ei), A = comp(rest, a), others = all().filter(sg => sg !== T[ei]);
            let best = null;
            for (const x of A) for (const y of grp[ti]) if (!A.has(y) && (!best || d2(x, y) < best[0]) && !others.some(([c, e]) => _lhSpSegX(x, y, c, e))) best = [d2(x, y), x, y];
            if (best && (best[1] !== a || best[2] !== b) && (best[1] !== b || best[2] !== a)) { T[ei] = [best[1], best[2]]; fixed = true; }
        }
        if (!fixed) break;
    }
    const segs = trees.flat(), groups = [], extra = [];
    grp.forEach((g, ti) => {
        const adj = new Map(g.map(w => [w, []]));
        for (const [x, y] of trees[ti]) { adj.get(x).push(y); adj.get(y).push(x); }
        // 導覽順序：從最左邊那顆沿著樹走（深度優先），像沿著星座的線一顆顆走
        const order = [], st = [g.reduce((m, w) => w.px < m.px ? w : m)], seen = new Set();
        while (st.length) { const w = st.pop(); if (seen.has(w)) continue; seen.add(w); order.push(w); st.push(...adj.get(w).filter(x => !seen.has(x)).sort((p, q) => d2(w, q) - d2(w, p))); }
        groups.push(order);
        const mx = Math.max(...trees[ti].map(([p, q]) => d2(p, q)), 1);
        for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) if (!adj.get(g[i]).includes(g[j]) && d2(g[i], g[j]) <= mx * 2.6) extra.push([d2(g[i], g[j]), g[i], g[j], g]);   // 不超過最長樹枝的 1.6 倍長
    });
    // ③ 補線：由短到長，每個星座最多補「顆數÷3」條、每顆最多 3 條線，跟所有既有的線都不交叉才補
    extra.sort((a, b) => a[0] - b[0]);
    const deg = new Map(), add = new Map();
    for (const [a, b] of segs) { deg.set(a, (deg.get(a) || 0) + 1); deg.set(b, (deg.get(b) || 0) + 1); }
    for (const [, a, b, g] of extra) {
        if ((add.get(g) || 0) >= Math.floor(g.length / 3) || (deg.get(a) || 0) >= 3 || (deg.get(b) || 0) >= 3) continue;
        if (segs.some(([c, e]) => _lhSpSegX(a, b, c, e))) continue;
        segs.push([a, b]); add.set(g, (add.get(g) || 0) + 1); deg.set(a, deg.get(a) + 1); deg.set(b, deg.get(b) + 1);
    }
    return { groups, segs };
}
// 目前最顯眼那種的導覽順序（保留詞：照釘選順序）
const _lhSpConOrder = () => _lhSp.mode ? _lhSp.cons[_lhSp.mode].groups.flat() : _lhSp.pins.filter(w => w.pinned);
function _lhSpConNav(dir) {
    const list = _lhSpConOrder().filter(w => _lhSp.words.includes(w));
    if (!list.length) return;
    _lhSp.cnI = ((_lhSp.cnI < 0 ? (dir > 0 ? -1 : 0) : _lhSp.cnI) + dir + list.length) % list.length;
    if (_lhSp.holoPin) { _lhSp.holoPin = false; _lhSpHolo(null); }
    _lhSp.navF = null;
    _lhSp.nav = { t0: _lhSpNow(), fx: _lhSp.px, fy: _lhSp.py, w: list[_lhSp.cnI], ms: 520 };   // 相鄰兩顆之間就是一條星座線：鏡頭沿著線滑過去
    _lhSp.dirty = true;
}
// Andy：取消＝丟掉目前這組骰子／AI 星座（線消失、按鈕熄掉），已經保留的詞不動
function _lhSpConDrop() {
    if (!_lhSp.mode) return;
    delete _lhSp.cons[_lhSp.mode];
    _lhSp.mode = null; _lhSp.cnI = -1; _lhSp.navF = null; _lhSp.dirty = true;
    _lhSpConSync();
}
function _lhSpConKeep() {
    const c = _lhSp.mode && _lhSp.cons[_lhSp.mode];
    if (!c) return;
    for (const w of c.groups.flat()) {
        if (w.pinned) continue;
        w.pinned = true; if (w.cl) w.cl.ver++;
        _lhSpPin(w);
        if (!w.kept) { saveWord(w.w); w.kept = true; }
    }
    _lhSpClearSync(); _lhSp.dirty = true;
}
// 按鈕亮哪顆、導覽列要不要出現（保留詞模式沒有「加入保留／再換一批」）
function _lhSpConSync() {
    const el = _lhSp.el;
    if (!el) return;
    el.querySelector('.ws-dice').classList.toggle('on', _lhSp.mode === 'dice');
    el.querySelector('.ws-aib').classList.toggle('on', _lhSp.mode === 'ai');
    el.querySelector('.ws-dice').setAttribute('aria-pressed', String(_lhSp.mode === 'dice'));
    el.querySelector('.ws-aib').setAttribute('aria-pressed', String(_lhSp.mode === 'ai'));
    const nav = el.querySelector('.ws-cnav');
    nav.hidden = !_lhSpConOrder().length;
    nav.querySelector('.ws-cn-mid').hidden = !_lhSp.mode;
}
// 封閉多邊形（第 5 級）：把一組線段在畫面上的交點切開，沿著「每次右轉最少」走出每一塊面，回傳每塊的頂點（不含最外圈）
function _lhSpConFaces(segs) {
    const P = segs.map(([a, b]) => [_lhSpWS(a), _lhSpWS(b)]);
    const cuts = P.map(() => [0, 1]);
    for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
        const [p, q] = P[i], [r, u] = P[j], dx1 = q.x - p.x, dy1 = q.y - p.y, dx2 = u.x - r.x, dy2 = u.y - r.y, den = dx1 * dy2 - dy1 * dx2;
        if (Math.abs(den) < 1e-9) continue;
        const s1 = ((r.x - p.x) * dy2 - (r.y - p.y) * dx2) / den, s2 = ((r.x - p.x) * dy1 - (r.y - p.y) * dx1) / den;
        if (s1 > 1e-6 && s1 < 1 - 1e-6 && s2 > 1e-6 && s2 < 1 - 1e-6) { cuts[i].push(s1); cuts[j].push(s2); }
    }
    const V = new Map(), key = pt => Math.round(pt.x * 2) + ',' + Math.round(pt.y * 2), adj = new Map();
    const vid = pt => { const k = key(pt); if (!V.has(k)) { V.set(k, pt); adj.set(k, new Set()); } return k; };
    P.forEach(([p, q], i) => {
        const ts = [...new Set(cuts[i])].sort((a, b) => a - b), pts = ts.map(s => ({ x: p.x + (q.x - p.x) * s, y: p.y + (q.y - p.y) * s }));
        for (let k = 1; k < pts.length; k++) { const a = vid(pts[k - 1]), b = vid(pts[k]); if (a !== b) { adj.get(a).add(b); adj.get(b).add(a); } }
    });
    const ang = (a, b) => Math.atan2(V.get(b).y - V.get(a).y, V.get(b).x - V.get(a).x);
    const sorted = new Map([...adj].map(([k, ns]) => [k, [...ns].sort((x, y) => ang(k, x) - ang(k, y))]));
    const seen = new Set(), faces = [];
    for (const [a, ns] of sorted) for (const b of ns) {
        if (seen.has(a + '>' + b)) continue;
        const f = []; let u = a, v = b, guard = 0;
        while (!seen.has(u + '>' + v) && guard++ < 200) {
            seen.add(u + '>' + v); f.push(V.get(u));
            const nv = sorted.get(v), i = nv.indexOf(u), w = nv[(i - 1 + nv.length) % nv.length];
            u = v; v = w;
        }
        let ar = 0; for (let i = 0; i < f.length; i++) { const p = f[i], q = f[(i + 1) % f.length]; ar += p.x * q.y - q.x * p.y; }
        if (f.length >= 3 && ar > 40) faces.push(f);   // 內面是正面積（外圈、單獨的線段是負的或幾乎 0）
    }
    return faces;
}
// rgb 色相轉一點（相鄰的塊同色系、不同色偏）
function _lhSpHue(rgb, deg) {
    const [r, g, b] = _lhSpRGBA(rgb, 1).slice(5, -1).split(',').map(Number), a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    const m = [0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
        0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283,
        0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072];
    const cl = v => Math.max(0, Math.min(255, Math.round(v)));
    return 'rgb(' + cl(m[0] * r + m[1] * g + m[2] * b) + ',' + cl(m[3] * r + m[4] * g + m[5] * b) + ',' + cl(m[6] * r + m[7] * g + m[8] * b) + ')';
}
// 取消選取（面板按鈕）：第一下變「確定取消 N 個？」，4 秒或點別的地方就恢復；第二下才取消，選過的詞也一起取消保留
function _lhSpClearSync() {
    const b = _lhSp.el && _lhSp.el.querySelector('.ws-clear');
    if (!b) return;
    clearTimeout(_lhSp.clrArm); _lhSp.clrArm = 0;
    document.removeEventListener('pointerdown', _lhSpClearOut, true);
    b.classList.remove('armed');
    b.textContent = '取消選取';
    b.hidden = !_lhSp.pins.length;
    if (_lhSp.cons) _lhSpConSync();   // 保留詞變了：導覽列要不要出現跟著變
}
function _lhSpClearOut(e) { if (!e.target.closest('.ws-clear')) _lhSpClearSync(); }
function _lhSpClearAsk() {
    const b = _lhSp.el.querySelector('.ws-clear'), ps = _lhSp.pins.filter(w => w.pinned);
    if (!ps.length) return;
    if (!_lhSp.clrArm) {
        b.classList.add('armed');
        b.textContent = '確定取消 ' + ps.length + ' 個？';
        _lhSp.clrArm = setTimeout(_lhSpClearSync, 4000);
        document.addEventListener('pointerdown', _lhSpClearOut, true);
        return;
    }
    _lhSpClearNow();
}
// 取消全部選取（也一起取消保留），不問
function _lhSpClearNow() {
    for (const w of _lhSp.pins) if (w.pinned && w.kept) { removeSavedWord(w.w); w.kept = false; }
    _lhSpClear();
}

// 星系的分類名稱（圖例、恆星的全息標籤共用）：關聯詞「中間四字 ㄅㄨˋ 第3字」；押韻詞「一·三」聲調
function _lhSpClLabel(cl, cfg = _lhSp.cfg) {
    const k = cl.key.split('|');
    // 0.98.22.11 Andy：色標跟恆星上浮出的標籤同順序「讀音·位置·字數」（大類已經寫了字，這裡第一段換成讀音）
    return cfg && cfg.rel ? [k[3] || '', ..._lhSpClParts(cl, cfg).slice(1)].filter(Boolean).join('·')
        : cl.key.split('·').map(t => LH_WS_TONE_N[t - 1] ? LH_WS_TONE_N[t - 1][0] : t).join('·');
}
// 恆星的全息標籤（0.98.14 Andy）：滑鼠停在恆星上、或手指按住恆星，從恆星拉一條折線出去，框裡寫這個星系的分類和詞數
// 0.98.18 Andy：行星也有（寫讀音）；delay＝晚多久才開始長出來（滑鼠掃過行星不會一路閃面板）
const LH_SP_HOLO_PLANET_WAIT = 1140;   // 恆星的框 0.76 秒長好；行星先等 1.14 秒再長 → 1.9 秒長好＝恆星的 2.5 倍
function _lhSpHolo(w, delay = 0) {
    const h = _lhSp.holo;
    if ((h && h.w) === (w || null)) return;
    _lhSp.holo = w ? { w, t0: _lhSpNow() + delay } : null;
    _lhSp.dirty = true;
}
// 全息標籤的分類，一段一段（0.98.14.2 Andy）：
// 關聯詞＝國字 · 位置 · 字數（破音字在國字後面加聲調符號，例「不（ˋ）」；超大星系細拆的再加「第N字」）；顯示全部＝聲調 · 聲調（例「二聲 · 四聲」）
const _lhSpToneMark = rd => (rd.match(/[ˊˇˋ˙]/) || ['ˉ'])[0];
function _lhSpClParts(cl, cfg = _lhSp.cfg) {
    const k = cl.key.split('|');
    if (!(cfg && cfg.rel)) return cl.key.split('·').map(t => LH_WS_TONE_N[t - 1] || t);
    const ch = k[0] + (cfg.poly && cfg.poly.has(k[0]) && k[3] ? '(' + _lhSpToneMark(k[3]) + ')' : '');
    return [ch, LH_REL_POS_N[k[1]] + (k[4] && k[1] === '中' ? '(' + k[4] + ')' : ''), LH_REL_LEN_N[k[2]]];   // 括號半形（0.98.22.11）   // 細拆的第幾字併進位置：「中間（3）」
}
function _lhSpHoloDraw(c, t, z) {
    const h = _lhSp.holo, w = h && h.w;
    if (!w || !w.born || w.off || !_lhSp.words.includes(w)) return;
    if (t < h.t0) { _lhSp.dirty = true; return; }   // 行星：還在等
    // 時間軸（毫秒）：折線 0–520 長出來 → 框 520–760 淡入 → 分類一段一段（每段隔 300、淡入 220）→ 最後詞數
    const parts = w.star ? _lhSpClParts(w.cl) : (w.phon || '').split(' '), age = Math.max(0, t - h.t0),   /* 夾 ≥ 0，理由同 starHi */ LINE = 520, BOX = 240, STEP = 150, FADE = 220;   /* 0.98.19.2 Andy：分段浮現快一倍（STEP 300→150） */
    const tCount = LINE + BOX + parts.length * STEP, k = Math.min(1, age / LINE), e = 1 - Math.pow(1 - k, 3);
    const fade = t0 => Math.max(0, Math.min(1, (age - t0) / FADE));
    if (age < tCount + FADE) _lhSp.dirty = true;
    const p = _lhSpWS(w);
    const r = Math.max(14, (w.tw || 40) * z * (w.mag || 1) / 2 + 6), W = _lhSp.W;
    const SEP = w.star ? '  ·  ' : '  ', t1 = parts.join(SEP), t2 = w.star ? w.cl.n + ' 個詞' : w.w;   // 行星：讀音一個音節一段浮現（注音或拼音照主畫面），下面寫這個詞
    c.save();
    c.font = '600 13px ' + _lhSp.font; const w1 = c.measureText(t1).width;
    c.font = '12px ' + _lhSp.font; const w2 = c.measureText(t2).width;
    const bw = Math.max(170, Math.max(w1, w2) + 24), bh = 52;   // 0.98.16 Andy：最小尺寸加大
    // Andy：導覽星座叫出來的面板（holoPin）盡量放在宇宙的空白處——右上、左上、右下、左下四個位置各算一次，
    // 框裡蓋到幾個詞（大字算重）、有沒有出畫面、有沒有壓到面板按鈕，挑最空的；挑一次就記住，不會跟著公轉一直跳
    const place = (dir, vy) => { const ax = p.x + dir * (r + 4), ay = p.y + 2, bx = ax + dir * 30, by = Math.min(_lhSp.H - bh / 2 - 8, Math.max(bh / 2 + 8, ay + vy * 40)), ex = bx + dir * 26; return { dir, ax, ay, bx, by, ex, x0: dir > 0 ? ex : ex - bw, y0: by - bh / 2 }; };
    let pl;
    if (_lhSp.holoPin) {
        if (!h.pl || h.pl.w !== w) {
            const box = _lhSp.el.getBoundingClientRect(), ui = [..._lhSp.el.querySelectorAll('.ws-panel, .ws-ptop, .ws-tune, .ws-tr, .ws-legpanel, .ws-legbtn')].filter(e => e.offsetParent).map(e => e.getBoundingClientRect()).map(q => [q.left - box.left, q.top - box.top, q.right - box.left, q.bottom - box.top]);
            let best = null;
            for (const [dir, vy] of [[1, -1], [-1, -1], [1, 1], [-1, 1]]) {
                const c0 = place(dir, vy), x1 = c0.x0 - 10, y1 = c0.y0 - 10, x2 = c0.x0 + bw + 10, y2 = c0.y0 + bh + 10;
                let sc = (x1 < 0 || x2 > W) ? 1e6 : 0;
                for (const [a1, b1, a2, b2] of ui) if (x1 < a2 && x2 > a1 && y1 < b2 && y2 > b1) sc += 1e5;
                for (const o of _lhSp.words) { if (o === w || !o.born || o.off || o.cmWait) continue; const q = _lhSpWS(o); if (q.x > x1 && q.x < x2 && q.y > y1 && q.y < y2) sc += 1 + (o.s || 1) * (o.dim ? 0.1 : 1); }
                if (!best || sc < best.sc) best = { dir, vy, sc };
            }
            h.pl = { w, dir: best.dir, vy: best.vy };
        }
        pl = place(h.pl.dir, h.pl.vy);
    } else pl = place(p.x + r + 70 + bw > W - 8 ? -1 : 1, -1);   // 一般 hover：照舊右上，右邊放不下就往左拉
    const { dir, ax, ay, bx, by, ex } = pl;
    c.strokeStyle = w.rgb; c.fillStyle = w.rgb; c.lineWidth = 1.2; c.shadowColor = w.rgb; c.shadowBlur = 6;
    // 折線一段段長出來：斜線 → 橫線
    const seg1 = Math.min(1, e * 2), seg2 = Math.max(0, e * 2 - 1), boxA = Math.max(0, Math.min(1, (age - LINE) / BOX));
    c.globalAlpha = 0.9;
    c.beginPath(); c.arc(ax, ay, 2.2, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.moveTo(ax, ay); c.lineTo(ax + (bx - ax) * seg1, ay + (by - ay) * seg1);
    if (seg2) c.lineTo(bx + (ex - bx) * seg2, by);
    c.stroke();
    if (boxA > 0) {
        const seg2 = boxA, x0 = dir > 0 ? ex : ex - bw, y0 = by - bh / 2;
        c.globalAlpha = seg2;
        c.shadowBlur = 14;
        c.fillStyle = _lhSp.cCard; c.globalAlpha = seg2 * 0.86;
        c.beginPath(); if (c.roundRect) c.roundRect(x0, y0, bw, bh, 4); else c.rect(x0, y0, bw, bh); c.fill();
        c.globalAlpha = seg2; c.shadowBlur = 0; c.stroke();
        // 全息感：框角的亮角＋淡淡的掃描線
        c.lineWidth = 2;
        for (const [x, y, sx, sy] of [[x0, y0, 1, 1], [x0 + bw, y0, -1, 1], [x0, y0 + bh, 1, -1], [x0 + bw, y0 + bh, -1, -1]]) {
            c.beginPath(); c.moveTo(x + sx * 7, y); c.lineTo(x, y); c.lineTo(x, y + sy * 7); c.stroke();
        }
        c.globalAlpha = seg2 * 0.08;
        for (let y = y0 + 3; y < y0 + bh; y += 3) c.fillRect(x0 + 1, y, bw - 2, 1);
        c.globalAlpha = seg2;
        c.textBaseline = 'middle'; c.textAlign = 'left';
        // 分類一段一段浮現，段與段之間用淡色的「·」隔開
        let x = x0 + 10;
        parts.forEach((pt, i) => {
            const a = fade(LINE + BOX + i * STEP);
            c.font = '600 13px ' + _lhSp.font;
            if (i) { c.globalAlpha = a * 0.6; c.fillStyle = _lhSp.cMute; c.fillText(SEP, x, y0 + 15); x += c.measureText(SEP).width; }   // 行星的分隔是空白
            c.globalAlpha = a; c.fillStyle = w.rgb; c.fillText(pt, x, y0 + 15); x += c.measureText(pt).width;
        });
        c.globalAlpha = fade(tCount); c.fillStyle = _lhSp.cMute; c.font = '12px ' + _lhSp.font; c.fillText(t2, x0 + 10, y0 + 31);
    }
    c.restore();
}

// ===== 第 5 級恆星特效（0.98.21 Andy）：日冕、輻射、扭曲——整體偏慢、偏淡、不搶焦點 =====
// 微調只改這張表：a＝透明度，size／len＝大小（恆星字寬的倍數），spin＝每秒轉幾圈，breath／pulse＝亮暗一輪幾秒，speed＝波動每秒幾輪
const LH_SP_STARFX = {
    corona: { a: 0.25, size: 0.11, spin: 0.012, breath: 7, n: 160, amp: 0.3, speed: 0.05, waveAmp: 0.034, waveFreq: 1.6, waveSpeed: 0.08 }, // 日冕：每條各自慢慢伸縮（amp／speed）＋一道平滑的 sine 波（0.98.22.5）：waveAmp＝震幅（日冕半徑倍）、waveFreq＝日冕半徑內幾個波、waveSpeed＝每秒往外走幾個波
    rays:   { n: 14, a: 0.4, len: 0.2, width: 0.06, spin: 0.008, pulse: 5 }, // 輻射：幾道細長光芒，各自慢慢明滅（彼此錯開）
    heat:   { a: 0.05, amp: 0.056, speed: 1.6 },                             // 熱浪：字本身很輕的晃動（0.98.22 從「扭曲」獨立出來；扭曲光環刪掉）
};
// ===== 0.98.21 Andy 暫時的調參面板（宇宙右上 ⚙）：殘影、光暈閃爍、混沌凝聚、第 5 級恆星特效的數字都在這裡 =====
// 滑桿直接改這張表、即時生效（重新整理會回到這裡寫的值）；Andy 調好按「複製數值」貼給 Claude 寫死，再把 LH_SP_TUNE_UI 改 false 藏起齒輪
const LH_SP_DEV = LH_LOCAL_HOST && lhGet('lh:spUserMode') !== '1';   // lh:spUserMode＝1：本地也用使用者模式（試放逐虛空）   // Andy：開發者模式＝本地伺服器（黑洞刪詞只有本地有）
const LH_SP_TUNE_UI = LH_LOCAL_HOST || lhGet('lh:spTuneUI') === '1';   // 本地測試自動出現、線上自動藏   // 0.98.22.11 Andy：美術調完，齒輪藏起來；本地要調再開（localStorage lh:spTuneUI＝1）
const LH_SP_TUNE = {
    trail:  { alpha: 0.7, cone: 1, soft: 8, edge: 0.2, kill: 25, boost: 0, hold: 800, min: 0.6, ghost: 0, max: 1500, flip: 200, cap: 0.1, slice: 120, ghostMax: 16 },   // B 鏡頭在動（0.98.22.11 重寫）；flip／cap／slice／ghostMax 不放滑桿
    trailA: { alpha: 0.7, cone: 1, soft: 8, edge: 0.3, kill: 30, life: 800, spd: 1, acc: 1 },   // A 自己動（凝聚、沖散）燃燒軌跡：life＝在動時留幾毫秒、kill＝停下來後每秒吃幾個控制點、spd／acc＝速度／加速度對濃淡的加成
    trailC: { alpha: 0.7, cone: 1, soft: 8, edge: 0.2, kill: 25, boost: 0, hold: 800, min: 0.6, ghost: 0, max: 1500, dist: 500, distFade: 600, tailN: 5, tailS: 1 },   // C 拖畫布（hand scroll；Andy：跟縮放速度基準不同，獨立一組）
    trailD: { alpha: 0.5, cone: 1, soft: 8, edge: 0.3, kill: 30, life: 1200, cap: 200 },   // D 公轉燃燒軌跡（cap＝自己動＋公轉同時最多畫幾條）
    smD:    { alpha: 0.6, len: 1, wid: 1, shape: 0.7, life: 1500, gap: 1 },   // Andy 煙霧：公轉（＋拖畫布擾動）。range＝擴散範圍（煙多粗＋散開時長多寬）、shape＝0 圓潤軟霧／1 不規則火焰
    smA:    { alpha: 0.6, len: 1, wid: 1, shape: 0.7, life: 1500, from: 0.5, gap: 1 },   // 凝聚煙霧：from＝每顆行星自己凝聚到幾成才冒煙
    smC:    { on: 1, inertia: 0.5, fadeK: 0 },   // 拖畫布：on 1 煙被沖散／0 光帶（trailC）；inertia＝受慣性影響程度；fadeK＝沖散時消失速度（＋快／−慢）
    glow:   { star: 3, starSize: 0.5, twBoost: 1.5, twRate: 1.8, twLen: 1400, lineBreath: 5.6, lineDepth: 0.28, flashRate: 1, flashLen: 300, flash: 0.2, comet: 0.05, cometFlick: 140 },   // 0.98.22.6 Andy 調好的值
    con:    { dim: 0.1, fill: 0.04 },
    roam:   { micro: 21, small: 8.5, mid: 16, comet: 1, planet: 1, fall: 1, wobAmp: 1, wobFreq: 1, interarm: 0.1 },   // 微星系（≤7 詞）、小星系（8～15 詞）繞中心公轉的速度（px／秒，第 5 級再 ×1.8）
    dock:   { px: 20, extra: 4, r: 500, curve: 4, push: 1, star: 0.15 },   // 黑洞放大：最多加幾倍（最小的字；越大的字、恆星加得越少）、游標周圍多大範圍   // 0.98.22.11：骰子／AI／保留詞星座——不顯眼的那兩種線的濃度、第 5 級封閉多邊形的填色濃度
    // 0.98.41 Andy 新黑洞：外觀大小＝縮放 100% 時的直徑 px；範圍、引力全部用宇宙半徑 %；引力 a×(1−距離/範圍)^b，所有天體一樣快；速度上限、逃逸後的反阻尼、甩動煞車（離宇宙邊界最遠距離的 %）都是相對量——大小宇宙表現一樣
    bh: { lens: { px: 24, extra: 4, curve: 3.25, push: 0.9, star: 0.15 }, size: 60, core: 1, ring: 7, form: 30, margin: 0.1, speed: 0.7, back: 0.35, brake: 30, range: 40, absorb: 22, scatR: 11, lensR: 9, ga: 450, gb: 3, gmax: 65, anti: 20, dW: 1, stSoft: 1, dFib: 2, dStarB: 1.5, dStarFib: 2, dOff: 0.6, stGrow: 4, eMaxB: 1.4, eMaxR: 1.8, eOver: 30, eSpd: 40, eGlow: 2.5, eGlowB: 1, eStar: 0.15, slow: 10, slowT: 0.75, dropPx: 32 },
    grab: { lead: 0.15 },
    wh: { u1: 0.8, pre: 2.4, pow: 3, t25: 1 },   // 0.98.41 Andy：白洞出口——前段慢慢放大到 pre 倍（到 u1 為止，t25＝起步凝滯：放大到 2.5 倍花幾秒），之後照 pow 次方衝到蓋滿
    gather: { dur: 1, k: 0.03, stiff: 15.5, ramp: 20, damp: 0.8, spread: 0.65, scatter: 0.6, fadeTo: 0.5, fadeMin: 0, fadeShared: 1, fadeShape: 0.3, starTo: 0.4, fadeMs: 2500, litHeatFrom: 0, litHeatTo: 0.6, heatBoost: 4, heatFocusFrom: 0.6, heatFocusTo: 1, focusFrom: 0, focusTo: 0.8, blur: 0.6, litCorona: 0, litGlowAt: 0.9, litGlowDur: 8, litRayDur: 8 },
    starfx: LH_SP_STARFX,
};
// 0.98.22.11 Andy：齒輪「寫成預設」寫進 js/sp-tune-defaults.js 的數字，蓋過上面寫死的預設（只收同名、有限的數字）
if (typeof LH_SP_TUNE_FILE === 'object' && LH_SP_TUNE_FILE) (function m(dst, src) {
    for (const k of Object.keys(src)) {
        if (dst[k] && typeof dst[k] === 'object' && src[k] && typeof src[k] === 'object') m(dst[k], src[k]);
        else if (typeof dst[k] === 'number' && Number.isFinite(src[k])) dst[k] = src[k];
    }
})(LH_SP_TUNE, LH_SP_TUNE_FILE);
// Andy：觸控裝置（iPhone／iPad）另一套參數——js/sp-tune-defaults-mobile.js 再疊一層；瀏覽器存的也分開（lh:spTuneM）
if (LH_SP_COARSE && typeof LH_SP_TUNE_FILE_M === 'object' && LH_SP_TUNE_FILE_M) (function m(dst, src) {
    for (const k of Object.keys(src)) {
        if (dst[k] && typeof dst[k] === 'object' && src[k] && typeof src[k] === 'object') m(dst[k], src[k]);
        else if (typeof dst[k] === 'number' && Number.isFinite(src[k])) dst[k] = src[k];
    }
})(LH_SP_TUNE, LH_SP_TUNE_FILE_M);
const LH_SP_TUNE_DEF = JSON.parse(JSON.stringify(LH_SP_TUNE));
// 0.98.22.4 Andy：滑桿調過的值存在這台瀏覽器（lh:spTune），關掉、閃退再開都還在；「還原預設」才清掉。只收表上有的數字，舊版多的鍵不理
// [群組, 鍵, 名稱, 最小, 最大, 一格]；恆星特效是 starfx.子群組.鍵
// 0.98.22.11 Andy：面板瘦身——下列已調定的滑桿拿掉（數值照舊生效，在 sp-tune-defaults.js）：trail.ghost、trailC.hold/min/boost/ghost、gather.fadeShared/fadeMin
const LH_SP_TUNE_ROWS = [
    // Andy 面板重整：外層四大類（星系／恆星／互動／黑洞，名稱前綴），每組裡再分小段——字串 '#名稱|色票' 是小段標題，同一種主題整個面板同一個顏色（_lhSpTuneTagC）
    ['星系｜公轉', [
        '#星系漫遊|galaxy',
        ['roam.micro', '微星系（7 詞以下）繞中心速度', 0, 600, 1],
        ['roam.small', '小星系（8～15 詞）繞中心速度', 0, 600, 1],
        ['roam.mid', '中小星系（16～30 詞）繞中心速度（開新宇宙才生效）', 0, 600, 0.5],
        '#行星|planet',
        ['roam.planet', '行星公轉速度（倍）', 0, 5, 0.05],
        ['roam.fall', '越外圍越慢的程度（0 一樣快／1 原本）', 0, 3, 0.05],
        ['roam.wobAmp', '行星離軌道的隨機晃動幅度（倍）', 0, 5, 0.05],
        ['roam.wobFreq', '晃回軌道的頻率（倍）', 0, 5, 0.05],
        ['roam.interarm', '落單在旋臂之間的行星比例（0～0.1＝10%；開新宇宙／換一批才生效）', 0, 0.1, 0.005]]],
    ['星系｜流星', [
        '#流星|comet',
        ['roam.comet', '流星速度（倍）', 0, 5, 0.05],
        ['glow.comet', '流星光暈濃度', 0, 1, 0.05],
        ['glow.cometFlick', '流星閃爍速度（越大越慢）', 60, 1200, 20]]],
    ['星系｜混沌凝聚', [
        '#時間|time',
        ['gather.dur', '凝聚完成時間（倍；1＝現在，0.5＝快一倍，2＝慢一倍；所有百分比都不變）', 0.25, 3, 0.05],
        '#物理|phys',
        ['gather.k', '一開始的拉力', 0.005, 0.2, 0.005],
        ['gather.stiff', '越拉越緊的程度', 0, 20, 0.5],
        ['gather.ramp', '變緊的時間尺度（秒）', 2, 30, 0.5],
        ['gather.damp', '阻尼（越小擺盪越多次）', 0.2, 2, 0.05],
        ['gather.spread', '每顆拉力差異', 0, 1, 0.05],
        ['gather.scatter', '起點離目的地多遠（星系半徑倍）', 0.5, 4, 0.1],
        '#行星|planet',
        ['gather.fadeTo', '行星凝聚到幾成完全不透明＋對焦', 0.05, 1, 0.05],
        ['gather.fadeShape', '浮現＋對焦曲線（0.5 直線／<0.5 後段快／>0.5 後段慢）', 0, 1, 0.05],
        ['gather.fadeMs', '行星至少多久才亮滿（毫秒）', 0, 8000, 100],
        ['gather.blur', '行星浮現時的模糊（字高倍，0 關）', 0, 2, 0.05],
        '#恆星|star',
        ['gather.starTo', '恆星凝聚到幾成完全不透明', 0.05, 1, 0.05],
        ['gather.focusFrom', '恆星對焦從凝聚幾成開始（模糊→清楚）', 0, 1, 0.05],
        ['gather.focusTo', '恆星對焦在凝聚幾成完成', 0.05, 1, 0.05],
        '#熱浪|heat',
        ['gather.litHeatFrom', '恆星熱浪從凝聚幾成開始亮', 0, 1, 0.05],
        ['gather.litHeatTo', '恆星熱浪在凝聚幾成亮完', 0.05, 1, 0.05],
        ['gather.heatBoost', '恆星還沒對焦時熱浪晃動放大幾倍（對焦完回到 1 倍）', 1, 10, 0.5],
        ['gather.heatFocusFrom', '恆星熱浪對焦從凝聚幾成開始', 0, 1, 0.05],
        ['gather.heatFocusTo', '恆星熱浪對焦在凝聚幾成完成', 0.05, 1, 0.05],
        '#日冕・光暈・光芒|light',
        ['gather.litCorona', '日冕從凝聚幾成開始亮', 0, 0.99, 0.01],
        ['gather.litGlowAt', '光暈從凝聚幾成開始亮', 0.3, 1, 0.01],
        ['gather.litGlowDur', '光暈亮滿（秒）', 0, 20, 0.5],
        ['gather.litRayDur', '凝聚完成後光芒亮滿（秒）', 0, 20, 0.5]]],
    ['星系｜殘影：公轉煙霧', [
        '#外觀|look',
        ['smD.alpha', 'a. 煙霧濃淡', 0, 1, 0.05],
        ['smD.len', 'b. 煙霧長度（字寬一半×，順著前進方向）', 0.2, 4, 0.05],
        ['smD.wid', 'b2. 煙霧寬度（字寬×，1＝跟字一樣寬）', 0, 2, 0.05],
        ['smD.shape', 'c. 煙霧形狀（0 圓潤／1 順著前進方向拉長）', 0, 1, 0.05],
        ['smD.gap', '煙霧離星星多遠（半個星球×；0＝前端貼星星中心，負＝往前蓋到星星上）', -2, 4, 0.05],
        '#收尾|end',
        ['smD.life', 'd. 煙霧停留時間（毫秒）', 200, 6000, 50]]],
    ['星系｜殘影：凝聚煙霧', [
        '#外觀|look',
        ['smA.alpha', '煙霧濃淡', 0, 1, 0.05],
        ['smA.len', '煙霧長度（字寬一半×，順著前進方向）', 0.2, 4, 0.05],
        ['smA.wid', '煙霧寬度（字寬×，1＝跟字一樣寬）', 0, 2, 0.05],
        ['smA.shape', '煙霧形狀（0 圓潤／1 順著前進方向拉長）', 0, 1, 0.05],
        ['smA.gap', '煙霧離星星多遠（半個星球×；0＝前端貼星星中心，負＝往前蓋到星星上）', -2, 4, 0.05],
        '#時機|trig',
        ['smA.from', '行星自己凝聚到幾成才開始冒煙', 0, 1, 0.05],
        '#收尾|end',
        ['smA.life', '煙霧停留時間（毫秒：每一團煙散到看不見）', 200, 6000, 50]]],
    ['恆星｜光暈閃爍', [
        '#光暈|light',
        ['glow.star', '恆星光暈亮度（倍；3＝原本）', 0, 12, 0.05],
        ['glow.starSize', '恆星光暈大小（星系半徑×）', 0.05, 1.5, 0.01],
        '#閃爍|motion',
        ['glow.twRate', '星星閃爍頻率（倍）', 0, 4, 0.1],
        ['glow.twBoost', '閃爍時光暈加亮（倍）', 0, 3, 0.1],
        ['glow.twLen', '一次閃爍多久（毫秒）', 300, 4000, 50]]],
    ['恆星｜日冕', [
        '#外觀|look',
        ['starfx.corona.a', '透明度', 0, 1, 0.01],
        ['starfx.corona.size', '大小（星系半徑×，0.5＝50%）', 0.05, 1.5, 0.01],
        ['starfx.corona.n', '細絲數', 0, 200, 5],
        '#動態|motion',
        ['starfx.corona.spin', '轉速（圈／秒）', 0, 0.1, 0.002],
        ['starfx.corona.breath', '亮暗一輪（秒）', 1, 30, 0.5],
        ['starfx.corona.amp', '伸縮幅度', 0, 1, 0.01],
        ['starfx.corona.speed', '伸縮速度（輪／秒）', 0, 0.5, 0.005],
        '#波|wave',
        ['starfx.corona.waveAmp', '波的震幅', 0, 0.15, 0.002],
        ['starfx.corona.waveFreq', '波的頻率（半徑內幾個波）', 0, 10, 0.1],
        ['starfx.corona.waveSpeed', '波往外走（波／秒）', 0, 2, 0.01]]],
    ['恆星｜輻射', [
        '#外觀|look',
        ['starfx.rays.n', '光芒數', 0, 16, 1],
        ['starfx.rays.a', '透明度', 0, 1, 0.01],
        ['starfx.rays.len', '長度（星系半徑×）', 0.05, 1.5, 0.01],
        ['starfx.rays.width', '粗細', 0.02, 0.5, 0.01],
        '#動態|motion',
        ['starfx.rays.spin', '轉速（圈／秒）', 0, 0.1, 0.002],
        ['starfx.rays.pulse', '明滅一輪（秒）', 1, 30, 0.5]]],
    ['恆星｜熱浪', [
        '#外觀|look',
        ['starfx.heat.a', '透明度', 0, 1, 0.01],
        '#動態|motion',
        ['starfx.heat.amp', '晃動幅度', 0, 0.1, 0.002],
        ['starfx.heat.speed', '晃動速度（輪／秒）', 0, 2, 0.02]]],
    ['互動｜殘影：縮放光帶', [
        '#外觀|look',
        ['trail.alpha', '光帶濃淡', 0, 1, 0.05],
        ['trail.cone', '光帶錐形程度（頭端寬＝字寬×）', 0.1, 3, 0.05],
        ['trail.soft', '光帶柔邊（px）', 0, 40, 1],
        ['trail.edge', '光帶尾端柔邊（佔全長比例，小＝俐落）', 0.05, 1.5, 0.05],
        '#觸發|trig',
        ['trail.min', '光帶快速殘影判斷門檻', 0, 0.95, 0.01],
        ['trail.boost', '光帶速度加成（慢的也能出殘影）', 0, 1, 0.05],
        '#收尾|end',
        ['trail.hold', '光帶快速殘影暫停時間（毫秒）', 0, 3000, 50],
        ['trail.kill', '光帶停下來後收尾（每秒收掉幾個點，全長 50 點）', 1, 200, 1],
        ['trail.max', '光帶停留時間（毫秒：移動中每一段留多久）', 200, 3000, 50]]],
    ['互動｜殘影：拖畫布光帶', [
        '#外觀|look',
        ['trailC.alpha', '光帶濃淡', 0, 1, 0.05],
        ['trailC.cone', '光帶錐形程度（頭端寬＝字寬×）', 0.1, 3, 0.05],
        ['trailC.soft', '光帶柔邊（px）', 0, 40, 1],
        ['trailC.edge', '光帶尾端柔邊（佔全長比例，小＝俐落）', 0.05, 1.5, 0.05],
        '#收尾|end',
        ['trailC.kill', '① 尾巴按部就班吃：每秒吃幾個點（全長 50 點；10＝最後一次變長後 5 秒吃完，不管多長）', 1, 200, 1],
        ['trailC.tailN', '最後幾個控制點放慢收（0＝關）', 0, 20, 1],
        ['trailC.tailS', '放慢的每個控制點走幾秒', 0, 3, 0.1],
        '#長度上限|len',
        ['trailC.dist', '② 光帶最長（px，100% 時；縮小到底 1/8、放大到底 2 倍）', 100, 3000, 50],
        ['trailC.distFade', '② 超過的部分幾毫秒內吃掉（加速吃）', 50, 3000, 50]]],
    ['互動｜游標放大鏡', [
        '#放大|look',
        ['dock.px', '至少放大到多少像素（字高）', 8, 60, 1],
        ['dock.extra', '已達門檻後額外放大多少像素', 0, 40, 1],
        ['dock.curve', '放大曲線（越大越集中在游標中心）', 1, 8, 0.25],
        '#範圍|len',
        ['dock.r', '範圍（px）', 80, 800, 10],
        ['dock.push', '魚眼推開程度（0 關）', 0, 2, 0.05],
        ['dock.star', '恆星受影響程度（0 不動／1 跟行星一樣）', 0, 1, 0.05]]],
    ['互動｜星座', [
        '#星座|line',
        ['con.dim', '不顯眼的星座線濃度', 0, 1, 0.05],
        ['con.fill', '星座多邊形填色濃度（第 5 級）', 0, 0.3, 0.005],
        '#星座線呼吸・閃光|motion',
        ['glow.lineBreath', '星座線呼吸一輪（秒）', 1, 15, 0.2],
        ['glow.lineDepth', '星座線呼吸深淺', 0, 0.6, 0.02],
        ['glow.flashRate', '星座線閃光頻率（倍）', 0, 4, 0.1],
        ['glow.flashLen', '星座線閃光長度（毫秒）', 300, 4000, 50],
        ['glow.flash', '星座線閃光亮度（倍）', 0, 2, 0.05]]],
    ['互動｜抓行星', [
        '#點擊範圍|len',
        ['grab.lead', '飛行中的行星點擊範圍往前多算幾秒的路（0 關）', 0, 0.6, 0.01]]],
    ['黑洞｜白洞出口', [
        '#加速|motion',
        ['wh.u1', '慢慢放大的那段佔全程多少（越大＝衝刺越晚）', 0.3, 0.88, 0.01],
        ['wh.pre', '衝刺前放大到幾倍', 1, 8, 0.1],
        ['wh.pow', '衝刺曲線（1 直線／越大越晚才猛衝）', 1, 6, 0.1],
        ['wh.t25', '起步凝滯：放大到 2.5 倍要幾秒', 0.2, 2.5, 0.05]]],
    ['黑洞｜黑洞', [
        '#外觀|look',
        ['bh.size', '大小（縮放 100% 時的直徑 px）', 10, 300, 1],
        ['bh.core', '核心（黑洞半徑×；掉進來＝被吞）', 0.2, 1, 0.01],
        ['bh.ring', '光環粗細（畫面 px）', 1, 40, 0.5],
        ['bh.form', '凝聚完成後幾秒長成', 1, 120, 1],
        '#移動|motion',
        ['bh.margin', '宇宙邊界離星系群外緣多遠（星系群半徑的比例：0.1＝再往外 10%）', -0.2, 0.4, 0.005],
        ['bh.speed', '繞邊速度（宇宙半徑 %／秒）', 0, 5, 0.05],
        ['bh.back', '停下後飄回邊緣的速度（宇宙半徑 %／秒，等速）', 0.02, 3, 0.01],
        ['bh.brake', '甩動煞車距離（離宇宙邊界最遠距離的 %；黑洞、恆星、行星、流星共用）', 5, 200, 1],
        '#範圍|trig',
        ['bh.range', '引力範圍（宇宙半徑 %）', 2, 150, 0.5],
        ['bh.absorb', '光暈開始被吸（宇宙半徑 %）', 1, 150, 0.5],
        ['bh.scatR', '恆星散架（宇宙半徑 %）', 0.5, 150, 0.5],
        ['bh.lensR', '魚眼範圍（宇宙半徑 %）', 0.5, 100, 0.5],
        '#引力|phys',
        ['bh.ga', '強度 a：黑洞中心的加速度（宇宙半徑 %／秒²）', 0, 5000, 10],
        ['bh.gb', '加速度 b：加速度＝a×(1−距離／範圍)^b（越大越集中在中心）', 0.2, 8, 0.05],
        ['bh.gmax', '速度上限（宇宙半徑 %／秒）', 1, 400, 1],
        ['bh.anti', '反阻尼：逃逸後的煞車距離（離宇宙邊界最遠距離的 %）', 5, 200, 1],
        '#瓦解|light',
        ['bh.dW', '星塵起點寬度（星球半徑×）', 0.1, 4, 0.05],
        ['bh.stSoft', '星塵柔化', 0, 3, 0.05],
        ['bh.dFib', '細纖維根數', 0, 10, 1],
        ['bh.dStarB', '恆星星塵亮度加成（倍）', 0, 5, 0.05],
        ['bh.dStarFib', '恆星細纖維根數加成（倍）', 0, 5, 0.1],
        ['bh.dOff', '星塵起點（離星球中心，星球半徑×）', 0, 2, 0.01],
        ['bh.stGrow', '星塵從透明長到扎實要幾秒（約）', 0.5, 15, 0.5],
        '#吸食|heat',
        ['bh.eMaxB', '黑洞膨脹最大（直徑倍數）', 1, 4, 0.05],
        ['bh.eMaxR', '光圈膨脹最大（黑洞直徑倍數）', 1, 6, 0.05],
        ['bh.eOver', '光圈和黑洞重疊（%：0＝內緣貼著黑洞邊）', 0, 95, 1],
        ['bh.eSpd', '膨脹速度（每秒膨脹自己的 %；消散一樣快）', 1, 200, 1],
        ['bh.eGlow', '光暈大小（光圈×）', 1, 6, 0.05],
        ['bh.eGlowB', '光暈亮度（倍）', 0, 3, 0.05],
        ['bh.eStar', '吸食速度（恆星被吸縮水的常數）', 0, 2, 0.01],
        '#互動|time',
        ['bh.slow', '時間放慢倍數（拖黑洞、拖詞到黑洞上方；1＝不放慢）', 1, 60, 1],
        ['bh.slowT', '煞車／放開要幾秒', 0.05, 3, 0.05],
        ['bh.dropPx', '拖詞到黑洞上方時直徑多幾 px（畫面上）', 0, 200, 1],
        '#魚眼|len',
        ['bh.lens.px', '至少放大到多少像素（字高）', 8, 60, 1], ['bh.lens.extra', '已達門檻後額外放大多少像素', 0, 40, 1],
        ['bh.lens.curve', '放大曲線（越大越集中在黑洞中心）', 0.5, 6, 0.25], ['bh.lens.push', '魚眼推開程度（0 關）', 0, 3, 0.05], ['bh.lens.star', '恆星受影響程度（0 不動／1 跟行星一樣）', 0, 1, 0.05]]],
];
const _lhSpTuneAll = () => LH_SP_TUNE_ROWS.flatMap(([, rows]) => rows.filter(Array.isArray));   // 所有滑桿（跳過小段標題字串）
// 小段的色票：同一種主題整個面板同一個顏色（兩種主題都看得清楚的中間亮度）
const _lhSpTuneTagC = { time: '#8f98ab', phys: '#8d8fe0', planet: '#4fa3e3', star: '#e0a134', heat: '#e2683f', light: '#d8b43a', comet: '#34b8a5', galaxy: '#a67de0',
    look: '#de6fa2', trig: '#5fb867', end: '#d95f5f', len: '#8fbf3a', motion: '#3fb3d6', wave: '#6f9be8', line: '#c08ae0' };
const _lhSpTunePath = (o, path) => { const ks = path.split('.'), last = ks.pop(); for (const k of ks) o = o?.[k]; return [o, last]; };
// 0.98.22.11 Andy：請 Claude 改的值要蓋掉瀏覽器裡存的——改哪個就把它在這裡的數字 +1，存的版本比較舊的那一項會用新預設，其他自己拉的照舊
const LH_SP_TUNE_REV = { 'bh.size': 3, 'bh.margin': 2, 'bh.range': 3, 'bh.absorb': 3, 'bh.scatR': 2, 'bh.lensR': 2, 'bh.ga': 1, 'bh.gmax': 1, 'bh.core': 1, 'bh.stSoft': 1, 'bh.speed': 1, 'bh.back': 1, 'bh.slow': 1, 'gather.starTo': 1, 'trail.soft': 1, 'gather.fadeTo': 1, 'gather.litCorona': 1, 'dock.r': 2 };   // bh.margin：Andy 宇宙再大一點（0.05→0.4）
const _lhSpTuneSave = () => (v => LH_SP_COARSE ? lhSet('lh:spTuneM', v) : lhSet('lh:spTune', v))(JSON.stringify({ ...LH_SP_TUNE, _rev: LH_SP_TUNE_REV }));
{
    const saved = LH_SP_TUNE_UI && (LH_SP_COARSE ? lhGetJSON('lh:spTuneM', null, v => v && typeof v === 'object') : lhGetJSON('lh:spTune', null, v => v && typeof v === 'object'));   // 齒輪藏起來時不套瀏覽器裡調過的值（一律用 sp-tune-defaults.js）
    if (saved) for (const [path] of _lhSpTuneAll()) {
        const [so, sk] = _lhSpTunePath(saved, path), [o, k] = _lhSpTunePath(LH_SP_TUNE, path);
        if (so && Number.isFinite(so[sk]) && (saved._rev?.[path] || 0) >= (LH_SP_TUNE_REV[path] || 0)) o[k] = so[sk];
    }
}
// 齒輪面板：每組一個標題、每個數字一條滑桿＋目前值；底下「複製數值」「還原預設」
function _lhSpTunePanel() {
    const box = _lhWsEl('div', 'ws-tune');
    box.hidden = true;
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', '宇宙特效調參');
    if (LH_SP_COARSE) box.prepend(_lhWsEl('div', 'ws-tune-sub', '行動裝置專用參數（跟電腦版分開存）'));
    {   // 0.98.41 Andy：輔助線兩個開關——開著一直顯示；關著只在拉滑桿、按住黑洞時暫時出現
        const row = _lhWsEl('div', 'ws-tune-row ws-tune-guide');
        for (const [k, get, set, txt] of [['guideBh', () => lhGet('lh:spGuide'), v => lhSet('lh:spGuide', v), '黑洞範圍'], ['guideEdge', () => lhGet('lh:spGuideE'), v => lhSet('lh:spGuideE', v), '宇宙邊界']]) {
            const lb = _lhWsEl('label', 'ws-tune-gl'), cb = _lhWsEl('input', 'ws-tune-cb');
            cb.type = 'checkbox'; cb.checked = (_lhSp[k] ??= get() === '1');
            cb.addEventListener('change', () => { _lhSp[k] = cb.checked; set(cb.checked ? '1' : '0'); _lhSp.dirty = true; });
            lb.append(cb, _lhWsEl('span', 'ws-tune-l', txt)); row.append(lb);
        }
        box.append(row);
        if (LH_LOCAL_HOST) {   // 0.98.41 Andy：黑洞物理對照——整個宇宙換成 0.98.40 原檔（legacy/），右下角的鈕切回來
            const ph = _lhWsEl('button', 'ws-tune-phys', '切到 0.98.40 黑洞對照');
            ph.type = 'button'; ph.addEventListener('click', () => { lhSet('lh:spPhys', '0.98.40'); location.reload(); });
            row.append(ph);
        }
    }
    const inputs = [], groups = [];
    // 0.98.22.11 Andy：每條旁邊寫「預設 X」，跟預設不一樣的整條標出來，組標題後面寫改了幾項——一眼看出自己動過哪些
    const conds = [], cats = new Map();   // Andy：「模式」切換後，只顯示那個模式用得到的滑桿
    const recount = () => conds.forEach(f => f()) || groups.forEach(([h, name, rs]) => { const n = rs.filter(x => x.classList.contains('chg') && !x.hidden).length; h.textContent = name + (n ? '（改了 ' + n + ' 項）' : ''); }) || cats.forEach(([, ch, rss], cn) => { const n = rss.flat().filter(x => x.classList.contains('chg') && !x.hidden).length; ch.textContent = cn + (n ? '（改了 ' + n + ' 項）' : ''); });
    for (const [name, rows] of LH_SP_TUNE_ROWS) {
        const grp = _lhWsEl('details', 'ws-tune-g');   // 0.98.22.4：每組可以收合，一開始全收起來
        // Andy：第二層收納——外層大類＝組名「｜」前面（星系／恆星／互動／黑洞），裡面的組名是「｜」後面
        const cn = name.split('｜')[0], sub = name.slice(cn.length + 1);
        let cat = cats.get(cn);
        if (!cat) { const d = _lhWsEl('details', 'ws-tune-c'), ch = _lhWsEl('summary', 'ws-tune-ch', cn); d.append(ch); cat = [d, ch, []]; cats.set(cn, cat); }
        const h = _lhWsEl('summary', 'ws-tune-h', sub), rs = [];
        grp.append(h);
        cat[0].append(grp);
        cat[2].push(rs);
        groups.push([h, sub, rs]);
        let tagC = '';
        for (const it of rows) {
            if (typeof it === 'string') {   // 小段標題（有顏色）：底下的滑桿左邊一條同色的線
                const [lab, tag] = it.slice(1).split('|'), hd = _lhWsEl('div', 'ws-tune-sub', lab);
                tagC = _lhSpTuneTagC[tag] || '#999'; hd.style.setProperty('--sub-c', tagC);
                grp.append(hd);
                continue;
            }
            const [path, label, min, max, step, when] = it;
            const row = _lhWsEl('label', 'ws-tune-row' + (tagC ? ' ws-tagged' : ''));
            if (tagC) row.style.setProperty('--sub-c', tagC);
            const out = _lhWsEl('output', 'ws-tune-v'), r = _lhWsEl('input', 'ws-tune-range');
            const [dO, dK] = _lhSpTunePath(LH_SP_TUNE_DEF, path), def = dO ? dO[dK] : undefined;
            const dv = _lhWsEl('span', 'ws-tune-d', '(' + def + ')'), vv = _lhWsEl('span', 'ws-tune-vv');   // 跟預設一樣就不寫；改過才在目前值後面用不同顏色寫（預設值）
            vv.append(out, dv);
            Object.assign(r, { type: 'range', min: String(min), max: String(max), step: String(step) });
            const mark = v => { const c = Math.abs(+v - def) > 1e-9; row.classList.toggle('chg', c); dv.hidden = !c; recount(); };
            const sync = () => { const [o, k] = _lhSpTunePath(LH_SP_TUNE, path); r.value = String(o[k]); out.textContent = String(o[k]); mark(o[k]); };
            r.addEventListener('input', () => { const [o, k] = _lhSpTunePath(LH_SP_TUNE, path); o[k] = +r.value; out.textContent = r.value; mark(r.value); _lhSp.dirty = true; if (path.startsWith('bh.')) _lhSp.bhGuide = _lhSpNow(); });   // 拉黑洞滑桿：畫面上畫範圍輔助線
            r.addEventListener('change', _lhSpTuneSave);   // 放開滑桿才存
            row.addEventListener('dblclick', e => { e.preventDefault(); const [o, k] = _lhSpTunePath(LH_SP_TUNE, path); if (o && def !== undefined) { o[k] = def; sync(); _lhSpTuneSave(); _lhSp.dirty = true; } });   // Andy：雙擊這一列＝還原預設
            row.append(_lhWsEl('span', 'ws-tune-l', label), vv, r);
            if (when) { const [wp, wv] = when.split('='); conds.push(() => { const [o, k] = _lhSpTunePath(LH_SP_TUNE, wp); row.hidden = String(o[k]) !== wv; }); }
            grp.append(row);
            rs.push(row);
            inputs.push(sync);
            sync();
        }
    }
    for (const cn of ['星系', '恆星', '互動', '黑洞']) if (cats.has(cn)) box.append(cats.get(cn)[0]);
    recount();
    const acts = _lhWsEl('div', 'ws-tune-acts');
    const copy = _lhWsEl('button', 'ws-tune-btn', '複製數值');
    copy.type = 'button';
    copy.addEventListener('click', () => {
        const txt = JSON.stringify(LH_SP_TUNE);
        navigator.clipboard.writeText(txt).then(() => showToast('已複製宇宙調參數值，貼給 Claude 就好', 2600),
            e => { lhWarn('複製調參數值失敗', e); console.log(txt); showToast('複製失敗：數值印在主控台（Console）', 3000); });
    });
    const reset = _lhWsEl('button', 'ws-tune-btn', '還原預設');
    reset.type = 'button';
    reset.addEventListener('click', () => {
        for (const g of Object.keys(LH_SP_TUNE_DEF)) {
            if (g === 'starfx') for (const s of Object.keys(LH_SP_TUNE_DEF.starfx)) Object.assign(LH_SP_STARFX[s], LH_SP_TUNE_DEF.starfx[s]);
            else Object.assign(LH_SP_TUNE[g], LH_SP_TUNE_DEF[g]);
        }
        inputs.forEach(f => f());
        if (LH_SP_COARSE) lhRemove('lh:spTuneM'); else lhRemove('lh:spTune');
        _lhSp.dirty = true;
    });
    // 貼上數值（0.98.22.11）：讀剪貼簿的 JSON（跟「複製數值」同格式），表上有的數字才套用；讀不到剪貼簿就跳一個框讓你貼
    const paste = _lhWsEl('button', 'ws-tune-btn', '貼上數值');
    paste.type = 'button';
    paste.addEventListener('click', async () => {
        let txt = '';
        try { txt = await navigator.clipboard.readText(); } catch { txt = prompt('把數值（JSON）貼在這裡') || ''; }
        let obj = null;
        try { obj = JSON.parse(txt); } catch (e) { lhWarn('貼上數值：不是 JSON', e); }
        if (!obj || typeof obj !== 'object') { showToast('剪貼簿裡不是宇宙調參數值', 2600); return; }
        let n = 0;
        for (const [path] of _lhSpTuneAll()) {
            const [so, sk] = _lhSpTunePath(obj, path), [o, k] = _lhSpTunePath(LH_SP_TUNE, path);
            if (so && Number.isFinite(so[sk]) && o) { o[k] = so[sk]; n++; }
        }
        if (!n) { showToast('剪貼簿裡沒有認得的數值', 2600); return; }
        inputs.forEach(f => f());
        _lhSpTuneSave();
        _lhSp.dirty = true;
        showToast('已套用 ' + n + ' 個數值', 2200);
    });
    // 寫成預設（0.98.22.11）：只有在本地伺服器（127.0.0.1／localhost）上才有，正式網站沒有這個伺服器就不出現
    const nodes = [copy, paste, reset];
    if (LH_LOCAL_HOST) {
        const save = _lhWsEl('button', 'ws-tune-btn', '寫成預設');
        save.type = 'button';
        save.addEventListener('click', async () => {
            try {
                const r = await fetch('/__lh/tune-defaults' + (LH_SP_COARSE ? '?m=1' : ''), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(LH_SP_TUNE) });
                if (!r.ok) throw new Error(r.status + ' ' + (await r.text()));
                showToast('已寫成' + (LH_SP_COARSE ? '行動裝置' : '') + '預設（js/sp-tune-defaults' + (LH_SP_COARSE ? '-mobile' : '') + '.js），重新整理後「(預設)」會跟著更新', 3200);
            } catch (e) { lhWarn('寫成預設失敗', e); showToast('寫成預設失敗：本地伺服器要用 node tests/serve.mjs 開', 3600); }
        });
        nodes.push(save);
    }
    acts.append(...nodes);
    box.append(acts);
    return box;
}
const _lhSpFxC = new Map();   // 日冕、光芒的小圖：每種顏色畫一次
function _lhSpFxImg(kind, rgb) {
    const key = kind + '|' + rgb;
    let cv = _lhSpFxC.get(key);
    if (cv) return cv;
    cv = document.createElement('canvas');
    const g = cv.getContext('2d');
    if (kind === 'corona') {   // 256×256：中心往外一百多條長短不一的細絲，越外越淡
        cv.width = cv.height = 256;
        g.lineCap = 'round';
        for (let i = 0; i < 150; i++) {
            const a = Math.random() * Math.PI * 2, r0 = 34 + Math.random() * 14, r1 = r0 + 22 + Math.random() * 70;
            const gr = g.createLinearGradient(128 + Math.cos(a) * r0, 128 + Math.sin(a) * r0, 128 + Math.cos(a) * r1, 128 + Math.sin(a) * r1);
            gr.addColorStop(0, _lhSpRGBA(rgb, 0.55)); gr.addColorStop(1, _lhSpRGBA(rgb, 0));
            g.strokeStyle = gr; g.lineWidth = 0.6 + Math.random() * 1.4;
            g.beginPath(); g.moveTo(128 + Math.cos(a) * r0, 128 + Math.sin(a) * r0);
            const bend = (Math.random() - 0.5) * 0.25;   // 微微彎，像日冕的磁力線
            g.quadraticCurveTo(128 + Math.cos(a + bend) * (r0 + r1) / 2, 128 + Math.sin(a + bend) * (r0 + r1) / 2, 128 + Math.cos(a) * r1, 128 + Math.sin(a) * r1);
            g.stroke();
        }
    } else {   // 光芒 256×32：從左端往右漸細漸淡的一道光
        cv.width = 256; cv.height = 32;
        const gr = g.createLinearGradient(0, 0, 256, 0);
        gr.addColorStop(0, _lhSpRGBA(rgb, 0.9)); gr.addColorStop(0.35, _lhSpRGBA(rgb, 0.35)); gr.addColorStop(1, _lhSpRGBA(rgb, 0));
        g.fillStyle = gr;
        g.beginPath(); g.moveTo(0, 6); g.lineTo(256, 16); g.lineTo(0, 26); g.closePath(); g.fill();
    }
    _lhSpFxC.set(key, cv);
    return cv;
}
function _lhSpStarFx(c, w, p, t, z) {
    const F = LH_SP_STARFX, s = t / 1000, ph = w.wob || 0, TAU = Math.PI * 2, m = (w.kb || 1) * (w.mag || 1);
    const Rt = Math.max(8, (w.tw || 40) * z * m * 0.5);   // 字寬的一半：光芒從字邊出發、光芒粗細、熱浪幅度用這個
    const Rg = Math.max(Rt, (w.cl ? w.cl.r : w.tw || 40) * z * m);   // 0.98.22.2 Andy：日冕大小、光芒長度＝自己星系半徑的比例
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.translate(p.x, p.y);
    // 日冕
    // 0.98.22.4 Andy：每條各自慢慢伸長縮短、節奏錯開；0.98.22.5 再加一道平滑的 sine 波——波長每條一樣（照日冕半徑算，不跟著絲的長短擠壓）、根部不擺、細分 24 段，才不會像海草那樣折來折去
    { const C = F.corona, cr = Rg * C.size, br = 0.75 + 0.25 * Math.sin(TAU * s / C.breath + ph), n = C.n | 0;
      const h = (i, k) => { const x = Math.sin(i * 12.9898 + k * 78.233 + ph * 7) * 43758.5453; return x - Math.floor(x); };
      if (n > 0) {
          const gr = c.createRadialGradient(0, 0, cr * 0.27, 0, 0, cr);
          gr.addColorStop(0, _lhSpRGBA(w.rgb, 0.55)); gr.addColorStop(1, _lhSpRGBA(w.rgb, 0));
          c.save(); c.rotate(TAU * s * C.spin + ph * 3); c.globalAlpha = w.alpha * C.a * br;
          c.strokeStyle = gr; c.lineWidth = Math.max(0.6, cr * 0.008); c.lineCap = 'butt';
          // 0.98.22.7 Andy：每條細絲自己的尾端也漸淡——切成 6 截，同一截的所有細絲一起畫（6 次就好），越外面那截越淡；平頭接起來不會疊出亮點
          const A0 = c.globalAlpha, pts = [];
          for (let i = 0; i < n; i++) {
              const a = (i + h(i, 1)) / n * TAU, r0 = cr * (0.27 + 0.11 * h(i, 2)), r1 = r0 + cr * (0.17 + 0.55 * h(i, 3)), q = h(i, 4) * TAU;
              const L = (r1 - r0) * Math.max(0.05, 1 + C.amp * Math.sin(TAU * C.speed * (0.7 + 0.6 * h(i, 5)) * s + q)), ca = Math.cos(a), sa = Math.sin(a);
              const f = [];
              for (let k = 0; k <= 24; k++) {
                  const u = k / 24, r = r0 + L * u, e = Math.min(1, u * 4), d = C.waveAmp * cr * e * e * (3 - 2 * e) * Math.sin(TAU * (C.waveFreq * r / cr - C.waveSpeed * s) + q);
                  f.push(ca * r - sa * d, sa * r + ca * d);
              }
              pts.push(f);
          }
          for (let sg = 0; sg < 6; sg++) {
              c.globalAlpha = A0 * (1 - sg / 6) ** 1.6;
              c.beginPath();
              for (const f of pts) { c.moveTo(f[sg * 8], f[sg * 8 + 1]); for (let k = sg * 4 + 1; k <= sg * 4 + 4; k++) c.lineTo(f[k * 2], f[k * 2 + 1]); }
              c.stroke();
          }
          c.restore();
      } }
    // 輻射
    { const img = _lhSpFxImg('ray', w.rgb), n = F.rays.n;
      for (let i = 0; i < n; i++) {
          const k = (i * 0.618 + ph) % 1, pu = 0.5 + 0.5 * Math.sin(TAU * s / (F.rays.pulse * (0.8 + 0.4 * k)) + i * 1.7 + ph);
          const len = Rg * F.rays.len * (0.75 + 0.35 * pu), wd = Rt * F.rays.width * 2;
          c.save(); c.rotate(ph * 5 + i * TAU / n + TAU * s * F.rays.spin * (i % 2 ? 1 : -1));
          c.globalAlpha = (w.aRay ?? w.alpha) * F.rays.a * pu * pu;   // aRay：凝聚中光芒自己的點亮進度
          c.drawImage(img, Rt * 0.55, -wd / 2, len, wd); c.restore();
      } }
    c.restore();
    // 熱浪：字本身很輕的晃動（兩張錯開一點點的小圖墊在字下面）
    if (w.spr && F.heat.a > 0) {
        // Andy：熱浪也跟著恆星對焦——還沒對焦完就用同一階的模糊版晃（舊：一律用清楚的字，凝聚 2～6 成時糊的恆星上疊兩張清楚的字＝看起來提早變清楚）
        // 熱浪用自己的對焦 w.gHeatF（heatFocusFrom→To）；跟本體一樣在相鄰兩階之間交叉淡（舊版直接挑最近的一階：最後一段停在小糊、對焦完那一刻一下變清楚）
        const f = w.gHeatF, pos = f !== undefined && f < 1 ? (1 - f) * 3 : 0, i0 = Math.min(2, Math.floor(pos)), fr = pos - i0;
        const hb = 1 + ((LH_SP_TUNE.gather.heatBoost ?? 4) - 1) * (f !== undefined ? Math.max(0, 1 - f) : 0);   // Andy：還沒對焦完晃得更兇（最糊時 × gather.heatBoost），對焦完回到滑桿的晃動幅度
        const sp = TAU * s * F.heat.speed, a0 = (w.aHeat ?? w.alpha) * F.heat.a;
        c.save(); c.globalCompositeOperation = 'lighter';
        for (const [lv, al] of [[i0, 1 - fr], [i0 + 1, fr]]) {
            if (al <= 0.001) continue;
            const B = lv ? _lhSpBlurSpr(w, lv) : w.spr, sw = B.width / w.spr.S * z * m, sh = B.height / w.spr.S * z * m;
            c.globalAlpha = a0 * al;
            for (const d of [1, -1]) {
                const dx = Math.sin(sp + ph + d) * Rt * F.heat.amp * hb, dy = Math.cos(sp * 0.8 + ph * 2 + d) * Rt * F.heat.amp * hb;
                c.drawImage(B, p.x - sw / 2 + dx, p.y - sh / 2 + dy, sw * (1 + d * 0.01), sh);
            }
        }
        c.restore();
    }
}

// 光暈圖快取：顏色＋中心濃度 → 一張 128×128 的放射漸層（貼上去再放大，看起來跟現場算的一樣）
const _lhSpGlowC = new Map();
// Andy 煙霧（第 5 級浮誇）：像日冕細絲、柔邊開很大的煙團——橢圓形軟底＋幾條正弦波細絲，整張再大幅模糊。
// 每種顏色做 8 張（細絲的相位不同），蓋的時候照時間輪流換＝細絲像在流動。wisp＝細絲佔多少（0 只有軟底）
const _lhSpWispC = new Map();
// 煙霧觸角（形狀 c）：擴散那步順便沿著一張雜訊流場推一點點（feTurbulence＋feDisplacementMap）→ 停下來的煙也會長出往外伸的觸角，不是一團圓霧。
// 流場每 2 秒換一次種子（每次推得很少，換的時候看不出跳）；shape 0＝不推（圓潤軟霧）、1＝每次最多推 ±2 px（半解析度）
// 0.98.22.11：不再使用（Andy：煙被撕成碎片），確認後刪
function _lhSpSmTurb(shape, t) {
    if (!document.getElementById('lhSmTurb')) document.body.insertAdjacentHTML('beforeend', '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="lhSmTurb" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence id="lhSmTurbN" type="fractalNoise" baseFrequency="0.025" numOctaves="2" seed="1" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" id="lhSmTurbD" scale="4" xChannelSelector="R" yChannelSelector="G"/></filter></svg>');
    const seed = String(Math.floor(t / 2000) % 50 + 1), sc = (4 * shape).toFixed(2), N = document.getElementById('lhSmTurbN'), D = document.getElementById('lhSmTurbD');
    if (N.getAttribute('seed') !== seed) N.setAttribute('seed', seed);
    if (D.getAttribute('scale') !== sc) D.setAttribute('scale', sc);
    return 'url(#lhSmTurb)';
}
// 煙霧扣底：SVG 濾鏡把透明度固定減 1/255（canvas 沒有「減法」混合）；ponytail: Safari 的 canvas 不吃 filter，那邊淡霧仍可能殘留
function _lhSpSmCut() {
    if (!document.getElementById('lhSmCut')) document.body.insertAdjacentHTML('beforeend', '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="lhSmCut" color-interpolation-filters="sRGB"><feComponentTransfer><feFuncA type="linear" slope="1" intercept="-0.004"/></feComponentTransfer></filter></svg>');
    return 'url(#lhSmCut)';
}
// 0.98.22.11 Andy 決定不用髮絲：這個函式暫時沒人呼叫，確認後再刪
function _lhSpWispImg(rgb, i, wisp, hair = 0, H = 64) {   // wisp＝髮絲濃度（0 只有軟霧／1 髮絲最明顯）；hair＝髮絲密度（0＝4 條粗絲糊開／1＝16 條細髮絲、幾乎不糊）
    const key = rgb + '|' + i + '|' + wisp.toFixed(2) + '|' + hair.toFixed(2) + '|' + H;   // H：小圖高度挑跟實際畫的寬度差不多（16～128），髮絲粗細才是真的像素、不會跟著寬度被拉粗
    let cv = _lhSpWispC.get(key);
    if (cv) return cv;
    if (!(_lhSp.wispBudget-- > 0)) return null;   // 每格最多新做幾張（一次做幾百張會卡），還沒做好的先用軟光點代替
    while (_lhSpWispC.size > 1200) _lhSpWispC.delete(_lhSpWispC.keys().next().value);   // 最多 1200 張（大多 64×32～128×64，約 10～40MB）：滿了丟最舊的一張（舊：整批清 → 全部重做、閃爍）
    const W = H * 2, u = H / 64, rnd = (k => () => (k = (k * 16807) % 2147483647) / 2147483647)(i * 7919 + 13);
    cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d'), tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H;
    const tg = tmp.getContext('2d');
    tg.globalAlpha = 1 - wisp * 0.55; tg.drawImage(_lhSpGlowImg(rgb), 8 * u, 6 * u, W - 16 * u, H - 12 * u);   // 軟底
    tg.globalAlpha = 1;
    const nk = 4 + Math.round(hair * 12);
    for (let k = 0; k < nk; k++) {   // 細絲：沿長邊的正弦波，兩端淡出
        const amp = (3 + rnd() * 7) * u, fq = (1 + rnd() * 1.6) * Math.PI * 2 / W, ph = rnd() * Math.PI * 2 + i * 0.8, yc = H / 2 + (k - (nk - 1) / 2) * (3 + rnd() * 3) * u * (5 / nk) * 1.4;
        const gr = tg.createLinearGradient(0, 0, W, 0);
        gr.addColorStop(0, _lhSpRGBA(rgb, 0)); gr.addColorStop(0.3, _lhSpRGBA(rgb, wisp)); gr.addColorStop(0.7, _lhSpRGBA(rgb, wisp)); gr.addColorStop(1, _lhSpRGBA(rgb, 0));
        tg.strokeStyle = gr; tg.lineWidth = (0.8 + rnd() * 1.4) * (1 - hair * 0.5);   // 真實像素（不乘 u）
        tg.beginPath();
        for (let x = 6 * u; x <= W - 6 * u; x += 3 * u) { const y = yc + Math.sin(x * fq + ph) * amp * Math.sin(Math.PI * x / W); x === 6 * u ? tg.moveTo(x, y) : tg.lineTo(x, y); }
        tg.stroke();
    }
    g.filter = 'blur(' + (0.4 + (1 - hair) * 1.2).toFixed(2) + 'px)';   // 真實像素 g.drawImage(tmp, 0, 0); g.filter = 'none';   // 柔邊開很大
    _lhSpWispC.set(key, cv);
    return cv;
}
// 0.98.22.11 Andy（放大看得到顆粒）：舊版把淡淡的濃度（0.13）直接畫進 128px 小圖——顏色只剩三十幾階、放大後一圈一圈很粗。
// 改成小圖用滿濃度畫（256 階）、加大到 256px，淡的程度改在貼上去時用 globalAlpha 乘（呼叫端乘上 a）
function _lhSpGlowImg(rgb) {
    const key = rgb;
    let cv = _lhSpGlowC.get(key);
    if (!cv) {
        cv = document.createElement('canvas'); cv.width = cv.height = 256;
        const g = cv.getContext('2d'), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
        // 再改（Andy：平常亮度還是一圈一圈）：平常只用到約 13% 的濃度，螢幕上只剩三十幾階，色階一定會分圈。
        // ①邊緣改平滑收尾（1 − smoothstep），外圈不再有一道折線；②濃度加一點隨機雜點（抖色），讓相鄰兩階互相混，圈就看不出來
        for (let i = 0; i <= 8; i++) { const r = i / 8; gr.addColorStop(r, _lhSpRGBA(rgb, 1 - r * r * (3 - 2 * r))); }
        g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
        const im = g.getImageData(0, 0, 256, 256), d = im.data;
        for (let i = 3; i < d.length; i += 4) if (d[i]) d[i] = Math.max(0, Math.min(255, d[i] + (Math.random() - 0.5) * 16));
        g.putImageData(im, 0, 0);
        _lhSpGlowC.set(key, cv);
    }
    return cv;
}

function _lhSpSetHover(w) {
    const h = _lhSp.hover;
    if (h === w) return;
    if (h && !(_lhSp.drag && _lhSp.drag.w === h)) h.hot = false;
    _lhSp.hover = w;
    _lhSp.dirty = true;
    _lhSp.el.classList.toggle('on-word', !!w);
}

// 恆星被拉走（滑鼠拖、被黑洞甩出去共用）：第 1、2 級整團跟著恆星走；其他級整團被沖散、之後再慢慢聚回來
function _lhSpScatter(s, L) {
    s.cl.held = true;
    if (L.drag === 'stay' || L.starStay) return;
    for (const o of _lhSp.words) {
        if (o.cl !== s.cl || o === s || o.pinned) continue;
        const at = _lhSpPos(o), a = Math.random() * Math.PI * 2, v = 120 + Math.random() * 220;
        if (!o.free) { o.fx = at.x; o.fy = at.y; o.fvx = 0; o.fvy = 0; o.free = true; } o.src = 'A'; o.smHome = false; o.odist = undefined;   // smHome：回到家（煙改公轉）一次就不再切回，重新沖散才重來   // 被沖散＝A 組殘影
        o.gk = 0;   // 凝聚到一半又被沖散：照一般的速度拉回
        o.fvx += Math.cos(a) * v; o.fvy += Math.sin(a) * v;
    }
}
// 把一個詞從這次的宇宙拿掉（✕ 隱藏、丟進黑洞共用）
function _lhSpDropWord(w) {
    _lhWs.hidden.add(w.w);
    _lhSp.words = _lhSp.words.filter(x => x !== w);
    if (w.cl) w.cl.ver++;
    w.pinned = false;
    _lhSpPin(w);   // 釘住的詞被隱藏：從星座拿掉，前後兩個點直接接起來，和它有關的對角線一起拿掉；之後再釘的照常接在最後
    if (w.star) _lhSpPromote(w.cl);
    if (_lhSp.hover === w) _lhSpSetHover(null);
    if (_lhSp.act === w) _lhSp.act = null;
    _lhSpClearSync();
    _lhSp.dirty = true;
}
// ===== Andy：黑洞＋虛無空間（所有人；LH_SP_DEV＝本地開發者改官方名單）=====
const _lhSpBhHit = (x, y) => { const b = _lhSp.el && _lhSp.el.querySelector('.ws-bh'); if (!b || b.style.visibility === 'hidden') return false;   /* 還沒成形：丟不進去 */ const r = b.getBoundingClientRect(); return Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2)) < r.width * 0.9; };
const _lhSpVoidPost = (op, w) => fetch('/__lh/void', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op, w }) }).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
// 變形蟲形狀的宇宙邊界（單位大小）：r(θ)＝1＋幾個不同頻率的起伏（2～5 瓣，振幅越高頻越小）→ 有凸有凹、連續平滑；
// 面積隨機縮放成單位方形（邊長 2）的 1～1.5 倍。pts：一圈 720 點；cum：累計弧長（等速走用）；k：縮放
function _lhSpAmoeba() {
    const H = [[2, 0.1, 0.18], [3, 0.07, 0.13], [4, 0.03, 0.07], [5, 0.015, 0.035]].map(([n, a, b]) => [n, a + Math.random() * (b - a), Math.random() * Math.PI * 2]);
    const A = { H, k: 1 }, N = 720, pts = [], cum = [0];
    let area = 0;
    for (let i = 0; i <= N; i++) { const th = i / N * Math.PI * 2, rr = _lhSpAmoebaR(A, th); pts.push([Math.cos(th) * rr, Math.sin(th) * rr]); if (i < N) area += rr * rr / 2 * (Math.PI * 2 / N); }
    for (let i = 1; i <= N; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const k = Math.sqrt(4 * (1 + Math.random() * 0.5) / area);   // 面積＝方形（4）×1～1.5
    return Object.assign(A, { k, pts, cum, len: cum[N] });
}
// 0.98.41 Andy 新黑洞引力：加速度＝a ×（1 − 距離／引力範圍）^b，指向黑洞中心；大天體、小天體一樣快（不分質量），角動量自然保留＝會繞著走。
// 單位是宇宙半徑的 1%（H.u）——每個宇宙的範圍、速度感一樣。範圍內速度最多 gmax。
// 回傳 0＝範圍外、1＝範圍內、2＝掉進核心（被吞）。o.e.fast：進過魚眼範圍、速度到上限 8 成＝之後離開範圍算「逃逸」（套反阻尼）
function _lhSpBhG(o, H, T, dt) {
    const dx = H.x - o.x, dy = H.y - o.y, d = Math.hypot(dx, dy) || 1e-6;
    if (d > H.R) return 0;
    if (d < H.r) return 2;
    const a = T.ga * H.u * Math.pow(Math.max(0, 1 - d / H.R), T.gb);
    o.vx += dx / d * a * dt; o.vy += dy / d * a * dt;
    const vm = Math.max(1e-3, T.gmax * H.u), v = Math.hypot(o.vx, o.vy);
    if (v > vm) { o.vx *= vm / v; o.vy *= vm / v; }
    if (o.e && d < H.L && v >= vm * 0.8) o.e.fast = 1;
    return 1;
}
// 0.98.41 Andy 甩動煞車（黑洞、恆星、行星、流星共用）：量這個位置離宇宙邊界最遠有多遠，× pct% ＝ 煞停要走的路，照這段路算固定的減速度（直線等減速）。
// 途中被引力、彈簧改變方向或速度都可以，減速度不變。沒有宇宙邊界（第 5 級以外）回 0＝照舊的摩擦
function _lhSpBrakeOf(x, y, vx, vy, pct) {
    const AM = _lhSp.bhShape, K = _lhSp.bhK, v = Math.hypot(vx, vy);
    if (!AM || !K || v < 1e-3) return 0;
    let far = 0; for (let i = 0; i < AM.pts.length; i += 8) far = Math.max(far, Math.hypot(AM.pts[i][0] * K - x, AM.pts[i][1] * K - y));
    return v * v / (2 * Math.max(1, far * pct / 100));
}
const _lhSpBrakeW = (w, dt) => { const v = Math.hypot(w.fvx, w.fvy), dv = w.brk * dt; if (v <= dv) { w.fvx = w.fvy = 0; w.brk = 0; return true; } w.fvx *= (v - dv) / v; w.fvy *= (v - dv) / v; return false; };
const _lhSpU = () => _lhSp.bound / 1.25 * (1 + LH_SP_TUNE.bh.margin) / 100;   // 宇宙半徑的 1%
// 宇宙邊界外（還在畫面裡、要飛出畫面才能換邊）：不煞車、保底速度，沒速度就往家的方向
function _lhSpOutMin(w) {
    const vm = Math.max(4 * _lhSpU(), 150 / _lhSpZv()), v = Math.hypot(w.fvx, w.fvy);   // 至少每秒宇宙半徑 4%、畫面上 150px（才不會在畫面裡慢慢爬很久）
    if (v >= vm) return;
    const h = w.star ? { x: w.cl.hx, y: w.cl.hy } : _lhSpOrbit(w), hx = v > 1e-3 ? w.fvx : h.x - w.fx, hy = v > 1e-3 ? w.fvy : h.y - w.fy, l = Math.hypot(hx, hy) || 1;
    w.fvx = hx / l * vm; w.fvy = hy / l * vm;
}
// 0.98.41 Andy：被吞的詞——在離黑洞遠、空曠的地方重新浮現（淡入），行星自己飛回恆星；恆星整團搬過去，行星去找它
function _lhSpReborn(w, t, L) {
    const B = _lhSp.bh, H = _lhSp.bhW, AM = _lhSp.bhShape, K = _lhSp.bhK;
    if (!AM || !K || !H || !B) return;
    let best = null, bs = -1;
    for (let i = 0; i < 48; i++) {
        const a = Math.random() * Math.PI * 2, l = _lhSpAmoebaR(AM, a) * K * (0.2 + 0.65 * Math.sqrt(Math.random())), x = Math.cos(a) * l, y = Math.sin(a) * l;
        let dG = Infinity; for (const cl of _lhSp.groups || []) if (!(w.star && cl === w.cl)) dG = Math.min(dG, Math.hypot(x - cl.x, y - cl.y) - (cl.r || 0));
        const sc = Math.min(1, Math.hypot(x - B.x, y - B.y) / (H.R * 1.5)) * 2 + Math.min(1, Math.max(0, dG) / (K * 0.15));   // 先求離黑洞夠遠，再求空曠
        if (sc > bs) { bs = sc; best = { x, y }; }
    }
    _lhSpStBreak(w); w.stK = w.stL = 0;
    const clr = { bhF: false, bhE: {}, inBh: 0, brk: 0, brkP: 0, outB: false, trl: null, trOld: null, trRet: null, bhA: 0, shr: undefined, reT: t };
    if (w.star) {
        const cl = w.cl;
        for (const o of _lhSp.words) if (o.cl === cl && o !== w && !o.free && !o.pinned && o.px !== undefined) Object.assign(o, { free: true, fx: o.px, fy: o.py, fvx: 0, fvy: 0, src: 'A', smHome: false, odist: undefined, gk: 0 });   // 行星留在原地，自己飛去新家找恆星
        Object.assign(w, clr, { fx: best.x, fy: best.y, fvx: 0, fvy: 0 });
        _lhSpSettle(w, L, (_lhSpNow() - _lhSp.t0) / 1000);
        cl.held = false;
    } else Object.assign(w, clr, { free: true, fx: best.x, fy: best.y, fvx: 0, fvy: 0, src: 'A', smHome: false, odist: undefined, gk: 0 });
}
// ===== Andy 第 5 級：被黑洞吸的東西拉成「麵條」潮汐流（參考 GRO J1655-40、潮汐瓦解模擬圖）=====
// 源頭寬而散的霧 → 越靠近越收成一條發亮的細線 → 最後繞著黑洞捲進去；細沙粒沿著流越跑越快（看得出方向）；匯聚處發亮。
// 第 4 級以下：只有原本的平滑淡掉。每條流只是幾十段線＋幾十顆 1px 的沙（照參數算位置，不做物理），最多 14 條
// 麵條斷掉（被甩出去、太遠、換邊）：最後一次畫的形狀留下來變成一截殘煙，尾端沿著原路被吸進去（_lhSpBhStreams 畫）
function _lhSpStBreak(w) {
    if (w.stG && w.stK > 0.03) { const R = _lhSp.bhRem || (_lhSp.bhRem = []); if (R.length < 12) R.push({ ...w.stG, t0: 0 }); }
    w.stK = w.stL = 0; w.stG = null;
}
function _lhSpBhStreams(c, t, z) {
    const all = _lhSp.bhSrc || [], SC = all.filter(o => o.cl).sort((a, b) => b.k - a.k).slice(0, 6), S = all.filter(o => o.w).sort((a, b) => b.k - a.k).slice(0, 8);   // 星系光暈（大餐）最多 6 條；行星（點綴）最多 8 條
    const Q = _lhSp.bhScr;
    const Rm = _lhSp.bhRem || [];
    if (!Q || Q.g <= 0) { _lhSp.bhRem = []; return; }
    if (!S.length && !SC.length && !Rm.length && !(_lhSp.bhEat > 0.003)) return;
    const N = 40, K = 16, hash = j => { const v = Math.sin(j * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); }, r1 = Q.r * 0.85;
    const sg = _lhSp.bhSpin || (_lhSp.bhSpin = Math.random() < 0.5 ? -1 : 1);
    const dtE = Math.min(0.1, Math.max(0, (t - (_lhSp.bhEnT || t)) / 1000)); _lhSp.bhEnT = t;
    const gT = Math.max(0.3, (LH_SP_TUNE.bh.stGrow ?? 4) * 0.45), grow = o => (o.stL = Math.min(1, (o.stL || 0) + dtE / gT));   // Andy：麵條只有真的畫出來時才往黑洞伸（排隊沒畫到的不偷長，輪到它時才從源頭慢慢伸過去）
    for (const o of all) if (!SC.includes(o) && !S.includes(o)) { const x = o.cl || o.w; x.stL = 0; x.stG = null; }   // 排隊沒畫到的：不偷長，也不留舊形狀（Andy 抓到：散架時所有行星一起斷，本來看不見的也全變成殘煙同時冒出來＝瞬間大亮）
    c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round'; c.lineJoin = 'round';
    let sum = 0;
    // Andy（第三版）：不再一段段圓頭線疊（交界會疊亮成一顆顆光斑）——霧、輝光各是一整條「帶子」一次填滿，細繩一次描完；
    // 濃淡用「以黑洞為中心的放射漸層」給（離黑洞的距離＝沿著流走了多遠），所以整條連續、沒有接縫。亮度以源頭本身的亮度為上限
    // 一條麵條：G＝{th0, d0（畫面 px，相對黑洞）, V（形狀）, W0（源頭寬）, rgb}；只畫 uLo～uHi 那段（殘煙：uLo 往黑洞推進＝尾端被吸）
    const strand = (G, uLo, uHi, b, hz) => {
        const { th0, d0, V, W0, rgb } = G;
        const at = u => { const r = r1 + (d0 - r1) * Math.pow(1 - u, V.ex), th = th0 + sg * V.wind * Math.pow(u, V.pw) + V.bow * Math.sin(Math.PI * u) * (1 - u); return [Q.x + Math.cos(th) * r, Q.y + Math.sin(th) * r]; };   // 越後段繞越多＝捲進去
        const BW = LH_SP_TUNE.bh, wid = u => W0 * Math.pow(1 - u, G.big ? 1.15 : 1.6) + 0.7, uu = i => uLo + (uHi - uLo) * i / N;   // 0.98.41 Andy：恆星的氣流（big）中段收得慢＝整條比較粗
        const pts = []; for (let i = 0; i <= N; i++) pts.push(at(uu(i)));
        const ribbon = wf => {   // 照寬度函式 wf 圍出整條帶子（左邊一路過去、右邊一路回來）
            const L = [], R = [];
            for (let i = 0; i <= N; i++) {
                const a = pts[Math.max(0, i - 1)], bb = pts[Math.min(N, i + 1)], tx = bb[0] - a[0], ty = bb[1] - a[1], tl = Math.hypot(tx, ty) || 1, h = wf(uu(i)) / 2;
                L.push([pts[i][0] - ty / tl * h, pts[i][1] + tx / tl * h]); R.push([pts[i][0] + ty / tl * h, pts[i][1] - tx / tl * h]);
            }
            c.beginPath(); c.moveTo(L[0][0], L[0][1]); for (const q of L) c.lineTo(q[0], q[1]); for (let i = N; i >= 0; i--) c.lineTo(R[i][0], R[i][1]); c.closePath();
        };
        const rg = stops => { const g = c.createRadialGradient(Q.x, Q.y, r1, Q.x, Q.y, Math.max(r1 + 1, d0)); for (const [o, col] of stops) g.addColorStop(o, col); return g; };   // 0＝黑洞端、1＝源頭
        // 霧：源頭最濃，越靠近黑洞越淡（光被抽進細繩）
        // Andy：前段要是一片寬寬的霧（寬變窄、淡變濃、霧變線的過程要看得到）——霧的寬度不跟縮放縮成一條（最少 12px、照縮放開根號），濃度用 bh
        const bh = (G.bh ?? b);
        // Andy（第四版）：霧＝把「光暈」本身吸過來——沿著麵條一路蓋星星光暈那張柔光（中間亮、邊緣柔到沒有），越往黑洞越小、越淡＝光暈被拉長、擰細。
        // 舊版是實心帶子，邊緣是硬的（像一條色帶）。間距＝大小的 0.28，柔光彼此融成一片，看不出一顆一顆
        { const img = _lhSpGlowImg(rgb); let u = uLo, n = 0;
          while (u < uHi && n < 70) {
              const sz = wid(u) * (G.soft ? 2.4 : 1.7), P = at(u), a = bh * hz * (sz > 60 ? 0.28 : 0.2) * Math.pow(1 - u, 0.7) * Math.min(1, u / (G.soft ? 0.35 : G.big ? 0.08 : 0.22));   // 源頭淡入：霧是從光暈邊緣被撕下來的——源頭那端不能最濃（Andy 抓到：星系霧流的源頭疊在恆星身上＝恆星光暈被吸乾後又「大亮」）；行星點綴更柔
              if (a > 0.003) { c.globalAlpha = Math.min(1, a); c.drawImage(img, P[0] - sz / 2, P[1] - sz / 2, sz, sz);
                  if (G.big) { const s2 = sz * (1 + 1.2 * BW.stSoft); c.globalAlpha = Math.min(1, a * 0.3); c.drawImage(img, P[0] - s2 / 2, P[1] - s2 / 2, s2, s2); } }   // 恆星：外面再一圈更大更淡的柔光＝有體積、邊緣柔到看不見
              const P2 = at(Math.min(1, u + 0.01)), dl = Math.hypot(P2[0] - P[0], P2[1] - P[1]) / 0.01 || 1;
              u += Math.max(0.003, (sz > 60 ? 0.42 : 0.28) * sz / dl); n++;   // 大張的柔光間距放寬（夠柔，看不出接縫；省效能）
          } c.globalAlpha = 1; }
        // 輝光：越擰越亮（窄窄一條，貼著細繩）
        // 恆星（big）：三層由窄到寬、由亮到淡疊起來＝橫切面是柔的（不是一條硬邊色帶）；行星照舊一層
        for (const [wm, am] of G.big ? [[1, 0.7], [1 + 1.5 * BW.stSoft, 0.32], [1 + 4 * BW.stSoft, 0.14]] : [[1, 1]]) {
            ribbon(u => (2 + 6 * Math.pow(u, 1.2)) * wm * (G.big ? 1 + 0.6 * (1 - u) : 1)); c.fillStyle = rg([[0, 'rgba(255,240,225,' + (0.22 * b * am).toFixed(3) + ')'], [0.3, _lhSpRGBA(rgb, 0.14 * b * am)], [1, _lhSpRGBA(rgb, 0)]]); c.fill();
        }
        // 細繩：一次描完，越靠近黑洞越亮、最後一段轉白熱
        c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (const q of pts) c.lineTo(q[0], q[1]);
        c.lineWidth = 1.2; c.strokeStyle = rg([[0, 'rgba(255,246,232,' + (0.6 * b).toFixed(3) + ')'], [0.25, _lhSpRGBA(rgb, 0.45 * b)], [G.soft ? 0.6 : 1, _lhSpRGBA(rgb, (G.soft ? 0.05 : 0.06) * b)], ...(G.soft ? [[1, _lhSpRGBA(rgb, 0)]] : [])]); c.stroke();
        {   // 細纖維（散在寬度裡、越靠黑洞越收攏）＝有紋理的星塵，不是一根粗繩。0.98.41：行星 bh.dFib 根，恆星再 × bh.dStarFib
            const nf = Math.round(BW.dFib * (G.big ? BW.dStarFib : 1));
            for (let f = 0; f < nf; f++) {
                const sd = (hash(f * 7 + 1) - 0.5) * 0.9, ph = hash(f * 3 + 2) * 6.28;
                c.beginPath();
                for (let i = 0; i <= N; i++) {
                    const u = uu(i), a = pts[Math.max(0, i - 1)], bb = pts[Math.min(N, i + 1)], tx = bb[0] - a[0], ty = bb[1] - a[1], tl = Math.hypot(tx, ty) || 1;
                    const off = wid(u) * sd * (1 + 0.25 * Math.sin(u * 9 + ph + t / 900)), x = pts[i][0] - ty / tl * off, y = pts[i][1] + tx / tl * off;
                    i ? c.lineTo(x, y) : c.moveTo(x, y);
                }
                c.lineWidth = G.big ? 0.7 : 0.5; c.strokeStyle = rg([[0, 'rgba(255,246,232,' + (0.25 * b).toFixed(3) + ')'], [0.4, _lhSpRGBA(rgb, 0.16 * b)], [1, _lhSpRGBA(rgb, 0)]]); c.stroke();
            }
        }
        // 流動：一顆顆亮點沿著流跑、越近越快、被拉成越長的光線；一開始散在整條寬度、最後收成一線
        for (let j = 0, KK = G.big ? K * 2 : K; j < KK; j++) {   // 恆星：亮點多一倍，散在整條寬度裡
            const f = (hash(j) + t / 1000 * (0.22 + 0.18 * hash(j + 9))) % 1, u = uLo + (0.5 + 0.5 * Math.pow(f, 1.8)) * (uHi - uLo), u0 = Math.max(uLo, u - 0.005 - 0.022 * u * u);   // Andy：從麵條中段才開始、短很多
            const A = at(u), B = at(u0), tx = A[0] - B[0], ty = A[1] - B[1], tl = Math.hypot(tx, ty) || 1, off = (hash(j + 3) - 0.5) * wid(u) * 0.85;
            const ox = -ty / tl * off, oy = tx / tl * off;
            c.strokeStyle = u > 0.6 ? 'rgba(255,246,232,1)' : rgb; c.globalAlpha = Math.min(1, b * 0.4 * (0.2 + 0.6 * u) * (0.6 + 0.5 * hash(j + 5)) * Math.min(1, f * 6)); c.lineWidth = 0.8 + 0.6 * u;   // 淡很多、細一點
            c.beginPath(); c.moveTo(B[0] + ox, B[1] + oy); c.lineTo(A[0] + ox, A[1] + oy); c.stroke();
        }
        c.globalAlpha = 1;
    };
    for (const { cl, k } of SC) {   // 恆星的星塵（主角）：從光暈面向黑洞那側被撕下來，一路擰細捲進去
        // 0.98.41 Andy：起點離恆星中心 bh.dOff 個光暈半徑、寬 bh.dW 個光暈半徑；亮度看光暈跨進「光暈開始被吸」那圈多少（兩圓重疊的弦長）× bh.dStarB
        const c0 = _lhSpScr(cl.x, cl.y), hr = Math.max(4, (cl.r || 40) * LH_SP_TUNE.glow.starSize * z), dC = Math.hypot(c0.x - Q.x, c0.y - Q.y) || 1, A = Q.a;
        const xx = (dC * dC + A * A - hr * hr) / (2 * dC), chord = dC <= Math.abs(A - hr) ? 2 * Math.min(A, hr) : dC >= A + hr ? 0 : 2 * Math.sqrt(Math.max(0, A * A - xx * xx)), ov = Math.min(1, chord / (2 * hr));
        const dS = Math.max(Q.r * 1.6, dC - hr * LH_SP_TUNE.bh.dOff), px = Q.x + (c0.x - Q.x) / dC * dS, py = Q.y + (c0.y - Q.y) / dC * dS, dx = px - Q.x, dy = py - Q.y, d0 = Math.hypot(dx, dy);
        if (d0 < Q.r * 1.5 || chord < 2) { cl.stG = null; continue; }   // 太近不畫，也不留舊的（亮的）形狀當殘煙
        const nearK = Math.min(1, (d0 - Q.r * 1.5) / (Q.r * 5));   // 恆星已經很靠近：星塵很短、全疊在黑洞口＝爆亮——越近越淡
        const rgb = cl.stRgb || (cl.stRgb = (_lhSp.words.find(o => o.star && o.cl === cl) || {}).rgb || '#cfe0ff');
        const V = cl.stV || (cl.stV = { wind: 1.2 + Math.random() * 1.6, ex: 1.3 + Math.random() * 0.6, pw: 1.8 + Math.random() * 1.0, bow: (Math.random() - 0.5) * 0.6 });
        const SB = LH_SP_TUNE.bh.dStarB, b = Math.pow(k, 1.5) * (0.35 + 0.65 * ov) * nearK * SB, G = { big: true, th0: Math.atan2(dy, dx), d0, V, W0: hr * LH_SP_TUNE.bh.dW * (0.6 + 0.4 * k), rgb, bh: Math.pow(k, 1.1) * 1.3 * (0.3 + 0.7 * ov) * nearK * SB }, uM = Math.max(0.02, grow(cl));
        cl.stG = { ...G, b, uM };
        strand(G, 0, uM, b, 1);
        sum += b * 2;
    }
    for (const { w, k } of S) {
        const p = _lhSpWS(w), dx = p.x - Q.x, dy = p.y - Q.y, d0 = Math.hypot(dx, dy);
        if (d0 < Q.r * 1.2 || d0 > Q.R * 1.3 || k <= 0.01) continue;   // 太遠（剛換邊瞬移）：這一格就不畫
        const sz = Math.max(0.1, Math.min(0.35, ((w.s || 1) - 0.6) / 3));   // Andy：行星只是點綴（恆星的大餐在上面那段）——亮度看大小，最多 0.35
        const a0 = Math.max(0.15, Math.min(1, w.alpha ?? 1)), b = a0 * Math.pow(k, 1.5) * sz, bh = a0 * Math.pow(k, 1.1) * (0.45 + 0.55 * sz);   // b：細繩（剛開始幾乎透明、慢慢扎實）；bh：霧（前段就看得到，小行星也有一片淡霧）   // 能量來源：這顆星本身多亮 × 多大 × 被吸了多少
        // Andy：每條長得不一樣（繞多少、彎的弧度、中段往旁邊鼓），但大家照黑洞同一個旋轉方向捲進去＝越近越匯聚成同一個漩渦
        const V = w.stV || (w.stV = { wind: 1.4 + Math.random() * 2.4, ex: 1.15 + Math.random() * 0.9, pw: 1.6 + Math.random() * 1.4, bow: (Math.random() - 0.5) * 0.9 });
        const G = { th0: Math.atan2(dy, dx), d0, V, W0: Math.max(12, 18 * (w.s || 1) * Math.sqrt(z)) * LH_SP_TUNE.bh.dW * (0.6 + 0.4 * k), rgb: w.rgb, bh, soft: 1 }, uM = Math.max(0.02, grow(w));
        w.stG = { ...G, b, uM };   // 斷掉時留下來當殘煙
        strand(G, 0, uM, b, 1);
        sum += b;
    }
    // 殘煙：斷掉的那截，尾端沿著原路越來越快被吸進去（約 1.3 秒吸光），越短越稀疏
    for (let i = Rm.length - 1; i >= 0; i--) {
        const r = Rm[i]; if (!r.t0) r.t0 = t;
        const f = (t - r.t0) / 1300;
        if (f >= 1) { Rm.splice(i, 1); continue; }
        const uLo = r.uM * Math.pow(f, 1.4);
        if (r.uM - uLo > 0.01) strand({ ...r, bh: (r.bh ?? r.b) * Math.pow(1 - f, 0.8) }, uLo, r.uM, r.b * Math.pow(1 - f, 0.8), 0.6);
        sum += r.b * (1 - f) * 0.5;
    }
    // 0.98.41 Andy［吸食］：有東西在吸＝膨脹（每秒膨脹自己 bh.eSpd%），沒有＝用同樣的速度消散。e 0→1：黑洞外觀 ×eMaxB^e、光圈 ×eMaxR^e（引力範圍不變）
    const TB = LH_SP_TUNE.bh, mx = Math.max(1.01, TB.eMaxB, TB.eMaxR), rate = Math.log(1 + Math.max(0.01, TB.eSpd) / 100) / Math.log(mx);
    _lhSp.bhEat = Math.max(0, Math.min(1, (_lhSp.bhEat || 0) + (sum > 0.02 ? 1 : -1) * rate * dtE));
    const e = _lhSp.bhEat;
    if (e > 0.003) {
        const Rv = Q.vr || Q.r, ri = Rv * (1 - Math.min(0.95, TB.eOver / 100)), ro = Math.max(ri + 1, Rv * Math.pow(Math.max(1, TB.eMaxR), e)), Rg = ro * Math.max(1, TB.eGlow);
        const g2 = c.createRadialGradient(Q.x, Q.y, ri, Q.x, Q.y, Rg);   // 光暈：光圈外面一大片柔光
        g2.addColorStop(0, 'rgba(255,225,190,' + Math.min(1, 0.22 * e * TB.eGlowB).toFixed(3) + ')'); g2.addColorStop(0.45, 'rgba(255,200,160,' + Math.min(1, 0.07 * e * TB.eGlowB).toFixed(3) + ')'); g2.addColorStop(1, 'rgba(255,190,150,0)');
        c.globalAlpha = 1; c.fillStyle = g2; c.fillRect(Q.x - Rg, Q.y - Rg, Rg * 2, Rg * 2);
        const g = c.createRadialGradient(Q.x, Q.y, ri, Q.x, Q.y, ro);   // 光圈：內緣（藏在黑洞後面 eOver%）最亮，往外淡掉
        g.addColorStop(0, 'rgba(255,246,232,' + Math.min(1, 0.85 * e).toFixed(3) + ')'); g.addColorStop(0.4, 'rgba(255,220,180,' + Math.min(1, 0.4 * e).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,200,160,0)');
        c.beginPath(); c.arc(Q.x, Q.y, ro, 0, Math.PI * 2); c.arc(Q.x, Q.y, ri, 0, Math.PI * 2, true); c.fillStyle = g; c.fill();
    }
    c.restore();
    _lhSp.dirty = true;
}
const _lhSpAmoebaR = (A, th) => 1 + A.H.reduce((v, [n, a, ph]) => v + a * Math.sin(n * th + ph), 0);   // 單位形狀在角度 th 的半徑（乘 A.k、再乘 Hs 才是宇宙座標）
// Andy：開發者黑洞——平常沿著「宇宙畫布」（±bound 的方形）邊緣內側繞（宇宙座標：跟著平移、縮放走）；可以用滑鼠拖、甩（不留殘影），
// 停下來之後自己慢慢飄回最近的邊接著繞。引力：行星、流星、恆星靠近都會被吸、越近越快，但核心進不去——最後一定驚險地被甩出去；
// 恆星被甩＝跟滑鼠拖恆星一樣整團散架、之後慢慢聚回來。參數在齒輪「黑洞」（LH_SP_TUNE.bh）。每格由 _lhSpFrame 呼叫
// 狀態 _lhSp.bh（宇宙座標）：mode edge（繞邊）／drag（手拖）／free（甩出去在滑）／back（飄回邊）
function _lhSpBhDrift(t) {
    const b = _lhSp.el && _lhSp.el.querySelector('.ws-bh');
    if (!b || _lhSp.el.classList.contains('ws-in-void')) return;
    // Andy：黑洞等混沌凝聚完成才開始成形——從一個點慢慢長大，bh.form 秒長到設定大小；核心、引力範圍都跟著大小一起長
    const T = LH_SP_TUNE.bh, z = _lhSpZv(), B0 = _lhSp.bh;
    if (B0 && !B0.born && (!_lhSpCfg().gather || (_lhSp.words.length && !(_lhSp.queue || []).length && !_lhSp.words.some(w => (w.gk || w.gHold) && w.cl && !w.cl.gDoneT)))) B0.born = t;   // 凝聚完成＝開始成形
    if (B0 && _lhSp.bhSkip) { B0.born = t - T.form * 1000 - 1; _lhSp.bhSkip = false; }   // 本地快轉鈕：直接長好
    const gu = B0 && B0.born ? Math.min(1, (t - B0.born) / Math.max(1, T.form * 1000)) : 0, grow = gu * gu * (3 - 2 * gu);
    b.style.visibility = grow > 0.002 ? '' : 'hidden';
    const Hs = _lhSp.bound / 1.25 * (1 + T.margin), U = Hs / 100;   // 宇宙半徑、它的 1%（移動速度的單位）
    const r = Math.max(0.5, T.size / 2 / _lhSpZ100() * grow);   // 0.98.41 Andy：外觀＝縮放 100%（剛進宇宙對好的縮放）時直徑 bh.size px——每個宇宙一進來黑洞看起來一樣大
    const mB = Math.pow(Math.max(1, T.eMaxB), _lhSp.bhEat || 0), rS = Math.max(0.5, r * z * mB), px2 = (rS * 2).toFixed(1) + 'px';   // 吸食膨脹：只有外觀變大，引力範圍不變
    if (b.style.width !== px2) b.style.width = b.style.height = px2;
    { const tp = Math.min(90, Math.max(0.05, T.ring / rS * 100)).toFixed(2); if (b.style.getPropertyValue('--bh-t') !== tp) b.style.setProperty('--bh-t', tp); }   // 光環粗細固定畫面 px
    // Andy 彩蛋：宇宙邊界是一塊變形蟲（每次進宇宙隨機一個），面積是方形的 1～1.5 倍。形狀見 _lhSpAmoeba
    const AM = _lhSp.bhShape || (_lhSp.bhShape = _lhSpAmoeba()), K = Hs * AM.k, per = AM.len * K;
    _lhSp.bhK = K;
    const B = _lhSp.bh || (_lhSp.bh = { mode: 'edge', s: Math.random() * per, x: 0, y: 0, vx: 0, vy: 0 });   // 起點：宇宙邊緣隨機一處
    const dt = B.t ? Math.min(0.1, (t - B.t) / 1000) : 0; B.t = t;
    const edgeAt = sv => {   // 沿邊走到弧長 sv 的那一點（等速）
        const u = (((sv / K) % AM.len) + AM.len) % AM.len, C = AM.cum;
        let lo = 0, hi = C.length - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (C[mid] <= u) lo = mid; else hi = mid; }
        const f = (u - C[lo]) / Math.max(1e-9, C[hi] - C[lo]), P0 = AM.pts[lo], P1 = AM.pts[hi % AM.pts.length];
        return { x: (P0[0] + (P1[0] - P0[0]) * f) * K, y: (P0[1] + (P1[1] - P0[1]) * f) * K }; };
    const px = B.x, py = B.y;
    if (B.mode === 'edge') {
        if (!(_lhSp.drag && _lhSp.drag.moved)) B.s = (B.s + dt * T.speed * U) % per;   // 拖詞的時候停下來等你丟
        const p = edgeAt(B.s);
        if (B.ease) { const f = Math.min(1, (t - B.ease.t) / 1500), e = f * f * (3 - 2 * f); B.x = B.ease.x + (p.x - B.ease.x) * e; B.y = B.ease.y + (p.y - B.ease.y) * e; if (f >= 1) B.ease = null; }   // 剛回到邊：1.5 秒順順接上
        else { B.x = p.x; B.y = p.y; }
    } else if (B.mode === 'free') {   // 甩出去：直線等減速（甩動煞車，跟星星共用），可以飛出宇宙邊界；停下後照「飄回邊緣的速度」回到邊上（不瞬移）
        B.x += B.vx * dt; B.y += B.vy * dt;
        if (B.brk === undefined) B.brk = _lhSpBrakeOf(B.x, B.y, B.vx, B.vy, T.brake);
        const v = Math.hypot(B.vx, B.vy), dv = B.brk * dt;
        if (v <= dv || v < 1e-3) { B.vx = B.vy = 0; B.brk = undefined; B.mode = 'back'; } else { B.vx *= (v - dv) / v; B.vy *= (v - dv) / v; }
    } else if (B.mode === 'back') {   // 飄回最近的邊：等速，目標固定在邊上最近那點，到了接著繞
        if (B.bs === undefined) { let best = 0, bd = Infinity; for (let i = 0; i < AM.pts.length; i += 2) { const d = Math.hypot(AM.pts[i][0] * K - B.x, AM.pts[i][1] * K - B.y); if (d < bd) { bd = d; best = AM.cum[i] * K; } } B.bs = best; }
        const p = edgeAt(B.bs), dx = p.x - B.x, dy = p.y - B.y, d = Math.hypot(dx, dy), v = Math.min(d, Math.max(0.01, T.back) * U * dt);
        if (d < 1.5 / z) { B.mode = 'edge'; B.s = B.bs; B.bs = undefined; B.ease = { x: B.x, y: B.y, t }; } else { B.x += dx / d * v; B.y += dy / d * v; }
    }
    if (dt) { B.sx = (B.x - px) / dt; B.sy = (B.y - py) / dt; }
    const sp = _lhSpScr(B.x, B.y);
    b.style.left = (sp.x - rS) + 'px'; b.style.top = (sp.y - rS) + 'px';
    // 0.98.41 Andy（每個宇宙的黑洞要一樣兇）：範圍、引力全部用宇宙半徑的 %（U）；黑洞外觀和核心照恆星大小。成形中跟著 grow 一起長
    const Rc = r * T.core, RG = T.range * U * grow, RA = T.absorb * U * grow, RS = T.scatR * U * grow, RL = T.lensR * U * grow;
    _lhSp.bhW = grow > 0.01 ? { x: B.x, y: B.y, r: Rc, R: RG, u: U, L: RL } : null;   // 還沒成形：沒有引力
    if (!dt || !_lhSp.bhW) { _lhSp.bhScr = null; return; }
    _lhSp.bhScr = { x: sp.x, y: sp.y, r: Rc * z, R: RG * z, a: RA * z, s: RS * z, l: RL * z, g: grow, vr: rS };   // 畫面座標（vr：吸食膨脹後看到的黑洞半徑）
    _lhSp.bhLens = { ...T.lens, r: RL * z };
    { const er2 = _lhSp.el.getBoundingClientRect(); window.__lhBgSink = { x: er2.left + sp.x, y: er2.top + sp.y, r: Rc * z, R: RG * z, t: performance.now() }; }   // 背景飄字（js/bgfx.js）也會被吸進來
    const drag = _lhSp.drag && _lhSp.drag.w, L = _lhSpCfg(), VW = _lhSp.el.clientWidth, VH = _lhSp.el.clientHeight;
    const onScr = (x, y) => { const q = _lhSpScr(x, y); return q.x > -60 && q.x < VW + 60 && q.y > -60 && q.y < VH + 60; };
    _lhSp.bhSrc = [];
    // 星系光暈的大餐：光暈邊緣一碰到「光暈開始被吸」那圈，就從面向黑洞那側拉出星塵；恆星散架＝這頓吃完了，只收不再亮
    if (L.sand) for (const cl of _lhSp.groups || []) {
        if (cl.held && !cl.stK) continue;
        const de = Math.hypot(B.x - cl.x, B.y - cl.y) - (cl.r || 0) * LH_SP_TUNE.glow.starSize, tk = cl.held ? 0 : de < RA ? Math.sqrt(Math.min(1, (RA - Math.max(de, Rc)) / Math.max(1e-6, RA - Rc))) : 0;
        if (tk > 0 || cl.stK) {
            cl.stK = (cl.stK || 0) + (tk - (cl.stK || 0)) * Math.min(1, dt * (tk < (cl.stK || 0) ? 2.5 : 3 / Math.max(0.3, T.stGrow ?? 4)));
            if (tk === 0 && cl.stK < 0.2) _lhSpStBreak(cl); else if (cl.stK > 0.01) _lhSp.bhSrc.push({ cl, k: cl.stK }); else cl.stK = cl.stL = 0;
        }
    }
    for (const w of _lhSp.words) {
        if (w.bhA !== undefined) { w.bhA = Math.min(1, w.bhA + dt / Math.max(0.1, LH_SP_TUNE.gather.litGlowDur || 8)); if (w.bhA >= 1) w.bhA = undefined; }   // 離開後光暈照「光暈亮滿」秒數慢慢重建
        if (w.shr !== undefined && !w.inBh) { w.shr = Math.min(1, w.shr + dt / 20); if (w.shr >= 1) w.shr = undefined; }   // 被吸縮水的恆星：離開後約 20 秒長回來
        if (w.comet || w.off || !w.born || w.pinned || w === drag || w.px === undefined) { w.inBh = 0; w.lwx = undefined; continue; }
        const wx = w.free ? w.fx : w.px, wy = w.free ? w.fy : w.py, d = Math.hypot(B.x - wx, B.y - wy);
        const pvx = w.lwx !== undefined ? (wx - w.lwx) / dt : 0, pvy = w.lwy !== undefined ? (wy - w.lwy) / dt : 0; w.lwx = wx; w.lwy = wy;   // 在軌道上公轉的速度（被吸進範圍時帶著走＝有角動量，不會直直掉進去）
        if (L.sand && !w.star) {   // 行星的星塵（點綴）：越深入越濃
            const kd = d < RA ? Math.sqrt(Math.min(1, (RA - Math.max(d, Rc)) / Math.max(1e-6, RA - Rc))) : 0;
            if (d > RG * 1.2 && w.stK) _lhSpStBreak(w);   // 離黑洞太遠（換邊瞬移）＝星塵斷掉，留下的那截被吸完
            if (kd > 0 || w.stK) { w.stK = (w.stK || 0) + (kd - (w.stK || 0)) * Math.min(1, dt * (kd < (w.stK || 0) ? 2.5 : 3 / Math.max(0.3, T.stGrow ?? 4))); if (kd === 0 && w.stK < 0.2) _lhSpStBreak(w); else if (w.stK > 0.01) _lhSp.bhSrc.push({ w, k: w.stK }); else w.stK = w.stL = 0; }
        }
        if (d < RA) {
            w.bhA = Math.min(w.bhA ?? 1, Math.max(0, Math.min(1, (d - Rc) / Math.max(1e-6, RA - Rc))) ** 2);   // 越近，光暈／熱浪越被吸掉
            if (w.star) w.shr = Math.max(0.25, (w.shr ?? 1) - T.eStar * Math.pow(Math.max(0, 1 - d / RG), T.gb) * dt);   // 吸食速度：照這裡的引力（相對中心）縮水
        }
        // 宇宙邊界：飛出去的從遠方換邊回來。消失點還在畫面裡＝繼續飛到畫面外才換；出現點在畫面裡＝從那個方向更遠的畫面外飛進來
        if (w.free && !w.inBh) {
            const dd = Math.hypot(w.fx, w.fy) || 1, ang = Math.atan2(w.fy, w.fx), lim = _lhSpAmoebaR(AM, ang) * K;
            w.outB = dd > lim;
            if (w.outB && !onScr(w.fx, w.fy)) {
                const ho = w.star ? { x: w.cl.hx, y: w.cl.hy } : _lhSpOrbit(w), ha = Math.atan2(ho.y, ho.x);
                let a2 = ha, bestD = -1;   // 從「家的方向」開始往兩邊找，第一個離黑洞超過 1.5 個引力範圍的邊；都不夠遠就挑最遠的
                for (const off of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6, 2.2, -2.2, Math.PI]) {
                    const a = ha + off, l = _lhSpAmoebaR(AM, a) * K, dB = Math.hypot(Math.cos(a) * l - B.x, Math.sin(a) * l - B.y);
                    if (dB > RG * 1.5) { a2 = a; break; } if (dB > bestD) { bestD = dB; a2 = a; }
                }
                let ex = Math.cos(a2) * _lhSpAmoebaR(AM, a2) * K * 1.02, ey = Math.sin(a2) * _lhSpAmoebaR(AM, a2) * K * 1.02;
                for (let i = 0; i < 40 && onScr(ex, ey); i++) { ex *= 1.06; ey *= 1.06; }
                w.fx = ex; w.fy = ey; w.trl = w.trOld = w.trRet = null; _lhSpStBreak(w);
                const h = w.star ? { x: w.cl.hx, y: w.cl.hy } : _lhSpOrbit(w), hx = h.x - w.fx, hy = h.y - w.fy, hl = Math.hypot(hx, hy) || 1, v = Math.max(Math.hypot(w.fvx, w.fvy), 2 * U);
                w.fvx = hx / hl * v; w.fvy = hy / hl * v;   // 往自己的家飛回來
                if (w.brkP) w.brk = _lhSpBrakeOf(w.fx, w.fy, w.fvx, w.fvy, w.brkP);
                if (w.star) { w.cl.x = w.fx; w.cl.y = w.fy; }
            }
        }
        if (d > RG) {   // 範圍外。剛離開範圍：逃逸（進過魚眼、速度到上限 8 成）套反阻尼，其他（路過）套甩動煞車
            if (w.inBh) { w.inBh = 0; w.brkP = w.bhE && w.bhE.fast ? T.anti : T.brake; w.brk = _lhSpBrakeOf(w.fx, w.fy, w.fvx, w.fvy, w.brkP); w.bhE = {}; }
            continue;
        }
        // 範圍內：只有引力（煞車、行星彈簧都停），進來那一刻的速度保留
        if (!w.free) {
            Object.assign(w, { free: true, fx: wx, fy: wy, fvx: pvx, fvy: pvy });
            if (w.star) { w.src = 'B'; w.cl.bhS = w; } else Object.assign(w, { src: 'A', smHome: false, odist: undefined, gk: 0 });
        }
        if (w.star && !w.cl.held && d <= RS && !(w.bhT && t - w.bhT < 1500)) { w.bhT = t; _lhSpScatter(w, L); }   // 恆星散架
        w.inBh = 1; w.brk = 0; w.outB = false; w.bhF = true; w.bhIn = t;
        const o = { x: w.fx, y: w.fy, vx: w.fvx, vy: w.fvy, e: (w.bhE ??= {}) };
        const st = _lhSpBhG(o, _lhSp.bhW, T, dt);
        w.fvx = o.vx; w.fvy = o.vy;
        if (st === 2) { _lhSpReborn(w, t, L); w.lwx = undefined; }   // 掉進核心＝被吞，到遠方重生
        _lhSp.dirty = true;
    }
}
// ===== Andy：使用者的「放逐虛空」——丟進黑洞的詞只從自己的詞庫淘汰（這個瀏覽器、全部專案共用，lh:voidWords），
// 同時匿名回報一次「極度冷僻」給後台（同一個詞只送一次）。詞庫載入時 js/wordlist.js 會套用這份名單 =====
const LH_VOID_KEY = 'lh:voidWords', LH_VOID_SENT = 'lh:voidSent';
const lhVoidList = () => lhGetJSON(LH_VOID_KEY, [], v => Array.isArray(v)).filter(x => x && typeof x.w === 'string');
function _lhVoidSave(list) { lhSet(LH_VOID_KEY, JSON.stringify(list)); _lhVoidCount(); }
function _lhVoidCount() { const el = document.getElementById('voidCount'); if (el) el.textContent = '已放逐 ' + lhVoidList().length + ' 個詞'; }
function _lhVoidUserDel(w) {
    const list = lhVoidList();
    if (!list.some(x => x.w === w.w)) { list.push({ w: w.w, z: w.e && w.e.z, p: w.e && w.e.p }); _lhVoidSave(list); }
    if (Array.isArray(wordlistData)) wordlistData = wordlistData.filter(e => e.w !== w.w);   // 詞卡、搜尋、宇宙馬上就看不到
    const sent = lhGetJSON(LH_VOID_SENT, [], v => Array.isArray(v));
    if (!sent.includes(w.w) && typeof postFeedbackRaw === 'function') {
        postFeedbackRaw({ type: 'word-report', word: w.w, reportType: '極度冷僻', note: '黑洞' }).then(r => { if (r.ok) { const s2 = lhGetJSON(LH_VOID_SENT, [], v => Array.isArray(v)); if (!s2.includes(w.w)) { s2.push(w.w); lhSet(LH_VOID_SENT, JSON.stringify(s2)); } } });
    }
    if (!lhGet('lh:voidHinted')) { lhSet('lh:voidHinted', '1'); showToast('已將冷僻詞放逐虛空 ^_^'); }   // 只有第一次提示，沒有按鈕
}
function _lhVoidUserRestore(words) {   // 救回（白洞／偏好設定的還原詞庫）：放回自己的詞庫
    const set = new Set(words), list = lhVoidList(), back = list.filter(x => set.has(x.w));
    _lhVoidSave(list.filter(x => !set.has(x.w)));
    if (Array.isArray(wordlistData)) { const have = new Set(wordlistData.map(e => e.w)); for (const x of back) if (x.z && !have.has(x.w)) wordlistData.push({ w: x.w, z: x.z, p: x.p ?? 1 }); }
    for (const w of words) _lhWs.hidden.delete(w);
}
function _lhSpBhEat(w) {
    _lhSpDropWord(w);
    const b = _lhSp.el.querySelector('.ws-bh');
    b.classList.remove('gulp'); void b.offsetWidth; b.classList.add('gulp');   // 吞下去：縮一下再脹回來
    if (LH_SP_DEV) _lhSpVoidPost('del', w.w).catch(err => lhWarn('黑洞刪詞失敗（本地伺服器有開嗎？）', err));   // 開發者：改官方刪除名單
    else _lhVoidUserDel(w);
}
// 偏好設定 → 查詢與詞庫 → 黑洞：只顯示放逐了幾個詞＋實心紅色「還原詞庫」
function _lhVoidPrefs() {
    _lhVoidCount();
    document.getElementById('voidRestoreAll')?.addEventListener('click', async () => {
        const n = lhVoidList().length;
        if (!n) { showToast('虛空裡沒有詞'); return; }
        const ok = await lhAsk({ title: '把放逐的 ' + n + ' 個詞全部救回詞庫？', body: '它們會重新出現在詞卡、搜尋和宇宙裡', buttons: [{ label: '還原詞庫', value: true, kind: 'danger' }, { label: '取消', value: null }] });
        if (!ok) return;
        _lhVoidUserRestore(lhVoidList().map(x => x.w));
        showToast('詞庫已還原');
    });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _lhVoidPrefs); else _lhVoidPrefs();   // js 在 <head> 載入：等頁面好了再接按鈕
// 進出虛無：照樣播星際穿越，穿越到一半換畫面
function _lhSpVoid(on) {
    const vd = _lhSp.el.querySelector('.ws-void');
    if (!vd || vd.hidden === !on || _lhSp.warp || vd.classList.contains('ws-out')) return;
    if (!on) {   // Andy：回來不用星際穿越（虛無裡什麼都沒有）——白洞放大到整個畫面變白，再淡掉露出宇宙
        const wh = vd.querySelector('.ws-wh'), done = () => {
            cancelAnimationFrame(_lhSp.vRaf); vd.querySelectorAll('.ws-vw').forEach(x => x.remove()); if (_lhSp.vAC) _lhSp.vAC.abort();
            vd.hidden = true; vd.classList.remove('ws-out'); vd.style.opacity = ''; wh.getAnimations().forEach(a => a.cancel()); vd.getAnimations().forEach(a => a.cancel());
        };
        vd.classList.add('ws-out');
        if (_lhSpReduce.matches) { _lhSp.el.classList.remove('ws-in-void'); done(); return; }
        // Andy：總長 1.6 秒，放大照「倍率的次方」排關鍵格（前面慢、越放越快，最後衝出出口）；快出去的最後兩成多（F0 之後），白光轉成宇宙底色、虛空淡掉，宇宙和背景飄字從出口透出來
        // Andy（第二版）：白洞更小、加速更誇張（u⁴：前段幾乎不動、最後猛衝）、提早轉黑（u 0.3 起由白轉黑，F0 前已經全黑＝出口那頭是宇宙）
        // Andy（第三版）：總長 3.2 秒——前 6 成「努力走卻看不到盡頭」只放大到 1.6 倍左右，之後短短一秒內越衝越快蓋滿畫面
        // Andy（第四版）：前段照舊（2.82 秒衝到蓋滿），但不再轉黑——一路白到全螢幕，白光只閃 0.5 秒（先快後慢淡掉），我們已經回到宇宙
        // Andy（第五版）：最後加速更猛（五次方）——從約 1/4 螢幕面積開始，到蓋滿、白光淡掉回到宇宙，0.5 秒內走完（衝刺約 0.18 秒＋白光 0.3 秒）
        const WT = LH_SP_TUNE.wh, C = Math.hypot(vd.clientWidth, vd.clientHeight) / Math.max(1, wh.offsetWidth) * 1.15, DUR = 3120, N = 96, F0 = 2820 / 3120, U1 = Math.min(F0 - 0.02, WT.u1), PRE = Math.min(C, WT.pre);   // 0.98.41 Andy：衝刺更晚、白洞更大才衝、曲線往直線拉（wh.*）   // C：到 F0 剛好蓋滿整個畫面的倍率
        // 0.98.41 Andy：前段改成 x^q 起步（一瞬間凝滯再動）——q 讓「放大到 2.5 倍」剛好花 t25 秒；前段放不到 2.5 倍就維持直線
        const x25 = (WT.t25 ?? 1) * 1000 / DUR / U1, Q = PRE > 2.5 && x25 > 0 && x25 < 1 ? Math.min(6, Math.max(0.3, Math.log(1.5 / (PRE - 1)) / Math.log(x25))) : 1;
        const grow = u => 1 + (PRE - 1) * Math.pow(Math.min(u, U1) / U1, Q) + (u > U1 ? (C - PRE) * Math.pow(Math.min(1, (u - U1) / (F0 - U1)), WT.pow) : 0);
        wh.animate(Array.from({ length: N + 1 }, (_, i) => { const u = i / N, sc = grow(u), w2 = Math.max(0, (u - F0) / (1 - F0));
            return { offset: u, transform: 'scale(' + sc.toFixed(3) + ')', opacity: (1 - (1 - (1 - w2) ** 2.2)).toFixed(3) }; }), { duration: DUR, easing: 'linear', fill: 'forwards' });   // 淡掉用 (1−w)^2.2：一閃之後很快退、尾巴柔
        setTimeout(() => {
            _lhSp.el.classList.remove('ws-in-void');   // 宇宙和介面先回到底下
            vd.querySelectorAll('.ws-vw').forEach(x => x.remove());
            vd.animate([{ background: '#000' }, { background: 'rgba(0,0,0,0)' }], { duration: 60, fill: 'forwards' });   // 白光蓋滿時，底下已經換成宇宙
            setTimeout(done, DUR * (1 - F0) + 30);
        }, DUR * F0);
        return;
    }
    _lhSp.el.classList.add('ws-voiding');
    _lhSp.bhHov = false;   // 0.98.41：黑洞進虛無後就收不到 pointerleave——不清掉，時間會一直停在放慢
    _lhSpWarp(() => {
        vd.getAnimations().forEach(a => a.cancel()); vd.style.opacity = '';   // 0.98.41：上一輪白洞出口留下的「背景轉透明」一定先清掉，不然虛無底下的星系會透出來
        vd.hidden = !on;
        _lhSp.el.classList.toggle('ws-in-void', on);
        if (on) _lhSpVoidLoad(); else { cancelAnimationFrame(_lhSp.vRaf); vd.querySelectorAll('.ws-vw').forEach(x => x.remove()); }
        setTimeout(() => _lhSp.el.classList.remove('ws-voiding'), 800);
    });
}
// 虛無裡的詞：死氣沉沉、灰灰的，以極慢的速度無重力漂流（DOM 字，可以拖到中間的白洞救回）
async function _lhSpVoidLoad() {
    const vd = _lhSp.el.querySelector('.ws-void'), wh = vd.querySelector('.ws-wh');
    let list = [];
    if (LH_SP_DEV) { try { const r = await fetch('data/void-words.json', { cache: 'no-store' }); list = r.ok ? await r.json() : []; } catch (err) { lhWarn('虛無的詞載入失敗', err); } }   // 開發者：官方丟掉的
    else list = lhVoidList().map(x => x.w);   // 使用者：自己放逐的
    if (vd.hidden) return;
    const W = vd.clientWidth, H = vd.clientHeight, items = [];
    // 0.98.41 Andy：虛無裡也能縮放（兩指、滾輪）——以畫面中心縮放，只有字變大變小、白洞不變；
    // 上下限跟宇宙一樣照字高：縮到最小＝最大的字 LH_SP_TXT_MIN px、放到最大＝最小的字 LH_SP_TXT_MAX px
    let Z = 1;
    const scr = it => { const cx = vd.clientWidth / 2, cy = vd.clientHeight / 2; return { x: cx + (it.x - cx) * Z, y: cy + (it.y - cy) * Z }; };
    const zLim = () => { const px = items.map(it => it.fs * 16); return px.length ? [Math.min(1, LH_SP_TXT_MIN / Math.max(...px)), Math.max(1, LH_SP_TXT_MAX / Math.min(...px))] : [1, 1]; };
    const setZ = z => { const [lo, hi] = zLim(); Z = Math.max(lo, Math.min(hi, z)); };
    if (_lhSp.vAC) _lhSp.vAC.abort();
    const AC = _lhSp.vAC = new AbortController(), ptr = new Map();
    let pin = null;
    vd.addEventListener('wheel', e => { e.preventDefault(); setZ(Z * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))); }, { passive: false, signal: AC.signal });
    vd.addEventListener('pointerdown', e => { if (e.target.closest('.ws-wh')) return; ptr.set(e.pointerId, e); if (ptr.size === 2) { const [a, b] = [...ptr.values()]; pin = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1, z: Z }; } }, { signal: AC.signal });
    vd.addEventListener('pointermove', e => { if (!ptr.has(e.pointerId)) return; ptr.set(e.pointerId, e); if (pin && ptr.size === 2) { const [a, b] = [...ptr.values()]; setZ(pin.z * Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / pin.d); } }, { signal: AC.signal });
    const pEnd = e => { ptr.delete(e.pointerId); if (ptr.size < 2) pin = null; };
    vd.addEventListener('pointerup', pEnd, { signal: AC.signal }); vd.addEventListener('pointercancel', pEnd, { signal: AC.signal });
    for (const w of Array.isArray(list) ? list : []) {
        const s = _lhWsEl('span', 'ws-vw', w), a = Math.random() * Math.PI * 2, v = 1.5 + Math.random() * 3;   // 每秒 1.5～4.5 px
        const it = { s, w, x: Math.random() * W, y: Math.random() * H, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: (Math.random() - 0.5) * 40, vr: (Math.random() - 0.5) * 1.5, drag: null };
        it.fs = 0.8 + Math.random() * 0.5;   // rem；畫面上的大小＝fs × 縮放 Z
        s.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); s.setPointerCapture(e.pointerId); const p = scr(it); it.drag = { dx: e.clientX - p.x, dy: e.clientY - p.y }; s.classList.add('on'); });
        s.addEventListener('pointermove', e => { if (it.drag) { const W = vd.clientWidth / 2, H = vd.clientHeight / 2; it.x = W + (e.clientX - it.drag.dx - W) / Z; it.y = H + (e.clientY - it.drag.dy - H) / Z; } });
        const up = e => {
            if (!it.drag) return;
            it.drag = null; s.classList.remove('on');
            const r = wh.getBoundingClientRect();
            if (Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)) < 40) {   // 丟進白洞：救回詞庫
                items.splice(items.indexOf(it), 1); s.remove();
                wh.classList.remove('gulp'); void wh.offsetWidth; wh.classList.add('gulp');
                _lhWs.hidden.delete(w);
                if (LH_SP_DEV) _lhSpVoidPost('restore', w).catch(err => lhWarn('白洞救回失敗（本地伺服器有開嗎？）', err));
                else _lhVoidUserRestore([w]);
            }
        };
        s.addEventListener('pointerup', up); s.addEventListener('pointercancel', up);
        vd.append(s); items.push(it);
    }
    let last = 0;
    const step = t => {
        const dt = last ? Math.min(0.1, (t - last) / 1000) : 0; last = t;
        const W = vd.clientWidth, H = vd.clientHeight;
        for (const it of items) {
            if (!it.drag) { it.x += it.vx * dt; it.y += it.vy * dt; it.r += it.vr * dt;
                if (it.x < -80) it.x = W + 60; else if (it.x > W + 80) it.x = -60;
                if (it.y < -40) it.y = H + 30; else if (it.y > H + 40) it.y = -30; }
            const p = scr(it);
            it.s.style.fontSize = (it.fs * Z) + 'rem';
            it.s.style.transform = 'translate(' + p.x + 'px,' + p.y + 'px) translate(-50%,-50%) rotate(' + it.r + 'deg)';
        }
        _lhSp.vRaf = requestAnimationFrame(step);
    };
    cancelAnimationFrame(_lhSp.vRaf);
    _lhSp.vRaf = requestAnimationFrame(step);
}

function _lhSpEvents(el) {
    // 隱藏（浮在詞右上角的真按鈕）
    _lhSp.acts.addEventListener('click', e => {
        const w = _lhSp.words.find(x => x.w === _lhSp.acts.dataset.w);
        if (!w) return;
        _lhSp.dirty = true;
        if (e.target.closest('.ws-hide')) _lhSpDropWord(w);
    });
    el.addEventListener('wheel', e => {
        if (e.target.closest('.ws-panel, .ws-tune, .ws-legpanel, .ws-legbtn, .ws-ptop, .ws-tr, .ws-void')) return;
        e.preventDefault();
        const r = el.getBoundingClientRect();
        _lhSpZoom(_lhSp.z * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    // 滑鼠停在詞上：定格＋外框光暈＋浮出 📌 ✕；剛取消釘選的詞要等游標離開再回來才會再亮（不然看起來像沒取消）
    el.addEventListener('pointermove', e => {
        if (e.pointerType === 'mouse' && _lhSpCfg().dock) {   // 黑洞放大要知道游標在哪
            const r = el.getBoundingClientRect();
            _lhSp.mouse = e.target.closest('.ws-panel, .ws-tune, .ws-legpanel, .ws-legbtn, .ws-tr, .ws-ptop, .ws-nav, .ws-bh') ? null : { x: e.clientX - r.left, y: e.clientY - r.top };
            _lhSp.dirty = true;
        }
        if (e.pointerType !== 'mouse' || _lhSp.pts.size || e.target.closest('.ws-panel, .ws-tune, .ws-legpanel, .ws-legbtn, .ws-tr, .ws-ptop, .ws-nav')) return;
        if (e.target.closest('.ws-acts')) return;
        let w = _lhSpHit(e.clientX, e.clientY);
        if (_lhSp.mute && w !== _lhSp.mute) _lhSp.mute = null;
        if (w && w === _lhSp.mute) w = null;
        _lhSpSetHover(w);
        if (_lhSp.holoPin && !w) return;   // 導覽叫出來的標籤：滑鼠移到空白不收（停到別的詞上才換）
        if (w) _lhSp.holoPin = false;
        _lhSpHolo(w || null, w && !w.star ? LH_SP_HOLO_PLANET_WAIT : 0);   // 恆星馬上、行星和流星晚一點（0.98.20：流星也顯示讀音）
    });
    el.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { _lhSp.mouse = null; _lhSp.dirty = true; if (!_lhSp.drag) { _lhSpSetHover(null); _lhSpHolo(null); } } });
    el.addEventListener('pointerdown', e => {
        if (e.target.closest('.ws-panel, .ws-tune, .ws-legpanel, .ws-legbtn, .ws-tr, .ws-acts, .ws-ptop, .ws-nav, .ws-bh, .ws-void')) return;   // 換批滑桿移出面板後也要排除（0.98.09）
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        _lhSp.nav = null;
        // 0.98.12：第一根手指放下＝之前的手指都離開了；iOS 偶爾漏掉 pointerup，殘留的點會讓第二指湊不成「剛好 2 指」→ 不能縮放
        if (e.isPrimary) _lhSp.pts.clear();
        _lhSp.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (_lhSp.pts.size === 2) {   // 第二根手指：放棄拖曳／平移，改成以兩指中點為中心縮放
            _lhSp.drag = null; _lhSp.pan = null;
            const [a, b] = [..._lhSp.pts.values()], r = el.getBoundingClientRect();
            _lhSp.pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: _lhSp.z, mx: (a.x + b.x) / 2 - r.left, my: (a.y + b.y) / 2 - r.top };
            return;
        }
        if (_lhSp.pts.size > 2) return;
        try { el.setPointerCapture(e.pointerId); } catch (err) { lhWarn('setPointerCapture 失敗', err); }
        const w = _lhSpHit(e.clientX, e.clientY);
        if (w) {
            const p = _lhSpToWorld(e.clientX, e.clientY), at = _lhSpPos(w);
            w.bhE = undefined; w.inBh = 0; w.brk = 0;   // Andy：手拖過的詞＝黑洞的冷卻、甩出狀態歸零（不然拖進範圍會因為還在冷卻而停在原地）
            const d = _lhSp.drag = { w, id: e.pointerId, sx: e.clientX, sy: e.clientY, gx: p.x - at.x, gy: p.y - at.y, moved: false, hist: [], touch: e.pointerType !== 'mouse' };
            // 觸控按住恆星 0.35 秒：浮出全息標籤（放手就收），這次放手不算點擊（不釘選）
            clearTimeout(_lhSp.holoTm);
            if (e.pointerType !== 'mouse') _lhSp.holoTm = setTimeout(() => { if (_lhSp.drag === d && !d.moved) { d.held = true; _lhSpHolo(w); } }, w.star ? 350 : 875);   // 觸控按住：恆星 0.35 秒、行星 2.5 倍
        } else _lhSp.pan = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false };
    });
    el.addEventListener('pointermove', e => {
        if (!_lhSp.pts.has(e.pointerId)) return;
        _lhSp.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (_lhSp.pinch && _lhSp.pts.size >= 2) {
            const [a, b] = [..._lhSp.pts.values()];
            _lhSpZoom(_lhSp.pinch.z0 * Math.hypot(a.x - b.x, a.y - b.y) / _lhSp.pinch.d0, _lhSp.pinch.mx, _lhSp.pinch.my);
            return;
        }
        const d = _lhSp.drag;
        if (d && d.id === e.pointerId) {
            if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < (d.w.star ? 18 : 5)) return;   // 0.98.20 Andy：恆星要拖 18px 才算拖（微微晃到不會沖散）
            const L = _lhSpCfg();
            if (!d.moved) {
                d.moved = true; d.w.hot = true; d.w.free = true; d.w.src = 'B'; d.w.fvx = d.w.fvy = 0; d.w.bk = 0; d.w.bax = d.w.bay = 0;   // 煞車歸零：放手立刻飛
                el.classList.add('panning');
                if (d.w.star) _lhSpScatter(d.w, L);
            }
            const p = _lhSpToWorld(e.clientX, e.clientY);
            { const bh = el.querySelector('.ws-bh'); if (bh) { bh.style.setProperty('--bh-near', (bh.offsetWidth + LH_SP_TUNE.bh.dropPx) / Math.max(1, bh.offsetWidth)); bh.classList.toggle('near', _lhSpBhHit(e.clientX, e.clientY)); } }   // 拖到黑洞上方：黑洞張開
            d.w.fx = p.x - d.gx; d.w.fy = p.y - d.gy;
            d.hist.push({ t: e.timeStamp, x: p.x, y: p.y });
            if (d.hist.length > 6) d.hist.shift();
            return;
        }
        const p = _lhSp.pan;
        if (p && p.id === e.pointerId) {
            p.moved = p.moved || Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 5;
            _lhSp.px += e.clientX - p.x; _lhSp.py += e.clientY - p.y;
            p.x = e.clientX; p.y = e.clientY;
            if (p.moved) el.classList.add('panning');
            _lhSpApplyView();
        }
    });
    const end = e => {
        if (!_lhSp.pts.delete(e.pointerId)) return;
        if (e.pointerType !== 'mouse') { clearTimeout(_lhSp.holoTm); _lhSpHolo(null); }
        if (_lhSp.pts.size < 2) _lhSp.pinch = null;
        el.classList.remove('panning');
        const d = _lhSp.drag;
        if (d && d.id === e.pointerId) {
            _lhSp.drag = null;
            _lhSp.dirty = true;
            const bh = el.querySelector('.ws-bh');
            if (bh) bh.classList.remove('near');
            if (d.moved && e.type === 'pointerup' && _lhSpBhHit(e.clientX, e.clientY)) { if (d.w.star && d.w.cl) d.w.cl.held = false; _lhSpBhEat(d.w); return; }   // 丟進黑洞（恆星：放開整團，讓接任的恆星把它聚回來）
            const L = _lhSpCfg();
            if (d.moved && (L.drag === 'stay' || (L.starStay && d.w.star))) {   // 第 1、2 級：拖到哪就停在哪（行星換一條新軌道、恆星帶著整團搬家）
                _lhSpSettle(d.w, L, (_lhSpNow() - _lhSp.t0) / 1000);
                if (!d.w.pinned) d.w.hot = false;   // 0.98.09：游標停在詞上不再定格，放手就恢復
            } else if (d.moved) {
                // 甩動：用最後一小段的速度（世界座標／秒）繼續滑，摩擦慢慢停下
                const h = d.hist, a = h[0], b = h[h.length - 1];
                const dt = b && a && b.t > a.t ? (b.t - a.t) / 1000 : 0;
                if (dt > 0 && e.timeStamp - b.t < 80) {
                    const vmax = 2400;
                    d.w.fvx = Math.max(-vmax, Math.min(vmax, (b.x - a.x) / dt));
                    d.w.fvy = Math.max(-vmax, Math.min(vmax, (b.y - a.y) / dt));
                    d.w.brkP = LH_SP_TUNE.bh.brake; d.w.brk = _lhSpBrakeOf(d.w.fx, d.w.fy, d.w.fvx, d.w.fvy, d.w.brkP);   // 0.98.41：甩動煞車（離宇宙邊界最遠距離的 bh.brake%）
                }
                if (!d.w.pinned) d.w.hot = false;   // 0.98.09：游標停在詞上不再定格，放手就恢復
            } else if (e.type === 'pointerup' && !d.held) {   // 單擊：釘住＋保留；再點一次釘住的詞＝取消釘選＋取消保留（按住看全息標籤的不算）
                _lhSp.blankTap = null;   // 點過詞，空白的雙擊重新算
                d.w.pinned = !d.w.pinned;
                if (d.w.cl) d.w.cl.ver++;
                _lhSpPin(d.w);
                _lhSpClearSync();
                if (d.w.pinned) { _lhSp.act = d.w; if (!d.w.kept) { saveWord(d.w.w); d.w.kept = true; } }
                else {
                    if (d.w.kept) { removeSavedWord(d.w.w); d.w.kept = false; }
                    if (_lhSp.act === d.w) _lhSp.act = null;
                    if (_lhSp.hover === d.w) _lhSpSetHover(null);
                    d.w.hot = false;
                    _lhSp.mute = d.w;   // 游標還停在上面：先別亮，離開再回來才亮
                }
            }
        }
        if (_lhSp.pan && _lhSp.pan.id === e.pointerId) {
            const pn = _lhSp.pan;
            _lhSp.pan = null;
            if (pn.moved) _lhSp.navF = null;   // 自己拖畫布：不再跟著導覽的星
            if (e.type === 'pointerup' && !pn.moved) { _lhSp.navF = null; if (_lhSp.holoPin) { _lhSp.holoPin = false; _lhSpHolo(null); } }   // 點空白：收掉導覽叫出來的標籤
            // 點空白（沒拖動）：一律點兩下才全部取消選取（不管選了幾個），不跳確認
            // Andy：雙擊空白也順便關掉骰子／AI 星座模式（按鈕熄掉、線變回不顯眼；抽到的星座留著，再按按鈕就回來）
            if (e.type === 'pointerup' && !pn.moved && (_lhSp.pins.some(w => w.pinned) || _lhSp.mode)) {
                const now = e.timeStamp, last = _lhSp.blankTap;
                const dbl = last && now - last.t < 400 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 24;
                _lhSp.blankTap = dbl ? null : { t: now, x: e.clientX, y: e.clientY };
                if (dbl) {
                    if (_lhSp.pins.some(w => w.pinned)) _lhSpClearNow();
                    if (_lhSp.mode) { _lhSp.mode = null; _lhSp.cnI = -1; _lhSp.navF = null; _lhSp.dirty = true; _lhSpConSync(); }
                }
            }
        }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    // iOS Safari：兩指手勢別被瀏覽器拿去縮整頁（gesture* 是 Safari 專有事件）
    for (const t of ['gesturestart', 'gesturechange']) el.addEventListener(t, e => e.preventDefault(), { passive: false });
}
