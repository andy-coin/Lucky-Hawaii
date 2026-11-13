// 角色標記（對唱、音樂劇）Part A：資料模型與平移（瀏覽器）、鏡像上色、浮動列「指定角色 ▸」
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage, activeSongRaw, compose } from './helpers.mjs';

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

test('鏡像層：角色範圍畫成淡底（rhyme 全關也有），預設模式下韻腳色塊照常', async ({ browser }) => {
    let r = await bootPage(browser, { wordlist: 'stub', storage: { ...withRoles(), 'lh:map': ALL_OFF } });
    await expect(r.page.locator('.lyrics-section').first()).toHaveClass(/rm-on/);
    await expect(rlSpans(r.page, 0)).toHaveText('我愛你');
    await expect(rlSpans(r.page, 1)).toHaveText('你愛我');
    const bg = await rlSpans(r.page, 0).evaluate(e => getComputedStyle(e).backgroundColor);
    expect(bg).not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
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

for (const scheme of ['light', 'dark']) {
    test('鏡像層：' + scheme + ' 主題 8 個預設角色色的淡底上文字對比 ≥ 4.5', async ({ browser }) => {
        const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: scheme === 'dark' ? { ...withRoles(), hoyun_theme_mode: 'dark' } : withRoles(), colorScheme: scheme });
        await expect(rlSpans(page, 0)).toBeVisible();
        const r = await page.evaluate(() => {
            const rgb = s => s.match(/[\d.]+/g).slice(0, 3).map(Number);
            const lum = c => { const [r, g, b] = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
            const span = document.querySelector('.rhyme-mirror span.rl');
            const mix = parseFloat(getComputedStyle(span).getPropertyValue('--rl-mix') || '24') / 100;
            const mixPct = getComputedStyle(span).getPropertyValue('--rl-mix').trim();
            const sec = document.querySelector('.lyrics-section');
            const bg = rgb(getComputedStyle(sec.querySelector('.section-body')).backgroundColor);
            const fg = rgb(getComputedStyle(sec.querySelector('.section-textarea')).color);
            const worst = LH_ROLE_COLORS.map(hex => {
                const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
                const comp = c.map((v, i) => v * mix + bg[i] * (1 - mix));
                const l1 = lum(fg), l2 = lum(comp);
                return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
            });
            return { theme: document.documentElement.dataset.theme, mixPct, min: Math.min(...worst) };
        });
        expect(r.theme).toBe(scheme);
        expect(r.min).toBeGreaterThanOrEqual(4.5);
        expect(r.mixPct).toBe(scheme === 'dark' ? '36%' : '');
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
    const roles = await page.evaluate(() => curSong().roles);
    expect(roles.map(r => r.color)).toEqual(['#e05d5d', '#4a7fd4']);
    expect(roles[1].name).toBe('角色 2');
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
