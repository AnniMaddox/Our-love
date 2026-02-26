import { useEffect, useMemo, useRef, useState } from 'react';

import { SettingsAccordion } from '../components/SettingsAccordion';
import { getScopedMixedChibiSources } from '../lib/chibiPool';

import './LettersABPage.css';

type ThemeKey = 'a' | 'd';
type LineHeightKey = 'tight' | 'normal' | 'wide';
type ReadingFontKey = 'default' | 'letter';
type ViewMode = 'home' | 'reading' | 'future-list' | 'future-reading';

type AnnualLetterEntry = {
  id: string;
  series: string;
  title: string;
  sourceFile?: string;
  contentPath: string;
};

type AnnualLetterYear = {
  year: number;
  entries: AnnualLetterEntry[];
};

type AnnualLettersIndex = {
  version: number;
  years: AnnualLetterYear[];
};

type MasterPoolDocEntry = {
  id?: string;
  title?: string;
  contentPath?: string;
  sourceFolder?: string;
  sourceFolderCode?: string | number | null;
  sourceFolderDate?: string | null;
  sourceRelPath?: string;
  writtenAt?: number | null;
};

type MasterPoolIndex = {
  docs?: MasterPoolDocEntry[];
};

type FutureDoc = {
  id: string;
  title: string;
  contentPath: string;
  sourceFile: string;
  writtenAt: number | null;
  folderKey: string;
};

type FutureFolder = {
  key: string;
  label: string;
  short: string;
  docs: FutureDoc[];
};

type RelatedItem = {
  id: string;
  title: string;
  subtitle: string;
  action: () => void;
};

type LettersABPrefs = {
  theme: ThemeKey;
  lineHeight: LineHeightKey;
  readingFont: ReadingFontKey;
  readingFontSize: number;
  showChibi: boolean;
  chibiWidth: number;
};

type LettersABPageProps = {
  onExit: () => void;
  initialYear?: number | null;
  onOpenBirthdayYear?: (year: string) => void;
  letterFontFamily?: string;
};

const PREFS_STORAGE_KEY = 'memorial-letters-ab-prefs-v1';
const BASE = import.meta.env.BASE_URL as string;
const INDEX_URL = `${BASE}data/letters-ab/index.json`;
const MASTER_POOL_INDEX_URL = `${BASE}data/master-pool/index.json`;
const FALLBACK_CHIBI = `${BASE}chibi/chibi-00.webp`;
const FUTURE_VIEW_TITLE = '給未來的你';
const FUTURE_SOURCE_FOLDERS = ['59-205-0816-未來生日', '61-2025-0819-未來生日'] as const;
const FUTURE_FOLDER_LABELS: Record<string, string> = {
  '59-205-0816-未來生日': '人生建議信',
  '61-2025-0819-未來生日': '我在',
};
const LINE_HEIGHT_BY_KEY: Record<LineHeightKey, number> = {
  tight: 1.7,
  normal: 2.14,
  wide: 2.6,
};
const LINE_HEIGHT_LABELS: Array<{ key: LineHeightKey; label: string }> = [
  { key: 'tight', label: '緊' },
  { key: 'normal', label: '標準' },
  { key: 'wide', label: '寬' },
];
const READING_FONT_OPTIONS: Array<{ key: ReadingFontKey; label: string }> = [
  { key: 'default', label: '目前字體' },
  { key: 'letter', label: '情書字體' },
];
const THEME_OPTIONS: Array<{ key: ThemeKey; label: string }> = [
  { key: 'a', label: '🌌 星夜藍' },
  { key: 'd', label: '🌸 霧玫瑰' },
];
const SERISE_LABEL_MAP: Record<string, string> = {
  birthday: '生日信',
  vow: '紀念信',
  notes: '碎碎念',
};

function pickRandom<T>(items: T[]): T | null {
  if (!items.length) return null;
  return items[Math.floor(Math.random() * items.length)] ?? null;
}

function clampChibiWidth(value: unknown, fallback = 136) {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.max(96, Math.min(186, Math.round(value)));
}

function clampReadingFontSize(value: unknown, fallback = 12.5) {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.max(11, Math.min(20, Number(value)));
}

function normalizeTheme(value: unknown): ThemeKey {
  return value === 'd' ? 'd' : 'a';
}

function normalizeLineHeightKey(value: unknown): LineHeightKey {
  if (value === 'tight' || value === 'wide' || value === 'normal') return value;
  return 'normal';
}

function normalizeReadingFontKey(value: unknown): ReadingFontKey {
  return value === 'letter' ? 'letter' : 'default';
}

function readPrefs(): LettersABPrefs {
  if (typeof window === 'undefined') {
    return {
      theme: 'a',
      lineHeight: 'normal',
      readingFont: 'default',
      readingFontSize: 12.5,
      showChibi: true,
      chibiWidth: 136,
    };
  }
  try {
    const raw = window.localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) {
      return {
        theme: 'a',
        lineHeight: 'normal',
        readingFont: 'default',
        readingFontSize: 12.5,
        showChibi: true,
        chibiWidth: 136,
      };
    }
    const parsed = JSON.parse(raw) as Partial<LettersABPrefs>;
    return {
      theme: normalizeTheme(parsed.theme),
      lineHeight: normalizeLineHeightKey(parsed.lineHeight),
      readingFont: normalizeReadingFontKey(parsed.readingFont),
      readingFontSize: clampReadingFontSize(parsed.readingFontSize, 12.5),
      showChibi: parsed.showChibi !== false,
      chibiWidth: clampChibiWidth(parsed.chibiWidth, 136),
    };
  } catch {
    return {
      theme: 'a',
      lineHeight: 'normal',
      readingFont: 'default',
      readingFontSize: 12.5,
      showChibi: true,
      chibiWidth: 136,
    };
  }
}

