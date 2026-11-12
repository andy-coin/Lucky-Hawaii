// 檢查：Phase 8 所有新介面一起量——長歌名、怪字元、觸控、焦點、不只靠顏色、三種主題對比、無障礙名稱
// 每個計畫已經各自測過自己的畫面；這裡把它們放在一起，用同一把尺再量一次（UI-SPEC §10、§11）
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage } from './helpers.mjs';
import { DEVICES, noPageScroll, waitStill, auditTouchTargets } from './layout-lib.mjs';

const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const mkSong = (id, title, createdAt, sections = [['主歌', '歌詞']], o = {}) => ({
    id, title, createdAt, updatedAt: createdAt,
    sections: sections.map((s, i) => ({ id: `sec-${id}-${i}`, label: s[0], text: s[1], collapsed: false })),
    hashtags: o.hashtags ?? [], context: o.context ?? '',
});
// 已經是第 2 版資料的使用者：直接帶 lh:songs，左邊歌詞面板預設展開
const seed = (songs, active = songs[0].id, extra = {}) => ({
    'lh:schema': '2', 'lh:songs': JSON.stringify(songs), 'lh:activeSong': active,
    leftPanelCollapsed: 'false', rightPanelCollapsed: 'true', ...extra,
});
const TWO = [mkSong('song-a', '甲', 2000, [['主歌', '甲的歌詞']]), mkSong('song-b', '乙', 1000, [['主歌', '乙的歌詞']])];
const mkBackup = songArr => ({
    format: 'lucky-hawaii-backup', version: 2, exportedAt: '2026-10-11T07:30:00.000Z',
    songs: songArr, activeSong: null, savedWords: [], settings: {},
});
const importBuf = (page, obj) => page.setInputFiles('#importFileInput', {
    name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj)),
});
const openMenu = async page => { await page.locator('#exportToggle').click(); await expect(page.locator('#exportMenu')).toBeVisible(); };
const pickItem = (page, label) => page.locator('#exportMenu .export-item').filter({ has: page.locator('.export-label', { hasText: label }) });
const chars = (s, n) => Array.from(s).slice(0, n).join('');
const del = (page, id) => page.locator('.song-act.delete[data-song-id="' + id + '"]');

// ==================== 長歌名 ====================
test('檢查：長歌名', async ({ browser }) => {
    const title = '很長的歌名'.repeat(12);   // 60 個字
    expect(Array.from(title)).toHaveLength(60);
    for (const [name, device, pct, sheet] of [['手機 150%', DEVICES.phone, 150, true], ['桌機', DESKTOP, 100, false]]) {
        const songs = [mkSong('song-long', title, 2000, [['主歌', '歌詞']]), mkSong('song-short', '短', 1000)];
        const { context, page, errors } = await bootPage(browser, { storage: seed(songs), device, wordlist: 'stub' });
        if (sheet) await page.locator('#mtab-lyrics').click();
        if (pct !== 100) await page.evaluate(p => setUiScale(p), pct);   // 手機面板開著時按不到 ➕➖，直接呼叫縮放函式
        await waitStill(page);

        // 標題列：單行、有省略號
        const oneLine = sel => page.locator(sel).first().evaluate(el => {
            const cs = getComputedStyle(el);
            // 一行的高度上限：一行字高的 1.5 倍，或按鈕本身的最小點擊高度（放大時 44px 也跟著放大），取大的
            const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
            return { over: el.scrollWidth > el.clientWidth, ellipsis: cs.textOverflow, nowrap: cs.whiteSpace, h: el.getBoundingClientRect().height, limit: Math.max(lh * 1.5, (parseFloat(cs.minHeight) || 0) + 1) };
        });
        let r = await oneLine('#songCurrent');
        expect(r.over, name + ' 標題列被截斷').toBe(true);
        expect(r.ellipsis).toBe('ellipsis');
        expect(r.nowrap).toBe('nowrap');
        expect(r.h, name + ' 標題列只有一行').toBeLessThanOrEqual(r.limit);
        expect(await page.locator('#songCurrent').getAttribute('title'), '完整歌名在 title').toBe(title);

        // 匯出選單的提示、匯出的提示條：歌名最多 16 字
        await openMenu(page);
        await expect(page.locator('#exportMenu [data-hint="txt"]')).toHaveText('下載 ' + chars(title, 16) + '….txt');
        await expect(page.locator('#exportMenu [data-hint="md"]')).toHaveText('下載 ' + chars(title, 16) + '….md');
        const [dl] = await Promise.all([page.waitForEvent('download'), pickItem(page, 'TXT').click()]);
        expect(dl.suggestedFilename()).toBe(title + '.txt');
        await expect(page.locator('#copyToast')).toHaveText('已匯出「' + chars(title, 16) + '….txt」');

        // 清單那一列：單行、有省略號
        await page.locator('#songListToggle').click();
        await waitStill(page);
        r = await oneLine('.song-pick');
        expect(r.over, name + ' 清單列被截斷').toBe(true);
        expect(r.ellipsis).toBe('ellipsis');
        expect(r.nowrap).toBe('nowrap');
        expect(r.h, name + ' 清單列只有一行').toBeLessThanOrEqual(r.limit);

        // 刪除視窗：標題最多 24 字，完整歌名另列一行
        await del(page, 'song-long').click();
        await expect(page.locator('#songDeleteTitle')).toHaveText('刪除「' + chars(title, 24) + '…」？');
        await expect(page.locator('#songDeleteFull')).toHaveText(title);
        const sc = await noPageScroll(page);
        expect(sc.sw, name + ' 視窗開著橫向不捲動').toBeLessThanOrEqual(sc.iw);
        await page.locator('#songDeleteConfirm').click();
        await expect(page.locator('#songDeleteOverlay')).toBeHidden();
        await expect(page.locator('#copyToast')).toHaveText('已刪除「' + chars(title, 16) + '…」');
        const fin = await noPageScroll(page);
        expect(fin.sw, name + ' 橫向不捲動').toBeLessThanOrEqual(fin.iw);
        expect(fin.sh, name + ' 直向不捲動').toBeLessThanOrEqual(fin.ih);
        expect(errors).toEqual([]);
        await context.close();
    }
});

