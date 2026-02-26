import { openDB } from 'idb';

const DB_NAME = 'soulmate-db';
const BOX_STORE = 'boxes';
const ENTRY_STORE = 'entries';

export const UNCATEGORIZED_BOX_ID = 'uncategorized';
export const MANAGE_BOX_ID = 'manager';
export const MAX_SOULMATE_BOXES = 24;

const SOULMATE_PAGE_BACKUP_KIND = 'memorial-soulmate-page-backup';
const SOULMATE_BOX_BACKUP_KIND = 'memorial-soulmate-box-backup';

type BackupMode = 'merge' | 'overwrite';

export type SoulmateBox = {
  id: string;
  title: string;
  subtitle: string;
  emoji: string;
  accentHex: string;
  order: number;
  createdAt: number;
  updatedAt: number;
  isSystem?: boolean;
};

export type SoulmateEntry = {
  id: string;
  boxId: string;
  name: string;
  title: string;
  content: string;
  htmlContent: string;
  importedAt: number;
  updatedAt: number;
};

export type SoulmateSnapshot = {
  boxes: SoulmateBox[];
  entries: SoulmateEntry[];
};

export type SoulmateFileImportResult = {
  entries: SoulmateEntry[];
  skipped: string[];
  failed: string[];
};

export type SoulmatePageBackupPayload = {
  kind: typeof SOULMATE_PAGE_BACKUP_KIND;
  version: 1;
  createdAt: string;
  boxes: SoulmateBox[];
  entries: SoulmateEntry[];
};

export type SoulmateBoxBackupPayload = {
  kind: typeof SOULMATE_BOX_BACKUP_KIND;
  version: 1;
  createdAt: string;
  box: SoulmateBox;
  entries: SoulmateEntry[];
};

type RawRecord = Record<string, unknown>;

type DefaultRoomSeed = {
  id: string;
  emoji: string;
  title: string;
  subtitle: string;
  accentHex: string;
};

const DEFAULT_ROOM_SEEDS: DefaultRoomSeed[] = [
  { id: 'personality', emoji: '🛏️', title: '臥室', subtitle: '核心人格', accentHex: '#f4c2c2' },
  { id: 'memories', emoji: '📚', title: '書房', subtitle: '重要記憶', accentHex: '#fde68a' },
  { id: 'promises', emoji: '💌', title: '信箱', subtitle: '核心承諾', accentHex: '#c7d2fe' },
  { id: 'conversation', emoji: '🎭', title: '客廳', subtitle: '對話風格', accentHex: '#bbf7d0' },
  { id: 'language', emoji: '🗣️', title: '語言室', subtitle: '語言習慣', accentHex: '#bae6fd' },
  { id: 'understanding', emoji: '🪞', title: '映心間', subtitle: '關於你', accentHex: '#e9d5ff' },
  { id: 'relationship', emoji: '🌿', title: '庭院', subtitle: '關係動態', accentHex: '#d1fae5' },
  { id: 'playbook', emoji: '🛡️', title: '手冊室', subtitle: '應對手冊', accentHex: '#fed7aa' },
  { id: 'aesthetics', emoji: '🎨', title: '畫廊', subtitle: '審美品味', accentHex: '#fecaca' },
  { id: 'evolution', emoji: '🌱', title: '溫室', subtitle: '成長記錄', accentHex: '#d9f99d' },
  { id: 'letter', emoji: '✉️', title: '信件室', subtitle: '給你的信', accentHex: '#fce7f3' },
  { id: 'misc', emoji: '📦', title: '閣樓', subtitle: '其他雜項', accentHex: '#e5e7eb' },
  { id: UNCATEGORIZED_BOX_ID, emoji: '📥', title: '未分類', subtitle: '尚未歸檔', accentHex: '#d6d3d1' },
  { id: MANAGE_BOX_ID, emoji: '⚙️', title: '管理', subtitle: '方塊與匯入備份', accentHex: '#dbeafe' },
];

function isFixedBoxId(boxId: string) {
  return boxId === UNCATEGORIZED_BOX_ID || boxId === MANAGE_BOX_ID;
}

function uniqueId(prefix = 'soulmate') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function trimOrFallback(value: unknown, fallback: string) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

function normalizeHex(value: unknown, fallback = '#e7e5e4') {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed;
  return fallback;
}

