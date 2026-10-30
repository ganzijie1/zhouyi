import { chromium } from '@playwright/test';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { arch, cpus, platform, release, totalmem } from 'node:os';
import { gzipSync } from 'node:zlib';

const baseURL = process.env.YIJING_PREVIEW_URL ?? 'http://127.0.0.1:4173';
const outputDirectory = new URL('../../test-results/performance/', import.meta.url);
const percentile = (values, fraction) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1];

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(path) : [path];
  }))).flat();
}

async function bundleSizes() {
  const dist = fileURLToPath(new URL('../../dist/', import.meta.url));
  const files = await collectFiles(dist);
  let coreGzipBytes = 0;
  let publishedBytes = 0;
  const details = [];
  for (const file of files) {
    const contents = await readFile(file);
    const gzipBytes = gzipSync(contents).byteLength;
    const extension = extname(file);
    if (['.html', '.css', '.js'].includes(extension)) coreGzipBytes += gzipBytes;
    publishedBytes += (await stat(file)).size;
    details.push({ file, bytes: contents.byteLength, gzipBytes });
  }
  return { coreGzipBytes, publishedBytes, details };
}

const browser = await chromium.launch();
const browserVersion = await browser.version();
const cold = [];
const initialTransfer = [];
const interaction = [];
const atlas = [];
const longTasks = { cold: [], warmup: [], game: [], atlas: [] };

try {
  for (let index = 0; index < 10; index++) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    let encodedBytes = 0;
    await cdp.send('Network.enable');
    cdp.on('Network.loadingFinished', (event) => {
      encodedBytes += event.encodedDataLength;
    });
    await page.addInitScript(() => {
      window.__longTasks = [];
      window.__lcp = [];
      new PerformanceObserver((list) => window.__longTasks.push(...list.getEntries().map((entry) => ({
        duration: entry.duration,
        startTime: entry.startTime,
        name: entry.name,
        attribution: [...(entry.attribution ?? [])].map((item) => ({ containerType: item.containerType, containerName: item.containerName, containerSrc: item.containerSrc }))
      })))).observe({ type: 'longtask', buffered: true });
      new PerformanceObserver((list) => window.__lcp.push(...list.getEntries().map((entry) => entry.startTime))).observe({ type: 'largest-contentful-paint', buffered: true });
    });
    await page.goto(baseURL, { waitUntil: 'networkidle' });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const metrics = await page.evaluate(() => ({
      fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
      lcp: window.__lcp.at(-1) ?? null
    }));
    cold.push(metrics);
    initialTransfer.push(encodedBytes);
    longTasks.cold.push(...await page.evaluate(() => window.__longTasks));
    await context.close();
  }

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__longTasks = [];
    new PerformanceObserver((list) => window.__longTasks.push(...list.getEntries().map((entry) => ({
      duration: entry.duration,
      startTime: entry.startTime,
      name: entry.name,
      attribution: [...(entry.attribution ?? [])].map((item) => ({ containerType: item.containerType, containerName: item.containerName, containerSrc: item.containerSrc }))
    })))).observe({ type: 'longtask', buffered: true });
  });
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.locator('[data-line-index="0"]').waitFor();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(100);
  await page.evaluate(() => window.__longTasks.splice(0));
  for (let index = 0; index < 55; index++) {
    if (index === 5) longTasks.warmup.push(...await page.evaluate(() => window.__longTasks.splice(0)));
    const sample = await page.evaluate(async () => {
      const button = document.querySelector('[data-line-index="0"]');
      const start = performance.now();
      button.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const duration = performance.now() - start;
      document.querySelector('[data-action="undo"]').click();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      return duration;
    });
    if (index >= 5) interaction.push(sample);
  }
  longTasks.game.push(...await page.evaluate(() => window.__longTasks.splice(0)));
  await page.locator('[data-view="atlas"]').click();
  await page.locator('[data-atlas-mode="hasse"]').waitFor();
  for (let index = 0; index < 55; index++) {
    if (index === 5) longTasks.warmup.push(...await page.evaluate(() => window.__longTasks.splice(0)));
    const sample = await page.evaluate(async (mode) => {
      const start = performance.now();
      document.querySelector(`[data-atlas-mode="${mode}"]`).click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return performance.now() - start;
    }, index % 2 === 0 ? 'matrix' : 'hasse');
    if (index >= 5) atlas.push(sample);
  }
  longTasks.atlas.push(...await page.evaluate(() => window.__longTasks.splice(0)));
  await context.close();
} finally {
  await browser.close();
}

