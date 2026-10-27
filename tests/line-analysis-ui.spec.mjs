// 句構分析與設定頁（第 11 階段）的瀏覽器測試：逐行標記、對照、換行不變、分析面板、偏好設定…
// 標題的第一個詞（常駐／對照／換行不變／最後視覺列／詞庫載入／分析面板／hover／組字／偏好設定／顯示方式／韻族顏色／預覽）
// 對應 11-VALIDATION.md 的 -g 篩選；之後的計畫會在這支檔案繼續加
import { test, expect, chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage, compose, openTwoTabs, stubWordlist } from './helpers.mjs';
import { DEVICES, setScale, waitStill } from './layout-lib.mjs';

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

const F_ABAB = ['我望著遠方的光', '走過熟悉的街道', '你笑著說天亮', '不怕前方的路遙'].join('\n');
const openPrefs = page => page.evaluate(() => lhMapOpenPrefs());

test('偏好設定：內容與順序', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        wordlist: 'stub',
        storage: v2Storage([song([typed('sa', 'verse', ['我望著遠方的光', '獨自站在窗'].join('\n')), typed('sb', 'verse', ['我望著遠方的光', '獨自站在窗前'].join('\n'))])]),
    });
    // 沒打開前只有外殼，標題在自動備份之後、意見回饋之前
    expect(await page.evaluate(() => [...document.querySelectorAll('.settings-dropdown > details, .settings-dropdown > .settings-feedback-btn')].map(e => e.id || e.className))).toEqual(['autoBackupSection', 'mapSettingsSection', 'settings-feedback-btn save-load-btn']);
    await openPrefs(page);
    const sec = page.locator('#mapSettingsSection');
    await expect(sec.locator('> .settings-backups-hint')).toHaveText('調整句尾上色、逐行字數與斷句標記的開關、位置、大小和顏色');
    expect(await sec.locator('.section-menu-block > .section-menu-cap:first-child').allTextContents()).toEqual(['韻腳地圖', '句構分析', '顯示方式', '韻族顏色']);
    expect(await sec.locator('.rm-switch-label').allTextContents()).toEqual(['句尾上色', '段落結構字母', '句中押韻', '忽略句尾語助詞', '逐行標記', '行尾韻腳字母', '字數', '斷句結構', '對照差異']);
    const particle = await page.evaluate(() => LH_MAP_PARTICLE_CAP);
    const caps = await sec.locator('.section-menu-cap').allTextContents();
    for (const c of [
        '在每個段落標題列顯示 AABB 這類字母', '句子裡面跟句尾押同韻的字，加底線（每行最多 3 個）', particle, '押韻判定',
        '寬韻：同一個韻族都算押韻（例：ㄤ、ㄧㄤ、ㄨㄤ）',
        '每行旁邊顯示淡色小字；下面四項決定要顯示什麼', 'A、B…，跟著上面的寬韻／嚴格', '每行幾個字（空白、標點不算）',
        '例如 3+4。你自己打的空白和標點一定算；開頭有 ≈ 的是機器猜的', '跟同類型第一段的同一行字數不同時，標出 ≠ 和對方的字數',
    ]) expect(caps, c).toContain(c);
    // 每個說明都有 id，開關用 aria-describedby 接起來
    expect(await sec.locator('.rm-switch[aria-describedby]').evaluateAll(els => els.map(e => !!document.getElementById(e.getAttribute('aria-describedby'))))).toEqual(Array(8).fill(true));   // 句尾上色沒有說明
    // 四個細項縮排在 .rm-sub 裡，從不禁用
    expect(await sec.locator('.rm-sub .rm-switch .rm-switch-label').allTextContents()).toEqual(['行尾韻腳字母', '字數', '斷句結構', '對照差異']);
    expect(await sec.locator('.rm-switch[disabled], .rm-switch[aria-disabled]').count()).toBe(0);

    // 逐行標記關著：細項照樣能設、值留著；總開關打開後立刻生效
    await expect(prefSw(page, '逐行標記')).toHaveAttribute('aria-checked', 'false');
    await prefSw(page, '對照差異').click();
    await expect(prefSw(page, '對照差異')).toHaveAttribute('aria-checked', 'true');
    await expect(prefSw(page, '逐行標記')).toHaveAttribute('aria-checked', 'false');
    await expect(page.locator('.lm-mk')).toHaveCount(0);
    await prefSw(page, '逐行標記').click();
    await expect(prefSw(page, '對照差異')).toHaveAttribute('aria-checked', 'true');
    expect(await diffTokens(page, 1)).toEqual(['', '≠5']);
    expect(errors).toEqual([]);
    await context.close();
});

test('偏好設定：兩邊同步', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', F_ABAB)])]) });
    await openPrefs(page);
    await prefSw(page, '段落結構字母').click();
    await expect(page.locator('.section-rhyme').first()).toBeVisible();
    await page.locator('#settingsOverlay').click({ position: { x: 4, y: 4 } });
    await page.locator('#rhymeMenuBtn').click();
    await expect(menuSw(page, '段落結構字母')).toHaveAttribute('aria-checked', 'true');
    await expect(menuSw(page, '段落結構字母')).toContainText('開');
    await page.locator('#rhymeMenu .type-row[data-m="strict"]').click();
    await page.locator('#rhymeMenu .rm-more').click();
    const strictRow = page.locator('#mapSettingsSection .type-row[data-m="strict"]');
    await expect(strictRow).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('#mapSettingsSection .rm-mode-help')).toHaveText(await page.evaluate(() => LH_MAP_MODE_HELP.strict));
    // 反過來：在偏好設定改回寬韻，選單跟著
    await page.locator('#mapSettingsSection .type-row[data-m="wide"]').click();
    await page.locator('#settingsOverlay').click({ position: { x: 4, y: 4 } });
    await page.locator('#rhymeMenuBtn').click();
    await expect(page.locator('#rhymeMenu .type-row[data-m="wide"]')).toHaveAttribute('aria-checked', 'true');
    await page.locator('#rhymeMenu .type-row[data-m="strict"]').click();
    await page.keyboard.press('Escape');
    // 重新整理後兩邊都記得
    await page.reload();
    await ready(page);
    await page.locator('#rhymeMenuBtn').click();
    await expect(page.locator('#rhymeMenu .type-row[data-m="strict"]')).toHaveAttribute('aria-checked', 'true');
    await expect(menuSw(page, '段落結構字母')).toHaveAttribute('aria-checked', 'true');
    await page.locator('#rhymeMenu .rm-more').click();
    await expect(page.locator('#mapSettingsSection .type-row[data-m="strict"]')).toHaveAttribute('aria-checked', 'true');
    await expect(prefSw(page, '段落結構字母')).toHaveAttribute('aria-checked', 'true');
    expect(errors).toEqual([]);
    await context.close();
});

