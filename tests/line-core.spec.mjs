// 句構分析的純函式（js/line-core.js）：不開瀏覽器，用 node:vm 載入（含 sections-core.js 的字數規則）
// 固定歌詞範例來自 11-RESEARCH.md Pattern 2 的表（用 mini 詞表實跑出來的）；真詞庫的誤切（風吹過熟悉的街道 → 2+4+2 之類）
// 是人工檢查（Human check）的素材，這裡不斷言。期望值不可為了讓程式通過而改
import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { loadCore } from './node-core.mjs';

const { ctx, ev: run } = loadCore();
ctx.performance = performance;
const ev = code => { const v = run(code); return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); };
const j = v => JSON.stringify(v);

const MINI = ['夢裡', '想起', '你的', '望著', '遠方', '時間', '留在', '這一', '笑著', '天亮', '熟悉', '街道', '前方', '不怕', '回到', '身邊', '我也', '終於', '我想', '走過', '心慌', '想到'];
const setWords = list => run('wordPhoneticMap = new Map(' + j(list.map(w => [w, 'ㄅ'])) + ')');
const ana = line => ev(`lhLineAnalyze(${j(line)})`);
const text = line => ev(`lhLineStructText(lhLineAnalyze(${j(line)}))`);
const parts = line => ev(`lhLineStructParts(lhLineAnalyze(${j(line)}))`);

// [輸入行, 字數, 各組字數, 顯示的結構文字]
const TABLE = [
    ['月光 灑在 窗前', 6, [2, 2, 2], '2+2+2'],
    ['夢裡想起你的臉', 7, [2, 2, 3], '7（2·2·3）'],
    ['我望著遠方的光', 7, [3, 4], '7（3·4）'],
    ['我想把時間留在這一天', 10, [3, 2, 2, 3], '10（3·2·2·3）'],
    ['走過熟悉的街道', 7, [2, 3, 2], '7（2·3·2）'],
    ['終於我也回到你身邊', 9, [2, 2, 3, 2], '9（2·2·3·2）'],
    ['你笑著說天亮', 6, [4, 2], '6（4·2）'],
    ['不怕前方的路遙', 7, [2, 5], '7（2·5）'],
    ['愛你到天亮', 5, [5], ''],
    ['好想好想你，嗎', 6, [5, 1], '5+1'],
    ['（Oh baby）', 2, [1, 1], '1+1'],
    ['Oh愛你到天亮', 6, [1, 5], '1+5'],
    ['夢裡想起你的臉，我望著遠方的光', 14, [2, 2, 3, 3, 4], '7（2·2·3）+7（3·4）'],
    ['月光 灑在 窗前 夢裡想起你的臉', 13, [2, 2, 2, 2, 2, 3], '2+2+2+7（2·2·3）'],
    ['夢裡想起你的臉 月光', 9, [2, 2, 3, 2], '7（2·2·3）+2'],
];

test('斷句：固定範例', () => {
    setWords(MINI);
    for (const [line, n, groups, shown] of TABLE) {
        const r = ana(line);
        expect(r.n, line).toBe(n);
        expect(r.groups, line).toEqual(groups);
        expect(text(line), line).toBe(shown);
    }
    for (const line of ['', '，。', '！', '   ', '　\t']) {
        const r = ana(line);
        expect(r.n, JSON.stringify(line)).toBe(0);
        expect(r.groups).toEqual([]);
        expect(text(line)).toBe('');
    }
});

test('斷句：猜的細分放括號裡', () => {
    setWords(MINI);
    const m = ana('月光 灑在 窗前 夢裡想起你的臉');
    expect(m.guess).toEqual([false, false, false, true, true, true]);
    expect(m.guessed).toBe(true);
    expect(parts('月光 灑在 窗前 夢裡想起你的臉')).toEqual([{ text: '2+2+2+7', guess: false }, { text: '（2·2·3）', guess: true }]);
    expect(ana('夢裡想起你的臉 月光').guess).toEqual([true, true, true, false]);
    expect(parts('夢裡想起你的臉 月光')).toEqual([{ text: '7', guess: false }, { text: '（2·2·3）', guess: true }, { text: '+2', guess: false }]);
    expect(parts('夢裡想起你的臉')).toEqual([{ text: '7', guess: false }, { text: '（2·2·3）', guess: true }]);
    expect(ana('月光 灑在 窗前').guess).toEqual([false, false, false]);
    expect(parts('月光 灑在 窗前')).toEqual([{ text: '2+2+2', guess: false }]);
    // 猜完只剩一組，不算猜
    for (const line of ['愛你到天亮', '好想好想你，嗎']) {
        const r = ana(line);
        expect(r.guess.every(g => g === false), line).toBe(true);
        expect(r.guessed, line).toBe(false);
    }
    // 猜的夾在中間
    expect(parts('夢裡想起你的臉 月光 夢裡想起你的臉').map(p => p.text)).toEqual(['7', '（2·2·3）', '+2+7', '（2·2·3）']);
    // 一致性：長度、旗標、文字
    for (const [line] of TABLE) {
        const r = ana(line), ps = parts(line);
        expect(r.guess.length, line).toBe(r.groups.length);
        expect(r.guessed, line).toBe(r.guess.some(Boolean));
        expect(text(line), line).toBe(ps.map(p => p.text).join(''));
        for (const p of ps) {
            if (p.guess) expect(p.text.startsWith('（'), line).toBe(true);
            expect(p.text.includes('≈'), line).toBe(false);
        }
    }
});

