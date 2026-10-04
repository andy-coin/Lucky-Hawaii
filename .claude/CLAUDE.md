<!-- GSD:project-start source:PROJECT.md -->

## Project

**好韻器 Lucky Hawaii**

好韻器是一個純前端的中文歌詞押韻工具（目前 v0.96 beta，GitHub Pages 部署），以常用「字」為索引查同韻字，並搭配詞庫與 AI 建議詞彙、段落式歌詞編輯器，幫華語作詞人想出押韻好詞。使用對象是作詞人／音樂創作者（包含開發者 Andy 本人），要在電腦、平板、手機上都好用。

**Core Value:** 輸入一個字或音，就能快速拿到「符合台灣日常語感、真的能寫進歌詞」的押韻字詞——查得到、查得快、查得準，其他功能都建立在這之上。

### Constraints

- **Hosting**: 維持純前端 GitHub Pages ＋ Cloudflare Worker — 免維運、免費
- **Budget**: AI 與主機全部使用免費額度 — 個人獨立專案
- **Data safety**: 更新不得弄丟使用者已存的歌詞、覆寫、設定（localStorage / IndexedDB 需向下相容或遷移）
- **Code structure**: 允許把 `index.html` 拆成多個 JS / CSS 檔（仍需無建置或極簡建置可直接部署到 GitHub Pages）
- **Devices**: 電腦、平板、手機都必須好用
- **Language**: 介面與詞庫以台灣繁體中文為主，嚴禁簡體

<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->

## Technology Stack

## Languages

- JavaScript - Client-side application logic, all interactive features
- HTML5 - Document structure and semantic markup
- CSS3 - Styling, responsive design with CSS Grid/Flexbox, dark mode support via CSS variables
- Python 3.13 - Build-time data processing scripts (`scripts/build_wordlist.py`, `scripts/merge_corelib.py`)

## Runtime

- Browser runtime (vanilla JavaScript, no Node.js runtime in production)
- Development container: Docker with Node.js 22 + Python 3.13
- npm - Development dependencies only (minimal, in `.claude/hooks/package.json`)
- No production dependencies bundled

## Frameworks

- Vanilla JavaScript (no framework) - Pure DOM manipulation and event handling
- HTML5 Web APIs - Fetch API, IndexedDB, localStorage, Web Manifest
- Google Fonts - Noto Sans TC (display and body text), JetBrains Mono (code/technical text)
- Imported via `<link>` tags from `https://fonts.googleapis.com/css2`
- Python urllib - Data fetching and JSON processing
- Docker - Development environment containerization
- Cloudflare Workers - Backend infrastructure (not a framework, but runtime)

## Key Dependencies

- Google Fonts API - Typography (embedded via link tags, no npm dependency)
- Cloudflare Workers Runtime - Handles API proxy, user feedback storage, CORS
- Cloudflare KV Storage - Persistent feedback data storage
- IndexedDB - Client-side caching of wordlist data (browser native)
- localStorage - Session state and UI preferences persistence (browser native)

## Configuration

- Secrets stored in Cloudflare Worker bindings:
- Python scripts handle data preparation:
- Output: JSON data files in `data/` directory
- `manifest.json` - PWA manifest (standalone display, app icons, theme colors)
- `.devcontainer/Dockerfile` - Development container specification
- `.devcontainer/docker-compose.yml` - Local dev environment setup

## Platform Requirements

- Node.js 22 (in dev container)
- Python 3.13 (for build scripts)
- Docker (for containerized development)
- Git (for version control)
- Modern browser with ES6 support
- IndexedDB support (for wordlist caching)
- fetch API support
- CSS Grid/Flexbox support
- Deployment: GitHub Pages (static hosting)

## Data Files

