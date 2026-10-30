import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parsePngDimensions, parseWebpDimensions, readJson, sha256 } from '../fixtures/formal-completeness.js';

const manifestUrl = '../../public/assets/generated/manifest.json';
const expectedIds = ['yijing-proof-texture', 'yijing-lattice-atmosphere'];

async function assetManifest() {
  return (await readJson(manifestUrl)).value;
}

async function assetBytes(relativePath) {
  try {
    return await readFile(new URL(`../../public/${relativePath}`, import.meta.url));
  } catch (error) {
    assert.fail(`生成资产不存在：${relativePath}\n${error.code ?? error.name}: ${error.message}`);
  }
}

test('ImageGen manifest 固定记录 CLI、gpt-image-2/high、生成日期与两项用途', { concurrency: false }, async () => {
  const manifest = await assetManifest();
  assert.match(manifest.schemaVersion, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.generator.mode, 'skill-cli');
  assert.equal(manifest.generator.model, 'gpt-image-2');
  assert.equal(manifest.generator.quality, 'high');
  assert.match(manifest.generator.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(manifest.assets.map((asset) => asset.id).sort(), [...expectedIds].sort());
});

test('每项资产保留不可变 PNG 原图，尺寸、字节数和 SHA-256 与 manifest 一致', { concurrency: false }, async () => {
  const manifest = await assetManifest();
  for (const asset of manifest.assets) {
    assert.match(asset.prompt, /\S/);
    assert.ok(Array.isArray(asset.negativeConstraints) && asset.negativeConstraints.length >= 4);
    const bytes = await assetBytes(asset.source.path);
    assert.equal(asset.source.format, 'png');
    assert.equal(bytes.byteLength, asset.source.bytes);
    assert.equal(sha256(bytes), asset.source.sha256);
    assert.deepEqual(parsePngDimensions(bytes), { width: asset.source.width, height: asset.source.height });
    assert.match(asset.source.path, new RegExp(`assets/generated/source/${asset.id}-gpt-image-2-original\\.png$`));
  }
});

test('两项资产各有真实 640/1280 WebP，四文件不同且单图不超过 300 KiB', { concurrency: false }, async () => {
  const manifest = await assetManifest();
  const paths = [];
  const hashes = [];
  for (const asset of manifest.assets) {
    assert.deepEqual(asset.variants.map((variant) => variant.width), [640, 1280]);
    for (const variant of asset.variants) {
      const bytes = await assetBytes(variant.path);
      paths.push(variant.path); hashes.push(variant.sha256);
      assert.equal(variant.format, 'webp');
      assert.ok(bytes.byteLength <= 300 * 1024, `${variant.path} 超过 300 KiB`);
      assert.equal(bytes.byteLength, variant.bytes);
      assert.equal(sha256(bytes), variant.sha256);
      assert.deepEqual(parseWebpDimensions(bytes), { width: variant.width, height: variant.height });
    }
  }
  assert.equal(new Set(paths).size, 4, 'srcset 不得用同一文件伪装多档');
  assert.equal(new Set(hashes).size, 4, '四个 WebP 必须是实际独立导出');
});

test('资产 manifest 声明空 alt、装饰用途、失败降级且不承担经典或数学真值', { concurrency: false }, async () => {
  const manifest = await assetManifest();
  for (const asset of manifest.assets) {
    assert.equal(asset.decorative, true);
    assert.equal(asset.alt, '');
    assert.ok(asset.fallback?.trim());
    assert.match(asset.usageBoundary, /装饰|氛围/);
    assert.match(asset.usageBoundary, /不.*证据|不.*真值|不.*原文/);
    assert.ok(Object.hasOwn(asset, 'manualEdits'));
  }
});

test('资产来源文档明确生成图不是古代文物、经典证据或卦象真值', { concurrency: false }, async () => {
  const sourceDoc = await readFile(new URL('../../ASSET_SOURCES.md', import.meta.url), 'utf8');
  assert.match(sourceDoc, /ImageGen|gpt-image-2/);
  assert.match(sourceDoc, /不是|不属于/);
  assert.match(sourceDoc, /古代文物|古籍/);
  assert.match(sourceDoc, /经典证据|数学真值|卦象真值/);
});
