---
last_mapped_commit: 12759f30d51ec3c5f47e0748b6d60d7fd82bf678
last_mapped_at: 2026-10-03
---
# Coding Conventions

**Analysis Date:** 2026-10-03

## Naming Patterns

**Files:**
- Single monolithic HTML file: `index.html` (6320 lines, contains all CSS and JavaScript)
- Admin tools: `admin/index.html`, `admin/woker.js`
- Python build scripts: `scripts/build_wordlist.py`, `scripts/merge_corelib.py`
- Data files: `data/*.json` (wordlists, rhyme dictionaries, polyphonic character lists)

**Functions:**
- camelCase for all functions: `searchRhyme()`, `createCharCard()`, `displayResults()`, `buildIndex()`
- Private/internal functions prefixed with underscore: `_removeCharFromRhymeKey()`, `_addCharToRhymeKey()`, `_hideCtxMenu()`, `_showCharCtxMenu()`
- Async functions use `async` keyword and return Promises: `async function loadPolyphonicsOrder()`, `async function applyRhymeDictOverrides()`

**Variables:**
- camelCase for all variables: `zhuyinInitials`, `pinyinInitials`, `chineseDict`, `charInfo`, `searchedTerms`
- Global state variables use camelCase: `inputMode`, `currentMode`, `selectedChars`, `hashtags`, `lyricsSections`
- localStorage keys use descriptive names with version hints: `dictOverrides_v076`, `haiku_hashtags`, `haiku_lyrics`, `haiku_savedwords`, `haoYunQi_inputMode`
- Constants in UPPER_CASE for immutable lookup tables: `BORROW_MAP`, `RHYME_FAMILIES`, `RHYME_TO_FAMILY`, `PINYIN_RHYME_MAP`, `PINYIN_INITIAL_TO_ZHUYIN`, `PINYIN_SPECIAL`
- Map/Set objects use descriptive names: `seenChars`, `seenRhymes`, `pendingChanges`, `suggestedPool`, `sentCandidatesSet`

**Types/Objects:**
- Objects and dictionaries use object literal notation with descriptive keys
- No TypeScript; all data structures use plain JavaScript objects
- Example structure from rhyme dictionary: `{ char, zhuyin, tone, tier, pinyin, zhuyinRhyme, zhuyinInitial, rhymeIndex }`
- localStorage JSON stored as stringified objects with version keys

## Code Style

**Formatting:**
- No automatic formatting tool configured
- 4-space indentation (consistent throughout)
- Lines vary in length; no hard limit enforced
- Single quotes used for string literals in most cases
- Template literals used for dynamic HTML generation

**Linting:**
- No ESLint, Prettier, or other linter configured
- No `.eslintrc`, `.prettierrc`, or `biome.json` present
- Code style maintained manually through convention

**Comments:**
- Section headers use `// ==================== [Section Name] ====================` pattern for major sections
- Subsections use `// === [Subsection Name] ===` pattern
- Inline comments use `//` with Chinese explanation
- Example: `// 注音優先架構 v1.0` (Zhuyin-priority architecture v1.0)
- Comments are written in Chinese (matching app language)
- Some historical/archival comments preserved: `// kept for compatibility`
- Comments explain *why* not *what* for complex logic

**JSDoc/Comments:**
- No JSDoc or formal documentation comments
- Function purposes explained via inline comments at function start
- Example: `// 從注音字串提取聲母` (Extract initial consonant from Zhuyin string)
- Complex algorithms documented with comment blocks explaining step-by-step logic

## Import Organization

**Module Structure:**
- Single-file application: all JavaScript in `<script>` tag in `index.html` (line 2490+)
- Embedded CSS in `<style>` tag in `<head>` (line 12+)
- No module system (no import/export, no require)
- Global scope for all functions and variables (no module wrapping)
- External data loaded via `fetch()` (asynchronous):
  - `data/rhyme-dict.json` - main rhyme dictionary
  - `data/wordlist-c*.json` - 10 chunks of wordlist data
  - `data/polyphonic-order.json` - polyphonic character reading order
  - Falls back to `window._polyphonicsOrderData` if injected via separate `<script src="data/polyphonic-order.js">`

**Global State Initialization:**
- All globals declared at script start (~line 3291+)
- Data loaded on demand via `loadRhymeDict()`, `loadWordlist()`, `loadPolyphonicsOrder()`
- localStorage preloaded at startup: `inputMode`, `hashtags`, `lyricsSections`, `savedWords`

## Error Handling

**Patterns:**
- Silent failures for non-critical operations:
  ```javascript
  try { 
    localStorage.setItem('key', JSON.stringify(data)); 
  } catch(e) {}
  ```
- Async errors caught with `.catch()` returning safe defaults:
  ```javascript
  fetch('data/file.json')
    .catch(() => { polyphonicsOrderMap = new Map(); });
  ```
