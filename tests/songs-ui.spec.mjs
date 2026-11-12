// 歌曲清單（EDIT-04）：標題列、☰ 歌曲清單、新增、切換、改名、版面
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage } from './helpers.mjs';

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/v096-localStorage.json', import.meta.url), 'utf8'));
const MIGRATION_TOAST = '你原本的歌詞已整理成第一首歌「我的第一首歌」，一字不少';
const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };

test('歌曲清單：打開、新增、切換', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: FIXTURE, device: DESKTOP });
    const toggle = page.locator('#songListToggle');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#songList')).toBeHidden();
    await expect(page.locator('#songCurrent')).toHaveText('我的第一首歌');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#songList')).toBeVisible();
    await expect(page.locator('.song-item')).toHaveCount(1);
    await expect(page.locator('.song-item[aria-current="true"] .song-pick')).toHaveText('我的第一首歌');
    await expect(page.locator('#songListCaption')).toHaveText('歌曲（1）');
    await expect(page.locator('#songListHint')).toBeVisible();

    await page.getByRole('button', { name: '新增一首歌曲' }).click();
    await page.locator('.song-name-input').press('Enter');   // 新歌直接進入改名，Enter 接受預設名稱
    await expect(page.locator('.song-item')).toHaveCount(2);
    await expect(page.locator('.song-item').first().locator('.song-pick')).toHaveText('未命名歌曲 1');
    await expect(page.locator('.song-item').first()).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('#songCurrent')).toHaveText('未命名歌曲 1');
    await expect(page.locator('#songListHint')).toBeHidden();
    await expect(page.locator('.section-textarea')).toHaveCount(1);
    await expect(page.locator('.section-textarea')).toHaveAttribute('placeholder', '在這裡輸入或貼上歌詞…');
    await expect(page.locator('.section-textarea')).toHaveValue('');
    await page.locator('.section-textarea').fill('新歌的第一行');

    await page.locator('.song-pick', { hasText: '我的第一首歌' }).click();
    await expect(page.locator('#songCurrent')).toHaveText('我的第一首歌');
    await expect(page.locator('.section-textarea').first()).toHaveValue(/夜色 & 微光<b>粗體<\/b>/);

    await page.reload();
    await page.evaluate(() => window.__hoyunSongsReady);
    const titles = await page.evaluate(() => JSON.parse(localStorage.getItem('lh:songs')).map(s => s.title));
    expect(titles.sort()).toEqual(['我的第一首歌', '未命名歌曲 1']);
    expect(errors).toEqual([]);
    await context.close();
});

test('歌曲清單：升級提示只出現一次', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: FIXTURE, device: DESKTOP });
    await expect(page.locator('#copyToast')).toHaveText(MIGRATION_TOAST);
    await expect(page.locator('#copyToast')).toHaveClass(/show/);
    await page.reload();
    await page.evaluate(() => window.__hoyunSongsReady);
    await page.waitForTimeout(300);
    expect(await page.locator('#copyToast').count()).toBe(0);
    expect(errors).toEqual([]);
    await context.close();
});

// ==================== 改名、鍵盤、編號與排序、每首歌各自的內容 ====================
import { DEVICES, setScale, waitStill, expectReallyClickable, noPageScroll, rectsOverlap, auditTouchTargets } from './layout-lib.mjs';

