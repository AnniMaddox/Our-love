import type { CalendarDay, CalendarMonth } from '../../types/content';

export function toMonthKeyFromDateKey(dateKey: string) {
  const parsed = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
}

function isDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeHoverPhrases(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const phrases = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);

  return phrases.length ? phrases : undefined;
}

function normalizeMessageList(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const messages = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);

  return messages.length ? messages : undefined;
}

function normalizeCalendarDayFromLooseRow(row: Record<string, unknown>) {
  const textCandidate = row.text ?? row.message ?? row.body ?? row.entry ?? row.content ?? row.note;

  return normalizeCalendarDay({
    ...row,
    ...(typeof textCandidate === 'string' ? { text: textCandidate } : {}),
  });
}

function normalizeCalendarDay(rawValue: unknown): CalendarDay | null {
  if (typeof rawValue === 'string') {
    return {
      text: rawValue,
    };
  }

  const messageListValue = normalizeMessageList(rawValue);
  if (messageListValue) {
    return {
      text: messageListValue[0],
      ...(messageListValue.length > 1 ? { messages: messageListValue } : {}),
    };
  }

  if (!rawValue || typeof rawValue !== 'object') {
    return null;
  }

  const row = rawValue as Record<string, unknown>;
  const textRaw = row.text ?? row.message ?? row.body;
  const messageListRaw = row.messages ?? row.texts ?? row.entries ?? row.notes ?? row.list;
  const messageList = normalizeMessageList(messageListRaw);

  const primaryText = messageList?.[0] ?? (typeof textRaw === 'string' ? textRaw : null);
  if (typeof primaryText !== 'string' || !primaryText.trim()) {
    return null;
  }

  const hoverPhrases =
    normalizeHoverPhrases(row.hoverPhrases) ??
    normalizeHoverPhrases(row.hover) ??
    normalizeHoverPhrases(row.openers);

  return {
    text: primaryText,
    ...(messageList && messageList.length > 1 ? { messages: messageList } : {}),
    ...(hoverPhrases ? { hoverPhrases } : {}),
  };
}

export function normalizeCalendarPayload(payload: unknown): CalendarMonth {
  if (!payload || typeof payload !== 'object') {
    return {};
  }

  const rawObject = payload as Record<string, unknown>;
  const result: CalendarMonth = {};

  for (const [key, rawValue] of Object.entries(rawObject)) {
    if (!isDateKey(key)) {
      continue;
    }

    const normalized = normalizeCalendarDay(rawValue);
    if (normalized) {
      result[key] = normalized;
    }
  }

  if (Object.keys(result).length > 0) {
    return result;
  }

  const days = rawObject.days;
  if (Array.isArray(days)) {
    for (const rawDay of days) {
      if (!rawDay || typeof rawDay !== 'object') {
        continue;
      }

      const dayRow = rawDay as Record<string, unknown>;
      const dateKey = dayRow.date ?? dayRow.dateKey;
      if (typeof dateKey !== 'string' || !isDateKey(dateKey)) {
        continue;
      }

      const normalized = normalizeCalendarDayFromLooseRow(dayRow);
      if (normalized) {
        result[dateKey] = normalized;
      }
    }

    if (Object.keys(result).length > 0) {
      return result;
    }
  }

  const singleDateKey = rawObject.date ?? rawObject.dateKey;
  if (typeof singleDateKey === 'string' && isDateKey(singleDateKey)) {
    const normalized = normalizeCalendarDayFromLooseRow(rawObject);
    if (normalized) {
      result[singleDateKey] = normalized;
    }
  }

  return result;
}

export function extractMonthKeyFromFileName(fileName: string) {
  const match = fileName.match(/(\d{4})[-_](\d{2})/);
  if (!match) {
    return null;
  }

  return `${match[1]}-${match[2]}`;
}

export function splitCalendarByMonth(data: CalendarMonth) {
  const grouped: Record<string, CalendarMonth> = {};

  for (const [dateKey, message] of Object.entries(data)) {
    const monthKey = toMonthKeyFromDateKey(dateKey);
    if (!monthKey) {
      continue;
    }

    if (!grouped[monthKey]) {
      grouped[monthKey] = {};
    }

    grouped[monthKey][dateKey] = message;
  }

  return grouped;
}

export function inferMonthKeyFromCalendar(data: CalendarMonth, fileName: string) {
  const fromName = extractMonthKeyFromFileName(fileName);
  if (fromName) {
    return fromName;
  }

  const firstKey = Object.keys(data).sort((a, b) => a.localeCompare(b))[0];
  return firstKey ? toMonthKeyFromDateKey(firstKey) : null;
}
