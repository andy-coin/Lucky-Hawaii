// 段落模組（第 9 階段）的瀏覽器測試：名稱、類型、編號。後續計畫會在這個檔加顏色、拖曳、高度、復原。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage, activeSongRaw } from './helpers.mjs';

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/v096-localStorage.json', import.meta.url), 'utf8'));
const labels = page => page.locator('#lyricsSections .section-type').evaluateAll(els => els.map(e => e.textContent));
// 已經是資料版本 2 的設定檔：直接放一份 lh:songs
const v2Storage = (songs, active = songs[0]?.id) => ({
    ...FIXTURE, 'lh:schema': '2', 'lh:songs': JSON.stringify(songs), ...(active ? { 'lh:activeSong': active } : {}),
});
const song = (id, sections, extra = {}) => ({
    id, title: '測試歌', sections, hashtags: [], context: '', createdAt: 1, updatedAt: 1, ...extra,
});
const sec = (id, text, label = '', collapsed = false) => ({ id, label, text, collapsed });

test('名稱：舊歌顯示結構化名稱', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: FIXTURE });
    await expect(page.locator('#lyricsSections .lyrics-section')).toHaveCount(3);
    expect(await labels(page)).toEqual(['Verse', 'Chorus', 'Bridge']);
    // 記憶體裡的模型：每段都有完整的新欄位，label 等於畫面上的名稱
    const model = await page.evaluate(() => curSong().sections.map(s => ({ type: s.type, custom: s.custom, color: s.color, height: s.height, label: s.label })));
    expect(model).toEqual([
        { type: 'verse', custom: '', color: '', height: null, label: 'Verse' },
        { type: 'chorus', custom: '', color: '', height: null, label: 'Chorus' },
        { type: 'bridge', custom: '', color: '', height: null, label: 'Bridge' },
    ]);
    expect(errors).toEqual([]);
    await context.close();
});

test('名稱：新歌第一段是 Verse', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: FIXTURE });
    await page.evaluate(() => createSong());
    await expect(page.locator('#lyricsSections .lyrics-section')).toHaveCount(1);
    expect(await labels(page)).toEqual(['Verse']);
    expect(await page.evaluate(() => curSong().sections[0].type)).toBe('verse');
    expect(errors).toEqual([]);
    await context.close();
});

test('名稱：新增段落猜下一段', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        storage: v2Storage([song('s1', [{ id: 'sa', type: 'verse', custom: '', color: '', height: null, label: 'Verse', text: '一', collapsed: false }])]),
    });
    expect(await labels(page)).toEqual(['Verse']);
    for (let i = 0; i < 3; i++) await page.locator('.panel-add-btn').first().click();
    // Verse → Pre-Chorus → Chorus → Verse：第四段出現後，第一段與最後一段都變成有編號的 Verse
    expect(await labels(page)).toEqual(['Verse I', 'Pre-Chorus', 'Chorus', 'Verse II']);
    await expect.poll(async () => (await activeSongRaw(page)).sections.map(s => s.label)).toEqual(['Verse I', 'Pre-Chorus', 'Chorus', 'Verse II']);
    expect((await activeSongRaw(page)).sections.map(s => s.type)).toEqual(['verse', 'prechorus', 'chorus', 'verse']);
    expect(errors).toEqual([]);
    await context.close();
});

test('名稱：讀取不寫回', async ({ browser }) => {
    // 第 8 階段存下來的設定檔：沒有 type，label 是中文。開機只在記憶體整理名稱，不能改寫儲存的原文（A2 延遲正規化）
    const seeded = JSON.stringify([song('s1', [sec('sa', '一', '主歌'), sec('sb', '二', '副歌')])]);
    const { context, page, errors } = await bootPage(browser, {
        storage: { ...FIXTURE, 'lh:schema': '2', 'lh:songs': seeded, 'lh:activeSong': 's1' },
    });
    expect(await labels(page)).toEqual(['Verse', 'Chorus']);
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => localStorage.getItem('lh:songs'))).toBe(seeded);
    expect(await page.evaluate(() => localStorage.getItem('lh:schema'))).toBe('2');
    expect(errors).toEqual([]);
    await context.close();
});

