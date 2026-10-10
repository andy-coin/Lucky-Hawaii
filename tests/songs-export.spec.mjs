// 匯出（EDIT-08）：TXT、Markdown、PDF 列印頁、複製整首、選單、版面
import { test, expect } from '@playwright/test';
import { bootPage } from './helpers.mjs';

const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const mkSong = (id, title, sections, o = {}) => ({
    id, title, createdAt: o.createdAt ?? 1000, updatedAt: 1000,
    sections: sections.map((s, i) => ({ id: `sec-${id}-${i}`, label: s[0], text: s[1], collapsed: false })),
    hashtags: o.hashtags ?? [], context: o.context ?? '',
});
// 已經是第 2 版資料的使用者：直接帶 lh:songs，左側面板預設展開
const seed = (songs, extra = {}) => ({
    'lh:schema': '2', 'lh:songs': JSON.stringify(songs), 'lh:activeSong': songs[0].id,
    leftPanelCollapsed: 'false', rightPanelCollapsed: 'true', ...extra,
});
const FIXTURE_SONG = () => mkSong('song-x', '我的/歌:1', [
    ['主歌', '第一句\n第二句'],
    ['', ''],
    ['', '#開頭\n1. 數字'],
]);
const TXT_EXPECTED = '我的/歌:1\n\n[主歌]\n第一句\n第二句\n\n[段落 2]\n#開頭\n1. 數字\n';
const MD_EXPECTED = '# 我的/歌:1\n\n## 主歌\n\n第一句  \n第二句\n\n## 段落 2\n\n\\#開頭  \n\\1. 數字\n';
const toastText = page => page.locator('#copyToast').textContent();
const openMenu = async page => { await page.locator('#exportToggle').click(); await expect(page.locator('#exportMenu')).toBeVisible(); };
const pickItem = (page, label) => page.locator('#exportMenu .export-item', { hasText: label });
// 讀下載檔的原始位元組（UTF-8、無 BOM 都要驗）
async function readDownload(dl) {
    const stream = await dl.createReadStream();
    const chunks = [];
    for await (const c of stream) chunks.push(c);
    return Buffer.concat(chunks);
}

test('匯出：下載 TXT', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: seed([FIXTURE_SONG()]), device: DESKTOP });
    await openMenu(page);
    const [dl] = await Promise.all([page.waitForEvent('download'), pickItem(page, 'TXT').click()]);
    expect(dl.suggestedFilename()).toBe('我的_歌_1.txt');
    const bytes = await readDownload(dl);
    expect(bytes.subarray(0, 3).toString('hex'), '不可有 BOM').not.toBe('efbbbf');
    expect(bytes.toString('utf8')).toBe(TXT_EXPECTED);
    await expect(page.locator('#copyToast')).toHaveText('已匯出「我的_歌_1.txt」');
    await expect(page.locator('#exportMenu')).toBeHidden();
    expect(errors).toEqual([]);
    await context.close();
});
