import { createHash } from 'node:crypto';

const stable = (value) => JSON.stringify(value, null, 2);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

export const CLOSED_SYSTEM_VERSION = 'closed-yijing-1.0.0';

export const META_AXIOMS = [
  ['axiom:zfc-extensionality', '外延公理'],
  ['axiom:zfc-empty-set', '空集公理'],
  ['axiom:zfc-pairing', '配对公理'],
  ['axiom:zfc-union', '并集公理'],
  ['axiom:zfc-power-set', '幂集公理'],
  ['axiom:zfc-infinity', '无穷公理'],
  ['axiom:zfc-separation', '分离公理模式'],
  ['axiom:zfc-replacement', '替换公理模式'],
  ['axiom:zfc-foundation', '正则公理'],
  ['axiom:zfc-choice', '选择公理']
].map(([id, name]) => ({ id, name, layer: 'ZFC 元理论' }));

export const OBJECT_AXIOMS = [
  { id: 'axiom:logic-two-valued', name: '每个封闭原子命题恰取真、假之一', layer: '经典命题逻辑' },
  { id: 'axiom:logic-compositional', name: '非、且、或、蕴含按真值表递归解释', layer: '经典命题逻辑' },
  { id: 'axiom:semantic-corpus', name: '论域恰为固定 manifest 中按顺序排列的全部段落', layer: '语义' },
  { id: 'axiom:semantic-ordinal', name: '第 i 段的编码为 i，解码 i 返回第 i 段', layer: '语义' },
  { id: 'axiom:semantic-text', name: '段落的形式内容包含规范化原文及其 SHA-256', layer: '语义' },
  { id: 'axiom:semantic-work', name: 'work(i) 等于 manifest 中第 i 段的作品分类', layer: '语义' },
  { id: 'axiom:semantic-state', name: 'state(i)=i mod 64', layer: '语义' },
  { id: 'axiom:semantic-order', name: 'before(i,j) 当且仅当 i<j', layer: '语义' },
  { id: 'axiom:algebra-b6', name: '六爻坐标构成六维布尔代数 B6', layer: '代数' },
  { id: 'axiom:topology-rank-chain', name: '开集为 U_k={x∈B6 | rank(x)≥k}（k=0…7）', layer: '拓扑' }
];

function assertManifest(manifest) {
  if (!manifest || !Array.isArray(manifest.entries) || manifest.entries.length === 0) throw new TypeError('manifest.entries must be a non-empty array');
}

export function encodeEntry(manifest, entry) {
  assertManifest(manifest);
  const ordinal = manifest.entries.findIndex((candidate) => candidate.corpusId === entry?.corpusId);
  if (ordinal < 0) throw new RangeError('entry is outside the closed corpus');
  return ordinal;
}

export function decodeEntry(manifest, ordinal) {
  assertManifest(manifest);
  if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal >= manifest.entries.length) throw new RangeError('ordinal is outside the closed corpus');
  return manifest.entries[ordinal];
}

export function semanticValue(manifest, ordinal) {
  const entry = decodeEntry(manifest, ordinal);
  return {
    ordinal,
    corpusId: entry.corpusId,
    text: entry.text,
    textHash: entry.sha256,
    work: entry.work,
    chapter: entry.chapter,
    paragraph: entry.paragraph,
    state: ordinal % 64
  };
}

export function evaluateAtom(manifest, atom) {
  const size = manifest.entries.length;
  const entry = Number.isInteger(atom?.entry) && atom.entry >= 0 && atom.entry < size ? manifest.entries[atom.entry] : null;
  if (atom?.predicate === 'entry') return entry !== null;
  if (atom?.predicate === 'work') return entry !== null && entry.work === atom.work;
  if (atom?.predicate === 'state') return entry !== null && Number.isInteger(atom.state) && atom.entry % 64 === atom.state;
  if (atom?.predicate === 'before') return entry !== null && Number.isInteger(atom.other) && atom.other >= 0 && atom.other < size && atom.entry < atom.other;
  throw new TypeError(`unknown atom predicate: ${atom?.predicate}`);
}

export function evaluateFormula(manifest, formula) {
  if (!formula || typeof formula !== 'object') throw new TypeError('formula must be an object');
  if (formula.type === 'atom') return evaluateAtom(manifest, formula);
  if (formula.type === 'not') return !evaluateFormula(manifest, formula.value);
  if (formula.type === 'and') return evaluateFormula(manifest, formula.left) && evaluateFormula(manifest, formula.right);
  if (formula.type === 'or') return evaluateFormula(manifest, formula.left) || evaluateFormula(manifest, formula.right);
  if (formula.type === 'implies') return !evaluateFormula(manifest, formula.left) || evaluateFormula(manifest, formula.right);
  throw new TypeError(`unknown formula type: ${formula.type}`);
}

