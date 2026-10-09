// 測試共用工具：開乾淨頁面、攔截外部網路、收集錯誤
import { readFileSync } from 'node:fs';

export const BASE = 'http://127.0.0.1:' + (process.env.LH_TEST_PORT || '4310');

// 手動建立的 context 不會繼承 config 的 use，所以這裡明確帶入
export const CONTEXT_OPTS = {
    baseURL: BASE,
    viewport: { width: 1280, height: 900 },
    colorScheme: 'light',
    locale: 'zh-TW',
    serviceWorkers: 'block',
    permissions: ['clipboard-read', 'clipboard-write'],
};

// /models 預設清單（Worker 沒指定時）
const DEFAULT_MODELS = [
    { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', provider: 'gemini' },
    { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B', provider: 'groq' },
];

// 修正層公開 view 的空文件（Worker 沒套用過任何修正時的回覆）
export const EMPTY_CORRECTIONS = {
    version: 1, rev: 0,
    wordlist: { removed: [], hidden: [], fixed: {}, added: [] },
    rhymeDict: { removed: [], hidden: [], fixed: [], added: [] },
};

// 外部網路一律 200 mock（回 404／abort 會被 Chromium 記成 console.error）；不認得的主機記錄下來讓測試失敗
// aiFail: { status, body } 讓 /ai 回失敗；models: 陣列 或 'down'（/models 回 503）
// corrections: 不給 = 空 view；物件 = 回這份 JSON；'down' = 503；'bad' = 200 但形狀不對；'hang' = 永遠不回（測 3 秒逾時）
export async function routeExternal(context, { aiReply, aiFail, models, corrections } = {}) {
    const offOrigin = [];
    await context.route(url => new URL(url).origin !== BASE, route => {
        const u = new URL(route.request().url());
        if (/^fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) {
            return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
        }
        if (u.hostname === 'lucky-hawaii.is3000dollar.workers.dev') {
            if (u.pathname === '/feedback') {
                return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
            }
            if (u.pathname === '/corrections.json') {
                if (corrections === 'hang') return new Promise(() => {});
                if (corrections === 'down') return route.fulfill({ status: 503, contentType: 'application/json', body: '{"ok":false}' });
                if (corrections === 'bad') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"candidates":[]}' });
                return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(corrections ?? EMPTY_CORRECTIONS) });
            }
            if (u.pathname === '/models') {
                if (models === 'down') return route.fulfill({ status: 503, contentType: 'application/json', body: '{"ok":false}' });
                return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, models: models ?? DEFAULT_MODELS, checkedAt: null }) });
            }
            if (u.pathname === '/ai') {
                if (aiFail) return route.fulfill({ status: aiFail.status, contentType: 'application/json', body: JSON.stringify(aiFail.body) });
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ ok: true, text: aiReply ?? '', model: { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite' }, tried: [] }),
                });
            }
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ candidates: [{ content: { parts: [{ text: aiReply ?? '' }] } }] }),
            });
        }
        offOrigin.push(u.href);
        return route.fulfill({ status: 200, body: '' });
    });
    return offOrigin;
}

export function collectErrors(page) {
    const errors = [];
    const warnings = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => {
        if (m.type() === 'error') errors.push('console.error: ' + m.text());
        else if (m.type() === 'warning') warnings.push(m.text());
    });
    return { errors, warnings };
}

// 詞庫換成小型 stub（回 404／空字串會被當成錯誤或讓 JSON.parse 丟例外，所以每塊都要是合法的 200 NDJSON）
export async function stubWordlist(context, ndjson) {
    const filler = '{"w":"測試","z":"ㄘㄜˋ ㄕˋ","p":0}\n';
    await context.route(/\/data\/wordlist-c0\d\.json(\?.*)?$/, route => {
        const isFirst = new URL(route.request().url()).pathname.endsWith('wordlist-c00.json');   // 網址可能帶 ?v=
        return route.fulfill({ status: 200, contentType: 'application/json', body: isFirst ? ndjson : filler });
    });
}

