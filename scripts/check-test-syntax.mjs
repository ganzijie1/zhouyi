import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

function collectJavaScript(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? collectJavaScript(path) : (/\.(?:js|mjs)$/.test(entry.name) ? [path] : []);
  });
}

const files = collectJavaScript(fileURLToPath(new URL('../test', import.meta.url)));
let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failed = true;
    process.stderr.write(result.stderr);
  }
}

if (failed) process.exitCode = 1;
else console.log(`测试语法检查通过：${files.length} 个文件`);
