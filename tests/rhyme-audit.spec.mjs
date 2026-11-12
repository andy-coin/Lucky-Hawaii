// 檢查：第 10 階段所有新介面放在一起量——三種裝置 44px、小螢幕、切版型與另一個分頁打斷、惡意文字與原始碼掃描、
// 列印與匯出、舊資料與備份、顏色以外的線索（UI-SPEC §9）
// 每個計畫已經各自測過自己的功能；這裡把浮層、面板、分頁互相打斷的情況放在一起，用同一把尺再量一次
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage, openTwoTabs, activeSongRaw, clickBackup } from './helpers.mjs';
import { DEVICES, waitStill, setScale, auditTouchTargets, expectFullyInViewport } from './layout-lib.mjs';
import { parseAny, walk } from './scan-lib.mjs';

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/v096-localStorage.json', import.meta.url), 'utf8'));
const OPEN_PANELS = { leftPanelCollapsed: 'false', rightPanelCollapsed: 'false' };
const v2Storage = (songs, extra = OPEN_PANELS) => ({
    ...FIXTURE, 'lh:schema': '2', 'lh:songs': JSON.stringify(songs), 'lh:activeSong': songs[0].id, ...extra,
});
const typed = (id, type, text, extra = {}) => ({ id, type, custom: '', color: '', height: null, label: '', text, collapsed: false, ...extra });
const song = (sections, extra = {}) => ({ id: 's1', title: '測試歌', sections, hashtags: [], context: '', createdAt: 1, updatedAt: 1, ...extra });

const F_AABB = '我望著遠方的光\n獨自站在窗\n走過熟悉的街道\n終於我也回到';
const F_ABAB = '我望著遠方的光\n走過熟悉的街道\n你笑著說天亮\n不怕前方的路遙';
const READ_TXT = '我們一起行\n我望著遠方的光';
const READ_TAIL = '們一起行';
const MAP_ALL = JSON.stringify({ end: true, letters: true, inner: true, strict: false, skipParticles: true });
const MAP_LETTERS = JSON.stringify({ end: true, letters: true, inner: false, strict: false, skipParticles: true });
const BAR = '#rhymeSelBar';
const MENU = '#rhymeMenu';
const STATS = '#rhymeStats';
const STRIP = '.section-rhyme';

const secs = page => page.locator('#lyricsSections .lyrics-section');
const sw = (page, name) => page.locator('#rhymeMenu .rm-switch', { hasText: name });
const radio = (page, name) => page.locator('#rhymeMenu [role=radio]', { hasText: name });
const bands = (page, n = 0) => secs(page).nth(n).locator('.rhyme-mirror .rm-hl').evaluateAll(els => els.map(e => [e.textContent, e.dataset.f]));
const pick = (page, a, b, n = 0) => page.evaluate(([a, b, n]) => {
    const ta = document.querySelectorAll('.section-textarea')[n];
    ta.focus(); ta.setSelectionRange(a, b);
}, [a, b, n]);
const lsMap = page => page.evaluate(() => localStorage.getItem('lh:map'));
const ready = page => page.evaluate(() => Promise.all([window.__hoyunReady, window.__hoyunWordlistReady, window.__hoyunSongsReady, window.__lhMapReady]));
const openLyricsTab = async page => {
    if (await page.evaluate(() => lhIsSheetMode())) await page.locator('#mtab-lyrics').click();
    await waitStill(page);
};
// 三個浮層現在有幾個開著（class show）
const shown = page => page.evaluate(() => document.querySelectorAll('#rhymeMenu.show, #rhymeStats.show, #rhymeSelBar.show').length);
const polyInfo = page => page.evaluate(() => {
    const rs = getCharAllReadings('行').map(x => x.reading);
    const fam = r => RHYME_TO_FAMILY[getZhuyinRhyme(r)];
    const auto = lhRhymeReading({ char: '行', tail: '們一起行' }, null);
    const other = rs.find(r => fam(r) !== fam(auto));
    return { rs, auto, other, fa: String(fam(auto)), fo: String(fam(other)) };
});
async function readDownload(dl) {
    const chunks = [];
    for await (const c of await dl.createReadStream()) chunks.push(c);
    return Buffer.concat(chunks).toString('utf8');
}
// 每個色塊的中心對上「句尾字」在輸入框裡的位置（容許左右 1px、上下 2px）
const bandErrors = page => page.evaluate(() => {
    const ta = document.querySelector('.section-textarea'), secEl = ta.closest('.lyrics-section');
    const res = lhRhymeAnalyze(ta.value, { strict: false, skipParticles: true }, curSong().readings);
    const lines = ta.value.split('\n');
    let off = 0;
    const idx = [];
    res.rows.forEach((r, n) => { if (r.t) idx.push(off + r.t.i); off += lines[n].length + 1; });
    const hls = [...secEl.querySelectorAll('.rhyme-mirror .rm-hl')];
    const m = lhMirror(ta);
    const out = idx.map((i, k) => {
        const c = lhCaretRect(ta, m, i), r = hls[k].getBoundingClientRect();
        return { dx: Math.abs(r.left - c.left), dy: Math.abs((r.top + r.height / 2) - (c.top + c.height / 2)), ch: hls[k].textContent === ta.value[i] };
    });
    m.remove();
    return { want: idx.length, got: hls.length, out };
});
const expectBandsAligned = async (page, tag) => {
    const r = await bandErrors(page);
    expect(r.got, tag + '：色塊數').toBe(r.want);
    expect(r.want, tag + '：至少有一個色塊').toBeGreaterThan(0);
    for (const e of r.out) {
        expect(e.ch, tag + '：色塊包的是句尾字').toBe(true);
        expect(e.dx, tag + '：左右誤差').toBeLessThanOrEqual(1);
        expect(e.dy, tag + '：上下誤差').toBeLessThanOrEqual(2);
    }
};

