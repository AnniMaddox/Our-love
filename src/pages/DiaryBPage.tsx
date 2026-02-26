import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';

import { SettingsAccordion } from '../components/SettingsAccordion';
import { emitActionToast } from '../lib/actionToast';
import { clearAllDiaries, deleteDiary, loadDiaries, saveDiaries, type StoredDiary } from '../lib/diaryDB';

type DiaryBPageProps = {
  diaryCoverImageUrl?: string;
  diaryCoverFitMode?: 'cover' | 'contain';
  diaryFontFamily?: string;
  favoritedEntries?: Set<string>;
  onFavorite?: (name: string) => void;
  onExit?: () => void;
};

type DiaryTab = 'reading' | 'calendar' | 'grid';
type DiaryMood = 'love' | 'happy' | 'calm' | 'miss' | 'tired';

type DiaryMeta = {
  mood: DiaryMood;
  favorite: boolean;
};

type DiaryMetaMap = Record<string, DiaryMeta>;
type DiaryChibiPrefs = {
  showChibi: boolean;
  size: number;
};

type DiaryTextPrefs = {
  contentFontSize: number;
};

type CalendarCell = {
  key: string;
  date: Date;
  inMonth: boolean;
  dayKey: string;
  entries: StoredDiary[];
  mood: DiaryMood | null;
  isToday: boolean;
};

type CalendarDayMenuState = {
  left: number;
  top: number;
  dayKey: string;
  entryName: string;
  count: number;
  mood: DiaryMood;
};

const BASE_URL = import.meta.env.BASE_URL as string;
const CHIBI_COUNT = 35;
const DIARY_META_STORAGE_KEY = 'memorial-diary-b-meta-v1';
const DIARY_CHIBI_PREFS_STORAGE_KEY = 'memorial-diary-b-chibi-prefs-v1';
const DIARY_TEXT_PREFS_STORAGE_KEY = 'memorial-diary-b-text-prefs-v1';
const DEFAULT_DIARY_CHIBI_PREFS: DiaryChibiPrefs = {
  showChibi: true,
  size: 144,
};
const DEFAULT_DIARY_TEXT_PREFS: DiaryTextPrefs = {
  contentFontSize: 14,
};
const MOOD_ORDER: DiaryMood[] = ['love', 'happy', 'calm', 'miss', 'tired'];

const MOOD_THEME: Record<DiaryMood, { label: string; icon: string; chipBg: string; dot: string; bar: string }> = {
  love: {
    label: '喜',
    icon: '❤️',
    chipBg: 'rgba(240,170,180,0.5)',
    dot: '#e9a2ad',
    bar: 'rgba(240,170,180,0.8)',
  },
  happy: {
    label: '開心',
    icon: '😊',
    chipBg: 'rgba(240,210,100,0.45)',
    dot: '#d6b85e',
    bar: 'rgba(240,210,100,0.8)',
  },
  calm: {
    label: '平靜',
    icon: '🌿',
    chipBg: 'rgba(150,210,165,0.45)',
    dot: '#93c8a1',
    bar: 'rgba(150,210,165,0.8)',
  },
  miss: {
    label: '想你',
    icon: '🌧',
    chipBg: 'rgba(155,178,230,0.45)',
    dot: '#9cb3df',
    bar: 'rgba(155,178,230,0.8)',
  },
  tired: {
    label: '疲憊',
    icon: '😴',
    chipBg: 'rgba(185,175,215,0.4)',
    dot: '#b8add6',
    bar: 'rgba(185,175,215,0.8)',
  },
};

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function normalizeEntries(entries: StoredDiary[]) {
  return [...entries].sort((a, b) => {
    const tsDiff = a.importedAt - b.importedAt;
    if (tsDiff !== 0) return tsDiff;
    return a.name.localeCompare(b.name, 'zh-TW');
  });
}

function readDiaryMeta() {
  try {
    const raw = window.localStorage.getItem(DIARY_META_STORAGE_KEY);
    if (!raw) return {} as DiaryMetaMap;
    const parsed = JSON.parse(raw) as DiaryMetaMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {} as DiaryMetaMap;
  }
}

function persistDiaryMeta(meta: DiaryMetaMap) {
  try {
    window.localStorage.setItem(DIARY_META_STORAGE_KEY, JSON.stringify(meta));
  } catch {
    // ignore storage errors
  }
}

function readDiaryChibiPrefs(): DiaryChibiPrefs {
  try {
    const raw = window.localStorage.getItem(DIARY_CHIBI_PREFS_STORAGE_KEY);
    if (!raw) return DEFAULT_DIARY_CHIBI_PREFS;
    const parsed = JSON.parse(raw) as Partial<DiaryChibiPrefs>;
    const showChibi = parsed.showChibi !== false;
    const size =
      typeof parsed.size === 'number' && Number.isFinite(parsed.size)
        ? Math.min(196, Math.max(104, Math.round(parsed.size)))
        : DEFAULT_DIARY_CHIBI_PREFS.size;
    return { showChibi, size };
  } catch {
    return DEFAULT_DIARY_CHIBI_PREFS;
  }
}

function persistDiaryChibiPrefs(prefs: DiaryChibiPrefs) {
  try {
    window.localStorage.setItem(DIARY_CHIBI_PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore storage errors
  }
}

function clampDiaryContentFontSize(value: number | undefined, fallback = 14) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(12, Math.min(22, Number(value)));
}

function readDiaryTextPrefs(): DiaryTextPrefs {
  try {
    const raw = window.localStorage.getItem(DIARY_TEXT_PREFS_STORAGE_KEY);
    if (!raw) return DEFAULT_DIARY_TEXT_PREFS;
    const parsed = JSON.parse(raw) as Partial<DiaryTextPrefs>;
    return {
      contentFontSize: clampDiaryContentFontSize(parsed.contentFontSize, DEFAULT_DIARY_TEXT_PREFS.contentFontSize),
    };
  } catch {
    return DEFAULT_DIARY_TEXT_PREFS;
  }
}

function persistDiaryTextPrefs(prefs: DiaryTextPrefs) {
  try {
    window.localStorage.setItem(DIARY_TEXT_PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore storage errors
  }
}

function randomChibiSrc(except?: string) {
  for (let i = 0; i < 8; i += 1) {
    const idx = Math.floor(Math.random() * CHIBI_COUNT) + 1;
    const src = `${BASE_URL}chibi/chibi-${String(idx).padStart(2, '0')}.webp`;
    if (src !== except) return src;
  }
  const idx = Math.floor(Math.random() * CHIBI_COUNT) + 1;
  return `${BASE_URL}chibi/chibi-${String(idx).padStart(2, '0')}.webp`;
}

function hashMood(name: string): DiaryMood {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return MOOD_ORDER[hash % MOOD_ORDER.length];
}

function isDiaryMood(value: unknown): value is DiaryMood {
  return typeof value === 'string' && MOOD_ORDER.includes(value as DiaryMood);
}

function stripHtml(input: string) {
  return input.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function getPreview(entry: StoredDiary, chars = 38) {
  const raw = entry.htmlContent ? stripHtml(entry.htmlContent) : entry.content.trim();
  return raw.length > chars ? `${raw.slice(0, chars)}…` : raw || '（空）';
}

function toDayKey(ts: number) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDayKeyLabel(dayKey: string) {
  const [yearText, monthText, dateText] = dayKey.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const date = Number(dateText);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(date)) {
    return dayKey;
  }
  return `${month}月${date}日`;
}

function isSameMonth(date: Date, month: Date) {
  return date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth();
}

function formatMonthTitle(date: Date) {
  return `${date.getMonth() + 1}月 ${date.getFullYear()}`;
}

function toMonthInputValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function parseMonthInputValue(value: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  return new Date(year, month - 1, 1);
}

function formatEntryWeekday(date: Date) {
  return date.toLocaleDateString('en-US', { weekday: 'long' });
}

function formatEntryMonth(date: Date) {
  return `${date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()} ${date.getFullYear()}`;
}

function buildCalendarCells(month: Date, dayMap: Map<string, StoredDiary[]>, metaMap: DiaryMetaMap): CalendarCell[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const firstWeekday = first.getDay();
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - firstWeekday);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Array.from({ length: 42 }).map((_, i) => {
    const cellDate = new Date(gridStart);
    cellDate.setDate(gridStart.getDate() + i);
    cellDate.setHours(0, 0, 0, 0);
    const key = toDayKey(cellDate.getTime());
    const entries = dayMap.get(key) ?? [];
    const mood = entries.length ? (metaMap[entries[0].name]?.mood ?? hashMood(entries[0].name)) : null;

    return {
      key: `${key}-${i}`,
      date: cellDate,
      dayKey: key,
      inMonth: isSameMonth(cellDate, month),
      entries,
      mood,
      isToday: cellDate.getTime() === today.getTime(),
    };
  });
}

