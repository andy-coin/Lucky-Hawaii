        // ===== 右側面板：AI 建議 =====

        function _idbOpen() {
            // 全站只有 js/safety.js 的 lhIdbOpen 一個開啟入口：詞庫快取與備份共用，版本才不會打架
            return lhIdbOpen();
        }
        function _idbGet(db, k) {
            return new Promise(res => {
                const req = db.transaction('wl', 'readonly').objectStore('wl').get(k);
                req.onsuccess = () => res(req.result?.v ?? null);
                req.onerror = () => res(null);
            });
        }
        // 詞庫快取只是加速用，不是使用者資料：寫入失敗只提示一次（不跳存檔失敗橫幅），並留 [好韻器] 記錄
        let _wlCacheToastShown = false;
        function _wlCacheWriteFailed(err) {
            lhWarn('詞庫快取寫入失敗', err);
            if (_wlCacheToastShown) return;
            _wlCacheToastShown = true;
            showToast('詞庫快取沒存成功，下次開啟會比較慢，不影響使用', 4000);
        }
        // 只結算一次：complete → true；error / abort / 同步例外 → false 並通報
        function _idbPut(db, k, v) {
            return new Promise(res => {
                let settled = false;
                const fin = (ok, err) => {
                    if (settled) return;
                    settled = true;
                    if (!ok) _wlCacheWriteFailed(err);
                    res(ok);
                };
                try {
                    const tx = db.transaction('wl', 'readwrite');
                    tx.objectStore('wl').put({ k, v });
                    tx.oncomplete = () => fin(true);
                    tx.onerror = e => fin(false, tx.error || e.target.error);
                    tx.onabort = () => fin(false, tx.error);
                } catch (e) { fin(false, e); }
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

            // 從 meta 取當前版本號，與 IDB 快取比對
            let currentVer = null;
            try {
                const metaRes = await fetch('data/wordlist-meta.json');
                if (metaRes.ok) currentVer = (await metaRes.json()).version;
            } catch(e) { lhWarn('詞庫版本檔讀取失敗', e); }

            const cachedVer = db ? await _idbGet(db, 'ver') : null;
            const useCache = currentVer && cachedVer === currentVer;

            let loaded = 0;
            const buf = [];

            await Promise.all(Array.from({ length: WORDLIST_CHUNKS }, async (_, i) => {
                try {
                    let chunk = useCache && db ? await _idbGet(db, i) : null;
                    if (!chunk) {
                        const res = await fetch(`data/wordlist-c${String(i).padStart(2,'0')}.json`);
                        if (res.ok) {
                            const text = await res.text();
                            chunk = text.trim().split('\n').map(l => JSON.parse(l));
                            if (db) _idbPut(db, i, chunk); // 非同步存，不等
                        }
                    }
                    if (chunk) {
                        for (const e of chunk) {
                            buf.push(e);
                            wordPriorityMap.set(e.w, e.p);
                            wordPhoneticMap.set(e.w, e.z);
                        }
                    }
                } catch(e) { lhWarn('詞庫分段 ' + i + ' 載入失敗', e); }
                loaded++;
                updateWordlistProgress(loaded, WORDLIST_CHUNKS);
            }));

            if (!useCache && db && buf.length > 0 && currentVer) _idbPut(db, 'ver', currentVer);

            // 套完 overrides 才公開，wordlistData 不會出現「還沒套修正」的中間狀態
            wordlistData = buf.length > 0 ? await applyWordlistOverrides(buf) : null;
            updateWordlistProgress(WORDLIST_CHUNKS, WORDLIST_CHUNKS);
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
            const removedSet = new Set(ovr.removed || []);
            const hiddenSet  = new Set(ovr.hidden  || []);
            const fixedMap   = ovr.fixed  || {};
            const added      = ovr.added  || [];
            const before  = list.length;
            const filtered = [];
            let removed = 0, fixed = 0;
            for (const e of list) {
                if (removedSet.has(e.w) || hiddenSet.has(e.w)) {
                    wordPriorityMap.delete(e.w);
                    wordPhoneticMap.delete(e.w);
                    removed++;
                    continue;
                }
                if (fixedMap[e.w]) {
                    e.z = fixedMap[e.w];
                    wordPhoneticMap.set(e.w, e.z);
                    fixed++;
                }
                filtered.push(e);
            }
            let addedCount = 0;
            for (const a of added) {
                if (!a.w || !a.z || a.z.includes('?')) continue;  // 缺注音的跳過
                const entry = { w: a.w, z: a.z, p: a.p ?? 1 };
                filtered.push(entry);
                wordPriorityMap.set(a.w, entry.p);
                wordPhoneticMap.set(a.w, entry.z);
                addedCount++;
            }
            if (removed || fixed || addedCount) {
                console.log(`[wordlist overrides] before=${before} → after=${filtered.length} (removed=${removed}, fixed=${fixed}, added=${addedCount})`);
            }
            return filtered;
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

