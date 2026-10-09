// ==================== 修正層（Phase 7，FB-03／FB-04） ====================
// 後台「套用」過的修正放在 AI_STATE_KV 的單一文件 'corrections:v1'（和使用者回報的 USER_FEEDBACK_KV 分開），
// 網站載入時抓公開 view（GET /corrections.json），套在 data/ 的修正檔之後，所以套用後重新整理就生效。
// 這支檔案不 import index.js：共用的小工具（json、金鑰檢查…）由 index.js 注入，避免循環引用。
// KV 同一個 key 每秒只能寫一次：每次操作只 put 一次，並用 rev 樂觀鎖擋掉兩個分頁同時改。

export const CORRECTIONS_KEY = 'corrections:v1';
const MAX_APPLY_BODY = 16384;       // 套用請求只有幾個 kvKey，16 KB 綽綽有餘
const MAX_APPLY_KEYS = 100;
const KVKEY_RE = /^[\w.-]{1,64}$/;
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

// 已核准的回報 → { target, bucket, value }；不能轉的回 { skip: 原因 }
// 目前只接「移除詞／隱藏詞」，其他動作 07-02 補齊（形狀不變）
export function actionToEntry(report) {
    const a = report?.action;
    if (!a || typeof a !== 'object') return { skip: 'invalid' };
    const bucket = { remove_word: 'removed', hide_word: 'hidden' }[a.type];
    if (!bucket) return { skip: 'invalid' };
    const w = a.word;
    if (typeof w !== 'string' || [...w].length < 1 || [...w].length > 20 || !WORD_RE.test(w)) return { skip: 'invalid' };
    return { target: 'wordlist', bucket, value: w };
}

// 依序重播 entries，同一個詞後者勝：removed／hidden 互相排擠，也會把同一個詞從 fixed、added 拿掉。
// 純函式，不動傳入的 base。
export function replayEntries(base, entries) {
    const wl = base?.wordlist ?? {};
    const rd = base?.rhymeDict ?? {};
    const out = {
        wordlist: { removed: [...(wl.removed ?? [])], hidden: [...(wl.hidden ?? [])], fixed: { ...(wl.fixed ?? {}) }, added: [...(wl.added ?? [])] },
        rhymeDict: { removed: [...(rd.removed ?? [])], hidden: [...(rd.hidden ?? [])], fixed: [...(rd.fixed ?? [])], added: [...(rd.added ?? [])] },
    };
    const w = out.wordlist;
    for (const e of entries) {
        if (e.target !== 'wordlist' || (e.bucket !== 'removed' && e.bucket !== 'hidden')) continue;
        const other = e.bucket === 'removed' ? 'hidden' : 'removed';
        if (!w[e.bucket].includes(e.value)) w[e.bucket].push(e.value);
        w[other] = w[other].filter(x => x !== e.value);
        delete w.fixed[e.value];
        w.added = w.added.filter(a => a?.w !== e.value);
    }
    return out;
}

// 公開 view：只有修正內容本身，沒有 id、來源回報、時間、已寫入清單（C3）
export function buildView(doc) {
    return { version: 1, rev: doc.rev, ...replayEntries(null, doc.entries) };
}

// 回傳 null 代表這個路徑不歸這裡管。h = { json, readBodyCapped, adminKeyOk, originAllowed }
export async function handleCorrections(request, env, url, h) {
    const path = url.pathname;

    // 公開讀取：給網站抓；只認允許的來源
    if (path === '/corrections.json') {
        if (!h.originAllowed()) return h.json(403, { ok: false, code: 'FORBIDDEN', message: '來源不被允許' });
        if (request.method !== 'GET') return h.json(405, { ok: false, code: 'METHOD', message: '不支援這個操作' });
        try {
            const doc = await loadDoc(env, { cacheTtl: 30 });
            return h.json(200, buildView(doc), { 'Cache-Control': 'public, max-age=60' });
        } catch (e) {
            if (e.code === 'LAYER_CORRUPT') return h.json(500, { ok: false, code: 'LAYER_CORRUPT', message: '修正層資料損毀' });
            throw e;
        }
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

        let doc;
        try { doc = await loadDoc(env); } catch (e) {
            if (e.code === 'LAYER_CORRUPT') return h.json(500, { ok: false, code: 'LAYER_CORRUPT', message: '修正層資料損毀' });
            throw e;
        }
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
            doc.entries.push(...added);
            try { await saveDoc(env, doc); } catch (e) {
                console.error('[好韻器] 修正層寫入失敗', e?.message);
                return h.json(503, { ok: false, code: 'KV_BUSY', message: '儲存太快了，請等一秒再試' });
            }
        }
        return h.json(200, {
            ok: true, rev: doc.rev,
            applied: added.map(e => ({ id: e.id, kvKeys: e.source_kvKeys })),
            skipped, count: doc.entries.length,
        });
    }

    return null;
}
