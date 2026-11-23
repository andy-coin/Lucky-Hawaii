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
            q: ['安打', '安 打', '安', '*打', '**', 'an', '西瓜 報紙', '西瓜 報', '西瓜  *紙'].map(s => !!lhWsQuery(s)),
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
    expect(r.q).toEqual([true, false, false, true, false, false, true, false, true]);
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
    // 0.98.43：空白分開兩個詞＝兩個詞的雙押一起列（每張卡照自己押的那個詞上色）
    await page.evaluate(() => { wordlistData = [{ w: '辦法', z: 'ㄅㄢˋ ㄈㄚˇ', p: 50 }, { w: '告知', z: 'ㄍㄠˋ ㄓ', p: 60 }, { w: '安靜', z: 'ㄢ ㄐㄧㄥˋ', p: 99 }]; Object.assign(_lhWs, { mode: 'rhyme', tone: false, strict: false }); });
    await page.fill('#searchInput', '安打 報紙');
    await expect(page.locator('.ws-card')).toHaveText(['告 知', '辦 法'].map(t => new RegExp(t)));
    await expect(page.locator('.results-count')).toContainText('押「安打」「報紙」的詞：2');
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
    await expect(page.locator('.ws-tune-h')).toHaveText(['宇宙', '公轉', '流星', '混沌凝聚', '凝聚浮現', '光暈閃爍', '日冕', '輻射', '熱浪', '公轉', '凝聚浮現', '殘影：公轉煙霧', '殘影：凝聚煙霧', '被吞重生', '外觀', '範圍', '吸入速度', '事件視界', '瓦解', '吸食', '出口', '甩動', '拖詞到黑洞', '殘影：縮放光帶', '殘影：拖畫布光帶', '游標放大鏡', '星座', '抓行星']);
    // 2026-11-23 Andy：一打開「吸入速度」這組就直接跳浮動視窗（面板裡只留重開的按鈕）
    await expect(page.locator('.ws-tune-envc'), '還沒打開：面板裡沒有圖表').toHaveCount(0);
    await page.locator('.ws-tune-ch', { hasText: '黑洞' }).click();
    await page.locator('.ws-tune-h', { hasText: '吸入速度' }).click();   // 打開這組＝直接跳浮動視窗
    await expect(page.locator('.ws-tune-envfl .ws-tune-envc'), '浮動視窗裡的圖表').toBeVisible();
    expect(await page.locator('.ws-tune-envc').evaluate(c => c.width > 0)).toBe(true);
    await expect(page.locator('.ws-tune-envpop'), '面板裡沒有按鈕').toHaveCount(0);
    await page.locator('.ws-tune-envx').click();   // 關視窗＝這組收合
    await expect(page.locator('.ws-tune-envfl')).toBeHidden();
    expect(await page.locator('.ws-tune-h', { hasText: '吸入速度' }).evaluate(h => h.parentElement.open)).toBe(false);
    await page.locator('.ws-tune-h', { hasText: '吸入速度' }).click();   // 再打開＝視窗再跳出來
    await expect(page.locator('.ws-tune-envfl')).toBeVisible();
    await page.locator('.ws-tune-h', { hasText: '吸入速度' }).click();   // 收合這組＝視窗也關
    await expect(page.locator('.ws-tune-envfl')).toBeHidden();
    await page.locator('.ws-tune-ch', { hasText: '黑洞' }).click();
    // 2026-11-23 Andy：白洞出口也是 envelope（秒 × 大小％），同一套浮動視窗
    await page.locator('.ws-tune-ch', { hasText: '白洞' }).click();
    await page.locator('.ws-tune-h', { hasText: '出口' }).click();
    await expect(page.locator('.ws-tune-envfl', { hasText: '白洞｜出口' })).toBeVisible();
    expect(await page.evaluate(() => { const E = LH_SP_TUNE.wh.env; return [E[0], E[E.length - 2], _lhSpEnvAt(E, E[E.length - 3])]; }), '從 0 秒開始、最後一點蓋滿 100％').toEqual([0, 100, 100]);
    await page.locator('.ws-tune-envfl', { hasText: '白洞｜出口' }).locator('.ws-tune-envx').click();
    await expect(page.locator('.ws-tune-envfl', { hasText: '白洞｜出口' })).toBeHidden();
    await page.locator('.ws-tune-ch', { hasText: '白洞' }).click();
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

