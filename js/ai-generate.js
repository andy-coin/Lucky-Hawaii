        // AI 生成補足詞（AI 造詞，不從詞庫選），驗證後顯示並標 "AI" 徽章
        async function generateAIWords(remaining, container, excludeSet) {
            const statusDiv = document.createElement('div');
            statusDiv.style.cssText = 'text-align:center;font-size:0.8rem;color:var(--text-secondary);padding:6px 0;width:100%;';
            statusDiv.textContent = 'AI 生成補充詞…';
            container.appendChild(statusDiv);

            const r0 = currentRhymes[0];
            let rhymeDesc, lenDesc;
            if (currentRhymes.length === 1) {
                lenDesc = '2～4字';
                if (filterSameChar) {
                    // 同字 filter：固定字位為搜尋字本身
                    const pos = rhymeMode === 'rhyme' ? '字尾' : '字首';
                    rhymeDesc = `請以「${r0.char || ''}」這個字為${pos}發想造詞（${pos}必須剛好是「${r0.char || ''}」這一個字）`;
                } else if (rhymeMode === 'rhyme') {
                    rhymeDesc = `末字押「${r0.char || ''}」的韻腳（韻部：${r0.familyLabel || ''}，韻母：${r0.rhyme || r0.zhuyin}）`;
                } else {
                    rhymeDesc = `首字聲母為「${r0.initial}」`;
                }
            } else {
                lenDesc = `${currentRhymes.length}字`;
                rhymeDesc = currentRhymes.map((r, i) =>
                    `第${i+1}字${rhymeMode === 'rhyme' ? '韻母' : '聲母'}：${rhymeMode === 'rhyme' ? (r.rhyme || r.zhuyin) : r.initial}`
                ).join('、');
            }

            const excludeStr = [...excludeSet].slice(0, 40).join('、') || '（無）';
            const prompt = `你是歌詞創作助手。請直接生成${remaining + 4}個押韻的中文詞語（多給幾個備篩選）：
字數：${lenDesc}
韻腳要求：${rhymeDesc}
禁止重複以下詞語：${excludeStr}
直接輸出詞語，頓號「、」分隔，不要說明或編號。`;

            const tryList = aiTryList();

            let aiWordsAdded = false, lastErr = null;
            for (const m of tryList) {
                try {
                    statusDiv.textContent = `AI 生成補充詞…（${m.label}）`;
                    const text = await callLLM(m, prompt);
                    const raw = text.split(/[，,、\n\s]+/).map(w => w.trim()).filter(w => w.length >= 2 && w.length <= 8);
                    const valid = raw.filter(w => !excludeSet.has(w) && !suggestedPool.has(w) && validateWordRhyme(w)).slice(0, remaining);
                    statusDiv.remove();
                    if (valid.length > 0) {
                        valid.forEach(w => suggestedPool.add(w));
                        const html = valid.map(w =>
                            `<div class="ai-word-card" data-word="${w}" onclick="saveWord('${w.replace(/'/g, "\\'")}')">${w}<span class="ai-badge">AI</span></div>`
                        ).join('');
                        const report = container.querySelector('.candidate-report');
                        if (report) report.insertAdjacentHTML('beforebegin', html);
                        else container.insertAdjacentHTML('beforeend', html);
                        aiWordsAdded = true;
                    }
                    break;
                } catch (e) { lhWarn('AI 造詞模型失敗，換下一個', e); lastErr = e; }
            }
            if (statusDiv.isConnected) statusDiv.remove();
            if (!aiWordsAdded) {
                const msg = document.createElement('div');
                msg.className = 'candidate-report';
                msg.style.fontStyle = 'italic';
                // AI 根本沒答成（連線、額度、全部忙碌）時顯示原因；AI 有答但沒有詞通過驗證才是「想不到」
                msg.textContent = lastErr ? (lastErr.plain ? lastErr.message : AI_FALLBACK_MSG) : '唉...ai也想不到更多符合的詞彙，你自己想吧...';
                const report = container.querySelector('.candidate-report');
                if (report) report.before(msg);
                else container.appendChild(msg);
            }
        }

        async function generateAISuggestions() {
            if (currentRhymes.length === 0) { showToast('請先在上方搜尋要押韻的字'); return; }

            const contextText = document.getElementById('contextDescription').value.trim();
            const hashtagStr = hashtags.length > 0 ? hashtags.map(t => '#' + t).join(' ') : '';
            const contextFull = [contextText, hashtagStr].filter(Boolean).join('　');
            const contextLine = contextFull ? `\n情境／風格：${contextFull}` : '';

            const searchVal = document.getElementById('searchInput').value.trim();
            const isSingleChineseChar = /^[一-鿿]$/.test(searchVal);

            const savedWordsLine = savedWords.length > 0
                ? `\n已保留詞（不可重複出現）：${savedWords.slice(-40).join('、')}`
                : '';
            const flexRule = '\n鼓勵天馬行空加入「發音上」押韻的英文、日文、韓文詞彙。';

            const lyricsText = lastLyricsSelection ||
                Array.from(document.querySelectorAll('.section-textarea'))
                    .map(ta => ta.value.trim()).filter(Boolean).join('\n');
            const lyricsLine = lyricsText ? `\n參考整篇歌詞風格：\n${lyricsText.slice(0, 600)}` : '';
            const hasContext = !!(contextFull || lyricsText);

            const btn = document.getElementById('generateBtn');
            const loading = document.getElementById('aiLoading');
            const container = document.getElementById('aiWordsContainer');

            btn.disabled = true;
            loading.style.display = 'block';
            container.innerHTML = '';

            let prompt;
            let usingWordlist = false;

            // 重建活躍累積池：移除已被 AI 選出或已保留的詞
            const _savedSet = new Set(savedWords);
            const activePool = cumulativeCandidates.filter(w => !suggestedPool.has(w) && !_savedSet.has(w));

            if (selectedChars.size > 0) {
                const newBatch = getWordlistCandidatesSelected(); // 詞庫未載入時回傳 null
                if (newBatch === null) {
                    showToast(wordlistLoading ? '詞庫載入中，請稍後再試' : '詞庫載入失敗，請重新整理頁面');
                    btn.disabled = false; loading.style.display = 'none'; return;
                }
                newBatch.forEach(w => sentCandidatesSet.add(w));
                cumulativeCandidates = [...activePool, ...newBatch];
                if (cumulativeCandidates.length === 0) {
                    if (_aiExtraRoundDone) {
                        container.innerHTML = `<div class="ai-exhausted">已推薦所有含選字的詞彙<button class="reset-pool-btn" onclick="resetSuggestedPool()">↺ 重置</button></div>`;
                        btn.disabled = false; loading.style.display = 'none'; return;
                    }
                    _aiExtraRoundDone = true;
                    btn.disabled = false; loading.style.display = 'none'; loading.textContent = 'AI 思考中…';
                    await generateAIWords(AI_TARGET, container, new Set([...suggestedPool, ...savedWords]));
                    return;
                }
                usingWordlist = true;
                lastCandidatesTotal = cumulativeCandidates.length;
                const posStr = rhymeMode === 'rhyme' ? '字尾' : '字首';
                const selectedCharsList = [...selectedChars].join('、');
                const ctxBlock = contextFull ? `\n【情境與#標籤】（請重點優先參考）：${contextFull}` : '';
                const lyricsBlock = lyricsText ? `\n【歌詞風格參考】：${lyricsText.slice(0, 200)}` : '';
                const savedBlock = savedWords.length > 0 ? `\n已保留（不可重複）：${savedWords.slice(-30).join('、')}` : '';
                prompt = `你是歌詞創作助手。以下詞語的${posStr}含有指定字，請挑選最適合此創作情境的詞語（必須挑滿 ${AI_TARGET} 個，候選詞充足時絕對不可少於 ${AI_TARGET}，少於即視為失敗）：

                候選詞：${cumulativeCandidates.join('、')}
                【指定${posStr}字】：${selectedCharsList}
                ${ctxBlock}${lyricsBlock}${savedBlock}
                直接輸出詞語，頓號「、」分隔，不要說明或編號。`;

            } else if (rhymeMode === 'rhyme') {
                const newBatch = (currentRhymes.length === 1 && !currentRhymes[0]?.isWild)
                    ? getWordlistCandidatesSingle()
                    : getWordlistCandidates(currentRhymes, currentRhymes.length);
                if (newBatch === null) {
                    showToast(wordlistLoading ? '詞庫載入中，請稍後再試' : '詞庫載入失敗，請重新整理頁面');
                    btn.disabled = false; loading.style.display = 'none'; return;
                }
                newBatch.forEach(w => sentCandidatesSet.add(w));
                cumulativeCandidates = [...activePool, ...newBatch];
                if (cumulativeCandidates.length === 0) {
                    if (_aiExtraRoundDone) {
                        container.innerHTML = `<div class="ai-exhausted">已推薦所有符合的詞彙<button class="reset-pool-btn" onclick="resetSuggestedPool()">↺ 重置</button></div>`;
                        btn.disabled = false; loading.style.display = 'none'; return;
                    }
                    _aiExtraRoundDone = true;
                    btn.disabled = false; loading.style.display = 'none'; loading.textContent = 'AI 思考中…';
                    await generateAIWords(AI_TARGET, container, new Set([...suggestedPool, ...savedWords]));
                    return;
                }
                usingWordlist = true;
                lastCandidatesTotal = cumulativeCandidates.length;
                const ctxBlock = contextFull ? `\n【情境與#標籤】（請重點優先參考）：${contextFull}` : '';
                const lyricsBlock = lyricsText ? `\n【歌詞風格參考】：${lyricsText.slice(0, 200)}` : '';
                const savedBlock = savedWords.length > 0 ? `\n已保留（不可重複）：${savedWords.slice(-30).join('、')}` : '';
                prompt = `你是歌詞創作助手。以下詞語的押韻符合要求，請挑選最適合此創作情境的詞語（必須挑滿 ${AI_TARGET} 個，候選詞充足時絕對不可少於 ${AI_TARGET}，少於即視為失敗）：

                候選詞：${cumulativeCandidates.join('、')}
                ${ctxBlock}${lyricsBlock}${savedBlock}
                直接輸出詞語，頓號「、」分隔，不要說明或編號。`;

            } else {
                // 子音押
                const newBatch = (currentRhymes.length === 1 && !currentRhymes[0]?.isWild)
                    ? getWordlistCandidatesSingle()
                    : getWordlistCandidatesInitial(currentRhymes, currentRhymes.length);
                if (newBatch === null) {
                    showToast(wordlistLoading ? '詞庫載入中，請稍後再試' : '詞庫載入失敗，請重新整理頁面');
                    btn.disabled = false; loading.style.display = 'none'; return;
                }
                newBatch.forEach(w => sentCandidatesSet.add(w));
                cumulativeCandidates = [...activePool, ...newBatch];
                if (cumulativeCandidates.length === 0) {
                    if (_aiExtraRoundDone) {
                        container.innerHTML = `<div class="ai-exhausted">已推薦所有符合的詞彙<button class="reset-pool-btn" onclick="resetSuggestedPool()">↺ 重置</button></div>`;
                        btn.disabled = false; loading.style.display = 'none'; return;
                    }
                    _aiExtraRoundDone = true;
                    btn.disabled = false; loading.style.display = 'none'; loading.textContent = 'AI 思考中…';
                    await generateAIWords(AI_TARGET, container, new Set([...suggestedPool, ...savedWords]));
                    return;
                }
                usingWordlist = true;
                lastCandidatesTotal = cumulativeCandidates.length;
                const ctxBlock = contextFull ? `\n【情境與#標籤】（請重點優先參考）：${contextFull}` : '';
                const lyricsBlock = lyricsText ? `\n【歌詞風格參考】：${lyricsText.slice(0, 200)}` : '';
                const savedBlock = savedWords.length > 0 ? `\n已保留（不可重複）：${savedWords.slice(-30).join('、')}` : '';
                prompt = `你是歌詞創作助手。以下詞語的聲母（字首）符合要求，請挑選最適合此創作情境的詞語（必須挑滿 ${AI_TARGET} 個，候選詞充足時絕對不可少於 ${AI_TARGET}，少於即視為失敗）：

                候選詞：${cumulativeCandidates.join('、')}
                ${ctxBlock}${lyricsBlock}${savedBlock}
                直接輸出詞語，頓號「、」分隔，不要說明或編號。`;
            }

            // 候選詞不足 AI_TARGET → 直接全數列出，再由 AI 補足
            if (usingWordlist && cumulativeCandidates.length > 0 && cumulativeCandidates.length < AI_TARGET) {
                const directWords = [...cumulativeCandidates];
                directWords.forEach(w => { suggestedPool.add(w); sentCandidatesSet.add(w); });
                const shownSet = new Set(directWords);
                container.innerHTML = directWords.map(w =>
                    `<div class="ai-word-card" data-word="${w}" onclick="saveWord('${w.replace(/'/g, "\\'")}')">${w}</div>`
                ).join('') + `<div class="candidate-report">共 ${directWords.length} 個候選詞，已全數列出</div>`;
                btn.disabled = false; loading.style.display = 'none'; loading.textContent = 'AI 思考中…';
                if (directWords.length < AI_TARGET) await generateAIWords(AI_TARGET - directWords.length, container, shownSet);
                return;
            }

            // 候選 >= AI_TARGET：只呼叫一次 AI 排序，數量由程式補滿（AI 亂回、少回、失敗都一樣給滿）
            const m = aiTryList()[0];
            let picks = [], aiErr = null;
            try {
                loading.textContent = `AI 思考中…（${m.label}）`;
                picks = parseAiWords(await callLLM(m, prompt));
            } catch (e) {
                lhWarn('AI 排序失敗，改依常用度補滿', e);
                aiErr = e;
            }
            const { words } = fillToTarget(cumulativeCandidates, picks, AI_TARGET, w => wordPriorityMap.get(w) ?? 0);
            words.forEach(w => { suggestedPool.add(w); sentCandidatesSet.add(w); });
            container.innerHTML = words.map(w =>
                `<div class="ai-word-card" data-word="${w}" onclick="saveWord('${w.replace(/'/g, "\\'")}')">${w}</div>`
            ).join('') + `<div class="candidate-report">從 ${lastCandidatesTotal} 個候選詞中，挑出 ${words.length} 個</div>`;
            if (aiErr) {
                // AI 沒排成就不假裝是正常結果；原因只在 Worker 白話訊息（e.plain）時附上，用 textContent 塞，不拼 HTML
                const hint = document.createElement('div');
                hint.className = 'candidate-report';
                hint.textContent = 'AI 暫時無法排序，先依常用度列出' + (aiErr.plain ? '（' + aiErr.message + '）' : '');
                container.appendChild(hint);
            }
            btn.disabled = false;
            loading.style.display = 'none';
            loading.textContent = 'AI 思考中…';
        }

        // ===== 從歌詞自動生成情境與標籤 =====
        document.addEventListener('mouseup', (e) => {
            if (e.target.classList.contains('section-textarea')) {
                const sel = e.target.value.substring(e.target.selectionStart, e.target.selectionEnd).trim();
                lastLyricsSelection = sel || '';
            }
        });

        async function generateContextFromLyrics() {
            const text = lastLyricsSelection ||
                Array.from(document.querySelectorAll('.section-textarea'))
                     .map(ta => ta.value.trim()).filter(Boolean).join('\n\n');

            if (!text) { showToast('左側歌詞是空的'); return; }

            const btn = document.querySelector('.context-refresh-btn');
            if (btn) { btn.disabled = true; }

            const prompt = `根據以下歌詞，只輸出下面兩行，不要其他文字：
                            情境：（用2到3句話描述歌曲的氛圍、情緒和場景，生動有畫面感，約40-60字）
                            標籤：標籤1,標籤2,標籤3,標籤4

                            不要加#符號，標籤之間用逗號分隔。

                            歌詞：
                            ${text.slice(0, 800)}`;

            try {
                // 沿用使用者選的模型 + 自動 fallback
                const tryList = aiTryList();
                let reply = null, lastErr = null;
                for (const m of tryList) {
                    try { reply = await callLLM(m, prompt); break; } catch (e) { lhWarn('情境生成模型失敗，換下一個', e); lastErr = e; }
                }
                if (!reply) throw lastErr || aiError(AI_FALLBACK_MSG);

                // 逐行解析，更穩健
                let gotContext = false, gotTags = false;
                for (const line of reply.split('\n')) {
                    const colon = line.indexOf('：') !== -1 ? '：' : ':';
                    const idx = line.indexOf(colon);
                    if (idx === -1) continue;
                    const key = line.slice(0, idx).replace(/\s/g, '');
                    const val = line.slice(idx + 1).trim();
                    if (!val) continue;

                    if (key.includes('情境') && !gotContext) {
                        document.getElementById('contextDescription').value = val;
                        gotContext = true;
                    } else if (key.includes('標籤') && !gotTags) {
                        const tags = val.split(/[,，、\s#]+/).map(t => t.trim()).filter(Boolean);
                        if (tags.length) {
                            hashtags = tags;
                            lhSet('haiku_hashtags', JSON.stringify(hashtags));
                            renderHashtags();
                            gotTags = true;
                        }
                    }
                }
                showToast(gotContext || gotTags ? '情境與標籤已更新 ✓' : '格式異常，請再試一次');
            } catch(e) {
                lhWarn('情境生成失敗', e);
                showToast(e.plain ? e.message : '生成失敗，請再試一次', 4000);
            } finally {
                if (btn) { btn.disabled = false; }
            }
        }