const song = (id, title, createdAt, o = {}) => ({
    id, title, createdAt, updatedAt: createdAt,
    sections: [{ id: 'sec-' + id, label: '主歌', text: o.text ?? '', collapsed: false }],
    hashtags: o.hashtags ?? [], context: o.context ?? '',
});
// 已經是第 2 版資料的使用者：直接帶 lh:songs，兩個面板預設展開
const seed = (songs, active = songs[0].id) => ({
    'lh:schema': '2', 'lh:songs': JSON.stringify(songs), 'lh:activeSong': active,
    leftPanelCollapsed: 'false', rightPanelCollapsed: 'true',
});
const TWO = [song('song-b', '第二首', 2000, { text: 'B歌詞' }), song('song-a', '第一首', 1000, { text: 'A歌詞' })];
const PHONE = DEVICES.phone;
const openPhoneList = async page => {
    await page.locator('#mtab-lyrics').click();
    await page.locator('#songListToggle').click();
    await expect(page.locator('#songList')).toBeVisible();
};
const titlesInStorage = page => page.evaluate(() => JSON.parse(localStorage.getItem('lh:songs')).map(s => s.title));
const toastText = page => page.evaluate(() => { const t = document.getElementById('copyToast'); return t && t.classList.contains('show') ? t.textContent : null; });

test('歌曲清單：改名', async ({ browser }) => {
    // 桌機推開欄：只有目前這首有 ✎，雙擊歌名進入改名
    let { context, page, errors } = await bootPage(browser, { storage: seed(TWO), device: DESKTOP });
    await page.locator('#songListToggle').click();
    await expect(page.locator('.song-act.rename:visible')).toHaveCount(1);
    await page.locator('.song-pick', { hasText: '第一首' }).dblclick();
    const input = page.locator('.song-name-input');
    await expect(input).toBeFocused();
    expect(await input.evaluate(el => [el.value, el.selectionStart, el.selectionEnd, el.maxLength, el.getAttribute('aria-label')])).toEqual(['第一首', 0, 3, 60, '歌曲名稱']);
    await input.fill('新名字');
    await input.press('Enter');
    await expect(page.locator('.song-name-input')).toHaveCount(0);
    await expect(page.locator('.song-pick', { hasText: '新名字' })).toHaveCount(1);
    await expect(page.locator('#songCurrent')).toHaveText('新名字');   // 雙擊的第一下已經切過去，所以它就是目前這首
    expect(await titlesInStorage(page)).toContain('新名字');
    expect(errors).toEqual([]);
    await context.close();

    // 手機覆蓋層：每一列都有 ✎，雙擊歌名不會進入改名
    ({ context, page, errors } = await bootPage(browser, { storage: seed(TWO), device: PHONE }));
    await openPhoneList(page);
    await expect(page.locator('.song-act.rename:visible')).toHaveCount(2);
    await page.locator('.song-pick', { hasText: '第二首' }).dblclick();
    await expect(page.locator('.song-name-input')).toHaveCount(0);
    expect(errors).toEqual([]);
    await context.close();
});

test('歌曲清單：改名的邊界', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: seed(TWO), device: DESKTOP });
    await page.locator('#songListToggle').click();
    const rename = () => page.locator('.song-item[aria-current="true"] .song-act.rename').click();
    const input = page.locator('.song-name-input');

    await rename();
    await input.fill('不要存這個');
    await input.press('Escape');
    await expect(input).toHaveCount(0);
    await expect(page.locator('#songList')).toBeVisible();   // Esc 只取消改名，不關清單
    await expect(page.locator('#songCurrent')).toHaveText('第二首');

    await rename();
    await input.fill('失焦就存');
    await page.locator('#songListCaption').click();
    await expect(input).toHaveCount(0);
    await expect(page.locator('#songCurrent')).toHaveText('失焦就存');

    await rename();
    await input.fill('   ');
    await input.press('Enter');
    await expect(page.locator('#songCurrent')).toHaveText('失焦就存');
    expect(await toastText(page), '空白改名不跳提示').toBeNull();

    await rename();
    await input.fill('字'.repeat(61));
    await input.press('Enter');
    expect(Array.from(await page.locator('#songCurrent').textContent())).toHaveLength(60);

    // 組字中的 Enter 是選字，不是送出
    await rename();
    await input.fill('組字');
    await input.evaluate(el => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true })));
    await expect(input).toHaveCount(1);
    await input.press('Enter');
    await expect(input).toHaveCount(0);
    expect(errors).toEqual([]);
    await context.close();
});

