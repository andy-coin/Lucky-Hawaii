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
            // 面板寬度改成跟視窗寬度連動（--panel-w，05-05 推開版型），不再固定 25rem，所以改量分頁寬（--tab-w，隨根字級放大）
            return { panel: px('.side-panel-tab', 'width'), tab: px('.mtab-btn', 'fontSize'), toast: px('.copy-toast', 'fontSize') };
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

// ===== 05-05：桌機側邊面板推開主畫面（D-03、D-17、UI-SPEC §6） =====
const rectOf = (page, sel) => page.evaluate(s => {
    const r = document.querySelector(s).getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
}, sel);
// 元素中心點點下去，最上面的是不是它自己（或它的子元素）：被面板蓋住就會是別人
const hitsItself = (page, sel) => page.evaluate(s => {
    const el = document.querySelector(s);
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return el === top || el.contains(top);
}, sel);
const clickTab = (page, side) => page.locator(`.${side}-panel .side-panel-tab`).click();
const isCollapsed = (page, side) => page.evaluate(s => document.getElementById(s + 'Panel').classList.contains('collapsed'), side);

test('面板：桌機展開不蓋住主畫面（1440、1280；左、右、兩邊）', async ({ browser }) => {
    for (const [w, h] of [[1440, 900], [1280, 900]]) {
        for (const [label, sides] of [['左', ['left']], ['右', ['right']], ['兩邊', ['left', 'right']]]) {
            const { context, page } = await bootPage(browser, { device: { viewport: { width: w, height: h }, deviceScaleFactor: 1 } });
            try {
                for (const s of sides) await clickTab(page, s);
                await waitStill(page);
                for (const s of ['left', 'right']) {
                    expect(await isCollapsed(page, s), `${w} ${label}：${s} 面板狀態`).toBe(!sides.includes(s));
                }
                const container = await rectOf(page, '.container');
                for (const id of ['#leftPanel', '#rightPanel']) {
                    const p = await rectOf(page, id);
                    expect(rectsOverlap(p, container), `${w} ${label}：${id} ${JSON.stringify(p)} 蓋到主畫面 ${JSON.stringify(container)}`).toBe(false);
                }
                for (const sel of ['#MzoomOut', '#MzoomIn', '#themeToggle']) {
                    expect(await hitsItself(page, sel), `${w} ${label}：${sel} 被蓋住`).toBe(true);
                }
            } finally { await context.close(); }
        }
    }
});

test('面板：窄桌機時收合分頁不碰到主畫面（920）', async ({ browser }) => {
    const { context, page } = await bootPage(browser, { device: { viewport: { width: 920, height: 900 }, deviceScaleFactor: 1 } });
    try {
        await waitStill(page);
        expect(await isCollapsed(page, 'left')).toBe(true);
        expect(await isCollapsed(page, 'right')).toBe(true);
        const container = await rectOf(page, '.container');
        const tabL = await rectOf(page, '.left-panel .side-panel-tab');
        const tabR = await rectOf(page, '.right-panel .side-panel-tab');
        expect(container.x, `主畫面左緣 ${container.x} 要離分頁寬 ${tabL.width} 再多 4px`).toBeGreaterThanOrEqual(tabL.width + 4 - 0.5);
        expect(920 - (container.x + container.width), '主畫面右緣離視窗邊').toBeGreaterThanOrEqual(tabR.width + 4 - 0.5);
        expect(rectsOverlap(tabL, container), '左分頁蓋到主畫面').toBe(false);
        expect(rectsOverlap(tabR, container), '右分頁蓋到主畫面').toBe(false);
        // 兩個分頁都還在畫面內、點得到
        expect(await hitsItself(page, '.left-panel .side-panel-tab')).toBe(true);
        expect(await hitsItself(page, '.right-panel .side-panel-tab')).toBe(true);
    } finally { await context.close(); }
});

