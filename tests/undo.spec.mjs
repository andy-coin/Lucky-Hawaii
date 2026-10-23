// 復原／重做（第 9 階段，EDIT-03）：應用層快照堆疊，每首歌一條，只在記憶體
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage, activeSongRaw, compose, openTwoTabs } from './helpers.mjs';

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/v096-localStorage.json', import.meta.url), 'utf8'));
const v2Storage = (songs, active = songs[0]?.id) => ({
    ...FIXTURE, 'lh:schema': '2', 'lh:songs': JSON.stringify(songs), ...(active ? { 'lh:activeSong': active } : {}),
});
const typed = (id, type, text, extra = {}) => ({ id, type, custom: '', color: '', height: null, label: '', text, collapsed: false, ...extra });
const song = (id, sections, extra = {}) => ({ id, title: '測試歌', sections, hashtags: [], context: '', createdAt: 1, updatedAt: 1, ...extra });
const one = (text = '你好') => v2Storage([song('s1', [typed('sa', 'verse', text)])]);
const ta = (page, i = 0) => page.locator('#lyricsSections .section-textarea').nth(i);
const disabled = (page, id) => page.locator(id).getAttribute('aria-disabled');
const texts = page => page.evaluate(() => curSong().sections.map(s => s.text));
const storedTexts = async page => (await activeSongRaw(page)).sections.map(s => s.text);

test('復原：打字後按按鈕與快捷鍵', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: one() });
    expect(await disabled(page, '#undoBtn')).toBe('true');
    expect(await disabled(page, '#redoBtn')).toBe('true');
    await ta(page).focus();
    await page.keyboard.press('End');
    await page.keyboard.type('abc');
    expect(await disabled(page, '#undoBtn')).toBe('false');
    expect(await disabled(page, '#redoBtn')).toBe('true');
    await page.locator('#undoBtn').click();
    await expect(ta(page)).toHaveValue('你好');
    expect((await activeSongRaw(page)).sections[0].text, '復原後直接存檔').toBe('你好');
    await page.locator('#redoBtn').click();
    await expect(ta(page)).toHaveValue('你好abc');
    expect((await activeSongRaw(page)).sections[0].text).toBe('你好abc');
    await ta(page).focus();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(ta(page)).toHaveValue('你好');
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect(ta(page)).toHaveValue('你好abc');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(ta(page)).toHaveValue('你好');
    await page.keyboard.press('Control+y');
    await expect(ta(page)).toHaveValue('你好abc');
    expect(errors).toEqual([]);
    await context.close();
});

// 時鐘：開機時讓它自己走，開機完成後暫停在固定時刻，之後用 runFor 精準前進（打字停頓 1 秒的合併規則要靠它）
const withClock = { beforeGoto: ({ page }) => page.clock.install() };
const pauseClock = page => page.clock.pauseAt(new Date(Date.now() + 5000));
const hist = (page, id = 's1') => page.evaluate(i => { const h = _hists.get(i); return h ? { past: h.past.length, future: h.future.length } : null; }, id);
const two = () => v2Storage([song('s1', [typed('sa', 'verse', '一'), typed('sb', 'chorus', '二')])]);

test('復原：段落操作', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: one('一') });
    const labels = () => page.locator('#lyricsSections .section-type').evaluateAll(els => els.map(e => e.textContent));
    // 換類型
    await page.locator('.section-type').first().click();
    expect(await labels()).toEqual(['Pre-Chorus']);
    await page.locator('#undoBtn').click();
    expect(await labels()).toEqual(['Verse']);
    await page.locator('#redoBtn').click();
    expect(await labels()).toEqual(['Pre-Chorus']);
    await page.locator('#undoBtn').click();
    // 新增段落：復原後整段不見（重畫），重做回來是同一個 id
    await page.locator('.panel-add-btn').first().click();
    const ids = await page.evaluate(() => curSong().sections.map(s => s.id));
    expect(ids).toHaveLength(2);
    await page.locator('#undoBtn').click();
    await expect(page.locator('#lyricsSections .lyrics-section')).toHaveCount(1);
    await page.locator('#redoBtn').click();
    await expect(page.locator('#lyricsSections .lyrics-section')).toHaveCount(2);
    expect(await page.evaluate(() => curSong().sections.map(s => s.id))).toEqual(ids);
    expect(await page.evaluate(() => document.getElementById('lhLive').textContent)).toBe('已重做');
    expect(errors).toEqual([]);
    await context.close();
});

