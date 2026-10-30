import assert from 'node:assert/strict';

import {
  CLASSIC_CELLS,
  CLASSIC_FIELDS,
  EXTRA_CLASSIC_CELLS
} from '../../src/data/classics.js';
import { validateClassicsCoverage } from '../../src/data/validate-classics.js';
import { HEXAGRAM_BY_NUMBER } from '../../src/data/hexagrams.js';
import { SOURCES } from '../../src/data/sources.js';

const sourceById = new Map(SOURCES.map((source) => [source.id, source]));
const regularStatusCounts = CLASSIC_CELLS.reduce((counts, cell) => {
  counts[cell.status] = (counts[cell.status] ?? 0) + 1;
  return counts;
}, {});
const allStatusCounts = [...CLASSIC_CELLS, ...EXTRA_CLASSIC_CELLS].reduce((counts, cell) => {
  counts[cell.status] = (counts[cell.status] ?? 0) + 1;
  return counts;
}, {});

assert.equal(CLASSIC_CELLS.length, 64 * CLASSIC_FIELDS.length);
assert.equal(regularStatusCounts.verified, 918);
assert.equal(regularStatusCounts.variant, 42);
assert.equal(EXTRA_CLASSIC_CELLS.length, 4);
assert.equal(allStatusCounts.verified, 918);
assert.equal(allStatusCounts.variant, 42);
assert.equal(allStatusCounts['pending-review'], 4);

const coverage = validateClassicsCoverage();
assert.equal(coverage.missing, 0);
assert.equal(coverage.traceableRatio, 1);
assert.equal(coverage.total, 964);
assert.equal(coverage.normalVerifiedOrVariantRatio, 1);
assert.equal(coverage.overallVerifiedOrVariantRatio, 960 / 964);
assert.equal(coverage.overallPendingRatio, 4 / 964);
assert.equal(coverage.passesGate, true);

const variants = CLASSIC_CELLS.filter((cell) => cell.status === 'variant');
for (const cell of variants) {
  assert.equal(cell.variants.length, 2, `${cell.hexagramNumber}:${cell.field} must preserve two versions`);
  assert.notEqual(cell.variants[0].text, cell.variants[1].text, `${cell.hexagramNumber}:${cell.field} versions must differ`);
  for (const variant of cell.variants) {
    assert.ok(sourceById.has(variant.sourceId), `unknown source ${variant.sourceId}`);
    assert.ok(variant.text.trim(), `${cell.hexagramNumber}:${cell.field} has an empty variant`);
  }
  assert.ok(cell.variants[1].revision, `${cell.hexagramNumber}:${cell.field} lacks cross-check revision`);
}

for (const cell of [...CLASSIC_CELLS, ...EXTRA_CLASSIC_CELLS]) {
  assert.ok(cell.text.trim(), `${cell.hexagramNumber}:${cell.field} has empty text`);
  assert.ok(cell.sourceIds.length >= (cell.status === 'pending-review' ? 1 : 2), `${cell.hexagramNumber}:${cell.field} lacks source IDs`);
  assert.ok(cell.sourceLinks.every((link) => link.startsWith('https://')), `${cell.hexagramNumber}:${cell.field} has a non-HTTPS source`);
  assert.ok(cell.sourceIds.every((id) => sourceById.has(id)), `${cell.hexagramNumber}:${cell.field} has unknown source IDs`);
}

const anchors = [1, 2, 3, 63, 64].map((number) => {
  const hexagram = HEXAGRAM_BY_NUMBER.get(number);
  const cells = CLASSIC_CELLS.filter((cell) => cell.hexagramNumber === number);
  assert.ok(hexagram, `hexagram ${number} missing`);
  assert.equal(cells.length, 15, `hexagram ${number} must have 15 regular cells`);
  assert.deepEqual(new Set(cells.map((cell) => cell.field)), new Set(CLASSIC_FIELDS));
  return {
    number,
    name: hexagram.name,
    bits: hexagram.bits,
    binary: hexagram.binary,
    verified: cells.filter((cell) => cell.status === 'verified').length,
    variant: cells.filter((cell) => cell.status === 'variant').length,
    variantFields: cells.filter((cell) => cell.status === 'variant').map((cell) => cell.field),
    revisions: [...new Set(cells.map((cell) => cell.revision).filter(Boolean))]
  };
});

console.log(JSON.stringify({
  totals: {
    regular: CLASSIC_CELLS.length,
    extra: EXTRA_CLASSIC_CELLS.length,
    regularVerified: regularStatusCounts.verified,
    regularVariant: regularStatusCounts.variant,
    allVerified: allStatusCounts.verified,
    allVariant: allStatusCounts.variant,
    allPending: allStatusCounts['pending-review'],
    overallVerifiedOrVariantRatio: coverage.overallVerifiedOrVariantRatio,
    overallPendingRatio: coverage.overallPendingRatio,
    missing: coverage.missing,
    traceableRatio: coverage.traceableRatio,
    gate: coverage.passesGate
  },
  sources: SOURCES.map(({ id, url, accessedAt, status }) => ({ id, url, accessedAt, status })),
  variantPairs: variants.length,
  anchors
}, null, 2));
