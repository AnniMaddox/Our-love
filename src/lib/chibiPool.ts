const LEGACY_ACTIVE_BASE_CHIBI_POOL_STORAGE_KEY = 'memorial-active-base-chibi-pool-v1';
const LEGACY_ACTIVE_BASE_CHIBI_POOL_A_STORAGE_KEY = 'memorial-active-base-chibi-pool-a-v1';
const LEGACY_ACTIVE_BASE_CHIBI_POOL_B_STORAGE_KEY = 'memorial-active-base-chibi-pool-b-v1';
const ACTIVE_BASE_CHIBI_POOL_I_STORAGE_KEY = 'memorial-active-base-chibi-pool-i-v1';
const ACTIVE_BASE_CHIBI_POOL_II_STORAGE_KEY = 'memorial-active-base-chibi-pool-ii-v1';
const ACTIVE_BASE_CHIBI_MODE_STORAGE_KEY = 'memorial-active-base-chibi-mode-v1';
const ACTIVE_BASE_CHIBI_SIZE_STORAGE_KEY = 'memorial-active-base-chibi-size-v1';
const DEFAULT_POOL_SIZE = 60;
const MIN_POOL_SIZE = 20;

export const CHIBI_POOL_UPDATED_EVENT = 'memorial:chibi-pool-updated';

export type BaseChibiPoolMode = 'i' | 'ii' | 'all';

function toSortedSources(modules: Record<string, string>) {
  return Object.entries(modules)
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([, src]) => src);
}

const LEGACY_BASE_CHIBI_MODULES = import.meta.glob('../../public/chibi/*.{png,jpg,jpeg,webp,gif,avif}', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

const I_POOL_CHIBI_MODULES = import.meta.glob('../../public/chibi-pool-i/*.{png,jpg,jpeg,webp,gif,avif}', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

const II_POOL_CHIBI_MODULES = import.meta.glob('../../public/chibi-pool-ii/*.{png,jpg,jpeg,webp,gif,avif}', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

const LEGACY_BASE_CHIBI_SOURCES = toSortedSources(LEGACY_BASE_CHIBI_MODULES);
const I_POOL_CHIBI_SOURCES = toSortedSources(I_POOL_CHIBI_MODULES);
const II_POOL_CHIBI_SOURCES = toSortedSources(II_POOL_CHIBI_MODULES);

const MDIARY_CHIBI_MODULES = import.meta.glob('../../public/mdiary-chibi/*.{png,jpg,jpeg,webp,gif,avif}', {
  eager: true,
  import: 'default',
}) as Record<string, string>;
const FITNESS_CHIBI_MODULES = import.meta.glob('../../public/fitness-chibi/*.{png,jpg,jpeg,webp,gif,avif}', {
  eager: true,
  import: 'default',
}) as Record<string, string>;
const POMODORO_CHIBI_MODULES = import.meta.glob('../../public/pomodoro-chibi/*.{png,jpg,jpeg,webp,gif,avif}', {
  eager: true,
  import: 'default',
}) as Record<string, string>;
const NOTES_CHIBI_MODULES = import.meta.glob('../../public/notes-chibi/*.{png,jpg,jpeg,webp,gif,avif}', {
  eager: true,
  import: 'default',
}) as Record<string, string>;
const CALENDAR_CHIBI_MODULES = import.meta.glob('../../public/calendar-chibi/*.{png,jpg,jpeg,webp,gif,avif}', {
  eager: true,
  import: 'default',
}) as Record<string, string>;
const LETTERS_AB_CHIBI_MODULES = import.meta.glob('../../public/letters-ab-chibi/*.{png,jpg,jpeg,webp,gif,avif}', {
  eager: true,
  import: 'default',
}) as Record<string, string>;
const ARCHIVE_CHIBI_MODULES = import.meta.glob('../../public/archive-chibi/*.{png,jpg,jpeg,webp,gif,avif}', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

export type ScopedChibiPoolKey = 'mdiary' | 'fitness' | 'pomodoro' | 'notes' | 'calendar' | 'lettersAB' | 'archive';

const SCOPED_CHIBI_SOURCES: Record<ScopedChibiPoolKey, string[]> = {
  mdiary: toSortedSources(MDIARY_CHIBI_MODULES),
  fitness: toSortedSources(FITNESS_CHIBI_MODULES),
  pomodoro: toSortedSources(POMODORO_CHIBI_MODULES),
  notes: toSortedSources(NOTES_CHIBI_MODULES),
  calendar: toSortedSources(CALENDAR_CHIBI_MODULES),
  lettersAB: toSortedSources(LETTERS_AB_CHIBI_MODULES),
  archive: toSortedSources(ARCHIVE_CHIBI_MODULES),
};

type ChibiPoolInfo = {
  allCount: number;
  activeCount: number;
  targetCount: number;
};

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    unique.push(value);
  }
  return unique;
}

function getModeBaseSources(mode: 'i' | 'ii') {
  const primary = mode === 'i' ? I_POOL_CHIBI_SOURCES : II_POOL_CHIBI_SOURCES;
  if (primary.length) {
    return [...primary];
  }

  return [...LEGACY_BASE_CHIBI_SOURCES];
}

function getAllBaseSources() {
  if (I_POOL_CHIBI_SOURCES.length || II_POOL_CHIBI_SOURCES.length) {
    return uniqueStrings([...I_POOL_CHIBI_SOURCES, ...II_POOL_CHIBI_SOURCES]);
  }

  return [...LEGACY_BASE_CHIBI_SOURCES];
}

function getAvailableBaseSources(mode: BaseChibiPoolMode) {
  if (mode === 'all') {
    return getAllBaseSources();
  }
  return getModeBaseSources(mode);
}

function clampPoolSize(size: number, availableCount: number) {
  if (!availableCount) {
    return 0;
  }

  if (!Number.isFinite(size)) {
    return Math.min(DEFAULT_POOL_SIZE, availableCount);
  }

  const floorSize = Math.floor(size);
  const minSize = Math.min(MIN_POOL_SIZE, availableCount);
  return Math.max(minSize, Math.min(floorSize, availableCount));
}

function shuffleCopy<T>(items: T[]) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    const current = next[index]!;
    next[index] = next[randomIndex]!;
    next[randomIndex] = current;
  }
  return next;
}