// 2026-11-22 Andy：引力公式換成吸入速度 envelope——X＝6 個預設點分 5 段（每段 0～100%），Y＝速度（宇宙半徑 %／秒）
test('黑洞：吸入速度 envelope——預設點上的速度、段內內插與曲率、範圍外、圈大小顛倒、格式檢查', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub' });
    const r = await page.evaluate(() => {
        const u = 2, H = { x: 0, y: 0, u, R: 50 * u, A: 30 * u, s: 14 * u, L: 9 * u, z: 2 * u };
        LH_SP_TUNE.bh.env = [0, 1, 0, 1, 2, 0, 2, 4, 0, 3, 8, 0, 4, 16, 0, 5, 16, 0];
        const v = d => +(_lhSpEnvV(d * u, H) / u).toFixed(3);
        const pts = [50, 30, 14, 9, 2, 0].map(v), mid = v(40), out = v(51);
        LH_SP_TUNE.bh.env = [0, 0, 1, 1, 4, 0, 2, 4, 0, 3, 4, 0, 4, 4, 0, 5, 4, 0];   // 第一段曲率 1（u⁴：前段慢）
        const curved = v(40);
        const Hb = { ...H, A: 80 * u };   // 光暈圈比引力範圍大：第一段寬度 0
        const flip = +(_lhSpEnvX(40 * u, Hb)).toFixed(3);
        const ok = [_lhSpEnvOk([0, 1, 0, 1, 1, 0, 2, 1, 0, 3, 1, 0, 4, 1, 0, 5, 1, 0]), _lhSpEnvOk([0, 1, 0, 1, 1, 0, 2, 1, 0, 4, 1, 0, 5, 1, 0]), _lhSpEnvOk([0, 1, 0, 2, 1, 0, 1, 1, 0, 3, 1, 0, 4, 1, 0, 5, 1, 0])];
        // 螺旋角度：方向偏 swirl 度、大小照 envelope 不變
        LH_SP_TUNE.bh.swirl = 30; _lhSp.bh = { spin: 1 };
        const sv = _lhSpEnvVec(10, 0, 10, 4), sw = [+Math.hypot(...sv).toFixed(3), +(Math.atan2(sv[1], sv[0]) * 180 / Math.PI).toFixed(1)];
        LH_SP_TUNE.bh.swirl = 0; const s0 = _lhSpEnvVec(10, 0, 10, 4).map(x => +x.toFixed(3)); _lhSp.bh = null;
        return { pts, mid, out, curved, flip, ok, sw, s0 };
    });
    expect(r.pts, '6 個預設點上的速度').toEqual([1, 2, 4, 8, 16, 16]);
    expect(r.mid, '引力範圍 → 光暈中間＝直線內插').toBeCloseTo(1.5, 3);
    expect(r.out, '範圍外').toBe(-0.5);
    expect(r.curved, '曲率 1：一半的地方只有 1/16').toBeCloseTo(0.25, 3);
    expect(r.flip, '光暈圈 > 引力範圍：直接算在第 2 段').toBeGreaterThanOrEqual(1);
    expect(r.ok, '少一個預設點、順序亂掉＝不收').toEqual([true, false, false]);
    expect(r.sw, '螺旋 30°：速度 4 不變、方向偏 30°').toEqual([4, 30]);
    expect(r.s0, '螺旋 0°：直直往中心').toEqual([4, 0]);
    expect(errors).toEqual([]);
    await context.close();
});

// 2026-11-22 Andy 力的層級：宇宙光速是最後一關——黑洞在星系旁邊吸、再走開，每一格每顆恆星、行星的移動都不超過「上限 × 這一格的時間」
// （上限＝光速；2026-11-23 起黑洞範圍內可以到那一點的吸入速度，_lhSpLim）
// （手拖、凍在視界上、開場凝聚與浮現、被吞重生、流星重新出場不算：那些不是被力推著走）
test('宇宙光速：黑洞吸、再走開，每一格沒有任何天體超過光速', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: { 'lh:bgFx': '5', 'lh:spTuneUI': '1' } });
    await page.evaluate(() => { _lhWs.input = '安打'; _lhWs.list = wordlistData.filter(e => [...e.w].length === 2 && /ㄢ/.test(e.z)).slice(0, 60); lhWsOpen(); });
    await page.waitForFunction(() => _lhSp.words.length > 10 && !(_lhSp.queue || []).length, null, { timeout: 30000 });
    await page.locator('.ws-zoom .ws-skip').click();
    await page.waitForFunction(() => !!(_lhSp.bhW && _lhSp.bh && _lhSp.bh.born), null, { timeout: 20000 });
    await page.waitForTimeout(1000);
    const r = await page.evaluate(() => new Promise(res => {
        LH_SP_TUNE.bh.speed = 0;
        const cl = [..._lhSp.groups].filter(c => _lhSp.words.filter(w => w.cl === c && !w.star).length >= 5).sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y))[0];
        const U = _lhSpU(), d0 = Math.hypot(cl.x, cl.y) || 1, R = LH_SP_TUNE.bh.range * U * 0.7;
        Object.assign(_lhSp.bh, { tp: 1, mode: 'free', x: cl.x + cl.x / d0 * R, y: cl.y + cl.y / d0 * R, vx: 0, vy: 0, brk: undefined });
        setTimeout(() => Object.assign(_lhSp.bh, { tp: 1, x: -cl.x / d0 * 300 * U, y: -cl.y / d0 * 300 * U }), 3000);
        const skip = w => w.gk || w.reT || w.comet || w.pinned || !w.born;
        let pl = _lhSp.last, prev = new Map(), worst = 0, frames = 0, why = null;
        const snap = () => { const m = new Map(); for (const w of _lhSp.words) m.set(w, [w.px, w.py, skip(w), , _lhSpLim(w)]); for (const c of _lhSp.groups) { const s = _lhSp.words.find(w => w.star && w.cl === c); m.set(c, [c.x, c.y, !!c.held || !s || skip(s), s && s.w, _lhSpLim(c)]); } return m; };
        prev = snap();
        const tick = () => {
            if (_lhSp.last !== pl) {
                const dt = (_lhSp.last - pl) / 1000, now = snap();   // 不夾 0.05：機器忙時兩格模擬可能落在同一次量測裡
                for (const [o, a] of now) { const b = prev.get(o); if (!b || a[2] || b[2]) continue; const q = Math.hypot(a[0] - b[0], a[1] - b[1]) / (Math.max(a[4], b[4]) * dt); if (q > worst) { worst = q; why = (o.w || '恆星 ' + a[3]) + ' held=' + !!o.held + ' reT=' + !!o.reT; } }
                prev = now; pl = _lhSp.last; frames++;
            }
            if (frames < 300) requestAnimationFrame(tick); else res({ worst, why, frames });
        };
        requestAnimationFrame(tick);
    }));
    expect(r.worst, '一格最多移動上限 × 時間 ' + JSON.stringify(r)).toBeLessThan(1.001);
    expect(errors).toEqual([]);
    await context.close();
});

