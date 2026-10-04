// Phase 5 多裝置版面與縮放
// 每個測試名稱開頭是主題標籤（縮放：…），之後各 plan 依標籤加入 flow／面板／鍵盤等測試
import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { bootPage } from './helpers.mjs';
import { DEVICES, setScale, waitStill, noPageScroll, expectFullyInViewport, rectsOverlap, auditVisibleControls } from './layout-lib.mjs';

const SCALE_KEY = 'lh:uiScale';

// 讀出縮放相關的所有狀態，讓每個測試只比一份物件
const readScale = page => page.evaluate(() => ({
    cssVar: document.documentElement.style.getPropertyValue('--ui-scale'),
    rootFont: getComputedStyle(document.documentElement).fontSize,
    label: document.getElementById('MzoomValue').textContent,
    stored: lhGet('lh:uiScale'),
    current: lhUiScale,
}));

for (const [name, device] of [['桌機', DEVICES.desktop], ['手機', DEVICES.phone]]) {
    test(`縮放：➕ 一次 → 105%，根字級 16.8px，存進 lh:uiScale（${name}）`, async ({ browser }) => {
        const { context, page, errors } = await bootPage(browser, { device });
        try {
            await page.locator('#MzoomIn').click();   // 真的點按鈕，走完整事件路徑
            expect(await readScale(page)).toEqual({ cssVar: '1.05', rootFont: '16.8px', label: '105%', stored: '105', current: 105 });
            // 舊的 CSS zoom 不能再出現
            const zoom = await page.evaluate(() => {
                const c = document.querySelector('.container');
                return { inline: c.style.zoom, computed: getComputedStyle(c).zoom };
            });
            expect(zoom).toEqual({ inline: '', computed: '1' });
            expect(errors).toEqual([]);
        } finally { await context.close(); }
    });
}

// 儲存值 → 實際採用的百分比（含壞值與超出範圍）；undefined 代表完全沒存
const STORED_CASES = [
    ['105', 105], ['150', 150], ['155', 150], ['170', 150],
    ['50', 50], ['45', 50], ['0', 50], ['-20', 50],
    [undefined, 100], ['', 100], ['   ', 100], ['abc', 100],
];

test('縮放：重開沿用、壞值回 100、超出範圍夾回', async ({ browser }) => {
    for (const [stored, expected] of STORED_CASES) {
        const storage = stored === undefined ? {} : { [SCALE_KEY]: stored };
        const { context, page } = await bootPage(browser, { storage });
        try {
            expect(await readScale(page), `存的是 ${JSON.stringify(stored)}`).toMatchObject({
                current: expected,
                label: expected + '%',
                rootFont: expected / 100 * 16 + 'px',
                cssVar: String(expected / 100),
            });
        } finally { await context.close(); }
    }
    // 四捨五入規則：Math.round(n / 5) * 5（精度邊界）
    const { context, page } = await bootPage(browser, {});
    try {
        const out = await page.evaluate(() => [102, 102.5, 103, 97.4].map(x => lhNormalizeScale(x)));
        expect(out).toEqual([100, 105, 105, 95]);
    } finally { await context.close(); }
});

test('縮放：重新整理後在第一次繪製前就套用', async ({ browser }) => {
    const { context, page } = await bootPage(browser, {
        storage: { [SCALE_KEY]: '130' },
        // DOMContentLoaded 觸發時記下根字級，證明不是等開機流程跑完才補上；
        // 標籤由 layout.js 自己的 DOMContentLoaded 監聽補上（測試的監聽先註冊、會先跑），所以標籤改在 load 時讀
        init: () => {
            window.__fsAtDCL = {};
            document.addEventListener('DOMContentLoaded', () => {
                window.__fsAtDCL.font = getComputedStyle(document.documentElement).fontSize;
            });
            window.addEventListener('load', () => {
                window.__fsAtDCL.label = document.getElementById('MzoomValue').textContent;
            });
        },
    });
    try {
        expect(await page.evaluate(() => window.__fsAtDCL)).toEqual({ font: '20.8px', label: '130%' });
    } finally { await context.close(); }
});

