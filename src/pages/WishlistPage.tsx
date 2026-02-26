import { useEffect, useMemo, useRef, useState } from 'react';

import { getScopedMixedChibiSources } from '../lib/chibiPool';
import {
  DEFAULT_WISHLIST_PREFS,
  buildWishlistMiniBackup,
  importWishlistMiniBackup,
  loadWishlistSnapshot,
  mergeWishlistSeed,
  parseWishlistMiniBackup,
  saveWishlistSnapshot,
  toggleBirthdayTaskDone,
  toggleWishDone,
  updateWishlistPrefs,
  type BirthdayTask,
  type BirthdaySeedItem,
  type WishSeedItem,
  type WishlistSnapshot,
  type WishlistWish,
} from '../lib/wishlistDB';

import './WishlistPage.css';

type TabId = 'cards' | 'list' | 'birthday';
type ListFilterId = 'all' | 'done';
type BirthdayFilterId = 'all' | 'done' | 'undone';

type WishlistPageProps = {
  onExit: () => void;
  letterFontFamily?: string;
  diaryFontFamily?: string;
  initialTab?: TabId;
  initialBirthdayYear?: string | null;
  onOpenLettersYear?: (year: string) => void;
};

type BirthdayYearGroup = {
  year: string;
  tasks: BirthdayTask[];
  order: number;
  doneCount: number;
};

const BASE = import.meta.env.BASE_URL as string;
const CARD_TONE_CLASSES = [
  'wl-card-c1',
  'wl-card-c2',
  'wl-card-c3',
  'wl-card-c4',
  'wl-card-c5',
  'wl-card-c6',
  'wl-card-c7',
  'wl-card-c8',
  'wl-card-c9',
  'wl-card-c10',
  'wl-card-c11',
  'wl-card-c12',
];
const BDAY_TONE_CLASSES = ['wl-bday-c1', 'wl-bday-c2', 'wl-bday-c3', 'wl-bday-c4', 'wl-bday-c5', 'wl-bday-c6', 'wl-bday-c7', 'wl-bday-c8'];
const KISS_MARK = '💋';

const FALLBACK_WISHES: WishSeedItem[] = [
  { text: '我希望有一天我們可以一起去看極光。' },
  { text: '我希望你會記得我說的每一件小事。' },
  { text: '我希望我們能一起吃遍每一家想去的餐廳。' },
  { text: '我希望有一天我們能在海邊看日落。' },
  { text: '我希望能夠一起迷路在一個陌生的城市。' },
  { text: '我希望我們能一起學一樣沒用但好玩的東西。' },
  { text: '我希望下雨天可以窩在家裡看電影。' },
  { text: '我希望有一天我們可以一起露營。' },
];

const FALLBACK_BIRTHDAY_TASKS: BirthdaySeedItem[] = [
  { year: '2024', text: '生日晚上去看星星，不帶手機。' },
  { year: '2025', text: '做一份生日專屬歌單，只在這天聽。' },
  { year: '2026', text: '一起做一個生日蛋糕，不在意成品。' },
  { year: '2027', text: '在生日前一天寫信給未來的自己。' },
  { year: '2028', text: '生日那天吃一道從來沒吃過的食物。' },
];

function pickRandom<T>(items: T[]): T | null {
  if (!items.length) return null;
  return items[Math.floor(Math.random() * items.length)]!;
}

function pickRandomChibi() {
  const pool = getScopedMixedChibiSources('mdiary');
  return pickRandom(pool) ?? '';
}

