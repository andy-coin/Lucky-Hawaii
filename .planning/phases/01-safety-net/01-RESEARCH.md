# Phase 1: Safety Net 安全網 - Research

**Researched:** 2026-10-03
**Domain:** Browser regression testing (Playwright, no-build static site), error visibility, localStorage/IndexedDB inventory + backup + idempotent migration
**Confidence:** HIGH (every risky mechanism below was probed live against the real `index.html` on this machine; unverified items are listed in the Assumptions Log)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### 測試工具與執行方式
- 使用 Playwright（npm devDependency）＋其自帶 Chromium 跑 headless 測試；只裝在開發環境，不隨網站上線
- 在 Mac 主機直接執行：repo 根目錄 `package.json`，`npm test` 一個指令跑完全部（golden＋冒煙＋程式碼掃描）；`node_modules/` 加進 .gitignore
- Golden 測試比對「畫面上實際呈現的結果」：固定一組注音／拼音／漢字輸入 × 三種篩選模式（常用字 common／同聲韻 initial／同聲調 tone），擷取字卡順序與分組 → 與快照比對。理由：Phase 3 拆檔時內部函式改名不影響測試
- Golden 基準使用網站現有真實資料檔（v0.96 現況）拍快照；刻意改資料時用獨立更新指令（如 `npm run golden:update`）重拍，一般 `npm test` 只比對不覆寫
- 測試透過本機 http server 開頁面（不用 `file://`，為 Phase 3 拆檔後鋪路）
- 冒煙測試的外部網路（AI Worker、Google Fonts 等）一律攔截／mock，不燒額度、結果可重現；`confirm`／`prompt` 對話框自動處理；每次用乾淨的瀏覽器 profile，不碰真實資料

### 錯誤可見性
- 背景、非關鍵錯誤（例：破音字排序檔載入失敗、IndexedDB 快取讀取失敗後改走網路）→ 只在主控台留記錄，訊息前綴「[好韻器]」，不打擾使用者
- 使用者主動操作失敗（匯入、AI 建議、複製等）→ 用既有提示機制顯示白話原因
- 「存檔失敗」→ 醒目橫幅，需按關閉才消失，附建議（先匯出備份或清掉舊資料）；同一種錯誤短時間內只提示一次（節流），避免狂跳
- 防復發：`npm test` 內含程式碼掃描，發現空 catch（含只有註解、或只有 `return` 的吞錯 catch）就失敗；確實需要忽略的地方必須至少留下記錄

### 儲存備份與遷移
- 備份存進 IndexedDB（獨立 object store，不與詞庫快取 `wl` 混用），保留最近 3 份；IndexedDB 不可用時退而存 localStorage 單份備份並記錄警告
- 備份時機：每次資料格式升級（遷移）前自動備份；新版第一次開啟時先存一份「基準備份」
- 程式內維護一份「已知儲存鍵值清單」（目前約 17 個固定鍵＋`apiKey_${provider}` 前綴＋`hoyun_theme_mode`），備份與測試共用；測試掃描程式碼，出現清單外的新鍵就失敗。不備份整個網域（andy-coin.github.io 與其他專案共用 origin）
- 遷移機制：schema 版本號＋依序執行、可重複執行（idempotent）的遷移步驟；本 phase 先上「基準版本」與機制本身，並用舊版資料快照測試
- 遷移中途失敗 → 自動用剛才的備份還原並提示使用者；手動還原介面留到 Phase 8

### Claude's Discretion
- 測試檔位置（建議 `tests/`，進 git）、測試框架細節（Playwright Test runner 或 Node 內建 `node:test`）
- 存檔失敗橫幅的視覺細節（需沿用既有 CSS 變數，晝夜模式皆正常）
- 舊鍵值保留策略：遷移後舊鍵至少保留一個版本，不立即刪除
- 新增的儲存鍵命名（研究建議新鍵使用 `lh:*` 前綴）
- 所有 Andy 回答「你自己決定」的項目皆依上表推薦答案執行

### Deferred Ideas (OUT OF SCOPE)
- 手動還原備份的使用者介面 → Phase 8（EDIT-09 JSON 備份與還原）
- AI fallback 鏈重寫（5024、5256、5312 的 catch 只先補記錄，邏輯不改）→ Phase 2
- 詞庫快取版本競態修正 → Phase 4（PERF-03）
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FND-01 | 重構前有自動化回歸測試：golden test ＋ 能點過所有 inline 按鈕的冒煙測試 | Playwright Test + tiny Node static server; golden = DOM capture per fresh page (deterministic across two full runs, probed); smoke = dedupe handlers from live DOM, fresh context per handler (62 unique of 249 elements, zero baseline errors, negative control detected) |
| FND-02 | 所有靜默吞錯（空 `catch`）改為可見提示或記錄 | acorn AST scanner (prototype flags exactly the 10 known sites + 2 more); `lhWarn` helper with `[好韻器]` prefix; per-site edit table below |
| FND-03 | 盤點所有 localStorage / IndexedDB 鍵值，格式變更前自動備份，遷移可重複執行且不丟資料 | 16 fixed keys + `apiKey_` prefix registry (verified by AST scan), admin-page keys explicitly excluded; IDB v1->v2 upgrade probed (incl. blocked-by-stale-tab); backup/migrate/restore design with fixture tests |
| PERF-04 | 存檔失敗（容量爆滿、IndexedDB 失敗）時使用者看到提示 | `lhSet` safe writer + sticky throttled banner; quota simulation via `Storage.prototype.setItem` override and IDB `put` injection (both probed) |
</phase_requirements>

## Summary

The phase is entirely additive tooling plus surgical edits to `index.html`. Everything the planner needs was probed against the real page on this Mac (Node v26.8.1, Playwright 1.63.0, Chrome Headless Shell 153): the page boots in about 0.5 s with the full 13 MB wordlist, produces **zero** `pageerror`/`console.error` at baseline, the golden capture is **byte-identical across two independent full runs**, and clicking every distinct inline handler produces zero errors at baseline while a deliberately broken handler (`onclick="nonexistentFn()"`) is caught as `pageerror`. So the safety net is green on v0.96 before any edit, which is the precondition for using it to guard Phase 2 and Phase 3.

Three non-obvious hazards shape the plan. (1) The golden snapshot **must be captured from the untouched v0.96 `index.html`** and committed before any other edit in this phase; card colour classes depend on leaked global state (`lastTarget` and the implicit global `colorClass`, `index.html:3476-3479`), so every input needs a fresh page. (2) Moving IndexedDB from v1 to v2 is only safe if the `onupgradeneeded` handler does not re-create `wl`, all connections handle `versionchange`, and `blocked` (a stale old tab holding v1 open, probed: request stays pending forever) cannot hang `loadWordlist`; the existing `_idbOpen` and the new backup code must share one opener. (3) The `admin/` page shares the same origin and stores `haoYunQi_admin_key` in localStorage, so the registry must explicitly exclude it and the backup must never copy it.