// 已有 type 的段落（循環測試不依賴舊 label 推斷）
const typed = (id, type, text, extra = {}) => ({ id, type, custom: '', color: '', height: null, label: '', text, collapsed: false, ...extra });

test('循環：點一下換下一種類型', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        storage: v2Storage([song('s1', [typed('sa', 'verse', '一'), typed('sb', 'verse', '二'), typed('sc', 'chorus', '三')])]),
    });
    expect(await labels(page)).toEqual(['Verse I', 'Verse II', 'Chorus']);
    // 第二段從 Verse 起轉一圈：Pre-Chorus → Chorus → Inter → Bridge → Outro → Custom → Intro → Verse（共 8 下回到原點）
    const STEPS = [
        ['prechorus', ['Verse', 'Pre-Chorus', 'Chorus']],
        ['chorus', ['Verse', 'Chorus I', 'Chorus II']],
        ['inter', ['Verse', 'Inter', 'Chorus']],
        ['bridge', ['Verse', 'Bridge', 'Chorus']],
        ['outro', ['Verse', 'Outro', 'Chorus']],
        ['custom', ['Verse', 'Custom', 'Chorus']],
        ['intro', ['Verse', 'Intro', 'Chorus']],
        ['verse', ['Verse I', 'Verse II', 'Chorus']],
    ];
    for (const [type, names] of STEPS) {
        await page.locator('#lyricsSections .section-type').nth(1).click();
        expect(await labels(page)).toEqual(names);
        // 不手動 flush：點一下就已經存好
        const raw = await activeSongRaw(page);
        expect(raw.sections.map(s => s.label)).toEqual(names);
        expect(raw.sections[1].type).toBe(type);
        expect(await page.locator('#lyricsSections .section-type').nth(1).getAttribute('title')).toBe(names[1]);
    }
    await page.locator('#lyricsSections .section-type').nth(1).click();   // 停在 Pre-Chorus 再重新整理
    await page.reload();
    await expect(page.locator('#lyricsSections .lyrics-section')).toHaveCount(3);
    expect(await labels(page)).toEqual(['Verse', 'Pre-Chorus', 'Chorus']);
    expect(errors).toEqual([]);
    await context.close();
});

test('循環：原地更新', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        storage: v2Storage([song('s1', [typed('sa', 'verse', '第一行\n'.repeat(60)), typed('sb', 'verse', '二'), typed('sc', 'chorus', '三')])]),
    });
    const ta = page.locator('.section-textarea').first();
    const before = await ta.evaluate(el => {
        el.focus();
        el.setSelectionRange(3, 3);
        el.scrollTop = 40;
        window.__keep = { secs: [...document.querySelectorAll('.lyrics-section')], btn: document.querySelectorAll('.section-type')[1], ta: el };
        return { value: el.value, caret: el.selectionStart, scroll: el.scrollTop };
    });
    expect(before.scroll).toBeGreaterThan(0);
    const btn = page.locator('#lyricsSections .section-type').nth(1);
    await btn.focus();
    for (let i = 0; i < 3; i++) {
        await page.keyboard.press('Enter');
        expect(await page.evaluate(() => document.activeElement === window.__keep.btn), '按鈕仍有焦點').toBe(true);
    }
    const after = await page.evaluate(() => {
        const k = window.__keep;
        return {
            sameSecs: [...document.querySelectorAll('.lyrics-section')].every((e, i) => e === k.secs[i]) && k.secs.length === document.querySelectorAll('.lyrics-section').length,
            sameBtn: document.querySelectorAll('.section-type')[1] === k.btn,
            sameTa: document.querySelector('.section-textarea') === k.ta,
            value: k.ta.value, caret: k.ta.selectionStart, scroll: k.ta.scrollTop,
        };
    });
    expect(after).toEqual({ sameSecs: true, sameBtn: true, sameTa: true, value: before.value, caret: 3, scroll: before.scroll });
    expect(await labels(page)).toEqual(['Verse', 'Inter', 'Chorus']);
    expect(errors).toEqual([]);
    await context.close();
});
