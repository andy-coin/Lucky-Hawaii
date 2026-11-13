// 匯出（EDIT-08）：TXT、Markdown、PDF 列印頁、複製整首、選單、版面
import { test, expect } from '@playwright/test';
import { bootPage } from './helpers.mjs';
import { DEVICES, waitStill, rectsOverlap, auditTouchTargets } from './layout-lib.mjs';

const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const mkSong = (id, title, sections, o = {}) => ({
    id, title, createdAt: o.createdAt ?? 1000, updatedAt: 1000,
    sections: sections.map((s, i) => ({ id: `sec-${id}-${i}`, label: s[0], text: s[1], collapsed: false })),
    hashtags: o.hashtags ?? [], context: o.context ?? '',
});
// 已經是第 2 版資料的使用者：直接帶 lh:songs，左側面板預設展開
const seed = (songs, extra = {}) => ({
    'lh:schema': '2', 'lh:songs': JSON.stringify(songs), 'lh:activeSong': songs[0].id,
    leftPanelCollapsed: 'false', rightPanelCollapsed: 'true', ...extra,
});
const FIXTURE_SONG = () => mkSong('song-x', '我的/歌:1', [
    ['主歌', '第一句\n第二句'],
    ['', ''],
    ['', '#開頭\n1. 數字'],
]);
// 第 9 階段起標題讀模型的 label（A3）：主歌、空白、空白 都是 Verse，同類型 3 段依序編號 Verse I / II / III（空白段不輸出）
const TXT_EXPECTED = '我的/歌:1\n\n[Verse I]\n第一句\n第二句\n\n[Verse III]\n#開頭\n1. 數字\n';
const MD_EXPECTED = '# 我的/歌:1\n\n## Verse I\n\n第一句  \n第二句\n\n## Verse III\n\n\\#開頭  \n\\1. 數字\n';
const toastText = page => page.locator('#copyToast').textContent();
const openMenu = async page => { await page.locator('#exportToggle').click(); await expect(page.locator('#exportMenu')).toBeVisible(); };
const pickItem = (page, label) => page.locator('#exportMenu .export-item').filter({ has: page.locator('.export-label', { hasText: label }) });
// 讀下載檔的原始位元組（UTF-8、無 BOM 都要驗）
async function readDownload(dl) {
    const stream = await dl.createReadStream();
    const chunks = [];
    for await (const c of stream) chunks.push(c);
    return Buffer.concat(chunks);
}

test('匯出：下載 TXT', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: seed([FIXTURE_SONG()]), device: DESKTOP });
    await openMenu(page);
    const [dl] = await Promise.all([page.waitForEvent('download'), pickItem(page, 'TXT').click()]);
    expect(dl.suggestedFilename()).toBe('我的_歌_1.txt');
    const bytes = await readDownload(dl);
    expect(bytes.subarray(0, 3).toString('hex'), '不可有 BOM').not.toBe('efbbbf');
    expect(bytes.toString('utf8')).toBe(TXT_EXPECTED);
    await expect(page.locator('#copyToast')).toHaveText('已匯出「我的_歌_1.txt」');
    await expect(page.locator('#exportMenu')).toBeHidden();
    expect(errors).toEqual([]);
    await context.close();
});

// ==================== Markdown、複製、列印頁、空白歌 ====================
// 測試用：window.print 換成計數器（headless 的 print() 會立刻跑完並清掉列印頁，看不到內容）
const STUB_PRINT = () => { window.__printCount = 0; window.print = () => { window.__printCount++; }; };

test('匯出：Markdown', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: seed([FIXTURE_SONG()]), device: DESKTOP });
    await openMenu(page);
    const [dl] = await Promise.all([page.waitForEvent('download'), pickItem(page, 'Markdown').click()]);
    expect(dl.suggestedFilename()).toBe('我的_歌_1.md');
    expect((await readDownload(dl)).toString('utf8')).toBe(MD_EXPECTED);
    await expect(page.locator('#copyToast')).toHaveText('已匯出「我的_歌_1.md」');
    expect(errors).toEqual([]);
    await context.close();
});

