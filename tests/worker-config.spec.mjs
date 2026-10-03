// Worker 部署設定測試（不開瀏覽器）：toml 形狀、金鑰不進 git、離線 dry-run、KV id 沒填不准部署
import { test, expect } from '@playwright/test';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const toml = readFileSync('worker/wrangler.toml', 'utf8');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
const gitOk = (...args) => spawnSync('git', args).status === 0;

test('config：wrangler.toml 形狀', () => {
    expect(toml).toContain('name = "lucky-hawaii"');
    expect(toml).toContain('main = "src/index.js"');
    // keep_vars 必須在第一個 [ 表格之前，否則會被吃進表格而不生效
    const firstTable = toml.split('\n').findIndex(l => l.startsWith('['));
    const keepVars = toml.split('\n').findIndex(l => /^keep_vars\s*=\s*true/.test(l));
    expect(keepVars).toBeGreaterThanOrEqual(0);
    expect(keepVars).toBeLessThan(firstTable);
    expect(toml).toMatch(/crons\s*=\s*\[[^\]]*"17 19 \* \* \*"/);
    const required = toml.match(/required\s*=\s*\[([^\]]*)\]/)[1];
    for (const k of ['GEMINI_API_KEY', 'GROQ_API_KEY', 'USER_REPORT_KEY']) expect(required).toContain(`"${k}"`);
    const blocks = toml.split('[[kv_namespaces]]').slice(1).map(b => b.split(/\n\[/)[0]);
    expect(blocks).toHaveLength(2);
    expect(blocks.map(b => b.match(/binding\s*=\s*"([^"]+)"/)[1])).toEqual(['USER_FEEDBACK_KV', 'AI_STATE_KV']);
    for (const b of blocks) expect(b).toMatch(/^id\s*=\s*"[^"]+"/m);
    // 限流是選配（DEPLOY.md 步驟 7 允許整段刪掉，程式偵測不到就不限流），所以有這段才檢查內容
    if (toml.includes('[[ratelimits]]')) {
        expect(toml).toContain('name = "AI_LIMITER"');
        expect(toml).toMatch(/limit\s*=\s*20/);
        expect(toml).toMatch(/period\s*=\s*60/);
    }
    // 開發用開關只能從 --var 進來，正式設定檔連註解都不能出現
    for (const s of ['ALLOW_LOCAL_ORIGIN', 'GEMINI_BASE', 'GROQ_BASE', 'ATTEMPT_TIMEOUT_MS', 'CHAIN_BUDGET_MS']) expect(toml).not.toContain(s);
});

test('config：金鑰不在 git', () => {
    const tracked = git('ls-files', 'worker').split('\n').filter(Boolean);
    for (const f of ['worker/wrangler.toml', 'worker/.gitignore', 'worker/check-ids.mjs']) expect(tracked).toContain(f);
    expect(tracked.filter(f => f.includes('.dev.vars'))).toEqual([]);
    const files = git('ls-files').split('\n').filter(f => f && !f.startsWith('data/'));
    for (const f of files) {
        let text;
        try { text = readFileSync(f, 'utf8'); } catch (e) { continue; } // 已刪除或讀不了的檔案跳過
        expect(/AIza[0-9A-Za-z_-]{30,}/.test(text), `${f} 含 Google 金鑰樣式`).toBe(false);
        expect(/gsk_[0-9A-Za-z]{20,}/.test(text), `${f} 含 Groq 金鑰樣式`).toBe(false);
    }
    expect(gitOk('check-ignore', '-q', 'worker/.dev.vars')).toBe(true);
    expect(gitOk('check-ignore', '-q', 'worker/.wrangler/x')).toBe(true);
});

test('config：dry-run 部署離線可跑、重跑結果相同', () => {
    test.setTimeout(90_000);
    const run = () => {
        const outdir = mkdtempSync(join(tmpdir(), 'lh-dryrun-'));
        const r = spawnSync('npx', ['wrangler', 'deploy', '--dry-run', '--outdir', outdir, '--config', 'worker/wrangler.toml'],
            { encoding: 'utf8', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
        return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
    };
    const statusCmd = () => git('status', '--porcelain', '--', 'worker', 'package.json', 'package-lock.json');
    const before = statusCmd();
    for (const r of [run(), run()]) {
        expect(r.status, r.out).toBe(0);
        const expected = ['USER_FEEDBACK_KV', 'AI_STATE_KV', ...(toml.includes('[[ratelimits]]') ? ['AI_LIMITER'] : [])];
        for (const b of expected) expect(r.out).toContain(b);
        expect(r.out).not.toContain('WARNING');
    }
    // 重跑不留下任何改動（FND-05 冪等）；和跑之前比對，所以提交前後都成立
    expect(statusCmd()).toBe(before);
});

test('config：KV id 沒填不准部署', () => {
    const check = path => spawnSync('node', ['worker/check-ids.mjs', path], { encoding: 'utf8' });
    const hex = () => randomBytes(16).toString('hex');
    const dir = mkdtempSync(join(tmpdir(), 'lh-ids-'));
    const ids = toml.match(/^id\s*=\s*"[^"]+"/gm);
    expect(ids).toHaveLength(2);
    // 一律用 fixture：不依賴正式 wrangler.toml 目前是佔位字串還是已填真實 id（Andy 填完 id 後這題也要過）
    const fixture = (name, a, b) => {
        const f = join(dir, name);
        writeFileSync(f, toml.replace(ids[0], `id = "${a}"`).replace(ids[1], `id = "${b}"`));
        return f;
    };
    const placeholder = check(fixture('placeholder.toml', 'REPLACE_WITH_USER_FEEDBACK_KV_ID', 'REPLACE_WITH_AI_STATE_KV_ID'));
    expect(placeholder.status).toBe(1);
    expect(placeholder.stderr).toContain('KV id');
    expect(check(fixture('both.toml', hex(), hex())).status).toBe(0);
    expect(check(fixture('one.toml', hex(), 'REPLACE_WITH_AI_STATE_KV_ID')).status).toBe(1);
    // 兩個 id 貼成同一個：格式都對，但會讓健康檢查資料寫進回報 KV，一樣不准部署
    const same = hex();
    const dup = check(fixture('dup.toml', same, same));
    expect(dup.status).toBe(1);
    expect(dup.stderr).toContain('不能相同');
});
