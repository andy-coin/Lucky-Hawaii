        // ==================== 小麥字庫（v0.8 格式）====================
        // 格式：'注音+聲調數字': '常用字｜一般字｜冷僻字'
        // 聲調：1=一聲 2=二聲 3=三聲 4=四聲 5=輕聲
        // 聲調：1=一聲 2=二聲 3=三聲 4=四聲 5=輕聲
        let rhymeDict = {}; // 由 loadRhymeDict() 從 data/rhyme-dict.json 載入
        // ==================== 字庫解析引擎 ====================
        let chineseDict = {};   // char → [baseZhuyin, ...] — 搜尋用（向下相容）
        let charInfo = {};      // char → [{zhuyin, tone, tier}, ...] — 聲調/分級資訊

        function buildIndex() {
            chineseDict = {};
            charInfo = {};

            for (const [key, value] of Object.entries(rhymeDict)) {
                const tone = parseInt(key.slice(-1));
                const baseZhuyin = key.slice(0, -1);

                const parts = value.split('｜');
                const tiers = ['common', 'normal', 'rare'];

                parts.forEach((part, idx) => {
                    if (!part || part.trim() === '—' || part.trim() === '-') return;
                    const tier = tiers[idx] || 'rare';
                    const chars = [...part.trim()].filter(c => c.trim() && c !== '—' && c !== '-');

                    chars.forEach(char => {
                        // chineseDict（搜尋相容）
                        if (!chineseDict[char]) chineseDict[char] = [];
                        if (!chineseDict[char].includes(baseZhuyin)) {
                            chineseDict[char].push(baseZhuyin);
                        }
                        // charInfo（聲調 + 分級）
                        if (!charInfo[char]) charInfo[char] = [];
                        charInfo[char].push({ zhuyin: baseZhuyin, tone, tier });
                    });
                });
            }

            console.log(`[buildIndex] ${Object.keys(chineseDict).length} 字, ${Object.keys(rhymeDict).length} 組`);
        }

        let dictOverrides = {}; // 記錄被使用者修改過的 rhymeDict key

        function loadDictOverrides() {
            // 走 lhGetJSON：損毀或形狀不對時會留記錄、另存原始內容，不然下次存檔就把它蓋掉了
            const saved = lhGetJSON('dictOverrides_v076', null, v => v && typeof v === 'object' && !Array.isArray(v));
            if (!saved) return;
            dictOverrides = saved;
            for (const [key, val] of Object.entries(dictOverrides)) {
                rhymeDict[key] = val;
            }
        }

        function saveDictOverrides() {
            // lhSet 不會丟例外，寫入失敗時由它自己顯示存檔失敗橫幅，所以不需要再包 try/catch
            lhSet('dictOverrides_v076', JSON.stringify(dictOverrides));
        }

        function clearDictOverrides() {
            const n = Object.keys(dictOverrides || {}).length;
            const stored = lhGet('dictOverrides_v076');
            if (!n && !stored) { alert('目前沒有 local 字庫覆寫'); return; }
            if (!confirm(`將清除瀏覽器暫存的 ${n} 筆字庫覆寫，並重新載入頁面以套用乾淨的資料檔。確定？`)) return;
            lhRemove('dictOverrides_v076');
            dictOverrides = {};
            location.reload();
        }

        // ── 後台匯出的字庫 overrides（data/rhyme-dict-overrides.json）──
        // 由 admin/exportChanges() 產出的 .py 跑完後寫入；累積追加。
        // 套用時機：boot 完跑 buildIndex() 後，async fetch → 套用 → 再 buildIndex() 一次
        function _removeCharFromRhymeKey(dictKey, char) {
            const entry = rhymeDict[dictKey];
            if (!entry) return false;
            const parts = entry.split('｜');
            while (parts.length < 3) parts.push('—');
            let touched = false;
            for (let i = 0; i < parts.length; i++) {
                const chars = [...parts[i]].filter(c => c !== '—' && c !== '-' && c.trim());
                const idx = chars.indexOf(char);
                if (idx >= 0) {
                    chars.splice(idx, 1);
                    parts[i] = chars.length ? chars.join('') : '—';
                    touched = true;
                }
            }
            if (touched) {
                if (parts.every(p => p === '—')) delete rhymeDict[dictKey];
                else rhymeDict[dictKey] = parts.join('｜');
            }
            return touched;
        }

        function _addCharToRhymeKey(dictKey, char, tier) {
            const tierIdx = { common: 0, normal: 1, rare: 2 }[tier] ?? 1;
            const entry = rhymeDict[dictKey] || '—｜—｜—';
            const parts = entry.split('｜');
            while (parts.length < 3) parts.push('—');
            for (let i = 0; i < parts.length; i++) {
                const chars = [...parts[i]].filter(c => c !== '—' && c !== '-' && c.trim() && c !== char);
                parts[i] = chars.length ? chars.join('') : '—';
            }
            parts[tierIdx] = parts[tierIdx] === '—' ? char : parts[tierIdx] + char;
            rhymeDict[dictKey] = parts.join('｜');
        }

        // ── 修正層：Worker 上已套用、還沒寫回 data 的修正；抓不到就略過，不擋畫面 ──
        // 每次載入頁面只抓一次（詞庫與字庫共用）；讓伺服器的 max-age=60 生效；永遠不 reject；fetch 不帶 cache 選項
        let _corrP = null;
        function loadCorrections() {
            if (_corrP) return _corrP;
            _corrP = (async () => {
                try {
                    const r = await fetch(WORKER_URL + '/corrections.json', { signal: AbortSignal.timeout(3000) });
                    if (!r.ok) throw new Error('HTTP ' + r.status);
                    const doc = await r.json();
                    const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
                    if (!isObj(doc) || !isObj(doc.wordlist) || !isObj(doc.rhymeDict)) throw new Error('格式不對');
                    return doc;
                } catch (e) { lhWarn('修正層載入失敗', e); return null; }
            })();
            return _corrP;
        }

        // 套用一份字庫修正文件（data 檔與修正層同格式），回傳套用條數
        function applyRhymeDictOverrideDoc(ovr) {
            let count = 0;
            for (const it of (ovr.removed || []).concat(ovr.hidden || [])) {
                if (!it.char || !it.dict_key) continue;
                if (_removeCharFromRhymeKey(it.dict_key, it.char)) count++;
            }
            for (const it of (ovr.fixed || [])) {
                if (!it.char || !it.to) continue;
                if (it.from) _removeCharFromRhymeKey(it.from, it.char);  // from 空 → 純新增
                _addCharToRhymeKey(it.to, it.char, it.tier || 'normal');
                count++;
            }
            for (const a of (ovr.added || [])) {
                if (!a.char || !a.dict_key) continue;
                _addCharToRhymeKey(a.dict_key, a.char, a.tier || 'normal');
                count++;
            }
            return count;
        }

        // 先套 data 修正檔、再套修正層；兩段各自可缺、各自 try/catch，其一壞掉不影響另一段（C4）
        async function applyRhymeDictOverrides() {
            const [base, layer] = await Promise.all([
                (async () => {
                    try {
                        const r = await fetch('data/rhyme-dict-overrides.json', { cache: 'no-cache' });
                        return r.ok ? await r.json() : null;
                    } catch(e) { lhWarn('字庫修正檔載入失敗', e); return null; }
                })(),
                loadCorrections(),
            ]);
            let count = 0, layerCount = 0;
            if (base) { try { count += applyRhymeDictOverrideDoc(base); } catch (e) { lhWarn('字庫修正檔套用失敗', e); } }
            if (layer && layer.rhymeDict) { try { layerCount = applyRhymeDictOverrideDoc(layer.rhymeDict); } catch (e) { lhWarn('修正層套用失敗', e); } }
            count += layerCount;
            if (count) console.log(`[rhyme overrides] ${count} 條套用（修正層 ${layerCount}）`);
            return count > 0;
        }

        // 取得字的分級（直接從 charInfo 讀取，永遠是最新狀態）
        function getCharMark(char, zhuyin) {
            const infos = charInfo[char];
            if (!infos || infos.length === 0) return 'normal';
            if (zhuyin) {
                const match = infos.find(i => i.zhuyin === zhuyin);
                if (match) return match.tier;
            }
            return infos[0].tier;
        }

        // 在 rhymeDict 中移動字的分級位置
        function moveCharTier(char, dictKey, newTier) {
            const entry = rhymeDict[dictKey];
            if (!entry) return;

            const parts = entry.split('｜');
            while (parts.length < 3) parts.push('—');

            // 從所有區域移除該字
            for (let i = 0; i < parts.length; i++) {
                const chars = [...parts[i]].filter(c => c !== '—' && c !== '-' && c.trim());
                const idx = chars.indexOf(char);
                if (idx !== -1) {
                    chars.splice(idx, 1);
                    parts[i] = chars.length > 0 ? chars.join('') : '—';
                }
            }

            // 加入目標區域
            const tierIdx = { common: 0, normal: 1, rare: 2 }[newTier];
            if (parts[tierIdx] === '—' || parts[tierIdx] === '-') {
                parts[tierIdx] = char;
            } else {
                parts[tierIdx] += char;
            }

            // 更新 rhymeDict
            rhymeDict[dictKey] = parts.join('｜');
            dictOverrides[dictKey] = rhymeDict[dictKey];
            saveDictOverrides();

            // 更新 charInfo（就地修改，不需 rebuild）
            const baseZhuyin = dictKey.slice(0, -1);
            const tone = parseInt(dictKey.slice(-1));
            const infos = charInfo[char];
            if (infos) {
                const match = infos.find(i => i.zhuyin === baseZhuyin && i.tone === tone);
                if (match) match.tier = newTier;
            }
        }

        // 循環切換：常用 → 一般 → 冷僻 → 常用
        function cycleCharMark(char, dictKey) {
            const baseZhuyin = dictKey.slice(0, -1);
            const current = getCharMark(char, baseZhuyin);
            let newTier;
            if (current === 'common') newTier = 'normal';
            else if (current === 'normal') newTier = 'rare';
            else newTier = 'common';

            moveCharTier(char, dictKey, newTier);
        }

