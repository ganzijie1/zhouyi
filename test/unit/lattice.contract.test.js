import assert from 'node:assert/strict';
import test from 'node:test';
import {
  loadProductionModule,
  popcount,
  reverseSixBits,
  statePairs,
  states
} from '../fixtures/contract.js';

const required = [
  'normalizeState', 'getLine', 'flipLine', 'rank', 'complement', 'reverseLines',
  'join', 'meet', 'xor', 'hammingDistance', 'lessOrEqual',
  'splitTrigrams', 'combineTrigrams', 'statesAtRank', 'q6Neighbors'
];

async function lattice() {
  return loadProductionModule('../../src/domain/lattice.js', required);
}

test('B6 模块提供完整纯函数契约', { concurrency: false }, async () => {
  await lattice();
});

test('64 状态：位序、秩、翻爻、补与综均满足定义', { concurrency: false }, async () => {
  const m = await lattice();
  for (const state of states()) {
    assert.equal(m.normalizeState(state), state);
    assert.equal(m.rank(state), popcount(state));
    assert.equal(m.complement(state), state ^ 63);
    assert.equal(m.complement(m.complement(state)), state);
    assert.equal(m.reverseLines(state), reverseSixBits(state));
    assert.equal(m.reverseLines(m.reverseLines(state)), state);
    for (let line = 0; line < 6; line++) {
      assert.equal(m.getLine(state, line), (state >> line) & 1, `bit 0 必须是初爻：state=${state}, line=${line}`);
      assert.equal(m.flipLine(state, line), state ^ (1 << line));
      assert.equal(m.flipLine(m.flipLine(state, line), line), state);
    }
  }
});

test('输入边界：公开状态与爻位接口拒绝非法值', { concurrency: false }, async () => {
  const m = await lattice();
  for (const invalid of [-1, 64, 1.5, Number.NaN, null, undefined]) {
    assert.throws(() => m.normalizeState(invalid), { name: /TypeError|RangeError/ });
  }
  assert.throws(() => m.getLine(0, -1), { name: /RangeError/ });
  assert.throws(() => m.getLine(0, 6), { name: /RangeError/ });
});

test('4096 状态对：并交、偏序、距离与基本格律', { concurrency: false }, async () => {
  const m = await lattice();
  for (const [left, right] of statePairs()) {
    assert.equal(m.join(left, right), left | right);
    assert.equal(m.meet(left, right), left & right);
    assert.equal(m.xor(left, right), left ^ right);
    assert.equal(m.hammingDistance(left, right), popcount(left ^ right));
    assert.equal(m.lessOrEqual(left, right), (left & right) === left);
    assert.equal(m.join(left, right), m.join(right, left), '并交换律');
    assert.equal(m.meet(left, right), m.meet(right, left), '交交换律');
    assert.equal(m.meet(left, m.join(left, right)), left, '吸收律 ∧');
    assert.equal(m.join(left, m.meet(left, right)), left, '吸收律 ∨');
    assert.equal(m.join(left, m.meet(right, 63)), m.meet(m.join(left, right), m.join(left, 63)), '分配律 ∨');
    assert.equal(m.meet(left, m.join(right, 0)), m.join(m.meet(left, right), m.meet(left, 0)), '分配律 ∧');
  }
});

test('64×64×64：并交结合律全穷举', { concurrency: false }, async () => {
  const m = await lattice();
  for (const left of states()) for (const middle of states()) for (const right of states()) {
    assert.equal(m.join(m.join(left, middle), right), m.join(left, m.join(middle, right)), '并结合律');
    assert.equal(m.meet(m.meet(left, middle), right), m.meet(left, m.meet(middle, right)), '交结合律');
  }
});

test('B3×B3：64 状态上下卦拆分与重组无损', { concurrency: false }, async () => {
  const m = await lattice();
  for (const state of states()) {
    const split = m.splitTrigrams(state);
    assert.deepEqual(split, { lower: state & 7, upper: (state >> 3) & 7 });
    assert.equal(m.combineTrigrams(split.lower, split.upper), state);
  }
});

test('七个秩层数量为 1/6/15/20/15/6/1 且无重复', { concurrency: false }, async () => {
  const m = await lattice();
  const expected = [1, 6, 15, 20, 15, 6, 1];
  const all = [];
  for (let rank = 0; rank <= 6; rank++) {
    const layer = m.statesAtRank(rank);
    assert.equal(layer.length, expected[rank]);
    assert.ok(layer.every((state) => m.rank(state) === rank));
    all.push(...layer);
  }
  assert.deepEqual([...new Set(all)].sort((a, b) => a - b), states());
});

test('Q6：每个状态恰有六个单爻邻居，邻接对称且距离为一', { concurrency: false }, async () => {
  const m = await lattice();
  for (const state of states()) {
    const neighbors = m.q6Neighbors(state);
    assert.equal(neighbors.length, 6);
    assert.equal(new Set(neighbors).size, 6);
    for (const neighbor of neighbors) {
      assert.equal(m.hammingDistance(state, neighbor), 1);
      assert.ok(m.q6Neighbors(neighbor).includes(state));
    }
  }
});

test('all 64^3 triples satisfy both distributive laws', { concurrency: false }, async () => {
  const m = await lattice();
  for (const left of states()) for (const middle of states()) for (const right of states()) {
    assert.equal(
      m.join(left, m.meet(middle, right)),
      m.meet(m.join(left, middle), m.join(left, right)),
      `join distributes over meet: ${left},${middle},${right}`
    );
    assert.equal(
      m.meet(left, m.join(middle, right)),
      m.join(m.meet(left, middle), m.meet(left, right)),
      `meet distributes over join: ${left},${middle},${right}`
    );
  }
});
