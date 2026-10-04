// 純 Node 載入核心檔的共用工具：用 node:vm 載入拆出的 js/ 檔，搬出的程式碼一字不改
// 後續搬移計畫依原本順序把核心檔補進 CORE
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

export const CORE = ['js/phonetic-tables.js', 'js/dict.js', 'js/search.js', 'js/state.js', 'js/polyphonic.js', 'js/wordlist.js', 'js/candidates.js'];

// vm 回傳的是跨 realm 物件，先 JSON 往返再比對
export const pick = ev => code => JSON.parse(JSON.stringify(ev(code)));

export function loadCore() {
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
    // 與 init 相同的開機步驟；Math.random 固定讓洗牌可重現
    vm.runInContext('Math.random = () => 0; rhymeDict = window._rhymeDictData; buildIndex();', ctx);
    return { ctx, ev: code => vm.runInContext(code, ctx) };
}
