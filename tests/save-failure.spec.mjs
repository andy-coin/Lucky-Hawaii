// PERF-04（localStorage 這一半）：寫入被瀏覽器拒絕時，使用者要看到橫幅，而且 app 照常能用
// 失敗用 init script 包住 Storage.prototype.setItem 來注入，開機不受影響，要失敗時才把 __failLS 打開
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage, settle } from './helpers.mjs';
import { DEVICES, setScale, rectsOverlap, auditVisibleControls } from './layout-lib.mjs';

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/v096-localStorage.json', import.meta.url), 'utf8'));

const injectQuota = () => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
        if (window.__failLS) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
        return orig.call(this, k, v);
    };
};

const BANNER = '#lhSaveBanner';

test('localStorage: 寫入被拒時顯示存檔失敗橫幅', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: FIXTURE, init: injectQuota });
    await page.evaluate(() => { window.__failLS = true; });
    const ok = await page.evaluate(() => lhSet('haiku_lyrics', '[]'));
    expect(ok).toBe(false);
    const banner = page.locator(BANNER);
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute('role', 'alert');
    await expect(banner).toContainText('存檔失敗');
    await expect(banner).toContainText('備份全部');
    await expect(page.locator('.lh-save-banner-export')).toHaveText('備份全部');
    await expect(banner).not.toContainText('匯出備份');
    expect(errors).toEqual([]);
    // 橫幅不是 modal：需要手動關閉，關閉後 app 照常可用
    await page.locator('.lh-save-banner-close').click();
    await expect(banner).toBeHidden();
    await page.evaluate(() => { window.__failLS = false; });
    await page.fill('#searchInput', 'ㄢ');
    await settle(page);
    await expect(page.locator('.results-count').first()).toHaveText(/[1-9]/);
    expect(errors).toEqual([]);
    await context.close();
});

test('localStorage: 60 秒內只顯示一次、不堆疊', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        storage: FIXTURE,
        init: injectQuota,
        beforeGoto: ({ page }) => page.clock.install(),
    });
    const fail = () => page.evaluate(() => { window.__failLS = true; return lhSet('haiku_lyrics', '[]'); });
    for (let i = 0; i < 5; i++) await fail();
    await expect(page.locator('[role="alert"].lh-save-banner')).toHaveCount(1);
    await expect(page.locator(BANNER)).toBeVisible();
    await page.locator('.lh-save-banner-close').click();
    await fail();
    await expect(page.locator(BANNER)).toBeHidden();      // 節流視窗內，關掉後同一種不再跳
    await page.clock.fastForward(61000);
    await fail();
    await expect(page.locator(BANNER)).toBeVisible();     // 超過 60 秒再失敗就會重新顯示
    await expect(page.locator('[role="alert"].lh-save-banner')).toHaveCount(1);
    expect(errors).toEqual([]);
    await context.close();
});

test('localStorage: 橫幅淺色與深色都看得清楚', async ({ browser }) => {
    const { context, page } = await bootPage(browser, { storage: FIXTURE, init: injectQuota });
    await page.evaluate(() => { window.__failLS = true; lhSet('haiku_lyrics', '[]'); });
    await expect(page.locator(BANNER)).toBeVisible();
    // WCAG 相對亮度對比（橫幅背景是不透明的 var(--card-bg)）
    const contrast = () => page.evaluate(sel => {
        const rgb = s => s.match(/[\d.]+/g).slice(0, 3).map(Number);
        const lum = ([r, g, b]) => {
            const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
            return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        const fg = lum(rgb(getComputedStyle(document.querySelector('.lh-save-banner-text')).color));
        const bg = lum(rgb(getComputedStyle(document.querySelector(sel)).backgroundColor));
        const [hi, lo] = fg > bg ? [fg, bg] : [bg, fg];
        return (hi + 0.05) / (lo + 0.05);
    }, BANNER);
    expect(await contrast()).toBeGreaterThanOrEqual(4.5);
    // 用真的主題切換鈕：它會一併重算自訂文字色（只呼叫 applyTheme 會留著淺色模式的文字色）
    await page.evaluate(() => { window.__failLS = false; document.getElementById('themeToggle').click(); });
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe('dark');
    expect(await contrast()).toBeGreaterThanOrEqual(4.5);
    await context.close();
});

test('localStorage: 未登記的鍵會留下錯誤記錄', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: FIXTURE });
    expect(errors).toEqual([]);
    await page.evaluate(() => lhSet('lhProbeUnknownKey', 'x'));
    expect(errors).toEqual(['console.error: [好韻器] 未登記的儲存鍵：lhProbeUnknownKey']);
    await context.close();
});

