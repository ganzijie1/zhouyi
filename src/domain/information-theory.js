import { createHash } from 'node:crypto';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const stable = (value) => JSON.stringify(value, null, 2);

function entropy(counts) {
  const total = counts.reduce((sum, count) => sum + count, 0);
  return counts.reduce((result, count) => {
    if (count === 0) return result;
    const probability = count / total;
    return result - probability * Math.log2(probability);
  }, 0);
}

function occurrences(entries, term) {
  return entries.reduce((total, entry) => total + (entry.text.split(term).length - 1), 0);
}

export function generateDescriptiveStatistics(manifest) {
  const states = Array.from({ length: 64 }, (_, state) => state);
  const rankCounts = Array.from({ length: 7 }, (_, rank) => (
    states.filter((state) => state.toString(2).replaceAll('0', '').length === rank).length
  ));
  const terms = ['天', '地', '易', '变', '吉', '凶', '悔', '吝', '无咎'];
  const input = {
    stateSpaceHash: sha256(stable(states)),
    corpusVersion: manifest.corpusVersion,
    corpusSnapshotHash: manifest.sourceSnapshotHash
  };
  const core = {
    schemaVersion: '1.0.0',
    method: 'deterministic-descriptive-counts-1.0.0',
    input,
    inputHash: sha256(stable(input)),
    sample: {
      stateSpace: { definition: 'B6 = {0,1}^6', cardinality: states.length },
      corpus: { version: manifest.corpusVersion, paragraphs: manifest.entries.length, sourceSnapshotHash: manifest.sourceSnapshotHash }
    },
    bitDistribution: Array.from({ length: 6 }, (_, bit) => {
      const ones = states.filter((state) => ((state >> bit) & 1) === 1).length;
      const zeros = states.length - ones;
      return { bit: bit + 1, zeros, ones, entropyBits: entropy([zeros, ones]) };
    }),
    rankDistribution: rankCounts.map((count, rank) => ({ rank, count })),
    rankEntropyBits: entropy(rankCounts),
    termDistribution: terms.map((term) => {
      const paragraphPresence = manifest.entries.filter((entry) => entry.text.includes(term)).length;
      return {
        term,
        count: occurrences(manifest.entries, term),
        paragraphPresence,
        presenceEntropyBits: entropy([manifest.entries.length - paragraphPresence, paragraphPresence])
      };
    }),
    boundary: '这些分布与熵仅描述固定的 64 状态空间和固定语料样本；不推出经典语义、因果关系或预测效力。'
  };
  return { ...core, resultHash: sha256(stable(core)) };
}

export function serializeDescriptiveStatistics(value) {
  return `${stable(value)}\n`;
}

export function validateDescriptiveStatistics(value) {
  const { resultHash, ...core } = value;
  const errors = [];
  if (resultHash !== sha256(stable(core))) errors.push('描述性统计哈希失配');
  if (value.sample?.stateSpace?.cardinality !== 64) errors.push('状态空间不是 64');
  if (value.bitDistribution?.length !== 6) errors.push('位分布不完整');
  if (value.rankDistribution?.reduce((sum, item) => sum + item.count, 0) !== 64) errors.push('秩分布计数不完整');
  if (value.inputHash !== sha256(stable(value.input))) errors.push('descriptive statistics input hash mismatch');
  const expectedRanks = [1, 6, 15, 20, 15, 6, 1];
  if ((value.rankDistribution ?? []).some((item, index) => item.rank !== index || item.count !== expectedRanks[index])) {
    errors.push('rank distribution does not match B6 enumeration');
  }
  if ((value.bitDistribution ?? []).some((item, index) => (
    item.bit !== index + 1 || item.zeros !== 32 || item.ones !== 32 || item.entropyBits !== 1
  ))) errors.push('bit distribution does not match B6 enumeration');
  const paragraphCount = value.sample?.corpus?.paragraphs;
  if (!Number.isInteger(paragraphCount) || paragraphCount <= 0) errors.push('corpus paragraph count is invalid');
  if ((value.termDistribution ?? []).some((item) => (
    typeof item.term !== 'string' || !Number.isInteger(item.count) || item.count < 0
    || !Number.isInteger(item.paragraphPresence) || item.paragraphPresence < 0 || item.paragraphPresence > paragraphCount
    || !Number.isFinite(item.presenceEntropyBits) || item.presenceEntropyBits < 0 || item.presenceEntropyBits > 1
  ))) errors.push('term distribution is invalid');
  return { valid: errors.length === 0, errors };
}
