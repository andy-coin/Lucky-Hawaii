// 段落模組的純函式（js/sections-core.js）：不開瀏覽器，用 node:vm 單獨載入這一支檔
import { test, expect } from '@playwright/test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

// 全新的空環境：檔案若偷用了 document、window 或別支檔的全域，載入或呼叫時就會丟 ReferenceError
const ctx = vm.createContext({});
vm.runInContext(readFileSync('js/sections-core.js', 'utf8'), ctx, { filename: 'js/sections-core.js' });
// vm 回傳的是跨 realm 物件，先 JSON 往返再比對
const ev = code => JSON.parse(JSON.stringify(vm.runInContext(code, ctx)));
const j = v => JSON.stringify(v);

test('名稱：推斷表', () => {
    const verse = ['', '歌詞', '新段落', '段落', '主歌', '主歌2', '主歌 二', 'Verse', 'verse 2', 'VERSE II', 'Verse iv', '  verse  '];
    for (const l of verse) expect(ev(`lhInferSecType(${j(l)})`), l).toEqual({ type: 'verse', custom: '' });
    expect(ev('lhInferSecType(undefined)')).toEqual({ type: 'verse', custom: '' });
    expect(ev('lhInferSecType(123)')).toEqual({ type: 'verse', custom: '' });
    expect(ev('lhInferSecType(null)')).toEqual({ type: 'verse', custom: '' });
    const table = {
        '副歌': 'chorus', 'Chorus': 'chorus',
        'Pre-Chorus': 'prechorus', 'pre chorus 1': 'prechorus', 'Prechorus': 'prechorus', '預副歌': 'prechorus', '導歌': 'prechorus',
        '間奏': 'inter', 'Interlude': 'inter', '橋段': 'bridge', 'Bridge': 'bridge',
        '尾奏': 'outro', '結尾': 'outro', '前奏': 'intro', 'Intro 1': 'intro',
    };
    for (const [l, t] of Object.entries(table)) expect(ev(`lhInferSecType(${j(l)})`), l).toEqual({ type: t, custom: '' });
    // 認不得的一律 Custom，原名（去頭尾空白）保留
    for (const l of ['A段', '副歌（重複）', 'Chorus x2', '甲', '<b>x</b>', 'Hook', 'Vi', 'Mix']) {
        expect(ev(`lhInferSecType(${j(l)})`), l).toEqual({ type: 'custom', custom: l });
    }
});

test('名稱：欄位整理丟掉壞值', () => {
    const f = o => ev(`lhSecFields(${j(o)})`);
    expect(f({ type: 'chorus', label: 'x', color: 'red;x' }).color).toBe('');
    expect(f({ color: '#E05D5D' }).color).toBe('#e05d5d');
    expect(f({ color: '#fff' }).color).toBe('');
    expect(f({ color: '#12345' }).color).toBe('');
    expect(f({ color: 'red; background:url(x)' }).color).toBe('');
    expect(f({ height: 999 }).height).toBeNull();
    expect(f({ height: 3.9 }).height).toBeNull();
    expect(f({ height: '20' }).height).toBeNull();
    expect(f({ height: null }).height).toBeNull();
    expect(f({ height: 12.34 }).height).toBe(12.3);
    expect(f({ height: 4 }).height).toBe(4);
    expect(f({ height: 60 }).height).toBe(60);
    // 高度 NaN 在 JSON 裡會變 null，這裡直接在 vm 內呼叫
    expect(ev('lhSecFields({ height: NaN }).height')).toBeNull();
    expect(ev('lhSecFields({ height: Infinity }).height')).toBeNull();
    // 壞類型改用 label 推斷；原型鍵也一樣
    expect(f({ type: '__proto__', label: '副歌' }).type).toBe('chorus');
    expect(f({ type: 'constructor', label: '' }).type).toBe('verse');
    expect(f({ type: 'solo', label: 'Hook' })).toMatchObject({ type: 'custom', custom: 'Hook' });
    // 合法類型保留，custom 超過 40 字元只留 40（以字元計，不是 UTF-16 單位）
    expect(f({ type: 'custom', custom: 'x'.repeat(41) }).custom).toBe('x'.repeat(40));
    const ext = '𠀀'.repeat(41);
    expect(Array.from(f({ type: 'custom', custom: ext }).custom)).toHaveLength(40);
    expect(Array.from(f({ label: ext }).custom)).toHaveLength(40);
    // 缺欄位的舊段落
    expect(f({ label: '主歌' })).toEqual({ type: 'verse', custom: '', color: '', height: null });
});

