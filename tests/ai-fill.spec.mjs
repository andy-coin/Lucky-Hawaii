// Phase 4 AI 挑詞填滿與造詞驗證：AI 只負責排序，數量由程式保證
import { test, expect } from '@playwright/test';
import { bootPage, settle, stubWordlist } from './helpers.mjs';
import { readFileSync } from 'node:fs';
import { loadCore } from './node-core.mjs';

const MODEL = { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite' };
// 面板收起時按鈕在畫面外，和 smoke 一樣直接觸發 click
const clickGenerate = page => page.evaluate(() => document.getElementById('generateBtn').click());

test('填滿：候選 ≥ 24 時 AI 只回 3 個，畫面仍剛好 24 張', async ({ browser }) => {
    const { context, page, errors, offOrigin } = await bootPage(browser);
    try {
        const prompts = [];
        let picks = [];
        await page.route('**/ai', route => {
            const prompt = route.request().postDataJSON().prompt;
            prompts.push(prompt);
            picks = /候選詞：([^\n]*)/.exec(prompt)[1].split('、').slice(0, 3);
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, text: picks.join('、'), model: MODEL, tried: [] }) });
        });
        await page.fill('#searchInput', '安');
        await settle(page);
        await clickGenerate(page);
        await expect(page.locator('#aiWordsContainer .ai-word-card')).toHaveCount(24);
        const cards = await page.locator('#aiWordsContainer .ai-word-card').allTextContents();
        expect(cards.slice(0, 3), 'AI 挑的 3 個照 AI 順序排最前').toEqual(picks);
        const ranks = await page.evaluate(ws => ws.map(w => wordPriorityMap.get(w) ?? 0), cards.slice(3));
        expect(ranks.length).toBe(21);
        for (let i = 1; i < ranks.length; i++) expect(ranks[i], `第 ${i + 3} 張 p 值不可大於前一張`).toBeLessThanOrEqual(ranks[i - 1]);
        expect(await page.locator('#aiWordsContainer .ai-badge').count()).toBe(0);
        expect(prompts.length, '一次按鈕只呼叫一次 /ai').toBe(1);
        expect(prompts[0]).not.toContain('直接生成');
        await expect(page.locator('#aiWordsContainer .candidate-report')).toContainText('挑出 24 個');
        expect(errors).toEqual([]);
        expect(offOrigin).toEqual([]);
    } finally { await context.close(); }
});

