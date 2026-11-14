// Phase 5 多裝置版面測試的共用工具
import { expect } from '@playwright/test';
import { settle } from './helpers.mjs';

// 三種主要裝置＋兩種橫放；傳給 bootPage({ device })
export const DEVICES = {
    phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
    tablet: { viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
    desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
    phoneLandscape: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
    tabletLandscape: { viewport: { width: 1180, height: 820 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
};

// settle 之後再等所有動畫（slideIn、fadeIn、面板位移）跑完，截圖與量尺寸才穩定
export async function waitStill(page) {
    await settle(page);
    await page.waitForFunction(() => document.getAnimations().every(a => a.playState !== 'running'));
}

// 用真的 ➕／➖ 按鈕點到指定百分比（CX-12：必須走真按鈕）；最多 25 下，到不了就丟錯
export async function setScale(page, pct) {
    const label = page.locator('#MzoomValue');
    for (let i = 0; i < 25; i++) {
        const cur = parseInt(await label.textContent(), 10);
        if (cur === pct) return;
        await page.locator(cur < pct ? '#MzoomIn' : '#MzoomOut').click();
    }
    throw new Error(`setScale：25 下內到不了 ${pct}%（目前 ${await label.textContent()}）`);
}

// click() 只要元素中心在畫面內就會成功，被裁掉的按鈕也點得到，所以另外量整個框要在視窗內
export async function expectFullyInViewport(page, locator, tol = 0.5) {
    const b = await locator.boundingBox();
    expect(b, '元素沒有版面框（被隱藏？）').not.toBeNull();
    const vp = page.viewportSize();
    expect(b.x, '左邊超出視窗').toBeGreaterThanOrEqual(-tol);
    expect(b.x + b.width, '右邊超出視窗').toBeLessThanOrEqual(vp.width + tol);
    expect(b.y, '上邊超出視窗').toBeGreaterThanOrEqual(-tol);
    expect(b.y + b.height, '下邊超出視窗').toBeLessThanOrEqual(vp.height + tol);
}

// 整頁有沒有被撐出捲動：回傳量到的四個數字，讓測試訊息看得到實際差多少
export function noPageScroll(page) {
    return page.evaluate(() => ({
        sh: document.documentElement.scrollHeight,
        ih: window.innerHeight,
        sw: document.documentElement.scrollWidth,
        iw: window.innerWidth,
    }));
}

// 兩個框是否重疊（超過 tol px 才算；剛好貼邊不算）。a、b 為 { x, y, width, height }
export function rectsOverlap(a, b, tol = 0.5) {
    return a.x < b.x + b.width - tol && b.x < a.x + a.width - tol
        && a.y < b.y + b.height - tol && b.y < a.y + a.height - tol;
}

// 在頁面內列出 rootSelector（可用逗號接多個區塊）底下所有看得見的可互動元素與它們的框
export function auditVisibleControls(page, rootSelector) {
    return page.evaluate(root => {
        const out = [];
        const seen = new Set();
        for (const area of document.querySelectorAll(root)) {
            for (const el of area.querySelectorAll('button, a, input, select, textarea, [onclick]')) {
                if (seen.has(el) || el.getClientRects().length === 0) continue;
                if (getComputedStyle(el).visibility === 'hidden') continue;
                const b = el.getBoundingClientRect();
                if (b.width === 0 || b.height === 0) continue;
                seen.add(el);
                const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).join('.') : '';
                out.push({ name: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + cls, x: b.x, y: b.y, width: b.width, height: b.height });
            }
        }
        return out;
    }, rootSelector);
}

// 真的點得到：捲進可視範圍後，整個框在視窗內，而且框中心最上面的就是它自己（或它的子元素），沒被別的東西蓋住。
// （click() 只管中心點在畫面內；被分頁列、遮罩或釘住的按鈕蓋住時，用 evaluate 點或強制點都看不出來）
export async function expectReallyClickable(page, locator, label = '') {
    await locator.scrollIntoViewIfNeeded();
    // 只露出一小截的元素（例如橫拿手機裡很矮的歌詞區）Playwright 會當成「已經看得到」不捲；
    // 像使用者一樣把它捲到捲動區正中間，才量得到中心有沒有被擋住
    await locator.evaluate(el => el.scrollIntoView({ block: 'center', inline: 'center' }));
    await expectFullyInViewport(page, locator);
    const hit = await locator.evaluate(el => {
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        const name = n => n ? n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (typeof n.className === 'string' && n.className.trim() ? '.' + n.className.trim().split(/\s+/).join('.') : '') : '（空）';
        return { ok: !!top && (top === el || el.contains(top)), top: name(top) };
    });
    expect(hit.ok, `${label} 中心被 ${hit.top} 蓋住`).toBe(true);
}

// 模擬虛擬鍵盤：Chromium 沒有真鍵盤，縮小視窗高度時 innerHeight 與 visualViewport.height 一起變矮，
// 寬度不變，剛好是 js/layout.js 判斷「鍵盤出現」的條件。回傳縮之前的視窗大小，給 restoreViewport 用。
export async function emulateKeyboard(page, px) {
    const before = page.viewportSize();
    await page.setViewportSize({ width: before.width, height: before.height - px });
    await twoFrames(page);
    return before;
}

// 把視窗還原成縮之前的大小（鍵盤收起）
export async function restoreViewport(page, size) {
    await page.setViewportSize(size);
    await twoFrames(page);
}

// 等兩個 requestAnimationFrame：visualViewport 事件 → rAF 節流的更新 → 套用，需要這麼久
async function twoFrames(page) {
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0)))));
}

