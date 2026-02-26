import type { EmailRecord } from '../../types/content';

function cyrb53Hash(value: string) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;

  for (let i = 0; i < value.length; i += 1) {
    const ch = value.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36);
}

function normalizeHeaderName(name: string) {
  return name.trim().toLowerCase();
}

function decodeQuotedPrintableToUtf8(value: string) {
  const cleaned = value
    .replace(/=\r?\n/g, '')
    .replace(/_/g, ' ')
    .replace(/=([A-Fa-f0-9]{2})/g, (_match, hex) => String.fromCharCode(parseInt(hex, 16)));

  try {
    const bytes = Uint8Array.from(cleaned, (ch) => ch.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return cleaned;
  }
}

export function parseHeaders(headerText: string) {
  const headers: Record<string, string> = {};
  const lines = headerText.replace(/\r/g, '').split('\n');

  let currentKey = '';

  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }

    if ((line.startsWith(' ') || line.startsWith('\t')) && currentKey) {
      headers[currentKey] = `${headers[currentKey]} ${line.trim()}`;
      continue;
    }

    const separatorIndex = line.indexOf(':');
    if (separatorIndex < 0) {
      continue;
    }

    currentKey = normalizeHeaderName(line.slice(0, separatorIndex));
    headers[currentKey] = line.slice(separatorIndex + 1).trim();
  }

  return headers;
}

export function decodeMimeWord(input: string) {
  return input.replace(/=\?([^?]+)\?([bqBQ])\?([^?]+)\?=/g, (_match, charset, encoding, payload) => {
    const normalizedCharset = String(charset).toLowerCase();
    const normalizedEncoding = String(encoding).toLowerCase();

    if (normalizedCharset !== 'utf-8') {
      return payload;
    }

    try {
      if (normalizedEncoding === 'b') {
        const bytes = Uint8Array.from(atob(payload), (ch) => ch.charCodeAt(0));
        return new TextDecoder('utf-8').decode(bytes);
      }

      if (normalizedEncoding === 'q') {
        return decodeQuotedPrintableToUtf8(payload);
      }

      return payload;
    } catch {
      return payload;
    }
  });
}

export function decodeBody(payload: string, transferEncoding: string | undefined) {
  if (!transferEncoding) {
    return payload.trim();
  }

  const normalizedEncoding = transferEncoding.toLowerCase();

  if (normalizedEncoding === 'base64') {
    const compact = payload.replace(/\s+/g, '');

    try {
      const bytes = Uint8Array.from(atob(compact), (ch) => ch.charCodeAt(0));
      return new TextDecoder('utf-8').decode(bytes).trim();
    } catch {
      return payload.trim();
    }
  }

  if (normalizedEncoding === 'quoted-printable') {
    return decodeQuotedPrintableToUtf8(payload).trim();
  }

  return payload.trim();
}

function parseAddress(raw: string | undefined) {
  if (!raw) {
    return {
      name: null,
      address: null,
    };
  }

  const matched = raw.match(/^(.*)<([^>]+)>$/);
  if (!matched) {
    return {
      name: null,
      address: raw.trim(),
    };
  }

  return {
    name: decodeMimeWord(matched[1].trim().replace(/^"|"$/g, '')) || null,
    address: matched[2].trim() || null,
  };
}

function inferUnlockDateFromSourcePath(sourcePath: string) {
  const match = sourcePath.match(/(\d{4})[-_](\d{2})[-_](\d{2})(?:[T_ -]?(\d{2})[:\-]?(\d{2})?)?/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = match[4] ? Number(match[4]) : 0;
  const minute = match[5] ? Number(match[5]) : 0;

  const inferred = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (
    inferred.getFullYear() !== year ||
    inferred.getMonth() !== month - 1 ||
    inferred.getDate() !== day ||
    Number.isNaN(inferred.getTime())
  ) {
    return null;
  }

  return inferred;
}

export function parseEml(raw: string, sourcePath: string): EmailRecord {
  const splitIndex = raw.search(/\r?\n\r?\n/);
  const headerText = splitIndex >= 0 ? raw.slice(0, splitIndex) : raw;
  const bodyTextRaw = splitIndex >= 0 ? raw.slice(splitIndex).replace(/^\r?\n\r?\n/, '') : '';

  const headers = parseHeaders(headerText);

  const subjectRaw = headers.subject ?? null;
  const subject = subjectRaw ? decodeMimeWord(subjectRaw) : null;

  const from = parseAddress(headers.from);
  const to = parseAddress(headers.to);

  const dateHeaderRaw = headers.date ?? null;
  const headerDate = dateHeaderRaw ? new Date(dateHeaderRaw) : null;
  const inferredDate = inferUnlockDateFromSourcePath(sourcePath);
  const unlockDate = headerDate && !Number.isNaN(headerDate.getTime()) ? headerDate : inferredDate ?? new Date();
  const unlockAtUtc = unlockDate.toISOString();

  const bodyText = decodeBody(bodyTextRaw, headers['content-transfer-encoding']);

  const idSeed = `${sourcePath}::${headers['message-id'] ?? ''}::${unlockAtUtc}::${subject ?? ''}`;

  return {
    id: `eml_${cyrb53Hash(idSeed)}`,
    sourcePath,
    unlockAtUtc,
    dateHeaderRaw,
    fromName: from.name,
    fromAddress: from.address,
    toName: to.name,
    toAddress: to.address,
    subject,
    bodyText,
    rawHeaders: headers,
  };
}
