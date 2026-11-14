// AI 面板頂部「AI 會參考」狀態列（Andy 1-b）：只列真的會送的東西、跟著打字更新、點了跳到左邊
import { test, expect } from '@playwright/test';
import { bootPage } from './helpers.mjs';

const songOf = (sections, extra = {}) => JSON.stringify([{
    id: 's1', title: '測試歌', sections: sections.map((text, i) => ({ id: 'x' + i, label: '', text, collapsed: false })),
    hashtags: [], context: '', createdAt: 1, updatedAt: 1, ...extra,
}]);
const storage = (sections, extra) => ({ 'lh:schema': '2', 'lh:songs': songOf(sections, extra), 'lh:activeSong': 's1', leftPanelCollapsed: 'false', rightPanelCollapsed: 'false' });
const items = page => page.locator('#aiRef .ai-ref-item');

test('AI 參考：空的歌顯示提示，有內容時列出標籤、情境、歌詞', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: storage(['']) });
    await expect(page.locator('#aiRef')).toHaveClass(/is-empty/);
    await expect(page.locator('#aiRef')).toContainText('先寫幾句歌詞或加標籤');
    // 打歌詞 → 歌詞 2 行
    await page.locator('#lyricsSections .section-textarea').first().fill('第一句\n\n第二句');
    await expect(items(page)).toHaveText(['歌詞 2 行']);
    // 加標籤、寫情境
    await page.locator('#hashtagInput').fill('夏天、海');
    await page.locator('#hashtagInput').press('Enter');
    await page.locator('#contextDescription').fill('海邊散步');
    await expect(items(page)).toHaveText(['#夏天 #海', '情境', '歌詞 2 行']);   // 一行放得下就列出標籤
    await expect(page.locator('#aiRef')).not.toHaveClass(/is-empty/);
    expect(errors).toEqual([]);
    await context.close();
});

test('AI 參考：預設有標籤或情境時歌詞先關著（送整首，不再截 200 字）', async ({ browser }) => {
    const long = '一二三四五六七八九十'.repeat(30);   // 300 字
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: storage([long], { hashtags: ['夜'] }) });
    await expect(items(page)).toHaveText(['#夜', '歌詞 1 行']);
    await expect(page.locator('#aiRef [data-ref="tags"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#aiRef [data-ref="lyrics"]')).toHaveAttribute('aria-pressed', 'false');
    expect(errors).toEqual([]);
    await context.close();
});

test('AI 參考：三樣都是開關，點了切換、不跳走', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: { ...storage(['你好'], { context: '情境', hashtags: ['a'] }), leftPanelCollapsed: 'true' } });
    const ctx = page.locator('#aiRef .ai-ref-item[data-ref="context"]');
    await expect(ctx).toHaveAttribute('aria-pressed', 'true');
    await ctx.click();
    await expect(ctx).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#leftPanel')).toHaveClass(/collapsed/);
    const ly = page.locator('#aiRef .ai-ref-item[data-ref="lyrics"]');
    await ly.click();
    await expect(ly).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => [lhAiUseOn('context', lhAiRefState()), lhAiUseOn('lyrics', lhAiRefState())])).toEqual([false, true]);
    expect(errors).toEqual([]);
    await context.close();
});

test('AI 參考：手機上也能點開關（沒有標籤情境時歌詞預設開）', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: storage(['你好']), device: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } });
    await page.evaluate(() => mobileTab('ai'));
    const ly = page.locator('#aiRef .ai-ref-item[data-ref="lyrics"]');
    await expect(ly).toHaveAttribute('aria-pressed', 'true');
    await ly.tap();
    await expect(ly).toHaveAttribute('aria-pressed', 'false');
    expect(errors).toEqual([]);
    await context.close();
});

test('AI 參考：標籤一行放不下就省略成「…共 n 項標籤」', async ({ browser }) => {
    const tags = Array.from({ length: 12 }, (_, i) => '很長的標籤名稱' + i);
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: storage(['一句'], { hashtags: tags }) });
    const t = page.locator('#aiRef [data-ref="tags"]');
    await expect(t).toHaveText(/…共 12 項標籤$|^12 項標籤$/);
    const one = await page.locator('#aiRef').evaluate(bar => { const f = bar.firstElementChild.getBoundingClientRect(); return [...bar.children].every(c => c.getBoundingClientRect().top < f.bottom); });
    expect(one, '整列只有一行').toBe(true);
    expect(errors).toEqual([]);
    await context.close();
});

test('AI 候選池：換押母音／押子音就清空（跳樓：押母音的詞不能混進押子音）', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: storage(['一句']) });
    const r = await page.evaluate(() => {
        cumulativeCandidates = ['巧手', '透露']; suggestedPool.add('透露'); sentCandidatesSet.add('巧手');
        setRhymeMode('initial');
        const a = [cumulativeCandidates.length, suggestedPool.size, sentCandidatesSet.size];
        cumulativeCandidates = ['x'];
        setRhymeMode('initial');   // 同一個模式再按一次：不清
        return [...a, cumulativeCandidates.length];
    });
    expect(r).toEqual([0, 0, 0, 1]);
    await page.evaluate(() => setRhymeMode('rhyme'));
    expect(errors).toEqual([]);
    await context.close();
});
