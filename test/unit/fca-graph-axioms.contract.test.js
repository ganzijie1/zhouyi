import assert from 'node:assert/strict';
import test from 'node:test';
import { loadProductionData, loadProductionModule } from '../fixtures/contract.js';
import { isSubset, readJson, subsets } from '../fixtures/formal-completeness.js';

const fixtureContext = {
  objects: ['p1', 'p2', 'p3'],
  attributes: ['curated:change', 'term:water', 'term:heaven'],
  incidences: [
    ['p1', 'curated:change'], ['p1', 'term:water'],
    ['p2', 'curated:change'], ['p2', 'term:heaven'],
    ['p3', 'term:water']
  ]
};

async function fca() {
  return loadProductionModule('../../src/domain/fca.js', ['deriveAttributes', 'deriveObjects', 'closeAttributes', 'enumerateConcepts', 'validateFormalContext']);
}

async function graph() {
  return loadProductionModule('../../src/domain/evidence-graph.js', ['validateEvidenceGraph', 'validateAxiomGraph']);
}

test('FCA 导出算子在小型形式背景上满足 Galois 连接', { concurrency: false }, async () => {
  const module = await fca();
  for (const objects of subsets(fixtureContext.objects)) {
    for (const attributes of subsets(fixtureContext.attributes)) {
      const left = isSubset(attributes, module.deriveAttributes(fixtureContext, objects));
      const right = isSubset(objects, module.deriveObjects(fixtureContext, attributes));
      assert.equal(left, right, `${JSON.stringify(objects)} / ${JSON.stringify(attributes)}`);
    }
  }
});

test('FCA 双闭包满足广延、单调和幂等', { concurrency: false }, async () => {
  const module = await fca();
  const attributeSets = subsets(fixtureContext.attributes);
  for (const attributes of attributeSets) {
    const closed = module.closeAttributes(fixtureContext, attributes);
    assert.ok(isSubset(attributes, closed), '闭包必须广延');
    assert.deepEqual(module.closeAttributes(fixtureContext, closed), closed, '闭包必须幂等');
    for (const superset of attributeSets.filter((candidate) => isSubset(attributes, candidate))) {
      assert.ok(isSubset(closed, module.closeAttributes(fixtureContext, superset)), '闭包必须单调');
    }
  }
});

test('NextClosure 枚举小型背景的全部概念且每个 extent/intent 互为导出', { concurrency: false }, async () => {
  const module = await fca();
  const concepts = module.enumerateConcepts(fixtureContext);
  assert.ok(Array.isArray(concepts) && concepts.length > 0);
  assert.equal(new Set(concepts.map((concept) => JSON.stringify(concept.intent))).size, concepts.length);
  for (const concept of concepts) {
    assert.deepEqual(module.deriveObjects(fixtureContext, concept.intent), concept.extent);
    assert.deepEqual(module.deriveAttributes(fixtureContext, concept.extent), concept.intent);
  }
});

test('实际 FCA 产物使用固定有限标签字典，全部概念未截断', { concurrency: false }, async () => {
  const module = await fca();
  const artifact = (await readJson('../../public/data/formal-concepts.json')).value;
  assert.equal(artifact.complete, true);
  assert.equal(artifact.truncated, false);
  assert.match(artifact.attributeDictionaryHash, /^[a-f0-9]{64}$/);
  assert.equal(artifact.summary.objects, artifact.context.objects.length);
  assert.equal(artifact.summary.attributes, artifact.context.attributes.length);
  assert.equal(artifact.summary.incidences, artifact.context.incidences.length);
  assert.equal(artifact.summary.concepts, artifact.concepts.length);
  assert.ok(artifact.context.attributes.every((attribute) => /^(curated|term):/.test(attribute)));
  assert.equal(module.validateFormalContext(artifact).valid, true);
});

test('证据图谱节点边类型闭合、零悬空，段落和可见结论均可达证据根', { concurrency: false }, async () => {
  const module = await graph();
  const artifact = (await readJson('../../public/data/evidence-graph.json')).value;
  const report = module.validateEvidenceGraph(artifact);
  assert.equal(report.valid, true);
  assert.deepEqual(report.danglingEdges, []);
  assert.deepEqual(report.invalidTypeEdges, []);
  assert.deepEqual(report.paragraphsWithoutSourcePath, []);
  assert.deepEqual(report.claimsWithoutEvidencePath, []);
  assert.deepEqual(report.claimsWithMissingRequiredEvidence, []);
  assert.deepEqual(report.nodesWithMissingRequiredInputs, []);
  assert.deepEqual(report.duplicateNodeIds, []);
  assert.deepEqual(report.duplicateEdges, []);
  assert.equal(report.sourceReachabilityRatio, 1);
  assert.equal(report.claimEvidenceReachabilityRatio, 1);
});

test('公理依赖图是 DAG，结论无缺失依赖、无循环、无根结论', { concurrency: false }, async () => {
  const module = await graph();
  const { AXIOM_GRAPH } = await loadProductionData('../../src/data/axioms.js', ['AXIOM_GRAPH']);
  const report = module.validateAxiomGraph(AXIOM_GRAPH);
  assert.equal(report.valid, true);
  assert.deepEqual(report.cycles, []);
  assert.deepEqual(report.missingDependencies, []);
  assert.deepEqual(report.rootlessClaims, []);
});

test('公理图校验器能够拒绝循环、缺失依赖和无根结论', { concurrency: false }, async () => {
  const module = await graph();
  const invalid = {
    nodes: [
      { id: 'claim:a', kind: 'claim' },
      { id: 'claim:b', kind: 'claim' },
      { id: 'claim:rootless', kind: 'claim' }
    ],
    edges: [
      { from: 'claim:a', to: 'claim:b' },
      { from: 'claim:b', to: 'claim:a' },
      { from: 'claim:a', to: 'missing:node' }
    ]
  };
  const report = module.validateAxiomGraph(invalid);
  assert.equal(report.valid, false);
  assert.ok(report.cycles.length > 0);
  assert.ok(report.missingDependencies.length > 0);
  assert.ok(report.rootlessClaims.includes('claim:rootless'));
});
