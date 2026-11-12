// 段落模組（第 9 階段）的瀏覽器測試：名稱、類型、編號。後續計畫會在這個檔加顏色、拖曳、高度、復原。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage, activeSongRaw, compose } from './helpers.mjs';
import { DEVICES, setScale, waitStill, rectsOverlap, expectReallyClickable, meetsInputFloor, emulateKeyboard, restoreViewport, readKeyboard, insideVisible, hitMin } from './layout-lib.mjs';
import { centerOf, touchSession } from './drag-lib.mjs';

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
    for (let i = 0; i < 3; i++) await page.locator('.section-add-btn').click();
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

// 手機、平板要先把歌詞 sheet 打開；電腦的左面板本來就開著
const openLyrics = async page => {
    const tab = page.locator('#mtab-lyrics');
    if (await tab.isVisible()) { await tab.tap(); await waitStill(page); }
};

test('循環：新增段落的焦點', async ({ browser }) => {
    for (const [name, device, hasFocus] of [['電腦', DEVICES.desktop, true], ['手機', DEVICES.phone, false]]) {
        const { context, page, errors } = await bootPage(browser, {
            device, storage: v2Storage([song('s1', [typed('sa', 'verse', '一')])]),
        });
        await openLyrics(page);
        const add = page.locator('.section-add-btn');
        if (hasFocus) await add.click(); else await add.tap();
        await expect(page.locator('#lyricsSections .lyrics-section')).toHaveCount(2);
        const active = await page.evaluate(() => {
            const a = document.activeElement, sec = a && a.closest && a.closest('.lyrics-section');
            return { isTa: !!a && a.classList.contains('section-textarea'), idx: sec ? sec.dataset.index : null };
        });
        if (hasFocus) {
            expect(active, `${name}：焦點在新段落的輸入框`).toEqual({ isTa: true, idx: '1' });
            const inside = await page.evaluate(() => {
                const r = document.querySelectorAll('.lyrics-section')[1].getBoundingClientRect(), box = document.getElementById('lyricsSections').getBoundingClientRect();
                return r.bottom > box.top && r.top < box.bottom;
            });
            expect(inside, `${name}：新段落在可見範圍內`).toBe(true);
        } else {
            expect(active.isTa, `${name}：觸控不聚焦`).toBe(false);
        }
        expect(errors).toEqual([]);
        await context.close();
    }
});

test('循環：標題列不擠不疊', async ({ browser }) => {
    const LONG = '很長很長的段落名稱'.repeat(5).slice(0, 40);
    expect(Array.from(LONG).length).toBe(40);
    const sections = [typed('sa', 'verse', '一'), typed('sb', 'custom', '二', { custom: LONG }), typed('sc', 'chorus', '三', { collapsed: true }), typed('sd', 'bridge', '四')];
    for (const [name, device] of [['手機', DEVICES.phone], ['平板', DEVICES.tablet], ['電腦', DEVICES.desktop]]) {
        for (const pct of [100, 150]) {
            const { context, page, errors } = await bootPage(browser, { device, storage: v2Storage([song('s1', sections)]) });
            await setScale(page, pct);
            await openLyrics(page);
            await waitStill(page);   // 縮放後段落的 flex 有過渡動畫，等它停了再量
            const rows = await page.evaluate(() => [...document.querySelectorAll('#lyricsSections .lyrics-section')].map(sec => {
                const box = e => { if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
                const t = sec.querySelector('.section-type');
                return {
                    sec: box(sec), handle: box(sec.querySelector('.section-handle')), chev: box(sec.querySelector('.section-chevron')), type: box(t),
                    cnt: box(sec.querySelector('.section-count')), rm: box(sec.querySelector('.section-remove')),
                    over: t.scrollWidth > t.clientWidth, title: t.title, text: t.textContent,
                };
            }));
            for (const [i, r] of rows.entries()) {
                const tag = `${name} ${pct}% 第 ${i + 1} 段`;
                const parts = [r.handle, r.chev, r.type, r.cnt, r.rm].filter(Boolean);
                for (const p of parts) {
                    expect(p.x, `${tag}：左邊超出段落`).toBeGreaterThanOrEqual(r.sec.x - 1);
                    expect(p.x + p.width, `${tag}：右邊超出段落`).toBeLessThanOrEqual(r.sec.x + r.sec.width + 1);
                    expect(p.y, `${tag}：上邊超出段落`).toBeGreaterThanOrEqual(r.sec.y - 1);
                    expect(p.y + p.height, `${tag}：下邊超出段落`).toBeLessThanOrEqual(r.sec.y + r.sec.height + 1);
                    expect(Math.abs(p.y + p.height / 2 - (parts[0].y + parts[0].height / 2)), `${tag}：不在同一行`).toBeLessThanOrEqual(2);
                }
                for (let a = 0; a < parts.length; a++) for (let b = a + 1; b < parts.length; b++) {
                    expect(rectsOverlap(parts[a], parts[b]), `${tag}：第 ${a} 與第 ${b} 個重疊`).toBe(false);
                }
            }
            // 平板的 sheet 夠寬，100% 時 40 個字放得下；窄的（手機、電腦左面板）一定要用 … 收尾
            if (name !== '平板') expect(rows[1].over, `${name} ${pct}%：長名稱用 … 收尾`).toBe(true);
            expect(rows[1].title).toBe(LONG);
            expect(errors).toEqual([]);
            await context.close();
        }
    }
});

test('循環：名稱只當純文字', async ({ browser }) => {
    const NAME = '<img src=x onerror=alert(1)>';
    const { context, page, errors } = await bootPage(browser, {
        storage: v2Storage([song('s1', [typed('sa', 'custom', '一', { custom: NAME })])]),
    });
    await expect(page.locator('#lyricsSections .section-type')).toHaveText(NAME);
    expect(await page.locator('#lyricsSections .section-type').first().textContent()).toBe(NAME);
    expect(await page.locator('#lyricsSections img').count()).toBe(0);
    // 換類型再換回來走的是同一條更新路徑，也不能把名字當 HTML
    for (let i = 0; i < 8; i++) await page.locator('#lyricsSections .section-type').first().click();
    expect(await page.locator('#lyricsSections .section-type').first().textContent()).toBe(NAME);
    expect(await page.locator('#lyricsSections img').count()).toBe(0);
    expect(await page.evaluate(() => window.__pwn)).toBeUndefined();
    expect(await page.locator('#lyricsSections [onclick], #lyricsSections [onkeydown]').count(), '標題列沒有行內事件').toBe(0);
    expect(errors).toEqual([]);
    await context.close();
});

test('字數：打字即時更新', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        storage: v2Storage([
            song('s1', [typed('sa', 'verse', '你好'), typed('sb', 'chorus', '')]),
            song('s2', [typed('sc', 'verse', '一二三四五')], { title: '另一首' }),
        ]),
    });
    const counts = () => page.locator('#lyricsSections .section-count').evaluateAll(els => els.map(e => e.textContent));
    const total = () => page.locator('#songTotal').textContent();
    expect(await counts()).toEqual(['2 字', '0 字']);
    expect(await total()).toBe('共 2 字');
    // 打字：只重算這一段，總數是各段相加
    await page.locator('.section-textarea').nth(1).click();
    await page.keyboard.type('Hello 123');
    expect(await counts()).toEqual(['2 字', '2 字']);
    expect(await total()).toBe('共 4 字');
    for (let i = 0; i < 9; i++) await page.keyboard.press('Backspace');
    expect(await counts()).toEqual(['2 字', '0 字']);
    expect(await total()).toBe('共 2 字');
    // 換歌：總數換成那首歌的
    await page.evaluate(() => switchSong('s2'));
    expect(await counts()).toEqual(['5 字']);
    expect(await total()).toBe('共 5 字');
    expect(errors).toEqual([]);
    await context.close();
});

