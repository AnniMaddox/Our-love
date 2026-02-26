import { openDB } from 'idb';

const DB_NAME = 'm-diary-db';
const STORE = 'entries';
const LEGACY_DB_NAME = 'diary-db';
const DIARY_B_META_STORAGE_KEY = 'memorial-diary-b-meta-v1';

export type StoredMDiary = {
  name: string;
  title: string;
  content: string;
  htmlContent: string;
  importedAt: number;
};

async function getDB() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'name' });
      }
    },
  });
}

function normalizeLegacyEntry(value: unknown): StoredMDiary | null {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Record<string, unknown>;

  const name = typeof entry.name === 'string' ? entry.name : '';
  const title = typeof entry.title === 'string' ? entry.title : name.replace(/\.(txt|docx?)$/i, '');
  const content = typeof entry.content === 'string' ? entry.content : '';
  const htmlContent = typeof entry.htmlContent === 'string' ? entry.htmlContent : '';
  const importedAtValue = typeof entry.importedAt === 'number' ? entry.importedAt : Number(entry.importedAt);
  const importedAt = Number.isFinite(importedAtValue) && importedAtValue > 0 ? importedAtValue : Date.now();

  if (!name) return null;
  return {
    name,
    title: title || name,
    content,
    htmlContent,
    importedAt,
  };
}

function getDiaryBEntryNames() {
  if (typeof window === 'undefined') return new Set<string>();
  try {
    const raw = window.localStorage.getItem(DIARY_B_META_STORAGE_KEY);
    if (!raw) return new Set<string>();
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return new Set<string>();
    return new Set(Object.keys(parsed as Record<string, unknown>));
  } catch {
    return new Set<string>();
  }
}

async function migrateFromLegacyDiaryDbIfNeeded(currentEntries: StoredMDiary[]) {
  if (currentEntries.length > 0) return currentEntries;

  try {
    const legacyDb = await openDB(LEGACY_DB_NAME);
    if (!legacyDb.objectStoreNames.contains(STORE)) {
      return currentEntries;
    }

    const legacyRaw = await legacyDb.getAll(STORE);
    const legacy = legacyRaw
      .map(normalizeLegacyEntry)
      .filter((entry): entry is StoredMDiary => Boolean(entry));

    if (!legacy.length) return currentEntries;

    const diaryBEntryNames = getDiaryBEntryNames();
    const filtered = diaryBEntryNames.size
      ? legacy.filter((entry) => !diaryBEntryNames.has(entry.name))
      : legacy;

    if (!filtered.length) return currentEntries;

    await saveMDiaries(filtered);
    return filtered.sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'));
  } catch {
    return currentEntries;
  }
}

export async function saveMDiaries(entries: StoredMDiary[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(STORE, 'readwrite');
  for (const entry of entries) {
    await tx.store.put(entry);
  }
  await tx.done;
}

export async function loadMDiaries(): Promise<StoredMDiary[]> {
  const db = await getDB();
  const all = await db.getAll(STORE);
  const sorted = all.sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'));
  return migrateFromLegacyDiaryDbIfNeeded(sorted);
}

export async function clearAllMDiaries(): Promise<void> {
  const db = await getDB();
  await db.clear(STORE);
}

export async function deleteMDiary(name: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE, name);
}

/** Parse a File into a StoredMDiary. Supports .txt and .docx */
export async function parseMDiaryFile(file: File): Promise<StoredMDiary> {
  const name = file.name;
  const title = name.replace(/\.(txt|docx?)$/i, '');
  const importedAt = Date.now();

  if (/\.docx?$/i.test(name)) {
    const mammoth = await import('mammoth');
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer });
    return { name, title, content: '', htmlContent: result.value, importedAt };
  }

  const content = await file.text();
  return { name, title, content, htmlContent: '', importedAt };
}
