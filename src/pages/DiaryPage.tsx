import { useEffect, useMemo, useState } from 'react';
import { loadDiaries, type StoredDiary } from '../lib/diaryDB';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BASE = import.meta.env.BASE_URL as string;

// Chibi: 01–35, never 00
const CHIBI_COUNT = 35;
function randomChibiSrc() {
  const idx = Math.floor(Math.random() * CHIBI_COUNT) + 1;
  return `${BASE}chibi/chibi-${String(idx).padStart(2, '0')}.webp`;
}

// Cover images from public/diary-covers/
const COVER_MODULES = import.meta.glob(
  '../../public/diary-covers/*.{jpg,jpeg,png,webp,avif}',
  { eager: true, import: 'default' },
) as Record<string, string>;
const COVER_SRCS = Object.values(COVER_MODULES);

function pickRandom<T>(arr: T[]): T | null {
  if (arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)]!;
}

// ─── DiaryPage ────────────────────────────────────────────────────────────────

export function DiaryPage({
  diaryCoverImageUrl = '',
  diaryFontFamily = '',
  diaryCoverFitMode = 'cover',
}: {
  diaryCoverImageUrl?: string;
  diaryFontFamily?: string;
  diaryCoverFitMode?: 'cover' | 'contain';
}) {
  const [entries, setEntries] = useState<StoredDiary[]>([]);
  const [openEntry, setOpenEntry] = useState<StoredDiary | null>(null);
  const [chibiSrc] = useState(randomChibiSrc);

  // Cover: settings URL takes priority, then random from folder, then ''
  const coverSrc = useMemo(() => {
    if (diaryCoverImageUrl) return diaryCoverImageUrl;
    return pickRandom(COVER_SRCS) ?? '';
  }, [diaryCoverImageUrl]);

  useEffect(() => {
    loadDiaries().then(setEntries);
  }, []);

  function openRandom() {
    if (entries.length === 0) return;
    setOpenEntry(pickRandom(entries));
  }

  function openNext() {
    if (entries.length <= 1) return;
    const others = entries.filter((e) => e.name !== openEntry?.name);
    setOpenEntry(pickRandom(others));
  }

  if (openEntry) {
    return (
      <DiaryReadView
        entry={openEntry}
        chibiSrc={chibiSrc}
        fontFamily={diaryFontFamily}
        hasMore={entries.length > 1}
        onClose={() => setOpenEntry(null)}
        onNext={openNext}
      />
    );
  }

  return (
    <DiaryBookCover
      coverSrc={coverSrc}
      coverFitMode={diaryCoverFitMode}
      entryCount={entries.length}
      onOpen={openRandom}
    />
  );
}

// ─── DiaryBookCover ───────────────────────────────────────────────────────────

