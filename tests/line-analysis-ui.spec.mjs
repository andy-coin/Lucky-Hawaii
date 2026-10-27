// 句構分析與設定頁（第 11 階段）的瀏覽器測試：逐行標記、對照、換行不變、分析面板、偏好設定…
// 標題的第一個詞（常駐／對照／換行不變／最後視覺列／詞庫載入／分析面板／hover／組字／偏好設定／顯示方式／韻族顏色／預覽）
// 對應 11-VALIDATION.md 的 -g 篩選；之後的計畫會在這支檔案繼續加
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage, openTwoTabs, stubWordlist } from './helpers.mjs';

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
    expect(await sec.locator('.section-menu-block > .section-menu-cap:first-child').allTextContents()).toEqual(['韻腳地圖', '句構分析', '顯示方式']);
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
