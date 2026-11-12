// 檢查：第 11 階段所有新介面放在一起量——三種裝置 44px、小螢幕摸得到、鍵盤打開時色票看得到、
// 切版型與另一個分頁打斷（UI-SPEC §9）。每個計畫已經各自測過自己的功能；這裡把浮層、面板、分頁互相打斷的情況放在一起，
// 用同一把尺再量一次（結構照 tests/rhyme-audit.spec.mjs）
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage, openTwoTabs } from './helpers.mjs';
import { parseAny, walk } from './scan-lib.mjs';
import { DEVICES, waitStill, setScale, auditTouchTargets, expectFullyInViewport, emulateKeyboard, readKeyboard, insideVisible, restoreViewport } from './layout-lib.mjs';

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/v096-localStorage.json', import.meta.url), 'utf8'));
const OPEN_PANELS = { leftPanelCollapsed: 'false', rightPanelCollapsed: 'false' };
const v2Storage = (songs, extra = OPEN_PANELS) => ({
    ...FIXTURE, 'lh:schema': '2', 'lh:songs': JSON.stringify(songs), 'lh:activeSong': songs[0].id, ...extra,
});
const typed = (id, type, text, extra = {}) => ({ id, type, custom: '', color: '', height: null, label: '', text, collapsed: false, ...extra });
const song = (sections, extra = {}) => ({ id: 's1', title: '測試歌', sections, hashtags: [], context: '', createdAt: 1, updatedAt: 1, ...extra });

const V1 = ['我望著遠方的光', '獨自站在窗', '走過熟悉的街道'].join('\n');
const V2 = ['我望著遠方的光', '獨自站在窗前', '走過熟悉的街道', '終於我也回到'].join('\n');
const TWO = () => song([typed('sa', 'verse', V1), typed('sb', 'verse', V2)]);
// 逐行標記開、對照差異開，其他照預設
const MAP_LINE = JSON.stringify({ line: true, lnRhyme: true, lnDiff: true });
const BAR = '#rhymeSelBar', AN = '#rhymeAnalysis', MENU = '#rhymeMenu', PREFS = '#mapSettingsSection';
const AN_BTN = BAR + ' .rm-bar-an';

const secs = page => page.locator('#lyricsSections .lyrics-section');
const pick = (page, a, b, n = 0) => page.evaluate(([a, b, n]) => {
    const ta = document.querySelectorAll('.section-textarea')[n];
    ta.focus(); ta.setSelectionRange(a, b);
}, [a, b, n]);
const mapOf = page => page.evaluate(() => localStorage.getItem('lh:map'));
const openLyricsTab = async page => {
    if (await page.evaluate(() => lhIsSheetMode())) await page.locator('#mtab-lyrics').click();
    await waitStill(page);
};
const prefSw = (page, label) => page.locator(PREFS + ' .rm-switch').filter({ hasText: label });
// 韻腳選單、浮動列、分析面板現在有幾個開著（class show）
const shown = page => page.evaluate(() => document.querySelectorAll('#rhymeMenu.show, #rhymeSelBar.show, #rhymeAnalysis.show').length);
// 每個段落的標記：[標記上緣, 該行最後一個字最後一個視覺列的上緣]
const markTops = page => page.evaluate(() => [...document.querySelectorAll('#lyricsSections .rhyme-mirror')].flatMap(mirror => [...mirror.querySelectorAll('.lm-mk')].map(m => {
    let node = m.previousSibling;
    while (node && node.nodeType !== 3) node = node.lastChild;
    const rg = document.createRange();
    rg.setStart(node, node.length - 1);
    rg.setEnd(node, node.length);
    const rects = rg.getClientRects(), c = rects[rects.length - 1], lh = parseFloat(getComputedStyle(mirror).lineHeight);
    return { mk: m.getBoundingClientRect().top, row: c.top - (lh - c.height) / 2 };
})));
// 輸入框與鏡像層的右內距：鏡像層 = 輸入框內距 + 捲軸寬
const padInfo = page => page.evaluate(() => {
    const sec = document.querySelector('.lyrics-section'), ta = sec.querySelector('.section-textarea'), m = sec.querySelector('.rhyme-mirror');
    return { ta: parseFloat(getComputedStyle(ta).paddingRight), mirror: parseFloat(m.style.paddingRight), bar: ta.offsetWidth - ta.clientWidth };
});

