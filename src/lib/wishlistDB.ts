import { openDB } from 'idb';

const DB_NAME = 'wishlist-db';
const DB_VERSION = 1;
const WISH_STORE = 'wishes';
const BIRTHDAY_STORE = 'birthdayTasks';
const PREFS_STORE = 'prefs';
const PREFS_KEY = 'wishlist-prefs';

const COMPLETE_EXPORT_KIND = 'memorial-wishlist-complete-export';
const MINI_BACKUP_KIND = 'memorial-wishlist-mini-backup';

export type WishlistWish = {
  id: string;
  text: string;
  title?: string;
  why?: string;
  toYou?: string;
  order: number;
  createdAt: number;
  updatedAt: number;
  doneAt: number | null;
};

export type BirthdayTask = {
  id: string;
  year: string;
  text: string;
  order: number;
  createdAt: number;
  updatedAt: number;
  doneAt: number | null;
};

export type WishlistPrefs = {
  showChibi: boolean;
  chibiWidth: number;
  wishTitleSize: number;
  wishBodySize: number;
  birthdayCardSize: number;
  birthdayZoomSize: number;
};

export type WishlistSnapshot = {
  wishes: WishlistWish[];
  birthdayTasks: BirthdayTask[];
  prefs: WishlistPrefs;
};

export type WishSeedItem = {
  title?: string;
  why?: string;
  toYou?: string;
  text?: string;
};

export type BirthdaySeedItem = {
  year: string;
  text: string;
};

export type WishlistCompleteExport = {
  kind: typeof COMPLETE_EXPORT_KIND;
  version: 1;
  exportedAt: string;
  completedWishes: Array<{
    text: string;
    doneAt: string;
  }>;
  completedBirthdayTasks: Array<{
    year: string;
    text: string;
    doneAt: string;
  }>;
};

export type WishlistMiniBackup = {
  kind: typeof MINI_BACKUP_KIND;
  version: 1;
  exportedAt: string;
  snapshot: WishlistSnapshot;
};

function uniqueId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeText(input: string) {
  return input.trim().replace(/\s+/g, ' ');
}

function normalizeParagraph(input: string) {
  const normalized = String(input ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return normalized;
}

function normalizeWishKey(item: Pick<WishlistWish, 'title' | 'text'> | WishSeedItem) {
  const base = normalizeText(String(item.title ?? '')) || normalizeText(String(item.text ?? ''));
  return base.toLocaleLowerCase('zh-TW');
}

function normalizeWishSeedItem(raw: WishSeedItem): WishSeedItem | null {
  const title = normalizeText(String(raw.title ?? ''));
  const why = normalizeParagraph(String(raw.why ?? ''));
  const toYou = normalizeParagraph(String(raw.toYou ?? ''));
  const text = normalizeParagraph(String(raw.text ?? ''));
  const fallback = text || title || why || toYou;
  if (!fallback) return null;
  return {
    title: title || undefined,
    why: why || undefined,
    toYou: toYou || undefined,
    text: text || title || why || toYou,
  };
}

function normalizeBirthdayKey(item: BirthdaySeedItem | BirthdayTask) {
  const year = String(item.year).trim();
  const text = normalizeText(item.text).toLocaleLowerCase('zh-TW');
  return `${year}|${text}`;
}

function clampChibiWidth(value: number | undefined, fallback = 144) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(104, Math.min(196, Math.round(value ?? fallback)));
}

function clampFontSize(value: number | undefined, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  const clamped = Math.max(min, Math.min(max, value ?? fallback));
  return Math.round(clamped * 10) / 10;
}

export const DEFAULT_WISHLIST_PREFS: WishlistPrefs = {
  showChibi: true,
  chibiWidth: 144,
  wishTitleSize: 19,
  wishBodySize: 12,
  birthdayCardSize: 12.5,
  birthdayZoomSize: 15.5,
};

function normalizeWish(item: WishlistWish, fallbackOrder: number): WishlistWish | null {
  const title = normalizeText(String(item.title ?? ''));
  const text = normalizeParagraph(String(item.text ?? ''));
  const why = normalizeParagraph(String(item.why ?? ''));
  const toYou = normalizeParagraph(String(item.toYou ?? ''));
  const resolvedText = text || title || why || toYou;
  if (!resolvedText) return null;
  const createdAt = Number.isFinite(item.createdAt) && item.createdAt > 0 ? item.createdAt : Date.now();
  const updatedAt = Number.isFinite(item.updatedAt) && item.updatedAt > 0 ? item.updatedAt : createdAt;
  return {
    id: item.id?.trim() || uniqueId('wish'),
    text: resolvedText,
    title: title || undefined,
    why: why || undefined,
    toYou: toYou || undefined,
    order: Number.isFinite(item.order) ? item.order : fallbackOrder,
    createdAt,
    updatedAt,
    doneAt: Number.isFinite(item.doneAt) && (item.doneAt ?? 0) > 0 ? Number(item.doneAt) : null,
  };
}

