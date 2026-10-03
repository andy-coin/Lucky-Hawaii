// AI 客戶端測試（Phase 2）：舊設定的使用者按 AI 建議要拿得到結果；模型選單跟著 Worker 的 /models 走
// 「舊模型」那題讓瀏覽器的 /ai 請求經 bridgeWorker 進到真正的 worker/src/*.js，再打到假的 Gemini：整條路徑每一層都真的跑
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage, settle } from './helpers.mjs';
import { makeEnv, installFetch, geminiOk, bridgeWorker } from './worker-helpers.mjs';

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/v096-localStorage.json', import.meta.url), 'utf8'));

test('舊模型：舊設定的使用者按 AI 建議拿得到結果', async ({ browser }) => {
    const env = makeEnv({ ALLOW_LOCAL_ORIGIN: '1', ATTEMPT_TIMEOUT_MS: '5000' });
    const f = installFetch(url => url.includes(':generateContent') ? geminiOk('美音、原因、光陰') : new Response('{}', { status: 500 }));
    let context;
    try {
        const boot = await bootPage(browser, {
            storage: FIXTURE, wordlist: 'stub',
            beforeGoto: ({ context }) => bridgeWorker(context, env),
        });
        context = boot.context;
        const { page, errors, offOrigin } = boot;
        const bodies = [];
        page.on('request', r => { if (r.method() === 'POST' && new URL(r.url()).pathname === '/ai') bodies.push(JSON.parse(r.postData())); });

        // 舊資料裡已下架的 gpt-4.1：畫面顯示「自動」
        expect(await page.locator('#modelSelect').inputValue()).toBe('auto');
        await page.fill('#searchInput', '心');
        await settle(page);
        await page.click('#generateBtn');
        await page.waitForSelector('.ai-word-card .ai-badge');

        const cards = await page.locator('.ai-word-card:has(.ai-badge)').allTextContents();
        expect(cards.some(t => t.includes('美音'))).toBe(true);
        // 瀏覽器只送 { prompt, model, temperature }；不帶供應商、金鑰、messages
        expect(bodies.length).toBeGreaterThan(0);
        expect(bodies[0]).toEqual({ prompt: expect.any(String), model: 'auto', temperature: 0.95 });
        // Worker 打 Gemini：金鑰在 header，不在網址
        expect(f.calls.length).toBeGreaterThan(0);
        expect(f.calls[0].url).toContain('gemini-3.5-flash-lite');
        expect(f.calls[0].url).not.toContain('key=');
        expect(f.calls[0].init.headers['x-goog-api-key']).toBe('g-test');
        // 開站與使用過程都不改使用者存的模型
        expect(await page.evaluate(() => localStorage.getItem('selectedModel'))).toBe(FIXTURE.selectedModel);
        expect(errors).toEqual([]);
        expect(offOrigin).toEqual([]);
    } finally {
        f.restore();
        await context?.close();
    }
});