test('匯出：Markdown 跳脫會變成標記的行', async ({ browser }) => {
    const song = mkSong('song-m', '標記', [['A', '#標題\n> 引用\n- 項目\n* 星號\n+ 加號\n1. 數字\n12.兩位\n普通行 # 不用跳脫']]);
    const { context, page } = await bootPage(browser, { storage: seed([song]), device: DESKTOP });
    await openMenu(page);
    const [dl] = await Promise.all([page.waitForEvent('download'), pickItem(page, 'Markdown').click()]);
    expect((await readDownload(dl)).toString('utf8')).toBe(
        '# 標記\n\n## A\n\n\\#標題  \n\\> 引用  \n\\- 項目  \n\\* 星號  \n\\+ 加號  \n\\1. 數字  \n\\12.兩位  \n普通行 # 不用跳脫\n');
    await context.close();
});

test('匯出：複製整首', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: seed([FIXTURE_SONG()]), device: DESKTOP });
    await openMenu(page);
    const [dl] = await Promise.all([page.waitForEvent('download'), pickItem(page, 'TXT').click()]);
    const fileText = (await readDownload(dl)).toString('utf8');
    await page.evaluate(() => navigator.clipboard.writeText('舊內容'));
    await openMenu(page);
    await pickItem(page, '複製整首').click();
    await expect(page.locator('#copyToast')).toHaveText('已複製整首');
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toBe(TXT_EXPECTED);
    expect(clip, '剪貼簿與下載的 TXT 一字不差').toBe(fileText);
    expect(errors).toEqual([]);
    await context.close();
});

test('匯出：剪貼簿退回舊方法', async ({ browser }) => {
    // writeText 被拒絕：改走 textarea + execCommand('copy')，用 copy 事件抓當下選取的文字
    const init = () => {
        navigator.clipboard.writeText = () => Promise.reject(new Error('denied'));
        window.__copied = null;
        document.addEventListener('copy', () => { window.__copied = document.getSelection().toString(); });
    };
    const { context, page } = await bootPage(browser, { storage: seed([FIXTURE_SONG()]), device: DESKTOP, init });
    await openMenu(page);
    await pickItem(page, '複製整首').click();
    await expect(page.locator('#copyToast')).toHaveText('已複製整首');
    expect(await page.evaluate(() => window.__copied)).toBe(TXT_EXPECTED);
    expect(await page.locator('textarea[readonly]').count(), '暫時的 textarea 要收掉').toBe(0);
    // 兩條路都失敗
    await page.evaluate(() => { document.execCommand = () => false; });
    await page.evaluate(() => document.getElementById('copyToast').classList.remove('show'));
    await openMenu(page);
    await pickItem(page, '複製整首').click();
    await expect(page.locator('#copyToast')).toHaveText('複製失敗，請改用「TXT」下載');
    expect(await page.locator('textarea[readonly]').count()).toBe(0);
    await context.close();
});

test('匯出：空白歌不匯出', async ({ browser }) => {
    const blank = mkSong('song-b', '空白歌', [['主歌', ''], ['', '  \n\t']]);
    const { context, page, errors } = await bootPage(browser, { storage: seed([blank]), device: DESKTOP, init: STUB_PRINT });
    await page.evaluate(() => navigator.clipboard.writeText('原本的剪貼簿'));
    const downloads = [];
    page.on('download', d => downloads.push(d));
    for (const label of ['TXT', 'Markdown', 'PDF', '複製整首']) {
        await page.evaluate(() => document.getElementById('copyToast')?.classList.remove('show'));
        await openMenu(page);
        await pickItem(page, label).click();
        await expect(page.locator('#copyToast'), label).toHaveClass(/show/);
        await expect(page.locator('#copyToast'), label).toHaveText('這首歌還沒有歌詞可以匯出');
    }
    await page.waitForTimeout(1000);
    expect(downloads.length, '不可下載任何檔案').toBe(0);
    expect(await page.evaluate(() => window.__printCount), '不可呼叫 window.print').toBe(0);
    expect(await page.evaluate(() => navigator.clipboard.readText()), '剪貼簿不變').toBe('原本的剪貼簿');
    expect(await page.evaluate(() => document.body.classList.contains('print-song'))).toBe(false);
    expect(errors).toEqual([]);
    await context.close();
});