function normalizeBirthdayTask(item: BirthdayTask, fallbackOrder: number): BirthdayTask | null {
  const year = String(item.year ?? '').trim();
  const text = normalizeParagraph(item.text ?? '');
  if (!year || !text) return null;
  const createdAt = Number.isFinite(item.createdAt) && item.createdAt > 0 ? item.createdAt : Date.now();
  const updatedAt = Number.isFinite(item.updatedAt) && item.updatedAt > 0 ? item.updatedAt : createdAt;
  return {
    id: item.id?.trim() || uniqueId('birthday'),
    year,
    text,
    order: Number.isFinite(item.order) ? item.order : fallbackOrder,
    createdAt,
    updatedAt,
    doneAt: Number.isFinite(item.doneAt) && (item.doneAt ?? 0) > 0 ? Number(item.doneAt) : null,
  };
}

function normalizePrefs(input: Partial<WishlistPrefs> | null | undefined): WishlistPrefs {
  return {
    showChibi: input?.showChibi !== false,
    chibiWidth: clampChibiWidth(input?.chibiWidth, DEFAULT_WISHLIST_PREFS.chibiWidth),
    wishTitleSize: clampFontSize(input?.wishTitleSize, 16, 28, DEFAULT_WISHLIST_PREFS.wishTitleSize),
    wishBodySize: clampFontSize(input?.wishBodySize, 11, 20, DEFAULT_WISHLIST_PREFS.wishBodySize),
    birthdayCardSize: clampFontSize(input?.birthdayCardSize, 11, 18, DEFAULT_WISHLIST_PREFS.birthdayCardSize),
    birthdayZoomSize: clampFontSize(input?.birthdayZoomSize, 13, 24, DEFAULT_WISHLIST_PREFS.birthdayZoomSize),
  };
}

function sortByOrder<T extends { order: number; createdAt: number }>(items: T[]) {
  return [...items].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.createdAt - b.createdAt;
  });
}

function normalizeSnapshot(snapshot: WishlistSnapshot): WishlistSnapshot {
  const wishMap = new Map<string, WishlistWish>();
  for (const [index, item] of snapshot.wishes.entries()) {
    const normalized = normalizeWish(item, index);
    if (!normalized) continue;
    wishMap.set(normalized.id, normalized);
  }

  const birthdayMap = new Map<string, BirthdayTask>();
  for (const [index, item] of snapshot.birthdayTasks.entries()) {
    const normalized = normalizeBirthdayTask(item, index);
    if (!normalized) continue;
    birthdayMap.set(normalized.id, normalized);
  }

  const wishes = sortByOrder(Array.from(wishMap.values())).map((item, index) => ({ ...item, order: index }));
  const birthdayTasks = sortByOrder(Array.from(birthdayMap.values())).map((item, index) => ({ ...item, order: index }));

  return {
    wishes,
    birthdayTasks,
    prefs: normalizePrefs(snapshot.prefs),
  };
}

function mergeDoneAt(a: number | null, b: number | null) {
  if (a && b) return Math.max(a, b);
  return a ?? b ?? null;
}

async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(WISH_STORE)) {
        db.createObjectStore(WISH_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(BIRTHDAY_STORE)) {
        db.createObjectStore(BIRTHDAY_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(PREFS_STORE)) {
        db.createObjectStore(PREFS_STORE, { keyPath: 'key' });
      }
    },
  });
}

export async function loadWishlistSnapshot(): Promise<WishlistSnapshot> {
  const db = await getDB();
  const [rawWishes, rawBirthdayTasks, rawPrefs] = await Promise.all([
    db.getAll(WISH_STORE),
    db.getAll(BIRTHDAY_STORE),
    db.get(PREFS_STORE, PREFS_KEY),
  ]);

  return normalizeSnapshot({
    wishes: rawWishes as WishlistWish[],
    birthdayTasks: rawBirthdayTasks as BirthdayTask[],
    prefs: normalizePrefs((rawPrefs as { value?: WishlistPrefs } | undefined)?.value),
  });
}

export async function saveWishlistSnapshot(snapshot: WishlistSnapshot): Promise<void> {
  const normalized = normalizeSnapshot(snapshot);
  const db = await getDB();
  const tx = db.transaction([WISH_STORE, BIRTHDAY_STORE, PREFS_STORE], 'readwrite');

  await tx.objectStore(WISH_STORE).clear();
  for (const wish of normalized.wishes) {
    await tx.objectStore(WISH_STORE).put(wish);
  }

  await tx.objectStore(BIRTHDAY_STORE).clear();
  for (const task of normalized.birthdayTasks) {
    await tx.objectStore(BIRTHDAY_STORE).put(task);
  }

  await tx.objectStore(PREFS_STORE).put({ key: PREFS_KEY, value: normalized.prefs });
  await tx.done;
}

