// 靜態掃描共用工具：用 acorn 把 index.html 的 inline script 與 js/**/*.js 解析成 AST
// 之後的 plan（空 catch 掃描等）也共用這份
import * as acorn from 'acorn';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

// 只取沒有 src 的 <script>；lineOffset = 內文之前的行數，回報的行號才會對得上真實檔案
function inlineScripts(html) {
    const out = [];
    const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
    let m;
    while ((m = re.exec(html))) {
        const bodyStart = m.index + m[0].indexOf('>') + 1;
        out.push({ code: m[1], lineOffset: html.slice(0, bodyStart).split('\n').length - 1 });
    }
    return out;
}

function jsFiles(dir) {
    if (!existsSync(dir)) return [];
    return readdirSync(dir).flatMap(name => {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) return jsFiles(p);
        return name.endsWith('.js') ? [p] : [];
    });
}

// 根目錄每個 *.html 的 inline script（不含 admin/、history version/）＋ js/**/*.js（沒有 js/ 就是空）
export function collectSources(root = process.cwd()) {
    const out = [];
    for (const name of readdirSync(root).filter(n => n.endsWith('.html')).sort()) {
        for (const s of inlineScripts(readFileSync(join(root, name), 'utf8'))) out.push({ file: name, ...s });
    }
    for (const p of jsFiles(join(root, 'js')).sort()) {
        out.push({ file: relative(root, p), code: readFileSync(p, 'utf8'), lineOffset: 0 });
    }
    return out;
}

// 之後的檔案可能改成 ES module，script 解析失敗就改用 module 再試一次
export function parseAny(code) {
    try { return acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'script', locations: true }); }
    catch { return acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module', locations: true }); }
}

// 遞迴走訪，visit(node, ancestors)；略過 loc
export function walk(node, visit, ancestors = []) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(n => walk(n, visit, ancestors)); return; }
    if (typeof node.type === 'string') {
        visit(node, ancestors);
        ancestors = [...ancestors, node];
    }
    for (const k in node) if (k !== 'loc') walk(node[k], visit, ancestors);
}

const isFn = n => n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression';

// 最近的外層函式名稱：函式宣告的名字，或把函式指給變數時的變數名
function enclosingFnName(ancestors) {
    for (let i = ancestors.length - 1; i >= 0; i--) {
        const a = ancestors[i];
        if (!isFn(a)) continue;
        if (a.id) return a.id.name;
        const parent = ancestors[i - 1];
        if (parent && parent.type === 'VariableDeclarator' && parent.id.type === 'Identifier') return parent.id.name;
        return null;
    }
    return null;
}

const STORAGE_CALLS = new Set(['lhGet', 'lhGetJSON', 'lhSet', 'lhRemove']);
const isLocalStorageRef = n => (n.type === 'Identifier' && n.name === 'localStorage') ||
    (n.type === 'MemberExpression' && !n.computed && n.property.name === 'localStorage' &&
        n.object.type === 'Identifier' && n.object.name === 'window');

// kind 'call'：lhGet/lhGetJSON/lhSet/lhRemove 呼叫（keyNode = 第一個參數）；kind 'direct'：直接碰 localStorage
export function findStorageUsages(ast) {
    const out = [];
    walk(ast, (node, ancestors) => {
        if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && STORAGE_CALLS.has(node.callee.name)) {
            out.push({ kind: 'call', fnName: node.callee.name, keyNode: node.arguments[0] || null,
                line: node.loc.start.line, enclosingFn: enclosingFnName(ancestors) });
        } else if (node.type === 'MemberExpression' && isLocalStorageRef(node.object)) {
            out.push({ kind: 'direct', fnName: null, keyNode: null,
                line: node.loc.start.line, enclosingFn: enclosingFnName(ancestors) });
        }
    });
    return out;
}

// 頂層 `const NAME = 'literal'`
export function topLevelStringConsts(ast) {
    const m = new Map();
    for (const st of ast.body) {
        if (st.type !== 'VariableDeclaration' || st.kind !== 'const') continue;
        for (const d of st.declarations) {
            if (d.id.type === 'Identifier' && d.init && d.init.type === 'Literal' && typeof d.init.value === 'string') {
                m.set(d.id.name, d.init.value);
            }
        }
    }
    return m;
}

// 字串 → literal；樣板字串 → prefix（第一段 quasi）；有登記的頂層常數 → literal；其餘 unresolved
export function resolveKey(keyNode, consts) {
    if (!keyNode) return { type: 'unresolved', value: null };
    if (keyNode.type === 'Literal' && typeof keyNode.value === 'string') return { type: 'literal', value: keyNode.value };
    if (keyNode.type === 'TemplateLiteral') return { type: 'prefix', value: keyNode.quasis[0].value.cooked };
    if (keyNode.type === 'Identifier' && consts.has(keyNode.name)) return { type: 'literal', value: consts.get(keyNode.name) };
    return { type: 'unresolved', value: null };
}

// 吞錯規則（D-10）：catch 本體或 .catch(回呼) 裡沒有任何函式呼叫、也沒有 throw，就是吞錯
// NewExpression 不算回報（`.catch(() => { x = new Map(); })` 仍會被抓）；註解不是 AST 節點，所以只有註解的 catch 自然被抓
// ponytail: 呼叫任何不相干的函式就會放行；`.then(ok, fail)` 的第二個參數不檢查。要更嚴再限定 lhWarn/showToast/console.*
function reports(node) {
    let found = false;
    walk(node, n => { if (n.type === 'CallExpression' || n.type === 'ThrowStatement') found = true; });
    return found;
}

export function findSwallowedCatches(ast) {
    const out = [];
    walk(ast, node => {
        if (node.type === 'CatchClause' && !reports(node.body)) {
            out.push({ line: node.loc.start.line, shape: 'catch' });
        } else if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' &&
            !node.callee.computed && node.callee.property.name === 'catch') {
            const cb = node.arguments[0];
            if (cb && (cb.type === 'ArrowFunctionExpression' || cb.type === 'FunctionExpression') && !reports(cb.body)) {
                out.push({ line: node.loc.start.line, shape: '.catch' });
            }
        }
    });
    return out;
}

// 全部來源的違規，格式 file:line，依檔名再依行號排序
export function scanCatches(sources) {
    const hits = [];
    for (const src of sources) {
        for (const h of findSwallowedCatches(parseAny(src.code))) hits.push({ file: src.file, line: h.line + src.lineOffset });
    }
    return hits
        .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
        .map(h => `${h.file}:${h.line}`);
}
