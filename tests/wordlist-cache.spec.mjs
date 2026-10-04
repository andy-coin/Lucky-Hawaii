// Phase 4 詞庫載入：慢速載入與 AI 建議的競態、版本更新整套換新、非 200 留記錄
import { test, expect } from '@playwright/test';
import { bootPage, settle } from './helpers.mjs';

const clickGenerate = page => page.evaluate(() => document.getElementById('generateBtn').click());

// 閘門：詞庫分段請求卡在閘門後面，測試決定何時放行；同時收集分段網址與 /ai 的 prompt
function makeGate() {
    let release;
    const gate = new Promise(r => { release = r; });
    const chunkUrls = [];
    const aiPrompts = [];
    const beforeGoto = async ({ context, page }) => {
        page.on('request', r => {
            const u = new URL(r.url());
            if (/\/data\/wordlist-c0\d\.json$/.test(u.pathname)) chunkUrls.push(r.url());
            if (u.pathname === '/ai') aiPrompts.push(JSON.parse(r.postData()).prompt);
        });
        await context.route(/\/data\/wordlist-c0\d\.json/, async r => { await gate; await r.continue(); });
    };
    return { release, chunkUrls, aiPrompts, beforeGoto };
}

test('慢速：詞庫還沒載完就按 AI 建議，會等詞庫、不誤觸造詞', async ({ browser }) => {
    test.setTimeout(60_000);
    const g = makeGate();
    const { context, page, errors, offOrigin } = await bootPage(browser, { waitWordlist: false, aiReply: '', beforeGoto: g.beforeGoto });
    try {
        await page.fill('#searchInput', '安');
        await settle(page);
        await clickGenerate(page);
        await expect(page.locator('#aiLoading')).toContainText('詞庫載入中');
        expect(g.aiPrompts, '等詞庫期間沒有任何 /ai 請求').toHaveLength(0);
        g.release();
        await expect(page.locator('#aiWordsContainer .ai-word-card')).toHaveCount(24);
        expect(g.aiPrompts, '只有挑詞一次').toHaveLength(1);
        expect(g.aiPrompts[0]).not.toContain('直接生成');
        expect(g.chunkUrls, '按鈕與頁面共用同一次載入').toHaveLength(10);
        await expect(page.locator('#generateBtn')).toBeEnabled();
        expect(errors).toEqual([]);
        expect(offOrigin).toEqual([]);
    } finally { await context.close(); }
});

test('慢速：等詞庫期間換了搜尋，那次按鈕動作作廢', async ({ browser }) => {
    test.setTimeout(60_000);
    const g = makeGate();
    const { context, page, errors } = await bootPage(browser, { waitWordlist: false, aiReply: '', beforeGoto: g.beforeGoto });
    try {
        await page.fill('#searchInput', '安');
        await settle(page);
        await clickGenerate(page);
        await expect(page.locator('#aiLoading')).toContainText('詞庫載入中');
        await page.fill('#searchInput', '心');
        await settle(page);
        g.release();
        await expect(page.locator('#generateBtn')).toBeEnabled();
        await page.evaluate(() => window.__hoyunWordlistReady);
        await settle(page);
        await expect(page.locator('#aiWordsContainer .ai-word-card')).toHaveCount(0);
        expect(g.aiPrompts).toHaveLength(0);
        await expect(page.locator('#aiLoading')).toBeHidden();
        expect(errors).toEqual([]);
    } finally { await context.close(); }
});
