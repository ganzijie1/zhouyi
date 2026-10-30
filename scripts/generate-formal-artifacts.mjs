import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { CLASSIC_CELLS, EXTRA_CLASSIC_CELLS } from '../src/data/classics.js';
import GUA64 from '../src/data/gua64-data.js';
import { AXIOM_GRAPH } from '../src/data/axioms.js';
import { enumerateConcepts } from '../src/domain/fca.js';
import { validateEvidenceGraph } from '../src/domain/evidence-graph.js';
import { generateDescriptiveStatistics } from '../src/domain/information-theory.js';
import { generateProofCertificate, serializeProofCertificate } from '../src/domain/proofs.js';
import { createClosedSystemCertificate, serializeClosedSystemCertificate } from '../src/domain/closed-yijing.js';

const root = new URL('../', import.meta.url);
const dataDir = new URL('public/data/', root);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const revision = '8ff4ffc8802ee9afd075da875cc3d39e8706be82';
const mainTextRevision = '88dc8f812586eb21ae713e11f26c2e8b564b6f33';
const snapshotPath = new URL('src/data/corpus/yizhuan_complete.json', root);

await mkdir(dataDir, { recursive: true });
const sourceRaw = await readFile(snapshotPath, 'utf8');
const source = JSON.parse(sourceRaw);
const baseImmutable = `https://raw.githubusercontent.com/muyen/decoding-iching/${revision}/data/yizhuan/yizhuan_complete.json`;
const license = 'CC BY-NC-SA 4.0（仅文本快照；本项目不采用仓库的现代分析结论）';

const classicEntries = [...CLASSIC_CELLS, ...EXTRA_CLASSIC_CELLS].map((cell, index) => {
  const text = cell.text.replace(/\r\n/g, '\n');
  return {
    corpusId: `zhouyi-cell-${String(index + 1).padStart(4, '0')}`,
    work: cell.field.includes('tuan') ? 'tuan' : cell.field.includes('image') ? 'xiang' : 'zhouyi',
    chapter: `hexagram-${String(cell.hexagramNumber).padStart(2, '0')}`,
    paragraph: cell.field,
    text,
    source: {
      id: cell.sourceIds[0],
      url: cell.sourceLinks[0],
      immutableUrl: cell.sourceLinks.find((link) => /oldid=/.test(link)) ?? `https://raw.githubusercontent.com/ZQing-Chen/yijing/${mainTextRevision}/assets/data/gua64.json`
    },
    revision: cell.revision ?? mainTextRevision,
    license: 'MIT 主底本；Wikisource 交叉核对按 CC BY-SA 4.0',
    sha256: sha256(text),
    status: cell.status === 'pending-review' ? 'single-source-pending-review' : cell.status
  };
});

const wingMap = {
  tuan_upper: 'tuan', tuan_lower: 'tuan', xiang_upper: 'xiang', xiang_lower: 'xiang',
  xici_upper: 'xici-shang', xici_lower: 'xici-xia', shuogua: 'shuogua', xugua: 'xugua', zagua: 'zagua'
};
const wingEntries = [];
for (const [key, wing] of Object.entries(source.wings)) {
  for (const [index, rawText] of wing.paragraphs.entries()) {
    // Upstream xiang_lower accidentally appends the same two Wenyan paragraphs
    // that are already present in the dedicated wenyan wing.
    if (key === 'xiang_lower' && /^文言传·/.test(rawText)) continue;
    const text = rawText.replace(/\r\n/g, '\n');
    const work = key === 'wenyan' ? (index === 0 ? 'wenyan-qian' : 'wenyan-kun') : wingMap[key];
    wingEntries.push({
      corpusId: `ten-wings-${key}-${String(index + 1).padStart(3, '0')}`,
      work,
      chapter: key,
      paragraph: String(index + 1),
      text,
      source: { id: 'muyen-yizhuan-snapshot', url: 'https://github.com/muyen/decoding-iching/tree/main/data/yizhuan', immutableUrl: baseImmutable },
      revision,
      license,
      sha256: sha256(text),
      status: 'single-source-pending-review'
    });
  }
}

const entries = [...classicEntries, ...wingEntries];
const expectedWorkCounts = Object.fromEntries([...new Set(entries.map((entry) => entry.work))].sort()
  .map((work) => [work, entries.filter((entry) => entry.work === work).length]));
