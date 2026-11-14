// ==================== 介面縮放（--ui-scale） ====================
// 古典 script，放在 head、緊接 safety.js：要在第一次繪製前就把存下的縮放套到 <html>，
// 重開頁面才不會先閃一下 100% 再跳到使用者的大小。
// 縮放走根字級（html font-size = 100% × --ui-scale），不再用 CSS zoom；之後所有尺寸都跟著 rem 走。

const LH_UI_SCALE_KEY = 'lh:uiScale';
const LH_UI_SCALE_MIN = 50;
const LH_UI_SCALE_MAX = 150;
const LH_UI_SCALE_STEP = 5;

let lhUiScale = 100;

// 任何來源的值（localStorage 字串、呼叫端數字）都收斂成 50–150、步進 5 的整數；壞值一律回 100
function lhNormalizeScale(v) {
    if (v === null || v === undefined || String(v).trim() === '') return 100;
    const n = Number(v);
    if (!Number.isFinite(n)) return 100;
    const stepped = Math.round(n / LH_UI_SCALE_STEP) * LH_UI_SCALE_STEP;
    return Math.min(LH_UI_SCALE_MAX, Math.max(LH_UI_SCALE_MIN, stepped));
}

// 同步百分比標籤與 ➖／➕ 的停用狀態（到 50% 不能再縮、到 150% 不能再放）
function _lhSyncScaleControls() {
    const label = document.getElementById('MzoomValue');
    if (label) label.textContent = lhUiScale + '%';
    const limits = [['MzoomOut', LH_UI_SCALE_MIN], ['MzoomIn', LH_UI_SCALE_MAX]];
    for (const [id, limit] of limits) {
        const btn = document.getElementById(id);
        if (!btn) continue;
        const atLimit = lhUiScale === limit;
        btn.disabled = atLimit;
        if (atLimit) btn.setAttribute('aria-disabled', 'true');
        else btn.removeAttribute('aria-disabled');
    }
}

// 套用縮放：寫 --ui-scale（只寫數字字串，不拼接任何外來文字進 CSS）、同步控制項、需要時存檔
function setUiScale(pct, save = true) {
    const n = lhNormalizeScale(pct);
    lhUiScale = n;
    document.documentElement.style.setProperty('--ui-scale', String(n / 100));
    _lhSyncScaleControls();
    if (save) lhSet(LH_UI_SCALE_KEY, String(n));
    // 間距、最小寬高、分頁寬都是 rem：縮放一變，寬螢幕版面要重算（head 執行時 dock.js 還沒載入，守衛會略過）
    if (typeof lhPanelRoom === 'function') lhPanelRoom();
    if (typeof lhDockRender === 'function') lhDockRender();
    return n;
}

// iOS／iPadOS：輸入框字級 < 16px 時點進去會自動放大整頁。加 maximum-scale=1 擋掉這個自動放大（iOS 10+ 仍允許雙指縮放），
// 歌詞框與情境框就能跟著介面縮放、不必卡 16px。Android 不會自動放大，不加（加了會失去雙指縮放）
if (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    const vm = document.querySelector('meta[name="viewport"]');
    if (vm && !/maximum-scale/.test(vm.content)) vm.content += ', maximum-scale=1';
}

// 4 行動裝置（觸控為主）第一次來：手機（≤440）預設 80%、平板 90%；有存過就用存的
// head 執行時 #MzoomValue 還不存在，所以先套值、等 DOM 好了再補一次標籤
setUiScale(lhGet(LH_UI_SCALE_KEY) ?? (matchMedia('(pointer: coarse) and (max-width: 440px)').matches ? 80 : matchMedia('(pointer: coarse)').matches ? 90 : 100), false);
document.addEventListener('DOMContentLoaded', _lhSyncScaleControls);