function getPoolStorageKey(mode: 'i' | 'ii') {
  return mode === 'i' ? ACTIVE_BASE_CHIBI_POOL_I_STORAGE_KEY : ACTIVE_BASE_CHIBI_POOL_II_STORAGE_KEY;
}

function parseStoredPool(raw: string | null) {
  if (!raw) {
    return [] as string[];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((value): value is string => typeof value === 'string');
  } catch {
    return [];
  }
}

function readStoredMode(): BaseChibiPoolMode {
  if (typeof window === 'undefined') return 'i';
  try {
    const raw = window.localStorage.getItem(ACTIVE_BASE_CHIBI_MODE_STORAGE_KEY);
    if (raw === 'a') {
      return 'i';
    }
    if (raw === 'b') {
      return 'ii';
    }
    return raw === 'i' || raw === 'ii' || raw === 'all' ? raw : 'i';
  } catch {
    return 'i';
  }
}

function writeStoredMode(mode: BaseChibiPoolMode) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ACTIVE_BASE_CHIBI_MODE_STORAGE_KEY, mode);
  } catch {
    // ignore
  }
}

function readStoredPoolSize() {
  if (typeof window === 'undefined') return DEFAULT_POOL_SIZE;
  try {
    const raw = Number(window.localStorage.getItem(ACTIVE_BASE_CHIBI_SIZE_STORAGE_KEY) ?? DEFAULT_POOL_SIZE);
    return Number.isFinite(raw) ? raw : DEFAULT_POOL_SIZE;
  } catch {
    return DEFAULT_POOL_SIZE;
  }
}

function writeStoredPoolSize(size: number) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ACTIVE_BASE_CHIBI_SIZE_STORAGE_KEY, String(size));
  } catch {
    // ignore
  }
}

function resolvePoolMode(mode?: BaseChibiPoolMode) {
  if (mode === 'i' || mode === 'ii' || mode === 'all') {
    return mode;
  }
  return readStoredMode();
}

