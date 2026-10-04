        function updateModeButtonLabels() {
            const isSingle = currentRhymes.length === 1 && !currentRhymes[0]?.isWild;
            const r = document.getElementById('modeRhyme');
            const i = document.getElementById('modeInitial');
            if (r) r.textContent = isSingle ? '押字尾' : '押母音';
            if (i) i.textContent = isSingle ? '押字首' : '押子音';
            const row = document.getElementById('aiFilterRow');
            if (row) row.style.display = isSingle ? 'flex' : 'none';
        }

        function toggleFilter(name) {
            if (name === 'sameTone') filterSameTone = !filterSameTone;
            else if (name === 'sameChar') filterSameChar = !filterSameChar;
            else if (name === 'noExtRhyme') filterNoExtRhyme = !filterNoExtRhyme;
            document.getElementById('filterChipSameTone').classList.toggle('active', filterSameTone);
            document.getElementById('filterChipSameChar').classList.toggle('active', filterSameChar);
            document.getElementById('filterChipNoExtRhyme').classList.toggle('active', filterNoExtRhyme);
            suggestedPool.clear();
            sentCandidatesSet.clear();
            cumulativeCandidates = [];
            _aiExtraRoundDone = false;
            const c = document.getElementById('aiWordsContainer');
            if (c) c.innerHTML = '';
        }

        function cycleFilterWordLen() {
            const seq = [0, 2, 3, 4];
            filterWordLen = seq[(seq.indexOf(filterWordLen) + 1) % seq.length];
            const chip = document.getElementById('filterChipWordLen');
            if (chip) {
                const label = filterWordLen === 0 ? '不限字數'
                    : filterWordLen === 4 ? '4字+'
                    : filterWordLen + '字';
                chip.textContent = '⚙ 限' + label;
                chip.classList.toggle('active', filterWordLen !== 0);
            }
            suggestedPool.clear();
            sentCandidatesSet.clear();
            cumulativeCandidates = [];
            _aiExtraRoundDone = false;
            const c = document.getElementById('aiWordsContainer');
            if (c) c.innerHTML = '';
        }

        function _wordLenPass(len) {
            if (!filterWordLen) return true;
            return filterWordLen === 4 ? len >= 4 : len === filterWordLen;
        }

        function filterWordsByRhymeSingle(searchChar, minPriority) {
            if (!wordlistData) return [];
            const savedSet = new Set(savedWords);
            const searchRhyme = currentRhymes[0]?.rhyme;
            const searchInitial = currentRhymes[0]?.initial;
            const isPureInitial = !searchRhyme && !!searchInitial;
            const searchFamilyId = searchRhyme ? RHYME_TO_FAMILY[searchRhyme] : null;
            const searchTone = (charInfo[searchChar] || [])[0]?.tone;
            const candidates = [];
            for (const entry of wordlistData) {
                if (entry.w.length < 2) continue;
                if (!_wordLenPass(entry.w.length)) continue;
                // if (entry.p < minPriority) continue;  // p 不準確（很多 p=0 並非冷僻），暫停使用
                if (sentCandidatesSet.has(entry.w)) continue;
                if (savedSet.has(entry.w)) continue;
                const syllables = entry.z.split(' ');
                if (syllables.length !== entry.w.length) continue;
                const lastChar = entry.w[entry.w.length - 1];
                const lastSyl = syllables[syllables.length - 1];
                if (filterSameChar && lastChar !== searchChar) continue;
                if (filterSameTone) {
                    const t = (charInfo[lastChar] || [])[0]?.tone;
                    if (t !== searchTone) continue;
                }
                if (isPureInitial) {
                    // 純聲母搜尋（如 ㄅ）：末字聲母要符合
                    if (getZhuyinInitial(lastSyl) !== searchInitial) continue;
                } else {
                    const lastRhyme = getZhuyinRhyme(lastSyl);
                    const rhymeMatch = filterNoExtRhyme
                        ? lastRhyme === searchRhyme
                        : RHYME_TO_FAMILY[lastRhyme] === searchFamilyId;
                    if (!rhymeMatch) continue;
                }
                candidates.push(entry.w);
            }
            for (let i = candidates.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
            }
            return candidates;
        }

        function filterWordsByInitialSingle(searchChar, minPriority) {
            if (!wordlistData) return [];
            const savedSet = new Set(savedWords);
            const searchInitial = currentRhymes[0]?.initial;
            const searchRhyme = currentRhymes[0]?.rhyme;
            const isPureInitial = !searchRhyme && !!searchInitial;
            const searchFamilyId = searchRhyme ? RHYME_TO_FAMILY[searchRhyme] : null;
            const searchTone = (charInfo[searchChar] || [])[0]?.tone;
            const candidates = [];
            for (const entry of wordlistData) {
                if (entry.w.length < 2) continue;
                if (!_wordLenPass(entry.w.length)) continue;
                // if (entry.p < minPriority) continue;  // p 不準確（很多 p=0 並非冷僻），暫停使用
                if (sentCandidatesSet.has(entry.w)) continue;
                if (savedSet.has(entry.w)) continue;
                const syllables = entry.z.split(' ');
                if (syllables.length !== entry.w.length) continue;
                const firstChar = entry.w[0];
                const firstSyl = syllables[0];
                if (isPureInitial) {
                    // 純聲母搜尋（如 ㄅ）：首字聲母要符合
                    if (getZhuyinInitial(firstSyl) !== searchInitial) continue;
                } else {
                    // 有韻母：首字韻部（借韻）要符合
                    const firstRhyme = getZhuyinRhyme(firstSyl);
                    if (RHYME_TO_FAMILY[firstRhyme] !== searchFamilyId) continue;
                }
                if (filterSameChar && firstChar !== searchChar) continue;
                if (filterSameTone) {
                    const t = (charInfo[firstChar] || [])[0]?.tone;
                    if (t !== searchTone) continue;
                }
                candidates.push(entry.w);
            }
            for (let i = candidates.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
            }
            return candidates;
        }

        function getWordlistCandidatesSingle() {
            if (!wordlistData) return null;
            const searchChar = currentRhymes[0]?.char;
            if (!searchChar) return null;
            /* 三層優先機制（暫時停用）
            for (const minP of [30, 10, 1]) {
                const all = rhymeMode === 'rhyme'
                    ? filterWordsByRhymeSingle(searchChar, minP)
                    : filterWordsByInitialSingle(searchChar, minP);
                if (all.length > 0) {
                    lastCandidatesTotal = all.length;
                    return all.slice(0, 200);
                }
            }
            */
            const all = rhymeMode === 'rhyme'
                ? filterWordsByRhymeSingle(searchChar, 1)
                : filterWordsByInitialSingle(searchChar, 1);
            if (all.length > 0) {
                lastCandidatesTotal = all.length;
                return all.length > 1000 ? all.slice(0, 1000) : all;
            }
            lastCandidatesTotal = 0;
            return [];
        }

        // 給定聲母（注音），回傳所有以此聲母開頭的合法拼音音節
        function getPinyinPoolForInitial(initialZhuyin) {
            if (!initialZhuyin) return [];
            const pool = new Set();
            for (const zhuyin in fullZhuyinToPinyin) {
                if (zhuyin.startsWith(initialZhuyin)) pool.add(fullZhuyinToPinyin[zhuyin]);
            }
            return [...pool];
        }

        // 給定韻部 label，回傳該家族（含借韻）所有合法拼音音節
        function getPinyinPoolForFamily(familyLabel) {
            const family = RHYME_FAMILIES.find(f => f.label === familyLabel);
            if (!family) return [];
            const pool = new Set();
            for (const zhuyin in fullZhuyinToPinyin) {
                const r = getZhuyinRhyme(zhuyin);
                if (family.rhymes.has(r)) pool.add(fullZhuyinToPinyin[zhuyin]);
            }
            return [...pool];
        }

        function filterWordsBySelectedChars(mode, minP) {
            if (!wordlistData || selectedChars.size === 0) return [];
            const savedSet = new Set(savedWords);
            const candidates = [];
            for (const entry of wordlistData) {
                if (entry.w.length < 2) continue;
                // if (entry.p < minP) continue;  // p 不準確（很多 p=0 並非冷僻），暫停使用
                if (sentCandidatesSet.has(entry.w)) continue;
                if (savedSet.has(entry.w)) continue;
                const syllables = entry.z.split(' ');
                if (syllables.length !== entry.w.length) continue;
                const targetChar = mode === 'rhyme' ? entry.w[entry.w.length - 1] : entry.w[0];
                if (!selectedChars.has(targetChar)) continue;
                candidates.push(entry.w);
            }
            for (let i = candidates.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
            }
            return candidates;
        }

        function getWordlistCandidatesSelected() {
            if (!wordlistData || selectedChars.size === 0) return null;
            /* 三層優先機制（暫時停用）
            for (const minP of [30, 10, 1]) {
                const all = filterWordsBySelectedChars(rhymeMode, minP);
                if (all.length > 0) {
                    lastCandidatesTotal = all.length;
                    return all.slice(0, 200);
                }
            }
            */
            const all = filterWordsBySelectedChars(rhymeMode, 1);
            if (all.length > 0) { lastCandidatesTotal = all.length; return all; } // 移除200上限
            lastCandidatesTotal = 0;
            return [];
        }

        function clearSelectedChars() {
            selectedChars.clear();
            document.querySelectorAll('.char-card.selected').forEach(c => c.classList.remove('selected'));
            updateBatchCount();
        }

        function updateSelectedCharsHint() {
            const hint = document.getElementById('selectedCharsHint');
            const display = document.getElementById('selectedCharsDisplay');
            if (!hint || !display) return;
            if (selectedChars.size > 0) {
                display.textContent = [...selectedChars].join('　');
                hint.style.display = 'flex';
            } else {
                hint.style.display = 'none';
            }
        }

        // 把 AI 回的文字切成詞：頓號、逗號、換行、空白都算分隔，只留 2～8 字
        function parseAiWords(text) {
            return String(text).split(/[，,、\n\s]+/).map(w => w.trim()).filter(w => w.length >= 2 && w.length <= 8);
        }

        // AI 只提供偏好順序，數量由程式保證：pool 夠大時 words.length 一定等於 target
        // 純函式（不碰 DOM、不讀全域，rank 由呼叫端傳入）：AI 亂編的池外詞在 picked 這步被丟掉，
        // 不足的部分依 rank 由高到低補滿（sort 穩定：同分維持池原順序）
        function fillToTarget(pool, aiPicks, target, rank = () => 0) {
            const all = [...new Set(pool)];
            const inPool = new Set(all);
            const picked = [...new Set(aiPicks)].filter(w => inPool.has(w)).slice(0, target);
            const pickedSet = new Set(picked);
            const filled = all.filter(w => !pickedSet.has(w)).sort((a, b) => rank(b) - rank(a)).slice(0, target - picked.length);
            return { words: [...picked, ...filled], picked: picked.length, filled: filled.length };
        }

        // 驗證 AI 生成詞是否符合當前韻腳要求
        function validateWordRhyme(word) {
            if (currentRhymes.length === 0) return false;
            if (currentRhymes.length === 1) {
                if (word.length < 2 || word.length > 8) return false;
                const checkChar = rhymeMode === 'rhyme' ? word[word.length - 1] : word[0];
                const req = currentRhymes[0];
                // 同字 filter：固定字位必須剛好等於搜尋字
                if (filterSameChar && req.char && checkChar !== req.char) return false;
                const infos = charInfo[checkChar] || [];
                if (!infos.length) return false;
                if (rhymeMode === 'rhyme') {
                    const reqFamilyId = RHYME_TO_FAMILY[req.rhyme];
                    if (reqFamilyId === undefined) return false;
                    return infos.some(info => RHYME_TO_FAMILY[info.zhuyin] === reqFamilyId);
                } else {
                    if (!req.initial) return false;
                    return infos.some(info => getZhuyinInitial(info.zhuyin) === req.initial);
                }
            } else {
                if (word.length !== currentRhymes.length) return false;
                for (let i = 0; i < word.length; i++) {
                    if (currentRhymes[i]?.isWild) continue;
                    const infos = charInfo[word[i]] || [];
                    if (!infos.length) return false;
                    const req = currentRhymes[i];
                    if (rhymeMode === 'rhyme') {
                        const reqFamilyId = RHYME_TO_FAMILY[req.rhyme];
                        if (!infos.some(info => RHYME_TO_FAMILY[getZhuyinRhyme(info.zhuyin)] === reqFamilyId)) return false;
                    } else {
                        if (!infos.some(info => getZhuyinInitial(info.zhuyin) === req.initial)) return false;
                    }
                }
                return true;
            }
        }

        // 取得詞語的注音（或拼音）加聲調，供 hover tooltip 顯示
        // 統一格式化：根據目前顯示模式（lastSearchType）輸出含聲調的注音或拼音
        // baseZhuyin: 不含聲調的注音音節（例 ㄔㄤ），tone: 1-5
        function fmtPhonetic(baseZhuyin, tone) {
            if (!baseZhuyin) return '';
            const usePinyin = lastSearchType === 'pinyin';
            if (usePinyin) {
                const py = zhuyinToPinyin(baseZhuyin);
                return py + (tone && tone > 0 ? tone : '');
            }
            const zyToneMarks = ['', '', 'ˊ', 'ˇ', 'ˋ', '˙'];
            return baseZhuyin + (zyToneMarks[tone] || '');
        }
        // 取得單字所有讀音（含聲調）的格式化陣列。
        // 排序原則：先依 polyphonicsOrderMap（破音字讀音順序表）為準，未列出的接在後面。
        // 回傳 [{text, tier}, ...]；hideRare 模式下會自動過濾 rare
        function getCharReadingsFormatted(char) {
            const infos = charInfo[char] || [];
            const _TONE_TO_MARK = ['', '', 'ˊ', 'ˇ', 'ˋ', '˙'];
            const rank = { common: 0, normal: 1, rare: 2 };
            // 用注音+聲調符號的形式當索引（與 polyphonicsOrderMap 的 key 一致）
            const byZyKey = new Map();
            for (const { zhuyin, tone, tier } of infos) {
                const zyKey = zhuyin + (_TONE_TO_MARK[tone] || '');
                const cur = byZyKey.get(zyKey);
                if (!cur || rank[tier] < rank[cur.tier]) byZyKey.set(zyKey, { zhuyin, tone, tier });
            }
            const ordered = [];
            const used = new Set();
            if (polyphonicsOrderMap && polyphonicsOrderMap.has(char)) {
                for (const zyKey of polyphonicsOrderMap.get(char)) {
                    if (byZyKey.has(zyKey)) { ordered.push(byZyKey.get(zyKey)); used.add(zyKey); }
                }
            }
            for (const [zyKey, v] of byZyKey) {
                if (!used.has(zyKey)) ordered.push(v);
            }
            const hideRare = document.getElementById('hideRare')?.checked;
            const seen = new Set();
            const out = [];
            for (const { zhuyin, tone, tier } of ordered) {
                if (hideRare && tier === 'rare') continue;
                const s = fmtPhonetic(zhuyin, tone);
                if (s && !seen.has(s)) { seen.add(s); out.push({ text: s, tier }); }
            }
            return out;
        }

        function getWordPhoneticDisplay(word) {
            const stored = wordPhoneticMap.get(word);
            const syllables = stored ? stored.split(' ') : [];
            const usePinyin = lastSearchType === 'pinyin';
            const parts = [...word].map((char, i) => {
                const raw = syllables[i] || (chineseDict[char] || [''])[0] || '';
                const base = stripTone(raw);
                // 詞庫帶聲調 → 直接取；否則 fallback 從 charInfo 用 base 推
                const wordlistTone = raw !== base ? getZhuyinTone(raw) : null;
                const infos = charInfo[char] || [];
                const matchInfo = wordlistTone
                    ? (infos.find(info => info.zhuyin === base && info.tone === wordlistTone) || infos.find(info => info.zhuyin === base) || infos[0])
                    : (infos.find(info => info.zhuyin === base) || infos[0]);
                const tone = wordlistTone || matchInfo?.tone || 0;
                return fmtPhonetic(base, tone);
            });
            if (usePinyin) {
                return parts.map(p => p ? p.charAt(0).toUpperCase() + p.slice(1) : p).join('-');
            }
            return parts.join('  ');
        }

