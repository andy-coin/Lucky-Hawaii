// 角色標記（對唱、音樂劇）Part A：資料模型與平移（瀏覽器）、鏡像上色、浮動列「指定角色 ▸」
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage, activeSongRaw, compose } from './helpers.mjs';
import { DEVICES, setScale, expectFullyInViewport, meetsHit, hitMin, rectsOverlap } from './layout-lib.mjs';

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/v096-localStorage.json', import.meta.url), 'utf8'));
const v2Storage = (songs, active = songs[0]?.id) => ({
    ...FIXTURE, 'lh:schema': '2', 'lh:songs': JSON.stringify(songs), ...(active ? { 'lh:activeSong': active } : {}),
});
const typed = (id, type, text, extra = {}) => ({ id, type, custom: '', color: '', height: null, label: '', text, collapsed: false, ...extra });
const song = (id, sections, extra = {}) => ({ id, title: '測試歌', sections, hashtags: [], context: '', createdAt: 1, updatedAt: 1, ...extra });
const ROLES = [{ id: 'r-m', name: '男', color: '#4a7fd4' }, { id: 'r-f', name: '女', color: '#e05d5d' }];
const mk = (a, b, r) => ({ a, b, r });
const withRoles = () => v2Storage([song('s1', [
    typed('sa', 'verse', '我愛你你愛我', { marks: [mk(0, 3, 'r-m'), mk(3, 6, 'r-f')] }),
    typed('sb', 'chorus', '愛愛', { marks: [mk(1, 2, 'r-m')] }),
    typed('sc', 'bridge', '愛愛愛', { marks: [mk(0, 1, 'r-m'), mk(1, 3, 'r-f')] }),
], { roles: ROLES })]);
const marksOf = (page, n = 0) => page.evaluate(n => curSong().sections[n].marks || null, n);
const storedMarks = async (page, n = 0) => ((await activeSongRaw(page)).sections[n].marks || null);
const pick = (page, a, b, n = 0) => page.evaluate(([a, b, n]) => {
    const ta = document.querySelectorAll('.section-textarea')[n];
    ta.focus(); ta.setSelectionRange(a, b);
}, [a, b, n]);
const ta = (page, n = 0) => page.locator('.section-textarea').nth(n);

test('平移：開頭打兩個字，兩個標記一起右移', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: withRoles() });
    await pick(page, 0, 0);
    await page.keyboard.insertText('天天');
    expect(await marksOf(page)).toEqual([mk(2, 5, 'r-m'), mk(5, 8, 'r-f')]);
    await expect.poll(() => storedMarks(page)).toEqual([mk(2, 5, 'r-m'), mk(5, 8, 'r-f')]);
    expect(errors).toEqual([]);
    await context.close();
});

test('平移：打在男的裡面會長大', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: withRoles() });
    await pick(page, 1, 1);
    await page.keyboard.insertText('X');
    expect(await marksOf(page)).toEqual([mk(0, 4, 'r-m'), mk(4, 7, 'r-f')]);
    expect(errors).toEqual([]);
    await context.close();
});

test('重複字：游標在 3 打「你」，女從 4 開始；游標在 4 打「你」，女從 3 長到 7', async ({ browser }) => {
    let r = await bootPage(browser, { wordlist: 'stub', storage: withRoles() });
    await pick(r.page, 3, 3);
    await r.page.keyboard.insertText('你');
    expect(await marksOf(r.page)).toEqual([mk(0, 3, 'r-m'), mk(4, 7, 'r-f')]);
    expect(r.errors).toEqual([]);
    await r.context.close();
    r = await bootPage(browser, { wordlist: 'stub', storage: withRoles() });
    await pick(r.page, 4, 4);
    await r.page.keyboard.insertText('你');
    expect(await marksOf(r.page)).toEqual([mk(0, 3, 'r-m'), mk(3, 7, 'r-f')]);
    expect(r.errors).toEqual([]);
    await r.context.close();
});

test('重複字：愛愛的標記在 1，游標 1 打愛 → 標記移到 2；愛愛愛刪第二個字', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: withRoles() });
    await pick(page, 1, 1, 1);
    await page.keyboard.insertText('愛');
    expect(await marksOf(page, 1)).toEqual([mk(2, 3, 'r-m')]);
    await pick(page, 1, 1, 2);
    await page.keyboard.press('Backspace');
    expect(await marksOf(page, 2)).toEqual([mk(0, 2, 'r-f')]);
    expect(errors).toEqual([]);
    await context.close();
});

test('跨邊界選取後 Backspace：兩邊標記都被裁短', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: withRoles() });
    await pick(page, 2, 4);
    await page.keyboard.press('Backspace');
    expect(await marksOf(page)).toEqual([mk(0, 2, 'r-m'), mk(2, 4, 'r-f')]);
    expect(errors).toEqual([]);
    await context.close();
});

test('貼上蓋掉全部文字：標記清掉', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: withRoles() });
    await pick(page, 0, 6);
    await page.keyboard.insertText('全部換掉');
    await expect(ta(page)).toHaveValue('全部換掉');
    expect(await marksOf(page)).toBe(null);
    await expect.poll(async () => 'marks' in (await activeSongRaw(page)).sections[0]).toBe(false);
    expect(errors).toEqual([]);
    await context.close();
});

test('注音組字確認後，標記跟著平移', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: withRoles() });
    await pick(page, 0, 0);
    await compose(page, ['ㄋ', 'ㄋㄧ', 'ㄋㄧˇ'], '你');
    await expect(ta(page)).toHaveValue('你我愛你你愛我');
    expect(await marksOf(page)).toEqual([mk(1, 4, 'r-m'), mk(4, 7, 'r-f')]);
    expect(errors).toEqual([]);
    await context.close();
});