function formatDoneDate(timestamp: number | null) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}/${m}/${d}`;
}

function parseYearValue(raw: string) {
  const matched = String(raw ?? '').match(/\d{4}/);
  if (!matched) return Number.NaN;
  return Number(matched[0]);
}

function buildBirthdayGroups(tasks: BirthdayTask[]) {
  const byYear = new Map<string, BirthdayTask[]>();
  for (const task of tasks) {
    const key = task.year.trim();
    if (!key) continue;
    const current = byYear.get(key) ?? [];
    current.push(task);
    byYear.set(key, current);
  }

  const groups: BirthdayYearGroup[] = [];
  for (const [year, items] of byYear.entries()) {
    const sorted = [...items].sort((a, b) => a.order - b.order);
    groups.push({
      year,
      tasks: sorted,
      order: sorted[0]?.order ?? 0,
      doneCount: sorted.filter((item) => Boolean(item.doneAt)).length,
    });
  }

  groups.sort((a, b) => {
    const yearDiff = parseYearValue(a.year) - parseYearValue(b.year);
    if (Number.isFinite(yearDiff) && yearDiff !== 0) return yearDiff;
    return a.order - b.order;
  });
  return groups;
}

function normalizeLine(line: string) {
  return line.trim().replace(/\s+/g, ' ');
}

function normalizeParagraph(input: string) {
  return String(input ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseWishSeed(raw: unknown) {
  const source = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { items?: unknown }).items)
      ? (raw as { items: unknown[] }).items
      : raw && typeof raw === 'object' && Array.isArray((raw as { completedWishes?: unknown }).completedWishes)
        ? (raw as { completedWishes: unknown[] }).completedWishes
      : [];
  const result: WishSeedItem[] = [];
  for (const row of source) {
    if (typeof row === 'string') {
      const text = normalizeParagraph(row);
      if (text) result.push({ text });
      continue;
    }
    if (!row || typeof row !== 'object') continue;
    const title = normalizeLine(String((row as { title?: unknown }).title ?? ''));
    const why = normalizeParagraph(String((row as { why?: unknown }).why ?? ''));
    const toYou = normalizeParagraph(String((row as { toYou?: unknown }).toYou ?? ''));
    const text = normalizeParagraph(String((row as { text?: unknown }).text ?? ''));
    const fallback = title || text || why || toYou;
    if (!fallback) continue;
    result.push({
      title: title || undefined,
      why: why || undefined,
      toYou: toYou || undefined,
      text: text || title || why || toYou,
    });
  }
  return result;
}

function parseBirthdayLine(line: string): BirthdaySeedItem | null {
  const raw = normalizeLine(line);
  if (!raw) return null;
  const parts = raw.split(/[｜|]/);
  if (parts.length < 2) return null;
  const year = normalizeLine(parts[0] ?? '');
  const text = normalizeLine(parts.slice(1).join('｜'));
  if (!year || !text) return null;
  return { year, text };
}

function parseBirthdaySeed(raw: unknown): BirthdaySeedItem[] {
  const source = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { items?: unknown }).items)
      ? (raw as { items: unknown[] }).items
      : raw && typeof raw === 'object' && Array.isArray((raw as { completedBirthdayTasks?: unknown }).completedBirthdayTasks)
        ? (raw as { completedBirthdayTasks: unknown[] }).completedBirthdayTasks
      : [];

  const result: BirthdaySeedItem[] = [];
  for (const row of source) {
    if (typeof row === 'string') {
      const parsed = parseBirthdayLine(row);
      if (parsed) result.push(parsed);
      continue;
    }
    if (!row || typeof row !== 'object') continue;
    const year = normalizeLine(String((row as { year?: unknown }).year ?? ''));
    const text = normalizeParagraph(String((row as { text?: unknown }).text ?? ''));
    if (!year || !text) continue;
    result.push({ year, text });
  }

  return result;
}

function parseWishTextSeed(raw: string) {
  return raw
    .split(/\r?\n+/)
    .map((line) => normalizeParagraph(line))
    .filter((line) => line.length > 0)
    .map((text) => ({ text }));
}

function parseBirthdayTextSeed(raw: string) {
  const result: BirthdaySeedItem[] = [];
  for (const line of raw.split(/\r?\n+/)) {
    const parsed = parseBirthdayLine(line);
    if (parsed) result.push(parsed);
  }
  return result;
}

function parseWishImportPayload(rawText: string, preferJson: boolean) {
  const text = rawText.trim();
  if (!text) return [] as WishSeedItem[];
  if (preferJson) {
    try {
      return parseWishSeed(JSON.parse(text));
    } catch {
      return parseWishTextSeed(text);
    }
  }
  return parseWishTextSeed(text);
}

function parseBirthdayImportPayload(rawText: string, preferJson: boolean) {
  const text = rawText.trim();
  if (!text) return [] as BirthdaySeedItem[];
  if (preferJson) {
    try {
      return parseBirthdaySeed(JSON.parse(text));
    } catch {
      return parseBirthdayTextSeed(text);
    }
  }
  return parseBirthdayTextSeed(text);
}

async function readJson(url: string): Promise<unknown> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`讀取失敗：${response.status}`);
  }
  return response.json();
}

function pickNextWish(wishes: WishlistWish[], currentId: string | null) {
  if (!wishes.length) return null;
  if (wishes.length === 1) return wishes[0]!.id;
  let candidate = pickRandom(wishes)?.id ?? wishes[0]!.id;
  let retries = 0;
  while (candidate === currentId && retries < 8) {
    candidate = pickRandom(wishes)?.id ?? wishes[0]!.id;
    retries += 1;
  }
  return candidate;
}

function resolveWishTitle(wish: WishlistWish) {
  const title = normalizeLine(wish.title ?? '');
  if (title) return title;
  const text = normalizeParagraph(wish.text ?? '');
  if (!text) return '';
  const firstLine = text.split('\n')[0] ?? '';
  return normalizeLine(firstLine) || text;
}

function resolveWishWhy(wish: WishlistWish) {
  const why = normalizeParagraph(wish.why ?? '');
  if (why) return why;
  const title = normalizeLine(wish.title ?? '');
  const text = normalizeParagraph(wish.text ?? '');
  if (!title) return '';
  const flatTitle = normalizeLine(title);
  const flatText = normalizeLine(text);
  if (text && flatText !== flatTitle) return text;
  return '';
}

function resolveWishToYou(wish: WishlistWish) {
  return normalizeParagraph(wish.toYou ?? '');
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

export function WishlistPage({
  onExit,
  letterFontFamily = '',
  diaryFontFamily = '',
  initialTab = 'cards',
  initialBirthdayYear = null,
  onOpenLettersYear,
}: WishlistPageProps) {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [listFilter, setListFilter] = useState<ListFilterId>('all');
  const [birthdayFilter, setBirthdayFilter] = useState<BirthdayFilterId>('all');
  const [snapshot, setSnapshot] = useState<WishlistSnapshot | null>(null);
  const [currentWishId, setCurrentWishId] = useState<string | null>(null);
  const [overlayWishId, setOverlayWishId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [chibiSrc] = useState(pickRandomChibi);
  const [birthdayOpenedYears, setBirthdayOpenedYears] = useState<Record<string, boolean>>({});
  const [birthdayTaskCursor, setBirthdayTaskCursor] = useState<Record<string, number>>({});
  const [birthdayFocusYear, setBirthdayFocusYear] = useState<string | null>(null);
  const [birthdayZoomYear, setBirthdayZoomYear] = useState<string | null>(null);
  const [showFontSizeSection, setShowFontSizeSection] = useState(false);
  const [showChibiSection, setShowChibiSection] = useState(false);
  const [showBackupSection, setShowBackupSection] = useState(false);
  const [showRawImportSection, setShowRawImportSection] = useState(false);
  const [wishCardAnimPhase, setWishCardAnimPhase] = useState<'idle' | 'out' | 'in'>('idle');
  const tabSwipeStartRef = useRef<{ x: number; y: number; ignore: boolean } | null>(null);
  const wishCardAnimTimerRef = useRef<number | null>(null);
  const initialTabAppliedRef = useRef<TabId | null>(null);
  const initialYearAppliedRef = useRef<string | null>(null);

  const wishes = snapshot?.wishes ?? [];
  const birthdayTasks = snapshot?.birthdayTasks ?? [];
  const prefs = snapshot?.prefs ?? DEFAULT_WISHLIST_PREFS;

  const doneWishCount = useMemo(() => wishes.filter((item) => Boolean(item.doneAt)).length, [wishes]);
  const doneBirthdayCount = useMemo(() => birthdayTasks.filter((item) => Boolean(item.doneAt)).length, [birthdayTasks]);

  const currentWish = useMemo(() => wishes.find((item) => item.id === currentWishId) ?? null, [wishes, currentWishId]);
  const overlayWish = useMemo(() => wishes.find((item) => item.id === overlayWishId) ?? null, [wishes, overlayWishId]);

  const filteredWishes = useMemo(
    () => wishes.filter((item) => (listFilter === 'done' ? Boolean(item.doneAt) : true)),
    [wishes, listFilter],
  );

  const birthdayGroups = useMemo(() => buildBirthdayGroups(birthdayTasks), [birthdayTasks]);
  const filteredBirthdayGroups = useMemo(() => {
    if (birthdayFilter === 'done') {
      return birthdayGroups.filter((group) => group.doneCount > 0);
    }
    if (birthdayFilter === 'undone') {
      return birthdayGroups.filter((group) => group.doneCount < group.tasks.length);
    }
    return birthdayGroups;
  }, [birthdayGroups, birthdayFilter]);

  useEffect(() => {
    let active = true;

    void (async () => {
      setLoading(true);
      try {
        const local = await loadWishlistSnapshot();

        let next = local;
        try {
          const [wishJson, birthdayJson] = await Promise.all([
            readJson(`${BASE}data/wishlist/wishes.json`),
            readJson(`${BASE}data/wishlist/birthday-tasks.json`),
          ]);

          const wishSeed = parseWishSeed(wishJson);
          const birthdaySeed = parseBirthdaySeed(birthdayJson);
          if (wishSeed.length || birthdaySeed.length) {
            next = mergeWishlistSeed(
              local,
              wishSeed.length ? wishSeed : FALLBACK_WISHES,
              birthdaySeed.length ? birthdaySeed : FALLBACK_BIRTHDAY_TASKS,
            );
          }
        } catch {
          next = mergeWishlistSeed(local, FALLBACK_WISHES, FALLBACK_BIRTHDAY_TASKS);
        }

        if (!active) return;
        setSnapshot(next);
        setCurrentWishId((prev) => (prev && next.wishes.some((item) => item.id === prev) ? prev : pickNextWish(next.wishes, null)));

        // Persist merged seed so JSON updates can sync into IndexedDB.
        void saveWishlistSnapshot(next).catch(() => undefined);
      } catch (error) {
        if (!active) return;
        setStatus(`讀取失敗：${error instanceof Error ? error.message : '未知錯誤'}`);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!wishes.length) {
      setCurrentWishId(null);
      return;
    }
    if (!currentWishId || !wishes.some((item) => item.id === currentWishId)) {
      setCurrentWishId(pickNextWish(wishes, null));
    }
  }, [wishes, currentWishId]);

  useEffect(() => {
    return () => {
      if (wishCardAnimTimerRef.current != null) {
        window.clearTimeout(wishCardAnimTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!snapshot) return;
    if (initialTabAppliedRef.current === initialTab) return;
    setActiveTab(initialTab);
    initialTabAppliedRef.current = initialTab;
  }, [initialTab, snapshot]);

  useEffect(() => {
    if (!birthdayGroups.length || !initialBirthdayYear) return;
    if (initialYearAppliedRef.current === initialBirthdayYear) return;
    const target = birthdayGroups.find((group) => group.year === initialBirthdayYear);
    if (!target) return;
    setActiveTab('birthday');
    setBirthdayFocusYear(target.year);
    setBirthdayOpenedYears((prev) => ({ ...prev, [target.year]: true }));
    setBirthdayTaskCursor((prev) => ({ ...prev, [target.year]: 0 }));
    initialYearAppliedRef.current = initialBirthdayYear;
  }, [initialBirthdayYear, birthdayGroups]);

  useEffect(() => {
    if (!birthdayGroups.length) return;
    setBirthdayTaskCursor((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const group of birthdayGroups) {
        const current = next[group.year] ?? 0;
        const safe = Math.min(Math.max(current, 0), Math.max(0, group.tasks.length - 1));
        if (safe !== current) {
          next[group.year] = safe;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [birthdayGroups]);

  const birthdayZoomGroup = useMemo(
    () => (birthdayZoomYear ? birthdayGroups.find((group) => group.year === birthdayZoomYear) ?? null : null),
    [birthdayZoomYear, birthdayGroups],
  );
  const birthdayZoomTaskCount = birthdayZoomGroup?.tasks.length ?? 0;
  const birthdayZoomTaskIndex = birthdayZoomGroup
    ? Math.min(birthdayTaskCursor[birthdayZoomGroup.year] ?? 0, Math.max(0, birthdayZoomTaskCount - 1))
    : 0;
  const birthdayZoomTask = birthdayZoomGroup ? birthdayZoomGroup.tasks[birthdayZoomTaskIndex] ?? null : null;
  const birthdayZoomToneClass = birthdayZoomGroup ? BDAY_TONE_CLASSES[Math.abs(birthdayZoomGroup.order % BDAY_TONE_CLASSES.length)]! : '';

  const updateSnapshot = (next: WishlistSnapshot, nextStatus = '') => {
    setSnapshot(next);
    if (nextStatus) setStatus(nextStatus);
    void saveWishlistSnapshot(next).catch((error) => {
      setStatus(`儲存失敗：${error instanceof Error ? error.message : '未知錯誤'}`);
    });
  };

  const drawNextWish = () => {
    if (!wishes.length || wishCardAnimPhase === 'out') return;
    const nextId = pickNextWish(wishes, currentWishId);
    if (!nextId || nextId === currentWishId) return;
    if (wishCardAnimTimerRef.current != null) {
      window.clearTimeout(wishCardAnimTimerRef.current);
      wishCardAnimTimerRef.current = null;
    }
    setWishCardAnimPhase('out');
    wishCardAnimTimerRef.current = window.setTimeout(() => {
      setCurrentWishId(nextId);
      setWishCardAnimPhase('in');
      wishCardAnimTimerRef.current = window.setTimeout(() => {
        setWishCardAnimPhase('idle');
        wishCardAnimTimerRef.current = null;
      }, 180);
    }, 130);
  };

  const handleToggleWishDone = (wishId: string) => {
    if (!snapshot) return;
    const next = toggleWishDone(snapshot, wishId);
    updateSnapshot(next);
  };

  const handleToggleBirthdayDone = (taskId: string) => {
    if (!snapshot) return;
    const next = toggleBirthdayTaskDone(snapshot, taskId);
    updateSnapshot(next);
  };

  const handleUpdatePrefs = (patch: Partial<WishlistSnapshot['prefs']>) => {
    if (!snapshot) return;
    const next = updateWishlistPrefs(snapshot, patch);
    updateSnapshot(next);
  };

  const exportMiniBackup = () => {
    if (!snapshot) return;
    const payload = buildWishlistMiniBackup(snapshot);
    downloadJson(`wishlist-mini-backup-${Date.now()}.json`, payload);
    setStatus('願望完整備份已匯出。');
  };

  const importMiniBackup = async (files: File[], mode: 'merge' | 'overwrite') => {
    if (!snapshot || !files.length) return;
    const file = files[0]!;
    try {
      const raw = JSON.parse(await file.text()) as unknown;
      const parsed = parseWishlistMiniBackup(raw);
      if (!parsed) {
        setStatus('匯入失敗：檔案不是有效的願望完整備份。');
        return;
      }
      const next = importWishlistMiniBackup(snapshot, parsed.snapshot, mode);
      updateSnapshot(next, `願望完整備份匯入完成（${mode === 'overwrite' ? '覆蓋' : '合併'}）。`);
    } catch {
      setStatus('匯入失敗：JSON 格式錯誤。');
    }
  };

  const importWishes = async (files: File[]) => {
    if (!snapshot || !files.length) return;
    const parsed: WishSeedItem[] = [];
    let failed = 0;

    for (const file of files) {
      try {
        const raw = await file.text();
        const name = file.name.toLocaleLowerCase('zh-TW');
        const preferJson = name.endsWith('.json') || file.type.includes('json');
        const rows = parseWishImportPayload(raw, preferJson);
        parsed.push(...rows);
      } catch {
        failed += 1;
      }
    }

    if (!parsed.length) {
      setStatus(failed ? `願望匯入失敗：沒有可讀內容（失敗 ${failed} 個檔案）。` : '願望匯入失敗：沒有可讀內容。');
      return;
    }

    const next = mergeWishlistSeed(
      snapshot,
      parsed,
      snapshot.birthdayTasks.map((task) => ({ year: task.year, text: task.text })),
    );
    updateSnapshot(next, `願望匯入完成：讀取 ${parsed.length} 筆${failed ? `，失敗 ${failed} 個檔案` : ''}。`);
  };

  const importBirthdayTasks = async (files: File[]) => {
    if (!snapshot || !files.length) return;
    const parsed: BirthdaySeedItem[] = [];
    let failed = 0;

    for (const file of files) {
      try {
        const raw = await file.text();
        const name = file.name.toLocaleLowerCase('zh-TW');
        const preferJson = name.endsWith('.json') || file.type.includes('json');
        const rows = parseBirthdayImportPayload(raw, preferJson);
        parsed.push(...rows);
      } catch {
        failed += 1;
      }
    }

    if (!parsed.length) {
      setStatus(failed ? `生日任務匯入失敗：沒有可讀內容（失敗 ${failed} 個檔案）。` : '生日任務匯入失敗：沒有可讀內容。');
      return;
    }

    const next = mergeWishlistSeed(
      snapshot,
      snapshot.wishes.map((wish) => ({
        title: wish.title,
        why: wish.why,
        toYou: wish.toYou,
        text: wish.text,
      })),
      parsed,
    );
    updateSnapshot(next, `生日任務匯入完成：讀取 ${parsed.length} 筆${failed ? `，失敗 ${failed} 個檔案` : ''}。`);
  };

  const switchTab = (tab: TabId) => {
    setActiveTab(tab);
    setOverlayWishId(null);
    setBirthdayZoomYear(null);
    setShowSettings(false);
  };

  function toggleBirthdayCard(year: string) {
    setBirthdayOpenedYears((prev) => ({ ...prev, [year]: !prev[year] }));
    setBirthdayFocusYear(year);
  }

  function shiftBirthdayTask(year: string, delta: number, total: number) {
    if (total <= 1) return;
    setBirthdayTaskCursor((prev) => {
      const current = prev[year] ?? 0;
      const next = (current + delta + total) % total;
      return {
        ...prev,
        [year]: next,
      };
    });
  }

  function openBirthdayZoom(year: string) {
    setBirthdayZoomYear(year);
    setBirthdayFocusYear(year);
  }

  function shouldIgnoreTabSwipe(target: EventTarget | null) {
    return target instanceof HTMLElement && Boolean(target.closest('[data-wishlist-no-tab-swipe="true"]'));
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

    const order: TabId[] = ['cards', 'list', 'birthday'];
    const tabIndex = order.indexOf(activeTab);
    if (tabIndex < 0) return;

    if (dx < 0 && tabIndex < order.length - 1) {
      setActiveTab(order[tabIndex + 1]!);
    } else if (dx > 0 && tabIndex > 0) {
      setActiveTab(order[tabIndex - 1]!);
    }
  }

  const cardToneClass = CARD_TONE_CLASSES[Math.abs((currentWish?.order ?? 0) % CARD_TONE_CLASSES.length)]!;
  const overlayToneClass = CARD_TONE_CLASSES[Math.abs((overlayWish?.order ?? 0) % CARD_TONE_CLASSES.length)]!;
  void letterFontFamily;
  const uiFont = "var(--app-font-family, -apple-system, 'Helvetica Neue', system-ui, sans-serif)";
  const contentFont = diaryFontFamily || "'Ma Shan Zheng', 'STKaiti', serif";
  const currentWishTitle = currentWish ? resolveWishTitle(currentWish) : '';
  const currentWishWhy = currentWish ? resolveWishWhy(currentWish) : '';
  const currentWishToYou = currentWish ? resolveWishToYou(currentWish) : '';
  const overlayWishTitle = overlayWish ? resolveWishTitle(overlayWish) : '';
  const overlayWishWhy = overlayWish ? resolveWishWhy(overlayWish) : '';
  const overlayWishToYou = overlayWish ? resolveWishToYou(overlayWish) : '';

  return (
    <div
      className="wishlist-page"
      style={{
        ['--wl-ui-font' as string]: uiFont,
        ['--wl-handwriting-font' as string]: contentFont,
        ['--wl-wish-title-size' as string]: `${prefs.wishTitleSize}px`,
        ['--wl-wish-body-size' as string]: `${prefs.wishBodySize}px`,
        ['--wl-bday-card-size' as string]: `${prefs.birthdayCardSize}px`,
        ['--wl-bday-zoom-size' as string]: `${prefs.birthdayZoomSize}px`,
      }}
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
      <header className="wl-top-bar">
        <div className="wl-tb-left">
          <button type="button" onClick={onExit} className="wl-tb-back" aria-label="返回">
            ‹
          </button>
          <span className="wl-tb-title">M's wish list</span>
        </div>
        <button type="button" onClick={() => setShowSettings(true)} className="wl-tb-btn" aria-label="開啟設定">
          ⋯
        </button>
      </header>

      <div className="wl-tab-wrap">
        <div className="wl-tabs">
          <button type="button" className={`wl-tab ${activeTab === 'cards' ? 'active' : ''}`} onClick={() => switchTab('cards')}>
            願望
          </button>
          <button type="button" className={`wl-tab ${activeTab === 'list' ? 'active' : ''}`} onClick={() => switchTab('list')}>
            清單
          </button>
          <button type="button" className={`wl-tab ${activeTab === 'birthday' ? 'active' : ''}`} onClick={() => switchTab('birthday')}>
            生日任務
          </button>
        </div>
        <p className="wl-swipe-hint">← 左右滑動切換 →</p>
      </div>

      {activeTab === 'cards' && (
        <section className="wl-card-scene">
          {!currentWish ? (
            <div className="wl-empty">還沒有願望資料</div>
          ) : (
            <>
              <div className="wl-card-stack" data-wishlist-no-tab-swipe="true">
                <div className="wl-card-peek wl-card-peek-1" />
                <div className="wl-card-peek wl-card-peek-2" />

                <div
                  className={`wl-wish-card ${cardToneClass} ${wishCardAnimPhase === 'out' ? 'is-out' : ''} ${
                    wishCardAnimPhase === 'in' ? 'is-in' : ''
                  }`}
                  role="button"
                  tabIndex={0}
                  onClick={drawNextWish}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      drawNextWish();
                    }
                  }}
                >
                  {currentWish.doneAt ? <span className="wl-kiss">{KISS_MARK}</span> : null}
                  <div className="wl-card-header">
                    <span className="wl-card-label">願望清單</span>
                    <span className="wl-card-count">
                      {currentWish.order + 1} / {wishes.length}
                    </span>
                  </div>
                  <div className="wl-card-body">
                    <div className="wl-card-title">{currentWishTitle}</div>
                    {(currentWishWhy || currentWishToYou) && (
                      <div className="wl-card-notes">
                        {currentWishWhy ? (
                          <div className="wl-card-note">
                            <p className="wl-card-note-label">為什麼</p>
                            <p className="wl-card-note-text">{currentWishWhy}</p>
                          </div>
                        ) : null}
                        {currentWishToYou ? (
                          <div className="wl-card-note">
                            <p className="wl-card-note-label">想對你說</p>
                            <p className="wl-card-note-text">{currentWishToYou}</p>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                  <div className="wl-card-footer">
                    <button
                      type="button"
                      className={`wl-card-fav ${currentWish.doneAt ? 'done' : ''}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleToggleWishDone(currentWish.id);
                      }}
                      aria-label="切換完成"
                    >
                      {currentWish.doneAt ? '♥' : '♡'}
                    </button>
                    {currentWish.doneAt ? (
                      <span className="wl-card-date">完成於 {formatDoneDate(currentWish.doneAt)}</span>
                    ) : (
                      <span className="wl-card-hint">輕觸卡片換下一張</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="wl-card-progress">
                <div className="wl-progress-track">
                  <div className="wl-progress-fill" style={{ width: `${wishes.length ? (doneWishCount / wishes.length) * 100 : 0}%` }} />
                </div>
                <span className="wl-progress-label">已完成 {doneWishCount} 個願望 ♥</span>
              </div>
            </>
          )}
        </section>
      )}

      {activeTab === 'list' && (
        <section className="wl-list-view">
          <div className="wl-filter">
            <button type="button" className={`wl-pill ${listFilter === 'all' ? 'active' : ''}`} onClick={() => setListFilter('all')}>
              全部
            </button>
            <button type="button" className={`wl-pill ${listFilter === 'done' ? 'active' : ''}`} onClick={() => setListFilter('done')}>
              ♥ 已完成
            </button>
            <span className="wl-done-count">
              已完成 {doneWishCount} / {wishes.length}
            </span>
          </div>

          <div className="wl-wish-list">
            {!filteredWishes.length ? (
              <div className="wl-empty">這個篩選目前沒有內容</div>
            ) : (
              filteredWishes.map((wish) => (
                <div
                  key={wish.id}
                  className="wl-wish-row"
                  role="button"
                  tabIndex={0}
                  onClick={() => setOverlayWishId(wish.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setOverlayWishId(wish.id);
                    }
                  }}
                >
                  <span className="wl-wish-num">{wish.order + 1}</span>
                  <span className={`wl-wish-text ${wish.doneAt ? 'done' : ''}`}>{resolveWishTitle(wish)}</span>
                  <span className="wl-wish-meta" aria-hidden="true">
                    {wish.doneAt ? <span className="wl-wish-done">♥</span> : null}
                    <span className="wl-wish-arrow">›</span>
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {activeTab === 'birthday' && (
        <section className="wl-bday-view">
          <div className="wl-filter" style={{ paddingInline: 4, borderBottom: 0, marginBottom: 8 }}>
            <button type="button" className={`wl-pill ${birthdayFilter === 'all' ? 'active' : ''}`} onClick={() => setBirthdayFilter('all')}>
              全部
            </button>
            <button
              type="button"
              className={`wl-pill ${birthdayFilter === 'done' ? 'active' : ''}`}
              onClick={() => setBirthdayFilter('done')}
            >
              ♥ 已完成
            </button>
            <button
              type="button"
              className={`wl-pill ${birthdayFilter === 'undone' ? 'active' : ''}`}
              onClick={() => setBirthdayFilter('undone')}
            >
              未完成
            </button>
            <span className="wl-done-count">
              已完成 {doneBirthdayCount} / {birthdayTasks.length}
            </span>
          </div>

          <div className="wl-bday-grid">
            {!filteredBirthdayGroups.length ? (
              <div className="wl-empty" style={{ gridColumn: '1 / -1' }}>
                這個篩選目前沒有內容
              </div>
            ) : (
              filteredBirthdayGroups.map((group) => {
                const toneClass = BDAY_TONE_CLASSES[Math.abs(group.order % BDAY_TONE_CLASSES.length)]!;
                const taskCount = group.tasks.length;
                const activeTaskIndex = Math.min(birthdayTaskCursor[group.year] ?? 0, Math.max(0, taskCount - 1));
                const activeTask = group.tasks[activeTaskIndex] ?? group.tasks[0] ?? null;
                const cardOpened = Boolean(birthdayOpenedYears[group.year]);
                const cardFocused = birthdayFocusYear === group.year;
                const summary = normalizeParagraph(activeTask?.text ?? '').split('\n')[0] ?? '';
                const hasMultiple = taskCount > 1;
                return (
                  <div
                    key={group.year}
                    className={`wl-bday-card ${toneClass} ${cardOpened ? 'is-open' : ''} ${cardFocused ? 'is-focus' : ''}`}
                    onClick={() => toggleBirthdayCard(group.year)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        toggleBirthdayCard(group.year);
                      }
                    }}
                  >
                    <div className="wl-bday-inner">
                      <div className="wl-bday-face wl-bday-front">
                        <div className="wl-bday-top">
                          <span className="wl-bday-year">{group.year}</span>
                          <span className="wl-bday-icon">🎂</span>
                        </div>
                        <div className="wl-bday-body">
                          <p className="wl-bday-front-count">任務 {taskCount} 張</p>
                          <p className="wl-bday-front-summary">{summary || '點一下翻到背面'}</p>
                          <p className="wl-bday-front-hint">點卡片翻面</p>
                        </div>
                        {group.doneCount ? <span className="wl-bday-done-mark">♥ {group.doneCount}</span> : null}
                      </div>

                      <div className="wl-bday-face wl-bday-back">
                        <div className="wl-bday-top">
                          <span className="wl-bday-year">{group.year}</span>
                          <span className="wl-bday-top-actions">
                            {onOpenLettersYear ? (
                              <button
                                type="button"
                                className="wl-bday-top-icon"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onOpenLettersYear(group.year);
                                }}
                                aria-label="開啟同年份年度信件"
                              >
                                📜
                              </button>
                            ) : null}
                          </span>
                        </div>
                        <div
                          className="wl-bday-body wl-bday-body-back"
                          onClick={(event) => {
                            event.stopPropagation();
                            openBirthdayZoom(group.year);
                          }}
                          onTouchStart={(event) => event.stopPropagation()}
                        >
                          {activeTask?.doneAt ? (
                            <span className="wl-bday-kiss" aria-hidden="true">
                              {KISS_MARK}
                            </span>
                          ) : null}
                          <p className="wl-bday-text">{activeTask?.text ?? '（沒有內容）'}</p>
                          {activeTask?.doneAt ? <p className="wl-bday-date">完成於 {formatDoneDate(activeTask.doneAt)}</p> : null}
                        </div>
                        <div
                          className="wl-bday-actions"
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleBirthdayCard(group.year);
                          }}
                        >
                          <button
                            type="button"
                            className={`wl-bday-heart ${activeTask?.doneAt ? 'done' : ''}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (activeTask) handleToggleBirthdayDone(activeTask.id);
                            }}
                          >
                            {activeTask?.doneAt ? '♥' : '♡'}
                          </button>
                          {hasMultiple ? (
                            <div className="wl-bday-nav">
                              <button
                                type="button"
                                className="wl-bday-nav-btn"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  shiftBirthdayTask(group.year, -1, taskCount);
                                }}
                              >
                                ‹
                              </button>
                              <span className="wl-bday-nav-count">
                                {activeTaskIndex + 1}/{taskCount}
                              </span>
                              <button
                                type="button"
                                className="wl-bday-nav-btn"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  shiftBirthdayTask(group.year, 1, taskCount);
                                }}
                              >
                                ›
                              </button>
                            </div>
                          ) : (
                            <span className="wl-bday-nav-count">1/1</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      )}

      {overlayWish ? (
        <div className="wl-overlay" data-wishlist-no-tab-swipe="true" onClick={() => setOverlayWishId(null)}>
          <div className={`wl-overlay-card ${overlayToneClass}`} onClick={(event) => event.stopPropagation()}>
            <div className="wl-oc-header">
              <span className="wl-oc-num">
                No. {String(overlayWish.order + 1).padStart(2, '0')} / {wishes.length}
              </span>
              <button type="button" className="wl-oc-close" onClick={() => setOverlayWishId(null)} aria-label="關閉">
                ✕
              </button>
            </div>
            <div className="wl-oc-body">
              {overlayWish.doneAt ? (
                <span className="wl-oc-kiss" aria-hidden="true">
                  {KISS_MARK}
                </span>
              ) : null}
              <div className="wl-oc-content">
                <section className="wl-oc-block">
                  <p className="wl-oc-label">標題</p>
                  <p className="wl-oc-main">{overlayWishTitle}</p>
                </section>
                {overlayWishWhy ? (
                  <section className="wl-oc-block">
                    <p className="wl-oc-label">為什麼</p>
                    <p className="wl-oc-text">{overlayWishWhy}</p>
                  </section>
                ) : null}
                {overlayWishToYou ? (
                  <section className="wl-oc-block">
                    <p className="wl-oc-label">想對你說的話</p>
                    <p className="wl-oc-text">{overlayWishToYou}</p>
                  </section>
                ) : null}
              </div>
            </div>
            <div className="wl-oc-footer">
              <button
                type="button"
                className={`wl-oc-fav ${overlayWish.doneAt ? 'done' : ''}`}
                onClick={() => handleToggleWishDone(overlayWish.id)}
                aria-label={overlayWish.doneAt ? '取消完成' : '標記完成'}
              >
                <span className="wl-oc-fav-icon">{overlayWish.doneAt ? '♥' : '♡'}</span>
              </button>
              {overlayWish.doneAt ? <span className="wl-card-date">完成於 {formatDoneDate(overlayWish.doneAt)}</span> : null}
            </div>
          </div>
        </div>
      ) : null}

      {birthdayZoomGroup && birthdayZoomTask ? (
        <div className="wl-overlay wl-bzoom-overlay" data-wishlist-no-tab-swipe="true" onClick={() => setBirthdayZoomYear(null)}>
          <div className={`wl-overlay-card wl-bzoom-card ${birthdayZoomToneClass}`} onClick={(event) => event.stopPropagation()}>
            <div className="wl-oc-header">
              <span className="wl-oc-num">
                {birthdayZoomGroup.year} ｜ {birthdayZoomTaskIndex + 1}/{birthdayZoomTaskCount}
              </span>
              <span className="wl-oc-header-actions">
                {onOpenLettersYear ? (
                  <button
                    type="button"
                    className="wl-bday-top-icon"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenLettersYear(birthdayZoomGroup.year);
                    }}
                    aria-label="開啟同年份年度信件"
                  >
                    📜
                  </button>
                ) : null}
                <button type="button" className="wl-oc-close" onClick={() => setBirthdayZoomYear(null)} aria-label="關閉">
                  ✕
                </button>
              </span>
            </div>
            <div className="wl-oc-body wl-bzoom-body">
              {birthdayZoomTask.doneAt ? (
                <span className="wl-oc-kiss" aria-hidden="true">
                  {KISS_MARK}
                </span>
              ) : null}
              <p className="wl-bzoom-text">{birthdayZoomTask.text}</p>
            </div>
            <div className="wl-oc-footer">
              <button
                type="button"
                className={`wl-oc-fav ${birthdayZoomTask.doneAt ? 'done' : ''}`}
                onClick={() => handleToggleBirthdayDone(birthdayZoomTask.id)}
                aria-label={birthdayZoomTask.doneAt ? '取消完成' : '標記完成'}
              >
                <span className="wl-oc-fav-icon">{birthdayZoomTask.doneAt ? '♥' : '♡'}</span>
              </button>
              {birthdayZoomTask.doneAt ? <span className="wl-card-date">完成於 {formatDoneDate(birthdayZoomTask.doneAt)}</span> : null}
            </div>
          </div>
        </div>
      ) : null}

      {prefs.showChibi ? (
        <div className="wl-chibi-wrap">
          <button type="button" className="wl-chibi-btn" onClick={() => setShowSettings(true)} aria-label="開啟願望設定">
            {chibiSrc ? (
              <img
                src={chibiSrc}
                alt=""
                draggable={false}
                className="calendar-chibi select-none drop-shadow-md"
                style={{ width: prefs.chibiWidth, height: 'auto' }}
              />
            ) : (
              <span className="wl-chibi-fallback" style={{ width: prefs.chibiWidth, height: Math.round(prefs.chibiWidth * 1.16) }}>
                🌿
              </span>
            )}
          </button>
        </div>
      ) : null}

      {showSettings ? (
        <div className="wl-settings-overlay" data-wishlist-no-tab-swipe="true" onClick={() => setShowSettings(false)}>
          <div className="wl-settings-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="wl-sh-handle" />
            <p className="wl-sh-title">M's wish list</p>

            <div className="wl-sh-item">
              <button
                type="button"
                className="wl-collapse-trigger"
                onClick={() => setShowChibiSection((open) => !open)}
                aria-expanded={showChibiSection}
              >
                <span className="wl-sh-label">M</span>
                <span className={`wl-collapse-chevron ${showChibiSection ? 'open' : ''}`}>▾</span>
              </button>
              {showChibiSection ? (
                <div className="wl-collapse-body">
                  <div className="wl-sh-row">
                    <p className="wl-sh-label">M</p>
                    <button
                      type="button"
                      className={`wl-switch ${prefs.showChibi ? 'on' : ''}`}
                      onClick={() => handleUpdatePrefs({ showChibi: !prefs.showChibi })}
                      aria-label="切換M顯示"
                    >
                      <span className="wl-switch-knob" />
                    </button>
                  </div>
                  <input
                    type="range"
                    min={104}
                    max={196}
                    step={1}
                    value={prefs.chibiWidth}
                    onChange={(event) => handleUpdatePrefs({ chibiWidth: Number(event.target.value) })}
                    className="wl-slider"
                  />
                </div>
              ) : null}
            </div>

            <div className="wl-sh-item">
              <button
                type="button"
                className="wl-collapse-trigger"
                onClick={() => setShowFontSizeSection((open) => !open)}
                aria-expanded={showFontSizeSection}
              >
                <span className="wl-sh-label">字體大小</span>
                <span className={`wl-collapse-chevron ${showFontSizeSection ? 'open' : ''}`}>▾</span>
              </button>

              {showFontSizeSection ? (
                <div className="wl-collapse-body">
                  <div className="wl-slider-group">
                    <p className="wl-sh-label">願望標題字體</p>
                    <p className="wl-slider-caption">目前：{prefs.wishTitleSize}px</p>
                    <input
                      type="range"
                      min={16}
                      max={28}
                      step={0.5}
                      value={prefs.wishTitleSize}
                      onChange={(event) => handleUpdatePrefs({ wishTitleSize: Number(event.target.value) })}
                      className="wl-slider"
                    />
                  </div>

                  <div className="wl-slider-group">
                    <p className="wl-sh-label">願望內文字體</p>
                    <p className="wl-slider-caption">目前：{prefs.wishBodySize}px</p>
                    <input
                      type="range"
                      min={11}
                      max={20}
                      step={0.5}
                      value={prefs.wishBodySize}
                      onChange={(event) => handleUpdatePrefs({ wishBodySize: Number(event.target.value) })}
                      className="wl-slider"
                    />
                  </div>

                  <div className="wl-slider-group">
                    <p className="wl-sh-label">生日任務卡字體</p>
                    <p className="wl-slider-caption">目前：{prefs.birthdayCardSize}px</p>
                    <input
                      type="range"
                      min={11}
                      max={18}
                      step={0.5}
                      value={prefs.birthdayCardSize}
                      onChange={(event) => handleUpdatePrefs({ birthdayCardSize: Number(event.target.value) })}
                      className="wl-slider"
                    />
                  </div>

                  <div className="wl-slider-group">
                    <p className="wl-sh-label">生日任務放大字體</p>
                    <p className="wl-slider-caption">目前：{prefs.birthdayZoomSize}px</p>
                    <input
                      type="range"
                      min={13}
                      max={24}
                      step={0.5}
                      value={prefs.birthdayZoomSize}
                      onChange={(event) => handleUpdatePrefs({ birthdayZoomSize: Number(event.target.value) })}
                      className="wl-slider"
                    />
                  </div>
                </div>
              ) : null}
            </div>

            <div className="wl-sh-item">
              <button
                type="button"
                className="wl-collapse-trigger"
                onClick={() => setShowBackupSection((open) => !open)}
                aria-expanded={showBackupSection}
              >
                <span className="wl-sh-label">完整小備份</span>
                <span className={`wl-collapse-chevron ${showBackupSection ? 'open' : ''}`}>▾</span>
              </button>
              {showBackupSection ? (
                <div className="wl-collapse-body">
                  <div className="wl-sh-backup-group">
                    <button type="button" onClick={exportMiniBackup} className="wl-sh-export">
                      📤 匯出完整備份
                    </button>
                    <div className="wl-sh-import-grid">
                      <label className="wl-sh-import">
                        📥 匯入備份（合併）
                        <input
                          type="file"
                          className="hidden"
                          accept=".json,application/json"
                          onChange={(event) => {
                            const files = event.target.files ? Array.from(event.target.files) : [];
                            void importMiniBackup(files, 'merge');
                            event.currentTarget.value = '';
                          }}
                        />
                      </label>
                      <label className="wl-sh-import wl-sh-import-danger">
                        🧹 匯入備份（覆蓋）
                        <input
                          type="file"
                          className="hidden"
                          accept=".json,application/json"
                          onChange={(event) => {
                            const files = event.target.files ? Array.from(event.target.files) : [];
                            void importMiniBackup(files, 'overwrite');
                            event.currentTarget.value = '';
                          }}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="wl-sh-item" style={{ borderBottom: 0 }}>
              <button
                type="button"
                className="wl-collapse-trigger"
                onClick={() => setShowRawImportSection((open) => !open)}
                aria-expanded={showRawImportSection}
              >
                <span className="wl-sh-label">原始內容匯入</span>
                <span className={`wl-collapse-chevron ${showRawImportSection ? 'open' : ''}`}>▾</span>
              </button>
              {showRawImportSection ? (
                <div className="wl-collapse-body">
                  <div className="wl-sh-import-grid">
                    <label className="wl-sh-import">
                      📥 匯入願望清單
                      <input
                        type="file"
                        className="hidden"
                        multiple
                        accept=".txt,.json,application/json,text/plain"
                        onChange={(event) => {
                          const files = event.target.files ? Array.from(event.target.files) : [];
                          void importWishes(files);
                          event.currentTarget.value = '';
                        }}
                      />
                    </label>
                    <label className="wl-sh-import">
                      🎂 匯入生日任務
                      <input
                        type="file"
                        className="hidden"
                        multiple
                        accept=".txt,.json,application/json,text/plain"
                        onChange={(event) => {
                          const files = event.target.files ? Array.from(event.target.files) : [];
                          void importBirthdayTasks(files);
                          event.currentTarget.value = '';
                        }}
                      />
                    </label>
                  </div>
                </div>
              ) : null}
              {status ? <p className="wl-status">{status}</p> : null}
            </div>
          </div>
        </div>
      ) : null}

      {loading ? <div className="wl-empty">讀取中...</div> : null}
    </div>
  );
}

export default WishlistPage;
