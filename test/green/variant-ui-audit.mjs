import assert from 'node:assert/strict';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { CLASSIC_CELLS } from '../../src/data/classics.js';

const baseURL = process.env.YIJING_PREVIEW_URL ?? 'http://127.0.0.1:4174';
const screenshotDirectory = process.env.YIJING_SCREENSHOT_DIR;
assert.ok(screenshotDirectory);

const cell = CLASSIC_CELLS.find((item) => item.hexagramNumber === 49 && item.field === 'judgment');
assert.equal(cell.status, 'variant');
assert.equal(cell.variants.length, 2);
assert.equal(new Set(cell.variants.map((variant) => variant.text)).size, 2);
assert.equal(new Set(cell.variants.map((variant) => variant.sourceId)).size, 2);
assert.equal(new Set(cell.sourceLinks.slice(0, 2)).size, 2);

const browser = await chromium.launch();
try {
  const results = [];
  for (const viewport of [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 390, height: 844 }
  ]) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    await page.goto(baseURL, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean(window.__YIJING_TEST__));
    await page.locator('[data-view="classics"]').click();
    await page.locator('[data-panel="classics"]').waitFor();
    await page.locator('[data-testid="classics-search"]').fill('革');
    await page.locator('[data-testid="classic-result"][data-classic-number="49"]').click();
    await page.locator('.classic-detail h2').waitFor();

    const detailText = await page.locator('.classic-detail').innerText();
    const renderedVariants = cell.variants.filter((variant) => detailText.includes(variant.text));
    assert.equal(renderedVariants.length, 2, '异文正文未完整并列展示');
    const entry = page.locator('[data-classic-field="judgment"]');
    const versions = entry.locator('[data-testid="variant-version"]');
    const links = entry.locator('[data-testid="variant-source-link"]');
    assert.equal(await versions.count(), 2);
    assert.equal(await links.count(), 2);
    assert.deepEqual(await links.evaluateAll((items) => items.map((item) => item.href)), cell.sourceLinks.slice(0, 2));
    assert.ok((await versions.nth(1).innerText()).includes(`revision ${cell.variants[1].revision}`));

    const layout = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('[data-classic-field="judgment"] [data-testid="variant-version"]')];
      const rectangles = cards.map((card) => card.getBoundingClientRect());
      return {
        viewportWidth: document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
        clipped: cards.some((card) => card.scrollWidth > card.clientWidth + 2 || card.scrollHeight > card.clientHeight + 2),
        overlap: rectangles.length === 2 && Math.min(rectangles[0].right, rectangles[1].right) - Math.max(rectangles[0].left, rectangles[1].left) > 2 && Math.min(rectangles[0].bottom, rectangles[1].bottom) - Math.max(rectangles[0].top, rectangles[1].top) > 2
      };
    });
    assert.ok(layout.documentWidth <= layout.viewportWidth + 1, `页面水平溢出: ${JSON.stringify(layout)}`);
    assert.equal(layout.clipped, false, `异文卡片内容裁切: ${JSON.stringify(layout)}`);
    assert.equal(layout.overlap, false, `异文卡片重叠: ${JSON.stringify(layout)}`);

    const screenshot = join(screenshotDirectory, `${viewport.name}-classics-variant-49.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    results.push({ viewport: `${viewport.width}x${viewport.height}`, renderedVariantTexts: renderedVariants.length, renderedSourceLinks: 2, layout, screenshot });
    await page.close();
  }

  console.log(JSON.stringify({
    hexagramNumber: 49,
    field: 'judgment',
    status: cell.status,
    storedVariants: cell.variants.length,
    distinctTexts: 2,
    distinctSources: 2,
    results
  }, null, 2));
} finally {
  await browser.close();
}
