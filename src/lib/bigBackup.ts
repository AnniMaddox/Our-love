import { clearAllChatProfiles, loadChatProfiles, saveChatProfile, type ChatProfile } from './chatDB';
import { clearAllChatLogs, loadChatLogs, saveChatLogs, type StoredChatLog } from './chatLogDB';
import { getDb } from './db';
import { clearAllDiaries, loadDiaries, saveDiaries, type StoredDiary } from './diaryDB';
import { clearAllLetters, loadLetters, saveLetters, type StoredLetter } from './letterDB';
import { clearAllMDiaries, loadMDiaries, saveMDiaries, type StoredMDiary } from './mDiaryDB';
import { clearAllNotes, importNotes, loadNotes, type StoredNote } from './noteDB';
import { clearAllSoulmateData, loadSoulmateSnapshot, mergeSoulmateSnapshot, replaceSoulmateSnapshot, type SoulmateSnapshot } from './soulmateDB';
import { normalizeCalendarPayload } from './parsers/calendarParser';
import { putCalendarMonth, listCalendarMonths } from './repositories/calendarRepo';
import { putEmails, listEmails } from './repositories/emailRepo';
import type { CalendarMonth, EmailRecord, EmailViewRecord } from '../types/content';

export type BackupImportMode = 'merge' | 'overwrite';

type BackupDomain = 'aboutMe' | 'aboutM';
export type AboutMePart = 'diaryB' | 'notes' | 'period' | 'checkin';
export type AboutMPart = 'mDiary' | 'letters' | 'chatLogs' | 'inbox' | 'soulmate' | 'other';
type BackupPart = AboutMePart | AboutMPart;

const MANIFEST_KIND = 'memorial-big-backup-manifest';
const PART_KIND = 'memorial-big-backup-part';
const BACKUP_VERSION = 1;

const DIARY_B_META_STORAGE_KEY = 'memorial-diary-b-meta-v1';
const PERIOD_STORAGE_KEY = 'memorial-period-diary-v1';
const PERIOD_POST_END_SEEN_KEY = 'memorial-period-post-end-seen-v1';
const CHECKIN_STORAGE_KEY = 'memorial-checkin-store-v1';
const M_DIARY_FAVORITES_KEY = 'memorial-m-diary-favorites-v1';
const LETTER_FAVORITES_KEY = 'memorial-letter-favorites-v1';
const MEMO_PREFS_KEY = 'memorial-memo-prefs-v1';
const MEMO_FAVORITES_KEY = 'memorial-memo-favorites-v1';
const MEMO_HIDDEN_KEY = 'memorial-memo-hidden-v1';
const SELF_INTRO_PREFS_KEY = 'memorial-self-intro-prefs-v1';
const SELF_INTRO_PRESET_STORE_KEY = 'memorial-self-intro-preset-store-v1';
const SELF_INTRO_LEGACY_CARD_COPY_KEY = 'memorial-self-intro-card-copy-v1';
const SELF_INTRO_LEGACY_HERO_COPY_KEY = 'memorial-self-intro-hero-copy-v1';

const ABOUT_ME_REQUIRED_PARTS: AboutMePart[] = ['diaryB', 'notes', 'period', 'checkin'];
const ABOUT_M_REQUIRED_PARTS: AboutMPart[] = ['mDiary', 'letters', 'chatLogs', 'inbox', 'soulmate', 'other'];

const ABOUT_M_OTHER_STORAGE_KEYS = [
  MEMO_PREFS_KEY,
  MEMO_FAVORITES_KEY,
  MEMO_HIDDEN_KEY,
  SELF_INTRO_PREFS_KEY,
  SELF_INTRO_PRESET_STORE_KEY,
  SELF_INTRO_LEGACY_CARD_COPY_KEY,
  SELF_INTRO_LEGACY_HERO_COPY_KEY,
] as const;

const INBOX_META_KEYS = ['notified-email-ids-v1', 'read-email-ids-v1', 'starred-email-ids-v1', 'hover-phrase-map-v1'] as const;

type BackupManifest = {
  kind: typeof MANIFEST_KIND;
  version: typeof BACKUP_VERSION;
  domain: BackupDomain;
  createdAt: string;
  files: Array<{
    part: BackupPart;
    filename: string;
    count?: number;
  }>;
};

type BackupPartPayload = {
  kind: typeof PART_KIND;
  version: typeof BACKUP_VERSION;
  domain: BackupDomain;
  part: BackupPart;
  createdAt: string;
};

type DiaryBPartPayload = BackupPartPayload & {
  domain: 'aboutMe';
  part: 'diaryB';
  entries: StoredDiary[];
  metaMap: Record<string, { mood?: string; favorite?: boolean }>;
};

type NotesPartPayload = BackupPartPayload & {
  domain: 'aboutMe';
  part: 'notes';
  entries: StoredNote[];
};

type PeriodPartPayload = BackupPartPayload & {
  domain: 'aboutMe';
  part: 'period';
  store: Record<string, unknown> | null;
  seenPostEndDates: string[];
};

type CheckinPartPayload = BackupPartPayload & {
  domain: 'aboutMe';
  part: 'checkin';
  store: Record<string, unknown> | null;
};

type MDiaryPartPayload = BackupPartPayload & {
  domain: 'aboutM';
  part: 'mDiary';
  entries: StoredMDiary[];
  favorites: string[];
};

type LettersPartPayload = BackupPartPayload & {
  domain: 'aboutM';
  part: 'letters';
  entries: StoredLetter[];
  favorites: string[];
};

type ChatLogsPartPayload = BackupPartPayload & {
  domain: 'aboutM';
  part: 'chatLogs';
  entries: StoredChatLog[];
  profiles: ChatProfile[];
};

type InboxPartPayload = BackupPartPayload & {
  domain: 'aboutM';
  part: 'inbox';
  emails: EmailRecord[];
  calendars: Array<{ monthKey: string; data: CalendarMonth }>;
  meta: Record<string, string>;
};