// ==================== 純函式（Node 直接載入，不開瀏覽器）====================
// 固定種子的亂數：失敗時可重現
function lcg(seed) {
    let x = seed >>> 0;
    return () => (x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 2 ** 32;
}

test('fillToTarget：數量剛好、無重複、全在候選池內', () => {
    const { ctx, ev } = loadCore();
    expect(ev('AI_TARGET')).toBe(24);
    const rnd = lcg(20261004);
    const T = 24;
    for (const size of [0, 1, 23, 24, 25, 1000]) {
        const pool = Array.from({ length: size }, (_, i) => `w${i}`);
        const rankMap = Object.fromEntries(pool.map(w => [w, Math.floor(rnd() * 5)]));   // 很多同分
        const off = ['外A', '外B', '外C'];
        const cases = {
            空: [],
            重複: [pool[0], pool[0], pool[1], pool[1]].filter(Boolean),
            池外: [...off, pool[2]].filter(Boolean),
            全池外: off,
            比目標長: Array.from({ length: 40 }, (_, i) => pool[i % Math.max(size, 1)] ?? off[0]),
        };
        for (const [name, picks] of Object.entries(cases)) {
            const r = JSON.parse(JSON.stringify(ctx.fillToTarget(pool, picks, T, w => rankMap[w] ?? 0)));
            const label = `size=${size} picks=${name}`;
            expect(r.words.length, label).toBe(Math.min(T, size));
            expect(new Set(r.words).size, `${label} 無重複`).toBe(r.words.length);
            expect(r.words.every(w => pool.includes(w)), `${label} 全在池內`).toBe(true);
            expect(r.picked + r.filled, label).toBe(r.words.length);
        }
    }
});

test('fillToTarget：同分維持原順序、AI 亂回也補滿', () => {
    const { ctx } = loadCore();
    const run = (pool, picks, target, rank) => JSON.parse(JSON.stringify(ctx.fillToTarget(pool, picks, target, rank)));
    // 全部同分：保持池原順序
    expect(run(['甲', '乙', '丙'], [], 2).words).toEqual(['甲', '乙']);
    // 重複與池外的 pick 只算一次、池外丟掉，AI 挑的排最前
    const dup = run(['甲', '乙', '丙'], ['乙', '乙', '外'], 2);
    expect(dup.picked).toBe(1);
    expect(dup.words).toEqual(['乙', '甲']);
    // AI 回太多：只取前 target 個，不補
    const pool = Array.from({ length: 40 }, (_, i) => `w${i}`);
    const first30 = pool.slice(0, 30);
    const over = run(pool, first30, 24);
    expect(over.words).toEqual(first30.slice(0, 24));
    expect(over.filled).toBe(0);
    // 補的部分依 rank 由高到低；全池外時等於依 rank 排好的前幾名
    const rank = w => ({ 丙: 3, 乙: 1 })[w] ?? 0;
    expect(run(['甲', '乙', '丙'], ['外'], 2, rank).words).toEqual(['丙', '乙']);
});

test('parseAiWords：分隔與長度', () => {
    const { ctx } = loadCore();
    const parse = t => JSON.parse(JSON.stringify(ctx.parseAiWords(t)));
    expect(parse('一心、二心，三心,四心\n五心 六心')).toEqual(['一心', '二心', '三心', '四心', '五心', '六心']);
    expect(parse('一、好長好長好長好長的詞')).toEqual([]);
    expect(parse('')).toEqual([]);
    expect(parse(undefined)).toEqual([]);   // String(undefined) 是 "undefined"（9 字），會被長度規則擋掉
});

// ==================== AI 整個失敗：候選夠就依常用度給滿，並附白話原因 ====================
test('AI 失敗仍填滿：候選 ≥ 24 時 AI 503 仍給 24 張並附原因', async ({ browser }) => {
    const ALL_BUSY_MSG = 'AI 暫時都忙不過來，請稍後再試（已嘗試 4 個模型）';
    const longMsg = ALL_BUSY_MSG + '。' + '目前上游額度都用完了，等一下就會恢復。'.repeat(5);
    expect(longMsg.length).toBeGreaterThan(80);
    const { context, page, errors } = await bootPage(browser, { aiFail: { status: 503, body: { ok: false, code: 'ALL_BUSY', message: longMsg, tried: [] } } });
    try {
        await page.fill('#searchInput', '安');
        await settle(page);
        await clickGenerate(page);
        await expect(page.locator('#aiWordsContainer .ai-word-card')).toHaveCount(24);
        const cards = await page.locator('#aiWordsContainer .ai-word-card').allTextContents();
        const ranks = await page.evaluate(ws => ws.map(w => wordPriorityMap.get(w) ?? 0), cards);
        for (let i = 1; i < ranks.length; i++) expect(ranks[i], `第 ${i + 1} 張 p 值不可大於前一張`).toBeLessThanOrEqual(ranks[i - 1]);
        const hint = page.locator('#aiWordsContainer .candidate-report', { hasText: 'AI 暫時無法排序，先依常用度列出' });
        await expect(hint).toHaveCount(1);
        const text = await hint.textContent();
        expect(text, '完整顯示 Worker 訊息，不截斷').toBe(`AI 暫時無法排序，先依常用度列出（${longMsg}）`);
        expect(text).toMatch(/[一-鿿]/);
        expect(text).not.toMatch(/error|failed|undefined|TypeError|\bnull\b/i);
        expect(await hint.locator('*').count(), '提示是 textContent，不是 HTML').toBe(0);
        expect(await page.evaluate(() => lastCandidatesTotal)).toBeGreaterThanOrEqual(24);
        expect(await page.locator('#generateBtn').isEnabled()).toBe(true);
        await expect(page.locator('#aiLoading')).toBeHidden();
        expect(errors.filter(e => !/status of 503/.test(e))).toEqual([]);
    } finally { await context.close(); }
});

// ==================== validateWordRhyme：與候選篩選同一套規則 ====================
// 各字位的 request 與 js/rhyme-display.js 建出的 currentRhymes 同形
const REQ = {
    心: { char: '心', zhuyin: 'ㄒㄧㄣ', initial: 'ㄒ', rhyme: 'ㄧㄣ', familyLabel: '' },
    安: { char: '安', zhuyin: 'ㄢ', initial: 'ㄢ', rhyme: 'ㄢ', familyLabel: '' },
    衣: { char: '衣', zhuyin: 'ㄧ', initial: 'ㄧ', rhyme: 'ㄧ', familyLabel: '' },
    愛: { char: '愛', zhuyin: 'ㄞ', initial: 'ㄞ', rhyme: 'ㄞ', familyLabel: '' },
    唐: { char: '唐', zhuyin: 'ㄊㄤ', initial: 'ㄊ', rhyme: 'ㄤ', familyLabel: '' },
    月: { char: '月', zhuyin: 'ㄩㄝ', initial: 'ㄩ', rhyme: 'ㄩㄝ', familyLabel: '' },
    行: { char: '行', zhuyin: 'ㄏㄤ', initial: 'ㄏ', rhyme: 'ㄤ', familyLabel: '' },
    ㄅ: { char: 'ㄅ', zhuyin: 'ㄅ', initial: 'ㄅ', rhyme: '', familyLabel: 'ㄅ' },
    萬用: { char: '*', isWild: true, zhuyin: '', initial: '', rhyme: '', familyLabel: '' },
    查無: { char: '丂', notFound: true, zhuyin: '', initial: '', rhyme: '', familyLabel: '' },
};

// 設定一組狀態（每組都先把篩選與模式重設），回傳 (詞) => boolean
function rhymeJudge(ev, reqs, { mode = 'rhyme', sameChar = false, sameTone = false, noExt = false, len = 0 } = {}) {
    ev(`currentRhymes = ${JSON.stringify(reqs)}; rhymeMode = '${mode}'; filterSameChar = ${sameChar}; filterSameTone = ${sameTone}; filterNoExtRhyme = ${noExt}; filterWordLen = ${len}`);
    return w => ev(`validateWordRhyme(${JSON.stringify(w)})`);
}
const verdicts = (judge, words) => Object.fromEntries(words.map(w => [w, judge(w)]));
const allOf = (words, v) => Object.fromEntries(words.map(w => [w, v]));

test('validateWordRhyme：心押字尾（開心、傷心對「心」通過，非韻腳與查無字不過）', () => {
    const { ev } = loadCore();
    const ok = ['開心', '傷心', '信心', '真心', '美音', '原因', '光陰', '列印', '人群'];
    const bad = ['朋友', '天空', '開門', '開丂', '心'];
    const judge = rhymeJudge(ev, [REQ.心]);
    expect(verdicts(judge, [...ok, ...bad])).toEqual({ ...allOf(ok, true), ...allOf(bad, false) });
});

test('validateWordRhyme：心押字首（首字韻部相同，沿用候選篩選；OD-2）', () => {
    const { ev } = loadCore();
    const ok = ['音樂', '心情', '星期'];
    const bad = ['小心', '鄉村'];
    const judge = rhymeJudge(ev, [REQ.心], { mode: 'initial' });
    expect(verdicts(judge, [...ok, ...bad])).toEqual({ ...allOf(ok, true), ...allOf(bad, false) });
});

test('validateWordRhyme：純聲母ㄅ押字尾看末字聲母、押字首看首字聲母', () => {
    const { ev } = loadCore();
    const tail = rhymeJudge(ev, [REQ.ㄅ]);
    expect(verdicts(tail, ['爸爸', '天邊', '寶貝', '不要'])).toEqual({ 爸爸: true, 天邊: true, 寶貝: true, 不要: false });
    const head = rhymeJudge(ev, [REQ.ㄅ], { mode: 'initial' });
    expect(verdicts(head, ['爸爸', '不要', '寶貝', '天邊'])).toEqual({ 爸爸: true, 不要: true, 寶貝: true, 天邊: false });
});

test('validateWordRhyme：篩選對照（同字／同聲調／排除借韻／字數）', () => {
    const { ev } = loadCore();
    expect(verdicts(rhymeJudge(ev, [REQ.心], { sameChar: true }), ['開心', '美音'])).toEqual({ 開心: true, 美音: false });
    expect(verdicts(rhymeJudge(ev, [REQ.心], { sameTone: true }), ['開心', '原因', '光陰', '列印', '手印']))
        .toEqual({ 開心: true, 原因: true, 光陰: true, 列印: false, 手印: false });
    expect(rhymeJudge(ev, [REQ.心])('人群'), '沒開排除借韻時人群通過').toBe(true);
    expect(rhymeJudge(ev, [REQ.心], { noExt: true })('人群'), '排除借韻後人群不過').toBe(false);
    expect(verdicts(rhymeJudge(ev, [REQ.心], { len: 3 }), ['開心', '好開心'])).toEqual({ 開心: false, 好開心: true });
});

test('validateWordRhyme：破音字任一讀音通過', () => {
    const { ev } = loadCore();
    const judge = rhymeJudge(ev, [REQ.唐]);
    expect(verdicts(judge, ['銀行', '排行', '朋友'])).toEqual({ 銀行: true, 排行: true, 朋友: false });
});

test('validateWordRhyme：多字（押母音／押子音）、萬用字、查無字', () => {
    const { ev } = loadCore();
    expect(verdicts(rhymeJudge(ev, [REQ.愛, REQ.心]), ['開心', '買新', '朋友', '開心果']))
        .toEqual({ 開心: true, 買新: true, 朋友: false, 開心果: false });
    expect(verdicts(rhymeJudge(ev, [REQ.心, REQ.衣], { mode: 'initial' }), ['相依', '喜宴', '新衣', '小雨', '朋友']))
        .toEqual({ 相依: true, 喜宴: true, 新衣: true, 小雨: false, 朋友: false });
    expect(verdicts(rhymeJudge(ev, [REQ.萬用, REQ.心]), ['開心', '朋友'])).toEqual({ 開心: true, 朋友: false });
    expect(verdicts(rhymeJudge(ev, [REQ.查無, REQ.心]), ['開心', '朋友'])).toEqual({ 開心: true, 朋友: false });
});

test('validateWordRhyme：沒有搜尋韻腳一律不過', () => {
    const { ev } = loadCore();
    expect(rhymeJudge(ev, [])('開心')).toBe(false);
});

test('鏡射：validateWordRhyme 與詞庫篩選同一套規則（真詞庫）', () => {
    test.setTimeout(30_000);
    const { ctx, ev } = loadCore();
    // 詞庫是 NDJSON（每行一個物件），十個 chunk 合起來交給 vm
    ctx.__wl = Array.from({ length: 10 }, (_, i) =>
        readFileSync(`data/wordlist-c0${i}.json`, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))).flat();
    ev('wordlistData = __wl; sentCandidatesSet = new Set(); savedWords = [];');

    // 與 rhyme-display.js 同樣：request 由字典第一個讀音建出（ㄅ 是純聲母字面值）
    const buildReq = c => JSON.parse(JSON.stringify(ev(`(() => {
        const c = ${JSON.stringify(c)};
        if (c === 'ㄅ') return { char: 'ㄅ', zhuyin: 'ㄅ', initial: 'ㄅ', rhyme: '', familyLabel: 'ㄅ' };
        const zy = chineseDict[c][0];
        return { char: c, zhuyin: zy, initial: _effInitial(zy), rhyme: getZhuyinRhyme(zy), familyLabel: '' };
    })()`)));
    const reset = (reqs, mode, noExt = false, f = {}) =>
        ev(`currentRhymes = ${JSON.stringify(reqs)}; rhymeMode = '${mode}'; filterSameChar = ${!!f.sameChar}; filterSameTone = ${!!f.sameTone}; filterNoExtRhyme = ${noExt}; filterWordLen = ${f.len ?? 0}`);

    const cases = [];
    for (const c of ['心', '安', '愛', '衣', '月', '行', 'ㄅ']) {
        cases.push([`${c} 押字尾 寬`, [c], 'rhyme', false, {}, () => ev(`filterWordsByRhymeSingle(${JSON.stringify(c)}, 1)`)]);
        cases.push([`${c} 押字尾 嚴`, [c], 'rhyme', true, {}, () => ev(`filterWordsByRhymeSingle(${JSON.stringify(c)}, 1)`)]);
        cases.push([`${c} 押字首`, [c], 'initial', false, {}, () => ev(`filterWordsByInitialSingle(${JSON.stringify(c)}, 1)`)]);
    }
    // 篩選旗標：同字、同聲調、字數
    for (const [label, f] of [['同字', { sameChar: true }], ['同聲調', { sameTone: true }], ['限 2 字', { len: 2 }], ['限 4 字+', { len: 4 }]]) {
        cases.push([`心 押字尾 ${label}`, ['心'], 'rhyme', false, f, () => ev('filterWordsByRhymeSingle("心", 1)')]);
        cases.push([`心 押字首 ${label}`, ['心'], 'initial', false, f, () => ev('filterWordsByInitialSingle("心", 1)')]);
    }
    cases.push(['愛心 押母音', ['愛', '心'], 'rhyme', false, {}, () => ev('filterWordsByRhyme(currentRhymes, 2, 1)')]);
    cases.push(['心衣 押子音', ['心', '衣'], 'initial', false, {}, () => ev('filterWordsByInitial(currentRhymes, 2, 1)')]);
    cases.push(['心衣 押母音', ['心', '衣'], 'rhyme', false, {}, () => ev('filterWordsByRhyme(currentRhymes, 2, 1)')]);

    // 詞庫裡真正會被篩選看的詞：音節數要等於字數（篩選第一關就丟掉不合的）
    const entries = ev('wordlistData').filter(e => e.w.length >= 2 && e.w.length <= 8 && e.z.split(' ').length === e.w.length);
    const rates = [];
    for (const [name, chars, mode, noExt, f, candidates] of cases) {
        reset(chars.map(buildReq), mode, noExt, f);
        const all = [...candidates()];
        const words = all.slice(0, 2000);
        expect(words.length, `${name} 候選太少，測不出東西`).toBeGreaterThanOrEqual(10);
        const pass = words.filter(w => ev(`validateWordRhyme(${JSON.stringify(w)})`)).length;
        // 反方向：validate 說可以、篩選卻沒給的詞。這個方向「不能」要求接近 100%：
        //   篩選吃詞庫給的實際讀音（同聲調只看字典第一讀音），validate 只拿到文字所以吃字典任一讀音，
        //   破音字（行、樂、愛的「ㄞ／ㄧ」類借韻）會讓 validate 較寬——這是設計（AI 造詞沒有讀音可看）。
        //   所以這裡只設一個粗界線（實測最高約 30%），抓整體規則壞掉，不當精準對照。
        const inFilter = new Set(all);
        const accepted = entries.filter(e => ev(`validateWordRhyme(${JSON.stringify(e.w)})`));
        const missed = accepted.filter(e => !inFilter.has(e.w));
        expect(pass / words.length, `${name} 正向通過率 ${pass}/${words.length}`).toBeGreaterThanOrEqual(0.99);
        expect(missed.length / accepted.length, `${name} 反向漏掉 ${missed.length}/${accepted.length}`).toBeLessThanOrEqual(0.4);
        rates.push(`${name}: 正向 ${pass}/${words.length}；反向 validate 通過 ${accepted.length}、篩選沒給 ${missed.length}（${accepted.length ? (100 * missed.length / accepted.length).toFixed(1) : 0}%）`);
    }
    console.log('鏡射通過率\n' + rates.join('\n'));
});