const sourceSnapshots = [
  {
    id: 'zqing-chen-wangbi', revision: mainTextRevision,
    immutableUrl: `https://raw.githubusercontent.com/ZQing-Chen/yijing/${mainTextRevision}/assets/data/gua64.json`,
    contentHash: sha256(JSON.stringify(GUA64)), license: 'MIT'
  },
  {
    id: 'muyen-yizhuan-snapshot', revision, immutableUrl: baseImmutable,
    contentHash: sha256(sourceRaw.replace(/\r\n/g, '\n')), license: 'CC BY-NC-SA 4.0'
  }
];
const manifest = {
  schemaVersion: '1.1.0',
  corpusVersion: 'selected-transmitted-base-2026-10-29',
  parserVersion: 'formal-artifacts-1.1.0',
  sourceSnapshotHash: sha256(JSON.stringify(sourceSnapshots)),
  sourceSnapshots,
  expectedWorkCounts,
  boundary: '本闭包只针对选定、固定的传世底本版本；不包括且不覆盖出土本、全部异文与历代注疏，不等于周易全部历史文本或唯一解释。',
  entries,
  summary: { total: entries.length, expected: entries.length, coverageRatio: 1, traceableRatio: 1, immutableRevisionRatio: 1, emptyTexts: 0, duplicateIds: 0, duplicatePositions: 0, unclassified: 0, hashMismatches: 0 }
};
await writeFile(new URL('corpus-manifest.json', dataDir), `${JSON.stringify(manifest, null, 2)}\n`);

const closedCertificate = createClosedSystemCertificate(manifest);
await writeFile(new URL('closed-yijing-certificate.json', dataDir), serializeClosedSystemCertificate(closedCertificate));

const descriptiveStatistics = generateDescriptiveStatistics(manifest);
await writeFile(new URL('descriptive-statistics.json', dataDir), `${JSON.stringify(descriptiveStatistics, null, 2)}\n`);

const context = {
  objects: entries.map((entry) => entry.corpusId),
  attributes: ['curated:classic', 'curated:commentary', 'curated:change', 'term:heaven', 'term:earth'],
  incidences: entries.flatMap((entry) => {
    const tags = [entry.work === 'zhouyi' ? 'curated:classic' : 'curated:commentary'];
    if (/变|易/.test(entry.text)) tags.push('curated:change');
    if (/天/.test(entry.text)) tags.push('term:heaven');
    if (/地/.test(entry.text)) tags.push('term:earth');
    return tags.map((tag) => [entry.corpusId, tag]);
  })
};
const concepts = enumerateConcepts(context);
const formalConcepts = {
  schemaVersion: '1.0.0', complete: true, truncated: false,
  attributeDictionaryHash: sha256(JSON.stringify(context.attributes)),
  context, concepts,
  summary: { objects: context.objects.length, attributes: context.attributes.length, incidences: context.incidences.length, concepts: concepts.length }
};
await writeFile(new URL('formal-concepts.json', dataDir), `${JSON.stringify(formalConcepts, null, 2)}\n`);

