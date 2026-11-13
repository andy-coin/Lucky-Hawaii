// 自由畫布的純函式（js/sections-core.js）：推開、位置與排版模式正規化、預設排列；不開瀏覽器，用 node:vm 單獨載入
import { test, expect } from '@playwright/test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const ctx = vm.createContext({});
vm.runInContext(readFileSync('js/sections-core.js', 'utf8'), ctx, { filename: 'js/sections-core.js' });
const ev = code => JSON.parse(JSON.stringify(vm.runInContext(code, ctx)));
const j = v => JSON.stringify(v);
const R = (x, y, w = 100, h = 100) => ({ x, y, w, h });
const xy = out => out.map(r => [r.x, r.y]);
const ov = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// 輸入用 JS 字面量寫進 vm（NaN／Infinity 過不了 JSON）；回傳 { out, same }，same＝輸入沒被改
function run(inputCode, fixed, maxIter) {
    return JSON.parse(vm.runInContext(`(() => {
        const input = ${inputCode};
        const before = JSON.stringify(input);
        const out = lhCanvasPushApart(input, ${fixed}${maxIter === undefined ? '' : ', ' + maxIter});
        return JSON.stringify({ out, same: JSON.stringify(input) === before, inFixed: input[${fixed}] });
    })()`, ctx));
}
const push = (rects, fixed = 0, maxIter) => run(j(rects), fixed, maxIter);

// 每個案例都要過：不重疊、全部有限、x／y ≥ 0、輸入沒被改
function check(res, n) {
    const { out, same } = res;
    expect(same).toBe(true);
    expect(out.length).toBe(n);
    for (const r of out) {
        expect([r.x, r.y, r.w, r.h].every(Number.isFinite)).toBe(true);
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeGreaterThanOrEqual(0);
    }
    for (let i = 0; i < out.length; i++) for (let k = i + 1; k < out.length; k++) expect(ov(out[i], out[k])).toBe(false);
}

test('推開：沒重疊不動；右、下、左、上、不會變負、連鎖', () => {
    let r = push([R(0, 0), R(200, 0)]); check(r, 2); expect(xy(r.out)).toEqual([[0, 0], [200, 0]]);
    r = push([R(0, 0), R(90, 0)]); check(r, 2); expect(xy(r.out)[1]).toEqual([124, 0]);
    r = push([R(0, 0), R(0, 90)]); check(r, 2); expect(xy(r.out)[1]).toEqual([0, 124]);
    r = push([R(300, 0), R(220, 0)]); check(r, 2); expect(xy(r.out)[1]).toEqual([176, 0]);
    r = push([R(50, 0), R(0, 0)]); check(r, 2); expect(xy(r.out)[1]).toEqual([0, 124]);
    r = push([R(0, 200), R(0, 150)]); check(r, 2); expect(xy(r.out)[1]).toEqual([0, 76]);
    r = push([R(0, 0), R(90, 0), R(200, 0)]); check(r, 3); expect(xy(r.out)).toEqual([[0, 0], [124, 0], [248, 0]]);
});

test('推開：畫布實際案例（推開、被壓到往上、堆疊、次數 1 的保底、決定性）', () => {
    let r = push([R(324, 24, 360, 200), R(408, 24, 360, 200), R(24, 248, 360, 200)]);
    check(r, 3); expect(xy(r.out)).toEqual([[324, 24], [408, 248], [24, 248]]);
    r = push([R(124, 324, 360, 200), R(408, 24, 360, 200), R(24, 248, 360, 200)]);
    check(r, 3); expect(xy(r.out)).toEqual([[124, 324], [408, 24], [24, 100]]);
    r = push(Array(8).fill(R(0, 0)));
    check(r, 8); expect(r.out.map(o => o.x)).toEqual([0, 124, 248, 372, 496, 620, 744, 868]); expect(r.out.every(o => o.y === 0)).toBe(true);
    r = push(Array(4).fill(R(0, 0)), 0, 1);
    check(r, 4); expect(xy(r.out)).toEqual([[0, 0], [124, 124], [124, 248], [124, 0]]);
    expect(j(push(Array(30).fill(R(0, 0))).out)).toBe(j(push(Array(30).fill(R(0, 0))).out));
});

test('推開：退化輸入都會結束、不重疊、座標有限', () => {
    let r = push([R(0, 0, 0, 0), R(0, 0)]); check(r, 2); expect(xy(r.out)).toEqual([[0, 0], [0, 0]]);
    r = push([R(5, 5, 0, 0), R(5, 5, 0, 0)]); check(r, 2); expect(xy(r.out)).toEqual([[5, 5], [5, 5]]);
    r = run('[{x:0,y:0,w:100,h:100}, {x:NaN,y:Infinity,w:100,h:100}, {x:-Infinity,y:0,w:Infinity,h:100}]', 0);
    check(r, 3); expect(r.out.map(o => [o.x, o.y, o.w, o.h])).toEqual([[0, 0, 100, 100], [124, 0, 100, 100], [0, 0, 0, 100]]);
    r = run("[{x:0,y:0,w:100,h:100}, {x:'a',y:null,w:1e9,h:-5}, {x:1e12,y:1e12,w:100,h:100}]", 0);
    check(r, 3); expect(r.out.map(o => [o.x, o.y, o.w, o.h])).toEqual([[0, 0, 100, 100], [0, 0, 2400, 0], [100000, 100000, 100, 100]]);
    r = push(Array(30).fill(R(0, 0)));
    check(r, 30); expect(xy(r.out.slice(0, 5))).toEqual([[0, 0], [124, 0], [248, 0], [372, 0], [496, 0]]);
    r = push(Array(40).fill(R(0, 0, 360, 200)));
    check(r, 40);
});