test('復原：連打合併', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: two(), ...withClock });
    await pauseClock(page);
    await ta(page, 0).focus();
    await page.keyboard.press('End');
    await page.keyboard.type('ab');
    await page.clock.runFor(500);
    await page.keyboard.type('c');
    expect((await hist(page)).past, '停頓不到 1 秒是同一步').toBe(1);
    await page.clock.runFor(1100);
    await page.keyboard.type('d');
    expect((await hist(page)).past, '停頓超過 1 秒另起一步').toBe(2);
    await ta(page, 1).focus();
    await page.keyboard.press('End');
    await page.keyboard.type('x');
    expect((await hist(page)).past, '換到另一段另起一步').toBe(3);
    await page.locator('#undoBtn').click();
    expect(await texts(page)).toEqual(['一abcd', '二']);
    await page.locator('#undoBtn').click();
    expect(await texts(page)).toEqual(['一abc', '二']);
    await page.locator('#undoBtn').click();
    expect(await texts(page)).toEqual(['一', '二']);
    expect(await disabled(page, '#undoBtn')).toBe('true');
    expect(errors).toEqual([]);
    await context.close();
});

test('復原：組字一個詞一步', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: one() });
    await ta(page).focus();
    await page.keyboard.press('End');
    await compose(page, ['ㄋ', 'ㄋㄧ', 'ㄋㄧˇ'], '你', async () => {
        expect(await hist(page), '組字中不記').toEqual({ past: 0, future: 0 });
    });
    await expect(ta(page)).toHaveValue('你好你');
    expect((await hist(page)).past, '一個詞一步').toBe(1);
    await page.keyboard.press('ControlOrMeta+z');
    await expect(ta(page)).toHaveValue('你好');
    expect(await disabled(page, '#undoBtn')).toBe('true');
    expect(errors).toEqual([]);
    await context.close();
});

// 瀏覽器自己的捲動動畫（打字、Home／End 把游標捲進視野）會在幾十毫秒後才收尾，量捲動位置前要等它停下來（真實時間，不受假時鐘影響）
async function scrollRest(list) {
    let last = -1;
    for (let still = 0; still < 3;) {
        await list.page().waitForTimeout(60);
        const now = await list.evaluate(l => l.scrollTop);
        still = now === last ? still + 1 : 0;
        last = now;
    }
}

test('復原：只換一格', async ({ browser }) => {
    const rows = Array.from({ length: 12 }, (_, i) => typed('s' + i, 'verse', '行\n行\n行\n行\n行\n行' + i));
    const { context, page, errors } = await bootPage(browser, { storage: v2Storage([song('s1', [typed('sa', 'verse', '一'), typed('sb', 'chorus', '二')]), song('s2', rows)]), ...withClock });
    await pauseClock(page);
    await page.addStyleTag({ content: '.lyrics-section { min-height: 20rem !important; flex: 0 0 auto !important; }' });   // 讓列表一定會捲動
    // 文字步驟：同一個輸入框節點，游標回到記下的位置
    await page.evaluate(() => { window.__ta = document.querySelectorAll('.section-textarea')[0]; });
    await ta(page, 0).focus();
    await page.keyboard.press('End');
    await page.keyboard.type('ab');
    await page.clock.runFor(1100);
    await ta(page, 0).evaluate(t => t.setSelectionRange(0, 0));   // 不用 Home 鍵：Mac 上 Home 是捲動不是移游標
    await page.keyboard.type('Z');
    await expect(ta(page, 0)).toHaveValue('Z一ab');
    await page.locator('#undoBtn').click();
    await expect(ta(page, 0)).toHaveValue('一ab');
    expect(await page.evaluate(() => window.__ta === document.querySelectorAll('.section-textarea')[0]), '同一個節點').toBe(true);
    expect(await ta(page, 0).evaluate(t => t.selectionStart), '游標在這一步開始的位置（不是上一步結束的位置）').toBe(0);
    await scrollRest(page.locator('#lyricsSections'));
    // 結構步驟：整個重畫，捲動位置不變，第一個變動的段落閃一下
    await page.evaluate(() => switchSong('s2'));
    const list = page.locator('#lyricsSections');
    await page.setViewportSize({ width: 1280, height: 600 });
    expect(await list.evaluate(l => l.scrollHeight > l.clientHeight), '列表要夠長才能量捲動').toBe(true);
    await page.locator('.section-type').nth(10).click();
    await scrollRest(list);
    const top = await list.evaluate(l => l.scrollTop);
    expect(top).toBeGreaterThan(0);
    await page.locator('#undoBtn').click();
    expect(await list.evaluate(l => l.scrollTop), '捲動位置不變').toBe(top);
    await expect(page.locator('.lyrics-section.sec-flash')).toHaveCount(1);
    expect(await page.locator('.lyrics-section.sec-flash').evaluate(e => e.dataset.id)).toBe('s10');
    await page.clock.runFor(800);
    await expect(page.locator('.lyrics-section.sec-flash')).toHaveCount(0);
    expect(errors).toEqual([]);
    await context.close();
});