// ==================== 三種裝置的觸控大小 ====================
const MINE = /rhymeMenuBtn|rm-more|rm-switch|type-row|rm-legend-toggle|section-menu-close|section-rhyme|rm-row|rm-bar|rm-chip/;
test('檢查：三種裝置的觸控大小（韻腳地圖）', async ({ browser }) => {
    test.setTimeout(240_000);
    const two = v2Storage([song([typed('sa', 'verse', F_AABB), typed('sb', 'chorus', READ_TXT)])], { ...OPEN_PANELS, 'lh:map': MAP_LETTERS });
    for (const [name, device] of [['手機 390×844', DEVICES.phone], ['平板直放 820×1180', DEVICES.tablet], ['平板橫放 1180×820', DEVICES.tabletLandscape]]) {
        const { context, page, errors } = await bootPage(browser, { storage: two, device, wordlist: 'stub' });
        await openLyricsTab(page);
        const audit = async (mustSee, label) => {
            await waitStill(page);
            const r = await auditTouchTargets(page, { mustSee });
            expect(r.missing, `${name} ${label} 沒量到`).toEqual([]);
            expect(r.failures.filter(f => MINE.test(f.selector)), `${name} ${label} 觸控目標不到 44×44`).toEqual([]);
            expect(r.overlaps.filter(o => MINE.test(o.a) || MINE.test(o.b)), `${name} ${label} 相鄰重疊（超過 4px）`).toEqual([]);
        };
        // 標題字母條與「韻腳 ▾」按鈕
        await audit(['#rhymeMenuBtn', 'button.section-rhyme'], '工具列與字母條');
        // 選單開著、色票對照展開：每個開關、兩個判定 radio、色票對照鈕、關閉鈕
        await page.locator('#rhymeMenuBtn').click();
        await expect(page.locator(MENU)).toBeVisible();
        await page.locator('#rhymeMenu .rm-legend-toggle').click();
        await expect(page.locator('#rhymeLegend')).toBeVisible();
        await audit(['#rhymeMenu .rm-switch', '#rhymeMenu .type-row', '#rhymeMenu .rm-legend-toggle', '#rhymeMenu .rm-more'], '選單');
        await page.keyboard.press('Escape');   // 選單沒有關閉鈕了（R2）：Esc 或點外面
        await expect(page.locator(MENU)).toBeHidden();
        // 統計開著：逐句列與關閉鈕
        await page.locator(STRIP).first().click();
        await expect(page.locator(STATS)).toBeVisible();
        await audit(['#rhymeStats .rm-row', '#rhymeStats .section-menu-close'], '統計');
        await page.locator('#rhymeStats .section-menu-close').click();
        await expect(page.locator(STATS)).toBeHidden();
        // 浮動列開著、指定讀音那一排展開：三顆按鈕與每個晶片
        await pick(page, 4, 5, 1);
        await expect(page.locator(BAR)).toBeVisible();
        await page.locator(BAR + ' .rm-bar-rd').click();
        await expect(page.locator('#rhymeSelBar .rm-chip').first()).toBeVisible();
        await audit(['#rhymeSelBar button', '#rhymeSelBar .rm-bar-rd', '#rhymeSelBar .rm-chip'], '浮動列');
        expect(errors).toEqual([]);
        await context.close();
    }
});