function resolvePoolSize(size?: number) {
  if (typeof size === 'number' && Number.isFinite(size)) {
    return Math.floor(size);
  }
  return Math.floor(readStoredPoolSize());
}

function readStoredPool(mode: 'i' | 'ii') {
  if (typeof window === 'undefined') {
    return [] as string[];
  }

  const currentKey = getPoolStorageKey(mode);
  const current = parseStoredPool(window.localStorage.getItem(currentKey));
  if (current.length) {
    return current;
  }

  // Backward-compat: migrate old A/B pool keys.
  if (mode === 'i') {
    const legacyA = parseStoredPool(window.localStorage.getItem(LEGACY_ACTIVE_BASE_CHIBI_POOL_A_STORAGE_KEY));
    if (legacyA.length) {
      return legacyA;
    }

    // Old single-pool key maps to the new I pool.
    const legacySingle = parseStoredPool(window.localStorage.getItem(LEGACY_ACTIVE_BASE_CHIBI_POOL_STORAGE_KEY));
    if (legacySingle.length) {
      return legacySingle;
    }
  }

  if (mode === 'ii') {
    const legacyB = parseStoredPool(window.localStorage.getItem(LEGACY_ACTIVE_BASE_CHIBI_POOL_B_STORAGE_KEY));
    if (legacyB.length) {
      return legacyB;
    }
  }

  return [];
}

function writeStoredPool(mode: 'i' | 'ii', pool: string[]) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const key = getPoolStorageKey(mode);
    window.localStorage.setItem(key, JSON.stringify(pool));

    // Keep old keys updated for compatibility with past builds.
    if (mode === 'i') {
      window.localStorage.setItem(LEGACY_ACTIVE_BASE_CHIBI_POOL_A_STORAGE_KEY, JSON.stringify(pool));
      window.localStorage.setItem(LEGACY_ACTIVE_BASE_CHIBI_POOL_STORAGE_KEY, JSON.stringify(pool));
    } else {
      window.localStorage.setItem(LEGACY_ACTIVE_BASE_CHIBI_POOL_B_STORAGE_KEY, JSON.stringify(pool));
    }
  } catch {
    // Ignore storage write failures to avoid crashing app render paths.
  }
}

function dispatchPoolUpdated(info: ChibiPoolInfo, mode: BaseChibiPoolMode) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(CHIBI_POOL_UPDATED_EVENT, {
      detail: {
        ...info,
        mode,
      },
    }),
  );
}

function normalizeStoredPool(mode: 'i' | 'ii', baseSources: string[]) {
  if (!baseSources.length) {
    return [];
  }

  const allowed = new Set(baseSources);
  return uniqueStrings(readStoredPool(mode).filter((item) => allowed.has(item)));
}

function samplePool(baseSources: string[], targetCount: number) {
  if (!baseSources.length || targetCount <= 0) {
    return [];
  }

  if (baseSources.length <= targetCount) {
    return [...baseSources];
  }

  return shuffleCopy(baseSources).slice(0, targetCount);
}

function syncPoolLength(pool: string[], targetCount: number, baseSources: string[]) {
  if (targetCount <= 0) {
    return [];
  }

  if (pool.length === targetCount) {
    return pool;
  }

  if (pool.length > targetCount) {
    return pool.slice(0, targetCount);
  }

  const poolSet = new Set(pool);
  const remaining = baseSources.filter((item) => !poolSet.has(item));
  return [...pool, ...shuffleCopy(remaining).slice(0, targetCount - pool.length)];
}

function buildPoolInfo(mode: BaseChibiPoolMode, activeCount: number, targetCount?: number): ChibiPoolInfo {
  const allCount = getAvailableBaseSources(mode).length;
  return {
    allCount,
    activeCount,
    targetCount: typeof targetCount === 'number' ? targetCount : allCount,
  };
}

export function getAllBaseChibiSources() {
  return getAllBaseSources();
}

export function getScopedChibiSources(scope: ScopedChibiPoolKey) {
  return [...(SCOPED_CHIBI_SOURCES[scope] ?? [])];
}

