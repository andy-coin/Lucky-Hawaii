// ==================== 儲存安全層 ====================
// 古典 script（無 import/export），在 index.html 的 head 載入，早於主程式。
// 所有 localStorage 存取都走這裡：鍵值有登記、寫入失敗看得見、讀取損毀不會整頁掛掉。

const LH_LOG_PREFIX = '[好韻器]';

// === 已知儲存鍵清單（備份與測試共用；D-13） ===
// 以 AST 掃描驗證過的 16 個固定鍵（CONTEXT 寫「約 17」，實際為 16）
const LH_KEYS = [
    { key: 'haiku_lyrics', group: 'data' },
    { key: 'haiku_hashtags', group: 'data' },
    { key: 'haiku_savedwords', group: 'data' },
    { key: 'dictOverrides_v076', group: 'data' },
    { key: 'haoYunQi_inputMode', group: 'setting' },
    { key: 'selectedModel', group: 'setting' },
    { key: 'hoyun_theme_mode', group: 'setting' },
    { key: 'bgColor1', group: 'setting' },
    { key: 'containerBg', group: 'setting' },
    { key: 'textColor', group: 'setting' },
    { key: 'highlightColor', group: 'setting' },
    { key: 'recentPanelCollapsed', group: 'ui' },
    { key: 'leftPanelCollapsed', group: 'ui' },
    { key: 'rightPanelCollapsed', group: 'ui' },
    { key: 'contextSectionCollapsed', group: 'ui' },
    { key: 'savedPoolCollapsed', group: 'ui' }
];
// secret 旗標讓之後的匯出（Phase 8）可以排除金鑰
const LH_KEY_PREFIXES = [{ prefix: 'apiKey_', group: 'setting', secret: true }];
// 新鍵一律用 lh: 前綴；這兩個是中介資料，不備份
const LH_META_KEYS = ['lh:schema', 'lh:backup:ls'];
// 後台頁（admin/）與本站同網域，它的金鑰是機密，絕對不可被快照或備份（RESEARCH Pitfall 8）
const LH_EXCLUDED_KEYS = ['haoYunQi_admin_key', 'haoYunQi_admin_theme'];

// 背景、非關鍵錯誤只留主控台記錄（D-07）；呼叫端只傳鍵名與錯誤物件，不傳儲存的內容（apiKey 等）
function lhWarn(tag, err) {
    if (err === undefined || err === null) console.warn(LH_LOG_PREFIX + ' ' + tag);
    else console.warn(LH_LOG_PREFIX + ' ' + tag, err);
}

function lhIsKnownKey(key) {
    if (LH_EXCLUDED_KEYS.includes(key)) return false;
    if (LH_KEYS.some(k => k.key === key)) return true;
    if (LH_KEY_PREFIXES.some(p => key.startsWith(p.prefix))) return true;
    return LH_META_KEYS.includes(key);
}

// 清單外的鍵用 console.error 留記錄（冒煙測試會因此失敗），但不擋寫入——寧可存下也不丟使用者資料
function lhAssertKnownKey(key) {
    if (!lhIsKnownKey(key)) console.error(LH_LOG_PREFIX + ' 未登記的儲存鍵：' + key);
}

// === 安全讀寫 ===
function lhGet(key) {
    try { return localStorage.getItem(key); }
    catch (e) { lhWarn('讀取 ' + key + ' 失敗', e); return null; }
}

// 回傳 true/false；失敗一定顯示橫幅，絕不往外丟例外
function lhSet(key, value) {
    lhAssertKnownKey(key);
    try { localStorage.setItem(key, value); return true; }
    catch (e) {
        lhWarn('寫入 ' + key + ' 失敗', e);
        lhSaveFailed('save');
        return false;
    }
}

function lhRemove(key) {
    try { localStorage.removeItem(key); }
    catch (e) { lhWarn('移除 ' + key + ' 失敗', e); }
}

// === 存檔失敗橫幅（D-09） ===
const LH_BANNER_THROTTLE_MS = 60000;
// 之後的 plan 會在這裡加 backup、migrate-failed 兩種
const LH_BANNER_TEXT = {
    save: '存檔失敗：瀏覽器的儲存空間可能已滿，剛剛的修改可能沒有存下來。建議先按「匯出備份」存成檔案，再清掉不需要的舊資料。'
};
const _lhBannerShownAt = {};

function _lhBannerStyle() {
    if (document.getElementById('lhSafetyStyle')) return;
    const style = document.createElement('style');
    style.id = 'lhSafetyStyle';
    // 自帶樣式，之後 CSS 搬家也不會壞；顏色全用既有變數，晝夜都看得清楚
    style.textContent = [
        '.lh-save-banner { position: fixed; top: 12px; left: 50%; transform: translateX(-50%);',
        '  max-width: min(92vw, 560px); z-index: 10000; box-sizing: border-box;',
        '  background: var(--card-bg); color: var(--text-primary); border: 1px solid var(--border);',
        '  border-left: 4px solid #e53e3e; border-radius: 10px; padding: 12px 14px;',
        '  box-shadow: 0 4px 16px var(--shadow); font-size: 0.9rem; line-height: 1.5; }',
        '.lh-save-banner[hidden] { display: none; }',
        '.lh-save-banner-actions { display: flex; gap: 8px; margin-top: 8px; justify-content: flex-end; }',
        '.lh-save-banner button { font: inherit; cursor: pointer; padding: 4px 12px; border-radius: 6px;',
        '  background: var(--card-bg); color: var(--text-primary); border: 1px solid var(--border); }',
        '.lh-save-banner button:hover { border-color: #e53e3e; }'
    ].join('\n');
    document.head.appendChild(style);
}

function _lhBannerShow(text) {
    _lhBannerStyle();
    let el = document.getElementById('lhSaveBanner');
    if (!el) {
        el = document.createElement('div');
        el.id = 'lhSaveBanner';
        el.className = 'lh-save-banner';
        el.setAttribute('role', 'alert');
        el.setAttribute('aria-live', 'assertive');
        const msg = document.createElement('div');
        msg.className = 'lh-save-banner-text';
        const actions = document.createElement('div');
        actions.className = 'lh-save-banner-actions';
        const exportBtn = document.createElement('button');
        exportBtn.type = 'button';
        exportBtn.className = 'lh-save-banner-export';
        exportBtn.textContent = '匯出備份';
        exportBtn.addEventListener('click', () => {
            if (typeof exportSession === 'function') exportSession();
        });
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'lh-save-banner-close';
        closeBtn.textContent = '關閉';
        closeBtn.addEventListener('click', () => { el.hidden = true; });
        actions.append(exportBtn, closeBtn);
        el.append(msg, actions);
        document.body.appendChild(el);
    }
    el.querySelector('.lh-save-banner-text').textContent = text;
    el.hidden = false;
}

// 同一種 kind 在節流視窗內只顯示一次（從顯示當下起算，中途關掉也一樣）
function lhSaveFailed(kind) {
    const k = LH_BANNER_TEXT[kind] ? kind : 'save';
    const now = Date.now();
    if (_lhBannerShownAt[k] !== undefined && now - _lhBannerShownAt[k] < LH_BANNER_THROTTLE_MS) return;
    _lhBannerShownAt[k] = now;
    if (document.body) { _lhBannerShow(LH_BANNER_TEXT[k]); return; }
    // body 還沒生出來（例如 head 階段就寫入）→ 等 DOM 好了再顯示一次
    document.addEventListener('DOMContentLoaded', () => _lhBannerShow(LH_BANNER_TEXT[k]), { once: true });
}
