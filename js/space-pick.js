// 0.98.41 Andy：宇宙的物理引擎二選一——預設新版；本地齒輪最上面可以切回 0.98.40 對照（legacy/ 裡原封不動的舊檔，調參存 lh:spTune40 分開）
// 必須在解析 HTML 時同步寫出 <script>：兩版宣告同一批全域名稱，只能載入其中一版
(() => {
    const local = /^(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(location.hostname);
    const old = local && lhGet('lh:spPhys') === '0.98.40', v = '?v=' + LH_APP_VERSION;
    const src = old ? ['legacy/sp-tune-defaults-0.98.40.js', 'legacy/word-space-0.98.40.js'] : ['js/sp-tune-defaults.js', 'js/sp-tune-defaults-mobile.js', 'js/word-space.js'];
    document.write(src.map(s => '<script src="' + s + v + '"><\/script>').join(''));
    if (old) document.addEventListener('DOMContentLoaded', () => {   // 對照中：右下角一顆鈕切回新版（舊檔裡沒有切換開關）
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'lh-phys-back'; b.textContent = '⟲ 現在是 0.98.40 對照｜按這裡切回新版';
        b.addEventListener('click', () => { lhSet('lh:spPhys', 'new'); location.reload(); });
        document.body.append(b);
    });
})();
