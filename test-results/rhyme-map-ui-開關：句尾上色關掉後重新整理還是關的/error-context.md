# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: rhyme-map-ui.spec.mjs >> 開關：句尾上色關掉後重新整理還是關的
- Location: tests/rhyme-map-ui.spec.mjs:450:1

# Error details

```
Error: 選單在按鈕下面

expect(received).toBeGreaterThanOrEqual(expected)

Expected: >= 359
Received:    299
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e2]:
    - generic [ref=e3]:
      - generic:
        - group "介面縮放" [ref=e4]:
          - button "縮小介面" [ref=e5] [cursor=pointer]: ➖
          - button "點一下恢復 100%" [ref=e6] [cursor=pointer]: 🔎 100%
          - button "放大介面" [ref=e7] [cursor=pointer]: ➕
        - button "☀️ 淺色模式" [ref=e9] [cursor=pointer]
      - heading "韻腳查詢器 📝" [level=1] [ref=e10]
      - paragraph [ref=e11]: 寫歌詞...不簡單...甘巴爹...早點睡...
      - generic [ref=e12]:
        - button "把所有歌曲與設定存成一個備份檔" [ref=e13] [cursor=pointer]: 💾 備份全部
        - button "從備份檔還原歌曲與設定" [ref=e14] [cursor=pointer]: 📂 匯入備份
    - generic [ref=e15]:
      - generic [ref=e16]:
        - generic [ref=e17]:
          - textbox "輸入注音/拼音/單字或詞彙，例如：ㄢ/an/安/安打" [ref=e18]
          - button "自動" [ref=e19] [cursor=pointer]
        - generic [ref=e20]: 💡 支援注音（ㄅㄆㄇ）或拼音（b p m），輸入單字或詞彙則反查所有符合同樣韻腳的字
      - generic [ref=e21]:
        - generic [ref=e22]:
          - button "常用字優先" [ref=e23] [cursor=pointer]
          - button "同聲韻並列" [ref=e24] [cursor=pointer]
          - button "同聲調並列" [ref=e25] [cursor=pointer]
        - generic [ref=e26]:
          - button "⭐ 常用" [ref=e27] [cursor=pointer]:
            - generic [ref=e28]: ⭐
            - generic [ref=e29]: 常用
          - button "📦 冷僻" [ref=e30] [cursor=pointer]:
            - generic [ref=e31]: 📦
            - generic [ref=e32]: 冷僻
          - button "↩ 取消" [ref=e33] [cursor=pointer]:
            - generic [ref=e34]: ↩
            - generic [ref=e35]: 取消
          - button "回報選取的字或詞" [disabled] [ref=e36] [cursor=pointer]:
            - generic [ref=e37]: 🚩
            - generic [ref=e38]: 回報
        - generic [ref=e39] [cursor=pointer]: ⚙️ 偏好設定
    - generic [ref=e41]:
      - generic [ref=e43]:
        - heading "開始搜尋" [level=3] [ref=e46]
        - paragraph [ref=e47]: 子.母音搜尋｜漢字反查｜AI建議｜雙押.多押 *代表任意聲韻｜歌詞、情境、標籤將作為AI參考依據
      - generic [ref=e50]: 按 Enter 切換類型；按 Shift+F10 開啟段落設定
    - generic [ref=e51]:
      - text: 創作者專屬工具 · 歡迎分享
      - generic [ref=e52] [cursor=pointer]: i
      - button "意見" [ref=e53] [cursor=pointer]
  - generic [ref=e54]:
    - generic [ref=e55] [cursor=pointer]: 歌詞
    - generic [ref=e56]:
      - generic [ref=e57]:
        - button "開關歌曲清單" [ref=e58] [cursor=pointer]: ☰ 歌曲
        - generic "測試歌" [ref=e59]
        - button "匯出這首歌" [ref=e60] [cursor=pointer]: ⬇ 匯出
        - button "在這首歌新增一個段落" [ref=e61] [cursor=pointer]: + 新增段落
      - generic [ref=e63]:
        - generic [ref=e64]:
          - generic [ref=e65] [cursor=pointer]:
            - generic [ref=e66]: 標籤 ＆ 情境
            - button "新增標籤" [ref=e67]: +
            - button "從歌詞自動生成情境與標籤" [ref=e68]: ↻
            - generic [aria-hidden] [ref=e69]: ▾
          - generic [ref=e70]:
            - generic [ref=e71]:
              - generic [ref=e72]: 新增標籤來引導 AI 建議
              - textbox "新增標籤，可用頓號、逗號或空白一次加多個" [ref=e74]:
                - /placeholder: 加標籤，按 Enter（可用、或空白一次加多個）
            - textbox "一兩句話寫下這首歌的情境、風格、主題…" [ref=e75]
        - generic [ref=e76]:
          - group "復原與重做" [ref=e77]:
            - button "復原上一步" [disabled] [ref=e78]: ↶
            - button "重做上一步" [disabled] [ref=e79]: ↷
          - button "韻腳地圖設定" [expanded] [active] [ref=e80] [cursor=pointer]: 韻腳 ▾
          - generic [ref=e81]: 共 25 字
        - generic [ref=e83]:
          - generic [ref=e84] [cursor=pointer]:
            - button "拖曳排序「Verse」，或按 Alt+上下鍵移動" [ref=e85]: ⋮⋮
            - generic [ref=e86]: ▾
            - button "Verse，段落類型，按一下切換" [ref=e87]: Verse
            - generic [ref=e88]: 25 字
          - generic [ref=e89]:
            - generic [aria-hidden]: 我望著遠方的光 獨自站在窗 走過熟悉的街道 終於我也回到
            - textbox "在這裡輸入或貼上歌詞…" [ref=e90]: 我望著遠方的光 獨自站在窗 走過熟悉的街道 終於我也回到
          - separator "調整「Verse」高度（雙擊回到自動高度）" [ref=e91]
  - generic [ref=e92]:
    - generic [ref=e93] [cursor=pointer]: AI建議
    - generic [ref=e94]:
      - generic [ref=e95]:
        - generic [ref=e96]: ✨ AI 建議
        - combobox "選擇 AI 模型（自動＝由伺服器挑選並自動換手）" [ref=e97] [cursor=pointer]:
          - option "自動（推薦）" [selected]
          - option "Gemini 3.5 Flash-Lite"
          - option "GPT-OSS 120B"
      - group "AI 會參考的內容" [ref=e98]:
        - generic [ref=e99]: AI 會參考
        - button "歌詞 4 行" [ref=e100] [cursor=pointer]
      - generic [ref=e101]:
        - generic [ref=e102]: 請先搜尋一個字或是詞確認韻腳
        - generic [ref=e103]:
          - button "押母音" [ref=e104] [cursor=pointer]
          - button "押子音" [ref=e105] [cursor=pointer]
        - button "✨提供詞語建議" [ref=e106] [cursor=pointer]
      - generic [ref=e107]:
        - generic [ref=e108] [cursor=pointer]:
          - text: 📌 保留
          - generic [ref=e109]: "2"
          - generic [ref=e110]: ▾
        - generic [ref=e112]:
          - generic [ref=e113] [cursor=pointer]:
            - text: 微光
            - generic [ref=e114]: ×
          - generic [ref=e115] [cursor=pointer]:
            - text: 天亮
            - generic [ref=e116]: ×
  - dialog "韻腳地圖設定" [ref=e117]:
    - generic [ref=e118]: 韻腳地圖
    - generic [ref=e119]:
      - generic [ref=e120]: 顯示
      - switch "句尾上色 開" [checked] [ref=e121] [cursor=pointer]:
        - generic [ref=e122]: 句尾上色
        - generic [ref=e123]: 開
      - switch "段落結構字母 關" [ref=e124] [cursor=pointer]:
        - generic [ref=e125]: 段落結構字母
        - generic [ref=e126]: 關
      - generic [ref=e127]: 在每個段落標題列顯示 AABB 這類字母
      - switch "句中押韻 關" [ref=e128] [cursor=pointer]:
        - generic [ref=e129]: 句中押韻
        - generic [ref=e130]: 關
      - generic [ref=e131]: 句子裡面跟句尾押同韻的字，加底線（每行最多 3 個）
      - switch "逐行標記 關" [ref=e132] [cursor=pointer]:
        - generic [ref=e133]: 逐行標記
        - generic [ref=e134]: 關
      - generic [ref=e135]: 每行旁邊顯示字數與斷句；細項在「更多設定」
    - generic [ref=e136]:
      - generic [ref=e137]: 判定
      - radiogroup "押韻判定" [ref=e138]:
        - radio "寬韻" [checked] [ref=e139] [cursor=pointer]
        - radio "嚴格" [ref=e140] [cursor=pointer]
      - generic [ref=e141]: 寬韻：同一個韻族都算押韻（例：ㄤ、ㄧㄤ、ㄨㄤ）
      - switch "忽略句尾語助詞 開" [checked] [ref=e142] [cursor=pointer]:
        - generic [ref=e143]: 忽略句尾語助詞
        - generic [ref=e144]: 開
      - generic [ref=e145]: 略過：啊、呀、哪、呢、喔、哦、噢、吧、啦、嘛、耶、欸、囉、唷、了、的、嗎
    - generic [ref=e146]:
      - generic [ref=e147]: 色票對照
      - button "色票對照 ▾" [ref=e148] [cursor=pointer]
    - button "更多設定…" [ref=e149] [cursor=pointer]
    - button "關閉韻腳設定" [ref=e150] [cursor=pointer]
```

