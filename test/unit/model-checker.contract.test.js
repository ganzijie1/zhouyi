import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { loadProductionModule } from '../fixtures/contract.js';

async function checker() {
  return loadProductionModule('../../src/domain/model-checker.js', ['modelCheckLevels', 'modelCheckStorageSchemas']);
}

async function solver() {
  return loadProductionModule('../../src/domain/solver.js', [
    'createLevels', 'createPuzzleSession', 'replayActions', 'initialPuzzleSnapshot', 'reducePuzzleSession'
  ]);
}

const stable = (value) => JSON.stringify(value, null, 2);

function independentlyEnumerateHistoryModel(game, level) {
  const initial = game.initialPuzzleSnapshot(level);
  const states = new Map([[stable(initial), initial]]);
  const queue = [initial];
  const transitions = createHash('sha256');
  let transitionCount = 0;
  let failed = 0;
  let completed = 0;
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const snapshot = queue[cursor];
    if (snapshot.status === 'failed') failed++;
    if (snapshot.status === 'completed') completed++;
    const commands = [
      ...level.allowedActions.map((action) => ({ type: 'apply', action })),
      { type: 'undo' }, { type: 'restart' },
      { type: 'apply', action: { type: 'not-allowed' } }, { type: 'hint' }
    ];
    for (const command of commands) {
      const result = game.reducePuzzleSession(level, snapshot, command);
      transitions.update(`${stable({
        from: snapshot, command, accepted: result.accepted, output: result.output ?? null, to: result.snapshot
      })}\n`);
      transitionCount++;
      const key = stable(result.snapshot);
      if (!states.has(key)) { states.set(key, result.snapshot); queue.push(result.snapshot); }
    }
  }
  return {
    visitedStates: states.size,
    transitionCount,
    failed,
    completed,
    reachableStateSetHash: createHash('sha256').update([...states.keys()].join('\n')).digest('hex'),
    transitionRelationHash: transitions.digest('hex')
  };
}

test('12 关有限状态模型逐字段声明有限域、理论上界和实际遍历数', { concurrency: false }, async () => {
  const model = await checker();
  const game = await solver();
  const report = model.modelCheckLevels(game.createLevels(20261029));
  assert.equal(report.levels.length, 12);
  assert.equal(report.summary.allFinite, true);
  for (const level of report.levels) {
    assert.equal(level.finiteDomains.state, 64);
    assert.ok(Number.isInteger(level.finiteDomains.remainingBudget) && level.finiteDomains.remainingBudget > 0);
    assert.ok(Number.isInteger(level.theoreticalUpperBound) && level.theoreticalUpperBound > 0);
    assert.ok(Number.isInteger(level.visitedStates) && level.visitedStates <= level.theoreticalUpperBound);
    assert.ok(Number.isInteger(level.transitionCount) && level.transitionCount >= 0);
    assert.doesNotMatch(JSON.stringify(level.finiteDomains), /timestamp|unbounded|arbitrary/i);
  }
});

test('每关目标可达、最短解与现行关卡一致且预算内可完成', { concurrency: false }, async () => {
  const model = await checker();
  const game = await solver();
  const levels = game.createLevels(20261029);
  const report = model.modelCheckLevels(levels);
  for (const [index, result] of report.levels.entries()) {
    assert.equal(result.reachable, true);
    assert.equal(result.shortestSteps, levels[index].optimalSteps);
    assert.ok(result.shortestSteps <= levels[index].budget);
    assert.equal(game.replayActions(levels[index].start, result.shortestActions), levels[index].target);
  }
});

test('模型检查预算失败、非法动作、提示只读、一次性结算、撤销和重开不变式', { concurrency: false }, async () => {
  const model = await checker();
  const game = await solver();
  const report = model.modelCheckLevels(game.createLevels(20261029));
  for (const level of report.levels) {
    assert.equal(level.budgetFailureVerified, true);
    assert.deepEqual(level.invariants, {
      illegalActionIsNoop: true,
      hintIsReadOnly: true,
      settlementIsIdempotent: true,
      undoRestoresState: true,
      restartRestoresInitialState: true
    });
  }
});

