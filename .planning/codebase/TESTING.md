---
last_mapped_commit: 12759f30d51ec3c5f47e0748b6d60d7fd82bf678
last_mapped_at: 2026-10-03
---
# Testing Patterns

**Analysis Date:** 2026-10-03

## Current State

**No formal testing framework installed.** This is a single-file frontend application with no test infrastructure in place.

- No test files (`.test.js`, `.spec.js`) present
- No test runner configured (Jest, Vitest, Mocha, etc.)
- No test dependencies in project
- No CI/CD pipeline for automated testing
- Manual testing only

## Manual Testing Approach

**Current Practice:**
- Browser-based testing: open `index.html` in web browser, interact directly
- Desktop testing: Chrome, Safari, Firefox on macOS
- Mobile testing: responsive design tested on iOS Safari and Android Chrome
- Accessibility testing: manual keyboard navigation testing

**Debug Helpers:**
- Browser DevTools console for inspection
- Debug flag in code: `const USE_PRIORITY = false;` (set to `true` to show word priority values on hover)
- `console.log()` statements at key points:
  - `[buildIndex] ${count} 字, ${count} 組` — tracks dictionary indexing
  - `[rhyme overrides] ${count} 條套用` — tracks applied overrides
  - `[wordlist overrides] before=${before} → after=${filtered.length}` — tracks wordlist changes

## Data & Integration Testing

**Data Processing Scripts (Python):**

Located in `scripts/`:
- `build_wordlist.py` - Downloads wordlists from GitHub, merges vChewing + libchewing, outputs JSON chunks
- `merge_corelib.py` - Merges core library data (purpose unclear; named but not analyzed)

**Pattern:** Scripts include logging to track data quality:

```python
print(f"  vChewing：新增 {added}，覆蓋更新 {updated}，略過格式錯誤 {skipped}")
print(f"  libchewing：新增 {added}（補充），略過重複 {skipped}")
print(f"檔案大小：{size_kb:.1f} KB ({size_kb/1024:.1f} MB)")
```

No unit tests for Python scripts; success measured by output file integrity.

## Recommended Testing Strategy

### Unit Testing (If to be added)

**Framework Choice:** Vitest (lightweight, ESM-ready, no build step needed for browser environment)

**Example Test Structure for Core Functions:**

```javascript
// core-functions.test.js - Testing rhyme search logic
describe('searchRhyme', () => {
    test('should find rhymes for single Zhuyin input', () => {
        const results = searchRhyme('ㄢ');
        expect(results.length).toBeGreaterThan(0);
        expect(results.every(r => r.zhuyinRhyme === 'ㄢ')).toBe(true);
    });

    test('should find rhymes for single Pinyin input', () => {
        const results = searchRhyme('an');
        expect(results.length).toBeGreaterThan(0);
        expect(results.some(r => r.tier === 'common')).toBe(true);
    });

    test('should handle empty input', () => {
        const results = searchRhyme('');
        expect(results).toEqual([]);
    });
});

describe('pinyinToZhuyin', () => {
    test('should convert complete syllables', () => {
        expect(pinyinToZhuyin('ban')).toBe('ㄅㄢ');
        expect(pinyinToZhuyin('zhu')).toBe('ㄓㄨ');
    });

    test('should handle multi-reading case', () => {
        const groups = pinyinToZhuyinGroups('nu');
        expect(groups.length).toBeGreaterThan(1);
        expect(groups.map(g => g.zhuyin)).toContain('ㄋㄨ');
    });
});

describe('getCharMark', () => {
    test('should return tier for character with Zhuyin', () => {
        const mark = getCharMark('好', 'ㄏㄠ');
        expect(['common', 'normal', 'rare']).toContain(mark);
    });
});
```

### Integration Testing (If to be added)

**Scope:** Test dictionary loading, data persistence, UI interaction

