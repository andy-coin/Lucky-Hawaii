// 自訂詞彙（js/custom-words.js，0.98.05）：新增、猜讀音、詞卡索引、只在這首歌、改讀音驗證、存檔
import { test, expect } from '@playwright/test';
import { bootPage } from './helpers.mjs';

test('自訂詞彙：新增後出現在詞卡（標「自訂」）、只在這首歌的換歌就不見、讀音格式不對不收', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: { 'lh:tourSeen': '1' } });
    const r = await page.evaluate(() => {
        const ok = lhCwAdd('安達', 'g');
        const z = lhCustomWords[0] && lhCustomWords[0].z;
        const dup = lhCwAdd('安達', 'g');
        const bad = lhCwAdd('A', 'g');
        lhCwAdd('案發', 'song');
        const mine = lhCwActive().map(e => e.w).sort().join(',');
        const sid = activeSongId;
        activeSongId = 'zz-other';
        const other = lhCwActive().map(e => e.w).join(',');
        activeSongId = sid;
        return { ok, z, dup, bad, mine, other, stored: JSON.parse(localStorage.getItem('lh:customWords')).length };
    });
    expect(r.ok).toBe(true);
    expect(r.z.split(' ')).toHaveLength(2);
    expect([r.dup, r.bad]).toEqual([false, false]);
    expect(r.mine).toBe('安達,案發');
    expect(r.other).toBe('安達');          // 只在這首歌的那個，換歌就不顯示
    expect(r.stored).toBe(2);
    // 詞卡：查「安打」，自訂詞排最前面、有「自訂」標記
    await page.fill('#searchInput', '安打');
    await expect(page.locator('.ws-card.ws-custom[data-char="安達"]')).toBeVisible();
    // 設定清單：改讀音格式不對會還原
    const row = page.locator('#cwList .cw-row').filter({ hasText: '安達' });
    await expect(row).toHaveCount(1);
    const z = row.locator('.cw-z');
    const before = await z.inputValue();
    await z.evaluate(el => { el.value = 'ㄢ'; el.dispatchEvent(new Event('change')); });
    await expect(z).toHaveValue(before);
    expect(errors).toEqual([]);
    await context.close();
});
