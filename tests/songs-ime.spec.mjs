// 注音組字：組字中不存檔、組字確認後 400 毫秒內存進 lh:songs；一般打字 300 毫秒後才存一次（研究測試 R1）
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage, compose, activeSongRaw, STORAGE_SPY } from './helpers.mjs';

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/v096-localStorage.json', import.meta.url), 'utf8'));
const LYRIC_KEYS = ['lh:songs', 'haiku_lyrics', 'haiku_hashtags'];
// 不經過 flushSongs，直接看儲存裡現在是什麼
const rawFirstText = page => page.evaluate(() => {
    const songs = JSON.parse(localStorage.getItem('lh:songs'));
    return songs.find(s => s.id === localStorage.getItem('lh:activeSong')).sections[0].text;
});
const focusEnd = page => page.evaluate(() => {
    const ta = document.querySelector('.section-textarea');
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
});

test('組字：組字中不存檔，確認後 400 毫秒內存進 lh:songs', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: FIXTURE, init: STORAGE_SPY });
    await focusEnd(page);
    await page.evaluate(() => { window.__lsWrites.length = 0; });
    let during = -1;
    await compose(page, ['ㄋ', 'ㄋㄧ', 'ㄋㄧˇ'], '你', async () => {
        // 比 300 毫秒的存檔等待更久，確定「沒有存」不是因為還沒到時間
        await page.waitForTimeout(500);
        during = await page.evaluate(keys => window.__lsWrites.filter(w => keys.includes(w.k)).length, LYRIC_KEYS);
    });
    expect(during, '組字中沒有任何歌詞存檔').toBe(0);
    await page.waitForFunction(() => {
        const songs = JSON.parse(localStorage.getItem('lh:songs'));
        return songs.find(s => s.id === localStorage.getItem('lh:activeSong')).sections[0].text.endsWith('你');
    }, null, { timeout: 400 });
    expect((await rawFirstText(page)).endsWith('你')).toBe(true);
    expect(await page.locator('.section-textarea').first().inputValue()).toMatch(/你$/);
    expect(errors).toEqual([]);
    await context.close();
});

test('組字：一般打字 300 毫秒後才存一次', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: FIXTURE, init: STORAGE_SPY });
    await focusEnd(page);
    await page.evaluate(() => {
        window.__lsWrites.length = 0;
        document.addEventListener('input', () => { window.__lastInput = performance.now(); }, true);
    });
    await page.keyboard.type('abcde');
    await page.waitForTimeout(800);
    const got = await page.evaluate(() => ({ writes: window.__lsWrites.filter(w => w.k === 'lh:songs'), last: window.__lastInput }));
    expect(got.writes, '五個字只存一次').toHaveLength(1);
    expect(got.writes[0].t - got.last, '最後一個字之後至少等了 250 毫秒').toBeGreaterThanOrEqual(250);
    expect((await rawFirstText(page)).endsWith('abcde')).toBe(true);
    expect(errors).toEqual([]);
    await context.close();
});

// 組字中的 Enter 是「選字」，不是「送出」（研究測試 R4，F12）
const rawSong = page => page.evaluate(() => {
    const songs = JSON.parse(localStorage.getItem('lh:songs'));
    return songs.find(s => s.id === localStorage.getItem('lh:activeSong'));
});

test('組字：#標籤 輸入框組字中按 Enter 不送出', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: FIXTURE });
    const before = (await rawSong(page)).hashtags;
    await page.evaluate(() => openHashtagPopup());
    await expect(page.locator('#hashtagInput')).toBeFocused();
    await compose(page, ['ㄅ', 'ㄅㄚ'], '吧', async () => {
        await page.keyboard.press('Enter');
        expect((await activeSongRaw(page)).hashtags, '組字中按 Enter 沒有新增標籤').toEqual(before);
    });
    await expect(page.locator('#hashtagInput')).toHaveValue('吧');
    await page.keyboard.press('Enter');
    await expect(page.locator('#hashtagInput')).toHaveValue('');
    expect((await activeSongRaw(page)).hashtags).toEqual([...before, '吧']);
    expect(errors).toEqual([]);
    await context.close();
});

// 打字與組字完全不碰畫面結構：沒有節點被換掉、游標不跳（D-17）
// 鏡像層只是裝飾用的副本，這裡不看它；輸入框與面板結構仍然全部監看
const watchLeftPanel = page => page.evaluate(() => {
    window.__muts = [];
    window.__mo = new MutationObserver(list => { window.__muts.push(...list.filter(m => m.type === 'childList' && !(m.target.closest && m.target.closest('.rhyme-mirror')))); });
    window.__mo.observe(document.getElementById('leftPanel'), { childList: true, subtree: true });
});
const takeMuts = page => page.evaluate(() => { window.__muts.push(...window.__mo.takeRecords()); return window.__muts.length; });
const caretAtEnd = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); return e.selectionStart === e.value.length && e.selectionEnd === e.value.length; }, sel);