**Primary recommendation:** Build in this order, each as its own commit group: (a) tooling + one-line readiness hook, (b) golden snapshot from untouched v0.96, (c) smoke test, (d) mechanical `localStorage.* -> lhGet/lhSet/lhRemove` swap plus `js/safety.js`, (e) catch fixes, (f) IDB v2 + backup + migration runner + fixtures. Use Playwright Test as the single runner (golden, smoke, scanners, storage tests), `acorn` for the scanner, a 15-line Node `http` server for hosting, and committed per-case golden JSON files with a `UPDATE_GOLDEN=1` update switch.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Rhyme search result rendering (golden target) | Browser / Client | — | Pure client DOM; golden asserts what the user sees |
| Safe write helper + save-failure banner | Browser / Client | — | Must run before app code; owns UI + throttle |
| Storage key registry (single source) | Browser / Client (`js/safety.js`) | Dev tooling (scanner reads it via `page.evaluate`) | Backup and test share one list |
| Backup records | Database / Storage (IndexedDB `backups` store) | Browser / Client (localStorage single-copy fallback) | Survives localStorage quota exhaustion; separate from `wl` cache |
| Migration runner | Browser / Client | Database / Storage | Runs at boot against localStorage, backup in IDB |
| Static hosting for tests | Dev tooling (Node http, 127.0.0.1) | — | Mirrors GitHub Pages path layout, not `file://` |
| External request interception (fonts, Worker) | Dev tooling (Playwright `page.route`) | — | Deterministic, no free-quota burn |
| Empty-catch + key-registry scanners | Dev tooling (acorn in Playwright Test) | — | Static analysis over `index.html` inline scripts and `js/**/*.js` |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@playwright/test` [WARNING: flagged as suspicious by the package-legitimacy seam (`too-new`) — see audit; installed and run successfully, signatures verified] | 1.63.0 (published 2026-09-04, `dist-tags.latest`) | Test runner + headless Chromium + request routing + `storageState` + `page.clock` | Locked by CONTEXT. One runner covers browser, static-scan and storage tests. `engines.node >=20`; ran on Node v26.8.1. `[VERIFIED: npm registry + live run on this machine]` |
| `acorn` | 8.18.0 (published 2026-07-28, zero dependencies) | Parse inline `<script>` and `.js` into an AST for the swallowed-catch scanner and key-registry scanner | Handles nested braces, strings/regex/template literals and comments correctly; comment-only handlers appear as empty `body.body` automatically. API (`parse`, `ecmaVersion:'latest'`, `sourceType`, `locations`, `onComment`) `[CITED: github.com/acornjs/acorn README]`; seam verdict OK |
| Node built-ins `node:http`, `node:fs`, `node:crypto` | Node v26.8.1 on host | Static server, fixture loading, SHA-1 of normalized HTML | No extra dependency |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none) | — | — | `acorn-walk` is a separate package `[CITED: acorn README]`; a 10-line recursive walk replaces it. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Playwright Test runner | `node:test` + `playwright` library | Two runners, hand-rolled parallelism and reporting; CONTEXT leaves it to discretion, single runner wins |
| `tests/serve.mjs` (Node http) | `npx http-server` / `python3 -m http.server` | `http-server` is a runtime download and extra dependency; Python server sends no `Cache-Control` so stale reads are possible. Probed Node server works with Playwright `webServer` |
| acorn AST | regex with comment stripping | Regex cannot reliably match catch bodies with nested braces, strings containing `}`, or `.catch(() => {})`; ~1 h saved vs permanent false-negative risk after Phase 3 moves code |
| Own golden JSON files + `UPDATE_GOLDEN=1` | Playwright `toMatchSnapshot` | Playwright snapshot path template appends a platform suffix by default, and updating is global (`--update-snapshots`); own files are readable, per-case, and updated by a dedicated `npm run golden:update` |

**Installation:**
```bash
npm init -y   # then edit: "private": true, no "type" field (keep CommonJS default; tests are .mjs)
npm i -D --save-exact @playwright/test@1.63.0 acorn@8.18.0
npx playwright install chromium     # ~100 MB; took 3m20s on this network
```

**Version verification:** `npm view @playwright/test version` -> `1.63.0`; `npm view acorn version` -> `8.18.0` (2026-10-03). `npm audit signatures` in a scratch install: "4 packages have verified registry signatures / 3 packages have verified attestations". `[VERIFIED: npm registry]`

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@playwright/test` | npm | 6 yrs (created 2020-09-24) | ~82M/wk | github.com/microsoft/playwright | [SUS] reason `too-new` (latest release 2026-09-04, 29 days old; package itself is old) | Flagged — see note |
| `playwright` (dep of the above) | npm | 11 yrs | ~127M/wk | github.com/microsoft/playwright | [SUS] `too-new` (same cause) | Flagged — transitive |
| `playwright-core` (transitive) | npm | — | — | microsoft/playwright | [SUS] `too-new` | Flagged — transitive |
| `fsevents` (optional transitive, macOS) | npm | — | — | — | [OK] | Approved |
| `acorn` | npm | 14 yrs | ~302M/wk | github.com/acornjs/acorn | [OK] | Approved |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** `@playwright/test`, `playwright`, `playwright-core` — all three share one cause: the seam keys on the age of the **latest release**, not the package. No postinstall script (`scripts.postinstall` null), repo is `microsoft/playwright`, 80M+ weekly downloads, `npm audit signatures` verifies signatures and provenance attestations, and the exact version was installed and executed end to end in this research. Protocol says the planner must add a `checkpoint:human-verify`; ROADMAP says Phase 1 "Human check: 無". **Recommended resolution:** replace the human checkpoint with an automated gate task that runs `npm audit signatures` and `npm view @playwright/test@1.63.0 scripts.postinstall` (must be empty) before committing `package-lock.json`, and surface this flag to Andy in the plan summary so he can overrule. Fallback if Andy wants an older release: `1.62.1` (published 2026-07-30), same API surface for everything used here.

*No package was added from WebSearch or training data; both were named by CONTEXT (Playwright) or confirmed against official docs plus the seam (acorn).*

## Architecture Patterns

### System Architecture Diagram

```
 npm test (one command)
   |
   v
 playwright test  --webServer-->  tests/serve.mjs  (node:http, 127.0.0.1:PORT, Cache-Control: no-store)
   |                                   |  serves repo root exactly like GitHub Pages
   |  per test: fresh browser context  v
   |  (storageState = fixture or empty, colorScheme light, 1280x900, locale zh-TW)
   |                                  index.html  +  data/*.js|json  +  js/safety.js
   |  page.route interception:           |
   |   fonts.googleapis/gstatic -> 200 empty css            (probed: only external request at boot)
   |   lucky-hawaii.is3000dollar.workers.dev -> canned JSON (POST / AI, POST /feedback)
   |   wordlist-c0N.json -> real (boot test) | tiny stub (per-handler loops)
   |   anything else off-origin -> 200 empty + recorded -> test FAILS on unexpected host
   |
   +--> golden.spec     : for each case: goto -> await window.__hoyunReady -> set mode/options ->
   |                      fill #searchInput -> capture DOM (header, groups, rows, html sha1)
   |                      -> compare with tests/golden/<id>.json  (UPDATE_GOLDEN=1 rewrites)
   +--> smoke.spec      : boot kitchen-sink state -> enumerate [on*] elements -> dedupe by handler text ->
   |                      for each: NEW context, boot, dispatch handler event -> collect pageerror/console.error
   |                      + coverage gate (function names in source handlers vs. clicked)
   |                      + negative control (injected broken handler must be detected)
   +--> scan-*.spec     : static: acorn over index.html inline scripts + js/**/*.js
   |                      (swallowed catch rule, key-registry rule, no direct localStorage outside safety.js)
   +--> save-failure.spec / storage.spec / error-visibility.spec :
                          addInitScript injects quota / IDB failures -> assert banner, toast, console, backup, restore

 In the page (boot order):
   <head> js/safety.js  -> LH_KEYS registry; lhSnapshot() (SYNC, before any app read); lhGet/lhSet/lhRemove;
                           banner; lhIdbOpen (v2: wl + backups); window.__hoyunSafetyReady = async boot
   <body> inline script -> top-level lets read via lhGet (3292-3298) -> ... -> window.__hoyunReady promise
```

### Recommended Project Structure
```
package.json                 # private, devDeps pinned exact, scripts: test / golden:update
package-lock.json            # committed
playwright.config.mjs
js/safety.js                 # NEW classic script, loaded in <head> before the inline script (registry, lhGet/lhSet, banner, IDB, backup, migrate)
tests/
├── serve.mjs                # static server for webServer
├── helpers.mjs              # bootPage(), routeExternal(), collectErrors(), HANDLER_SEL, fixtures loader
├── golden.spec.mjs          # case table + capture + compare/update
├── golden/                  # one JSON per case id (committed)
├── smoke.spec.mjs           # handler loop, coverage gate, negative control, import/export scenarios
├── scan.spec.mjs            # swallowed-catch rule + key-registry rule + no-direct-localStorage rule
├── save-failure.spec.mjs    # PERF-04
├── storage.spec.mjs         # FND-03: fixture, backup, rotation, idempotency, crash restore, IDB v1->v2
├── error-visibility.spec.mjs# FND-02 runtime half: induced failures leave "[好韻器]" console records
└── fixtures/
    ├── v096-localStorage.json   # synthetic old-version snapshot (all 16 keys + apiKey_)
    ├── v096-corrupt.json        # truncated JSON values
    └── wordlist-stub.ndjson     # ~12 real-shaped words for deterministic AI-card rendering
```
Do **not** put anything under `scripts/` — it is gitignored (`.gitignore` line "scripts/"). `.gitignore` itself is untracked/ignored, so additions (`node_modules/`, `test-results/`, `playwright-report/`) protect this checkout only. `[VERIFIED: git ls-files .gitignore returned nothing; git status shows only .claude/CLAUDE.md untracked]`

### Pattern 1: Playwright config for a no-build static site (probed working)
```js
// playwright.config.mjs
import { defineConfig, devices } from '@playwright/test';
const PORT = process.env.LH_TEST_PORT || '4310';
export default defineConfig({
    testDir: 'tests',
    fullyParallel: true,
    retries: 0,                      // 不靠重跑掩蓋不穩定
    timeout: 60_000,
    reporter: 'list',
    use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://127.0.0.1:${PORT}`,
        viewport: { width: 1280, height: 900 },   // innerWidth > 900 / > 440：固定桌機版面（phone 變數與面板邏輯依賴它，index.html:3442）
        colorScheme: 'light',                      // applyTheme 會讀 prefers-color-scheme
        locale: 'zh-TW',
        serviceWorkers: 'block',
        permissions: ['clipboard-read', 'clipboard-write'],
    },
    webServer: {
        command: 'node tests/serve.mjs',
        url: `http://127.0.0.1:${PORT}/index.html`,
        reuseExistingServer: false,
        env: { SITE_ROOT: process.cwd(), PORT },
    },
});
```
`webServer.command/url/reuseExistingServer/env/cwd` semantics `[CITED: playwright.dev/docs/test-webserver]`. `package.json` scripts:
```json
"scripts": {
  "test": "playwright test",
  "golden:update": "UPDATE_GOLDEN=1 playwright test tests/golden.spec.mjs"
}
```

```js
// tests/serve.mjs — 已在本機實測可與 webServer 搭配
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const ROOT = process.env.SITE_ROOT, PORT = Number(process.env.PORT);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8' };
http.createServer(async (req, res) => {
    try {
        let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        if (p.endsWith('/')) p += 'index.html';
        const f = normalize(join(ROOT, p));
        if (!f.startsWith(ROOT)) { res.writeHead(403).end(); return; }   // 擋路徑穿越
        await stat(f);
        res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
        res.end(await readFile(f));
    } catch { res.writeHead(404).end('not found'); }
}).listen(PORT, '127.0.0.1');   // 只綁本機
```

### Pattern 2: Deterministic external-request interception
Probed baseline network at boot: the only off-origin request is the Google Fonts CSS `@import` (`https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@300;400;500;700&family=JetBrains+Mono:wght@400;500&display=swap`) `[VERIFIED: live request log]`. The Worker is `https://lucky-hawaii.is3000dollar.workers.dev` (`index.html:4446` `const WORKER_URL = 'https://lucky-hawaii.is3000dollar.workers.dev';`, and the same literal inside `callLLM` at `index.html:4557`); AI calls are `POST` to the root, feedback is `POST WORKER_URL + '/feedback'` (`index.html:6215`) `[VERIFIED: Read this session]`.