test('面板：放不下兩個面板時開第二個會收起第一個（1000）', async ({ browser }) => {
    // 1000 寬：面板各 320、邊距各 20 → 主畫面只剩 320，不到 24rem（384），所以不能兩邊同時開
    // （計畫寫的 1100 在這組數字下主畫面剩 400，其實放得下，所以用 1000 才碰得到邊界）
    const narrow = await bootPage(browser, { device: { viewport: { width: 1000, height: 900 }, deviceScaleFactor: 1 } });
    try {
        const { page } = narrow;
        await clickTab(page, 'left');
        await waitStill(page);
        expect(await isCollapsed(page, 'left')).toBe(false);
        await clickTab(page, 'right');
        await waitStill(page);
        expect(await isCollapsed(page, 'right'), '第二個開的要留著').toBe(false);
        expect(await isCollapsed(page, 'left'), '第一個要被收起').toBe(true);
        // 反過來：先開右、再開左 → 右收起
        await clickTab(page, 'left');
        await waitStill(page);
        expect(await isCollapsed(page, 'left')).toBe(false);
        expect(await isCollapsed(page, 'right')).toBe(true);
        // 主畫面還有 24rem 以上
        const c = await rectOf(page, '.container');
        expect(c.width, '主畫面寬度').toBeGreaterThanOrEqual(384 - 0.5);
    } finally { await narrow.context.close(); }
    // 1440 寬、100%：兩邊可以同時開
    const wide = await bootPage(browser, { device: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } });
    try {
        await clickTab(wide.page, 'left');
        await clickTab(wide.page, 'right');
        await waitStill(wide.page);
        expect(await isCollapsed(wide.page, 'left')).toBe(false);
        expect(await isCollapsed(wide.page, 'right')).toBe(false);
    } finally { await wide.context.close(); }
});

test('面板：收起的面板內容不能被 Tab 鍵選到', async ({ browser }) => {
    const { context, page } = await bootPage(browser, { device: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } });
    try {
        await waitStill(page);
        const inertState = () => page.evaluate(() => Object.fromEntries(['leftPanel', 'rightPanel'].map(id => {
            const p = document.getElementById(id);
            return [id, { panel: p.inert, aria: p.getAttribute('aria-hidden'), body: p.querySelector('.side-panel-body').inert, collapsed: p.classList.contains('collapsed') }];
        })));
        // 全收起：內容 inert、面板本身不 inert（分頁還要點得到）
        let st = await inertState();
        for (const id of ['leftPanel', 'rightPanel']) {
            expect(st[id], id).toEqual({ panel: false, aria: null, body: true, collapsed: true });
        }
        // 從搜尋框連按 Tab：焦點不可以落進收起面板的內容
        await page.focus('#searchInput');
        for (let i = 0; i < 40; i++) {
            await page.keyboard.press('Tab');
            const bad = await page.evaluate(() => {
                const a = document.activeElement;
                const b = a && a.closest && a.closest('.side-panel-body');
                return b && b.closest('.side-panel').classList.contains('collapsed') ? (a.id || a.className || a.tagName) : null;
            });
            expect(bad, `第 ${i + 1} 下 Tab 跑進收起的面板：${bad}`).toBeNull();
        }
        // 分頁本身還是點得到：點了就展開，展開的面板內容不 inert、另一邊仍 inert
        await clickTab(page, 'left');
        await waitStill(page);
        st = await inertState();
        expect(st.leftPanel).toEqual({ panel: false, aria: null, body: false, collapsed: false });
        expect(st.rightPanel).toEqual({ panel: false, aria: null, body: true, collapsed: true });
        // 展開後鍵盤真的選得到面板裡的按鈕
        await page.focus('#searchInput');
        let reached = false;
        for (let i = 0; i < 60 && !reached; i++) {
            await page.keyboard.press('Tab');
            reached = await page.evaluate(() => !!document.activeElement.closest('#leftPanel .side-panel-body'));
        }
        expect(reached, '展開的歌詞面板應該能用 Tab 選到').toBe(true);
    } finally { await context.close(); }
});

