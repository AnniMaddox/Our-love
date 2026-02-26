import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

import type { CalendarEntry, EmailRecord } from '../types/content';
import type { AppSettings } from '../types/settings';

const DB_NAME = 'm-love-memorial-db';
const DB_VERSION = 1;

type SettingsRow = {
  key: 'app';
  value: AppSettings;
};

type MetaRow = {
  key: string;
  value: string;
};

interface MemorialDB extends DBSchema {
  emails: {
    key: string;
    value: EmailRecord;
    indexes: {
      byUnlockAt: string;
    };
  };
  calendars: {
    key: string;
    value: CalendarEntry;
  };
  settings: {
    key: 'app';
    value: SettingsRow;
  };
  meta: {
    key: string;
    value: MetaRow;
  };
}

let dbPromise: Promise<IDBPDatabase<MemorialDB>> | null = null;

export function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<MemorialDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('emails')) {
          const emails = db.createObjectStore('emails', { keyPath: 'id' });
          emails.createIndex('byUnlockAt', 'unlockAtUtc');
        }

        if (!db.objectStoreNames.contains('calendars')) {
          db.createObjectStore('calendars', { keyPath: 'monthKey' });
        }

        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }

        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }
      },
    });
  }

  return dbPromise;
}
