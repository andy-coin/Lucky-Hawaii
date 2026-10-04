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
    return n;
}

// head 執行時 #MzoomValue 還不存在，所以先套值、等 DOM 好了再補一次標籤
setUiScale(lhGet(LH_UI_SCALE_KEY), false);
document.addEventListener('DOMContentLoaded', _lhSyncScaleControls);
