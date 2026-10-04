// Phase 4 AI 挑詞填滿與造詞驗證：AI 只負責排序，數量由程式保證
import { test, expect } from '@playwright/test';
import { bootPage, settle } from './helpers.mjs';

const MODEL = { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite' };
// 面板收起時按鈕在畫面外，和 smoke 一樣直接觸發 click
const clickGenerate = page => page.evaluate(() => document.getElementById('generateBtn').click());

test('填滿：候選 ≥ 24 時 AI 只回 3 個，畫面仍剛好 24 張', async ({ browser }) => {
    const { context, page, errors, offOrigin } = await bootPage(browser);
    try {
        const prompts = [];
        let picks = [];
        await page.route('**/ai', route => {
            const prompt = route.request().postDataJSON().prompt;
            prompts.push(prompt);
            picks = /候選詞：([^\n]*)/.exec(prompt)[1].split('、').slice(0, 3);
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, text: picks.join('、'), model: MODEL, tried: [] }) });
        });
        await page.fill('#searchInput', '安');
        await settle(page);
        await clickGenerate(page);
        await expect(page.locator('#aiWordsContainer .ai-word-card')).toHaveCount(24);
        const cards = await page.locator('#aiWordsContainer .ai-word-card').allTextContents();
        expect(cards.slice(0, 3), 'AI 挑的 3 個照 AI 順序排最前').toEqual(picks);
        const ranks = await page.evaluate(ws => ws.map(w => wordPriorityMap.get(w) ?? 0), cards.slice(3));
        expect(ranks.length).toBe(21);
        for (let i = 1; i < ranks.length; i++) expect(ranks[i], `第 ${i + 3} 張 p 值不可大於前一張`).toBeLessThanOrEqual(ranks[i - 1]);
        expect(await page.locator('#aiWordsContainer .ai-badge').count()).toBe(0);
        expect(prompts.length, '一次按鈕只呼叫一次 /ai').toBe(1);
        expect(prompts[0]).not.toContain('直接生成');
        await expect(page.locator('#aiWordsContainer .candidate-report')).toContainText('挑出 24 個');
        expect(errors).toEqual([]);
        expect(offOrigin).toEqual([]);
    } finally { await context.close(); }
});