# Test source

```ts
  367 |         await context.close();
  368 |     }
  369 |     await browser.close();
  370 | });
  371 | 
  372 | test('鏡像對齊：英文長串、拉高度、縮放、收合展開之後', async ({ browser }) => {
  373 |     const text = 'a'.repeat(60) + '愛\n我望著遠方的光\n獨自站在窗\n走過熟悉的街道\n終於我也回到\n' + 'b'.repeat(30) + '想你想到心慌';
  374 |     const { context, page, errors } = await bootPage(browser, {
  375 |         device: DEVICES.desktop, wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', text), typed('sb', 'chorus', '你好嗎')])]),
  376 |     });
  377 |     const check = async tag => { await waitStill(page); await frames(page); await expectBoxesEqual(page, tag); await expectBandsAligned(page, tag); };
  378 |     await check('一開始');
  379 |     const rz = await page.locator('.section-resize').first().boundingBox();
  380 |     const [bx, by] = [rz.x + rz.width / 2, rz.y + rz.height / 2];
  381 |     await page.mouse.move(bx, by); await page.mouse.down(); await page.mouse.move(bx, by + 60, { steps: 6 }); await page.mouse.up();
  382 |     await check('拉高 60px 之後');
  383 |     await setScale(page, 150);
  384 |     await check('縮放 150% 之後');
  385 |     await page.locator('.lyrics-section').first().locator('.section-chevron').click();
  386 |     await expect(page.locator('.lyrics-section').first()).toHaveClass(/\bcollapsed\b/);
  387 |     await waitStill(page);
  388 |     await page.locator('.lyrics-section').first().locator('.section-chevron').click();
  389 |     await expect(page.locator('.lyrics-section').first()).not.toHaveClass(/\bcollapsed\b/);
  390 |     await check('收合再展開之後');
  391 |     expect(errors).toEqual([]);
  392 |     await context.close();
  393 | });
  394 | 
  395 | // ===== 第 10-03 計畫：主題、客製顏色、字典載不到 =====
  396 | test('對比：日夜主題切換不必重新整理', async ({ browser }) => {
  397 |     const { context, page, errors } = await bootPage(browser, {
  398 |         wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', F_AABB)])]),
  399 |     });
  400 |     const read = () => page.evaluate(() => {
  401 |         const hl = document.querySelector('.rm-hl');
  402 |         return { v: document.documentElement.style.getPropertyValue('--rm-c0'), bg: getComputedStyle(hl).backgroundColor, theme: document.documentElement.dataset.theme };
  403 |     });
  404 |     const pal = await page.evaluate(() => JSON.parse(JSON.stringify(LH_RHYME_COLORS)));
  405 |     const light = await read();
  406 |     expect(light).toMatchObject({ v: pal.light[0], theme: 'light' });
  407 |     await page.evaluate(() => { window.__mark = 1; applyTheme(true, false); });
  408 |     await expect.poll(async () => (await read()).v).toBe(pal.dark[0]);
  409 |     const dark = await read();
  410 |     expect(dark.theme).toBe('dark');
  411 |     expect(dark.bg, '色塊的底色跟著變').not.toBe(light.bg);
  412 |     expect(await page.evaluate(() => window.__mark), '沒有重新載入').toBe(1);
  413 |     await page.evaluate(() => applyTheme(false, false));
  414 |     await expect.poll(async () => (await read()).v).toBe(pal.light[0]);
  415 |     expect(errors).toEqual([]);
  416 |     await context.close();
  417 | });
  418 | 
  419 | test('上色：客製顏色也有色塊', async ({ browser }) => {
  420 |     const { context, page, errors } = await bootPage(browser, {
  421 |         wordlist: 'stub',
  422 |         storage: v2Storage([song([typed('sa', 'verse', F_AABB)])], { ...OPEN_PANELS, containerBg: '#fff7e6', textColor: '#1a202c', highlightColor: '#2b6cb0' }),
  423 |     });
  424 |     expect((await bands(page)).length).toBe(4);
  425 |     const bgs = await page.locator('.rhyme-mirror .rm-hl').evaluateAll(els => els.map(e => getComputedStyle(e).backgroundColor));
  426 |     for (const bg of bgs) expect(bg, '客製配色下色塊底色不是透明').not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  427 |     expect(errors).toEqual([]);
  428 |     await context.close();
  429 | });
  430 | 
  431 | test('上色：字典載不到時不上色也不報錯', async ({ browser }) => {
  432 |     const { context, page, errors } = await bootPage(browser, {
  433 |         wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', F_AABB)])]),
  434 |         beforeGoto: ({ context: c }) => c.route(/\/data\/rhyme-dict\.js(\?.*)?$/, route => route.fulfill({ status: 404, body: 'nope' })),
  435 |     });
  436 |     await caretToEnd(page);
  437 |     await page.keyboard.type('\n再打一行');
  438 |     await page.waitForTimeout(500);
  439 |     expect(await page.locator('.rhyme-mirror .rm-hl').count(), '沒有字典：不上色').toBe(0);
  440 |     expect(await page.locator('.rhyme-mirror, .lyrics-section').evaluateAll(els => els.filter(e => e.classList.contains('rm-on')).length)).toBe(0);
  441 |     const mine = errors.filter(e => /rhyme-core\.js|rhyme-map\.js/.test(String(e)));
  442 |     expect(mine, '兩支新檔不報錯').toEqual([]);
  443 |     await context.close();
  444 | });
  445 | 
  446 | // ===== 第 10-04 計畫：「韻腳 ▾」選單與設定 =====
  447 | const lsGetMap = page => page.evaluate(() => localStorage.getItem('lh:map'));
  448 | const sw = (page, name) => page.locator('#rhymeMenu .rm-switch', { hasText: name });
  449 | 
  450 | test('開關：句尾上色關掉後重新整理還是關的', async ({ browser }) => {
  451 |     const storage = v2Storage([song([typed('sa', 'verse', F_AABB)])]);
  452 |     const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage });
  453 |     const btn = page.locator('#rhymeMenuBtn');
  454 |     await expect(btn).toHaveText('韻腳 ▾');
  455 |     await expect(btn).toHaveAttribute('aria-label', '韻腳地圖設定');
  456 |     await expect(btn).toHaveAttribute('aria-haspopup', 'dialog');
  457 |     await expect(btn).toHaveAttribute('aria-expanded', 'false');
  458 |     // 按鈕在 ↶ ↷ 和「共 N 字」之間
  459 |     expect(await page.evaluate(() => [...document.querySelector('.lyrics-tools').children].map(n => n.id || n.className))).toEqual(['undo-group', 'rhymeMenuBtn', 'songTotal']);
  460 |     await btn.click();
  461 |     const menu = page.locator('#rhymeMenu');
  462 |     await expect(menu).toBeVisible();
  463 |     await expect(menu).toHaveAttribute('role', 'dialog');
  464 |     await expect(menu).toHaveAttribute('aria-label', '韻腳地圖設定');
  465 |     await expect(btn).toHaveAttribute('aria-expanded', 'true');
  466 |     const [br, mr] = await Promise.all([btn.boundingBox(), menu.boundingBox()]);
> 467 |     expect(mr.y, '選單在按鈕下面').toBeGreaterThanOrEqual(br.y + br.height);
      |                             ^ Error: 選單在按鈕下面
  468 |     expect(Math.abs(mr.x - br.x), '左緣對齊按鈕').toBeLessThan(40);
  469 |     const s = sw(page, '句尾上色');
  470 |     await expect(s).toHaveAttribute('role', 'switch');
  471 |     await expect(s).toHaveAttribute('aria-checked', 'true');
  472 |     await expect(s).toHaveText(/開$/);
  473 |     expect((await bands(page)).length).toBe(4);
  474 |     await s.click();
  475 |     await expect(s).toHaveAttribute('aria-checked', 'false');
  476 |     await expect(s).toHaveText(/關$/);
  477 |     await expect(menu, '切換後選單還開著').toBeVisible();
  478 |     await expect(page.locator('.rm-hl')).toHaveCount(0);
  479 |     expect(JSON.parse(await lsGetMap(page))).toEqual({ end: false, letters: false, inner: false, strict: false, skipParticles: true });
  480 |     // 重新整理：設定留著，色塊不回來
  481 |     await page.reload();
  482 |     await page.evaluate(() => Promise.all([window.__hoyunReady, window.__hoyunWordlistReady, window.__hoyunSongsReady, window.__lhMapReady]));
  483 |     await expect(page.locator('.rm-hl')).toHaveCount(0);
  484 |     await page.locator('#rhymeMenuBtn').click();
  485 |     await expect(sw(page, '句尾上色')).toHaveAttribute('aria-checked', 'false');
  486 |     await expect(sw(page, '句尾上色')).toHaveText(/關$/);
  487 |     await sw(page, '句尾上色').click();
  488 |     await expect.poll(async () => (await bands(page)).length).toBe(4);
  489 |     expect(errors).toEqual([]);
  490 |     await context.close();
  491 | });
  492 | 
  493 | test('開關：預設只開句尾上色', async ({ browser }) => {
  494 |     const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', F_AABB)])]) });
  495 |     expect(await lsGetMap(page), '沒碰過就不寫').toBeNull();
  496 |     await page.locator('#rhymeMenuBtn').click();
  497 |     await expect(sw(page, '句尾上色')).toHaveText(/開$/);
  498 |     expect(await page.locator('#rhymeMenu .rm-switch').evaluateAll(els => els.filter(e => e.getAttribute('aria-checked') === 'true').map(e => e.dataset.k)), '預設開著的').toEqual(['end', 'skipParticles']);
  499 |     expect(await lsGetMap(page), '只是打開選單不寫').toBeNull();
  500 |     // 第 11 階段：預設沒有逐行標記，也沒有欄位
  501 |     await expect(sw(page, '逐行標記')).toHaveText(/關$/);
  502 |     await expect(page.locator('.lm-mk')).toHaveCount(0);
  503 |     expect(await page.evaluate(() => document.documentElement.getAttribute('data-lm'))).toBeNull();
  504 |     expect(errors).toEqual([]);
  505 |     await context.close();
  506 | });
  507 | 
  508 | const F_ABAB = '我望著遠方的光\n走過熟悉的街道\n你笑著說天亮\n不怕前方的路遙';
  509 | const radio = (page, name) => page.locator('#rhymeMenu [role=radio]', { hasText: name });
  510 | // 每個色塊／底線所在的行號（數鏡像層裡出現過幾個換行字元）
  511 | const lineOf = (page, sel) => page.locator('.rhyme-mirror').first().evaluate((m, q) => {
  512 |     const out = []; let line = 0;
  513 |     for (const n of m.childNodes) {
  514 |         if (n.nodeType === 3) line += (n.textContent.match(/\n/g) || []).length;
  515 |         else if (n.matches(q)) out.push([n.textContent, line]);
  516 |     }
  517 |     return out;
  518 | }, sel);
  519 | 
  520 | test('開關：嚴格與寬韻', async ({ browser }) => {
  521 |     const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', F_ABAB)])]) });
  522 |     const solo = () => page.locator('.rhyme-mirror .rm-hl.rm-solo').count();
  523 |     const fs = () => bands(page).then(b => b.map(x => x[1]));
  524 |     const wideF = await fs();
  525 |     expect(await solo(), '寬韻：光、亮同家族，道、遙同家族，沒有孤句').toBe(0);
  526 |     await page.locator('#rhymeMenuBtn').click();
  527 |     await expect(radio(page, '寬韻')).toHaveAttribute('aria-checked', 'true');
  528 |     await expect(radio(page, '嚴格')).toHaveAttribute('aria-checked', 'false');
  529 |     await expect(page.locator('#rhymeMenu [role=radiogroup]')).toHaveAttribute('aria-label', '押韻判定');
  530 |     const help = page.locator('#rhymeMenu .rm-mode-help');
  531 |     await expect(help).toHaveText('寬韻：同一個韻族都算押韻（例：ㄤ、ㄧㄤ、ㄨㄤ）');
  532 |     await radio(page, '嚴格').click();
  533 |     await expect(radio(page, '嚴格')).toHaveAttribute('aria-checked', 'true');
  534 |     await expect(radio(page, '寬韻')).toHaveAttribute('aria-checked', 'false');
  535 |     await expect(help).toHaveText('嚴格：韻母要完全一樣才算押韻（例：ㄤ 和 ㄧㄤ 不同）');
  536 |     await expect(page.locator('#rhymeMenu')).toBeVisible();
  537 |     await expect.poll(solo, '嚴格：光ㄨㄤ、亮ㄧㄤ各自不同，四句都是孤句').toBe(4);
  538 |     expect(await fs(), '顏色一律照家族，不因判定改變').toEqual(wideF);
  539 |     expect(JSON.parse(await lsGetMap(page)).strict).toBe(true);
  540 |     await page.reload();
  541 |     await page.evaluate(() => window.__lhMapReady);
  542 |     await expect.poll(solo).toBe(4);
  543 |     await page.locator('#rhymeMenuBtn').click();
  544 |     await expect(radio(page, '嚴格')).toHaveAttribute('aria-checked', 'true');
  545 |     // 方向鍵只移焦點，Enter 才選
  546 |     await radio(page, '嚴格').focus();
  547 |     await page.keyboard.press('ArrowLeft');
  548 |     await expect(radio(page, '寬韻')).toBeFocused();
  549 |     await expect(radio(page, '嚴格')).toHaveAttribute('aria-checked', 'true');
  550 |     await page.keyboard.press('Enter');
  551 |     await expect(radio(page, '寬韻')).toHaveAttribute('aria-checked', 'true');
  552 |     await expect.poll(solo).toBe(0);
  553 |     expect(errors).toEqual([]);
  554 |     await context.close();
  555 | });
  556 | 
  557 | test('開關：忽略句尾語助詞', async ({ browser }) => {
  558 |     const { context, page, errors } = await bootPage(browser, { wordlist: 'stub', storage: v2Storage([song([typed('sa', 'verse', '愛你到天亮啊')])]) });
  559 |     expect((await bands(page)).map(b => b[0])).toEqual(['亮']);
  560 |     await page.locator('#rhymeMenuBtn').click();
  561 |     const s = sw(page, '忽略句尾語助詞');
  562 |     await expect(s).toHaveText(/開$/);
  563 |     await expect(page.locator('#rhymeMenu')).toContainText('略過：啊、呀、哪、呢、喔、哦、噢、吧、啦、嘛、耶、欸、囉、唷、了、的、嗎');
  564 |     await s.click();
  565 |     await expect(s).toHaveText(/關$/);
  566 |     await expect.poll(async () => (await bands(page)).map(b => b[0])).toEqual(['啊']);
  567 |     expect(JSON.parse(await lsGetMap(page)).skipParticles).toBe(false);
```