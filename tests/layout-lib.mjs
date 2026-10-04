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
