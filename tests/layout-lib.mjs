// Phase 5 多裝置版面測試的共用工具
import { expect } from '@playwright/test';
import { settle } from './helpers.mjs';

// 三種主要裝置＋兩種橫放；傳給 bootPage({ device })
export const DEVICES = {
    phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
    tablet: { viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
    desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
    phoneLandscape: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
    tabletLandscape: { viewport: { width: 1180, height: 820 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
};

// settle 之後再等所有動畫（slideIn、fadeIn、面板位移）跑完，截圖與量尺寸才穩定
export async function waitStill(page) {
    await settle(page);
    await page.waitForFunction(() => document.getAnimations().every(a => a.playState !== 'running'));
}

// 用真的 ➕／➖ 按鈕點到指定百分比（CX-12：必須走真按鈕）；最多 25 下，到不了就丟錯
export async function setScale(page, pct) {
    const label = page.locator('#MzoomValue');
    for (let i = 0; i < 25; i++) {
        const cur = parseInt(await label.textContent(), 10);
        if (cur === pct) return;
        await page.locator(cur < pct ? '#MzoomIn' : '#MzoomOut').click();
    }
    throw new Error(`setScale：25 下內到不了 ${pct}%（目前 ${await label.textContent()}）`);
}

// click() 只要元素中心在畫面內就會成功，被裁掉的按鈕也點得到，所以另外量整個框要在視窗內
export async function expectFullyInViewport(page, locator, tol = 0.5) {
    const b = await locator.boundingBox();
    expect(b, '元素沒有版面框（被隱藏？）').not.toBeNull();
    const vp = page.viewportSize();
    expect(b.x, '左邊超出視窗').toBeGreaterThanOrEqual(-tol);
    expect(b.x + b.width, '右邊超出視窗').toBeLessThanOrEqual(vp.width + tol);
    expect(b.y, '上邊超出視窗').toBeGreaterThanOrEqual(-tol);
    expect(b.y + b.height, '下邊超出視窗').toBeLessThanOrEqual(vp.height + tol);
}

// 整頁有沒有被撐出捲動：回傳量到的四個數字，讓測試訊息看得到實際差多少
export function noPageScroll(page) {
    return page.evaluate(() => ({
        sh: document.documentElement.scrollHeight,
        ih: window.innerHeight,
        sw: document.documentElement.scrollWidth,
        iw: window.innerWidth,
    }));
}

// 兩個框是否重疊（超過 tol px 才算；剛好貼邊不算）。a、b 為 { x, y, width, height }
export function rectsOverlap(a, b, tol = 0.5) {
    return a.x < b.x + b.width - tol && b.x < a.x + a.width - tol
        && a.y < b.y + b.height - tol && b.y < a.y + a.height - tol;
}

// 在頁面內列出 rootSelector（可用逗號接多個區塊）底下所有看得見的可互動元素與它們的框
export function auditVisibleControls(page, rootSelector) {
    return page.evaluate(root => {
        const out = [];
        const seen = new Set();
        for (const area of document.querySelectorAll(root)) {
            for (const el of area.querySelectorAll('button, a, input, select, textarea, [onclick]')) {
                if (seen.has(el) || el.getClientRects().length === 0) continue;
                if (getComputedStyle(el).visibility === 'hidden') continue;
                const b = el.getBoundingClientRect();
                if (b.width === 0 || b.height === 0) continue;
                seen.add(el);
                const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).join('.') : '';
                out.push({ name: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + cls, x: b.x, y: b.y, width: b.width, height: b.height });
            }
        }
        return out;
    }, rootSelector);
}

// 真的點得到：捲進可視範圍後，整個框在視窗內，而且框中心最上面的就是它自己（或它的子元素），沒被別的東西蓋住。
// （click() 只管中心點在畫面內；被分頁列、遮罩或釘住的按鈕蓋住時，用 evaluate 點或強制點都看不出來）
export async function expectReallyClickable(page, locator, label = '') {
    await locator.scrollIntoViewIfNeeded();
    // 只露出一小截的元素（例如橫拿手機裡很矮的歌詞區）Playwright 會當成「已經看得到」不捲；
    // 像使用者一樣把它捲到捲動區正中間，才量得到中心有沒有被擋住
    await locator.evaluate(el => el.scrollIntoView({ block: 'center', inline: 'center' }));
    await expectFullyInViewport(page, locator);
    const hit = await locator.evaluate(el => {
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        const name = n => n ? n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (typeof n.className === 'string' && n.className.trim() ? '.' + n.className.trim().split(/\s+/).join('.') : '') : '（空）';
        return { ok: !!top && (top === el || el.contains(top)), top: name(top) };
    });
    expect(hit.ok, `${label} 中心被 ${hit.top} 蓋住`).toBe(true);
}

// 模擬虛擬鍵盤：Chromium 沒有真鍵盤，縮小視窗高度時 innerHeight 與 visualViewport.height 一起變矮，
// 寬度不變，剛好是 js/layout.js 判斷「鍵盤出現」的條件。回傳縮之前的視窗大小，給 restoreViewport 用。
export async function emulateKeyboard(page, px) {
    const before = page.viewportSize();
    await page.setViewportSize({ width: before.width, height: before.height - px });
    await twoFrames(page);
    return before;
}

// 把視窗還原成縮之前的大小（鍵盤收起）
export async function restoreViewport(page, size) {
    await page.setViewportSize(size);
    await twoFrames(page);
}

// 等兩個 requestAnimationFrame：visualViewport 事件 → rAF 節流的更新 → 套用，需要這麼久
async function twoFrames(page) {
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0)))));
}