- Validation with early returns (guard clauses):
  ```javascript
  if (!input) { searchedTerms = []; return []; }
  if (!infos || infos.length === 0) return 'normal';
  ```
- User-facing errors shown via `showToast()` function
- No error logging to remote service; `console.log()` used for debug info
- File read errors in import: `try { ... } catch(e) { showToast('讀取失敗：檔案格式錯誤'); }`

**Validation:**
- Input validation via regex patterns: `/[ㄅ-ㄩ]/` for Zhuyin detection, `/[一-鿿]/` for Chinese characters
- Range checks: `if (file.size > MAX_SIZE)`
- Type checking via `typeof`, `Array.isArray()`
- No runtime schema validation; reliance on expected object shapes

## Logging

**Framework:** Console only

**Patterns:**
- Info logs with contextual prefixes:
  ```javascript
  console.log(`[buildIndex] ${Object.keys(chineseDict).length} 字, ${Object.keys(rhymeDict).length} 組`);
  console.log(`[rhyme overrides] ${count} 條套用`);
  ```
- Metrics logged during data processing:
  ```javascript
  console.log(f"  vChewing：新增 {added}，覆蓋更新 {updated}，略過格式錯誤 {skipped}");
  ```
- Debug flag for developer mode (not exposed in UI):
  ```javascript
  const USE_PRIORITY = false;  // Set to true to show priority values in hover
  ```
- No production logging to remote servers

## State Management

**localStorage Keys:**
- `dictOverrides_v076` - user-customized rhyme dictionary overrides
- `haiku_hashtags` - JSON array of hashtags
- `haiku_lyrics` - JSON array of lyric sections with labels and text
- `haiku_savedwords` - JSON array of saved/pinned words
- `haoYunQi_inputMode` - user's preferred input mode ('auto', 'pinyin', 'zhuyin')
- `recentPanelCollapsed`, `leftPanelCollapsed`, `contextSectionCollapsed`, `savedPoolCollapsed` - UI state flags
- Data persisted immediately on change via `localStorage.setItem()`

**In-Memory State:**
- Global module-level variables (no factory/singleton pattern)
- DOM-centric: state reflected in HTML classes/attributes
- Selected characters tracked in `selectedChars` Set
- AI word suggestions cached in `suggestedPool` Set, `cumulativeCandidates` array
- Currently selected polyphonic reading: `_polyphonic = { char: null, reading: null }`

**IndexedDB:**
- Used for large wordlist data persistence (function `_idbOpen()`)
- Enables offline use and faster load after first fetch
- No explicit schema; key-value store for chunks

## Asynchronous Patterns

**Async/Await:**
- Modern async/await used for data fetching:
  ```javascript
  async function applyRhymeDictOverrides() {
      const r = await fetch('data/rhyme-dict-overrides.json', { cache: 'no-cache' });
      const ovr = await r.json();
  }
  ```
- Promise chains used for initialization:
  ```javascript
  loadPolyphonicsOrder().then(() => renderPolyphonicChips(char));
  ```

**Event-Driven:**
- DOM event handlers: `onclick`, `ondblclick`, `oninput`, `onchange`
- Drag-and-drop handlers: `ondragstart`, `ondragover`, `ondrop`
- Touch handlers: `ontouchstart`, `ontouchmove`, `ontouchend`
- Window events: `resize`, `contextmenu`, `click`
- FileReader for import: `reader.onload`, `reader.readAsText()`

## Numeric and Special Values

**Tones:**
- Numeric: 1-5 (1=first tone, 2=second, 3=third, 4=fourth, 5=neutral)
- Tone marks in Zhuyin: 'ˉ' (1st), 'ˊ' (2nd), 'ˇ' (3rd), 'ˋ' (4th), '˙' (5th)
- Mapping: `TONE_CHAR_TO_INT = { 'ˉ': 1, 'ˊ': 2, 'ˇ': 3, 'ˋ': 4, '˙': 5 }`

**Tiers (character frequency):**
- `'common'` - frequently used (常用字)
- `'normal'` - moderately used (一般字)
- `'rare'` - infrequently used (冷僻字)
- Encoded in rhyme dictionary as: `'common字｜normal字｜rare字'`

**Special Character Markers:**
- `'—'` (em dash) or `'-'` (hyphen) represents empty tier in rhyme entry
- Used when a tier has no characters: `'常用字｜—｜冷僻字'`

## CSS Class Naming

**Pattern:** kebab-case for class names
- `.char-card`, `.ai-word-card`, `.polyphonic-chips`
- `.search-highlight-1` through `.search-highlight-5` (color groups)
- `.mark-badge`, `.rare-mark`, `.ai-badge`
- `.collapsed`, `.dragging`, `drag-over` (state classes)
- `.section-header`, `.section-body`, `.lyrics-section`
- Prefixes for groupings: `.left-panel`, `.right-panel`, `.side-panel`, `.bottom-panel`

---

*Convention analysis: 2026-10-03*