test('復原與重做：標記跟著還原', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: withRoles() });
    await pick(page, 0, 0);
    await page.keyboard.insertText('天天');
    await expect(ta(page)).toHaveValue('天天我愛你你愛我');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(ta(page)).toHaveValue('我愛你你愛我');
    expect(await marksOf(page)).toEqual([mk(0, 3, 'r-m'), mk(3, 6, 'r-f')]);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect(ta(page)).toHaveValue('天天我愛你你愛我');
    expect(await marksOf(page)).toEqual([mk(2, 5, 'r-m'), mk(5, 8, 'r-f')]);
    expect(errors).toEqual([]);
    await context.close();
});

test('重新整理後角色與標記都在', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: withRoles() });
    await pick(page, 0, 0);
    await page.keyboard.insertText('天');
    await expect.poll(() => storedMarks(page)).toEqual([mk(1, 4, 'r-m'), mk(4, 7, 'r-f')]);
    await page.reload();
    await page.waitForFunction(() => typeof curSong === 'function' && curSong() && document.querySelector('.section-textarea'));
    expect(await marksOf(page)).toEqual([mk(1, 4, 'r-m'), mk(4, 7, 'r-f')]);
    expect(await page.evaluate(() => curSong().roles.map(r => r.id))).toEqual(['r-m', 'r-f']);
    expect(errors).toEqual([]);
    await context.close();
});

test('匯入清理：壞角色與壞標記丟掉，歌詞不受影響；舊歌不多欄位', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: withRoles() });
    const r = await page.evaluate(() => {
        const bad = lhNormalizeSong({
            id: 'x1', title: 't', roles: [{ id: 'ok', name: '甲', color: 'zzz' }, { id: 'bad id', name: 'x' }],
            sections: [{ id: 'y1', text: '一二三', marks: [{ a: 0, b: 99, r: 'ok' }, { a: 1, b: 2, r: 'nope' }, { a: 'x', b: 1, r: 'ok' }] }],
        });
        const old = lhNormalizeSong({ id: 'x2', title: 'o', sections: [{ id: 'y2', text: '舊' }] });
        const orphan = lhNormalizeSong({ id: 'x3', title: 'o', sections: [{ id: 'y3', text: '舊', marks: [{ a: 0, b: 1, r: 'ok' }] }] });
        return {
            bad: { roles: bad.roles, marks: bad.sections[0].marks, text: bad.sections[0].text },
            oldKeys: Object.keys(old), oldSec: 'marks' in old.sections[0], orphan: 'marks' in orphan.sections[0],
        };
    });
    expect(r.bad.roles).toEqual([{ id: 'ok', name: '甲', color: '#e05d5d' }]);
    expect(r.bad.marks).toEqual([mk(0, 3, 'ok')]);
    expect(r.bad.text).toBe('一二三');
    expect(r.oldKeys).not.toContain('roles');
    expect(r.oldSec).toBe(false);
    expect(r.orphan).toBe(false);
    expect(errors).toEqual([]);
    await context.close();
});

test('舊歌（沒有 roles）打字存檔後不會多出 roles／marks 欄位', async ({ browser }) => {
    const st = v2Storage([song('s1', [typed('sa', 'verse', '舊歌詞')])]);
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: st });
    await pick(page, 0, 0);
    await page.keyboard.insertText('新');
    await expect.poll(async () => (await activeSongRaw(page)).sections[0].text).toBe('新舊歌詞');
    const raw = await activeSongRaw(page);
    expect('roles' in raw).toBe(false);
    expect('marks' in raw.sections[0]).toBe(false);
    expect(errors).toEqual([]);
    await context.close();
});

// ==================== 鏡像層上色 ====================
const ALL_OFF = JSON.stringify({ end: false, letters: false, inner: false, strict: true, skipParticles: true });
const rlSpans = (page, k) => page.locator('.rhyme-mirror span.rl[data-rl="' + k + '"]').first();

test('鏡像層：角色範圍改字色、不畫底（rhyme 全關也有），預設模式下韻腳色塊照常', async ({ browser }) => {
    let r = await bootPage(browser, { wordlist: 'stub', storage: { ...withRoles(), 'lh:map': ALL_OFF } });
    await expect(r.page.locator('.lyrics-section').first()).toHaveClass(/rm-on/);
    await expect(r.page.locator('.lyrics-section').first()).toHaveClass(/rl-text/);
    await expect(rlSpans(r.page, 0)).toHaveText('我愛你');
    await expect(rlSpans(r.page, 1)).toHaveText('你愛我');
    const st = await rlSpans(r.page, 0).evaluate(e => ({ bg: getComputedStyle(e).backgroundColor, c: getComputedStyle(e).color, base: getComputedStyle(e.parentElement).color }));
    expect(st.bg).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);   // 底色留給韻腳地圖
    expect(st.c).not.toBe(st.base);                              // 字換成角色色
    // 輸入框自己的字變透明（看到的是鏡像層的彩色字）；打字中先退回輸入框的字
    const ta = r.page.locator('.lyrics-section').first().locator('.section-textarea');
    expect(await ta.evaluate(e => getComputedStyle(e).webkitTextFillColor)).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
    await r.page.evaluate(() => document.querySelector('.lyrics-section').classList.add('rl-typing'));
    expect(await ta.evaluate(e => getComputedStyle(e).webkitTextFillColor)).not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
    expect(r.errors).toEqual([]);
    await r.context.close();
    r = await bootPage(browser, { wordlist: 'stub', storage: withRoles() });
    await expect(rlSpans(r.page, 0)).toHaveText('我愛你');
    await expect(rlSpans(r.page, 1)).toHaveText('你愛我');
    expect(r.errors).toEqual([]);
    await r.context.close();
});

