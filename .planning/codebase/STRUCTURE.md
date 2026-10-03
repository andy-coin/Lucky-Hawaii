---
last_mapped_commit: 12759f30d51ec3c5f47e0748b6d60d7fd82bf678
last_mapped_at: 2026-10-03
---
# Codebase Structure

**Analysis Date:** 2026-10-03

## Directory Layout

```
Lucky Hawaii/
├── index.html                      # Main web app (6320 lines: HTML + CSS + inline JS)
├── manifest.json                   # PWA manifest (app name, icon, display mode)
├── icon.png                        # App icon (192x192 PWA icon)
├── README.md                       # Project overview & features
├── ai_guide.md                     # AI integration guide & model setup
│
├── data/                           # Data files (required for app function)
│   ├── wordlist.json              # Full 13MB wordlist (indexed flat structure)
│   ├── wordlist-cXX.json          # Wordlist chunks (c00-c09, ~1.2MB each)
│   ├── wordlist-meta.json         # Version metadata for IDB cache validation
│   ├── rhyme-dict.json            # Char → [syllables] lookup (80KB)
│   ├── rhyme-dict-overrides.json  # User-contributed rhyme corrections
│   ├── wordlist-overrides.json    # User-contributed word additions
│   ├── polyphonic-order.json      # 破音字 (polyphonic) ordering (25KB)
│   ├── polyphonic-order.js        # Same data as .json but exported as JS
│   ├── core library.txt           # Source word frequency data (reference)
│   └── applied-changes.log        # Build audit trail (merged sources)
│
├── scripts/                        # Build & utility scripts
│   ├── build_wordlist.py          # Python: Generate wordlist chunks from sources
│   ├── merge_corelib.py           # Python: Merge multiple lexicon sources
│   └── BPMFBase_reformated.lua    # Lua: Reference BPMF (注音) data (unused in app)
│
├── admin/                          # Admin backend & dashboard (separate SPA)
│   ├── index.html                 # Admin dashboard (~1900 lines, manages user feedback)
│   └── woker.js                   # Cloudflare Workers handler (Wrangler format)
│
├── .planning/                      # GSD planning & architecture docs
│   └── codebase/
│       ├── ARCHITECTURE.md        # System design & data flow
│       └── STRUCTURE.md           # This file
│
├── .claude/                        # Claude Code project config (skipped in analysis)
│   ├── settings.local.json
│   ├── gsd-*.json
│   └── gsd-core/
│
├── .devcontainer/                  # Dev environment setup
│   └── devcontainer.json
│
├── history version/                # Archived old versions (skipped)
│
└── .start.sh, .restart.sh, .stop.sh, .enter.sh, .rebuild.sh
    └─ Development helper scripts
```

## Directory Purposes

**Project Root:**
- Purpose: Entry point and deployment root for GitHub Pages
- Contains: `index.html` (main app), `manifest.json` (PWA), `icon.png` (launcher)
- Deployment: Entire directory served via GitHub Pages at `andy-coin.github.io/Lucky-Hawaii/`

**`data/`:**
- Purpose: Linguistic data (word frequency, rhyme mappings, phonetic variants)
- Contains: JSON dictionaries, wordlist chunks (~17MB total), metadata
- Source: Built from open-source lexicons (McBopomofo, vChewing, libchewing)
- Loaded by: Main app via fetch (progressive chunks), admin dashboard for export
- Note: `wordlist.json` is compiled master (rarely used directly; chunks preferred)

**`scripts/`:**
- Purpose: Build-time utilities for merging and chunking linguistic data
- Contains: Python data processing, Lua reference formats
- Run: Offline before deployment (not in production path)
- Note: `BPMFBase_reformated.lua` is reference documentation, not imported by app

**`admin/`:**
- Purpose: Separate SPA for reviewing user feedback and applying approved changes
- Contains: Dashboard HTML (feedback list, decision UI), Cloudflare Workers backend
- Deployment: Separate path; admin must authenticate with API key
- Architecture: Same CSS/design system as main app, but independent code
- Communication: Main app POSTs feedback to `/feedback` endpoint; admin polls `/reports.json`

