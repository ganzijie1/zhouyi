import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const baseURL = process.env.YIJING_PREVIEW_URL ?? 'http://127.0.0.1:4174';
const screenshotDirectory = process.env.YIJING_SCREENSHOT_DIR;
if (!screenshotDirectory) throw new Error('必须设置 YIJING_SCREENSHOT_DIR');

const viewports = [
  { name: 'desktop', width: 1440, height: 900, hasTouch: false },
  { name: 'mobile', width: 390, height: 844, hasTouch: true },
  { name: 'narrow', width: 360, height: 800, hasTouch: true }
];

const browser = await chromium.launch();
const summary = [];
await mkdir(screenshotDirectory, { recursive: true });

async function waitForApp(page) {
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__YIJING_TEST__));
  await page.locator('[data-panel="game"]').waitFor();
}

async function reset(page) {
  await page.evaluate(() => window.__YIJING_TEST__.reset());
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-panel="game"]').waitFor();
}

async function assertNoOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth
  }));
  assert.ok(dimensions.document <= dimensions.viewport + 1, `横向溢出: ${JSON.stringify(dimensions)}`);

  const clipped = await page.locator('button, h1, h2, h3, label, .boundary-note, .live-message').evaluateAll((elements) => elements.flatMap((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    if (style.display === 'none' || style.visibility === 'hidden' || rect.width === 0 || rect.height === 0) return [];
    const horizontal = element.scrollWidth > element.clientWidth + 2 && !['auto', 'scroll'].includes(style.overflowX);
    const vertical = element.scrollHeight > element.clientHeight + 2 && !['auto', 'scroll'].includes(style.overflowY);
    return horizontal || vertical ? [{ text: element.textContent?.trim().slice(0, 80), horizontal, vertical, rect: { width: rect.width, height: rect.height } }] : [];
  }));
  assert.deepEqual(clipped, [], `文字或控件发生截断: ${JSON.stringify(clipped)}`);
}

async function assertNoKeyOverlap(page) {
  const overlaps = await page.evaluate(() => {
    const selectors = ['.nav-button', '[data-testid="current-hexagram"]', '.transition-core', '[data-testid="target-hexagram"]'];
    const elements = selectors.flatMap((selector) => [...document.querySelectorAll(selector)]).filter((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    });
    const failures = [];
    for (let left = 0; left < elements.length; left++) for (let right = left + 1; right < elements.length; right++) {
      if (elements[left].contains(elements[right]) || elements[right].contains(elements[left])) continue;
      const a = elements[left].getBoundingClientRect();
      const b = elements[right].getBoundingClientRect();
      const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (overlapX > 2 && overlapY > 2) failures.push([elements[left].className, elements[right].className, overlapX, overlapY]);
    }
    return failures;
  });
  assert.deepEqual(overlaps, [], `关键区域重叠: ${JSON.stringify(overlaps)}`);
}

async function visualStats(page, locator) {
  const png = await locator.screenshot();
  assert.ok(png.byteLength > 1000, '视觉区域截图过小');
  return page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set();
    let opaque = 0;
    const stride = Math.max(1, Math.floor((canvas.width * canvas.height) / 12000));
    for (let index = 0; index < pixels.length; index += stride * 4) {
      if (pixels[index + 3] > 16) opaque++;
      colors.add(`${pixels[index] >> 4}:${pixels[index + 1] >> 4}:${pixels[index + 2] >> 4}:${pixels[index + 3] >> 4}`);
    }
    return { opaque, colors: colors.size, width: canvas.width, height: canvas.height };
  }, png.toString('base64'));
}