// 2026-11-23 Andy：黑洞範圍內上限可以到吸入速度；離開時不管超出多少，都在 1.8 秒內等速降回光速（沒有速度斷層）
test('速度上限：進黑洞立刻放寬、離開 1.8 秒內等速回到光速', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub' });
    const r = await page.evaluate(() => {
        const c = _lhSpC(), o = {}, dt = 1 / 60, at = {};
        _lhSpLimStep(o, c * 3, dt); at.in = _lhSpLim(o) / c;
        for (let i = 1; i <= 120; i++) { _lhSpLimStep(o, 0, dt); if (i === 54) at.half = _lhSpLim(o) / c; if (i === 108) at.end = _lhSpLim(o) / c; }
        const big = {}; _lhSpLimStep(big, c * 20, dt); for (let i = 0; i < 108; i++) _lhSpLimStep(big, 0, dt);
        return { ...at, big: _lhSpLim(big) / c };
    });
    expect(r.in, '進黑洞：上限立刻到吸入速度').toBeCloseTo(3, 6);
    expect(r.half, '0.9 秒：降一半（等速）').toBeCloseTo(2, 2);
    expect(r.end, '1.8 秒：回到光速').toBeCloseTo(1, 6);
    expect(r.big, '超出再多也一樣 1.8 秒').toBeCloseTo(1, 6);
    expect(errors).toEqual([]);
    await context.close();
});

// 2026-11-23 Andy：碰到事件視界（核心表面）＝被吞，馬上重生（不再凍在圈上淡完）——行星直接拿去黑洞中心
test('黑洞：碰到事件視界就被吞、馬上在遠方重生（凍結殘影照跑）', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: { 'lh:bgFx': '5', 'lh:spTuneUI': '1' } });
    await page.evaluate(() => { _lhWs.input = '安打'; _lhWs.list = wordlistData.filter(e => [...e.w].length === 2 && /ㄢ/.test(e.z)).slice(0, 60); lhWsOpen(); });
    await page.waitForFunction(() => _lhSp.words.length > 10 && !(_lhSp.queue || []).length, null, { timeout: 30000 });
    await page.locator('.ws-zoom .ws-skip').click();
    await page.waitForFunction(() => !!(_lhSp.bhW && _lhSp.bh && _lhSp.bh.born), null, { timeout: 20000 });
    const r = await page.evaluate(() => new Promise(res => {
        LH_SP_TUNE.bh.speed = 0;
        const B = _lhSp.bh, w = _lhSp.words.find(x => !x.star && !x.comet && x.cl && !x.pinned);
        Object.assign(B, { tp: 1, mode: 'free', x: B.x, y: B.y, vx: 0, vy: 0, brk: undefined });
        Object.assign(w, { free: true, fx: B.x, fy: B.y, fvx: 0, fvy: 0, gk: 0 });   // 放在黑洞中心（視界裡）
        const t0 = _lhSpNow();
        const tick = () => { if (w.reT) {
            const g = (_lhSp.ghosts || []).find(g => g.e === w.e && g !== w), out = { ms: _lhSpNow() - t0, far: Math.hypot(w.fx - B.x, w.fy - B.y) > _lhSp.bhW.R, ghost: !!g, onRing: [] };
            // 拖著黑洞走：殘影一直釘在視界那圈上（跟著黑洞整團走，不沉進去）
            B.mode = 'drag'; let n = 0; const U = _lhSpU();
            const mv = () => { if (n && g && _lhSp.ghosts.includes(g)) out.onRing.push(+(Math.hypot(g.px - B.x, g.py - B.y) / _lhSp.bhW.z).toFixed(3)); B.x += 3 * U; if (++n < 20) requestAnimationFrame(mv); else res(out); };
            requestAnimationFrame(mv);
        } else if (_lhSpNow() - t0 > 2000) res({ ms: null }); else requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
    }));
    expect(r.ms, '一碰到就被吞（不等淡完）' + JSON.stringify(r)).not.toBeNull();
    expect(r.ms).toBeLessThan(300);
    expect(r.far, '重生在引力範圍外').toBe(true);
    expect(r.ghost, '凍在視界上的殘影照跑（只是外觀）').toBe(true);
    expect(r.onRing.length > 10 && r.onRing.every(q => Math.abs(q - 1) < 0.02), '殘影釘在視界上、跟著黑洞走' + JSON.stringify(r.onRing)).toBe(true);
    expect(errors).toEqual([]);
    await context.close();
});

