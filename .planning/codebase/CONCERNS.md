---
last_mapped_commit: 12759f30d51ec3c5f47e0748b6d60d7fd82bf678
last_mapped_at: 2026-10-03
---
# Codebase Concerns

**Analysis Date:** 2026-10-03

## Tech Debt

**Silent Error Handling:**
- Issue: Many try-catch blocks suppress errors without logging (e.g., `catch(e) {}` pattern throughout index.html)
- Files: `index.html` (lines 2738, 2742, 3348, 3986, 3993, 4002, 4019, 4037, 4041)
- Impact: Difficult to diagnose failures in production; wordlist loading failures, localStorage quota issues, or IndexedDB errors pass silently
- Fix approach: Add explicit logging to error handlers, particularly for data loading paths; consider using console.warn for recoverable failures

**Unreliable Frequency Data (p field):**
- Issue: Wordlist frequency value `p` (0~2.5M) is undocumented as unreliable; many words with `p=0` are NOT cold (from libchewing with no frequency data)
- Files: `ai_guide.md` (line 75), `index.html` (lines 4086, 4141) — priority filtering is commented out
- Impact: Single-char mode fetches all candidates without frequency filtering; three-layer priority system disabled, relying on AI to sort
- Fix approach: Document the limitation prominently; consider adding a separate frequency indicator from a more reliable source

**Hard-Coded Absolute Paths in Python Scripts:**
- Issue: `CORELIB_PATH` and `XIAMAI_PATH` use absolute paths specific to user's machine
- Files: `scripts/merge_corelib.py` (lines 16–17): `/Users/Shared/Claude/Lucky Hawaii`, `/Users/will/Downloads`
- Impact: Scripts fail silently if run from different machines; no portability for CI/CD or team workflows
- Fix approach: Convert to relative paths from script location or use environment variables; validate path existence before use

**Admin Backend Integration Risk:**
- Issue: Admin overrides (wordlist/rhyme-dict overrides JSON) can conflict with frontend queries; no version checking or conflict resolution
- Files: `index.html` (applyWordlistOverrides, applyRhymeDictOverrides); `admin/woker.js` (exportChanges flow)
- Impact: If overrides are applied while frontend has stale wordlist data, inconsistencies emerge; no rollback mechanism
- Fix approach: Add override version tracking; ensure overrides are fetched fresh on each session; document merge strategy

**Disabled Priority Filtering in Single-Char Mode:**
- Issue: Three-layer priority threshold [30, 10, 1] is inactive for single-character (押字尾/押字首) searches
- Files: `index.html` (lines 4086, 4141) — commented out `// if (entry.p < minPriority) continue;`
- Impact: All candidate words returned regardless of frequency; AI must sort thousands of candidates instead of ~100
- Fix approach: Re-enable or create a separate priority heuristic for single-char mode based on character tier (common/normal/rare)

---

## Known Bugs

**IndexedDB Silent Failure Path:**
- Symptoms: Wordlist fails to load (null), but UI only shows toast "詞庫載入失敗" if user clicks before fetch completes
- Files: `index.html` (lines 3986–4026, 5077–5079)
- Trigger: Browser indexedDB quota exceeded, or IndexedDB disabled in private mode; network timeout during chunk fetch
- Workaround: Clear browser cache/IndexedDB manually; toggle private mode off; check network in DevTools
- Impact: Feature complete degradation (AI suggestions unavailable) without clear diagnosis

**Race Condition: Wordlist Loading vs AI Suggestions:**
- Symptoms: Button press during `loadWordlist()` fetch shows "詞庫載入中" toast, but state may not update correctly if multiple presses occur
- Files: `index.html` (lines 3981–4028, 5076–5091)
- Trigger: User clicks "✨提供詞語建議" while wordlist chunks are being fetched
- Workaround: UI button is disabled during loading; clicking again is safe
- Impact: User confusion if toast appears but nothing happens; second click may fail silently

**localStorage Quota Exceeded (Silent):**
- Symptoms: `localStorage.setItem()` fails silently in try-catch; user changes are lost without notification
- Files: `index.html` (lines 2742, 6220 `catch(e) {}`)
- Trigger: User edits many lyrics sections or saves large session on device with limited quota
- Workaround: Manual export as JSON file before quota limit
- Impact: Data loss; user unaware changes weren't persisted

**Second-Round AI Fallback Silently Ignored:**
- Symptoms: If second-round AI call fails in generateAISuggestions, first-round results show without notification
- Files: `index.html` (line 5256 `catch (_) { /* 第二輪失敗就算了 */ }`)
- Trigger: Model fails or quota hits during second-round pick; only happens if first round < 24 results
- Workaround: None visible to user; they get fewer than requested results
- Impact: User receives partial results (e.g., 15 words instead of 24) without explanation