// ==================== 三種裝置的觸控大小 ====================
const MINE = /rm-more|rm-switch|type-row|section-color-input|rm-color-cell|rm-color-reset|mapSettingsSection|rm-bar-an|rhymeAnalysis|section-menu-close|rm-colors/;
test('檢查：三種裝置的觸控大小（句構分析）', async ({ browser }) => {
    test.setTimeout(300_000);
    for (const [name, device] of [['手機 390×844', DEVICES.phone], ['平板直放 820×1180', DEVICES.tablet], ['平板橫放 1180×820', DEVICES.tabletLandscape]]) {
        const { context, page, errors } = await bootPage(browser, { storage: v2Storage([TWO()], { ...OPEN_PANELS, 'lh:map': MAP_LINE }), device, wordlist: 'stub' });
        await openLyricsTab(page);
        const audit = async (mustSee, label) => {
            await waitStill(page);
            const r = await auditTouchTargets(page, { mustSee });
            expect(r.missing, `${name} ${label} 沒量到`).toEqual([]);
            expect(r.failures.filter(f => MINE.test(f.selector)), `${name} ${label} 觸控目標不到 44×44`).toEqual([]);
            expect(r.overlaps.filter(o => MINE.test(o.a) || MINE.test(o.b)), `${name} ${label} 相鄰重疊（超過 4px）`).toEqual([]);
            return r;
        };
        // 第 1 輪：韻腳選單裡的「更多設定…」與逐行標記開關
        await page.locator('#rhymeMenuBtn').click();
        await expect(page.locator(MENU)).toBeVisible();
        await audit(['#rhymeMenu .rm-more', '#rhymeMenu .rm-switch'], '韻腳選單');
        // 第 2 輪：偏好設定，一個區塊一個區塊捲進來量（預覽固定在最上面時，會蓋住的元素量不到，所以每個區塊各量一次）
        await page.locator(MENU + ' .rm-more').click();
        await expect(page.locator(PREFS)).toBeVisible();
        const summary = page.locator('#prefsTab-map');   // 分頁式（R2）：原本的展開標題換成分頁鈕
        const sb = await summary.boundingBox();
        expect(sb.height, `${name} 「韻腳與句構」分頁鈕高度`).toBeGreaterThanOrEqual(43.5);
        expect(sb.width, `${name} 「韻腳與句構」分頁鈕寬度`).toBeGreaterThanOrEqual(43.5);
        const blocks = [
            ['韻腳地圖', [PREFS + ' .rm-switch', PREFS + ' .type-row[data-m]']],
            ['句構分析', [PREFS + ' .rm-sub .rm-switch', PREFS + ' .rm-switch[data-k="autoHover"]']],
            ['顯示方式', [PREFS + ' .type-row[data-k="pos"]', PREFS + ' .type-row[data-k="size"]', PREFS + ' .type-row[data-k="depth"]']],
            ['韻族顏色', [PREFS + ' .rm-colors input[type=color]', PREFS + ' .rm-color-reset']],
        ];
        for (const [title, sels] of blocks) {
            await page.locator(PREFS + ' .section-menu-block', { has: page.locator('.section-menu-cap', { hasText: new RegExp('^' + title + '$') }) }).first().scrollIntoViewIfNeeded();
            const r = await audit(sels, '偏好設定：' + title);
            expect(r.scanned, `${name} ${title} 有量到東西`).toBeGreaterThan(0);
        }
        // 16 個色票每一個都量過（auditTouchTargets 對同類元素最多抽 30 個，16 個全量）
        const rc = await auditTouchTargets(page, { mustSee: [PREFS + ' .rm-colors input[type=color]'] });
        expect(rc.seen.filter(s => /section-color-input/.test(s)).length, `${name} 色票全部量到（沒有被預覽蓋住）`).toBeGreaterThanOrEqual(16);
        await page.keyboard.press('Escape');
        await expect(page.locator('#settingsOverlay')).not.toHaveClass(/show/);
        // 第 3 輪：浮動列的「📏 分析」與分析面板的關閉鈕
        await pick(page, 11, 26, 1);
        await expect(page.locator(BAR)).toBeVisible();
        await page.locator(AN_BTN).click();
        await expect(page.locator(AN)).toBeVisible();
        await audit(['#rhymeSelBar .rm-bar-an', '#rhymeAnalysis .section-menu-close'], '浮動列與分析面板');
        expect(errors).toEqual([]);
        await context.close();
    }
});

// ==================== 小螢幕摸得到 ====================
test('檢查：偏好設定在小螢幕都摸得到', async ({ browser }) => {
    test.setTimeout(300_000);
    for (const [name, device, pct] of [['手機 390×844 100%', DEVICES.phone, 100], ['手機 390×844 放大 150%', DEVICES.phone, 150], ['手機橫放 844×390', DEVICES.phoneLandscape, 100]]) {
        const { context, page, errors } = await bootPage(browser, { device, wordlist: 'stub', storage: v2Storage([TWO()], { ...OPEN_PANELS, 'lh:map': MAP_LINE }) });
        if (pct !== 100) await setScale(page, pct);
        await openLyricsTab(page);
        await page.locator('#rhymeMenuBtn').click();
        await page.locator(MENU + ' .rm-more').click();
        await waitStill(page);
        const dd = page.locator(PREFS)   // 分頁式（R2）：捲動的是分頁內容;
        await expect(page.locator(PREFS)).toBeVisible();
        const geo = await dd.evaluate(n => ({ sw: n.scrollWidth, cw: n.clientWidth, sh: n.scrollHeight, ch: n.clientHeight, oy: getComputedStyle(n).overflowY }));
        expect(geo.sw, name + '：不會左右捲動').toBeLessThanOrEqual(geo.cw + 1);
        expect(geo.sh > geo.ch + 1 ? /(auto|scroll)/.test(geo.oy) : true, name + '：放不下就自己會捲').toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), name + '：整頁沒有左右捲動').toBe(true);
        // 最後一個色票與「恢復預設顏色」捲得到、整個看得見、中心沒被蓋住
        const last = page.locator(PREFS + ' .rm-colors input[data-n="15"]');
        await last.scrollIntoViewIfNeeded();
        await expectFullyInViewport(page, last);
        const reset = page.locator(PREFS + ' .rm-color-reset');
        await reset.scrollIntoViewIfNeeded();
        await expectFullyInViewport(page, reset);
        const hit = await reset.evaluate(el => { const r = el.getBoundingClientRect(), top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return el === top || el.contains(top); });
        expect(hit, name + '：「恢復預設顏色」中心沒被蓋住').toBe(true);
        // 預覽只有高度夠（37.5rem＝600px，媒體查詢的 rem 永遠是 16px）才固定在上面
        const pv = await page.locator(PREFS + ' .lm-preview-block').evaluate(e => ({ pos: getComputedStyle(e).position, h: window.innerHeight }));
        expect(pv.pos, `${name}：高度 ${pv.h}px 時預覽的定位`).toBe(pv.h >= 600 ? 'sticky' : 'static');
        // 每個區塊的標題都捲得到（往回捲到最上面再往下一個個確認）
        for (const sel of ['#prefsTab-map', PREFS + ' .rm-switch', PREFS + ' .type-row[data-k="depth"]']) {
            const el = page.locator(sel).first();
            await el.scrollIntoViewIfNeeded();
            await expectFullyInViewport(page, el);
        }
        expect(errors).toEqual([]);
        await context.close();
    }
});