// ==================== 小螢幕看得到 ====================
test('檢查：選單、統計、浮動列在小螢幕都看得到', async ({ browser }) => {
    test.setTimeout(240_000);
    const lines14 = Array.from({ length: 14 }, (_, i) => (i % 2 ? '走過熟悉的街道' : '我望著遠方的光')).join('\n');
    const storage = v2Storage([song([typed('sa', 'verse', lines14), typed('sb', 'chorus', READ_TXT)])], { ...OPEN_PANELS, 'lh:map': MAP_LETTERS });
    for (const [name, device, pct] of [['手機放大 150%', DEVICES.phone, 150], ['手機橫放', DEVICES.phoneLandscape, 100]]) {
        const { context, page, errors } = await bootPage(browser, { device, wordlist: 'stub', storage });
        await setScale(page, pct);
        await openLyricsTab(page);
        // 選單（色票對照展開時最高）：整個在可見範圍內，最後一個鈕捲得到
        await page.locator('#rhymeMenuBtn').click();
        await page.locator('#rhymeMenu .rm-legend-toggle').click();
        await waitStill(page);
        await expectFullyInViewport(page, page.locator(MENU));
        const close = page.locator('#rhymeMenu .rm-more');
        await close.scrollIntoViewIfNeeded();
        await expectFullyInViewport(page, close);
        const ov = await page.locator(MENU).evaluate(n => ({ sh: n.scrollHeight, ch: n.clientHeight, oy: getComputedStyle(n).overflowY }));
        expect(ov.sh <= ov.ch + 1 || /(auto|scroll)/.test(ov.oy), name + '：選單放得下，或自己會捲').toBe(true);
        for (const label of ['句尾上色', '段落結構字母', '句中押韻', '忽略句尾語助詞']) {
            const s = sw(page, label);
            await s.scrollIntoViewIfNeeded();
            await expectFullyInViewport(page, s);
        }
        await page.keyboard.press('Escape');   // 沒有關閉鈕了（R2），最後一個是「更多設定…」
        await expect(page.locator(MENU)).toBeHidden();
        // 統計：最後一列捲得到
        await page.locator(STRIP).first().click();
        await expect(page.locator(STATS)).toBeVisible();
        await waitStill(page);
        await expectFullyInViewport(page, page.locator(STATS));
        const last = page.locator('#rhymeStats .rm-row').last();
        await last.scrollIntoViewIfNeeded();
        await expectFullyInViewport(page, last);
        const sc = page.locator('#rhymeStats .section-menu-close');
        await sc.scrollIntoViewIfNeeded();
        await expectFullyInViewport(page, sc);
        await sc.click();
        await expect(page.locator(STATS)).toBeHidden();
        // 浮動列（展開讀音那一排）：整個在可見範圍內，最後一個晶片點得到
        await pick(page, 4, 5, 1);
        await expect(page.locator(BAR)).toBeVisible();
        await page.locator(BAR + ' .rm-bar-rd').click();
        await waitStill(page);
        await expectFullyInViewport(page, page.locator(BAR));
        const chip = page.locator('#rhymeSelBar .rm-chip').last();
        await chip.scrollIntoViewIfNeeded();
        await expectFullyInViewport(page, chip);
        expect(errors).toEqual([]);
        await context.close();
    }
});