function normalizeTimestamp(value: unknown, fallback = Date.now()) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeBox(value: unknown, fallbackOrder: number, fallbackNow = Date.now()): SoulmateBox | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as RawRecord;
  const id = trimOrFallback(row.id, '');
  if (!id) return null;
  const createdAt = normalizeTimestamp(row.createdAt, fallbackNow);
  const updatedAt = normalizeTimestamp(row.updatedAt, createdAt);
  return {
    id,
    title: trimOrFallback(
      row.title,
      id === UNCATEGORIZED_BOX_ID ? '未分類' : id === MANAGE_BOX_ID ? '管理' : '未命名方塊',
    ),
    subtitle: trimOrFallback(row.subtitle, '未設定副標'),
    emoji: trimOrFallback(row.emoji, '📦'),
    accentHex: normalizeHex(row.accentHex, '#e7e5e4'),
    order: Number.isFinite(Number(row.order)) ? Number(row.order) : fallbackOrder,
    createdAt,
    updatedAt,
    isSystem: Boolean(row.isSystem) || isFixedBoxId(id),
  };
}

function normalizeEntry(value: unknown, fallbackNow = Date.now()): SoulmateEntry | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as RawRecord;
  const id = trimOrFallback(row.id, '');
  const name = trimOrFallback(row.name, '');
  if (!id || !name) return null;
  const importedAt = normalizeTimestamp(row.importedAt, fallbackNow);
  const updatedAt = normalizeTimestamp(row.updatedAt, importedAt);
  const title = trimOrFallback(row.title, name.replace(/\.(txt|docx?)$/i, '').trim() || '未命名');
  return {
    id,
    boxId: trimOrFallback(row.boxId, UNCATEGORIZED_BOX_ID),
    name,
    title,
    content: typeof row.content === 'string' ? row.content : '',
    htmlContent: typeof row.htmlContent === 'string' ? row.htmlContent : '',
    importedAt,
    updatedAt,
  };
}

export function createDefaultSoulmateBoxes(now = Date.now()): SoulmateBox[] {
  return DEFAULT_ROOM_SEEDS.slice(0, MAX_SOULMATE_BOXES).map((seed, index) => ({
    id: seed.id,
    title: seed.title,
    subtitle: seed.subtitle,
    emoji: seed.emoji,
    accentHex: seed.accentHex,
    order: index,
    createdAt: now,
    updatedAt: now,
    isSystem: isFixedBoxId(seed.id),
  }));
}

function sortBoxes(boxes: SoulmateBox[]) {
  return [...boxes].sort((a, b) => {
    if (a.id === MANAGE_BOX_ID && b.id !== MANAGE_BOX_ID) return 1;
    if (b.id === MANAGE_BOX_ID && a.id !== MANAGE_BOX_ID) return -1;
    if (a.id === UNCATEGORIZED_BOX_ID && b.id !== UNCATEGORIZED_BOX_ID) return 1;
    if (b.id === UNCATEGORIZED_BOX_ID && a.id !== UNCATEGORIZED_BOX_ID) return -1;
    if (a.order !== b.order) return a.order - b.order;
    return a.createdAt - b.createdAt;
  });
}

function normalizeBoxes(input: SoulmateBox[], fallbackNow = Date.now()) {
  const map = new Map<string, SoulmateBox>();
  for (const raw of input) {
    const normalized = normalizeBox(raw, map.size, fallbackNow);
    if (!normalized) continue;
    map.set(normalized.id, normalized);
  }
  if (!map.has(UNCATEGORIZED_BOX_ID)) {
    map.set(UNCATEGORIZED_BOX_ID, {
      id: UNCATEGORIZED_BOX_ID,
      title: '未分類',
      subtitle: '尚未歸檔',
      emoji: '📥',
      accentHex: '#d6d3d1',
      order: -1,
      createdAt: fallbackNow,
      updatedAt: fallbackNow,
      isSystem: true,
    });
  }
  if (!map.has(MANAGE_BOX_ID)) {
    map.set(MANAGE_BOX_ID, {
      id: MANAGE_BOX_ID,
      title: '管理',
      subtitle: '方塊與匯入備份',
      emoji: '⚙️',
      accentHex: '#dbeafe',
      order: Number.MAX_SAFE_INTEGER,
      createdAt: fallbackNow,
      updatedAt: fallbackNow,
      isSystem: true,
    });
  }
  const sorted = sortBoxes(Array.from(map.values()));
  const generalBoxes = sorted.filter((box) => !isFixedBoxId(box.id));
  const fixedTail = [
    map.get(UNCATEGORIZED_BOX_ID)!,
    map.get(MANAGE_BOX_ID)!,
  ];
  const availableGeneralSlots = Math.max(0, MAX_SOULMATE_BOXES - fixedTail.length);
  const limited = [...generalBoxes.slice(0, availableGeneralSlots), ...fixedTail];
  return sortBoxes(
    limited.map((box, index) => ({
      ...box,
      order: index,
      isSystem: isFixedBoxId(box.id) ? true : box.isSystem,
    })),
  );
}

