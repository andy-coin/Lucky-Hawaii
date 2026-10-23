// 韻腳地圖（第 10 階段）的瀏覽器測試：句尾字依韻部上色、只重畫被改的那一段、不碰輸入框、就緒前不畫
// 之後的計畫會在這支檔案繼續加（鏡像對齊、組字、開關、浮動列…）；標題的第一個詞對應 10-VALIDATION.md 的 -g 篩選
import { test, expect, chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage, compose, openTwoTabs, activeSongRaw } from './helpers.mjs';
import { DEVICES, setScale, waitStill, emulateKeyboard, readKeyboard, insideVisible, auditTouchTargets } from './layout-lib.mjs';

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/v096-localStorage.json', import.meta.url), 'utf8'));
const OPEN_PANELS = { leftPanelCollapsed: 'false', rightPanelCollapsed: 'false' };
const v2Storage = (songs, extra = OPEN_PANELS) => ({
    ...FIXTURE, 'lh:schema': '2', 'lh:songs': JSON.stringify(songs), 'lh:activeSong': songs[0].id, ...extra,
});
const typed = (id, type, text, extra = {}) => ({ id, type, custom: '', color: '', height: null, label: '', text, collapsed: false, ...extra });
const song = (sections, extra = {}) => ({ id: 's1', title: '測試歌', sections, hashtags: [], context: '', createdAt: 1, updatedAt: 1, ...extra });

const F_AABB = '我望著遠方的光\n獨自站在窗\n走過熟悉的街道\n終於我也回到';
const F_PART = '愛你到天亮啊！\n\n（Oh baby）\n想你想到心慌了…\n好想好想你，嗎';

// 某一段鏡像層裡所有色塊的 [文字, data-f]
const bands = (page, n = 0) => page.locator('#lyricsSections .lyrics-section').nth(n).locator('.rhyme-mirror .rm-hl')
    .evaluateAll(els => els.map(e => [e.textContent, e.dataset.f]));

// 游標放到第一段最後（Mac 與 Linux 的「到最後」快捷鍵不同，直接設選取範圍）
const caretToEnd = page => page.evaluate(() => { const ta = document.querySelector('.section-textarea'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); });

test('上色：句尾字依韻部上色', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', F_AABB), typed('sb', 'chorus', '')])]),
    });
    // 鏡像層是輸入框前面的第一個子節點，裝飾用：不能點、字看不見
    const mirror = page.locator('.lyrics-section').first().locator('.section-body > .rhyme-mirror');
    await expect(mirror).toHaveAttribute('aria-hidden', 'true');
    expect(await mirror.evaluate(m => m.parentNode.firstElementChild === m && m.nextElementSibling.classList.contains('section-textarea'))).toBe(true);
    expect(await mirror.evaluate(m => { const c = getComputedStyle(m); return [c.pointerEvents, c.color]; })).toEqual(['none', 'rgba(0, 0, 0, 0)']);
    // 四行句尾：光、窗同韻（家族 14），道、到同韻（家族 8）
    expect(await bands(page)).toEqual([['光', '14'], ['窗', '14'], ['道', '8'], ['到', '8']]);
    await expect(page.locator('.lyrics-section').first()).toHaveClass(/\brm-on\b/);
    await expect(page.locator('.lyrics-section').nth(1)).not.toHaveClass(/\brm-on\b/);   // 沒有色塊的段落維持原樣
    // 重畫、打字都不碰輸入框：同一個節點、同樣的內容；也沒有任何網路請求
    const requests = [];
    page.on('request', r => requests.push(r.url()));
    await page.evaluate(() => {
        const ta = document.querySelector('.section-textarea');
        ta.focus(); ta.setSelectionRange(3, 5);
        window.__ta = ta; window.__v = ta.value;
        lhMapRenderAll();
    });
    expect(await page.evaluate(() => [window.__ta === document.querySelector('.section-textarea'), window.__ta.value === window.__v,
        window.__ta.selectionStart, window.__ta.selectionEnd, document.activeElement === window.__ta])).toEqual([true, true, 3, 5, true]);
    await caretToEnd(page);
    await page.keyboard.type('\n我在這裡等天亮');
    await expect.poll(() => bands(page)).toHaveLength(5);
    expect(await page.evaluate(() => window.__ta === document.querySelector('.section-textarea'))).toBe(true);
    expect(requests, '上色不送任何網路請求').toEqual([]);
    expect(errors).toEqual([]);
    await context.close();
});

test('上色：打字後只重畫那一段', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', F_AABB), typed('sb', 'chorus', '你好嗎\n走回來')])]),
    });
    await page.evaluate(() => { window.__other = document.querySelectorAll('.lyrics-section')[1].querySelector('.rm-hl'); });
    expect(await page.evaluate(() => window.__other && window.__other.isConnected)).toBe(true);
    await caretToEnd(page);
    await page.keyboard.type('\n我在這裡等天亮');
    await expect.poll(async () => (await bands(page)).at(-1)).toEqual(['亮', '14']);
    expect(await page.evaluate(() => window.__other.isConnected), '別段的色塊沒有被換掉').toBe(true);
    expect(await bands(page)).toEqual([['光', '14'], ['窗', '14'], ['道', '8'], ['到', '8'], ['亮', '14']]);
    expect(errors).toEqual([]);
    await context.close();
});

test('上色：語助詞、標點、英文、空行', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', F_PART)])]),
    });
    // 語助詞（啊、了、嗎）跳過；英文行與空行沒有色塊
    expect((await bands(page)).map(b => b[0])).toEqual(['亮', '慌', '你']);
    // 鏡像層的文字和輸入框一模一樣（只是多一個結尾零寬字元），行數也一樣
    expect(await page.locator('.rhyme-mirror').first().evaluate(m => m.textContent)).toBe(F_PART + '​');
    expect(errors).toEqual([]);
    await context.close();
});

test('上色：一句的段落是孤句', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', '我望著遠方的光')])]),
    });
    await expect(page.locator('.rhyme-mirror .rm-hl')).toHaveCount(1);
    await expect(page.locator('.rhyme-mirror .rm-hl')).toHaveClass(/\brm-solo\b/);
    expect(errors).toEqual([]);
    await context.close();
});

test('上色：字典與詞庫載好前不上色', async ({ browser }) => {
    let release;
    const gate = new Promise(r => { release = r; });
    const { context, page, errors } = await bootPage(browser, {
        wordlist: 'stub', waitWordlist: false, storage: v2Storage([song([typed('sa', 'verse', F_AABB)])]),
        // 後註冊的攔截先執行：把詞庫的每一塊都卡住，放行時交給 stub 回應
        beforeGoto: ({ context: c }) => c.route(/\/data\/wordlist-c0\d\.json(\?.*)?$/, async route => { await gate; await route.fallback(); }),
    });
    expect(await page.locator('.rhyme-mirror .rm-hl').count(), '詞庫還沒好：不畫').toBe(0);
    expect(await page.evaluate(() => Promise.race([window.__lhMapReady.then(() => 'ready'), new Promise(r => setTimeout(() => r('pending'), 300))]))).toBe('pending');
    expect(errors, '還沒好不算錯誤').toEqual([]);
    release();
    await page.evaluate(() => window.__lhMapReady);
    await expect.poll(() => bands(page)).toEqual([['光', '14'], ['窗', '14'], ['道', '8'], ['到', '8']]);
    expect(errors).toEqual([]);
    await context.close();
});

// 第 10-03 計畫：組字不動、過期規則、快取
// 計數器：lhRhymeAnalyze 被叫幾次、所有鏡像層的 childList 變動幾筆（含還沒送出的紀錄）
const installCounters = page => page.evaluate(() => {
    window.__an = 0;
    const o = window.lhRhymeAnalyze;
    window.lhRhymeAnalyze = function (...a) { window.__an++; return o.apply(this, a); };
    window.__mut = 0;
    window.__mo = new MutationObserver(rs => { window.__mut += rs.length; });
    document.querySelectorAll('.rhyme-mirror').forEach(m => window.__mo.observe(m, { childList: true, subtree: true }));
});
const counters = page => page.evaluate(() => ({ analyze: window.__an, mutations: window.__mut + window.__mo.takeRecords().length }));
const isStale = page => page.locator('.rhyme-mirror').first().evaluate(m => m.classList.contains('rm-stale'));

test('組字：組字中鏡像零變動，確認後才重畫', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', F_AABB)])]),
    });
    await installCounters(page);
    // 游標在最後一行行尾：組字中色塊照舊、沒有任何變動、一次都沒分析
    await caretToEnd(page);
    // 先把輸入框捲到底並等它停：游標移到行尾後輸入框會非同步捲動，組字中的捲動事件會（照設計）把鏡像層藏起來，測試就不穩
    await page.evaluate(() => { const ta = document.querySelector('.section-textarea'); ta.scrollTop = ta.scrollHeight; });
    await page.waitForTimeout(150);
    let during = null;
    await compose(page, ['ㄌ', 'ㄌㄧ', 'ㄌㄧㄤˋ'], '亮', async () => {
        during = { ...(await counters(page)), stale: await isStale(page) };
    });
    expect(during).toEqual({ analyze: 0, mutations: 0, stale: false });
    await expect.poll(() => bands(page), { timeout: 1500 }).toEqual([['光', '14'], ['窗', '14'], ['道', '8'], ['亮', '14']]);
    expect((await counters(page)).analyze).toBeGreaterThanOrEqual(1);
    // 游標在第一行最前面（句中改字）：組字中鏡像層只多一個 rm-stale，節點零變動；確認後重畫、藏起來的解除
    await page.evaluate(() => { const ta = document.querySelector('.section-textarea'); ta.focus(); ta.setSelectionRange(0, 0); window.__mo.takeRecords(); window.__mut = 0; });
    await compose(page, ['ㄏ', 'ㄏㄠˇ'], '好', async () => {
        during = { ...(await counters(page)), stale: await isStale(page) };
    });
    expect(during.stale).toBe(true);
    expect(during.mutations).toBe(0);
    await expect.poll(() => isStale(page), { timeout: 1500 }).toBe(false);
    expect(errors).toEqual([]);
    await context.close();
});

test('組字：句尾打字時色塊留著，換行或句中修改時先藏起來', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', F_AABB)])]),
    });
    const visible = () => page.locator('.rhyme-mirror').first().evaluate(m => getComputedStyle(m).visibility);
    await caretToEnd(page);
    await page.keyboard.type('亮');   // 行尾打字：色塊留著
    expect(await isStale(page)).toBe(false);
    expect(await visible()).toBe('visible');
    await page.keyboard.press('Enter');   // 行數變了：藏起來
    expect(await isStale(page)).toBe(true);
    expect(await visible()).toBe('hidden');
    await expect.poll(() => isStale(page), { timeout: 1500 }).toBe(false);
    expect((await bands(page)).map(b => b[0])).toEqual(['光', '窗', '道', '亮']);
    await page.evaluate(() => { document.querySelector('.section-textarea').setSelectionRange(2, 2); });
    await page.keyboard.type('好');   // 句中修改：藏起來，重畫後回來且仍在句尾字上
    expect(await isStale(page)).toBe(true);
    await expect.poll(() => isStale(page), { timeout: 1500 }).toBe(false);
    expect((await bands(page)).map(b => b[0])).toEqual(['光', '窗', '道', '亮']);
    expect(errors).toEqual([]);
    await context.close();
});