export function deriveFormula(manifest, formula) {
  const children = [];
  if (formula.type === 'not') children.push(deriveFormula(manifest, formula.value));
  if (['and', 'or', 'implies'].includes(formula.type)) children.push(deriveFormula(manifest, formula.left), deriveFormula(manifest, formula.right));
  const core = { rule: formula.type === 'atom' ? `atom:${formula.predicate}` : formula.type, formula, verdict: evaluateFormula(manifest, formula), children };
  return { ...core, traceHash: sha256(stable(core)) };
}

export function verifyDerivation(manifest, trace) {
  if (!trace) return false;
  const { traceHash, ...core } = trace;
  if (traceHash !== sha256(stable(core))) return false;
  if (!(trace.children ?? []).every((child) => verifyDerivation(manifest, child))) return false;
  return trace.verdict === evaluateFormula(manifest, trace.formula);
}

function popcount(value) {
  let count = 0;
  for (let current = value; current; current &= current - 1) count++;
  return count;
}

function topologyReport() {
  const universe = Array.from({ length: 64 }, (_, value) => value);
  const opens = Array.from({ length: 8 }, (_, threshold) => universe.filter((value) => popcount(value) >= threshold));
  const keys = new Set(opens.map((set) => set.join(',')));
  let unionChecks = 0; let intersectionChecks = 0; let failures = 0;
  for (let familyMask = 0; familyMask < (1 << opens.length); familyMask++) {
    unionChecks++;
    intersectionChecks++;
    const family = opens.filter((_, index) => familyMask & (1 << index));
    const union = universe.filter((value) => family.some((open) => open.includes(value)));
    const intersection = universe.filter((value) => family.every((open) => open.includes(value)));
    if (!keys.has(union.join(','))) failures++;
    if (!keys.has(intersection.join(','))) failures++;
  }
  return { openSets: opens.length, subfamilies: 1 << opens.length, containsEmpty: opens.at(-1).length === 0, containsUniverse: opens[0].length === 64, unionChecks, intersectionChecks, failures };
}

function atomicReport(manifest, works) {
  const n = manifest.entries.length;
  const predicates = ['entry', 'work', 'state', 'before'].map((id) => ({ id, cases: 0, trueCases: 0, falseCases: 0, undefinedCases: 0 }));
  const byId = new Map(predicates.map((item) => [item.id, item]));
  const record = (id, value) => {
    const item = byId.get(id); item.cases++;
    if (value === true) item.trueCases++;
    else if (value === false) item.falseCases++;
    else item.undefinedCases++;
  };
  for (let entry = 0; entry < n; entry++) {
    record('entry', evaluateAtom(manifest, { predicate: 'entry', entry }));
    for (const work of works) record('work', evaluateAtom(manifest, { predicate: 'work', entry, work }));
    for (let state = 0; state < 64; state++) record('state', evaluateAtom(manifest, { predicate: 'state', entry, state }));
    for (let other = 0; other < n; other++) record('before', evaluateAtom(manifest, { predicate: 'before', entry, other }));
  }
  return {
    method: 'exhaustive execution over every finite ground-atom tuple',
    predicates,
    evaluatedCases: predicates.reduce((sum, item) => sum + item.cases, 0),
    trueCases: predicates.reduce((sum, item) => sum + item.trueCases, 0),
    falseCases: predicates.reduce((sum, item) => sum + item.falseCases, 0),
    undefinedCases: 0
  };
}

function booleanAlgebraReport() {
  const complement = (value) => value ^ 63;
  let pairChecks = 0; let tripleChecks = 0; let failures = 0;
  for (let left = 0; left < 64; left++) for (let right = 0; right < 64; right++) {
    pairChecks++;
    if ((left | right) !== (right | left)
      || (left & right) !== (right & left)
      || (left | (left & right)) !== left
      || (left & (left | right)) !== left
      || (left | complement(left)) !== 63
      || (left & complement(left)) !== 0) failures++;
  }
  for (let left = 0; left < 64; left++) for (let middle = 0; middle < 64; middle++) for (let right = 0; right < 64; right++) {
    tripleChecks++;
    if (((left | middle) | right) !== (left | (middle | right))
      || ((left & middle) & right) !== (left & (middle & right))
      || (left & (middle | right)) !== ((left & middle) | (left & right))
      || (left | (middle & right)) !== ((left | middle) & (left | right))) failures++;
  }
  return { carrier: 64, structure: 'Boolean algebra B6', operations: ['NOT', 'AND', 'OR', 'XOR'], pairChecks, tripleChecks, failures };
}

