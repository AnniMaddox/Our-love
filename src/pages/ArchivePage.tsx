import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent as ReactTouchEvent } from 'react';

import { SettingsAccordion } from '../components/SettingsAccordion';
import { getActiveBaseChibiSources, getScopedChibiSources } from '../lib/chibiPool';

import './ArchivePage.css';

const BASE = import.meta.env.BASE_URL as string;
const INDEX_URL = `${BASE}data/master-pool/index.json`;
const PREFS_STORAGE_KEY = 'memorial-archive-prefs-v1';
const FALLBACK_CHIBI = `${BASE}chibi/chibi-00.webp`;
const MISSING_DATE_LABEL = '想妳的時候';

const ROUTE_TO_TAG: Array<{ route: string; label: string }> = [
  { route: 'letters', label: '情書' },
  { route: 'diary', label: '日記' },
  { route: 'birthday', label: '生日' },
  { route: 'memo', label: '筆記' },
  { route: 'mood', label: '心情' },
  { route: 'ramble', label: '碎碎念' },
  { route: 'if', label: '如果' },
  { route: 'intro', label: '自介' },
];

const TAG_CLASS: Record<string, string> = {
  情書: 'ct-letter',
  日記: 'ct-diary',
  筆記: 'ct-note',
  心情: 'ct-chat',
  碎碎念: 'ct-chat',
  生日: 'ct-birthday',
  如果: 'ct-other',
  自介: 'ct-other',
  其他: 'ct-other',
};

const LINE_HEIGHT_BY_KEY = {
  tight: 1.7,
  normal: 2.14,
  wide: 2.6,
} as const;

const LINE_HEIGHT_OPTIONS: Array<{ key: ArchiveLineHeightKey; label: string }> = [
  { key: 'tight', label: '緊' },
  { key: 'normal', label: '標準' },
  { key: 'wide', label: '寬' },
];

type ArchiveLineHeightKey = keyof typeof LINE_HEIGHT_BY_KEY;
type RelatedMode = 'prev-folder' | 'next-folder';
type FolderSortOrder = 'asc' | 'desc';
type ArchiveFontMode = 'default' | 'archive';

type ArchivePrefs = {
  fontMode: ArchiveFontMode;
  lineHeight: ArchiveLineHeightKey;
  readingFontSize: number;
  showHomeChibi: boolean;
  homeChibiWidth: number;
  showReadingChibi: boolean;
  readingChibiWidth: number;
  relatedMode: RelatedMode;
};

type SettingsPanels = {
  homeChibi: boolean;
  readingChibi: boolean;
  related: boolean;
};

type MasterFolderRecord = {
  folder: string;
  folderCode: string | null;
  folderDate: string | null;
  count: number;
  ids: string[];
};

type MasterDocRecord = {
  id: string;
  title: string;
  sourceRelPath: string;
  sourceFolder: string;
  routes: string[];
  writtenAt: number | null;
  contentPath: string;
};

type MasterIndexPayload = {
  folders: MasterFolderRecord[];
  docs: MasterDocRecord[];
};

type ArchiveDoc = {
  id: string;
  title: string;
  ext: string;
  sourceRelPath: string;
  routes: string[];
  tags: string[];
  writtenAt: number | null;
  contentPath: string;
};

type ArchiveFolder = {
  key: string;
  label: string;
  date: string | null;
  short: string;
  year: string;
  cats: string[];
  docs: ArchiveDoc[];
};

type CrystalReveal = {
  folderKey: string;
  docId: string;
};

type StarSpec = {
  id: string;
  left: string;
  top: string;
  size: number;
  opacity: number;
  duration: number;
  delay: number;
};

function asRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function toNullableNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function uniqueStrings(items: string[]) {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    output.push(item);
  }
  return output;
}