// 鍵盤狀態一次讀出：class、三個變數的原始字串，以及視覺視窗的原始數字（不四捨五入）
export function readKeyboard(page) {
    return page.evaluate(() => {
        const root = document.documentElement;
        const vv = window.visualViewport;
        return {
            open: root.classList.contains('kb-open'),
            short: root.classList.contains('kb-short'),
            appH: root.style.getPropertyValue('--app-h'),
            vvTop: root.style.getPropertyValue('--vv-top'),
            kbInset: root.style.getPropertyValue('--kb-inset'),
            vvHeight: vv.height,
            vvOffsetTop: vv.offsetTop,
            innerHeight: window.innerHeight,
        };
    });
}

// 框是否完整落在「可見範圍」（visualViewport 的上緣到下緣）內，容許 0.5px
export function insideVisible(box, kb, tol = 0.5) {
    return box.y >= kb.vvOffsetTop - tol && box.y + box.height <= kb.vvOffsetTop + kb.vvHeight + tol;
}

// ===== 輸入框字級下限（D-08）=====
// 比較器獨立匯出，邊界測試直接拿它驗 16 剛好過、15.99 不過
export function meetsInputFloor(px) { return px >= 16; }

// 掃整頁所有看得見的文字輸入控制項（input 排除勾選／色票／拉桿／檔案／按鈕類、textarea、select），
// 回傳字級不到下限的清單；量的是每個元素自己的計算字級（CSS px），跟 --ui-scale、裝置像素比都無關
export function scanInputFonts(page) {
    // 比較器原始碼送進頁面執行，掃描與邊界測試用的是同一個函式
    return page.evaluate(src => {
        const meets = new Function('return ' + src)();
        const skip = /^(checkbox|radio|color|range|file|button|submit|reset|image|hidden)$/i;
        const bad = [];
        let count = 0;
        for (const el of document.querySelectorAll('input, textarea, select')) {
            if (el.tagName === 'INPUT' && skip.test(el.type)) continue;
            // 看不見的不算：沒有版面框（display:none）、visibility 隱藏、整個透明（例如複製用的隱形 textarea）
            if (el.getClientRects().length === 0) continue;
            const cs = getComputedStyle(el);
            if (cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            count++;
            const px = parseFloat(cs.fontSize);
            if (!meets(px)) {
                const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).join('.') : '';
                bad.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls} ${px}px`);
            }
        }
        return { bad, count };
    }, meetsInputFloor.toString());
}
