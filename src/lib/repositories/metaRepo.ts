import { getDb } from '../db';

const NOTIFIED_EMAIL_IDS_KEY = 'notified-email-ids-v1';
const READ_EMAIL_IDS_KEY = 'read-email-ids-v1';
const STARRED_EMAIL_IDS_KEY = 'starred-email-ids-v1';
const HOVER_PHRASE_MAP_KEY = 'hover-phrase-map-v1';

export async function getNotifiedEmailIds() {
  const db = await getDb();
  const row = await db.get('meta', NOTIFIED_EMAIL_IDS_KEY);

  if (!row?.value) {
    return new Set<string>();
  }

  try {
    const parsed = JSON.parse(row.value) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set<string>();
  }
}

export async function setNotifiedEmailIds(ids: Set<string>) {
  const db = await getDb();
  await db.put('meta', {
    key: NOTIFIED_EMAIL_IDS_KEY,
    value: JSON.stringify(Array.from(ids)),
  });
}

export async function addNotifiedEmailId(id: string) {
  const ids = await getNotifiedEmailIds();
  ids.add(id);
  await setNotifiedEmailIds(ids);
}

export async function addNotifiedEmailIds(nextIds: string[]) {
  if (!nextIds.length) {
    return;
  }

  const ids = await getNotifiedEmailIds();
  for (const id of nextIds) {
    ids.add(id);
  }

  await setNotifiedEmailIds(ids);
}

export async function getReadEmailIds() {
  const db = await getDb();
  const row = await db.get('meta', READ_EMAIL_IDS_KEY);

  if (!row?.value) {
    return new Set<string>();
  }

  try {
    const parsed = JSON.parse(row.value) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set<string>();
  }
}

export async function setReadEmailIds(ids: Set<string>) {
  const db = await getDb();
  await db.put('meta', {
    key: READ_EMAIL_IDS_KEY,
    value: JSON.stringify(Array.from(ids)),
  });
}

export async function addReadEmailId(id: string) {
  const ids = await getReadEmailIds();
  ids.add(id);
  await setReadEmailIds(ids);
}

export async function getStarredEmailIds() {
  const db = await getDb();
  const row = await db.get('meta', STARRED_EMAIL_IDS_KEY);

  if (!row?.value) {
    return new Set<string>();
  }

  try {
    const parsed = JSON.parse(row.value) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set<string>();
  }
}

export async function setStarredEmailIds(ids: Set<string>) {
  const db = await getDb();
  await db.put('meta', {
    key: STARRED_EMAIL_IDS_KEY,
    value: JSON.stringify(Array.from(ids)),
  });
}

export async function getHoverPhraseMap() {
  const db = await getDb();
  const row = await db.get('meta', HOVER_PHRASE_MAP_KEY);

  if (!row?.value) {
    return {} as Record<string, string>;
  }

  try {
    const parsed = JSON.parse(row.value) as Record<string, unknown>;
    const result: Record<string, string> = {};

    for (const [dateKey, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && value.trim()) {
        result[dateKey] = value;
      }
    }

    return result;
  } catch {
    return {} as Record<string, string>;
  }
}

export async function setHoverPhraseMap(map: Record<string, string>) {
  const db = await getDb();
  await db.put('meta', {
    key: HOVER_PHRASE_MAP_KEY,
    value: JSON.stringify(map),
  });
}
