// 詞卡（多字直接查雙押）與詞宇宙：js/word-space.js
import { test, expect } from '@playwright/test';
import { bootPage } from './helpers.mjs';

test('查整個詞：判斷、押韻比對（同母音／同子音／同讀音、同聲調、排除借韻）、選項列切換、顯示全部開關', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub' });
    const r = await page.evaluate(() => {
        const E = [
            { w: '辦法', z: 'ㄅㄢˋ ㄈㄚˇ', p: 50 },   // ㄢ·ㄚ，4·3 聲
            { w: '看法', z: 'ㄎㄢˋ ㄈㄚˇ', p: 90 },   // 4·3
            { w: '專家', z: 'ㄓㄨㄢ ㄐㄧㄚ', p: 70 },  // 借韻 ㄨㄢ·ㄧㄚ，1·1
            { w: '安靜', z: 'ㄢ ㄐㄧㄥˋ', p: 99 },    // 第二字不押
            { w: '三個字', z: 'ㄙㄢ ㄍㄜ˙ ㄗˋ', p: 1 },
        ];
        const T = [{ rhyme: 'ㄢ', tone: 1 }, { rhyme: 'ㄚ', tone: 3 }];
        const ws = o => lhWsMatch(E, T, '安打', o).map(e => e.w).join(',');
        return {
            q: ['安打', '安 打', '安', '*打', '**', 'an'].map(s => !!lhWsQuery(s)),
            all: ws({}), tone: ws({ tone: true }), strict: ws({ strict: true }), hidden: ws({ hidden: new Set(['看法']) }),
            // 同讀音：誇張 → 看漲（ㄎ 同聲母＋ㄓㄤ 同音）、誇獎（ㄎㄨㄚ 同音＋ㄤ 押韻）；高興兩個都不符
            same: (() => {
                const K = [{ w: '看漲', z: 'ㄎㄢˋ ㄓㄤˇ', p: 5 }, { w: '誇獎', z: 'ㄎㄨㄚ ㄐㄧㄤˇ', p: 9 }, { w: '高興', z: 'ㄍㄠ ㄒㄧㄥˋ', p: 99 }, { w: '跨行', z: 'ㄎㄨㄚˋ ㄏㄤˊ', p: 3 }];
                const T = [{ zy: 'ㄎㄨㄚ', rhyme: 'ㄨㄚ', tone: 1 }, { zy: 'ㄓㄤ', rhyme: 'ㄤ', tone: 1 }];
                const m = o => lhWsMatch(K, T, '誇張', o).map(e => e.w).join(',');
                return { same: m({ mode: 'same' }), strict: m({ mode: 'same', strict: true }), init: m({ mode: 'initial' }), rhyme: m({}) };
            })(),
        };
    });
    expect(r.q).toEqual([true, false, false, true, false, false]);
    expect(r.all).toBe('看法,專家,辦法');   // 常用（p 大）的在前
    expect(r.tone).toBe('');                 // 第一字目標是 1 聲：辦法、看法是 4 聲，專家第二字是 1 聲
    expect(r.strict).toBe('看法,辦法');       // 專家是借韻
    expect(r.hidden).toBe('專家,辦法');
    expect(r.same).toEqual({ same: '誇獎,看漲,跨行', strict: '看漲,跨行', init: '看漲', rhyme: '誇獎,跨行' });
    // 選項列：空的收起、查詞換成詞卡選項、查單字是字卡選項；按「同讀音」會切換
    await expect(page.locator('.options')).toBeHidden();
    await page.fill('#searchInput', '安打');
    await expect(page.locator('#wsModeGroup')).toBeVisible();
    await expect(page.locator('#batchPanel')).toBeHidden();
    await page.locator('[data-ws="same"]').click();
    await expect(page.locator('[data-ws="same"]')).toHaveClass(/active/);
    await page.locator('[data-ws-f="tone"]').click();
    await page.locator('[data-ws-f="strict"]').click();
    await expect(page.locator('[data-ws-f="tone"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-ws-f="strict"]')).toHaveAttribute('aria-pressed', 'true');
    await page.fill('#searchInput', '安');
    await expect(page.locator('#batchPanel')).toBeVisible();
    await expect(page.locator('#wsModeGroup')).toBeHidden();
    // 詞宇宙：用假清單打開，三塊面板收走、Esc 收合回來
    await page.evaluate(() => { _lhWs.input = '安打'; _lhWs.list = [{ w: '辦法', z: 'ㄅㄢˋ ㄈㄚˇ', p: 50 }, { w: '看法', z: 'ㄎㄢˋ ㄈㄚˇ', p: 90 }]; lhWsOpen(); });
    await expect.poll(() => page.evaluate(() => _lhSp.words.length)).toBe(2);   // 0.98.05 起畫在 canvas 上
    await expect(page.locator('body')).toHaveClass(/ws-open/);
    expect(await page.evaluate(() => document.getElementById('mainContainer').inert)).toBe(true);
    // 圖例：一欄、依第一個字的聲調收納，點開才看到組合；釘三個詞連成星座
    expect(await page.locator('.ws-leg-tone').count()).toBe(1);
    await expect(page.locator('.ws-sub')).toBeHidden();
    const pts = await page.evaluate(async () => {
        const ws = _lhSp.words;
        ws.push(...ws.map(w => ({ ...w })));   // 只有兩個詞：複製出第三、四個假的位置點就好
        ws.forEach((w, i) => { w.px = [0, 100, 0, 300][i]; w.py = [0, 0, 100, 300][i]; });
        for (const w of ws.slice(0, 3)) { w.pinned = true; _lhSpPin(w); }
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const tri = _lhSp.segs.length;
        ws[3].pinned = true; _lhSpPin(ws[3]);   // 第四點：連 1～3 個舊點
        const fourth = _lhSp.chords.filter(c => c[0] === ws[3]).length;
        return [tri, fourth];
    });
    expect(pts[0]).toBe(3);   // 三個點連成三角形（三條邊）
    expect(pts[1]).toBeGreaterThanOrEqual(1);
    expect(pts[1]).toBeLessThanOrEqual(3);
    // 按住恆星還沒拖：整團不動（之前會被拉到畫面中央）
    const star0 = await page.evaluate(() => { const c = _lhSp.groups[0]; return c ? [c.x, c.y] : null; });
    if (star0) {
        const sp = await page.evaluate(() => _lhSpScreenOf(_lhSp.words.find(w => w.star)));
        await page.mouse.move(sp.x, sp.y);
        await page.mouse.down();
        await page.waitForTimeout(200);
        const c1 = await page.evaluate(() => [_lhSp.groups[0].x, _lhSp.groups[0].y]);
        await page.mouse.up();
        expect(Math.hypot(c1[0] - star0[0], c1[1] - star0[1])).toBeLessThan(15);
    }
        // 點一下釘住、再點一次取消釘選（滑鼠還停在上面也不會再亮）
    const w0 = await page.evaluate(() => { const w = _lhSp.words.find(x => !x.comet); return w ? w.w : null; });
    if (w0) {
        await page.evaluate(() => { _lhSp.words = _lhSp.words.slice(0, 2); _lhSpClear(); });   // 拿掉上面為了星座複製的假點
        const at = await page.evaluate(n => _lhSpScreenOf(_lhSp.words.find(x => x.w === n)), w0);
        await page.mouse.click(at.x, at.y);
        // 0.98.07：點詞＝釘住＋保留
        expect(await page.evaluate(n => [_lhSp.words.find(x => x.w === n).pinned, savedWords.includes(n)], w0)).toEqual([true, true]);
        const at2 = await page.evaluate(n => _lhSpScreenOf(_lhSp.words.find(x => x.w === n)), w0);
        await page.mouse.click(at2.x, at2.y);
        expect(await page.evaluate(n => { const w = _lhSp.words.find(x => x.w === n); return [w.pinned, w.hot, savedWords.includes(n)]; }, w0)).toEqual([false, false, false]);
        // 不管選幾個：點空白一下不取消，要雙擊空白（不問）；或面板「取消選取」按兩下（第一下變確認）
        await page.mouse.click(at2.x, at2.y);
        await page.mouse.move(5, 450);
        await page.mouse.click(5, 450);
        expect(await page.evaluate(() => _lhSp.words.some(w => w.pinned))).toBe(true);
        await page.mouse.dblclick(5, 450);
        expect(await page.evaluate(n => [_lhSp.words.some(w => w.pinned), savedWords.includes(n)], w0)).toEqual([false, false]);
        const at3 = await page.evaluate(n => _lhSpScreenOf(_lhSp.words.find(x => x.w === n)), w0);
        await page.mouse.click(at3.x, at3.y);
        const clr = page.locator('.ws-clear');
        await expect(clr).toBeVisible();
        await clr.click();
        await expect(clr).toHaveText(/確定取消 1 個/);
        expect(await page.evaluate(() => _lhSp.words.some(w => w.pinned))).toBe(true);
        await clr.click();
        expect(await page.evaluate(n => [_lhSp.words.some(w => w.pinned), savedWords.includes(n)], w0)).toEqual([false, false]);
        await expect(clr).toBeHidden();
        // 選兩個：點空白一下不取消，雙擊空白才全部取消（不問）
        for (const w of await page.evaluate(() => _lhSp.words.map(x => x.w))) {
            const p = await page.evaluate(n => _lhSpScreenOf(_lhSp.words.find(x => x.w === n)), w);
            await page.mouse.click(p.x, p.y);
        }
        await page.mouse.move(5, 450);
        await page.mouse.click(5, 450);
        await page.waitForTimeout(500);
        expect(await page.evaluate(() => _lhSp.words.filter(w => w.pinned).length)).toBe(2);
        await page.mouse.dblclick(5, 450);
        expect(await page.evaluate(() => _lhSp.words.some(w => w.pinned))).toBe(false);
    }
    await page.keyboard.press('Escape');
    await expect(page.locator('#wordSpace')).toBeHidden();
    expect(await page.evaluate(() => document.getElementById('mainContainer').inert)).toBe(false);
    expect(errors).toEqual([]);
    await context.close();
});

