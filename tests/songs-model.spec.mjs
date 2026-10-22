// 歌詞以資料模型為準：畫面只是模型的顯示，打字只改記憶體裡的這首歌，畫面不會被讀回存檔
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage, activeSongRaw, flushAndReadActiveSong } from './helpers.mjs';

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/v096-localStorage.json', import.meta.url), 'utf8'));
const LEGACY = JSON.parse(FIXTURE.haiku_lyrics);
const noIdb = () => { Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true }); };
const dumpLS = page => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])));
const textareas = page => page.locator('#lyricsSections .section-textarea');
// 已經是資料版本 2 的設定檔：直接放一份 lh:songs
const v2Storage = (songs, active = songs[0]?.id) => ({
    ...FIXTURE, 'lh:schema': '2', 'lh:songs': JSON.stringify(songs), ...(active ? { 'lh:activeSong': active } : {}),
});
const song = (id, sections, extra = {}) => ({
    id, title: '測試歌', sections, hashtags: [], context: '', createdAt: 1, updatedAt: 1, ...extra,
});
const sec = (id, text, label = '', collapsed = false) => ({ id, label, text, collapsed });

test('資料為準：升級後顯示我的第一首歌', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: FIXTURE });
    await expect(textareas(page)).toHaveCount(3);
    // 舊歌的主歌／副歌／橋段在第 9 階段起顯示為推斷出的類型名稱
    const NAMES = ['Verse', 'Chorus', 'Bridge'];
    for (let i = 0; i < 3; i++) {
        expect(await textareas(page).nth(i).inputValue()).toBe(LEGACY[i].text);
        expect(await page.locator('.section-label').nth(i).inputValue()).toBe(NAMES[i]);
    }
    await expect(page.locator('#hashtagChips .hashtag-chip')).toHaveText(['#浪漫×', '#夏天×']);
    expect(await page.locator('#contextDescription').inputValue()).toBe('');
    expect((await activeSongRaw(page)).id).toBe('song-migrated');
    expect(errors).toEqual([]);
    await context.close();
});

test('資料為準：原樣顯示', async ({ browser }) => {
    const TEXT = '</textarea><img id=pwn>&amp;x';
    const LABEL = '<b>x</b>';
    const TAG = '<i id=pwn2>t</i>';
    const { context, page, errors } = await bootPage(browser, {
        storage: v2Storage([song('s1', [sec('a1', TEXT, LABEL)], { hashtags: [TAG] })]),
    });
    await expect(textareas(page)).toHaveCount(1);
    expect(await textareas(page).first().inputValue()).toBe(TEXT);
    expect(await page.locator('.section-label').first().inputValue()).toBe(LABEL);
    expect(await page.locator('#pwn, #pwn2').count(), '沒有被塞進頁面的元素').toBe(0);
    expect(await page.locator('#lyricsSections b, #hashtagChips i').count()).toBe(0);
    expect(await page.locator('#hashtagChips .hashtag-chip').first().textContent()).toBe('#' + TAG + '×');
    // 點 × 只移除這一個標籤
    await page.locator('#hashtagChips .chip-remove').first().click();
    expect((await activeSongRaw(page)).hashtags).toEqual([]);
    expect(errors).toEqual([]);
    await context.close();
});

test('資料為準：畫面被改動不會寫回', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: FIXTURE });
    const ta = textareas(page).first();
    await ta.fill('abc');
    await page.evaluate(() => { document.querySelector('.section-textarea').value = 'TAMPER'; });   // 不送 input 事件
    await page.locator('.section-label').first().dblclick();
    await page.locator('.section-label').first().blur();
    const s = await activeSongRaw(page);
    expect(s.sections[0].text).toBe('abc');
    expect(JSON.stringify(s)).not.toContain('TAMPER');
    // 匯出也是從模型來的
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('.save-load-btn').first().click()]);
    const body = readFileSync(await download.path(), 'utf8');
    expect(body).toContain('abc');
    expect(body).not.toContain('TAMPER');
    expect(JSON.stringify(await activeSongRaw(page))).not.toContain('TAMPER');
    expect(errors).toEqual([]);
    await context.close();
});