test('偏好設定：別的分頁改了設定', async ({ browser }) => {
    const storage = { ...v2Storage([song([typed('sa', 'verse', '月光 灑在 窗前')])]), 'lh:map': '{"end":true,"letters":false,"inner":false,"strict":false,"skipParticles":true,"line":true}' };
    const { context, pages, errs } = await openTwoTabs(browser, storage);
    const [a, b] = pages;
    await openPrefs(b);
    await expect(prefSw(b, '斷句結構')).toHaveAttribute('aria-checked', 'true');
    expect(await b.locator('.rhyme-mirror .lm-t-s').count()).toBe(1);
    await a.evaluate(() => localStorage.setItem('lh:map', '{"end":true,"letters":false,"inner":false,"strict":false,"skipParticles":true,"line":true,"lnSplit":false}'));
    await expect(prefSw(b, '斷句結構')).toHaveAttribute('aria-checked', 'false');
    await expect(prefSw(b, '斷句結構')).toContainText('關');
    await expect(b.locator('.rhyme-mirror .lm-t-s')).toHaveCount(0);
    await expect(b.locator('.rhyme-mirror .lm-t-c')).toHaveCount(1);
    for (const e of errs) expect(e.errors).toEqual([]);
    await context.close();
});

test('偏好設定：四個細項都關', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', '月光 灑在 窗前')])]) });
    await openPrefs(page);
    const none = page.locator('#mapSettingsSection .rm-none');
    await expect(none).toBeHidden();
    await prefSw(page, '逐行標記').click();
    await expect(none).toBeHidden();   // 字數與斷句預設開著
    await prefSw(page, '字數').click();
    await prefSw(page, '斷句結構').click();
    await expect(none).toBeVisible();
    await expect(none).toHaveText('四個細項都關著，所以沒有東西可顯示');
    await expect(page.locator('.lm-mk')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-lm'))).toBeNull();
    // 細項沒被禁用，值各自留著
    await expect(prefSw(page, '字數')).toBeEnabled();
    await expect(prefSw(page, '字數')).toHaveAttribute('aria-checked', 'false');
    await prefSw(page, '行尾韻腳字母').click();
    await expect(none).toBeHidden();
    await expect(page.locator('.lm-mk')).toHaveCount(1);
    expect(errors).toEqual([]);
    await context.close();
});

test('偏好設定：每次從齒輪打開都收著，Esc 關掉', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', F_ABAB)])]) });
    await openPrefs(page);
    await expect(page.locator('#mapSettingsSection')).toHaveJSProperty('open', true);
    await page.keyboard.press('Escape');
    await expect(page.locator('#settingsOverlay')).not.toHaveClass(/show/);
    await page.evaluate(() => toggleSettings());
    await expect(page.locator('#settingsOverlay')).toHaveClass(/show/);
    await expect(page.locator('#mapSettingsSection')).toHaveJSProperty('open', false);
    // 自己點開也行；方向鍵只移焦點，Enter 才選
    await page.locator('#mapSettingsSection > summary').click();
    await expect(page.locator('#mapSettingsSection')).toHaveJSProperty('open', true);
    const wide = page.locator('#mapSettingsSection .type-row[data-m="wide"]');
    const strict = page.locator('#mapSettingsSection .type-row[data-m="strict"]');
    await wide.focus();
    await page.keyboard.press('ArrowRight');
    await expect(strict).toBeFocused();
    await expect(strict).toHaveAttribute('aria-checked', 'false');
    await page.keyboard.press('Enter');
    await expect(strict).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');
    await expect(page.locator('#settingsOverlay')).not.toHaveClass(/show/);
    expect(errors).toEqual([]);
    await context.close();
});

test('常駐：行尾韻腳字母跟著寬韻嚴格', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', F_ABAB)])]) });
    await page.evaluate(() => { lhMapSetSetting('line', true); lhMapSetSetting('lnRhyme', true); });
    const letters = () => page.locator('.lyrics-section').first().locator('.rhyme-mirror .lm-t-r').evaluateAll(els => els.map(e => [e.textContent, e.dataset.f !== undefined]));
    for (const strict of [false, true]) {
        await page.evaluate(v => lhMapSetSetting('strict', v), strict);
        const want = await page.evaluate(([t, st]) => Array.from(lhRhymeAnalyze(t, { strict: st, skipParticles: true }, null).letters), [F_ABAB, strict]);
        const got = await letters();
        expect(got.map(x => x[0]), strict ? '嚴格' : '寬韻').toEqual(want);
        for (const [t, hasF] of got) expect(hasF, '有韻腳的字母才有家族色').toBe(t !== '-');
    }
    expect((await letters()).length).toBe(4);
    expect(errors).toEqual([]);
    await context.close();
});

test('詞庫載入：先只有字數與明確斷點，載好後補上 ≈', async ({ browser }) => {
    const MINI = ['{"w":"夢裡","z":"ㄇㄥˋ ㄌㄧˇ","p":0}', '{"w":"想起","z":"ㄒㄧㄤˇ ㄑㄧˇ","p":0}', '{"w":"你的","z":"ㄋㄧˇ ㄉㄜ˙","p":0}'].join('\n') + '\n';
    let release;
    const gate = new Promise(r => { release = r; });
    const { context, page, errors } = await bootPage(browser, {
        waitWordlist: false,
        storage: { ...v2Storage([song([typed('sa', 'verse', '月光 灑在 窗前\n夢裡想起你的臉')])]), 'lh:map': '{"end":true,"letters":false,"inner":false,"strict":false,"skipParticles":true,"line":true}' },
        beforeGoto: async ({ context: c }) => {
            await stubWordlist(c, MINI);
            await c.route(/\/data\/wordlist-c0\d\.json(\?.*)?$/, async route => { await gate; await route.fallback(); });
        },
    });
    await expect.poll(() => markers(page)).toEqual([['6', '2+2+2'], ['7', '']]);
    await openPrefs(page);
    await expect(page.locator('#mapSettingsSection .rm-lex-wait')).toHaveText('詞庫載入中，≈ 的自動斷句稍後補上');
    await expect(page.locator('#mapSettingsSection .rm-lex-wait')).toBeVisible();
    release();
    await page.evaluate(() => window.__lhMapReady);
    await expect.poll(() => markers(page)).toEqual([['6', '2+2+2'], ['7', '≈2+2+3']]);
    await expect(page.locator('#mapSettingsSection .rm-lex-wait')).toBeHidden();
    expect(errors).toEqual([]);
    await context.close();
});

