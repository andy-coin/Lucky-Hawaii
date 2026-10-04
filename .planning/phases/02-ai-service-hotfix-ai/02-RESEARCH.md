# Phase 2: AI Service Hotfix AI 服務不斷線 - Research

**Researched:** 2026-10-03
**Domain:** Cloudflare Worker (wrangler deploy, cron, KV, rate limit binding) + Gemini / Groq free-tier LLM reliability + vanilla-JS client migration
**Confidence:** HIGH on Cloudflare and Gemini (official docs read raw, wrangler 4.147.0 spiked locally); MEDIUM on Groq limits; a short list of `[ASSUMED]` items is in the Assumptions Log.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Worker 原始碼與部署**
- Worker 原始碼搬進受版控的 `worker/` 目錄（`worker/src/index.js`＋`worker/wrangler.toml`）；目前 `admin/woker.js` 被 .gitignore 忽略、不在 git，保留原檔不刪，新版以 `worker/` 為準
- `wrangler.toml` 的 Worker 名稱沿用線上的 `lucky-hawaii`（網址 lucky-hawaii.is3000dollar.workers.dev 不變），宣告既有 KV 綁定 `USER_FEEDBACK_KV`（namespace id 部署前由 Andy 登入後查得，計畫需提供一行查詢指令與填寫位置）
- Secrets（GEMINI_API_KEY、GROQ_API_KEY、USER_REPORT_KEY）一律 `wrangler secret put`，不進 git；本機開發用 `worker/.dev.vars`（gitignore）
- wrangler 以 devDependency 精確版本鎖在 root package.json，提供 `npm run worker:dev`、`npm run worker:deploy`
- 正式部署（含第一次 `wrangler login`）列為 Andy 的 Human check；Claude 把所有東西備好、本機 `wrangler dev` 全部測過，部署步驟寫成一頁白話清單

**模型 fallback 鏈（Worker 端）**
- 前端只送「任務內容」，Worker 決定用哪個模型；仍相容舊版前端送來的 `model/_provider/messages`（舊快取頁面不壞），但 `model` 只當偏好、必須在白名單內
- 每次嘗試有逾時（研究決定秒數，約 10–15 秒）；只有逾時、429、5xx、模型不存在（404）才換下一個；400 類請求錯誤直接回報不重試
- 失效模型自動跳過：同一 isolate 內記憶＋健康檢查結果存 KV
- 全部失敗時回結構化錯誤（代碼＋白話繁中訊息＋嘗試過的模型清單），前端顯示白話原因，不再空白或轉圈
- Gemini 3.x 思考模型需設定 thinking 預算，避免輸出被思考 token 吃光（研究查證參數）
- 模型 ID 與下架日期一律由研究查證官方文件，不憑記憶

**每日健康檢查與模型清單**
- Worker cron 每日一次（台灣深夜時段）用極短 prompt 測每個候選模型，結果寫入獨立的 KV namespace（不與回報 KV 混用，避免出現在後台回報列表）
- 「發布超過約半年就移除」：候選清單附發布日期，舊模型只在同家族有更新且健康的模型可用時才移除；清單至少保留 2 個可用模型，絕不清空
- Worker 提供 `GET /models` 回傳目前可用模型；網站模型選單改由此清單產生，並新增預設的「自動（推薦）」選項

**前端遷移**
- 舊 localStorage `selectedModel`（如 gpt-4.1 或已移除模型）開站時自動改為「自動」；沿用 Phase 1 的 lhSet／遷移機制（registry 內已有 selectedModel）
- 前端移除 GitHub Models／gpt-4.1 相關硬編碼（約 5 處）與前端 fallback 迴圈；保留可手動指定模型
- 失敗訊息走既有 showToast／錯誤可見機制（Phase 1）

**防濫用**
- 只接受白名單模型；請求 body 大小上限（研究建議值，約 32KB）；messages 數量上限；輸出 token 上限（Worker 強制覆寫，不信任前端）
- 若 Cloudflare 免費方案有 Rate Limiting binding，則加每 IP 速率限制；否則僅做大小／token 限制（研究查證）
- Origin 白名單維持 `https://andy-coin.github.io`；本機測試允許 localhost 來源只在 `wrangler dev` 環境

**測試**
- Worker 邏輯（fallback、白名單、上限、健康檢查淘汰規則）在 Node 以 mock fetch 測試，納入 `npm test`
- 本機 `wrangler dev` 整合測試：觸發 cron、打 `/`、`/models`、`/feedback`
- 前端：Phase 1 的 golden／smoke 保持全綠；新增「舊 selectedModel 自動遷移」與「全部失敗顯示白話原因」測試（mock Worker）

### Claude's Discretion
- 檔案切分、函式命名、逾時秒數與上限數值的確切值（以研究結論為準）
- 前端是否保留模型下拉選單的版面細節（維持現有 UI 風格）

### Deferred Ideas (OUT OF SCOPE)
- validateWordRhyme 對有聲母字尾的誤判（開心 vs 心）→ Phase 4（AI-04）
- 後台管理金鑰改走 header、防注入 → v2（FB-V2-01）／Phase 7
- 回報修正層 KV → Phase 7
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FND-05 | Worker 改用 `wrangler` 指令部署（設定入版控、secrets 不入庫） | Verified wrangler 4.147.0 works on Node 26.8.1/macOS 23.6 (spike); validated `worker/wrangler.toml` shape (below) with `wrangler deploy --dry-run`; `[secrets] required`, `keep_vars`, explicit KV id, deploy-diff prompt (Pitfalls 1-4); human-check checklist |
| AI-01 | 移除已下架模型；舊 `selectedModel` 自動遷移 | Dead services verified (GitHub Models retired, qwen3.6 shut down); exact hard-code list (index.html lines); read-time normalization (not `lhMigrate`) so Phase 1 invariants hold (Pitfall 5) |
| AI-02 | Worker 端 fallback 鏈：逾時、429/5xx 才重試、失效模型跳過、全部失敗有原因 | Status classification table, cooldown design, `AbortSignal.timeout` verified in workerd, response/error shapes, thinking-token handling |
| AI-05 | 每日健康檢查、自動更新模型清單、只留近半年且可用 | Cron config + local trigger URL verified; no release-date field in either provider API (so dated registry); keep/drop rule table evaluated for today; KV free-tier budget |
| AI-07 | Worker 防濫用：白名單、大小上限、輸出 token 上限 | Allowlist + caps with concrete numbers, Rate Limiting binding verified locally, origin/CORS notes, key-in-header, no upstream error leakage |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

Extracted from `/Users/Shared/Coding Projects/Lucky Hawaii/.claude/CLAUDE.md` (project) and `/Users/Will/.claude/CLAUDE.md` (user global). Treat as locked.

- **Hosting:** keep pure-frontend GitHub Pages + Cloudflare Worker; free only (AI and hosting on free tiers).
- **Data safety:** an update must never lose saved lyrics, overrides, or settings (localStorage / IndexedDB stay backward compatible or migrate).
- **Language:** UI strings and comments in Traditional Chinese (Taiwan); Simplified Chinese is forbidden everywhere. Code comments explain *why*, in Chinese.
- **Code style:** 4-space indent, single quotes, camelCase functions/variables, UPPER_CASE for constant tables, `// ==================== 名稱 ====================` section headers. No ESLint/Prettier. No build step for the site.
- **Client error handling:** user-facing errors through `showToast()`; Phase 1 added `lhWarn()` and a scan test that fails any empty/`return`-only `catch` in `index.html` inline scripts and `js/*.js` (`tests/scan-lib.mjs:29-38` collects root `*.html` inline scripts and `js/`; `worker/` is not scanned).
- **GSD workflow:** file edits happen through a GSD command (`/gsd-execute-phase`); nothing is pushed (milestone branch `gsd/v0.96-stabilize`, `main` untouched).
- **User preferences:** after any coding task update `handoff.md` (gitignored); keep plans batchable ("一口氣做完再集中測" from MEMORY.md); explain in plain language, not variable names; GUI consistency matters (keep existing dropdown style).
- **Reference files** `reascripthelp.html`, `_Lyx_HOME.lua` are read-only (not relevant to this phase).

## Summary

Three things are broken today, independent of the reported Gemini 2.5 shutdown. (1) GitHub Models was retired 2026-07-30, and `index.html` still defaults to `'gpt-4.1'` in five places, so an old `selectedModel` leaves the dropdown empty and AI is never called. (2) Groq `qwen/qwen3.6-27b` was shut down 2026-09-14 but is still in `LLM_MODELS`. (3) Every `LLM_MODELS` entry has `autoFallback: false` so the front-end fallback loop only ever tries one model. The reported "Gemini 2.5 shuts down 2026-10-16" is **not confirmed**: Google's official deprecations table says `gemini-2.5-flash | June 17, 2025 | No shutdown date announced`, with a note that 2.5 access is limited to projects that used it before; a third-party tracker that published the date has since withdrawn it. The plan should still drop 2.5 (it is access-limited) but the deadline is a self-imposed deploy target, not a Google date.

The architecture is a small server-side chain. The Worker owns a dated model registry (Google and Groq expose no release date through their list APIs, so dates must live in code), a `POST /ai` endpoint that takes only `{prompt, model?}`, a legacy shim at `POST /` that still answers old cached pages in the response shape their `_provider` expects, `GET /models` for the dropdown, and a daily cron that probes every candidate and writes the active list to a separate KV namespace. Gemini calls use the `x-goog-api-key` header and `thinkingLevel` (LOW on 3.7/3.8; default MINIMAL on 3.5-flash-lite) so thinking tokens do not eat the output budget; Groq gpt-oss gets `reasoning_effort: 'low'`.