**Mock with HTTP 200, never 404/abort.** Probe finding: Chromium logs any 4xx/aborted subresource as `console.error: Failed to load resource...`, which the smoke error collector would flag. So:
```js
// tests/helpers.mjs
export async function routeExternal(page, { BASE, wordlist = 'stub', ai = defaultAiReply } = {}) {   // BASE = `http://127.0.0.1:${PORT}`，由呼叫端傳入
    const offOrigin = [];
    await page.route(url => new URL(url).origin !== BASE, route => {
        const u = new URL(route.request().url());
        if (/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname))
            return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
        if (u.hostname === 'lucky-hawaii.is3000dollar.workers.dev') {
            if (u.pathname === '/feedback') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ text: ai(route.request()) }] } }] }) });
        }
        offOrigin.push(u.href);                       // 不認得的外部主機 -> 測試最後 fail
        return route.fulfill({ status: 200, body: '' });
    });
    if (wordlist === 'stub')   // 逐 handler 迴圈用：快、確定。注意回 200 且是合法 NDJSON（空字串會讓 JSON.parse 丟錯）
        await page.route(/\/data\/wordlist-c0\d\.json$/, r => r.fulfill({ status: 200, contentType: 'application/json',
            body: r.request().url().endsWith('c00.json') ? STUB_NDJSON : '{"w":"測試","z":"ㄘㄜˋ ㄕˋ","p":0}\n' }));
    return offOrigin;
}
```
The Gemini-shaped reply matches what `callLLM` parses (`data.candidates[0].content.parts[0].text`, `index.html:4595-4600`) `[VERIFIED: Read this session]`.

### Pattern 3: Readiness signals (what to wait for)
| Data | Signal | Notes |
|------|--------|-------|
| Rhyme dict | synchronous: `rhymeDict = window._rhymeDictData` then `buildIndex()` (`index.html:5995-5998`) | Loaded by `<script src="data/rhyme-dict.js">` (`:2177`), ready at script end |
| Polyphonic order | `polyphonicsOrderMap !== null` | Set synchronously when `window._polyphonicsOrderData` exists (`:3340-3343`); `fetch` fallback only otherwise |
| Rhyme overrides | async `applyRhymeDictOverrides().then(applied => { if (applied) buildIndex(); })` (`:6001`) | **No promise exposed.** Today `data/rhyme-dict-overrides.json` has empty arrays so `applied === false`, but the day Andy applies overrides the index is rebuilt late |
| Wordlist | `wordlistData !== null && !wordlistLoading` | Bare names work inside `page.waitForFunction` (probed: ready at ~519 ms, 233,675 words after overrides) |

**Recommended one-line hook (additive, separate small commit made BEFORE golden capture):** at `index.html:6001` and `:6022` capture the promises:
```js
window.__hoyunReady = Promise.all([
    applyRhymeDictOverrides().then(applied => { if (applied) buildIndex(); }),
    loadPolyphonicsOrder()
]);
window.__hoyunWordlistReady = loadWordlist();   // replaces the bare loadWordlist(); at :6022
```
Tests then `await page.evaluate(() => window.__hoyunReady)`. Double-underscore names mark them test-only; app code must never branch on them. Without the hook the only alternative is `waitForResponse` + a timeout, which is racy by construction.

**Gotchas verified:** `window.lyricsSections` is an `HTMLElement` (element id `lyricsSections` shadows window), and top-level `let` variables are not window properties. In tests always reference globals by bare name inside `page.evaluate`/`waitForFunction` (`lastTarget`, `currentMode`, `wordlistData`), never `window.x`. `[VERIFIED: probe: typeof window.lyricsSections === 'object'; bare wordlistData worked]`

### Pattern 4: Golden test design
**Matrix** (all inputs run on **real** `data/` rhyme dictionary; wordlist may be stubbed because search never touches it; 30 inputs x 3 modes probed deterministic, result counts shown are from the probe):

| Group | Inputs (id -> input) |
|-------|----------------------|
| 注音 韻母-only | `ㄢ`(356) `ㄧㄥ`(333) `ㄨㄛ`(136) |
| 注音 聲母-only | `ㄅ`(225) `ㄓ`(289, the "initial equals whole zhuyin" branch `index.html:3462`) |
| 注音 full syllable | `ㄅㄚ`(280); `ㄌㄞˊ` -> "沒有找到結果" (tone mark not accepted; keep as negative case) |
| 拼音 | `an` `ing` `uo`(195, the `matchUo` special) `b` `bi`(81) `zh`; `ai2` -> no results (negative) |
| 漢字 incl. 破音字 | `愛`(178) `安` `行` `長`(318) `樂`(156) `了`(156) `鬱` `喔` |
| 詞 | `安打`(636) `愛情`(511) |
| multi-term | `an ing`(689) `ㄢ ㄧㄥ`(689) `愛 an`(534) `ㄅ ㄢ`(565) `* ㄢ` |
| garbage | `zzz` -> no results |
| option variants (add 3) | `樂` with `hideRare` off; `樂` with `filterDuplicate` on; `愛` with `showPinyin` off |
| input-mode variants (add 2) | `an` with `haoYunQi_inputMode='zhuyin'` and `ㄢ` with `'pinyin'` (preset via `storageState`) |
| polyphonic chip | `樂`, click second `.poly-chip`, capture (covers `selectPolyphonicReading`) |

**What to capture** (`page.evaluate` returns plain data; Node adds the hash):
```js
// per mode
{ header: root.querySelector('.results-count')?.textContent ?? root.querySelector('h3')?.textContent,   // "找到 356 個字" / "沒有找到結果" / "開始搜尋"
  rhymeDisplay: document.getElementById('aiRhymeDisplay').textContent,
  chips: [...document.querySelectorAll('#polyphonicChips .poly-chip')].map(c => c.dataset.reading + (c.classList.contains('active') ? '*' : '')),
  groups: [...root.querySelectorAll('.group-section')].map(g => ({
      title: g.querySelector('.group-title').innerHTML,                  // includes colour class + count
      rows: [...g.querySelectorAll('.char-card')].map(c => `${c.dataset.char}|${c.dataset.key}|${c.querySelector('.mark-badge')?.textContent}`).join(' ') })),
  flat: groups.length ? null : (same rows over all .char-card, one string),
  htmlSha1: sha1(normalize(root.innerHTML))   // computed in Node from the returned innerHTML
}
```
Structure verified against `displayResults` (`index.html:5530-5711`) and `createCharCard` (`:3549-3555`): common mode renders one flat `.results-grid` (no `.group-section`), `initial` and `tone` render `.group-section > .group-title + .results-grid`; each card has `data-char`, `data-key`, `.char-pinyin`, `.mark-badge`. `[VERIFIED: Read this session]`

**Why fresh page per input + fixed mode order (common -> initial -> tone):** `createCharCard` assigns the implicit global `colorClass` and reads/writes the top-level `lastTarget` (`index.html:3476-3479`, `:3512-3516`), so per-card colour classes depend on what was rendered before. Within one page the order is deterministic; across inputs it would couple cases. Probed: two full independent runs gave byte-identical output. `[VERIFIED: probe, deterministic true, 2,959,008 chars with full innerHTML]`

**Size control:** storing `.char-pinyin` innerHTML per card is ~3 MB for 30 cases. Store compact `rows` strings plus the SHA-1 of normalized `innerHTML` (<= ~0.5 MB total). On mismatch the test reports the first differing group/row and, if only the hash differs, "markup/colour classes changed". One file per case: `tests/golden/<case-id>.json` (case ids are hand-written like `zy-rhyme-an`, `py-uo`, `han-poly-le`, so parallel workers never write the same file and `git diff --stat tests/golden` is reviewable).

**Update flow:** `npm run golden:update` sets `UPDATE_GOLDEN=1`; each case test writes its file instead of comparing. Guards required in the spec: (1) fail the test if any `pageerror` occurred while capturing (never snapshot a broken page); (2) cases flagged `nonEmpty: true` must have > 0 cards; (3) a meta test asserts `fs.readdirSync('tests/golden')` equals the case-id list (no orphan or missing files), so deleting a case cannot silently shrink coverage.

**Ordering rule for the planner:** capture goldens from the untouched v0.96 file, commit them alone ("golden baseline v0.96"), then every later commit in this phase must keep them green. The readiness hook is the only app edit allowed before that capture.

### Pattern 5: Smoke test design (probed end to end)
- **Enumerate from the live DOM, not from regex.** After preparing a kitchen-sink state, `document.querySelectorAll('[onclick],[onchange],[oninput],[ondrop],[ondragstart],[ondragover],[ondragleave],[ondragend],[ondblclick],[onblur],[onkeydown]')`. Probe with a fixture (2 lyrics sections, 2 hashtags, 2 saved words) and a searched character: **249 elements, 62 unique handler signatures** (178 are identical `handleBadgeClick(event)` badges). Dedupe by the concatenated `on*` attribute text and keep the first element of each.
- **Fresh context per handler** (new browser context, same fixture `storageState`, same boot): isolates destructive handlers (`clearDictOverrides` -> confirm -> `location.reload()`, `removeLyricsSection`, `batchMark`, `resetColors`, `exportSession` -> prompt + download). Measured about 0.9 s per iteration including a needless `networkidle` wait; replace it with `__hoyunReady` and expect about 0.3-0.4 s, so about 25 s for the loop.
- **Fire the handler's own event types in-page** (no layout/overlay dependence, works on collapsed panels and hidden modals; an unresolved name still raises `ReferenceError`):
```js
for (const a of [...el.attributes].filter(a => /^on/.test(a.name))) {
    const t = a.name.slice(2);
    if (t === 'click') { el.click(); continue; }
    if (t === 'blur')  { el.blur(); continue; }
    const ev = /^drag|^drop/.test(t) ? new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() })  // onSectionDragStart reads e.dataTransfer.effectAllowed (index.html:3786)
             : t === 'keydown' ? new KeyboardEvent(t, { bubbles: true, cancelable: true, key: 'Enter' })
             : new Event(t, { bubbles: true, cancelable: true });
    el.dispatchEvent(ev);
}
```
- **Dialogs:** `page.on('dialog', d => d.accept(d.type() === 'prompt' ? '測試' : undefined))` (alert, confirm and prompt appear in `clearDictOverrides`, `exportSession`, `aiWordSuggest`, `wordSuggestReading`, `charSuggestReading`).
- **Errors:** collect `pageerror` (also fires for unhandled promise rejections, probed: `Promise.reject(new Error('async-boom'))` -> `pageerror:async-boom`) and `console.error`. Record off-origin requests and fail on unknown hosts.
- **File input:** a programmatic `input.click()` on `#importFileInput` has no user gesture, so do not rely on it. Test `importSession` separately with `page.setInputFiles('#importFileInput', {name:'x.json', mimeType:'application/json', buffer})` for a valid payload and for invalid JSON (expects toast "讀取失敗：檔案格式錯誤", `index.html:3890`).
- **Coverage gate (this is what makes "every button" true, not just "every button that happens to render").** Extract function names from handler attribute text across `index.html` + `js/**/*.js` source (`/\bon(?:click|change|input|drop|dragstart|dragover|dragleave|dragend|dblclick|blur|keydown)="([^"]*)"/g`, then `/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g` minus `if function return event stopPropagation preventDefault blur`). Probed result: 53 names in source; with no fixture/state **10 were never rendered**: `removeHashtag removeLyricsSection copyWord removeSavedWord reportMissingChar saveWord resetSuggestedPool wordCtxReport wordSuggestReading aiWordSuggest`. The fixture fixes the first four; the scenario steps below reach the rest. The test fails when a source name is neither clicked nor in an explicit `UNREACHABLE` allow-list that carries a reason.
- **Scenario steps to render the dynamic handlers** (run in the same boot, before enumeration): search `心` with the 12-word wordlist stub so `<24` candidates render `.ai-word-card` directly (`index.html:5172-5181`) and `generateAIWords` adds AI-badge cards from the mocked Worker reply; click generate a second time to hit `resetSuggestedPool` (`:5117-5120`); right-click an `.ai-word-card` to inject `_CTX_MENU_AI`/`_CTX_MENU_NORMAL` (`:6080-6089`, `:6165`); search a character that is not in the dictionary to get `reportMissingChar` (`:4398`, `:4417`). The coverage gate output tells the executor exactly which name is still unreached.
- **Negative control is part of the suite:** one test injects `<button onclick="nonexistentFn()">`, clicks it, and asserts the collector caught `nonexistentFn is not defined` (probed). Without it a broken collector would pass silently.
- **Baseline is green:** probe clicked all 62 signatures with zero errors on untouched v0.96. If any error appears later it is a regression, not pre-existing noise.

