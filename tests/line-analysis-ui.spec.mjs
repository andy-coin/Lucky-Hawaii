// 句構分析與設定頁（第 11 階段）的瀏覽器測試：逐行標記、對照、換行不變、分析面板、偏好設定…
// 標題的第一個詞（常駐／對照／換行不變／最後視覺列／詞庫載入／分析面板／hover／組字／偏好設定／顯示方式／韻族顏色／預覽）
// 對應 11-VALIDATION.md 的 -g 篩選；之後的計畫會在這支檔案繼續加
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

const lsGetMap = page => page.evaluate(() => localStorage.getItem('lh:map'));
const ready = page => page.evaluate(() => Promise.all([window.__hoyunReady, window.__hoyunWordlistReady, window.__hoyunSongsReady, window.__lhMapReady]));

// 把詞放進詞庫（讀音用字典第一讀音湊出來，只為了讓「詞存在」），再通知韻腳地圖重畫
const seedWords = (page, words) => page.evaluate(ws => {
    for (const w of ws) wordPhoneticMap.set(w, Array.from(w).map(c => getCharAllReadings(c)[0].reading).join(' '));
    lhMapOnLexiconChange();
}, words);

// 第一段鏡像層裡每個標記的 [字數, 結構文字]
const markers = page => page.locator('.lyrics-section').first().locator('.rhyme-mirror .lm-mk').evaluateAll(els =>
    els.map(e => [e.querySelector('.lm-t-c')?.textContent ?? null, e.querySelector('.lm-t-s')?.textContent ?? null]));

const TEXT = ['月光 灑在 窗前', '夢裡想起你的臉', '', '，。', '我想把時間留在這一天', '月光 灑在 窗前 夢裡想起你的臉'].join('\n');
const WORDS = ['夢裡', '想起', '你的', '我想', '時間', '留在', '這一'];