async function assertStateChanged(page, action) {
  const current = page.locator('[data-testid="current-hexagram"]');
  const before = await current.getAttribute('data-state');
  await action();
  await current.waitFor();
  const after = await current.getAttribute('data-state');
  assert.notEqual(after, before, '输入没有改变当前卦');
}

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: viewport.hasTouch });
    const page = await context.newPage();
    const failures = [];
    page.on('console', (message) => { if (message.type() === 'error') failures.push(`console.error: ${message.text()}`); });
    page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
    page.on('requestfailed', (request) => failures.push(`requestfailed: ${request.url()} ${request.failure()?.errorText ?? ''}`));
    page.on('response', (response) => { if (response.status() >= 400) failures.push(`response ${response.status()}: ${response.url()}`); });

    await waitForApp(page);
    await reset(page);
    assert.ok((await page.locator('body').innerText()).trim().length > 100, '页面正文为空');
    assert.equal(await page.locator('canvas').count(), 0, '当前实现应由可审计 HTML/CSS 绘制，不应出现空 Canvas');
    await assertNoOverflow(page);
    await assertNoKeyOverlap(page);
    const boardPixels = await visualStats(page, page.locator('.board-band'));
    assert.ok(boardPixels.opaque > 100 && boardPixels.colors > 4, `棋盘像素不足: ${JSON.stringify(boardPixels)}`);

    await assertStateChanged(page, () => page.locator('[data-line-index="0"]').click());
    await reset(page);
    await assertStateChanged(page, () => page.keyboard.press('2'));
    if (viewport.hasTouch) {
      await reset(page);
      const box = await page.locator('[data-line-index="2"]').boundingBox();
      assert.ok(box, '触控爻线没有包围盒');
      await assertStateChanged(page, () => page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2));
    }

    await reset(page);
    const views = ['game', 'atlas', 'classics', 'lab'];
    for (const view of views) {
      if (view !== 'game') await page.locator(`[data-view="${view}"]`).click();
      await page.locator(`[data-panel="${view}"]`).waitFor();
      await assertNoOverflow(page);
      await page.screenshot({ path: join(screenshotDirectory, `${viewport.name}-${view}.png`), fullPage: true });
      if (view === 'atlas') {
        const hasse = await visualStats(page, page.locator('[data-testid="hasse-graph"]'));
        assert.ok(hasse.opaque > 100 && hasse.colors > 4, `Hasse 像素不足: ${JSON.stringify(hasse)}`);
        await page.locator('[data-atlas-mode="matrix"]').click();
        const matrix = await visualStats(page, page.locator('[data-testid="trigram-matrix"]'));
        assert.ok(matrix.opaque > 100 && matrix.colors > 4, `矩阵像素不足: ${JSON.stringify(matrix)}`);
      }
    }

    await page.locator('[data-view="game"]').click();
    await reset(page);
    const solution = await page.evaluate(() => window.__YIJING_TEST__.getLevelSolution(1));
    for (const action of solution) {
      if (action.type === 'flip') await page.locator(`[data-line-index="${action.line}"]`).click();
      else await page.locator(`[data-action="${action.type}"]`).click();
    }
    await page.getByRole('dialog', { name: /完成结算/ }).waitFor();
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('[data-panel="game"]').waitFor();
    assert.equal(await page.locator('[data-level="2"]').isDisabled(), false, '刷新后未恢复已解锁关卡');

    await page.locator('[data-action="open-settings"]').click();
    await page.locator('[data-setting="muted"]').check();
    await page.locator('[data-setting="reducedMotion"]').check();
    const keys = await page.evaluate(() => window.__YIJING_TEST__.storageKeys());
    const storedSettings = await page.evaluate(({ settings }) => JSON.parse(localStorage.getItem(settings)), keys);
    assert.deepEqual(storedSettings, { muted: true, reducedMotion: true });
    await page.keyboard.press('Escape');
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('[data-panel="game"]').waitFor();
    await page.locator('[data-action="open-settings"]').click();
    assert.equal(await page.locator('[data-setting="muted"]').isChecked(), true);
    assert.equal(await page.locator('[data-setting="reducedMotion"]').isChecked(), true);

    assert.deepEqual(failures, [], `浏览器错误: ${JSON.stringify(failures)}`);
    summary.push({ viewport: `${viewport.width}x${viewport.height}`, boardPixels, screenshots: 4, failures: 0 });
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify({ baseURL, screenshotDirectory, summary }, null, 2));