test('快取：打一個字再刪掉不重畫', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', F_AABB)])]),
    });
    await page.evaluate(() => {
        window.__n = document.querySelector('.rm-hl');
        window.__paints = 0;
        const o = window.lhMapPaint;
        window.lhMapPaint = function (...a) { window.__paints++; return o.apply(this, a); };
    });
    await caretToEnd(page);
    await page.keyboard.type('亮');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.__paints)).toBeGreaterThanOrEqual(1);
    expect(await page.evaluate(() => window.__n.isConnected), '文字沒變：節點還在').toBe(true);
    expect(errors).toEqual([]);
    await context.close();
});

test('快取：只重畫打字的那一段', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', F_AABB), typed('sb', 'chorus', '你好嗎\n走回來')])]),
    });
    await installCounters(page);
    await page.evaluate(() => {
        window.__ids = [];
        const o = window.lhMapPaint;
        window.lhMapPaint = function (el, ...a) { window.__ids.push(el.dataset.id); return o.call(this, el, ...a); };
    });
    await caretToEnd(page);
    await page.keyboard.type('一二三四五六七八九十', { delay: 30 });
    await page.waitForTimeout(600);
    const ids = await page.evaluate(() => window.__ids);
    expect(ids.length).toBeGreaterThanOrEqual(1);
    expect(ids.every(id => id === 'sa'), '只有被改的那一段重畫：' + ids).toBe(true);
    const n = (await counters(page)).analyze;
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n, '連續打字合併成少數幾次分析').toBeLessThanOrEqual(3);
    expect(errors).toEqual([]);
    await context.close();
});

// ===== 第 10-03 計畫：鏡像對齊與樣式一致 =====
// Playwright 預設帶 --hide-scrollbars，輸入框永遠沒有捲軸；要測捲軸寬的補償，得自己啟動一個沒有這個參數的瀏覽器
const launchWithBars = () => chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] });
// on：15px 的實體捲軸；off：完全沒有捲軸
const injectScrollbar = (page, on) => page.evaluate(on => {
    let st = document.getElementById('rmTestBar');
    if (!st) { st = document.createElement('style'); st.id = 'rmTestBar'; document.head.appendChild(st); }
    st.textContent = on ? '.section-textarea::-webkit-scrollbar { width: 15px } .section-textarea::-webkit-scrollbar-thumb { background: #888 }'
        : '.section-textarea::-webkit-scrollbar { display: none }';
}, on);
const frames = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 60)))));
// 手機、平板要先把歌詞 sheet 打開；電腦的左面板本來就開著
const openLyrics = async page => {
    const tab = page.locator('#mtab-lyrics');
    if (await tab.isVisible()) { await tab.tap(); await waitStill(page); }
};

// 第一段每個色塊的中心對上「句尾字」在輸入框裡的位置（用 lhMirror + lhCaretRect 量，容許左右 1px、上下 2px）；回傳每個色塊的誤差
const bandErrors = page => page.evaluate(() => {
    const ta = document.querySelector('.section-textarea'), secEl = ta.closest('.lyrics-section');
    const res = lhRhymeAnalyze(ta.value, { strict: false, skipParticles: true }, curSong().readings);
    const lines = ta.value.split('\n');
    let off = 0;
    const idx = [];
    res.rows.forEach((r, n) => { if (r.t) idx.push(off + r.t.i); off += lines[n].length + 1; });
    const hls = [...secEl.querySelectorAll('.rhyme-mirror .rm-hl')];
    const m = lhMirror(ta);
    const out = idx.map((i, k) => {
        const c = lhCaretRect(ta, m, i), r = hls[k].getBoundingClientRect();
        return { dx: Math.abs(r.left - c.left), dy: Math.abs((r.top + r.height / 2) - (c.top + c.height / 2)), ch: hls[k].textContent === ta.value[i] };
    });
    m.remove();
    return { want: idx.length, got: hls.length, out };
});
const expectBandsAligned = async (page, tag) => {
    const r = await bandErrors(page);
    expect(r.got, tag + '：色塊數').toBe(r.want);
    expect(r.want, tag + '：至少有一個色塊').toBeGreaterThan(0);
    for (const e of r.out) {
        expect(e.ch, tag + '：色塊包的是句尾字').toBe(true);
        expect(e.dx, tag + '：左右誤差').toBeLessThanOrEqual(1);
        expect(e.dy, tag + '：上下誤差').toBeLessThanOrEqual(2);
    }
};
// 鏡像層的框等於輸入框的框（0.5px 內）
const expectBoxesEqual = async (page, tag) => {
    const b = await page.evaluate(() => {
        const ta = document.querySelector('.section-textarea'), m = ta.previousElementSibling;
        const r = e => { const x = e.getBoundingClientRect(); return [x.left, x.top, x.width, x.height]; };
        return { ta: r(ta), m: r(m), shown: getComputedStyle(m).display !== 'none' };
    });
    expect(b.shown, tag + '：鏡像層有顯示').toBe(true);
    b.ta.forEach((v, i) => expect(Math.abs(v - b.m[i]), `${tag}：框 ${['左', '上', '寬', '高'][i]}`).toBeLessThanOrEqual(0.5));
};

const LONG40 = Array.from({ length: 40 }, (_, k) => '歌詞很長很長'.repeat(2 + (k % 6)) + '光').join('\n');

test('鏡像對齊：與文字框逐像素相同', async () => {
    const browser = await launchWithBars();
    const { context, page, errors } = await bootPage(browser, {
        device: DEVICES.desktop, wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', LONG40)])]),
    });
    await injectScrollbar(page, true);
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await frames(page);
    const bar = await page.evaluate(() => { const ta = document.querySelector('.section-textarea'); return ta.offsetWidth - ta.clientWidth; });
    expect(bar, '輸入框真的有 15px 捲軸').toBeGreaterThanOrEqual(15);
    const setMode = mode => page.evaluate(m => {
        let st = document.getElementById('rmShot');
        if (!st) { st = document.createElement('style'); st.id = 'rmShot'; document.head.appendChild(st); }
        const taOn = '#222', off = 'transparent';
        const col = (sel, c) => `${sel} { color: ${c} !important; -webkit-text-fill-color: ${c} !important; }`;
        st.textContent = col('.section-textarea', m === 'ta' ? taOn : off) + col('.rhyme-mirror', m === 'ta' ? off : taOn)
            + '.section-textarea { caret-color: transparent !important } .rm-hl { background: none !important; box-shadow: none !important; text-decoration: none !important }';
    }, mode);
    const shoot = async mode => {
        await setMode(mode);
        await frames(page);
        const box = await page.locator('.section-textarea').first().boundingBox();
        return page.screenshot({ clip: box });
    };
    const scrollTo = async frac => {
        await page.evaluate(f => { const ta = document.querySelector('.section-textarea'); ta.scrollTop = Math.round((ta.scrollHeight - ta.clientHeight) * f); }, frac);
        await frames(page);
    };
    for (const [name, frac] of [['頂', 0], ['中', 0.5], ['底', 1]]) {
        await scrollTo(frac);
        const a = await shoot('ta'), b = await shoot('mirror');
        expect(a.equals(b), `捲動在${name}：兩張截圖逐像素相同`).toBe(true);
    }
    // 負向對照：把捲軸寬的補償拿掉，換行位置就不同，截圖必須不同（證明這個測試抓得到）
    await scrollTo(0);
    const a0 = await shoot('ta');
    await page.evaluate(() => { const ta = document.querySelector('.section-textarea'); ta.previousElementSibling.style.paddingRight = getComputedStyle(ta).paddingRight; });
    const bad = await shoot('mirror');
    expect(a0.equals(bad), '拿掉補償後必須不同').toBe(false);
    expect(errors).toEqual([]);
    await context.close();
    await browser.close();
});

test('樣式一致：鏡像與文字框的計算樣式相同', async ({ browser }) => {
    const PROPS = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'paddingTop', 'paddingLeft', 'paddingBottom',
        'whiteSpace', 'overflowWrap', 'wordBreak', 'tabSize', 'textIndent', 'textTransform'];
    const text = '我望著遠方的光\n獨自站在窗\nHello world 愛';
    for (const [name, device] of [['手機', DEVICES.phone], ['平板', DEVICES.tablet], ['電腦', DEVICES.desktop]]) {
        for (const pct of [100, 150]) {
            const { context, page, errors } = await bootPage(browser, { device, wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', text)])]) });
            await setScale(page, pct);
            await openLyrics(page);
            await waitStill(page);
            await frames(page);
            const got = await page.evaluate(props => {
                const ta = document.querySelector('.section-textarea'), m = ta.previousElementSibling;
                const a = getComputedStyle(ta), b = getComputedStyle(m);
                return props.map(p => [p, a[p], b[p]]);
            }, PROPS);
            for (const [p, x, y] of got) expect(y, `${name} ${pct}%：${p}`).toBe(x);
            await expectBoxesEqual(page, `${name} ${pct}%`);
            expect(errors).toEqual([]);
            await context.close();
        }
    }
});

test('鏡像對齊：長句換行的句尾仍在原字上', async () => {
    const browser = await launchWithBars();
    const LINE = '愛你ab路'.repeat(40);   // 200 個字元，中英交錯，最後是漢字
    expect(Array.from(LINE).length).toBe(200);
    for (const pct of [50, 100, 150]) {
        const { context, page, errors } = await bootPage(browser, {
            device: DEVICES.phone, wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', LINE)])]),
        });
        await setScale(page, pct);
        await openLyrics(page);
        await waitStill(page);
        for (const bar of [false, true]) {
            await injectScrollbar(page, bar);
            await frames(page);
            expect(await page.evaluate(() => { const t = document.querySelector('.section-textarea'); return t.offsetWidth - t.clientWidth; }), '捲軸寬').toBe(bar ? 15 : 0);
            await expectBandsAligned(page, `${pct}% ${bar ? '有' : '無'}捲軸`);
            await expectBoxesEqual(page, `${pct}% ${bar ? '有' : '無'}捲軸`);
        }
        expect(errors).toEqual([]);
        await context.close();
    }
    await browser.close();
});

test('鏡像對齊：英文長串、拉高度、縮放、收合展開之後', async ({ browser }) => {
    const text = 'a'.repeat(60) + '愛\n我望著遠方的光\n獨自站在窗\n走過熟悉的街道\n終於我也回到\n' + 'b'.repeat(30) + '想你想到心慌';
    const { context, page, errors } = await bootPage(browser, {
        device: DEVICES.desktop, wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', text), typed('sb', 'chorus', '你好嗎')])]),
    });
    const check = async tag => { await waitStill(page); await frames(page); await expectBoxesEqual(page, tag); await expectBandsAligned(page, tag); };
    await check('一開始');
    const rz = await page.locator('.section-resize').first().boundingBox();
    const [bx, by] = [rz.x + rz.width / 2, rz.y + rz.height / 2];
    await page.mouse.move(bx, by); await page.mouse.down(); await page.mouse.move(bx, by + 60, { steps: 6 }); await page.mouse.up();
    await check('拉高 60px 之後');
    await setScale(page, 150);
    await check('縮放 150% 之後');
    await page.locator('.lyrics-section').first().locator('.section-chevron').click();
    await expect(page.locator('.lyrics-section').first()).toHaveClass(/\bcollapsed\b/);
    await waitStill(page);
    await page.locator('.lyrics-section').first().locator('.section-chevron').click();
    await expect(page.locator('.lyrics-section').first()).not.toHaveClass(/\bcollapsed\b/);
    await check('收合再展開之後');
    expect(errors).toEqual([]);
    await context.close();
});

// ===== 第 10-03 計畫：主題、客製顏色、字典載不到 =====
test('對比：日夜主題切換不必重新整理', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', F_AABB)])]),
    });
    const read = () => page.evaluate(() => {
        const hl = document.querySelector('.rm-hl');
        return { v: document.documentElement.style.getPropertyValue('--rm-c0'), bg: getComputedStyle(hl).backgroundColor, theme: document.documentElement.dataset.theme };
    });
    const pal = await page.evaluate(() => JSON.parse(JSON.stringify(LH_RHYME_COLORS)));
    const light = await read();
    expect(light).toMatchObject({ v: pal.light[0], theme: 'light' });
    await page.evaluate(() => { window.__mark = 1; applyTheme(true, false); });
    await expect.poll(async () => (await read()).v).toBe(pal.dark[0]);
    const dark = await read();
    expect(dark.theme).toBe('dark');
    expect(dark.bg, '色塊的底色跟著變').not.toBe(light.bg);
    expect(await page.evaluate(() => window.__mark), '沒有重新載入').toBe(1);
    await page.evaluate(() => applyTheme(false, false));
    await expect.poll(async () => (await read()).v).toBe(pal.light[0]);
    expect(errors).toEqual([]);
    await context.close();
});

