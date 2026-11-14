// 完整編輯器的吸附分列、右鍵選單、對齊、刪除確認；情境標籤的取代／擴充；畫布的手掌工具與觸控手勢；主視窗收合三角形
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage } from './helpers.mjs';
import { DEVICES } from './layout-lib.mjs';

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/v096-localStorage.json', import.meta.url), 'utf8'));
const typed = (id, type, text, extra = {}) => ({ id, type, custom: '', color: '', height: null, label: '', text, collapsed: false, ...extra });
const song = (sections, extra = {}) => ({ id: 's1', title: '第一首', sections, hashtags: [], context: '', createdAt: 1, updatedAt: 1, ...extra });
const storage = (songs, extra = {}) => ({ ...FIXTURE, 'lh:schema': '2', 'lh:songs': JSON.stringify(songs), 'lh:activeSong': songs[0].id, 'lh:tourSeen': '1', ...extra });
const three = () => [song([typed('s1', 'verse', '一二三'), typed('s2', 'verse', '四五六'), typed('s3', 'chorus', '七八九')])];
const HEAD = id => `#lyricsSections [data-id="${id}"] .lyrics-section-header`;
const order = page => page.evaluate(() => curSong().sections.map(s => s.id + (s.rj ? '+' : '')).join(','));
const boot = async (browser, songs, device = DEVICES.desktop, extra = {}) => {
    const r = await bootPage(browser, { device, storage: storage(songs, extra) });
    await r.page.evaluate(() => lhEditorOpen());
    return r;
};
// 滑鼠拖標題列到目標卡片的相對位置（fx, fy：0～1）
async function dragHead(page, id, toId, fx, fy) {
    const a = await page.locator(HEAD(id)).boundingBox();
    const b = await page.locator(`#lyricsSections [data-id="${toId}"]`).boundingBox();
    await page.mouse.move(a.x + a.width * 0.6, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(a.x + a.width * 0.6 + 12, a.y + a.height / 2 + 12, { steps: 3 });
    await page.mouse.move(b.x + b.width * fx, b.y + b.height * fy, { steps: 8 });
    return b;
}

test('吸附分列：照使用者的例子——verse2 拖到 verse1 右邊、verse3 拖到 verse2 右邊、再拖到中間互換', async ({ browser }) => {
    const { context, page, errors } = await boot(browser, three());
    await dragHead(page, 's2', 's1', 0.9, 0.5);
    await expect(page.locator('#lhRowPreview')).toBeVisible();
    await page.mouse.up();
    expect(await order(page)).toBe('s1,s2+,s3');
    await expect(page.locator('#lyricsSections')).toHaveAttribute('data-layout', 'rows');
    const b1 = await page.locator('#lyricsSections [data-id="s1"]').boundingBox(), b2 = await page.locator('#lyricsSections [data-id="s2"]').boundingBox();
    expect(Math.abs(b1.y - b2.y)).toBeLessThan(2);
    expect(b2.x).toBeGreaterThan(b1.x + b1.width - 2);
    expect(Math.abs(b1.width - b2.width)).toBeLessThan(3);
    // s3 拖到 s2 右邊 → 三張一列
    await dragHead(page, 's3', 's2', 0.9, 0.5);
    await page.mouse.up();
    expect(await order(page)).toBe('s1,s2+,s3+');
    // s3 拖到 s1 正中間 → 互換
    await dragHead(page, 's3', 's1', 0.5, 0.5);
    await page.mouse.up();
    expect(await order(page)).toBe('s3,s2+,s1+');
    // 一步復原回到上一個排列
    await page.evaluate(() => lhHistUndo());
    expect(await order(page)).toBe('s1,s2+,s3+');
    // 重新整理後版面還在
    await page.evaluate(() => flushSongs());
    await page.reload();
    await page.evaluate(() => lhEditorOpen());
    expect(await order(page)).toBe('s1,s2+,s3+');
    expect(errors).toEqual([]);
    await context.close();
});

test('吸附分列：上緣＝另開一列、Esc 取消、點標題列不拖仍是收合', async ({ browser }) => {
    const { context, page, errors } = await boot(browser, [song([typed('s1', 'verse', 'a', { }), typed('s2', 'verse', 'b', { rj: true }), typed('s3', 'verse', 'c')])]);
    await dragHead(page, 's3', 's1', 0.5, 0.05);
    await page.mouse.up();
    expect(await order(page)).toBe('s3,s1,s2+');
    await dragHead(page, 's2', 's3', 0.9, 0.5);
    await page.keyboard.press('Escape');
    await page.mouse.up();
    expect(await order(page)).toBe('s3,s1,s2+');
    await page.locator(HEAD('s1')).click({ position: { x: 150, y: 10 } });
    expect(await page.evaluate(() => curSong().sections.find(s => s.id === 's1').collapsed)).toBe(true);
    expect(errors).toEqual([]);
    await context.close();
});

test('右鍵：區塊標題列出現複製、刪除；刪除要先確認；對齊可獨立設定且可復原', async ({ browser }) => {
    const { context, page, errors } = await boot(browser, three());
    await page.locator(HEAD('s2')).click({ button: 'right', position: { x: 200, y: 10 } });
    const menu = page.locator('#sectionMenu');
    await expect(menu).toBeVisible();
    await expect(menu.locator('.section-act-dup')).toBeVisible();
    await expect(menu.locator('.section-act-del')).toBeVisible();
    // 置中
    await menu.locator('.section-align[data-align="center"]').click();
    await expect(page.locator('#lyricsSections [data-id="s2"]')).toHaveAttribute('data-align', 'center');
    expect(await page.locator('#lyricsSections [data-id="s2"] .section-textarea').evaluate(e => getComputedStyle(e).textAlign)).toBe('center');
    expect(await page.locator('#lyricsSections [data-id="s1"] .section-textarea').evaluate(e => getComputedStyle(e).textAlign)).not.toBe('center');
    await page.evaluate(() => lhHistUndo());
    expect(await page.evaluate(() => curSong().sections[1].align ?? null)).toBeNull();
    // 複製：下面多一份，內容相同、id 不同
    await page.locator(HEAD('s2')).click({ button: 'right', position: { x: 200, y: 10 } });
    await menu.locator('.section-act-dup').click();
    const copy = await page.evaluate(() => curSong().sections.map(s => s.text));
    expect(copy).toEqual(['一二三', '四五六', '四五六', '七八九']);
    // 刪除：先彈確認，取消不刪，確認才刪
    await page.locator(HEAD('s3')).click({ button: 'right', position: { x: 200, y: 10 } });
    await menu.locator('.section-act-del').click();
    await expect(page.locator('#lhAskOverlay')).toHaveClass(/show/);
    await page.locator('#lhAskActions .feedback-cancel-btn').click();
    expect(await page.evaluate(() => curSong().sections.length)).toBe(4);
    await page.locator('#lyricsSections [data-id="s3"] .section-remove').click();
    await expect(page.locator('#lhAskOverlay')).toHaveClass(/show/);
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => curSong().sections.length)).toBe(4);
    await page.locator('#lyricsSections [data-id="s3"] .section-remove').click();
    await page.locator('#lhAskActions .song-danger-btn').click();
    expect(await page.evaluate(() => curSong().sections.length)).toBe(3);
    expect(errors).toEqual([]);
    await context.close();
});

