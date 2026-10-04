// Phase 5 多裝置版面與縮放
// 每個測試名稱開頭是主題標籤（縮放：…），之後各 plan 依標籤加入 flow／面板／鍵盤等測試
import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { bootPage, settle } from './helpers.mjs';
import { DEVICES, setScale, waitStill, noPageScroll, expectFullyInViewport, expectReallyClickable, rectsOverlap, auditVisibleControls, emulateKeyboard, restoreViewport, readKeyboard, insideVisible, meetsInputFloor, scanInputFonts, auditTouchTargets, meetsHit } from './layout-lib.mjs';

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

// ===== 05-06 任務二：面板裡面也好用（歌詞可捲、AI 按鈕固定底部、長字不撐破、五種視窗走完整流程） =====
const isWide = device => device.viewport.width > 900;
const pointerOf = device => device.hasTouch ? l => l.tap() : l => l.click();
// 打開／收起歌詞（which = 'lyrics'）或 AI 建議（'ai'）：窄螢幕按底部分頁，寬螢幕按側邊分頁（桌機同一個分頁再按一次就收起）
async function toggleSide(page, device, which) {
    const loc = isWide(device)
        ? page.locator(`.${which === 'lyrics' ? 'left' : 'right'}-panel .side-panel-tab`)
        : page.locator('#mtab-' + which);
    await expectReallyClickable(page, loc, `${which} 分頁`);
    await pointerOf(device)(loc);
    await waitStill(page);
}
const closeSheet = async (page, device) => {
    if (isWide(device)) return;
    await pointerOf(device)(page.locator('#mtab-search'));
    await waitStill(page);
};
const SIX_SECTIONS = Array.from({ length: 6 }, (_, i) => ({ label: `段落${i + 1}`, text: `第${i + 1}段的歌詞`, collapsed: false }));

test('底部面板：六段歌詞可捲動、每段夠高', async ({ browser }) => {
    const { context, page } = await bootPage(browser, { device: DEVICES.phone, storage: { haiku_lyrics: JSON.stringify(SIX_SECTIONS) } });
    try {
        await toggleSide(page, DEVICES.phone, 'lyrics');
        const m = await page.evaluate(() => {
            const area = document.getElementById('lyricsSections');
            const before = area.scrollTop;
            area.scrollTop = area.scrollHeight;
            return {
                overflowY: getComputedStyle(area).overflowY,
                sh: area.scrollHeight, ch: area.clientHeight, sw: area.scrollWidth, cw: area.clientWidth,
                moved: area.scrollTop - before,
                tas: [...area.querySelectorAll('.lyrics-section:not(.collapsed) .section-textarea')].map(t => Math.round(t.getBoundingClientRect().height)),
            };
        });
        expect(m.overflowY).toBe('auto');
        expect(m.sh, `歌詞區內容 ${m.sh} 要比可見高度 ${m.ch} 高才需要捲`).toBeGreaterThan(m.ch);
        expect(m.moved, '歌詞區真的能往下捲').toBeGreaterThan(0);
        expect(m.sw, '歌詞區不能左右捲').toBeLessThanOrEqual(m.cw + 1);
        expect(m.tas.length).toBe(6);
        for (const h of m.tas) expect(h, `每段輸入框高度 ${m.tas}`).toBeGreaterThanOrEqual(112);
        // 捲到最底的最後一段、以及「+ 新增段落」都點得到
        await expectReallyClickable(page, page.locator('#lyricsSections .section-textarea').last(), '最後一段輸入框');
        await expectReallyClickable(page, page.locator('#leftPanel .panel-add-btn'), '新增段落');
    } finally { await context.close(); }
});

for (const [name, device] of [['手機', DEVICES.phone], ['平板', DEVICES.tablet]]) {
    test(`底部面板：重要按鈕都在面板與畫面內、點得到（${name}）`, async ({ browser }) => {
        const { context, page } = await bootPage(browser, { device });
        try {
            const inside = async (panelSel, loc, label) => {
                const p = await rectOf(page, panelSel);
                const b = await loc.boundingBox();
                expect(b, `${label} 沒有版面框`).not.toBeNull();
                expect(b.x, `${label} 左緣在面板外`).toBeGreaterThanOrEqual(p.x - 0.5);
                expect(b.x + b.width, `${label} 右緣在面板外`).toBeLessThanOrEqual(p.x + p.width + 0.5);
                expect(b.y, `${label} 上緣在面板外`).toBeGreaterThanOrEqual(p.y - 0.5);
                expect(b.y + b.height, `${label} 下緣在面板外`).toBeLessThanOrEqual(p.y + p.height + 0.5);
                await expectReallyClickable(page, loc, label);
            };
            await toggleSide(page, device, 'lyrics');
            await inside('#leftPanel', page.locator('#leftPanel .panel-add-btn'), '「+ 新增段落」');
            await inside('#leftPanel', page.locator('#lyricsSections .section-textarea').first(), '第一個歌詞輸入框');
            await closeSheet(page, device);
            await toggleSide(page, device, 'ai');
            await inside('#rightPanel', page.locator('#generateBtn'), '「✨提供詞語建議」');
            await inside('#rightPanel', page.locator('#savedPoolSection .saved-pool-title'), '「📌 保留」標題');
        } finally { await context.close(); }
    });
}

// 三種視窗 × 三種縮放：四個會捲動的區塊都不能左右捲
for (const [name, device] of [['手機', DEVICES.phone], ['平板', DEVICES.tablet], ['桌機', DEVICES.desktop]]) {
    test(`底部面板：各捲動區不會左右捲（3 視窗 × 50/100/150）— ${name}`, async ({ browser }) => {
        const { context, page } = await bootPage(browser, { device, storage: { haiku_lyrics: JSON.stringify(SIX_SECTIONS), haiku_hashtags: JSON.stringify(['abcdefghij'.repeat(4), '超長標籤'.repeat(10)]) } });
        try {
            const read = () => page.evaluate(() => Object.fromEntries(['.lyrics-area', '.ai-scroll-area', '.side-panel-body', '.results-section'].map(sel =>
                [sel, [...document.querySelectorAll(sel)].map(e => e.scrollWidth - e.clientWidth)])));
            for (const pct of [100, 50, 150]) {
                await setScale(page, pct);
                await waitStill(page);
                for (const which of ['lyrics', 'ai']) {
                    await toggleSide(page, device, which);
                    const over = await read();
                    for (const [sel, list] of Object.entries(over)) {
                        for (const d of list) expect(d, `${name} ${pct}% ${which} 開著：${sel} 多出 ${d}px`).toBeLessThanOrEqual(1);
                    }
                    // 桌機側邊面板同一個分頁再按一次就收起；窄螢幕回到查韻
                    if (isWide(device)) await toggleSide(page, device, which);
                    else await closeSheet(page, device);
                }
            }
        } finally { await context.close(); }
    });
}

