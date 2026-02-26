export function toMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function todayDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function formatDisplayDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function monthLabel(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, (month || 1) - 1, 1);

  if (Number.isNaN(date.getTime())) {
    return monthKey;
  }

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'long',
  }).format(date);
}

function parseMonthKey(monthKey: string) {
  const [yearRaw, monthRaw] = monthKey.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  return { year, month };
}

export function buildContinuousMonthKeys(monthKeys: string[], fallbackMonthKey = toMonthKey(), minEndYear?: number) {
  const unique = Array.from(new Set(monthKeys)).sort((a, b) => a.localeCompare(b));
  const fallbackParsed = parseMonthKey(fallbackMonthKey);

  let minYear: number;
  let maxYear: number;

  if (!unique.length) {
    const fallbackYear = fallbackParsed?.year ?? new Date().getFullYear();
    minYear = fallbackYear;
    maxYear = fallbackYear;
  } else {
    const first = parseMonthKey(unique[0]);
    const last = parseMonthKey(unique[unique.length - 1]);

    minYear = first?.year ?? (fallbackParsed?.year ?? new Date().getFullYear());
    maxYear = last?.year ?? minYear;
  }

  if (fallbackParsed) {
    minYear = Math.min(minYear, fallbackParsed.year);
    maxYear = Math.max(maxYear, fallbackParsed.year);
  }

  if (Number.isFinite(minEndYear)) {
    maxYear = Math.max(maxYear, Number(minEndYear));
  }

  const result: string[] = [];
  for (let year = minYear; year <= maxYear; year += 1) {
    for (let month = 1; month <= 12; month += 1) {
      result.push(`${year}-${String(month).padStart(2, '0')}`);
    }
  }

  return result;
}