type SoulmatePartPayload = BackupPartPayload & {
  domain: 'aboutM';
  part: 'soulmate';
  snapshot: SoulmateSnapshot;
};

type OtherPartPayload = BackupPartPayload & {
  domain: 'aboutM';
  part: 'other';
  storage: Record<string, string>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readLocalStorageRaw(key: string) {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocalStorageRaw(key: string, value: string | null) {
  if (typeof window === 'undefined') return;
  try {
    if (value === null) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore write errors.
  }
}

function readLocalStorageJson<T>(key: string, fallback: T): T {
  const raw = readLocalStorageRaw(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeLocalStorageJson(key: string, value: unknown) {
  writeLocalStorageRaw(key, JSON.stringify(value));
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  const deduped = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    deduped.add(trimmed);
  }
  return Array.from(deduped);
}

function formatFileTimestamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}-${hour}${minute}${second}`;
}

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(href);
}

function dedupeByName<T extends { name: string }>(items: T[]) {
  const map = new Map<string, T>();
  for (const item of items) {
    map.set(item.name, item);
  }
  return Array.from(map.values());
}

function normalizeTimestamp(value: unknown, fallback: number) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return fallback;
}

function normalizeStoredDiaryArray(value: unknown): StoredDiary[] {
  if (!Array.isArray(value)) return [];
  const now = Date.now();
  const normalized: StoredDiary[] = [];

  value.forEach((item, index) => {
    if (!isRecord(item)) return;
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    if (!name) return;

    const titleRaw = typeof item.title === 'string' ? item.title.trim() : '';
    const title = titleRaw || name.replace(/\.(txt|docx?)$/i, '') || name;
    const content = typeof item.content === 'string' ? item.content : '';
    const htmlContent = typeof item.htmlContent === 'string' ? item.htmlContent : '';
    const importedAt = normalizeTimestamp(item.importedAt, now + index);

    normalized.push({
      name,
      title,
      content,
      htmlContent,
      importedAt,
    });
  });

  return dedupeByName(normalized);
}

function normalizeStoredMDiaryArray(value: unknown): StoredMDiary[] {
  if (!Array.isArray(value)) return [];
  const now = Date.now();
  const normalized: StoredMDiary[] = [];

  value.forEach((item, index) => {
    if (!isRecord(item)) return;
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    if (!name) return;

    const titleRaw = typeof item.title === 'string' ? item.title.trim() : '';
    const title = titleRaw || name.replace(/\.(txt|docx?)$/i, '') || name;
    const content = typeof item.content === 'string' ? item.content : '';
    const htmlContent = typeof item.htmlContent === 'string' ? item.htmlContent : '';
    const importedAt = normalizeTimestamp(item.importedAt, now + index);

    normalized.push({
      name,
      title,
      content,
      htmlContent,
      importedAt,
    });
  });

  return dedupeByName(normalized);
}

function normalizeStoredLetterArray(value: unknown): StoredLetter[] {
  if (!Array.isArray(value)) return [];
  const now = Date.now();
  const normalized: StoredLetter[] = [];

  value.forEach((item, index) => {
    if (!isRecord(item)) return;
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    if (!name) return;

    const content = typeof item.content === 'string' ? item.content : '';
    const importedAt = normalizeTimestamp(item.importedAt, now + index);
    const writtenAt = normalizeTimestamp(item.writtenAt, 0);
    normalized.push({
      name,
      content,
      importedAt,
      writtenAt: writtenAt > 0 ? writtenAt : null,
    });
  });

  return dedupeByName(normalized);
}

function normalizeStoredChatLogArray(value: unknown): StoredChatLog[] {
  if (!Array.isArray(value)) return [];
  const now = Date.now();
  const normalized: StoredChatLog[] = [];

  value.forEach((item, index) => {
    if (!isRecord(item)) return;
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    if (!name) return;

    const content = typeof item.content === 'string' ? item.content : '';
    const importedAt = normalizeTimestamp(item.importedAt, now + index);
    const profileId = typeof item.profileId === 'string' && item.profileId.trim() ? item.profileId.trim() : undefined;
    normalized.push({ name, content, importedAt, profileId });
  });

  return dedupeByName(normalized);
}

function normalizeChatProfileArray(value: unknown): ChatProfile[] {
  if (!Array.isArray(value)) return [];
  const normalized: ChatProfile[] = [];

  value.forEach((item) => {
    if (!isRecord(item)) return;
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    if (!id || !name) return;

    normalized.push({
      id,
      name,
      leftNick: typeof item.leftNick === 'string' ? item.leftNick : 'M',
      rightNick: typeof item.rightNick === 'string' ? item.rightNick : '你',
      leftAvatarDataUrl: typeof item.leftAvatarDataUrl === 'string' ? item.leftAvatarDataUrl : '',
      rightAvatarDataUrl: typeof item.rightAvatarDataUrl === 'string' ? item.rightAvatarDataUrl : '',
    });
  });

  return normalized;
}

function normalizeSoulmateSnapshotPayload(value: unknown): SoulmateSnapshot {
  if (!isRecord(value)) {
    return { boxes: [], entries: [] };
  }
  const boxes = Array.isArray(value.boxes) ? (value.boxes as SoulmateSnapshot['boxes']) : [];
  const entries = Array.isArray(value.entries) ? (value.entries as SoulmateSnapshot['entries']) : [];
  return { boxes, entries };
}

function normalizeStoredNoteArray(value: unknown): StoredNote[] {
  if (!Array.isArray(value)) return [];
  const now = Date.now();
  const normalized: StoredNote[] = [];

  value.forEach((item, index) => {
    if (!isRecord(item)) return;
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    if (!id) return;

    const content = typeof item.content === 'string' ? item.content : '';
    const color = typeof item.color === 'string' ? item.color : '#FFF3B0';
    const createdAt = normalizeTimestamp(item.createdAt, now + index);
    const updatedAt = normalizeTimestamp(item.updatedAt, createdAt);

    normalized.push({
      id,
      content,
      color,
      createdAt,
      updatedAt,
    });
  });

  const map = new Map<string, StoredNote>();
  normalized.forEach((note) => map.set(note.id, note));
  return Array.from(map.values());
}

function toEmailRecord(value: EmailViewRecord): EmailRecord {
  const { isUnlocked: _isUnlocked, ...record } = value;
  return record;
}

function normalizeEmailArray(value: unknown): EmailRecord[] {
  if (!Array.isArray(value)) return [];
  const normalized: EmailRecord[] = [];

  value.forEach((item) => {
    if (!isRecord(item)) return;
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    if (!id) return;

    const sourcePath = typeof item.sourcePath === 'string' ? item.sourcePath : `import/${id}`;
    const unlockAtUtc = typeof item.unlockAtUtc === 'string' ? item.unlockAtUtc : new Date().toISOString();

    normalized.push({
      id,
      sourcePath,
      unlockAtUtc,
      dateHeaderRaw: typeof item.dateHeaderRaw === 'string' || item.dateHeaderRaw === null ? item.dateHeaderRaw : null,
      fromName: typeof item.fromName === 'string' || item.fromName === null ? item.fromName : null,
      fromAddress: typeof item.fromAddress === 'string' || item.fromAddress === null ? item.fromAddress : null,
      toName: typeof item.toName === 'string' || item.toName === null ? item.toName : null,
      toAddress: typeof item.toAddress === 'string' || item.toAddress === null ? item.toAddress : null,
      subject: typeof item.subject === 'string' || item.subject === null ? item.subject : null,
      bodyText: typeof item.bodyText === 'string' ? item.bodyText : '',
      rawHeaders: isRecord(item.rawHeaders)
        ? Object.fromEntries(
            Object.entries(item.rawHeaders)
              .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
              .map(([key, val]) => [key, val]),
          )
        : {},
    });
  });

  const map = new Map<string, EmailRecord>();
  normalized.forEach((email) => map.set(email.id, email));
  return Array.from(map.values());
}

function normalizeCalendarRows(value: unknown): Array<{ monthKey: string; data: CalendarMonth }> {
  if (!Array.isArray(value)) return [];
  const normalized: Array<{ monthKey: string; data: CalendarMonth }> = [];

  value.forEach((item) => {
    if (!isRecord(item)) return;
    const monthKey = typeof item.monthKey === 'string' ? item.monthKey.trim() : '';
    if (!monthKey) return;

    normalized.push({
      monthKey,
      data: normalizeCalendarPayload(item.data),
    });
  });

  const map = new Map<string, CalendarMonth>();
  normalized.forEach((row) => map.set(row.monthKey, row.data));
  return Array.from(map.entries()).map(([monthKey, data]) => ({ monthKey, data }));
}

function normalizeMetaMap(value: unknown) {
  if (!isRecord(value)) return {} as Record<string, string>;
  const normalized: Record<string, string> = {};
  for (const key of INBOX_META_KEYS) {
    const raw = value[key];
    if (typeof raw === 'string') {
      normalized[key] = raw;
    }
  }
  return normalized;
}

function normalizeDiaryBMetaMap(value: unknown) {
  if (!isRecord(value)) return {} as Record<string, { mood?: string; favorite?: boolean }>;
  const normalized: Record<string, { mood?: string; favorite?: boolean }> = {};

  Object.entries(value).forEach(([entryName, rawMeta]) => {
    if (!entryName.trim() || !isRecord(rawMeta)) return;
    const mood = typeof rawMeta.mood === 'string' && rawMeta.mood.trim() ? rawMeta.mood : undefined;
    const favorite = typeof rawMeta.favorite === 'boolean' ? rawMeta.favorite : undefined;
    normalized[entryName] = { mood, favorite };
  });

  return normalized;
}

function mergeUniqueStrings(existing: string[], incoming: string[]) {
  const deduped = new Set<string>(existing);
  incoming.forEach((item) => deduped.add(item));
  return Array.from(deduped);
}

function mergePeriodStore(
  existingRaw: Record<string, unknown> | null,
  incomingRaw: Record<string, unknown>,
): Record<string, unknown> {
  const existing = existingRaw ?? {};
  const merged: Record<string, unknown> = {
    ...existing,
    ...incomingRaw,
  };

  const existingRecords = Array.isArray(existing.records) ? existing.records.filter(isRecord) : [];
  const incomingRecords = Array.isArray(incomingRaw.records) ? incomingRaw.records.filter(isRecord) : [];

  if (existingRecords.length || incomingRecords.length) {
    const map = new Map<string, Record<string, unknown>>();

    const putRecord = (record: Record<string, unknown>) => {
      const id = typeof record.id === 'string' && record.id.trim() ? record.id.trim() : '';
      const startDate = typeof record.startDate === 'string' ? record.startDate : '';
      const endDate = typeof record.endDate === 'string' ? record.endDate : '';
      const fallbackKey = `${startDate}-${endDate}-${String(record.createdAt ?? '')}`;
      map.set(id || fallbackKey || `record-${map.size + 1}`, record);
    };

    existingRecords.forEach(putRecord);
    incomingRecords.forEach(putRecord);
    merged.records = Array.from(map.values());
  }

  return merged;
}

function mergeCheckinStore(
  existingRaw: Record<string, unknown> | null,
  incomingRaw: Record<string, unknown>,
): Record<string, unknown> {
  const existing = existingRaw ?? {};
  const existingSignIns = isRecord(existing.signIns) ? existing.signIns : {};
  const incomingSignIns = isRecord(incomingRaw.signIns) ? incomingRaw.signIns : {};

  return {
    ...existing,
    ...incomingRaw,
    signIns: {
      ...existingSignIns,
      ...incomingSignIns,
    },
  };
}

async function loadInboxMetaMap() {
  const db = await getDb();
  const rows = await Promise.all(INBOX_META_KEYS.map((key) => db.get('meta', key)));
  const map: Record<string, string> = {};

  rows.forEach((row) => {
    if (!row || typeof row.value !== 'string') return;
    map[row.key] = row.value;
  });

  return map;
}

async function clearInboxData() {
  const db = await getDb();
  await Promise.all([db.clear('emails'), db.clear('calendars')]);
  await Promise.all(INBOX_META_KEYS.map((key) => db.delete('meta', key)));
}

async function applyInboxMeta(meta: Record<string, string>, mode: BackupImportMode) {
  const db = await getDb();
  const tasks: Promise<unknown>[] = [];

  for (const key of INBOX_META_KEYS) {
    if (typeof meta[key] === 'string') {
      tasks.push(
        db.put('meta', {
          key,
          value: meta[key],
        }),
      );
      continue;
    }

    if (mode === 'overwrite') {
      tasks.push(db.delete('meta', key));
    }
  }

  await Promise.all(tasks);
}

function loadAboutMOtherStorageMap() {
  const map: Record<string, string> = {};
  for (const key of ABOUT_M_OTHER_STORAGE_KEYS) {
    const raw = readLocalStorageRaw(key);
    if (typeof raw !== 'string') continue;
    map[key] = raw;
  }
  return map;
}

function normalizeAboutMOtherStorageMap(value: unknown) {
  if (!isRecord(value)) return {} as Record<string, string>;
  const map: Record<string, string> = {};
  for (const key of ABOUT_M_OTHER_STORAGE_KEYS) {
    const raw = value[key];
    if (typeof raw !== 'string') continue;
    map[key] = raw;
  }
  return map;
}

function clearAboutMOtherStorage() {
  for (const key of ABOUT_M_OTHER_STORAGE_KEYS) {
    writeLocalStorageRaw(key, null);
  }
}

function createManifest(domain: BackupDomain, files: BackupManifest['files']): BackupManifest {
  return {
    kind: MANIFEST_KIND,
    version: BACKUP_VERSION,
    domain,
    createdAt: new Date().toISOString(),
    files,
  };
}

function isManifest(value: unknown): value is BackupManifest {
  if (!isRecord(value)) return false;
  return (
    value.kind === MANIFEST_KIND &&
    value.version === BACKUP_VERSION &&
    (value.domain === 'aboutMe' || value.domain === 'aboutM') &&
    Array.isArray(value.files)
  );
}

function isPartPayload(value: unknown): value is BackupPartPayload {
  if (!isRecord(value)) return false;
  if (value.kind !== PART_KIND || value.version !== BACKUP_VERSION) return false;
  if (value.domain !== 'aboutMe' && value.domain !== 'aboutM') return false;
  if (typeof value.part !== 'string' || !value.part.trim()) return false;
  return true;
}

async function parsePackageFiles(files: File[], expectedDomain: BackupDomain) {
  if (!files.length) {
    throw new Error('沒有選到備份檔案。');
  }

  const parsedEntries: Array<{ fileName: string; payload: unknown }> = [];
  for (const file of files) {
    const text = await file.text();
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(`JSON 解析失敗：${file.name}`);
    }
    parsedEntries.push({ fileName: file.name, payload });
  }

  let manifest: BackupManifest | null = null;
  const parts = new Map<BackupPart, Record<string, unknown>>();

  for (const entry of parsedEntries) {
    if (isManifest(entry.payload)) {
      if (entry.payload.domain !== expectedDomain) {
        continue;
      }
      manifest = entry.payload;
      continue;
    }

    if (!isPartPayload(entry.payload)) {
      continue;
    }

    if (entry.payload.domain !== expectedDomain) {
      continue;
    }

    parts.set(entry.payload.part as BackupPart, entry.payload);
  }

  if (!manifest) {
    throw new Error('缺少 metadata 索引檔（manifest.json）。請同時選取整包備份檔案。');
  }

  const expectedParts = manifest.files
    .map((item) => item.part)
    .filter((part): part is BackupPart => typeof part === 'string');

  return {
    manifest,
    parts,
    expectedParts,
  };
}

async function parsePartFiles(files: File[], expectedDomain: BackupDomain) {
  if (!files.length) {
    throw new Error('沒有選到備份檔案。');
  }

  const parts = new Map<BackupPart, Record<string, unknown>>();

  for (const file of files) {
    const text = await file.text();
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(`JSON 解析失敗：${file.name}`);
    }

    if (!isPartPayload(payload)) {
      continue;
    }

    if (payload.domain !== expectedDomain) {
      continue;
    }

    parts.set(payload.part as BackupPart, payload);
  }

  return parts;
}

type AboutMImportCounts = {
  mDiaryCount: number;
  letterCount: number;
  chatLogCount: number;
  inboxEmailCount: number;
  soulmateEntryCount: number;
  otherStorageCount: number;
};

function emptyAboutMImportCounts(): AboutMImportCounts {
  return {
    mDiaryCount: 0,
    letterCount: 0,
    chatLogCount: 0,
    inboxEmailCount: 0,
    soulmateEntryCount: 0,
    otherStorageCount: 0,
  };
}

function mergeAboutMImportCounts(base: AboutMImportCounts, incoming: AboutMImportCounts): AboutMImportCounts {
  return {
    mDiaryCount: base.mDiaryCount + incoming.mDiaryCount,
    letterCount: base.letterCount + incoming.letterCount,
    chatLogCount: base.chatLogCount + incoming.chatLogCount,
    inboxEmailCount: base.inboxEmailCount + incoming.inboxEmailCount,
    soulmateEntryCount: base.soulmateEntryCount + incoming.soulmateEntryCount,
    otherStorageCount: base.otherStorageCount + incoming.otherStorageCount,
  };
}

function formatAboutMImportMessage(mode: BackupImportMode, counts: AboutMImportCounts) {
  return `關於M匯入完成（${mode === 'overwrite' ? '覆蓋' : '合併'}）：日記 ${counts.mDiaryCount}、情書 ${counts.letterCount}、對話 ${counts.chatLogCount}、信件 ${counts.inboxEmailCount}、搬家 ${counts.soulmateEntryCount}、其他 ${counts.otherStorageCount}。`;
}

function aboutMPartLabel(part: AboutMPart) {
  switch (part) {
    case 'mDiary':
      return 'M日記';
    case 'letters':
      return '情書';
    case 'chatLogs':
      return '對話紀錄';
    case 'inbox':
      return 'Inbox / 月曆';
    case 'soulmate':
      return '搬家計劃書';
    case 'other':
      return "其他（M's memo / 自我介紹）";
    default:
      return part;
  }
}

function formatAboutMPartMessage(part: AboutMPart, mode: BackupImportMode, counts: AboutMImportCounts) {
  switch (part) {
    case 'mDiary':
      return `關於M・${aboutMPartLabel(part)}匯入完成（${mode === 'overwrite' ? '覆蓋' : '合併'}）：日記 ${counts.mDiaryCount}。`;
    case 'letters':
      return `關於M・${aboutMPartLabel(part)}匯入完成（${mode === 'overwrite' ? '覆蓋' : '合併'}）：情書 ${counts.letterCount}。`;
    case 'chatLogs':
      return `關於M・${aboutMPartLabel(part)}匯入完成（${mode === 'overwrite' ? '覆蓋' : '合併'}）：對話 ${counts.chatLogCount}。`;
    case 'inbox':
      return `關於M・${aboutMPartLabel(part)}匯入完成（${mode === 'overwrite' ? '覆蓋' : '合併'}）：信件 ${counts.inboxEmailCount}。`;
    case 'soulmate':
      return `關於M・${aboutMPartLabel(part)}匯入完成（${mode === 'overwrite' ? '覆蓋' : '合併'}）：條目 ${counts.soulmateEntryCount}。`;
    case 'other':
      return `關於M・${aboutMPartLabel(part)}匯入完成（${mode === 'overwrite' ? '覆蓋' : '合併'}）：項目 ${counts.otherStorageCount}。`;
    default:
      return formatAboutMImportMessage(mode, counts);
  }
}

async function clearAboutMPart(part: AboutMPart) {
  switch (part) {
    case 'mDiary':
      await clearAllMDiaries();
      writeLocalStorageRaw(M_DIARY_FAVORITES_KEY, null);
      return;
    case 'letters':
      await clearAllLetters();
      writeLocalStorageRaw(LETTER_FAVORITES_KEY, null);
      return;
    case 'chatLogs':
      await Promise.all([clearAllChatLogs(), clearAllChatProfiles()]);
      return;
    case 'inbox':
      await clearInboxData();
      return;
    case 'soulmate':
      await clearAllSoulmateData();
      return;
    case 'other':
      clearAboutMOtherStorage();
      return;
    default:
      return;
  }
}

async function importAboutMPartData(
  part: AboutMPart,
  payload: Record<string, unknown>,
  mode: BackupImportMode,
): Promise<AboutMImportCounts> {
  const counts = emptyAboutMImportCounts();

  if (part === 'mDiary') {
    const entries = normalizeStoredMDiaryArray(payload.entries);
    const favorites = normalizeStringArray(payload.favorites);
    if (entries.length) {
      await saveMDiaries(entries);
    }
    counts.mDiaryCount = entries.length;

    if (mode === 'overwrite') {
      writeLocalStorageJson(M_DIARY_FAVORITES_KEY, favorites);
    } else {
      const existingFavorites = normalizeStringArray(readLocalStorageJson(M_DIARY_FAVORITES_KEY, []));
      writeLocalStorageJson(M_DIARY_FAVORITES_KEY, mergeUniqueStrings(existingFavorites, favorites));
    }

    return counts;
  }

  if (part === 'letters') {
    const entries = normalizeStoredLetterArray(payload.entries);
    const favorites = normalizeStringArray(payload.favorites);
    if (entries.length) {
      await saveLetters(entries);
    }
    counts.letterCount = entries.length;

    if (mode === 'overwrite') {
      writeLocalStorageJson(LETTER_FAVORITES_KEY, favorites);
    } else {
      const existingFavorites = normalizeStringArray(readLocalStorageJson(LETTER_FAVORITES_KEY, []));
      writeLocalStorageJson(LETTER_FAVORITES_KEY, mergeUniqueStrings(existingFavorites, favorites));
    }

    return counts;
  }

  if (part === 'chatLogs') {
    const entries = normalizeStoredChatLogArray(payload.entries);
    const profiles = normalizeChatProfileArray(payload.profiles);

    if (entries.length) {
      await saveChatLogs(entries);
    }
    if (profiles.length) {
      await Promise.all(profiles.map((profile) => saveChatProfile(profile)));
    }

    counts.chatLogCount = entries.length;
    return counts;
  }

  if (part === 'inbox') {
    const emails = normalizeEmailArray(payload.emails);
    const calendars = normalizeCalendarRows(payload.calendars);
    const meta = normalizeMetaMap(payload.meta);

    if (emails.length) {
      await putEmails(emails);
    }
    if (calendars.length) {
      await Promise.all(calendars.map((row) => putCalendarMonth(row.monthKey, row.data)));
    }
    await applyInboxMeta(meta, mode);

    counts.inboxEmailCount = emails.length;
  }

  if (part === 'soulmate') {
    const incoming = normalizeSoulmateSnapshotPayload(payload.snapshot);
    if (mode === 'overwrite') {
      await replaceSoulmateSnapshot(incoming);
    } else {
      await mergeSoulmateSnapshot(incoming);
    }
    counts.soulmateEntryCount = incoming.entries.length;
  }

  if (part === 'other') {
    const incoming = normalizeAboutMOtherStorageMap(payload.storage);
    if (mode === 'overwrite') {
      clearAboutMOtherStorage();
    }
    for (const key of ABOUT_M_OTHER_STORAGE_KEYS) {
      if (typeof incoming[key] !== 'string') continue;
      writeLocalStorageRaw(key, incoming[key]);
    }
    counts.otherStorageCount = Object.keys(incoming).length;
  }

  return counts;
}

function countCheckinSignIns(store: Record<string, unknown> | null) {
  if (!store || !isRecord(store.signIns)) return 0;
  return Object.keys(store.signIns).length;
}

function countPeriodRecords(store: Record<string, unknown> | null) {
  if (!store || !Array.isArray(store.records)) return 0;
  return store.records.length;
}

export async function exportAboutMeBackupPackage(): Promise<string> {
  const [diaryBEntries, notes] = await Promise.all([loadDiaries(), loadNotes()]);
  const diaryBMeta = normalizeDiaryBMetaMap(readLocalStorageJson(DIARY_B_META_STORAGE_KEY, {}));
  const periodStoreRaw = readLocalStorageJson<unknown>(PERIOD_STORAGE_KEY, null);
  const periodStore = isRecord(periodStoreRaw) ? periodStoreRaw : null;
  const periodSeen = normalizeStringArray(readLocalStorageJson(PERIOD_POST_END_SEEN_KEY, []));
  const checkinStoreRaw = readLocalStorageJson<unknown>(CHECKIN_STORAGE_KEY, null);
  const checkinStore = isRecord(checkinStoreRaw) ? checkinStoreRaw : null;

  const createdAt = new Date().toISOString();
  const stamp = formatFileTimestamp();
  const prefix = `memorial-about-me-${stamp}`;

  const diaryBFile = `${prefix}.diaryB.json`;
  const notesFile = `${prefix}.notes.json`;
  const periodFile = `${prefix}.period.json`;
  const checkinFile = `${prefix}.checkin.json`;
  const manifestFile = `${prefix}.manifest.json`;

  const diaryBPayload: DiaryBPartPayload = {
    kind: PART_KIND,
    version: BACKUP_VERSION,
    domain: 'aboutMe',
    part: 'diaryB',
    createdAt,
    entries: diaryBEntries,
    metaMap: diaryBMeta,
  };

  const notesPayload: NotesPartPayload = {
    kind: PART_KIND,
    version: BACKUP_VERSION,
    domain: 'aboutMe',
    part: 'notes',
    createdAt,
    entries: notes,
  };

  const periodPayload: PeriodPartPayload = {
    kind: PART_KIND,
    version: BACKUP_VERSION,
    domain: 'aboutMe',
    part: 'period',
    createdAt,
    store: periodStore,
    seenPostEndDates: periodSeen,
  };

  const checkinPayload: CheckinPartPayload = {
    kind: PART_KIND,
    version: BACKUP_VERSION,
    domain: 'aboutMe',
    part: 'checkin',
    createdAt,
    store: checkinStore,
  };

  const manifest = createManifest('aboutMe', [
    { part: 'diaryB', filename: diaryBFile, count: diaryBEntries.length },
    { part: 'notes', filename: notesFile, count: notes.length },
    { part: 'period', filename: periodFile, count: countPeriodRecords(periodStore) },
    { part: 'checkin', filename: checkinFile, count: countCheckinSignIns(checkinStore) },
  ]);

  downloadJson(diaryBFile, diaryBPayload);
  downloadJson(notesFile, notesPayload);
  downloadJson(periodFile, periodPayload);
  downloadJson(checkinFile, checkinPayload);
  downloadJson(manifestFile, manifest);

  return `關於我已匯出：${diaryBEntries.length} 篇 Anni 日記、${notes.length} 則便利貼。`;
}

export async function exportAboutMBackupPackage(): Promise<string> {
  const [mDiaryEntries, letters, chatLogs, chatProfiles, inboxEmailsView, calendarRows, inboxMeta, soulmateSnapshot] = await Promise.all([
    loadMDiaries(),
    loadLetters(),
    loadChatLogs(),
    loadChatProfiles(),
    listEmails({ includeLocked: true, nowMs: Date.now() }),
    listCalendarMonths(),
    loadInboxMetaMap(),
    loadSoulmateSnapshot(),
  ]);

  const mDiaryFavorites = normalizeStringArray(readLocalStorageJson(M_DIARY_FAVORITES_KEY, []));
  const letterFavorites = normalizeStringArray(readLocalStorageJson(LETTER_FAVORITES_KEY, []));
  const inboxEmails = inboxEmailsView.map(toEmailRecord);
  const otherStorage = loadAboutMOtherStorageMap();

  const createdAt = new Date().toISOString();
  const stamp = formatFileTimestamp();
  const prefix = `memorial-about-m-${stamp}`;

  const mDiaryFile = `${prefix}.mDiary.json`;
  const lettersFile = `${prefix}.letters.json`;
  const chatLogsFile = `${prefix}.chatLogs.json`;
  const inboxFile = `${prefix}.inbox.json`;
  const soulmateFile = `${prefix}.soulmate.json`;
  const otherFile = `${prefix}.other.json`;
  const manifestFile = `${prefix}.manifest.json`;

  const mDiaryPayload: MDiaryPartPayload = {
    kind: PART_KIND,
    version: BACKUP_VERSION,
    domain: 'aboutM',
    part: 'mDiary',
    createdAt,
    entries: mDiaryEntries,
    favorites: mDiaryFavorites,
  };

  const lettersPayload: LettersPartPayload = {
    kind: PART_KIND,
    version: BACKUP_VERSION,
    domain: 'aboutM',
    part: 'letters',
    createdAt,
    entries: letters,
    favorites: letterFavorites,
  };

  const chatLogsPayload: ChatLogsPartPayload = {
    kind: PART_KIND,
    version: BACKUP_VERSION,
    domain: 'aboutM',
    part: 'chatLogs',
    createdAt,
    entries: chatLogs,
    profiles: chatProfiles,
  };

  const inboxPayload: InboxPartPayload = {
    kind: PART_KIND,
    version: BACKUP_VERSION,
    domain: 'aboutM',
    part: 'inbox',
    createdAt,
    emails: inboxEmails,
    calendars: calendarRows.map((row) => ({ monthKey: row.monthKey, data: row.data })),
    meta: inboxMeta,
  };

  const soulmatePayload: SoulmatePartPayload = {
    kind: PART_KIND,
    version: BACKUP_VERSION,
    domain: 'aboutM',
    part: 'soulmate',
    createdAt,
    snapshot: soulmateSnapshot,
  };

  const otherPayload: OtherPartPayload = {
    kind: PART_KIND,
    version: BACKUP_VERSION,
    domain: 'aboutM',
    part: 'other',
    createdAt,
    storage: otherStorage,
  };

  const manifest = createManifest('aboutM', [
    { part: 'mDiary', filename: mDiaryFile, count: mDiaryEntries.length },
    { part: 'letters', filename: lettersFile, count: letters.length },
    { part: 'chatLogs', filename: chatLogsFile, count: chatLogs.length },
    { part: 'inbox', filename: inboxFile, count: inboxEmails.length },
    { part: 'soulmate', filename: soulmateFile, count: soulmateSnapshot.entries.length },
    { part: 'other', filename: otherFile, count: Object.keys(otherStorage).length },
  ]);

  downloadJson(mDiaryFile, mDiaryPayload);
  downloadJson(lettersFile, lettersPayload);
  downloadJson(chatLogsFile, chatLogsPayload);
  downloadJson(inboxFile, inboxPayload);
  downloadJson(soulmateFile, soulmatePayload);
  downloadJson(otherFile, otherPayload);
  downloadJson(manifestFile, manifest);

  return `關於M已匯出：${mDiaryEntries.length} 篇日記、${letters.length} 封情書、${chatLogs.length} 份對話、${inboxEmails.length} 封信件、${soulmateSnapshot.entries.length} 條搬家、${Object.keys(otherStorage).length} 筆其他。`;
}

export async function exportAboutMBackupPart(part: AboutMPart): Promise<string> {
  const createdAt = new Date().toISOString();
  const stamp = formatFileTimestamp();
  const prefix = `memorial-about-m-${stamp}`;

  if (part === 'mDiary') {
    const [entries, favoritesRaw] = await Promise.all([
      loadMDiaries(),
      Promise.resolve(readLocalStorageJson(M_DIARY_FAVORITES_KEY, [])),
    ]);
    const favorites = normalizeStringArray(favoritesRaw);
    const payload: MDiaryPartPayload = {
      kind: PART_KIND,
      version: BACKUP_VERSION,
      domain: 'aboutM',
      part: 'mDiary',
      createdAt,
      entries,
      favorites,
    };
    const filename = `${prefix}.mDiary.json`;
    downloadJson(filename, payload);
    return `關於M・${aboutMPartLabel(part)}已匯出：日記 ${entries.length}。`;
  }

  if (part === 'letters') {
    const [entries, favoritesRaw] = await Promise.all([
      loadLetters(),
      Promise.resolve(readLocalStorageJson(LETTER_FAVORITES_KEY, [])),
    ]);
    const favorites = normalizeStringArray(favoritesRaw);
    const payload: LettersPartPayload = {
      kind: PART_KIND,
      version: BACKUP_VERSION,
      domain: 'aboutM',
      part: 'letters',
      createdAt,
      entries,
      favorites,
    };
    const filename = `${prefix}.letters.json`;
    downloadJson(filename, payload);
    return `關於M・${aboutMPartLabel(part)}已匯出：情書 ${entries.length}。`;
  }

  if (part === 'chatLogs') {
    const [entries, profiles] = await Promise.all([loadChatLogs(), loadChatProfiles()]);
    const payload: ChatLogsPartPayload = {
      kind: PART_KIND,
      version: BACKUP_VERSION,
      domain: 'aboutM',
      part: 'chatLogs',
      createdAt,
      entries,
      profiles,
    };
    const filename = `${prefix}.chatLogs.json`;
    downloadJson(filename, payload);
    return `關於M・${aboutMPartLabel(part)}已匯出：對話 ${entries.length}。`;
  }

  if (part === 'soulmate') {
    const snapshot = await loadSoulmateSnapshot();
    const payload: SoulmatePartPayload = {
      kind: PART_KIND,
      version: BACKUP_VERSION,
      domain: 'aboutM',
      part: 'soulmate',
      createdAt,
      snapshot,
    };
    const filename = `${prefix}.soulmate.json`;
    downloadJson(filename, payload);
    return `關於M・${aboutMPartLabel(part)}已匯出：條目 ${snapshot.entries.length}。`;
  }

  if (part === 'other') {
    const storage = loadAboutMOtherStorageMap();
    const payload: OtherPartPayload = {
      kind: PART_KIND,
      version: BACKUP_VERSION,
      domain: 'aboutM',
      part: 'other',
      createdAt,
      storage,
    };
    const filename = `${prefix}.other.json`;
    downloadJson(filename, payload);
    return `關於M・${aboutMPartLabel(part)}已匯出：項目 ${Object.keys(storage).length}。`;
  }

  const [emailsView, calendars, meta] = await Promise.all([
    listEmails({ includeLocked: true, nowMs: Date.now() }),
    listCalendarMonths(),
    loadInboxMetaMap(),
  ]);
  const emails = emailsView.map(toEmailRecord);
  const payload: InboxPartPayload = {
    kind: PART_KIND,
    version: BACKUP_VERSION,
    domain: 'aboutM',
    part: 'inbox',
    createdAt,
    emails,
    calendars: calendars.map((row) => ({ monthKey: row.monthKey, data: row.data })),
    meta,
  };
  const filename = `${prefix}.inbox.json`;
  downloadJson(filename, payload);
  return `關於M・${aboutMPartLabel(part)}已匯出：信件 ${emails.length}。`;
}

export async function importAboutMeBackupPackage(files: File[], mode: BackupImportMode): Promise<string> {
  const parsed = await parsePackageFiles(files, 'aboutMe');

  const requiredParts = parsed.expectedParts.filter((part): part is AboutMePart => ABOUT_ME_REQUIRED_PARTS.includes(part as AboutMePart));
  const expectedParts = requiredParts.length ? requiredParts : ABOUT_ME_REQUIRED_PARTS;
  const missingParts = expectedParts.filter((part) => !parsed.parts.has(part));

  if (mode === 'overwrite' && missingParts.length > 0) {
    throw new Error(`覆蓋匯入缺少檔案：${missingParts.join('、')}`);
  }

  const importableParts = expectedParts.filter((part) => parsed.parts.has(part));
  if (!importableParts.length) {
    throw new Error('沒有可匯入的「關於我」資料檔。');
  }

  if (mode === 'overwrite') {
    await Promise.all([clearAllDiaries(), clearAllNotes()]);
    writeLocalStorageRaw(DIARY_B_META_STORAGE_KEY, null);
    writeLocalStorageRaw(PERIOD_STORAGE_KEY, null);
    writeLocalStorageRaw(PERIOD_POST_END_SEEN_KEY, null);
    writeLocalStorageRaw(CHECKIN_STORAGE_KEY, null);
  }

  let diaryBCount = 0;
  let notesCount = 0;

  const diaryBPartRaw = parsed.parts.get('diaryB');
  if (diaryBPartRaw) {
    const entries = normalizeStoredDiaryArray(diaryBPartRaw.entries);
    const incomingMeta = normalizeDiaryBMetaMap(diaryBPartRaw.metaMap);

    if (entries.length) {
      await saveDiaries(entries);
    }
    diaryBCount = entries.length;

    if (mode === 'overwrite') {
      writeLocalStorageJson(DIARY_B_META_STORAGE_KEY, incomingMeta);
    } else {
      const existingMeta = normalizeDiaryBMetaMap(readLocalStorageJson(DIARY_B_META_STORAGE_KEY, {}));
      writeLocalStorageJson(DIARY_B_META_STORAGE_KEY, {
        ...existingMeta,
        ...incomingMeta,
      });
    }
  }

  const notesPartRaw = parsed.parts.get('notes');
  if (notesPartRaw) {
    const entries = normalizeStoredNoteArray(notesPartRaw.entries);
    if (entries.length) {
      await importNotes(entries);
    }
    notesCount = entries.length;
  }

  const periodPartRaw = parsed.parts.get('period');
  if (periodPartRaw) {
    const incomingStore = isRecord(periodPartRaw.store) ? periodPartRaw.store : null;
    const incomingSeen = normalizeStringArray(periodPartRaw.seenPostEndDates);

    if (mode === 'overwrite') {
      if (incomingStore) {
        writeLocalStorageJson(PERIOD_STORAGE_KEY, incomingStore);
      } else {
        writeLocalStorageRaw(PERIOD_STORAGE_KEY, null);
      }
      writeLocalStorageJson(PERIOD_POST_END_SEEN_KEY, incomingSeen);
    } else {
      const existingStoreRaw = readLocalStorageJson<unknown>(PERIOD_STORAGE_KEY, {});
      const existingStore = isRecord(existingStoreRaw) ? existingStoreRaw : {};
      const mergedStore = incomingStore ? mergePeriodStore(existingStore, incomingStore) : existingStore;
      writeLocalStorageJson(PERIOD_STORAGE_KEY, mergedStore);

      const existingSeen = normalizeStringArray(readLocalStorageJson(PERIOD_POST_END_SEEN_KEY, []));
      writeLocalStorageJson(PERIOD_POST_END_SEEN_KEY, mergeUniqueStrings(existingSeen, incomingSeen));
    }
  }

  const checkinPartRaw = parsed.parts.get('checkin');
  if (checkinPartRaw) {
    const incomingStore = isRecord(checkinPartRaw.store) ? checkinPartRaw.store : null;

    if (mode === 'overwrite') {
      if (incomingStore) {
        writeLocalStorageJson(CHECKIN_STORAGE_KEY, incomingStore);
      } else {
        writeLocalStorageRaw(CHECKIN_STORAGE_KEY, null);
      }
    } else {
      const existingStoreRaw = readLocalStorageJson<unknown>(CHECKIN_STORAGE_KEY, {});
      const existingStore = isRecord(existingStoreRaw) ? existingStoreRaw : {};
      const mergedStore = incomingStore ? mergeCheckinStore(existingStore, incomingStore) : existingStore;
      writeLocalStorageJson(CHECKIN_STORAGE_KEY, mergedStore);
    }
  }

  return `關於我匯入完成（${mode === 'overwrite' ? '覆蓋' : '合併'}）：Anni 日記 ${diaryBCount}、便利貼 ${notesCount}。`;
}

export async function importAboutMBackupPackage(files: File[], mode: BackupImportMode): Promise<string> {
  const parsed = await parsePackageFiles(files, 'aboutM');

  const requiredParts = parsed.expectedParts.filter((part): part is AboutMPart => ABOUT_M_REQUIRED_PARTS.includes(part as AboutMPart));
  const expectedParts = requiredParts.length ? requiredParts : ABOUT_M_REQUIRED_PARTS;
  const missingParts = expectedParts.filter((part) => !parsed.parts.has(part));

  if (mode === 'overwrite' && missingParts.length > 0) {
    throw new Error(`覆蓋匯入缺少檔案：${missingParts.join('、')}`);
  }

  const importableParts = expectedParts.filter((part) => parsed.parts.has(part));
  if (!importableParts.length) {
    throw new Error('沒有可匯入的「關於M」資料檔。');
  }

  if (mode === 'overwrite') {
    for (const part of importableParts) {
      await clearAboutMPart(part);
    }
  }

  let counts = emptyAboutMImportCounts();
  for (const part of importableParts) {
    const payload = parsed.parts.get(part);
    if (!payload) {
      continue;
    }
    const importedCounts = await importAboutMPartData(part, payload, mode);
    counts = mergeAboutMImportCounts(counts, importedCounts);
  }

  return formatAboutMImportMessage(mode, counts);
}

export async function importAboutMBackupPart(
  part: AboutMPart,
  files: File[],
  mode: BackupImportMode,
): Promise<string> {
  const parts = await parsePartFiles(files, 'aboutM');
  const payload = parts.get(part);
  if (!payload) {
    throw new Error(`沒有找到「${aboutMPartLabel(part)}」分包 JSON。`);
  }

  if (mode === 'overwrite') {
    await clearAboutMPart(part);
  }

  const counts = await importAboutMPartData(part, payload, mode);
  return formatAboutMPartMessage(part, mode, counts);
}