test('組字：不重畫也不跳游標', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: FIXTURE });
    // 升級那一次開機會有 6 秒的「歌詞已整理成第一首歌」提示；這個測試要看的是打字不會冒出提示，所以先收掉它
    await page.evaluate(() => document.getElementById('copyToast')?.classList.remove('show'));
    for (const sel of ['.section-textarea', '#contextDescription']) {
        await page.evaluate(s => {
            const el = document.querySelector(s);
            window.__ta = el;
            el.focus();
            el.setSelectionRange(el.value.length, el.value.length);
        }, sel);
        await watchLeftPanel(page);
        await page.keyboard.type('abcdefghij0123456789');
        expect(await caretAtEnd(page, sel), sel + ' 打字後游標在最後').toBe(true);
        for (const [steps, commit] of [[['ㄋ', 'ㄋㄧ', 'ㄋㄧˇ'], '你']]) {
            const cdp = await page.context().newCDPSession(page);
            for (const t of steps) {
                await cdp.send('Input.imeSetComposition', { text: t, selectionStart: t.length, selectionEnd: t.length });
                expect(await caretAtEnd(page, sel), sel + ' 組字中游標在最後').toBe(true);
            }
            await cdp.send('Input.insertText', { text: commit });
            await cdp.detach();
        }
        expect(await caretAtEnd(page, sel), sel + ' 確認後游標在最後').toBe(true);
        await page.waitForTimeout(500);   // 讓 300 毫秒的存檔也跑完，存檔不該動畫面
        expect(await takeMuts(page), sel + ' 沒有任何節點增減').toBe(0);
        expect(await page.evaluate(s => window.__ta === document.querySelector(s), sel), sel + ' 還是同一個節點').toBe(true);
        expect(await page.evaluate(() => document.activeElement === window.__ta)).toBe(true);
        await page.evaluate(() => window.__mo.disconnect());
    }
    // 沒有存檔提示、轉圈或提示訊息
    expect(await page.evaluate(() => document.getElementById('copyToast')?.classList.contains('show') ?? false)).toBe(false);
    expect(await page.locator('#leftPanel .spinner, #leftPanel [class*="saving"], #leftPanel [class*="loading"]').count()).toBe(0);
    expect(errors).toEqual([]);
    await context.close();
});

test('組字：關分頁不掉字', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: FIXTURE });
    await page.evaluate(() => {
        const ta = document.querySelector('.section-textarea');
        ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
    });
    await page.keyboard.type('關分頁前的最後一句');   // 不等 300 毫秒存檔，直接關
    await page.close({ runBeforeUnload: false });
    const sibling = await context.newPage();
    await sibling.goto('/index.html');
    const text = await sibling.evaluate(() => {
        const songs = JSON.parse(localStorage.getItem('lh:songs'));
        return songs.find(s => s.id === localStorage.getItem('lh:activeSong')).sections[0].text;
    });
    expect(text.endsWith('關分頁前的最後一句')).toBe(true);
    expect(errors).toEqual([]);
    await context.close();
});

test('組字：切到背景立刻存', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: FIXTURE });
    await page.evaluate(() => {
        const ta = document.querySelector('.section-textarea');
        ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
    });
    await page.keyboard.type('切背景');
    await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
    });
    // 不等 300 毫秒，立刻讀儲存
    expect((await rawFirstText(page)).endsWith('切背景')).toBe(true);
    expect(errors).toEqual([]);
    await context.close();
});

// ==================== 審查修正（WR-07）：已經排好的 300 毫秒計時器不能在組字中途寫檔 ====================
test('組字：先打一般字、馬上開始組字，計時器不在組字中途存檔', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: FIXTURE, init: STORAGE_SPY });
    await focusEnd(page);
    await page.evaluate(() => { window.__lsWrites.length = 0; });
    await page.keyboard.type('a');   // 排好 300 毫秒計時器
    let during = -1;
    let duringText = '';
    await compose(page, ['ㄋ', 'ㄋㄧ', 'ㄋㄧˇ'], '你', async () => {
        await page.waitForTimeout(600);   // 比計時器久
        during = await page.evaluate(keys => window.__lsWrites.filter(w => keys.includes(w.k)).length, LYRIC_KEYS);
        duringText = await rawFirstText(page);
    });
    expect(during, '組字中沒有任何歌詞存檔').toBe(0);
    expect(duringText.includes('ㄋㄧˇ'), '儲存裡沒有半成品').toBe(false);
    await page.waitForFunction(() => {
        const songs = JSON.parse(localStorage.getItem('lh:songs'));
        return songs.find(s => s.id === localStorage.getItem('lh:activeSong')).sections[0].text.endsWith('a你');
    }, null, { timeout: 600 });
    expect(errors).toEqual([]);
    await context.close();
});

test('組字：組字到一半切到背景仍然存檔（不掉字）', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: FIXTURE });
    await focusEnd(page);
    await page.keyboard.type('已打好的字');
    await compose(page, ['ㄋ', 'ㄋㄧ'], '你', async () => {
        await page.evaluate(() => {
            Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
            document.dispatchEvent(new Event('visibilitychange'));
        });
        expect((await rawFirstText(page)).includes('已打好的字'), '離開頁面時組字中也會把已打好的字存下來').toBe(true);
    });
    expect(errors).toEqual([]);
    await context.close();
});

// 自訂段落名稱在「段落設定」選單的輸入框：組字中的 Enter／Esc 是選字與取消組字，不是送出或關選單（UI-SPEC D-13）
test('組字：自訂名稱組字中按 Enter 不送出', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: FIXTURE });
    await page.locator('#lyricsSections .section-type').first().click({ button: 'right' });
    const menu = page.locator('#sectionMenu');
    await expect(menu).toBeVisible();
    await menu.getByRole('radio', { name: 'Custom', exact: true }).click();
    const input = menu.locator('input.section-name-input');
    await input.focus();
    const before = (await activeSongRaw(page)).sections[0].custom;
    await compose(page, ['ㄏ', 'ㄏㄡ'], '後', async () => {
        await page.keyboard.press('Enter');
        await page.keyboard.press('Escape');
        expect((await activeSongRaw(page)).sections[0].custom, '組字中按 Enter 沒有送出名稱').toBe(before);
        await expect(menu, '組字中按 Esc 沒有關選單').toBeVisible();
    });
    await page.keyboard.press('Enter');
    expect((await activeSongRaw(page)).sections[0].custom).toBe('後');
    expect(await page.locator('#lyricsSections .section-type').first().textContent()).toBe('後');
    expect(errors).toEqual([]);
    await context.close();
});