function getFileExt(relPath: string) {
  const matched = relPath.toLowerCase().match(/\.([a-z0-9]+)$/i);
  if (!matched) return 'txt';
  return matched[1];
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const DATE_CHUNK_PATTERNS = [
  '\\d{3,5}(?:[-_./\\s](?:0?[1-9]|1[0-2])(?:[-_./\\s](?:0?[1-9]|[12]\\d|3[01]))|[-_./\\s](?:0[1-9]|1[0-2])(?:0[1-9]|[12]\\d|3[01]))',
  '(?:19|20)\\d{2}\\d(?:[-_./\\s](?:0?[1-9]|1[0-2])(?:[-_./\\s](?:0?[1-9]|[12]\\d|3[01]))?|(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\\d|3[01]))',
  '(?:19|20)\\d{2}(?:[-_./\\s](?:0?[1-9]|1[0-2])(?:[-_./\\s](?:0?[1-9]|[12]\\d|3[01]))?|(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\\d|3[01]))',
  '(?:19|20)\\d{2}(?:[-_./\\s](?:0?[1-9]|1[0-2])|(?:0[1-9]|1[0-2]))',
  '(?:19|20)\\d{2}',
  '(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\\d|3[01])',
  '(?:0?[1-9]|1[0-2])[-_./\\s](?:0?[1-9]|[12]\\d|3[01])',
] as const;

function stripEdgeSeparators(value: string) {
  return value.replace(/^[-_－—:：、.。/\s]+/, '').replace(/[-_－—:：、.。/\s]+$/, '');
}

function stripSingleLeadingDateChunk(value: string) {
  for (const pattern of DATE_CHUNK_PATTERNS) {
    const matched = value.match(new RegExp(`^${pattern}(?=$|[-_－—:：、.。/\\s])`));
    if (!matched) continue;
    return value.slice(matched[0].length);
  }
  return value;
}

function stripSingleTrailingDateChunk(value: string) {
  for (const pattern of DATE_CHUNK_PATTERNS) {
    if (new RegExp(`^${pattern}$`).test(value)) return '';
    const replaced = value.replace(new RegExp(`[-_－—:：、.。/\\s]+${pattern}$`), '');
    if (replaced !== value) return replaced;
  }
  return value;
}

function extractFolderTopic(folderName: string, folderCode: string) {
  const base = folderName.trim();
  if (!base) return '';

  const escapedCode = escapeRegExp(folderCode.trim());
  if (!escapedCode) return '';

  let cleaned = base
    .replace(new RegExp(`^第\\s*0*${escapedCode}\\s*(?:號|号)?\\s*[-_－—:：、.。\\s]*`, 'i'), '')
    .replace(new RegExp(`^folder\\s*0*${escapedCode}\\s*[-_－—:：、.。\\s]*`, 'i'), '')
    .replace(new RegExp(`^0*${escapedCode}\\s*[-_－—:：、.。\\s]*`, 'i'), '')
    .trim();

  cleaned = stripEdgeSeparators(cleaned);
  let previous = '';
  while (cleaned && cleaned !== previous) {
    previous = cleaned;
    const withoutLeadingDate = stripEdgeSeparators(stripSingleLeadingDateChunk(cleaned));
    if (withoutLeadingDate !== cleaned) {
      cleaned = withoutLeadingDate;
      continue;
    }
    const withoutTrailingDate = stripEdgeSeparators(stripSingleTrailingDateChunk(cleaned));
    if (withoutTrailingDate !== cleaned) {
      cleaned = withoutTrailingDate;
      continue;
    }
  }

  if (!cleaned || cleaned === folderCode) return '';
  return cleaned;
}

function formatFolderLabel(folderName: string, folderCode: string | null) {
  if (!folderCode) return folderName;
  const topic = extractFolderTopic(folderName, folderCode);
  if (topic) return `${folderCode}｜${topic}`;
  return `${folderCode}｜`;
}

function formatFolderShort(folderDate: string | null) {
  if (!folderDate) return MISSING_DATE_LABEL;
  const [year, month] = folderDate.split('-');
  if (!year || !month) return folderDate;
  return `${year} 年 ${Number(month)} 月`;
}

function getFolderYear(folderDate: string | null, folderName: string) {
  if (folderDate && folderDate.length >= 4) return folderDate.slice(0, 4);
  const hit = folderName.match(/((?:19|20)\d{2})/);
  if (hit) return hit[1];
  return MISSING_DATE_LABEL;
}

function getFolderMonthKey(folderDate: string | null) {
  if (!folderDate) return MISSING_DATE_LABEL;
  const [year, month] = folderDate.split('-');
  if (!year || !month) return MISSING_DATE_LABEL;
  return `${year}-${String(Number(month)).padStart(2, '0')}`;
}

function formatFolderMonth(folderDate: string | null) {
  if (!folderDate) return MISSING_DATE_LABEL;
  const [, month] = folderDate.split('-');
  if (!month) return MISSING_DATE_LABEL;
  return `${Number(month)} 月`;
}

function formatShortDate(timestamp: number | null) {
  if (typeof timestamp !== 'number') return MISSING_DATE_LABEL;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return MISSING_DATE_LABEL;
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}

function buildFolderTags(routes: string[]) {
  const tags = ROUTE_TO_TAG
    .filter((entry) => routes.includes(entry.route))
    .map((entry) => entry.label);
  const merged = uniqueStrings(tags);
  return merged.length ? merged.slice(0, 4) : ['其他'];
}

function buildDocTags(routes: string[]) {
  const tags = ROUTE_TO_TAG
    .filter((entry) => routes.includes(entry.route))
    .map((entry) => entry.label);
  const merged = uniqueStrings(tags);
  return merged.length ? merged.slice(0, 2) : ['其他'];
}

function compareFolderDates(a: ArchiveFolder, b: ArchiveFolder) {
  const ta = a.date ? Date.parse(a.date) : -1;
  const tb = b.date ? Date.parse(b.date) : -1;
  if (ta !== tb) return tb - ta;
  return a.label.localeCompare(b.label, 'zh-Hant');
}

function compareFolderDatesAsc(a: ArchiveFolder, b: ArchiveFolder) {
  return compareFolderDates(b, a);
}

function compareYear(a: string, b: string) {
  if (a === MISSING_DATE_LABEL) return 1;
  if (b === MISSING_DATE_LABEL) return -1;
  return b.localeCompare(a, 'zh-Hant');
}

function createStars() {
  const stars: StarSpec[] = [];
  for (let i = 0; i < 70; i += 1) {
    const size = Math.random() < 0.2 ? 2 : 1;
    stars.push({
      id: `star-${i}`,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      size,
      opacity: 0.05 + Math.random() * 0.25,
      duration: 2 + Math.random() * 5,
      delay: Math.random() * 4,
    });
  }
  return stars;
}

function pickRandom<T>(items: readonly T[]): T | null {
  if (!items.length) return null;
  return items[Math.floor(Math.random() * items.length)] ?? null;
}

function clampReadingFontSize(value: unknown, fallback = 14) {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.max(11, Math.min(22, Number(value)));
}

function clampChibiWidth(value: unknown, fallback = 136) {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.max(96, Math.min(186, Math.round(value)));
}

function normalizeLineHeightKey(value: unknown): ArchiveLineHeightKey {
  if (value === 'tight' || value === 'normal' || value === 'wide') return value;
  return 'normal';
}

function normalizeRelatedMode(value: unknown): RelatedMode {
  return value === 'prev-folder' ? 'prev-folder' : 'next-folder';
}

function normalizeArchiveFontMode(value: unknown): ArchiveFontMode {
  return value === 'archive' ? 'archive' : 'default';
}

function pickDefaultLineHeightKey(value: number): ArchiveLineHeightKey {
  if (value <= 1.86) return 'tight';
  if (value >= 2.45) return 'wide';
  return 'normal';
}

function readPrefs(defaultFontSize: number, defaultLineHeight: number): ArchivePrefs {
  const fallback: ArchivePrefs = {
    fontMode: 'default',
    lineHeight: pickDefaultLineHeightKey(defaultLineHeight),
    readingFontSize: clampReadingFontSize(defaultFontSize, 14),
    showHomeChibi: true,
    homeChibiWidth: 136,
    showReadingChibi: true,
    readingChibiWidth: 136,
    relatedMode: 'next-folder',
  };

  if (typeof window === 'undefined') return fallback;

  try {
    const raw = window.localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<ArchivePrefs>;
    return {
      fontMode: normalizeArchiveFontMode(parsed.fontMode),
      lineHeight: normalizeLineHeightKey(parsed.lineHeight),
      readingFontSize: clampReadingFontSize(parsed.readingFontSize, fallback.readingFontSize),
      showHomeChibi: parsed.showHomeChibi !== false,
      homeChibiWidth: clampChibiWidth(parsed.homeChibiWidth, fallback.homeChibiWidth),
      showReadingChibi: parsed.showReadingChibi !== false,
      readingChibiWidth: clampChibiWidth(parsed.readingChibiWidth, fallback.readingChibiWidth),
      relatedMode: normalizeRelatedMode(parsed.relatedMode),
    };
  } catch {
    return fallback;
  }
}

function persistPrefs(prefs: ArchivePrefs) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
}