// ==================== 顯示方式（11-03） ====================
const lookRadio = (page, k, v) => page.locator(`#mapSettingsSection .type-row[data-k="${k}"][data-v="${v}"]`);
const LOOK_ON = { 'lh:map': JSON.stringify({ line: true, lnRhyme: true, lnCount: true, lnSplit: true, lnDiff: true }) };
// 一段 n 行：「月光 灑在 窗前」，odd 行多一個「啊」（和 6 字的對照段落字數不同，標 ≠）
const TAIL_A = Array.from({ length: 60 }, () => '月光 灑在 窗前').join('\n');
const TAIL_B = Array.from({ length: 60 }, (_, n) => '月光 灑在 窗前' + (n % 2 ? '啊' : '')).join('\n');

// 第 n 個標記相對於它那一行最後一個非空白字元的位置：{ dx: 標記左緣 - 字右緣, dTop: 標記上緣 - 該字所在視覺列的上緣, text }
// 視覺列上緣＝字的 client rect 上緣 - (行高 - 字框高) / 2（文字框在行盒裡置中）
const markGeo = (page, secIdx, idxs) => page.evaluate(([secIdx, idxs]) => {
    const mirror = document.querySelectorAll('.lyrics-section')[secIdx].querySelector('.rhyme-mirror');
    const mks = [...mirror.querySelectorAll('.lm-mk')];
    return idxs.map(i => {
        const m = mks[i];
        let node = m.previousSibling;
        while (node && node.nodeType !== 3) node = node.lastChild;   // 最後一個字可能包在色塊 span 裡
        const rg = document.createRange();
        rg.setStart(node, node.length - 1);
        rg.setEnd(node, node.length);
        const rects = rg.getClientRects(), c = rects[rects.length - 1], mr = m.getBoundingClientRect();
        const lh = parseFloat(getComputedStyle(mirror).lineHeight);
        return { dx: mr.left - c.right, dTop: mr.top - (c.top - (lh - c.height) / 2) };
    });
}, [secIdx, idxs]);

test('顯示方式：切到句尾後，標記貼在最後一個字後面，游標選取捲動都不動', async ({ browser }) => {
    const sections = [typed('sa', 'verse', TAIL_A), typed('sb', 'verse', TAIL_B)];
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: v2Storage([song(sections)], { ...OPEN_PANELS, ...LOOK_ON }) });
    await expect(page.locator('.lyrics-section').nth(1).locator('.lm-mk')).toHaveCount(60);
    const ta = page.locator('.lyrics-section .section-textarea').nth(1);
    await page.evaluate(() => {
        const t = document.querySelectorAll('.section-textarea')[1];
        t.focus(); t.setSelectionRange(3, 5); t.scrollTop = 120;
        window.__ta = t;
        window.__mks = [...document.querySelectorAll('.lyrics-section')[1].querySelectorAll('.lm-mk')];
    });
    await expect.poll(() => page.evaluate(() => document.querySelectorAll('.rhyme-mirror')[1].scrollTop)).toBe(120);
    const state = () => page.evaluate(() => {
        const t = document.querySelectorAll('.section-textarea')[1];
        const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
        return {
            same: t === window.__ta, sel: [t.selectionStart, t.selectionEnd], top: t.scrollTop,
            nodes: window.__mks.every(m => m.isConnected), count: document.querySelectorAll('.lyrics-section')[1].querySelectorAll('.lm-mk').length,
            lm: document.documentElement.getAttribute('data-lm'), pad: parseFloat(getComputedStyle(t).paddingRight), base: 0.75 * rem,
        };
    });
    const right = await state();
    expect(right.lm).toBe('right');
    expect(right.pad).toBeGreaterThan(right.base + 20);

    await page.evaluate(() => lhMapOpenPrefs());
    await expect(lookRadio(page, 'pos', 'right')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('#mapSettingsSection .rm-pos-help')).toHaveText('靠右欄：輸入框右邊留一條欄位，數字上下對齊，但寫字的寬度會少一點');
    await lookRadio(page, 'pos', 'tail').click();
    const tail = await state();
    expect(tail.lm).toBe('tail');
    expect(tail.same, '輸入框還是同一個節點').toBe(true);
    expect(tail.sel, '選取不動').toEqual([3, 5]);
    expect(tail.top, '捲動位置不動').toBe(120);
    expect(tail.nodes, '標記節點沒有被重建').toBe(true);
    expect(tail.count).toBe(60);
    expect(tail.pad, '句尾後不加內距').toBeCloseTo(tail.base, 1);
    await expect(lookRadio(page, 'pos', 'tail')).toHaveAttribute('aria-checked', 'true');
    await expect(lookRadio(page, 'pos', 'right')).toHaveAttribute('aria-checked', 'false');
    await expect(page.locator('#mapSettingsSection .rm-pos-help')).toHaveText('句尾後：標記緊貼每行最後一個字，不佔寬度；行太滿時會被輸入框邊緣切掉');
    expect(await lsGetMap(page)).toContain('"pos":"tail"');

    // 標記緊貼最後一個字：左緣在字的右邊 0.5em 內（0.95rem 的 0.5em ≈ 7.6px），上緣在同一個視覺列
    for (const g of await markGeo(page, 1, [1, 5, 41])) {
        expect(g.dx, '標記在字的右邊').toBeGreaterThanOrEqual(-0.5);
        expect(g.dx, '標記離字不遠').toBeLessThan(12);
        expect(Math.abs(g.dTop), '標記在字所在的視覺列').toBeLessThanOrEqual(1);
    }
    // 讀起來是「字母 · 字數 ≠對方 · 斷句」，空欄位不出現；· 是 ::before，所以逐個欄位組字串
    const text = await page.evaluate(() => {
        const m = document.querySelectorAll('.lyrics-section')[1].querySelectorAll('.lm-mk')[1];
        return [...m.querySelectorAll('.lm-t')].filter(t => getComputedStyle(t).display !== 'none').map((t, n) => {
            const b = getComputedStyle(t, '::before').content;
            return (b === 'none' || b === 'normal' ? (n ? ' ' : '') : ' ' + JSON.parse(b)) + t.textContent;
        }).join('');
    });
    expect(text.replace(/\s+/g, ' ')).toMatch(/^\S · 7 ≠6 · 2\+2\+3$/);
    // 沒有對照差異的偶數行：沒有 ≠ 欄位
    const even = await page.evaluate(() => [...document.querySelectorAll('.lyrics-section')[1].querySelectorAll('.lm-mk')[0].querySelectorAll('.lm-t')].filter(t => getComputedStyle(t).display !== 'none').map(t => t.className.replace('lm-t ', '')));
    expect(even).toEqual(['lm-t-r', 'lm-t-c', 'lm-t-s']);

    // 切回靠右欄：內距回來、標記還是同一批節點、游標選取捲動照舊
    await lookRadio(page, 'pos', 'right').click();
    const back = await state();
    expect(back.lm).toBe('right');
    expect(back.pad).toBeGreaterThan(back.base + 20);
    expect(back.same && back.nodes && back.count === 60).toBe(true);
    expect(back.sel).toEqual([3, 5]);
    expect(back.top).toBe(120);
    expect(await lsGetMap(page)).not.toContain('"pos"');
    expect(await ta.evaluate(t => t.value.length)).toBeGreaterThan(0);
    expect(errors).toEqual([]);
    await context.close();
});

