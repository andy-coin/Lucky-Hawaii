        // ==================== 注音優先核心函數 ====================
        
        // 從注音字串提取聲母
        function getZhuyinInitial(zhuyin) {
            if (!zhuyin || zhuyin.length === 0) return '';
            if (zhuyinInitialSet.has(zhuyin[0])) {
                return zhuyin[0];
            }
            return ''; // 無聲母（如 ㄢ, ㄧ 等）
        }
        
        // 從注音字串提取韻母
        // 聲調符號統一表（1聲省略 / ˉ）
        const TONE_MARK_RE = /[ˊˇˋ˙ˉ]/g;
        const TONE_TAIL_RE = /[ˊˇˋ˙ˉ]$/;
        const TONE_CHAR_TO_INT = { 'ˉ': 1, 'ˊ': 2, 'ˇ': 3, 'ˋ': 4, '˙': 5 };
        function stripTone(zy) {
            return zy ? zy.replace(TONE_MARK_RE, '') : zy;
        }
        function getZhuyinTone(zy) {
            if (!zy) return 1;
            const last = zy[zy.length - 1];
            return TONE_CHAR_TO_INT[last] || 1;
        }

        function getZhuyinRhyme(zhuyin) {
            if (!zhuyin || zhuyin.length === 0) return '';
            const base = stripTone(zhuyin);
            if (!base) return '';
            if (zhuyinInitialSet.has(base[0])) {
                const rhyme = base.substring(1);
                return rhyme || base; // 純聲母（如 ㄓ=知）時回傳整個
            }
            return base; // 整個都是韻母
        }
        
        function pinyinToZhuyinGroups(pinyin) {
            pinyin = pinyin.toLowerCase().trim();
            if (!pinyin) return [];

            // 1. 完整音節精確匹配
            if (fullPinyinToZhuyin[pinyin]) {
                // 直接查到（如 ban→[ㄅㄢ], nu→[ㄋㄨ,ㄋㄩ]）
                const results = [];
                const seenRhymes = new Set();
                for (const zy of fullPinyinToZhuyin[pinyin]) {
                    const rhyme = getZhuyinRhyme(zy);
                    if (!seenRhymes.has(rhyme)) {
                        seenRhymes.add(rhyme);
                        results.push({ zhuyin: zy, rhyme: rhyme, type: 'exact' });
                    }
                }
                return results;
            }

            // 2. 純拼音聲母（b, zh, sh...）
            if (pinyinInitialToZhuyin[pinyin]) {
                return [{ zhuyin: pinyinInitialToZhuyin[pinyin], type: 'initial' }];
            }

            // 3. 韻尾搜尋：找所有拼音結尾匹配的音節，收集不重複的注音韻母
            const seenRhymes = new Set();
            const results = [];
            for (const [py, zhuyinList] of Object.entries(fullPinyinToZhuyin)) {
                if (py.endsWith(pinyin) && py !== pinyin) {
                    for (const zy of zhuyinList) {
                        const rhyme = getZhuyinRhyme(zy);
                        if (!seenRhymes.has(rhyme)) {
                            seenRhymes.add(rhyme);
                            results.push({ zhuyin: rhyme, rhyme: rhyme, type: 'rhyme' });
                        }
                    }
                }
            }
            return results;
        }

        // 向下相容：單一結果版本（供顯示等用途）
        function pinyinToZhuyin(pinyin) {
            const groups = pinyinToZhuyinGroups(pinyin);
            if (groups.length === 0) return '';
            return groups[0].zhuyin;
        }

        // 注音 → 拼音（用於顯示）— 使用完整查找表
        function zhuyinToPinyin(zhuyin) {
            if (!zhuyin) return '';
            // 直接查完整音節
            if (fullZhuyinToPinyin[zhuyin]) return fullZhuyinToPinyin[zhuyin];
            // 拆成聲母+韻母查找
            const initial = getZhuyinInitial(zhuyin);
            const rhyme = getZhuyinRhyme(zhuyin);
            if (initial && initial !== zhuyin) {
                const fullKey = initial + (rhyme !== zhuyin ? rhyme : '');
                if (fullZhuyinToPinyin[fullKey]) return fullZhuyinToPinyin[fullKey];
            }
            // 純聲母（如 ㄓ/ㄔ/ㄕ/ㄖ 或 ㄅ/ㄆ/ㄇ…）：先查 zhuyinInitialToPinyin
            if (zhuyinInitialToPinyin[zhuyin]) return zhuyinInitialToPinyin[zhuyin];
            if (initial && rhyme === zhuyin) {
                if (fullZhuyinToPinyin[initial]) return fullZhuyinToPinyin[initial];
                if (zhuyinInitialToPinyin[initial]) return zhuyinInitialToPinyin[initial];
            }
            return zhuyin; // fallback
        }

        function isPinyinInitial(input) {
            return !!pinyinInitialToZhuyin[input.toLowerCase()];
        }
        
        // 判斷輸入是否為注音聲母
        function isZhuyinInitial(input) {
            return zhuyinInitialSet.has(input);
        }
        
        // 主搜尋邏輯（注音優先）
        function searchRhyme(input) {
            if (!input) { searchedTerms = []; return []; }
            input = input.trim();
            if (input !== lastSearchInput) { suggestedPool.clear(); sentCandidatesSet.clear(); cumulativeCandidates = []; }
            lastSearchInput = input;
            const isBopomofo = /[ㄅ-ㄩ]/.test(input);
            const hasChinese = /[\u4e00-\u9fff]/.test(input);
            if (inputMode === 'pinyin') lastSearchType = 'pinyin';
            else if (inputMode === 'zhuyin') lastSearchType = 'bopomofo';
            else lastSearchType = (isBopomofo || hasChinese) ? 'bopomofo' : 'pinyin';
            
            const queries = input.split(/\s+/);
            const allResults = [];
            const seenChars = new Set();
            searchedTerms = [];
            let gOff = 0;

            // 同字同 base 可能對應多個 tone（破音字如潛、著），逐 tone 展開
            function _tonesFor(char, zy) {
                const infos = (charInfo[char] || []).filter(i => i.zhuyin === zy);
                return infos.length ? infos : [{ tone: 0, tier: 'normal' }];
            }
            function _pushExpanded(char, zy, extra) {
                for (const { tone, tier } of _tonesFor(char, zy)) {
                    const key = char + zy + tone;
                    if (seenChars.has(key)) continue;
                    seenChars.add(key);
                    allResults.push({
                        char, zhuyin: zy, pinyin: zhuyinToPinyin(zy),
                        tone, tier, ...extra
                    });
                }
            }

            // === 輔助：從字典匹配韻母列表 ===
            function collectByRhymes(rhymeList, initials, groupIdx) {
                const rhymeSet = new Set(rhymeList);
                for (let char in chineseDict) {
                    for (let zy of chineseDict[char]) {
                        const rh = getZhuyinRhyme(zy);
                        const ini = getZhuyinInitial(zy);
                        if (rhymeSet.has(rh) && (!initials || initials.has(ini))) {
                            _pushExpanded(char, zy, {
                                zhuyinRhyme: rh, zhuyinInitial: ini, rhymeIndex: groupIdx
                            });
                        }
                    }
                }
            }
            
            // === 韻母搜尋（借韻展開，全部歸為同一組）===
            // 同聲韻並列時由 displayResults 按子音重新分組
            function expandBorrow(targetRhyme, queryLabel) {
                const borrowed = BORROW_MAP[targetRhyme];
                const allRhymes = borrowed || [targetRhyme];
                const idx = gOff;
                searchedTerms.push({
                    original: queryLabel, zhuyin: targetRhyme,
                    isInitial: false, isRhymeSearch: true, index: idx
                });
                collectByRhymes(allRhymes, null, idx);
                gOff++;
            }
            
            // === 子音搜尋（按韻母家族分組上色）===
            function searchByInitial(targetInitial, queryLabel) {
                const familyGroups = {};
                for (let char in chineseDict) {
                    for (let zy of chineseDict[char]) {
                        if (getZhuyinInitial(zy) !== targetInitial) continue;
                        const rh = getZhuyinRhyme(zy);
                        const famId = RHYME_TO_FAMILY[rh] !== undefined ? RHYME_TO_FAMILY[rh] : -1;
                        for (const { tone, tier } of _tonesFor(char, zy)) {
                            const key = char + zy + tone;
                            if (seenChars.has(key)) continue;
                            seenChars.add(key);
                            if (!familyGroups[famId]) familyGroups[famId] = [];
                            familyGroups[famId].push({
                                char, zhuyin: zy, pinyin: zhuyinToPinyin(zy),
                                zhuyinRhyme: rh, zhuyinInitial: targetInitial,
                                tone, tier
                            });
                        }
                    }
                }
                const sortedFamIds = Object.keys(familyGroups).sort((a, b) => parseInt(a) - parseInt(b));
                sortedFamIds.forEach(famId => {
                    const fam = RHYME_FAMILIES[parseInt(famId)];
                    const idx = gOff;
                    // 收集本組實際出現的韻母名稱
                    const rhymesInGroup = [...new Set(familyGroups[famId].map(it => it.zhuyinRhyme))];
                    searchedTerms.push({
                        original: queryLabel,
                        zhuyin: fam ? fam.label : '/',
                        rhymeMembers: rhymesInGroup,
                        isInitial: true, isRhymeSearch: false, index: idx
                    });
                    familyGroups[famId].forEach(item => {
                        item.rhymeIndex = idx;
                        allResults.push(item);
                    });
                    gOff++;
                });
            }
            
            // === 子音+介音搜尋（如 bi/bu/ju）===
            function searchByInitialMedial(targetInitial, medial, queryLabel) {
                const familyGroups = {};
                for (let char in chineseDict) {
                    for (let zy of chineseDict[char]) {
                        const ini = getZhuyinInitial(zy);
                        const rh = getZhuyinRhyme(zy);
                        if (!(ini === targetInitial && (rh === medial || rh.startsWith(medial)))) continue;
                        const famId = RHYME_TO_FAMILY[rh] !== undefined ? RHYME_TO_FAMILY[rh] : -1;
                        for (const { tone, tier } of _tonesFor(char, zy)) {
                            const key = char + zy + tone;
                            if (seenChars.has(key)) continue;
                            seenChars.add(key);
                            if (!familyGroups[famId]) familyGroups[famId] = [];
                            familyGroups[famId].push({
                                char, zhuyin: zy, pinyin: zhuyinToPinyin(zy),
                                zhuyinRhyme: rh, zhuyinInitial: ini,
                                tone, tier
                            });
                        }
                    }
                }
                const sortedFamIds = Object.keys(familyGroups).sort((a, b) => parseInt(a) - parseInt(b));
                sortedFamIds.forEach(famId => {
                    const fam = RHYME_FAMILIES[parseInt(famId)];
                    const idx = gOff;
                    const rhymesInGroup = [...new Set(familyGroups[famId].map(it => it.zhuyinRhyme))];
                    searchedTerms.push({
                        original: queryLabel,
                        zhuyin: fam ? fam.label : '/',
                        rhymeMembers: rhymesInGroup,
                        isInitial: true, isRhymeSearch: false, index: idx
                    });
                    familyGroups[famId].forEach(item => {
                        item.rhymeIndex = idx;
                        allResults.push(item);
                    });
                    gOff++;
                });
            }
            
            // === PINYIN_SPECIAL 分組匹配（韻母組分色）===
            function matchSpecial(groups) {
                groups.forEach((sg) => {
                    const idx = gOff;
                    searchedTerms.push({
                        original: sg.label, zhuyin: sg.label,
                        isInitial: false, isRhymeSearch: false, index: idx
                    });
                    const rhymeSet = new Set(sg.rhymes);
                    for (let char in chineseDict) {
                        for (let zy of chineseDict[char]) {
                            const rh = getZhuyinRhyme(zy);
                            const ini = getZhuyinInitial(zy);
                            if (rhymeSet.has(rh) && (!sg.initials || sg.initials.has(ini))) {
                                _pushExpanded(char, zy, {
                                    zhuyinRhyme: rh, zhuyinInitial: ini, rhymeIndex: idx
                                });
                            }
                        }
                    }
                    gOff++;
                });
            }
            
            // === uo 特殊處理（*ㄨㄛ + ㄅㄛ/ㄆㄛ/ㄇㄛ，按子音分組）===
            function matchUo() {
                const idx = gOff;
                const bpmfSet = new Set(['ㄅ','ㄆ','ㄇ']);
                searchedTerms.push({
                    original: 'uo', zhuyin: 'ㄨㄛ',
                    isInitial: false, isRhymeSearch: true, index: idx
                });
                for (let char in chineseDict) {
                    for (let zy of chineseDict[char]) {
                        const rh = getZhuyinRhyme(zy);
                        const ini = getZhuyinInitial(zy);
                        if (rh === 'ㄨㄛ' || (rh === 'ㄛ' && bpmfSet.has(ini))) {
                            _pushExpanded(char, zy, {
                                zhuyinRhyme: rh, zhuyinInitial: ini, rhymeIndex: idx
                            });
                        }
                    }
                }
                gOff++;
            }

            // === 主流程 ===
            queries.forEach((query) => {
                // 0. 漢字反查：偵測到漢字時，查出韻母後走借韻
                const hasChinese = /[\u4e00-\u9fff]/.test(query);
                if (hasChinese) {
                    const rhymesFound = new Set();
                    const initialsFound = new Set();
                    for (const ch of query) {
                        if (/[\u4e00-\u9fff]/.test(ch) && chineseDict[ch]) {
                            // \u82e5\u4f7f\u7528\u8005\u900f\u904e chip \u9078\u5b9a\u4e86\u7834\u97f3\u5b57\u8b80\u97f3\uff0c\u53ea\u7528\u8a72\u8b80\u97f3
                            let zys = chineseDict[ch];
                            if (_polyphonic.char === ch && _polyphonic.reading) {
                                const baseZ = _polyphonic.reading.replace(/[\u02ca\u02c7\u02cb\u02d9]$/, '');
                                const filtered = zys.filter(z => z === baseZ);
                                if (filtered.length) zys = filtered;
                            }
                            for (const zy of zys) {
                                const ini = getZhuyinInitial(zy);
                                const rh = getZhuyinRhyme(zy);
                                if (ini && rh === zy) {
                                    // 純聲母字（如 知=ㄓ）→ 用聲母搜尋
                                    initialsFound.add(ini);
                                } else if (rh) {
                                    rhymesFound.add(rh);
                                }
                            }
                        }
                    }
                    initialsFound.forEach(ini => {
                        searchByInitial(ini, query + `→${ini}`);
                    });
                    rhymesFound.forEach(rh => {
                        expandBorrow(rh, query + `→${rh}`);
                    });
                    return;
                }
                
                const queryIsBopomofo = inputMode === 'zhuyin' ? true : inputMode === 'pinyin' ? false : /[ㄅ-ㄩ]/.test(query);
                
                if (queryIsBopomofo) {
                    const zy = query;
                    const isSingleInitial = zy.length === 1 && zhuyinInitialSet.has(zy);
                    
                    if (isSingleInitial) {
                        searchByInitial(zy, query);
                    } else {
                        let targetRhyme = zy;
                        if (zy.length > 1 && zhuyinInitialSet.has(zy[0])) {
                            targetRhyme = zy.substring(1);
                        }
                        expandBorrow(targetRhyme, query);
                    }
                } else {
                    const py = query.toLowerCase();
                    
                    // 1. uo 特殊處理
                    if (py === 'uo') { matchUo(); return; }
                    
                    // 2. 拼音特殊搜尋（ng, uan, un）
                    if (PINYIN_SPECIAL[py]) {
                        matchSpecial(PINYIN_SPECIAL[py]);
                        return;
                    }
                    
                    // 3. 拼音韻母對照表 → 轉注音 → 走借韻
                    if (PINYIN_RHYME_MAP[py]) {
                        expandBorrow(PINYIN_RHYME_MAP[py], query);
                        return;
                    }
                    
                    // 4. 完整拼音音節
                    const groups = pinyinToZhuyinGroups(py);
                    if (groups.length === 0) return;
                    
                    const isInitialSearch = groups.length === 1 && groups[0].type === 'initial';
                    
                    if (isInitialSearch) {
                        searchByInitial(groups[0].zhuyin, query);
                    } else if (groups.length === 1) {
                        const g = groups[0];
                        const gInitial = getZhuyinInitial(g.zhuyin);
                        const gRhyme = g.rhyme || getZhuyinRhyme(g.zhuyin);
                        const medials = new Set(['ㄧ', 'ㄨ', 'ㄩ']);
                        if (gInitial && medials.has(gRhyme) && g.type === 'exact') {
                            searchByInitialMedial(gInitial, gRhyme, query);
                        } else {
                            expandBorrow(gRhyme, query);
                        }
                    } else {
                        groups.forEach((g) => {
                            const targetRhyme = g.rhyme || g.zhuyin;
                            expandBorrow(targetRhyme, query);
                        });
                    }
                }
            });
            
            return allResults;
        }