// ==================== generatedWordOk：造出的詞才准上畫面 ====================
test('generatedWordOk：只收字典內的字、押字尾規則與選字模式', () => {
    const { ctx, ev } = loadCore();
    rhymeJudge(ev, [REQ.心]);   // 只為了設好狀態
    const ok = w => ctx.generatedWordOk(w);
    expect(verdicts(ok, ['開心', '朋友', 'ab心', '<i>心', '開丂', '𠮷心', "開'心"]))
        .toEqual({ 開心: true, 朋友: false, ab心: false, '<i>心': false, 開丂: false, '𠮷心': false, "開'心": false });
    // 選字模式：固定字位（押字尾看末字、押字首看首字）∈ selectedChars，不再套韻腳規則
    ev('selectedChars.clear(); selectedChars.add("心")');
    expect(verdicts(ok, ['開心', '美音'])).toEqual({ 開心: true, 美音: false });
    ev('selectedChars.clear(); selectedChars.add("音"); rhymeMode = "initial"');
    expect(verdicts(ok, ['音樂', '樂音'])).toEqual({ 音樂: true, 樂音: false });
    ev('selectedChars.clear()');
    expect(ok('開心'), '清空選字後回到一般判定（押字首下開心不過）').toBe(false);
});

// ==================== 造詞一輪：一次按鈕只問一次，驗過才顯示 ====================
// 搜 心（stub 詞庫 12 個候選 < 24）→ 按生成 → 回傳 prompts / 卡片
async function genRound(browser, reply) {
    const { context, page, errors, warnings, offOrigin } = await bootPage(browser, { wordlist: 'stub' });
    const prompts = [];
    await page.route('**/ai', route => {
        prompts.push(route.request().postDataJSON().prompt);
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, text: reply, model: MODEL, tried: [] }) });
    });
    await page.fill('#searchInput', '心');
    await settle(page);
    await clickGenerate(page);
    await expect.poll(() => prompts.length).toBe(1);
    // 按鈕解鎖＋載入列收起＝這次按鈕做完了（finally 才解鎖，之後 DOM 不會再變）
    await expect(page.locator('#generateBtn')).toBeEnabled();
    await expect(page.locator('#aiLoading')).toBeHidden();
    await expect(page.locator('#aiWordsContainer')).not.toContainText('AI 生成補充詞');
    const box = page.locator('#aiWordsContainer');
    return {
        context, page, errors, warnings, offOrigin, prompts,
        aiCards: await box.locator('.ai-word-card:has(.ai-badge)').evaluateAll(els => els.map(e => e.firstChild.textContent)),
        total: await box.locator('.ai-word-card').count(),
        text: await box.textContent(),
    };
}