test('底部面板：AI 產生中按鈕停用、提示在捲動區內、按鈕固定在底部', async ({ browser }) => {
    const { context, page } = await bootPage(browser, { device: DEVICES.phone, aiReply: '安全、平安、晚安' });
    try {
        await page.route('**/ai', async route => { await new Promise(r => setTimeout(r, 1200)); await route.fallback(); });
        await page.fill('#searchInput', 'ㄢ');
        await settle(page);
        await toggleSide(page, DEVICES.phone, 'ai');
        // 進度列放一段很長的字：不能比面板寬
        await page.evaluate(() => {
            const p = document.getElementById('wordlistProgress');
            p.style.display = 'block';
            p.textContent = '詞庫載入中' + '很長的進度說明'.repeat(30);
        });
        const sheetW = (await rectOf(page, '#rightPanel')).width;
        expect((await rectOf(page, '#wordlistProgress')).width, '進度列寬度').toBeLessThanOrEqual(sheetW);
        await page.evaluate(() => { document.getElementById('wordlistProgress').style.display = 'none'; });

        await expectReallyClickable(page, page.locator('#generateBtn'), '提供詞語建議');
        await page.locator('#generateBtn').tap();
        // 產生中：按鈕停用、提示看得到、而且在捲動區裡
        await expect(page.locator('#generateBtn')).toBeDisabled();
        await expect(page.locator('#aiLoading')).toBeVisible();
        expect(await page.evaluate(() => !!document.getElementById('aiLoading').closest('.ai-scroll-area')), '提示在捲動區內').toBe(true);
        await expect(page.locator('#aiWordsContainer .ai-word-card').first()).toBeVisible({ timeout: 15000 });
        await expect(page.locator('#generateBtn')).toBeEnabled();

        // 詞很多、捲動區要捲：往下捲到各個位置，按鈕都貼在捲動區底部、沒掉出面板
        const pinned = await page.evaluate(async () => {
            const area = document.querySelector('.ai-scroll-area');
            const btn = document.getElementById('generateBtn');
            const sheet = document.getElementById('rightPanel');
            const out = { scrollable: area.scrollHeight - area.clientHeight, rows: [] };
            for (const f of [0, 0.5, 1]) {
                area.scrollTop = (area.scrollHeight - area.clientHeight) * f;
                await new Promise(r => requestAnimationFrame(r));
                const b = btn.getBoundingClientRect(), a = area.getBoundingClientRect(), s = sheet.getBoundingClientRect();
                out.rows.push({ f, btnTop: b.top - a.top, btnBottom: a.bottom - b.bottom, sheetGap: s.bottom - b.bottom });
            }
            return out;
        });
        expect(pinned.scrollable, '24 個詞要讓捲動區真的能捲').toBeGreaterThan(50);
        for (const r of pinned.rows) {
            expect(r.btnTop, `捲到 ${r.f}：按鈕上緣在捲動區內 ${JSON.stringify(r)}`).toBeGreaterThanOrEqual(-1);
            expect(r.btnBottom, `捲到 ${r.f}：按鈕下緣在捲動區內 ${JSON.stringify(r)}`).toBeGreaterThanOrEqual(-1);
            expect(r.sheetGap, `捲到 ${r.f}：按鈕下緣不超出面板 ${JSON.stringify(r)}`).toBeGreaterThanOrEqual(-1);
        }
        // 釘在底部時仍然是真的點得到（沒被分頁列蓋住）
        await expectReallyClickable(page, page.locator('#generateBtn'), '捲動中的提供詞語建議');
    } finally { await context.close(); }
});

// 05-11 截圖基準時發現：釘在底部的按鈕被後面的詞卡畫在上面（DOM 順序），只露出一條縫。
// 舊測試只探按鈕中心點，剛好落在兩張詞卡之間的縫，所以沒抓到；這裡沿著整條按鈕取 5 個點，在三種捲動位置都要是按鈕自己
test('底部面板：釘在底部的「提供詞語建議」整條都在詞卡上面', async ({ browser }) => {
    for (const [name, device] of [['手機', DEVICES.phone], ['平板', DEVICES.tablet]]) {
        const { context, page } = await bootPage(browser, { device });
        try {
            await page.fill('#searchInput', 'ㄢ');
            await settle(page);
            await toggleSide(page, device, 'ai');
            await page.evaluate(() => document.getElementById('generateBtn').click());
            await page.waitForSelector('.ai-word-card');
            await page.waitForFunction(() => !document.getElementById('generateBtn').disabled);
            await waitStill(page);
            const rows = await page.evaluate(async () => {
                const area = document.querySelector('.ai-scroll-area');
                const btn = document.getElementById('generateBtn');
                const out = [];
                for (const f of [0, 0.5, 1]) {
                    area.scrollTop = (area.scrollHeight - area.clientHeight) * f;
                    await new Promise(r => requestAnimationFrame(r));
                    const b = btn.getBoundingClientRect();
                    const bad = [];
                    for (const fx of [0.1, 0.3, 0.5, 0.7, 0.9]) {
                        for (const fy of [0.25, 0.75]) {
                            const top = document.elementFromPoint(b.x + b.width * fx, b.y + b.height * fy);
                            if (!top || !(top === btn || btn.contains(top))) bad.push(`${fx},${fy} 被 ${top && (top.className || top.tagName)} 蓋住`);
                        }
                    }
                    out.push({ f, bad });
                }
                return out;
            });
            for (const r of rows) expect(r.bad, `${name} 捲到 ${r.f}：按鈕被蓋住`).toEqual([]);
        } finally { await context.close(); }
    }
});

test('底部面板：單一 AI 詞卡不撐滿、保留數 0 隱藏', async ({ browser }) => {
    for (const [name, device] of [['手機', DEVICES.phone], ['平板', DEVICES.tablet]]) {
        const { context, page } = await bootPage(browser, { device });
        try {
            await toggleSide(page, device, 'ai');
            await page.evaluate(() => { document.getElementById('aiWordsContainer').innerHTML = aiWordCardHtml('平安', false); });
            const w = await page.evaluate(() => ({
                card: document.querySelector('#aiWordsContainer .ai-word-card').getBoundingClientRect().width,
                grid: document.getElementById('aiWordsContainer').getBoundingClientRect().width,
            }));
            expect(w.card, `${name}：一張卡 ${w.card}px 佔整排 ${w.grid}px`).toBeLessThan(w.grid * 0.6);
            // 保留數：0 個隱藏，1 個以上顯示
            const badge = () => page.evaluate(() => ({ shown: document.getElementById('savedCount').getClientRects().length > 0, text: document.getElementById('savedCount').textContent }));
            expect(await badge(), `${name} 0 個`).toEqual({ shown: false, text: '0' });
            const card = page.locator('#aiWordsContainer .ai-word-card');
            await expectReallyClickable(page, card, 'AI 詞卡');
            await pointerOf(device)(card);
            await expect(page.locator('.copy-toast')).toContainText('「平安」已保留');
            expect(await badge(), `${name} 1 個`).toEqual({ shown: true, text: '1' });
        } finally { await context.close(); }
    }
});

test('底部面板：長段落名、長標籤、長模型名不撐破', async ({ browser }) => {
    const LONG_LABEL = '很長很長的段落名稱'.repeat(5).slice(0, 40);
    const LONG_TAG = 'abcdefghij'.repeat(4);   // 英文連續 40 字不會自己斷行，最容易撐破
    const LONG_MODEL = '一個名字非常非常長的模型'.repeat(5).slice(0, 60);
    for (const [name, device] of [['手機', DEVICES.phone], ['平板', DEVICES.tablet]]) {
        const { context, page } = await bootPage(browser, {
            device,
            storage: {
                haiku_lyrics: JSON.stringify([{ label: LONG_LABEL, text: '歌詞', collapsed: false }, { label: LONG_LABEL, text: '歌詞二', collapsed: false }]),
                haiku_hashtags: JSON.stringify([LONG_TAG]),
            },
            models: [{ id: 'long-model', label: LONG_MODEL, provider: 'gemini' }],
        });
        try {
            // 面板裡每個看得見的元素，左右都不能超出面板
            const wideOnes = sel => page.evaluate(s => {
                const p = document.querySelector(s).getBoundingClientRect();
                return [...document.querySelectorAll(s + ' *')].filter(e => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden').map(e => {
                    const r = e.getBoundingClientRect();
                    return { n: e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.split(/\s+/)[0] : ''), l: r.left - p.left, r: p.right - r.right, w: r.width };
                }).filter(o => o.w > 0 && (o.l < -1 || o.r < -1)).map(o => `${o.n} 左${Math.round(o.l)} 右${Math.round(o.r)}`);
            }, sel);
            await toggleSide(page, device, 'lyrics');
            expect(await wideOnes('#leftPanel'), `${name}：歌詞面板有元素超出`).toEqual([]);
            const chip = await page.evaluate(() => {
                const c = document.querySelector('.hashtag-chip').getBoundingClientRect();
                const b = document.getElementById('contextBody').getBoundingClientRect();
                return { over: c.right - b.right, h: c.height };
            });
            expect(chip.over, `${name}：長標籤右緣超出情境區 ${chip.over}px`).toBeLessThanOrEqual(1);
            await closeSheet(page, device);
            await toggleSide(page, device, 'ai');
            expect(await wideOnes('#rightPanel'), `${name}：AI 面板有元素超出`).toEqual([]);
            const sel = await page.evaluate(() => {
                const s = document.getElementById('modelSelect');
                return { w: s.getBoundingClientRect().width, max: 10 * parseFloat(getComputedStyle(document.documentElement).fontSize), label: s.options[s.options.length - 1].text.length };
            });
            expect(sel.label, '模型選單真的放進長名字').toBe(60);
            expect(sel.w, `${name}：模型選單寬 ${sel.w}px，上限 10rem = ${sel.max}px`).toBeLessThanOrEqual(sel.max + 1);
        } finally { await context.close(); }
    }
});

