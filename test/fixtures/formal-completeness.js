import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export async function readJson(relativeUrl) {
  let raw;
  try {
    raw = await readFile(new URL(relativeUrl, import.meta.url), 'utf8');
  } catch (error) {
    assert.fail(`待实现产物不存在：${relativeUrl}\n${error.code ?? error.name}: ${error.message}`);
  }
  try {
    return { raw, value: JSON.parse(raw) };
  } catch (error) {
    assert.fail(`产物不是有效 JSON：${relativeUrl}\n${error.message}`);
  }
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function subsets(values) {
  return Array.from({ length: 1 << values.length }, (_, mask) => values.filter((_, index) => mask & (1 << index)));
}

export function isSubset(left, right) {
  const rightSet = new Set(right);
  return left.every((item) => rightSet.has(item));
}

export function parsePngDimensions(buffer) {
  assert.equal(buffer.subarray(1, 4).toString('ascii'), 'PNG', '原图必须是 PNG');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

export function parseWebpDimensions(buffer) {
  assert.equal(buffer.subarray(0, 4).toString('ascii'), 'RIFF', 'WebP 必须有 RIFF 头');
  assert.equal(buffer.subarray(8, 12).toString('ascii'), 'WEBP', 'WebP 容器标识缺失');
  const kind = buffer.subarray(12, 16).toString('ascii');
  if (kind === 'VP8X') {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3)
    };
  }
  if (kind === 'VP8 ') {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff
    };
  }
  if (kind === 'VP8L') {
    const bits = buffer.readUInt32LE(21);
    return {
      width: 1 + (bits & 0x3fff),
      height: 1 + ((bits >> 14) & 0x3fff)
    };
  }
  assert.fail(`不支持的 WebP 编码块：${kind}`);
}