// ===== 05-05 任務二：版型跟著即時斷點走（D-02、UI-SPEC §6 breakpoint cross） =====
// 一次讀出面板、body 類別、inert、批次按鈕所在位置，讓每一步只比一份物件
const readPanels = page => page.evaluate(() => {
    const info = id => {
        const p = document.getElementById(id);
        return { collapsed: p.classList.contains('collapsed'), inert: p.inert, aria: p.getAttribute('aria-hidden'), bodyInert: p.querySelector('.side-panel-body').inert };
    };
    const bp = document.getElementById('m-batchPanel');
    return {
        left: info('leftPanel'),
        right: info('rightPanel'),
        lpOpen: document.body.classList.contains('lp-open'),
        rpOpen: document.body.classList.contains('rp-open'),
        batchIn: bp.parentElement.id || bp.parentElement.tagName.toLowerCase(),
    };
});
const SHEET_COLLAPSED = { collapsed: true, inert: true, aria: 'true', bodyInert: false };
const PUSH_OPEN = { collapsed: false, inert: false, aria: null, bodyInert: false };
const PUSH_CLOSED = { collapsed: true, inert: false, aria: null, bodyInert: true };

test('面板：轉向不必重新整理（1180→820→390→820→1180）', async ({ browser }) => {
    const { context, page } = await bootPage(browser, {
        device: DEVICES.tabletLandscape,
        storage: { leftPanelCollapsed: 'false', rightPanelCollapsed: 'true' },
    });
    try {
        const steps = [
            [1180, 820, { left: PUSH_OPEN, right: PUSH_CLOSED, lpOpen: true, rpOpen: false, batchIn: 'body' }],
            [820, 1180, { left: SHEET_COLLAPSED, right: SHEET_COLLAPSED, lpOpen: false, rpOpen: false, batchIn: 'body' }],
            [390, 844, { left: SHEET_COLLAPSED, right: SHEET_COLLAPSED, lpOpen: false, rpOpen: false, batchIn: 'mobileBatchArea' }],
            [820, 1180, { left: SHEET_COLLAPSED, right: SHEET_COLLAPSED, lpOpen: false, rpOpen: false, batchIn: 'body' }],
            [1180, 820, { left: PUSH_OPEN, right: PUSH_CLOSED, lpOpen: true, rpOpen: false, batchIn: 'body' }],
        ];
        for (const [w, h, want] of steps) {
            await page.setViewportSize({ width: w, height: h });
            await expect.poll(() => readPanels(page), { message: `${w}×${h}` }).toEqual(want);
        }
        // 改視窗大小不可以改掉使用者存的偏好
        expect(await page.evaluate(() => [lhGet('leftPanelCollapsed'), lhGet('rightPanelCollapsed')])).toEqual(['false', 'true']);
    } finally { await context.close(); }
});

test('面板：開著底部面板時轉成寬螢幕，遮罩不會殘留擋住畫面', async ({ browser }) => {
    const { context, page } = await bootPage(browser, { device: DEVICES.phone });
    try {
        await page.locator('#mtab-lyrics').click();
        await expect(page.locator('#mobileBackdrop')).toHaveClass(/show/);
        await page.setViewportSize({ width: 1180, height: 820 });
        await expect.poll(() => page.evaluate(() => ({
            backdrop: document.getElementById('mobileBackdrop').classList.contains('show'),
            active: [...document.querySelectorAll('.mtab-btn.active')].map(b => b.id),
        }))).toEqual({ backdrop: false, active: ['mtab-search'] });   // 沒開任何面板時亮的是「查韻」（05-06）
        // 搜尋框點得到（沒有東西蓋在上面）
        expect(await hitsItself(page, '#searchInput')).toBe(true);
    } finally { await context.close(); }
});

