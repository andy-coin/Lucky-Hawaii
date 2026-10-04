---
last_mapped_commit: 12759f30d51ec3c5f47e0748b6d60d7fd82bf678
last_mapped_at: 2026-10-03
---
# External Integrations

**Analysis Date:** 2026-10-03

## APIs & External Services

**LLM Providers (via Cloudflare Worker proxy):**
- Google Gemini (generativelanguage.googleapis.com)
  - SDK/Client: Fetch API with OpenAI-compatible wrapper
  - Auth: `GEMINI_API_KEY` (server-side secret in Cloudflare Worker)
  - Models: `gemini-3.5-flash-lite`, `gemini-3.7-flash`, `gemini-2.5-flash`
  - Purpose: AI suggestions for rhyming words based on user lyrics context

- Groq API (api.groq.com)
  - SDK/Client: Fetch API
  - Auth: `GROQ_API_KEY` (server-side secret in Cloudflare Worker)
  - Models: `qwen/qwen3.6-27b`, `openai/gpt-oss-120b`
  - Purpose: Fast model inference for word suggestions

- GitHub Models (models.inference.ai.azure.com)
  - SDK/Client: Fetch API
  - Auth: `GITHUB_API_KEY` (server-side secret in Cloudflare Worker)
  - Purpose: Alternative LLM provider with fallback support

**Frontend API Communication:**
- All LLM requests proxied through Cloudflare Worker at `https://lucky-hawaii.is3000dollar.workers.dev`
- Worker acts as middleware to:
  - Hide API keys from client
  - Enforce origin restrictions (CORS limited to `https://andy-coin.github.io`)
  - Route provider selection (`_provider` parameter)
  - Handle response transformation

**Font CDN:**
- Google Fonts API (`https://fonts.googleapis.com/css2`)
  - Fonts: Noto Sans TC (weights 300, 400, 500, 700), JetBrains Mono (weights 400, 500)
  - Embedded via `<link rel="preconnect">` for performance

## Data Storage

**Databases:**
- None used in production

**Browser Storage (Client-side):**
- localStorage - Persistent user preferences
  - `haoYunQi_inputMode` - Selected input mode (auto/pinyin/bopomofo)
  - `haiku_hashtags` - User-defined context tags/hashtags
  - `haiku_lyrics` - Song lyric sections being edited
  - `haiku_savedwords` - User's marked/saved words
  - `selectedModel` - Last selected LLM model
  - `apiKey_*` - API keys for various providers (when user-provided)
  - `*Collapsed` - UI panel collapse state (localStorage keys for panel visibility)
  - `dictOverrides_v076` - Character dictionary modifications

- IndexedDB (Caching)
  - Database: `haoYunQi` (v1)
  - Purpose: Caching chunked wordlist data for offline-first loading
  - Metadata check: `data/wordlist-meta.json` - version validation
  - Stores: Wordlist chunks (c00-c09) to avoid re-fetching

**File Storage:**
- Static assets hosted on GitHub Pages
  - HTML/CSS/JS served from repository root
  - JSON data files served from `data/` directory
  - No server-side file storage

## Authentication & Identity

**Auth Provider:**
- None - Application is anonymous, no user accounts
- API keys managed server-side in Cloudflare Worker secrets
- Admin backend authentication via query parameter: `?key=USER_REPORT_KEY`

## Monitoring & Observability

**Error Tracking:**
- None detected (no Sentry, LogRocket, etc.)

**User Feedback Collection:**
- Cloudflare Worker endpoint: POST `/feedback`
  - Accepts: user feedback submissions
  - Storage: Cloudflare KV (`USER_FEEDBACK_KV` namespace)
  - Metadata: Timestamp, random ID generation
  
- Admin retrieval: GET `/reports.json?key=<USER_REPORT_KEY>`
  - Admin dashboard reads feedback from KV store
  - Supports status tracking: pending/agreed/dismissed/archived
  - Soft delete via decision status (not permanent until explicit `/reports/delete`)

**Logs:**
- No centralized logging detected
- Browser console logs only (development debugging)

## CI/CD & Deployment

**Hosting:**
- GitHub Pages (`https://andy-coin.github.io/Lucky-Hawaii`)
- Static site deployment from repository
- Domain: GitHub Pages subdomain, not custom domain

**Backend Infrastructure:**
- Cloudflare Workers (API proxy + feedback management)
- Cloudflare KV Storage (feedback persistence)
- Deployment: Cloudflare Workers script in `admin/woker.js`

**CI Pipeline:**
- None detected (manual deployment or via git push to gh-pages branch)
- No GitHub Actions workflows configured

## Environment Configuration

**Required Environment Variables (Cloudflare Worker):**
- `GEMINI_API_KEY` - Google Gemini authentication
- `GROQ_API_KEY` - Groq API authentication
- `GITHUB_API_KEY` - GitHub Models authentication
- `USER_REPORT_KEY` - Admin panel access token
- Bindings: `USER_FEEDBACK_KV` - Cloudflare KV namespace

**Secrets Location:**
- Cloudflare Worker `wrangler.toml` (not in repository)
- Secrets configured in Cloudflare dashboard

**Development Environment:**
- `.devcontainer/Dockerfile` - Python 3.13, Node.js 22
- Local development runs in Docker container

## Data Sources

**External Data (Build-time):**
- vChewing VanguardLexicon
  - Source: `https://raw.githubusercontent.com/vChewing/vChewing-VanguardLexicon/main/Sources/LibVanguardChewingData/Resources/components/cht/`
  - Files: `phrases-moe-cht.txt`, `phrases-tabe-cht.txt`, `phrases-vchewing-cht.txt`
  - License: vChewing Project
  - Frequency data included

- libchewing tsi.csv
  - Source: `https://raw.githubusercontent.com/chewing/libchewing-data/master/dict/chewing/tsi.csv`
  - License: LGPL-2.1-or-later
  - Purpose: Supplementary word frequency data
  - Processing: Only words missing from vChewing are imported

- McBopomofo (locally sourced)
  - File: `data-plain-bpmf.txt` (local, not in repository)
  - Purpose: Bopomofo pronunciation data
  - Script: `scripts/merge_corelib.py` processes and merges this

## Webhooks & Callbacks

**Incoming:**
- POST `/feedback` - User feedback submission endpoint
  - Origin: `https://andy-coin.github.io` only (CORS restricted)
  - Stores to KV with timestamp

**Outgoing:**
- None detected

## API Response Formats

**LLM Response Handling:**
- Gemini: `{ candidates: [{ content: { parts: [{ text: "..." }] } }] }`
- Groq/GitHub: OpenAI-compatible format `{ choices: [{ message: { content: "..." } }] }`
- Worker normalizes all responses before returning to client

**Feedback API:**
- `POST /feedback`: Request `{ ...data, ts: ISO_timestamp }`
- `GET /reports.json`: Returns sorted array of feedback objects
- `POST /reports/decision`: Update feedback status
- `POST /reports/delete`: Permanent removal

---

*Integration audit: 2026-10-03*