test('資料為準：用段落 id 對應', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        storage: v2Storage([song('s1', [sec('sa', '一', '甲'), sec('sb', '二', '乙'), sec('sc', '三', '丙')])]),
    });
    await expect(page.locator('#lyricsSections .lyrics-section')).toHaveCount(3);
    expect(await page.locator('#lyricsSections .lyrics-section').evaluateAll(els => els.map(e => e.dataset.id))).toEqual(['sa', 'sb', 'sc']);
    expect(await page.locator('#lyricsSections .lyrics-section').evaluateAll(els => els.map(e => e.dataset.index))).toEqual(['0', '1', '2']);
    // 刪掉第二段（有內容，確認框由 bootPage 自動按確定）
    await page.locator('.lyrics-section[data-index="1"] .section-remove').click();
    await expect(page.locator('#lyricsSections .lyrics-section')).toHaveCount(2);
    await textareas(page).nth(1).fill('三改');
    // 打字後 300 毫秒的存檔計時器：等它自己寫，不替它 flush
    await expect.poll(async () => (await activeSongRaw(page)).sections.map(x => [x.id, x.text])).toEqual([['sa', '一'], ['sc', '三改']]);
    const s = await activeSongRaw(page);
    // 不變的外觀契約
    expect(await page.locator('.section-textarea').first().getAttribute('placeholder')).toBe('在這裡輸入或貼上歌詞…');
    expect(await page.locator('.section-textarea').nth(1).getAttribute('placeholder')).toBe('在這裡輸入歌詞…');
    for (const cls of ['.lyrics-section-header', '.section-chevron', '.section-label', '.section-body']) {
        expect(await page.locator('#lyricsSections ' + cls).count(), cls).toBeGreaterThan(0);
    }
    // 新段落與沒取名的預設名稱
    await page.evaluate(() => addLyricsSection());
    // 甲、乙、丙都是自訂名稱，新段落依前一段（Custom）猜成 Verse
    expect(await page.locator('.section-label').last().inputValue()).toBe('Verse');
    expect(errors).toEqual([]);
    await context.close();
});

test('資料為準：預設段落名稱', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        storage: v2Storage([song('s1', [sec('sa', '一'), sec('sb', '二')])]),
    });
    expect(await page.locator('.section-label').evaluateAll(els => els.map(e => e.value))).toEqual(['Verse I', 'Verse II']);
    expect(errors).toEqual([]);
    await context.close();
});

test('資料為準：標籤與情境跟著這首歌存', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: FIXTURE });
    await page.evaluate(() => addHashtag('新標籤'));
    await page.locator('#contextDescription').fill('夜晚的海邊');
    await page.locator('#contextDescription').blur();
    const s = await activeSongRaw(page);
    expect(s.hashtags).toEqual(['浪漫', '夏天', '新標籤']);
    expect(s.context).toBe('夜晚的海邊');
    await page.reload();
    await page.evaluate(() => Promise.all([window.__hoyunReady, window.__hoyunSafetyReady, window.__hoyunSongsReady]));
    await expect(page.locator('#hashtagChips .hashtag-chip')).toHaveCount(3);
    expect(await page.locator('#contextDescription').inputValue()).toBe('夜晚的海邊');
    expect(errors).toEqual([]);
    await context.close();
});

test('資料為準：歌詞清空不會清掉標籤與情境', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        storage: v2Storage([song('s1', [sec('sa', '')], { hashtags: ['留著'], context: '我還在' })]),
    });
    await expect(page.locator('#hashtagChips .hashtag-chip')).toHaveCount(1);
    expect(await page.locator('#contextDescription').inputValue()).toBe('我還在');
    expect(errors).toEqual([]);
    await context.close();
});