test('面板：900／901、440／441 剛好換版', async ({ browser }) => {
    const { context, page } = await bootPage(browser, { device: { viewport: { width: 900, height: 900 }, deviceScaleFactor: 1 } });
    try {
        const tier = () => page.evaluate(() => ({
            tabBar: getComputedStyle(document.querySelector('.mobile-tab-bar')).display !== 'none',
            edgeTab: getComputedStyle(document.querySelector('.side-panel-tab')).display !== 'none',
            leftInert: document.getElementById('leftPanel').inert,
            batchIn: document.getElementById('m-batchPanel').parentElement.id || 'body',
        }));
        const SHEET = { tabBar: true, edgeTab: false, leftInert: true };
        const PUSH = { tabBar: false, edgeTab: true, leftInert: false };
        await expect.poll(tier, { message: '900' }).toMatchObject(SHEET);
        await page.setViewportSize({ width: 901, height: 900 });
        await expect.poll(tier, { message: '901' }).toMatchObject(PUSH);
        await page.setViewportSize({ width: 900, height: 900 });
        await expect.poll(tier, { message: '回到 900' }).toMatchObject(SHEET);
        // 批次按鈕：440 在搜尋區、441 不在
        await page.setViewportSize({ width: 440, height: 900 });
        await expect.poll(tier, { message: '440' }).toMatchObject({ batchIn: 'mobileBatchArea' });
        await page.setViewportSize({ width: 441, height: 900 });
        await expect.poll(tier, { message: '441' }).toMatchObject({ batchIn: 'body' });
    } finally { await context.close(); }
});

test('輸入：觸控裝置開頁不會自動跳出鍵盤', async ({ browser }) => {
    // 手機、平板（含橫放超過 900 寬的觸控平板）開頁都不能自己聚焦搜尋框，否則鍵盤會自己彈出來
    for (const [name, device] of [['手機', DEVICES.phone], ['平板', DEVICES.tablet], ['橫放平板', DEVICES.tabletLandscape]]) {
        const { context, page } = await bootPage(browser, { device });
        try {
            expect(await page.evaluate(() => document.activeElement === document.body), `${name} 開頁焦點應該在 body`).toBe(true);
        } finally { await context.close(); }
    }
    // 桌機（寬、滑鼠）開頁直接可以打字
    const { context, page } = await bootPage(browser, { device: DEVICES.desktop });
    try {
        expect(await page.evaluate(() => document.activeElement && document.activeElement.id), '桌機開頁焦點應該在搜尋框').toBe('searchInput');
    } finally { await context.close(); }
});

