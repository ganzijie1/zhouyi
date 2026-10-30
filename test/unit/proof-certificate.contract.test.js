import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadProductionModule } from '../fixtures/contract.js';
import { readJson, sha256 } from '../fixtures/formal-completeness.js';

const certificateUrl = '../../public/data/proof-certificate.json';

async function proofs() {
  return loadProductionModule('../../src/domain/proofs.js', ['generateProofCertificate', 'serializeProofCertificate', 'validateProofCertificate']);
}

function resign(value) {
  const { resultHash: _discarded, ...core } = value;
  return { ...core, resultHash: sha256(JSON.stringify(core, null, 2)) };
}

test('证明证书包含稳定 schema、算法版本、输入哈希与结果哈希', { concurrency: false }, async () => {
  const certificate = (await readJson(certificateUrl)).value;
  assert.match(certificate.schemaVersion, /^\d+\.\d+\.\d+$/);
  assert.ok(certificate.algorithmVersion?.trim());
  assert.ok(Object.keys(certificate.inputHashes ?? {}).length >= 3);
  for (const hash of Object.values(certificate.inputHashes)) assert.match(hash, /^[a-f0-9]{64}$/);
  assert.match(certificate.resultHash, /^[a-f0-9]{64}$/);
  assert.ok(Array.isArray(certificate.theorems) && certificate.theorems.length > 0);
  assert.deepEqual(Object.keys(certificate.inputHashes).sort(), ['algorithmSources', 'axioms', 'corpusManifest', 'relations']);
  const corpusBytes = await readFile(new URL('../../public/data/corpus-manifest.json', import.meta.url));
  assert.equal(certificate.inputHashes.corpusManifest, (await import('node:crypto')).createHash('sha256').update(corpusBytes).digest('hex'));
});

test('每条命题有 theorem ID、论域、公理、边界、反例与实际评估数', { concurrency: false }, async () => {
  const certificate = (await readJson(certificateUrl)).value;
  const ids = new Set();
  for (const theorem of certificate.theorems) {
    assert.ok(theorem.theoremId && !ids.has(theorem.theoremId));
    ids.add(theorem.theoremId);
    assert.ok(theorem.domain?.name?.trim());
    assert.ok(Number.isInteger(theorem.domain.cardinality) && theorem.domain.cardinality > 0);
    assert.equal(theorem.evaluatedInputs, theorem.domain.cardinality);
    assert.ok(Array.isArray(theorem.axioms) && theorem.axioms.length > 0);
    assert.ok(['proved', 'counterexample', 'versioned-enumeration'].includes(theorem.status));
    assert.ok(Array.isArray(theorem.counterexamples));
    assert.ok(theorem.boundary?.trim());
    assert.match(theorem.resultHash, /^[a-f0-9]{64}$/);
  }
});

test('证书明确包含 64、4096 与 262144 个有限输入的全域穷举', { concurrency: false }, async () => {
  const certificate = (await readJson(certificateUrl)).value;
  const cardinalities = new Set(certificate.theorems.map((theorem) => theorem.domain.cardinality));
  assert.ok(cardinalities.has(64));
  assert.ok(cardinalities.has(4096));
  assert.ok(cardinalities.has(262144));
  for (const expected of [64, 4096, 262144]) {
    assert.ok(certificate.theorems.some((theorem) => theorem.domain.cardinality === expected && theorem.evaluatedInputs === expected));
  }
});

test('结构证书覆盖 B6/B3×B3/Q6、距离、Klein、互变卦、序和爻位谓词', { concurrency: false }, async () => {
  const certificate = (await readJson(certificateUrl)).value;
  const coverage = certificate.coverage ?? [];
  for (const family of ['B6', 'B3xB3', 'Q6', 'hamming-bfs', 'klein', 'nuclear', 'transformed', 'king-wen', 'trigram-matrix', 'line-predicates']) {
    assert.ok(coverage.includes(family), `证明证书缺少 ${family}`);
  }
  const ids = new Set(certificate.theorems.map((item) => item.theoremId));
  assert.ok(ids.has('theorem:hamming-bfs'), 'hamming-bfs 不得只出现在 coverage 标签中');
  assert.ok(ids.has('theorem:triple-distributive-lattice'), '分配格必须实际穷举分配律');
});

test('从源码重建证明证书两次字节相同且与入库文件一致', { concurrency: false }, async () => {
  const module = await proofs();
  const first = await module.generateProofCertificate();
  const second = await module.generateProofCertificate();
  const firstBytes = module.serializeProofCertificate(first);
  const secondBytes = module.serializeProofCertificate(second);
  const checkedIn = await readFile(new URL(certificateUrl, import.meta.url), 'utf8');
  assert.equal(firstBytes, secondBytes, '相同输入必须字节级复现');
  assert.equal(firstBytes, checkedIn, '入库证书必须是当前源码的重建结果');
  assert.equal(module.validateProofCertificate(first).valid, true);
});

test('证明校验器拒绝重新签名的旧采样模型', { concurrency: false }, async () => {
  const module = await proofs();
  const certificate = structuredClone((await readJson(certificateUrl)).value);
  const sampled = certificate.modelChecking.levels[0];
  sampled.visitedStates = 80;
  sampled.transitionCount = sampled.visitedStates * (sampled.allowedActions.length + 4);
  sampled.historyProjectionCollisions = 0;
  certificate.modelChecking.levels[0] = resign(sampled);
  certificate.modelChecking.summary.totalVisitedStates = certificate.modelChecking.levels
    .reduce((sum, level) => sum + level.visitedStates, 0);
  certificate.modelChecking.summary.totalTransitions = certificate.modelChecking.levels
    .reduce((sum, level) => sum + level.transitionCount, 0);
  certificate.modelChecking = resign(certificate.modelChecking);
  const forged = resign(certificate);
  const report = module.validateProofCertificate(forged);
  assert.equal(report.valid, false, '旧 state+remainingBudget 采样结果即使重签全部外层哈希也必须被拒绝');
  assert.ok(report.errors.some((error) => /exhaustive|history|mismatch/i.test(error)), report.errors.join('; '));
});

test('证书不把传统谓词、描述统计或结构关系写成义理和预测结论', { concurrency: false }, async () => {
  const certificate = (await readJson(certificateUrl)).value;
  assert.match(certificate.boundary, /不证明|不可推出/);
  assert.match(certificate.boundary, /唯一语义|作者原意/);
  assert.match(certificate.boundary, /占筮|预测/);
  assert.doesNotMatch(JSON.stringify(certificate.claims ?? []), /预测有效|证明吉凶|唯一原意/);
});