test('歌曲清單：改別首的名字', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: seed(TWO), device: PHONE });
    await openPhoneList(page);
    await page.locator('.song-item:not([aria-current="true"]) .song-act.rename').click();
    await page.locator('.song-name-input').fill('改的是別首');
    await page.locator('.song-name-input').press('Enter');
    await expect(page.locator('#songCurrent')).toHaveText('第二首');
    expect(await titlesInStorage(page)).toContain('改的是別首');
    await expect(page.locator('#songList')).toBeVisible();
    expect(errors).toEqual([]);
    await context.close();
});

test('歌曲清單：新歌直接改名', async ({ browser }) => {
    // 手機：新歌進入改名並全選；Enter 後清單關起來、焦點不在歌詞框
    let { context, page, errors } = await bootPage(browser, { storage: seed(TWO), device: PHONE });
    await openPhoneList(page);
    await page.locator('.song-new-btn').click();
    let input = page.locator('.song-name-input');
    await expect(input).toBeFocused();
    expect(await input.evaluate(el => [el.value, el.selectionStart, el.selectionEnd])).toEqual(['未命名歌曲 1', 0, 7]);
    await input.fill('新寫的歌');
    await input.press('Enter');
    await expect(page.locator('#songList')).toBeHidden();
    expect(await page.evaluate(() => document.activeElement.tagName)).not.toBe('TEXTAREA');
    await expect(page.locator('#songListToggle')).toBeFocused();
    await expect(page.locator('#songCurrent')).toHaveText('新寫的歌');
    // Esc 保留預設名稱
    await page.locator('#songListToggle').click();
    await page.locator('.song-new-btn').click();
    await page.locator('.song-name-input').press('Escape');
    await expect(page.locator('#songCurrent')).toHaveText('未命名歌曲 1');
    expect(errors).toEqual([]);
    await context.close();

    // 桌機：清單維持開著
    ({ context, page, errors } = await bootPage(browser, { storage: seed(TWO), device: DESKTOP }));
    await page.locator('#songListToggle').click();
    await page.locator('.song-new-btn').click();
    await page.locator('.song-name-input').press('Enter');
    await expect(page.locator('#songList')).toBeVisible();
    await expect(page.locator('#songCurrent')).toHaveText('未命名歌曲 1');
    expect(errors).toEqual([]);
    await context.close();
});

test('歌曲清單：編號與同名', async ({ browser }) => {
    let { context, page } = await bootPage(browser, { storage: seed([song('song-x', '未命名歌曲 1', 1000), song('song-y', '未命名歌曲 3', 2000)]), device: DESKTOP });
    await page.locator('#songListToggle').click();
    await page.locator('.song-new-btn').click();
    await expect(page.locator('#songCurrent')).toHaveText('未命名歌曲 4');
    await context.close();

    ({ context, page } = await bootPage(browser, { storage: seed(TWO), device: DESKTOP }));
    await page.locator('#songListToggle').click();
    await page.locator('.song-new-btn').click();
    await expect(page.locator('#songCurrent')).toHaveText('未命名歌曲 1');
    await context.close();

    // 同名的兩首：各自獨立、都切得過去
    let errors;
    ({ context, page, errors } = await bootPage(browser, { storage: seed([song('song-p', '同名', 2000, { text: '甲的歌詞' }), song('song-q', '同名', 1000, { text: '乙的歌詞' })]), device: DESKTOP }));
    await page.locator('#songListToggle').click();
    await expect(page.locator('.song-pick', { hasText: '同名' })).toHaveCount(2);
    await page.locator('.song-pick').nth(1).click();
    await expect(page.locator('.section-textarea').first()).toHaveValue('乙的歌詞');
    await page.locator('.song-pick').nth(0).click();
    await expect(page.locator('.section-textarea').first()).toHaveValue('甲的歌詞');
    expect(errors).toEqual([]);
    await context.close();
});

