import assert from 'node:assert/strict';
import test from 'node:test';
import { readJson } from '../fixtures/formal-completeness.js';
import { loadProductionModule } from '../fixtures/contract.js';

async function closedSystem() {
  return loadProductionModule('../../src/domain/closed-yijing.js', [
    'encodeEntry', 'decodeEntry', 'semanticValue', 'evaluateFormula', 'deriveFormula',
    'verifyDerivation', 'createClosedSystemCertificate', 'serializeClosedSystemCertificate', 'validateClosedSystemCertificate'
  ]);
}

test('固定语料与序号编码构成 1132 元双射且原文无损', async () => {
  const module = await closedSystem();
  const manifest = (await readJson('../../public/data/corpus-manifest.json')).value;
  for (const [ordinal, entry] of manifest.entries.entries()) {
    assert.equal(module.encodeEntry(manifest, entry), ordinal);
    assert.deepEqual(module.decodeEntry(manifest, ordinal), entry);
    const value = module.semanticValue(manifest, ordinal);
    assert.equal(value.text, entry.text);
    assert.equal(value.textHash, entry.sha256);
    assert.equal(value.state, ordinal % 64);
  }
});

test('语义公理给每段唯一且无未定义的形式值', async () => {
  const module = await closedSystem();
  const manifest = (await readJson('../../public/data/corpus-manifest.json')).value;
  const certificate = module.createClosedSystemCertificate(manifest);
  assert.equal(certificate.scope.paragraphs, 1132);
  assert.equal(certificate.interpretation.assigned, 1132);
  assert.equal(certificate.interpretation.undefined, 0);
  assert.equal(certificate.interpretation.uniqueSemanticTuples, 1132);
  assert.equal(certificate.encoding.roundTrips, 1132);
  assert.equal(certificate.completeness.systemInternalCompleteness, true);
});

test('二值演算为任意合法公式生成可校验的证明或反证轨迹', async () => {
  const module = await closedSystem();
  const manifest = (await readJson('../../public/data/corpus-manifest.json')).value;
  const formula = {
    type: 'implies',
    left: { type: 'atom', predicate: 'state', entry: 65, state: 1 },
    right: { type: 'and', left: { type: 'atom', predicate: 'entry', entry: 65 }, right: { type: 'not', value: { type: 'atom', predicate: 'before', entry: 65, other: 1 } } }
  };
  const trace = module.deriveFormula(manifest, formula);
  assert.equal(trace.verdict, true);
  assert.equal(module.verifyDerivation(manifest, trace), true);
  const tampered = structuredClone(trace); tampered.verdict = false;
  assert.equal(module.verifyDerivation(manifest, tampered), false);
});

test('证书登记 ZFC 选择公理、逻辑、代数、拓扑及全部原子判定', async () => {
  const module = await closedSystem();
  const manifest = (await readJson('../../public/data/corpus-manifest.json')).value;
  const certificate = module.createClosedSystemCertificate(manifest);
  assert.ok(certificate.foundations.axioms.some((axiom) => axiom.id === 'axiom:zfc-choice'));
  assert.ok(certificate.objectTheory.axioms.some((axiom) => axiom.id === 'axiom:algebra-b6'));
  assert.ok(certificate.objectTheory.axioms.some((axiom) => axiom.id === 'axiom:topology-rank-chain'));
  assert.equal(certificate.atomicEvaluation.undefinedCases, 0);
  assert.equal(certificate.topology.openSets, 8);
  assert.equal(certificate.topology.subfamilies, 256);
  assert.equal(certificate.topology.unionChecks, 256);
  assert.equal(certificate.topology.intersectionChecks, 256);
  assert.equal(certificate.topology.failures, 0);
  assert.equal(certificate.algebra.pairChecks, 4096);
  assert.equal(certificate.algebra.tripleChecks, 262144);
  assert.equal(certificate.algebra.failures, 0);
  assert.equal(certificate.calculus.sound, true);
  assert.equal(certificate.calculus.complete, true);
  assert.match(certificate.foundations.note, /不依赖选择公理|不声称.*ZFC.*一致性/);
});

test('封闭系统证书可字节重建且篡改后被拒绝', async () => {
  const module = await closedSystem();
  const manifest = (await readJson('../../public/data/corpus-manifest.json')).value;
  const checkedIn = await readJson('../../public/data/closed-yijing-certificate.json');
  const rebuilt = module.createClosedSystemCertificate(manifest);
  assert.equal(module.serializeClosedSystemCertificate(rebuilt), checkedIn.raw);
  assert.equal(module.validateClosedSystemCertificate(checkedIn.value, manifest).valid, true);
  const tampered = structuredClone(checkedIn.value); tampered.completeness.systemInternalCompleteness = false;
  assert.equal(module.validateClosedSystemCertificate(tampered, manifest).valid, false);
});
