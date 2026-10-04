---
phase: 02-ai-service-hotfix-ai
plan: 06
subsystem: worker-smoke-and-deploy-handoff
tags: [wrangler-dev, workerd, smoke-test, cron, deploy-checklist, human-check]

requires:
  - phase: 02-ai-service-hotfix-ai
    provides: "02-02 wrangler.toml with KV fill-ins, check-ids guard; 02-03/04/05 Worker routes /ai, /models, POST /, /feedback, /reports.json, /health.json, /health/run, scheduled()"
provides:
  - "npm run worker:smoke: wrangler dev (workerd, local KV, real cron trigger) against a fake provider on 127.0.0.1, 12 checks, ends with 全部通過"
  - "worker/DEPLOY.md: ten-step plain Traditional Chinese checklist for Andy (login, KV ids, secrets, self-check, deploy, live check, site update, live click) plus appendix"
  - "Phase 2 gate green: npm test 218 passed, worker:check exit 0 with 0 WARNING, worker:smoke exit 0 (run three times)"
affects: [phase-04-ai-word-picking]

actuals:
  tokens: 5511    # chars/4 over git diff 49997c3..HEAD (22,044 chars, 3 files)
  tasks: 2
  commits: 2
plan_head_before: 49997c30be204d28552e5cba7dcacb88368d2cb0
plan_head_after: d94b68904defca7bcca573344a0339038b3e7730

tech-stack:
  added: []
  patterns:
    - "Smoke isolation: own free ports (listen on 0), temp --persist-to dir, dummy secrets and provider bases through --var, wrangler spawned detached so the whole process group is killed in finally"

key-files:
  created:
    - worker/test/dev-smoke.mjs
    - worker/DEPLOY.md
  modified:
    - package.json

key-decisions:
  - "Dummy secrets pass through --var: wrangler 4.147.0 accepts them for [secrets] required, so the env-file fallback was not needed and worker/.dev.vars is never referenced"
  - "DEPLOY.md treats the merge of gsd/v0.96-stabilize into main as the site-push step (step 9) and tells Andy he can simply ask Claude to do it"

patterns-established:
  - "Human-check page lives next to the config it edits (worker/DEPLOY.md) and quotes the exact fill-in strings"

requirements-completed: [FND-05, AI-02, AI-05]

coverage:
  - id: D1
    description: "npm run worker:smoke passes under wrangler dev: POST /ai, GET /models (6 models, checkedAt null), legacy POST / in Gemini shape, POST /feedback then GET /reports.json, local cron trigger outcome ok, health doc with 6 active, POST /health/run reflecting a dead model and /models following it, foreign Origin 403, /health.json without key 403"
    requirement: AI-05
    verification:
      - kind: integration
        ref: "worker/test/dev-smoke.mjs via npm run worker:smoke (12 checks, 全部通過)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Smoke never reads or writes worker/.dev.vars, never contacts real providers, leaves no tracked change, cleans up wrangler/workerd and the temp dir"
    requirement: FND-05
    verification:
      - kind: other
        ref: "grep -c '\\.dev\\.vars' = 0; git status --porcelain -- worker index.html tests package.json empty after run; pgrep workerd/wrangler empty; no lh-smoke-* temp dir left"
        status: pass
    human_judgment: false
  - id: D3
    description: "Smoke can run while npm test runs (own port and temp state)"
    requirement: FND-05
    verification: []
    human_judgment: true
    rationale: "Declared backstop. Isolation is by construction (port from listen(0), mkdtemp state); not exercised concurrently with npm test"
  - id: D4
    description: "DEPLOY.md contains every manual step in order, the deploy order (Worker first, site after), the stale-setting note, KV fill-in lines, diff-reading rule, ratelimits fallback, fsevents/supply-chain note, gpt-oss note; no Simplified characters"
    requirement: FND-05
    verification:
      - kind: other
        ref: "plan acceptance greps (10 required strings, USER_FEEDBACK_KV count 6, no simplified characters, 14 commits with (02-0 since 57803f0)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Real deploy over the live dashboard Worker, live /health/run answers, live click on AI 建議"
    requirement: AI-02
    verification: []
    human_judgment: true
    rationale: "Needs Andy's Cloudflare login and real keys; steps 1-10 of worker/DEPLOY.md. Nothing was deployed or pushed"

duration: 5min
completed: 2026-10-04
status: complete
---

# Phase 2 Plan 06: Real-runtime smoke and deploy checklist Summary

**`npm run worker:smoke` runs the whole Worker under workerd (wrangler dev, local KV, real cron trigger) against a fake provider and ends with 全部通過 in about 2 seconds, and `worker/DEPLOY.md` is one plain Traditional Chinese page that takes Andy from `npx wrangler login` to a live AI 建議 click; the phase gate is green and nothing was deployed or pushed.**

## Performance

- **Duration:** about 5 min (2026-10-03T16:20Z to 16:25Z)
- **Tasks:** 2
- **Files:** 2 created, 1 modified (package.json: one script)

## Smoke output (final run)

```
✓ wrangler dev 已啟動（workerd + 本機 KV）
✓ POST /ai 回答了
✓ GET /models 列出 6 個模型、尚無檢查時間
✓ 舊版 POST / 以 Gemini 格式回答
✓ POST /feedback 已儲存
✓ GET /reports.json 讀得到剛存的回報
✓ 本機排程觸發完成（outcome ok）
✓ 排程寫入了健康文件（6 個啟用模型）
✓ POST /health/run 反映壞掉的模型
✓ GET /models 不再列出壞掉的模型
✓ 陌生來源打 /ai 得到 403
✓ 沒有金鑰讀 /health.json 得到 403
全部通過
```