// 打字與組字不增減畫面節點（只改 Text node 的 .data）
// 鏡像層只是裝飾用的副本，這裡不看它；輸入框與面板結構仍然全部監看
const watchLeft = page => page.evaluate(() => {
    window.__muts = [];
    window.__mo = new MutationObserver(list => { window.__muts.push(...list.filter(m => m.type === 'childList' && !(m.target.closest && m.target.closest('.rhyme-mirror')))); });
    window.__mo.observe(document.getElementById('leftPanel'), { childList: true, subtree: true });
});
const takeMutCount = page => page.evaluate(() => { window.__muts.push(...window.__mo.takeRecords()); return window.__muts.length; });
const countTexts = page => page.evaluate(() => ({
    sec: [...document.querySelectorAll('#lyricsSections .section-count')].map(e => e.textContent),
    total: document.getElementById('songTotal').textContent,
}));

test('字數：組字中不變、確認後才變', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        storage: v2Storage([song('s1', [typed('sa', 'verse', '你好'), typed('sb', 'chorus', '')])]),
    });
    await page.evaluate(() => {
        const ta = document.querySelector('.section-textarea');
        ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
    });
    await watchLeft(page);
    const before = await countTexts(page);
    expect(before).toEqual({ sec: ['2 字', '0 字'], total: '共 2 字' });
    await compose(page, ['ㄋ', 'ㄋㄧ', 'ㄋㄧˇ'], '你', async () => {
        expect(await countTexts(page), '組字中數字不動').toEqual(before);
    });
    await expect(page.locator('#songTotal')).toHaveText('共 3 字');
    expect((await countTexts(page)).sec).toEqual(['3 字', '0 字']);
    // 一般打字：即時變，而且不增減任何節點
    await page.keyboard.type('abc');
    expect((await countTexts(page)).sec).toEqual(['4 字', '0 字']);
    await page.waitForTimeout(500);
    expect(await takeMutCount(page), '沒有任何節點增減').toBe(0);
    // 文字框從頭到尾是同一個，也沒被計數寫過（內容就是打的字）
    expect(await page.locator('.section-textarea').first().inputValue()).toBe('你好你abc');
    expect(errors).toEqual([]);
    await context.close();
});

test('字數：排序收合換類型不影響總數', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        storage: v2Storage([song('s1', [typed('sa', 'verse', '你好'), typed('sb', 'chorus', 'Hello 123'), typed('sc', 'bridge', '一二三')])]),
    });
    await expect(page.locator('#songTotal')).toHaveText('共 7 字');
    await page.locator('#lyricsSections .section-chevron').nth(1).click();   // 收合（標題列左緣現在是 ⋮⋮ 把手，點它不收合）
    await expect(page.locator('#lyricsSections .lyrics-section').nth(1)).toHaveClass(/collapsed/);
    expect((await countTexts(page)).total).toBe('共 7 字');
    for (let i = 0; i < 3; i++) await page.locator('#lyricsSections .section-type').nth(2).click();   // 換類型
    expect((await countTexts(page))).toEqual({ sec: ['2 字', '2 字', '3 字'], total: '共 7 字' });
    // 排序（模型移動後重畫；拖曳本身在 09-06）：每段字數跟著段落走，總數不變
    await page.evaluate(() => { const s = curSong(); s.sections.push(s.sections.shift()); renderLyricsSections(); });
    expect((await countTexts(page))).toEqual({ sec: ['2 字', '3 字', '2 字'], total: '共 7 字' });
    expect(errors).toEqual([]);
    await context.close();
});

test('字數：全部是空段落顯示共 0 字', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        storage: v2Storage([song('s1', [typed('sa', 'verse', ''), typed('sb', 'chorus', '  \n，，。。')])]),
    });
    expect(await countTexts(page)).toEqual({ sec: ['0 字', '0 字'], total: '共 0 字' });
    expect(errors).toEqual([]);
    await context.close();
});

test('字數：150% 長名稱與大字數不擠', async ({ browser }) => {
    const BIG = '字'.repeat(999);
    const sections = [typed('sa', 'prechorus', BIG), typed('sb', 'prechorus', BIG), typed('sc', 'prechorus', BIG)];
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.phone, storage: v2Storage([song('s1', sections)]) });
    await setScale(page, 150);
    await openLyrics(page);
    await waitStill(page);
    expect(await labels(page)).toEqual(['Pre-Chorus I', 'Pre-Chorus II', 'Pre-Chorus III']);
    const rows = await page.evaluate(() => [...document.querySelectorAll('#lyricsSections .lyrics-section')].map(sec => {
        const box = e => { if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
        const t = sec.querySelector('.section-type');
        return {
            sec: box(sec), handle: box(sec.querySelector('.section-handle')), chev: box(sec.querySelector('.section-chevron')), type: box(t), cnt: box(sec.querySelector('.section-count')),
            rm: box(sec.querySelector('.section-remove')), text: sec.querySelector('.section-count').textContent,
            // 不縮的元素：看它的寬度是不是自然寬度（scrollWidth 不超過 clientWidth）
            cntFits: sec.querySelector('.section-count').scrollWidth <= sec.querySelector('.section-count').clientWidth,
        };
    }));
    for (const [i, r] of rows.entries()) {
        const tag = `手機 150% 第 ${i + 1} 段`;
        expect(r.text).toBe('999 字');
        expect(r.cntFits, `${tag}：字數沒被截`).toBe(true);
        const parts = [r.handle, r.chev, r.type, r.cnt, r.rm].filter(Boolean);
        for (const p of parts) {
            expect(p.x, `${tag}：左邊超出段落`).toBeGreaterThanOrEqual(r.sec.x - 1);
            expect(p.x + p.width, `${tag}：右邊超出段落`).toBeLessThanOrEqual(r.sec.x + r.sec.width + 1);
            expect(Math.abs(p.y + p.height / 2 - (parts[0].y + parts[0].height / 2)), `${tag}：不在同一行`).toBeLessThanOrEqual(2);
        }
        for (let a = 0; a < parts.length; a++) for (let b = a + 1; b < parts.length; b++) {
            expect(rectsOverlap(parts[a], parts[b]), `${tag}：第 ${a} 與第 ${b} 個重疊`).toBe(false);
        }
    }
    expect(errors).toEqual([]);
    await context.close();
});

