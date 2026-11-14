// 檢查：第 9 階段所有新介面放在一起量——十二段、切版型與收面板中途、另一個分頁、三種裝置 44px、標題列、
// 惡意文字與原始碼掃描、沒有新動畫、重新整理與匯出、存檔失敗（UI-SPEC §11、§12、§13）
// 每個計畫已經各自測過自己的功能；這裡把手勢、面板、分頁互相打斷的情況放在一起，用同一把尺再量一次
import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { bootPage, openTwoTabs, activeSongRaw, clickBackup } from './helpers.mjs';
import { DEVICES, waitStill, setScale, rectsOverlap, auditTouchTargets, noPageScroll } from './layout-lib.mjs';
import { centerOf, mouseDrag } from './drag-lib.mjs';
import { parseAny, walk } from './scan-lib.mjs';

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/v096-localStorage.json', import.meta.url), 'utf8'));
const OPEN_PANELS = { leftPanelCollapsed: 'false', rightPanelCollapsed: 'false' };
const v2Storage = (songs, extra = OPEN_PANELS) => ({
    ...FIXTURE, 'lh:schema': '2', 'lh:songs': JSON.stringify(songs), 'lh:activeSong': songs[0].id, ...extra,
});
const typed = (id, type, text, extra = {}) => ({ id, type, custom: '', color: '', height: null, label: '', text, collapsed: false, ...extra });
const song = (sections, extra = {}) => ({ id: 's1', title: '測試歌', sections, hashtags: [], context: '', createdAt: 1, updatedAt: 1, ...extra });
const ABC = (extra) => v2Storage([song([typed('sa', 'verse', '甲'), typed('sb', 'chorus', '乙', { color: '#4a7fd4' }), typed('sc', 'bridge', '丙', { height: 14 })])], extra);

const secs = page => page.locator('#lyricsSections .lyrics-section');
const ids = page => secs(page).evaluateAll(els => els.map(e => e.dataset.id));
const names = page => page.locator('#lyricsSections .section-type').evaluateAll(els => els.map(e => e.textContent));
const handle = (page, n) => secs(page).nth(n).locator('.section-handle');
// 下拉選單選「下一種」類型（原本點一下循環）
const pickNext = async (page, n) => {
    await typeBtn(page, n).click();
    await page.locator('#sectionMenu .type-row[aria-checked="true"] + .type-row').click();
};
const typeBtn = (page, n) => secs(page).nth(n).locator('.section-type');
const disabled = (page, id) => page.locator(id).getAttribute('aria-disabled');
const putCards = (page, words) => page.evaluate(ws => { document.getElementById('aiWordsContainer').innerHTML = ws.map(w => aiWordCardHtml(w, false)).join(''); }, words);
// 模型裡每段的 id／類型／顏色／高度（手勢被中止之後，這些一個都不能變）
const model = page => page.evaluate(() => curSong().sections.map(s => [s.id, s.type, s.color, s.height, s.text]));
// 殘影、落點線、插入線、提示、外框、拖曳中的 class、body class、設定選單都乾淨
const noTrace = page => page.evaluate(() => ({
    sectionGhost: document.querySelectorAll('.section-drag-ghost').length,
    dropLine: document.querySelectorAll('.section-drop-line').length,
    wordGhost: document.querySelectorAll('.word-drag-ghost').length,
    dropCaret: document.querySelectorAll('.drop-caret').length,
    hint: document.querySelectorAll('.drag-hint').length,
    dropTarget: document.querySelectorAll('.drop-target').length,
    dragging: document.querySelectorAll('.dragging').length,
    bodyDragging: document.body.classList.contains('is-section-dragging'),
    bodyWord: document.body.classList.contains('is-word-dragging'),
    bodyResizing: document.body.classList.contains('is-section-resizing'),
    menu: document.querySelectorAll('#sectionMenu.show').length,
}));
const CLEAN = {
    sectionGhost: 0, dropLine: 0, wordGhost: 0, dropCaret: 0, hint: 0, dropTarget: 0,
    dragging: 0, bodyDragging: false, bodyWord: false, bodyResizing: false, menu: 0,
};
async function readDownload(dl) {
    const chunks = [];
    for await (const c of await dl.createReadStream()) chunks.push(c);
    return Buffer.concat(chunks).toString('utf8');
}
// 已經開著就不再按（再按同一個分頁會收起）
const openSheet = async page => {
    await page.evaluate(() => { if (document.getElementById('leftPanel').classList.contains('collapsed')) mobileTab('lyrics'); });
    await waitStill(page);
};