// PDF 流程：點 PDF → 填列印頁 → window.print（被換成計數器）
async function startPdfFlow(page) {
    await openMenu(page);
    await pickItem(page, 'PDF').click();
    await expect(page.locator('#copyToast')).toHaveText('在列印視窗選「儲存為 PDF」');
    expect(await page.evaluate(() => window.__printCount)).toBe(1);
}

test('匯出：PDF 列印頁', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: seed([FIXTURE_SONG()]), device: DESKTOP, init: STUB_PRINT });
    await startPdfFlow(page);
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('#printSheet')).toBeVisible();
    const sheet = await page.evaluate(() => {
        const s = document.getElementById('printSheet');
        const kids = [...s.children];
        return {
            tags: kids.map(k => k.tagName),
            title: kids[0].textContent,
            sections: kids.slice(1).map(k => [...k.children].map(c => c.tagName + ':' + c.textContent)),
            cls: document.body.className,
        };
    });
    expect(sheet.tags).toEqual(['H1', 'SECTION', 'SECTION']);
    expect(sheet.title).toBe('我的/歌:1');
    expect(sheet.sections).toEqual([['H2:Verse I', 'P:第一句\n第二句'], ['H2:Verse III', 'P:#開頭\n1. 數字']]);
    expect(sheet.cls).toContain('print-song');
    const look = await page.evaluate(() => {
        const s = document.getElementById('printSheet');
        const all = [document.body, s, ...s.querySelectorAll('*')];
        const outside = [...document.body.querySelectorAll('*')].filter(e => !s.contains(e));
        return {
            bad: all.filter(e => { const c = getComputedStyle(e); return c.color !== 'rgb(0, 0, 0)' || c.backgroundColor !== 'rgb(255, 255, 255)'; }).map(e => e.tagName),
            visibleOutside: outside.filter(e => e.checkVisibility()).map(e => e.tagName + (e.id ? '#' + e.id : '')),
            h2Weight: getComputedStyle(s.querySelector('h2')).fontWeight,
            boxes: [...document.querySelectorAll('button, .side-panel, .copy-toast')].filter(e => e.getClientRects().length).length,
        };
    });
    expect(look.bad, '列印頁每個元素都是黑字白底').toEqual([]);
    expect(look.visibleOutside, '列印頁以外的東西都不顯示').toEqual([]);
    expect(look.h2Weight).toBe('700');
    expect(look.boxes, '按鈕、側邊面板、提示不可有框').toBe(0);
    const pdf = await page.pdf({ format: 'A4' });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    expect(await page.evaluate(() => document.getElementById('printSheet').childElementCount)).toBe(0);
    expect(await page.evaluate(() => document.body.classList.contains('print-song'))).toBe(false);
    expect(await page.evaluate(() => window.__printCount)).toBe(1);
    expect(errors).toEqual([]);
    await context.close();
});

test('匯出：平常列印不受影響', async ({ browser }) => {
    // 沒走 PDF 流程時 body 沒有 print-song：Cmd/Ctrl+P 印出來還是整頁，不是空白
    const { context, page } = await bootPage(browser, { storage: seed([FIXTURE_SONG()]), device: DESKTOP });
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('#searchInput')).toBeVisible();
    await expect(page.locator('.container').first()).toBeVisible();
    await expect(page.locator('#printSheet')).toBeHidden();
    await context.close();
});

test('匯出：深色主題也印黑字白底', async ({ browser }) => {
    const { context, page } = await bootPage(browser, { storage: seed([FIXTURE_SONG()], { hoyun_theme_mode: 'dark' }), device: DESKTOP, init: STUB_PRINT });
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe('dark');
    await startPdfFlow(page);
    await page.emulateMedia({ media: 'print' });
    const r = await page.evaluate(() => {
        const s = document.getElementById('printSheet');
        const all = [document.body, s, ...s.querySelectorAll('*')];
        return {
            bad: all.filter(e => { const c = getComputedStyle(e); return c.color !== 'rgb(0, 0, 0)' || c.backgroundColor !== 'rgb(255, 255, 255)'; }).map(e => e.tagName),
            visibleOutside: [...document.body.querySelectorAll('*')].filter(e => !s.contains(e) && e.checkVisibility()).length,
        };
    });
    expect(r.bad).toEqual([]);
    expect(r.visibleOutside).toBe(0);
    await context.close();
});

