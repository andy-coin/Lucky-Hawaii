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