test('常駐：打開逐行標記，每行右邊出現字數與斷句', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', TEXT)])]) });
    await seedWords(page, WORDS);
    // 全新使用者：沒有標記、沒有欄位
    await expect(page.locator('.lm-mk')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-lm'))).toBeNull();
    expect(await lsGetMap(page), '沒碰過就不寫').toBeNull();

    await page.evaluate(() => lhMapSetSetting('line', true));
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-lm'))).toBe('right');
    await expect(page.locator('.lyrics-section').first().locator('.lm-mk')).toHaveCount(4);
    expect(await markers(page)).toEqual([['6', '2+2+2'], ['7', '≈2+2+3'], ['10', '≈3+2+2+3'], ['13', '2+2+2+≈2+2+3']]);

    // 只有機器猜的那一段是斜體、帶 ≈
    const guess = await page.locator('.lyrics-section').first().locator('.rhyme-mirror .lm-mk .lm-t-s').evaluateAll(els => els.map(e => ({
        kids: [...e.querySelectorAll('.lm-guess')].map(g => g.textContent),
        all: e.textContent,
        selfStyle: getComputedStyle(e).fontStyle,
        kidStyle: e.querySelector('.lm-guess') ? getComputedStyle(e.querySelector('.lm-guess')).fontStyle : null,
    })));
    expect(guess[0].kids, '自己標的整行沒有猜').toEqual([]);
    expect(guess[1].kids).toEqual([guess[1].all]);
    expect(guess[2].kids).toEqual([guess[2].all]);
    expect(guess[3].kids, '混合行只有猜的那段').toEqual(['≈2+2+3']);
    expect(guess[3].selfStyle).toBe('normal');
    expect(guess[3].kidStyle).toBe('italic');

    expect(await lsGetMap(page)).toBe('{"end":true,"letters":false,"inner":false,"strict":false,"skipParticles":true,"line":true}');

    // 輸入框與鏡像層的右內距一致，欄位在輸入框裡面
    const geo = await page.evaluate(() => {
        const sec = document.querySelector('.lyrics-section');
        const ta = sec.querySelector('.section-textarea'), mirror = sec.querySelector('.rhyme-mirror');
        const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
        const t = ta.getBoundingClientRect();
        return {
            pad: parseFloat(getComputedStyle(ta).paddingRight), base: 0.75 * rem,
            bar: ta.offsetWidth - ta.clientWidth,
            mirrorPad: parseFloat(mirror.style.paddingRight),
            scroll: ta.scrollHeight > ta.clientHeight,
            boxes: [...mirror.querySelectorAll('.lm-mk')].map(m => { const r = m.getBoundingClientRect(); return { l: r.left - t.left, r: r.right - t.right, t: r.top - t.top, b: r.bottom - t.bottom }; }),
        };
    });
    expect(geo.pad).toBeGreaterThan(geo.base + 20);
    expect(Math.abs(geo.mirrorPad - (geo.pad + geo.bar))).toBeLessThan(0.6);
    for (const b of geo.boxes) {
        expect(b.l, '標記不超出輸入框左邊').toBeGreaterThanOrEqual(-0.5);
        expect(b.r, '標記不超出輸入框右邊').toBeLessThanOrEqual(0.5);
        if (!geo.scroll) { expect(b.t).toBeGreaterThanOrEqual(-0.5); expect(b.b).toBeLessThanOrEqual(0.5); }
    }

    // 數字的垂直位置和歌詞同一條基線附近（標記小字不能掉到行底）
    const dy = await page.evaluate(() => {
        const mirror = document.querySelector('.lyrics-section .rhyme-mirror');
        return [...mirror.querySelectorAll('.lm-mk')].map(m => {
            const prev = m.previousSibling;   // 該行的文字
            const rg = document.createRange();
            rg.setStart(prev, Math.max(0, prev.textContent.length - 1));
            rg.setEnd(prev, prev.textContent.length);
            const a = rg.getBoundingClientRect(), c = m.querySelector('.lm-t-c').getBoundingClientRect();
            return Math.abs((a.top + a.bottom) / 2 - (c.top + c.bottom) / 2);
        });
    });
    for (const d of dy) expect(d, '標記與歌詞同一行').toBeLessThan(4);

    // 重新整理後還在
    await page.reload();
    await ready(page);
    await seedWords(page, WORDS);
    expect(await markers(page)).toEqual([['6', '2+2+2'], ['7', '≈2+2+3'], ['10', '≈3+2+2+3'], ['13', '2+2+2+≈2+2+3']]);

    // 關掉：全部回到原樣
    await page.evaluate(() => lhMapSetSetting('line', false));
    await expect(page.locator('.lm-mk')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-lm'))).toBeNull();
    const pad = await page.evaluate(() => {
        const ta = document.querySelector('.section-textarea');
        return [parseFloat(getComputedStyle(ta).paddingRight), 0.75 * parseFloat(getComputedStyle(document.documentElement).fontSize)];
    });
    expect(pad[0]).toBeCloseTo(pad[1], 1);
    expect(errors).toEqual([]);
    await context.close();
});

// ==================== 對照差異與偏好設定（11-02） ====================
const menuSw = (page, label) => page.locator('#rhymeMenu .rm-switch').filter({ hasText: label });
const prefSw = (page, label) => page.locator('#mapSettingsSection .rm-switch').filter({ hasText: label });
// 每個段落鏡像層裡每個標記的對照差異欄文字
const diffTokens = (page, n) => page.locator('.lyrics-section').nth(n).locator('.rhyme-mirror .lm-mk').evaluateAll(els => els.map(e => e.querySelector('.lm-t-d')?.textContent ?? null));

test('對照：打開對照差異，同類型第一段的同一行字數不同就標 ≠', async ({ browser }) => {
    const sections = [
        typed('s1', 'verse', ['我望著遠方的光', '獨自站在窗', '走過熟悉的街道'].join('\n')),
        typed('s2', 'chorus', '你笑著說天亮'),
        typed('s3', 'verse', ['我望著遠方的光', '獨自站在窗前', '走過熟悉的街道', '終於我也回到'].join('\n')),
        typed('s4', 'verse', '月光 灑在 窗前'),
    ];
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: v2Storage([song(sections)]) });
    const headerBtns = () => page.locator('.lyrics-section-header button').count();
    const btnsBefore = await headerBtns();

    // 韻腳 ▾ → 逐行標記 → 更多設定…
    await page.locator('#rhymeMenuBtn').click();
    await menuSw(page, '逐行標記').click();
    await expect(page.locator('#rhymeHintLine')).toHaveText('每行旁邊顯示字數與斷句；細項在「更多設定」');
    await page.locator('#rhymeMenu .rm-more').click();
    await expect(page.locator('#rhymeMenu')).toBeHidden();
    await expect(page.locator('#settingsOverlay')).toHaveClass(/show/);
    await expect(page.locator('#mapSettingsSection')).toHaveJSProperty('open', true);
    await expect(page.locator('#mapSettingsSection > summary')).toBeFocused();

    // 對照差異預設關：沒有差異欄
    await expect(page.locator('.lm-t-d')).toHaveCount(0);
    await prefSw(page, '對照差異').click();
    await expect(prefSw(page, '對照差異')).toHaveAttribute('aria-checked', 'true');
    expect(await lsGetMap(page)).toContain('"lnDiff":true');
    expect(await lsGetMap(page)).toContain('"line":true');
    expect(await diffTokens(page, 0), '第一段沒有對照').toEqual(['', '', '']);
    expect(await diffTokens(page, 1), '第一個 Chorus 沒有對照').toEqual(['']);
    expect(await diffTokens(page, 2)).toEqual(['', '≠5', '', '']);   // 第四行對照段落沒有，什麼都不加
    expect(await diffTokens(page, 3), 'Verse III 也對 Verse I').toEqual(['≠7']);
    expect(await page.locator('.lyrics-section').nth(2).locator('.lm-t-d').nth(1).evaluate(e => getComputedStyle(e).fontWeight)).toBe('700');

    // 兩邊同一份設定
    await expect(prefSw(page, '逐行標記')).toContainText('開');
    // 已經開著時再叫一次，不會把面板關掉
    await page.evaluate(() => lhMapOpenPrefs());
    await expect(page.locator('#settingsOverlay')).toHaveClass(/show/);
    await page.locator('#settingsOverlay').click({ position: { x: 4, y: 4 } });
    await expect(page.locator('#settingsOverlay')).not.toHaveClass(/show/);
    await page.locator('#rhymeMenuBtn').click();
    await expect(menuSw(page, '逐行標記')).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');

    // 改 Verse I：Verse II 的 ≠ 跟著更新，Verse II 的文字不動
    const before2 = await page.locator('.lyrics-section .section-textarea').nth(2).inputValue();
    await page.evaluate(() => {
        const ta = document.querySelector('.section-textarea');
        const at = ta.value.indexOf('窗') + 1;
        ta.focus(); ta.setSelectionRange(at, at);
    });
    await page.keyboard.type('口');
    await expect.poll(() => diffTokens(page, 2), { timeout: 1500 }).toEqual(['', '', '', '']);
    expect(await page.locator('.lyrics-section .section-textarea').nth(2).inputValue()).toBe(before2);
    expect(await diffTokens(page, 3)).toEqual(['≠7']);

    // 標題列沒有多出按鈕
    expect(await headerBtns()).toBe(btnsBefore);
    expect(errors).toEqual([]);
    await context.close();
});