function normalizeMasterIndex(input: unknown): MasterIndexPayload {
  if (!asRecord(input)) {
    return { folders: [], docs: [] };
  }

  const docsRaw = Array.isArray(input.docs) ? input.docs : [];
  const foldersRaw = Array.isArray(input.folders) ? input.folders : [];

  const docs: MasterDocRecord[] = docsRaw
    .filter(asRecord)
    .map((item) => ({
      id: toString(item.id),
      title: toString(item.title) || toString(item.sourceRelPath).split('/').pop() || '未命名',
      sourceRelPath: toString(item.sourceRelPath),
      sourceFolder: toString(item.sourceFolder),
      routes: toStringArray(item.routes),
      writtenAt: toNullableNumber(item.writtenAt),
      contentPath: toString(item.contentPath),
    }))
    .filter((item) => item.id && item.sourceFolder && item.contentPath);

  const folders: MasterFolderRecord[] = foldersRaw
    .filter(asRecord)
    .map((item) => ({
      folder: toString(item.folder),
      folderCode: toString(item.folderCode) || null,
      folderDate: toString(item.folderDate) || null,
      count: typeof item.count === 'number' && Number.isFinite(item.count) ? item.count : 0,
      ids: toStringArray(item.ids),
    }))
    .filter((item) => item.folder);

  return { folders, docs };
}