test('資料為準：舊鍵不再寫入', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: FIXTURE });
    await textareas(page).first().fill('改了第一段');
    await page.evaluate(() => { addHashtag('多一個'); removeHashtag('浪漫'); });
    await page.evaluate(() => addLyricsSection());
    await textareas(page).last().fill('新段落的字');
    await page.locator('.lyrics-section-header').nth(1).click();   // 收合
    await page.locator('.lyrics-section[data-index="3"] .section-remove').click();   // 刪掉新段落
    const s = await flushAndReadActiveSong(page);   // 收尾：這個測試看的是舊鍵有沒有被寫，不是存檔時機
    expect(s.sections[0].text).toBe('改了第一段');
    expect(s.hashtags).toEqual(['夏天', '多一個']);
    expect(s.sections).toHaveLength(3);
    expect(s.sections[1].collapsed).toBe(true);
    const ls = await dumpLS(page);
    expect(ls.haiku_lyrics).toBe(FIXTURE.haiku_lyrics);
    expect(ls.haiku_hashtags).toBe(FIXTURE.haiku_hashtags);
    expect(errors).toEqual([]);
    await context.close();
});

test('資料為準：備份被擋住時維持舊版單首模式', async ({ browser }) => {
    const big = { ...FIXTURE, haiku_lyrics: JSON.stringify([{ label: '', text: 'x'.repeat(600000) }]) };
    const { context, page, errors } = await bootPage(browser, { storage: big, init: noIdb });
    await expect(page.locator('#lhSaveBanner')).toContainText('資料備份沒有存成功');
    expect((await textareas(page).first().inputValue()).length).toBe(600000);
    expect(await page.evaluate(() => localStorage.getItem('lh:schema'))).toBeNull();
    await page.evaluate(() => { const ta = document.querySelector('.section-textarea'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); });
    await page.keyboard.type('Z');
    await page.locator('#contextDescription').focus();   // focusout 立刻存
    const ls = await dumpLS(page);
    expect(JSON.parse(ls.haiku_lyrics)[0].text.endsWith('Z')).toBe(true);
    expect(ls['lh:songs']).toBeUndefined();
    await page.evaluate(() => addHashtag('舊版標籤'));
    expect(JSON.parse(await page.evaluate(() => localStorage.getItem('haiku_hashtags')))).toContain('舊版標籤');
    expect(await page.evaluate(() => localStorage.getItem('lh:songs'))).toBeNull();
    expect(errors).toEqual([]);
    await context.close();
});

for (const [name, raw, corrupt] of [['損毀', 'not json', true], ['空陣列', '[]', false]]) {
    test(`資料為準：lh:songs ${name}`, async ({ browser }) => {
        const { context, page, errors } = await bootPage(browser, { storage: { ...FIXTURE, 'lh:schema': '2', 'lh:songs': raw } });
        await expect(textareas(page)).toHaveCount(1);
        expect(await textareas(page).first().inputValue()).toBe('');
        const ls = await dumpLS(page);
        const songs = JSON.parse(ls['lh:songs']);
        expect(songs).toHaveLength(1);
        expect(songs[0].title).toBe('未命名歌曲 1');
        expect(ls['lh:activeSong']).toBe(songs[0].id);
        if (corrupt) expect(JSON.parse(ls['lh:corrupt:lh:songs']).raw).toBe(raw);
        expect(errors).toEqual([]);
        await context.close();
    });
}

test('資料為準：主控台不出現歌詞', async ({ browser }) => {
    const logs = [];
    const { context, page } = await bootPage(browser, {
        storage: { ...FIXTURE, 'lh:schema': '2', 'lh:songs': 'not json' },
        beforeGoto: async ({ page }) => { page.on('console', m => logs.push(m.text())); },
    });
    await textareas(page).first().fill('祕密的歌詞內容');
    await page.locator('#contextDescription').fill('祕密的情境');
    await page.evaluate(() => addHashtag('祕密標籤'));
    await flushAndReadActiveSong(page);   // 收尾：把等待中的修改寫出去，再看主控台
    expect(logs.length).toBeGreaterThan(0);
    for (const l of logs) {
        for (const secret of ['祕密', '夜色', '輕輕唱起', '一起走到天亮', '浪漫']) expect(l, '主控台訊息不可含歌詞內容').not.toContain(secret);
    }
    await context.close();
});