test('電燈泡：已有情境與標籤時問取代／擴充／取消', async ({ browser }) => {
    const mk = () => [song([typed('s1', 'verse', '夜裡的風吹過窗邊')], { context: '舊情境', hashtags: ['舊'] })];
    for (const [choice, ctx, tags] of [['取代', '新情境', ['新1', '新2']], ['擴充', '舊情境\n新情境', ['舊', '新1', '新2']], ['取消', '舊情境', ['舊']]]) {
        const { context, page, errors } = await bootPage(browser, { storage: storage(mk()), aiReply: '情境：新情境\n標籤：新1,新2' });
        let calls = 0;
        page.on('request', r => { if (/\/ai$/.test(r.url())) calls++; });
        await page.evaluate(() => document.querySelector('.context-refresh-btn').click());
        await expect(page.locator('#lhAskOverlay')).toHaveClass(/show/);
        await page.locator('#lhAskActions button', { hasText: choice }).click();
        if (choice === '取消') {
            await page.waitForTimeout(300);
            expect(calls).toBe(0);
        } else await expect(page.locator('#copyToast')).toHaveText('情境與標籤已更新 ✓');
        const st = await page.evaluate(() => ({ c: curSong().context, t: curSong().hashtags }));
        expect(st, choice).toEqual({ c: ctx, t: tags });
        expect(errors).toEqual([]);
        await context.close();
    }
});