test('底部面板：AI 失敗訊息可以捲到按鈕上方', async ({ browser }) => {
    // backstop：釘在底部的按鈕不能永遠蓋住最後一則訊息
    const longMsg = 'AI 現在都在忙，請稍後再試一次。'.repeat(6);
    const { context, page } = await bootPage(browser, { device: DEVICES.phone, aiFail: { status: 503, body: { ok: false, code: 'ALL_BUSY', message: longMsg, tried: [] } } });
    try {
        await page.fill('#searchInput', 'ㄢ');
        await settle(page);
        await toggleSide(page, DEVICES.phone, 'ai');
        await expectReallyClickable(page, page.locator('#generateBtn'), '提供詞語建議');
        await page.locator('#generateBtn').tap();
        await expect(page.locator('#aiWordsContainer .candidate-report').last()).toContainText('AI 暫時無法排序', { timeout: 15000 });
        const r = await page.evaluate(async () => {
            const area = document.querySelector('.ai-scroll-area');
            area.scrollTop = area.scrollHeight;
            await new Promise(res => requestAnimationFrame(res));
            const msgs = document.querySelectorAll('#aiWordsContainer .candidate-report');
            const msg = msgs[msgs.length - 1].getBoundingClientRect();
            const btn = document.getElementById('generateBtn').getBoundingClientRect();
            const a = area.getBoundingClientRect();
            return { msgBottom: msg.bottom, btnTop: btn.top, msgTop: msg.top, areaTop: a.top };
        });
        expect(r.msgBottom, `訊息下緣 ${r.msgBottom} 要在按鈕上緣 ${r.btnTop} 之上`).toBeLessThanOrEqual(r.btnTop + 0.5);
        expect(r.msgTop, '訊息整則看得到（上緣沒掉出捲動區）').toBeGreaterThanOrEqual(r.areaTop - 0.5);
    } finally { await context.close(); }
});

// 五種視窗用真的點擊／觸碰走完整個流程；每個目標點下去之前都要整個在視窗內、中心沒被蓋住
for (const [name, device] of Object.entries(DEVICES)) {
    test(`流程：五種視窗用真的點擊走完查韻→選字→歌詞→AI 建議→保留（${name}）`, async ({ browser }) => {
        const { context, page, errors } = await bootPage(browser, { device, aiReply: '安全、平安、晚安' });
        try {
            const act = pointerOf(device);
            const hit = async (loc, label) => { await expectReallyClickable(page, loc, label); await act(loc); };
            // 1. 查韻：點搜尋框、打 ㄢ
            await hit(page.locator('#searchInput'), '搜尋框');
            await page.keyboard.type('ㄢ');
            await settle(page);
            await expect(page.locator('#resultsContainer .char-card').first()).toBeVisible();
            // 2. 選字：點第一張字卡 → 變成選取
            const firstCard = page.locator('#resultsContainer .char-card').first();
            await hit(firstCard.locator('.char-main'), '第一張字卡');
            await expect(firstCard).toHaveClass(/selected/);
            // 3. 歌詞：打開歌詞、在第一段輸入
            await toggleSide(page, device, 'lyrics');
            const ta = page.locator('#lyricsSections .section-textarea').first();
            await hit(ta, '第一個歌詞輸入框');
            await page.keyboard.type('月光下');
            expect(await ta.inputValue()).toContain('月光下');
            await closeSheet(page, device);
            // 4. AI 建議：打開、按提供詞語建議
            await toggleSide(page, device, 'ai');
            await hit(page.locator('#generateBtn'), '提供詞語建議');
            await expect(page.locator('#aiWordsContainer .ai-word-card').first()).toBeVisible({ timeout: 15000 });
            // 5. 保留：點第一張 AI 詞卡
            const word = page.locator('#aiWordsContainer .ai-word-card').first();
            const text = (await word.getAttribute('data-word'));
            await hit(word, 'AI 詞卡');
            await expect(page.locator('.copy-toast')).toContainText(`「${text}」已保留`);
            expect(await page.evaluate(() => savedWords.length)).toBe(1);
            expect(errors).toEqual([]);
        } finally { await context.close(); }
    });
}

// ===== 05-07 任務一：虛擬鍵盤跳出來時，正在打字的地方一定看得到 =====
// Chromium 沒有真鍵盤：縮小視窗高度＝innerHeight 與 visualViewport.height 一起變矮（寬度不變），
// 剛好踩中 layout.js 的判斷。iOS「只縮視覺視窗、版面不動」的行為要真機才看得到（05-11 清單）。
const KB_PROPS = ['appH', 'vvTop', 'kbInset'];
const focusFirstLyrics = page => page.locator('#lyricsSections .section-textarea').first().tap();

test('鍵盤：歌詞輸入時鍵盤不擋、面板撐滿可見高度', async ({ browser }) => {
    const device = DEVICES.phone;
    const { context, page } = await bootPage(browser, { device });
    try {
        await toggleSide(page, device, 'lyrics');
        await focusFirstLyrics(page);
        const size = await emulateKeyboard(page, 336);
        await expect.poll(async () => (await readKeyboard(page)).open, { message: '縮 336px 後應進入 kb-open' }).toBe(true);
        await waitStill(page);
        const kb = await readKeyboard(page);
        expect(kb.vvHeight, '視覺視窗高度').toBe(844 - 336);
        // 變數直接取自 visualViewport 的原始數字，不四捨五入
        expect(kb.appH).toBe(kb.vvHeight + 'px');
        expect(kb.vvTop).toBe(kb.vvOffsetTop + 'px');
        expect(kb.kbInset).toBe(Math.max(0, kb.innerHeight - kb.vvHeight - kb.vvOffsetTop) + 'px');
        expect(await page.locator('.mobile-tab-bar').evaluate(el => getComputedStyle(el).display), '鍵盤出現時分頁列藏起來').toBe('none');
        const ta = await page.locator('#lyricsSections .section-textarea').first().boundingBox();
        expect(insideVisible(ta, kb), `歌詞輸入框 ${JSON.stringify(ta)} 要完整在可見範圍內`).toBe(true);
        const sheet = await page.locator('#leftPanel').boundingBox();
        expect(Math.abs(sheet.height - kb.vvHeight), `面板高度 ${sheet.height} 要等於可見高度 ${kb.vvHeight}`).toBeLessThanOrEqual(1);
        expect(Math.abs(sheet.y - kb.vvOffsetTop), '面板貼齊可見範圍上緣').toBeLessThanOrEqual(1);
        expect((await noPageScroll(page)).sh, '頁面本身不捲動').toBeLessThanOrEqual(kb.innerHeight + 1);
        // 鍵盤收起：class 與三個變數都清掉
        await restoreViewport(page, size);
        await expect.poll(async () => (await readKeyboard(page)).open, { message: '還原後 kb-open 要拿掉' }).toBe(false);
        const after = await readKeyboard(page);
        expect([after.short, after.appH, after.vvTop, after.kbInset]).toEqual([false, '', '', '']);
        expect(await page.locator('.mobile-tab-bar').evaluate(el => getComputedStyle(el).display), '收起後分頁列回來').toBe('flex');
    } finally { await context.close(); }
});