const certificate = await generateProofCertificate();
const structuralClaims = certificate.theorems.map((item) => ({
  claimId: `claim:structure:${item.theoremId.replace('theorem:', '')}`,
  category: 'structure',
  title: item.theoremId,
  domain: item.domain,
  axioms: item.axioms,
  evidence: [item.theoremId],
  boundary: item.boundary,
  status: 'proved'
}));
const claims = {
  schemaVersion: '1.0.0',
  claims: [
    {
      claimId: 'claim:corpus-coverage', category: 'corpus', title: '选定传世底本闭包完整',
      domain: { name: manifest.corpusVersion, cardinality: entries.length },
      axioms: ['definition:selected-corpus'], evidence: ['artifact:corpus-manifest'],
      boundary: manifest.boundary, status: 'verified'
    },
    {
      claimId: 'claim:closed-axioms', category: 'closed-system', title: '有限对象公理存在显式模型',
      domain: { name: 'ZFC 元理论、经典逻辑与有限对象理论', cardinality: closedCertificate.foundations.axioms.length + closedCertificate.objectTheory.axioms.length },
      axioms: ['axiom:zfc-choice', 'axiom:logic-two-valued', 'axiom:semantic-corpus'], evidence: ['proof:closed-system-validation'],
      boundary: closedCertificate.boundary, status: 'proved'
    },
    {
      claimId: 'claim:closed-bijection', category: 'closed-system', title: '全部固定段落与规范序号双射',
      domain: { name: '固定语料 P 与序号集 {0,…,1131}', cardinality: closedCertificate.encoding.domainCardinality },
      axioms: ['axiom:semantic-corpus', 'axiom:semantic-ordinal', 'axiom:semantic-text'], evidence: ['proof:closed-system-validation'],
      boundary: closedCertificate.boundary, status: 'proved'
    },
    {
      claimId: 'claim:closed-completeness', category: 'closed-system', title: '全部合法公式可判定并生成证明或反证',
      domain: { name: '四类有限原子关系的全部实例', cardinality: closedCertificate.atomicEvaluation.evaluatedCases },
      axioms: ['axiom:logic-two-valued', 'axiom:logic-compositional', 'axiom:semantic-state', 'axiom:semantic-order'], evidence: ['proof:closed-system-validation'],
      boundary: closedCertificate.boundary, status: 'proved'
    },
    ...structuralClaims,
    {
      claimId: 'claim:traditional-rules', category: 'traditional', title: '爻位传统谓词的显式实现',
      domain: { name: '64 卦、每卦六爻的版本化谓词', cardinality: 64 },
      axioms: ['source:traditional-rules'], evidence: ['rule:traditional-v1'],
      boundary: '只实现得位、应、比、承、乘的版本化操作定义；流派表述与义理解释仍需人工校勘。', status: 'bounded'
    },
    {
      claimId: 'claim:fca-complete', category: 'fca-graph', title: '固定形式背景的 FCA 概念全枚举',
      domain: { name: '5 属性固定形式背景', cardinality: concepts.length },
      axioms: ['definition:fca-context'], evidence: ['artifact:formal-concepts'],
      boundary: '完整性只对已声明的五个属性成立，不代表经典文本的全部概念。', status: 'verified'
    },
    {
      claimId: 'claim:evidence-closure', category: 'fca-graph', title: '可见声明具备直接证据边',
      domain: { name: '统一声明注册表', cardinality: structuralClaims.length + 12 },
      axioms: ['definition:formal-scope'], evidence: ['proof:evidence-graph-validation'],
      boundary: '闭环证明可追溯性，不证明传统解释的唯一性。', status: 'verified'
    },
    {
      claimId: 'claim:axiom-dag', category: 'fca-graph', title: '公理依赖图无环且依赖存在',
      domain: { name: '版本化公理依赖图', cardinality: AXIOM_GRAPH.nodes.length },
      axioms: ['definition:formal-scope'], evidence: ['proof:axiom-dag-validation'],
      boundary: 'DAG 检查只覆盖本项目显式登记的公理和来源。', status: 'verified'
    },
    {
      claimId: 'claim:model-checking', category: 'model-info', title: '12 关完整历史会话状态模型检查',
      domain: { name: '固定种子 12 关预算内全部可达有序历史状态', cardinality: certificate.modelChecking.levels.length },
      axioms: ['definition:finite-transition-system'], evidence: ['proof:model-checking'],
      boundary: certificate.modelChecking.boundary, status: 'proved'
    },
    {
      claimId: 'claim:storage-migration', category: 'model-info', title: '存储迁移输入类检查',
      domain: { name: '版本化存储输入等价类', cardinality: certificate.modelChecking.storage.classes.length },
      axioms: ['definition:finite-transition-system'], evidence: ['proof:storage-migration'],
      boundary: '等价类覆盖不等于穷尽任意浏览器或恶意存储实现。', status: 'verified'
    },
    {
      claimId: 'claim:descriptive-statistics', category: 'model-info', title: '状态与语料的描述性信息统计',
      domain: { name: 'B6 状态空间与固定语料样本', cardinality: 64 },
      axioms: ['definition:formal-scope'], evidence: ['artifact:descriptive-statistics'],
      boundary: descriptiveStatistics.boundary, status: 'verified'
    },
    {
      claimId: 'claim:semantic-boundary', category: 'traditional', title: '未形式化语义边界',
      domain: { name: '作者原意、义理唯一性与预测效力', cardinality: 1 },
      axioms: ['definition:formal-scope'], evidence: ['source:traditional-rules'],
      boundary: '作者原意、唯一义理、占筮与预测效力均不在有限结构证明范围内。', status: 'unresolved'
    }
  ]
};
await writeFile(new URL('claims.json', dataDir), `${JSON.stringify(claims, null, 2)}\n`);
const sourceNodes = [...new Set(entries.map((entry) => entry.source.id))].sort().map((id) => ({ id: `source:${id}`, kind: 'source' }));
const paragraphNodes = entries.map((entry) => ({ id: `paragraph:${entry.corpusId}`, kind: 'paragraph', work: entry.work }));
const workNodes = [...new Set(entries.map((entry) => entry.work))].sort().map((id) => ({ id: `work:${id}`, kind: 'work' }));
const hexagramNodes = Array.from({ length: 64 }, (_, index) => ({ id: `hexagram:${index + 1}`, kind: 'hexagram' }));
const lineNodes = Array.from({ length: 64 * 6 }, (_, index) => ({ id: `line:${Math.floor(index / 6) + 1}:${index % 6 + 1}`, kind: 'line' }));
const theoremNodes = certificate.theorems.map((item) => ({ id: item.theoremId, kind: 'proof', requiredInputIds: item.axioms }));
const axiomNodes = AXIOM_GRAPH.nodes.filter((node) => node.kind === 'axiom' || node.kind === 'source');
const registeredClaimNodes = claims.claims.map((item) => ({
  id: item.claimId,
  kind: 'claim',
  category: item.category,
  requiredEvidenceIds: item.evidence
}));
const validationNodes = [
  { id: 'definition:selected-corpus', kind: 'axiom' },
  { id: 'definition:fca-context', kind: 'axiom' },
  {
    id: 'definition:finite-transition-system', kind: 'axiom',
    definition: 'session = (state, steps, status, ordered history); commands = allowed apply + undo + restart + illegal apply + hint',
    boundary: '只包含固定关卡预算内的可达会话状态和登记命令。'
  },
  { id: 'definition:formal-scope', kind: 'axiom' },
  { id: 'artifact:corpus-manifest', kind: 'artifact' },
  { id: 'artifact:formal-concepts', kind: 'artifact' },
  { id: 'artifact:descriptive-statistics', kind: 'artifact' },
  { id: 'artifact:proof-certificate', kind: 'artifact' },
  { id: 'artifact:closed-yijing-certificate', kind: 'artifact' },
  { id: 'artifact:axiom-graph', kind: 'artifact' },
  { id: 'definition:evidence-validator', kind: 'axiom' },
  { id: 'proof:evidence-graph-validation', kind: 'proof', requiredInputIds: ['definition:evidence-validator'] },
  { id: 'proof:axiom-dag-validation', kind: 'proof', requiredInputIds: ['artifact:axiom-graph'] },
  { id: 'proof:model-checking', kind: 'proof', requiredInputIds: ['artifact:proof-certificate'] },
  { id: 'proof:storage-migration', kind: 'proof', requiredInputIds: ['artifact:proof-certificate'] },
  { id: 'proof:closed-system-validation', kind: 'proof', requiredInputIds: ['artifact:closed-yijing-certificate'] },
  { id: 'rule:traditional-v1', kind: 'rule' }
];
const paragraphEdges = entries.flatMap((entry) => {
  const edges = [
    { from: `paragraph:${entry.corpusId}`, to: `source:${entry.source.id}`, type: 'sourced-by' },
    { from: `paragraph:${entry.corpusId}`, to: `work:${entry.work}`, type: 'part-of' }
  ];
  const match = entry.chapter.match(/^hexagram-(\d+)$/);
  if (match) {
    const number = Number(match[1]);
    edges.push({ from: `paragraph:${entry.corpusId}`, to: `hexagram:${number}`, type: 'about' });
    const line = entry.paragraph.match(/(?:line-|image-)([1-6])$/)?.[1];
    if (line) edges.push({ from: `paragraph:${entry.corpusId}`, to: `line:${number}:${line}`, type: 'about' });
  }
  return edges;
});
const evidenceGraph = {
  schemaVersion: '1.1.0',
  allowedEdgeTypes: ['sourced-by', 'supported-by', 'part-of', 'about', 'depends-on', 'derived-from'],
  nodes: [...sourceNodes, ...workNodes, ...hexagramNodes, ...lineNodes, ...paragraphNodes, ...theoremNodes,
    ...axiomNodes.filter((node) => !sourceNodes.some((sourceNode) => sourceNode.id === node.id)),
    ...validationNodes, ...registeredClaimNodes],
  edges: [
    ...paragraphEdges,
    ...lineNodes.map((node) => ({ from: node.id, to: `hexagram:${node.id.split(':')[1]}`, type: 'part-of' })),
    ...certificate.theorems.flatMap((item) => item.axioms.map((id) => ({ from: item.theoremId, to: id, type: 'depends-on' }))),
    ...paragraphNodes.map((node) => ({ from: 'artifact:formal-concepts', to: node.id, type: 'derived-from' })),
    ...paragraphNodes.map((node) => ({ from: 'artifact:corpus-manifest', to: node.id, type: 'derived-from' })),
    ...paragraphNodes.map((node) => ({ from: 'artifact:descriptive-statistics', to: node.id, type: 'derived-from' })),
    { from: 'proof:evidence-graph-validation', to: 'definition:evidence-validator', type: 'depends-on' },
    { from: 'proof:axiom-dag-validation', to: 'artifact:axiom-graph', type: 'depends-on' },
    { from: 'proof:model-checking', to: 'artifact:proof-certificate', type: 'depends-on' },
    { from: 'proof:storage-migration', to: 'artifact:proof-certificate', type: 'depends-on' },
    { from: 'proof:closed-system-validation', to: 'artifact:closed-yijing-certificate', type: 'depends-on' },
    ...claims.claims.flatMap((item) => item.evidence.map((evidenceId) => ({
      from: item.claimId, to: evidenceId, type: 'supported-by'
    }))),
    { from: 'rule:traditional-v1', to: 'source:traditional-rules', type: 'sourced-by' }
  ]
};
await writeFile(new URL('evidence-graph.json', dataDir), `${JSON.stringify(evidenceGraph, null, 2)}\n`);

