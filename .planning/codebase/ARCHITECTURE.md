---
last_mapped_commit: 12759f30d51ec3c5f47e0748b6d60d7fd82bf678
last_mapped_at: 2026-10-03
---
<!-- refreshed: 2026-10-03 -->

# Architecture

**Analysis Date:** 2026-10-03

## System Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                    UI Layer (DOM)                           │
│   Left Panel   │  Center Panel   │  Right Panel (Lyrics)    │
│  Search/Rhyme  │  Character Cards │  Lyrics Editor & AI     │
│  Result Tiles  │  with Meta Info   │  Suggestions            │
└────────────────┴──────────────────┴─────────────────────────┘
         │                 │                     │
         ▼                 ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│                 Application Logic Layer                      │
│  `index.html` <script> section (~6320 lines)                │
│                                                               │
│  Modules: Rhyme Indexing, Word Filtering, AI Suggestions,   │
│  Session Management, UI State Coordination                   │
└─────────────────────────────────────────────────────────────┘
         │                 │                     │
         ▼                 ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    Data & Storage Layer                      │
│  IndexedDB         JSON Files              LocalStorage      │
│  (wordlist cache)  (rhyme dict, words)    (settings, lyrics) │
│                                                               │
│  `data/` directory: rhyme-dict.json,      Browser APIs:     │
│  wordlist-cXX.json, wordlist.json         localStorage       │
│  polyphonic-order.json                    IndexedDB          │
└─────────────────────────────────────────────────────────────┘
         │                 │                     │
         ▼                 ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│               External Services                              │
│  LLM API (Gemini, OpenAI, Meta, Deepseek)   Cloudflare      │
│  ↑ Word suggestions & fallback chain        Workers         │
│                                              ↑ Feedback      │
│                                                collection    │
└─────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| **Rhyme Engine** | Zhuyin/Pinyin→rhyme lookup, character grouping by rhyme | `index.html:2695-3435` |
| **Word List Manager** | Load, cache, filter word candidates by rhyme/length/frequency | `index.html:3972-4185` |
| **UI Coordinator** | Render panels, sync state, handle interactions | `index.html:2200-2488, 4202-4231` |
| **Search & Input** | Parse Zhuyin/Pinyin/Hanzi, trigger rhyme search | `index.html:2999-3304, 5768-5834` |
| **Character Card System** | Create, display, mark, reorder character results | `index.html:3447-3584, 5454-5734` |
| **Session Persistence** | Save/load lyrics, overrides, settings via localStorage/IndexedDB | `index.html:3743-3948, 5893-5930` |
| **AI Integration** | Query LLM APIs with fallback chain, format suggestions | `index.html:4290-5348` |
| **Theme & Colors** | Apply light/dark mode, custom color palette | `index.html:5842-6027` |
| **Polyphonic Handler** | Manage characters with multiple pronunciations | `index.html:3353-3435, 6034-6059` |

## Pattern Overview

**Overall:** Single-Page Application (SPA) with monolithic JavaScript

**Key Characteristics:**
- **Inline JavaScript architecture** - All code in `<script>` tag within `index.html`
- **Procedural + data-driven** - Mix of event handlers, lookup tables, and imperative state updates
- **Progressive loading** - Wordlist chunks loaded on-demand with IndexedDB caching
- **Graceful degradation** - AI suggestions with multi-model fallback chain
- **Local-first** - All data stored locally, no server dependency except for AI/feedback

## Layers

**Presentation Layer:**
- Purpose: Render DOM, manage animations, capture user input
- Location: `index.html` lines 50-2488 (CSS) + DOM manipulation throughout script
- Contains: HTML structure, CSS variables for theming, animation keyframes
- Depends on: Application state, event listeners
- Used by: User interactions, theme updates

**Application Layer:**
- Purpose: Orchestrate search, filtering, rendering, state synchronization
- Location: `index.html` lines 2695-6318 (main script)
- Contains: Core functions for search, filtering, suggestion, session management
- Depends on: Data layer (JSON, IndexedDB), presentation layer (DOM)
- Used by: Event handlers, data transformations