---

## Security Considerations

**Admin API Key in localStorage:**
- Risk: `haoYunQi_admin_key` stored in plain localStorage; accessible to XSS if page is compromised
- Files: `admin/index.html` (key stored in localStorage)
- Current mitigation: Admin UI only served from restricted GitHub Pages repo; Cloudflare Worker validates Origin header
- Recommendations: 
  - Use sessionStorage instead of localStorage for admin keys (lost on tab close)
  - Implement token rotation strategy
  - Add rate limiting to Worker endpoints `/reports.json`, `/reports/decision`

**CORS Origin Check in Worker (Hardcoded):**
- Risk: `ALLOWED_ORIGIN = 'https://andy-coin.github.io'` blocks accidental misuse but no flexibility for preview/staging domains
- Files: `admin/woker.js` (line 1)
- Current mitigation: Hardcoded origin limits attack surface
- Recommendations: 
  - Support multiple origins via environment variable
  - Document deployment checklist for origin changes

**No Rate Limiting on LLM Endpoints:**
- Risk: Worker accepts unlimited concurrent requests; potential for account quota abuse if key leaks
- Files: `admin/woker.js` (lines 126–186)
- Current mitigation: Origin check only
- Recommendations: 
  - Add per-origin request counting (hourly/daily)
  - Return 429 after threshold
  - Log suspicious patterns to Cloudflare Analytics

---

## Performance Bottlenecks

**Large Wordlist Data Files (12MB across 10 chunks):**
- Problem: Each wordlist chunk is ~1.2MB; 10 chunks fetched sequentially
- Files: `data/wordlist-c00.json` through `data/wordlist-c09.json`
- Cause: Comprehensive Chinese vocabulary (130K+ words); no compression (gzip handled by CDN)
- Improvement path:
  - Lazy-load chunks: fetch only common frequency tier on boot, load rare on demand
  - Implement streaming JSON parsing to reduce memory spikes
  - Consider splitting by frequency band instead of sequential range

**Sync IndexedDB Load on First Use:**
- Problem: First load blocks generating AI suggestions if wordlist hasn't finished caching
- Files: `index.html` (loadWordlist fire-and-forget at line 3980; used at 5076–5091)
- Cause: Background fetch but no pre-caching strategy for common operations
- Improvement path:
  - Prioritize common-tier chunks; defer rare until background
  - Pre-warm IndexedDB on app launch with progress bar

**DOM Rendering of Word Cards:**
- Problem: Creating 24 word cards + report div via `innerHTML` += pattern; potential for layout thrashing
- Files: `index.html` (line 5213–5215, 5248–5250)
- Cause: Multiple innerHTML assignments during second-round appends
- Improvement path: 
  - Use DocumentFragment or single innerHTML batch
  - Defer rendering until all AI responses complete

**No Pagination or Virtual Scrolling for Results:**
- Problem: All search results rendered at once; rhyme dictionary with 1343 entries shows entire list
- Files: `index.html` (displayResults function)
- Cause: UI framework (vanilla HTML) lacks virtualization
- Improvement path: 
  - Implement virtual scrolling for large result sets
  - Paginate by rhyme family or frequency band

**Repeated localStorage Access in Hot Paths:**
- Problem: saveLyrics() called on every section edit; reads/writes full lyricsSections array
- Files: `index.html` (lines 2472–2476)
- Cause: No debouncing; localStorage.setItem on each keystroke
- Improvement path: 
  - Debounce save with 1s delay
  - Consider IndexedDB for large datasets

---

## Fragile Areas

**Polyphonic Character Resolution:**
- Files: `index.html` (lines 3321–3391, updateAIRhymeDisplay, selectPolyphonicReading)
- Why fragile: 
  - Reading order depends on external `polyphonic-order.json` fetch; no fallback to charInfo insertion order
  - Wrong reading choice cascades through entire prompt to AI
  - No validation that selected reading is valid for that char
- Safe modification: 
  - Always validate `_polyphonic` against chineseDict before using
  - Add console.assert for charInfo existence
  - Test reading fallback chain (polyphonicsOrderMap → charInfo)
- Test coverage: No unit tests for polyphonic selection; only browser manual testing

**AI Model Fallback Chain:**
- Files: `index.html` (lines 5187–5194, 4550–4616)
- Why fragile: 
  - `isModelAvailable()` check relies on localStorage `selectedModel` and model list order
  - If all models in fallback list fail, error message truncates to 80 chars (line 5266)
  - No tracking of which models were attempted or why they failed