test('歌曲清單：排序穩定', async ({ browser }) => {
    const same = [song('song-c', '丙', 5000), song('song-a', '甲', 5000), song('song-b', '乙', 5000)];
    const { context, page, errors } = await bootPage(browser, { storage: seed(same, 'song-c'), device: DESKTOP });
    await page.locator('#songListToggle').click();
    const order = () => page.locator('.song-pick').allTextContents();
    expect(await order()).toEqual(['甲', '乙', '丙']);
    await page.locator('.song-pick', { hasText: '乙' }).click();
    expect(await order(), '切歌不重排').toEqual(['甲', '乙', '丙']);
    await page.locator('.song-item[aria-current="true"] .song-act.rename').click();
    await page.locator('.song-name-input').fill('Z');
    await page.locator('.song-name-input').press('Enter');
    expect(await order(), '改名不重排').toEqual(['甲', 'Z', '丙']);
    expect(errors).toEqual([]);
    await context.close();
});

test('歌曲清單：鍵盤', async ({ browser }) => {
    const three = [song('song-c', '丙', 3000, { text: '丙歌詞' }), song('song-b', '乙', 2000), song('song-a', '甲', 1000)];
    const { context, page, errors } = await bootPage(browser, { storage: seed(three), device: DESKTOP });
    await page.locator('#songListToggle').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#songList')).toBeVisible();
    await page.locator('.song-item[aria-current="true"] .song-pick').focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.song-pick', { hasText: '乙' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.song-pick', { hasText: '甲' })).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('.song-pick', { hasText: '乙' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#songCurrent')).toHaveText('乙');
    await page.locator('.song-pick', { hasText: '丙' }).focus();
    await page.keyboard.press('F2');
    await expect(page.locator('.song-name-input')).toBeFocused();
    expect(await page.locator('.song-name-input').inputValue()).toBe('丙');
    await page.keyboard.press('Escape');
    await expect(page.locator('#songList')).toBeVisible();
    await page.locator('.song-pick', { hasText: '丙' }).focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('#songList')).toBeHidden();
    await expect(page.locator('#songListToggle')).toBeFocused();
    expect(errors).toEqual([]);
    await context.close();
});

test('歌曲清單：每首歌各自的標籤與情境', async ({ browser }) => {
    const pair = [song('song-b', '乙歌', 2000, { text: 'B歌詞', hashtags: ['B標籤'], context: 'B情境' }), song('song-a', '甲歌', 1000, { text: 'A歌詞', hashtags: ['A標籤'], context: 'A情境' })];
    const { context, page, errors } = await bootPage(browser, { storage: seed(pair), device: DESKTOP });
    await page.locator('#songListToggle').click();
    const view = () => page.evaluate(() => [document.getElementById('hashtagChips').textContent.trim(), document.getElementById('contextDescription').value]);
    expect(await view()).toEqual(['#B標籤×', 'B情境']);
    await page.locator('.song-pick', { hasText: '甲歌' }).click();
    expect(await view()).toEqual(['#A標籤×', 'A情境']);
    await page.locator('.song-pick', { hasText: '乙歌' }).click();
    expect(await view()).toEqual(['#B標籤×', 'B情境']);
    await page.locator('.song-pick', { hasText: '甲歌' }).click();
    await page.reload();
    await page.evaluate(() => window.__hoyunSongsReady);
    expect(await view()).toEqual(['#A標籤×', 'A情境']);
    expect(errors).toEqual([]);
    await context.close();
});