test('鍵盤：差 149 不算、150 才算鍵盤', async ({ browser }) => {
    const { context, page } = await bootPage(browser, { device: DEVICES.phone });
    try {
        await page.locator('#searchInput').tap();
        let size = await emulateKeyboard(page, 149);
        let kb = await readKeyboard(page);
        expect([kb.vvHeight, kb.open, kb.appH], '差 149：不算鍵盤').toEqual([844 - 149, false, '']);
        await restoreViewport(page, size);
        size = await emulateKeyboard(page, 150);
        await expect.poll(async () => (await readKeyboard(page)).open, { message: '差 150：算鍵盤' }).toBe(true);
        kb = await readKeyboard(page);
        expect([kb.vvHeight, kb.appH]).toEqual([844 - 150, (844 - 150) + 'px']);
        // 694px 高：還不到 600，標題區仍在
        expect(kb.short, '可見高度 694 ≥ 600 不用藏標題區').toBe(false);
        // 只改高度時「穩定高度」要保留：再縮 1px 仍是鍵盤，不會因為高度變了就重新量基準
        await emulateKeyboard(page, 1);
        expect((await readKeyboard(page)).open, '再多縮 1px 仍是鍵盤').toBe(true);
    } finally { await context.close(); }
});

// WR-02：兩指放大（visualViewport.scale > 1）與電腦視窗拉矮，都不能被當成鍵盤
test('鍵盤：放大中不算鍵盤', async ({ browser }) => {
    const { context, page } = await bootPage(browser, { device: DEVICES.phone });
    try {
        await page.locator('#searchInput').tap();
        // Chromium 的 pinch 無法在測試裡真的做：在 visualViewport 實例上把 scale 蓋成 1.5
        await page.evaluate(() => Object.defineProperty(window.visualViewport, 'scale', { configurable: true, get: () => 1.5 }));
        const size = await emulateKeyboard(page, 336);
        const kb = await readKeyboard(page);
        expect([kb.vvHeight, kb.open, kb.appH], '放大中視覺視窗變矮不算鍵盤').toEqual([844 - 336, false, '']);
        // 放大回 1 倍後，同樣的高度才算鍵盤
        await page.evaluate(() => { delete window.visualViewport.scale; });
        await restoreViewport(page, size);
        await emulateKeyboard(page, 336);
        await expect.poll(async () => (await readKeyboard(page)).open, { message: '沒放大時照常算鍵盤' }).toBe(true);
    } finally { await context.close(); }
});

test('鍵盤：電腦視窗被拉矮（滑鼠、≥ 901）不算鍵盤', async ({ browser }) => {
    const { context, page } = await bootPage(browser, { device: DEVICES.desktop });
    try {
        await page.locator('#searchInput').focus();
        expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches || lhIsSheetMode())).toBe(false);
        await emulateKeyboard(page, 336);
        const kb = await readKeyboard(page);
        expect([kb.open, kb.short, kb.appH, kb.vvTop, kb.kbInset], '桌機搜尋框自動聚焦時拉矮視窗，不能寫 --app-h').toEqual([false, false, '', '', '']);
    } finally { await context.close(); }
});

test('鍵盤：沒有聚焦輸入框時不算鍵盤', async ({ browser }) => {
    const { context, page } = await bootPage(browser, { device: DEVICES.phone });
    try {
        expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
        const size = await emulateKeyboard(page, 336);
        let kb = await readKeyboard(page);
        expect([kb.vvHeight, kb.open, kb.appH], '沒聚焦：網址列之類的高度變化不算鍵盤').toEqual([844 - 336, false, '']);
        await restoreViewport(page, size);
        // 聚焦的是按鈕（不是文字欄位）也不算
        await page.locator('#mtab-lyrics').focus();
        await emulateKeyboard(page, 336);
        kb = await readKeyboard(page);
        expect(kb.open, '按鈕聚焦不算鍵盤').toBe(false);
    } finally { await context.close(); }
});

test('鍵盤：搜尋時太矮先藏標題區、字卡看得到', async ({ browser }) => {
    const { context, page } = await bootPage(browser, { device: DEVICES.phone });
    try {
        await page.locator('#searchInput').tap();
        await emulateKeyboard(page, 336);
        await expect.poll(async () => (await readKeyboard(page)).short).toBe(true);
        await page.fill('#searchInput', 'ㄢ');
        await waitStill(page);
        const kb = await readKeyboard(page);
        expect(kb.open).toBe(true);
        const m = await page.evaluate(() => ({
            header: getComputedStyle(document.querySelector('.header')).display,
            batch: getComputedStyle(document.getElementById('mobileBatchArea')).display,
            minH: getComputedStyle(document.querySelector('.results-section')).minHeight,
        }));
        expect(m, '可見高度不到 600：標題區與批次列藏起來、結果區可以縮').toEqual({ header: 'none', batch: 'none', minH: '0px' });
        const card = await page.locator('.char-card').first().boundingBox();
        expect(insideVisible(card, kb), `第一張字卡 ${JSON.stringify(card)} 要在鍵盤上方的可見範圍`).toBe(true);
        // 搜尋框本身也還在可見範圍內
        expect(insideVisible(await page.locator('#searchInput').boundingBox(), kb)).toBe(true);
    } finally { await context.close(); }
});

test('鍵盤：寫歌詞時情境區自動收起、回報視窗輸入框看得到', async ({ browser }) => {
    const device = DEVICES.phone;
    const { context, page } = await bootPage(browser, { device });
    try {
        await toggleSide(page, device, 'lyrics');
        const ctxH = () => page.locator('#contextSection').evaluate(el => el.getBoundingClientRect().height);
        const idle = await ctxH();
        expect(idle, '沒在寫歌詞時情境區是正常高度').toBeGreaterThan(80);
        await focusFirstLyrics(page);
        await expect.poll(ctxH, { message: '聚焦歌詞框：情境區收到標題列高度' }).toBeLessThanOrEqual(44.5);
        expect(await ctxH()).toBeGreaterThanOrEqual(43.5);
        await page.locator('#lyricsSections .section-textarea').first().blur();
        await expect.poll(ctxH, { message: '離開歌詞框：情境區回來' }).toBeGreaterThan(80);
        await closeSheet(page, device);

        // 回報視窗：開啟後自動聚焦主旨，鍵盤出現後主旨輸入框與整個對話框都在可見範圍
        await page.locator('#settingsTrigger').tap();
        await page.locator('.settings-feedback-btn').tap();
        await expect(page.locator('#feedbackSubject')).toBeFocused();
        await emulateKeyboard(page, 336);
        await expect.poll(async () => (await readKeyboard(page)).open).toBe(true);
        await waitStill(page);
        const kb = await readKeyboard(page);
        expect(insideVisible(await page.locator('#feedbackSubject').boundingBox(), kb), '主旨輸入框在可見範圍內').toBe(true);
        const ov = await page.locator('#feedbackModalOverlay').boundingBox();
        expect(Math.abs(ov.y - kb.vvOffsetTop), '遮罩上緣貼可見範圍').toBeLessThanOrEqual(1);
        expect(Math.abs(ov.height - kb.vvHeight), '遮罩高度＝可見高度').toBeLessThanOrEqual(1);
        expect(insideVisible(await page.locator('#feedbackModalOverlay .feedback-modal').boundingBox(), kb), '對話框整個在可見範圍內').toBe(true);
    } finally { await context.close(); }
});

