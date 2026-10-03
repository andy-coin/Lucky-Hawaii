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

// ==================== 模型選單：跟著 Worker 的 /models 走 ====================
const GPT = 'openai/gpt-oss-120b';
const AI_REPLY = '美音、原因、光陰';
const optionValues = page => page.locator('#modelSelect option').evaluateAll(os => os.map(o => o.value));
const dumpLS = page => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])));

// 開頁 → 執行測試內容 → 一律檢查沒有連到不認得的主機、一律關掉 context
async function withPage(browser, opts, fn) {
    const boot = await bootPage(browser, opts);
    try {
        await fn(boot);
        expect(boot.offOrigin).toEqual([]);
    } finally {
        await boot.context.close();
    }
}

test('保留：有效的手動選擇保留並送給 Worker', async ({ browser }) => {
    await withPage(browser, { storage: { selectedModel: GPT }, wordlist: 'stub', aiReply: AI_REPLY }, async ({ page, errors }) => {
        expect(await page.locator('#modelSelect').inputValue()).toBe(GPT);
        const bodies = [];
        page.on('request', r => { if (r.method() === 'POST' && new URL(r.url()).pathname === '/ai') bodies.push(JSON.parse(r.postData())); });
        await page.fill('#searchInput', '心');
        await settle(page);
        await page.click('#generateBtn');
        await page.waitForSelector('.ai-word-card .ai-badge');
        expect(bodies.length).toBeGreaterThan(0);
        expect(bodies[0].model).toBe(GPT);
        expect(await page.evaluate(() => localStorage.getItem('selectedModel'))).toBe(GPT);
        expect(errors).toEqual([]);
    });
});

test('保留：模型清單連不上時顯示自動、不清掉原本的選擇', async ({ browser }) => {
    await withPage(browser, { storage: { selectedModel: GPT }, models: 'down' }, async ({ page, errors, warnings }) => {
        expect(await optionValues(page)).toEqual(['auto']);
        expect(await page.locator('#modelSelect').inputValue()).toBe('auto');
        expect(await page.evaluate(() => localStorage.getItem('selectedModel'))).toBe(GPT);
        // 唯一允許的錯誤：瀏覽器對 /models 的 503 資源載入記錄；其他一律不行
        expect(errors.filter(e => !/status of 503/.test(e))).toEqual([]);
        expect(warnings.some(w => w.includes('[好韻器]') && w.includes('模型清單載入失敗'))).toBe(true);
    });
});

test('保留：大小寫或空白不同的舊值當成未知', async ({ browser }) => {
    const near = 'Gemini-3.5-Flash-Lite ';   // 大寫開頭＋尾端空白，和清單裡的 gemini-3.5-flash-lite 只差一點
    await withPage(browser, { storage: { selectedModel: near } }, async ({ page, errors }) => {
        expect(await optionValues(page)).toContain('gemini-3.5-flash-lite');
        expect(await page.locator('#modelSelect').inputValue()).toBe('auto');
        expect(await page.evaluate(() => localStorage.getItem('selectedModel'))).toBe(near);
        expect(errors).toEqual([]);
    });
});

test('保留：沒存過模型、或清單是空的 → 只有自動', async ({ browser }) => {
    await withPage(browser, { storage: {} }, async ({ page }) => {
        expect(await page.locator('#modelSelect').inputValue()).toBe('auto');
        expect(await page.evaluate(() => localStorage.getItem('selectedModel'))).toBeNull();
    });
    await withPage(browser, { storage: { selectedModel: GPT }, models: [] }, async ({ page }) => {
        expect(await optionValues(page)).toEqual(['auto']);
        expect(await page.locator('#modelSelect option').first().textContent()).toBe('自動（推薦）');
        expect(await page.evaluate(() => localStorage.getItem('selectedModel'))).toBe(GPT);
    });
});

test('保留：同一份舊資料開兩次結果相同', async ({ browser }) => {
    for (let i = 0; i < 2; i++) {
        await withPage(browser, { storage: FIXTURE }, async ({ page }) => {
            expect(await page.locator('#modelSelect').inputValue()).toBe('auto');
            expect(await dumpLS(page)).toMatchObject(FIXTURE);
        });
    }
});

test('選單：跟著 /models 變', async ({ browser }) => {
    const entry = (id, label) => ({ id, label, provider: 'gemini' });
    const A = [entry('model-a1', '甲一'), entry('model-a2', '甲二')];
    const B = [entry('model-b9', '丙九'), entry('model-b1', '乙一'), entry('model-b5', '丁五')];   // 刻意不照字母排
    await withPage(browser, { models: A }, async ({ page }) => {
        expect(await optionValues(page)).toEqual(['auto', 'model-a1', 'model-a2']);
        expect(await page.locator('#modelSelect option').first().textContent()).toBe('自動（推薦）');
    });
    await withPage(browser, { models: B }, async ({ page }) => {
        expect(await optionValues(page)).toEqual(['auto', 'model-b9', 'model-b1', 'model-b5']);
        expect(await page.locator('#modelSelect option').first().textContent()).toBe('自動（推薦）');
    });
});

test('選單：標籤只當文字', async ({ browser }) => {
    const label = '<img src=x onerror="window.__pwned=1">';
    await withPage(browser, { models: [{ id: 'x-model', label, provider: 'gemini' }] }, async ({ page, errors }) => {
        expect(await optionValues(page)).toEqual(['auto', 'x-model']);
        expect(await page.locator('#modelSelect option[value="x-model"]').textContent()).toBe(label);
        expect(await page.locator('#modelSelect img').count()).toBe(0);
        expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
        expect(errors).toEqual([]);
    });
});

test('選單：使用者改選才寫入', async ({ browser }) => {
    await withPage(browser, { storage: FIXTURE }, async ({ page }) => {
        expect(await page.evaluate(() => localStorage.getItem('selectedModel'))).toBe(FIXTURE.selectedModel);
        await page.selectOption('#modelSelect', GPT);
        expect(await page.evaluate(() => localStorage.getItem('selectedModel'))).toBe(GPT);
    });
});