// ==================== 怪字元原樣顯示 ====================
test('檢查：怪字元原樣顯示', async ({ browser }) => {
    const evil = '<img src=x onerror=alert(1)>';
    const evilText = '</textarea><script>window.__pwn=1</script>';
    const evilLabel = '<b>粗</b>';
    const songs = [mkSong('song-evil', evil, 2000, [[evilLabel, evilText]]), mkSong('song-ok', '正常', 1000)];
    const { context, page, errors } = await bootPage(browser, {
        storage: seed(songs), device: DESKTOP, wordlist: 'stub',
        init: () => { window.__printCount = 0; window.print = () => { window.__printCount++; }; },
    });
    let dialogs = 0;
    page.on('dialog', () => { dialogs++; });   // 若 onerror 的 alert 真的跑了，這裡會數到
    const bare = sel => page.locator(sel).evaluate(el => ({ img: el.querySelectorAll('img').length, script: el.querySelectorAll('script').length, b: el.querySelectorAll('b').length }));
    const none = { img: 0, script: 0, b: 0 };

    // 標題列、清單、改名輸入框
    await expect(page.locator('#songCurrent')).toHaveText(evil);
    expect(await bare('#songCurrent')).toEqual(none);
    await page.locator('#songListToggle').click();
    await expect(page.locator('.song-pick').first()).toHaveText(evil);
    expect(await bare('#songItems')).toEqual(none);
    await page.locator('.song-act.rename[data-song-id="song-evil"]').click();
    await expect(page.locator('.song-name-input')).toHaveValue(evil);
    await page.keyboard.press('Escape');
    await expect(page.locator('.song-name-input')).toHaveCount(0);

    // 歌詞框與段落名
    await expect(page.locator('.section-textarea').first()).toHaveValue(evilText);
    expect(await page.evaluate(() => window.__pwn)).toBeUndefined();
    expect(await page.locator('#lyricsSections script').count()).toBe(0);
    expect(await bare('#lyricsSections')).toEqual(none);

    // 匯出選單的提示（歌名先把 < > 換成底線，再最多 16 字）
    await openMenu(page);
    const safe = evil.replace(/[\\/:*?"<>|]/g, '_');
    await expect(page.locator('#exportMenu [data-hint="txt"]')).toHaveText('下載 ' + chars(safe, 16) + '….txt');
    expect(await bare('#exportMenu')).toEqual(none);
    await page.keyboard.press('Escape');

    // 刪除視窗（完整歌名另列一行，只是文字）
    await del(page, 'song-evil').click();
    await expect(page.locator('#songDeleteTitle')).toHaveText('刪除「' + chars(evil, 24) + '…」？');
    await expect(page.locator('#songDeleteFull')).toHaveText(evil);
    expect(await bare('#songDeleteOverlay')).toEqual(none);
    await expect(page.locator('#songDeleteConfirm')).toHaveAttribute('aria-label', '刪除「' + evil + '」這首歌');
    await page.locator('#songDeleteCancel').click();

    // 匯入視窗的歌名標籤
    await importBuf(page, mkBackup([mkSong('song-in', evil, 3000, [[evilLabel, evilText]])]));
    await expect(page.locator('#importOverlay')).toBeVisible();
    await expect(page.locator('#importChips .report-chip').first()).toHaveText(evil);
    expect(await bare('#importOverlay')).toEqual(none);
    await page.locator('#importCancelBtn').click();
    await expect(page.locator('#importOverlay')).toBeHidden();

    // 列印頁（window.print 被換成計數器）
    await openMenu(page);
    await pickItem(page, 'PDF').click();
    expect(await page.evaluate(() => window.__printCount)).toBe(1);
    await expect(page.locator('#printSheet h1')).toHaveText(evil);
    await expect(page.locator('#printSheet h2')).toHaveText(evilLabel);
    await expect(page.locator('#printSheet .print-text')).toHaveText(evilText);
    expect(await bare('#printSheet')).toEqual(none);

    expect(await page.evaluate(() => window.__pwn), 'script 沒有被執行').toBeUndefined();
    expect(dialogs, 'alert 沒有被觸發').toBe(0);
    expect(errors).toEqual([]);
    await context.close();
});

test('檢查：怪字元——新程式碼不用 innerHTML', () => {
    // 去掉整行註解與行尾註解後再找
    const code = f => readFileSync(f, 'utf8').split('\n').map(l => l.replace(/\/\/.*$/, '')).filter(l => l.trim()).join('\n');
    const FORBIDDEN = /innerHTML|outerHTML|insertAdjacentHTML|document\.write/;
    for (const f of ['js/songs.js', 'js/song-io.js', 'js/lyrics.js']) {
        expect(code(f).match(FORBIDDEN), f + ' 不該用 HTML 字串').toBeNull();
    }
    // renderSavedWords 整個函式（到下一個同縮排的 function 為止）
    const panels = readFileSync('js/panels.js', 'utf8');
    const start = panels.indexOf('function renderSavedWords');
    expect(start, '前置：找得到 renderSavedWords').toBeGreaterThan(-1);
    const rest = panels.slice(start + 10);
    const next = rest.search(/\n {8}function /);
    const body = (next === -1 ? rest : rest.slice(0, next)).split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
    expect(body.length, '前置：函式內容不是空的').toBeGreaterThan(100);
    expect(body.match(FORBIDDEN), 'renderSavedWords 不該用 HTML 字串').toBeNull();
    // 自檢：掃描器抓得到
    expect('a.innerHTML = x'.match(FORBIDDEN)).not.toBeNull();
});

// ==================== 觸控目標 ====================
const PHASE8 = /song-toggle|songListToggle|export-toggle|exportToggle|export-item|panel-add-btn|song-new-btn|song-pick|song-act|song-name-input|import-choice|import(?:Add|Replace|Cancel)Btn|feedback-cancel-btn|songDelete|song-danger-btn|backup-restore-btn/;

test('檢查：觸控目標', async ({ browser }) => {
    test.setTimeout(120_000);
    for (const [name, device, openSheet] of [['手機 390×844', DEVICES.phone, true], ['平板直放 820×1180', DEVICES.tablet, true], ['平板橫放 1180×820', DEVICES.tabletLandscape, false]]) {
        const { context, page, errors } = await bootPage(browser, { storage: seed(TWO), device, wordlist: 'stub' });
        if (openSheet) await page.locator('#mtab-lyrics').click();
        const audit = async (mustSee, label) => {
            await waitStill(page);
            const r = await auditTouchTargets(page, { mustSee });
            expect(r.missing, `${name} ${label} 沒量到`).toEqual([]);
            expect(r.failures.filter(f => PHASE8.test(f.selector)), `${name} ${label} 觸控目標不到 44×44`).toEqual([]);
            expect(r.overlaps.filter(o => PHASE8.test(o.a) || PHASE8.test(o.b)), `${name} ${label} 相鄰重疊`).toEqual([]);
        };

        // 標題列、清單、列上的 ✎ 🗑、改名輸入框
        await page.locator('#songListToggle').click();
        await audit(['#songListToggle', '#exportToggle', '#editorOpenBtn', '.song-new-btn', '.song-pick', '.song-act.rename', '.song-act.delete'], '標題列與清單');
        await page.locator('.song-act.rename[data-song-id="song-a"]').click();   // 改名時那一列的 ✎ 🗑 會先藏起來，所以輸入框另外量
        await expect(page.locator('.song-name-input')).toBeVisible();
        await audit(['.song-name-input'], '改名輸入框');
        await page.keyboard.press('Escape');

        // 匯出選單
        await openMenu(page);
        await audit(['.export-item'], '匯出選單');
        await page.keyboard.press('Escape');

        // 匯入視窗（摘要畫面）
        await importBuf(page, mkBackup([mkSong('song-in', '匯入的歌', 3000)]));
        await expect(page.locator('#importOverlay')).toBeVisible();
        await audit(['#importAddBtn', '#importReplaceBtn', '#importCancelBtn'], '匯入視窗');
        await page.locator('#importCancelBtn').click();
        await expect(page.locator('#importOverlay')).toBeHidden();

        // 刪除視窗
        await del(page, 'song-a').click();
        await expect(page.locator('#songDeleteOverlay')).toBeVisible();
        await audit(['#songDeleteCancel', '#songDeleteConfirm'], '刪除視窗');
        await page.locator('#songDeleteCancel').click();

        // 設定裡的自動備份
        await page.evaluate(() => toggleSettings());   // 手機上歌詞面板蓋住標題列，直接呼叫開啟函式
        await page.locator('#prefsTab-data').click();   // 分頁式偏好設定（R2）
        await page.locator('#autoBackupSection summary').click();
        await expect(page.locator('.backup-restore-btn').first()).toBeVisible();
        await audit(['.backup-restore-btn'], '自動備份');
        expect(errors).toEqual([]);
        await context.close();
    }
});

// ==================== 焦點 ====================
test('檢查：焦點', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: seed(TWO), device: DESKTOP, wordlist: 'stub' });
    const list = page.locator('#songList');
    const toggle = page.locator('#songListToggle');
    const isInert = () => list.evaluate(el => el.inert);

    // 清單：關著時 hidden 又 inert；開了可以操作；Esc 關起來並把焦點還給 ☰ 歌曲
    await expect(list).toBeHidden();
    expect(await isInert(), '關著的清單是 inert').toBe(true);
    await toggle.click();
    await expect(list).toBeVisible();
    expect(await isInert()).toBe(false);
    await page.locator('.song-pick').first().focus();
    await page.keyboard.press('Escape');
    await expect(list).toBeHidden();
    expect(await isInert()).toBe(true);
    await expect(toggle).toBeFocused();

    // 刪除視窗：先停在「先不刪除」，Esc 後焦點回到開它的 🗑
    await toggle.click();
    const trash = del(page, 'song-a');
    await trash.click();
    await expect(page.locator('#songDeleteCancel')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#songDeleteOverlay')).toBeHidden();
    await expect(trash).toBeFocused();

    // 匯出選單：用鍵盤開（焦點進第一項），Esc 後焦點回到 ⬇ 匯出
    const exp = page.locator('#exportToggle');
    await exp.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#exportMenu')).toBeVisible();
    await expect(page.locator('#exportMenu .export-item').first()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#exportMenu')).toBeHidden();
    await expect(exp).toBeFocused();

    // 匯入失敗的畫面：焦點直接在「關閉錯誤訊息」
    await importBuf(page, '這不是 JSON');
    await expect(page.locator('#importOverlay')).toBeVisible();
    await expect(page.locator('#importTitle')).toHaveText('這個檔案無法匯入');
    await expect(page.locator('#importCancelBtn')).toBeFocused();
    await expect(page.locator('#importCancelBtn')).toHaveText('關閉錯誤訊息');
    await page.keyboard.press('Enter');
    await expect(page.locator('#importOverlay')).toBeHidden();
    expect(errors).toEqual([]);
    await context.close();
});

// ==================== 不只靠顏色 ====================
test('檢查：不只靠顏色', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: seed(TWO, 'song-b'), device: DESKTOP, wordlist: 'stub' });
    await page.locator('#songListToggle').click();
    const active = page.locator('.song-item[aria-current="true"]');
    await expect(active).toHaveCount(1);
    await expect(active.locator('.song-pick')).toHaveText('乙');
    const looks = await page.evaluate(() => {
        const f = li => { const cs = getComputedStyle(li); return { stripe: cs.borderLeftColor, w: parseFloat(cs.borderLeftWidth), pick: getComputedStyle(li.querySelector('.song-pick')).fontWeight }; };
        return { on: f(document.querySelector('.song-item[aria-current="true"]')), off: f(document.querySelector('.song-item:not([aria-current])')), accent: getComputedStyle(document.documentElement).getPropertyValue('--highlight-border').trim() };
    });
    expect(looks.on.w, '目前這首有左邊的色條').toBeGreaterThanOrEqual(3);
    expect(looks.on.stripe).not.toBe('rgba(0, 0, 0, 0)');
    expect(looks.on.pick, '目前這首是粗體').toBe('700');
    expect(looks.off.pick, '其他首不是粗體').toBe('400');
    expect(looks.off.stripe, '其他首的色條是透明的').toBe('rgba(0, 0, 0, 0)');

    // 「全部還原」那一塊：名字寫明取代目前資料，⚠ 只是裝飾
    await importBuf(page, mkBackup([mkSong('song-in', '匯入的歌', 3000)]));
    await expect(page.locator('#importOverlay')).toBeVisible();
    const tile = page.getByRole('button', { name: /取代目前資料/ });
    await expect(tile).toHaveCount(1);
    await expect(tile).toHaveAttribute('id', 'importReplaceBtn');
    await expect(page.locator('#importReplaceLabel')).toContainText('⚠');
    await expect(page.locator('#importReplaceLabel > span[aria-hidden="true"]')).toHaveText('⚠ ');
    await expect(page.locator('#importAddBtn')).not.toContainText('取代目前資料');
    expect(errors).toEqual([]);
    await context.close();
});