test('歌曲清單：AI 讀目前這首', async ({ browser }) => {
    // 要用完整詞庫：stub 只有 12 個候選詞，不夠就走「造詞」那條路，那條路的提示本來就不帶歌詞
    const pair = [song('song-a', '甲歌', 2000, { text: 'A歌詞獨有', hashtags: ['A標籤獨有'], context: 'A情境獨有' }), song('song-b', '乙歌', 1000, { text: 'B歌詞獨有', hashtags: ['B標籤獨有'], context: 'B情境獨有' })];
    const { context, page, errors } = await bootPage(browser, { storage: seed(pair), device: DESKTOP, aiReply: '美音、原因、光陰' });
    await page.locator('#rightPanel .side-panel-tab').click();
    const bodies = [];
    page.on('request', r => { if (r.method() === 'POST' && new URL(r.url()).pathname === '/ai') bodies.push(JSON.parse(r.postData())); });
    await page.locator('#songListToggle').click();
    await page.locator('.song-pick', { hasText: '乙歌' }).click();
    await page.fill('#searchInput', '心');
    await page.click('#generateBtn');
    await expect.poll(() => bodies.length).toBeGreaterThan(0);
    const prompt = bodies[0].prompt;
    expect(prompt).toContain('B歌詞獨有');
    expect(prompt).toContain('#B標籤獨有');
    expect(prompt).toContain('B情境獨有');
    expect(prompt).not.toMatch(/A歌詞獨有|A標籤獨有|A情境獨有/);
    expect(errors).toEqual([]);
    await context.close();
});

// ==================== 版面：推開欄、覆蓋層、各種寬度與縮放 ====================
const rectOf = (page, sel) => page.locator(sel).first().evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
const lsGet = (page, k) => page.evaluate(key => localStorage.getItem(key), k);
const BOTH = { leftPanelCollapsed: 'false', rightPanelCollapsed: 'false' };

test('歌曲清單：推開欄', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: seed(TWO), device: DESKTOP });
    const panel0 = await rectOf(page, '#leftPanel');
    const lyrics0 = await rectOf(page, '#lyricsSections');
    await page.locator('#songListToggle').click();
    await expect(page.locator('body')).toHaveClass(/songs-open/);
    const panel1 = await rectOf(page, '#leftPanel');
    const lyrics1 = await rectOf(page, '#lyricsSections');
    expect(panel1.width - panel0.width).toBeCloseTo(144, 0);
    expect(lyrics1.width).toBeCloseTo(lyrics0.width, 0);
    const container = await rectOf(page, '.container');
    expect(rectsOverlap(panel1, container), '左面板不蓋到主畫面').toBe(false);
    await expectReallyClickable(page, page.locator('#MzoomIn'), '放大');
    expect(await lsGet(page, 'lh:songListOpen')).toBe('true');
    await page.reload();
    await page.evaluate(() => window.__hoyunSongsReady);
    await expect(page.locator('#songList')).toBeVisible();
    await expect(page.locator('#songListToggle')).toHaveAttribute('aria-expanded', 'true');
    await page.locator('#songListToggle').click();
    await expect(page.locator('#songList')).toBeHidden();
    await expect(page.locator('body')).not.toHaveClass(/songs-open/);
    expect(await lsGet(page, 'lh:songListOpen')).toBe('false');
    expect(errors).toEqual([]);
    await context.close();
});

