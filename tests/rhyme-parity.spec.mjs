// 查韻與韻腳地圖共用同一個判定（MAP-01）：同一組字，三邊的答案要一樣
// 三邊 = validateWordRhyme（AI 詞驗證）、filterWordsByRhymeSingle（詞庫篩選）、lhRhymeAnalyze（韻腳地圖字母）
// 這支測試描述「既有行為」：重構前後都要過，不是在測新的函式
import { test, expect } from '@playwright/test';
import { bootPage } from './helpers.mjs';

// 在頁面裡挑 70 個查詢字（50 單音 + 20 破音）與 70 個候選字，依韻部輪流取，結果固定可重現
const PICK_CHARS = () => {
    // 單音、常用、有家族、不是語助詞的字，依家族輪流取
    const byFamily = new Map();
    const poly = new Map();
    for (const ch of Object.keys(charInfo)) {
        if (!/^[一-鿿]$/.test(ch) || LH_RHYME_PARTICLES.has(ch)) continue;
        const rs = getCharAllReadings(ch);
        if (!rs.length || rs[0].tier !== 'common') continue;
        const fam = RHYME_TO_FAMILY[getZhuyinRhyme(rs[0].reading)];
        if (fam === undefined) continue;
        const target = rs.length === 1 ? byFamily : (isPolyphonic(ch) ? poly : null);
        if (!target) continue;
        if (!target.has(fam)) target.set(fam, []);
        target.get(fam).push(ch);
    }
    const roundRobin = m => {
        const lists = [...m.keys()].sort((a, b) => a - b).map(k => m.get(k).sort());
        const out = [];
        for (let r = 0; lists.some(l => r < l.length); r++) for (const l of lists) if (r < l.length) out.push(l[r]);
        return out;
    };
    const single = roundRobin(byFamily);
    return { candidates: single.slice(0, 70), singles: single.slice(70, 120), polys: roundRobin(poly).slice(0, 20) };
};

test('共用：九千八百組字對三邊一致', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub' });
    const res = await page.evaluate(pickSrc => {
        const { candidates, singles, polys } = eval('(' + pickSrc + ')')();
        const queries = [...singles, ...polys];
        const firstReading = c => getCharAllReadings(c)[0].reading;
        const saved = { wordlistData, sentCandidatesSet, savedWords, filterSameChar, filterSameTone, filterWordLen, filterNoExtRhyme, rhymeMode, _polyphonic, currentRhymes };
        const mismatches = [];
        let pairs = 0, hits = 0, badQuery = [];
        try {
            rhymeMode = 'rhyme'; filterSameChar = false; filterSameTone = false; filterWordLen = 0;
            for (const q of queries) {
                _polyphonic = { char: null, reading: null };
                updateAIRhymeDisplay(q);
                if (currentRhymes.length !== 1 || currentRhymes[0].rhyme !== getZhuyinRhyme(firstReading(q))) { badQuery.push(q); continue; }
                for (const strict of [false, true]) {
                    filterNoExtRhyme = strict;
                    // 每個候選字一筆詞庫詞「一＋字」，讀音取字典第一讀音
                    wordlistData = candidates.map(c => ({ w: '一' + c, z: 'ㄧ ' + firstReading(c), p: 1 }));
                    sentCandidatesSet = new Set();
                    savedWords = [];
                    const inFilter = new Set(filterWordsByRhymeSingle(q));
                    for (const c of candidates) {
                        pairs++;
                        const a = validateWordRhyme('一' + c);
                        const b = inFilter.has('一' + c);
                        if (a) hits++;
                        const m = lhRhymeAnalyze(q + '\n' + c, { strict, skipParticles: false }, null).letters === 'AA';
                        if (a !== b || b !== m) mismatches.push({ q, c, strict, a, b, m });
                    }
                }
            }
        } finally {
            ({ wordlistData, sentCandidatesSet, savedWords, filterSameChar, filterSameTone, filterWordLen, filterNoExtRhyme, rhymeMode, _polyphonic, currentRhymes } = saved);
        }
        return { pairs, hits, mismatches: mismatches.slice(0, 10), badQuery, nQ: queries.length, nC: candidates.length, nPoly: polys.length };
    }, PICK_CHARS.toString());
    expect(res.badQuery, '查詢字的韻腳要等於它第一讀音的韻腳').toEqual([]);
    expect(res.mismatches).toEqual([]);
    expect([res.nQ, res.nC, res.nPoly]).toEqual([70, 70, 20]);
    expect(res.pairs).toBe(9800);
    expect(res.hits, '同韻與不同韻都要有，測試才有鑑別力').toBeGreaterThan(300);
    expect(res.hits).toBeLessThan(res.pairs - 300);
    expect(errors).toEqual([]);
    await context.close();
});