- `data/wordlist.json` - Master wordlist (~14MB)
- `data/wordlist-c00.json` through `data/wordlist-c09.json` - Chunked wordlist for incremental loading
- `data/wordlist-meta.json` - Version metadata for cache invalidation
- `data/rhyme-dict.js` and `.json` - Rhyme dictionary (converted from BPMF phoneme keys)
- `data/polyphonic-order.js` and `.json` - Tone/polyphony ordering data
- `data/wordlist-overrides.json` - User-applied corrections/overrides
- `data/rhyme-dict-overrides.json` - Rhyme dictionary overrides

## Entry Points

- `index.html` - Main application entry point (complete single-page app)
- Embedded JavaScript: ~8000+ lines of inline script in `<head>` and `<body>`
- `admin/index.html` - Admin dashboard for feedback management
- `admin/woker.js` - Cloudflare Worker script (handles LLM proxy + feedback API)

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

## Naming Patterns

- Single monolithic HTML file: `index.html` (6320 lines, contains all CSS and JavaScript)
- Admin tools: `admin/index.html`, `admin/woker.js`
- Python build scripts: `scripts/build_wordlist.py`, `scripts/merge_corelib.py`
- Data files: `data/*.json` (wordlists, rhyme dictionaries, polyphonic character lists)
- camelCase for all functions: `searchRhyme()`, `createCharCard()`, `displayResults()`, `buildIndex()`
- Private/internal functions prefixed with underscore: `_removeCharFromRhymeKey()`, `_addCharToRhymeKey()`, `_hideCtxMenu()`, `_showCharCtxMenu()`
- Async functions use `async` keyword and return Promises: `async function loadPolyphonicsOrder()`, `async function applyRhymeDictOverrides()`
- camelCase for all variables: `zhuyinInitials`, `pinyinInitials`, `chineseDict`, `charInfo`, `searchedTerms`
- Global state variables use camelCase: `inputMode`, `currentMode`, `selectedChars`, `hashtags`, `lyricsSections`
- localStorage keys use descriptive names with version hints: `dictOverrides_v076`, `haiku_hashtags`, `haiku_lyrics`, `haiku_savedwords`, `haoYunQi_inputMode`
- Constants in UPPER_CASE for immutable lookup tables: `BORROW_MAP`, `RHYME_FAMILIES`, `RHYME_TO_FAMILY`, `PINYIN_RHYME_MAP`, `PINYIN_INITIAL_TO_ZHUYIN`, `PINYIN_SPECIAL`
- Map/Set objects use descriptive names: `seenChars`, `seenRhymes`, `pendingChanges`, `suggestedPool`, `sentCandidatesSet`
- Objects and dictionaries use object literal notation with descriptive keys
- No TypeScript; all data structures use plain JavaScript objects
- Example structure from rhyme dictionary: `{ char, zhuyin, tone, tier, pinyin, zhuyinRhyme, zhuyinInitial, rhymeIndex }`
- localStorage JSON stored as stringified objects with version keys

## Code Style

- No automatic formatting tool configured
- 4-space indentation (consistent throughout)
- Lines vary in length; no hard limit enforced
- Single quotes used for string literals in most cases
- Template literals used for dynamic HTML generation
- No ESLint, Prettier, or other linter configured
- No `.eslintrc`, `.prettierrc`, or `biome.json` present
- Code style maintained manually through convention
- Section headers use `// ==================== [Section Name] ====================` pattern for major sections
- Subsections use `// === [Subsection Name] ===` pattern
- Inline comments use `//` with Chinese explanation
- Example: `// 注音優先架構 v1.0` (Zhuyin-priority architecture v1.0)
- Comments are written in Chinese (matching app language)
- Some historical/archival comments preserved: `// kept for compatibility`
- Comments explain *why* not *what* for complex logic
- No JSDoc or formal documentation comments
- Function purposes explained via inline comments at function start
- Example: `// 從注音字串提取聲母` (Extract initial consonant from Zhuyin string)
- Complex algorithms documented with comment blocks explaining step-by-step logic

## Import Organization

