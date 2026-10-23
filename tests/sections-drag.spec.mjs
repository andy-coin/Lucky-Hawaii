// 段落排序（第 9 階段 09-06，EDIT-02）：⋮⋮ 把手、滑鼠／手指／鍵盤、取消、自動捲動
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage, activeSongRaw } from './helpers.mjs';
import { DEVICES, waitStill } from './layout-lib.mjs';
import { centerOf, mouseDrag, touchSession } from './drag-lib.mjs';

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/v096-localStorage.json', import.meta.url), 'utf8'));
const v2Storage = songs => ({ ...FIXTURE, 'lh:schema': '2', 'lh:songs': JSON.stringify(songs), 'lh:activeSong': songs[0].id });
const typed = (id, type, text, extra = {}) => ({ id, type, custom: '', color: '', height: null, label: '', text, collapsed: false, ...extra });
const song = (sections, extra = {}) => ({ id: 's1', title: '測試歌', sections, hashtags: [], context: '', createdAt: 1, updatedAt: 1, ...extra });
const ABC = () => v2Storage([song([typed('sa', 'verse', 'A'), typed('sb', 'chorus', 'B'), typed('sc', 'verse', 'C')])]);
const ids = page => page.locator('#lyricsSections .lyrics-section').evaluateAll(els => els.map(e => e.dataset.id));
const labels = page => page.locator('#lyricsSections .section-type').evaluateAll(els => els.map(e => e.textContent));
const handle = (page, n) => page.locator('#lyricsSections .lyrics-section').nth(n).locator('.section-handle');
const undoDisabled = page => page.locator('#undoBtn').getAttribute('aria-disabled');
const noTrace = page => page.evaluate(() => ({
    ghost: document.querySelectorAll('.section-drag-ghost').length,
    line: document.querySelectorAll('.section-drop-line').length,
    dragging: document.querySelectorAll('.lyrics-section.dragging').length,
    body: document.body.classList.contains('is-section-dragging'),
}));
const CLEAN = { ghost: 0, line: 0, dragging: 0, body: false };

// 第 n 段上緣略往上（落在前一段的下半或最上面之外）
async function aboveSection(page, n, dy = 0.25) {
    const b = await page.locator('#lyricsSections .lyrics-section').nth(n).boundingBox();
    return [b.x + b.width / 2, b.y + b.height * dy];
}

test('排序：滑鼠拖把手', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: ABC() });
    expect(await ids(page)).toEqual(['sa', 'sb', 'sc']);
    await mouseDrag(page, await centerOf(handle(page, 2)), await aboveSection(page, 0));
    expect(await ids(page)).toEqual(['sc', 'sa', 'sb']);
    expect(await labels(page)).toEqual(['Verse I', 'Verse II', 'Chorus']);
    const raw = await activeSongRaw(page);   // 不 flush：移動本身要存檔
    expect(raw.sections.map(s => s.id)).toEqual(['sc', 'sa', 'sb']);
    expect(raw.sections.map(s => s.label)).toEqual(['Verse I', 'Verse II', 'Chorus']);
    await expect(page.locator('#lhLive')).toHaveText('Verse I 已移到第 1 段，共 3 段');
    expect(await noTrace(page)).toEqual(CLEAN);
    await page.locator('#undoBtn').click();
    expect(await ids(page)).toEqual(['sa', 'sb', 'sc']);
    expect(errors).toEqual([]);
    await context.close();
});
