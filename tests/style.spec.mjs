// Phase 5 視覺一致性（05-09）：字重、字級、對比、hover、焦點框、顏色常數、減少動態
// 前半是不開瀏覽器的靜態掃描；後半在瀏覽器裡量計算後的樣式
import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { bootPage, settle } from './helpers.mjs';

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

// ---------- 05-09 Task 2：對比、hover、焦點框、顏色常數、減少動態 ----------
// 讀 html 上算出來的顏色變數，轉成 [r, g, b]
const readVars = page => page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const get = n => cs.getPropertyValue(n).trim();
    return { textPrimary: get('--text-primary'), textSecondary: get('--text-secondary'), containerBg: get('--container-bg'), cardBg: get('--card-bg'), highlight: get('--highlight-border') };
});
function rgbOf(value) {
    let m = value.match(/^#([0-9a-f]{6})$/i);
    if (m) return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
    m = value.match(/^#([0-9a-f]{3})$/i);
    if (m) return [...m[1]].map(c => parseInt(c + c, 16));
    m = value.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
    if (m) return [+m[1], +m[2], +m[3]];
    throw new Error('看不懂的顏色：' + value);
}
// WCAG 相對亮度與對比
const luminance = ([r, g, b]) => {
    const f = c => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a, b) => {
    const [hi, lo] = [luminance(rgbOf(a)), luminance(rgbOf(b))].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
};

test('視覺：晝夜預設主題文字對比 ≥ 4.5', async ({ browser }) => {
    const report = [];
    for (const [name, opts] of [['淺色', { colorScheme: 'light' }], ['深色', { storage: { hoyun_theme_mode: 'dark' } }]]) {
        const { context, page } = await bootPage(browser, { wordlist: 'stub', ...opts });
        expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe(name === '淺色' ? 'light' : 'dark');
        const v = await readVars(page);
        for (const t of ['textPrimary', 'textSecondary']) {
            for (const s of ['containerBg', 'cardBg']) {
                const ratio = contrast(v[t], v[s]);
                report.push(`${name} ${t}(${v[t]}) / ${s}(${v[s]}) = ${ratio.toFixed(2)}`);
                expect(ratio, `${name} ${t} 對 ${s} 對比 ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
            }
        }
        if (name === '淺色') expect(v.textSecondary.toLowerCase(), '淺色（R2：月光主題）次要文字色').toBe('#55686e');
        await context.close();
    }
    console.log('對比實測\n' + report.join('\n'));
    // 自檢：舊的 #6b778a 在 #eee3ce 上不到 4.5（證明量測抓得到問題）
    expect(contrast('#6b778a', '#eee3ce')).toBeLessThan(4.5);
});

test('視覺：沒存顏色時用預設底色', async ({ browser }) => {
    const light = await bootPage(browser, { wordlist: 'stub', colorScheme: 'light' });
    expect((await readVars(light.page)).containerBg.toLowerCase()).toBe('#fdf6e3');   // R2：淺色新使用者＝月光
    await light.context.close();
    // 夜間 UI 重設計：沒自訂時深色用 CSS 自己的深色預設（不再拿淺色反相）；有自訂才反相
    const dark = await bootPage(browser, { wordlist: 'stub', storage: { hoyun_theme_mode: 'dark' } });
    expect((await readVars(dark.page)).containerBg.toLowerCase()).toBe('#1f1f1f');   // R2：舊的深色＝素墨
    await dark.context.close();
    // 舊版存下來的預設色當成沒自訂（舊存檔也換得到新外觀）
    const legacy = await bootPage(browser, { wordlist: 'stub', storage: { containerBg: '#eee3ce' } });
    expect((await readVars(legacy.page)).containerBg.toLowerCase()).toBe('#fdf6e3');
    await legacy.context.close();
    const custom = await bootPage(browser, { wordlist: 'stub', storage: { hoyun_theme_mode: 'dark', containerBg: '#fffaf0' } });
    // R2：存過自訂顏色＝自訂主題，顏色照原樣、不再反相
    expect((await readVars(custom.page)).containerBg.toLowerCase()).toBe('#fffaf0');
    await custom.context.close();
});

test('視覺：主題優先順序（存的 > 系統 > 淺色）', async ({ browser }) => {
    const cases = [
        [undefined, 'light', 'light'], [undefined, 'dark', 'dark'],
        ['light', 'dark', 'light'], ['light', 'light', 'light'],
        ['dark', 'light', 'dark'], ['dark', 'dark', 'dark'],
    ];
    for (const [stored, scheme, expected] of cases) {
        const { context, page } = await bootPage(browser, { wordlist: 'stub', colorScheme: scheme, storage: stored ? { hoyun_theme_mode: stored } : {} });
        expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), `存的=${stored ?? '無'} 系統=${scheme}`).toBe(expected);
        await context.close();
    }
});

// 找出沒有被 @media (hover: hover) and (pointer: fine) 包住的 :hover 規則，回傳選擇器
function unguardedHover(css) {
    const t = stripCssComments(css);
    const stack = [];
    const bad = [];
    let start = 0;
    for (let i = 0; i < t.length; i++) {
        const c = t[i];
        if (c === '{') {
            const prelude = t.slice(start, i).trim();
            if (prelude.startsWith('@')) stack.push(/hover:\s*hover/.test(prelude) && /pointer:\s*fine/.test(prelude));
            else {
                const end = t.indexOf('}', i);
                if (prelude.includes(':hover') && !stack.some(Boolean)) bad.push(prelude);
                i = end;   // 跳過規則內容（沒有巢狀）
            }
            start = i + 1;
        } else if (c === '}') { stack.pop(); start = i + 1; }
        else if (c === ';') start = i + 1;
    }
    return bad;
}

test('視覺：hover 只給滑鼠', () => {
    let hoverRules = 0;
    for (const f of CSS_FILES) {
        const text = readFileSync(f, 'utf8');
        hoverRules += (stripCssComments(text).match(/:hover/g) || []).length;
        expect(unguardedHover(text), `${f} 有沒包進 (hover: hover) and (pointer: fine) 的 :hover`).toEqual([]);
    }
    expect(hoverRules, '前置：確實掃到 hover 規則').toBeGreaterThan(30);
    // 負向對照
    expect(unguardedHover('.a:hover { color: red; }\n@media (max-width: 440px) { .b:hover { color: red; } }')).toEqual(['.a:hover', '.b:hover']);
    expect(unguardedHover('@media (hover: hover) and (pointer: fine) { .a:hover { color: red; } }\n@media (max-width: 440px) { @media (hover: hover) and (pointer: fine) { .b:hover { color: red; } } }\n/* .c:hover { x: y } */')).toEqual([]);
});

test('視覺：Tab 鍵有清楚焦點框', async ({ browser }) => {
    const { context, page } = await bootPage(browser, { wordlist: 'stub', device: { viewport: { width: 1440, height: 900 } } });
    // 很多按鈕有 transition: all，焦點框會淡入；等過渡跑完再量
    const ring = () => page.evaluate(async () => {
        const el = document.activeElement;
        await Promise.all(el.getAnimations().map(a => a.finished.catch(() => {})));
        const cs = getComputedStyle(el);
        return { tag: el.tagName, id: el.id, cls: el.className, focusVisible: el.matches(':focus-visible'), style: cs.outlineStyle, width: parseFloat(cs.outlineWidth), color: cs.outlineColor,
            expect: getComputedStyle(document.documentElement).getPropertyValue('--highlight-border').trim() };
    });
    let buttons = 0;
    for (let i = 0; i < 12; i++) {
        await page.keyboard.press('Tab');
        const r = await ring();
        if (r.tag !== 'BUTTON') continue;
        buttons++;
        expect(r.focusVisible, `${r.cls || r.id} 要是 :focus-visible`).toBe(true);
        expect(r.style, `${r.cls || r.id} 焦點框樣式`).toBe('solid');
        expect(r.width, `${r.cls || r.id} 焦點框寬度`).toBeGreaterThanOrEqual(2);
        expect(rgbOf(r.color), `${r.cls || r.id} 焦點框顏色`).toEqual(rgbOf(r.expect));
    }
    expect(buttons, '前置：12 次 Tab 裡至少停在 3 個按鈕').toBeGreaterThanOrEqual(3);
    // 破音字 chip（搜尋「樂」才會出現）：從搜尋框用鍵盤 Tab 過去
    await page.fill('#searchInput', '樂');
    await settle(page);
    await page.focus('#searchInput');
    let reached = null;
    const walked = [];
    for (let i = 0; i < 40 && !reached; i++) {
        await page.keyboard.press('Tab');
        const r = await ring();
        walked.push(r.id || r.cls || r.tag);
        if (/poly-chip/.test(r.cls)) reached = r;
    }
    expect(reached, '用 Tab 能走到破音字 chip，走過：' + walked.join(' > ')).not.toBeNull();
    expect(reached.style).toBe('solid');
    expect(reached.width).toBeGreaterThanOrEqual(2);
    expect(rgbOf(reached.color)).toEqual(rgbOf(reached.expect));
    await context.close();
});

test('視覺：沒有新的顏色常數', () => {
    const lit = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g;
    const norm = s => s.toLowerCase().replace(/\s+/g, '');
    // Phase 7 UI-SPEC 的 --action-bg-hover 色票（只出現在 css/base.css 的變數定義）
    const allow = new Set(['#5a6577', '#4c51bf']);
    for (const f of CSS_FILES) {
        // 078c5d1 之後才新增的樣式表（css/print.css）當時不存在，沒有舊色票可以加進白名單
        let old = '';
        try { old = execFileSync('git', ['show', `078c5d1:${f}`], { encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { old = ''; }
        for (const m of old.matchAll(lit)) allow.add(norm(m[0]));
    }
    expect(allow.size, '前置：舊樣式表的白名單不是空的').toBeGreaterThan(40);
    const isScrim = n => /^rgba\(0,0,0,[0-9.]+\)$/.test(n);
    // 列印檔印出來一律黑字白底，只有 css/print.css 可以直接寫 #000／#fff（Phase 8，UI-SPEC §4.3）
    const allowedIn = (set, file, n) => set.has(n) || isScrim(n) || (file === 'css/print.css' && (n === '#000' || n === '#fff'));
    // Phase 8 UI-SPEC D-09：破壞性動作的色票只准寫在宣告 --danger-* 變數的那一行
    const DANGER_HEX = new Set(['#c53030', '#9b2c2c', '#fc8181']);
    const extra = [];
    for (const f of CSS_FILES) {
        for (const line of cssText(f).split('\n')) {
            // 夜間 UI 重設計：新的色票只准寫在 base.css 的設計變數宣告（:root／[data-theme="dark"]），元件一律用 var()
            if (f === 'css/base.css' && /^\s*--[\w-]+\s*:/.test(line)) continue;
            const declaresDanger = /--danger-[a-z-]+\s*:/.test(line);
            for (const m of line.matchAll(lit)) {
                const n = norm(m[0]);
                if (declaresDanger && DANGER_HEX.has(n)) continue;
                if (!allowedIn(allow, f, n)) extra.push(`${f}: ${m[0]}`);
            }
        }
    }
    expect(extra, '新增了白名單以外的顏色常數（請改用既有顏色變數）').toEqual([]);
    // 自檢：白名單外的顏色會被抓到；#000 只放過 css/print.css
    expect(allow.has('#123456') || isScrim('rgba(1,2,3,0.5)')).toBe(false);
    expect(allowedIn(new Set(), 'css/panels.css', '#000'), '其他檔案的 #000 仍要被抓到').toBe(false);
    expect(allowedIn(new Set(), 'css/print.css', '#000')).toBe(true);
    // 危險色只在 --danger-* 的宣告行內放行：同樣的色票寫在別的規則裡仍會被抓到
    const lineExtra = line => [...line.matchAll(lit)].map(m => norm(m[0])).filter(n => !(/--danger-[a-z-]+\s*:/.test(line) && DANGER_HEX.has(n)) && !allowedIn(new Set(), 'css/panels.css', n));
    expect(lineExtra('--danger-bg: #c53030;')).toEqual([]);
    expect(lineExtra('.x { color: #c53030; }')).toEqual(['#c53030']);
});

test('視覺：系統要求減少動態時不播動畫', async ({ browser }) => {
    const { context, page } = await bootPage(browser, { wordlist: 'stub', device: { reducedMotion: 'reduce' } });
    await page.fill('#searchInput', 'ㄢ');
    await settle(page);
    const r = await page.evaluate(() => {
        const names = sel => [...document.querySelectorAll(sel)].flatMap(el => el.getAnimations().filter(a => a.animationName).map(a => a.animationName));
        const dur = sel => { const el = document.querySelector(sel); return el ? getComputedStyle(el).transitionDuration.split(',').map(s => s.trim()) : null; };
        const toSec = s => (s.endsWith('ms') ? parseFloat(s) / 1000 : parseFloat(s));
        return {
            container: names('.container'), grid: names('.results-grid'),
            gridCount: document.querySelectorAll('.results-grid').length,
            sidePanel: dur('.side-panel')?.map(toSec), backdrop: dur('.mobile-backdrop')?.map(toSec),
        };
    });
    expect(r.gridCount, '前置：搜尋後有結果格').toBeGreaterThan(0);
    expect(r.container, '.container 沒有跑中的動畫').toEqual([]);
    expect(r.grid, '.results-grid 沒有跑中的動畫').toEqual([]);
    for (const d of [...r.sidePanel, ...r.backdrop]) expect(d).toBeLessThanOrEqual(0.01);
    await context.close();
    // 對照：沒要求減少動態時，.container 的進場動畫確實存在
    const normal = await bootPage(browser, { wordlist: 'stub', device: { reducedMotion: 'no-preference' } });
    const anim = await normal.page.evaluate(() => getComputedStyle(document.querySelector('.container')).animationName);
    expect(anim).toBe('slideIn');
    await normal.context.close();
});

test('視覺：字卡動畫只動位置與陰影、保留區提示一致', async ({ browser }) => {
    expect(/\.char-card\s*\{[^}]*transition:\s*all/.test(cssText('css/base.css')), '.char-card 不可 transition: all').toBe(false);
    const { context, page } = await bootPage(browser, { wordlist: 'stub' });
    await page.fill('#searchInput', 'ㄢ');
    await settle(page);
    const props = await page.evaluate(() => getComputedStyle(document.querySelector('.char-card')).transitionProperty.split(',').map(s => s.trim()).sort());
    expect(props).toEqual(['border-color', 'box-shadow', 'transform']);
    // 保留區空的時候，index.html 與 js/panels.js 的提示字一樣
    const EMPTY = '點擊上方詞彙保留';
    expect(readFileSync('index.html', 'utf8')).toContain(EMPTY);
    expect(readFileSync('js/panels.js', 'utf8')).toContain(EMPTY);
    expect(readFileSync('index.html', 'utf8')).not.toContain('點擊詞彙保留');
    expect(await page.locator('#savedWordsContainer').textContent()).toContain(EMPTY);
    await context.close();
});

test('視覺：行動色只在變數定義裡', () => {
    // 行動色（夜間 UI 重設計：亮色墨色 #2a2724、暗色米白 #ebe6dc）只能出現在 base.css 宣告變數的那幾行（Phase 7 UI-SPEC §3.1）
    const bad = [];
    let defs = 0;
    for (const f of CSS_FILES) {
        cssText(f).split('\n').forEach((line, i) => {
            if (f === 'css/base.css' && /--action-bg(-hover)?\s*:/.test(line)) { defs++; return; }
            if (!/#2a2724|#ebe6dc/i.test(line)) return;
            if (f === 'css/base.css' && /^\s*--[\w-]+\s*:/.test(line)) return;   // 同一個色票也是暗色的主文字色
            bad.push(`${f}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(bad, '行動色出現在變數定義以外的地方（請改用 var(--action-bg)／var(--action-bg-hover)）').toEqual([]);
    expect(defs, '亮色、暗色與四個 R2 主題各定義 --action-bg 與 --action-bg-hover').toBe(12);
});

test('視覺：Phase 7 沒有新的動畫', () => {
    // @keyframes 的數量要和 Phase 7 的起點（commit 952d24f）一樣
    const count = text => (stripCssComments(text).match(/@keyframes\b/g) || []).length;
    const before = CSS_FILES.reduce((n, f) => {
        try { return n + count(execFileSync('git', ['show', `952d24f:${f}`], { encoding: 'utf8', maxBuffer: 1 << 26 })); } catch { return n; }   // 起點之後才新增的檔案算 0
    }, 0);
    const now = CSS_FILES.reduce((n, f) => n + count(readFileSync(f, 'utf8')), 0);
    expect(before, '前置：起點有讀到 @keyframes').toBeGreaterThan(0);
    expect(now, '本階段不能新增 @keyframes').toBe(before);
});
