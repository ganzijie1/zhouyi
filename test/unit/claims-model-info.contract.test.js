import assert from 'node:assert/strict';
import test from 'node:test';
import { loadProductionModule } from '../fixtures/contract.js';
import { readJson, sha256 } from '../fixtures/formal-completeness.js';

test('统一 claims 清单覆盖六类结论并携带完整可审计字段', async () => {
  const claims = (await readJson('../../public/data/claims.json')).value;
  assert.match(claims.schemaVersion, /^\d+\.\d+\.\d+$/);
  assert.deepEqual(new Set(claims.claims.map((item) => item.category)), new Set(['corpus', 'closed-system', 'structure', 'traditional', 'fca-graph', 'model-info']));
  const ids = new Set();
  for (const claim of claims.claims) {
    assert.ok(claim.claimId && !ids.has(claim.claimId)); ids.add(claim.claimId);
    assert.ok(claim.domain?.name && Number.isInteger(claim.domain.cardinality) && claim.domain.cardinality > 0);
    assert.ok(Array.isArray(claim.axioms) && claim.axioms.length > 0);
    assert.ok(Array.isArray(claim.evidence) && claim.evidence.length > 0);
    assert.ok(claim.boundary?.trim());
    assert.ok(['proved', 'verified', 'bounded', 'unresolved'].includes(claim.status));
  }
});

test('证明证书内置 12 关与存档模型检查的有限域、计数、轨迹和哈希', async () => {
  const certificate = (await readJson('../../public/data/proof-certificate.json')).value;
  const model = certificate.modelChecking;
  assert.match(model.inputHash, /^[a-f0-9]{64}$/);
  assert.match(model.resultHash, /^[a-f0-9]{64}$/);
  assert.equal(model.algorithmVersion, 'complete-history-session-model-checker-2.0.0');
  assert.equal(model.summary.allReachableSessionStatesExhausted, true);
  assert.ok(model.summary.totalVisitedStates > 942);
  assert.ok(model.summary.totalTransitions > 3154);
  assert.equal(model.summary.totalCounterexamples, 0);
  assert.equal(model.levels.length, 12);
  for (const level of model.levels) {
    assert.equal(level.finiteDomains.state, 64);
    assert.ok(level.visitedStates > 0 && level.transitionCount >= 0);
    assert.equal(level.reachable, true);
    assert.ok(level.shortestSteps <= level.budget);
    assert.ok(Object.values(level.invariants).every(Boolean));
    assert.equal(level.stateProjection, 'state+steps+status+ordered-history');
    assert.ok(level.historyProjectionCollisions > 0);
    assert.equal(level.transitionCount, level.visitedStates * (level.allowedActions.length + 4));
    assert.match(level.reachableStateSetHash, /^[a-f0-9]{64}$/);
    assert.match(level.transitionRelationHash, /^[a-f0-9]{64}$/);
    assert.ok(Object.values(level.invariantChecks).every((check) => check.failures === 0 && check.counterexamples.length === 0));
  }
  assert.equal(model.storage.allPassed, true);
  assert.equal(model.storage.classes.length, 7);
  for (const storageClass of model.storage.classes) {
    assert.equal(storageClass.inputHash, sha256(JSON.stringify(storageClass.input, null, 2)));
    assert.equal(storageClass.outputHash, sha256(JSON.stringify(storageClass.output, null, 2)));
  }
});

test('描述性信息论产物可复算且只报告 bit、秩、固定词项分布与熵', async () => {
  const statsArtifact = await readJson('../../public/data/descriptive-statistics.json');
  const stats = statsArtifact.value;
  assert.equal(stats.sample.stateSpace.cardinality, 64);
  assert.deepEqual(stats.bitDistribution.map((item) => [item.zeros, item.ones, item.entropyBits]), Array(6).fill([32, 32, 1]));
  assert.deepEqual(stats.rankDistribution.map((item) => item.count), [1, 6, 15, 20, 15, 6, 1]);
  assert.ok(stats.rankEntropyBits > 0);
  assert.ok(stats.termDistribution.length >= 5);
  assert.ok(stats.termDistribution.every((item) => Number.isInteger(item.count) && item.count >= 0 && Number.isFinite(item.presenceEntropyBits)));
  assert.match(stats.boundary, /描述/);
  assert.match(stats.boundary, /不.*语义|不.*因果|不.*预测/);
  const certificate = (await readJson('../../public/data/proof-certificate.json')).value;
  assert.equal(certificate.descriptiveStatistics.artifactHash, stats.resultHash);
  const information = await loadProductionModule('../../src/domain/information-theory.js', [
    'generateDescriptiveStatistics', 'serializeDescriptiveStatistics', 'validateDescriptiveStatistics'
  ]);
  const manifest = (await readJson('../../public/data/corpus-manifest.json')).value;
  assert.equal(information.serializeDescriptiveStatistics(information.generateDescriptiveStatistics(manifest)), statsArtifact.raw);
  const tampered = structuredClone(stats);
  tampered.inputHash = '0'.repeat(64);
  assert.equal(information.validateDescriptiveStatistics(tampered).valid, false);
});

test('证据图谱逐条登记 claims 清单且每条必需证据边完整', async () => {
  const claims = (await readJson('../../public/data/claims.json')).value;
  const graph = (await readJson('../../public/data/evidence-graph.json')).value;
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const edges = new Set(graph.edges.map((edge) => `${edge.from}\u0000${edge.to}`));
  const dependencies = new Set(graph.edges
    .filter((edge) => edge.type === 'depends-on')
    .map((edge) => `${edge.from}\u0000${edge.to}`));
  for (const claim of claims.claims) {
    for (const evidenceId of claim.evidence) {
      const evidence = byId.get(evidenceId);
      if (evidence?.kind !== 'proof') continue;
      assert.ok(evidence.requiredInputIds?.length > 0, `${evidenceId} has no grounded inputs`);
      for (const inputId of evidence.requiredInputIds) {
        assert.ok(byId.has(inputId), `${evidenceId} refers to missing input ${inputId}`);
        assert.ok(dependencies.has(`${evidenceId}\u0000${inputId}`), `${evidenceId} is not grounded by ${inputId}`);
      }
    }
  }
  for (const claim of claims.claims) {
    const node = byId.get(claim.claimId);
    assert.equal(node?.kind, 'claim', `${claim.claimId} 未登记为图谱 claim`);
    assert.deepEqual(node.requiredEvidenceIds, claim.evidence);
    for (const evidenceId of claim.evidence) assert.ok(edges.has(`${claim.claimId}\u0000${evidenceId}`), `${claim.claimId} 缺少 ${evidenceId}`);
  }
});