// ==================== 十二段 ====================
test('檢查：十二段的編號與捲動', async ({ browser }) => {
    const sections = [
        typed('s0', 'verse', '一'), typed('s1', 'chorus', '二'), typed('s2', 'verse', '三'), typed('s3', 'chorus', '四'),
        typed('s4', 'verse', '五'), typed('s5', 'bridge', '六'), typed('s6', 'custom', '七', { custom: 'Hook' }), typed('s7', 'inter', '八'),
        typed('s8', 'verse', '九'), typed('s9', 'chorus', '十'), typed('s10', 'inter', '十一'), typed('s11', 'outro', '十二'),
    ];
    const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: v2Storage([song(sections)]) });
    await waitStill(page);
    // 依類型各自編號；單一個的（Bridge、Outro）不編號；自訂名稱照寫
    expect(await names(page)).toEqual([
        'Verse I', 'Chorus I', 'Verse II', 'Chorus II', 'Verse III', 'Bridge', 'Hook', 'Inter I', 'Verse IV', 'Chorus III', 'Inter II', 'Outro',
    ]);
    // 列表自己捲，整頁不捲
    const list = page.locator('#lyricsSections');
    expect(await list.evaluate(l => l.scrollHeight > l.clientHeight), '十二段列表在自己裡面捲').toBe(true);
    const sc = await noPageScroll(page);
    expect(sc.sh, '整頁直向不捲').toBeLessThanOrEqual(sc.ih);
    expect(sc.sw, '整頁橫向不捲').toBeLessThanOrEqual(sc.iw);
    // 拖把手靠近下緣：列表自己往下捲
    const r = await list.evaluate(el => { const b = el.getBoundingClientRect(); return { bottom: b.bottom, x: b.left + b.width / 2 }; });
    const [hx, hy] = await centerOf(handle(page, 0));
    await page.mouse.move(hx, hy);
    await page.mouse.down();
    await page.mouse.move(r.x, r.bottom - 16, { steps: 8 });
    const t0 = await list.evaluate(el => el.scrollTop);
    for (let i = 0; i < 25; i++) { await page.mouse.move(r.x, r.bottom - 16 + (i % 2)); await page.waitForTimeout(16); }
    const t1 = await list.evaluate(el => el.scrollTop);
    expect(t1, '靠近下緣時列表自己捲').toBeGreaterThan(t0);
    await page.keyboard.press('Escape');
    await page.mouse.up();
    expect(await noTrace(page)).toEqual(CLEAN);
    expect(await ids(page), 'Esc 取消，順序不變').toEqual(sections.map(s => s.id));
    expect(errors).toEqual([]);
    await context.close();
});

