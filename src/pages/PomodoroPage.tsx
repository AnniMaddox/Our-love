import { useEffect, useMemo, useState } from 'react';

import { CHIBI_POOL_UPDATED_EVENT, getScopedMixedChibiSources } from '../lib/chibiPool';

type PomodoroMode = 'focus' | 'shortBreak' | 'longBreak';

type ModeConfig = {
  label: string;
  totalSeconds: number;
  accentClass: string;
};

const MODE_CONFIG: Record<PomodoroMode, ModeConfig> = {
  focus: {
    label: '專注',
    totalSeconds: 25 * 60,
    accentClass: 'text-rose-500',
  },
  shortBreak: {
    label: '短休息',
    totalSeconds: 5 * 60,
    accentClass: 'text-emerald-500',
  },
  longBreak: {
    label: '長休息',
    totalSeconds: 15 * 60,
    accentClass: 'text-sky-500',
  },
};

function formatClock(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function pickNextMode(mode: PomodoroMode, nextFocusCount: number): PomodoroMode {
  if (mode === 'focus') {
    return nextFocusCount % 4 === 0 ? 'longBreak' : 'shortBreak';
  }
  return 'focus';
}

function pickNextChibiIndex(current: number, total: number) {
  if (total <= 1) return 0;
  let next = current;
  while (next === current) {
    next = Math.floor(Math.random() * total);
  }
  return next;
}

type PomodoroPageProps = {
  onExit?: () => void;
};

export function PomodoroPage({ onExit }: PomodoroPageProps) {
  const [mode, setMode] = useState<PomodoroMode>('focus');
  const [isRunning, setIsRunning] = useState(false);
  const [focusCount, setFocusCount] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(MODE_CONFIG.focus.totalSeconds);
  const [chibiPoolVersion, setChibiPoolVersion] = useState(0);
  const fallbackChibiSrc = `${import.meta.env.BASE_URL}chibi/chibi-00.webp`;
  const chibiSources = useMemo(() => {
    const active = getScopedMixedChibiSources('pomodoro');
    return active.length ? active : [fallbackChibiSrc];
  }, [chibiPoolVersion, fallbackChibiSrc]);
  const [chibiIndex, setChibiIndex] = useState(0);

  const activeConfig = MODE_CONFIG[mode];
  const progress = useMemo(() => {
    const total = activeConfig.totalSeconds;
    if (total <= 0) return 0;
    return Math.max(0, Math.min(1, 1 - secondsLeft / total));
  }, [activeConfig.totalSeconds, secondsLeft]);

  useEffect(() => {
    if (!isRunning) return;
    if (secondsLeft <= 0) return;

    const timer = window.setInterval(() => {
      setSecondsLeft((current) => (current > 0 ? current - 1 : 0));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isRunning, secondsLeft]);

  useEffect(() => {
    setChibiIndex(chibiSources.length ? Math.floor(Math.random() * chibiSources.length) : 0);
  }, [chibiSources]);

  useEffect(() => {
    const handlePoolUpdate = () => setChibiPoolVersion((current) => current + 1);
    window.addEventListener(CHIBI_POOL_UPDATED_EVENT, handlePoolUpdate);
    return () => window.removeEventListener(CHIBI_POOL_UPDATED_EVENT, handlePoolUpdate);
  }, []);

  useEffect(() => {
    if (!isRunning || secondsLeft > 0) {
      return;
    }

    const nextFocusCount = mode === 'focus' ? focusCount + 1 : focusCount;
    const nextMode = pickNextMode(mode, nextFocusCount);

    setFocusCount(nextFocusCount);
    setMode(nextMode);
    setSecondsLeft(MODE_CONFIG[nextMode].totalSeconds);
    setChibiIndex((current) => pickNextChibiIndex(current, chibiSources.length));
    setIsRunning(false);
  }, [chibiSources.length, focusCount, isRunning, mode, secondsLeft]);

  function switchMode(nextMode: PomodoroMode) {
    setMode(nextMode);
    setSecondsLeft(MODE_CONFIG[nextMode].totalSeconds);
    setIsRunning(false);
  }

  function resetCurrentMode() {
    setSecondsLeft(MODE_CONFIG[mode].totalSeconds);
    setIsRunning(false);
  }

  function skipToNextMode() {
    const nextFocusCount = mode === 'focus' ? focusCount + 1 : focusCount;
    const nextMode = pickNextMode(mode, nextFocusCount);

    if (mode === 'focus') {
      setFocusCount(nextFocusCount);
    }
    setMode(nextMode);
    setSecondsLeft(MODE_CONFIG[nextMode].totalSeconds);
    setChibiIndex((current) => pickNextChibiIndex(current, chibiSources.length));
    setIsRunning(false);
  }

  return (
    <div className="relative mx-auto flex h-full w-full max-w-xl flex-col gap-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <header className="calendar-header-panel rounded-2xl border p-4 shadow-sm">
        <p className="uppercase tracking-[0.18em] text-stone-500" style={{ fontSize: 'var(--ui-hint-text-size, 9px)' }}>
          Pomodoro
        </p>
        <h1 className="mt-1 text-stone-900" style={{ fontSize: 'var(--ui-header-title-size, 17px)' }}>
          番茄鐘
        </h1>
        <p className="mt-1 text-stone-500" style={{ fontSize: 'var(--ui-hint-text-size, 9px)' }}>
          完成專注：{focusCount} 回合
        </p>
      </header>

      <section className="rounded-3xl border border-white/45 bg-white/65 px-5 py-6 shadow-[0_18px_50px_rgba(0,0,0,0.12)] backdrop-blur">
        <div className="mb-5 grid grid-cols-3 gap-2">
          {(['focus', 'shortBreak', 'longBreak'] as const).map((entry) => (
            <button
              key={entry}
              type="button"
              onClick={() => switchMode(entry)}
              className={`rounded-xl border px-2 py-2 text-sm transition active:scale-95 ${
                mode === entry
                  ? 'border-stone-800 bg-stone-800 text-white'
                  : 'border-stone-300 bg-white/80 text-stone-700'
              }`}
            >
              {MODE_CONFIG[entry].label}
            </button>
          ))}
        </div>

        <div className="relative mx-auto grid h-52 w-52 place-items-center rounded-full border border-white/70 bg-white/80 shadow-inner">
          <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 120 120" aria-hidden="true">
            <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(120,113,108,0.18)" strokeWidth="8" />
            <circle
              cx="60"
              cy="60"
              r="52"
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 52}`}
              strokeDashoffset={`${(1 - progress) * 2 * Math.PI * 52}`}
              className={activeConfig.accentClass}
            />
          </svg>
          <div className="text-center">
            <p className={`text-xs tracking-[0.2em] ${activeConfig.accentClass}`}>{activeConfig.label.toUpperCase()}</p>
            <p className="mt-1 text-5xl font-semibold tracking-tight text-stone-800">{formatClock(secondsLeft)}</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setIsRunning((current) => !current)}
            className="rounded-xl border border-stone-800 bg-stone-800 px-3 py-2.5 text-sm text-white transition active:scale-95"
          >
            {isRunning ? '暫停' : '開始'}
          </button>
          <button
            type="button"
            onClick={resetCurrentMode}
            className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-700 transition active:scale-95"
          >
            重設
          </button>
          <button
            type="button"
            onClick={skipToNextMode}
            className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-700 transition active:scale-95"
          >
            下一段
          </button>
        </div>

      </section>

      {chibiSources.length > 0 && onExit && (
        <button
          type="button"
          onClick={onExit}
          className="absolute bottom-1 right-1 z-20 transition active:scale-95"
          aria-label="返回首頁"
          title="點小人返回首頁"
        >
          <img
            src={chibiSources[chibiIndex]}
            alt=""
            draggable={false}
            className="calendar-chibi w-[8rem] select-none"
            loading="lazy"
          />
        </button>
      )}

      {chibiSources.length > 0 && !onExit && (
        <div className="mt-5 flex justify-center">
          <img
            src={chibiSources[chibiIndex]}
            alt=""
            draggable={false}
            className="calendar-chibi h-36 w-auto select-none object-contain opacity-95 drop-shadow-[0_14px_22px_rgba(0,0,0,0.24)]"
            loading="lazy"
          />
        </div>
      )}
    </div>
  );
}