// ==================== 鍵盤打開時色票看得到（備援：真的 iOS 鍵盤留給人工） ====================
test('檢查：鍵盤打開時色票看得到', async ({ browser }) => {
    test.setTimeout(120_000);
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.phone, wordlist: 'stub', storage: v2Storage([TWO()], { ...OPEN_PANELS, 'lh:map': MAP_LINE }) });
    await openLyricsTab(page);
    await page.locator('#rhymeMenuBtn').click();
    await page.locator(MENU + ' .rm-more').click();
    await waitStill(page);
    const input = page.locator(PREFS + ' .rm-colors input[data-n="7"]');
    await input.scrollIntoViewIfNeeded();
    await input.focus();
    const before = page.viewportSize();
    await emulateKeyboard(page, 336);
    await waitStill(page);
    // 色票聚焦時 Chromium 不會叫出鍵盤；和真手機一樣，要看得到就得在可見範圍內（視窗縮了之後設定視窗自己會重新排版）
    await input.evaluate(el => el.scrollIntoView({ block: 'nearest' }));
    const kb = await readKeyboard(page);
    expect(kb.vvHeight, '視窗真的縮了').toBeLessThan(before.height - 300);
    const box = await input.boundingBox();
    expect(box, '色票有版面框').not.toBeNull();
    expect(insideVisible(box, kb), `色票 ${JSON.stringify(box)} 在可見範圍 ${kb.vvOffsetTop}..${kb.vvOffsetTop + kb.vvHeight} 內`).toBe(true);
    // 色票聚焦不算叫出鍵盤（layout.js 的 _lhTextFieldFocused 排除 color；iOS 也是叫色票選擇器而不是鍵盤），
    // 所以分頁列不會被收起來；只要它沒有蓋在色票上面（中心最上層就是色票）就行
    const tab = await page.evaluate(() => {
        const t = document.getElementById('mobileTabBar');
        if (!t || t.getClientRects().length === 0) return { visible: false };
        const r = t.getBoundingClientRect(), ib = document.querySelector('.rm-colors input[data-n="7"]').getBoundingClientRect();
        const top = document.elementFromPoint(ib.x + ib.width / 2, ib.y + ib.height / 2);
        return { visible: true, overlapsInput: r.top < ib.bottom && r.bottom > ib.top, inputOnTop: top === document.querySelector('.rm-colors input[data-n="7"]') };
    });
    expect(tab.visible === false || tab.inputOnTop, `分頁列不蓋住色票 ${JSON.stringify(tab)}`).toBe(true);
    await restoreViewport(page, before);
    expect(errors).toEqual([]);
    await context.close();
});

// ==================== 切版型時收起來 ====================
test('檢查：切版型時收起來（句構分析）', async ({ browser }) => {
    test.setTimeout(240_000);
    const STARTERS = {
        '浮動列＋分析面板': async page => {
            await pick(page, 11, 26, 1);
            await expect(page.locator(BAR)).toBeVisible();
            await page.locator(AN_BTN).click();
            await expect(page.locator(AN)).toBeVisible();
        },
        '韻腳選單': async page => {
            await page.locator('#rhymeMenuBtn').click();
            await expect(page.locator(MENU)).toBeVisible();
        },
        '偏好設定': async page => {
            await page.locator('#rhymeMenuBtn').click();
            await page.locator(MENU + ' .rm-more').click();
            await expect(page.locator(PREFS)).toBeVisible();
        },
    };
    for (const [what, start] of Object.entries(STARTERS)) {
        const { context, page, errors } = await bootPage(browser, {
            device: DEVICES.desktop, wordlist: 'stub', storage: v2Storage([TWO()], { ...OPEN_PANELS, 'lh:map': MAP_LINE }),
        });
        await waitStill(page);
        await start(page);
        for (const size of [{ width: 820, height: 1180 }, { width: 390, height: 844 }, { width: 1440, height: 900 }]) {
            await page.setViewportSize(size);
            await waitStill(page);
            const tag = `${what}：${size.width}×${size.height}`;
            expect(await shown(page), tag + ' 沒有浮層留著').toBe(0);
            await expect(page.locator('#rhymeMenuBtn'), tag).toHaveAttribute('aria-expanded', 'false');
            const anBtn = page.locator(AN_BTN);
            if (await anBtn.count()) await expect(anBtn, tag + ' 📏 分析').toHaveAttribute('aria-expanded', 'false');
            if (what === '偏好設定') {
                // 偏好設定是設定視窗的一部分，不是浮層：還開著，捲得動、開關按得下去
                const dd = page.locator(PREFS);
                await expect(page.locator('#settingsOverlay'), tag).toHaveClass(/show/);
                await page.locator(PREFS + ' .rm-color-reset').scrollIntoViewIfNeeded();
                await dd.evaluate(n => { n.scrollTop = 0; });
                const sw = prefSw(page, '字數');
                const was = await sw.getAttribute('aria-checked');
                await sw.click();
                await expect(sw, tag + ' 開關按得下去').toHaveAttribute('aria-checked', was === 'true' ? 'false' : 'true');
                await sw.click();
                await expect(sw, tag + ' 再按回來').toHaveAttribute('aria-checked', was);
            }
        }
        if (what === '偏好設定') await page.keyboard.press('Escape');
        await openLyricsTab(page);
        // 回到電腦版：每個標記都在它那一行最後一個視覺列上（上緣差 1px 以內），右內距 = 輸入框內距 + 捲軸寬
        const tops = await markTops(page);
        expect(tops.length, what + '：有標記').toBe(7);
        for (const t of tops) expect(Math.abs(t.mk - t.row), what + '：標記在該行最後一個視覺列').toBeLessThanOrEqual(1);
        const pad = await padInfo(page);
        expect(Math.abs(pad.mirror - (pad.ta + pad.bar)), what + '：鏡像層右內距重新量過').toBeLessThanOrEqual(0.6);
        const rest = Object.fromEntries(Object.entries(JSON.parse(await mapOf(page))).filter(([k]) => !['end', 'letters', 'inner', 'strict', 'skipParticles'].includes(k)));
        expect(rest, what + '：設定沒被動到（只有一開始寫的三個鍵）').toEqual({ line: true, lnRhyme: true, lnDiff: true });
        expect(errors).toEqual([]);
        await context.close();
    }
});