test('復原：不動高度與收合', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: two() });
    await ta(page, 1).focus();
    await page.keyboard.type('x');
    // 收合與高度不進歷史：在模型裡改了之後，復原文字不能把它們還原
    await page.evaluate(() => { const s = curSong().sections; s[0].collapsed = true; s[0].height = 9; s[1].height = 11; });
    await page.locator('#undoBtn').click();
    expect(await texts(page)).toEqual(['一', '二']);
    expect(await page.evaluate(() => curSong().sections.map(s => [s.collapsed, s.height]))).toEqual([[true, 9], [false, 11]]);
    // 結構步驟也一樣
    await page.evaluate(() => lhSecApply('type', song => { song.sections[1].type = 'bridge'; }, { dom: 'render' }));
    await page.evaluate(() => { curSong().sections[0].height = 13; });
    await page.locator('#undoBtn').click();
    expect(await page.evaluate(() => curSong().sections.map(s => [s.type, s.collapsed, s.height]))).toEqual([['verse', true, 13], ['chorus', false, 11]]);
    expect(errors).toEqual([]);
    await context.close();
});

test('復原：一百步上限', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: one('t') });
    const r = await page.evaluate(() => {
        for (let i = 0; i < 101; i++) lhSecApply('x', song => { song.sections[0].text = 't' + i; });
        const past = _hists.get('s1').past.length;
        let n = 0;
        while (lhHistUndo()) n++;
        return { past, n, text: curSong().sections[0].text };
    });
    expect(r).toEqual({ past: 100, n: 100, text: 't0' });
    expect(errors).toEqual([]);
    await context.close();
});

test('復原：其他欄位用原生復原', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: one() });
    await page.evaluate(() => { document.addEventListener('keydown', e => { window.__dp = e.defaultPrevented; }); });
    await ta(page).focus();
    await page.keyboard.press('End');
    await page.keyboard.type('abc');
    await page.evaluate(() => openHashtagPopup());
    for (const sel of ['#searchInput', '#contextDescription', '#hashtagPopupInput']) {
        await page.locator(sel).focus();
        await page.keyboard.press('ControlOrMeta+z');
        expect(await page.evaluate(() => window.__dp), sel + ' 不攔').toBe(false);
    }
    expect(await texts(page)).toEqual(['你好abc']);
    expect((await hist(page)).past).toBe(1);
    // 反過來，歌詞輸入框裡的快捷鍵是被攔下的
    await ta(page).focus();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(ta(page)).toHaveValue('你好');   // 事件被攔下、走自己的堆疊（stopPropagation，冒泡階段的監聽收不到）
    expect(errors).toEqual([]);
    await context.close();
});

