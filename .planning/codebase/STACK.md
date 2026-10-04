---
last_mapped_commit: 12759f30d51ec3c5f47e0748b6d60d7fd82bf678
last_mapped_at: 2026-10-03
---
# Technology Stack

**Analysis Date:** 2026-10-03

## Languages

**Primary:**
- JavaScript - Client-side application logic, all interactive features
- HTML5 - Document structure and semantic markup
- CSS3 - Styling, responsive design with CSS Grid/Flexbox, dark mode support via CSS variables

**Secondary:**
- Python 3.13 - Build-time data processing scripts (`scripts/build_wordlist.py`, `scripts/merge_corelib.py`)

## Runtime

**Environment:**
- Browser runtime (vanilla JavaScript, no Node.js runtime in production)
- Development container: Docker with Node.js 22 + Python 3.13

**Package Manager:**
- npm - Development dependencies only (minimal, in `.claude/hooks/package.json`)
- No production dependencies bundled

## Frameworks

**Core:**
- Vanilla JavaScript (no framework) - Pure DOM manipulation and event handling
- HTML5 Web APIs - Fetch API, IndexedDB, localStorage, Web Manifest

**Fonts:**
- Google Fonts - Noto Sans TC (display and body text), JetBrains Mono (code/technical text)
- Imported via `<link>` tags from `https://fonts.googleapis.com/css2`

**Build/Dev:**
- Python urllib - Data fetching and JSON processing
- Docker - Development environment containerization
- Cloudflare Workers - Backend infrastructure (not a framework, but runtime)

## Key Dependencies

**Critical:**
- Google Fonts API - Typography (embedded via link tags, no npm dependency)

**Infrastructure:**
- Cloudflare Workers Runtime - Handles API proxy, user feedback storage, CORS
- Cloudflare KV Storage - Persistent feedback data storage
- IndexedDB - Client-side caching of wordlist data (browser native)
- localStorage - Session state and UI preferences persistence (browser native)

## Configuration

**Environment:**
- Secrets stored in Cloudflare Worker bindings:
  - `GEMINI_API_KEY` - Google Gemini API authentication
  - `GROQ_API_KEY` - Groq API authentication
  - `GITHUB_API_KEY` - GitHub Models API authentication
  - `USER_REPORT_KEY` - Admin backend authentication key
  - `USER_FEEDBACK_KV` - KV namespace binding for feedback storage

**Build:**
- Python scripts handle data preparation:
  - `scripts/build_wordlist.py` - Merges vChewing + libchewing sources into JSON chunks
  - `scripts/merge_corelib.py` - Merges McBopomofo with core library data
- Output: JSON data files in `data/` directory

**Web Configuration:**
- `manifest.json` - PWA manifest (standalone display, app icons, theme colors)
- `.devcontainer/Dockerfile` - Development container specification
- `.devcontainer/docker-compose.yml` - Local dev environment setup

## Platform Requirements

**Development:**
- Node.js 22 (in dev container)
- Python 3.13 (for build scripts)
- Docker (for containerized development)
- Git (for version control)

**Production:**
- Modern browser with ES6 support
- IndexedDB support (for wordlist caching)
- fetch API support
- CSS Grid/Flexbox support
- Deployment: GitHub Pages (static hosting)

## Data Files

**Generated Assets:**
- `data/wordlist.json` - Master wordlist (~14MB)
- `data/wordlist-c00.json` through `data/wordlist-c09.json` - Chunked wordlist for incremental loading
- `data/wordlist-meta.json` - Version metadata for cache invalidation
- `data/rhyme-dict.js` and `.json` - Rhyme dictionary (converted from BPMF phoneme keys)
- `data/polyphonic-order.js` and `.json` - Tone/polyphony ordering data
- `data/wordlist-overrides.json` - User-applied corrections/overrides
- `data/rhyme-dict-overrides.json` - Rhyme dictionary overrides

## Entry Points

**Web Application:**
- `index.html` - Main application entry point (complete single-page app)
- Embedded JavaScript: ~8000+ lines of inline script in `<head>` and `<body>`

**Admin Backend:**
- `admin/index.html` - Admin dashboard for feedback management
- `admin/woker.js` - Cloudflare Worker script (handles LLM proxy + feedback API)

---

*Stack analysis: 2026-10-03*