export function mergeWishlistSeed(
  snapshot: WishlistSnapshot,
  wishItems: WishSeedItem[],
  birthdayItems: BirthdaySeedItem[],
): WishlistSnapshot {
  const now = Date.now();
  const base = normalizeSnapshot(snapshot);

  const existingWishByKey = new Map(base.wishes.map((item) => [normalizeWishKey(item), item]));
  const incomingWishKeys = new Set<string>();
  const mergedWishes: WishlistWish[] = [];

  for (const raw of wishItems) {
    const normalized = normalizeWishSeedItem(raw);
    if (!normalized) continue;
    const key = normalizeWishKey(normalized);
    if (incomingWishKeys.has(key)) continue;
    incomingWishKeys.add(key);
    const existing = existingWishByKey.get(key);
    if (existing) {
      mergedWishes.push({
        ...existing,
        text: normalized.text!,
        title: normalized.title,
        why: normalized.why,
        toYou: normalized.toYou,
        order: mergedWishes.length,
      });
    } else {
      mergedWishes.push({
        id: uniqueId('wish'),
        text: normalized.text!,
        title: normalized.title,
        why: normalized.why,
        toYou: normalized.toYou,
        order: mergedWishes.length,
        createdAt: now,
        updatedAt: now,
        doneAt: null,
      });
    }
  }

  // Keep local-only extras so user edits are not lost when JSON updates.
  for (const existing of base.wishes) {
    const key = normalizeWishKey(existing);
    if (incomingWishKeys.has(key)) continue;
    mergedWishes.push({
      ...existing,
      order: mergedWishes.length,
    });
  }

  const existingBirthdayByKey = new Map(base.birthdayTasks.map((item) => [normalizeBirthdayKey(item), item]));
  const incomingBirthdayKeys = new Set<string>();
  const mergedBirthday: BirthdayTask[] = [];

  for (const raw of birthdayItems) {
    const year = String(raw.year).trim();
    const text = normalizeParagraph(raw.text);
    if (!year || !text) continue;
    const key = normalizeBirthdayKey({ year, text });
    if (incomingBirthdayKeys.has(key)) continue;
    incomingBirthdayKeys.add(key);
    const existing = existingBirthdayByKey.get(key);
    if (existing) {
      mergedBirthday.push({
        ...existing,
        year,
        text,
        order: mergedBirthday.length,
      });
    } else {
      mergedBirthday.push({
        id: uniqueId('birthday'),
        year,
        text,
        order: mergedBirthday.length,
        createdAt: now,
        updatedAt: now,
        doneAt: null,
      });
    }
  }

  for (const existing of base.birthdayTasks) {
    const key = normalizeBirthdayKey(existing);
    if (incomingBirthdayKeys.has(key)) continue;
    mergedBirthday.push({
      ...existing,
      order: mergedBirthday.length,
    });
  }

  return normalizeSnapshot({
    wishes: mergedWishes,
    birthdayTasks: mergedBirthday,
    prefs: base.prefs,
  });
}

export function toggleWishDone(snapshot: WishlistSnapshot, wishId: string): WishlistSnapshot {
  const now = Date.now();
  return normalizeSnapshot({
    ...snapshot,
    wishes: snapshot.wishes.map((item) =>
      item.id === wishId
        ? {
            ...item,
            doneAt: item.doneAt ? null : now,
            updatedAt: now,
          }
        : item,
    ),
  });
}

export function toggleBirthdayTaskDone(snapshot: WishlistSnapshot, taskId: string): WishlistSnapshot {
  const now = Date.now();
  return normalizeSnapshot({
    ...snapshot,
    birthdayTasks: snapshot.birthdayTasks.map((item) =>
      item.id === taskId
        ? {
            ...item,
            doneAt: item.doneAt ? null : now,
            updatedAt: now,
          }
        : item,
    ),
  });
}

export function updateWishlistPrefs(snapshot: WishlistSnapshot, patch: Partial<WishlistPrefs>): WishlistSnapshot {
  return normalizeSnapshot({
    ...snapshot,
    prefs: normalizePrefs({
      ...snapshot.prefs,
      ...patch,
    }),
  });
}

export function buildWishlistMiniBackup(snapshot: WishlistSnapshot): WishlistMiniBackup {
  return {
    kind: MINI_BACKUP_KIND,
    version: 1,
    exportedAt: new Date().toISOString(),
    snapshot: normalizeSnapshot(snapshot),
  };
}