test('造詞一輪：候選不足只造一次、不合格丟掉、不足不追加', async ({ browser }) => {
    // A：混合回覆，只剩 3 個合格（朋友不押韻、一心已列出、<i>心 夾 HTML、開心重複）
    let r = await genRound(browser, '開心、傷心、真心、朋友、天空、一心、<i>心、開心');
    try {
        expect(r.prompts.length, '之後沒有第二次 /ai').toBe(1);
        expect(r.prompts[0]).toContain('直接生成');
        for (const t of ['末字押「心」的韻腳', '生成28個', '只用台灣日常會用的繁體中文詞語']) expect(r.prompts[0]).toContain(t);
        expect(r.aiCards).toEqual(['開心', '傷心', '真心']);
        expect(r.total).toBe(15);
        expect(await r.page.locator('#aiWordsContainer i').count(), '沒有被注入的元素').toBe(0);
        expect(r.text).not.toContain('<');
        expect(r.warnings.filter(w => w.startsWith('[好韻器] AI 造詞')).length).toBe(1);
        expect(r.errors).toEqual([]);
        expect(r.offOrigin).toEqual([]);
    } finally { await r.context.close(); }

    // B：14 個合格，只留前 12（24 − 12）
    const fourteen = ['開心', '傷心', '真心', '信心', '愛心', '關心', '放心', '小心', '用心', '耐心', '擔心', '決心', '細心', '安心'];
    r = await genRound(browser, fourteen.join('、'));
    try {
        expect(r.prompts.length).toBe(1);
        expect(r.aiCards).toEqual(fourteen.slice(0, 12));
        expect(r.total).toBe(24);
        expect(r.errors).toEqual([]);
    } finally { await r.context.close(); }

    // C：沒有合格詞 → 唉，沒有 AI 卡
    r = await genRound(browser, '朋友、天空、開門');
    try {
        expect(r.prompts.length).toBe(1);
        expect(r.aiCards).toEqual([]);
        expect(r.total).toBe(12);
        expect(r.text).toContain('唉...ai也想不到更多符合的詞彙，你自己想吧...');
        expect(r.errors).toEqual([]);
    } finally { await r.context.close(); }
});

