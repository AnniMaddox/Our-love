import { normalizeCalendarPayload, splitCalendarByMonth } from './parsers/calendarParser';
import { parseEml } from './parsers/emailParser';
import { getCalendarMonth, putCalendarMonth } from './repositories/calendarRepo';
import { putEmails } from './repositories/emailRepo';
import { addNotifiedEmailIds } from './repositories/metaRepo';

import type { CalendarMonth, EmailRecord } from '../types/content';

type ImportResult = {
  imported: number;
  failed: number;
  messages: string[];
};

async function readFileAsText(file: File) {
  return file.text();
}

export async function importEmlFiles(files: File[]): Promise<ImportResult> {
  const parsed: EmailRecord[] = [];
  const messages: string[] = [];
  let failed = 0;

  for (const file of files) {
    try {
      const raw = await readFileAsText(file);
      const sourcePath = `upload/${Date.now()}-${file.name}`;
      parsed.push(parseEml(raw, sourcePath));
    } catch (error) {
      failed += 1;
      messages.push(`${file.name}: ${error instanceof Error ? error.message : 'read failed'}`);
    }
  }

  if (parsed.length > 0) {
    await putEmails(parsed);

    const nowMs = Date.now();
    const alreadyUnlocked = parsed
      .filter((email) => Date.parse(email.unlockAtUtc) <= nowMs)
      .map((email) => email.id);
    await addNotifiedEmailIds(alreadyUnlocked);
  }

  return {
    imported: parsed.length,
    failed,
    messages,
  };
}

export async function importCalendarFiles(files: File[]): Promise<ImportResult> {
  const messages: string[] = [];
  let imported = 0;
  let failed = 0;

  const mergedByMonth: Record<string, CalendarMonth> = {};

  for (const file of files) {
    try {
      const rawText = await readFileAsText(file);
      const parsedJson = JSON.parse(rawText) as unknown;
      const normalized = normalizeCalendarPayload(parsedJson);
      const grouped = splitCalendarByMonth(normalized);

      if (!Object.keys(grouped).length) {
        failed += 1;
        messages.push(`${file.name}: no valid YYYY-MM-DD entries`);
        continue;
      }

      for (const [monthKey, monthData] of Object.entries(grouped)) {
        if (!mergedByMonth[monthKey]) {
          mergedByMonth[monthKey] = {};
        }

        mergedByMonth[monthKey] = {
          ...mergedByMonth[monthKey],
          ...monthData,
        };
      }

      imported += 1;
    } catch (error) {
      failed += 1;
      messages.push(`${file.name}: ${error instanceof Error ? error.message : 'invalid JSON'}`);
    }
  }

  for (const [monthKey, importedData] of Object.entries(mergedByMonth)) {
    const existing = (await getCalendarMonth(monthKey)) ?? {};
    await putCalendarMonth(monthKey, {
      ...existing,
      ...importedData,
    });
  }

  return {
    imported,
    failed,
    messages,
  };
}
