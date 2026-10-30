import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const assets = new URL('../dist/assets/', import.meta.url);
const files = (await readdir(assets)).filter((name) => name.endsWith('.js'));
assert.ok(files.length > 0, 'production build must contain JavaScript assets');

for (const file of files) {
  const contents = await readFile(new URL(file, assets), 'utf8');
  assert.doesNotMatch(contents, /__YIJING_TEST__/, `${file} leaked the E2E test hook`);
}

console.log(`PASS: ${files.length} production JavaScript asset(s) contain no E2E test hook.`);
