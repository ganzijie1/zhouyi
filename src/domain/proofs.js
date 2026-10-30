import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { AXIOM_GRAPH } from '../data/axioms.js';
import { KING_WEN_ORDER } from '../data/hexagrams.js';
import {
  combineTrigrams, complement, getLine, hammingDistance, join, meet,
  q6Neighbors, reverseLines, splitTrigrams, xor
} from './lattice.js';
import { kleinOrbit, linePositionFacts, nuclearHexagram, RULE_VERSION } from './relations.js';
import { modelCheckLevels, modelCheckStorageSchemas } from './model-checker.js';
import { createLevels, replayActions, shortestActionPath } from './solver.js';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const stable = (value) => JSON.stringify(value, null, 2);
const flips = Array.from({ length: 6 }, (_, line) => ({ type: 'flip', line }));

function theorem(theoremId, name, cardinality, axioms, evaluator, boundary) {
  const counterexamples = [];
  let totalFailures = 0;
  for (let input = 0; input < cardinality; input++) {
    if (!evaluator(input)) {
      totalFailures++;
      if (counterexamples.length < 16) counterexamples.push(input);
    }
  }
  const core = {
    theoremId,
    family: 'structure',
    domain: { name, cardinality },
    axioms,
    evaluatorHash: sha256(evaluator.toString()),
    status: totalFailures ? 'counterexample' : 'proved',
    evaluatedInputs: cardinality,
    totalFailures,
    counterexamples,
    counterexamplesTruncated: totalFailures > counterexamples.length,
    boundary
  };
  return { ...core, resultHash: sha256(stable(core)) };
}

async function inputHashes() {
  const sourceUrls = ['proofs.js', 'lattice.js', 'relations.js', 'solver.js', 'model-checker.js', 'information-theory.js']
    .map((name) => new URL(name, import.meta.url));
  const [sources, corpus] = await Promise.all([
    Promise.all(sourceUrls.map((url) => readFile(url))),
    readFile(new URL('../../public/data/corpus-manifest.json', import.meta.url)).catch(() => Buffer.from('corpus-manifest-not-yet-generated'))
  ]);
  return {
    algorithmSources: sha256(Buffer.concat(sources)),
    axioms: sha256(stable(AXIOM_GRAPH)),
    relations: sha256(stable({ ruleVersion: RULE_VERSION, sources: sources.slice(1, 3).map((value) => sha256(value)) })),
    corpusManifest: sha256(corpus)
  };
}