// 保留池與 #標籤 的字一律當文字顯示、複製、移除，不被當成 HTML 或程式（B3, F11）
test('資料為準：保留池的字原樣顯示', async ({ browser }) => {
    const IMG = '<img src=x onerror=window.__pwn=1>';
    const QUOTE = "a'b";
    const { context, page, errors } = await bootPage(browser, { storage: { ...FIXTURE, haiku_savedwords: JSON.stringify([IMG, QUOTE]) } });
    const chips = page.locator('#savedWordsContainer .word-chip');
    await expect(chips).toHaveCount(2);
    expect(await chips.evaluateAll(els => els.map(e => e.firstChild.textContent))).toEqual([IMG, QUOTE]);
    expect(await page.locator('#savedWordsContainer img').count(), '沒有 img 元素').toBe(0);
    expect(await page.evaluate(() => window.__pwn)).toBeUndefined();
    // 點詞：剪貼簿裡正好是那個字串
    await chips.nth(1).evaluate(e => e.click());
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(QUOTE);
    // × 只移除被點的那個詞
    await chips.nth(0).locator('.chip-remove').evaluate(e => e.click());
    await expect(chips).toHaveCount(1);
    expect(JSON.parse(await page.evaluate(() => localStorage.getItem('haiku_savedwords')))).toEqual([QUOTE]);
    await chips.nth(0).locator('.chip-remove').evaluate(e => e.click());
    expect(await page.locator('#savedWordsContainer').textContent()).toContain('點擊上方詞彙保留');
    expect(await page.evaluate(() => window.__pwn)).toBeUndefined();
    expect(errors).toEqual([]);
    await context.close();
});

test('資料為準：標籤原樣顯示', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        storage: v2Storage([song('s1', [sec('a1', '詞')], { hashtags: ['<b>t</b>', "a'b"] })]),
    });
    const chips = page.locator('#hashtagChips .hashtag-chip');
    await expect(chips).toHaveCount(2);
    expect(await chips.evaluateAll(els => els.map(e => e.textContent))).toEqual(['#<b>t</b>×', "#a'b×"]);
    expect(await page.locator('#hashtagChips b').count()).toBe(0);
    await chips.nth(1).locator('.chip-remove').evaluate(e => e.click());
    expect((await activeSongRaw(page)).hashtags).toEqual(['<b>t</b>']);
    await chips.nth(0).locator('.chip-remove').evaluate(e => e.click());
    expect((await activeSongRaw(page)).hashtags).toEqual([]);
    expect(errors).toEqual([]);
    await context.close();
});

test('資料為準：情境結果寫回原本那首歌', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        storage: v2Storage([
            song('s1', [sec('a1', '夜裡的風吹過窗邊，我想起你的笑')]),
            song('s2', [sec('b1', '另一首')]),
        ]),
    });
    let release;
    const gate = new Promise(r => { release = r; });
    await page.route('**/ai', async route => {
        await gate;
        await route.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify({ ok: true, text: '情境：海邊的夜晚\n標籤：海,夜', model: { id: 'm', label: 'M' }, tried: [] }),
        });
    });
    await page.evaluate(() => document.querySelector('.context-refresh-btn').click());
    // 等請求出去、還在等回覆時，使用者切到第二首
    await page.waitForFunction(() => document.querySelector('.context-refresh-btn').disabled);
    await page.evaluate(() => { activeSongId = 's2'; renderActiveSong(); });
    release();
    await page.waitForFunction(() => !document.querySelector('.context-refresh-btn').disabled);
    const got = await page.evaluate(() => { flushSongs(); return songs.map(s => ({ id: s.id, context: s.context, hashtags: s.hashtags })); });
    expect(got.find(s => s.id === 's1').context).toBe('海邊的夜晚');
    expect(got.find(s => s.id === 's2').context).toBe('');
    expect(await page.locator('#contextDescription').inputValue(), '畫面上是第二首，不被別首的結果蓋掉').toBe('');
    expect(errors).toEqual([]);
    await context.close();
});

// ==================== 審查修正（WR-05、WR-06） ====================
const gatedAi = async (page, text) => {
    let release;
    const gate = new Promise(r => { release = r; });
    await page.route('**/ai', async route => {
        await gate;
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, text, model: { id: 'm', label: 'M' }, tried: [] }) });
    });
    return release;
};