export function ArchivePage({
  onExit,
  archiveFontFamily = '',
  diaryContentFontSize = 14,
  diaryLineHeight = 2.16,
}: {
  onExit: () => void;
  archiveFontFamily?: string;
  diaryContentFontSize?: number;
  diaryLineHeight?: number;
}) {
  const [indexPayload, setIndexPayload] = useState<MasterIndexPayload | null>(null);
  const [indexError, setIndexError] = useState('');

  const [activeTab, setActiveTab] = useState<'tl' | 'crystal'>('tl');
  const [folderSortOrder, setFolderSortOrder] = useState<FolderSortOrder>('desc');
  const [folderSearchOpen, setFolderSearchOpen] = useState(false);
  const [folderSearchQuery, setFolderSearchQuery] = useState('');
  const [folderPanelOpen, setFolderPanelOpen] = useState(false);
  const [readingOpen, setReadingOpen] = useState(false);
  const [readingFontPanelOpen, setReadingFontPanelOpen] = useState(false);
  const [folderSheetOpen, setFolderSheetOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const [activeFolderKey, setActiveFolderKey] = useState<string | null>(null);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [sheetFolderKey, setSheetFolderKey] = useState<string | null>(null);

  const [docContents, setDocContents] = useState<Record<string, string>>({});
  const [loadingDocId, setLoadingDocId] = useState<string | null>(null);
  const [contentError, setContentError] = useState('');

  const [isRevealing, setIsRevealing] = useState(false);
  const [isCrystalRevealed, setIsCrystalRevealed] = useState(false);
  const [isCrystalSpinning, setIsCrystalSpinning] = useState(false);
  const [currentReveal, setCurrentReveal] = useState<CrystalReveal | null>(null);

  const [prefs, setPrefs] = useState<ArchivePrefs>(() => readPrefs(diaryContentFontSize, diaryLineHeight));
  const [settingsPanels, setSettingsPanels] = useState<SettingsPanels>({
    homeChibi: false,
    readingChibi: false,
    related: false,
  });

  const revealTimerRef = useRef<number | null>(null);
  const pendingLoadsRef = useRef(new Set<string>());
  const readingSwipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const folderSearchInputRef = useRef<HTMLInputElement | null>(null);
  const stars = useMemo(() => createStars(), []);
  const [chibiSrc] = useState(() => {
    const dedicated = getScopedChibiSources('archive');
    const basePool = getActiveBaseChibiSources();
    if (!dedicated.length) {
      return pickRandom(basePool) ?? FALLBACK_CHIBI;
    }
    const basePickCount = Math.min(basePool.length, Math.max(1, Math.round((dedicated.length * 3) / 7)));
    const mixed = uniqueStrings([...dedicated, ...basePool.slice(0, basePickCount)]);
    return pickRandom(mixed) ?? FALLBACK_CHIBI;
  });

  useEffect(() => {
    persistPrefs(prefs);
  }, [prefs]);

  useEffect(() => {
    if (!folderSearchOpen) return;
    folderSearchInputRef.current?.focus();
  }, [folderSearchOpen]);

  useEffect(() => {
    let active = true;
    fetch(INDEX_URL, { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<unknown>;
      })
      .then((raw) => {
        if (!active) return;
        setIndexPayload(normalizeMasterIndex(raw));
      })
      .catch((error: unknown) => {
        if (!active) return;
        setIndexError(error instanceof Error ? error.message : String(error));
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(
    () => () => {
      if (revealTimerRef.current !== null) {
        window.clearTimeout(revealTimerRef.current);
      }
    },
    [],
  );

  const docsById = useMemo(() => {
    const map = new Map<string, MasterDocRecord>();
    for (const doc of indexPayload?.docs ?? []) {
      map.set(doc.id, doc);
    }
    return map;
  }, [indexPayload]);

  const folders = useMemo(() => {
    if (!indexPayload) return [] as ArchiveFolder[];

    const mapped = indexPayload.folders
      .map((folder): ArchiveFolder => {
        const docs = folder.ids
          .map((id) => docsById.get(id))
          .filter((doc): doc is MasterDocRecord => Boolean(doc))
          .map((doc) => ({
            id: doc.id,
            title: doc.title,
            ext: getFileExt(doc.sourceRelPath),
            sourceRelPath: doc.sourceRelPath,
            routes: doc.routes,
            tags: buildDocTags(doc.routes),
            writtenAt: doc.writtenAt,
            contentPath: doc.contentPath,
          }));

        const allRoutes = uniqueStrings(docs.flatMap((doc) => doc.routes));

        return {
          key: folder.folder,
          label: formatFolderLabel(folder.folder, folder.folderCode),
          date: folder.folderDate,
          short: formatFolderShort(folder.folderDate),
          year: getFolderYear(folder.folderDate, folder.folder),
          cats: buildFolderTags(allRoutes),
          docs,
        };
      })
      .filter((folder) => folder.docs.length > 0);

    return mapped.sort(folderSortOrder === 'asc' ? compareFolderDatesAsc : compareFolderDates);
  }, [docsById, folderSortOrder, indexPayload]);

  const normalizedFolderSearchQuery = folderSearchQuery.trim().toLowerCase();
  const visibleFolders = useMemo(() => {
    if (!normalizedFolderSearchQuery) return folders;
    return folders.filter((folder) => {
      const haystack = [
        folder.label,
        folder.short,
        ...folder.cats,
        ...folder.docs.map((doc) => doc.title),
        ...folder.docs.flatMap((doc) => doc.tags),
      ]
        .join('\n')
        .toLowerCase();
      return haystack.includes(normalizedFolderSearchQuery);
    });
  }, [folders, normalizedFolderSearchQuery]);

  const foldersByKey = useMemo(() => {
    const map = new Map<string, ArchiveFolder>();
    for (const folder of folders) {
      map.set(folder.key, folder);
    }
    return map;
  }, [folders]);

  const timelineGroups = useMemo(() => {
    const grouped = new Map<string, ArchiveFolder[]>();
    for (const folder of visibleFolders) {
      const list = grouped.get(folder.year) ?? [];
      list.push(folder);
      grouped.set(folder.year, list);
    }

    return Array.from(grouped.entries())
      .sort(([a], [b]) => (folderSortOrder === 'asc' ? compareYear(b, a) : compareYear(a, b)))
      .map(([year, list]) => ({
        year,
        folders: list.sort(folderSortOrder === 'asc' ? compareFolderDatesAsc : compareFolderDates),
      }));
  }, [folderSortOrder, visibleFolders]);

  const allDocRefs = useMemo(() => {
    const refs: CrystalReveal[] = [];
    for (const folder of folders) {
      for (const doc of folder.docs) {
        refs.push({ folderKey: folder.key, docId: doc.id });
      }
    }
    return refs;
  }, [folders]);

  const activeFolder = useMemo(() => {
    if (!activeFolderKey) return null;
    return foldersByKey.get(activeFolderKey) ?? null;
  }, [activeFolderKey, foldersByKey]);

  const nextFolder = useMemo(() => {
    if (!activeFolder) return null;
    const currentIndex = folders.findIndex((folder) => folder.key === activeFolder.key);
    if (currentIndex < 0) return null;
    return folders[currentIndex + 1] ?? null;
  }, [activeFolder, folders]);

  const prevFolder = useMemo(() => {
    if (!activeFolder) return null;
    const currentIndex = folders.findIndex((folder) => folder.key === activeFolder.key);
    if (currentIndex < 0) return null;
    return folders[currentIndex - 1] ?? null;
  }, [activeFolder, folders]);

  const activeDocIndex = useMemo(() => {
    if (!activeFolder || !activeDocId) return -1;
    return activeFolder.docs.findIndex((doc) => doc.id === activeDocId);
  }, [activeDocId, activeFolder]);

  const activeDoc = useMemo(() => {
    if (!activeFolder || activeDocIndex < 0) return null;
    return activeFolder.docs[activeDocIndex] ?? null;
  }, [activeDocIndex, activeFolder]);

  const revealDoc = useMemo(() => {
    if (!currentReveal) return null;
    const folder = foldersByKey.get(currentReveal.folderKey);
    const doc = currentReveal.docId ? docsById.get(currentReveal.docId) : null;
    if (!folder || !doc) return null;
    return {
      folder,
      doc,
    };
  }, [currentReveal, docsById, foldersByKey]);

  const sheetFolder = useMemo(() => {
    if (!sheetFolderKey) return null;
    return foldersByKey.get(sheetFolderKey) ?? null;
  }, [sheetFolderKey, foldersByKey]);

  const lineHeightValue = LINE_HEIGHT_BY_KEY[prefs.lineHeight];
  const readContent = activeDoc ? docContents[activeDoc.id] ?? '' : '';
  const followArchiveFont = prefs.fontMode === 'archive' && Boolean(archiveFontFamily.trim());
  const contentFontFamily = followArchiveFont
    ? archiveFontFamily.trim()
    : "var(--app-font-family, -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif)";

  const canPrevFolder = !!prevFolder?.docs.length;
  const canNextFolder = !!nextFolder?.docs.length;
  const relatedButtonLabel = prefs.relatedMode === 'prev-folder' ? '上資料夾' : '下資料夾';

  const shouldShowChibi = readingOpen ? prefs.showReadingChibi : prefs.showHomeChibi;
  const activeChibiWidth = readingOpen ? prefs.readingChibiWidth : prefs.homeChibiWidth;
  const chibiDarkMode = activeTab === 'crystal' && !folderPanelOpen && !readingOpen;

  const loadDocContent = useCallback(
    async (docId: string) => {
      const doc = docsById.get(docId);
      if (!doc) return;
      if (docContents[docId] !== undefined) return;
      if (pendingLoadsRef.current.has(docId)) return;

      pendingLoadsRef.current.add(docId);
      setLoadingDocId(docId);
      setContentError('');

      try {
        const res = await fetch(`${BASE}data/master-pool/${doc.contentPath}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        setDocContents((prev) => ({ ...prev, [docId]: text.replace(/\r\n?/g, '\n').trim() }));
      } catch (error: unknown) {
        setContentError(error instanceof Error ? error.message : String(error));
      } finally {
        pendingLoadsRef.current.delete(docId);
        setLoadingDocId((current) => (current === docId ? null : current));
      }
    },
    [docContents, docsById],
  );

  const openFolderPanel = useCallback((folderKey: string) => {
    setActiveFolderKey(folderKey);
    setFolderPanelOpen(true);
  }, []);

  const closeFolderPanel = useCallback(() => {
    setFolderPanelOpen(false);
  }, []);

  const openReading = useCallback(
    (folderKey: string, docId: string) => {
      setActiveFolderKey(folderKey);
      setActiveDocId(docId);
      setReadingOpen(true);
      setReadingFontPanelOpen(false);
      setContentError('');
      void loadDocContent(docId);
    },
    [loadDocContent],
  );

  const closeReading = useCallback(() => {
    setFolderSheetOpen(false);
    setReadingOpen(false);
    setReadingFontPanelOpen(false);
  }, []);

  const navDoc = useCallback(
    (step: number) => {
      if (!activeFolder || activeDocIndex < 0) return;
      const nextIndex = activeDocIndex + step;
      if (nextIndex < 0 || nextIndex >= activeFolder.docs.length) return;
      const nextDoc = activeFolder.docs[nextIndex];
      setActiveDocId(nextDoc.id);
      setContentError('');
      void loadDocContent(nextDoc.id);
    },
    [activeDocIndex, activeFolder, loadDocContent],
  );

  const openNeighborFolderFirstDoc = useCallback(
    (direction: -1 | 1) => {
      const targetFolder = direction === -1 ? prevFolder : nextFolder;
      if (!targetFolder || !targetFolder.docs.length) return;
      const firstDoc = targetFolder.docs[0];
      setActiveFolderKey(targetFolder.key);
      setActiveDocId(firstDoc.id);
      setContentError('');
      void loadDocContent(firstDoc.id);
    },
    [loadDocContent, nextFolder, prevFolder],
  );

  const onReadTouchStart = useCallback((event: ReactTouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    readingSwipeStartRef.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const onReadTouchEnd = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      const start = readingSwipeStartRef.current;
      readingSwipeStartRef.current = null;
      if (!start) return;
      const touch = event.changedTouches[0];
      if (!touch) return;
      const deltaX = touch.clientX - start.x;
      const deltaY = touch.clientY - start.y;
      if (Math.abs(deltaX) < 36 || Math.abs(deltaX) < Math.abs(deltaY) * 1.15) return;
      navDoc(deltaX < 0 ? 1 : -1);
    },
    [navDoc],
  );

  const openFolderSheet = useCallback(() => {
    if (!activeFolder || !readingOpen) return;
    const targetFolder = prefs.relatedMode === 'prev-folder' ? prevFolder : nextFolder;
    setSheetFolderKey(targetFolder ? targetFolder.key : null);
    setFolderSheetOpen(true);
  }, [activeFolder, nextFolder, prefs.relatedMode, prevFolder, readingOpen]);

  const closeFolderSheet = useCallback(() => {
    setFolderSheetOpen(false);
  }, []);

  const switchTab = useCallback((tab: 'tl' | 'crystal') => {
    setActiveTab(tab);
    if (tab === 'crystal') {
      setFolderPanelOpen(false);
      setFolderSheetOpen(false);
    }
  }, []);

  const revealFromCrystal = useCallback(() => {
    if (isRevealing || isCrystalRevealed || !allDocRefs.length) return;

    const pick = allDocRefs[Math.floor(Math.random() * allDocRefs.length)];
    setCurrentReveal(pick);
    setIsRevealing(true);
    setIsCrystalSpinning(true);

    if (revealTimerRef.current !== null) {
      window.clearTimeout(revealTimerRef.current);
    }

    revealTimerRef.current = window.setTimeout(() => {
      setIsCrystalSpinning(false);
      setIsCrystalRevealed(true);
      setIsRevealing(false);
      revealTimerRef.current = null;
    }, 1100);
  }, [allDocRefs, isCrystalRevealed, isRevealing]);

  const resetCrystal = useCallback(() => {
    if (revealTimerRef.current !== null) {
      window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    setIsRevealing(false);
    setIsCrystalSpinning(false);
    setIsCrystalRevealed(false);
    setCurrentReveal(null);
  }, []);

  const enterRevealedDoc = useCallback(() => {
    if (!currentReveal) return;
    openReading(currentReveal.folderKey, currentReveal.docId);
  }, [currentReveal, openReading]);

  useEffect(() => {
    if (!folderSheetOpen || !activeFolder) return;
    const targetFolder = prefs.relatedMode === 'prev-folder' ? prevFolder : nextFolder;
    setSheetFolderKey(targetFolder ? targetFolder.key : null);
  }, [activeFolder, folderSheetOpen, nextFolder, prefs.relatedMode, prevFolder]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (showSettings) {
          setShowSettings(false);
          return;
        }
        if (folderSheetOpen) {
          closeFolderSheet();
          return;
        }
        if (readingOpen) {
          closeReading();
          return;
        }
        if (folderPanelOpen) {
          closeFolderPanel();
        }
        return;
      }

      if (!readingOpen) return;
      if (event.key === 'ArrowLeft') {
        navDoc(-1);
      } else if (event.key === 'ArrowRight') {
        navDoc(1);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    closeFolderPanel,
    closeFolderSheet,
    closeReading,
    folderPanelOpen,
    folderSheetOpen,
    navDoc,
    readingOpen,
    showSettings,
  ]);

  return (
    <div className="archive-page">
      <div className="archive-app">
        <div className="tab-bar" style={{ background: activeTab === 'crystal' ? '#12102a' : '#f5f0e6' }}>
          <button
            type="button"
            className={`tab-side-btn ${activeTab === 'crystal' ? 'dark' : ''}`}
            onClick={onExit}
            aria-label="返回首頁"
            title="返回首頁"
          >
            ‹
          </button>
          <button
            type="button"
            className={`tab ${activeTab === 'tl' ? 'active' : ''}`}
            onClick={() => switchTab('tl')}
            style={{ color: activeTab === 'crystal' ? 'rgba(160,150,210,.3)' : undefined }}
          >
            🗂 時間流
          </button>
          <button
            type="button"
            className={`tab ${activeTab === 'crystal' ? 'c-active active' : ''}`}
            onClick={() => switchTab('crystal')}
            style={{ color: activeTab === 'crystal' ? 'rgba(200,190,255,.8)' : undefined }}
          >
            🔮 水晶球
          </button>
          <button
            type="button"
            className={`tab-side-btn dots ${activeTab === 'crystal' ? 'dark' : ''}`}
            onClick={() => setShowSettings(true)}
            aria-label="開啟總攬設定"
          >
            ⋯
          </button>
        </div>

        <div id="view-tl" className={activeTab === 'tl' ? '' : 'hidden'}>
          <div className="tl-inner">
            <div className="tl-sort-row">
              <button
                type="button"
                className="tl-sort-btn active"
                onClick={() => setFolderSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                aria-label={folderSortOrder === 'asc' ? '目前正序，點擊切換倒序' : '目前倒序，點擊切換正序'}
                title={folderSortOrder === 'asc' ? '點擊切換倒序' : '點擊切換正序'}
              >
                {folderSortOrder === 'asc' ? '▲ 正序' : '▼ 倒序'}
              </button>
              <button
                type="button"
                className={`tl-sort-btn tl-search-btn ${folderSearchOpen ? 'active' : ''}`}
                onClick={() =>
                  setFolderSearchOpen((prev) => {
                    const next = !prev;
                    if (!next) setFolderSearchQuery('');
                    return next;
                  })
                }
                aria-label={folderSearchOpen ? '關閉搜尋' : '開啟搜尋'}
                title={folderSearchOpen ? '關閉搜尋' : '開啟搜尋'}
              >
                ⌕
              </button>
            </div>
            {folderSearchOpen ? (
              <div className="tl-search-row">
                <input
                  ref={folderSearchInputRef}
                  className="tl-search-input"
                  value={folderSearchQuery}
                  onChange={(event) => setFolderSearchQuery(event.target.value)}
                  placeholder="搜尋資料夾、標籤或檔案標題"
                  aria-label="搜尋總攬資料夾"
                />
              </div>
            ) : null}
            {indexError && <div className="empty-state">無法載入資料：{indexError}</div>}
            {!indexPayload && !indexError && <div className="empty-state">載入中⋯</div>}
            {indexPayload && !timelineGroups.length && (
              <div className="empty-state">{normalizedFolderSearchQuery ? '找不到符合搜尋的資料夾' : '目前沒有可顯示的資料夾'}</div>
            )}

            {timelineGroups.map((group) => (
              <div key={group.year} className="year-block">
                <div className="year-marker">
                  <div className="year-num">{group.year}</div>
                  <div className="year-line" />
                </div>

                {group.folders.map((folder, index) => {
                  const currentMonthKey = getFolderMonthKey(folder.date);
                  const prevMonthKey = index > 0 ? getFolderMonthKey(group.folders[index - 1]?.date ?? null) : null;
                  const showMonthMarker = index === 0 || currentMonthKey !== prevMonthKey;

                  return (
                    <div key={folder.key}>
                      {showMonthMarker ? (
                        <div className="month-marker">
                          <span className="month-label">{formatFolderMonth(folder.date)}</span>
                          <span className="month-line" />
                        </div>
                      ) : null}
                      <button
                        type="button"
                        className="folder-row"
                        onClick={() => openFolderPanel(folder.key)}
                      >
                        <div className="fr-main">
                          <div className="fr-top">
                            <span className="fr-label">{folder.label}</span>
                            <span className="fr-date">{folder.short}</span>
                          </div>
                          <div className="fr-tags">
                            {folder.cats.map((tag) => (
                              <span key={`${folder.key}-${tag}`} className={`cat-tag ${TAG_CLASS[tag] ?? 'ct-other'}`}>
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="fr-right">
                          <span className="fr-count">{folder.docs.length} 份</span>
                          <span className="fr-arrow">›</span>
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <div id="view-crystal" className={activeTab === 'crystal' ? 'active' : ''}>
          <div className="c-stars">
            {stars.map((star) => (
              <span
                key={star.id}
                className="star"
                style={{
                  left: star.left,
                  top: star.top,
                  width: `${star.size}px`,
                  height: `${star.size}px`,
                  opacity: star.opacity,
                  animationDuration: `${star.duration}s`,
                  animationDelay: `${star.delay}s`,
                }}
              />
            ))}
          </div>

          <div className={`crystal-prompt ${isCrystalRevealed || isCrystalSpinning ? 'hidden' : ''}`}>
            輕觸水晶球
            <br />
            窺見過去的碎片
          </div>

          <div className="ball-wrap">
            <button
              type="button"
              className={`crystal-ball ${isCrystalSpinning ? 'spinning' : ''} ${isCrystalRevealed ? 'revealed' : ''}`}
              onClick={revealFromCrystal}
            >
              <div className="ball-inner">
                <div className="fog f1" />
                <div className="fog f2" />
                <div className="fog f3" />
                <div className="fog f4" />
                <div className="vision-text">
                  <div className="v-tag">{revealDoc ? `${revealDoc.folder.label} · ${revealDoc.folder.short}` : ''}</div>
                  <div className="v-title">{revealDoc?.doc.title ?? ''}</div>
                  <div className="v-ext">{revealDoc?.doc.sourceRelPath.split('.').pop()?.toUpperCase() ?? ''}</div>
                </div>
              </div>
            </button>
            <div className="ball-shadow" />
          </div>

          <div className={`crystal-actions ${isCrystalRevealed ? 'visible' : ''}`}>
            <button type="button" className="enter-btn" onClick={enterRevealedDoc}>
              進入這段記憶 →
            </button>
            <button type="button" className="again-btn" onClick={resetCrystal}>
              🔮 再看一次
            </button>
          </div>
        </div>

        <div className={`folder-panel ${folderPanelOpen ? '' : 'off-right'}`}>
          <div className="fp-hdr">
            <button type="button" className="back-btn" onClick={closeFolderPanel}>
              ‹
            </button>
            <div className="fp-title">{activeFolder?.label ?? '資料夾'}</div>
            <div className="fp-meta">
              {activeFolder ? `${activeFolder.short} · ${activeFolder.docs.length} 份` : '—'}
            </div>
            <button
              type="button"
              className="fp-menu-btn"
              onClick={() => setShowSettings(true)}
              aria-label="開啟總攬設定"
            >
              ⋯
            </button>
          </div>

          <div className="fp-body">
            <div className="fp-section-label">所有文件</div>
            {activeFolder?.docs.map((doc) => (
              <button
                key={doc.id}
                type="button"
                className="fp-file-item"
                onClick={() => openReading(activeFolder.key, doc.id)}
              >
                <div className={`fp-file-icon ${doc.ext}`}>{doc.ext === 'docx' ? '📄' : '📃'}</div>
                <div className="fp-file-info">
                  <div className="fp-file-name">{doc.title}</div>
                  <div className="fp-file-sub">{formatShortDate(doc.writtenAt)}</div>
                </div>
                <div className="fp-file-right">
                  <div className="fp-file-tags">
                    {doc.tags.map((tag) => (
                      <span key={`${doc.id}-${tag}`} className={`cat-tag fp-file-tag ${TAG_CLASS[tag] ?? 'ct-other'}`}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </button>
            ))}
            {activeFolder && !activeFolder.docs.length && <div className="empty-state">此資料夾目前沒有檔案</div>}
          </div>
        </div>

        <div className={`reading-panel ${readingOpen ? '' : 'off-right'}`}>
          <div className="read-hdr">
            <button type="button" className="back-btn" onClick={closeReading}>
              ‹
            </button>
            <div className="read-crumb">
              {activeFolder && activeDoc ? `${activeFolder.label} › ${activeDoc.title}` : ''}
            </div>
            <div className="read-tools">
              <button
                type="button"
                className={`read-mini-btn ${canPrevFolder ? '' : 'disabled'}`}
                onClick={() => openNeighborFolderFirstDoc(-1)}
                disabled={!canPrevFolder}
                aria-label="上一資料夾第一封"
              >
                ‹
              </button>
              <button type="button" className="folder-nav-btn" onClick={openFolderSheet}>
                {relatedButtonLabel} ☰
              </button>
              <button
                type="button"
                className={`read-mini-btn ${canNextFolder ? '' : 'disabled'}`}
                onClick={() => openNeighborFolderFirstDoc(1)}
                disabled={!canNextFolder}
                aria-label="下一資料夾第一封"
              >
                ›
              </button>
              <button
                type="button"
                className="read-aa-btn"
                onClick={() => setReadingFontPanelOpen((prev) => !prev)}
                aria-label="開啟閱讀字體設定"
                title="閱讀字體設定"
              >
                Aa
              </button>
              <button
                type="button"
                className="read-menu-btn"
                onClick={() => setShowSettings(true)}
                aria-label="開啟總攬設定"
              >
                ⋯
              </button>
            </div>
          </div>

          {readingFontPanelOpen ? (
            <div className="read-font-panel">
              <p className="read-font-title">字體來源</p>
              <div className="read-font-row">
                <button
                  type="button"
                  className={`read-font-mode-btn ${prefs.fontMode === 'default' ? 'active' : ''}`}
                  onClick={() => setPrefs((prev) => ({ ...prev, fontMode: 'default' }))}
                >
                  預設
                </button>
                <button
                  type="button"
                  className={`read-font-mode-btn ${prefs.fontMode === 'archive' ? 'active' : ''}`}
                  onClick={() => setPrefs((prev) => ({ ...prev, fontMode: 'archive' }))}
                >
                  跟隨總攬
                </button>
              </div>

              <div className="read-font-control">
                <div className="read-font-control-head">
                  <p className="read-font-title">字級</p>
                  <p className="read-font-value">{prefs.readingFontSize.toFixed(1)}px</p>
                </div>
                <input
                  type="range"
                  min={11}
                  max={22}
                  step={0.5}
                  value={prefs.readingFontSize}
                  onChange={(event) =>
                    setPrefs((prev) => ({
                      ...prev,
                      readingFontSize: clampReadingFontSize(Number(event.target.value), prev.readingFontSize),
                    }))
                  }
                  className="read-font-slider"
                />
              </div>

              <div className="read-font-control">
                <div className="read-font-control-head">
                  <p className="read-font-title">行距</p>
                  <p className="read-font-value">{lineHeightValue.toFixed(2)}</p>
                </div>
                <div className="read-font-row">
                  {LINE_HEIGHT_OPTIONS.map((option) => (
                    <button
                      key={`read-font-line-${option.key}`}
                      type="button"
                      className={`read-font-mode-btn ${prefs.lineHeight === option.key ? 'active' : ''}`}
                      onClick={() => setPrefs((prev) => ({ ...prev, lineHeight: option.key }))}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          <div className="read-body" onTouchStart={onReadTouchStart} onTouchEnd={onReadTouchEnd}>
            <div className="doc-paper">
              <div className="doc-title" style={{ fontFamily: contentFontFamily, fontSize: 'var(--ui-header-title-size, 17px)' }}>
                {activeDoc?.title ?? ''}
              </div>
              <div className="doc-meta" style={{ fontSize: 'var(--ui-hint-text-size, 9px)' }}>
                {activeFolder && activeDoc ? `${activeFolder.label} · ${formatShortDate(activeDoc.writtenAt)} · ${activeDoc.ext.toUpperCase()}` : ''}
              </div>

              {contentError && <div className="doc-placeholder">讀取失敗：{contentError}</div>}
              {loadingDocId === activeDoc?.id && !readContent && <div className="doc-placeholder">讀取中⋯</div>}
              {!contentError && activeDoc && loadingDocId !== activeDoc.id && !readContent && (
                <div className="doc-placeholder">此檔案目前沒有可讀內容。</div>
              )}

              {!!readContent && (
                <div
                  className="doc-content"
                  style={{
                    fontFamily: contentFontFamily,
                    fontSize: `${prefs.readingFontSize}px`,
                    lineHeight: lineHeightValue,
                  }}
                >
                  {readContent}
                </div>
              )}
            </div>
          </div>
        </div>

        {shouldShowChibi ? (
          <div className={`chibi-float ${chibiDarkMode ? 'dark' : ''}`}>
            <button
              type="button"
              className="chibi-float-btn"
              onClick={() => setShowSettings(true)}
              title="開啟總攬設定"
              aria-label="開啟總攬設定"
            >
              <img
                src={chibiSrc}
                alt=""
                draggable={false}
                className="calendar-chibi select-none"
                style={{ width: activeChibiWidth, height: 'auto' }}
              />
            </button>
          </div>
        ) : null}

        {showSettings ? (
          <div className="archive-settings-overlay" onClick={() => setShowSettings(false)}>
            <div className="archive-settings-sheet" onClick={(event) => event.stopPropagation()}>
              <div className="archive-sheet-handle" />

              <SettingsAccordion
                title="M"
                subtitle="總攬首頁與清單頁"
                isOpen={settingsPanels.homeChibi}
                onToggle={() => setSettingsPanels((prev) => ({ ...prev, homeChibi: !prev.homeChibi }))}
                className="archive-sheet-section"
                titleClassName="archive-sheet-label"
                subtitleClassName="archive-sheet-subtitle"
                chevronClassName="archive-sheet-chevron"
                bodyClassName="mt-2"
              >
                <div className="archive-toggle-row">
                  <span>M</span>
                  <button
                    type="button"
                    className={`archive-switch ${prefs.showHomeChibi ? 'on' : ''}`}
                    onClick={() => setPrefs((prev) => ({ ...prev, showHomeChibi: !prev.showHomeChibi }))}
                    aria-label="切換總攬首頁與清單頁M顯示"
                  >
                    <span />
                  </button>
                </div>
                <label className="archive-range-row">
                  <input
                    type="range"
                    min={96}
                    max={186}
                    step={1}
                    value={prefs.homeChibiWidth}
                    onChange={(event) =>
                      setPrefs((prev) => ({
                        ...prev,
                        homeChibiWidth: clampChibiWidth(Number(event.target.value), prev.homeChibiWidth),
                      }))
                    }
                  />
                </label>
              </SettingsAccordion>

              <SettingsAccordion
                title="閱讀M"
                subtitle="閱讀頁顯示與大小"
                isOpen={settingsPanels.readingChibi}
                onToggle={() => setSettingsPanels((prev) => ({ ...prev, readingChibi: !prev.readingChibi }))}
                className="archive-sheet-section"
                titleClassName="archive-sheet-label"
                subtitleClassName="archive-sheet-subtitle"
                chevronClassName="archive-sheet-chevron"
                bodyClassName="mt-2"
              >
                <div className="archive-toggle-row">
                  <span>M</span>
                  <button
                    type="button"
                    className={`archive-switch ${prefs.showReadingChibi ? 'on' : ''}`}
                    onClick={() => setPrefs((prev) => ({ ...prev, showReadingChibi: !prev.showReadingChibi }))}
                    aria-label="切換閱讀頁M顯示"
                  >
                    <span />
                  </button>
                </div>
                <label className="archive-range-row">
                  <input
                    type="range"
                    min={96}
                    max={186}
                    step={1}
                    value={prefs.readingChibiWidth}
                    onChange={(event) =>
                      setPrefs((prev) => ({
                        ...prev,
                        readingChibiWidth: clampChibiWidth(Number(event.target.value), prev.readingChibiWidth),
                      }))
                    }
                  />
                </label>
              </SettingsAccordion>

              <SettingsAccordion
                title="相關閱讀"
                subtitle="上資料夾/下資料夾"
                isOpen={settingsPanels.related}
                onToggle={() => setSettingsPanels((prev) => ({ ...prev, related: !prev.related }))}
                className="archive-sheet-section"
                titleClassName="archive-sheet-label"
                subtitleClassName="archive-sheet-subtitle"
                chevronClassName="archive-sheet-chevron"
                bodyClassName="mt-2"
              >
                <div className="archive-pill-group">
                  <button
                    type="button"
                    className={`archive-pill ${prefs.relatedMode === 'prev-folder' ? 'active' : ''}`}
                    onClick={() => setPrefs((prev) => ({ ...prev, relatedMode: 'prev-folder' }))}
                  >
                    上資料夾
                  </button>
                  <button
                    type="button"
                    className={`archive-pill ${prefs.relatedMode === 'next-folder' ? 'active' : ''}`}
                    onClick={() => setPrefs((prev) => ({ ...prev, relatedMode: 'next-folder' }))}
                  >
                    下資料夾
                  </button>
                </div>
              </SettingsAccordion>
            </div>
          </div>
        ) : null}

        <div className={`sheet-overlay ${folderSheetOpen ? 'open' : ''}`} onClick={closeFolderSheet} />
        <div className={`folder-sheet ${folderSheetOpen ? 'open' : ''}`}>
          <div className="sheet-handle" />
          <div className="sheet-folder-title">
            {sheetFolder
              ? `${sheetFolder.label} · ${sheetFolder.short}`
              : prefs.relatedMode === 'prev-folder'
                ? '上資料夾（目前沒有）'
                : '下資料夾（目前沒有）'}
          </div>
          <div className="sheet-list">
            {sheetFolder?.docs.length ? (
              sheetFolder.docs.map((doc) => (
                <button
                  key={`sheet-${sheetFolder.key}-${doc.id}`}
                  type="button"
                  className={`sheet-file-item ${doc.id === activeDoc?.id ? 'current' : ''}`}
                  onClick={() => {
                    openReading(sheetFolder.key, doc.id);
                    closeFolderSheet();
                  }}
                >
                  <span className="sf-name">{doc.title}</span>
                </button>
              ))
            ) : (
              <p className="sheet-empty">目前沒有可顯示項目</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ArchivePage;
