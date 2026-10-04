---
phase: 02-ai-service-hotfix-ai
reviewed: 2026-10-04T00:00:00Z
depth: standard
files_reviewed: 17
files_reviewed_list:
  - worker/src/index.js
  - worker/src/ai.js
  - worker/src/health.js
  - worker/src/models.js
  - worker/wrangler.toml
  - worker/check-ids.mjs
  - worker/test/dev-smoke.mjs
  - worker/DEPLOY.md
  - index.html (phase-02 diff only, 57803f0..HEAD)
  - package.json
  - tests/worker-helpers.mjs
  - tests/worker-ai.spec.mjs
  - tests/worker-health.spec.mjs
  - tests/worker-admin.spec.mjs
  - tests/worker-config.spec.mjs
  - tests/ai-client.spec.mjs
  - tests/helpers.mjs
  - tests/smoke.spec.mjs
findings:
  critical: 2
  warning: 7
  info: 6
  total: 15
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-10-04
**Depth:** standard
**Files Reviewed:** 17 (index.html reviewed as the phase-02 diff only)
**Status:** issues_found

## Summary

I read the Worker (routing, fallback chain, health check, model registry), the deploy config and checklist, the smoke script, the client diff and the Worker/client tests. I also ran `npm run worker:check` (dry-run, no deploy) and `npm run worker:smoke` (local `wrangler dev` against a fake upstream). Both pass.

What holds up:
- API keys travel only in headers (`x-goog-api-key`, `Authorization`) and never in URLs or responses. Upstream error text goes to `console.error` only, after redaction.
- The origin allow-list is exact-match and the local-origin switch is off in production.
- Body size is capped while streaming.
- The admin routes are a faithful port of `admin/woker.js`. The only differences are 204 instead of 200 on OPTIONS, a `Vary` header, and 404 JSON instead of 403 for unknown paths. None of these break `admin/index.html`.
- The daily cron expression is correct for Taiwan 03:17.
- KV is written once per health run, so the daily budget is not at risk from the health path.

Two issues need fixing before the checklist is used: the documented deploy flow fails its own test gate, and the fallback chain stops on any upstream 400. The warnings are mostly abuse and robustness gaps around the new limiter, the unlimited `/feedback` route, timing, and health-check sensitivity.

## Critical Issues

### CR-01: DEPLOY.md step 6 gate (`npm test`) fails by construction once steps 3 and 4 are done

**File:** `tests/worker-config.spec.mjs:70-76` (also `:28,63`), `worker/DEPLOY.md:126-139`
**Issue:**
- The test `config：KV id 沒填不准部署` runs `node worker/check-ids.mjs` against the working-tree `worker/wrangler.toml` and asserts `committed.status === 1`. That is only true while the placeholders are still in the file.
- DEPLOY.md fills the real ids in steps 3 and 4, then step 6 says all of `npm test`, `worker:check` and `worker:smoke` must pass. After the ids are filled, `check-ids` exits 0, the test fails, and the checklist tells Andy to stop and paste the failure to Claude.
- The same happens if Andy follows the step 7 ratelimits workaround. Deleting `[[ratelimits]]` makes `expect(toml).toContain('[[ratelimits]]')` (line 28) and the dry-run assertion that output contains `AI_LIMITER` (line 63) fail.
- The `error-visibility` flake is already documented in the checklist, but this failure is deterministic.

**Fix:** Stop the test reading the live file. Pin the placeholder case to a fixture string, the way the `both.toml` and `one.toml` cases already do. For example, build a temp toml from the template with placeholder ids and assert exit 1 for that. Drop the dependence on the committed state. Make the `[[ratelimits]]` and `AI_LIMITER` assertions conditional, or remove them. Alternatively, change DEPLOY.md so step 6 runs `npm test` before the ids are edited. The test fix is better because the ids stay in the committed file afterwards.

**Resolution:** fixed in 81b46f3 — 設定測試改用 fixture（佔位 id、兩個真 id、只填一個）；`[[ratelimits]]`／`AI_LIMITER` 斷言改成「有這段才檢查」。已實測：填真 id 且移除 ratelimits 的暫時 toml 下 4 個設定測試仍全過。DEPLOY.md 不需改（步驟本身沒變）。

### CR-02: Any upstream 400 ends the whole chain, but Gemini and Groq use 400 for model-, key- and region-level failures