// ==================== 切版型時中止 ====================
// 四種進行中的狀態，視窗一路 1440×900 → 820×1180 → 390×844 → 1440×900；每一站都不能留下東西，順序、顏色、高度不能變
const STARTERS = {
    '設定選單開著': async page => {
        await typeBtn(page, 1).click({ button: 'right' });
        await expect(page.locator('#sectionMenu')).toBeVisible();
    },
    '段落拖曳中': async page => {
        await handle(page, 2).scrollIntoViewIfNeeded();
        const [x, y] = await centerOf(handle(page, 2));
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x, y - 60, { steps: 6 });
        await expect(page.locator('.section-drag-ghost')).toHaveCount(1);
    },
    '拖詞中': async page => {
        await putCards(page, ['花開']);
        const [x, y] = await centerOf(page.locator('#aiWordsContainer .ai-word-card').first());
        await page.mouse.move(x, y);
        await page.mouse.down();
        const tb = await page.locator('#lyricsSections .section-textarea').first().boundingBox();
        await page.mouse.move(tb.x + 40, tb.y + 20, { steps: 8 });
        await expect(page.locator('.word-drag-ghost')).toHaveCount(1);
    },
};
test('檢查：切版型時中止', async ({ browser }) => {
    test.setTimeout(120_000);
    for (const [name, start] of Object.entries(STARTERS)) {
        const { context, page, errors } = await bootPage(browser, { device: DEVICES.desktop, storage: ABC(), wordlist: 'stub' });
        await waitStill(page);
        const before = await model(page);
        await start(page);
        for (const size of [{ width: 820, height: 1180 }, { width: 390, height: 844 }, { width: 1440, height: 900 }]) {
            await page.setViewportSize(size);
            await waitStill(page);
            // 1440 → 820 跨過 900 的分界時一定中止；之後在窄版之間移動，狀態早就清掉了
            expect(await noTrace(page), `${name}：${size.width}×${size.height} 殘留`).toEqual(CLEAN);
            expect(await model(page), `${name}：${size.width}×${size.height} 資料不變`).toEqual(before);
        }
        await page.mouse.up();   // 手還按著的，放開不能有任何效果
        await waitStill(page);
        expect(await noTrace(page), `${name}：放開之後`).toEqual(CLEAN);
        expect(await model(page), `${name}：放開之後資料不變`).toEqual(before);
        expect((await activeSongRaw(page)).sections.map(s => [s.id, s.color, s.height]), `${name}：儲存的內容不變`).toEqual(before.map(m => [m[0], m[2], m[3]]));
        await expect(secs(page).nth(1)).toHaveAttribute('data-color', '#4a7fd4');
        expect(errors, name).toEqual([]);
        await context.close();
    }
});

// ==================== 收起歌詞面板時中止 ====================
test('檢查：收起歌詞面板時中止', async ({ browser }) => {
    test.setTimeout(90_000);
    for (const [label, device, collapse] of [
        ['桌機收起面板', DEVICES.desktop, page => page.evaluate(() => toggleLeftPanel())],
        ['手機離開歌詞分頁', DEVICES.phone, page => page.evaluate(() => mobileTab('search'))],
    ]) {
        for (const [name, start] of [['設定選單', STARTERS['設定選單開著']], ['段落拖曳', STARTERS['段落拖曳中']]]) {
            const { context, page, errors } = await bootPage(browser, { device, storage: ABC(), wordlist: 'stub' });
            await openSheet(page);
            await waitStill(page);
            await pickNext(page, 0);   // 先記一個復原步驟：收面板之後 ↶ 還要能按
            expect(await disabled(page, '#undoBtn')).toBe('false');
            const before = await model(page);
            await start(page);
            await collapse(page);
            await waitStill(page);
            expect(await noTrace(page), `${label}／${name}：殘留`).toEqual(CLEAN);
            await page.mouse.up();
            expect(await noTrace(page), `${label}／${name}：放開之後殘留`).toEqual(CLEAN);
            expect(await model(page), `${label}／${name}：資料不變`).toEqual(before);
            expect(await disabled(page, '#undoBtn'), `${label}／${name}：復原紀錄還在`).toBe('false');
            expect(errors, label + name).toEqual([]);
            await context.close();
        }
    }
});