// ==================== 切版型時收起來 ====================
test('檢查：切版型時收起來', async ({ browser }) => {
    test.setTimeout(180_000);
    const STARTERS = {
        '韻腳選單': async page => {
            await page.locator('#rhymeMenuBtn').click();
            await expect(page.locator(MENU)).toBeVisible();
        },
        '統計': async page => {
            await page.locator(STRIP).first().click();
            await expect(page.locator(STATS)).toBeVisible();
        },
        '浮動列': async page => {
            await pick(page, 6, 7, 0);
            await expect(page.locator(BAR)).toBeVisible();
        },
    };
    for (const [what, start] of Object.entries(STARTERS)) {
        const { context, page, errors } = await bootPage(browser, {
            device: DEVICES.desktop, wordlist: 'stub',
            storage: v2Storage([song([typed('sa', 'verse', F_AABB)])], { ...OPEN_PANELS, 'lh:map': MAP_LETTERS }),
        });
        await waitStill(page);
        await start(page);
        for (const size of [{ width: 820, height: 1180 }, { width: 390, height: 844 }, { width: 1440, height: 900 }]) {
            await page.setViewportSize(size);
            await waitStill(page);
            const tag = `${what}：${size.width}×${size.height}`;
            expect(await shown(page), tag + ' 沒有浮層留著').toBe(0);
            await expect(page.locator('#rhymeMenuBtn'), tag).toHaveAttribute('aria-expanded', 'false');
            expect(await page.locator(STRIP).evaluateAll(els => els.map(e => e.getAttribute('aria-expanded'))), tag + ' 字母條沒有標著展開').not.toContain('true');
        }
        await openLyricsTab(page);
        await expectBandsAligned(page, what + '：回到電腦版');
        expect(await lsMap(page), what + '：設定沒被動到').toBe(MAP_LETTERS);
        expect(errors).toEqual([]);
        await context.close();
    }
});

// ==================== 另一個分頁改了歌或設定 ====================
test('檢查：另一個分頁改了歌或設定', async ({ browser }) => {
    test.setTimeout(180_000);
    const NEW = '另一頁寫的光\n新的一行亮';
    const STARTERS = {
        '韻腳選單': async b => { await b.locator('#rhymeMenuBtn').click(); await expect(b.locator(MENU)).toBeVisible(); },
        '統計': async b => { await b.locator(STRIP).first().click(); await expect(b.locator(STATS)).toBeVisible(); },
        // 選第一行最後三個字
        '浮動列': async b => {
            await b.evaluate(() => { const ta = document.querySelector('.section-textarea'); const L = ta.value.split('\n')[0].length; ta.focus(); ta.setSelectionRange(L - 3, L); });
            await expect(b.locator(BAR)).toBeVisible();
        },
    };
    for (const [what, start] of Object.entries(STARTERS)) {
        const { context, pages: [a, b], errs } = await openTwoTabs(browser, v2Storage([song([typed('sa', 'verse', F_AABB)])], { ...OPEN_PANELS, 'lh:map': MAP_LETTERS }));
        await waitStill(a);
        await waitStill(b);
        // ---- A 改了歌：B 的浮層先收起來，再載入新文字、重畫色塊 ----
        await start(b);
        const taA = a.locator('#lyricsSections .section-textarea').first();
        await taA.fill(NEW);
        await taA.blur();
        if (what === '浮動列') {
            // 浮動列開著時 B 的游標還在輸入框裡：照第 8 階段的規則，別的分頁的修改等 B 離開輸入框才套用（不打斷正在打字的人）
            await b.waitForTimeout(500);
            expect(await b.locator('#lyricsSections .section-textarea').first().inputValue(), '浮動列：輸入框還在時不重畫').toBe(F_AABB);
            await b.evaluate(() => document.activeElement.blur());
        }
        await expect(b.locator('#lyricsSections .section-textarea').first(), what + '：B 載入了新文字').toHaveValue(NEW);
        expect(await shown(b), what + '：改歌之後 B 沒有浮層').toBe(0);
        await expect(b.locator('#rhymeMenuBtn')).toHaveAttribute('aria-expanded', 'false');
        await expect.poll(async () => (await bands(b)).map(x => x[0]), { message: what + '：B 的色塊跟著新文字重畫' }).toEqual(['光', '亮']);
        await expect.poll(async () => (await bands(a)).map(x => x[0])).toEqual(['光', '亮']);
        expect(await bands(b), what + '：兩個分頁的色塊一樣').toEqual(await bands(a));
        // ---- A 改了設定：B 的浮層先收起來，B 的設定與畫面跟著變 ----
        await start(b);
        await a.locator('#rhymeMenuBtn').click();
        await radio(a, '嚴格').click();
        await expect.poll(() => lsMap(b)).toContain('"strict":true');
        expect(await shown(b), what + '：改設定之後 B 沒有浮層').toBe(0);
        await b.locator('#rhymeMenuBtn').click();
        await expect(radio(b, '嚴格')).toHaveAttribute('aria-checked', 'true');
        expect(errs.flatMap(e => e.errors), what).toEqual([]);
        await context.close();
    }
});