const fcp = cold.map((sample) => sample.fcp).filter(Number.isFinite);
const lcp = cold.map((sample) => sample.lcp).filter(Number.isFinite);
const allLongTasks = [...longTasks.warmup, ...longTasks.game, ...longTasks.atlas];
const longTaskDurations = allLongTasks.map((entry) => entry.duration);
const coldLongTaskDurations = longTasks.cold.map((entry) => entry.duration);
const sizes = await bundleSizes();
const report = {
  generatedAt: new Date().toISOString(),
  environment: {
    baseURL,
    node: process.version,
    chromium: `${chromium.name()} ${browserVersion}`,
    operatingSystem: `${platform()} ${release()} ${arch()}`,
    cpu: `${cpus()[0]?.model ?? 'unknown'} (${cpus().length} logical cores)`,
    totalMemoryBytes: totalmem(),
    viewport: '1440x900',
    coldContexts: 10,
    warmups: 5,
    interactionSamples: 50
  },
  raw: { cold, initialTransfer, interaction, atlas, longTasks },
  summary: {
    fcp: { p50: percentile(fcp, 0.5), p75: percentile(fcp, 0.75), p95: percentile(fcp, 0.95) },
    lcp: { p50: percentile(lcp, 0.5), p75: percentile(lcp, 0.75), p95: percentile(lcp, 0.95) },
    interaction: { p50: percentile(interaction, 0.5), p75: percentile(interaction, 0.75), p95: percentile(interaction, 0.95) },
    atlas: { p50: percentile(atlas, 0.5), p75: percentile(atlas, 0.75), p95: percentile(atlas, 0.95) },
    maxLongTask: Math.max(0, ...longTaskDurations),
    longTaskCount: allLongTasks.length,
    maxColdLongTask: Math.max(0, ...coldLongTaskDurations),
    coldLongTaskCount: longTasks.cold.length,
    coreGzipBytes: sizes.coreGzipBytes,
    initialTransferBytes: percentile(initialTransfer, 0.95),
    publishedBytes: sizes.publishedBytes
  },
  thresholds: {
    fcpP75Ms: 1500,
    lcpP75Ms: 2500,
    interactionP95Ms: 100,
    atlasP95Ms: 150,
    maxLongTaskMs: 50,
    coreGzipBytes: 250 * 1024,
    initialTransferBytes: 700 * 1024
  },
  bundleFiles: sizes.details
};

report.passes = report.summary.fcp.p75 <= report.thresholds.fcpP75Ms
  && report.summary.lcp.p75 <= report.thresholds.lcpP75Ms
  && report.summary.interaction.p95 <= report.thresholds.interactionP95Ms
  && report.summary.atlas.p95 <= report.thresholds.atlasP95Ms
  && report.summary.maxLongTask <= report.thresholds.maxLongTaskMs
  && report.summary.coreGzipBytes <= report.thresholds.coreGzipBytes
  && report.summary.initialTransferBytes <= report.thresholds.initialTransferBytes;

await mkdir(outputDirectory, { recursive: true });
await writeFile(new URL('performance.json', outputDirectory), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.summary, null, 2));
if (!report.passes) {
  const traceBrowser = await chromium.launch();
  const traceContext = await traceBrowser.newContext({ viewport: { width: 1440, height: 900 } });
  await traceContext.tracing.start({ screenshots: true, snapshots: true, sources: true });
  try {
    const tracePage = await traceContext.newPage();
    await tracePage.goto(baseURL, { waitUntil: 'networkidle' });
    await tracePage.locator('[data-line-index="0"]').click();
    await tracePage.locator('[data-view="atlas"]').click();
    await tracePage.locator('[data-atlas-mode="matrix"]').click();
  } finally {
    await traceContext.tracing.stop({ path: fileURLToPath(new URL('failure-trace.zip', outputDirectory)) });
    await traceBrowser.close();
  }
  process.exitCode = 1;
}
