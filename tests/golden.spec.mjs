// Golden 測試：把「畫面上實際呈現的查韻結果」與 v0.96 快照比對
// 一般 npm test 只比對；只有 npm run golden:update（UPDATE_GOLDEN=1）才會寫檔
import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { bootPage, settle } from './helpers.mjs';

const GOLDEN_DIR = new URL('./golden/', import.meta.url);
const UPDATE = process.env.UPDATE_GOLDEN === '1';

// 每個案例一個 id，快照檔名就是 id.json（相同結果的輸入也各自一檔，不去重）
const CASES = [
    { id: 'zy-rhyme-an', input: 'ㄢ', nonEmpty: true },
];

// 在頁面內擷取畫面（只回傳純資料，hash 由 Node 端算）
function captureInPage() {
    const root = document.getElementById('resultsContainer');
    const rowOf = c => `${c.dataset.char}|${c.dataset.key}|${(c.querySelector('.mark-badge')?.textContent ?? '').trim()}`;
    const groups = [...root.querySelectorAll('.group-section')].map(g => ({
        title: g.querySelector('.group-title')?.innerHTML ?? '',
        rows: [...g.querySelectorAll('.char-card')].map(rowOf).join(' '),
    }));
    const header = (root.querySelector('.results-count')?.textContent
        ?? root.querySelector('h3')?.textContent ?? '').trim();
    return {
        header,
        rhymeDisplay: document.getElementById('aiRhymeDisplay')?.textContent ?? '',
        chips: [...document.querySelectorAll('#polyphonicChips .poly-chip')]
            .map(c => c.dataset.reading + (c.classList.contains('active') ? '*' : '')),
        groups,
        flat: groups.length ? null : [...root.querySelectorAll('.char-card')].map(rowOf).join(' '),
        cardCount: root.querySelectorAll('.char-card').length,
        html: root.innerHTML,
    };
}

async function capture(page) {
    const { html, ...rest } = await page.evaluate(captureInPage);
    const htmlSha1 = createHash('sha1').update(html.replace(/\s+/g, ' ').trim()).digest('hex');
    return { ...rest, htmlSha1 };
}

for (const c of CASES) {
    test(c.id, async ({ browser }) => {
        const storage = c.inputMode ? { haoYunQi_inputMode: c.inputMode } : {};
        const { context, page, errors, offOrigin } = await bootPage(browser, { storage });
        try {
            await page.fill('#searchInput', c.input);
            await settle(page);
            // 固定順序 common → initial → tone；每個案例都用全新頁面，
            // 因為字卡顏色 class 依賴全域狀態（lastTarget／colorClass），跨輸入共用頁面會互相影響
            const modes = { common: await capture(page) };
            for (const m of ['initial', 'tone']) {
                await page.click(`.mode-button[data-mode="${m}"]`);
                await settle(page);
                modes[m] = await capture(page);
            }
            const actual = { id: c.id, input: c.input, inputMode: c.inputMode ?? 'auto', chipIndex: c.chipIndex ?? null, modes };
            const file = new URL(c.id + '.json', GOLDEN_DIR);
            if (UPDATE) {
                // 絕不拍壞掉的頁面
                expect(errors, '擷取時頁面出現錯誤').toEqual([]);
                if (c.nonEmpty) for (const m of Object.keys(modes)) {
                    expect(modes[m].cardCount, `${c.id} ${m} 應有字卡`).toBeGreaterThan(0);
                }
                writeFileSync(file, JSON.stringify(actual, null, 2) + '\n');
            } else {
                expect(existsSync(file), 'golden 檔不存在，請先執行 npm run golden:update').toBe(true);
                expect(actual).toEqual(JSON.parse(readFileSync(file, 'utf8')));
            }
            expect(errors).toEqual([]);
            expect(offOrigin).toEqual([]);
        } finally {
            await context.close();
        }
    });
}
