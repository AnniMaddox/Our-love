import type { HoverToneWeights } from '../types/settings';

export type HoverToneCategory = 'clingy' | 'confession' | 'calm' | 'remorse' | 'general';

export type HoverPoolEntry = {
  phrase: string;
  category: HoverToneCategory;
};

const hoverPoolModules = import.meta.glob('../../data/獨立hover詞庫/**/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>;

const CATEGORY_ORDER: HoverToneCategory[] = ['clingy', 'confession', 'calm', 'remorse', 'general'];

function detectCategoryFromText(input: string): HoverToneCategory | null {
  const text = input.toLowerCase();

  if (text.includes('黏') || text.includes('cling')) {
    return 'clingy';
  }
  if (text.includes('表白') || text.includes('confess') || text.includes('認真')) {
    return 'confession';
  }
  if (text.includes('冷靜') || text.includes('守候') || text.includes('calm')) {
    return 'calm';
  }
  if (text.includes('懺悔') || text.includes('破防') || text.includes('apolog') || text.includes('sorry')) {
    return 'remorse';
  }

  return null;
}

function inferCategoryFromKey(rawKey: string, fallback: HoverToneCategory) {
  if (/^v\d+$/i.test(rawKey.trim())) {
    return fallback;
  }

  return detectCategoryFromText(rawKey) ?? fallback;
}

function collectEntries(input: unknown, bucket: HoverPoolEntry[], currentCategory: HoverToneCategory) {
  if (typeof input === 'string') {
    const phrase = input.trim();
    if (phrase) {
      bucket.push({
        phrase,
        category: currentCategory,
      });
    }
    return;
  }

  if (Array.isArray(input)) {
    for (const item of input) {
      collectEntries(item, bucket, currentCategory);
    }
    return;
  }

  if (!input || typeof input !== 'object') {
    return;
  }

  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const nextCategory = inferCategoryFromKey(key, currentCategory);
    collectEntries(value, bucket, nextCategory);
  }
}

const globalHoverEntries = (() => {
  const collected: HoverPoolEntry[] = [];

  for (const [path, payload] of Object.entries(hoverPoolModules)) {
    const pathCategory = detectCategoryFromText(path) ?? 'general';
    collectEntries(payload, collected, pathCategory);
  }

  const dedup = new Map<string, HoverPoolEntry>();
  for (const entry of collected) {
    if (!dedup.has(entry.phrase)) {
      dedup.set(entry.phrase, entry);
    }
  }

  return Array.from(dedup.values());
})();

function normalizeWeight(value: unknown) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 1;
  }

  if (value < 0) {
    return 0;
  }

  return value;
}

function normalizeWeights(weights: HoverToneWeights) {
  return {
    clingy: normalizeWeight(weights.clingy),
    confession: normalizeWeight(weights.confession),
    calm: normalizeWeight(weights.calm),
    remorse: normalizeWeight(weights.remorse),
    general: normalizeWeight(weights.general),
  } satisfies Record<HoverToneCategory, number>;
}

function randomPick<T>(arr: T[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function getGlobalHoverPoolEntries() {
  return globalHoverEntries;
}

export function getGlobalHoverPhrases() {
  return globalHoverEntries.map((entry) => entry.phrase);
}

export function pickHoverPhraseByWeights(pool: HoverPoolEntry[], weights: HoverToneWeights) {
  if (!pool.length) {
    return '';
  }

  const normalizedWeights = normalizeWeights(weights);
  const byCategory = new Map<HoverToneCategory, string[]>();

  for (const category of CATEGORY_ORDER) {
    byCategory.set(category, []);
  }

  for (const entry of pool) {
    byCategory.get(entry.category)?.push(entry.phrase);
  }

  const weightedCategories = CATEGORY_ORDER.filter(
    (category) => (byCategory.get(category)?.length ?? 0) > 0 && normalizedWeights[category] > 0,
  );

  const categories = weightedCategories.length
    ? weightedCategories
    : CATEGORY_ORDER.filter((category) => (byCategory.get(category)?.length ?? 0) > 0);

  if (!categories.length) {
    return randomPick(pool).phrase;
  }

  const totalWeight = categories.reduce((sum, category) => sum + normalizedWeights[category], 0);

  if (totalWeight <= 0) {
    const merged = categories.flatMap((category) => byCategory.get(category) ?? []);
    return randomPick(merged);
  }

  let cursor = Math.random() * totalWeight;
  for (const category of categories) {
    cursor -= normalizedWeights[category];
    if (cursor <= 0) {
      const poolForCategory = byCategory.get(category) ?? [];
      return randomPick(poolForCategory);
    }
  }

  const fallbackCategory = categories[categories.length - 1];
  return randomPick(byCategory.get(fallbackCategory) ?? []);
}
