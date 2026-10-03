// AI 客戶端測試（Phase 2）：舊設定的使用者按 AI 建議要拿得到結果；模型選單跟著 Worker 的 /models 走
// 「舊模型」那題讓瀏覽器的 /ai 請求經 bridgeWorker 進到真正的 worker/src/*.js，再打到假的 Gemini：整條路徑每一層都真的跑
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage, settle } from './helpers.mjs';
import { makeEnv, installFetch, geminiOk, bridgeWorker } from './worker-helpers.mjs';
import { _resetState } from '../worker/src/ai.js';

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
        // 只存了一個鍵 → 面板是收起的，按鈕在畫面外；和 smoke 一樣直接觸發 click
        await page.evaluate(() => document.getElementById('generateBtn').click());
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

// ==================== 白話：AI 失敗時使用者讀得到原因，按鈕和讀取中一定恢復 ====================
const ALL_BUSY_MSG = 'AI 暫時都忙不過來，請稍後再試（已嘗試 4 個模型）';
const FALLBACK_MSG = 'AI 暫時無法使用，請稍後再試';

// 顯示給使用者的失敗文字：要有中文，不能出現英文錯誤字
function expectPlainChinese(text) {
    expect(text).toMatch(/[一-鿿]/);
    expect(text).not.toMatch(/error|failed|undefined|TypeError|\bnull\b/i);
}
async function expectAiAreaIdle(page) {
    expect(await page.locator('#generateBtn').isEnabled()).toBe(true);
    await expect(page.locator('#aiLoading')).toBeHidden();
}
// 瀏覽器對 503 回應自己會記一行資源載入錯誤，這是唯一允許的 console.error；其他一律不行
const unexpectedErrors = errors => errors.filter(e => !/status of 503/.test(e));
// 面板收起時按鈕在畫面外，和 smoke 一樣直接觸發 click
const clickGenerate = page => page.evaluate(() => document.getElementById('generateBtn').click());
// 等到 AI 區出現指定文字（失敗訊息是非同步寫進去的）
const aiAreaText = async (page, expected) => {
    await expect(page.locator('#aiWordsContainer')).toContainText(expected);
    return page.locator('#aiWordsContainer').innerText();
};

test('白話：補充詞路徑 — 每個供應商都 503 時 AI 區顯示 Worker 的白話原因', async ({ browser }) => {
    _resetState();
    const env = makeEnv({ ALLOW_LOCAL_ORIGIN: '1', ATTEMPT_TIMEOUT_MS: '5000' });
    const f = installFetch(() => new Response('UPSTREAM-SECRET', { status: 503 }));
    let context;
    try {
        const boot = await bootPage(browser, { wordlist: 'stub', beforeGoto: ({ context }) => bridgeWorker(context, env) });
        context = boot.context;
        const { page, errors, offOrigin } = boot;
        await page.fill('#searchInput', '心');
        await settle(page);
        await clickGenerate(page);
        const shown = await aiAreaText(page, ALL_BUSY_MSG);
        expect(shown).not.toContain('UPSTREAM-SECRET');
        expect(shown).not.toContain('唉...ai也想不到');          // 真的是連不上，不是「想不到」
        expectPlainChinese(shown);
        await expectAiAreaIdle(page);
        expect(f.calls.length).toBe(4);                        // 真的走了 Worker 的換手鏈，最多 4 次
        expect(unexpectedErrors(errors)).toEqual([]);
        expect(offOrigin).toEqual([]);
    } finally {
        f.restore();
        await context?.close();
    }
});