test('情境生成：等待期間整份歌曲被換成新物件，結果仍寫進存檔（WR-05）', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        storage: v2Storage([song('s1', [sec('a1', '夜裡的風吹過窗邊，我想起你的笑')])]),
    });
    const release = await gatedAi(page, '情境：海邊的夜晚\n標籤：海,夜');
    await page.evaluate(() => document.querySelector('.context-refresh-btn').click());
    await page.waitForFunction(() => document.querySelector('.context-refresh-btn').disabled);
    // 模擬別的分頁更新過：記憶體裡的 songs 換成從儲存重讀的新物件
    await page.evaluate(() => { songs = JSON.parse(localStorage.getItem('lh:songs')); });
    release();
    await page.waitForFunction(() => !document.querySelector('.context-refresh-btn').disabled);
    await expect(page.locator('#copyToast')).toHaveText('情境與標籤已更新 ✓');
    const stored = await page.evaluate(() => { flushSongs(); return JSON.parse(localStorage.getItem('lh:songs'))[0]; });
    expect(stored.context).toBe('海邊的夜晚');
    expect(stored.hashtags).toEqual(['海', '夜']);
    expect(await page.locator('#contextDescription').inputValue()).toBe('海邊的夜晚');
    expect(errors).toEqual([]);
    await context.close();
});

test('情境生成：等待期間這首歌被刪掉，不假裝成功（WR-05）', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        storage: v2Storage([song('s1', [sec('a1', '夜裡的風吹過窗邊，我想起你的笑')]), song('s2', [sec('b1', '另一首')], { createdAt: 2 })]),
    });
    const release = await gatedAi(page, '情境：海邊的夜晚\n標籤：海,夜');
    await page.evaluate(() => document.querySelector('.context-refresh-btn').click());
    await page.waitForFunction(() => document.querySelector('.context-refresh-btn').disabled);
    await page.evaluate(() => { songs = songs.filter(s => s.id !== 's1'); activeSongId = 's2'; renderActiveSong(); });
    release();
    await page.waitForFunction(() => !document.querySelector('.context-refresh-btn').disabled);
    await expect(page.locator('#copyToast')).toHaveText('這首歌已經不在了，結果沒有套用');
    expect(await page.evaluate(() => songs.find(s => s.id === 's2').context)).toBe('');
    expect(errors).toEqual([]);
    await context.close();
});

test('情境生成：換歌後不使用上一首歌選取的字（WR-06）', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        storage: v2Storage([song('s1', [sec('a1', '甲歌的歌詞')]), song('s2', [sec('b1', '乙歌的歌詞')], { createdAt: 2 })]),
    });
    await page.evaluate(() => { lastLyricsSelection = '甲歌選取的字'; });
    await page.evaluate(() => { switchSong('s2'); });
    expect(await page.evaluate(() => lastLyricsSelection)).toBe('');
    // 真的送出去的提示詞要是乙歌自己的歌詞
    let prompt = '';
    await page.route('**/ai', async route => {
        prompt = route.request().postData() || '';
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, text: '情境：x\n標籤：y', model: { id: 'm', label: 'M' }, tried: [] }) });
    });
    await page.evaluate(() => document.querySelector('.context-refresh-btn').click());
    await page.waitForFunction(() => !document.querySelector('.context-refresh-btn').disabled);
    await expect(page.locator('#copyToast')).toHaveText('情境與標籤已更新 ✓');
    expect(prompt).toContain('乙歌的歌詞');
    expect(prompt).not.toContain('甲歌選取的字');
    expect(errors).toEqual([]);
    await context.close();
});

