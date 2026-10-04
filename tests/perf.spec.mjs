// PERF-02 降速量測：大量字卡出現時，手機級 CPU（4×／6× 降速）下有沒有凍結。
// 計時測試要獨占 CPU，只用 npm run perf 跑（單一 worker）；一般 npm test 會自動略過。
//   npm run perf          LH_PERF=1       檢查：長任務、總阻塞時間、第一張字卡出現時間、與改版前基準的倍數
//   npm run perf:record   LH_PERF=record  重新量測並寫入 tests/fixtures/perf-baseline.json（只在要換基準時用）
// 數字是「同一台機器、同一次執行」的相對比較；基準檔記錄了量測時的 CPU，換機器就不要拿絕對值互比。
import { test, expect } from '@playwright/test';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { bootPage } from './helpers.mjs';

const MODE = process.env.LH_PERF || '';
const BASELINE_FILE = new URL('./fixtures/perf-baseline.json', import.meta.url);
const RUNS = 3;   // 每個情境固定量 3 次取中位數

// 情境：bpm-off = 「ㄅ ㄆ ㄇ」並關掉隱藏冷僻字（約 1633 張，最大查詢）；golden-max = golden 最大的 689 張
const CASES = {
    'bpm-off': { query: 'ㄅ ㄆ ㄇ', hideRare: false },
    'golden-max': { query: 'ㄢ ㄧㄥ', hideRare: true },
};

// 機器速度校正：計畫的絕對門檻（4× 不超過 150ms／總阻塞 300ms／第一張 400ms；6× 不超過 250ms）是 Mac 等級的數字。
// 研究階段在 Mac 上量到「改版前」最大查詢 6× 的最長任務約 363–423ms（取 393）；雲端容器（Xeon 2.1GHz、無 GPU）同一件事量到 2889ms，
// 所以同一份基準檔裡存一個 speedFactor = 改版前實測 ÷ 393，所有絕對門檻乘上它；在 Mac 上重新量基準時它會是 1（嚴格版）。
// 也可以用環境變數 LH_PERF_SCALE 直接指定（例如在真的 Mac 上設 1 看嚴格版）。
const MAC_REF_MS = 393;
function scaleFactor() {
    const env = Number(process.env.LH_PERF_SCALE);
    if (env > 0) return env;
    return Math.max(1, Number(readBaseline().speedFactor) || 1);
}

const median = xs => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

// 在頁面內量一次：清空 → 送出 input 事件 → 記錄第一張字卡出現的時間 → 等畫完 → 等 300ms 收遲到的長任務
function runInPage({ query }) {
    return new Promise(resolve => {
        const raf = () => new Promise(r => requestAnimationFrame(r));
        const input = document.getElementById('searchInput');
        const root = document.getElementById('resultsContainer');
        (async () => {
            // 先回到空白畫面，讓每次都是「第一次搜尋」
            input.value = '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            await raf(); await raf();
            await new Promise(r => setTimeout(r, 200));
            window.__perfEntries.length = 0;

            let firstCardAt = null;
            const mo = new MutationObserver(() => {
                if (firstCardAt === null && root.querySelector('.char-card')) firstCardAt = performance.now();
            });
            mo.observe(root, { childList: true, subtree: true });

            const t0 = performance.now();
            input.value = query;
            input.dispatchEvent(new Event('input', { bubbles: true }));

            // 等畫完：有 data-render 就等 done；舊版沒有這個屬性，就等第一張字卡出現後再過兩個畫面
            const hasState = () => root.hasAttribute('data-render');
            const finished = () => {
                const s = root.getAttribute('data-render');
                return s === 'done' || s === 'idle';
            };
            const deadline = t0 + 60000;
            let sawCard = false;
            while (performance.now() < deadline) {
                await raf();
                if (root.querySelector('.char-card')) sawCard = true;
                if (hasState()) { if (finished() && sawCard) break; }
                else if (sawCard) { await raf(); await raf(); break; }
            }
            mo.disconnect();
            await new Promise(r => setTimeout(r, 300));

            const durs = window.__perfEntries.map(e => e.duration);
            resolve({
                maxLongTask: durs.length ? Math.max(...durs) : 0,
                tbt: durs.reduce((s, d) => s + Math.max(0, d - 50), 0),
                firstCardMs: firstCardAt === null ? -1 : firstCardAt - t0,
                longTasks: durs.length,
                cards: root.querySelectorAll('.char-card').length,
            });
        })();
    });
}

async function measure(browser, caseId, rate) {
    const def = CASES[caseId];
    const { context, page } = await bootPage(browser);
    try {
        if (!def.hideRare) {
            await page.evaluate(() => {
                const el = document.getElementById('hideRare');
                el.checked = false;
                el.dispatchEvent(new Event('change', { bubbles: true }));
            });
        }
        // 長任務觀察器要在開機完成之後才掛（開機本身的長任務不算）
        await page.evaluate(() => {
            window.__perfEntries = [];
            new PerformanceObserver(list => { for (const e of list.getEntries()) window.__perfEntries.push({ duration: e.duration }); })
                .observe({ type: 'longtask' });
        });
        const cdp = await context.newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate });
        const runs = [];
        for (let i = 0; i < RUNS; i++) runs.push(await page.evaluate(runInPage, def));
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
        const r = {
            maxLongTask: median(runs.map(x => x.maxLongTask)),
            tbt: median(runs.map(x => x.tbt)),
            firstCardMs: median(runs.map(x => x.firstCardMs)),
        };
        for (const k of Object.keys(r)) r[k] = Math.round(r[k] * 10) / 10;
        return { ...r, runs };
    } finally {
        await context.close();
    }
}

