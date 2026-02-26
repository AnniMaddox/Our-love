import { useEffect, useMemo, useRef, useState, type TouchEvent } from 'react';

import { CHIBI_POOL_UPDATED_EVENT, getScopedMixedChibiSources } from '../lib/chibiPool';
import { monthLabel, todayDateKey } from '../lib/date';
import { getGlobalHoverPoolEntries, pickHoverPhraseByWeights } from '../lib/hoverPool';
import { getHoverPhraseMap, setHoverPhraseMap } from '../lib/repositories/metaRepo';
import type { CalendarDay, CalendarMonth } from '../types/content';
import type { CalendarColorMode, HoverToneWeights } from '../types/settings';

type CalendarPageProps = {
  monthKey: string;
  monthKeys: string[];
  data: CalendarMonth;
  hoverToneWeights: HoverToneWeights;
  hoverResetSeed: number;
  calendarColorMode: CalendarColorMode;
  monthAccentColor: string | null;
  onMonthChange: (monthKey: string) => void;
  onCalendarColorModeChange: (mode: CalendarColorMode) => void;
};

type HoverPreview = {
  dateKey: string;
  phrase: string;
};

const DEFAULT_HOVER_PHRASES = ['來，我在', '今天也選妳', '等妳', '想妳了', '抱緊一下', '妳回頭就有我'];
const CALENDAR_FALLBACK_MODULES = import.meta.glob('../../data/calendar/**/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>;
const MESSAGE_PREVIEW_LENGTH = 6;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_KEY_PATTERN = /^\d{4}-\d{2}$/;
const MONTH_SWIPE_THRESHOLD = 54;

function extractUndatedFallbackMessage(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const row = payload as Record<string, unknown>;
  const dateValue = row.date ?? row.dateKey;
  if (typeof dateValue === 'string' && DATE_KEY_PATTERN.test(dateValue)) {
    return null;
  }

  const rawText = row.content ?? row.text ?? row.message ?? row.body ?? row.entry ?? row.note;
  if (typeof rawText !== 'string') {
    return null;
  }

  const text = rawText.trim();
  return text ? text : null;
}

const EMPTY_MONTH_FALLBACK_MESSAGE = (() => {
  const modules = Object.entries(CALENDAR_FALLBACK_MODULES).sort(([a], [b]) => a.localeCompare(b));
  const undatedFirst = modules
    .filter(([path]) => path.toLowerCase().includes('undated'))
    .concat(modules.filter(([path]) => !path.toLowerCase().includes('undated')));

  for (const [, payload] of undatedFirst) {
    const text = extractUndatedFallbackMessage(payload);
    if (text) {
      return text;
    }
  }

  return null;
})();

function getMonthMeta(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number);
  const safeYear = Number.isFinite(year) ? year : new Date().getFullYear();
  const safeMonth = Number.isFinite(month) ? month : 1;

  const firstWeekday = new Date(safeYear, safeMonth - 1, 1).getDay();
  const daysInMonth = new Date(safeYear, safeMonth, 0).getDate();

  return {
    year: safeYear,
    month: safeMonth,
    firstWeekday,
    daysInMonth,
  };
}