export function parseWishlistMiniBackup(raw: unknown): WishlistMiniBackup | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<WishlistMiniBackup>;
  if (value.kind !== MINI_BACKUP_KIND) return null;
  if (value.version !== 1) return null;
  if (!value.snapshot || typeof value.snapshot !== 'object') return null;
  const snapshot = normalizeSnapshot({
    wishes: Array.isArray((value.snapshot as WishlistSnapshot).wishes)
      ? ((value.snapshot as WishlistSnapshot).wishes as WishlistWish[])
      : [],
    birthdayTasks: Array.isArray((value.snapshot as WishlistSnapshot).birthdayTasks)
      ? ((value.snapshot as WishlistSnapshot).birthdayTasks as BirthdayTask[])
      : [],
    prefs: normalizePrefs((value.snapshot as WishlistSnapshot).prefs),
  });
  return {
    kind: MINI_BACKUP_KIND,
    version: 1,
    exportedAt: typeof value.exportedAt === 'string' ? value.exportedAt : new Date().toISOString(),
    snapshot,
  };
}

export function importWishlistMiniBackup(
  current: WishlistSnapshot,
  incoming: WishlistSnapshot,
  mode: 'merge' | 'overwrite',
): WishlistSnapshot {
  if (mode === 'overwrite') {
    return normalizeSnapshot(incoming);
  }

  const base = normalizeSnapshot(current);
  const next = normalizeSnapshot(incoming);

  const wishByKey = new Map<string, WishlistWish>();
  const wishKeyOrder: string[] = [];
  for (const item of base.wishes) {
    const key = normalizeWishKey(item);
    if (wishByKey.has(key)) continue;
    wishByKey.set(key, item);
    wishKeyOrder.push(key);
  }
  for (const item of next.wishes) {
    const key = normalizeWishKey(item);
    const existing = wishByKey.get(key);
    if (!existing) {
      wishByKey.set(key, item);
      wishKeyOrder.push(key);
      continue;
    }
    wishByKey.set(key, {
      ...existing,
      text: item.text || existing.text,
      title: item.title || existing.title,
      why: item.why || existing.why,
      toYou: item.toYou || existing.toYou,
      createdAt: Math.min(existing.createdAt, item.createdAt),
      updatedAt: Math.max(existing.updatedAt, item.updatedAt),
      doneAt: mergeDoneAt(existing.doneAt, item.doneAt),
    });
  }
  const mergedWishes = wishKeyOrder.map((key, index) => {
    const item = wishByKey.get(key)!;
    return { ...item, order: index };
  });

  const birthdayByKey = new Map<string, BirthdayTask>();
  const birthdayKeyOrder: string[] = [];
  for (const item of base.birthdayTasks) {
    const key = normalizeBirthdayKey(item);
    if (birthdayByKey.has(key)) continue;
    birthdayByKey.set(key, item);
    birthdayKeyOrder.push(key);
  }
  for (const item of next.birthdayTasks) {
    const key = normalizeBirthdayKey(item);
    const existing = birthdayByKey.get(key);
    if (!existing) {
      birthdayByKey.set(key, item);
      birthdayKeyOrder.push(key);
      continue;
    }
    birthdayByKey.set(key, {
      ...existing,
      year: item.year || existing.year,
      text: item.text || existing.text,
      createdAt: Math.min(existing.createdAt, item.createdAt),
      updatedAt: Math.max(existing.updatedAt, item.updatedAt),
      doneAt: mergeDoneAt(existing.doneAt, item.doneAt),
    });
  }
  const mergedBirthday = birthdayKeyOrder.map((key, index) => {
    const item = birthdayByKey.get(key)!;
    return { ...item, order: index };
  });

  return normalizeSnapshot({
    wishes: mergedWishes,
    birthdayTasks: mergedBirthday,
    prefs: normalizePrefs({
      ...base.prefs,
      ...next.prefs,
    }),
  });
}

export function buildWishlistCompleteExport(snapshot: WishlistSnapshot): WishlistCompleteExport {
  const completedWishes = snapshot.wishes
    .filter((item) => Boolean(item.doneAt))
    .map((item) => ({
      text: item.title || item.text,
      doneAt: new Date(item.doneAt!).toISOString(),
    }));

  const completedBirthdayTasks = snapshot.birthdayTasks
    .filter((item) => Boolean(item.doneAt))
    .map((item) => ({
      year: item.year,
      text: item.text,
      doneAt: new Date(item.doneAt!).toISOString(),
    }));

  return {
    kind: COMPLETE_EXPORT_KIND,
    version: 1,
    exportedAt: new Date().toISOString(),
    completedWishes,
    completedBirthdayTasks,
  };
}