// 靜態檢查（不開瀏覽器）：版型判斷只能走 lhIsPhone()／lhIsSheetMode() 與 matchMedia 監聽
const WIDTH_CHECK_RE = /innerWidth\s*(?:<=|>)\s*(?:440|900)/;
const PHONE_GLOBAL_RE = /\b(?:let|const|var)\s+phone\b/;
test('面板：程式不再用 innerWidth 判斷版型', () => {
    // 負向對照：舊寫法一定要抓得到，否則這個檢查沒有意義
    expect(WIDTH_CHECK_RE.test('if (window.innerWidth <= 900) {')).toBe(true);
    expect(WIDTH_CHECK_RE.test('if (window.innerWidth > 900)')).toBe(true);
    expect(WIDTH_CHECK_RE.test('window.innerWidth <= 440')).toBe(true);
    expect(WIDTH_CHECK_RE.test('Math.min(x, window.innerWidth - 160)')).toBe(false);
    expect(PHONE_GLOBAL_RE.test('let phone = window.innerWidth <= 440;')).toBe(true);
    expect(PHONE_GLOBAL_RE.test('const phoneLike = 1;')).toBe(false);
    const hits = [];
    for (const f of readdirSync(new URL('../js/', import.meta.url)).filter(n => n.endsWith('.js'))) {
        readFileSync(new URL('../js/' + f, import.meta.url), 'utf8').split('\n').forEach((line, i) => {
            if (WIDTH_CHECK_RE.test(line) || PHONE_GLOBAL_RE.test(line)) hits.push(`js/${f}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(hits, '這些行還在用寬度數字判斷版型或宣告 phone 全域').toEqual([]);
});

// ===== 05-06 任務一：底部三分頁（查韻・歌詞・AI 建議）、把手、Esc、收起不可聚焦（D-06、D-17、UI-SPEC §6、§14.2） =====
// 一次讀出三個分頁的按下狀態、兩個面板是否展開、遮罩有沒有顯示
const readSheets = page => page.evaluate(() => ({
    pressed: ['search', 'lyrics', 'ai'].map(t => document.getElementById('mtab-' + t).getAttribute('aria-pressed')).join(','),
    active: [...document.querySelectorAll('.mtab-btn.active')].map(b => b.id.replace('mtab-', '')).join(','),
    open: ['left', 'right'].filter(s => !document.getElementById(s + 'Panel').classList.contains('collapsed')).join(','),
    backdrop: document.getElementById('mobileBackdrop').classList.contains('show'),
}));
const NONE_OPEN = { pressed: 'true,false,false', active: 'search', open: '', backdrop: false };
const LYRICS_OPEN = { pressed: 'false,true,false', active: 'lyrics', open: 'left', backdrop: true };
const AI_OPEN = { pressed: 'false,false,true', active: 'ai', open: 'right', backdrop: true };

for (const [name, device] of [['手機', DEVICES.phone], ['平板', DEVICES.tablet]]) {
    test(`底部面板：三個分頁開關、把手、背景、Esc（${name}）`, async ({ browser }) => {
        const { context, page, errors } = await bootPage(browser, { device });
        try {
            await waitStill(page);
            // 三個分頁：文字、type、一開始「查韻」被按下
            expect(await page.evaluate(() => [...document.querySelectorAll('.mobile-tab-bar .mtab-btn')].map(b => ({ id: b.id, text: b.textContent.replace(/\s+/g, ' ').trim(), type: b.type }))))
                .toEqual([
                    { id: 'mtab-search', text: '🔍 查韻', type: 'button' },
                    { id: 'mtab-lyrics', text: '📝 歌詞', type: 'button' },
                    { id: 'mtab-ai', text: '✨ AI 建議', type: 'button' },
                ]);
            expect(await readSheets(page)).toEqual(NONE_OPEN);

            // 開歌詞 → 開 AI 建議（歌詞自動關）→ 再按 AI 建議（關）
            await page.locator('#mtab-lyrics').tap();
            await waitStill(page);
            expect(await readSheets(page)).toEqual(LYRICS_OPEN);
            await page.locator('#mtab-ai').tap();
            await waitStill(page);
            expect(await readSheets(page), '一次只開一個').toEqual(AI_OPEN);
            await page.locator('#mtab-ai').tap();
            await waitStill(page);
            expect(await readSheets(page)).toEqual(NONE_OPEN);

            // 四種關法：把手、背景、Esc、查韻分頁。每一種都先開、再關，兩個面板各做一次
            for (const [tab, state] of [['lyrics', LYRICS_OPEN], ['ai', AI_OPEN]]) {
                const side = tab === 'lyrics' ? 'left' : 'right';
                const closers = {
                    把手: () => page.locator(`#${side}Panel .sheet-handle`).tap(),
                    // 背景只露出面板上緣以上的部分，點最左上角
                    背景: () => page.locator('#mobileBackdrop').tap({ position: { x: 8, y: 8 } }),
                    Esc: () => page.keyboard.press('Escape'),
                    查韻分頁: () => page.locator('#mtab-search').tap(),
                };
                for (const [how, close] of Object.entries(closers)) {
                    await page.locator('#mtab-' + tab).tap();
                    await waitStill(page);
                    expect(await readSheets(page), `${tab} 開啟`).toEqual(state);
                    await close();
                    await waitStill(page);
                    expect(await readSheets(page), `${tab} 用「${how}」關閉`).toEqual(NONE_OPEN);
                }
            }
            // 把手的讀屏名稱
            expect(await page.evaluate(() => [...document.querySelectorAll('.sheet-handle')].map(b => [b.tagName, b.type, b.getAttribute('aria-label')])))
                .toEqual([['BUTTON', 'button', '關閉面板'], ['BUTTON', 'button', '關閉面板']]);
            // 面板收起時按 Esc 不會出事（沒東西可關）
            await page.keyboard.press('Escape');
            expect(await readSheets(page)).toEqual(NONE_OPEN);
            expect(errors).toEqual([]);
        } finally { await context.close(); }
    });
}