// ==================== 斷點（D-02）：只在這裡讀，其他檔案一律用 helper ====================
// ≤ 440 手機、≤ 900 底部 sheet 模式；MQL 物件讓各處可掛 change 監聽，轉向／調整視窗不用重新載入
const LH_MQ_PHONE = matchMedia('(max-width: 440px)');
const LH_MQ_SHEET = matchMedia('(max-width: 900px)');
function lhIsPhone() { return LH_MQ_PHONE.matches; }
function lhIsSheetMode() { return LH_MQ_SHEET.matches; }
// 寬螢幕吸附版面（js/dock.js）：比 13 吋 iPad 橫放（1376）寬、而且是滑鼠，才算寬螢幕（Andy 2026-11-14，原本 1600）。
// 既有測試都跑在 1440 寬並假設抽屜版面，tests/helpers.mjs 會先設 window.__lhDockMinW = 1600；門檻要調只改這裡
const LH_MQ_DOCK = matchMedia('(min-width: ' + (Number(window.__lhDockMinW) || 1400) + 'px) and (hover: hover) and (pointer: fine)');
function lhIsDockMode() { return LH_MQ_DOCK.matches; }

// ==================== 虛擬鍵盤（D-09）：打字的地方一定看得到 ====================
// iOS Safari 跳出鍵盤時只縮「視覺視窗」（visualViewport），版面視窗不變，所以 100dvh 不會變矮；
// Android Chrome 加了 interactive-widget=resizes-content 後版面視窗也會跟著縮。
// 兩種都靠 visualViewport 的高度判斷：高度比「穩定高度」矮 150px 以上、正有文字欄位被聚焦、沒有被兩指放大、而且是手機／平板（sheet 模式或觸控）才算鍵盤。
// （只有網址列伸縮不會矮到 150px，沒聚焦輸入框時更不算，所以不會誤判。）
const LH_KB_THRESHOLD = 150;   // 矮多少以上才算鍵盤
const LH_KB_SHORT_H = 600;     // 可見高度低於這個值，標題區先讓位給結果
let lhStableH = window.innerHeight;   // 自載入以來看過最高的視窗高度
let lhStableW = window.innerWidth;
let lhKbRaf = 0;
let lhKbOpen = false;

// 會叫出鍵盤的欄位：文字框、多行框、下拉選單；勾選、色票、拉桿、檔案、按鈕不算
function _lhTextFieldFocused() {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (tag !== 'INPUT') return false;
    return !/^(checkbox|radio|color|range|file|button|submit|reset|image)$/i.test(el.type);
}

function _lhKbClear(root) {
    root.classList.remove('kb-open', 'kb-short');
    for (const p of ['--app-h', '--vv-top', '--kb-inset']) root.style.removeProperty(p);
}

// 一次更新：算穩定高度 → 判斷鍵盤 → 寫 class 與三個變數（只寫 visualViewport／innerHeight 的數字加 px，不經手任何使用者文字）
function _lhKbUpdate() {
    lhKbRaf = 0;
    const root = document.documentElement;
    const vv = window.visualViewport;
    const vvH = vv ? vv.height : window.innerHeight;
    const vvTop = vv ? vv.offsetTop : 0;
    // 轉向或調整視窗寬度：重新量穩定高度；只有高度變（鍵盤、網址列）則保留最高值
    if (window.innerWidth !== lhStableW) {
        lhStableW = window.innerWidth;
        lhStableH = window.innerHeight;
    } else if (window.innerHeight > lhStableH) {
        lhStableH = window.innerHeight;
    }
    // 兩指放大時 visualViewport 也會變矮（scale > 1），電腦視窗被拉矮也一樣——這兩種都不是鍵盤：
    // 只在「沒放大」且「底部 sheet 模式或觸控裝置」時才認（WR-02）
    const zoomed = vv ? vv.scale > 1.01 : false;
    const touchish = lhIsSheetMode() || matchMedia('(pointer: coarse)').matches;
    const open = !zoomed && touchish && _lhTextFieldFocused() && (lhStableH - vvH >= LH_KB_THRESHOLD);
    const was = root.classList.contains('kb-open');
    if (!open) {
        lhKbOpen = false;
        _lhKbClear(root);
        if (was && typeof lhCanvasApply === 'function') lhCanvasApply();   // 鍵盤收起：自由畫布排回來（canvas.js 較晚載入）
        return;
    }
    // 不四捨五入：iOS 的 visualViewport 常是小數，湊整會讓面板差 0.5px 露出一條縫
    root.style.setProperty('--app-h', vvH + 'px');
    root.style.setProperty('--vv-top', vvTop + 'px');
    root.style.setProperty('--kb-inset', Math.max(0, window.innerHeight - vvH - vvTop) + 'px');
    root.classList.add('kb-open');
    root.classList.toggle('kb-short', vvH < LH_KB_SHORT_H);
    if (!was && typeof lhCanvasApply === 'function') lhCanvasApply();   // 鍵盤打開：自由畫布退回整齊直列，只留正在打字的那段
    // 剛從沒鍵盤變成有鍵盤（Android 是先聚焦、過一下才縮）：把正在打字的欄位捲進可見範圍
    if (!lhKbOpen) _lhKbReveal();
    lhKbOpen = true;
}