test('上色：客製顏色也有色塊', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        wordlist: 'stub',
        storage: v2Storage([song([typed('sa', 'verse', F_AABB)])], { ...OPEN_PANELS, containerBg: '#fff7e6', textColor: '#1a202c', highlightColor: '#2b6cb0' }),
    });
    expect((await bands(page)).length).toBe(4);
    const bgs = await page.locator('.rhyme-mirror .rm-hl').evaluateAll(els => els.map(e => getComputedStyle(e).backgroundColor));
    for (const bg of bgs) expect(bg, '客製配色下色塊底色不是透明').not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
    expect(errors).toEqual([]);
    await context.close();
});

test('上色：字典載不到時不上色也不報錯', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', F_AABB)])]),
        beforeGoto: ({ context: c }) => c.route(/\/data\/rhyme-dict\.js(\?.*)?$/, route => route.fulfill({ status: 404, body: 'nope' })),
    });
    await caretToEnd(page);
    await page.keyboard.type('\n再打一行');
    await page.waitForTimeout(500);
    expect(await page.locator('.rhyme-mirror .rm-hl').count(), '沒有字典：不上色').toBe(0);
    expect(await page.locator('.rhyme-mirror, .lyrics-section').evaluateAll(els => els.filter(e => e.classList.contains('rm-on')).length)).toBe(0);
    const mine = errors.filter(e => /rhyme-core\.js|rhyme-map\.js/.test(String(e)));
    expect(mine, '兩支新檔不報錯').toEqual([]);
    await context.close();
});

// ===== 第 10-04 計畫：「韻腳 ▾」選單與設定 =====
const lsGetMap = page => page.evaluate(() => localStorage.getItem('lh:map'));
const sw = (page, name) => page.locator('#rhymeMenu .rm-switch', { hasText: name });

test('開關：句尾上色關掉後重新整理還是關的', async ({ browser }) => {
    const storage = v2Storage([song([typed('sa', 'verse', F_AABB)])]);
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage });
    const btn = page.locator('#rhymeMenuBtn');
    await expect(btn).toHaveText('韻腳 ▾');
    await expect(btn).toHaveAttribute('aria-label', '韻腳地圖設定');
    await expect(btn).toHaveAttribute('aria-haspopup', 'dialog');
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
    // 按鈕在 ↶ ↷ 和「共 N 字」之間
    expect(await page.evaluate(() => [...document.querySelector('.lyrics-tools').children].map(n => n.id || n.className))).toEqual(['undo-group', 'rhymeMenuBtn', 'songTotal']);
    await btn.click();
    const menu = page.locator('#rhymeMenu');
    await expect(menu).toBeVisible();
    await expect(menu).toHaveAttribute('role', 'dialog');
    await expect(menu).toHaveAttribute('aria-label', '韻腳地圖設定');
    await expect(btn).toHaveAttribute('aria-expanded', 'true');
    const [br, mr] = await Promise.all([btn.boundingBox(), menu.boundingBox()]);
    expect(mr.y, '選單在按鈕下面').toBeGreaterThanOrEqual(br.y + br.height);
    expect(Math.abs(mr.x - br.x), '左緣對齊按鈕').toBeLessThan(40);
    const s = sw(page, '句尾上色');
    await expect(s).toHaveAttribute('role', 'switch');
    await expect(s).toHaveAttribute('aria-checked', 'true');
    await expect(s).toHaveText(/開$/);
    expect((await bands(page)).length).toBe(4);
    await s.click();
    await expect(s).toHaveAttribute('aria-checked', 'false');
    await expect(s).toHaveText(/關$/);
    await expect(menu, '切換後選單還開著').toBeVisible();
    await expect(page.locator('.rm-hl')).toHaveCount(0);
    expect(JSON.parse(await lsGetMap(page))).toEqual({ end: false, letters: false, inner: false, strict: false, skipParticles: true });
    // 重新整理：設定留著，色塊不回來
    await page.reload();
    await page.evaluate(() => Promise.all([window.__hoyunReady, window.__hoyunWordlistReady, window.__hoyunSongsReady, window.__lhMapReady]));
    await expect(page.locator('.rm-hl')).toHaveCount(0);
    await page.locator('#rhymeMenuBtn').click();
    await expect(sw(page, '句尾上色')).toHaveAttribute('aria-checked', 'false');
    await expect(sw(page, '句尾上色')).toHaveText(/關$/);
    await sw(page, '句尾上色').click();
    await expect.poll(async () => (await bands(page)).length).toBe(4);
    expect(errors).toEqual([]);
    await context.close();
});

test('開關：預設只開句尾上色', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', F_AABB)])]) });
    expect(await lsGetMap(page), '沒碰過就不寫').toBeNull();
    await page.locator('#rhymeMenuBtn').click();
    await expect(sw(page, '句尾上色')).toHaveText(/開$/);
    expect(await page.locator('#rhymeMenu .rm-switch').evaluateAll(els => els.filter(e => e.getAttribute('aria-checked') === 'true').map(e => e.dataset.k)), '預設開著的').toEqual(['end', 'skipParticles']);
    expect(await lsGetMap(page), '只是打開選單不寫').toBeNull();
    expect(errors).toEqual([]);
    await context.close();
});

const F_ABAB = '我望著遠方的光\n走過熟悉的街道\n你笑著說天亮\n不怕前方的路遙';
const radio = (page, name) => page.locator('#rhymeMenu [role=radio]', { hasText: name });
// 每個色塊／底線所在的行號（數鏡像層裡出現過幾個換行字元）
const lineOf = (page, sel) => page.locator('.rhyme-mirror').first().evaluate((m, q) => {
    const out = []; let line = 0;
    for (const n of m.childNodes) {
        if (n.nodeType === 3) line += (n.textContent.match(/\n/g) || []).length;
        else if (n.matches(q)) out.push([n.textContent, line]);
    }
    return out;
}, sel);

test('開關：嚴格與寬韻', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', F_ABAB)])]) });
    const solo = () => page.locator('.rhyme-mirror .rm-hl.rm-solo').count();
    const fs = () => bands(page).then(b => b.map(x => x[1]));
    const wideF = await fs();
    expect(await solo(), '寬韻：光、亮同家族，道、遙同家族，沒有孤句').toBe(0);
    await page.locator('#rhymeMenuBtn').click();
    await expect(radio(page, '寬韻')).toHaveAttribute('aria-checked', 'true');
    await expect(radio(page, '嚴格')).toHaveAttribute('aria-checked', 'false');
    await expect(page.locator('#rhymeMenu [role=radiogroup]')).toHaveAttribute('aria-label', '押韻判定');
    const help = page.locator('#rhymeMenu .rm-mode-help');
    await expect(help).toHaveText('寬韻：同一個韻族都算押韻（例：ㄤ、ㄧㄤ、ㄨㄤ）');
    await radio(page, '嚴格').click();
    await expect(radio(page, '嚴格')).toHaveAttribute('aria-checked', 'true');
    await expect(radio(page, '寬韻')).toHaveAttribute('aria-checked', 'false');
    await expect(help).toHaveText('嚴格：韻母要完全一樣才算押韻（例：ㄤ 和 ㄧㄤ 不同）');
    await expect(page.locator('#rhymeMenu')).toBeVisible();
    await expect.poll(solo, '嚴格：光ㄨㄤ、亮ㄧㄤ各自不同，四句都是孤句').toBe(4);
    expect(await fs(), '顏色一律照家族，不因判定改變').toEqual(wideF);
    expect(JSON.parse(await lsGetMap(page)).strict).toBe(true);
    await page.reload();
    await page.evaluate(() => window.__lhMapReady);
    await expect.poll(solo).toBe(4);
    await page.locator('#rhymeMenuBtn').click();
    await expect(radio(page, '嚴格')).toHaveAttribute('aria-checked', 'true');
    // 方向鍵只移焦點，Enter 才選
    await radio(page, '嚴格').focus();
    await page.keyboard.press('ArrowLeft');
    await expect(radio(page, '寬韻')).toBeFocused();
    await expect(radio(page, '嚴格')).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Enter');
    await expect(radio(page, '寬韻')).toHaveAttribute('aria-checked', 'true');
    await expect.poll(solo).toBe(0);
    expect(errors).toEqual([]);
    await context.close();
});

test('開關：忽略句尾語助詞', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', '愛你到天亮啊')])]) });
    expect((await bands(page)).map(b => b[0])).toEqual(['亮']);
    await page.locator('#rhymeMenuBtn').click();
    const s = sw(page, '忽略句尾語助詞');
    await expect(s).toHaveText(/開$/);
    await expect(page.locator('#rhymeMenu')).toContainText('略過：啊、呀、哪、呢、喔、哦、噢、吧、啦、嘛、耶、欸、囉、唷、了、的、嗎');
    await s.click();
    await expect(s).toHaveText(/關$/);
    await expect.poll(async () => (await bands(page)).map(b => b[0])).toEqual(['啊']);
    expect(JSON.parse(await lsGetMap(page)).skipParticles).toBe(false);
    await s.click();
    await expect.poll(async () => (await bands(page)).map(b => b[0])).toEqual(['亮']);
    expect(errors).toEqual([]);
    await context.close();
});

