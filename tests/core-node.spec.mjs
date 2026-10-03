// 核心純邏輯在 Node 直接載入測試（不開瀏覽器）：用 node:vm 載入拆出的 js/ 檔，搬出的程式碼一字不改
// 後續搬移計畫依原本順序把核心檔補進 CORE
import { test, expect } from '@playwright/test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const CORE = ['js/phonetic-tables.js'];

function loadCore() {
    const quiet = () => {};
    const ctx = vm.createContext({
        console: { log: quiet, info: quiet, warn: quiet, error: console.error },
        // safety.js 需要 DOM／儲存空間；這裡只放核心檔會呼叫到的五個最小替身
        lhGet: () => null,
        lhGetJSON: (_k, fallback) => fallback,
        lhSet() {}, lhRemove() {}, lhWarn() {},
    });
    ctx.window = ctx;   // data/rhyme-dict.js 用 var 宣告，程式讀 window._rhymeDictData
    const run = f => vm.runInContext(readFileSync(f, 'utf8'), ctx, { filename: f });
    run('data/rhyme-dict.js');
    CORE.forEach(run);
    return { ctx, ev: code => vm.runInContext(code, ctx) };
}

test('core：純 Node 載入音韻表', () => {
    const { ev } = loadCore();
    // vm 回傳的是跨 realm 物件，先 JSON 往返再比對
    const get = code => JSON.parse(JSON.stringify(ev(code)));
    expect(get('zhuyinInitials.length')).toBe(21);
    expect(get("BORROW_MAP['ㄚ']")).toEqual(['ㄚ', 'ㄧㄚ', 'ㄨㄚ']);
    expect(get("fullZhuyinToPinyin['ㄅㄢ']")).toBe('ban');
    expect(get("fullPinyinToZhuyin['ban']")).toEqual(['ㄅㄢ']);
    expect(get("RHYME_TO_FAMILY['ㄧㄚ']")).toEqual(get("RHYME_TO_FAMILY['ㄚ']"));
});