test('鏡像層：加了角色包裝後每個字的位置不變（誤差 ≤ 0.5px）', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: withRoles() });
    await expect(rlSpans(page, 1)).toHaveText('你愛我');
    const measure = () => page.evaluate(() => {
        const m = document.querySelector('.rhyme-mirror');
        const o = m.getBoundingClientRect();   // 量相對鏡像層左上角：頁面在量測之間整體位移不算
        const nodes = [];
        const w = document.createTreeWalker(m, NodeFilter.SHOW_TEXT);
        for (let n = w.nextNode(); n; n = w.nextNode()) nodes.push(n);
        const out = [];
        for (const n of nodes) for (let i = 0; i < n.length; i++) {
            if (n.data[i] === '\n' || n.data[i] === '​') continue;
            const r = document.createRange();
            r.setStart(n, i); r.setEnd(n, i + 1);
            const b = r.getBoundingClientRect();
            out.push([b.left - o.left, b.top - o.top, b.width, b.height]);
        }
        return { out, h: m.scrollHeight };
    });
    const withMarks = await measure();
    await page.evaluate(() => {
        const sec = curSong().sections[0];
        lhSecSetMarks(sec, null);
        lhMapPaint(document.querySelector('.lyrics-section'));
    });
    await expect(page.locator('.lyrics-section').first().locator('.rhyme-mirror span.rl')).toHaveCount(0);
    const without = await measure();
    expect(withMarks.out.length).toBe(without.out.length);
    expect(withMarks.h).toBe(without.h);
    withMarks.out.forEach((b, i) => b.forEach((v, k) => expect(Math.abs(v - without.out[i][k]), `字 ${i} 的值 ${k}`).toBeLessThanOrEqual(0.5)));
    expect(errors).toEqual([]);
    await context.close();
});

for (const theme of ['plain', 'moon', 'city', 'midnight']) {
    test('鏡像層：' + theme + ' 主題 8 個預設角色色的字對比 ≥ 4.5', async ({ browser }) => {
        const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: { ...withRoles(), hoyun_theme_mode: theme } });
        await expect(rlSpans(page, 0)).toBeVisible();
        const r = await page.evaluate(() => {
            // color-mix 算出來是 color(srgb 0–1 …)，一般顏色是 rgb(0–255 …)
            const rgb = s => { const v = s.match(/[\d.]+/g).slice(0, 3).map(Number); return s.startsWith('color(') ? v.map(x => x * 255) : v; };
            const lum = c => { const [r, g, b] = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
            const span = document.querySelector('.rhyme-mirror span.rl');
            const bg = rgb(getComputedStyle(document.querySelector('.lyrics-section .section-body')).backgroundColor);
            const worst = LH_ROLE_COLORS.map(hex => {
                document.documentElement.style.setProperty('--rl' + span.dataset.rl, hex);
                const fg = rgb(getComputedStyle(span).color);
                const l1 = lum(fg), l2 = lum(bg);
                return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
            });
            return Math.min(...worst);
        });
        expect(r).toBeGreaterThanOrEqual(4.5);
        expect(errors).toEqual([]);
        await context.close();
    });
}

// ==================== 選字浮動列「指定角色 ▸」 ====================
const BAR = '#rhymeSelBar', MENU = '#roleSelMenu';
// 鍵盤選取（Shift+←）走 400ms 計時：選到 [a, b)
const kbSelect = async (page, a, b, n = 0) => {
    await pick(page, b, b, n);
    for (let i = 0; i < b - a; i++) await page.keyboard.press('Shift+ArrowLeft');
};
const plain = () => v2Storage([song('s1', [typed('sa', 'verse', '我愛你你愛我')])]);

for (const touch of [false, true]) {
    test((touch ? '觸控' : '桌機') + '：浮動列指定角色 → 選單 → 指定 → 一步復原／重做', async ({ browser }) => {
        const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: withRoles(), device: touch ? { hasTouch: true, isMobile: false } : {} });
        const press = loc => touch ? loc.tap() : loc.click();
        await kbSelect(page, 1, 4);
        await expect(page.locator(BAR)).toBeVisible();
        const idx = await page.locator(BAR + ' button:visible').evaluateAll(bs => bs.map(b => b.className.match(/rm-bar-(\w+)/)?.[1]));
        expect(idx.indexOf('role')).toBeGreaterThan(-1);
        expect(idx.indexOf('role')).toBe(idx.indexOf('move') - 1);
        await expect(page.locator(BAR + ' .rm-bar-role')).toHaveText('指定角色 ▸');
        await press(page.locator(BAR + ' .rm-bar-role'));
        await expect(page.locator(BAR)).toBeHidden();
        await expect(page.locator(MENU)).toBeVisible();
        await expect(page.locator(MENU + ' .role-sel-item')).toHaveCount(2);
        await expect(page.locator(MENU + ' .role-sel-item .role-dot')).toHaveCount(2);
        await expect(page.locator(MENU + ' .role-sel-item').nth(1)).toContainText('女');
        await expect(page.locator(MENU + ' .role-sel-clear')).toHaveText('清除角色');
        await expect(page.locator(MENU + ' .role-sel-new')).toHaveText('＋ 新角色');
        await press(page.locator(MENU + ' .role-sel-item').nth(1));
        await expect(page.locator(MENU)).toBeHidden();
        const want = [mk(0, 1, 'r-m'), mk(1, 6, 'r-f')];
        expect(await marksOf(page)).toEqual(want);
        await expect.poll(() => storedMarks(page)).toEqual(want);
        await page.keyboard.press('ControlOrMeta+z');
        expect(await marksOf(page)).toEqual([mk(0, 3, 'r-m'), mk(3, 6, 'r-f')]);
        await page.keyboard.press('ControlOrMeta+Shift+z');
        expect(await marksOf(page)).toEqual(want);
        expect(errors).toEqual([]);
        await context.close();
    });
}

