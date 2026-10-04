        // AI 字卡（isAI 時加 AI 徽章）；保留字串樣板，smoke 掃原始碼找 onclick="saveWord(" 的處理器名
        // 詞可能來自詞庫或後台 overrides，這裡自己負責跳脫：
        //   HTML：& < > " ' 轉實體（屬性與內文兩處都用）
        //   JS 字串：JSON.stringify 處理反斜線、引號與換行，再整段做 HTML 跳脫放進 onclick 屬性
        function aiWordCardHtml(w, isAI) {
            const escHtml = s => s.replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
            const jsArg = escHtml(JSON.stringify(w));
            return `<div class="ai-word-card" data-word="${escHtml(w)}" onclick="saveWord(${jsArg})">${escHtml(w)}${isAI ? '<span class="ai-badge">AI</span>' : ''}</div>`;
        }

        // AI 生成補足詞（AI 造詞，不從詞庫選），驗證後顯示並標 "AI" 徽章
        async function generateAIWords(remaining, container, excludeSet, stale = () => false) {
            const statusDiv = document.createElement('div');
            statusDiv.style.cssText = 'text-align:center;font-size:0.8rem;color:var(--text-secondary);padding:0.375rem 0;width:100%;';
            statusDiv.textContent = 'AI 生成補充詞…';
            container.appendChild(statusDiv);

            const prompt = buildGenPrompt(remaining, excludeSet);

            // 一次按鈕只問一次（D-05）；換模型由 Worker 負責，這裡只取一個
            const m = aiTryList()[0];
            const report = () => container.querySelector('.candidate-report');
            const showMsg = text => {
                const msg = document.createElement('div');
                msg.className = 'candidate-report';
                msg.style.fontStyle = 'italic';
                msg.textContent = text;
                const r = report();
                if (r) r.before(msg);
                else container.appendChild(msg);
            };
            let text;
            try {
                statusDiv.textContent = `AI 生成補充詞…（${m.label}）`;
                text = await callLLM(m, prompt);
            } catch (e) {
                lhWarn('AI 造詞失敗', e);
                statusDiv.remove();
                if (stale()) return null;   // 這次按鈕已作廢，不在新面板留訊息
                // AI 根本沒答成（連線、額度、全部忙碌）時顯示原因
                showMsg(e.plain ? e.message : AI_FALLBACK_MSG);
                return null;
            }
            statusDiv.remove();
            if (stale()) return null;   // 等 AI 期間換了搜尋／篩選／重置：不動畫面、不進池子

            // 每個詞都要先過 generatedWordOk 才能進樣板；不合格的只記 log，不顯示（D-08）
            const raw = parseAiWords(text);
            const seen = new Set();
            const kept = [];
            for (const w of raw) {
                if (seen.has(w)) continue;
                seen.add(w);
                if (excludeSet.has(w) || suggestedPool.has(w) || savedWords.includes(w)) continue;
                if (!generatedWordOk(w)) continue;
                kept.push(w);
                if (kept.length >= remaining) break;
            }
            if (raw.length > kept.length) lhWarn(`AI 造詞：丟棄 ${raw.length - kept.length} 個不合格、重複或超出數量的詞`);

            if (kept.length === 0) {
                // AI 有答但沒有詞通過驗證才是「想不到」
                showMsg('唉...ai也想不到更多符合的詞彙，你自己想吧...');
                return 0;
            }
            kept.forEach(w => { suggestedPool.add(w); sentCandidatesSet.add(w); });
            const html = kept.map(w => aiWordCardHtml(w, true)).join('');
            const r = report();
            if (r) r.insertAdjacentHTML('beforebegin', html);
            else container.insertAdjacentHTML('beforeend', html);
            return kept.length;
        }

        async function generateAISuggestions() {
            if (currentRhymes.length === 0) { showToast('請先在上方搜尋要押韻的字'); return; }

            const contextText = document.getElementById('contextDescription').value.trim();
            const hashtagStr = hashtags.length > 0 ? hashtags.map(t => '#' + t).join(' ') : '';
            const contextFull = [contextText, hashtagStr].filter(Boolean).join('　');
            const lyricsText = lastLyricsSelection ||
                Array.from(document.querySelectorAll('.section-textarea'))
                    .map(ta => ta.value.trim()).filter(Boolean).join('\n');

            const btn = document.getElementById('generateBtn');
            const loading = document.getElementById('aiLoading');
            const container = document.getElementById('aiWordsContainer');

            btn.disabled = true;
            loading.style.display = 'block';
            container.innerHTML = '';

            // 這次按鈕的快照：任何 await 之後只要搜尋、韻腳模式、篩選或重置變了就作廢（不碰畫面與池子）
            const snapEpoch = _aiEpoch, snapRhymes = currentRhymes, snapMode = rhymeMode;
            const stale = () => _aiEpoch !== snapEpoch || currentRhymes !== snapRhymes || rhymeMode !== snapMode;

            try {
                // 詞庫還在載入就等同一個載入；等完才算候選，絕不把「還沒載好」當成候選太少而造詞
                if (wordlistData === null) {
                    loading.textContent = '詞庫載入中…';
                    await loadWordlist();
                    loading.textContent = 'AI 思考中…';
                    if (stale()) return;   // 等待期間換了搜尋，這次作廢
                    if (wordlistData === null) { showToast('詞庫載入失敗，請重新整理頁面'); return; }
                }
                // 候選來源：選字 → 單字（非萬用）→ 押母音 → 押子音
                const newBatch = selectedChars.size > 0 ? getWordlistCandidatesSelected()
                    : (currentRhymes.length === 1 && !currentRhymes[0]?.isWild) ? getWordlistCandidatesSingle()
                    : rhymeMode === 'rhyme' ? getWordlistCandidates(currentRhymes, currentRhymes.length)
                    : getWordlistCandidatesInitial(currentRhymes, currentRhymes.length);
                if (newBatch === null) { showToast('詞庫載入失敗，請重新整理頁面'); return; }

                // 活躍累積池：移除已被推薦或已保留的詞，新候選排前面
                const savedSet = new Set(savedWords);
                const activePool = cumulativeCandidates.filter(w => !suggestedPool.has(w) && !savedSet.has(w));
                newBatch.forEach(w => sentCandidatesSet.add(w));
                const pool = [...new Set([...newBatch, ...activePool])];
                cumulativeCandidates = pool;
                lastCandidatesTotal = pool.length;

                // 填滿或造詞只差這一個比較：造詞只在池子不夠時才走到（D-03）
                if (pool.length >= AI_TARGET) {
                    const posStr = rhymeMode === 'rhyme' ? '字尾' : '字首';
                    const lead = selectedChars.size > 0 ? `以下詞語的${posStr}含有指定字`
                        : rhymeMode === 'rhyme' ? '以下詞語的押韻符合要求' : '以下詞語的聲母（字首）符合要求';
                    const selectedLine = selectedChars.size > 0 ? `\n【指定${posStr}字】：${[...selectedChars].join('、')}` : '';
                    const ctxBlock = contextFull ? `\n【情境與#標籤】（請重點優先參考）：${contextFull}` : '';
                    const lyricsBlock = lyricsText ? `\n【歌詞風格參考】：${lyricsText.slice(0, 200)}` : '';
                    const savedBlock = savedWords.length > 0 ? `\n已保留（不可重複）：${savedWords.slice(-30).join('、')}` : '';
                    // 只限制送給 AI 的清單；補滿仍用整個候選池（AI_POOL_MAX）
                    const prompt = `你是歌詞創作助手。${lead}，請挑出最適合此創作情境的 ${AI_TARGET} 個詞語，最適合的排前面。
候選詞：${pool.slice(0, AI_POOL_MAX).join('、')}${selectedLine}${ctxBlock}${lyricsBlock}${savedBlock}
直接輸出詞語，頓號「、」分隔，不要說明或編號。`;

                    // 只呼叫一次 AI 排序，數量由程式補滿（AI 亂回、少回、失敗都一樣給滿）
                    const m = aiTryList()[0];
                    let picks = [], aiErr = null;
                    try {
                        loading.textContent = `AI 思考中…（${m.label}）`;
                        picks = parseAiWords(await callLLM(m, prompt));
                    } catch (e) {
                        lhWarn('AI 排序失敗，改依常用度補滿', e);
                        aiErr = e;
                    }
                    if (stale()) return;   // callLLM 最久等 35 秒，期間換了搜尋就丟掉這次結果
                    const { words } = fillToTarget(pool, picks, AI_TARGET, w => wordPriorityMap.get(w) ?? 0);
                    words.forEach(w => { suggestedPool.add(w); sentCandidatesSet.add(w); });
                    container.innerHTML = words.map(w => aiWordCardHtml(w, false)).join('')
                        + `<div class="candidate-report">從 ${lastCandidatesTotal} 個候選詞中，挑出 ${words.length} 個</div>`;
                    if (aiErr) {
                        // AI 沒排成就不假裝是正常結果；原因只在 Worker 白話訊息（e.plain）時附上，用 textContent 塞，不拼 HTML
                        const hint = document.createElement('div');
                        hint.className = 'candidate-report';
                        hint.textContent = 'AI 暫時無法排序，先依常用度列出' + (aiErr.plain ? '（' + aiErr.message + '）' : '');
                        container.appendChild(hint);
                    }
                    return;
                }

                // 候選不足：全數列出，再造一輪補足（一次按鈕只造一次，D-05）
                if (pool.length > 0) {
                    pool.forEach(w => { suggestedPool.add(w); sentCandidatesSet.add(w); });
                    container.innerHTML = pool.map(w => aiWordCardHtml(w, false)).join('')
                        + `<div class="candidate-report">共 ${pool.length} 個候選詞，已全數列出</div>`;
                }
                loading.style.display = 'none';
                const added = await generateAIWords(AI_TARGET - pool.length, container, new Set([...suggestedPool, ...savedWords]), stale);
                if (stale()) return;
                if (pool.length === 0 && added === 0) {
                    const what = selectedChars.size > 0 ? '含選字' : '符合';
                    container.innerHTML = `<div class="ai-exhausted">已推薦所有${what}的詞彙<button class="reset-pool-btn" onclick="resetSuggestedPool()">↺ 重置</button></div>`;
                }
            } catch (e) {
                // 預期外的例外（資料形狀不對等）：留記錄、給白話提示，不讓 inline onclick 拋出未處理的 rejection
                lhWarn('AI 建議失敗', e);
                if (!stale()) showToast('建議詞產生失敗，請再按一次試試');
            } finally {
                // 任何出口（含提早 return、例外）都在這裡解鎖，不要在別處手動解鎖
                btn.toggleAttribute('disabled', false);
                loading.style.display = 'none';
                loading.textContent = 'AI 思考中…';
            }
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

