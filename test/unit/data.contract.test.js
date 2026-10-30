import assert from 'node:assert/strict';
import test from 'node:test';
import { loadProductionData } from '../fixtures/contract.js';
import {
  EXTRA_CLASSIC_FIELDS,
  KING_WEN_NAMES,
  NORMAL_CLASSIC_FIELDS,
  TRIGRAM_NAMES_BY_BITS
} from '../fixtures/expected-classics.js';

async function hexagramData() {
  return loadProductionData('../../src/data/hexagrams.js', ['HEXAGRAMS', 'KING_WEN_ORDER', 'TRIGRAMS']);
}

async function classicData() {
  return loadProductionData('../../src/data/classics.js', ['CLASSIC_CELLS', 'EXTRA_CLASSIC_CELLS', 'CLASSIC_STATUSES']);
}

async function sourceData() {
  return loadProductionData('../../src/data/sources.js', ['SOURCES']);
}

async function validation() {
  return loadProductionData('../../src/data/validate-classics.js', ['validateClassicsCoverage']);
}

test('六十四卦基础数据模块存在并导出稳定契约', { concurrency: false }, async () => {
  await hexagramData();
});

test('64 卦序号、名称、卦符、bit、上下卦和文王序完整唯一', { concurrency: false }, async () => {
  const { HEXAGRAMS, KING_WEN_ORDER, TRIGRAMS } = await hexagramData();
  assert.equal(HEXAGRAMS.length, 64);
  assert.deepEqual(HEXAGRAMS.map((item) => item.number), Array.from({ length: 64 }, (_, index) => index + 1));
  assert.deepEqual(HEXAGRAMS.map((item) => item.name), KING_WEN_NAMES);
  assert.deepEqual(HEXAGRAMS.map((item) => item.symbol.codePointAt(0)), Array.from({ length: 64 }, (_, index) => 0x4dc0 + index));
  assert.equal(new Set(HEXAGRAMS.map((item) => item.bits)).size, 64);
  assert.deepEqual([...HEXAGRAMS.map((item) => item.bits)].sort((a, b) => a - b), Array.from({ length: 64 }, (_, index) => index));
  assert.deepEqual(KING_WEN_ORDER, HEXAGRAMS.map((item) => item.bits));
  assert.deepEqual(TRIGRAMS.map((item) => item.name), TRIGRAM_NAMES_BY_BITS);
  for (const item of HEXAGRAMS) {
    assert.equal(item.lowerTrigram, TRIGRAM_NAMES_BY_BITS[item.bits & 7]);
    assert.equal(item.upperTrigram, TRIGRAM_NAMES_BY_BITS[(item.bits >> 3) & 7]);
    assert.ok(item.section === 'upper' || item.section === 'lower');
    assert.ok(Array.isArray(item.sourceIds) && item.sourceIds.length > 0);
  }
  assert.deepEqual(HEXAGRAMS.filter((item) => item.section === 'upper').map((item) => item.number), Array.from({ length: 30 }, (_, index) => index + 1));
});

test('已知锚点防止 bit 位序或上下卦整体倒置', { concurrency: false }, async () => {
  const { HEXAGRAMS } = await hexagramData();
  const byName = Object.fromEntries(HEXAGRAMS.map((item) => [item.name, item]));
  assert.equal(byName['乾'].bits, 63);
  assert.equal(byName['坤'].bits, 0);
  assert.equal(byName['屯'].bits, 17, '水雷屯：上坎 010、下震 001');
  assert.equal(byName['既济'].bits, 21, '水火既济：上坎 010、下离 101');
  assert.equal(byName['未济'].bits, 42, '火水未济：上离 101、下坎 010');
});

