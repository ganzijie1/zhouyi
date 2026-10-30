import { complement, getLine, normalizeState, q6Neighbors, reverseLines } from './lattice.js';
import { KING_WEN_ORDER } from '../data/hexagrams.js';

export const RULE_VERSION = 'zhouyi-core-v1';

function version(value) {
  if (value !== RULE_VERSION) throw new RangeError(`未知规则版本: ${value}`);
}

function position(value) {
  if (!Number.isInteger(value)) throw new TypeError('爻位必须是整数');
  if (value < 1 || value > 6) throw new RangeError('爻位必须位于 1..6');
  return value;
}

/** 互卦：二三四爻成下卦，三四五爻成上卦；返回来源爻位便于审计。 */
export function nuclearHexagram(value) {
  const state = normalizeState(value);
  return { state: ((state >> 1) & 7) | (((state >> 2) & 7) << 3), sourceLines: { lower: [2, 3, 4], upper: [3, 4, 5] } };
}

export function kleinOrbit(value) {
  const state = normalizeState(value);
  return [...new Set([state, complement(state), reverseLines(state), complement(reverseLines(state))])].sort((a, b) => a - b);
}

export function kleinStabilizer(value) {
  const state = normalizeState(value);
  return [
    ['identity', state], ['complement', complement(state)], ['reverse', reverseLines(state)],
    ['complement-reverse', complement(reverseLines(state))]
  ].filter(([, result]) => result === state).map(([name]) => name);
}

export function linePositionFacts(value) {
  const state = normalizeState(value);
  return Array.from({ length: 6 }, (_, index) => {
    const pos = index + 1;
    const yang = getLine(state, index) === 1;
    return {
      position: pos,
      polarity: yang ? 'yang' : 'yin',
      proper: yang === (pos % 2 === 1),
      realm: pos <= 2 ? 'earth' : pos <= 4 ? 'human' : 'heaven'
    };
  });
}

export function areAdjacentPositions(left, right, ruleVersion) {
  version(ruleVersion); position(left); position(right);
  return Math.abs(left - right) === 1;
}

export function isCorresponding(value, left, right, ruleVersion) {
  version(ruleVersion); position(left); position(right);
  if (Math.abs(left - right) !== 3) throw new RangeError('对应爻必须相隔三位');
  return getLine(value, left - 1) !== getLine(value, right - 1);
}

/** 本规则版把“承”限定为相邻的下阴承上阳，不外推吉凶。 */
export function isSupporting(value, lower, upper, ruleVersion) {
  version(ruleVersion); position(lower); position(upper);
  if (upper !== lower + 1) throw new RangeError('承只比较相邻上下爻');
  return getLine(value, lower - 1) === 0 && getLine(value, upper - 1) === 1;
}

/** 本规则版把“乘”限定为相邻的上阴乘下阳，不外推吉凶。 */
export function isRiding(value, lower, upper, ruleVersion) {
  version(ruleVersion); position(lower); position(upper);
  if (upper !== lower + 1) throw new RangeError('乘只比较相邻上下爻');
  return getLine(value, lower - 1) === 1 && getLine(value, upper - 1) === 0;
}

export function relationEvidence(value, ruleVersion = RULE_VERSION) {
  version(ruleVersion);
  const correspondence = [[1, 4], [2, 5], [3, 6]].map(([left, right]) => ({ left, right, matches: isCorresponding(value, left, right, ruleVersion) }));
  const adjacency = Array.from({ length: 5 }, (_, i) => ({
    lower: i + 1,
    upper: i + 2,
    supporting: isSupporting(value, i + 1, i + 2, ruleVersion),
    riding: isRiding(value, i + 1, i + 2, ruleVersion)
  }));
  return {
    ruleVersion,
    boundary: '承乘、应比采用显式规则版本；流派表述可能不同，本谓词不推出吉凶。',
    correspondence,
    adjacency
  };
}

export function buildTypedRelationEdges() {
  const edges = [];
  for (let from = 0; from < 64; from++) {
    for (const to of q6Neighbors(from)) if (from < to) edges.push({ from, to, type: 'q6', definition: '恰有一爻变化' });
    edges.push({ from, to: complement(from), type: 'complement', definition: '六爻逐位取反（错卦）' });
    edges.push({ from, to: reverseLines(from), type: 'reverse', definition: '六爻次序反转（综卦）' });
    edges.push({ from, to: nuclearHexagram(from).state, type: 'nuclear', definition: '二三四/三四五爻构成互卦' });
  }
  for (let i = 0; i < KING_WEN_ORDER.length - 1; i++) {
    edges.push({ from: KING_WEN_ORDER[i], to: KING_WEN_ORDER[i + 1], type: 'king-wen-next', definition: '文王卦序相邻' });
  }
  return edges;
}
