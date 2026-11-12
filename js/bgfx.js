// ==================== 背景飄字（R2 主題）====================
// 最底層一張 <canvas>（面板後面）：押韻常用字與注音像雪花慢慢飄落，非常淡。顏色跟著主題的重點色（js/theme.js 換主題時呼叫 lhBgFxRefresh）。
// 省電：最多約 30 fps、字數少、頁面隱藏時停；系統要求減少動態時只畫一張靜態的；自動化測試（navigator.webdriver）不畫，截圖才穩定。
// 開關：localStorage 'lh:bgFx'（'off' 才關，預設開）；全域 lhBgFxSet(on) 給偏好設定的「外觀」分頁接。

const LH_BGFX_KEY = 'lh:bgFx';
const LH_BGFX_CHARS = '韻押歌詞月光晚安夢心風雨唱聲情ㄢㄤㄥㄧㄨㄩㄞㄠㄡㄣㄚㄛ';
const _lhBgReduce = matchMedia('(prefers-reduced-motion: reduce)');
let _lhBgOn = lhGet(LH_BGFX_KEY) !== 'off';
let _lhBgCanvas = null;
let _lhBgCtx = null;
let _lhBgFlakes = [];
let _lhBgRaf = 0;
let _lhBgLast = 0;
let _lhBgColors = ['#888'];
let _lhBgAlpha = 0.16;
let _lhBgW = 0;
let _lhBgH = 0;

function _lhBgAllowed() {
    return _lhBgOn && !(navigator.webdriver && !window.__lhBgFxTest);
}

function _lhBgNewFlake(anywhere) {
    const size = 14 + Math.random() * 22;
    return {
        x: Math.random() * _lhBgW,
        y: anywhere ? Math.random() * _lhBgH : -size - Math.random() * 80,
        size,
        vy: 10 + Math.random() * 16 + size * 0.3,      // 大字落得快一點，有遠近感
        sway: 8 + Math.random() * 18,
        phase: Math.random() * Math.PI * 2,
        rot: (Math.random() - 0.5) * 0.6,
        vr: (Math.random() - 0.5) * 0.25,
        ch: LH_BGFX_CHARS[Math.floor(Math.random() * LH_BGFX_CHARS.length)],
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
    _lhBgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 字數跟面積走，iPad 約 16 個、桌機約 20 個，上限 24
    const n = Math.max(10, Math.min(24, Math.round(_lhBgW * _lhBgH / 55000)));
    while (_lhBgFlakes.length < n) _lhBgFlakes.push(_lhBgNewFlake(true));
    _lhBgFlakes.length = n;
    if (_lhBgReduce.matches) _lhBgDraw(0);
}

function _lhBgDraw(dt) {
    const ctx = _lhBgCtx;
    ctx.clearRect(0, 0, _lhBgW, _lhBgH);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const font = getComputedStyle(document.documentElement).getPropertyValue('--font-serif') || 'serif';
    for (let i = 0; i < _lhBgFlakes.length; i++) {
        let f = _lhBgFlakes[i];
        if (dt) {
            f.y += f.vy * dt;
            f.phase += dt * 0.6;
            f.rot += f.vr * dt;
            if (f.y > _lhBgH + f.size) f = _lhBgFlakes[i] = _lhBgNewFlake(false);
        }
        ctx.save();
        ctx.translate(f.x + Math.sin(f.phase) * f.sway, f.y);
        ctx.rotate(f.rot);
        ctx.globalAlpha = _lhBgAlpha * f.a;
        ctx.fillStyle = _lhBgColors[f.color % _lhBgColors.length];
        ctx.font = Math.round(f.size) + 'px ' + font;
        ctx.fillText(f.ch, 0, 0);
        ctx.restore();
    }
}

function _lhBgFrame(t) {
    _lhBgRaf = requestAnimationFrame(_lhBgFrame);
    if (t - _lhBgLast < 32) return;   // 約 30 fps 就夠慢慢飄
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
    if (_lhBgReduce.matches || document.hidden) { _lhBgStop(); _lhBgDraw(0); return; }
    if (!_lhBgRaf) _lhBgRaf = requestAnimationFrame(_lhBgFrame);
}

// 換主題後重讀顏色：四個重點色輪流
function lhBgFxRefresh() {
    const cs = getComputedStyle(document.documentElement);
    _lhBgColors = ['--highlight-border', '--accent-2', '--accent-3', '--accent-4']
        .map(v => cs.getPropertyValue(v).trim()).filter(Boolean);
    if (!_lhBgColors.length) _lhBgColors = ['#888'];
    _lhBgAlpha = parseFloat(cs.getPropertyValue('--fx-opacity')) || 0.16;
    if (_lhBgCanvas && !_lhBgRaf) _lhBgDraw(0);
}

// 開關（偏好設定之後接這個）：記住選擇並立刻生效
function lhBgFxSet(on) {
    _lhBgOn = !!on;
    lhSet(LH_BGFX_KEY, _lhBgOn ? 'on' : 'off');
    _lhBgUpdate();
}
function lhBgFxIsOn() { return _lhBgOn; }

window.addEventListener('resize', _lhBgResize);
document.addEventListener('visibilitychange', _lhBgUpdate);
_lhBgReduce.addEventListener('change', _lhBgUpdate);
lhBgFxRefresh();
_lhBgUpdate();
