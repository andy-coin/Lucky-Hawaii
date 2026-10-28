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
        await expect(page.locator(PREFS)).toHaveJSProperty('open', true);
        const summary = page.locator(PREFS + ' > summary');
        const sb = await summary.boundingBox();
        expect(sb.height, `${name} 「偏好設定」標題高度`).toBeGreaterThanOrEqual(43.5);
        expect(sb.width, `${name} 「偏好設定」標題寬度`).toBeGreaterThanOrEqual(43.5);
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
        const dd = page.locator('.settings-dropdown');
        await expect(page.locator(PREFS)).toHaveJSProperty('open', true);
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
        for (const sel of [PREFS + ' > summary', PREFS + ' .rm-switch', PREFS + ' .type-row[data-k="depth"]']) {
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
            await expect(page.locator(PREFS)).toHaveJSProperty('open', true);
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
                const dd = page.locator('.settings-dropdown');
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
        '偏好設定': async b => { await b.evaluate(() => lhMapOpenPrefs()); await expect(b.locator(PREFS)).toHaveJSProperty('open', true); },
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