test('關聯詞彙：選了字卡才出現按鈕；字首／字尾／任意的清單；星雲面板有字首、字尾', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub' });
    const r = await page.evaluate(() => {
        const keep = wordlistData;
        wordlistData = [{ w: '安心', z: '', p: 9 }, { w: '平安', z: '', p: 8 }, { w: '心安理得', z: '', p: 7 }, { w: '天空', z: '', p: 6 }];
        const f = pos => _lhWsRelList(['安'], pos).map(e => e.w).join(',');
        const out = { any: f(''), head: f('head'), tail: f('tail') };
        wordlistData = keep;
        return out;
    });
    expect(r).toEqual({ any: '安心,平安,心安理得', head: '安心', tail: '平安' });
    await page.fill('#searchInput', 'ㄢ');
    await expect(page.locator('#resultsContainer .char-card').first()).toBeVisible();
    await expect(page.locator('#wsRelBtn')).toBeHidden();
    await page.locator('#resultsContainer .char-card .char-main').first().click();
    await expect(page.locator('#wsRelBtn')).toBeVisible();
    await page.evaluate(() => { const c = [...selectedChars][0]; wordlistData = [...wordlistData, { w: c + '心', z: 'ㄚ ㄒㄧㄣ', p: 9 }, { w: '平' + c, z: 'ㄆㄧㄥˊ ㄚ', p: 8 }, { w: c + '靜', z: 'ㄚ ㄐㄧㄥˋ', p: 7 }]; });   // stub 詞庫補幾個含選取字的詞
    await page.locator('#wsRelBtn').click();
    await expect(page.locator('body')).toHaveClass(/ws-open/);
    await expect(page.locator('#wordSpace .ws-pos:not(.ws-len)')).toBeVisible();
    await expect(page.locator('#wordSpace .ws-len [data-len]')).toHaveCount(4);
    await page.locator('#wordSpace [data-pos="head"]').click();
    await expect(page.locator('#wordSpace [data-pos="head"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#wordSpace [data-pos="tail"]').click();
    await expect(page.locator('#wordSpace [data-pos="head"]')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#wordSpace [data-pos="tail"]')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(page.locator('#wordSpace')).toBeHidden();
    expect(errors).toEqual([]);
    await context.close();
});

test('詞卡回報：數量那一列右邊，先挑詞卡再送出', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub' });
    await page.evaluate(() => { _lhWs.list = []; });
    await page.fill('#searchInput', '安打');
    const head = page.locator('.ws-header');
    await expect(head).toBeVisible();
    const rep = head.locator('.ws-rep .btn-report');
    if (await page.locator('.ws-card').count() === 0) { await context.close(); return; }   // stub 詞庫沒有押到的詞就略過互動
    const [cb, rb] = [await head.locator('.results-count').boundingBox(), await rep.boundingBox()];
    expect(Math.abs((cb.y + cb.height / 2) - (rb.y + rb.height / 2))).toBeLessThan(12);   // 同一列
    await rep.click();
    await page.locator('.ws-card').first().click();
    await expect(rep).toContainText('送出回報（1）');
    await rep.click();
    await expect(page.locator('#reportModalOverlay')).toHaveClass(/show/);
    expect(errors).toEqual([]);
    await context.close();
});

