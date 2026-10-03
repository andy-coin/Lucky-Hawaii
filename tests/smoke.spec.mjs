// 冒煙測試：用 v0.96 形狀的舊資料開頁，把畫面上每一種 inline 事件處理器各點一次，任何 JS 錯誤都算失敗
// 每個 handler 都在全新的 browser context 裡觸發（D-06），所以破壞性的按鈕（清除、刪除、重新載入）不會互相影響
import { test, expect } from '@playwright/test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { bootPage, settle } from './helpers.mjs';

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/v096-localStorage.json', import.meta.url), 'utf8'));
// 都不在 stub 詞庫裡才會被當成 AI 補充詞；末字刻意選無聲母的字（音／因／陰）：v0.96 的 validateWordRhyme 對有聲母的字（如 開心）一律判不合格
const AI_REPLY = '美音、原因、光陰';

const HANDLER_ATTRS = ['onclick', 'onchange', 'oninput', 'ondrop', 'ondragstart', 'ondragover',
    'ondragleave', 'ondragend', 'ondblclick', 'onblur', 'onkeydown'];
const MISSING_CHAR = '丂';   // 在 BMP 漢字區但不在字庫裡；v0.96 會顯示「無法識別韻腳」加回報鈕
const SELECTOR = HANDLER_ATTRS.map(a => `[${a}]`).join(',');

// ==================== 情境：讓動態才出現的 handler 先渲染出來 ====================
const aiIdle = page => page.waitForFunction(() =>
    !document.getElementById('generateBtn').disabled &&
    !document.getElementById('aiWordsContainer').textContent.includes('AI 生成補充詞'));
const clickGenerate = async page => {
    await page.evaluate(() => document.getElementById('generateBtn').click());
    await aiIdle(page);
};
// 搜尋 心 → 詞庫 stub 只有 12 個候選（<24）→ 直接渲染 .ai-word-card，再由 mock 的 Worker 補 AI 詞
async function searchAndGenerate(page) {
    // 舊資料的 selectedModel 'gpt-4.1' 已不在 LLM_MODELS 裡，下拉選單會是空值，AI 完全不會被呼叫（Phase 2 要處理）；這裡手動選一個
    await page.evaluate(() => { document.getElementById('modelSelect').value = 'gemini-3.5-flash-lite'; });
    await page.fill('#searchInput', '心');
    await settle(page);
    await clickGenerate(page);
    await page.waitForSelector('.ai-word-card .ai-badge');
}
const contextMenuOn = (page, selector) => page.evaluate(sel => {
    const el = document.querySelector(sel);
    el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 100, clientY: 100 }));
}, selector);

const SCENARIOS = {
    base: async () => {},
    // 一般詞卡的右鍵選單（wordCtxReport / wordSuggestReading）＋ saveWord
    aiCards: async page => {
        await searchAndGenerate(page);
        await contextMenuOn(page, '.ai-word-card:not(:has(.ai-badge))');
    },
    // AI 詞卡的右鍵選單（aiWordSuggest）
    aiMenu: async page => {
        await searchAndGenerate(page);
        await contextMenuOn(page, '.ai-word-card:has(.ai-badge)');
    },
    // 再按兩次產生：第一次 AI 補一輪沒有新詞，第二次出現「已推薦所有符合的詞彙」＋重置鈕
    resetPool: async page => {
        await searchAndGenerate(page);
        await clickGenerate(page);
        await clickGenerate(page);
        await page.waitForSelector('.reset-pool-btn');
    },
    // 破音字 chip（selectPolyphonicReading）＋ 字卡右鍵選單（charSuggestReading）
    polyphonic: async page => {
        await page.fill('#searchInput', '樂');
        await settle(page);
        await page.waitForSelector('#polyphonicChips .poly-chip');
        await contextMenuOn(page, '.char-card');
    },
    // 字庫沒有的字 → 「回報」鈕
    missingChar: async page => {
        await page.fill('#searchInput', MISSING_CHAR);
        await settle(page);
        await page.waitForSelector('.report-char-btn');
    },
};

// ==================== 列舉與觸發 ====================
const bootScenario = async (browser, name) => {
    const booted = await bootPage(browser, { storage: FIXTURE, wordlist: 'stub', aiReply: AI_REPLY });
    await SCENARIOS[name](booted.page);
    await settle(booted.page);
    return booted;
};

// 簽章 = 元素上所有 handler 屬性的「名稱=內容」串接；內容相同的元素（例如 178 個 handleBadgeClick）只點一次
const SIG_SRC = `(el => [...el.attributes].filter(a => ${JSON.stringify(HANDLER_ATTRS)}.includes(a.name)).map(a => a.name + '=' + a.value).join(' | '))`;

