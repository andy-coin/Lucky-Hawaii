// Phase 5 視覺一致性（05-09）：字重、字級、對比、hover、焦點框、顏色常數、減少動態
// 前半是不開瀏覽器的靜態掃描；後半在瀏覽器裡量計算後的樣式
import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';

const CSS_FILES = readdirSync('css').filter(f => f.endsWith('.css')).sort().map(f => `css/${f}`);
// 去掉註解（註解裡的舊規則不算數）
const stripCssComments = text => text.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
const cssText = f => stripCssComments(readFileSync(f, 'utf8'));

// 抓出所有「屬性: 值」宣告的值（含寫在同一行的多個宣告）
function declarations(text, prop) {
    const re = new RegExp(`(?:^|[;{\\s])${prop}\\s*:\\s*([^;}]+)`, 'g');
    return [...text.matchAll(re)].map(m => ({ value: m[1].trim(), index: m.index }));
}

test('視覺：只用 400／700 兩種字重', () => {
    let seen = 0;
    for (const f of CSS_FILES) {
        for (const d of declarations(cssText(f), 'font-weight')) {
            seen++;
            const v = d.value.replace(/\s*!important$/, '');
            expect(['400', '700'], `${f} 有 font-weight: ${d.value}`).toContain(v);
        }
    }
    expect(seen, '前置：至少掃到幾十個 font-weight').toBeGreaterThan(20);
});

test('視覺：最小字級 0.75rem', () => {
    let seen = 0;
    for (const f of CSS_FILES) {
        for (const d of declarations(cssText(f), 'font-size')) {
            // 只比對寫死的數字；calc/clamp/max/var 與 em、% 以外層字級為準，不在這裡比
            const m = d.value.match(/^([0-9.]+)(rem|px)\b/);
            if (!m) continue;
            seen++;
            const px = m[2] === 'rem' ? Number(m[1]) * 16 : Number(m[1]);
            expect(px, `${f} 有 font-size: ${d.value}（小於 12px）`).toBeGreaterThanOrEqual(12);
        }
    }
    expect(seen, '前置：有掃到寫死的字級').toBeGreaterThan(40);
});

test('視覺：掃描器自檢（會抓到 500 字重與 0.7rem 字級）', () => {
    const bad = stripCssComments('.a { font-weight: 500; }\n.b { font-size: 0.7rem; }\n/* .c { font-weight: 300 } */');
    expect(declarations(bad, 'font-weight').map(d => d.value)).toEqual(['500']);
    expect(declarations(bad, 'font-size').map(d => d.value)).toEqual(['0.7rem']);
});