// 各種文字：漢字、假名、韓文、注音、帶撇號的英文、數字、emoji、各種空白與標點
const FUZZ = [
    '', ' ', '，。！？', '月光', '月光，灑在窗前', '月光 灑在　窗前', 'Hello world', "don't stop believin'", 'rock’n’roll 一起', '123 456 七八九',
    'こんにちは世界', 'ありがとう', 'カタカナ', '안녕하세요 사랑해', 'ㄅㄆㄇㄈ', 'ㄋㄧˇ ㄏㄠˇ', '我愛你😀你愛我', '😀😀😀', 'a1b2c3', 'abc123def',
    '夢裡想起你的臉，我望著遠方的光', '我想把時間留在這一天……', '——「引號」——', '（括號）［方括號］｛大括號｝', '終於我也回到你身邊\t再見', '\t\t', 'Oh愛你到天亮', '愛 你 到 天 亮',
    '夢裡想起你的臉夢裡想起你的臉夢裡想起你的臉', '想到想到想到想到想到', '一二三四五六七八九十', 'ABC一二三四五', '一二三四五ABC', 'x y z 一二三四五六七',
    '你好嗎？我很好！', '、、、', '㊗️快樂', '𠀀𠀁𠀂𠀃𠀄𠀅', '《歌名》第１句', '愛,你.到;天:亮', '愛​你到天亮', 'ｆｕｌｌ ｗｉｄｔｈ', '你的 臉', '好想好想你，嗎',
];

test('斷句：加總等於字數', () => {
    setWords(MINI);
    expect(FUZZ.length).toBeGreaterThanOrEqual(40);
    for (const line of FUZZ) {
        const r = ana(line);
        const count = ev(`lhCountWords(${j(line)})`);
        expect(r.n, JSON.stringify(line)).toBe(count);
        expect(r.groups.reduce((a, b) => a + b, 0), JSON.stringify(line)).toBe(count);
        expect(r.guess.length).toBe(r.groups.length);
    }
});

test('斷句：四字以內不猜', () => {
    // 詞庫裡有一堆詞，但片段只有 4 個單位以下，一律一組
    setWords([...MINI, '月光', '窗前', '灑在', '愛你', '到天', '天亮', '我愛', '你好']);
    for (const line of ['月光灑在', '愛你到天', '我愛你好', '夢裡想起', '想起你', '你']) {
        const r = ana(line);
        expect(r.groups, line).toEqual([Array.from(line).length]);
        expect(r.guessed, line).toBe(false);
    }
    // 片段之間有明確斷點時，各自照自己的長度判斷
    expect(ana('月光灑在 愛你到天').groups).toEqual([4, 4]);
});

test('斷句：詞庫還沒載好', () => {
    setWords([]);
    const r = ana('夢裡想起你的臉');
    expect(r.groups).toEqual([7]);
    expect(r.guessed).toBe(false);
    expect(text('夢裡想起你的臉')).toBe('');
    // 明確斷點照常
    expect(ana('月光 灑在 窗前').groups).toEqual([2, 2, 2]);
});

test('斷句：逐行與行號', () => {
    setWords(MINI);
    const rows = ev(`lhLineRows(${j('月光 灑在 窗前\n\n，。\r\n夢裡想起你的臉\r我望著遠方的光\n')})`);
    expect(rows.map(r => r.row)).toEqual([0, 3, 4]);
    expect(rows.map(r => r.n)).toEqual([6, 7, 7]);
    expect(rows.map(r => r.groups)).toEqual([[2, 2, 2], [2, 2, 3], [3, 4]]);
    expect(ev(`lhLineRows('')`)).toEqual([]);
});

