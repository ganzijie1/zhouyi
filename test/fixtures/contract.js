import assert from 'node:assert/strict';

export async function loadProductionModule(relativeUrl, requiredExports) {
  let module;
  try {
    module = await import(new URL(relativeUrl, import.meta.url));
  } catch (error) {
    assert.fail(`生产模块尚未实现：${relativeUrl}\n${error.code ?? error.name}: ${error.message}`);
  }

  for (const name of requiredExports) {
    assert.equal(typeof module[name], 'function', `生产模块 ${relativeUrl} 必须导出函数 ${name}`);
  }
  return module;
}

export async function loadProductionData(relativeUrl, requiredExports) {
  let module;
  try {
    module = await import(new URL(relativeUrl, import.meta.url));
  } catch (error) {
    assert.fail(`生产数据模块尚未实现：${relativeUrl}\n${error.code ?? error.name}: ${error.message}`);
  }
  for (const name of requiredExports) {
    assert.ok(name in module, `生产数据模块 ${relativeUrl} 必须导出 ${name}`);
  }
  return module;
}

export function states() {
  return Array.from({ length: 64 }, (_, value) => value);
}

export function statePairs() {
  return states().flatMap((left) => states().map((right) => [left, right]));
}

export function popcount(value) {
  let count = 0;
  for (let bit = value & 63; bit !== 0; bit &= bit - 1) count++;
  return count;
}

export function reverseSixBits(value) {
  let result = 0;
  for (let index = 0; index < 6; index++) result |= ((value >> index) & 1) << (5 - index);
  return result;
}

export function createMemoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    get length() { return data.size; },
    key(index) { return [...data.keys()][index] ?? null; },
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(String(key), String(value)); },
    removeItem(key) { data.delete(String(key)); },
    clear() { data.clear(); },
    snapshot() { return Object.fromEntries(data); }
  };
}