// ==================== 惡意文字只當文字 ====================
test('檢查：惡意文字只當文字（韻腳地圖）', async ({ browser }) => {
    test.setTimeout(90_000);
    const NAME = '<b>名</b>';
    const H1 = '<img src=x onerror=alert(1)>你';
    const H2 = '</textarea><script>window.__pwn=1</script>光';
    const H3 = '<b>名</b>行';
    const TEXT = [H1, H2, H3, '我望著遠方的光'].join('\n');
    const { context, page, errors } = await bootPage(browser, {
        device: DEVICES.desktop, wordlist: 'stub',
        storage: v2Storage([song([typed('sa', 'custom', TEXT, { custom: NAME }), typed('sb', 'verse', '別段的歌詞')])], { ...OPEN_PANELS, 'lh:map': MAP_ALL }),
    });
    let dialogs = 0;
    page.on('dialog', () => { dialogs++; });
    const bare = sel => page.locator(sel).evaluateAll(els => els.reduce((n, el) => n + el.querySelectorAll('img, script, b').length, 0));
    const SURFACES = '#lyricsSections, #rhymeStats, #rhymeSelBar, #rhymeMenu, #lhLive, #copyToast';
    await waitStill(page);
    // 鏡像層：文字照原樣（只多一個結尾零寬字元），沒有任何標籤
    expect(await page.locator('.rhyme-mirror').first().evaluate(m => m.textContent)).toBe(TEXT + '​');
    expect(await page.locator('.rhyme-mirror').first().evaluate(m => m.querySelectorAll('*:not(.rm-hl):not(.rm-inner)').length)).toBe(0);
    await expect(page.locator('#lyricsSections .section-type').first()).toHaveText(NAME);
    expect(await bare(SURFACES)).toBe(0);
    // 字母條：標籤與提示只有字母
    const strip = page.locator(STRIP).first();
    await expect(strip).toBeVisible();
    for (const attr of ['aria-label', 'title']) {
        const v = await strip.getAttribute(attr);
        expect(v, '字母條的 ' + attr).toBeTruthy();
        expect(v).not.toMatch(/[<>]/);
    }
    // 統計：標題用段落名稱、每一列帶整行文字，全部是純文字
    await strip.click();
    await expect(page.locator(STATS)).toBeVisible();
    await expect(page.locator(STATS + ' .section-menu-title')).toHaveText('韻腳統計：' + NAME);
    // 逐句那一列會把長句截短（加 …），所以只比對前面的字
    await expect(page.locator(STATS)).toContainText('你<img src=x o');
    await expect(page.locator(STATS)).toContainText('</textarea><');
    expect(await bare(STATS)).toBe(0);
    expect(await page.locator(STATS + ' .section-menu-title').evaluate(e => e.children.length)).toBe(0);
    await page.locator(STATS + ' .section-menu-close').click();
    // 浮動列：選到惡意那一行的句尾「光」
    const at = TEXT.indexOf('光');
    await pick(page, at, at + 1, 0);
    await expect(page.locator(BAR)).toBeVisible();
    await expect(page.locator(BAR + ' button').first()).toHaveText('🔍 查韻：光');
    expect(await bare(BAR)).toBe(0);
    // 指定讀音：選到「名行」的行，換一個讀音，朗讀區仍是純文字
    const atRow = TEXT.indexOf('行');
    await pick(page, atRow, atRow + 1, 0);
    await expect(page.locator(BAR + ' .rm-bar-rd')).toBeVisible();
    await page.locator(BAR + ' .rm-bar-rd').click();
    const info = await polyInfo(page);
    await page.locator('#rhymeSelBar .rm-chip', { hasText: info.other }).click();
    await expect(page.locator('#lhLive')).toContainText('已指定「行」讀音為');
    expect(await page.locator('#lhLive *').count()).toBe(0);
    expect(await page.locator('.rm-hl.rm-manual').count()).toBe(1);
    // 選單
    await page.locator('#rhymeMenuBtn').click();
    expect(await bare(MENU)).toBe(0);
    await page.keyboard.press('Escape');
    // 一切都沒有被執行
    expect(await page.evaluate(() => window.__pwn), 'script 沒有被執行').toBeUndefined();
    expect(await bare(SURFACES), '沒有 img／script／b 元素').toBe(0);
    expect(await bare('body > *:not(script)')).toBe(0);
    expect(dialogs, 'alert 沒有被觸發').toBe(0);
    expect(errors).toEqual([]);
    await context.close();
});