```javascript
// integration.test.js
describe('Dictionary Loading', () => {
    beforeAll(async () => {
        // Mock fetch to avoid network calls
        global.fetch = jest.fn((url) => {
            if (url === 'data/rhyme-dict.json') {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve(mockRhymeDict)
                });
            }
        });
    });

    test('should load and index rhyme dictionary', async () => {
        await loadRhymeDict();
        buildIndex();
        expect(Object.keys(chineseDict).length).toBeGreaterThan(0);
    });

    test('should apply dictionary overrides from localStorage', async () => {
        localStorage.setItem('dictOverrides_v076', JSON.stringify({
            'ㄅㄢ1': '新好'
        }));
        loadDictOverrides();
        expect(dictOverrides['ㄅㄢ1']).toBe('新好');
    });
});

describe('localStorage Persistence', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    test('should save and restore hashtags', () => {
        addHashtag('test');
        expect(JSON.parse(localStorage.getItem('haiku_hashtags'))).toContain('test');
        
        hashtags = [];
        const saved = JSON.parse(localStorage.getItem('haiku_hashtags'));
        hashtags = saved;
        expect(hashtags).toContain('test');
    });

    test('should save lyrics sections on edit', () => {
        lyricsSections = [{ label: '主歌', text: '歌詞文本', collapsed: false }];
        saveLyrics();
        const stored = JSON.parse(localStorage.getItem('haiku_lyrics'));
        expect(stored[0].text).toBe('歌詞文本');
    });
});
```

### E2E Testing (If to be added)

**Framework Choice:** Playwright or Puppeteer for headless browser testing

```javascript
// e2e-search.test.js
describe('Search Workflow', () => {
    let browser;
    let page;

    beforeAll(async () => {
        browser = await chromium.launch();
        page = await browser.newPage();
        await page.goto('file:///path/to/index.html');
    });

    test('should search and display rhymes', async () => {
        const searchInput = await page.$('input[id="searchInputEl"]');
        await searchInput.type('ㄢ');
        
        await page.waitForSelector('.char-card');
        const cards = await page.$$('.char-card');
        expect(cards.length).toBeGreaterThan(0);
    });

    test('should toggle character selection', async () => {
        const card = await page.$('.char-card');
        await card.click();
        const selected = await card.evaluate(el => el.classList.contains('selected'));
        expect(selected).toBe(true);
    });
});
```

## Test Coverage Gaps

**Critical Paths Not Covered:**
1. **Rhyme Dictionary Indexing** (`buildIndex()`) - No validation that all 20,000+ characters are indexed
2. **Polyphonic Character Handling** - No tests for multi-reading selection logic
3. **Dictionary Override Application** - No tests for character tier movement across categories
4. **Wordlist Chunking** - No validation of 10-chunk NDJSON format
5. **localStorage Limits** - No tests for quota exceeded scenarios
6. **Offline Mode** - No tests for IndexedDB fallback when network unavailable
7. **AI Suggestions** - No tests for word filtering, sorting, or LLM integration
8. **Import/Export** - No validation of JSON structure preservation during file round-trip
9. **Mobile Touch Interactions** - No automated tests for long-press, drag-and-drop
10. **Theme Switching** - No tests for CSS variable application in dark/light mode

## Mocking Strategy

**No mocking framework in place.** If testing is added:

**What to Mock:**
- `fetch()` - All network requests (rhyme dict, wordlist, polyphonic data, overrides)
- `localStorage` - All persistence operations (in test framework context, usually auto-mocked)
- `IndexedDB` - Large wordlist storage (use fake-indexeddb or similar)
- `FileReader` - Import file reading (create Blob test fixtures)
- `URL.createObjectURL()` - Export download (spy on calls, avoid actual file creation)
- `window.prompt()`, `window.confirm()` - User dialogs (return test values)
- `window.alert()` - Error dialogs (stub to avoid breaking test flow)

**What NOT to Mock:**
- DOM manipulation (use actual DOM or jsdom)
- String/regex operations (logic lives here; test directly)
- Zhuyin ↔ Pinyin conversion tables (should be tested against real data)
- Rhyme borrow/family logic (core algorithm; test with real mappings)

## Data Fixtures

**Minimal Test Dataset** (instead of full 20,000-character dictionary):

```json
{
    "ㄅㄢ1": "好｜般｜冥",
    "ㄅㄢ3": "保｜百｜—",
    "ㄢ2": "安｜—｜—",
    "ㄠ1": "刀｜—｜—"
}
```

**Wordlist Entry** (for AI suggestion testing):

```javascript
{ w: "好詞", z: "ㄏㄠˇ ㄘˊ", p: 1000 }
```

## Performance Considerations

**Potential Bottlenecks Not Tested:**
- Dictionary search with 20,000+ characters (O(n) scan per query)
- Wordlist chunked loading performance (10 async fetches)
- DOM rendering of 1000+ character cards simultaneously
- localStorage.getItem() on large override objects (100+ entries)
- Regex matching on every keystroke in search input

**No performance tests or benchmarks currently in place.**

---

*Testing analysis: 2026-10-03*
