import { expect, test } from '@playwright/test';
import { resetApplication } from './helpers.js';

test('Hasse atlas contains exactly the 192 Boolean-lattice cover edges and relation markers', async ({ page }) => {
  await resetApplication(page);
  await page.locator('[data-view="atlas"]').click();
  await expect(page.locator('[data-testid="hexagram-node"]')).toHaveCount(64);
  await expect(page.locator('[data-hasse-edge]')).toHaveCount(192);
  const invalidEdges = await page.locator('[data-hasse-edge]').evaluateAll((edges) => edges.flatMap((edge) => {
    const from = Number(edge.dataset.from);
    const to = Number(edge.dataset.to);
    const changed = from ^ to;
    const oneBit = changed > 0 && (changed & (changed - 1)) === 0;
    const rank = (value) => value.toString(2).replaceAll('0', '').length;
    return oneBit && (from & to) === from && rank(to) === rank(from) + 1 ? [] : [{ from, to }];
  }));
  expect(invalidEdges).toEqual([]);
  await expect(page.locator('[data-state-node="0"]')).toHaveAttribute('data-relations', /current/);
  await expect(page.locator('[data-state-node="3"]')).toHaveAttribute('data-relations', /target/);

  await page.locator('[data-atlas-mode="matrix"]').click();
  await expect(page.locator('.matrix-axis.column')).toHaveCount(8);
  await expect(page.locator('.matrix-axis.row')).toHaveCount(8);
  await expect(page.locator('[data-matrix-cell]')).toHaveCount(64);
});

test('Qian and Kun extra fields are visible and explicitly single-source pending review', async ({ page }) => {
  await resetApplication(page);
  await page.locator('[data-view="classics"]').click();
  await expect(page.locator('[data-testid="classics-coverage-summary"]')).toContainText('全体 964 单元');
  await expect(page.locator('[data-testid="classics-coverage-summary"]')).toContainText(/99\.585%.*0\.415%.*100\.000%/);
  await page.locator('[data-testid="status-filter"]').selectOption('pending-review');
  await expect(page.locator('[data-testid="classic-result"]')).toHaveCount(2);
  await page.locator('[data-testid="classic-result"][data-classic-number="1"]').click();
  for (const field of ['qian-use-nine', 'qian-use-nine-image']) {
    const entry = page.locator(`[data-classic-field="${field}"]`);
    await expect(entry).toBeVisible();
    await expect(entry.locator('[data-testid="verification-status"]')).toHaveText('单源待核');
    await expect(entry.locator('[data-testid="source-link"]')).toHaveCount(1);
    await expect(entry).toContainText('单源待核');
  }
});

test('classic filters, traditional predicates, and text-derived tags are functional', async ({ page }) => {
  await resetApplication(page);
  await page.locator('[data-view="classics"]').click();
  await page.locator('[data-testid="upper-trigram-filter"]').selectOption({ label: '乾' });
  await page.locator('[data-testid="lower-trigram-filter"]').selectOption({ label: '乾' });
  await expect(page.locator('[data-testid="classic-result"]')).toHaveCount(1);
  await page.locator('[data-testid="classic-result"]').click();
  await expect(page.locator('[data-classic-layer="traditional"]')).toContainText(/爻位|应：|比\/承\/乘/);
  await expect(page.locator('[data-classic-layer="modern"]')).toContainText(/形式化主题标签|文本来源/);
  await page.locator('[data-action="clear-classic-filters"]').click();
  await expect(page.locator('[data-testid="classic-result"]')).toHaveCount(64);
});

test('lab preserves last valid model on invalid input and renders auditable relation paths', async ({ page }) => {
  await resetApplication(page);
  await page.locator('[data-view="lab"]').click();
  const join = page.locator('[data-operation="join"]');
  await expect(join).toHaveAttribute('data-state', '011101');
  await expect(page.locator('[data-testid="path-node"]')).toHaveCount(4);
  await page.locator('[data-testid="lab-primary-bits"]').fill('10101');
  await expect(page.locator('[data-testid="lab-input-error"]')).toContainText('结果保留上次合法值');
  await expect(join).toHaveAttribute('data-state', '011101');
  await expect(page.locator('.relation-facts')).toContainText(/得位|失位|相应|不应|比邻/);
  await expect(page.locator('[data-testid="klein-orbit"]')).toContainText('轨道');
  await expect(page.locator('[data-testid="klein-stabilizer"]')).toContainText('稳定子');

  await page.locator('[data-testid="lab-primary-bits"]').fill('001100');
  await page.locator('[data-testid="lab-secondary-bits"]').fill('011101');
  await page.locator('[data-path-mode="hasse"]').click();
  await expect(page.locator('[data-testid="path-definition"]')).toContainText('覆盖链');
  await expect(page.locator('[data-testid="path-node"]')).toHaveCount(3);
  await page.locator('[data-path-mode="king-wen"]').click();
  await expect(page.locator('[data-testid="path-definition"]')).toContainText(/文王序位置|不是位运算距离/);
  await expect(page.locator('[data-testid="path-node"]')).toHaveCount(2);
});

test('budget exhaustion fails the round while undo and restart recovery remain available', async ({ page }) => {
  await resetApplication(page);
  for (let step = 0; step < 4; step++) await page.locator('[data-line-index="2"]').click();
  const dialog = page.getByRole('dialog', { name: '推演失败' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('预算已耗尽');
  await dialog.getByRole('button', { name: '重开本关' }).click();
  await expect(page.locator('[data-testid="step-count"]')).toHaveText('0');

  await page.evaluate(() => window.__YIJING_TEST__.loadLevel(7));
  await expect(page.locator('[data-operand-action="join"]')).toContainText(/OR 000011/);
  await expect(page.locator('[data-action="join"]')).toContainText('000011');
});

test('sound setting controls real audio calls and progress clearing is confirmed', async ({ page }) => {
  await page.addInitScript(() => {
    window.__toneStarts = 0;
    class AudioMock {
      currentTime = 0;
      preload = '';
      volume = 1;
      load() {}
      play() { window.__toneStarts++; return Promise.resolve(); }
    }
    window.Audio = AudioMock;
  });
  await resetApplication(page);
  await page.locator('[data-line-index="0"]').click();
  await expect.poll(() => page.evaluate(() => window.__toneStarts)).toBe(1);
  await page.locator('[data-action="open-settings"]').click();
  await page.locator('[data-setting="muted"]').check();
  await page.getByRole('button', { name: '完成' }).click();
  await page.locator('[data-line-index="0"]').click();
  await expect.poll(() => page.evaluate(() => window.__toneStarts)).toBe(1);

  await page.locator('[data-action="open-settings"]').click();
  await page.locator('[data-action="clear-progress"]').click();
  const confirmation = page.getByRole('dialog', { name: '确认清除进度' });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: '确认清除' }).click();
  await expect(page.locator('[data-testid="level-number"]')).toHaveText('1');
  await expect(page.locator('[data-setting="muted"]')).toBeChecked();
});
