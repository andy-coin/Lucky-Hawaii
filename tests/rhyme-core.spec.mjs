// 韻腳地圖的純函式（js/rhyme-core.js）：不開瀏覽器，用 node:vm 載入真字典與真破音字順序
// 固定歌詞範例全部來自 10-VALIDATION.md 的「固定歌詞範例」表（用真字典跑出來的）；期望值不可為了讓程式通過而改
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { loadCore } from './node-core.mjs';

const { ctx, ev: run } = loadCore();
ctx.performance = performance;   // vm 內預設沒有 performance
const ev = code => { const v = run(code); return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); };
const j = v => JSON.stringify(v);
// loadCore 不載 polyphonic-order，手動補上，才和頁面上的讀音順序一樣
run('polyphonicsOrderMap = new Map(Object.entries(' + readFileSync('data/polyphonic-order.json', 'utf8') + '))');

const reset = () => run('wordPhoneticMap = new Map()');   // 每個讀音測試前清掉詞庫（詞庫欄位是 stub）
const letters = (text, { strict = false, skip = true, readings = null } = {}) =>
    ev(`lhRhymeAnalyze(${j(text)}, { strict: ${strict}, skipParticles: ${skip} }, ${j(readings)}).letters`);
const target = (line, skip = true) => ev(`lhRhymeTarget(${j(line)}, ${skip})`);

const F = {
    AABB: '我望著遠方的光\n獨自站在窗\n走過熟悉的街道\n終於我也回到',
    ABAB: '我望著遠方的光\n走過熟悉的街道\n你笑著說天亮\n不怕前方的路遙',
    FAM1: '夜空裡閃著星光\n我在這裡等天亮\n風吹過熟悉的街道\n回頭看你還在笑',
    FAM2: '我的心\n你的星\n走過去\n走回來',
    PART: '愛你到天亮啊！\n\n（Oh baby）\n想你想到心慌了…\n好想好想你，嗎',
    POLY: '我們快樂\n聽著音樂\n我不快樂',
    KONG: '這是一首詩\n我只想要你知\n日子一天天\n寫給自己的字\n慢慢地想思',
};

test('判定：寬韻看家族、嚴格看韻母全等', () => {
    reset();
    expect(ev("lhRhymeMatch('ㄤ', 'ㄧㄤ', false)")).toBe(true);
    expect(ev("lhRhymeMatch('ㄤ', 'ㄧㄤ', true)")).toBe(false);
    expect(ev("lhRhymeMatch('ㄤ', 'ㄤ', true)")).toBe(true);
    expect(ev("lhRhymeMatch('ㄤ', 'ㄠ', false)")).toBe(false);
    // 空韻（ㄓㄔㄕㄖㄗㄘㄙ）不在任何家族：寬韻彼此算同（沿用既有詞庫篩選），嚴格各自不同
    expect(ev("lhRhymeMatch('ㄓ', 'ㄕ', false)")).toBe(true);
    expect(ev("lhRhymeMatch('ㄓ', 'ㄕ', true)")).toBe(false);
    expect(ev("lhRhymeFamilyId('ㄓ')")).toBeUndefined();
    expect(ev("lhRhymeFamilyId('ㄤ')")).toBe(14);
});

test('判定：分組鍵與顏色編號', () => {
    expect(ev("lhRhymeKey('ㄓ', false)")).toBe('x');
    expect(ev("lhRhymeKey('ㄧㄤ', false)")).toBe('f14');
    expect(ev("lhRhymeKey('ㄧㄤ', true)")).toBe('ㄧㄤ');
    expect(ev("lhRhymeColor('ㄨㄤ')")).toBe(14);
    expect(ev("lhRhymeColor('ㄓ')")).toBe(16);
    expect(ev('LH_RHYME_NONE')).toBe(16);
});