// ===== 05-07 任務二：手機平板所有輸入框字級至少 16px（任何縮放都一樣），長字串不撐破搜尋框 =====
// 電腦視窗加上 isMobile＋hasTouch：這個組合在 Chromium 會回報 pointer: coarse（平板接鍵盤滑鼠之外的純觸控大螢幕）
const TOUCH_DESKTOP = { ...DEVICES.desktop, isMobile: true, hasTouch: true };
const FLOOR_CONTEXTS = [['手機 390×844', DEVICES.phone], ['平板 820×1180', DEVICES.tablet], ['橫放手機 844×390', DEVICES.phoneLandscape], ['觸控電腦 1440×900', TOUCH_DESKTOP]];
const OVERLAY_OPEN = { settings: ['#settingsOverlay', 'toggleSettings()'], feedback: ['#feedbackModalOverlay', 'openFeedbackModal()'], hashtag: ['#hashtagPopupOverlay', 'openHashtagPopup()'] };
// 每個狀態：開啟、該狀態一定要掃到的控制項（防止「掃了個寂寞」）、關閉
const INPUT_STATES = [
    ['閒置', ['input#searchInput'], async () => {}, async () => {}],
    ['歌詞開著', ['textarea.section-textarea', 'textarea#contextDescription'],
        (page, d) => toggleSide(page, d, 'lyrics'), (page, d) => isWide(d) ? toggleSide(page, d, 'lyrics') : closeSheet(page, d)],
    ['AI 開著', ['select#modelSelect'],
        (page, d) => toggleSide(page, d, 'ai'), (page, d) => isWide(d) ? toggleSide(page, d, 'ai') : closeSheet(page, d)],
    ...Object.entries({ 設定開著: 'settings', 回報開著: 'feedback', 標籤開著: 'hashtag' }).map(([name, key]) => [
        name,
        key === 'feedback' ? ['input#feedbackSubject', 'textarea#feedbackBody'] : key === 'hashtag' ? ['input#hashtagPopupInput'] : ['input#searchInput'],
        // 對話框跟其他測試一樣直接呼叫開啟函式（橫放手機的標題區被藏起來，設定鈕本來就點不到）
        async page => { await page.evaluate(OVERLAY_OPEN[key][1]); await expect(page.locator(OVERLAY_OPEN[key][0])).toHaveClass(/show/); },
        page => page.evaluate(sel => document.querySelector(sel).classList.remove('show'), OVERLAY_OPEN[key][0]),
    ]),
];