Ran 4 times (task runs, two consecutive, then phase gate), all exit 0. After each run: no wrangler/workerd process, no `lh-smoke-*` temp directory, `git status --porcelain -- worker index.html tests package.json` empty (besides the files of the task before commit).

## Phase gate (O-10)

| Command | Result |
|---------|--------|
| `npm test` | 218 passed (1.0 min); the known `error-visibility.spec.mjs:123` intermittent did not fire |
| `npm run worker:check` | exit 0, 0 WARNING lines |
| `npm run worker:smoke` | exit 0, last line 全部通過 |

Acceptance greps: `worker:smoke` script string exact; `cdn-cgi/local/scheduled` count 1; `.dev.vars` count 0; DEPLOY.md required strings all present; `USER_FEEDBACK_KV` 6 times; no Simplified characters; 14 commit subjects containing `(02-0` since 57803f0 (needs at least 11).

## Task Commits

1. **Task 1: wrangler dev smoke** - `1d9c583` (test) - `worker/test/dev-smoke.mjs`, `package.json`
2. **Task 2: Andy's deploy checklist** - `d94b689` (docs) - `worker/DEPLOY.md`

Commit count measured: `git rev-list --count 49997c3..HEAD` = 2. Ledger file not written (orchestrator instruction); base recorded as `plan_head_before`. Docs commit for SUMMARY/STATE skipped: `.planning/` is gitignored. `handoff.md` (gitignored) updated with the Phase 2 status. Nothing pushed.

## Human-check steps waiting for Andy (worker/DEPLOY.md)

1. `npx wrangler login`
2. Look at the dashboard: are the three keys Secret or Plain text
3. `npx wrangler kv namespace list`, fill `id = ...` under `USER_FEEDBACK_KV` in `worker/wrangler.toml` (replacing `REPLACE_WITH_USER_FEEDBACK_KV_ID`)
4. `npx wrangler kv namespace create AI_STATE_KV`, fill the id replacing `REPLACE_WITH_AI_STATE_KV_ID`
5. `npx wrangler secret put` for GEMINI_API_KEY, GROQ_API_KEY, USER_REPORT_KEY (required when step 2 showed Plain text)
6. `npm test`, `npm run worker:check`, `npm run worker:smoke`
7. `npm run worker:deploy`, read the diff (answer No to any minus line naming the KV or a secret); `[[ratelimits]]` fallback if rejected
8. `POST /health/run?key=...` on the live Worker, check admin page still lists old reports
9. Merge `gsd/v0.96-stabilize` into `main` and push (the site update), only after step 8
10. Click AI 建議 once on the live site

## Open assumptions Andy can confirm after deploy

- **A3** thinkingLevel casing (`LOW`) for Gemini 3.7/3.8: visible in step 8 (`bad-request` vs `ok:true`); the Worker and the probe already retry without thinkingConfig, so AI works either way.
- **A8** whether the free plan accepts the `[[ratelimits]]` block: seen at step 7; if rejected, delete the block (the Worker serves unthrottled). Real 429 behaviour after a burst is also unobserved.
- **A9** whether `wrangler secret put` replaces an existing Plain-text variable of the same name: seen at step 5; DEPLOY.md says to delete the Plain-text one first if wrangler refuses.
- Also carried over from earlier plans: Groq 404 vs 400 for retired ids and whether `modelStatus` is populated (A4, A11), KV last-write-wins for overlapping cron and manual runs (02-05 D5).

## Deviations from Plan

None - plan executed exactly as written. (Two small implementation choices, not deviations: the smoke spawns wrangler with `--show-interactive-dev-session=false` and `detached: true` so the whole process group can be killed; `--var` satisfied `[secrets] required`, so the env-file fallback in the plan was not used.)

## Authentication Gates

None. No `wrangler login`, real deploy, `secret put`, `kv namespace create` or push was run. `wrangler dev` and `--dry-run` only; `worker/.dev.vars` does not exist and is never referenced.

## Known Stubs

None. The two KV ids in `worker/wrangler.toml` remain deliberate fill-in values guarded by `worker/check-ids.mjs`; DEPLOY.md steps 3-4 replace them.

## Threat Flags

None beyond the plan register. T-02-25 (dummy secrets, fake providers, `.dev.vars` grep 0, temp dir removed), T-02-26 (exact KV id, guard, "answer No to a minus line", Worker verified before site) and T-02-27 (Worker, verify, then site; stale-setting effect explained) are mitigated as planned. T-02-SC: no installs, `package-lock.json` untouched.

## Issues Encountered

None.

## Next Phase Readiness

Phase 2 code is complete and gated. The phase is "done" only after Andy runs DEPLOY.md and the live click passes; STATE.md blocker for that stays open. Phase 4 (AI word picking) can build on `/ai` and the health list.

## Self-Check: PASSED

- Files exist: worker/test/dev-smoke.mjs, worker/DEPLOY.md, package.json script, this SUMMARY.
- Commits on gsd/v0.96-stabilize: 1d9c583, d94b689 (`git rev-list --count 49997c3..HEAD` = 2); no deletions; nothing pushed; `.claude/CLAUDE.md` and `.gsd/` never staged.
- Gate re-run: `npm test` 218 passed, `worker:check` 0 warnings, `worker:smoke` 全部通過; no stray wrangler/workerd/serve.mjs process.