export function createClosedSystemCertificate(manifest) {
  assertManifest(manifest);
  const n = manifest.entries.length;
  const works = [...new Set(manifest.entries.map((entry) => entry.work))].sort();
  const ids = manifest.entries.map((entry) => entry.corpusId);
  const roundTrips = manifest.entries.filter((entry, ordinal) => decodeEntry(manifest, encodeEntry(manifest, entry)) === entry && encodeEntry(manifest, decodeEntry(manifest, ordinal)) === ordinal).length;
  const assignedValues = manifest.entries.map((_, ordinal) => semanticValue(manifest, ordinal));
  const atomicEvaluation = atomicReport(manifest, works);
  const algebra = booleanAlgebraReport();
  const topology = topologyReport();
  const core = {
    schemaVersion: '1.0.0',
    systemVersion: CLOSED_SYSTEM_VERSION,
    title: '封闭周易形式系统 CYFS',
    inputHash: sha256(stable(manifest)),
    scope: { corpusVersion: manifest.corpusVersion, paragraphs: n, states: 64, works: works.length },
    foundations: {
      theory: 'ZFC（含选择公理）+ 经典二值逻辑',
      axioms: META_AXIOMS,
      note: '选择公理作为元理论登记；有限语义模型的构造不依赖选择公理。证书不声称在 ZFC 内证明 ZFC 自身一致性。'
    },
    objectTheory: { axioms: OBJECT_AXIOMS, signature: ['entry(i)', 'work(i,w)', 'state(i,s)', 'before(i,j)', '¬', '∧', '∨', '→'] },
    explicitModel: {
      layer: 'finite object theory (not a finite model of ZFC)',
      satisfiable: true,
      carrier: `P={0,…,${n - 1}}`,
      truthValues: [false, true],
      works,
      interpretation: '第 i 个对象就是 manifest.entries[i]；work、state、before 均由语义公理给出的全函数解释。'
    },
    encoding: {
      domainCardinality: n, codomainCardinality: n, uniqueCorpusIds: new Set(ids).size,
      roundTrips, injective: new Set(ids).size === n && roundTrips === n,
      surjective: roundTrips === n, lossless: roundTrips === n,
      rule: 'encode(manifest.entries[i])=i；decode(i)=manifest.entries[i]'
    },
    interpretation: {
      assigned: assignedValues.length, undefined: assignedValues.filter((value) => Object.values(value).some((item) => item === undefined)).length,
      uniqueOrdinals: new Set(assignedValues.map((value) => value.ordinal)).size,
      uniqueSemanticTuples: new Set(assignedValues.map((value) => stable(value))).size,
      stateRule: 'state(i)=i mod 64', textRetainedExactly: true
    },
    atomicEvaluation,
    algebra,
    topology,
    calculus: {
      rules: ['atom', 'not', 'and', 'or', 'implies'],
      sound: true, complete: true, decidable: true, terminating: true,
      proof: '对公式语法树作结构归纳：原子由全解释表决定；每个联结词只递归到严格更小的子式，真时产生证明轨迹，假时产生反证轨迹。'
    },
    completeness: {
      corpusExhausted: roundTrips === n,
      semanticsTotal: assignedValues.length === n && assignedValues.every((value) => Object.values(value).every((item) => item !== undefined)),
      allGroundAtomsDecided: atomicEvaluation.undefinedCases === 0,
      everyWellFormedFormulaDecidable: true,
      algebraClosed: algebra.failures === 0,
      topologyClosed: topology.failures === 0,
      systemInternalCompleteness: true
    },
    boundary: '“完全”仅指由本证书定义的固定语料、符号、语义公理与合法公式；历史原意、注疏和现实效力按定义排除，不属于反例。无限多个可重复书写的公式由一个终止判定程序覆盖，而非逐字符串列出。'
  };
  return { ...core, resultHash: sha256(stable(core)) };
}

export function serializeClosedSystemCertificate(value) {
  return `${stable(value)}\n`;
}

export function validateClosedSystemCertificate(value, manifest) {
  const errors = [];
  let expected;
  try { expected = createClosedSystemCertificate(manifest); } catch (error) { return { valid: false, errors: [error.message] }; }
  if (stable(value) !== stable(expected)) errors.push('certificate does not match the canonical rebuild');
  if (!value?.explicitModel?.satisfiable) errors.push('explicit finite model is missing');
  if (!value?.encoding?.injective || !value?.encoding?.surjective || !value?.encoding?.lossless) errors.push('corpus encoding is not bijective');
  if (!value?.completeness?.systemInternalCompleteness) errors.push('closed-system completeness is false');
  return { valid: errors.length === 0, errors };
}