test('句中：預設關、打開後最多三個底線', async ({ browser }) => {
    const text = '我想望向遠方的光\n他在窗邊唱\n你看見天亮';
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', text)])]) });
    await expect(page.locator('.rm-inner')).toHaveCount(0);
    await page.locator('#rhymeMenuBtn').click();
    const s = sw(page, '句中押韻');
    await expect(s).toHaveText(/關$/);
    await expect(page.locator('#rhymeMenu')).toContainText('句子裡面跟句尾押同韻的字，加底線（每行最多 3 個）');
    expect(await s.getAttribute('aria-describedby')).toBeTruthy();
    await s.click();
    await expect(s).toHaveText(/開$/);
    await expect(page.locator('.rm-inner')).toHaveCount(4);
    // 第一行最多 3 個（想望向，方也押韻但排第四）；第二行窗；第三行沒有；句尾字不在裡面
    expect(await lineOf(page, '.rm-inner')).toEqual([['想', 0], ['望', 0], ['向', 0], ['窗', 1]]);
    expect(await page.locator('.rm-inner').evaluateAll(els => els.map(e => e.dataset.f))).toEqual(['14', '14', '14', '14']);
    expect(await lineOf(page, '.rm-hl')).toEqual([['光', 0], ['唱', 1], ['亮', 2]]);
    expect(await page.locator('.rm-inner').first().evaluate(e => getComputedStyle(e).textDecorationLine)).toBe('underline');
    // 句尾上色關掉：底線還在，色塊沒了
    await sw(page, '句尾上色').click();
    await expect(page.locator('.rm-hl')).toHaveCount(0);
    await expect(page.locator('.rm-inner')).toHaveCount(4);
    await expect(page.locator('.lyrics-section').first()).toHaveClass(/\brm-on\b/);
    // 兩個都關：鏡像層全空
    await s.click();
    await expect(page.locator('.rm-inner')).toHaveCount(0);
    expect(await page.locator('.rhyme-mirror').first().evaluate(m => m.childNodes.length), '兩個都關：不分析、鏡像層是空的').toBe(0);
    await expect(page.locator('.lyrics-section').first()).not.toHaveClass(/\brm-on\b/);
    expect(JSON.parse(await lsGetMap(page))).toEqual({ end: false, letters: false, inner: false, strict: false, skipParticles: true });
    expect(errors).toEqual([]);
    await context.close();
});

test('開關：色票對照', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', F_AABB)])]) });
    await page.locator('#rhymeMenuBtn').click();
    const toggle = page.locator('#rhymeMenu .rm-legend-toggle');
    const legend = page.locator('#rhymeLegend');
    await expect(toggle).toHaveText('色票對照 ▾');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toHaveAttribute('aria-controls', 'rhymeLegend');
    await expect(legend).toBeHidden();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(legend).toBeVisible();
    const cells = await legend.locator('.rm-cell').evaluateAll(els => els.map(e => [e.querySelector('.rm-cell-label').textContent, e.querySelector('.rm-sw').dataset.f]));
    expect(cells).toHaveLength(17);
    expect(cells.map(c => c[0])).toEqual(['ㄧ', 'ㄨ', 'ㄩ', 'ㄚ', 'ㄛ', 'ㄜ', 'ㄝ', 'ㄞ', 'ㄠ', 'ㄢ', 'ㄧㄢ', 'ㄣ', 'ㄥ', 'ㄧㄣ', 'ㄤ', 'ㄨㄥ', '空韻']);
    expect(cells.map(c => c[1])).toEqual(Array.from({ length: 17 }, (_, i) => String(i)));
    expect(await legend.locator('.rm-cell, .rm-sw').evaluateAll(els => els.some(e => e.tabIndex >= 0 && e.matches('button, [tabindex]')))).toBe(false);
    expect(await legend.locator('.rm-sw').first().evaluate(e => getComputedStyle(e).backgroundColor)).not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
    // 每次打開選單都是收著的
    await page.locator('#rhymeMenuBtn').click();
    await page.locator('#rhymeMenuBtn').click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(legend).toBeHidden();
    expect(errors).toEqual([]);
    await context.close();
});

// ===== 第 10-04 計畫：備份、壞值、多分頁、載入中、鍵盤焦點 =====
const MAP_DEFAULT = '{"end":true,"letters":false,"inner":false,"strict":false,"skipParticles":true}';
const buildBackup = page => page.evaluate(() => lhBuildBackup(songs, activeSongId, savedWords));

test('備份：韻腳設定跟著備份走', async ({ browser }) => {
    const A = await bootPage(browser, { wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', F_AABB)])]) });
    await A.page.locator('#rhymeMenuBtn').click();
    await radio(A.page, '嚴格').click();
    await sw(A.page, '句中押韻').click();
    const want = '{"end":true,"letters":false,"inner":true,"strict":true,"skipParticles":true}';
    expect(await lsGetMap(A.page)).toBe(want);
    const backup = await buildBackup(A.page);
    expect(backup.settings['lh:map'], '備份檔帶著 lh:map').toBe(want);
    const text = JSON.stringify(backup);
    expect(await A.page.evaluate(t => lhParseBackup(t).settings['lh:map'], text), '解析後仍是同一份（整理過的字串）').toBe(want);
    await A.context.close();
    // 乾淨瀏覽器走「全部還原」，重新整理後設定與畫面都是 A 的
    const B = await bootPage(browser, { wordlist: 'stub', storage: { leftPanelCollapsed: 'false' } });
    expect(await lsGetMap(B.page)).toBeNull();
    await B.page.setInputFiles('#importFileInput', { name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(text) });
    await expect(B.page.locator('#importOverlay')).toBeVisible();
    await B.page.getByRole('button', { name: '全部還原（取代目前資料）' }).click();
    await expect(B.page.locator('#copyToast')).toContainText('已還原');
    expect(await lsGetMap(B.page)).toBe(want);
    await B.page.reload();
    await B.page.evaluate(() => Promise.all([window.__hoyunReady, window.__hoyunWordlistReady, window.__hoyunSongsReady, window.__lhMapReady]));
    await expect.poll(() => B.page.locator('.rm-inner').count(), '還原後句中押韻是開的').toBeGreaterThan(0);
    await B.page.locator('#rhymeMenuBtn').click();
    await expect(radio(B.page, '嚴格')).toHaveAttribute('aria-checked', 'true');
    expect(B.errors).toEqual([]);
    await B.context.close();
});

test('備份：壞掉的韻腳設定', async ({ browser }) => {
    const { context, page, errors, warnings } = await bootPage(browser, { wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', F_AABB)])]) });
    const parse = lhMap => {
        const b = { format: 'lucky-hawaii-backup', version: 2, exportedAt: '2026-10-11T07:30:00.000Z', songs: [{ id: 'x', title: 'x', createdAt: 1, updatedAt: 1, sections: [{ id: 'y', label: '主歌', text: 'a', collapsed: false }], hashtags: [], context: '' }], activeSong: null, savedWords: [], settings: { 'lh:map': lhMap } };
        return page.evaluate(t => lhParseBackup(t), JSON.stringify(b));
    };
    // 字串 'yes'、多出來的鍵：只留五個鍵的真布林，其餘用預設
    const bad = await parse('{"end":"yes","strict":true,"evil":1}');
    expect(bad.settings['lh:map']).toBe('{"end":true,"letters":false,"inner":false,"strict":true,"skipParticles":true}');
    // 合法 JSON 但不是物件：整份退回預設
    expect((await parse('[1,2]')).settings['lh:map']).toBe(MAP_DEFAULT);
    // 不是 JSON：不收，記一則警告
    const before = warnings.length;
    const junk = await parse('not json');
    expect(junk.ok).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(junk.settings, 'lh:map')).toBe(false);
    await expect.poll(() => warnings.slice(before).filter(w => w.includes('[好韻器]') && w.includes('韻腳地圖設定')).length).toBe(1);
    expect(errors).toEqual([]);
    await context.close();
});

test('開關：儲存裡的值壞掉時用預設', async ({ browser }) => {
    for (const bad of ['[1,2]', '{"end":"false","inner":1}']) {
        const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', F_AABB)])], { ...OPEN_PANELS, 'lh:map': bad }) });
        expect((await bands(page)).length, bad + '：開機用預設，四個色塊').toBe(4);
        await page.locator('#rhymeMenuBtn').click();
        for (const [name, on] of [['句尾上色', true], ['句中押韻', false], ['忽略句尾語助詞', true]]) {
            await expect(sw(page, name), bad + ' ' + name).toHaveAttribute('aria-checked', String(on));
        }
        await expect(radio(page, '寬韻')).toHaveAttribute('aria-checked', 'true');
        await sw(page, '句尾上色').click();
        expect(await lsGetMap(page), '下一次切換寫回乾淨的五鍵物件').toBe('{"end":false,"letters":false,"inner":false,"strict":false,"skipParticles":true}');
        expect(errors).toEqual([]);
        await context.close();
    }
});

test('開關：別的分頁改了設定', async ({ browser }) => {
    const { context, pages: [a, b], errs } = await openTwoTabs(browser, v2Storage([song([typed('sa', 'verse', F_AABB)])]));
    expect((await bands(b)).length).toBe(4);
    await b.locator('#rhymeMenuBtn').click();
    await expect(b.locator('#rhymeMenu')).toBeVisible();
    await a.evaluate(() => localStorage.setItem('lh:map', '{"end":false,"letters":false,"inner":false,"strict":false,"skipParticles":true}'));
    await expect(b.locator('#rhymeMenu')).toBeHidden();
    await expect(b.locator('#rhymeMenuBtn')).toHaveAttribute('aria-expanded', 'false');
    await expect(b.locator('.rm-hl')).toHaveCount(0);
    await b.locator('#rhymeMenuBtn').click();
    await expect(sw(b, '句尾上色')).toHaveAttribute('aria-checked', 'false');
    for (const e of errs) expect(e.errors).toEqual([]);
    await context.close();
});

test('開關：詞庫載入中的提示', async ({ browser }) => {
    let release;
    const gate = new Promise(r => { release = r; });
    const { context, page, errors } = await bootPage(browser, {
        wordlist: 'stub', waitWordlist: false, storage: v2Storage([song([typed('sa', 'verse', F_AABB)])]),
        beforeGoto: ({ context: c }) => c.route(/\/data\/wordlist-c0\d\.json(\?.*)?$/, async route => { await gate; await route.fallback(); }),
    });
    await page.locator('#rhymeMenuBtn').click();
    const cap = page.locator('#rhymeMenu', { hasText: '詞庫載入中，載好後會自動上色' }).locator('.rm-loading');
    await expect(cap).toBeVisible();
    await expect(cap).toHaveText('詞庫載入中，載好後會自動上色');
    await sw(page, '句中押韻').click();   // 載入中控制項照樣能用
    await expect(sw(page, '句中押韻')).toHaveAttribute('aria-checked', 'true');
    expect(await page.locator('.rm-hl, .rm-inner').count()).toBe(0);
    release();
    await page.evaluate(() => window.__lhMapReady);
    await expect(cap).toBeHidden();
    await expect.poll(() => bands(page)).toEqual([['光', '14'], ['窗', '14'], ['道', '8'], ['到', '8']]);
    expect(errors).toEqual([]);
    await context.close();
});

test('開關：鍵盤開選單的焦點', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', F_AABB)])]) });
    const inMenu = () => page.evaluate(() => document.getElementById('rhymeMenu').contains(document.activeElement));
    await page.locator('#rhymeMenuBtn').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#rhymeMenu')).toBeVisible();
    await expect(sw(page, '句尾上色'), '鍵盤打開：第一個開關有焦點').toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('#rhymeMenu .section-menu-close'), 'Shift+Tab 從第一個繞到最後').toBeFocused();
    await page.keyboard.press('Tab');
    await expect(sw(page, '句尾上色'), 'Tab 從最後繞到第一個').toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#rhymeMenu')).toBeHidden();
    await expect(page.locator('#rhymeMenuBtn')).toBeFocused();
    await expect(page.locator('#rhymeMenuBtn')).toHaveAttribute('aria-expanded', 'false');
    // 滑鼠點開：不搶焦點
    await page.locator('#rhymeMenuBtn').click();
    await expect(page.locator('#rhymeMenu')).toBeVisible();
    expect(await inMenu(), '指標打開：焦點不在選單裡').toBe(false);
    // 點選單外面關掉
    await page.locator('#songTotal').click();
    await expect(page.locator('#rhymeMenu')).toBeHidden();
    // 「關閉韻腳設定」關掉並把焦點還給按鈕
    await page.locator('#rhymeMenuBtn').click();
    await page.locator('#rhymeMenu .section-menu-close').click();
    await expect(page.locator('#rhymeMenu')).toBeHidden();
    await expect(page.locator('#rhymeMenuBtn')).toBeFocused();
    expect(errors).toEqual([]);
    await context.close();
});

// ===== 第 10-05 計畫：選字浮動列 =====
const BAR = '#rhymeSelBar';
// 第 n 段的輸入框：聚焦並選 [a, b)
const pick = (page, a, b, n = 0) => page.evaluate(([a, b, n]) => {
    const ta = document.querySelectorAll('.section-textarea')[n];
    ta.focus(); ta.setSelectionRange(a, b);
}, [a, b, n]);
const taState = page => page.evaluate(() => {
    const ta = document.activeElement;
    return { ta: ta.classList.contains('section-textarea'), a: ta.selectionStart, b: ta.selectionEnd };
});
// 第 n 段索引 i 那個字所在行的底邊（螢幕座標）與該字右緣
const lineBottom = (page, i, n = 0) => page.evaluate(([i, n]) => {
    const ta = document.querySelectorAll('.section-textarea')[n], m = lhMirror(ta), p = lhCaretRect(ta, m, i);
    m.remove();
    return { bottom: p.top + p.height, left: p.left };
}, [i, n]);

test('浮動列：反白後出現、按查韻就查', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', F_AABB)])]),
    });
    await expect(page.locator(BAR)).toBeHidden();
    // 第一行行尾，Shift+← 兩次選到「的光」（鍵盤選取：400ms 後才出現）
    await pick(page, 7, 7);
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');
    await expect(page.locator(BAR)).toBeVisible();
    await expect(page.locator(BAR)).toHaveAttribute('role', 'toolbar');
    await expect(page.locator(BAR)).toHaveAttribute('aria-label', '選字工具');
    await expect(page.locator(BAR + ' button').first()).toHaveText('🔍 查韻：光');
    await expect(page.locator(BAR + ' button').nth(1)).toHaveText('✨ AI 建議');
    const box = await page.locator(BAR).boundingBox();
    const line = await lineBottom(page, 7);
    expect(box.y, '浮動列在選取那一行的下方').toBeGreaterThanOrEqual(line.bottom - 0.5);
    expect(Math.abs(box.x - line.left), '左緣約在選取結尾').toBeLessThan(40);
    // 查韻：搜尋框是「光」、有字卡；焦點與選取都還在輸入框，浮動列收掉
    await page.locator(BAR + ' button').first().click();
    await expect(page.locator('#searchInput')).toHaveValue('光');
    await expect.poll(() => page.locator('.char-card').count()).toBeGreaterThan(0);
    expect(await taState(page)).toEqual({ ta: true, a: 5, b: 7 });
    await expect(page.locator(BAR)).toBeHidden();
    expect(errors).toEqual([]);
    await context.close();
});