// ==================== 新程式沒有拼 HTML ====================
// 用語法樹找：不能對 innerHTML／outerHTML 賦值、不能呼叫 insertAdjacentHTML／document.write、不能 setAttribute('on…')、不能 .onxxx = 賦值
function htmlSinks(code) {
    const hits = [];
    walk(parseAny(code), node => {
        const prop = n => n && n.type === 'MemberExpression' && (n.property.name || n.property.value);
        if (node.type === 'AssignmentExpression') {
            const p = prop(node.left) || '';
            if (/^(innerHTML|outerHTML)$/.test(p)) hits.push('賦值 ' + p);
            else if (/^on[a-z]+$/.test(p)) hits.push('賦值 ' + p);
        }
        if (node.type === 'CallExpression') {
            const p = prop(node.callee);
            if (p === 'insertAdjacentHTML' || p === 'write' && node.callee.object.name === 'document') hits.push('呼叫 ' + p);
            if (p === 'setAttribute' && node.arguments[0] && node.arguments[0].type === 'Literal' && /^on/i.test(String(node.arguments[0].value))) hits.push('setAttribute(' + node.arguments[0].value + ')');
        }
    });
    return hits;
}
test('檢查：韻腳地圖新程式沒有拼 HTML', () => {
    for (const f of ['js/rhyme-core.js', 'js/rhyme-map.js']) {
        const code = readFileSync(f, 'utf8');
        expect(code.length, f + ' 有讀到').toBeGreaterThan(500);
        expect(htmlSinks(code), f).toEqual([]);
    }
    // 自檢：掃描器真的抓得到
    expect(htmlSinks('el.innerHTML = x;')).toEqual(['賦值 innerHTML']);
    expect(htmlSinks('el.outerHTML = x;')).toEqual(['賦值 outerHTML']);
    expect(htmlSinks('el.insertAdjacentHTML("beforeend", x); document.write(x);')).toEqual(['呼叫 insertAdjacentHTML', '呼叫 write']);
    expect(htmlSinks('el.setAttribute("onclick", "x()");')).toEqual(['setAttribute(onclick)']);
    expect(htmlSinks('el.onclick = "x()";')).toEqual(['賦值 onclick']);
    expect(htmlSinks('el.textContent = x; el.setAttribute("aria-label", x);')).toEqual([]);
});

// ==================== 列印與匯出沒有韻腳標記 ====================
test('檢查：列印與匯出沒有韻腳標記', async ({ browser }) => {
    test.setTimeout(90_000);
    const { context, page, errors } = await bootPage(browser, {
        device: DEVICES.desktop, wordlist: 'stub',
        storage: v2Storage([song([typed('sa', 'verse', F_ABAB + '\n愛你到天亮啊'), typed('sb', 'chorus', READ_TXT)])], { ...OPEN_PANELS, 'lh:map': MAP_ALL }),
        init: () => { window.__printCount = 0; window.print = () => { window.__printCount++; }; },
    });
    await waitStill(page);
    expect((await bands(page)).length, '前置：畫面上真的有色塊').toBeGreaterThan(0);
    expect(await page.locator('.rm-inner').count(), '前置：也有句中底線').toBeGreaterThan(0);
    const clean = (t, tag) => {
        expect(t, tag + '：沒有 rm- 類別').not.toContain('rm-');
        expect(t, tag + '：沒有鏡像層').not.toContain('rhyme-mirror');
        expect(t, tag + '：沒有零寬字元').not.toContain('​');
    };
    const item = label => page.locator('#exportMenu .export-item').filter({ has: page.locator('.export-label', { hasText: label }) });
    const download = async label => {
        await page.locator('#exportToggle').click();
        const [dl] = await Promise.all([page.waitForEvent('download'), item(label).click()]);
        return readDownload(dl);
    };
    const txt = await download('TXT');
    expect(txt).toContain('愛你到天亮啊');
    clean(txt, 'TXT');
    const md = await download('Markdown');
    expect(md).toContain('愛你到天亮啊');
    clean(md, 'Markdown');
    // PDF 列印頁：只有標題與歌詞；畫面上的鏡像層在列印時不顯示
    await page.locator('#exportToggle').click();
    await item('PDF').click();
    expect(await page.evaluate(() => window.__printCount)).toBe(1);
    await page.emulateMedia({ media: 'print' });
    const sheet = await page.evaluate(() => {
        const s = document.getElementById('printSheet');
        return { html: s.innerHTML, text: s.textContent, marks: s.querySelectorAll('.rm-hl, .rm-inner, .rhyme-mirror, [class*="rm-"]').length, bad: s.querySelectorAll('span').length };
    });
    expect(sheet.text).toContain('愛你到天亮啊');
    expect(sheet.marks, '列印頁沒有韻腳元素').toBe(0);
    clean(sheet.html, '列印頁 HTML');
    clean(sheet.text, '列印頁文字');
    expect(await page.evaluate(() => [...document.querySelectorAll('.rhyme-mirror')].filter(m => m.checkVisibility()).length), '列印時鏡像層不顯示').toBe(0);
    await page.emulateMedia({ media: 'screen' });
    expect(errors).toEqual([]);
    await context.close();
});

