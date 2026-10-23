// 韻腳地圖（第 10 階段）的瀏覽器測試：句尾字依韻部上色、只重畫被改的那一段、不碰輸入框、就緒前不畫
// 之後的計畫會在這支檔案繼續加（鏡像對齊、組字、開關、浮動列…）；標題的第一個詞對應 10-VALIDATION.md 的 -g 篩選
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage } from './helpers.mjs';

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/v096-localStorage.json', import.meta.url), 'utf8'));
const OPEN_PANELS = { leftPanelCollapsed: 'false', rightPanelCollapsed: 'false' };
const v2Storage = (songs, extra = OPEN_PANELS) => ({
    ...FIXTURE, 'lh:schema': '2', 'lh:songs': JSON.stringify(songs), 'lh:activeSong': songs[0].id, ...extra,
});
const typed = (id, type, text, extra = {}) => ({ id, type, custom: '', color: '', height: null, label: '', text, collapsed: false, ...extra });
const song = (sections, extra = {}) => ({ id: 's1', title: '測試歌', sections, hashtags: [], context: '', createdAt: 1, updatedAt: 1, ...extra });

const F_AABB = '我望著遠方的光\n獨自站在窗\n走過熟悉的街道\n終於我也回到';
const F_PART = '愛你到天亮啊！\n\n（Oh baby）\n想你想到心慌了…\n好想好想你，嗎';

// 某一段鏡像層裡所有色塊的 [文字, data-f]
const bands = (page, n = 0) => page.locator('#lyricsSections .lyrics-section').nth(n).locator('.rhyme-mirror .rm-hl')
    .evaluateAll(els => els.map(e => [e.textContent, e.dataset.f]));

// 游標放到第一段最後（Mac 與 Linux 的「到最後」快捷鍵不同，直接設選取範圍）
const caretToEnd = page => page.evaluate(() => { const ta = document.querySelector('.section-textarea'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); });

test('上色：句尾字依韻部上色', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', F_AABB), typed('sb', 'chorus', '')])]),
    });
    // 鏡像層是輸入框前面的第一個子節點，裝飾用：不能點、字看不見
    const mirror = page.locator('.lyrics-section').first().locator('.section-body > .rhyme-mirror');
    await expect(mirror).toHaveAttribute('aria-hidden', 'true');
    expect(await mirror.evaluate(m => m.parentNode.firstElementChild === m && m.nextElementSibling.classList.contains('section-textarea'))).toBe(true);
    expect(await mirror.evaluate(m => { const c = getComputedStyle(m); return [c.pointerEvents, c.color]; })).toEqual(['none', 'rgba(0, 0, 0, 0)']);
    // 四行句尾：光、窗同韻（家族 14），道、到同韻（家族 8）
    expect(await bands(page)).toEqual([['光', '14'], ['窗', '14'], ['道', '8'], ['到', '8']]);
    await expect(page.locator('.lyrics-section').first()).toHaveClass(/\brm-on\b/);
    await expect(page.locator('.lyrics-section').nth(1)).not.toHaveClass(/\brm-on\b/);   // 沒有色塊的段落維持原樣
    // 重畫、打字都不碰輸入框：同一個節點、同樣的內容；也沒有任何網路請求
    const requests = [];
    page.on('request', r => requests.push(r.url()));
    await page.evaluate(() => {
        const ta = document.querySelector('.section-textarea');
        ta.focus(); ta.setSelectionRange(3, 5);
        window.__ta = ta; window.__v = ta.value;
        lhMapRenderAll();
    });
    expect(await page.evaluate(() => [window.__ta === document.querySelector('.section-textarea'), window.__ta.value === window.__v,
        window.__ta.selectionStart, window.__ta.selectionEnd, document.activeElement === window.__ta])).toEqual([true, true, 3, 5, true]);
    await caretToEnd(page);
    await page.keyboard.type('\n我在這裡等天亮');
    await expect.poll(() => bands(page)).toHaveLength(5);
    expect(await page.evaluate(() => window.__ta === document.querySelector('.section-textarea'))).toBe(true);
    expect(requests, '上色不送任何網路請求').toEqual([]);
    expect(errors).toEqual([]);
    await context.close();
});

test('上色：打字後只重畫那一段', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', F_AABB), typed('sb', 'chorus', '你好嗎\n走回來')])]),
    });
    await page.evaluate(() => { window.__other = document.querySelectorAll('.lyrics-section')[1].querySelector('.rm-hl'); });
    expect(await page.evaluate(() => window.__other && window.__other.isConnected)).toBe(true);
    await caretToEnd(page);
    await page.keyboard.type('\n我在這裡等天亮');
    await expect.poll(async () => (await bands(page)).at(-1)).toEqual(['亮', '14']);
    expect(await page.evaluate(() => window.__other.isConnected), '別段的色塊沒有被換掉').toBe(true);
    expect(await bands(page)).toEqual([['光', '14'], ['窗', '14'], ['道', '8'], ['到', '8'], ['亮', '14']]);
    expect(errors).toEqual([]);
    await context.close();
});

test('上色：語助詞、標點、英文、空行', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', F_PART)])]),
    });
    // 語助詞（啊、了、嗎）跳過；英文行與空行沒有色塊
    expect((await bands(page)).map(b => b[0])).toEqual(['亮', '慌', '你']);
    // 鏡像層的文字和輸入框一模一樣（只是多一個結尾零寬字元），行數也一樣
    expect(await page.locator('.rhyme-mirror').first().evaluate(m => m.textContent)).toBe(F_PART + '​');
    expect(errors).toEqual([]);
    await context.close();
});

test('上色：一句的段落是孤句', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', '我望著遠方的光')])]),
    });
    await expect(page.locator('.rhyme-mirror .rm-hl')).toHaveCount(1);
    await expect(page.locator('.rhyme-mirror .rm-hl')).toHaveClass(/\brm-solo\b/);
    expect(errors).toEqual([]);
    await context.close();
});

test('上色：字典與詞庫載好前不上色', async ({ browser }) => {
    let release;
    const gate = new Promise(r => { release = r; });
    const { context, page, errors } = await bootPage(browser, {
        wordlist: 'stub', waitWordlist: false, storage: v2Storage([song([typed('sa', 'verse', F_AABB)])]),
        // 後註冊的攔截先執行：把詞庫的每一塊都卡住，放行時交給 stub 回應
        beforeGoto: ({ context: c }) => c.route(/\/data\/wordlist-c0\d\.json(\?.*)?$/, async route => { await gate; await route.fallback(); }),
    });
    expect(await page.locator('.rhyme-mirror .rm-hl').count(), '詞庫還沒好：不畫').toBe(0);
    expect(await page.evaluate(() => Promise.race([window.__lhMapReady.then(() => 'ready'), new Promise(r => setTimeout(() => r('pending'), 300))]))).toBe('pending');
    expect(errors, '還沒好不算錯誤').toEqual([]);
    release();
    await page.evaluate(() => window.__lhMapReady);
    await expect.poll(() => bands(page)).toEqual([['光', '14'], ['窗', '14'], ['道', '8'], ['到', '8']]);
    expect(errors).toEqual([]);
    await context.close();
});