// 2026-11-23 Andy：被吞的行星在自己該去的位置（軌道上）bh.reP px 內出生；那裡在引力範圍內才去遠方。
// 平移：畫面中心最遠拖到宇宙邊界（放大後看得到旁邊的星系；縮很小時宇宙中心照樣不出視窗）
test('黑洞：被吞的行星在自己的位置附近重生；放大後可以拖到宇宙邊界', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: { 'lh:bgFx': '5', 'lh:spTuneUI': '1' } });
    await page.evaluate(() => { _lhWs.input = '安打'; _lhWs.list = wordlistData.filter(e => [...e.w].length === 2 && /ㄢ/.test(e.z)).slice(0, 60); lhWsOpen(); });
    await page.waitForFunction(() => _lhSp.words.length > 10 && !(_lhSp.queue || []).length, null, { timeout: 30000 });
    await page.locator('.ws-zoom .ws-skip').click();
    await page.waitForFunction(() => !!(_lhSp.bhW && _lhSp.bh && _lhSp.bh.born), null, { timeout: 20000 });
    const r = await page.evaluate(() => {
        LH_SP_TUNE.bh.speed = 0; LH_SP_TUNE.bh.reP = 40;
        const B = _lhSp.bh, H = _lhSp.bhW, z = _lhSpZv(), out = {};
        const ps = _lhSp.words.filter(x => !x.star && !x.comet && x.cl && !x.pinned && x.r !== undefined);
        const far = ps.find(w => Math.hypot(_lhSpOrbit(w).x - B.x, _lhSpOrbit(w).y - B.y) > H.R + 60 / z);
        { const P = _lhSpOrbit(far); _lhSpReborn(far, _lhSpNow(), _lhSpCfg()); out.near = Math.hypot(far.fx - P.x, far.fy - P.y) * z; }
        // 該去的位置在引力範圍內：去遠方
        const w2 = ps.find(w => w !== far); { const P = _lhSpOrbit(w2); Object.assign(B, { tp: 1, x: P.x, y: P.y }); _lhSpReborn(w2, _lhSpNow(), _lhSpCfg()); out.away = Math.hypot(w2.fx - B.x, w2.fy - B.y) > H.R; }
        // 平移上限
        _lhSp.z = _lhSp.z * 8; _lhSp.px = 1e7; _lhSp.py = 0; _lhSpApplyView(); out.panZoomed = _lhSp.px / (_lhSpHs() * _lhSp.z);
        _lhSp.z = _lhSp.z / 400; _lhSp.px = 1e7; _lhSpApplyView(); out.panMin = _lhSp.px / (_lhSp.el.clientWidth / 2);
        return out;
    });
    expect(r.near, '在該去的位置 40px 內' + JSON.stringify(r)).toBeLessThanOrEqual(40.5);
    expect(r.away, '該去的位置在範圍內：去範圍外').toBe(true);
    expect(r.panZoomed, '放大後畫面中心可以拖到宇宙邊界').toBeCloseTo(1, 3);
    expect(r.panMin, '縮很小：宇宙中心不出視窗').toBeCloseTo(1, 3);
    expect(errors).toEqual([]);
    await context.close();
});

// 2026-11-23 Andy（重生的行星回家像停車、沒守光速）：出生帶著公轉速度、彈簧從出生那刻才開始越拉越緊——守光速、幾秒內柔順落回軌道
test('黑洞：重生的行星帶著公轉慣性、照彈簧回軌道（守光速，不是一下拉過去）', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: { 'lh:bgFx': '5', 'lh:spTuneUI': '1' } });
    await page.evaluate(() => { _lhWs.input = '安打'; _lhWs.list = wordlistData.filter(e => [...e.w].length === 2 && /ㄢ/.test(e.z)).slice(0, 60); lhWsOpen(); });
    await page.waitForFunction(() => _lhSp.words.length > 10 && !(_lhSp.queue || []).length, null, { timeout: 30000 });
    await page.locator('.ws-zoom .ws-skip').click();
    await page.waitForFunction(() => !!(_lhSp.bhW && _lhSp.bh && _lhSp.bh.born), null, { timeout: 20000 });
    const r = await page.evaluate(() => new Promise(res => {
        LH_SP_TUNE.bh.speed = 0;
        const B = _lhSp.bh, H = _lhSp.bhW;
        const w = _lhSp.words.find(w => !w.star && !w.comet && w.cl && !w.pinned && w.r !== undefined && Math.hypot(_lhSpOrbit(w).x - B.x, _lhSpOrbit(w).y - B.y) > H.R * 1.5);
        Object.assign(w, { bhR: 1, rtT: _lhSpNow() - 20000, inBh: 1 });   // 被吸了很久（舊版：一出生彈簧就最緊）
        _lhSpReborn(w, _lhSpNow(), _lhSpCfg());
        const t0 = _lhSpNow(), v0 = Math.hypot(w.fvx, w.fvy); let vmax = 0, land = null, fr = 0; const dl = [];
        const f = () => { const now = _lhSpNow(); fr++; if (w.free) { vmax = Math.max(vmax, Math.hypot(w._sx || 0, w._sy || 0) / _lhSpC()); if (fr % 20 === 0) { const o0 = _lhSpOrbit(w), bb = w.cl.b ?? 1, o = { x: w.cl.x + (o0.x - w.cl.x) * bb, y: w.cl.y + (o0.y - w.cl.y) * bb }; dl.push([Math.round(Math.hypot(o.x - w.fx, o.y - w.fy) * _lhSpZv()), Math.round(Math.hypot(w.fvx - (w.oPx !== undefined ? 0 : 0), w.fvy)), +bb.toFixed(3), w.bhR, Math.round((_lhSpNow() - w.rtT) / 100) / 10, !!w.held, w.cl.held ? 1 : 0, w.pinned ? 1 : 0, _lhSpWait(w, _lhSpNow())]); } } else if (land === null) land = now - t0;
            if (now - t0 < 20000 && land === null) requestAnimationFrame(f); else res({ vmax, land, v0, fr, dl: dl.slice(-6), tol: 0.15 * w.r * _lhSpZv() }); };
        requestAnimationFrame(f);
    }));
    expect(r.v0, '出生就帶著公轉速度' + JSON.stringify(r)).toBeGreaterThan(0);
    expect(r.vmax, '守光速').toBeLessThanOrEqual(1.0001);
    expect(r.land, '幾秒內落回軌道' + JSON.stringify(r)).not.toBeNull();
    expect(errors).toEqual([]);
    await context.close();
});

