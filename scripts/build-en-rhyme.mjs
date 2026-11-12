// 英文押韻字表：CMU Pronouncing Dictionary（BSD-2，授權見 data/third-party/CMUDICT-LICENSE）→ data/en-rhyme.json
// 只留每個字「最後一個母音＋後面的子音」（不含重音數字），依它分組：{ "AW S": "house mouse …" }。
// 用法：node scripts/build-en-rhyme.mjs <cmudict.dict 路徑>
import { readFileSync, writeFileSync } from 'node:fs';
const VOW = /^(AA|AE|AH|AO|AW|AY|EH|ER|EY|IH|IY|OW|OY|UH|UW)\d$/;
const out = {};
for (const ln of readFileSync(process.argv[2], 'utf8').split('\n')) {
    const [w, ...ph] = ln.replace(/#.*/, '').trim().split(/\s+/);
    if (!w || !/^[a-z]+('[a-z]+)?$/.test(w) || w.length > 14) continue;   // 跳過 (2) 這類替代讀音、縮寫、太長的字
    let v = ph.length - 1;
    while (v >= 0 && !VOW.test(ph[v])) v--;
    if (v < 0) continue;
    const key = [ph[v].slice(0, 2), ...ph.slice(v + 1)].join(' ');
    (out[key] ||= []).push(w);
}
const o = {};
for (const k of Object.keys(out).sort()) o[k] = out[k].join(' ');
writeFileSync(new URL('../data/en-rhyme.json', import.meta.url), JSON.stringify(o));
console.log(Object.keys(o).length, 'keys');
