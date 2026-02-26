import { normalizeCalendarPayload, splitCalendarByMonth } from './parsers/calendarParser';
import { parseEml } from './parsers/emailParser';
import { countCalendarMonths, putCalendarMonth } from './repositories/calendarRepo';
import { countEmails, deleteEmailsByIds, listEmails, putEmails } from './repositories/emailRepo';

import type { CalendarMonth } from '../types/content';

const calendarModules = import.meta.glob('../../data/calendar/**/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>;

const emlModules = import.meta.glob('../../data/emails/**/*.eml', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>;

function isSameBundledEmail(existing: {
  unlockAtUtc: string;
  dateHeaderRaw: string | null;
  fromName: string | null;
  fromAddress: string | null;
  toName: string | null;
  toAddress: string | null;
  subject: string | null;
  bodyText: string;
}, next: {
  unlockAtUtc: string;
  dateHeaderRaw: string | null;
  fromName: string | null;
  fromAddress: string | null;
  toName: string | null;
  toAddress: string | null;
  subject: string | null;
  bodyText: string;
}) {
  return (
    existing.unlockAtUtc === next.unlockAtUtc &&
    existing.dateHeaderRaw === next.dateHeaderRaw &&
    existing.fromName === next.fromName &&
    existing.fromAddress === next.fromAddress &&
    existing.toName === next.toName &&
    existing.toAddress === next.toAddress &&
    existing.subject === next.subject &&
    existing.bodyText === next.bodyText
  );
}

export async function seedDatabaseIfNeeded() {
  const [emailCount, calendarCount] = await Promise.all([countEmails(), countCalendarMonths()]);
  let seeded = false;

  if (calendarCount === 0) {
    const grouped: Record<string, CalendarMonth> = {};

    for (const rawCalendarData of Object.values(calendarModules)) {
      const normalized = normalizeCalendarPayload(rawCalendarData);
      const byMonth = splitCalendarByMonth(normalized);

      for (const [monthKey, monthData] of Object.entries(byMonth)) {
        if (!grouped[monthKey]) {
          grouped[monthKey] = {};
        }

        grouped[monthKey] = {
          ...grouped[monthKey],
          ...monthData,
        };
      }
    }

    await Promise.all(Object.entries(grouped).map(([monthKey, data]) => putCalendarMonth(monthKey, data)));
    seeded = true;
  }

  const parsedEmails = Object.entries(emlModules)
    .map(([path, raw]) => parseEml(raw, path))
    .sort((a, b) => Date.parse(a.unlockAtUtc) - Date.parse(b.unlockAtUtc));

  if (emailCount === 0) {
    if (parsedEmails.length > 0) {
      await putEmails(parsedEmails);
      seeded = true;
    }
  } else if (parsedEmails.length > 0) {
    // Keep uploaded letters, sync bundled EML by sourcePath (append + update).
    const existingEmails = await listEmails({ includeLocked: true });
    const existingBySourcePath = new Map<string, typeof existingEmails>();
    for (const email of existingEmails) {
      const list = existingBySourcePath.get(email.sourcePath);
      if (list) {
        list.push(email);
      } else {
        existingBySourcePath.set(email.sourcePath, [email]);
      }
    }

    const toUpsert: typeof parsedEmails = [];
    const staleIds = new Set<string>();

    for (const parsedEmail of parsedEmails) {
      const existingMatches = existingBySourcePath.get(parsedEmail.sourcePath) ?? [];
      if (!existingMatches.length) {
        toUpsert.push(parsedEmail);
        continue;
      }

      const exactMatch = existingMatches.find((item) => isSameBundledEmail(item, parsedEmail));
      if (!exactMatch) {
        toUpsert.push(parsedEmail);
      }

      for (const item of existingMatches) {
        if (item.id !== parsedEmail.id) {
          staleIds.add(item.id);
        }
      }
    }

    if (staleIds.size > 0) {
      await deleteEmailsByIds(Array.from(staleIds));
      seeded = true;
    }
    if (toUpsert.length > 0) {
      await putEmails(toUpsert);
      seeded = true;
    }
  }

  const [nextEmailCount, nextCalendarCount] = await Promise.all([countEmails(), countCalendarMonths()]);

  return {
    seeded,
    emailCount: nextEmailCount,
    calendarCount: nextCalendarCount,
  };
}
