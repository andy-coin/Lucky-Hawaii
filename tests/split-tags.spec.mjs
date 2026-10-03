// index.html 標籤一致性測試（不開瀏覽器）：同一個 ?v=、每個 js/css 檔剛好被引用一次、載入順序、同步載入、檔案編碼
// 防止部署時新舊檔混用、漏掉檔案、順序被改掉
import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

// 原本 inline script 由上到下的 20 個區塊（safety.js 另外固定在最前面）
const JS_ORDER = [
    'phonetic-tables', 'dict', 'search', 'state', 'polyphonic', 'cards', 'lyrics', 'wordlist', 'panels', 'rhyme-display',
    'ai-client', 'candidates', 'ai-generate', 'ui-common', 'results', 'search-ui', 'theme', 'init', 'report', 'ai-word-events',
].map(n => `js/${n}.js`);
const CSS_ORDER = ['css/base.css', 'css/panels.css', 'css/responsive.css'];

const html = readFileSync('index.html', 'utf8');
const scriptTags = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g)].map(m => ({ tag: m[0], src: m[1] }));
const linkTags = [...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>/g)].map(m => ({ tag: m[0], src: m[1] }));
const isLocal = r => /^(js|css)\//.test(r.src);
const local = [...scriptTags, ...linkTags].filter(isLocal);
const pathOf = r => r.src.split('?')[0];
const listDir = dir => (existsSync(dir) ? readdirSync(dir) : []);

test('split：本機 js/css 都帶同一個 ?v=', () => {
    const versions = local.map(r => new URLSearchParams(r.src.split('?')[1] ?? '').get('v'));
    expect(versions.every(v => v), '每個本機 js/css 都要有非空的 ?v=').toBe(true);
    expect([...new Set(versions)], '所有本機標籤共用同一個版本號').toHaveLength(1);
});

test('split：js/、css/ 每個檔剛好被引用一次', () => {
    const paths = local.map(pathOf);
    expect(paths.length, '重複引用').toBe(new Set(paths).size);
    const onDisk = [...listDir('js').filter(f => f.endsWith('.js')).map(f => `js/${f}`),
        ...listDir('css').filter(f => f.endsWith('.css')).map(f => `css/${f}`)];
    expect([...paths].sort(), '引用的檔案與資料夾內容不一致').toEqual(onDisk.sort());
    for (const p of paths) expect(existsSync(p), `${p} 不存在`).toBe(true);
});

test('split：safety.js 最先、其餘照原本順序', () => {
    const js = scriptTags.filter(isLocal).filter(r => r.src.startsWith('js/')).map(pathOf);
    expect(js[0]).toBe('js/safety.js');
    const rest = js.slice(1);
    expect(rest).toEqual(JS_ORDER.slice(0, rest.length));   // 前綴比對：每個中間 commit 都成立
    const css = linkTags.filter(isLocal).map(pathOf);
    expect(css).toEqual(CSS_ORDER.slice(0, css.length));
});

test('split：拆檔完成，index.html 只剩骨架', () => {
    const js = scriptTags.filter(isLocal).filter(r => r.src.startsWith('js/')).map(pathOf);
    expect(js.slice(1), '完整 20 個 js 依序').toEqual(JS_ORDER);
    expect(linkTags.filter(isLocal).map(pathOf), '完整 3 個 css 依序').toEqual(CSS_ORDER);
    const inline = [...html.matchAll(/<script\b([^>]*)>/g)].filter(m => !/\bsrc\s*=/.test(m[1]));
    expect(inline.length, '不可有沒有 src 的 script').toBe(0);
    expect(/<style\b/i.test(html), '不可有 style 元素').toBe(false);
});

test('split：本機 script 一律同步載入', () => {
    for (const r of scriptTags.filter(isLocal)) {
        expect(r.tag, `${r.src} 不可帶 defer／async／module`).not.toMatch(/\b(defer|async)\b|type\s*=\s*["']?module/i);
    }
});

test('split：檔案編碼 UTF-8 無 BOM、只用 LF', () => {
    for (const [dir, ext] of [['js', '.js'], ['css', '.css']]) {
        for (const f of listDir(dir).filter(n => n.endsWith(ext))) {
            const text = readFileSync(`${dir}/${f}`, 'utf8');
            expect(text.charCodeAt(0), `${dir}/${f} 開頭不可有 BOM`).not.toBe(0xFEFF);
            expect(text.includes('\r'), `${dir}/${f} 不可含 CR`).toBe(false);
        }
    }
});

test('split：css/base.css 第一條規則是 Google Fonts @import', () => {
    // @import 若排在任何規則之後，瀏覽器會直接忽略（字型就不會載入）
    const text = readFileSync('css/base.css', 'utf8').replace(/^(\s|\/\*[\s\S]*?\*\/)+/, '');
    expect(text.startsWith("@import url('https://fonts.googleapis.com/")).toBe(true);
});

test('split：樣式表都在 <head>、排在所有 script 前', () => {
    const headEnd = html.indexOf('</head>');
    const firstScript = html.indexOf('<script');
    for (const r of linkTags.filter(isLocal)) {
        const pos = html.indexOf(r.tag);
        expect(pos, `${r.src} 要在 </head> 之前`).toBeLessThan(headEnd);
        expect(pos, `${r.src} 要在第一個 script 之前`).toBeLessThan(firstScript);
    }
});

test('split：樣式表沒有相對路徑 url()', () => {
    // 連結進來的樣式表，相對路徑會以 css/ 為基準而不是頁面，會悄悄壞掉
    for (const f of listDir('css').filter(n => n.endsWith('.css'))) {
        const text = readFileSync(`css/${f}`, 'utf8');
        for (const m of text.matchAll(/url\(\s*(['"]?)([^'")]*)\1\s*\)/g)) {
            expect(m[2], `css/${f} 有相對路徑 url(${m[2]})`).toMatch(/^(https:\/\/|data:)/);
        }
    }
});
