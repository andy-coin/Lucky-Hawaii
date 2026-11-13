// 句構分析與設定頁（第 11 階段）的瀏覽器測試：逐行標記、對照、換行不變、分析面板、偏好設定…
// 標題的第一個詞（常駐／對照／換行不變／最後視覺列／詞庫載入／分析面板／hover／組字／偏好設定／顯示方式／韻族顏色／預覽）
// 對應 11-VALIDATION.md 的 -g 篩選；之後的計畫會在這支檔案繼續加
import { test, expect, chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage, compose, openTwoTabs, stubWordlist, STORAGE_SPY } from './helpers.mjs';
import { DEVICES, setScale, waitStill, emulateKeyboard, readKeyboard, insideVisible, hitMin } from './layout-lib.mjs';

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
// 每一行：[右欄字數, 行下面的斷句（每組 .lm-g 的 data-n 用 + 接起來，沒有結構是 ''）]
const markers = page => page.locator('#lyricsSections .lyrics-section').first().locator('.rhyme-mirror').evaluate(m => {
    const out = []; let g = [];
    for (const n of m.childNodes) {
        if (n.nodeType === 3) { if (n.textContent.includes('\n')) g = []; continue; }
        if (n.classList.contains('lm-g')) g.push(n.dataset.n);
        else if (n.classList.contains('lm-mk')) { out.push([n.querySelector('.lm-t-c')?.textContent ?? null, g.join('+')]); g = []; }
    }
    return out;
});

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
    expect(await markers(page)).toEqual([['6', '2+2+2'], ['7', '2+2+3'], ['10', '3+2+2+3'], ['13', '2+2+2+2+2+3']]);

    // 只有機器猜的那幾組數字是斜體（自己打的空白、標點分出來的是正體）
    const guess = await page.locator('#lyricsSections .lyrics-section').first().locator('.rhyme-mirror').evaluate(m => {
        const out = []; let g = '';
        for (const n of m.childNodes) {
            if (n.classList?.contains('lm-g')) g += n.classList.contains('lm-g-guess') ? (getComputedStyle(n, '::after').fontStyle === 'italic' ? 'i' : '?') : (getComputedStyle(n, '::after').fontStyle === 'normal' ? 'n' : '?');
            else if (n.classList?.contains('lm-mk')) { out.push(g); g = ''; }
        }
        return out;
    });
    expect(guess).toEqual(['nnn', 'iii', 'iiii', 'nnniii']);

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
            let prev = m.previousSibling;   // 該行的文字（最後一組可能包在 .lm-g 裡）
            while (prev.nodeType !== 3) prev = prev.lastChild;
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
    expect(await markers(page)).toEqual([['6', '2+2+2'], ['7', '2+2+3'], ['10', '3+2+2+3'], ['13', '2+2+2+2+2+3']]);

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
    await menuSw(page, '句構判定').click();
    await expect(page.locator('#rhymeHintLine')).toHaveText('打開後照細項顯示：行尾韻腳、字數靠右，斷句結構畫在每行下面；細項在「更多設定」');
    await page.locator('#rhymeMenu .rm-more').click();
    await expect(page.locator('#rhymeMenu')).toBeHidden();
    await expect(page.locator('#settingsOverlay')).toHaveClass(/show/);
    await expect(page.locator('#mapSettingsSection')).toBeVisible();
    await expect(page.locator('#prefsTab-map')).toBeFocused();

    // 對照差異預設關：沒有差異欄
    await expect(page.locator('.lm-t-d')).toHaveCount(0);
    await page.evaluate(() => lhMapSetSetting('lnDiff', !_lhMapSet.lnDiff));   // 對照差異的開關先藏起來了
    await expect.poll(() => page.evaluate(() => _lhMapSet.lnDiff)).toBe(true);
    expect(await lsGetMap(page)).toContain('"lnDiff":true');
    expect(await lsGetMap(page)).toContain('"line":true');
    expect(await diffTokens(page, 0), '第一段沒有對照').toEqual(['', '', '']);
    expect(await diffTokens(page, 1), '第一個 Chorus 沒有對照').toEqual(['']);
    expect(await diffTokens(page, 2)).toEqual(['', '≠5', '', '']);   // 第四行對照段落沒有，什麼都不加
    expect(await diffTokens(page, 3), 'Verse III 也對 Verse I').toEqual(['≠7']);
    expect(await page.locator('.lyrics-section').nth(2).locator('.lm-t-d').nth(1).evaluate(e => getComputedStyle(e).fontWeight)).toBe('700');

    // 兩邊同一份設定
    await expect(prefSw(page, '句構判定')).toContainText('開');
    // 已經開著時再叫一次，不會把面板關掉
    await page.evaluate(() => lhMapOpenPrefs());
    await expect(page.locator('#settingsOverlay')).toHaveClass(/show/);
    await page.locator('#settingsOverlay').click({ position: { x: 4, y: 4 } });
    await expect(page.locator('#settingsOverlay')).not.toHaveClass(/show/);
    await page.locator('#rhymeMenuBtn').click();
    await expect(menuSw(page, '句構判定')).toHaveAttribute('aria-checked', 'true');
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

// 審查 WR-01：改段落類型只走 lhSecRefreshMeta，不經過打字排程；對照段落換人後 ≠ 也要跟著換
test('對照：改了段落類型，對照段落換人，≠ 跟著更新', async ({ browser }) => {
    const sections = [
        typed('s1', 'verse', ['我望著遠方的光', '獨自站在窗', '走過熟悉的街道'].join('\n')),
        typed('s3', 'verse', ['我望著遠方的光', '獨自站在窗前', '走過熟悉的街道'].join('\n')),
        typed('s4', 'verse', '月光 灑在 窗前'),
    ];
    const { context, page, errors } = await bootPage(browser, {
        wordlist: 'stub',
        storage: v2Storage([song(sections)], { ...OPEN_PANELS, 'lh:map': JSON.stringify({ line: true, lnDiff: true }) }),
    });
    expect(await diffTokens(page, 1)).toEqual(['', '≠5', '']);
    expect(await diffTokens(page, 2)).toEqual(['≠7']);
    // 第一段 Verse → 下一個類型：原本的 Verse II 變成第一個 Verse，自己沒有對照；Verse III 改對它
    await page.locator('.lyrics-section').first().locator('.section-type').click();   // 下拉選單
    await page.locator('#sectionMenu .type-row[data-type="prechorus"]').click();
    expect(await page.evaluate(() => curSong().sections[0].type)).not.toBe('verse');
    await expect.poll(() => diffTokens(page, 1), { timeout: 1500 }).toEqual(['', '', '']);
    expect(await diffTokens(page, 2)).toEqual(['≠7']);
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
    expect(await page.evaluate(() => [...document.querySelectorAll('.settings-dropdown > [role=tabpanel]')].map(e => e.id))).toEqual(['prefsPanel-look', 'prefsPanel-search', 'mapSettingsSection', 'prefsPanel-ai', 'prefsPanel-data', 'prefsPanel-help']);
    expect(await page.locator('#mapSettingsSection').evaluate(e => e.childElementCount), '沒切到這個分頁前只有外殼').toBe(0);
    await openPrefs(page);
    const sec = page.locator('#mapSettingsSection');
    await expect(sec.locator('> .settings-backups-hint')).toHaveText('調整句尾上色、逐行字數與斷句標記的開關、位置、大小和顏色');
    expect(await sec.locator('.section-menu-block > .section-menu-cap:first-child').allTextContents()).toEqual(['韻腳地圖模式', '預覽', '韻腳地圖', '句構分析', '顯示方式', '韻族顏色']);
    expect(await sec.locator('.rm-switch-label').allTextContents()).toEqual(['雙押／多押', '自動配色', '段落結構', '句中押韻', '忽略句尾語助詞', '句構判定', '行尾韻腳', '字數', '斷句結構', '反白停留自動分析']);
    const particle = await page.evaluate(() => LH_MAP_PARTICLE_CAP);
    const caps = await sec.locator('.section-menu-cap').allTextContents();
    for (const c of [
        await page.evaluate(() => LH_MAP_MODE_HINT), await page.evaluate(() => LH_MAP_HINT_LETTERS), await page.evaluate(() => LH_MAP_HINT_INNER), particle, '押韻判定',
        '寬韻：同一個韻族都算押韻（例：ㄤ、ㄧㄤ、ㄨㄤ）',
        '打開後照下面的細項顯示', '直接寫這一行的韻腳（ㄤ、ㄠ…），跟著上面的寬韻／嚴格', '每行幾個字（空白、標點不算）',
        '畫在每行下面：每一組字底下一個小括號和字數；斜體數字是機器猜的，可以在「📏 分析」裡改',
        '反白後滑鼠停著不動 1.5 秒，自動打開句構面板；只有接了滑鼠的電腦會自動出現，觸控請按「分析」',
    ]) expect(caps, c).toContain(c);
    // 每個說明都有 id，開關用 aria-describedby 接起來
    expect(await sec.locator('.rm-switch[aria-describedby]').evaluateAll(els => els.map(e => !!document.getElementById(e.getAttribute('aria-describedby'))))).toEqual(Array(10).fill(true));
    // 四個細項縮排在 .rm-sub 裡，從不禁用
    expect(await sec.locator('.rm-sub .rm-switch .rm-switch-label').allTextContents()).toEqual(['行尾韻腳', '字數', '斷句結構']);   // 對照差異先藏起來
    expect(await sec.locator('.rm-switch[disabled], .rm-switch[aria-disabled]').count()).toBe(0);

    // 逐行標記關著：細項照樣能設、值留著；總開關打開後立刻生效
    await expect(prefSw(page, '句構判定')).toHaveAttribute('aria-checked', 'false');
    await page.evaluate(() => lhMapSetSetting('lnDiff', !_lhMapSet.lnDiff));   // 對照差異的開關先藏起來了
    await expect.poll(() => page.evaluate(() => _lhMapSet.lnDiff)).toBe(true);
    await expect(prefSw(page, '句構判定')).toHaveAttribute('aria-checked', 'false');
    await expect(page.locator('.lm-mk')).toHaveCount(0);
    await prefSw(page, '句構判定').click();
    await expect.poll(() => page.evaluate(() => _lhMapSet.lnDiff)).toBe(true);
    expect(await diffTokens(page, 1)).toEqual(['', '≠5']);
    expect(errors).toEqual([]);
    await context.close();
});

test('偏好設定：兩邊同步', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', F_ABAB)])]) });
    await openPrefs(page);
    await prefSw(page, '段落結構').click();
    await expect(page.locator('.section-rhyme').first()).toBeVisible();
    await page.locator('#settingsOverlay').click({ position: { x: 4, y: 4 } });
    await page.locator('#rhymeMenuBtn').click();
    await expect(menuSw(page, '段落結構')).toHaveAttribute('aria-checked', 'true');
    await expect(menuSw(page, '段落結構')).toContainText('開');
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
    await expect(menuSw(page, '段落結構')).toHaveAttribute('aria-checked', 'true');
    await page.locator('#rhymeMenu .rm-more').click();
    await expect(page.locator('#mapSettingsSection .type-row[data-m="strict"]')).toHaveAttribute('aria-checked', 'true');
    await expect(prefSw(page, '段落結構')).toHaveAttribute('aria-checked', 'true');
    expect(errors).toEqual([]);
    await context.close();
});