const FREE = () => [song([typed('sa', 'verse', '一二三', { pos: { x: 40, y: 40, w: 300, h: 200 } })], { canvas: { mode: 'free' } })];
const fire = (page, type, init) => page.evaluate(([type, init]) => {
    const box = document.getElementById('lyricsSections');
    const t = init.target === 'box' ? box : document.querySelector(init.target);
    t.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, isPrimary: init.primary ?? true, pointerType: 'touch', pointerId: init.id, clientX: init.x, clientY: init.y }));
}, [type, init]);

test('自由畫布：單指拖空白處＝平移，雙指＝縮放，放開後不卡住', async ({ browser }) => {
    const songs = [song([typed('sa', 'verse', '一二三', { pos: { x: 40, y: 40, w: 300, h: 200 } }), typed('sb', 'verse', 'b', { pos: { x: 1600, y: 1200, w: 300, h: 200 } })], { canvas: { mode: 'free' } })];
    const { context, page, errors } = await boot(browser, songs, DEVICES.phone);
    await expect(page.locator('#lyricsSections')).toHaveAttribute('data-canvas', 'free');
    expect(await page.locator('#lyricsSections').evaluate(e => getComputedStyle(e).touchAction)).toBe('none');
    const r = await page.locator('#lyricsSections').boundingBox();
    const sc = () => page.evaluate(() => { const b = document.getElementById('lyricsSections'); return [b.scrollLeft, b.scrollTop]; });
    // 空白處單指往左上拖 → 畫布往右下捲
    const x = r.x + r.width - 20, y = r.y + r.height - 20;
    await fire(page, 'pointerdown', { target: 'box', id: 1, x, y });
    await fire(page, 'pointermove', { target: 'box', id: 1, x: x - 60, y: y - 80 });
    await fire(page, 'pointerup', { target: 'box', id: 1, x: x - 60, y: y - 80 });
    const [sl, st] = await sc();
    expect(sl).toBeGreaterThan(40); expect(st).toBeGreaterThan(60);
    // 雙指張開 → 放大；放開後再一指也能平移
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    await fire(page, 'pointerdown', { target: 'box', id: 2, x: cx - 30, y: cy });
    await fire(page, 'pointerdown', { target: 'box', id: 3, x: cx + 30, primary: false, y: cy });
    await fire(page, 'pointermove', { target: 'box', id: 3, x: cx + 90, y: cy });
    const z = await page.evaluate(() => _lhCvZ());
    expect(z).toBeGreaterThan(1.3);
    await fire(page, 'pointerup', { target: 'box', id: 2, x: cx - 30, y: cy });
    await fire(page, 'pointerup', { target: 'box', id: 3, x: cx + 90, y: cy });
    const before = await sc();
    await fire(page, 'pointerdown', { target: 'box', id: 4, x, y });
    await fire(page, 'pointermove', { target: 'box', id: 4, x, y: y - 30 });
    await fire(page, 'pointerup', { target: 'box', id: 4, x, y: y - 30 });
    expect((await sc())[1]).toBeGreaterThan(before[1] + 10);
    expect(errors).toEqual([]);
    await context.close();
});