test('判定：預設值與色票', () => {
    expect(ev('LH_RHYME_DEFAULTS')).toEqual({ end: true, letters: false, inner: false, strict: false, skipParticles: true });
    expect(ev('Object.isFrozen(LH_RHYME_DEFAULTS)')).toBe(true);
    expect(ev('LH_RHYME_MIX')).toEqual({ end: 34, orphan: 17, inner: 30 });
    for (const set of ['light', 'dark']) {
        const colors = ev(`LH_RHYME_COLORS.${set}`);
        expect(colors, set + ' 共 17 色').toHaveLength(17);
        for (const c of colors) expect(c, set + ' 色碼').toMatch(/^#[0-9a-f]{6}$/);
        expect(new Set(colors).size, set + ' 不重複').toBe(17);
    }
    expect(ev('Array.from(LH_RHYME_PARTICLES).join("")')).toBe('啊呀哪呢喔哦噢吧啦嘛耶欸囉唷了的嗎');
    expect(ev('LH_RHYME_ALPHA.length')).toBe(52);
});

test('句尾：標點、空白、emoji 先去掉', () => {
    expect(target('我愛你😀')).toMatchObject({ char: '你', i: 2 });
    expect(target('我愛你。」 ')).toMatchObject({ char: '你' });
    expect(target('我愛你！！！')).toMatchObject({ char: '你' });
    expect(target('我愛你 ')).toMatchObject({ char: '你' });
});

test('句尾：語助詞跳過（連續幾個也跳），整行都是語助詞用最後一個字', () => {
    expect(target('你好啊呀')).toMatchObject({ char: '好' });
    expect(target('你好啊呀', false)).toMatchObject({ char: '呀' });
    expect(target('好想好想你，嗎')).toMatchObject({ char: '你' });
    expect(target('啊呀')).toMatchObject({ char: '呀' });   // 修正：RESEARCH 原型回傳第一個字
    expect(target('啊')).toMatchObject({ char: '啊' });
    expect(target('啊！呀！')).toMatchObject({ char: '呀' });
});

test('句尾：查不到的字沒有目標（英文、數字、符號、空字串）', () => {
    expect(target('oh啊')).toBeNull();   // 語助詞前面是英文：不往前跳到中文，也不上色
    expect(target('（Oh baby）')).toBeNull();
    expect(target('abc')).toBeNull();
    expect(target('123')).toBeNull();
    expect(target('')).toBeNull();
    expect(target('！！！')).toBeNull();
});

test('句尾：以目標字結尾的連續漢字最多 4 個', () => {
    expect(target('一二三四五')).toMatchObject({ char: '五', tail: '二三四五', i: 4 });
    expect(target('我愛你')).toMatchObject({ tail: '我愛你' });
    expect(target('hello你')).toMatchObject({ tail: '你' });   // 英文不算漢字，tail 到英文為止
    expect(target('我😀你')).toMatchObject({ tail: '你' });
});

test('讀音：手動、詞庫詞、字典第一讀音的優先序', () => {
    reset();
    // 字典第一讀音：樂 → ㄌㄜˋ
    expect(ev("lhRhymeReading(lhRhymeTarget('聽著音樂', true), null)")).toBe('ㄌㄜˋ');
    // 詞庫有「音樂」：取以目標字結尾的詞的最後一個音節
    run("wordPhoneticMap.set('音樂', 'ㄧㄣ ㄩㄝˋ')");
    expect(ev("lhRhymeReading(lhRhymeTarget('聽著音樂', true), null)")).toBe('ㄩㄝˋ');
    // 更長的詞優先（4 字 → 3 字 → 2 字）
    run("wordPhoneticMap.set('著音樂', 'ㄓㄜ˙ ㄧㄣ ㄧㄠˋ')");
    expect(ev("lhRhymeReading(lhRhymeTarget('聽著音樂', true), null)")).toBe('ㄧㄠˋ');
    // 手動讀音（對該字合法）蓋過詞庫
    expect(ev(`lhRhymeReading(lhRhymeTarget('聽著音樂', true), ${j({ 聽著音樂: 'ㄌㄜˋ' })})`)).toBe('ㄌㄜˋ');
    // 音節數和字數不符的詞庫資料忽略
    reset();
    run("wordPhoneticMap.set('音樂', 'ㄧㄣ')");
    expect(ev("lhRhymeReading(lhRhymeTarget('聽著音樂', true), null)")).toBe('ㄌㄜˋ');
    reset();
});

test('讀音：手動值不是該字的合法讀音就忽略', () => {
    reset();
    run("wordPhoneticMap.set('音樂', 'ㄧㄣ ㄩㄝˋ')");
    expect(ev(`lhRhymeReading(lhRhymeTarget('聽著音樂', true), ${j({ 聽著音樂: 'ㄅㄚ' })})`)).toBe('ㄩㄝˋ');
    // 鍵不是這句的 tail 也不會被用到；原型鍵不會被讀出來
    expect(ev(`lhRhymeReading(lhRhymeTarget('聽著音樂', true), ${j({ 音樂: 'ㄌㄜˋ' })})`)).toBe('ㄩㄝˋ');
    expect(ev(`lhRhymeReading(lhRhymeTarget('聽著音樂', true), JSON.parse('{"__proto__":"ㄌㄜˋ"}'))`)).toBe('ㄩㄝˋ');
    reset();
});

test('字母：AABB 與 ABAB（寬韻、嚴格）', () => {
    reset();
    expect(letters(F.AABB)).toBe('AABB');
    expect(letters(F.AABB, { strict: true })).toBe('AABB');
    expect(letters(F.ABAB)).toBe('ABAB');
    expect(letters(F.ABAB, { strict: true })).toBe('ABCD');
});

test('字母：同家族不同韻母', () => {
    reset();
    expect(letters(F.FAM1)).toBe('AABB');
    expect(letters(F.FAM1, { strict: true })).toBe('ABCD');
    expect(letters(F.FAM2)).toBe('AABC');
    expect(letters(F.FAM2, { strict: true })).toBe('ABCD');
});

test('字母：語助詞、英文行與空行', () => {
    reset();
    expect(letters(F.PART)).toBe('A-AB');
    expect(letters(F.PART, { strict: true })).toBe('A-BC');
    expect(letters(F.PART, { skip: false })).toBe('A-BA');
    // 目標字：跳語助詞 亮／—／慌／你；不跳 啊／—／了／嗎
    expect(ev(`lhRhymeAnalyze(${j(F.PART)}, { strict: false, skipParticles: true }, null).rows.map(r => r.t ? r.t.char : '—')`)).toEqual(['亮', '—', '—', '慌', '你']);
    expect(ev(`lhRhymeAnalyze(${j(F.PART)}, { strict: false, skipParticles: false }, null).rows.map(r => r.t ? r.t.char : '—')`)).toEqual(['啊', '—', '—', '了', '嗎']);
});

test('字母：空韻同群（寬韻）、嚴格各自不同', () => {
    reset();
    expect(letters(F.KONG)).toBe('AABAA');
    expect(letters(F.KONG, { strict: true })).toBe('ABCDE');
});

test('字母：多音字依詞庫與手動讀音變動', () => {
    reset();
    expect(letters(F.POLY)).toBe('AAA');
    run("wordPhoneticMap.set('音樂', 'ㄧㄣ ㄩㄝˋ')");
    expect(letters(F.POLY)).toBe('ABA');
    expect(letters(F.POLY, { readings: { 聽著音樂: 'ㄌㄜˋ' } })).toBe('AAA');
    expect(letters(F.POLY, { readings: { 聽著音樂: 'ㄅㄚ' } })).toBe('ABA');
    reset();
});

test('字母：零、一、多（空、孤句、重複、換行格式）', () => {
    reset();
    expect(ev("lhRhymeAnalyze('', { strict: false, skipParticles: true }, null)")).toMatchObject({ letters: '', rows: [{ blank: true }] });
    expect(letters('\n\n  \n')).toBe('');
    const one = ev("lhRhymeAnalyze('我愛你', { strict: false, skipParticles: true }, null)");
    expect(one.letters).toBe('A');
    expect(one.rows[0].solo).toBe(true);
    const two = ev("lhRhymeAnalyze('我愛你\\n我愛你', { strict: false, skipParticles: true }, null)");
    expect(two.letters).toBe('AA');
    expect(two.rows.map(r => r.solo)).toEqual([false, false]);
    // 以結尾換行收尾：多一個空行，不佔字母
    expect(letters('我愛你\n')).toBe('A');
    // \r\n、\r 與 \n 結果相同
    const base = letters(F.AABB), crlf = letters(F.AABB.replace(/\n/g, '\r\n')), cr = letters(F.AABB.replace(/\n/g, '\r'));
    expect([crlf, cr]).toEqual([base, base]);
    expect(ev(`lhRhymeAnalyze(${j(F.AABB.replace(/\n/g, '\r\n'))}, { strict: true, skipParticles: true }, null).rows.length`)).toBe(4);
});

test('字母：超過 26 種韻接小寫，不出現 undefined', () => {
    reset();
    // 從字典挑 30 個「單一讀音、韻母各不相同」的字，每字一行；嚴格模式每行一種韻
    const chars = ev(`(() => {
        const seen = new Map();
        for (const c of Object.keys(charInfo)) {
            if (Array.from(c).length !== 1 || getCharAllReadings(c).length !== 1 || !lhRhymeTarget(c, true)) continue;
            const r = getZhuyinRhyme(getCharAllReadings(c)[0].reading);
            if (!seen.has(r)) seen.set(r, c);
            if (seen.size >= 30) break;
        }
        return Array.from(seen.values());
    })()`);
    expect(chars.length, '字典至少有 30 種韻母').toBe(30);
    const out = letters(chars.join('\n'), { strict: true });
    expect(out).toHaveLength(30);
    expect(out.slice(0, 27)).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZa');
    expect(out).not.toMatch(/undefined|\*/);
});

test('效能：兩百行分析', () => {
    reset();
    const text = Array.from({ length: 200 }, (_, n) => ['我望著遠方的光', '走過熟悉的街道', '你笑著說天亮啊', '不怕前方的路遙'][n % 4]).join('\n');
    const times = [];
    for (let n = 0; n < 5; n++) times.push(ev(`(() => { const t = performance.now(); lhRhymeAnalyze(${j(text)}, { strict: false, skipParticles: true }, null); return performance.now() - t; })()`));
    times.sort((a, b) => a - b);
    expect(times[2], '中位數 ' + times.join(', ')).toBeLessThan(20);
});