// CSS zoom 宣告（zoom: …）或任何寫 zoom 樣式的地方；前面不能是字母或連字號，才不會誤抓 .m-zoom-value 這類類別名
const ZOOM_RE = /(^|[^\w-])zoom\s*:|\.style\.zoom|style\[\s*['"]zoom['"]\s*\]|setProperty\(\s*['"]zoom['"]/;

test('縮放：程式碼與樣式表沒有任何 zoom', async ({ browser }) => {
    // 負向對照：掃描規則本身要抓得到，否則「0 筆」沒有意義
    expect(ZOOM_RE.test('.a { zoom: 1.2; }')).toBe(true);
    expect(ZOOM_RE.test('el.style.zoom = 1;')).toBe(true);
    expect(ZOOM_RE.test('.m-zoom-value { top: 0; }')).toBe(false);

    const files = [
        ...readdirSync('css').filter(f => f.endsWith('.css')).map(f => `css/${f}`),
        ...readdirSync('js').filter(f => f.endsWith('.js')).map(f => `js/${f}`),
    ];
    const hits = [];
    for (const f of files) {
        readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
            if (ZOOM_RE.test(line)) hits.push(`${f}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(hits, '不該再有 zoom').toEqual([]);

    // 實際頁面：縮到最大後，沒有任何元素的計算 zoom 不是 1
    const { context, page } = await bootPage(browser, {});
    try {
        await setScale(page, 150);
        const bad = await page.evaluate(() => [...document.querySelectorAll('*')].filter(e => getComputedStyle(e).zoom !== '1').length);
        expect(bad).toBe(0);
    } finally { await context.close(); }
});

test('縮放：50% 與 150% 停用按鈕、再按也不超出', async ({ browser }) => {
    const { context, page } = await bootPage(browser, {});
    const state = () => page.evaluate(() => ({
        inDisabled: document.getElementById('MzoomIn').disabled,
        inAria: document.getElementById('MzoomIn').getAttribute('aria-disabled'),
        outDisabled: document.getElementById('MzoomOut').disabled,
        outAria: document.getElementById('MzoomOut').getAttribute('aria-disabled'),
        scale: lhUiScale,
        label: document.getElementById('MzoomValue').textContent,
    }));
    const enabled = { inDisabled: false, inAria: null, outDisabled: false, outAria: null };
    try {
        await setScale(page, 150);
        expect(await state()).toMatchObject({ inDisabled: true, inAria: 'true', outDisabled: false, outAria: null, scale: 150 });
        await page.evaluate(() => zoomIn());   // 程式呼叫也不能超過上限
        expect(await state()).toMatchObject({ scale: 150, label: '150%' });
        await setScale(page, 145);
        expect(await state()).toMatchObject({ ...enabled, scale: 145 });

        await setScale(page, 50);
        expect(await state()).toMatchObject({ outDisabled: true, outAria: 'true', inDisabled: false, inAria: null, scale: 50 });
        await page.evaluate(() => zoomOut());
        expect(await state()).toMatchObject({ scale: 50, label: '50%' });
        await setScale(page, 55);
        expect(await state()).toMatchObject({ ...enabled, scale: 55 });
    } finally { await context.close(); }
});

// ---- 尺寸一律用 rem（Pass A 之後的守門；Pass B 各 plan 新寫的尺寸也要過這關）----
// 只看「尺寸類」屬性；陰影、模糊、letter-spacing、transform、@media 斷點本來就不在清單內
const SIZE_PROP = /^(padding(-[a-z]+)?|margin(-[a-z]+)?|gap|row-gap|column-gap|width|height|min-width|min-height|max-width|max-height|top|right|bottom|left|inset|flex|flex-basis|grid-template-columns|grid-template-rows|grid-auto-rows|border(-top|-right|-bottom|-left)?|border-radius|border-[a-z-]+-radius|font-size|line-height)$/;
const PX_RE = /(?<![\w.])(-?\d*\.?\d+)px\b/g;

// 一段宣告文字（一行樣式表，或一個 style 屬性）裡不合規的 px：> 4px 且不是 max() 的第一個參數
function badPxIn(text) {
    const bad = [];
    for (const [, , prop, val] of text.matchAll(/(^|[{;\s])([a-z-]+)\s*:\s*([^;{}]+)/g)) {
        if (!SIZE_PROP.test(prop)) continue;
        for (const m of val.matchAll(PX_RE)) {
            const n = Math.abs(parseFloat(m[1]));
            if (n <= 4) continue;   // 細線與 0
            if (/max\(\s*$/.test(val.slice(0, m.index))) continue;   // 實體下限 max(44px, 2.75rem)
            bad.push(`${prop}: ${val.trim()}`);
            break;
        }
    }
    return bad;
}

// 回傳 `檔名:行號 宣告` 清單；樣式表跳過 @media/@import/@supports 行與註解，index.html 只看 style="…" 屬性
function scanPxSources(files) {
    const hits = [];
    for (const [file, src] of files) {
        const text = src.replace(/\/\*[\s\S]*?\*\//g, c => c.replace(/[^\n]/g, ' '));
        text.split('\n').forEach((line, i) => {
            if (/^\s*@(media|import|supports)/.test(line)) return;
            const parts = file.endsWith('.css') ? [line] : [...line.matchAll(/style="([^"]*)"/g)].map(m => m[1]);
            for (const p of parts) for (const d of badPxIn(p)) hits.push(`${file}:${i + 1} ${d}`);
        });
    }
    return hits;
}

test('縮放：尺寸一律用 rem（px 只留 ≤4px 細線與 max() 下限）', () => {
    // 負向對照：掃描器要抓得到，也要放得過，否則「0 筆」沒有意義
    expect(scanPxSources([['x.css', '.x { padding: 12px; }']])).toEqual(['x.css:1 padding: 12px']);
    expect(scanPxSources([['x.css', '.x { min-height: max(44px, 2.75rem); border-left: 4px solid red; height: 4px; margin: 0px; }']])).toEqual([]);
    expect(scanPxSources([['x.css', '@media (max-width: 900px) {\n/* padding: 12px; */\n.x { box-shadow: 0 8px 20px #000; }']])).toEqual([]);
    expect(scanPxSources([['x.html', '<div style="gap:10px">']])).toEqual(['x.html:1 gap: 10px']);

    const files = [
        ...readdirSync('css').filter(f => f.endsWith('.css')).map(f => `css/${f}`),
        'index.html',
    ].map(f => [f, readFileSync(f, 'utf8')]);
    // js 裡用 style.cssText 寫的尺寸另外盯：ai-generate.js 的狀態列
    expect(readFileSync('js/ai-generate.js', 'utf8')).toContain('padding:0.375rem 0');
    expect(scanPxSources(files), '這些宣告還在用 px').toEqual([]);
});

test('縮放：整個介面一起放大（側邊面板、分頁列、提示）', async ({ browser }) => {
    const { context, page } = await bootPage(browser, { device: DEVICES.desktop });
    try {
        const read = () => page.evaluate(() => {
            showToast('測試');
            const px = (sel, prop) => parseFloat(getComputedStyle(document.querySelector(sel))[prop]);
            return { panel: px('.side-panel', 'width'), tab: px('.mtab-btn', 'fontSize'), toast: px('.copy-toast', 'fontSize') };
        });
        const base = await read();
        expect(base.panel).toBeGreaterThan(0);
        await setScale(page, 150);
        const big = await read();
        for (const k of ['panel', 'tab', 'toast']) {
            expect(big[k], `${k}：100% 是 ${base[k]}px，150% 是 ${big[k]}px`).toBeCloseTo(base[k] * 1.5, 0);
        }
    } finally { await context.close(); }
});

// ---- Pass B-1：版面外殼（頁面高度＝實際可見高度）----
test('版面：整頁不捲動（5 種視窗 × 閒置／搜尋後）', async ({ browser }) => {
    for (const [name, device] of Object.entries(DEVICES)) {
        const { context, page } = await bootPage(browser, { device });
        try {
            await waitStill(page);
            for (const state of ['閒置', '搜尋後']) {
                if (state === '搜尋後') {
                    await page.fill('#searchInput', 'ㄢ');
                    await waitStill(page);
                }
                const m = await noPageScroll(page);
                expect(m.sh, `${name} ${state}：scrollHeight ${m.sh} 超過 innerHeight ${m.ih}`).toBeLessThanOrEqual(m.ih + 1);
                expect(m.sw, `${name} ${state}：scrollWidth ${m.sw} 超過 innerWidth ${m.iw}`).toBeLessThanOrEqual(m.iw);
            }
        } finally { await context.close(); }
    }
});

test('版面：橫拿手機搜尋後看得到第一張字卡', async ({ browser }) => {
    const { context, page } = await bootPage(browser, { device: DEVICES.phoneLandscape });
    try {
        await page.fill('#searchInput', 'ㄢ');
        await waitStill(page);
        const card = page.locator('.char-card').first();
        await expectFullyInViewport(page, card);
        // 字卡在 .results-section 裡面捲動：只在視窗內還不夠，卡片頂端也要落在結果區可見範圍內，不是被裁掉
        const [c, r] = await Promise.all([card.boundingBox(), page.locator('.results-section').boundingBox()]);
        expect(c.y, '字卡頂端在結果區之上').toBeGreaterThanOrEqual(r.y - 0.5);
        expect(c.y, '字卡頂端在結果區之下（被裁掉）').toBeLessThan(r.y + r.height);
    } finally { await context.close(); }
});

test('輸入：viewport 設定保留縮放手勢', async ({ browser }) => {
    const { context, page } = await bootPage(browser, {});
    try {
        const content = await page.locator('meta[name="viewport"]').getAttribute('content');
        expect(content).toBe('width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content');
        expect(content).not.toMatch(/maximum-scale|user-scalable/);
    } finally { await context.close(); }
});

// ---- Pass B-1：頂部工具列與縮放不吃邊 ----
const PHONE_PLACEHOLDER = '輸入注音、拼音或漢字';
const DESKTOP_PLACEHOLDER = '輸入注音/拼音/單字或詞彙，例如：ㄢ/an/安/安打';

// 標題／搜尋／分頁列裡，框超出視窗的可互動元素（名稱加位置）
async function controlsOutside(page) {
    const vp = page.viewportSize();
    return (await auditVisibleControls(page, '.header, .search-section, .mobile-tab-bar')).filter(c =>
        c.x < -0.5 || c.y < -0.5 || c.x + c.width > vp.width + 0.5 || c.y + c.height > vp.height + 0.5)
        .map(c => `${c.name} [${Math.round(c.x)},${Math.round(c.y)} ${Math.round(c.width)}×${Math.round(c.height)}]`);
}

// 一個畫面狀態的完整檢查：整頁不捲動、沒有 zoom、標題／搜尋／分頁列的每個可互動元素都在視窗內
async function expectScaleFits(page, label) {
    const m = await noPageScroll(page);
    expect(m.sw, `${label}：scrollWidth ${m.sw} > innerWidth ${m.iw}`).toBeLessThanOrEqual(m.iw);
    expect(m.sh, `${label}：scrollHeight ${m.sh} > innerHeight ${m.ih}`).toBeLessThanOrEqual(m.ih + 1);
    const zoomed = await page.evaluate(() => [...document.querySelectorAll('*')].filter(e => getComputedStyle(e).zoom !== '1').length);
    expect(zoomed, `${label}：有元素的計算 zoom 不是 1`).toBe(0);
    expect(await controlsOutside(page), `${label}：這些控制鈕超出視窗`).toEqual([]);
}

// 三種裝置各一個測試（各自平行，單一測試不會逼近逾時）
for (const name of ['phone', 'tablet', 'desktop']) {
    test(`縮放：50／100／150 都不吃邊（${name}，閒置／搜尋後）`, async ({ browser }) => {
        const { context, page } = await bootPage(browser, { device: DEVICES[name] });
        try {
            await waitStill(page);
            // 負向對照：量測要抓得到跑出視窗的控制鈕，否則「0 個」沒有意義
            await page.evaluate(() => {
                const b = document.createElement('button');
                b.id = 'probeOut'; b.textContent = 'x'; b.style.cssText = 'position:fixed;left:-200px;top:0';
                document.querySelector('.header').appendChild(b);
            });
            expect((await controlsOutside(page)).some(n => n.startsWith('button#probeOut'))).toBe(true);
            await page.evaluate(() => document.getElementById('probeOut').remove());

            // 閒置：空的搜尋框，「開始搜尋」提示要在結果區內、不橫向溢出
            for (const pct of [100, 50, 150]) {
                await setScale(page, pct);
                await waitStill(page);
                await expectScaleFits(page, `${name} ${pct}% 閒置`);
                const empty = await page.evaluate(() => {
                    const e = document.querySelector('#resultsContainer .empty-state');
                    const c = document.getElementById('mainContainer').getBoundingClientRect();
                    if (!e) return null;
                    const b = e.getBoundingClientRect();
                    return { over: e.scrollWidth - e.clientWidth, left: b.left - c.left, right: c.right - b.right };
                });
                expect(empty, `${name} ${pct}%：找不到 .empty-state`).not.toBeNull();
                expect(empty.over, `${name} ${pct}%：開始搜尋提示橫向溢出`).toBeLessThanOrEqual(0);
                expect(empty.left, `${name} ${pct}%：開始搜尋提示超出容器左邊`).toBeGreaterThanOrEqual(-0.5);
                expect(empty.right, `${name} ${pct}%：開始搜尋提示超出容器右邊`).toBeGreaterThanOrEqual(-0.5);
            }
            // 搜尋後（目前在 150%，再走 100、50）
            await page.fill('#searchInput', 'ㄢ');
            for (const pct of [150, 100, 50]) {
                await setScale(page, pct);
                await waitStill(page);
                await expectScaleFits(page, `${name} ${pct}% 搜尋後`);
            }
        } finally { await context.close(); }
    });
}

test('縮放：手機 150% 工具列不重疊、控制鈕都點得到、點百分比回 100%', async ({ browser }) => {
    const { context, page } = await bootPage(browser, { device: DEVICES.phone });
    try {
        await setScale(page, 150);
        await waitStill(page);
        const items = ['#MzoomOut', '.zoom-reset', '#MzoomIn', '#themeToggle', '.header h1'];
        const boxes = [];
        for (const sel of items) {
            const b = await page.locator(sel).first().boundingBox();
            expect(b, `${sel} 沒有版面框`).not.toBeNull();
            boxes.push([sel, b]);
        }
        for (let i = 0; i < boxes.length; i++) {
            for (let j = i + 1; j < boxes.length; j++) {
                expect(rectsOverlap(boxes[i][1], boxes[j][1]), `${boxes[i][0]} 和 ${boxes[j][0]} 重疊`).toBe(false);
            }
        }
        // 全部要在視窗內，不必捲動就點得到（含設定齒輪）
        for (const sel of ['#MzoomOut', '.zoom-reset', '#MzoomIn', '#themeToggle', '#settingsTrigger', '.header h1']) {
            await expectFullyInViewport(page, page.locator(sel).first());
        }
        await page.locator('.zoom-reset').click();
        expect(await readScale(page)).toMatchObject({ current: 100, label: '100%', stored: '100', rootFont: '16px' });
    } finally { await context.close(); }
});

test('版面：標題區高度', async ({ browser }) => {
    for (const [name, device, max] of [['手機', DEVICES.phone, 124], ['平板', DEVICES.tablet, 150]]) {
        const { context, page } = await bootPage(browser, { device });
        try {
            await waitStill(page);
            const h = await page.locator('.header').evaluate(e => e.getBoundingClientRect().height);
            expect(h, `${name}標題區 ${h}px，上限 ${max}px`).toBeLessThanOrEqual(max);
        } finally { await context.close(); }
    }
});

test('版面：轉向時主題按鈕與提示字跟著換', async ({ browser }) => {
    const { context, page } = await bootPage(browser, { device: DEVICES.phone });
    try {
        const read = () => page.evaluate(() => ({
            theme: document.getElementById('themeToggle').textContent.trim(),
            placeholder: document.getElementById('searchInput').placeholder,
        }));
        const PHONE = { theme: '☀️', placeholder: PHONE_PLACEHOLDER };
        const WIDE = { theme: '☀️ 淺色模式', placeholder: DESKTOP_PLACEHOLDER };
        expect(await read()).toEqual(PHONE);
        // 440／441 是分界；不重新載入就要跟著變
        for (const [w, h, want] of [[820, 1180, WIDE], [440, 844, PHONE], [441, 844, WIDE], [390, 844, PHONE]]) {
            await page.setViewportSize({ width: w, height: h });
            await expect.poll(read, { message: `寬 ${w}px` }).toEqual(want);
        }
        // 深色模式下轉向，圖示與文字也要對
        await page.locator('#themeToggle').click();
        expect(await read()).toMatchObject({ theme: '🌙' });
        await page.setViewportSize({ width: 820, height: 1180 });
        await expect.poll(read).toMatchObject({ theme: '🌙 深色模式' });
    } finally { await context.close(); }
});

// ===== 05-04：偏好設定與對話框（D-11、UI-SPEC §6） =====
const openSettings = page => page.locator('#settingsTrigger').click();

test('設定：電腦與平板也有顏色、存讀檔、回報', async ({ browser }) => {
    for (const [name, device] of [['desktop', DEVICES.desktop], ['tablet', DEVICES.tablet], ['phone', DEVICES.phone]]) {
        const { context, page } = await bootPage(browser, { device });
        try {
            await openSettings(page);
            const dlg = page.locator('#settingsOverlay .settings-dropdown');
            await expect(dlg, name).toBeVisible();
            for (const sel of ['#sBgColor1', '#sContainerBg', '#sTextColor', '#sHighlightColor', '.settings-saveload .save-load-btn >> nth=0', '.settings-saveload .save-load-btn >> nth=1', '.settings-feedback-btn']) {
                await expect(dlg.locator(sel), `${name} ${sel}`).toBeVisible();
            }
        } finally { await context.close(); }
    }
});

test('設定：矮螢幕上對話框不超出、可以捲', async ({ browser }) => {
    const { context, page } = await bootPage(browser, { device: DEVICES.phoneLandscape });
    try {
        const dialogs = [
            ['設定', '#settingsOverlay', '.settings-dropdown', 'toggleSettings()'],
            ['關於', '#aboutOverlay', '.about-content', 'toggleAbout()'],
            ['回報', '#feedbackModalOverlay', '.feedback-modal', 'openFeedbackModal()'],
            ['標籤', '#hashtagPopupOverlay', '.hashtag-popup', 'openHashtagPopup()'],
        ];
        for (const [name, overlay, box, open] of dialogs) {
            await page.evaluate(open);
            await expect(page.locator(overlay)).toHaveClass(/show/);
            const m = await page.evaluate(sel => {
                const el = document.querySelector(sel);
                const r = el.getBoundingClientRect();
                const cs = getComputedStyle(el);
                const before = el.scrollTop;
                el.scrollTop = el.scrollHeight;
                return { top: r.top, bottom: r.bottom, h: r.height, ih: innerHeight, overflowY: cs.overflowY, tall: el.scrollHeight > el.clientHeight, moved: el.scrollTop > before };
            }, `${overlay} ${box}`);
            expect(m.h, `${name} 高度`).toBeLessThanOrEqual(m.ih - 32 + 0.5);
            expect(m.top, `${name} 上緣`).toBeGreaterThanOrEqual(0);
            expect(m.bottom, `${name} 下緣`).toBeLessThanOrEqual(m.ih + 0.5);
            expect(['auto', 'scroll'], `${name} overflow-y`).toContain(m.overflowY);
            if (m.tall) expect(m.moved, `${name} 內容比對話框高但捲不動`).toBe(true);
            if (name === '設定') expect(m.tall, '設定內容在矮螢幕上應該比對話框高').toBe(true);
            await page.evaluate(o => document.querySelector(o).classList.remove('show'), overlay);
        }
    } finally { await context.close(); }
});

test('設定：重設顏色與旁邊按鈕至少隔 1rem', async ({ browser }) => {
    for (const [name, device] of [['desktop', DEVICES.desktop], ['phone', DEVICES.phone]]) {
        const { context, page } = await bootPage(browser, { device });
        try {
            await openSettings(page);
            const gaps = await page.evaluate(() => {
                const btns = [...document.querySelectorAll('#settingsOverlay .settings-dropdown button')].filter(b => b.getClientRects().length);
                const reset = btns.find(b => b.textContent.trim() === '重設顏色!');
                const a = reset.getBoundingClientRect();
                return btns.filter(b => b !== reset).map(b => {
                    const r = b.getBoundingClientRect();
                    const dx = Math.max(r.left - a.right, a.left - r.right, 0);
                    const dy = Math.max(r.top - a.bottom, a.top - r.bottom, 0);
                    return { name: b.textContent.trim(), gap: Math.max(dx, dy) };
                });
            });
            expect(gaps.length, name).toBeGreaterThanOrEqual(3);
            for (const g of gaps) expect(g.gap, `${name}：重設顏色! 與 ${g.name}`).toBeGreaterThanOrEqual(16);
        } finally { await context.close(); }
    }
});

test('設定：文字色與底色相同時仍按得到重設顏色', async ({ browser }) => {
    // 文字色 = 底色：畫面上看不到字，但設定對話框要能捲到、重設鈕要按得到也真的有效（UI-02、T-05-10）
    const { context, page } = await bootPage(browser, {
        device: DEVICES.phone,
        storage: { containerBg: '#eee3ce', textColor: '#eee3ce' },
    });
    try {
        await setScale(page, 150);
        await waitStill(page);
        expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim())).toBe('#eee3ce');
        await openSettings(page);
        const reset = page.getByRole('button', { name: '重設顏色!' });
        await reset.scrollIntoViewIfNeeded();
        await expectFullyInViewport(page, reset);
        await reset.click();
        expect(await page.evaluate(() => ({ stored: lhGet('textColor'), bg: lhGet('containerBg'), tp: getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() })))
            .toEqual({ stored: null, bg: null, tp: '#2d3748' });
    } finally { await context.close(); }
});
