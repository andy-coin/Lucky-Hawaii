import { defineConfig, devices } from '@playwright/test';

const PORT = process.env.LH_TEST_PORT || '4310';
const BASE = `http://127.0.0.1:${PORT}`;

export default defineConfig({
    testDir: 'tests',
    fullyParallel: true,
    retries: 0,                      // 不靠重跑掩蓋不穩定
    timeout: 60_000,
    reporter: 'list',
    use: {
        ...devices['Desktop Chrome'],
        baseURL: BASE,
        viewport: { width: 1280, height: 900 },   // 固定桌機版面（面板邏輯依賴視窗寬度）
        colorScheme: 'light',                      // applyTheme 會讀 prefers-color-scheme
        locale: 'zh-TW',
        serviceWorkers: 'block',
    },
    webServer: {
        command: 'node tests/serve.mjs',
        url: `${BASE}/index.html`,
        reuseExistingServer: false,
        env: { SITE_ROOT: process.cwd(), PORT },
    },
});