test('自由畫布：左鍵拖空白處＝手掌工具；右鍵不平移（留給瀏覽器選單）', async ({ browser }) => {
    const songs = [song([typed('sa', 'verse', '一二三', { pos: { x: 40, y: 40, w: 300, h: 200 } }), typed('sb', 'verse', 'b', { pos: { x: 1600, y: 1200, w: 300, h: 200 } })], { canvas: { mode: 'free' } })];
    const { context, page, errors } = await boot(browser, songs);
    const r = await page.locator('#lyricsSections').boundingBox();
    const x = r.x + r.width - 40, y = r.y + r.height - 40;
    const pos = () => page.evaluate(() => { const b = document.getElementById('lyricsSections'); return [b.scrollLeft, b.scrollTop]; });
    await page.mouse.move(x, y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(x - 120, y - 90, { steps: 6 });
    await page.mouse.up({ button: 'right' });
    expect(await pos()).toEqual([0, 0]);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 120, y - 90, { steps: 6 });
    await page.mouse.up();
    const [sl, st] = await pos();
    expect(sl).toBeGreaterThan(80); expect(st).toBeGreaterThan(60);
    await expect(page.locator('#sectionMenu')).not.toBeVisible();
    expect(errors).toEqual([]);
    await context.close();
});

test('主視窗：非三直排時展開的面板沒有側邊分頁、改用標題列小三角形；三直排保留分頁', async ({ browser }) => {
    const WIDE = { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 };
    const seeds = { 'lh:tourSeen': '1', leftPanelCollapsed: 'false', rightPanelCollapsed: 'false' };
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', device: WIDE, storage: seeds });
    await expect(page.locator('#leftPanel .side-panel-tab')).toBeVisible();
    await expect(page.locator('#leftPanel .panel-fold-btn')).toBeHidden();
    await page.evaluate(() => { _dkTree = { d: 'col', k: ['results', { d: 'row', k: ['lyrics', 'ai'], s: [1, 1] }], s: [1, 1] }; lhDockRender(); });
    await expect(page.locator('#leftPanel .side-panel-tab')).toBeHidden();
    await expect(page.locator('#rightPanel .side-panel-tab')).toBeHidden();
    await page.locator('#rightPanel .panel-fold-btn').click();
    await expect(page.locator('#rightPanel')).toHaveClass(/collapsed/);
    await expect(page.locator('#rightPanel .side-panel-tab')).toBeVisible();   // 收起的保留分頁才能再打開
    expect(errors).toEqual([]);
    await context.close();
});

// ===== 平板三直排拉交界 =====
test('三直排（非寬螢幕）：拖左右交界線改面板寬度，重新整理還在，雙擊還原', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', device: { viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1 }, storage: { 'lh:tourSeen': '1', leftPanelCollapsed: 'false', rightPanelCollapsed: 'false' } });
    const w = sel => page.locator(sel).evaluate(e => e.getBoundingClientRect().width);
    expect(await page.evaluate(() => document.body.classList.contains('dock'))).toBe(false);
    const L = page.locator('.pane-divider-l'), R = page.locator('.pane-divider-r');
    await expect(L).toBeVisible();
    const l0 = await w('#leftPanel'), r0 = await w('#rightPanel');
    let b = await L.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + 60, b.y + b.height / 2, { steps: 5 });
    await page.mouse.up();
    expect(Math.abs((await w('#leftPanel')) - l0 - 60)).toBeLessThan(3);
    b = await R.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 - 40, b.y + b.height / 2, { steps: 5 });
    await page.mouse.up();
    expect(Math.abs((await w('#rightPanel')) - r0 - 40)).toBeLessThan(3);
    // 重新整理還在
    const keep = await w('#rightPanel');
    await page.reload();
    expect(Math.abs((await w('#rightPanel')) - keep)).toBeLessThan(2);
    await L.dblclick();
    expect(Math.abs((await w('#leftPanel')) - l0)).toBeLessThan(2);
    // 拉過頭：主畫面至少留 24rem
    b = await L.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(1300, b.y + b.height / 2, { steps: 5 });
    await page.mouse.up();
    expect(await w('#mainContainer')).toBeGreaterThanOrEqual(24 * 16 - 2);
    expect(errors).toEqual([]);
    await context.close();
});

