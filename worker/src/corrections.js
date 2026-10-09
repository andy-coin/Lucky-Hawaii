// ==================== 修正層（Phase 7，FB-03／FB-04） ====================
// 後台「套用」過的修正放在 AI_STATE_KV 的單一文件 'corrections:v1'（和使用者回報的 USER_FEEDBACK_KV 分開），
// 網站載入時抓公開 view（GET /corrections.json），套在 data/ 的修正檔之後，所以套用後重新整理就生效。
// 這支檔案不 import index.js：共用的小工具（json、金鑰檢查…）由 index.js 注入，避免循環引用。
// KV 同一個 key 每秒只能寫一次：每次操作只 put 一次，並用 rev 樂觀鎖擋掉兩個分頁同時改。

export const CORRECTIONS_KEY = 'corrections:v1';
const MAX_APPLY_BODY = 16384;       // 套用請求只有幾個 kvKey，16 KB 綽綽有餘
const MAX_APPLY_KEYS = 100;
const KVKEY_RE = /^[\w.-]{1,64}$/;
const ID_RE = /^c_[\w-]{1,64}$/;
const MAX_ENTRIES = 2000;           // 修正層上限；滿了就請 Andy 跑寫回腳本
const MAX_WRITTEN = 5000;           // 已寫入清單只留最新這麼多筆（避免文件無限長大）
// 詞要能原樣進網站：1–20 字、不含空白／引號／角括號／反斜線／&／控制字元（使用者打的字不能夾帶標記）
const WORD_RE = /^[^\s<>"'`\\&\p{Cc}]+$/u;

export function emptyDoc() {
    return { version: 1, rev: 0, updated_at: null, entries: [], written: [] };
}

function layerCorrupt() {
    const e = new Error('修正層資料損毀');
    e.code = 'LAYER_CORRUPT';
    return e;
}

// 讀文件。壞掉的一律丟錯，不當成空的：否則下一次寫入會把損毀的文件蓋掉
export async function loadDoc(env, opts) {
    const raw = await env.AI_STATE_KV.get(CORRECTIONS_KEY, opts);
    if (raw === null || raw === undefined) return emptyDoc();
    let doc;
    try { doc = JSON.parse(raw); } catch (e) { throw layerCorrupt(); }
    if (!doc || typeof doc !== 'object' || !Array.isArray(doc.entries)) throw layerCorrupt();
    doc.written = Array.isArray(doc.written) ? doc.written : [];
    doc.rev = Number.isInteger(doc.rev) ? doc.rev : 0;
    return doc;
}

// rev + 1、只 put 一次；put 丟例外（例如一秒內寫兩次）時文件維持原樣，由呼叫端回 503
export async function saveDoc(env, doc) {
    doc.rev += 1;
    doc.updated_at = new Date().toISOString();
    await env.AI_STATE_KV.put(CORRECTIONS_KEY, JSON.stringify(doc));
}

// ==================== 驗證（進修正層之前一律在 Worker 重驗，T-07-06） ====================
const SYLLABLE_RE = /^[ㄅ-ㄩ]+[ˊˇˋ˙]?$/;
const DICT_KEY_RE = /^[ㄅ-ㄩ]+[1-5]$/;
const TIERS = ['common', 'normal', 'rare'];
const SOURCES = ['manual', 'ai_accept', 'ai_modify'];
const TONE_DIGIT = { 'ˊ': '2', 'ˇ': '3', 'ˋ': '4', '˙': '5' };
const isStr = v => typeof v === 'string';
const len = s => Array.from(s).length;
const isWord = w => isStr(w) && len(w) >= 1 && len(w) <= 20 && WORD_RE.test(w);
const isChar = c => isStr(c) && len(c) === 1 && WORD_RE.test(c);
const isTier = t => TIERS.includes(t);
// 注音串：每個音節都合格，音節數要等於字數（z 不可空、不可含問號）
const isZ = (z, n) => isStr(z) && z.split(' ').length === n && z.split(' ').every(p => SYLLABLE_RE.test(p));
const isReading = r => isStr(r) && SYLLABLE_RE.test(r);
// 和 admin 的 readingToDictKey 同一套：最後一個字是聲調符號 → 2–5，否則補 1
const readingToDictKey = r => {
    const last = r[r.length - 1];
    return TONE_DIGIT[last] ? r.slice(0, -1) + TONE_DIGIT[last] : r + '1';
};
const keyMatches = (reading, key) => isReading(reading) && DICT_KEY_RE.test(key) && readingToDictKey(reading) === key;

export function validateEntryValue(target, bucket, v) {
    if (!['removed', 'hidden', 'fixed', 'added'].includes(bucket) || !v) return false;
    if (target === 'wordlist') {
        if (bucket === 'removed' || bucket === 'hidden') return isWord(v);
        if (typeof v !== 'object') return false;
        if (bucket === 'fixed') return isWord(v.w) && isZ(v.z, len(v.w));
        // added：只有手動新增可以沒有注音；AI 收錄的一定要有
        const zOk = v.z === '' ? v.source === 'manual' : isZ(v.z, len(v.w ?? ''));
        return isWord(v.w) && zOk && isTier(v.tier) && SOURCES.includes(v.source) && (v.original === undefined || isWord(v.original));
    }
    if (target === 'rhymeDict') {
        if (typeof v !== 'object' || !isChar(v.char)) return false;
        if (bucket === 'removed' || bucket === 'hidden') {
            return DICT_KEY_RE.test(v.dict_key) && (v.reading === undefined || keyMatches(v.reading, v.dict_key));
        }
        if (bucket === 'fixed') return DICT_KEY_RE.test(v.from) && DICT_KEY_RE.test(v.to) && (v.tier === undefined || isTier(v.tier));
        return keyMatches(v.reading, v.dict_key) && isTier(v.tier);
    }
    return false;
}

// 已核准的回報 → { target, bucket, value }；不能轉的回 { skip: 原因 }。
// 值一律從 action 的欄位一個一個挑出來（不展開 client 給的物件），再驗證；對照表見 07-RESEARCH「action → entry 對照」
export function actionToEntry(report) {
    const a = report?.action;
    if (!a || typeof a !== 'object') return { skip: 'invalid' };
    const tierOf = t => (t === undefined || t === null || t === '' ? 'normal' : t);
    let e;
    switch (a.type) {
        case 'note': return { skip: 'no_effect' };   // 備註不影響詞庫（E4／Pitfall 7）
        case 'hide_word': e = { target: 'wordlist', bucket: 'hidden', value: a.word }; break;
        case 'remove_word': e = { target: 'wordlist', bucket: 'removed', value: a.word }; break;
        case 'fix_word_reading': e = { target: 'wordlist', bucket: 'fixed', value: { w: a.word, z: a.new_z } }; break;
        case 'manual_add_word':
            e = { target: 'wordlist', bucket: 'added', value: { w: a.word, z: a.z ?? '', tier: tierOf(a.tier), source: 'manual' } }; break;
        case 'accept_ai_word':
            e = { target: 'wordlist', bucket: 'added', value: { w: a.word, z: a.z, tier: 'normal', source: 'ai_accept' } }; break;
        case 'modify_ai_word':
            e = { target: 'wordlist', bucket: 'added', value: { w: a.modified, z: a.z, tier: 'normal', source: 'ai_modify', original: a.original } }; break;
        case 'hide_char_reading':
        case 'remove_char_reading':
            e = { target: 'rhymeDict', bucket: a.type === 'hide_char_reading' ? 'hidden' : 'removed', value: { char: a.char, dict_key: a.dict_key, reading: a.reading } }; break;
        case 'fix_char_reading':
            if (a.old_dict_key) {
                // 修正的新舊讀音和它們的 dict_key 也要對得上
                if (!keyMatches(a.new_reading, a.new_dict_key) || (a.old_reading && !keyMatches(a.old_reading, a.old_dict_key))) return { skip: 'invalid' };
                e = { target: 'rhymeDict', bucket: 'fixed', value: { char: a.char, from: a.old_dict_key, to: a.new_dict_key } };
            } else {
                e = { target: 'rhymeDict', bucket: 'added', value: { char: a.char, reading: a.new_reading, dict_key: a.new_dict_key, tier: tierOf(a.to_tier) } };
            }
            break;
        case 'manual_add_reading':
            e = { target: 'rhymeDict', bucket: 'added', value: { char: a.char, reading: a.new_reading, dict_key: a.new_dict_key, tier: tierOf(a.to_tier) } }; break;
        default: return { skip: 'invalid' };
    }
    return validateEntryValue(e.target, e.bucket, e.value) ? e : { skip: 'invalid' };
}

// ==================== 重播（公開 view 與 Python 寫回腳本共用的契約） ====================
// replayEntries(base, entries)：依序重播 entries（同一個對象後套用者為準），純函式，不動 base；缺的欄位當空的。
// 寫回腳本（tools/corrections，07-08）用 Python 照這段規則重寫一次，tests/fixtures/corrections-vectors.json 是兩邊共用的驗收。
//   wordlist（對象 = 詞）
//     removed(w)     → 加入 removed；從 hidden、fixed、added 拿掉
//     hidden(w)      → 加入 hidden；從 removed、fixed、added 拿掉
//     fixed({w,z})   → fixed[w] = z；從 removed、hidden 拿掉；added 若已有 w，把那筆的 z 改成 z
//     added(item)    → added[w] = item（整筆取代）；從 removed、hidden 拿掉；fixed 若已有 w 且 item.z 非空，fixed[w] = item.z
//   rhymeDict（對象 = 字 + dict_key；fixed 以 字 + from 為鍵）
//     removed(v)     → removed[字+dict_key] = v；從 hidden、added 拿掉；
//                      fixed 裡同字且 to === v.dict_key 的每一筆刪掉，其 from 非空時 removed[字+from] = {char, dict_key: from}（已有則不動）
//     hidden(v)      → 同 removed，目標欄位換成 hidden（從 removed、added 拿掉）
//     fixed(v)       → fixed[字+from] = v；把 (字, to) 與 (字, from) 從 removed、hidden 拿掉
//                      （from 也要拿掉：removed／hidden 因修正而連帶產生的 from，在修正重新生效時要讓位，否則同一批 entries 重播第二次結果會不同）
//     added(v)       → added[字+dict_key] = v；從 removed、hidden 拿掉
//   排序：每個欄位先照 base 的順序留下仍存在的對象，再依「最後放入」的順序接上 base 沒有的對象；已存在的對象被更新時位置不變。
export function replayEntries(base, entries) {
    const wl = base?.wordlist ?? {}, rd = base?.rhymeDict ?? {};
    const toMap = (items, keyOf) => {
        const m = new Map();
        for (const it of items ?? []) { const k = keyOf(it); if (k !== undefined && k !== null) m.set(k, it); }
        return m;
    };
    const rk = v => v.char + '|' + v.dict_key;
    const b = {
        wRemoved: toMap(wl.removed, x => x), wHidden: toMap(wl.hidden, x => x),
        wFixed: new Map(Object.entries(wl.fixed ?? {})), wAdded: toMap(wl.added, x => x?.w),
        rRemoved: toMap(rd.removed, x => x && rk(x)), rHidden: toMap(rd.hidden, x => x && rk(x)),
        rFixed: toMap(rd.fixed, x => x && x.char + '|' + x.from), rAdded: toMap(rd.added, x => x && rk(x)),
    };
    const c = Object.fromEntries(Object.entries(b).map(([k, m]) => [k, new Map(m)]));
    for (const e of entries) {
        const v = e.value;
        if (e.target === 'wordlist') {
            if (e.bucket === 'removed' || e.bucket === 'hidden') {
                c[e.bucket === 'removed' ? 'wRemoved' : 'wHidden'].set(v, v);
                c[e.bucket === 'removed' ? 'wHidden' : 'wRemoved'].delete(v);
                c.wFixed.delete(v); c.wAdded.delete(v);
            } else if (e.bucket === 'fixed') {
                c.wFixed.set(v.w, v.z); c.wRemoved.delete(v.w); c.wHidden.delete(v.w);
                if (c.wAdded.has(v.w)) c.wAdded.set(v.w, { ...c.wAdded.get(v.w), z: v.z });
            } else if (e.bucket === 'added') {
                c.wAdded.set(v.w, v); c.wRemoved.delete(v.w); c.wHidden.delete(v.w);
                if (c.wFixed.has(v.w) && v.z) c.wFixed.set(v.w, v.z);
            }
        } else if (e.target === 'rhymeDict') {
            if (e.bucket === 'removed' || e.bucket === 'hidden') {
                const mine = c[e.bucket === 'removed' ? 'rRemoved' : 'rHidden'], other = c[e.bucket === 'removed' ? 'rHidden' : 'rRemoved'];
                mine.set(rk(v), v); other.delete(rk(v)); c.rAdded.delete(rk(v));
                for (const [k, f] of [...c.rFixed]) {
                    if (f.char !== v.char || f.to !== v.dict_key) continue;
                    c.rFixed.delete(k);
                    if (f.from && !mine.has(v.char + '|' + f.from)) mine.set(v.char + '|' + f.from, { char: v.char, dict_key: f.from });
                }
            } else if (e.bucket === 'fixed') {
                c.rFixed.set(v.char + '|' + v.from, v);
                for (const k of [v.char + '|' + v.to, v.char + '|' + v.from]) { c.rRemoved.delete(k); c.rHidden.delete(k); }
            } else if (e.bucket === 'added') {
                c.rAdded.set(rk(v), v); c.rRemoved.delete(rk(v)); c.rHidden.delete(rk(v));
            }
        }
    }
    // base 的對象照 base 順序，其餘照最後放入的順序
    const keys = (name) => [...b[name].keys()].filter(k => c[name].has(k)).concat([...c[name].keys()].filter(k => !b[name].has(k)));
    const list = name => keys(name).map(k => c[name].get(k));
    return {
        wordlist: { removed: keys('wRemoved'), hidden: keys('wHidden'), fixed: Object.fromEntries(keys('wFixed').map(k => [k, c.wFixed.get(k)])), added: list('wAdded') },
        rhymeDict: { removed: list('rRemoved'), hidden: list('rHidden'), fixed: list('rFixed'), added: list('rAdded') },
    };
}

// 公開 view：只有修正內容本身，沒有 id、來源回報、時間、已寫入清單（C3）
export function buildView(doc) {
    return { version: 1, rev: doc.rev, ...replayEntries(null, doc.entries) };
}

// 回傳 null 代表這個路徑不歸這裡管。h = { json, readBodyCapped, adminKeyOk, originAllowed }
export async function handleCorrections(request, env, url, h) {
    try {
        return await route(request, env, url, h);
    } catch (e) {
        // 任何一條路徑讀到壞掉的文件都一樣：回 500，而且不寫入（不會蓋掉）
        if (e.code === 'LAYER_CORRUPT') return h.json(500, { ok: false, code: 'LAYER_CORRUPT', message: '修正層資料損毀' });
        throw e;
    }
}

// 存檔：put 失敗（例如一秒內寫兩次）回 503 Response，成功回 null
async function trySave(env, doc, h) {
    try { await saveDoc(env, doc); return null; } catch (e) {
        console.error('[好韻器] 修正層寫入失敗', e?.message);
        return h.json(503, { ok: false, code: 'KV_BUSY', message: '儲存太快了，請等一秒再試' });
    }
}

// 讀 { ids, baseRev } 這種請求（撤回、清空共用）；格式不對回 { res }
async function readIdsRequest(request, h) {
    const body = await h.readBodyCapped(request, MAX_APPLY_BODY);
    if (!body.ok) return { res: h.json(413, { ok: false, code: 'TOO_LARGE', message: '內容太大' }) };
    let req;
    try { req = JSON.parse(body.text); } catch (e) { req = null; }
    if (!req || !Array.isArray(req.ids) || req.ids.length < 1 || req.ids.length > MAX_APPLY_KEYS
        || !req.ids.every(id => typeof id === 'string' && ID_RE.test(id))
        || !Number.isInteger(req.baseRev) || req.baseRev < 0) {
        return { res: h.json(400, { ok: false, code: 'BAD_REQUEST', message: '請求格式不對' }) };
    }
    return { ids: [...new Set(req.ids)], baseRev: req.baseRev };
}

async function route(request, env, url, h) {
    const path = url.pathname;

    // 公開讀取：給網站抓；只認允許的來源
    if (path === '/corrections.json') {
        if (!h.originAllowed()) return h.json(403, { ok: false, code: 'FORBIDDEN', message: '來源不被允許' });
        if (request.method !== 'GET') return h.json(405, { ok: false, code: 'METHOD', message: '不支援這個操作' });
        const doc = await loadDoc(env, { cacheTtl: 30 });
        return h.json(200, buildView(doc), { 'Cache-Control': 'public, max-age=60' });
    }

    // 後台讀整份修正層（含 id、來源、已寫入清單）：給後台列表與寫回腳本，要金鑰
    if (path === '/corrections/admin.json') {
        if (!h.adminKeyOk()) return h.json(403, { ok: false, code: 'FORBIDDEN', message: '金鑰不對' });
        if (request.method !== 'GET') return h.json(405, { ok: false, code: 'METHOD', message: '不支援這個操作' });
        const doc = await loadDoc(env);
        const { version, rev, ...pub } = buildView(doc);
        return h.json(200, { ok: true, version: doc.version ?? 1, rev: doc.rev, updated_at: doc.updated_at ?? null, entries: doc.entries, written: doc.written, view: pub });
    }

    // 撤回／清空：依 id 動單一文件，一次只 put 一次。撤回 = 純粹拿掉（來源回報會自動回到「已核准、未套用」）；
    // 清空 = 寫回資料檔之後拿掉，並把來源 kvKey 記進 written，之後不會再被套用
    if (path === '/corrections/revoke' || path === '/corrections/clear') {
        if (!h.adminKeyOk()) return h.json(403, { ok: false, code: 'FORBIDDEN', message: '金鑰不對' });
        if (request.method !== 'POST') return h.json(405, { ok: false, code: 'METHOD', message: '不支援這個操作' });
        const req = await readIdsRequest(request, h);
        if (req.res) return req.res;
        const doc = await loadDoc(env);
        if (req.baseRev !== doc.rev) {
            return h.json(409, { ok: false, code: 'REV_MISMATCH', rev: doc.rev, message: '線上修正層剛剛有變動，請重新載入後再試' });
        }
        const isRevoke = path === '/corrections/revoke';
        const byId = new Map(doc.entries.map(e => [e.id, e]));
        const found = req.ids.filter(id => byId.has(id));
        const missing = req.ids.filter(id => !byId.has(id));
        if (!found.length) {
            if (isRevoke) return h.json(404, { ok: false, code: 'NOT_FOUND', missing, rev: doc.rev, message: '這筆修正已不在線上（可能已撤回或已寫入資料檔），請重新載入' });
            return h.json(200, { ok: true, rev: doc.rev, cleared: [], missing });
        }
        const gone = new Set(found);
        if (!isRevoke) {
            const written = new Set(doc.written);
            for (const id of found) for (const k of byId.get(id).source_kvKeys ?? []) written.add(k);
            doc.written = [...written].slice(-MAX_WRITTEN);
        }
        doc.entries = doc.entries.filter(e => !gone.has(e.id));
        const busy = await trySave(env, doc, h);
        if (busy) return busy;
        return h.json(200, isRevoke ? { ok: true, rev: doc.rev, revoked: found, missing } : { ok: true, rev: doc.rev, cleared: found, missing });
    }

    // 套用：後台把「已核准」的回報轉成修正層的條目。client 只送 kvKey，內容一律由 Worker 讀回報 KV 自己轉
    if (path === '/corrections/apply') {
        if (!h.adminKeyOk()) return h.json(403, { ok: false, code: 'FORBIDDEN', message: '金鑰不對' });
        if (request.method !== 'POST') return h.json(405, { ok: false, code: 'METHOD', message: '不支援這個操作' });
        const body = await h.readBodyCapped(request, MAX_APPLY_BODY);
        if (!body.ok) return h.json(413, { ok: false, code: 'TOO_LARGE', message: '內容太大' });
        let req;
        try { req = JSON.parse(body.text); } catch (e) { req = null; }
        const bad = () => h.json(400, { ok: false, code: 'BAD_REQUEST', message: '請求格式不對' });
        if (!req || !Array.isArray(req.kvKeys) || req.kvKeys.length < 1 || req.kvKeys.length > MAX_APPLY_KEYS
            || !req.kvKeys.every(k => typeof k === 'string' && KVKEY_RE.test(k))
            || !Number.isInteger(req.baseRev) || req.baseRev < 0) return bad();

        const doc = await loadDoc(env);
        if (req.baseRev !== doc.rev) {
            return h.json(409, { ok: false, code: 'REV_MISMATCH', rev: doc.rev, message: '線上修正層剛剛有變動，請重新載入後再套用' });
        }

        const used = new Set(doc.entries.flatMap(e => e.source_kvKeys ?? []));
        const written = new Set(doc.written);
        const skipped = [];
        const fresh = new Map();   // (target|bucket|value) → 新條目；同一次呼叫內相同的修正合併成一筆
        for (const kvKey of new Set(req.kvKeys)) {
            if (used.has(kvKey)) { skipped.push({ kvKey, reason: 'already_applied' }); continue; }
            if (written.has(kvKey)) { skipped.push({ kvKey, reason: 'already_written' }); continue; }
            const raw = await env.USER_FEEDBACK_KV.get(kvKey);
            if (raw === null || raw === undefined) { skipped.push({ kvKey, reason: 'not_found' }); continue; }
            let report;
            try { report = JSON.parse(raw); } catch (e) { skipped.push({ kvKey, reason: 'invalid' }); continue; }
            if (!report || report.status !== 'agreed' || !report.action || typeof report.action !== 'object') {
                skipped.push({ kvKey, reason: 'not_agreed' });
                continue;
            }
            const conv = actionToEntry(report);
            if (conv.skip) { skipped.push({ kvKey, reason: conv.skip }); continue; }
            const sig = JSON.stringify([conv.target, conv.bucket, conv.value]);
            const hit = fresh.get(sig);
            if (hit) { hit.source_kvKeys.push(kvKey); continue; }
            fresh.set(sig, {
                id: 'c_' + crypto.randomUUID(), target: conv.target, bucket: conv.bucket, value: conv.value,
                source_kvKeys: [kvKey], applied_at: new Date().toISOString(),
            });
        }

        const added = [...fresh.values()];
        if (added.length) {
            if (doc.entries.length + added.length > MAX_ENTRIES) {
                return h.json(400, { ok: false, code: 'LAYER_FULL', message: '修正層已滿 2000 筆，請先跑寫回腳本' });
            }
            doc.entries.push(...added);
            const busy = await trySave(env, doc, h);
            if (busy) return busy;
        }
        return h.json(200, {
            ok: true, rev: doc.rev,
            applied: added.map(e => ({ id: e.id, kvKeys: e.source_kvKeys })),
            skipped, count: doc.entries.length,
        });
    }

    return null;
}
