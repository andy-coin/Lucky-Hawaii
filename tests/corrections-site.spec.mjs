// 修正層：Worker 套用 → 公開 view → 網站詞庫（瀏覽器，Worker 程式碼真的在測試程序裡跑）
import { test, expect } from '@playwright/test';
import worker from '../worker/src/index.js';
import { readFileSync } from 'node:fs';
import { bootPage, settle, EMPTY_CORRECTIONS, stubManifest, stubPack, packEntry } from './helpers.mjs';
import { FakeKV, makeEnv, bridgeWorker } from './worker-helpers.mjs';

const report = JSON.stringify({ type: 'word-report', word: '二心', ts: '2026-01-01T00:00:00.000Z', status: 'agreed', decided_by: 'admin', action: { type: 'remove_word', word: '二心' } });
const probe = page => page.evaluate(() => ({
    data: (wordlistData || []).map(e => e.w),
    phon: ['一心', '二心'].map(w => wordPhoneticMap.has(w)),
    prio: ['一心', '二心'].map(w => wordPriorityMap.has(w)),
}));

async function boot(browser, doApply) {
    const env = makeEnv({ ALLOW_LOCAL_ORIGIN: '1', USER_FEEDBACK_KV: new FakeKV({ k1: report }) });
    if (doApply) {
        const res = await worker.fetch(new Request('https://w/corrections/apply', {
            method: 'POST', headers: { 'X-Admin-Key': 'admin-test', 'Content-Type': 'application/json' },
            body: JSON.stringify({ kvKeys: ['k1'], baseRev: 0 }),
        }), env, { waitUntil() {} });
        expect(res.status).toBe(200);
    }
    const requests = [];
    const booted = await bootPage(browser, {
        wordlist: 'stub',
        beforeGoto: async ({ context, page }) => {
            page.on('request', r => { if (r.url().endsWith('/corrections.json')) requests.push(r.url()); });
            await bridgeWorker(context, env);
        },
    });
    return { ...booted, requests };
}

test('修正層：套用「移除詞」後重新整理，網站詞庫就沒有那個詞（只抓一次修正層）', async ({ browser }) => {
    const { context, page, errors, requests } = await boot(browser, true);
    const p = await probe(page);
    expect(p.data).not.toContain('二心');
    expect(p.data).toContain('一心');
    expect(p.phon).toEqual([true, false]);
    expect(p.prio).toEqual([true, false]);
    expect(requests).toHaveLength(1);
    expect(errors).toEqual([]);
    await context.close();
});

test('修正層：沒有套用任何修正時，詞庫完整保留', async ({ browser }) => {
    const { context, page, errors, requests } = await boot(browser, false);
    const p = await probe(page);
    expect(p.data).toEqual(expect.arrayContaining(['一心', '二心']));
    expect(p.phon).toEqual([true, true]);
    expect(requests).toHaveLength(1);
    expect(errors).toEqual([]);
    await context.close();
});

test('修正層：抓不到、慢過 3 秒、形狀不對 → 只留一則警告，詞庫照常載入', async ({ browser }) => {
    test.setTimeout(30_000);
    for (const mode of ['down', 'bad', 'hang']) {
        const { context, page, warnings } = await bootPage(browser, { wordlist: 'stub', corrections: mode });
        try {
            const p = await probe(page);
            expect(p.data, mode).toEqual(expect.arrayContaining(['一心', '二心']));
            expect(warnings.filter(m => m.includes('[好韻器] 修正層載入失敗')), mode).toHaveLength(1);
        } finally { await context.close(); }
    }
});

// ── 字庫（rhymeDict）：修正層疊在 data/rhyme-dict-overrides.json 之上 ──
const rdView = rd => ({ ...EMPTY_CORRECTIONS, rev: 1, rhymeDict: { removed: [], hidden: [], fixed: [], added: [], ...rd } });
const cardCount = async (page, input, ch, key) => {
    await page.fill('#searchInput', input);
    await settle(page);
    return page.locator(`.char-card[data-char="${ch}"][data-key="${key}"]`).count();
};

