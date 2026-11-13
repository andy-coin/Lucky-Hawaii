// 程式碼掃描：儲存鍵必須在 js/safety.js 的清單內，而且只能透過 safety.js 的函式存取
import { test, expect } from '@playwright/test';
import { bootPage } from './helpers.mjs';
import { collectSources, parseAny, findStorageUsages, topLevelStringConsts, resolveKey, scanCatches } from './scan-lib.mjs';

const SAFETY_FILE = 'js/safety.js';
// 動態鍵只允許出現在這些函式裡，執行時另由 lhAssertKnownKey 檢查
const DYNAMIC_KEY_FUNCS = {
    handleColorChange: '鍵值由呼叫端傳入四個顏色鍵之一，執行時由 lhAssertKnownKey 檢查',
    lhHasCustomColors: '鍵值來自 js/theme.js 固定的 LH_OLD_DEFAULTS（四個顏色鍵），執行時由 lhAssertKnownKey 檢查',
    loadColors: '鍵值來自 js/theme.js 固定的 LH_COLOR_VARS（四個顏色鍵），執行時由 lhAssertKnownKey 檢查',
};

const sortHits = hits => hits.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
const fmt = hits => sortHits(hits).map(h => `${h.file}:${h.line} ${h.why}`);

// 規則一：每個 call 的鍵都要登記過
function findUnregisteredKeys(sources, reg) {
    const known = new Set([...reg.LH_KEYS.map(k => k.key), ...reg.LH_META_KEYS]);
    const prefixes = new Set(reg.LH_KEY_PREFIXES.map(p => p.prefix));
    const hits = [];
    for (const src of sources) {
        if (src.file === SAFETY_FILE) continue;
        const ast = parseAny(src.code);
        const consts = topLevelStringConsts(ast);
        for (const u of findStorageUsages(ast)) {
            if (u.kind !== 'call') continue;
            const r = resolveKey(u.keyNode, consts);
            let why = null;
            if (r.type === 'literal' && !known.has(r.value)) why = `未登記的鍵 ${r.value}`;
            else if (r.type === 'prefix' && !prefixes.has(r.value)) why = `未登記的前綴 ${r.value}`;
            else if (r.type === 'unresolved' && !DYNAMIC_KEY_FUNCS[u.enclosingFn]) why = '無法解析的鍵（且不在 DYNAMIC_KEY_FUNCS 內）';
            if (why) hits.push({ file: src.file, line: u.line + src.lineOffset, why });
        }
    }
    return hits;
}

// 規則二：safety.js 以外不可直接碰 localStorage
function findDirectAccess(sources) {
    const hits = [];
    for (const src of sources) {
        if (src.file === SAFETY_FILE) continue;
        for (const u of findStorageUsages(parseAny(src.code))) {
            if (u.kind === 'direct') hits.push({ file: src.file, line: u.line + src.lineOffset, why: '直接存取 localStorage' });
        }
    }
    return hits;
}

const readRegistry = page => page.evaluate(() => ({ LH_KEYS, LH_KEY_PREFIXES, LH_META_KEYS, LH_EXCLUDED_KEYS }));

test('registry: 程式碼用到的每個儲存鍵都在清單內', async ({ browser }) => {
    const { context, page } = await bootPage(browser, {});
    const reg = await readRegistry(page);
    await context.close();
    const sources = collectSources();
    expect(sources.length).toBeGreaterThan(0);
    expect(fmt(findUnregisteredKeys(sources, reg))).toEqual([]);
});

test('registry: js/safety.js 以外不可直接存取 localStorage', () => {
    expect(fmt(findDirectAccess(collectSources()))).toEqual([]);
});

test('registry: 後台金鑰被排除且不在清單內', async ({ browser }) => {
    const { context, page } = await bootPage(browser, {});
    const reg = await readRegistry(page);
    await context.close();
    expect(reg.LH_EXCLUDED_KEYS).toEqual(expect.arrayContaining(['haoYunQi_admin_key', 'haoYunQi_admin_theme']));
    const keys = reg.LH_KEYS.map(k => k.key);
    for (const k of reg.LH_EXCLUDED_KEYS) expect(keys).not.toContain(k);
    expect(keys).toHaveLength(25);   // R2 主題加入 lh:bgFx，寬螢幕版面加入 lh:dock
    expect(new Set(keys).size).toBe(25);
});