// ==================== buildGenPrompt：提示與判定說同一件事 ====================
test('buildGenPrompt：押字首看韻部、純聲母、字數、同聲調、選字、多字', () => {
    const { ctx, ev } = loadCore();
    const reset = () => ev('selectedChars.clear()');
    const prompt = (reqs, opts, remaining = 12, exclude = []) => {
        reset();
        rhymeJudge(ev, reqs, opts);
        ctx.__ex = new Set(exclude);
        return ev(`buildGenPrompt(${remaining}, __ex)`);
    };
    const has = (p, ...ts) => ts.forEach(t => expect(p, t).toContain(t));
    const hasNot = (p, ...ts) => ts.forEach(t => expect(p, t).not.toContain(t));

    has(prompt([REQ.心]), '直接生成', '生成28個', '字數：2～4字', '末字押「心」的韻腳', '韻母：ㄧㄣ', '禁止重複以下詞語：（無）', '只用台灣日常會用的繁體中文詞語');
    has(prompt([REQ.心], {}, 24), '生成40個');
    has(prompt([REQ.心], { mode: 'initial' }), '首字押「心」的韻腳');
    hasNot(prompt([REQ.心], { mode: 'initial' }), '聲母為「ㄒ」');
    has(prompt([REQ.ㄅ]), '末字聲母為「ㄅ」');
    has(prompt([REQ.ㄅ], { mode: 'initial' }), '首字聲母為「ㄅ」');
    has(prompt([REQ.心], { len: 3 }), '字數：3字');
    has(prompt([REQ.心], { len: 4 }), '字數：4字以上');
    has(prompt([REQ.心], { sameTone: true }), '聲調與「心」相同');
    has(prompt([REQ.心], { noExt: true }), '韻母需完全相同');
    has(prompt([REQ.心], { sameChar: true }), '字尾必須剛好是「心」');
    // 選字模式
    reset();
    rhymeJudge(ev, [REQ.心]);
    ev('selectedChars.add("心"); selectedChars.add("音")');
    ctx.__ex = new Set();
    has(ev('buildGenPrompt(12, __ex)'), '字尾必須是這些字之一：心、音', '字數：2～4字');
    reset();
    // 多字
    has(prompt([REQ.愛, REQ.心]), '字數：2字', '第1字韻母：ㄞ', '第2字韻母：ㄧㄣ');
    has(prompt([REQ.萬用, REQ.心]), '第1字不限', '第2字韻母：ㄧㄣ');
    has(prompt([REQ.心, REQ.衣], { mode: 'initial' }), '第1字聲母：ㄒ', '第2字聲母：ㄧ');
    // 排除清單最多 40 個，取最新的（Set 尾端）
    const fifty = Array.from({ length: 50 }, (_, i) => `詞${i}`);
    const line = prompt([REQ.心], {}, 12, fifty).split('\n').find(l => l.startsWith('禁止重複'));
    expect(line.split('：')[1].split('、')).toEqual(fifty.slice(-40));
});