test('修正層：字庫隱藏讀音後，查韻看不到那張字卡（對照頁仍看得到）', async ({ browser }) => {
    const ctl = await bootPage(browser, { corrections: EMPTY_CORRECTIONS });
    try { expect(await cardCount(ctl.page, 'ㄔㄤ', '長', 'ㄔㄤ2')).toBeGreaterThan(0); } finally { await ctl.context.close(); }
    const { context, page, errors } = await bootPage(browser, { corrections: rdView({ hidden: [{ char: '長', dict_key: 'ㄔㄤ2' }] }) });
    try {
        expect(await cardCount(page, 'ㄔㄤ', '長', 'ㄔㄤ2')).toBe(0);
        expect(errors).toEqual([]);
    } finally { await context.close(); }
});

test('修正層：字庫修正與新增讀音', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { corrections: rdView({
        fixed: [{ char: '常', from: 'ㄔㄤ2', to: 'ㄕㄤ2' }],
        added: [{ char: '長', reading: 'ㄌㄤˊ', dict_key: 'ㄌㄤ2', tier: 'normal' }],
    }) });
    try {
        expect(await cardCount(page, 'ㄕㄤ', '常', 'ㄕㄤ2')).toBeGreaterThan(0);
        expect(await cardCount(page, 'ㄔㄤ', '常', 'ㄔㄤ2')).toBe(0);
        expect(await cardCount(page, 'ㄌㄤ', '長', 'ㄌㄤ2')).toBeGreaterThan(0);
        expect(errors).toEqual([]);
    } finally { await context.close(); }
});

// ── 修正層是「盡力而為」的加成：Worker 沒部署、太慢、壞掉或離線都不能擋畫面 ──
const WORKER_HOST = 'lucky-hawaii.is3000dollar.workers.dev';
// 故意回 503／斷線時，Chromium 會自己記一則「Failed to load resource」；那不是程式的 console.error
const realErrors = errors => errors.filter(e => !/status of 503|ERR_INTERNET_DISCONNECTED/.test(e));
const layerWarnings = warnings => warnings.filter(m => m.includes('修正層載入失敗'));
const toastText = page => page.evaluate(() => document.getElementById('copyToast')?.textContent || '');

async function expectUsable(page, errors, warnings, label) {
    await page.fill('#searchInput', '安');
    await settle(page);
    expect(await page.locator('.char-card').count(), label + '：查韻有字卡').toBeGreaterThan(0);
    await page.evaluate(() => document.getElementById('generateBtn').click());
    await expect(page.locator('#aiWordsContainer .ai-word-card'), label + '：AI 建議有 24 張').toHaveCount(24);
    expect(layerWarnings(warnings), label + '：只有一則警告').toHaveLength(1);
    expect(realErrors(errors), label).toEqual([]);
    await expect(page.locator('#lhSaveBanner')).toHaveCount(0);
    expect(await toastText(page), label + '：不跳提示').toBe('');
}

test('修正層：Worker 失敗（503／形狀不對）時網站照常可用，只留一則警告', async ({ browser }) => {
    test.setTimeout(60_000);
    for (const mode of ['down', 'bad']) {
        const { context, page, errors, warnings } = await bootPage(browser, { corrections: mode, aiReply: '' });
        try { await expectUsable(page, errors, warnings, mode); } finally { await context.close(); }
    }
});

test('修正層：逾時（Worker 一直不回）不卡頁面，3 秒後放棄並留一則警告', async ({ browser }) => {
    test.setTimeout(60_000);
    const t0 = Date.now();
    const { context, page, errors, warnings } = await bootPage(browser, { corrections: 'hang', aiReply: '' });
    try {
        expect(Date.now() - t0, '頁面與詞庫在 6 秒內就緒').toBeLessThan(6000);
        await expectUsable(page, errors, warnings, 'hang');
    } finally { await context.close(); }
});

test('修正層：離線（Worker 請求被中斷）時網站照常可用，只留一則警告', async ({ browser }) => {
    test.setTimeout(60_000);
    const { context, page, errors, warnings } = await bootPage(browser, {
        aiReply: '',
        beforeGoto: ({ context }) => context.route(u => new URL(u).hostname === WORKER_HOST && new URL(u).pathname === '/corrections.json',
            r => r.abort('internetdisconnected')),
    });
    try { await expectUsable(page, errors, warnings, 'offline'); } finally { await context.close(); }
});