`wrangler` 4.147.0 was installed and run in a scratch directory on this machine (Node v26.8.1, Darwin 23.6): `wrangler dev`, local KV, the Rate Limiting binding, `AbortSignal.timeout`, `/cdn-cgi/local/scheduled`, `.dev.vars`, `--var`, and `deploy --dry-run` (works without login) all behave as documented. Two traps were found by experiment: a top-level key written after a `[table]` silently becomes a field of that table, and Playwright's runner mis-resolves `export default` from a `.js` file unless the folder has `"type": "module"`. The biggest planning risk is Phase 1's test suite, which asserts that opening v0.96 data leaves `selectedModel: "gpt-4.1"` untouched; the migration must therefore be a read-time normalization, not a boot-time write.

**Primary recommendation:** Build `worker/` as four small ES modules (`index.js` routes, `ai.js` chain, `models.js` registry + keep/drop rule, `health.js` cron) pinned to wrangler 4.147.0; make the front end a thin client (`GET /models`, `POST /ai`, display `message`); normalize stale `selectedModel` to `'auto'` at read time; put Worker logic tests in the Playwright runner (no new test dependency); keep all production deploy steps as one plain-language Human-check page.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Which model answers / fallback order | API / Backend (Worker) | — | Client must not know model IDs; a deprecation becomes a Worker config change |
| Per-attempt timeout, retry classification, cooldown | API / Backend (Worker) | — | Only the Worker sees provider status codes and `Retry-After` |
| Allowlist, body/message/token caps, origin check | API / Backend (Worker) | — | Trust boundary; client values are never trusted |
| Per-IP rate limit | API / Backend (Rate Limiting binding) | — | Cloudflare edge counter, no hand-rolled state |
| Daily health check and active-model list | API / Backend (cron `scheduled()`) | Database / Storage (`AI_STATE_KV`) | Cron writes, request path reads (with isolate cache) |
| Feedback storage and admin routes | API / Backend (ported verbatim) | Database / Storage (`USER_FEEDBACK_KV`) | Must keep `/feedback`, `/reports.json`, `/reports/decision`, `/reports/delete`, `/reports` behaviour byte-compatible |
| Model dropdown content | Browser / Client | API (`GET /models`) | List is data from Worker; DOM built with `Option`, not `innerHTML` |
| Stale `selectedModel` handling | Browser / Client | — | Read-time normalization against the live list; storage untouched |
| Plain-language failure display | Browser / Client | API (`message` field) | Worker supplies Traditional Chinese text; client only shows it |
| Deploy and config | Developer machine (wrangler) | Cloudflare account | Config in git; secrets only in Cloudflare |
| Site hosting | CDN / Static (GitHub Pages) | — | Unchanged; deployed separately from the Worker |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| wrangler | 4.147.0 (published 2026-10-02) | `wrangler dev` / `deploy` / `secret` / `kv` | Official Cloudflare CLI. `npm audit` on 4.147.0 = 0 vulnerabilities; 4.102.0–4.143.0 depend on `undici` 7.x with a high-severity advisory (see audit below). `engines.node: ">=22.0.0"`. Ran on Node v26.8.1. [VERIFIED: npm registry + local install + `npm audit`] |
| Cloudflare Workers runtime | `compatibility_date = "2026-10-01"` (workerd 1.20261001.1 bundled) | Worker runtime | Worked with that date in the spike [VERIFIED: local `wrangler dev`] |
| `@playwright/test` | 1.63.0 (already installed, Phase 1) | Runs Worker unit tests too | `npm test` already runs it; no new test dependency |
| Node built-ins | Node 26.8.1 | `fetch`, `Request`, `Response`, `AbortSignal.timeout` for tests | Same Web APIs as workerd |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none) | — | — | Phase adds no runtime dependency: Worker code is dependency-free, hand-written fake KV is ~15 lines |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Playwright runner for Worker tests | `node --test` | Works (verified), but needs a second command chained into `npm test`. Playwright runner needs `worker/package.json` `{"type":"module"}` (verified) and gives one reporter |
| Playwright runner | `@cloudflare/vitest-pool-workers` | Runs inside workerd (higher fidelity) but adds vitest + a pool dependency tree; not needed because `wrangler dev` smoke already covers workerd |
| Workers AI (`[ai]` binding) as last-resort | — | **Skip.** Needs an extra binding, neuron accounting, untested Chinese quality; the registry shape makes it a later one-entry add |
| Dynamic discovery of new models | — | **Skip.** Neither API gives release dates, so auto-added models could not obey the 6-month rule; adding a model = edit `models.js` + redeploy |
| `wrangler.jsonc` | `wrangler.toml` | Both supported; CONTEXT locks `.toml` (comments allowed) |

**Installation:**
```bash
npm install --save-exact -D wrangler@4.147.0
```

**Version verification:** `npm view wrangler version` → `4.147.0`; `time.modified` `2026-10-02T11:30:48.072Z`; `dependencies.workerd` `1.20261001.1`; `dependencies.miniflare` `5.20261001.0-alpha`. Installed in a scratch dir: `wrangler --version` printed `4.147.0`; `npm audit` printed `found 0 vulnerabilities`; `npm audit signatures` verified registry signatures and 21 attestations. Same check on 4.140.0 reported `3 vulnerabilities (2 moderate, 1 high)` rooted in `undici 7.0.0 - 7.29.0` pulled by `miniflare 4.20260617.0 - 5.20260926.0-alpha`, "fix available via `npm audit fix --force`, Will install wrangler@4.147.0" — so do **not** pin an older release to dodge the "too new" flag. These are dev-time tools only; nothing from `node_modules` is deployed to GitHub Pages (`node_modules/` is in `.gitignore`).

npm 11.19 prints `install-scripts 2 packages have install scripts not yet covered by allowScripts: esbuild@0.28.1 (postinstall) workerd@1.20261001.1 (postinstall)`. Observed: `wrangler dev`, `deploy --dry-run` still worked without approving them. Do not add `allowScripts` config. [VERIFIED: local run]

## Package Legitimacy Audit

Run via `gsd-tools query package-legitimacy check --ecosystem npm wrangler workerd miniflare` on 2026-10-03.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| wrangler | npm | years; latest version published 1 day ago (`too-new` is about the release, not the package) | 28.78M/wk | github.com/cloudflare/workers-sdk | SUS (too-new) | Flagged — planner must add `checkpoint:human-verify` before the install task. Supporting evidence for the checkpoint: signatures verified, 21 attestations, 0 audit findings, official repo, no `postinstall` on wrangler itself |
| workerd (transitive) | npm | latest published 2026-10-02 | 31.8M/wk | github.com/cloudflare/workerd | SUS (too-new) | Transitive of wrangler; `postinstall: node install.js` is its standard binary check. Covered by the same checkpoint |
| miniflare (transitive) | npm | latest published 2026-10-01 | 30.7M/wk | github.com/cloudflare/workers-sdk | SUS (too-new) | Transitive; version `5.20261001.0-alpha` is what wrangler 4.147.0 pins (verified in `npm ls`). Same checkpoint |

**Packages removed due to [SLOP] verdict:** none. (A first call with the string `wrangler@4.140.0` returned SLOP `does-not-exist`; that is an artefact of passing a version suffix, not a real finding — the checker takes bare package names only.)
**Packages flagged as suspicious [SUS]:** wrangler (and transitives workerd, miniflare) — planner inserts `checkpoint:human-verify` before `npm install -D wrangler@4.147.0`. The checkpoint text should say: "audit signatures and `npm audit` were clean on 2026-10-03; fallback is to skip the Worker tooling and paste the bundle by hand, which loses FND-05".

## Architecture Patterns

### System Architecture Diagram

```
 Browser (andy-coin.github.io)                                Cloudflare Worker "lucky-hawaii"
 ┌────────────────────────────┐                      ┌─────────────────────────────────────────────┐
 │ boot: GET /models ─────────┼─────────────────────▶│ router (index.js)                           │
 │   menu = [自動] + models   │◀── {models,updatedAt}│  OPTIONS ─▶ CORS preflight                  │
 │   stale selectedModel ─▶   │                      │  GET  /models ─▶ active list (KV, 5-min     │
 │   shown as 自動 (no write) │                      │                  isolate cache)             │
 │                            │                      │  POST /ai ─▶ validate ─▶ rate-limit ─▶ chain│
 │ AI click: POST /ai ────────┼─────────────────────▶│  POST /   ─▶ legacy shim ─▶ same chain,     │
 │   {prompt, model, temp}    │◀── {ok,text,model}   │             reply shaped for old _provider  │
 │   show message on !ok      │    or {ok:false,     │  /feedback, /reports.json, /reports/*       │
 │                            │     code,message,    │   ─▶ ported verbatim ─▶ USER_FEEDBACK_KV    │
 └────────────────────────────┘     tried}           │  GET /health.json?key ─▶ AI_STATE_KV       │
                                                     │  POST /health/run?key ─▶ runHealthCheck     │
                                                     └───────────────┬─────────────────────────────┘
                                                                     │ chain (ai.js)
        cron "17 19 * * *" UTC (= 03:17 Taiwan) ─▶ scheduled()       ▼
              │                                   candidates = registry ∩ active ∩ not-cooled
              ▼                                   for each: fetch(AbortSignal.timeout 12 s)
        runHealthCheck (health.js)                  200+text ─▶ done
          probe all registry models in parallel     429 ─▶ cooldown(Retry-After) ─▶ next
          ─▶ computeActive(results, now)            5xx/timeout/empty ─▶ short cooldown ─▶ next
          ─▶ AI_STATE_KV.put('health')              404 ─▶ dead 1 h (isolate) ─▶ next
                                                    401/402/403 ─▶ provider cooldown ─▶ next
                                                    413 ─▶ next      400 ─▶ stop, BAD_REQUEST
                                                    all failed ─▶ 503 {code, message, tried[]}
                                                            │
                                         ┌──────────────────┴──────────────────┐
                                         ▼                                     ▼
                         generativelanguage.googleapis.com          api.groq.com/openai/v1
                         x-goog-api-key header                      Authorization: Bearer
```

