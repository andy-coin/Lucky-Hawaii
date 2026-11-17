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
    await expect(page.locator('.ws-zoom > *').first()).toHaveClass(/ws-gear/);   // 在縮放鈕的左邊
    await expect(page.locator('.ws-tune')).toBeHidden();
    await gear.click();
    await expect(page.locator('.ws-tune')).toBeVisible();
    await expect(page.locator('.ws-tune-ch')).toHaveText(['星系', '恆星', '互動', '黑洞']);   // 第二層收納：外層四大類
    await expect(page.locator('.ws-tune-h')).toHaveText(['公轉', '流星', '混沌凝聚', '殘影：公轉煙霧', '殘影：凝聚煙霧', '光暈閃爍', '日冕', '輻射', '熱浪', '殘影：縮放光帶', '殘影：拖畫布光帶', '游標放大鏡', '星座', '黑洞']);
    await page.locator('.ws-tune-ch', { hasText: '星系' }).click();
    await page.locator('.ws-tune-h', { hasText: '混沌凝聚' }).click();   // 每組一開始收起來
    await page.locator('.ws-tune-ch', { hasText: '恆星' }).click();
    await page.locator('.ws-tune-h', { hasText: '輻射' }).click();
    const row = page.locator('.ws-tune-row', { hasText: '阻尼' });
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