test('偏好設定：別的分頁改了設定', async ({ browser }) => {
    const storage = { ...v2Storage([song([typed('sa', 'verse', '月光 灑在 窗前')])]), 'lh:map': '{"end":true,"letters":false,"inner":false,"strict":false,"skipParticles":true,"line":true}' };
    const { context, pages, errs } = await openTwoTabs(browser, storage);
    const [a, b] = pages;
    await openPrefs(b);
    await expect(prefSw(b, '斷句結構')).toHaveAttribute('aria-checked', 'true');
    expect(await b.locator('#lyricsSections .rhyme-mirror .lm-g').count()).toBe(3);
    await a.evaluate(() => localStorage.setItem('lh:map', '{"end":true,"letters":false,"inner":false,"strict":false,"skipParticles":true,"line":true,"lnSplit":false}'));
    await expect(prefSw(b, '斷句結構')).toHaveAttribute('aria-checked', 'false');
    await expect(prefSw(b, '斷句結構')).toContainText('關');
    await expect(b.locator('#lyricsSections .rhyme-mirror .lm-g')).toHaveCount(0);
    await expect(b.locator('#lyricsSections .rhyme-mirror .lm-t-c')).toHaveCount(1);
    for (const e of errs) expect(e.errors).toEqual([]);
    await context.close();
});

test('偏好設定：四個細項都關', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', '月光 灑在 窗前')])]) });
    await openPrefs(page);
    const none = page.locator('#mapSettingsSection .rm-none');
    await expect(none).toBeHidden();
    await prefSw(page, '句構判定').click();
    await expect(none).toBeHidden();   // 字數與斷句預設開著
    await prefSw(page, '字數').click();
    await prefSw(page, '斷句結構').click();
    await expect(none).toBeVisible();
    await expect(none).toHaveText('細項都關著，所以沒有東西可顯示');
    await expect(page.locator('#lyricsSections .lm-mk')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-lm'))).toBeNull();
    // 細項沒被禁用，值各自留著
    await expect(prefSw(page, '字數')).toBeEnabled();
    await expect(prefSw(page, '字數')).toHaveAttribute('aria-checked', 'false');
    await prefSw(page, '行尾韻腳').click();
    await expect(none).toBeHidden();
    await expect(page.locator('#lyricsSections .lm-mk')).toHaveCount(1);
    expect(errors).toEqual([]);
    await context.close();
});

test('偏好設定：齒輪打開到上次看的分頁，Esc 關掉', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', F_ABAB)])]) });
    // 這次開網頁第一次從齒輪打開：第一個分頁「外觀」
    await page.evaluate(() => toggleSettings());
    await expect(page.locator('#prefsTab-look')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#mapSettingsSection')).toBeHidden();
    await page.keyboard.press('Escape');
    await openPrefs(page);
    await expect(page.locator('#mapSettingsSection')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#settingsOverlay')).not.toHaveClass(/show/);
    // 再從齒輪打開：停在上次的「韻腳與句構」
    await page.evaluate(() => toggleSettings());
    await expect(page.locator('#settingsOverlay')).toHaveClass(/show/);
    await expect(page.locator('#mapSettingsSection')).toBeVisible();
    await expect(page.locator('#prefsTab-map')).toHaveAttribute('aria-selected', 'true');
    // 方向鍵只移焦點，Enter 才選
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
        const want = await page.evaluate(([t, st]) => lhRhymeAnalyze(t, { strict: st, skipParticles: true }, null).rows.map(r => r.label || '-'), [F_ABAB, strict]);
        const got = await letters();
        expect(got.map(x => x[0]), strict ? '嚴格' : '寬韻').toEqual(want);
        for (const [t, hasF] of got) expect(hasF, '有韻腳的字母才有家族色').toBe(t !== '-');
    }
    expect((await letters()).length).toBe(4);
    expect(errors).toEqual([]);
    await context.close();
});