// ==================== 舊歌與舊資料 ====================
test('檢查：舊歌與舊資料', async ({ browser }) => {
    test.setTimeout(120_000);
    // 第 9 階段的使用者：有歌、沒有 lh:map、沒有讀音
    const songsRaw = JSON.stringify([song([typed('sa', 'verse', READ_TXT), typed('sb', 'chorus', F_AABB)])]);
    const A = await bootPage(browser, {
        device: DEVICES.desktop, wordlist: 'stub',
        storage: { ...FIXTURE, 'lh:schema': '2', 'lh:songs': songsRaw, 'lh:activeSong': 's1', ...OPEN_PANELS },
    });
    await waitStill(A.page);
    await expect.poll(async () => (await bands(A.page)).length, { message: '開機後畫好色塊' }).toBe(2);
    expect(await A.page.evaluate(() => localStorage.getItem('lh:songs')), '開機與第一次上色不改 lh:songs').toBe(songsRaw);
    expect(await lsMap(A.page), '沒碰過設定就不寫 lh:map').toBeNull();
    await A.page.reload();
    await ready(A.page);
    await expect.poll(async () => (await bands(A.page)).length).toBe(2);
    expect(await A.page.evaluate(() => localStorage.getItem('lh:songs')), '重新整理之後也一樣').toBe(songsRaw);
    expect(await lsMap(A.page)).toBeNull();
    // 現在做一份備份：設嚴格、句中押韻，再指定讀音
    const info = await polyInfo(A.page);
    await A.page.locator('#rhymeMenuBtn').click();
    await radio(A.page, '嚴格').click();
    await sw(A.page, '句中押韻').click();
    await A.page.keyboard.press('Escape');   // 選單沒有關閉鈕了（R2）：Esc 或點外面
    await pick(A.page, 4, 5, 0);
    await expect(A.page.locator(BAR + ' .rm-bar-rd')).toBeVisible();
    await A.page.locator(BAR + ' .rm-bar-rd').click();
    await A.page.locator('#rhymeSelBar .rm-chip', { hasText: info.other }).click();
    await expect.poll(async () => (await activeSongRaw(A.page)).readings).toEqual({ [READ_TAIL]: info.other });
    const wantMap = '{"end":true,"letters":false,"inner":true,"strict":true,"skipParticles":true}';
    expect(await lsMap(A.page)).toBe(wantMap);
    const bk = await clickBackup(A.page);
    const text = await readDownload(bk);
    expect(JSON.parse(text).settings['lh:map']).toBe(wantMap);
    expect(JSON.parse(text).songs.find(s => s.id === 's1').readings).toEqual({ [READ_TAIL]: info.other });
    expect(A.errors).toEqual([]);
    await A.context.close();
    // 乾淨瀏覽器「全部還原」：設定與讀音都回來，重新整理後畫面一樣
    const B = await bootPage(browser, { device: DEVICES.desktop, wordlist: 'stub', storage: { leftPanelCollapsed: 'false' } });
    expect(await lsMap(B.page)).toBeNull();
    await B.page.setInputFiles('#importFileInput', { name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(text) });
    await expect(B.page.locator('#importOverlay')).toBeVisible();
    await B.page.getByRole('button', { name: '全部還原（取代目前資料）' }).click();
    await expect(B.page.locator('#copyToast')).toContainText('已還原');
    expect(await lsMap(B.page)).toBe(wantMap);
    await B.page.reload();
    await ready(B.page);
    await expect.poll(async () => (await bands(B.page, 0))[0]).toEqual(['行', info.fo]);
    await expect(B.page.locator('.rm-hl.rm-manual')).toHaveCount(1);
    expect((await activeSongRaw(B.page)).readings).toEqual({ [READ_TAIL]: info.other });
    expect(B.errors).toEqual([]);
    await B.context.close();
});