export function getScopedMixedChibiSources(
  scope: ScopedChibiPoolKey,
  poolSize?: number,
  mode?: BaseChibiPoolMode,
) {
  const scoped = getScopedChibiSources(scope);
  const activeBase = getActiveBaseChibiSources(poolSize, mode);

  if (!scoped.length) {
    return activeBase;
  }

  if (!activeBase.length) {
    return scoped;
  }

  const baseMixTarget = Math.max(4, Math.min(48, Math.round(Math.max(activeBase.length, 20) * 0.2)));
  const mixedBase = activeBase.slice(0, Math.min(baseMixTarget, activeBase.length));
  return uniqueStrings([...scoped, ...mixedBase]);
}

export function getActiveBaseChibiSources(poolSize?: number, mode?: BaseChibiPoolMode) {
  const resolvedMode = resolvePoolMode(mode);
  writeStoredMode(resolvedMode);

  const resolvedSize = resolvePoolSize(poolSize);
  writeStoredPoolSize(resolvedSize);

  const baseSources = getAvailableBaseSources(resolvedMode);
  if (resolvedMode === 'all') {
    return baseSources;
  }

  const targetCount = clampPoolSize(resolvedSize, baseSources.length);
  if (targetCount <= 0) {
    return [];
  }

  const normalized = syncPoolLength(normalizeStoredPool(resolvedMode, baseSources), targetCount, baseSources);
  if (normalized.length) {
    const rawLength = readStoredPool(resolvedMode).length;
    if (normalized.length !== rawLength) {
      writeStoredPool(resolvedMode, normalized);
    }
    return normalized;
  }

  const next = samplePool(baseSources, targetCount);
  writeStoredPool(resolvedMode, next);
  return next;
}

export function refreshActiveBaseChibiPool(poolSize?: number, mode?: BaseChibiPoolMode) {
  const resolvedMode = resolvePoolMode(mode);
  writeStoredMode(resolvedMode);

  const resolvedSize = resolvePoolSize(poolSize);
  writeStoredPoolSize(resolvedSize);

  const baseSources = getAvailableBaseSources(resolvedMode);
  let next: string[];
  let targetCount: number;

  if (resolvedMode === 'all') {
    next = baseSources;
    targetCount = baseSources.length;
  } else {
    targetCount = clampPoolSize(resolvedSize, baseSources.length);
    next = samplePool(baseSources, targetCount);
    writeStoredPool(resolvedMode, next);
  }

  const info = buildPoolInfo(resolvedMode, next.length, targetCount);
  dispatchPoolUpdated(info, resolvedMode);
  return next;
}

export function syncActiveBaseChibiPool(poolSize?: number, mode?: BaseChibiPoolMode) {
  const resolvedMode = resolvePoolMode(mode);
  writeStoredMode(resolvedMode);

  const resolvedSize = resolvePoolSize(poolSize);
  writeStoredPoolSize(resolvedSize);

  const baseSources = getAvailableBaseSources(resolvedMode);
  let next: string[];
  let targetCount: number;

  if (resolvedMode === 'all') {
    next = baseSources;
    targetCount = baseSources.length;
  } else {
    targetCount = clampPoolSize(resolvedSize, baseSources.length);
    next = syncPoolLength(normalizeStoredPool(resolvedMode, baseSources), targetCount, baseSources);
    writeStoredPool(resolvedMode, next);
  }

  const info = buildPoolInfo(resolvedMode, next.length, targetCount);
  dispatchPoolUpdated(info, resolvedMode);
  return next;
}

export function getBaseChibiPoolInfo(poolSize?: number, mode?: BaseChibiPoolMode): ChibiPoolInfo {
  const resolvedMode = resolvePoolMode(mode);
  const active = getActiveBaseChibiSources(poolSize, resolvedMode);

  if (resolvedMode === 'all') {
    return buildPoolInfo(resolvedMode, active.length, active.length);
  }

  const allCount = getAvailableBaseSources(resolvedMode).length;
  const targetCount = clampPoolSize(resolvePoolSize(poolSize), allCount);
  return buildPoolInfo(resolvedMode, active.length, targetCount);
}