test('詞庫載入：先只有字數與明確斷點，載好後補上括號', async ({ browser }) => {
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
    await expect(page.locator('#mapSettingsSection .rm-lex-wait')).toHaveText('詞庫載入中，括號裡的自動斷句稍後補上');
    await expect(page.locator('#mapSettingsSection .rm-lex-wait')).toBeVisible();
    release();
    await page.evaluate(() => window.__lhMapReady);
    await expect.poll(() => markers(page)).toEqual([['6', '2+2+2'], ['7', '2+2+3']]);
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
        const st = document.createElement('style');   // 段落平常自動長高不捲；模擬鍵盤打開時自己捲的情況（CSS !important 蓋掉高度）
        st.textContent = '.section-textarea { height: 150px !important; overflow-y: auto !important; }';
        document.head.appendChild(st);
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
    expect(text.replace(/\s+/g, ' ')).toMatch(/^\S+ · 7 ≠6$/);   // 斷句改畫在行下面，不在標記裡
    // 沒有對照差異的偶數行：沒有 ≠ 欄位
    const even = await page.evaluate(() => [...document.querySelectorAll('.lyrics-section')[1].querySelectorAll('.lm-mk')[0].querySelectorAll('.lm-t')].filter(t => getComputedStyle(t).display !== 'none').map(t => t.className.replace('lm-t ', '')));
    expect(even).toEqual(['lm-t-r', 'lm-t-c']);

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
const bandBg = page => page.evaluate(() => { const e = document.querySelector('#lyricsSections .rm-hl:not(.rm-solo)'); return e ? getComputedStyle(e).backgroundColor : null; });
// 第 n 個段落的 [輸入框右內距, 欄位上限 36% 的像素, 第一個 .lm-t 的字級, 根字級]
const lookGeo = page => page.evaluate(() => {
    const ta = document.querySelector('.section-textarea');
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    return { pad: parseFloat(getComputedStyle(ta).paddingRight), cap: 0.36 * parseFloat(getComputedStyle(ta.parentElement).width), fs: parseFloat(getComputedStyle(document.querySelector('#lyricsSections .rhyme-mirror .lm-t')).fontSize), rem };
});

test('顯示方式：字級與濃淡馬上生效、不重畫', async ({ browser }) => {
    const text = Array.from({ length: 4 }, () => F_ABAB).join('\n');
    const { context, page, errors } = await bootPage(browser, {
        wordlist: 'stub',
        storage: v2Storage([song([typed('sa', 'verse', text)])], { ...OPEN_PANELS, 'lh:map': JSON.stringify({ line: true, lnCount: true, lnSplit: true }) }),
    });
    await expect(page.locator('#lyricsSections .lm-mk')).toHaveCount(16);
    await expect.poll(() => page.locator('#lyricsSections .rm-hl').count()).toBeGreaterThan(0);
    await page.evaluate(() => { window.__mks = [...document.querySelectorAll('#lyricsSections .lm-mk')]; window.__mirror = document.querySelector('#lyricsSections .rhyme-mirror'); });
    const same = () => page.evaluate(() => window.__mks.every(m => m.isConnected) && document.querySelectorAll('#lyricsSections .lm-mk').length === 16 && document.querySelector('#lyricsSections .rhyme-mirror') === window.__mirror);
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
    const swBg = () => page.evaluate(() => (f => { let e = document.getElementById('__swProbe'); if (!e) { e = document.createElement('span'); e.id = '__swProbe'; e.className = 'rm-sw'; document.body.append(e); } e.dataset.f = f; return getComputedStyle(e).backgroundColor; })('0'))   // 選單的色票圖例拿掉了：用一個暫時色塊量;
    const stdSw = await swBg();

    // 大：1rem，欄位變寬（不超過 36%），節點不重建
    await lookRadio(page, 'size', 'l').click();
    const big = await lookGeo(page);
    expect(big.fs).toBeCloseTo(big.rem, 1);
    if (9.5 * big.rem < big.cap) expect(big.pad).toBeGreaterThan(mid.pad + 1);   // 字數 1.5em＋斷句 7.5em＋間距 0.5em
    expect(big.pad).toBeLessThanOrEqual(0.75 * big.rem + big.cap + 0.5 * big.rem + 1);
    expect(await same()).toBe(true);
    expect(await lsGetMap(page)).toContain('"size":"l"');
    // 小：0.75 倍
    await lookRadio(page, 'size', 's').click();
    const small = await lookGeo(page);
    expect(small.fs).toBeCloseTo(0.75 * small.rem, 1);
    // 中字的欄寬可能已被 36% 上限夾住，這時小字只保證不比較寬
    if (9.5 * 0.875 * small.rem < small.cap) expect(small.pad).toBeLessThan(mid.pad - 1);
    else expect(small.pad).toBeLessThanOrEqual(mid.pad + 0.5);
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
    await expect(page.locator('#lyricsSections .lm-mk')).toHaveCount(16);
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
    st.textContent = on ? '.section-textarea { overflow-y: scroll !important } .section-textarea::-webkit-scrollbar { width: 15px } .section-textarea::-webkit-scrollbar-thumb { background: #888 }'
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
                    // （斷句結構畫在行下面時會刻意加大行高，所以這裡先關掉斷句結構再比）
                    if (pos === 'tail' && (w === b.w - 1 || w === b.w || w === 330 || w === 1500)) {
                        await page.evaluate(() => lhMapSetSetting('lnSplit', false));
                        await frames(page);
                        const taOn = await taSnap(page);
                        await page.evaluate(() => lhMapSetSetting('line', false));
                        await frames(page);
                        const taOff = await taSnap(page);
                        await page.evaluate(() => { lhMapSetSetting('line', true); lhMapSetSetting('lnSplit', true); });
                        await frames(page);
                        expect(sameNums(taOn.nums, taOff.nums), `${tag}：輸入框每個字的位置在標記開關前後相同`).toBe(true);
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

test('最後視覺列：手機放大 150% 欄位不超過 36%，長結構畫在行下面', async () => {
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
        const mks = [...mirror.querySelectorAll('.lm-mk')], m = mks[1];
        // 第二行最後一個字的右緣
        let node = m.previousSibling;
        while (node && node.nodeType !== 3) node = node.lastChild;
        const rg = document.createRange(); rg.setStart(node, node.length - 1); rg.setEnd(node, node.length);
        const rects = rg.getClientRects(), c = rects[rects.length - 1];
        return { w: m.getBoundingClientRect().width, body: ta.parentElement.getBoundingClientRect().width, gap: m.getBoundingClientRect().left - c.right, groups: mirror.querySelectorAll('.lm-g').length };
    });
    expect(r.groups, '兩行的斷句都畫在行下面（3＋11 組）').toBe(14);
    expect(r.w, '欄位寬度不超過輸入框的 36%').toBeLessThanOrEqual(0.36 * r.body + 1);
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
    // 這題測「韻族固定色」：關掉自動配色
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', F_AABB)])], { ...OPEN_PANELS, 'lh:map': JSON.stringify({ end: true, letters: false, inner: false, strict: false, skipParticles: true, autoColor: false }) }) });
    await expect.poll(() => page.locator('#lyricsSections .rm-hl').count()).toBeGreaterThan(0);
    // 光那一行句尾的家族編號從頁面讀，不寫死
    const f = await page.evaluate(() => [...document.querySelectorAll('#lyricsSections .rm-hl')].find(e => e.textContent === '光').dataset.f);
    const label = await page.evaluate(n => RHYME_FAMILIES[n].label, +f);
    await page.evaluate(() => lhMapOpenPrefs());
    await page.evaluate(() => lhMapMenuBuild());
    const light = await page.evaluate(f => LH_RHYME_COLORS.light[f], +f);
    await expect(colorInput(page, f)).toHaveValue(light);
    await expect(colorInput(page, f)).toHaveAttribute('aria-label', `「${label}」韻族顏色`);
    await expect(page.locator('#mapSettingsSection .rm-colors .rm-color-cell')).toHaveCount(17);
    expect(await page.locator('#mapSettingsSection .rm-colors input').count()).toBe(16);
    const band = () => page.evaluate(() => getComputedStyle([...document.querySelectorAll('#lyricsSections .rm-hl')].find(e => e.textContent === '光')).backgroundColor);
    const swatch = () => page.evaluate(f => (f => { let e = document.getElementById('__swProbe'); if (!e) { e = document.createElement('span'); e.id = '__swProbe'; e.className = 'rm-sw'; document.body.append(e); } e.dataset.f = f; return getComputedStyle(e).backgroundColor; })(String(f)), f);
    const bg0 = await band(), sw0 = await swatch();
    await page.evaluate(() => { window.__mirror = document.querySelector('#lyricsSections .rhyme-mirror'); window.__hl = document.querySelector('#lyricsSections .rm-hl'); });
    const mapBefore = await lsGetMap(page);

    // 拖曳中（input）：變數、色塊、色票馬上變；不存、不重畫
    await setColorInput(page, f, '#123456', 'input');
    expect(await rootVar(page, f)).toBe('#123456');
    expect(await band()).not.toBe(bg0);
    expect(await swatch()).not.toBe(sw0);
    expect(await lsGetMap(page)).toBe(mapBefore);
    expect(await page.evaluate(() => window.__mirror === document.querySelector('#lyricsSections .rhyme-mirror') && window.__hl === document.querySelector('#lyricsSections .rm-hl') && window.__hl.isConnected)).toBe(true);

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

// 按真正的主題按鈕（會連 loadColors 一起跑：深色主題的文字色是反轉後的，直接呼叫 applyTheme 不會換）
// R2：主題鈕循環五個主題，按到明暗對了為止
const setDark = (page, dark) => page.evaluate(d => { for (let i = 0; i < 5 && isDark !== d; i++) document.getElementById('themeToggle').click(); }, dark);
const resetBtn = page => page.locator('#mapSettingsSection .rm-color-reset');
const advice = page => page.locator('#mapSettingsSection .rm-color-advice');

test('韻族顏色：恢復預設要按兩次', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', F_AABB)])]) });
    await page.evaluate(() => lhMapOpenPrefs());
    const btn = resetBtn(page);
    // 沒有自訂色：禁用，按了沒反應
    await expect(btn).toHaveAttribute('aria-disabled', 'true');
    await expect(btn).toHaveText('恢復預設顏色');
    await btn.evaluate(b => b.click());   // aria-disabled 的按鈕 Playwright 不肯點，直接送出點擊
    await expect(btn).toHaveText('恢復預設顏色');
    await expect(btn).not.toHaveAttribute('data-armed', '1');

    await setColorInput(page, 3, '#112233', 'change');
    await setColorInput(page, 5, '#445566', 'change');
    await expect(btn).toHaveAttribute('aria-disabled', 'false');
    // 第一下：武裝；4 秒後自己解除
    await btn.click();
    await expect(btn).toHaveAttribute('data-armed', '1');
    await expect(btn).toHaveText('再按一次確定恢復');
    expect(await lsGetMap(page)).toContain('"colors"');
    await page.waitForTimeout(4100);
    await expect(btn).not.toHaveAttribute('data-armed', '1');
    await expect(btn).toHaveText('恢復預設顏色');
    expect(await lsGetMap(page)).toContain('"colors"');
    // 離開按鈕也解除
    await btn.click();
    await expect(btn).toHaveAttribute('data-armed', '1');
    await btn.evaluate(b => b.blur());
    await expect(btn).not.toHaveAttribute('data-armed', '1');

    // 舊的「重設顏色!」不碰韻族顏色
    await page.locator('button.reset-color', { hasText: '重設顏色!' }).evaluate(b => b.click());   // 在「外觀」分頁（目前看不到），直接送出點擊
    expect(await lsGetMap(page)).toContain('"3":"#112233"');
    await expect(colorInput(page, 3)).toHaveValue('#112233');

    // 按兩次：全清，lh:map 不再有 colors，輸入框回到預設，念出結果
    await btn.click();
    await btn.click();
    expect(await lsGetMap(page)).not.toContain('colors');
    for (const n of [3, 5]) {
        await expect(colorInput(page, n)).toHaveValue(await page.evaluate(n => LH_RHYME_COLORS.light[n], n));
        expect(await rootVar(page, n)).toBe(await page.evaluate(n => LH_RHYME_COLORS.light[n], n));
    }
    expect(await live(page)).toBe('已恢復預設顏色');
    await expect(btn).toHaveAttribute('aria-disabled', 'true');
    await expect(btn).toHaveText('恢復預設顏色');
    expect(errors).toEqual([]);
    await context.close();
});

test('韻族顏色：對比提醒', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', F_AABB)])]) });
    await page.evaluate(() => lhMapOpenPrefs());
    await expect(advice(page)).toBeHidden();
    await setDark(page, true);
    await expect(advice(page)).toBeHidden();   // 深色預設色在標準濃淡下都夠
    // 一個純白（混 34% 進深色卡片，對淡色文字只有約 2.6:1）
    const label = await page.evaluate(() => RHYME_FAMILIES[7].label);
    await setColorInput(page, 7, '#ffffff', 'change');
    await expect(advice(page)).toBeVisible();
    await expect(advice(page)).toHaveText(`${label}顏色在目前主題下讓字不太好讀（對比低於 4.5:1），可以選淡一點的顏色，或調低「句尾上色濃淡」`);
    await setDark(page, false);   // 淺色卡片上純白底更淡，文字是深色，反而夠
    await expect(advice(page)).toBeHidden();
    await setDark(page, true);
    await expect(advice(page)).toBeVisible();
    // 不擋存檔
    expect(await lsGetMap(page)).toContain('"7":"#ffffff"');
    await page.locator('#mapSettingsSection .rm-color-reset').click();
    await page.locator('#mapSettingsSection .rm-color-reset').click();
    await expect(advice(page)).toBeHidden();
    // 濃：照目前主題實際算出讀不清楚的預設色（夜間 UI 重設計後深色主題字色更亮，數量跟著主題變，不寫死）
    await lookRadio(page, 'depth', 'heavy').click();
    const worst = await page.evaluate(() => {
        const cs = getComputedStyle(document.querySelector('#mapSettingsSection .rm-probe'));
        const t = cs.color.match(/\d+/g).slice(0, 3).map(Number), c = cs.backgroundColor.match(/\d+/g).slice(0, 3).map(Number);
        const bad = [];
        for (let n = 0; n < 16; n++) {
            const rgb = [1, 3, 5].map(i => parseInt(LH_RHYME_COLORS.dark[n].slice(i, i + 2), 16));
            if (lhRhymeContrast(t, lhRhymeMixRgb(rgb, c, 40)) < 4.5) bad.push(RHYME_FAMILIES[n].label);
        }
        return bad;
    });
    if (worst.length === 0) await expect(advice(page)).toBeHidden();
    else await expect(advice(page)).toHaveText(`${worst.slice(0, 3).join('、')}${worst.length > 3 ? '等 ' + worst.length + ' 個' : ''}顏色在目前主題下讓字不太好讀（對比低於 4.5:1），可以選淡一點的顏色，或調低「句尾上色濃淡」`);
    // 標準：消失
    await lookRadio(page, 'depth', 'std').click();
    await expect(advice(page)).toBeHidden();
    expect(errors).toEqual([]);
    await context.close();
});

test('韻族顏色：別的分頁改了顏色', async ({ browser }) => {
    const { context, pages, errs } = await openTwoTabs(browser, v2Storage([song([typed('sa', 'verse', F_AABB)])]));
    const [a, b] = pages;
    await b.evaluate(() => lhMapOpenPrefs());
    const def = await b.evaluate(() => LH_RHYME_COLORS.light[2]);
    await expect(colorInput(b, 2)).toHaveValue(def);
    await a.evaluate(() => localStorage.setItem('lh:map', JSON.stringify({ end: true, letters: false, inner: false, strict: false, skipParticles: true, colors: { 2: '#00aa00' } })));
    await expect.poll(() => rootVar(b, 2)).toBe('#00aa00');
    await expect(colorInput(b, 2)).toHaveValue('#00aa00');
    await expect(resetBtn(b)).toHaveAttribute('aria-disabled', 'false');
    // 另一邊清掉：回到預設
    await a.evaluate(() => localStorage.setItem('lh:map', JSON.stringify({ end: true, letters: false, inner: false, strict: false, skipParticles: true })));
    await expect.poll(() => rootVar(b, 2)).toBe(def);
    await expect(colorInput(b, 2)).toHaveValue(def);
    for (const e of errs) expect(e.errors).toEqual([]);
    await context.close();
});

test('韻族顏色：壞色碼被丟掉', async ({ browser }) => {
    const bad = '{"end":true,"colors":{"2":"#ABCDEF","3":"#abc","4":"red","5":"#12345g","6":"url(x)","16":"#000000","__proto__":{"7":"#ff0000"},"constructor":"#00ff00"}}';
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', F_AABB)])], { ...OPEN_PANELS, 'lh:map': bad }) });
    await page.evaluate(() => lhMapOpenPrefs());
    const defs = await page.evaluate(() => LH_RHYME_COLORS.light);
    for (let n = 0; n < 16; n++) {
        await expect(colorInput(page, n)).toHaveValue(defs[n]);
        expect(await rootVar(page, n), '韻族 ' + n).toBe(defs[n]);
    }
    expect(await rootVar(page, 16)).toBe(defs[16]);
    await expect(resetBtn(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('.rm-hl').first()).toBeVisible();
    // 直接呼叫也一樣：壞值進不來
    await page.evaluate(() => { lhMapSetColor(2, '#ABCDEF'); lhMapSetColor(16, '#000000'); lhMapSetColor('__proto__', '#000000'); lhMapSetColor(3, 'red'); });
    expect(await lsGetMap(page)).toBe(bad);
    expect(errors).toEqual([]);
    await context.close();
});

test('韻族顏色：手機上的原生色票', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', device: DEVICES.phone, init: STORAGE_SPY, storage: v2Storage([song([typed('sa', 'verse', F_AABB)])]) });
    await page.evaluate(() => lhMapOpenPrefs());
    const writes = () => page.evaluate(() => window.__lsWrites.filter(w => w.k === 'lh:map').length);
    const w0 = await writes();
    for (const [n, v] of [[1, '#0a0b0c'], [9, '#c0b0a0']]) {
        const before = await writes();
        await setColorInput(page, n, v, 'input');
        await setColorInput(page, n, v, 'input');
        expect(await rootVar(page, n)).toBe(v);
        expect(await writes(), '拖曳中不寫').toBe(before);
        expect((await lsGetMap(page)) ?? '').not.toContain(v);
        await setColorInput(page, n, v, 'change');
        expect(await writes(), '放開寫一次').toBe(before + 1);
        expect(await lsGetMap(page)).toContain(`"${n}":"${v}"`);
    }
    expect(await writes()).toBe(w0 + 2);
    // 色票夠大，好按
    const box = await colorInput(page, 1).boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(await hitMin(page) - 0.5);
    expect(box.height).toBeGreaterThanOrEqual(await hitMin(page) - 0.5);
    expect(errors).toEqual([]);
    await context.close();
});

// ==================== 預覽（11-04） ====================
// 和 js/rhyme-map.js 的 LH_MAP_PREVIEW_TEXT 一樣（Andy 的〈麻雀〉）
const PREVIEW_LINES = ['yo yo 麻雀in the house', '夜晚還在街道　別管那些尖叫', '笑鬧 逃跑 快樂或紛擾', '一夜之間　slow down calm down', '一念之間　也 好　也 好 奇',
    '新的家新的我 新的樹有新的蟲', '想新的拆遷名單', '像辛得勒名單', '耳罩帶好好 抗議go to hell', 'sparrow leave the house', "and who's the next pity mouse?"];
const PV_WORDS = ['夜晚', '還在', '街道', '那些', '尖叫', '快樂', '紛擾', '拆遷', '名單', '新的', '辛得勒'];
// 鏡像層（或預覽）裡每個 span 的 [class, 文字, data-f]，外加整段純文字
const spanSig = (page, sel) => page.evaluate(sel => {
    const root = document.querySelector(sel);
    return { spans: [...root.querySelectorAll('span')].map(e => [e.className, e.textContent, e.dataset.f ?? null]), text: root.textContent };
}, sel);

test('預覽：和真的歌詞畫出來一模一樣', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        wordlist: 'stub',
        storage: v2Storage([song([typed('sa', 'verse', PREVIEW_LINES.join('\n'))])], { ...OPEN_PANELS, 'lh:map': JSON.stringify({ line: true, lnRhyme: true, lnCount: true, lnSplit: true, letters: true, inner: true }) }),
    });
    await page.evaluate(() => lhMapOpenPrefs());
    await seedWords(page, PV_WORDS);
    const same = async note => {
        await expect.poll(async () => JSON.stringify(await spanSig(page, '#lyricsSections .rhyme-mirror')) === JSON.stringify(await spanSig(page, '#mapSettingsSection .lm-preview')), note).toBe(true);
        return spanSig(page, '#mapSettingsSection .lm-preview');
    };
    const base = await same('預設');
    // 真的有東西可比：色塊、底線或標記至少各一種
    for (const c of ['rm-hl', 'lm-mk', 'lm-t-c', 'lm-g', 'lm-t-r']) expect(base.spans.some(s => s[0].split(' ').includes(c)), c).toBe(true);
    expect(base.spans.some(s => s[0].includes('lm-g-guess')), '機器猜的斷句也畫').toBe(true);
    await page.evaluate(() => lhMapSetSetting('strict', true));
    const strict = await same('嚴格');
    await page.evaluate(() => lhMapSetSetting('lnCount', false));
    const noCount = await same('字數關');
    expect(noCount.spans.some(s => s[0].includes('lm-t-c'))).toBe(false);
    expect(strict.spans.length).toBeGreaterThan(0);
    // 預覽自己不影響歌詞：歌詞那一段的內容沒有被改
    expect(await page.evaluate(() => document.querySelector('#lyricsSections .section-textarea').value)).toBe(PREVIEW_LINES.join('\n'));
    expect(errors).toEqual([]);
    await context.close();
});