test('歌曲清單：覆蓋層不記狀態', async ({ browser }) => {
    for (const [name, device, open] of [
        ['手機', PHONE, async page => { await page.locator('#mtab-lyrics').click(); }],
        ['1000 寬', { viewport: { width: 1000, height: 800 } }, async () => {}],
    ]) {
        const { context, page, errors } = await bootPage(browser, { storage: seed(TWO), device });
        await open(page);
        await page.locator('#songListToggle').click();
        await expect(page.locator('#songList'), name).toBeVisible();
        await expect(page.locator('#songList')).toHaveClass(/song-list--overlay/);
        await waitStill(page);   // 淡入落下的 0.2 秒跑完再量
        const list = await rectOf(page, '#songList');
        const layout = await rectOf(page, '.lyrics-layout');
        const head = await rectOf(page, '.lyrics-head');
        expect(Math.abs(list.x - layout.x) + Math.abs(list.y - layout.y) + Math.abs(list.width - layout.width) + Math.abs(list.height - layout.height), name + ' 蓋滿歌詞區').toBeLessThan(2);
        expect(rectsOverlap(list, head), name + ' 不蓋住標題列').toBe(false);
        await expectReallyClickable(page, page.locator('#songListToggle'), '☰ 歌曲');
        expect(await lsGet(page, 'lh:songListOpen'), name + ' 覆蓋層不寫偏好').toBeNull();
        await page.reload();
        await page.evaluate(() => window.__hoyunSongsReady);
        await expect(page.locator('#songList'), name + ' 重開是關的').toBeHidden();
        // 切歌：清單關起來、焦點回到 ☰ 歌曲
        if (name === '手機') await page.locator('#mtab-lyrics').click();
        await page.locator('#songListToggle').click();
        await page.locator('.song-pick', { hasText: '第一首' }).click();
        await expect(page.locator('#songList')).toBeHidden();
        await expect(page.locator('#songListToggle')).toBeFocused();
        await expect(page.locator('#songCurrent')).toHaveText('第一首');
        expect(await lsGet(page, 'lh:songListOpen')).toBeNull();
        expect(errors).toEqual([]);
        await context.close();
    }
});

test('歌曲清單：跨寬度切換', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: seed(TWO, 'song-a'), device: { ...DESKTOP, viewport: { width: 1440, height: 900 } } });
    await page.locator('#songListToggle').click();
    await page.evaluate(() => { window.__w = []; const set = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === 'lh:songListOpen') window.__w.push(v); return set.call(this, k, v); }; });
    const steps = [[1000, 800, 'open-overlay'], [820, 1180, 'closed'], [390, 844, 'closed'], [820, 1180, 'closed'], [1000, 800, 'closed'], [1440, 900, 'open-push']];
    for (const [w, h, want] of steps) {
        await page.setViewportSize({ width: w, height: h });
        await waitStill(page);
        const got = await page.evaluate(() => ({
            open: !document.getElementById('songList').hidden,
            cls: document.getElementById('songList').className,
            bodyOpen: document.body.classList.contains('songs-open'),
            active: activeSongId,
            w: innerWidth,
        }));
        expect(got.active, `${w}px 還是同一首歌`).toBe('song-a');
        expect(got.bodyOpen, `${w}px body.songs-open 只在 ≥ 1024`).toBe(w >= 1024 && got.open);
        if (want === 'closed') expect(got.open, `${w}px 清單關著`).toBe(false);
        if (want === 'open-overlay') { expect(got.open).toBe(true); expect(got.cls).toContain('song-list--overlay'); }
        if (want === 'open-push') { expect(got.open).toBe(true); expect(got.cls).toContain('song-list--push'); }
    }
    expect(await page.evaluate(() => window.__w), '跨寬度不寫 lh:songListOpen').toEqual([]);
    expect(await lsGet(page, 'lh:songListOpen')).toBe('true');
    expect(errors).toEqual([]);
    await context.close();
});

test('歌曲清單：兩邊面板都開', async ({ browser }) => {
    // 保底：左邊多一欄之後，主畫面不到 24rem 就該把右邊收起來，左面板永遠不蓋到主畫面
    for (const [w, h] of [[1024, 768], [1180, 820], [1440, 900]]) {
        const { context, page, errors } = await bootPage(browser, { storage: { ...seed(TWO), ...BOTH }, device: { viewport: { width: w, height: h } } });
        await page.locator('#songListToggle').click();
        await waitStill(page);
        const container = await rectOf(page, '.container');
        const left = await rectOf(page, '#leftPanel');
        const rightCollapsed = await page.evaluate(() => document.getElementById('rightPanel').classList.contains('collapsed'));
        expect(container.width >= 384 - 0.5 || rightCollapsed, `${w}px 主畫面 ${container.width}px、右面板${rightCollapsed ? '收起' : '展開'}`).toBe(true);
        expect(rectsOverlap(left, container), `${w}px 左面板沒蓋到主畫面`).toBe(false);
        expect(errors).toEqual([]);
        await context.close();
    }
});

