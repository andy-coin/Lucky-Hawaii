// Golden 測試：把「畫面上實際呈現的查韻結果」與 v0.96 快照比對
// 一般 npm test 只比對；只有 npm run golden:update（UPDATE_GOLDEN=1）才會寫檔
import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { bootPage, settle } from './helpers.mjs';

const GOLDEN_DIR = new URL('./golden/', import.meta.url);
const UPDATE = process.env.UPDATE_GOLDEN === '1';

// 每個案例一個 id，快照檔名就是 id.json（相同結果的輸入也各自一檔，不去重）
const CASES = [
    // 注音 韻母
    { id: 'zy-rhyme-an', input: 'ㄢ', nonEmpty: true },
    { id: 'zy-rhyme-ing', input: 'ㄧㄥ', nonEmpty: true },
    { id: 'zy-rhyme-uo', input: 'ㄨㄛ', nonEmpty: true },
    // 注音 聲母
    { id: 'zy-init-b', input: 'ㄅ', nonEmpty: true },
    { id: 'zy-init-zh', input: 'ㄓ', nonEmpty: true },
    // 注音 音節
    { id: 'zy-syl-ba', input: 'ㄅㄚ', nonEmpty: true },
    // 注音 聲調符號（編碼邊界：v0.96 畫什麼就鎖什麼）
    { id: 'zy-tone2-lai', input: 'ㄌㄞˊ', expectEmpty: true },
    { id: 'zy-tone3-hao', input: 'ㄏㄠˇ' },
    { id: 'zy-tone4-ai', input: 'ㄞˋ' },
    { id: 'zy-tone5-ma', input: 'ㄇㄚ˙' },
    // 拼音
    { id: 'py-an', input: 'an', nonEmpty: true },
    { id: 'py-ing', input: 'ing', nonEmpty: true },
    { id: 'py-uo', input: 'uo', nonEmpty: true },
    { id: 'py-init-b', input: 'b', nonEmpty: true },
    { id: 'py-bi', input: 'bi', nonEmpty: true },
    { id: 'py-zh', input: 'zh', nonEmpty: true },
    { id: 'py-ai2', input: 'ai2', expectEmpty: true },
    // 漢字（含破音字）
    { id: 'han-ai', input: '愛', nonEmpty: true },
    { id: 'han-an', input: '安', nonEmpty: true },
    { id: 'han-poly-xing', input: '行', nonEmpty: true },
    { id: 'han-poly-chang', input: '長', nonEmpty: true },
    { id: 'han-poly-le', input: '樂', nonEmpty: true },
    { id: 'han-poly-liao', input: '了', nonEmpty: true },
    { id: 'han-yu', input: '鬱', nonEmpty: true },
    { id: 'han-o', input: '喔', nonEmpty: true },
    // 詞
    // 0.97.03 起「安打」（沒有空白）改查整個詞的韻（詞卡，tests/word-space.spec.mjs）；「安 打」才是兩個字各自的單字韻
    { id: 'word-anda', input: '安 打', nonEmpty: true },
    { id: 'word-aiqing', input: '愛 情', nonEmpty: true },
    // 多詞
    { id: 'multi-py', input: 'an ing' },
    { id: 'multi-zy', input: 'ㄢ ㄧㄥ' },
    { id: 'multi-mixed', input: '愛 an' },
    { id: 'multi-zy-init', input: 'ㄅ ㄢ' },
    { id: 'multi-wild', input: '* ㄢ' },
    // 亂碼
    { id: 'garbage-zzz', input: 'zzz', expectEmpty: true },
    // 空輸入邊界
    { id: 'empty', input: '', expectEmpty: true },
    { id: 'whitespace', input: '   ', expectEmpty: true },
    // 選項變化
    { id: 'opt-le-showrare', input: '樂', options: { hideRare: false }, nonEmpty: true },
    { id: 'opt-le-dedupe', input: '樂', options: { filterDuplicate: true }, nonEmpty: true },
    { id: 'opt-ai-nopinyin', input: '愛', options: { showPinyin: false }, nonEmpty: true },
    // 輸入模式
    { id: 'im-zhuyin-an', input: 'an', inputMode: 'zhuyin' },
    { id: 'im-pinyin-zy-an', input: 'ㄢ', inputMode: 'pinyin' },
    // 破音字 chip
    { id: 'chip-le-2', input: '樂', chipIndex: 1, nonEmpty: true },
];