// 每次都是全新 profile（D-06）；storage 為 { key: value } 預先放進 localStorage
// wordlist: 'real'（預設，golden 用）或 'stub'（讀 tests/fixtures/wordlist-stub.ndjson）
// waitWordlist: false 時不等詞庫載完（測慢速載入用）
// beforeGoto: async ({ context, page }) => {}，在收集器掛好之後、導航之前執行（例如 page.clock.install()）
// device: 任何 newContext 選項（viewport、isMobile、hasTouch、deviceScaleFactor、reducedMotion…），蓋過預設的桌機
// colorScheme: 給了就蓋過預設的 'light'
export async function bootPage(browser, { storage = {}, init = null, wordlist = 'real', aiReply, aiFail, models, corrections, beforeGoto = null, waitWordlist = true, device = {}, colorScheme } = {}) {
    const context = await browser.newContext({
        ...CONTEXT_OPTS,
        ...device,
        ...(colorScheme ? { colorScheme } : {}),
        storageState: {
            cookies: [],
            origins: [{
                origin: BASE,
                localStorage: Object.entries(storage).map(([name, value]) => ({ name, value })),
            }],
        },
    });
    const offOrigin = await routeExternal(context, { aiReply, aiFail, models, corrections });
    if (wordlist === 'stub') await stubWordlist(context, readFileSync(new URL('./fixtures/wordlist-stub.ndjson', import.meta.url), 'utf8'));
    if (init) await context.addInitScript(init);
    const page = await context.newPage();
    const { errors, warnings } = collectErrors(page);
    page.on('dialog', d => d.accept(d.type() === 'prompt' ? '測試' : undefined));   // 必須在導航前掛上
    if (beforeGoto) await beforeGoto({ context, page });
    await page.goto('/index.html');
    // 未定義的訊號會直接 resolve，後續 plan 加 __hoyunSafetyReady 時不必改這裡
    await page.evaluate(w => Promise.all([window.__hoyunReady, w ? window.__hoyunWordlistReady : null, window.__hoyunSafetyReady, window.__hoyunModelsReady]), waitWordlist);
    return { context, page, errors, warnings, offOrigin };
}

// 等一個 requestAnimationFrame 再加 setTimeout 0，讓 DOM 更新完；
// 之後若字卡還在分批渲染（#resultsContainer 的 data-render 不是 idle／done），再等到畫完（OD-4）
export async function settle(page) {
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))));
    await page.waitForFunction(() => {
        const r = document.getElementById('resultsContainer');
        const s = r && r.getAttribute('data-render');
        return !s || s === 'idle' || s === 'done';
    });
}

// ===== Phase 6 詞庫包測試工具 =====
// 詞庫包清單換成測試用的 JSON（manifest 形狀同 data/packs/index.json）
export async function stubManifest(context, manifest) {
    await context.route(/\/data\/packs\/index\.json(\?.*)?$/, route => route.fulfill({
        status: 200, contentType: 'application/json', body: JSON.stringify(manifest),
    }));
}

// 組一筆清單項目：路徑都在 data/packs/<id>/ 底下，跟 stubPack 對得起來
export function packEntry(id, name, extra = {}) {
    return {
        id, name,
        description: extra.description ?? (name + '的說明'),
        entries: extra.entries ?? 0,
        meta: `data/packs/${id}/meta.json`,
        chunkPattern: `data/packs/${id}/c{NN}.json`,
        notice: `data/packs/${id}/NOTICE.txt`,
        ...Object.fromEntries(Object.entries(extra).filter(([k]) => !['description', 'entries'].includes(k))),
    };
}

// 一包的假檔案。state = { version, chunks: [ndjson 字串…], fail: null|分段編號, notice, gate: null|Promise, requests: [] }
// state 在「請求到的當下」才讀，測試可以隨時改版本、讓某段失敗、用 gate 把分段請求卡住（放行就 resolve 它）
export async function stubPack(context, id, state) {
    state.requests ??= [];
    const base = `/data/packs/${id}/`;
    await context.route(new RegExp(`/data/packs/${id}/meta\\.json(\\?.*)?$`), route => route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
            id, version: state.version, chunks: state.chunks.length,
            entries: state.chunks.reduce((n, c) => n + c.split('\n').filter(Boolean).length, 0),
        }),
    }));
    await context.route(new RegExp(`/data/packs/${id}/c(\\d\\d)\\.json(\\?.*)?$`), async route => {
        const url = route.request().url();
        state.requests.push(url);
        const i = Number(new RegExp(`/c(\\d\\d)\\.json`).exec(new URL(url).pathname)[1]);
        if (state.gate) await state.gate;
        if (state.fail === i) return route.fulfill({ status: 500, body: 'x' });
        return route.fulfill({ status: 200, contentType: 'application/json', body: state.chunks[i] ?? '' });
    });
    await context.route(new RegExp(`/data/packs/${id}/NOTICE\\.txt(\\?.*)?$`), route => route.fulfill({
        status: 200, contentType: 'text/plain; charset=utf-8', body: state.notice ?? 'NOTICE ' + id,
    }));
    return base;
}
