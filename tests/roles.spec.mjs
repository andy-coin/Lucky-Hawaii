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
