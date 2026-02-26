import { getDb } from '../db';

import type { EmailRecord, EmailViewRecord } from '../../types/content';

function toUnlocked(record: EmailRecord, nowMs: number) {
  const unlockMs = Date.parse(record.unlockAtUtc);
  const isUnlocked = Number.isFinite(unlockMs) ? unlockMs <= nowMs : true;

  return {
    ...record,
    isUnlocked,
  } satisfies EmailViewRecord;
}

export async function putEmails(emails: EmailRecord[]) {
  const db = await getDb();
  const tx = db.transaction('emails', 'readwrite');

  await Promise.all(emails.map((email) => tx.store.put(email)));
  await tx.done;
}

export async function deleteEmailsByIds(ids: string[]) {
  if (!ids.length) {
    return;
  }

  const db = await getDb();
  const tx = db.transaction('emails', 'readwrite');
  await Promise.all(ids.map((id) => tx.store.delete(id)));
  await tx.done;
}

export async function listEmails(options?: { includeLocked?: boolean; nowMs?: number }) {
  const includeLocked = options?.includeLocked ?? true;
  const nowMs = options?.nowMs ?? Date.now();

  const db = await getDb();
  const all = await db.getAll('emails');

  return all
    .map((record) => toUnlocked(record, nowMs))
    .filter((record) => includeLocked || record.isUnlocked)
    .sort((a, b) => Date.parse(b.unlockAtUtc) - Date.parse(a.unlockAtUtc));
}

export async function getEmailById(id: string, nowMs = Date.now()) {
  const db = await getDb();
  const record = await db.get('emails', id);

  if (!record) {
    return null;
  }

  return toUnlocked(record, nowMs);
}

export async function countEmails() {
  const db = await getDb();
  return db.count('emails');
}