function readBaseline() {
    return JSON.parse(readFileSync(BASELINE_FILE, 'utf8'));
}

test.describe('降速', () => {
    test.describe.configure({ mode: 'serial' });
    test.setTimeout(240_000);

    // 檢查模式：4×／6× 降速下，最大查詢與 golden 最大查詢都不能出現長時間凍結
    for (const [caseId, label] of [['bpm-off', 'ㄅ ㄆ ㄇ（不隱藏冷僻字，最大查詢）'], ['golden-max', 'ㄢ ㄧㄥ（golden 最大查詢）']]) {
        test(`降速：4× ${caseId} ${label} 無超過 150ms 的長任務、總阻塞 ≤ 300ms、第一張字卡 ≤ 400ms`, async ({ browser }) => {
            test.skip(MODE !== '1', '計時測試：用 npm run perf（單一 worker）');
            const m = await measure(browser, caseId, 4);
            console.log(`[perf] ${caseId}@4`, JSON.stringify({ maxLongTask: m.maxLongTask, tbt: m.tbt, firstCardMs: m.firstCardMs }), 'runs=' + JSON.stringify(m.runs.map(x => Math.round(x.maxLongTask))));
            const k = scaleFactor();
            console.log(`[perf] 機器速度校正 ×${k}（門檻 150ms／300ms／400ms 乘上它）`);
            expect(m.runs.every(x => x.cards > 0)).toBe(true);
            expect(m.maxLongTask).toBeLessThanOrEqual(150 * k);
            expect(m.tbt).toBeLessThanOrEqual(300 * k);
            expect(m.firstCardMs).toBeGreaterThan(0);
            expect(m.firstCardMs).toBeLessThanOrEqual(400 * k);
        });
    }
    for (const [caseId, label] of [['bpm-off', 'ㄅ ㄆ ㄇ（不隱藏冷僻字，最大查詢）'], ['golden-max', 'ㄢ ㄧㄥ（golden 最大查詢）']]) {
        test(`降速：6× ${caseId} ${label} 無超過 250ms 的長任務`, async ({ browser }) => {
            test.skip(MODE !== '1', '計時測試：用 npm run perf（單一 worker）');
            const m = await measure(browser, caseId, 6);
            console.log(`[perf] ${caseId}@6`, JSON.stringify({ maxLongTask: m.maxLongTask, tbt: m.tbt, firstCardMs: m.firstCardMs }), 'runs=' + JSON.stringify(m.runs.map(x => Math.round(x.maxLongTask))));
            const k = scaleFactor();
            console.log(`[perf] 機器速度校正 ×${k}（門檻 250ms 乘上它）`);
            expect(m.runs.every(x => x.cards > 0)).toBe(true);
            expect(m.maxLongTask).toBeLessThanOrEqual(250 * k);
        });
    }
    test('降速：最大查詢 6× 比改版前快至少 3 倍', async ({ browser }) => {
        test.skip(MODE !== '1', '計時測試：用 npm run perf（單一 worker）');
        const base = readBaseline().cases['bpm-off@6'];
        expect(base.maxLongTask).toBeGreaterThan(0);
        const m = await measure(browser, 'bpm-off', 6);
        const ratio = base.maxLongTask / m.maxLongTask;   // 單純相除，不四捨五入
        console.log(`[perf] bpm-off@6 基準 ${base.maxLongTask}ms → 現在 ${m.maxLongTask}ms，倍數 ${ratio.toFixed(2)}`);
        expect(ratio).toBeGreaterThanOrEqual(3);
    });

    test('降速：重新量測並寫入改版前基準（LH_PERF=record）', async ({ browser }) => {
        test.skip(MODE !== 'record', '只在 npm run perf:record 時執行');
        const cases = {};
        for (const caseId of Object.keys(CASES)) {
            for (const rate of [4, 6]) {
                const { runs, ...m } = await measure(browser, caseId, rate);
                console.log(`[perf] ${caseId}@${rate}`, JSON.stringify(m), 'runs=' + JSON.stringify(runs.map(x => Math.round(x.maxLongTask))));
                expect(runs.every(x => x.cards > 0)).toBe(true);
                cases[`${caseId}@${rate}`] = m;
            }
        }
        const out = {
            recordedAt: new Date().toISOString(),
            commit: execSync('git rev-parse HEAD').toString().trim(),
            cpu: os.cpus()[0].model,
            speedFactor: Math.max(1, Math.round(cases['bpm-off@6'].maxLongTask / MAC_REF_MS * 100) / 100),
            cases,
        };
        writeFileSync(BASELINE_FILE, JSON.stringify(out, null, 2) + '\n');
    });
});