// 非孤句色塊（.rm-hl 不含 .rm-solo）第一個的計算底色
const bandBg = page => page.evaluate(() => { const e = document.querySelector('.rm-hl:not(.rm-solo)'); return e ? getComputedStyle(e).backgroundColor : null; });
// 第 n 個段落的 [輸入框右內距, 欄位上限 36% 的像素, 第一個 .lm-t 的字級, 根字級]
const lookGeo = page => page.evaluate(() => {
    const ta = document.querySelector('.section-textarea');
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    return { pad: parseFloat(getComputedStyle(ta).paddingRight), cap: 0.36 * parseFloat(getComputedStyle(ta.parentElement).width), fs: parseFloat(getComputedStyle(document.querySelector('.rhyme-mirror .lm-t')).fontSize), rem };
});

test('顯示方式：字級與濃淡馬上生效、不重畫', async ({ browser }) => {
    const text = Array.from({ length: 4 }, () => F_ABAB).join('\n');
    const { context, page, errors } = await bootPage(browser, {
        wordlist: 'stub',
        storage: v2Storage([song([typed('sa', 'verse', text)])], { ...OPEN_PANELS, 'lh:map': JSON.stringify({ line: true, lnCount: true, lnSplit: true }) }),
    });
    await expect(page.locator('.lm-mk')).toHaveCount(16);
    await expect.poll(() => page.locator('.rm-hl').count()).toBeGreaterThan(0);
    await page.evaluate(() => { window.__mks = [...document.querySelectorAll('.lm-mk')]; window.__mirror = document.querySelector('.rhyme-mirror'); });
    const same = () => page.evaluate(() => window.__mks.every(m => m.isConnected) && document.querySelectorAll('.lm-mk').length === 16 && document.querySelector('.rhyme-mirror') === window.__mirror);
    await page.evaluate(() => lhMapOpenPrefs());
    const depthHelp = page.locator('#mapSettingsSection .rm-depth-help');

    // 預設：中、標準
    await expect(lookRadio(page, 'size', 'm')).toHaveAttribute('aria-checked', 'true');
    await expect(lookRadio(page, 'depth', 'std')).toHaveAttribute('aria-checked', 'true');
    await expect(depthHelp).toBeHidden();
    const mid = await lookGeo(page);
    expect(mid.fs).toBeCloseTo(0.875 * mid.rem, 1);
    const stdBg = await bandBg(page);
    expect(stdBg).not.toBeNull();
    await page.evaluate(() => lhMapMenuBuild());
    const swBg = () => page.evaluate(() => getComputedStyle(document.querySelector('#rhymeMenu .rm-sw[data-f="0"]')).backgroundColor);
    const stdSw = await swBg();

    // 大：1rem，欄位變寬（不超過 36%），節點不重建
    await lookRadio(page, 'size', 'l').click();
    const big = await lookGeo(page);
    expect(big.fs).toBeCloseTo(big.rem, 1);
    if (7.5 * big.rem < big.cap) expect(big.pad).toBeGreaterThan(mid.pad + 1);
    expect(big.pad).toBeLessThanOrEqual(0.75 * big.rem + big.cap + 0.5 * big.rem + 1);
    expect(await same()).toBe(true);
    expect(await lsGetMap(page)).toContain('"size":"l"');
    // 小：0.75 倍
    await lookRadio(page, 'size', 's').click();
    const small = await lookGeo(page);
    expect(small.fs).toBeCloseTo(0.75 * small.rem, 1);
    expect(small.pad).toBeLessThan(mid.pad - 1);
    expect(await same()).toBe(true);
    expect(await lsGetMap(page)).toContain('"size":"s"');

    // 濃：底色不同、說明出現、節點不變；淡：說明收起
    await lookRadio(page, 'depth', 'heavy').click();
    expect(await bandBg(page)).not.toBe(stdBg);
    await expect(depthHelp).toBeVisible();
    await expect(depthHelp).toHaveText('濃：色塊比較明顯，深色主題下有些顏色的字會比較不好讀');
    expect(await swBg(), '色票對照的色塊跟著變').not.toBe(stdSw);
    expect(await same()).toBe(true);
    expect(await lsGetMap(page)).toContain('"depth":"heavy"');
    const heavyBg = await bandBg(page);
    await lookRadio(page, 'depth', 'light').click();
    const lightBg = await bandBg(page);
    expect(lightBg).not.toBe(stdBg);
    expect(lightBg).not.toBe(heavyBg);
    await expect(depthHelp).toBeHidden();
    expect(await same()).toBe(true);
    expect(await page.evaluate(() => [document.documentElement.style.getPropertyValue('--rm-end'), document.documentElement.style.getPropertyValue('--rm-orph')])).toEqual(['26%', '14%']);

    // 重新整理後小與淡還在
    await page.reload();
    await ready(page);
    await expect(page.locator('.lm-mk')).toHaveCount(16);
    expect((await lookGeo(page)).fs).toBeCloseTo(0.75 * mid.rem, 1);
    expect(await bandBg(page)).toBe(lightBg);
    // 回到中、標準：lh:map 不再寫這兩個鍵
    await page.evaluate(() => lhMapOpenPrefs());
    await lookRadio(page, 'size', 'm').click();
    await lookRadio(page, 'depth', 'std').click();
    expect(await lsGetMap(page)).not.toMatch(/"size"|"depth"/);
    expect(await bandBg(page)).toBe(stdBg);

    // 壞值：位置、字級、濃淡都退回預設，別的東西不受影響
    await page.evaluate(() => localStorage.setItem('lh:map', JSON.stringify({ line: true, lnCount: true, pos: 'left', size: 'xl', depth: 'x;}body{display:none' })));
    await page.reload();
    await ready(page);
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-lm'))).toBe('right');
    expect((await lookGeo(page)).fs).toBeCloseTo(0.875 * mid.rem, 1);
    expect(await bandBg(page)).toBe(stdBg);
    expect(await page.evaluate(() => getComputedStyle(document.body).display)).not.toBe('none');
    expect(await page.evaluate(() => [document.documentElement.style.getPropertyValue('--rm-end'), document.documentElement.style.getPropertyValue('--lm-fs')])).toEqual(['34%', '0.875rem']);
    await page.evaluate(() => lhMapOpenPrefs());
    for (const [k, v] of [['pos', 'right'], ['size', 'm'], ['depth', 'std']]) await expect(lookRadio(page, k, v)).toHaveAttribute('aria-checked', 'true');
    expect(errors).toEqual([]);
    await context.close();
});

