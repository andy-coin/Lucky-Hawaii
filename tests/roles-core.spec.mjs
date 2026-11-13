// 角色標記的純函式（js/sections-core.js）：不開瀏覽器，用 node:vm 單獨載入這一支檔
import { test, expect } from '@playwright/test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const ctx = vm.createContext({});
vm.runInContext(readFileSync('js/sections-core.js', 'utf8'), ctx, { filename: 'js/sections-core.js' });
const ev = code => JSON.parse(JSON.stringify(vm.runInContext(code, ctx)));
const j = v => JSON.stringify(v);
const M = l => l.map(([a, b, r]) => ({ a, b, r }));
const shift = (marks, o, n, caret) => ev(`lhMarksShift(${j(M(marks))}, ${j(o)}, ${j(n)}, ${caret === undefined ? 'undefined' : caret})`);

// [名稱, 舊字, 新字, 游標（編輯後插入文字的尾端）, 舊標記, 期望標記]
const CASES = [
    ['前面插入', 'abcdef', 'XYabcdef', 2, [[2, 4, 'x']], [[4, 6, 'x']]],
    ['中間插入會長大', 'abcdef', 'abZcdef', 3, [[1, 4, 'x']], [[1, 5, 'x']]],
    ['起點邊界插入不拉長', 'abcdef', 'aZbcdef', 2, [[1, 4, 'x']], [[2, 5, 'x']]],
    ['終點邊界插入不拉長', 'abcdef', 'abcdZef', 5, [[1, 4, 'x']], [[1, 4, 'x']]],
    ['重複字：標記起點打愛', '愛愛', '愛愛愛', 2, [[1, 2, 'x']], [[2, 3, 'x']]],
    ['重複字：標記終點打愛', '愛愛', '愛愛愛', 3, [[1, 2, 'x']], [[1, 2, 'x']]],
    ['重複字：標記內部打愛', '愛愛愛', '愛愛愛愛', 2, [[0, 3, 'x']], [[0, 4, 'x']]],
    ['同一新字：游標 4', '我愛你你愛我', '我愛你你你愛我', 4, [[3, 6, 'f']], [[4, 7, 'f']]],
    ['同一新字：游標 5', '我愛你你愛我', '我愛你你你愛我', 5, [[3, 6, 'f']], [[3, 7, 'f']]],
    ['兩標記：游標 4', '我愛你你愛我', '我愛你你你愛我', 4, [[0, 3, 'm'], [3, 6, 'f']], [[0, 3, 'm'], [4, 7, 'f']]],
    ['兩標記：游標 3（打在男裡面）', '我愛你你愛我', '我愛你你你愛我', 3, [[0, 3, 'm'], [3, 6, 'f']], [[0, 4, 'm'], [4, 7, 'f']]],
    ['刪起點邊緣：刪第一個字', '愛愛愛', '愛愛', 0, [[0, 1, 'a'], [1, 3, 'b']], [[0, 2, 'b']]],
    ['刪起點邊緣：刪 B 的第一個字', '愛愛愛', '愛愛', 1, [[0, 1, 'a'], [1, 3, 'b']], [[0, 1, 'a'], [1, 2, 'b']]],
    ['刪終點邊緣：刪標記內最後一字', '愛愛愛', '愛愛', 1, [[0, 2, 'x']], [[0, 1, 'x']]],
    ['刪終點邊緣：刪標記後面那字', '愛愛愛', '愛愛', 2, [[0, 2, 'x']], [[0, 2, 'x']]],
    ['跨邊界刪除', 'AAABBB', 'AABB', 2, [[0, 3, 'a'], [3, 6, 'b']], [[0, 2, 'a'], [2, 4, 'b']]],
    ['跨邊界取代', 'AAABBB', 'AAZBB', 3, [[0, 3, 'a'], [3, 6, 'b']], [[0, 2, 'a'], [3, 5, 'b']]],
    ['整段取代（兩標記）', 'AAABBB', 'ZZ', 2, [[0, 3, 'a'], [3, 6, 'b']], []],
    ['整段取代（單一標記沿用角色）', 'AAABBB', 'ZZ', 2, [[0, 6, 'a']], [[0, 2, 'a']]],
    ['無游標退回比對', 'abcdef', 'abZcdef', undefined, [[1, 4, 'x']], [[1, 5, 'x']]],
    ['游標超出退回比對', 'abcdef', 'abZcdef', 99, [[1, 4, 'x']], [[1, 5, 'x']]],
    ['游標對不上退回比對', 'abcdef', 'abZcdef', 1, [[1, 4, 'x']], [[1, 5, 'x']]],
    ['代理對（有游標）', 'a\u{20000}b', 'a\u{20001}b', 3, [[3, 4, 'x'], [1, 3, 'y']], [[1, 3, 'y'], [3, 4, 'x']]],
    ['代理對（無游標）', 'a\u{20000}b', 'a\u{20001}b', undefined, [[3, 4, 'x'], [1, 3, 'y']], [[1, 3, 'y'], [3, 4, 'x']]],
];
for (const [name, o, n, caret, marks, exp] of CASES) {
    test('平移：' + name, () => { expect(shift(marks, o, n, caret)).toEqual(M(exp)); });
}

