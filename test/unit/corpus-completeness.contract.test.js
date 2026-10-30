import assert from 'node:assert/strict';
import test from 'node:test';
import { readJson, sha256 } from '../fixtures/formal-completeness.js';

const manifestUrl = '../../public/data/corpus-manifest.json';
const requiredWorks = new Set([
  'zhouyi', 'tuan', 'xiang', 'wenyan-qian', 'wenyan-kun',
  'xici-shang', 'xici-xia', 'shuogua', 'xugua', 'zagua'
]);

async function manifest() {
  return (await readJson(manifestUrl)).value;
}

test('固定版《周易》与十翼 manifest 存在并声明可重生版本', { concurrency: false }, async () => {
  const value = await manifest();
  assert.match(value.schemaVersion, /^\d+\.\d+\.\d+$/);
  assert.ok(value.corpusVersion?.trim());
  assert.ok(value.parserVersion?.trim());
  assert.match(value.sourceSnapshotHash, /^[a-f0-9]{64}$/);
  assert.ok(Array.isArray(value.entries) && value.entries.length > 964, '必须在既有 964 单元上加入十翼独立篇章');
  assert.equal(value.entries.length, 1132, '固定快照去除 xiang_lower 误混入的两篇文言后应为 1,132 段');
  assert.deepEqual(value.expectedWorkCounts, {
    shuogua: 11, tuan: 128, 'wenyan-kun': 1, 'wenyan-qian': 1,
    'xici-shang': 12, 'xici-xia': 12, xiang: 514, xugua: 2, zagua: 1, zhouyi: 450
  });
});

test('manifest 逐段 schema、正文、固定版本、许可和状态完整', { concurrency: false }, async () => {
  const value = await manifest();
  const allowedStatuses = new Set(['verified', 'variant', 'single-source-pending-review']);
  for (const entry of value.entries) {
    for (const key of ['corpusId', 'work', 'chapter', 'paragraph', 'text', 'source', 'revision', 'license', 'sha256', 'status']) {
      assert.ok(entry[key] !== undefined && entry[key] !== null && String(entry[key]).trim() !== '', `${entry.corpusId ?? '(unknown)'} 缺少 ${key}`);
    }
    assert.ok(entry.source.id?.trim());
    assert.match(entry.source.url, /^https:\/\//);
    assert.match(entry.source.immutableUrl, /^https:\/\//);
    assert.doesNotMatch(entry.revision, /^(latest|main|master|head)$/i);
    assert.ok(allowedStatuses.has(entry.status), `${entry.corpusId} 未分类：${entry.status}`);
    assert.doesNotMatch(entry.text, /TODO|待补|placeholder|lorem|模型生成/i);
    assert.equal(entry.sha256, sha256(entry.text.replace(/\r\n/g, '\n')));
  }
});

test('十翼篇章清单全部覆盖且各篇至少有一个段落', { concurrency: false }, async () => {
  const value = await manifest();
  const works = new Set(value.entries.map((entry) => entry.work));
  assert.deepEqual([...requiredWorks].filter((work) => !works.has(work)), []);
  for (const work of requiredWorks) assert.ok(value.entries.some((entry) => entry.work === work), `${work} 为空篇`);
  assert.equal(value.entries.some((entry) => entry.work === 'xiang' && /^文言传·/.test(entry.text)), false, '象传不得混入文言重复段');
});

test('两个本地源快照绑定真实固定 revision 与内容哈希', { concurrency: false }, async () => {
  const value = await manifest();
  const snapshots = new Map(value.sourceSnapshots.map((item) => [item.id, item]));
  assert.equal(snapshots.get('zqing-chen-wangbi').revision, '88dc8f812586eb21ae713e11f26c2e8b564b6f33');
  assert.equal(snapshots.get('muyen-yizhuan-snapshot').revision, '8ff4ffc8802ee9afd075da875cc3d39e8706be82');
  for (const snapshot of snapshots.values()) {
    assert.match(snapshot.contentHash, /^[a-f0-9]{64}$/);
    assert.ok(snapshot.immutableUrl.includes(snapshot.revision));
  }
});

test('语料段落 ID 与固定位置零重复', { concurrency: false }, async () => {
  const value = await manifest();
  const ids = value.entries.map((entry) => entry.corpusId);
  const positions = value.entries.map((entry) => `${entry.work}:${entry.chapter}:${entry.paragraph}`);
  assert.equal(new Set(ids).size, ids.length, 'corpusId 重复');
  assert.equal(new Set(positions).size, positions.length, '篇章位置重复');
});

test('覆盖摘要硬门为 100%，空文、重复、未分类和哈希失配均为 0', { concurrency: false }, async () => {
  const value = await manifest();
  assert.deepEqual(value.summary, {
    total: value.entries.length,
    expected: value.entries.length,
    coverageRatio: 1,
    traceableRatio: 1,
    immutableRevisionRatio: 1,
    emptyTexts: 0,
    duplicateIds: 0,
    duplicatePositions: 0,
    unclassified: 0,
    hashMismatches: 0
  });
});

test('语料来源明确限定为选定传世底本，不冒充所有异文与出土本全集', { concurrency: false }, async () => {
  const value = await manifest();
  assert.match(value.boundary, /选定|固定|传世底本/);
  assert.match(value.boundary, /不包括|不覆盖|不等于/);
  assert.match(value.boundary, /出土|异文|注疏/);
});