// 2026-11-23 Andy（白洞 envelope 的浮動視窗沒出現）：在虛無裡調白洞時，浮動視窗被「虛無裡介面全收」藏掉——要跟調參面板一樣留著
test('白洞出口 envelope：在虛無裡也看得到浮動視窗', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: { 'lh:bgFx': '5', 'lh:spTuneUI': '1' } });
    await page.evaluate(() => { _lhWs.input = '安打'; _lhWs.list = wordlistData.filter(e => [...e.w].length === 2 && /ㄢ/.test(e.z)).slice(0, 60); lhWsOpen(); });
    await page.waitForFunction(() => _lhSp.words.length > 10 && !(_lhSp.queue || []).length, null, { timeout: 30000 });
    await page.locator('.ws-zoom .ws-skip').click();
    await page.locator('.ws-gear').click();
    await page.evaluate(() => _lhSpVoid(true));
    await page.waitForFunction(() => _lhSp.el.classList.contains('ws-in-void'), null, { timeout: 8000 });
    await page.locator('.ws-tune-ch', { hasText: '白洞' }).click();
    await page.locator('.ws-tune-h', { hasText: '出口' }).click();
    const fl = page.locator('.ws-tune-envfl', { hasText: '白洞｜出口' });
    await expect(fl).toBeVisible();
    expect(await fl.evaluate(e => { const r = e.getBoundingClientRect(); return document.elementFromPoint(r.left + 100, r.top + 60)?.className; }), '蓋在虛無上面').toBe('ws-tune-envc');
    expect(errors).toEqual([]);
    await context.close();
});

// 2026-11-21 Andy（輕輕一下就滑超遠、沒甩也滑）：滑行距離＝速度 × grab.glide 秒（直線等減速），最遠＝離宇宙邊界最遠距離 × bh.brake%；
// 放手的速度只看最後 0.1 秒、停住超過 0.08 秒＝沒甩、畫面上慢於 grab.flingMin＝只是放下
// 2026-11-23 Andy 交叉淡變：進範圍照 bh.envT 秒慢慢被黑洞接管（漫遊越來越弱、最後停）；出範圍同樣秒數放手（拖走的位移併進家裡，漫遊接回來）
test('黑洞：進出引力範圍照過渡秒數交接（漫遊慢慢停、出來慢慢接回）', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: { 'lh:bgFx': '5', 'lh:spTuneUI': '1' } });
    await page.evaluate(() => { _lhWs.input = '安打'; _lhWs.list = wordlistData.filter(e => [...e.w].length === 2 && /ㄢ/.test(e.z)).slice(0, 60); lhWsOpen(); });
    await page.waitForFunction(() => _lhSp.words.length > 10 && !(_lhSp.queue || []).length, null, { timeout: 30000 });
    await page.locator('.ws-zoom .ws-skip').click();
    await page.waitForFunction(() => !!(_lhSp.bhW && _lhSp.bh && _lhSp.bh.born), null, { timeout: 20000 });
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => new Promise(res => {
        Object.assign(LH_SP_TUNE.bh, { speed: 0, back: 0.001, envT: 2 });
        const cl = [..._lhSp.groups].find(c => c.vx && !c.held && !c.bm);
        if (!cl) return res({ none: true });
        const U = _lhSpU(), d0 = Math.hypot(cl.x, cl.y) || 1, R = LH_SP_TUNE.bh.range * U * 0.6;
        Object.assign(_lhSp.bh, { tp: 1, mode: 'free', x: cl.x + cl.x / d0 * R, y: cl.y + cl.y / d0 * R, vx: 0, vy: 0, brk: undefined });
        const t0 = _lhSpNow(), out = { bm: {}, home: {} }; let hp = [cl.hx, cl.hy], tp = t0, step = 0;
        const tick = () => {
            const s = (_lhSpNow() - t0) / 1000;
            if (step === 0 && s > 0.3) { out.home.start = Math.hypot(cl.hx - hp[0], cl.hy - hp[1]) / U / ((_lhSpNow() - tp) / 1000); step = 1; }
            if (step === 1 && s > 1) { out.bm.in1 = cl.bm; step = 2; }
            if (step === 2 && s > 2.4) { out.bm.in2 = cl.bm; hp = [cl.hx, cl.hy]; tp = _lhSpNow(); step = 3; }
            if (step === 3 && s > 3) { out.home.full = Math.hypot(cl.hx - hp[0], cl.hy - hp[1]) / U / ((_lhSpNow() - tp) / 1000); out.lxIn = Math.hypot(cl.lx || 0, cl.ly || 0) / U;
                Object.assign(_lhSp.bh, { tp: 1, x: -cl.x / d0 * 300 * U, y: -cl.y / d0 * 300 * U }); step = 4; }   // 黑洞走開
            if (step === 4 && s > 4) { out.bm.out1 = cl.bm; step = 5; }
            if (step === 5 && s > 5.4) { out.bm.out2 = cl.bm; out.lxOut = Math.hypot(cl.lx || 0, cl.ly || 0); return res(out); }
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }));
    expect(r.none, '找不到漫遊中的星系').toBeUndefined();
    expect(r.home.start, '剛進範圍：漫遊還在（家在走）' + JSON.stringify(r)).toBeGreaterThan(0.05);
    expect(r.bm.in1, '1 秒（過渡 2 秒）：接管一半左右' + JSON.stringify(r)).toBeGreaterThan(0.3);
    expect(r.bm.in1).toBeLessThan(0.7);
    expect(r.bm.in2, '過渡完：完全被黑洞接管').toBe(1);
    expect(r.home.full, '完全接管：漫遊停了（家不動）' + JSON.stringify(r)).toBeLessThan(0.01);
    expect(r.lxIn, '被黑洞拖著走').toBeGreaterThan(0);
    expect(r.bm.out1, '出來 1 秒：放手一半左右' + JSON.stringify(r)).toBeGreaterThan(0.3);
    expect(r.bm.out1).toBeLessThan(0.7);
    expect([r.bm.out2, r.lxOut], '出來 2 秒後：完全放手，拖走的位移併進家裡').toEqual([0, 0]);
    expect(errors).toEqual([]);
    await context.close();
});

