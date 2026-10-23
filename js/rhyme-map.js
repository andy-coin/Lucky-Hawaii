// ==================== 韻腳地圖：鏡像層與排程 ====================
// 每個段落輸入框後面有一個一模一樣排版的透明文字層（div.rhyme-mirror，js/lyrics.js 建好）；句尾字在這一層包成色塊，
// 輸入框本身（節點、內容、游標、選取）完全不動，所以注音組字不受影響（CONTEXT B1、G2）。
// 判定全部來自 js/rhyme-core.js；這支檔案只負責：讀模型文字、排程（打字停 200 毫秒才算、組字中完全不碰）、畫色塊、對齊位置。
// 最後載入：lhSec*、curSong、_lhComposing 都已存在。畫面一律 createElement／textContent，不拼 HTML。

const LH_MAP_DEBOUNCE = 200;       // 打字停這麼久才重算（F1）
const LH_MAP_MAXWAIT = 1000;       // 連續打字最久等這麼久就算一次
const LH_MAP_MAX_LINES = 5000;     // 超過這麼多行的段落不分析（字數上限沿用 LH_WD_BIG）
const LH_MAP_HEX = /^#[0-9a-f]{6}$/;

let _lhMapSet = Object.assign({}, LH_RHYME_DEFAULTS);   // 目前的開關（之後的計畫會改成可存檔）
let _lhMapOk = false;              // 字典、詞庫、歌曲都就緒才畫（A5）
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
lhMapApplyPalette();
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
    mirror.style.paddingRight = ((parseFloat(cs.paddingRight) || 0) + Math.max(0, bar)) + 'px';
    mirror.scrollTop = ta.scrollTop;
}

function _lhMapMirrorOf(ta) {
    const m = ta.previousElementSibling;
    return m && m.classList.contains('rhyme-mirror') ? m : null;
}

// 畫一段：從模型讀文字（不讀輸入框，G2），一次 replaceChildren
function lhMapPaint(secEl) {
    const song = curSong();
    const sec = song && secEl && song.sections.find(x => x.id === secEl.dataset.id);
    const ta = secEl && secEl.querySelector('.section-textarea');
    const mirror = ta && _lhMapMirrorOf(ta);
    if (!sec || !mirror) return;
    const sig = [_lhMapSet.end, _lhMapSet.letters, _lhMapSet.inner, _lhMapSet.strict, _lhMapSet.skipParticles].map(Number).join('') + '|' + _lhMapEpoch + '|' + _lhMapReadVer;
    const hit = _lhMapCache.get(sec.id);
    if (hit && hit.text === sec.text && hit.sig === sig) {   // 沒變：只把「暫時藏起來」解除，不重畫
        mirror.classList.remove('rm-stale');
        _lhMapSync(ta, mirror);
        return;
    }
    const text = sec.text;
    let on = false;
    if (!_lhMapSet.end || text.length > LH_WD_BIG || text.split('\n').length > LH_MAP_MAX_LINES) {
        mirror.replaceChildren();   // 關掉或太大：不分析，鏡像層留空
    } else {
        const res = lhRhymeAnalyze(text, { strict: _lhMapSet.strict, skipParticles: _lhMapSet.skipParticles }, song.readings);
        const frag = document.createDocumentFragment();
        res.rows.forEach((r, n) => {
            if (r.t) {
                const cs = Array.from(r.line);
                const hl = document.createElement('span');
                hl.className = r.solo ? 'rm-hl rm-solo' : 'rm-hl';
                hl.dataset.f = String(r.f);
                hl.textContent = cs[r.t.i];
                frag.append(cs.slice(0, r.t.i).join(''), hl, cs.slice(r.t.i + 1).join(''));
                on = true;
            } else frag.append(r.line);
            if (n < res.rows.length - 1) frag.append('\n');
        });
        frag.append('​');   // 結尾零寬字元：文字以換行結尾時，和輸入框一樣多出一個空行
        mirror.replaceChildren(frag);
    }
    secEl.classList.toggle('rm-on', on);
    mirror.classList.remove('rm-stale');
    _lhMapSync(ta, mirror);   // 顯示出來之後才設得動 scrollTop，所以放在最後
    _lhMapCache.set(sec.id, { text, sig });
}

// 同步量位置：所有輸入框共用一個 ResizeObserver（捲軸出現／消失、拖高度、縮放、收合展開都會觸發）。
// 組字中只記下來，下一次畫的時候才對齊，不在組字中改鏡像層
const _lhMapDeferred = new Set();
const _lhMapRO = new ResizeObserver(entries => {
    for (const e of entries) {
        const mirror = _lhMapMirrorOf(e.target);
        if (!mirror) continue;
        if (_lhComposing) _lhMapDeferred.add(e.target);
        else _lhMapSync(e.target, mirror);
    }
});

// 整個重畫（開機、換歌、列表重畫、詞庫換包）：同步執行，打字不走這裡
function lhMapRenderAll() {
    if (!_lhMapOk) return;
    const box = document.getElementById('lyricsSections');
    if (!box) return;
    _lhMapCache.clear();
    _lhMapPending.clear();
    _lhMapDeferred.clear();
    _lhMapRO.disconnect();
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
    clearTimeout(_lhMapTimer);
    _lhMapTimer = setTimeout(_lhMapFlush, Math.max(0, Math.min(LH_MAP_DEBOUNCE, _lhMapFirstAt + LH_MAP_MAXWAIT - now)));
}

function _lhMapFlush() {
    _lhMapTimer = 0;
    const run = () => {
        if (_lhComposing) return;   // 組字中完全不動；確認後會重新排程，待算的段落還留在清單裡
        const ids = Array.from(_lhMapPending);
        _lhMapPending.clear();
        for (const id of ids) {
            const el = lhSecEl(id);
            if (el) lhMapPaint(el);
        }
    };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 500 });
    else setTimeout(run, 0);
}

// 詞庫換包（之後由 switchLexiconPack 呼叫）：讀音來源變了，全部重算
function lhMapOnLexiconChange() {
    _lhMapEpoch++;
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

// 就緒閘門（A5）：字典、詞庫、歌曲都結束（成功或失敗都算）才開始畫；之前不畫、也不顯示錯誤
window.__lhMapReady = Promise.allSettled([window.__hoyunReady, window.__hoyunWordlistReady, window.__hoyunSongsReady]).then(() => {
    try {
        _lhMapOk = true;
        lhMapRenderAll();
    } catch (e) {
        lhWarn('韻腳地圖首次上色失敗', e);
    }
});