test('底部面板：桌機按 Esc 不會收起側邊面板', async ({ browser }) => {
    const { context, page } = await bootPage(browser, { device: DEVICES.desktop });
    try {
        await clickTab(page, 'left');
        await waitStill(page);
        await page.keyboard.press('Escape');
        expect(await isCollapsed(page, 'left'), '桌機的 Esc 不歸面板管').toBe(false);
        // 桌機沒有把手
        expect(await page.evaluate(() => [...document.querySelectorAll('.sheet-handle')].map(b => getComputedStyle(b).display))).toEqual(['none', 'none']);
    } finally { await context.close(); }
});

test('底部面板：收起時 inert、Tab 選不到', async ({ browser }) => {
    const { context, page } = await bootPage(browser, { device: DEVICES.phone });
    try {
        await waitStill(page);
        const state = () => page.evaluate(() => Object.fromEntries(['leftPanel', 'rightPanel'].map(id => {
            const p = document.getElementById(id);
            return [id, { inert: p.inert, aria: p.getAttribute('aria-hidden') }];
        })));
        const HIDDEN = { inert: true, aria: 'true' };
        const SHOWN = { inert: false, aria: null };
        expect(await state()).toEqual({ leftPanel: HIDDEN, rightPanel: HIDDEN });
        // 每個狀態都連按 Tab 一圈：焦點永遠不在收起的面板裡
        const walk = async label => {
            await page.focus('#searchInput');
            const seen = new Set();
            for (let i = 0; i < 70; i++) {
                await page.keyboard.press('Tab');
                const at = await page.evaluate(() => {
                    const a = document.activeElement;
                    const p = a && a.closest && a.closest('.side-panel');
                    return { id: a.id || a.className || a.tagName, hidden: p ? p.classList.contains('collapsed') : false, inPanel: p ? p.id : '' };
                });
                expect(at.hidden, `${label}：第 ${i + 1} 下 Tab 跑進收起的面板（${at.id}）`).toBe(false);
                if (at.inPanel) seen.add(at.inPanel);
            }
            return seen;
        };
        expect([...await walk('全部收起')]).toEqual([]);
        await page.locator('#mtab-lyrics').tap();
        await waitStill(page);
        expect(await state()).toEqual({ leftPanel: SHOWN, rightPanel: HIDDEN });
        expect([...await walk('歌詞打開')], '打開的歌詞面板要選得到').toEqual(['leftPanel']);
        await page.locator('#mtab-ai').tap();
        await waitStill(page);
        expect(await state()).toEqual({ leftPanel: HIDDEN, rightPanel: SHOWN });
        expect([...await walk('AI 建議打開')], '打開的 AI 建議面板要選得到').toEqual(['rightPanel']);
        await page.keyboard.press('Escape');
        await waitStill(page);
        expect(await state()).toEqual({ leftPanel: HIDDEN, rightPanel: HIDDEN });
    } finally { await context.close(); }
});

// 面板大小：手機整個寬度；平板最寬 44rem 並置中；高度 = min(可見高度的 78%, 52rem)，上緣至少 22% 看得到背景
test('底部面板：尺寸與置中', async ({ browser }) => {
    for (const [name, device, wantW, wantH] of [
        ['手機 390×844', DEVICES.phone, 390, 844 * 0.78],
        ['平板 820×1180', DEVICES.tablet, 704, 832],
        ['橫放手機 844×390', DEVICES.phoneLandscape, 704, 390 * 0.78],
    ]) {
        const { context, page } = await bootPage(browser, { device });
        try {
            const vp = page.viewportSize();
            for (const side of ['left', 'right']) {
                await page.locator(side === 'left' ? '#mtab-lyrics' : '#mtab-ai').tap();
                await waitStill(page);
                const r = await rectOf(page, `#${side}Panel`);
                expect(r.width, `${name} ${side} 寬`).toBeCloseTo(Math.min(wantW, vp.width), 0);
                expect(r.height, `${name} ${side} 高`).toBeCloseTo(wantH, 0);
                expect(r.x + r.width / 2, `${name} ${side} 水平置中`).toBeCloseTo(vp.width / 2, 0);
                expect(r.y + r.height, `${name} ${side} 貼底`).toBeCloseTo(vp.height, 0);
                expect(r.y, `${name} ${side} 上方至少留 22%`).toBeGreaterThanOrEqual(vp.height * 0.22 - 1);
                await page.locator('#mtab-search').tap();
                await waitStill(page);
            }
        } finally { await context.close(); }
    }
});

