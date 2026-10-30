import { readFile, writeFile } from 'node:fs/promises';

const input = process.argv[2];
if (!input) throw new Error('用法: node scripts/import-classics.mjs <gua64.json>');
const raw = JSON.parse(await readFile(input, 'utf8'));
if (raw?.guas?.length !== 64) throw new Error('底本必须包含 64 卦');
for (let index = 0; index < 64; index++) {
  const gua = raw.guas[index];
  if (gua.no !== index + 1 || !gua.judgment || !gua.tuan || !gua.image || gua.yao?.length !== 6) {
    throw new Error(`第 ${index + 1} 卦字段不完整`);
  }
}
const revision = '88dc8f812586eb21ae713e11f26c2e8b564b6f33';
const banner = `// Generated from https://github.com/ZQing-Chen/yijing/blob/${revision}/assets/data/gua64.json\n// Upstream MIT, copyright (c) 2026 ZQing-Chen. See THIRD_PARTY_NOTICES.md.\n`;
await writeFile(new URL('../src/data/gua64-data.js', import.meta.url), `${banner}export default ${JSON.stringify(raw)};\n`);

const crosscheckInput = process.argv[3];
if (crosscheckInput) {
  const crosscheck = JSON.parse(await readFile(crosscheckInput, 'utf8'));
  const pages = Object.values(crosscheck.hexagrams ?? {});
  if (pages.length !== 64 || new Set(pages.map((item) => item.number)).size !== 64) throw new Error('交叉底本必须包含 64 卦');
  const compact = pages.sort((a, b) => a.number - b.number).map((item) => ({
    number: item.number,
    judgment: item.judgment,
    lines: item.lines,
    tuan: item.tuan,
    image: item.xiang,
    lineImages: item.line_xiang,
    source: item.source,
    revision: item.revision
  }));
  const crosscheckBanner = `// Generated cross-check from Wikisource page revisions indexed by toastedqu/meihua.\n// Text is public-domain classic content; page text attribution is CC BY-SA 4.0.\n`;
  await writeFile(new URL('../src/data/wikisource-crosscheck-data.js', import.meta.url), `${crosscheckBanner}export default ${JSON.stringify(compact)};\n`);
}