**Data Abstraction Layer:**
- Purpose: Load/cache/lookup rhyme and wordlist data
- Location: `index.html` lines 2627-2693 (data structures), 3948-3972 (IndexedDB), 3980-4114 (loaders)
- Contains: rhymeDict, chineseDict, charInfo, wordlistData, caching logic
- Depends on: Browser IndexedDB, fetch API, localStorage
- Used by: Search functions, suggestion generation

## Data Flow

### Primary Request Path (Rhyme Search)

1. **User input** (`index.html:5788-5804`) — User types in search input (Zhuyin/Pinyin/Hanzi)
2. **Input parsing** (`index.html:5809-5834` `_refreshFromCurrentInput()`) — Convert input to Zhuyin, detect type
3. **Rhyme lookup** (`index.html:2999-3304` `searchRhyme()`) — Query rhymeDict using BORROW_MAP (借韻) rules
4. **Candidate filtering** (`index.html:4079-4185`) — Filter words by length, frequency tier, selected filters
5. **Render cards** (`index.html:3447-3563` `createCharCard()`) — Create DOM cards for matched characters
6. **Display results** (`index.html:5454-5734` `displayResults()`) — Update left panel with character tiles

**State retained:** `currentRhymes`, `cumulativeCandidates`, `searchedTerms` (for tracking frequency)

### AI Suggestion Flow

1. **Trigger** — User clicks "suggest" button or enters character in suggestion box
2. **Fetch candidates** (`index.html:4290-4408` `updateAIRhymeDisplay()`) — Get filtered words matching rhyme/length
3. **Query LLM** (`index.html:5202-5340` with fallback chain: Gemini→OpenAI→Meta→Deepseek)
4. **Parse response** — Extract suggested words from LLM reply
5. **Render** (`index.html:6290-6316` AI word cards) — Display in right panel with phonetic tooltips

**State retained:** `aiSuggestResultTerms`, LLM model selection in settings

### Session Save/Load Flow

1. **Save** (`index.html:3743-3751`) — Stringify lyrics sections + hashtags → localStorage
2. **Load** (`index.html:3859-3895`) — Parse JSON from file/localStorage on startup
3. **IDB Caching** (`index.html:3995-4025`) — Wordlist chunks cached by version, keyed by chunk index
4. **Overrides** (`index.html:2729-2747`) — User-marked characters stored separately, merged into results

**State retained:** `localStorage['haiku_lyrics']`, `localStorage['haiku_hashtags']`, `localStorage['haiku_dict_overrides']`, IndexedDB 'haoYunQi'

**State Management:**
- **Global scope:** All variables defined at script top level (no module system)
- **Mutation-heavy:** Direct object/array mutations (no immutable patterns)
- **Implicit dependencies:** Functions rely on global state without clear contracts
- **Persistence triggers:** Manual save calls via localStorage or auto-triggered on input blur

## Key Abstractions

**Zhuyin-Pinyin System:**
- Purpose: Convert between phonetic systems for flexible input and display
- Examples: `fullZhuyinToPinyin` map (404 syllable pairs), `pinyinToZhuyin()` conversion
- Pattern: Bidirectional lookup tables + tone stripping/extraction functions

**Rhyme Family (借韻):**
- Purpose: Group characters that rhyme together via borrowing rules
- Examples: ㄚ→[ㄚ, ㄧㄚ, ㄨㄚ] (3-way rhyme grouping)
- Pattern: `BORROW_MAP` + `RHYME_TO_FAMILY` for canonical grouping

**Wordlist Chunking:**
- Purpose: Lazy-load large 13MB wordlist in 10 chunks to avoid browser hang
- Examples: `wordlist-c00.json` through `wordlist-c09.json`, version cached in IndexedDB
- Pattern: Fetch on-demand, cache by version, progress tracking during load

**Character Tier System:**
- Purpose: Mark common/rare/custom characters for filtering
- Examples: 0=common, 1=less common, 2=rare, with user overrides persisted
- Pattern: `charInfo[char] = [{tier, zhuyin, tone}, ...]` with `dictOverrides` tracking

## Entry Points

