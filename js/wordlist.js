        // ===== 右側面板：AI 建議 =====

        function _idbOpen() {
            // 全站只有 js/safety.js 的 lhIdbOpen 一個開啟入口：詞庫快取與備份共用，版本才不會打架
            return lhIdbOpen();
        }
        // 詞庫快取只是加速用，不是使用者資料：寫入失敗只提示一次（不跳存檔失敗橫幅），並留 [好韻器] 記錄
        let _wlCacheToastShown = false;
        function _wlCacheWriteFailed(err) {
            lhWarn('詞庫快取寫入失敗', err);
            if (_wlCacheToastShown) return;
            _wlCacheToastShown = true;
            showToast('詞庫快取沒存成功，下次開啟會比較慢，不影響使用', 4000);
        }
        // 一個交易讀 ver 與全部分段：別的分頁換版時，這裡不可能讀到一半新一半舊
        // 回傳 { ver, chunks }；任何錯誤回 null（改走網路）
        function _idbReadCache(db) {
            return new Promise(res => {
                try {
                    const tx = db.transaction('wl', 'readonly');
                    const st = tx.objectStore('wl');
                    const out = { ver: null, chunks: [] };
                    st.get('ver').onsuccess = e => { out.ver = e.target.result?.v ?? null; };
                    for (let i = 0; i < WORDLIST_CHUNKS; i++) st.get(i).onsuccess = e => { out.chunks[i] = e.target.result?.v ?? null; };
                    tx.oncomplete = () => res(out);
                    tx.onerror = () => { lhWarn('詞庫快取讀取失敗', tx.error); res(null); };
                    tx.onabort = () => { lhWarn('詞庫快取讀取中止', tx.error); res(null); };
                } catch (e) { lhWarn('詞庫快取讀取失敗', e); res(null); }
            });
        }
        // 一個交易：刪舊分段 → 寫全部新分段 → 寫版本。交易 abort 會整筆還原，不可能留下「新版號配舊分段」
        // 只刪數字鍵（分段）；字串鍵（'ver' 等）與 backups store 一律不碰，所以不用 clear()
        // 只結算一次：complete → true；error / abort / 同步例外 → false 並通報
        function _idbReplaceAll(db, ver, chunks) {
            return new Promise(res => {
                let settled = false;
                const fin = (ok, err) => {
                    if (settled) return;
                    settled = true;
                    if (!ok) _wlCacheWriteFailed(err);
                    res(ok);
                };
                let tx;
                try {
                    tx = db.transaction('wl', 'readwrite');
                    tx.oncomplete = () => fin(true);
                    tx.onerror = e => fin(false, tx.error || e.target.error);
                    tx.onabort = () => fin(false, tx.error);
                    const st = tx.objectStore('wl');
                    st.delete(IDBKeyRange.bound(0, 1e9));
                    chunks.forEach((c, i) => st.put({ k: i, v: c }));
                    st.put({ k: 'ver', v: ver });
                } catch (e) {
                    // 同步例外時交易可能已排進刪除與部分寫入，不 abort 就會被提交成半套
                    try { tx && tx.abort(); } catch (_) {}
                    fin(false, e);
                }
            });
        }

        function updateWordlistProgress(loaded, total) {
            const el = document.getElementById('wordlistProgress');
            if (!el) return;
            if (loaded >= total) { el.style.display = 'none'; return; }
            el.style.display = '';
            el.textContent = `詞庫載入中 ${loaded}/${total}…`;
        }

        // 同一時間只有一次載入；失敗後下次呼叫會重抓。永遠回傳不會 reject 的 Promise，成功後立刻 resolve
        let _wlP = null;
        function loadWordlist() {
            if (wordlistData !== null) return Promise.resolve();
            return _wlP ??= _loadWordlistOnce()
                .catch(e => lhWarn('詞庫載入失敗', e))
                .finally(() => { _wlP = null; });
        }

        async function _loadWordlistOnce() {
            updateWordlistProgress(0, WORDLIST_CHUNKS);

            let db = null;
            try { db = await _idbOpen(); } catch(e) { lhWarn('IndexedDB 開啟失敗，詞庫改走網路', e); }

            // 從 meta 取當前版本號（no-cache：部署後立刻看得到新版）
            let currentVer = null;
            try {
                const metaRes = await fetch('data/wordlist-meta.json', { cache: 'no-cache' });
                if (metaRes.ok) currentVer = (await metaRes.json()).version;
            } catch(e) { lhWarn('詞庫版本檔讀取失敗', e); }

            // 快取要「版本相同且十段齊全」才用，否則整套重抓，不混用
            const cache = db ? await _idbReadCache(db) : null;
            const useCache = !!(currentVer && cache && cache.ver === currentVer
                && Array.from({ length: WORDLIST_CHUNKS }, (_, i) => Array.isArray(cache.chunks[i])).every(Boolean));

            let chunks, fromNet = false;
            if (useCache) {
                chunks = cache.chunks;
            } else {
                fromNet = true;
                // 網址帶版本：HTTP 快取不可能把舊版本文配給新版本號
                const suffix = currentVer ? '?v=' + encodeURIComponent(currentVer) : '';
                let loaded = 0;
                chunks = await Promise.all(Array.from({ length: WORDLIST_CHUNKS }, async (_, i) => {
                    let chunk = null;
                    try {
                        const res = await fetch(`data/wordlist-c${String(i).padStart(2,'0')}.json${suffix}`);
                        if (!res.ok) throw new Error('HTTP ' + res.status);
                        chunk = (await res.text()).trim().split('\n').map(l => JSON.parse(l));
                    } catch(e) { lhWarn('詞庫分段 ' + i + ' 載入失敗', e); }
                    loaded++;
                    updateWordlistProgress(loaded, WORDLIST_CHUNKS);
                    return chunk;
                }));
                // 缺任何一段就整份丟棄：wordlistData 維持 null、不寫快取，下次呼叫會重抓
                if (chunks.some(c => c === null)) {
                    updateWordlistProgress(WORDLIST_CHUNKS, WORDLIST_CHUNKS);
                    return;
                }
            }

            // 必須在套 overrides 之前寫快取（put 當下就複製），快取才會是原始內容
            const cacheP = fromNet && db && currentVer ? _idbReplaceAll(db, currentVer, chunks) : Promise.resolve(true);

            // 依分段編號順序組裝，不受抓取完成先後影響
            const buf = [];
            for (const chunk of chunks) {
                for (const e of chunk) {
                    buf.push(e);
                    wordPriorityMap.set(e.w, e.p);
                    wordPhoneticMap.set(e.w, e.z);
                }
            }
            // 套完 overrides 才公開，wordlistData 不會出現「還沒套修正」的中間狀態
            wordlistData = buf.length > 0 ? await applyWordlistOverrides(buf) : null;
            updateWordlistProgress(WORDLIST_CHUNKS, WORDLIST_CHUNKS);
            await cacheP;
        }

        // ── 後台匯出的詞庫 overrides（data/wordlist-overrides.json）──
        // 不存進 IDB（避免改 overrides 要重 build 詞庫），每次 loadWordlist 末段重新套用
        // 吃進詞庫陣列、回傳套完修正的陣列（任何提早結束都原樣回傳輸入）
        async function applyWordlistOverrides(list) {
            let ovr;
            try {
                const r = await fetch('data/wordlist-overrides.json', { cache: 'no-cache' });
                if (!r.ok) return list;
                ovr = await r.json();
            } catch(e) { lhWarn('詞庫修正檔載入失敗', e); return list; }
            // 全部先算在暫存裡，成功才一次寫進兩張對照表；中途任何例外就原樣回傳詞庫（修正檔壞了不能讓整份詞庫變成載入失敗）
            try {
                const removedSet = new Set(ovr.removed || []);
                const hiddenSet  = new Set(ovr.hidden  || []);
                const fixedMap   = ovr.fixed  || {};
                const added      = ovr.added  || [];
                const before  = list.length;
                const filtered = [];
                const mapDel = [], mapSet = [];   // 待套用：[詞] 與 [詞, 注音, 優先度]
                let removed = 0, fixed = 0;
                for (const e of list) {
                    if (removedSet.has(e.w) || hiddenSet.has(e.w)) {
                        mapDel.push(e.w);
                        removed++;
                        continue;
                    }
                    if (fixedMap[e.w]) {
                        filtered.push({ ...e, z: fixedMap[e.w] });   // 不改原物件，失敗時原詞庫維持原樣
                        mapSet.push([e.w, fixedMap[e.w], null]);
                        fixed++;
                    } else filtered.push(e);
                }
                let addedCount = 0;
                for (const a of added) {
                    if (typeof a?.w !== 'string' || typeof a.z !== 'string' || !a.w || !a.z || a.z.includes('?')) continue;  // 缺注音或格式不對的跳過
                    const entry = { w: a.w, z: a.z, p: a.p ?? 1 };
                    filtered.push(entry);
                    mapSet.push([a.w, entry.z, entry.p]);
                    addedCount++;
                }
                mapDel.forEach(w => { wordPriorityMap.delete(w); wordPhoneticMap.delete(w); });
                mapSet.forEach(([w, z, p]) => { wordPhoneticMap.set(w, z); if (p !== null) wordPriorityMap.set(w, p); });
                if (removed || fixed || addedCount) {
                    console.log(`[wordlist overrides] before=${before} → after=${filtered.length} (removed=${removed}, fixed=${fixed}, added=${addedCount})`);
                }
                return filtered;
            } catch(e) { lhWarn('詞庫修正檔套用失敗，改用未修正的詞庫', e); return list; }
        }

        // rhymes: currentRhymes 陣列, targetLen: 目標詞長, minPriority: 本輪門檻
        function filterWordsByRhyme(rhymes, targetLen, minPriority) {
            if (!wordlistData) return [];
            const savedSet = new Set(savedWords);
            const isSingle = rhymes.length === 1;
            const candidates = [];
            for (const entry of wordlistData) {
                if (entry.w.length !== targetLen) continue;
                // if (entry.p < minPriority) continue;  // p 不準確（很多 p=0 並非冷僻），暫停使用
                if (sentCandidatesSet.has(entry.w)) continue;
                if (savedSet.has(entry.w)) continue;
                const syllables = entry.z.split(' ');
                if (syllables.length !== targetLen) continue;
                let match = true;
                if (isSingle) {
                    const lastRhyme = getZhuyinRhyme(syllables[targetLen - 1]);
                    if (RHYME_TO_FAMILY[lastRhyme] !== RHYME_TO_FAMILY[rhymes[0].rhyme]) match = false;
                } else {
                    for (let i = 0; i < rhymes.length; i++) {
                        if (rhymes[i].isWild) continue;
                        if (rhymes[i].notFound) continue;
                        if (RHYME_TO_FAMILY[getZhuyinRhyme(syllables[i])] !== RHYME_TO_FAMILY[rhymes[i].rhyme]) {
                            match = false; break;
                        }
                    }
                }
                if (match) candidates.push(entry.w);
            }
            for (let i = candidates.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
            }
            return candidates;
        }

        // 回傳候選清單；wordlist 未載入回傳 null
        function getWordlistCandidates(rhymes, targetLen) {
            if (!wordlistData) return null;
            /* 三層優先機制（暫時停用）
            for (const minP of [30, 10, 1]) {
                const all = filterWordsByRhyme(rhymes, targetLen, minP);
                if (all.length > 0) {
                    lastCandidatesTotal = all.length;
                    return all.slice(0, 200);
                }
            }
            */
            const all = filterWordsByRhyme(rhymes, targetLen, 1);
            if (all.length > 0) {
                lastCandidatesTotal = all.length;
                // 每輪最多 1000（候選池會累積，下一輪再加另一個 1000）
                return all.length > 1000 ? all.slice(0, 1000) : all;
            }
            lastCandidatesTotal = 0;
            return [];
        }

        function filterWordsByInitial(rhymes, targetLen, minPriority) {
            if (!wordlistData) return [];
            const savedSet = new Set(savedWords);
            const candidates = [];
            for (const entry of wordlistData) {
                if (entry.w.length !== targetLen) continue;
                // if (entry.p < minPriority) continue;  // p 不準確（很多 p=0 並非冷僻），暫停使用
                if (sentCandidatesSet.has(entry.w)) continue;
                if (savedSet.has(entry.w)) continue;
                const syllables = entry.z.split(' ');
                if (syllables.length !== targetLen) continue;
                let match = true;
                for (let i = 0; i < rhymes.length; i++) {
                    if (rhymes[i].isWild) continue;
                    if (rhymes[i].notFound) continue;
                    const eff = _effInitial(syllables[i]);
                    const target = rhymes[i].initial || rhymes[i].rhyme;
                    if (eff !== target) { match = false; break; }
                }
                if (match) candidates.push(entry.w);
            }
            for (let i = candidates.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
            }
            return candidates;
        }

        function getWordlistCandidatesInitial(rhymes, targetLen) {
            if (!wordlistData) return null;
            /* 三層優先機制（暫時停用）
            for (const minP of [30, 10, 1]) {
                const all = filterWordsByInitial(rhymes, targetLen, minP);
                if (all.length > 0) {
                    lastCandidatesTotal = all.length;
                    return all.slice(0, 200);
                }
            }
            */
            const all = filterWordsByInitial(rhymes, targetLen, 1);
            if (all.length > 0) {
                lastCandidatesTotal = all.length;
                return all.length > 1000 ? all.slice(0, 1000) : all;
            }
            lastCandidatesTotal = 0;
            return [];
        }