test('沒有角色：選單只有「＋ 新角色」，建立後依序取預設色並標上', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: plain() });
    await kbSelect(page, 1, 4);
    await page.locator(BAR + ' .rm-bar-role').click();
    await expect(page.locator(MENU + ' .role-sel-item')).toHaveCount(0);
    await expect(page.locator(MENU + ' .role-sel-clear')).toHaveCount(0);
    await page.locator(MENU + ' .role-sel-new').click();
    // 選單原地換成小表單（名稱＋顏色）：不填直接確定＝預設名稱與第一個沒用過的顏色
    await expect(page.locator(MENU + ' .role-new-name')).toBeFocused();
    await page.locator(MENU + ' .role-new-ok').click();
    let song1 = await page.evaluate(() => ({ roles: curSong().roles, marks: curSong().sections[0].marks }));
    expect(song1.roles.length).toBe(1);
    expect(song1.roles[0].name).toBe('角色 1');
    expect(song1.roles[0].color).toBe('#e05d5d');
    expect(song1.marks).toEqual([mk(1, 4, song1.roles[0].id)]);
    await expect.poll(async () => ((await activeSongRaw(page)).roles || []).length).toBe(1);
    await expect(rlSpans(page, 0)).toHaveText('愛你你');
    // 再選另一段字，建第二個角色
    await kbSelect(page, 4, 6);
    await page.locator(BAR + ' .rm-bar-role').click();
    await expect(page.locator(MENU + ' .role-sel-item')).toHaveCount(1);
    await page.locator(MENU + ' .role-sel-new').click();
    // 這次直接取名、挑顏色，按 Enter 確定
    await page.locator(MENU + ' .role-new-name').fill('女聲');
    await page.locator(MENU + ' .role-new-sw[data-hex="#48a868"]').click();
    await page.locator(MENU + ' .role-new-name').press('Enter');
    const roles = await page.evaluate(() => curSong().roles);
    expect(roles.map(r => r.color)).toEqual(['#e05d5d', '#48a868']);
    expect(roles[1].name).toBe('女聲');
    expect(await page.evaluate(() => curSong().sections[0].marks.length)).toBe(2);
    expect(errors).toEqual([]);
    await context.close();
});

test('滿 8 個角色：「＋ 新角色」停用並提示，不新增', async ({ browser }) => {
    const roles = Array.from({ length: 8 }, (_, i) => ({ id: 'r' + i, name: '角' + i, color: '#112233' }));
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: v2Storage([song('s1', [typed('sa', 'verse', '我愛你你愛我')], { roles })]) });
    await kbSelect(page, 1, 4);
    await page.locator(BAR + ' .rm-bar-role').click();
    await expect(page.locator(MENU + ' .role-sel-new')).toHaveAttribute('aria-disabled', 'true');
    await page.locator(MENU + ' .role-sel-new').click({ force: true });   // aria-disabled：Playwright 預設不點，真人還是點得到
    await expect(page.locator('#copyToast')).toHaveText('最多 8 個角色');
    expect(await page.evaluate(() => curSong().roles.length)).toBe(8);
    expect(await marksOf(page)).toBe(null);
    expect(errors).toEqual([]);
    await context.close();
});

test('清除角色：範圍內的標記拿掉，一步復原', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: withRoles() });
    await kbSelect(page, 1, 5);
    await page.locator(BAR + ' .rm-bar-role').click();
    await page.locator(MENU + ' .role-sel-clear').click();
    expect(await marksOf(page)).toEqual([mk(0, 1, 'r-m'), mk(5, 6, 'r-f')]);
    await page.keyboard.press('ControlOrMeta+z');
    expect(await marksOf(page)).toEqual([mk(0, 3, 'r-m'), mk(3, 6, 'r-f')]);
    expect(errors).toEqual([]);
    await context.close();
});

test('Esc 與點外面都會收起角色選單', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: withRoles() });
    await kbSelect(page, 1, 4);
    await page.locator(BAR + ' .rm-bar-role').click();
    await expect(page.locator(MENU)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator(MENU)).toBeHidden();
    await kbSelect(page, 1, 4);
    await page.locator(BAR + ' .rm-bar-role').click();
    await expect(page.locator(MENU)).toBeVisible();
    await page.mouse.click(5, 5);
    await expect(page.locator(MENU)).toBeHidden();
    expect(await marksOf(page)).toEqual([mk(0, 3, 'r-m'), mk(3, 6, 'r-f')]);
    expect(errors).toEqual([]);
    await context.close();
});

// ==================== Part B：匯出與列印的角色標籤 ====================
const STUB_PRINT = () => { window.__printCount = 0; window.print = () => { window.__printCount++; }; };

test('匯出：TXT／Markdown 在角色轉換處加「[角色名]」', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: withRoles() });
    expect(await page.evaluate(() => songToTxt(curSong()))).toBe('測試歌\n\n[Verse]\n[男]我愛你[女]你愛我\n\n[Chorus]\n愛[男]愛\n\n[Bridge]\n[男]愛[女]愛愛\n');
    expect(await page.evaluate(() => songToMd(curSong()))).toContain('## Verse\n\n[男]我愛你[女]你愛我');
    expect(errors).toEqual([]);
    await context.close();
});

test('匯出：沒有標記的歌逐字不變', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: plain() });
    expect(await page.evaluate(() => songToTxt(curSong()))).toBe('測試歌\n\n[Verse]\n我愛你你愛我\n');
    expect(errors).toEqual([]);
    await context.close();
});