test('localStorage: 使用者操作存檔失敗時不再出現程式錯誤', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: FIXTURE, init: injectQuota });
    await page.evaluate(() => { window.__failLS = true; });
    // 展開側欄：toggleLeftPanel 會寫入 leftPanelCollapsed（以前這裡會丟未捕捉的例外）
    await page.evaluate(() => document.querySelector('[onclick="toggleLeftPanel()"]').click());
    await expect(page.locator(BANNER)).toBeVisible();
    // 打字：input 事件只改模型，300 毫秒後才寫入 lh:songs（寫入失敗只跳橫幅，不丟例外）
    await page.evaluate(() => {
        const ta = document.querySelector('.section-textarea');
        ta.value = ta.value + '新的一行';
        ta.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect(page.locator(BANNER)).toContainText('存檔失敗');
    expect(errors).toEqual([]);
    await context.close();
});

// D-05：橫幅排在 .container 最上方的正常流程，把內容往下推，不蓋住任何按鈕
for (const [name, device] of [['phone', DEVICES.phone], ['tablet', DEVICES.tablet], ['desktop', DEVICES.desktop]]) {
    test(`localStorage: 橫幅排在主畫面最上方、不擋任何按鈕（${name}）`, async ({ browser }) => {
        // 兩個側欄都展開：桌機側欄會把主畫面推開（05-05），橫幅不會被蓋住；手機、平板 ≤ 900 一律收起，這個設定沒作用
        const storage = { ...FIXTURE, leftPanelCollapsed: 'false', rightPanelCollapsed: 'false' };
        const { context, page, errors } = await bootPage(browser, { storage, init: injectQuota, device });
        const touch = !!device.hasTouch;
        for (const scale of [100, 150]) {
            await setScale(page, scale);
            // 清掉上一輪的橫幅與節流記錄，每個倍率都重新觸發一次
            await page.evaluate(() => { document.getElementById('lhSaveBanner')?.remove(); delete _lhBannerShownAt.save; window.__failLS = true; lhSet('haiku_lyrics', '[]'); window.__failLS = false; });
            const banner = page.locator(BANNER);
            await expect(banner).toBeVisible();
            const info = await page.evaluate(() => {
                const el = document.getElementById('lhSaveBanner');
                return { first: document.querySelector('.container').firstElementChild === el, pos: getComputedStyle(el).position };
            });
            expect(info, `${name}@${scale}`).toEqual({ first: true, pos: 'static' });
            const bb = await banner.boundingBox();
            const hits = (await auditVisibleControls(page, 'body'))
                .filter(c => !c.name.includes('lh-save-banner') && rectsOverlap(bb, c));
            expect(hits, `${name}@${scale} 橫幅蓋住的控制項`).toEqual([]);
            if (touch) {
                for (const sel of ['.lh-save-banner-export', '.lh-save-banner-close']) {
                    expect((await page.locator(sel).boundingBox()).height, `${name}@${scale} ${sel}`).toBeGreaterThanOrEqual(44);
                }
            }
        }
        expect(errors).toEqual([]);
        await context.close();
    });
}

test('localStorage: 太早失敗時先固定顯示，載入後移進主畫面', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        storage: FIXTURE,
        init: injectQuota,
        // 在 <body> 開頭、.container 還沒生出來時就讓一次寫入失敗
        beforeGoto: ({ page }) => page.route('**/index.html', async route => {
            const res = await route.fetch();
            const html = (await res.text()).replace('<body>', '<body><script>window.__failLS = true; lhSet("haiku_lyrics", "[]"); window.__failLS = false; window.__earlyBanner = (function () { const e = document.getElementById("lhSaveBanner"); return !!e && e.parentNode === document.body && e.classList.contains("lh-save-banner--fixed") && getComputedStyle(e).position === "fixed"; })();</script>');
            await route.fulfill({ response: res, body: html });
        }),
    });
    expect(await page.evaluate(() => window.__earlyBanner)).toBe(true);
    const end = await page.evaluate(() => {
        const el = document.getElementById('lhSaveBanner');
        return { first: document.querySelector('.container').firstElementChild === el, fixed: el.classList.contains('lh-save-banner--fixed'), style: el.style.cssText };
    });
    expect(end).toEqual({ first: true, fixed: false, style: '' });
    await expect(page.locator(BANNER)).toBeVisible();
    expect(errors).toEqual([]);
    await context.close();
});