// ===== 刪除（09-05）：不跳確認、下方出現「復原」 =====
test('刪除：直接刪、按復原救回', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        storage: v2Storage([song('s1', [typed('sa', 'verse', 'A'), typed('sb', 'chorus', 'B', { color: '#48a868' }), typed('sc', 'verse', 'C')])]),
    });
    const dialogs = [];
    page.on('dialog', d => dialogs.push(d.message()));
    await page.locator('.lyrics-section[data-index="1"] .section-remove').click();
    await expect(page.locator('#lyricsSections .lyrics-section')).toHaveCount(2);
    expect(await labels(page)).toEqual(['Verse I', 'Verse II']);
    expect((await activeSongRaw(page)).sections).toHaveLength(2);
    const toast = page.locator('#copyToast');
    await expect(toast).toHaveClass(/has-action/);
    await expect(toast).toContainText('已刪除「Chorus」');
    const undo = toast.locator('button.toast-action');
    await expect(undo).toHaveText('復原');
    expect(await undo.getAttribute('aria-label')).toBe('復原刪除「Chorus」');
    await undo.click();
    await expect(page.locator('#lyricsSections .lyrics-section')).toHaveCount(3);
    const back = await page.evaluate(() => curSong().sections.map(s => [s.id, s.type, s.text, s.color]));
    expect(back).toEqual([['sa', 'verse', 'A', ''], ['sb', 'chorus', 'B', '#48a868'], ['sc', 'verse', 'C', '']]);
    expect((await activeSongRaw(page)).sections.map(s => s.id)).toEqual(['sa', 'sb', 'sc']);
    expect(dialogs).toEqual([]);
    expect(errors).toEqual([]);
    await context.close();
});

const three = () => v2Storage([song('s1', [typed('sa', 'verse', 'A'), typed('sb', 'chorus', 'B', { color: '#48a868' }), typed('sc', 'verse', 'C')])]);
const secCount = page => page.locator('#lyricsSections .lyrics-section').count();

test('刪除：新動作讓復原鈕消失', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: three() });
    const action = page.locator('#copyToast .toast-action');
    const ids = () => page.evaluate(() => curSong().sections.map(s => s.id));
    const delMiddle = () => page.locator('.lyrics-section[data-index="1"] .section-remove').click();
    // 打字：在別的段落打一個字，是更新的一步，復原鈕立刻不見；↶ 兩下先撤打字、再救回被刪的段落
    await delMiddle();
    await expect(action).toHaveCount(1);
    await page.locator('.section-textarea').nth(1).click();
    await page.keyboard.press('x');
    await expect(action).toHaveCount(0);
    await expect(page.locator('#copyToast')).not.toHaveClass(/has-action/);
    await page.locator('#undoBtn').click();
    expect(await page.locator('.section-textarea').nth(1).inputValue()).toBe('C');
    await page.locator('#undoBtn').click();
    expect(await ids()).toEqual(['sa', 'sb', 'sc']);
    // 換類型
    await delMiddle();
    await expect(action).toHaveCount(1);
    await page.locator('.section-type').first().click();
    await expect(action).toHaveCount(0);
    await page.locator('#undoBtn').click();   // 撤換類型
    await page.locator('#undoBtn').click();   // 撤刪除
    expect(await ids()).toEqual(['sa', 'sb', 'sc']);
    // 新增段落
    await delMiddle();
    await page.locator('.section-add-btn').click();
    await expect(action).toHaveCount(0);
    // 按 ↶ 本身也會收掉復原鈕
    await page.locator('#undoBtn').click();   // 撤新增
    await page.locator('#undoBtn').click();   // 撤刪除
    expect(await ids()).toEqual(['sa', 'sb', 'sc']);
    await delMiddle();
    await expect(action).toHaveCount(1);
    await page.locator('#undoBtn').click();
    await expect(action).toHaveCount(0);
    expect(await ids()).toEqual(['sa', 'sb', 'sc']);
    // 後來的別種提示也會蓋掉復原鈕
    await delMiddle();
    await page.evaluate(() => showToast('別的提示'));
    await expect(action).toHaveCount(0);
    expect(await secCount(page)).toBe(2);
    expect(errors).toEqual([]);
    await context.close();
});

test('刪除：換歌後按復原不動', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        storage: v2Storage([song('s1', [typed('sa', 'verse', 'A'), typed('sb', 'chorus', 'B')]), song('s2', [typed('sx', 'verse', 'X'), typed('sy', 'bridge', 'Y')], { title: '另一首' })]),
    });
    await page.locator('.lyrics-section[data-index="1"] .section-remove').click();
    await expect(page.locator('#copyToast .toast-action')).toHaveCount(1);
    await page.evaluate(() => switchSong('s2'));
    expect(await page.evaluate(() => curSong().id)).toBe('s2');
    // 復原鈕還在的話，按了也不能動到 B 歌
    const btn = page.locator('#copyToast .toast-action');
    if (await btn.count()) await btn.click();
    expect(await page.evaluate(() => curSong().sections.map(s => s.id))).toEqual(['sx', 'sy']);
    await page.evaluate(() => switchSong('s1'));
    expect(await page.evaluate(() => curSong().sections.map(s => s.id))).toEqual(['sa']);
    expect(errors).toEqual([]);
    await context.close();
});

test('刪除：最後一段不能刪', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: v2Storage([song('s1', [typed('sa', 'verse', 'A')])]) });
    const rm = page.locator('.lyrics-section .section-remove');
    await expect(rm).toBeHidden();
    await page.evaluate(() => lhSecRemove('sa'));
    expect(await secCount(page)).toBe(1);
    expect(await page.evaluate(() => curSong().sections.length)).toBe(1);
    await expect(page.locator('#copyToast.has-action')).toHaveCount(0);
    // 兩段時 − 都出現，刪到剩一段又藏起來
    await page.locator('.section-add-btn').click();
    await expect(page.locator('.section-remove:visible')).toHaveCount(2);
    await page.locator('.lyrics-section[data-index="1"] .section-remove').click();
    await expect(page.locator('.section-remove:visible')).toHaveCount(0);
    expect(errors).toEqual([]);
    await context.close();
});

test('刪除：第一段也能刪', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: three() });
    await page.locator('.lyrics-section[data-index="0"] .section-remove').click();
    await expect(page.locator('#lyricsSections .lyrics-section')).toHaveCount(2);
    expect(await page.locator('.section-textarea').first().getAttribute('placeholder')).toBe('在這裡輸入或貼上歌詞…');
    expect(await page.locator('.section-textarea').nth(1).getAttribute('placeholder')).toBe('在這裡輸入歌詞…');
    expect(await page.locator('.section-textarea').first().inputValue()).toBe('B');
    expect(errors).toEqual([]);
    await context.close();
});