test('復原：選單復原也攔', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: one() });
    await ta(page).focus();
    await page.keyboard.press('End');
    await page.keyboard.type('abc');
    const fire = type => ta(page).evaluate((t, ty) => t.dispatchEvent(new InputEvent('beforeinput', { inputType: ty, cancelable: true, bubbles: true })), type);
    expect(await fire('historyUndo'), '被取消').toBe(false);
    await expect(ta(page)).toHaveValue('你好');
    expect(await fire('historyRedo')).toBe(false);
    await expect(ta(page)).toHaveValue('你好abc');
    expect(errors).toEqual([]);
    await context.close();
});

test('復原：每首歌各自一條', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: v2Storage([song('s1', [typed('sa', 'verse', 'A')], { createdAt: 2 }), song('s2', [typed('sb', 'verse', 'B')], { createdAt: 1 })], 's1') });
    await ta(page).focus();
    await page.keyboard.press('End');
    await page.keyboard.type('1');
    await page.evaluate(() => switchSong('s2'));
    expect(await disabled(page, '#undoBtn'), 'B 還沒改過').toBe('true');
    await ta(page).focus();
    await page.keyboard.press('End');
    await page.keyboard.type('2');
    await page.evaluate(() => switchSong('s1'));
    expect(await disabled(page, '#undoBtn'), 'A 的歷史還在').toBe('false');
    await page.locator('#undoBtn').click();
    await expect(ta(page)).toHaveValue('A');
    await page.evaluate(() => switchSong('s2'));
    expect(await disabled(page, '#undoBtn'), 'B 的歷史沒被動到').toBe('false');
    await page.locator('#undoBtn').click();
    await expect(ta(page)).toHaveValue('B');
    expect(errors).toEqual([]);
    await context.close();
});

test('復原：別的分頁改了就清空', async ({ browser }) => {
    const { context, pages: [a, b], errs } = await openTwoTabs(browser, v2Storage([song('s1', [typed('sa', 'verse', 'A')], { createdAt: 2 }), song('s2', [typed('sb', 'verse', 'B')], { createdAt: 1 })], 's1'));
    await ta(b).focus();
    await b.keyboard.press('End');
    await b.keyboard.type('1');
    await b.evaluate(() => switchSong('s2'));
    await ta(b).focus();
    await b.keyboard.press('End');
    await b.keyboard.type('2');
    await b.locator('#searchInput').focus();   // 離開編輯區，別頁的更新才會立刻套用
    await expect.poll(() => b.evaluate(() => curSong().sections[0].text)).toBe('B2');
    await ta(a).fill('A被別頁改了');
    await ta(a).blur();
    await expect.poll(() => b.evaluate(() => songs.find(s => s.id === 's1').sections[0].text), { timeout: 5000 }).toBe('A被別頁改了');
    expect(await disabled(b, '#undoBtn'), 'B 沒被別頁動過，歷史留著').toBe('false');
    await b.evaluate(() => switchSong('s1'));
    expect(await disabled(b, '#undoBtn'), 'A 被別頁改過，歷史清空').toBe('true');
    await b.evaluate(() => switchSong('s2'));
    expect(await disabled(b, '#undoBtn')).toBe('false');
    expect(errs.flatMap(e => e.errors)).toEqual([]);
    await context.close();
});

test('復原：罕用字游標', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: v2Storage([song('s1', [typed('sa', 'verse', 'a𠀀b'), typed('sb', 'chorus', 'z')])]) });
    await ta(page, 0).focus();
    await ta(page, 0).evaluate(t => t.setSelectionRange(3, 3));   // 𠀀 是 2 個 UTF-16 單位：游標在它後面是索引 3
    await page.keyboard.type('X');
    expect(await ta(page, 0).evaluate(t => t.selectionStart)).toBe(4);
    await ta(page, 1).focus();
    await page.keyboard.type('Y');
    await page.locator('#undoBtn').click();
    await page.locator('#undoBtn').click();
    await expect(ta(page, 0)).toHaveValue('a𠀀b');
    expect(await texts(page)).toEqual(['a𠀀b', 'z']);
    expect(await ta(page, 0).evaluate(t => t.selectionStart), '游標在改動開始的索引').toBe(3);
    await page.locator('#redoBtn').click();
    await expect(ta(page, 0)).toHaveValue('a𠀀Xb');
    expect(await ta(page, 0).evaluate(t => t.selectionStart), '記下的游標索引').toBe(4);
    expect(await ta(page, 0).evaluate(t => [...t.value].map(c => c.codePointAt(0).toString(16)).join())).toBe('61,20000,58,62');
    expect(errors).toEqual([]);
    await context.close();
});