// 在頁面內擷取畫面（只回傳純資料，hash 由 Node 端算）
function captureInPage() {
    const root = document.getElementById('resultsContainer');
    const rowOf = c => `${c.dataset.char}|${c.dataset.key}|${(c.querySelector('.mark-badge')?.textContent ?? '').trim()}`;
    const groups = [...root.querySelectorAll('.group-section')].map(g => ({
        title: g.querySelector('.group-title')?.innerHTML ?? '',
        rows: [...g.querySelectorAll('.char-card')].map(rowOf).join(' '),
    }));
    const header = (root.querySelector('.results-count')?.textContent
        ?? root.querySelector('h3')?.textContent ?? '').trim();
    return {
        header,
        rhymeDisplay: document.getElementById('aiRhymeDisplay')?.textContent ?? '',
        chips: [...document.querySelectorAll('#polyphonicChips .poly-chip')]
            .map(c => c.dataset.reading + (c.classList.contains('active') ? '*' : '')),
        groups,
        flat: groups.length ? null : [...root.querySelectorAll('.char-card')].map(rowOf).join(' '),
        cardCount: root.querySelectorAll('.char-card').length,
        html: root.innerHTML,
    };
}

async function capture(page) {
    const { html, ...rest } = await page.evaluate(captureInPage);
    const htmlSha1 = createHash('sha1').update(html.replace(/\s+/g, ' ').trim()).digest('hex');
    return { ...rest, htmlSha1 };
}

for (const c of CASES) {
    test(c.id, async ({ browser }) => {
        const storage = c.inputMode ? { haoYunQi_inputMode: c.inputMode } : {};
        const { context, page, errors, offOrigin } = await bootPage(browser, { storage });
        try {
            // 先套用選項再輸入（直接設 checked 並送出 change，不依賴版面）
            if (c.options) await page.evaluate(opts => {
                for (const [k, v] of Object.entries(opts)) {
                    const el = document.getElementById(k);
                    el.checked = v;
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }, c.options);
            await page.fill('#searchInput', c.input);
            await settle(page);
            if (c.chipIndex !== undefined) {
                await page.locator('#polyphonicChips .poly-chip').nth(c.chipIndex).click();
                await settle(page);
            }
            // 讀回實際的選項狀態，讓每個檔案自我說明
            const options = await page.evaluate(() => ({
                showPinyin: document.getElementById('showPinyin').checked,
                hideRare: document.getElementById('hideRare').checked,
                filterDuplicate: document.getElementById('filterDuplicate').checked,
            }));
            // 固定順序 common → initial → tone；每個案例都用全新頁面，
            // 因為字卡顏色 class 依賴全域狀態（lastTarget／colorClass），跨輸入共用頁面會互相影響
            const modes = { common: await capture(page) };
            for (const m of ['initial', 'tone']) {
                await page.evaluate(m => document.querySelector(`.mode-button[data-mode="${m}"]`).click(), m);   // 空白輸入時選項列是收起的
                await settle(page);
                modes[m] = await capture(page);
            }
            const actual = { id: c.id, input: c.input, inputMode: c.inputMode ?? 'auto', options, chipIndex: c.chipIndex ?? null, modes };
            const file = new URL(c.id + '.json', GOLDEN_DIR);
            // 空結果案例：兩種模式都必須 0 張字卡且無錯誤（空輸入邊界）
            if (c.expectEmpty) {
                expect(errors, '空結果案例不應有錯誤').toEqual([]);
                for (const m of Object.keys(modes)) expect(modes[m].cardCount, `${c.id} ${m} 應為 0 張`).toBe(0);
            }
            if (UPDATE) {
                // 絕不拍壞掉的頁面
                expect(errors, '擷取時頁面出現錯誤').toEqual([]);
                if (c.nonEmpty) for (const m of Object.keys(modes)) {
                    expect(modes[m].cardCount, `${c.id} ${m} 應有字卡`).toBeGreaterThan(0);
                }
                writeFileSync(file, JSON.stringify(actual, null, 2) + '\n');
            } else {
                expect(existsSync(file), 'golden 檔不存在，請先執行 npm run golden:update').toBe(true);
                expect(actual).toEqual(JSON.parse(readFileSync(file, 'utf8')));
            }
            expect(errors).toEqual([]);
            expect(offOrigin).toEqual([]);
        } finally {
            await context.close();
        }
    });
}

// 檔案清單必須與案例一致：不准有孤兒檔、缺檔，也不准因相同結果而被合併
test('golden 檔案清單與案例一致', () => {
    // 更新模式下各案例平行寫檔，這時檢查會與寫檔競爭；更新完再跑 npm test 就會檢查
    test.skip(UPDATE, '更新模式不檢查檔案清單');
    const files = readdirSync(GOLDEN_DIR).filter(f => f.endsWith('.json')).sort();
    expect(files).toEqual(CASES.map(c => c.id + '.json').sort());
});
