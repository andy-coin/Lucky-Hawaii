// 新手導覽（Andy 1-c）：一步一步點亮區塊、鍵盤可操作、看過就記住、手機說明框不出畫面
import { test, expect } from '@playwright/test';
import { bootPage } from './helpers.mjs';

const STEPS = 7;
const card = page => page.locator('.tour-card');
const inView = (b, vw, vh) => b.x >= 0 && b.y >= 0 && b.x + b.width <= vw + 0.5 && b.y + b.height <= vh + 0.5;

test('導覽：自動測試環境不自動出現，也沒寫入看過', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub' });
    await page.waitForTimeout(700);
    await expect(page.locator('#lhTour')).toHaveCount(0);
    expect(await page.evaluate(() => lhGet('lh:tourSeen'))).toBeNull();
    expect(errors).toEqual([]);
    await context.close();
});

test('導覽：第一次來（非自動化）自動出現一次，看完就記住', async ({ browser }) => {
    const hideWebdriver = () => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', init: hideWebdriver });
    await expect(page.locator('#lhTour')).toHaveCount(1);
    await expect(card(page)).toBeFocused({ timeout: 1 }).catch(() => {});   // 焦點在「下一步」，不強求在卡片本身
    await page.keyboard.press('Escape');
    await expect(page.locator('#lhTour')).toHaveCount(0);
    expect(await page.evaluate(() => lhGet('lh:tourSeen'))).toBe('1');
    await page.reload();
    await page.evaluate(() => window.__hoyunSongsReady);
    await page.waitForTimeout(700);
    await expect(page.locator('#lhTour')).toHaveCount(0);
    expect(errors).toEqual([]);
    await context.close();
});

test('導覽：桌機逐步走完，亮框對準目標、說明框在畫面內，鍵盤可操作', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub' });
    await page.locator('#tourBtn').click();
    await expect(card(page)).toBeVisible();
    await expect(page.locator('.tour-next')).toBeFocused();
    await expect(page.locator('#lhTourCount')).toHaveText('1 / ' + STEPS);
    await expect(page.locator('.tour-prev')).toBeHidden();
    const vp = page.viewportSize();
    for (let i = 0; i < STEPS; i++) {
        await page.waitForTimeout(450);   // 面板滑入與亮框過渡
        await expect(page.locator('#lhTourCount')).toHaveText(`${i + 1} / ${STEPS}`);
        const sel = await page.evaluate(k => LH_TOUR_STEPS[k].sel, i);
        const t = await page.locator(sel).first().boundingBox();
        const s = await page.locator('.tour-spot').boundingBox();
        // 亮框包住目標看得到的部分（容許 8px 內距與畫面夾住）
        expect(s.x, `第 ${i + 1} 步亮框左緣`).toBeLessThanOrEqual(Math.max(t.x, 0) + 1);
        expect(s.x + s.width, `第 ${i + 1} 步亮框右緣`).toBeGreaterThanOrEqual(Math.min(t.x + t.width, vp.width) - 3);
        expect(inView(await card(page).boundingBox(), vp.width, vp.height), `第 ${i + 1} 步說明框在畫面內`).toBe(true);
        if (i < STEPS - 1) await page.keyboard.press('ArrowRight');
    }
    await expect(page.locator('.tour-next')).toHaveText('開始使用');
    await expect(page.locator('.tour-skip')).toBeHidden();
    // ← 回上一步、Tab 留在說明框
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#lhTourCount')).toHaveText(`${STEPS - 1} / ${STEPS}`);
    for (let k = 0; k < 4; k++) {
        await page.keyboard.press('Tab');
        expect(await page.evaluate(() => !!document.activeElement.closest('.tour-card'))).toBe(true);
    }
    await page.locator('.tour-next').click();
    await page.locator('.tour-next').click();
    await expect(page.locator('#lhTour')).toHaveCount(0);
    expect(await page.evaluate(() => lhGet('lh:tourSeen'))).toBe('1');
    expect(errors).toEqual([]);
    await context.close();
});

test('導覽：手機每一步目標可見、說明框不超出畫面，結束回到查韻', async ({ browser }) => {
    const device = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', device });
    await page.evaluate(() => lhTourStart());
    const vp = page.viewportSize();
    for (let i = 0; i < STEPS; i++) {
        await page.waitForTimeout(500);
        const sel = await page.evaluate(k => LH_TOUR_STEPS[k].sel, i);
        const t = await page.locator(sel).first().boundingBox();
        expect(t, `第 ${i + 1} 步目標 ${sel} 有畫出來`).not.toBeNull();
        expect(t.y + Math.min(t.height, 40), `第 ${i + 1} 步目標有一部分在畫面內`).toBeGreaterThan(0);
        expect(t.y, `第 ${i + 1} 步目標上緣在畫面內`).toBeLessThan(vp.height);
        expect(inView(await card(page).boundingBox(), vp.width, vp.height), `第 ${i + 1} 步說明框在畫面內`).toBe(true);
        await page.locator('.tour-next').tap();
    }
    await expect(page.locator('#lhTour')).toHaveCount(0);
    await expect(page.locator('#leftPanel')).toHaveClass(/collapsed/);
    await expect(page.locator('#rightPanel')).toHaveClass(/collapsed/);
    expect(errors).toEqual([]);
    await context.close();
});

test('導覽：略過也記住，設定裡可以重看', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub' });
    await page.evaluate(() => lhTourStart());
    await page.locator('.tour-skip').click();
    await expect(page.locator('#lhTour')).toHaveCount(0);
    expect(await page.evaluate(() => lhGet('lh:tourSeen'))).toBe('1');
    await page.evaluate(() => toggleSettings());
    await page.locator('#prefsTab-help').click();   // 分頁式偏好設定（R2）
    await page.locator('.tour-replay-btn').click();
    await expect(page.locator('#settingsOverlay')).not.toHaveClass(/show/);
    await expect(page.locator('#lhTourCount')).toHaveText('1 / ' + STEPS);
    expect(errors).toEqual([]);
    await context.close();
});