### Pattern 6: Error visibility (`js/safety.js`)
**Helper surface** (new classic script, `<script src="js/safety.js?v=0.96.1"></script>` placed in `<head>` after the two `data/*.js` scripts at `index.html:2177-2178`, so it runs before the inline script at `:2490`):
```js
// ==================== 儲存安全層 ====================
const LH_LOG_PREFIX = '[好韻器]';
function lhWarn(tag, err) { console.warn(`${LH_LOG_PREFIX} ${tag}`, err); }

// 配額錯誤辨識：現代瀏覽器皆為 DOMException name 'QuotaExceededError'（MDN）；舊 Firefox 名稱與 code 屬補強
function lhIsQuotaError(e) {
    return !!e && (e.name === 'QuotaExceededError' || e.code === 22 /* 舊版 WebKit/Blink */ ||
                   e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 1014 /* 舊版 Firefox */);
}
function lhGet(key) { try { return localStorage.getItem(key); } catch (e) { lhWarn('讀取 ' + key + ' 失敗', e); return null; } }
function lhGetJSON(key, fallback) {
    const raw = lhGet(key);
    if (raw === null) return fallback;
    try { return JSON.parse(raw); } catch (e) { lhWarn(key + ' 內容損毀，已改用預設值（原始內容保留在備份中）', e); return fallback; }
}
function lhSet(key, value) {                 // 回傳 true/false；失敗必顯示橫幅
    lhAssertKnownKey(key);                   // 清單外的鍵：console 警告（測試嚴格模式下 throw）
    try { localStorage.setItem(key, value); return true; }
    catch (e) { lhWarn('寫入 ' + key + ' 失敗', e); lhSaveFailed(lhIsQuotaError(e) ? 'quota' : 'write'); return false; }
}
function lhRemove(key) { try { localStorage.removeItem(key); } catch (e) { lhWarn('移除 ' + key + ' 失敗', e); } }
```
`[CITED: MDN Using_the_Web_Storage_API]` for the `QuotaExceededError` name check; the legacy `NS_ERROR_DOM_QUOTA_REACHED` / code 1014 / code 22 branches are `[ASSUMED]` (harmless extra checks, A1).

**Banner** (`lhSaveFailed(kind)`): sticky, dismissible, throttled per `kind` (e.g. 60 s via `Date.now()`), text via `textContent` (never `innerHTML`), own injected `<style>` so Phase 3's CSS move cannot break it, colours from existing variables so it works in both themes (`--card-bg`, `--text-primary`, `--border`; `:root`/`[data-theme="dark"]` at `index.html:17-45`; reuse the red `#e53e3e` already used for AI errors at `:5266`), `role="alert"`, `z-index` above `.copy-toast` (9999, `:1247`):
- quota/write: 「存檔失敗：瀏覽器的儲存空間可能已滿，剛剛的修改可能沒有存下來。建議先按「匯出備份」存成檔案，再清掉不需要的舊資料。」 buttons 「匯出備份」(calls global `exportSession()` if defined) and 「關閉」
- backup: 「資料備份失敗：為了安全，已暫時不升級資料格式。你的歌詞與設定沒有被更動。」
- migrate-failed: 「資料升級失敗，已自動還原成升級前的內容，歌詞與設定都在。」
Throttle test uses Playwright `page.clock` (`install` then `fastForward(61000)` moved `Date.now()` by exactly 61001 ms, probed).

**Mechanical swap:** every `localStorage.getItem/setItem/removeItem` in `index.html` becomes `lhGet/lhSet/lhRemove` (about 24 `setItem` plus ~25 reads/removes; full list verified via grep and AST). This is its own commit (refactor, no behaviour change except safe failure). It also removes two crash modes found by probe: (a) corrupted JSON in `haiku_lyrics` currently kills the entire app (`index.html:3296-3298` parse at top level -> `pageerror`, **0 result cards**), fixed by `lhGetJSON`; (b) an unguarded `setItem` throwing `QuotaExceededError` from inline handlers (e.g. `toggleLeftPanel` -> `:3739`) is an uncaught exception today. `handleColorChange` passes a dynamic `key` (`:5971`); `lhAssertKnownKey` covers it at runtime.