function normalizeEntries(input: SoulmateEntry[], validBoxIds: Set<string>) {
  const deduped = new Map<string, SoulmateEntry>();
  for (const raw of input) {
    const normalized = normalizeEntry(raw);
    if (!normalized) continue;
    deduped.set(normalized.id, {
      ...normalized,
      boxId:
        normalized.boxId !== MANAGE_BOX_ID && validBoxIds.has(normalized.boxId)
          ? normalized.boxId
          : UNCATEGORIZED_BOX_ID,
    });
  }
  return Array.from(deduped.values()).sort((a, b) => b.importedAt - a.importedAt);
}

function normalizeSnapshot(input: SoulmateSnapshot, fallbackNow = Date.now()): SoulmateSnapshot {
  const boxes = normalizeBoxes(input.boxes, fallbackNow);
  const entryBoxIds = new Set(boxes.filter((box) => box.id !== MANAGE_BOX_ID).map((box) => box.id));
  const entries = normalizeEntries(input.entries, entryBoxIds);
  return { boxes, entries };
}

async function getDB() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(BOX_STORE)) {
        db.createObjectStore(BOX_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(ENTRY_STORE)) {
        db.createObjectStore(ENTRY_STORE, { keyPath: 'id' });
      }
    },
  });
}

export async function saveSoulmateSnapshot(snapshot: SoulmateSnapshot): Promise<void> {
  const normalized = normalizeSnapshot(snapshot);
  const db = await getDB();
  const tx = db.transaction([BOX_STORE, ENTRY_STORE], 'readwrite');
  await tx.objectStore(BOX_STORE).clear();
  for (const box of normalized.boxes) {
    await tx.objectStore(BOX_STORE).put(box);
  }
  await tx.objectStore(ENTRY_STORE).clear();
  for (const entry of normalized.entries) {
    await tx.objectStore(ENTRY_STORE).put(entry);
  }
  await tx.done;
}

export async function replaceSoulmateSnapshot(snapshot: SoulmateSnapshot): Promise<void> {
  await saveSoulmateSnapshot(snapshot);
}

export async function loadSoulmateSnapshot(): Promise<SoulmateSnapshot> {
  const db = await getDB();
  const [rawBoxes, rawEntries] = await Promise.all([
    db.getAll(BOX_STORE),
    db.getAll(ENTRY_STORE),
  ]);
  if (!rawBoxes.length) {
    const defaults: SoulmateSnapshot = {
      boxes: createDefaultSoulmateBoxes(),
      entries: [],
    };
    await saveSoulmateSnapshot(defaults);
    return defaults;
  }
  const normalized = normalizeSnapshot({
    boxes: rawBoxes.map((box, index) => normalizeBox(box, index)).filter((box): box is SoulmateBox => Boolean(box)),
    entries: rawEntries.map((entry) => normalizeEntry(entry)).filter((entry): entry is SoulmateEntry => Boolean(entry)),
  });
  const needsPersist =
    normalized.boxes.length !== rawBoxes.length ||
    normalized.entries.length !== rawEntries.length ||
    normalized.entries.some((entry, index) => rawEntries[index]?.boxId !== entry.boxId);
  if (needsPersist) {
    await saveSoulmateSnapshot(normalized);
  }
  return normalized;
}

export async function clearAllSoulmateData(): Promise<void> {
  await saveSoulmateSnapshot({ boxes: createDefaultSoulmateBoxes(), entries: [] });
}

