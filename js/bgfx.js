// ==================== 背景飄字（R2 主題）====================
// 最底層一張 <canvas>（面板後面）：押韻常用字與注音像雪花慢慢飄落，非常淡。顏色跟著主題的重點色（js/theme.js 換主題時呼叫 lhBgFxRefresh）。
// 省電：最多約 30 fps、字數少、頁面隱藏時停；系統要求減少動態時只畫一張靜態的；自動化測試（navigator.webdriver）不畫，截圖才穩定。
// 等級（0.98.06）：localStorage 'lh:bgFx' 存 '1'～'5'（舊值 'off'＝1、'on'＝3，預設 3）。偏好設定 → 外觀「背景動畫與特效」。
// 1、2 級背景飄字定格（只畫一張靜態的，0.98.09）；3 級約 20 fps、字少一點；4 級 30 fps；5 級 60 fps。星雲（js/word-space.js LH_SP_LV）也照這個等級。
// lhFxLevel()／lhFxSetLevel(n)；舊的 lhBgFxSet(on)／lhBgFxIsOn() 保留（on＝3 級以上）。

const LH_BGFX_KEY = 'lh:bgFx';
const LH_BGFX_CHARS = '韻押歌詞月光晚安夢心風雨唱聲情ㄢㄤㄥㄧㄨㄩㄞㄠㄡㄣㄚㄛ';
const _lhBgReduce = matchMedia('(prefers-reduced-motion: reduce)');
const LH_FX_DEFAULT = 3;
let _lhFxLv = (v => v === 'off' ? 1 : v === 'on' ? LH_FX_DEFAULT : /^[1-5]$/.test(v || '') ? +v : LH_FX_DEFAULT)(lhGet(LH_BGFX_KEY));
let _lhBgOn = _lhFxLv >= 3;
document.documentElement.dataset.fx = _lhFxLv;
let _lhBgCanvas = null;
let _lhBgCtx = null;
let _lhBgFlakes = [];
let _lhBgRaf = 0;
let _lhBgLast = 0;
let _lhBgColors = ['#888'];
let _lhBgAlpha = 0.16;
let _lhBgHidden = false;   // 外部要整個藏起來時用（lhBgFxHide）
let _lhBgFaint = false;    // 星雲（js/word-space.js）開著時：照常飄，但非常淡，當背景
let _lhBgFont = 'serif';
let _lhBgW = 0;
let _lhBgH = 0;
let _lhBgDpr = 1;

function _lhBgAllowed() {
    return !!_lhFxLv && !(navigator.webdriver && !window.__lhBgFxTest);
}

