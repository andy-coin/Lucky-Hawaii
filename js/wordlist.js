        // ===== 右側面板：AI 建議 =====

        // === 詞庫包（Phase 6）===
        // 詞庫分成「詞庫包」：data/packs/index.json 列出有哪些包，每包各有自己的版本檔與分段。
        // 沒選過的人（localStorage 沒有 lh:lexiconPack）永遠走 v0.96 原本的檔案與 IndexedDB 數字鍵，
        // 所以舊使用者的快取一個位元組都不用重抓。
        const LH_PACK_KEY = 'lh:lexiconPack';
        // 存的值要先過格式檢查、而且要在清單裡，才會被拿去組網址或快取鍵；字串本身絕不直接進 fetch / IndexedDB（T-06-06）
        const LH_PACK_ID_RE = /^[a-z0-9-]{1,32}$/;
        // 清單裡的檔案路徑只准 data/ 底下的簡單路徑（不含 ..），避免清單被改壞時抓到站外或別處
        const LH_PACK_PATH_RE = /^data\/[A-Za-z0-9._\/{}-]+$/;
        // 清單讀不到時的後備：就是 v0.96 現在用的那一包
        const LH_LEGACY_PACK = { id: 'v096', name: 'v0.96 現行詞庫', meta: 'data/wordlist-meta.json', chunkPattern: 'data/wordlist-c{NN}.json', notice: 'data/packs/v096/NOTICE.txt', legacyCache: true };
        let activeLexiconPack = null;   // 目前（或最近一次開始載入）的詞庫包描述
        // 載入世代：換包時 +1。只有最新一代的載入可以公開詞庫、寫進度；舊的載入就算晚到也不能蓋掉新選的包（B4）
        let _wlGen = 0;

        function _validPackEntry(p) {
            if (!p || typeof p !== 'object') return false;
            if (typeof p.id !== 'string' || !LH_PACK_ID_RE.test(p.id)) return false;
            if (typeof p.name !== 'string' || typeof p.description !== 'string') return false;
            const okPath = v => typeof v === 'string' && LH_PACK_PATH_RE.test(v) && !v.includes('..');
            if (!okPath(p.meta) || !okPath(p.chunkPattern) || !p.chunkPattern.includes('{NN}')) return false;
            if (p.notice !== undefined && !okPath(p.notice)) return false;
            return Number.isInteger(p.entries) && p.entries >= 0;
        }

        // 讀 data/packs/index.json（no-cache：部署後立刻看得到新清單）。只留格式正確的項目；
        // 預設包不在裡面或讀取失敗就回 null（呼叫端改用 v0.96），失敗不快取，下次還會再試
        let _lexManifestP = null;
        function loadLexiconManifest() {
            if (_lexManifestP) return _lexManifestP;
            const p = (async () => {
                try {
                    const r = await fetch('data/packs/index.json', { cache: 'no-cache' });
                    if (!r.ok) throw new Error('HTTP ' + r.status);
                    const j = await r.json();
                    const packs = (Array.isArray(j?.packs) ? j.packs : []).filter(_validPackEntry)
                        // legacyCache（沿用舊的數字快取鍵）只有 v0.96 這一包可以用，別的包一律走自己的 p:<id>: 鍵
                        .map(e => ({ ...e, legacyCache: e.id === 'v096' && e.legacyCache === true }));
                    if (!packs.some(e => e.id === j.default)) throw new Error('預設詞庫包不在清單內');
                    return { default: j.default, packs };
                } catch (e) {
                    lhWarn('詞庫包清單讀取失敗', e);
                    return null;
                }
            })();
            _lexManifestP = p;
            p.then(m => { if (!m && _lexManifestP === p) _lexManifestP = null; });
            return p;
        }

        // 決定這次要載哪一包：存的 id 格式對、而且在清單裡才用，否則用清單預設（不改寫存的值，換版後可能又認得了）
        async function resolveLexiconPack() {
            const m = await loadLexiconManifest();
            if (!m) return LH_LEGACY_PACK;
            const stored = lhGet(LH_PACK_KEY);
            if (stored) {
                if (LH_PACK_ID_RE.test(stored)) {
                    const hit = m.packs.find(e => e.id === stored);
                    if (hit) return hit;
                }
                lhWarn('詞庫包設定不認得，這次改用預設詞庫包');
            }
            return m.packs.find(e => e.id === m.default);
        }

        // IndexedDB 鍵：v0.96 維持原本的數字鍵與 'ver'；其他包用字串鍵 p:<id>:<i>，數字範圍刪除碰不到它們
        function _packKey(desc, i) { return desc.legacyCache ? i : 'p:' + desc.id + ':' + i; }
        function _packVerKey(desc) { return desc.legacyCache ? 'ver' : 'p:' + desc.id + ':ver'; }
        function _packChunkUrl(desc, i) { return desc.chunkPattern.replace('{NN}', String(i).padStart(2, '0')); }

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
        function _idbReadCache(db, desc, n) {
            return new Promise(res => {
                try {
                    const tx = db.transaction('wl', 'readonly');
                    const st = tx.objectStore('wl');
                    const out = { ver: null, chunks: [] };
                    st.get(_packVerKey(desc)).onsuccess = e => { out.ver = e.target.result?.v ?? null; };
                    for (let i = 0; i < n; i++) st.get(_packKey(desc, i)).onsuccess = e => { out.chunks[i] = e.target.result?.v ?? null; };
                    tx.oncomplete = () => res(out);
                    tx.onerror = () => { lhWarn('詞庫快取讀取失敗', tx.error); res(null); };
                    tx.onabort = () => { lhWarn('詞庫快取讀取中止', tx.error); res(null); };
                } catch (e) { lhWarn('詞庫快取讀取失敗', e); res(null); }
            });
        }
        // 快取登記簿：IndexedDB 'wl' 的 'p:index' 記錄，列出有快取的包與最近使用時間；字串鍵，數字範圍刪除碰不到
        const LH_PACK_INDEX_KEY = 'p:index';
        const LH_PACK_KEEP = 2;   // 目前的包＋最近用過的另一包
        function _packRegistryRead(rec) {
            const v = rec && rec.v;
            return Array.isArray(v) ? v.filter(r => r && typeof r.id === 'string' && typeof r.t === 'number').map(r => ({ id: r.id, ver: r.ver, t: r.t })) : [];
        }
        // 把這一包放到最前面（同時間時排最新）；回傳新陣列，不改原陣列
        function _packRegistryUpsert(reg, id, ver) {
            return [{ id, ver, t: Date.now() }, ...reg.filter(r => r.id !== id)];
        }
        // 依最近使用排序，留前 LH_PACK_KEEP 筆，掉出去的包刪掉自己的鍵（只在 'wl'，格式不合格的 id 不組範圍），再寫回登記簿
        function _packRegistryEvict(st, reg) {
            const kept = reg.slice().sort((a, b) => b.t - a.t).slice(0, LH_PACK_KEEP);
            for (const r of reg) {
                if (kept.includes(r)) continue;
                if (r.id === LH_LEGACY_PACK.id) { st.delete(IDBKeyRange.bound(0, 1e9)); st.delete('ver'); }
                else if (LH_PACK_ID_RE.test(r.id)) st.delete(IDBKeyRange.bound('p:' + r.id + ':', 'p:' + r.id + ':￿'));
            }
            st.put({ k: LH_PACK_INDEX_KEY, v: kept });
        }
        // 快取命中時只更新「最近使用」時間，不清任何東西；失敗不影響載入
        function _idbTouchPack(db, desc, ver) {
            try {
                const tx = db.transaction('wl', 'readwrite');
                const st = tx.objectStore('wl');
                tx.onerror = () => lhWarn('詞庫快取索引更新失敗', tx.error);
                tx.onabort = () => lhWarn('詞庫快取索引更新失敗', tx.error);
                st.get(LH_PACK_INDEX_KEY).onsuccess = e => {
                    try { st.put({ k: LH_PACK_INDEX_KEY, v: _packRegistryUpsert(_packRegistryRead(e.target.result), desc.id, ver) }); }
                    catch (e2) { lhWarn('詞庫快取索引更新失敗', e2); try { tx.abort(); } catch (e3) { lhWarn('詞庫快取交易中止失敗', e3); } }
                };
            } catch (e) { lhWarn('詞庫快取索引更新失敗', e); }
        }
        // 一個交易：刪這一包的舊分段 → 寫全部新分段 → 寫版本。交易 abort 會整筆還原，不可能留下「新版號配舊分段」
        // v0.96 只刪數字鍵；其他包只刪自己 p:<id>: 開頭的鍵。字串鍵（'ver'、別包）與 backups store 一律不碰，所以不用 clear()
        // 只結算一次：complete → true；error / abort / 同步例外 → false 並通報
        function _idbReplaceAll(db, desc, ver, chunks) {
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
                    if (desc.legacyCache) st.delete(IDBKeyRange.bound(0, 1e9));
                    else st.delete(IDBKeyRange.bound('p:' + desc.id + ':', 'p:' + desc.id + ':￿'));
                    chunks.forEach((c, i) => st.put({ k: _packKey(desc, i), v: c }));
                    st.put({ k: _packVerKey(desc), v: ver });
                    // 快取登記簿 'p:index'：[{id, ver, t}]，同一個交易裡讀改寫；最近用過的只留 2 包（目前的＋上一個，B4），其餘整包刪掉
                    st.get(LH_PACK_INDEX_KEY).onsuccess = e => {
                        try {
                            const reg = _packRegistryRead(e.target.result);
                            const finish = () => {
                                try { _packRegistryEvict(st, _packRegistryUpsert(reg, desc.id, ver)); }
                                catch (e3) { try { tx.abort(); } catch (e4) { lhWarn('詞庫快取交易中止失敗', e4); } fin(false, e3); }
                            };
                            // 舊 v0.96 快取還沒登記過：算「最舊」的一包，才輪得到被清掉
                            if (!desc.legacyCache && !reg.some(r => r.id === LH_LEGACY_PACK.id)) {
                                st.get('ver').onsuccess = e2 => {
                                    const v = e2.target.result?.v;
                                    if (v !== undefined && v !== null) reg.push({ id: LH_LEGACY_PACK.id, ver: v, t: 0 });
                                    finish();
                                };
                            } else finish();
                        } catch (e2) {
                            try { tx.abort(); } catch (e3) { lhWarn('詞庫快取交易中止失敗', e3); }
                            fin(false, e2);
                        }
                    };
                } catch (e) {
                    // 同步例外時交易可能已排進刪除與部分寫入，不 abort 就會被提交成半套
                    try { tx && tx.abort(); } catch (e2) { lhWarn('詞庫快取交易中止失敗', e2); }
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
        // finally 只清「自己」：換包時較新的載入已經接手 _wlP，舊的收尾不可以把它清掉
        let _wlP = null;
        function loadWordlist() {
            if (wordlistData !== null) return Promise.resolve();
            if (_wlP) return _wlP;
            const p = _loadWordlistOnce()
                .catch(e => lhWarn('詞庫載入失敗', e))
                .finally(() => { if (_wlP === p) _wlP = null; });
            _wlP = p;
            return p;
        }

        async function _loadWordlistOnce() {
            const gen = _wlGen;
            const live = () => gen === _wlGen;   // 已被較新的載入（換包）取代就不可以公開任何東西
            const desc = await resolveLexiconPack();
            if (!live()) return;
            activeLexiconPack = desc;
            const isLegacy = desc.legacyCache === true;

            let db = null;
            try { db = await _idbOpen(); } catch(e) { lhWarn('IndexedDB 開啟失敗，詞庫改走網路', e); }

            // 從 meta 取當前版本號與分段數（no-cache：部署後立刻看得到新版）
            // v0.96：meta 讀不到照舊繼續（無版本號、不寫快取）；其他包：meta 不合格就不載入，不猜
            let currentVer = null, n = WORDLIST_CHUNKS;
            try {
                const metaRes = await fetch(desc.meta, { cache: 'no-cache' });
                if (metaRes.ok) {
                    const meta = await metaRes.json();
                    currentVer = meta.version;
                    if (Number.isInteger(meta.chunks) && meta.chunks >= 1 && meta.chunks <= 64) n = meta.chunks;
                    else if (!isLegacy) throw new Error('版本檔的分段數不合格');
                } else if (!isLegacy) throw new Error('HTTP ' + metaRes.status);
            } catch(e) {
                lhWarn(isLegacy ? '詞庫版本檔讀取失敗' : '詞庫包 ' + desc.id + ' 版本檔讀取失敗', e);
                if (!isLegacy) { if (live()) updateWordlistProgress(1, 1); return; }
            }
            if (!live()) return;
            updateWordlistProgress(0, n);

            // 快取要「版本相同且各段齊全」才用，否則整套重抓，不混用
            const cache = db ? await _idbReadCache(db, desc, n) : null;
            const useCache = !!(currentVer && cache && cache.ver === currentVer
                && Array.from({ length: n }, (_, i) => Array.isArray(cache.chunks[i])).every(Boolean));

            let chunks, fromNet = false;
            if (useCache) {
                chunks = cache.chunks;
                _idbTouchPack(db, desc, currentVer);
            } else {
                fromNet = true;
                // 網址帶版本：HTTP 快取不可能把舊版本文配給新版本號
                const suffix = currentVer ? '?v=' + encodeURIComponent(currentVer) : '';
                let loaded = 0;
                chunks = await Promise.all(Array.from({ length: n }, async (_, i) => {
                    let chunk = null;
                    try {
                        const res = await fetch(_packChunkUrl(desc, i) + suffix);
                        if (!res.ok) throw new Error('HTTP ' + res.status);
                        chunk = (await res.text()).trim().split('\n').map(l => JSON.parse(l));
                    } catch(e) { lhWarn('詞庫分段 ' + i + ' 載入失敗', e); }
                    loaded++;
                    if (live()) updateWordlistProgress(loaded, n);
                    return chunk;
                }));
                // 缺任何一段就整份丟棄：wordlistData 維持 null、不寫快取，下次呼叫會重抓
                if (chunks.some(c => c === null)) {
                    if (live()) updateWordlistProgress(n, n);
                    return;
                }
            }

            // 必須在套 overrides 之前寫快取（put 當下就複製），快取才會是原始內容
            // 舊的載入（已換包）也可以把自己這包的快取寫完：鍵是各包獨立的，不會影響新選的包
            const cacheP = fromNet && db && currentVer ? _idbReplaceAll(db, desc, currentVer, chunks) : Promise.resolve(true);
            if (!live()) { await cacheP; return; }

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
            const out = buf.length > 0 ? await applyWordlistOverrides(buf, live) : null;
            if (live()) {
                wordlistData = out;
                updateWordlistProgress(n, n);
            }
            await cacheP;
        }

        // 換詞庫包（偏好設定用）。回傳 Promise<boolean>：true = 新包已公開並重跑目前搜尋
        // 連點時只有最後一次生效：每次換包 _wlGen +1，前一次的載入晚到也不能公開，它的呼叫端拿到 false
        async function switchLexiconPack(id) {
            const m = await loadLexiconManifest();
            const target = m && typeof id === 'string' && LH_PACK_ID_RE.test(id) ? m.packs.find(e => e.id === id) : null;
            if (!target) { lhWarn('換詞庫包失敗：清單裡沒有這個包'); return false; }
            const prev = activeLexiconPack;
            const prevStored = lhGet(LH_PACK_KEY);
            lhSet(LH_PACK_KEY, id);
            if (prev && prev.id === id && wordlistData !== null) return true;
            _wlGen++;
            const myGen = _wlGen;
            _wlP = null;
            wordlistData = null;
            wordPriorityMap = new Map();
            wordPhoneticMap = new Map();
            // 舊字卡來自上一個包：清掉，才不會在比較時把兩個包的詞看混
            suggestedPool.clear();
            sentCandidatesSet.clear();
            cumulativeCandidates = [];
            _aiEpoch++;
            const cards = document.getElementById('aiWordsContainer');
            if (cards) cards.replaceChildren();
            const aiLoading = document.getElementById('aiLoading');
            if (aiLoading) aiLoading.style.display = 'none';
            const p = loadWordlist();
            window.__hoyunWordlistReady = p;
            await p;
            if (myGen !== _wlGen) return false;   // 等待期間又換了包：那次才是有效的
            if (wordlistData === null || !activeLexiconPack || activeLexiconPack.id !== id) {
                // 新包載不下來：退回原本的包（設定值與畫面一致，也不會留在「沒有詞庫」的狀態；不覆蓋使用者的其他設定）
                if (prev) {
                    if (prevStored === null) lhRemove(LH_PACK_KEY); else lhSet(LH_PACK_KEY, prevStored);
                    activeLexiconPack = prev;
                    _wlGen++;
                    _wlP = null;
                    window.__hoyunWordlistReady = loadWordlist();
                }
                return false;
            }
            _refreshFromCurrentInput();
            return true;
        }

        // ── 後台匯出的詞庫 overrides（data/wordlist-overrides.json）──
        // 不存進 IDB（避免改 overrides 要重 build 詞庫），每次 loadWordlist 末段重新套用
        // 吃進詞庫陣列、回傳套完修正的陣列（任何提早結束都原樣回傳輸入）
        async function applyWordlistOverrides(list, live = () => true) {
            let ovr;
            try {
                const r = await fetch('data/wordlist-overrides.json', { cache: 'no-cache' });
                if (!r.ok) return list;
                ovr = await r.json();
            } catch(e) { lhWarn('詞庫修正檔載入失敗', e); return list; }
            // 等修正檔期間若已換包，兩張對照表已經是新包的，這裡一個字都不能動
            if (!live()) return list;
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

