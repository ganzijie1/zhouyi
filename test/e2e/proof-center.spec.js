import { expect, test } from '@playwright/test';
import { VIEWPORTS, assertInteractiveTargets, assertNoHorizontalOverflow, resetApplication } from './helpers.js';

test('证明中心是第五视图，hash 可分享且刷新后保持当前视图', async ({ page }) => {
  await resetApplication(page);
  await expect(page.locator('.main-nav [data-view]')).toHaveCount(5);
  await page.locator('[data-view="proof"]').click();
  await expect(page.locator('[data-panel="proof"]')).toBeVisible();
  await expect(page).toHaveURL(/#proof$/);
  await page.reload();
  await expect(page.locator('[data-panel="proof"]')).toBeVisible();
  await page.locator('[data-view="classics"]').click();
  await page.goBack();
  await expect(page.locator('[data-panel="proof"]')).toBeVisible();
});

test('证明中心展示固定语料闭包、revision、哈希与可下载 manifest', async ({ page }) => {
  await resetApplication(page);
  await page.locator('[data-view="proof"]').click();
  const corpus = page.locator('[data-testid="proof-corpus-coverage"]');
  await expect(corpus).toContainText(/100%/);
  await expect(corpus).toContainText(/空文\s*0|空段\s*0/);
  await expect(corpus).toContainText(/重复\s*0/);
  await expect(corpus).toContainText(/未分类\s*0/);
  await expect(corpus).toContainText(/revision|版本/);
  await expect(corpus).toContainText(/[a-f0-9]{12,64}/);
  await expect(page.getByRole('link', { name: /下载语料|corpus manifest/i })).toHaveAttribute('href', /corpus-manifest\.json$/);
});

test('封闭系统先列语义公理，再给出双射、全解释和可判定完备性', async ({ page }) => {
  await resetApplication(page);
  await page.locator('[data-view="proof"]').click();
  const closed = page.locator('[data-testid="proof-closed-system"]');
  await expect(closed).toContainText(/ZFC/);
  await expect(closed).toContainText(/选择公理/);
  await expect(closed).toContainText(/不声称.*ZFC.*一致性/);
  await expect(closed).toContainText(/1,132\s*\/\s*1,132/);
  await expect(closed).toContainText(/1,366,324/);
  await expect(closed).toContainText(/未定义值\s*0|0\s*未定义值/);
  await expect(closed).toContainText(/证明轨迹|反证轨迹/);
  await expect(page.getByRole('link', { name: /下载封闭系统证书/ })).toHaveAttribute('href', /closed-yijing-certificate\.json$/);
  await closed.locator('.axiom-register summary').click();
  await expect(closed.locator('[data-closed-axiom-list]')).toContainText(/axiom:semantic-corpus/);
  await expect(closed.locator('[data-closed-axiom-list]')).toContainText(/axiom:algebra-b6/);
  await expect(closed.locator('[data-closed-axiom-list]')).toContainText(/axiom:topology-rank-chain/);
});

test('证明命题可筛选并同屏显示论域、公理、输入数、边界和证书下载', async ({ page }) => {
  await resetApplication(page);
  await page.locator('[data-view="proof"]').click();
  await page.locator('[data-testid="theorem-filter"]').selectOption('structure');
  const theorem = page.locator('[data-testid="proof-theorem"]').first();
  await expect(theorem).toContainText(/theorem|定理|命题/i);
  await expect(theorem).toContainText(/论域|B6|Q6/);
  await expect(theorem).toContainText(/公理|axiom/i);
  await expect(theorem).toContainText(/64|4096|262144/);
  await expect(theorem).toContainText(/边界|不推出|不证明/);
  await expect(page.getByRole('link', { name: /下载证明证书|proof certificate/i })).toHaveAttribute('href', /proof-certificate\.json$/);
});

test('FCA、证据图谱、公理 DAG 与未决命题均明确显示完成度和语义边界', async ({ page }) => {
  await resetApplication(page);
  await page.locator('[data-view="proof"]').click();
  await expect(page.locator('[data-testid="proof-fca"]')).toContainText(/对象|属性|概念|未截断/);
  await expect(page.locator('[data-testid="proof-evidence-graph"]')).toContainText(/节点|边|悬空\s*0|可达.*100%/);
  await expect(page.locator('[data-testid="proof-axiom-dag"]')).toContainText(/循环\s*0|无根\s*0|缺失依赖\s*0/);
  const unresolved = page.locator('[data-testid="proof-unresolved"]');
  await expect(unresolved).toContainText(/唯一语义|作者原意/);
  await expect(unresolved).toContainText(/占筮|预测/);
  await expect(unresolved).toContainText(/出土|异文|注疏/);
});

test('证明中心全部可见结论由统一 claim 清单回链且证据完整', async ({ page }) => {
  await resetApplication(page);
  await page.locator('[data-view="proof"]').click();
  const claims = await page.evaluate(() => fetch('/data/claims.json').then((response) => response.json()));
  const known = new Set(claims.claims.map((item) => item.claimId));
  const visible = await page.locator('[data-claim-id]').evaluateAll((elements) => elements.map((element) => element.dataset.claimId));
  expect(visible).toHaveLength(claims.claims.length);
  expect(visible.every((id) => known.has(id))).toBe(true);
  expect(new Set(visible).size).toBe(visible.length);
  expect([...known].every((id) => visible.includes(id))).toBe(true);
  await expect(page.locator('[data-testid="claim-contract"]')).toHaveCount(claims.claims.length);
  for (const claim of claims.claims) {
    const contract = page.locator(`[data-claim-id="${claim.claimId}"] > [data-testid="claim-contract"]`);
    await expect(contract).toContainText(claim.claimId);
    await expect(contract).toContainText(claim.status);
    await expect(contract).toContainText(claim.evidence[0]);
  }
});

test('证明中心展示 18 个可键盘展开的 FCA 概念及 extent/intent', async ({ page }) => {
  await resetApplication(page);
  await page.locator('[data-view="proof"]').click();
  const concepts = page.locator('[data-testid="fca-concept"]');
  await expect(concepts).toHaveCount(18);
  const first = concepts.first().locator('summary');
  await first.focus();
  await page.keyboard.press('Enter');
  await expect(concepts.first()).toContainText(/extent|对象集/i);
  await expect(concepts.first()).toContainText(/intent|属性集/i);
});

test('证明中心同屏展示传统规则、模型检查与描述统计边界', async ({ page }) => {
  await resetApplication(page);
  await page.locator('[data-view="proof"]').click();
  await expect(page.locator('[data-testid="proof-traditional-rules"]')).toContainText(/zhouyi-core-v1|规则版本/);
  await expect(page.locator('[data-testid="proof-traditional-rules"]')).toContainText(/得位|应|比|承|乘|流派|校勘/);
  await expect(page.locator('[data-testid="proof-model-checking"]')).toContainText(/12.*关|状态|转移|最短|存档/);
  await expect(page.locator('[data-testid="proof-model-checking"]')).toContainText(/完整.*历史|undo|全部预算耗尽/);
  await expect(page.locator('[data-testid="proof-model-checking"]')).toContainText(/反例\s*0/);
  await expect(page.locator('[data-testid="proof-information-theory"]')).toContainText(/bit|秩|词项|熵/);
  await expect(page.locator('[data-testid="proof-information-theory"]')).toContainText(/不.*语义|不.*因果|不.*预测/);
});

for (const viewport of VIEWPORTS) {
  test(`证明中心 ${viewport.width}×${viewport.height} 无溢出、无截断且键盘可达`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await resetApplication(page);
    await page.locator('[data-view="proof"]').click();
    await assertNoHorizontalOverflow(page);
    await assertInteractiveTargets(page);
    await expect(page.locator('[data-testid="proof-corpus-coverage"]')).toBeVisible();
    await expect(page.locator('[data-testid="proof-unresolved"]')).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toBeVisible();
    const clipped = await page.locator('[data-panel="proof"] h1, [data-panel="proof"] h2, [data-panel="proof"] button, [data-panel="proof"] a').evaluateAll((elements) => elements.filter((element) => element.scrollWidth > element.clientWidth + 1).map((element) => element.textContent));
    expect(clipped).toEqual([]);
  });
}
