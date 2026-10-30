import { expect } from '@playwright/test';

export const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
  { name: 'narrow', width: 360, height: 800 }
];

export function observePageFailures(page) {
  const failures = [];
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(`console.error: ${message.text()}`);
  });
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) => failures.push(`requestfailed: ${request.url()} ${request.failure()?.errorText ?? ''}`));
  return failures;
}

export async function resetApplication(page) {
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => Boolean(window.__YIJING_TEST__))).toBe(true);
  await page.evaluate(() => window.__YIJING_TEST__.reset());
  await page.reload();
}

export async function executeAction(page, action) {
  if (action.type === 'flip') {
    await page.locator(`[data-line-index="${action.line}"]`).click();
  } else {
    await page.locator(`[data-action="${action.type}"]`).click();
  }
}

export async function assertNoHorizontalOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
}

export async function assertInteractiveTargets(page) {
  const undersized = await page.locator('button, a, input, select, [role="button"]').evaluateAll((elements) => elements
    .filter((element) => {
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44);
    })
    .map((element) => ({
      label: element.getAttribute('aria-label') || element.textContent?.trim() || element.tagName,
      width: element.getBoundingClientRect().width,
      height: element.getBoundingClientRect().height
    })));
  expect(undersized, JSON.stringify(undersized)).toEqual([]);
}

export async function assertVisualRegionNonBlank(page, locator) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box?.width).toBeGreaterThan(80);
  expect(box?.height).toBeGreaterThan(80);
  const png = await locator.screenshot();
  expect(png.byteLength).toBeGreaterThan(1000);
  const sample = await page.evaluate(async (base64) => {
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
    const stride = Math.max(1, Math.floor((canvas.width * canvas.height) / 10_000));
    for (let index = 0; index < pixels.length; index += 4 * stride) {
      if (pixels[index + 3] > 16) opaque++;
      colors.add(`${pixels[index] >> 4}:${pixels[index + 1] >> 4}:${pixels[index + 2] >> 4}:${pixels[index + 3] >> 4}`);
    }
    return { opaque, colors: colors.size };
  }, png.toString('base64'));
  expect(sample.opaque).toBeGreaterThan(100);
  expect(sample.colors).toBeGreaterThan(4);
}
