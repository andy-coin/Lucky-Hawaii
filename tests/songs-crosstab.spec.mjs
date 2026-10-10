// 多個分頁同時開著：別頁存了歌詞，這頁在沒打字時重新載入並提示；打字中絕不重畫
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openTwoTabs } from './helpers.mjs';

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/v096-localStorage.json', import.meta.url), 'utf8'));
const toastShown = page => page.evaluate(() => {
    const t = document.getElementById('copyToast');
    return t && t.classList.contains('show') ? t.textContent : null;
});

test('多分頁：另一頁改了歌詞，這頁重新載入並提示', async ({ browser }) => {
    const { context, pages: [a, b], errs } = await openTwoTabs(browser, FIXTURE);
    const taB = b.locator('#lyricsSections .section-textarea').first();
    const before = await taB.inputValue();
    await taB.focus();
    const caret = await taB.evaluate(t => t.selectionStart);
    await a.locator('#lyricsSections .section-textarea').first().fill('A頁新寫的歌詞');
    await a.locator('#lyricsSections .section-textarea').first().blur();
    await b.waitForTimeout(500);
    expect(await taB.inputValue(), 'B 正在編輯，不重畫').toBe(before);
    expect(await taB.evaluate(t => t.selectionStart)).toBe(caret);
    expect(await toastShown(b), 'B 還沒有提示').toBeNull();
    await b.locator('#searchInput').focus();
    await expect(taB).toHaveValue('A頁新寫的歌詞');
    expect(await toastShown(b)).toBe('其他分頁更新了歌詞，已重新載入');
    expect(await toastShown(a), '寫的那頁不提示').toBeNull();
    expect(errs.flatMap(e => e.errors)).toEqual([]);
    await context.close();
});
