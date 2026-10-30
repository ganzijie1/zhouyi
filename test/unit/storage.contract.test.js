import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemoryStorage, loadProductionData } from '../fixtures/contract.js';

async function storageModule() {
  return loadProductionData('../../src/services/storage.js', [
    'STORAGE_KEYS', 'CURRENT_STORAGE_VERSION', 'defaultProgress', 'defaultSettings',
    'loadProgress', 'saveProgress', 'loadSettings', 'saveSettings', 'clearProgress'
  ]);
}

test('存档模块提供版本化、分键存储契约', { concurrency: false }, async () => {
  await storageModule();
});

test('全新存储返回确定默认进度与设置，且设置键与进度键隔离', { concurrency: false }, async () => {
  const m = await storageModule();
  const storage = createMemoryStorage();
  assert.notEqual(m.STORAGE_KEYS.progress, m.STORAGE_KEYS.settings);
  assert.deepEqual(m.loadProgress(storage), m.defaultProgress());
  assert.deepEqual(m.loadSettings(storage), m.defaultSettings());
});

test('合法进度往返保持最佳成绩并拒绝回退', { concurrency: false }, async () => {
  const m = await storageModule();
  const storage = createMemoryStorage();
  const progress = m.defaultProgress();
  progress.highestUnlockedLevel = 4;
  progress.bestSteps[0] = 3;
  progress.stars[0] = 3;
  m.saveProgress(storage, progress);
  assert.deepEqual(m.loadProgress(storage), progress);
});

test('损坏 JSON、错误类型、越界数组与未来版本均安全回退', { concurrency: false }, async () => {
  const m = await storageModule();
  for (const payload of [
    '{bad json',
    JSON.stringify({ version: m.CURRENT_STORAGE_VERSION, highestUnlockedLevel: 99, bestSteps: [], stars: [] }),
    JSON.stringify({ version: m.CURRENT_STORAGE_VERSION + 1, highestUnlockedLevel: 12, bestSteps: [], stars: [] }),
    JSON.stringify(['not-an-object'])
  ]) {
    const storage = createMemoryStorage({ [m.STORAGE_KEYS.progress]: payload });
    assert.deepEqual(m.loadProgress(storage), m.defaultProgress());
  }
});

test('旧版本迁移保留已知合法字段、忽略未知字段', { concurrency: false }, async () => {
  const m = await storageModule();
  const old = {
    version: 0,
    unlocked: 3,
    best: { 1: 2, 2: 4 },
    ratings: { 1: 3, 2: 2 },
    unknown: 'ignored'
  };
  const storage = createMemoryStorage({ [m.STORAGE_KEYS.progress]: JSON.stringify(old) });
  const migrated = m.loadProgress(storage);
  assert.equal(migrated.version, m.CURRENT_STORAGE_VERSION);
  assert.equal(migrated.highestUnlockedLevel, 3);
  assert.deepEqual(migrated.bestSteps.slice(0, 2), [2, 4]);
  assert.deepEqual(migrated.stars.slice(0, 2), [3, 2]);
  assert.equal('unknown' in migrated, false);
});

test('清除进度不得删除音效与减弱动态设置', { concurrency: false }, async () => {
  const m = await storageModule();
  const storage = createMemoryStorage();
  m.saveProgress(storage, { ...m.defaultProgress(), highestUnlockedLevel: 5 });
  m.saveSettings(storage, { muted: true, reducedMotion: true });
  m.clearProgress(storage);
  assert.deepEqual(m.loadProgress(storage), m.defaultProgress());
  assert.deepEqual(m.loadSettings(storage), { muted: true, reducedMotion: true });
});
