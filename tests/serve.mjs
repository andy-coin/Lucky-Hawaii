// 測試用靜態 server：只綁 127.0.0.1，行為對齊 GitHub Pages 的路徑配置（不是 file://）
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve } from 'node:path';

const ROOT = resolve(process.env.SITE_ROOT || process.cwd());
const PORT = Number(process.env.PORT || 4310);
const HOST = process.env.HOST || '127.0.0.1';   // 手機測試.command 用 0.0.0.0：同一個 Wi‑Fi 的 iPhone／iPad 連得進來
// 本機或區網私有 IP（192.168／10／172.16～31）才能用寫檔的開發者端點
const LOCAL_ORIGIN = /^http:\/\/(127\.0\.0\.1|localhost|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;
const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.txt': 'text/plain; charset=utf-8',
};

// 宇宙齒輪「寫成預設」（0.98.22.11）：只收本機頁面送來的 JSON，只留數字（最多三層、鍵名只能英文字母），寫成 js/sp-tune-defaults.js
const cleanTune = (o, d = 0) => {
    if (!o || typeof o !== 'object' || Array.isArray(o) || d > 3) return null;
    const out = {};
    for (const [k, v] of Object.entries(o)) {
        if (!/^[A-Za-z]{1,32}$/.test(k)) continue;
        if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
        else { const c = cleanTune(v, d + 1); if (c && Object.keys(c).length) out[k] = c; }
    }
    return out;
};
async function saveTune(req, res) {
    const origin = req.headers.origin || '';
    if (origin && !LOCAL_ORIGIN.test(origin)) { res.writeHead(403).end('forbidden'); return; }
    let body = '';
    for await (const ch of req) { body += ch; if (body.length > 64 * 1024) { res.writeHead(413).end('too large'); return; } }
    let obj;
    try { obj = cleanTune(JSON.parse(body)); } catch { obj = null; }
    if (!obj || !Object.keys(obj).length) { res.writeHead(400).end('bad json'); return; }
    const m = new URL(req.url, 'http://x').searchParams.get('m') === '1';   // m＝1：手機／平板那一套（js/sp-tune-defaults-mobile.js）
    const txt = '// 宇宙特效調參的預設值' + (m ? '（行動裝置：觸控的 iPhone／iPad 專用，疊在 sp-tune-defaults.js 上面）' : '') + '（齒輪「寫成預設」由本地伺服器 tests/serve.mjs 寫入；蓋過 js/word-space.js 裡 LH_SP_TUNE 的同名數字）\n'
        + '// 寫入時間：' + new Date().toISOString() + '\n'
        + 'const LH_SP_TUNE_FILE' + (m ? '_M' : '') + ' = ' + JSON.stringify(obj) + ';\n';
    await writeFile(join(ROOT, 'js', m ? 'sp-tune-defaults-mobile.js' : 'sp-tune-defaults.js'), txt);
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }).end('ok');
}

// 宇宙黑洞（開發者模式，只有本地伺服器有）：把詞丟進黑洞＝寫進 data/wordlist-overrides.json 的 removed（詞庫本體 wordlist-c*.json 一個字都不動）；
// 丟進去的詞另外記在 data/void-words.json（虛無空間顯示用）。白洞救回＝兩邊都拿掉。原始 0.96 的刪除名單備份在 data/backup-0.96/
async function voidOp(req, res) {
    const origin = req.headers.origin || '';
    if (origin && !LOCAL_ORIGIN.test(origin)) { res.writeHead(403).end('forbidden'); return; }
    let body = '';
    for await (const ch of req) { body += ch; if (body.length > 4096) { res.writeHead(413).end('too large'); return; } }
    let op, w;
    try { ({ op, w } = JSON.parse(body)); } catch { op = null; }
    if (!['del', 'restore'].includes(op) || typeof w !== 'string' || !/^[^\s\x00-\x1f]{1,20}$/u.test(w)) { res.writeHead(400).end('bad request'); return; }
    const ovP = join(ROOT, 'data', 'wordlist-overrides.json'), vP = join(ROOT, 'data', 'void-words.json');
    const ov = JSON.parse(await readFile(ovP, 'utf8'));
    let vw = [];
    try { vw = JSON.parse(await readFile(vP, 'utf8')); } catch { vw = []; }
    ov.removed = (ov.removed || []).filter(x => x !== w);
    vw = vw.filter(x => x !== w);
    if (op === 'del') { ov.removed.push(w); vw.push(w); }
    ov.updated_at = new Date().toISOString();
    await writeFile(ovP, JSON.stringify(ov, null, 2) + '\n');
    // 排版跟 tools/corrections/writeback.py 一樣（同一支 format_word；不然 tests/corrections-writeback 的 round-trip 會失敗）
    execFileSync('python3', ['-I', '-B', '-c', 'import sys; sys.path.insert(0, sys.argv[1]); import writeback as W; p = sys.argv[2]; d = W.format_word(W.load_overrides(p)); open(p, "w", encoding="utf-8").write(d)', join(ROOT, 'tools', 'corrections'), ovP]);
    await writeFile(vP, JSON.stringify(vw, null, 1) + '\n');
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' }).end(JSON.stringify(vw));
}

http.createServer(async (req, res) => {
    if (req.method === 'POST' && new URL(req.url, 'http://x').pathname === '/__lh/void') { await voidOp(req, res).catch(() => { if (!res.headersSent) res.writeHead(500).end('error'); }); return; }
    if (req.method === 'POST' && new URL(req.url, 'http://x').pathname === '/__lh/tune-defaults') { await saveTune(req, res).catch(() => { if (!res.headersSent) res.writeHead(500).end('error'); }); return; }
    try {
        let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        if (p.endsWith('/')) p += 'index.html';
        const f = resolve(join(ROOT, p));
        // 擋路徑穿越：用 relative 判斷，不用字首比對（同字首的兄弟資料夾會漏網）
        const rel = relative(ROOT, f);
        if (rel.startsWith('..') || isAbsolute(rel)) { res.writeHead(403).end('forbidden'); return; }
        await stat(f);
        res.writeHead(200, {
            'content-type': TYPES[extname(f)] || 'application/octet-stream',
            'cache-control': 'no-store',
        });
        res.end(await readFile(f));
    } catch {
        res.writeHead(404).end('not found');
    }
}).listen(PORT, HOST);