test('匯出：不連網路，也只匯出這首歌', async ({ browser }) => {
    const a = mkSong('song-a', '甲歌', [['主歌', '甲的歌詞']], { createdAt: 2000, hashtags: ['#秘密標籤'], context: '秘密情境' });
    const b = mkSong('song-b', '乙歌', [['主歌', '乙的歌詞']], { createdAt: 1000 });
    const { context, page, errors } = await bootPage(browser, {
        storage: seed([a, b], { haiku_savedwords: JSON.stringify(['秘密保留詞']) }), device: DESKTOP, init: STUB_PRINT,
    });
    const requests = [];
    page.on('request', r => { if (/^https?:/.test(r.url())) requests.push(r.url()); });
    const outputs = [];
    for (const label of ['TXT', 'Markdown']) {
        await openMenu(page);
        const [dl] = await Promise.all([page.waitForEvent('download'), pickItem(page, label).click()]);
        outputs.push((await readDownload(dl)).toString('utf8'));
    }
    await openMenu(page);
    await pickItem(page, '複製整首').click();
    await expect(page.locator('#copyToast')).toHaveText('已複製整首');
    outputs.push(await page.evaluate(() => navigator.clipboard.readText()));
    await startPdfFlow(page);
    outputs.push(await page.evaluate(() => document.getElementById('printSheet').textContent));
    for (const o of outputs) {
        expect(o).toContain('甲的歌詞');
        for (const leak of ['乙歌', '乙的歌詞', '秘密標籤', '秘密情境', '秘密保留詞', 'lh:']) expect(o, leak).not.toContain(leak);
    }
    expect(requests, '匯出不可送出任何網路請求').toEqual([]);
    expect(errors).toEqual([]);
    await context.close();
});

test('匯出：歌名有標記也只當文字', async ({ browser }) => {
    const title = '<img src=x onerror="window.__pwn=1">';
    const song = mkSong('song-h', title, [['<b>段</b>', '</textarea><script>window.__pwn=2</script>']]);
    const { context, page } = await bootPage(browser, { storage: seed([song]), device: DESKTOP, init: STUB_PRINT });
    await openMenu(page);
    await expect(page.locator('#exportMenu .export-hint[data-hint="txt"]')).toHaveText(/^下載 <img src=x onerror="window\.__pwn=1">\.txt$|^下載 .{1,16}…\.txt$/);
    await page.mouse.click(5, 5);   // 點選單外面關掉
    await expect(page.locator('#exportMenu')).toBeHidden();
    await startPdfFlow(page);
    const r = await page.evaluate(() => ({
        title: document.querySelector('#printSheet h1').textContent,
        label: document.querySelector('#printSheet h2').textContent,
        injected: document.querySelectorAll('#printSheet img, #printSheet script, #printSheet b, #exportMenu img').length,
        pwn: window.__pwn,
    }));
    expect(r.title).toBe(title);
    expect(r.label).toBe('<b>段</b>');
    expect(r.injected).toBe(0);
    expect(r.pwn).toBeUndefined();
    await context.close();
});