test('刪除：一段兩段多段的名稱', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        storage: v2Storage([song('s1', [typed('sa', 'verse', 'A'), typed('sb', 'verse', 'B')])]),
    });
    expect(await labels(page)).toEqual(['Verse I', 'Verse II']);
    await page.locator('.lyrics-section[data-index="1"] .section-remove').click();
    expect(await labels(page)).toEqual(['Verse']);
    expect(errors).toEqual([]);
    await context.close();
});

test('刪除：焦點', async ({ browser }) => {
    const focused = page => page.evaluate(() => {
        const a = document.activeElement;
        return { tag: a.tagName, type: a.classList.contains('section-type'), idx: a.closest('.lyrics-section')?.dataset.index ?? null };
    });
    for (const [name, device] of [['電腦', DEVICES.desktop], ['手機', DEVICES.phone]]) {
        const { context, page, errors } = await bootPage(browser, { device, storage: three() });
        await openLyrics(page);
        const rm = i => page.locator(`.lyrics-section[data-index="${i}"] .section-remove`);
        if (device === DEVICES.desktop) {
            await rm(1).click();
            expect(await focused(page), name + '：刪中間，落在同位置的類型鈕').toEqual({ tag: 'BUTTON', type: true, idx: '1' });
            await rm(1).click();
            expect(await focused(page), name + '：刪最後一段，落在新的最後一個類型鈕').toEqual({ tag: 'BUTTON', type: true, idx: '0' });
        } else {
            await rm(1).tap();
            const f = await focused(page);
            expect(f.tag, name + '：不聚焦輸入框').not.toBe('TEXTAREA');
            expect(f.type, name + '：也不聚焦類型鈕').toBe(false);
        }
        expect(errors).toEqual([]);
        await context.close();
    }
});

test('刪除：名稱太長', async ({ browser }) => {
    const long = '一二三四五六七八九十甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉';   // 30 字
    const { context, page, errors } = await bootPage(browser, {
        storage: v2Storage([song('s1', [typed('sa', 'verse', 'A'), typed('sb', 'custom', 'B', { custom: long })])]),
    });
    await page.locator('.lyrics-section[data-index="1"] .section-remove').click();
    const toast = page.locator('#copyToast');
    await expect(toast).toContainText('已刪除「' + Array.from(long).slice(0, 16).join('') + '…」');
    expect(await toast.textContent()).not.toContain(Array.from(long).slice(0, 17).join(''));
    expect(await toast.locator('.toast-action').getAttribute('aria-label')).toBe('復原刪除「' + long + '」');
    expect(errors).toEqual([]);
    await context.close();
});

test('刪除：五秒後仍可復原', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        storage: three(), beforeGoto: ({ page }) => page.clock.install(),
    });
    await page.clock.pauseAt(new Date(Date.now() + 5000));
    await page.locator('.lyrics-section[data-index="1"] .section-remove').click();
    await expect(page.locator('#copyToast')).toHaveClass(/show/);
    await page.clock.runFor(5500);
    await expect(page.locator('#copyToast')).not.toHaveClass(/show/);
    await page.locator('.section-textarea').first().focus();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.locator('#lyricsSections .lyrics-section')).toHaveCount(3);
    const back = await page.evaluate(() => curSong().sections.map(s => [s.id, s.type, s.text, s.color]));
    expect(back).toEqual([['sa', 'verse', 'A', ''], ['sb', 'chorus', 'B', '#48a868'], ['sc', 'verse', 'C', '']]);
    expect(errors).toEqual([]);
    await context.close();
});

// ==================== 段落設定（EDIT-06）：顏色 ====================
const colorOf = (page, i) => page.locator('#lyricsSections .lyrics-section').nth(i).evaluate(el => el.dataset.color || '');

test('顏色：右鍵選色', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        device: DEVICES.desktop, storage: v2Storage([song('s1', [typed('sa', 'verse', 'A'), typed('sb', 'chorus', 'B')])]),
    });
    await page.locator('#lyricsSections .section-type').nth(1).click({ button: 'right' });
    const menu = page.locator('#sectionMenu');
    await expect(menu).toBeVisible();
    await expect(menu).toContainText('段落設定：Chorus');
    await expect(menu.locator('.swatch')).toHaveCount(8);
    await menu.locator('.swatch[aria-label="顏色：綠"]').click();
    const sec = page.locator('#lyricsSections .lyrics-section').nth(1);
    expect(await colorOf(page, 1)).toBe('#48a868');
    expect(await sec.evaluate(el => getComputedStyle(el).getPropertyValue('--sec-color').trim())).toBe('#48a868');
    const bar = await sec.evaluate(el => {
        const cs = getComputedStyle(el, '::before');
        return { w: parseFloat(cs.width), bg: cs.backgroundColor, rem: parseFloat(getComputedStyle(document.documentElement).fontSize) };
    });
    expect(bar.w).toBeCloseTo(bar.rem * 0.25, 1);
    expect(bar.bg).toBe('rgb(72, 168, 104)');
    const bgOf = i => page.locator('#lyricsSections .section-type').nth(i).evaluate(el => getComputedStyle(el).backgroundColor);
    expect(await bgOf(1), '有顏色的名稱鈕有淡色底').not.toBe(await bgOf(0));
    expect((await activeSongRaw(page)).sections[1].color).toBe('#48a868');
    await page.locator('#undoBtn').click();
    expect(await colorOf(page, 1)).toBe('');
    expect((await activeSongRaw(page)).sections[1].color).toBe('');
    await page.locator('#redoBtn').click();
    expect(await colorOf(page, 1)).toBe('#48a868');
    await page.reload();
    await page.waitForFunction(() => window.__hoyunSongsReady);
    await expect(page.locator('#lyricsSections .lyrics-section').nth(1)).toHaveAttribute('data-color', '#48a868');
    expect(errors).toEqual([]);
    await context.close();
});

// ==================== 段落設定：長按、鍵盤、選色、類型、自訂名稱、位置、關閉 ====================
const pastLen = page => page.evaluate(() => _hists.get(curSong().id).past.length);
const menuOf = page => page.locator('#sectionMenu');
const three3 = () => v2Storage([song('s1', [typed('sa', 'verse', 'A'), typed('sb', 'chorus', 'B'), typed('sc', 'bridge', 'C')])]);
const openMenuAt = async (page, i) => { await page.locator('#lyricsSections .section-type').nth(i).click({ button: 'right' }); await expect(menuOf(page)).toBeVisible(); };
const radio = (page, name) => menuOf(page).getByRole('radio', { name, exact: true });