// 每個簽章第一次出現的情境；順序固定，所以多次列舉結果相同
async function enumerateAll(browser) {
    const found = new Map();   // signature -> { scenario, values }
    for (const name of Object.keys(SCENARIOS)) {
        const { context, page } = await bootScenario(browser, name);
        try {
            const els = await page.evaluate(([sel, src, attrs]) => {
                const sigOf = eval(src);
                return [...document.querySelectorAll(sel)].map(el => ({
                    sig: sigOf(el),
                    values: attrs.map(a => el.getAttribute(a)).filter(v => v !== null),
                }));
            }, [SELECTOR, SIG_SRC, HANDLER_ATTRS]);
            for (const { sig, values } of els) if (!found.has(sig)) found.set(sig, { scenario: name, values });
        } finally {
            await context.close();
        }
    }
    return found;
}

// 在頁面內觸發元素自己的每個事件（不依賴版面，收起的面板和隱藏的 modal 也能點；沒定義的函式名會丟 ReferenceError）
function fireInPage([sel, src, sig]) {
    const sigOf = eval(src);
    const el = [...document.querySelectorAll(sel)].find(e => sigOf(e) === sig);
    if (!el) return 'NOT_FOUND';
    for (const a of [...el.attributes].filter(a => /^on/.test(a.name))) {
        const t = a.name.slice(2);
        if (t === 'click') { el.click(); continue; }
        if (t === 'blur') { el.blur(); continue; }
        const ev = /^drag|^drop/.test(t)
            ? new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() })   // onSectionDragStart 會讀 e.dataTransfer
            : t === 'keydown' ? new KeyboardEvent(t, { bubbles: true, cancelable: true, key: 'Enter' })
            : new Event(t, { bubbles: true, cancelable: true });
        el.dispatchEvent(ev);
    }
    return 'OK';
}

async function fire(page, sig) {
    try {
        return await page.evaluate(fireInPage, [SELECTOR, SIG_SRC, sig]);
    } catch (e) {
        // handler 重新載入頁面（例如 clearDictOverrides）不算錯誤，等載入完即可
        if (!/context was destroyed|navigat/i.test(e.message)) throw e;
        await page.waitForLoadState('load');
        return 'RELOADED';
    }
}

// 對每個簽章開新 context、重現情境、觸發、收集錯誤；回傳失敗清單
async function fireAll(browser, entries) {
    const failures = [];
    for (const [sig, { scenario }] of entries) {
        const { context, page, errors, offOrigin } = await bootScenario(browser, scenario);
        try {
            const r = await fire(page, sig);
            await settle(page).catch(() => {});   // 頁面重新載入時 settle 可能中斷，忽略
            await page.waitForTimeout(200);
            const problems = [...errors];
            if (r === 'NOT_FOUND') problems.push('重現情境後找不到元素（情境不穩定）');
            for (const u of offOrigin) problems.push('未 mock 的外部請求: ' + u);
            if (problems.length) failures.push({ sig, problems });
        } finally {
            await context.close();
        }
    }
    return failures;
}

const report = failures => failures.map(f => `- ${f.sig}\n    ${f.problems.join('\n    ')}`).join('\n');

test('smoke：每個 inline handler 在乾淨環境各點一次，沒有 JS 錯誤', async ({ browser }) => {
    test.setTimeout(240_000);
    const found = await enumerateAll(browser);
    expect(found.size, '至少要找到幾十種 handler').toBeGreaterThan(40);
    console.log(`smoke：共 ${found.size} 種 handler 簽章`);
    const failures = await fireAll(browser, [...found]);
    expect(failures.length, `共 ${failures.length}/${found.size} 個 handler 失敗：\n` + report(failures)).toBe(0);
});

// 負向對照：證明收集器真的抓得到錯誤與未知外部請求，否則它壞掉時整套測試會假綠
test('smoke 負向對照：壞掉的 handler 與未知外部主機都會被抓到', async ({ browser }) => {
    const { context, page, errors, offOrigin } = await bootPage(browser, { storage: FIXTURE, wordlist: 'stub' });
    try {
        await page.evaluate(() => {
            const b = document.createElement('button');
            b.id = 'negControl';
            b.setAttribute('onclick', 'nonexistentFn()');
            document.body.appendChild(b);
        });
        const sig = 'onclick=nonexistentFn()';
        expect(await fire(page, sig)).toBe('OK');
        await settle(page);
        expect(errors.join('\n')).toContain('nonexistentFn is not defined');
        await page.evaluate(() => fetch('https://example.invalid/x').catch(() => {}));
        await page.waitForTimeout(100);
        expect(offOrigin).toContain('https://example.invalid/x');
    } finally {
        await context.close();
    }
});

// ==================== 覆蓋率閘門 ====================
// 原始碼裡每個 handler 呼叫的函式，都必須被上面的迴圈觸發過；
// 真的無法在 headless 渲染出來的才能列在這裡，而且一定要寫理由。目前沒有。
const UNREACHABLE = {
    // 函式名: '無法觸發的具體原因（繁體中文）',
};

