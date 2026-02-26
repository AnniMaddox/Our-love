function normalizeText(text: string) {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '')
    .replace(/[\t\f\v]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitMeaningfulLines(text: string) {
  return normalizeText(text)
    .split(/\n+/)
    .map((line) => line.replace(/[\u200b\u200c\u200d]/g, '').trim())
    .filter((line) => line.length > 0);
}

function toBaseTitle(name: string) {
  return name.replace(/\.(txt|md|docx?|json)$/i, '').trim();
}

function toDateAtMidnight(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  date.setHours(0, 0, 0, 0);
  return date;
}

export function parseDateFromText(source: string): Date | null {
  const input = source.trim();
  if (!input) return null;

  const ymdPatterns: RegExp[] = [
    /(?:^|[^\d])(19\d{2}|20\d{2})[\s_.\/-]*年?[\s_.\/-]*(1[0-2]|0?[1-9])[\s_.\/-]*月?[\s_.\/-]*(3[01]|[12]\d|0?[1-9])\s*日?(?=$|[^\d])/, 
    /(?:^|[^\d])(19\d{2}|20\d{2})(1[0-2]|0[1-9])(3[01]|[12]\d|0[1-9])(?=$|[^\d])/, 
  ];

  for (const pattern of ymdPatterns) {
    const matched = input.match(pattern);
    if (!matched) continue;
    const year = Number(matched[1]);
    const month = Number(matched[2]);
    const day = Number(matched[3]);
    const parsed = toDateAtMidnight(year, month, day);
    if (parsed) return parsed;
  }

  const mdyPattern = /(?:^|[^\d])(1[0-2]|0?[1-9])[\/.\-](3[01]|[12]\d|0?[1-9])[\/.\-](19\d{2}|20\d{2})(?=$|[^\d])/;
  const mdyMatch = input.match(mdyPattern);
  if (mdyMatch) {
    const month = Number(mdyMatch[1]);
    const day = Number(mdyMatch[2]);
    const year = Number(mdyMatch[3]);
    const parsed = toDateAtMidnight(year, month, day);
    if (parsed) return parsed;
  }

  return null;
}

export function pickLetterWrittenAt(params: { name: string; content: string }) {
  const { name, content } = params;
  const baseTitle = toBaseTitle(name);
  const lines = splitMeaningfulLines(content);
  const topLines = lines.slice(0, 3);
  const tailLines = lines.slice(-2);
  const dateCandidates = [name, baseTitle, ...topLines, ...tailLines];

  for (const candidate of dateCandidates) {
    const parsed = parseDateFromText(candidate);
    if (parsed) return parsed.getTime();
  }

  return null;
}