// ==================== 一條流程：夠就挑、不夠才造一次（D-03、D-05）====================
// 真詞庫裡前 n 個「兩字、末字心、兩個音節」的詞，做成 stub NDJSON
function xinWords(n) {
    const out = [];
    for (let i = 0; i < 10 && out.length < n; i++) {
        for (const line of readFileSync(`data/wordlist-c0${i}.json`, 'utf8').split('\n').filter(Boolean)) {
            const o = JSON.parse(line);
            if (o.w.length === 2 && o.w.endsWith('心') && o.z.split(' ').length === 2 && o.p >= 1) {
                out.push(line);
                if (out.length >= n) break;
            }
        }
    }
    expect(out.length, '真詞庫要有足夠的 X心 詞').toBe(n);
    return out.join('\n') + '\n';
}

// 用 stub 詞庫搜 心、按一次生成；回傳 prompts 與卡片
async function pressOnStub(browser, ndjson) {
    const { context, page, errors, offOrigin } = await bootPage(browser, { beforeGoto: ({ context }) => stubWordlist(context, ndjson) });
    const prompts = [];
    await page.route('**/ai', route => {
        prompts.push(route.request().postDataJSON().prompt);
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, text: '', model: MODEL, tried: [] }) });
    });
    await page.fill('#searchInput', '心');
    await settle(page);
    await clickGenerate(page);
    await expect.poll(() => prompts.length).toBe(1);
    await expect(page.locator('#generateBtn')).toBeEnabled();
    await expect(page.locator('#aiLoading')).toBeHidden();
    return { context, page, errors, offOrigin, prompts, cards: await page.locator('#aiWordsContainer .ai-word-card').count() };
}

test('邊界：候選剛好 24 不造詞、23 才造詞', async ({ browser }) => {
    let r = await pressOnStub(browser, xinWords(24));
    try {
        expect(r.cards).toBe(24);
        expect(r.prompts.length).toBe(1);
        expect(r.prompts[0]).not.toContain('直接生成');
        expect(/候選詞：([^\n]*)/.exec(r.prompts[0])[1].split('、').length).toBe(24);
        expect(r.errors).toEqual([]);
        expect(r.offOrigin).toEqual([]);
    } finally { await r.context.close(); }

    r = await pressOnStub(browser, xinWords(23));
    try {
        expect(r.cards, '23 個候選全列出，造詞回空').toBe(23);
        expect(r.prompts.length, '只造一次').toBe(1);
        expect(r.prompts[0]).toContain('直接生成');
        expect(r.errors).toEqual([]);
        expect(r.offOrigin).toEqual([]);
    } finally { await r.context.close(); }
});

