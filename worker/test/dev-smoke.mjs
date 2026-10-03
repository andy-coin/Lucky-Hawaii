// ==================== 好韻器 Worker 本機冒煙測試（真的 workerd 執行環境） ====================
// 用 wrangler dev 跑整個 Worker（本機 KV、真的排程觸發），供應商換成 127.0.0.1 上的假伺服器（D-22）。
// 用自己的空閒埠與暫存狀態目錄，所以可以和 npm test（4310 埠）同時跑；全程只用假金鑰，不碰任何真實金鑰或供應商。
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const LOCAL = 'http://localhost:4310';     // 本機開關放行的來源
const SITE = 'https://andy-coin.github.io'; // 正式網站的來源
const ADMIN = 'smoke-admin';
const TEXT = '心動、微光';

const deadModels = new Set();

const fake = createServer((req, res) => {
    req.resume();
    req.on('end', () => {
        const gem = req.url.match(/models\/([^/:]+(?:%2F[^/:]+)*):generateContent/);
        const reply = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
        if (gem) {
            const id = decodeURIComponent(gem[1]);
            if (deadModels.has(id)) return reply(404, { error: { code: 404, message: 'not found' } });
            return reply(200, { candidates: [{ content: { parts: [{ text: TEXT }] } }] });
        }
        if (req.url.endsWith('/chat/completions')) {
            return reply(200, { choices: [{ message: { content: TEXT } }], usage: { total_tokens: 12 } });
        }
        reply(404, { error: 'unknown' });
    });
});

const freePort = () => new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

let wrangler = null;
let wranglerLog = '';
let tmp = null;

async function stopWrangler() {
    if (!wrangler || wrangler.exitCode !== null) return;
    const kill = sig => { try { process.kill(-wrangler.pid, sig); } catch (e) { /* 已結束 */ } };
    kill('SIGTERM');
    for (let i = 0; i < 50 && wrangler.exitCode === null; i++) await sleep(100);
    if (wrangler.exitCode === null) kill('SIGKILL');
}