test('星雲顏色加透明度：oklch 等任何格式都換成合法的 rgba（0.98.09 第 4、5 級整格畫不出來的 bug）', async ({ browser }) => {
    const { context, page } = await bootPage(browser, { wordlist: 'stub' });
    expect(await page.evaluate(() => _lhSpRGBA('oklch(0.73 0.12 61)', 0.2))).toMatch(/^rgba\(\d+, \d+, \d+, 0\.2\)$/);
    await context.close();
});

test('詞卡選取：點了有外框（＝保留）、再點取消、保留區打叉也取消、換關鍵詞再回來還記得', async ({ browser }) => {
    const { context, page } = await bootPage(browser, {});   // 完整詞庫才有押到的詞卡
    await page.fill('#searchInput', '安打');
    const card = page.locator('.ws-card').first();
    await expect(card).toBeVisible({ timeout: 20000 });
    const w = await card.getAttribute('data-char');
    await card.click();
    await expect(card).toHaveClass(/\bkept\b/);
    await card.click();
    await expect(card).not.toHaveClass(/\bkept\b/);
    expect(await page.evaluate(n => savedWords.includes(n), w)).toBe(false);
    await card.click();
    await page.evaluate(n => removeSavedWord(n), w);   // 保留區打叉走的就是 removeSavedWord
    await expect(card).not.toHaveClass(/\bkept\b/);
    await card.click();
    await page.fill('#searchInput', '安');
    await page.fill('#searchInput', '安打');
    await expect(page.locator(`.ws-card[data-char="${w}"]`)).toHaveClass(/\bkept\b/);
    await context.close();
});

