import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import bookshelfData from '../../public/data/bookshelf.json';
import { getActiveBaseChibiSources } from '../lib/chibiPool';
import './BookshelfPage.css';

const BASE = import.meta.env.BASE_URL as string;
const CHIBI_00_SRC = `${BASE}chibi/chibi-00.webp`;
const THEME_STORAGE_KEY = 'memorial-bookshelf-live-theme';
const TONE_SET_STORAGE_KEY = 'memorial-bookshelf-live-tone-set';
const HORIZONTAL_SWIPE_THRESHOLD = 40;
const CLOSE_SWIPE_THRESHOLD = 72;
const PLACEHOLDER_SUBTITLE = '待替換';

const ALL_BOOK_MODULES = import.meta.glob('../../public/books/**/*.{png,webp,jpg,jpeg}', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

type ThemeMode = 'dark' | 'warm';
type ViewMode = 'shelf' | 'detail' | 'reader';

type BookMeta = {
  id: string;
  title: string;
  subtitle?: string;
  icon?: string;
  coverImage?: string;
};

type BookTone = {
  dark: [string, string];
  warm: [string, string];
};

type Book = {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  coverImageUrl: string;
  pages: string[];
};

const BOOK_WIDTH_PATTERN = [44, 60, 36, 52, 40];
const BOOK_HEIGHT_RATIO_PATTERN = [0.85, 0.77, 0.91, 0.82, 0.87];
const BOOK_FLOAT_DISTANCE_PATTERN = [14, 18, 15, 17, 13];
const BOOK_TONE_SETS: BookTone[][] = [
  [
    { dark: ['#7c5cbc', '#5040a0'], warm: ['#922828', '#6a1414'] },
    { dark: ['#3d8a78', '#285a50'], warm: ['#2a5a38', '#183828'] },
    { dark: ['#c47830', '#9a5218'], warm: ['#8a6820', '#6a4a0c'] },
    { dark: ['#8a3a52', '#5c1e38'], warm: ['#5a3068', '#3a1848'] },
    { dark: ['#3a5a8c', '#1e3868'], warm: ['#8a3820', '#5c1e0e'] },
  ],
  [
    { dark: ['#355277', '#23395a'], warm: ['#8f3f34', '#6d281e'] },
    { dark: ['#5a4c86', '#3c2e63'], warm: ['#6a5e2a', '#4d4219'] },
    { dark: ['#2f6a60', '#1f4b43'], warm: ['#2f5a3c', '#204129'] },
    { dark: ['#7a3558', '#572141'], warm: ['#8c4f28', '#6b3518'] },
    { dark: ['#586d33', '#3e4f23'], warm: ['#5a2f5d', '#3c1f40'] },
  ],
  [
    { dark: ['#8a4343', '#5f2a2a'], warm: ['#8b5a20', '#6b4317'] },
    { dark: ['#4d5f87', '#33415f'], warm: ['#864129', '#652b1a'] },
    { dark: ['#3c7a6d', '#285447'], warm: ['#7a5328', '#5b3c1d'] },
    { dark: ['#6e4f8f', '#4a3266'], warm: ['#406642', '#2a482f'] },
    { dark: ['#8b6f34', '#5f4c25'], warm: ['#6a3d5b', '#4b2841'] },
  ],
  [
    { dark: ['#305e7a', '#1e3f56'], warm: ['#8a2f38', '#662129'] },
    { dark: ['#7d6342', '#534228'], warm: ['#2e5b37', '#1f4027'] },
    { dark: ['#70408c', '#4c2a62'], warm: ['#875c2e', '#65411f'] },
    { dark: ['#48746e', '#2d4e4a'], warm: ['#7c3560', '#5a2342'] },
    { dark: ['#84513b', '#5d3728'], warm: ['#495e8a', '#334368'] },
  ],
  [
    { dark: ['#6a3f70', '#45284b'], warm: ['#955736', '#6f3d24'] },
    { dark: ['#395c8c', '#243d61'], warm: ['#7c3a2d', '#5a291f'] },
    { dark: ['#5a6f31', '#3c4c1f'], warm: ['#2f5b43', '#20402f'] },
    { dark: ['#8a5642', '#603a2d'], warm: ['#5d3f86', '#432b63'] },
    { dark: ['#35606a', '#244248'], warm: ['#7f5f2d', '#5e451f'] },
  ],
  [
    { dark: ['#4a6e8d', '#304a63'], warm: ['#8d3f5a', '#692a42'] },
    { dark: ['#7e4f37', '#573524'], warm: ['#4e6b2a', '#34491b'] },
    { dark: ['#5a3f85', '#3d2b5e'], warm: ['#84582e', '#623f20'] },
    { dark: ['#3b7860', '#275243'], warm: ['#8a3b2e', '#65281f'] },
    { dark: ['#8b6f3e', '#5f4c2b'], warm: ['#43637e', '#2f455b'] },
  ],
];

function pickRandom<T>(items: readonly T[]) {
  if (!items.length) {
    return null;
  }
  return items[Math.floor(Math.random() * items.length)] ?? null;
}

function pickSpinePatternClass(book: Book, index: number) {
  const seed = `${book.id}-${index}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }

  const patterns = ['bsl-spine-pattern-linen', 'bsl-spine-pattern-grain', 'bsl-spine-pattern-dots'];
  const seedValue = Math.abs(hash + index * 131);
  const shouldHide = seedValue % 5 === 0;
  if (shouldHide) {
    return '';
  }
  return patterns[Math.floor(seedValue / 3) % patterns.length]!;
}

function normalizeSubtitle(value: string | undefined) {
  const normalized = (value ?? '').trim();
  if (!normalized || normalized === PLACEHOLDER_SUBTITLE) {
    return '';
  }
  return normalized;
}

function buildBook(meta: BookMeta, index: number): Book {
  const entries = Object.entries(ALL_BOOK_MODULES).filter(([path]) => path.includes(`/books/${meta.id}/`));

  const coverEntry = entries.find(([path]) => (path.split('/').pop()?.toLowerCase() ?? '').startsWith('cover'));

  const pages = entries
    .filter(([path]) => !(path.split('/').pop()?.toLowerCase() ?? '').startsWith('cover'))
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
    .map(([, url]) => url);

  const rawCover = (meta.coverImage ?? '').trim();
  const coverImageUrl = rawCover
    ? rawCover.startsWith('http') || rawCover.startsWith('data:')
      ? rawCover
      : `${BASE}${rawCover.startsWith('/') ? rawCover.slice(1) : rawCover}`
    : coverEntry?.[1] ?? '';

  return {
    id: meta.id,
    title: (meta.title ?? '').trim() || `書本 ${index + 1}`,
    subtitle: normalizeSubtitle(meta.subtitle),
    icon: (meta.icon ?? '').trim() || '📖',
    coverImageUrl,
    pages,
  };
}

function computeBookHeights(bookCount: number, viewportHeight: number) {
  const available = Math.max(320, viewportHeight - 70 - 16 - 72);
  return Array.from({ length: bookCount }, (_, index) =>
    Math.round(available * BOOK_HEIGHT_RATIO_PATTERN[index % BOOK_HEIGHT_RATIO_PATTERN.length]!),
  );
}

function classNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

export function BookshelfPage({ onExit }: { onExit: () => void }) {
  const books = useMemo(() => (bookshelfData as BookMeta[]).map(buildBook), []);

  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [mode, setMode] = useState<ViewMode>('shelf');
  const [toneSetIndex, setToneSetIndex] = useState(0);
  const [selectedBookIndex, setSelectedBookIndex] = useState<number | null>(null);
  const [detailActive, setDetailActive] = useState(false);
  const [readerPageIndex, setReaderPageIndex] = useState(0);
  const [enteredCount, setEnteredCount] = useState(0);
  const [chibiShown, setChibiShown] = useState(false);
  const [chibiSrc] = useState(() => pickRandom(getActiveBaseChibiSources()) ?? CHIBI_00_SRC);
  const [bookHeights, setBookHeights] = useState<number[]>([]);

  const animatingRef = useRef(false);
  const openTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'dark' || saved === 'warm') {
        setTheme(saved);
      }

      const savedToneSet = Number.parseInt(window.localStorage.getItem(TONE_SET_STORAGE_KEY) ?? '', 10);
      if (Number.isInteger(savedToneSet) && savedToneSet >= 0 && savedToneSet < BOOK_TONE_SETS.length) {
        setToneSetIndex(savedToneSet);
      }
    } catch {
      // ignore storage error
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignore storage error
    }
  }, [theme]);

  useEffect(() => {
    try {
      window.localStorage.setItem(TONE_SET_STORAGE_KEY, String(toneSetIndex));
    } catch {
      // ignore storage error
    }
  }, [toneSetIndex]);

  useEffect(() => {
    setEnteredCount(0);
    setChibiShown(false);

    const timers: number[] = [];
    books.forEach((_, index) => {
      timers.push(
        window.setTimeout(() => {
          setEnteredCount((current) => Math.max(current, index + 1));
        }, 320 + index * 90),
      );
    });

    timers.push(
      window.setTimeout(
        () => setChibiShown(true),
        320 + books.length * 90 + 220,
      ),
    );

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [books]);

  useEffect(() => {
    const updateHeights = () => {
      setBookHeights(computeBookHeights(books.length, window.innerHeight));
    };

    updateHeights();
    window.addEventListener('resize', updateHeights);
    return () => window.removeEventListener('resize', updateHeights);
  }, [books.length]);

  useEffect(() => {
    return () => {
      if (openTimerRef.current !== null) {
        window.clearTimeout(openTimerRef.current);
      }
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  const selectedBook = selectedBookIndex !== null ? books[selectedBookIndex] ?? null : null;
  const hasSelection = selectedBookIndex !== null;
  const toneSet = BOOK_TONE_SETS[toneSetIndex % BOOK_TONE_SETS.length] ?? BOOK_TONE_SETS[0]!;

  function getToneForBook(index: number) {
    return toneSet[index % toneSet.length]!;
  }

  const detailTopBackground = selectedBook
    ? (() => {
        const tone = getToneForBook(selectedBookIndex ?? 0);
        const colors = theme === 'dark' ? tone.dark : tone.warm;
        return `linear-gradient(145deg, ${colors[0]}, ${colors[1]})`;
      })()
    : undefined;

  function toggleTheme() {
    setTheme((current) => (current === 'dark' ? 'warm' : 'dark'));
  }

  function cycleToneSet() {
    setToneSetIndex((current) => (current + 1) % BOOK_TONE_SETS.length);
  }

  function openBook(index: number) {
    if (animatingRef.current || mode !== 'shelf') {
      return;
    }

    animatingRef.current = true;
    setSelectedBookIndex(index);

    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current);
    }

    openTimerRef.current = window.setTimeout(() => {
      setMode('detail');
      setDetailActive(true);
      animatingRef.current = false;
      openTimerRef.current = null;
    }, 160);
  }

  function closeDetail() {
    if (animatingRef.current || mode !== 'detail') {
      return;
    }

    animatingRef.current = true;
    setDetailActive(false);

    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
    }

    closeTimerRef.current = window.setTimeout(() => {
      setMode('shelf');
      setSelectedBookIndex(null);
      animatingRef.current = false;
      closeTimerRef.current = null;
    }, 420);
  }

  function handleOverlayClick(event: React.MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      closeDetail();
    }
  }

  function startReader() {
    if (!selectedBook) {
      return;
    }
    setMode('reader');
    setDetailActive(false);
    setReaderPageIndex(0);
  }

  function closeReaderToShelf() {
    setMode('shelf');
    setSelectedBookIndex(null);
    setReaderPageIndex(0);
  }

  if (mode === 'reader' && selectedBook) {
    return (
      <BookReaderView
        theme={theme}
        pages={selectedBook.pages}
        pageIndex={readerPageIndex}
        onPageIndexChange={setReaderPageIndex}
        onClose={closeReaderToShelf}
      />
    );
  }

  return (
    <div className={classNames('bsl-root', theme === 'dark' ? 'bsl-theme-dark' : 'bsl-theme-warm')}>
      <div className="bsl-app">
        <header className="bsl-top-bar">
          <div className="bsl-top-actions">
            <button
              type="button"
              className="bsl-color-btn"
              onClick={cycleToneSet}
              aria-label="切換書本配色"
              title="切換書本配色"
            >
              🖍️
            </button>
            <button
              type="button"
              className="bsl-theme-btn"
              onClick={toggleTheme}
              aria-label="切換主題"
              title="切換主題"
            >
              {theme === 'dark' ? '🌙' : '🌿'}
            </button>
          </div>
        </header>

        <div className="bsl-shelf-container">
          <div className="bsl-shelf-glow" />

          <div className={classNames('bsl-books-row', hasSelection && 'has-selection')}>
            {books.length === 0 ? (
              <div className="bsl-empty">書架還是空的，等你把書放進來</div>
            ) : (
              books.map((book, index) => {
                const tone = getToneForBook(index);
                const [from, to] = theme === 'dark' ? tone.dark : tone.warm;
                const style = {
                  width: `${BOOK_WIDTH_PATTERN[index % BOOK_WIDTH_PATTERN.length]}px`,
                  height: `${bookHeights[index] ?? 360}px`,
                  background: `linear-gradient(165deg, ${from} 0%, ${to} 100%)`,
                  '--bsl-float-delay': `${(index % 5) * 0.32}s`,
                  '--bsl-float-duration': `${5.8 + (index % 4) * 0.55}s`,
                  '--bsl-float-distance': `${BOOK_FLOAT_DISTANCE_PATTERN[index % BOOK_FLOAT_DISTANCE_PATTERN.length]}px`,
                } as CSSProperties;

                return (
                  <button
                    key={book.id}
                    type="button"
                    aria-label={`打開：${book.title}`}
                    className={classNames(
                      'bsl-book',
                      pickSpinePatternClass(book, index),
                      index < enteredCount && 'entered',
                      hasSelection && selectedBookIndex === index && 'lifted',
                      hasSelection && selectedBookIndex !== index && 'dimmed',
                    )}
                    style={style}
                    onClick={() => openBook(index)}
                  >
                    <div className="bsl-pages-edge" />
                    <div className="bsl-spine-content">
                      <span className="bsl-spine-title">{book.title}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="bsl-shelf-plank" />
          <div className="bsl-shelf-floor" />

          <button
            type="button"
            className={classNames('bsl-shelf-chibi', chibiShown && 'shown')}
            onClick={onExit}
            aria-label="返回首頁"
            title="返回首頁"
          >
            <img
              src={chibiSrc}
              alt=""
              draggable={false}
              className="bsl-chibi-img"
            />
          </button>
        </div>

        <div
          className={classNames('bsl-detail-overlay', mode === 'detail' && detailActive && 'active')}
          onClick={handleOverlayClick}
        >
          <button
            type="button"
            className="bsl-close-btn"
            onClick={closeDetail}
            aria-label="關閉封面"
          >
            ✕
          </button>

          <div
            className={classNames('bsl-detail-cover', 'bsl-detail-cover-clickable')}
            onClick={(event) => {
              event.stopPropagation();
              startReader();
            }}
          >
            <div className="bsl-cover-top" style={{ background: detailTopBackground }}>
              <span className="bsl-cover-circle bsl-cover-circle-1" />
              <span className="bsl-cover-circle bsl-cover-circle-2" />
              <span className="bsl-cover-line" />
              <div className="bsl-cover-icon">{selectedBook?.icon ?? '📖'}</div>
              <div className="bsl-cover-title">{selectedBook?.title ?? ''}</div>
              <div className="bsl-cover-sub">{selectedBook?.subtitle || ' '}</div>
            </div>
          </div>

          <div className="bsl-detail-info">
            <div className="bsl-detail-title">{selectedBook?.title ?? ''}</div>
            {selectedBook?.subtitle ? <div className="bsl-detail-sub">{selectedBook.subtitle}</div> : null}
            <div className="bsl-detail-dots">
              {books.map((book, index) => (
                <span
                  key={book.id}
                  className={classNames('bsl-detail-dot', selectedBookIndex === index && 'active')}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="bsl-desktop-bg" aria-hidden="true" />
    </div>
  );
}

function BookReaderView({
  theme,
  pages,
  pageIndex,
  onPageIndexChange,
  onClose,
}: {
  theme: ThemeMode;
  pages: string[];
  pageIndex: number;
  onPageIndexChange: (next: number) => void;
  onClose: () => void;
}) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const swipedRef = useRef(false);

  const total = pages.length;
  const hasPrev = pageIndex > 0;
  const hasNext = pageIndex < total - 1;

  function goPrev() {
    if (!hasPrev) {
      return;
    }
    onPageIndexChange(pageIndex - 1);
  }

  function goNext() {
    if (!hasNext) {
      return;
    }
    onPageIndexChange(pageIndex + 1);
  }

  function handleTouchStart(event: React.TouchEvent<HTMLDivElement>) {
    touchStartRef.current = {
      x: event.touches[0]!.clientX,
      y: event.touches[0]!.clientY,
    };
    swipedRef.current = false;
  }

  function handleTouchEnd(event: React.TouchEvent<HTMLDivElement>) {
    const start = touchStartRef.current;
    if (!start) {
      return;
    }

    const dx = event.changedTouches[0]!.clientX - start.x;
    const dy = event.changedTouches[0]!.clientY - start.y;
    touchStartRef.current = null;

    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > HORIZONTAL_SWIPE_THRESHOLD) {
      swipedRef.current = true;
      if (dx < 0) {
        goNext();
      } else {
        goPrev();
      }
      return;
    }

    if (dy > CLOSE_SWIPE_THRESHOLD && Math.abs(dy) > Math.abs(dx)) {
      swipedRef.current = true;
      onClose();
    }
  }

  function handleClick(event: React.MouseEvent<HTMLDivElement>) {
    if (swipedRef.current) {
      swipedRef.current = false;
      return;
    }

    if (total === 0) {
      onClose();
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const width = rect.width;

    if (x <= width * 0.35) {
      goPrev();
    } else if (x >= width * 0.65) {
      goNext();
    }
  }

  return (
    <div className={classNames('bsl-reader', theme === 'dark' ? 'bsl-theme-dark' : 'bsl-theme-warm')}>
      {total === 0 ? (
        <div
          className="bsl-reader-empty"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onClick={handleClick}
        >
          <div className="bsl-reader-empty-icon">📖</div>
          <p>這本書還沒有頁面</p>
        </div>
      ) : (
        <div
          className="bsl-reader-surface"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onClick={handleClick}
        >
          <img
            key={`${pages[pageIndex]}-${pageIndex}`}
            src={pages[pageIndex]}
            alt=""
            draggable={false}
            className="bsl-reader-image"
          />
        </div>
      )}
    </div>
  );
}
