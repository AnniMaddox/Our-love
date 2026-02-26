import { openDB } from 'idb';

const DB_NAME = 'letter-db';
const STORE = 'letters';

export type StoredLetter = {
  name: string;     // filename (used as key)
  content: string;  // plain text content
  importedAt: number;
  writtenAt?: number | null;
};

async function getDB() {
  return openDB(DB_NAME, 2, {
    upgrade(db) {
      // v1 store ('handles') is no longer needed — create the new letters store
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'name' });
      }
    },
  });
}

export async function saveLetters(letters: StoredLetter[]): Promise<void> {
  const d = await getDB();
  const tx = d.transaction(STORE, 'readwrite');
  for (const letter of letters) {
    await tx.store.put(letter);
  }
  await tx.done;
}

export async function loadLetters(): Promise<StoredLetter[]> {
  const d = await getDB();
  const all = await d.getAll(STORE);
  return all.sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'));
}

export async function deleteLetter(name: string): Promise<void> {
  const d = await getDB();
  await d.delete(STORE, name);
}

export async function clearAllLetters(): Promise<void> {
  const d = await getDB();
  await d.clear(STORE);
}