test('換批：點數字、點滑桿都能切換（第 3 級鏡頭一甩、第 5 級星際穿越）', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {});
    await page.fill('#searchInput', '心');
    await expect(page.locator('.char-card').first()).toBeVisible({ timeout: 20000 });
    for (const lv of [3, 5]) {
        await page.evaluate(lv => { lhFxSetLevel(lv); selectedChars.clear(); selectedChars.add('心'); lhWsRelOpen(); }, lv);
        await expect(page.locator('.ws-pages')).toBeVisible({ timeout: 10000 });
        await page.locator('.ws-page-ticks button', { hasText: '3' }).click();
        await expect.poll(() => page.evaluate(() => _lhSp.cfg.page)).toBe(2);
        const box = await page.locator('.ws-page-range').boundingBox();
        await page.mouse.click(box.x + box.width * 0.05, box.y + box.height / 2);
        await expect.poll(() => page.evaluate(() => _lhSp.cfg.page)).toBe(0);
        await page.evaluate(() => lhWsClose());
        await expect(page.locator('#wordSpace')).toBeHidden();
    }
    expect(errors).toEqual([]);
    await context.close();
});

// 0.98.21 Andy 暫時的調參面板：縮放鈕左邊的 ⚙ 打開、滑桿即時改 LH_SP_TUNE、還原預設
test('詞宇宙：調參齒輪（暫時）', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: { 'lh:bgFx': '5', 'lh:spTuneUI': '1' } });   // 齒輪平常藏起來，lh:spTuneUI＝1 才出現
    await page.evaluate(() => { _lhWs.input = '安打'; _lhWs.list = [{ w: '辦法', z: 'ㄅㄢˋ ㄈㄚˇ', p: 50 }, { w: '看法', z: 'ㄎㄢˋ ㄈㄚˇ', p: 90 }]; lhWsOpen(); });
    await expect.poll(() => page.evaluate(() => _lhSp.words.length)).toBe(2);
    const gear = page.locator('.ws-zoom .ws-gear');
    await expect(page.locator('.ws-zoom > *').first()).toHaveClass(/ws-gear/);   // 0.98.41：內部工具（齒輪、快轉）最左，再來才是「?」
    await expect(page.locator('.ws-zoom > *').nth(2)).toHaveClass(/ws-help/);
    await expect(page.locator('.ws-tune')).toBeHidden();
    await gear.click();
    await expect(page.locator('.ws-tune')).toBeVisible();
    await expect(page.locator('.ws-tune-ch')).toHaveText(['星系', '恆星', '行星', '黑洞', '白洞', '互動']);   // 第二層收納：外層六大類
    await expect(page.locator('.ws-tune-h')).toHaveText(['宇宙', '公轉', '流星', '混沌凝聚', '凝聚浮現', '光暈閃爍', '日冕', '輻射', '熱浪', '公轉', '凝聚浮現', '殘影：公轉煙霧', '殘影：凝聚煙霧', '被吞重生', '外觀', '範圍', '引力', '事件視界', '瓦解', '吸食', '出口', '甩動', '拖詞到黑洞', '殘影：縮放光帶', '殘影：拖畫布光帶', '游標放大鏡', '星座', '抓行星']);
    await page.locator('.ws-tune-ch', { hasText: '星系' }).click();
    await page.locator('.ws-tune-h', { hasText: '混沌凝聚' }).click();   // 每組一開始收起來
    await page.locator('.ws-tune-ch', { hasText: '恆星' }).click();
    await page.locator('.ws-tune-h', { hasText: '輻射' }).click();
    const row = page.locator('.ws-tune-row', { hasText: '阻尼（越小擺盪越多次）' });
    await row.locator('input').fill('0.5');
    await expect(row.locator('output')).toHaveText('0.5');
    const row2 = page.locator('.ws-tune-row', { hasText: '光芒數' });
    await row2.locator('input').fill('10');
    expect(await page.evaluate(() => [LH_SP_TUNE.gather.damp, LH_SP_STARFX.rays.n])).toEqual([0.5, 10]);
    expect(JSON.parse(await page.evaluate(() => localStorage.getItem('lh:spTune'))).gather.damp).toBe(0.5);   // 調過的值記在瀏覽器
    await page.locator('.ws-tune-btn', { hasText: '還原預設' }).click();
    expect(await page.evaluate(() => localStorage.getItem('lh:spTune'))).toBeNull();
    expect(await page.evaluate(() => [LH_SP_TUNE.gather.damp, LH_SP_STARFX.rays.n])).toEqual(await page.evaluate(() => [LH_SP_TUNE_DEF.gather.damp, LH_SP_TUNE_DEF.starfx.rays.n]));   // 預設可能被 js/sp-tune-defaults.js 改過：跟目前的預設比
    await expect(row.locator('output')).toHaveText(String(await page.evaluate(() => LH_SP_TUNE_DEF.gather.damp)));
    // 0.98.22.7：快速縮放留殘影光帶、停手後從尾巴收完就清空（直接每格縮小鏡頭模擬快速縮放）
    await page.evaluate(() => { LH_SP_TUNE.trail.min = 0; });   // 門檻歸零：不受 js/sp-tune-defaults.js 的門檻影響，測試結果固定
    await page.evaluate(() => new Promise(res => { let n = 0; const f = () => { _lhSp.z *= 0.88; _lhSp.dirty = true; if (++n < 20) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); }));
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => _lhSp.words.some(w => w.trl && w.trl.length > 1))).toBe(true);
    await expect.poll(() => page.evaluate(() => _lhSp.words.every(w => !w.trl)), { timeout: 15000 }).toBe(true);   // 停留＋照消逝速度收完（照目前預設）
    expect(await page.evaluate(() => _lhSp.words.every(w => !w.trl))).toBe(true);   // 收完就清空
    await page.waitForTimeout(300);   // 畫幾格，確定新參數不會讓畫布出錯
    expect(errors).toEqual([]);
    await context.close();
});