## Key File Locations

**Entry Points:**
- `index.html` — Main web app (entire app in one file)
- `admin/index.html` — Admin dashboard (feedback review & management)

**Configuration:**
- `manifest.json` — PWA metadata (app name, icons, display mode)
- `data/wordlist-meta.json` — Version for cache validation
- `.devcontainer/devcontainer.json` — Dev environment (unused locally, for Codespaces)

**Core Logic:**
- `index.html` line 2490-6318 — Main `<script>` section containing all app logic

**Data Lookup Tables:**
- `index.html` lines 2494-2688 — Inline Zhuyin/Pinyin/rhyme mappings (404 phonetic pairs)
- `data/rhyme-dict.json` — Character→syllables mapping (loaded at startup)
- `data/wordlist.json` (or chunks `c00-c09`) — Word frequency & pronunciation

**Testing:**
- No test files in repo (testing is manual via deployed site)

## Naming Conventions

**Files:**
- HTML: `index.html`, `*.html` (kebab-case for multi-word)
- Data: `{entity}-{variant}.json` (e.g., `wordlist-c00.json`, `rhyme-dict-overrides.json`)
- Scripts: `.{action}.sh` (e.g., `.start.sh`, `.rebuild.sh`)

**Directories:**
- Lowercase, no underscores: `data/`, `admin/`, `scripts/`
- Hidden project dirs: `.planning/`, `.claude/`, `.devcontainer/`, `.git/`

**DOM Elements (HTML):**
- Classes: `kebab-case` (e.g., `.search-input`, `.char-card`, `.ai-word-card`)
- IDs: `camelCase` (e.g., `#showPinyin`, `#aiWordsContainer`, `#feedbackModalOverlay`)
- Data attributes: `data-{snake_case}` (e.g., `data-word`, `data-char`, `data-tier`)

**JavaScript Functions:**
- Global functions: `camelCase` (e.g., `searchRhyme()`, `createCharCard()`, `loadWordlist()`)
- Private functions: `_camelCase` prefix (e.g., `_idbOpen()`, `_refreshFromCurrentInput()`)
- Event handlers: `on{EventName}` or verb form (e.g., `onModelChange()`, `toggleSettings()`)

**JavaScript Variables:**
- Global state: `camelCase` (e.g., `rhymeDict`, `wordlistData`, `currentRhymes`)
- Constants: `UPPER_SNAKE_CASE` (e.g., `BORROW_MAP`, `WORKER_URL`, `TONE_CHAR_TO_INT`)
- DOM references: `_camelCase` with underscore (e.g., `_ctxMenu`, `_aiWordsCt`, `_phoneticTooltip`)
- Temporary/loop vars: Single letter (e.g., `i`, `e`, `k`) or abbreviated (e.g., `char`, `word`)

## Where to Add New Code

**New Feature (e.g., "Filter by stroke count"):**
- Primary code: Add function to `index.html` script section (around line 4000-5000 for filtering logic)
- UI: Add checkbox/button to settings panel (HTML around lines 1600-1900)
- State: Add global variable near line 3300 (search state section)
- Event listener: Attach to control in event setup section (lines 5788-6300)
- Data: If requires new data file, add to `data/` and load in `loadWordlist()` (line 3980)

**New Component/Module (e.g., "Word rhyme history tracker"):**
- Implementation: Create functions in script section; group related functions together with clear comments
- DOM: Create HTML structure in body (add `<div class="history-panel">...` in appropriate panel)
- State: Initialize at line ~3300, persist via localStorage helper at line 3743
- Example: See lyrics editor (lines 3754-3948) for pattern of grouped functions + DOM template