**File:** `worker/src/ai.js:33-40, 205-213`
**Issue:**
- `classify()` maps every unlisted 4xx, including 400, to `'fatal'`, and `runChain` returns `BAD_REQUEST` immediately with no cooldown. This assumes 400 always means the browser sent a bad request.
- Google returns HTTP 400 for an invalid API key (`INVALID_ARGUMENT` / `API_KEY_INVALID`) and 400 `FAILED_PRECONDITION` for unsupported location or free tier not available. Groq returns 400 for decommissioned models.
- If the Gemini key is rotated or wrong, or a Gemini egress location is refused, the first Gemini model returns 400 on every request. The Groq models, which are healthy, are never tried. Because there is no cooldown, every user hits the same dead end until the next cron run removes the model. A user who picked that model explicitly is stuck even after that.
- `tests/worker-ai.spec.mjs:106` locks this behaviour in.

**Fix:** Only treat a 400 as the caller's fault when it is plausibly about the request, and otherwise degrade like a model failure. Concretely:
- Add a `'model400'` path: on a 400 that is not the thinking-retry case, log it, set a cooldown (for example `cooldown.set(m.id, now + TRANSIENT_COOLDOWN_MS)` or `providerCooldown` when the text matches `API key|location|not supported`), and continue the chain.
- Return `BAD_REQUEST` only if every attempted model answered 400, or if 400 came back from the last model with nothing left to try.
- Keep 400 as final for the legacy/`/ai` validation errors that Worker-side parsing already catches (`parseAiBody` / `parseLegacyBody`).

**Resolution:** fixed in f645137 — 400 類先冷卻該模型（訊息含 API key／location／FAILED_PRECONDITION／billing 則整家供應商冷卻）並繼續換手；只有每個試過的模型都回 400 類才回 BAD_REQUEST。thinking 重試邏輯不變。更新了鎖住舊行為的兩個測試並新增 3 個。

## Warnings

### WR-01: The chain can run about 40 s, past the client's 35 s abort; timeouts during body read are mislabelled

**File:** `worker/src/ai.js:8-10, 167-176, 108-109`
**Issue:**
- `CHAIN_BUDGET_MS = 28000` only blocks starting a new attempt. An attempt started at 27.9 s still gets the full 12 s `AbortSignal.timeout`, so the worst case is about 40 s. The client gives up at 35 s (`index.html` `callLLM`), shows "AI 回應太久", and the Worker keeps spending upstream quota for a reply nobody receives.
- `signal` also covers `res.json()`. If the timeout fires while the body is being read, `.catch(() => null)` turns it into an empty reply. That is classified as `'empty'`, adds a 30 s cooldown, and the final message can become `EMPTY` ("AI 這次沒有回覆內容") instead of a timeout or busy message.

**Fix:** Clamp each attempt to the remaining budget:
```js
const remaining = budget - (Date.now() - t0);
if (remaining < 1500) break;
const signal = AbortSignal.timeout(Math.min(timeoutMs, remaining));
```
In `callModel`, rethrow abort errors from `res.json()` instead of swallowing them, so `runChain` classifies them as timeouts: `await res.json().catch(e => { if (e?.name === 'TimeoutError' || e?.name === 'AbortError') throw e; return null; })`.

**Resolution:** fixed in 9403b5e — 每次嘗試的逾時壓在剩餘預算內（剩餘不足 1500ms 或預算一半就不再開新的），Worker 最長約 28 秒、低於瀏覽器 35 秒；讀本文時的 Timeout／Abort 照丟，歸類為 timeout。

### WR-02: Per-IP limiter is bypassable with IPv6 address rotation

**File:** `worker/src/index.js:76`
**Issue:** The limiter key is the full `CF-Connecting-IP` string. An IPv6 client normally controls a whole /64 (2^64 addresses), so a script can use a fresh source address per request and never reach 20/min. The Origin header is spoofable by any non-browser client, so the limiter is the only real cap. Each unthrottled request can trigger up to 4 upstream calls, which is enough to drain the free Gemini and Groq quota for everyone.

**Fix:** Key on the /64 prefix for IPv6:
```js
const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
const key = ip.includes(':') ? ip.split(':').slice(0, 4).join(':') : ip;
```
This is a rough prefix and fine for this purpose. Expanding `::` first is better if you want it exact.

**Resolution:** fixed in cd42d71 — 新增 `rateKey()`：IPv6 先展開 `::` 再取前 4 組（/64），IPv4 映射位址還原成 IPv4，IPv4 用完整位址。

### WR-03: `/feedback` has no size cap and no rate limit, and each call is a KV write against a 1000/day account budget

**File:** `worker/src/index.js:123-134`
**Issue:**
- `/feedback` is carried over unchanged, but the phase added a limiter and 64 KB cap only for the AI routes. `/feedback` still calls `request.json()` on an unbounded body and does one `KV.put` per request.
- The only gate is `Origin === ALLOWED_ORIGIN`, which a script can set. A simple loop exhausts the free-plan 1000 writes/day.
- After that, every KV write fails: new reports (HTTP 500), admin decisions, and the daily health write. The health write failure is only logged, so the model list silently goes stale and expires after 72 h.
- This directly hits the stated KV-write-amplification concern.