// 0.98.41 Andy 新黑洞引力：a×(1−d/R)^b、速度上限、掉進核心＝吞。用宇宙半徑 1% 當單位＝大小宇宙同樣的軌跡比例
// 2026-11-21：拿掉逃逸反阻尼（fast）、視界內只准往內（trap）——到了事件視界改成凍住（_lhSpFzStep，下一個測試）
test('黑洞：新引力——從靜止掉進核心、速度不超過上限、大小宇宙比例一樣、範圍邊緣路過不會被吞', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub' });
    const r = await page.evaluate(() => {
        const T = { ...LH_SP_TUNE.bh, ga: 200, gb: 3, gmax: 30, range: 75, lensR: 10 };
        const run = (u, x0, vy0) => {   // u＝宇宙半徑 1%；回傳：被吞、最高速（u／秒）、結束時位置（u）
            const H = { x: 0, y: 0, r: u, R: u * T.range, u, L: u * T.lensR, s: u * T.scatR, z: u * T.lensR * 0.5 }, o = { x: x0 * u, y: 0, vx: 0, vy: vy0 * u };
            let vmax = 0, st = 1, dt = 1 / 120, t = 0;
            for (; t < 120 && st === 1; t += dt) { st = _lhSpBhG(o, H, T, dt); o.x += o.vx * dt; o.y += o.vy * dt; vmax = Math.max(vmax, Math.hypot(o.vx, o.vy) / u); }
            return { eaten: st === 2, vmax: +vmax.toFixed(2), t: +t.toFixed(2), x: +(o.x / u).toFixed(2) };
        };
        return { fall: run(30, 60, 0), fall2: run(5, 60, 0), pass: run(30, 74, 4) };
    });
    expect(r.fall.eaten, JSON.stringify(r.fall)).toBe(true);
    expect(r.fall.vmax).toBeLessThanOrEqual(30.001);
    expect(r.fall2.t, '宇宙大小不同，掉進去的時間一樣').toBeCloseTo(r.fall.t, 1);
    expect(r.pass.eaten, '範圍邊緣橫著路過：不會被吞 ' + JSON.stringify(r.pass)).toBe(false);
    expect(errors).toEqual([]);
    await context.close();
});

