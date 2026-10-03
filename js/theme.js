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

        function applyTheme(dark, save = true) {
            isDark = !!dark;
            document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
            if (!phone) {
                themeToggle.textContent = isDark ? '🌙 深色模式' : '☀️ 淺色模式';
            } else{
                themeToggle.textContent = isDark ? '🌙 ' : '☀️ ';
            }
            if (save) lhSet(THEME_KEY, isDark ? 'dark' : 'light');
        }

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

        // 電腦縮放功能（影響整個主容器：header + 搜尋 + 字卡）
        const zoomSlider = document.getElementById('zoomSlider');
        const zoomValue =  document.getElementById('zoomValue');
        const zoomTarget = document.querySelector('.container');
        const resultsSection = zoomTarget; // 保留別名給 mobile zoomIn/Out 用

        zoomSlider.addEventListener('input', (e) => {
            zoomValue.textContent = e.target.value + '%';
        });

        zoomSlider.addEventListener('change', (e) => {
            const value = parseInt(e.target.value);
            const scale = value / 100;
            zoomTarget.style.zoom = scale;
            zoomTarget.style.transform = 'none';
        });


        // 顏色自定義
        function loadColors() {
            const rawColors = {
                bgColor1: lhGet('bgColor1') || '#0c4564',
                containerBg: lhGet('containerBg') || '#eee3ce',
                textColor: lhGet('textColor') || '#2d3748',
                highlightColor: lhGet('highlightColor') || '#ed8936'
            };
            
            let displayColors;
            if (isDark) {
                displayColors = {
                    bgColor1: invertColor(rawColors.bgColor1),
                    containerBg: invertColor(rawColors.containerBg),
                    textColor: invertColor(rawColors.textColor),
                    highlightColor: invertColor(rawColors.highlightColor),
                };
            } else {
                displayColors = { ...rawColors };
            }
            
            // 同步桌面版色票
            document.getElementById('bgColor1').value = displayColors.bgColor1;
            document.getElementById('containerBg').value = displayColors.containerBg;
            document.getElementById('textColor').value = displayColors.textColor;
            document.getElementById('highlightColor').value = displayColors.highlightColor;
            // 同步手機設定面板色票
            const sBg = document.getElementById('sBgColor1');
            if (sBg) {
                sBg.value = displayColors.bgColor1;
                document.getElementById('sContainerBg').value = displayColors.containerBg;
                document.getElementById('sTextColor').value = displayColors.textColor;
                document.getElementById('sHighlightColor').value = displayColors.highlightColor;
            }
            
            applyColors(displayColors, rawColors.textColor);
        }

        function applyColors(colors, rawTextColor) {
            
            // 背景：有自訂色就套用，沒有的話深色模式用預設深色
            const defaultBg = '#0c4564';
            const hasCustomBg = lhGet('bgColor1') && lhGet('bgColor1') !== defaultBg;
            if (!isDark || hasCustomBg) {
                document.documentElement.style.setProperty('--bg-gradient-1', colors.bgColor1);
                document.documentElement.style.setProperty('--bg-gradient-2', colors.bgColor1);
            }

            document.documentElement.style.setProperty('--container-bg', colors.containerBg);
            document.documentElement.style.setProperty('--highlight-border', colors.highlightColor);
            
            const defaultTextColor = '#2d3748';
            const originalTextColor = rawTextColor || colors.textColor;
            if (originalTextColor !== defaultTextColor || isDark) {
                hasCustomTextColor = true;
                document.documentElement.style.setProperty('--custom-text-color', colors.textColor);
                document.documentElement.style.setProperty('--text-primary', colors.textColor);
            } else {
                hasCustomTextColor = false;
                document.documentElement.style.setProperty('--text-primary', colors.textColor);
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