test('多分頁同步：自己的存檔失敗時，別頁的更新不會吃掉這頁還沒存的修改（WR-08）', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        storage: v2Storage([song('s1', [sec('a1', '原本的第一首')]), song('s2', [sec('b1', '原本的第二首')], { createdAt: 2 })], 's1'),
        init: () => {
            const orig = Storage.prototype.setItem;
            Storage.prototype.setItem = function (k, v) {
                if (window.__failSongs && k === 'lh:songs') throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
                return orig.call(this, k, v);
            };
        },
    });
    // 這頁改了第一首，但存不下去（儲存空間滿了）；別頁同時把第二首改名寫進儲存
    await page.evaluate(() => { window.__failSongs = true; });
    await textareas(page).first().fill('這頁打的字，還沒存下來');
    await page.evaluate(() => {
        const list = JSON.parse(localStorage.getItem('lh:songs'));
        list.find(s => s.id === 's2').title = '別頁改的名字';
        window.__failSongs = false;
        localStorage.setItem('lh:songs', JSON.stringify(list));   // 模擬別頁寫入
        window.__failSongs = true;
        _applyExternalSongs();
    });
    const got = await page.evaluate(() => ({ s1: songs.find(s => s.id === 's1').sections[0].text, s2: songs.find(s => s.id === 's2').title, dirty: _dirty.has('s1') }));
    expect(got.s1, '這頁的修改保留').toBe('這頁打的字，還沒存下來');
    expect(got.s2, '別頁的改動也套進來').toBe('別頁改的名字');
    expect(got.dirty, '還記得沒存下來').toBe(true);
    await expect(textareas(page).first()).toHaveValue('這頁打的字，還沒存下來');
    await expect(page.locator('#copyToast')).toContainText('修改還沒有存下來');
    // 儲存恢復後補存
    await page.evaluate(() => { window.__failSongs = false; flushSongs(); });
    expect((await activeSongRaw(page)).sections[0].text).toBe('這頁打的字，還沒存下來');
    expect(errors.filter(e => !/QuotaExceeded|quota/i.test(e))).toEqual([]);
    await context.close();
});

// ==================== 審查修正（WR-09）：歌曲還沒載好 ====================
test('載入前：匯出、新增歌曲、匯入都被擋住，不會存出空的備份', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: v2Storage([song('s1', [sec('a1', '我的歌詞')])]) });
    const before = await dumpLS(page);
    await page.evaluate(() => { songsReady = false; });   // 回到「還沒載好」的狀態
    let downloaded = false;
    page.on('download', () => { downloaded = true; });
    await page.evaluate(() => { exportSession(); });
    await expect(page.locator('#copyToast')).toHaveText('歌曲還在載入，請稍候再試');
    await page.evaluate(() => { document.getElementById('copyToast').classList.remove('show'); createSong(); });
    await expect(page.locator('#copyToast')).toHaveText('歌曲還在載入，請稍候再試');
    await page.setInputFiles('#importFileInput', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
    await page.waitForTimeout(300);
    await expect(page.locator('#importOverlay')).not.toHaveClass(/show/);
    expect(downloaded).toBe(false);
    expect(await dumpLS(page), '什麼都沒寫').toEqual(before);
    await page.evaluate(() => { songsReady = true; });
    await context.close();
});

test('載入失敗：不停在載入中，說明資料沒有被更動', async ({ browser }) => {
    const { context, page, warnings } = await bootPage(browser, {
        storage: v2Storage([song('s1', [sec('a1', '我的歌詞')])]),
        init: () => {
            const orig = Element.prototype.replaceChildren;
            Element.prototype.replaceChildren = function (...a) {
                if (this.id === 'lyricsSections' && sessionStorage.getItem('noboom') !== '1') throw new Error('boom');
                return orig.apply(this, a);
            };
        },
    });
    await expect(page.locator('#lyricsSections')).toHaveText('歌詞載入失敗，但儲存的資料沒有被更動。請重新整理頁面再試一次。');
    expect(warnings.some(w => w.includes('歌曲載入失敗'))).toBe(true);
    expect(await page.evaluate(() => songsReady)).toBe(false);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lh:songs'))[0].sections[0].text), '儲存的歌詞沒被動').toBe('我的歌詞');
    await page.evaluate(() => { exportSession(); });
    // 載入失敗和「還在載入」要分開講（WR-12）
    await expect(page.locator('#copyToast')).toHaveText('歌詞載入失敗，請重新整理頁面，或到「設定」的「自動備份」還原');
    await context.close();
});

const BAD_LOAD_INIT = () => {
    const orig = Element.prototype.replaceChildren;
    Element.prototype.replaceChildren = function (...a) {
        if (this.id === 'lyricsSections' && sessionStorage.getItem('noboom') !== '1') throw new Error('boom');
        return orig.apply(this, a);
    };
};