// 2026-11-21 Andy 選 A：碰到事件視界＝凍在那圈上——角度收斂（越轉越慢）、往裡沉不超過 12%、bh.fzT 秒淡完＝被吃掉
test('黑洞：事件視界凍結——越轉越慢、停在圈上、照秒數淡完', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub' });
    const r = await page.evaluate(() => {
        const H = { x: 100, y: 0 }, w = {}, Tf = LH_SP_TUNE.bh.fzT;
        _lhSpFzStart(w, 150, 0, 0, 40, H, 0.1, 0);   // 半徑 50、往上 40／秒、時間已經被拖到 0.1 倍
        const S = [];
        for (const s of [0, 0.5, 1, 2, Tf * 0.99, Tf]) { const done = _lhSpFzStep(w, H, s * 1000); S.push({ s, done, r: Math.hypot(w.fz.x - H.x, w.fz.y - H.y), a: Math.atan2(w.fz.y - H.y, w.fz.x - H.x), u: w.fz.u, e: w.fz.e }); }
        return S;
    });
    expect(r[0].r).toBeCloseTo(50, 3);
    for (let i = 1; i < r.length; i++) {
        expect(r[i].r, '只往裡沉、不往外').toBeLessThanOrEqual(r[i - 1].r + 1e-9);
        expect(r[i].r, '最多沉 12%').toBeGreaterThanOrEqual(50 * 0.88 - 1e-9);
        expect(r[i].a - r[i - 1].a, '照原本方向轉').toBeGreaterThanOrEqual(0);
        expect(r[i].e, '時間越來越慢').toBeLessThan(r[i - 1].e);
    }
    expect(r[2].a - r[1].a, '越轉越慢').toBeLessThan(r[1].a - r[0].a);
    expect(r[r.length - 2].done).toBe(false);
    expect(r[r.length - 1].done).toBe(true);
    expect(errors).toEqual([]);
    await context.close();
});

// 2026-11-21 Andy（輕輕一下就滑超遠、沒甩也滑）：滑行距離＝速度 × grab.glide 秒（直線等減速），最遠＝離宇宙邊界最遠距離 × bh.brake%；
// 放手的速度只看最後 0.1 秒、停住超過 0.08 秒＝沒甩、畫面上慢於 grab.flingMin＝只是放下
test('甩動：滑多遠跟出手速度成正比（有上限）、慢放＝不滑、停住再放＝不滑', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub' });
    const r = await page.evaluate(() => {
        _lhSp.bhShape = _lhSpAmoeba(); _lhSp.bhK = 1000;
        const AM = _lhSp.bhShape; let far = 0; for (let i = 0; i < AM.pts.length; i += 8) far = Math.max(far, Math.hypot(AM.pts[i][0] * 1000 - 100, AM.pts[i][1] * 1000));
        const glide = v => v * v / (2 * _lhSpBrakeOf(100, 0, v, 0, 30));   // 直線等減速：煞停的路＝v²／(2×減速度)
        const G = LH_SP_TUNE.grab.glide, z = _lhSpZv(), fv = (h, tUp) => _lhSpFlingV(h, tUp);
        const H = (v, n) => Array.from({ length: n }, (_, i) => ({ t: 1000 + i * 16, x: i * 16 / 1000 * v / z, y: 0 }));   // 畫面上 v px／秒的拖動
        const last = h => h[h.length - 1].t;
        const out = { far, slow: glide(100), slow2: glide(200), huge: glide(1e5),
            fSlow: fv(H(100, 10), last(H(100, 10)) + 10).vx, fFast: fv(H(2000, 10), last(H(2000, 10)) + 10).vx * z, fPause: fv(H(2000, 10), last(H(2000, 10)) + 200).vx, fMin: LH_SP_TUNE.grab.flingMin };
        _lhSp.bhShape = null; _lhSp.bhK = 0;
        return { ...out, want: [100 * G, 200 * G] };
    });
    expect(Math.abs(r.slow - r.want[0]) / r.want[0], JSON.stringify(r)).toBeLessThan(0.03);
    expect(r.slow2 / r.slow, '快一倍＝滑遠一倍').toBeCloseTo(2, 1);
    expect(Math.abs(r.huge - r.far * 0.3) / (r.far * 0.3), '再快也不超過上限').toBeLessThan(0.03);
    expect(r.fSlow, '慢慢拖放手＝沒甩').toBe(0);
    expect(r.fPause, '停住 0.2 秒才放＝沒甩').toBe(0);
    expect(r.fFast, '快甩：超過門檻的部分才算').toBeCloseTo(2000 - r.fMin, -1);
    expect(errors).toEqual([]);
    await context.close();
});