test('完整历史模型拒绝仅按 state 与 remainingBudget 合并的采样证明', { concurrency: false }, async () => {
  const model = await checker();
  const game = await solver();
  const levels = game.createLevels(20261029);
  const report = model.modelCheckLevels(levels);
  assert.ok(report.summary.totalVisitedStates > 942, '不得复用旧商空间的 942 个采样节点');
  assert.ok(report.summary.totalTransitions > 3154, '不得复用旧商空间的 3154 条采样转移');
  assert.equal(report.summary.totalVisitedStates, 24100);
  assert.equal(report.summary.totalTransitions, 264622);
  assert.equal(report.summary.allReachableSessionStatesExhausted, true);
  for (const [index, level] of report.levels.entries()) {
    const independentlyRebuilt = independentlyEnumerateHistoryModel(game, levels[index]);
    assert.equal(level.visitedStates, independentlyRebuilt.visitedStates);
    assert.equal(level.transitionCount, independentlyRebuilt.transitionCount);
    assert.equal(level.reachableStateSetHash, independentlyRebuilt.reachableStateSetHash);
    assert.equal(level.transitionRelationHash, independentlyRebuilt.transitionRelationHash);
    assert.equal(level.commandCoverage.budgetExhaustionTerminalStates, independentlyRebuilt.failed);
    assert.equal(level.commandCoverage.completedTerminalStates, independentlyRebuilt.completed);
    assert.equal(level.stateProjection, 'state+steps+status+ordered-history');
    assert.equal(level.finiteDomains.historyMaxLength, level.budget);
    assert.ok(level.finiteDomains.historySequenceUpperBound > level.finiteDomains.state);
    assert.ok(level.historyProjectionCollisions > 0, `第 ${level.level} 关没有证明旧投影会丢失历史`);
    assert.equal(level.transitionCount, level.visitedStates * (level.allowedActions.length + 4));
    assert.equal(level.commandCoverage.undo, level.visitedStates);
    assert.equal(level.commandCoverage.restart, level.visitedStates);
    assert.equal(level.commandCoverage.illegalApply, level.visitedStates);
    assert.equal(level.commandCoverage.hint, level.visitedStates);
    assert.equal(level.commandCoverage.allowedApply, level.visitedStates * level.allowedActions.length);
    assert.ok(level.commandCoverage.terminalSettlementApply > 0);
    assert.ok(level.commandCoverage.budgetExhaustionTerminalStates > 0);
    assert.match(level.inputHash, /^[a-f0-9]{64}$/);
    assert.match(level.resultHash, /^[a-f0-9]{64}$/);
    assert.match(level.reachableStateSetHash, /^[a-f0-9]{64}$/);
    assert.match(level.transitionRelationHash, /^[a-f0-9]{64}$/);
    for (const check of Object.values(level.invariantChecks)) {
      assert.ok(check.checked > 0);
      assert.equal(check.failures, 0);
      assert.deepEqual(check.counterexamples, []);
    }
  }
});

test('模型最短轨迹可在真实会话实现中逐步重放并仅结算一次', { concurrency: false }, async () => {
  const model = await checker();
  const game = await solver();
  const levels = game.createLevels(20261029);
  const report = model.modelCheckLevels(levels);
  for (const [index, result] of report.levels.entries()) {
    const session = game.createPuzzleSession(levels[index]);
    for (const action of result.shortestActions) assert.equal(session.apply(action), true);
    assert.equal(session.snapshot().status, 'completed');
    assert.equal(session.apply(result.shortestActions[0]), false);
  }
});

test('存档模型枚举现行、旧版、损坏和未来版本输入类且全部满足回退/迁移不变式', { concurrency: false }, async () => {
  const model = await checker();
  const report = model.modelCheckStorageSchemas();
  assert.equal(report.allPassed, true);
  for (const inputClass of ['current-valid', 'legacy-valid', 'malformed-json', 'wrong-types', 'out-of-range', 'future-version', 'unknown-fields']) {
    assert.ok(report.classes.some((item) => item.id === inputClass && item.passed), `缺少 ${inputClass}`);
  }
  assert.equal(report.settingsKeyIsolated, true);
  assert.equal(report.unknownFieldsIsolated, true);
});