**Web App (`index.html`):**
- Location: `index.html`
- Triggers: Browser navigation to page URL, PWA launch on mobile
- Responsibilities: Initialize DOM, load data, set up event listeners, render UI
- Initialization sequence:
  1. Parse CSS custom properties (theme)
  2. Build rhyme index from `BORROW_MAP` (lines 2695-2725)
  3. Load rhyme dict from `data/rhyme-dict.json` async
  4. Set up event listeners (lines 5788-6316)
  5. Restore session from localStorage
  6. Wordlist loads on first search (lazy)

**Admin Feedback Backend (`admin/woker.js`):**
- Location: `admin/woker.js` (Cloudflare Workers)
- Triggers: User submits feedback via modal, or admin views reports
- Endpoints:
  - `POST /feedback` — Accept user feedback (no auth)
  - `GET /reports.json?key=<KEY>` — Fetch all reports (key-gated)
  - `POST /reports/decision` — Update report status (key-gated)
  - `DELETE /reports/<kvKey>` — Delete report (key-gated)
- Purpose: Centralized feedback collection + admin dashboard

**Admin Panel (`admin/index.html`):**
- Location: `admin/index.html`
- Triggers: Admin navigates to admin URL with API key
- Responsibilities: Display feedback, apply/reject suggested changes, export decisions

## Architectural Constraints

- **Single-threaded event loop** — All work blocking (no Web Workers used), UI can freeze during wordlist load
- **Global namespace pollution** — ~80 global functions, no module scope (all in script scope)
- **No build step** — Inline CSS + JS, no bundler, no minification
- **IndexedDB dependency** — Wordlist cache requires browser support; gracefully falls back to re-fetch
- **Synchronous DOM updates** — All rendering happens in event handler stack, no requestAnimationFrame batching for card creation
- **localStorage size cap** — ~5-10MB per domain; wordlist not stored here (too large)

## Anti-Patterns

### Global State Mutation

**What happens:** Every function mutates global variables directly (e.g., `rhymeDict = {...}`, `currentRhymes.push(...)`)

**Why it's wrong:** Debugging is hard (state can change anywhere), testing requires full setup, refactoring couples unrelated functions

**Do this instead:** While a full refactor to modules is out of scope, group related state together (e.g., in objects) and add comments documenting state ownership: `// searchState.currentRhymes` instead of bare `currentRhymes`

### Event Handler Chains

**What happens:** Multiple overlapping event listeners on same element (e.g., `contextmenu`, `touchstart`, `touchmove`, `touchend` all on `.ai-word-card`)

**Why it's wrong:** Hard to trace interaction flow; gestures can fire in wrong order on slow devices

**Do this instead:** Use a single gesture manager that coordinates all pointer events (e.g., track `touchstart` time, compute deltas, then decide action). See lines 6272-6316 for current pattern.

### Exponential Character Card Creation

**What happens:** `displayResults()` creates 200+ DOM nodes at once (one per matched character), causing layout thrashing and UI freeze on slow phones

**Why it's wrong:** No pagination or virtualization; mobile users see 5+ second hang on first search

**Do this instead:** Paginate results (show 50, "load more" button) or use virtual scrolling (render only visible cards)

## Error Handling

**Strategy:** Silent failure with toast notifications

**Patterns:**
- API errors → Show user toast, fall back to next LLM model (lines 5202-5240)
- Missing data files → Skip optional features (e.g., no polyphonic order → ignore sorting)
- IndexedDB errors → Silently degrade to fresh fetch each time (line 3986 `try/catch`)
- Parsing errors → Log to console (development only), continue with defaults

**No error boundaries** — If core data (rhymeDict) fails to load, entire app is stuck

## Cross-Cutting Concerns

**Logging:** No logging framework. Debug info via `console.log()` only. No error tracking (Sentry, etc.).

**Validation:** Minimal — input trimmed/lowercased, but no schema validation for JSON files or LLM responses

**Authentication:** None. Feedback endpoint open to all (CORS checks only). Admin endpoints protected by URL parameter key (weak).

**Accessibility:** None. No ARIA labels, color contrast untested, no keyboard navigation hints

---

*Architecture analysis: 2026-10-03*