// ==================== 另一個分頁改了這首歌 ====================
// 一個分頁在手勢中、另一個分頁改了同一首歌：手勢先收掉，再重新載入對方的內容，這首歌的復原紀錄清空
test('檢查：另一個分頁改了這首歌', async ({ browser }) => {
    test.setTimeout(120_000);
    const NEW = '另一頁寫的';
    const cases = {
        '段落拖曳': async a => {
            const [x, y] = await centerOf(handle(a, 2));
            await a.mouse.move(x, y);
            await a.mouse.down();
            await a.mouse.move(x, y - 60, { steps: 6 });
            await expect(a.locator('.section-drag-ghost')).toHaveCount(1);
        },
        '設定選單': async a => {
            await typeBtn(a, 1).click({ button: 'right' });
            await expect(a.locator('#sectionMenu')).toBeVisible();
        },
        '拖詞': async a => {
            await putCards(a, ['花開']);
            const [x, y] = await centerOf(a.locator('#aiWordsContainer .ai-word-card').first());
            await a.mouse.move(x, y);
            await a.mouse.down();
            const tb = await a.locator('#lyricsSections .section-textarea').first().boundingBox();
            await a.mouse.move(tb.x + 40, tb.y + 20, { steps: 8 });
            await expect(a.locator('.word-drag-ghost')).toHaveCount(1);
        },
    };
    for (const [name, start] of Object.entries(cases)) {
        const { context, pages: [a, b], errs } = await openTwoTabs(browser, ABC());
        await waitStill(a);
        await waitStill(b);
        // A 先做一個結構動作，有復原紀錄；等 B 收到並重新載入
        await pickNext(a, 0);
        expect(await disabled(a, '#undoBtn')).toBe('false');
        await expect.poll(() => typeBtn(b, 0).textContent()).toBe(await typeBtn(a, 0).textContent());
        await a.waitForTimeout(300);
        await start(a);
        // B 改第一段文字（輸入框失焦才存）
        const taB = b.locator('#lyricsSections .section-textarea').first();
        await taB.fill(NEW);
        await taB.blur();
        await expect(a.locator('#lyricsSections .section-textarea').first(), name + '：A 載入了 B 的文字').toHaveValue(NEW);
        expect(await noTrace(a), `${name}：A 的手勢收乾淨`).toEqual(CLEAN);
        await a.mouse.up();
        expect(await noTrace(a), `${name}：放開之後`).toEqual(CLEAN);
        expect((await model(a)).map(m => m[4]), `${name}：放開沒有動到資料`).toEqual([NEW, '乙', '丙']);
        expect(await disabled(a, '#undoBtn'), `${name}：A 的復原紀錄被清掉`).toBe('true');
        expect(await disabled(a, '#redoBtn')).toBe('true');
        expect(errs.flatMap(e => e.errors), name).toEqual([]);
        await context.close();
    }
});

// ==================== 三種裝置的觸控大小 ====================
const P9 = /section-handle|section-type|section-remove|section-resize|undoBtn|redoBtn|toast-action|swatch|section-color|type-row|section-move|section-menu-close|section-name-input/;
const CUSTOM3 = () => v2Storage([song([typed('sa', 'verse', 'A'), typed('sb', 'chorus', 'B', { color: '#4a7fd4' }), typed('sc', 'custom', 'C', { custom: 'Hook' })])]);

test('檢查：三種裝置的觸控大小', async ({ browser }) => {
    test.setTimeout(180_000);
    for (const [name, device] of [['手機 390×844', DEVICES.phone], ['平板直放 820×1180', DEVICES.tablet], ['平板橫放 1180×820', DEVICES.tabletLandscape]]) {
        const { context, page, errors } = await bootPage(browser, { storage: CUSTOM3(), device, wordlist: 'stub' });
        await openSheet(page);
        await waitStill(page);
        const audit = async (mustSee, label) => {
            await waitStill(page);
            const r = await auditTouchTargets(page, { mustSee });
            expect(r.missing, `${name} ${label} 沒量到`).toEqual([]);
            expect(r.failures.filter(f => P9.test(f.selector)), `${name} ${label} 觸控目標不到 44×44`).toEqual([]);
            expect(r.overlaps.filter(o => P9.test(o.a) || P9.test(o.b)), `${name} ${label} 相鄰重疊（超過 4px）`).toEqual([]);
        };
        // 提示條開著：刪掉第一段，量段落上的控制項、↶ ↷ 與提示上的復原
        await secs(page).nth(0).locator('.section-remove').click();
    await page.locator('#lhAskActions .song-danger-btn').click();
        await expect(page.locator('#copyToast .toast-action')).toHaveCount(1);
        await audit(['.section-handle', '.section-type', '.section-remove', '#undoBtn', '#redoBtn', '.toast-action'], '段落與提示條');
        await page.locator('#copyToast .toast-action').click();
        await expect(secs(page)).toHaveCount(3);
        // 設定選單開在 Custom 段落：色票、選色盤、無顏色、類型、自訂名稱、上移下移、關閉
        await typeBtn(page, 2).click({ button: 'right' });
        await expect(page.locator('#sectionMenu')).toBeVisible();
        await audit(['.swatch', '.section-color-input', '.section-color-none', '.type-row', '.section-name-input', '.section-move-up', '.section-move-down'], '設定選單');
        expect(errors).toEqual([]);
        await context.close();
    }
});