test('復原：重新整理就清空', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: one() });
    const keys = () => page.evaluate(async () => ({ ls: Object.keys(localStorage).sort(), idb: (await indexedDB.databases()).map(d => d.name).sort() }));
    const before = await keys();
    await ta(page).focus();
    await page.keyboard.press('End');
    await page.keyboard.type('abc');
    await page.locator('#undoBtn').click();
    await page.locator('#redoBtn').click();
    await page.waitForTimeout(500);
    expect(await keys(), '歷史不寫進任何儲存').toEqual(before);
    expect(await disabled(page, '#undoBtn')).toBe('false');
    await page.reload();
    await page.evaluate(() => Promise.all([window.__hoyunReady, window.__hoyunSafetyReady, window.__hoyunSongsReady]));
    await expect(ta(page)).toHaveValue('你好abc');
    expect(await disabled(page, '#undoBtn')).toBe('true');
    expect(await disabled(page, '#redoBtn')).toBe('true');
    expect(errors).toEqual([]);
    await context.close();
});

test('復原：變灰不丟焦點', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: one() });
    await ta(page).focus();
    await page.keyboard.press('End');
    await page.keyboard.type('abc');
    for (let i = 0; i < 6 && await page.evaluate(() => document.activeElement.id) !== 'undoBtn'; i++) await page.keyboard.press('Shift+Tab');   // 用鍵盤往前找到 ↶
    expect(await page.evaluate(() => document.activeElement.id)).toBe('undoBtn');
    await page.keyboard.press('Enter');
    expect(await disabled(page, '#undoBtn')).toBe('true');
    expect(await page.evaluate(() => document.activeElement.id), '變灰了焦點還在').toBe('undoBtn');
    await page.keyboard.press('Enter');   // 變灰後再按什麼都不發生
    await expect(ta(page)).toHaveValue('你好');
    expect(await page.locator('#undoBtn').evaluate(b => b.hasAttribute('disabled')), '不用 disabled 屬性').toBe(false);
    expect(errors).toEqual([]);
    await context.close();
});

test('復原：按鈕不搶走輸入框焦點', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: one(), device: { viewport: { width: 1440, height: 900 } } });
    await ta(page).focus();
    await page.keyboard.press('End');
    await page.keyboard.type('abc');
    await page.locator('#undoBtn').click();
    await expect(ta(page)).toHaveValue('你好');
    expect(await page.evaluate(() => document.activeElement === document.querySelector('.section-textarea')), '焦點還在輸入框（手機鍵盤才不會收）').toBe(true);
    await page.locator('#redoBtn').click();
    expect(await page.evaluate(() => document.activeElement.classList.contains('section-textarea'))).toBe(true);
    expect(errors).toEqual([]);
    await context.close();
});

test('復原：讀屏提示', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: one() });
    const live = () => page.evaluate(() => document.getElementById('lhLive').textContent);
    expect(await page.locator('#lhLive').getAttribute('aria-live')).toBe('polite');
    await ta(page).focus();
    await page.keyboard.press('End');
    await page.keyboard.type('abc');
    await page.locator('#undoBtn').click();
    expect(await live()).toBe('已復原');
    await page.locator('#redoBtn').click();
    expect(await live()).toBe('已重做');
    expect(errors).toEqual([]);
    await context.close();
});

