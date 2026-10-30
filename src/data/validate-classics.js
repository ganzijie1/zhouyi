import { CLASSIC_CELLS, EXTRA_CLASSIC_CELLS, CLASSIC_FIELDS } from './classics.js';

export function validateClassicsCoverage() {
  const all = [...CLASSIC_CELLS, ...EXTRA_CLASSIC_CELLS];
  const traceable = all.filter((cell) => cell.sourceIds?.length && cell.sourceLinks?.length).length;
  const verified = CLASSIC_CELLS.filter((cell) => ['verified', 'variant'].includes(cell.status)).length;
  const expected = new Set(Array.from({ length: 64 }, (_, i) => i + 1).flatMap((n) => CLASSIC_FIELDS.map((field) => `${n}:${field}`)));
  const actual = new Set(CLASSIC_CELLS.map((cell) => `${cell.hexagramNumber}:${cell.field}`));
  const missing = [...expected].filter((key) => !actual.has(key)).length;
  const byHexagram = Array.from({ length: 64 }, (_, index) => {
    const cells = CLASSIC_CELLS.filter((cell) => cell.hexagramNumber === index + 1);
    return { number: index + 1, total: cells.length, verified: cells.filter((cell) => ['verified', 'variant'].includes(cell.status)).length };
  });
  const byField = Object.fromEntries(CLASSIC_FIELDS.map((field) => [field, CLASSIC_CELLS.filter((cell) => cell.field === field).length]));
  const traceableRatio = traceable / all.length;
  const pending = all.filter((cell) => cell.status === 'pending-review').length;
  const normalVerifiedOrVariantRatio = verified / CLASSIC_CELLS.length;
  const overallVerifiedOrVariantRatio = verified / all.length;
  const overallPendingRatio = pending / all.length;
  return {
    total: all.length,
    normalTotal: CLASSIC_CELLS.length,
    extraTotal: EXTRA_CLASSIC_CELLS.length,
    missing,
    traceableRatio,
    normalVerifiedOrVariantRatio,
    overallVerifiedOrVariantRatio,
    overallPendingRatio,
    passesGate: missing === 0 && traceableRatio === 1 && normalVerifiedOrVariantRatio >= 0.95 && overallPendingRatio <= 0.05
      && EXTRA_CLASSIC_CELLS.every((cell) => cell.status === 'pending-review' && cell.sourceIds.length === 1 && cell.reason),
    byHexagram,
    byField
  };
}
