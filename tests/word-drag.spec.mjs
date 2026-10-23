// 詞卡／字卡拖進歌詞（第 9 階段 09-09，AI-06）：滑鼠、長按、取消、手機分頁、折疊段落、游標索引
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage, activeSongRaw } from './helpers.mjs';
import { DEVICES } from './layout-lib.mjs';
import { centerOf, mouseDrag, caretOracle } from './drag-lib.mjs';

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/v096-localStorage.json', import.meta.url), 'utf8'));
const v2Storage = (songs, extra = {}) => ({ ...FIXTURE, 'lh:schema': '2', 'lh:songs': JSON.stringify(songs), 'lh:activeSong': songs[0].id, leftPanelCollapsed: 'false', rightPanelCollapsed: 'false', ...extra });
const typed = (id, type, text, extra = {}) => ({ id, type, custom: '', color: '', height: null, label: '', text, collapsed: false, ...extra });
const song = (sections, extra = {}) => ({ id: 's1', title: '測試歌', sections, hashtags: [], context: '', createdAt: 1, updatedAt: 1, ...extra });
const ONE = (text = '春天來了') => v2Storage([song([typed('sa', 'verse', text)])]);
const ta = (page, n = 0) => page.locator('#lyricsSections .section-textarea').nth(n);
// 直接把詞卡塞進 AI 面板（layout.spec 的做法）
const putCards = (page, words) => page.evaluate(ws => { document.getElementById('aiWordsContainer').innerHTML = ws.map(w => aiWordCardHtml(w, false)).join(''); }, words);
const card = (page, n = 0) => page.locator('#aiWordsContainer .ai-word-card').nth(n);
// 殘影、插入線、提示、外框、來源 class 都清乾淨
const noTrace = page => page.evaluate(() => ({
    ghost: document.querySelectorAll('.word-drag-ghost').length,
    caret: document.querySelectorAll('.drop-caret').length,
    hint: document.querySelectorAll('.drag-hint').length,
    target: document.querySelectorAll('.drop-target').length,
    source: document.querySelectorAll('.word-drag-source').length,
    dwell: document.querySelectorAll('.lyrics-section.dwell').length,
}));
const CLEAN = { ghost: 0, caret: 0, hint: 0, target: 0, source: 0, dwell: 0 };

// 找一個點，真的點下去 selectionStart 等於 idx（取符合範圍的中間）；掃第一行
async function pointForIndex(page, textarea, idx) {
    const b = await textarea.boundingBox();
    const y = b.y + 22;
    const hits = [];
    for (let x = b.x + 8; x < b.x + b.width - 8; x += 2) {
        if (await caretOracle(page, textarea, x, y) === idx) hits.push(x);
        else if (hits.length) break;
    }
    expect(hits.length, '要掃得到索引 ' + idx).toBeGreaterThan(0);
    await textarea.evaluate(el => el.blur());
    return [hits[Math.floor(hits.length / 2)], y];
}

test('拖詞：滑鼠拖進指定位置', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: ONE() });
    await putCards(page, ['花開']);
    const to = await pointForIndex(page, ta(page), 2);
    await mouseDrag(page, await centerOf(card(page)), to);
    await expect(ta(page)).toHaveValue('春天花開來了');
    expect((await activeSongRaw(page)).sections[0].text).toBe('春天花開來了');   // 不 flush：插入本身要存檔
    expect(await page.evaluate(() => [document.activeElement.className, document.activeElement.selectionStart, document.activeElement.selectionEnd])).toEqual(['section-textarea', 4, 4]);
    await expect(page.locator('#lhLive')).toHaveText('已插入「花開」到Verse');
    expect(await noTrace(page)).toEqual(CLEAN);
    await page.locator('#undoBtn').click();
    await expect(ta(page)).toHaveValue('春天來了');
    expect(errors).toEqual([]);
    await context.close();
});

test('拖詞：點擊不插入', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: ONE() });
    await putCards(page, ['花開']);
    await card(page).click();
    await expect.poll(() => page.evaluate(() => JSON.stringify(savedWords))).toContain('花開');
    await expect(ta(page)).toHaveValue('春天來了');
    expect(await activeSongRaw(page).then(s => s.sections[0].text)).toBe('春天來了');
    expect(errors).toEqual([]);
    await context.close();
});