test('設定：長按開啟不循環', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.tablet, storage: v2Storage([song('s1', [typed('sa', 'verse', 'A'), typed('sb', 'chorus', 'B')])]) });
    await openLyrics(page);
    const btn = page.locator('#lyricsSections .section-type').nth(1);
    const [x, y] = await centerOf(btn);
    const t = await touchSession(page);
    await t.down(x, y);
    await page.waitForTimeout(200);
    expect(await btn.evaluate(el => el.classList.contains('is-pressing')), '按住中有按下的樣子').toBe(true);
    await page.waitForTimeout(350);
    await t.up();
    await expect(menuOf(page)).toBeVisible();
    await page.waitForTimeout(300);
    expect(await labels(page), '長按後沒有循環').toEqual(['Verse', 'Chorus']);
    expect(await btn.evaluate(el => el.classList.contains('is-pressing')), '放開後按下的樣子消失').toBe(false);
    const b = await btn.boundingBox(), m = await menuOf(page).boundingBox();
    expect(m.y >= b.y + b.height - 1 || m.y + m.height <= b.y + 1, '選單不蓋住名稱鈕（下面放不下就放上面）').toBe(true);
    // 100 毫秒輕點照常循環（同時點外面會把選單關掉）
    await t.down(x, y);
    await page.waitForTimeout(100);
    await t.up();
    await expect.poll(() => labels(page)).toEqual(['Verse', 'Inter']);
    await expect(menuOf(page)).toBeHidden();
    // 按住後手指移開超過 10px：不開選單
    await t.down(x, y);
    await t.move(x + 30, y);
    await page.waitForTimeout(600);
    await t.up();
    await expect(menuOf(page)).toBeHidden();
    expect(errors).toEqual([]);
    await context.close();
});

test('設定：鍵盤開啟', async ({ browser }) => {
    for (const [name, device] of [['電腦', DEVICES.desktop], ['手機', DEVICES.phone]]) {
        const { context, page, errors } = await bootPage(browser, { device, storage: three3() });
        await openLyrics(page);
        const btn = page.locator('#lyricsSections .section-type').nth(1);
        await btn.focus();
        await page.keyboard.press('Shift+F10');
        await expect(menuOf(page), name).toBeVisible();
        const act = await page.evaluate(() => { const a = document.activeElement; return { role: a.getAttribute('role'), checked: a.getAttribute('aria-checked'), text: a.textContent }; });
        expect(act, name + '：焦點在目前類型那一列').toEqual({ role: 'radio', checked: 'true', text: 'Chorus' });
        await page.keyboard.press('Escape');
        await expect(menuOf(page), name).toBeHidden();
        expect(await page.evaluate(() => document.activeElement.className), name + '：焦點回到名稱鈕').toContain('section-type');
        expect(await page.evaluate(() => document.activeElement.textContent)).toBe('Chorus');
        expect(await page.locator('#leftPanel').evaluate(el => el.classList.contains('collapsed')), name + '：歌詞面板沒被一起收起').toBe(false);
        // ContextMenu 鍵也一樣
        await page.keyboard.press('ContextMenu');
        await expect(menuOf(page), name).toBeVisible();
        expect(errors).toEqual([]);
        await context.close();
    }
});

test('顏色：自訂色預覽與確定', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: three3() });
    await openMenuAt(page, 0);
    const input = menuOf(page).locator('input[type=color]');
    const before = await pastLen(page);
    const fire = (v, type) => input.evaluate((el, a) => { el.value = a[0]; el.dispatchEvent(new Event(a[1], { bubbles: true })); }, [v, type]);
    for (const v of ['#112233', '#223344', '#334455']) await fire(v, 'input');
    expect(await page.locator('#lyricsSections .lyrics-section').first().evaluate(el => getComputedStyle(el).getPropertyValue('--sec-color').trim()), '畫面預覽').toBe('#334455');
    expect(await pastLen(page), '預覽不記歷史').toBe(before);
    expect((await activeSongRaw(page)).sections[0].color, '預覽不存檔').toBe('');
    expect(await page.evaluate(() => curSong().sections[0].color), '預覽不寫模型').toBe('');
    await fire('#E05D5D', 'change');
    expect(await pastLen(page), '確定只記一步').toBe(before + 1);
    expect((await activeSongRaw(page)).sections[0].color).toBe('#e05d5d'.toLowerCase());
    expect(await colorOf(page, 0)).toBe('#e05d5d');
    // 不合格式的值不會被存（3 位數、色名）
    await page.evaluate(() => { lhSecMenuColor('#abc'); lhSecMenuColor('red'); lhSecMenuColor('#GGGGGG'); });
    expect(await pastLen(page)).toBe(before + 1);
    expect(await colorOf(page, 0)).toBe('#e05d5d');
    // 預覽後沒按確定就關：畫面回到模型的顏色
    await fire('#00ff00', 'input');
    await page.keyboard.press('Escape');
    expect(await colorOf(page, 0)).toBe('#e05d5d');
    // 重新整理與備份來回都還在
    await page.reload();
    await page.waitForFunction(() => window.__hoyunSongsReady);
    expect(await colorOf(page, 0)).toBe('#e05d5d');
    expect(errors).toEqual([]);
    await context.close();
});

test('顏色：無顏色', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: three3() });
    await openMenuAt(page, 1);
    await menuOf(page).locator('.swatch[aria-label="顏色：綠"]').click();
    await expect(menuOf(page).locator('.swatch[aria-label="顏色：綠"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(menuOf(page).getByRole('button', { name: '無顏色' })).toHaveAttribute('aria-pressed', 'false');
    const before = await pastLen(page);
    await menuOf(page).getByRole('button', { name: '無顏色' }).click();
    expect(await colorOf(page, 1)).toBe('');
    expect(await pastLen(page)).toBe(before + 1);
    const sec = page.locator('#lyricsSections .lyrics-section').nth(1);
    expect(await sec.evaluate(el => ({ bar: getComputedStyle(el, '::before').content, v: el.style.getPropertyValue('--sec-color') }))).toEqual({ bar: 'none', v: '' });
    await expect(menuOf(page).getByRole('button', { name: '無顏色' })).toHaveAttribute('aria-pressed', 'true');
    // 再按一次：沒變就不記
    await menuOf(page).getByRole('button', { name: '無顏色' }).click();
    expect(await pastLen(page)).toBe(before + 1);
    expect((await activeSongRaw(page)).sections[1].color).toBe('');
    // 沒有顏色的段落仍有把手、名稱、字數
    await expect(sec.locator('.section-handle, .section-type, .section-count')).toHaveCount(3);
    expect(errors).toEqual([]);
    await context.close();
});