test('連按：候選池再大，送給 AI 的清單也有上限', async ({ browser }) => {
    test.setTimeout(90_000);
    const { context, page, errors, offOrigin } = await bootPage(browser);
    try {
        const prompts = [];
        await page.route('**/ai', route => {
            prompts.push(route.request().postDataJSON().prompt);
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, text: '', model: MODEL, tried: [] }) });
        });
        const poolMax = await page.evaluate(() => AI_POOL_MAX);
        expect(poolMax).toBe(1000);
        await page.fill('#searchInput', '安');
        await settle(page);
        const seen = new Set();
        for (let i = 1; i <= 10; i++) {
            await clickGenerate(page);   // 同步鎖住按鈕，所以下面等到解鎖就是這一次做完
            await expect(page.locator('#generateBtn')).toBeEnabled({ timeout: 15_000 });
            await expect(page.locator('#aiWordsContainer .ai-word-card')).toHaveCount(24);
            expect(prompts.length, `第 ${i} 次只打一次 /ai`).toBe(i);
            for (const w of await page.locator('#aiWordsContainer .ai-word-card').allTextContents()) {
                expect(seen.has(w), `第 ${i} 次出現重複詞 ${w}`).toBe(false);
                seen.add(w);
            }
        }
        expect(seen.size).toBe(240);
        let longest = 0;
        for (const p of prompts) {
            expect(p).not.toContain('直接生成');
            expect(/候選詞：([^\n]*)/.exec(p)[1].split('、').length).toBeLessThanOrEqual(poolMax);
            expect(p.length).toBeLessThan(24000);
            longest = Math.max(longest, p.length);
        }
        console.log(`連按：最長 prompt ${longest} 字，候選池 ${await page.evaluate(() => cumulativeCandidates.length)} 個`);
        expect(errors).toEqual([]);
        expect(offOrigin).toEqual([]);
    } finally { await context.close(); }
});

test('用完與重置：池子用完顯示已推薦所有…，重置後又能拿到', async ({ browser }) => {
    const { context, page, errors, offOrigin } = await bootPage(browser, { wordlist: 'stub' });
    try {
        let aiCalls = 0;
        await page.route('**/ai', route => {
            aiCalls++;
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, text: '美音、原因、光陰', model: MODEL, tried: [] }) });
        });
        const cards = page.locator('#aiWordsContainer .ai-word-card');
        const press = async () => {
            await clickGenerate(page);
            await expect(page.locator('#generateBtn')).toBeEnabled();
            await expect(page.locator('#aiLoading')).toBeHidden();
        };
        await page.fill('#searchInput', '心');
        await settle(page);
        await press();
        await expect(cards).toHaveCount(15);   // 12 候選 + 3 AI
        await press();
        await expect(page.locator('#aiWordsContainer .ai-exhausted')).toContainText('已推薦所有符合的詞彙');
        await expect(page.locator('.reset-pool-btn')).toBeVisible();
        await expect(cards).toHaveCount(0);
        await page.evaluate(() => document.querySelector('.reset-pool-btn').click());
        await press();
        await expect(cards).toHaveCount(15);
        expect(aiCalls, '三次按鈕各一次 /ai').toBe(3);
        expect(errors).toEqual([]);
        expect(offOrigin).toEqual([]);
    } finally { await context.close(); }
});

// ==================== 等 AI 回覆期間（最久 35 秒）換了搜尋／篩選／重置，舊回覆作廢（CR-01）====================
// 攔住 /ai，等「動作」做完才放行；放行後面板要是空的、池子要是空的
// 挑詞路徑：舊回覆一到，面板必須是空的；造詞路徑：面板可留著舊候選卡，但不可出現 AI 卡、造詞狀態列，池子要是空的
async function staleCase(browser, { wordlist, first, replyOf, actions, emptyPanel }) {
    const { context, page, errors, offOrigin } = await bootPage(browser, { wordlist });
    try {
        let gate = null;
        await page.route('**/ai', async route => {
            const g = gate;
            g.hit();
            await g.held;
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, text: replyOf(route.request().postDataJSON().prompt), model: MODEL, tried: [] }) });
        });
        for (const [name, act] of Object.entries(actions)) {
            await page.fill('#searchInput', first);
            await settle(page);
            await page.evaluate(() => resetSuggestedPool());
            let hit, release;
            const hitP = new Promise(r => { hit = r; });
            gate = { hit, held: new Promise(r => { release = r; }) };
            await clickGenerate(page);
            await hitP;                                          // /ai 已送出、卡在等回覆
            await act(page);
            release();
            await expect(page.locator('#generateBtn'), name).toBeEnabled();
            await expect(page.locator('#aiLoading'), name).toBeHidden();
            const st = await page.evaluate(emptyPanelWanted => {
                const box = document.getElementById('aiWordsContainer');
                return {
                    children: emptyPanelWanted ? box.children.length : 0,
                    aiBadges: box.querySelectorAll('.ai-badge').length,
                    status: box.textContent.includes('AI 生成補充詞'),
                    pool: suggestedPool.size, sent: sentCandidatesSet.size,
                };
            }, !!emptyPanel);
            expect(st, `${name}：舊回覆不可寫進畫面或池子`).toEqual({ children: 0, aiBadges: 0, status: false, pool: 0, sent: 0 });
        }
        expect(errors).toEqual([]);
        expect(offOrigin).toEqual([]);
    } finally { await context.close(); }
}
const changeSearch = async page => {
    await page.fill('#searchInput', '心');
    await settle(page);
};
const staleActions = {
    換搜尋: changeSearch,
    切篩選: page => page.evaluate(() => toggleFilter('sameTone')),
    換字數: page => page.evaluate(() => cycleFilterWordLen()),
    重置: page => page.evaluate(() => resetSuggestedPool()),
};

