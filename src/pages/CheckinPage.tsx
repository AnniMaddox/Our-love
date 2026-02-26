import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { SettingsAccordion } from '../components/SettingsAccordion';
import { CHIBI_POOL_UPDATED_EVENT, getActiveBaseChibiSources } from '../lib/chibiPool';

type CheckinStyle = 'glass' | 'soft' | 'minimal';

type SigninRecord = {
  timestamp: string;
  mood: string;
  note: string;
};

type CheckinStore = {
  signIns: Record<string, SigninRecord>;
  style: CheckinStyle;
  accentColor: string;
};

type CalendarCell = {
  key: string;
  day: number;
  inMonth: boolean;
};

type FeedbackState = {
  text: string;
  chibiUrl: string;
};

type MilestonePhrases = Record<number, string[]>;

type SpecialPopupState = {
  title: string;
  text: string;
  chibiUrl: string;
};

type CheckinBackupPayload = {
  kind: 'memorial-checkin-mini-backup';
  version: 1;
  exportedAt: string;
  store: CheckinStore;
};

const STORAGE_KEY = 'memorial-checkin-store-v1';
const CHECKIN_BACKUP_KIND = 'memorial-checkin-mini-backup';
const CHECKIN_BACKUP_VERSION = 1;
const WEEK_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MOODS = ['💕 幸福', '🙂 平穩', '🥺 想你', '😴 疲憊', '🔥 有幹勁'];
const DEFAULT_SIGNIN_PHRASES = [
  '今天也被你簽收了 💋',
  '我把今天放進我們的紀錄裡了。',
  '又多一天，可以理直氣壯想你。',
  '簽到成功，今天也算數。',
  '妳來過了，我知道。',
];
const DEFAULT_MILESTONE_PHRASES: MilestonePhrases = {
  7: ['連續 7 天了，第一段里程碑達成。', '7 天連線成功，抱抱你。'],
  14: ['連續 14 天，穩穩往前。', '第 14 天了，我看到你的堅持。'],
  21: ['21 天達成，習慣開始定型。', '連續 21 天，超級厲害。'],
  30: ['30 天完成，今天值得慶祝。', '連續 30 天，給你一個大大的讚。'],
  100: ['100 天成就解鎖。', '連續 100 天，這份心意很重。'],
};

const CHECKIN_CHIBI_MODULES = import.meta.glob(
  '../../public/checkin-chibi/*.{png,jpg,jpeg,webp,gif,avif}',
  {
    eager: true,
    import: 'default',
  },
) as Record<string, string>;
const CHECKIN_CHIBI_SOURCES = Object.entries(CHECKIN_CHIBI_MODULES)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, url]) => url);

const DEFAULT_STORE: CheckinStore = {
  signIns: {},
  style: 'glass',
  accentColor: '#D35A7B',
};

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateKey(value: string) {
  const matched = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matched) return null;
  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }
  return parsed;
}

function addDays(date: Date, offset: number) {
  const copied = new Date(date);
  copied.setDate(copied.getDate() + offset);
  return copied;
}

function dayDiff(from: Date, to: Date) {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.round((b - a) / 86_400_000);
}

