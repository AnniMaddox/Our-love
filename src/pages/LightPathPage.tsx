import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';

import './LightPathPage.css';

type LightPathDoc = {
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

type LightPathIndexPayload = {
  version?: number;
  generatedAt?: string;
  total?: number;
  docs?: Array<Partial<LightPathDoc>>;
};

type LightPathPageProps = {
  onExit: () => void;
  letterFontFamily?: string;
};

type Firefly = {
  id: number;
  x: number;
  y: number;
  size: number;
  moveDuration: number;
  flickerDuration: number;
  delay: number;
};

type FontMode = 'default' | 'letter';
type ListMode = 'all' | 'favorites';

const BASE = import.meta.env.BASE_URL as string;
const INDEX_URL = `${BASE}data/light-path/index.json`;
const FONT_MODE_KEY = 'memorial-light-path-font-mode-v1';
const FONT_SIZE_KEY = 'memorial-light-path-font-size-v1';
const LINE_HEIGHT_KEY = 'memorial-light-path-line-height-v1';
const FAVORITES_KEY = 'memorial-light-path-favorites-v1';
const CLOSE_BURST_DELAY_MS = 120;
const OPEN_OVERLAY_DELAY_MS = 860;
const REDRAW_REOPEN_DELAY_MS = 1280;

function loadFontMode(): FontMode {
  if (typeof window === 'undefined') return 'default';
  try {
    return window.localStorage.getItem(FONT_MODE_KEY) === 'letter' ? 'letter' : 'default';
  } catch {
    return 'default';
  }
}

function saveFontMode(mode: FontMode) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(FONT_MODE_KEY, mode);
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

function normalizeText(text: string) {
  return text.replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n').trim();
}

function normalizeDoc(input: Partial<LightPathDoc>): LightPathDoc | null {
  const id = typeof input.id === 'string' ? input.id.trim() : '';
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const contentPathRaw = typeof input.contentPath === 'string' ? input.contentPath.trim() : '';
  if (!id || !title || !contentPathRaw) return null;

  const order = typeof input.order === 'number' && Number.isFinite(input.order) ? Math.max(0, Math.round(input.order)) : 0;
  const dateLabel = typeof input.dateLabel === 'string' && input.dateLabel.trim() ? input.dateLabel.trim() : '想妳的時候';
  const sourceFile = typeof input.sourceFile === 'string' ? input.sourceFile.trim() : '';
  const sourceRelPath = typeof input.sourceRelPath === 'string' ? input.sourceRelPath.trim() : sourceFile;
  const preview = typeof input.preview === 'string' ? input.preview.trim() : '';
  const searchText = typeof input.searchText === 'string' ? input.searchText.trim() : `${title}\n${preview}\n${sourceFile}`;

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

function createFireflies(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: index,
    x: Math.random() * 100,
    y: Math.random() * 90 + 10,
    size: Math.random() * 4 + 2,
    moveDuration: Math.random() * 10 + 5,
    flickerDuration: Math.random() * 2 + 1,
    delay: Math.random() * 5,
  })) as Firefly[];
}

