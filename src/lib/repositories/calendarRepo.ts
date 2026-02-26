import { getDb } from '../db';
import { normalizeCalendarPayload } from '../parsers/calendarParser';

import type { CalendarMonth } from '../../types/content';

export async function putCalendarMonth(monthKey: string, data: CalendarMonth) {
  const db = await getDb();
  await db.put('calendars', { monthKey, data: normalizeCalendarPayload(data) });
}

export async function getCalendarMonth(monthKey: string) {
  const db = await getDb();
  const row = await db.get('calendars', monthKey);

  return row?.data ? normalizeCalendarPayload(row.data) : null;
}

export async function listCalendarMonths() {
  const db = await getDb();
  const all = await db.getAll('calendars');

  return all
    .map((entry) => ({
      ...entry,
      data: normalizeCalendarPayload(entry.data),
    }))
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}

export async function countCalendarMonths() {
  const db = await getDb();
  return db.count('calendars');
}