**IDB write failures:** classify in two buckets so the banner never cries wolf:
- *User-data writes* (the new `backups` store): failure -> banner kind `backup`.
- *Wordlist cache writes* (`_idbPut` at `index.html:3963-3969`, which today resolves on both `oncomplete` and `onerror` and never listens to `onabort`): rewrite to settle once on `complete`/`error`/`abort`, log `lhWarn`, and show a **non-sticky** `showToast` once per session: 「詞庫快取沒存成功，下次開啟會比較慢，不影響使用」. See Open Question 1.

### Pattern 7: Swallowed-catch scanner (acorn)
**Rule (recommended, superset of CONTEXT):** a `CatchClause` body, or a function passed to `.catch(...)`, is a violation when it contains **no `CallExpression` and no `ThrowStatement`**. That catches empty, comment-only (comments are not AST nodes, so `body.body` is empty), `return`-only, and assignment-only handlers. Ceiling: a handler that calls any unrelated function passes; acceptable, the goal is "never silent by accident". Prototype run against untouched `index.html`:

```
2738 ExpressionStatement      2742 EMPTY/COMMENT-ONLY   2799 ReturnStatement
3986 EMPTY/COMMENT-ONLY       3993 EMPTY/COMMENT-ONLY   4019 EMPTY/COMMENT-ONLY
4041 ReturnStatement          5024 EMPTY/COMMENT-ONLY   5256 EMPTY/COMMENT-ONLY
5260 ExpressionStatement,IfStatement                    5312 EMPTY/COMMENT-ONLY
6220 EMPTY/COMMENT-ONLY      (+ .catch(() => {assignment}) at 3348 once NewExpression is not counted as a report)
```
`[VERIFIED: acorn 8.18.0 run this session; line numbers match v0.96 and the orchestrator's list]`. The 10 sites in CONTEXT are 2742, 2799, 3986, 3993, 4019, 4041, 5024, 5256, 5312, 6220. The rule additionally flags **2738** (`catch(e) { dictOverrides = {}; }` swallows corrupt override JSON), **5260** (`lastErr = e` only; message is shown later at `:5266`, a log line is still cheap) and **3348** (`.catch(() => { polyphonicsOrderMap = new Map(); })`, the exact "破音字排序檔載入失敗" case CONTEXT wants logged). Recommend fixing these three too (one `lhWarn` each); if Andy prefers strictly the 10, narrow the rule to "empty / comment-only / return-only".

```js
// tests/scan.spec.mjs (skeleton; helpers shared with the key scanner)
import * as acorn from 'acorn';
function inlineScripts(html) {                       // 只取沒有 src 的 <script>，回傳 {code, lineOffset}
    const out = []; const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g; let m;
    while ((m = re.exec(html))) out.push({ code: m[1], lineOffset: html.slice(0, m.index + m[0].indexOf('>') + 1).split('\n').length - 1 });
    return out;
}
function parseAny(code) {                            // Phase 3 之後的檔案可能是 ES module
    try { return acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'script', locations: true }); }
    catch { return acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module', locations: true }); }
}
const hasReport = node => { let f = false; (function w(x) { if (!x || typeof x !== 'object' || f) return;
    if (Array.isArray(x)) return x.forEach(w);
    if (x.type === 'CallExpression' || x.type === 'ThrowStatement') f = true;
    for (const k in x) if (k !== 'loc') w(x[k]); })(node); return f; };
// walk: CatchClause -> !hasReport(n.body); CallExpression with callee.property.name === 'catch' and a Function arg -> !hasReport(fn.body)
```
**Scan targets:** inline scripts of every `*.html` at the repo root (not `admin/`, not `history version/`), plus `js/**/*.js`. Phase 3 can move code anywhere under those paths and the scan keeps working. Try `script` then `module` parse. `[VERIFIED: parse of the 281 KB inline script succeeded with ecmaVersion latest, sourceType script]`

### Pattern 8: Storage registry, backup, migration
**Registry** (single array in `js/safety.js`; tests read it with `page.evaluate(() => LH_KEYS)`). The 16 fixed keys verified by AST scan of every `localStorage.*` call (15 literal keys + `THEME_KEY`), plus a template-literal prefix:

| Key | Notes |
|-----|-------|
| `haiku_lyrics` `haiku_hashtags` `haiku_savedwords` `dictOverrides_v076` | **user data** (JSON); `dictOverrides_v076` read/written/removed at `index.html:2731-2750` |
| `haoYunQi_inputMode` `selectedModel` `hoyun_theme_mode` | scalars; `THEME_KEY = 'hoyun_theme_mode'` at `index.html:5830` |
| `bgColor1` `containerBg` `textColor` `highlightColor` | colours (also written through dynamic `key`, `:5971`) |
| `recentPanelCollapsed` `leftPanelCollapsed` `rightPanelCollapsed` `contextSectionCollapsed` `savedPoolCollapsed` | UI flags |
| prefix `apiKey_` (`apiKey_${provider}`, `:4465`, `:4470`) | `secret: true` (keep in IDB backup for restore completeness, but Phase 8 export must exclude) |
| new: `lh:schema`, `lh:backup:ls` | meta, never backed up |
| **excluded (never snapshot, never back up):** `haoYunQi_admin_key`, `haoYunQi_admin_theme` | `admin/index.html:331-332`; same origin (`andy-coin.github.io`), admin key is a secret `[VERIFIED: Read admin/index.html:328-333]` |

CONTEXT says "about 17 fixed keys"; the actual verified count is 16 fixed + 1 prefix. `[VERIFIED: AST scan]` Any other key in the origin (other GitHub Pages projects) is ignored by `lhSnapshot()` and never written to a backup.

**Snapshot timing is the critical design constraint.** The inline script reads storage synchronously at top level (`index.html:3292-3298`) and later **removes** `haiku_hashtags` when all lyrics are empty (`:5418-5421`). So `lhSnapshot()` must run synchronously at the top of `js/safety.js` (before either), capturing raw strings; the async IDB write happens afterwards from that in-memory object. For future format-changing steps the consumer must `await window.__hoyunSafetyReady` before first read; Phase 1 has no such step (baseline only), so boot stays synchronous and behaviour unchanged.

**IDB v1 -> v2 (probed on Chromium):**
```js
// js/safety.js — 唯一的 IndexedDB 開啟入口；index.html 的 _idbOpen 改成 `return lhIdbOpen();`
let _lhDbP = null;
function lhIdbOpen() {
    if (_lhDbP) return _lhDbP;
    _lhDbP = new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB 不可用'));
        let timedOut = false;
        const timer = setTimeout(() => { timedOut = true; reject(new Error('IndexedDB 升級被舊分頁擋住')); }, 5000);
        const req = indexedDB.open('haoYunQi', 2);
        req.onupgradeneeded = () => {                       // 絕對不能無條件 createObjectStore('wl')：v1 使用者已有 wl，會 ConstraintError
            const db = req.result;
            if (!db.objectStoreNames.contains('wl')) db.createObjectStore('wl', { keyPath: 'k' });
            if (!db.objectStoreNames.contains('backups')) db.createObjectStore('backups', { keyPath: 'id' });
        };
        req.onblocked = () => lhWarn('IndexedDB 升級被其他分頁擋住', null);
        req.onsuccess = () => {
            const db = req.result; clearTimeout(timer);
            if (timedOut) { db.close(); return; }
            db.onversionchange = () => { db.close(); _lhDbP = null; };   // 以後升級不再被本分頁擋住
            resolve(db);
        };
        req.onerror = () => { clearTimeout(timer); reject(req.error); };
    }).catch(e => { _lhDbP = null; throw e; });
    return _lhDbP;
}
```
Probe results (Chromium): with an old tab holding a v1 connection (no `versionchange` handler) a v2 open fires `blocked` and **stays pending indefinitely** (still pending after 2.5 s); once the old connection closed, the open succeeded with `stores=backups,wl` and the pre-existing `wl` row (`ver = X`) intact. Hence the 5 s timeout: without it `loadWordlist` (`:3986`, `await _idbOpen()`) would hang and AI suggestions would show "詞庫載入中" forever for anyone with a stale old tab. The existing `try { db = await _idbOpen(); } catch(e) {}` already degrades to the no-cache path on rejection (now with a logged warning). `[VERIFIED: probe]`

**Backup record** in `backups` store: `{ id, label, createdAt, appVersion, schema, data: { <key>: <raw string> } }`. IDs: `baseline` (created once, never overwritten) and `pre-schema-<N>` (once per migration target; **never overwritten if present**, so a crash loop cannot replace the pristine copy with a half-migrated state). Rotation after each put: keep newest 3 by `createdAt`, delete the rest. If `lhIdbOpen`/put fails: fall back to `lh:backup:ls` (single copy, JSON) with `lhWarn`; if that also fails: banner kind `backup` and **migration steps do not run**.

