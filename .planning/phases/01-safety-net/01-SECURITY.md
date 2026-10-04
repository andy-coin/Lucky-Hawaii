---
phase: 01-safety-net
asvs_level: 1
block_on: high
audited: 2026-10-03
status: secured
threats_total: 25
threats_closed: 25
threats_open: 0
---

# Phase 1 — Security Audit (Safety Net)

Register = PLAN threat_model blocks (T-01-01..T-01-24; T-01-SC repeated in all six plans, counted once).
Evidence is file:line in implemented code, not documentation.

| ID | Category | Sev | Disposition | Status | Evidence |
|----|----------|-----|-------------|--------|----------|
| T-01-01 | Info Disclosure | medium | mitigate | mitigated | tests/serve.mjs:34 `.listen(PORT,'127.0.0.1')`; :23-24 relative()+isAbsolute → 403. Live probe: `/..%2fpackage.json` 403, `/%2e%2e%2f%2e%2e%2fetc/passwd` 403; lsof: only 127.0.0.1:4399 listening; LAN-IP connect refused. |
| T-01-02 | Info Disclosure | low | mitigate | mitigated | tests/helpers.mjs:17-37 context.route on every non-BASE origin: fonts/Worker 200 mocks, unknown hosts recorded and fulfilled (never reach network). All contexts go through routeExternal (helpers.mjs:74, storage.spec.mjs:464). offOrigin asserted empty in golden.spec.mjs:149, smoke.spec.mjs:144,269,281 only — plan's "every test asserts" overclaims, but the blanket fulfil means no leak. |
| T-01-03 | Tampering | medium | mitigate | mitigated | tests/golden.spec.mjs:9 UPDATE flag; :137-143 writeFileSync only under UPDATE after no-error/nonEmpty guards; :155-161 file-set test. `git diff 75016bb HEAD -- tests/golden` empty (41 files unchanged since isolated baseline commit). |
| T-01-04 | Info Disclosure | low | accept | accepted | See Accepted Risks Log. index.html:6020, 6041, js/safety.js:438 resolve to undefined / [undefined…] / {ok,where,existed} — no user data or secrets. |
| T-01-05 | Info Disclosure | low | mitigate | mitigated | tests/fixtures/v096-localStorage.json: apiKey_gemini = 'test-key-not-real'; no admin key; grep admin_key/sk-/AIza/ghp_/gsk_ over tests/fixtures + tests/golden clean. |
| T-01-06 | DoS | low | mitigate | mitigated | helpers.mjs bootPage → fresh browser.newContext per call; smoke.spec.mjs:2,121-135 one context per handler; no launchPersistentContext/userDataDir/channel in config or tests. |
| T-01-07 | Info Disclosure | low | mitigate | mitigated | helpers.mjs:25-33 Worker host mocked (/feedback + AI); smoke.spec.mjs:144 any offOrigin entry fails. |
| T-01-08 | Tampering | medium | mitigate | mitigated | js/safety.js:164 message via textContent (also :120,151,158); fixed strings LH_BANNER_TEXT :107-112; zero innerHTML/outerHTML/insertAdjacentHTML/document.write/eval in js/safety.js and in all phase-01 added lines of index.html. |
| T-01-09 | Info Disclosure | medium | mitigate | mitigated | lhWarn(tag, err) js/safety.js:38-41; all 13 index.html call sites (2799,3350,3964,4003,4010,4036,4058,5041,5273,5278,5330,6241,6243) pass error object / HTTP status / chunk index only; apiKey_* read only via lhGet (index.html:4482), never lhGetJSON, so JSON.parse messages cannot carry key values; no console.* of key values anywhere. |
| T-01-10 | DoS | low | mitigate | mitigated | index.html:2179 `js/safety.js?v=0.96.3`. Residual IN-04: version bump is manual. |
| T-01-11 | Tampering | low | mitigate | mitigated | js/safety.js:51-53 lhAssertKnownKey, called from lhSet :91; tests/scan.spec.mjs:49-60 registry + direct-access scans; zero raw localStorage refs in index.html. |
| T-01-12 | DoS | medium | mitigate | mitigated | js/safety.js:74-87 lhGetJSON fallback + validate; :63-70 raw stash; index.html:2732, 3297-3300 callers; :5438 `!LH_CORRUPT_KEYS.has('haiku_lyrics')` guard on hashtag auto-clear. Tests storage.spec.mjs:10,33,48. |
| T-01-13 | Repudiation | medium | mitigate | mitigated | tests/scan-lib.mjs:141 scanCatches; tests/scan.spec.mjs:128 asserts zero swallowing catches; scope root *.html inline scripts + js/**/*.js (scan-lib.mjs:30-40). Residual: admin/ out of scan scope (plan scope = public app). |
| T-01-14 | Spoofing | low | mitigate | mitigated | index.html:6232-6247 postFeedback returns boolean; :6269-6271 thanks shown only on true. Tests error-visibility.spec.mjs:113,123,138. Residual IN-01 (UF-3). |
| T-01-15 | Info Disclosure | low | accept | accepted | See Accepted Risks Log. index.html:4574-4576 callLLM sends only constant Worker URL + Content-Type; no key in URLs. |
| T-01-16 | Info Disclosure | high | mitigate | mitigated | js/safety.js:225-238 lhSnapshot iterates only LH_KEYS + registered prefixes, skips LH_EXCLUDED_KEYS and LH_META_KEYS (:30,32). tests/storage.spec.mjs:134-148 seeds haoYunQi_admin_key, haoYunQi_admin_theme, otherProject_setting and asserts all three absent from baseline. admin/index.html uses only those two admin keys. |
| T-01-17 | DoS | medium | mitigate | mitigated | js/safety.js:181,190-193 5 s timeout; :202 onblocked record; :208 onversionchange close; :184-186,214 single shared opener; only `indexedDB.open` in repo is :195; index.html:3950-3953 `_idbOpen` delegates to lhIdbOpen. Test storage.spec.mjs:111. |
| T-01-18 | Tampering | medium | mitigate | mitigated | js/safety.js:292 existing id never rewritten (IDB); :258 same for ls copy; :294-297 rotation by seq. Tests storage.spec.mjs:159,174. Residual IN-05 (UF-4). |
| T-01-19 | Info Disclosure | low | accept | accepted | See Accepted Risks Log. js/safety.js:28 apiKey_ prefix `secret: true`. |
| T-01-20 | DoS | low | accept | accepted | See Accepted Risks Log. js/safety.js:255-268 one fixed key `lh:backup:ls`, written only from IDB-failure paths (:281,:307); 500000-char cap (:254,:265); backup banner on failure. Test storage.spec.mjs:224. |
| T-01-21 | Tampering | medium | mitigate | mitigated | js/safety.js:335-337 _lhRestorable, :341-364 lhRestore (object shape :342, registered key + string value :351, key-name-only warn :352), :367-384 lhRestoreFromBackup routes through it. Tampered-record test storage.spec.mjs:391-411; non-object test :413. |
| T-01-22 | DoS | high | mitigate | mitigated | js/safety.js:391-392 backup-first, blocked on backup failure; :395 snapshot after the await; :396-402 guard rejects unregistered keys; :411-420 lhRestore + lh:schema reset + truthful banner. Tests storage.spec.mjs:288,314,329,352,364,487. Residual: WR-03 remainder + no cross-tab lock deferred to Phase 8 (ponytail marker :394); dormant — LH_MIGRATIONS = [] (:332), lhMigrate returns {ran:0} when schema ≥ target. |
| T-01-23 | Tampering | medium | mitigate | mitigated | `git ls-remote origin refs/heads/main` = 12759f3 = refs/remotes/origin/main; last push predates phase work; local main = 7296c5e; phase commits exist only on gsd/v0.96-stabilize. |
| T-01-24 | Info Disclosure | low | mitigate | mitigated | js/safety.js:352 warns with key name only; tests/storage.spec.mjs:391-411 asserts 'steal' never appears in warnings. |
| T-01-SC | Tampering | high | mitigate | mitigated | package.json exact pins "@playwright/test":"1.63.0", "acorn":"8.18.0"; no scripts.postinstall; package-lock.json tracked (4a7d334), untouched by plans 02-06; 0 hasInstallScript across 4 packages; `npm audit signatures` exit 0 (4 verified signatures, 3 verified attestations). |