test('輸入：手機平板所有輸入框字級 ≥ 16px（3 縮放 × 6 狀態）', async ({ browser }) => {
    // 負向對照：掃描器抓得到小字、放得過大字（用一個臨時的 8px 輸入框驗證，之後移除）
    {
        const { context, page } = await bootPage(browser, { device: DEVICES.phone });
        try {
            await page.evaluate(() => { const i = document.createElement('input'); i.id = 'probe'; i.style.cssText = 'font-size:15.99px;position:fixed;top:0;left:0'; document.body.appendChild(i); });
            expect((await scanInputFonts(page)).bad, '15.99px 要被抓到').toEqual([expect.stringMatching(/^input#probe 15\.99px$/)]);
            await page.evaluate(() => { document.getElementById('probe').style.fontSize = '16px'; });
            expect((await scanInputFonts(page)).bad, '16px 要放行').toEqual([]);
            await page.evaluate(() => { const p = document.getElementById('probe'); p.type = 'checkbox'; p.style.fontSize = '8px'; });
            expect((await scanInputFonts(page)).bad, 'checkbox 不在掃描範圍').toEqual([]);
        } finally { await context.close(); }
    }
    for (const [dname, device] of FLOOR_CONTEXTS) {
        for (const pct of [50, 100, 150]) {
            const { context, page } = await bootPage(browser, { device, storage: { 'lh:uiScale': String(pct) } });
            try {
                await waitStill(page);
                expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches), `${dname}：應為觸控`).toBe(true);
                for (const [sname, mustSee, open, close] of INPUT_STATES) {
                    await open(page, device);
                    const r = await scanInputFonts(page);
                    for (const want of mustSee) {
                        expect(r.seen.some(n => n.startsWith(want)), `${dname} ${pct}% ${sname}：沒掃到 ${want}（掃到 ${r.seen}）`).toBe(true);
                    }
                    expect(r.bad, `${dname} ${pct}% ${sname}：這些輸入框字級不到 16px`).toEqual([]);
                    await close(page, device);
                }
            } finally { await context.close(); }
        }
    }
});

test('輸入：16px 剛好通過、900 套用、901 桌機不變', async ({ browser }) => {
    expect([meetsInputFloor(16), meetsInputFloor(15.99), meetsInputFloor(16.01), meetsInputFloor(0)]).toEqual([true, false, true, false]);
    // 滑鼠（fine pointer）：900 寬套用下限、901 寬維持桌機字級
    const { context, page } = await bootPage(browser, { device: DEVICES.desktop });
    try {
        expect(await page.evaluate(() => matchMedia('(pointer: fine)').matches), '這個 context 是滑鼠').toBe(true);
        const fonts = () => page.evaluate(() => Object.fromEntries(['#modelSelect', '#searchInput', '.context-textarea', '.section-textarea'].map(s => [s, parseFloat(getComputedStyle(document.querySelector(s)).fontSize)])));
        const desktop = await fonts();
        expect(desktop['#modelSelect'], '1440 桌機維持原字級').toBeLessThan(16);
        await page.setViewportSize({ width: 901, height: 900 });
        expect((await fonts())['#modelSelect'], '901 滑鼠：桌機字級不變').toBe(desktop['#modelSelect']);
        await page.setViewportSize({ width: 900, height: 900 });
        const at900 = await fonts();
        for (const [sel, px] of Object.entries(at900)) expect(meetsInputFloor(px), `900 寬滑鼠 ${sel} ${px}px`).toBe(true);
        await page.setViewportSize({ width: 901, height: 900 });
        expect((await fonts())['#modelSelect'], '回到 901 又變回桌機字級').toBe(desktop['#modelSelect']);
    } finally { await context.close(); }
});

test('輸入：20 個中文字的查詢不換行不撐破', async ({ browser }) => {
    const QUERY = '好運氣一定會來找到屬於我自己的歌';   // 16 字；再補 4 字湊 20
    const long20 = (QUERY + '押韻真有趣').slice(0, 20);
    expect([...long20].length).toBe(20);
    for (const [name, device] of [['手機', DEVICES.phone], ['平板', DEVICES.tablet]]) {
        const { context, page } = await bootPage(browser, { device });
        try {
            await page.locator('#searchInput').fill(long20);
            await waitStill(page);
            const m = await page.evaluate(() => {
                const inp = document.getElementById('searchInput');
                const wrap = inp.closest('.search-input-wrap').getBoundingClientRect();
                const r = inp.getBoundingClientRect();
                const cs = getComputedStyle(inp);
                return { w: r.width, h: r.height, wrapW: wrap.width, left: r.left, right: r.right, iw: innerWidth, fs: parseFloat(cs.fontSize), ellipsis: cs.textOverflow, tag: inp.tagName, sw: document.documentElement.scrollWidth };
            });
            expect(m.tag).toBe('INPUT');
            expect(m.w, `${name}：搜尋框 ${m.w} 不比容器 ${m.wrapW} 寬`).toBeLessThanOrEqual(m.wrapW + 0.5);
            expect(m.h, `${name}：搜尋框高度 ${m.h} 是單行`).toBeLessThan(m.fs * 3.2);
            expect(m.right, `${name}：搜尋框右緣在視窗內`).toBeLessThanOrEqual(m.iw + 0.5);
            expect(m.sw, `${name}：整頁不橫向捲動`).toBeLessThanOrEqual(m.iw);
            expect(m.ellipsis).toBe('ellipsis');
            // 切換輸入模式的按鈕：實體 ≥ 44×40，外圍透明擴大區讓「點得到按鈕」的範圍 ≥ 44×44。
            // 用 elementFromPoint 從框邊往外 1px 1px 探，量實際點得到的延伸量（不是只看 CSS 寫了什麼）
            const hit = await page.evaluate(() => {
                const b = document.getElementById('inputModeBtn');
                const r = b.getBoundingClientRect();
                const reach = (dx, dy, x0, y0) => {
                    let d = 0;
                    while (d < 12 && document.elementFromPoint(x0 + dx * (d + 1), y0 + dy * (d + 1)) === b) d++;
                    return d;
                };
                const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
                const ext = { left: reach(-1, 0, r.left, cy), right: reach(1, 0, r.right, cy), top: reach(0, -1, cx, r.top), bottom: reach(0, 1, cx, r.bottom) };
                return { w: r.width, h: r.height, ext, hitW: r.width + ext.left + ext.right, hitH: r.height + ext.top + ext.bottom };
            });
            expect(hit.hitW, `${name}：按鈕可點寬度 ${hit.hitW}（本體 ${hit.w}＋外延 ${JSON.stringify(hit.ext)}）`).toBeGreaterThanOrEqual(44);
            expect(hit.hitH, `${name}：按鈕可點高度 ${hit.hitH}（本體 ${hit.h}＋外延 ${JSON.stringify(hit.ext)}）`).toBeGreaterThanOrEqual(44);
            await expectReallyClickable(page, page.locator('#inputModeBtn'), `${name} 輸入模式按鈕`);
        } finally { await context.close(); }
    }
});

test('輸入：5000 字歌詞會自動換行', async ({ browser }) => {
    // 5000 字：中文、標點，加一段 300 個字母連在一起的長字串（沒有空格也要換行，不能左右捲）
    const unbroken = 'a'.repeat(300);
    const text = ('好運氣天天來，寫詞不用愁。' + unbroken).repeat(Math.ceil(5000 / (13 + 300))).slice(0, 5000) + '\n結尾' + unbroken;
    for (const [name, device] of [['手機', DEVICES.phone], ['平板', DEVICES.tablet]]) {
        const { context, page } = await bootPage(browser, { device });
        try {
            await toggleSide(page, device, 'lyrics');
            const ta = page.locator('#lyricsSections .section-textarea').first();
            await ta.fill(text);
            await waitStill(page);
            const m = await ta.evaluate(el => ({ sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight, len: el.value.length, wrap: getComputedStyle(el).overflowWrap }));
            expect(m.len).toBeGreaterThanOrEqual(5000);
            expect(m.sw, `${name}：歌詞框 scrollWidth ${m.sw} 不超過 clientWidth ${m.cw}`).toBeLessThanOrEqual(m.cw + 1);
            expect(m.wrap).toBe('anywhere');
            expect(m.sh, `${name}：長歌詞往下長、可往下捲`).toBeGreaterThan(m.ch);
        } finally { await context.close(); }
    }
});

// ===== 05-08 任務一：手機平板每個按鈕至少 44px 好點（視覺可以小，用透明範圍放大）；桌機滑鼠維持原樣 =====
// 七種畫面：閒置、搜尋後、歌詞開著、AI 開著（有詞、有保留詞）、設定、回報、標籤；每個畫面都用全新頁面，捲動位置不互相影響
const TOUCH_DEVICES = [['手機 390×844', DEVICES.phone], ['平板 820×1180', DEVICES.tablet]];
const TOUCH_STORAGE = {
    haiku_lyrics: JSON.stringify([{ label: '主歌', text: '第一段歌詞', collapsed: false }, { label: '副歌', text: '第二段歌詞', collapsed: false }, { label: '空白段', text: '', collapsed: false }, { label: '收起段', text: '收起來的歌詞', collapsed: true }]),
    haiku_hashtags: JSON.stringify(['日常', '夜晚']),
    haiku_savedwords: JSON.stringify(['平安', '晚安']),
};
// 每個畫面：名稱、一定要掃到的控制項（防止掃了個寂寞）、開啟方式
const TOUCH_STATES = [
    ['閒置', ['button#MzoomIn', 'button#themeToggle', 'input#searchInput', 'button.mode-button', 'button.mtab-btn', 'div#settingsTrigger'], async () => {}],
    ['搜尋後', ['div.char-card', 'button.poly-chip', 'span.mark-badge', 'button.m-batch-btn, button.batch-btn'], async page => {
        await page.fill('#searchInput', '樂');
        await settle(page);
    }],
    ['歌詞開著', ['button.section-remove', 'button.panel-add-btn', 'button.hashtag-add-btn', 'button.context-refresh-btn', 'span.chip-remove', 'span.hashtag-chip', 'input.section-label', 'div.lyrics-section-header', 'div.context-section-header', '.lyrics-section.collapsed button.section-remove'],
        (page, d) => toggleSide(page, d, 'lyrics')],
    ['AI 開著', ['select#modelSelect', 'button.rhyme-mode-btn', 'button.filter-chip', 'button#generateBtn', 'div.ai-word-card', 'span.chip-remove', 'div.saved-pool-title', 'button.reset-pool-btn', 'button.hint-clear'], async (page, d) => {
        await page.fill('#searchInput', 'ㄢ');
        await settle(page);
        await page.locator('.char-card .char-main').first().click();   // 選一個字：AI 面板才會出現「已選字」提示與 ✕
        await toggleSide(page, d, 'ai');
        await page.evaluate(() => { document.getElementById('aiWordsContainer').innerHTML = ['平安', '晚安', '早安', '心安'].map(w => aiWordCardHtml(w, false)).join('') + '<div class="ai-exhausted">已推薦所有詞彙<button class="reset-pool-btn" onclick="resetSuggestedPool()">↺ 重置</button></div>'; });
    }],
    ['設定開著', ['input[type=checkbox]', 'input[type=color]', 'button.reset-color', 'button.save-load-btn'], async page => {
        await page.evaluate(() => toggleSettings()); await expect(page.locator('#settingsOverlay')).toHaveClass(/show/);
    }],
    ['回報開著', ['button.feedback-send-btn', 'button.feedback-cancel-btn', 'input#feedbackSubject'], async page => {
        await page.evaluate(() => openFeedbackModal()); await expect(page.locator('#feedbackModalOverlay')).toHaveClass(/show/);
    }],
    ['標籤開著', ['button.hashtag-popup-cancel', 'button.hashtag-popup-confirm', 'input#hashtagPopupInput'], async page => {
        await page.evaluate(() => openHashtagPopup()); await expect(page.locator('#hashtagPopupOverlay')).toHaveClass(/show/);
    }],
];
const bootTouch = (browser, device, extra = {}) => bootPage(browser, { device, storage: TOUCH_STORAGE, ...extra });
// 14 次掃描（2 裝置 × 7 畫面）在同一個 worker 內只做一次，「44px」與「相鄰重疊」兩個測試共用
let touchScans = null;
const scanAllTouch = browser => touchScans ??= (async () => {
    const out = [];
    for (const [dname, device] of TOUCH_DEVICES) {
        for (const state of TOUCH_STATES) {
            const { context, page } = await bootTouch(browser, device);
            try {
                await waitStill(page);
                await state[2](page, device);
                await waitStill(page);
                out.push({ label: `${dname} ${state[0]}`, ...await auditTouchTargets(page, { mustSee: state[1] }) });
            } finally { await context.close(); }
        }
    }
    return out;
})();

test('觸控：手機平板每個按鈕至少 44px（7 種畫面）', async ({ browser }) => {
    // 負向對照：掃描器抓得到 43px、放行 44px；mark-badge 例外只放寬到 44×32（徽章的 ::after 會外擴上下各 6px）
    {
        const { context, page } = await bootPage(browser, { device: DEVICES.phone });
        try {
            await page.evaluate(() => {
                const mk = (id, w, h, cls = '') => { const b = document.createElement('button'); b.id = id; b.className = cls; b.style.cssText = `position:fixed;left:8px;width:${w}px;height:${h}px;padding:0;border:0;min-height:0;min-width:0;z-index:99999`; return b; };
                const els = [mk('p43', 43, 43), mk('p44', 44, 44), mk('pbadgeok', 44, 22, 'mark-badge'), mk('pbadgebad', 44, 18, 'mark-badge')];
                els.forEach((b, i) => { b.style.top = 8 + i * 60 + 'px'; document.body.appendChild(b); });
            });
            const r = await auditTouchTargets(page);
            const flagged = r.failures.map(f => f.selector.replace(/^button/, '').replace(/\.mark-badge$/, '.mark-badge')).filter(n => /^#p/.test(n));
            expect(flagged.sort(), '只有 43px 與擴大後仍不到 32 高的徽章該被抓到（徽章 22 高＋外擴 12＝34 算過）').toEqual(['#p43', '#pbadgebad.mark-badge']);
            expect(meetsHit(44, 44) && !meetsHit(43.4, 44) && !meetsHit(44, 43.4), '比較器邊界').toBe(true);
        } finally { await context.close(); }
    }
    const bad = [];
    for (const r of await scanAllTouch(browser)) {
        expect(r.missing, `${r.label}：這些控制項沒被掃到（掃到 ${[...new Set(r.seen)]}）`).toEqual([]);
        expect(r.scanned, `${r.label}：掃到的控制項太少`).toBeGreaterThanOrEqual(3);
        for (const f of r.failures) bad.push(`${r.label}：${f.selector} ${f.w}×${f.h}`);
    }
    expect([...new Set(bad)], '這些控制項點擊範圍不到 44×44').toEqual([]);
});

test('觸控：相鄰按鈕的點擊範圍重疊不超過 4px', async ({ browser }) => {
    // 負向對照：兩顆相鄰按鈕疊 10px 會被抓到、疊 4px 不會
    {
        const { context, page } = await bootPage(browser, { device: DEVICES.phone });
        try {
            await page.evaluate(() => {
                for (const [id, left] of [['q1', 8], ['q2', 8 + 44 - 10]]) {
                    const b = document.createElement('button');
                    b.id = id; b.style.cssText = `position:fixed;top:300px;left:${left}px;width:44px;height:44px;padding:0;border:0;min-height:0;min-width:0;z-index:99999`;
                    document.body.appendChild(b);
                }
            });
            expect((await auditTouchTargets(page)).overlaps.some(o => /#q1/.test(o.a + o.b) && /#q2/.test(o.a + o.b)), '疊 10px 要被抓到').toBe(true);
            await page.evaluate(() => { document.getElementById('q2').style.left = 8 + 44 - 4 + 'px'; });
            expect((await auditTouchTargets(page)).overlaps.some(o => /#q1/.test(o.a + o.b) && /#q2/.test(o.a + o.b)), '疊 4px 不算').toBe(false);
        } finally { await context.close(); }
    }
    const bad = [];
    for (const r of await scanAllTouch(browser)) for (const o of r.overlaps) bad.push(`${r.label}：${o.a} 與 ${o.b} 重疊 ${o.amount}px`);
    expect([...new Set(bad)], '相鄰控制項的點擊範圍重疊超過 4px').toEqual([]);
});

test('觸控：橫放平板與觸控電腦（寬度超過 900）回報、存檔鈕也夠大', async ({ browser }) => {
    // 寬度 > 900 但是觸控：標題區右下的存檔／讀檔鈕與頁尾的「回報」都還在，也要 ≥ 44×44
    for (const [name, device] of [['橫放平板 1180×820', DEVICES.tabletLandscape], ['觸控電腦 1440×900', TOUCH_DESKTOP]]) {
        const { context, page } = await bootTouch(browser, device);
        try {
            await waitStill(page);
            const r = await auditTouchTargets(page, { mustSee: ['button.feedback-btn', 'button.save-load-btn'] });
            expect(r.missing, `${name}：這些控制項沒被掃到（掃到 ${[...new Set(r.seen)]}）`).toEqual([]);
            expect(r.failures, `${name}：這些控制項點擊範圍不到 44×44`).toEqual([]);
            expect(r.overlaps, `${name}：相鄰控制項重疊超過 4px`).toEqual([]);
        } finally { await context.close(); }
    }
});

test('觸控：桌機滑鼠維持原本大小', async ({ browser }) => {
    const { context, page } = await bootPage(browser, { device: DEVICES.desktop });
    try {
        expect(await page.evaluate(() => matchMedia('(pointer: fine) and (hover: hover)').matches), '這個 context 是滑鼠').toBe(true);
        const hs = await page.evaluate(() => Object.fromEntries(['.mode-button', '.batch-btn'].map(s => [s, [...document.querySelectorAll(s)].filter(e => e.getClientRects().length).map(e => e.getBoundingClientRect().height)])));
        for (const [sel, list] of Object.entries(hs)) {
            expect(list.length, `${sel} 有看得見的`).toBeGreaterThan(0);
            for (const h of list) expect(h, `桌機滑鼠 ${sel} 高度 ${h} 要比 44 矮（維持緊湊）`).toBeLessThan(44);
        }
    } finally { await context.close(); }
});

test('觸控：手機搜尋後結果區至少 420px', async ({ browser }) => {
    const { context, page } = await bootTouch(browser, DEVICES.phone);
    try {
        await page.fill('#searchInput', 'ㄢ');
        await settle(page);
        await waitStill(page);
        expect((await readKeyboard(page)).open, '鍵盤是收起的').toBe(false);
        const h = await page.locator('.results-section').evaluate(el => el.getBoundingClientRect().height);
        expect(h, `結果區高度 ${h}px`).toBeGreaterThanOrEqual(420);
    } finally { await context.close(); }
});

test('觸控：還沒搜尋時 AI 面板按鈕夠大、按建議會提示先搜尋', async ({ browser }) => {
    const device = DEVICES.phone;
    const { context, page } = await bootTouch(browser, device);
    try {
        await toggleSide(page, device, 'ai');
        // 篩選晶片列在搜尋單一字之前本來就是隱藏的（既有行為）；這裡只是把它顯示出來量 CSS 尺寸
        await page.evaluate(() => { document.getElementById('aiFilterRow').style.display = 'flex'; });
        for (const sel of ['#modeRhyme', '#modeInitial', '#filterChipSameTone', '#filterChipSameChar', '#filterChipNoExtRhyme', '#filterChipWordLen']) {
            const b = await page.locator(sel).boundingBox();
            expect(b, `${sel} 看得到`).not.toBeNull();
            expect(b.height, `${sel} 高度 ${b.height}`).toBeGreaterThanOrEqual(43.5);
        }
        await expectReallyClickable(page, page.locator('#generateBtn'), '提供詞語建議');
        await page.locator('#generateBtn').tap();
        await expect(page.locator('.copy-toast')).toContainText('請先在上方搜尋要押韻的字');
    } finally { await context.close(); }
});

// ===== 05-08 任務二：有內容的段落刪除前先確認；放大到 150% 右鍵／長按選單不跑出畫面 =====
const DELETE_SECTIONS = [
    { label: '主歌', text: '寫了很久的主歌', collapsed: false },
    { label: '副歌', text: '寫了很久的副歌', collapsed: false },
    { label: '空白段', text: '', collapsed: false },
];
const savedLyrics = page => page.evaluate(() => JSON.parse(localStorage.getItem('haiku_lyrics') || 'null'));
const sectionCount = page => page.locator('#lyricsSections .lyrics-section').count();
// bootPage 掛了一個自動按「確定」的處理器；這個測試要自己決定按取消或確定，所以先全部拿掉再掛自己的
function takeOverDialogs(page) {
    page.removeAllListeners('dialog');
    const log = { messages: [], answer: 'dismiss' };
    page.on('dialog', d => { log.messages.push(d.message()); return log.answer === 'accept' ? d.accept() : d.dismiss(); });
    return log;
}

test('刪除：有歌詞的段落要先確認、空段落直接刪', async ({ browser }) => {
    const device = DEVICES.phone;
    const { context, page } = await bootPage(browser, { device, storage: { haiku_lyrics: JSON.stringify(DELETE_SECTIONS) } });
    try {
        const log = takeOverDialogs(page);
        await toggleSide(page, device, 'lyrics');
        expect(await sectionCount(page)).toBe(3);
        const removeBtn = i => page.locator(`#lyricsSections .lyrics-section[data-index="${i}"] .section-remove`);

        // 有內容、按取消：段落與文字都在，存檔也沒變
        await expectReallyClickable(page, removeBtn(1), '副歌的刪除鈕');
        await removeBtn(1).tap();
        expect(log.messages, '只問一次、文字完全照規格').toEqual(['刪除「副歌」？段落內的歌詞會一併刪除，無法復原。']);
        expect(await sectionCount(page), '取消後段落還在').toBe(3);
        expect(await page.locator('#lyricsSections .section-textarea').nth(1).inputValue(), '取消後文字還在').toBe('寫了很久的副歌');
        expect(await savedLyrics(page), '取消後存檔沒變').toEqual(DELETE_SECTIONS);

        // 有內容、按確定：刪掉，存檔跟著更新
        log.answer = 'accept';
        await removeBtn(1).tap();
        expect(log.messages.length, '又問了一次').toBe(2);
        expect(await sectionCount(page)).toBe(2);
        expect((await savedLyrics(page)).map(s => s.label)).toEqual(['主歌', '空白段']);

        // 空段落：不問直接刪
        log.answer = 'dismiss';   // 就算被問了也會按取消 → 段落還在就能抓到「不該問卻問了」
        await removeBtn(1).tap();
        expect(log.messages.length, '空段落不跳確認').toBe(2);
        expect(await sectionCount(page), '空段落直接刪掉').toBe(1);
        expect((await savedLyrics(page)).map(s => s.label)).toEqual(['主歌']);
    } finally { await context.close(); }
});

test('刪除：段落名稱只當純文字顯示', async ({ browser }) => {
    const device = DEVICES.phone;
    const sections = [
        { label: '歌詞', text: '第一段', collapsed: false },
        { label: '<b>x</b>', text: '有字', collapsed: false },
        { label: '', text: '沒取名但有字', collapsed: false },
    ];
    const { context, page } = await bootPage(browser, { device, storage: { haiku_lyrics: JSON.stringify(sections) } });
    try {
        const log = takeOverDialogs(page);
        await toggleSide(page, device, 'lyrics');
        await page.locator('#lyricsSections .lyrics-section[data-index="1"] .section-remove').tap();
        await page.locator('#lyricsSections .lyrics-section[data-index="2"] .section-remove').tap();
        expect(log.messages).toEqual([
            '刪除「<b>x</b>」？段落內的歌詞會一併刪除，無法復原。',   // 標籤符號原樣出現，沒有被當成 HTML
            '刪除「新段落」？段落內的歌詞會一併刪除，無法復原。',     // 沒取名的用預設名稱
        ]);
        expect(await sectionCount(page), '兩次都取消，三段都在').toBe(3);
        expect(await page.evaluate(() => document.querySelectorAll('#lyricsSections b').length), '沒有被塞進頁面的標籤').toBe(0);
    } finally { await context.close(); }
});

// 在頁面內送出一個觸控事件（touchstart／touchend），座標用 clientX／clientY
const fireTouch = (page, sel, type, x, y) => page.evaluate(({ sel, type, x, y }) => {
    const el = document.querySelector(sel);
    const t = new Touch({ identifier: 7, target: el, clientX: x, clientY: y });
    el.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [t], targetTouches: type === 'touchend' ? [] : [t], changedTouches: [t] }));
}, { sel, type, x, y });
const fireContext = (page, sel, x, y) => page.evaluate(({ sel, x, y }) => {
    document.querySelector(sel).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
}, { sel, x, y });
// 量目前顯示的選單：框、可見範圍、1rem 的實際像素、每個選項的高度
const readMenu = (page, id) => page.evaluate(id => {
    const m = document.getElementById(id);
    const r = m.getBoundingClientRect();
    const vv = window.visualViewport;
    return {
        shown: m.classList.contains('show'),
        l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width,
        vl: vv.offsetLeft, vt: vv.offsetTop, vr: vv.offsetLeft + vv.width, vb: vv.offsetTop + vv.height,
        rem: parseFloat(getComputedStyle(document.documentElement).fontSize),
        minW: parseFloat(getComputedStyle(m).minWidth),
        items: [...m.querySelectorAll('.word-ctx-item')].map(e => e.getBoundingClientRect().height),
    };
}, id);
const hideMenus = page => page.evaluate(() => { _hideCtxMenu(); _hidePolyCtxMenu(); });

test('選單：放大 150% 時右鍵／長按選單不跑出畫面', async ({ browser }) => {
    const MENUS = [
        // [說明, 要觸發的元素, 選單 id]
        ['字卡選單', '#resultsContainer .char-card', 'wordCtxMenu'],
        ['AI 詞卡選單', '#aiWordsContainer .ai-word-card', 'wordCtxMenu'],
        ['破音字選單', '.poly-chip', 'polyChipCtxMenu'],
    ];
    for (const [dname, device, touch] of [['桌機 1440×900（右鍵）', DEVICES.desktop, false], ['手機 390×844（長按 500ms）', DEVICES.phone, true]]) {
        const { context, page } = await bootPage(browser, { device, storage: { 'lh:uiScale': '150' } });
        try {
            await page.fill('#searchInput', '樂');
            await settle(page);
            await waitStill(page);
            await page.evaluate(() => { document.getElementById('aiWordsContainer').innerHTML = aiWordCardHtml('平安', false); });
            const vp = await page.evaluate(() => ({ w: visualViewport.width, h: visualViewport.height }));
            // 右下角、左上角、右上角、左下角：四個角落都不能跑出去
            const corners = [['右下', vp.w - 2, vp.h - 2], ['左上', 1, 1], ['右上', vp.w - 2, 1], ['左下', 1, vp.h - 2]];
            for (const [mname, sel, id] of MENUS) {
                for (const [cname, x, y] of corners) {
                    await hideMenus(page);
                    if (touch) {
                        await fireTouch(page, sel, 'touchstart', x, y);
                        await page.waitForTimeout(650);
                        await fireTouch(page, sel, 'touchend', x, y);
                    } else {
                        await fireContext(page, sel, x, y);
                    }
                    const m = await readMenu(page, id);
                    const tag = `${dname} ${mname} ${cname}`;
                    expect(m.shown, `${tag}：選單有出現`).toBe(true);
                    expect(m.l, `${tag}：左邊在可見範圍內 ${JSON.stringify(m)}`).toBeGreaterThanOrEqual(m.vl - 0.5);
                    expect(m.t, `${tag}：上邊在可見範圍內`).toBeGreaterThanOrEqual(m.vt - 0.5);
                    expect(m.r, `${tag}：右邊在可見範圍內`).toBeLessThanOrEqual(m.vr + 0.5);
                    expect(m.b, `${tag}：下邊在可見範圍內`).toBeLessThanOrEqual(m.vb + 0.5);
                    expect(m.minW, `${tag}：最小寬度 9rem`).toBeCloseTo(9 * m.rem, 0);
                    expect(m.w, `${tag}：實際寬度不小於 9rem`).toBeGreaterThanOrEqual(9 * m.rem - 0.5);
                    if (touch) for (const h of m.items) expect(h, `${tag}：觸控選項高度 ${h}`).toBeGreaterThanOrEqual(43.5);
                }
            }
        } finally { await context.close(); }
    }
});