**Migration runner** (dependency-injected so tests drive it with fake steps; production passes an empty step list at schema target 1):
```js
const LH_SCHEMA_TARGET = 1;          // 1 = 基準版本：所有 v0.96 鍵值維持原樣；缺 lh:schema 視為 1（與 research/ARCHITECTURE.md 的 migrate() 一致，Phase 8 的多首歌是 1->2）
const LH_MIGRATIONS = [];            // { to: 2, run(store) {...} }：同步、必須冪等、store 只能碰清單內的鍵、寫入失敗直接 throw
async function lhMigrate(steps, target) {
    const cur = Number(lhGet('lh:schema') || 1);
    if (cur >= target) return { ran: 0 };
    const snap = lhSnapshot();
    const b = await lhBackup('pre-schema-' + target, snap);
    if (!b.ok) { lhSaveFailed('backup'); return { ran: 0, blocked: true }; }
    try {
        for (const s of steps.filter(s => s.to > cur && s.to <= target).sort((a, b) => a.to - b.to)) {
            s.run(lhStrictStore);                    // 每一步完成才翻旗標；中途 crash 下次重跑（步驟冪等）
            lhSetStrict('lh:schema', String(s.to));
        }
        return { ran: steps.length };
    } catch (e) {
        lhWarn('遷移失敗，還原中', e); lhRestore(snap); lhSaveFailed('migrate-failed');
        return { ran: 0, restored: true };
    }
}
// lhRestore(snap): 只動清單內的鍵（不含 lh:*）：snap 有 -> setItem 原值；snap 無 -> removeItem（清掉失敗遷移新增的鍵）
// lhRestoreFromBackup(id): 讀 IDB 記錄再 lhRestore（Phase 8 的手動還原介面會呼叫它；本 phase 測試覆蓋）
```
Boot (async, after the synchronous snapshot): ensure `baseline` backup exists -> stamp `lh:schema = '1'` only after the backup succeeded (flip last) -> `lhMigrate(LH_MIGRATIONS, LH_SCHEMA_TARGET)` -> resolve `window.__hoyunSafetyReady`. Old keys are never deleted by this phase (CONTEXT: keep at least one release).

**Fixtures:** `tests/fixtures/v096-localStorage.json` is a synthetic snapshot containing every registry key with realistic values (3 sections with `collapsed`, ampersand/`<b>` text, 2 hashtags, 2 saved words, one `dictOverrides_v076` entry, `selectedModel: 'gpt-4.1'`, an `apiKey_gemini`). Inject with `browser.newContext({ storageState: { cookies: [], origins: [{ origin: BASE, localStorage: [{name, value}] }] } })`; probe confirmed the first inline script already sees the values (`[VERIFIED: probe 'first-script saw [...]']`; option shape `[CITED: playwright.dev browser.newContext storageState]`). Real data from Andy's browser can replace it later, no code change. Note the existing init quirk: when every lyrics section is empty the page removes `haiku_hashtags` (`index.html:5418-5421`), so the "nothing lost" assertion fixtures must have non-empty lyrics.

**Registry-coverage scan (static):** using the same AST walk, collect first arguments of `lhGet/lhSet/lhRemove/lhGetJSON` plus any direct `localStorage.*` member call. Literal -> must be in `LH_KEYS` or meta; template literal -> `quasis[0].cooked` must equal a registered prefix; identifier -> resolve against top-level `const NAME = 'literal'` found in scanned files (`THEME_KEY`); otherwise allowed only inside an explicit allow-list of enclosing function names (`handleColorChange`, runtime-checked by `lhAssertKnownKey`). **Direct `localStorage.` references outside `js/safety.js` are a failure.** Probed AST shapes: literal args (15 keys), template `apiKey_${...}`, identifier `THEME_KEY` and `key`. `admin/` is deliberately out of the scan (separate app, own keys, listed as excluded above).

### Anti-Patterns to Avoid
- **Capturing golden after any behaviour edit.** The snapshot would encode the edit; Phase 3 would then "pass" a changed behaviour.
- **One page for all golden inputs.** Colour classes leak across searches through `lastTarget`/`colorClass`.
- **`route.abort()` or 404 for mocks.** Becomes `console.error` noise and defeats the zero-error assertion.
- **Calling `new Date`/real clock in banner throttle tests.** Use `page.clock`.
- **Real quota exhaustion** (writing megabytes into localStorage): slow and browser-dependent. Override `Storage.prototype.setItem` instead (probed: throws `DOMException` `name 'QuotaExceededError'`, `code 22`).
- **Letting `lhSet` swallow errors again.** It returns `false` and always raises the banner.
- **Snapshotting "all localStorage".** Shared origin; admin key present.
- **Mixing code moves and bug fixes in one commit** (CONTEXT specific).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Finding empty/comment-only/return-only catch bodies | Regex with brace counting | `acorn` AST (`CatchClause`, `.catch(fn)`) | Strings, regex literals, template literals and nested blocks break regexes; comments vanish from the AST for free |
| Static file hosting for tests | Custom caching/CORS server | 15-line `tests/serve.mjs` or Playwright `webServer` | Already probed; no Range/CORS needs |
| Faking time for throttle tests | Monkeypatching `Date.now` by hand | `page.clock.install()` / `fastForward()` | Verified: exact 61001 ms advance |
| Browser storage preload | Navigating and calling `setItem` before reload | `browser.newContext({ storageState })` | Values visible to the first inline script |
| Quota error simulation | Filling storage to the cap | `addInitScript` overriding `Storage.prototype.setItem` / `IDBObjectStore.prototype.put` | Deterministic and fast |
| Snapshot diff UI | Image/text snapshot tooling | Per-case JSON + `git diff` | Reviewable intent changes |
| Deep-clone/compare of storage state | Custom comparators | `expect(actual).toEqual(expected)` on plain objects | Built into the runner |

**Key insight:** this phase's value is that failures become *loud and cheap to detect*. Anything custom that can fail silently (a regex scanner, a mock that 404s, a snapshot written by a broken page) reintroduces the problem the phase exists to remove.

## Common Pitfalls

### Pitfall 1: Golden captured from a modified page
**What goes wrong:** Phase 3 passes while behaviour changed. **Why:** snapshot taken after safety edits. **How to avoid:** hook commit -> golden capture commit -> everything else; golden spec refuses to write if a `pageerror` occurred. **Warning signs:** `git log` shows golden files committed after `js/safety.js`.

### Pitfall 2: Colour-class nondeterminism
**What goes wrong:** `class="undefined"` or shifted `search-highlight-N` between runs. **Why:** `colorClass` is an undeclared implicit global and `lastTarget` is shared state (`index.html:3476-3479`). **How to avoid:** fresh page per case, fixed mode order, never reuse a page across inputs. **Warning signs:** goldens differ only in `htmlSha1` between two local runs.

### Pitfall 3: IndexedDB upgrade collisions
**What goes wrong:** `ConstraintError` on `createObjectStore('wl')`, hung `loadWordlist`, `VersionError` for any code still opening v1. **How to avoid:** guarded `onupgradeneeded`, 5 s open timeout, `onversionchange -> close`, one shared opener, change `_idbOpen` rather than adding a second one. **Warning signs:** AI panel stuck on "詞庫載入中"; two tabs with different app versions.

### Pitfall 4: Backing up after the app already mutated state
**What goes wrong:** baseline lacks hashtags that `index.html:5418-5421` deleted, or a corrupt value was already replaced. **How to avoid:** synchronous `lhSnapshot()` at the very top of `js/safety.js`; the safety script must precede the inline script in `<head>`.

### Pitfall 5: `_idbPut` never reports failure
**What goes wrong:** cache writes that fail via `abort` never resolve and are invisible; current code resolves `res` on both `oncomplete` and `onerror`. **How to avoid:** settle-once helper on `complete`/`error`/`abort`; in the probe an injected `tx.abort()` surfaced as an `error` event first, so listen to both.

### Pitfall 6: Chromium logs HTTP failures as `console.error`
**What goes wrong:** the smoke collector flags 404 mocks (probe: dozens of `Failed to load resource` entries). **How to avoid:** every mocked response is 200 with a body that the app parses without throwing (NDJSON for wordlist chunks; an empty chunk string makes `JSON.parse('')` throw inside the swallowed catch at `:4019`).

### Pitfall 7: Hooks hidden behind `window.`
**What goes wrong:** `window.lyricsSections` is an element; top-level `let` is not on `window`. **How to avoid:** bare names in `evaluate`; expose only explicit `window.__hoyun*` test hooks.

### Pitfall 8: Admin key swept into a backup
**What goes wrong:** `haoYunQi_admin_key` ends up in IndexedDB or a future export. **How to avoid:** registry has an explicit `excluded` list; `lhSnapshot` iterates registry keys and prefixes only; a test asserts the admin key written into the fixture context is absent from the backup record.

### Pitfall 9: Stale-asset skew from the new script file
**What goes wrong:** GitHub Pages serves `max-age=600`; a cached old `js/safety.js` with a new `index.html` (or vice versa) can leave `lhSet` undefined and kill the app. **How to avoid:** `?v=<version>` on the `<script src>` and bump it whenever `safety.js` changes; keep `safety.js` additive-compatible. The first deploy is safe (new file). `[ASSUMED]` Pages cache header (from `research/PITFALLS.md`, MEDIUM).

### Pitfall 10: `.gitignore` swallowing the tooling
**What goes wrong:** helpers placed in `scripts/` never reach git. **How to avoid:** everything under `tests/`, `js/`, repo root. `.gitignore` additions are local-only because that file is itself ignored.