// ===== IndexedDB（PERF-04 的另一半）=====
test('IndexedDB: 詞庫快取寫入失敗只跳提示、不出存檔失敗橫幅', async ({ browser }) => {
    const { context, page, errors, warnings } = await bootPage(browser, {
        storage: FIXTURE,
        init: () => {
            // 只讓 wl（詞庫快取）的寫入 abort；backups 照常，才能證明兩者分開處理
            const put = IDBObjectStore.prototype.put;
            IDBObjectStore.prototype.put = function (...a) {
                const r = put.apply(this, a);
                if (this.name === 'wl') this.transaction.abort();
                return r;
            };
        },
    });
    await page.waitForFunction(() => (document.getElementById('copyToast')?.textContent || '').includes('詞庫快取沒存成功'), null, { timeout: 10_000 });
    expect(warnings.some(w => w.includes('[好韻器] 詞庫快取寫入失敗'))).toBe(true);
    await expect(page.locator(BANNER)).toHaveCount(0);
    await page.fill('#searchInput', 'ㄢ');
    await settle(page);
    await expect(page.locator('.results-count').first()).toHaveText(/[1-9]/);
    expect(errors).toEqual([]);
    await context.close();
});

test('IndexedDB: 備份寫入失敗時出現橫幅、改存一份在 localStorage、仍可正常使用', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        storage: FIXTURE,
        init: () => {
            // 只讓 backups 的寫入丟 QuotaExceededError；詞庫快取 wl 照常
            const put = IDBObjectStore.prototype.put;
            IDBObjectStore.prototype.put = function (...a) {
                if (this.name === 'backups') throw new DOMException('quota', 'QuotaExceededError');
                return put.apply(this, a);
            };
        },
    });
    const banner = page.locator(BANNER);
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('資料備份沒有存成功');
    const ls = await page.evaluate(() => ({ backup: localStorage.getItem('lh:backup:ls'), schema: localStorage.getItem('lh:schema') }));
    const rec = JSON.parse(ls.backup);
    expect(rec.id).toBe('pre-schema-2');   // 單份備援：baseline 之後被升級前的備份取代，內容同樣是升級前的資料
    expect(rec.data).toEqual(Object.fromEntries(Object.entries(FIXTURE).filter(([k]) => !k.startsWith('apiKey_'))));   // 備援不含金鑰
    expect(ls.schema).toBe('2');
    await page.fill('#searchInput', 'ㄢ');
    await settle(page);
    await expect(page.locator('.results-count').first()).toHaveText(/[1-9]/);
    expect(errors).toEqual([]);
    await context.close();
});

test('IndexedDB: 備份兩處都存不進去時出現橫幅且不標記資料版本', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        storage: FIXTURE,
        init: () => {
            Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true });
            const orig = Storage.prototype.setItem;
            Storage.prototype.setItem = function (k, v) {
                if (k === 'lh:backup:ls') throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
                return orig.call(this, k, v);
            };
        },
    });
    await expect(page.locator(BANNER)).toBeVisible();
    await expect(page.locator(BANNER)).toContainText('資料備份沒有存成功');
    const ls = await page.evaluate(() => ({ backup: localStorage.getItem('lh:backup:ls'), schema: localStorage.getItem('lh:schema') }));
    expect(ls.schema).toBeNull();
    expect(ls.backup).toBeNull();
    await page.fill('#searchInput', 'ㄢ');
    await settle(page);
    await expect(page.locator('.results-count').first()).toHaveText(/[1-9]/);
    expect(errors).toEqual([]);
    await context.close();
});
