// 測試用靜態 server：只綁 127.0.0.1，行為對齊 GitHub Pages 的路徑配置（不是 file://）
import http from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve } from 'node:path';

const ROOT = resolve(process.env.SITE_ROOT || process.cwd());
const PORT = Number(process.env.PORT || 4310);
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
    if (origin && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) { res.writeHead(403).end('forbidden'); return; }
    let body = '';
    for await (const ch of req) { body += ch; if (body.length > 64 * 1024) { res.writeHead(413).end('too large'); return; } }
    let obj;
    try { obj = cleanTune(JSON.parse(body)); } catch { obj = null; }
    if (!obj || !Object.keys(obj).length) { res.writeHead(400).end('bad json'); return; }
    const txt = '// 宇宙特效調參的預設值（齒輪「寫成預設」由本地伺服器 tests/serve.mjs 寫入；蓋過 js/word-space.js 裡 LH_SP_TUNE 的同名數字）\n'
        + '// 寫入時間：' + new Date().toISOString() + '\n'
        + 'const LH_SP_TUNE_FILE = ' + JSON.stringify(obj) + ';\n';
    await writeFile(join(ROOT, 'js', 'sp-tune-defaults.js'), txt);
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }).end('ok');
}

http.createServer(async (req, res) => {
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
}).listen(PORT, '127.0.0.1');
