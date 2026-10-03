        // ===== 破音字讀音顯示 =====
        let polyphonicsOrderMap = null;  // Map<char, string[]>，從 破音字列表.txt 載入
        let _polyphonic = { char: null, reading: null };  // 目前選定的破音字讀音

        const _TONE_MARKS = ['', 'ˊ', 'ˇ', 'ˋ', '˙'];

        let _polyphonicsOrderPromise = null;
        function loadPolyphonicsOrder() {
            if (polyphonicsOrderMap) return Promise.resolve();
            if (_polyphonicsOrderPromise) return _polyphonicsOrderPromise;
            // 優先用 <script src="data/polyphonic-order.js"> 注入的全域變數（離線可用）
            if (window._polyphonicsOrderData) {
                polyphonicsOrderMap = new Map(Object.entries(window._polyphonicsOrderData));
                return Promise.resolve();
            }
            // fallback：fetch JSON（不影響線上版）
            _polyphonicsOrderPromise = fetch('data/polyphonic-order.json')
                .then(r => r.json())
                .then(d => { polyphonicsOrderMap = new Map(Object.entries(d)); })
                .catch(e => { lhWarn('破音字排序檔載入失敗', e); polyphonicsOrderMap = new Map(); });
            return _polyphonicsOrderPromise;
        }

        // 回傳 [{reading, tier}, ...]；以 polyphonicsOrderMap 為序，未列出的接在後面
        function getCharAllReadings(char) {
            const infos = charInfo[char];
            if (!infos) return [];
            const map = new Map(); // reading → tier（同讀音多 tier 時取最佳：common > normal > rare）
            const rank = { common: 0, normal: 1, rare: 2 };
            for (const {zhuyin, tone, tier} of infos) {
                const full = zhuyin + _TONE_MARKS[tone - 1];
                const cur = map.get(full);
                if (!cur || rank[tier] < rank[cur]) map.set(full, tier);
            }
            const ordered = [];
            const used = new Set();
            if (polyphonicsOrderMap && polyphonicsOrderMap.has(char)) {
                for (const r of polyphonicsOrderMap.get(char)) {
                    if (map.has(r)) { ordered.push({ reading: r, tier: map.get(r) }); used.add(r); }
                }
            }
            for (const [r, tier] of map) {
                if (!used.has(r)) ordered.push({ reading: r, tier });
            }
            return ordered;
        }

        function isPolyphonic(char) {
            // 以 charInfo 內不同 (zhuyin, tone) 組合數為準，含「同 base 不同 tone」的破音字（如潛 ㄑㄧㄢˊ/ㄑㄧㄢˇ）
            const infos = charInfo[char];
            if (!infos || infos.length < 2) return false;
            const set = new Set();
            for (const { zhuyin, tone } of infos) set.add(zhuyin + tone);
            return set.size > 1;
        }

        async function renderPolyphonicChips(char) {
            // 先清掉上一次的
            const old = document.getElementById('polyphonicChips');
            if (old) old.remove();

            if (!char || !isPolyphonic(char)) return;
            // 確保讀音順序表已載入，避免 fallback 到 charInfo 的插入順序
            if (!polyphonicsOrderMap) await loadPolyphonicsOrder();
            // 等待期間若使用者已切換到別的字，放棄
            if (_getSearchSingleChar(searchInputEl.value) !== char) return;
            if (document.getElementById('polyphonicChips')) return;
            let readings = getCharAllReadings(char);
            const hideRare = document.getElementById('hideRare')?.checked;
            if (hideRare) readings = readings.filter(it => it.tier !== 'rare');
            if (readings.length <= 1) return;

            // 載入時自動採用第一順位讀音（以 polyphonic-order.json 為準），
            // 讓字卡一進來就匹配第一個 chip（避免跟字庫插入順序不一致）
            const firstReading = readings[0].reading;
            if (!_polyphonic.reading || _polyphonic.char !== char || !readings.some(it => it.reading === _polyphonic.reading)) {
                _polyphonic = { char, reading: firstReading };
            }

            const header = document.querySelector('.results-header');
            if (!header) return;

            const active = (_polyphonic.char === char && _polyphonic.reading) ? _polyphonic.reading : firstReading;
            const container = document.createElement('div');
            container.id = 'polyphonicChips';
            container.className = 'polyphonic-chips';
            // data-reading 保留注音形式（內部識別），按鈕文字依模式顯示
            const usePinyin = lastSearchType === 'pinyin';
            const _toneMap = { 'ˊ': 2, 'ˇ': 3, 'ˋ': 4, '˙': 5 };
            const fmtChip = (r) => {
                if (!usePinyin) return r;
                const last = r.slice(-1);
                const tone = _toneMap[last] || 1;
                const base = _toneMap[last] ? r.slice(0, -1) : r;
                return fmtPhonetic(base, tone);
            };
            container.innerHTML =
                '<span class="polyphonic-chips-label">破音字：</span>' +
                readings.map(({reading: r, tier}) => {
                    const cls = `poly-chip${r === active ? ' active' : ''}${tier === 'rare' ? ' rare' : ''}`;
                    const mark = tier === 'rare' ? '<span class="rare-mark">冷</span>' : '';
                    return `<button class="${cls}" data-char="${char}" data-reading="${r}" onclick="selectPolyphonicReading('${char}','${r}')">${fmtChip(r)}${mark}</button>`;
                }).join('');
            header.appendChild(container);
        }

        function selectPolyphonicReading(char, reading) {
            _polyphonic = { char, reading };
            const val = searchInputEl.value;
            displayResults(searchRhyme(val));
            renderPolyphonicChips(char);
            updateAIRhymeDisplay(val);
        }