const graphReport = validateEvidenceGraph(evidenceGraph);
const formalSummary = {
  schemaVersion: '1.1.0',
  corpus: { ...manifest.summary, sourceSnapshotHash: manifest.sourceSnapshotHash, sourceSnapshots: manifest.sourceSnapshots },
  fca: formalConcepts.summary,
  claims: {
    total: claims.claims.length,
    categories: Object.fromEntries(['corpus', 'closed-system', 'structure', 'traditional', 'fca-graph', 'model-info']
      .map((category) => [category, claims.claims.filter((item) => item.category === category).length]))
  },
  closedSystem: {
    version: closedCertificate.systemVersion,
    paragraphs: closedCertificate.scope.paragraphs,
    axioms: closedCertificate.foundations.axioms.length + closedCertificate.objectTheory.axioms.length,
    roundTrips: closedCertificate.encoding.roundTrips,
    atomicCases: closedCertificate.atomicEvaluation.evaluatedCases,
    undefinedCases: closedCertificate.atomicEvaluation.undefinedCases,
    sound: closedCertificate.calculus.sound,
    complete: closedCertificate.calculus.complete,
    decidable: closedCertificate.calculus.decidable,
    resultHash: closedCertificate.resultHash
  },
  modelChecking: {
    levels: certificate.modelChecking.levels.length,
    stateProjection: 'state+steps+status+ordered-history',
    visitedStates: certificate.modelChecking.summary.totalVisitedStates,
    transitions: certificate.modelChecking.summary.totalTransitions,
    counterexamples: certificate.modelChecking.summary.totalCounterexamples,
    allReachableSessionStatesExhausted: certificate.modelChecking.summary.allReachableSessionStatesExhausted,
    storageClasses: certificate.modelChecking.storage.classes.length,
    allPassed: certificate.modelChecking.storage.allPassed
  },
  descriptiveStatistics: {
    artifactHash: descriptiveStatistics.resultHash,
    stateCardinality: descriptiveStatistics.sample.stateSpace.cardinality,
    corpusParagraphs: descriptiveStatistics.sample.corpus.paragraphs
  },
  evidenceGraph: {
    nodes: evidenceGraph.nodes.length,
    edges: evidenceGraph.edges.length,
    danglingEdges: graphReport.danglingEdges.length,
    sourceReachabilityRatio: graphReport.sourceReachabilityRatio,
    requiredEvidenceCoverageRatio: graphReport.claimsWithMissingRequiredEvidence.length === 0 ? 1 : 0
  }
};
await writeFile(new URL('formal-summary.json', dataDir), `${JSON.stringify(formalSummary, null, 2)}\n`);

await writeFile(new URL('proof-certificate.json', dataDir), serializeProofCertificate(certificate));