test('設定：直接選類型', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: three3() });
    await openMenuAt(page, 1);
    await expect(menuOf(page).getByRole('radiogroup', { name: '段落類型' })).toBeVisible();
    await expect(menuOf(page).getByRole('radio')).toHaveCount(8);
    expect(await menuOf(page).getByRole('radio').evaluateAll(els => els.map(e => e.textContent))).toEqual(['Intro', 'Verse', 'Pre-Chorus', 'Chorus', 'Inter', 'Bridge', 'Outro', 'Custom']);
    await expect(radio(page, 'Chorus')).toHaveAttribute('aria-checked', 'true');
    const before = await pastLen(page);
    await radio(page, 'Verse').click();
    expect(await labels(page), '兩個 Verse 要編號').toEqual(['Verse I', 'Verse II', 'Bridge']);
    expect(await pastLen(page)).toBe(before + 1);
    await expect(menuOf(page).locator('.section-menu-title')).toHaveText('段落設定：Verse II');
    await expect(radio(page, 'Verse')).toHaveAttribute('aria-checked', 'true');
    await expect(radio(page, 'Chorus')).toHaveAttribute('aria-checked', 'false');
    expect((await activeSongRaw(page)).sections.map(s => s.type)).toEqual(['verse', 'verse', 'bridge']);
    // 選一樣的：不記
    await radio(page, 'Verse').click();
    expect(await pastLen(page)).toBe(before + 1);
    // 方向鍵只移動焦點，不改類型
    await radio(page, 'Verse').focus();
    await page.keyboard.press('ArrowRight');
    expect(await page.evaluate(() => document.activeElement.textContent)).toBe('Pre-Chorus');
    await page.keyboard.press('ArrowDown');
    expect(await page.evaluate(() => document.activeElement.textContent)).toBe('Chorus');
    await page.keyboard.press('ArrowLeft');
    expect(await page.evaluate(() => document.activeElement.textContent)).toBe('Pre-Chorus');
    await page.keyboard.press('ArrowUp');
    expect(await page.evaluate(() => document.activeElement.textContent)).toBe('Verse');
    await expect(radio(page, 'Verse')).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Enter');   // Enter 或空白才是選
    expect(await pastLen(page)).toBe(before + 1);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    expect(await labels(page)).toEqual(['Verse', 'Pre-Chorus', 'Bridge']);
    // 復原一步回到 Verse II
    await page.locator('#undoBtn').click();
    expect(await labels(page)).toEqual(['Verse I', 'Verse II', 'Bridge']);
    expect(errors).toEqual([]);
    await context.close();
});

test('設定：自訂名稱', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: three3() });
    await openMenuAt(page, 1);
    const input = menuOf(page).locator('input.section-name-input');
    await expect(input, '不是 Custom 時看不到').toBeHidden();
    await radio(page, 'Custom').click();
    await expect(input).toBeVisible();
    expect(await input.evaluate(el => el === document.activeElement), '桌機選 Custom 直接聚焦').toBe(true);
    expect(await input.getAttribute('maxlength')).toBe('40');
    expect(await input.getAttribute('aria-label')).toBe('自訂段落名稱');
    expect(await input.getAttribute('placeholder')).toBe('例如：Rap、Solo、Hook');
    expect(await labels(page)).toEqual(['Verse', 'Custom', 'Bridge']);
    let before = await pastLen(page);
    await page.keyboard.type('Hook');
    await page.keyboard.press('Enter');
    expect(await labels(page)).toEqual(['Verse', 'Hook', 'Bridge']);
    expect(await pastLen(page), 'Enter 記一步').toBe(before + 1);
    expect((await activeSongRaw(page)).sections[1].custom).toBe('Hook');
    // Esc：還原文字，選單還開著
    await input.focus();
    await page.keyboard.type('X');
    await page.keyboard.press('Escape');
    await expect(input).toHaveValue('Hook');
    await expect(menuOf(page)).toBeVisible();
    expect(await labels(page)).toEqual(['Verse', 'Hook', 'Bridge']);
    // 只有空白：顯示 Custom
    await input.fill('   ');
    await page.keyboard.press('Enter');
    expect(await labels(page)).toEqual(['Verse', 'Custom', 'Bridge']);
    // 切走再切回：名字還在
    await input.fill('Hook');
    await input.blur();   // blur 也送出
    expect(await labels(page)).toEqual(['Verse', 'Hook', 'Bridge']);
    await radio(page, 'Chorus').click();
    expect(await labels(page)).toEqual(['Verse', 'Chorus', 'Bridge']);
    await expect(input).toBeHidden();
    await radio(page, 'Custom').click();
    expect(await labels(page)).toEqual(['Verse', 'Hook', 'Bridge']);
    await expect(input).toHaveValue('Hook');
    // 貼上 41 個字：只留 40
    await input.fill('');
    await page.keyboard.insertText('字'.repeat(41));
    expect(Array.from(await input.inputValue()).length).toBeLessThanOrEqual(40);
    await page.keyboard.press('Enter');
    expect(Array.from((await activeSongRaw(page)).sections[1].custom).length).toBe(40);
    // 40 字在標題列用 … 收尾，title 是全名；選單標題切成 16 字加 …
    expect(await page.locator('#lyricsSections .section-type').nth(1).evaluate(el => ({ over: el.scrollWidth > el.clientWidth, title: el.title }))).toEqual({ over: true, title: '字'.repeat(40) });
    await expect(menuOf(page).locator('.section-menu-title')).toHaveText('段落設定：' + '字'.repeat(16) + '…');
    // 手機：選 Custom 不聚焦（鍵盤不要自己彈出來）
    const ph = await bootPage(browser, { device: DEVICES.phone, storage: three3() });
    await openLyrics(ph.page);
    await ph.page.locator('#lyricsSections .section-type').nth(1).click({ button: 'right' });
    await expect(menuOf(ph.page)).toBeVisible();
    await radio(ph.page, 'Custom').tap();
    await expect(menuOf(ph.page).locator('input.section-name-input')).toBeVisible();
    expect(await ph.page.evaluate(() => document.activeElement.tagName)).not.toBe('INPUT');
    expect(ph.errors).toEqual([]);
    await ph.context.close();
    expect(errors).toEqual([]);
    await context.close();
});

test('設定：上移下移', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: three3() });
    await openMenuAt(page, 1);
    const up = menuOf(page).getByRole('button', { name: '↑ 上移' }), down = menuOf(page).getByRole('button', { name: '↓ 下移' });
    await expect(up).toHaveAttribute('aria-disabled', 'false');
    const before = await pastLen(page);
    await up.click();
    expect(await labels(page)).toEqual(['Chorus', 'Verse', 'Bridge']);
    await expect(menuOf(page), '選單還開著').toBeVisible();
    expect(await pastLen(page)).toBe(before + 1);
    await expect(up).toHaveAttribute('aria-disabled', 'true');
    await expect(down).toHaveAttribute('aria-disabled', 'false');
    await up.click({ force: true });   // 已在最上面：什麼都不做
    expect(await pastLen(page)).toBe(before + 1);
    expect(await labels(page)).toEqual(['Chorus', 'Verse', 'Bridge']);
    await down.click();
    await down.click();
    await expect(down).toHaveAttribute('aria-disabled', 'true');
    expect(await labels(page)).toEqual(['Verse', 'Bridge', 'Chorus']);
    expect((await activeSongRaw(page)).sections.map(s => s.id)).toEqual(['sa', 'sc', 'sb']);
    await page.keyboard.press('Escape');
    // 只有一段：兩個都灰
    await page.evaluate(() => { lhSecRemove('sa'); lhSecRemove('sc'); });
    await page.locator('#lyricsSections .section-type').first().click({ button: 'right' });
    await expect(up).toHaveAttribute('aria-disabled', 'true');
    await expect(down).toHaveAttribute('aria-disabled', 'true');
    expect(errors).toEqual([]);
    await context.close();
});

