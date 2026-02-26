import { useEffect, useMemo, useRef, useState, type TouchEvent } from 'react';
import { SettingsAccordion } from '../components/SettingsAccordion';
import { emitActionToast } from '../lib/actionToast';

// ─── Types ─────────────────────────────────────────────────────────────────────
type PeriodTab = 'overview' | 'calendar' | 'records';
type PeriodPanelStyle = 'soft' | 'glass' | 'minimal';

type PeriodRecord = {
  id: string;
  startDate: string;
  endDate: string;
  note: string;
  createdAt: string;
};

type PeriodStore = {
  records: PeriodRecord[];
  accentColor: string;
  panelStyle: PeriodPanelStyle;
  showChibi: boolean;
  periodChibiSize: number;
};

type CalendarCell = {
  key: string;
  day: number;
  inMonth: boolean;
};

type HoverPhraseMap = {
  period: string[];
  prePeriod: string[];
  ovulation: string[];
  safe: string[];
};

type ChibiPhraseMap = {
  pms: string[];
  menstrual: string[];
  ovulation: string[];
  recovery: string[];
};

type PostEndPopupState = {
  endDate: string;
  text: string;
  chibiUrl: string;
};

type PeriodBackupPayload = {
  kind: 'memorial-period-mini-backup';
  version: 1;
  exportedAt: string;
  store: PeriodStore;
  seenPostEndDates: string[];
};

// ─── Constants ─────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'memorial-period-diary-v1';
const POST_END_SEEN_KEY = 'memorial-period-post-end-seen-v1';
const PERIOD_BACKUP_KIND = 'memorial-period-mini-backup';
const PERIOD_BACKUP_VERSION = 1;
const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六'] as const;

const C = {
  bg:          '#fdf7f4',
  period:      '#e5738a',
  predicted:   '#f5c0cc',
  fertile:     '#c5e8d4',
  ovulation:   '#f5b849',
  today:       '#1c1917',
  accent:      '#d4607a',
  accentMid:   '#c45070',
  fertileText: '#2a6048',
} as const;

const DEFAULT_HOVER_PHRASES: HoverPhraseMap = {
  period: ['今天先慢慢來，我陪妳。', '辛苦了，今天多休息一點。', '抱抱，今天不要太逞強。'],
  prePeriod: ['快到那幾天了，記得先照顧自己。', '我在，今天先放慢一點。'],
  ovulation: ['今天狀態看起來不錯。', '今天的妳很有光。'],
  safe: ['今天也是平穩的一天。', '我在這裡，陪妳過日子。'],
};
const DEFAULT_CHIBI_PHRASES: ChibiPhraseMap = {
  pms: [
    '有點焦躁是正常的，深呼吸。',
    '胸口有點重？先喝杯熱茶。',
    '今天想哭就哭，沒有理由也沒關係。',
    '有點累是真的，不用硬撐。',
  ],
  menstrual: [
    '子宮很努力，你也是。',
    '今天能躺著就不坐著。',
    '喝熱水、喝熱水、喝熱水。',
    '今天對自己溫柔一點。',
  ],
  ovulation: [
    '今天特別有活力是真的！',
    '排卵期的你最有光彩。',
    '今天適合做讓自己開心的事。',
    '身體在說 yes，你也說 yes 吧。',
  ],
  recovery: [
    '慢慢恢復中，不用急。',
    '最難的部分已經過去了。',
    '身體謝謝你這個月的陪伴。',
    '你每次都撐過來了，這次也是。',
  ],
};
const DEFAULT_POST_END_PHRASES = [
  '這一輪辛苦了，收工抱抱。',
  '經期結束了，今天多補一點元氣。',
  '這次也平安走過來了，妳很棒。',
];
const PERIOD_TAB_ORDER: PeriodTab[] = ['overview', 'calendar', 'records'];
const PERIOD_SWIPE_THRESHOLD = 52;

const PANEL_STYLE_OPTIONS: Array<{ id: PeriodPanelStyle; label: string }> = [
  { id: 'soft', label: '柔和' },
  { id: 'glass', label: '玻璃' },
  { id: 'minimal', label: '果凍' },
];

const PANEL_STYLE_THEME: Record<
  PeriodPanelStyle,
  {
    pageBg: string;
    headerBg: string;
    cardBg: string;
    cardBorder: string;
    cardShadow: string;
    mutedCardBg: string;
  }
> = {
  soft: {
    pageBg: C.bg,
    headerBg: C.bg,
    cardBg: 'rgba(255,255,255,0.72)',
    cardBorder: 'rgba(255,255,255,0.9)',
    cardShadow: '0 2px 12px rgba(0,0,0,0.05)',
    mutedCardBg: 'rgba(255,255,255,0.55)',
  },
  glass: {
    pageBg: 'radial-gradient(120% 120% at 0% 0%, #fff2f7 0%, #eff6ff 52%, #f5fbff 100%)',
    headerBg: 'linear-gradient(140deg, rgba(255,255,255,0.78), rgba(244,250,255,0.62))',
    cardBg: 'linear-gradient(145deg, rgba(255,255,255,0.6), rgba(255,255,255,0.34))',
    cardBorder: 'rgba(255,255,255,0.94)',
    cardShadow: 'inset 0 1px 0 rgba(255,255,255,0.95), 0 16px 34px rgba(15,23,42,0.16), 0 6px 14px rgba(255,255,255,0.28)',
    mutedCardBg: 'linear-gradient(160deg, rgba(255,255,255,0.52), rgba(255,255,255,0.32))',
  },
  minimal: {
    pageBg: 'radial-gradient(120% 140% at 10% 0%, #f2f8ff 0%, #fff6fb 48%, #f7f9ff 100%)',
    headerBg: 'linear-gradient(145deg, rgba(255,255,255,0.78), rgba(232,244,255,0.58))',
    cardBg: 'linear-gradient(150deg, rgba(255,255,255,0.74), rgba(238,248,255,0.42))',
    cardBorder: 'rgba(214,236,255,0.92)',
    cardShadow: 'inset 0 1px 0 rgba(255,255,255,0.95), 0 14px 34px rgba(56,74,112,0.18), 0 6px 12px rgba(255,255,255,0.42)',
    mutedCardBg: 'linear-gradient(160deg, rgba(255,255,255,0.66), rgba(234,246,255,0.48))',
  },
};

const DEFAULT_STORE: PeriodStore = {
  records: [],
  accentColor: C.period,
  panelStyle: 'soft',
  showChibi: true,
  periodChibiSize: 168,
};

// ─── Chibi sources ─────────────────────────────────────────────────────────────
const PERIOD_CHIBI_MODULES = import.meta.glob(
  '../../public/period-chibi/*.{png,jpg,jpeg,webp,avif}',
  { eager: true, import: 'default' },
) as Record<string, string>;

const PERIOD_CHIBI_SOURCES = Object.entries(PERIOD_CHIBI_MODULES)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, url]) => url);

// ─── Utilities ─────────────────────────────────────────────────────────────────
function toDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDateKey(value: string) {
  const matched = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matched) return null;
  const [, y, m, d] = matched.map(Number);
  const parsed = new Date(y!, m! - 1, d!);
  if (
    parsed.getFullYear() !== y ||
    parsed.getMonth() !== m! - 1 ||
    parsed.getDate() !== d
  ) return null;
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function randomPick<T>(items: T[]): T | null {
  if (!items.length) return null;
  return items[Math.floor(Math.random() * items.length)]!;
}

function hashSeed(seed: string) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pickBySeed<T>(items: T[], seed: string): T | null {
  if (!items.length) return null;
  const index = hashSeed(seed) % items.length;
  return items[index]!;
}

function toMonthLabel(date: Date) {
  return `${date.getFullYear()}年 ${date.getMonth() + 1}月`;
}

function toMonthInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function parseMonthInputValue(value: string) {
  const matched = value.match(/^(\d{4})-(\d{2})$/);
  if (!matched) return null;
  const year = Number(matched[1]);
  const month = Number(matched[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  return new Date(year, month - 1, 1);
}

function toMonthDayLabel(dateKey: string) {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return 'MM/DD';
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${month}/${day}`;
}

// ─── Data helpers ──────────────────────────────────────────────────────────────
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizePeriodRecords(records: unknown): PeriodRecord[] {
  if (!Array.isArray(records)) return [];

  const normalized: PeriodRecord[] = [];
  const seen = new Set<string>();

  records.forEach((item, index) => {
    if (!isRecord(item)) return;
    const startDate = typeof item.startDate === 'string' ? item.startDate : '';
    const endDate = typeof item.endDate === 'string' ? item.endDate : '';
    const note = typeof item.note === 'string' ? item.note : '';
    const createdAt = typeof item.createdAt === 'string' && item.createdAt.trim() ? item.createdAt : new Date().toISOString();

    const s = parseDateKey(startDate);
    const e = parseDateKey(endDate);
    if (!s || !e || dayDiff(s, e) < 0) return;

    const idRaw = typeof item.id === 'string' && item.id.trim() ? item.id : `${startDate}-${createdAt}-${index}`;
    if (seen.has(idRaw)) return;
    seen.add(idRaw);

    normalized.push({
      id: idRaw,
      startDate,
      endDate,
      note,
      createdAt,
    });
  });

  return normalized.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

function normalizePeriodStore(input: unknown): PeriodStore {
  if (!isRecord(input)) {
    return DEFAULT_STORE;
  }

  const accentColor =
    typeof input.accentColor === 'string' && input.accentColor.trim()
      ? input.accentColor
      : DEFAULT_STORE.accentColor;

  const panelStyle: PeriodPanelStyle =
    input.panelStyle === 'glass' || input.panelStyle === 'minimal' || input.panelStyle === 'soft'
      ? input.panelStyle
      : DEFAULT_STORE.panelStyle;
  const showChibi = input.showChibi !== false;

  const periodChibiSize =
    typeof input.periodChibiSize === 'number' && Number.isFinite(input.periodChibiSize)
      ? clamp(input.periodChibiSize, 120, 220)
      : DEFAULT_STORE.periodChibiSize;

  return {
    records: normalizePeriodRecords(input.records),
    accentColor,
    panelStyle,
    showChibi,
    periodChibiSize,
  };
}

function loadStore(): PeriodStore {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STORE;
    const parsed = JSON.parse(raw) as unknown;
    return normalizePeriodStore(parsed);
  } catch {
    return DEFAULT_STORE;
  }
}

function normalizeRecords(records: PeriodRecord[]) {
  return normalizePeriodRecords(records);
}

function normalizeSeenPostEndDates(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  input.forEach((item) => {
    if (typeof item !== 'string' || !parseDateKey(item) || seen.has(item)) return;
    seen.add(item);
  });
  return Array.from(seen);
}

function mergePeriodStores(current: PeriodStore, incoming: PeriodStore): PeriodStore {
  const records = normalizePeriodRecords([...current.records, ...incoming.records]);
  return {
    ...current,
    records,
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

function calcPrediction(records: PeriodRecord[]) {
  const completed = normalizeRecords(records);
  if (!completed.length) {
    return {
      completed,
      avgCycleLength: 28,
      avgDuration: 5,
      nextStartKey: '',
      nextEndKey: '',
      predictedStarts: [] as string[],
    };
  }

  const durations = completed.map((r) => {
    const s = parseDateKey(r.startDate)!;
    const e = parseDateKey(r.endDate)!;
    return dayDiff(s, e) + 1;
  });
  const avgDuration = clamp(
    Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
    3, 10,
  );

  const cycleDiffs: number[] = [];
  for (let i = 1; i < completed.length; i++) {
    const prev = parseDateKey(completed[i - 1]!.startDate)!;
    const curr = parseDateKey(completed[i]!.startDate)!;
    const diff = dayDiff(prev, curr);
    if (diff >= 15 && diff <= 60) cycleDiffs.push(diff);
  }
  const avgCycleLength = cycleDiffs.length
    ? clamp(Math.round(cycleDiffs.reduce((a, b) => a + b, 0) / cycleDiffs.length), 21, 40)
    : 28;

  const lastStart = parseDateKey(completed[completed.length - 1]!.startDate)!;
  const predictedStarts: string[] = [];
  for (let i = 1; i <= 6; i++) {
    predictedStarts.push(toDateKey(addDays(lastStart, avgCycleLength * i)));
  }

  const nextStart = addDays(lastStart, avgCycleLength);
  const nextEnd = addDays(nextStart, avgDuration - 1);

  return {
    completed,
    avgCycleLength,
    avgDuration,
    nextStartKey: toDateKey(nextStart),
    nextEndKey: toDateKey(nextEnd),
    predictedStarts,
  };
}

function buildMonthGrid(viewMonth: Date): CalendarCell[] {
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const first = new Date(year, month, 1);
  const firstWeekday = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: CalendarCell[] = [];

  for (let i = firstWeekday; i > 0; i--) {
    const date = addDays(first, -i);
    cells.push({ key: toDateKey(date), day: date.getDate(), inMonth: false });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    cells.push({ key: toDateKey(date), day, inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const date = addDays(parseDateKey(cells[cells.length - 1]!.key)!, 1);
    cells.push({ key: toDateKey(date), day: date.getDate(), inMonth: false });
  }
  return cells;
}

function loadHoverPhrasesFromRaw(raw: unknown): HoverPhraseMap | null {
  const normalizeText = (value: string) => value.replace(/\/n/g, '\n').replace(/\\n/g, '\n').trim();

  if (Array.isArray(raw)) {
    const values = raw
      .filter((i): i is string => typeof i === 'string')
      .map(normalizeText)
      .filter((i) => i.length > 0);
    if (!values.length) return null;
    return { ...DEFAULT_HOVER_PHRASES, period: values };
  }
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Partial<Record<keyof HoverPhraseMap, unknown>>;
  const next: HoverPhraseMap = { ...DEFAULT_HOVER_PHRASES };
  for (const key of Object.keys(next) as Array<keyof HoverPhraseMap>) {
    const val = src[key];
    if (!Array.isArray(val)) continue;
    const rows = val
      .filter((i): i is string => typeof i === 'string')
      .map(normalizeText)
      .filter((i) => i.length > 0);
    if (rows.length) next[key] = rows;
  }
  return next;
}

function loadChibiPhrasesFromRaw(raw: unknown): ChibiPhraseMap | null {
  if (!raw || typeof raw !== 'object') return null;
  const normalizeText = (value: string) => value.replace(/\/n/g, '\n').replace(/\\n/g, '\n').trim();
  const src = raw as Partial<Record<keyof ChibiPhraseMap, unknown>>;
  const next: ChibiPhraseMap = { ...DEFAULT_CHIBI_PHRASES };

  for (const key of Object.keys(next) as Array<keyof ChibiPhraseMap>) {
    const val = src[key];
    if (!Array.isArray(val)) continue;
    const rows = val
      .filter((i): i is string => typeof i === 'string')
      .map(normalizeText)
      .filter((i) => i.length > 0);
    if (rows.length) next[key] = rows;
  }

  return next;
}

function loadPostEndPhrasesFromRaw(raw: unknown): string[] {
  const normalizeText = (value: string) => value.replace(/\/n/g, '\n').replace(/\\n/g, '\n').trim();

  if (Array.isArray(raw)) {
    return raw
      .filter((i): i is string => typeof i === 'string')
      .map(normalizeText)
      .filter((i) => i.length > 0);
  }

  if (raw && typeof raw === 'object') {
    const phrases = (raw as { phrases?: unknown }).phrases;
    if (Array.isArray(phrases)) {
      return phrases
        .filter((i): i is string => typeof i === 'string')
        .map(normalizeText)
        .filter((i) => i.length > 0);
    }
  }

  return [];
}

function loadSeenPostEndDates() {
  try {
    const raw = window.localStorage.getItem(POST_END_SEEN_KEY);
    if (!raw) return new Set<string>();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set<string>();
    const dates = parsed.filter((item): item is string => typeof item === 'string' && !!parseDateKey(item));
    return new Set(dates);
  } catch {
    return new Set<string>();
  }
}

function markPostEndDateSeen(endDate: string) {
  const seen = loadSeenPostEndDates();
  if (seen.has(endDate)) return;
  seen.add(endDate);
  window.localStorage.setItem(POST_END_SEEN_KEY, JSON.stringify(Array.from(seen)));
}

function pickPhraseByDate(
  dateKey: string,
  actualSet: Set<string>,
  nextStartKey: string,
  ovulStart: string,
  ovulEnd: string,
  pool: HoverPhraseMap,
): string {
  const date = parseDateKey(dateKey);
  if (!date) return pickBySeed(pool.safe, `period-safe:${dateKey}`) ?? '';

  if (actualSet.has(dateKey)) return pickBySeed(pool.period, `period-actual:${dateKey}`) ?? '';

  if (nextStartKey) {
    const nextDate = parseDateKey(nextStartKey);
    if (nextDate) {
      const gap = dayDiff(date, nextDate);
      if (gap >= 1 && gap <= 3) return pickBySeed(pool.prePeriod, `period-pre:${dateKey}`) ?? '';
    }
  }

  if (ovulStart && ovulEnd && dateKey >= ovulStart && dateKey <= ovulEnd) {
    return pickBySeed(pool.ovulation, `period-ovul:${dateKey}`) ?? '';
  }

  return pickBySeed(pool.safe, `period-safe:${dateKey}`) ?? '';
}

// Phase → periodPhrases key mapping
function phaseToPhraseKey(phase: string): keyof ChibiPhraseMap {
  if (phase === '經期中') return 'menstrual';
  if (phase === '經前期') return 'pms';
  if (phase === '排卵窗') return 'ovulation';
  return 'recovery';
}

// ─── SpeechBubble ──────────────────────────────────────────────────────────────
function SpeechBubble({ phrase }: { phrase: string }) {
  return (
    <div
      className="relative max-w-[11.5rem] rounded-2xl bg-white px-3 py-2.5"
      style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }}
    >
      {/* Phase phrase */}
      <p className="text-[12px] leading-snug text-stone-600">{phrase}</p>
      {/* Tail — bottom-left, toward chibi */}
      <div
        className="absolute -bottom-[7px] right-5"
        style={{
          width: 0, height: 0,
          borderLeft: '7px solid transparent',
          borderRight: '7px solid transparent',
          borderTop: '7px solid white',
        }}
      />
    </div>
  );
}

// ─── FloatingChibi ────────────────────────────────────────────────────────────
function FloatingChibi({
  chibiSrc,
  phrase,
  sizePx,
  onClickSettings,
}: {
  chibiSrc: string;
  phrase: string;
  sizePx: number;
  onClickSettings: () => void;
}) {
  const safeSize = clamp(sizePx, 120, 220);
  const fallbackHeight = Math.round(safeSize * 0.86);
  return (
    <div
      className="pointer-events-none absolute bottom-[42px] right-2 z-20 flex flex-col items-end gap-2 sm:right-3"
    >
      {/* Bubble */}
      <div className="pointer-events-auto">
        <SpeechBubble phrase={phrase} />
      </div>

      {/* Chibi */}
      <button
        type="button"
        onClick={onClickSettings}
        className="pointer-events-auto transition active:scale-90"
        aria-label="面板風格"
      >
        {chibiSrc ? (
          <img
            src={chibiSrc}
            alt=""
            draggable={false}
            className="select-none drop-shadow-md"
            style={{ width: safeSize, height: 'auto' }}
          />
        ) : (
          <div
            className="flex items-center justify-center rounded-2xl text-4xl drop-shadow-md"
            style={{
              width: safeSize,
              height: fallbackHeight,
              background: 'linear-gradient(145deg,#fde9d7,#f0ddd0)',
            }}
          >
            🧸
          </div>
        )}
      </button>
    </div>
  );
}

// ─── DateSheet ────────────────────────────────────────────────────────────────
function DateSheet({
  dateKey,
  isActual,
  phrase,
  onMarkStart,
  onMarkEnd,
  onClear,
  onClose,
}: {
  dateKey: string;
  isActual: boolean;
  phrase: string;
  onMarkStart: () => void;
  onMarkEnd: () => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const parsed = parseDateKey(dateKey);
  const diffDays = parsed ? dayDiff(new Date(), parsed) : 0;
  const diffLabel =
    diffDays === 0 ? '今天'
    : diffDays > 0 ? `距今 ${diffDays} 天後`
    : `${Math.abs(diffDays)} 天前`;

  const parts = dateKey.split('-');
  const displayDate = parts.length === 3 ? `${parts[0]} / ${parts[1]} / ${parts[2]}` : dateKey;

  return (
    <>
      {/* Backdrop */}
      <div
        className="absolute inset-0 z-30 rounded-[44px]"
        style={{ background: 'rgba(0,0,0,0.28)' }}
        onClick={onClose}
      />
      {/* Sheet */}
      <div
        className="absolute bottom-0 left-0 right-0 z-40 rounded-t-3xl px-5 pb-8 pt-3.5"
        style={{ background: 'white', boxShadow: '0 -6px 28px rgba(0,0,0,0.12)' }}
      >
        {/* Handle */}
        <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-stone-300" />

        {/* Date display */}
        <div
          className="mb-5 border-b pb-4 text-center"
          style={{ borderColor: '#f4f3f2' }}
        >
          <p className="mb-1 text-[11px] uppercase tracking-[0.12em] text-stone-400">選擇的日期</p>
          <p className="text-[22px] font-bold tracking-[-0.5px]" style={{ color: C.today }}>
            {displayDate}
          </p>
          <p className="mt-1 text-[11px] text-stone-400">{diffLabel}</p>
          {!!phrase && (
            <p className="mt-2 text-[11px] italic text-stone-400">「{phrase}」</p>
          )}
        </div>

        {/* Actions */}
        <button
          type="button"
          onClick={onMarkStart}
          className="mb-2 w-full rounded-2xl border p-3 text-left text-sm font-medium transition active:scale-[0.98]"
          style={{ background: '#fde4ec', color: C.accent, borderColor: 'rgba(212,96,122,0.18)' }}
        >
          🩸 記錄為月經開始日
        </button>
        <button
          type="button"
          onClick={onMarkEnd}
          className="mb-2 w-full rounded-2xl p-3 text-left text-sm transition active:scale-[0.98]"
          style={{ background: '#f5f5f4', color: '#44403c' }}
        >
          ✓ 記錄為月經結束日
        </button>
        {isActual && (
          <button
            type="button"
            onClick={onClear}
            className="mb-2 w-full rounded-2xl border p-3 text-left text-sm transition active:scale-[0.98]"
            style={{ background: 'white', color: '#b8b0a8', borderColor: '#e7e5e4' }}
          >
            🗑️ 清除此日期的標記
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-2xl p-3 text-sm text-stone-400 transition active:scale-[0.98]"
        >
          取消
        </button>
      </div>
    </>
  );
}

// ─── PeriodSettingsSheet ──────────────────────────────────────────────────────
function PeriodSettingsSheet({
  panelStyle,
  onPanelStyleChange,
  showChibi,
  onToggleChibi,
  chibiSize,
  onChibiSizeChange,
  backupBusy,
  backupStatus,
  onExportBackup,
  onImportBackup,
  onClearAll,
  onClose,
}: {
  panelStyle: PeriodPanelStyle;
  onPanelStyleChange: (style: PeriodPanelStyle) => void;
  showChibi: boolean;
  onToggleChibi: () => void;
  chibiSize: number;
  onChibiSizeChange: (size: number) => void;
  backupBusy: boolean;
  backupStatus: string;
  onExportBackup: () => void;
  onImportBackup: (mode: 'merge' | 'overwrite', file: File) => void;
  onClearAll: () => void;
  onClose: () => void;
}) {
  const [openPanels, setOpenPanels] = useState({
    style: false,
    chibi: false,
    backup: false,
    danger: false,
  });

  return (
    <>
      <div
        className="absolute inset-0 z-30 rounded-[44px]"
        style={{ background: 'rgba(0,0,0,0.28)' }}
        onClick={onClose}
      />
      <div
        className="absolute bottom-0 left-0 right-0 z-40 rounded-t-3xl px-5 pb-10 pt-3.5"
        style={{ background: 'white', boxShadow: '0 -6px 28px rgba(0,0,0,0.12)' }}
      >
        <div className="mx-auto mb-5 h-1 w-9 rounded-full bg-stone-300" />
        <p className="mb-5 text-center text-base font-semibold text-stone-800">面板風格</p>

        <div className="space-y-2">
          <SettingsAccordion
            title="面板風格"
            subtitle="總覽卡片視覺"
            isOpen={openPanels.style}
            onToggle={() => setOpenPanels((prev) => ({ ...prev, style: !prev.style }))}
            className="rounded-2xl bg-stone-50 p-4"
          >
            <div className="grid grid-cols-3 gap-2">
              {PANEL_STYLE_OPTIONS.map((option) => {
                const active = option.id === panelStyle;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => onPanelStyleChange(option.id)}
                    className="rounded-xl border px-2 py-2 text-xs transition active:scale-95"
                    style={{
                      background: active ? '#fde4ec' : '#fff',
                      color: active ? C.accent : '#57534e',
                      borderColor: active ? 'rgba(212,96,122,0.24)' : '#e7e5e4',
                      fontWeight: active ? 600 : 400,
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[10px] text-stone-400">統計資訊在「總覽」頁查看。</p>
          </SettingsAccordion>

          <SettingsAccordion
            title="M"
            subtitle="顯示與大小"
            isOpen={openPanels.chibi}
            onToggle={() => setOpenPanels((prev) => ({ ...prev, chibi: !prev.chibi }))}
            className="rounded-2xl bg-stone-50 p-4"
          >
            <div className="mb-2.5 flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white px-3 py-2.5">
              <p className="text-xs text-stone-600">M</p>
              <button
                type="button"
                onClick={onToggleChibi}
                className="relative h-6 w-10 rounded-full transition"
                style={{ background: showChibi ? '#8a6a4e' : '#bcb7b0' }}
                aria-label="切換M顯示"
              >
                <span
                  className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all"
                  style={{ left: showChibi ? 18 : 2 }}
                />
              </button>
            </div>

            <input
              type="range"
              min={120}
              max={220}
              step={1}
              value={chibiSize}
              onChange={(event) => onChibiSizeChange(Number(event.target.value))}
              className="w-full accent-stone-700"
            />
          </SettingsAccordion>

          <SettingsAccordion
            title="資料備份"
            subtitle="匯出、合併匯入、覆蓋匯入"
            isOpen={openPanels.backup}
            onToggle={() => setOpenPanels((prev) => ({ ...prev, backup: !prev.backup }))}
            className="rounded-2xl bg-stone-50 p-4"
          >
            <button
              type="button"
              onClick={onExportBackup}
              disabled={backupBusy}
              className="mb-2 w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-left transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="flex items-center gap-3">
                <span className="w-6 text-center text-lg">📤</span>
                <span className="flex-1">
                  <span className="block text-sm text-stone-700">匯出備份</span>
                  <span className="block text-[10.5px] text-stone-400">下載 JSON（可回復）</span>
                </span>
              </span>
            </button>

            <label className="mb-2 block w-full cursor-pointer rounded-xl border border-stone-200 bg-white px-4 py-3 transition active:scale-[0.98]">
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
                disabled={backupBusy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.currentTarget.value = '';
                  if (file) onImportBackup('merge', file);
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
                disabled={backupBusy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.currentTarget.value = '';
                  if (file) onImportBackup('overwrite', file);
                }}
              />
            </label>

            {backupStatus && <p className="mt-2 text-xs text-stone-500">{backupStatus}</p>}
          </SettingsAccordion>

          <SettingsAccordion
            title="資料清理"
            subtitle="危險操作"
            isOpen={openPanels.danger}
            onToggle={() => setOpenPanels((prev) => ({ ...prev, danger: !prev.danger }))}
            className="rounded-2xl bg-stone-50 p-4"
          >
            <button
              type="button"
              onClick={onClearAll}
              className="w-full rounded-2xl border p-3 text-sm transition active:scale-[0.98]"
              style={{ background: 'white', color: '#b8b0a8', borderColor: '#e7e5e4' }}
            >
              🗑️ 清除所有紀錄
            </button>
          </SettingsAccordion>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full rounded-2xl p-3 text-sm text-stone-400 transition active:scale-[0.98]"
        >
          關閉
        </button>
      </div>
    </>
  );
}

// ─── PeriodPage ────────────────────────────────────────────────────────────────
export function PeriodPage({ onExit = () => {} }: { onExit?: () => void }) {
  const [store, setStore] = useState<PeriodStore>(loadStore);
  const [activeTab, setActiveTab] = useState<PeriodTab>('overview');
  const [viewMonth, setViewMonth] = useState(() => new Date());
  const [startDraft, setStartDraft] = useState('');
  const [endDraft, setEndDraft] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [statusText, setStatusText] = useState('');
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [showPeriodSettings, setShowPeriodSettings] = useState(false);
  const [periodBackupBusy, setPeriodBackupBusy] = useState(false);
  const [periodBackupStatus, setPeriodBackupStatus] = useState('');
  const [hoverPhrases, setHoverPhrases] = useState<HoverPhraseMap>(DEFAULT_HOVER_PHRASES);
  const [chibiPhrases, setChibiPhrases] = useState<ChibiPhraseMap>(DEFAULT_CHIBI_PHRASES);
  const [postEndPhrases, setPostEndPhrases] = useState<string[]>(DEFAULT_POST_END_PHRASES);
  const [postEndPopup, setPostEndPopup] = useState<PostEndPopupState | null>(null);
  const chibiSources = PERIOD_CHIBI_SOURCES;
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const panelTheme = PANEL_STYLE_THEME[store.panelStyle];
  const panelFilterFx =
    store.panelStyle === 'glass'
      ? {
          backdropFilter: 'blur(16px) saturate(145%)',
          WebkitBackdropFilter: 'blur(16px) saturate(145%)',
        }
      : store.panelStyle === 'minimal'
        ? {
            backdropFilter: 'blur(12px) saturate(165%)',
            WebkitBackdropFilter: 'blur(12px) saturate(165%)',
          }
      : {};
  const panelCardStyle = {
    background: panelTheme.cardBg,
    borderColor: panelTheme.cardBorder,
    boxShadow: panelTheme.cardShadow,
    ...panelFilterFx,
  };
  const panelMutedCardStyle = {
    background: panelTheme.mutedCardBg,
    borderColor: panelTheme.cardBorder,
    ...panelFilterFx,
  };

  const today = new Date();
  const todayKey = toDateKey(today);
  const chibiSrc = useMemo(() => pickBySeed(chibiSources, `period-chibi:${todayKey}`) ?? '', [chibiSources, todayKey]);
  const hidePeriodChibi = !store.showChibi || !chibiSrc;
  const monthInputValue = toMonthInputValue(viewMonth);
  const monthCells = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);

  function handleMonthPickerChange(value: string) {
    const parsed = parseMonthInputValue(value);
    if (!parsed) return;
    setViewMonth(parsed);
    setSelectedDateKey(null);
  }

  // Persist store
  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }, [store]);

  // Load custom hover phrases
  useEffect(() => {
    let active = true;
    const base = import.meta.env.BASE_URL ?? '/';
    const url = `${base.replace(/\/?$/, '/')}data/period/period_hover_phrases.json`;
    void fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!active || !json) return;
        const parsed = loadHoverPhrasesFromRaw(json);
        if (parsed) setHoverPhrases(parsed);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  // Load special phrase after period end
  useEffect(() => {
    let active = true;
    const base = import.meta.env.BASE_URL ?? '/';
    const url = `${base.replace(/\/?$/, '/')}data/period/period_post_end_phrases.json`;
    void fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!active || !json) return;
        const parsed = loadPostEndPhrasesFromRaw(json);
        if (parsed.length) setPostEndPhrases(parsed);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Load custom chibi phrases
  useEffect(() => {
    let active = true;
    const base = import.meta.env.BASE_URL ?? '/';
    const url = `${base.replace(/\/?$/, '/')}data/period/period_chibi_phrases.json`;
    void fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!active || !json) return;
        const parsed = loadChibiPhrasesFromRaw(json);
        if (parsed) setChibiPhrases(parsed);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Prediction
  const { completed, avgCycleLength, avgDuration, nextStartKey, predictedStarts } =
    useMemo(() => calcPrediction(store.records), [store.records]);

  // Actual period day set
  const actualPeriodSet = useMemo(() => {
    const set = new Set<string>();
    for (const r of completed) {
      const s = parseDateKey(r.startDate)!;
      const e = parseDateKey(r.endDate)!;
      for (let offset = 0; offset <= dayDiff(s, e); offset++) {
        set.add(toDateKey(addDays(s, offset)));
      }
    }
    return set;
  }, [completed]);

  // Predicted period day set
  const predictedPeriodSet = useMemo(() => {
    const set = new Set<string>();
    for (const startKey of predictedStarts) {
      const startDate = parseDateKey(startKey);
      if (!startDate) continue;
      for (let offset = 0; offset < avgDuration; offset++) {
        set.add(toDateKey(addDays(startDate, offset)));
      }
    }
    return set;
  }, [avgDuration, predictedStarts]);

  // Ovulation window
  const ovulationWindow = useMemo(() => {
    if (!nextStartKey) return { start: '', end: '', peak: '' };
    const nextDate = parseDateKey(nextStartKey);
    if (!nextDate) return { start: '', end: '', peak: '' };
    const peak = addDays(nextDate, -14);
    return {
      start: toDateKey(addDays(peak, -2)),
      end: toDateKey(addDays(peak, 2)),
      peak: toDateKey(peak),
    };
  }, [nextStartKey]);

  // Today phase
  const todayPhase = useMemo(() => {
    if (actualPeriodSet.has(todayKey)) return '經期中';
    if (nextStartKey) {
      const nextDate = parseDateKey(nextStartKey);
      if (nextDate && dayDiff(today, nextDate) >= 1 && dayDiff(today, nextDate) <= 3) return '經前期';
    }
    if (ovulationWindow.start && ovulationWindow.end &&
        todayKey >= ovulationWindow.start && todayKey <= ovulationWindow.end) return '排卵窗';
    return '平穩期';
  }, [actualPeriodSet, nextStartKey, ovulationWindow, today, todayKey]);

  // Days until next
  const daysUntilNext = useMemo(() => {
    const nextDate = parseDateKey(nextStartKey);
    return nextDate ? dayDiff(today, nextDate) : null;
  }, [nextStartKey, today]);

  // Chibi bubble content (from periodPhrases.ts)
  const chibiPhrase = useMemo(() => {
    const key = phaseToPhraseKey(todayPhase);
    return pickBySeed(chibiPhrases[key], `period-chibi-phrase:${todayKey}:${key}`) ?? '';
  }, [chibiPhrases, todayKey, todayPhase]);


  // Trigger one-time popup for each finished period
  useEffect(() => {
    if (!completed.length || postEndPopup || !postEndPhrases.length) return;
    const seen = loadSeenPostEndDates();
    const latestUnseen = completed
      .map((record) => record.endDate)
      .filter((endDate) => endDate <= todayKey && !seen.has(endDate))
      .sort()
      .at(-1);

    if (!latestUnseen) return;

    const text = randomPick(postEndPhrases) ?? '';
    const popupChibi = randomPick(chibiSources) ?? chibiSrc;
    if (!text || !popupChibi) return;

    setPostEndPopup({
      endDate: latestUnseen,
      text,
      chibiUrl: popupChibi,
    });
  }, [chibiSources, chibiSrc, completed, postEndPhrases, postEndPopup, todayKey]);

  useEffect(() => {
    if (!postEndPopup) return;
    const timer = window.setTimeout(() => {
      markPostEndDateSeen(postEndPopup.endDate);
      setPostEndPopup(null);
    }, 4500);
    return () => window.clearTimeout(timer);
  }, [postEndPopup]);

  // Selected date info
  const selectedDateInfo = useMemo(() => {
    if (!selectedDateKey) return null;
    const matchedRecord = completed.find(
      (r) => selectedDateKey >= r.startDate && selectedDateKey <= r.endDate,
    );
    return {
      dateKey: selectedDateKey,
      isActual: actualPeriodSet.has(selectedDateKey),
      isFuture: selectedDateKey > todayKey,
      note: matchedRecord?.note ?? '',
      matchedRecord,
      phrase: pickPhraseByDate(
        selectedDateKey,
        actualPeriodSet,
        nextStartKey,
        ovulationWindow.start,
        ovulationWindow.end,
        hoverPhrases,
      ),
    };
  }, [actualPeriodSet, completed, hoverPhrases, nextStartKey, ovulationWindow, selectedDateKey, todayKey]);

  // Handlers
  function savePeriodRecord() {
    const s = parseDateKey(startDraft);
    const e = parseDateKey(endDraft);
    if (!s || !e) {
      setStatusText('請先選擇開始日和結束日。');
      emitActionToast({ kind: 'error', message: '經期紀錄儲存失敗：日期不完整' });
      return;
    }
    if (dayDiff(s, e) < 0) {
      setStatusText('結束日不能早於開始日。');
      emitActionToast({ kind: 'error', message: '經期紀錄儲存失敗：結束日早於開始日' });
      return;
    }
    if (toDateKey(e) > todayKey) {
      setStatusText('結束日不能超過今天。');
      emitActionToast({ kind: 'error', message: '經期紀錄儲存失敗：結束日超過今天' });
      return;
    }

    const newRecord: PeriodRecord = {
      id: `${toDateKey(s)}-${Date.now()}`,
      startDate: toDateKey(s),
      endDate: toDateKey(e),
      note: noteDraft.trim(),
      createdAt: new Date().toISOString(),
    };
    setStore((cur) => ({ ...cur, records: [...cur.records, newRecord] }));
    setStatusText('已儲存這次經期紀錄。');
    emitActionToast({ kind: 'success', message: '經期紀錄已儲存' });
    setNoteDraft('');
    setStartDraft('');
    setEndDraft('');
  }

  function deleteRecord(id: string) {
    setStore((cur) => ({ ...cur, records: cur.records.filter((r) => r.id !== id) }));
  }

  function exportPeriodBackup() {
    if (periodBackupBusy) return;
    setPeriodBackupBusy(true);
    setPeriodBackupStatus('匯出中…');
    try {
      const seenPostEndDates = Array.from(loadSeenPostEndDates());
      const payload: PeriodBackupPayload = {
        kind: PERIOD_BACKUP_KIND,
        version: PERIOD_BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        store,
        seenPostEndDates,
      };
      const date = new Date().toISOString().slice(0, 10);
      downloadJsonFile(`period-backup-${date}.json`, payload);
      setPeriodBackupStatus(`已匯出：${store.records.length} 筆紀錄`);
    } catch {
      setPeriodBackupStatus('匯出失敗，請稍後重試');
    } finally {
      setPeriodBackupBusy(false);
    }
  }

  async function importPeriodBackup(mode: 'merge' | 'overwrite', file: File) {
    if (periodBackupBusy) return;
    setPeriodBackupBusy(true);
    setPeriodBackupStatus(mode === 'overwrite' ? '覆蓋匯入中…' : '合併匯入中…');

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;

      let incomingStoreRaw: unknown = null;
      let incomingSeenRaw: unknown = [];

      if (isRecord(parsed) && parsed.kind === PERIOD_BACKUP_KIND && parsed.version === PERIOD_BACKUP_VERSION) {
        incomingStoreRaw = parsed.store;
        incomingSeenRaw = parsed.seenPostEndDates;
      } else if (
        isRecord(parsed) &&
        parsed.kind === 'memorial-big-backup-part' &&
        parsed.domain === 'aboutMe' &&
        parsed.part === 'period'
      ) {
        incomingStoreRaw = parsed.store;
        incomingSeenRaw = parsed.seenPostEndDates;
      } else if (isRecord(parsed) && Array.isArray(parsed.records)) {
        incomingStoreRaw = parsed;
      } else {
        throw new Error('invalid');
      }

      const incomingStore = normalizePeriodStore(incomingStoreRaw);
      const incomingSeen = normalizeSeenPostEndDates(incomingSeenRaw);

      if (mode === 'overwrite') {
        setStore(incomingStore);
        window.localStorage.setItem(POST_END_SEEN_KEY, JSON.stringify(incomingSeen));
      } else {
        setStore((current) => mergePeriodStores(current, incomingStore));
        const existingSeen = Array.from(loadSeenPostEndDates());
        const mergedSeen = normalizeSeenPostEndDates([...existingSeen, ...incomingSeen]);
        window.localStorage.setItem(POST_END_SEEN_KEY, JSON.stringify(mergedSeen));
      }

      setPeriodBackupStatus(
        mode === 'overwrite'
          ? `覆蓋匯入完成：${incomingStore.records.length} 筆紀錄`
          : `合併匯入完成：${incomingStore.records.length} 筆新資料`,
      );
    } catch {
      setPeriodBackupStatus('匯入失敗：請確認 JSON 來源正確');
    } finally {
      setPeriodBackupBusy(false);
    }
  }

  function clearAllRecords() {
    setStore((cur) => ({ ...cur, records: [] }));
    setShowPeriodSettings(false);
  }

  // Date sheet handlers
  function handleMarkStart() {
    if (!selectedDateKey) return;
    setStartDraft(selectedDateKey);
    setActiveTab('records');
    setSelectedDateKey(null);
  }

  function handleMarkEnd() {
    if (!selectedDateKey) return;
    setEndDraft(selectedDateKey);
    setActiveTab('records');
    setSelectedDateKey(null);
  }

  function handleClearDateMark() {
    if (!selectedDateKey || !selectedDateInfo?.matchedRecord) return;
    deleteRecord(selectedDateInfo.matchedRecord.id);
    setSelectedDateKey(null);
  }

  function closePostEndPopup() {
    if (postEndPopup) {
      markPostEndDateSeen(postEndPopup.endDate);
    }
    setPostEndPopup(null);
  }

  function handleSwipeGesture(deltaX: number, deltaY: number) {
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    if (absX < PERIOD_SWIPE_THRESHOLD || absX <= absY) return;
    if (selectedDateKey || showPeriodSettings || postEndPopup) return;

    if (activeTab === 'calendar') {
      if (deltaX < 0) {
        setViewMonth((cur) => new Date(cur.getFullYear(), cur.getMonth() + 1, 1));
      } else {
        setViewMonth((cur) => new Date(cur.getFullYear(), cur.getMonth() - 1, 1));
      }
      return;
    }

    const currentIndex = PERIOD_TAB_ORDER.indexOf(activeTab);
    if (currentIndex < 0) return;
    const direction = deltaX < 0 ? 1 : -1;
    const nextIndex = Math.max(0, Math.min(PERIOD_TAB_ORDER.length - 1, currentIndex + direction));
    if (nextIndex !== currentIndex) {
      setActiveTab(PERIOD_TAB_ORDER[nextIndex]!);
    }
  }

  function onTouchStart(event: TouchEvent<HTMLDivElement>) {
    const touch = event.changedTouches[0];
    if (!touch) return;
    swipeStartRef.current = { x: touch.clientX, y: touch.clientY };
  }

  function onTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch) return;
    handleSwipeGesture(touch.clientX - start.x, touch.clientY - start.y);
  }

  function onTouchCancel() {
    swipeStartRef.current = null;
  }

  // Last completed period
  const lastPeriod = completed[completed.length - 1] ?? null;

  // ── Render ─────────────────────────────────────────────────────────────────
  const TAB_ITEMS: { id: PeriodTab; label: string }[] = [
    { id: 'overview', label: '總覽' },
    { id: 'calendar', label: '月曆' },
    { id: 'records',  label: '紀錄' },
  ];

  return (
    <div
      className="relative flex h-full flex-col overflow-hidden"
      style={{ background: panelTheme.pageBg }}
    >
      {/* ── Header ──────────────────────────────────────────────── */}
      <header
        className="shrink-0 border-b"
        style={{ background: panelTheme.headerBg, borderColor: 'rgba(0,0,0,0.06)', ...panelFilterFx }}
      >
        <div className="flex items-center gap-3 px-4 pb-2.5 pt-4">
          <button
            type="button"
            onClick={onExit}
            className="grid h-8 w-8 place-items-center rounded-full border border-stone-300 bg-white/80 text-[22px] leading-none text-stone-600 transition active:scale-95"
          >
            ‹
          </button>
          <div className="flex-1 text-center">
            <p className="text-[9px] uppercase tracking-[0.28em] text-stone-400">PERIOD</p>
            <h1
              className="mt-0.5 leading-tight text-stone-800"
              style={{
                fontSize: 'var(--ui-header-title-size, 17px)',
                fontFamily: "var(--app-font-family, -apple-system, 'Helvetica Neue', system-ui, sans-serif)",
              }}
            >
              經期追蹤
            </h1>
          </div>
          {hidePeriodChibi ? (
            <button
              type="button"
              onClick={() => setShowPeriodSettings(true)}
              className="grid h-8 w-8 place-items-center text-[22px] leading-none text-stone-400 transition active:opacity-60"
              aria-label="更多設定"
            >
              ⋯
            </button>
          ) : (
            <div className="w-10" />
          )}
        </div>

        {/* Tab bar */}
        <div className="flex border-t" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
          {TAB_ITEMS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className="flex-1 border-b-2 transition"
              style={{
                padding: '9px 0 7px',
                fontSize: 'var(--ui-tab-label-size, 17px)',
                lineHeight: 1.2,
                fontWeight: 500,
                letterSpacing: '0.04em',
                color: activeTab === t.id ? C.accent : '#a8a29e',
                borderBottomColor: activeTab === t.id ? C.accent : 'transparent',
                fontFamily: "var(--app-font-family, -apple-system, 'Helvetica Neue', system-ui, sans-serif)",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {/* ── Content ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onTouchCancel={onTouchCancel}>

        {/* ── 總覽 ─────────────────────────────── */}
        {activeTab === 'overview' && (
          <div className="flex flex-col gap-3 px-4 pb-56 pt-4">

            {/* Hero card */}
            <div
              className="rounded-3xl border p-5"
              style={{
                background: 'linear-gradient(140deg,#fde6ec 0%,#fdf3f0 60%,#fdf7f4 100%)',
                borderColor: 'rgba(212,96,122,0.12)',
                boxShadow: '0 6px 24px rgba(212,96,122,0.10)',
              }}
            >
              <p
                className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.14em]"
                style={{ color: C.accentMid }}
              >
                {todayPhase}
              </p>
              {daysUntilNext !== null ? (
                <>
                  <p
                    className="text-[52px] font-black leading-none tracking-[-2px]"
                    style={{ color: C.today }}
                  >
                    {Math.abs(daysUntilNext)}
                  </p>
                  <p className="mt-1 text-sm" style={{ color: '#78716c' }}>
                    {daysUntilNext < 0
                      ? `超過預測 ${Math.abs(daysUntilNext)} 天`
                      : daysUntilNext === 0
                      ? '今天是預測開始日'
                      : `距下次月經還有 ${daysUntilNext} 天`}
                  </p>
                  <div
                    className="mt-4 inline-flex items-center gap-2 rounded-xl px-3 py-2"
                    style={{ background: 'rgba(229,115,138,0.12)' }}
                  >
                    <span className="text-[10px]" style={{ color: C.accentMid }}>預測下次</span>
                    <span className="text-sm font-bold" style={{ color: C.period }}>
                      {nextStartKey.slice(5).replace('-', '/')}
                    </span>
                  </div>
                </>
              ) : (
                <p className="mt-2 text-sm text-stone-500">新增第一筆紀錄後會自動預測</p>
              )}
            </div>

            {/* Stat row */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: '平均週期', value: `${avgCycleLength}`, hint: '天' },
                { label: '平均經期', value: `${avgDuration}`, hint: '天' },
                { label: '紀錄數量', value: `${completed.length}`, hint: '筆' },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-2xl border px-2 py-3 text-center"
                  style={panelCardStyle}
                >
                  <span className="block text-[8px] uppercase tracking-[0.1em] text-stone-400 mb-1">{s.label}</span>
                  <span className="block text-lg font-bold text-stone-800">{s.value}</span>
                  <span className="block text-[9px] text-stone-400 mt-0.5">{s.hint}</span>
                </div>
              ))}
            </div>

            {/* Last period card */}
            {lastPeriod && (
              <div
                className="rounded-2xl border p-4"
                style={panelCardStyle}
              >
                <span className="mb-2 block text-[9px] uppercase tracking-[0.14em] text-stone-400">上次月經</span>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-stone-700">
                      {lastPeriod.startDate.slice(5).replace('-', '/')} — {lastPeriod.endDate.slice(5).replace('-', '/')}
                    </p>
                    <p className="mt-0.5 text-[10px] text-stone-400">
                      共 {dayDiff(parseDateKey(lastPeriod.startDate)!, parseDateKey(lastPeriod.endDate)!) + 1} 天
                    </p>
                  </div>
                  <div
                    className="rounded-full px-3 py-1 text-xs font-medium"
                    style={{ background: '#fde4ec', color: C.period }}
                  >
                    {dayDiff(parseDateKey(lastPeriod.startDate)!, parseDateKey(lastPeriod.endDate)!) + 1} 天
                  </div>
                </div>
              </div>
            )}

            {/* Ovulation window card */}
            {ovulationWindow.start && (
            <div
              className="rounded-2xl border p-4"
              style={{
                background:
                  store.panelStyle === 'soft'
                    ? 'rgba(197,232,212,0.35)'
                    : 'linear-gradient(145deg, rgba(226,246,237,0.82), rgba(201,236,224,0.48))',
                borderColor: store.panelStyle === 'soft' ? 'rgba(42,96,72,0.10)' : 'rgba(42,96,72,0.17)',
              }}
            >
                <span className="mb-2 block text-[9px] uppercase tracking-[0.14em] text-stone-400">預測可孕期</span>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium" style={{ color: C.fertileText }}>
                      {ovulationWindow.start.slice(5).replace('-', '/')} — {ovulationWindow.end.slice(5).replace('-', '/')}
                    </p>
                    <p className="mt-0.5 text-[10px] text-stone-400">
                      排卵日 {ovulationWindow.peak.slice(5).replace('-', '/')}（預測）
                    </p>
                  </div>
                  <div
                    className="rounded-full px-3 py-1 text-xs font-medium"
                    style={{ background: C.fertile, color: C.fertileText }}
                  >
                    {ovulationWindow.peak <= todayKey ? '已過' : '即將'}
                  </div>
                </div>
              </div>
            )}

            {!completed.length && (
              <div
                className="rounded-2xl border p-5 text-center"
                style={panelMutedCardStyle}
              >
                <p className="text-2xl mb-2">🩸</p>
                <p className="text-sm text-stone-500">還沒有紀錄，去「紀錄」頁新增第一筆吧！</p>
              </div>
            )}
          </div>
        )}

        {/* ── 月曆 ─────────────────────────────── */}
        {activeTab === 'calendar' && (
          <div className="flex flex-col gap-3 px-4 pb-56 pt-4">

            {/* Month navigator */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setViewMonth((cur) => new Date(cur.getFullYear(), cur.getMonth() - 1, 1))}
                className="flex h-8 w-8 items-center justify-center rounded-full border text-sm text-stone-600 transition active:scale-90"
                style={{ background: 'rgba(255,255,255,0.85)', borderColor: '#e7e5e4' }}
              >
                ‹
              </button>
              <div className="flex items-center gap-1.5">
                <label className="relative flex cursor-pointer items-center gap-1 text-base font-semibold text-stone-800">
                  <span>{toMonthLabel(viewMonth)}</span>
                  <span className="text-xs text-stone-500">▾</span>
                  <input
                    type="month"
                    value={monthInputValue}
                    onChange={(event) => handleMonthPickerChange(event.target.value)}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    aria-label="快速跳到指定月份"
                    title="快速跳到指定月份"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setViewMonth(new Date(today.getFullYear(), today.getMonth(), 1))}
                  aria-label="回到本月"
                  title="回到本月"
                  className="text-xs text-stone-500 transition active:scale-95"
                >
                  ↺
                </button>
              </div>
              <button
                type="button"
                onClick={() => setViewMonth((cur) => new Date(cur.getFullYear(), cur.getMonth() + 1, 1))}
                className="flex h-8 w-8 items-center justify-center rounded-full border text-sm text-stone-600 transition active:scale-90"
                style={{ background: 'rgba(255,255,255,0.85)', borderColor: '#e7e5e4' }}
              >
                ›
              </button>
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1">
              {WEEK_LABELS.map((h) => (
                <div key={h} className="py-1 text-center text-[9px] text-stone-400">{h}</div>
              ))}
              {monthCells.map((cell) => {
                const isToday = cell.key === todayKey;
                const isActual = actualPeriodSet.has(cell.key);
                const isPredicted = !isActual && predictedPeriodSet.has(cell.key);
                const isFertile =
                  !isActual && !isPredicted &&
                  ovulationWindow.start && ovulationWindow.end &&
                  cell.key >= ovulationWindow.start && cell.key <= ovulationWindow.end;
                const isOvulation = cell.key === ovulationWindow.peak;

                let bg = '';
                let textColor = '#44403c';
                if (!cell.inMonth) textColor = '#d6d3d1';
                if (isActual) { bg = C.period; textColor = 'white'; }
                else if (isPredicted) { bg = C.predicted; textColor = '#bf6070'; }
                else if (isFertile) { bg = C.fertile; textColor = C.fertileText; }

                return (
                  <div
                    key={cell.key}
                    className="relative flex aspect-square cursor-pointer items-center justify-center rounded-full text-xs transition active:scale-90"
                    style={{
                      background: bg || undefined,
                      color: textColor,
                      fontWeight: isToday ? 700 : undefined,
                      outline: isToday ? `2px solid ${C.today}` : undefined,
                      outlineOffset: isToday ? '1px' : undefined,
                    }}
                    onClick={() => cell.inMonth && setSelectedDateKey(cell.key)}
                  >
                    {cell.day}
                    {isOvulation && (
                      <span
                        className="absolute right-0.5 top-0.5 rounded-full border-[1.5px] border-white"
                        style={{ width: 6, height: 6, background: C.ovulation }}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div
              className="flex flex-wrap items-center justify-center gap-3 rounded-2xl px-3 py-2.5"
              style={{ ...panelMutedCardStyle, borderColor: 'transparent' }}
            >
              {[
                { bg: C.period,    label: '月經' },
                { bg: C.predicted, label: '預測' },
                { bg: C.fertile,   label: '可孕期' },
                { bg: C.ovulation, label: '排卵日', small: true },
                { bg: 'transparent', label: '今天', outline: true },
              ].map((l) => (
                <div key={l.label} className="flex items-center gap-1">
                  <span
                    className="inline-block rounded-full"
                    style={{
                      width: l.small ? 7 : 9,
                      height: l.small ? 7 : 9,
                      background: l.bg,
                      outline: l.outline ? `2px solid ${C.today}` : undefined,
                    }}
                  />
                  <span className="text-[10px] text-stone-500">{l.label}</span>
                </div>
              ))}
            </div>

            {/* Hint */}
            <div
              className="flex items-center gap-3 rounded-2xl border p-3"
              style={panelMutedCardStyle}
            >
              <span className="text-[18px]">📅</span>
              <p className="flex-1 text-xs leading-relaxed text-stone-400">
                點月曆日期可補記或標記月經開始／結束日
              </p>
            </div>
          </div>
        )}

        {/* ── 紀錄 ─────────────────────────────── */}
        {activeTab === 'records' && (
          <div className="flex flex-col gap-3 px-4 pb-56 pt-4">

            {/* Today label */}
            <p className="text-[10px] uppercase tracking-[0.14em] text-stone-400">
              今天 · {todayKey.replace(/-/g, ' / ')}
            </p>

            {/* Quick action card */}
            <div
              className="rounded-2xl border p-4"
              style={panelCardStyle}
            >
              <span className="mb-2.5 block text-[9px] uppercase tracking-[0.14em] text-stone-400">快速記錄</span>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setStartDraft(todayKey)}
                  className="rounded-2xl p-3.5 text-left text-sm font-medium text-white transition active:scale-[0.98]"
                  style={{ background: C.period, boxShadow: '0 4px 14px rgba(229,115,138,0.3)' }}
                >
                  🩸 記錄今天月經開始
                </button>
                <button
                  type="button"
                  onClick={() => setEndDraft(todayKey)}
                  className="rounded-2xl border p-3.5 text-left text-sm font-medium transition active:scale-[0.98]"
                  style={{ background: '#fde4ec', color: C.accent, borderColor: 'rgba(212,96,122,0.18)' }}
                >
                  ✓ 記錄今天月經結束
                </button>
              </div>
            </div>

            {/* Form card */}
            <div
              className="rounded-2xl border p-4"
              style={panelCardStyle}
            >
              <span className="mb-2.5 block text-[9px] uppercase tracking-[0.14em] text-stone-400">手動輸入</span>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <label className="space-y-1">
                  <span className="text-[11px] text-stone-500">開始日</span>
                  <div className="relative">
                    <div className="w-full rounded-xl border border-stone-300 bg-white/85 px-3 py-2 text-left text-sm text-stone-800">
                      {toMonthDayLabel(startDraft)}
                    </div>
                    <input
                      type="date"
                      value={startDraft}
                      max={todayKey}
                      onChange={(e) => setStartDraft(e.target.value)}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      aria-label="開始日"
                    />
                  </div>
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] text-stone-500">結束日</span>
                  <div className="relative">
                    <div className="w-full rounded-xl border border-stone-300 bg-white/85 px-3 py-2 text-left text-sm text-stone-800">
                      {toMonthDayLabel(endDraft)}
                    </div>
                    <input
                      type="date"
                      value={endDraft}
                      max={todayKey}
                      onChange={(e) => setEndDraft(e.target.value)}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      aria-label="結束日"
                    />
                  </div>
                </label>
              </div>
              <label className="block space-y-1 mb-3">
                <span className="text-[11px] text-stone-500">備註（選填）</span>
                <textarea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  rows={2}
                  className="w-full resize-none rounded-xl border border-stone-300 bg-white/85 px-3 py-2 text-sm text-stone-800"
                  placeholder="例如：這次比較疲累"
                />
              </label>
              <button
                type="button"
                onClick={savePeriodRecord}
                className="w-full rounded-2xl py-3 text-sm font-medium text-white transition active:scale-[0.98]"
                style={{ background: C.period, boxShadow: '0 4px 14px rgba(229,115,138,0.25)' }}
              >
                儲存這次經期
              </button>
              {!!statusText && (
                <p className="mt-2 text-center text-xs text-stone-500">{statusText}</p>
              )}
            </div>

            {/* History */}
            {completed.length > 0 && (
              <div>
                <p className="mb-2.5 text-[10px] uppercase tracking-[0.14em] text-stone-400">歷史紀錄</p>
                <div
                  className="rounded-2xl border px-4 py-1"
                  style={panelCardStyle}
                >
                  {completed
                    .slice()
                    .reverse()
                    .map((r) => {
                      const days = dayDiff(parseDateKey(r.startDate)!, parseDateKey(r.endDate)!) + 1;
                      return (
                        <div
                          key={r.id}
                          className="flex items-center gap-3 border-b py-3 last:border-b-0"
                          style={{ borderColor: 'rgba(0,0,0,0.04)' }}
                        >
                          <div
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ background: C.period }}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] text-stone-700">
                              {r.startDate.slice(5).replace('-', '/')} — {r.endDate.slice(5).replace('-', '/')}
                            </p>
                            <p className="mt-0.5 text-[10px] text-stone-400">
                              持續 {days} 天{r.note ? ` · ${r.note}` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-medium" style={{ color: C.period }}>{days} 天</p>
                            <button
                              type="button"
                              onClick={() => deleteRecord(r.id)}
                              className="rounded-lg border px-2 py-1 text-[11px] text-stone-400 transition active:scale-95"
                              style={{ borderColor: '#e7e5e4', background: 'white' }}
                            >
                              刪除
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Settings access */}
            <button
              type="button"
              onClick={() => setShowPeriodSettings(true)}
              className="flex items-center gap-3 rounded-2xl border p-3 text-left transition active:scale-[0.98]"
              style={panelMutedCardStyle}
            >
              <span className="text-[18px]">⚙️</span>
              <p className="flex-1 text-xs text-stone-400">面板風格 · 清除資料</p>
              <span className="text-stone-300">›</span>
            </button>
          </div>
        )}

      </div>

      {/* ── Floating chibi ───────────────────────────────────────── */}
      {activeTab !== 'records' && !hidePeriodChibi && (
        <FloatingChibi
          chibiSrc={chibiSrc}
          phrase={chibiPhrase}
          sizePx={store.periodChibiSize}
          onClickSettings={() => setShowPeriodSettings(true)}
        />
      )}

      {postEndPopup && (
        <div className="absolute inset-0 z-40 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40" onClick={closePostEndPopup} />
          <div className="relative w-full max-w-sm rounded-2xl border border-stone-300 bg-white p-4 shadow-xl">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-[0.14em] text-stone-500">Period Update</p>
              <button
                type="button"
                onClick={closePostEndPopup}
                className="rounded-lg border border-stone-300 px-2 py-1 text-xs text-stone-600"
              >
                關閉
              </button>
            </div>
            <p className="text-lg text-stone-900">本次經期結束</p>
            <div className="mt-3 flex items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 p-3">
              <img src={postEndPopup.chibiUrl} alt="" draggable={false} className="h-16 w-16 shrink-0 object-contain" />
              <p className="whitespace-pre-line text-sm text-stone-700">{postEndPopup.text}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Date sheet ───────────────────────────────────────────── */}
      {selectedDateKey && selectedDateInfo && (
        <DateSheet
          dateKey={selectedDateKey}
          isActual={selectedDateInfo.isActual}
          phrase={selectedDateInfo.phrase}
          onMarkStart={handleMarkStart}
          onMarkEnd={handleMarkEnd}
          onClear={handleClearDateMark}
          onClose={() => setSelectedDateKey(null)}
        />
      )}

      {/* ── Period settings sheet ────────────────────────────────── */}
      {showPeriodSettings && (
        <PeriodSettingsSheet
          panelStyle={store.panelStyle}
          onPanelStyleChange={(style) => setStore((cur) => ({ ...cur, panelStyle: style }))}
          showChibi={store.showChibi}
          onToggleChibi={() => setStore((cur) => ({ ...cur, showChibi: !cur.showChibi }))}
          chibiSize={store.periodChibiSize}
          onChibiSizeChange={(size) => setStore((cur) => ({ ...cur, periodChibiSize: clamp(size, 120, 220) }))}
          backupBusy={periodBackupBusy}
          backupStatus={periodBackupStatus}
          onExportBackup={exportPeriodBackup}
          onImportBackup={(mode, file) => {
            void importPeriodBackup(mode, file);
          }}
          onClearAll={clearAllRecords}
          onClose={() => setShowPeriodSettings(false)}
        />
      )}
    </div>
  );
}
