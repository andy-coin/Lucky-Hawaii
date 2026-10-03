// 拆檔逐字比對工具 — 用法：node tests/verify-split.mjs <基準 commit> [index.html 路徑，預設 index.html]
// 把拆出的檔按 index.html 的標籤順序接回去，必須與基準 commit 的 inline <script>／<style> 本文逐字相同。
// 只在「由上往下」搬移時有效；不是 *.spec，所以 npm test 不會跑它（後續 phase 會合法修改搬出的程式碼）。
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { stripHtmlComments } from './html-lib.mjs';

// 相對路徑（index.html、js/、css/）一律以 repo 根目錄為基準，不受執行時所在目錄影響
process.chdir(fileURLToPath(new URL('..', import.meta.url)));

const baseRef = process.argv[2];
if (!baseRef) {
    console.log('用法：node tests/verify-split.mjs <基準 commit>（例：node tests/verify-split.mjs 2f2d248）');
    process.exit(2);
}

// argv 形式呼叫 git（不經 shell）；基準 commit 由開發者自己提供
// 先去掉 HTML 註解：被註解掉的標籤瀏覽器不會載入，不能算進比對
const base = stripHtmlComments(execFileSync('git', ['show', `${baseRef}:index.html`], { encoding: 'utf8', maxBuffer: 1 << 26 }));
const now = stripHtmlComments(readFileSync(process.argv[3] ?? 'index.html', 'utf8'));

// 只抓沒有 src= 的 inline 標籤
const INLINE = tag => `<${tag}(?![^>]*\\bsrc=)[^>]*>([\\s\\S]*?)</${tag}>`;
const baseBody = tag => {
    const m = new RegExp(INLINE(tag)).exec(base);
    if (!m) { console.log(`基準 commit ${baseRef} 沒有 inline <${tag}>（是不是給了拆檔之後的 commit？）`); process.exit(2); }
    return m[1];
};

// 依出現順序：外部檔（js/ 或 css/，safety.js 不算）貼檔案內容，沒搬完的 inline 貼本文。
// inline 本文開頭會多一個緊接在標籤後的換行，貼上前去掉恰好一個，否則每個中間狀態都會多出一行空白
function assemble(srcPattern, tag) {
    let out = '';
    for (const m of now.matchAll(new RegExp(`${srcPattern}|${INLINE(tag)}`, 'g'))) {
        if (m[1] !== undefined && m[2] === undefined) out += readFileSync(m[1], 'utf8');
        else out += (m[2] ?? '').replace(/^\r?\n/, '');
    }
    return out;
}

const js = assemble('<script src="(js/(?!safety\\.js)[^"?]+)(?:\\?[^"]*)?"></script>', 'script');
const css = assemble('<link rel="stylesheet" href="(css/[^"?]+)(?:\\?[^"]*)?">', 'style');

let bad = 0;
for (const [name, got, want] of [['script', js, baseBody('script')], ['style', css, baseBody('style')]]) {
    const same = got.trim() === want.trim();   // 只忽略標籤前後的空白
    if (!same) bad++;
    console.log(`${same ? 'OK  ' : 'FAIL'} ${name}: ${got.length} vs ${want.length} chars`);
}
process.exit(bad ? 1 : 0);