// ==================== 換行不變與最後視覺列（11-03，held-out） ====================
// 15px 的實體捲軸（和 tests/rhyme-map-ui.spec.mjs 同一套）；on=false 完全沒有捲軸
const launchWithBars = () => chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] });
const injectScrollbar = (page, on) => page.evaluate(on => {
    let st = document.getElementById('rmTestBar');
    if (!st) { st = document.createElement('style'); st.id = 'rmTestBar'; document.head.appendChild(st); }
    st.textContent = on ? '.section-textarea::-webkit-scrollbar { width: 15px } .section-textarea::-webkit-scrollbar-thumb { background: #888 }'
        : '.section-textarea::-webkit-scrollbar { display: none }';
}, on);
const frames = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 60)))));
// ≤900 是底部 sheet：歌詞 sheet 沒開就開（再按同一個 tab 會關掉，所以先看狀態）
const ensureLyrics = page => page.evaluate(() => { if (lhIsSheetMode() && document.getElementById('leftPanel').classList.contains('collapsed')) mobileTab('lyrics'); });
const loadCoreSnap = page => page.evaluate(() => {
    // 鏡像層裡「不在標記裡」的每個字：位置（相對鏡像層）、螢幕座標、每個邏輯行的視覺列數
    const ZW = '​';
    window.__wt = {
        snap(mirror) {
            const mr = mirror.getBoundingClientRect(), wk = document.createTreeWalker(mirror, NodeFilter.SHOW_TEXT);
            const pos = [], rel = [], nums = [], rows = [], tops = [new Set()];
            let text = '';
            for (let n; (n = wk.nextNode());) {
                if (n.parentNode.closest('.lm-mk')) continue;
                for (let i = 0; i < n.data.length; i++) {
                    const c = n.data[i];
                    text += c;
                    if (c === '\n') { pos.push(null); rel.push('\n'); tops.push(new Set()); continue; }
                    const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1);
                    const q = r.getClientRects(), z = q[q.length - 1];
                    if (!z) { pos.push(null); rel.push('x'); continue; }
                    pos.push([z.left, z.top + z.height / 2]);
                    rel.push((z.top - mr.top).toFixed(2) + ':' + (z.left - mr.left).toFixed(2));
                    nums.push(z.top - mr.top, z.left - mr.left);
                    if (c !== ' ' && c !== '\t' && c !== '　' && c !== ZW) tops[tops.length - 1].add(Math.round(z.top));
                }
            }
            return { text, pos, sig: rel.join(','), nums, rows: tops.map(t => t.size) };
        },
        // 輸入框每個字的位置：用 lhMirror 建一個排版相同的隱形 div，算法和 lhCaretRect 一樣（左緣、行中心）
        ta(ta) {
            const m = lhMirror(ta), cs = getComputedStyle(ta), rect = ta.getBoundingClientRect(), mr = m.getBoundingClientRect();
            const lh = parseFloat(cs.lineHeight), bl = parseFloat(cs.borderLeftWidth), bt = parseFloat(cs.borderTopWidth);
            const pos = [], rel = [], nums = [];
            for (let i = 0; i < ta.value.length; i++) {
                if (ta.value[i] === '\n') { pos.push(null); rel.push('\n'); continue; }
                const r = _lhCharRect(m.firstChild, i);
                pos.push([rect.left + bl + (r.left - mr.left) - ta.scrollLeft, rect.top + bt + (r.top - mr.top) + r.height / 2 - ta.scrollTop]);
                rel.push((r.top - mr.top).toFixed(2) + ':' + (r.left - mr.left).toFixed(2));
                nums.push(r.top - mr.top, r.left - mr.left);
            }
            m.remove();
            return { pos, sig: rel.join(','), nums };
        },
    };
});
// 標記暫時從版面拿掉（display: none）再量一次：和有標記時比，字的位置必須一樣
const withoutMarkers = async (page, fn) => {
    await page.evaluate(() => { const st = document.createElement('style'); st.id = 'noMk'; st.textContent = '.lm-mk { display: none !important }'; document.head.appendChild(st); });
    try { return await fn(); } finally { await page.evaluate(() => document.getElementById('noMk').remove()); }
};
const mirrorSnap = page => page.evaluate(() => { const ta = document.querySelector('.section-textarea'); ta.scrollTop = 0; ta.previousElementSibling.scrollTop = 0; return window.__wt.snap(ta.previousElementSibling); });
const taSnap = page => page.evaluate(() => window.__wt.ta(document.querySelector('.section-textarea')));
// 位置逐個比，容許 0.05px 的浮點誤差（插入一個 style 重算版面會讓 278.875 變成 278.87 或 278.88）；1px 的位移不會被藏起來
const sameNums = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 0.05);
const setViewport = async (page, w) => { await page.setViewportSize({ width: w, height: 900 }); await ensureLyrics(page); await frames(page); };

// 45 行：41 行「N 個字＋行尾空白」（N=5…45，空白依序輪流半形、全形、tab）＋純標點＋英文長串＋中英混排＋200 字元
const WS_KINDS = [' ', '　', '\t'];
const CJK = '愛你月光灑在窗前夢裡想起遠方的光走過熟悉的街道終於我也回到天亮不怕路遙';
const WRAP_LINES = [
    ...Array.from({ length: 41 }, (_, k) => Array.from(CJK.repeat(2)).slice(0, k + 5).join('') + WS_KINDS[k % 3]),
    '，。', 'Supercalifragilisticexpialidocious'.repeat(2), '愛你ab路'.repeat(8), '愛你ab路'.repeat(40),
];
const WRAP_TEXT = WRAP_LINES.join('\n');
const WRAP_MAP = { line: true, lnRhyme: true, lnCount: true, lnSplit: true };
const wrapStorage = () => v2Storage([song([typed('sa', 'verse', WRAP_TEXT)])], { ...OPEN_PANELS, 'lh:map': JSON.stringify(WRAP_MAP) });
const mkIdx = line => (line < 41 ? line : line - 1);   // 純標點那行沒有標記
// 每個「N 字＋空白」行（0…40）的視覺列數
const wsRows = async page => (await mirrorSnap(page)).rows.slice(0, 41);
// 在 [330, 900]（sheet 模式，輸入框寬度跟著視窗變）找第一個在這個範圍內會換行的「N 字＋空白」行 j，和它剛好從兩列變一列的最小寬度 w（w-1 還是兩列）
async function findBoundary(page) {
    await setViewport(page, 330);
    const lo = await wsRows(page);
    await setViewport(page, 900);
    const hi = await wsRows(page);
    const j = lo.findIndex((r, k) => r > hi[k]);
    if (j < 0) return null;
    let a = 330, b = 900;   // rows(a) > rows(b)
    while (b - a > 1) {
        const mid = (a + b) >> 1;
        await setViewport(page, mid);
        if ((await wsRows(page))[j] > hi[j]) a = mid; else b = mid;
    }
    return { j, w: b };
}