test('匯出：舊的並排欄段落照舊「【男】…【女】…」，不加 [角色名]', async ({ browser }) => {
    const st = v2Storage([song('s1', [typed('sa', 'verse', '我在這裡', { role: '男', cols: [{ name: '女', text: '你在那裡' }], marks: [mk(0, 2, 'r-m')] })], { roles: ROLES })]);
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: st });
    expect(await page.evaluate(() => songExportSections(curSong())[0].text)).toBe('【男】我在這裡\n【女】你在那裡');
    expect(errors).toEqual([]);
    await context.close();
});

test('列印：角色文字 span.print-role、標籤粗體 span.print-role-tag，顏色是調深的角色色', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: withRoles(), init: STUB_PRINT });
    await page.evaluate(() => exportSongAs('pdf'));
    await page.emulateMedia({ media: 'print' });
    const sec = page.locator('#printSheet .print-section').first();
    await expect(sec.locator('.print-text')).toHaveText('[男]我愛你[女]你愛我');
    expect(await sec.locator('.print-role-tag').allTextContents()).toEqual(['[男]', '[女]']);
    expect(await sec.locator('.print-role').allTextContents()).toEqual(['我愛你', '你愛我']);
    const r = await sec.evaluate(el => {
        const css = e => getComputedStyle(e);
        return {
            weights: [...el.querySelectorAll('.print-role-tag')].map(e => css(e).fontWeight),
            vars: [...el.querySelectorAll('.print-role')].map(e => css(e).getPropertyValue('--rl-c').trim()),
            colors: [...el.querySelectorAll('.print-role')].map(e => css(e).color),
            h1: css(document.querySelector('#printSheet h1')).color,
            h2: css(el.querySelector('h2')).color,
        };
    });
    expect(r.weights).toEqual(['700', '700']);
    expect(r.vars).toEqual(['#4a7fd4', '#e05d5d']);
    for (const c of r.colors) expect(c).not.toBe('rgb(0, 0, 0)');
    expect(r.h1).toBe('rgb(0, 0, 0)');
    expect(r.h2).toBe('rgb(0, 0, 0)');
    expect(errors).toEqual([]);
    await context.close();
});

test('列印：8 個預設角色色在白紙上對比都 ≥ 4.5', async ({ browser }) => {
    const roles = Array.from({ length: 8 }, (_, i) => ({ id: 'q' + i, name: '角' + i, color: ['#e05d5d', '#4a7fd4', '#48a868', '#e98a3c', '#8d6bd0', '#2c9fa0', '#d2649a', '#d69e2e'][i] }));
    const st = v2Storage([song('s1', [typed('sa', 'verse', '一二三四五六七八', { marks: roles.map((r, i) => mk(i, i + 1, r.id)) })], { roles })]);
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: st, init: STUB_PRINT });
    await page.evaluate(() => exportSongAs('pdf'));
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('#printSheet .print-role')).toHaveCount(8);
    const ratios = await page.evaluate(() => {
        const lin = v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
        const lum = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
        const parse = s => {
            const n = s.match(/-?[\d.]+/g).map(Number);
            return s.startsWith('color(') ? n.slice(0, 3) : n.slice(0, 3).map(v => v / 255);   // color(srgb 0-1) 或 rgb(0-255)
        };
        return [...document.querySelectorAll('#printSheet .print-role')].map(e => 1.05 / (lum(parse(getComputedStyle(e).color)) + 0.05));
    });
    expect(ratios.length).toBe(8);
    for (const x of ratios) expect(x).toBeGreaterThanOrEqual(4.5);
    expect(errors).toEqual([]);
    await context.close();
});

test('列印：沒有角色的歌不產生 span', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: plain(), init: STUB_PRINT });
    await page.evaluate(() => exportSongAs('pdf'));
    await expect(page.locator('#printSheet .print-text')).toHaveText('我愛你你愛我');
    expect(await page.locator('#printSheet span').count()).toBe(0);
    expect(errors).toEqual([]);
    await context.close();
});

// ==================== Part B：工具列「角色 ▾」管理面板 ====================
const BTN = '#roleMenuBtn', PANEL = '#roleMenu';
const eight = () => Array.from({ length: 8 }, (_, i) => ({ id: 'r' + i, name: '角' + i, color: ['#e05d5d', '#4a7fd4', '#48a868', '#e98a3c', '#8d6bd0', '#2c9fa0', '#d2649a', '#d69e2e'][i] }));
const eightStorage = () => v2Storage([song('s1', [typed('sa', 'verse', '我愛你你愛我')], { roles: eight() })]);
const rows = page => page.locator(PANEL + ' .role-row');
const open = async page => { await page.locator(BTN).click(); await expect(page.locator(PANEL)).toBeVisible(); };

test('面板：工具列順序與按鈕屬性', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: withRoles() });
    expect(await page.evaluate(() => [...document.querySelector('.lyrics-tools').children].map(n => n.id || n.className))).toEqual(['undo-group', 'rhymeMenuBtn', 'roleMenuBtn', 'songTotal', 'canvasTools']);
    const b = page.locator(BTN);
    await expect(b).toHaveText('角色 ▾');
    await expect(b).toHaveAttribute('aria-haspopup', 'dialog');
    await expect(b).toHaveAttribute('aria-controls', 'roleMenu');
    await expect(b).toHaveAttribute('aria-expanded', 'false');
    await expect(b).toHaveAttribute('aria-label', '角色設定（對唱、音樂劇）');
    expect(errors).toEqual([]);
    await context.close();
});