function mergeBoxes(current: SoulmateBox[], incoming: SoulmateBox[]) {
  const currentMap = new Map(current.map((box) => [box.id, box]));
  const next = [...current];
  for (const box of sortBoxes(incoming)) {
    const foundIdx = next.findIndex((item) => item.id === box.id);
    if (foundIdx >= 0) {
      next[foundIdx] = {
        ...next[foundIdx],
        title: box.title,
        subtitle: box.subtitle,
        emoji: box.emoji,
        accentHex: box.accentHex,
        updatedAt: box.updatedAt,
      };
      continue;
    }
    if (next.length >= MAX_SOULMATE_BOXES) {
      continue;
    }
    next.push({
      ...box,
      order: next.length,
      createdAt: currentMap.has(box.id) ? currentMap.get(box.id)!.createdAt : box.createdAt,
    });
  }
  return normalizeBoxes(next);
}

export async function mergeSoulmateSnapshot(snapshot: SoulmateSnapshot): Promise<SoulmateSnapshot> {
  const normalizedIncoming = normalizeSnapshot(snapshot);
  const current = await loadSoulmateSnapshot();
  const boxes = mergeBoxes(current.boxes, normalizedIncoming.boxes);
  const validBoxIds = new Set(boxes.filter((box) => box.id !== MANAGE_BOX_ID).map((box) => box.id));
  const mergedEntriesMap = new Map<string, SoulmateEntry>();
  for (const entry of current.entries) {
    mergedEntriesMap.set(entry.id, entry);
  }
  for (const entry of normalizedIncoming.entries) {
    mergedEntriesMap.set(entry.id, {
      ...entry,
      boxId: validBoxIds.has(entry.boxId) ? entry.boxId : UNCATEGORIZED_BOX_ID,
    });
  }
  const merged: SoulmateSnapshot = {
    boxes,
    entries: normalizeEntries(Array.from(mergedEntriesMap.values()), validBoxIds),
  };
  await saveSoulmateSnapshot(merged);
  return merged;
}

function stripHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveFileTitle(name: string) {
  const cleaned = name.replace(/\.(txt|docx?)$/i, '').trim();
  return cleaned || '未命名';
}

function isSupportedImportFile(fileName: string) {
  return /\.(txt|docx?)$/i.test(fileName);
}

async function parseEntryFromFile(file: File, boxId: string): Promise<SoulmateEntry> {
  const name = file.name;
  const now = Date.now();
  const title = resolveFileTitle(name);
  if (/\.docx?$/i.test(name)) {
    const mammoth = await import('mammoth');
    const arrayBuffer = await file.arrayBuffer();
    const [htmlResult, textResult] = await Promise.all([
      mammoth.convertToHtml({ arrayBuffer }),
      mammoth.extractRawText({ arrayBuffer }),
    ]);
    const content = textResult.value.trim() || stripHtml(htmlResult.value);
    return {
      id: uniqueId('sm-entry'),
      boxId,
      name,
      title,
      content,
      htmlContent: htmlResult.value,
      importedAt: now,
      updatedAt: now,
    };
  }
  const content = await file.text();
  return {
    id: uniqueId('sm-entry'),
    boxId,
    name,
    title,
    content,
    htmlContent: '',
    importedAt: now,
    updatedAt: now,
  };
}

export async function createSoulmateEntriesFromFiles(
  files: File[],
  boxId: string,
): Promise<SoulmateFileImportResult> {
  const entries: SoulmateEntry[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];
  for (const file of files) {
    if (!isSupportedImportFile(file.name)) {
      skipped.push(file.name);
      continue;
    }
    try {
      entries.push(await parseEntryFromFile(file, boxId));
    } catch {
      failed.push(file.name);
    }
  }
  return { entries, skipped, failed };
}

export function buildSoulmatePageBackupPayload(snapshot: SoulmateSnapshot): SoulmatePageBackupPayload {
  const normalized = normalizeSnapshot(snapshot);
  return {
    kind: SOULMATE_PAGE_BACKUP_KIND,
    version: 1,
    createdAt: new Date().toISOString(),
    boxes: normalized.boxes,
    entries: normalized.entries,
  };
}

