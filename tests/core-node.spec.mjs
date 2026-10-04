// 核心純邏輯在 Node 直接載入測試（不開瀏覽器）：用 node:vm 載入拆出的 js/ 檔，搬出的程式碼一字不改
// 後續搬移計畫依原本順序把核心檔補進 CORE
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bootPage } from './helpers.mjs';
import { pick, loadCore } from './node-core.mjs';

test('core：純 Node 載入音韻表', () => {
    const { ev } = loadCore();
    const get = pick(ev);
    expect(get('zhuyinInitials.length')).toBe(21);
    expect(get("BORROW_MAP['ㄚ']")).toEqual(['ㄚ', 'ㄧㄚ', 'ㄨㄚ']);
    expect(get("fullZhuyinToPinyin['ㄅㄢ']")).toBe('ban');
    expect(get("fullPinyinToZhuyin['ban']")).toEqual(['ㄅㄢ']);
    expect(get("RHYME_TO_FAMILY['ㄧㄚ']")).toEqual(get("RHYME_TO_FAMILY['ㄚ']"));
});

test('core：純 Node 注音／拼音工具', () => {
    const get = pick(loadCore().ev);
    expect(get("getZhuyinRhyme('ㄅㄢ')")).toBe('ㄢ');
    expect(get("getZhuyinRhyme('ㄏㄠˇ')")).toBe('ㄠ');
    expect(get("getZhuyinInitial('ㄅㄢ')")).toBe('ㄅ');
    expect(get("getZhuyinTone('ㄏㄠˇ')")).toBe(3);
    expect(get("stripTone('ㄏㄠˇ')")).toBe('ㄏㄠ');
    expect(get("pinyinToZhuyin('ban')")).toBe('ㄅㄢ');
    expect(get("zhuyinToPinyin('ㄅㄢ')")).toBe('ban');
    expect(get("getCharMark('愛')")).toBe('common');
    expect(get("charInfo['愛']")).toEqual([{ zhuyin: 'ㄞ', tone: 4, tier: 'common' }]);
});

test('core：純 Node 查韻', () => {
    const get = pick(loadCore().ev);
    const rows = get("searchRhyme('ㄢ')");
    expect(rows.length).toBeGreaterThan(300);
    rows.forEach(r => expect(Object.keys(r).sort()).toEqual(['char', 'pinyin', 'rhymeIndex', 'tier', 'tone', 'zhuyin', 'zhuyinInitial', 'zhuyinRhyme']));
    // 規則推導而非寫死筆數，之後字庫修正不會誤報
    const family = get("BORROW_MAP['ㄢ']");
    expect([...new Set(rows.map(r => r.zhuyinRhyme))].sort()).toEqual([...family].sort());
    expect(get("searchRhyme('an')")).toEqual(rows);
    get("searchRhyme('愛')");
    expect(get('searchedTerms[0].original')).toBe('愛→ㄞ');
    for (const bad of ["'zzz'", "''"]) {
        expect(get(`searchRhyme(${bad})`)).toEqual([]);
        expect(get('searchedTerms')).toEqual([]);
    }
});

const INPUTS = ['ㄢ', 'ㄅ', 'an', 'uo', 'bi', '愛', '行', '安打', 'an ing', '* ㄢ', 'zzz', ''];
test('core：Node 與瀏覽器的 searchRhyme 結果一致', async ({ browser }) => {
    const { ev } = loadCore();
    // 瀏覽器會再套用後台匯出的 overrides；固定回空內容，測試才不會被 admin 之後提交的資料影響（Node 側不套 overrides）
    const served = [];
    const { context, page } = await bootPage(browser, {
        beforeGoto: async ({ context }) => {
            const stub = (re, body) => context.route(re, route => {
                served.push(route.request().url());
                return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
            });
            await stub(/\/data\/rhyme-dict-overrides\.json$/, { version: 2, removed: [], hidden: [], fixed: [], added: [] });
            await stub(/\/data\/wordlist-overrides\.json$/, { version: 2, removed: [], hidden: [], fixed: {}, added: [] });
        },
    });
    try {
        expect(served.some(u => u.includes('rhyme-dict-overrides')), '字庫 overrides 請求應走固定空內容').toBe(true);
        for (const input of INPUTS) {
            const node = ev(`(() => { const r = searchRhyme(${JSON.stringify(input)}); return JSON.stringify({ r, t: searchedTerms }); })()`);
            const web = await page.evaluate(i => { const r = searchRhyme(i); return JSON.stringify({ r, t: searchedTerms }); }, input);
            expect(node, input).toBe(web);
        }
    } finally { await context.close(); }
});

test('core：純 Node 詞庫篩選', () => {
    const { ev } = loadCore();
    const get = pick(ev);
    // stub 詞庫：每行一個 JSON 物件，直接塞進 vm 裡的 wordlistData
    ev('wordlistData = ' + JSON.stringify(readFileSync('tests/fixtures/wordlist-stub.ndjson', 'utf8').trim().split('\n').map(l => JSON.parse(l))));
    const words = get("wordlistData.map(e => e.w)").sort();
    expect(words.length).toBe(12);
    const sortedHits = code => get(code).sort();
    expect(sortedHits("filterWordsByRhyme([{rhyme:'ㄧㄣ'}], 2, 1)")).toEqual(words);
    expect(get("filterWordsByRhyme([{rhyme:'ㄚ'}], 2, 1)")).toEqual([]);
    expect(get("filterWordsByRhyme([{rhyme:'ㄧㄣ'}], 3, 1)")).toEqual([]);
    // 已存詞彙要被排除
    ev("savedWords = ['一心']");
    const hits = sortedHits("filterWordsByRhyme([{rhyme:'ㄧㄣ'}], 2, 1)");
    ev('savedWords = []');
    expect(hits.length).toBe(11);
    expect(hits).not.toContain('一心');
    // 字數篩選：0 不限、2 剛好兩字、4 代表四字以上
    const pass = (f, n) => get(`(filterWordLen = ${f}, _wordLenPass(${n}))`);
    for (const n of [1, 2, 3, 4, 5]) expect(pass(0, n)).toBe(true);
    expect([1, 2, 3, 4].map(n => pass(2, n))).toEqual([false, true, false, false]);
    expect([2, 3, 4, 5, 6].map(n => pass(4, n))).toEqual([false, false, true, true, true]);
});