// 2026-11-23 Andy：吸入速度是相對黑洞的——黑洞「自己在走」的速度照接管程度加上去。envelope 調得再慢，黑洞跑再快也追得上、一定貼得到視界
test('黑洞：吸入速度相對黑洞（黑洞跑得比吸入速度快也追得上）', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: { 'lh:bgFx': '5', 'lh:spTuneUI': '1' } });
    await page.evaluate(() => { _lhWs.input = '安打'; _lhWs.list = wordlistData.filter(e => [...e.w].length === 2 && /ㄢ/.test(e.z)).slice(0, 60); lhWsOpen(); });
    await page.waitForFunction(() => _lhSp.words.length > 10 && !(_lhSp.queue || []).length, null, { timeout: 30000 });
    await page.locator('.ws-zoom .ws-skip').click();
    await page.waitForFunction(() => !!(_lhSp.bhW && _lhSp.bh && _lhSp.bh.born), null, { timeout: 20000 });
    const r = await page.evaluate(() => new Promise(res => {
        const T = LH_SP_TUNE.bh; T.speed = 4; T.envT = 0.3; T.env = [0, 0.3, 0, 1, 0.3, 0, 2, 0.3, 0, 3, 0.3, 0, 4, 0.3, 0, 5, 0.3, 0];   // 吸入速度全段 0.3%／秒；黑洞自己沿邊跑 4%／秒（快 13 倍）
        const B = _lhSp.bh, U = _lhSpU(), w = _lhSp.words.find(x => !x.star && !x.comet && x.cl && !x.pinned);
        Object.assign(B, { tp: 1, mode: 'edge', ease: null });   // 只有黑洞「自己在走」（繞邊、飄回邊）才算速度；手拖、甩出去的滑行都不算
        Object.assign(w, { free: true, fx: B.x + _lhSp.bhW.R * 0.5, fy: B.y, fvx: 0, fvy: 0, gk: 0 });
        const d0 = Math.hypot(w.fx - B.x, w.fy - B.y); let pl = _lhSp.last, n = 0;
        const tick = () => {
            if (_lhSp.last !== pl) { pl = _lhSp.last; n++; }
            if (n < 120) requestAnimationFrame(tick); else res({ ratio: Math.hypot(w.fx - B.x, w.fy - B.y) / d0, reT: !!w.reT });
        };
        requestAnimationFrame(tick);
    }));
    expect(r.reT || r.ratio < 1, '跟著黑洞走、距離只會變近' + JSON.stringify(r)).toBe(true);
    expect(errors).toEqual([]);
    await context.close();
});

// 2026-11-23 Andy（特效也要守光速）：星塵前端往黑洞伸的速度＝那裡的吸入速度——吸入速度慢，星塵就慢慢伸，不能一下就到位
test('黑洞：星塵前端照吸入速度往黑洞伸', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: { 'lh:bgFx': '5', 'lh:spTuneUI': '1' } });
    await page.evaluate(() => { _lhWs.input = '安打'; _lhWs.list = wordlistData.filter(e => [...e.w].length === 2 && /ㄢ/.test(e.z)).slice(0, 60); lhWsOpen(); });
    await page.waitForFunction(() => _lhSp.words.length > 10 && !(_lhSp.queue || []).length, null, { timeout: 30000 });
    await page.locator('.ws-zoom .ws-skip').click();
    await page.waitForFunction(() => !!(_lhSp.bhW && _lhSp.bh && _lhSp.bh.born), null, { timeout: 20000 });
    const run = (v, ms) => page.evaluate(([v, ms]) => new Promise(res => {
        const T = LH_SP_TUNE.bh; Object.assign(T, { speed: 0, back: 0.001, stGrow: 0.5, env: [0, v, 0, 1, v, 0, 2, v, 0, 3, v, 0, 4, v, 0, 5, v, 0] });
        const cl = [..._lhSp.groups].sort((a, b) => b.n - a.n)[0], U = _lhSpU(), gR = cl.r * LH_SP_TUNE.glow.starSize;
        cl.stL = 0; cl.stK = 0; cl.stKn = cl.stSp = null; _lhSp.bhRem = [];
        _lhSp.px = -cl.x * _lhSpZv(); _lhSp.py = -cl.y * _lhSpZv(); _lhSpApplyView();   // 鏡頭對著（星塵要畫出來才會長）
        Object.assign(_lhSp.bh, { tp: 1, mode: 'free', x: cl.x + gR + (T.absorb - 4) * U, y: cl.y, vx: 0, vy: 0, brk: undefined });   // 光暈邊緣剛跨進「開始被吸」那圈
        setTimeout(() => res(cl.stL || 0), ms);
    }), [v, ms]);
    const slow = await run(0.2, 1500), fast = await run(40, 2500);   // 快的多等一點：全部測試一起跑時畫面掉格，1.5 秒真實時間不一定走滿
    expect(slow, '吸入速度 0.2%／秒：1.5 秒只伸出一點點').toBeLessThan(0.1);
    expect(fast, '吸入速度 40%／秒：1.5 秒伸很長' + JSON.stringify({ slow, fast })).toBeGreaterThan(0.5);
    expect(errors).toEqual([]);
    await context.close();
});