test('預設高度與預設排列', () => {
    expect(ev(`lhCanvasDefaultH('a')`)).toBe(156);
    expect(ev(`lhCanvasDefaultH('a\\nb\\nc\\nd\\ne')`)).toBe(212);
    expect(ev(`lhCanvasDefaultH('')`)).toBe(156);
    expect(ev(`lhCanvasDefaultH(${j(Array(40).fill('x').join('\n'))})`)).toBe(600);
    const L = secs => ev(`lhCanvasLayout(${j(secs)}).map(r => [r.x, r.y, r.w, r.h])`);
    expect(L([{ text: 'a' }, { text: 'a\nb\nc\nd\ne' }, { text: '' }, { text: 'x' }]))
        .toEqual([[24, 24, 360, 156], [408, 24, 360, 212], [792, 24, 360, 156], [24, 260, 360, 156]]);
    expect(L([{ text: '', pos: { x: 0, y: 0, w: 200, h: 500 } }, { text: 'a' }, { text: 'b' }]))
        .toEqual([[0, 0, 200, 500], [24, 524, 360, 156], [408, 524, 360, 156]]);
    expect(L([{ text: 'a', pos: { x: 'a' } }])).toEqual([[24, 24, 360, 156]]);
    // 回傳新物件：改結果不影響輸入
    expect(ev(`(() => { const s = [{ text: 'a', pos: { x: 1, y: 2, w: 200, h: 100 } }]; const r = lhCanvasLayout(s); r[0].x = 999; return s[0].pos.x; })()`)).toBe(1);
});

test('lhSecPosClean／lhCanvasClean：壞值回預設、乾淨後再整理不變', () => {
    const P = (v, raw) => ev(`lhSecPosClean(${raw ? v : j(v)})`);
    expect(P({ x: 10.4, y: 20.6, w: 300, h: 200 })).toEqual({ x: 10, y: 21, w: 300, h: 200 });
    expect(P({ x: -5, y: 0, w: 50, h: 1e7 })).toEqual({ x: 0, y: 0, w: 160, h: 2400 });
    expect(P({ x: 1e9, y: 0, w: 300, h: 200 }).x).toBe(100000);
    expect(P({ x: 1, y: 2, w: 300, h: 200, extra: 1 })).toEqual({ x: 1, y: 2, w: 300, h: 200 });
    for (const bad of [null, [], 'x', { x: '1', y: 1, w: 1, h: 1 }, { x: 1, y: 1, w: 1 }]) expect(P(bad)).toBeNull();
    expect(P('{x:NaN,y:1,w:1,h:1}', true)).toBeNull();
    const C = v => ev(`lhCanvasClean(${j(v)})`);
    expect(C({ mode: 'free', zoom: 1.5, panX: -30 })).toEqual({ mode: 'free' });
    expect(C({ mode: 'x' })).toEqual({ mode: 'snap' });
    expect(C({})).toEqual({ mode: 'snap' });
    for (const bad of [null, [], 'free']) expect(C(bad)).toBeNull();
    // 存的就是整理過的樣子
    for (const v of [{ mode: 'free', zoom: 2 }, {}, { mode: 'x' }]) { const c = C(v); expect(C(c)).toEqual(c); }
    for (const v of [{ x: 10.4, y: 20.6, w: 300, h: 200 }, { x: -5, y: 0, w: 50, h: 1e7 }]) { const c = P(v); expect(P(c)).toEqual(c); }
});

test('lhSecFinalize／lhSecFields：pos 整理、沒有就不留欄位', () => {
    const fin = secs => ev(`lhSecFinalize(${j(secs)})`);
    const a = fin([{ id: 'a', label: '', text: '', collapsed: false, pos: { x: 1.6, y: 2, w: 300, h: 200 } }]);
    expect(a[0].pos).toEqual({ x: 2, y: 2, w: 300, h: 200 });
    const b = fin([{ id: 'a', label: '', text: '', collapsed: false, pos: { x: 'bad' } }]);
    expect('pos' in b[0]).toBe(false);
    const c = fin([{ id: 'a', label: '', text: '', collapsed: false }]);
    expect('pos' in c[0]).toBe(false);
    expect(Object.keys(ev(`lhSecFields({ type: 'verse', label: '' })`)).sort()).toEqual(['color', 'custom', 'height', 'type']);
});