test('換行不變：標記開關前後每個字的位置都一樣', async () => {
    test.setTimeout(420000);
    const browser = await launchWithBars();
    const WIDTHS = [330, 360, 390, 430, 520, 640, 760, 900, 1000, 1200, 1500];
    let matrix = 0;
    for (const pct of [50, 100, 150]) {
        const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, wordlist: 'stub', storage: wrapStorage() });
        await setScale(page, pct);
        await expect(page.locator('.lm-mk').first()).toBeAttached();
        await loadCoreSnap(page);
        for (const pos of ['right', 'tail']) {
            await page.evaluate(p => lhMapSetSetting('pos', p), pos);
            for (const bar of [false, true]) {
                await injectScrollbar(page, bar);
                await setViewport(page, 640);
                expect(await page.evaluate(() => { const t = document.querySelector('.section-textarea'); return t.offsetWidth - t.clientWidth; }), '捲軸寬').toBe(bar ? 15 : 0);
                const b = await findBoundary(page);
                expect(b, `${pct}% ${pos} ${bar}：範圍內有會換行的行`).not.toBeNull();
                const widths = [...WIDTHS, b.w - 1, b.w];
                for (const w of widths) {
                    const tag = `${pct}% ${pos} ${bar ? '有' : '無'}捲軸 ${w}px`;
                    await setViewport(page, w);
                    const on = await mirrorSnap(page);
                    const off = await withoutMarkers(page, () => mirrorSnap(page));
                    expect(sameNums(on.nums, off.nums), `${tag}：有／無標記時鏡像層每個字的位置相同`).toBe(true);
                    expect(on.rows.slice(0, 41), `${tag}：行尾空白的行沒有多一個視覺列`).toEqual(off.rows.slice(0, 41));
                    const value = await page.evaluate(() => document.querySelector('.section-textarea').value);
                    expect(on.text, `${tag}：鏡像層文字就是輸入框文字`).toBe(value + '​');
                    const ta = await taSnap(page);
                    // 左緣差 1px 以內、而且每個字落在同一個視覺列。不比上下的絕對座標：lhMirror 把行高複製成 px，長文字每列會差 1/64px，
                    // 一百多列累積到 2px（這是量測用的隱形 div 的誤差，真正的鏡像層與輸入框在「鏡像對齊：與文字框逐像素相同」已逐像素比過）
                    const rowIdx = pos => { let r = -1, last = -1e9; return pos.map(p => { if (!p) return null; if (Math.abs(p[1] - last) > 3) r++; last = p[1]; return r; }); };
                    const mRows = rowIdx(on.pos), tRows = rowIdx(ta.pos);
                    on.pos.forEach((m, i) => {
                        const t = ta.pos[i];
                        if (!m || !t) return;
                        if (Math.abs(m[0] - t[0]) > 1 || mRows[i] !== tRows[i]) expect.soft(false, `${tag}：第 ${i} 個字 (${value[i]}) 鏡像 ${m} 列 ${mRows[i]}，輸入框 ${t} 列 ${tRows[i]}`).toBe(true);
                    });
                    matrix++;
                    // 句尾後不加內距：標記開關前後輸入框每個字的位置也一樣
                    if (pos === 'tail' && (w === b.w - 1 || w === b.w || w === 330 || w === 1500)) {
                        await page.evaluate(() => lhMapSetSetting('line', false));
                        await frames(page);
                        const taOff = await taSnap(page);
                        await page.evaluate(() => lhMapSetSetting('line', true));
                        await frames(page);
                        expect(sameNums(ta.nums, taOff.nums), `${tag}：輸入框每個字的位置在標記開關前後相同`).toBe(true);
                    }
                }
            }
        }
        expect(errors, `${pct}%：沒有任何頁面錯誤（含 ResizeObserver）`).toEqual([]);
        await context.close();
    }
    expect(matrix).toBe(3 * 2 * 2 * 13);
    await browser.close();
});

test('最後視覺列：換行的行標記在最後一個視覺列', async () => {
    test.setTimeout(300000);
    const browser = await launchWithBars();
    for (const pct of [50, 100, 150]) {
        const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, wordlist: 'stub', storage: wrapStorage() });
        await setScale(page, pct);
        await expect(page.locator('.lm-mk').first()).toBeAttached();
        await loadCoreSnap(page);
        for (const pos of ['right', 'tail']) {
            await page.evaluate(p => lhMapSetSetting('pos', p), pos);
            for (const bar of [false, true]) {
                await injectScrollbar(page, bar);
                await setViewport(page, 640);
                const b = await findBoundary(page);
                expect(b).not.toBeNull();
                for (const w of [b.w - 2, b.w - 1, b.w, b.w + 1]) {
                    const tag = `${pct}% ${pos} ${bar ? '有' : '無'}捲軸 ${w}px`;
                    await setViewport(page, w);
                    // 兩列的那一行（N 字＋空白）與 200 字元那一行：標記的上緣都在最後一個字的視覺列
                    const geo = await markGeo(page, 0, [mkIdx(b.j), mkIdx(44)]);
                    const rows = (await mirrorSnap(page)).rows;
                    expect(rows[44], `${tag}：200 字元那行真的折成很多列`).toBeGreaterThan(2);
                    geo.forEach((g, k) => {
                        expect(Math.abs(g.dTop), `${tag}：${k ? '200 字元' : '兩列'}那行的標記在最後一個視覺列`).toBeLessThanOrEqual(1);
                        if (pos === 'tail') {
                            expect(g.dx, `${tag}：標記在字的右邊`).toBeGreaterThanOrEqual(-0.5);
                        }
                    });
                    if (pos === 'right') {
                        const err = await page.evaluate(() => {
                            const ta = document.querySelector('.section-textarea'), mirror = ta.previousElementSibling;
                            const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
                            const bar = ta.offsetWidth - ta.clientWidth;
                            const want = ta.getBoundingClientRect().right - bar - 0.75 * rem;
                            return [...mirror.querySelectorAll('.lm-mk')].slice(0, 44).map(m => Math.abs(m.getBoundingClientRect().right - want));
                        });
                        for (const e of err) expect(e, `${tag}：欄位右緣離捲軸 0.75rem`).toBeLessThanOrEqual(1.5);
                        if (w === b.w) (test.info().annotations).push({ type: 'gutter-edge-error', description: `${tag}：${Math.max(...err).toFixed(3)}px` });
                    }
                }
            }
        }
        expect(errors).toEqual([]);
        await context.close();
    }
    await browser.close();
});