- Single-file application: all JavaScript in `<script>` tag in `index.html` (line 2490+)
- Embedded CSS in `<style>` tag in `<head>` (line 12+)
- No module system (no import/export, no require)
- Global scope for all functions and variables (no module wrapping)
- External data loaded via `fetch()` (asynchronous):
- All globals declared at script start (~line 3291+)
- Data loaded on demand via `loadRhymeDict()`, `loadWordlist()`, `loadPolyphonicsOrder()`
- localStorage preloaded at startup: `inputMode`, `hashtags`, `lyricsSections`, `savedWords`

## Error Handling

- Silent failures for non-critical operations:
- Async errors caught with `.catch()` returning safe defaults:
- Validation with early returns (guard clauses):
- User-facing errors shown via `showToast()` function
- No error logging to remote service; `console.log()` used for debug info
- File read errors in import: `try { ... } catch(e) { showToast('讀取失敗：檔案格式錯誤'); }`
- Input validation via regex patterns: `/[ㄅ-ㄩ]/` for Zhuyin detection, `/[一-鿿]/` for Chinese characters
- Range checks: `if (file.size > MAX_SIZE)`
- Type checking via `typeof`, `Array.isArray()`
- No runtime schema validation; reliance on expected object shapes

## Logging

- Info logs with contextual prefixes:
- Metrics logged during data processing:
- Debug flag for developer mode (not exposed in UI):
- No production logging to remote servers

## State Management

- `dictOverrides_v076` - user-customized rhyme dictionary overrides
- `haiku_hashtags` - JSON array of hashtags
- `haiku_lyrics` - JSON array of lyric sections with labels and text
- `haiku_savedwords` - JSON array of saved/pinned words
- `haoYunQi_inputMode` - user's preferred input mode ('auto', 'pinyin', 'zhuyin')
- `recentPanelCollapsed`, `leftPanelCollapsed`, `contextSectionCollapsed`, `savedPoolCollapsed` - UI state flags
- Data persisted immediately on change via `localStorage.setItem()`
- Global module-level variables (no factory/singleton pattern)
- DOM-centric: state reflected in HTML classes/attributes
- Selected characters tracked in `selectedChars` Set
- AI word suggestions cached in `suggestedPool` Set, `cumulativeCandidates` array
- Currently selected polyphonic reading: `_polyphonic = { char: null, reading: null }`
- Used for large wordlist data persistence (function `_idbOpen()`)
- Enables offline use and faster load after first fetch
- No explicit schema; key-value store for chunks

## Asynchronous Patterns

- Modern async/await used for data fetching:
- Promise chains used for initialization:
- DOM event handlers: `onclick`, `ondblclick`, `oninput`, `onchange`
- Drag-and-drop handlers: `ondragstart`, `ondragover`, `ondrop`
- Touch handlers: `ontouchstart`, `ontouchmove`, `ontouchend`
- Window events: `resize`, `contextmenu`, `click`
- FileReader for import: `reader.onload`, `reader.readAsText()`

## Numeric and Special Values

- Numeric: 1-5 (1=first tone, 2=second, 3=third, 4=fourth, 5=neutral)
- Tone marks in Zhuyin: 'ˉ' (1st), 'ˊ' (2nd), 'ˇ' (3rd), 'ˋ' (4th), '˙' (5th)
- Mapping: `TONE_CHAR_TO_INT = { 'ˉ': 1, 'ˊ': 2, 'ˇ': 3, 'ˋ': 4, '˙': 5 }`
- `'common'` - frequently used (常用字)
- `'normal'` - moderately used (一般字)
- `'rare'` - infrequently used (冷僻字)
- Encoded in rhyme dictionary as: `'common字｜normal字｜rare字'`
- `'—'` (em dash) or `'-'` (hyphen) represents empty tier in rhyme entry
- Used when a tier has no characters: `'常用字｜—｜冷僻字'`

## CSS Class Naming

- `.char-card`, `.ai-word-card`, `.polyphonic-chips`
- `.search-highlight-1` through `.search-highlight-5` (color groups)
- `.mark-badge`, `.rare-mark`, `.ai-badge`
- `.collapsed`, `.dragging`, `drag-over` (state classes)
- `.section-header`, `.section-body`, `.lyrics-section`
- Prefixes for groupings: `.left-panel`, `.right-panel`, `.side-panel`, `.bottom-panel`

