// 韻腳地圖的效能（10-03）：長歌不卡。計時的那一個只在 LH_PERF=1 且單一 worker 時跑（和 tests/perf.spec.mjs 一樣，要獨占 CPU）；
// 結構檢查（兩百行分析的耗時）每次都跑。門檻 50ms 乘上 LH_PERF_SCALE（機器比 Mac 慢時調大，預設 1）。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage } from './helpers.mjs';

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/v096-localStorage.json', import.meta.url), 'utf8'));
const LINES = ['我望著遠方的光', '獨自站在窗', '走過熟悉的街道', '終於我也回到', '你笑著說天亮', '不怕前方的路遙'];
const lines = n => Array.from({ length: n }, (_, i) => LINES[i % LINES.length]).join('\n');
const typed = (id, type, text) => ({ id, type, custom: '', color: '', height: null, label: '', text, collapsed: false });
const storage = sections => ({
    ...FIXTURE, 'lh:schema': '2', 'lh:songs': JSON.stringify([{ id: 's1', title: '長歌', sections, hashtags: [], context: '', createdAt: 1, updatedAt: 1 }]),
    'lh:activeSong': 's1', leftPanelCollapsed: 'false', rightPanelCollapsed: 'false',
});

test('效能：一百五十行連續打字沒有超過 50ms 的長任務', async ({ browser }) => {
    test.skip(process.env.LH_PERF !== '1', '計時測試：LH_PERF=1 並用 --workers=1');
    test.setTimeout(120_000);
    const { context, page, errors } = await bootPage(browser, {
        storage: storage([typed('sa', 'verse', lines(150)), typed('sb', 'chorus', lines(50))]),
    });
    // 長任務觀察器在開機完成之後才掛（開機本身的長任務不算）
    await page.evaluate(() => {
        window.__perfEntries = [];
        new PerformanceObserver(l => { for (const e of l.getEntries()) window.__perfEntries.push({ duration: e.duration }); }).observe({ type: 'longtask' });
        const ta = document.querySelector('.section-textarea');
        ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
    });
    expect(await page.locator('.lyrics-section').first().locator('.rm-hl').count(), '先確認一百五十行真的上了色').toBeGreaterThan(100);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    for (let i = 0; i < 40; i++) {
        if (i === 10 || i === 20 || i === 30) await page.keyboard.press('Enter');
        else await page.keyboard.type('韻愛光窗'[i % 4]);
        await page.waitForTimeout(60);
    }
    await page.waitForTimeout(1500);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    expect(await page.evaluate(() => document.querySelector('.section-textarea').value.split('\n').length), '打進去了：三個 Enter').toBe(153);
    expect(await page.locator('.lyrics-section').first().locator('.rm-hl').count(), '打完之後重畫過').toBeGreaterThan(150);
    const durs = await page.evaluate(() => window.__perfEntries.map(e => e.duration));
    const longest = durs.length ? Math.max(...durs) : 0;
    const limit = 50 * Number(process.env.LH_PERF_SCALE || 1);
    console.log(`[perf] 韻腳地圖 150 行 4× 最長任務 ${Math.round(longest)}ms（${durs.length} 個長任務，門檻 ${limit}ms）`);
    expect(longest).toBeLessThanOrEqual(limit);
    expect(errors).toEqual([]);
    await context.close();
});

test('效能：兩百行分析在 20ms 內', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub' });
    const ms = await page.evaluate(text => {
        const runs = [];
        for (let i = 0; i < 5; i++) {
            const t0 = performance.now();
            lhRhymeAnalyze(text, { strict: false, skipParticles: true }, null);
            runs.push(performance.now() - t0);
        }
        return runs.sort((a, b) => a - b)[2];
    }, lines(200));
    console.log(`[perf] lhRhymeAnalyze 200 行中位數 ${ms.toFixed(2)}ms`);
    expect(ms).toBeLessThan(20);
    expect(errors).toEqual([]);
    await context.close();
});
