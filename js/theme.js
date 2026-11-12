        // Dark mode 切換
        const themeToggle = document.getElementById('themeToggle');
        const THEME_KEY = 'hoyun_theme_mode';
        let isDark = false;

        // 顏色反轉工具函數
        function invertColor(hex) {
            hex = hex.replace('#', '');
            const r = 255 - parseInt(hex.substring(0, 2), 16);
            const g = 255 - parseInt(hex.substring(2, 4), 16);
            const b = 255 - parseInt(hex.substring(4, 6), 16);
            return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
        }

        // 主題鈕：一致的線條圖示（不用 emoji）；手機只留圖示，名稱放在 aria-label
        const LH_ICON_SUN = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
        const LH_ICON_MOON = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';
        function applyTheme(dark, save = true) {
            isDark = !!dark;
            document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
            const label = isDark ? '深色模式' : '淺色模式';
            themeToggle.innerHTML = (isDark ? LH_ICON_MOON : LH_ICON_SUN) + (lhIsPhone() ? '' : '<span>' + label + '</span>');
            themeToggle.setAttribute('aria-label', label + '（點一下切換）');
            if (save) lhSet(THEME_KEY, isDark ? 'dark' : 'light');
        }
        // 轉向／調整視窗跨過 440 時，圖示與文字跟著換（不存檔）
        LH_MQ_PHONE.addEventListener('change', () => applyTheme(isDark, false));

        // 初始：記憶 > 系統偏好 > 預設淺色
        const savedTheme = lhGet(THEME_KEY);
        if (savedTheme === 'dark') applyTheme(true, false);
        else if (savedTheme === 'light') applyTheme(false, false);
        else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) applyTheme(true, false);
        else applyTheme(false, false);

        themeToggle.addEventListener('click', () => {
            applyTheme(!isDark, true);

            // 重新載入顏色（含反轉邏輯）
            loadColors();

            // 重新渲染結果以套用顏色
            const currentInput = document.getElementById('searchInput').value;
            if (currentInput) {
                const results = searchRhyme(currentInput);
                displayResults(results);
            }
        });

        // 顏色自定義（重設計後）：沒自訂的顏色交給 CSS 的晝／夜預設（base.css 的 :root 與 [data-theme="dark"]），
        // 有自訂的才寫進 inline 變數；深色模式沿用舊規則，把自訂色反相（使用者既有的客製照樣有效）
        const LH_COLOR_VARS = {
            bgColor1: ['--bg-gradient-1', '--bg-gradient-2'],
            containerBg: ['--container-bg'],
            textColor: ['--text-primary'],
            highlightColor: ['--highlight-border'],
        };
        const LH_COLOR_INPUTS = {
            bgColor1: ['bgColor1', 'sBgColor1'],
            containerBg: ['containerBg', 'sContainerBg'],
            textColor: ['textColor', 'sTextColor'],
            highlightColor: ['highlightColor', 'sHighlightColor'],
        };
        // 舊版的預設色：存下來的值剛好是這些，就當成「沒自訂」，改看新的預設（舊存檔才換得到新外觀）
        const LH_OLD_DEFAULTS = { bgColor1: '#0c4564', containerBg: '#eee3ce', textColor: '#2d3748', highlightColor: '#ed8936' };
        // 色票只接受 #rrggbb；計算後的變數值可能有空白或大小寫
        function lhHex(v) {
            v = String(v || '').trim().toLowerCase();
            if (/^#[0-9a-f]{6}$/.test(v)) return v;
            if (/^#[0-9a-f]{3}$/.test(v)) return '#' + [...v.slice(1)].map(c => c + c).join('');
            return '#000000';
        }
        function loadColors() {
            const root = document.documentElement.style;
            hasCustomTextColor = false;
            for (const [key, vars] of Object.entries(LH_COLOR_VARS)) {
                let raw = lhGet(key);
                if (raw && raw.toLowerCase() === LH_OLD_DEFAULTS[key]) raw = null;
                if (raw) {
                    const shown = isDark ? invertColor(raw) : raw;
                    vars.forEach(v => root.setProperty(v, shown));
                    if (key === 'textColor') {
                        hasCustomTextColor = true;
                        root.setProperty('--custom-text-color', shown);
                    }
                } else {
                    vars.forEach(v => root.removeProperty(v));
                    if (key === 'textColor') root.removeProperty('--custom-text-color');
                }
            }
            // 色票顯示畫面上真正在用的顏色（設定與手機設定兩組）
            const cs = getComputedStyle(document.documentElement);
            for (const [key, ids] of Object.entries(LH_COLOR_INPUTS)) {
                const val = lhHex(cs.getPropertyValue(LH_COLOR_VARS[key][0]));
                ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = val; });
            }
        }

        function resetColors() {
            lhRemove('bgColor1');
            lhRemove('containerBg');
            lhRemove('textColor');
            lhRemove('highlightColor');
            hasCustomTextColor = false;
            loadColors();
            const currentInput = document.getElementById('searchInput').value;
            if (currentInput) {
                const results = searchRhyme(currentInput);
                displayResults(results);
            }
        }

        function handleColorChange(key, value, rerender) {
            const rawValue = isDark ? invertColor(value) : value;
            lhSet(key, rawValue);
            loadColors();
            if (rerender) {
                const currentInput = document.getElementById('searchInput').value;
                if (currentInput) {
                    const results = searchRhyme(currentInput);
                    displayResults(results);
                }
            }
        }


        // 桌面版色票事件
        document.getElementById('bgColor1').addEventListener('input', (e) => handleColorChange('bgColor1', e.target.value));
        document.getElementById('containerBg').addEventListener('input', (e) => handleColorChange('containerBg', e.target.value));
        document.getElementById('textColor').addEventListener('input', (e) => handleColorChange('textColor', e.target.value, true));
        document.getElementById('highlightColor').addEventListener('input', (e) => handleColorChange('highlightColor', e.target.value));

        // 手機設定面板色票事件（使用 input 事件以支援即時預覽）
        document.getElementById('sBgColor1').addEventListener('input', (e) => handleColorChange('bgColor1', e.target.value));
        document.getElementById('sContainerBg').addEventListener('input', (e) => handleColorChange('containerBg', e.target.value));
        document.getElementById('sTextColor').addEventListener('input', (e) => handleColorChange('textColor', e.target.value, true));
        document.getElementById('sHighlightColor').addEventListener('input', (e) => handleColorChange('highlightColor', e.target.value));