test('修正層：順序——data 修正檔先套、修正層後套（先移除、再加回，只有一筆）', async ({ browser }) => {
    const { context, page, errors, warnings } = await bootPage(browser, {
        wordlist: 'stub',
        corrections: { ...EMPTY_CORRECTIONS, rev: 1, wordlist: { removed: [], hidden: [], fixed: {}, added: [{ w: '一心', z: 'ㄧˋ ㄒㄧㄣ', p: 1 }] } },
        beforeGoto: ({ context }) => context.route(/\/data\/wordlist-overrides\.json(\?.*)?$/, r => r.fulfill({
            status: 200, contentType: 'application/json', body: JSON.stringify({ version: 2, removed: ['一心'], hidden: [], fixed: {}, added: [] }),
        })),
    });
    try {
        expect(await page.evaluate(() => wordlistData.filter(e => e.w === '一心').length)).toBe(1);
        expect(await page.evaluate(() => wordPhoneticMap.has('一心'))).toBe(true);
        expect(errors).toEqual([]);
        expect(warnings.filter(m => m.includes('修正'))).toEqual([]);
    } finally { await context.close(); }
});

test('修正層：換詞庫包——被移除的詞在每個包都消失，且不再抓第二次', async ({ browser }) => {
    test.setTimeout(60_000);
    const pack = head => ({
        version: head, fail: null, gate: null, requests: [],
        chunks: [Array.from({ length: 30 }, (_, i) => JSON.stringify({ w: head + String.fromCharCode(0x4e00 + i * 3), z: 'ㄅㄚ ㄢ', p: 1 }))
            .concat([JSON.stringify({ w: '共用詞', z: 'ㄅㄚ ㄢ', p: 1 })]).join('\n') + '\n'],
    });
    const v096 = JSON.parse(readFileSync('data/packs/index.json', 'utf8')).packs.find(p => p.id === 'v096');
    const requests = [];
    const { context, page, errors } = await bootPage(browser, {
        wordlist: 'stub', aiReply: '', storage: { 'lh:lexiconPack': 'alpha' },
        corrections: { ...EMPTY_CORRECTIONS, rev: 1, wordlist: { removed: ['共用詞'], hidden: [], fixed: {}, added: [] } },
        beforeGoto: async ({ context, page }) => {
            page.on('request', r => { if (r.url().endsWith('/corrections.json')) requests.push(r.url()); });
            await stubManifest(context, { schema: 1, default: 'v096', packs: [v096, packEntry('alpha', 'Alpha', { entries: 31 }), packEntry('beta', 'Beta', { entries: 31 })] });
            await stubPack(context, 'alpha', pack('甲'));
            await stubPack(context, 'beta', pack('乙'));
        },
    });
    try {
        const has = () => page.evaluate(() => ({ id: activeLexiconPack.id, shared: wordlistData.some(e => e.w === '共用詞'), n: wordlistData.length }));
        expect(await has()).toEqual({ id: 'alpha', shared: false, n: 30 });
        expect(await page.evaluate(() => switchLexiconPack('beta'))).toBe(true);
        expect(await has()).toEqual({ id: 'beta', shared: false, n: 30 });
        expect(requests, '兩個包共用同一次修正層請求').toHaveLength(1);
        expect(errors).toEqual([]);
    } finally { await context.close(); }
});

// Playwright 一旦攔截路由就會關掉 HTTP 快取，請求標頭也看不到 fetch 的 cache 模式，所以「不繞過快取」只能檢查原始碼：
// loadCorrections 的 fetch 不能帶 cache: 'no-cache'（E2：伺服器的 max-age=60 才有效）
test('修正層：只抓一次，且 loadCorrections 不繞過瀏覽器快取（沒有 no-cache）', async ({ browser }) => {
    const src = readFileSync('js/dict.js', 'utf8');
    const fn = src.slice(src.indexOf('function loadCorrections()'), src.indexOf('function applyRhymeDictOverrideDoc'));
    expect(fn).toContain("'/corrections.json'");
    expect(fn).not.toMatch(/no-cache|no-store|reload/);
    const seen = [];
    const { context, errors } = await bootPage(browser, {
        wordlist: 'stub',
        beforeGoto: async ({ page }) => { page.on('request', r => { if (r.url().endsWith('/corrections.json')) seen.push(r.url()); }); },
    });
    try {
        expect(seen).toHaveLength(1);
        expect(errors).toEqual([]);
    } finally { await context.close(); }
});