test('面板：打開列出角色、色票、自訂色', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: withRoles() });
    await open(page);
    await expect(page.locator(PANEL)).toHaveAttribute('role', 'dialog');
    await expect(page.locator(BTN)).toHaveAttribute('aria-expanded', 'true');
    await expect(rows(page)).toHaveCount(2);
    await expect(rows(page).nth(0).locator('input.role-name')).toHaveValue('男');
    await expect(rows(page).nth(1).locator('input.role-name')).toHaveValue('女');
    for (let k = 0; k < 2; k++) {
        const row = rows(page).nth(k);
        await expect(row.locator('.role-dot')).toHaveCount(1);
        await expect(row.locator('.swatch')).toHaveCount(8);
        await expect(row.locator('input.role-color[type=color]')).toHaveCount(1);
        await expect(row.locator('.swatch[aria-pressed="true"]')).toHaveCount(ROLES[k].color === '#4a7fd4' || ROLES[k].color === '#e05d5d' ? 1 : 0);
        await expect(row.locator('.swatch[aria-pressed="true"]')).toHaveAttribute('data-hex', ROLES[k].color);
    }
    expect(errors).toEqual([]);
    await context.close();
});

test('面板：沒有角色時有提示，新增建立「角色 1」並預設色', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: plain() });
    await open(page);
    await expect(page.locator(PANEL)).toContainText('還沒有角色。反白歌詞後按「指定角色 ▸」，或按下面新增。');
    await expect(rows(page)).toHaveCount(0);
    await page.locator(PANEL + ' .role-add').click();
    await expect(rows(page)).toHaveCount(1);
    await expect(page.locator(PANEL + ' input.role-name')).toHaveValue('角色 1');
    await expect(page.locator(PANEL + ' input.role-name')).toBeFocused();
    expect(await page.evaluate(() => curSong().roles[0].color === LH_ROLE_COLORS[0])).toBe(true);
    await expect.poll(async () => ((await activeSongRaw(page)).roles || []).length).toBe(1);
    expect(errors).toEqual([]);
    await context.close();
});

test('面板：改名即時存檔，清空離開變回「角色 n」', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: withRoles() });
    await open(page);
    const inp = page.locator(PANEL + ' input.role-name').first();
    await inp.fill('阿明');
    expect(await page.evaluate(() => curSong().roles[0].name)).toBe('阿明');
    await expect.poll(async () => (await activeSongRaw(page)).roles[0].name).toBe('阿明');
    await inp.fill('');
    await page.keyboard.press('Tab');
    await expect(inp).toHaveValue('角色 1');
    expect(await page.evaluate(() => curSong().roles[0].name)).toBe('角色 1');
    expect(errors).toEqual([]);
    await context.close();
});

test('面板：色票改色立刻反映在鏡像層與變數，並存檔', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: withRoles() });
    const span = rlSpans(page, 1);
    await expect(span).toBeVisible();
    const before = await span.evaluate(e => getComputedStyle(e).color);
    await open(page);
    await rows(page).nth(1).locator('.swatch[data-hex="#48a868"]').click();
    expect(await page.evaluate(() => curSong().roles[1].color)).toBe('#48a868');
    expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--rl1'))).toBe('#48a868');
    expect(await span.evaluate(e => getComputedStyle(e).color)).not.toBe(before);
    await expect(rows(page).nth(1).locator('.swatch[aria-pressed="true"]')).toHaveAttribute('data-hex', '#48a868');
    await expect.poll(async () => (await activeSongRaw(page)).roles[1].color).toBe('#48a868');
    expect(errors).toEqual([]);
    await context.close();
});

test('面板：自訂色（色彩輸入）改色', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: withRoles() });
    await open(page);
    await rows(page).nth(0).locator('input.role-color').fill('#123456');
    expect(await page.evaluate(() => curSong().roles[0].color)).toBe('#123456');
    expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--rl0'))).toBe('#123456');
    await expect.poll(async () => (await activeSongRaw(page)).roles[0].color).toBe('#123456');
    expect(errors).toEqual([]);
    await context.close();
});

test('面板：刪除要按兩下，清掉該角色標記，復原不會帶回', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: withRoles() });
    await open(page);
    const del = rows(page).nth(0).locator('.role-del');
    await del.click();
    await expect(del).toHaveText('確定刪除？');
    await expect(del).toHaveAttribute('data-armed', '1');
    expect(await page.evaluate(() => curSong().roles.length)).toBe(2);
    await del.click();
    expect(await page.evaluate(() => curSong().roles.map(r => r.id))).toEqual(['r-f']);
    expect(await marksOf(page, 0)).toEqual([mk(3, 6, 'r-f')]);
    expect(await marksOf(page, 1)).toBe(null);
    expect(await marksOf(page, 2)).toEqual([mk(1, 3, 'r-f')]);
    await expect.poll(() => storedMarks(page, 0)).toEqual([mk(3, 6, 'r-f')]);
    expect(await storedMarks(page, 1)).toBe(null);
    await expect(rlSpans(page, 0)).toHaveText('你愛我');
    await expect(page.locator('.rhyme-mirror span.rl[data-rl="1"]')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--rl0'))).toBe('#e05d5d');
    await expect(rows(page)).toHaveCount(1);
    expect(await page.evaluate(() => curSong().sections.map(s => s.text))).toEqual(['我愛你你愛我', '愛愛', '愛愛愛']);
    // 之後打字再復原，被刪角色的標記不會回來
    await pick(page, 0, 0);
    await page.keyboard.insertText('X');
    expect(await marksOf(page)).toEqual([mk(4, 7, 'r-f')]);
    await page.keyboard.press('ControlOrMeta+z');
    await expect(ta(page)).toHaveValue('我愛你你愛我');
    expect(await marksOf(page)).toEqual([mk(3, 6, 'r-f')]);
    expect(errors).toEqual([]);
    await context.close();
});

