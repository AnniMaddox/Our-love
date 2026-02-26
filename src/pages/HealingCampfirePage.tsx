import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';

import './HealingCampfirePage.css';

type HealingCampfireDoc = {
  id: string;
  order: number;
  title: string;
  dateLabel: string;
  sourceFile: string;
  sourceRelPath: string;
  contentPath: string;
  preview: string;
  searchText: string;
};

type HealingCampfireIndexPayload = {
  version?: number;
  generatedAt?: string;
  total?: number;
  docs?: Array<Partial<HealingCampfireDoc>>;
};

type HealingCampfirePageProps = {
  onExit: () => void;
  campfireFontFamily?: string;
};

type FontMode = 'default' | 'campfire';
type ListMode = 'all' | 'favorites';

type StarDot = {
  id: number;
  size: number;
  left: number;
  top: number;
  opacity: number;
  duration: number;
  delay: number;
  animation: 'hcTwinkle1' | 'hcTwinkle2';
};

type SparkParticle = {
  id: number;
  x: number;
  y: number;
  size: number;
  tx: number;
  ty: number;
  duration: number;
  bright: boolean;
};

const BASE = import.meta.env.BASE_URL as string;
const INDEX_URL = `${BASE}data/healing-campfire/index.json`;

const FONT_MODE_KEY = 'memorial-healing-campfire-font-mode-v2';
const FONT_SIZE_KEY = 'memorial-healing-campfire-font-size-v1';
const LINE_HEIGHT_KEY = 'memorial-healing-campfire-line-height-v1';
const FAVORITES_KEY = 'memorial-healing-campfire-favorites-v1';

const OPEN_READ_DELAY_MS = 500;
const REDRAW_DELAY_MS = 400;

function normalizeText(text: string) {
  return text.replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n').trim();
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function loadNumberPreference(key: string, min: number, max: number, fallback: number) {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return clampNumber(Number(raw), min, max, fallback);
  } catch {
    return fallback;
  }
}

function saveNumberPreference(key: string, value: number) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, String(value));
}

function loadFontMode(): FontMode {
  if (typeof window === 'undefined') return 'campfire';
  try {
    const stored = window.localStorage.getItem(FONT_MODE_KEY);
    if (stored === 'default' || stored === 'campfire') {
      return stored;
    }
    return 'campfire';
  } catch {
    return 'campfire';
  }
}

function saveFontMode(mode: FontMode) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(FONT_MODE_KEY, mode);
}

function loadFavoriteIds() {
  if (typeof window === 'undefined') return {} as Record<string, true>;
  try {
    const raw = window.localStorage.getItem(FAVORITES_KEY);
    if (!raw) return {} as Record<string, true>;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return {} as Record<string, true>;

    const next: Record<string, true> = {};
    parsed.forEach((item) => {
      if (typeof item !== 'string') return;
      const id = item.trim();
      if (!id) return;
      next[id] = true;
    });
    return next;
  } catch {
    return {} as Record<string, true>;
  }
}

function saveFavoriteIds(map: Record<string, true>) {
  if (typeof window === 'undefined') return;
  const ids = Object.keys(map).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));
}

function normalizeDoc(input: Partial<HealingCampfireDoc>): HealingCampfireDoc | null {
  const id = typeof input.id === 'string' ? input.id.trim() : '';
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const contentPathRaw = typeof input.contentPath === 'string' ? input.contentPath.trim() : '';
  if (!id || !title || !contentPathRaw) return null;

  const order = typeof input.order === 'number' && Number.isFinite(input.order) ? Math.max(0, Math.round(input.order)) : 0;
  const dateLabel = typeof input.dateLabel === 'string' && input.dateLabel.trim() ? input.dateLabel.trim() : '想妳的時候';
  const sourceFile = typeof input.sourceFile === 'string' ? input.sourceFile.trim() : '';
  const sourceRelPath = typeof input.sourceRelPath === 'string' ? input.sourceRelPath.trim() : sourceFile;
  const preview = typeof input.preview === 'string' ? input.preview.trim() : '';
  const searchText =
    typeof input.searchText === 'string' && input.searchText.trim()
      ? input.searchText.trim()
      : `${title}\n${preview}\n${sourceFile}`;

  return {
    id,
    order,
    title,
    dateLabel,
    sourceFile,
    sourceRelPath,
    contentPath: contentPathRaw.replace(/^\.?\//, ''),
    preview,
    searchText,
  };
}

function shuffle<T>(items: readonly T[]) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    const current = next[index];
    next[index] = next[randomIndex];
    next[randomIndex] = current;
  }
  return next;
}