- Safe modification: 
  - Add explicit try-catch per model with individual error logging
  - Log model attempt order to localStorage for debugging
  - Ensure LLM_MODELS list is never empty or malformed
- Test coverage: No E2E tests for fallback scenarios; manual testing only

**Cumulative Candidate Pool Management:**
- Files: `index.html` (lines 5072–5094, resetSuggestedPool)
- Why fragile: 
  - Five interdependent state variables (cumulativeCandidates, suggestedPool, sentCandidatesSet, _aiExtraRoundDone, savedWords)
  - Clearing one subset can leave inconsistencies (e.g., word in suggestedPool but not cumulativeCandidates)
  - No invariants checked after mutations
- Safe modification: 
  - Encapsulate pool state in single object with methods to maintain invariants
  - Add assertions: `suggestedPool ⊆ sentCandidatesSet ⊆ cumulativeCandidates`
- Test coverage: No automated tests; logic is implicit in generateAISuggestions

**Rhyme Dictionary Key Format Parsing:**
- Files: `index.html` (lines 2700–2722, 2758–2791)
- Why fragile: 
  - Dictionary key format is implicit: `baseZhuyin + tone (1-5)` (no comments)
  - Tone extraction via `parseInt(key.slice(-1))` assumes last char is always digit
  - No validation of baseZhuyin format (should be ≥1 char, ≤4 initials+final)
- Safe modification: 
  - Document key format as constant or JSDoc
  - Add validation function for key format before use
  - Create factory function to generate keys consistently
- Test coverage: None

---

## Scaling Limits

**Wordlist Size (130K+ words):**
- Current capacity: ~130K words × ~20 bytes per entry = 2.6MB JSON
- Limit: Browser IndexedDB quota varies (50MB to 500MB+), but memory during filtering can spike
- Scaling path: 
  - Implement SQL.js or WebAssembly-based full-text search
  - Server-side search API (Lambda/Cloudflare Worker) for queries, caching results
  - Prune wordlist by frequency (remove p < 5 unless explicitly requested)

**Concurrent AI Requests:**
- Current capacity: Single sequential model fallback; no parallelization
- Limit: If Worker sees sustained load, Cloudflare free plan rate-limits (~200 req/min)
- Scaling path: 
  - Implement request queuing with backoff
  - Add per-user quota tracking in Worker
  - Cache LLM responses by prompt hash

**UI Update Frequency in Loading State:**
- Current capacity: updateWordlistProgress called 10 times (one per chunk)
- Limit: Frequent DOM updates can lag on low-end devices
- Scaling path: 
  - Batch progress updates (every 2–3 chunks)
  - Use RequestAnimationFrame for smooth progress bar

---

## Dependencies at Risk

**Cloudflare Worker Dependency (Single Point of Failure):**
- Risk: All LLM API calls route through `https://lucky-hawaii.is3000dollar.workers.dev`; if Worker is down, entire app is non-functional
- Impact: No client-side fallback; app becomes read-only
- Migration plan: 
  - Implement fallback to direct Gemini API (requires key exposure; not ideal)
  - Host backup Worker on different platform (e.g., Vercel, AWS Lambda)
  - Cache recent responses locally for offline-like mode

**GitHub Pages Deployment Dependency:**
- Risk: If GitHub Pages deployment fails or repo is deleted, app is offline
- Impact: No data loss (all data is client-side), but service unavailable
- Migration plan: 
  - Add mirror deployment to alternative static host (Netlify, Vercel, etc.)
  - Export/import mechanism for sessions (already implemented) to port to mirror

**vChewing + libchewing Wordlist Source Dependency:**
- Risk: URLs hardcoded in `build_wordlist.py`; if GitHub org moves or files deleted, script breaks
- Impact: Cannot rebuild wordlist; stuck with static data
- Migration plan: 
  - Version control built wordlist files in repo
  - Add fallback wordlist source (e.g., CCEDICT)
  - Document alternate sources in README

**Google Fonts CDN:**
- Risk: Noto Sans TC + JetBrains Mono loaded from `fonts.googleapis.com`; if CDN fails, fonts degrade to system default
- Impact: UI layout may break if font sizes differ; accessibility reduced
- Migration plan: 
  - Self-host fonts in `data/` directory
  - Add fallback font-stack (system fonts only if CDN fails)

---

## Missing Critical Features

**No Input Validation for AI-Generated Words:**
- Problem: generateAISuggestions accepts any word AI returns without checking if it's a valid Chinese word or proper CJK character
- Blocks: Users can save nonsense AI outputs; cannot distinguish AI hallucinations
- Fix: Validate all AI-returned words against rhymeDict before displaying
- Priority: Medium (rare, but affects credibility)