test('預覽：每個開關都看得到', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        wordlist: 'stub',
        storage: v2Storage([song([typed('sa', 'verse', F_AABB)])], { ...OPEN_PANELS, 'lh:map': JSON.stringify({ line: true, lnRhyme: true, lnCount: true, lnSplit: true, hoverOnly: false }) }),
    });
    await page.evaluate(() => lhMapOpenPrefs());
    const pv = page.locator('#mapSettingsSection .lm-preview');
    const diffCap = page.locator('#mapSettingsSection .rm-preview-diff');
    await expect(pv).toHaveAttribute('aria-hidden', 'true');
    await expect(pv).toContainText('麻雀');
    await expect(page.locator('#mapSettingsSection .lm-preview-block > .section-menu-cap').first()).toHaveText('預覽');
    await expect(pv.locator('.lm-t-c')).toHaveCount(11);
    // 字數
    await prefSw(page, '字數').click();
    await expect(pv.locator('.lm-t-c')).toHaveCount(0);
    await prefSw(page, '字數').click();
    await expect(pv.locator('.lm-t-c')).toHaveCount(11);
    // 對照差異：單獨一段看不到，所以出說明
    await expect(diffCap).toBeHidden();
    await page.evaluate(() => lhMapSetSetting('lnDiff', !_lhMapSet.lnDiff));   // 對照差異的開關先藏起來了
    await expect(diffCap).toBeVisible();
    await expect(diffCap).toHaveText('對照差異要有同類型的前一段才看得到');
    await page.evaluate(() => lhMapSetSetting('lnDiff', !_lhMapSet.lnDiff));   // 對照差異的開關先藏起來了
    await expect(diffCap).toBeHidden();
    // 位置：句尾後 → 右內距回到 0.75rem，標記貼在最後一個字後面
    const geo = () => page.evaluate(() => {
        const el = document.querySelector('#mapSettingsSection .lm-preview'), rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
        const mk = el.querySelector('.lm-mk');
        let prev = mk.previousSibling;
        while (prev.nodeType !== 3) prev = prev.lastChild;   // 句尾可能包在斷句 .lm-g 或上色的 span 裡
        const rg = document.createRange(); rg.setStart(prev, prev.textContent.length - 1); rg.setEnd(prev, prev.textContent.length);
        return { pad: parseFloat(getComputedStyle(el).paddingRight) / rem, dx: (mk.getBoundingClientRect().left - rg.getBoundingClientRect().right) / rem, fs: parseFloat(getComputedStyle(el.querySelector('.lm-t')).fontSize) / rem };
    });
    const right = await geo();
    expect(right.pad).toBeGreaterThan(1.5);
    await lookRadio(page, 'pos', 'tail').click();
    const tail = await geo();
    expect(tail.pad).toBeCloseTo(0.75, 2);
    expect(tail.dx).toBeGreaterThanOrEqual(0);
    expect(tail.dx).toBeLessThan(1);
    // 大小
    expect(tail.fs).toBeCloseTo(0.875, 2);
    await lookRadio(page, 'size', 'l').click();
    expect((await geo()).fs).toBeCloseTo(1, 2);
    // 顏色拖曳馬上看得到
    const f = await pv.locator('.rm-hl').first().evaluate(e => e.dataset.c ?? e.dataset.f);   // 畫面實際用的顏色編號
    const bg = () => pv.locator('.rm-hl').first().evaluate(e => getComputedStyle(e).backgroundColor);
    const bg0 = await bg();
    await setColorInput(page, f, '#123456', 'input');
    expect(await bg()).not.toBe(bg0);
    await setColorInput(page, f, '#123456', 'change');
    // 深色主題：文字用主題文字色
    await setDark(page, true);
    const same = await page.evaluate(() => getComputedStyle(document.querySelector('#mapSettingsSection .lm-preview')).color === getComputedStyle(document.querySelector('#mapSettingsSection .rm-probe')).color);
    expect(same).toBe(true);
    expect(await pv.evaluate(e => getComputedStyle(e).backgroundColor)).toBe(await page.evaluate(() => getComputedStyle(document.querySelector('#mapSettingsSection .rm-probe')).backgroundColor));
    expect(errors).toEqual([]);
    await context.close();
});

test('預覽：不固定、沒有自己的捲軸，整個面板一起捲', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', F_AABB)])]) });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => lhMapOpenPrefs());
    const blk = page.locator('#mapSettingsSection .lm-preview-block');
    expect(await blk.evaluate(e => getComputedStyle(e).position)).toBe('static');
    expect(await page.locator('#mapSettingsSection .lm-preview').evaluate(e => e.scrollHeight <= e.clientHeight + 1), '預覽沒有內層捲軸').toBe(true);
    // 預覽不在 Tab 順序裡，讀屏軟體也略過
    const pv = page.locator('#mapSettingsSection .lm-preview');
    expect(await pv.evaluate(e => [e.tabIndex, e.querySelectorAll('button, a, input, [tabindex]').length, e.getAttribute('aria-hidden')])).toEqual([-1, 0, 'true']);
    for (let i = 0; i < 70; i++) {
        await page.keyboard.press('Tab');
        expect(await page.evaluate(() => !!document.activeElement.closest('.lm-preview'))).toBe(false);
    }
    expect(errors).toEqual([]);
    await context.close();
});

// ==================== 分析面板（11-05） ====================
const AN = '#rhymeAnalysis', ANBAR = '#rhymeSelBar';
const AN_V1 = ['我望著遠方的光', '獨自站在窗', '走過熟悉的街道'].join('\n');
const AN_V2 = ['我望著遠方的光', '獨自站在窗前', '走過熟悉的街道', '終於我也回到'].join('\n');
const AN_WORDS = ['走過', '熟悉', '街道', '終於', '我也', '回到'];
// 第 n 段輸入框聚焦並選 [a, b)；setSelectionRange 會觸發 select，浮動列 400ms 後出現
const anPick = (page, a, b, n = 0) => page.evaluate(([a, b, n]) => {
    const ta = document.querySelectorAll('.section-textarea')[n];
    ta.focus(); ta.setSelectionRange(a, b);
}, [a, b, n]);
const anTa = page => page.evaluate(() => {
    const ta = document.activeElement;
    return { ta: ta.classList.contains('section-textarea'), a: ta.selectionStart, b: ta.selectionEnd };
});
const anRows = page => page.locator(AN + ' tbody tr').evaluateAll(trs => trs.map(tr => ({
    ref: tr.classList.contains('rm-an-ref'),
    // 面板改成 行（含字數）｜整行歌詞（每組下面有括號與字數）｜結構；這裡換算回 [行, 文字, 字數, 結構] 方便比對
    cells: tr.classList.contains('rm-an-ref') ? [...tr.children].map(c => c.textContent) : [
        tr.querySelector('.rm-an-l').textContent,
        [...tr.querySelectorAll('.rm-br-t, .rm-br-gap')].map(e => e.textContent).join(''),
        tr.querySelector('.rm-an-n').textContent.replace(' 字', ''),
        tr.children[2].textContent,
    ],
    guess: [...tr.querySelectorAll('.lm-guess:not(.rm-br-n)')].map(g => [g.textContent, getComputedStyle(g).fontStyle]),
    verdict: [...tr.querySelectorAll('.rm-an-v')].map(v => [v.textContent, v.getAttribute('aria-label')]),
})));