// 2026-11-21 Andy bug：恆星被吞（到遠方重生）那一刻，飛散中的行星在畫面上瞬間跳格——整團呼吸以恆星為中心縮放，
// 離恆星越遠被拉越多（距離 × 呼吸幅度）。飛散的行星改照「自己家離恆星多遠」算呼吸位移，恆星搬家不影響它畫在哪
test('黑洞：恆星瞬間搬家（被吞重生），飛散中的行星畫的位置不跳', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: { 'lh:bgFx': '5', 'lh:spTuneUI': '1' } });
    await page.evaluate(() => { _lhWs.input = '安打'; _lhWs.list = wordlistData.filter(e => [...e.w].length === 2 && /ㄢ/.test(e.z)).slice(0, 60); lhWsOpen(); });
    await page.waitForFunction(() => _lhSp.words.length > 10 && !(_lhSp.queue || []).length, null, { timeout: 30000 });
    await page.locator('.ws-zoom .ws-skip').click();   // 跳過凝聚：行星回到軌道上
    await page.waitForFunction(() => _lhSp.groups.filter(c => _lhSp.words.some(w => w.cl === c && !w.star && !w.free)).length >= 2, null, { timeout: 20000 });
    const r = await page.evaluate(() => new Promise(res => {
        const cl = _lhSp.groups.find(c => _lhSp.words.some(w => w.cl === c && !w.star)), w = _lhSp.words.find(o => o.cl === cl && !o.star);
        Object.assign(cl, { ba: 0.3, bp: 1e9, ph: [Math.PI / 2, ...cl.ph.slice(1)] });   // 呼吸固定在最大（b≈1.3），結果不看運氣
        Object.assign(w, { free: true, fx: cl.x + 3000, fy: cl.y, fvx: 0, fvy: 0, reW: _lhSpNow() + 1e6, gk: 0 });   // 飛散在 3000 外、還在等（reW：不被拉回）
        setTimeout(() => {
            const a = { x: w.px, y: w.py, fx: w.fx, fy: w.fy };
            cl.hx += 5000; cl.hy -= 4000; cl.x += 5000; cl.y -= 4000;   // 恆星瞬間搬家
            setTimeout(() => res({ jump: Math.hypot(w.px - a.x - (w.fx - a.fx), w.py - a.y - (w.fy - a.fy)), off: Math.hypot(a.x - a.fx, a.y - a.fy), r: w.r }), 150);
        }, 150);
    }));
    expect(r.jump, '恆星搬家：行星畫的位置只照自己的移動走 ' + JSON.stringify(r)).toBeLessThan(1);
    expect(r.off, '呼吸位移不超過自己軌道半徑的幅度 ' + JSON.stringify(r)).toBeLessThanOrEqual(r.r * 0.31 + 1);
    // 還在軌道上的行星：恆星被吞重生（_lhSpReborn）那一刻變成自由，畫的位置接得上（不多算一次呼吸）
    const r2 = await page.evaluate(() => new Promise(res => {
        const cl = _lhSp.groups.find(c => c !== _lhSp.groups[0] && _lhSp.words.some(w => w.cl === c && !w.star && !w.free)) || _lhSp.groups[1], star = _lhSp.words.find(o => o.star && o.cl === cl);
        Object.assign(cl, { ba: 0.3, bp: 1e9, ph: [Math.PI / 2, ...cl.ph.slice(1)] });
        _lhSp.bhShape = _lhSp.bhShape || _lhSpAmoeba(); _lhSp.bhK = _lhSp.bhK || _lhSpHs() * _lhSp.bhShape.k; _lhSp.bhW = _lhSp.bhW || { x: 1e7, y: 1e7, R: 1 }; _lhSp.bh = _lhSp.bh || { x: 1e7, y: 1e7 };
        setTimeout(() => {
            const P = _lhSp.words.filter(w => w.cl === cl && !w.star && !w.free && !w.pinned), a = P.map(w => ({ x: w.px, y: w.py }));
            _lhSpReborn(star, _lhSpNow(), _lhSpCfg());
            P.forEach(w => { w.fvx = w.fvy = 0; });   // 只看「變自由」那一下的位置，不看之後自己飛的
            requestAnimationFrame(() => requestAnimationFrame(() => res({ n: P.length, free: P.every(w => w.free), jump: Math.max(0, ...P.map((w, i) => Math.hypot(w.px - a[i].x, w.py - a[i].y))) })));
        }, 150);
    }));
    expect(r2.n).toBeGreaterThan(0);
    expect(r2.free).toBe(true);
    expect(r2.jump, '軌道上的行星變自由：畫的位置不跳 ' + JSON.stringify(r2)).toBeLessThan(1);
    expect(errors).toEqual([]);
    await context.close();
});