// ===== AI 完成特效 =====
const fxBoot = async (browser, extra = {}) => {
    const r = await bootPage(browser, { storage: { 'lh:tourSeen': '1', ...extra } });
    await r.page.route('**/ai', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, text: '安心、平安', model: { id: 'm', label: 'M' }, usage: { total_tokens: 123 }, tried: [] }) }));
    await r.page.fill('#searchInput', '安');
    await r.page.waitForTimeout(800);
    await r.page.evaluate(() => document.getElementById('generateBtn').click());
    return r;
};
test('AI 完成：在按鈕旁噴金幣、token 小字寫在「回報詞語」右邊的狀態列並淡出，不再跳中間的浮窗', async ({ browser }) => {
    const { context, page, errors } = await fxBoot(browser);
    await expect(page.locator('.lh-fx')).toHaveCount(1);
    await expect(page.locator('#aiStatus')).toContainText('123 tokens');
    await expect(page.locator('#aiStatus')).toHaveClass(/fade/, { timeout: 6000 });
    expect(await page.locator('#copyToast.show').count()).toBe(0);
    await expect(page.locator('.lh-fx')).toHaveCount(0, { timeout: 6000 });
    expect(errors).toEqual([]);
    await context.close();
});
test('AI 完成：偏好設定關掉動畫就什麼都不出現（含 token 提示）', async ({ browser }) => {
    const { context, page, errors } = await fxBoot(browser, { 'lh:bgFx': 'off' });
    await page.waitForTimeout(1200);
    expect(await page.locator('.lh-fx').count()).toBe(0);
    expect(await page.locator('#copyToast.show').count()).toBe(0);
    expect(await page.locator('#aiWordsContainer .ai-word-card').count()).toBeGreaterThan(0);
    expect(errors).toEqual([]);
    await context.close();
});

// 拖縫：同列兩張的直縫＝寬度一起變（靠近別列的縫會隔空對齊、拖曳中就有導引線）；兩列之間的橫縫＝上高下矮；各一步復原
test('吸附分列：拖卡片之間的縫調整寬度與列高，隔空對齊，一步復原', async ({ browser }) => {
    const four = [song(['a', 'b', 'c', 'd'].map((id, i) => typed(id, 'verse', '一二三', i % 2 ? { rj: true } : {})))];
    const { context, page, errors } = await boot(browser, four);
    const box = id => page.locator(`#lyricsSections [data-id="${id}"]`).boundingBox();
    const seam = async (l, r) => { const A = await box(l), B = await box(r); return [(A.x + A.width + B.x) / 2, A.y + A.height / 2]; };
    const rw = () => page.evaluate(() => curSong().sections.map(s => s.rw ?? null));
    // 第二列的縫往右 150px
    let [x, y] = await seam('c', 'd');
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 150, y, { steps: 4 });
    await expect(page.locator('#lhRowGuide')).toBeVisible();   // 拖曳中就看得到線
    await page.mouse.up();
    const after = await rw();
    expect(after[0]).toBeNull();
    expect(after[2]).toBeGreaterThan(60);
    expect(after[2] + after[3]).toBe(120);
    // 第一列的縫拖到差一點的位置：吸到第二列的縫
    [x, y] = await seam('a', 'b');
    const target = (await box('d')).x;
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(target - 20, y, { steps: 4 });
    await expect(page.locator('#lhRowGuide.snap')).toBeVisible();
    await page.mouse.up();
    expect((await rw()).slice(0, 2)).toEqual(after.slice(2));
    // 兩列之間的橫縫往下 60px：上一列變高、下一列同時變矮
    const A = await box('a'), C = await box('c');
    const hy = (A.y + A.height + C.y) / 2;
    await page.mouse.move(A.x + 40, hy); await page.mouse.down(); await page.mouse.move(A.x + 40, hy + 60, { steps: 4 }); await page.mouse.up();
    const rh = await page.evaluate(() => curSong().sections.map(s => s.rh ?? null));
    expect(Math.abs(rh[0] - (A.height + 60))).toBeLessThanOrEqual(2);
    expect(Math.abs(rh[2] - Math.max(64, C.height - 60))).toBeLessThanOrEqual(2);
    expect(Math.abs((await box('b')).height - rh[0])).toBeLessThanOrEqual(1);   // 同列等高
    await page.locator('#undoBtn').click();
    expect(await page.evaluate(() => curSong().sections.every(s => s.rh === undefined))).toBe(true);
    expect(errors).toEqual([]);
    await context.close();
});