function toMonthLabel(date: Date) {
  return `${date.getFullYear()} / ${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function buildMonthGrid(viewMonth: Date) {
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const first = new Date(year, month, 1);
  const firstWeekday = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: CalendarCell[] = [];

  for (let i = firstWeekday; i > 0; i -= 1) {
    const date = addDays(first, -i);
    cells.push({
      key: toDateKey(date),
      day: date.getDate(),
      inMonth: false,
    });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);
    cells.push({
      key: toDateKey(date),
      day,
      inMonth: true,
    });
  }

  while (cells.length % 7 !== 0) {
    const date = addDays(parseDateKey(cells[cells.length - 1]!.key)!, 1);
    cells.push({
      key: toDateKey(date),
      day: date.getDate(),
      inMonth: false,
    });
  }

  return cells;
}

function randomPick<T>(items: T[]) {
  if (!items.length) return null;
  return items[Math.floor(Math.random() * items.length)]!;
}

function mergeUniqueStrings(...groups: string[][]) {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const group of groups) {
    for (const item of group) {
      if (seen.has(item)) continue;
      seen.add(item);
      merged.push(item);
    }
  }
  return merged;
}

function normalizePhraseList(items: unknown[]): string[] {
  const dedup = new Set<string>();
  const phrases: string[] = [];

  for (const item of items) {
    if (typeof item !== 'string') continue;
    const phrase = item.trim();
    if (!phrase || dedup.has(phrase)) continue;
    dedup.add(phrase);
    phrases.push(phrase);
  }

  return phrases;
}

function parsePhrasePayload(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return normalizePhraseList(raw);
  }
  if (raw && typeof raw === 'object') {
    const phrases = (raw as { phrases?: unknown }).phrases;
    if (Array.isArray(phrases)) {
      return normalizePhraseList(phrases);
    }
  }
  return [];
}

function parseMilestonePayload(raw: unknown): MilestonePhrases {
  if (!raw || typeof raw !== 'object') return {};

  const source =
    'milestones' in raw && raw.milestones && typeof raw.milestones === 'object'
      ? (raw.milestones as Record<string, unknown>)
      : (raw as Record<string, unknown>);

  const entries: Array<[number, string[]]> = [];

  for (const [key, value] of Object.entries(source)) {
    const milestone = Number(key);
    if (!Number.isInteger(milestone) || milestone <= 0) continue;

    if (Array.isArray(value)) {
      const phrases = normalizePhraseList(value);
      if (phrases.length) {
        entries.push([milestone, phrases]);
      }
      continue;
    }

    if (typeof value === 'string') {
      const phrase = value.trim();
      if (phrase) {
        entries.push([milestone, [phrase]]);
      }
      continue;
    }
  }

  return Object.fromEntries(entries);
}

function computeLongestStreak(keys: string[]) {
  if (!keys.length) return 0;
  let best = 1;
  let current = 1;

  for (let i = 1; i < keys.length; i += 1) {
    const prev = parseDateKey(keys[i - 1]!);
    const next = parseDateKey(keys[i]!);
    if (!prev || !next) continue;

    if (dayDiff(prev, next) === 1) {
      current += 1;
    } else {
      current = 1;
    }
    best = Math.max(best, current);
  }

  return best;
}

function computeCurrentStreak(signIns: Record<string, SigninRecord>, todayKey: string) {
  const today = parseDateKey(todayKey)!;
  let cursor = today;
  if (!signIns[todayKey]) {
    cursor = addDays(cursor, -1);
  }

  let streak = 0;
  while (signIns[toDateKey(cursor)]) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return streak;
}

function getVariantClasses(style: CheckinStyle) {
  if (style === 'soft') {
    return {
      page: 'bg-rose-50/85',
      card: 'bg-white/92 border-stone-200',
      muted: 'text-stone-500',
      cell: 'bg-white',
    };
  }

  if (style === 'minimal') {
    return {
      page: 'bg-white',
      card: 'bg-stone-50 border-stone-200',
      muted: 'text-stone-500',
      cell: 'bg-white',
    };
  }

  return {
    page: 'bg-white/35 backdrop-blur-xl',
    card: 'bg-white/70 border-white/65',
    muted: 'text-stone-600',
    cell: 'bg-white/70',
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeSignIns(raw: unknown) {
  if (!isRecord(raw)) return {} as Record<string, SigninRecord>;
  const entries = Object.entries(raw).flatMap(([key, value]) => {
    if (!parseDateKey(key) || !isRecord(value)) return [];
    const timestamp = typeof value.timestamp === 'string' ? value.timestamp : '';
    if (!timestamp) return [];
    return [
      [
        key,
        {
          timestamp,
          mood: typeof value.mood === 'string' ? value.mood : '',
          note: typeof value.note === 'string' ? value.note : '',
        },
      ] as const,
    ];
  });
  return Object.fromEntries(entries);
}

function normalizeCheckinStore(raw: unknown): CheckinStore {
  if (!isRecord(raw)) return DEFAULT_STORE;

  return {
    signIns: normalizeSignIns(raw.signIns),
    style:
      raw.style === 'glass' || raw.style === 'soft' || raw.style === 'minimal'
        ? raw.style
        : DEFAULT_STORE.style,
    accentColor:
      typeof raw.accentColor === 'string' && raw.accentColor.trim()
        ? raw.accentColor
        : DEFAULT_STORE.accentColor,
  };
}

function mergeCheckinStores(current: CheckinStore, incoming: CheckinStore): CheckinStore {
  return {
    ...current,
    signIns: {
      ...current.signIns,
      ...incoming.signIns,
    },
  };
}

function downloadJsonFile(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(href);
}

function loadStore() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STORE;
    const parsed = JSON.parse(raw) as unknown;
    return normalizeCheckinStore(parsed);
  } catch {
    return DEFAULT_STORE;
  }
}

export function CheckinPage() {
  const [store, setStore] = useState<CheckinStore>(loadStore);
  const [viewMonth, setViewMonth] = useState(() => new Date());
  const [selectedMood, setSelectedMood] = useState(MOODS[0]!);
  const [noteDraft, setNoteDraft] = useState('');
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [checkinSettingsOpen, setCheckinSettingsOpen] = useState(false);
  const [checkinBackupBusy, setCheckinBackupBusy] = useState(false);
  const [checkinBackupStatus, setCheckinBackupStatus] = useState('');
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [checkinSettingsPanels, setCheckinSettingsPanels] = useState({
    backup: false,
    danger: false,
  });
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [signInPhrases, setSignInPhrases] = useState<string[]>(DEFAULT_SIGNIN_PHRASES);
  const [milestonePhrases, setMilestonePhrases] = useState<MilestonePhrases>(DEFAULT_MILESTONE_PHRASES);
  const [specialPopup, setSpecialPopup] = useState<SpecialPopupState | null>(null);
  const [chibiPoolVersion, setChibiPoolVersion] = useState(0);

  const today = new Date();
  const todayKey = toDateKey(today);
  const viewMonthKey = getMonthKey(viewMonth);
  const currentMonthKey = getMonthKey(today);
  const monthCells = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);
  const signInKeys = useMemo(() => Object.keys(store.signIns).sort(), [store.signIns]);
  const viewMonthSignedCount = useMemo(
    () => signInKeys.filter((key) => key.startsWith(viewMonthKey)).length,
    [signInKeys, viewMonthKey],
  );
  const currentMonthSignedCount = useMemo(
    () => signInKeys.filter((key) => key.startsWith(currentMonthKey)).length,
    [currentMonthKey, signInKeys],
  );
  const totalSignedCount = signInKeys.length;
  const currentStreak = useMemo(() => computeCurrentStreak(store.signIns, todayKey), [store.signIns, todayKey]);
  const longestStreak = useMemo(() => computeLongestStreak(signInKeys), [signInKeys]);
  const todaySigned = !!store.signIns[todayKey];
  const todayRecord = store.signIns[todayKey] ?? null;
  const variant = getVariantClasses(store.style);

  const currentMonthTotalDays = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const monthProgress = currentMonthTotalDays > 0 ? currentMonthSignedCount / currentMonthTotalDays : 0;
  const monthProgressPercent = Math.round(monthProgress * 100);

  const lastSevenDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const date = addDays(today, -(6 - index));
        const key = toDateKey(date);
        return {
          key,
          date,
          signed: !!store.signIns[key],
          isToday: key === todayKey,
        };
      }),
    [store.signIns, today, todayKey],
  );

  const selectedDateInfo = useMemo(() => {
    if (!selectedDateKey) return null;
    const signedRecord = store.signIns[selectedDateKey];
    return {
      dateKey: selectedDateKey,
      signedRecord,
      isFuture: selectedDateKey > todayKey,
    };
  }, [selectedDateKey, store.signIns, todayKey]);
  const chibiSources = useMemo(
    () => mergeUniqueStrings(CHECKIN_CHIBI_SOURCES, getActiveBaseChibiSources()),
    [chibiPoolVersion],
  );

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }, [store]);

  useEffect(() => {
    const handlePoolUpdate = () => setChibiPoolVersion((current) => current + 1);
    window.addEventListener(CHIBI_POOL_UPDATED_EVENT, handlePoolUpdate);
    return () => window.removeEventListener(CHIBI_POOL_UPDATED_EVENT, handlePoolUpdate);
  }, []);

  useEffect(() => {
    let active = true;
    const base = `${import.meta.env.BASE_URL ?? '/'}`.replace(/\/?$/, '/');

    async function loadPhrases() {
      try {
        const jsonResponse = await fetch(`${base}data/checkin/checkin_phrases.json`);
        if (jsonResponse.ok) {
          const json = (await jsonResponse.json()) as unknown;
          const parsed = parsePhrasePayload(json);
          if (active && parsed.length) {
            setSignInPhrases(parsed);
            return;
          }
        }
      } catch {
        // fallback to txt
      }

      try {
        const txtResponse = await fetch(`${base}data/checkin/checkin_phrases.txt`);
        if (!txtResponse.ok) return;
        const text = await txtResponse.text();
        const parsed = normalizePhraseList(text.split(/\r?\n/g));
        if (active && parsed.length) {
          setSignInPhrases(parsed);
        }
      } catch {
        // keep default phrases
      }
    }

    void loadPhrases();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const base = `${import.meta.env.BASE_URL ?? '/'}`.replace(/\/?$/, '/');
    const url = `${base}data/checkin/checkin_milestones.json`;

    void fetch(url)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!active || !payload) return;
        const parsed = parseMilestonePayload(payload);
        if (Object.keys(parsed).length) {
          setMilestonePhrases(parsed);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!specialPopup) return;
    const timer = window.setTimeout(() => setSpecialPopup(null), 4200);
    return () => window.clearTimeout(timer);
  }, [specialPopup]);

  function popFeedback(pool: string[]) {
    const text = randomPick(pool) ?? '';
    const chibiUrl = randomPick(chibiSources) ?? '';
    if (!text || !chibiUrl) return;
    setFeedback({ text, chibiUrl });
    window.setTimeout(() => {
      setFeedback((current) => (current?.text === text ? null : current));
    }, 3500);
  }

  function exportCheckinBackup() {
    if (checkinBackupBusy) return;
    setCheckinBackupBusy(true);
    setCheckinBackupStatus('匯出中…');
    try {
      const payload: CheckinBackupPayload = {
        kind: CHECKIN_BACKUP_KIND,
        version: CHECKIN_BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        store,
      };
      const date = new Date().toISOString().slice(0, 10);
      downloadJsonFile(`checkin-backup-${date}.json`, payload);
      setCheckinBackupStatus(`已匯出：${Object.keys(store.signIns).length} 筆打卡`);
    } catch {
      setCheckinBackupStatus('匯出失敗，請稍後重試');
    } finally {
      setCheckinBackupBusy(false);
    }
  }

  async function importCheckinBackup(mode: 'merge' | 'overwrite', file: File) {
    if (checkinBackupBusy) return;
    setCheckinBackupBusy(true);
    setCheckinBackupStatus(mode === 'overwrite' ? '覆蓋匯入中…' : '合併匯入中…');

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;

      let incomingStoreRaw: unknown = null;

      if (isRecord(parsed) && parsed.kind === CHECKIN_BACKUP_KIND && parsed.version === CHECKIN_BACKUP_VERSION) {
        incomingStoreRaw = parsed.store;
      } else if (
        isRecord(parsed) &&
        parsed.kind === 'memorial-big-backup-part' &&
        parsed.domain === 'aboutMe' &&
        parsed.part === 'checkin'
      ) {
        incomingStoreRaw = parsed.store;
      } else if (isRecord(parsed) && isRecord(parsed.signIns)) {
        incomingStoreRaw = parsed;
      } else {
        throw new Error('invalid');
      }

      const incomingStore = normalizeCheckinStore(incomingStoreRaw);
      if (mode === 'overwrite') {
        setStore(incomingStore);
      } else {
        setStore((current) => mergeCheckinStores(current, incomingStore));
      }

      setCheckinBackupStatus(
        mode === 'overwrite'
          ? `覆蓋匯入完成：${Object.keys(incomingStore.signIns).length} 筆`
          : `合併匯入完成：${Object.keys(incomingStore.signIns).length} 筆資料`,
      );
    } catch {
      setCheckinBackupStatus('匯入失敗：請確認 JSON 來源正確');
    } finally {
      setCheckinBackupBusy(false);
    }
  }

  function clearAllCheckins() {
    setStore((current) => ({
      ...current,
      signIns: {},
    }));
    setConfirmClearAll(false);
    setCheckinBackupStatus('已清除全部打卡紀錄');
  }

  function onSignToday() {
    if (todaySigned) return;
    const now = new Date().toISOString();

    setStore((current) => ({
      ...current,
      signIns: {
        ...current.signIns,
        [todayKey]: {
          timestamp: now,
          mood: selectedMood,
          note: noteDraft.trim(),
        },
      },
    }));
    setNoteDraft('');
    popFeedback(signInPhrases.length ? signInPhrases : DEFAULT_SIGNIN_PHRASES);

    const nextStreak = currentStreak + 1;
    const milestonePool = milestonePhrases[nextStreak] ?? DEFAULT_MILESTONE_PHRASES[nextStreak];
    if (milestonePool?.length) {
      const text = randomPick(milestonePool) ?? '';
      const chibiUrl = randomPick(chibiSources) ?? '';
      if (text && chibiUrl) {
        setSpecialPopup({
          title: `連續 ${nextStreak} 天`,
          text,
          chibiUrl,
        });
      }
    }
  }

  return (
    <div className={`mx-auto h-full w-full max-w-xl overflow-y-auto ${variant.page}`}>
      <div className="space-y-4 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
        <header className={`rounded-2xl border p-4 shadow-sm ${variant.card}`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1
                className="text-stone-900"
                style={{ fontSize: 'calc(var(--ui-header-title-size, 17px) + 7px)' }}
              >
                打卡簽到
              </h1>
            </div>
            <button
              type="button"
              onClick={() => setOverviewOpen(true)}
              className="rounded-xl border border-stone-300 bg-white/80 px-3 py-1.5 text-xs text-stone-700 transition active:scale-95"
            >
              總覽
            </button>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <MetricCard title="連續天數" value={String(currentStreak)} />
            <MetricCard title="本月已簽" value={String(currentMonthSignedCount)} />
            <MetricCard title="最長紀錄" value={String(longestStreak)} />
          </div>
        </header>

        <section className={`rounded-2xl border p-4 shadow-sm ${variant.card}`}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setViewMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
                className="grid h-8 w-8 place-items-center rounded-full border border-stone-300 bg-white/80 text-[18px] leading-none text-stone-700 transition active:scale-95"
                aria-label="上一月"
              >
                ‹
              </button>
              <p className="text-sm text-stone-800">{toMonthLabel(viewMonth)}</p>
              <button
                type="button"
                onClick={() => setViewMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
                className="grid h-8 w-8 place-items-center rounded-full border border-stone-300 bg-white/80 text-[18px] leading-none text-stone-700 transition active:scale-95"
                aria-label="下一月"
              >
                ›
              </button>
            </div>
            <button
              type="button"
              onClick={() => setViewMonth(new Date(today.getFullYear(), today.getMonth(), 1))}
              className="rounded-lg border border-stone-300 bg-white/80 px-2 py-1 text-xs text-stone-700 transition active:scale-95"
            >
              今天
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {WEEK_LABELS.map((label) => (
              <div key={label} className="py-1 text-center text-[10px] text-stone-500">
                {label}
              </div>
            ))}
            {monthCells.map((cell) => {
              const isToday = cell.key === todayKey;
              const signed = !!store.signIns[cell.key];
              const isPast = cell.key < todayKey;
              const isFuture = cell.key > todayKey;

              let cellBg = variant.cell;
              let cellText = 'text-stone-700';
              if (!cell.inMonth) {
                cellText = 'text-stone-400';
              }
              if (signed) {
                cellBg = 'bg-rose-100';
                cellText = 'text-rose-700';
              } else if (isPast && cell.inMonth) {
                cellBg = 'bg-stone-100';
              }

              return (
                <button
                  key={cell.key}
                  type="button"
                  onClick={() => setSelectedDateKey(cell.key)}
                  className={`relative rounded-xl border border-white/70 py-2 text-center text-xs transition active:scale-95 ${cellBg} ${cellText}`}
                  style={isToday ? { boxShadow: `0 0 0 1px ${store.accentColor} inset` } : undefined}
                >
                  <span>{cell.day}</span>
                  {signed && <span className="absolute bottom-1 right-1 text-[10px]">💋</span>}
                  {isFuture && <span className="absolute right-1 top-1 text-[9px] text-stone-400">·</span>}
                </button>
              );
            })}
          </div>

          <p className={`mt-3 text-xs ${variant.muted}`}>目前檢視月份已簽：{viewMonthSignedCount} 天</p>
        </section>

        <section className={`space-y-3 rounded-2xl border p-4 shadow-sm ${variant.card}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-stone-800">今天簽到</p>
              <p className={`text-xs ${variant.muted}`}>
                {todaySigned
                  ? `已完成：${new Date(todayRecord!.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                  : '還沒簽到'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCheckinSettingsOpen(true)}
              className="rounded-lg border border-stone-300 bg-white/85 px-2 py-1 text-sm text-stone-600 transition active:scale-95"
              aria-label="打卡設定與備份"
            >
              ⋯
            </button>
          </div>
          <label className="block space-y-1">
            <span className="text-xs text-stone-500">今天心情</span>
            <select
              value={selectedMood}
              onChange={(event) => setSelectedMood(event.target.value)}
              className="w-full rounded-xl border border-stone-300 bg-white/85 px-3 py-2 text-sm text-stone-800"
            >
              {MOODS.map((mood) => (
                <option key={mood} value={mood}>
                  {mood}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-stone-500">備註（選填）</span>
            <textarea
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.target.value)}
              rows={2}
              className="w-full resize-none rounded-xl border border-stone-300 bg-white/85 px-3 py-2 text-sm text-stone-800"
              placeholder="今天想記下的一句話..."
            />
          </label>
          <button
            type="button"
            onClick={onSignToday}
            disabled={todaySigned}
            className={`w-full rounded-xl px-4 py-2.5 text-sm text-white transition ${
              todaySigned ? 'cursor-not-allowed bg-stone-400/70' : 'active:scale-95'
            }`}
            style={!todaySigned ? { backgroundColor: store.accentColor } : undefined}
          >
            {todaySigned ? '今日已簽到' : '今日簽到'}
          </button>
        </section>
      </div>

      {feedback && (
        <div className="pointer-events-none fixed bottom-20 left-1/2 z-40 w-[min(92vw,24rem)] -translate-x-1/2">
          <div className={`flex items-center gap-3 rounded-2xl border p-3 shadow-lg ${variant.card}`}>
            <img
              src={feedback.chibiUrl}
              alt=""
              draggable={false}
              className="h-16 w-16 shrink-0 object-contain"
            />
            <p className="text-sm text-stone-800">{feedback.text}</p>
          </div>
        </div>
      )}

      {specialPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
          <div className="w-[min(92vw,34rem)] rounded-3xl border border-stone-300/95 bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-[0.12em] text-stone-500">Milestone</p>
              <button
                type="button"
                onClick={() => setSpecialPopup(null)}
                className="rounded-lg border border-stone-300 px-2 py-1 text-xs text-stone-600"
              >
                關閉
              </button>
            </div>
            <p className="text-xl text-stone-900">{specialPopup.title}</p>
            <div className="mt-4 flex items-center gap-4 rounded-2xl border border-stone-200 bg-stone-50 p-4">
              <img src={specialPopup.chibiUrl} alt="" draggable={false} className="h-20 w-20 shrink-0 object-contain" />
              <p className="whitespace-pre-line text-base leading-relaxed text-stone-700">{specialPopup.text}</p>
            </div>
          </div>
        </div>
      )}

      {checkinSettingsOpen && (
        <ModalFrame
          onClose={() => {
            setCheckinSettingsOpen(false);
            setConfirmClearAll(false);
          }}
          maxWidthClassName="max-w-md"
        >
          <p className="text-xs uppercase tracking-[0.14em] text-stone-500">Checkin Settings</p>
          <h3 className="mt-1 text-lg text-stone-900">打卡備份</h3>

          <div className="mt-3 space-y-2">
            <SettingsAccordion
              title="資料備份"
              subtitle="匯出、合併匯入、覆蓋匯入"
              isOpen={checkinSettingsPanels.backup}
              onToggle={() => setCheckinSettingsPanels((prev) => ({ ...prev, backup: !prev.backup }))}
              className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5"
              bodyClassName="mt-2 space-y-2"
            >
              <button
                type="button"
                onClick={exportCheckinBackup}
                disabled={checkinBackupBusy}
                className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-left transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="flex items-center gap-3">
                  <span className="w-6 text-center text-lg">📤</span>
                  <span className="flex-1">
                    <span className="block text-sm text-stone-700">匯出備份</span>
                    <span className="block text-[10.5px] text-stone-400">下載 JSON（可回復）</span>
                  </span>
                </span>
              </button>

              <label className="block w-full cursor-pointer rounded-xl border border-stone-200 bg-white px-4 py-3 transition active:scale-[0.98]">
                <span className="flex items-center gap-3">
                  <span className="w-6 text-center text-lg">📥</span>
                  <span className="flex-1">
                    <span className="block text-sm text-stone-700">匯入備份（合併）</span>
                    <span className="block text-[10.5px] text-stone-400">保留現有資料，加入新資料</span>
                  </span>
                </span>
                <input
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  disabled={checkinBackupBusy}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.currentTarget.value = '';
                    if (file) {
                      void importCheckinBackup('merge', file);
                    }
                  }}
                />
              </label>

              <label className="block w-full cursor-pointer rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 transition active:scale-[0.98]">
                <span className="flex items-center gap-3">
                  <span className="w-6 text-center text-lg">♻️</span>
                  <span className="flex-1">
                    <span className="block text-sm text-rose-700">匯入備份（覆蓋）</span>
                    <span className="block text-[10.5px] text-rose-400">用備份內容直接取代目前資料</span>
                  </span>
                </span>
                <input
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  disabled={checkinBackupBusy}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.currentTarget.value = '';
                    if (file) {
                      void importCheckinBackup('overwrite', file);
                    }
                  }}
                />
              </label>
              {checkinBackupStatus && <p className="px-1 text-xs text-stone-500">{checkinBackupStatus}</p>}
            </SettingsAccordion>

            <SettingsAccordion
              title="資料清理"
              subtitle="危險操作"
              isOpen={checkinSettingsPanels.danger}
              onToggle={() => setCheckinSettingsPanels((prev) => ({ ...prev, danger: !prev.danger }))}
              className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5"
              bodyClassName="mt-2"
            >
              <button
                type="button"
                onClick={() => {
                  if (confirmClearAll) {
                    clearAllCheckins();
                    return;
                  }
                  setConfirmClearAll(true);
                }}
                className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition active:scale-[0.98] ${
                  confirmClearAll
                    ? 'border-rose-400 bg-rose-50 text-rose-600'
                    : 'border-stone-200 bg-white text-stone-500'
                }`}
              >
                🗑️ {confirmClearAll ? '確定清除全部打卡？' : '清除全部打卡紀錄'}
              </button>
            </SettingsAccordion>
          </div>
        </ModalFrame>
      )}

      {selectedDateInfo && (
        <ModalFrame onClose={() => setSelectedDateKey(null)}>
          <p className="text-xs uppercase tracking-[0.14em] text-stone-500">{selectedDateInfo.dateKey}</p>
          <h3 className="mt-1 text-lg text-stone-900">當日紀錄</h3>

          <div className="mt-3 space-y-2 text-sm text-stone-700">
            <p>
              簽到：{selectedDateInfo.signedRecord ? '已簽到 💋' : selectedDateInfo.isFuture ? '尚未到日期' : '未簽到'}
            </p>
            {selectedDateInfo.signedRecord && (
              <>
                <p>時間：{new Date(selectedDateInfo.signedRecord.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                <p>心情：{selectedDateInfo.signedRecord.mood || '未填寫'}</p>
                {selectedDateInfo.signedRecord.note && <p>備註：{selectedDateInfo.signedRecord.note}</p>}
              </>
            )}
          </div>
        </ModalFrame>
      )}

      {overviewOpen && (
        <ModalFrame onClose={() => setOverviewOpen(false)} maxWidthClassName="max-w-md">
          <p className="text-xs uppercase tracking-[0.14em] text-stone-500">Checkin Overview</p>
          <h3 className="mt-1 text-lg text-stone-900">打卡總覽</h3>

          <div className="mt-3 space-y-3">
            <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2">
              <p className="text-xs text-stone-500">今日狀態</p>
              <p className="mt-1 text-sm text-stone-800">{todaySigned ? '已簽到 💋' : '未簽到'}</p>
              {todaySigned && todayRecord && (
                <div className="mt-1 space-y-1 text-xs text-stone-600">
                  <p>時間：{new Date(todayRecord.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                  <p>心情：{todayRecord.mood || '未填寫'}</p>
                  {!!todayRecord.note && <p>備註：{todayRecord.note}</p>}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2">
              <div className="flex items-center justify-between text-xs text-stone-500">
                <span>本月進度</span>
                <span>
                  {currentMonthSignedCount}/{currentMonthTotalDays}（{monthProgressPercent}%）
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-200">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${monthProgressPercent}%`,
                    backgroundColor: store.accentColor,
                  }}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <MetricCard title="目前連續" value={`${currentStreak} 天`} compact />
              <MetricCard title="最長連續" value={`${longestStreak} 天`} compact />
              <MetricCard title="累積簽到" value={`${totalSignedCount} 天`} compact />
            </div>

            <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2">
              <p className="text-xs text-stone-500">最近 7 日</p>
              <div className="mt-2 grid grid-cols-7 gap-1">
                {lastSevenDays.map((item) => (
                  <div key={item.key} className="text-center">
                    <div
                      className="grid h-8 place-items-center rounded-lg text-xs"
                      style={{
                        backgroundColor: item.signed ? `${store.accentColor}22` : '#e7e5e4',
                        color: item.signed ? '#be123c' : '#78716c',
                        boxShadow: item.isToday ? `0 0 0 1px ${store.accentColor} inset` : undefined,
                      }}
                    >
                      {item.signed ? '💋' : item.date.getDate()}
                    </div>
                    <p className="mt-1 text-[10px] text-stone-500">{item.date.getDate()}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-xs text-stone-500">頁面風格</p>
                <input
                  type="color"
                  value={store.accentColor}
                  onChange={(event) =>
                    setStore((current) => ({
                      ...current,
                      accentColor: event.target.value,
                    }))
                  }
                  className="h-8 w-12 cursor-pointer rounded border border-stone-300 bg-white"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { id: 'glass', label: '玻璃感' },
                  { id: 'soft', label: '柔和感' },
                  { id: 'minimal', label: '極簡風' },
                ] as const).map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() =>
                      setStore((current) => ({
                        ...current,
                        style: option.id,
                      }))
                    }
                    className={`rounded-xl border px-2 py-2 text-xs transition active:scale-95 ${
                      store.style === option.id
                        ? 'text-white'
                        : 'border-stone-300 bg-white text-stone-700'
                    }`}
                    style={
                      store.style === option.id
                        ? { backgroundColor: store.accentColor, borderColor: store.accentColor }
                        : undefined
                    }
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </ModalFrame>
      )}
    </div>
  );
}

function MetricCard({
  title,
  value,
  compact = false,
}: {
  title: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white/80 px-3 py-2 text-center">
      <p className="text-[11px] text-stone-500">{title}</p>
      <p className={`mt-0.5 text-stone-800 ${compact ? 'text-sm' : 'text-lg'}`}>{value}</p>
    </div>
  );
}

function ModalFrame({
  children,
  onClose,
  maxWidthClassName = 'max-w-sm',
}: {
  children: ReactNode;
  onClose: () => void;
  maxWidthClassName?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className={`w-full ${maxWidthClassName} max-h-[86vh] overflow-y-auto rounded-2xl border border-stone-300 bg-white p-4 shadow-xl`}>
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-stone-300 px-2 py-1 text-xs text-stone-600"
          >
            關閉
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
