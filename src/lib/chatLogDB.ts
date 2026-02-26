import { openDB } from 'idb';

const DB_NAME = 'chat-log-db';
const STORE = 'chatLogs';

export type StoredChatLog = {
  name: string; // filename (used as key)
  content: string;
  importedAt: number;
  profileId?: string;
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

export async function saveChatLogs(logs: StoredChatLog[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(STORE, 'readwrite');
  for (const log of logs) {
    await tx.store.put(log);
  }
  await tx.done;
}

export async function loadChatLogs(): Promise<StoredChatLog[]> {
  const db = await getDB();
  const all = await db.getAll(STORE);
  return all.sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'));
}

export async function deleteChatLog(name: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE, name);
}

export async function clearAllChatLogs(): Promise<void> {
  const db = await getDB();
  await db.clear(STORE);
}
