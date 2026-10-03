// 測試用靜態 server：只綁 127.0.0.1，行為對齊 GitHub Pages 的路徑配置（不是 file://）
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
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

http.createServer(async (req, res) => {
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