test('歌曲清單：三十首歌', async ({ browser }) => {
    const many = Array.from({ length: 30 }, (_, i) => song('song-' + String(i).padStart(2, '0'), '第 ' + (i + 1) + ' 首', 1000 + i));
    // 目前這首是最早建立的，在清單最底下
    const { context, page, errors } = await bootPage(browser, { storage: seed(many, 'song-00'), device: DESKTOP });
    await page.locator('#songListToggle').click();
    await waitStill(page);
    const m = await page.evaluate(() => {
        const l = document.getElementById('songList');
        const a = l.querySelector('.song-item[aria-current="true"]').getBoundingClientRect();
        const r = l.getBoundingClientRect();
        return { scrolls: l.scrollHeight > l.clientHeight + 1, top: a.top >= r.top - 1, bottom: a.bottom <= r.bottom + 1 };
    });
    expect(m.scrolls, '清單自己捲動').toBe(true);
    expect(m.top && m.bottom, '目前這首在清單可視範圍內').toBe(true);
    const sc = await noPageScroll(page);
    expect(sc.sh).toBeLessThanOrEqual(sc.ih);
    expect(sc.sw).toBeLessThanOrEqual(sc.iw);
    expect(errors).toEqual([]);
    await context.close();
});

test('歌曲清單：減少動態', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: seed(TWO), device: { viewport: { width: 1000, height: 800 }, reducedMotion: 'reduce' } });
    await page.locator('#songListToggle').click();
    const t = await page.locator('#songList').evaluate(el => { const cs = getComputedStyle(el); return { d: parseFloat(cs.transitionDuration), a: cs.animationName }; });
    expect(t.d).toBeLessThanOrEqual(0.01);
    expect(t.a).toBe('none');
    expect(errors).toEqual([]);
    await context.close();
});

test('歌曲清單：觸控目標', async ({ browser }) => {
    const list = ['#songListToggle', '#editorOpenBtn', '.song-new-btn', '.song-pick', '.song-act.rename'];
    for (const [name, device, openSheet] of [['手機', DEVICES.phone, true], ['平板直放', DEVICES.tablet, true], ['平板橫放', DEVICES.tabletLandscape, false]]) {
        const { context, page, errors } = await bootPage(browser, { storage: seed(TWO), device });
        if (openSheet) await page.locator('#mtab-lyrics').click();
        await page.locator('#songListToggle').click();
        await waitStill(page);
        let r = await auditTouchTargets(page, { mustSee: list });
        expect(r.missing, name + ' 沒量到').toEqual([]);
        expect(r.failures, name + ' 觸控目標不到 44×44').toEqual([]);
        expect(r.overlaps, name + ' 相鄰重疊').toEqual([]);
        await page.evaluate(() => startRenameSong(activeSongId));
        r = await auditTouchTargets(page, { mustSee: ['.song-name-input'] });
        expect(r.missing, name + ' 改名輸入框沒量到').toEqual([]);
        expect(r.failures, name + ' 改名輸入框不到 44×44').toEqual([]);
        expect(errors).toEqual([]);
        await context.close();
    }
});

test('歌曲清單：改名不會被放大', async ({ browser }) => {
    for (const [name, device, openSheet] of [['手機', DEVICES.phone, true], ['平板橫放', DEVICES.tabletLandscape, false]]) {
        const { context, page, errors } = await bootPage(browser, { storage: seed(TWO), device });
        if (openSheet) await page.locator('#mtab-lyrics').click();
        await page.locator('#songListToggle').click();
        await page.evaluate(() => startRenameSong(activeSongId));
        for (const pct of [50, 100, 150]) {
            await page.evaluate(p => setUiScale(p), pct);
            await waitStill(page);
            const px = await page.locator('.song-name-input').evaluate(el => parseFloat(getComputedStyle(el).fontSize));
            expect(px, `${name} 縮放 ${pct}% 字級 ${px}px`).toBeGreaterThanOrEqual(16);
        }
        expect(errors).toEqual([]);
        await context.close();
    }
});

