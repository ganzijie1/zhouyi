import assert from 'node:assert/strict';
import test from 'node:test';
import { loadProductionModule, reverseSixBits, states } from '../fixtures/contract.js';

const RULE_VERSION = 'zhouyi-core-v1';
const required = [
  'nuclearHexagram', 'kleinOrbit', 'kleinStabilizer', 'linePositionFacts',
  'areAdjacentPositions', 'isCorresponding', 'isSupporting', 'isRiding',
  'relationEvidence', 'buildTypedRelationEdges'
];

async function relations() {
  return loadProductionModule('../../src/domain/relations.js', required);
}

test('互错综与传统关系模块提供版本化契约', { concurrency: false }, async () => {
  await relations();
});

test('64 状态：互卦严格使用二三四爻为下卦、三四五爻为上卦', { concurrency: false }, async () => {
  const m = await relations();
  for (const state of states()) {
    const expected = ((state >> 1) & 7) | (((state >> 2) & 7) << 3);
    const result = m.nuclearHexagram(state);
    assert.equal(result.state, expected);
    assert.deepEqual(result.sourceLines, { lower: [2, 3, 4], upper: [3, 4, 5] });
  }
});

test('错与综生成 Klein 四元群：闭合、交换、轨道及稳定子正确', { concurrency: false }, async () => {
  const m = await relations();
  for (const state of states()) {
    const complement = state ^ 63;
    const reverse = reverseSixBits(state);
    const both = reverse ^ 63;
    const expectedOrbit = [...new Set([state, complement, reverse, both])].sort((a, b) => a - b);
    assert.deepEqual(m.kleinOrbit(state), expectedOrbit);
    const stabilizer = m.kleinStabilizer(state);
    assert.ok(stabilizer.includes('identity'));
    assert.equal(stabilizer.includes('complement'), complement === state);
    assert.equal(stabilizer.includes('reverse'), reverse === state);
    assert.equal(stabilizer.includes('complement-reverse'), both === state);
    assert.equal(reverseSixBits(complement), reverse ^ 63, '错综必须交换');
  }
});

test('六爻位置事实：得位、三才与阴阳真值表', { concurrency: false }, async () => {
  const m = await relations();
  const facts = m.linePositionFacts(0b100101);
  assert.equal(facts.length, 6);
  assert.deepEqual(facts.map(({ position, polarity, proper, realm }) => ({ position, polarity, proper, realm })), [
    { position: 1, polarity: 'yang', proper: true, realm: 'earth' },
    { position: 2, polarity: 'yin', proper: true, realm: 'earth' },
    { position: 3, polarity: 'yang', proper: true, realm: 'human' },
    { position: 4, polarity: 'yin', proper: true, realm: 'human' },
    { position: 5, polarity: 'yin', proper: false, realm: 'heaven' },
    { position: 6, polarity: 'yang', proper: false, realm: 'heaven' }
  ]);
});

test('应、比、承、乘谓词显式携带规则版本与边界', { concurrency: false }, async () => {
  const m = await relations();
  assert.equal(m.areAdjacentPositions(1, 2, RULE_VERSION), true);
  assert.equal(m.areAdjacentPositions(1, 3, RULE_VERSION), false);
  assert.equal(m.isCorresponding(0b001000, 1, 4, RULE_VERSION), true, '一阴一阳为应');
  assert.equal(m.isCorresponding(0b001001, 1, 4, RULE_VERSION), false, '同性不应');
  assert.equal(m.isSupporting(0b000010, 1, 2, RULE_VERSION), true, '下阴承上阳');
  assert.equal(m.isSupporting(0b000011, 1, 2, RULE_VERSION), false);
  assert.equal(m.isRiding(0b000001, 1, 2, RULE_VERSION), true, '上阴乘下阳');
  assert.equal(m.isRiding(0b000011, 1, 2, RULE_VERSION), false);
  const evidence = m.relationEvidence(0b001000, RULE_VERSION);
  assert.equal(evidence.ruleVersion, RULE_VERSION);
  assert.match(evidence.boundary, /规则|流派|吉凶/);
  assert.ok(Array.isArray(evidence.correspondence));
  assert.ok(Array.isArray(evidence.adjacency));
});

test('非法爻位、非对应位置和未知规则版本不得静默给出关系', { concurrency: false }, async () => {
  const m = await relations();
  assert.throws(() => m.isCorresponding(0, 1, 2, RULE_VERSION), { name: /RangeError/ });
  assert.throws(() => m.areAdjacentPositions(0, 1, RULE_VERSION), { name: /RangeError/ });
  assert.throws(() => m.isSupporting(0, 1, 2, 'unknown'), { name: /RangeError|TypeError/ });
});

test('多关系边保留类型，不把文王序、Q6、错综互混成单一距离', { concurrency: false }, async () => {
  const m = await relations();
  const edges = m.buildTypedRelationEdges();
  const types = new Set(edges.map((edge) => edge.type));
  for (const type of ['q6', 'complement', 'reverse', 'nuclear', 'king-wen-next']) assert.ok(types.has(type));
  for (const edge of edges) {
    assert.ok(Number.isInteger(edge.from) && edge.from >= 0 && edge.from < 64);
    assert.ok(Number.isInteger(edge.to) && edge.to >= 0 && edge.to < 64);
    assert.ok(typeof edge.definition === 'string' && edge.definition.length > 0);
  }
});
