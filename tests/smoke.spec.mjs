// 冒煙測試：用 v0.96 形狀的舊資料開頁，把畫面上每一種 inline 事件處理器各點一次，任何 JS 錯誤都算失敗
// 每個 handler 都在全新的 browser context 裡觸發（D-06），所以破壞性的按鈕（清除、刪除、重新載入）不會互相影響
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
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
    const found = new Map();   // signature -> { scenario }
    for (const name of Object.keys(SCENARIOS)) {
        const { context, page } = await bootScenario(browser, name);
        try {
            const sigs = await page.evaluate(([sel, src]) => {
                const sigOf = eval(src);
                return [...document.querySelectorAll(sel)].map(sigOf);
            }, [SELECTOR, SIG_SRC]);
            for (const sig of sigs) if (!found.has(sig)) found.set(sig, { scenario: name });
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