test('浮動列：只點一下不會出現', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', F_AABB)])]),
    });
    await page.locator('.section-textarea').click({ position: { x: 60, y: 20 } });
    await page.waitForTimeout(700);
    await expect(page.locator(BAR)).toBeHidden();
    await expect(page.locator('#searchInput')).toHaveValue('');
    expect(await page.locator('.char-card').count()).toBe(0);
    expect(errors).toEqual([]);
    await context.close();
});

const CHINESE21 = '一二三四五六七八九十一二三四五六七八九十一';
const waitBar = page => expect(page.locator(BAR)).toBeVisible();
const quiet = async (page, ms = 700) => { await page.waitForTimeout(ms); };

test('AI 建議：先查韻再出 AI 詞卡、送整首歌', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        wordlist: 'stub', aiReply: '天亮、心慌、離鄉',
        storage: v2Storage([song([typed('sa', 'verse', F_AABB), typed('sb', 'chorus', '第二段的歌詞')])], { leftPanelCollapsed: 'false', rightPanelCollapsed: 'true' }),
    });
    const bodies = [];
    page.on('request', r => { if (r.method() === 'POST' && new URL(r.url()).pathname === '/ai') bodies.push(r.postData()); });
    await expect(page.locator('#rightPanel')).toHaveClass(/\bcollapsed\b/);
    // 記下 AI 按鈕真正執行那一刻的 lastLyricsSelection：不是空的，AI 就只會拿到被選的字當歌詞（Pitfall 9）
    await page.evaluate(() => {
        const o = window.generateAISuggestions;
        window.generateAISuggestions = function (...a) { window.__selAtAI = lastLyricsSelection; window.__songAtAI = curSong().sections.map(s => s.text.trim()).filter(Boolean).join('\n'); return o.apply(this, a); };
        lastLyricsSelection = '光';   // 模擬滑鼠反白留下的值
    });
    await pick(page, 6, 7);
    await waitBar(page);
    await page.locator(BAR + ' button').nth(1).click();
    await expect(page.locator('#searchInput')).toHaveValue('光');
    await expect(page.locator('#rightPanel')).not.toHaveClass(/\bcollapsed\b/);
    await expect.poll(() => page.locator('.ai-word-card').count()).toBeGreaterThan(0);
    expect(bodies.length, '送出了 AI 請求').toBeGreaterThan(0);
    expect(await page.evaluate(() => window.__selAtAI), 'AI 按下去時沒有留著被選的字').toBe('');
    expect(await page.evaluate(() => window.__songAtAI), 'AI 用的歌詞是整首').toContain('第二段的歌詞');
    expect(await page.evaluate(() => lastLyricsSelection)).toBe('');
    await expect(page.locator(BAR)).toBeHidden();
    expect(errors).toEqual([]);
    await context.close();
});

test('浮動列：手機查韻與 AI 建議切分頁', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        wordlist: 'stub', device: DEVICES.phone, aiReply: '天亮、心慌、離鄉',
        storage: v2Storage([song([typed('sa', 'verse', F_AABB)])], {}),
    });
    const collapsed = id => page.locator(id).evaluate(n => n.classList.contains('collapsed'));
    // 開歌詞分頁、選字：查韻 → 回到查韻分頁，搜尋框有字、有字卡
    await page.locator('#mtab-lyrics').click();
    await waitStill(page);
    await pick(page, 6, 7);
    await waitBar(page);
    await page.locator(BAR + ' button').first().click();
    await expect(page.locator('#searchInput')).toHaveValue('光');
    expect(await collapsed('#leftPanel')).toBe(true);
    expect(await collapsed('#rightPanel')).toBe(true);
    await expect(page.locator('#mtab-search')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => page.locator('.char-card').count()).toBeGreaterThan(0);
    // 再回歌詞：沒有跳出來的浮動列
    await page.locator('#mtab-lyrics').click();
    await waitStill(page);
    await quiet(page);
    await expect(page.locator(BAR)).toBeHidden();
    // AI 建議：開 AI 分頁、詞卡出現
    await pick(page, 5, 7);
    await waitBar(page);
    await page.locator(BAR + ' button').nth(1).click();
    await expect(page.locator('#mtab-ai')).toHaveAttribute('aria-pressed', 'true');
    expect(await collapsed('#rightPanel')).toBe(false);
    await expect.poll(() => page.locator('.ai-word-card').count()).toBeGreaterThan(0);
    await page.locator('#mtab-lyrics').click();
    await waitStill(page);
    await quiet(page);
    await expect(page.locator(BAR)).toBeHidden();
    expect(errors).toEqual([]);
    await context.close();
});

test('浮動列：這些情況不出現', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        wordlist: 'stub',
        storage: v2Storage([song([typed('sa', 'verse', F_AABB), typed('sb', 'chorus', 'abc def'), typed('sc', 'bridge', CHINESE21)])]),
    });
    const hidden = async () => { await quiet(page); await expect(page.locator(BAR)).toBeHidden(); };
    await pick(page, 3, 3);
    await hidden();                                    // 只有游標
    await pick(page, 0, 3, 1);
    await hidden();                                    // 'abc'：沒有中文字
    await pick(page, 0, 21, 2);
    await hidden();                                    // 21 個字：太長
    await pick(page, 0, 20, 2);
    await waitBar(page);                               // 20 個字剛好可以
    await pick(page, 3, 3);
    await expect(page.locator(BAR)).toBeHidden();
    // 組字中：有選取也不出現
    await pick(page, 5, 7);
    await waitBar(page);
    let during = null;
    await compose(page, ['ㄌ', 'ㄌㄧ'], '你', async () => { await quiet(page); during = await page.locator(BAR).isVisible(); });
    expect(during, '組字中浮動列不在').toBe(false);
    await pick(page, 3, 3);
    // 韻腳選單開著
    await page.locator('#rhymeMenuBtn').click();
    await expect(page.locator('#rhymeMenu')).toBeVisible();
    await pick(page, 5, 7);
    await hidden();
    await page.keyboard.press('Escape');
    await pick(page, 3, 3);
    // 段落設定選單開著
    await page.locator('#lyricsSections .section-type').first().click({ button: 'right' });
    await expect(page.locator('#sectionMenu')).toBeVisible();
    await pick(page, 5, 7);
    await hidden();
    expect(errors).toEqual([]);
    await context.close();
});