test('復原：按鈕說明', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: one() });
    expect(await page.locator('.undo-group').getAttribute('role')).toBe('group');
    expect(await page.locator('.undo-group').getAttribute('aria-label')).toBe('復原與重做');
    expect(await page.locator('#undoBtn').getAttribute('aria-label')).toBe('復原上一步');
    expect(await page.locator('#redoBtn').getAttribute('aria-label')).toBe('重做上一步');
    const mac = await page.evaluate(() => /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent));   // 斷言這台機器會走的那一邊
    expect(await page.locator('#undoBtn').getAttribute('title')).toBe(mac ? '復原（⌘Z）' : '復原（Ctrl+Z）');
    expect(await page.locator('#redoBtn').getAttribute('title')).toBe(mac ? '重做（⇧⌘Z）' : '重做（Ctrl+Shift+Z 或 Ctrl+Y）');
    // 桌機 2rem 方塊；觸控與窄螢幕 --hit
    const box = async () => page.locator('#undoBtn').evaluate(b => { const r = b.getBoundingClientRect(); return [r.width, r.height]; });
    expect(await box()).toEqual([32, 32]);
    expect(errors).toEqual([]);
    await context.close();
});

// 評審 CR-01：組字中按 ↶ 不能改輸入框（寫 .value 會砍掉組字、_lhComposing 卡在 true）
test('復原：組字中按按鈕不動輸入框', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: one() });
    await ta(page).focus();
    await page.keyboard.press('End');
    await page.keyboard.type('abc');
    await page.keyboard.press('End');
    let during = null;
    await compose(page, ['ㄋ', 'ㄋㄧ'], '你', async () => {
        await page.locator('#undoBtn').click();
        during = { value: await ta(page).inputValue(), past: (await hist(page)).past, composing: await page.evaluate(() => _lhComposing) };
    });
    expect(during.composing, '組字中旗標為真').toBe(true);
    expect(during.value, '組字中輸入框內容沒被覆蓋').toContain('ㄋㄧ');
    expect(during.past, '歷史沒動').toBe(1);
    await expect(ta(page)).toHaveValue('你好abc你');
    expect(await page.evaluate(() => _lhComposing), '組字結束旗標放掉').toBe(false);
    expect(errors).toEqual([]);
    await context.close();
});

// 評審 WR-01：段落設定選單的自訂名稱框按 Ctrl+Z 用原生復原（只退掉打的字），不能去復原歌詞歷史
test('復原：段落設定選單的名稱框不被攔', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: one() });
    await ta(page).focus();
    await page.keyboard.press('End');
    await page.keyboard.type('abc');
    await page.evaluate(() => lhSecOpenMenu(document.querySelector('.lyrics-section'), 200, 200, true));
    await page.locator('#sectionMenu .type-row[data-type="custom"]').click();
    const input = page.locator('#sectionMenu input.section-name-input');
    await input.focus();
    await page.keyboard.type('Hook');
    expect(await input.inputValue(), '名稱框真的有焦點、有字').toBe('Hook');
    const past = (await hist(page)).past;
    await page.keyboard.press('ControlOrMeta+z');
    await expect(input, '原生復原退掉打的字').toHaveValue('');
    expect((await hist(page)).past, '歌詞歷史沒動').toBe(past);
    expect(await page.evaluate(() => curSong().sections[0].type), '段落類型沒被復原').toBe('custom');
    expect(errors).toEqual([]);
    await context.close();
});

// 評審 WR-04：高度與收合只改模型、不更新歷史的「現在」；刪除段落再復原時要還原刪除前最後的高度與收合
test('復原：刪除段落後復原帶回最新的高度與收合', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: two() });
    await page.evaluate(() => { const a = curSong().sections[0]; a.height = 20; a.collapsed = true; });
    await page.evaluate(() => lhSecRemove('sa'));
    expect(await texts(page)).toEqual(['二']);
    await page.locator('#undoBtn').click();
    expect(await page.evaluate(() => curSong().sections.map(s => [s.text, s.height, s.collapsed]))).toEqual([['一', 20, true], ['二', null, false]]);
    // 重做再復原一次，也不能退回舊值
    await page.evaluate(() => { curSong().sections[0].height = 7; });
    await page.locator('#redoBtn').click();
    await page.locator('#undoBtn').click();
    expect(await page.evaluate(() => curSong().sections.map(s => s.height))).toEqual([7, null]);
    expect(errors).toEqual([]);
    await context.close();
});
