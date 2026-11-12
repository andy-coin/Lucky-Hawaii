// BYOK（用自己的金鑰）：偏好設定「AI」分頁、直連服務商不經 Worker、錯誤白話、鑰匙狀態、自製模型下拉
// 絕不打真的 API：api.groq.com 與 generativelanguage.googleapis.com 一律用 page.route 攔下來
import { test, expect } from '@playwright/test';
import { bootPage, settle } from './helpers.mjs';

const GKEY = 'AIzaTEST-gemini-key-0000';
const QKEY = 'gsk_TEST_groq_key_0000';
const REPLY = '美音、原因、光陰';
const GROQ_20B = 'byok:groq:openai/gpt-oss-20b';
const GEM_LITE = 'byok:gemini:gemini-3.5-flash-lite';

// 攔服務商：mode = 'ok' | 401 | 429 | 'gemini-bad-key'（Gemini 金鑰錯時回 400 API_KEY_INVALID）；記下每個請求
async function routeProviders(page, mode = 'ok') {
    const calls = [];
    await page.route(/^https:\/\/(api\.groq\.com|generativelanguage\.googleapis\.com)\//, route => {
        const req = route.request();
        calls.push({ url: req.url(), method: req.method(), headers: req.headers(), body: req.postData() });
        const isGemini = req.url().includes('googleapis');
        const json = (status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
        if (mode === 401) return json(401, { error: { message: 'Invalid API Key', type: 'invalid_request_error', code: 'invalid_api_key' } });
        if (mode === 429) return json(429, { error: { message: 'Rate limit reached for model', code: 'rate_limit_exceeded' } });
        if (mode === 'gemini-bad-key') return json(400, { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } });
        if (req.method() === 'GET') return json(200, isGemini ? { models: [{ name: 'models/gemini-3.5-flash-lite' }] } : { object: 'list', data: [{ id: 'openai/gpt-oss-20b' }] });
        return json(200, isGemini
            ? { candidates: [{ content: { parts: [{ text: REPLY }] } }], usageMetadata: { totalTokenCount: 42 } }
            : { choices: [{ message: { role: 'assistant', content: REPLY } }], usage: { total_tokens: 42 } });
    });
    return calls;
}
const workerAiCalls = page => {
    const hits = [];
    page.on('request', r => { if (new URL(r.url()).pathname === '/ai' && r.url().includes('workers.dev')) hits.push(r.url()); });
    return hits;
};
async function withPage(browser, opts, fn) {
    const boot = await bootPage(browser, { wordlist: 'stub', ...opts, storage: { rightPanelCollapsed: 'false', ...opts.storage } });
    try {
        await fn(boot);
        expect(boot.offOrigin, '不可連到不認得的主機').toEqual([]);
    } finally { await boot.context.close(); }
}
async function generate(page) {
    await page.fill('#searchInput', '心');
    await settle(page);
    await page.click('#generateBtn');
}
const openAiTab = async page => { await page.evaluate(() => lhOpenAiPrefs()); await expect(page.locator('#prefsPanel-ai')).toBeVisible(); };

test('AI 分頁：鑰匙打開「AI」分頁；說明、兩個影片連結、金鑰欄是密碼型且可顯示／隱藏', async ({ browser }) => {
    await withPage(browser, {}, async ({ page, errors }) => {
        await page.locator('#aiKeyBtn').click();
        await expect(page.locator('#settingsOverlay')).toHaveClass(/show/);
        await expect(page.getByRole('tab', { name: 'AI' })).toHaveAttribute('aria-selected', 'true');
        await expect(page.getByRole('tab', { name: 'AI' })).toBeFocused();
        await expect(page.locator('#prefsPanel-ai')).toContainText('不會進備份');
        const links = await page.locator('#prefsPanel-ai a').evaluateAll(as => as.map(a => [a.textContent, a.href, a.target, a.rel]));
        expect(links).toEqual([
            ['如何取得免費 Google API 金鑰（影片）', 'https://www.youtube.com/watch?v=Upk-iMyC3aM', '_blank', 'noopener'],
            ['如何取得免費 Groq API 金鑰（影片）', 'https://www.youtube.com/watch?v=nt1PJu47nTk', '_blank', 'noopener'],
        ]);
        const input = page.getByLabel('Gemini（Google AI Studio）金鑰');
        await expect(input).toHaveAttribute('type', 'password');
        const eye = page.locator('.byok-provider[data-provider="gemini"] .byok-eye');
        await eye.click();
        await expect(input).toHaveAttribute('type', 'text');
        await expect(eye).toHaveAttribute('aria-pressed', 'true');
        await expect(eye).toHaveAccessibleName('隱藏金鑰');
        await eye.click();
        await expect(input).toHaveAttribute('type', 'password');
        // 「查詢與詞庫」不再有那行 Groq 說明
        await expect(page.locator('#prefsPanel-search')).not.toContainText('Groq');
        expect(errors).toEqual([]);
    });
});