test('分析面板：選幾行按分析，逐行列出字數、結構與對照', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', AN_V1), typed('sb', 'verse', AN_V2)])]),
    });
    await seedWords(page, AN_WORDS);
    await anPick(page, 11, 26, 1);   // 第二段：第 2 行中間到第 4 行中間（15 個字）
    await expect(page.locator(ANBAR)).toBeVisible();
    // 20 字內有中文字：查韻、AI、分析，依序
    const btns = page.locator(ANBAR + ' button:visible');
    await expect(btns).toHaveText(['🔍 查韻：我', '✨ AI 建議', '📏 分析', '指定角色 ▸', '移到段落 ▸']);
    const an = page.locator(ANBAR + ' .rm-bar-an');
    await expect(an).toHaveAttribute('aria-label', '分析選取範圍的句構');
    await expect(an).toHaveAttribute('aria-expanded', 'false');
    await expect(an).toHaveAttribute('aria-controls', 'rhymeAnalysis');
    await expect(page.locator(AN)).toBeHidden();

    await an.click();
    const panel = page.locator(AN);
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute('role', 'dialog');
    await expect(panel).toHaveAttribute('aria-label', '句構分析');
    await expect(an).toHaveAttribute('aria-expanded', 'true');
    await expect(panel.locator('.section-menu-title')).toHaveText('句構：Verse II');
    await expect(panel.locator('.rm-sum')).toHaveText('選到 3 行，共 19 字');
    await expect(panel.locator('.section-menu-cap').first()).toHaveText('對照：Verse I（同類型第一段）');
    await expect(panel.locator('caption')).toHaveText('逐行句構');
    expect(await panel.locator('thead th').evaluateAll(t => t.map(x => [x.textContent, x.scope]))).toEqual([['行', 'col'], ['文字', 'col'], ['結構', 'col']]);   // 字數移到行號下面

    const rows = await anRows(page);
    expect(rows).toEqual([
        { ref: false, cells: ['第 2 行', '獨自站在窗前', '6', '—'], guess: [], verdict: [] },
        { ref: true, cells: ['對照 Verse I 第 2 行：5 字　—≠'], guess: [], verdict: [['≠', '字數不同']] },
        { ref: false, cells: ['第 3 行', '走過熟悉的街道', '7', '7（2·3·2）'], guess: [['（2·3·2）', 'italic']], verdict: [] },
        { ref: true, cells: ['對照 Verse I 第 3 行：7 字　7（2·3·2）✓'], guess: [['（2·3·2）', 'italic']], verdict: [['✓', '字數相同']] },
        { ref: false, cells: ['第 4 行', '終於我也回到', '6', '6（2·2·2）'], guess: [['（2·2·2）', 'italic']], verdict: [] },
        { ref: true, cells: ['對照段落沒有第 4 行'], guess: [], verdict: [] },
    ]);
    expect(await live(page)).toBe('句構分析：選到 3 行');
    // 沒有搶走輸入框：焦點、選取都在
    expect(await anTa(page)).toEqual({ ta: true, a: 11, b: 26 });
    // 面板在浮動列下方（放得下時），不蓋住浮動列
    const bb = await page.locator(ANBAR).boundingBox(), pb = await panel.boundingBox();
    expect(pb.y >= bb.y + bb.height - 0.5 || pb.y + pb.height <= bb.y + 0.5, '面板和浮動列不重疊').toBe(true);
    // 再按一次關閉
    await an.click();
    await expect(panel).toBeHidden();
    await expect(an).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator(ANBAR)).toBeVisible();
    expect(await anTa(page)).toEqual({ ta: true, a: 11, b: 26 });
    expect(errors).toEqual([]);
    await context.close();
});

// 直接呼叫（不經浮動列）：snap 只需要 ta、secId、a、end
const anOpen = (page, secId, a, end, n = 0) => page.evaluate(([secId, a, end, n]) => {
    lhMapBarBuild();
    const ta = document.querySelectorAll('.section-textarea')[n];
    lhMapOpenAnalysis({ ta, secId, a, b: end, end, char: null, rd: null }, false);
}, [secId, a, end, n]);

test('分析面板：零、一、多、超過八十行', async ({ browser }) => {
    const HUNDRED = Array.from({ length: 100 }, (_, i) => '第' + i + '句歌詞在這裡' + '啊'.repeat(i % 4)).join('\n');
    const { context, page, errors } = await bootPage(browser, {
        wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', '你好\n\n再見'), typed('sb', 'chorus', HUNDRED)])]),
    });
    const panel = page.locator(AN);
    // 零：只選到空白行 → 沒有表格
    await anOpen(page, 'sa', 3, 3);
    await expect(panel).toBeVisible();
    await expect(panel.locator('.section-menu-cap')).toHaveText('選取的範圍沒有可分析的行');
    await expect(panel.locator('table')).toHaveCount(0);
    await expect(panel.locator('.rm-sum')).toHaveCount(0);
    // 一：只碰到一行（部分選取算整行）→ 一列
    await anOpen(page, 'sa', 4, 5);
    await expect(panel.locator('.rm-sum')).toHaveText('選到 1 行，共 2 字');
    expect((await anRows(page)).map(r => r.cells)).toEqual([['第 2 行', '再見', '2', '—']]);   // 空白行不算，所以「再見」是第 2 個可分析的行
    await expect(panel.locator('.section-menu-cap').first()).toHaveText('沒有對照段落：這是第一個「Verse」');
    // 選取剛好停在下一行開頭：下一行不算碰到
    await anOpen(page, 'sa', 0, 3);
    await expect(panel.locator('.rm-sum')).toHaveText('選到 1 行，共 2 字');
    // 多：100 行整段 → 只畫 80 行，摘要仍是 100 行與全部字數
    const total = await page.evaluate(() => lhLineRows(document.querySelectorAll('.section-textarea')[1].value).reduce((s, r) => s + r.n, 0));
    await anOpen(page, 'sb', 0, HUNDRED.length, 1);
    await expect(panel.locator('.rm-sum')).toHaveText('選到 100 行，共 ' + total + ' 字');
    await expect(panel.locator('tbody tr')).toHaveCount(80);
    await expect(panel.locator('.rm-an-scroll > .section-menu-cap')).toHaveText('只顯示前 80 行');
    await expect(panel.locator('.rm-an-scroll')).toHaveAttribute('tabindex', '0');   // 超出可見範圍：鍵盤才捲得動
    // 只有 80 行以內：沒有「只顯示前」
    await anOpen(page, 'sb', 0, 40, 1);
    await expect(panel.locator('.rm-an-scroll > .section-menu-cap')).toHaveCount(0);
    expect(errors).toEqual([]);
    await context.close();
});

test('分析面板：段落太長', async ({ browser }) => {
    const huge = '愛你到天亮\n'.repeat(45000);   // 超過 LH_WD_BIG（200000 字）
    expect(huge.length).toBeGreaterThan(200000);
    const { context, page, errors } = await bootPage(browser, {
        wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', huge)])]),
    });
    await page.evaluate(() => {
        window.__mirrors = 0;
        const o = window.lhMirror;
        window.lhMirror = function (...a) { window.__mirrors++; return o.apply(this, a); };
    });
    await anPick(page, 0, 4);
    await expect(page.locator(ANBAR)).toBeVisible();
    await expect(page.locator(ANBAR + ' button:visible')).toHaveText(['🔍 查韻：天', '✨ AI 建議', '📏 分析', '指定角色 ▸', '移到段落 ▸']);
    await page.locator(ANBAR + ' .rm-bar-an').click();
    const panel = page.locator(AN);
    await expect(panel).toBeVisible();
    await expect(panel.locator('.section-menu-title')).toHaveText(/^句構：/);
    await expect(panel.locator('.section-menu-cap')).toHaveText('段落太長，不做句構分析');
    await expect(panel.locator('table')).toHaveCount(0);
    await expect(panel.locator('.rm-sum')).toHaveCount(0);
    expect(await page.evaluate(() => window.__mirrors), '沒有量版面').toBe(0);
    expect(errors).toEqual([]);
    await context.close();
});

