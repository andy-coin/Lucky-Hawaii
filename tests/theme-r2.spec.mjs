// R2 主題：五個主題循環、舊晝夜偏好遷移、每個主題的文字對比、背景飄字開關
import { test, expect } from '@playwright/test';
import { bootPage } from './helpers.mjs';

const ORDER = ['plain', 'moon', 'city', 'midnight', 'custom'];
const NAMES = { plain: 'Plain', moon: 'Moon', city: 'City', midnight: 'Midnight', custom: 'Custom' };
const DARK = { plain: 'dark', moon: 'light', city: 'dark', midnight: 'dark', custom: 'light' };

const rgb = v => {
    v = v.trim();
    if (/^#[0-9a-f]{3}$/i.test(v)) v = '#' + [...v.slice(1)].map(c => c + c).join('');
    let m = v.match(/^#([0-9a-f]{6})$/i);
    if (m) return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
    m = v.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
    if (m) return [+m[1], +m[2], +m[3]];
    throw new Error('看不懂的顏色：' + v);
};
const lum = c => { const f = x => { const s = x / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }; const [r, g, b] = c.map(f); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const state = page => page.evaluate(() => ({
    name: document.documentElement.dataset.lhTheme, mode: document.documentElement.dataset.theme,
    label: document.getElementById('themeToggle').textContent.trim(), stored: localStorage.getItem('hoyun_theme_mode'),
}));

test('主題：按鈕依序循環五個主題、顯示名字、記住選擇', async ({ browser }) => {
    const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: { hoyun_theme_mode: 'plain' } });
    let s = await state(page);
    expect(s).toMatchObject({ name: 'plain', mode: 'dark', label: 'Plain' });
    for (let i = 1; i <= ORDER.length; i++) {
        await page.click('#themeToggle');
        const want = ORDER[i % ORDER.length];
        s = await state(page);
        expect(s, `第 ${i} 下`).toEqual({ name: want, mode: DARK[want], label: NAMES[want], stored: want });
        await expect(page.locator('#themeToggle')).toHaveAttribute('aria-label', new RegExp(NAMES[want]));
    }
    await page.reload();
    await page.evaluate(() => window.__hoyunReady);
    expect((await state(page)).name, '重新整理後還是同一個').toBe('plain');
    expect(errors).toEqual([]);
    await context.close();
});

test('主題：舊的晝夜偏好與新使用者的預設', async ({ browser }) => {
    const cases = [
        [{}, 'light', 'moon'], [{}, 'dark', 'plain'],
        [{ hoyun_theme_mode: 'light' }, 'dark', 'moon'], [{ hoyun_theme_mode: 'dark' }, 'light', 'plain'],
        [{ hoyun_theme_mode: 'light', containerBg: '#fff7e6' }, 'light', 'custom'],
        [{ hoyun_theme_mode: 'dark', textColor: '#123456' }, 'light', 'custom'],
        [{ containerBg: '#eee3ce' }, 'light', 'moon'],   // 舊版預設色不算自訂
        [{ hoyun_theme_mode: 'city' }, 'light', 'city'],
        [{ hoyun_theme_mode: 'bogus' }, 'dark', 'plain'],
    ];
    for (const [storage, scheme, want] of cases) {
        const { context, page } = await bootPage(browser, { wordlist: 'stub', colorScheme: scheme, storage });
        const s = await state(page);
        expect(s.name, `${JSON.stringify(storage)} 系統=${scheme}`).toBe(want);
        expect(s.stored, '開機時不改寫舊值').toBe(storage.hoyun_theme_mode ?? null);
        await context.close();
    }
});

test('主題：每個主題的文字與重點色對比 ≥ 4.5（WCAG AA）', async ({ browser }) => {
    const report = [];
    for (const name of ORDER) {
        const { context, page } = await bootPage(browser, { wordlist: 'stub', storage: { hoyun_theme_mode: name } });
        const v = await page.evaluate(() => {
            const cs = getComputedStyle(document.documentElement);
            const g = n => cs.getPropertyValue(n).trim();
            return Object.fromEntries(['--container-bg', '--card-bg', '--text-primary', '--text-secondary', '--highlight-border', '--accent-2', '--accent-3', '--accent-4', '--action-bg', '--action-text'].map(n => [n, g(n)]));
        });
        for (const fg of ['--text-primary', '--text-secondary', '--highlight-border', '--accent-2', '--accent-3', '--accent-4']) {
            for (const bg of ['--container-bg', '--card-bg']) {
                const r = contrast(v[fg], v[bg]);
                report.push(`${name} ${fg} / ${bg} = ${r.toFixed(2)}`);
                expect(r, `${name} ${fg}(${v[fg]}) 對 ${bg}(${v[bg]})`).toBeGreaterThanOrEqual(4.5);
            }
        }
        const r = contrast(v['--action-text'], v['--action-bg']);
        expect(r, `${name} 主要行動鈕`).toBeGreaterThanOrEqual(4.5);
        await context.close();
    }
    console.log('主題對比\n' + report.join('\n'));
});

test('主題：切主題後韻腳地圖依底色換色組、注音標記跟著主題色', async ({ browser }) => {
    const { context, page } = await bootPage(browser, { wordlist: 'stub', storage: { hoyun_theme_mode: 'midnight' } });
    const pal = await page.evaluate(() => JSON.parse(JSON.stringify(LH_RHYME_COLORS)));
    const c0 = () => page.evaluate(() => document.documentElement.style.getPropertyValue('--rm-c0'));
    expect(await c0()).toBe(pal.dark[0]);
    await page.click('#themeToggle');   // midnight → custom（亮）
    expect(await c0()).toBe(pal.light[0]);
    await page.evaluate(() => applyTheme('city', false));   // 暗→暗：data-theme 沒變也要對
    expect(await c0()).toBe(pal.dark[0]);
    await page.evaluate(() => applyTheme('moon', false));
    expect(await c0()).toBe(pal.light[0]);
    await context.close();
});

test('主題：在命名主題裡改顏色會切到自訂並套用', async ({ browser }) => {
    const { context, page } = await bootPage(browser, { wordlist: 'stub', storage: { hoyun_theme_mode: 'city' } });
    await page.evaluate(() => { const el = document.getElementById('containerBg'); el.value = '#ffeedd'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    const s = await page.evaluate(() => ({ name: document.documentElement.dataset.lhTheme, stored: localStorage.getItem('hoyun_theme_mode'), bg: getComputedStyle(document.documentElement).getPropertyValue('--container-bg').trim(), saved: localStorage.getItem('containerBg') }));
    expect(s).toEqual({ name: 'custom', stored: 'custom', bg: '#ffeedd', saved: '#ffeedd' });
    // 回到命名主題，自訂色不會蓋上去
    await page.evaluate(() => applyTheme('plain', false));
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--container-bg').trim())).toBe('#1f1f1f');
    await context.close();
});

test('背景飄字：自動化測試下不畫、開關記住、減少動態時不跑動畫', async ({ browser }) => {
    const plain = await bootPage(browser, { wordlist: 'stub' });
    expect(await plain.page.evaluate(() => !!document.getElementById('lhBgFx')), 'webdriver 下沒有畫布').toBe(false);
    await plain.page.evaluate(() => lhBgFxSet(false));
    expect(await plain.page.evaluate(() => [localStorage.getItem('lh:bgFx'), lhBgFxIsOn()])).toEqual(['off', false]);
    await plain.context.close();

    const on = await bootPage(browser, { wordlist: 'stub', init: () => { window.__lhBgFxTest = true; } });
    const r = await on.page.evaluate(() => { const c = document.getElementById('lhBgFx'); const cs = getComputedStyle(c); return { z: cs.zIndex, pe: cs.pointerEvents, pos: cs.position, running: !!_lhBgRaf }; });
    expect(r).toEqual({ z: '-1', pe: 'none', pos: 'fixed', running: true });
    await on.page.evaluate(() => lhBgFxSet(false));
    expect(await on.page.evaluate(() => [!!document.getElementById('lhBgFx'), !!_lhBgRaf])).toEqual([false, false]);
    await on.context.close();

    const still = await bootPage(browser, { wordlist: 'stub', device: { reducedMotion: 'reduce' }, init: () => { window.__lhBgFxTest = true; } });
    expect(await still.page.evaluate(() => [!!document.getElementById('lhBgFx'), !!_lhBgRaf]), '減少動態：靜態一張、不跑').toEqual([true, false]);
    await still.context.close();
});

test('主題：韻腳上色在每個主題、標準濃淡下字都讀得清楚（偏好設定的對比提醒不出現）', async ({ browser }) => {
    for (const name of ORDER) {
        const { context, page } = await bootPage(browser, { wordlist: 'stub', storage: { hoyun_theme_mode: name } });
        await page.evaluate(() => lhMapOpenPrefs());
        await expect(page.locator('#mapSettingsSection .rm-color-advice'), name).toBeHidden();
        await context.close();
    }
});
