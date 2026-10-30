import { expect, test } from '@playwright/test';
import { VIEWPORTS, assertNoHorizontalOverflow, assertVisualRegionNonBlank, resetApplication } from './helpers.js';

test('生成图通过 picture 的真实 srcset 延迟加载并保持纯装饰语义', async ({ page }) => {
  await resetApplication(page);
  await page.locator('[data-view="proof"]').click();
  const images = page.locator('img[data-generated-asset]');
  await expect(images).toHaveCount(2);
  for (let index = 0; index < 2; index++) {
    const image = images.nth(index);
    await expect(image).toHaveAttribute('alt', '');
    await expect(image).toHaveAttribute('loading', 'lazy');
    await expect(image).toHaveAttribute('decoding', 'async');
    const source = image.locator('xpath=parent::picture/source');
    await expect(source).toHaveAttribute('srcset', /-640\.webp 640w, .*\.webp 1280w/);
    await expect(source).toHaveAttribute('sizes', /vw|px/);
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate((node) => ({ complete: node.complete, width: node.naturalWidth, currentSrc: node.currentSrc }))).toMatchObject({ complete: true });
    const rendered = await image.evaluate((node) => ({ width: node.naturalWidth, currentSrc: node.currentSrc }));
    expect([640, 1280]).toContain(rendered.width);
    expect(rendered.currentSrc).toMatch(/\.webp$/);
  }
});

test('生成图 404 时证明、筛选和下载保持可用且装饰层无破图图标', async ({ page }) => {
  await page.route('**/assets/generated/*.webp', (route) => route.abort('failed'));
  await resetApplication(page);
  await page.locator('[data-view="proof"]').click();
  await expect(page.locator('[data-testid="proof-corpus-coverage"]')).toBeVisible();
  await page.locator('[data-testid="theorem-filter"]').selectOption('structure');
  await expect(page.locator('[data-testid="proof-theorem"]').first()).toBeVisible();
  await expect(page.getByRole('link', { name: /下载证明证书|proof certificate/i })).toBeVisible();
  await expect(page.locator('[data-generated-asset-fallback]')).toHaveCount(2);
  await expect(page.locator('img[data-generated-asset]:visible')).toHaveCount(0);
});

for (const viewport of VIEWPORTS) {
  test(`生成资产在 ${viewport.width}×${viewport.height} 非空且不遮挡证明内容`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await resetApplication(page);
    await page.locator('[data-view="proof"]').click();
    const visual = page.locator('[data-testid="proof-asset-region"]');
    await assertVisualRegionNonBlank(page, visual);
    await assertNoHorizontalOverflow(page);
    await page.locator('[data-testid="proof-corpus-coverage"]').scrollIntoViewIfNeeded();
    const contentOccluded = await page.evaluate(() => {
      const content = document.querySelector('[data-testid="proof-corpus-coverage"]');
      const box = content?.getBoundingClientRect();
      if (!content || !box) return true;
      const top = document.elementFromPoint(box.left + box.width / 2, Math.min(innerHeight - 1, box.top + Math.min(24, box.height / 2)));
      return top !== content && !content.contains(top);
    });
    expect(contentOccluded).toBe(false);
    await page.screenshot({ path: `test/screenshots/proof-assets-${viewport.name}.png`, fullPage: true });
  });
}