function buildNewEntryName(existing: StoredDiary[]) {
  const taken = new Set(existing.map((entry) => entry.name));
  const base = `diary-${Date.now()}`;
  let candidate = `${base}.txt`;
  let suffix = 1;
  while (taken.has(candidate)) {
    candidate = `${base}-${suffix}.txt`;
    suffix += 1;
  }
  return candidate;
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function DiaryBPage({
  diaryCoverImageUrl: _diaryCoverImageUrl = '',
  diaryCoverFitMode: _diaryCoverFitMode = 'cover',
  diaryFontFamily = '',
  favoritedEntries: _favoritedEntries = new Set<string>(),
  onFavorite: _onFavorite,
  onExit,
}: DiaryBPageProps) {
  const pageRef = useRef<HTMLDivElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [entries, setEntries] = useState<StoredDiary[]>([]);
  const [metaMap, setMetaMap] = useState<DiaryMetaMap>({});
  const [activeTab, setActiveTab] = useState<DiaryTab>('reading');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [showSettings, setShowSettings] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [draftMood, setDraftMood] = useState<DiaryMood>('calm');
  const [draftFavorite, setDraftFavorite] = useState(false);
  const [sharedChibi] = useState(randomChibiSrc);
  const [diaryChibiPrefs, setDiaryChibiPrefs] = useState<DiaryChibiPrefs>(() => readDiaryChibiPrefs());
  const [diaryTextPrefs, setDiaryTextPrefs] = useState<DiaryTextPrefs>(() => readDiaryTextPrefs());
  const [settingsPanels, setSettingsPanels] = useState({
    chibi: false,
    text: false,
    backup: false,
    danger: false,
  });
  const [calendarDayMenu, setCalendarDayMenu] = useState<CalendarDayMenuState | null>(null);
  const swipeStartRef = useRef<{ x: number; y: number; ignore: boolean } | null>(null);
  const hideFloatingChibi = !diaryChibiPrefs.showChibi || !sharedChibi;

  const effectiveFont = diaryFontFamily || "'Ma Shan Zheng', 'STKaiti', serif";
  const contentFontSize = clampDiaryContentFontSize(diaryTextPrefs.contentFontSize, DEFAULT_DIARY_TEXT_PREFS.contentFontSize);

  useEffect(() => {
    let mounted = true;
    void loadDiaries().then((loaded) => {
      if (!mounted) return;
      const normalized = normalizeEntries(loaded);
      setEntries(normalized);
      if (normalized.length > 0) {
        const lastIndex = normalized.length - 1;
        setCurrentIndex(lastIndex);
        setCalendarMonth(new Date(normalized[lastIndex].importedAt));
      }
    });

    if (typeof window !== 'undefined') {
      setMetaMap(readDiaryMeta());
    }

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    setMetaMap((current) => {
      if (!entries.length) return {};

      const next: DiaryMetaMap = {};
      for (const entry of entries) {
        next[entry.name] = current[entry.name] ?? {
          mood: hashMood(entry.name),
          favorite: false,
        };
      }
      return next;
    });
  }, [entries]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    persistDiaryMeta(metaMap);
  }, [metaMap]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    persistDiaryChibiPrefs(diaryChibiPrefs);
  }, [diaryChibiPrefs]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    persistDiaryTextPrefs(diaryTextPrefs);
  }, [diaryTextPrefs]);

  useEffect(() => {
    if (activeTab !== 'calendar') {
      setCalendarDayMenu(null);
    }
  }, [activeTab]);

  const currentEntry = entries[currentIndex] ?? null;

  const entriesByDay = useMemo(() => {
    const map = new Map<string, StoredDiary[]>();
    for (const entry of entries) {
      const key = toDayKey(entry.importedAt);
      const arr = map.get(key) ?? [];
      arr.push(entry);
      map.set(key, arr);
    }
    return map;
  }, [entries]);

  const calendarCells = useMemo(
    () => buildCalendarCells(calendarMonth, entriesByDay, metaMap),
    [calendarMonth, entriesByDay, metaMap],
  );

  const monthEntries = useMemo(
    () => entries.filter((entry) => isSameMonth(new Date(entry.importedAt), calendarMonth)),
    [entries, calendarMonth],
  );

  const monthMoodStats = useMemo(() => {
    const counts: Record<DiaryMood, number> = {
      love: 0,
      happy: 0,
      calm: 0,
      miss: 0,
      tired: 0,
    };
    for (const entry of monthEntries) {
      const mood = metaMap[entry.name]?.mood ?? hashMood(entry.name);
      counts[mood] += 1;
    }
    return counts;
  }, [monthEntries, metaMap]);

  function syncEntryIndex(targetName: string | null, fallback = 0) {
    if (!targetName) {
      setCurrentIndex(Math.max(0, Math.min(entries.length - 1, fallback)));
      return;
    }
    const idx = entries.findIndex((entry) => entry.name === targetName);
    if (idx >= 0) {
      setCurrentIndex(idx);
      return;
    }
    setCurrentIndex(Math.max(0, Math.min(entries.length - 1, fallback)));
  }

  function openEditorFor(entry: StoredDiary | null) {
    setCalendarDayMenu(null);
    if (entry) {
      const mood = metaMap[entry.name]?.mood ?? hashMood(entry.name);
      const favorite = metaMap[entry.name]?.favorite ?? false;
      setEditingName(entry.name);
      setDraftTitle(entry.title);
      setDraftContent(entry.htmlContent ? stripHtml(entry.htmlContent) : entry.content);
      setDraftMood(mood);
      setDraftFavorite(favorite);
    } else {
      setEditingName(null);
      setDraftTitle('');
      setDraftContent('');
      setDraftMood('calm');
      setDraftFavorite(false);
    }
    setShowEditor(true);
  }

  async function handleSaveDraft() {
    const title = draftTitle.trim();
    const content = draftContent.trim();
    if (!title && !content) {
      setShowEditor(false);
      return;
    }

    try {
      if (editingName) {
        const updated = entries.map((entry) =>
          entry.name === editingName
            ? {
                ...entry,
                title: title || entry.title,
                content,
                htmlContent: '',
              }
            : entry,
        );
        await saveDiaries(updated);
        setEntries(normalizeEntries(updated));
        setMetaMap((current) => ({
          ...current,
          [editingName]: {
            mood: draftMood,
            favorite: draftFavorite,
          },
        }));
        syncEntryIndex(editingName, currentIndex);
      } else {
        const name = buildNewEntryName(entries);
        const createdAt = Date.now();
        const created: StoredDiary = {
          name,
          title: title || `日記 ${new Date(createdAt).toLocaleDateString('zh-TW')}`,
          content,
          htmlContent: '',
          importedAt: createdAt,
        };
        const updated = normalizeEntries([...entries, created]);
        await saveDiaries([created]);
        setEntries(updated);
        setMetaMap((current) => ({
          ...current,
          [name]: {
            mood: draftMood,
            favorite: draftFavorite,
          },
        }));
        const nextIndex = updated.findIndex((entry) => entry.name === name);
        setCurrentIndex(nextIndex >= 0 ? nextIndex : updated.length - 1);
        setCalendarMonth(new Date(createdAt));
      }

      setActiveTab('reading');
      setShowEditor(false);
      emitActionToast({ kind: 'success', message: 'Anni 日記已儲存' });
    } catch (error) {
      emitActionToast({
        kind: 'error',
        message: `Anni 日記儲存失敗：${error instanceof Error ? error.message : '未知錯誤'}`,
        durationMs: 2600,
      });
    }
  }

  async function deleteEntryByName(name: string) {
    if (!window.confirm('確定刪除這篇日記嗎？')) return false;

    const removingIndex = entries.findIndex((entry) => entry.name === name);
    const activeName = currentEntry?.name ?? null;

    await deleteDiary(name);

    const updated = entries.filter((entry) => entry.name !== name);
    setEntries(updated);
    setMetaMap((current) => {
      const next = { ...current };
      delete next[name];
      return next;
    });
    setCalendarDayMenu((current) => (current?.entryName === name ? null : current));

    if (!updated.length) {
      setCurrentIndex(0);
      return true;
    }

    if (activeName && activeName !== name) {
      const keepIndex = updated.findIndex((entry) => entry.name === activeName);
      if (keepIndex >= 0) {
        setCurrentIndex(keepIndex);
        return true;
      }
    }

    const fallbackIndex = removingIndex >= 0 ? removingIndex : currentIndex;
    setCurrentIndex(Math.max(0, Math.min(updated.length - 1, fallbackIndex)));
    return true;
  }

  async function handleDeleteDraft() {
    if (!editingName) {
      setShowEditor(false);
      return;
    }
    const deleted = await deleteEntryByName(editingName);
    if (!deleted) return;
    setShowEditor(false);
  }

  function shiftMonth(diff: number) {
    setCalendarMonth((current) => {
      const next = new Date(current.getFullYear(), current.getMonth() + diff, 1);
      return next;
    });
  }

  function jumpToCurrentMonth() {
    const now = new Date();
    setCalendarMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    setCalendarDayMenu(null);
  }

  function handleMonthPickerChange(event: ChangeEvent<HTMLInputElement>) {
    const parsed = parseMonthInputValue(event.target.value);
    if (!parsed) return;
    setCalendarMonth(parsed);
    setCalendarDayMenu(null);
  }

  function openEntryByName(name: string) {
    setCalendarDayMenu(null);
    const idx = entries.findIndex((entry) => entry.name === name);
    if (idx < 0) return;
    setCurrentIndex(idx);
    setActiveTab('reading');
  }

  function openSettingsSheet() {
    setCalendarDayMenu(null);
    setShowSettings(true);
  }

  function openCalendarDayMenuForCell(
    cell: CalendarCell,
    anchorEl: HTMLButtonElement,
    point?: { x: number; y: number },
  ) {
    const targetEntry = cell.entries[cell.entries.length - 1];
    if (!targetEntry) return;

    const mood = metaMap[targetEntry.name]?.mood ?? hashMood(targetEntry.name);
    const pageRect = pageRef.current?.getBoundingClientRect();
    const anchorRect = anchorEl.getBoundingClientRect();
    const anchorX = point?.x ?? anchorRect.left + anchorRect.width / 2;
    const anchorY = point?.y ?? anchorRect.bottom + 10;

    const menuWidth = 172;
    const menuHeight = 174;
    const padding = 10;
    const localX = pageRect ? anchorX - pageRect.left : anchorX;
    const localY = pageRect ? anchorY - pageRect.top : anchorY;
    const containerWidth = pageRect?.width ?? 390;
    const containerHeight = pageRect?.height ?? 760;

    const left = Math.min(
      Math.max(localX - menuWidth / 2, padding),
      Math.max(padding, containerWidth - menuWidth - padding),
    );
    const top = Math.min(
      Math.max(localY, 94),
      Math.max(94, containerHeight - menuHeight - padding),
    );

    setCalendarDayMenu({
      left,
      top,
      dayKey: cell.dayKey,
      entryName: targetEntry.name,
      count: cell.entries.length,
      mood,
    });
  }

  function handleCalendarCellContextMenu(
    event: ReactMouseEvent<HTMLButtonElement>,
    cell: CalendarCell,
  ) {
    event.preventDefault();
    if (!cell.entries.length) return;
    openCalendarDayMenuForCell(cell, event.currentTarget, {
      x: event.clientX,
      y: event.clientY,
    });
  }

  function openImportPicker() {
    importInputRef.current?.click();
  }

  async function handleImportBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const rawList = Array.isArray(parsed)
        ? parsed
        : parsed &&
            typeof parsed === 'object' &&
            Array.isArray((parsed as { entries?: unknown }).entries)
          ? ((parsed as { entries: unknown[] }).entries as unknown[])
          : null;

      if (!rawList) {
        window.alert('匯入失敗：JSON 格式不正確。');
        return;
      }

      const importing: StoredDiary[] = [];
      const importingMeta: DiaryMetaMap = {};
      const now = Date.now();

      rawList.forEach((item, index) => {
        if (!item || typeof item !== 'object') return;
        const record = item as Record<string, unknown>;

        const rawName = typeof record.name === 'string' ? record.name.trim() : '';
        const name = rawName || `imported-diary-${now}-${index}.txt`;
        const fallbackTitle = name.replace(/\.[^.]+$/u, '') || `日記 ${index + 1}`;
        const rawTitle = typeof record.title === 'string' ? record.title.trim() : '';
        const title = rawTitle || fallbackTitle;
        const content = typeof record.content === 'string' ? record.content : '';
        const htmlContent = typeof record.htmlContent === 'string' ? record.htmlContent : '';
        const importedAtValue =
          typeof record.importedAt === 'number' && Number.isFinite(record.importedAt)
            ? record.importedAt
            : Number(record.importedAt);
        const importedAt = Number.isFinite(importedAtValue) && importedAtValue > 0
          ? importedAtValue
          : now + index;

        if (!title && !content && !htmlContent) return;

        importing.push({
          name,
          title,
          content,
          htmlContent,
          importedAt,
        });

        importingMeta[name] = {
          mood: isDiaryMood(record.mood) ? record.mood : hashMood(name),
          favorite: Boolean(record.favorite),
        };
      });

      if (!importing.length) {
        window.alert('匯入失敗：找不到可用日記資料。');
        return;
      }

      await saveDiaries(importing);
      const refreshed = normalizeEntries(await loadDiaries());
      setEntries(refreshed);
      setMetaMap((current) => ({
        ...current,
        ...importingMeta,
      }));

      const latestImported = importing.reduce((latest, entry) =>
        entry.importedAt >= latest.importedAt ? entry : latest,
      );
      const focusIndex = refreshed.findIndex((entry) => entry.name === latestImported.name);
      if (focusIndex >= 0) {
        setCurrentIndex(focusIndex);
        setCalendarMonth(new Date(refreshed[focusIndex].importedAt));
      }

      setActiveTab('reading');
      setShowSettings(false);
      window.alert(`匯入完成：${importing.length} 篇日記`);
    } catch {
      window.alert('匯入失敗：請確認檔案是有效的 JSON。');
    }
  }

  function shouldIgnoreSwipeTarget(target: EventTarget | null) {
    return target instanceof HTMLElement && Boolean(target.closest('[data-diaryb-no-tab-swipe="true"]'));
  }

  function handleSwipeStart(clientX: number, clientY: number, target: EventTarget | null) {
    swipeStartRef.current = { x: clientX, y: clientY, ignore: showSettings || showEditor || shouldIgnoreSwipeTarget(target) };
  }

  function handleSwipeEnd(clientX: number, clientY: number) {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start || start.ignore) return;

    const dx = clientX - start.x;
    const dy = clientY - start.y;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;

    const order: DiaryTab[] = ['reading', 'calendar', 'grid'];
    const index = order.indexOf(activeTab);
    if (dx < 0 && index < order.length - 1) {
      setActiveTab(order[index + 1]);
    } else if (dx > 0 && index > 0) {
      setActiveTab(order[index - 1]);
    }
  }

  function exportAllEntries(label: 'backup' | 'export') {
    const payload = entries.map((entry) => ({
      ...entry,
      mood: metaMap[entry.name]?.mood ?? hashMood(entry.name),
      favorite: metaMap[entry.name]?.favorite ?? false,
    }));
    const date = new Date().toISOString().slice(0, 10);
    const filename = label === 'backup' ? `my-diary-backup-${date}.json` : `my-diary-export-${date}.json`;
    downloadJson(filename, payload);
  }

  async function clearAllDiaryEntries() {
    if (!window.confirm('確定清除所有日記嗎？此動作無法復原。')) return;
    await clearAllDiaries();
    setEntries([]);
    setMetaMap({});
    setCurrentIndex(0);
    setCalendarDayMenu(null);
    setShowSettings(false);
  }

  const currentMeta = currentEntry
    ? metaMap[currentEntry.name] ?? {
        mood: hashMood(currentEntry.name),
        favorite: false,
      }
    : null;
  const today = new Date();
  const monthInputValue = toMonthInputValue(calendarMonth);
  const isViewingCurrentMonth =
    calendarMonth.getFullYear() === today.getFullYear() &&
    calendarMonth.getMonth() === today.getMonth();

  return (
    <div
      ref={pageRef}
      className="relative h-full overflow-hidden"
      style={{ background: '#f8f4ed' }}
      onTouchStart={(event) => handleSwipeStart(event.touches[0].clientX, event.touches[0].clientY, event.target)}
      onTouchEnd={(event) => handleSwipeEnd(event.changedTouches[0].clientX, event.changedTouches[0].clientY)}
      onTouchCancel={() => {
        swipeStartRef.current = null;
      }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'repeating-linear-gradient(to bottom, transparent, transparent 31px, rgba(100,80,40,0.052) 31px, rgba(100,80,40,0.052) 32px)',
          backgroundPositionY: 108,
        }}
      />

      <div className="relative z-10 flex h-full flex-col">
        <div
          className="shrink-0"
          style={{
            height: 66,
            padding: '14px 18px 10px',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(100,80,40,0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              aria-label="返回"
              onClick={onExit}
              className="transition active:opacity-60"
              style={{
                width: 30,
                height: 30,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.7)',
                border: '1px solid rgba(100,80,40,0.14)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 16,
                color: '#7a6040',
              }}
            >
              ‹
            </button>
            <span
              style={{
                fontSize: 'var(--ui-header-title-size, 17px)',
                fontWeight: 600,
                color: '#2c2218',
                letterSpacing: '0.02em',
                fontFamily: "var(--app-font-family, -apple-system, 'Helvetica Neue', system-ui, sans-serif)",
              }}
            >
              Anni 日記
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button
              type="button"
              onClick={() => openEditorFor(currentEntry)}
              aria-label="編輯"
              className="transition active:opacity-60"
              style={{
                fontSize: 19,
                fontWeight: 300,
                color: '#b5623c',
                background: 'transparent',
                border: 'none',
                width: 28,
                height: 28,
                display: 'grid',
                placeItems: 'center',
              }}
            >
              ✎
            </button>
            <button
              type="button"
              onClick={openSettingsSheet}
              aria-label="更多"
              className="transition active:opacity-60"
              style={{
                fontSize: 20,
                color: 'rgba(100,80,40,0.42)',
                background: 'transparent',
                border: 'none',
                width: 24,
                height: 24,
                display: 'grid',
                placeItems: 'center',
              }}
            >
              ⋯
            </button>
          </div>
        </div>

        <div className="shrink-0">
          <div className="relative flex px-5">
            {(['reading', 'calendar', 'grid'] as DiaryTab[]).map((tab) => {
              const active = activeTab === tab;
              const label = tab === 'reading' ? '閱讀' : tab === 'calendar' ? '月曆' : '格狀';
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className="flex-1"
                  style={{
                    textAlign: 'center',
                    padding: '9px 0 7px',
                    fontSize: 'var(--ui-tab-label-size, 17px)',
                    fontWeight: 500,
                    letterSpacing: '0.04em',
                    fontFamily: "var(--app-font-family, -apple-system, 'Helvetica Neue', system-ui, sans-serif)",
                    color: active ? '#b5623c' : '#a08060',
                    borderBottom: active
                      ? '2px solid #b5623c'
                      : '2px solid rgba(100,80,40,0.09)',
                    background: 'transparent',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <p
            className="text-center"
            style={{
              fontSize: 8,
              color: 'rgba(120,90,50,0.28)',
              letterSpacing: '0.12em',
              padding: '3px 0 2px',
            }}
          >
            ← 左右滑動切換 →
          </p>
        </div>

        {activeTab === 'reading' && (
          <div className="relative min-h-0 flex flex-1 flex-col overflow-hidden">
            {currentEntry ? (
              <>
                <div
                  className="pointer-events-none absolute inset-y-0"
                  style={{ left: 52, width: 1, background: 'rgba(196,104,74,0.14)' }}
                />
                <div
                  className="pointer-events-none absolute"
                  style={{
                    left: 10,
                    top: 70,
                    zIndex: 2,
                    fontSize: 8.5,
                    color: 'rgba(180,100,50,0.36)',
                    writingMode: 'vertical-rl',
                    letterSpacing: '0.08em',
                  }}
                >
                  {new Date(currentEntry.importedAt).getFullYear()}
                </div>

                <div
                  className="shrink-0"
                  style={{
                    padding: '16px 18px 12px 60px',
                    borderBottom: '1px solid rgba(100,80,40,0.09)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5 }}>
                    <div style={{ fontSize: 26, fontWeight: 800, color: '#b5623c', lineHeight: 1, letterSpacing: -1 }}>
                      {new Date(currentEntry.importedAt).getDate()}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: 8.5, color: '#a08060', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                        {formatEntryWeekday(new Date(currentEntry.importedAt))}
                      </span>
                      <span style={{ fontSize: 9.5, color: '#a08060', letterSpacing: '0.1em' }}>
                        {formatEntryMonth(new Date(currentEntry.importedAt))}
                      </span>
                    </div>
                    {currentMeta && (
                      <div
                        style={{
                          marginLeft: 'auto',
                          fontSize: 11,
                          color: '#9a8060',
                          background: 'rgba(100,80,40,0.06)',
                          padding: '4px 9px',
                          borderRadius: 20,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 3,
                        }}
                      >
                        <span>{MOOD_THEME[currentMeta.mood].icon}</span>
                        <span>{MOOD_THEME[currentMeta.mood].label}</span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => openEditorFor(currentEntry)}
                      aria-label="編輯這篇"
                      style={{
                        fontSize: 13,
                        color: 'rgba(100,80,40,0.32)',
                        padding: '2px 4px',
                        marginLeft: 4,
                        background: 'transparent',
                        border: 'none',
                      }}
                    >
                      ✏️
                    </button>
                  </div>

                  <div
                    style={{
                      fontSize: 17,
                      color: '#2c2218',
                      fontFamily: effectiveFont,
                      lineHeight: 1.35,
                    }}
                  >
                    {currentEntry.title}
                  </div>
                </div>

                <div
                  className="relative min-h-0 flex-1 overflow-y-auto px-[18px] pb-3 pt-[14px]"
                  data-diaryb-no-tab-swipe="true"
                  style={{ paddingLeft: 60 }}
                >
                  {currentEntry.htmlContent ? (
                    <div
                      style={{ fontSize: contentFontSize, lineHeight: 2.16, color: '#3a2c1c', fontFamily: effectiveFont }}
                      dangerouslySetInnerHTML={{ __html: currentEntry.htmlContent }}
                    />
                  ) : (
                    <p style={{ fontSize: contentFontSize, lineHeight: 2.16, color: '#3a2c1c', whiteSpace: 'pre-wrap', fontFamily: effectiveFont }}>
                      {currentEntry.content}
                    </p>
                  )}
                  <div
                    className="pointer-events-none absolute bottom-0 left-0 right-0"
                    style={{ height: 52, background: 'linear-gradient(to bottom, transparent, #f8f4ed)' }}
                  />
                </div>

                <div
                  className="shrink-0"
                  style={{
                    padding: '8px 26px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderTop: '1px solid rgba(100,80,40,0.08)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                    disabled={currentIndex <= 0}
                    style={{
                      fontSize: 20,
                      color: 'rgba(100,80,40,0.32)',
                      padding: '4px 6px',
                      background: 'transparent',
                      border: 'none',
                      opacity: currentIndex <= 0 ? 0.32 : 1,
                    }}
                  >
                    ←
                  </button>
                  <span style={{ fontSize: 11, color: 'rgba(100,80,40,0.42)', letterSpacing: '0.1em' }}>
                    {currentIndex + 1} / {entries.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentIndex((i) => Math.min(entries.length - 1, i + 1))}
                    disabled={currentIndex >= entries.length - 1}
                    style={{
                      fontSize: 20,
                      color: 'rgba(100,80,40,0.32)',
                      padding: '4px 6px',
                      background: 'transparent',
                      border: 'none',
                      opacity: currentIndex >= entries.length - 1 ? 0.32 : 1,
                    }}
                  >
                    →
                  </button>
                </div>

                <div
                  className="shrink-0 overflow-x-auto"
                  style={{
                    padding: '8px 18px 14px',
                    display: 'flex',
                    gap: 7,
                    borderTop: '1px solid rgba(100,80,40,0.06)',
                    scrollbarWidth: 'none',
                  }}
                >
                  {entries.map((entry, index) => {
                    const meta = metaMap[entry.name] ?? { mood: hashMood(entry.name), favorite: false };
                    const d = new Date(entry.importedAt);
                    const active = index === currentIndex;
                    return (
                      <button
                        key={entry.name}
                        type="button"
                        onClick={() => setCurrentIndex(index)}
                        style={{
                          flexShrink: 0,
                          minWidth: 46,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          padding: '5px 7px',
                          borderRadius: 11,
                          border: active ? '1.5px solid rgba(181,98,60,0.26)' : '1.5px solid transparent',
                          background: active ? 'rgba(181,98,60,0.1)' : 'transparent',
                        }}
                      >
                        <span style={{ fontSize: 14, fontWeight: 600, color: active ? '#b5623c' : '#3a2c1c', lineHeight: 1 }}>
                          {d.getDate()}
                        </span>
                        <span style={{ fontSize: 7.5, color: '#a08060', marginTop: 1, letterSpacing: '0.05em' }}>
                          {d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}
                        </span>
                        <span
                          style={{
                            width: 4,
                            height: 4,
                            borderRadius: '50%',
                            marginTop: 3,
                            background: MOOD_THEME[meta.mood].dot,
                          }}
                        />
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="flex h-full items-center justify-center px-6 text-center">
                <div>
                  <p style={{ fontSize: 26, fontWeight: 800, color: '#b5623c' }}>0</p>
                  <p style={{ marginTop: 8, fontSize: 14, color: '#9a8060' }}>還沒有日記，先去設定頁匯入。</p>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'calendar' && (
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <div className="shrink-0 px-5 pb-2 pt-3" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button type="button" onClick={() => shiftMonth(-1)} style={{ fontSize: 16, color: '#a08060', background: 'transparent', border: 'none', padding: 4 }}>
                ‹
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <label
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: '#2c2218',
                    border: 'none',
                    background: 'transparent',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                    position: 'relative',
                    cursor: 'pointer',
                  }}
                >
                  <span>{formatMonthTitle(calendarMonth)}</span>
                  <span style={{ fontSize: 10.5, color: '#a08060' }}>▾</span>
                  <input
                    type="month"
                    value={monthInputValue}
                    onChange={handleMonthPickerChange}
                    aria-label="快速跳到指定月份"
                    title="快速跳到指定月份"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      opacity: 0,
                      cursor: 'pointer',
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={jumpToCurrentMonth}
                  aria-label="回到當月"
                  title="回到當月"
                  disabled={isViewingCurrentMonth}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: isViewingCurrentMonth ? 'rgba(160,128,96,0.45)' : '#a08060',
                    fontSize: 13,
                    lineHeight: 1,
                    padding: '2px 4px',
                  }}
                >
                  ↺
                </button>
              </div>
              <button type="button" onClick={() => shiftMonth(1)} style={{ fontSize: 16, color: '#a08060', background: 'transparent', border: 'none', padding: 4 }}>
                ›
              </button>
            </div>

            <div className="grid grid-cols-7 px-2.5 pb-1">
              {WEEKDAYS.map((weekday) => (
                <div key={weekday} className="text-center" style={{ fontSize: 8.5, color: '#a08060', letterSpacing: '0.07em' }}>
                  {weekday}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-[3px] px-2.5 pb-1.5">
              {calendarCells.map((cell) => {
                const noEntry = cell.entries.length === 0;
                const moodBg = cell.mood ? MOOD_THEME[cell.mood].chipBg : undefined;
                return (
                  <button
                    key={cell.key}
                    type="button"
                    onClick={(event) => {
                      if (!cell.entries.length) return;
                      openCalendarDayMenuForCell(cell, event.currentTarget, {
                        x: event.clientX,
                        y: event.clientY,
                      });
                    }}
                    onContextMenu={(event) => handleCalendarCellContextMenu(event, cell)}
                    onKeyDown={(event) => {
                      if (!cell.entries.length) return;
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openCalendarDayMenuForCell(cell, event.currentTarget, {
                          x: window.innerWidth / 2,
                          y: window.innerHeight / 2,
                        });
                      }
                    }}
                    className="relative flex aspect-square flex-col items-center justify-center rounded-[9px]"
                    style={{
                      background: noEntry ? (cell.inMonth ? 'rgba(100,80,40,0.03)' : 'transparent') : moodBg,
                      boxShadow: cell.isToday ? '0 0 0 2px #b5623c' : 'none',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: cell.isToday ? 700 : 500,
                        color: cell.inMonth ? (cell.isToday ? '#b5623c' : '#2c2218') : 'rgba(60,40,20,0.18)',
                        lineHeight: 1,
                      }}
                    >
                      {cell.date.getDate()}
                    </span>
                    {cell.entries.length > 0 && cell.mood && (
                      <span style={{ fontSize: 8.5, marginTop: 1, lineHeight: 1 }}>{MOOD_THEME[cell.mood].icon}</span>
                    )}
                    {cell.entries.length > 1 && (
                      <span
                        style={{
                          position: 'absolute',
                          top: 2,
                          right: 3,
                          fontSize: 7,
                          color: 'rgba(80,60,30,0.4)',
                          fontWeight: 600,
                        }}
                      >
                        ×{cell.entries.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div
              className="flex flex-wrap gap-x-3 gap-y-1.5 px-3.5 pb-2.5 pt-1.5"
              style={{ borderTop: '1px solid rgba(100,80,40,0.08)' }}
            >
              {MOOD_ORDER.map((mood) => (
                <div key={mood} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9.5, color: '#9a8068' }}>
                  <span style={{ width: 11, height: 11, borderRadius: 3, background: MOOD_THEME[mood].chipBg }} />
                  <span>{MOOD_THEME[mood].label}</span>
                </div>
              ))}
              <span style={{ fontSize: 9, color: '#b0a090' }}>×N = 多篇</span>
            </div>

            <div
              className="shrink-0"
              style={{
                padding: '7px 16px 12px',
                borderTop: '1px solid rgba(100,80,40,0.08)',
                display: 'flex',
                gap: 18,
                justifyContent: 'center',
              }}
            >
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 19, fontWeight: 700, lineHeight: 1, color: '#b5623c' }}>{monthEntries.length}</div>
                <div style={{ fontSize: 8.5, color: '#a08060', letterSpacing: '0.05em', marginTop: 2 }}>篇日記</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 19, fontWeight: 700, lineHeight: 1, color: '#96c898' }}>{monthMoodStats.calm}</div>
                <div style={{ fontSize: 8.5, color: '#a08060', letterSpacing: '0.05em', marginTop: 2 }}>天平靜</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 19, fontWeight: 700, lineHeight: 1, color: '#e090a0' }}>{monthMoodStats.love}</div>
                <div style={{ fontSize: 8.5, color: '#a08060', letterSpacing: '0.05em', marginTop: 2 }}>天喜悅</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 19, fontWeight: 700, lineHeight: 1, color: '#90a0d8' }}>{monthMoodStats.miss}</div>
                <div style={{ fontSize: 8.5, color: '#a08060', letterSpacing: '0.05em', marginTop: 2 }}>天想念</div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'grid' && (
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <div
              className="shrink-0 px-4 py-2"
              style={{
                borderBottom: '1px solid rgba(100,80,40,0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <button type="button" onClick={() => shiftMonth(-1)} style={{ fontSize: 13, color: '#a08060', background: 'transparent', border: 'none' }}>
                ‹
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <label
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#2c2218',
                    border: 'none',
                    background: 'transparent',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    position: 'relative',
                    cursor: 'pointer',
                  }}
                >
                  <span>{formatMonthTitle(calendarMonth)}</span>
                  <span style={{ fontSize: 9, color: '#a08060' }}>▾</span>
                  <input
                    type="month"
                    value={monthInputValue}
                    onChange={handleMonthPickerChange}
                    aria-label="快速跳到指定月份"
                    title="快速跳到指定月份"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      opacity: 0,
                      cursor: 'pointer',
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={jumpToCurrentMonth}
                  aria-label="回到當月"
                  title="回到當月"
                  disabled={isViewingCurrentMonth}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: isViewingCurrentMonth ? 'rgba(160,128,96,0.45)' : '#a08060',
                    fontSize: 11,
                    lineHeight: 1,
                    padding: '2px 4px',
                  }}
                >
                  ↺
                </button>
              </div>
              <button type="button" onClick={() => shiftMonth(1)} style={{ fontSize: 13, color: '#a08060', background: 'transparent', border: 'none' }}>
                ›
              </button>
            </div>

            <div className="grid h-full grid-cols-2 content-start gap-[9px] overflow-y-auto p-[11px_12px] pb-24">
              {monthEntries.map((entry) => {
                const meta = metaMap[entry.name] ?? { mood: hashMood(entry.name), favorite: false };
                const d = new Date(entry.importedAt);
                return (
                  <button
                    key={entry.name}
                    type="button"
                    onClick={() => openEntryByName(entry.name)}
                    className="flex flex-col overflow-hidden rounded-[15px] text-left"
                    style={{
                      background: 'rgba(255,255,255,0.62)',
                      border: '1px solid rgba(100,80,40,0.09)',
                      boxShadow: '0 2px 10px rgba(60,40,20,0.08)',
                    }}
                  >
                    <div style={{ height: 4, width: '100%', background: MOOD_THEME[meta.mood].bar }} />
                    <div className="p-[9px_10px_8px]">
                      <div style={{ fontSize: 8.5, color: '#a08060', letterSpacing: '0.07em', marginBottom: 3 }}>
                        {d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()} {d.getFullYear()}
                      </div>
                      <div style={{ fontSize: 26, fontWeight: 800, color: '#b5623c', lineHeight: 1, marginBottom: 4 }}>{d.getDate()}</div>
                      <div style={{ fontSize: 11.5, fontWeight: 600, color: '#2c2218', marginBottom: 3, lineHeight: 1.35 }}>
                        {entry.title}
                      </div>
                      <div style={{ fontSize: 10, color: '#9a8068', lineHeight: 1.6 }}>{getPreview(entry, 34)}</div>
                    </div>
                    <div
                      className="mt-auto flex items-center justify-between p-[5px_10px_7px]"
                      style={{ borderTop: '1px solid rgba(100,80,40,0.07)' }}
                    >
                      <span style={{ fontSize: 13 }}>{MOOD_THEME[meta.mood].icon}</span>
                      <span style={{ fontSize: 11, color: meta.favorite ? '#c49a3c' : 'rgba(100,80,40,0.18)' }}>
                        {meta.favorite ? '★' : '☆'}
                      </span>
                    </div>
                  </button>
                );
              })}

              {monthEntries.length === 0 && (
                <div className="col-span-2 p-8 text-center" style={{ color: '#a08060', fontSize: 13 }}>
                  這個月份還沒有日記
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => openEditorFor(null)}
              aria-label="新增日記"
              className="absolute right-[18px] top-[calc(100%-72px)] grid place-items-center"
              style={{
                width: 50,
                height: 50,
                borderRadius: '50%',
                background: 'linear-gradient(140deg, #c4724a, #9a5030)',
                boxShadow: '0 6px 20px rgba(160,80,40,0.38)',
                color: '#fff',
                fontSize: 24,
                fontWeight: 300,
              }}
            >
              ＋
            </button>
          </div>
        )}
      </div>

      {activeTab !== 'grid' && !hideFloatingChibi && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-end pr-5 pb-4">
          <button
            type="button"
            onClick={openSettingsSheet}
            className="pointer-events-auto transition active:scale-90"
            aria-label="設定 / 匯出"
          >
            {sharedChibi ? (
              <img
                src={sharedChibi}
                alt=""
                draggable={false}
                className="calendar-chibi select-none drop-shadow-md"
                style={{ width: `${diaryChibiPrefs.size}px`, maxWidth: '44vw', height: 'auto' }}
              />
            ) : (
              <span
                style={{
                  width: diaryChibiPrefs.size,
                  height: Math.round(diaryChibiPrefs.size * 1.17),
                  borderRadius: 20,
                  background: 'rgba(252,244,228,0.88)',
                  border: '1.5px dashed rgba(180,130,80,0.22)',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 52,
                }}
              >
                🌸
              </span>
            )}
          </button>
        </div>
      )}

      {calendarDayMenu && (
        <div
          className="absolute inset-0 z-20"
          onPointerDown={() => setCalendarDayMenu(null)}
        >
          <div
            style={{
              position: 'absolute',
              left: calendarDayMenu.left,
              top: calendarDayMenu.top,
              width: 172,
              borderRadius: 16,
              background: '#fffaf2',
              border: '1px solid rgba(170,120,80,0.24)',
              boxShadow: '0 14px 34px rgba(70,50,30,0.24)',
              overflow: 'hidden',
            }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div
              style={{
                padding: '10px 12px 8px',
                background: 'rgba(245,226,198,0.56)',
                borderBottom: '1px solid rgba(170,120,80,0.14)',
                fontSize: 12,
                color: '#85623f',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>{formatDayKeyLabel(calendarDayMenu.dayKey)}</span>
              <span>{MOOD_THEME[calendarDayMenu.mood].icon}</span>
              {calendarDayMenu.count > 1 && (
                <span style={{ fontSize: 11, color: 'rgba(90,70,40,0.52)' }}>×{calendarDayMenu.count}</span>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                const name = calendarDayMenu.entryName;
                setCalendarDayMenu(null);
                openEntryByName(name);
              }}
              className="w-full"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '10px 13px',
                fontSize: 14,
                color: '#3a2c1c',
                borderBottom: '1px solid rgba(170,120,80,0.12)',
              }}
            >
              <span style={{ width: 16, textAlign: 'center' }}>📖</span>
              <span>閱讀</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const entry = entries.find((item) => item.name === calendarDayMenu.entryName) ?? null;
                setCalendarDayMenu(null);
                if (entry) openEditorFor(entry);
              }}
              className="w-full"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '10px 13px',
                fontSize: 14,
                color: '#3a2c1c',
                borderBottom: '1px solid rgba(170,120,80,0.12)',
              }}
            >
              <span style={{ width: 16, textAlign: 'center' }}>✎</span>
              <span>編輯</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const targetName = calendarDayMenu.entryName;
                setCalendarDayMenu(null);
                void deleteEntryByName(targetName);
              }}
              className="w-full"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '10px 13px',
                fontSize: 14,
                color: '#c05050',
              }}
            >
              <span style={{ width: 16, textAlign: 'center' }}>🗑</span>
              <span>刪除此篇</span>
            </button>
          </div>
        </div>
      )}

      <input
        ref={importInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(event) => {
          void handleImportBackup(event);
        }}
      />

      {showEditor && (
        <div className="absolute inset-0 z-30 flex flex-col" style={{ background: '#f8f4ed' }}>
          <div
            className="shrink-0"
            style={{
              height: 56,
              padding: '10px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid rgba(100,80,40,0.1)',
            }}
          >
            <button type="button" onClick={() => setShowEditor(false)} style={{ fontSize: 15, color: '#a08060', background: 'transparent', border: 'none' }}>
              取消
            </button>
            <span style={{ fontSize: 11.5, color: '#7a6040', background: 'rgba(100,80,40,0.07)', padding: '4px 13px', borderRadius: 20 }}>
              {new Date().toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric', weekday: 'short' })}
            </span>
            <button type="button" onClick={() => void handleSaveDraft()} style={{ fontSize: 15, fontWeight: 600, color: '#b5623c', background: 'transparent', border: 'none' }}>
              完成
            </button>
          </div>

          <div
            className="shrink-0 overflow-x-auto"
            style={{
              display: 'flex',
              gap: 6,
              padding: '10px 18px 8px',
              borderBottom: '1px solid rgba(100,80,40,0.07)',
              scrollbarWidth: 'none',
            }}
          >
            {MOOD_ORDER.map((mood) => {
              const selected = draftMood === mood;
              return (
                <button
                  key={mood}
                  type="button"
                  onClick={() => setDraftMood(mood)}
                  style={{
                    flexShrink: 0,
                    padding: '5px 10px',
                    borderRadius: 18,
                    border: selected ? '1.5px solid rgba(181,98,60,0.38)' : '1.5px solid rgba(100,80,40,0.14)',
                    background: selected ? 'rgba(181,98,60,0.1)' : 'transparent',
                    fontSize: 12,
                    color: selected ? '#b5623c' : '#7a6040',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span>{MOOD_THEME[mood].icon}</span>
                  <span>{MOOD_THEME[mood].label}</span>
                </button>
              );
            })}
          </div>

          <div className="relative min-h-0 flex-1 overflow-hidden">
            <div
              className="pointer-events-none absolute inset-y-0"
              style={{ left: 52, width: 1, background: 'rgba(196,104,74,0.14)' }}
            />
            <div className="relative z-[2] border-b p-[14px_18px_10px_60px]" style={{ borderColor: 'rgba(100,80,40,0.08)' }}>
              <input
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                placeholder="標題（選填）"
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontSize: 18,
                  color: '#2c2218',
                  fontFamily: effectiveFont,
                }}
              />
            </div>
            <div className="relative z-[2] h-full p-[14px_18px_90px_60px]">
              <textarea
                value={draftContent}
                onChange={(event) => setDraftContent(event.target.value)}
                placeholder="今天想記下什麼..."
                style={{
                  width: '100%',
                  height: '100%',
                  resize: 'none',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontSize: contentFontSize,
                  lineHeight: 2.16,
                  color: '#3a2c1c',
                  fontFamily: effectiveFont,
                }}
              />
            </div>
          </div>

          <div
            className="shrink-0"
            style={{
              padding: '8px 18px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: 18,
              borderTop: '1px solid rgba(100,80,40,0.08)',
            }}
          >
            <span style={{ fontSize: 17, color: 'rgba(100,80,40,0.36)' }}>𝐁</span>
            <span style={{ fontSize: 17, color: 'rgba(100,80,40,0.36)' }}>𝐼</span>
            <span style={{ fontSize: 17, color: 'rgba(100,80,40,0.36)' }}>≡</span>
            <button
              type="button"
              onClick={() => setDraftFavorite((v) => !v)}
              style={{
                marginLeft: 'auto',
                fontSize: 16,
                color: draftFavorite ? '#c49a3c' : 'rgba(100,80,40,0.28)',
                background: 'transparent',
                border: 'none',
              }}
            >
              {draftFavorite ? '★' : '☆'}
            </button>
            <button
              type="button"
              onClick={() => void handleDeleteDraft()}
              style={{ fontSize: 12, color: '#c06060', fontWeight: 500, background: 'transparent', border: 'none' }}
            >
              🗑 刪除
            </button>
          </div>
        </div>
      )}

      {showSettings && (
        <div
          className="absolute inset-0 z-30 flex items-end"
          style={{ background: 'rgba(30,20,10,0.26)' }}
          onClick={() => setShowSettings(false)}
        >
          <div
            className="w-full"
            style={{
              background: '#faf4eb',
              borderRadius: '26px 26px 0 0',
              padding: '0 0 36px',
              boxShadow: '0 -10px 48px rgba(60,40,20,0.22)',
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              style={{
                width: 34,
                height: 4,
                borderRadius: 2,
                background: 'rgba(100,80,40,0.18)',
                margin: '12px auto 0',
              }}
            />

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '12px 0 10px',
                borderBottom: '1px solid rgba(100,80,40,0.08)',
              }}
            >
              {sharedChibi ? (
                <img src={sharedChibi} alt="" draggable={false} className="calendar-chibi h-[70px] w-[58px] rounded-xl object-contain" />
              ) : (
                <span
                  style={{
                    width: 58,
                    height: 70,
                    borderRadius: 12,
                    background: 'rgba(252,244,228,0.9)',
                    border: '1.5px dashed rgba(180,130,80,0.26)',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 22,
                  }}
                >
                  🌸
                </span>
              )}
              <div style={{ fontSize: 12, color: '#7a6040', marginTop: 6, fontWeight: 500 }}>Anni 日記 設定</div>
            </div>

            <div style={{ padding: '10px 18px 18px' }}>
              <div className="space-y-2">
                <SettingsAccordion
                  title="M"
                  subtitle="顯示與大小"
                  isOpen={settingsPanels.chibi}
                  onToggle={() => setSettingsPanels((prev) => ({ ...prev, chibi: !prev.chibi }))}
                  className="rounded-xl border border-[rgba(170,130,80,0.18)] bg-[rgba(255,255,255,0.72)] px-3 py-2.5"
                  titleClassName="text-[12.5px] text-[#6d5237]"
                  subtitleClassName="text-[10.5px] text-[#9b7a5b]"
                  bodyClassName="mt-2"
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      border: '1px solid rgba(170,130,80,0.18)',
                      background: 'rgba(255,255,255,0.8)',
                      borderRadius: 12,
                      padding: '9px 11px',
                    }}
                  >
                    <span style={{ fontSize: 12.5, color: '#6d5237' }}>M</span>
                    <button
                      type="button"
                      onClick={() =>
                        setDiaryChibiPrefs((prev) => ({ ...prev, showChibi: !prev.showChibi }))
                      }
                      className="relative h-6 w-10 rounded-full transition"
                      style={{ background: diaryChibiPrefs.showChibi ? '#9b7a5b' : '#bdb2a6' }}
                      aria-label="切換M顯示"
                    >
                      <span
                        className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all"
                        style={{ left: diaryChibiPrefs.showChibi ? 18 : 2 }}
                      />
                    </button>
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 11.5, color: '#8a6e50' }}>大小</span>
                      <span style={{ fontSize: 11, color: '#a08060' }}>{diaryChibiPrefs.size}px</span>
                    </div>
                    <input
                      type="range"
                      min={104}
                      max={196}
                      step={1}
                      value={diaryChibiPrefs.size}
                      onChange={(event) =>
                        setDiaryChibiPrefs((prev) => ({
                          ...prev,
                          size: Math.min(196, Math.max(104, Number(event.target.value))),
                        }))
                      }
                      className="w-full accent-amber-700"
                    />
                  </div>
                </SettingsAccordion>

                <SettingsAccordion
                  title="文字"
                  subtitle="內文大小"
                  isOpen={settingsPanels.text}
                  onToggle={() => setSettingsPanels((prev) => ({ ...prev, text: !prev.text }))}
                  className="rounded-xl border border-[rgba(170,130,80,0.18)] bg-[rgba(255,255,255,0.72)] px-3 py-2.5"
                  titleClassName="text-[12.5px] text-[#6d5237]"
                  subtitleClassName="text-[10.5px] text-[#9b7a5b]"
                  bodyClassName="mt-2"
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12.5, color: '#6d5237' }}>內文字級</span>
                    <span style={{ fontSize: 11, color: '#a08060' }}>{contentFontSize.toFixed(1)}px</span>
                  </div>
                  <input
                    type="range"
                    min={12}
                    max={22}
                    step={0.5}
                    value={contentFontSize}
                    onChange={(event) =>
                      setDiaryTextPrefs((prev) => ({
                        ...prev,
                        contentFontSize: clampDiaryContentFontSize(Number(event.target.value), prev.contentFontSize),
                      }))
                    }
                    className="w-full accent-amber-700"
                  />
                </SettingsAccordion>

                <SettingsAccordion
                  title="匯入匯出"
                  subtitle="備份、導入與匯出"
                  isOpen={settingsPanels.backup}
                  onToggle={() => setSettingsPanels((prev) => ({ ...prev, backup: !prev.backup }))}
                  className="rounded-xl border border-[rgba(170,130,80,0.18)] bg-[rgba(255,255,255,0.72)] px-3 py-2.5"
                  titleClassName="text-[12.5px] text-[#6d5237]"
                  subtitleClassName="text-[10.5px] text-[#9b7a5b]"
                  bodyClassName="mt-2 space-y-2"
                >
                  <button
                    type="button"
                    onClick={openImportPicker}
                    className="w-full rounded-xl border border-[rgba(170,130,80,0.18)] bg-white/85"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      padding: '11px 14px',
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ fontSize: 19, width: 30, textAlign: 'center' }}>📥</span>
                    <span style={{ flex: 1 }}>
                      <span style={{ fontSize: 13, color: '#3a2c1c', display: 'block' }}>導入備份</span>
                      <span style={{ fontSize: 10.5, color: '#a08060' }}>從 JSON 還原日記與心情標籤</span>
                    </span>
                    <span style={{ fontSize: 13, color: 'rgba(100,80,40,0.26)' }}>›</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => exportAllEntries('backup')}
                    className="w-full rounded-xl border border-[rgba(170,130,80,0.18)] bg-white/85"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      padding: '11px 14px',
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ fontSize: 19, width: 30, textAlign: 'center' }}>☁️</span>
                    <span style={{ flex: 1 }}>
                      <span style={{ fontSize: 13, color: '#3a2c1c', display: 'block' }}>備份日記</span>
                      <span style={{ fontSize: 10.5, color: '#a08060' }}>下載完整 JSON 備份</span>
                    </span>
                    <span style={{ fontSize: 13, color: 'rgba(100,80,40,0.26)' }}>›</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => exportAllEntries('export')}
                    className="w-full rounded-xl border border-[rgba(170,130,80,0.18)] bg-white/85"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      padding: '11px 14px',
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ fontSize: 19, width: 30, textAlign: 'center' }}>📤</span>
                    <span style={{ flex: 1 }}>
                      <span style={{ fontSize: 13, color: '#3a2c1c', display: 'block' }}>匯出全部</span>
                      <span style={{ fontSize: 10.5, color: '#a08060' }}>目前條目 + 心情標籤</span>
                    </span>
                    <span style={{ fontSize: 13, color: 'rgba(100,80,40,0.26)' }}>›</span>
                  </button>
                </SettingsAccordion>

                <SettingsAccordion
                  title="資料清理"
                  subtitle="危險操作"
                  isOpen={settingsPanels.danger}
                  onToggle={() => setSettingsPanels((prev) => ({ ...prev, danger: !prev.danger }))}
                  className="rounded-xl border border-[rgba(170,130,80,0.18)] bg-[rgba(255,255,255,0.72)] px-3 py-2.5"
                  titleClassName="text-[12.5px] text-[#6d5237]"
                  subtitleClassName="text-[10.5px] text-[#c06a6a]"
                  bodyClassName="mt-2"
                >
                  <button
                    type="button"
                    onClick={() => void clearAllDiaryEntries()}
                    className="w-full rounded-xl border border-[rgba(200,100,100,0.24)] bg-white/85"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      padding: '11px 14px',
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ fontSize: 19, width: 30, textAlign: 'center' }}>🗑️</span>
                    <span style={{ flex: 1 }}>
                      <span style={{ fontSize: 13, color: '#c04040', display: 'block' }}>清除所有日記</span>
                    </span>
                    <span style={{ fontSize: 13, color: 'rgba(180,50,50,0.3)' }}>›</span>
                  </button>
                </SettingsAccordion>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