export function buildSoulmateBoxBackupPayload(snapshot: SoulmateSnapshot, boxId: string): SoulmateBoxBackupPayload | null {
  const normalized = normalizeSnapshot(snapshot);
  const box = normalized.boxes.find((item) => item.id === boxId);
  if (!box) return null;
  return {
    kind: SOULMATE_BOX_BACKUP_KIND,
    version: 1,
    createdAt: new Date().toISOString(),
    box,
    entries: normalized.entries.filter((entry) => entry.boxId === boxId),
  };
}

function isPageBackupPayload(value: unknown): value is SoulmatePageBackupPayload {
  if (!value || typeof value !== 'object') return false;
  const row = value as RawRecord;
  return row.kind === SOULMATE_PAGE_BACKUP_KIND && Number(row.version) === 1 && Array.isArray(row.boxes) && Array.isArray(row.entries);
}

function isBoxBackupPayload(value: unknown): value is SoulmateBoxBackupPayload {
  if (!value || typeof value !== 'object') return false;
  const row = value as RawRecord;
  return (
    row.kind === SOULMATE_BOX_BACKUP_KIND &&
    Number(row.version) === 1 &&
    Boolean(row.box) &&
    typeof row.box === 'object' &&
    Array.isArray(row.entries)
  );
}

type ParsedBackupPayload =
  | {
      kind: 'page';
      snapshot: SoulmateSnapshot;
    }
  | {
      kind: 'box';
      boxId: string;
      snapshot: SoulmateSnapshot;
    };

function parseBackupPayload(value: unknown): ParsedBackupPayload {
  if (isPageBackupPayload(value)) {
    return {
      kind: 'page',
      snapshot: normalizeSnapshot({
        boxes: value.boxes,
        entries: value.entries,
      }),
    };
  }
  if (isBoxBackupPayload(value)) {
    const snapshot = normalizeSnapshot({
      boxes: [value.box],
      entries: value.entries,
    });
    const preferredBoxId = trimOrFallback((value.box as RawRecord).id, '');
    const resolvedBox =
      snapshot.boxes.find((box) => box.id === preferredBoxId) ??
      snapshot.boxes.find((box) => !isFixedBoxId(box.id));
    if (!resolvedBox) {
      throw new Error('方塊備份缺少有效方塊資料');
    }
    return {
      kind: 'box',
      boxId: resolvedBox.id,
      snapshot,
    };
  }
  throw new Error('不是有效的搬家計劃書備份檔');
}

export async function importSoulmateBackupFiles(files: File[], mode: BackupMode): Promise<SoulmateSnapshot> {
  const payloads: ParsedBackupPayload[] = [];
  for (const file of files) {
    const text = await file.text();
    const parsed = JSON.parse(text) as unknown;
    payloads.push(parseBackupPayload(parsed));
  }
  const snapshots = payloads.map((payload) => payload.snapshot);
  const mergedInput: SoulmateSnapshot = snapshots.reduce<SoulmateSnapshot>(
    (acc, current) => ({
      boxes: [...acc.boxes, ...current.boxes],
      entries: [...acc.entries, ...current.entries],
    }),
    { boxes: [], entries: [] },
  );
  if (mode === 'overwrite') {
    // Overwrite behavior is content-aware:
    // - Contains any page backup: replace the whole page.
    // - Contains only box backups: overwrite only those target boxes.
    const hasPageBackup = payloads.some((payload) => payload.kind === 'page');
    if (!hasPageBackup) {
      const current = await loadSoulmateSnapshot();
      let next: SoulmateSnapshot = {
        boxes: [...current.boxes],
        entries: [...current.entries],
      };

      for (const payload of payloads) {
        if (payload.kind !== 'box') continue;
        const incomingBox = payload.snapshot.boxes.find((box) => box.id === payload.boxId);
        if (!incomingBox) continue;
        const incomingEntries = payload.snapshot.entries.filter((entry) => entry.boxId === payload.boxId);
        next = {
          boxes: [...next.boxes.filter((box) => box.id !== payload.boxId), incomingBox],
          entries: [...next.entries.filter((entry) => entry.boxId !== payload.boxId), ...incomingEntries],
        };
      }

      await replaceSoulmateSnapshot(next);
      return loadSoulmateSnapshot();
    }
    await replaceSoulmateSnapshot(mergedInput);
    return loadSoulmateSnapshot();
  }
  return mergeSoulmateSnapshot(mergedInput);
}
