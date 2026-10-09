// Phase 7 寫回腳本：Python 單元測試（假 Worker 只連 127.0.0.1、暫存 git repo），不碰真正的資料檔、金鑰與遠端。
import { test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

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