export async function generateProofCertificate() {
  const boundary = '仅证明显式公理下的有限结构命题；不证明唯一语义或作者原意，也不可推出占筮或预测效力。';
  const theorems = [
    theorem('theorem:b6-involutions', 'B6 的 64 个状态', 64, ['axiom:b6', 'axiom:bit-order', 'axiom:complement', 'axiom:reverse'], (x) => (
      complement(complement(x)) === x
      && reverseLines(reverseLines(x)) === x
      && complement(reverseLines(x)) === reverseLines(complement(x))
    ), boundary),
    theorem('theorem:pair-lattice-laws', 'B6×B6 的 4096 个有序对', 4096, ['axiom:b6', 'axiom:bitwise-lattice', 'axiom:hamming'], (x) => {
      const a = x >> 6; const b = x & 63;
      return join(a, b) === join(b, a)
        && meet(a, b) === meet(b, a)
        && join(a, a) === a && meet(a, a) === a
        && join(a, meet(a, b)) === a && meet(a, join(a, b)) === a
        && meet(a, complement(a)) === 0 && join(a, complement(a)) === 63
        && complement(join(a, b)) === meet(complement(a), complement(b))
        && complement(meet(a, b)) === join(complement(a), complement(b))
        && hammingDistance(a, b) === hammingDistance(b, a);
    }, boundary),
    theorem('theorem:triple-distributive-lattice', 'B6³ 的 262144 个有序三元组', 262144, ['axiom:b6', 'axiom:bitwise-lattice'], (x) => {
      const a = x >> 12; const b = (x >> 6) & 63; const c = x & 63;
      return join(join(a, b), c) === join(a, join(b, c))
        && meet(meet(a, b), c) === meet(a, meet(b, c))
        && meet(a, join(b, c)) === join(meet(a, b), meet(a, c))
        && join(a, meet(b, c)) === meet(join(a, b), join(a, c));
    }, boundary),
    theorem('theorem:hamming-bfs', 'Q6 上 4096 个有序点对', 4096, ['axiom:b6', 'axiom:hamming', 'axiom:single-line-edge'], (x) => {
      const start = x >> 6; const target = x & 63;
      const path = shortestActionPath(start, target, flips);
      return path.length === hammingDistance(start, target) && replayActions(start, path) === target;
    }, boundary),
    theorem('theorem:b3-product', 'B3×B3 的 64 个状态', 64, ['axiom:trigram-split'], (x) => {
      const pair = splitTrigrams(x);
      return combineTrigrams(pair.lower, pair.upper) === x;
    }, boundary),
    theorem('theorem:q6-neighborhood', 'Q6 的 64 个顶点', 64, ['axiom:single-line-edge'], (x) => (
      new Set(q6Neighbors(x)).size === 6
      && q6Neighbors(x).every((next) => hammingDistance(x, next) === 1)
    ), boundary),
    theorem('theorem:klein-action', '错综作用的 64 个状态', 64, ['axiom:complement', 'axiom:reverse'], (x) => {
      const orbit = kleinOrbit(x);
      return [1, 2, 4].includes(orbit.length)
        && orbit.every((state) => state >= 0 && state < 64)
        && orbit.includes(x) && orbit.includes(complement(x)) && orbit.includes(reverseLines(x));
    }, boundary),
    theorem('theorem:nuclear-domain', '互卦映射的 64 个状态', 64, ['axiom:nuclear-lines'], (x) => {
      const value = nuclearHexagram(x);
      return value.state === (((x >> 1) & 7) | (((x >> 2) & 7) << 3))
        && value.sourceLines.lower.join() === '2,3,4'
        && value.sourceLines.upper.join() === '3,4,5';
    }, boundary),
    theorem('theorem:transformed-xor', '变爻 XOR 的 64 个掩码', 64, ['axiom:xor'], (x) => (
      xor(xor(0, x), x) === 0 && xor(0, x) === x
    ), boundary),
    theorem('theorem:king-wen-permutation', '文王序的 64 个位置', 64, ['source:king-wen-order'], (position) => {
      const state = KING_WEN_ORDER[position];
      return Number.isInteger(state) && state >= 0 && state < 64
        && KING_WEN_ORDER.indexOf(state) === position && new Set(KING_WEN_ORDER).size === 64;
    }, boundary),
    theorem('theorem:trigram-matrix', '上下卦矩阵的 64 个格位', 64, ['axiom:trigram-split'], (x) => {
      const { lower, upper } = splitTrigrams(x);
      return lower < 8 && upper < 8 && combineTrigrams(lower, upper) === x;
    }, boundary),
    theorem('theorem:line-predicates', '爻位谓词的 64 个状态', 64, ['axiom:bit-order', 'source:traditional-rules'], (x) => {
      const facts = linePositionFacts(x);
      return facts.length === 6 && facts.every((fact, index) => {
        const position = index + 1;
        const yang = getLine(x, index) === 1;
        const realm = position <= 2 ? 'earth' : position <= 4 ? 'human' : 'heaven';
        return fact.position === position
          && fact.polarity === (yang ? 'yang' : 'yin')
          && fact.proper === (yang === (position % 2 === 1))
          && fact.realm === realm;
      });
    }, boundary)
  ];
  const levels = createLevels(20261029);
  const checkedLevels = modelCheckLevels(levels);
  const storage = modelCheckStorageSchemas();
  const modelCore = {
    algorithmVersion: 'complete-history-session-model-checker-2.0.0',
    seed: 20261029,
    inputDomain: {
      state: 'B6 = {0,1}^6',
      stateCardinality: 64,
      levelCount: levels.length,
      sessionState: '(state, steps, status, ordered history)',
      commands: 'all allowed apply actions + undo + restart + illegal apply + hint',
      storageInputClasses: storage.classes.map((item) => item.id)
    },
    inputHash: sha256(stable({
      levels,
      storageInputClasses: storage.classes.map(({ id, inputHash }) => ({ id, inputHash }))
    })),
    levels: checkedLevels.levels.map((item, index) => ({
      ...item,
      budget: levels[index].budget,
      start: levels[index].start,
      target: levels[index].target,
      allowedActions: levels[index].allowedActions
    })),
    summary: checkedLevels.summary,
    storage,
    boundary: '完整穷举固定 12 关预算内所有可达有序历史会话状态及登记命令；不把 state+remainingBudget 当作撤销语义的等价约简，也不覆盖浏览器、计时或未登记命令。'
  };
  const modelChecking = { ...modelCore, resultHash: sha256(stable(modelCore)) };
  const descriptiveArtifact = JSON.parse(await readFile(
    new URL('../../public/data/descriptive-statistics.json', import.meta.url), 'utf8'
  ));
  const base = {
    schemaVersion: '1.3.0',
    algorithmVersion: 'finite-enumerator-1.3.0',
    inputHashes: await inputHashes(),
    coverage: ['B6', 'B3xB3', 'Q6', 'hamming-bfs', 'klein', 'nuclear', 'transformed', 'king-wen', 'trigram-matrix', 'line-predicates'],
    boundary,
    claims: ['固定源码、固定输入与显式公理内的有限状态结构穷举'],
    theorems,
    modelChecking,
    descriptiveStatistics: {
      artifact: '/data/descriptive-statistics.json',
      artifactHash: descriptiveArtifact.resultHash,
      inputHash: descriptiveArtifact.inputHash,
      boundary: descriptiveArtifact.boundary
    }
  };
  return { ...base, resultHash: sha256(stable(base)) };
}

export function serializeProofCertificate(value) { return `${stable(value)}\n`; }