// ==================== 三種主題對比 ====================
function rgbOf(value) {
    let m = value.match(/^#([0-9a-f]{6})$/i);
    if (m) return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
    m = value.match(/^#([0-9a-f]{3})$/i);
    if (m) return [...m[1]].map(c => parseInt(c + c, 16));
    m = value.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
    if (m) return [+m[1], +m[2], +m[3]];
    throw new Error('看不懂的顏色：' + value);
}
const luminance = ([r, g, b]) => {
    const f = c => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a, b) => {
    const [hi, lo] = [luminance(rgbOf(a)), luminance(rgbOf(b))].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
};

test('檢查：三種主題對比', async ({ browser }) => {
    const themes = [
        ['淺色', {}, true],
        ['深色', { hoyun_theme_mode: 'dark' }, true],
        ['自訂配色', { bgColor1: '#1a365d', containerBg: '#fffaf0', textColor: '#1a202c', highlightColor: '#2b6cb0' }, false],
    ];
    const report = [];
    for (const [name, extra, checkLine] of themes) {
        const { context, page, errors } = await bootPage(browser, { storage: seed(TWO, 'song-a', extra), device: DESKTOP, wordlist: 'stub' });
        await page.locator('#songListToggle').click();
        await del(page, 'song-a').click();   // 實際畫出來的「刪除這首歌」按鈕也量
        const v = await page.evaluate(() => {
            const cs = getComputedStyle(document.documentElement);
            const get = n => cs.getPropertyValue(n).trim();
            const btn = getComputedStyle(document.getElementById('songDeleteConfirm'));
            return {
                text: get('--text-primary'), card: get('--card-bg'), container: get('--container-bg'),
                dangerText: get('--danger-text'), dangerBg: get('--danger-bg'), dangerLine: get('--danger-line'),
                btnColor: btn.color, btnBg: btn.backgroundColor,
            };
        });
        const check = (label, a, b, min = 4.5) => {
            const ratio = contrast(a, b);
            report.push(`${name} ${label} ${a} / ${b} = ${ratio.toFixed(2)}`);
            expect(ratio, `${name} ${label} 對比 ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(min);
        };
        check('文字/卡片', v.text, v.card);
        check('文字/容器', v.text, v.container);
        check('刪除鈕文字/底', v.dangerText, v.dangerBg);
        check('實際刪除鈕', v.btnColor, v.btnBg);
        if (checkLine) {
            check('危險線/容器', v.dangerLine, v.container);
            check('危險線/卡片', v.dangerLine, v.card);
        }
        expect(errors).toEqual([]);
        await context.close();
    }
    console.log('主題對比實測\n' + report.join('\n'));
    // 自檢：量得到不合格的組合（淺灰字在白底）
    expect(contrast('#cccccc', '#ffffff')).toBeLessThan(4.5);
});

test('檢查：沒有新的顏色常數（Phase 8 的規則）', () => {
    const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
    const lit = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g;
    const mine = /song|export|import|backup|danger|print-/;
    const bad = [];
    for (const f of ['css/panels.css', 'css/responsive.css']) {
        for (const m of strip(readFileSync(f, 'utf8')).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
            const sel = m[1].trim();
            if (!mine.test(sel) || /^(:root|html)/.test(sel)) continue;
            for (const c of m[2].matchAll(lit)) {
                if (/^rgba\(\s*0\s*,\s*0\s*,\s*0\s*,/.test(c[0])) continue;   // 既有的遮罩色
                bad.push(`${f}: ${sel} { ${c[0]} }`);
            }
        }
    }
    expect(bad, 'Phase 8 的規則裡直接寫了顏色（請改用顏色變數）').toEqual([]);
});

// ==================== 無障礙名稱 ====================
test('檢查：無障礙名稱', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: seed(TWO), device: DESKTOP, wordlist: 'stub' });
    const nameOf = async sel => {
        const el = page.locator(sel).first();
        return { label: await el.getAttribute('aria-label'), title: await el.getAttribute('title') };
    };
    const expectNamed = async (sel, want) => {
        const n = await nameOf(sel);
        expect([n.label, n.title], `${sel} 的名稱`).toContain(want);
    };
    await expectNamed('#songListToggle', '開關歌曲清單');
    await expect(page.locator('#songListToggle')).toHaveAttribute('aria-controls', 'songList');
    await expect(page.locator('#songListToggle')).toHaveAttribute('aria-expanded', 'false');
    await expectNamed('#exportToggle', '匯出這首歌');
    await expect(page.locator('#exportToggle')).toHaveAttribute('aria-haspopup', 'menu');
    await expectNamed('.section-add-btn', '在這首歌新增一個段落');
    await expectNamed('.song-new-btn', '新增一首歌曲');
    await expectNamed('.song-act.rename[data-song-id="song-a"]', '重新命名「甲」');
    await expectNamed('.song-act.delete[data-song-id="song-a"]', '刪除「甲」');
    await expectNamed('.song-act.rename[data-song-id="song-b"]', '重新命名「乙」');
    await expectNamed('.song-act.delete[data-song-id="song-b"]', '刪除「乙」');
    await expectNamed('.save-load-controls .save-load-btn >> nth=0', '把所有歌曲與設定存成一個備份檔');
    await expectNamed('.save-load-controls .save-load-btn >> nth=1', '從備份檔還原歌曲與設定');
    await expectNamed('#songDeleteCancel', '先不刪除，關閉視窗');
    await expectNamed('#importCancelBtn', '先不匯入，關閉視窗');

    // 刪除鈕的名稱在視窗打開時才帶歌名
    await page.locator('#songListToggle').click();
    await del(page, 'song-a').click();   // 推開欄只有目前這首顯示 🗑
    await expectNamed('#songDeleteConfirm', '刪除「甲」這首歌');
    await page.locator('#songDeleteCancel').click();

    // 匯入失敗畫面的按鈕改名
    await importBuf(page, '壞掉的檔案');
    await expect(page.locator('#importOverlay')).toBeVisible();
    await expectNamed('#importCancelBtn', '關閉錯誤訊息，回到頁面');
    await page.locator('#importCancelBtn').click();

    // 用無障礙名稱真的找得到（不只是屬性存在）
    for (const n of ['開關歌曲清單', '匯出這首歌', '在這首歌新增一個段落', '新增一首歌曲', '把所有歌曲與設定存成一個備份檔', '從備份檔還原歌曲與設定']) {
        expect(await page.getByRole('button', { name: n }).count(), n).toBeGreaterThanOrEqual(1);
    }
    expect(errors).toEqual([]);
    await context.close();
});