test('設定：關閉方式', async ({ browser }) => {
    const two = v2Storage([song('s1', [typed('sa', 'verse', 'A'), typed('sb', 'chorus', 'B')]), song('s2', [typed('sx', 'verse', 'X')])], 's1');
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: two });
    const closes = {
        '點外面': () => page.locator('.section-textarea').first().click({ position: { x: 8, y: 8 } }),
        '關閉設定': () => menuOf(page).getByRole('button', { name: '關閉設定' }).click(),
        'Esc': () => page.keyboard.press('Escape'),
        '刪除這一段': () => page.evaluate(() => lhSecRemove('sb')),
        '換歌': () => page.evaluate(() => switchSong('s2')),
        '開始拖曳': async () => { const [x, y] = await centerOf(page.locator('.section-handle').first()); await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.up(); },
        '中止手勢': () => page.evaluate(() => lhSecAbortInteractions()),
    };
    for (const [name, close] of Object.entries(closes)) {
        await page.evaluate(() => { switchSong('s1'); });
        await page.evaluate(() => { if (curSong().sections.length < 2) { const s = makeEmptySection('chorus'); s.id = 'sb'; curSong().sections.push(s); renderLyricsSections(); } });
        await openMenuAt(page, 1);
        await close();
        await expect(menuOf(page), name + '要關掉選單').toBeHidden();
    }
    // 聚焦色盤輸入不會關
    await page.evaluate(() => switchSong('s1'));
    await openMenuAt(page, 0);
    await menuOf(page).locator('input[type=color]').focus();
    await page.waitForTimeout(100);
    await expect(menuOf(page)).toBeVisible();
    // 打開選單會關掉匯出選單
    await page.keyboard.press('Escape');
    await page.evaluate(() => toggleExportMenu());
    await expect(page.locator('#exportMenu')).toHaveClass(/show/);
    await page.locator('#lyricsSections .section-type').first().click({ button: 'right' });
    await expect(menuOf(page)).toBeVisible();
    await expect(page.locator('#exportMenu')).not.toHaveClass(/show/);
    expect(errors).toEqual([]);
    await context.close();
});

test('設定：第一次提示', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: three3() });
    await page.evaluate(() => document.getElementById('copyToast')?.classList.remove('show'));
    const keysBefore = await page.evaluate(() => Object.keys(localStorage).sort());
    await page.locator('#lyricsSections .section-type').first().click();
    await expect(page.locator('#copyToast')).toHaveClass(/show/);
    await expect(page.locator('#copyToast')).toHaveText('長按標籤（桌機按右鍵）可改顏色、名稱與順序');
    await page.evaluate(() => document.getElementById('copyToast').classList.remove('show'));
    await page.locator('#lyricsSections .section-type').first().click();
    await page.waitForTimeout(150);
    await expect(page.locator('#copyToast'), '同一次開啟只提示一次').not.toHaveClass(/show/);
    expect(await page.evaluate(() => Object.keys(localStorage).sort()), '什麼都沒存').toEqual(keysBefore);
    expect(errors).toEqual([]);
    await context.close();
});