**Utilities/Helpers (e.g., "Format tone marks"):**
- Shared helpers: Add to top of script section, near similar functions (lines 2887-2999 for phonetic utils)
- Name: Use `_` prefix if used internally, no prefix if exported/public
- Placement: Near first usage site (e.g., tone function near `getZhuyinTone()` at line 2903)

**LLM Integration (new model, new prompt):**
- Model config: Add to `models` array (lines 4476-4617)
- API key: Add to settings panel HTML (lines 1800-1900)
- Fallback chain: Add to `queryLLM()` chain (lines 5202-5240)
- Prompt template: Store in `AIPromptTemplate` or inline in `queryLLM()` section
- Response parser: Add parsing logic after API response (lines 5260-5340)

**Admin feature (new feedback type, new action):**
- Action type: Add enum to `admin/woker.js` path routing (lines 30-120)
- KV schema: Define JSON shape for new action, add migration in decision handler
- Dashboard display: Add section to `admin/index.html` (lines 100-500)
- Backend: Add POST handler in `woker.js`

## Special Directories

**`data/`:**
- Purpose: Linguistic reference data
- Generated: Yes (built from `scripts/build_wordlist.py`)
- Committed: Yes (large but necessary)
- How generated: Merge source lexicons (McBopomofo, vChewing, libchewing) → chunk for lazy load
- Versioning: `wordlist-meta.json` tracks version; bump version to invalidate IDB cache

**`.claude/`:**
- Purpose: Claude Code project config & GSD state
- Generated: Yes (by Claude Code harness)
- Committed: Yes (project state)
- Never modify manually; let Claude Code manage

**`.devcontainer/`:**
- Purpose: Dev environment config (VS Code Codespaces)
- Committed: Yes
- Note: For development only; deployment ignores

**`history version/`:**
- Purpose: Archived previous versions of the app
- Committed: Yes (for reference)
- Note: Skipped in active development; no code imported from here

## Key File Contents

**`index.html` (6320 lines total):**
- Lines 1-2488: HTML structure + CSS (themes, layout, animations, responsive design)
- Lines 2490-2688: Global data structures (Zhuyin/Pinyin maps, rhyme borrowing rules)
- Lines 2695-3435: Rhyme engine (lookup, search, polyphonic handling)
- Lines 3447-3563: Character card rendering
- Lines 3743-3948: Session management (save/load/import/export)
- Lines 3948-4025: IndexedDB wrapper (cache wordlist)
- Lines 3980-4185: Word filtering & candidate generation
- Lines 4290-4408: AI suggestion UI & logic
- Lines 5202-5340: LLM API queries with fallback chain
- Lines 5454-5734: Results display & interaction
- Lines 5788-5834: Input handling & search trigger
- Lines 5842-6027: Theme & color management
- Lines 6034-6223: Context menus (right-click, long-press)
- Lines 6244-6316: Gesture & tooltip coordination

**`admin/index.html` (~1900 lines):**
- Lines 1-500: CSS (styling, theme variables)
- Lines 500-1000: HTML structure (filter panel, report list, decision panel)
- Lines 1000-1900: Inline `<script>` for admin UI (fetch reports, post decisions, export)

**`admin/woker.js` (~200 lines):**
- Exports default fetch handler for Cloudflare Workers
- Routes: `/feedback` (POST), `/reports.json` (GET), `/reports/decision` (POST), `/reports/delete` (DELETE)
- Auth: CORS validation on `/feedback`, API key validation on admin endpoints

**`data/rhyme-dict.json` (72KB):**
- Format: `{ "char": ["ㄅㄧ", "ㄉㄞ", ...], ... }`
- Content: Character → array of possible Zhuyin pronunciations

**`data/wordlist-c00.json` through `wordlist-c09.json` (1.2MB each):**
- Format: `[{ "word": "好", "syllables": ["ㄏㄠˇ"], "freq": 0.95 }, ...]`
- Content: Word list sorted by frequency (top 10% per chunk)
- Load order: Progressive chunks; newer chunks have lower-frequency words

---

*Structure analysis: 2026-10-03*
