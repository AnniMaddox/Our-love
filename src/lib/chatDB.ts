import { openDB } from 'idb';

const DB_NAME = 'chat-profiles-db';
const STORE = 'profiles';

export type ChatProfile = {
  id: string;
  name: string;      // 顯示名稱，例如「和4o的對話」
  leftNick: string;  // 左側（assistant）暱稱，例如「M」
  rightNick: string; // 右側（user）暱稱，例如「你」
  leftAvatarDataUrl: string;
  rightAvatarDataUrl: string;
};

async function getDB() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    },
  });
}

export async function saveChatProfile(profile: ChatProfile): Promise<void> {
  const db = await getDB();
  await db.put(STORE, profile);
}

export async function loadChatProfiles(): Promise<ChatProfile[]> {
  const db = await getDB();
  return db.getAll(STORE);
}

export async function deleteChatProfile(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE, id);
}

export async function clearAllChatProfiles(): Promise<void> {
  const db = await getDB();
  await db.clear(STORE);
}