### Pitfall 11: Treating Chromium green as cross-browser green
**What goes wrong:** Safari/Firefox storage semantics differ. **How to avoid:** accept as a stated limitation (CONTEXT locks Chromium); the quota detector is written defensively and WebKit/Firefox are listed in Assumptions A1-A3 for Andy's later device checks.

## Code Examples

### Quota and IDB failure injection (both probed)
```js
// localStorage: 在頁面任何腳本之前
await page.addInitScript(() => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
        if (window.__failLS) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
        return orig.call(this, k, v);
    };
});
await page.evaluate(() => { window.__failLS = true; });   // 要失敗時才打開，boot 不受影響
// IndexedDB: 同步丟錯 或 put 後 abort（abort 會先觸發 request/tx 'error'，helper 要兩個都聽）
await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...a) {
        if (window.__failIDB === 'throw') throw new DOMException('quota', 'QuotaExceededError');
        const r = put.apply(this, a); if (window.__failIDB === 'abort') this.transaction.abort(); return r;
    };
});
```

### Idempotency and crash-restore assertions
```js
// storage.spec.mjs
const before = await dumpRegistryKeys(page);                         // {key: raw}
await page.evaluate(() => lhMigrate([{ to: 2, run: s => s.set('lh:probe', 'x') }], 2));
const once = await dumpRegistryKeys(page);
await page.evaluate(() => lhMigrate([{ to: 2, run: s => s.set('lh:probe', 'x') }], 2));   // 再跑
expect(await dumpRegistryKeys(page)).toEqual(once);                  // 冪等
// 失敗遷移：先寫壞 haiku_lyrics 再丟錯 -> 必須還原成 before
await page.evaluate(() => lhMigrate([{ to: 3, run: s => { s.set('haiku_lyrics', 'CORRUPT'); throw new Error('boom'); } }], 3));
expect(await dumpRegistryKeys(page)).toEqual(once);
await expect(page.locator('[role="alert"]')).toContainText('已自動還原');
```

## Per-site edit table for FND-02 (v0.96 line numbers; logging only, logic unchanged)

