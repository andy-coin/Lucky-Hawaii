// Phase 5 截圖基準：版面全部做完之後拍的「新版長相」，之後任何改動讓畫面變了都會被抓到
// 截圖基準是「每個平台各一組」（檔名尾巴是 -linux／-darwin，字型與抗鋸齒因平台而異，OD-8）：
//   - 雲端容器（linux）那一組已經拍好、已提交；
//   - 在 Andy 的 Mac 上第一次要先跑一次 npm run visual:update 產生 darwin 那一組，看過圖之後再提交；
//     在那之前 Mac 上 npm test 只會有這個檔案的「截圖」測試失敗（因為 Mac 的圖還不存在）。
// 更新基準的唯一方法：npm run visual:update。基準檔不存在時測試會失敗（絕不悄悄補圖後變綠）。
import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { bootPage, settle } from './helpers.mjs';
import { DEVICES, waitStill, setScale } from './layout-lib.mjs';

const DEVICE_NAMES = ['phone', 'tablet', 'desktop'];
// 5 種畫面 × 3 種裝置 = 15 張：結果（淺／深）、歌詞面板、AI 面板、客製顏色結果（UI-SPEC §14.2 的預設）
const STATES = [
    { name: 'results' },
    { name: 'results-dark', colorScheme: 'dark' },
    { name: 'lyrics' },
    { name: 'ai' },
    { name: 'custom', storage: { containerBg: '#fff7e6', textColor: '#1a202c', highlightColor: '#2b6cb0' } },
];
const SHOT = { animations: 'disabled', caret: 'hide', scale: 'css', maxDiffPixelRatio: 0.01 };

// 候選詞庫會洗牌，固定住亂數結果才可重現
const pinRandom = () => { Math.random = () => 0; };

// 比對截圖。基準檔不存在時一律失敗：只有 npm run visual:update（--update-snapshots）才會寫入基準（OD-8）
async function expectShot(page, name) {
    const mode = test.info().config.updateSnapshots;
    if ((mode === 'missing' || mode === 'none') && !existsSync(test.info().snapshotPath(name))) {
        throw new Error(`缺少截圖基準 ${name}（這個平台還沒有基準）：先跑 npm run visual:update 產生，看過圖之後再提交`);
    }
    await expect(page).toHaveScreenshot(name, SHOT);
}

// 打開側邊面板：900px 以下走分頁，其餘走兩側面板按鈕
async function openPanel(page, which) {
    await page.evaluate(w => {
        if (window.innerWidth <= 900) mobileTab(w);
        else if (w === 'lyrics') toggleLeftPanel();
        else toggleRightPanel();
    }, which);
}

async function drive(page, state) {
    await page.fill('#searchInput', 'ㄢ');
    await settle(page);
    if (state.name === 'lyrics') await openPanel(page, 'lyrics');
    if (state.name === 'ai') {
        await openPanel(page, 'ai');
        await page.evaluate(() => document.getElementById('generateBtn').click());
        await page.waitForSelector('.ai-word-card');
        await page.waitForFunction(() => !document.getElementById('generateBtn').disabled);
    }
    await waitStill(page);
}

for (const dev of DEVICE_NAMES) {
    for (const state of STATES) {
        test(`截圖：${dev} ${state.name}`, async ({ browser }) => {
            const { context, page } = await bootPage(browser, {
                device: DEVICES[dev],
                colorScheme: state.colorScheme,
                storage: state.storage,
                init: pinRandom,
            });
            try {
                await drive(page, state);
                await expectShot(page, `${dev}-${state.name}.png`);
            } finally {
                await context.close();
            }
        });
    }
}

// 後盾檢查 1：群組裡只有一個字時，字卡維持正常寬度靠左，不會被撐滿整排（auto-fill 格線）
for (const dev of DEVICE_NAMES) {
    test(`截圖：只有一個字的群組不會被撐滿（${dev}）`, async ({ browser }) => {
        const { context, page } = await bootPage(browser, { device: DEVICES[dev], init: pinRandom });
        try {
            await page.fill('#searchInput', 'ㄢ');
            await settle(page);
            // 同聲調並列模式，只留一個非冷僻字，等於「某個聲調群組剛好一個字」
            await page.evaluate(() => {
                const one = searchRhyme(document.getElementById('searchInput').value)
                    .find(r => getCharMark(r.char, r.zhuyin) !== 'rare');
                currentMode = 'tone';
                displayResults([one]);
            });
            await waitStill(page);
            const cards = page.locator('#resultsContainer .results-grid .char-card');
            await expect(cards).toHaveCount(1);
            const card = await cards.first().boundingBox();
            const grid = await page.locator('#resultsContainer .results-grid').first().boundingBox();
            expect(card.width / grid.width, `字卡 ${card.width}px／格線 ${grid.width}px`).toBeLessThan(0.4);
            expect(card.x, '字卡要靠左').toBeLessThanOrEqual(grid.x + 1);
        } finally {
            await context.close();
        }
    });
}

// 後盾檢查 2：手機 150% 搜尋 ㄓㄨㄤ（最長的拼音加聲調），讀音不超出字卡；再拍一張基準
test('截圖：手機 150% 長拼音不超出字卡', async ({ browser }) => {
    const { context, page } = await bootPage(browser, { device: DEVICES.phone, init: pinRandom });
    try {
        await setScale(page, 150);
        await page.fill('#searchInput', 'ㄓㄨㄤ');
        await settle(page);
        await waitStill(page);
        const bad = await page.evaluate(() => {
            const out = [];
            let n = 0;
            for (const p of document.querySelectorAll('#resultsContainer .char-pinyin')) {
                n++;
                const card = p.closest('.char-card').getBoundingClientRect();
                const range = document.createRange();
                range.selectNodeContents(p);
                const t = range.getBoundingClientRect();
                if (t.left < card.left - 0.5 || t.right > card.right + 0.5 || p.scrollWidth > p.clientWidth + 1) {
                    out.push(`${p.textContent} 文字 ${Math.round(t.left)}–${Math.round(t.right)}、字卡 ${Math.round(card.left)}–${Math.round(card.right)}、scrollWidth ${p.scrollWidth}／${p.clientWidth}`);
                }
            }
            return { n, out };
        });
        expect(bad.n, '要有字卡才算檢查過').toBeGreaterThan(0);
        expect(bad.out, '拼音超出字卡').toEqual([]);
        await expectShot(page, 'phone-150-zhuang.png');
    } finally {
        await context.close();
    }
});