### Recommended Project Structure
```
worker/
├── package.json        # {"private":true,"type":"module"}  (needed by Playwright import, Pitfall 6)
├── wrangler.toml       # name, main, compatibility_date, keep_vars, cron, secrets.required, KV, ratelimits
├── .dev.vars           # GITIGNORED: GEMINI_API_KEY=… GROQ_API_KEY=… USER_REPORT_KEY=…
├── src/
│   ├── index.js        # router + CORS + origin + body cap + ported admin/feedback routes + scheduled export
│   ├── ai.js           # validate, legacy shim, chain, status classification, provider adapters
│   ├── models.js       # MODELS registry (dated), computeActive(), label/lookup helpers
│   └── health.js       # runHealthCheck(env, now), readHealth(env) with isolate cache
└── test/
    └── dev-smoke.mjs   # `npm run worker:smoke`: wrangler dev + local fake provider + cron trigger
tests/
├── worker-helpers.mjs  # fake KV, fake env, fetch mock installer, hang-until-abort helper
├── worker-ai.spec.mjs        # SC2, SC5
├── worker-health.spec.mjs    # SC4 logic
├── worker-admin.spec.mjs     # SC3 characterization of ported routes
├── worker-config.spec.mjs    # SC3 toml/gitignore/dry-run checks
└── ai-client.spec.mjs        # SC1, SC2(display), SC4(menu follows)
```
Rationale: four modules keep each file pure and unit-testable; `admin/woker.js` stays untouched on disk (gitignored). No client file is added (Phase 3 splits `index.html`; `tests/scan-lib.mjs` only scans `js/`).

### Pattern 1: Validated `worker/wrangler.toml` (dry-run clean, zero warnings)
**What:** the exact file shape that `wrangler deploy --dry-run` accepted with no warnings in the spike.
**When to use:** the first task of the plan. Keys before the first `[table]` header (Pitfall 1).
**Example:**
```toml
# Source: validated 2026-10-03 with wrangler 4.147.0 (`wrangler deploy --dry-run`), config keys per
# https://developers.cloudflare.com/workers/wrangler/configuration/
name = "lucky-hawaii"                 # 沿用線上名稱，網址不變
main = "src/index.js"
compatibility_date = "2026-10-01"
workers_dev = true
keep_vars = true                      # 後台手動設的純文字變數不被部署清掉（secrets 本來就不會被清）

[triggers]
crons = ["17 19 * * *"]               # UTC；= 台灣 03:17，避開整點

[secrets]                             # 部署前驗證這三個 secret 已存在，缺了就中止
required = ["GEMINI_API_KEY", "GROQ_API_KEY", "USER_REPORT_KEY"]

[[kv_namespaces]]
binding = "USER_FEEDBACK_KV"
id = "<wrangler kv namespace list 查到的既有 id>"   # 必填！省略會被當成新建一個空的

[[kv_namespaces]]
binding = "AI_STATE_KV"
id = "<wrangler kv namespace create AI_STATE_KV 印出的 id>"

[[ratelimits]]
name = "AI_LIMITER"
namespace_id = "1001"

  [ratelimits.simple]
  limit = 20
  period = 60                         # 只能是 10 或 60
```
Dev-only flags are **not** in `.dev.vars` (Pitfall 3): `wrangler dev --var ALLOW_LOCAL_ORIGIN:1 --var GEMINI_BASE:http://127.0.0.1:PORT --var GROQ_BASE:http://127.0.0.1:PORT`. (Optional `GEMINI_BASE`/`GROQ_BASE` overrides default to the real hosts and let `dev-smoke.mjs` run the whole chain against a local fake provider.)

### Pattern 2: Dated model registry and the keep/drop rule
**What:** a static ordered array; the cron decides which entries are *active*. Release dates for Gemini come from Google's table; Groq has no date source (assumed).
**Example:**
```js
// 模型候選清單（強→弱 = 自動鏈順序）。released 取自官方文件的 Release date 欄；Groq 沒有官方日期，標 ASSUMED
// Source: https://ai.google.dev/gemini-api/docs/deprecations (rows quoted verbatim in Standard Facts below)
export const MODELS = [
    { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', provider: 'gemini', family: 'gemini-flash-lite',
      released: '2026-07-21', maxOut: 2048 },                                   // 預設思考 minimal，不送 thinkingConfig
    { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', provider: 'gemini', family: 'gemini-flash',
      released: '2026-09-02', maxOut: 2048, thinking: 'LOW' },                  // 3.7/3.8 不支援 minimal
    { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash', provider: 'gemini', family: 'gemini-flash',
      released: '2026-08-13', maxOut: 2048, thinking: 'LOW' },
    { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B', provider: 'groq', family: 'gpt-oss',
      released: '2025-08-05', maxOut: 1024, maxPromptChars: 4500, effort: 'low' },   // released = [ASSUMED]
    { id: 'qwen/qwen3.8-27b', label: 'Qwen3.8 27B', provider: 'groq', family: 'qwen',
      released: null, maxOut: 1024, maxPromptChars: 4500 },                      // Groq 標為 Preview；日期未知 → 永不算舊
    { id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B', provider: 'groq', family: 'gpt-oss',
      released: '2025-08-05', maxOut: 1024, maxPromptChars: 4500, effort: 'low' },
];

const STALE_DAYS = 183;           // 約半年
const MIN_ACTIVE = 2;

// results: { [id]: { ok: boolean, stage?: string } }；回傳要啟用的 id 陣列（依 MODELS 順序）。純函式，可直接單元測試
export function computeActive(results, nowMs) {
    const healthy = MODELS.filter(m => results[m.id]?.ok);
    const stale = m => m.released && (nowMs - Date.parse(m.released)) / 86400000 > STALE_DAYS;
    const fresherHealthy = m => healthy.some(o => o.family === m.family && o !== m && !stale(o)
        && (!m.released || !o.released || o.released > m.released));
    let active = healthy.filter(m => !(stale(m) && fresherHealthy(m)));
    if (active.length < MIN_ACTIVE) {                       // 保底：至少兩個，補回健康但太舊的
        for (const m of healthy) if (!active.includes(m) && active.length < MIN_ACTIVE) active.push(m);
        active = MODELS.filter(m => active.includes(m));
    }
    if (active.length === 0) active = MODELS.slice();       // 全掛也不清空：照註冊順序硬試
    return active.map(m => m.id);
}
```
Evaluated for today (2026-10-03, cutoff 2026-04-03): all three Gemini entries are fresh; `openai/gpt-oss-120b` and `-20b` are older than 183 days but their family `gpt-oss` has no newer healthy entry, so they are **kept** (CONTEXT's rule: "舊模型只在同家族有更新且健康的模型可用時才移除"). This means AI-05's literal "只保留近半年內發布" is satisfied only with that softening; surface it to Andy in the Human check text.

### Pattern 3: Chain with per-attempt timeout, classification, cooldown
**What:** one loop in `ai.js`; module-level `Map`s for cooldowns (per isolate; Workers KV is too slow and write-limited for this).
**Example:**
```js
// Source: pattern per https://ai.google.dev/gemini-api/docs/troubleshooting (retry only 429/408/5xx; never 400/402/403)
// AbortSignal.timeout verified in workerd 1.20261001.1: aborted fetch rejects with DOMException name 'TimeoutError'
const cooldown = new Map();   // id → untilMs；providerCooldown 同理；404 的 dead 用另一個 Map、1 小時

function classify(status) {                 // 回傳 'ok' | 'transient' | 'dead' | 'auth' | 'big' | 'fatal'
    if (status >= 200 && status < 300) return 'ok';
    if (status === 429 || status === 408 || status >= 500) return 'transient';
    if (status === 404) return 'dead';
    if (status === 401 || status === 402 || status === 403) return 'auth';
    if (status === 413) return 'big';       // Groq TPM：此模型吃不下，換下一個
    return 'fatal';                         // 其餘 4xx（含 400）：直接回報不重試
}

async function attempt(m, req, env) {
    const t0 = Date.now();
    try {
        const res = await fetchProvider(m, req, env, AbortSignal.timeout(Number(env.ATTEMPT_TIMEOUT_MS) || 12000));
        return { m, status: res.status, res, ms: Date.now() - t0 };
    } catch (e) {
        return { m, status: 0, error: e.name === 'TimeoutError' ? 'timeout' : 'network', ms: Date.now() - t0 };
    }
}
```
Chain rules (all numeric values are tunable constants at the top of `ai.js`):
- Build the candidate list: preferred model first (if allowlisted and active), then the active list in registry order; skip cooled/dead; if **everything** is cooled, try the one with the earliest cooldown rather than failing without a request.
- Max 4 attempts and a 28 s overall budget (stop before starting a new attempt after the budget); client timeout 35 s. [ASSUMED values]
- `429`: cooldown = `Retry-After` seconds if present (Groq documents `retry-after` "In seconds"; header only set on 429), else Gemini `error.details[].retryDelay` if parseable, else 60 s; clamp 10 s – 15 min.
- timeout / 5xx / empty text / `promptFeedback.blockReason`: 30 s cooldown, next model.
- `404`: mark dead for 1 h in isolate memory (the next cron probe decides durably), next model.
- `401/402/403`: cool the whole **provider** for 10 min (a bad key hits all its models), next model.
- `413`: next model, no cooldown. Also pre-skip Groq models when `prompt.length > maxPromptChars` (Groq TPM is 8K and counts the declared output budget).
- `400`: stop, return `BAD_REQUEST` (locked decision). Because the Worker builds provider bodies itself, a 400 almost always means *our* config is wrong; log status + provider message (truncated 200 chars, never the key), and the cron probe reports it as `reason:'bad-request'`.

### Pattern 4: Gemini and Groq request/response adapters
**Example:**
```js
// Gemini: key in header (not ?key=) so it never lands in logs/URLs.
// Source: https://ai.google.dev/gemini-api/docs/quickstart ( -H "x-goog-api-key: $GEMINI_API_KEY" )
//         https://ai.google.dev/api/generate-content (generationConfig.thinkingConfig / maxOutputTokens / temperature)
function geminiRequest(m, req, env) {
    const generationConfig = { temperature: req.temperature, maxOutputTokens: Math.min(req.maxTokens, m.maxOut) };
    if (m.thinking) generationConfig.thinkingConfig = { thinkingLevel: m.thinking };   // 'LOW'：見 Assumptions A3
    return fetch(`${env.GEMINI_BASE || 'https://generativelanguage.googleapis.com'}/v1beta/models/${encodeURIComponent(m.id)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        body: JSON.stringify({ contents: req.messages.map(x => ({ role: x.role === 'assistant' ? 'model' : 'user', parts: [{ text: x.content }] })), generationConfig }),
        signal: req.signal,
    });
}
// 回應：candidates[0].content.parts[].text 串起來；空字串或 promptFeedback.blockReason → 當成失敗換下一個
// 另存 modelStatus.modelStage / retirementTime（若有）供健康檢查提早淘汰