test('分析面板：名稱與結構很長，文字只當文字', async ({ browser }) => {
    const NAME = Array.from({ length: 40 }, (_, i) => '段落名稱很長很長很長很長'[i % 12]).join('');
    expect(Array.from(NAME)).toHaveLength(40);
    const CUT = Array.from(NAME).slice(0, 16).join('') + '…';
    const TWELVE = '我 你 他 我 你 他 我 你 他 我 你 他';
    const HOSTILE = '<img src=x onerror=alert(1)>你';
    const { context, page, errors } = await bootPage(browser, {
        wordlist: 'stub', storage: v2Storage([song([
            typed('sa', 'custom', '我望著遠方的光', { custom: NAME }),
            typed('sb', 'custom', [TWELVE, HOSTILE].join('\n'), { custom: NAME }),
        ])]),
    });
    await anPick(page, 0, TWELVE.length + 1 + 4, 1);
    await expect(page.locator(ANBAR)).toBeVisible();
    await page.locator(ANBAR + ' .rm-bar-an').click();
    const panel = page.locator(AN);
    await expect(panel).toBeVisible();
    await expect(panel.locator('.section-menu-title')).toHaveText('句構：' + CUT);
    await expect(panel.locator('.section-menu-cap').first()).toHaveText('對照：' + CUT + '（同類型第一段）');
    const rows = await anRows(page);
    // 十二個單字詞：完整顯示 1+1+…+1，不用 …
    const one12 = Array(12).fill(1).join('+');
    expect(rows[0].cells).toEqual(['第 1 行', TWELVE, '12', one12]);   // 整行完整顯示（面板跟著變寬或左右捲），結構欄不切
    expect(rows[0].cells[3]).not.toContain('…');
    expect(rows[1].cells[0]).toBe('對照 ' + CUT + ' 第 1 行：7 字　—≠');
    // 結構格不換行也不被切掉
    expect(await panel.locator('.rm-an-s').first().evaluate(e => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
    // 惡意文字：只是文字，沒有任何元素被建出來
    expect(rows[2].cells[1]).toBe(HOSTILE);
    expect(await panel.locator('img, script, b, i').count()).toBe(0);
    expect(await page.evaluate(() => window.__xss === undefined)).toBe(true);
    expect(errors).toEqual([]);
    await context.close();
});

test('分析面板：詞庫載入中', async ({ browser }) => {
    const MINI = ['{"w":"夢裡","z":"ㄇㄥˋ ㄌㄧˇ","p":0}', '{"w":"想起","z":"ㄒㄧㄤˇ ㄑㄧˇ","p":0}', '{"w":"你的","z":"ㄋㄧˇ ㄉㄜ˙","p":0}'].join('\n') + '\n';
    let release;
    const gate = new Promise(r => { release = r; });
    const { context, page, errors } = await bootPage(browser, {
        waitWordlist: false,
        storage: v2Storage([song([typed('sa', 'verse', '月光 灑在 窗前\n夢裡想起你的臉')])]),
        beforeGoto: async ({ context: c }) => {
            await stubWordlist(c, MINI);
            await c.route(/\/data\/wordlist-c0\d\.json(\?.*)?$/, async route => { await gate; await route.fallback(); });
        },
    });
    await page.evaluate(() => window.__hoyunSongsReady);
    await anPick(page, 9, 12);
    await expect(page.locator(ANBAR)).toBeVisible();
    await page.locator(ANBAR + ' .rm-bar-an').click();
    const panel = page.locator(AN);
    await expect(panel.locator('.section-menu-cap').filter({ hasText: '詞庫載入中，括號裡的自動斷句稍後補上' })).toBeVisible();
    expect((await anRows(page))[0].cells).toEqual(['第 2 行', '夢裡想起你的臉', '7', '—']);   // 還沒詞庫：不猜
    release();
    await page.evaluate(() => window.__lhMapReady);
    await page.evaluate(() => lhMapHideBar());
    await anPick(page, 9, 13);
    await expect(page.locator(ANBAR)).toBeVisible();
    await page.locator(ANBAR + ' .rm-bar-an').click();
    await expect(panel).toBeVisible();
    await expect(panel.locator('.section-menu-cap').filter({ hasText: '詞庫載入中' })).toHaveCount(0);
    expect((await anRows(page))[0].cells).toEqual(['第 2 行', '夢裡想起你的臉', '7', '7（2·2·3）']);
    expect(errors).toEqual([]);
    await context.close();
});

test('分析面板：手機上長選取只出現一次，只有分析', async ({ browser }) => {
    const LONGER = Array.from({ length: 60 }, (_, i) => '第' + i + '句歌詞在這裡').join('\n');
    const { context, page, errors } = await bootPage(browser, {
        wordlist: 'stub', device: DEVICES.phone, storage: v2Storage([song([typed('sa', 'verse', LONGER, { height: 300 })])], {}),
    });
    await page.locator('#mtab-lyrics').click();
    await waitStill(page);
    await page.evaluate(() => {
        window.__shows = []; window.__last = 0;
        const bar = lhMapBarBuild();
        let on = bar.classList.contains('show');
        new MutationObserver(() => {
            const now = bar.classList.contains('show');
            if (now && !on) window.__shows.push(performance.now());
            on = now;
        }).observe(bar, { attributes: true, attributeFilter: ['class'] });
    });
    for (const b of [100, 200, 260, 300]) {
        await page.evaluate(b => { const ta = document.querySelector('.section-textarea'); ta.focus(); ta.setSelectionRange(0, b); window.__last = performance.now(); }, b);
        await page.waitForTimeout(100);
    }
    await expect(page.locator(ANBAR)).toBeVisible();
    await page.waitForTimeout(600);
    const r = await page.evaluate(() => ({ shows: window.__shows, last: window.__last }));
    expect(r.shows.length, '只出現一次').toBe(1);
    expect(r.shows[0] - r.last, '最後一次改變之後約 400ms').toBeGreaterThan(300);
    expect(r.shows[0] - r.last).toBeLessThan(900);
    await expect(page.locator(ANBAR + ' button:visible')).toHaveText(['📏 分析', '指定角色 ▸', '移到段落 ▸']);   // 觸控多「指定角色 ▸」（quick 261113-r05）與「移到段落 ▸」（quick 261113-j3a）
    await page.locator(ANBAR + ' .rm-bar-an').tap();
    const panel = page.locator(AN);
    await expect(panel).toBeVisible();
    const kb = await readKeyboard(page), box = await panel.boundingBox(), vp = page.viewportSize();
    expect(insideVisible(box, kb), '面板在可見範圍內').toBe(true);
    expect(box.x >= -0.5 && box.x + box.width <= vp.width + 0.5, '左右都在螢幕內').toBe(true);
    expect(await live(page)).toMatch(/^句構分析：選到 \d+ 行$/);
    expect(errors).toEqual([]);
    await context.close();
});

// ==================== 分析面板：收起、焦點、同一層、觸控、鍵盤（11-05 Task 3） ====================
const AN_BTN = ANBAR + ' .rm-bar-an';
const anExpanded = page => page.locator(AN_BTN).getAttribute('aria-expanded');
const AN_LONG80 = Array.from({ length: 80 }, (_, i) => '第' + i + '句歌詞在這裡').join('\n');
// 選 [a, b)、等浮動列出現、按「分析」打開面板（滑鼠）
const anShow = async (page, a, b, n = 0) => {
    await anPick(page, a, b, n);
    await expect(page.locator(ANBAR)).toBeVisible();
    await page.locator(AN_BTN).click();
    await expect(page.locator(AN)).toBeVisible();
};

test('分析面板：收起來的各種情況', async ({ browser }) => {
    const mk = id => song([typed('sa', 'verse', AN_V1), typed('sb', 'verse', AN_V2), typed('sc', 'chorus', AN_LONG80, { height: 160 })], { id });
    const { context, page, errors } = await bootPage(browser, {
        wordlist: 'stub', storage: v2Storage([mk('s1'), { ...mk('s2'), title: '第二首' }]),
    });
    const panel = page.locator(AN), bar = page.locator(ANBAR);
    const closed = async why => { await expect(panel, why).toBeHidden(); expect(await anExpanded(page), why + '：aria-expanded').toBe('false'); };
    // Esc：只收面板，焦點與選取回輸入框，浮動列還在；第二次 Esc 才收浮動列
    await anShow(page, 11, 26, 1);
    await page.keyboard.press('Escape');
    await closed('Esc');
    await expect(bar).toBeVisible();
    expect(await anTa(page)).toEqual({ ta: true, a: 11, b: 26 });
    await page.keyboard.press('Escape');
    await expect(bar).toBeHidden();
    expect(await anTa(page)).toEqual({ ta: true, a: 11, b: 26 });
    // 「關閉句構」：收面板、焦點回輸入框
    await anShow(page, 10, 26, 1);
    await panel.locator('.section-menu-close').click();
    await closed('關閉句構');
    await expect(bar).toBeVisible();
    expect(await anTa(page)).toEqual({ ta: true, a: 10, b: 26 });
    // 點外面
    await page.locator('#songTotal').click();
    await closed('點外面');
    await expect(bar).toBeHidden();
    // 選取改變
    await anShow(page, 9, 26, 1);
    await page.keyboard.press('Shift+ArrowRight');
    await closed('選取改變');
    // 捲動歌詞區
    await anShow(page, 0, 3, 2);
    await page.evaluate(() => {
        const ta = document.querySelectorAll('.section-textarea')[2];
        const box = [ta.closest('.lyrics-area'), ta.closest('.lyrics-main')].find(el => el && el.scrollHeight > el.clientHeight);   // 段落自動長高，捲的是外層
        box.scrollTop = box.scrollTop >= 80 ? box.scrollTop - 80 : box.scrollTop + 80;   // 已經在底就往上捲
    });
    await closed('捲動');
    // 組字：開始組字就收，組字中、組字後都不在
    await anShow(page, 8, 26, 1);
    let during = null;
    await compose(page, ['ㄌ'], '你', async () => { during = await panel.isVisible(); });
    expect(during, '組字中').toBe(false);
    await closed('組字後');
    // 別的分頁改了設定（storage 事件）
    await anShow(page, 7, 26, 1);
    await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'lh:map' })));
    await closed('storage 事件');
    // 換歌
    await anShow(page, 6, 26, 1);
    await page.evaluate(() => switchSong('s2'));
    await closed('換歌');
    await page.waitForTimeout(300);   // 新輸入框建好時瀏覽器會補送幾個 selectionchange，等它們過去再選字
    // 收左面板
    await anShow(page, 5, 26, 1);
    await page.evaluate(() => toggleLeftPanel());
    await closed('收左面板');
    expect(errors).toEqual([]);
    await context.close();
});

test('分析面板：鍵盤與焦點', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', AN_V2), typed('sb', 'chorus', AN_LONG80, { height: 160 })])]),
    });
    const panel = page.locator(AN), ta0 = page.locator('.section-textarea').first();
    const inPanel = () => page.evaluate(() => !!document.activeElement.closest('#rhymeAnalysis'));
    // 滑鼠按「分析」：不搶焦點
    await anShow(page, 11, 26);
    expect((await page.evaluate(() => document.activeElement.className))).toContain('section-textarea');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(page.locator(ANBAR)).toBeHidden();
    // 鍵盤：Alt+↓ 到第一顆、→ 到「分析」、Enter 打開，焦點進面板
    await anPick(page, 10, 26);
    await expect(page.locator(ANBAR)).toBeVisible();
    await page.keyboard.press('Alt+ArrowDown');
    await expect(page.locator(ANBAR + ' .rm-bar-look')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator(AN_BTN)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(panel).toBeVisible();
    await expect(panel).toBeFocused();
    expect(await live(page)).toBe('句構分析：選到 3 行');
    // 這麼短的表格沒有溢出：Tab 依序繞過三個結構鈕、「AI 斷句」、「關閉句構」，兩個方向都不跑出面板
    expect(await panel.locator('.rm-an-scroll').getAttribute('tabindex')).toBeNull();
    await expect(panel.locator('.rm-an-edit')).toHaveCount(3);
    for (let i = 0; i < 5; i++) { await page.keyboard.press('Tab'); expect(await inPanel(), 'Tab ' + i).toBe(true); }
    await expect(panel.locator('.section-menu-close')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(panel.locator('.rm-an-edit').first()).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(panel.locator('.section-menu-close')).toBeFocused();
    // Esc：面板收起，焦點與選取回輸入框
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(ta0).toBeFocused();
    expect(await anTa(page)).toEqual({ ta: true, a: 10, b: 26 });
    await expect(page.locator(ANBAR)).toBeVisible();
    // 溢出時（80 行整段）捲動區可用 Tab 聚焦：Tab 在「捲動區」與「關閉句構」之間繞
    await page.keyboard.press('Escape');
    await anPick(page, 0, AN_LONG80.length, 1);
    await expect(page.locator(ANBAR)).toBeVisible();
    await page.keyboard.press('Alt+ArrowDown');
    await expect(page.locator(AN_BTN)).toBeFocused();   // 沒有查韻（太長）：第一顆就是「分析」
    await page.keyboard.press('Enter');
    await expect(panel).toBeFocused();
    const sc = panel.locator('.rm-an-scroll');
    await expect(sc).toHaveAttribute('tabindex', '0');
    await page.keyboard.press('Tab');
    await expect(sc).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(panel.locator('.section-menu-close')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(panel.locator('.rm-an-act').first()).toBeFocused();
    expect(errors).toEqual([]);
    await context.close();
});

test('分析面板：只算一個浮層', async ({ browser }) => {
    const MAP_LETTERS = JSON.stringify({ end: true, letters: true, inner: false, strict: false, skipParticles: true });
    const { context, page, errors } = await bootPage(browser, {
        wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', '我們一起行\n我望著遠方的光')])], { ...OPEN_PANELS, 'lh:map': MAP_LETTERS }),
    });
    const panel = page.locator(AN), row = page.locator('#rhymeReadingRow'), rd = page.locator(ANBAR + ' .rm-bar-rd');
    // 統計開著、浮動列也在（用鍵盤打開，不經過「點外面就收統計」）：打開面板 → 統計收起
    await anPick(page, 4, 5);
    await expect(page.locator(ANBAR)).toBeVisible();
    await page.evaluate(() => { lhMapStatsBuild(); _lhMapStatsSec = 'sa'; _lhMapStatsOn = true; _lhMapStatsFill(); });
    await expect(page.locator('#rhymeStats')).toBeVisible();
    await page.keyboard.press('Alt+ArrowDown');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(panel).toBeVisible();
    await expect(page.locator('#rhymeStats')).toBeHidden();
    expect(await page.evaluate(() => document.querySelector('.section-rhyme').getAttribute('aria-expanded'))).toBe('false');
    await page.keyboard.press('Escape');
    // 指定讀音：打開 → 再開面板，讀音列收起；再開讀音 → 面板收起
    await expect(rd).toBeVisible();
    await rd.click();
    await expect(row).toBeVisible();
    await expect(rd).toHaveAttribute('aria-expanded', 'true');
    await page.locator(AN_BTN).click();
    await expect(panel).toBeVisible();
    await expect(row).toBeHidden();
    await expect(rd).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator(ANBAR)).toBeVisible();
    await rd.click();
    await expect(panel).toBeHidden();
    await expect(row).toBeVisible();
    await expect(page.locator(AN_BTN)).toHaveAttribute('aria-expanded', 'false');
    await page.locator(AN_BTN).click();
    await expect(panel).toBeVisible();
    await expect(row).toBeHidden();
    // 開統計（點字母條）：浮動列和面板都收
    await page.locator('.section-rhyme').click();
    await expect(page.locator('#rhymeStats')).toBeVisible();
    await expect(panel).toBeHidden();
    await expect(page.locator(ANBAR)).toBeHidden();
    expect(errors).toEqual([]);
    await context.close();
});

