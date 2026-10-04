// PERF-02 字卡分批出現：狀態（data-render）、批次邊界、載入中提示、讀屏文字、取消、捲動、背景分頁
// 最後畫面和一次畫完要一模一樣由 golden.spec.mjs 負責；這裡只測「過程」。
import { test, expect } from '@playwright/test';
import { bootPage, settle } from './helpers.mjs';

// 大查詢：ㄢ 並關掉「隱藏冷僻字」（約 1077 張，要跑很多格）
async function showAllRare(page) {
    await page.evaluate(() => {
        const el = document.getElementById('hideRare');
        el.checked = false;
        el.dispatchEvent(new Event('change', { bubbles: true }));
    });
}

// 在頁面內記下 #resultsContainer 的 data-render 變化順序、是否出現過 .render-status、lh:render-done 次數
async function installProbe(page) {
    await page.evaluate(() => {
        const root = document.getElementById('resultsContainer');
        window.__probe = { olds: [], status: false, done: 0 };   // olds：每次改變前的舊值，加上現在的值就是完整順序
        new MutationObserver(recs => {
            for (const r of recs) {
                if (r.type === 'attributes') window.__probe.olds.push(r.oldValue);
                else if ([...r.addedNodes].some(n => n.classList && n.classList.contains('render-status'))) window.__probe.status = true;
            }
        }).observe(root, { attributes: true, attributeOldValue: true, attributeFilter: ['data-render'], childList: true });
        window.addEventListener('lh:render-done', () => { window.__probe.done++; });
    });
}

const renderState = page => page.evaluate(() => document.getElementById('resultsContainer').getAttribute('data-render'));
const waitState = (page, s) => page.waitForFunction(v => document.getElementById('resultsContainer').getAttribute('data-render') === v, s);