// Groq（OpenAI 相容）。max_tokens 已標為 deprecated，改用 max_completion_tokens
// Source: https://console.groq.com/docs/api-reference ; https://console.groq.com/docs/reasoning
function groqRequest(m, req, env) {
    const body = { model: m.id, messages: req.messages, temperature: req.temperature,
                   max_completion_tokens: Math.min(req.maxTokens, m.maxOut) };
    if (m.effort) body.reasoning_effort = m.effort;          // gpt-oss: low|medium|high
    return fetch(`${env.GROQ_BASE || 'https://api.groq.com/openai/v1'}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.GROQ_API_KEY}` },
        body: JSON.stringify(body), signal: req.signal,
    });
}
// 回應：choices[0].message.content；去掉 <think>…</think>（沿用舊前端行為）
```
Defensive extra (cheap insurance for A3): if Gemini returns 400 whose message matches `/thinking/i`, retry that same model once **without** `thinkingConfig`, and count it as one attempt.

### Pattern 5: Endpoint contracts
```text
POST /ai       body {prompt:string, model?:'auto'|id, temperature?:number, maxTokens?:number}
  200 {ok:true,  text, model:{id,label}, usage?:{total_tokens}, tried:[{id,status|error,ms}]}
  400 {ok:false, code:'BAD_REQUEST'|'MODEL_NOT_ALLOWED', message}
  403 {ok:false, code:'FORBIDDEN', message}                 (Origin not allowed)
  413 {ok:false, code:'TOO_LARGE', message:'內容太長，請縮短後再試'}
  429 {ok:false, code:'RATE_LIMITED', message:'操作太頻繁，請稍後再試'}
  503 {ok:false, code:'ALL_BUSY',  message:'AI 暫時都忙不過來，請稍後再試（已嘗試 N 個模型）', tried}
  503 {ok:false, code:'NO_MODEL',  message:'AI 目前沒有可用的模型，已通知維護，請稍後再試', tried:[]}
  503 {ok:false, code:'EMPTY',     message:'AI 這次沒有回覆內容，請再試一次', tried}
GET  /models   200 {ok:true, models:[{id,label,provider}], updatedAt, checkedAt}
GET  /health.json?key=USER_REPORT_KEY   200 raw health JSON   (red/green light for Andy; admin UI is Phase 7)
POST /health/run?key=USER_REPORT_KEY    runs runHealthCheck now, returns it (lets Andy verify prod without waiting for 03:17)
POST /         legacy body {_provider, model, messages, temperature, max_tokens}
  → same chain; reply shaped for the REQUESTED _provider so cached old pages parse it:
    _provider==='gemini' → {candidates:[{content:{parts:[{text}]}}]}
    otherwise            → {choices:[{message:{content:text}}], usage}
  errors → {error:{message}} with the matching status