test('金鑰：存在 apiKey_ 鍵、兩家可以都存、不進備份檔；格式不對不存；清除會移除', async ({ browser }) => {
    await withPage(browser, {}, async ({ page, errors }) => {
        await openAiTab(page);
        await page.locator('#byokKey-gemini').fill('  ' + GKEY + ' ');
        await page.locator('#byokKey-gemini').blur();
        await page.locator('#byokKey-groq').fill(QKEY);
        await page.locator('#byokKey-groq').blur();
        expect(await page.evaluate(() => [localStorage.getItem('apiKey_gemini'), localStorage.getItem('apiKey_groq')])).toEqual([GKEY, QKEY]);
        const backup = await page.evaluate(() => JSON.stringify(lhBuildBackup(songs, activeSongId, savedWords)));
        expect(backup).not.toContain(GKEY);
        expect(backup).not.toContain(QKEY);
        expect(backup).not.toContain('apiKey_');
        // 夾中文的金鑰：不存、說明原因
        await page.locator('#byokKey-groq').fill('gsk_我的金鑰abc');
        await page.locator('#byokKey-groq').blur();
        await expect(page.locator('.byok-provider[data-provider="groq"] .byok-status')).toContainText('格式不對');
        expect(await page.evaluate(() => localStorage.getItem('apiKey_groq'))).toBe(QKEY);
        await page.locator('.byok-provider[data-provider="groq"] [data-act="clear"]').click();
        expect(await page.evaluate(() => localStorage.getItem('apiKey_groq'))).toBeNull();
        await expect(page.locator('#byokKey-groq')).toHaveValue('');
        expect(errors).toEqual([]);
    });
});