test('版面：圖層順序', async ({ browser }) => {
    const z = (page, sel) => page.evaluate(s => {
        const v = getComputedStyle(document.querySelector(s)).zIndex;
        return v === 'auto' ? 0 : Number(v);
    }, sel);
    // 桌機看得到側邊面板（800）；手機看得到底部面板（860）、遮罩、分頁列
    const desk = await bootPage(browser, { device: DEVICES.desktop });
    let side, container;
    try {
        await clickTab(desk.page, 'left');
        side = await z(desk.page, '#leftPanel');
        container = await z(desk.page, '.container');
    } finally { await desk.context.close(); }
    const { context, page } = await bootPage(browser, { device: DEVICES.phone });
    try {
        await page.locator('#mtab-lyrics').tap();
        await page.evaluate(() => showToast('測試'));   // 複製提示是第一次用到才建立
        await waitStill(page);
        const ordered = [
            ['主畫面', container],
            ['側邊面板', side],
            ['遮罩', await z(page, '#mobileBackdrop')],
            ['底部面板', await z(page, '#leftPanel')],
            ['分頁列', await z(page, '#mobileTabBar')],
            ['標籤視窗', await z(page, '#hashtagPopupOverlay')],
            ['設定／關於', await z(page, '#settingsOverlay')],
            ['關於', await z(page, '#aboutOverlay')],
            ['複製提示', await z(page, '.copy-toast')],
            ['字詞選單', await z(page, '#wordCtxMenu')],
            ['意見回饋', await z(page, '#feedbackModalOverlay')],
        ];
        expect(Object.fromEntries(ordered.slice(1))).toEqual({
            側邊面板: 800, 遮罩: 840, 底部面板: 860, 分頁列: 870, 標籤視窗: 960, '設定／關於': 999, 關於: 999, 複製提示: 9999, 字詞選單: 10000, 意見回饋: 12000,
        });
        expect(container, '主畫面不能高過側邊面板').toBeLessThan(800);
        for (let i = 1; i < ordered.length; i++) {
            if (ordered[i][0] === '關於') continue;   // 和設定同一層
            const prev = ordered[i - 1][0] === '關於' ? ordered[i - 2] : ordered[i - 1];
            expect(ordered[i][1], `${ordered[i][0]} 要高過 ${prev[0]}`).toBeGreaterThan(prev[1]);
        }
    } finally { await context.close(); }
});

test('縮放：手機 150% 分頁標籤放得下', async ({ browser }) => {
    const { context, page } = await bootPage(browser, { device: DEVICES.phone });
    try {
        for (const pct of [100, 150]) {
            await setScale(page, pct);
            await waitStill(page);
            const fit = await page.evaluate(() => [...document.querySelectorAll('.mtab-btn')].map(b => ({
                id: b.id,
                btn: b.scrollWidth - b.clientWidth,
                labels: [...b.querySelectorAll('span')].map(s => s.scrollWidth - s.clientWidth),
                w: b.getBoundingClientRect().width,
            })));
            for (const f of fit) {
                expect(f.btn, `${pct}% ${f.id} 整個分頁`).toBeLessThanOrEqual(1);
                for (const l of f.labels) expect(l, `${pct}% ${f.id} 標籤`).toBeLessThanOrEqual(1);
                expect(f.w, `${pct}% ${f.id} 寬`).toBeGreaterThan(0);
            }
            await expectFullyInViewport(page, page.locator('#mobileTabBar'));
            for (const id of ['mtab-search', 'mtab-lyrics', 'mtab-ai']) await expectFullyInViewport(page, page.locator('#' + id));
        }
    } finally { await context.close(); }
});