test('最後視覺列：手機放大 150% 欄位不超過 36%，結構太長時裁切', async () => {
    test.setTimeout(120000);
    const browser = await launchWithBars();
    const LONG = '我 你 他 她 它 們 好 壞 大 小 多';
    const { context, page, errors } = await bootPage(browser, {
        device: DEVICES.phone, wordlist: 'stub',
        storage: v2Storage([song([typed('sa', 'verse', ['月光 灑在 窗前', LONG].join('\n'))])], { ...OPEN_PANELS, 'lh:map': JSON.stringify(WRAP_MAP) }),
    });
    await setScale(page, 150);
    await page.locator('#mtab-lyrics').tap();
    await waitStill(page);
    await injectScrollbar(page, true);
    await frames(page);
    await expect(page.locator('.lm-mk')).toHaveCount(2);
    const r = await page.evaluate(() => {
        const ta = document.querySelector('.section-textarea'), mirror = ta.previousElementSibling;
        const mks = [...mirror.querySelectorAll('.lm-mk')], m = mks[1], s = m.querySelector('.lm-t-s');
        // 第二行最後一個字的右緣
        let node = m.previousSibling;
        while (node && node.nodeType !== 3) node = node.lastChild;
        const rg = document.createRange(); rg.setStart(node, node.length - 1); rg.setEnd(node, node.length);
        const rects = rg.getClientRects(), c = rects[rects.length - 1];
        return { w: m.getBoundingClientRect().width, body: ta.parentElement.getBoundingClientRect().width, sw: s.scrollWidth, cw: s.clientWidth, gap: m.getBoundingClientRect().left - c.right, text: s.textContent };
    });
    expect(r.text).toBe('1+1+1+1+1+1+1+1+1+1+1');
    expect(r.w, '欄位寬度不超過輸入框的 36%').toBeLessThanOrEqual(0.36 * r.body + 1);
    expect(r.sw, '結構太長：被裁切').toBeGreaterThan(r.cw);
    expect(r.gap, '歌詞的字不會伸到欄位底下').toBeGreaterThanOrEqual(-0.5);
    expect(errors).toEqual([]);
    await context.close();
    await browser.close();
});

// ==================== 組字與打字中的過期處理（11-03） ====================
const installCounters = page => page.evaluate(() => {
    window.__an = 0; window.__paint = 0;
    const o = window.lhRhymeAnalyze;
    window.lhRhymeAnalyze = function (...a) { window.__an++; return o.apply(this, a); };
    const p = window.lhMapPaint;
    window.lhMapPaint = function (...a) { window.__paint++; return p.apply(this, a); };
    window.__mut = 0;
    window.__mo = new MutationObserver(rs => { window.__mut += rs.length; });
    document.querySelectorAll('.rhyme-mirror').forEach(m => window.__mo.observe(m, { childList: true, subtree: true }));
});
const counters = page => page.evaluate(() => ({ analyze: window.__an, paint: window.__paint, mutations: window.__mut + window.__mo.takeRecords().length }));
const mirrorCls = page => page.locator('.rhyme-mirror').first().evaluate(m => ({ stale: m.classList.contains('rm-stale'), typing: m.classList.contains('lm-typing') }));
const lastCount = page => page.locator('.rhyme-mirror .lm-mk').last().evaluate(m => m.querySelector('.lm-t-c').textContent);
const F_TAIL = ['我望著遠方的光', '走過熟悉的街道', '你笑著說天亮', '不怕前方的路遙'].join('\n');
const tailStorage = pos => v2Storage([song([typed('sa', 'verse', F_TAIL)])], { ...OPEN_PANELS, 'lh:map': JSON.stringify({ line: true, lnCount: true, ...(pos === 'tail' ? { pos } : {}) }) });
const caretToEnd = page => page.evaluate(() => { const ta = document.querySelector('.section-textarea'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); ta.scrollTop = ta.scrollHeight; });

test('組字：標記開著時組字中鏡像零變動', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: tailStorage('tail') });
    await expect(page.locator('.rhyme-mirror .lm-mk')).toHaveCount(4);
    expect(await lastCount(page)).toBe('7');
    await installCounters(page);
    await caretToEnd(page);
    await page.waitForTimeout(150);
    let during = null;
    await compose(page, ['ㄌ', 'ㄌㄧ', 'ㄌㄧㄤˋ'], '亮', async () => {
        during = { ...(await counters(page)), ...(await mirrorCls(page)) };
    });
    expect(during.analyze, '組字中不分析').toBe(0);
    expect(during.paint, '組字中不重畫').toBe(0);
    expect(during.mutations, '組字中鏡像層零個節點變動').toBe(0);
    expect(during.stale, '行尾打字不整層藏').toBe(false);
    await expect.poll(async () => (await mirrorCls(page)).typing, { timeout: 2000 }).toBe(false);
    await expect.poll(() => lastCount(page), { timeout: 2000 }).toBe('8');
    const c = await counters(page);
    expect(c.paint, '確認後只重畫一次').toBe(1);
    expect(c.analyze, '確認後只分析一次').toBe(1);
    expect(errors).toEqual([]);
    await context.close();
});

