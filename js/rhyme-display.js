        function updateAIRhymeDisplay(input) {
            const display = document.getElementById('aiRhymeDisplay');
            if (!display) return;
            const trimmed = input.trim();
            if (!trimmed) {
                display.innerHTML = '請先搜尋一個字確認韻腳';
                currentRhymes = [];
                updateModeButtonLabels();
                return;
            }
            // 取所有 CJK 字元與萬用字元 *，依出現順序保留
            const chars = [...trimmed].filter(c => /[一-鿿]/.test(c) || c === '*');
            const hasCJK = chars.some(c => c !== '*');
            currentRhymes = [];

            if (!hasCJK) {
                // 注音/拼音直接搜尋：從 searchedTerms 建立 currentRhymes
                const seen = new Set();
                for (const term of searchedTerms) {
                    if (seen.has(term.original)) continue;
                    seen.add(term.original);
                    if (term.isInitial) {
                        // 聲母搜尋
                        const zyInitial = zhuyinInitialSet.has(term.original)
                            ? term.original
                            : (pinyinInitialToZhuyin[term.original.toLowerCase()] || term.original);
                        currentRhymes.push({
                            char: term.original, zhuyin: zyInitial,
                            initial: zyInitial, rhyme: '', familyLabel: zyInitial
                        });
                    } else {
                        // 韻母搜尋
                        const rhyme = term.zhuyin;
                        const familyId = RHYME_TO_FAMILY[rhyme];
                        const familyLabel = familyId !== undefined ? RHYME_FAMILIES[familyId].label : rhyme;
                        // 純韻母輸入沒有聲母，押字首模式 fallback：取介音或韻母本身
                        // （與 CJK 分支對純韻字如「唉」=ㄞ 的處理一致）
                        const effInitial = rhyme[0] === 'ㄩ' ? 'ㄩ'
                            : rhyme[0] === 'ㄧ' ? 'ㄧ'
                            : rhyme[0] === 'ㄨ' ? 'ㄨ'
                            : rhyme;
                        currentRhymes.push({
                            char: term.original, zhuyin: rhyme,
                            initial: effInitial, rhyme, familyLabel
                        });
                    }
                }
            } else {
                // 整詞查詞庫（解決破音字問題）；找不到才逐字取第一讀音
                const word = chars.join('');
                let wordlistSyllables = null;
                if (wordPhoneticMap && word.length > 1) {
                    const z = wordPhoneticMap.get(word);
                    if (z) {
                        const syl = z.split(' ');
                        if (syl.length === chars.length) wordlistSyllables = syl;
                    }
                }

                for (let i = 0; i < chars.length; i++) {
                    const char = chars[i];
                    if (char === '*') {
                        currentRhymes.push({ char: '*', isWild: true, zhuyin: '', initial: '', rhyme: '', familyLabel: '' });
                        continue;
                    }
                    let zhuyin;
                    if (wordlistSyllables) {
                        zhuyin = stripTone(wordlistSyllables[i]);
                    } else {
                        const zhuyins = chineseDict[char];
                        if (!zhuyins || zhuyins.length === 0) {
                            currentRhymes.push({ char, zhuyin: '', initial: '', rhyme: '', familyLabel: '', notFound: true });
                            continue;
                        }
                        // 破音字讀音選擇優先順序：
                        // 1. 使用者點選的 chip（_polyphonic）
                        // 2. polyphonicsOrderMap 定義的主要讀音（第一個）
                        // 3. dict 第一個（fallback）
                        if (_polyphonic.char === char && _polyphonic.reading) {
                            const base = _polyphonic.reading.replace(/[ˊˇˋ˙]$/, '');
                            zhuyin = zhuyins.includes(base) ? base : zhuyins[0];
                        } else if (polyphonicsOrderMap && polyphonicsOrderMap.has(char)) {
                            const primaryBase = polyphonicsOrderMap.get(char)[0].replace(/[ˊˇˋ˙]$/, '');
                            zhuyin = zhuyins.includes(primaryBase) ? primaryBase : zhuyins[0];
                        } else {
                            zhuyin = zhuyins[0];
                        }
                    }
                    const initial = getZhuyinInitial(zhuyin);
                    const rhyme = getZhuyinRhyme(zhuyin);
                    // 子音 = 聲母（有）或起始音節（ㄩ/ㄧ/ㄨ 介音，或直接是韻母如 ㄢ）
                    const effectiveInitial = initial ||
                        (zhuyin[0] === 'ㄩ' ? 'ㄩ' :
                         zhuyin[0] === 'ㄧ' ? 'ㄧ' :
                         zhuyin[0] === 'ㄨ' ? 'ㄨ' : rhyme);
                    const familyId = RHYME_TO_FAMILY[rhyme];
                    const familyLabel = familyId !== undefined ? RHYME_FAMILIES[familyId].label : rhyme;
                    currentRhymes.push({ char, zhuyin, initial: effectiveInitial, rhyme, familyLabel });
                }
            }

            if (currentRhymes.length === 0) {
                display.innerHTML = '無法識別韻腳';
                updateModeButtonLabels();
                return;
            }
            if (currentRhymes.every(r => r.notFound)) {
                const btns = currentRhymes.map(r =>
                    `「${r.char}」<button class="report-char-btn" onclick="reportMissingChar('${r.char}')">回報</button>`
                ).join('、');
                display.innerHTML = `無法識別韻腳：${btns}`;
                currentRhymes = [];
                updateModeButtonLabels();
                return;
            }
            renderRhymeDisplay();
        }

        function renderRhymeDisplay() {
            const display = document.getElementById('aiRhymeDisplay');
            if (!display || currentRhymes.length === 0) return;
            const usePinyin = lastSearchType === 'pinyin';
            const fmt = zy => usePinyin ? zhuyinToPinyin(zy) : zy;
            if (rhymeMode === 'rhyme') {
                const parts = currentRhymes.map(r => r.isWild
                    ? `<span class="rhyme-label" style="opacity:0.4">＊</span>`
                    : r.notFound
                        ? `<span class="rhyme-not-found" title="${r.char} 未收錄於字庫">∅<button class="report-char-btn" onclick="reportMissingChar('${r.char}')">回報</button></span>`
                        : `<span class="rhyme-label">${fmt(r.rhyme)}</span><span style="font-size:0.72rem;color:var(--text-secondary)"> (${fmt(r.zhuyin)})</span>`
                );
                display.innerHTML = '母音　' + parts.join('　');
            } else {
                const parts = currentRhymes.map(r => {
                    if (r.isWild) return `<span class="rhyme-label" style="opacity:0.4">＊</span>`;
                    if (r.notFound) return `<span class="rhyme-not-found" title="${r.char} 未收錄於字庫">∅<button class="report-char-btn" onclick="reportMissingChar('${r.char}')">回報</button></span>`;
                    return r.initial
                        ? `<span class="rhyme-label">${fmt(r.initial)}</span>`
                        : `<span style="font-size:0.72rem;color:var(--text-secondary)">∅</span>`;
                });
                display.innerHTML = '子音　' + (parts.length ? parts.join('　') : '<span style="font-size:0.82rem;color:var(--text-secondary)">無聲母</span>');
            }
            // 搜尋過後韻腳搬到 AI 面板的標題列（固定在頂端，捲到下面的詞卡也看得到）
            if (!display.classList.contains('in-title')) {
                const t = document.querySelector('#rightPanel .ai-title-group');
                if (t) { t.after(display); display.classList.add('in-title'); }
            }
            display.title = display.textContent.replace(/回報/g, '').trim();
            updateModeButtonLabels();
        }

        function setRhymeMode(mode) {
            // 換押母音／押子音：候選池要整個清掉，不然上一種模式的詞會混進來（跳樓：押母音後換押子音，押母音的詞跑進來）
            if (mode !== rhymeMode) resetSuggestedPool();
            rhymeMode = mode;
            document.getElementById('modeRhyme').classList.toggle('active', mode === 'rhyme');
            document.getElementById('modeInitial').classList.toggle('active', mode === 'initial');
            renderRhymeDisplay();
        }

        function reportMissingChar(char) {
            postFeedback({ type: 'word-report', word: char, reportType: '缺字' });
            showToast(`已回報缺字「${char}」`);
        }

