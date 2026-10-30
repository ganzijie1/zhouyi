export const CURRENT_STORAGE_VERSION = 1;
export const STORAGE_KEYS = { progress: 'yijing-math.progress.v1', settings: 'yijing-math.settings.v1' };

export const defaultProgress = () => ({ version: CURRENT_STORAGE_VERSION, highestUnlockedLevel: 1, bestSteps: Array(12).fill(null), stars: Array(12).fill(0) });
export const defaultSettings = () => ({ muted: false, reducedMotion: false });

function validProgress(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && value.version === CURRENT_STORAGE_VERSION
    && Number.isInteger(value.highestUnlockedLevel) && value.highestUnlockedLevel >= 1 && value.highestUnlockedLevel <= 12
    && Array.isArray(value.bestSteps) && value.bestSteps.length === 12 && value.bestSteps.every((n) => n === null || (Number.isInteger(n) && n > 0))
    && Array.isArray(value.stars) && value.stars.length === 12 && value.stars.every((n) => Number.isInteger(n) && n >= 0 && n <= 3);
}

function migrate(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 0) return null;
  const next = defaultProgress();
  next.highestUnlockedLevel = Number.isInteger(value.unlocked) && value.unlocked >= 1 && value.unlocked <= 12 ? value.unlocked : 1;
  for (let index = 0; index < 12; index++) {
    const best = value.best?.[index + 1];
    const rating = value.ratings?.[index + 1];
    if (Number.isInteger(best) && best > 0) next.bestSteps[index] = best;
    if (Number.isInteger(rating) && rating >= 0 && rating <= 3) next.stars[index] = rating;
  }
  return next;
}

export function loadProgress(storage = localStorage) {
  try {
    const raw = storage.getItem(STORAGE_KEYS.progress);
    if (raw === null) return defaultProgress();
    const value = JSON.parse(raw);
    if (validProgress(value)) return {
      version: CURRENT_STORAGE_VERSION,
      highestUnlockedLevel: value.highestUnlockedLevel,
      bestSteps: [...value.bestSteps],
      stars: [...value.stars]
    };
    return migrate(value) ?? defaultProgress();
  } catch { return defaultProgress(); }
}

export function saveProgress(storage = localStorage, progress) {
  if (!validProgress(progress)) throw new TypeError('进度格式无效');
  storage.setItem(STORAGE_KEYS.progress, JSON.stringify(progress));
}

export function loadSettings(storage = localStorage) {
  try {
    const value = JSON.parse(storage.getItem(STORAGE_KEYS.settings));
    if (typeof value?.muted === 'boolean' && typeof value?.reducedMotion === 'boolean') return { muted: value.muted, reducedMotion: value.reducedMotion };
  } catch { /* 返回默认设置 */ }
  return defaultSettings();
}

export function saveSettings(storage = localStorage, settings) {
  if (typeof settings?.muted !== 'boolean' || typeof settings?.reducedMotion !== 'boolean') throw new TypeError('设置格式无效');
  storage.setItem(STORAGE_KEYS.settings, JSON.stringify({ muted: settings.muted, reducedMotion: settings.reducedMotion }));
}

export function clearProgress(storage = localStorage) { storage.removeItem(STORAGE_KEYS.progress); }
