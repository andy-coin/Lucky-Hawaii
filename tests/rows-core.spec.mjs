// 吸附分列的純函式（js/sections-core.js）：lhRowsOf／lhRowsZone／lhRowsDrop／lhRowsApply，以及 align／rj 欄位整理
import { test, expect } from '@playwright/test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const ctx = vm.createContext({});
vm.runInContext(readFileSync('js/sections-core.js', 'utf8'), ctx, { filename: 'js/sections-core.js' });
const ev = code => JSON.parse(JSON.stringify(vm.runInContext(code, ctx)));
const j = v => JSON.stringify(v);
const drop = (rows, s, d, z) => ev(`lhRowsDrop(${j(rows)}, ${j(s)}, ${j(d)}, ${j(z)})`);

test('分列：沒有旗標＝每段一列；rj＝和前一段同列；第一段的 rj 無效', () => {
    const secs = [{ id: 'a', rj: true }, { id: 'b' }, { id: 'c', rj: true }, { id: 'd', rj: true }];
    expect(ev(`lhRowsOf(${j(secs)})`)).toEqual([['a'], ['b', 'c', 'd']]);
    expect(ev(`lhRowsOf(${j([{ id: 'a' }, { id: 'b' }])})`)).toEqual([['a'], ['b']]);
});

test('分列：落點判斷（邊距 < 0.25 取最近邊，否則中間）', () => {
    const z = (x, y) => ev(`lhRowsZone({x:0,y:0,w:100,h:100}, ${x}, ${y})`);
    expect([z(50, 50), z(10, 50), z(90, 50), z(50, 10), z(50, 90), z(10, 20)]).toEqual(['center', 'left', 'right', 'top', 'bottom', 'left']);
});

test('分列：拖放規則', () => {
    const R = [['a'], ['b'], ['c']];
    // 中間＝互換
    expect(drop(R, 'a', 'c', 'center')).toEqual([['c'], ['b'], ['a']]);
    // 右邊＝加進那一列（使用者的例子：verse2 拖到 verse1 右邊、verse3 拖到 verse2 右邊）
    const r1 = drop(R, 'b', 'a', 'right');
    expect(r1).toEqual([['a', 'b'], ['c']]);
    expect(drop(r1, 'c', 'b', 'right')).toEqual([['a', 'b', 'c']]);
    // 左邊
    expect(drop([['a', 'b'], ['c']], 'c', 'a', 'left')).toEqual([['c', 'a', 'b']]);
    // 同一列裡拖到另一張的中間＝互換；上下＝另開一列
    expect(drop([['a', 'b', 'c']], 'a', 'c', 'center')).toEqual([['c', 'b', 'a']]);
    expect(drop([['a', 'b', 'c']], 'b', 'a', 'top')).toEqual([['b'], ['a', 'c']]);
    expect(drop([['a', 'b', 'c']], 'b', 'c', 'bottom')).toEqual([['a', 'c'], ['b']]);
    // 沒變、自己、找不到、一列已滿（4 張）＝null
    expect(drop(R, 'a', 'b', 'top')).toBeNull();
    expect(drop(R, 'a', 'a', 'center')).toBeNull();
    expect(drop(R, 'a', 'zz', 'left')).toBeNull();
    expect(drop([['a', 'b', 'c', 'd'], ['e']], 'e', 'a', 'left')).toBeNull();
});

test('分列：寫回段落（順序＋rj 旗標），壞輸入不動', () => {
    const secs = [{ id: 'a' }, { id: 'b' }, { id: 'c', rj: true }];
    const out = ev(`(() => { const s = ${j(secs)}; const ok = lhRowsApply(s, [['c', 'a'], ['b']]); return { ok, s }; })()`);
    expect(out.ok).toBe(true);
    expect(out.s).toEqual([{ id: 'c' }, { id: 'a', rj: true }, { id: 'b' }]);
    const bad = ev(`(() => { const s = ${j(secs)}; const ok = lhRowsApply(s, [['a'], ['b']]); return { ok, s }; })()`);
    expect(bad.ok).toBe(false);
    expect(bad.s).toEqual(secs);
});

test('欄位整理：align 只收 center／right，rj 只收 true，第一段不留 rj', () => {
    const f = o => ev(`lhSecFields(${j(o)})`);
    expect(f({ align: 'center' }).align).toBe('center');
    expect(f({ align: 'left' }).align).toBeUndefined();
    expect(f({ align: 'x' }).align).toBeUndefined();
    expect(f({ rj: true }).rj).toBe(true);
    expect(f({ rj: 'yes' }).rj).toBeUndefined();
    const fin = ev(`lhSecFinalize(${j([{ id: 'a', rj: true, align: 'left' }, { id: 'b', rj: true, align: 'right' }])})`);
    expect('rj' in fin[0]).toBe(false);
    expect('align' in fin[0]).toBe(false);
    expect(fin[1].rj).toBe(true);
    expect(fin[1].align).toBe('right');
});
