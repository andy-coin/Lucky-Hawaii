// Phase 6 詞庫清洗流程：Python 單元測試與已提交詞庫包的離線驗證
// 這兩個測試不連網、不需要 AI 金鑰、不碰使用者的下載快取。
import { test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 一律用暫存快取、清空金鑰，並禁止 Python 寫 __pycache__
const env = () => ({
    ...process.env,
    LEX_CACHE_DIR: mkdtempSync(join(tmpdir(), 'lex-')),
    GEMINI_API_KEY: '',
    LEX_AI_URL: '',
    PYTHONDONTWRITEBYTECODE: '1',
});

const py = (args) => {
    const r = spawnSync('python3', ['-B', ...args], { encoding: 'utf8', timeout: 180_000, env: env() });
    // 找不到 python3 是環境缺東西，不能默默跳過
    if (r.error && r.error.code === 'ENOENT') throw new Error('需要 Python 3.9 以上（python3）');
    if (r.error) throw r.error;
    return r;
};

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

test('詞庫工具：Python 單元測試全過（離線、不需金鑰）', () => {
    const r = py(['-m', 'unittest', 'discover', '-s', 'tools/lexicon/tests', '-t', 'tools/lexicon', '-v']);
    const out = `${r.stdout}\n${r.stderr}`;
    expect(r.status, out).toBe(0);
    const ran = /Ran (\d+) tests?/.exec(r.stderr);
    expect(ran, out).not.toBeNull();
    expect(Number(ran[1]), out).toBeGreaterThanOrEqual(20);
    expect(r.stderr, out).toMatch(/\nOK/);
    // 範例詞表（可理解性標準）一定要跟著跑，不能被悄悄略過
    expect(r.stderr, out).toContain('test_samples');
    expect(r.stderr, out).toContain('test_every_sample_gets_the_expected_outcome_and_rule');
    expect(findPycache('tools'), '工具不可留下 __pycache__').toEqual([]);
});

test('詞庫工具：已提交的詞庫包通過離線驗證', () => {
    const r = py(['tools/lexicon/build.py', 'verify']);
    const out = `${r.stdout}\n${r.stderr}`;
    expect(r.status, out).toBe(0);
    expect(r.stdout, out).toContain('驗證通過');
});
