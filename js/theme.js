        // 主題切換（R2）：Plain 素墨 → Moon 月光 → City 城市 → Midnight 午夜 → 自訂 → 回到 Plain
        // <html data-lh-theme> 是主題名、<html data-theme> 是明暗（light／dark，韻腳地圖與既有規則用）
        const themeToggle = document.getElementById('themeToggle');
        const THEME_KEY = 'hoyun_theme_mode';
        const LH_THEMES = ['plain', 'moon', 'city', 'midnight', 'custom'];
        const LH_THEME_NAMES = { plain: '素墨', moon: '月光', city: '城市', midnight: '午夜', custom: '自訂' };
        const LH_THEME_DARK = { plain: true, moon: false, city: true, midnight: true };   // 自訂的明暗看實際底色
        let lhTheme = 'moon';
        let isDark = false;

        // 顏色反轉工具函數（舊版深色模式用；保留給既有測試與外部呼叫）
        function invertColor(hex) {
            hex = hex.replace('#', '');
            const r = 255 - parseInt(hex.substring(0, 2), 16);
            const g = 255 - parseInt(hex.substring(2, 4), 16);
            const b = 255 - parseInt(hex.substring(4, 6), 16);
            return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
        }

        // 主題鈕：一致的線條圖示（調色盤）；手機只留圖示，名稱放在 aria-label
        const LH_ICON_PALETTE = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-.9-.7-1.3-.7-2.2 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5c0-4.2-4-7.6-9-7.6z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="14.5" cy="7" r="1"/><circle cx="17" cy="11" r="1"/></svg>';

        // 有沒有存過自訂顏色（舊版的預設色不算）
        function lhHasCustomColors() {
            return Object.keys(LH_OLD_DEFAULTS).some(k => { const v = lhGet(k); return !!v && v.toLowerCase() !== LH_OLD_DEFAULTS[k]; });
        }
        // 存的值 → 主題名。舊版只存 light／dark（或沒存）：有自訂顏色→自訂；暗（或沒存且系統是深色）→Plain；其餘→Moon。
        // 舊值不改寫儲存（備份檔、舊版程式照樣讀得懂），使用者按一次主題鈕才存新名字
        function lhResolveTheme(saved) {
            if (LH_THEMES.includes(saved)) return saved;
            if (lhHasCustomColors()) return 'custom';
            const sysDark = !saved && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
            return (saved === 'dark' || sysDark) ? 'plain' : 'moon';
        }

        function applyTheme(name, save = true) {
            if (typeof name === 'boolean') name = name ? 'plain' : 'moon';   // 舊呼叫法 applyTheme(dark)
            lhTheme = LH_THEMES.includes(name) ? name : 'moon';
            const root = document.documentElement;
            root.setAttribute('data-lh-theme', lhTheme);
            if (save) lhSet(THEME_KEY, lhTheme);
            loadColors();
            const label = '主題：' + LH_THEME_NAMES[lhTheme];
            themeToggle.innerHTML = LH_ICON_PALETTE + (lhIsPhone() ? '' : '<span>' + LH_THEME_NAMES[lhTheme] + '</span>');
            themeToggle.setAttribute('aria-label', label + '（點一下換下一個）');
            themeToggle.title = label + '（點一下換下一個）';
            if (typeof lhMapApplyPalette === 'function') lhMapApplyPalette();   // 韻腳色組依新的 --card-bg 亮度重選
            if (typeof lhBgFxRefresh === 'function') lhBgFxRefresh();
        }
        // 自訂主題的明暗：量實際的容器底色
        function lhMeasureDark() {
            if (lhTheme !== 'custom') return !!LH_THEME_DARK[lhTheme];
            const h = lhHex(getComputedStyle(document.documentElement).getPropertyValue('--container-bg'));
            const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
            return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) < 128;
        }
        function lhNextTheme() {
            applyTheme(LH_THEMES[(LH_THEMES.indexOf(lhTheme) + 1) % LH_THEMES.length], true);
        }
        // 轉向／調整視窗跨過 440 時，圖示與文字跟著換（不存檔）
        LH_MQ_PHONE.addEventListener('change', () => applyTheme(lhTheme, false));

        themeToggle.addEventListener('click', () => {
            lhNextTheme();
            // 重新渲染結果以套用顏色
            const currentInput = document.getElementById('searchInput').value;
            if (currentInput) {
                const results = searchRhyme(currentInput);
                displayResults(results);
            }
        });

        // 顏色自定義：只在「自訂」主題生效。沒自訂的顏色交給 CSS 的預設（base.css 的 :root），有自訂的才寫進 inline 變數。
        // R2 起不再反相：自訂就是使用者選的顏色本身
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
                let raw = lhTheme === 'custom' ? lhGet(key) : null;
                if (raw && raw.toLowerCase() === LH_OLD_DEFAULTS[key]) raw = null;
                if (raw && !/^#[0-9a-f]{6}$/i.test(raw)) raw = null;
                if (raw) {
                    const shown = raw;
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
            isDark = lhMeasureDark();
            document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
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

        // 在命名主題裡改顏色＝切到「自訂」主題（記住）再套用這個顏色
        function handleColorChange(key, value, rerender) {
            lhSet(key, value);
            if (lhTheme !== 'custom') applyTheme('custom', true);
            else loadColors();
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

        // 初始：記憶 > 系統偏好（深色→Plain、淺色→Moon）；舊版的 light／dark 照 lhResolveTheme 遷移
        applyTheme(lhResolveTheme(lhGet(THEME_KEY)), false);