// 鍵盤狀態一次讀出：class、三個變數的原始字串，以及視覺視窗的原始數字（不四捨五入）
export function readKeyboard(page) {
    return page.evaluate(() => {
        const root = document.documentElement;
        const vv = window.visualViewport;
        return {
            open: root.classList.contains('kb-open'),
            short: root.classList.contains('kb-short'),
            appH: root.style.getPropertyValue('--app-h'),
            vvTop: root.style.getPropertyValue('--vv-top'),
            kbInset: root.style.getPropertyValue('--kb-inset'),
            vvHeight: vv.height,
            vvOffsetTop: vv.offsetTop,
            innerHeight: window.innerHeight,
        };
    });
}

// 框是否完整落在「可見範圍」（visualViewport 的上緣到下緣）內，容許 0.5px
export function insideVisible(box, kb, tol = 0.5) {
    return box.y >= kb.vvOffsetTop - tol && box.y + box.height <= kb.vvOffsetTop + kb.vvHeight + tol;
}

// ===== 輸入框字級下限（D-08）=====
// 比較器獨立匯出，邊界測試直接拿它驗 16 剛好過、15.99 不過
export function meetsInputFloor(px) { return px >= 16; }

// 掃整頁所有看得見的文字輸入控制項（input 排除勾選／色票／拉桿／檔案／按鈕類、textarea、select），
// 回傳 { bad: 字級不到下限的清單, seen: 掃到的所有控制項 }；量的是每個元素自己的計算字級（CSS px），跟 --ui-scale、裝置像素比都無關
// 歌詞框、鏡像層、情境框不受下限（跟著介面縮放；iOS 改用 viewport maximum-scale=1 擋自動放大），照樣記進 seen
export const FLOOR_EXEMPT = '.section-textarea, .rhyme-mirror, .context-textarea';
export function scanInputFonts(page) {
    // 比較器原始碼送進頁面執行，掃描與邊界測試用的是同一個函式
    return page.evaluate(([src, exempt]) => {
        const meets = new Function('return ' + src)();
        const skip = /^(checkbox|radio|color|range|file|button|submit|reset|image|hidden)$/i;
        const bad = [];
        const seen = [];
        for (const el of document.querySelectorAll('input, textarea, select')) {
            if (el.tagName === 'INPUT' && skip.test(el.type)) continue;
            // 看不見的不算：沒有版面框（display:none）、visibility 隱藏、整個透明（例如複製用的隱形 textarea）
            if (el.getClientRects().length === 0) continue;
            const cs = getComputedStyle(el);
            if (cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            const px = parseFloat(cs.fontSize);
            const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).join('.') : '';
            const name = `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls}`;
            seen.push(name);
            if (!meets(px) && !el.matches(exempt)) bad.push(`${name} ${px}px`);
        }
        return { bad, seen };
    }, [meetsInputFloor.toString(), FLOOR_EXEMPT]);
}

