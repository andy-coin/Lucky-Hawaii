// 錯誤可見性：背景失敗只留 [好韻器] 主控台記錄（D-07），使用者操作失敗要有白話提示（D-08）
import { test, expect } from '@playwright/test';
import { bootPage, settle } from './helpers.mjs';

// 讓某個資料檔「200 但內容壞掉」（資料檔一律不用 abort，會被記成 console.error）
const broken = (pattern, body, contentType = 'application/json') => async ({ context }) => {
    await context.route(pattern, route => route.fulfill({ status: 200, contentType, body }));
};

const hasRecord = (warnings, tag) => warnings.some(w => w.startsWith('[好韻器] ' + tag));

// 共通檢查：沒有未捕捉的錯誤、背景錯誤不彈存檔橫幅
async function expectQuiet(page, errors) {
    expect(errors.filter(e => !e.includes('Failed to load resource'))).toEqual([]);
    await expect(page.locator('#lhSaveBanner')).toHaveCount(0);
}

// 搜尋 ㄢ，確認卡片照常出現
async function expectSearchWorks(page, term = 'ㄢ') {
    await page.fill('#searchInput', term);
    await page.keyboard.press('Enter');
    await expect(page.locator('.results-count')).toContainText('找到');
    expect(await page.locator('.char-card').count()).toBeGreaterThan(0);
}

test('背景錯誤：字庫修正檔壞掉會留下記錄', async ({ browser }) => {
    const { context, page, errors, warnings } = await bootPage(browser, {
        beforeGoto: broken(/\/data\/rhyme-dict-overrides\.json/, 'not json'),
    });
    expect(hasRecord(warnings, '字庫修正檔載入失敗')).toBe(true);
    await expectSearchWorks(page);
    await expectQuiet(page, errors);
    await context.close();
});

test('背景錯誤：詞庫分段壞掉會留下記錄', async ({ browser }) => {
    const { context, page, errors, warnings } = await bootPage(browser, {
        beforeGoto: broken(/\/data\/wordlist-c03\.json/, '{bad'),
    });
    expect(hasRecord(warnings, '詞庫分段 3 載入失敗')).toBe(true);
    await expectSearchWorks(page);
    await expectQuiet(page, errors);
    await context.close();
});

test('背景錯誤：詞庫版本檔壞掉會留下記錄', async ({ browser }) => {
    const { context, page, errors, warnings } = await bootPage(browser, {
        beforeGoto: broken(/\/data\/wordlist-meta\.json/, 'x'),
    });
    expect(hasRecord(warnings, '詞庫版本檔讀取失敗')).toBe(true);
    await expectSearchWorks(page);
    await expectQuiet(page, errors);
    await context.close();
});

test('背景錯誤：詞庫修正檔壞掉會留下記錄', async ({ browser }) => {
    const { context, page, errors, warnings } = await bootPage(browser, {
        beforeGoto: broken(/\/data\/wordlist-overrides\.json/, 'x'),
    });
    expect(hasRecord(warnings, '詞庫修正檔載入失敗')).toBe(true);
    await expectSearchWorks(page);
    await expectQuiet(page, errors);
    await context.close();
});

test('背景錯誤：破音字排序檔壞掉會留下記錄', async ({ browser }) => {
    const { context, page, errors, warnings } = await bootPage(browser, {
        beforeGoto: async ({ context }) => {
            // .js 回空內容，注入的全域變數就不存在，程式會改抓 .json（也是壞的）
            await context.route(/\/data\/polyphonic-order\.js/, r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
            await context.route(/\/data\/polyphonic-order\.json/, r => r.fulfill({ status: 200, contentType: 'application/json', body: 'x' }));
        },
    });
    expect(hasRecord(warnings, '破音字排序檔載入失敗')).toBe(true);
    await expectSearchWorks(page, '樂');
    await expectQuiet(page, errors);
    await context.close();
});

test('背景錯誤：本機字庫覆寫損毀會留下記錄', async ({ browser }) => {
    const { context, page, errors, warnings } = await bootPage(browser, { storage: { dictOverrides_v076: '{bad' } });
    expect(hasRecord(warnings, 'dictOverrides_v076 內容損毀')).toBe(true);
    await expectSearchWorks(page);
    await expectQuiet(page, errors);
    await context.close();
});

test('背景錯誤：IndexedDB 無法使用會留下記錄', async ({ browser }) => {
    const { context, page, errors, warnings } = await bootPage(browser, {
        init: () => { indexedDB.open = () => { throw new Error('IndexedDB 被封鎖'); }; },
    });
    expect(hasRecord(warnings, 'IndexedDB 開啟失敗')).toBe(true);
    await expectSearchWorks(page);
    await expectQuiet(page, errors);
    await context.close();
});

// 攔 Worker 的 /feedback（page 層的 route 優先於 context 層的預設 mock）
const feedbackStatus = status => async ({ page }) => {
    await page.route(u => u.hostname === 'lucky-hawaii.is3000dollar.workers.dev' && u.pathname === '/feedback',
        r => r.fulfill({ status, contentType: 'application/json', body: '{}' }));
};

async function sendReport(page) {
    await page.evaluate(() => {
        document.getElementById('feedbackSubject').value = '測試回報';
        return submitFeedback();
    });
    await settle(page);
    return page.locator('#copyToast').textContent();
}

test('使用者操作：回報送不出去會提示', async ({ browser }) => {
    const { context, page, errors, warnings } = await bootPage(browser, { beforeGoto: feedbackStatus(500) });
    const toast = await sendReport(page);
    expect(toast).toBe('回報沒有送出，請檢查網路後再試一次');
    expect(toast).not.toBe('感謝你的回饋！');
    expect(hasRecord(warnings, '回報送出失敗')).toBe(true);
    await expectQuiet(page, errors);
    await context.close();
});

test('使用者操作：回報送不出去時視窗與輸入的文字都保留（WR-05）', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { beforeGoto: feedbackStatus(500) });
    await page.evaluate(() => openFeedbackModal());
    // openFeedbackModal 隔 50ms 才把焦點移到主旨欄；先等它落定再輸入。
    // 否則負載高時計時器會落在 fill() 的 focus 與 insertText 之間，內文被打進主旨欄
    await expect(page.locator('#feedbackSubject')).toBeFocused();
    await page.fill('#feedbackSubject', '我的主旨');
    await page.fill('#feedbackBody', '我寫了很久的內文');
    await page.evaluate(() => submitFeedback());
    await settle(page);
    await expect(page.locator('#feedbackModalOverlay')).toHaveClass(/show/);
    await expect(page.locator('#feedbackSubject')).toHaveValue('我的主旨');
    await expect(page.locator('#feedbackBody')).toHaveValue('我寫了很久的內文');
    await expect(page.locator('.feedback-send-btn')).toBeEnabled();
    await expectQuiet(page, errors);
    await context.close();
});

test('使用者操作：回報送出成功仍顯示感謝', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {});
    expect(await sendReport(page)).toBe('感謝你的回饋！');
    await expect(page.locator('#feedbackModalOverlay')).not.toHaveClass(/show/);
    await expectQuiet(page, errors);
    await context.close();
});