// 從 handler 屬性內容抽出被呼叫的函式名：識別字後面緊接 (，且前面不是 . 、字元或 $
const IGNORED_WORDS = new Set(['if', 'for', 'while', 'switch', 'function', 'return', 'typeof', 'event',
    'stopPropagation', 'preventDefault', 'blur']);
function namesIn(handlerValue) {
    const names = [];
    for (const m of handlerValue.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) {
        if (!IGNORED_WORDS.has(m[1])) names.push(m[1]);
    }
    return names;
}

// index.html 加上 js/ 底下所有 .js（Phase 3 拆檔後 handler 會跟著搬過去；目錄還不存在就當空的）
function sourceTexts() {
    const root = new URL('../', import.meta.url);
    const files = [new URL('index.html', root)];
    const walk = dir => {
        if (!existsSync(dir)) return;
        for (const e of readdirSync(dir, { withFileTypes: true })) {
            const u = new URL(e.name + (e.isDirectory() ? '/' : ''), dir);
            if (e.isDirectory()) walk(u);
            else if (e.name.endsWith('.js')) files.push(u);
        }
    };
    walk(new URL('js/', root));
    return files.map(f => readFileSync(f, 'utf8'));
}

function sourceHandlerNames() {
    const names = new Set();
    const re = new RegExp(`\\b(?:${HANDLER_ATTRS.join('|')})="([^"]*)"`, 'g');   // 連 template literal 裡的 handler 也抓得到
    for (const text of sourceTexts()) {
        for (const m of text.matchAll(re)) namesIn(m[1]).forEach(n => names.add(n));
    }
    return names;
}

test('smoke 覆蓋率：原始碼裡的每個 handler 都有被觸發', async ({ browser }) => {
    test.setTimeout(120_000);
    const found = await enumerateAll(browser);
    const fired = new Set();
    for (const { values } of found.values()) for (const v of values) namesIn(v).forEach(n => fired.add(n));
    const source = sourceHandlerNames();

    const problems = [];
    const missing = [...source].filter(n => !fired.has(n) && !(n in UNREACHABLE)).sort();
    if (missing.length) problems.push('原始碼有、但沒被觸發也沒列入 UNREACHABLE：' + missing.join(', ') + '\n  → 新增或擴充 SCENARIOS 讓它渲染出來');
    const stale = Object.keys(UNREACHABLE).filter(n => fired.has(n) || !source.has(n)).sort();
    if (stale.length) problems.push('UNREACHABLE 有過期項目（其實已被觸發或原始碼已不存在）：' + stale.join(', '));
    const noReason = Object.entries(UNREACHABLE).filter(([, r]) => !String(r).trim()).map(([n]) => n);
    if (noReason.length) problems.push('UNREACHABLE 項目缺理由：' + noReason.join(', '));
    expect(problems, problems.join('\n')).toEqual([]);
});

// ==================== 匯入存檔 ====================
// 程式呼叫 input.click() 沒有使用者手勢，所以直接用 setInputFiles
const importFile = (page, buffer) => page.setInputFiles('#importFileInput', { name: 'session.json', mimeType: 'application/json', buffer: Buffer.from(buffer) });

test('import 合法存檔：顯示已讀取存檔並渲染歌詞', async ({ browser }) => {
    const { context, page, errors, offOrigin } = await bootPage(browser, { wordlist: 'stub' });
    try {
        const payload = {   // 與 exportSession 輸出同形狀
            version: 1,
            exportedAt: '2026-10-03T00:00:00.000Z',
            lyricsSections: [
                { label: '主歌', text: '匯入的第一段歌詞', collapsed: false },
                { label: '副歌', text: '匯入的第二段歌詞', collapsed: false },
            ],
            hashtags: ['匯入'],
            savedWords: ['詞彙'],
            contextDescription: '匯入的情境',
        };
        await importFile(page, JSON.stringify(payload));
        await expect(page.locator('#copyToast')).toHaveText('已讀取存檔');
        await expect(page.locator('.section-textarea').first()).toHaveValue('匯入的第一段歌詞');
        await expect(page.locator('#contextDescription')).toHaveValue('匯入的情境');
        expect(errors).toEqual([]);
        expect(offOrigin).toEqual([]);
    } finally {
        await context.close();
    }
});

test('import 壞掉的檔案：顯示讀取失敗，不丟 JS 錯誤', async ({ browser }) => {
    const { context, page, errors, offOrigin } = await bootPage(browser, { wordlist: 'stub' });
    try {
        await importFile(page, 'not json');
        await expect(page.locator('#copyToast')).toHaveText('讀取失敗：檔案格式錯誤');
        expect(errors).toEqual([]);
        expect(offOrigin).toEqual([]);
    } finally {
        await context.close();
    }
});
