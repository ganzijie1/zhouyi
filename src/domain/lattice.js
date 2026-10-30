function state(value) {
  if (!Number.isInteger(value)) throw new TypeError('卦状态必须是整数');
  if (value < 0 || value > 63) throw new RangeError('卦状态必须位于 0..63');
  return value;
}

function lineIndex(value) {
  if (!Number.isInteger(value)) throw new TypeError('爻位必须是整数');
  if (value < 0 || value > 5) throw new RangeError('爻位必须位于 0..5');
  return value;
}

export const normalizeState = state;
export const getLine = (value, line) => (state(value) >> lineIndex(line)) & 1;
export const flipLine = (value, line) => state(value) ^ (1 << lineIndex(line));

export function rank(value) {
  let bits = state(value);
  let count = 0;
  while (bits) { bits &= bits - 1; count++; }
  return count;
}

export const complement = (value) => state(value) ^ 63;

export function reverseLines(value) {
  const source = state(value);
  let result = 0;
  for (let line = 0; line < 6; line++) result |= ((source >> line) & 1) << (5 - line);
  return result;
}

export const join = (left, right) => state(left) | state(right);
export const meet = (left, right) => state(left) & state(right);
export const xor = (left, right) => state(left) ^ state(right);
export const hammingDistance = (left, right) => rank(xor(left, right));
export const lessOrEqual = (left, right) => (state(left) & state(right)) === state(left);

export function splitTrigrams(value) {
  const normalized = state(value);
  return { lower: normalized & 7, upper: (normalized >> 3) & 7 };
}

export function combineTrigrams(lower, upper) {
  if (!Number.isInteger(lower) || !Number.isInteger(upper)) throw new TypeError('八卦状态必须是整数');
  if (lower < 0 || lower > 7 || upper < 0 || upper > 7) throw new RangeError('八卦状态必须位于 0..7');
  return lower | (upper << 3);
}

export function statesAtRank(targetRank) {
  if (!Number.isInteger(targetRank) || targetRank < 0 || targetRank > 6) throw new RangeError('秩必须位于 0..6');
  return Array.from({ length: 64 }, (_, value) => value).filter((value) => rank(value) === targetRank);
}

export function q6Neighbors(value) {
  const normalized = state(value);
  return Array.from({ length: 6 }, (_, line) => normalized ^ (1 << line));
}