// ==================== 另一個分頁改了設定或歌 ====================
test('檢查：另一個分頁改了設定或歌（句構分析）', async ({ browser }) => {
    test.setTimeout(240_000);
    const NEW = '另一頁寫的光\n新的一行亮\n再一行';
    const MAP_A = JSON.stringify({ line: true, lnRhyme: true, lnDiff: true, size: 'l', colors: { 0: '#123456' } });
    let round = 0;   // 同一段範圍收起後不會再出現（10-05 刻意），所以第二次換一個範圍
    const STARTERS = {
        '分析面板': async b => {
            await pick(b, 11 - round++, 26, 1);
            await expect(b.locator(BAR)).toBeVisible();
            await b.locator(AN_BTN).click();
            await expect(b.locator(AN)).toBeVisible();
        },
        '韻腳選單': async b => { await b.locator('#rhymeMenuBtn').click(); await expect(b.locator(MENU)).toBeVisible(); },
        '偏好設定': async b => { await b.evaluate(() => lhMapOpenPrefs()); await expect(b.locator(PREFS)).toBeVisible(); },
    };
    for (const [what, start] of Object.entries(STARTERS)) {
        const { context, pages: [a, b], errs } = await openTwoTabs(browser, v2Storage([TWO()], { ...OPEN_PANELS, 'lh:map': MAP_LINE }));
        await waitStill(a);
        await waitStill(b);
        // 兩邊先確認起點：每段的標記數
        const count = p => p.locator('#lyricsSections .lm-mk').count();
        expect(await count(b)).toBe(7);
        // ---- A 改了設定（含顏色）：B 的浮層先收起來，B 的設定、色票、畫面、預覽跟著變 ----
        await start(b);
        await a.evaluate(m => localStorage.setItem('lh:map', m), MAP_A);
        await expect.poll(() => b.evaluate(() => document.documentElement.style.getPropertyValue('--rm-c0')), { message: what + '：B 的顏色變數換成 A 寫的' }).toBe('#123456');
        const shownB = await shown(b);
        expect(shownB, what + '：改設定之後 B 的選單、浮動列、面板都收起來').toBe(0);
        await expect(b.locator('#rhymeMenuBtn')).toHaveAttribute('aria-expanded', 'false');
        await b.evaluate(() => lhMapOpenPrefs());
        await expect(b.locator(PREFS + ' .rm-colors input[data-n="0"]')).toHaveValue('#123456');
        await expect(b.locator(PREFS + ' .type-row[data-k="size"][data-v="l"]')).toHaveAttribute('aria-checked', 'true');
        await expect(prefSw(b, '對照差異')).toHaveAttribute('aria-checked', 'true');
        expect(await count(b), what + '：標記還在').toBe(7);
        expect(await b.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#lyricsSections .lm-t')).fontSize) / parseFloat(getComputedStyle(document.documentElement).fontSize)), what + '：大字級').toBeCloseTo(1, 1);
        expect(await b.locator(PREFS + ' .lm-preview .lm-mk').count(), what + '：預覽重畫').toBeGreaterThan(0);
        await b.keyboard.press('Escape');
        // ---- A 改了歌：B 的浮層先收起來，再載入新文字、標記數跟著變 ----
        await start(b);
        const taA = a.locator('#lyricsSections .section-textarea').first();
        await taA.fill(NEW);
        await taA.blur();
        if (what === '分析面板') {
            // 浮動列開著時 B 的游標還在輸入框裡：照第 8 階段的規則，別的分頁的修改等 B 離開輸入框才套用
            await b.waitForTimeout(500);
            expect(await b.locator('#lyricsSections .section-textarea').first().inputValue(), what + '：輸入框還在時不重畫').toBe(V1);
            await b.evaluate(() => document.activeElement.blur());
        }
        await expect(b.locator('#lyricsSections .section-textarea').first(), what + '：B 載入了新文字').toHaveValue(NEW);
        expect(await shown(b), what + '：改歌之後 B 沒有浮層').toBe(0);
        await expect(b.locator('#rhymeMenuBtn')).toHaveAttribute('aria-expanded', 'false');
        await expect.poll(() => count(b), { message: what + '：B 的標記數還是 7' }).toBe(7);
        await expect.poll(() => secs(b).first().locator('.rm-hl').count()).toBeGreaterThan(0);
        expect(await secs(b).first().locator('.lm-mk').count(), what + '：第一段是 3 行').toBe(3);
        expect(await secs(b).first().locator('.rhyme-mirror').evaluate(m => m.textContent.includes('另一頁寫的光')), what + '：鏡像層是新文字').toBe(true);
        expect(await secs(a).first().locator('.lm-mk').count()).toBe(3);
        expect(errs.flatMap(e => e.errors), what).toEqual([]);
        await context.close();
    }
});

// ==================== 列印與匯出沒有句構標記 ====================
// 所有標記全開、自訂顏色、分析面板開著：TXT／Markdown／PDF／備份都只該有資料，一個標記都不能漏進去（UI-SPEC D-20）
// 字數與斷句預設就是開的，所以序列化後不寫；用已整理好的形式存，備份讀到的才會和 lhRhymeSerialize 一字不差
const MAP_ALL = '{"end":true,"letters":true,"inner":true,"strict":false,"skipParticles":true,"line":true,"lnRhyme":true,"lnDiff":true,"colors":{"3":"#aa3377"}}';
const WORDS = ['望著', '遠方', '熟悉', '街道', '終於', '我也', '回到'];
// 詞放進詞庫（只為了讓斷句有詞可猜 ≈），再通知韻腳地圖重畫
const seedWords = page => page.evaluate(ws => {
    for (const w of ws) wordPhoneticMap.set(w, Array.from(w).map(c => getCharAllReadings(c)[0].reading).join(' '));
    lhMapOnLexiconChange();
}, WORDS);
async function readDownload(dl) {
    const chunks = [];
    for await (const c of await dl.createReadStream()) chunks.push(c);
    return Buffer.concat(chunks).toString('utf8');
}
test('檢查：列印與匯出沒有句構標記', async ({ browser }) => {
    test.setTimeout(120_000);
    const { context, page, errors } = await bootPage(browser, {
        device: DEVICES.desktop, wordlist: 'stub',
        storage: v2Storage([TWO()], { ...OPEN_PANELS, 'lh:map': MAP_ALL }),
        init: () => { window.__printCount = 0; window.print = () => { window.__printCount++; }; },
    });
    await waitStill(page);
    await seedWords(page);
    // 前置：畫面上真的有標記，而且有 ≈（機器猜的）和 ≠（和對照段落不同的字數）
    const marks = await page.locator('.lm-mk').evaluateAll(els => els.map(e => e.textContent).join('|'));
    expect(marks, '前置：有 ≈').toContain('≈');
    expect(marks, '前置：有 ≠').toContain('≠');
    // 開著分析面板（對選取的幾行）
    await openLyricsTab(page);
    await pick(page, 0, 14, 1);
    await expect(page.locator(AN_BTN)).toBeVisible();
    await page.locator(AN_BTN).click();
    await expect(page.locator(AN)).toBeVisible();
    // 偏好設定的預覽也要先存在（建好之後收起來，列印時它不能被看見）
    await page.evaluate(() => { lhMapOpenPrefs(); });
    await expect(page.locator(PREFS + ' .lm-preview')).toHaveCount(1);
    await page.keyboard.press('Escape');
    const clean = (t, tag) => {
        for (const bad of ['lm-', 'rm-', 'rhyme-mirror', '\u200b', '≈', '≠', '✓']) expect(t, tag + '：不含 ' + JSON.stringify(bad)).not.toContain(bad);
    };
    const item = label => page.locator('#exportMenu .export-item').filter({ has: page.locator('.export-label', { hasText: label }) });
    const download = async label => {
        await page.locator('#exportToggle').click();
        const [dl] = await Promise.all([page.waitForEvent('download'), item(label).click()]);
        return readDownload(dl);
    };
    const txt = await download('TXT');
    expect(txt).toContain('獨自站在窗前');
    clean(txt, 'TXT');
    const md = await download('Markdown');
    expect(md).toContain('獨自站在窗前');
    clean(md, 'Markdown');
    // PDF 列印頁：只有標題與歌詞；標記、預覽、分析面板在列印時不顯示
    await page.locator('#exportToggle').click();
    await item('PDF').click();
    expect(await page.evaluate(() => window.__printCount)).toBe(1);
    await page.emulateMedia({ media: 'print' });
    const sheet = await page.evaluate(() => {
        const s = document.getElementById('printSheet');
        return { html: s.innerHTML, text: s.textContent, marks: s.querySelectorAll('[class*="lm-"], [class*="rm-"]').length };
    });
    expect(sheet.text).toContain('獨自站在窗前');
    expect(sheet.marks, '列印頁沒有 lm-／rm- 元素').toBe(0);
    clean(sheet.html, '列印頁 HTML');
    clean(sheet.text, '列印頁文字');
    const visible = await page.evaluate(() => ['.lm-mk', '.lm-preview', '#rhymeAnalysis', '.rhyme-mirror'].map(q => [q, document.querySelectorAll(q).length, [...document.querySelectorAll(q)].filter(e => e.checkVisibility()).length]));
    for (const [q, total, shownN] of visible) {
        if (q !== '#rhymeAnalysis') expect(total, '前置：' + q + ' 存在').toBeGreaterThan(0);
        expect(shownN, '列印時看不見 ' + q).toBe(0);
    }
    await page.emulateMedia({ media: 'screen' });
    // 備份全部：JSON 只有資料，lh:map 是 lhRhymeSerialize 的輸出
    const [bk] = await Promise.all([page.waitForEvent('download'), page.locator('.save-load-controls .save-load-btn >> nth=0').click()]);
    const text = await readDownload(bk);
    expect(text).not.toContain('lm-mk');
    expect(text).not.toContain('rhymeAnalysis');
    clean(JSON.stringify(JSON.parse(text).songs), '備份的歌曲');
    expect(JSON.parse(text).settings['lh:map']).toBe(await page.evaluate(() => lhRhymeSerialize(_lhMapSet)));
    expect(JSON.parse(text).settings['lh:map']).toBe(MAP_ALL);
    expect(errors).toEqual([]);
    await context.close();
});

// ==================== 惡意文字只當文字 ====================
test('檢查：惡意文字只當文字（句構分析）', async ({ browser }) => {
    test.setTimeout(90_000);
    const NAME = '<b>x</b>';
    const H1 = '<img src=x onerror=alert(1)>你';
    const TEXT_A = [H1, '我望著遠方的光'].join('\n');
    const { context, page, errors } = await bootPage(browser, {
        device: DEVICES.desktop, wordlist: 'stub',
        storage: v2Storage([song([
            typed('sa', 'verse', TEXT_A),
            typed('sb', 'custom', '你好嗎\n再見', { custom: NAME }),
            typed('sc', 'custom', '你好嗎啊\n再見啊', { custom: NAME }),
        ])], { ...OPEN_PANELS, 'lh:map': MAP_LINE }),
    });
    let dialogs = 0;
    page.on('dialog', () => { dialogs++; });
    await waitStill(page);
    const bare = sel => page.locator(sel).evaluateAll(els => els.reduce((n, el) => n + el.querySelectorAll('img, b').length, 0));
    const SURFACES = '#lyricsSections, #rhymeAnalysis, #mapSettingsSection';
    // 標記：那一行的字數照頁面自己的算法，不寫死
    const want = await page.evaluate(l => String(lhCountWords(l)), H1);
    expect(await secs(page).first().locator('.lm-t-c').first().textContent(), '惡意那一行的字數標記').toBe(want);
    expect(await bare(SURFACES)).toBe(0);
    // 分析面板：選到惡意那一行
    await pick(page, 0, H1.length, 0);
    await page.locator(AN_BTN).click();
    await expect(page.locator(AN)).toBeVisible();
    await expect(page.locator(AN + ' .rm-an-t').first()).toContainText('<img src=x o');
    expect(await bare(SURFACES)).toBe(0);
    await page.keyboard.press('Escape');
    // 第二個同名的自訂段落：標題與對照說明都帶著名稱，而且是文字
    await pick(page, 0, 4, 2);
    await page.locator(AN_BTN).click();
    await expect(page.locator(AN)).toBeVisible();
    await expect(page.locator(AN + ' .section-menu-title')).toContainText(NAME);
    await expect(page.locator(AN)).toContainText('對照：' + NAME);
    expect(await page.locator(AN + ' .section-menu-title').evaluate(e => e.children.length)).toBe(0);
    expect(await bare(SURFACES)).toBe(0);
    await page.keyboard.press('Escape');
    // 偏好設定的預覽與各區塊
    await page.evaluate(() => lhMapOpenPrefs());
    expect(await bare(SURFACES)).toBe(0);
    expect(await page.locator('body > *:not(script)').evaluateAll(els => els.reduce((n, el) => n + el.querySelectorAll('img, b').length, 0)), '整頁沒有 img／b 元素').toBe(0);
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
test('檢查：句構分析新程式沒有拼 HTML', () => {
    for (const f of ['js/line-core.js', 'js/rhyme-map.js']) {
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

// ==================== setProperty 只在固定的地方、新樣式沒有動畫 ====================
// 最近的外層具名函式（函式宣告，或指給變數的函式）
function setPropertyOwners(code) {
    const out = [];
    walk(parseAny(code), (node, anc) => {
        if (node.type !== 'CallExpression' || node.callee.type !== 'MemberExpression' || node.callee.property.name !== 'setProperty') return;
        let owner = '(最上層)';
        for (let i = anc.length - 1; i >= 0; i--) {
            const a = anc[i];
            if (a.type === 'FunctionDeclaration') { owner = a.id.name; break; }
            if ((a.type === 'FunctionExpression' || a.type === 'ArrowFunctionExpression') && anc[i - 1] && anc[i - 1].type === 'VariableDeclarator') { owner = anc[i - 1].id.name; break; }
            if (a.type === 'FunctionExpression' || a.type === 'ArrowFunctionExpression') { owner = '(匿名函式)'; break; }
        }
        out.push(owner);
    });
    return out;
}
test('檢查：setProperty 只在固定的地方、新樣式沒有動畫', () => {
    // 調色盤、版面外觀、鏡像層同步、色票拖曳——這四處的值都來自常數表或驗過的 #rrggbb
    const ALLOWED = new Set(['lhMapApplyPalette', 'lhMapApplyLook', '_lhMapSync', '_lhMapColorInput']);
    const owners = setPropertyOwners(readFileSync('js/rhyme-map.js', 'utf8'));
    expect(owners.length, '有掃到 setProperty').toBeGreaterThanOrEqual(4);
    expect([...new Set(owners)].filter(o => !ALLOWED.has(o)), '不在允許名單內的位置').toEqual([]);
    expect(new Set(owners), '四個位置都有用到').toEqual(ALLOWED);
    // 自檢
    expect(setPropertyOwners('function a(){ el.style.setProperty("--x", 1); } const b = () => r.style.setProperty("--y", 2); el.addEventListener("x", () => s.setProperty("a", 1));')).toEqual(['a', 'b', '(匿名函式)']);
    // CSS：第 11 階段的規則（選擇器提到這些名稱）不能有 transition／animation，檔案裡也不能新增 @keyframes
    const MINE = /lm-|rm-an|rm-color|rm-more|rm-sub|mapSettingsSection|rhymeAnalysis|data-lm/;
    const cssRules = css => [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({ sel: m[1].trim(), body: m[2] }));
    let seen = 0;
    for (const f of ['css/panels.css', 'css/responsive.css']) {
        const css = readFileSync(f, 'utf8');
        const mine = cssRules(css).filter(r => MINE.test(r.sel));
        seen += mine.length;
        expect(mine.filter(r => /transition|animation/.test(r.body)).map(r => r.sel), f + ' 第 11 階段的規則沒有動畫').toEqual([]);
        // 兩個檔案目前都沒有 @keyframes（動畫都放在 css/base.css，是第 10 階段之前就有的）；註解裡的字不算
        expect((css.replace(/\/\*[\s\S]*?\*\//g, '').match(/@keyframes/g) || []).length, f + ' 沒有新增 @keyframes').toBe(0);
    }
    expect(seen, '有掃到第 11 階段的規則').toBeGreaterThan(20);
    // 自檢
    expect(cssRules('/* a */ .lm-mk { transition: all 1s; } .x { color: red; }').filter(r => MINE.test(r.sel) && /transition/.test(r.body)).length).toBe(1);
});

// ==================== 舊歌與舊資料 ====================
test('檢查：舊歌與舊資料（句構分析）', async ({ browser }) => {
    test.setTimeout(120_000);
    const P10_MAP = '{"end":true,"letters":true,"inner":true,"strict":false,"skipParticles":true}';
    const READ = { '們一起行': 'ㄒㄧㄥˊ' };
    // (a) 第 10 階段的使用者：五個鍵的 lh:map、讀音、歌
    const songsRaw = JSON.stringify([song([typed('sa', 'verse', '我們一起行\n我望著遠方的光'), typed('sb', 'chorus', V1)], { readings: READ })]);
    const A = await bootPage(browser, {
        device: DEVICES.desktop, wordlist: 'stub',
        storage: { ...FIXTURE, 'lh:schema': '2', 'lh:songs': songsRaw, 'lh:activeSong': 's1', ...OPEN_PANELS, 'lh:map': P10_MAP },
    });
    await waitStill(A.page);
    await expect.poll(() => A.page.locator('#lyricsSections .rm-hl').count(), { message: '開機後畫好色塊' }).toBeGreaterThan(0);
    const calm = async what => {
        expect(await mapOf(A.page), what + '：lh:map 逐字相同').toBe(P10_MAP);
        expect(await A.page.locator('.lm-mk').count(), what + '：沒有標記').toBe(0);
        expect(await A.page.evaluate(() => document.documentElement.getAttribute('data-lm')), what + '：沒有 data-lm').toBeNull();
        expect(await A.page.evaluate(() => localStorage.getItem('lh:songs')), what + '：歌沒被改').toBe(songsRaw);
    };
    await calm('開機後');
    await A.page.locator('#rhymeMenuBtn').click();
    await A.page.keyboard.press('Escape');   // 選單沒有關閉鈕了（R2）：Esc 或點外面
    await calm('開關過韻腳選單');
    await A.page.evaluate(() => lhMapOpenPrefs());
    await expect(A.page.locator(PREFS)).toBeVisible();
    await calm('打開偏好設定');
    await A.page.reload();
    await A.page.evaluate(() => Promise.all([window.__hoyunReady, window.__hoyunWordlistReady, window.__hoyunSongsReady, window.__lhMapReady]));
    await calm('重新整理後');
    // (c) 第 10 階段的備份檔整理後，lh:map 還是同一個字串、讀音還在
    const parsed = await A.page.evaluate(([map, songs]) => lhParseBackup(JSON.stringify({
        format: LH_BACKUP_FORMAT, version: 2, exportedAt: '2026-10-01T00:00:00.000Z', songs: JSON.parse(songs), activeSong: 's1', savedWords: [], settings: { 'lh:map': map },
    })), [P10_MAP, songsRaw]);
    expect(parsed.ok).toBe(true);
    expect(parsed.settings['lh:map'], '備份讀回來 lh:map 一字不差').toBe(P10_MAP);
    expect(parsed.songs[0].readings).toEqual(READ);
    expect(A.errors).toEqual([]);
    await A.context.close();
    // (b) 第 9 階段的使用者：有歌、沒有 lh:map
    const songs9 = JSON.stringify([song([typed('sa', 'verse', '我們一起行\n我望著遠方的光')])]);
    const B = await bootPage(browser, {
        device: DEVICES.desktop, wordlist: 'stub',
        storage: { ...FIXTURE, 'lh:schema': '2', 'lh:songs': songs9, 'lh:activeSong': 's1', ...OPEN_PANELS },
    });
    await waitStill(B.page);
    await expect.poll(() => B.page.locator('#lyricsSections .rm-hl').count()).toBeGreaterThan(0);
    expect(await mapOf(B.page), '開機後不寫 lh:map').toBeNull();
    await B.page.evaluate(() => lhMapOpenPrefs());
    await expect(B.page.locator(PREFS)).toBeVisible();
    expect(await mapOf(B.page), '打開偏好設定也不寫 lh:map').toBeNull();
    await B.page.reload();
    await B.page.evaluate(() => Promise.all([window.__hoyunReady, window.__hoyunWordlistReady, window.__hoyunSongsReady, window.__lhMapReady]));
    expect(await mapOf(B.page), '重新整理後還是沒有 lh:map').toBeNull();
    expect(await B.page.evaluate(() => localStorage.getItem('lh:songs')), '歌沒被改').toBe(songs9);
    expect(B.errors).toEqual([]);
    await B.context.close();
});

// ==================== 顏色以外的線索 ====================
test('檢查：顏色以外的線索（句構分析）', async ({ browser }) => {
    test.setTimeout(90_000);
    const MIX = '月光 灑在 窗前 夢裡想起你的臉';
    const { context, page, errors } = await bootPage(browser, {
        device: DEVICES.desktop, wordlist: 'stub',
        storage: v2Storage([song([
            typed('sa', 'verse', MIX + '\n我望著遠方的光'),
            typed('sb', 'verse', MIX + '\n獨自站在窗前'),
        ])], { ...OPEN_PANELS, 'lh:map': MAP_LINE }),
    });
    await waitStill(page);
    await page.evaluate(ws => {
        for (const w of ws) wordPhoneticMap.set(w, Array.from(w).map(c => getCharAllReadings(c)[0].reading).join(' '));
        lhMapOnLexiconChange();
    }, ['夢裡', '想起', '你的', '望著', '遠方']);
    // 逐行標記：機器猜的那一段「≈」開頭、斜體；自己標的維持正體
    const mk = await secs(page).first().locator('.lm-mk').first().evaluate(m => {
        const t = m.querySelector('.lm-t-s');
        return { style: getComputedStyle(t).fontStyle, text: t.textContent, guesses: [...t.querySelectorAll('.lm-guess')].map(g => [g.textContent, getComputedStyle(g).fontStyle]) };
    });
    expect(mk.style, '自己標的那一段是正體').toBe('normal');
    expect(mk.text).toBe('2+2+2+≈2+2+3');
    expect(mk.guesses, '只有一段猜的').toEqual([['≈2+2+3', 'italic']]);
    const allGuess = await page.locator('#lyricsSections .lm-guess').evaluateAll(els => els.map(e => [e.textContent.startsWith('≈'), getComputedStyle(e).fontStyle]));
    expect(allGuess.length).toBeGreaterThan(0);
    expect(allGuess.every(([a, b]) => a && b === 'italic'), '每一段猜的都有 ≈ 且斜體').toBe(true);
    // 差異：≠ 加粗（第二段第 2 行 6 字，對照 7 字）
    const diffs = await page.locator('#lyricsSections .lm-t-d:not(:empty)').evaluateAll(els => els.map(e => [e.textContent, getComputedStyle(e).fontWeight]));
    expect(diffs, '差異 ≠ 且粗體').toEqual([['≠7', '700']]);
    // 分析面板：選第二段全部
    await pick(page, 0, MIX.length + 8, 1);
    await page.locator(AN_BTN).click();
    await expect(page.locator(AN)).toBeVisible();
    const an = await page.locator(AN).evaluate(m => ({
        role: m.getAttribute('role'),
        ths: [...m.querySelectorAll('th')].map(th => th.getAttribute('scope')),
        verdicts: [...m.querySelectorAll('.rm-an-v')].map(v => [v.textContent, v.getAttribute('aria-label')]),
        guesses: [...m.querySelectorAll('.lm-guess')].map(g => [g.textContent.startsWith('≈'), getComputedStyle(g).fontStyle]),
    }));
    expect(an.role).toBe('dialog');
    expect(an.ths.length).toBeGreaterThan(0);
    expect(an.ths.every(x => x === 'col')).toBe(true);
    expect(an.verdicts).toEqual([['✓', '字數相同'], ['≠', '字數不同']]);
    expect(an.guesses.length).toBeGreaterThan(0);
    expect(an.guesses.every(([a, b]) => a && b === 'italic'), '面板裡猜的也是 ≈ 加斜體').toBe(true);
    await page.keyboard.press('Escape');
    // 開關寫「開／關」，濃淡是有名字的 radio
    await page.locator('#rhymeMenuBtn').click();
    const menuSw = await page.locator('#rhymeMenu .rm-switch').evaluateAll(els => els.map(e => e.textContent.trim().slice(-1)));
    expect(menuSw.length).toBeGreaterThan(0);
    expect(menuSw.every(c => c === '開' || c === '關'), '選單的開關').toBe(true);
    await page.keyboard.press('Escape');
    await page.evaluate(() => lhMapOpenPrefs());
    const sws = await page.locator(PREFS + ' .rm-switch').evaluateAll(els => els.map(e => [e.textContent.trim().slice(-1), e.getAttribute('aria-checked')]));
    expect(sws.length).toBeGreaterThan(4);
    expect(sws.every(([c, a]) => (c === '開' || c === '關') && (a === 'true') === (c === '開')), '偏好設定的開關文字與 aria-checked 一致').toBe(true);
    const radios = await page.locator(PREFS + ' .type-row[data-k="depth"]').evaluateAll(els => els.map(e => [e.getAttribute('role'), e.textContent.trim()]));
    expect(radios).toEqual([['radio', '淡'], ['radio', '標準'], ['radio', '濃']]);
    // 鏡像層（含預覽）只是裝飾
    const mirrors = await page.locator('.rhyme-mirror').evaluateAll(els => els.map(e => e.getAttribute('aria-hidden')));
    expect(mirrors.length).toBeGreaterThan(2);
    expect(mirrors.every(a => a === 'true')).toBe(true);
    expect(await page.locator(PREFS + ' .lm-preview').getAttribute('aria-hidden')).toBe('true');
    expect(errors).toEqual([]);
    await context.close();
});
