import { expect, test } from '@playwright/test';
import { CLASSIC_CELLS } from '../../src/data/classics.js';
import { assertVisualRegionNonBlank, resetApplication } from './helpers.js';

test('图谱：七层计数、64 节点、8×8 矩阵、关系标记和像素非空', async ({ page }) => {
  await resetApplication(page);
  await page.locator('[data-view="atlas"]').click();
  const hasse = page.locator('[data-testid="hasse-graph"]');
  await expect(hasse).toHaveAttribute('data-layer-counts', '1,6,15,20,15,6,1');
  await expect(page.locator('[data-testid="hexagram-node"]')).toHaveCount(64);
  await assertVisualRegionNonBlank(page, hasse);

  await page.locator('[data-atlas-mode="matrix"]').click();
  const matrix = page.locator('[data-testid="trigram-matrix"]');
  await expect(matrix.locator('[data-matrix-cell]')).toHaveCount(64);
  await assertVisualRegionNonBlank(page, matrix);
  await matrix.locator('[data-matrix-cell="63"]').click();
  await expect(page.getByRole('dialog', { name: /乾|卦详情/ })).toContainText(/轨道|稳定子|来源/);
});

test('经传库：搜索、组合筛选、四层分栏、来源与校勘状态', async ({ page }) => {
  await resetApplication(page);
  await page.locator('[data-view="classics"]').click();
  await page.locator('[data-testid="classics-search"]').fill('乾');
  const results = page.locator('[data-testid="classic-result"]');
  await expect(results.first()).toContainText('乾');
  await page.locator('[data-testid="section-filter"]').selectOption('upper');
  await expect(results).not.toHaveCount(0);
  await results.first().click();
  for (const layer of ['classic', 'traditional', 'mathematical', 'modern']) {
    await expect(page.locator(`[data-content-layer="${layer}"]`)).toBeVisible();
  }
  await expect(page.locator('[data-testid="source-link"]').first()).toHaveAttribute('href', /^https:\/\//);
  await expect(page.locator('[data-testid="verification-status"]').first()).toContainText(/自动双本一致|异文双版本|单源待核/);
  await expect(page.locator('[data-testid="frequency-boundary"]')).toContainText(/词频不等于占断强度/);
});

test('经传库：第 49 卦异文并列展示双正文、双来源与版本', async ({ page }) => {
  const cell = CLASSIC_CELLS.find((item) => item.hexagramNumber === 49 && item.field === 'judgment');
  expect(cell.status).toBe('variant');
  expect(cell.variants).toHaveLength(2);

  await resetApplication(page);
  await page.locator('[data-view="classics"]').click();
  await page.locator('[data-testid="classics-search"]').fill('革');
  await page.locator('[data-testid="classic-result"][data-classic-number="49"]').click();

  const entry = page.locator('[data-classic-field="judgment"]');
  await expect(entry.locator('[data-testid="verification-status"]')).toHaveText('异文双版本');
  await expect(entry.locator('[data-testid="variant-version"]')).toHaveCount(2);
  await expect(entry.locator('[data-testid="variant-text"]').nth(0)).toHaveText(cell.variants[0].text);
  await expect(entry.locator('[data-testid="variant-text"]').nth(1)).toHaveText(cell.variants[1].text);

  const primary = entry.locator('[data-source-id="zqing-chen-wangbi"]');
  const wikisource = entry.locator('[data-source-id="wikisource-xiyi"]');
  await expect(primary.getByRole('link', { name: /原文来源/ })).toHaveAttribute('href', cell.sourceLinks[0]);
  await expect(primary).toContainText(/ZQing-Chen|王弼本/);
  await expect(wikisource.getByRole('link', { name: /原文来源/ })).toHaveAttribute('href', cell.sourceLinks[1]);
  await expect(wikisource).toContainText(`revision ${cell.variants[1].revision}`);
});

test('关系实验室：已知卦对的并交错综互、距离、偏序与路径模式', async ({ page }) => {
  await resetApplication(page);
  await page.locator('[data-view="lab"]').click();
  await page.locator('[data-testid="lab-primary-bits"]').fill('001100');
  await page.locator('[data-testid="lab-secondary-bits"]').fill('010101');
  await page.locator('[data-testid="lab-xor-mask"]').fill('000111');
  await expect(page.locator('[data-operation="join"]')).toHaveAttribute('data-state', '011101');
  await expect(page.locator('[data-operation="meet"]')).toHaveAttribute('data-state', '000100');
  await expect(page.locator('[data-operation="xor"]')).toHaveAttribute('data-state', '001011');
  await expect(page.locator('[data-testid="hamming-distance"]')).toHaveText('3');
  await expect(page.locator('[data-testid="rule-version"]')).toContainText('zhouyi-core-v1');
  await expect(page.locator('[data-testid="rule-boundary"]')).toContainText(/规则|流派|吉凶/);

  for (const mode of ['q6', 'hasse', 'king-wen']) {
    await page.locator(`[data-path-mode="${mode}"]`).click();
    await expect(page.locator('[data-testid="path-definition"]')).toBeVisible();
  }
});

test('损坏 localStorage 与旧版本数据经刷新后安全恢复', async ({ page }) => {
  await resetApplication(page);
  const keys = await page.evaluate(() => window.__YIJING_TEST__.storageKeys());
  await page.evaluate(({ progress }) => localStorage.setItem(progress, '{broken'), keys);
  await page.reload();
  await expect(page.locator('[data-level="1"]')).not.toBeDisabled();
  await page.evaluate(({ progress }) => localStorage.setItem(progress, JSON.stringify({ version: 0, unlocked: 3, best: { 1: 2 }, ratings: { 1: 3 } })), keys);
  await page.reload();
  await expect(page.locator('[data-level="3"]')).not.toBeDisabled();
});
