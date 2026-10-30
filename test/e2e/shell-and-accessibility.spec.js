import { expect, test } from '@playwright/test';
import {
  VIEWPORTS,
  assertInteractiveTargets,
  assertNoHorizontalOverflow,
  observePageFailures,
  resetApplication
} from './helpers.js';

test('四视图 DOM 契约、四层标签和非占卜边界', async ({ page }) => {
  const failures = observePageFailures(page);
  await resetApplication(page);

  await expect(page.locator('a[href="#main-content"]')).toHaveAccessibleName(/跳到主内容/);
  await expect(page.locator('main#main-content')).toBeVisible();
  for (const view of ['game', 'atlas', 'classics', 'lab']) {
    const navigation = page.locator(`[data-view="${view}"]`);
    await expect(navigation).toHaveAttribute('aria-label', /.+/);
    await navigation.click();
    await expect(page.locator(`[data-panel="${view}"]`)).toBeVisible();
    await expect(page).toHaveTitle(/周易|卦格/);
  }

  for (const layer of ['classic', 'traditional', 'mathematical', 'modern']) {
    await expect(page.locator(`[data-content-layer="${layer}"]`).first()).toBeVisible();
  }
  await expect(page.locator('[data-testid="formalization-boundary"]')).toContainText(/形式化|古典原义/);
  await expect(page.getByRole('button', { name: /占卜|预测|问事|现实建议/ })).toHaveCount(0);
  expect(failures).toEqual([]);
});

for (const viewport of VIEWPORTS) {
  test(`${viewport.name} ${viewport.width}×${viewport.height}：无溢出、目标至少 44px、键盘可达`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await resetApplication(page);
    await assertNoHorizontalOverflow(page);
    await assertInteractiveTargets(page);
    await page.keyboard.press('Tab');
    await expect(page.locator('a[href="#main-content"]')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('main#main-content')).toBeFocused();

    for (const view of ['atlas', 'classics', 'lab', 'game']) {
      await page.locator(`[data-view="${view}"]`).click();
      await assertNoHorizontalOverflow(page);
      await assertInteractiveTargets(page);
      await page.screenshot({ path: `test/screenshots/${viewport.name}-${view}.png`, fullPage: true });
    }
  });
}

test('设置对话框圈定焦点、Escape 关闭并恢复触发点', async ({ page }) => {
  await resetApplication(page);
  const trigger = page.locator('[data-action="open-settings"]');
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: /设置/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(':focus')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});