| Line | Today | Change |
|------|-------|--------|
| 2738 | `catch(e) { dictOverrides = {}; }` | add `lhWarn('字庫覆寫資料損毀，已忽略', e)` (extra site) |
| 2742 | `catch(e) {}` around `setItem` | disappears with `lhSet` swap |
| 2799 | `catch(e) { return false; }` (fetch rhyme overrides) | `lhWarn('字庫覆寫檔載入失敗', e)` before return |
| 3348 | `.catch(() => { polyphonicsOrderMap = new Map(); })` | add `lhWarn('破音字排序檔載入失敗', e)` (extra site, exactly CONTEXT's example) |
| 3986 | `catch(e) {}` (IDB open) | `lhWarn('IndexedDB 開啟失敗，改走網路', e)` |
| 3993 | `catch(e) {}` (wordlist meta fetch) | `lhWarn('詞庫版本檔讀取失敗', e)` |
| 4019 | `catch(e) {}` (chunk load) | `lhWarn('詞庫分段 ' + i + ' 載入失敗', e)` |
| 4041 | `catch(e) { return; }` (wordlist overrides) | `lhWarn('詞庫修正檔載入失敗', e)` before return |
| 5024 | `catch (e) { /* 嘗試下一個 */ }` | `lhWarn('AI 造詞模型失敗，換下一個', e)` (logic stays; Phase 2 rewrites) |
| 5256 | `catch (_) { /* 第二輪失敗就算了 */ }` | `lhWarn('AI 第二輪補挑失敗', e)` (rename `_` to `e`) |
| 5260 | `lastErr = e; if (!e.quota) {...}` | add `lhWarn('AI 模型失敗', e)` (extra site) |
| 5312 | `try { reply = ... break; } catch (_) {}` | `lhWarn('情境生成模型失敗，換下一個', e)` |
| 6220 | `catch(e) {}` in `postFeedback` | `lhWarn('回報送出失敗', e)` (background, non-critical) |

User-initiated failures already surface through `showToast` (import `:3890`, context generation `:5341`); leave them, and add `lhWarn` beside them so the console also has the cause. Strings stay Traditional Chinese (Taiwan).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Fixed sleeps / `networkidle` in browser tests | Explicit readiness promises (`__hoyunReady`) | Playwright guidance | Faster and deterministic |
| Mock by aborting requests | Fulfil with 200 bodies the app can parse | Chromium logs failed loads as `console.error` | Zero-error assertion stays meaningful |
| Hand-written fake timers | `page.clock` | Playwright >= 1.45 | Verified on 1.63.0 |
| `localStorage` unguarded writes | Central safe writer returning a boolean | — | Quota becomes visible |

**Deprecated/outdated:** none relevant. CONCERNS.md still mentions IE11 and Safari 12; irrelevant for this phase.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Legacy quota signals `NS_ERROR_DOM_QUOTA_REACHED`, code 1014 (old Firefox) and code 22 (old WebKit/Blink) | Pattern 6 | Extra checks are harmless; if a browser uses another name, banner would not show there (Chromium path is verified) |
| A2 | Modern Safari/Firefox throw `QuotaExceededError` from `setItem` (MDN snippet only checks the name) and old Safari private mode used a zero quota | Pattern 6 | Device behaviour differs; Andy checks on real Safari later (not automatable here) |
| A3 | Chromium-only automated coverage is acceptable | Pitfall 11 | A Safari-only storage bug passes Phase 1 tests |
| A4 | A commit-time IndexedDB quota failure surfaces as a transaction `abort` with `tx.error.name === 'QuotaExceededError'` | Pattern 6 | Probe only simulated `abort()` via injection; helper listens to `complete`/`error`/`abort` so it is covered either way |
| A5 | GitHub Pages serves everything in the repo root (so `tests/`, `package.json`, `js/safety.js` become public) and `Cache-Control: max-age=600` | Pitfall 9 | Harmless content (no secrets); cache window drives the `?v=` advice |
| A6 | `page.clock.install()` does not break unrelated app timers in the save-failure test | Pattern 6 | Only the banner test installs it; if flaky, use a test-only `LH_THROTTLE_MS` override |
| A7 | Keeping `apiKey_*` values inside the IDB backup is acceptable (same origin, user's own device) | Pattern 8 | If Andy disagrees, add `secret` keys to the exclusion list; restore then loses them |

## Open Questions

1. **Does a failing wordlist-cache write count as "IndexedDB 寫入失敗" for criterion 4?**
   - What we know: the only user-data IDB writes in Phase 1 are the new `backups`; wordlist cache is a cache (loss means a slower next load).
   - What's unclear: ROADMAP criterion 4 says IDB write failure shows 「存檔失敗」.
   - Recommendation: backup failure -> sticky banner; cache failure -> one non-sticky toast per session. Both are automatically tested, so the criterion is satisfied literally without a misleading sticky banner. Planner may escalate cache failures to the banner if Andy wants literal sameness.
2. **Fix the three extra silent sites (2738, 3348, 5260)?** Recommendation yes (3 one-line logs); alternative is narrowing the scanner to the 10 listed.
3. **How to discharge the SUS flag on Playwright without a human checkpoint?** Recommendation: automated `npm audit signatures` + empty `postinstall` gate (above) and mention in the plan summary.
4. **Real data fixture:** synthetic `v096-localStorage.json` is the default; if Andy exports his actual browser state later, drop it in as a second fixture file.
5. **`__hoyunReady` hook:** accepted as a test-only global? Recommendation yes; it is two lines and removes the only race.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Tests, static server | yes | v26.8.1 | — |
| npm | Install | yes | 11.19.0 | — |
| Playwright package | Runner | no (not yet in repo); installs fine | 1.63.0 | — |
| Playwright Chromium | Headless tests | **installed during research** (cache `~/Library/Caches/ms-playwright`: `chromium-1243`, `chromium_headless_shell-1243`, `ffmpeg-1011`; Chrome Headless Shell 153.0.8010.12) | 1243 | Plan still includes `npx playwright install chromium` (idempotent; 3m20s cold) |
| Google Chrome (system) | not needed | no | — | Bundled Chromium |
| Python 3.13 | not needed (Node server) | yes | 3.13.15 | — |
| IndexedDB / localStorage | Runtime | yes (Chromium) | — | — |

Probes ran on macOS Sonoma x64 Hackintosh without issues. A scratch install exists at `/private/tmp/claude-502/.../scratchpad/probe` (not in the repo) and can be deleted. **Missing dependencies with no fallback:** none. **Missing dependencies with fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `@playwright/test` 1.63.0 (single runner for browser, static-scan and storage tests) |
| Config file | `playwright.config.mjs` (none yet — Wave 0) |
| Quick run command | `npx playwright test tests/<file>.spec.mjs` |
| Full suite command | `npm test` (about 1-2 min: golden parallel, smoke about 25-30 s serial, rest a few seconds) |

### Phase Requirements -> Test Map
| Req ID | Success criterion | Behavior | Test Type | Automated Command | File Exists? |
|--------|-------------------|----------|-----------|-------------------|-------------|
| FND-01 | SC1 | Search results for ~35 cases x 3 modes equal v0.96 snapshots; no orphan/missing golden files; deterministic | integration (browser) | `npx playwright test tests/golden.spec.mjs` | Wave 0 |
| FND-01 | SC2 | Every distinct inline handler fires with zero `pageerror`/`console.error`; coverage gate on handler names; negative control catches a broken handler; import valid/invalid JSON | integration (browser) | `npx playwright test tests/smoke.spec.mjs` | Wave 0 |
| FND-02 | SC3 | No catch/`.catch` without a call or throw in `index.html` inline scripts and `js/**/*.js` | static scan | `npx playwright test tests/scan.spec.mjs -g "catch"` | Wave 0 |
| FND-02 | SC3 | Induced failures (wordlist-overrides 500, malformed chunk, feedback POST failure) leave `[好韻器]` console records; import error shows toast | integration | `npx playwright test tests/error-visibility.spec.mjs` | Wave 0 |
| PERF-04 | SC4 | Injected `QuotaExceededError` on localStorage shows one sticky banner, dismissible, throttled (`page.clock`), readable in light and dark theme | integration | `npx playwright test tests/save-failure.spec.mjs -g "localStorage"` | Wave 0 |
| PERF-04 | SC4 | Injected IDB failure: backup -> banner; wordlist cache -> toast + console record | integration | `npx playwright test tests/save-failure.spec.mjs -g "IndexedDB"` | Wave 0 |
| FND-03 | SC5 | Every key used by `index.html`/`js/**` is in the registry; no direct `localStorage.` outside `safety.js`; admin keys excluded | static scan | `npx playwright test tests/scan.spec.mjs -g "registry"` | Wave 0 |
| FND-03 | SC5 | Old-version fixture: all keys present and identical after boot; baseline backup exists; keep-newest-3 rotation; migrate x3 idempotent; failing migration restores exactly; admin key never in backup; IDB v1->v2 keeps `wl` | integration | `npx playwright test tests/storage.spec.mjs` | Wave 0 |
| FND-03 | SC5 (robustness) | Corrupt JSON in `haiku_lyrics` no longer kills search (cards still render); raw value preserved in backup | integration | `npx playwright test tests/storage.spec.mjs -g "corrupt"` | Wave 0 |

### Sampling Rate
- **Per task commit:** the single spec file touched (above commands), plus `tests/golden.spec.mjs` for any edit to `index.html`.
- **Per wave merge:** `npm test`.
- **Phase gate:** `npm test` fully green, then `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `package.json`, `package-lock.json`, `playwright.config.mjs`, `.gitignore` additions (`node_modules/`, `test-results/`, `playwright-report/`)
- [ ] `tests/serve.mjs`, `tests/helpers.mjs`
- [ ] `tests/golden.spec.mjs` + `tests/golden/*.json` (generated from untouched v0.96)
- [ ] `tests/smoke.spec.mjs`, `tests/scan.spec.mjs`, `tests/save-failure.spec.mjs`, `tests/storage.spec.mjs`, `tests/error-visibility.spec.mjs`
- [ ] `tests/fixtures/v096-localStorage.json`, `v096-corrupt.json`, `wordlist-stub.ndjson`
- [ ] `npx playwright install chromium` and the automated `npm audit signatures` gate
- [ ] Test-only hook edit `window.__hoyunReady` / `__hoyunWordlistReady` in `index.html` (first app commit)

## Security Domain

`security_enforcement` is enabled in `.planning/config.json` (ASVS level 1, block on high). `[VERIFIED: Read config via cat this session]`

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | no accounts |
| V3 Session Management | no | — |
| V4 Access Control | partial | Origin is shared with `admin/` (admin key in localStorage): registry exclusion list; never snapshot unknown keys |
| V5 Input Validation | yes | Restore/backup paths validate record shape (`data` is a plain object of strings, keys must be registered) before `setItem`; existing `importSession` already validates arrays; banner text built with `textContent` |
| V6 Cryptography | no | none needed; do not invent encryption for backups |
| V8 Data Protection | yes | No secrets in logs (`lhWarn` must not print `apiKey_*` values); admin key excluded from backup; `apiKey_*` flagged `secret` so Phase 8 export drops it |
| V12 Files/Resources (dev server) | yes | `tests/serve.mjs` binds `127.0.0.1` only and rejects path traversal |
| V14 Configuration / supply chain | yes | Exact-version pins, committed lockfile, `npm audit signatures` gate, no postinstall scripts |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Admin key copied into a backup or log | Information Disclosure | Explicit exclusion list + test asserting absence |
| Restore writing attacker/unknown keys | Tampering | Restore only registered keys, string values only |
| Banner/toast built from error text with `innerHTML` | Tampering (XSS) | `textContent` only; messages are fixed Traditional Chinese strings |
| Test server exposing the repo beyond localhost | Information Disclosure | Bind `127.0.0.1`, normalise path, deny escapes |
| Typosquatted/compromised dev dependency | Tampering | Pinned versions, lockfile, signature/provenance check, only two direct devDependencies |
| Existing XSS-prone template strings (`${s.text}` in textarea, `${w}` in `onclick`) | Tampering | Out of scope here (EDIT-01, Phase 8); noted so Phase 1 does not copy the pattern into new UI |

## Project Constraints (from CLAUDE.md)

Extracted from `/Users/Shared/Coding Projects/Lucky Hawaii/.claude/CLAUDE.md` and Andy's global `~/.claude/CLAUDE.md` (treated with the authority of locked decisions):
- **Pure frontend, free tiers, no server:** GitHub Pages + Cloudflare Worker; no required build step; splitting `index.html` into plain JS/CSS files is allowed (`js/safety.js` qualifies).
- **Data safety:** updates must never lose saved lyrics, overrides, settings; localStorage/IndexedDB changes must be backward compatible or migrated.
- **Language:** all UI strings Traditional Chinese (Taiwan), **never Simplified**; code comments in Traditional Chinese explaining *why*.
- **Style:** 4-space indentation, single quotes, camelCase functions/variables, UPPER_CASE constants, private helpers prefixed `_`, section headers `// ==================== X ====================`, user-facing errors via `showToast()`, no linter/formatter, no modules in `index.html` (global scope).
- **Existing storage key conventions:** keep current key names; new keys use `lh:*`.
- **GSD workflow enforcement:** repo edits go through a GSD command (`/gsd-execute-phase` for this phase).
- **Hygiene:** `.planning/`, `scripts/`, `handoff.md` are gitignored (`commit_docs=false`); move-vs-fix commits stay separate; "commit" keyword triggers a git commit; update `handoff.md` after each coding task but let GSD state files lead (global rule); acceptance questions to Andy as numbered yes/no items; avoid jargon and variable names when explaining to Andy.
- **Do not touch** `reascripthelp.html` / `_Lyx_HOME.lua` (not relevant here).

## Sources

### Primary (HIGH confidence)
- Live probes on this machine (scratch project, real `index.html`, Playwright 1.63.0, Node v26.8.1, Chrome Headless Shell 153): baseline load + zero errors; 249/62 handler enumeration and click loop; negative control; coverage name diff; golden capture x2 determinism; storageState preload; quota `DOMException` shape; IndexedDB v1->v2 blocked/pending/after-close behaviour; abort injection; `page.clock.fastForward`; unhandled rejection as `pageerror`; corrupt-JSON crash.
- `/Users/Shared/Coding Projects/Lucky Hawaii/index.html` (Read this session): 2177-2178, 2180-2488, 2727-2818, 3286-3350, 3385-3556, 3740-3944, 3946-4076, 4190-4270, 4440-4604, 4960-5271, 5273-5451, 5453-5811, 5842-6318.
- `/Users/Shared/Coding Projects/Lucky Hawaii/admin/index.html:328-333`, `/data/rhyme-dict-overrides.json` (Read).
- npm registry (`npm view`, `npm audit signatures`) and gsd `package-legitimacy` seam.
- https://playwright.dev/docs/test-webserver (webServer options), https://playwright.dev/docs/api/class-browser#browser-new-context (`storageState` shape), https://github.com/acornjs/acorn/blob/master/acorn/README.md (parse API, `acorn-walk` separate).
- https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API/Using_the_Web_Storage_API (`QuotaExceededError` name check).
- Project research reused: `.planning/research/PITFALLS.md` (Pitfall 1, 15), `.planning/research/ARCHITECTURE.md` section 3 (schema/migrate shape), `.planning/research/SUMMARY.md`, `.planning/codebase/TESTING.md`, `CONCERNS.md`.

### Secondary (MEDIUM confidence)
- GitHub Pages `max-age=600` caching, from `research/PITFALLS.md` (community sources).

### Tertiary (LOW confidence)
- Legacy browser quota error names/codes (training knowledge, A1/A2).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — installed, run, signatures verified; SUS flag explained and gated.
- Architecture: HIGH — every mechanism probed on the real page.
- Pitfalls: HIGH for Chromium behaviour (probed); MEDIUM for Safari/Firefox storage semantics (assumed).

**Research date:** 2026-10-03
**Valid until:** 2026-11-02 (Playwright releases roughly monthly; re-check the pin if planning slips past that)