// 這首歌自己的字也會飄：歌詞、情境、標籤。單字：照句構分組切出來的詞（含標籤）＝ 8：2。4 秒重算一次就好
let _lhBgPool = null, _lhBgPoolAt = -1e9;
function _lhBgUserPool() {
    const now = performance.now();
    if (_lhBgPool && now - _lhBgPoolAt < 4000) return _lhBgPool;
    _lhBgPoolAt = now;
    const chars = [], words = [];
    const song = typeof curSong === 'function' ? curSong() : null;
    if (song) {
        const lines = [...(song.sections || []).map(s => s.text || ''), song.context || ''].join('\n').split('\n');
        for (const line of lines.slice(0, 400)) {
            for (const c of line) if (/[一-鿿]/.test(c)) chars.push(c);
            if (typeof lhLineAnalyze !== 'function' || !line.trim()) continue;
            const r = lhLineAnalyze(line), cps = Array.from(line);
            r.starts.forEach((st, k) => {
                const w = cps.slice(st, r.ends[k]).join('').trim();
                if (w.length >= 2 && w.length <= 6) words.push(w);
            });
        }
        for (const t of song.hashtags || []) { const w = String(t).replace(/^#/, '').trim(); if (w && w.length <= 8) words.push(w); }
    }
    return (_lhBgPool = { chars, words });
}
function _lhBgPick() {
    const p = _lhBgUserPool(), pick = a => a[Math.floor(Math.random() * a.length)];
    // 有寫東西：一半飄自己的字（其中單字 80%、詞 20%），另一半照舊是押韻常用字與注音
    if ((p.chars.length || p.words.length) && Math.random() < 0.5) {
        if (p.words.length && (!p.chars.length || Math.random() < 0.2)) return { ch: pick(p.words), word: true };
        return { ch: pick(p.chars), word: false };
    }
    return { ch: LH_BGFX_CHARS[Math.floor(Math.random() * LH_BGFX_CHARS.length)], word: false };
}

function _lhBgNewFlake(anywhere) {
    const pk = _lhBgPick();
    const size = (14 + Math.random() * 22) * (pk.word ? 0.7 : 1);   // 詞比較長，字小一點
    return {
        x: Math.random() * _lhBgW,
        y: anywhere ? Math.random() * _lhBgH : -size - Math.random() * 80,
        size,
        vy: 10 + Math.random() * 16 + size * 0.3,      // 大字落得快一點，有遠近感
        sway: 8 + Math.random() * 18,
        phase: Math.random() * Math.PI * 2,
        rot: (Math.random() - 0.5) * 0.6,
        vr: (Math.random() - 0.5) * 0.25,
        ch: pk.ch,
        color: Math.floor(Math.random() * 8),
        a: 0.55 + Math.random() * 0.45,
    };
}

function _lhBgResize() {
    if (!_lhBgCanvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    _lhBgW = window.innerWidth;
    _lhBgH = window.innerHeight;
    _lhBgCanvas.width = Math.round(_lhBgW * dpr);
    _lhBgCanvas.height = Math.round(_lhBgH * dpr);
    if (dpr !== _lhBgDpr) for (const f of _lhBgFlakes) f.img = null;
    _lhBgDpr = dpr;
    _lhBgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 字數跟面積走，iPad 約 16 個、桌機約 20 個，上限 24
    const n = Math.round(Math.max(10, Math.min(24, Math.round(_lhBgW * _lhBgH / 55000))) * (_lhFxLv <= 3 ? 0.6 : 1));
    while (_lhBgFlakes.length < n) _lhBgFlakes.push(_lhBgNewFlake(true));
    _lhBgFlakes.length = n;
    if (_lhBgReduce.matches || _lhFxLv <= 2 || !_lhBgRaf) _lhBgDraw(0);
}

function _lhBgDraw(dt) {
    const ctx = _lhBgCtx, d = _lhBgDpr;
    ctx.clearRect(0, 0, _lhBgW, _lhBgH);
    for (let i = 0; i < _lhBgFlakes.length; i++) {
        let f = _lhBgFlakes[i];
        if (dt) {
            f.y += f.vy * dt;
            f.phase += dt * 0.6;
            f.rot += f.vr * dt;
            if (f.y > _lhBgH + f.size) f = _lhBgFlakes[i] = _lhBgNewFlake(false);
        }
        if (!f.img) f.img = _lhBgSprite(f);
        const cs = Math.cos(f.rot) * d, sn = Math.sin(f.rot) * d, iw = f.img.width / d, ih = f.img.height / d;
        ctx.setTransform(cs, sn, -sn, cs, (f.x + Math.sin(f.phase) * f.sway) * d, f.y * d);
        ctx.globalAlpha = _lhBgAlpha * f.a * (_lhBgFaint ? 0.28 : 1);
        ctx.drawImage(f.img, -iw / 2, -ih / 2, iw, ih);
    }
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.globalAlpha = 1;
}
// 0.98.09：每個字先畫成一張小圖，每格只貼圖、不再 fillText（每格重畫中文字型很吃 CPU，風扇會轉）；換主題時清掉重畫
function _lhBgSprite(f) {
    const d = _lhBgDpr, font = Math.round(f.size) + 'px ' + _lhBgFont;
    const c = document.createElement('canvas'), x = c.getContext('2d');
    x.font = font;
    const w = Math.ceil(x.measureText(f.ch).width + 4), h = Math.ceil(f.size * 1.4);
    c.width = Math.max(1, Math.round(w * d)); c.height = Math.max(1, Math.round(h * d));
    x.scale(d, d);
    x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = _lhBgColors[f.color % _lhBgColors.length];
    x.fillText(f.ch, w / 2, h / 2);
    return c;
}

function _lhBgFrame(t) {
    _lhBgRaf = requestAnimationFrame(_lhBgFrame);
    if (t - _lhBgLast < ({ 3: 50, 4: 32 }[_lhFxLv] || 15)) return;   // 3 級約 20 fps、4 級 30 fps、5 級最多 60 fps（高刷螢幕不多畫）
    const dt = _lhBgLast ? Math.min((t - _lhBgLast) / 1000, 0.1) : 0;
    _lhBgLast = t;
    _lhBgDraw(dt);
}

function _lhBgStop() {
    cancelAnimationFrame(_lhBgRaf);
    _lhBgRaf = 0;
    _lhBgLast = 0;
}

function _lhBgUpdate() {
    if (!_lhBgAllowed()) {
        _lhBgStop();
        if (_lhBgCanvas) { _lhBgCanvas.remove(); _lhBgCanvas = null; _lhBgFlakes = []; }
        return;
    }
    if (!_lhBgCanvas) {
        _lhBgCanvas = document.createElement('canvas');
        _lhBgCanvas.id = 'lhBgFx';
        _lhBgCanvas.setAttribute('aria-hidden', 'true');
        _lhBgCtx = _lhBgCanvas.getContext('2d');
        document.body.prepend(_lhBgCanvas);
        _lhBgResize();
    }
    _lhBgCanvas.style.visibility = _lhBgHidden ? 'hidden' : '';
    if (_lhBgHidden) { _lhBgStop(); return; }
    // 1、2 級：定格一張；星雲開著時（_lhBgFaint）也定格——它只剩 28% 淡、被星雲蓋住，照跑會多一整張全螢幕畫布每秒 60 格（0.98.15.6，約省 20%）
    if (_lhBgReduce.matches || document.hidden || _lhFxLv <= 2 || _lhBgFaint) { _lhBgStop(); _lhBgDraw(0); return; }
    if (!_lhBgRaf) _lhBgRaf = requestAnimationFrame(_lhBgFrame);
}

// 換主題後重讀顏色：四個重點色輪流
function lhBgFxRefresh() {
    const cs = getComputedStyle(document.documentElement);
    _lhBgColors = ['--highlight-border', '--accent-2', '--accent-3', '--accent-4']
        .map(v => cs.getPropertyValue(v).trim()).filter(Boolean);
    if (!_lhBgColors.length) _lhBgColors = ['#888'];
    _lhBgAlpha = parseFloat(cs.getPropertyValue('--fx-opacity')) || 0.16;
    _lhBgFont = cs.getPropertyValue('--font-serif').trim() || 'serif';   // 每幀不再讀樣式
    for (const f of _lhBgFlakes) f.img = null;   // 顏色、字型換了：小圖重畫
    if (_lhBgCanvas && !_lhBgRaf) _lhBgDraw(0);
}

// 開關（偏好設定之後接這個）：記住選擇並立刻生效
function lhFxSetLevel(n) {
    _lhFxLv = Math.min(5, Math.max(1, Math.round(+n) || LH_FX_DEFAULT));
    _lhBgOn = _lhFxLv >= 3;
    document.documentElement.dataset.fx = _lhFxLv;
    lhSet(LH_BGFX_KEY, String(_lhFxLv));
    _lhBgUpdate();
    _lhBgResize();
}
function lhFxLevel() { return _lhFxLv; }
function lhBgFxSet(on) { lhFxSetLevel(on ? Math.max(LH_FX_DEFAULT, _lhFxLv) : 1); }
function lhBgFxIsOn() { return _lhBgOn; }
// 暫時藏起來（顯示全部押韻詞時，飄落的字會和漂浮的詞搶眼）；不改使用者的開關
function lhBgFxHide(h) {
    _lhBgHidden = !!h;
    _lhBgUpdate();
}
function lhBgFxFaint(f) {
    _lhBgFaint = !!f;
    _lhBgUpdate();
}

window.addEventListener('resize', _lhBgResize);
document.addEventListener('visibilitychange', _lhBgUpdate);
_lhBgReduce.addEventListener('change', _lhBgUpdate);
lhBgFxRefresh();
_lhBgUpdate();
