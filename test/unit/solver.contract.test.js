import assert from 'node:assert/strict';
import test from 'node:test';
import { loadProductionModule, popcount, statePairs } from '../fixtures/contract.js';

const required = [
  'applyAction', 'shortestActionPath', 'replayActions', 'createLevels',
  'calculateStars', 'createPuzzleSession'
];

async function solver() {
  return loadProductionModule('../../src/domain/solver.js', required);
}

const flipActions = Array.from({ length: 6 }, (_, line) => ({ type: 'flip', line }));

test('Q6/BFS 与关卡模块提供完整契约', { concurrency: false }, async () => {
  await solver();
});

test('4096 状态对：纯单爻动作 BFS 长度等于 Hamming 距离且可重放', { concurrency: false }, async () => {
  const m = await solver();
  for (const [start, target] of statePairs()) {
    const path = m.shortestActionPath(start, target, flipActions);
    assert.ok(Array.isArray(path));
    assert.equal(path.length, popcount(start ^ target), `${start} -> ${target}`);
    assert.equal(m.replayActions(start, path), target);
  }
});

test('动作语义覆盖翻爻、错、综、并、交与 XOR', { concurrency: false }, async () => {
  const m = await solver();
  assert.equal(m.applyAction(0, { type: 'flip', line: 0 }), 1);
  assert.equal(m.applyAction(0b001101, { type: 'complement' }), 0b110010);
  assert.equal(m.applyAction(0b000011, { type: 'reverse' }), 0b110000);
  assert.equal(m.applyAction(0b001100, { type: 'join', operand: 0b010101 }), 0b011101);
  assert.equal(m.applyAction(0b001100, { type: 'meet', operand: 0b010101 }), 0b000100);
  assert.equal(m.applyAction(0b001100, { type: 'xor', operand: 0b010101 }), 0b011001);
  assert.throws(() => m.applyAction(0, { type: 'flip', line: 6 }), { name: /RangeError/ });
  assert.throws(() => m.applyAction(0, { type: 'unknown' }), { name: /RangeError|TypeError/ });
});

test('固定种子生成 12 个确定、非空、可解且预算有效的关卡', { concurrency: false }, async () => {
  const m = await solver();
  const first = m.createLevels(20261029);
  const second = m.createLevels(20261029);
  assert.deepEqual(first, second);
  assert.equal(first.length, 12);
  assert.deepEqual(first.map((level) => level.number), Array.from({ length: 12 }, (_, index) => index + 1));
  for (const level of first) {
    assert.notEqual(level.start, level.target);
    assert.ok(level.start >= 0 && level.start < 64);
    assert.ok(level.target >= 0 && level.target < 64);
    assert.ok(Array.isArray(level.allowedActions) && level.allowedActions.length > 0);
    const optimal = m.shortestActionPath(level.start, level.target, level.allowedActions);
    assert.ok(optimal.length > 0, `第 ${level.number} 关必须可解`);
    assert.equal(m.replayActions(level.start, optimal), level.target);
    assert.equal(level.optimalSteps, optimal.length);
    assert.ok(level.budget >= level.optimalSteps);
  }
});

test('12 关教学动作：7-9 关并/交，10-12 关 XOR 均出现在最优解', { concurrency: false }, async () => {
  const m = await solver();
  const levels = m.createLevels(20261029);
  for (const level of levels.slice(6, 9)) {
    const solution = m.shortestActionPath(level.start, level.target, level.allowedActions);
    assert.ok(solution.some((action) => action.type === 'join' || action.type === 'meet'), `第 ${level.number} 关未教授并/交`);
  }
  for (const level of levels.slice(9, 12)) {
    const solution = m.shortestActionPath(level.start, level.target, level.allowedActions);
    assert.ok(solution.some((action) => action.type === 'xor'), `第 ${level.number} 关未教授 XOR`);
  }
});

test('评分契约与 Unity 版一致：最优 3 星、+1/+2 为 2 星、其余 1 星', { concurrency: false }, async () => {
  const m = await solver();
  assert.equal(m.calculateStars(3, 3), 3);
  assert.equal(m.calculateStars(4, 3), 2);
  assert.equal(m.calculateStars(5, 3), 2);
  assert.equal(m.calculateStars(6, 3), 1);
  assert.throws(() => m.calculateStars(0, 1), { name: /RangeError/ });
});

test('会话：提示只读、非法动作不计步、撤销/重开与一次性结算', { concurrency: false }, async () => {
  const m = await solver();
  const level = {
    number: 1,
    start: 0,
    target: 1,
    budget: 2,
    optimalSteps: 1,
    allowedActions: [{ type: 'flip', line: 0 }]
  };
  const session = m.createPuzzleSession(level);
  const beforeHint = session.snapshot();
  assert.deepEqual(session.hint(), { type: 'flip', line: 0 });
  assert.deepEqual(session.snapshot(), beforeHint, '提示不得修改会话');
  assert.equal(session.apply({ type: 'flip', line: 1 }), false);
  assert.equal(session.snapshot().steps, 0);
  assert.equal(session.apply({ type: 'flip', line: 0 }), true);
  assert.equal(session.snapshot().status, 'completed');
  assert.equal(session.apply({ type: 'flip', line: 0 }), false, '完成后不得重复结算');
  assert.equal(session.undo(), true);
  assert.equal(session.snapshot().state, 0);
  session.apply({ type: 'flip', line: 0 });
  session.restart();
  assert.deepEqual(session.snapshot(), { state: 0, steps: 0, status: 'playing', history: [] });
});

test('会话预算：耗尽失败、撤销恢复、重开复位，最后一步到达优先完成', { concurrency: false }, async () => {
  const m = await solver();
  const actions = [{ type: 'flip', line: 0 }, { type: 'flip', line: 1 }];
  const failed = m.createPuzzleSession({ number: 1, start: 0, target: 7, budget: 2, optimalSteps: 3, allowedActions: actions });
  failed.apply(actions[0]);
  failed.apply(actions[1]);
  assert.equal(failed.snapshot().status, 'failed');
  assert.equal(failed.snapshot().steps, 2);
  assert.equal(failed.apply(actions[0]), false, '失败后不得继续动作');
  assert.equal(failed.undo(), true);
  assert.equal(failed.snapshot().status, 'playing');
  failed.restart();
  assert.deepEqual(failed.snapshot(), { state: 0, steps: 0, status: 'playing', history: [] });

  const exact = m.createPuzzleSession({ number: 2, start: 0, target: 3, budget: 2, optimalSteps: 2, allowedActions: actions });
  exact.apply(actions[0]);
  exact.apply(actions[1]);
  assert.equal(exact.snapshot().status, 'completed', '预算最后一步到达目标必须优先成功');
});