// ==================== 選單鍵盤、窄螢幕、觸控、長歌 ====================
test('匯出：選單鍵盤', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: seed([FIXTURE_SONG()]), device: DESKTOP });
    const focusedLabel = () => page.evaluate(() => document.activeElement?.querySelector?.('.export-label')?.textContent ?? null);
    // 滑鼠打開：不搶焦點
    await page.locator('#exportToggle').click();
    await expect(page.locator('#exportMenu')).toBeVisible();
    expect(await page.evaluate(() => document.activeElement?.closest('#exportMenu') !== null), '滑鼠打開不移焦點').toBe(false);
    await page.mouse.click(5, 5);
    await expect(page.locator('#exportMenu')).toBeHidden();
    await expect(page.locator('#exportToggle')).toHaveAttribute('aria-expanded', 'false');
    // 鍵盤打開：第一項拿到焦點
    await page.locator('#exportToggle').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#exportMenu')).toBeVisible();
    await expect(page.locator('#exportToggle')).toHaveAttribute('aria-expanded', 'true');
    expect(await focusedLabel()).toBe('TXT（預設）');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    expect(await focusedLabel()).toBe('PDF（列印）');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    expect(await focusedLabel(), '↓ 到底接回第一項').toBe('TXT（預設）');
    await page.keyboard.press('ArrowUp');
    expect(await focusedLabel(), '↑ 從第一項接到最後一項').toBe('複製整首');
    await page.keyboard.press('Escape');
    await expect(page.locator('#exportMenu')).toBeHidden();
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('exportToggle');
    // Space 也能打開；Enter 選項目後關閉
    await page.keyboard.press('Space');
    await expect(page.locator('#exportMenu')).toBeVisible();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
    expect(dl.suggestedFilename()).toBe('我的_歌_1.txt');
    await expect(page.locator('#exportMenu')).toBeHidden();
    // 角色
    expect(await page.locator('#exportMenu').getAttribute('role')).toBe('menu');
    expect(await page.locator('#exportMenu .export-item').evaluateAll(els => els.map(e => e.getAttribute('role')))).toEqual(['menuitem', 'menuitem', 'menuitem', 'menuitem']);
    expect(await page.locator('#exportToggle').getAttribute('aria-haspopup')).toBe('menu');
    expect(errors).toEqual([]);
    await context.close();
});

test('匯出：選單開著時開對話框會先關掉選單', async ({ browser }) => {
    const { context, page } = await bootPage(browser, { storage: seed([FIXTURE_SONG()]), device: DESKTOP });
    await openMenu(page);
    await page.evaluate(() => document.getElementById('feedbackModalOverlay').classList.add('show'));
    await page.locator('#exportToggle').dispatchEvent('click');   // 對話框蓋住了，用程式觸發（此時選單開著，會被關掉）
    await expect(page.locator('#exportMenu')).toBeHidden();
    await page.locator('#exportToggle').dispatchEvent('click');   // 對話框還開著：不會再打開
    await expect(page.locator('#exportMenu')).toBeHidden();
    await context.close();
});

test('匯出：標題列在手機放大也放得下', async ({ browser }) => {
    const title = '很長的歌名'.repeat(12);
    const { context, page, errors } = await bootPage(browser, { storage: seed([mkSong('song-l', title, [['主歌', '歌詞']])]), device: DEVICES.phone });
    await page.locator('#mtab-lyrics').click();
    for (const pct of [100, 150]) {
        await page.evaluate(p => setUiScale(p), pct);   // 面板開著時按不到 ➕➖（被遮罩擋住），直接呼叫縮放函式
        await waitStill(page);
        const panel = await page.locator('#leftPanel').evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
        const kids = await page.locator('.lyrics-head > *:not(.panel-fold-btn)').evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect(); return { n: el.id || el.className, x: r.x, y: r.y, width: r.width, height: r.height }; }));
        expect(kids.map(k => k.n), '四個東西都在').toEqual(['songListToggle', 'songCurrent', 'exportToggle', 'editorOpenBtn']);
        for (const k of kids) {
            expect(k.x, `${pct}% ${k.n} 左緣`).toBeGreaterThanOrEqual(panel.x - 0.5);
            expect(k.x + k.width, `${pct}% ${k.n} 右緣`).toBeLessThanOrEqual(panel.x + panel.width + 0.5);
        }
        for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
            expect(rectsOverlap(kids[i], kids[j]), `${pct}% ${kids[i].n} 與 ${kids[j].n} 重疊`).toBe(false);
        }
        // 打開選單也要整個在畫面內
        await page.locator('#exportToggle').click();
        const m = await page.locator('#exportMenu').evaluate(el => { const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, vw: innerWidth, vh: innerHeight }; });
        expect(m.l, `${pct}% 選單左緣`).toBeGreaterThanOrEqual(0);
        expect(m.r, `${pct}% 選單右緣`).toBeLessThanOrEqual(m.vw + 0.5);
        expect(m.t, `${pct}% 選單上緣`).toBeGreaterThanOrEqual(0);
        expect(m.b, `${pct}% 選單下緣`).toBeLessThanOrEqual(m.vh + 0.5);
        await page.keyboard.press('Escape');   // 點空白處會點到面板遮罩，把整個面板關掉
    }
    expect(errors).toEqual([]);
    await context.close();
});