// 2026-11-23 Andy：「黑洞範圍」沒勾時，只有拉會改變那幾圈的滑桿才跳輔助線（其他黑洞滑桿不跳）；滑鼠停在黑洞上也顯示
test('黑洞：輔助線只在拉範圍類滑桿、滑鼠停在黑洞上時出現', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: { 'lh:bgFx': '5', 'lh:spTuneUI': '1', 'lh:spGuide': '0' } });
    await page.evaluate(() => { _lhWs.input = '安打'; _lhWs.list = wordlistData.filter(e => [...e.w].length === 2 && /ㄢ/.test(e.z)).slice(0, 60); lhWsOpen(); });
    await page.waitForFunction(() => _lhSp.words.length > 10 && !(_lhSp.queue || []).length, null, { timeout: 30000 });
    await page.locator('.ws-zoom .ws-skip').click();
    await page.waitForFunction(() => !!(_lhSp.bhW && _lhSp.bh && _lhSp.bh.born), null, { timeout: 20000 });
    const slide = txt => page.evaluate(txt => { _lhSp.bhGuide = 0; const row = [...document.querySelectorAll('.ws-tune-row')].find(r => r.textContent.includes(txt)); const r = row.querySelector('input[type=range]'); r.dispatchEvent(new Event('input')); return _lhSp.bhGuide > 0; }, txt);
    expect(await slide('螺旋角度'), '螺旋角度：不跳輔助線').toBe(false);
    expect(await slide('過渡秒數'), '過渡秒數：不跳輔助線').toBe(false);
    expect(await slide('這圈內開始照'), '引力範圍：跳輔助線').toBe(true);
    await page.evaluate(() => { _lhSp.bhGuide = 0; const z = _lhSpZv(), B = _lhSp.bh; _lhSp.px = -B.x * z; _lhSp.py = -B.y * z; _lhSpApplyView(); LH_SP_TUNE.bh.speed = 0; });   // 鏡頭對著黑洞
    await page.waitForTimeout(200);
    await page.evaluate(() => { Object.assign(_lhSp.bh, { tp: 1, mode: 'free', x: 0, y: 0, vx: 0, vy: 0, brk: 0 }); _lhSp.px = _lhSp.py = 0; _lhSpApplyView(); });   // 黑洞搬到畫面正中間
    await page.waitForTimeout(300);
    { const bb = await page.locator('.ws-bh').boundingBox(); await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2, { steps: 4 }); }   // 真的用滑鼠移過去
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => _lhSp.bhGuide > 0), '滑鼠停在黑洞上：顯示輔助線').toBe(true);
    expect(errors).toEqual([]);
    await context.close();
});

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
            fSlow: fv(H(100, 10), last(H(100, 10)) + 10).vx, fFast: fv(H(2000, 10), last(H(2000, 10)) + 10).vx * z, ...(() => { const o = { fvx: fv(H(2000, 10), last(H(2000, 10)) + 10).vx, fvy: 0 }, c = _lhSpC(), v0 = o.fvx; _lhSpCapV(o, 1 / 60); return { v0, c, v1: o.fvx }; })(), fPause: fv(H(2000, 10), last(H(2000, 10)) + 200).vx, fMin: LH_SP_TUNE.grab.flingMin };
        _lhSp.bhShape = null; _lhSp.bhK = 0;
        return { ...out, want: [100 * G, 200 * G] };
    });
    expect(Math.abs(r.slow - r.want[0]) / r.want[0], JSON.stringify(r)).toBeLessThan(0.03);
    expect(r.slow2 / r.slow, '快一倍＝滑遠一倍').toBeCloseTo(2, 1);
    expect(Math.abs(r.huge - r.far * 0.3) / (r.far * 0.3), '再快也不超過上限').toBeLessThan(0.03);
    expect(r.fSlow, '慢慢拖放手＝沒甩').toBe(0);
    expect(r.fPause, '停住 0.2 秒才放＝沒甩').toBe(0);
    expect(r.fFast, '快甩（光速放到很大）：超過門檻的部分才算').toBeCloseTo(2000 - r.fMin, -1);
    // 2026-11-22 Andy 力的層級：光速是最後一關，直接夾住——手速比光速快，甩出去就是光速
    expect(r.v0, '手速比光速快' + JSON.stringify(r)).toBeGreaterThan(r.c * 1.5);
    expect(r.v1, '甩出去就是光速').toBeCloseTo(r.c, 6);
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
        Object.assign(w, { free: true, fx: cl.x + 3000, fy: cl.y, fvx: 0, fvy: 0, reW: _lhSpNow() + 1e6, gk: 0, om: 0, omB: 0, qx: undefined });   // 飛散在 3000 外、還在等（reW：不被拉回）；不公轉——不然量的 150 毫秒裡呼吸位移跟著軌道角度轉，機器忙的時候就超過 1px（以前偶爾失敗的原因）
        setTimeout(() => requestAnimationFrame(() => {   // 只量搬家前後兩格（瞬間跳格）；之後呼吸離家太遠會慢慢收掉（每秒 0.4），那是平滑的移動不算跳
            const a = { x: w.px, y: w.py, fx: w.fx, fy: w.fy };
            cl.hx += 5000; cl.hy -= 4000; cl.x += 5000; cl.y -= 4000;   // 恆星瞬間搬家
            requestAnimationFrame(() => requestAnimationFrame(() => res({ jump: Math.hypot(w.px - a.x - (w.fx - a.fx), w.py - a.y - (w.fy - a.fy)), off: Math.hypot(a.x - a.fx, a.y - a.fy), r: w.r })));
        }), 150);
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