test('registry: 掃描器自我檢查', () => {
    const reg = {
        LH_KEYS: [{ key: 'haiku_lyrics' }],
        LH_META_KEYS: [],
        LH_KEY_PREFIXES: [{ prefix: 'apiKey_' }],
    };
    const src = (file, code) => [{ file, code, lineOffset: 0 }];
    // 沒登記的鍵要被抓到
    expect(findUnregisteredKeys(src('a.html', "lhSet('brandNewKey', '1');"), reg)).toHaveLength(1);
    // 非 safety 檔直接碰 localStorage 要被抓到（含 window.localStorage）
    expect(findDirectAccess(src('a.html', "localStorage.setItem('haiku_lyrics', '1');"))).toHaveLength(1);
    expect(findDirectAccess(src('a.html', "window.localStorage.getItem('x');"))).toHaveLength(1);
    // 已登記的字面值、已登記前綴的樣板字串、頂層常數都不該被誤報
    expect(findUnregisteredKeys(src('a.html', "lhGet('haiku_lyrics');"), reg)).toEqual([]);
    expect(findUnregisteredKeys(src('a.html', 'lhSet(`apiKey_${p}`, v);'), reg)).toEqual([]);
    expect(findUnregisteredKeys(src('a.html', "const K = 'haiku_lyrics'; lhGet(K);"), reg)).toEqual([]);
    // 動態鍵：只有白名單函式內可以
    expect(findUnregisteredKeys(src('a.html', 'function foo(k) { lhSet(k, 1); }'), reg)).toHaveLength(1);
    expect(findUnregisteredKeys(src('a.html', 'function handleColorChange(k) { lhSet(k, 1); }'), reg)).toEqual([]);
});

// ---- 吞錯 catch 規則（D-10）----
const fx = (file, code) => ({ file, code, lineOffset: 0 });

test('catch: 掃描器抓得到四種吞錯寫法', () => {
    const code = [
        'try { a(); } catch {}',                              // 1 沒有綁定的空 catch
        'try { a(); } catch (e) { /* 註解 */ }',               // 2 只有註解
        'function f() {',                                     // 3
        '    try { a(); } catch (_) { return; }',             // 4 只有 return
        '}',                                                  // 5
        'p.catch(() => {});',                                 // 6 空的 .catch 回呼
    ].join('\n');
    expect(scanCatches([fx('fixture.js', code)])).toEqual(['fixture.js:1', 'fixture.js:2', 'fixture.js:4', 'fixture.js:6']);
});

test('catch: 有呼叫或重新丟出的 catch 不算吞錯', () => {
    const code = [
        "try { a(); } catch (e) { lhWarn('x', e); }",
        'try { a(); } catch (e) { throw e; }',
        'p.catch(e => fallback(e));',
    ].join('\n');
    expect(scanCatches([fx('fixture.js', code)])).toEqual([]);
});

test('catch: 沒有違規時回報為空', () => {
    expect(scanCatches([fx('clean.js', 'const a = 1;\nfunction g() { return a; }')])).toEqual([]);
});

test('catch: 多個違規全部列出並依檔名與行號排序', () => {
    const b = fx('b.js', '\n\n\n\ntry { a(); } catch (e) {}');                         // 第 5 行
    const a = fx('a.js', '\ntry { a(); } catch (e) {}\n\n\n\n\ntry { a(); } catch (e) {}'); // 第 2、7 行
    expect(scanCatches([b, a])).toEqual(['a.js:2', 'a.js:7', 'b.js:5']);
});

test('catch: 程式碼裡沒有吞錯的 catch', () => {
    const sources = collectSources();
    expect(sources.length).toBeGreaterThan(0);
    // 失敗時會列出每個違規的 file:line
    expect(scanCatches(sources)).toEqual([]);
});