test('測試連線：成功、金鑰無效、額度用完、網路問題都是白話繁中，不顯示金鑰', async ({ browser }) => {
    for (const [mode, provider, want] of [['ok', 'groq', '連線成功'], [401, 'groq', '金鑰無效'], ['gemini-bad-key', 'gemini', '金鑰無效'], [429, 'gemini', '額度'], ['net', 'groq', '網路']]) {
        await withPage(browser, {}, async ({ page }) => {
            let calls = [];
            if (mode === 'net') await page.route(/^https:\/\/api\.groq\.com\//, r => r.abort('internetdisconnected'));
            else calls = await routeProviders(page, mode);
            await openAiTab(page);
            await page.locator('#byokKey-' + provider).fill(provider === 'gemini' ? GKEY : QKEY);
            await page.locator(`.byok-provider[data-provider="${provider}"] [data-act="test"]`).click();
            const status = page.locator(`.byok-provider[data-provider="${provider}"] .byok-status`);
            await expect(status).toContainText(want);
            const text = await status.textContent();
            expect(text, '狀態裡不能出現英文技術字串').not.toMatch(/invalid|rate|error|HTTP|key/i);
            if (calls.length) {
                expect(calls[0].method).toBe('GET');
                expect(calls[0].url, '金鑰不放網址').not.toMatch(/key=|TEST/);
                if (provider === 'gemini') expect(calls[0].headers['x-goog-api-key']).toBe(GKEY);
                else expect(calls[0].headers.authorization).toBe('Bearer ' + QKEY);
            }
        });
    }
});

test('直連：選了自己金鑰的 Groq 模型 → 只打 Groq、不經 Worker；回傳和 Worker 路徑一樣變成字卡', async ({ browser }) => {
    await withPage(browser, { storage: { apiKey_groq: QKEY, selectedModel: GROQ_20B } }, async ({ page, errors }) => {
        const calls = await routeProviders(page);
        const worker = workerAiCalls(page);
        expect(await page.locator('#modelSelect').inputValue()).toBe(GROQ_20B);
        await generate(page);
        await page.waitForSelector('.ai-word-card .ai-badge');
        const cards = await page.locator('.ai-word-card:has(.ai-badge)').allTextContents();
        expect(cards.some(t => t.includes('美音'))).toBe(true);
        expect(worker, '不可呼叫 Worker /ai').toEqual([]);
        const post = calls.find(c => c.method === 'POST');
        expect(post.url).toBe('https://api.groq.com/openai/v1/chat/completions');
        expect(post.headers.authorization).toBe('Bearer ' + QKEY);
        expect(JSON.parse(post.body)).toMatchObject({ model: 'openai/gpt-oss-20b', messages: [{ role: 'user', content: expect.any(String) }] });
        expect(errors).toEqual([]);
    });
});

test('直連：Gemini 金鑰放 x-goog-api-key 標頭、不放網址', async ({ browser }) => {
    await withPage(browser, { storage: { apiKey_gemini: GKEY, selectedModel: GEM_LITE } }, async ({ page, errors }) => {
        const calls = await routeProviders(page);
        const worker = workerAiCalls(page);
        await generate(page);
        await page.waitForSelector('.ai-word-card .ai-badge');
        const post = calls.find(c => c.method === 'POST');
        expect(post.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
        expect(post.headers['x-goog-api-key']).toBe(GKEY);
        expect(worker).toEqual([]);
        expect(errors).toEqual([]);
    });
});

test('直連失敗：401／429 顯示白話原因，不偷偷改走 Worker、不顯示金鑰', async ({ browser }) => {
    for (const [mode, want] of [[401, '金鑰無效'], [429, '免費額度暫時用完']]) {
        await withPage(browser, { storage: { apiKey_groq: QKEY, selectedModel: GROQ_20B } }, async ({ page }) => {
            await routeProviders(page, mode);
            const worker = workerAiCalls(page);
            await generate(page);
            await expect(page.locator('#rightPanel')).toContainText(want);
            const panel = await page.locator('#rightPanel').innerText();
            expect(panel).not.toContain(QKEY);
            expect(panel).not.toMatch(/rate_limit|invalid_api_key|Invalid API Key/);
            expect(worker, '失敗也不改走 Worker').toEqual([]);
        });
    }
});

test('沒金鑰照舊走 Worker；有金鑰但選的是好韻器提供的模型也走 Worker、不碰服務商', async ({ browser }) => {
    for (const storage of [{}, { apiKey_groq: QKEY, selectedModel: 'auto' }]) {
        await withPage(browser, { storage, aiReply: REPLY }, async ({ page, errors }) => {
            const calls = await routeProviders(page);
            const worker = workerAiCalls(page);
            await generate(page);
            await page.waitForSelector('.ai-word-card .ai-badge');
            expect(worker.length).toBeGreaterThan(0);
            expect(calls, '不可直連服務商').toEqual([]);
            expect(await page.locator('#aiKeyBtn').getAttribute('data-on')).toBe('false');
            expect(errors).toEqual([]);
        });
    }
});

test('鑰匙：走自己的金鑰時呼吸閃爍、aria-label 說明；換回好韻器模型就靜止變淡；減少動態時靜態亮起', async ({ browser }) => {
    await withPage(browser, { storage: { apiKey_gemini: GKEY, selectedModel: GEM_LITE } }, async ({ page }) => {
        const key = page.locator('#aiKeyBtn');
        await expect(key).toHaveAttribute('data-on', 'true');
        await expect(key).toHaveAccessibleName('正在使用你自己的 Gemini 金鑰，點此設定');
        expect(await key.evaluate(k => getComputedStyle(k).animationName)).toBe('lhPulse');
        await page.locator('#modelPicker').click();
        await page.locator('#modelList [role=option][data-id="auto"]').click();
        await expect(key).toHaveAttribute('data-on', 'false');
        expect(await key.evaluate(k => getComputedStyle(k).animationName)).toBe('none');
        expect(Number(await key.evaluate(k => getComputedStyle(k).opacity))).toBeLessThan(0.6);
    });
    await withPage(browser, { storage: { apiKey_gemini: GKEY, selectedModel: GEM_LITE }, device: { reducedMotion: 'reduce' } }, async ({ page }) => {
        const key = page.locator('#aiKeyBtn');
        await expect(key).toHaveAttribute('data-on', 'true');
        expect(await key.evaluate(k => [getComputedStyle(k).animationName, getComputedStyle(k).opacity])).toEqual(['none', '1']);
    });
});

test('自製下拉：分組、用量圖示、鍵盤上下選、Enter 選定、Esc 關、點外面關', async ({ browser }) => {
    await withPage(browser, { storage: { apiKey_groq: QKEY, apiKey_gemini: GKEY } }, async ({ page, errors }) => {
        const btn = page.locator('#modelPicker');
        const list = page.getByRole('listbox', { name: 'AI 模型' });
        await expect(btn).toHaveAttribute('aria-expanded', 'false');
        await btn.focus();
        await page.keyboard.press('ArrowDown');
        await expect(list).toBeVisible();
        await expect(btn).toHaveAttribute('aria-expanded', 'true');
        await expect(list).toBeFocused();
        // 兩組：好韻器提供／用你自己的金鑰；自己金鑰的每個選項右邊都有用量圖示（1～3 格）
        expect(await list.getByRole('group').evaluateAll(gs => gs.map(g => g.getAttribute('aria-label')))).toEqual(['好韻器提供', '用你自己的金鑰']);
        const own = page.getByRole('group', { name: '用你自己的金鑰' }).getByRole('option');
        await expect(own).toHaveCount(4);
        const usage = await own.evaluateAll(os => os.map(o => [o.querySelector('.model-opt-usage')?.dataset.usage, o.querySelectorAll('.usage-bars rect.on').length]));
        expect(usage.every(([u, on]) => Number(u) === on && on >= 1 && on <= 3)).toBe(true);
        expect(await page.locator('.model-opt-usage').count(), '好韻器提供的選項沒有用量圖示').toBe(4);
        // 用量圖示靠右：圖示右緣貼齊選項右側
        const pos = await own.first().evaluate(o => { const a = o.getBoundingClientRect(), b = o.querySelector('.model-opt-usage').getBoundingClientRect(); return a.right - b.right; });
        expect(pos).toBeLessThan(16);
        // 第一個是「自動」（目前選的）；End 到最後一個、Enter 選定
        expect(await list.getAttribute('aria-activedescendant')).toBe('modelOpt-auto');
        await page.keyboard.press('End');
        await page.keyboard.press('ArrowUp');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        await expect(list).toBeHidden();
        await expect(btn).toBeFocused();
        const last = await page.evaluate(() => localStorage.getItem('selectedModel'));
        expect(last).toBe('byok:groq:openai/gpt-oss-120b');
        await expect(btn).toHaveAccessibleName('AI 模型：GPT-OSS 120B（用你自己的金鑰）');
        await expect(page.locator('#aiKeyBtn')).toHaveAttribute('data-on', 'true');
        // Esc 關、不改選擇；設定視窗沒開著也不受影響
        await page.keyboard.press('ArrowDown');
        await expect(list).toBeVisible();
        expect(await list.getAttribute('aria-activedescendant')).toBe('modelOpt-byok_groq_openai_gpt-oss-120b');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Escape');
        await expect(list).toBeHidden();
        expect(await page.evaluate(() => localStorage.getItem('selectedModel'))).toBe(last);
        // 點外面關
        await btn.click();
        await expect(list).toBeVisible();
        await page.locator('#searchInput').click();
        await expect(list).toBeHidden();
        expect(errors).toEqual([]);
    });
});

test('自製下拉：沒金鑰時不分組、沒有用量圖示；清掉金鑰後選單只顯示「自動」、不改存的值', async ({ browser }) => {
    await withPage(browser, { storage: { apiKey_groq: QKEY, selectedModel: GROQ_20B } }, async ({ page, errors }) => {
        await openAiTab(page);
        await page.locator('.byok-provider[data-provider="groq"] [data-act="clear"]').click();
        await page.keyboard.press('Escape');
        expect(await page.locator('#modelSelect').inputValue()).toBe('auto');
        expect(await page.evaluate(() => localStorage.getItem('selectedModel'))).toBe(GROQ_20B);
        await page.locator('#modelPicker').click();
        await expect(page.locator('#modelList [role=group]')).toHaveCount(0);
        await expect(page.locator('#modelList .model-opt-usage')).toHaveCount(0);
        await expect(page.locator('#aiKeyBtn')).toHaveAttribute('data-on', 'false');
        await expect(page.locator('#aiKeyBtn')).toHaveAccessibleName('用你自己的 AI 金鑰，點此設定');
        expect(errors).toEqual([]);
    });
});

test('觸控：模型選項、鑰匙、金鑰欄都 ≥ 44px', async ({ browser }) => {
    await withPage(browser, { storage: { apiKey_groq: QKEY }, device: { viewport: { width: 1180, height: 820 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } }, async ({ page }) => {
        const h = sel => page.locator(sel).first().evaluate(e => { const r = e.getBoundingClientRect(); return Math.min(r.width, r.height); });
        if (!(await page.locator('#modelPicker').isVisible())) await page.evaluate(() => toggleRightPanel());
        await page.locator('#modelPicker').tap();
        expect(await h('#modelList [role=option]')).toBeGreaterThanOrEqual(43.5);
        expect(await h('#aiKeyBtn')).toBeGreaterThanOrEqual(43.5);
        await openAiTab(page);
        expect(await h('#byokKey-gemini')).toBeGreaterThanOrEqual(43.5);
        expect(await h('.byok-eye')).toBeGreaterThanOrEqual(43.5);
    });
});
