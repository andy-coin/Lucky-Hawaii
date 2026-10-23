// 第 10 階段整合測試——像作詞人一樣用真實畫面走完韻腳地圖的每一步（ROADMAP 成功條件 1～5），重新整理後全部還在，
// 匯出的檔案裡沒有任何韻腳標記。每個計畫已經各自測過自己的功能；這裡把它們串成同一個連續的寫詞過程
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage, compose, activeSongRaw } from './helpers.mjs';
import { DEVICES, waitStill } from './layout-lib.mjs';

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/v096-localStorage.json', import.meta.url), 'utf8'));
const OPEN_PANELS = { leftPanelCollapsed: 'false', rightPanelCollapsed: 'false' };
const v2Storage = (songs, extra = OPEN_PANELS) => ({
    ...FIXTURE, 'lh:schema': '2', 'lh:songs': JSON.stringify(songs), 'lh:activeSong': songs[0].id, ...extra,
});
const typed = (id, type, text, extra = {}) => ({ id, type, custom: '', color: '', height: null, label: '', text, collapsed: false, ...extra });
const song = (sections, extra = {}) => ({ id: 's1', title: '測試歌', sections, hashtags: [], context: '', createdAt: 1, updatedAt: 1, ...extra });

const SEC1 = '我望著遠方的光\n走過熟悉的街道\n你笑著說天亮\n不怕前方的路遙\n愛你到天亮啊';
const SEC2 = '我們一起行\n我望著遠方的光';
const READ_TAIL = '們一起行';
const BAR = '#rhymeSelBar';
const STRIP = '.section-rhyme';

const secs = page => page.locator('#lyricsSections .lyrics-section');
const bands = (page, n = 0) => secs(page).nth(n).locator('.rhyme-mirror .rm-hl').evaluateAll(els => els.map(e => [e.textContent, e.dataset.f]));
const stripTexts = page => secs(page).evaluateAll((els, q) => els.map(e => {
    const b = e.querySelector(q);
    return b && !b.hidden && getComputedStyle(b).display !== 'none' ? b.textContent : null;
}), STRIP);
const sw = (page, name) => page.locator('#rhymeMenu .rm-switch', { hasText: name });
const radio = (page, name) => page.locator('#rhymeMenu [role=radio]', { hasText: name });
const pick = (page, a, b, n) => page.evaluate(([a, b, n]) => {
    const ta = document.querySelectorAll('.section-textarea')[n];
    ta.focus(); ta.setSelectionRange(a, b);
}, [a, b, n]);
const lsMap = page => page.evaluate(() => localStorage.getItem('lh:map'));
// 期望的家族編號全部由頁面上的字典算出來（不寫死）
const famOf = (page, ch) => page.evaluate(c => String(RHYME_TO_FAMILY[getZhuyinRhyme(lhRhymeReading({ char: c, tail: c }, null))]), ch);
const polyInfo = page => page.evaluate(() => {
    const rs = getCharAllReadings('行').map(x => x.reading);
    const fam = r => RHYME_TO_FAMILY[getZhuyinRhyme(r)];
    const auto = lhRhymeReading({ char: '行', tail: '們一起行' }, null);
    const other = rs.find(r => fam(r) !== fam(auto));
    return { rs, auto, other, fa: String(fam(auto)), fo: String(fam(other)) };
});
const ready = page => page.evaluate(() => Promise.all([window.__hoyunReady, window.__hoyunWordlistReady, window.__hoyunSongsReady, window.__lhMapReady]));
async function readDownload(dl) {
    const chunks = [];
    for await (const c of await dl.createReadStream()) chunks.push(c);
    return Buffer.concat(chunks).toString('utf8');
}
const noMarkup = (txt, tag) => {
    expect(txt, tag + '：沒有 rm- 類別').not.toContain('rm-');
    expect(txt, tag + '：沒有鏡像層名稱').not.toContain('rhyme-mirror');
    expect(txt, tag + '：沒有零寬字元').not.toContain('​');
};

