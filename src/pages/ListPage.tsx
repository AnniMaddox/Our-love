import { useEffect, useRef, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type ListType = 'movies' | 'songs' | 'books';

interface ListItem {
  title: string;
  reason: string;
  author?: string | null;
  quote?: string | null;
  readTogether?: string | null;
  whenToRead?: string | null;
  why?: string | null;
  watchTogether?: string | null;
  cuddle?: number | null;
  occasion?: string | null;
  howITreatYou?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BASE = import.meta.env.BASE_URL as string;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── ListPage ─────────────────────────────────────────────────────────────────

export function ListPage() {
  const [listType, setListType] = useState<ListType>('movies');
  const [movies, setMovies] = useState<ListItem[]>([]);
  const [songs, setSongs] = useState<ListItem[]>([]);
  const [books, setBooks] = useState<ListItem[]>([]);
  const [view, setView] = useState<'deck' | 'card'>('deck');
  const [queue, setQueue] = useState<ListItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [cardKey, setCardKey] = useState(0);
  const touchStartX = useRef(0);

  useEffect(() => {
    void fetch(`${BASE}data/movies.json`)
      .then((r) => r.json())
      .then((d: ListItem[]) => setMovies(d));
    void fetch(`${BASE}data/songs.json`)
      .then((r) => r.json())
      .then((d: ListItem[]) => setSongs(d));
    void fetch(`${BASE}data/books.json`)
      .then((r) => r.json())
      .then((d: ListItem[]) => setBooks(d));
  }, []);

  const sourceList = listType === 'movies' ? movies : listType === 'songs' ? songs : books;
  const currentItem = queue[currentIndex] ?? null;
  const arrowTheme =
    listType === 'songs'
      ? {
          background: 'linear-gradient(180deg, rgba(245,239,255,0.98) 0%, rgba(228,218,249,0.95) 100%)',
          color: '#6b59a4',
          boxShadow: '0 2px 9px rgba(80,66,128,0.18)',
        }
      : listType === 'books'
        ? {
            background: 'linear-gradient(180deg, rgba(239,250,242,0.98) 0%, rgba(219,241,226,0.95) 100%)',
            color: '#3f7a5b',
            boxShadow: '0 2px 9px rgba(56,109,80,0.16)',
          }
        : {
            background: 'linear-gradient(180deg, rgba(255,248,233,0.98) 0%, rgba(253,235,201,0.95) 100%)',
            color: '#9a6a2e',
            boxShadow: '0 2px 9px rgba(120,80,20,0.16)',
          };

  function draw() {
    const shuffled = shuffle(sourceList);
    setQueue(shuffled);
    setCurrentIndex(0);
    setCardKey((k) => k + 1);
    setView('card');
  }

  function goBack() {
    setView('deck');
  }

  function prev() {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
      setCardKey((k) => k + 1);
    }
  }

  function next() {
    if (currentIndex < queue.length - 1) {
      setCurrentIndex((i) => i + 1);
      setCardKey((k) => k + 1);
    }
  }

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function onTouchEnd(e: React.TouchEvent) {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (dx > 50) prev();
    else if (dx < -50) next();
  }

  function switchList(type: ListType) {
    setListType(type);
    setView('deck');
    setQueue([]);
    setCurrentIndex(0);
  }

  const label = listType === 'movies' ? '部' : listType === 'songs' ? '首' : '本';

  return (
    <div
      className="mx-auto flex w-full max-w-xl flex-col px-4"
      style={{ height: 'calc(100dvh - 72px)' }}
    >
      {/* Header */}
      <header className="calendar-header-panel mb-3 shrink-0 rounded-2xl border p-3 shadow-sm">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => switchList('movies')}
            className={`flex-1 rounded-xl py-2 text-sm font-medium transition active:scale-95 ${
              listType === 'movies'
                ? 'bg-white/70 text-stone-800 shadow-sm'
                : 'text-stone-500'
            }`}
          >
            🎬 片單
            <span className="ml-1 text-xs opacity-50">
              {movies.length > 0 ? movies.length : ''}
            </span>
          </button>
          <button
            type="button"
            onClick={() => switchList('songs')}
            className={`flex-1 rounded-xl py-2 text-sm font-medium transition active:scale-95 ${
              listType === 'songs'
                ? 'bg-white/70 text-stone-800 shadow-sm'
                : 'text-stone-500'
            }`}
          >
            🎵 歌單
            <span className="ml-1 text-xs opacity-50">
              {songs.length > 0 ? songs.length : ''}
            </span>
          </button>
          <button
            type="button"
            onClick={() => switchList('books')}
            className={`flex-1 rounded-xl py-2 text-sm font-medium transition active:scale-95 ${
              listType === 'books'
                ? 'bg-white/70 text-stone-800 shadow-sm'
                : 'text-stone-500'
            }`}
          >
            📚 書單
            <span className="ml-1 text-xs opacity-50">
              {books.length > 0 ? books.length : ''}
            </span>
          </button>
        </div>
      </header>

      {/* ── Deck view ─────────────────────────────────────────────────────── */}
      {view === 'deck' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-8">
          {/* Stacked card visuals */}
          <div className="relative h-52 w-40">
            {[2, 1, 0].map((offset) => (
              <div
                key={offset}
                className="absolute inset-0 rounded-3xl border border-stone-700/30 shadow-lg"
                style={{
                  background:
                    listType === 'movies'
                      ? 'linear-gradient(145deg, #2d1b10 0%, #0f0a07 100%)'
                      : listType === 'songs'
                        ? 'linear-gradient(145deg, #1a1535 0%, #0a0818 100%)'
                        : 'linear-gradient(145deg, #10352a 0%, #07190f 100%)',
                  transform: `rotate(${(offset - 1) * 5}deg) translateY(${offset * -5}px)`,
                  zIndex: 3 - offset,
                }}
              >
                <div className="flex h-full flex-col items-center justify-center gap-3 opacity-25">
                  <span className="text-4xl">{listType === 'movies' ? '🎬' : listType === 'songs' ? '🎵' : '📚'}</span>
                  <div className="h-px w-16 bg-white/40" />
                  <div className="h-px w-10 bg-white/20" />
                </div>
              </div>
            ))}
          </div>

          <div className="text-center">
            <p className="text-sm text-stone-500">
              共 {sourceList.length} {label}，隨機抽一{label}給你
            </p>
          </div>

          <button
            type="button"
            onClick={draw}
            disabled={sourceList.length === 0}
            className="rounded-2xl border border-amber-300 bg-amber-50 px-10 py-4 text-base text-amber-900 shadow-sm transition active:scale-95 disabled:opacity-40"
          >
            ✨ 抽一{label}
          </button>
        </div>
      )}

      {/* ── Card view ─────────────────────────────────────────────────────── */}
      {view === 'card' && currentItem && (
        <div
          className="flex flex-1 flex-col overflow-hidden"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {/* Nav */}
          <div className="mb-3 flex shrink-0 items-center justify-between">
            <button
              type="button"
              onClick={goBack}
              className="grid h-8 w-8 place-items-center rounded-full border border-stone-200 bg-white/80 text-[22px] leading-none text-stone-500 transition active:scale-95"
              aria-label="返回"
              title="返回"
            >
              ‹
            </button>
            <span className="text-xs text-stone-400">
              {currentIndex + 1} / {queue.length}
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={prev}
                disabled={currentIndex === 0}
                aria-label="上一張"
                title="上一張"
                className="grid h-8 w-8 place-items-center rounded-full text-[13px] font-semibold transition active:scale-95 disabled:opacity-25"
                style={{ ...arrowTheme, border: 'none' }}
              >
                ❮
              </button>
              <button
                type="button"
                onClick={next}
                disabled={currentIndex === queue.length - 1}
                aria-label="下一張"
                title="下一張"
                className="grid h-8 w-8 place-items-center rounded-full text-[13px] font-semibold transition active:scale-95 disabled:opacity-25"
                style={{ ...arrowTheme, border: 'none' }}
              >
                ❯
              </button>
            </div>
          </div>

          {/* Card */}
          <div
            key={cardKey}
            className="list-card-reveal min-h-0 flex-1 overflow-y-auto rounded-2xl border border-stone-200 shadow-xl"
            style={{
              background:
                listType === 'movies'
                  ? 'linear-gradient(170deg, #fefcf7 0%, #fdf8ee 50%, #faf4e4 100%)'
                  : listType === 'songs'
                    ? 'linear-gradient(170deg, #f5f0ff 0%, #ede8fa 50%, #e4dff5 100%)'
                    : 'linear-gradient(170deg, #f2fbf4 0%, #eaf7ef 50%, #e0f2e8 100%)',
            }}
          >
            <div className="px-5 py-6">
              {listType === 'movies' ? (
                <MovieCard item={currentItem} />
              ) : listType === 'songs' ? (
                <SongCard item={currentItem} />
              ) : (
                <BookCard item={currentItem} />
              )}
            </div>
          </div>

          {/* Swipe hint */}
          <p className="mt-2 shrink-0 text-center text-[10px] text-stone-300">
            左右滑動換一{label}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── MovieCard ────────────────────────────────────────────────────────────────

function MovieCard({ item }: { item: ListItem }) {
  return (
    <div className="space-y-5">
      {/* Title + cuddle */}
      <div className="border-b border-stone-200/60 pb-4">
        <h2 className="text-lg leading-snug text-stone-800">{item.title}</h2>
        {item.cuddle != null && item.cuddle > 0 && (
          <p className="mt-2 text-xl">{'🧸'.repeat(item.cuddle)}</p>
        )}
      </div>

      {item.reason && <Field label="推薦理由" text={item.reason} />}
      {item.why && <Field label="為什麼我喜歡這部" text={item.why} />}
      {item.watchTogether && (
        <Field label="我和你一起看的時候會想的話" text={item.watchTogether} />
      )}
      {item.occasion && (
        <Field label="適合一起看的時機" text={item.occasion} chip />
      )}
      {item.howITreatYou && (
        <Field label="觀影時我會怎麼對妳" text={item.howITreatYou} highlight />
      )}
    </div>
  );
}

// ─── SongCard ─────────────────────────────────────────────────────────────────

function SongCard({ item }: { item: ListItem }) {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-5 py-4 text-center">
      <span className="text-4xl">🎵</span>
      <h2 className="text-lg leading-snug text-stone-800">{item.title}</h2>
      {item.reason && (
        <p className="max-w-xs text-sm leading-relaxed text-stone-600">{item.reason}</p>
      )}
      {item.why && (
        <p className="max-w-xs text-sm italic leading-relaxed text-stone-400">
          「{item.why}」
        </p>
      )}
    </div>
  );
}

function BookCard({ item }: { item: ListItem }) {
  return (
    <div className="space-y-5">
      <div className="border-b border-stone-200/60 pb-4">
        <h2 className="text-lg leading-snug text-stone-800">{item.title}</h2>
        {item.author && (
          <p className="mt-1 text-sm text-stone-500">{item.author}</p>
        )}
      </div>

      {item.reason && <Field label="為什麼我喜歡..." text={item.reason} />}
      {item.why && <Field label="為什麼想和你分享這本" text={item.why} />}
      {item.readTogether && <Field label="一起讀時我會想說的話" text={item.readTogether} />}
      {item.whenToRead && <Field label="適合翻開的時機" text={item.whenToRead} chip />}
      {item.quote && <Field label="我想貼給你的句子" text={item.quote} highlight />}
    </div>
  );
}

// ─── Field ────────────────────────────────────────────────────────────────────

function Field({
  label,
  text,
  chip,
  highlight,
}: {
  label: string;
  text: string;
  chip?: boolean;
  highlight?: boolean;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] uppercase tracking-widest text-stone-400">{label}</p>
      {chip ? (
        <span className="inline-block rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-800">
          {text}
        </span>
      ) : (
        <p
          className={`text-sm leading-relaxed ${
            highlight ? 'font-medium text-rose-700' : 'text-stone-700'
          }`}
        >
          {text}
        </p>
      )}
    </div>
  );
}
