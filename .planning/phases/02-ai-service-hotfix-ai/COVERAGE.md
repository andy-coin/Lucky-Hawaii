# API Coverage — Gemini API, Groq API, Cloudflare Workers platform

> Full coverage by default. Opt-outs are explicit, reasoned decisions.
> The detector returned `detected:false` on the plan scope (2026-10-03); this matrix is recorded anyway because the phase does call three external surfaces.

| capability | decision | reason |
|---|---|---|
| gemini generateContent (text) | INTEGRATE | |
| gemini thinkingConfig.thinkingLevel | INTEGRATE | |
| gemini modelStatus (modelStage, retirementTime) | INTEGRATE | |
| gemini error retryDelay (429 details) | INTEGRATE | |
| gemini models.list | OPT-OUT | no release date field; registry is hand-dated (RESEARCH Pitfall 9) |
| gemini streamGenerateContent | OPT-OUT | not needed; the page renders the whole word list at once |
| gemini embeddings | OPT-OUT | not needed for word suggestions |
| gemini files / multimodal input | OPT-OUT | not needed; text-only prompts |
| gemini function calling / structured output | OPT-OUT | not needed; replies are 、-separated words, parsing belongs to Phase 4 |
| gemini Interactions API | OPT-OUT | not needed; generateContent is documented and sufficient |
| groq chat completions | INTEGRATE | |
| groq reasoning_effort | INTEGRATE | |
| groq retry-after header | INTEGRATE | |
| groq models list | OPT-OUT | `created` is not a release date, so it cannot drive the 6-month rule |
| groq streaming | OPT-OUT | not needed; same reason as Gemini streaming |
| groq structured outputs | OPT-OUT | not needed; plain-text word lists |
| cloudflare KV get/put/list/delete | INTEGRATE | |
| cloudflare cron triggers (scheduled) | INTEGRATE | |
| cloudflare rate limiting binding | INTEGRATE | |
| cloudflare secrets (wrangler secret put) | INTEGRATE | |
| cloudflare Workers AI binding | OPT-OUT | explicitly out of scope per RESEARCH (extra binding, untested Chinese quality) |
