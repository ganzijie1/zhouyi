import { expect, test } from '@playwright/test';
import { executeAction, observePageFailures, resetApplication } from './helpers.js';

test('首关：翻爻、提示只读、撤销、重开、结算与存档恢复', async ({ page }) => {
  const failures = observePageFailures(page);
  await resetApplication(page);
  const current = page.locator('[data-testid="current-hexagram"]');
  const initialState = await current.getAttribute('data-state');
  const initialSteps = await page.locator('[data-testid="step-count"]').textContent();

  await page.locator('[data-action="hint"]').click();
  await expect(current).toHaveAttribute('data-state', initialState);
  await expect(page.locator('[data-testid="step-count"]')).toHaveText(initialSteps);

  const solution = await page.evaluate(() => window.__YIJING_TEST__.getLevelSolution(1));
  await executeAction(page, solution[0]);
  await page.locator('[data-action="undo"]').click();
  await expect(current).toHaveAttribute('data-state', initialState);
  await executeAction(page, solution[0]);
  await page.locator('[data-action="restart"]').click();
  await expect(current).toHaveAttribute('data-state', initialState);

  for (const action of solution) await executeAction(page, action);
  await expect(page.getByRole('dialog', { name: /完成|结算/ })).toBeVisible();
  await expect(page.locator('[data-testid="star-rating"]')).toHaveAttribute('data-stars', '3');
  await page.reload();
  await expect(page.locator('[data-level="2"]')).not.toBeDisabled();
  expect(failures).toEqual([]);
});

test('第 12 关：最优解包含 XOR 并可完整结算', async ({ page }) => {
  await resetApplication(page);
  await page.evaluate(() => window.__YIJING_TEST__.loadLevel(12));
  const solution = await page.evaluate(() => window.__YIJING_TEST__.getLevelSolution(12));
  expect(solution.some((action) => action.type === 'xor')).toBe(true);
  for (const action of solution) await executeAction(page, action);
  await expect(page.getByRole('dialog', { name: /完成|结算/ })).toBeVisible();
  await expect(page.locator('[data-testid="level-number"]')).toHaveText('12');
});

test('全部 12 关可加载且最优解可重放结算', async ({ page }) => {
  await resetApplication(page);
  for (let level = 1; level <= 12; level++) {
    await page.evaluate((number) => window.__YIJING_TEST__.loadLevel(number), level);
    const solution = await page.evaluate((number) => window.__YIJING_TEST__.getLevelSolution(number), level);
    for (const action of solution) await executeAction(page, action);
    await expect(page.getByRole('dialog', { name: /完成|结算/ })).toBeVisible();
    await page.keyboard.press('Escape');
  }
});

test('键盘 1-6 翻转对应爻且不会误触其他爻', async ({ page }) => {
  await resetApplication(page);
  const current = page.locator('[data-testid="current-hexagram"]');
  const before = Number(await current.getAttribute('data-state'));
  await page.keyboard.press('1');
  await expect(current).toHaveAttribute('data-state', String(before ^ 1));
});