```
No upstream error text, URLs or keys are ever included in client-visible bodies.

### Pattern 6: Client changes (exact edit list, `index.html`, line numbers read this session)
| Line(s) | Today | Change |
|---------|-------|--------|
| 4463 `WORKER_URL` | constant | keep; `callLLM` line 4574 hard-codes the URL again → use `WORKER_URL` |
| 4466-4474 `LLM_MODELS` | 5 hard-coded entries, `autoFallback:false` | replace by `let LLM_MODELS = [{ id: 'auto', label: '自動（推薦）', provider: 'auto' }]`; `loadModels()` replaces it from `GET /models` (`AbortSignal.timeout(5000)`; failure → `lhWarn` and keep `[auto]`); expose `window.__hoyunModelsReady = loadModels()` |
| 4477-4483 `getApiKey`, 4485-4489 `saveApiKey`, 4491 `isModelAvailable` | `workerProviders` includes `'github'`, `'claude'` | delete `isModelAvailable`/`getApiKey` use in the call paths; leave `saveApiKey` and the registered `apiKey_` prefix alone (registry scan tests) |
| 4493-4506 `renderModelSelect` | default `'gpt-4.1'` at 4496 and 4504; builds `<option>` via `innerHTML` | default `'auto'`; build with `new Option(label, id)`; `sel.value = known ? stored : 'auto'` **without** `lhSet` |
| 4507-4509 `onModelChange` | `lhSet('selectedModel', …)` | unchanged (this is the only writer) |
| 4511-4565 | commented-out legacy `callLLM` mentioning GitHub | delete the dead comment block |
| 4567-4633 `callLLM(model, prompt)` | posts `{_provider, model, messages…}` to the Worker root, parses per provider | post `{prompt, model: model.id, temperature: 0.95}` to `WORKER_URL + '/ai'`; on `!res.ok || !data.ok` throw `Error(data.message)` with that message; network failure → `連不上 AI 服務，請檢查網路後再試`; keep the token toast using `data.model.label`; keep `<think>` stripping |
| 5014-5020, 5204-5211, 5320-5327 | three copy-pasted `tryList` builders, default `'gpt-4.1'` at 5014, 5204, 5320 | one helper `aiTryList()` returning `[LLM_MODELS.find(m => m.id === selectedValue) || LLM_MODELS[0]]`; loops stay (Phase 4 rewrites them) |
| 5213 | `沒有可用模型，請到 ⚙️ 設定 API key` | obsolete; the Worker owns keys. Replace with the Worker `message` |
| 5234 | `if (m.id !== selectedId) showToast('已切到 …')` | compare against `data.model.id` returned by the Worker, not the selection |
| 5284 | `所有模型都失敗：${lastErr.message.slice(0,80)}` | show `lastErr.message` in full (it is already plain Traditional Chinese from the Worker) |
| `tests/helpers.mjs` 24-33 | mocks **every** Worker path except `/feedback` with a Gemini-shaped body | add `/models` and `/ai` handlers (below), else Phase 1 smoke scenarios break |

New client catch blocks must call `lhWarn` (Phase 1 scan rejects empty/`return`-only catches).

### Anti-Patterns to Avoid
- **Writing `selectedModel` at boot:** breaks Phase 1 assertions and loses a valid manual choice if `/models` is briefly unreachable (Pitfall 5).
- **`?key=` for Gemini:** keys end up in URLs and log lines; use `x-goog-api-key`.
- **Reading `AI_STATE_KV` on every request:** free plan is 100,000 reads/day; use a 5-minute isolate cache.
- **Trusting `Origin` as auth:** any non-browser client can fake it. Real abuse control = allowlist + caps + Rate Limiting binding.
- **Branching on `controller.cron`:** it is `""` when triggered locally (observed).
- **Retrying 400:** locked decision says no; do not add a "just in case" retry.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Deploying the Worker, secrets, KV ids | curl against the Cloudflare API or dashboard paste | `wrangler deploy` / `secret put` / `kv namespace list` | Handles the deploy diff, bindings, secret validation |
| Per-IP throttling | module-level counters or KV counters | `[[ratelimits]]` binding (`env.AI_LIMITER.limit({key})`) | Verified locally; KV counters would burn the 1,000 writes/day free budget |
| Per-attempt timeout | `setTimeout` + `AbortController` plumbing | `AbortSignal.timeout(ms)` | Verified in workerd: rejects `TimeoutError` |
| Daily schedule | a client-side ping or external scheduler | Cron Trigger + `scheduled()` | Free plan allows 5 crons per account |
| TOML parsing in tests | adding a TOML library | regex asserts + `wrangler deploy --dry-run` output | The dry run is the real parser |
| Worker test runner | vitest + workers pool | Playwright runner (already installed) | One reporter, no new tree |

**Key insight:** the Worker is ~300 lines of plain `fetch` glue. The risky parts are provider quirks (thinking tokens, TPM accounting, retired IDs) and Cloudflare deploy semantics (what a deploy overwrites), not algorithms — spend effort on tests of those, not on abstractions.

## Common Pitfalls

### Pitfall 1: Top-level key written after a table is silently swallowed
**What goes wrong:** `keep_vars = true` appended at the end of the file became a field of `[ratelimits.simple]`; wrangler only warned `Unexpected fields found in ratelimits[0].simple field: "keep_vars"` and the setting did nothing.
**Why it happens:** TOML scoping — everything after a `[table]` header belongs to it.
**How to avoid:** all scalar keys (`name`, `main`, `compatibility_date`, `workers_dev`, `keep_vars`) before the first `[` header; `worker-config.spec.mjs` asserts that `keep_vars` appears before the first table and that `wrangler deploy --dry-run` output contains no `WARNING`.
**Warning signs:** a yellow `Processing wrangler.toml configuration` block in any wrangler command.

### Pitfall 2: Omitting the KV `id` creates a new, empty namespace
**What goes wrong:** wrangler auto-provisions bindings declared without an id ("When you run `wrangler deploy`, resources will be created for you"). Feedback reports would still exist but be unbound; the admin page would show an empty list.
**How to avoid:** `USER_FEEDBACK_KV` always has an explicit `id`. Human check: `npx wrangler kv namespace list` and match the title, or open the Worker's Bindings tab. `worker-config.spec.mjs` fails if either `id` is missing or still a placeholder in a state intended for deploy (allow the placeholder only behind an explicit constant so Wave 0 can run before Andy logs in).

### Pitfall 3: Dashboard plain-text variables are overwritten on deploy; `.dev.vars` is filtered by `secrets.required`
**What goes wrong:** if Andy created `GEMINI_API_KEY`/`GROQ_API_KEY`/`USER_REPORT_KEY` as plain Variables (not Secrets) in the dashboard, a deploy would delete them. Secrets survive ("Wrangler will not delete your secrets unless you run `wrangler secret delete`"). Also, once `[secrets] required` exists, only those names load from `.dev.vars` (verified: an extra key came back `null`).
**How to avoid:** `keep_vars = true` (top of file) + `[secrets] required` (deploy aborts if any is missing) + checklist step "re-enter each key with `wrangler secret put`" when the dashboard shows them as plain text. Dev-only switches go through `--var`, never `.dev.vars`.

### Pitfall 4: First deploy over a dashboard-made Worker prompts with a diff
**What goes wrong:** since wrangler 4.50 a deploy over a dashboard-managed Worker shows what would change and asks to continue unless the change is purely additive. Answering yes to a diff containing `-` lines for `USER_FEEDBACK_KV` or a secret removes it.
**How to avoid:** the Human-check page says "read the diff; any red/minus line naming USER_FEEDBACK_KV, GEMINI_API_KEY, GROQ_API_KEY or USER_REPORT_KEY means answer No and fix `wrangler.toml`". [CITED: developers.cloudflare.com/changelog/2025-11-21-wrangler-deploy-remote-config-management/]

### Pitfall 5: Phase 1 tests assert that boot leaves `selectedModel` untouched
**What goes wrong:** `tests/storage.spec.mjs` has `backup: 舊版資料開啟後每個鍵值完全不變` (every key unchanged after opening v0.96 data), `restore: v0.96 舊資料完整備份並可完整還原` (`expect(await dumpLS(page)).toMatchObject(FIXTURE)` right after boot), and `restore: 從 localStorage 備援還原…` (`expect(after.selectedModel).toBe(FIXTURE.selectedModel)`). The fixture is `"selectedModel": "gpt-4.1"` (`tests/fixtures/v096-localStorage.json`). Writing `'auto'` at boot fails at least the first two. Using `lhMigrate` `{to: 2}` is worse: it flips `lh:schema` to `2`, which many tests assert as `'1'`, and Phase 8 owns the first real step.
**How to avoid:** normalize at **read time** in `renderModelSelect` (and in the helper that picks the model for a call): stored value not in the live list → treat as `'auto'`, write nothing. Success criterion 1 is then tested as "dropdown shows 自動 and the `/ai` request body has `model:'auto'`", with localStorage left as the user had it. If Andy prefers a write-back, it costs editing those three tests (carve out `selectedModel`); recommend against.
**Related:** `_lhBootSnapshot` is captured before the main script, so the baseline backup keeps `gpt-4.1` either way.

### Pitfall 6: Playwright's loader hands back a CJS wrapper for ESM `.js`
**What goes wrong:** `import worker from '../worker/src/index.js'` in a `*.spec.mjs` gave `TypeError: worker.fetch is not a function` (the module was wrapped, `worker.default.fetch`). Plain `node --test` handled the same file.
**How to avoid:** `worker/package.json` = `{"private": true, "type": "module"}` (verified: test passed), or name the files `.mjs`. Recommended: package.json, keeping `.js` as CONTEXT specifies.

### Pitfall 7: Gemini thinking tokens eat the output budget; `thinkingLevel` is per-model
**What goes wrong:** Google: "`max_output_tokens` … including thought tokens … If the model hits this limit while reasoning, it stops generating … and returns truncated or empty output … lower `thinking_level` instead of setting a small `max_output_tokens`." Supported levels: `gemini-3.8-flash` and `gemini-3.7-flash` = `low, medium, high` (default medium; **no minimal**); `gemini-3.5-flash-lite` = `minimal, low, medium, high` (default minimal). `thinkingLevel` on earlier models errors; sending `thinking_level` together with `thinking_budget` returns 400.
**How to avoid:** registry carries `thinking: 'LOW'` for 3.7/3.8 and nothing for 3.5-flash-lite; never send `thinkingBudget`; keep `maxOut: 2048` for Gemini; treat empty text as failure.

### Pitfall 8: Groq counts the declared output budget toward its 8K TPM, and the cheap model is a Preview
**What goes wrong:** free-tier rows: `openai/gpt-oss-120b | 30 | 1K | 8K | 200K` (RPM, RPD, TPM, TPD); client prompts can carry up to ~1000 candidate words (`getWordlistCandidates*` slice to 1000, index.html 4146/4196/4788) plus `cumulativeCandidates` growth across rounds, which is far over 8K tokens. `qwen/qwen3.8-27b` is listed under "Preview Models" ("may be discontinued at short notice").
**How to avoid:** `maxOut: 1024` for Groq, `maxPromptChars: 4500` pre-skip (assumes ~1.5 tokens per Chinese char: A6), 413 → next model, Gemini first in the chain (large context). Tell the planner that Phase 4 will cap candidates to ~80–150, after which the Groq pre-skip rarely fires.

### Pitfall 9: Neither provider returns a release date
**What goes wrong:** Gemini `Model` resource fields are `name, baseModelId, version, displayName, description, inputTokenLimit, outputTokenLimit, supportedGenerationMethods, thinking, temperature, maxTemperature, topP, topK` — no date. Groq `/openai/v1/models` returns `id, object, created, owned_by, active, context_window, public_apps`, but its documented sample shows several different models sharing `"created": 1693721698`, so `created` is not a release date.
**How to avoid:** release dates live in `models.js` and are edited by hand when a model is added (a short comment in the file says how). The cron cannot auto-add models. Optional early-warning: Gemini responses carry `modelStatus.modelStage` (`LEGACY` = "on the path to deprecation … Only existing customers can use this model") and `retirementTime`; record them in the health JSON and treat `LEGACY/DEPRECATED/RETIRED` like a stale model.

### Pitfall 10: Free-plan resource ceilings
**What goes wrong:** Workers Free: 10 ms CPU per request and per cron invocation (network wait does not count), 50 subrequests per invocation, 5 cron triggers per account, 100,000 requests/day. KV Free: 100,000 reads/day, 1,000 writes/day (account-wide, to different keys), 1 write/second to the same key. A feedback spam wave could exhaust KV writes and make the cron's `put` fail.
**How to avoid:** isolate cache (5 min) for health reads; exactly one `put` per cron run, wrapped in try/catch with `console.error`; ≤ 4 chain attempts + 6 cron probes + a few KV calls ≪ 50; no `list` calls in the AI path; do not parse more than the capped body.

### Pitfall 11: Body cap too tight for today's client
**What goes wrong:** CONTEXT suggests ~32 KB. Chinese is 3 bytes per char in UTF-8; 1000 candidate words of 3–4 chars joined by `、` is ~12–16 KB, and `cumulativeCandidates = [...activePool, ...newBatch]` (index.html 5100-5110) can grow over repeated clicks. A 32 KB cap could turn today's valid requests into 413s.
**How to avoid:** cap at 64 KB on the wire (check `Content-Length` first, then count bytes while reading — chunked uploads have no length), `messages` ≤ 8, total content ≤ 24,000 chars. Revisit after Phase 4 caps candidates.

### Pitfall 12: Old cached pages still call the Worker root with provider-shaped replies
**What goes wrong:** GitHub Pages caches `max-age=600`; the old client parses `data.candidates` for `_provider:'gemini'` and `data.choices` otherwise.
**How to avoid:** the legacy shim in Pattern 5. Deploy order: Worker first, then Andy pushes the site. A stale `model` outside the allowlist on the legacy path is treated as `auto` (heals old clients, e.g. `gpt-4.1`); on `/ai` it is rejected 400 `MODEL_NOT_ALLOWED` (see Assumption A7 / Open Question 3).

### Pitfall 13: Ignore rules
`.gitignore` already has the pattern `woker.js` (matches `admin/woker.js`; does not match `worker/`). Add `.dev.vars*`, `.wrangler/` and make sure `worker/.dev.vars` shows as ignored (`git check-ignore -v worker/.dev.vars`). `.wrangler/` appears next to the config (verified: created in the config's directory when run with `--config`).

## Code Examples

### Fake KV and fetch mock for Worker tests (Playwright runner, no browser)
```js
// tests/worker-helpers.mjs — Source: spike verified under Playwright 1.63.0 on Node 26.8.1
export class FakeKV {
    constructor(init = {}) { this.m = new Map(Object.entries(init)); this.puts = 0; }
    async get(k) { return this.m.has(k) ? this.m.get(k) : null; }
    async put(k, v) { this.puts++; this.m.set(k, typeof v === 'string' ? v : String(v)); }
    async delete(k) { this.m.delete(k); }
    async list() { return { keys: [...this.m.keys()].map(name => ({ name })) }; }
}
export const makeEnv = (over = {}) => ({
    GEMINI_API_KEY: 'g-test', GROQ_API_KEY: 'q-test', USER_REPORT_KEY: 'admin-test',
    USER_FEEDBACK_KV: new FakeKV(), AI_STATE_KV: new FakeKV(), ATTEMPT_TIMEOUT_MS: '60', ...over,
});
// handlers: [(url, init) => Response | 'hang' | Error]；每次呼叫記在 calls 裡，測試用來斷言「失效模型不再被打」
export function installFetch(handler) {
    const real = globalThis.fetch, calls = [];
    globalThis.fetch = async (url, init = {}) => {
        calls.push({ url: String(url), init, body: init.body ? JSON.parse(init.body) : null });
        const r = await handler(String(url), init, calls.length);
        if (r === 'hang') return new Promise((_, rej) => init.signal?.addEventListener('abort', () => rej(init.signal.reason)));
        if (r instanceof Error) throw r;
        return r;
    };
    return { calls, restore: () => { globalThis.fetch = real; } };
}
```

### `/ai` request through the router (SC2 timeout case)
```js
// tests/worker-ai.spec.mjs
import { test, expect } from '@playwright/test';
import worker from '../worker/src/index.js';
import { _resetState } from '../worker/src/ai.js';
import { makeEnv, installFetch } from './worker-helpers.mjs';

test.beforeEach(() => _resetState());
const ai = (env, body, origin = 'https://andy-coin.github.io') =>
    worker.fetch(new Request('https://w/ai', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env);

test('第一個模型逾時 → 換下一個並成功', async () => {
    const ok = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '心動、微光' }] } }] }), { status: 200 });
    const f = installFetch((url, _i, n) => n === 1 ? 'hang' : ok());
    try {
        const res = await ai(makeEnv(), { prompt: 'x', model: 'auto' });
        const j = await res.json();
        expect(res.status).toBe(200);
        expect(j.ok && j.text).toBe('心動、微光');
        expect(j.tried[0]).toMatchObject({ error: 'timeout' });
    } finally { f.restore(); }
});
```

### Health-check cron body
```js
// health.js — one KV put per run; probes in parallel; ok = HTTP 200 and non-empty text
export async function runHealthCheck(env, now = Date.now()) {
    const results = {};
    await Promise.all(MODELS.map(async m => {
        const r = await probe(m, env);                   // 極短 prompt「只回覆 OK」，maxOut 256
        results[m.id] = r;                               // { ok, status, ms, reason, stage?, retirementTime? }
    }));
    const active = computeActive(results, now);
    const doc = { v: 1, checkedAt: new Date(now).toISOString(), results, active };
    try { await env.AI_STATE_KV.put('health', JSON.stringify(doc)); }
    catch (e) { console.error('[好韻器] 健康檢查結果寫入 KV 失敗', e.message); }   // 額度滿了也不能讓 cron 例外中斷
    return doc;
}
export default { /* … */ async scheduled(_controller, env, ctx) { ctx.waitUntil(runHealthCheck(env)); } };
```

### Local cron trigger and dev smoke
```bash
# Source: https://developers.cloudflare.com/workers/configuration/cron-triggers/#test-cron-triggers-locally
npm run worker:dev                      # wrangler dev --config worker/wrangler.toml --var ALLOW_LOCAL_ORIGIN:1
curl "http://127.0.0.1:8787/cdn-cgi/local/scheduled?format=json"     # → {"outcome":"ok","noRetry":false}
curl -H 'Origin: http://localhost:4310' http://127.0.0.1:8787/models
```
Observed in the spike: the route is `/cdn-cgi/local/scheduled` (not the older `/__scheduled`); no `--test-scheduled` flag was needed.

### `package.json` additions
```json
"worker:dev": "wrangler dev --config worker/wrangler.toml --var ALLOW_LOCAL_ORIGIN:1",
"worker:check": "wrangler deploy --dry-run --outdir worker/.wrangler/dryrun --config worker/wrangler.toml",
"worker:deploy": "wrangler deploy --config worker/wrangler.toml",
"worker:smoke": "node worker/test/dev-smoke.mjs"
```
`worker:check` needs no login (verified); `npm test` stays Playwright-only and includes the Worker unit specs.

### Mock additions for `tests/helpers.mjs`
```js
// 在 lucky-hawaii.is3000dollar.workers.dev 分支內、現有 /feedback 之前：
if (u.pathname === '/models') return route.fulfill({ status: 200, contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({ ok: true, updatedAt: '2026-10-03T00:00:00Z', models: models ?? [
        { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', provider: 'gemini' },
        { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B', provider: 'groq' }] }) });
if (u.pathname === '/ai') return aiFail
    ? route.fulfill({ status: aiFail.status, contentType: 'application/json', body: JSON.stringify(aiFail.body) })
    : route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: true, text: aiReply ?? '', model: { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite' }, tried: [] }) });
```
`bootPage` gains `models` and `aiFail` options and its final `Promise.all` also awaits `window.__hoyunModelsReady`. The Playwright `route.fulfill` for `/ai` and `/models` is same-origin-agnostic because the existing mock is on the Worker host; add CORS headers only if the page's fetch needs them (the existing `/feedback` mock does not set any, so Playwright's fulfilled responses are not CORS-checked the same way — match the existing handler's style).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| GitHub Models `gpt-4.1` as default | removed (service retired) | 2026-07-30 | AI dead for any user with stale `selectedModel` |
| Groq `qwen/qwen3.6-27b` | `qwen/qwen3.8-27b` (Preview) | shutdown 2026-09-14 | remove old id |
| Gemini `?key=` URL, `thinkingBudget`, `gemini-2.5-flash` | header key, `thinkingLevel`, 3.x models | 2026 | 2.5 is access-limited to prior users |
| Groq `max_tokens` | `max_completion_tokens` | docs mark `max_tokens` Deprecated | use new name |
| `/__scheduled` cron test route | `/cdn-cgi/local/scheduled` | current docs | local trigger URL |
| Dashboard-edited Worker, manual paste | `wrangler deploy` with config in git | wrangler ≥ 4.50 adds remote-diff prompt | safer first deploy |

**Deprecated/outdated:**
- `gemini-3.1-flash-lite`: deprecation table shows shutdown May 7, 2027, replacement `gemini-3.5-flash-lite`; not worth adding.
- Gemini Interactions API docs: official examples are now Interactions-style (`thinking_level` in `generation_config`); this phase keeps `generateContent` (documented in the API reference this session, `thinkingConfig.thinkingLevel` enum `MINIMAL/LOW/MEDIUM/HIGH`).

## Standard Facts (verbatim quotes backing registry values)

All Gemini rows from https://ai.google.dev/gemini-api/docs/deprecations.md.txt, fetched raw 2026-10-03:

```text
| `gemini-3.8-flash` | September 2, 2026 | No shutdown date announced |   |
| `gemini-3.7-flash` | August 13, 2026 | No shutdown date announced |   |
| `gemini-3.5-flash-lite` | July 21, 2026 | No shutdown date announced |   |
| `gemini-3.1-flash-lite` | May 7, 2026 | May 7, 2027 | `gemini-3.5-flash-lite` |
| `gemini-2.5-flash` | June 17, 2025 | No shutdown date announced |   |
> **Note:** To ensure reliable performance for everyone, we are limiting access to the 2.5 models to users who have actively used them in the past. These models are not deprecated and will continue to be served until further notice through the API.
> **Note:** The **shutdown dates listed in the table indicate the *earliest possible dates* on which a model might be retired**.
```
Thinking levels (https://ai.google.dev/gemini-api/docs/thinking.md.txt):
```text
| gemini-3.8-flash | On (medium) | low, medium, high |
| gemini-3.7-flash | On (medium) | low, medium, high |
| gemini-3.5-flash-lite | On (minimal) | minimal, low, medium, high |
```
`ThinkingLevel` enum (https://ai.google.dev/api/generate-content): `THINKING_LEVEL_UNSPECIFIED`, `MINIMAL`, `LOW`, `MEDIUM`, `HIGH`.
Gemini free tier: pricing page shows `Input price | Free of charge` for 3.8 Flash, 3.7 Flash, 3.6 Flash, 3.5 Flash, 3.5 Flash-Lite and 3.1 Flash-Lite; rate limits "are applied per project, not per API key" and exact RPM/RPD "can be viewed in Google AI Studio" (not published).
Groq rows (https://console.groq.com/docs/rate-limits and /models): `openai/gpt-oss-120b | 30 | 1K | 8K | 200K`, `openai/gpt-oss-20b | 30 | 1K | 8K | 200K`, `qwen/qwen3.8-27b | 30 | 1K | 8K | 200K` (RPM, RPD, TPM, TPD; the page labels the table "base limits for the Developer plan", so free-tier equality is MEDIUM). `qwen/qwen3.6-27b | 09/14/26 | qwen/qwen3.8-27b` in deprecations. 429 headers: `retry-after | 2 | In seconds`, "`retry-after` is only set if you hit the rate limit and status code 429 is returned." Models endpoint sample fields: `id, object, created, owned_by, active, context_window, public_apps`.

## Runtime State Inventory

Not a rename phase, but a migration-adjacent one (deploy takeover of an existing dashboard Worker). Answered explicitly:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `USER_FEEDBACK_KV` holds user feedback records (keys `${Date.now()}_${rand}`); admin pages read them | Bind with the existing id; never create a new namespace; no data migration |
| Live service config | The deployed Worker `lucky-hawaii` has bindings/variables set in the dashboard (names per CONTEXT: `USER_FEEDBACK_KV`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `GITHUB_API_KEY`, `USER_REPORT_KEY`); whether the three keys are Secrets or plain Variables is **unknown** | Human check: look at the dashboard; `keep_vars = true` + `[secrets] required` guard; read the deploy diff |
| OS-registered state | None — verified: no launchd/cron/task registered for this repo's Worker work (nothing in repo references one) | None |
| Secrets/env vars | `GITHUB_API_KEY` becomes unused (GitHub Models retired); other names unchanged | Leave until deploy is confirmed, then optionally delete in dashboard; code never reads it |
| Build artifacts | Browsers cache old `index.html` up to 10 min (GitHub Pages `max-age=600` per STACK.md); old pages call Worker root | Legacy shim; deploy Worker before the site |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | tests, wrangler | ✓ | v26.8.1 | — |
| npm | install, scripts | ✓ | 11.19.0 | — |
| wrangler | FND-05 local dev + dry run | ✓ (installs and runs) | 4.147.0 | — |
| Playwright + Chromium | all `npm test` | ✓ (Phase 1: 104 tests) | 1.63.0 | — |
| Cloudflare login / account access | production deploy, `kv namespace list`, `secret put` | ✗ (needs Andy in a browser) | — | Human check; everything else prepared and tested locally |
| Real Gemini / Groq API keys on this machine | live probe | ✗ | — | Mocked providers in tests; live verification is the post-deploy Human check plus `POST /health/run` |
| Network to developers.cloudflare.com / providers | research only | ✓ | — | — |

**Missing dependencies with no fallback:** Cloudflare login (Andy). Plan must end with the Human-check page, and success criterion 3's production half cannot be automated.
**Missing dependencies with fallback:** provider keys (mock + Human check).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `@playwright/test` 1.63.0 (also used for Node-only Worker specs); `wrangler dev` smoke as a plain Node script |
| Config file | `playwright.config.mjs` (`testDir: 'tests'`, static server on 4310, `retries: 0`) |
| Quick run command | `npx playwright test tests/worker-ai.spec.mjs tests/worker-health.spec.mjs tests/worker-admin.spec.mjs tests/worker-config.spec.mjs` (no browser pages, seconds) |
| Full suite command | `npm test` (currently 104 tests, about 65 s); plus `npm run worker:smoke` before the Human check |

### Phase Requirements → Test Map
| Req ID / Criterion | Behavior | Test Type | Automated Command | File Exists? |
|--------------------|----------|-----------|-------------------|-------------|
| AI-01 / SC1 | v0.96 fixture with `selectedModel:'gpt-4.1'` boots: dropdown value `auto`, AI request body `model:'auto'`, localStorage still `gpt-4.1` | e2e | `npx playwright test tests/ai-client.spec.mjs -g "舊模型"` | ❌ Wave 0 |
| AI-01 / SC1 | valid stored model (in `/models` list) is kept; unreachable `/models` keeps `[自動]` and does not erase the stored choice | e2e | `npx playwright test tests/ai-client.spec.mjs -g "保留"` | ❌ Wave 0 |
| AI-02 / SC2 | primary hangs → timeout → second model answers (`tried[0].error==='timeout'`) | unit | `npx playwright test tests/worker-ai.spec.mjs -g "逾時"` | ❌ Wave 0 |
| AI-02 / SC2 | 429 + `retry-after` → next model; second request skips the cooled model (mock call count) | unit | `… -g "429"` | ❌ Wave 0 |
| AI-02 / SC2 | 404 marks dead, later requests skip it; 5xx → next; 400 → stop with `BAD_REQUEST`; 413 → next; 401/403 cools provider | unit | `… -g "分類"` | ❌ Wave 0 |
| AI-02 / SC2 | all fail → 503 `ALL_BUSY` + plain-language message + `tried[]`; client shows the message (no spinner) | unit + e2e | `… -g "全部失敗"` and `npx playwright test tests/ai-client.spec.mjs -g "白話"` | ❌ Wave 0 |
| AI-02 | Gemini bodies use header key, `thinkingLevel:'LOW'` only for 3.7/3.8, `maxOutputTokens ≤ 2048`; Groq uses `max_completion_tokens ≤ 1024`; 400-about-thinking retries once without it | unit | `… -g "請求內容"` | ❌ Wave 0 |
| AI-02 | legacy `POST /` reply shapes for `_provider` gemini / groq / github; stale model → auto | unit | `… -g "舊版"` | ❌ Wave 0 |
| FND-05 / SC3 | `wrangler.toml` has name `lucky-hawaii`, both KV bindings with ids, cron, `keep_vars` before first table, `[secrets] required`, no key-like strings in `worker/`; `.dev.vars` and `.wrangler/` ignored, `worker/wrangler.toml` tracked | unit | `npx playwright test tests/worker-config.spec.mjs` | ❌ Wave 0 |
| FND-05 / SC3 | `wrangler deploy --dry-run` succeeds offline, stdout lists `USER_FEEDBACK_KV`, `AI_STATE_KV`, `AI_LIMITER`, no `WARNING` | integration | included in `worker-config.spec.mjs` (or `npm run worker:check`) | ❌ Wave 0 |
| FND-05 / SC3 | `/feedback` POST stores; `/reports.json?key=` lists newest first with `kvKey`; `/reports/decision`, `/reports/delete` behave as the ported code; wrong key 403; `/reports` 410 | unit | `npx playwright test tests/worker-admin.spec.mjs` | ❌ Wave 0 |
| FND-05 / SC3 | whole Worker under real `wrangler dev` with local KV: `/`, `/models`, `/feedback`, `/reports.json`, cron | smoke | `npm run worker:smoke` | ❌ Wave 0 |
| AI-05 / SC4 | `computeActive`: dead dropped; stale dropped only with a fresher healthy same-family model; `gpt-oss` (no fresher) kept; min 2; never empty | unit | `npx playwright test tests/worker-health.spec.mjs -g "淘汰"` | ❌ Wave 0 |
| AI-05 / SC4 | `runHealthCheck` writes exactly one `health` doc; KV put failure does not throw; stale (>72 h) health ignored | unit | `… -g "健康"` | ❌ Wave 0 |
| AI-05 / SC4 | local cron trigger runs and `/models` reflects result | smoke | `npm run worker:smoke` (calls `/cdn-cgi/local/scheduled?format=json`, expects `outcome:"ok"`) | ❌ Wave 0 |
| AI-05 / SC4 | site menu follows `/models` (change the mocked list → dropdown options change; 自動 first) | e2e | `npx playwright test tests/ai-client.spec.mjs -g "選單"` | ❌ Wave 0 |
| AI-07 / SC5 | `/ai` with non-allowlisted model → 400 `MODEL_NOT_ALLOWED` and **no upstream fetch** | unit | `npx playwright test tests/worker-ai.spec.mjs -g "白名單"` | ❌ Wave 0 |
| AI-07 / SC5 | body > 64 KB (Content-Length and chunked), > 8 messages, > 24,000 chars → 413/400, no upstream fetch | unit | `… -g "上限"` | ❌ Wave 0 |
| AI-07 / SC5 | client `maxTokens: 99999` → upstream body clamped (2048 Gemini / 1024 Groq) | unit | `… -g "token"` | ❌ Wave 0 |
| AI-07 | wrong Origin → 403; `ALLOW_LOCAL_ORIGIN` only honours localhost/127.0.0.1; rate limiter `success:false` → 429; absent binding → allow | unit | `… -g "來源"` | ❌ Wave 0 |
| AI-07 | errors never contain the API keys or upstream bodies | unit | `… -g "不洩漏"` | ❌ Wave 0 |
| Regression | Phase 1 golden/smoke/storage/scan stay green with updated `helpers.mjs` | e2e | `npm test` | ✅ (needs helpers update first) |

### Sampling Rate
- **Per task commit:** the quick-run Worker specs (< 15 s) plus the one spec named in the task.
- **Per wave merge:** `npm test`.
- **Phase gate:** `npm test` green, `npm run worker:check` clean, `npm run worker:smoke` green, then Andy's Human check before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `tests/helpers.mjs` — `/models` and `/ai` mocks (`models`, `aiFail` options), await `__hoyunModelsReady`; update `tests/smoke.spec.mjs:26-27` (it sets the dropdown to `gemini-3.5-flash-lite` by hand because of the stale-model problem this phase fixes)
- [ ] `tests/worker-helpers.mjs` — FakeKV, `makeEnv`, `installFetch`
- [ ] the five spec files above and `worker/test/dev-smoke.mjs`
- [ ] `worker/package.json` `{"private":true,"type":"module"}`; root `package.json` scripts and pinned `wrangler`
- [ ] `.gitignore` additions: `.dev.vars*`, `.wrangler/`
- [ ] Framework install: `npm install --save-exact -D wrangler@4.147.0` (after the `[SUS]` checkpoint)

## Security Domain

`security_enforcement` is on (ASVS level 1, block on `high`).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | partial | Admin routes keep the existing `?key=` check (hardening deferred to FB-V2-01/Phase 7). Provider keys are Worker secrets only |
| V3 Session Management | no | Stateless Worker |
| V4 Access Control | yes | Origin allowlist for browser routes; admin key for `/reports*`, `/health.json`, `/health/run`; allowlisted model ids only |
| V5 Input Validation | yes | Hand-written validator: JSON shape, `prompt`/`messages` types and limits, `model` against registry, `temperature` clamped to `[0, 1]` (Gemini documents 0.0–1.0), `maxTokens` clamped to the model cap |
| V6 Cryptography | no | No crypto in this phase; secrets via `wrangler secret put` |
| V13/API | yes | Body cap before parsing, rate limit binding, no upstream error passthrough |
| V14 Configuration | yes | Keys not in git (`.dev.vars*` ignored; `worker-config.spec.mjs` scans for `AIza` / `gsk_` shapes), `[secrets] required` |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Quota burn by anyone who finds the Worker URL (client-chosen `model`, `messages`, `max_tokens`) | DoS / Elevation | Allowlist, caps, server-forced token limits, Rate Limiting binding (per location, "permissive, eventually consistent") |
| Model-path injection (`models/${model}` interpolated into the Gemini URL) | Tampering | Only registry ids reach `fetch`; `encodeURIComponent` as belt and braces |
| API key in URL / logs (`?key=`) | Info disclosure | `x-goog-api-key` header for Gemini, `Authorization` for Groq; never log headers or bodies |
| Upstream error text leaking to the page | Info disclosure | Client gets only `code`, Chinese `message`, and `tried:[{id,status|error,ms}]` |
| Forged `Origin` from non-browser clients | Spoofing | Do not rely on it; caps and limiter are the real controls (documented honestly) |
| Cron/KV write exhaustion by feedback spam | DoS | try/catch around the single daily `put`; request path reads from isolate cache; feedback hardening is Phase 7 |
| Dev-only origin/base-URL switches leaking to production | Elevation | Flags come from `wrangler dev --var` only; not in `wrangler.toml`; the `*_BASE` overrides default to the real hosts |
| Dynamic dropdown labels from the network inserted as HTML | XSS | Build options with `new Option(label, id)` |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `openai/gpt-oss-120b` / `-20b` released 2025-08-05 (training memory; Groq pages show no date) | Pattern 2 | Only affects the stale rule; they are kept either way (no fresher same-family model) |
| A2 | `qwen/qwen3.8-27b` release date unknown; treated as never stale | Pattern 2 | None for keep/drop; if Groq retires the Preview, the 404 path and the cron handle it |
| A3 | REST `generateContent` accepts `"thinkingLevel": "LOW"` (upper-case enum names per the reference table); official examples are in Interactions style and none was found for REST casing | Pattern 4, Pitfall 7 | 400 on every Gemini 3.7/3.8 call. Mitigated by the retry-without-`thinkingConfig` guard and by the Human check (`POST /health/run`, click once) |
| A4 | A retired model returns HTTP 404 on both providers (Gemini documents `model_not_found 404`; Groq says "Requests to deprecated model IDs will return errors", status not stated) | Pattern 3 | If Groq uses 400/410, the model would be reported as BAD_REQUEST; cron probe still flags it `ok:false` and drops it from the active list |
| A5 | Timeouts 12 s per attempt, 4 attempts, 28 s budget, client 35 s; 20 requests/60 s per IP/location; 5-minute isolate cache; 30 s / 10 min / 1 h cooldowns | Pattern 3, Pattern 1 | Tuning only; constants live at the top of `ai.js` |
| A6 | About 1.5 tokens per Chinese character, so `maxPromptChars: 4500` keeps Groq prompts near 6.8K tokens + 1,024 output under the 8K TPM | Pitfall 8 | Groq 413/429 more often; the chain just moves on to Gemini |
| A7 | Legacy-path stale `model` is ignored (auto) while `/ai` rejects it with 400; CONTEXT says "`model` 只當偏好、必須在白名單內" and success criterion 5 says "rejected" | Pitfall 12 | If Andy wants strict rejection on legacy too, one-line change; old cached pages with `gpt-4.1` would then stay broken until refresh |
| A8 | Rate Limiting binding is available on Workers Free (web-search summary: GA 2025-09-19, "available on both Workers Free and Paid"; the official binding page read this session does not state plan availability) | Pattern 1 | Deploy could reject the `[[ratelimits]]` block. Human-check page says: if deploy errors on `ratelimits`, delete that block and redeploy; code feature-detects `env.AI_LIMITER` |
| A9 | `wrangler secret put NAME` replaces an existing dashboard plain Variable of the same name | Pitfall 3 | Andy may need to delete the plain variable first; checklist mentions it |
| A10 | Existing dashboard keys' type (Secret vs plain) is unknown | Runtime State Inventory | Covered by `keep_vars` + `secrets.required` + the diff prompt |
| A11 | Gemini 429 bodies carry `error.details[].retryDelay` and are parseable; `modelStatus` is actually populated by the API | Pattern 3, Pitfall 9 | Fall back to 60 s cooldown and to probe-only liveness |
| A12 | Groq free-tier limits equal the table shown (the page calls them Developer-plan base limits) | Standard Facts | Chain still handles 429s; only tuning of `maxPromptChars` changes |
| A13 | Choosing 64 KB / 24,000 chars / 8 messages as caps | Pitfall 11 | Too low → 413 on valid use; too high → none. Revisit after Phase 4 |

## Open Questions

1. **Are the three existing keys Secrets or plain Variables in the dashboard?**
   - What we know: deploy overwrites plain vars unless `keep_vars`; secrets survive.
   - What's unclear: Andy's current setup.
   - Recommendation: ship `keep_vars = true` and `[secrets] required`; Human-check page step 1 is "open dashboard → Worker → Settings → Variables and Secrets and note which are Secret", with `wrangler secret put` instructions for the plain ones.
2. **Is the Rate Limiting binding accepted on Andy's Free plan?**
   - Recommendation: include it (low cost), feature-detect in code, document the one-block removal.
3. **Legacy-path policy for a non-allowlisted `model` (ignore vs 400)?** Recommended: ignore on legacy, reject on `/ai` (A7). Planner may flip with one line; surface to Andy only if it matters.
4. **Gemini free-tier RPM/RPD for Andy's project** are visible only in AI Studio (`aistudio.google.com/rate-limit`); cooldown logic does not need them, but Andy can note them for later tuning.
5. **`thinkingLevel` casing against the live API** (A3) can only be proven with a real key; the Human check covers it, and the adapter has a guard.
6. **Does the "Oct 16" deadline still drive scheduling?** Evidence says no Google date exists; GitHub Models and qwen3.6 are already dead, so the deploy is urgent anyway. Report this to Andy in the Human-check page so he is not misled either way.

## Sources

### Primary (HIGH confidence)
- https://ai.google.dev/gemini-api/docs/deprecations.md.txt — model IDs, release dates, 2.5 access note, "earliest possible" wording (fetched raw 2026-10-03)
- https://ai.google.dev/gemini-api/docs/thinking.md.txt — thinking levels per model, `max_output_tokens` includes thought tokens
- https://ai.google.dev/api/generate-content.md.txt — `generationConfig`, `ThinkingConfig`, `ThinkingLevel`, `FinishReason`, `UsageMetadata`, `ModelStatus`/`ModelStage`
- https://ai.google.dev/api/models.md.txt — `Model` resource fields (no release date)
- https://ai.google.dev/gemini-api/docs/pricing.md.txt, /rate-limits.md.txt, /troubleshooting.md.txt, /api-errors.md.txt, /quickstart.md.txt (`x-goog-api-key`), /gemini-3.md.txt (cannot combine `thinking_level` and `thinking_budget`)
- https://console.groq.com/docs/deprecations, /models, /rate-limits, /reasoning, /structured-outputs, /api-reference, /errors (raw `.md`)
- https://developers.cloudflare.com/workers/wrangler/configuration/ (`keep_vars`, `triggers`, `[secrets]`, `kv_namespaces`, source-of-truth section), /workers/platform/limits/, /workers/configuration/cron-triggers/ (`/cdn-cgi/local/scheduled`), /workers/runtime-apis/bindings/rate-limit/, /workers/configuration/secrets/, /kv/platform/limits/, /workers/wrangler/commands/kv/
- npm registry: `npm view wrangler …`; local install of wrangler 4.140.0 and 4.147.0 with `npm audit`, `npm audit signatures`, `wrangler dev`, `wrangler deploy --dry-run` (scratch dirs, this session)
- Repo files read this session: `admin/woker.js`, `index.html` (4440-4643, 5000-5345, 5440-5470), `tests/helpers.mjs`, `tests/storage.spec.mjs`, `tests/smoke.spec.mjs`, `tests/scan-lib.mjs`, `tests/scan.spec.mjs`, `tests/fixtures/v096-localStorage.json`, `js/safety.js`, `playwright.config.mjs`, `package.json`, `.gitignore`

### Secondary (MEDIUM confidence)
- https://developers.cloudflare.com/changelog/2025-11-21-wrangler-deploy-remote-config-management/ (via search summary: deploy-over-dashboard diff, wrangler ≥ 4.50)
- https://benchr.org/deprecations/gemini-2-5-pro (states its earlier Oct 16 date "was incorrect and has been withdrawn"; consistent with Google's own table)
- Web search summary that the Rate Limiting binding is GA (2025-09-19) and available on Free and Paid

### Tertiary (LOW confidence)
- Third-party GitHub issues repeating "Oct 16, 2026" (no cited source; superseded by the two items above)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — wrangler installed, audited, and exercised on this machine; registry values quoted from official tables.
- Architecture: HIGH for Cloudflare mechanics (spike-verified); MEDIUM for provider error semantics A3, A4, A11.
- Pitfalls: HIGH — Pitfalls 1, 3 (filter half), 5, 6 reproduced or read from the repo; others from official docs.

**Research date:** 2026-10-03
**Valid until:** 2026-10-10 for model IDs and limits (these shift weekly: Gemini 3.x releases roughly monthly, Groq deprecated three models in the last 80 days); 30 days for the wrangler and Cloudflare mechanics.