test('對照：同類型第一段', () => {
    const key = s => ev(`lhLineGroupKey(${j(s)})`);
    expect(key({ type: 'verse', custom: '' })).toBe('verse');
    expect(key({ type: 'chorus', custom: 'x' })).toBe('chorus');
    expect(key({ type: 'custom', custom: ' Rap ' })).toBe('custom:Rap');
    const idx = secs => ev(`lhLineRefIndex(${j(secs)})`);
    const T = type => ({ type, custom: '' });
    expect(idx([T('verse'), T('chorus'), T('verse'), T('verse'), T('chorus')])).toEqual([-1, -1, 0, 0, 1]);
    expect(idx([])).toEqual([]);
    const C = custom => ({ type: 'custom', custom });
    expect(idx([C('Rap'), C(' Rap '), C('Hook'), C('Rap')])).toEqual([-1, 0, -1, 0]);
    // 特殊名稱和一般名稱一樣處理
    expect(idx([C('__proto__'), C('__proto__'), C('constructor'), C('constructor')])).toEqual([-1, 0, -1, 2]);
    expect(idx([T('verse'), C('verse')]), '自訂名稱 verse 不等於內建 Verse').toEqual([-1, -1]);
});

// 兩百行的耗時：真詞庫的第一塊（NDJSON）解析得出來就用它，否則用 mini 詞表（這裡的第一塊檔案存在，實際用真詞）
// 門檻乘 LH_PERF_SCALE（機器比 Mac 慢時調大）
test('斷句：兩百行在 20ms 內', () => {
    const f = 'data/wordlist-c00.json';
    let words = MINI;
    if (existsSync(f)) {
        try {
            words = readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l).w);
        } catch { words = MINI; }
    }
    run('wordPhoneticMap = new Map(' + j(words.map(w => [w, 'ㄅ'])) + ')');
    const SAMPLE = ['月光 灑在 窗前', '夢裡想起你的臉', '我望著遠方的光', '我想把時間留在這一天', '走過熟悉的街道', '月光 灑在 窗前 夢裡想起你的臉'];
    const lines = Array.from({ length: 200 }, (_, i) => SAMPLE[i % SAMPLE.length]).join('\n');
    const scale = Number(process.env.LH_PERF_SCALE || 1);
    const t = [];
    for (let i = 0; i < 9; i++) {
        const a = performance.now();
        run(`lhLineRows(${j(lines)})`);
        t.push(performance.now() - a);
    }
    t.sort((a, b) => a - b);
    expect(t[4], '中位數').toBeLessThan(20 * scale);
});

test('句構：手動／AI 指定、輸入解析、英文和漢字交界', () => {
    setWords(MINI);
    const st = j({ '夢裡想起你的臉': { g: [4, 3], src: 'man' } });
    const r = ev(`lhLineAnalyze('夢裡想起你的臉', undefined, ${st})`);
    expect(r.groups).toEqual([4, 3]);
    expect(r.src).toBe('man');
    expect(ev(`lhLineStructText(lhLineAnalyze('夢裡想起你的臉', undefined, ${st}))`)).toBe('7（4·3）');
    // 加總不對（歌詞改過）就當沒指定
    expect(ev(`lhLineAnalyze('夢裡想起你的臉', undefined, ${j({ '夢裡想起你的臉': { g: [4, 4] } })})`).src).toBe('auto');
    // 跨過明確斷點：平鋪
    expect(ev(`lhLineStructText(lhLineAnalyze('月光 灑在', undefined, ${j({ '月光 灑在': { g: [1, 3] } })}))`)).toBe('1+3');
    expect(ev(`lhLineParseStruct('4+4+11（4·2·3·2）', 19)`)).toEqual([4, 4, 4, 2, 3, 2]);
    expect(ev(`lhLineParseStruct('4 4 4·2·3·2', 19)`)).toEqual([4, 4, 4, 2, 3, 2]);
    expect(ev(`lhLineParseStruct('4+4', 9)`)).toBe(null);
    expect(ana('yo yo 麻雀in the house').groups).toEqual([1, 1, 2, 1, 1, 1]);
    expect(ana('麻雀in').starts).toEqual([0, 2]);
    expect(ev(`lhLineCleanStructs({ a: { g: [1, 2], src: 'ai' }, b: { g: [0] }, c: 3 })`)).toEqual({ a: { g: [1, 2], src: 'ai' } });
});