function _lhKbSchedule() {
    if (lhKbRaf) return;
    // 分頁在背景時 rAF 會暫停，改用 setTimeout 才不會卡在舊狀態
    if (document.hidden) { lhKbRaf = -1; setTimeout(_lhKbUpdate, 0); return; }
    lhKbRaf = requestAnimationFrame(_lhKbUpdate);
}

// 把聚焦中的文字欄位捲進可見範圍（block: 'nearest'：已經看得到就不動，免得頁面亂跳）
function _lhKbReveal() {
    if (!lhKbOpen && !document.documentElement.classList.contains('kb-open')) return;
    const el = document.activeElement;
    if (el && _lhTextFieldFocused() && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
}

if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', _lhKbSchedule);
    window.visualViewport.addEventListener('scroll', _lhKbSchedule);
}
window.addEventListener('resize', _lhKbSchedule);
document.addEventListener('focusin', () => {
    _lhKbSchedule();
    if (_lhTextFieldFocused()) {
        // 鍵盤的動畫要 200–300ms：聚焦當下與 250ms 後各捲一次
        _lhKbReveal();
        setTimeout(() => { _lhKbUpdate(); _lhKbReveal(); }, 250);
    }
});
document.addEventListener('focusout', _lhKbSchedule);

// ==================== 右鍵／長按選單定位（05-08，UI-SPEC §6） ====================
// 以前用固定的 160／220／100／140 px 估選單大小，放大到 150% 時選單比估的大，右下角會被切掉。
// 現在先顯示、量真正的大小，再把 left／top 夾進「可見範圍」（visualViewport；沒有就用視窗）四邊各留 4px。
// 只寫兩個數字加 px，不經手任何使用者文字（T-05-19）。
function lhPlaceMenu(el, x, y) {
    // 先放到左上角再量：fixed 元素的寬度會被「離右邊還剩多少」限制，從上次的位置量會被擠窄
    el.style.left = '0px';
    el.style.top = '0px';
    el.classList.add('show');
    const vv = window.visualViewport;
    const vx = vv ? vv.offsetLeft : 0;
    const vy = vv ? vv.offsetTop : 0;
    const vw = vv ? vv.width : window.innerWidth;
    const vh = vv ? vv.height : window.innerHeight;
    const r = el.getBoundingClientRect();
    const M = 4;
    // 選單比可見範圍還大時（極端縮放）貼左上角：max 在外面，上緣／左緣優先看得到
    const left = Math.max(vx + M, Math.min(x, vx + vw - r.width - M));
    const top = Math.max(vy + M, Math.min(y, vy + vh - r.height - M));
    el.style.left = left + 'px';
    el.style.top = top + 'px';
}