// 2026-11-22 Andy（外圈沒作用、一進「開始被吸」又突然太強）：還沒散架的星系只被拉歪、黑洞走開就彈回；恆星被拉進散架圈才整團撕開
test('黑洞：星系先被拉歪（走開就彈回），恆星進散架圈才撕開', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: { 'lh:bgFx': '5', 'lh:spTuneUI': '1' } });
    await page.evaluate(() => { _lhWs.input = '安打'; _lhWs.list = wordlistData.filter(e => [...e.w].length === 2 && /ㄢ/.test(e.z)).slice(0, 60); lhWsOpen(); });
    await page.waitForFunction(() => _lhSp.words.length > 10 && !(_lhSp.queue || []).length, null, { timeout: 30000 });
    await page.locator('.ws-zoom .ws-skip').click();
    await page.waitForFunction(() => !!(_lhSp.bhW && _lhSp.bh && _lhSp.bh.born) && _lhSp.groups.some(c => _lhSp.words.some(w => w.cl === c && !w.star && !w.free)), null, { timeout: 20000 });
    const put = f => page.evaluate(f => {   // 黑洞放在這團「往外」那側、距離＝引力範圍 × f（負的＝往宇宙中心那側）
        const U = _lhSpU(), R = LH_SP_TUNE.bh.range * U, cl = window.__cl, d0 = Math.hypot(cl.x, cl.y) || 1;
        Object.assign(_lhSp.bh, { mode: 'free', x: cl.x + cl.x / d0 * R * f, y: cl.y + cl.y / d0 * R * f, vx: 0, vy: 0, brk: undefined });
    }, f);
    const lean = () => page.evaluate(() => { const cl = window.__cl, U = _lhSpU(), s = _lhSp.words.find(w => w.star && w.cl === cl), B = _lhSp.bh; return { l: Math.hypot(cl.lx || 0, cl.ly || 0) / U, dot: (cl.lx || 0) * (B.x - cl.x) + (cl.ly || 0) * (B.y - cl.y), free: !!s.free, held: !!cl.held }; });
    await page.evaluate(() => {
        for (const k of ['micro', 'small', 'mid']) LH_SP_TUNE.roam[k] = 0;
        Object.assign(LH_SP_TUNE.bh, { back: 0.001, starIn: 0 });
        window.__cl = _lhSp.groups.filter(c => _lhSp.words.some(w => w.cl === c && !w.star)).sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y))[0];
    });
    await put(0.8);
    await page.waitForTimeout(2500);
    const a = await lean();
    expect(a.l, '外圈：恆星往黑洞那邊歪 ' + JSON.stringify(a)).toBeGreaterThan(0.05);
    expect(a.dot, '歪的方向朝黑洞').toBeGreaterThan(0);
    expect(a.free || a.held, '外圈：恆星還在軌道上、整團沒散').toBe(false);
    await put(-1.6);   // 黑洞走開（範圍外）
    await page.waitForTimeout(4000);
    const b = await lean();
    expect(b.l, '黑洞走開：彈回原位 ' + JSON.stringify(b)).toBeLessThan(a.l * 0.15);
    await page.evaluate(() => { const cl = window.__cl, U = _lhSpU(); Object.assign(_lhSp.bh, { mode: 'free', x: cl.x + LH_SP_TUNE.bh.scatR * U * 0.6, y: cl.y, vx: 0, vy: 0, brk: undefined }); });
    await page.waitForTimeout(1200);
    expect((await lean()).held, '恆星進散架圈：整團撕開').toBe(true);
    expect(errors).toEqual([]);
    await context.close();
});

// 0.98.41 Andy：本地快轉鈕——跳過混沌凝聚，黑洞直接長好
test('詞宇宙：本地快轉鈕跳過凝聚、黑洞直接長好', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: { 'lh:bgFx': '5', 'lh:spTuneUI': '1' } });
    await page.evaluate(() => { _lhWs.input = '安打'; _lhWs.list = [{ w: '辦法', z: 'ㄅㄢˋ ㄈㄚˇ', p: 50 }, { w: '看法', z: 'ㄎㄢˋ ㄈㄚˇ', p: 90 }]; lhWsOpen(); });
    await expect.poll(() => page.evaluate(() => _lhSp.words.length)).toBe(2);
    await page.locator('.ws-zoom .ws-skip').click();
    await expect.poll(() => page.evaluate(() => !!(_lhSp.bhW && _lhSp.bh && _lhSp.bh.born))).toBe(true);
    const r = await page.evaluate(() => ({ r: _lhSp.bhW.r, want: LH_SP_TUNE.bh.size / 2 / _lhSpZ100() * LH_SP_TUNE.bh.core, gk: _lhSp.words.some(w => w.gk || w.gHold) }));
    expect(r.gk).toBe(false);
    expect(r.r).toBeCloseTo(r.want, 3);
    expect(errors).toEqual([]);
    await context.close();
});