test('浮動列：這些情況收起來', async ({ browser }) => {
    const long = Array.from({ length: 80 }, (_, i) => '第' + i + '句歌詞在這裡').join('\n');
    const mk = id => song([typed('sa', 'verse', F_AABB), typed('sb', 'chorus', long, { height: 160 })], { id });
    const { context, page, errors } = await bootPage(browser, {
        wordlist: 'stub', storage: v2Storage([mk('s1'), { ...mk('s2'), title: '第二首' }]),
    });
    const show = async (n = 0, a = 5, b = 7) => { await pick(page, a, b, n); await waitBar(page); };
    const gone = () => expect(page.locator(BAR)).toBeHidden();
    // Esc：焦點回輸入框、選取不變、不會自己再冒出來
    await show();
    await expect(page.locator('.section-textarea').first()).toHaveAttribute('aria-keyshortcuts', 'Alt+ArrowDown');
    await page.keyboard.press('Escape');
    await gone();
    expect(await taState(page)).toEqual({ ta: true, a: 5, b: 7 });
    await expect(page.locator('.section-textarea').first()).not.toHaveAttribute('aria-keyshortcuts', /.*/);
    await quiet(page);
    await gone();
    // 選取收合（Esc 收掉的那個選取不會自己再冒出來，所以換一個範圍）
    await show(0, 4, 7);
    await pick(page, 7, 7);
    await gone();
    // 輸入框捲動
    await show(1, 0, 3);
    await page.evaluate(() => {
        const ta = document.querySelectorAll('.section-textarea')[1], box = document.getElementById('lyricsSections');
        if (ta.scrollHeight > ta.clientHeight) ta.scrollTop = 80; else box.scrollTop = box.scrollTop + 80;
    });
    await gone();
    // 點頁面別處
    await show();
    await page.locator('#songTotal').click();
    await gone();
    // 開始組字
    await show();
    let during = null;
    await compose(page, ['ㄌ'], '你', async () => { during = await page.locator(BAR).isVisible(); });
    expect(during).toBe(false);
    // 換歌
    await show();
    await page.evaluate(() => switchSong('s2'));
    await gone();
    // 收左面板
    await show();
    await page.evaluate(() => toggleLeftPanel());
    await gone();
    expect(errors).toEqual([]);
    await context.close();
});

test('浮動列：按鈕不會吃掉選取', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', F_AABB)])]),
    });
    await pick(page, 5, 7);
    await waitBar(page);
    for (const i of [0, 1]) {
        const b = await page.locator(BAR + ' button').nth(i).boundingBox();
        await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
        await page.mouse.down();
        expect(await taState(page), '按下去、還沒放開：選取與焦點都還在').toEqual({ ta: true, a: 5, b: 7 });
        await page.mouse.move(b.x - 30, b.y - 30);   // 拖出按鈕再放開：不算點擊
        await page.mouse.up();
        await expect(page.locator(BAR)).toBeVisible();
    }
    expect(errors).toEqual([]);
    await context.close();
});

test('浮動列：鍵盤操作', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', F_AABB)])]),
    });
    const ta = page.locator('.section-textarea').first();
    await expect(ta).not.toHaveAttribute('aria-keyshortcuts', /.*/);
    await pick(page, 5, 7);
    await waitBar(page);
    await expect(ta).toHaveAttribute('aria-keyshortcuts', 'Alt+ArrowDown');
    await page.keyboard.press('Alt+ArrowDown');
    await expect(page.locator(BAR + ' button').first()).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator(BAR + ' button').nth(1)).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator(BAR + ' button').first()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator(BAR)).toBeHidden();
    await expect(ta).toBeFocused();
    expect(await taState(page)).toEqual({ ta: true, a: 5, b: 7 });
    await expect(ta).not.toHaveAttribute('aria-keyshortcuts', /.*/);
    // Enter 按下「查韻」：焦點與選取回輸入框
    await pick(page, 5, 7, 0);
    await page.keyboard.press('Shift+ArrowLeft');   // 選取變了，解除 Esc 留下的記號
    await page.keyboard.press('Shift+ArrowRight');
    await waitBar(page);
    await page.keyboard.press('Alt+ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.locator('#searchInput')).toHaveValue('光');
    await expect(ta).toBeFocused();
    expect(await taState(page)).toEqual({ ta: true, a: 5, b: 7 });
    await expect(page.locator(BAR)).toBeHidden();
    expect(errors).toEqual([]);
    await context.close();
});

// 最後一個可見行的中間：用鏡像算出可見範圍底邊那個點的索引，選它前後各一個字
const pickLastVisible = (page, n = 0) => page.evaluate(n => {
    const ta = document.querySelectorAll('.section-textarea')[n], r = ta.getBoundingClientRect();
    const vv = window.visualViewport, bottom = Math.min(r.bottom, vv.offsetTop + vv.height) - 6;
    const i = lhCaretIndexAt(ta, r.left + 30, bottom);
    ta.focus(); ta.setSelectionRange(Math.max(0, i - 2), i);
    return [Math.max(0, i - 2), i];
}, n);
const barBox = page => page.locator(BAR).boundingBox();
const LONG = Array.from({ length: 80 }, (_, i) => '第' + i + '句歌詞在這裡').join('\n');
const inViewport = (box, vp) => box.x >= -0.5 && box.y >= -0.5 && box.x + box.width <= vp.width + 0.5 && box.y + box.height <= vp.height + 0.5;

test('浮動列：在選取下方，放不下就貼在可見範圍底部', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        wordlist: 'stub', device: { viewport: { width: 1280, height: 560 } },
        storage: v2Storage([song([typed('sa', 'verse', F_AABB), typed('sb', 'chorus', LONG, { height: 700 })])]),
    });
    // 放得下：在選取那一行下方，左緣約在選取結尾（先把輸入框捲回最上面，第一行才看得到）
    await pick(page, 5, 7);
    await page.evaluate(() => { document.querySelector('.section-textarea').scrollTop = 0; });   // 聚焦時游標在最後，輸入框會捲到底
    await waitBar(page);
    const line = await lineBottom(page, 7);
    const box = await barBox(page);
    expect(box.y).toBeGreaterThanOrEqual(line.bottom - 0.5);
    expect(box.y - line.bottom, '細指標：約 0.25rem').toBeLessThan(24);
    expect(Math.abs(box.x - line.left)).toBeLessThan(40);
    // 放不下：段落捲到底、選最後一個可見行 → 浮動列整個在可見範圍內，貼在底部
    await page.evaluate(() => {
        const box = document.getElementById('lyricsSections'), ta = document.querySelectorAll('.section-textarea')[1];
        ta.scrollIntoView({ block: 'start' });   // 輸入框頂端對齊，底端超出畫面：最後一個可見行貼著畫面底邊
    });
    await waitStill(page);
    await pickLastVisible(page, 1);
    await waitBar(page);
    const kb = await readKeyboard(page);
    const b2 = await barBox(page);
    expect(insideVisible(b2, kb), '浮動列在可見範圍內').toBe(true);
    expect(inViewport(b2, page.viewportSize())).toBe(true);
    expect(b2.y + b2.height, '貼在可見範圍底部').toBeGreaterThanOrEqual(page.viewportSize().height - 12);
    expect(errors).toEqual([]);
    await context.close();
});

test('浮動列：鍵盤打開時仍在可見範圍內', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        wordlist: 'stub', device: DEVICES.phone,
        storage: v2Storage([song([typed('sa', 'verse', LONG, { height: 300 })])], {}),
    });
    await page.locator('#mtab-lyrics').click();
    await waitStill(page);
    await pickLastVisible(page, 0);
    await waitBar(page);
    const before = page.viewportSize();
    await emulateKeyboard(page, 336);
    const kb = await readKeyboard(page);
    expect(kb.open, '模擬鍵盤已開').toBe(true);
    await expect.poll(async () => insideVisible(await barBox(page), await readKeyboard(page))).toBe(true);
    const b = await barBox(page);
    expect(b.y + b.height, '不蓋到鍵盤').toBeLessThanOrEqual(before.height - 336 + 0.5);
    await expect(page.locator('#mobileTabBar')).toBeHidden();
    await expect(page.locator(BAR)).toBeVisible();
    expect(errors).toEqual([]);
    await context.close();
});

test('浮動列：手機長按選字，連續改選取只出現一次', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        wordlist: 'stub', device: DEVICES.phone,
        storage: v2Storage([song([typed('sa', 'verse', F_AABB)])], {}),
    });
    await page.locator('#mtab-lyrics').click();
    await waitStill(page);
    await page.evaluate(() => {
        window.__shows = []; window.__last = 0;
        const bar = lhMapBarBuild();
        let on = bar.classList.contains('show');
        new MutationObserver(() => {
            const now = bar.classList.contains('show');
            if (now && !on) window.__shows.push(performance.now());
            on = now;
        }).observe(bar, { attributes: true, attributeFilter: ['class'] });
    });
    for (const [a, b] of [[0, 2], [0, 3], [1, 4], [2, 4], [3, 7]]) {
        await page.evaluate(([a, b]) => { const ta = document.querySelector('.section-textarea'); ta.focus(); ta.setSelectionRange(a, b); window.__last = performance.now(); }, [a, b]);
        await page.waitForTimeout(100);
    }
    await waitBar(page);
    await quiet(page, 600);
    const r = await page.evaluate(() => ({ shows: window.__shows, last: window.__last }));
    expect(r.shows.length, '只出現一次').toBe(1);
    expect(r.shows[0] - r.last, '最後一次改變之後約 400ms').toBeGreaterThan(300);
    expect(r.shows[0] - r.last).toBeLessThan(900);
    const line = await lineBottom(page, 7);
    expect((await barBox(page)).y, '在選取下方').toBeGreaterThanOrEqual(line.bottom - 0.5);
    expect(errors).toEqual([]);
    await context.close();
});

test('浮動列：觸控按鈕夠大', async ({ browser }) => {
    for (const [name, device] of [['手機', DEVICES.phone], ['平板', DEVICES.tablet], ['橫放平板', DEVICES.tabletLandscape]]) {
        const { context, page, errors } = await bootPage(browser, {
            wordlist: 'stub', device, storage: v2Storage([song([typed('sa', 'verse', F_AABB)])]),
        });
        if (await page.evaluate(() => lhIsSheetMode())) { await page.locator('#mtab-lyrics').click(); await waitStill(page); }
        await pick(page, 5, 7);
        await waitBar(page);
        const a = await auditTouchTargets(page, { mustSee: ['#rhymeSelBar button'] });
        expect(a.missing, name + '：兩顆按鈕都量到').toEqual([]);
        // 只看浮動列自己的按鈕（橫放平板右面板打開時，別的控制項的既有狀況不在這裡管）
        expect(a.failures.filter(f => /rm-bar/.test(f.selector)), name + '：每顆至少 44×44').toEqual([]);
        expect(a.overlaps.filter(o => /rm-bar/.test(o.a + o.b)), name + '：不重疊').toEqual([]);
        expect(errors).toEqual([]);
        await context.close();
    }
});

test('浮動列：超長段落不量版面、直接貼底', async ({ browser }) => {
    const huge = '愛你到天亮\n'.repeat(45000);   // 超過 LH_WD_BIG（200000 字）
    expect(huge.length).toBeGreaterThan(200000);
    const { context, page, errors } = await bootPage(browser, {
        wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', huge)])]),
    });
    await page.evaluate(() => {
        window.__mirrors = 0;
        const o = window.lhMirror;
        window.lhMirror = function (...a) { window.__mirrors++; return o.apply(this, a); };
    });
    await pick(page, 0, 4);
    await waitBar(page);
    expect(await page.evaluate(() => window.__mirrors), '沒有量版面').toBe(0);
    const b = await barBox(page);
    expect(b.y + b.height).toBeGreaterThanOrEqual(page.viewportSize().height - 12);
    expect(inViewport(b, page.viewportSize())).toBe(true);
    expect(errors).toEqual([]);
    await context.close();
});