test('面板：刪除重做堆疊被清掉（刪除後不能重做出舊標記）', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: withRoles() });
    await pick(page, 0, 0);
    await page.keyboard.insertText('天');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(ta(page)).toHaveValue('我愛你你愛我');
    await open(page);
    const del = rows(page).nth(0).locator('.role-del');
    await del.click();
    await del.click();
    await page.evaluate(() => document.querySelector('.section-textarea').focus());
    await page.keyboard.press('ControlOrMeta+Shift+z');
    expect(await page.evaluate(() => curSong().sections.every(s => !(s.marks || []).some(m => m.r === 'r-m')))).toBe(true);
    expect(errors).toEqual([]);
    await context.close();
});

test('面板：刪除鈕 3 秒後自動還原', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: withRoles() });
    await open(page);
    const del = rows(page).nth(0).locator('.role-del');
    await del.click();
    await expect(del).toHaveText('確定刪除？');
    await expect.poll(() => del.textContent(), { timeout: 5000 }).toBe('刪除');
    expect(await page.evaluate(() => curSong().roles.length)).toBe(2);
    expect(errors).toEqual([]);
    await context.close();
});

test('面板：滿 8 個「＋ 新角色」停用並提示', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: eightStorage() });
    await open(page);
    const add = page.locator(PANEL + ' .role-add');
    await expect(add).toHaveAttribute('aria-disabled', 'true');
    await add.click({ force: true });
    await expect(page.locator('#copyToast')).toHaveText('最多 8 個角色');
    expect(await page.evaluate(() => curSong().roles.length)).toBe(8);
    expect(errors).toEqual([]);
    await context.close();
});

test('面板：Esc、點外面、再按按鈕都會收起', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: withRoles() });
    await open(page);
    await page.keyboard.press('Escape');
    await expect(page.locator(PANEL)).toBeHidden();
    await expect(page.locator(BTN)).toBeFocused();
    await expect(page.locator(BTN)).toHaveAttribute('aria-expanded', 'false');
    await open(page);
    await page.mouse.click(5, 5);
    await expect(page.locator(PANEL)).toBeHidden();
    await expect(page.locator(BTN)).toHaveAttribute('aria-expanded', 'false');
    await open(page);
    await page.locator(BTN).click();
    await expect(page.locator(PANEL)).toBeHidden();
    await expect(page.locator(BTN)).toHaveAttribute('aria-expanded', 'false');
    expect(errors).toEqual([]);
    await context.close();
});

test('面板：同時只開一個浮層（韻腳選單、角色面板互斥）', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: withRoles() });
    await open(page);
    await page.locator('#rhymeMenuBtn').click();
    await expect(page.locator('#rhymeMenu')).toBeVisible();
    await expect(page.locator(PANEL)).toBeHidden();
    await expect(page.locator(BTN)).toHaveAttribute('aria-expanded', 'false');
    await open(page);
    await expect(page.locator('#rhymeMenu')).toBeHidden();
    await expect(page.locator('#rhymeMenuBtn')).toHaveAttribute('aria-expanded', 'false');
    expect(errors).toEqual([]);
    await context.close();
});

test('面板（手機）：按鈕達觸控下限、工具列不溢出（含 150%）、8 個角色整個在畫面內可捲動', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: eightStorage(), device: DEVICES.phone });
    const overflow = () => page.evaluate(() => { const t = document.querySelector('.lyrics-tools'); return t.scrollWidth - t.clientWidth; });
    await setScale(page, 150);   // 縮放鈕在搜尋分頁，要先放大再切到歌詞
    await page.evaluate(() => mobileTab('lyrics'));
    await expect(page.locator(BTN)).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(1);
    await page.evaluate(() => mobileTab('search'));
    await setScale(page, 100);
    await page.evaluate(() => mobileTab('lyrics'));
    const btn = page.locator(BTN);
    await expect(btn).toBeVisible();
    const bb = await btn.boundingBox(), rb = await page.locator('#rhymeMenuBtn').boundingBox();
    const hit = await hitMin(page);   // 專案的觸控下限（--hit：手機 36、平板 32；Andy 決定 44 太佔空間），跟「韻腳 ▾」同一條規則
    expect(meetsHit(bb.width, bb.height, hit, hit), '角色 ▾ 觸控尺寸 ' + JSON.stringify(bb)).toBe(true);
    expect(rectsOverlap(bb, rb)).toBe(false);
    expect(await overflow()).toBeLessThanOrEqual(1);
    await btn.tap();
    await expect(page.locator(PANEL)).toBeVisible();
    await expectFullyInViewport(page, page.locator(PANEL));
    expect(await page.locator(PANEL).evaluate(e => e.scrollHeight > e.clientHeight)).toBe(true);
    const add = page.locator(PANEL + ' .role-add');
    await add.scrollIntoViewIfNeeded();
    await add.tap({ force: true });   // aria-disabled：Playwright 預設不點，真人點得到
    await expect(page.locator('#copyToast')).toHaveText('最多 8 個角色');
    expect(errors).toEqual([]);
    await context.close();
});

// 舊問題：指定角色 → 復原之後，在另一段選字，浮動列不出現（別段輸入框發出的 selectionchange 清掉了顯示計時器）
test('指定角色並復原之後，在另一段選字，浮動列照樣出現', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: withRoles() });
    await kbSelect(page, 1, 4);
    await expect(page.locator(BAR)).toBeVisible();
    await page.locator(BAR + ' .rm-bar-role').click();
    await page.locator(MENU + ' .role-sel-item').nth(1).click();
    await page.keyboard.press('ControlOrMeta+z');
    for (const n of [1, 2]) {
        await kbSelect(page, 0, 1, n);
        await expect(page.locator(BAR)).toBeVisible();
    }
    expect(errors).toEqual([]);
    await context.close();
});