test('分析面板：觸控保留選取', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        wordlist: 'stub', device: DEVICES.phone, storage: v2Storage([song([typed('sa', 'verse', TAIL_A)])], {}),
    });
    await page.locator('#mtab-lyrics').click();
    await waitStill(page);
    await anPick(page, 0, TAIL_A.length);   // 60 行整段
    await expect(page.locator(ANBAR)).toBeVisible();
    await page.locator(AN_BTN).tap();
    const panel = page.locator(AN);
    await expect(panel).toBeVisible();
    // 點面板的標題：選取與焦點都還在（手機鍵盤也不會收）
    await panel.locator('.section-menu-title').tap();
    expect(await anTa(page)).toEqual({ ta: true, a: 0, b: TAIL_A.length });
    await expect(panel).toBeVisible();
    // 捲動區用手指拖得動，選取仍在
    const sc = panel.locator('.rm-an-scroll'), box = await sc.boundingBox();
    expect(await sc.evaluate(e => e.scrollHeight > e.clientHeight), '60 行放不下，需要捲動').toBe(true);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.synthesizeScrollGesture', { x: box.x + box.width / 2, y: box.y + box.height / 2, yDistance: -150, gestureSourceType: 'touch', speed: 800 });
    await expect.poll(() => sc.evaluate(e => e.scrollTop)).toBeGreaterThan(40);
    expect(await anTa(page)).toEqual({ ta: true, a: 0, b: TAIL_A.length });
    await expect(panel).toBeVisible();
    expect(errors).toEqual([]);
    await context.close();
});

test('分析面板：貼底與鍵盤打開時看得到', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        wordlist: 'stub', device: DEVICES.phone, storage: v2Storage([song([typed('sa', 'verse', AN_LONG80, { height: 300 })])], {}),
    });
    await page.locator('#mtab-lyrics').click();
    await waitStill(page);
    // 選到最後一個可見行，往上 40 行（面板有很多列）
    await page.evaluate(async () => {
        const ta = document.querySelector('.section-textarea');
        ta.scrollIntoView({ block: 'end' });   // 段落自動長高：把輸入框底端捲進畫面，最後一個可見行才是第 80 句附近
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const r = ta.getBoundingClientRect(), vv = window.visualViewport;
        const bottom = Math.min(r.bottom, vv.offsetTop + vv.height) - 6, i = lhCaretIndexAt(ta, r.left + 30, bottom);
        ta.focus(); ta.setSelectionRange(Math.max(0, i - 400), i);
    });
    await expect(page.locator(ANBAR)).toBeVisible();
    await page.locator(AN_BTN).tap();
    const panel = page.locator(AN);
    await expect(panel).toBeVisible();
    const before = page.viewportSize();
    await emulateKeyboard(page, 336);
    const kb = await readKeyboard(page);
    expect(kb.open, '模擬鍵盤已開').toBe(true);
    await expect.poll(async () => insideVisible(await panel.boundingBox(), await readKeyboard(page))).toBe(true);
    const b = await panel.boundingBox();
    expect(b.y + b.height, '不蓋到鍵盤').toBeLessThanOrEqual(before.height - 336 + 0.5);
    expect(await panel.locator('.rm-an-scroll').evaluate(e => e.scrollHeight > e.clientHeight), '放不下的部分在面板內捲動').toBe(true);
    expect(await panel.locator('.section-menu-close').evaluate(e => { const r = e.getBoundingClientRect(), v = window.visualViewport; return r.top >= v.offsetTop - 0.5 && r.bottom <= v.offsetTop + v.height + 0.5; }), '「關閉句構」看得到').toBe(true);
    await expect(page.locator(ANBAR)).toBeVisible();
    expect(errors).toEqual([]);
    await context.close();
});

// ==================== hover：反白停留自動分析（11-06） ====================
// 時鐘用 page.clock.install() 在導航前裝好，開機之後 pauseAt 暫停：之後時間只靠 runFor 前進，1499／1500ms 才量得準。
// 反白一律程式化（setSelectionRange）再送 mouseup 走滑鼠路徑（RESEARCH Pattern 6：假時鐘下真拖曳選不到字）；指標用真的 page.mouse.move
const HV_MAP = { 'lh:map': JSON.stringify({ autoHover: true }) };
const HV_TEXT = ['我望著遠方的光', '獨自站在窗前', '走過熟悉的街道'].join('\n');
const hvStorage = (map = HV_MAP) => v2Storage([song([typed('sa', 'verse', HV_TEXT)])], { ...OPEN_PANELS, ...map });
const hvBoot = async (browser, opts = {}) => {
    const r = await bootPage(browser, {
        wordlist: 'stub', storage: hvStorage(), beforeGoto: ({ page }) => page.clock.install(), ...opts,
    });
    // 記下每次「啟動計時」的假時間：之後用它算出 1499／1500ms 的精確時間點
    await r.page.evaluate(() => {
        const o = window._lhDwellArm;
        window.__hvArm = [];
        window._lhDwellArm = function (...a) { const v = o.apply(this, a); window.__hvArm.push({ at: Date.now(), on: _lhDwellTimer !== 0 }); return v; };
    });
    return r;
};
// 左面板開機時還在滑進來（CSS 動畫不受假時鐘管）：先等它停，再暫停時鐘
const hvPause = async page => { await waitStill(page); const t = await page.evaluate(() => Date.now()); await page.clock.pauseAt(t + 1000); };
// 第 i 個字的位置（用 lhMirror 量一次，只在測試裡）
const hvPoint = (page, i) => page.evaluate(i => {
    const ta = document.querySelector('.section-textarea'), m = lhMirror(ta);
    try { const p = lhCaretRect(ta, m, i); return { x: p.left + 4, y: p.top + p.height / 2 }; } finally { m.remove(); }
}, i);
// 滑鼠停到第 0 個字附近、反白 [a, b)、送 mouseup，往前走幾個 frame 讓浮動列出現。回傳指標位置
const hvArm = async (page, a = 0, b = 7) => {
    await page.evaluate(() => document.querySelector('.section-textarea').focus());   // 聚焦後版面才定下來，先聚焦再量位置
    const pt = await hvPoint(page, 1);
    await page.mouse.move(pt.x, pt.y);
    await page.evaluate(([a, b]) => {
        const ta = document.querySelector('.section-textarea');
        ta.focus(); ta.setSelectionRange(a, b);
        ta.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    }, [a, b]);
    await page.waitForTimeout(100);   // 同上：select／selectionchange 先送完，再讓假時鐘前進
    await page.clock.runFor(60);
    await expect(page.locator(ANBAR)).toBeVisible();
    return pt;
};
// 計時是不是真的啟動了（用 window.__hvArm 的最後一筆）
const hvArmAt = page => page.evaluate(() => { const l = window.__hvArm.filter(x => x.on); return l.length ? l[l.length - 1].at : null; });
// 從啟動點再過 ms 毫秒（假時間）
const hvAfterArm = async (page, ms) => {
    const at = await hvArmAt(page), now = await page.evaluate(() => Date.now());
    expect(at, '浮動列出現時有啟動計時').not.toBeNull();
    await page.clock.runFor(Math.max(0, at + ms - now));
};
const hvReset = async page => {
    await page.evaluate(() => { lhMapHideBar(); const ta = document.querySelector('.section-textarea'); ta.setSelectionRange(0, 0); });
    await page.waitForTimeout(100);   // 真實時間：讓收合選取送出的 select／selectionchange 事件先送完，不會漏進下一個案例
    await page.clock.runFor(600);
    await expect(page.locator(ANBAR)).toBeHidden();
};

test('hover：偏好設定有「反白停留自動分析」開關與說明，預設關', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', HV_TEXT)])]) });
    await openPrefs(page);
    const sw = prefSw(page, '反白停留自動分析');
    await expect(sw).toHaveCount(1);
    await expect(sw).toHaveAttribute('aria-checked', 'false');
    await expect(sw.locator('.rm-pill')).toHaveText('關');
    const cap = page.locator('#rmPrefHover');
    await expect(cap).toHaveText('反白後滑鼠停著不動 1.5 秒，自動打開句構面板；只有接了滑鼠的電腦會自動出現，觸控請按「分析」');
    await expect(sw).toHaveAttribute('aria-describedby', 'rmPrefHover');
    // 是「句構分析」區塊的最後一項，不縮排
    expect(await sw.evaluate(b => ({ last: b.parentElement.lastElementChild.id, sub: !!b.closest('.rm-sub') }))).toEqual({ last: 'rmPrefHover', sub: false });
    await sw.click();
    await expect(sw).toHaveAttribute('aria-checked', 'true');
    await expect(sw.locator('.rm-pill')).toHaveText('開');
    expect(JSON.parse(await lsGetMap(page))).toMatchObject({ autoHover: true });
    expect(errors).toEqual([]);
    await context.close();
});

