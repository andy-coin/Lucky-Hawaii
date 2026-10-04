// Pass A 閘門：改版前拍照存證，之後每個 commit 都要和「改版前」一模一樣（100% 畫面不變）
// 歷史說明：Pass A 在 05-02 已完成；05-03 之後的計畫是刻意改版面，所以 LH_PARITY=check 從 05-03 起預期會失敗，
// 這份檔案只留作紀錄與「重新拍改版前」的工具（改版前的圖在 baseline-before 資料夾，供 Andy 對照）。
// 現在守住新版長相的是 tests/visual.spec.mjs（npm run visual:update 更新）。
// 平常 npm test 會整份略過；要跑時：
//   LH_PARITY=capture npx playwright test tests/parity.spec.mjs   拍「改版前」（只在動 css/js 之前跑一次）
//   LH_PARITY=check   npx playwright test tests/parity.spec.mjs   和改版前比對
// 截圖基準只對這台 Mac 的 Chromium 有效（字型與抗鋸齒因平台而異，OD-8）
import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { bootPage, settle } from './helpers.mjs';
import { DEVICES, waitStill } from './layout-lib.mjs';

const MODE = process.env.LH_PARITY;   // 'capture' | 'check'
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DIR = path.join(ROOT, '.planning/phases/05-multi-device-layout/baseline-before');

const DEVICE_NAMES = ['phone', 'tablet', 'desktop'];
// json: 存計算樣式；shot: 存截圖
const STATES = [
    { name: 'idle', json: true, shot: false },
    { name: 'results', json: true, shot: true },
    { name: 'results-dark', json: false, shot: true, colorScheme: 'dark' },
    { name: 'lyrics', json: true, shot: true },
    { name: 'ai', json: true, shot: true },
    { name: 'settings', json: true, shot: false },
    // UI-SPEC §14.2 的客製顏色預設
    { name: 'custom', json: false, shot: true, storage: { containerBg: '#fff7e6', textColor: '#1a202c', highlightColor: '#2b6cb0' } },
];

// 在頁面內量：每個看得見的元素，key＝祖先路徑，value＝位置尺寸加一組計算樣式
function collectStyles() {
    const round = v => Math.round(v * 100) / 100;
    const pathMemo = new Map();
    const pathOf = el => {
        if (pathMemo.has(el)) return pathMemo.get(el);
        const parent = el.parentElement;
        const idx = parent ? Array.prototype.indexOf.call(parent.children, el) + 1 : 1;
        const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).join('.') : '';
        const seg = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + cls + ':nth-child(' + idx + ')';
        const p = (parent ? pathOf(parent) + ' > ' : '') + seg;
        pathMemo.set(el, p);
        return p;
    };
    const PROPS = ['fontSize', 'lineHeight', 'fontWeight',
        'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
        'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
        'rowGap', 'columnGap',
        'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius',
        'top', 'right', 'bottom', 'left', 'width', 'height', 'minHeight', 'maxWidth'];
    const out = {};
    for (const el of document.querySelectorAll('html, body, body *')) {
        if (el.getClientRects().length === 0) continue;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const v = { x: round(r.x), y: round(r.y), w: round(r.width), h: round(r.height) };
        for (const p of PROPS) v[p] = cs[p];
        out[pathOf(el)] = v;
    }
    return out;
}

// 打開側邊面板：900px 以下走分頁，其餘走兩側面板按鈕
async function openPanel(page, which) {
    await page.evaluate(w => {
        if (window.innerWidth <= 900) mobileTab(w);
        else if (w === 'lyrics') toggleLeftPanel();
        else toggleRightPanel();
    }, which);
}

async function drive(page, state) {
    if (state.name !== 'idle') {
        await page.fill('#searchInput', 'ㄢ');
        await settle(page);
    }
    if (state.name === 'lyrics') await openPanel(page, 'lyrics');
    if (state.name === 'ai') {
        await openPanel(page, 'ai');
        await page.evaluate(() => document.getElementById('generateBtn').click());
        await page.waitForSelector('.ai-word-card');
        await page.waitForFunction(() => !document.getElementById('generateBtn').disabled);
    }
    if (state.name === 'settings') await page.evaluate(() => toggleSettings());
    await waitStill(page);
}

for (const dev of DEVICE_NAMES) {
    for (const state of STATES) {
        test(`parity：${dev} ${state.name}`, async ({ browser }) => {
            test.skip(!MODE, 'Pass A 已在 05-02 完成，05-03 起版面刻意改過，check 預期會失敗；只在重新拍照存證時設 LH_PARITY=capture 才執行');
            const { context, page } = await bootPage(browser, {
                device: DEVICES[dev],
                colorScheme: state.colorScheme,
                storage: state.storage,
                init: () => { Math.random = () => 0; },   // candidates.js 會洗牌，固定住結果才可重現
            });
            try {
                await drive(page, state);
                if (state.json) {
                    const actual = await page.evaluate(collectStyles);
                    const file = path.join(DIR, `parity-${dev}-${state.name}.json`);
                    if (MODE === 'capture') {
                        mkdirSync(DIR, { recursive: true });
                        writeFileSync(file, JSON.stringify(actual));
                    } else {
                        expect(existsSync(file), `缺少改版前檔案 ${file}（先跑 capture）`).toBe(true);
                        expect(actual).toEqual(JSON.parse(readFileSync(file, 'utf8')));
                    }
                }
                if (state.shot) {
                    const name = `${dev}-${state.name}.png`;
                    const buf = await page.screenshot({ animations: 'disabled', caret: 'hide', scale: 'css' });
                    const file = path.join(DIR, name);
                    if (MODE === 'capture') {
                        mkdirSync(DIR, { recursive: true });
                        writeFileSync(file, buf);
                    } else {
                        expect(existsSync(file), `缺少改版前截圖 ${file}（先跑 capture）`).toBe(true);
                        // 把改版前的圖複製成 Playwright 的期望圖，沿用它的像素比對與差異報告
                        const expected = test.info().snapshotPath(name);
                        mkdirSync(path.dirname(expected), { recursive: true });
                        copyFileSync(file, expected);
                        expect(buf).toMatchSnapshot(name, { maxDiffPixelRatio: 0.001 });   // D-18：差異 ≤ 0.1%
                    }
                }
            } finally {
                await context.close();
            }
        });
    }
}