test('匯出：觸控目標', async ({ browser }) => {
    for (const [name, device, openSheet] of [['手機', DEVICES.phone, true], ['平板直放', DEVICES.tablet, true], ['平板橫放', DEVICES.tabletLandscape, false]]) {
        const { context, page, errors } = await bootPage(browser, { storage: seed([FIXTURE_SONG()]), device });
        if (openSheet) await page.locator('#mtab-lyrics').click();
        await page.locator('#exportToggle').click();
        await expect(page.locator('#exportMenu')).toBeVisible();
        await waitStill(page);
        const r = await auditTouchTargets(page, { mustSee: ['#exportToggle', '.export-item'] });
        expect(r.missing, name + ' 沒量到').toEqual([]);
        expect(r.failures, name + ' 觸控目標不到 44×44').toEqual([]);
        expect(r.overlaps, name + ' 相鄰重疊').toEqual([]);
        expect(r.seen.filter(n => /export-item/.test(n)).length, name + ' 四個選項都量到').toBe(4);
        expect(errors).toEqual([]);
        await context.close();
    }
});

test('匯出：長歌列印', async ({ browser }) => {
    // 補充檢查：把長歌印成 PDF 要有更多頁、列印頁沒有橫向被切（版面好不好看仍需人工看 PDF）
    const lines = n => Array.from({ length: n }, (_, i) => `第${i + 1}行：一直一直寫下去的長長長長長長歌詞`).join('\n');
    const sizes = [];
    for (const n of [20, 200]) {
        const { context, page, errors } = await bootPage(browser, { storage: seed([mkSong('song-long', '長歌', [['主歌', lines(n)]])]), device: DESKTOP, init: STUB_PRINT });
        await startPdfFlow(page);
        await page.emulateMedia({ media: 'print' });
        const fit = await page.evaluate(() => { const s = document.getElementById('printSheet'); return { sw: s.scrollWidth, cw: s.clientWidth, lines: s.querySelector('.print-text').textContent.split('\n').length }; });
        expect(fit.lines).toBe(n);
        expect(fit.sw, '列印頁沒有橫向溢出').toBeLessThanOrEqual(fit.cw);
        const pdf = await page.pdf({ format: 'A4' });
        expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
        sizes.push(pdf.length);
        expect(errors).toEqual([]);
        await context.close();
    }
    expect(sizes[1], '200 行的 PDF 比 20 行的大').toBeGreaterThan(sizes[0]);
});

test('匯出：下面沒位置時選單翻到按鈕上方', async ({ browser }) => {
    const { context, page } = await bootPage(browser, { storage: seed([FIXTURE_SONG()]), device: DESKTOP });
    // 把按鈕搬到畫面底部，模擬下方放不下
    await page.evaluate(() => { const b = document.getElementById('exportToggle'); b.style.cssText = 'position:fixed;left:3rem;bottom:1rem;z-index:5'; });
    await openMenu(page);
    const r = await page.evaluate(() => {
        const m = document.getElementById('exportMenu').getBoundingClientRect();
        const b = document.getElementById('exportToggle').getBoundingClientRect();
        return { menuBottom: m.bottom, btnTop: b.top, menuTop: m.top };
    });
    expect(r.menuTop).toBeGreaterThanOrEqual(0);
    expect(r.menuBottom, '選單在按鈕上方，沒有蓋住按鈕').toBeLessThanOrEqual(r.btnTop + 0.5);
    await context.close();
});