**No Undo/Redo for Lyrics Edits:**
- Problem: Users can accidentally delete entire sections; only undo is browser back/refresh
- Blocks: No protection against accidental data loss during composition
- Fix: Implement simple undo stack (localStorage + timestamp)
- Priority: Medium (workaround: manual save/export)

**No Conflict Resolution for Concurrent Edits:**
- Problem: If user has same session open in two tabs, edits in one tab are clobbered by localStorage writes in other
- Blocks: Multi-window workflows; team collaboration impossible
- Fix: Add session ID + last-write-wins or operational transform (complex)
- Priority: Low (single-user app)

**No Bulk Export for Word Pool:**
- Problem: Users must right-click each word to copy; no "export all saved words" feature
- Blocks: Cannot use results in external lyric editor; manual copypaste required
- Fix: Add "Export Saved Words" button → CSV/TXT download
- Priority: Low (nice-to-have)

**No Offline Mode:**
- Problem: App requires network to load wordlist and call LLM; pure offline use impossible
- Blocks: Composition on flights, trains, or areas without connectivity
- Fix: Pre-load wordlist on first online visit; cache AI responses; provide read-only mode offline
- Priority: Low (rare use case, but valuable for musicians)

---

## Test Coverage Gaps

**No Unit Tests for Core Search/Filter Logic:**
- What's not tested: 
  - `searchRhyme()` with edge cases (empty input, non-CJK, wild cards)
  - `getZhuyinRhyme()` / `getZhuyinInitial()` with all tone variations
  - `filterWordsByRhyme()` boundary conditions (0 candidates, > 24 candidates)
  - Priority layer selection [30, 10, 1] logic
- Files: `index.html` (lines 3016–3222)
- Risk: Silent failures in core search; regressions undetected
- Priority: High — these are user-facing; bugs here break the app

**No Integration Tests for Wordlist Loading:**
- What's not tested: 
  - IndexedDB cache invalidation (version mismatch)
  - Fallback when cache misses
  - Partial chunk load failures
  - Memory behavior under repeated load cycles
- Files: `index.html` (loadWordlist, applyWordlistOverrides)
- Risk: Silent failures; user sees "詞庫載入失敗" but doesn't know why
- Priority: High

**No E2E Tests for AI Fallback Chain:**
- What's not tested: 
  - Model falls back correctly when first choice fails
  - Error messages are clear (not truncated)
  - Second-round AI pick succeeds/fails gracefully
  - Quota errors are caught and handled
- Files: `index.html` (generateAISuggestions, callLLM)
- Risk: Silent errors; users get blank results without diagnosis
- Priority: Medium

**No Browser Compatibility Tests:**
- What's not tested: 
  - IndexedDB support (IE 10, old Safari)
  - localStorage quota behavior (private browsing)
  - CSS grid/flex layout on mobile (< iOS 12, Android 4)
  - Touch event handling (polyphonic chips)
- Risk: App silently breaks on older devices
- Priority: Medium (GitHub Pages typical audience is modern browsers, but still a gap)

**No Manual Testing Checklist for Admin Overrides:**
- What's not tested: 
  - Adding character → wordlist includes it
  - Removing word → AI doesn't suggest it
  - Fixing pronunciation → search returns correct tone variant
  - Rollback after bad override
- Files: `admin/index.html`, `admin/woker.js`, `applied-changes.log`
- Risk: Admins apply bad overrides; users hit wrong data; no audit trail
- Priority: Medium (critical for data quality)

---

## Recommendations by Priority

### High (Fix Soon)

1. **Replace silent catch blocks** with explicit logging for wordlist/IndexedDB/localStorage failures
2. **Add unit tests** for rhyme search, filtering, and priority layer selection
3. **Validate AI-returned words** against dictionary before rendering
4. **Document wordlist frequency limitation** (p=0 ≠ cold); consider re-enabling priority filter for single-char mode

### Medium (Plan Next)

1. **Move hard-coded paths** in Python scripts to environment variables or relative paths
2. **Add rate limiting** to Worker endpoints
3. **Implement wordlist chunking by frequency** instead of sequential; lazy-load rare words
4. **Create polyphonic chip safety checks** (assert valid reading before use)
5. **Add conflict resolution for IndexedDB/localStorage overrides**

### Low (Nice-to-Have)

1. Implement offline mode with pre-loaded wordlist
2. Add undo/redo for lyrics edits
3. Export saved words as CSV
4. Browser compatibility audit (test on IE 11, Safari 12)
5. Migrate fonts to self-hosted for offline fallback

---

*Concerns audit: 2026-10-03*
