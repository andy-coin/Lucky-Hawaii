// 拖曳測試的共用工具：滑鼠拖、真的觸控（CDP）、取元素中心
// 合成的 PointerEvent 不能 setPointerCapture（沒有 active pointer），所以觸控一定要走 CDP

// 元素的中心座標 [x, y]
export async function centerOf(locator) {
    const b = await locator.boundingBox();
    if (!b) throw new Error('centerOf：元素沒有版面框');
    return [b.x + b.width / 2, b.y + b.height / 2];
}

// 滑鼠：按下、分段移動、放開（steps 段，讓 pointermove 與 rAF 都有機會跑）
export async function mouseDrag(page, from, to, steps = 8) {
    await page.mouse.move(...from);
    await page.mouse.down();
    await page.mouse.move(...to, { steps });
    await page.mouse.up();
}

// 觸控：CDP 的觸控事件在 hasTouch 的 context 會產生真的 pointerType:'touch' 事件
export async function touchSession(page) {
    const cdp = await page.context().newCDPSession(page);
    const send = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    const lerp = (from, to, i, steps) => [from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps];
    return {
        down: (x, y) => send('touchStart', x, y),
        move: (x, y) => send('touchMove', x, y),
        up: () => send('touchEnd'),
        async drag(from, to, steps = 8) {   // 直接拖（把手：touch-action:none，不用長按）
            await this.down(...from);
            for (let i = 1; i <= steps; i++) await this.move(...lerp(from, to, i, steps));
            await this.up();
        },
        async longPressDrag(from, to, hold = 450, steps = 8) {   // 詞卡：長按不動再拖
            await this.down(...from);
            await page.waitForTimeout(hold);
            for (let i = 1; i <= steps; i++) await this.move(...lerp(from, to, i, steps));
            await this.up();
        },
    };
}