<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

## System Overview

```text

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

- **Inline JavaScript architecture** - All code in `<script>` tag within `index.html`
- **Procedural + data-driven** - Mix of event handlers, lookup tables, and imperative state updates
- **Progressive loading** - Wordlist chunks loaded on-demand with IndexedDB caching
- **Graceful degradation** - AI suggestions with multi-model fallback chain
- **Local-first** - All data stored locally, no server dependency except for AI/feedback

## Layers

- Purpose: Render DOM, manage animations, capture user input
- Location: `index.html` lines 50-2488 (CSS) + DOM manipulation throughout script
- Contains: HTML structure, CSS variables for theming, animation keyframes
- Depends on: Application state, event listeners
- Used by: User interactions, theme updates
- Purpose: Orchestrate search, filtering, rendering, state synchronization
- Location: `index.html` lines 2695-6318 (main script)
- Contains: Core functions for search, filtering, suggestion, session management
- Depends on: Data layer (JSON, IndexedDB), presentation layer (DOM)
- Used by: Event handlers, data transformations
- Purpose: Load/cache/lookup rhyme and wordlist data
- Location: `index.html` lines 2627-2693 (data structures), 3948-3972 (IndexedDB), 3980-4114 (loaders)
- Contains: rhymeDict, chineseDict, charInfo, wordlistData, caching logic
- Depends on: Browser IndexedDB, fetch API, localStorage
- Used by: Search functions, suggestion generation

## Data Flow

### Primary Request Path (Rhyme Search)

### AI Suggestion Flow

### Session Save/Load Flow

- **Global scope:** All variables defined at script top level (no module system)
- **Mutation-heavy:** Direct object/array mutations (no immutable patterns)
- **Implicit dependencies:** Functions rely on global state without clear contracts
- **Persistence triggers:** Manual save calls via localStorage or auto-triggered on input blur

## Key Abstractions

- Purpose: Convert between phonetic systems for flexible input and display
- Examples: `fullZhuyinToPinyin` map (404 syllable pairs), `pinyinToZhuyin()` conversion
- Pattern: Bidirectional lookup tables + tone stripping/extraction functions
- Purpose: Group characters that rhyme together via borrowing rules
- Examples: ㄚ→[ㄚ, ㄧㄚ, ㄨㄚ] (3-way rhyme grouping)
- Pattern: `BORROW_MAP` + `RHYME_TO_FAMILY` for canonical grouping
- Purpose: Lazy-load large 13MB wordlist in 10 chunks to avoid browser hang
- Examples: `wordlist-c00.json` through `wordlist-c09.json`, version cached in IndexedDB
- Pattern: Fetch on-demand, cache by version, progress tracking during load
- Purpose: Mark common/rare/custom characters for filtering
- Examples: 0=common, 1=less common, 2=rare, with user overrides persisted
- Pattern: `charInfo[char] = [{tier, zhuyin, tone}, ...]` with `dictOverrides` tracking

## Entry Points

- Location: `index.html`
- Triggers: Browser navigation to page URL, PWA launch on mobile
- Responsibilities: Initialize DOM, load data, set up event listeners, render UI
- Initialization sequence:
- Location: `admin/woker.js` (Cloudflare Workers)
- Triggers: User submits feedback via modal, or admin views reports
- Endpoints:
- Purpose: Centralized feedback collection + admin dashboard
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

### Event Handler Chains

### Exponential Character Card Creation

## Error Handling

- API errors → Show user toast, fall back to next LLM model (lines 5202-5240)
- Missing data files → Skip optional features (e.g., no polyphonic order → ignore sorting)
- IndexedDB errors → Silently degrade to fresh fetch each time (line 3986 `try/catch`)
- Parsing errors → Log to console (development only), continue with defaults

## Cross-Cutting Concerns

<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