function DiaryBookCover({
  coverSrc,
  coverFitMode,
  entryCount,
  onOpen,
}: {
  coverSrc: string;
  coverFitMode: 'cover' | 'contain';
  entryCount: number;
  onOpen: () => void;
}) {
  return (
    <div
      className="relative mx-auto flex w-full max-w-xl cursor-pointer select-none flex-col items-center justify-end overflow-hidden"
      style={{ height: 'calc(100dvh - 72px)' }}
      onClick={onOpen}
    >
      {/* Cover image or gradient fallback */}
      {coverSrc ? (
        <>
          {coverFitMode === 'cover' ? (
            <img
              src={coverSrc}
              alt=""
              draggable={false}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <>
              <img
                src={coverSrc}
                alt=""
                draggable={false}
                className="absolute inset-0 h-full w-full object-cover opacity-35 blur-xl"
              />
              <div
                className="absolute inset-0"
                style={{
                  background:
                    'linear-gradient(165deg, rgba(17,24,39,0.28) 0%, rgba(17,24,39,0.12) 55%, rgba(17,24,39,0.26) 100%)',
                }}
              />
              <img
                src={coverSrc}
                alt=""
                draggable={false}
                className="absolute inset-0 h-full w-full object-contain p-4"
              />
            </>
          )}
        </>
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(160deg, #fde9d7 0%, #e8d5c4 40%, #c9b8a8 100%)',
          }}
        />
      )}

      {/* Dark vignette overlay at bottom */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(to top, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.18) 55%, transparent 100%)',
        }}
      />

      {/* Title card */}
      <div className="relative z-10 w-full px-6 pb-10">
        <div
          className="rounded-2xl px-6 py-5"
          style={{
            background: 'rgba(255,255,255,0.12)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            border: '1px solid rgba(255,255,255,0.28)',
          }}
        >
          <p className="text-xs uppercase tracking-[0.22em] text-white/70">日記</p>
          <h1
            className="mt-1 text-2xl leading-snug text-white"
            style={{ fontFamily: 'var(--app-heading-family)' }}
          >
            Michael 寫給 Anni
          </h1>

          <div className="mt-4 flex items-center justify-between">
            {entryCount > 0 ? (
              <p className="text-sm text-white/70">共 {entryCount} 篇</p>
            ) : (
              <p className="text-sm text-white/50">（尚未匯入日記）</p>
            )}
            <div
              className="rounded-full px-4 py-1.5 text-xs font-medium text-white/90"
              style={{ background: 'rgba(255,255,255,0.2)' }}
            >
              點一下隨機翻開 ✦
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── DiaryReadView ────────────────────────────────────────────────────────────

function DiaryReadView({
  entry,
  chibiSrc,
  fontFamily,
  hasMore,
  onClose,
  onNext,
}: {
  entry: StoredDiary;
  chibiSrc: string;
  fontFamily: string;
  hasMore: boolean;
  onClose: () => void;
  onNext: () => void;
}) {
  const effectiveFont = fontFamily || 'var(--app-font-family)';

  return (
    <div
      className="mx-auto flex w-full max-w-xl flex-col"
      style={{ height: 'calc(100dvh - 72px)', fontFamily: effectiveFont }}
    >
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="calendar-header-panel shrink-0 rounded-b-none rounded-t-2xl border border-b-0 px-5 py-4">
        <p
          className="text-lg leading-snug text-stone-800"
          style={{ fontFamily: 'var(--app-heading-family)' }}
        >
          {entry.title}
        </p>
        <p className="mt-0.5 text-xs text-stone-400">
          {new Date(entry.importedAt).toLocaleDateString('zh-TW', {
            year: 'numeric', month: 'long', day: 'numeric',
          })}
        </p>
      </header>

      {/* ── Content ────────────────────────────────────────────────── */}
      <div
        className="min-h-0 flex-1 overflow-y-auto rounded-b-2xl border border-t-0 border-stone-200 bg-white/90 px-6 py-5 shadow-sm"
      >
        {entry.htmlContent ? (
          <div
            className="diary-html-content text-sm leading-relaxed text-stone-700"
            dangerouslySetInnerHTML={{ __html: entry.htmlContent }}
          />
        ) : (
          <div className="text-sm leading-relaxed text-stone-700">
            {entry.content.split('\n').map((line, i) => (
              <p key={i} className={line === '' ? 'mt-4' : 'mt-0'}>
                {line || '\u00A0'}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* ── Action bar ─────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-end justify-center gap-4 pb-1 pt-2">
        {hasMore && (
          <button
            type="button"
            onClick={onNext}
            className="rounded-xl border border-amber-300 bg-amber-50 px-5 py-2.5 text-sm text-amber-900 shadow-sm transition active:scale-95"
          >
            下一篇
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="flex flex-col items-center gap-0.5 transition active:scale-90"
        >
          <img
            src={chibiSrc}
            alt="回封面"
            draggable={false}
            className="calendar-chibi w-20 select-none"
          />
          <span className="text-[10px] text-stone-400">回封面</span>
        </button>
      </div>
    </div>
  );
}
