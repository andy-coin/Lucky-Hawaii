// Phase 7 寫回腳本：Python 單元測試（假 Worker 只連 127.0.0.1、暫存 git repo）＋端到端（真 Worker 程式碼），不碰真正的資料檔、金鑰與遠端。
import { test, expect } from '@playwright/test';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import worker from '../worker/src/index.js';
import { FakeKV, makeEnv } from './worker-helpers.mjs';

const findPycache = (dir) => {
    const hits = [];
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (!statSync(p).isDirectory()) continue;
        if (name === '__pycache__') hits.push(p);
        else hits.push(...findPycache(p));
    }
    return hits;
};

test('寫回腳本：Python 單元測試全過（離線、不需金鑰、不留 __pycache__）', () => {
    // 清空金鑰、禁止 Python 寫 __pycache__
    const env = { ...process.env, PYTHONDONTWRITEBYTECODE: '1' };
    delete env.LH_ADMIN_KEY;
    const r = spawnSync('python3', ['-B', '-m', 'unittest', 'discover', '-s', 'tools/corrections/tests', '-t', 'tools/corrections', '-v'],
        { encoding: 'utf8', timeout: 180_000, env });
    // 找不到 python3 是環境缺東西，不能默默跳過
    if (r.error && r.error.code === 'ENOENT') throw new Error('需要 Python 3.9 以上（python3）');
    if (r.error) throw r.error;
    const out = `${r.stdout}\n${r.stderr}`;
    expect(r.status, out).toBe(0);
    const ran = /Ran (\d+) tests?/.exec(r.stderr);
    expect(ran, out).not.toBeNull();
    expect(Number(ran[1]), out).toBeGreaterThanOrEqual(6);
    expect(r.stderr, out).toMatch(/\nOK/);
    expect(findPycache('tools'), '工具不可留下 __pycache__').toEqual([]);
});

