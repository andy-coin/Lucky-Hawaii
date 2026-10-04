# API Coverage — Phase 6 Lexicon Packs

> Full coverage by default. Opt-outs are explicit, reasoned decisions.
> Scope: the offline lexicon tool (`tools/lexicon/`) talks to three external surfaces — the Gemini API (gray-area judging, plan 06-07), the project's own Cloudflare Worker (optional judging proxy, plan 06-07) and GitHub raw content (pinned source downloads, plan 06-01). The browser site gains no new external call in this phase.

## Gemini API (generativelanguage.googleapis.com, v1beta)

| capability | decision | reason |
|---|---|---|
| models.generateContent | INTEGRATE | |
| 429 retry semantics (retry-after header, error.details[].retryDelay) | INTEGRATE | |
| blocked / SAFETY finish handling (promptFeedback.blockReason, finishReason) | INTEGRATE | |
| auth error handling (400/401/403 stop the run with a clear message) | INTEGRATE | |
| models.streamGenerateContent | OPT-OUT | not needed: batch judging reads one short complete answer per request |
| models.countTokens | OPT-OUT | not needed: the estimate gate must run offline before any network call and spend no quota, so tokens are estimated locally |
| models.list / models.get | OPT-OUT | not needed: model is chosen with --model (default from worker/src/models.js registry) |
| batches (Batch API) | OPT-OUT | not needed: about 230 small requests; the resumable loop with a hard cap covers free-tier daily limits |
| cachedContents (context caching) | OPT-OUT | not needed: the fixed instruction is about 600 tokens per request |
| files | OPT-OUT | not needed: no file inputs |
| embedContent / batchEmbedContents | OPT-OUT | explicitly out of scope: judging is a K/D verdict, no embeddings |

## Lucky Hawaii Worker (worker/src/index.js)

| capability | decision | reason |
|---|---|---|
| POST /ai | INTEGRATE | |
| GET /models | OPT-OUT | not needed: /ai with model "auto" answers with the model id used, which is recorded per verdict |
| POST / (legacy chat route) | OPT-OUT | not needed: deprecated route kept only for old site builds |
| POST /feedback, admin and report routes | OPT-OUT | explicitly out of scope: unrelated to judging; the adapter's path is fixed to /ai so admin routes are never called |
| GET /health.json, POST /health/run | OPT-OUT | explicitly out of scope: admin-key routes for model health |

## GitHub raw content (raw.githubusercontent.com)

| capability | decision | reason |
|---|---|---|
| GET file at pinned commit | INTEGRATE | |
| api.github.com (REST: commits, contents, releases) | OPT-OUT | not needed: pins are fixed in sources.lock.json; the REST API answers 403 from the cloud container |