// ==================== 顏色以外的線索 ====================
test('檢查：顏色以外的線索', async ({ browser }) => {
    test.setTimeout(90_000);
    const { context, page, errors } = await bootPage(browser, {
        device: DEVICES.desktop, wordlist: 'stub',
        storage: v2Storage([song([typed('sa', 'verse', F_AABB), typed('sb', 'chorus', READ_TXT)])], { ...OPEN_PANELS, 'lh:map': MAP_LETTERS }),
    });
    await waitStill(page);
    // 鏡像層只是裝飾：螢幕閱讀器看不到
    expect(await page.locator('.rhyme-mirror').evaluateAll(els => els.map(e => e.getAttribute('aria-hidden')))).toEqual(['true', 'true']);
    // 結構字母開著：字母條用字母重複了分組
    expect(await page.locator(STRIP).first().textContent()).toBe('AABB');
    expect(await page.locator(STRIP).first().getAttribute('aria-label')).toContain('AABB');
    // 統計：字母、韻母文字、次數都是文字
    await page.locator(STRIP).first().click();
    await expect(page.locator(STATS)).toBeVisible();
    expect(await page.locator(STATS + ' .rm-group').evaluateAll(els => els.map(e => [...e.children].map(c => c.textContent)))).toEqual([['A', '', 'ㄤ ×2'], ['B', '', 'ㄠ ×2']]);
    expect(await page.locator(STATS + ' .rm-row').evaluateAll(els => els.map(e => e.getAttribute('aria-label')))).toEqual(['查韻：光，第 1 句', '查韻：窗，第 2 句', '查韻：道，第 3 句', '查韻：到，第 4 句']);
    await page.locator(STATS + ' .section-menu-close').click();
    // 選單：開關用「開／關」字並帶 aria-checked；色票對照 17 格都有文字標籤
    await page.locator('#rhymeMenuBtn').click();
    const switches = await page.locator('#rhymeMenu .rm-switch').evaluateAll(els => els.map(e => [e.dataset.k, e.getAttribute('aria-checked'), e.querySelector('.rm-pill').textContent]));
    expect(switches).toEqual([['end', 'true', '開'], ['letters', 'true', '開'], ['inner', 'false', '關'], ['line', 'false', '關'], ['skipParticles', 'true', '開']]);
    await page.locator('#rhymeMenu .rm-legend-toggle').click();
    const labels = await page.locator('#rhymeLegend .rm-cell-label').allTextContents();
    expect(labels).toHaveLength(17);
    expect(labels.every(t => t.trim().length > 0)).toBe(true);
    await page.keyboard.press('Escape');   // 選單沒有關閉鈕了（R2）：Esc 或點外面
    // 手動讀音：句尾字多一條虛線底線（不靠顏色），而且朗讀區會說
    const info = await polyInfo(page);
    await pick(page, 4, 5, 1);
    await expect(page.locator(BAR + ' .rm-bar-rd')).toBeVisible();
    await page.locator(BAR + ' .rm-bar-rd').click();
    await page.locator('#rhymeSelBar .rm-chip', { hasText: info.other }).click();
    await expect(page.locator('.rm-hl.rm-manual')).toHaveCount(1);
    expect(await page.locator('.rm-hl.rm-manual').evaluate(e => getComputedStyle(e).borderBottomStyle)).toBe('dotted');
    await expect(page.locator('#lhLive')).toHaveText('已指定「行」讀音為 ' + info.other);
    // 新介面沒有新增文字輸入（手機輸入框 16px 的規則不受影響）
    expect(await page.locator('#rhymeMenu input, #rhymeMenu textarea, #rhymeStats input, #rhymeStats textarea, #rhymeSelBar input, #rhymeSelBar textarea').count()).toBe(0);
    expect(errors).toEqual([]);
    await context.close();
});