test.describe('分批', () => {
    test('分批：狀態 first → more → done，空白與無結果是 idle', async ({ browser }) => {
        const { context, page, errors } = await bootPage(browser);
        try {
            await showAllRare(page);
            await installProbe(page);
            // 真的送出 input 事件，再等一個 macrotask：此時第一批已同步畫完，其餘還在排隊
            const mid = await page.evaluate(async () => {
                const input = document.getElementById('searchInput');
                input.value = 'ㄢ';
                input.dispatchEvent(new Event('input', { bubbles: true }));
                await new Promise(r => setTimeout(r, 0));
                const root = document.getElementById('resultsContainer');
                return {
                    state: root.getAttribute('data-render'),
                    busy: root.getAttribute('aria-busy'),
                    cards: root.querySelectorAll('.char-card').length,
                    header: root.querySelector('.results-count')?.textContent.trim(),
                };
            });
            expect(mid.state).toBe('more');
            expect(mid.busy).toBe('true');
            expect(mid.cards).toBeGreaterThanOrEqual(48);
            expect(mid.header).toMatch(/^找到 \d+ 個字$/);
            const total = Number(mid.header.match(/\d+/)[0]);
            expect(total).toBeGreaterThan(300);                 // 真的是大查詢，才會分很多格
            expect(mid.cards).toBeLessThan(total);

            await settle(page);
            const end = await page.evaluate(() => {
                const root = document.getElementById('resultsContainer');
                return { state: root.getAttribute('data-render'), busy: root.hasAttribute('aria-busy'), cards: root.querySelectorAll('.char-card').length, status: !!root.querySelector('.render-status'), states: [...window.__probe.olds, root.getAttribute('data-render')] };
            });
            expect(end.state).toBe('done');
            expect(end.busy).toBe(false);
            expect(end.status).toBe(false);
            expect(end.cards).toBe(total);
            // 過程：idle（或初始沒有）→ first → more → done，沒有別的狀態
            const seq = end.states.filter(Boolean);
            expect(seq.slice(-3)).toEqual(['first', 'more', 'done']);
            expect(seq.every(s => ['idle', 'first', 'more', 'done'].includes(s))).toBe(true);

            // 清空輸入 → idle，沒有狀態列
            await page.fill('#searchInput', '');
            await settle(page);
            expect(await renderState(page)).toBe('idle');
            expect(await page.locator('#resultsContainer .empty-state h3').textContent()).toBe('開始搜尋');
            expect(await page.locator('.render-status').count()).toBe(0);
            expect(await page.locator('#resultsContainer').getAttribute('aria-busy')).toBeNull();

            // 零結果 → 沒有找到結果，idle
            await page.fill('#searchInput', 'zzz');
            await settle(page);
            expect(await renderState(page)).toBe('idle');
            expect((await page.locator('#resultsContainer .empty-state h3').textContent()).trim()).toBe('沒有找到結果');
            expect(await page.locator('.render-status').count()).toBe(0);
            expect(errors).toEqual([]);
        } finally {
            await context.close();
        }
    });

    test('分批：剛好 48 張一次畫完、49 張要多一格', async ({ browser }) => {
        const { context, page, errors } = await bootPage(browser);
        try {
            await installProbe(page);
            // 不送 input 事件，直接把切好數量的結果交給 displayResults；先把會改變數量的過濾都關掉
            const run = n => page.evaluate(async n => {
                document.getElementById('hideRare').checked = false;
                document.getElementById('filterDuplicate').checked = false;
                document.getElementById('showPinyin').checked = true;
                document.getElementById('searchInput').value = 'ㄢ';
                window.__probe.status = false;
                displayResults(searchRhyme('ㄢ').slice(0, n));
                const root = document.getElementById('resultsContainer');
                const sync = {
                    state: root.getAttribute('data-render'),
                    cards: root.querySelectorAll('.char-card').length,
                    statusNow: !!root.querySelector('.render-status'),
                    statusEver: window.__probe.status,
                    text: root.querySelector('.render-status')?.textContent ?? null,
                };
                await new Promise(r => requestAnimationFrame(r));   // 排在 displayResults 的那一格之後
                const after = {
                    state: root.getAttribute('data-render'),
                    cards: root.querySelectorAll('.char-card').length,
                    statusNow: !!root.querySelector('.render-status'),
                    header: root.querySelector('.results-count').textContent.trim(),
                };
                return { sync, after };
            }, n);

            const r48 = await run(48);
            expect(r48.sync.state).toBe('done');             // displayResults 還沒回來就已經畫完
            expect(r48.sync.cards).toBe(48);
            expect(r48.sync.statusNow).toBe(false);
            expect(r48.sync.statusEver).toBe(false);          // 狀態列連出現過都沒有
            expect(r48.after.header).toBe('找到 48 個字');

            const r49 = await run(49);
            expect(r49.sync.state).toBe('more');
            expect(r49.sync.cards).toBe(48);
            expect(r49.sync.statusNow).toBe(true);
            expect(r49.sync.text).toBe('載入中… 已顯示 48 / 49 字');
            expect(r49.after.state).toBe('done');              // 再一格就畫完
            expect(r49.after.cards).toBe(49);
            expect(r49.after.statusNow).toBe(false);
            expect(r49.after.header).toBe('找到 49 個字');
            expect(errors).toEqual([]);
        } finally {
            await context.close();
        }
    });

    test('分批：載入中提示與讀屏文字', async ({ browser }) => {
        const { context, page, errors } = await bootPage(browser);
        try {
            await showAllRare(page);
            const mid = await page.evaluate(async () => {
                const input = document.getElementById('searchInput');
                input.value = 'ㄢ';
                input.dispatchEvent(new Event('input', { bubbles: true }));
                await new Promise(r => setTimeout(r, 0));
                const root = document.getElementById('resultsContainer');
                const status = root.lastElementChild;
                const live = document.getElementById('renderLive');
                return {
                    isStatus: !!status && status.classList.contains('render-status'),
                    text: status?.textContent ?? '',
                    height: status ? status.getBoundingClientRect().height : 0,
                    total: Number(root.querySelector('.results-count').textContent.match(/\d+/)[0]),
                    liveInside: root.contains(live),
                    liveText: live.textContent,
                    liveAria: live.getAttribute('aria-live'),
                    liveHidden: ['absolute', 'fixed'].includes(getComputedStyle(live).position) && live.getBoundingClientRect().width <= 1 && live.getBoundingClientRect().height <= 1,
                };
            });
            expect(mid.isStatus).toBe(true);
            const m = mid.text.match(/^載入中… 已顯示 ([\d,]+) \/ ([\d,]+) 字$/);
            expect(m).not.toBeNull();
            expect(m[2]).toBe(mid.total.toLocaleString('zh-TW'));     // 有千分位逗號（1,077 這類）
            expect(Number(m[1].replace(/,/g, ''))).toBeGreaterThanOrEqual(48);
            expect(mid.height).toBeGreaterThanOrEqual(44);
            expect(mid.liveInside).toBe(false);                        // 讀屏文字放在容器外，不污染 golden 的 innerHTML
            expect(mid.liveText).toBe('');                             // 還在載入時不唸
            expect(mid.liveAria).toBe('polite');
            expect(mid.liveHidden).toBe(true);

            await settle(page);
            expect(await page.locator('.render-status').count()).toBe(0);
            expect(await page.locator('#renderLive').textContent()).toBe(`已顯示全部 ${mid.total} 字`);
            expect(errors).toEqual([]);
        } finally {
            await context.close();
        }
    });

    test('分批：每次畫完只發一次 lh:render-done', async ({ browser }) => {
        const { context, page, errors } = await bootPage(browser);
        try {
            await showAllRare(page);
            await installProbe(page);
            const done = () => page.evaluate(() => window.__probe.done);
            await page.fill('#searchInput', 'ㄢ');
            await settle(page);
            expect(await done()).toBe(1);
            await page.waitForTimeout(150);                            // 之後不會再補發
            expect(await done()).toBe(1);

            await page.fill('#searchInput', '安');
            await settle(page);
            expect(await done()).toBe(2);

            // 畫到一半立刻換搜尋：前一輪被取消，不發事件，只算最後那一輪
            await page.evaluate(async () => {
                const input = document.getElementById('searchInput');
                input.value = 'ㄢ';
                input.dispatchEvent(new Event('input', { bubbles: true }));
                await new Promise(r => setTimeout(r, 0));
                if (document.getElementById('resultsContainer').getAttribute('data-render') !== 'more') throw new Error('第一輪應該還在分批中');
                input.value = 'ㄧㄥ';
                input.dispatchEvent(new Event('input', { bubbles: true }));
            });
            await settle(page);
            await page.waitForTimeout(150);
            expect(await done()).toBe(3);
            expect(errors).toEqual([]);
        } finally {
            await context.close();
        }
    });

    test('分批：單一結果直接 done', async ({ browser }) => {
        const { context, page, errors } = await bootPage(browser);
        try {
            await installProbe(page);
            const r = await page.evaluate(() => {
                document.getElementById('hideRare').checked = false;
                document.getElementById('filterDuplicate').checked = false;
                document.getElementById('searchInput').value = 'ㄢ';
                displayResults(searchRhyme('ㄢ').slice(0, 1));
                const root = document.getElementById('resultsContainer');
                return {
                    state: root.getAttribute('data-render'),
                    cards: root.querySelectorAll('.char-card').length,
                    status: !!root.querySelector('.render-status'),
                    header: root.querySelector('.results-count').textContent.trim(),
                    busy: root.hasAttribute('aria-busy'),
                    done: window.__probe.done,
                };
            });
            expect(r).toEqual({ state: 'done', cards: 1, status: false, header: '找到 1 個字', busy: false, done: 1 });
            expect(errors).toEqual([]);
        } finally {
            await context.close();
        }
    });
});