test('来源元数据可追溯：稳定链接、版本、访问日、许可与字段范围齐全', { concurrency: false }, async () => {
  const { SOURCES } = await sourceData();
  assert.ok(Array.isArray(SOURCES) && SOURCES.length >= 2);
  const ids = new Set();
  for (const source of SOURCES) {
    assert.ok(source.id && !ids.has(source.id));
    ids.add(source.id);
    assert.match(source.url, /^https:\/\//);
    assert.match(source.accessedAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(source.version);
    assert.ok(source.license);
    assert.ok(Array.isArray(source.fieldScope) && source.fieldScope.length > 0);
    assert.ok(['verified', 'cross-check', 'index-only'].includes(source.status));
  }
});

test('960 常规单元与乾坤 4 个额外单元逐格覆盖且字段无重缺', { concurrency: false }, async () => {
  const { CLASSIC_CELLS, EXTRA_CLASSIC_CELLS } = await classicData();
  assert.equal(CLASSIC_CELLS.length, 64 * 15);
  assert.equal(EXTRA_CLASSIC_CELLS.length, 4);
  const normalKeys = new Set(CLASSIC_CELLS.map((cell) => `${cell.hexagramNumber}:${cell.field}`));
  assert.equal(normalKeys.size, 960);
  for (let number = 1; number <= 64; number++) {
    for (const field of NORMAL_CLASSIC_FIELDS) assert.ok(normalKeys.has(`${number}:${field}`), `缺少 ${number}:${field}`);
  }
  assert.deepEqual(EXTRA_CLASSIC_CELLS.map((cell) => cell.field).sort(), [...EXTRA_CLASSIC_FIELDS].sort());
});

test('经典单元不得空白补写：状态、来源、稳定链接和非通过原因受门禁约束', { concurrency: false }, async () => {
  const { CLASSIC_CELLS, EXTRA_CLASSIC_CELLS, CLASSIC_STATUSES } = await classicData();
  const allowed = new Set(['verified', 'variant', 'index-only', 'restricted', 'pending-review']);
  assert.deepEqual(new Set(CLASSIC_STATUSES), allowed);
  for (const cell of [...CLASSIC_CELLS, ...EXTRA_CLASSIC_CELLS]) {
    assert.ok(allowed.has(cell.status));
    assert.ok(Array.isArray(cell.sourceIds) && cell.sourceIds.length > 0);
    assert.ok(Array.isArray(cell.sourceLinks) && cell.sourceLinks.length > 0);
    assert.ok(cell.sourceLinks.every((link) => /^https:\/\//.test(link)));
    assert.notEqual(cell.text, '', '缺失文本不得用空字符串伪装');
    if (cell.status === 'verified') assert.ok(typeof cell.text === 'string' && cell.text.trim().length > 0);
    if (cell.status === 'variant') assert.ok(Array.isArray(cell.variants) && cell.variants.length >= 2);
    if (!['verified', 'variant'].includes(cell.status)) assert.ok(cell.reason && cell.reason.trim().length > 0);
    assert.doesNotMatch(String(cell.text ?? ''), /TODO|待补|模型生成|lorem|placeholder/i);
  }
});

test('经典覆盖门：可追溯 100%、校勘或双版本异文 ≥95%、缺失 0', { concurrency: false }, async () => {
  const { validateClassicsCoverage } = await validation();
  const report = validateClassicsCoverage();
  assert.equal(report.total, 964);
  assert.equal(report.normalTotal, 960);
  assert.equal(report.extraTotal, 4);
  assert.equal(report.missing, 0);
  assert.equal(report.traceableRatio, 1);
  assert.equal(report.normalVerifiedOrVariantRatio, 1);
  assert.equal(report.overallVerifiedOrVariantRatio, 960 / 964);
  assert.equal(report.overallPendingRatio, 4 / 964);
  assert.equal(report.passesGate, true);
  assert.ok(Array.isArray(report.byHexagram) && report.byHexagram.length === 64);
  assert.ok(report.byField && Object.keys(report.byField).length === 15);
});

test('normal cells use two traceable editions and extra Qian/Kun cells remain single-source pending review', { concurrency: false }, async () => {
  const { CLASSIC_CELLS, EXTRA_CLASSIC_CELLS } = await classicData();
  for (const cell of CLASSIC_CELLS) {
    assert.deepEqual(cell.sourceIds, ['zqing-chen-wangbi', 'wikisource-xiyi']);
    assert.equal(cell.sourceLinks.length, 2);
    assert.match(cell.sourceLinks[1], /oldid=\d+/);
    assert.ok(['verified', 'variant'].includes(cell.status));
    assert.doesNotMatch(cell.sourceIds.join(','), /ctext/i);
  }
  for (const cell of EXTRA_CLASSIC_CELLS) {
    assert.equal(cell.status, 'pending-review');
    assert.deepEqual(cell.sourceIds, ['zqing-chen-wangbi']);
    assert.equal(cell.sourceLinks.length, 1);
    assert.ok(cell.reason?.trim());
  }
});