export function validateProofCertificate(value) {
  const errors = [];
  const { resultHash, ...base } = value;
  if (resultHash !== sha256(stable(base))) errors.push('证书总哈希失配');
  if (!value.inputHashes || Object.values(value.inputHashes).some((hash) => !/^[a-f0-9]{64}$/.test(hash))) errors.push('输入哈希无效');
  const theoremIds = new Set();
  for (const item of value.theorems ?? []) {
    if (theoremIds.has(item.theoremId)) errors.push(`重复 theorem ID: ${item.theoremId}`);
    theoremIds.add(item.theoremId);
    const { resultHash: theoremHash, ...theoremCore } = item;
    if (theoremHash !== sha256(stable(theoremCore))) errors.push(`命题哈希失配: ${item.theoremId}`);
    if (item.evaluatedInputs !== item.domain?.cardinality) errors.push(`未全域评估: ${item.theoremId}`);
    if (item.totalFailures !== item.counterexamples.length && !item.counterexamplesTruncated) errors.push(`反例计数不一致: ${item.theoremId}`);
    if ((item.status === 'proved') !== (item.totalFailures === 0)) errors.push(`证明状态不一致: ${item.theoremId}`);
    if (!/^[a-f0-9]{64}$/.test(item.evaluatorHash ?? '')) errors.push(`求值器哈希缺失: ${item.theoremId}`);
  }
  const { resultHash: modelHash, ...modelCore } = value.modelChecking ?? {};
  const expectedLevels = createLevels(value.modelChecking?.seed);
  const expectedModelCheck = modelCheckLevels(expectedLevels);
  if (value.modelChecking?.algorithmVersion !== 'complete-history-session-model-checker-2.0.0') errors.push('model exhaustive history algorithm version mismatch');
  if (!/^[a-f0-9]{64}$/.test(value.modelChecking?.inputHash ?? '')) errors.push('model input hash missing');
  const expectedModelInputHash = sha256(stable({
    levels: expectedLevels,
    storageInputClasses: (value.modelChecking?.storage?.classes ?? []).map(({ id, inputHash }) => ({ id, inputHash }))
  }));
  if (value.modelChecking?.inputHash !== expectedModelInputHash) errors.push('model input hash mismatch');
  for (const [index, item] of (value.modelChecking?.levels ?? []).entries()) {
    if (stable(item) !== stable(expectedModelCheck.levels[index])) errors.push(`model exhaustive history mismatch: ${item.level}`);
    const { resultHash: levelHash, ...levelCore } = item;
    if (levelHash !== sha256(stable(levelCore))) errors.push(`model level result hash mismatch: ${item.level}`);
    if (item.inputHash !== sha256(stable(expectedLevels[index]))) errors.push(`model level input hash mismatch: ${item.level}`);
    if (!item.reachable || item.shortestSteps > item.budget) errors.push(`model level is not reachable within budget: ${item.level}`);
    if (!Object.values(item.invariants ?? {}).every(Boolean)) errors.push(`model invariant failed: ${item.level}`);
    if (item.visitedStates > item.theoreticalUpperBound) errors.push(`model state bound exceeded: ${item.level}`);
    if (item.stateProjection !== 'state+steps+status+ordered-history') errors.push(`model history projection missing: ${item.level}`);
    if (item.transitionCount !== item.visitedStates * ((item.allowedActions?.length ?? 0) + 4)) errors.push(`model commands are not exhaustive: ${item.level}`);
    if (!Object.values(item.invariantChecks ?? {}).every((check) => check.failures === 0 && check.counterexamples?.length === 0)) errors.push(`model counterexample set is non-empty: ${item.level}`);
  }
  if ((value.modelChecking?.storage?.classes?.length ?? 0) !== 7) errors.push('storage input classes are incomplete');
  for (const item of value.modelChecking?.storage?.classes ?? []) {
    if (item.inputHash !== sha256(stable(item.input))) errors.push(`storage input hash mismatch: ${item.id}`);
    if (item.outputHash !== sha256(stable(item.output))) errors.push(`storage output hash mismatch: ${item.id}`);
    if (!item.passed) errors.push(`storage input class failed: ${item.id}`);
  }
  if (modelHash !== sha256(stable(modelCore))) errors.push('模型检查哈希失配');
  if (stable(value.modelChecking?.summary) !== stable(expectedModelCheck.summary)) errors.push('model exhaustive history summary mismatch');
  if ((value.modelChecking?.levels?.length ?? 0) !== 12) errors.push('模型检查关卡不完整');
  if (!value.modelChecking?.summary?.allReachableSessionStatesExhausted) errors.push('可达会话状态未穷尽');
  if (value.modelChecking?.summary?.totalCounterexamples !== 0) errors.push('模型检查存在反例');
  if (!value.modelChecking?.storage?.allPassed) errors.push('存储迁移检查未通过');
  if (!/^[a-f0-9]{64}$/.test(value.descriptiveStatistics?.artifactHash ?? '')) errors.push('描述性统计产物哈希缺失');
  return { valid: errors.length === 0, errors };
}