test('歌曲清單：標題列放得下', async ({ browser }) => {
    const long = [song('song-l', '很長很長很長很長很長很長很長很長很長很長很長很長很長很長的歌名', 2000), song('song-s', '短', 1000)];
    for (const [name, device, openSheet] of [['手機', DEVICES.phone, true], ['平板直放', DEVICES.tablet, true], ['桌機', DESKTOP, false]]) {
        const { context, page, errors } = await bootPage(browser, { storage: seed(long), device });
        if (openSheet) await page.locator('#mtab-lyrics').click();
        for (const pct of [100, 150]) {
            await page.evaluate(p => setUiScale(p), pct);
            await waitStill(page);
            const panel = await rectOf(page, '#leftPanel');
            const kids = await page.locator('.lyrics-head > *').evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect(); return { n: el.id || el.className, x: r.x, y: r.y, width: r.width, height: r.height }; }));
            expect(kids.length).toBe(4);   // ☰ 歌曲、歌名、⬇ 匯出、⤢ 展開（R2：新增段落移到標籤＆情境下面）
            for (const k of kids) {
                expect(k.x, `${name} ${pct}% ${k.n} 左緣`).toBeGreaterThanOrEqual(panel.x - 0.5);
                expect(k.x + k.width, `${name} ${pct}% ${k.n} 右緣`).toBeLessThanOrEqual(panel.x + panel.width + 0.5);
            }
            for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
                expect(rectsOverlap(kids[i], kids[j]), `${name} ${pct}% ${kids[i].n} 與 ${kids[j].n} 重疊`).toBe(false);
            }
            const cur = await page.locator('#songCurrent').evaluate(el => ({ one: el.scrollHeight <= el.clientHeight + 1, ell: getComputedStyle(el).textOverflow }));
            expect(cur.one && cur.ell === 'ellipsis', name + ' 長歌名單行加刪節號').toBe(true);
        }
        expect(errors).toEqual([]);
        await context.close();
    }
});

test('歌曲清單：舊版單首模式', async ({ browser }) => {
    // 備份存不下 → 沒升級，維持舊版單首歌詞：沒有歌曲清單，標題列仍顯示歌名（F2）
    const big = { ...FIXTURE, haiku_lyrics: JSON.stringify([{ label: '', text: 'x'.repeat(600000) }]) };
    const { context, page, errors } = await bootPage(browser, { storage: big, device: DESKTOP, init: () => { Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true }); } });
    await expect(page.locator('#songListToggle')).toBeHidden();
    await expect(page.locator('#songCurrent')).not.toHaveText('');
    await page.evaluate(() => toggleSongList());
    await expect(page.locator('#songList')).toBeHidden();
    await page.evaluate(() => createSong());
    expect(await page.evaluate(() => songs.length)).toBe(1);
    expect(errors).toEqual([]);
    await context.close();
});

test('歌曲清單：收起面板就關掉清單', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: seed(TWO), device: PHONE });
    await openPhoneList(page);
    await page.evaluate(() => mobileTab('search'));
    await expect(page.locator('#songList')).toBeHidden();
    await expect(page.locator('#songListToggle')).toHaveAttribute('aria-expanded', 'false');
    // 桌機的推開欄：收起左面板不動偏好
    expect(await lsGet(page, 'lh:songListOpen')).toBeNull();
    expect(errors).toEqual([]);
    await context.close();

    const d = await bootPage(browser, { storage: seed(TWO), device: DESKTOP });
    await d.page.locator('#songListToggle').click();
    await d.page.evaluate(() => toggleLeftPanel());
    expect(await lsGet(d.page, 'lh:songListOpen')).toBe('true');
    await d.context.close();
});