test('白話：主要建議路徑 — 完整顯示 Worker 的訊息、不截斷，按鈕與讀取中恢復', async ({ browser }) => {
    // 搜「安」：真詞庫有 1000 個候選（lastCandidatesTotal >= 24），所以走「從候選詞挑 24 個」的主要路徑；
    // 訊息刻意拉長到超過舊版截斷的 80 字，證明現在整句都顯示
    const longMsg = ALL_BUSY_MSG + '。' + '目前上游額度都用完了，等一下就會恢復。'.repeat(5);
    expect(longMsg.length).toBeGreaterThan(80);
    await withPage(browser, { aiFail: { status: 503, body: { ok: false, code: 'ALL_BUSY', message: longMsg, tried: [] } } }, async ({ page, errors }) => {
        await page.fill('#searchInput', '安');
        await settle(page);
        await clickGenerate(page);
        const shown = await aiAreaText(page, ALL_BUSY_MSG);
        expect(await page.evaluate(() => lastCandidatesTotal)).toBeGreaterThanOrEqual(24);
        expect(shown.trim()).toBe(longMsg);
        expectPlainChinese(shown);
        // 失敗訊息是 textContent，不是 HTML 字串
        expect(await page.locator('#aiWordsContainer span').count()).toBe(1);
        await expectAiAreaIdle(page);
        expect(unexpectedErrors(errors)).toEqual([]);
    });
});

test('白話：情境產生器 — 失敗時用提示訊息顯示 Worker 的原因，按鈕恢復', async ({ browser }) => {
    await withPage(browser, { aiFail: { status: 503, body: { ok: false, code: 'ALL_BUSY', message: ALL_BUSY_MSG, tried: [] } } }, async ({ page, errors }) => {
        await page.evaluate(() => { document.querySelector('.section-textarea').value = '夜裡的風吹過窗邊，我想起你的笑'; });
        await page.evaluate(() => document.querySelector('.context-refresh-btn').click());
        await expect(page.locator('#copyToast')).toHaveText(ALL_BUSY_MSG);
        expectPlainChinese(await page.locator('#copyToast').textContent());
        expect(await page.locator('.context-refresh-btn').isEnabled()).toBe(true);
        expect(unexpectedErrors(errors)).toEqual([]);
    });
});

test('白話：網路 — /ai 連不上時顯示「連不上 AI 服務」，頁面不留轉圈', async ({ browser }) => {
    await withPage(browser, { wordlist: 'stub' }, async ({ page, errors }) => {
        await page.route('**/ai', r => r.abort());              // 開頁之後才掛，/models 不受影響
        await page.fill('#searchInput', '心');
        await settle(page);
        await clickGenerate(page);
        const shown = await aiAreaText(page, '連不上 AI 服務，請檢查網路後再試');
        expectPlainChinese(shown);
        await expectAiAreaIdle(page);
        // 唯一允許的錯誤：瀏覽器自己對被中斷的請求記的那一行
        const rest = errors.filter(e => !/net::ERR_FAILED/.test(e));
        expect(errors.length - rest.length).toBe(1);
        expect(rest).toEqual([]);
    });
});

test('白話：語言 — 各種怪回應顯示的字都是白話繁中，沒有英文錯誤字', async ({ browser }) => {
    const cases = [
        { name: 'Worker 沒給訊息', status: 503, body: JSON.stringify({ ok: false }), expected: FALLBACK_MSG },
        { name: '回的不是 JSON', status: 502, body: 'Bad Gateway: TypeError undefined', expected: 'AI 服務回應格式不對，請稍後再試' },
        { name: 'Worker 的白話訊息', status: 503, body: JSON.stringify({ ok: false, code: 'ALL_BUSY', message: ALL_BUSY_MSG }), expected: ALL_BUSY_MSG },
    ];
    for (const c of cases) {
        await withPage(browser, { wordlist: 'stub' }, async ({ page, errors }) => {
            await page.route('**/ai', r => r.fulfill({ status: c.status, contentType: 'application/json', body: c.body }));
            await page.fill('#searchInput', '心');
            await settle(page);
            await clickGenerate(page);
            const shown = await aiAreaText(page, c.expected);
            expectPlainChinese(shown);
            await expectAiAreaIdle(page);
            expect(errors.filter(e => !/status of 50\d/.test(e)), c.name).toEqual([]);
        });
    }
});
