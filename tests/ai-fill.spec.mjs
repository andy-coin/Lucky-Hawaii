// Phase 4 AI 挑詞填滿與造詞驗證：AI 只負責排序，數量由程式保證
import { test, expect } from '@playwright/test';
import { bootPage, settle } from './helpers.mjs';
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