// 2026-11-22 Andy：還沒散架的星系照 envelope 整團被拖著走；黑洞走開＝滑一下停在新位置（不彈回）；恆星進散架點才撕開、其他行星全變孤兒（14.1）
test('黑洞：星系整團被拖、走開後停在原地，恆星進散架點才撕開、其他行星變孤兒', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: { 'lh:bgFx': '5', 'lh:spTuneUI': '1' } });
    await page.evaluate(() => { _lhWs.input = '安打'; _lhWs.list = wordlistData.filter(e => [...e.w].length === 2 && /ㄢ/.test(e.z)).slice(0, 60); lhWsOpen(); });
    await page.waitForFunction(() => _lhSp.words.length > 10 && !(_lhSp.queue || []).length, null, { timeout: 30000 });
    await page.locator('.ws-zoom .ws-skip').click();
    await page.waitForFunction(() => !!(_lhSp.bhW && _lhSp.bh && _lhSp.bh.born) && _lhSp.groups.some(c => _lhSp.words.some(w => w.cl === c && !w.star && !w.free)), null, { timeout: 20000 });
    const put = f => page.evaluate(f => {   // 黑洞放在這團「往外」那側、距離＝引力範圍 × f（負的＝往宇宙中心那側）
        const U = _lhSpU(), R = LH_SP_TUNE.bh.range * U, cl = window.__cl, d0 = Math.hypot(cl.x, cl.y) || 1;
        Object.assign(_lhSp.bh, { tp: 1, mode: 'free', x: cl.x + cl.x / d0 * R * f, y: cl.y + cl.y / d0 * R * f, vx: 0, vy: 0, brk: undefined });
    }, f);
    const st = () => page.evaluate(() => { const cl = window.__cl, U = _lhSpU(), s = _lhSp.words.find(w => w.star && w.cl === cl), B = _lhSp.bh, mv = Math.hypot(cl.hx + (cl.lx || 0) - window.__h0[0], cl.hy + (cl.ly || 0) - window.__h0[1]) / U;
        return { mv, lx: Math.hypot(cl.lx || 0, cl.ly || 0) / U, dot: (cl.lx || 0) * (B.x - cl.x) + (cl.ly || 0) * (B.y - cl.y), bv: !!cl.bm, free: !!s.free, held: !!cl.held, doom: !!cl.doom, orph: _lhSp.words.filter(w => w.cl === cl && !w.star && !_lhSpWait(w, _lhSpNow())).length, P: _lhSp.words.filter(w => w.cl === cl && !w.star && w.free && !w.fz).map(w => ({ inR: Math.hypot(w.fx - B.x, w.fy - B.y) <= _lhSp.bhW.R, env: !!w.envOn })) }; });
    await page.evaluate(() => {
        for (const k of ['micro', 'small', 'mid']) LH_SP_TUNE.roam[k] = 0;
        Object.assign(LH_SP_TUNE.bh, { back: 0.001, starIn: 0, envT: 0.3, env: [0, 2, 0, 1, 2, 0, 2, 2, 0, 3, 2, 0, 4, 2, 0, 5, 2, 0] });   // 到處都是 2 %／秒
        window.__cl = _lhSp.groups.filter(c => _lhSp.words.some(w => w.cl === c && !w.star)).sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y))[0];
        window.__h0 = [window.__cl.hx, window.__cl.hy];
    });
    await put(0.8);
    await page.waitForTimeout(2500);
    const a = await st();
    expect(a.lx, '範圍內：整團被拖著走（2.5 秒 × 2 %／秒，扣掉起步；機器忙時一格最多算 0.1 秒會少一點）' + JSON.stringify(a)).toBeGreaterThan(1.5);   // 量拖走的位移 lx（家 hx 另外會被「兩團太近互相推開」推動）
    expect(a.lx).toBeLessThan(6);
    expect(a.dot, '往黑洞那邊').toBeGreaterThan(0);
    expect(a.free || a.held, '恆星還在軌道上、整團沒散').toBe(false);
    await put(-1.6);   // 黑洞走開（範圍外）
    await page.waitForTimeout(3000);
    const b = await st();
    expect([b.lx, b.bv], '放手完：位移併進家裡（不彈回原位）' + JSON.stringify(b)).toEqual([0, false]);
    await page.evaluate(() => { const cl = window.__cl, U = _lhSpU(); Object.assign(_lhSp.bh, { tp: 1, mode: 'free', x: cl.x + LH_SP_TUNE.bh.scatR * U * 0.6, y: cl.y, vx: 0, vy: 0, brk: undefined }); });
    await page.waitForTimeout(1200);
    const c = await st();
    expect([c.held, c.doom], '恆星進散架點：整團撕開、注定被吞').toEqual([true, true]);
    expect(c.orph, '其他行星（不管在不在範圍裡）全都在等恆星').toBe(0);
    expect(c.P.filter(p => p.inR !== p.env), '範圍內的被吸、範圍外的不被吸（煞車原地漂）' + JSON.stringify(c.P)).toEqual([]);
    expect(errors).toEqual([]);
    await context.close();
});

// 2026-11-22 Andy：第 1、2 級黑洞只繞邊、可以丟詞，沒有引力；第 1～3 級按著黑洞時間不放慢
test('黑洞：第 2 級沒有引力、按著黑洞時間不放慢', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { storage: { 'lh:bgFx': '2', 'lh:spTuneUI': '1' } });
    await page.evaluate(() => { _lhWs.input = '安打'; _lhWs.list = wordlistData.filter(e => [...e.w].length === 2 && /ㄢ/.test(e.z)).slice(0, 60); lhWsOpen(); });
    await page.waitForFunction(() => !!(_lhSp.bhW && _lhSp.bh && _lhSp.bh.born) && _lhSp.words.length > 10, null, { timeout: 30000 });
    await page.evaluate(() => { const cl = _lhSp.groups[0], U = _lhSpU(); window.__cl = cl; Object.assign(_lhSp.bh, { tp: 1, mode: 'free', x: cl.x + LH_SP_TUNE.bh.scatR * U * 0.5, y: cl.y, vx: 0, vy: 0, brk: undefined }); });
    await page.waitForTimeout(1500);
    const a = await page.evaluate(() => ({ lean: Math.hypot(window.__cl.lx || 0, window.__cl.ly || 0), held: window.__cl.held, inBh: _lhSp.words.filter(w => w.inBh).length }));
    expect(a, '第 2 級：黑洞壓在星系上也不拉、不撕、不吞').toEqual({ lean: 0, held: false, inBh: 0 });
    await page.evaluate(() => { _lhSp.bhD = { id: 999, moved: false, hist: [] }; });   // 按著黑洞
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => _lhSpClk.k), '第 2 級按著黑洞：時間照常').toBe(1);
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