function createStars() {
  return Array.from({ length: 80 }, (_, index) => ({
    id: index,
    size: Math.random() * 2 + 0.5,
    left: Math.random() * 100,
    top: Math.random() * 60,
    opacity: 0.3 + Math.random() * 0.7,
    duration: 1.4 + Math.random() * 2.8,
    delay: Math.random() * 5,
    animation: index % 2 === 0 ? 'hcTwinkle1' : 'hcTwinkle2',
  })) as StarDot[];
}

export function HealingCampfirePage({ onExit, campfireFontFamily = '' }: HealingCampfirePageProps) {
  const [docs, setDocs] = useState<HealingCampfireDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [activeId, setActiveId] = useState<string | null>(null);
  const [showRead, setShowRead] = useState(false);
  const [contentById, setContentById] = useState<Record<string, string>>({});

  const [showList, setShowList] = useState(false);
  const [listMode, setListMode] = useState<ListMode>('all');
  const [listQuery, setListQuery] = useState('');

  const [favoriteIds, setFavoriteIds] = useState<Record<string, true>>(() => loadFavoriteIds());
  const [fontMode, setFontMode] = useState<FontMode>(() => loadFontMode());
  const [showFontPanel, setShowFontPanel] = useState(false);
  const [contentFontSize, setContentFontSize] = useState(() => loadNumberPreference(FONT_SIZE_KEY, 15, 22, 17));
  const [contentLineHeight, setContentLineHeight] = useState(() =>
    loadNumberPreference(LINE_HEIGHT_KEY, 1.6, 2.3, 1.95),
  );

  const [sparks, setSparks] = useState<SparkParticle[]>([]);
  const [flashing, setFlashing] = useState(false);

  const stars = useMemo(() => createStars(), []);

  const sparkIdRef = useRef(0);
  const drawQueueRef = useRef<string[]>([]);
  const openTimerRef = useRef<number | null>(null);
  const redrawTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(INDEX_URL, { cache: 'no-store' });
        if (!response.ok) throw new Error(`讀取失敗：${response.status}`);

        const raw = (await response.json()) as HealingCampfireIndexPayload;
        const items = Array.isArray(raw.docs) ? raw.docs : [];
        const normalized = items
          .map((item) => normalizeDoc(item))
          .filter((item): item is HealingCampfireDoc => Boolean(item))
          .sort((a, b) => a.order - b.order);

        if (!active) return;
        setDocs(normalized);
      } catch (fetchError) {
        if (!active) return;
        setError(fetchError instanceof Error ? fetchError.message : '未知錯誤');
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    drawQueueRef.current = [];
  }, [docs]);

  useEffect(() => {
    if (!activeId) return;
    if (contentById[activeId] !== undefined) return;

    const doc = docs.find((item) => item.id === activeId);
    if (!doc) return;

    void (async () => {
      try {
        const response = await fetch(`${BASE}data/healing-campfire/${doc.contentPath}`, { cache: 'no-store' });
        if (!response.ok) {
          setContentById((prev) => ({ ...prev, [doc.id]: '（讀取內容失敗）' }));
          return;
        }

        const text = normalizeText(await response.text());
        setContentById((prev) => ({ ...prev, [doc.id]: text || '（這封信暫時留白）' }));
      } catch {
        setContentById((prev) => ({ ...prev, [doc.id]: '（讀取內容失敗）' }));
      }
    })();
  }, [activeId, contentById, docs]);

  useEffect(() => {
    saveFavoriteIds(favoriteIds);
  }, [favoriteIds]);

  useEffect(() => {
    saveFontMode(fontMode);
  }, [fontMode]);

  useEffect(() => {
    saveNumberPreference(FONT_SIZE_KEY, contentFontSize);
  }, [contentFontSize]);

  useEffect(() => {
    saveNumberPreference(LINE_HEIGHT_KEY, contentLineHeight);
  }, [contentLineHeight]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (Math.random() > 0.6) return;
      const width = window.innerWidth;
      const height = window.innerHeight;
      const duration = Math.random() * 3 + 2;
      const spark: SparkParticle = {
        id: sparkIdRef.current + 1,
        x: width / 2 + (Math.random() - 0.5) * 60,
        y: height * 0.9 - 80,
        size: Math.random() * 3 + 1,
        tx: (Math.random() - 0.5) * 150,
        ty: -(Math.random() * 200 + 150),
        duration,
        bright: false,
      };
      sparkIdRef.current = spark.id;
      setSparks((prev) => [...prev, spark]);
      window.setTimeout(() => {
        if (!mountedRef.current) return;
        setSparks((prev) => prev.filter((item) => item.id !== spark.id));
      }, duration * 1000);
    }, 120);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (openTimerRef.current !== null) {
        window.clearTimeout(openTimerRef.current);
      }
      if (redrawTimerRef.current !== null) {
        window.clearTimeout(redrawTimerRef.current);
      }
    };
  }, []);

  const activeDoc = useMemo(() => docs.find((item) => item.id === activeId) ?? null, [docs, activeId]);
  const activeContent = activeDoc ? contentById[activeDoc.id] ?? '讀取內容中…' : '';
  const activeIsFavorite = activeDoc ? Boolean(favoriteIds[activeDoc.id]) : false;

  const favoriteCount = useMemo(
    () => docs.reduce((count, doc) => count + (favoriteIds[doc.id] ? 1 : 0), 0),
    [docs, favoriteIds],
  );

  const normalizedQuery = listQuery.trim().toLowerCase();
  const listDocs = useMemo(() => {
    return docs.filter((doc) => {
      if (listMode === 'favorites' && !favoriteIds[doc.id]) return false;
      if (!normalizedQuery) return true;
      const haystack = `${doc.title}\n${doc.dateLabel}\n${doc.searchText}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [docs, favoriteIds, listMode, normalizedQuery]);

  const followCampfireFont = fontMode === 'campfire' && Boolean(campfireFontFamily);
  const contentFontFamily = followCampfireFont
    ? campfireFontFamily
    : "var(--app-font-family, -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif)";

  function nextDocId() {
    if (!docs.length) return null;

    if (!drawQueueRef.current.length) {
      drawQueueRef.current = shuffle(docs.map((doc) => doc.id));
    }

    return drawQueueRef.current.pop() ?? null;
  }

  function spawnBurstSparks() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    const batch: SparkParticle[] = Array.from({ length: 35 }, () => {
      const duration = Math.random() * 1.5 + 0.6;
      const nextId = sparkIdRef.current + 1;
      sparkIdRef.current = nextId;
      return {
        id: nextId,
        x: width / 2 + (Math.random() - 0.5) * 50,
        y: height * 0.9 - 50,
        size: Math.random() * 4 + 2,
        tx: (Math.random() - 0.5) * 400,
        ty: -(Math.random() * 500 + 200),
        duration,
        bright: true,
      };
    });

    setSparks((prev) => [...prev, ...batch]);
    batch.forEach((spark) => {
      window.setTimeout(() => {
        if (!mountedRef.current) return;
        setSparks((prev) => prev.filter((item) => item.id !== spark.id));
      }, spark.duration * 1000);
    });
  }

  function closeReadBase() {
    setShowRead(false);
    setShowFontPanel(false);
  }

  function drawWorry() {
    if (!docs.length) return;

    const nextId = nextDocId();
    if (!nextId) return;

    setShowList(false);
    setShowFontPanel(false);
    setFlashing(true);
    spawnBurstSparks();

    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }

    openTimerRef.current = window.setTimeout(() => {
      setActiveId(nextId);
      setShowRead(true);
      setFlashing(false);
      openTimerRef.current = null;
    }, OPEN_READ_DELAY_MS);
  }

  function drawFromCard(event: ReactMouseEvent<HTMLButtonElement>) {
    closeReadBase();
    if (redrawTimerRef.current !== null) {
      window.clearTimeout(redrawTimerRef.current);
      redrawTimerRef.current = null;
    }
    redrawTimerRef.current = window.setTimeout(() => {
      drawWorry();
      redrawTimerRef.current = null;
    }, REDRAW_DELAY_MS);
    void event;
  }

  function toggleFavorite(docId: string) {
    setFavoriteIds((prev) => {
      if (prev[docId]) {
        const next = { ...prev };
        delete next[docId];
        return next;
      }
      return { ...prev, [docId]: true };
    });
  }

  function openFromList(docId: string) {
    setShowList(false);
    setShowFontPanel(false);
    setActiveId(docId);
    setShowRead(true);
  }

  return (
    <div
      className="healing-campfire-page"
      style={{ '--healing-campfire-font-family': campfireFontFamily ? `'${campfireFontFamily}', sans-serif` : '' } as CSSProperties}
    >
      <div className="hc-sky" />

      <div className="hc-stars-layer" aria-hidden="true">
        {stars.map((star) => (
          <div
            key={star.id}
            className="hc-star"
            style={{
              width: `${star.size}px`,
              height: `${star.size}px`,
              left: `${star.left}%`,
              top: `${star.top}%`,
              opacity: star.opacity,
              animationName: star.animation,
              animationDuration: `${star.duration}s`,
              animationDelay: `${star.delay}s`,
            }}
          />
        ))}
      </div>

      <div className="hc-forest-bg" />
      <div className="hc-campfire-glow" aria-hidden="true" />

      {!showRead ? (
        <header className="hc-header">
          <button type="button" className="hc-back" onClick={onExit} aria-label="返回">
            ‹
          </button>
          <span className="hc-count">篝火池 : {docs.length}封</span>
        </header>
      ) : null}

      {!showRead ? (
        <button type="button" className="hc-list-open" onClick={() => setShowList(true)}>
          清單 · 收藏
        </button>
      ) : null}

      {!showRead ? <div className="hc-hint">把壞心情丟進火裡燒掉</div> : null}

      <div className="hc-spark-container" aria-hidden="true">
        {sparks.map((spark) => (
          <span
            key={spark.id}
            className={`hc-spark ${spark.bright ? 'is-bright' : ''}`}
            style={
              {
                left: `${spark.x}px`,
                top: `${spark.y}px`,
                width: `${spark.size}px`,
                height: `${spark.size}px`,
                '--tx': `${spark.tx}px`,
                '--ty': `${spark.ty}px`,
                animationDuration: `${spark.duration}s`,
              } as CSSProperties
            }
          />
        ))}
      </div>

      <button
        type="button"
        className={`hc-campfire-stage ${flashing ? 'flashing' : ''}`}
        onClick={drawWorry}
        aria-label="丟進一個煩惱"
      >
        <div className="hc-flames" aria-hidden="true">
          <div className="hc-flame hc-flame-main" />
          <div className="hc-flame hc-flame-left" />
          <div className="hc-flame hc-flame-right" />
          <div className="hc-flame hc-flame-center" />
        </div>
        <div className="hc-logs" aria-hidden="true">
          <div className="hc-log hc-log-1" />
          <div className="hc-log hc-log-2" />
          <div className="hc-log hc-log-3" />
        </div>
      </button>

      <div className={`hc-list-overlay ${showList ? 'show' : ''}`} onClick={() => setShowList(false)}>
        <div className="hc-list-panel" onClick={(event) => event.stopPropagation()}>
          <div className="hc-list-head">
            <p className="hc-list-title">治癒清單</p>
            <button type="button" className="hc-list-close" onClick={() => setShowList(false)}>
              關閉
            </button>
          </div>

          <div className="hc-list-meta">
            <span>全部 {docs.length}</span>
            <span>收藏 {favoriteCount}</span>
          </div>

          <div className="hc-list-filters">
            <button
              type="button"
              className={`hc-list-filter ${listMode === 'all' ? 'active' : ''}`}
              onClick={() => setListMode('all')}
            >
              全部
            </button>
            <button
              type="button"
              className={`hc-list-filter ${listMode === 'favorites' ? 'active' : ''}`}
              onClick={() => setListMode('favorites')}
            >
              收藏
            </button>
          </div>

          <input
            className="hc-list-search"
            value={listQuery}
            onChange={(event) => setListQuery(event.target.value)}
            placeholder="搜尋標題或內容"
          />

          <div className="hc-list-items">
            {listDocs.map((doc) => (
              <div className="hc-list-item" key={doc.id}>
                <button type="button" className="hc-list-main" onClick={() => openFromList(doc.id)}>
                  <span className="hc-list-item-title">{doc.title}</span>
                  <span className="hc-list-item-date">{doc.dateLabel}</span>
                </button>
                <button
                  type="button"
                  className={`hc-list-fav ${favoriteIds[doc.id] ? 'active' : ''}`}
                  onClick={() => toggleFavorite(doc.id)}
                  aria-label={favoriteIds[doc.id] ? '取消收藏' : '加入收藏'}
                >
                  {favoriteIds[doc.id] ? '📌' : '📍'}
                </button>
              </div>
            ))}

            {!listDocs.length ? <p className="hc-list-empty">目前沒有符合條件的信件</p> : null}
          </div>
        </div>
      </div>

      <div className={`hc-read-screen ${showRead ? 'open' : ''}`}>
        <div className="hc-rs-bg" onClick={closeReadBase} />
        <article className="hc-rs-card" role="dialog" aria-modal="true" aria-label="治癒信件">
          <div className="hc-rs-top">
            <div className="hc-rs-meta">
              <div className="hc-rs-from">From Sariel 🔥</div>
              <div className="hc-rs-title">{activeDoc?.title ?? '治癒篝火'}</div>
            </div>
            <button type="button" className="hc-rs-x" onClick={closeReadBase} aria-label="關閉閱讀">
              ×
            </button>
          </div>

          <div className="hc-rs-tools">
            {activeDoc ? (
              <button
                type="button"
                className={`hc-rs-tool ${activeIsFavorite ? 'active' : ''}`}
                onClick={() => toggleFavorite(activeDoc.id)}
                aria-label={activeIsFavorite ? '取消收藏' : '加入收藏'}
              >
                {activeIsFavorite ? '📌' : '📍'}
              </button>
            ) : null}
            <button
              type="button"
              className="hc-rs-tool"
              onClick={() => setShowFontPanel((prev) => !prev)}
              aria-label="文字設定"
            >
              Aa
            </button>
          </div>

          {showFontPanel ? (
            <div className="hc-font-panel">
              <p className="hc-font-title">字體來源</p>
              <div className="hc-font-row">
                <button
                  type="button"
                  className={`hc-font-mode ${fontMode === 'default' ? 'active' : ''}`}
                  onClick={() => setFontMode('default')}
                >
                  預設
                </button>
                <button
                  type="button"
                  className={`hc-font-mode ${fontMode === 'campfire' ? 'active' : ''}`}
                  onClick={() => setFontMode('campfire')}
                >
                  跟隨治癒篝火
                </button>
              </div>

              <div className="hc-font-control">
                <div className="hc-font-control-head">
                  <p className="hc-font-title">字級</p>
                  <p className="hc-font-value">{contentFontSize.toFixed(1)}px</p>
                </div>
                <input
                  type="range"
                  min={15}
                  max={22}
                  step={0.5}
                  value={contentFontSize}
                  onChange={(event) => setContentFontSize(clampNumber(Number(event.target.value), 15, 22, contentFontSize))}
                  className="hc-font-slider"
                />
              </div>

              <div className="hc-font-control">
                <div className="hc-font-control-head">
                  <p className="hc-font-title">行距</p>
                  <p className="hc-font-value">{contentLineHeight.toFixed(2)}</p>
                </div>
                <input
                  type="range"
                  min={1.6}
                  max={2.3}
                  step={0.05}
                  value={contentLineHeight}
                  onChange={(event) =>
                    setContentLineHeight(clampNumber(Number(event.target.value), 1.6, 2.3, contentLineHeight))
                  }
                  className="hc-font-slider"
                />
              </div>
            </div>
          ) : null}

          <div className="hc-rs-scroll">
            <div
              className="hc-rs-body"
              style={{
                fontFamily: contentFontFamily,
                fontSize: `${contentFontSize}px`,
                lineHeight: contentLineHeight,
              }}
            >
              {activeContent}
            </div>
            <div className="hc-rs-seal">✦ ✦ ✦</div>
          </div>

          <div className="hc-rs-bot">
            <button type="button" className="hc-rs-close" onClick={closeReadBase}>
              ← 營地
            </button>
            <button type="button" className="hc-rs-draw" onClick={drawFromCard}>
              再丟一個煩惱 ›
            </button>
          </div>
        </article>
      </div>

      {loading ? <div className="hc-status">讀取中…</div> : null}
      {!loading && error ? <div className="hc-status">讀取失敗：{error}</div> : null}
      {!loading && !error && !docs.length ? <div className="hc-status">目前沒有可抽取的信件</div> : null}
    </div>
  );
}

export default HealingCampfirePage;