## Accepted Risks Log

| ID | Accepted risk | Rationale (re-verified in code) |
|----|---------------|----------------------------------|
| T-01-04 | window.__hoyunReady / __hoyunWordlistReady / __hoyunSafetyReady exposed in production | Resolve only to undefined / {ok,where,existed}; no user data or secrets |
| T-01-15 | lhWarn records AI errors in console | Client sends no API key (Worker proxy, index.html:4574-4576); console needs the user's own device |
| T-01-19 | apiKey_* values in IndexedDB backups | Same origin, user's own device; prefix flagged secret so Phase 8 export drops it; ls fallback already omits keys (js/safety.js:261-263) |
| T-01-20 | localStorage fallback copy uses extra quota | Single copy, only when IDB unusable, 500000-char cap, failure raises backup banner |

## Unregistered Flags (warnings, non-blocking, not counted in threats_open)

- UF-1: `lh:corrupt:<key>` raw stash (js/safety.js:63-70, fix ca5d752) — second ls copy of corrupt user data, bounded to 4 keys, rewritten only on content change, not snapshotted/restored. Low. Phase 8 caution: never lhGetJSON on apiKey_* keys.
- UF-2: tests/serve.mjs serves whole repo root (.git, .planning, .claude) with no Host check (REVIEW IN-02; DNS rebinding during tests). Dev-only, 127.0.0.1-bound. Low.
- UF-3: IN-01 — six fire-and-forget postFeedback callers (index.html:4459, 6081, 6196, …) show "已回報" then the failure toast replaces it. Low.
- UF-4: Phase 8 carry-overs, dormant while LH_MIGRATIONS is empty: no cross-tab migration lock; IN-05 baseline eviction (LH_BACKUP_KEEP = 3); `_idbGet` post-versionchange gap.

**threats_open:** 0