**Fix:** Route `/feedback` through `isRateLimited` and `readBodyCapped` (a smaller cap, such as 8 KB, is enough for a report). Return 429 and 413 in the existing feedback JSON shape. Keep the error body format unchanged so the client behaves the same.

**Resolution:** fixed in cd42d71 — /feedback 先限流（key 加 `fb:` 前綴，不吃 AI 額度；無綁定或限流器壞掉就放行）再以 `readBodyCapped(…, 8192)` 限大小，429／413 沿用 `{error}` 格式。順手把回報內文欄位加 `maxlength="2000"`，確保正常回報不會被 8 KB 上限擋掉。

### WR-04: Health probe is single-shot, so one transient failure hides a good model for up to 24 h

**File:** `worker/src/health.js:18-45`, `worker/src/models.js:43-48`
**Issue:** `computeActive` treats any `ok !== true` as unhealthy. A 429, 5xx, timeout, or one empty reply at 03:17 removes that model from `/models` and from the chain until the next run. If all three Gemini probes fail together (a short Google blip), the day runs on Groq only. Short prompts then use the weaker Groq models. Long prompts only work because of the `fits` fallback in `runChain`. Only `/health/run` with the admin key can undo this.

**Fix:** Retry once on transient outcomes (429/5xx/timeout/network/empty) before recording failure. Better, treat those outcomes as "unknown" and let `computeActive` keep the model if the previous document had it active. Reserve removal for 404 and for repeated failure.

**Resolution:** fixed in 1175428 — 探測遇暫時性失敗（逾時／網路／空回覆／429／5xx）等一下重試一次；重試後仍失敗標 `transient: true`，若昨天是啟用的（或沒有昨天的紀錄）今天沿用，連兩天都是暫時性失敗才掉出名單；404 等明確失敗照舊立刻淘汰、不重試。（沿用邏輯為判斷題，建議 Andy 確認這個取捨。）

### WR-05: Truncated output with an unclosed `<think>` (or a token-limit cut) is accepted as success

**File:** `worker/src/ai.js:78, 118, 81-84`
**Issue:**
- `stripThink` only removes complete `<think>...</think>` pairs. Groq reasoning models (the Qwen entry has no `effort` and no `reasoning_format`) can hit `max_completion_tokens` (1024) while still thinking.
- The content is then `"<think>…partial reasoning"`, which is non-empty, so `callModel` returns it as `ok`.
- The client's own `replace(/<think>[\s\S]*?<\/think>/g, '')` also leaves it. It is then split into "words", the candidate filter drops almost everything, and the user sees "AI 想不到更多符合的詞彙" while the chain never tried the next model.
- For Gemini, `finishReason: MAX_TOKENS` with thinking is not checked either.

