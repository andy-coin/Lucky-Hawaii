// 部署前檢查：wrangler.toml 的兩個 KV id 都得是真的 32 碼 id，避免部署時新建一個空的回報 KV
import { readFileSync } from 'node:fs';

const path = process.argv[2] || new URL('./wrangler.toml', import.meta.url);
const ids = [];
let inKv = false;
for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (t.startsWith('[')) inKv = t === '[[kv_namespaces]]';
    else if (inKv) { const m = t.match(/^id\s*=\s*"([^"]*)"/); if (m) ids.push(m[1]); }
}
if (ids.length < 2 || ids.some(id => !/^[0-9a-f]{32}$/.test(id) || /^0{31}[12]$/.test(id))) {
    console.error('wrangler.toml 的 KV id 還沒填好（需要兩個 32 碼的 id），請照 worker/DEPLOY.md 的步驟填入後再部署');
    process.exit(1);
}
