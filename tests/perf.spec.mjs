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
            cases,
        };
        writeFileSync(BASELINE_FILE, JSON.stringify(out, null, 2) + '\n');
    });
});