export function LightPathPage({ onExit, letterFontFamily = '' }: LightPathPageProps) {
  const [docs, setDocs] = useState<LightPathDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [contentById, setContentById] = useState<Record<string, string>>({});
  const [showOverlay, setShowOverlay] = useState(false);
  const [burstActive, setBurstActive] = useState(false);
  const [burstPoint, setBurstPoint] = useState({ x: 0, y: 0 });
  const [fontMode, setFontMode] = useState<FontMode>(() => loadFontMode());
  const [showFontPanel, setShowFontPanel] = useState(false);
  const [showList, setShowList] = useState(false);
  const [listMode, setListMode] = useState<ListMode>('all');
  const [listQuery, setListQuery] = useState('');
  const [favoriteIds, setFavoriteIds] = useState<Record<string, true>>(() => loadFavoriteIds());
  const [contentFontSize, setContentFontSize] = useState(() => loadNumberPreference(FONT_SIZE_KEY, 15, 22, 17));
  const [contentLineHeight, setContentLineHeight] = useState(() =>
    loadNumberPreference(LINE_HEIGHT_KEY, 1.6, 2.3, 1.95),
  );

  const fireflies = useMemo(() => createFireflies(40), []);
  const rotationQueueRef = useRef<string[]>([]);
  const openDelayRef = useRef<number | null>(null);
  const closeBurstRef = useRef<number | null>(null);
  const redrawReopenRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(INDEX_URL, { cache: 'no-store' });
        if (!response.ok) throw new Error(`讀取失敗：${response.status}`);
        const raw = (await response.json()) as LightPathIndexPayload;
        const items = Array.isArray(raw.docs) ? raw.docs : [];
        const normalized = items
          .map((item) => normalizeDoc(item))
          .filter((item): item is LightPathDoc => Boolean(item))
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
    rotationQueueRef.current = [];
  }, [docs]);

  useEffect(() => {
    if (!activeId) return;
    if (contentById[activeId] !== undefined) return;

    const doc = docs.find((item) => item.id === activeId);
    if (!doc) return;

    void (async () => {
      try {
        const response = await fetch(`${BASE}data/light-path/${doc.contentPath}`, { cache: 'no-store' });
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
    return () => {
      if (openDelayRef.current !== null) {
        window.clearTimeout(openDelayRef.current);
      }
      if (closeBurstRef.current !== null) {
        window.clearTimeout(closeBurstRef.current);
      }
      if (redrawReopenRef.current !== null) {
        window.clearTimeout(redrawReopenRef.current);
      }
    };
  }, []);

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
    saveFavoriteIds(favoriteIds);
  }, [favoriteIds]);

  const activeDoc = useMemo(() => docs.find((item) => item.id === activeId) ?? null, [docs, activeId]);
  const activeContent = activeDoc ? contentById[activeDoc.id] ?? '讀取內容中…' : '';
  const activeIsFavorite = activeDoc ? Boolean(favoriteIds[activeDoc.id]) : false;
  const favoriteCount = useMemo(() => docs.reduce((count, doc) => count + (favoriteIds[doc.id] ? 1 : 0), 0), [docs, favoriteIds]);
  const followLetterFont = fontMode === 'letter' && Boolean(letterFontFamily);
  const contentFontFamily = followLetterFont
    ? letterFontFamily
    : "var(--app-font-family, -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif)";
  const normalizedListQuery = listQuery.trim().toLowerCase();
  const listDocs = useMemo(() => {
    return docs.filter((doc) => {
      if (listMode === 'favorites' && !favoriteIds[doc.id]) return false;
      if (!normalizedListQuery) return true;
      const haystack = `${doc.title}\n${doc.dateLabel}\n${doc.searchText}`.toLowerCase();
      return haystack.includes(normalizedListQuery);
    });
  }, [docs, favoriteIds, listMode, normalizedListQuery]);

  function nextDocId() {
    if (!docs.length) return null;

    if (!rotationQueueRef.current.length) {
      rotationQueueRef.current = shuffle(docs.map((doc) => doc.id));
    }

    const nextId = rotationQueueRef.current.pop() ?? null;
    return nextId;
  }

  function nextRandomPoint() {
    const width = typeof window !== 'undefined' ? window.innerWidth : 390;
    const height = typeof window !== 'undefined' ? window.innerHeight : 844;
    const side = Math.floor(Math.random() * 4);
    const randomX = Math.random() * width;
    const randomY = Math.random() * height;
    const edgeBandX = Math.max(28, Math.round(width * 0.1));
    const edgeBandY = Math.max(28, Math.round(height * 0.1));
    if (side === 0) return { x: randomX, y: Math.random() * edgeBandY };
    if (side === 1) return { x: width - Math.random() * edgeBandX, y: randomY };
    if (side === 2) return { x: randomX, y: height - Math.random() * edgeBandY };
    return { x: Math.random() * edgeBandX, y: randomY };
  }

  function clearCloseBurstTimer() {
    if (closeBurstRef.current === null) return;
    window.clearTimeout(closeBurstRef.current);
    closeBurstRef.current = null;
  }

  function clearRedrawReopenTimer() {
    if (redrawReopenRef.current === null) return;
    window.clearTimeout(redrawReopenRef.current);
    redrawReopenRef.current = null;
  }

  function openBurst(x: number, y: number) {
    setBurstPoint({ x, y });
    setBurstActive(true);
  }

  function openDocById(id: string, x: number, y: number) {
    clearRedrawReopenTimer();
    clearCloseBurstTimer();
    openBurst(x, y);
    setActiveId(id);
    setShowList(false);
    setShowFontPanel(false);

    if (openDelayRef.current !== null) {
      window.clearTimeout(openDelayRef.current);
      openDelayRef.current = null;
    }

    openDelayRef.current = window.setTimeout(() => {
      setShowOverlay(true);
      openDelayRef.current = null;
    }, OPEN_OVERLAY_DELAY_MS);
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

  function openLetter(event: ReactMouseEvent<HTMLButtonElement>, fromFirefly: Firefly) {
    if (!docs.length) return;

    const nextId = nextDocId();
    if (!nextId) return;

    openDocById(nextId, event.clientX, event.clientY);

    // Keep TS from warning about unused variable if future behaviors remove it.
    void fromFirefly;
  }

  function openFromList(event: ReactMouseEvent<HTMLButtonElement>, docId: string) {
    const rect = event.currentTarget.getBoundingClientRect();
    openDocById(docId, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  function drawAnother(event: ReactMouseEvent<HTMLButtonElement>) {
    const nextId = nextDocId();
    if (!nextId) return;
    clearRedrawReopenTimer();
    clearCloseBurstTimer();
    if (openDelayRef.current !== null) {
      window.clearTimeout(openDelayRef.current);
      openDelayRef.current = null;
    }
    const randomPoint = nextRandomPoint();
    setShowOverlay(false);
    setShowFontPanel(false);
    closeBurstRef.current = window.setTimeout(() => {
      setBurstActive(false);
      closeBurstRef.current = null;
    }, CLOSE_BURST_DELAY_MS);
    redrawReopenRef.current = window.setTimeout(() => {
      openDocById(nextId, randomPoint.x, randomPoint.y);
      redrawReopenRef.current = null;
    }, REDRAW_REOPEN_DELAY_MS);
    void event;
  }

  function closeLetter() {
    clearRedrawReopenTimer();
    clearCloseBurstTimer();
    if (openDelayRef.current !== null) {
      window.clearTimeout(openDelayRef.current);
      openDelayRef.current = null;
    }
    setShowOverlay(false);
    setShowFontPanel(false);
    closeBurstRef.current = window.setTimeout(() => {
      setBurstActive(false);
      closeBurstRef.current = null;
    }, CLOSE_BURST_DELAY_MS);
  }

  const totalText = docs.length ? `${docs.length} 封` : '--';

  return (
    <div
      className="light-path-page"
      style={{ '--light-path-letter-font-family': letterFontFamily ? `'${letterFontFamily}', sans-serif` : '' } as CSSProperties}
    >
      {!showOverlay ? (
        <button type="button" className="lp-exit-btn" onClick={onExit} aria-label="返回">
          ‹
        </button>
      ) : null}
      <div className="lp-total">留光池：{totalText}</div>
      {!showOverlay ? (
        <button type="button" className="lp-list-open-btn" onClick={() => setShowList(true)}>
          清單 · 收藏
        </button>
      ) : null}

      <div className="lp-hint-text">迷路的時候，試著抓住一道光</div>

      <div className="lp-forest" aria-hidden={showOverlay}>
        {fireflies.map((firefly) => (
          <button
            key={firefly.id}
            type="button"
            className="lp-firefly"
            style={
              {
                '--move-duration': `${firefly.moveDuration}s`,
                '--flicker-duration': `${firefly.flickerDuration}s`,
                animationDelay: `${firefly.delay}s`,
                left: `${firefly.x}vw`,
                top: `${firefly.y}vh`,
                width: `${firefly.size}px`,
                height: `${firefly.size}px`,
              } as CSSProperties
            }
            onClick={(event) => openLetter(event, firefly)}
            aria-label="抓住一道光"
          />
        ))}
      </div>

      <div className={`lp-light-burst ${burstActive ? 'active' : ''}`} style={{ left: burstPoint.x, top: burstPoint.y }} />

      <div className={`lp-list-overlay ${showList ? 'show' : ''}`} onClick={() => setShowList(false)}>
        <div className="lp-list-panel" onClick={(event) => event.stopPropagation()}>
          <div className="lp-list-head">
            <p className="lp-list-title">留光清單</p>
            <button type="button" className="lp-list-close-btn" onClick={() => setShowList(false)}>
              關閉
            </button>
          </div>
          <div className="lp-list-meta">
            <span>全部 {docs.length}</span>
            <span>收藏 {favoriteCount}</span>
          </div>
          <div className="lp-list-filters">
            <button
              type="button"
              className={`lp-list-filter-btn ${listMode === 'all' ? 'active' : ''}`}
              onClick={() => setListMode('all')}
            >
              全部
            </button>
            <button
              type="button"
              className={`lp-list-filter-btn ${listMode === 'favorites' ? 'active' : ''}`}
              onClick={() => setListMode('favorites')}
            >
              收藏
            </button>
          </div>
          <input
            className="lp-list-search"
            value={listQuery}
            onChange={(event) => setListQuery(event.target.value)}
            placeholder="搜尋標題或內容"
          />
          <div className="lp-list-items">
            {listDocs.map((doc) => (
              <div className="lp-list-item" key={doc.id}>
                <button type="button" className="lp-list-item-main" onClick={(event) => openFromList(event, doc.id)}>
                  <span className="lp-list-item-title">{doc.title}</span>
                  <span className="lp-list-item-date">{doc.dateLabel}</span>
                </button>
                <button
                  type="button"
                  className={`lp-list-fav-btn ${favoriteIds[doc.id] ? 'active' : ''}`}
                  onClick={() => toggleFavorite(doc.id)}
                  aria-label={favoriteIds[doc.id] ? '取消收藏' : '加入收藏'}
                >
                  {favoriteIds[doc.id] ? '📌' : '📍'}
                </button>
              </div>
            ))}
            {!listDocs.length ? <p className="lp-list-empty">目前沒有符合條件的信件</p> : null}
          </div>
        </div>
      </div>

      <div className={`lp-overlay ${showOverlay ? 'show' : ''}`}>
        <div className="lp-card">
          <div className="lp-card-tools">
            {activeDoc ? (
              <button
                type="button"
                className={`lp-card-tool-btn ${activeIsFavorite ? 'is-active' : ''}`}
                onClick={() => toggleFavorite(activeDoc.id)}
                aria-label={activeIsFavorite ? '取消收藏' : '加入收藏'}
              >
                {activeIsFavorite ? '📌' : '📍'}
              </button>
            ) : null}
            <button
              type="button"
              className="lp-card-tool-btn"
              onClick={() => setShowFontPanel((prev) => !prev)}
              aria-label="切換字體來源"
            >
              Aa
            </button>
          </div>
          {showFontPanel ? (
            <div className="lp-font-panel">
              <p className="lp-font-title">字體來源</p>
              <div className="lp-font-row">
                <button
                  type="button"
                  className={`lp-font-mode-btn ${fontMode === 'default' ? 'active' : ''}`}
                  onClick={() => setFontMode('default')}
                >
                  預設
                </button>
                <button
                  type="button"
                  className={`lp-font-mode-btn ${fontMode === 'letter' ? 'active' : ''}`}
                  onClick={() => setFontMode('letter')}
                >
                  跟隨篝火
                </button>
              </div>
              <div className="lp-font-control">
                <div className="lp-font-control-head">
                  <p className="lp-font-title">字級</p>
                  <p className="lp-font-value">{contentFontSize.toFixed(1)}px</p>
                </div>
                <input
                  type="range"
                  min={15}
                  max={22}
                  step={0.5}
                  value={contentFontSize}
                  onChange={(event) => setContentFontSize(clampNumber(Number(event.target.value), 15, 22, contentFontSize))}
                  className="lp-font-slider"
                />
              </div>
              <div className="lp-font-control">
                <div className="lp-font-control-head">
                  <p className="lp-font-title">行距</p>
                  <p className="lp-font-value">{contentLineHeight.toFixed(2)}</p>
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
                  className="lp-font-slider"
                />
              </div>
            </div>
          ) : null}
          <div className="lp-card-head">
            <p className="lp-card-title">{activeDoc?.title ?? '留光給妳的路'}</p>
            <p className="lp-card-date">{activeDoc?.dateLabel ?? '想妳的時候'}</p>
          </div>

          <div
            className="lp-card-content"
            style={{ fontFamily: contentFontFamily, fontSize: `${contentFontSize}px`, lineHeight: contentLineHeight }}
          >
            {activeContent}
          </div>

          <div className="lp-card-actions">
            <button type="button" className="lp-close-btn" onClick={closeLetter}>
              收下這道光
            </button>
            <button type="button" className="lp-close-btn lp-draw-btn" onClick={drawAnother}>
              再抽一次
            </button>
          </div>
        </div>
      </div>

      {loading ? <div className="lp-status">讀取中…</div> : null}
      {!loading && error ? <div className="lp-status">讀取失敗：{error}</div> : null}
      {!loading && !error && !docs.length ? <div className="lp-status">目前沒有可抽取的信件</div> : null}
    </div>
  );
}

export default LightPathPage;
