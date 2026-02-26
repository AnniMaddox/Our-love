import { openDB } from 'idb';

const DB_NAME = 'notes-db';
const STORE = 'notes';

export type StoredNote = {
  id: string;
  content: string;
  color: string;
  createdAt: number;
  updatedAt: number;
  wallOrder?: number;
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

export async function saveNote(note: StoredNote): Promise<void> {
  const db = await getDB();
  await db.put(STORE, note);
}

export async function loadNotes(): Promise<StoredNote[]> {
  const db = await getDB();
  const all = await db.getAll(STORE);
  return all.sort((a, b) => b.createdAt - a.createdAt); // newest first for timeline
}

export async function deleteNote(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE, id);
}

export async function clearAllNotes(): Promise<void> {
  const db = await getDB();
  await db.clear(STORE);
}

export async function importNotes(notes: StoredNote[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(STORE, 'readwrite');
  for (const note of notes) {
    await tx.store.put(note);
  }
  await tx.done;
}

export function generateNoteId(): string {
  return `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isValidNote(v: unknown): v is StoredNote {
  if (!v || typeof v !== 'object') return false;
  const n = v as Partial<StoredNote>;
  return (
    typeof n.id === 'string' &&
    typeof n.content === 'string' &&
    typeof n.color === 'string' &&
    typeof n.createdAt === 'number' &&
    typeof n.updatedAt === 'number' &&
    (n.wallOrder == null || (typeof n.wallOrder === 'number' && Number.isFinite(n.wallOrder)))
  );
}
