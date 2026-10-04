// Phase 5 多裝置版面與縮放
// 每個測試名稱開頭是主題標籤（縮放：…），之後各 plan 依標籤加入 flow／面板／鍵盤等測試
import { test, expect } from '@playwright/test';
import { bootPage } from './helpers.mjs';
import { DEVICES } from './layout-lib.mjs';

const SCALE_KEY = 'lh:uiScale';

// 讀出縮放相關的所有狀態，讓每個測試只比一份物件
const readScale = page => page.evaluate(() => ({
    cssVar: document.documentElement.style.getPropertyValue('--ui-scale'),
    rootFont: getComputedStyle(document.documentElement).fontSize,
    label: document.getElementById('MzoomValue').textContent,
    stored: lhGet('lh:uiScale'),
    current: lhUiScale,
}));

for (const [name, device] of [['桌機', DEVICES.desktop], ['手機', DEVICES.phone]]) {
    test(`縮放：➕ 一次 → 105%，根字級 16.8px，存進 lh:uiScale（${name}）`, async ({ browser }) => {
        const { context, page, errors } = await bootPage(browser, { device });
        try {
            await page.locator('#MzoomIn').click();   // 真的點按鈕，走完整事件路徑
            expect(await readScale(page)).toEqual({ cssVar: '1.05', rootFont: '16.8px', label: '105%', stored: '105', current: 105 });
            // 舊的 CSS zoom 不能再出現
            const zoom = await page.evaluate(() => {
                const c = document.querySelector('.container');
                return { inline: c.style.zoom, computed: getComputedStyle(c).zoom };
            });
            expect(zoom).toEqual({ inline: '', computed: '1' });
            expect(errors).toEqual([]);
        } finally { await context.close(); }
    });
}

// 儲存值 → 實際採用的百分比（含壞值與超出範圍）；undefined 代表完全沒存
const STORED_CASES = [
    ['105', 105], ['150', 150], ['155', 150], ['170', 150],
    ['50', 50], ['45', 50], ['0', 50], ['-20', 50],
    [undefined, 100], ['', 100], ['   ', 100], ['abc', 100],
];

test('縮放：重開沿用、壞值回 100、超出範圍夾回', async ({ browser }) => {
    for (const [stored, expected] of STORED_CASES) {
        const storage = stored === undefined ? {} : { [SCALE_KEY]: stored };
        const { context, page } = await bootPage(browser, { storage });
        try {
            expect(await readScale(page), `存的是 ${JSON.stringify(stored)}`).toMatchObject({
                current: expected,
                label: expected + '%',
                rootFont: expected / 100 * 16 + 'px',
                cssVar: String(expected / 100),
            });
        } finally { await context.close(); }
    }
    // 四捨五入規則：Math.round(n / 5) * 5（精度邊界）
    const { context, page } = await bootPage(browser, {});
    try {
        const out = await page.evaluate(() => [102, 102.5, 103, 97.4].map(x => lhNormalizeScale(x)));
        expect(out).toEqual([100, 105, 105, 95]);
    } finally { await context.close(); }
});

test('縮放：重新整理後在第一次繪製前就套用', async ({ browser }) => {
    const { context, page } = await bootPage(browser, {
        storage: { [SCALE_KEY]: '130' },
        // DOMContentLoaded 觸發時記下根字級，證明不是等開機流程跑完才補上；
        // 標籤由 layout.js 自己的 DOMContentLoaded 監聽補上（測試的監聽先註冊、會先跑），所以標籤改在 load 時讀
        init: () => {
            window.__fsAtDCL = {};
            document.addEventListener('DOMContentLoaded', () => {
                window.__fsAtDCL.font = getComputedStyle(document.documentElement).fontSize;
            });
            window.addEventListener('load', () => {
                window.__fsAtDCL.label = document.getElementById('MzoomValue').textContent;
            });
        },
    });
    try {
        expect(await page.evaluate(() => window.__fsAtDCL)).toEqual({ font: '20.8px', label: '130%' });
    } finally { await context.close(); }
});