test('舊回覆作廢：挑詞（候選 ≥ 24）等 AI 期間換搜尋／篩選／字數／重置', async ({ browser }) => {
    test.setTimeout(90_000);
    await staleCase(browser, {
        wordlist: 'real', first: '安',
        replyOf: p => /候選詞：([^\n]*)/.exec(p)[1].split('、').slice(0, 3).join('、'),
        actions: staleActions, emptyPanel: true,
    });
});

test('舊回覆作廢：造詞（候選 < 24）等 AI 期間換搜尋／篩選／字數／重置', async ({ browser }) => {
    test.setTimeout(90_000);
    // 回覆給的詞對「心」都合格，若沒作廢就會被塞進畫面與池子；造詞路徑的「換搜尋」要換成別的字
    await staleCase(browser, {
        wordlist: 'stub', first: '心',
        replyOf: () => '開心、傷心、真心',
        actions: { ...staleActions, 換搜尋: async page => { await page.fill('#searchInput', '安'); await settle(page); } },
    });
});

// ==================== 字卡樣板跳脫（WR-01）====================
test('字卡：詞含 " < > \' \\ 也不會跳出屬性或字串，點下去保留的就是原詞', async ({ browser }) => {
    const { context, page, errors, offOrigin } = await bootPage(browser, { wordlist: 'stub' });
    try {
        const words = ['a"b', "a'b", 'a<i>b', 'a>b', 'a\\b', 'a\\\'b', '"><img src=x onerror=window.__pwn=1>', "');window.__pwn=1;('", 'a&amp;b', '</div><b>x</b>'];
        const res = await page.evaluate(ws => {
            const box = document.getElementById('aiWordsContainer');
            box.innerHTML = ws.map((w, i) => aiWordCardHtml(w, i % 2 === 0)).join('');
            savedWords = [];
            const cards = [...box.children];
            cards.forEach(c => c.click());
            return {
                n: cards.length,
                datasets: cards.map(c => c.dataset.word),
                texts: cards.map(c => c.firstChild.textContent),
                saved: [...savedWords].reverse(),
                extra: box.querySelectorAll('img, b, i').length,
                pwn: window.__pwn ?? null,
            };
        }, words);
        expect(res.n, '每個詞一張卡、沒被拆開').toBe(words.length);
        expect(res.datasets).toEqual(words);
        expect(res.texts).toEqual(words);
        expect(res.saved, '點卡片保留的就是原詞').toEqual(words);
        expect(res.extra, '沒有被注入的元素').toBe(0);
        expect(res.pwn).toBeNull();
        expect(errors).toEqual([]);
        expect(offOrigin).toEqual([]);
    } finally { await context.close(); }
});

// ==================== 預期外的例外：白話提示、留記錄、按鈕解鎖（IN-03）====================
test('AI 建議流程中途丟例外：顯示白話提示、留記錄、按鈕解鎖、沒有未處理的錯誤', async ({ browser }) => {
    const { context, page, errors, warnings, offOrigin } = await bootPage(browser);
    try {
        await page.route('**/ai', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, text: '', model: MODEL, tried: [] }) }));
        await page.fill('#searchInput', '安');
        await settle(page);
        await page.evaluate(() => { fillToTarget = () => { throw new TypeError('注入的例外'); }; });
        await clickGenerate(page);
        await expect(page.locator('#copyToast')).toContainText('建議詞產生失敗');
        await expect(page.locator('#generateBtn')).toBeEnabled();
        await expect(page.locator('#aiLoading')).toBeHidden();
        expect(warnings.some(w => w.startsWith('[好韻器] AI 建議失敗'))).toBe(true);
        expect(errors, '例外被接住，不可變成 pageerror').toEqual([]);
        expect(offOrigin).toEqual([]);
    } finally { await context.close(); }
});