function offsetMonthKey(monthKey: string, offset: number) {
  const [year, month] = monthKey.split('-').map(Number);
  const baseYear = Number.isFinite(year) ? year : new Date().getFullYear();
  const baseMonth = Number.isFinite(month) && month >= 1 && month <= 12 ? month : 1;
  const shifted = new Date(baseYear, baseMonth - 1 + offset, 1);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}`;
}

function getDayMessages(day: CalendarDay | null | undefined) {
  if (!day) {
    return [];
  }

  if (day.messages?.length) {
    return day.messages;
  }

  return day.text ? [day.text] : [];
}

function messagePreview(text: string, maxLength = MESSAGE_PREVIEW_LENGTH) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '（空白內容）';
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

export function CalendarPage({
  monthKey,
  monthKeys,
  data,
  hoverToneWeights,
  hoverResetSeed,
  calendarColorMode,
  monthAccentColor,
  onMonthChange,
  onCalendarColorModeChange,
}: CalendarPageProps) {
  const fallbackChibiSrc = `${import.meta.env.BASE_URL}chibi/chibi-00.webp`;
  const [chibiPoolVersion, setChibiPoolVersion] = useState(0);
  const chibiSources = useMemo(() => {
    const active = getScopedMixedChibiSources('calendar');
    return active.length ? active : [fallbackChibiSrc];
  }, [fallbackChibiSrc, chibiPoolVersion]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedMessageIndex, setSelectedMessageIndex] = useState(0);
  const [messageListDate, setMessageListDate] = useState<string | null>(null);
  const [temporaryUnlockDate, setTemporaryUnlockDate] = useState<string | null>(null);
  const [primedDateKey, setPrimedDateKey] = useState<string | null>(null);
  const [hoverPreview, setHoverPreview] = useState<HoverPreview | null>(null);
  const [pendingMonthKey, setPendingMonthKey] = useState<string | null>(null);
  const [chibiIndex, setChibiIndex] = useState(0);
  const [showChibi, setShowChibi] = useState(true);
  const [hoverPhraseByDate, setHoverPhraseByDate] = useState<Record<string, string>>({});
  const hoverPhraseByDateRef = useRef<Record<string, string>>({});
  const monthSwipeStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const handlePoolUpdate = () => setChibiPoolVersion((current) => current + 1);
    window.addEventListener(CHIBI_POOL_UPDATED_EVENT, handlePoolUpdate);
    return () => window.removeEventListener(CHIBI_POOL_UPDATED_EVENT, handlePoolUpdate);
  }, []);

  const today = todayDateKey();
  const hasMonthContent = useMemo(() => Object.keys(data).length > 0, [data]);
  const globalHoverPool = useMemo(() => {
    const pool = getGlobalHoverPoolEntries();
    return pool.length
      ? pool
      : DEFAULT_HOVER_PHRASES.map((phrase) => ({
          phrase,
          category: 'general' as const,
        }));
  }, []);

  function getDateHoverPool(dateKey: string) {
    const hoverPhrases = data[dateKey]?.hoverPhrases;
    if (hoverPhrases?.length) {
      return hoverPhrases;
    }

    return null;
  }

  function getMessagesForDate(dateKey: string) {
    const messages = getDayMessages(data[dateKey] ?? null);
    if (messages.length > 0) {
      return messages;
    }

    if (!hasMonthContent && EMPTY_MONTH_FALLBACK_MESSAGE) {
      return [EMPTY_MONTH_FALLBACK_MESSAGE];
    }

    return [];
  }

  async function ensureHoverPhrase(dateKey: string) {
    const existing = hoverPhraseByDateRef.current[dateKey];
    if (existing) {
      return existing;
    }

    const datePool = getDateHoverPool(dateKey);
    const phrase = datePool?.length
      ? datePool[Math.floor(Math.random() * datePool.length)]
      : pickHoverPhraseByWeights(globalHoverPool, hoverToneWeights);

    if (!phrase) {
      return '';
    }

    const nextMap = {
      ...hoverPhraseByDateRef.current,
      [dateKey]: phrase,
    };

    hoverPhraseByDateRef.current = nextMap;
    setHoverPhraseByDate(nextMap);

    try {
      await setHoverPhraseMap(nextMap);
    } catch {
      // Keep optimistic local assignment if persistence fails.
    }

    return phrase;
  }

  async function showHoverPreview(dateKey: string) {
    const phrase = await ensureHoverPhrase(dateKey);
    if (!phrase) {
      return;
    }

    setHoverPreview({ dateKey, phrase });
  }

  function getPinnedHoverPhrase(dateKey: string) {
    const existing = hoverPhraseByDateRef.current[dateKey];
    if (existing) {
      return existing;
    }

    return getDateHoverPool(dateKey)?.[0] ?? DEFAULT_HOVER_PHRASES[0];
  }

  useEffect(() => {
    setSelectedDate(null);
    setSelectedMessageIndex(0);
    setMessageListDate(null);
    setTemporaryUnlockDate(null);
    setPrimedDateKey(null);
    setHoverPreview(null);
    setPendingMonthKey(null);
  }, [monthKey]);

  useEffect(() => {
    hoverPhraseByDateRef.current = hoverPhraseByDate;
  }, [hoverPhraseByDate]);

  useEffect(() => {
    let active = true;

    void getHoverPhraseMap()
      .then((savedMap) => {
        if (!active) {
          return;
        }

        hoverPhraseByDateRef.current = savedMap;
        setHoverPhraseByDate(savedMap);
      })
      .catch(() => {
        if (!active) {
          return;
        }

        hoverPhraseByDateRef.current = {};
        setHoverPhraseByDate({});
      });

    return () => {
      active = false;
    };
  }, [hoverResetSeed]);

  const monthMeta = useMemo(() => getMonthMeta(monthKey), [monthKey]);

  const dayCells = useMemo(() => {
    const cells: Array<{ dateKey: string; day: number } | null> = [];

    for (let i = 0; i < monthMeta.firstWeekday; i += 1) {
      cells.push(null);
    }

    for (let day = 1; day <= monthMeta.daysInMonth; day += 1) {
      const dateKey = `${monthMeta.year}-${String(monthMeta.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      cells.push({ dateKey, day });
    }

    const remainder = cells.length % 7;
    if (remainder > 0) {
      for (let i = 0; i < 7 - remainder; i += 1) {
        cells.push(null);
      }
    }

    return cells;
  }, [monthMeta.daysInMonth, monthMeta.firstWeekday, monthMeta.month, monthMeta.year]);

  const selectedMessages = selectedDate ? getMessagesForDate(selectedDate) : [];
  const selectedMessage = selectedMessages[selectedMessageIndex] ?? null;
  const selectedHoverPhrase = selectedDate ? getPinnedHoverPhrase(selectedDate) : null;
  const selectedUnlocked = !!selectedDate && (selectedDate <= today || temporaryUnlockDate === selectedDate);
  const listMessages = messageListDate ? getMessagesForDate(messageListDate) : [];
  const listUnlocked = !!messageListDate && (messageListDate <= today || temporaryUnlockDate === messageListDate);
  const hoverPreviewLocked = !!hoverPreview && hoverPreview.dateKey > today && temporaryUnlockDate !== hoverPreview.dateKey;
  const monthColorAvailable = !!monthAccentColor;
  const currentMonthKey = today.slice(0, 7);
  const monthPickerValue = MONTH_KEY_PATTERN.test(pendingMonthKey ?? '')
    ? pendingMonthKey!
    : MONTH_KEY_PATTERN.test(monthKey)
      ? monthKey
      : currentMonthKey;
  const monthPickerLabel = monthKeys.length ? '快速跳到指定月份' : '選擇月份';
  const hasPendingMonthChange = !!pendingMonthKey && pendingMonthKey !== monthKey;

  function goToNeighborMonth(offset: -1 | 1) {
    setPendingMonthKey(null);
    onMonthChange(offsetMonthKey(monthKey, offset));
  }

  function resetMonthSwipe() {
    monthSwipeStartRef.current = null;
  }

  function handleCalendarTouchStart(event: TouchEvent<HTMLDivElement>) {
    if (selectedDate || messageListDate) {
      monthSwipeStartRef.current = null;
      return;
    }

    const touch = event.touches[0];
    if (!touch) {
      monthSwipeStartRef.current = null;
      return;
    }

    monthSwipeStartRef.current = { x: touch.clientX, y: touch.clientY };
  }

  function handleCalendarTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const start = monthSwipeStartRef.current;
    monthSwipeStartRef.current = null;

    if (!start) {
      return;
    }

    const touch = event.changedTouches[0];
    if (!touch) {
      return;
    }

    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (absX < MONTH_SWIPE_THRESHOLD) {
      return;
    }

    // Only trigger when horizontal intent is clear, so vertical scrolling still feels natural.
    if (absY > absX * 0.7) {
      return;
    }

    goToNeighborMonth(deltaX < 0 ? 1 : -1);
  }

  function goToCurrentMonth() {
    if (currentMonthKey !== monthKey) {
      setPendingMonthKey(null);
      onMonthChange(currentMonthKey);
    }
  }

  function handleMonthPickerChange(value: string) {
    if (!MONTH_KEY_PATTERN.test(value)) {
      return;
    }
    setPendingMonthKey(value === monthKey ? null : value);
  }

  function applyPendingMonthChange() {
    if (!hasPendingMonthChange || !pendingMonthKey) {
      return;
    }
    onMonthChange(pendingMonthKey);
  }

  function cancelPendingMonthChange() {
    setPendingMonthKey(null);
  }

  function clearCalendarSelection() {
    setPrimedDateKey(null);
    setHoverPreview(null);
  }

  function rotateChibiOnDateTap() {
    if (chibiSources.length <= 1) {
      return;
    }

    setChibiIndex((current) => {
      const randomIndex = Math.floor(Math.random() * chibiSources.length);
      return randomIndex === current ? (current + 1) % chibiSources.length : randomIndex;
    });
  }

  function openDateContent(dateKey: string, forceUnlocked = false) {
    const messages = getMessagesForDate(dateKey);
    if (!messages.length) {
      return;
    }

    const unlocked = forceUnlocked || dateKey <= today || temporaryUnlockDate === dateKey;
    if (messages.length > 1 && unlocked) {
      setSelectedDate(null);
      setSelectedMessageIndex(0);
      setMessageListDate(dateKey);
      return;
    }

    setMessageListDate(null);
    setSelectedMessageIndex(0);
    setSelectedDate(dateKey);
  }

  function handleDateTap(dateKey: string, messageCount: number) {
    rotateChibiOnDateTap();

    if (primedDateKey !== dateKey) {
      setPrimedDateKey(dateKey);
      void showHoverPreview(dateKey);
      return;
    }

    if (!messageCount) {
      return;
    }

    clearCalendarSelection();
    void ensureHoverPhrase(dateKey);
    openDateContent(dateKey);
  }

  function handleHoverBubbleTap() {
    if (!hoverPreviewLocked || !hoverPreview) {
      return;
    }

    const approved = window.confirm('要提前解鎖這一天嗎？');
    if (!approved) {
      return;
    }

    setTemporaryUnlockDate(hoverPreview.dateKey);
    clearCalendarSelection();
    void ensureHoverPhrase(hoverPreview.dateKey);
    openDateContent(hoverPreview.dateKey, true);
  }

  return (
    <div
      className="mx-auto w-full max-w-xl space-y-4"
      onTouchStart={handleCalendarTouchStart}
      onTouchEnd={handleCalendarTouchEnd}
      onTouchCancel={resetMonthSwipe}
      style={{ touchAction: 'pan-y' }}
    >
      <header className="calendar-header-panel rounded-2xl border p-4 shadow-sm">
        <p className="uppercase tracking-[0.18em] text-stone-500" style={{ fontSize: 'var(--ui-hint-text-size, 9px)' }}>
          Calendar
        </p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => goToNeighborMonth(-1)}
            className="calendar-nav-flat-btn px-2 py-1 text-[1.35rem] leading-none text-stone-700"
            aria-label="上一月"
            title="上一月"
          >
            ‹
          </button>
          <label
            className="calendar-month-title-trigger relative inline-flex items-center gap-1.5 text-stone-900"
            title={monthPickerLabel}
          >
            <span style={{ fontSize: 'calc(var(--ui-header-title-size, 17px) + 7px)' }}>{monthLabel(monthKey)}</span>
            <span className="text-sm text-stone-500">▾</span>
            <input
              type="month"
              value={monthPickerValue}
              onChange={(event) => handleMonthPickerChange(event.target.value)}
              aria-label={monthPickerLabel}
              title={monthPickerLabel}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </label>
          <button
            type="button"
            onClick={() => goToNeighborMonth(1)}
            className="calendar-nav-flat-btn px-2 py-1 text-[1.35rem] leading-none text-stone-700"
            aria-label="下一月"
            title="下一月"
          >
            ›
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-2">
          <div className="inline-flex items-center gap-1 rounded-xl border border-stone-300/80 bg-white/70 p-1 text-xs text-stone-700">
            <span className="px-2 text-[0.7rem] tracking-[0.08em] text-stone-500">日曆磚色</span>
            <button
              type="button"
              onClick={() => onCalendarColorModeChange('month')}
              disabled={!monthColorAvailable}
              className={`calendar-color-mode-btn rounded-lg px-2.5 py-1 ${
                calendarColorMode === 'month' ? 'calendar-color-mode-btn-active' : ''
              }`}
            >
              月份色
            </button>
            <button
              type="button"
              onClick={() => onCalendarColorModeChange('custom')}
              className={`calendar-color-mode-btn rounded-lg px-2.5 py-1 ${
                calendarColorMode === 'custom' ? 'calendar-color-mode-btn-active' : ''
              }`}
            >
              自訂色
            </button>
          </div>
          <div className="flex items-center gap-1">
            {hasPendingMonthChange && (
              <>
                <button
                  type="button"
                  onClick={applyPendingMonthChange}
                  className="calendar-nav-flat-btn px-2 py-1 text-[1rem] leading-none text-emerald-700"
                  aria-label="套用月份"
                  title="套用月份"
                >
                  ✓
                </button>
                <button
                  type="button"
                  onClick={cancelPendingMonthChange}
                  className="calendar-nav-flat-btn px-2 py-1 text-[1rem] leading-none text-stone-500"
                  aria-label="取消月份切換"
                  title="取消月份切換"
                >
                  ✕
                </button>
              </>
            )}
            <button
              type="button"
              onClick={goToCurrentMonth}
              disabled={monthKey === currentMonthKey}
              className="calendar-nav-flat-btn px-2 py-1 text-[1.05rem] leading-none text-stone-700"
              aria-label="回當月"
              title="回當月"
            >
              ↺
            </button>
          </div>
        </div>
        {hasPendingMonthChange && (
          <p className="mt-2 text-right text-[0.72rem] text-stone-500">
            待切換：{monthLabel(pendingMonthKey!)}
          </p>
        )}
      </header>

      <div className="calendar-month-fade grid grid-cols-7 gap-2 rounded-2xl border border-stone-300/70 bg-white/65 p-3 shadow-sm backdrop-blur-sm">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((weekday, index) => {
          const weekend = index === 0 || index === 6;
          return (
            <p key={weekday} className={`text-center text-xs uppercase ${weekend ? 'text-rose-500' : 'text-stone-500'}`}>
              {weekday}
            </p>
          );
        })}

        {dayCells.map((cell, index) => {
          if (!cell) {
            return <div key={`blank-${index}`} className="aspect-square rounded-full bg-transparent" />;
          }

          const messageCount = getMessagesForDate(cell.dateKey).length;
          const hasMessage = messageCount > 0;
          const locked = cell.dateKey > today;
          const primed = primedDateKey === cell.dateKey;

          return (
            <button
              key={cell.dateKey}
              type="button"
              onClick={() => handleDateTap(cell.dateKey, messageCount)}
              onMouseEnter={() => {
                if (!primedDateKey) {
                  void showHoverPreview(cell.dateKey);
                }
              }}
              onMouseLeave={() => {
                if (!primedDateKey || primedDateKey !== cell.dateKey) {
                  setHoverPreview((current) => (current?.dateKey === cell.dateKey ? null : current));
                }
              }}
              className={`calendar-day-glass relative aspect-square w-full overflow-visible border p-0 text-sm transition ${
                !hasMessage
                  ? 'border-stone-200/80 bg-white/35 text-stone-500 hover:border-stone-300'
                  : locked
                    ? 'calendar-day-locked'
                    : 'calendar-day-unlocked'
              } ${primed ? 'calendar-day-armed' : ''}`}
              title={
                !hasMessage
                  ? 'No message for this day'
                  : locked
                    ? 'Tap once for phrase; tap bubble to early unlock'
                    : messageCount > 1
                      ? 'Tap once for phrase, tap again to pick a message'
                      : 'Tap once for phrase, tap again to open'
              }
            >
              <div className="relative flex h-full w-full items-center justify-center">
                <span>{cell.day}</span>
                {!hasMessage && <span className="absolute bottom-1 text-[0.58rem] leading-none">-</span>}
              </div>
            </button>
          );
        })}
      </div>

      <div className="calendar-hover-stage min-h-[11rem] px-2">
        {hoverPreview ? (
          <div
            className={`calendar-hover-bubble calendar-chat-bubble w-fit max-w-[92%] rounded-2xl border px-5 py-3 shadow-xl ${
              hoverPreviewLocked ? 'calendar-hover-bubble-locked calendar-hover-bubble-clickable' : 'calendar-hover-bubble-unlocked'
            }`}
            style={{
              fontSize: 'calc(1.32rem * var(--app-font-scale, 1))',
              lineHeight: 1.45,
              color: 'rgb(var(--calendar-hover-text-rgb, var(--app-text-rgb)) / 1)',
            }}
            onClick={hoverPreviewLocked ? handleHoverBubbleTap : undefined}
            onKeyDown={
              hoverPreviewLocked
                ? (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleHoverBubbleTap();
                    }
                  }
                : undefined
            }
            role={hoverPreviewLocked ? 'button' : undefined}
            tabIndex={hoverPreviewLocked ? 0 : undefined}
            title={hoverPreviewLocked ? '點氣泡可提前解鎖' : undefined}
          >
            {hoverPreview.phrase}
          </div>
        ) : (
          <div className="h-1" />
        )}

        {showChibi && (
          <img
            src={chibiSources[chibiIndex]}
            alt="Q版角色"
            className="calendar-chibi mt-2 object-contain opacity-90 select-none"
            style={{ width: 'calc(10.5rem * var(--app-font-scale, 1))', height: 'calc(10.5rem * var(--app-font-scale, 1))' }}
            loading="lazy"
            onError={() => setShowChibi(false)}
          />
        )}
      </div>

      {messageListDate && (
        <div className="fixed inset-0 z-30 flex items-start justify-center bg-black/45 px-4 pb-4 pt-[10vh] sm:pt-16">
          <div className="w-full max-w-lg rounded-2xl bg-[#fffaf2] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl text-stone-900">{messageListDate}</h2>
                <p className="mt-1 text-stone-600" style={{ fontSize: 'calc(0.9rem * var(--app-font-scale, 1))' }}>
                  這天有 {listMessages.length} 則內容
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg border border-stone-300 px-3 py-1 text-sm text-stone-600"
                onClick={() => {
                  setMessageListDate(null);
                  setTemporaryUnlockDate(null);
                }}
              >
                Close
              </button>
            </div>

            {!listUnlocked ? (
              <p
                className="mt-4 whitespace-pre-wrap rounded-xl border border-stone-300/70 bg-white/90 p-4 leading-relaxed text-stone-800"
                style={{ fontSize: 'calc(0.92rem * var(--app-font-scale, 1))' }}
              >
                這天還沒到，先抱一下再等等我。
              </p>
            ) : (
              <div className="mt-4 max-h-[58vh] space-y-2 overflow-y-auto rounded-xl border border-stone-300/70 bg-white/90 p-3">
                {listMessages.map((message, index) => (
                  <button
                    key={`${messageListDate}-${index}`}
                    type="button"
                    className="w-full rounded-xl border border-stone-200/90 bg-white px-3 py-2 text-left transition hover:border-stone-300 hover:bg-stone-50"
                    onClick={() => {
                      setSelectedMessageIndex(index);
                      setSelectedDate(messageListDate);
                      setMessageListDate(null);
                    }}
                  >
                    <p className="text-xs uppercase tracking-[0.14em] text-stone-500">第 {index + 1} 則</p>
                    <p className="mt-1 text-stone-800" style={{ fontSize: 'calc(0.92rem * var(--app-font-scale, 1))' }}>
                      {messagePreview(message)}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {selectedDate && (
        <div className="fixed inset-0 z-30 flex items-start justify-center bg-black/45 px-4 pb-4 pt-[10vh] sm:pt-16">
          <div className="w-full max-w-lg rounded-2xl bg-[#fffaf2] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl text-stone-900">{selectedDate}</h2>
                <p className="mt-1 text-stone-600" style={{ fontSize: 'calc(0.9rem * var(--app-font-scale, 1))' }}>
                  {selectedHoverPhrase}
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg border border-stone-300 px-3 py-1 text-sm text-stone-600"
                onClick={() => {
                  setSelectedDate(null);
                  setSelectedMessageIndex(0);
                  setTemporaryUnlockDate(null);
                }}
              >
                Close
              </button>
            </div>

            <p
              className="mt-4 max-h-[58vh] overflow-y-auto whitespace-pre-wrap rounded-xl border border-stone-300/70 bg-white/90 p-4 leading-relaxed text-stone-800"
              style={{ fontSize: 'calc(0.92rem * var(--app-font-scale, 1))' }}
            >
              {!selectedMessage
                ? '這天還沒有內容。'
                : selectedUnlocked
                  ? selectedMessage
                  : '這天還沒到，先抱一下再等等我。'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
