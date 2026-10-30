import { mkdir, writeFile } from 'node:fs/promises';
import { CLASSIC_CELLS, EXTRA_CLASSIC_CELLS } from '../src/data/classics.js';
import { validateClassicsCoverage } from '../src/data/validate-classics.js';

const report = validateClassicsCoverage();
const statuses = [...CLASSIC_CELLS, ...EXTRA_CLASSIC_CELLS].reduce((counts, cell) => {
  counts[cell.status] = (counts[cell.status] ?? 0) + 1;
  return counts;
}, {});
const output = { generatedAt: new Date().toISOString(), ...report, statuses };
const directory = new URL('../reports/', import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL('classics-coverage.json', directory), JSON.stringify(output, null, 2));
await writeFile(new URL('classics-coverage.md', directory), `# 经典覆盖报告\n\n- 全部经典单元：${report.total}\n- 常规双底本字段：${report.normalTotal}\n- 乾坤单源待核字段：${report.extraTotal}\n- 双底本归一化一致：${statuses.verified ?? 0}\n- 异文双版本：${statuses.variant ?? 0}\n- 常规字段双底本一致或异文实录率：${(report.normalVerifiedOrVariantRatio * 100).toFixed(3)}%\n- 全体一致或异文实录率：${(report.overallVerifiedOrVariantRatio * 100).toFixed(3)}%\n- 全体单源待核率：${(report.overallPendingRatio * 100).toFixed(3)}%\n- 全体可追溯率：${(report.traceableRatio * 100).toFixed(3)}%\n- 缺失：${report.missing}\n- 结构门：${report.passesGate ? 'PASS' : 'FAIL'}\n\n> 自动双底本比对不等于人工学术定本校勘；全体比例包含 4 个单源待核额外字段。\n`);
console.log(JSON.stringify({ passesGate: report.passesGate, statuses, total: report.total, overallVerifiedOrVariantRatio: report.overallVerifiedOrVariantRatio, overallPendingRatio: report.overallPendingRatio, missing: report.missing }, null, 2));
if (!report.passesGate) process.exitCode = 1;