// ===== 觸控目標（05-08，D-07）=====
// 比較器獨立匯出，邊界測試直接驗：44 剛好過、43.4 不過（容許 0.5px 的小數誤差）
// 觸控最小尺寸依裝置：平板（觸控、寬 ≥ 768）32px，手機 36px（對應 css/base.css 的 --hit）
export const HIT_MIN = 36;
export const HIT_TABLET = 32;
export const hitMin = page => page.evaluate(([t, p]) => matchMedia('(pointer: coarse) and (min-width: 768px)').matches ? t : p, [HIT_TABLET, HIT_MIN]);
export function meetsHit(w, h, minW = 44, minH = 44) { return w >= minW - 0.5 && h >= minH - 0.5; }

// 每個畫面要檢查的控制項：button、a、select、input、有 onclick 的、字卡、分頁、同音字晶片，
// 加上動態產生的詞卡／保留詞／標籤／刪除鈕（它們不一定帶 onclick 屬性）
const TOUCH_SELECTOR = 'button, a, select, input, [onclick], .char-card, .mtab-btn, .poly-chip, .ai-word-card, .word-chip, .hashtag-chip, .section-remove, .chip-remove, .mark-badge, [role="separator"]:not(.word-ctx-divider)';

// 掃整頁所有「看得見、點得到」的控制項，量真正的點擊範圍：
//  - 範圍 = 元素自己的框 ＋ 往四個方向用 elementFromPoint 一格一格往外探到不再是它為止（::before／::after 擴大區也會被量到）
//  - 勾選框用外面的 label 當點擊範圍（點 label 就是點勾選框）
//  - 中心被別的東西蓋住的（遮罩下面、被收起面板）不算「看得見、點得到」，只記數量
//  - 例外：.mark-badge 只要 44 寬 × 32 高；關於對話框裡的行內文字連結不檢查（D-07、UI-SPEC §7）
// 回傳 { failures: [{ selector, w, h }], overlaps: [{ a, b, amount }], seen: [名稱], missing: [沒掃到的 mustSee], scanned, covered }
// 相鄰重疊：框 ＝ 實際點擊範圍；只比較同一捲動區／同一固定層、互相不包含、也不是 sticky、也不是「刻意疊在搜尋框裡的絕對定位按鈕」的兩個元素；amount = 重疊區較短的那一邊
export async function auditTouchTargets(page, { sample = 30, mustSee = [] } = {}) {
    const hit = await hitMin(page);
    return page.evaluate(({ sel, hit, sample, tol, meetsSrc, mustSee }) => {
        const meets = new Function('return ' + meetsSrc)();
        const nameOf = n => n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (typeof n.className === 'string' && n.className.trim() ? '.' + n.className.trim().split(/\s+/).join('.') : '');
        const owns = (el, top) => !!top && (top === el || el.contains(top) || (el.labels && [...el.labels].some(l => l === top || l.contains(top))));
        // 數量很多的同一種元素（字卡、徽章）等距抽樣，頭尾一定包含
        const groups = new Map();
        for (const el of document.querySelectorAll(sel)) {
            if (el.getClientRects().length === 0) continue;
            if (el.closest('[inert], [hidden]')) continue;
            const cs = getComputedStyle(el);
            if (cs.visibility === 'hidden' || Number(cs.opacity) === 0 || cs.pointerEvents === 'none') continue;
            if (el.tagName === 'INPUT' && /^(hidden|file)$/i.test(el.type)) continue;
            // 側邊收合分頁：Andy 2026-11-14 指定縮成原本 40% 寬、只放三角形（整條和面板一樣高），不套 44 寬的下限
            if (el.matches('.side-panel-tab, .results-side-tab, .pane-divider')) continue;   // 整條高的窄邊（Andy 指定寬度）
            const b = el.getBoundingClientRect();
            if (b.width === 0 || b.height === 0) continue;
            const key = el.tagName + '|' + el.className;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(el);
        }
        const els = [];
        for (const list of groups.values()) {
            if (list.length <= sample) { els.push(...list); continue; }
            for (let i = 0; i < sample; i++) els.push(list[Math.round(i * (list.length - 1) / (sample - 1))]);
        }
        const probe = (el, x, y) => owns(el, document.elementFromPoint(x, y));
        const groupOf = el => {
            for (let n = el.parentElement; n; n = n.parentElement) {
                const cs = getComputedStyle(n);
                if (cs.position === 'fixed' || /(auto|scroll)/.test(cs.overflowY)) return n;
            }
            return document.documentElement;
        };
        const items = [];
        const failures = [];
        const seen = [];
        const sizes = [];
        let covered = 0;
        for (const el of els) {
            el.scrollIntoView({ block: 'center', inline: 'center' });
            const r = el.getBoundingClientRect();
            const cx = Math.min(Math.max(r.left + r.width / 2, 0.5), innerWidth - 0.5);
            const cy = Math.min(Math.max(r.top + r.height / 2, 0.5), innerHeight - 0.5);
            if (!probe(el, cx, cy)) { covered++; continue; }
            // 探點取整數座標：Chromium 的 elementFromPoint 命中範圍是 (左-1, 右)、(上-1, 下)（左上多算 1px），
            // 所以左／上從 邊-1 往外、右／下從 邊 往外，一格一格數到不再是它為止，數出來剛好等於真正外擴的 px 數
            const ext = (dx, dy, x0, y0) => { let d = 0; while (d < 60 && probe(el, x0 + dx * d + (dx < 0 ? -1 : 0), y0 + dy * d + (dy < 0 ? -1 : 0))) d++; return d; };
            const e = { l: ext(-1, 0, r.left, cy), r: ext(1, 0, r.right, cy), t: ext(0, -1, cx, r.top), b: ext(0, 1, cx, r.bottom) };
            const w = r.width + e.l + e.r, h = r.height + e.t + e.b;
            const name = nameOf(el);
            seen.push(name);
            sizes.push({ name, w, h, e });
            const isBadge = el.classList.contains('mark-badge');
            const isAboutLink = el.tagName === 'A' && !!el.closest('.about-content');
            if (!isAboutLink && !(isBadge ? meets(w, h, 44, 32) : meets(w, h, hit, hit))) failures.push({ selector: name, w: Math.round(w * 10) / 10, h: Math.round(h * 10) / 10 });
            const g = groupOf(el);
            const sx = g === document.documentElement ? 0 : g.scrollLeft, sy = g === document.documentElement ? 0 : g.scrollTop;
            items.push({ el, name, g, sticky: getComputedStyle(el).position === 'sticky', abs: getComputedStyle(el).position === 'absolute', x0: r.left - e.l + sx, y0: r.top - e.t + sy, x1: r.right + e.r + sx, y1: r.bottom + e.b + sy });
        }
        const overlaps = [];
        for (let i = 0; i < items.length; i++) {
            for (let j = i + 1; j < items.length; j++) {
                const a = items[i], b = items[j];
                if (a.g !== b.g || a.sticky || b.sticky || a.el.contains(b.el) || b.el.contains(a.el)) continue;
                // 刻意疊在另一個控制項上的絕對定位按鈕（搜尋框右側的輸入模式鈕，搜尋框已留出 4rem 空位）不算相鄰重疊
                if ((a.abs && a.el.parentElement.contains(b.el)) || (b.abs && b.el.parentElement.contains(a.el))) continue;
                const ix = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), iy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
                if (ix > tol && iy > tol && Math.min(ix, iy) > 4) overlaps.push({ a: a.name, b: b.name, amount: Math.round(Math.min(ix, iy) * 10) / 10 });
            }
        }
        // 一定要掃到的控制項（CSS 選擇器）：沒有任何一個被量到就列入 missing，防止「掃了個寂寞」
        const missing = mustSee.filter(m => !items.some(it => it.el.matches(m)));
        return { failures, overlaps, seen, sizes, missing, scanned: items.length, covered };
    }, { sel: TOUCH_SELECTOR, hit, sample, tol: 0.5, meetsSrc: meetsHit.toString(), mustSee });
}