// ===== 角色清單進復原歷史、搬字帶標記（quick 261114-1c6）=====
const rolesOf = page => page.evaluate(() => (curSong().roles || []).map(r => [r.id, r.name, r.color]));
const focusTa = page => page.evaluate(() => document.querySelector('.section-textarea').focus());
const undoKey = async page => { await focusTa(page); await page.keyboard.press('ControlOrMeta+z'); };
const redoKey = async page => { await focusTa(page); await page.keyboard.press('ControlOrMeta+Shift+z'); };

test('復原：刪除角色一步還原角色連同被清掉的標記，重做再刪掉', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: withRoles() });
    await open(page);
    const del = rows(page).nth(0).locator('.role-del');
    await del.click();
    await del.click();
    expect(await rolesOf(page)).toEqual([['r-f', '女', '#e05d5d']]);
    await undoKey(page);
    expect(await rolesOf(page)).toEqual([['r-m', '男', '#4a7fd4'], ['r-f', '女', '#e05d5d']]);
    expect(await marksOf(page, 0)).toEqual([mk(0, 3, 'r-m'), mk(3, 6, 'r-f')]);
    expect(await marksOf(page, 2)).toEqual([mk(0, 1, 'r-m'), mk(1, 3, 'r-f')]);
    await expect(rlSpans(page, 0)).toHaveText('我愛你');
    await redoKey(page);
    expect(await rolesOf(page)).toEqual([['r-f', '女', '#e05d5d']]);
    expect(await marksOf(page, 1)).toBe(null);
    expect(errors).toEqual([]);
    await context.close();
});

test('復原：刪除之前的舊步驟不會留下隱形標記（連角色一起回來）', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: withRoles() });
    await pick(page, 0, 0);
    await page.keyboard.insertText('天');
    await open(page);
    const del = rows(page).nth(0).locator('.role-del');
    await del.click();
    await del.click();
    await undoKey(page);   // 還原刪除
    await undoKey(page);   // 還原打字
    await expect(ta(page)).toHaveValue('我愛你你愛我');
    expect(await rolesOf(page)).toHaveLength(2);
    expect(await marksOf(page)).toEqual([mk(0, 3, 'r-m'), mk(3, 6, 'r-f')]);
    expect(await page.evaluate(() => curSong().sections.every(s => (s.marks || []).every(m => (curSong().roles || []).some(r => r.id === m.r))))).toBe(true);
    expect(errors).toEqual([]);
    await context.close();
});

test('復原：新增、改名、改色各算一步，可復原也可重做', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: withRoles() });
    await open(page);
    await page.locator(PANEL + ' .role-add').click();
    expect(await rolesOf(page)).toHaveLength(3);
    const name = rows(page).nth(0).locator('.role-name');
    await name.fill('主唱');
    await name.blur();
    expect((await rolesOf(page))[0][1]).toBe('主唱');
    await rows(page).nth(0).locator('.swatch').nth(2).click();
    const color = (await rolesOf(page))[0][2];
    expect(color).not.toBe('#4a7fd4');
    await undoKey(page);
    expect((await rolesOf(page))[0][2]).toBe('#4a7fd4');
    await undoKey(page);
    expect((await rolesOf(page))[0][1]).toBe('男');
    await undoKey(page);
    expect(await rolesOf(page)).toHaveLength(2);
    await redoKey(page); await redoKey(page); await redoKey(page);
    expect((await rolesOf(page))[0]).toEqual(['r-m', '主唱', color]);
    expect(await rolesOf(page)).toHaveLength(3);
    // 歷史沒有被重置：再復原到底還是一步一步退
    await undoKey(page);
    expect((await rolesOf(page))[0][2]).toBe('#4a7fd4');
    expect(errors).toEqual([]);
    await context.close();
});

test('移到段落：搬走的字帶著角色標記（接在最後面與新段落），來源剩下的標記平移，一步復原', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: withRoles() });
    // 搬「你你愛」(2..5)：男的最後 1 字 + 女前 2 字；目標 sb「愛愛」(男在 1..2) 接在最後面
    await page.evaluate(() => lhSecMoveText('sa', 2, 5, '你你愛', 'sb'));
    expect(await page.evaluate(() => curSong().sections.map(s => s.text))).toEqual(['我愛我', '愛愛\n你你愛', '愛愛愛']);
    expect(await marksOf(page, 0)).toEqual([mk(0, 2, 'r-m'), mk(2, 3, 'r-f')]);
    expect(await marksOf(page, 1)).toEqual([mk(1, 2, 'r-m'), mk(3, 4, 'r-m'), mk(4, 6, 'r-f')]);
    await undoKey(page);
    expect(await page.evaluate(() => curSong().sections.map(s => s.text))).toEqual(['我愛你你愛我', '愛愛', '愛愛愛']);
    expect(await marksOf(page, 0)).toEqual([mk(0, 3, 'r-m'), mk(3, 6, 'r-f')]);
    expect(await marksOf(page, 1)).toEqual([mk(1, 2, 'r-m')]);
    // 新段落：頭尾的換行不帶走，標記從修剪後的位置算
    await page.evaluate(() => { const x = curSong().sections[0]; x.text = '我\n愛你你愛'; x.marks = [{ a: 0, b: 3, r: 'r-m' }, { a: 3, b: 6, r: 'r-f' }]; });
    await page.evaluate(() => lhSecMoveText('sa', 1, 5, '\n愛你你', null));
    expect(await page.evaluate(() => curSong().sections[1].text)).toBe('愛你你');
    expect(await marksOf(page, 1)).toEqual([mk(0, 1, 'r-m'), mk(1, 3, 'r-f')]);
    expect(errors).toEqual([]);
    await context.close();
});