test('載入失敗後：「全部還原」仍可使用，還原完整個頁面恢復正常（WR-12）', async ({ browser }) => {
    const { context, page } = await bootPage(browser, { storage: v2Storage([song('s1', [sec('a1', '壞掉的存檔')])]), init: BAD_LOAD_INIT });
    expect(await page.evaluate(() => songsFailed)).toBe(true);
    await page.evaluate(() => sessionStorage.setItem('noboom', '1'));   // 重新載入後這個存檔就載得起來
    const backup = { format: 'lucky-hawaii-backup', version: 2, exportedAt: '2026-10-11T07:30:00.000Z', activeSong: 'r1', savedWords: [], settings: {},
        songs: [{ id: 'r1', title: '救回來的歌', createdAt: 5, updatedAt: 5, hashtags: [], context: '', sections: [{ id: 'x1', label: '主歌', text: '備份裡的歌詞', collapsed: false }] }] };
    await page.setInputFiles('#importFileInput', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
    await expect(page.locator('#importOverlay')).toHaveClass(/show/);
    await page.locator('#importReplaceBtn').click();
    await expect(page.locator('#copyToast')).toHaveText('已還原 1 首歌與設定（還原前的資料已自動備份）');
    await page.evaluate(() => Promise.all([window.__hoyunSafetyReady, window.__hoyunSongsReady]));
    await expect(page.locator('#songCurrent')).toHaveText('救回來的歌');
    await expect(textareas(page).first()).toHaveValue('備份裡的歌詞');
    await context.close();
});

test('載入失敗後：自動備份還原仍可使用（WR-12）', async ({ browser }) => {
    const { context, page } = await bootPage(browser, { storage: v2Storage([song('s1', [sec('a1', '壞掉的存檔')])]), init: BAD_LOAD_INIT });
    expect(await page.evaluate(() => songsFailed)).toBe(true);
    await page.evaluate(() => sessionStorage.setItem('noboom', '1'));
    const rec = await page.evaluate(async () => (await lhListBackups()).find(r => r.id === 'baseline'));
    expect(rec).toBeTruthy();
    await page.evaluate(() => { restoreAutoBackup('baseline'); });
    await expect(page.locator('#copyToast')).toHaveText('已還原自動備份（還原前的資料已自動備份）');
    await page.evaluate(() => Promise.all([window.__hoyunSafetyReady, window.__hoyunSongsReady]));
    await expect(textareas(page).first()).toHaveValue('壞掉的存檔');   // 備份當時的資料，這次載得起來
    await context.close();
});

// ==================== 審查修正（WR-10）：損毀的 lh:songs 不能默默變成空白歌 ====================
test('損毀的歌曲資料：能用的歌撿回來，原文另存成釘住的備份並提示一次（WR-10）', async ({ browser }) => {
    const good = (id, text) => song(id, [sec('x' + id, text)], { title: '歌' + id });
    const raw = JSON.stringify([good('g1', '第一首的字'), { id: 'bad', title: '沒有段落' }, 'junk', good('g2', '第二首的字'), good('g1', '重複的 id')]);
    const { context, page, errors } = await bootPage(browser, { storage: { ...FIXTURE, 'lh:schema': '2', 'lh:songs': raw, 'lh:activeSong': 'g1' } });
    await expect(page.locator('#copyToast')).toContainText('已救回 2 首能用的歌');
    await expect(page.locator('#copyToast')).toContainText('自動備份');
    const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('lh:songs')).map(s => s.id));
    expect(kept).toEqual(['g1', 'g2']);
    const rec = await page.evaluate(async () => (await lhListBackups()).find(r => r.id.startsWith('corrupt-songs-')));
    expect(rec, '有一份原始內容的備份').toBeTruthy();
    expect(rec.data['lh:songs'], '備份裡是損毀的原文').toBe(raw);
    // 釘住：再多的自動備份也擠不掉它
    await page.evaluate(async () => { for (let i = 0; i < 6; i++) await lhBackup('song-delete-t' + i, 't', lhSnapshot()); });
    expect(await page.evaluate(async () => (await lhListBackups()).some(r => r.id.startsWith('corrupt-songs-')))).toBe(true);
    expect(errors).toEqual([]);
    await context.close();
});

