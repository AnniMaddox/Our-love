import { useEffect, useMemo, useRef, useState } from 'react';

import { SettingsAccordion } from '../components/SettingsAccordion';
import { getScopedMixedChibiSources } from '../lib/chibiPool';
import type { StoredMDiary } from '../lib/mDiaryDB';
import type { AppSettings } from '../types/settings';

const FAVORITES_STORAGE_KEY = 'memorial-m-diary-favorites-v1';
const DAY_MS = 24 * 60 * 60 * 1000;

const COVER_MODULES = import.meta.glob(
  '../../public/diary-covers/*.{jpg,jpeg,png,webp,avif}',
  { eager: true, import: 'default' },
) as Record<string, string>;
const COVER_SRCS = Object.values(COVER_MODULES);

const WEEKDAY_ZH = ['日', '一', '二', '三', '四', '五', '六'] as const;
const WEEKDAY_EN = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const;
const MONTH_EN = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const;

type TabId = 'random' | 'timeline' | 'reading';
type TimelineFilter = 'all' | 'favorites' | 'unknown';
type SortDirection = 'desc' | 'asc';
const TAB_ORDER: TabId[] = ['random', 'timeline', 'reading'];

type ParsedEntry = {
  name: string;
  title: string;
  text: string;
  htmlContent: string;
  snippet: string;
  parsedDate: Date | null;
  dayKey: string | null;
  importedAt: number;
  source: StoredMDiary;
};
type KnownParsedEntry = ParsedEntry & { parsedDate: Date; dayKey: string };

type MDiaryPageProps = {
  entries: StoredMDiary[];
  onExit: () => void;
  diaryCoverImageUrl?: string;
  diaryCoverFitMode?: 'cover' | 'contain';
  diaryFontFamily?: string;
  mDiaryLineHeight?: number;
  mDiaryContentFontSize?: number;
  mDiaryShowCount?: boolean;
  mDiaryRandomChibiWidth?: number;
  mDiaryReadingChibiWidth?: number;
  mDiaryShowReadingChibi?: boolean;
  onSettingChange?: (partial: Partial<AppSettings>) => void;
};

function pickRandom<T>(items: T[]): T | null {
  if (!items.length) return null;
  return items[Math.floor(Math.random() * items.length)]!;
}

function clampLineHeight(value: number | undefined) {
  if (!Number.isFinite(value)) return 2.16;
  return Math.max(1.5, Math.min(2.8, value ?? 2.16));
}

function clampContentFontSize(value: number | undefined) {
  if (!Number.isFinite(value)) return 14;
  return Math.max(12, Math.min(22, Number(value)));
}

function clampChibiWidth(value: number | undefined, fallback = 144) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(104, Math.min(196, Math.round(value ?? fallback)));
}

