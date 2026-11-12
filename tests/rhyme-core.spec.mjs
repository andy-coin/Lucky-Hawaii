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

// ===== 對比（10-03，UI-SPEC 2.2–2.4）：WCAG 相對亮度、sRGB 逐頻道混色（四捨五入） =====
const rgbOf = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const hexOf = a => '#' + a.map(v => v.toString(16).padStart(2, '0')).join('');
const mixHex = (fg, bg, pct) => hexOf(rgbOf(fg).map((v, i) => Math.round(v * pct / 100 + rgbOf(bg)[i] * (100 - pct) / 100)));
const lumOf = h => {
    const [r, g, b] = rgbOf(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrastOf = (a, b) => { const x = lumOf(a), y = lumOf(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const PALETTES = ev('LH_RHYME_COLORS');
const MIX = ev('LH_RHYME_MIX');
// [色票組, 文字色, 卡片底色]：預設淺色用淺色組、預設深色用深色組；客製極端（UI-SPEC 2.2）。
// overnight/rhyme 起哪一組由卡片底色的亮度決定（亮底只會用 light 組、暗底只會用 dark 組），所以極端值各測自己那一側
const EXTREMES = { light: [['#000000', '#ffffff'], ['#2d3748', '#fffaf0']], dark: [['#ffffff', '#000000'], ['#d2c8b7', '#111c31']] };
const TEXT_ON_CARD = [['light', '#2d3748', '#f7fafc'], ['dark', '#d2c8b7', '#2d3748'],
    ...['light', 'dark'].flatMap(set => EXTREMES[set].map(([t, c]) => [set, t, c]))];

test('對比：色票格式與文字對比', () => {
    for (const set of ['light', 'dark']) {
        expect(PALETTES[set]).toHaveLength(17);
        for (const hex of PALETTES[set]) expect(hex, set).toMatch(/^#[0-9a-f]{6}$/);
    }
    for (const [set, text, card] of TEXT_ON_CARD) {
        PALETTES[set].forEach((color, n) => {
            for (const pct of [MIX.end, MIX.orphan]) {
                const c = contrastOf(text, mixHex(color, card, pct));
                expect(c, `${set} 色 ${n} ${color} 混 ${pct}%，文字 ${text} 在 ${card}`).toBeGreaterThanOrEqual(4.5);
            }
        });
    }
});

// 濃淡三段（11-03，UI-SPEC D-14）：標準＝第 10 階段；淡、標準兩段每個組合都要 4.5:1；濃是使用者自己選的，淺色最差 5.30、深色最差 4.28，且深色 16 色有 8 色低於 4.5（overnight/rhyme 重配色後）
test('對比：濃淡三段', () => {
    const DEPTH = ev('LH_MAP_DEPTH');
    expect(Object.keys(DEPTH)).toEqual(['light', 'std', 'heavy']);
    expect(DEPTH.light).toEqual([26, 14]);
    expect(DEPTH.std, '標準必須和第 10 階段一樣').toEqual([MIX.end, MIX.orphan]);
    expect(DEPTH.heavy).toEqual([40, 20]);
    expect(ev('Object.isFrozen(LH_MAP_DEPTH)')).toBe(true);
    for (const depth of ['light', 'std']) {
        for (const [set, text, card] of TEXT_ON_CARD) {
            PALETTES[set].forEach((color, n) => {
                for (const pct of DEPTH[depth]) {
                    const c = contrastOf(text, mixHex(color, card, pct));
                    expect(c, `${depth} ${set} 色 ${n} ${color} 混 ${pct}%，文字 ${text} 在 ${card}`).toBeGreaterThanOrEqual(4.5);
                }
            });
        }
    }
    // 濃：只量預設兩組（16 個韻族，空韻不開放自訂）
    const worst = (set, text, card) => PALETTES[set].slice(0, 16).map(color => contrastOf(text, mixHex(color, card, DEPTH.heavy[0])));
    const light = worst('light', '#2d3748', '#f7fafc'), dark = worst('dark', '#d2c8b7', '#2d3748');
    expect(Math.min(...light).toFixed(2)).toBe('5.30');
    expect(Math.min(...dark).toFixed(2)).toBe('4.28');
    expect(dark.filter(c => c < 4.5)).toHaveLength(8);
    expect(light.filter(c => c < 4.5)).toHaveLength(0);
    // 孤句（較淡的那一層）濃也不會比標準差：混合比例比主色塊小
    for (const color of PALETTES.dark.slice(0, 16)) {
        expect(contrastOf('#d2c8b7', mixHex(color, '#2d3748', DEPTH.heavy[1]))).toBeGreaterThanOrEqual(4.5);
    }
});

test('對比：句中底線', () => {
    expect(MIX.inner).toBe(30);
    for (const [set, text, card] of [['light', '#2d3748', '#f7fafc'], ['dark', '#d2c8b7', '#2d3748']]) {
        PALETTES[set].forEach((color, n) => {
            // 底線＝文字色 30% 混進家族色 70%
            const c = contrastOf(mixHex(text, color, MIX.inner), card);
            expect(c, `${set} 色 ${n} ${color} 底線對卡片`).toBeGreaterThanOrEqual(3);
        });
    }
});

// ===== 10-04：句中押韻 =====
const inner = (text, { strict = false, skip = true, on = true } = {}) =>
    ev(`lhRhymeAnalyze(${j(text)}, { strict: ${strict}, skipParticles: ${skip}, inner: ${on} }, null).rows.map(r => r.inner)`);
const INNER = '我想望向遠方的光\n他在窗邊唱\n你看見天亮';

test('句中：最多三個、由左到右、不含句尾字', () => {
    reset();
    const rows = inner(INNER);
    // 第一行 想、望、向、方 都和句尾同家族，只取左邊三個（遠、的不押韻）
    expect(rows[0]).toEqual([{ i: 1, f: 14 }, { i: 2, f: 14 }, { i: 3, f: 14 }]);
    expect(rows[1]).toEqual([{ i: 2, f: 14 }]);   // 窗；句尾 唱 本身不算
    expect(rows[2]).toEqual([]);                  // 看見天 都不押
    for (const [line, r] of INNER.split('\n').map((l, n) => [l, rows[n]])) {
        const tail = Array.from(line).length - 1;
        expect(r.length).toBeLessThanOrEqual(3);
        expect(r.every(m => m.i < tail)).toBe(true);
    }
});

test('句中：關著時每一列都沒有標記', () => {
    reset();
    expect(inner(INNER, { on: false }).flat()).toEqual([]);
    expect(ev(`lhRhymeAnalyze(${j(INNER)}, {}, null).rows.every(r => Array.isArray(r.inner) && !r.inner.length)`)).toBe(true);
});

test('句中：標點、空行、沒有句尾字的行都沒有標記', () => {
    reset();
    // 「，」「！」不是漢字；英文行沒有句尾字；空行沒有
    const rows = inner('你想，我望！天亮\n\nOh baby\n走過窗光');
    expect(rows[0]).toEqual([]);   // 想、望在「，」「！」前面，本身就是句尾（色塊），不再畫句中底線
    expect(rows[1]).toEqual([]);
    expect(rows[2]).toEqual([]);
    expect(rows[3].map(m => m.i)).toEqual([2]);   // 窗；光是句尾
});

test('句中：忽略語助詞開著時語助詞不算，關掉就算', () => {
    reset();
    const t = '我的歌\n你的河';
    expect(inner(t, { skip: true })).toEqual([[], []]);
    expect(inner(t, { skip: false })).toEqual([[{ i: 1, f: 5 }], [{ i: 1, f: 5 }]]);
});

test('句中：嚴格要韻母全等，寬韻看家族', () => {
    reset();
    const t = '我愛你\n他很忙\n心中的光芒';
    // 光（ㄨㄤ）和句尾 忙、芒（ㄤ）寬韻同家族、嚴格不同
    expect(inner(t)[2]).toEqual([{ i: 3, f: 14 }]);
    expect(inner(t, { strict: true })[2]).toEqual([]);
});

test('句中：寬韻與嚴格的 F-ABAB 孤句與顏色', () => {
    reset();
    // 顏色一律依家族，不因判定模式改變（B2）；孤句只看判定
    const f = strict => ev(`lhRhymeAnalyze(${j(F.ABAB)}, { strict: ${strict} }, null).rows.map(r => [r.f, r.solo])`);
    const wide = f(false), strictRows = f(true);
    expect(wide.map(r => r[0])).toEqual(strictRows.map(r => r[0]));
    expect(wide.some(r => r[1])).toBe(false);
    expect(strictRows.every(r => r[1])).toBe(true);
});

test('句中：語助詞開關決定句尾字（愛你到天亮啊）', () => {
    reset();
    expect(target('愛你到天亮啊', true).char).toBe('亮');
    expect(target('愛你到天亮啊', false).char).toBe('啊');
});

test('設定：整理成固定的鍵', () => {
    const norm = v => ev(`lhRhymeNormalizeSettings(${j(v)})`);
    // 十五個設定鍵加 colors（五個舊開關＋雙押多押、逐行標記、三個內容項、對照差異、停留自動分析、位置、大小、濃淡）
    const D = { end: true, letters: false, inner: false, strict: false, skipParticles: true,
        multi: true, autoColor: true, line: false, lnRhyme: false, lnCount: true, lnSplit: true, lnDiff: false, autoHover: false,
        pos: 'right', size: 'm', depth: 'std', colors: {} };
    expect(norm(null)).toEqual(D);
    expect(norm([1, 2])).toEqual(D);
    expect(norm('x')).toEqual(D);
    expect(norm({ end: 'false', inner: 1, strict: 'true', evil: true })).toEqual(D);
    expect(norm({ end: false, strict: true, evil: 1 })).toEqual({ ...D, end: false, strict: true });
    expect(Object.keys(norm({ evil: true })).sort()).toEqual(Object.keys(D).sort());
});

test('設定：新鍵逐鍵退回預設', () => {
    const norm = v => ev(`lhRhymeNormalizeSettings(${j(v)})`);
    // 列舉值不在清單內：只有那一鍵退回預設，其他好的鍵照收
    const bad = norm({ pos: 'left', size: 'xl', depth: 'max', line: true, lnDiff: true });
    expect(bad.pos).toBe('right');
    expect(bad.size).toBe('m');
    expect(bad.depth).toBe('std');
    expect(bad.line).toBe(true);
    expect(bad.lnDiff).toBe(true);
    const good = norm({ pos: 'tail', size: 's', depth: 'heavy' });
    expect([good.pos, good.size, good.depth]).toEqual(['tail', 's', 'heavy']);
    // 開關不是真布林：退回那一鍵的預設（lnCount 預設是 true）
    const sw = norm({ line: 'true', lnCount: 0, lnSplit: 'false', autoHover: 1 });
    expect([sw.line, sw.lnCount, sw.lnSplit, sw.autoHover]).toEqual([false, true, true, false]);
    // 列舉值不能是物件、陣列、數字
    expect(norm({ pos: ['right'], size: 1, depth: {} })).toMatchObject({ pos: 'right', size: 'm', depth: 'std' });
    // 整個值是 null、陣列、字串
    for (const v of [null, [], 'x', 5, true]) expect(norm(v).colors).toEqual({});
});

test('設定：顏色只收十六個鍵與小寫色碼', () => {
    const norm = txt => ev(`lhRhymeNormalizeSettings(JSON.parse(${j(txt)}))`);   // 用 JSON.parse 才會有真正自己的 __proto__ 鍵
    const c = txt => norm(txt).colors;
    expect(c('{"colors":{"3":"#ABCDEF","4":"#12345","5":"#a1b2c3","6":"red","7":123,"8":{"x":1},"99":"#000000","16":"#000000"}}')).toEqual({ 5: '#a1b2c3' });
    expect(c('{"colors":{"0":"#000000","15":"#ffffff"}}')).toEqual({ 0: '#000000', 15: '#ffffff' });
    expect(c('{"colors":{"__proto__":"#aabbcc","constructor":"#aabbcc","toString":"#aabbcc","1":"#aabbcc"}}')).toEqual({ 1: '#aabbcc' });
    expect(Object.keys(c('{"colors":{"__proto__":{"polluted":true}}}'))).toEqual([]);
    expect(ev('({}).polluted')).toBeUndefined();
    // colors 本身不是普通物件：丟掉
    for (const t of ['{"colors":[]}', '{"colors":"x"}', '{"colors":null}', '{"colors":["#aabbcc"]}']) expect(c(t), t).toEqual({});
    // 輸出是全新的普通物件，不是輸入的同一個
    expect(ev(`(() => { const i = JSON.parse('{"colors":{"1":"#aabbcc"}}'); const o = lhRhymeNormalizeSettings(i); return o.colors !== i.colors && Object.getPrototypeOf(o.colors) === Object.prototype; })()`)).toBe(true);
});

test('設定：最小序列化不改舊字串', () => {
    const ser = v => ev(`lhRhymeSerialize(${j(v)})`);
    // 第 10 階段留下的五鍵字串（rhyme-map-ui／rhyme-audit 測試用的那幾種）逐字不變
    const FIVE = [
        '{"end":true,"letters":false,"inner":false,"strict":false,"skipParticles":true}',
        '{"end":false,"letters":false,"inner":false,"strict":false,"skipParticles":true}',
        '{"end":true,"letters":false,"inner":true,"strict":true,"skipParticles":true}',
        '{"end":true,"letters":true,"inner":true,"strict":true,"skipParticles":false}',
    ];
    for (const s of FIVE) expect(ser(JSON.parse(s)), s).toBe(s);
    // 新鍵：只寫與預設不同的，接在五個舊鍵後面
    expect(ser({ line: true })).toBe('{"end":true,"letters":false,"inner":false,"strict":false,"skipParticles":true,"line":true}');
    expect(ser({ line: true, lnCount: true, pos: 'right', size: 'm', depth: 'std' })).toBe('{"end":true,"letters":false,"inner":false,"strict":false,"skipParticles":true,"line":true}');
    expect(ser({ lnCount: false, pos: 'tail', size: 'l' })).toBe('{"end":true,"letters":false,"inner":false,"strict":false,"skipParticles":true,"lnCount":false,"pos":"tail","size":"l"}');
    // colors 有東西才寫
    expect(ser({ colors: {} })).toBe(FIVE[0]);
    expect(ser({ colors: { 2: '#aabbcc' } })).toBe('{"end":true,"letters":false,"inner":false,"strict":false,"skipParticles":true,"colors":{"2":"#aabbcc"}}');
    // 壞值不會寫出去
    expect(ser({ pos: 'evil', line: 'yes', colors: { 1: 'red' } })).toBe(FIVE[0]);
    // 序列化再讀回來是同一份設定
    const s = { end: false, letters: true, line: true, lnRhyme: true, lnDiff: true, autoHover: true, pos: 'tail', size: 's', depth: 'light', colors: { 4: '#010203' } };
    expect(ev(`lhRhymeNormalizeSettings(JSON.parse(lhRhymeSerialize(${j(s)})))`)).toEqual(ev(`lhRhymeNormalizeSettings(${j(s)})`));
});

// ===== 第 10-06 計畫：手動讀音清洗 =====
const clean = js => ev(`lhRhymeCleanReadings(${js})`);
test('讀音：清洗——合法的原樣留下', () => {
    expect(clean(j({ '聽著音樂': 'ㄌㄜˋ' }))).toEqual({ '聽著音樂': 'ㄌㄜˋ' });
    expect(clean(j({ '們一起行': 'ㄏㄤˊ', '音樂': 'ㄩㄝˋ', '行': 'ㄒㄧㄥˊ' }))).toEqual({ '們一起行': 'ㄏㄤˊ', '音樂': 'ㄩㄝˋ', '行': 'ㄒㄧㄥˊ' });
});
test('讀音：清洗——壞的鍵與值整個丟掉', () => {
    expect(clean(`JSON.parse('{"__proto__":"ㄌㄜˋ"}')`)).toBeNull();
    expect(clean(j({ constructor: 'ㄌㄜˋ' }))).toBeNull();
    expect(clean(j({ '一二三四五': 'ㄨˇ' }))).toBeNull();
    expect(clean(j({ 'ab樂': 'ㄌㄜˋ' }))).toBeNull();
    expect(clean(j({ '12樂': 'ㄌㄜˋ' }))).toBeNull();
    expect(clean(j({ '音樂': 'ㄅㄚ' }))).toBeNull();
    expect(clean(j({ '音樂': 5 }))).toBeNull();
    expect(clean(j({ '音樂': ['ㄌㄜˋ'] }))).toBeNull();
    expect(clean(j({ '音樂': 'ㄌㄜˋ ' }))).toBeNull();
    for (const bad of ['[]', 'null', "'x'", '{}', 'undefined', '5', "['ㄌㄜˋ']"]) expect(clean(bad), bad).toBeNull();
});
test('讀音：清洗——混合時只留合法的，回傳全新的普通物件', () => {
    const out = clean(`JSON.parse('{"__proto__":"ㄌㄜˋ","音樂":"ㄌㄜˋ","ab樂":"ㄌㄜˋ","行":"ㄏㄤˊ","音樂家":"ㄅㄚ"}')`);
    expect(out).toEqual({ '音樂': 'ㄌㄜˋ', '行': 'ㄏㄤˊ' });
    expect(ev(`(() => { const o = JSON.parse('{"__proto__":"ㄌㄜˋ","音樂":"ㄌㄜˋ"}'); const r = lhRhymeCleanReadings(o); return [r !== o, Object.getPrototypeOf(r) === Object.prototype, Object.prototype.hasOwnProperty.call(r, '__proto__')]; })()`)).toEqual([true, true, false]);
});
test('讀音：清洗——一首歌最多 2000 筆', () => {
    const n = ev(`(() => {
        const hs = Array.from('天地玄黃宇宙洪荒日月盈昃辰宿列張寒來暑往秋收冬藏'), r = getCharAllReadings('光')[0].reading, o = {};
        let k = 0;
        for (const a of hs) for (const b of hs) for (const c of hs) { if (k++ < 2001) o[a + b + c + '光'] = r; }
        return [Object.keys(o).length, Object.keys(lhRhymeCleanReadings(o)).length];
    })()`);
    expect(n).toEqual([2001, 2000]);
});

// ===== 第 10-07 計畫：統計 =====
const summary = (text, strict = false, skip = true) =>
    ev(`lhRhymeSummary(lhRhymeAnalyze(${j(text)}, { strict: ${strict}, skipParticles: ${skip} }, null), ${strict})`);

test('統計：寬韻 AABB 四句都押韻', () => {
    reset();
    const s = summary(F.AABB);
    expect(s).toMatchObject({ n: 4, k: 4, p: 100 });
    expect(s.groups.map(g => [g.letter, g.label, g.count])).toEqual([['A', 'ㄤ', 2], ['B', 'ㄠ', 2]]);
    expect(s.groups.map(g => g.f)).toEqual([14, 8]);
});

test('統計：嚴格 ABAB 四個韻母都不同，每個一次', () => {
    reset();
    const s = summary(F.ABAB, true);
    expect(s).toMatchObject({ n: 4, k: 0, p: 0 });
    expect(s.groups.map(g => [g.letter, g.label, g.count])).toEqual([['A', 'ㄨㄤ', 1], ['B', 'ㄠ', 1], ['C', 'ㄧㄤ', 1], ['D', 'ㄧㄠ', 1]]);
    expect(summary(F.ABAB).groups.map(g => [g.letter, g.label, g.count])).toEqual([['A', 'ㄤ', 2], ['B', 'ㄠ', 2]]);
});

test('統計：英文行算一句、空行不算', () => {
    reset();
    expect(summary(F.PART)).toMatchObject({ n: 4, k: 2, p: 50 });
});

test('統計：空韻', () => {
    reset();
    const s = summary(F.KONG);
    expect(s.groups[0]).toMatchObject({ letter: 'A', label: '空韻', f: 16 });
    expect(s.groups[0].count).toBe(4);
    // 嚴格看韻母本身，不顯示「空韻」
    expect(summary(F.KONG, true).groups.map(g => g.label)).toEqual(['ㄕ', 'ㄓ', 'ㄧㄢ', 'ㄗ', 'ㄙ']);
});

test('統計：沒有任何文字', () => {
    reset();
    expect(summary('')).toEqual({ n: 0, k: 0, p: 0, groups: [], m2: 0, m3: 0 });
    expect(summary('\n  \n')).toEqual({ n: 0, k: 0, p: 0, groups: [], m2: 0, m3: 0 });
});

test('統計：超過 52 種韻母字母用 * 且不出現 undefined', () => {
    reset();
    const s = ev(`lhRhymeSummary({ rows: ${j(Array.from({ length: 60 }, (_, i) => ({ blank: false, key: 'k' + i, rhyme: 'ㄤ', f: 14, letter: i < 52 ? 'x' : '*' })))}, count: new Map(${j(Array.from({ length: 60 }, (_, i) => ['k' + i, 1]))}) }, true)`);
    expect(s.groups).toHaveLength(60);
    expect(JSON.stringify(s)).not.toContain('undefined');
});

// 提醒用的純函式（11-04，UI-SPEC D-15）：頁面上讀到 rgb 整數陣列後用，和上面測試用的 mixHex／contrastOf 逐值相同
test('對比：提醒用的混色與對比', () => {
    const mix = (fg, bg, pct) => ev(`lhRhymeMixRgb(${j(rgbOf(fg))}, ${j(rgbOf(bg))}, ${pct})`);
    const con = (a, b) => ev(`lhRhymeContrast(${j(rgbOf(a))}, ${j(rgbOf(b))})`);
    for (const [fg, bg, pct] of [['#d9534f', '#f7fafc', 34], ['#c9524e', '#2d3748', 40], ['#ffffff', '#2d3748', 34], ['#000000', '#ffffff', 17], ['#8a8f98', '#f7fafc', 26]]) {
        expect(mix(fg, bg, pct), `${fg} 混 ${pct}% 進 ${bg}`).toEqual(rgbOf(mixHex(fg, bg, pct)));
    }
    for (const [a, b] of [['#2d3748', '#f7fafc'], ['#d2c8b7', '#2d3748'], ['#d2c8b7', mixHex('#ffffff', '#2d3748', 34)], ['#000000', '#ffffff']]) {
        expect(con(a, b), `${a} / ${b}`).toBeCloseTo(contrastOf(a, b), 10);
    }
    // 順序不影響；UI-SPEC 2.3 深色純白 34% 混進卡片約 2.58
    expect(con('#f7fafc', '#2d3748')).toBe(con('#2d3748', '#f7fafc'));
    expect(con('#d2c8b7', mixHex('#ffffff', '#2d3748', 34))).toBeCloseTo(2.58, 1);
    // 純函式：不改傳入的陣列
    expect(ev('(() => { const a = [10, 20, 30], b = [200, 210, 220]; lhRhymeMixRgb(a, b, 50); lhRhymeContrast(a, b); return [a, b]; })()')).toEqual([[10, 20, 30], [200, 210, 220]]);
});

// ===== 句尾看標點與空白（overnight/rhyme A）：逗號、句號、問號、頓號、引號、括號、刪節號、破折號、空白前的字都是一個句尾 =====
const targets = (line, skip = true) => ev(`lhRhymeTargets(${j(line)}, ${skip})`).map(t => t.char).join('');
const ends = (text, opts = {}) => ev(`lhRhymeAnalyze(${j(text)}, ${j({ skipParticles: true, ...opts })}, null).rows.map(r => r.ends.map(e => e.t.char + (e.multi > 1 ? '×' + e.multi : '')).join(''))`);

test('子句句尾：全形半形標點與空白都是斷點', () => {
    reset();
    expect(targets('我走過，你來過')).toBe('過過');
    expect(targets('你好嗎?我很好!')).toBe('好好');   // 嗎是語助詞
    expect(targets('天亮、日落；風起：雲湧')).toBe('亮落起湧');
    expect(targets('「月光」（窗前）')).toBe('光前');
    expect(targets('等待……回來——離開')).toBe('待來開');
    expect(targets('月光 灑在　窗前')).toBe('光在前');   // 半形與全形空白
    expect(targets('，，我愛你！！？')).toBe('你');   // 行首標點、連續標點不會多出空句尾
});

test('子句句尾：英文、語助詞、行尾英文', () => {
    reset();
    expect(targets('Oh baby 我愛你')).toBe('你');   // 英文單字之間的空白是斷點，但英文不上色
    expect(targets('我愛你 so much')).toBe('你');
    expect(target('我愛你 so much')).toMatchObject({ char: '你', i: 2 });   // 行尾是英文：退到前面最近的中文句尾
    expect(targets('好想好想你，嗎')).toBe('你');   // 整個子句都是語助詞，不算一個句尾
    expect(targets('你好啊，我很好呀')).toBe('好好');
    expect(targets('啊！呀！')).toBe('呀');   // 整行都是語助詞：最後一個字
    expect(targets('你好啊，我很好呀', false)).toBe('啊呀');
    expect(target('（Oh baby）')).toBeNull();
});

test('子句句尾：行中的句尾也上色、計入押韻，字母照舊每行一個', () => {
    reset();
    const r = ev(`lhRhymeAnalyze('我望著光，你在窗旁\\n走過街道', {}, null)`);
    expect(r.letters).toBe('AB');
    expect(r.rows[0].ends.map(e => [e.t.char, e.t.i, e.solo])).toEqual([['光', 3, false], ['旁', 8, false]]);
    expect(r.rows[0].t.char).toBe('旁');
    expect(run(`lhRhymeAnalyze('我望著光，你在窗旁\\n走過街道', {}, null).count.get('f14')`)).toBe(2);
    expect(r.rows[1].solo).toBe(true);
    expect(summary('我望著光，你在窗旁\n走過街道').groups.map(g => g.count)).toEqual([2, 1]);
});

// ===== 雙押／多押（overnight/rhyme B）：句尾往前逐字比韻母，重用 lhRhymeMatch =====
test('多押：離開／你來是雙押，關著時都是 ×1', () => {
    reset();
    expect(ends('我要離開\n等你來', { multi: true })).toEqual(['開×2', '來×2']);
    expect(ends('我要離開\n等你來')).toEqual(['開', '來']);
    expect(ends('離開，你來', { multi: true })).toEqual(['開×2來×2']);   // 同一行的兩個句尾也算
});

test('多押：同字不算、韻母不同就停、三押', () => {
    reset();
    expect(ends('沒有人\n某個人', { multi: true })).toEqual(['人', '人']);   // 有（ㄡ）／個（ㄜ）不同韻族
    expect(ends('我是某個人\n你是這個人', { multi: true })).toEqual(['人', '人']);   // 個＝個：重複不算押
    expect(ends('我愛你\n我愛你', { multi: true })).toEqual(['你', '你']);   // 重複句不亮起來
    expect(ends('心裡的期待\n夢裡依賴', { multi: true })).toEqual(['待×2', '賴×2']);   // 期／依、待／賴押；的（ㄜ）／裡（ㄧ）不押
    expect(ends('我心裡的期待\n不捨得離開', { multi: true })).toEqual(['待×3', '開×3']);   // 的期待／得離開：ㄜ ㄧ ㄞ 三個都押
    expect(summary('我要離開\n等你來', false).m2).toBe(0);   // summary 沒開多押
    expect(ev(`lhRhymeSummary(lhRhymeAnalyze('我要離開\\n等你來\\n我心裡的期待\\n不捨得離開', { multi: true }, null), false)`)).toMatchObject({ m2: 2, m3: 2 });
});

test('多押：嚴格模式跟著 lhRhymeMatch', () => {
    reset();
    // 走（ㄡ）／我（ㄨㄛ）同在ㄛ韻族：寬韻算雙押，嚴格韻母不同就不算
    expect(ends('轉身走開\n換我來', { multi: true })).toEqual(['開×2', '來×2']);
    expect(ends('轉身走開\n換我來', { multi: true, strict: true })).toEqual(['開', '來']);
});

// 重配色（overnight/rhyme C）：色塊對卡片底色要夠明顯；編號相鄰、發音相近的韻族色差要夠大（OKLab ΔE×100，實際混進卡片後的色塊比）
test('對比：色塊明顯、相近韻族分得開', () => {
    const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const lab = h => {
        const [r, g, b] = rgbOf(h).map(lin);
        const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
        return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
    };
    const dE = (a, b) => { const x = lab(a), y = lab(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) * 100; };
    const NEAR = [...Array.from({ length: 15 }, (_, i) => [i, i + 1]), [0, 2], [9, 10], [11, 12], [11, 13], [12, 13], [12, 15], [14, 15], [6, 7], [4, 5], [3, 7], [8, 4], [1, 4], [1, 15], [10, 13], [9, 11]];
    for (const [set, card, minSal] of [['light', '#f7fafc', 1.6], ['dark', '#2d3748', 1.38]]) {
        const fills = PALETTES[set].map(c => mixHex(c, card, MIX.end));
        for (let n = 0; n < 16; n++) expect(contrastOf(fills[n], card), `${set} 色 ${n} 對底色`).toBeGreaterThanOrEqual(minSal);
        for (const [a, b] of NEAR) expect(dE(fills[a], fills[b]), `${set} 韻族 ${a}／${b}`).toBeGreaterThanOrEqual(4.5);
    }
});

test('英文：片語只看最後一個字、中英互押、拼字猜測', () => {
    reset();
    run(`lhEnSetDict({ 'AW S': 'house mouse', 'AW N': 'down', 'EH L': 'hell', 'IY': 'pity' })`);
    expect(ev(`lhRhymeTargets('slow down calm down', true)`).map(t => t.tail)).toEqual(['down']);
    expect(ev(`lhRhymeTargets("who's the pity mouse?", true)`).map(t => t.tail)).toEqual(['mouse']);
    const t = ev(`lhRhymeTargets('麻雀in the house', true)`);
    expect(t.map(x => [x.tail, x.s, x.i, x.en])).toEqual([['house', 9, 13, 'ㄠ']]);
    // house 和「好」同一族
    expect(ev(`lhRhymeAnalyze('yo yo 麻雀in the house\\n快樂或紛擾', {})`).rows.map(r => r.key)).toEqual(['f8', 'f8']);
    expect(ev(`lhEnRhyme('yo')`)).toBe('ㄡ');        // 字表沒有：照拼字猜
    expect(ev(`lhEnRhyme('down')`)).toBe('ㄤ');
    run('_lhEnDict = null');
    expect(ev(`lhRhymeTargets('the house', true)`)).toEqual([]);   // 字表還沒載好：不上色
});

test('雙押：不跨過句構的斷點', () => {
    reset();
    // 沒有句構斷點：往前最多 4 個漢字
    expect(ev(`lhRhymeTargets('丟進杯子裡攪拌', true, null)`)[0].tail).toBe('子裡攪拌');
    // 組頭在「攪」：只到攪拌
    expect(ev(`lhRhymeTargets('丟進杯子裡攪拌', true, new Set([0, 2, 5]))`)[0].tail).toBe('攪拌');
});

test('自動配色：靠近的不同韻用不同顏色、空韻維持灰', () => {
    reset();
    const pal = j(ev('LH_RHYME_COLORS.light'));
    const r = ev(`lhRhymeAnalyze('天\\n邊\\n好\\n跑\\n花\\n家\\n吃', { palette: ${pal} })`);
    const f = r.rows.map(x => x.f);
    expect(f[0]).toBe(f[1]);
    expect(new Set([f[0], f[2], f[4]]).size).toBe(3);
    expect(f[6]).toBe(16);
});