**Fix:**
- Strip an unterminated block too: `.replace(/<think>[\s\S]*$/, '')` after the pair removal.
- For the Qwen entry send `reasoning_format: 'hidden'` (or the model's effort setting).
- Treat `finish_reason === 'length'` with an empty stripped result as `'empty'`.

**Resolution:** fixed in 60856d5 — `stripThink` 另外丟掉沒收尾的 `<think>…`，當空回覆換下一個模型。未做：Qwen 送 `reasoning_format: hidden`（無法在本機驗證該模型支援此參數，送錯可能讓整個模型回 400）；`finish_reason === length` 且內容為空本來就走 empty 路徑。

### WR-06: No top-level error handling in `fetch`, so an unexpected throw returns a CORS-less platform error page

**File:** `worker/src/index.js:206-244`
**Issue:** `handleAi` and `handleLegacy` rely on every callee not throwing. `readBodyCapped` can throw: `reader.read()` rejects on a client abort or a malformed chunked body. Any such throw becomes a Cloudflare 1101 page with no `Access-Control-Allow-Origin`. The browser reports it as a CORS or network failure, and the client message is the misleading "連不上 AI 服務". The feedback and admin routes each have their own try/catch; the AI routes do not.

**Fix:** Wrap `fetch` once:
```js
try { /* existing routing */ } catch (e) {
    console.error('[好韻器] 未預期錯誤', e?.message);
    return json(500, { ok: false, code: 'INTERNAL', message: 'AI 暫時無法使用，請稍後再試' }, origin, env);
}
```
Legacy callers read `error.message`, so the `{ error: { message } }` shape is needed on `/`.

**Resolution:** fixed in cd42d71 — `fetch` 外層 try/catch，未預期例外回 500 JSON（帶 CORS，不含內部細節，同時含 `message` 與 `error.message` 供新舊客戶端讀取）；路由本體搬到 `route()`。

### WR-07: `check-ids.mjs` accepts the same id for both namespaces

**File:** `worker/check-ids.mjs:12-15`
**Issue:** The check only validates format and count. If Andy pastes the feedback id into both blocks (an easy mistake when the commands in steps 3 and 4 print similar output), the `health` document is written into the feedback namespace. `/reports.json` then lists it as a junk report without a `ts`, and it sorts as NaN. The admin page can also delete it, which `/health.json` readers then see as "no record". This is the exact class of mistake the script exists to catch.

**Fix:** Add `new Set(ids).size !== ids.length` to the failure condition and mention it in the error message. Add a test case for it to `worker-config.spec.mjs`.

**Resolution:** fixed in 3b08926 — check-ids 加上 id 重複檢查（繁中訊息），設定測試新增相同 id 的案例。

## Info

### IN-01: Circular import `ai.js` <-> `health.js`

**File:** `worker/src/ai.js:5`, `worker/src/health.js:6`
**Issue:** `ai.js` imports `activeModels` from `health.js`, and `health.js` imports `callModel` and `classify` from `ai.js`. It works today only because everything is a hoisted function used at call time. Any future top-level use breaks it (for example a module-level constant derived from `classify`).
**Fix:** Move `callModel`, `classify`, `geminiRequest` and `groqRequest` into a small `upstream.js` that both import, or pass `activeModels` into `runChain` as a parameter.

**Resolution:** skipped — 範圍外（info，非瑣碎）。

### IN-02: Dead and stale client code

**File:** `index.html:4469-4473, 4939-4955, 5126-5182, 5228`
**Issue:**
- `saveApiKey` and its `apiKey_` localStorage write are unused now.
- `tryList` is always a single item, so the `for (const m of tryList)` loops and the log text "換下一個" no longer match what happens (the Worker does the switching).
- `window.__hoyunModelsReady` is a test hook shipped to production, which is fine but should be commented as such where it is read (it is, in the diff).
**Fix:** Delete `saveApiKey`. Replace the loops with a single `try`, or at least update the messages. This is cleanup, not urgent.

**Resolution:** skipped — `saveApiKey` 在目前的 index.html 已不存在，其餘為較大的清理，不在本次範圍。

### IN-03: `AbortSignal.timeout` is used without a fallback

**File:** `index.html` `callLLM` (35 s), `loadModels` (5 s)
**Issue:** On browsers without `AbortSignal.timeout` (older iOS Safari/WebView), the call throws a `TypeError` inside the `try`. For `callLLM` it is reported as "連不上 AI 服務", and AI never works there. The project targets phones and tablets.
**Fix:** Add a tiny helper that falls back to `AbortController` plus `setTimeout`, and use it in both places.

**Resolution:** skipped — 範圍外（info）。

### IN-04: Smoke script leftovers

**File:** `worker/test/dev-smoke.mjs:16, 24, 30`
**Issue:** The `hits` counter is incremented but never asserted. A cheap assertion would catch regressions such as "the dead model was still called after being marked dead". The smoke check also never exercises the 429 path or the rate limiter.
**Fix:** Assert `hits['gemini-3.8-flash']` stays at the expected count after step 8, or remove `hits`.

**Resolution:** fixed in 6761b3c — 移除沒用到的 `hits` 計數（未加斷言）。

### IN-05: No global upstream budget; per-request cap is the only throttle

**File:** `worker/src/ai.js:9`, `worker/wrangler.toml:31-37`
**Issue:** The effective cap is 20 req/min per IP (eventually consistent per location) times up to 4 upstream attempts. There is no cap across all callers. DEPLOY.md already documents the limiter's looseness and that it can be removed entirely. This is acceptable for a personal tool, but note that the whole abuse defence rests on that one binding, which is why WR-02 matters.
**Fix:** None required now. If abuse appears, add an in-isolate counter per minute, which costs no KV writes.

**Resolution:** skipped — 無需處理。

### IN-06: Key-guard inconsistency between old and new admin routes

**File:** `worker/src/index.js:120` vs `:233`
**Issue:** `/health.json` and `/health/run` reject an empty key explicitly (`!key || key !== env.USER_REPORT_KEY`). The ported admin routes use `keyOk()`, which does not. With `secrets.required` an unset secret cannot ship, but an empty-string secret would open `/reports.json`, `/reports/decision` and `/reports/delete`. Also, `/health/run` (6 upstream calls) now sits behind a key in the URL, and DEPLOY.md step 8 has Andy type the key on the command line, where it lands in shell history. FB-V2-01 is deferred, so this is only a note.
**Fix:** Reuse one guard (`!key || key !== env.USER_REPORT_KEY`) for all admin routes. In DEPLOY.md step 8, suggest reading the key from a shell variable (`read -s KEY`) so it is not saved in history.

**Resolution:** skipped — 範圍外（info，FB-V2-01 已延後）。

---

_Reviewed: 2026-10-04_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