// ===== 第 10-06 計畫：手動讀音（指定讀音） =====
const RD = '#rhymeSelBar .rm-bar-rd';
const CHIPS = '#rhymeSelBar .rm-chip';
const READ_TXT = '我們一起行\n我望著遠方的光';
const READ_TAIL = '們一起行';
// 「行」的所有讀音、自動讀音，以及家族和自動讀音不同的另一個讀音（期望值全從頁面上的字典算出來）
const polyInfo = page => page.evaluate(() => {
    const rs = getCharAllReadings('行').map(x => x.reading);
    const fam = r => RHYME_TO_FAMILY[getZhuyinRhyme(r)];
    const auto = lhRhymeReading({ char: '行', tail: '們一起行' }, null);
    const other = rs.find(r => fam(r) !== fam(auto));
    return { rs, auto, other, fa: String(fam(auto)), fo: String(fam(other)) };
});
const bootRead = (browser, txt = READ_TXT, extra = {}) => bootPage(browser, {
    wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', txt)], extra)]),
});
const manualCount = page => page.locator('.rhyme-mirror .rm-hl.rm-manual').count();

test('讀音：破音字句尾可以指定讀音', async ({ browser }) => {
    const { context, page, errors } = await bootRead(browser);
    const info = await polyInfo(page);
    expect(info.rs.length, '行有多個讀音').toBeGreaterThan(1);
    expect(info.other, '有家族不同的讀音').toBeTruthy();
    expect(await bands(page)).toEqual([['行', info.fa], ['光', '14']]);
    await pick(page, 4, 5);
    await waitBar(page);
    await expect(page.locator(RD)).toBeVisible();
    await expect(page.locator(RD)).toHaveText('指定讀音');
    await expect(page.locator(RD)).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator(CHIPS)).toHaveCount(0);
    await page.locator(RD).click();
    await expect(page.locator(RD)).toHaveAttribute('aria-expanded', 'true');
    expect(await page.locator('.rm-bar-reading-label').textContent()).toBe('「行」讀音');
    expect(await page.locator(CHIPS).allTextContents()).toEqual(['自動', ...info.rs]);
    // 目前生效的讀音（沒指定時是自動判的那個）標 aria-pressed，其他沒有
    expect(await page.locator(CHIPS + '[aria-pressed="true"]').allTextContents()).toEqual([info.auto]);
    expect(await page.locator(CHIPS + '[aria-pressed="true"]').evaluate(c => getComputedStyle(c).fontWeight)).toBe('700');
    expect(await taState(page), '點按鈕不搶輸入框的焦點與選取').toEqual({ ta: true, a: 4, b: 5 });
    await page.locator(CHIPS, { hasText: info.other }).click();
    // 馬上換色、出現虛線提示、朗讀、浮動列收掉
    expect(await bands(page)).toEqual([['行', info.fo], ['光', '14']]);
    expect(await manualCount(page)).toBe(1);
    await expect(page.locator('#lhLive')).toHaveText('已指定「行」讀音為 ' + info.other);
    await expect(page.locator(BAR)).toBeHidden();
    expect((await activeSongRaw(page)).readings).toEqual({ [READ_TAIL]: info.other });
    // 重新整理還在
    await page.reload();
    await page.evaluate(() => Promise.all([window.__hoyunReady, window.__hoyunWordlistReady, window.__hoyunSongsReady, window.__lhMapReady]));
    expect(await bands(page)).toEqual([['行', info.fo], ['光', '14']]);
    expect(await manualCount(page)).toBe(1);
    expect(errors).toEqual([]);
    await context.close();
});

test('讀音：自動改回字典讀音', async ({ browser }) => {
    const { context, page, errors } = await bootRead(browser);
    const info = await polyInfo(page);
    await pick(page, 4, 5);
    await waitBar(page);
    await page.locator(RD).click();
    await page.locator(CHIPS, { hasText: info.other }).click();
    expect(await bands(page)).toEqual([['行', info.fo], ['光', '14']]);
    // 換個選取範圍（同一個範圍按過按鈕後不會自己再跳出來），目前讀音應該是剛指定的那個
    await pick(page, 3, 5);
    await waitBar(page);
    await page.locator(RD).click();
    expect(await page.locator(CHIPS + '[aria-pressed="true"]').allTextContents()).toEqual([info.other]);
    await page.locator(CHIPS, { hasText: '自動' }).click();
    expect(await bands(page)).toEqual([['行', info.fa], ['光', '14']]);
    expect(await manualCount(page)).toBe(0);
    await expect(page.locator('#lhLive')).toHaveText('「行」讀音改回自動');
    await expect(page.locator(BAR)).toBeHidden();
    const raw = await activeSongRaw(page);
    expect('readings' in raw, '空了就整個欄位拿掉').toBe(false);
    expect(errors).toEqual([]);
    await context.close();
});

test('讀音：不是句尾或不是破音字就沒有指定讀音', async ({ browser }) => {
    const txt = '我們一起行\n我望著遠方的光\n行走天涯\n我們都笑了';
    const { context, page, errors } = await bootRead(browser, txt);
    const at = (s, k = 0) => { let i = -1; while (k-- >= 0) i = txt.indexOf(s, i + 1); return i; };
    const cases = {
        '句中的字（們）': [at('們'), at('們') + 1],
        '破音字但在句中（行走）': [at('行', 1), at('行', 1) + 1],
        '不是破音字的句尾（光）': [at('光'), at('光') + 1],
        '句尾語助詞（了，忽略語助詞開著）': [at('了'), at('了') + 1],
    };
    for (const [name, [a, b]] of Object.entries(cases)) {
        await pick(page, a, b);
        await waitBar(page);
        await expect(page.locator(RD), name).toBeHidden();
        await page.keyboard.press('Escape');
        await expect(page.locator(BAR)).toBeHidden();
    }
    // 對照：「行」在句尾就有
    await pick(page, 4, 5);
    await waitBar(page);
    await expect(page.locator(RD)).toBeVisible();
    expect(errors).toEqual([]);
    await context.close();
});

test('讀音：觸控時指定讀音按鈕與每個晶片至少 44×44', async ({ browser }) => {
    for (const [name, device] of [['手機', DEVICES.phone], ['平板', DEVICES.tablet], ['橫放平板', DEVICES.tabletLandscape]]) {
        const b = await bootPage(browser, { wordlist: 'stub', device, storage: v2Storage([song([typed('sa', 'verse', READ_TXT)])]) });
        if (await b.page.evaluate(() => lhIsSheetMode())) { await b.page.locator('#mtab-lyrics').click(); await waitStill(b.page); }
        await pick(b.page, 4, 5);
        await waitBar(b.page);
        await b.page.locator(RD).click();
        const sizes = await b.page.locator('#rhymeSelBar button:visible').evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return [e.textContent, Math.round(r.width), Math.round(r.height)]; }));
        expect(sizes.length, name + '：查韻、AI、指定讀音加上晶片').toBeGreaterThan(4);
        for (const [t, w, h] of sizes) { expect(w, name + ' ' + t + ' 寬').toBeGreaterThanOrEqual(44); expect(h, name + ' ' + t + ' 高').toBeGreaterThanOrEqual(44); }
        expect(b.errors).toEqual([]);
        await b.context.close();
    }
});

test('讀音：鍵盤打開時焦點先到目前的讀音，Enter 選定後焦點回輸入框', async ({ browser }) => {
    const { context, page, errors } = await bootRead(browser);
    const info = await polyInfo(page);
    await pick(page, 4, 5);
    await waitBar(page);
    await page.keyboard.press('Alt+ArrowDown');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator(RD)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator(CHIPS + '[aria-pressed="true"]')).toBeFocused();
    expect(await page.locator(CHIPS + '[aria-pressed="true"]').textContent()).toBe(info.auto);
    await page.locator(CHIPS, { hasText: info.other }).focus();
    await page.keyboard.press('Enter');
    expect(await bands(page)).toEqual([['行', info.fo], ['光', '14']]);
    expect(await taState(page)).toEqual({ ta: true, a: 4, b: 5 });
    expect(errors).toEqual([]);
    await context.close();
});

// ----- 手動讀音的邊界：失效、舊歌不寫入、跨分頁、備份 -----
// 句尾「行」的讀音設好（直接呼叫設定函式，UI 路徑已在上面測過）
const setReading = (page, r) => page.evaluate(r => lhMapSetReading('sa', '們一起行', r), r);
const mkBk = (songArr, activeSong = null) => ({
    format: 'lucky-hawaii-backup', version: 2, exportedAt: '2026-10-11T07:30:00.000Z',
    songs: songArr, activeSong, savedWords: [], settings: {},
});
const backupSong = (id, title, o = {}) => ({
    id, title, createdAt: o.createdAt ?? 1000, updatedAt: 1000, hashtags: [], context: '',
    sections: [{ id: 'sec-' + id, label: '', text: o.text ?? READ_TXT, collapsed: false, type: 'verse', custom: '', color: '', height: null }],
    ...(o.readings !== undefined ? { readings: o.readings } : {}),
});
const sendBackup = (page, obj) => page.setInputFiles('#importFileInput', {
    name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj)),
});
const storedSongsRaw = page => page.evaluate(() => JSON.parse(localStorage.getItem('lh:songs')));

test('讀音：改了句尾就自動失效', async ({ browser }) => {
    const { context, page, errors } = await bootRead(browser);
    const info = await polyInfo(page);
    await setReading(page, info.other);
    expect(await bands(page)).toEqual([['行', info.fo], ['光', '14']]);
    // 在第一行行尾再打一個字：句尾鍵變了（們一起行 → 一起行走），原本的讀音不再套用，其他行不動
    await page.evaluate(() => { const ta = document.querySelector('.section-textarea'); ta.focus(); ta.setSelectionRange(5, 5); });
    await page.keyboard.type('走');
    const want = await page.evaluate(() => {
        const t = lhRhymeTarget('我們一起行走', true);
        return { c: t.char, f: String(RHYME_TO_FAMILY[getZhuyinRhyme(lhRhymeReading(t, null))]) };
    });
    await expect.poll(() => bands(page)).toEqual([[want.c, want.f], ['光', '14']]);
    expect(await manualCount(page)).toBe(0);
    expect(await page.locator('#copyToast.show').count(), '沒有提示').toBe(0);
    // 這首歌的 readings 原樣留著（只是不再套用），沒有因為失效而被改寫
    expect((await storedSongsRaw(page))[0].readings).toEqual({ [READ_TAIL]: info.other });
    expect(errors).toEqual([]);
    await context.close();
});

test('讀音：舊歌沒有讀音時開機不寫入', async ({ browser }) => {
    const songs = [song([typed('sa', 'verse', READ_TXT)])];
    const storage = v2Storage(songs);
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage });
    const before = storage['lh:songs'];
    expect(await page.evaluate(() => localStorage.getItem('lh:songs')), '開機後').toBe(before);
    await pick(page, 4, 5);
    await waitBar(page);
    await page.evaluate(() => lhMapRenderAll());
    expect(await page.evaluate(() => localStorage.getItem('lh:songs')), '第一次重畫後').toBe(before);
    // 備份與匯出：沒有指定過讀音的歌沒有 readings 欄位
    const bk = await page.evaluate(() => JSON.stringify(lhBuildBackup(songs, activeSongId, [])));
    expect(bk.includes('readings')).toBe(false);
    expect(errors).toEqual([]);
    await context.close();
});