test('組字：句尾打字標記先藏、換行或句中修改整層藏，重畫後恢復', async ({ browser }) => {
    for (const pos of ['tail', 'right']) {
        const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: tailStorage(pos) });
        await expect(page.locator('.rhyme-mirror .lm-mk')).toHaveCount(4);
        const vis = () => page.evaluate(() => {
            const m = document.querySelector('.rhyme-mirror');
            return { mirror: getComputedStyle(m).visibility, mk: getComputedStyle(m.querySelector('.lm-mk')).visibility, hl: m.querySelector('.rm-hl') ? getComputedStyle(m.querySelector('.rm-hl')).visibility : 'none' };
        });
        await caretToEnd(page);
        await page.keyboard.type('亮');   // 行尾打字
        let cls = await mirrorCls(page);
        expect(cls.stale, pos + '：行尾打字不整層藏').toBe(false);
        expect(cls.typing, pos + '：只有句尾後才藏標記').toBe(pos === 'tail');
        const v = await vis();
        expect(v.mirror).toBe('visible');
        expect(v.mk, pos + '：標記').toBe(pos === 'tail' ? 'hidden' : 'visible');
        expect(v.hl, pos + '：色塊照舊').not.toBe('hidden');
        await expect.poll(() => lastCount(page), { timeout: 2000, message: pos + '：重畫後字數更新' }).toBe('8');
        expect(await mirrorCls(page)).toEqual({ stale: false, typing: false });
        // Enter：行數變了，整層藏
        await page.keyboard.press('Enter');
        expect((await mirrorCls(page)).stale).toBe(true);
        expect((await mirrorCls(page)).typing).toBe(false);
        await expect.poll(async () => JSON.stringify(await mirrorCls(page)), { timeout: 2000 }).toBe('{"stale":false,"typing":false}');
        await page.keyboard.type('天亮');
        await expect.poll(async () => JSON.stringify(await mirrorCls(page)), { timeout: 2000 }).toBe('{"stale":false,"typing":false}');
        await expect(page.locator('.rhyme-mirror .lm-mk')).toHaveCount(5);
        // 新的一行標記在它的最後一個視覺列
        const g = await markGeo(page, 0, [4]);
        expect(Math.abs(g[0].dTop)).toBeLessThanOrEqual(1);
        // 句中修改：整層藏，重畫後解除
        await page.evaluate(() => { const ta = document.querySelector('.section-textarea'); ta.focus(); ta.setSelectionRange(3, 3); });
        await page.keyboard.type('X');
        expect((await mirrorCls(page)).stale, pos + '：句中修改整層藏').toBe(true);
        await expect.poll(async () => JSON.stringify(await mirrorCls(page)), { timeout: 2000 }).toBe('{"stale":false,"typing":false}');
        expect(await page.locator('.rhyme-mirror .lm-mk').first().locator('.lm-t-c').textContent()).toBe('8');
        expect(errors).toEqual([]);
        await context.close();
    }
});

// ==================== 韻族顏色（11-04） ====================
const F_AABB = ['我望著遠方的光', '獨自站在窗', '走過熟悉的街道', '終於我也回到'].join('\n');
const colorInput = (page, n) => page.locator(`#mapSettingsSection .rm-colors input[data-n="${n}"]`);
const rootVar = (page, n) => page.evaluate(n => document.documentElement.style.getPropertyValue('--rm-c' + n), n);
const setColorInput = (page, n, value, ev) => page.evaluate(([n, value, ev]) => {
    const i = document.querySelector(`#mapSettingsSection .rm-colors input[data-n="${n}"]`);
    i.value = value;
    i.dispatchEvent(new Event(ev, { bubbles: true }));
}, [n, value, ev]);
const live = page => page.evaluate(() => document.getElementById('lhLive').textContent);

test('韻族顏色：改一個韻族的顏色，色塊馬上變、存起來、日夜共用', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', F_AABB)])]) });
    await expect.poll(() => page.locator('.rm-hl').count()).toBeGreaterThan(0);
    // 光那一行句尾的家族編號從頁面讀，不寫死
    const f = await page.evaluate(() => [...document.querySelectorAll('.rm-hl')].find(e => e.textContent === '光').dataset.f);
    const label = await page.evaluate(n => RHYME_FAMILIES[n].label, +f);
    await page.evaluate(() => lhMapOpenPrefs());
    await page.evaluate(() => lhMapMenuBuild());
    const light = await page.evaluate(f => LH_RHYME_COLORS.light[f], +f);
    await expect(colorInput(page, f)).toHaveValue(light);
    await expect(colorInput(page, f)).toHaveAttribute('aria-label', `「${label}」韻族顏色`);
    await expect(page.locator('#mapSettingsSection .rm-colors .rm-color-cell')).toHaveCount(17);
    expect(await page.locator('#mapSettingsSection .rm-colors input').count()).toBe(16);
    const band = () => page.evaluate(() => getComputedStyle([...document.querySelectorAll('.rm-hl')].find(e => e.textContent === '光')).backgroundColor);
    const swatch = () => page.evaluate(f => getComputedStyle(document.querySelector(`#rhymeMenu .rm-sw[data-f="${f}"]`)).backgroundColor, f);
    const bg0 = await band(), sw0 = await swatch();
    await page.evaluate(() => { window.__mirror = document.querySelector('.rhyme-mirror'); window.__hl = document.querySelector('.rm-hl'); });
    const mapBefore = await lsGetMap(page);

    // 拖曳中（input）：變數、色塊、色票馬上變；不存、不重畫
    await setColorInput(page, f, '#123456', 'input');
    expect(await rootVar(page, f)).toBe('#123456');
    expect(await band()).not.toBe(bg0);
    expect(await swatch()).not.toBe(sw0);
    expect(await lsGetMap(page)).toBe(mapBefore);
    expect(await page.evaluate(() => window.__mirror === document.querySelector('.rhyme-mirror') && window.__hl === document.querySelector('.rm-hl') && window.__hl.isConnected)).toBe(true);

    // 放開（change）：存進 lh:map，念給讀屏軟體聽
    await setColorInput(page, f, '#123456', 'change');
    expect(await lsGetMap(page)).toContain(`"colors":{"${f}":"#123456"}`);
    expect(await live(page)).toBe(`已更新「${label}」韻族顏色`);
    expect(await page.evaluate(() => window.__hl.isConnected), '放開也不重畫').toBe(true);

    // 深色主題：自訂色照用，色票顯示它
    await page.evaluate(() => applyTheme(true, false));
    expect(await rootVar(page, f)).toBe('#123456');
    await expect(colorInput(page, f)).toHaveValue('#123456');
    const other = (+f + 1) % 16;
    await expect(colorInput(page, other)).toHaveValue(await page.evaluate(n => LH_RHYME_COLORS.dark[n], other));   // 沒改的家族換成深色預設
    await page.evaluate(() => applyTheme(false, false));

    // 重新整理還在
    await page.reload();
    await ready(page);
    expect(await rootVar(page, f)).toBe('#123456');
    await page.evaluate(() => lhMapOpenPrefs());
    await expect(colorInput(page, f)).toHaveValue('#123456');

    // 備份帶著它，匯入整理後逐字相同
    const [saved, parsed] = await page.evaluate(() => {
        const bk = lhBuildBackup(songs, activeSongId, []);
        const r = lhParseBackup(JSON.stringify(bk));
        return [bk.settings['lh:map'], r.settings['lh:map']];
    });
    expect(saved).toContain('"#123456"');
    expect(parsed).toBe(saved);
    expect(errors).toEqual([]);
    await context.close();
});