test('hover：滑鼠反白停 1.5 秒自動打開句構面板，不搶焦點', async ({ browser }) => {
    const { context, page, errors } = await hvBoot(browser);
    await hvPause(page);
    const panel = page.locator(AN);
    await hvArm(page, 0, 7);
    await expect(panel).toBeHidden();
    await hvAfterArm(page, 1499);
    await expect(panel, '1499ms 還沒開').toBeHidden();
    await page.clock.runFor(1);
    await expect(panel, '1500ms 開了').toBeVisible();
    await expect(panel.locator('.section-menu-title')).toHaveText('句構：Verse');
    // 沒搶焦點：輸入框還在、選取不變
    expect(await anTa(page)).toEqual({ ta: true, a: 0, b: 7 });
    await expect(page.locator(AN_BTN)).toHaveAttribute('aria-expanded', 'true');
    // 面板開了之後，指標離開區域不關
    await page.mouse.move(5, 5);
    await page.clock.runFor(3000);
    await expect(panel).toBeVisible();
    expect(errors).toEqual([]);
    await context.close();
});

test('hover：會取消的動作', async ({ browser }) => {
    const { context, page, errors } = await hvBoot(browser);
    await hvPause(page);
    const panel = page.locator(AN);
    const cases = {
        '指標移出區域': async pt => { await page.mouse.move(pt.x + 600, pt.y + 400); },
        '滾輪': async () => { await page.mouse.wheel(0, 40); await page.waitForTimeout(100); },   // 真實時間：滾輪事件是非同步送的，先送到再讓假時鐘前進（R2 輸入框撐滿後滾輪落在不會捲的地方，送達變慢）
        '按鍵': async () => { await page.keyboard.down('Shift'); await page.keyboard.up('Shift'); },
        '選取改變': async () => { await page.evaluate(() => document.querySelector('.section-textarea').setSelectionRange(1, 5)); },
        '開始組字': async () => { await page.evaluate(() => document.querySelector('.section-textarea').dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))); },
        '打開韻腳選單': async () => { await page.locator('#rhymeMenuBtn').dispatchEvent('click'); },
        '指標進到浮動列': async () => { const b = await page.locator(ANBAR).boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); },
        '區域內移動 5px': async pt => { await page.mouse.move(pt.x + 5, pt.y); },
    };
    for (const [why, act] of Object.entries(cases)) {
        const pt = await hvArm(page);
        await page.clock.runFor(1000);
        await act(pt);
        await page.clock.runFor(2000);
        await expect(panel, why + '：不開').toBeHidden();
        // 清乾淨給下一個案例：組字要送 compositionend、選單要關
        await page.evaluate(() => {
            const ta = document.querySelector('.section-textarea');
            ta.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' }));
            lhMapCloseMenu(false);
        });
        await hvReset(page);
    }
    // 正向對照：區域內只動 2px，1000ms 時動一下，1500ms 還是照開
    let pt = await hvArm(page);
    await page.clock.runFor(1000);
    await page.mouse.move(pt.x + 2, pt.y);
    await hvAfterArm(page, 1500);
    await expect(panel, '2px 不取消').toBeVisible();
    await hvReset(page);
    // 取消之後不會自己重新起算：動 5px 之後等再久也不開；重新反白一次才重新等 1.5 秒
    pt = await hvArm(page);
    await page.mouse.move(pt.x + 5, pt.y);
    await page.clock.runFor(10000);
    await expect(panel, '取消了就不重新起算').toBeHidden();
    await hvArm(page, 0, 6);
    await hvAfterArm(page, 1499);
    await expect(panel).toBeHidden();
    await page.clock.runFor(1);
    await expect(panel, '重新反白後再等 1.5 秒').toBeVisible();
    expect(errors).toEqual([]);
    await context.close();
});

test('hover：觸控、鍵盤選取或沒打開都不會自動出現', async ({ browser }) => {
    // 開關關著：同樣的滑鼠流程，等多久都不開
    let r = await hvBoot(browser, { storage: hvStorage({ 'lh:map': JSON.stringify({ autoHover: false }) }) });
    await hvPause(r.page);
    await hvArm(r.page);
    await r.page.clock.runFor(5000);
    await expect(r.page.locator(AN), '開關關著').toBeHidden();
    await expect(r.page.locator(ANBAR)).toBeVisible();
    expect(r.errors).toEqual([]);
    await r.context.close();
    // 全新使用者（沒有 lh:map）
    r = await hvBoot(browser, { storage: hvStorage({}) });
    await hvPause(r.page);
    await hvArm(r.page);
    await r.page.clock.runFor(5000);
    await expect(r.page.locator(AN), '全新 profile').toBeHidden();
    expect(await lsGetMap(r.page)).toBeNull();
    await r.context.close();
    // 鍵盤選取：滑鼠停在字上，Shift+→ 三下，浮動列 400ms 後出現但面板不會自己開
    r = await hvBoot(browser);
    await hvPause(r.page);
    const pt = await hvPoint(r.page, 1);
    await r.page.mouse.move(pt.x, pt.y);
    await r.page.evaluate(() => { const ta = document.querySelector('.section-textarea'); ta.focus(); ta.setSelectionRange(0, 0); });
    for (let i = 0; i < 3; i++) await r.page.keyboard.press('Shift+ArrowRight');
    await r.page.clock.runFor(450);
    await expect(r.page.locator(ANBAR), '鍵盤選取也出現浮動列').toBeVisible();
    await r.page.clock.runFor(5000);
    await expect(r.page.locator(AN), '鍵盤選取').toBeHidden();
    expect((await r.page.evaluate(() => window.__hvArm)).length, '沒有啟動過計時').toBe(0);
    await r.context.close();
    // 手機（觸控、粗略指標）：開關開著，反白（連相容的 mouseup 都送）再久也不開；「📏 分析」照樣能點開
    r = await hvBoot(browser, { device: DEVICES.phone, storage: hvStorage() });
    await r.page.locator('#mtab-lyrics').click();
    await waitStill(r.page);
    await anPick(r.page, 0, 7);
    await r.page.evaluate(() => document.querySelector('.section-textarea').dispatchEvent(new MouseEvent('mouseup', { bubbles: true })));
    await expect(r.page.locator(ANBAR)).toBeVisible();
    await r.page.clock.runFor(5000);
    await expect(r.page.locator(AN), '手機').toBeHidden();
    await r.page.locator(AN_BTN).tap();
    await expect(r.page.locator(AN)).toBeVisible();
    expect(r.errors).toEqual([]);
    await r.context.close();
});

test('hover：不在移動時量版面', async ({ browser }) => {
    const { context, page, errors } = await hvBoot(browser);
    await hvPause(page);
    const pt = await hvArm(page);
    await page.evaluate(() => {
        window.__mirrors = 0;
        const o = window.lhMirror;
        window.lhMirror = function (...a) { window.__mirrors++; return o.apply(this, a); };
    });
    // 計時中在區域內來回動 20 次（都離起算點不到 3px）
    for (let i = 0; i < 20; i++) await page.mouse.move(pt.x + (i % 2), pt.y);
    expect(await page.evaluate(() => window.__mirrors), 'pointermove 不量版面').toBe(0);
    await hvAfterArm(page, 1500);
    await expect(page.locator(AN), '小動作不取消，照開').toBeVisible();
    expect(errors).toEqual([]);
    await context.close();
});

test('分析面板：點結構手動改、改回自動、AI 斷句', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', AN_V2)])]),
    });
    await seedWords(page, AN_WORDS);
    await page.route('**/prompts/line-struct', r => r.fulfill({ json: { ok: true, prompt: 'X {{LINES}}' } }));
    await page.evaluate(() => { window.__sent = null; window.callLLM = async (m, p) => { window.__sent = p; return '{"lines":[[3,3],[1,6],[9]]}'; }; });
    await anShow(page, 11, 26);
    const panel = page.locator(AN);
    const cell = n => panel.locator('tbody tr').nth(n).locator('td.rm-an-s');
    // 手動：字數不對不收；對了就存、標「手動」、鏡像層的設定也跟著
    await panel.locator('.rm-an-edit').nth(1).click();
    const inp = panel.locator('.rm-an-input');
    await inp.fill('3+3');
    await inp.press('Enter');
    await expect(inp).toBeVisible();
    await inp.fill('4+3');
    await inp.press('Enter');
    await expect(cell(1)).toHaveText('7（4·3）手動');
    expect(await page.evaluate(() => curSong().structs)).toEqual({ '走過熟悉的街道': { g: [4, 3], src: 'man' } });
    // 改回自動
    await panel.locator('.rm-an-act', { hasText: '全部改回自動' }).click();
    await expect(cell(1)).toHaveText('7（2·3·2）');
    expect(await page.evaluate(() => curSong().structs)).toBeUndefined();
    // AI：提示詞從後台拿，字數對的才收（第 3 行 9≠6 不收）
    await panel.locator('.rm-an-act', { hasText: 'AI 斷句' }).click();
    await expect(cell(0)).toHaveText('6（3·3）AI');
    expect(await page.evaluate(() => window.__sent)).toBe('X 1. 獨自站在窗前\n2. 走過熟悉的街道\n3. 終於我也回到');
    expect(await page.evaluate(() => Object.keys(curSong().structs))).toEqual(['獨自站在窗前', '走過熟悉的街道']);
    expect(errors).toEqual([]);
    await context.close();
});

test('滑過才顯示：平常透明，指到同韻的字才浮出，移開淡掉', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', '我在這裡等天亮\n你在那裡看月光\n想你想到心慌')])], { ...OPEN_PANELS, 'lh:map': JSON.stringify({ end: true, letters: false, inner: false, strict: false, skipParticles: true, hoverOnly: true }) }),
    });
    await expect.poll(() => page.locator('#lyricsSections .rm-hl').count()).toBe(3);
    expect(await page.evaluate(() => document.documentElement.hasAttribute('data-rm-hover'))).toBe(true);
    const op = () => page.locator('#lyricsSections .rm-hl').evaluateAll(es => es.map(e => [e.textContent, e.classList.contains('rm-show')]));
    expect(await op()).toEqual([['亮', false], ['光', false], ['慌', false]]);
    expect(await page.locator('#lyricsSections .rm-hl').first().evaluate(e => getComputedStyle(e).opacity)).toBe('0');
    await page.locator('#lyricsSections .section-textarea').first().scrollIntoViewIfNeeded();
    const r = await page.locator('#lyricsSections .rm-hl').nth(1).boundingBox();
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
    await expect.poll(op).toEqual([['亮', true], ['光', true], ['慌', true]]);   // 三個都是 ㄤ 家族
    await page.mouse.move(5, 5);
    await expect.poll(op).toEqual([['亮', false], ['光', false], ['慌', false]]);
    expect(errors).toEqual([]);
    await context.close();
});
