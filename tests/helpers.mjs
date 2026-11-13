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
    await stubSlangEmpty(context);
}

// 自建潮流詞庫換成空的：自己組小詞庫的測試要的是可預測的詞（data/slang/words.json 會疊加三千多個詞）
export const stubSlangEmpty = context => context.route(/\/data\/slang\/words\.json(\?.*)?$/,
    route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"version":"stub","count":0,"added":[]}' }));

// 每次都是全新 profile（D-06）；storage 為 { key: value } 預先放進 localStorage
// wordlist: 'real'（預設，golden 用）或 'stub'（讀 tests/fixtures/wordlist-stub.ndjson）
// waitWordlist: false 時不等詞庫載完（測慢速載入用）
// beforeGoto: async ({ context, page }) => {}，在收集器掛好之後、導航之前執行（例如 page.clock.install()）
// device: 任何 newContext 選項（viewport、isMobile、hasTouch、deviceScaleFactor、reducedMotion…），蓋過預設的桌機
// colorScheme: 給了就蓋過預設的 'light'
export async function bootPage(browser, { storage = {}, init = null, wordlist = 'real', aiReply, aiFail, models, corrections, beforeGoto = null, waitWordlist = true, device = {}, colorScheme } = {}) {
    // 觸控裝置沒存過縮放時預設 90%；大部分測試以 100% 為準，所以觸控沒指定就種 100（要測預設值的測試自己傳 'lh:uiScale': null）
    storage = { ...(device.hasTouch && !('lh:uiScale' in storage) ? { 'lh:uiScale': '100' } : {}), ...storage };
    storage = Object.fromEntries(Object.entries(storage).filter(([, v]) => v !== null));
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
    await context.addInitScript(() => { window.__lhDockMinW = 1600; });   // 測試沿用舊的寬螢幕門檻（1440 寬＝抽屜版面）
    if (init) await context.addInitScript(init);
    const page = await context.newPage();
    const { errors, warnings } = collectErrors(page);
    page.on('dialog', d => d.accept(d.type() === 'prompt' ? '測試' : undefined));   // 必須在導航前掛上
    if (beforeGoto) await beforeGoto({ context, page });
    await page.goto('/index.html');
    // 未定義的訊號會直接 resolve，後續 plan 加新訊號時不必改這裡
    await page.evaluate(w => Promise.all([window.__hoyunReady, w ? window.__hoyunWordlistReady : null, window.__hoyunSafetyReady, window.__hoyunSongsReady, window.__hoyunModelsReady, w ? window.__lhMapReady : null]), waitWordlist);
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

// ===== Phase 8 歌曲模型測試工具 =====
// 目前啟用的那首歌，直接讀儲存裡現在是什麼，不呼叫 flushSongs。
// 任何「資料有存下來」的斷言都要用這個：存檔計時器、組字確認、失焦、離開頁面這些路徑沒寫的話，這裡讀得到舊的，測試才會失敗（WR-11）。
// 打字之後的存檔要等 300 毫秒，用 expect.poll 或 page.waitForFunction 等它
export const activeSongRaw = page => page.evaluate(() => {
    const raw = localStorage.getItem('lh:songs');
    if (raw === null) return null;
    const songs = JSON.parse(raw);
    const id = localStorage.getItem('lh:activeSong');
    return songs.find(s => s.id === id) || null;
});

// 先 flushSongs() 再讀：只給「準備資料」與「收尾後讀結果」用，它會替被測的程式把該寫的寫出去，所以不能拿來證明程式有存檔
export const flushAndReadActiveSong = page => page.evaluate(() => {
    if (typeof flushSongs === 'function') flushSongs();
    const raw = localStorage.getItem('lh:songs');
    if (raw === null) return null;
    const songs = JSON.parse(raw);
    const id = localStorage.getItem('lh:activeSong');
    return songs.find(s => s.id === id) || null;
});

// 同一個 context（共用 localStorage）開兩個分頁，兩邊在同一個 tick 導航，等歌曲模型都就緒
export async function openTwoTabs(browser, storage) {
    const context = await browser.newContext({
        ...CONTEXT_OPTS,
        storageState: { cookies: [], origins: [{ origin: BASE, localStorage: Object.entries(storage).map(([name, value]) => ({ name, value })) }] },
    });
    await routeExternal(context);
    await stubWordlist(context, readFileSync(new URL('./fixtures/wordlist-stub.ndjson', import.meta.url), 'utf8'));
    const pages = [await context.newPage(), await context.newPage()];
    const errs = pages.map(p => collectErrors(p));
    await Promise.all(pages.map(p => p.goto('/index.html')));
    await Promise.all(pages.map(p => p.evaluate(() => Promise.all([window.__hoyunReady, window.__hoyunWordlistReady, window.__hoyunSafetyReady, window.__hoyunSongsReady, window.__lhMapReady]))));
    // 兩邊同時開機時，先完成的一邊可能還在補寫 lh:songs，另一邊會收到事件並跳提示；等儲存安靜下來、收掉開機時的提示，後面的斷言才不受影響
    let last = null;
    for (let stable = 0; stable < 2;) {
        await pages[0].waitForTimeout(250);
        const raw = await pages[0].evaluate(() => localStorage.getItem('lh:songs'));
        stable = raw === last ? stable + 1 : 0;
        last = raw;
    }
    await Promise.all(pages.map(p => p.evaluate(() => document.getElementById('copyToast')?.classList.remove('show'))));
    return { context, pages, errs };
}

// 用 CDP 模擬注音輸入法組字：每一步 Input.imeSetComposition，最後 Input.insertText 確認
// beforeCommit：組字中、確認之前執行（量「組字中有沒有存檔」）
export async function compose(page, steps, commit, beforeCommit = null) {
    const cdp = await page.context().newCDPSession(page);
    try {
        for (const text of steps) {
            await cdp.send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length });
        }
        if (beforeCommit) await beforeCommit();
        await cdp.send('Input.insertText', { text: commit });
    } finally {
        await cdp.detach().catch(() => {});
    }
}

// init script：記錄每一次 localStorage.setItem 的鍵與時間（window.__lsWrites）
export const STORAGE_SPY = () => {
    window.__lsWrites = [];
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
        window.__lsWrites.push({ k, t: performance.now() });
        return orig.call(this, k, v);
    };
};

// 備份全部／匯入備份只在偏好設定「資料與備份」分頁（標題列不再有按鈕）
export const SETTINGS_BACKUP = '.settings-saveload .save-load-btn >> nth=0';
export const SETTINGS_IMPORT = '.settings-saveload .save-load-btn >> nth=1';
export async function openDataTab(page) {
    if (!(await page.locator('#prefsTab-data').isVisible())) await page.locator('#settingsTrigger').click();
    await page.locator('#prefsTab-data').click();
}
// 打開設定 → 資料與備份 → 點備份全部，回傳下載物件
export async function clickBackup(page) {
    await openDataTab(page);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator(SETTINGS_BACKUP).click()]);
    return dl;
}