function normalizeText(text: string) {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '')
    .replace(/[\t\f\v]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractHtmlPlainText(html: string) {
  if (!html.trim()) return '';
  if (typeof document === 'undefined') {
    return normalizeText(
      html
        .replace(/<br\s*\/?\s*>/gi, '\n')
        .replace(/<\/p\s*>/gi, '\n')
        .replace(/<\/div\s*>/gi, '\n')
        .replace(/<[^>]+>/g, ' '),
    );
  }

  const root = document.createElement('div');
  root.innerHTML = html;
  root.querySelectorAll('br').forEach((node) => {
    node.replaceWith(document.createTextNode('\n'));
  });

  const blockSelectors = 'p,div,section,article,li,h1,h2,h3,h4,h5,h6';
  root.querySelectorAll(blockSelectors).forEach((node) => {
    if (node.textContent?.trim()) {
      node.appendChild(document.createTextNode('\n'));
    }
  });

  return normalizeText(root.textContent ?? '');
}

function splitMeaningfulLines(text: string) {
  return text
    .split(/\n+/)
    .map((line) => line.replace(/[\u200b\u200c\u200d]/g, '').trim())
    .filter((line) => line.length > 0);
}

function toBaseTitle(name: string) {
  return name.replace(/\.(txt|docx?)$/i, '').trim();
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

function parseDateFromText(source: string): Date | null {
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

function pickDateFromCandidates(candidates: string[]) {
  for (const candidate of candidates) {
    const parsed = parseDateFromText(candidate);
    if (parsed) return parsed;
  }
  return null;
}

function collectDateCandidates(params: { entryName: string; baseTitle: string; entryTitle: string; lines: string[] }) {
  const { entryName, baseTitle, entryTitle, lines } = params;
  const topLines = lines.slice(0, 2);
  const tailLines = lines.slice(-2);
  const ordered = [entryName, baseTitle, entryTitle, ...topLines, ...tailLines];
  const dedup = new Set<string>();
  const result: string[] = [];
  for (const value of ordered) {
    const normalized = value.trim();
    if (!normalized || dedup.has(normalized)) continue;
    dedup.add(normalized);
    result.push(normalized);
  }
  return result;
}

function looksLikeDateLine(line: string) {
  if (!parseDateFromText(line)) return false;
  const stripped = line.replace(/[\s\d年月日\/.\-_:：()（）星期禮拜一二三四五六日天]/g, '');
  return stripped.length <= 2;
}

function buildDisplayTitle(baseTitle: string, lines: string[]) {
  const firstNonDate = lines.find((line) => !looksLikeDateLine(line));
  if (firstNonDate && firstNonDate.length <= 42) {
    return firstNonDate;
  }

  const trimmedBase = baseTitle
    .replace(/(?:19\d{2}|20\d{2})[\s_.\/-]*年?[\s_.\/-]*(?:1[0-2]|0?[1-9])[\s_.\/-]*月?[\s_.\/-]*(?:3[01]|[12]\d|0?[1-9])\s*日?/g, '')
    .replace(/[._\-]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (trimmedBase) return trimmedBase;
  return baseTitle || '未命名日記';
}

function buildSnippet(lines: string[], title: string, fallbackText: string) {
  const filtered = lines.filter((line) => line !== title && !looksLikeDateLine(line));
  const joined = (filtered.length ? filtered.join(' ') : fallbackText).replace(/\s+/g, ' ').trim();
  if (!joined) return '（沒有內容）';
  return joined.length > 56 ? `${joined.slice(0, 56)}...` : joined;
}

function formatTimelineDate(entry: ParsedEntry, sameDayOrder: number) {
  if (!entry.parsedDate) {
    return '??';
  }
  const month = entry.parsedDate.getMonth() + 1;
  const day = entry.parsedDate.getDate();
  const weekday = WEEKDAY_ZH[entry.parsedDate.getDay()];
  if (sameDayOrder > 1) {
    return `${month}月 ${day}日（${weekday}） · 同日第 ${sameDayOrder} 篇`;
  }
  return `${month}月 ${day}日（${weekday}）`;
}

function formatMonthHeading(entry: ParsedEntry) {
  if (!entry.parsedDate) return '未知時刻';
  return `${entry.parsedDate.getFullYear()}年 ${entry.parsedDate.getMonth() + 1}月`;
}

function formatRangeLabel(knownEntries: ParsedEntry[]) {
  if (!knownEntries.length) return '沒有可解析日期';
  const stamps = knownEntries
    .filter((entry): entry is ParsedEntry & { parsedDate: Date } => entry.parsedDate instanceof Date)
    .map((entry) => entry.parsedDate.getTime());
  if (!stamps.length) return '沒有可解析日期';

  const min = new Date(Math.min(...stamps));
  const max = new Date(Math.max(...stamps));
  const from = `${min.getFullYear()}年${min.getMonth() + 1}月`;
  const to = `${max.getFullYear()}年${max.getMonth() + 1}月`;
  return from === to ? from : `${from}—${to}`;
}

function dayDiffAbs(a: Date, b: Date) {
  const aStamp = new Date(a);
  const bStamp = new Date(b);
  aStamp.setHours(0, 0, 0, 0);
  bStamp.setHours(0, 0, 0, 0);
  return Math.round(Math.abs(aStamp.getTime() - bStamp.getTime()) / DAY_MS);
}

function readFavoriteSet() {
  if (typeof window === 'undefined') return new Set<string>();
  try {
    const raw = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!raw) return new Set<string>();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set<string>();
    return new Set(parsed.filter((item): item is string => typeof item === 'string'));
  } catch {
    return new Set<string>();
  }
}

function persistFavoriteSet(favorites: Set<string>) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(Array.from(favorites)));
}

function pickRandomChibi() {
  const pool = getScopedMixedChibiSources('mdiary');
  return pickRandom(pool) ?? '';
}

export function MDiaryPage({
  entries,
  onExit,
  diaryCoverImageUrl = '',
  diaryCoverFitMode = 'cover',
  diaryFontFamily = '',
  mDiaryLineHeight = 2.16,
  mDiaryContentFontSize = 14,
  mDiaryShowCount = true,
  mDiaryRandomChibiWidth = 144,
  mDiaryReadingChibiWidth = 144,
  mDiaryShowReadingChibi = true,
  onSettingChange,
}: MDiaryPageProps) {
  const [activeTab, setActiveTab] = useState<TabId>('random');
  const [filter, setFilter] = useState<TimelineFilter>('all');
  const [timelineQuery, setTimelineQuery] = useState('');
  const [showTimelineSearch, setShowTimelineSearch] = useState(false);
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsPanels, setSettingsPanels] = useState({
    count: false,
    text: false,
    chibi: false,
  });
  const [favorites, setFavorites] = useState<Set<string>>(() => readFavoriteSet());
  const [chibiSrc] = useState(pickRandomChibi);
  const [randomCoverSrc] = useState(() => pickRandom(COVER_SRCS) ?? '');
  const dateStripRef = useRef<HTMLDivElement | null>(null);
  const timelineSearchInputRef = useRef<HTMLInputElement | null>(null);
  const tabSwipeStartRef = useRef<{ x: number; y: number; ignore: boolean } | null>(null);

  const effectiveFont = diaryFontFamily || "'Ma Shan Zheng', 'STKaiti', serif";
  const lineHeight = clampLineHeight(mDiaryLineHeight);
  const contentFontSize = clampContentFontSize(mDiaryContentFontSize);
  const showCount = Boolean(mDiaryShowCount);
  const randomChibiWidth = clampChibiWidth(mDiaryRandomChibiWidth, 144);
  const readingChibiWidth = clampChibiWidth(mDiaryReadingChibiWidth, 144);
  const showReadingChibi = Boolean(mDiaryShowReadingChibi);

  const parsedEntries = useMemo<ParsedEntry[]>(() => {
    return entries.map((entry) => {
      const baseTitle = toBaseTitle(entry.name) || entry.title?.trim() || '未命名日記';
      const text = normalizeText(entry.content || extractHtmlPlainText(entry.htmlContent || ''));
      const lines = splitMeaningfulLines(text);
      const dateCandidates = collectDateCandidates({
        entryName: entry.name,
        baseTitle,
        entryTitle: entry.title ?? '',
        lines,
      });
      const parsedDate = pickDateFromCandidates(dateCandidates);
      const title = buildDisplayTitle(baseTitle, lines);
      const snippet = buildSnippet(lines, title, text);

      return {
        name: entry.name,
        title,
        text,
        htmlContent: entry.htmlContent,
        parsedDate,
        dayKey: parsedDate ? parsedDate.toISOString().slice(0, 10) : null,
        snippet,
        importedAt: entry.importedAt,
        source: entry,
      } satisfies ParsedEntry;
    });
  }, [entries]);

  const knownEntries = useMemo(
    () => parsedEntries.filter((entry): entry is KnownParsedEntry => Boolean(entry.parsedDate && entry.dayKey)),
    [parsedEntries],
  );
  const unknownEntries = useMemo(() => parsedEntries.filter((entry) => !entry.parsedDate), [parsedEntries]);

  const sortedKnown = useMemo(() => {
    const list = [...knownEntries];
    list.sort((a, b) => {
      const diff = a.parsedDate.getTime() - b.parsedDate.getTime();
      if (diff !== 0) return sortDirection === 'asc' ? diff : -diff;
      const importedDiff = a.importedAt - b.importedAt;
      if (importedDiff !== 0) return sortDirection === 'asc' ? importedDiff : -importedDiff;
      return a.name.localeCompare(b.name, 'zh-TW');
    });
    return list;
  }, [knownEntries, sortDirection]);

  const sortedUnknown = useMemo(() => {
    const list = [...unknownEntries];
    list.sort((a, b) => {
      const importedDiff = a.importedAt - b.importedAt;
      if (importedDiff !== 0) return sortDirection === 'asc' ? importedDiff : -importedDiff;
      return a.name.localeCompare(b.name, 'zh-TW');
    });
    return list;
  }, [unknownEntries, sortDirection]);

  const normalizedTimelineQuery = timelineQuery.trim().toLowerCase();
  const matchesTimelineQuery = (entry: ParsedEntry) => {
    if (!normalizedTimelineQuery) return true;
    const dateText = entry.parsedDate ? entry.parsedDate.toISOString().slice(0, 10) : '未知時刻';
    const haystack = `${entry.title}\n${entry.snippet}\n${entry.text}\n${entry.name}\n${dateText}`.toLowerCase();
    return haystack.includes(normalizedTimelineQuery);
  };

  const allReadingEntries = useMemo(() => [...sortedKnown, ...sortedUnknown], [sortedKnown, sortedUnknown]);

  const timelineKnown = useMemo(() => {
    if (filter === 'unknown') return [] as KnownParsedEntry[];
    const base = filter === 'favorites'
      ? sortedKnown.filter((entry) => favorites.has(entry.name))
      : sortedKnown;
    return base.filter(matchesTimelineQuery);
  }, [filter, sortedKnown, favorites, normalizedTimelineQuery]);

  const timelineUnknown = useMemo(() => {
    const base = filter === 'unknown'
      ? sortedUnknown
      : filter === 'favorites'
        ? sortedUnknown.filter((entry) => favorites.has(entry.name))
        : sortedUnknown;
    return base.filter(matchesTimelineQuery);
  }, [filter, sortedUnknown, favorites, normalizedTimelineQuery]);

  const readingPool = useMemo(() => {
    const combined = [...timelineKnown, ...timelineUnknown];
    if (combined.length) return combined;
    if (filter === 'all' && !normalizedTimelineQuery) return allReadingEntries;
    return [] as ParsedEntry[];
  }, [timelineKnown, timelineUnknown, allReadingEntries, filter, normalizedTimelineQuery]);

  const entryMap = useMemo(() => {
    const map = new Map<string, ParsedEntry>();
    for (const entry of parsedEntries) {
      map.set(entry.name, entry);
    }
    return map;
  }, [parsedEntries]);

  const currentEntry = useMemo(() => {
    if (!readingPool.length) return null;
    if (selectedName) {
      const hit = readingPool.find((entry) => entry.name === selectedName) ?? entryMap.get(selectedName);
      if (hit) return hit;
    }
    return readingPool[0] ?? null;
  }, [readingPool, selectedName, entryMap]);

  const currentIndex = useMemo(() => {
    if (!currentEntry) return -1;
    return readingPool.findIndex((entry) => entry.name === currentEntry.name);
  }, [currentEntry, readingPool]);

  useEffect(() => {
    if (currentEntry && currentEntry.name !== selectedName) {
      setSelectedName(currentEntry.name);
    }
    if (!currentEntry && selectedName) {
      setSelectedName(null);
    }
  }, [currentEntry, selectedName]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const entryName = currentEntry?.name;
    if (!entryName || activeTab !== 'reading') return;

    const node = document.getElementById(`m-diary-chip-${encodeURIComponent(entryName)}`);
    node?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [currentEntry?.name, activeTab]);

  useEffect(() => {
    if (!showTimelineSearch) return;
    timelineSearchInputRef.current?.focus();
  }, [showTimelineSearch]);

  function openRandomEntry() {
    const picked = pickRandom(allReadingEntries);
    if (!picked) return;
    setSelectedName(picked.name);
    setActiveTab('reading');
    setShowSettings(false);
  }

  function openTimelineEntry(entry: ParsedEntry) {
    setSelectedName(entry.name);
    setActiveTab('reading');
    setShowSettings(false);
  }

  function toggleFavorite(entryName: string) {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(entryName)) {
        next.delete(entryName);
      } else {
        next.add(entryName);
      }
      persistFavoriteSet(next);
      return next;
    });
  }

  function shiftEntry(delta: number) {
    if (!readingPool.length) return;
    const baseIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = (baseIndex + delta + readingPool.length) % readingPool.length;
    const next = readingPool[nextIndex];
    if (next) setSelectedName(next.name);
  }

  function shouldIgnoreTabSwipe(target: EventTarget | null) {
    return target instanceof HTMLElement && Boolean(target.closest('[data-mdiary-no-tab-swipe="true"]'));
  }

  function handleTabSwipeStart(clientX: number, clientY: number, target: EventTarget | null) {
    tabSwipeStartRef.current = {
      x: clientX,
      y: clientY,
      ignore: showSettings || shouldIgnoreTabSwipe(target),
    };
  }

  function resetTabSwipe() {
    tabSwipeStartRef.current = null;
  }

  function handleTabSwipeEnd(clientX: number, clientY: number) {
    const start = tabSwipeStartRef.current;
    tabSwipeStartRef.current = null;
    if (!start || start.ignore) return;

    const dx = clientX - start.x;
    const dy = clientY - start.y;
    if (Math.abs(dx) < 54 || Math.abs(dx) <= Math.abs(dy)) return;

    const tabIndex = TAB_ORDER.indexOf(activeTab);
    if (tabIndex === -1) return;

    if (dx < 0 && tabIndex < TAB_ORDER.length - 1) {
      setActiveTab(TAB_ORDER[tabIndex + 1]!);
    } else if (dx > 0 && tabIndex > 0) {
      setActiveTab(TAB_ORDER[tabIndex - 1]!);
    }
  }

  function updateMSettings(
    partial: Partial<
      Pick<
        AppSettings,
        | 'mDiaryLineHeight'
        | 'mDiaryContentFontSize'
        | 'mDiaryShowCount'
        | 'mDiaryRandomChibiWidth'
        | 'mDiaryReadingChibiWidth'
        | 'mDiaryShowReadingChibi'
      >
    >,
  ) {
    onSettingChange?.(partial);
  }

  const timelineTotalCount = timelineKnown.length + timelineUnknown.length;

  const topBar = (
    <header
      className="shrink-0 border-b px-4 pb-2.5 pt-3"
      style={{
        borderColor: 'rgba(80,100,70,0.08)',
        background: '#f6f2ea',
      }}
    >
      <div className="flex items-end justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onExit}
            className="grid h-[30px] w-[30px] place-items-center rounded-full border text-[15px] transition active:scale-95"
            style={{
              background: 'rgba(255,255,255,0.7)',
              borderColor: 'rgba(80,100,70,0.16)',
              color: '#5a7060',
            }}
            aria-label="返回"
          >
            ‹
          </button>
          <span
            className="font-semibold tracking-[0.02em] text-[#2a2818]"
            style={{
              fontSize: 'var(--ui-header-title-size, 17px)',
              fontFamily: "var(--app-font-family, -apple-system, 'Helvetica Neue', system-ui, sans-serif)",
            }}
          >
            M 的日記
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowSettings(true)}
          className="px-1 text-[18px] leading-none"
          style={{ color: 'rgba(80,100,70,0.36)' }}
          aria-label="開啟設定"
        >
          ⋯
        </button>
      </div>
    </header>
  );

  return (
    <div
      className="relative flex h-full flex-col overflow-hidden"
      style={{ background: '#f6f2ea' }}
      onTouchStart={(event) => {
        const touch = event.touches[0];
        if (!touch) return;
        handleTabSwipeStart(touch.clientX, touch.clientY, event.target);
      }}
      onTouchEnd={(event) => {
        const touch = event.changedTouches[0];
        if (!touch) return;
        handleTabSwipeEnd(touch.clientX, touch.clientY);
      }}
      onTouchCancel={resetTabSwipe}
    >
      {topBar}

      <div className="shrink-0 px-4 pt-1">
        <div className="flex">
          {([
            ['random', '隨機'],
            ['timeline', '時間流'],
            ['reading', '閱讀'],
          ] as [TabId, string][]).map(([tab, label]) => {
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  setActiveTab(tab);
                  setShowSettings(false);
                }}
                className="flex-1 border-b text-center transition"
                style={{
                  padding: '9px 0 7px',
                  fontSize: 'var(--ui-tab-label-size, 17px)',
                  lineHeight: 1.2,
                  fontWeight: 500,
                  letterSpacing: '0.04em',
                  color: active ? '#5a7060' : '#9aaa98',
                  borderBottomColor: active ? '#5a7060' : 'rgba(80,100,70,0.09)',
                  borderBottomWidth: 2,
                  fontFamily: "var(--app-font-family, -apple-system, 'Helvetica Neue', system-ui, sans-serif)",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
        <p className="pb-1 pt-0.5 text-center text-[8px] tracking-[0.12em]" style={{ color: 'rgba(90,112,96,0.25)' }}>
          ← 左右切換頁籤 →
        </p>
      </div>

      {activeTab === 'random' && (
        <div
          className="relative flex-1 overflow-hidden"
          style={{
            backgroundImage:
              'repeating-linear-gradient(to bottom, transparent, transparent 31px, rgba(80,100,70,0.038) 31px, rgba(80,100,70,0.038) 32px)',
          }}
        >
          <div
            className="pointer-events-none absolute bottom-0 left-[52px] top-0 w-px"
            style={{ background: 'rgba(90,112,96,0.1)' }}
          />

          <div className="flex h-full flex-col items-center justify-start px-4 pt-7">
            <button
              type="button"
              onClick={openRandomEntry}
              className="group relative mt-1 transition active:scale-[0.98]"
              style={{ filter: 'drop-shadow(0 24px 48px rgba(30,20,10,0.45))' }}
            >
              <div className="relative h-[268px] w-[210px]">
                <div
                  className="absolute bottom-0 left-0 top-0 w-[22px] rounded-l"
                  style={{
                    background: 'linear-gradient(to right, #1e2e24, #2e3d32 60%, #3a4f44)',
                  }}
                />
                <div
                  className="absolute inset-y-0 left-[18px] right-0 overflow-hidden rounded-r-[12px]"
                  style={{
                    background: diaryCoverImageUrl
                      ? 'linear-gradient(145deg, #5b5b5b 0%, #3f3f3f 100%)'
                      : 'linear-gradient(145deg, #5a7060 0%, #4d6355 45%, #3d5045 100%)',
                  }}
                >
                  {diaryCoverImageUrl ? (
                    <>
                      {diaryCoverFitMode === 'cover' ? (
                        <img
                          src={diaryCoverImageUrl}
                          alt=""
                          draggable={false}
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                      ) : (
                        <>
                          <img
                            src={diaryCoverImageUrl}
                            alt=""
                            draggable={false}
                            className="absolute inset-0 h-full w-full object-cover opacity-35 blur-xl"
                          />
                          <img
                            src={diaryCoverImageUrl}
                            alt=""
                            draggable={false}
                            className="absolute inset-0 h-full w-full object-contain p-3"
                          />
                        </>
                      )}
                    </>
                  ) : randomCoverSrc ? (
                    <img src={randomCoverSrc} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover opacity-35" />
                  ) : null}

                  <div
                    className="pointer-events-none absolute inset-[13px]"
                    style={{ border: '1px solid rgba(195,178,130,0.22)' }}
                  />
                  <div className="absolute left-1/2 top-1/2 z-10 w-[120px] -translate-x-1/2 -translate-y-1/2 text-center">
                    <p className="text-[20px] leading-[1.65] tracking-[0.06em] text-[#d7c8a5bf]" style={{ fontFamily: effectiveFont }}>
                      M's
                      <br />
                      私藏日記
                    </p>
                  </div>
                </div>
                <div
                  className="absolute bottom-[6px] right-[-5px] top-[6px] w-[14px] rounded-r-[3px]"
                  style={{
                    background:
                      'repeating-linear-gradient(to right, #e8e0d4 0, #e8e0d4 1px, #f0e8dc 1px, #f0e8dc 3.5px)',
                  }}
                />
                <div
                  className="absolute bottom-[-18px] right-[52px] z-[2] h-[36px] w-[11px]"
                  style={{
                    background: 'linear-gradient(to bottom, #be4040, #982828)',
                    boxShadow: '0 4px 10px rgba(180,40,40,0.35)',
                  }}
                >
                  <div
                    className="absolute bottom-[-9px] left-0 right-0 h-[9px]"
                    style={{
                      background: '#982828',
                      clipPath: 'polygon(0 0, 100% 0, 50% 100%)',
                    }}
                  />
                </div>
              </div>
            </button>

            {showCount && (
              <p className="mt-7 text-[10px] tracking-[0.12em]" style={{ color: 'rgba(90,112,96,0.3)' }}>
                共 {allReadingEntries.length} 篇
              </p>
            )}
          </div>
        </div>
      )}

      {activeTab === 'timeline' && (
        <div className="relative min-h-0 flex-1 overflow-y-auto pb-28" style={{ scrollbarWidth: 'none' }}>
          <div className="absolute bottom-0 left-[38px] top-0 w-[1.5px]" style={{ background: 'rgba(90,112,96,0.13)' }} />

          <div className="sticky top-0 z-10 bg-[#f6f2ea]/95 px-4 pb-1 pt-1 backdrop-blur">
            <div className="flex flex-wrap items-center gap-1.5 pl-10">
              <button
                type="button"
                onClick={() => setFilter('all')}
                className="rounded-full border px-3 py-1 tracking-[0.04em]"
                style={{
                  fontSize: 'var(--ui-filter-pill-size, 10px)',
                  color: filter === 'all' ? '#5a7060' : '#8a9a88',
                  background: filter === 'all' ? 'rgba(90,112,96,0.1)' : 'transparent',
                  borderColor: filter === 'all' ? 'rgba(90,112,96,0.3)' : 'rgba(90,112,96,0.18)',
                }}
              >
                全部
              </button>
              <button
                type="button"
                onClick={() => setFilter('favorites')}
                className="rounded-full border px-3 py-1 tracking-[0.04em]"
                style={{
                  fontSize: 'var(--ui-filter-pill-size, 10px)',
                  color: filter === 'favorites' ? '#5a7060' : '#8a9a88',
                  background: filter === 'favorites' ? 'rgba(90,112,96,0.1)' : 'transparent',
                  borderColor: filter === 'favorites' ? 'rgba(90,112,96,0.3)' : 'rgba(90,112,96,0.18)',
                }}
              >
                收藏
              </button>
              <button
                type="button"
                onClick={() => setFilter('unknown')}
                className="rounded-full border px-3 py-1 tracking-[0.04em]"
                style={{
                  fontSize: 'var(--ui-filter-pill-size, 10px)',
                  color: filter === 'unknown' ? '#5a7060' : '#8a9a88',
                  background: filter === 'unknown' ? 'rgba(90,112,96,0.1)' : 'transparent',
                  borderColor: filter === 'unknown' ? 'rgba(90,112,96,0.3)' : 'rgba(90,112,96,0.18)',
                }}
              >
                未知時刻
              </button>
              <button
                type="button"
                onClick={() => setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
                className="rounded-full border px-3 py-1 tracking-[0.04em]"
                style={{
                  fontSize: 'var(--ui-filter-pill-size, 10px)',
                  color: '#5a7060',
                  background: 'rgba(90,112,96,0.08)',
                  borderColor: 'rgba(90,112,96,0.22)',
                }}
                aria-label="切換排序"
                title={sortDirection === 'desc' ? '新到舊' : '舊到新'}
              >
                {sortDirection === 'desc' ? '↓' : '↑'}
              </button>
              <button
                type="button"
                onClick={() =>
                  setShowTimelineSearch((prev) => {
                    const next = !prev;
                    if (!next) {
                      setTimelineQuery('');
                    }
                    return next;
                  })
                }
                className="rounded-full border px-2.5 py-1 tracking-[0.04em]"
                style={{
                  fontSize: 'var(--ui-filter-pill-size, 10px)',
                  color: showTimelineSearch ? '#5a7060' : '#8a9a88',
                  background: showTimelineSearch ? 'rgba(90,112,96,0.12)' : 'transparent',
                  borderColor: showTimelineSearch ? 'rgba(90,112,96,0.3)' : 'rgba(90,112,96,0.18)',
                }}
                aria-label={showTimelineSearch ? '關閉搜尋' : '開啟搜尋'}
                title={showTimelineSearch ? '關閉搜尋' : '開啟搜尋'}
              >
                ⌕
              </button>
            </div>
            {showTimelineSearch ? (
              <div className="pt-1" style={{ paddingLeft: 52, paddingRight: 16 }}>
                <input
                  ref={timelineSearchInputRef}
                  value={timelineQuery}
                  onChange={(event) => setTimelineQuery(event.target.value)}
                  placeholder="搜尋標題、內容或日期"
                  className="w-full rounded-full border py-1.5 pl-3.5 pr-3 text-[11px] outline-none"
                  style={{
                    color: '#5a7060',
                    background: 'rgba(255,255,255,0.72)',
                    borderColor: 'rgba(90,112,96,0.2)',
                  }}
                  aria-label="搜尋日記"
                />
              </div>
            ) : null}
            {showCount && (
              <p
                className="pt-1 tracking-[0.06em] text-[#9aaa98]"
                style={{ paddingLeft: 56, fontSize: 'var(--ui-hint-text-size, 10px)' }}
              >
                共 {timelineTotalCount} 篇 ·{' '}
                {filter === 'unknown' ? '未知時刻' : formatRangeLabel(timelineKnown)}
              </p>
            )}
          </div>

          {timelineTotalCount === 0 ? (
            <div className="px-6 pt-20 text-center text-sm text-[#8a9a88]">
              {normalizedTimelineQuery ? '找不到符合搜尋的日記' : '這個分類還沒有日記'}
            </div>
          ) : (
            <>
              {timelineKnown.length > 0 &&
                timelineKnown.map((entry, index) => {
                  const prev = timelineKnown[index - 1];
                  const next = timelineKnown[index + 1];
                  const sameDayAsPrev = Boolean(prev && prev.dayKey === entry.dayKey);

                  let sameDayOrder = 1;
                  if (sameDayAsPrev) {
                    let cursor = index - 1;
                    while (cursor >= 0 && timelineKnown[cursor] && timelineKnown[cursor]!.dayKey === entry.dayKey) {
                      sameDayOrder += 1;
                      cursor -= 1;
                    }
                  }

                  const monthChanged = !prev || prev.parsedDate.getMonth() !== entry.parsedDate.getMonth() || prev.parsedDate.getFullYear() !== entry.parsedDate.getFullYear();
                  const gapDays = next ? dayDiffAbs(entry.parsedDate, next.parsedDate) : 0;
                  const isFav = favorites.has(entry.name);

                  return (
                    <div key={entry.name}>
                      {monthChanged && (
                        <div className="relative px-4 pb-2 pt-5 text-[9.5px] font-semibold uppercase tracking-[0.18em] text-[#8a9a88]" style={{ paddingLeft: 56 }}>
                          <span
                            className="absolute left-[34px] top-1/2 h-[9px] w-[9px] -translate-y-1/2 rounded-[2px]"
                            style={{ border: '1.5px solid #8a9a88', background: '#f6f2ea' }}
                          />
                          {formatMonthHeading(entry)}
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => openTimelineEntry(entry)}
                        className="flex w-full cursor-pointer items-start pr-4 text-left transition active:bg-[#5a70600d]"
                      >
                        <div className="flex w-14 shrink-0 flex-col items-center pb-1 pt-4">
                          <span
                            className="block rounded-full"
                            style={
                              sameDayAsPrev
                                ? {
                                    width: 8,
                                    height: 8,
                                    border: '1.5px solid #5a7060',
                                    background: 'transparent',
                                  }
                                : {
                                    width: 10,
                                    height: 10,
                                    background: '#5a7060',
                                    border: '2px solid #f6f2ea',
                                    boxShadow: '0 0 0 1.5px #5a7060',
                                  }
                            }
                          />
                          <span className="mt-1 block min-h-3 w-[1.5px] flex-1" style={{ background: 'rgba(90,112,96,0.17)' }} />
                        </div>
                        <div className="flex-1 border-b py-3.5 pl-2" style={{ borderColor: 'rgba(80,100,70,0.06)' }}>
                          <p className="mb-1 text-[9.5px] tracking-[0.07em] text-[#8a9a88]">
                            {formatTimelineDate(entry, sameDayOrder)}
                            {isFav ? <span className="ml-1 align-middle text-[11px] text-[#8a7050]">♥</span> : null}
                          </p>
                          <p className="mb-1 text-[14px] font-semibold leading-[1.35] text-[#2a2818]" style={{ fontFamily: effectiveFont }}>
                            {entry.title}
                          </p>
                          <p className="text-[12px] leading-[1.7] text-[#7a8870]">{entry.snippet}</p>
                        </div>
                      </button>

                      {gapDays > 0 && (
                        <div className="flex items-center px-4 py-2" style={{ paddingLeft: 56 }}>
                          <span className="h-px flex-1" style={{ background: 'rgba(90,112,96,0.11)' }} />
                          <span className="px-2.5 text-[9px] tracking-[0.1em]" style={{ color: 'rgba(90,112,96,0.4)' }}>
                            ── {gapDays}天後 ──
                          </span>
                          <span className="h-px flex-1" style={{ background: 'rgba(90,112,96,0.11)' }} />
                        </div>
                      )}
                    </div>
                  );
                })}

              {timelineUnknown.length > 0 && (
                <>
                  {filter !== 'unknown' && (
                    <div className="px-4 pb-2 pt-6 text-[9.5px] font-semibold uppercase tracking-[0.18em] text-[#8a9a88]" style={{ paddingLeft: 56 }}>
                      未知時刻
                    </div>
                  )}
                  {timelineUnknown.map((entry) => {
                    const isFav = favorites.has(entry.name);
                    return (
                      <button
                        key={entry.name}
                        type="button"
                        onClick={() => openTimelineEntry(entry)}
                        className="flex w-full cursor-pointer items-start pr-4 text-left transition active:bg-[#5a70600d]"
                      >
                        <div className="flex w-14 shrink-0 flex-col items-center pb-1 pt-4">
                          <span
                            className="block h-[10px] w-[10px] rounded-full"
                            style={{
                              border: '1.5px solid #5a7060',
                              background: 'transparent',
                            }}
                          />
                          <span className="mt-1 block min-h-3 w-[1.5px] flex-1" style={{ background: 'rgba(90,112,96,0.17)' }} />
                        </div>
                        <div className="flex-1 border-b py-3.5 pl-2" style={{ borderColor: 'rgba(80,100,70,0.06)' }}>
                          <p className="mb-1 text-[9.5px] tracking-[0.07em] text-[#8a9a88]">
                            ??
                            {isFav ? <span className="ml-1 align-middle text-[11px] text-[#8a7050]">♥</span> : null}
                          </p>
                          <p className="mb-1 text-[14px] font-semibold leading-[1.35] text-[#2a2818]" style={{ fontFamily: effectiveFont }}>
                            {entry.title}
                          </p>
                          <p className="text-[12px] leading-[1.7] text-[#7a8870]">{entry.snippet}</p>
                        </div>
                      </button>
                    );
                  })}
                </>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'reading' && (
        <div
          className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
          style={{
            backgroundImage:
              'repeating-linear-gradient(to bottom, transparent, transparent 31px, rgba(80,100,70,0.045) 31px, rgba(80,100,70,0.045) 32px)',
            backgroundPositionY: 108,
          }}
        >
          {!currentEntry ? (
            <div className="grid flex-1 place-items-center px-6 text-center text-sm text-[#8a9a88]">
              目前沒有可閱讀的日記，先到設定頁匯入 `txt` 或 `docx`。
            </div>
          ) : (
            <>
              <div className="pointer-events-none absolute bottom-0 left-[52px] top-0 z-[1] w-px" style={{ background: 'rgba(90,112,96,0.11)' }} />
              <div className="pointer-events-none absolute left-[10px] top-[72px] z-[2] text-[8px] tracking-[0.08em]" style={{ color: 'rgba(90,112,96,0.3)', writingMode: 'vertical-rl' }}>
                {currentEntry.parsedDate ? String(currentEntry.parsedDate.getFullYear()) : '??'}
              </div>

              <div className="relative z-[2] shrink-0 border-b px-[18px] pb-3 pt-4" style={{ borderColor: 'rgba(80,100,70,0.08)', paddingLeft: 60 }}>
                <div className="mb-1.5 flex items-center gap-2.5">
                  <div className="text-[26px] font-extrabold leading-none tracking-[-0.04em] text-[#5a7060]">
                    {currentEntry.parsedDate ? currentEntry.parsedDate.getDate() : '??'}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[8.5px] uppercase tracking-[0.14em] text-[#8a9a88]">
                      {currentEntry.parsedDate ? WEEKDAY_EN[currentEntry.parsedDate.getDay()] : 'UNKNOWN'}
                    </span>
                    <span className="text-[9.5px] tracking-[0.1em] text-[#8a9a88]">
                      {currentEntry.parsedDate
                        ? `${MONTH_EN[currentEntry.parsedDate.getMonth()]} ${currentEntry.parsedDate.getFullYear()}`
                        : '??'}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleFavorite(currentEntry.name)}
                    className="ml-auto px-1 text-[17px] leading-none"
                    style={{ color: favorites.has(currentEntry.name) ? '#a04040' : 'rgba(90,112,96,0.28)' }}
                    aria-label="切換收藏"
                  >
                    ♥
                  </button>

                  {showCount && (
                    <div className="rounded-full px-2.5 py-0.5 text-[10.5px]" style={{ background: 'rgba(90,112,96,0.07)', color: '#8a9a88' }}>
                      {currentIndex + 1} / {readingPool.length}
                    </div>
                  )}
                </div>

                <h2 className="text-[17px] leading-[1.35] text-[#2a2818]" style={{ fontFamily: effectiveFont }}>
                  {currentEntry.title}
                </h2>
              </div>

              <div className="relative z-[2] min-h-0 flex-1 overflow-y-auto px-[18px] pb-2 pt-3" style={{ paddingLeft: 60 }}>
                {currentEntry.htmlContent ? (
                  <div
                    className="text-[#3a3828]"
                    style={{
                      fontSize: contentFontSize,
                      lineHeight,
                      fontFamily: effectiveFont,
                      whiteSpace: 'normal',
                    }}
                    dangerouslySetInnerHTML={{ __html: currentEntry.htmlContent }}
                  />
                ) : (
                  <p
                    className="whitespace-pre-wrap text-[#3a3828]"
                    style={{ fontSize: contentFontSize, lineHeight, fontFamily: effectiveFont }}
                  >
                    {currentEntry.text || '（空白內容）'}
                  </p>
                )}
                <div
                  className="pointer-events-none sticky bottom-0 left-0 right-0 h-14"
                  style={{ background: 'linear-gradient(to bottom, transparent, #f6f2ea)' }}
                />
              </div>

              <div className="shrink-0 border-t px-6 pb-2 pt-2" style={{ borderColor: 'rgba(80,100,70,0.07)' }}>
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => shiftEntry(-1)}
                    className="px-1.5 text-[20px]"
                    style={{ color: 'rgba(80,100,70,0.3)' }}
                    aria-label="上一篇"
                  >
                    ←
                  </button>
                  <span className="text-[11px] tracking-[0.1em]" style={{ color: 'rgba(80,100,70,0.4)' }}>
                    {currentEntry.parsedDate
                      ? `${currentEntry.parsedDate.getFullYear()}年 ${currentEntry.parsedDate.getMonth() + 1}月`
                      : '未知時刻'}
                  </span>
                  <button
                    type="button"
                    onClick={() => shiftEntry(1)}
                    className="px-1.5 text-[20px]"
                    style={{ color: 'rgba(80,100,70,0.3)' }}
                    aria-label="下一篇"
                  >
                    →
                  </button>
                </div>
              </div>

              <div
                ref={dateStripRef}
                className="shrink-0 overflow-x-auto border-t px-[18px] pb-4 pt-2"
                data-mdiary-no-tab-swipe="true"
                style={{
                  borderColor: 'rgba(80,100,70,0.05)',
                  scrollbarWidth: 'none',
                }}
              >
                <div className="flex gap-[7px]">
                  {readingPool.map((entry) => {
                    const active = entry.name === currentEntry.name;
                    return (
                      <button
                        key={entry.name}
                        id={`m-diary-chip-${encodeURIComponent(entry.name)}`}
                        type="button"
                        onClick={() => setSelectedName(entry.name)}
                        className="min-w-11 shrink-0 rounded-[10px] px-[7px] py-[5px]"
                        style={{
                          background: active ? 'rgba(90,112,96,0.1)' : 'transparent',
                          border: active ? '1.5px solid rgba(90,112,96,0.22)' : '1.5px solid transparent',
                        }}
                      >
                        <div className="text-[13px] font-semibold leading-none" style={{ color: active ? '#5a7060' : '#3a3828' }}>
                          {entry.parsedDate ? entry.parsedDate.getDate() : '??'}
                        </div>
                        <div className="mt-0.5 text-[7.5px]" style={{ color: '#8a9a88' }}>
                          {entry.parsedDate ? MONTH_EN[entry.parsedDate.getMonth()] : '??'}
                        </div>
                        <div
                          className="mx-auto mt-[3px] h-1 w-1 rounded-full"
                          style={{ background: favorites.has(entry.name) ? '#a04040' : 'rgba(90,112,96,0.45)' }}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {(activeTab === 'random' || (activeTab === 'reading' && showReadingChibi)) && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-end pb-4 pr-5">
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="pointer-events-auto transition active:scale-90"
            aria-label="M日記設定"
          >
            {chibiSrc ? (
              <img
                src={chibiSrc}
                alt=""
                draggable={false}
                className="calendar-chibi select-none drop-shadow-md"
                style={{ width: activeTab === 'reading' ? readingChibiWidth : randomChibiWidth, height: 'auto' }}
              />
            ) : (
              <span
                style={{
                  width: activeTab === 'reading' ? readingChibiWidth : randomChibiWidth,
                  height: Math.round((activeTab === 'reading' ? readingChibiWidth : randomChibiWidth) * 1.17),
                  borderRadius: 20,
                  background: 'rgba(236,244,236,0.88)',
                  border: '1.5px dashed rgba(90,120,90,0.18)',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 52,
                }}
              >
                🌿
              </span>
            )}
          </button>
        </div>
      )}

      {showSettings && (
        <div className="absolute inset-0 z-30 flex items-end bg-black/20" onClick={() => setShowSettings(false)}>
          <div
            className="w-full rounded-t-[26px] bg-[#f6f2ea] pb-10"
            style={{ boxShadow: '0 -10px 48px rgba(40,60,40,0.18)' }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mt-3 h-1 w-[34px] rounded bg-[rgba(80,100,70,0.15)]" />
            <div className="border-b px-6 py-4" style={{ borderColor: 'rgba(80,100,70,0.08)' }}>
              <p className="text-center text-sm font-semibold text-[#5a7060]">M 的日記</p>
            </div>

            <div className="space-y-2 px-6 py-4">
              <SettingsAccordion
                title="顯示總篇數"
                subtitle="首頁 / 時間流 / 閱讀顯示統計"
                isOpen={settingsPanels.count}
                onToggle={() => setSettingsPanels((prev) => ({ ...prev, count: !prev.count }))}
                className="rounded-xl border border-[rgba(80,100,70,0.14)] bg-[rgba(255,255,255,0.75)] px-3 py-2.5"
                titleClassName="text-[14px] text-[#2a2818]"
                subtitleClassName="text-[10.5px] text-[#8a9a88]"
                bodyClassName="mt-2"
              >
                <div className="flex items-center justify-between gap-3 rounded-xl border border-[rgba(80,100,70,0.14)] bg-white/85 px-3 py-2.5">
                  <p className="text-xs text-[#5a7060]">顯示總篇數</p>
                  <button
                    type="button"
                    onClick={() => updateMSettings({ mDiaryShowCount: !showCount })}
                    className="relative h-[22px] w-[40px] rounded-full transition"
                    style={{ background: showCount ? '#5a7060' : 'rgba(120,120,120,0.35)' }}
                    aria-label="切換顯示篇數"
                  >
                    <span
                      className="absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow"
                      style={{ left: showCount ? 20 : 2 }}
                    />
                  </button>
                </div>
              </SettingsAccordion>

              <SettingsAccordion
                title="文字排版"
                subtitle="行距與內文字級"
                isOpen={settingsPanels.text}
                onToggle={() => setSettingsPanels((prev) => ({ ...prev, text: !prev.text }))}
                className="rounded-xl border border-[rgba(80,100,70,0.14)] bg-[rgba(255,255,255,0.75)] px-3 py-2.5"
                titleClassName="text-[14px] text-[#2a2818]"
                subtitleClassName="text-[10.5px] text-[#8a9a88]"
                bodyClassName="mt-2 space-y-3"
              >
                <div>
                  <p className="text-[13px] text-[#2a2818]">行距設定</p>
                  <p className="mt-0.5 text-[10.5px] text-[#8a9a88]">目前：{lineHeight.toFixed(2)} 倍</p>
                  <input
                    type="range"
                    min={1.5}
                    max={2.8}
                    step={0.02}
                    value={lineHeight}
                    onChange={(event) => updateMSettings({ mDiaryLineHeight: Number(event.target.value) })}
                    className="mt-2 w-full accent-[#5a7060]"
                  />
                  <div className="mt-1 flex justify-between text-[10px] text-[#8a9a88]">
                    <span>緊密</span>
                    <span>寬鬆</span>
                  </div>
                </div>

                <div>
                  <p className="text-[13px] text-[#2a2818]">內文字級</p>
                  <p className="mt-0.5 text-[10.5px] text-[#8a9a88]">目前：{contentFontSize.toFixed(1)}px</p>
                  <input
                    type="range"
                    min={12}
                    max={22}
                    step={0.5}
                    value={contentFontSize}
                    onChange={(event) => updateMSettings({ mDiaryContentFontSize: Number(event.target.value) })}
                    className="mt-2 w-full accent-[#5a7060]"
                  />
                  <div className="mt-1 flex justify-between text-[10px] text-[#8a9a88]">
                    <span>小一點</span>
                    <span>大一點</span>
                  </div>
                </div>
              </SettingsAccordion>

              <SettingsAccordion
                title="M"
                subtitle="封面與閱讀頁大小"
                isOpen={settingsPanels.chibi}
                onToggle={() => setSettingsPanels((prev) => ({ ...prev, chibi: !prev.chibi }))}
                className="rounded-xl border border-[rgba(80,100,70,0.14)] bg-[rgba(255,255,255,0.75)] px-3 py-2.5"
                titleClassName="text-[14px] text-[#2a2818]"
                subtitleClassName="text-[10.5px] text-[#8a9a88]"
                bodyClassName="mt-2 space-y-3"
              >
                <div>
                  <p className="text-[13px] text-[#2a2818]">封面M</p>
                  <p className="mt-0.5 text-[10.5px] text-[#8a9a88]">目前：{randomChibiWidth}px</p>
                  <input
                    type="range"
                    min={104}
                    max={196}
                    step={1}
                    value={randomChibiWidth}
                    onChange={(event) => updateMSettings({ mDiaryRandomChibiWidth: Number(event.target.value) })}
                    className="mt-2 w-full accent-[#5a7060]"
                  />
                  <div className="mt-1 flex justify-between text-[10px] text-[#8a9a88]">
                    <span>小一點</span>
                    <span>大一點</span>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[13px] text-[#2a2818]">閱讀頁M</p>
                    <button
                      type="button"
                      onClick={() => updateMSettings({ mDiaryShowReadingChibi: !showReadingChibi })}
                      className="relative h-[22px] w-[40px] rounded-full transition"
                      style={{ background: showReadingChibi ? '#5a7060' : 'rgba(120,120,120,0.35)' }}
                      aria-label="切換閱讀頁M顯示"
                    >
                      <span
                        className="absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow"
                        style={{ left: showReadingChibi ? 20 : 2 }}
                      />
                    </button>
                  </div>
                  <p className="mt-0.5 text-[10.5px] text-[#8a9a88]">目前：{readingChibiWidth}px</p>
                  <input
                    type="range"
                    min={104}
                    max={196}
                    step={1}
                    value={readingChibiWidth}
                    onChange={(event) => updateMSettings({ mDiaryReadingChibiWidth: Number(event.target.value) })}
                    className="mt-2 w-full accent-[#5a7060]"
                  />
                  <div className="mt-1 flex justify-between text-[10px] text-[#8a9a88]">
                    <span>小一點</span>
                    <span>大一點</span>
                  </div>
                </div>
              </SettingsAccordion>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MDiaryPage;
