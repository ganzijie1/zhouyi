import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const path = new URL('../public/data/corpus-manifest.json', import.meta.url);
const manifest = JSON.parse(await readFile(path, 'utf8'));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const requiredWorks = new Set(['zhouyi', 'tuan', 'xiang', 'wenyan-qian', 'wenyan-kun', 'xici-shang', 'xici-xia', 'shuogua', 'xugua', 'zagua']);
const allowedStatuses = new Set(['verified', 'variant', 'single-source-pending-review']);
const ids = new Set();
const positions = new Set();
const errors = [];

for (const entry of manifest.entries ?? []) {
  const position = `${entry.work}:${entry.chapter}:${entry.paragraph}`;
  for (const key of ['corpusId', 'work', 'chapter', 'paragraph', 'text', 'source', 'revision', 'license', 'sha256', 'status']) {
    if (entry[key] === undefined || entry[key] === null || String(entry[key]).trim() === '') errors.push(`${entry.corpusId ?? '(unknown)'} 缺少 ${key}`);
  }
  if (ids.has(entry.corpusId)) errors.push(`重复 ID: ${entry.corpusId}`);
  if (positions.has(position)) errors.push(`重复位置: ${position}`);
  if (!entry.text?.trim()) errors.push(`空文: ${entry.corpusId}`);
  if (sha256(entry.text?.replace(/\r\n/g, '\n') ?? '') !== entry.sha256) errors.push(`哈希失配: ${entry.corpusId}`);
  if (!allowedStatuses.has(entry.status)) errors.push(`未分类状态: ${entry.corpusId}/${entry.status}`);
  if (!entry.source?.id || !/^https:\/\//.test(entry.source?.immutableUrl ?? '')) errors.push(`来源不可追溯: ${entry.corpusId}`);
  if (!entry.source?.immutableUrl?.includes(String(entry.revision)) && !entry.source?.immutableUrl?.includes(`oldid=${entry.revision}`)) errors.push(`固定 URL 未绑定 revision: ${entry.corpusId}`);
  ids.add(entry.corpusId); positions.add(position);
}

const actualWorkCounts = Object.fromEntries([...requiredWorks].sort().map((work) => [work, manifest.entries.filter((entry) => entry.work === work).length]));
for (const work of requiredWorks) if (!actualWorkCounts[work]) errors.push(`缺少篇章: ${work}`);
if (JSON.stringify(actualWorkCounts) !== JSON.stringify(manifest.expectedWorkCounts)) errors.push('篇章计数与声明不一致');
if (!Array.isArray(manifest.sourceSnapshots) || manifest.sourceSnapshots.length < 2) errors.push('固定源快照清单缺失');
for (const snapshot of manifest.sourceSnapshots ?? []) {
  if (!/^[a-f0-9]{40}$/.test(snapshot.revision) || !snapshot.immutableUrl.includes(snapshot.revision)) errors.push(`源快照 revision 无效: ${snapshot.id}`);
  if (!/^[a-f0-9]{64}$/.test(snapshot.contentHash)) errors.push(`源快照哈希无效: ${snapshot.id}`);
}
if (manifest.summary?.total !== manifest.entries.length || manifest.summary?.expected !== manifest.entries.length) errors.push('覆盖摘要总数不一致');
for (const key of ['emptyTexts', 'duplicateIds', 'duplicatePositions', 'unclassified', 'hashMismatches']) {
  if (manifest.summary?.[key] !== 0) errors.push(`覆盖摘要硬门非零: ${key}`);
}
if (errors.length) throw new Error(errors.join('\n'));
console.log(`语料校验通过：${manifest.entries.length} 段，固定篇章计数匹配，空文/重复位置/未分类/哈希失配均为 0。`);