test('整合：韻腳地圖一次走完', async ({ browser }) => {
    test.setTimeout(180_000);
    const { context, page, errors, offOrigin } = await bootPage(browser, {
        wordlist: 'stub', device: DEVICES.desktop, aiReply: '天亮、心慌、離鄉',
        storage: v2Storage([song([typed('sa', 'verse', SEC1), typed('sb', 'chorus', SEC2)])]),
    });
    // 記下所有不是靜態檔案的請求（POST 與站外）
    const posts = [];
    const aiBodies = [];
    page.on('request', r => {
        if (r.method() !== 'GET') posts.push(new URL(r.url()).pathname);
        if (r.method() === 'POST' && new URL(r.url()).pathname === '/ai') aiBodies.push(r.postData());
    });
    await waitStill(page);
    const fGuang = await famOf(page, '光'), fDao = await famOf(page, '道');
    expect(fGuang).not.toBe(fDao);

    // ===== 1. 句尾依韻部上色：光／亮同家族，道／遙同家族，語助詞「啊」被跳過 =====
    const colored = [['光', fGuang], ['道', fDao], ['亮', fGuang], ['遙', fDao], ['亮', fGuang]];
    expect(await bands(page, 0)).toEqual(colored);
    const info = await polyInfo(page);
    expect(info.other, '行有家族不同的另一個讀音').toBeTruthy();
    expect(await bands(page, 1)).toEqual([['行', info.fa], ['光', fGuang]]);
    expect(await lsMap(page), '只看不寫').toBeNull();

    // ===== 2. 用注音組字打一個新句：組字中所有鏡像層零變動、一次都沒分析 =====
    await page.evaluate(() => { const ta = document.querySelector('.section-textarea'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); });
    await page.keyboard.press('Enter');
    await page.keyboard.type('我在這裡等天');
    await expect.poll(async () => (await bands(page, 0)).length).toBe(6);
    await page.evaluate(() => { const ta = document.querySelector('.section-textarea'); ta.scrollTop = ta.scrollHeight; });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
        window.__an = 0;
        const o = window.lhRhymeAnalyze;
        window.lhRhymeAnalyze = function (...a) { window.__an++; return o.apply(this, a); };
        window.__mut = 0;
        window.__mo = new MutationObserver(rs => { window.__mut += rs.length; });
        document.querySelectorAll('.rhyme-mirror').forEach(m => window.__mo.observe(m, { childList: true, subtree: true }));
    });
    let during = null;
    await compose(page, ['ㄌ', 'ㄌㄧ', 'ㄌㄧㄤˋ'], '亮', async () => {
        during = await page.evaluate(() => ({ analyze: window.__an, mutations: window.__mut + window.__mo.takeRecords().length }));
    });
    expect(during, '組字中鏡像層零變動、沒有分析').toEqual({ analyze: 0, mutations: 0 });
    await expect.poll(async () => (await bands(page, 0)).at(-1), { timeout: 2000 }).toEqual(['亮', fGuang]);
    expect((await bands(page, 0)).length).toBe(6);
    await expect.poll(async () => (await activeSongRaw(page)).sections[0].text).toBe(SEC1 + '\n我在這裡等天亮');
    await page.evaluate(() => window.__mo.disconnect());

    // ===== 3. 韻腳 ▾ 選單：段落結構字母 =====
    await page.locator('#rhymeMenuBtn').click();
    await expect(page.locator('#rhymeMenu')).toBeVisible();
    expect(await stripTexts(page), '預設沒有字母條').toEqual([null, null]);
    await sw(page, '段落結構字母').click();
    await expect(sw(page, '段落結構字母')).toHaveAttribute('aria-checked', 'true');
    const letters1 = 'ABABAA';
    const letters2 = info.fa === fGuang ? 'AA' : 'AB';
    expect(await stripTexts(page)).toEqual([letters1, letters2]);
    // 嚴格：字母變了（光ㄨㄤ、亮ㄧㄤ 不同韻母），顏色編號不變
    const before = await bands(page, 0);
    await radio(page, '嚴格').click();
    await expect(radio(page, '嚴格')).toHaveAttribute('aria-checked', 'true');
    await expect.poll(async () => (await stripTexts(page))[0]).toBe('ABCDCC');
    expect(await bands(page, 0), '嚴格：顏色編號不變').toEqual(before);
    await radio(page, '寬韻').click();
    await expect.poll(async () => (await stripTexts(page))[0]).toBe(letters1);
    // 忽略句尾語助詞：關掉後色塊移到「啊」，再打開回到「亮」
    await sw(page, '忽略句尾語助詞').click();
    await expect.poll(async () => (await bands(page, 0))[4][0]).toBe('啊');
    await sw(page, '忽略句尾語助詞').click();
    await expect.poll(async () => (await bands(page, 0))[4][0]).toBe('亮');
    expect(await bands(page, 0)).toEqual([...colored, ['亮', fGuang]]);
    // 句中押韻：底線出現
    await sw(page, '句中押韻').click();
    await expect.poll(() => page.locator('.rm-inner').count()).toBeGreaterThan(0);
    expect(await page.locator('.rm-inner').first().evaluate(e => getComputedStyle(e).textDecorationLine)).toBe('underline');
    const innerCount = await page.locator('.rm-inner').count();
    const wantMap = { end: true, letters: true, inner: true, strict: false, skipParticles: true };
    expect(JSON.parse(await lsMap(page))).toEqual(wantMap);
    await page.locator('#rhymeMenu .section-menu-close').click();
    await expect(page.locator('#rhymeMenu')).toBeHidden();

    // ===== 4. 反白「光」→ 查韻（字卡）→ AI 建議（整首歌、AI 詞卡）=====
    await pick(page, 6, 7, 0);
    await expect(page.locator(BAR)).toBeVisible();
    await page.locator(BAR + ' button').first().click();
    await expect(page.locator('#searchInput')).toHaveValue('光');
    await expect.poll(() => page.locator('.char-card').count()).toBeGreaterThan(0);
    await expect(page.locator(BAR)).toBeHidden();
    // 記下 AI 按鈕真正執行那一刻的反白與歌詞：反白沒清掉的話 AI 只會拿到被選的字當歌詞（10-05 Pitfall 9）
    await page.evaluate(() => {
        const o = window.generateAISuggestions;
        window.generateAISuggestions = function (...a) { window.__selAtAI = lastLyricsSelection; window.__songAtAI = curSong().sections.map(s => s.text.trim()).filter(Boolean).join('\n'); return o.apply(this, a); };
        lastLyricsSelection = '光';   // 模擬滑鼠反白留下的值
    });
    await pick(page, 5, 7, 0);   // 同一段範圍收起後不會再出現（10-05 刻意），所以換成「的光」
    await expect(page.locator(BAR)).toBeVisible();
    await page.locator(BAR + ' button').nth(1).click();
    await expect.poll(() => page.locator('.ai-word-card').count()).toBeGreaterThan(0);
    expect(aiBodies.length, '送出了 AI 請求').toBeGreaterThan(0);
    expect(await page.evaluate(() => window.__selAtAI), 'AI 按下去時沒有留著被選的字').toBe('');
    expect(await page.evaluate(() => window.__songAtAI), 'AI 用的歌詞是整首（第二段的句子也在）').toContain('我們一起行');
    await expect(page.locator(BAR)).toBeHidden();

    // ===== 5. 句尾的破音字「行」→ 指定讀音 → 換另一個讀音 =====
    await pick(page, 4, 5, 1);
    await expect(page.locator(BAR)).toBeVisible();
    await expect(page.locator(BAR + ' .rm-bar-rd')).toHaveText('指定讀音');
    await page.locator(BAR + ' .rm-bar-rd').click();
    await page.locator('#rhymeSelBar .rm-chip', { hasText: info.other }).click();
    expect(await bands(page, 1)).toEqual([['行', info.fo], ['光', fGuang]]);
    expect(info.fo, '換讀音後家族不同').not.toBe(info.fa);
    await expect(page.locator('.rm-hl.rm-manual')).toHaveCount(1);
    expect(await page.locator('.rm-hl.rm-manual').evaluate(e => getComputedStyle(e).borderBottomStyle), '點狀提示').toBe('dotted');
    await expect(page.locator('#lhLive')).toHaveText('已指定「行」讀音為 ' + info.other);
    await expect.poll(async () => (await activeSongRaw(page)).readings).toEqual({ [READ_TAIL]: info.other });

    // ===== 6. 從字母條看統計，逐句一列，點「道」那一列就查「道」=====
    await page.locator(STRIP).first().click();
    await expect(page.locator('#rhymeStats')).toBeVisible();
    await expect(page.locator('#rhymeStats .rm-letters')).toHaveText(letters1);
    await expect(page.locator('#rhymeStats .rm-row')).toHaveCount(6);
    await page.locator('#rhymeStats .rm-row').nth(1).click();
    await expect(page.locator('#searchInput')).toHaveValue('道');
    await expect.poll(() => page.locator('.char-card').count()).toBeGreaterThan(0);
    await expect(page.locator('#rhymeStats')).toBeHidden();

    // ===== 7. 重新整理：設定、讀音、色塊、字母條都在 =====
    await page.evaluate(() => flushSongs());
    const mapBefore = await lsMap(page);
    const stripBefore = await stripTexts(page);
    const bandsBefore = [await bands(page, 0), await bands(page, 1)];
    await page.reload();
    await ready(page);
    await waitStill(page);
    expect(await lsMap(page)).toBe(mapBefore);
    expect(await stripTexts(page)).toEqual(stripBefore);
    expect([await bands(page, 0), await bands(page, 1)]).toEqual(bandsBefore);
    await expect(page.locator('.rm-hl.rm-manual')).toHaveCount(1);
    await expect(page.locator('.rm-inner')).toHaveCount(innerCount);
    expect((await activeSongRaw(page)).readings).toEqual({ [READ_TAIL]: info.other });
    await page.locator('#rhymeMenuBtn').click();
    await expect(sw(page, '段落結構字母')).toHaveAttribute('aria-checked', 'true');
    await expect(sw(page, '句中押韻')).toHaveAttribute('aria-checked', 'true');
    await expect(radio(page, '寬韻')).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');
    await expect(page.locator('#rhymeMenu')).toBeHidden();

    // ===== 8. 匯出：TXT、Markdown、備份全部 =====
    const item = label => page.locator('#exportMenu .export-item').filter({ has: page.locator('.export-label', { hasText: label }) });
    const download = async label => {
        await page.locator('#exportToggle').click();
        const [dl] = await Promise.all([page.waitForEvent('download'), item(label).click()]);
        return readDownload(dl);
    };
    const txt = await download('TXT');
    expect(txt).toContain('我望著遠方的光');
    expect(txt).toContain('我們一起行');
    noMarkup(txt, 'TXT');
    const md = await download('Markdown');
    expect(md).toContain('我望著遠方的光');
    noMarkup(md, 'Markdown');
    const [bk] = await Promise.all([page.waitForEvent('download'), page.locator('.save-load-controls .save-load-btn >> nth=0').click()]);
    const bkText = await readDownload(bk);
    noMarkup(bkText, '備份');
    const backup = JSON.parse(bkText);
    expect(JSON.parse(backup.settings['lh:map']), '備份帶著韻腳設定').toEqual(wantMap);
    expect(backup.songs.find(s => s.id === 's1').readings, '備份帶著讀音').toEqual({ [READ_TAIL]: info.other });

    // 全程只有 AI 的 POST，沒有站外請求
    expect([...new Set(posts)]).toEqual(['/ai']);
    expect(offOrigin).toEqual([]);
    expect(errors).toEqual([]);
    await context.close();
});