test('名稱：羅馬數字', () => {
    const t = { 1: 'I', 4: 'IV', 9: 'IX', 14: 'XIV', 40: 'XL', 1999: 'MCMXCIX' };
    for (const [n, r] of Object.entries(t)) expect(ev(`lhToRoman(${n})`), n).toBe(r);
});

test('名稱：編號', () => {
    const names = types => ev(`lhSecNames(${j(types)})`);
    const T = (type, custom = '') => ({ type, custom });
    // 同類型兩段以上才編號；Custom 不編號；相鄰的同類型也各自編號
    expect(names([T('verse'), T('verse'), T('chorus'), T('verse'), T('custom', 'Hook'), T('inter'), T('inter')]))
        .toEqual(['Verse I', 'Verse II', 'Chorus', 'Verse III', 'Hook', 'Inter I', 'Inter II']);
    expect(names([T('custom', '')])).toEqual(['Custom']);
    expect(names([T('custom', '  ')])).toEqual(['Custom']);
    expect(names([T('chorus')])).toEqual(['Chorus']);
    expect(names([T('prechorus'), T('custom', 'A'), T('custom', 'A')])).toEqual(['Pre-Chorus', 'A', 'A']);
    // 順序決定編號：換位置後編號跟著走
    expect(names([T('chorus'), T('verse'), T('chorus')])).toEqual(['Chorus I', 'Verse', 'Chorus II']);
});

test('名稱：整理兩次結果相同', () => {
    const src = [
        { id: 'a', label: '主歌', text: '一' }, { id: 'b', label: '', text: '二' }, { id: 'c', label: 'Hook', text: '三' },
        { id: 'd', type: 'chorus', color: '#ABCDEF', height: 10.25, label: '亂寫', text: '四' },
    ];
    const once = ev(`lhSecFinalize(${j(src)})`);
    expect(once.map(s => s.label)).toEqual(['Verse I', 'Verse II', 'Hook', 'Chorus']);
    expect(once[3]).toMatchObject({ color: '#abcdef', height: 10.3 });
    const twice = ev(`lhSecFinalize(lhSecFinalize(${j(src)}))`);
    expect(j(twice)).toBe(j(once));
    // 歌詞文字與 id 完全不動
    expect(once.map(s => [s.id, s.text])).toEqual(src.map(s => [s.id, s.text]));
    // 空陣列不炸
    expect(ev('lhSecFinalize([])')).toEqual([]);
});

test('名稱：下一段類型', () => {
    const next = t => ev(`lhNextSecType(${t === undefined ? 'undefined' : j(t)})`);
    expect(next('verse')).toBe('prechorus');
    expect(next('prechorus')).toBe('chorus');
    expect(next('chorus')).toBe('verse');
    for (const t of ['bridge', 'custom', 'intro', 'inter', 'outro', undefined]) expect(next(t), String(t)).toBe('verse');
});

test('名稱：常數', () => {
    expect(ev('LH_SEC_TYPES')).toEqual(['intro', 'verse', 'prechorus', 'chorus', 'inter', 'bridge', 'outro', 'custom']);
    expect(ev('[LH_SEC_CUSTOM_MAX, LH_SEC_H_MIN, LH_SEC_H_MAX]')).toEqual([40, 4, 60]);
    expect(ev('LH_SEC_TYPES.every(t => LH_SEC_TYPE_SET.has(t) && typeof LH_SEC_NAMES[t] === "string")')).toBe(true);
    expect(ev('LH_SEC_KEY2TYPE.has("__proto__") || LH_SEC_KEY2TYPE.has("constructor")')).toBe(false);
});