test('損毀的歌曲資料：完全讀不出來時建立新歌，原文仍在備份裡（WR-10）', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: { ...FIXTURE, 'lh:schema': '2', 'lh:songs': 'not json' } });
    await expect(page.locator('#copyToast')).toContainText('先建立了一首新歌');
    const rec = await page.evaluate(async () => (await lhListBackups()).find(r => r.id.startsWith('corrupt-songs-')));
    expect(rec.data['lh:songs']).toBe('not json');
    expect(errors).toEqual([]);
    await context.close();
});

test('凍結期間收到的外部更新不會被丟掉，放開後仍會套用（IN-07）', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: v2Storage([song('s1', [sec('a1', '原本')])]) });
    await page.evaluate(() => { setSavesFrozen(true); _pendingExternal = true; _applyExternalSongs(); });
    expect(await page.evaluate(() => _pendingExternal), '凍結中還記得有待套用的更新').toBe(true);
    await page.evaluate(() => { setSavesFrozen(false); _applyExternalSongs(); });
    expect(await page.evaluate(() => _pendingExternal)).toBe(false);
    expect(errors).toEqual([]);
    await context.close();
});

// ==================== 審查修正（IN-08）：損毀原文只留最新一份，備援裡也不會被刪歌備份擠掉 ====================
test('損毀的歌曲資料：固定 id 只留最新一份，內容相同不重複寫（IN-08）', async ({ browser }) => {
    const { context, page } = await bootPage(browser, { storage: { ...FIXTURE, 'lh:schema': '2', 'lh:songs': 'not json' } });
    const recs = () => page.evaluate(async () => (await lhListBackups()).filter(r => r.id.startsWith('corrupt-songs-')).map(r => [r.id, r.data['lh:songs']]));
    await expect.poll(recs).toEqual([['corrupt-songs-latest', 'not json']]);
    // 又壞了一次（內容不同）：取代舊的，不是再多一份
    await page.evaluate(async () => { await lhBackup('corrupt-songs-latest', 't', { ...lhSnapshot(), 'lh:songs': 'second break' }); });
    expect(await recs()).toEqual([['corrupt-songs-latest', 'second break']]);
    // 同樣的內容再要求一次：不動
    const seq = () => page.evaluate(async () => (await lhListBackups()).find(r => r.id === 'corrupt-songs-latest').seq);
    const before = await seq();
    await page.evaluate(async () => { await lhBackup('corrupt-songs-latest', 't', { ...lhSnapshot(), 'lh:songs': 'second break' }); });
    expect(await seq()).toBe(before);
    await context.close();
});

test('損毀的歌曲資料：沒有 IndexedDB 時原文有自己的槽，刪歌備份和升級前備份都擠不掉（IN-08）', async ({ browser }) => {
    const { context, page } = await bootPage(browser, {
        storage: { ...FIXTURE, 'lh:schema': '2', 'lh:songs': 'not json' },
        init: () => { Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true }); },
    });
    const slot = k => page.evaluate(key => { const r = localStorage.getItem(key); return r === null ? null : JSON.parse(r).id; }, k);
    await expect.poll(() => slot('lh:backup:ls3')).toBe('corrupt-songs-latest');
    await page.evaluate(async () => { await lhBackup('song-delete-x', 'd', lhSnapshot()); await lhBackup('song-delete-y', 'd', lhSnapshot()); });
    expect(await slot('lh:backup:ls3')).toBe('corrupt-songs-latest');
    expect(await slot('lh:backup:ls2')).toBe('song-delete-y');
    expect(await slot('lh:backup:ls')).not.toBeNull();
    const ids = await page.evaluate(async () => (await lhListBackups()).map(r => r.id));
    expect(ids).toContain('corrupt-songs-latest');
    expect(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('lh:backup:')).sort())).toEqual(['lh:backup:ls', 'lh:backup:ls2', 'lh:backup:ls3']);
    await context.close();
});
