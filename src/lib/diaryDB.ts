import { openDB } from 'idb';

const DB_NAME = 'diary-db';
const STORE = 'entries';
const DB_VERSION = 2;

export type StoredDiary = {
  name: string;        // filename (key)
  title: string;       // display title (filename without extension)
  content: string;     // plain text (TXT files)
  htmlContent: string; // converted HTML (DOCX via mammoth), empty for TXT
  importedAt: number;
};

async function openDiaryDb(version?: number) {
  return openDB(DB_NAME, version, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'name' });
      }
    },
  });
}

async function ensureDiaryStore() {
  let db = await openDiaryDb();
  if (db.objectStoreNames.contains(STORE)) {
    return db;
  }

  const targetVersion = Math.max(DB_VERSION, db.version + 1);
  db.close();
  db = await openDiaryDb(targetVersion);
  if (db.objectStoreNames.contains(STORE)) {
    return db;
  }

  db.close();
  db = await openDiaryDb(targetVersion + 1);
  if (db.objectStoreNames.contains(STORE)) {
    return db;
  }

  throw new Error('Failed to initialize diary object store');
}

function isMissingStoreError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const message = `${error.name} ${error.message}`.toLowerCase();
  return message.includes('object store') && message.includes('not found');
}

async function withDiaryStore<T>(task: (db: Awaited<ReturnType<typeof ensureDiaryStore>>) => Promise<T>) {
  let db = await ensureDiaryStore();
  try {
    return await task(db);
  } catch (error) {
    if (!isMissingStoreError(error)) {
      throw error;
    }

    db.close();
    db = await ensureDiaryStore();
    return await task(db);
  }
}

export async function saveDiaries(entries: StoredDiary[]): Promise<void> {
  await withDiaryStore(async (db) => {
    const tx = db.transaction(STORE, 'readwrite');
    for (const entry of entries) {
      await tx.store.put(entry);
    }
    await tx.done;
  });
}

export async function loadDiaries(): Promise<StoredDiary[]> {
  const all = await withDiaryStore(async (db) => db.getAll(STORE));
  return all.sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'));
}

export async function deleteDiary(name: string): Promise<void> {
  await withDiaryStore(async (db) => {
    await db.delete(STORE, name);
  });
}

export async function clearAllDiaries(): Promise<void> {
  await withDiaryStore(async (db) => {
    await db.clear(STORE);
  });
}

/** Parse a File into a StoredDiary. Supports .txt and .docx */
export async function parseDiaryFile(file: File): Promise<StoredDiary> {
  const name = file.name;
  const title = name.replace(/\.(txt|docx?)$/i, '');
  const importedAt = Date.now();

  if (/\.docx?$/i.test(name)) {
    const mammoth = await import('mammoth');
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer });
    return { name, title, content: '', htmlContent: result.value, importedAt };
  }

  // TXT (and any other text format)
  const content = await file.text();
  return { name, title, content, htmlContent: '', importedAt };
}