// ==================== 端到端：真 Worker 程式碼＋真腳本＋本機假遠端＋慢半拍的假 Pages ====================
// 所有伺服器都開在測試程序裡，所以 Python 子程序必須用非同步 spawn（spawnSync 會卡死事件迴圈）。
// 遠端是暫存的 bare repo，絕不 push 真正的專案。
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } });
const report = (action) => JSON.stringify({ status: 'agreed', decided_at: '2026-10-10T00:00:00.000Z', action });
const listen = (server) => new Promise(r => server.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${server.address().port}`)));

test('寫回腳本：端到端（真 Worker＋push＋等線上生效＋只清這一批）', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'wb-e2e-'));
    const servers = [];
    try {
        // 假 KV：兩筆已核准回報先套用，第三筆等腳本在輪詢時才套用
        const env = makeEnv({
            ALLOW_LOCAL_ORIGIN: '1',
            USER_FEEDBACK_KV: new FakeKV({
                k1: report({ type: 'remove_word', word: '測試詞' }),
                k2: report({ type: 'hide_char_reading', char: '長', reading: 'ㄔㄤˊ', dict_key: 'ㄔㄤ2' }),
                k3: report({ type: 'remove_word', word: '第三詞' }),
            }),
        });
        const hits = [];
        const bridge = http.createServer(async (req, res) => {
            const chunks = [];
            for await (const c of req) chunks.push(c);
            const post = req.method !== 'GET';
            const headers = {};
            for (const h of ['x-admin-key', 'content-type', 'user-agent']) if (req.headers[h]) headers[h] = req.headers[h];
            const r = await worker.fetch(new Request('https://w' + req.url, { method: req.method, headers, body: post ? Buffer.concat(chunks) : undefined }), env, { waitUntil() {} });
            hits.push(`${req.method} ${req.url.split('?')[0]}`);
            res.writeHead(r.status, Object.fromEntries(r.headers));
            res.end(Buffer.from(await r.arrayBuffer()));
        });
        servers.push(bridge);
        const bridgeUrl = await listen(bridge);
        const viaBridge = async (path, body) => {
            const res = await fetch(bridgeUrl + path, { method: body ? 'POST' : 'GET', headers: { 'X-Admin-Key': 'admin-test', 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
            return res.json();
        };
        const applyKeys = async (kvKeys) => {
            const { rev } = await viaBridge('/corrections/admin.json');
            const out = await viaBridge('/corrections/apply', { kvKeys, baseRev: rev });
            expect(out.ok, JSON.stringify(out)).toBe(true);
        };
        const layer = () => JSON.parse(env.AI_STATE_KV.m.get('corrections:v1'));
        const clears = () => hits.filter(h => h === 'POST /corrections/clear').length;

        // 小型專案：三個真實資料檔的複本＋本機 bare 遠端
        const clone = join(tmp, 'clone'), bare = join(tmp, 'bare.git');
        mkdirSync(join(clone, 'data'), { recursive: true });
        const files = ['wordlist-overrides.json', 'rhyme-dict-overrides.json', 'applied-changes.log'];
        for (const f of files) copyFileSync(join('data', f), join(clone, 'data', f));
        git(clone, 'init', '-b', 'main');
        git(clone, 'config', 'user.name', 't'); git(clone, 'config', 'user.email', 't@t'); git(clone, 'config', 'commit.gpgsign', 'false');
        git(clone, 'add', '.'); git(clone, 'commit', '-m', 'init');
        git(tmp, 'init', '--bare', '-b', 'main', bare);
        git(clone, 'remote', 'add', 'origin', bare);
        git(clone, 'push', 'origin', 'main');
        const base = Object.fromEntries(files.map(f => [f, readFileSync(join(clone, 'data', f))]));

        // 假 Pages：前 2 次詞庫檔請求給舊檔（模擬 CDN 延遲），之後才給遠端 main 上的新檔；第 1 次請求時後台又套用一筆
        let polls = 0;
        const pages = http.createServer(async (req, res) => {
            const rel = req.url.split('?')[0].replace(/^\//, '');
            if (!rel.startsWith('data/') || !files.includes(rel.slice(5))) { res.writeHead(404); return res.end(); }
            if (rel === 'data/wordlist-overrides.json') {
                polls++;
                if (polls === 1) await applyKeys(['k3']);
            }
            let body = base[rel.slice(5)];
            if (polls > 2) body = Buffer.from(git(bare, 'show', `main:${rel}`), 'utf8');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(body);
        });
        servers.push(pages);
        const pagesUrl = await listen(pages);

        const runScript = () => new Promise((resolve, reject) => {
            const env2 = { ...process.env, LH_ADMIN_KEY: 'admin-test', PYTHONDONTWRITEBYTECODE: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', NO_PROXY: '127.0.0.1', no_proxy: '127.0.0.1' };
            const p = spawn('python3', ['-B', 'tools/corrections/writeback.py', '--apply', '--push', '--worker', bridgeUrl, '--site', pagesUrl + '/', '--repo', clone, '--poll-interval', '0.05', '--timeout', '10'], { env: env2 });
            let out = '', err = '';
            p.stdout.on('data', d => { out += d; });
            p.stderr.on('data', d => { err += d; });
            p.on('error', reject);
            p.on('close', code => resolve({ code, out, err }));
        });
        const bareCount = () => Number(git(bare, 'rev-list', '--count', 'main').trim());

        // 先套用 k1、k2，再讓腳本跑第一次
        await applyKeys(['k1', 'k2']);
        const t0 = Date.now();
        const r1 = await runScript();
        const text1 = `${r1.out}\n${r1.err}`;
        expect(r1.code, text1).toBe(0);
        expect(text1).not.toContain('admin-test');
        expect(text1).toContain('已清空這批 2 筆；寫回期間新套用的 1 筆仍留在修正層');
        expect(git(bare, 'show', 'main:data/wordlist-overrides.json')).toContain('測試詞');
        expect(git(bare, 'show', 'main:data/wordlist-overrides.json')).not.toContain('第三詞');
        const rhyme = git(bare, 'show', 'main:data/rhyme-dict-overrides.json');
        expect(rhyme).toContain('ㄔㄤ2');
        let doc = layer();
        expect(doc.entries.map(e => e.value)).toEqual(['第三詞']);
        expect([...doc.written].sort()).toEqual(['k1', 'k2']);
        expect(clears()).toBe(1);
        const afterFirst = bareCount();

        // 第二次：寫下剩下的 k3，一個新 commit、push、等線上生效、清空
        const r2 = await runScript();
        expect(r2.code, `${r2.out}\n${r2.err}`).toBe(0);
        expect(`${r2.out}${r2.err}`).not.toContain('admin-test');
        expect(bareCount()).toBe(afterFirst + 1);
        expect(git(bare, 'show', 'main:data/wordlist-overrides.json')).toContain('第三詞');
        doc = layer();
        expect(doc.entries).toEqual([]);
        expect([...doc.written].sort()).toEqual(['k1', 'k2', 'k3']);
        expect(clears()).toBe(2);

        // 第三次：沒事可做，沒有新 commit、沒有清空請求
        const r3 = await runScript();
        expect(r3.code, `${r3.out}\n${r3.err}`).toBe(0);
        expect(bareCount()).toBe(afterFirst + 1);
        expect(clears()).toBe(2);
        console.log(`端到端：三次執行共 ${Date.now() - t0} ms，詞庫檔輪詢 ${polls} 次`);
    } finally {
        for (const s of servers) s.close();
        rmSync(tmp, { recursive: true, force: true });
    }
});