test('讀音：別的分頁指定的讀音', async ({ browser }) => {
    const { context, pages: [a, b], errs } = await openTwoTabs(browser, v2Storage([song([typed('sa', 'verse', READ_TXT)])]));
    const info = await polyInfo(a);
    expect(await bands(b)).toEqual([['行', info.fa], ['光', '14']]);
    await setReading(a, info.other);
    await expect.poll(() => bands(b)).toEqual([['行', info.fo], ['光', '14']]);
    expect(await manualCount(b)).toBe(1);
    await setReading(a, null);
    await expect.poll(() => bands(b)).toEqual([['行', info.fa], ['光', '14']]);
    expect(await manualCount(b)).toBe(0);
    for (const e of errs) expect(e.errors).toEqual([]);
    await context.close();
});

test('備份：手動讀音跟著備份走', async ({ browser }) => {
    const A = await bootRead(browser);
    const info = await polyInfo(A.page);
    await setReading(A.page, info.other);
    const text = await A.page.evaluate(() => JSON.stringify(lhBuildBackup(songs, activeSongId, [])));
    expect(JSON.parse(text).songs[0].readings, '備份帶著讀音').toEqual({ [READ_TAIL]: info.other });
    expect(await A.page.evaluate(t => lhParseBackup(t).songs[0].readings, text), '解析後一樣').toEqual({ [READ_TAIL]: info.other });
    // 另一個乾淨的瀏覽器全部還原：重新整理後讀音和顏色都在
    const B = await bootPage(browser, { wordlist: 'stub', storage: v2Storage([song([typed('sb', 'verse', '別首歌的歌詞')], { id: 'zz' })]) });
    await sendBackup(B.page, text);
    await B.page.locator('#importReplaceBtn').click();
    await expect(B.page.locator('#copyToast')).toContainText('已還原');
    expect((await storedSongsRaw(B.page))[0].readings).toEqual({ [READ_TAIL]: info.other });
    await B.page.reload();
    await B.page.evaluate(() => Promise.all([window.__hoyunReady, window.__hoyunWordlistReady, window.__hoyunSongsReady, window.__lhMapReady]));
    expect(await bands(B.page)).toEqual([['行', info.fo], ['光', '14']]);
    expect(await manualCount(B.page)).toBe(1);
    expect(A.errors).toEqual([]);
    expect(B.errors).toEqual([]);
    await A.context.close();
    await B.context.close();
});

test('備份：不合法的讀音被丟掉，歌照常匯入', async ({ browser }) => {
    const { context, page, errors } = await bootRead(browser);
    const info = await polyInfo(page);
    // 用字串組檔，__proto__ 才會是真的自有屬性
    const mixed = `{"__proto__":"ㄌㄜˋ","constructor":"ㄌㄜˋ","們一起行":${JSON.stringify(info.other)},"一二三四五":"ㄨˇ","ab樂":"ㄌㄜˋ","音樂":"ㄅㄚ","12行":"ㄏㄤˊ","行":5,"我行":"ㄏㄤˊ ","你行":null,"他行":["ㄏㄤˊ"]}`;
    const file = JSON.stringify(mkBk([
        backupSong('m1', '混合', { readings: 'MIXED' }),
        backupSong('m2', '全壞', { readings: { '__proto__x': 'ㄌㄜˋ', '音樂': 'ㄅㄚ', '一二三四五': 'ㄨˇ' } }),
        backupSong('m3', '陣列', { readings: ['ㄏㄤˊ'] }),
        backupSong('m4', '空', { readings: {} }),
        backupSong('m5', '字串', { readings: 'ㄏㄤˊ' }),
        backupSong('m6', '空值', { readings: null }),
    ])).replace('"MIXED"', mixed);
    await sendBackup(page, file);
    await page.locator('#importAddBtn').click();
    await expect(page.locator('#copyToast')).toHaveText('已加入 6 首歌');
    const now = await storedSongsRaw(page);
    const by = t => now.find(s => s.title === t);
    expect(by('混合').readings, '只剩合法的那一筆').toEqual({ [READ_TAIL]: info.other });
    expect(Object.getPrototypeOf(by('混合').readings)).toBe(Object.prototype);
    for (const t of ['全壞', '陣列', '空', '字串', '空值']) expect('readings' in by(t), t + '：一筆都不剩就沒有這個欄位').toBe(false);
    expect(await page.evaluate(() => ({}).polluted === undefined && Object.keys(Object.prototype).length === 0)).toBe(true);
    expect(errors).toEqual([]);
    await context.close();
});

test('備份：每首歌最多留 2000 筆讀音', async ({ browser }) => {
    const { context, page, errors } = await bootRead(browser);
    const han = Array.from('天地玄黃宇宙洪荒日月盈昃辰宿列張寒來暑往秋收冬藏');
    const r = await page.evaluate(() => getCharAllReadings('光')[0].reading);
    const readings = {};
    for (const a of han) for (const b of han) for (const c of han) { if (Object.keys(readings).length < 2500) readings[a + b + c + '光'] = r; }
    expect(Object.keys(readings)).toHaveLength(2500);
    await sendBackup(page, mkBk([backupSong('big', '很多', { readings })]));
    await page.locator('#importAddBtn').click();
    await expect(page.locator('#copyToast')).toHaveText('已加入 1 首歌');
    const big = (await storedSongsRaw(page)).find(s => s.title === '很多');
    expect(Object.keys(big.readings)).toHaveLength(2000);
    expect(errors).toEqual([]);
    await context.close();
});

// ===== 第 10-07 計畫：段落標題列的結構字母與統計 =====
const STRIP = '.section-rhyme';
const stripTexts = page => page.locator('#lyricsSections .lyrics-section').evaluateAll((els, q) => els.map(e => {
    const b = e.querySelector(q);
    return b && !b.hidden && getComputedStyle(b).display !== 'none' ? b.textContent : null;
}), STRIP);
const LETTERS_SONG = () => v2Storage([song([typed('sa', 'verse', F_AABB), typed('sb', 'chorus', F_ABAB), typed('sc', 'bridge', F_PART)])]);

test('標題字母：打開後顯示 AABB', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: LETTERS_SONG() });
    // 沒打開過：每個標題列都沒有字母條（MAP-11 預設只有句尾上色）
    expect(await stripTexts(page)).toEqual([null, null, null]);
    expect(await page.locator(STRIP + ':visible').count()).toBe(0);
    // DOM 順序：把手、箭頭、名稱、字母條、字數、−
    expect(await page.locator('.lyrics-section-header').first().evaluate(h => [...h.children].map(c => c.className.split(' ')[0])))
        .toEqual(['section-handle', 'section-chevron', 'section-type', 'section-rhyme', 'section-count', 'section-remove']);
    await page.locator('#rhymeMenuBtn').click();
    const s = sw(page, '段落結構字母');
    await expect(s).toHaveAttribute('aria-checked', 'false');
    // 開關在「句尾上色」和「句中押韻」之間，旁邊有說明
    expect(await page.locator('#rhymeMenu .rm-switch').evaluateAll(els => els.map(e => e.dataset.k))).toEqual(['end', 'letters', 'inner', 'skipParticles']);
    await expect(page.locator('#rhymeHintLetters')).toHaveText('在每個段落標題列顯示 AABB 這類字母');
    await expect(s).toHaveAttribute('aria-describedby', 'rhymeHintLetters');
    await s.click();
    await expect(s).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('#rhymeMenu')).toBeVisible();
    await expect.poll(() => stripTexts(page)).toEqual(['AABB', 'ABAB', 'A-AB']);
    expect(JSON.parse(await lsGetMap(page)), '只有字母開關變了').toEqual({ end: true, letters: true, inner: false, strict: false, skipParticles: true });
    // 嚴格：ABAB 的四個韻母都不一樣
    await radio(page, '嚴格').click();
    await expect.poll(() => stripTexts(page)).toEqual(['AABB', 'ABCD', 'A-BC']);
    await radio(page, '寬韻').click();
    await expect.poll(() => stripTexts(page)).toEqual(['AABB', 'ABAB', 'A-AB']);
    // 字母底線：有韻的字有 data-f，「-」沒有
    expect(await page.locator(STRIP).nth(2).locator('span').evaluateAll(els => els.map(e => e.dataset.f !== undefined))).toEqual([true, false, true, true]);
    // 說明文字：aria-label 與 title
    await expect(page.locator(STRIP).first()).toHaveAttribute('aria-label', '押韻結構 AABB，按一下看統計');
    await expect(page.locator(STRIP).first()).toHaveAttribute('title', 'AABB　押韻 4/4 句，點一下看統計');
    await expect(page.locator(STRIP).nth(2)).toHaveAttribute('title', 'A-AB　押韻 2/4 句，點一下看統計');
    // 只開字母、關掉句尾上色：色塊沒有，字母條還在
    await sw(page, '句尾上色').click();
    await expect(page.locator('.rm-hl')).toHaveCount(0);
    expect(await stripTexts(page)).toEqual(['AABB', 'ABAB', 'A-AB']);
    await sw(page, '句尾上色').click();
    // 重新整理後仍開著
    await page.reload();
    await page.evaluate(() => window.__lhMapReady);
    await expect.poll(() => stripTexts(page)).toEqual(['AABB', 'ABAB', 'A-AB']);
    // 關掉：全部藏起來、沒有殘留內容
    await page.locator('#rhymeMenuBtn').click();
    await sw(page, '段落結構字母').click();
    await expect.poll(() => stripTexts(page)).toEqual([null, null, null]);
    expect(await page.locator(STRIP).evaluateAll(els => els.map(e => e.childNodes.length))).toEqual([0, 0, 0]);
    expect(JSON.parse(await lsGetMap(page)).letters).toBe(false);
    expect(errors).toEqual([]);
    await context.close();
});

test('標題字母：點字母條不會收合段落', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, {
        wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', F_AABB), typed('sb', 'chorus', F_ABAB)])], { ...OPEN_PANELS, 'lh:map': JSON.stringify({ end: true, letters: true, inner: false, strict: false, skipParticles: true }) }),
    });
    await expect.poll(() => stripTexts(page)).toEqual(['AABB', 'ABAB']);
    const first = page.locator('#lyricsSections .lyrics-section').first();
    await expect(first).not.toHaveClass(/\bcollapsed\b/);
    await first.locator(STRIP).click();
    await expect(first).not.toHaveClass(/\bcollapsed\b/);
    await first.locator(STRIP).focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press(' ');
    await expect(first).not.toHaveClass(/\bcollapsed\b/);
    // 對照：點標題列的空白處還是會收合
    await first.locator('.section-chevron').click();
    await expect(first).toHaveClass(/\bcollapsed\b/);
    expect(errors).toEqual([]);
    await context.close();
});