// ==================== 標題列在各尺寸都放得下 ====================
test('檢查：標題列在各尺寸都放得下', async ({ browser }) => {
    test.setTimeout(180_000);
    const LONG = '很長很長的段落名稱'.repeat(5).slice(0, 40);
    expect(Array.from(LONG)).toHaveLength(40);
    const sections = [typed('sa', 'verse', '一'), typed('sb', 'custom', '二', { custom: LONG, color: '#e05d5d' }), typed('sc', 'chorus', '三', { collapsed: true }), typed('sd', 'bridge', '四')];
    for (const [name, device] of [['手機', DEVICES.phone], ['平板', DEVICES.tablet], ['電腦', DEVICES.desktop]]) {
        for (const pct of [100, 150]) {
            const { context, page, errors } = await bootPage(browser, { device, storage: v2Storage([song(sections)]), wordlist: 'stub' });
            await setScale(page, pct);
            await openSheet(page);
            await waitStill(page);
            const rows = await page.evaluate(() => [...document.querySelectorAll('#lyricsSections .lyrics-section')].map(sec => {
                const box = e => { if (!e) return null; const r = e.getBoundingClientRect(); if (r.width <= 1 && r.height <= 1) return null; return { x: r.x, y: r.y, width: r.width, height: r.height }; };   // 電腦上看不見的 ⋮⋮（1px）不算
                return {
                    sec: box(sec), handle: box(sec.querySelector('.section-handle')), type: box(sec.querySelector('.section-type')),
                    cnt: box(sec.querySelector('.section-count')), rm: box(sec.querySelector('.section-remove')), collapsed: sec.classList.contains('collapsed'),
                };
            }));
            expect(rows.some(r => r.collapsed), '有收合的段落').toBe(true);
            for (const [i, r] of rows.entries()) {
                const tag = `${name} ${pct}% 第 ${i + 1} 段`;
                const parts = [r.handle, r.type, r.cnt, r.rm].filter((p, k) => k || p);   // 電腦上 ⋮⋮ 看不見（null），不算缺
                for (const p of parts) {
                    expect(p, `${tag}：控制項存在`).not.toBeNull();
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
            expect(errors).toEqual([]);
            await context.close();
        }
    }
});

// ==================== 惡意文字只當文字 ====================
test('檢查：惡意文字只當文字', async ({ browser }) => {
    test.setTimeout(90_000);
    const NAME = '<img src=x onerror=alert(1)>';
    const TEXT = '</textarea><script>window.__pwn=1</script>';
    const WORD = `<b>&"'`;
    const { context, page, errors } = await bootPage(browser, {
        device: DEVICES.desktop, wordlist: 'stub',
        storage: v2Storage([song([typed('sa', 'custom', TEXT, { custom: NAME }), typed('sb', 'verse', 'B')])]),
    });
    let dialogs = 0;
    page.on('dialog', () => { dialogs++; });
    const bare = sel => page.locator(sel).evaluateAll(els => els.reduce((n, el) => n + el.querySelectorAll('img, script, b').length, 0));
    await waitStill(page);
    // 名稱鈕與歌詞框
    await expect(typeBtn(page, 0)).toHaveText(NAME);
    await expect(page.locator('#lyricsSections .section-textarea').first()).toHaveValue(TEXT);
    expect(await bare('#lyricsSections')).toBe(0);
    // 設定選單標題
    await typeBtn(page, 0).click({ button: 'right' });
    await expect(page.locator('#sectionMenu')).toBeVisible();
    await expect(page.locator('#sectionMenu .section-menu-title')).toContainText('段落設定：<img src=x');   // 標題會把長名稱截短再加 …
    expect(await bare('#sectionMenu')).toBe(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('#sectionMenu')).toBeHidden();
    // 段落殘影
    const [x, y] = await centerOf(handle(page, 0));
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 80, { steps: 6 });
    await expect(page.locator('.section-drag-ghost')).toHaveCount(1);
    expect(await bare('.section-drag-ghost')).toBe(0);
    await expect(page.locator('.section-drag-ghost')).toContainText('<img src=x');
    await page.keyboard.press('Escape');
    await page.mouse.up();
    // 詞卡殘影、插入後的歌詞框與讀屏提示
    await putCards(page, [WORD]);
    const tb = await page.locator('#lyricsSections .section-textarea').nth(1).boundingBox();
    await page.mouse.move(...await centerOf(page.locator('#aiWordsContainer .ai-word-card').first()));
    await page.mouse.down();
    await page.mouse.move(tb.x + 30, tb.y + 20, { steps: 8 });
    await expect(page.locator('.word-drag-ghost')).toHaveText(WORD);
    expect(await page.locator('.word-drag-ghost *').count()).toBe(0);
    await page.mouse.up();
    await expect(page.locator('#lyricsSections .section-textarea').nth(1)).toHaveValue(/<b>&"'/);
    await expect(page.locator('#lhLive')).toContainText(WORD);
    expect(await page.locator('#lhLive *').count()).toBe(0);
    // 刪除的提示條
    await secs(page).nth(0).locator('.section-remove').click();
    await page.locator('#lhAskActions .song-danger-btn').click();
    await expect(page.locator('#copyToast')).toContainText('已刪除「' + Array.from(NAME).slice(0, 16).join('') + '…」');
    expect(await bare('#copyToast')).toBe(0);
    expect(await page.evaluate(() => window.__pwn), 'script 沒有被執行').toBeUndefined();
    expect(await bare('body > *:not(script)')).toBe(0);
    expect(dialogs, 'alert 沒有被觸發').toBe(0);
    expect(errors).toEqual([]);
    await context.close();
});

// ==================== 新程式沒有拼 HTML ====================
// 用語法樹找：不能對 innerHTML／outerHTML 賦值、不能呼叫 insertAdjacentHTML／document.write、不能 setAttribute('on…')、不能 .onxxx = 賦值字串
function htmlSinks(code) {
    const hits = [];
    walk(parseAny(code), node => {
        const prop = n => n && n.type === 'MemberExpression' && (n.property.name || n.property.value);
        if (node.type === 'AssignmentExpression' && /^(innerHTML|outerHTML)$/.test(prop(node.left) || '')) hits.push('賦值 ' + prop(node.left));
        if (node.type === 'CallExpression') {
            const p = prop(node.callee);
            if (p === 'insertAdjacentHTML' || p === 'write' && node.callee.object.name === 'document') hits.push('呼叫 ' + p);
            if (p === 'setAttribute' && node.arguments[0] && node.arguments[0].type === 'Literal' && /^on/i.test(String(node.arguments[0].value))) hits.push('setAttribute(' + node.arguments[0].value + ')');
        }
    });
    return hits;
}
test('檢查：新程式沒有拼 HTML', () => {
    const FILES = ['js/sections-core.js', 'js/sections.js', 'js/undo.js', 'js/word-drag.js', 'js/rhyme-core.js', 'js/rhyme-map.js', 'js/roles.js'];
    for (const f of FILES) {
        const code = readFileSync(f, 'utf8');
        expect(code.length, f + ' 有讀到').toBeGreaterThan(500);
        expect(htmlSinks(code), f).toEqual([]);
    }
    // 自檢：掃描器真的抓得到
    expect(htmlSinks('el.innerHTML = x;')).toEqual(['賦值 innerHTML']);
    expect(htmlSinks('el.insertAdjacentHTML("beforeend", x); document.write(x);')).toEqual(['呼叫 insertAdjacentHTML', '呼叫 write']);
    expect(htmlSinks('el.setAttribute("onclick", "x()");')).toEqual(['setAttribute(onclick)']);
    expect(htmlSinks('el.textContent = x; el.setAttribute("aria-label", x);')).toEqual([]);
});

// ==================== 沒有新增動畫 ====================
test('檢查：沒有新增動畫', () => {
    const START = '104f147';   // 2026-11-14 再重設起點（之前經核准的都算在內）；詞宇宙另外加的在下面 WS_EXTRA
    const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '');
    const keyframes = t => (strip(t).match(/@keyframes\b/g) || []).length;
    const transitions = t => (strip(t).match(/(^|[;{\s])transition(?:-property|-duration|-delay|-timing-function)?\s*:/g) || []).length;
    const now = readdirSync('css').filter(f => f.endsWith('.css')).map(f => readFileSync('css/' + f, 'utf8'));
    const oldFiles = execFileSync('git', ['ls-tree', '--name-only', START, 'css/'], { encoding: 'utf8' }).split('\n').filter(f => f.endsWith('.css'));
    const then = oldFiles.map(f => execFileSync('git', ['show', `${START}:${f}`], { encoding: 'utf8', maxBuffer: 1 << 26 }));
    const sum = (list, fn) => list.reduce((n, t) => n + fn(t), 0);
    expect(sum(then, keyframes), '前置：起點讀得到 @keyframes').toBeGreaterThan(0);
    expect(sum(then, transitions), '前置：起點讀得到 transition').toBeGreaterThan(10);
    expect(sum(now, keyframes), '@keyframes 沒有變多').toBeLessThanOrEqual(sum(then, keyframes));
    const WS_EXTRA = 7;   // 詞宇宙（css/panels.css 檔尾）經 Andy 指定新增的 5 個 transition＋歌詞面板拉寬（lp-anim 與減少動態的關閉）2 個（0.98.03）
    expect(sum(now, transitions), 'transition 宣告沒有變多').toBeLessThanOrEqual(sum(then, transitions) + WS_EXTRA);
    // 自檢：計數器抓得到
    expect(transitions('a { transition: all 0.2s; } /* transition: x */ b { transition-duration: 1s; }')).toBe(2);
});

// ==================== 重新整理後一模一樣、匯出照名稱 ====================
test('檢查：重新整理後一模一樣、匯出照名稱', async ({ browser }) => {
    test.setTimeout(120_000);
    const { context, page, errors } = await bootPage(browser, {
        device: DEVICES.desktop, wordlist: 'stub', storage: ABC(),
        init: () => { window.__printCount = 0; window.print = () => { window.__printCount++; }; },
    });
    await waitStill(page);
    // 用真實操作設高度、顏色、類型
    await pickNext(page, 2);   // Bridge → Outro
    await typeBtn(page, 0).click({ button: 'right' });
    await page.locator('#sectionMenu .swatch[aria-label="顏色：綠"]').click();
    await page.keyboard.press('Escape');
    const snap = () => page.evaluate(() => [...document.querySelectorAll('#lyricsSections .lyrics-section')].map(el => ({
        id: el.dataset.id, type: el.dataset.type, color: el.dataset.color || '', h: el.dataset.h || '',
        name: el.querySelector('.section-type').textContent, text: el.querySelector('.section-textarea').value,
        taPx: Math.round(el.querySelector('.section-textarea').getBoundingClientRect().height),
    })));
    await expect.poll(async () => (await activeSongRaw(page)).sections[0].color).toBe('#48a868');
    const before = await snap();
    expect(before.map(s => s.name)).toEqual(['Verse', 'Chorus', 'Outro']);
    await page.reload();
    await page.evaluate(() => Promise.all([window.__hoyunReady, window.__hoyunSongsReady]));
    await waitStill(page);
    const after = await snap();
    expect(after.map(s => ({ ...s, taPx: 0 }))).toEqual(before.map(s => ({ ...s, taPx: 0 })));
    for (let i = 0; i < after.length; i++) expect(Math.abs(after[i].taPx - before[i].taPx), `第 ${i + 1} 段重新整理後高度一樣`).toBeLessThanOrEqual(1);
    // TXT、Markdown、PDF 的標題 = 畫面上的名稱
    const nameList = after.map(s => s.name);
    const item = label => page.locator('#exportMenu .export-item').filter({ has: page.locator('.export-label', { hasText: label }) });
    const download = async label => {
        await page.locator('#exportToggle').click();
        const [dl] = await Promise.all([page.waitForEvent('download'), item(label).click()]);
        return readDownload(dl);
    };
    const txt = await download('TXT');
    expect(txt.split('\n').filter(l => /^\[.+\]$/.test(l)).map(l => l.slice(1, -1))).toEqual(nameList);
    const md = await download('Markdown');
    expect(md.split('\n').filter(l => l.startsWith('## ')).map(l => l.slice(3))).toEqual(nameList);
    await page.locator('#exportToggle').click();
    await item('PDF').click();
    expect(await page.evaluate(() => window.__printCount)).toBe(1);
    expect(await page.locator('#printSheet h2').allTextContents()).toEqual(nameList);
    // 備份全部：每段都帶類型、自訂名稱、顏色、高度
    const bk = await clickBackup(page);
    const backup = JSON.parse(await readDownload(bk));
    const secsInFile = backup.songs.find(s => s.id === 's1').sections;
    expect(secsInFile.map(s => s.label)).toEqual(nameList);
    expect(secsInFile.map(s => s.type)).toEqual(['verse', 'chorus', 'outro']);
    expect(secsInFile.map(s => s.color)).toEqual(['#48a868', '#4a7fd4', '']);
    expect(secsInFile.map(s => 'custom' in s)).toEqual([true, true, true]);
    expect(secsInFile[2].height).toBe(14);
    expect(errors).toEqual([]);
    await context.close();
});

// ==================== 存檔失敗時畫面與模型一致（保底）====================
test('檢查：存檔失敗時畫面與模型一致', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        device: DEVICES.desktop, wordlist: 'stub', storage: ABC(),
        init: () => {
            const orig = Storage.prototype.setItem;
            Storage.prototype.setItem = function (k, v) {
                if (window.__failLS) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
                return orig.call(this, k, v);
            };
        },
    });
    await waitStill(page);
    await page.evaluate(() => { window.__failLS = true; });
    await pickNext(page, 1);                                          // 換類型
    await secs(page).nth(0).locator('.section-remove').click();
    await page.locator('#lhAskActions .song-danger-btn').click();       // 刪一段
    await expect(page.locator('#lhSaveBanner')).toBeVisible();
    await expect(page.locator('#lhSaveBanner')).toContainText('存檔失敗');
    const onScreen = await page.evaluate(() => [...document.querySelectorAll('#lyricsSections .lyrics-section')].map(el => [el.dataset.id, el.querySelector('.section-type').textContent, el.dataset.type]));
    const inModel = await page.evaluate(() => curSong().sections.map(s => [s.id, s.label, s.type]));
    expect(onScreen).toEqual(inModel);
    expect(onScreen.map(r => r[0])).toEqual(['sb', 'sc']);
    expect(onScreen[0][2], '換過的類型在畫面與模型裡一樣').not.toBe('chorus');
    expect(errors).toEqual([]);
    await context.close();
});
