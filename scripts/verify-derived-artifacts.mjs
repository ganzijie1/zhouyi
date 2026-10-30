import { readFile } from 'node:fs/promises';
import { generateProofCertificate, serializeProofCertificate, validateProofCertificate } from '../src/domain/proofs.js';
import { validateFormalContext } from '../src/domain/fca.js';
import { validateAxiomGraph, validateEvidenceGraph } from '../src/domain/evidence-graph.js';
import {
  generateDescriptiveStatistics,
  serializeDescriptiveStatistics,
  validateDescriptiveStatistics
} from '../src/domain/information-theory.js';
import { AXIOM_GRAPH } from '../src/data/axioms.js';
import { createClosedSystemCertificate, serializeClosedSystemCertificate, validateClosedSystemCertificate } from '../src/domain/closed-yijing.js';

const read = async (name) => JSON.parse(await readFile(new URL(`../public/data/${name}`, import.meta.url), 'utf8'));
const certificate = await read('proof-certificate.json');
const concepts = await read('formal-concepts.json');
const graph = await read('evidence-graph.json');
const summary = await read('formal-summary.json');
const claims = await read('claims.json');
const statistics = await read('descriptive-statistics.json');
const manifest = await read('corpus-manifest.json');
const closedCertificate = await read('closed-yijing-certificate.json');
const rebuilt = serializeProofCertificate(await generateProofCertificate());
const checkedIn = await readFile(new URL('../public/data/proof-certificate.json', import.meta.url), 'utf8');
const proofReport = validateProofCertificate(certificate);
const fcaReport = validateFormalContext(concepts);
const graphReport = validateEvidenceGraph(graph);
const axiomReport = validateAxiomGraph(AXIOM_GRAPH);
const statisticsReport = validateDescriptiveStatistics(statistics);
const rebuiltStatistics = serializeDescriptiveStatistics(generateDescriptiveStatistics(manifest));
const checkedInStatistics = await readFile(new URL('../public/data/descriptive-statistics.json', import.meta.url), 'utf8');
const closedReport = validateClosedSystemCertificate(closedCertificate, manifest);
const rebuiltClosed = serializeClosedSystemCertificate(createClosedSystemCertificate(manifest));
const checkedInClosed = await readFile(new URL('../public/data/closed-yijing-certificate.json', import.meta.url), 'utf8');
if (!proofReport.valid || rebuilt !== checkedIn) throw new Error(`证明证书不可复现: ${proofReport.errors?.join('; ') ?? ''}`);
if (!fcaReport.valid) throw new Error(`FCA 产物无效: ${fcaReport.errors.join('; ')}`);
if (!graphReport.valid) throw new Error(`证据图谱无效: ${JSON.stringify(graphReport)}`);
if (!axiomReport.valid) throw new Error(`公理依赖图无效: ${JSON.stringify(axiomReport)}`);
if (!statisticsReport.valid) throw new Error(`描述性统计无效: ${statisticsReport.errors.join('; ')}`);
if (rebuiltStatistics !== checkedInStatistics) throw new Error('descriptive statistics do not match an independent rebuild from corpus-manifest.json');
if (!closedReport.valid || rebuiltClosed !== checkedInClosed) throw new Error(`封闭周易证书不可复现: ${closedReport.errors.join('; ')}`);
const graphNodes = new Map(graph.nodes.map((node) => [node.id, node]));
const evidenceEdges = new Set(graph.edges.filter((edge) => edge.type === 'supported-by').map((edge) => `${edge.from}\u0000${edge.to}`));
const allowedCategories = new Set(['corpus', 'closed-system', 'structure', 'traditional', 'fca-graph', 'model-info']);
const allowedStatuses = new Set(['proved', 'verified', 'bounded', 'unresolved']);
const claimIds = new Set();
if (claims.claims.length !== 24) throw new Error(`claim registry must contain exactly 24 claims, received ${claims.claims.length}`);
for (const claim of claims.claims) {
  if (!claim.claimId || claimIds.has(claim.claimId)) throw new Error(`duplicate or missing claim id: ${claim.claimId}`);
  claimIds.add(claim.claimId);
  if (!allowedCategories.has(claim.category) || !allowedStatuses.has(claim.status)) throw new Error(`invalid claim category/status: ${claim.claimId}`);
  if (!claim.title?.trim() || !claim.boundary?.trim()) throw new Error(`claim title/boundary is empty: ${claim.claimId}`);
  if (!claim.domain?.name || !Number.isInteger(claim.domain.cardinality) || claim.domain.cardinality <= 0) throw new Error(`invalid claim domain: ${claim.claimId}`);
  if (!Array.isArray(claim.axioms) || claim.axioms.length === 0 || !Array.isArray(claim.evidence) || claim.evidence.length === 0) throw new Error(`claim contract is incomplete: ${claim.claimId}`);
  const node = graphNodes.get(claim.claimId);
  if (node?.kind !== 'claim') throw new Error(`声明未登记到证据图谱: ${claim.claimId}`);
  for (const evidence of claim.evidence) if (!evidenceEdges.has(`${claim.claimId}\u0000${evidence}`)) throw new Error(`声明缺少直接证据边: ${claim.claimId} -> ${evidence}`);
}
if (certificate.descriptiveStatistics.artifactHash !== statistics.resultHash) throw new Error('描述性统计与证书哈希不一致');
const categoryCounts = Object.fromEntries([...allowedCategories].map((category) => [category, claims.claims.filter((claim) => claim.category === category).length]));
if (JSON.stringify(categoryCounts) !== JSON.stringify({ corpus: 1, 'closed-system': 3, structure: 12, traditional: 2, 'fca-graph': 3, 'model-info': 3 })) {
  throw new Error(`claim categories are incomplete: ${JSON.stringify(categoryCounts)}`);
}
for (const theorem of certificate.theorems) {
  const claim = claims.claims.find((item) => item.claimId === `claim:structure:${theorem.theoremId.replace('theorem:', '')}`);
  if (!claim || claim.title !== theorem.theoremId || claim.status !== 'proved'
    || JSON.stringify(claim.domain) !== JSON.stringify(theorem.domain)
    || JSON.stringify(claim.axioms) !== JSON.stringify(theorem.axioms)
    || JSON.stringify(claim.evidence) !== JSON.stringify([theorem.theoremId])
    || claim.boundary !== theorem.boundary) throw new Error(`structural claim does not match certificate theorem: ${theorem.theoremId}`);
}
const expectedCardinalities = new Map([
  ['claim:corpus-coverage', manifest.entries.length],
  ['claim:closed-axioms', closedCertificate.foundations.axioms.length + closedCertificate.objectTheory.axioms.length],
  ['claim:closed-bijection', manifest.entries.length],
  ['claim:closed-completeness', closedCertificate.atomicEvaluation.evaluatedCases],
  ['claim:fca-complete', concepts.concepts.length],
  ['claim:evidence-closure', claims.claims.length],
  ['claim:axiom-dag', AXIOM_GRAPH.nodes.length],
  ['claim:model-checking', certificate.modelChecking.levels.length],
  ['claim:storage-migration', certificate.modelChecking.storage.classes.length],
  ['claim:descriptive-statistics', statistics.sample.stateSpace.cardinality]
]);
for (const [claimId, cardinality] of expectedCardinalities) {
  if (claims.claims.find((claim) => claim.claimId === claimId)?.domain.cardinality !== cardinality) {
    throw new Error(`claim cardinality does not match its artifact: ${claimId}`);
  }
}
if (summary.corpus.total !== concepts.context.objects.length
  || summary.fca.concepts !== concepts.concepts.length
  || summary.evidenceGraph.nodes !== graph.nodes.length
  || summary.evidenceGraph.edges !== graph.edges.length
  || summary.evidenceGraph.danglingEdges !== graphReport.danglingEdges.length
  || summary.claims.total !== claims.claims.length
  || summary.closedSystem.resultHash !== closedCertificate.resultHash
  || summary.closedSystem.undefinedCases !== 0) {
  throw new Error('形式摘要与完整产物计数不一致');
}
console.log('派生产物校验通过：真实输入哈希绑定，证明证书字节一致，FCA 完整，证据图谱与公理 DAG 闭合。');