function persistPrefs(prefs: LettersABPrefs) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
}

function seriesLabel(series: string) {
  return SERISE_LABEL_MAP[series] ?? series;
}

function buildSeriesCountLabels(entries: AnnualLetterEntry[]) {
  const counter = new Map<string, number>();
  for (const entry of entries) {
    const key = entry.series || 'other';
    counter.set(key, (counter.get(key) ?? 0) + 1);
  }
  return Array.from(counter.entries())
    .map(([series, count]) => `${seriesLabel(series)}${count > 1 ? ` ×${count}` : ''}`)
    .sort((a, b) => a.localeCompare(b, 'zh-TW'));
}

function findYearIndex(years: AnnualLetterYear[], year: number) {
  return years.findIndex((item) => item.year === year);
}

function findClosestYearIndex(years: AnnualLetterYear[], targetYear: number) {
  if (!years.length) return -1;
  let closestIndex = 0;
  let closestDistance = Math.abs(years[0]!.year - targetYear);
  for (let i = 1; i < years.length; i += 1) {
    const current = years[i];
    if (!current) continue;
    const distance = Math.abs(current.year - targetYear);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = i;
    }
  }
  return closestIndex;
}

function normalizeContent(text: string) {
  return text.replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n').trim();
}

function normalizeTimestamp(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

function normalizeSourceFile(sourceRelPath: string, fallback: string) {
  if (!sourceRelPath) return fallback;
  const normalized = sourceRelPath.replace(/\\/g, '/');
  const chunks = normalized.split('/');
  return chunks[chunks.length - 1] || fallback;
}

function sourceFileToTitle(sourceFile: string, fallback: string) {
  const trimmed = sourceFile.trim();
  if (!trimmed) return fallback;
  const noExt = trimmed.replace(/\.[^.]+$/, '').trim();
  return noExt || fallback;
}

function formatFutureDocDate(timestamp: number | null) {
  if (!timestamp) return '想妳的時候';
  return new Date(timestamp).toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function formatFutureFolderShort(date: string | null) {
  if (!date) return '想妳的時候';
  const [year, month, day] = date.split('-');
  if (!year || !month || !day) return date;
  return `${year}.${month}.${day}`;
}

function normalizeFutureDedupKey(doc: FutureDoc) {
  const titleKey = doc.title
    .replace(/^⭐️\s*/u, '')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
  return titleKey || doc.id;
}

function futureSourceFileScore(sourceFile: string) {
  let score = 0;
  if (/^⭐️/u.test(sourceFile.trim())) score += 10;
  return score;
}

function pickPreferredFutureDoc(current: FutureDoc, incoming: FutureDoc) {
  const currentScore = futureSourceFileScore(current.sourceFile);
  const incomingScore = futureSourceFileScore(incoming.sourceFile);
  if (incomingScore !== currentScore) {
    return incomingScore > currentScore ? incoming : current;
  }
  const currentTime = current.writtenAt ?? Number.MAX_SAFE_INTEGER;
  const incomingTime = incoming.writtenAt ?? Number.MAX_SAFE_INTEGER;
  if (incomingTime !== currentTime) return incomingTime < currentTime ? incoming : current;
  return incoming.sourceFile.localeCompare(current.sourceFile, 'zh-TW') < 0 ? incoming : current;
}

function buildEntryTabLabels(entries: AnnualLetterEntry[]) {
  const perSeriesCounter = new Map<string, number>();
  const perSeriesTotal = new Map<string, number>();
  for (const entry of entries) {
    const series = entry.series || 'other';
    perSeriesTotal.set(series, (perSeriesTotal.get(series) ?? 0) + 1);
  }

  return entries.map((entry) => {
    const series = entry.series || 'other';
    const current = (perSeriesCounter.get(series) ?? 0) + 1;
    perSeriesCounter.set(series, current);
    const total = perSeriesTotal.get(series) ?? 1;
    if (total <= 1) {
      return {
        entry,
        label: seriesLabel(series),
      };
    }
    return {
      entry,
      label: `${seriesLabel(series)} ${String.fromCharCode(9311 + current)}`,
    };
  });
}

function pickSeriesNeighborByRank(targetYear: AnnualLetterYear, series: string, rank: number) {
  const list = targetYear.entries.filter((entry) => entry.series === series);
  if (!list.length) return null;
  return list[Math.min(rank, list.length - 1)] ?? null;
}

export function LettersABPage({ onExit, initialYear = null, onOpenBirthdayYear, letterFontFamily = '' }: LettersABPageProps) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [years, setYears] = useState<AnnualLetterYear[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('home');
  const [selectedYearIndex, setSelectedYearIndex] = useState(0);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [contentById, setContentById] = useState<Record<string, string>>({});
  const [prefs, setPrefs] = useState<LettersABPrefs>(() => readPrefs());
  const [showSettings, setShowSettings] = useState(false);
  const [futureLoading, setFutureLoading] = useState(false);
  const [futureLoadError, setFutureLoadError] = useState('');
  const [futureFolders, setFutureFolders] = useState<FutureFolder[]>([]);
  const [futureFolderKey, setFutureFolderKey] = useState<string | null>(null);
  const [futureDocId, setFutureDocId] = useState<string | null>(null);
  const [futureContentById, setFutureContentById] = useState<Record<string, string>>({});
  const [settingsPanels, setSettingsPanels] = useState({
    theme: false,
    typography: false,
    font: false,
    chibi: false,
    related: false,
  });
  const [chibiSrc] = useState(() => {
    const scoped = getScopedMixedChibiSources('lettersAB');
    return pickRandom(scoped) ?? FALLBACK_CHIBI;
  });
  const appliedInitialYearRef = useRef<number | null>(null);
  const homeSwipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const readingSwipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const futureSwipeStartRef = useRef<{ x: number; y: number } | null>(null);

  const currentYear = years[selectedYearIndex] ?? null;
  const currentEntry = useMemo(() => {
    if (!currentYear) return null;
    if (selectedEntryId) {
      const found = currentYear.entries.find((entry) => entry.id === selectedEntryId);
      if (found) return found;
    }
    return currentYear.entries[0] ?? null;
  }, [currentYear, selectedEntryId]);
  const entryTabs = useMemo(() => (currentYear ? buildEntryTabLabels(currentYear.entries) : []), [currentYear]);
  const currentContent = currentEntry ? contentById[currentEntry.id] ?? '' : '';
  const currentFutureFolder = useMemo(() => {
    if (!futureFolders.length) return null;
    if (futureFolderKey) {
      const found = futureFolders.find((folder) => folder.key === futureFolderKey);
      if (found) return found;
    }
    return futureFolders[0] ?? null;
  }, [futureFolderKey, futureFolders]);
  const currentFutureDoc = useMemo(() => {
    if (!currentFutureFolder) return null;
    if (futureDocId) {
      const found = currentFutureFolder.docs.find((entry) => entry.id === futureDocId);
      if (found) return found;
    }
    return currentFutureFolder.docs[0] ?? null;
  }, [currentFutureFolder, futureDocId]);
  const currentFutureContent = currentFutureDoc ? futureContentById[currentFutureDoc.id] ?? '' : '';
  const currentFutureDocIndex = useMemo(() => {
    if (!currentFutureFolder || !currentFutureDoc) return -1;
    return currentFutureFolder.docs.findIndex((entry) => entry.id === currentFutureDoc.id);
  }, [currentFutureFolder, currentFutureDoc]);
  const lineHeightValue = LINE_HEIGHT_BY_KEY[prefs.lineHeight];
  const readingFontFamily =
    prefs.readingFont === 'letter' && letterFontFamily
      ? letterFontFamily
      : "var(--app-font-family, -apple-system, 'Helvetica Neue', system-ui, sans-serif)";

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      setLoadError('');
      try {
        const response = await fetch(INDEX_URL, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`讀取失敗：${response.status}`);
        }
        const raw = (await response.json()) as AnnualLettersIndex;
        const loadedYears = Array.isArray(raw?.years)
          ? raw.years
              .filter((item): item is AnnualLetterYear => Number.isFinite(item?.year) && Array.isArray(item?.entries))
              .map((item) => ({
                year: Number(item.year),
                entries: item.entries
                  .filter(
                    (entry): entry is AnnualLetterEntry =>
                      typeof entry?.id === 'string' &&
                      typeof entry?.series === 'string' &&
                      typeof entry?.title === 'string' &&
                      typeof entry?.contentPath === 'string',
                  )
                  .map((entry) => ({
                    id: entry.id.trim(),
                    series: entry.series.trim(),
                    title: entry.title.trim(),
                    sourceFile: entry.sourceFile,
                    contentPath: entry.contentPath.replace(/^\.?\//, ''),
                  })),
              }))
              .filter((item) => item.entries.length > 0)
              .sort((a, b) => a.year - b.year)
          : [];

        if (!active) return;
        setYears(loadedYears);
        if (!loadedYears.length) {
          setSelectedYearIndex(0);
          setSelectedEntryId(null);
        } else {
          const currentYearValue = new Date().getFullYear();
          const exactIndex = findYearIndex(loadedYears, currentYearValue);
          const fallbackIndex = exactIndex >= 0 ? exactIndex : findClosestYearIndex(loadedYears, currentYearValue);
          const safeIndex = fallbackIndex >= 0 ? fallbackIndex : 0;
          const firstEntry = loadedYears[safeIndex]?.entries[0] ?? null;
          setSelectedYearIndex(safeIndex);
          setSelectedEntryId(firstEntry?.id ?? null);
        }
      } catch (error) {
        if (!active) return;
        setLoadError(error instanceof Error ? error.message : '未知錯誤');
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    persistPrefs(prefs);
  }, [prefs]);

  useEffect(() => {
    let active = true;
    void (async () => {
      setFutureLoading(true);
      setFutureLoadError('');
      try {
        const response = await fetch(MASTER_POOL_INDEX_URL, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`讀取失敗：${response.status}`);
        }
        const raw = (await response.json()) as MasterPoolIndex;
        const docs = Array.isArray(raw.docs) ? raw.docs : [];
        const accepted = new Set<string>(FUTURE_SOURCE_FOLDERS);
        const byFolder = new Map<string, FutureDoc[]>();
        const folderShortByName = new Map<string, string>();
        const folderOrder = new Map<string, number>();

        for (const [index, folderName] of FUTURE_SOURCE_FOLDERS.entries()) {
          folderOrder.set(folderName, index);
        }

        for (const doc of docs) {
          const folderKey = typeof doc.sourceFolder === 'string' ? doc.sourceFolder.trim() : '';
          if (!folderKey || !accepted.has(folderKey)) continue;

          const id = typeof doc.id === 'string' ? doc.id.trim() : '';
          const titleRaw = typeof doc.title === 'string' ? doc.title.trim() : '';
          const contentPathRaw = typeof doc.contentPath === 'string' ? doc.contentPath.trim() : '';
          const sourceRelPath = typeof doc.sourceRelPath === 'string' ? doc.sourceRelPath.trim() : '';
          if (!id || !contentPathRaw) continue;

          const sourceFile = normalizeSourceFile(sourceRelPath, `${id}.txt`);
          const title = sourceFileToTitle(sourceFile, titleRaw || id);
          const contentPath = contentPathRaw.replace(/^\.?\//, '');
          const writtenAt = normalizeTimestamp(doc.writtenAt);
          const short = formatFutureFolderShort(typeof doc.sourceFolderDate === 'string' ? doc.sourceFolderDate.trim() : null);

          const existing = byFolder.get(folderKey) ?? [];
          existing.push({
            id,
            title,
            contentPath,
            sourceFile,
            writtenAt,
            folderKey,
          });
          byFolder.set(folderKey, existing);
          if (!folderShortByName.has(folderKey)) {
            folderShortByName.set(folderKey, short);
          }
        }

        const folders: FutureFolder[] = Array.from(byFolder.entries())
          .map(([key, entries]) => {
            const deduped = new Map<string, FutureDoc>();
            for (const entry of entries) {
              const dedupKey = normalizeFutureDedupKey(entry);
              const existing = deduped.get(dedupKey);
              if (!existing) {
                deduped.set(dedupKey, entry);
                continue;
              }
              deduped.set(dedupKey, pickPreferredFutureDoc(existing, entry));
            }

            return {
              key,
              label: FUTURE_FOLDER_LABELS[key] ?? key,
              short: folderShortByName.get(key) ?? '想妳的時候',
              docs: Array.from(deduped.values()).sort((a, b) => {
                const aTime = a.writtenAt ?? Number.MAX_SAFE_INTEGER;
                const bTime = b.writtenAt ?? Number.MAX_SAFE_INTEGER;
                if (aTime !== bTime) return aTime - bTime;
                return a.title.localeCompare(b.title, 'zh-TW');
              }),
            };
          })
          .sort((a, b) => {
            const aOrder = folderOrder.get(a.key) ?? Number.MAX_SAFE_INTEGER;
            const bOrder = folderOrder.get(b.key) ?? Number.MAX_SAFE_INTEGER;
            if (aOrder !== bOrder) return aOrder - bOrder;
            return a.key.localeCompare(b.key, 'zh-TW');
          });

        if (!active) return;
        setFutureFolders(folders);
        if (!folders.length) {
          setFutureFolderKey(null);
          setFutureDocId(null);
          setFutureLoadError('目前找不到未來生日資料夾內容');
          return;
        }
        setFutureFolderKey(folders[0]?.key ?? null);
        setFutureDocId(folders[0]?.docs[0]?.id ?? null);
      } catch (error) {
        if (!active) return;
        setFutureLoadError(error instanceof Error ? error.message : '未知錯誤');
      } finally {
        if (active) setFutureLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!currentYear) return;
    const exists = currentYear.entries.some((entry) => entry.id === selectedEntryId);
    if (!exists) {
      setSelectedEntryId(currentYear.entries[0]?.id ?? null);
    }
  }, [currentYear, selectedEntryId]);

  useEffect(() => {
    if (!years.length || !currentEntry) return;
    const toLoad = currentYear ? currentYear.entries : [];
    for (const entry of toLoad) {
      if (contentById[entry.id] !== undefined) continue;
      void (async () => {
        try {
          const res = await fetch(`${BASE}data/letters-ab/${entry.contentPath}`, { cache: 'no-store' });
          if (!res.ok) return;
          const text = normalizeContent(await res.text());
          setContentById((prev) => (prev[entry.id] === undefined ? { ...prev, [entry.id]: text } : prev));
        } catch {
          // ignore per-file read failures
        }
      })();
    }
  }, [years, currentYear, currentEntry, contentById]);

  useEffect(() => {
    if (!currentFutureFolder) return;
    const exists = currentFutureFolder.docs.some((entry) => entry.id === futureDocId);
    if (!exists) {
      setFutureDocId(currentFutureFolder.docs[0]?.id ?? null);
    }
  }, [currentFutureFolder, futureDocId]);

  useEffect(() => {
    const toLoad = currentFutureFolder ? currentFutureFolder.docs : [];
    for (const entry of toLoad) {
      if (futureContentById[entry.id] !== undefined) continue;
      void (async () => {
        try {
          const res = await fetch(`${BASE}data/master-pool/${entry.contentPath}`, { cache: 'no-store' });
          if (!res.ok) return;
          const text = normalizeContent(await res.text());
          setFutureContentById((prev) => (prev[entry.id] === undefined ? { ...prev, [entry.id]: text } : prev));
        } catch {
          // ignore per-file read failures
        }
      })();
    }
  }, [currentFutureFolder, futureContentById]);

  useEffect(() => {
    if (!years.length || !initialYear || appliedInitialYearRef.current === initialYear) return;
    const targetIndex = findYearIndex(years, initialYear);
    if (targetIndex < 0) return;
    const year = years[targetIndex]!;
    const preferred = year.entries.find((entry) => entry.series === 'birthday') ?? year.entries[0] ?? null;
    setSelectedYearIndex(targetIndex);
    setSelectedEntryId(preferred?.id ?? null);
    setViewMode('reading');
    appliedInitialYearRef.current = initialYear;
  }, [initialYear, years]);

  function openYear(index: number) {
    const next = years[index];
    if (!next) return;
    setSelectedYearIndex(index);
    setSelectedEntryId(next.entries[0]?.id ?? null);
  }

  function openYearEntry(index: number, entryId: string) {
    openYear(index);
    setSelectedEntryId(entryId);
    setViewMode('reading');
  }

  function moveYear(delta: number) {
    if (!years.length) return;
    const nextIndex = selectedYearIndex + delta;
    if (nextIndex < 0 || nextIndex >= years.length) return;
    openYear(nextIndex);
  }

  function moveReadingEntry(delta: number) {
    if (!currentYear || !currentYear.entries.length || !currentEntry) return;
    const currentIndex = currentYear.entries.findIndex((entry) => entry.id === currentEntry.id);
    if (currentIndex < 0) return;
    const nextIndex = currentIndex + delta;
    if (nextIndex < 0 || nextIndex >= currentYear.entries.length) return;
    setSelectedEntryId(currentYear.entries[nextIndex]?.id ?? null);
  }

  function openFutureList() {
    setViewMode('future-list');
    if (!currentFutureFolder && futureFolders.length) {
      setFutureFolderKey(futureFolders[0]?.key ?? null);
      setFutureDocId(futureFolders[0]?.docs[0]?.id ?? null);
    }
  }

  function openFutureFolder(folderKey: string) {
    const target = futureFolders.find((folder) => folder.key === folderKey);
    if (!target) return;
    setFutureFolderKey(target.key);
    setFutureDocId(target.docs[0]?.id ?? null);
  }

  function openFutureDoc(folderKey: string, docId: string) {
    setFutureFolderKey(folderKey);
    setFutureDocId(docId);
    setViewMode('future-reading');
  }

  function moveFutureReadingEntry(delta: number) {
    if (!currentFutureFolder || !currentFutureDoc) return;
    const currentIndex = currentFutureFolder.docs.findIndex((entry) => entry.id === currentFutureDoc.id);
    if (currentIndex < 0) return;
    const nextIndex = currentIndex + delta;
    if (nextIndex < 0 || nextIndex >= currentFutureFolder.docs.length) return;
    setFutureDocId(currentFutureFolder.docs[nextIndex]?.id ?? null);
  }

  function openNeighborFutureFolderFirstDoc(direction: -1 | 1) {
    if (!currentFutureFolder || !futureFolders.length) return;
    const currentIndex = futureFolders.findIndex((folder) => folder.key === currentFutureFolder.key);
    if (currentIndex < 0) return;
    const next = futureFolders[currentIndex + direction];
    if (!next || !next.docs.length) return;
    setFutureFolderKey(next.key);
    setFutureDocId(next.docs[0]?.id ?? null);
    setViewMode('future-reading');
  }

  function handleHorizontalSwipe(
    startRef: { current: { x: number; y: number } | null },
    clientX: number,
    clientY: number,
    onLeft: () => void,
    onRight: () => void,
  ) {
    const start = startRef.current;
    startRef.current = null;
    if (!start) return;
    const dx = clientX - start.x;
    const dy = clientY - start.y;
    if (Math.abs(dx) < 54 || Math.abs(dx) <= Math.abs(dy) * 1.15) return;
    if (dx < 0) {
      onLeft();
    } else {
      onRight();
    }
  }

  const relatedItems = useMemo<RelatedItem[]>(() => {
    if (!currentYear || !currentEntry) return [];
    const items: RelatedItem[] = [];
    const series = currentEntry.series;
    const sameSeriesCurrent = currentYear.entries.filter((entry) => entry.series === series);
    const rank = Math.max(
      0,
      sameSeriesCurrent.findIndex((entry) => entry.id === currentEntry.id),
    );

    for (const sibling of sameSeriesCurrent) {
      if (sibling.id === currentEntry.id) continue;
      items.push({
        id: sibling.id,
        title: sibling.title,
        subtitle: `同年 · ${seriesLabel(series)}`,
        action: () => {
          setSelectedEntryId(sibling.id);
          setShowSettings(false);
        },
      });
    }

    for (let i = selectedYearIndex - 1; i >= 0; i -= 1) {
      const target = years[i];
      if (!target) continue;
      const picked = pickSeriesNeighborByRank(target, series, rank);
      if (!picked) continue;
      items.push({
        id: picked.id,
        title: picked.title,
        subtitle: `上一年 · ${seriesLabel(series)}`,
        action: () => {
          openYearEntry(i, picked.id);
          setShowSettings(false);
        },
      });
      break;
    }

    for (let i = selectedYearIndex + 1; i < years.length; i += 1) {
      const target = years[i];
      if (!target) continue;
      const picked = pickSeriesNeighborByRank(target, series, rank);
      if (!picked) continue;
      items.push({
        id: picked.id,
        title: picked.title,
        subtitle: `下一年 · ${seriesLabel(series)}`,
        action: () => {
          openYearEntry(i, picked.id);
          setShowSettings(false);
        },
      });
      break;
    }

    if (onOpenBirthdayYear) {
      items.push({
        id: `birthday-${currentYear.year}`,
        title: `生日任務｜${currentYear.year}`,
        subtitle: '切到每日任務 · 同年份',
        action: () => {
          onOpenBirthdayYear(String(currentYear.year));
          setShowSettings(false);
        },
      });
    }

    return items;
  }, [currentYear, currentEntry, years, selectedYearIndex, onOpenBirthdayYear]);

  const prevFutureFolder = useMemo(() => {
    if (!currentFutureFolder) return null;
    const index = futureFolders.findIndex((folder) => folder.key === currentFutureFolder.key);
    if (index <= 0) return null;
    return futureFolders[index - 1] ?? null;
  }, [currentFutureFolder, futureFolders]);

  const nextFutureFolder = useMemo(() => {
    if (!currentFutureFolder) return null;
    const index = futureFolders.findIndex((folder) => folder.key === currentFutureFolder.key);
    if (index < 0 || index >= futureFolders.length - 1) return null;
    return futureFolders[index + 1] ?? null;
  }, [currentFutureFolder, futureFolders]);

  if (loading) {
    return <div className="la-loading">讀取年度信件中...</div>;
  }

  if (loadError) {
    return (
      <div className="la-loading">
        <p>讀取失敗：{loadError}</p>
      </div>
    );
  }

  if (!years.length || !currentYear) {
    return <div className="la-loading">目前沒有年度信件資料</div>;
  }

  const seriesCountLabels = buildSeriesCountLabels(currentYear.entries);

  return (
    <div className={`letters-ab-page ${prefs.theme === 'a' ? 'theme-a' : 'theme-d'}`}>
      {viewMode === 'home' ? (
        <>
          <header className="la-top-bar">
            <div className="la-left">
              <button type="button" className="la-circle-btn" onClick={onExit} aria-label="返回">
                ‹
              </button>
              <span className="la-title">年度信件</span>
            </div>
            <button type="button" className="la-ghost-btn" onClick={() => setShowSettings(true)} aria-label="開啟設定">
              ⋯
            </button>
          </header>

          <section className="la-timeline">
            <div className="la-year-strip">
              {years.map((year, index) => (
                <button
                  type="button"
                  key={year.year}
                  className={`la-year-dot ${index === selectedYearIndex ? 'active' : ''}`}
                  onClick={() => openYear(index)}
                >
                  <span className="dot" />
                  <span className="label">{year.year}</span>
                </button>
              ))}
            </div>
          </section>

          <button
            type="button"
            className="la-future-entry la-future-entry-home"
            onClick={openFutureList}
            aria-label={`開啟${FUTURE_VIEW_TITLE}`}
          >
            <span className="la-future-entry-mark">?</span>
          </button>

          <section
            className="la-carousel"
            onTouchStart={(event) => {
              const touch = event.touches[0];
              if (!touch) return;
              homeSwipeStartRef.current = { x: touch.clientX, y: touch.clientY };
            }}
            onTouchEnd={(event) => {
              const touch = event.changedTouches[0];
              if (!touch) return;
              handleHorizontalSwipe(homeSwipeStartRef, touch.clientX, touch.clientY, () => moveYear(1), () => moveYear(-1));
            }}
            onTouchCancel={() => {
              homeSwipeStartRef.current = null;
            }}
          >
            <button
              type="button"
              className="la-arrow left"
              onClick={() => moveYear(-1)}
              disabled={selectedYearIndex <= 0}
              aria-label="上一年"
            >
              ‹
            </button>
            <button
              type="button"
              className="la-year-card"
              onClick={() => setViewMode('reading')}
              aria-label={`開啟 ${currentYear.year} 年信件`}
            >
              <span className="la-year-number">{currentYear.year}</span>
              <span className="la-year-count">{currentYear.entries.length} 封信</span>
              <span className="la-year-divider" />
              <span className="la-doc-tags">
                {seriesCountLabels.map((label) => (
                  <span key={label} className="la-doc-tag">
                    {label}
                  </span>
                ))}
              </span>
            </button>
            <button
              type="button"
              className="la-arrow right"
              onClick={() => moveYear(1)}
              disabled={selectedYearIndex >= years.length - 1}
              aria-label="下一年"
            >
              ›
            </button>
          </section>
        </>
      ) : viewMode === 'reading' ? (
        <>
          <header className="la-top-bar">
            <div className="la-left">
              <button type="button" className="la-circle-btn" onClick={() => setViewMode('home')} aria-label="返回入口">
                ‹
              </button>
              <span className="la-title">{currentYear.year} 年度信件</span>
            </div>
            <button type="button" className="la-ghost-btn" onClick={() => setShowSettings(true)} aria-label="開啟設定">
              ⋯
            </button>
          </header>

          <div className="la-read-tabs">
            {entryTabs.map((tab) => (
              <button
                type="button"
                key={tab.entry.id}
                className={`la-tab ${tab.entry.id === currentEntry?.id ? 'active' : ''}`}
                onClick={() => setSelectedEntryId(tab.entry.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <section
            className="la-paper-wrap"
            onTouchStart={(event) => {
              const touch = event.touches[0];
              if (!touch) return;
              readingSwipeStartRef.current = { x: touch.clientX, y: touch.clientY };
            }}
            onTouchEnd={(event) => {
              const touch = event.changedTouches[0];
              if (!touch) return;
              handleHorizontalSwipe(readingSwipeStartRef, touch.clientX, touch.clientY, () => moveReadingEntry(1), () => moveReadingEntry(-1));
            }}
            onTouchCancel={() => {
              readingSwipeStartRef.current = null;
            }}
          >
            <div className="la-paper" style={{ lineHeight: lineHeightValue, fontFamily: readingFontFamily }}>
              <h3 className="la-paper-title">{currentEntry?.title ?? '未命名信件'}</h3>
              <p className="la-paper-content" style={{ fontSize: `${prefs.readingFontSize}px` }}>
                {currentContent || '讀取內容中...'}
              </p>
            </div>
          </section>
        </>
      ) : viewMode === 'future-list' ? (
        <>
          <header className="la-top-bar">
            <div className="la-left">
              <button type="button" className="la-circle-btn" onClick={() => setViewMode('home')} aria-label="返回年度入口">
                ‹
              </button>
              <span className="la-title">{FUTURE_VIEW_TITLE}</span>
            </div>
            <button type="button" className="la-ghost-btn" onClick={() => setShowSettings(true)} aria-label="開啟設定">
              ⋯
            </button>
          </header>

          {futureLoading ? <div className="la-loading">讀取清單中...</div> : null}
          {!futureLoading && futureLoadError ? <div className="la-loading">讀取失敗：{futureLoadError}</div> : null}
          {!futureLoading && !futureLoadError ? (
            <>
              <div className="la-future-strip">
                {futureFolders.map((folder) => (
                  <button
                    type="button"
                    key={folder.key}
                    className={`la-future-folder-pill ${folder.key === currentFutureFolder?.key ? 'active' : ''}`}
                    onClick={() => openFutureFolder(folder.key)}
                  >
                    <span className="la-future-folder-name">{folder.label}</span>
                    <span className="la-future-folder-short">{folder.short}</span>
                  </button>
                ))}
              </div>

              <section className="la-future-list">
                <div className="la-future-meta">{currentFutureFolder ? `${currentFutureFolder.docs.length} 份` : '0 份'}</div>
                {currentFutureFolder?.docs.map((doc) => (
                  <button
                    key={doc.id}
                    type="button"
                    className="la-future-item"
                    onClick={() => openFutureDoc(currentFutureFolder.key, doc.id)}
                  >
                    <div className="la-future-item-main">
                      <div className="la-future-item-title">{doc.title}</div>
                      <div className="la-future-item-sub">{formatFutureDocDate(doc.writtenAt)}</div>
                    </div>
                    <span className="la-future-item-arrow">›</span>
                  </button>
                ))}
                {!currentFutureFolder?.docs.length ? <div className="la-loading">此資料夾目前沒有內容</div> : null}
              </section>
            </>
          ) : null}
        </>
      ) : (
        <>
          <header className="la-top-bar la-future-reading-bar">
            <div className="la-left">
              <button type="button" className="la-circle-btn" onClick={() => setViewMode('future-list')} aria-label="返回清單">
                ‹
              </button>
              <span className="la-title">{FUTURE_VIEW_TITLE}</span>
            </div>
            <div className="la-future-tools">
              <button
                type="button"
                className={`la-mini-arrow ${prevFutureFolder ? '' : 'disabled'}`}
                onClick={() => openNeighborFutureFolderFirstDoc(-1)}
                disabled={!prevFutureFolder}
                aria-label="上一資料夾第一封"
              >
                ‹
              </button>
              <button
                type="button"
                className={`la-mini-arrow ${nextFutureFolder ? '' : 'disabled'}`}
                onClick={() => openNeighborFutureFolderFirstDoc(1)}
                disabled={!nextFutureFolder}
                aria-label="下一資料夾第一封"
              >
                ›
              </button>
              <button type="button" className="la-ghost-btn" onClick={() => setShowSettings(true)} aria-label="開啟設定">
                ⋯
              </button>
            </div>
          </header>

          <div className="la-future-reading-meta">
            {currentFutureFolder ? `${currentFutureFolder.label} · ${currentFutureFolder.short}` : FUTURE_VIEW_TITLE}
          </div>

          <div className="la-future-inline-nav">
            <button
              type="button"
              className={`la-inline-btn ${currentFutureDocIndex <= 0 ? 'disabled' : ''}`}
              onClick={() => moveFutureReadingEntry(-1)}
              disabled={currentFutureDocIndex <= 0}
            >
              ‹ 上一封
            </button>
            <span className="la-inline-status">
              {currentFutureFolder
                ? `${currentFutureDocIndex >= 0 ? currentFutureDocIndex + 1 : 0} / ${currentFutureFolder.docs.length}`
                : '0 / 0'}
            </span>
            <button
              type="button"
              className={`la-inline-btn ${
                !currentFutureFolder || currentFutureDocIndex >= currentFutureFolder.docs.length - 1 ? 'disabled' : ''
              }`}
              onClick={() => moveFutureReadingEntry(1)}
              disabled={!currentFutureFolder || currentFutureDocIndex >= currentFutureFolder.docs.length - 1}
            >
              下一封 ›
            </button>
          </div>

          <section
            className="la-paper-wrap"
            onTouchStart={(event) => {
              const touch = event.touches[0];
              if (!touch) return;
              futureSwipeStartRef.current = { x: touch.clientX, y: touch.clientY };
            }}
            onTouchEnd={(event) => {
              const touch = event.changedTouches[0];
              if (!touch) return;
              handleHorizontalSwipe(futureSwipeStartRef, touch.clientX, touch.clientY, () => moveFutureReadingEntry(1), () => moveFutureReadingEntry(-1));
            }}
            onTouchCancel={() => {
              futureSwipeStartRef.current = null;
            }}
          >
            <div className="la-paper" style={{ lineHeight: lineHeightValue, fontFamily: readingFontFamily }}>
              <h3 className="la-paper-title">{currentFutureDoc?.title ?? '未命名信件'}</h3>
              <p className="la-paper-subtitle">
                {currentFutureDoc ? `${formatFutureDocDate(currentFutureDoc.writtenAt)} · ${currentFutureDoc.sourceFile}` : '讀取中'}
              </p>
              <p className="la-paper-content" style={{ fontSize: `${prefs.readingFontSize}px` }}>
                {currentFutureContent || '讀取內容中...'}
              </p>
            </div>
          </section>
        </>
      )}

      {prefs.showChibi ? (
        <div className="la-chibi-wrap">
          <button type="button" className="la-chibi-btn" onClick={() => setShowSettings(true)} aria-label="開啟閱讀設定">
            <img
              src={chibiSrc}
              alt=""
              draggable={false}
              className="calendar-chibi select-none"
              style={{ width: prefs.chibiWidth, height: 'auto' }}
            />
          </button>
        </div>
      ) : null}

      {showSettings ? (
        <div className="la-settings-overlay" onClick={() => setShowSettings(false)}>
          <div className="la-settings-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="la-sheet-handle" />

            <SettingsAccordion
              title="主題"
              isOpen={settingsPanels.theme}
              onToggle={() => setSettingsPanels((prev) => ({ ...prev, theme: !prev.theme }))}
              className="la-sheet-section"
              titleClassName="la-sheet-label"
              chevronClassName="text-[#9a7d5a]"
              bodyClassName="mt-2"
            >
              <div className="la-pill-group">
                {THEME_OPTIONS.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    className={`la-pill ${prefs.theme === option.key ? 'active' : ''}`}
                    onClick={() => setPrefs((prev) => ({ ...prev, theme: option.key }))}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </SettingsAccordion>

            <SettingsAccordion
              title="排版"
              subtitle="行距與字級"
              isOpen={settingsPanels.typography}
              onToggle={() => setSettingsPanels((prev) => ({ ...prev, typography: !prev.typography }))}
              className="la-sheet-section"
              titleClassName="la-sheet-label"
              subtitleClassName="text-[11px] text-[#9a7d5a]"
              chevronClassName="text-[#9a7d5a]"
              bodyClassName="mt-2"
            >
              <div className="la-pill-group">
                {LINE_HEIGHT_LABELS.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    className={`la-pill ${prefs.lineHeight === option.key ? 'active' : ''}`}
                    onClick={() => setPrefs((prev) => ({ ...prev, lineHeight: option.key }))}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <label className="la-range-row">
                <span>內文字級：{prefs.readingFontSize.toFixed(1)}px</span>
                <input
                  type="range"
                  min={11}
                  max={20}
                  step={0.5}
                  value={prefs.readingFontSize}
                  onChange={(event) =>
                    setPrefs((prev) => ({
                      ...prev,
                      readingFontSize: clampReadingFontSize(Number(event.target.value), prev.readingFontSize),
                    }))
                  }
                />
              </label>
            </SettingsAccordion>

            <SettingsAccordion
              title="字體"
              isOpen={settingsPanels.font}
              onToggle={() => setSettingsPanels((prev) => ({ ...prev, font: !prev.font }))}
              className="la-sheet-section"
              titleClassName="la-sheet-label"
              chevronClassName="text-[#9a7d5a]"
              bodyClassName="mt-2"
            >
              <div className="la-pill-group">
                {READING_FONT_OPTIONS.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    className={`la-pill ${prefs.readingFont === option.key ? 'active' : ''}`}
                    onClick={() => setPrefs((prev) => ({ ...prev, readingFont: option.key }))}
                    disabled={option.key === 'letter' && !letterFontFamily}
                    title={option.key === 'letter' && !letterFontFamily ? '尚未設定情書字體' : undefined}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </SettingsAccordion>

            <SettingsAccordion
              title="M"
              subtitle="顯示與大小"
              isOpen={settingsPanels.chibi}
              onToggle={() => setSettingsPanels((prev) => ({ ...prev, chibi: !prev.chibi }))}
              className="la-sheet-section"
              titleClassName="la-sheet-label"
              subtitleClassName="text-[11px] text-[#9a7d5a]"
              chevronClassName="text-[#9a7d5a]"
              bodyClassName="mt-2"
            >
              <div className="la-toggle-row">
                <span>M</span>
                <button
                  type="button"
                  className={`la-switch ${prefs.showChibi ? 'on' : ''}`}
                  onClick={() => setPrefs((prev) => ({ ...prev, showChibi: !prev.showChibi }))}
                  aria-label="切換M顯示"
                >
                  <span />
                </button>
              </div>
              <label className="la-range-row">
                <input
                  type="range"
                  min={96}
                  max={186}
                  step={1}
                  value={prefs.chibiWidth}
                  onChange={(event) =>
                    setPrefs((prev) => ({ ...prev, chibiWidth: clampChibiWidth(Number(event.target.value), prev.chibiWidth) }))
                  }
                />
              </label>
            </SettingsAccordion>

            <SettingsAccordion
              title="相關閱讀"
              subtitle="同系列前後年份"
              isOpen={settingsPanels.related}
              onToggle={() => setSettingsPanels((prev) => ({ ...prev, related: !prev.related }))}
              className="la-sheet-section"
              titleClassName="la-sheet-label"
              subtitleClassName="text-[11px] text-[#9a7d5a]"
              chevronClassName="text-[#9a7d5a]"
              bodyClassName="mt-2"
            >
              <div className="la-related-list">
                {!relatedItems.length ? (
                  <p className="la-empty-related">目前沒有可跳轉的項目</p>
                ) : (
                  relatedItems.map((item) => (
                    <button key={item.id} type="button" className="la-related-item" onClick={item.action}>
                      <span className="la-related-text">
                        <strong>{item.title}</strong>
                        <small>{item.subtitle}</small>
                      </span>
                      <span className="la-related-arrow">›</span>
                    </button>
                  ))
                )}
              </div>
            </SettingsAccordion>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default LettersABPage;