test('平移：文字沒變或沒有標記回傳同一個參考', () => {
    expect(ev(`(() => { const m = [{ a: 0, b: 1, r: 'x' }]; return lhMarksShift(m, 'ab', 'ab', 1) === m; })()`)).toBe(true);
    expect(ev(`lhMarksShift(null, 'ab', 'abc', 3)`)).toBe(null);
    expect(ev(`(() => { const m = []; return lhMarksShift(m, 'ab', 'abc', 3) === m; })()`)).toBe(true);
});

test('lhMarksSet：指定、清除、合併', () => {
    const set = (m, a, b, r) => ev(`lhMarksSet(${j(M(m))}, ${a}, ${b}, ${j(r)})`);
    expect(set([[0, 8, 'x']], 2, 5, 'y')).toEqual(M([[0, 2, 'x'], [2, 5, 'y'], [5, 8, 'x']]));
    expect(set([[0, 8, 'x']], 2, 5, null)).toEqual(M([[0, 2, 'x'], [5, 8, 'x']]));
    expect(set([[0, 2, 'x'], [5, 8, 'x']], 2, 5, 'x')).toEqual(M([[0, 8, 'x']]));
    expect(set([[0, 2, 'x']], 3, 3, 'y')).toEqual(M([[0, 2, 'x']]));
    expect(set([[0, 2, 'x']], 5, 3, 'y')).toEqual(M([[0, 2, 'x']]));
    expect(ev(`lhMarksSet(undefined, 1, 3, 'y')`)).toEqual(M([[1, 3, 'y']]));
});

test('lhMarksClean：壞值丟掉、截長度、修重疊、合併', () => {
    const clean = (raw, len, ids) => ev(`lhMarksClean(${j(raw)}, ${len}, new Set(${j(ids)}))`);
    expect(clean('x', 5, ['x'])).toEqual([]);
    expect(clean([null, 1, 'a', { a: 1.5, b: 3, r: 'x' }, { a: -1, b: 3, r: 'x' }, { a: 3, b: 3, r: 'x' }, { a: 0, b: 2, r: 'zz' }], 9, ['x'])).toEqual([]);
    expect(clean([{ a: 2, b: 99, r: 'x' }], 5, ['x'])).toEqual(M([[2, 5, 'x']]));
    expect(clean([{ a: 6, b: 9, r: 'x' }], 5, ['x'])).toEqual([]);
    expect(clean([{ a: 3, b: 6, r: 'y' }, { a: 0, b: 4, r: 'x' }], 9, ['x', 'y'])).toEqual(M([[0, 4, 'x'], [4, 6, 'y']]));
    expect(clean([{ a: 0, b: 2, r: 'x' }, { a: 2, b: 4, r: 'x' }], 9, ['x'])).toEqual(M([[0, 4, 'x']]));
    const many = Array.from({ length: 6000 }, (_, i) => ({ a: i * 2, b: i * 2 + 1, r: 'x' }));
    expect(clean(many, 20000, ['x']).length).toBe(5000);
});

test('lhRolesClean：上限、壞 id、壞色、空名', () => {
    const clean = raw => ev(`lhRolesClean(${j(raw)})`);
    expect(clean('x')).toEqual([]);
    expect(clean(undefined)).toEqual([]);
    const ten = Array.from({ length: 10 }, (_, i) => ({ id: 'r' + i, name: 'n' + i, color: '#112233' }));
    expect(clean(ten).length).toBe(8);
    const r = clean([{ id: 'a', name: '  ', color: 'red' }, { id: 'a', name: 'dup', color: '#111111' }, { id: 'bad id!', name: 'x', color: '#111111' }, null,
        { id: 'b', name: '長'.repeat(30), color: '#ABCDEF' }]);
    expect(r.map(x => x.id)).toEqual(['a', 'b']);
    expect(r[0].name).toBe('角色 1');
    expect(r[0].color).toBe(ev('LH_ROLE_COLORS[0]'));
    expect(Array.from(r[1].name).length).toBe(20);
    expect(r[1].color).toBe('#abcdef');
});

test('lhSongRolesFix：沒有角色就沒有標記也不多欄位；有角色留有效標記', () => {
    const fix = s => ev(`lhSongRolesFix(${j(s)})`);
    const a = fix({ sections: [{ text: 'abc', marks: [{ a: 0, b: 1, r: 'x' }] }] });
    expect('roles' in a).toBe(false);
    expect('marks' in a.sections[0]).toBe(false);
    const b = fix({ sections: [{ text: 'abc' }] });
    expect(Object.keys(b)).toEqual(['sections']);
    expect(Object.keys(b.sections[0])).toEqual(['text']);
    const c = fix({ roles: [{ id: 'x', name: '男', color: '#4a7fd4' }], sections: [{ text: 'abc', marks: [{ a: 0, b: 2, r: 'x' }, { a: 1, b: 3, r: 'nope' }] }, { text: 'z' }] });
    expect(c.roles.length).toBe(1);
    expect(c.sections[0].marks).toEqual(M([[0, 2, 'x']]));
    expect('marks' in c.sections[1]).toBe(false);
});