async function main() {
    await new Promise(r => fake.listen(0, '127.0.0.1', r));
    const fakeBase = `http://127.0.0.1:${fake.address().port}`;
    const port = await freePort();
    const base = `http://127.0.0.1:${port}`;
    tmp = await mkdtemp(join(tmpdir(), 'lh-smoke-'));

    wrangler = spawn('npx', [
        'wrangler', 'dev', '--config', 'worker/wrangler.toml', '--ip', '127.0.0.1', '--port', String(port),
        '--persist-to', tmp, '--show-interactive-dev-session=false',
        '--var', 'ALLOW_LOCAL_ORIGIN:1', '--var', `GEMINI_BASE:${fakeBase}`, '--var', `GROQ_BASE:${fakeBase}`,
        '--var', 'GEMINI_API_KEY:smoke-g', '--var', 'GROQ_API_KEY:smoke-q', '--var', `USER_REPORT_KEY:${ADMIN}`,
    ], { env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    wrangler.stdout.on('data', d => { wranglerLog += d; });
    wrangler.stderr.on('data', d => { wranglerLog += d; });

    const call = (path, { method = 'GET', origin = LOCAL, body } = {}) => fetch(base + path, {
        method,
        headers: { ...(origin ? { Origin: origin } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });

    // 等 Worker 起來（最多 60 秒）
    let up = false;
    for (let i = 0; i < 120 && !up; i++) {
        if (wrangler.exitCode !== null) break;
        try { up = (await call('/models')).status === 200; } catch (e) { up = false; }
        if (!up) await sleep(500);
    }
    if (!up) throw new Error(`wrangler dev 沒有在 60 秒內啟動。輸出如下：\n${wranglerLog}`);
    console.log('✓ wrangler dev 已啟動（workerd + 本機 KV）');

    const must = (cond, label, extra) => {
        if (!cond) { throw new Error(`${label}${extra === undefined ? '' : `\n   實際內容：${JSON.stringify(extra)}`}`); }
        console.log(`✓ ${label}`);
    };

    // (1) 新路徑 /ai
    let r = await call('/ai', { method: 'POST', body: { prompt: '給我押 ㄣ 的詞', model: 'auto' } });
    let j = await r.json();
    must(r.status === 200 && j.ok === true && j.text === TEXT, 'POST /ai 回答了', j);

    // (2) 模型清單（還沒跑過健康檢查）
    r = await call('/models');
    j = await r.json();
    must(j.models?.length === 6 && j.checkedAt === null, 'GET /models 列出 6 個模型、尚無檢查時間', j);

    // (3) 舊版頁面打根路徑，回 Gemini 格式
    r = await call('/', { method: 'POST', body: { _provider: 'gemini', model: 'gemini-3.5-flash-lite', messages: [{ role: 'user', content: 'x' }], temperature: 0.95, max_tokens: 100 } });
    j = await r.json();
    must(r.status === 200 && j.candidates?.[0]?.content?.parts?.[0]?.text === TEXT, '舊版 POST / 以 Gemini 格式回答', j);

    // (4)(5) 回報存進 KV，後台列表讀得到
    r = await call('/feedback', { method: 'POST', origin: SITE, body: { type: 'smoke', word: '測試' } });
    j = await r.json();
    must(r.status === 200 && j.ok === true, 'POST /feedback 已儲存', j);
    r = await call(`/reports.json?key=${ADMIN}`);
    j = await r.json();
    must(Array.isArray(j) && j.length === 1 && j[0].kvKey && j[0].word === '測試', 'GET /reports.json 讀得到剛存的回報', j);

    // (6) 真的排程觸發
    r = await call('/cdn-cgi/local/scheduled?format=json');
    j = await r.json().catch(() => null);
    must(j?.outcome === 'ok', '本機排程觸發完成（outcome ok）', j);

    // (7) 排程寫入的健康文件（排程在背景執行，輪詢最多 10 秒）
    let doc = null;
    for (let i = 0; i < 20 && !doc; i++) {
        r = await call(`/health.json?key=${ADMIN}`);
        if (r.status === 200) { const d = await r.json(); if (d.checkedAt && d.active?.length === 6) doc = d; }
        if (!doc) await sleep(500);
    }
    must(doc, '排程寫入了健康文件（6 個啟用模型）', doc);

    // (8) 把一個模型弄壞，手動重跑後選單跟著變
    deadModels.add('gemini-3.8-flash');
    r = await call(`/health/run?key=${ADMIN}`, { method: 'POST' });
    j = await r.json();
    must(r.status === 200 && Array.isArray(j.active) && !j.active.includes('gemini-3.8-flash') && j.active.length === 5, 'POST /health/run 反映壞掉的模型', j);
    r = await call('/models');
    j = await r.json();
    must(!j.models.some(m => m.id === 'gemini-3.8-flash') && j.checkedAt, 'GET /models 不再列出壞掉的模型', j);

    // (9)(10) 擋掉不該進來的
    r = await call('/ai', { method: 'POST', origin: 'https://evil.example', body: { prompt: 'x', model: 'auto' } });
    must(r.status === 403, '陌生來源打 /ai 得到 403', r.status);
    r = await call('/health.json');
    must(r.status === 403, '沒有金鑰讀 /health.json 得到 403', r.status);

    console.log('全部通過');
}

let code = 0;
try {
    await main();
} catch (e) {
    code = 1;
    console.error(`✗ ${e.message}`);
    if (wranglerLog && !String(e.message).includes('輸出如下')) console.error(`--- wrangler 輸出 ---\n${wranglerLog}`);
} finally {
    await stopWrangler();
    fake.closeAllConnections();
    await new Promise(r => fake.close(r));
    if (tmp) await rm(tmp, { recursive: true, force: true });
}
process.exit(code);