// ==================== 段落設定：對比、不出界、觸控、16px、鍵盤、純文字 ====================
function rgbOf(value) {
    let m = value.match(/^#([0-9a-f]{6})$/i);
    if (m) return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
    m = value.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
    if (m) return [+m[1], +m[2], +m[3]];
    m = value.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
    if (m) return [+m[1], +m[2], +m[3]].map(v => v * 255);
    throw new Error('看不懂的顏色：' + value);
}
const lum = ([r, g, b]) => {
    const f = c => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrastOf = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

test('顏色：三種主題對比', async ({ browser }) => {
    const PRESETS = ['#e05d5d', '#e98a3c', '#d69e2e', '#48a868', '#2c9fa0', '#4a7fd4', '#8d6bd0', '#d2649a'];
    const EXTREME = ['#ffffff', '#000000', '#ff0000', '#00ff00', '#ffff00'];
    expect(await (async () => {
        // 預設色的清單要跟程式裡的一樣（測試自己不能漏掉或多出）
        const { context, page } = await bootPage(browser, { storage: three3() });
        const got = await page.evaluate(() => LH_SEC_COLORS.map(c => c.hex));
        await context.close();
        return got;
    })()).toEqual(PRESETS);
    const themes = [
        ['淺色', { colorScheme: 'light', extra: {} }],
        ['深色', { colorScheme: 'dark', extra: { hoyun_theme_mode: 'dark' } }],
        ['自訂配色', { colorScheme: 'light', extra: { containerBg: '#fff7e6', textColor: '#1a202c', highlightColor: '#2b6cb0' } }],
    ];
    const worst = [];
    let checked = 0;
    for (const [name, t] of themes) {
        const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, colorScheme: t.colorScheme, storage: { ...three3(), ...t.extra } });
        for (const hex of [...PRESETS, ...EXTREME]) {
            const v = await page.evaluate(h => {
                lhSecApply('color', song => { song.sections[0].color = h; });
                const sec = document.querySelector('#lyricsSections .lyrics-section');
                const btn = sec.querySelector('.section-type');
                const cs = getComputedStyle(btn), root = getComputedStyle(document.documentElement);
                return { text: cs.color, bg: cs.backgroundColor, sec: root.getPropertyValue('--sec-color').trim() || getComputedStyle(sec).getPropertyValue('--sec-color').trim(), card: root.getPropertyValue('--card-bg').trim(), supports: CSS.supports('background', 'color-mix(in srgb, red 50%, blue)') };
            }, hex);
            expect(v.supports, '測試瀏覽器要支援 color-mix').toBe(true);
            // 自己用 14% 混一次，跟瀏覽器算出來的底色比（差 2/255 以內），再用算出來的底色量對比
            const sec = rgbOf(hex), card = rgbOf(v.card);
            const mix = sec.map((c, i) => c * 0.14 + card[i] * 0.86);
            const actual = rgbOf(v.bg);
            mix.forEach((c, i) => expect(Math.abs(c - actual[i]), `${name} ${hex}：底色是 14% 淡色`).toBeLessThanOrEqual(2));
            const ratio = contrastOf(rgbOf(v.text), actual);
            checked++;
            worst.push([ratio, `${name} ${hex} = ${ratio.toFixed(2)}`]);
            expect(ratio, `${name} ${hex} 文字對比 ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
        }
        expect(errors).toEqual([]);
        await context.close();
    }
    expect(checked, '13 色 × 3 種主題').toBe(39);
    worst.sort((a, b) => a[0] - b[0]);
    for (const [name] of themes) console.log('段落顏色對比 最低 ' + worst.find(w => w[1].startsWith(name + ' '))[1]);
    // 自檢：量得到不合格的組合
    expect(contrastOf([200, 200, 200], [255, 255, 255])).toBeLessThan(4.5);
});

test('設定：選單不出界', async ({ browser }) => {
    const seven = v2Storage([song('s1', ['verse', 'chorus', 'bridge', 'outro', 'inter', 'prechorus', 'intro'].map((t, i) => typed('s' + i, t, '歌詞' + i)))]);
    for (const [name, device, pct] of [['手機 150%', DEVICES.phone, 150], ['手機橫放', DEVICES.phoneLandscape, 100], ['手機橫放 150%', DEVICES.phoneLandscape, 150]]) {
        const { context, page, errors } = await bootPage(browser, { device, storage: seven });
        await setScale(page, pct);
        await openLyrics(page);
        await waitStill(page);
        // 最後一段，指標落在可見範圍的右下角（最容易被切掉的位置）；150% 時最後一段的標題被分頁列蓋住點不到，所以直接呼叫開啟函式
        await page.evaluate(() => {
            const secs = document.querySelectorAll('#lyricsSections .lyrics-section');
            lhSecOpenMenu(secs[secs.length - 1], window.visualViewport.width - 2, window.visualViewport.height - 2, false);
        });
        const menu = menuOf(page);
        await expect(menu, name).toBeVisible();
        await radio(page, 'Custom').click();   // 讓自訂名稱的輸入框也出現
        const inside = () => page.evaluate(() => {
            const r = document.getElementById('sectionMenu').getBoundingClientRect(), vv = window.visualViewport;
            return { l: r.left - vv.offsetLeft, t: r.top - vv.offsetTop, r: vv.offsetLeft + vv.width - r.right, b: vv.offsetTop + vv.height - r.bottom, sh: document.getElementById('sectionMenu').scrollHeight, ch: document.getElementById('sectionMenu').clientHeight };
        });
        const box = await inside();
        for (const [k, v] of Object.entries({ 左: box.l, 上: box.t, 右: box.r, 下: box.b })) expect(v, `${name}：選單${k}邊在可見範圍內`).toBeGreaterThanOrEqual(-0.5);
        if (name !== '手機 150%') expect(box.sh, `${name}：橫放放不下，選單內部要能捲`).toBeGreaterThan(box.ch);
        const controls = menu.locator('button, input');
        const n = await controls.count();
        expect(n).toBeGreaterThanOrEqual(8 + 1 + 1 + 8 + 1 + 2 + 1);
        for (let i = 0; i < n; i++) {
            const c = controls.nth(i);
            if (!(await c.isVisible())) continue;
            await expectReallyClickable(page, c, `${name} 第 ${i} 個控制項`);
            const r = await c.evaluate(el => { const m = document.getElementById('sectionMenu').getBoundingClientRect(), b = el.getBoundingClientRect(); return b.top >= m.top - 1 && b.bottom <= m.bottom + 1 && b.left >= m.left - 1 && b.right <= m.right + 1; });
            expect(r, `${name} 第 ${i} 個控制項在選單的框內`).toBe(true);
        }
        await menu.getByRole('button', { name: '關閉設定' }).click();
        await expect(menu).toBeHidden();
        expect(errors).toEqual([]);
        await context.close();
    }
});

test('設定：觸控點擊範圍與輸入框 16px', async ({ browser }) => {
    for (const [name, device] of [['手機', DEVICES.phone], ['平板', DEVICES.tablet]]) {
        for (const pct of [50, 100, 150]) {
            const { context, page, errors } = await bootPage(browser, { device, storage: three3() });
            await setScale(page, pct);
            await openLyrics(page);
            await waitStill(page);
            await page.locator('#lyricsSections .section-type').nth(1).click({ button: 'right' });
            await radio(page, 'Custom').click();
            const input = menuOf(page).locator('input.section-name-input');
            await expect(input).toBeVisible();
            const px = parseFloat(await input.evaluate(el => getComputedStyle(el).fontSize));
            expect(meetsInputFloor(px), `${name} ${pct}%：自訂名稱字級 ${px}px`).toBe(true);
            if (pct === 100) {
                // 觸控目標 ≥ 平板 36／手機 44（含色盤輸入與每個類型列）
                const min = (await hitMin(page)) - 0.5;
                const small = await menuOf(page).locator('button, input').evaluateAll((els, min) => els.filter(e => e.offsetParent !== null).map(e => { const r = e.getBoundingClientRect(); return { n: e.className + ' ' + (e.textContent || e.getAttribute('aria-label')), w: r.width, h: r.height }; }).filter(r => r.w < min || r.h < min), min);
                expect(small, `${name}：這些控制項不到 ${min + 0.5}×${min + 0.5}`).toEqual([]);
            }
            expect(errors).toEqual([]);
            await context.close();
        }
    }
});

test('設定：鍵盤出現時看得到', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.phone, storage: three3() });
    await openLyrics(page);
    await page.locator('#lyricsSections .section-type').nth(2).click({ button: 'right' });
    await radio(page, 'Custom').click();
    const input = menuOf(page).locator('input.section-name-input');
    await input.tap();
    const size = await emulateKeyboard(page, 336);
    await expect.poll(async () => (await readKeyboard(page)).open, { message: '縮 336px 後應進入 kb-open' }).toBe(true);
    await waitStill(page);
    const kb = await readKeyboard(page);
    expect(await page.locator('.mobile-tab-bar').evaluate(el => getComputedStyle(el).display), '鍵盤出現時分頁列藏起來').toBe('none');
    const box = await input.boundingBox();
    expect(insideVisible(box, kb), `自訂名稱輸入框 ${JSON.stringify(box)} 要完整在可見範圍內`).toBe(true);
    const m = await menuOf(page).boundingBox();
    expect(m.y + m.height, '選單在可見範圍內').toBeLessThanOrEqual(kb.vvOffsetTop + kb.vvHeight + 0.5);
    await restoreViewport(page, size);
    expect(errors).toEqual([]);
    await context.close();
});

test('設定：名稱只當純文字', async ({ browser }) => {
    const EVIL = '<img src=x onerror=alert(1)>';
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: three3() });
    const dialogs = [];
    page.on('dialog', d => { dialogs.push(d.message()); d.dismiss(); });
    const imgs = await page.evaluate(() => document.querySelectorAll('img').length);
    await openMenuAt(page, 1);
    await radio(page, 'Custom').click();
    await page.keyboard.insertText(EVIL);
    await page.keyboard.press('Enter');
    const btn = page.locator('#lyricsSections .section-type').nth(1);
    await expect(btn).toHaveText(EVIL);
    await expect(menuOf(page).locator('.section-menu-title')).toHaveText('段落設定：' + Array.from(EVIL).slice(0, 16).join('') + '…');
    expect(await btn.getAttribute('aria-label')).toBe(EVIL + '，段落類型，按一下切換');
    expect(await page.evaluate(() => document.querySelectorAll('img').length), '名稱沒有變成 img 元素').toBe(imgs);
    expect(await page.evaluate(() => document.getElementById('sectionMenu').querySelectorAll('img, script').length)).toBe(0);
    await page.waitForTimeout(300);
    expect(dialogs).toEqual([]);
    expect(errors).toEqual([]);
    await context.close();
});
